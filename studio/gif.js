/* gen-chibi Studio — bộ mã hoá GIF89a thuần JS (không thư viện ngoài)
 * © 2026 Gen Labs — All rights reserved.
 *
 * Dùng cho Thư viện › Động tác: xuất hoạt ảnh một đòn thành GIF lặp vô hạn, nền trong suốt.
 *   GenGif.encode({ width, height, frames: [RGBA Uint8ClampedArray…], fps | delays: [phần trăm giây…], loop: 0 }) → Uint8Array
 * Các bước: (1) lượng tử hoá — một bảng màu chung ≤ 255 màu cho mọi khung (median cut trên lưới màu 15 bit) + 1 màu trong suốt;
 *           (2) mỗi khung → chỉ số màu (alpha < 128 = trong suốt); (3) nén LZW theo chuẩn GIF (mã 9…12 bit, khối con ≤ 255 byte).
 * Hình chibi là vector màu phẳng nên median cut không cần dither; mép bán trong suốt cắt theo ngưỡng alpha (GIF chỉ có 1 bit trong suốt).
 */
(function (root) {
  'use strict';
  var TRANSPARENT = 255;   // chỉ số màu trong suốt (cuối bảng); màu thật dùng 0…254

  /* ---------------------------------------------------------- bộ đệm byte */
  function Bytes(n) { this.a = new Uint8Array(n || 4096); this.n = 0; }
  Bytes.prototype.push = function (b) { if (this.n === this.a.length) { var x = new Uint8Array(this.a.length * 2); x.set(this.a); this.a = x; } this.a[this.n++] = b; };
  Bytes.prototype.u16 = function (v) { this.push(v & 255); this.push((v >> 8) & 255); };
  Bytes.prototype.str = function (s) { for (var i = 0; i < s.length; i++) this.push(s.charCodeAt(i)); };
  Bytes.prototype.bytes = function (arr, len) { for (var i = 0; i < len; i++) this.push(arr[i]); };
  Bytes.prototype.out = function () { return this.a.slice(0, this.n); };

  /* ---------------------------------------------------------- 1. LƯỢNG TỬ HOÁ */
  function key15(r, g, b) { return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); }
  // frames: mảng RGBA → { palette: Uint8Array(768), index: Int16Array(32768) — ô màu 15 bit → chỉ số bảng màu }
  function quantize(frames, maxColors) {
    maxColors = Math.max(2, Math.min(255, maxColors || 255));
    var cnt = new Float64Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
    frames.forEach(function (px) {
      for (var i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        var k = key15(px[i], px[i + 1], px[i + 2]);
        cnt[k]++; sr[k] += px[i]; sg[k] += px[i + 1]; sb[k] += px[i + 2];
      }
    });
    var keys = [];
    for (var k = 0; k < 32768; k++) if (cnt[k]) keys.push(k);
    var avg = function (list) {
      var n = 0, r = 0, g = 0, b = 0;
      list.forEach(function (q) { n += cnt[q]; r += sr[q]; g += sg[q]; b += sb[q]; });
      return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0];
    };
    var colors;
    if (keys.length <= maxColors) colors = keys.map(function (q) { return avg([q]); });
    else {
      // median cut: tách hộp có (độ trải × số điểm ảnh) lớn nhất theo trục dài nhất, tại trung vị có trọng số
      var ch = function (q, c) { return c === 0 ? q >> 10 : c === 1 ? (q >> 5) & 31 : q & 31; };
      var boxOf = function (list) {
        var lo = [31, 31, 31], hi = [0, 0, 0], n = 0;
        list.forEach(function (q) { for (var c = 0; c < 3; c++) { var v = ch(q, c); if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; } n += cnt[q]; });
        var axis = 0, span = -1;
        for (var c = 0; c < 3; c++) if (hi[c] - lo[c] > span) { span = hi[c] - lo[c]; axis = c; }
        return { list: list, axis: axis, span: span, n: n };
      };
      var boxes = [boxOf(keys)];
      while (boxes.length < maxColors) {
        var bi = -1, best = 0;
        boxes.forEach(function (b, i) { var s = b.span * Math.sqrt(b.n); if (b.list.length > 1 && b.span > 0 && s > best) { best = s; bi = i; } });
        if (bi < 0) break;
        var B = boxes[bi], ax = B.axis;
        var sorted = B.list.slice().sort(function (p, q) { return ch(p, ax) - ch(q, ax); });
        var half = B.n / 2, acc = 0, cut = 1;
        for (var i = 0; i < sorted.length - 1; i++) { acc += cnt[sorted[i]]; if (acc >= half) { cut = i + 1; break; } cut = i + 1; }
        boxes.splice(bi, 1, boxOf(sorted.slice(0, cut)), boxOf(sorted.slice(cut)));
      }
      colors = boxes.map(function (b) { return avg(b.list); });
    }
    if (!colors.length) colors = [[0, 0, 0]];
    var palette = new Uint8Array(768);
    colors.forEach(function (c, i) { palette[i * 3] = c[0]; palette[i * 3 + 1] = c[1]; palette[i * 3 + 2] = c[2]; });
    // mỗi ô màu đã gặp → màu gần nhất trong bảng (tính một lần, tra bảng khi đổi khung)
    var index = new Int16Array(32768).fill(-1);
    keys.forEach(function (q) {
      var r = sr[q] / cnt[q], g = sg[q] / cnt[q], b = sb[q] / cnt[q], bi = 0, bd = Infinity;
      for (var i = 0; i < colors.length; i++) {
        var dr = colors[i][0] - r, dg = colors[i][1] - g, db = colors[i][2] - b, d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) { bd = d; bi = i; }
      }
      index[q] = bi;
    });
    return { palette: palette, index: index, colors: colors.length };
  }
  function indexFrame(px, index) {
    var n = px.length >> 2, out = new Uint8Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      if (px[j + 3] < 128) { out[i] = TRANSPARENT; continue; }
      var v = index[key15(px[j], px[j + 1], px[j + 2])];
      out[i] = v < 0 ? 0 : v;
    }
    return out;
  }

  /* ---------------------------------------------------------- 2. LZW (GIF, mã 9…12 bit) */
  // bảng từ điển: khoá = mã tiền tố × 256 + chỉ số; dùng "thế hệ" để xoá bảng tức thì khi gặp mã CLEAR
  var CODES = null, STAMP = null, GEN = 0;
  function newGen() {
    if (!CODES) { CODES = new Int16Array(1 << 20); STAMP = new Uint16Array(1 << 20); GEN = 0; }
    if (++GEN > 65535) { STAMP.fill(0); GEN = 1; }
    return GEN;
  }
  function lzw(px, minCode, out) {
    var CLEAR = 1 << minCode, EOI = CLEAR + 1, size = minCode + 1, next = EOI + 1, gen = newGen();
    var data = new Bytes(px.length + 64), cur = 0, nbits = 0;
    function put(code) { cur |= code << nbits; nbits += size; while (nbits >= 8) { data.push(cur & 255); cur >>>= 8; nbits -= 8; } }
    put(CLEAR);
    var prefix = px[0];
    for (var i = 1; i < px.length; i++) {
      var k = px[i], key = (prefix << 8) | k;
      if (STAMP[key] === gen) { prefix = CODES[key]; continue; }
      put(prefix);
      if (next === 4096) { put(CLEAR); size = minCode + 1; next = EOI + 1; gen = newGen(); }
      else { if (next >= (1 << size)) size++; CODES[key] = next++; STAMP[key] = gen; }
      prefix = k;
    }
    put(prefix); put(EOI);
    if (nbits > 0) data.push(cur & 255);
    // khối con ≤ 255 byte, kết thúc bằng khối rỗng
    out.push(minCode);
    for (var p = 0; p < data.n; p += 255) { var len = Math.min(255, data.n - p); out.push(len); for (var q = 0; q < len; q++) out.push(data.a[p + q]); }
    out.push(0);
  }

  /* ---------------------------------------------------------- 3. GHÉP TỆP GIF89a */
  function encode(o) {
    var W = o.width | 0, H = o.height | 0, frames = o.frames || [];
    if (!(W > 0 && H > 0 && W < 65536 && H < 65536)) throw new Error('GIF: kích thước không hợp lệ');
    if (!frames.length) throw new Error('GIF: chưa có khung nào');
    frames.forEach(function (f, i) { if (!f || f.length !== W * H * 4) throw new Error('GIF: khung ' + i + ' sai kích thước'); });
    // thời lượng mỗi khung (1/100 giây) cộng dồn theo fps → tổng thời gian không trôi vì làm tròn
    var delays = o.delays || frames.map(function (f, i) { var fps = o.fps || 12; return Math.max(2, Math.round((i + 1) * 100 / fps) - Math.round(i * 100 / fps)); });
    var Q = quantize(frames, 255), out = new Bytes(W * H * frames.length / 2 + 1024);
    out.str('GIF89a');
    out.u16(W); out.u16(H);
    out.push(0xF7);                 // có bảng màu chung · 8 bit/kênh · 256 màu
    out.push(TRANSPARENT); out.push(0);
    out.bytes(Q.palette, 768);
    // lặp (NETSCAPE2.0): 0 = vô hạn
    out.push(0x21); out.push(0xFF); out.push(11); out.str('NETSCAPE2.0'); out.push(3); out.push(1); out.u16(o.loop == null ? 0 : o.loop); out.push(0);
    frames.forEach(function (px, i) {
      out.push(0x21); out.push(0xF9); out.push(4);
      out.push(0x09);               // xử lý khung cũ: xoá về nền (2 << 2) · có màu trong suốt
      out.u16(delays[i] || 10); out.push(TRANSPARENT); out.push(0);
      out.push(0x2C); out.u16(0); out.u16(0); out.u16(W); out.u16(H); out.push(0);
      lzw(indexFrame(px, Q.index), 8, out);
    });
    out.push(0x3B);
    return out.out();
  }

  var api = { encode: encode, quantize: quantize, TRANSPARENT: TRANSPARENT };
  root.GenGif = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
