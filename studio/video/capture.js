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
  function boot(P) {
    var GC = window.GenChibi, D = P.data, I = GC.i18n;
    // chữ trên khung hình: CÙNG luật với exportFilm — ngôn ngữ giao diện lúc xuất + bảng player / engine nhúng kèm (CNS-224)
    if (I && P.ui) { if (P.dict) I.add(P.ui, P.dict); I.setLang(P.ui); }
    GC.pack({ id: 'local.my', name: 'local', owner: 'local', group: 'mine', license: 'local' }, function () {});
    (D.parts || []).forEach(function (p) { GC.registerDataPart('local.my', p); });
    (D.items || []).forEach(function (x) { GC.registerItem('local.my', x); });
    (D.scenes || []).forEach(function (x) { GC.registerScene('local.my', x); });
    (D.characters || []).forEach(function (a) { GC.registerAsset(a.pack, a); });
    (D.soundPacks || []).forEach(function (p) { if (GC.sounds) GC.sounds.registerPack(p); });   // gói âm TRƯỚC gói động tác (như FILM_BOOT)
    (D.motionPacks || []).forEach(function (m) { if (GC.choreo) GC.choreo.registerPack('local.my', m); });
    return GC;
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------------------------------------------------------------- chụp sân khấu: DOM → SVG foreignObject đứng yên */
  var CSS = null;
  function allCSS() {
    if (CSS === null) CSS = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n') + '\n*{animation:none!important;transition:none!important}';
    return CSS;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function snapshot(box, W, H) {
    var live = [box].concat(Array.prototype.slice.call(box.querySelectorAll('*'))), props = new Map();
    document.getAnimations().forEach(function (a) {   // giá trị đang chuyển động (transition / animation) chép thành style tĩnh của bản sao
      var e = a.effect, t = e && e.target; if (!t || e.pseudoElement) return;
      var ks = props.get(t) || new Set();
      e.getKeyframes().forEach(function (k) { Object.keys(k).forEach(function (p) { if (['offset', 'easing', 'composite', 'computedOffset'].indexOf(p) < 0) ks.add(p); }); });
      props.set(t, ks);
    });
    var clone = box.cloneNode(true), cl = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('*')));
    live.forEach(function (e, i) {
      var ks = props.get(e); if (!ks) return;
      var cs = getComputedStyle(e);
      ks.forEach(function (p) { var css = p.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); cl[i].style.setProperty(css, cs.getPropertyValue(css)); });
    });
    clone.removeAttribute('id'); clone.style.cssText += ';position:relative;left:0;top:0;width:' + W + 'px;height:' + H + 'px;overflow:hidden;border-radius:0';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' +
      '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + esc(allCSS()) + '</style>' + new XMLSerializer().serializeToString(clone) + '</div></foreignObject></svg>';
  }
  function svgImage(svg) {
    var img = new Image();   // data: URL + HTMLImageElement: canvas vẫn sạch (spike taint.mjs)
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
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
    var t00 = R.now();
    var fps = o.fps || 30, dry = o.pass === 'dry', vertical = o.aspect === '9:16', hd = o.quality !== '720p';
    var OW = vertical ? (hd ? 1080 : 720) : (hd ? 1920 : 1280), OH = vertical ? (hd ? 1920 : 1280) : (hd ? 1080 : 720);
    var SW = OW, SH = Math.round(SW * 9 / 16), SY = vertical ? Math.round((OH - SH) / 2) : 0;   // sân khấu 16:9 theo chiều ngang; 9:16 = đặt giữa khung dọc (Q37 a)
    var srcs = P.srcs || [];
    if (!srcs.length || !srcs.every(function (s) { return SRC_RE.test(s) && s.indexOf('..') < 0; }) || srcs.indexOf('engine/player.js') < 0) throw fail('payload', 'payload.srcs không hợp lệ');
    if (!P.data || !P.film || !Array.isArray(P.film.shots)) throw fail('payload', 'payload thiếu data / film');
    await loadScripts(srcs);
    var GC = boot(P), A = GC.audio, D = P.data, FILM = P.film;
    var box = document.getElementById('stage');
    box.style.width = SW + 'px'; box.style.height = SH + 'px';
    if (document.fonts && document.fonts.load) await Promise.all(['500', '700', '800'].map(function (w) { return document.fonts.load(w + ' 16px "Be Vietnam Pro"', 'Aăâđêôơư'); })).catch(function () {});
    Math.random = mulberry(o.seed || 7);
    // tiếng
    // CẢ HAI lượt 48 kHz (mono ở đích): engine/audio.js dùng Math.random (đã gieo hạt) để lấp bộ đệm nhiễu / vang THEO ctx.sampleRate và lập lịch nhạc theo
    // lượng tử của ctx.currentTime — khác tần số mẫu là dãy ngẫu nhiên lệch → timeline lượt dò ≠ lượt dựng. Lượt dò: độ dài ước (client), thiếu thì báo 'dry-short'.
    var sr = 48000, maxSec = o.maxSec || 600;
    var lenSec = dry ? Math.min(o.sec || maxSec, maxSec) + 5 : Math.max(5, (o.sec || maxSec) * 1.05 + 3);
    var au = await lockstep({ sr: sr, length: Math.ceil(lenSec * sr), tap: !dry });
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
    player.play(ready, FILM.title);
    // bộ mã hoá
    var F = o.format || {}, canvas = null, g = null, venc = null, aenc = null, errBox = { e: null }, vchunks = [], achunks = [], vdesc = null, adesc = null, writer = null, sink = null;
    var vcfg = null;
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
          try { if (writer) writer.audio(ch); else achunks.push(ch); } catch (e) { errBox.e = errBox.e || e; }
        }, error: function (e) { errBox.e = errBox.e || e; } });
      aenc.configure(acfg);
    }
    // PCM từ vòi → AudioEncoder, chỉ tới mẫu `limit` (đúng thời điểm khung hình — tiếng không dài hơn hình)
    var pcm = [], got = 0, fed = 0;
    if (au.tap) au.tap.port.onmessage = function (e) { pcm.push(e.data); got += e.data.l.length; };
    function feed(limit) {
      while (pcm.length && fed < limit) {
        var b = pcm[0], n = Math.min(b.l.length, limit - fed);
        var pl = new Float32Array(n * 2); pl.set(b.l.subarray(0, n), 0); pl.set(b.r.subarray(0, n), n);
        var ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(fed * 1e6 / 48000), data: pl });
        aenc.encode(ad); ad.close(); fed += n;
        if (n === b.l.length) pcm.shift(); else pcm[0] = { l: b.l.subarray(n), r: b.r.subarray(n) };
      }
    }
    // vòng khung hình
    var st = { frames: 0, advance: 0, snap: 0, raster: 0, encode: 0, svgBytes: 0, maxFrameMs: 0, heapPeak: 0 };
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
        var svg = snapshot(box, SW, SH); st.svgBytes += svg.length;
        var f2 = R.now(); st.snap += f2 - f1;
        var img = await svgImage(svg);
        g.fillStyle = '#121214'; g.fillRect(0, 0, OW, OH);
        if (vertical) { g.fillStyle = '#ece9e2'; g.font = '800 ' + Math.round(OW / 17) + 'px "Be Vietnam Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(FILM.title || ''), OW / 2, SY - Math.round(OW / 9), OW * 0.9); }
        g.drawImage(img, 0, SY, SW, SH); g.getImageData(0, 0, 1, 1);   // ép raster SVG ngay ở tác vụ này (không dồn sang new VideoFrame ở tác vụ sau)
        var f3 = R.now(); st.raster += f3 - f2;
        await VC.yieldReal();   // raster SVG (~20–35 ms, luồng chính) và mã hoá ở hai tác vụ khác nhau → long task ≤ 100 ms (CNS-221)
        // ảnh bìa (Q43): khung có thoại đầu tiên, khi bong bóng đã hiện rõ (~0,4 s)
        if (!cover && dialogRun >= Math.round(fps * 0.4)) { cover = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }); coverAt = i; }
        if (o.probe && o.probe.indexOf(i) >= 0) {
          var png = await canvas.convertToBlob({ type: 'image/png' });
          await new Promise(function (ok) { ackWait = ok; post({ type: 'gc-video-probe', frame: i, t: t, png: png, sy: SY }); });
        }
        var vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1000), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: i % fps === 0 }); vf.close();
        feed(Math.min(got, Math.round(t / 1000 * 48000)));
        await untilDequeue(venc, 4, errBox); await untilDequeue(aenc, 8, errBox);
        await sink.drain();
        st.encode += R.now() - f3;
      }
      st.frames++;
      st.maxFrameMs = Math.max(st.maxFrameMs, R.now() - f0);
      if (o.debug && R.now() - f0 > 40) (st.slow = st.slow || []).push([i, Math.round(performance.timeOrigin + f0), Math.round(f1 - f0), Math.round(R.now() - f0)]);
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
    if (o.debug) { base.texts = Array.from(texts); base.says = says; base.slow = st.slow || []; base.t0 = performance.timeOrigin + t00; }
    if (dry) { base.stats = { wallMs: R.now() - t00, perFrameMs: (R.now() - t00) / Math.max(1, nFrames) }; return base; }
    // kết: tiếng tới hết độ dài hình, đóng bộ mã hoá, ghép
    var endSamples = Math.round(durMs / 1000 * 48000);
    await au.finish();
    var w0 = R.now();
    while (got < endSamples && R.now() - w0 < 10000) await VC.yieldReal();
    if (got < endSamples) throw fail('internal', 'thiếu tiếng: ' + got + ' / ' + endSamples + ' mẫu');
    feed(endSamples);
    await venc.flush(); await aenc.flush();
    if (errBox.e) throw fail('encode', String(errBox.e.message || errBox.e));
    venc.close(); aenc.close(); live.venc = live.aenc = null;
    var m0 = R.now(), blob, mux = {};
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
      maxFrameMs: st.maxFrameMs, svgKB: st.svgBytes / nFrames / 1024, heapPeak: st.heapPeak, mux: mux, audioFed: fed, audioEnd: endSamples };
    return base;
  }
})();
