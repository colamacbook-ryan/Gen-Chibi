/* gen-chibi — lối vào xuất video cho Studio (v0.22). © 2026 Gen Labs — All rights reserved.
 *
 * Studio nạp tệp này (nhỏ, không vá gì của trang). Nó tạo iframe ẨN studio/video-export.html — nơi duy nhất có đồng hồ ảo + bộ ghép (CNS-228) —
 * gửi payload qua postMessage (kiểm origin + source hai chiều, CNS-214) và nhận lại tệp. Không có nút / giao diện ở đây (P3).
 *
 *   GCVideo.probe({ quality, aspect }) → Promise<{ ok, code?, reason?, format? }>   dò năng lực THẬT theo thứ tự (CNS-223):
 *       secureContext → WebCodecs → codec (MP4 avc1 + mp4a trước, rồi WebM vp09 + opus) → vẽ foreignObject không làm bẩn canvas
 *   GCVideo.exportWork(W, opts, onProgress) → Promise<{ files: [{ kind, name, type, blob, bytes }], format, durationMs, stats }>  (+ .cancel())
 *       W = tác phẩm của Studio; payload lấy từ filmPayload(W) (app.js đăng ký GCVideo.studio — CÙNG nguồn với phim HTML, CNS-219)
 *       opts: { quality '1080p'|'720p', aspect '16:9'|'9:16', shots [chỉ số], voices (kết quả filmVoices đã hỏi), missingVoice 'silent'|'blip',
 *               handle (FileSystemFileHandle — chọn lúc bấm, CNS-226), format (bỏ qua dò), maxSec, debug, probe, seed, dryEstimate (giây — test lối dò lại) }
 *       onProgress({ phase: 'prepare'|'render', frame, frames, shot, shots })
 *   GCVideo.exportPayload(payload, opts, onProgress) → như trên, nhận payload sẵn (job CI, test)
 *   GCVideo.limits(format, quality) → giây tối đa (MP4 giữ cả tệp trong bộ nhớ: 5 phút @1080p, 10 phút @720p; WebM ghi luồng: 30 phút)
 *   Lỗi: Error có .code: insecure · no-webcodecs · no-codec · tainted · too-long · cancelled · load · encode · payload · empty · internal
 */
(function () {
  'use strict';
  var GC = window.GenChibi;
  function _t(s, v) { var I = GC && GC.i18n; return I ? I.t(s, v) : String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); }
  var me = document.currentScript && document.currentScript.src;
  var PAGE = me ? new URL('../video-export.html', me).href : new URL('studio/video-export.html', location.href).href;
  var ORIGIN = location.origin;
  var GCV = window.GCVideo = window.GCVideo || {};

  // câu báo theo đúng nguyên nhân (P3 hiện cạnh nút bị khoá)
  var REASON = {
    insecure: function () { return _t('Mở Studio qua https hoặc localhost để xuất video.'); },
    'no-webcodecs': function () { return _t('Trình duyệt này chưa mã hoá được video — dùng Chrome hoặc Edge trên máy tính.'); },
    'no-codec': function () { return _t('Trình duyệt này không có bộ mã hoá MP4 (H.264 + AAC) hay WebM (VP9 + Opus) — dùng Chrome hoặc Edge trên máy tính.'); },
    tainted: function () { return _t('Trình duyệt này không cho chụp khung hình phim — dùng Chrome hoặc Edge trên máy tính.'); },
    'too-long': function (x) { return _t('Phim dài quá {n} giây cho định dạng này — chọn 720p hoặc xuất ít phân cảnh hơn.', { n: x }); },
    cancelled: function () { return _t('Đã huỷ xuất video.'); },
    load: function () { return _t('Không mở được trang xuất video — cập nhật gen-chibi hoặc mở Studio đúng địa chỉ máy chủ.'); }
  };
  function err(code, extra) { var e = new Error((REASON[code] ? REASON[code](extra) : _t('Xuất video lỗi: {x}', { x: extra || code }))); e.code = code; return e; }

  function dims(o) { var v = o && o.aspect === '9:16', hd = !o || o.quality !== '720p'; return { w: v ? (hd ? 1080 : 720) : (hd ? 1920 : 1280), h: v ? (hd ? 1920 : 1280) : (hd ? 1080 : 720) }; }
  GCV.limits = function (format, quality) { return format && format.container === 'mp4' ? (quality === '720p' ? 600 : 300) : 1800; };

  GCV.probe = async function (o) {
    o = o || {};
    if (!window.isSecureContext) return { ok: false, code: 'insecure', reason: REASON.insecure() };
    if (typeof VideoEncoder !== 'function' || typeof AudioEncoder !== 'function' || typeof VideoFrame !== 'function' || typeof OfflineAudioContext !== 'function' || typeof AudioWorkletNode !== 'function' || typeof OffscreenCanvas !== 'function')
      return { ok: false, code: 'no-webcodecs', reason: REASON['no-webcodecs']() };
    var d = dims(o), hd = d.w * d.h > 1280 * 720;
    async function vOK(codec, avc) { try { var c = { codec: codec, width: d.w, height: d.h, bitrate: hd ? 8e6 : 5e6, framerate: 30 }; if (avc) c.avc = { format: 'avc' }; return (await VideoEncoder.isConfigSupported(c)).supported === true; } catch (e) { return false; } }
    async function aOK(codec) { try { return (await AudioEncoder.isConfigSupported({ codec: codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 })).supported === true; } catch (e) { return false; } }
    var format = null, avcs = hd ? ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'] : ['avc1.64001f', 'avc1.4d001f', 'avc1.42e01f'];
    if (await aOK('mp4a.40.2')) for (var i = 0; i < avcs.length && !format; i++) if (await vOK(avcs[i], true)) format = { container: 'mp4', video: { codec: avcs[i], bitrate: hd ? 8e6 : 5e6 }, audio: { codec: 'mp4a.40.2', bitrate: 160000 } };
    if (!format) { var vp9 = hd ? 'vp09.00.40.08' : 'vp09.00.31.08'; if (await vOK(vp9) && await aOK('opus')) format = { container: 'webm', video: { codec: vp9, bitrate: hd ? 8e6 : 5e6 }, audio: { codec: 'opus', bitrate: 160000 } }; }
    if (!format) return { ok: false, code: 'no-codec', reason: REASON['no-codec']() };
    // foreignObject (data: URL) → canvas → VideoFrame: Safari / trình duyệt khác có thể coi là "bẩn" → lỗi giữa chừng; dò trước bằng một khung 8×8
    try {
      var img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><foreignObject width="8" height="8"><div xmlns="http://www.w3.org/1999/xhtml" style="width:8px;height:8px;background:red"></div></foreignObject></svg>');
      await img.decode();
      var cv = new OffscreenCanvas(8, 8); cv.getContext('2d').drawImage(img, 0, 0); new VideoFrame(cv, { timestamp: 0 }).close();
    } catch (e) { return { ok: false, code: 'tainted', reason: REASON.tainted() }; }
    format.limitSec = GCV.limits(format, o.quality);
    return { ok: true, format: format };
  };

  // một lượt trong một iframe mới (engine giữ AudioContext suốt đời trang → mỗi lượt một trang sạch)
  function pass(payload, opts, onMsg, ctl) {
    return new Promise(function (resolve, reject) {
      var d = dims(opts), f = document.createElement('iframe'), win = null, settled = false;
      f.src = PAGE; f.title = 'gen-chibi video export'; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true'); f.setAttribute('data-gc-video', opts.pass);
      var sh = Math.round(d.w * 9 / 16);   // sân khấu luôn 16:9 theo chiều ngang của khung ra (9:16 = phim ngang đặt giữa khung dọc, Q37 a)
      f.style.cssText = 'position:fixed;left:-30000px;top:0;width:' + d.w + 'px;height:' + Math.max(sh, 1) + 'px;border:0;pointer-events:none;background:#121214';
      // trang xuất không lên tiếng trong 20 s (bị chặn nhúng, tệp thiếu, lỗi nạp) → báo lỗi thay vì chờ mãi
      var loadT = setTimeout(function () { done(reject, err('load')); }, 20000);
      function done(fn, x) { if (settled) return; settled = true; clearTimeout(loadT); window.removeEventListener('message', on); ctl.frame = null; if (f.parentNode) f.parentNode.removeChild(f); fn(x); }
      function on(e) {
        if (e.source !== win || e.origin !== ORIGIN) return;   // chỉ đúng iframe của mình, cùng nguồn
        var m = e.data || {};
        if (m.type === 'gc-video-ready') { clearTimeout(loadT); if (ctl.cancelled) { done(reject, err('cancelled')); return; } win.postMessage({ type: 'gc-video-start', payload: payload, opts: opts }, ORIGIN); }
        else if (m.type === 'gc-video-done') done(resolve, m);
        else if (m.type === 'gc-video-error') done(reject, err(m.code, m.message));   // too-long: message = số giây trần
        else if (m.type === 'gc-video-cancelled') { var x = err('cancelled'); x.encoders = m.encoders; done(reject, x); }
        else if (m.type === 'gc-video-probe') { if (onMsg) Promise.resolve(onMsg(m)).then(function () { win.postMessage({ type: 'gc-video-probe-ack' }, ORIGIN); }); else win.postMessage({ type: 'gc-video-probe-ack' }, ORIGIN); }
        else if (onMsg) onMsg(m);
      }
      window.addEventListener('message', on);
      document.body.appendChild(f);
      win = f.contentWindow;
      ctl.frame = f;
      ctl.kill = function () {   // Huỷ: báo trang xuất đóng bộ mã hoá; trang không trả lời trong 3 s thì gỡ iframe luôn (giải phóng mọi thứ)
        if (settled) return;
        win.postMessage({ type: 'gc-video-cancel' }, ORIGIN);
        setTimeout(function () { done(reject, err('cancelled')); }, 3000);
      };
    });
  }

  GCV.exportPayload = function (payload, opts, onProgress) {
    opts = Object.assign({ quality: '1080p', aspect: '16:9', fps: 30, missingVoice: 'silent' }, opts || {});
    var ctl = { cancelled: false, frame: null, kill: null };
    var prog = function (m) { if (m.type === 'gc-video-progress' && onProgress) { try { onProgress({ phase: m.phase === 'dry' ? 'prepare' : 'render', frame: m.frame, frames: m.frames, shot: m.shot, shots: m.shots }); } catch (e) { /* lỗi của người gọi */ } } else if (m.type === 'gc-video-probe' && opts.onProbe) return opts.onProbe(m); };
    var p = (async function () {
      var format = opts.format;
      if (!format) { var pr = await GCV.probe(opts); if (!pr.ok) throw err(pr.code); format = pr.format; }
      var maxSec = opts.maxSec || GCV.limits(format, opts.quality), common = { format: format, aspect: opts.aspect, quality: opts.quality, fps: opts.fps, shots: opts.shots, missingVoice: opts.missingVoice, seed: opts.seed, maxSec: maxSec, debug: opts.debug };
      var t0 = performance.now();
      // lượt dò: tiếng 48 kHz theo độ dài ƯỚC (30 s / phân cảnh + 30 s, ≤ trần) để không cấp bộ đệm cỡ trần cho phim ngắn; phim dài hơn ước → dò lại theo trần
      var nShots = opts.shots && opts.shots.length || (payload.film && payload.film.shots.length) || 1, est = Math.min(maxSec, opts.dryEstimate || 30 * nShots + 30), dry;
      try { dry = await pass(payload, Object.assign({ pass: 'dry', sec: est }, common), prog, ctl); }
      catch (e) { if (e.code !== 'dry-short' || est >= maxSec) throw e; dry = await pass(payload, Object.assign({ pass: 'dry', sec: maxSec }, common), prog, ctl); }
      if (ctl.cancelled) throw err('cancelled');
      var r = await pass(payload, Object.assign({ pass: 'render', sec: dry.durationMs / 1000, frames: dry.frames, handle: opts.handle, probe: opts.probe }, common), prog, ctl);
      var title = (payload.film && payload.film.title) || 'video', slug = (GCV.studio && GCV.studio.slug ? GCV.studio.slug(title) : GCVTextSlug(title)) || 'video';
      // mô tả .txt: tiêu đề + mô tả phim + dòng ghi công (Q47) — chữ hệ thống theo ngôn ngữ giao diện lúc xuất, như chữ trên khung hình (CNS-224)
      var txt = [String(title).trim(), String((payload.film && payload.film.logline) || '').trim(), _t('Làm bằng gen-chibi · Gen Labs')].filter(Boolean).join('\n\n') + '\n';
      r.files.push({ kind: 'txt', type: 'text/plain', ext: 'txt', blob: new Blob([txt], { type: 'text/plain;charset=utf-8' }) });
      r.files.forEach(function (x) { x.name = slug + '.' + x.ext; });
      r.dry = { frames: dry.frames, durationMs: dry.durationMs, stats: dry.stats };
      r.wallMs = performance.now() - t0;
      return r;
    })();
    p.cancel = function () { ctl.cancelled = true; if (ctl.kill) ctl.kill(); };
    GCV.current = p;
    return p;
  };
  function GCVTextSlug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }

  GCV.exportWork = function (W, opts, onProgress) {
    opts = opts || {};
    if (!GCV.studio || typeof GCV.studio.payload !== 'function') return Promise.reject(err('payload', 'Studio chưa đăng ký filmPayload'));
    var inner = null, cancelled = false;
    var p = GCV.studio.payload(W, opts.voices).then(function (payload) {
      if (cancelled) throw err('cancelled');
      inner = GCV.exportPayload(payload, opts, onProgress);
      return inner;
    });
    p.cancel = function () { cancelled = true; if (inner) inner.cancel(); };
    GCV.current = p;
    return p;
  };
})();
