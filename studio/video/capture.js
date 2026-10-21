/* gen-chibi — trang xuất video (v0.22): dựng phim TỪNG KHUNG trên đồng hồ ảo, mã hoá bằng WebCodecs, ghép MP4 / WebM. © 2026 Gen Labs — All rights reserved.
 *
 * Chạy trong iframe ẩn studio/video-export.html (cùng nguồn với Studio). Cần studio/video/vclock.js nạp TRƯỚC (đồng hồ ảo), mux.js, text.js.
 * Giao tiếp CHỈ qua postMessage với cửa sổ cha, kiểm origin + source hai chiều (CNS-214):
 *   cha → trang:  { type: 'gc-video-start', payload, opts }   payload = filmPayload(W) của Studio (CNS-219) · opts xem run()
 *                 { type: 'gc-video-cancel' } · { type: 'gc-video-probe-ack' } (chỉ test)
 *   trang → cha:  gc-video-ready · gc-video-progress { phase, frame, frames, shot, shots } · gc-video-done { … } · gc-video-error { code, message }
 *                 gc-video-cancelled { encoders } · gc-video-probe { frame, t, png } (chỉ khi opts.probe)
 * Hai lượt (client.js điều phối, mỗi lượt một iframe mới — engine giữ AudioContext suốt đời trang):
 *   'dry'    : chạy timeline trên đồng hồ ảo (không chụp, không mã hoá; tiếng 48 kHz mono như lượt dựng để timeline y hệt) → độ dài phim, số khung,
 *              mốc phân cảnh; kiểm trần độ dài trước lượt đắt
 *   'render' : timeline + tiếng 48 kHz khoá bước (OfflineAudioContext suspend/resume, vòi AudioWorklet) + chụp DOM sân khấu → SVG foreignObject
 *              (data: URL — blob: / createImageBitmap làm bẩn canvas) → canvas → VideoEncoder; tiếng → AudioEncoder; ghép bằng GenMux
 * Ngân sách (L-42, CNS-221): mỗi khung nhả luồng chính bằng MessageChannel (không setTimeout — tab ẩn bị bóp); hàng đợi bộ mã hoá ≤ 4 khung;
 * WebM ghi luồng (≤ 1 cluster trong bộ nhớ, phần đã xong gom thành Blob); MP4 giữ cả tệp (trần độ dài do client đặt theo chất lượng).
 */
(function () {
  'use strict';
  var VC = window.GCVClock;
  if (!VC) return;   // không có đồng hồ ảo (không phải trang xuất) → không làm gì
  var R = VC.real, ORIGIN = location.origin, PARENT = window.parent;
  var SRC_RE = /^(engine|kinds)\/[A-Za-z0-9._\/-]+\.js$/;
  function post(m, transfer) { PARENT.postMessage(m, ORIGIN, transfer || []); }
  function fail(code, message) { var e = new Error(message || code); e.code = code; return e; }

  var job = null, cancelled = false, ackWait = null;
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || e.source !== PARENT) return;   // chỉ cửa sổ cha cùng nguồn
    var m = e.data || {};
    if (m.type === 'gc-video-start' && !job) {
      job = run(m.payload || {}, m.opts || {}).then(function (res) { post(res); }, function (err) {
        if (cancelled) post({ type: 'gc-video-cancelled', encoders: closeAll() });
        else { closeAll(); post({ type: 'gc-video-error', code: err && err.code || 'internal', message: String(err && err.message || err) }); }
      });
    } else if (m.type === 'gc-video-cancel') {
      cancelled = true;
      if (!job) post({ type: 'gc-video-cancelled', encoders: closeAll() });
    } else if (m.type === 'gc-video-probe-ack' && ackWait) { var f = ackWait; ackWait = null; f(); }
  });
  function ready() { post({ type: 'gc-video-ready' }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

  /* ---------------------------------------------------------------- nạp engine như phim HTML (danh sách srcs của Studio) */
  function loadScripts(srcs) {
    return srcs.reduce(function (p, s) {
      return p.then(function () {
        return new Promise(function (ok, no) {
          var el = document.createElement('script'); el.src = '../' + s; el.async = false;
          el.onload = ok; el.onerror = function () { no(fail('load', 'không nạp được ' + s)); };
          document.head.appendChild(el);
        });
      });
    }, Promise.resolve());
  }
  // đăng ký asset như FILM_BOOT, CÙNG thứ tự — nhưng cắt thành nhiều tác vụ (~20 ms mỗi tác vụ): Tam Quốc ~60–100 ms một mạch (sanitizeSvg từng nhân vật)
  async function boot(P) {
    var GC = window.GenChibi, D = P.data, I = GC.i18n, jobs = [];
    // chữ trên khung hình: CÙNG luật với exportFilm — ngôn ngữ giao diện lúc xuất + bảng player / engine nhúng kèm (CNS-224)
    if (I && P.ui) { if (P.dict) I.add(P.ui, P.dict); I.setLang(P.ui); }
    GC.pack({ id: 'local.my', name: 'local', owner: 'local', group: 'mine', license: 'local' }, function () {});
    (D.parts || []).forEach(function (p) { jobs.push(function () { GC.registerDataPart('local.my', p); }); });
    (D.items || []).forEach(function (x) { jobs.push(function () { GC.registerItem('local.my', x); }); });
    (D.scenes || []).forEach(function (x) { jobs.push(function () { GC.registerScene('local.my', x); }); });
    (D.characters || []).forEach(function (a) { jobs.push(function () { GC.registerAsset(a.pack, a); }); });
    (D.soundPacks || []).forEach(function (p) { jobs.push(function () { if (GC.sounds) GC.sounds.registerPack(p); }); });   // gói âm TRƯỚC gói động tác (như FILM_BOOT)
    (D.motionPacks || []).forEach(function (m) { jobs.push(function () { if (GC.choreo) GC.choreo.registerPack('local.my', m); }); });
    var t0 = R.now();
    for (var i = 0; i < jobs.length; i++) { jobs[i](); if (R.now() - t0 > 20) { await VC.yieldReal(); t0 = R.now(); } }
    return GC;
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------------------------------------------------------------- chụp sân khấu: DOM → SVG foreignObject đứng yên
   * Ngân sách luồng chính (spec §3: long task ≤ 100 ms — CNS-221): CSS của trang (gồm phông Be Vietnam Pro nhúng, ~67 KB) chỉ thoát XML + mã hoá URL
   * MỘT lần cho cả lượt (đầu / đuôi data: URL đóng sẵn); mỗi khung chỉ mã hoá phần DOM. Không cloneNode cả sân khấu mỗi khung (hàng nghìn nút DOM rác
   * mỗi khung → GC lớn của Oilpan dừng luồng ~80 ms): giá trị đang chuyển động chép TẠM vào style của chính phần tử sống, tuần tự hoá, rồi trả style cũ. */
  var CSS = null, PRE = null;
  function allCSS() {
    if (CSS === null) CSS = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n') + '\n*{animation:none!important;transition:none!important}';
    return CSS;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  // đầu + đuôi của data: URL cho khung W×H — mã hoá sẵn một lần (urlText theo từng ký tự: nối phần đã mã hoá với nhau vẫn đúng)
  function frameShell(W, H) {
    if (!PRE || PRE.w !== W || PRE.h !== H) {
      var head = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' +
        '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + esc(allCSS()) + '</style>';
      PRE = { w: W, h: H, head: 'data:image/svg+xml;charset=utf-8,' + urlText(head), tail: urlText('</div></div></foreignObject></svg>'), bytes: head.length + 40 };
    }
    return PRE;
  }
  // mã hoá TỐI THIỂU cho data: URL (thay encodeURIComponent cả chuỗi), MỘT lượt: % # \t \n \r (bộ phân tích URL bỏ ký tự trắng điều khiển, # mở fragment) và
  // ký tự ngoài ASCII → %XX UTF-8 (như encodeURIComponent). Chuỗi mỗi khung luôn là chuỗi 1 byte/ký tự (chữ Việt trong bong bóng không biến cả chuỗi
  // ~180 nghìn ký tự thành 2 byte/ký tự) và ngắn hơn → ít rác ở vùng đối tượng lớn của heap → ít lần GC toàn phần dừng luồng (~25–45 ms mỗi lần, spec §3)
  var URL_RE = /[%#\t\n\r]|[^\x00-\x7F]+/g;
  function urlChar(c) { return c === '%' ? '%25' : c === '#' ? '%23' : c === '\t' ? '%09' : c === '\n' ? '%0A' : c === '\r' ? '%0D' : encOK(c); }
  function encOK(c) { try { return encodeURIComponent(c); } catch (e) { return encodeURIComponent(c.replace(/[\uD800-\uDFFF]/g, '\uFFFD')); } }   // nửa cặp surrogate lạc
  function urlText(s) { return s.replace(URL_RE, urlChar); }
  var XS = null;
  // → phần DOM của khung (chuỗi XHTML): sân khấu sống + giá trị đang chuyển động (transition / animation) chép thành style tĩnh
  function snapshot(box, W, H) {
    var props = new Map();
    document.getAnimations().forEach(function (a) {
      var e = a.effect, t = e && e.target; if (!t || e.pseudoElement || !box.contains(t)) return;
      var ks = props.get(t) || new Set();
      e.getKeyframes().forEach(function (k) { Object.keys(k).forEach(function (p) { if (['offset', 'easing', 'composite', 'computedOffset'].indexOf(p) < 0) ks.add(p); }); });
      props.set(t, ks);
    });
    // đọc HẾT giá trị trước (một lần tính style), rồi mới ghi — xen kẽ đọc / ghi bắt trình duyệt tính lại style nhiều lần
    var saved = [], vals = [];
    props.forEach(function (ks, el) {
      var cs = getComputedStyle(el), v = [];
      ks.forEach(function (p) { var css = p.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); v.push([css, cs.getPropertyValue(css)]); });
      vals.push([el, v]);
    });
    vals.forEach(function (x) { var el = x[0]; saved.push([el, el.getAttribute('style')]); x[1].forEach(function (pv) { el.style.setProperty(pv[0], pv[1]); }); });
    var body;
    try {
      XS = XS || new XMLSerializer();
      var inner = '', kids = box.childNodes;
      for (var i = 0; i < kids.length; i++) inner += XS.serializeToString(kids[i]);
      // gốc sân khấu: như bản sao cũ — bỏ id, giữ class + style, đặt cỡ khung
      var cls = box.getAttribute('class'), sty = (box.getAttribute('style') || '') + ';position:relative;left:0;top:0;width:' + W + 'px;height:' + H + 'px;overflow:hidden;border-radius:0';
      body = '<div' + (cls ? ' class="' + escAttr(cls) + '"' : '') + ' style="' + escAttr(sty) + '">' + inner;
    } finally {
      for (var j = saved.length - 1; j >= 0; j--) { if (saved[j][1] == null) saved[j][0].removeAttribute('style'); else saved[j][0].setAttribute('style', saved[j][1]); }
    }
    return body;
  }
  function svgImage(body, W, H) {
    var sh = frameShell(W, H), img = new Image();   // data: URL + HTMLImageElement: canvas vẫn sạch (spike taint.mjs)
    img.src = sh.head + urlText(body) + sh.tail;
    return img.decode().then(function () { return img; });
  }

  /* ---------------------------------------------------------------- tiếng: OfflineAudioContext khoá bước với đồng hồ ảo */
  async function lockstep(o) {
    var oac = new OfflineAudioContext({ numberOfChannels: 1, length: o.length, sampleRate: o.sr }), Q = 128 / o.sr, started = false, done = null, tap = null;
    var realResume = OfflineAudioContext.prototype.resume;
    if (o.tap) {
      await oac.audioWorklet.addModule('video/tap-worklet.js');
      tap = new AudioWorkletNode(oac, 'gc-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit', processorOptions: { end: o.length } });
      tap.connect(oac.destination);
      Object.defineProperty(oac, 'destination', { get: function () { return tap; } });   // engine nối chuỗi trộn vào vòi
    }
    Object.defineProperty(oac, 'state', { get: function () { return 'running'; } });   // engine chỉ phát khi ctx "running"
    oac.resume = function () { return Promise.resolve(); };                            // unlock() của engine: không đụng tới đồng hồ tiếng
    var sec = o.length / o.sr;
    return {
      ctx: oac, tap: tap, sec: sec,
      to: async function (s) {   // đưa đồng hồ tiếng tới s giây (làm tròn lên một lượng tử 128 mẫu)
        var q = Math.ceil(s / Q - 1e-9) * Q;
        if (q <= oac.currentTime + 1e-9 || q >= sec) return;
        var p = oac.suspend(q);
        if (!started) { started = true; done = oac.startRendering(); } else realResume.call(oac);
        await p;
      },
      finish: function () { if (!started) { started = true; done = oac.startRendering(); } else realResume.call(oac); return done; }
    };
  }

  /* ---------------------------------------------------------------- nơi ghi tệp: Blob parts (mặc định) hoặc FileSystemFileHandle (P3: chọn lúc bấm) */
  function blobSink(type) {
    var head = null, blobs = [], pend = [], pendN = 0, size = 0;
    function roll() { if (pend.length) { blobs.push(new Blob(pend)); pend = []; pendN = 0; } }   // gom phần đã xong thành Blob → JS heap không giữ
    return {
      write: function (b, pos) { if (pos === 0 && head) { head = b; return; } if (!head) { head = b; size += b.length; return; } pend.push(b); pendN += b.length; size += b.length; if (pendN > 8 << 20) roll(); },
      drain: function () { return Promise.resolve(); },
      close: function () { roll(); var out = new Blob([head || new Uint8Array(0)].concat(blobs), { type: type }); head = null; blobs = []; return Promise.resolve(out); },
      abort: function () { head = null; blobs = []; pend = []; return Promise.resolve(); },
      size: function () { return size; }
    };
  }
  async function fileSink(handle) {
    var ws = await handle.createWritable({ keepExistingData: false }), chain = Promise.resolve(), size = 0, err = null;
    function q(fn) { chain = chain.then(fn).catch(function (e) { err = err || e; }); }
    return {
      write: function (b, pos) { if (pos === 0 && size) q(function () { return ws.write({ type: 'write', position: 0, data: b }); }); else { size += b.length; q(function () { return ws.write(b); }); } },
      drain: async function () { await chain; if (err) throw err; },
      close: async function () { await chain; if (err) throw err; await ws.close(); return null; },
      abort: function () { return chain.then(function () { return ws.abort(); }).catch(function () {}); },
      size: function () { return size; }
    };
  }

  var live = { venc: null, aenc: null, sink: null, player: null };
  function closeAll() {
    var st = {};
    ['venc', 'aenc'].forEach(function (k) { var e = live[k]; if (e) { try { if (e.state !== 'closed') e.close(); } catch (x) { /* đã đóng */ } st[k] = e.state; } else st[k] = 'none'; });
    if (live.sink) { live.sink.abort(); live.sink = null; }
    if (live.player) { try { live.player.destroy(); } catch (x) { /* đã huỷ */ } live.player = null; }
    return st;
  }
  // description của decoderConfig: ArrayBuffer hoặc ArrayBufferView (kể cả DataView) → bản sao Uint8Array
  function bytesOf(d) { return d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); }
  function hex(b) { return Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  // độ trễ mồi THẬT của bộ mã hoá tiếng trên máy này (GenMux.sync): MỘT AudioEncoder riêng cùng cấu hình mã hoá tín hiệu hiệu chuẩn → AudioDecoder giải mã
  // → tương quan chéo với tín hiệu gốc. Kèm các gợi ý bộ mã hoá tự báo (description, ts / thời lượng gói đầu, mẫu ra so với mẫu vào) để CI in ra.
  async function calibrate(acfg) {
    var S = GenMux.sync, cal = S.calibSignal(48000), n = cal.pcm.length, chunks = [], cfg = null, info = { inFrames: n }, enc = null, dec = null;
    try {
      enc = new AudioEncoder({ output: function (c, m) {
        if (m && m.decoderConfig && !cfg) cfg = m.decoderConfig;
        var b = new Uint8Array(c.byteLength); c.copyTo(b); chunks.push({ data: b, ts: c.timestamp, dur: c.duration || 0, type: c.type });
      }, error: function (e) { info.error = info.error || String(e && e.message || e); } });
      enc.configure(acfg);
      var pl = new Float32Array(n * 2); pl.set(cal.pcm, 0); pl.set(cal.pcm, n);
      var ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: 0, data: pl });
      enc.encode(ad); ad.close(); await enc.flush(); enc.close(); enc = null;
      info.desc = cfg && cfg.description ? hex(bytesOf(cfg.description)) : null;
      info.first = chunks.slice(0, 6).map(function (c) { return { ts: c.ts, dur: c.dur, bytes: c.data.length }; });
      info.hints = S.hints(chunks, n, 48000);
      if (!cfg) throw new Error('bộ mã hoá không đưa decoderConfig');
      var outs = [], total = 0;
      dec = new AudioDecoder({ output: function (a) {
        var k = a.numberOfFrames, L = new Float32Array(k), Rt = new Float32Array(k);
        a.copyTo(L, { planeIndex: 0, format: 'f32-planar' }); if (a.numberOfChannels > 1) a.copyTo(Rt, { planeIndex: 1, format: 'f32-planar' }); else Rt = L;
        if (!outs.length) info.decFirstTs = a.timestamp;
        for (var i = 0; i < k; i++) L[i] = (L[i] + Rt[i]) / 2;
        outs.push(L); total += k; a.close();
      }, error: function (e) { info.error = info.error || String(e && e.message || e); } });
      dec.configure(cfg);
      chunks.forEach(function (c) { dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: c.ts, duration: c.dur || undefined, data: c.data })); });
      await dec.flush(); dec.close(); dec = null;
      var pcm = new Float32Array(total), p = 0; outs.forEach(function (x) { pcm.set(x, p); p += x.length; });
      info.decFrames = total;
      var m = S.delayOf(cal, pcm); info.delay = m.delay; info.score = Math.round(m.score * 1000) / 1000;
    } catch (e) {
      info.error = info.error || String(e && e.message || e);
      [enc, dec].forEach(function (x) { try { if (x && x.state !== 'closed') x.close(); } catch (y) { /* đã đóng */ } });
    }
    return info;
  }
  function untilDequeue(enc, max, errBox) {
    if (enc.encodeQueueSize <= max) return Promise.resolve();
    return new Promise(function (ok) {
      var f = function () { if (enc.encodeQueueSize <= max || errBox.e || enc.state === 'closed') { enc.removeEventListener('dequeue', f); ok(); } };
      enc.addEventListener('dequeue', f);
    });
  }

  /* ---------------------------------------------------------------- một lượt xuất
   * opts: pass 'dry'|'render' · format { container 'mp4'|'webm', video { codec, bitrate }, audio { codec, bitrate } } · aspect '16:9'|'9:16' · quality '1080p'|'720p'
   *       shots [chỉ số trong danh sách phân cảnh sẵn sàng] · fps 30 · sec (độ dài từ lượt dry — cỡ OfflineAudioContext) · maxSec (trần) · missingVoice 'silent'|'blip'
   *       handle (FileSystemFileHandle, tuỳ chọn) · seed · tailMs · probe [số khung] · debug (thu chữ trên khung + nhật ký say) */
  async function run(P, o) {
    var t00 = R.now(), marks = [], mark = function (n) { if (o.debug) marks.push([n, performance.timeOrigin + R.now()]); };
    mark('start');
    var fps = o.fps || 30, dry = o.pass === 'dry', vertical = o.aspect === '9:16', hd = o.quality !== '720p';
    var OW = vertical ? (hd ? 1080 : 720) : (hd ? 1920 : 1280), OH = vertical ? (hd ? 1920 : 1280) : (hd ? 1080 : 720);
    var SW = OW, SH = Math.round(SW * 9 / 16), SY = vertical ? Math.round((OH - SH) / 2) : 0;   // sân khấu 16:9 theo chiều ngang; 9:16 = đặt giữa khung dọc (Q37 a)
    // raster SVG theo dải ngang, mỗi dải một tác vụ (TQ 1080p một lần vẽ cả khung: tới ~110 ms luồng chính; 4 dải: ~20–35 ms mỗi dải — spec §3)
    var BANDS = SW * SH > 1280 * 720 ? 4 : SW * SH > 1080 * 608 ? 3 : 2;
    var srcs = P.srcs || [];
    if (!srcs.length || !srcs.every(function (s) { return SRC_RE.test(s) && s.indexOf('..') < 0; }) || srcs.indexOf('engine/player.js') < 0) throw fail('payload', 'payload.srcs không hợp lệ');
    if (!P.data || !P.film || !Array.isArray(P.film.shots)) throw fail('payload', 'payload thiếu data / film');
    await loadScripts(srcs); mark('scripts');
    await VC.yieldReal();
    var GC = await boot(P), A = GC.audio, D = P.data, FILM = P.film; mark('boot');
    await VC.yieldReal();   // nạp mã · đăng ký asset · dựng tiếng · dựng sân khấu: mỗi việc một tác vụ (long task ≤ 100 ms — CNS-221)
    var box = document.getElementById('stage');
    box.style.width = SW + 'px'; box.style.height = SH + 'px';
    if (document.fonts && document.fonts.load) await Promise.all(['500', '700', '800'].map(function (w) { return document.fonts.load(w + ' 16px "Be Vietnam Pro"', 'Aăâđêôơư'); })).catch(function () {});
    mark('fonts');
    Math.random = mulberry(o.seed || 7);
    // tiếng
    // CẢ HAI lượt 48 kHz (mono ở đích): engine/audio.js dùng Math.random (đã gieo hạt) để lấp bộ đệm nhiễu / vang THEO ctx.sampleRate và lập lịch nhạc theo
    // lượng tử của ctx.currentTime — khác tần số mẫu là dãy ngẫu nhiên lệch → timeline lượt dò ≠ lượt dựng. Lượt dò: độ dài ước (client), thiếu thì báo 'dry-short'.
    var sr = 48000, maxSec = o.maxSec || 600;
    var lenSec = dry ? Math.min(o.sec || maxSec, maxSec) + 5 : Math.max(5, (o.sec || maxSec) * 1.05 + 3);
    var au = await lockstep({ sr: sr, length: Math.ceil(lenSec * sr), tap: !dry });
    mark('lockstep');
    window.AudioContext = window.webkitAudioContext = function () { return au.ctx; };
    VC.beforeFire = function (at) { return au.to(at / 1000); };
    if (A) A.setVoiceMode(o.missingVoice === 'blip' ? 'auto' : 'clip');   // Q39: câu chưa có giọng AI im lặng, bong bóng / phụ đề vẫn hiện
    var says = [];
    if (A && o.debug) { var say0 = A.say; A.say = function (text, voice, hooks) { says.push({ t: VC.t, text: String(text), clip: !!(hooks && hooks.clip) }); return say0.apply(this, arguments); }; }
    // bộ phát: y như phim HTML (FILM_BOOT) — giọng AI nhúng sẵn theo khoá câu, không gọi mạng
    var VO = D.voices || {}, ended = false, endAt = 0;
    var player = live.player = GC.film.player(box, { dialog: FILM.dialog || 'auto', lang: D.lang, accent: D.accent,
      voiceClip: function (line) { return VO[GC.film.clipKey(line)] || null; }, onEnd: function () { ended = true; endAt = VC.t; } });
    if (D.project) player.setProject(D.project);
    var ready = GC.film.readiness(FILM).filter(function (x) { return x.ok; }).map(function (x) { return x.shot; });
    if (Array.isArray(o.shots) && o.shots.length) ready = o.shots.map(function (i) { return ready[i]; }).filter(Boolean);
    if (!ready.length) throw fail('empty', 'không có phân cảnh nào sẵn sàng');
    // play() = A.unlock() (dựng chuỗi trộn + vang ~50 ms) rồi dựng sân khấu phân cảnh đầu (~70 ms) trong CÙNG tác vụ → tách: dựng tiếng trước, nhả luồng, rồi play
    // (play gọi lại unlock: không làm gì nữa). Thứ tự dùng Math.random giữ nguyên như cũ — unlock vốn là việc đầu tiên của play.
    if (A && A.unlock) { A.unlock(); mark('audio'); await VC.yieldReal(); }
    player.play(ready, FILM.title); mark('play');
    await VC.yieldReal();
    box.getBoundingClientRect(); mark('layout');   // bố cục lần đầu của sân khấu vừa dựng: một tác vụ riêng, không dồn vào lần bắn hẹn giờ đầu
    await VC.yieldReal();
    // bộ mã hoá
    var F = o.format || {}, canvas = null, g = null, tiny = null, seenImg = new WeakSet(), warm = 0, venc = null, aenc = null, errBox = { e: null }, vchunks = [], achunks = [], vdesc = null, adesc = null, writer = null, sink = null;
    var vcfg = null, S = GenMux.sync, calib = null, plan = { shift: 0, source: 'none' }, aFacts = { n: 0, outFrames: 0, negative: 0, first: [] };
    if (!dry) {
      if (typeof VideoEncoder !== 'function' || typeof AudioEncoder !== 'function') throw fail('no-webcodecs', 'trình duyệt không có WebCodecs');
      canvas = new OffscreenCanvas(OW, OH); g = canvas.getContext('2d', { alpha: false });
      var mp4 = F.container === 'mp4';
      vcfg = { codec: F.video.codec, width: OW, height: OH, bitrate: F.video.bitrate || (hd ? 8e6 : 5e6), framerate: fps, latencyMode: 'quality' };
      if (mp4) vcfg.avc = { format: 'avc' };
      var acfg = { codec: F.audio.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: F.audio.bitrate || 160000 };
      sink = live.sink = o.handle ? await fileSink(o.handle) : blobSink(mp4 ? 'video/mp4' : 'video/webm');
      var AUD = { codec: mp4 ? 'mp4a' : 'opus', sampleRate: 48000, channels: 2, description: null, bitrate: acfg.bitrate };
      if (!mp4) writer = new GenMux.WebmWriter({ video: { codec: 'vp09', width: OW, height: OH, fps: fps }, audio: AUD, write: function (b, pos) { sink.write(b, pos); } });
      venc = live.venc = new VideoEncoder({
        output: function (c, m) {
          if (m && m.decoderConfig && m.decoderConfig.description && !vdesc) vdesc = bytesOf(m.decoderConfig.description);
          var b = new Uint8Array(c.byteLength); c.copyTo(b);
          var ch = { data: b, ts: c.timestamp, key: c.type === 'key' };
          try { if (writer) writer.video(ch); else vchunks.push(ch); } catch (e) { errBox.e = errBox.e || e; }
        }, error: function (e) { errBox.e = errBox.e || e; } });
      venc.configure(vcfg);
      aenc = live.aenc = new AudioEncoder({
        output: function (c, m) {
          if (m && m.decoderConfig && m.decoderConfig.description && !adesc) { adesc = bytesOf(m.decoderConfig.description); AUD.description = adesc; if (!mp4 && adesc.length >= 12) AUD.preSkip = adesc[10] | (adesc[11] << 8); }
          var b = new Uint8Array(c.byteLength); c.copyTo(b);
          var ch = { data: b, ts: c.timestamp, dur: c.duration || (mp4 ? 1024e6 / 48000 : 20000) };   // thiếu duration: một khung AAC (1024 mẫu) / Opus (20 ms)
          if (aFacts.first.length < 8) aFacts.first.push({ ts: c.timestamp, dur: c.duration, bytes: c.byteLength });
          aFacts.n++; aFacts.outFrames += Math.round(ch.dur * 48000 / 1e6); if (c.timestamp < 0) aFacts.negative++;
          try { if (writer) writer.audio(ch); else achunks.push(ch); } catch (e) { errBox.e = errBox.e || e; }
        }, error: function (e) { errBox.e = errBox.e || e; } });
      aenc.configure(acfg);
      // bù độ trễ mồi KHÔNG dùng edit list (chỉ AAC / MP4; WebM Opus đã có CodecDelay = pre-skip của OpusHead): đo trên chính bộ mã hoá này
      calib = await calibrate(acfg);
      if (mp4) plan = S.pick(calib, calib.hints);
    }
    mark('encoders');
    // PCM từ vòi → AudioEncoder, chỉ tới mẫu PHIM `limit` (đúng thời điểm khung hình — tiếng không dài hơn hình); bỏ `shift` mẫu đầu (bù mồi)
    // mẫu dấu (chỉ test — o.debug.marks [{ sec (< 0: tính từ cuối), seed, len }]): đo lệch tiếng / hình trên tệp thật (tools/video-ci.mjs)
    var marks = (o.debug && o.debug.marks || []).map(function (m) { return { at: Math.round((m.sec < 0 ? (o.sec || 0) + m.sec : m.sec) * 48000), tpl: S.noise(m.len || 2048, m.seed) }; });
    var feeder = new S.Feeder({ shift: plan.shift, marks: marks });
    if (au.tap) au.tap.port.onmessage = function (e) { feeder.push(e.data.l, e.data.r); };
    function feed(limit) {
      feeder.take(limit, function (l, r, n, outPos) {
        var pl = new Float32Array(n * 2); pl.set(l, 0); pl.set(r, n);
        var ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(outPos * 1e6 / 48000), data: pl });
        aenc.encode(ad); ad.close();
      });
    }
    // vòng khung hình
    var st = { frames: 0, warmFrames: 0, advance: 0, snap: 0, decode: 0, maxDraw: 0, maxSnap: 0, maxTiny: 0, tiny: 0, raster: 0, encode: 0, svgBytes: 0, maxFrameMs: 0, heapPeak: 0 };
    var cues = [], open = new Map(), firstDialogFrame = -1, dialogRun = 0, cover = null, coverAt = -1, texts = new Set(), shotMarks = [], lastPlan = null;
    var frames = o.frames || 0, mem = performance.memory;
    for (var i = 0; ; i++) {
      if (cancelled) throw fail('cancelled', 'cancelled');
      if (errBox.e) throw fail('encode', String(errBox.e && errBox.e.message || errBox.e));
      var t = i * 1000 / fps;
      if (ended && t > endAt + (o.tailMs == null ? 300 : o.tailMs)) break;
      if (t > maxSec * 1000) throw fail('too-long', String(Math.round(maxSec)));
      if (t / 1000 > au.sec - 0.25) throw dry ? fail('dry-short', String(Math.round(au.sec))) : fail('internal', 'phim dài hơn lượt dò (' + Math.round(au.sec) + ' s) — timeline không tất định');
      var f0 = R.now();
      await VC.advance(t);
      var f1 = R.now(); st.advance += f1 - f0;
      // phân cảnh hiện tại (tiến độ theo phân cảnh) + lời thoại đang hiện (phụ đề .srt theo khung hình thật)
      var pl = player.plan(); if (pl && pl !== lastPlan) { lastPlan = pl; shotMarks.push({ frame: i, title: pl.shotTitle || '' }); }
      var seen = new Set(), vis = box.querySelectorAll('.gcp-bub.on .tx, .gcp-cap.on .tx');
      for (var k = 0; k < vis.length; k++) {
        var tx = vis[k]; seen.add(tx);
        if (!open.has(tx)) { var cue = { from: t, to: t, text: tx.textContent }; open.set(tx, cue); cues.push(cue); }
      }
      open.forEach(function (c, el) { if (!seen.has(el)) { c.to = t; open.delete(el); } });
      if (vis.length && firstDialogFrame < 0) firstDialogFrame = i;
      dialogRun = vis.length ? dialogRun + 1 : 0;
      if (o.debug) texts.add(box.textContent.replace(/\s+/g, ' ').trim());
      if (!dry) {
        await VC.yieldReal();   // bộ phát (advance) và chụp ở hai tác vụ khác nhau
        var f1b = R.now();
        var body = snapshot(box, SW, SH); st.svgBytes += body.length + frameShell(SW, SH).bytes;
        var f2 = R.now(); st.snap += f2 - f1b;
        await VC.yieldReal();
        var img = await svgImage(body, SW, SH); body = null;
        // vẽ thử 1 px: trình duyệt tính style + bố cục của tài liệu SVG ở lần vẽ ĐẦU — tách khỏi dải raster đầu (ngân sách long task)
        if (!tiny) tiny = new OffscreenCanvas(1, 1).getContext('2d');
        await VC.yieldReal(); var ty = R.now(); tiny.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1); tiny.getImageData(0, 0, 1, 1); st.maxTiny = Math.max(st.maxTiny, R.now() - ty); st.tiny += R.now() - ty;
        await VC.yieldReal();
        var f2b = R.now(); st.decode += f2b - f2;
        g.fillStyle = '#121214'; g.fillRect(0, 0, OW, OH);
        if (vertical) { g.fillStyle = '#ece9e2'; g.font = '800 ' + Math.round(OW / 17) + 'px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(FILM.title || ''), OW / 2, SY - Math.round(OW / 9), OW * 0.9); }
        // ảnh mới trong sân khấu (phông / tiền cảnh của bối cảnh vừa vào): lần raster ĐẦU phải giải mã + vẽ ảnh SVG lồng bên trong (đo: Tam Quốc ~150–190 ms
        // một dải) → 3 khung kế tiếp raster bằng dải mịn gấp 4; sau đó trình duyệt đã nhớ ảnh, về số dải thường
        var imgs = box.getElementsByTagName('img');
        for (var ii = 0; ii < imgs.length; ii++) if (!seenImg.has(imgs[ii])) { seenImg.add(imgs[ii]); warm = 3; }
        var nb = warm > 0 ? BANDS * 4 : BANDS; if (warm > 0) { warm--; st.warmFrames++; }
        var md = 0, bt = [];
        for (var bi = 0, bh = Math.ceil(SH / nb); bi < nb; bi++) {
          var y0 = bi * bh, hh = Math.min(bh, SH - y0), d0 = R.now();
          g.drawImage(img, 0, y0, SW, hh, 0, SY + y0, SW, hh); g.getImageData(0, SY + y0, 1, 1);   // ép raster dải này ngay ở tác vụ này
          md = Math.max(md, R.now() - d0); bt.push(R.now());
          if (bi < nb - 1) await VC.yieldReal();
        }
        var f3 = R.now(); st.raster += f3 - f2; st.maxDraw = Math.max(st.maxDraw, md); st.maxSnap = Math.max(st.maxSnap, f2 - f1b);
        await VC.yieldReal();   // raster SVG (mỗi dải ≤ ~50 ms, luồng chính) và mã hoá ở các tác vụ khác nhau → long task ≤ 100 ms (CNS-221)
        // ảnh bìa (Q43): khung có thoại đầu tiên, khi bong bóng đã hiện rõ (~0,4 s)
        if (!cover && dialogRun >= Math.round(fps * 0.4)) { cover = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }); coverAt = i; }
        if (o.probe && o.probe.indexOf(i) >= 0) {
          var png = await canvas.convertToBlob({ type: 'image/png' });
          await new Promise(function (ok) { ackWait = ok; post({ type: 'gc-video-probe', frame: i, t: t, png: png, sy: SY }); });
        }
        var vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1000), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: i % fps === 0 }); vf.close();
        feed(Math.min(feeder.got, Math.round(t / 1000 * 48000)));
        await untilDequeue(venc, 4, errBox); await untilDequeue(aenc, 8, errBox);
        await sink.drain();
        st.encode += R.now() - f3;
      }
      st.frames++;
      st.maxFrameMs = Math.max(st.maxFrameMs, R.now() - f0);
      if (i < 3) mark('frame' + i);
      if (o.debug && R.now() - f0 > 40) (st.slow = st.slow || []).push([i, Math.round(performance.timeOrigin + f0), Math.round(f1 - f0), Math.round(R.now() - f0), dry ? null : [f1, f1b, f2, f2b].concat(bt, [f3, R.now()]).map(function (x) { return Math.round(x - f0); })]);
      if (mem && i % 15 === 0) st.heapPeak = Math.max(st.heapPeak, mem.usedJSHeapSize);
      if (i % 10 === 0) post({ type: 'gc-video-progress', phase: o.pass, frame: i, frames: frames, shot: shotMarks.length, shots: ready.length });
      await VC.yieldReal();   // nhả luồng chính mỗi khung (MessageChannel — CNS-221)
    }
    var nFrames = st.frames, durMs = nFrames * 1000 / fps;
    open.forEach(function (c) { c.to = durMs; });
    player.destroy(); live.player = null;
    VC.beforeFire = null;
    var base = { type: 'gc-video-done', pass: o.pass, frames: nFrames, durationMs: durMs, endAt: endAt, shots: shotMarks, firstDialogFrame: firstDialogFrame,
      cues: cues.map(function (c) { return { from: c.from, to: c.to, text: c.text }; }) };
    if (o.debug) { base.texts = Array.from(texts); base.says = says; base.slow = st.slow || []; base.t0 = performance.timeOrigin + t00; base.marks = marks; }
    if (dry) { base.stats = { wallMs: R.now() - t00, perFrameMs: (R.now() - t00) / Math.max(1, nFrames) }; return base; }
    // kết: tiếng tới hết độ dài hình, đóng bộ mã hoá, ghép
    var endSamples = Math.round(durMs / 1000 * 48000);
    await au.finish();
    var w0 = R.now();
    while (feeder.got < endSamples && R.now() - w0 < 10000) await VC.yieldReal();
    if (feeder.got < endSamples) throw fail('internal', 'thiếu tiếng: ' + feeder.got + ' / ' + endSamples + ' mẫu');
    feed(endSamples);
    await venc.flush(); await aenc.flush();
    if (errBox.e) throw fail('encode', String(errBox.e.message || errBox.e));
    venc.close(); aenc.close(); live.venc = live.aenc = null;
    var m0 = R.now(), blob, mux = {};
    // sự thật về tiếng (CI in ra từng nền tảng): hiệu chuẩn, độ bù đã dùng, gói đầu, mẫu vào / ra, cắt đuôi
    var aStats = { codec: F.audio.codec, desc: adesc ? hex(adesc) : null, calib: calib, shift: plan.shift, shiftSource: plan.source, first: aFacts.first, chunks: aFacts.n,
      negative: aFacts.negative, inFrames: feeder.out, outFrames: aFacts.outFrames, filmFrames: endSamples, marks: marks.map(function (m) { return m.at; }) };
    if (!writer) { var tr = S.trim(achunks, endSamples, 48000); achunks = tr.chunks; aStats.trimmed = tr.dropped; aStats.muxFrames = tr.frames; }
    if (writer) { mux = writer.finish(); }
    else {
      var parts = GenMux.mp4Parts({ video: { codec: 'avc1', width: OW, height: OH, fps: fps, description: vdesc, chunks: vchunks },
        audio: { codec: 'mp4a', sampleRate: 48000, channels: 2, description: adesc, bitrate: AUD.bitrate, chunks: achunks } });
      for (var pi = 0; pi < parts.length; pi++) sink.write(parts[pi]);
      vchunks = achunks = null;
    }
    blob = await sink.close(); live.sink = null;
    st.muxMs = R.now() - m0;
    var srt = GCVText.srt(base.cues);
    base.files = [{ kind: 'video', type: F.container === 'mp4' ? 'video/mp4' : 'video/webm', ext: F.container, blob: blob, bytes: sink.size() },
      { kind: 'srt', type: 'application/x-subrip', ext: 'srt', blob: new Blob([srt], { type: 'application/x-subrip' }) }];
    if (cover) base.files.push({ kind: 'cover', type: 'image/jpeg', ext: 'jpg', blob: cover });
    base.format = { container: F.container, video: vcfg.codec, audio: F.audio.codec, width: OW, height: OH, fps: fps };
    base.coverFrame = coverAt;
    var wall = R.now() - t00;
    base.stats = { wallMs: wall, xRealtime: wall / durMs, perFrameMs: { advance: st.advance / nFrames, snap: st.snap / nFrames, raster: st.raster / nFrames, encode: st.encode / nFrames, total: wall / nFrames },
      maxFrameMs: st.maxFrameMs, warmFrames: st.warmFrames, maxDrawMs: st.maxDraw, maxSnapMs: st.maxSnap, maxTinyMs: st.maxTiny, tinyMs: st.tiny / nFrames, decodeMs: st.decode / nFrames, cssKB: allCSS().length / 1024, svgKB: st.svgBytes / nFrames / 1024, heapPeak: st.heapPeak, mux: mux, audioFed: feeder.pos, audioEnd: endSamples, audio: aStats };
    return base;
  }
})();
