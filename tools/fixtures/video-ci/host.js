// Host của job CI xuất video (tools/video-ci.mjs). © 2026 Gen Labs — All rights reserved.
(function () {
  'use strict';
  window.__ci = { state: 'loading' };
  var q = new URLSearchParams(location.search), opts = JSON.parse(q.get('opts') || '{}');
  window.ciRun = function () {
    window.__ci = { state: 'running', progress: null, visibility: [] };
    var vis = function () { window.__ci.visibility.push(document.visibilityState); };
    document.addEventListener('visibilitychange', vis); vis();
    return fetch('/__payload.json').then(function (r) { return r.json(); }).then(function (payload) {
      return GCVideo.probe(opts).then(function (pr) {
        window.__ci.probe = pr;
        if (!pr.ok) throw Object.assign(new Error(pr.reason), { code: pr.code });
        return GCVideo.exportPayload(payload, Object.assign({ format: pr.format }, opts), function (p) { window.__ci.progress = p; vis(); });
      });
    }).then(function (r) {
      var v = r.files.filter(function (f) { return f.kind === 'video'; })[0];
      window.__ciVideo = v.blob;
      window.__ci = Object.assign(window.__ci, { state: 'done', format: r.format, frames: r.frames, durationMs: r.durationMs, dry: r.dry, stats: r.stats, wallMs: r.wallMs,
        files: r.files.map(function (f) { return { kind: f.kind, name: f.name, type: f.type, size: f.blob.size }; }) });
    }, function (e) { window.__ci.state = 'error'; window.__ci.error = String(e && e.message || e); window.__ci.code = e && e.code; window.__ci.detail = e && e.detail; });
  };
  // tệp video → base64 từng đoạn (CDP trả chuỗi)
  window.ciChunk = function (i, n) {
    return window.__ciVideo.slice(i, i + n).arrayBuffer().then(function (ab) {
      var u = new Uint8Array(ab), s = ''; for (var k = 0; k < u.length; k += 32768) s += String.fromCharCode.apply(null, u.subarray(k, k + 32768)); return btoa(s);
    });
  };
  window.__ci.state = 'ready';
})();
