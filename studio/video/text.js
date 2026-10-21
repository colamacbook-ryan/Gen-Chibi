/* gen-chibi — tệp chữ đi kèm video: phụ đề .srt + mô tả .txt. Thuần dữ liệu (chạy cả trong Node để kiểm thử). © 2026 Gen Labs — All rights reserved.
 *   GCVText.srt(cues)  cues: [{ from, to (ms), text }] → chuỗi SubRip (UTF-8, CRLF như đa số công cụ phụ đề)
 *   GCVText.txt({ title, description, credit }) → tiêu đề · dòng trống · mô tả · dòng trống · dòng ghi công (Q47)
 *   GCVText.slug(s)    tên tệp an toàn (bỏ dấu, a-z0-9-, ≤ 40 ký tự) — giống slugify của Studio
 */
(function (root) {
  'use strict';
  function pad(v, n) { v = String(v); while (v.length < n) v = '0' + v; return v; }
  function tc(ms) { ms = Math.max(0, Math.round(ms)); return pad(Math.floor(ms / 3600000), 2) + ':' + pad(Math.floor(ms / 60000) % 60, 2) + ':' + pad(Math.floor(ms / 1000) % 60, 2) + ',' + pad(ms % 1000, 3); }
  function clean(t) { return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim(); }
  function srt(cues) {
    return (cues || []).filter(function (c) { return clean(c.text) && c.to > c.from; }).map(function (c, i) {
      return (i + 1) + '\r\n' + tc(c.from) + ' --> ' + tc(c.to) + '\r\n' + clean(c.text) + '\r\n';
    }).join('\r\n');
  }
  function txt(o) {
    o = o || {};
    return [clean(o.title), clean(o.description), clean(o.credit)].filter(Boolean).join('\n\n') + '\n';
  }
  function slug(s) {
    var x = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'video';
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(x) ? x + '-gc' : x;   // tên thiết bị dành riêng của Windows
  }
  var API = { srt: srt, txt: txt, slug: slug, tc: tc };
  if (typeof module === 'object' && module.exports) module.exports = API; else root.GCVText = API;
})(typeof self !== 'undefined' ? self : this);
