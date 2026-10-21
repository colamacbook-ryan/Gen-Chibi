/* gen-chibi — bộ ghép video (muxer) thuần JS: MP4 (H.264 + AAC) và WebM (VP9 + Opus). Không thư viện, không DOM.
 * © 2026 Gen Labs — All rights reserved.
 *
 * CHỈ trang xuất video (studio/video-export.html) nạp tệp này — Studio (index.html) và phim HTML xuất ra KHÔNG mang nó (CNS-228).
 * Chạy được cả trong Node (require) để kiểm thử: tools/test-video.mjs.
 *
 *   GenMux.mp4Parts(o) → [Uint8Array…]   ISO BMFF "fast start": ftyp → moov → mdat (moov TRƯỚC mdat), không edit list (YouTube khuyên),
 *                                          mỗi mẫu một chunk, co64 (tệp > 4 GB vẫn đúng), mdat 64-bit. Phần tử của mảng là chính dữ liệu mẫu
 *                                          (không chép lại) → new Blob(parts) không nhân đôi bộ nhớ.
 *   GenMux.mp4(o)      → Uint8Array      như trên, ghép liền (tiện cho test)
 *       o.video = { codec: 'avc1', width, height, fps, description (avcC), chunks: [{ data, ts (µs), key }] }   (chunk theo thứ tự giải mã = trình bày)
 *       o.audio = { codec: 'mp4a', sampleRate, channels, description (AudioSpecificConfig), bitrate, chunks: [{ data, ts (µs), dur (µs) }] }   (tuỳ chọn)
 *     MP4 phải biết mọi mẫu trước khi viết moov → giữ cả tệp trong bộ nhớ: trần độ dài ở trang xuất (spec §3: 5 phút @1080p, 10 phút @720p).
 *
 *   new GenMux.WebmWriter(o) → ghi LUỒNG: .video(chunk) · .audio(chunk) · .finish() → { bytes, durationMs }
 *       o.video = { codec: 'vp09', width, height, fps }   o.audio = { codec: 'opus', sampleRate, channels, description (OpusHead), preSkip } (tuỳ chọn)
 *       o.write(bytes, pos)  pos === undefined: nối vào cuối · pos === 0: GHI ĐÈ phần đầu (cùng độ dài) lúc finish (Duration, SeekHead, cỡ Segment)
 *     Xen kẽ tiếng / hình theo thời gian; một Cluster mỗi khung khoá (hoặc mỗi 30 s), viết ra ngay khi đóng → bộ đệm ≤ 1 cluster (CNS-220).
 *     Cues (tua nhanh) + Tags (DURATION từng track) ở cuối, SeekHead ở đầu trỏ tới. Cỡ phần tử luôn 8 byte → phần đầu viết lại đúng độ dài cũ.
 *   GenMux.webm(o)     → Uint8Array      như trên, gom vào bộ nhớ (tiện cho test); o.video.chunks / o.audio.chunks như mp4
 */
(function (root) {
  'use strict';
  /* ------------------------------------------------------------------ byte writer */
  function W() { this.a = new Uint8Array(256); this.n = 0; }
  W.prototype.need = function (k) { if (this.n + k <= this.a.length) return; var L = this.a.length; while (L < this.n + k) L *= 2; var b = new Uint8Array(L); b.set(this.a.subarray(0, this.n)); this.a = b; };
  W.prototype.u8 = function (v) { this.need(1); this.a[this.n++] = v & 255; return this; };
  W.prototype.u16 = function (v) { return this.u8(v >> 8).u8(v); };
  W.prototype.u24 = function (v) { return this.u8(v >> 16).u8(v >> 8).u8(v); };
  W.prototype.u32 = function (v) { return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v); };
  W.prototype.u64 = function (v) { return this.u32(Math.floor(v / 4294967296)).u32(v >>> 0); };
  W.prototype.str = function (s) { for (var i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this; };
  W.prototype.bytes = function (b) { b = u8(b); this.need(b.length); this.a.set(b, this.n); this.n += b.length; return this; };
  W.prototype.out = function () { return this.a.slice(0, this.n); };
  function w(fn) { var x = new W(); fn(x); return x.out(); }
  function u8(x) { return x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : new Uint8Array(x); }
  function concat(list) { var n = 0, i; for (i = 0; i < list.length; i++) n += list[i].length; var o = new Uint8Array(n), p = 0; for (i = 0; i < list.length; i++) { o.set(list[i], p); p += list[i].length; } return o; }
  function need(c, msg) { if (!c) throw new Error('GenMux: ' + msg); }

  /* ================================================================== MP4 (ISO/IEC 14496-12 / -14 / -15) */
  function box(type, parts) { var body = concat(parts.map(u8)); return concat([w(function (x) { x.u32(body.length + 8).str(type); }), body]); }
  function full(type, ver, flags, parts) { return box(type, [w(function (x) { x.u8(ver).u24(flags); })].concat(parts)); }
  var MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
  function mvhd(scale, dur, next) { return full('mvhd', 0, 0, [w(function (x) { x.u32(0).u32(0).u32(scale).u32(dur).u32(0x10000).u16(0x100).u16(0).u32(0).u32(0); MATRIX.forEach(function (m) { x.u32(m); }); for (var i = 0; i < 6; i++) x.u32(0); x.u32(next); })]); }
  function tkhd(id, dur, wd, ht, audio) { return full('tkhd', 0, 3, [w(function (x) { x.u32(0).u32(0).u32(id).u32(0).u32(dur).u32(0).u32(0).u16(0).u16(audio ? 1 : 0).u16(audio ? 0x100 : 0).u16(0); MATRIX.forEach(function (m) { x.u32(m); }); x.u32(wd * 65536).u32(ht * 65536); })]); }
  function mdhd(scale, dur) { return full('mdhd', 0, 0, [w(function (x) { x.u32(0).u32(0).u32(scale).u32(dur).u16(0x55c4).u16(0); })]); }   // ngôn ngữ 'und'
  function hdlr(t, name) { return full('hdlr', 0, 0, [w(function (x) { x.u32(0).str(t).u32(0).u32(0).u32(0).str(name).u8(0); })]); }
  function dinf() { return box('dinf', [full('dref', 0, 0, [w(function (x) { x.u32(1); }), full('url ', 0, 1, [])])]); }
  // ES_Descriptor → DecoderConfigDescriptor (MPEG-4 Audio 0x40, luồng tiếng 0x15) → DecoderSpecificInfo (AudioSpecificConfig) + SLConfig
  function esds(asc, br) {
    var desc = function (tag, body) { return concat([w(function (x) { x.u8(tag).u8(0x80).u8(0x80).u8(0x80).u8(body.length); }), body]); };
    var dcd = desc(4, concat([w(function (x) { x.u8(0x40).u8(0x15).u24(0).u32(br).u32(br); }), desc(5, u8(asc))]));
    return full('esds', 0, 0, [desc(3, concat([w(function (x) { x.u16(1).u8(0); }), dcd, desc(6, new Uint8Array([2]))]))]);
  }
  // AudioSpecificConfig AAC-LC khi bộ mã hoá không đưa description: objectType 2, chỉ số tần số mẫu, số kênh
  var AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  function ascOf(rate, ch) { var i = AAC_RATES.indexOf(rate); need(i >= 0, 'tần số mẫu AAC lạ ' + rate); return new Uint8Array([(2 << 3) | (i >> 1), ((i & 1) << 7) | (ch << 3)]); }
  function videoEntry(v) {
    return box('avc1', [w(function (x) { for (var i = 0; i < 6; i++) x.u8(0); x.u16(1).u16(0).u16(0).u32(0).u32(0).u32(0).u16(v.width).u16(v.height).u32(0x480000).u32(0x480000).u32(0).u16(1); for (var j = 0; j < 32; j++) x.u8(0); x.u16(0x18).u16(0xffff); }),
      box('avcC', [v.description])]);
  }
  function audioEntry(a) {
    return box('mp4a', [w(function (x) { for (var i = 0; i < 6; i++) x.u8(0); x.u16(1).u32(0).u32(0).u16(a.channels).u16(16).u16(0).u16(0).u32(a.sampleRate * 65536); }),
      esds(a.description || ascOf(a.sampleRate, a.channels), a.bitrate || 128000)]);
  }
  // bảng mẫu: stts (thời lượng, gộp lượt bằng nhau) · stss (khung khoá, chỉ video) · stsc (1 mẫu / chunk) · stsz · co64 (vị trí tuyệt đối)
  function stbl(entry, durs, sizes, offs, keys) {
    var stts = [];
    durs.forEach(function (d) { var L = stts[stts.length - 1]; if (L && L[1] === d) L[0]++; else stts.push([1, d]); });
    var parts = [full('stsd', 0, 0, [w(function (x) { x.u32(1); }), entry]),
      full('stts', 0, 0, [w(function (x) { x.u32(stts.length); stts.forEach(function (e) { x.u32(e[0]).u32(e[1]); }); })])];
    if (keys) parts.push(full('stss', 0, 0, [w(function (x) { x.u32(keys.length); keys.forEach(function (k) { x.u32(k + 1); }); })]));
    parts.push(full('stsc', 0, 0, [w(function (x) { x.u32(1).u32(1).u32(1).u32(1); })]),
      full('stsz', 0, 0, [w(function (x) { x.u32(0).u32(sizes.length); sizes.forEach(function (s) { x.u32(s); }); })]),
      full('co64', 0, 0, [w(function (x) { x.u32(offs.length); offs.forEach(function (o) { x.u64(o); }); })]));
    return box('stbl', parts);
  }
  function mp4Parts(o) {
    var v = o.video, a = o.audio && o.audio.chunks && o.audio.chunks.length ? o.audio : null, MOV = 1000, i;
    need(v && v.codec === 'avc1', 'MP4 chỉ nhận video avc1 (H.264)');
    need(v.description && u8(v.description).length > 6, 'thiếu avcC (VideoEncoder avc.format = "avc")');
    need(v.chunks.length > 0, 'không có khung hình nào');
    need(v.chunks[0].key, 'khung đầu phải là khung khoá');
    need(!a || a.codec === 'mp4a', 'MP4 chỉ nhận tiếng mp4a (AAC)');
    for (i = 1; i < v.chunks.length; i++) need(v.chunks[i].ts > v.chunks[i - 1].ts, 'thời điểm khung không tăng dần (khung B chưa hỗ trợ)');
    var vts = 90000, ats = a ? a.sampleRate : 0;
    var frameDur = Math.round(vts / v.fps), vd = v.chunks.map(function () { return frameDur; }), vs = [], vk = [];
    v.chunks.forEach(function (c, k) { vs.push(u8(c.data).length); if (c.key) vk.push(k); });
    var vDur = frameDur * v.chunks.length;
    var ad = a ? a.chunks.map(function (c) { return Math.round(c.dur * ats / 1e6); }) : [], as = a ? a.chunks.map(function (c) { return u8(c.data).length; }) : [];
    var aDur = ad.reduce(function (s, x) { return s + x; }, 0);
    // thứ tự trong mdat: xen kẽ theo thời gian (đầu đọc phát trực tuyến không phải nhảy xa); cùng thời điểm thì hình trước
    var items = [];
    v.chunks.forEach(function (c, k) { items.push({ t: c.ts, k: 0, i: k, d: u8(c.data) }); });
    if (a) a.chunks.forEach(function (c, k) { items.push({ t: c.ts, k: 1, i: k, d: u8(c.data) }); });
    items.sort(function (p, q) { return p.t - q.t || p.k - q.k || p.i - q.i; });
    function moov(vo, ao) {
      var tr = [box('trak', [tkhd(1, Math.round(vDur * MOV / vts), v.width, v.height, false), box('mdia', [mdhd(vts, vDur), hdlr('vide', 'gen-chibi video'),
        box('minf', [full('vmhd', 0, 1, [new Uint8Array(8)]), dinf(), stbl(videoEntry(v), vd, vs, vo, vk)])])])];
      if (a) tr.push(box('trak', [tkhd(2, Math.round(aDur * MOV / ats), 0, 0, true), box('mdia', [mdhd(ats, aDur), hdlr('soun', 'gen-chibi audio'),
        box('minf', [full('smhd', 0, 0, [new Uint8Array(4)]), dinf(), stbl(audioEntry(a), ad, as, ao, null)])])]));
      var dur = Math.max(Math.round(vDur * MOV / vts), a ? Math.round(aDur * MOV / ats) : 0);
      return box('moov', [mvhd(MOV, dur, a ? 3 : 2)].concat(tr));
    }
    var ftyp = box('ftyp', [w(function (x) { x.str('isom').u32(512); ['isom', 'iso2', 'avc1', 'mp41'].forEach(function (b) { x.str(b); }); })]);
    // co64 cỡ cố định → dựng moov một lần với vị trí 0 để biết cỡ, tính vị trí thật, dựng lại (cỡ phải y hệt)
    var moovLen = moov(vs.map(function () { return 0; }), as.map(function () { return 0; })).length, HDR = 16;
    var p = ftyp.length + moovLen + HDR, vo = [], ao = [], mdatLen = 0;
    items.forEach(function (it) { (it.k ? ao : vo)[it.i] = p; p += it.d.length; mdatLen += it.d.length; });
    var mo = moov(vo, ao);
    need(mo.length === moovLen, 'cỡ moov đổi giữa hai lần dựng');
    var mh = w(function (x) { x.u32(1).str('mdat').u64(mdatLen + HDR); });   // largesize
    return [ftyp, mo, mh].concat(items.map(function (it) { return it.d; }));
  }
  function mp4(o) { return concat(mp4Parts(o)); }

  /* ================================================================== WebM (tập con Matroska) */
  var ID = { EBML: 0x1A45DFA3, Segment: 0x18538067, SeekHead: 0x114D9B74, Seek: 0x4DBB, SeekID: 0x53AB, SeekPosition: 0x53AC, Info: 0x1549A966, Tracks: 0x1654AE6B,
    Cluster: 0x1F43B675, Cues: 0x1C53BB6B, Tags: 0x1254C367, Timecode: 0xE7, SimpleBlock: 0xA3 };
  function vint8(n) { return w(function (x) { x.u8(1); for (var i = 6; i >= 0; i--) x.u8(Math.floor(n / Math.pow(256, i)) & 255); }); }   // cỡ 8 byte cố định
  function idb(id) { return w(function (x) { if (id > 0xffffff) x.u32(id); else if (id > 0xffff) x.u24(id); else if (id > 0xff) x.u16(id); else x.u8(id); }); }
  function el(id, body) { body = Array.isArray(body) ? concat(body.map(u8)) : u8(body); return concat([idb(id), vint8(body.length), body]); }
  function uint(id, v) { var b = []; do { b.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0); return el(id, new Uint8Array(b)); }
  function uint8(id, v) { return el(id, w(function (x) { x.u64(v); })); }   // số nguyên 8 byte cố định (vị trí viết lại được)
  function flt(id, v) { var b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); }
  function str(id, s) { var b = []; s = unescape(encodeURIComponent(s)); for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); return el(id, new Uint8Array(b)); }
  function opusHead(a) { return w(function (x) { x.str('OpusHead').u8(1).u8(a.channels).u8(a.preSkip & 255).u8((a.preSkip >> 8) & 255).u8(a.sampleRate & 255).u8((a.sampleRate >> 8) & 255).u8((a.sampleRate >> 16) & 255).u8(0).u8(0).u8(0).u8(0); }); }
  function hms(ms) { var s = ms / 1000, h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s - h * 3600 - m * 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r.toFixed(9); }
  var VCODEC = { vp09: 'V_VP9', vp08: 'V_VP8', vp8: 'V_VP8', av01: 'V_AV1' };

  function WebmWriter(o) {
    need(o && o.video && VCODEC[o.video.codec], 'WebM cần video vp09 / vp8 / av01');
    need(!o.audio || o.audio.codec === 'opus', 'WebM chỉ nhận tiếng opus');
    need(typeof o.write === 'function', 'thiếu o.write(bytes, pos)');
    this.o = o; this.v = o.video; this.a = o.audio || null;
    this.qv = []; this.qa = []; this.pos = 0; this.headLen = 0; this.segStart = 0; this.cluster = null; this.cues = [];
    this.lastV = -1; this.lastA = -1; this.endV = 0; this.endA = 0; this.done = false; this.qBytes = 0; this.buffered = 0; this.maxBuffered = 0;   // buffered = cluster đang dựng + hàng chờ xen kẽ
  }
  WebmWriter.prototype._emit = function (b, pos) { this.o.write(b, pos); if (pos === undefined) this.pos += b.length; };
  WebmWriter.prototype._header = function (fin) {
    var v = this.v, a = this.a, self = this;
    var ebml = el(ID.EBML, [uint(0x4286, 1), uint(0x42F7, 1), uint(0x42F2, 4), uint(0x42F3, 8), str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2)]);
    var info = el(ID.Info, [uint(0x2AD7B1, 1000000), str(0x4D80, 'gen-chibi mux'), str(0x5741, 'gen-chibi'), flt(0x4489, fin ? fin.durationMs : 0)]);
    var tv = el(0xAE, [uint(0xD7, 1), uint8(0x73C5, 1), uint(0x83, 1), str(0x86, VCODEC[v.codec]), uint(0x9C, 0), uint(0x23E383, Math.round(1e9 / v.fps)),
      el(0xE0, [uint(0xB0, v.width), uint(0xBA, v.height)])]);
    var tracks = [tv];
    if (a) {
      var head = a.description ? u8(a.description) : opusHead(a), pre = a.preSkip != null ? a.preSkip : (head.length >= 12 ? head[10] | (head[11] << 8) : 0);
      tracks.push(el(0xAE, [uint(0xD7, 2), uint8(0x73C5, 2), uint(0x83, 2), str(0x86, 'A_OPUS'), uint(0x9C, 0), el(0x63A2, head), uint8(0x56AA, Math.round(pre * 1e9 / 48000)), uint(0x56BB, 80000000),
        el(0xE1, [flt(0xB5, a.sampleRate), uint(0x9F, a.channels)])]));
    }
    var trk = el(ID.Tracks, tracks);
    // SeekHead cỡ cố định (vị trí 8 byte) → viết lại lúc xong mà không đổi độ dài
    function seek(id, p) { return el(ID.Seek, [el(ID.SeekID, idb(id)), uint8(ID.SeekPosition, p)]); }
    function seekHead(cuesAt, tagsAt) { return el(ID.SeekHead, [seek(ID.Info, 0), seek(ID.Tracks, 0), seek(ID.Cues, cuesAt), seek(ID.Tags, tagsAt)]); }
    var sh0 = seekHead(0, 0), infoAt = sh0.length, trkAt = infoAt + info.length;
    var sh = el(ID.SeekHead, [seek(ID.Info, infoAt), seek(ID.Tracks, trkAt), seek(ID.Cues, fin ? fin.cuesAt : 0), seek(ID.Tags, fin ? fin.tagsAt : 0)]);
    var segSize = fin ? fin.segSize : 0;
    var out = concat([ebml, idb(ID.Segment), vint8(segSize), sh, info, trk]);
    self.segStart = ebml.length + 4 + 8;
    return out;
  };
  WebmWriter.prototype._block = function (it) {
    var c = this.cluster;
    if (!c || (it.tr === 1 && it.key) || it.ms - c.t0 > 30000) {
      this._closeCluster();
      c = this.cluster = { t0: it.ms, blocks: [], cue: it.tr === 1 && it.key, bytes: 0 };
    }
    var rel = it.ms - c.t0, h = w(function (x) { x.u8(0x80 | it.tr).u16(rel & 0xffff).u8(it.key ? 0x80 : 0); });
    var b = el(ID.SimpleBlock, [h, it.d]);
    c.blocks.push(b); c.bytes += b.length; this._mem();
  };
  WebmWriter.prototype._closeCluster = function () {
    var c = this.cluster; if (!c) return;
    if (!this.headLen) { var h = this._header(null); this.headLen = h.length; this._emit(h); }
    if (c.cue) this.cues.push({ t: c.t0, at: this.pos - this.segStart });
    this._emit(el(ID.Cluster, [uint(ID.Timecode, c.t0)].concat(c.blocks)));
    this.cluster = null; this._mem();
  };
  WebmWriter.prototype._mem = function () { this.buffered = (this.cluster ? this.cluster.bytes : 0) + this.qBytes; if (this.buffered > this.maxBuffered) this.maxBuffered = this.buffered; };
  // đẩy ra mọi mẫu chắc chắn đã đúng thứ tự: mẫu sớm nhất khi cả hai hàng đều có (hoặc không có track tiếng), hết thì thôi
  WebmWriter.prototype._pump = function (all) {
    for (;;) {
      var v = this.qv[0], a = this.qa[0], it;
      if (v && a) it = v.ms <= a.ms ? this.qv.shift() : this.qa.shift();
      else if (v && (!this.a || all)) it = this.qv.shift();
      else if (a && all) it = this.qa.shift();
      else break;
      this.qBytes -= it.d.length;
      this._block(it);
    }
  };
  WebmWriter.prototype.video = function (c) {
    need(!this.done, 'đã finish');
    var ms = Math.round(c.ts / 1000);
    need(this.lastV >= 0 || c.key, 'khung đầu phải là khung khoá');
    need(ms > this.lastV, 'thời điểm khung không tăng dần');
    this.lastV = ms; this.endV = c.ts + 1e6 / this.v.fps;
    var vd = u8(c.data); this.qv.push({ ms: ms, tr: 1, key: !!c.key, d: vd }); this.qBytes += vd.length; this._mem(); this._pump(false);
  };
  WebmWriter.prototype.audio = function (c) {
    need(!this.done, 'đã finish'); need(this.a, 'không khai báo track tiếng');
    var ms = Math.round(c.ts / 1000);
    need(ms >= this.lastA, 'thời điểm tiếng không tăng dần');
    this.lastA = ms; this.endA = c.ts + (c.dur || 0);
    var ad = u8(c.data); this.qa.push({ ms: ms, tr: 2, key: true, d: ad }); this.qBytes += ad.length; this._mem(); this._pump(false);
  };
  WebmWriter.prototype.finish = function () {
    need(!this.done, 'đã finish');
    this._pump(true); this._closeCluster(); this.done = true;
    need(this.headLen, 'không có khung hình nào');
    var durMs = Math.max(this.endV, this.endA) / 1000;
    var cuesAt = this.pos - this.segStart;
    this._emit(el(ID.Cues, this.cues.map(function (q) { return el(0xBB, [uint(0xB3, q.t), el(0xB7, [uint(0xF7, 1), uint8(0xF1, q.at)])]); })));
    var tagsAt = this.pos - this.segStart, self = this;
    function tag(uid, ms) { return el(0x7373, [el(0x63C0, [uint8(0x63C5, uid)]), el(0x67C8, [str(0x45A3, 'DURATION'), str(0x4487, hms(ms))])]); }
    this._emit(el(ID.Tags, [tag(1, this.endV / 1000)].concat(this.a ? [tag(2, this.endA / 1000)] : [])));
    var head = this._header({ durationMs: durMs, cuesAt: cuesAt, tagsAt: tagsAt, segSize: this.pos - self.segStart });
    need(head.length === this.headLen, 'cỡ phần đầu đổi khi viết lại');
    this._emit(head, 0);
    return { bytes: this.pos, durationMs: durMs, maxBuffered: this.maxBuffered };
  };
  function webm(o) {
    var parts = [];
    var wr = new WebmWriter({ video: o.video, audio: o.audio, write: function (b, pos) { if (pos === 0) { need(parts.length && parts[0].length === b.length, 'viết đè sai'); parts[0] = b; } else parts.push(b); } });
    var items = [];
    o.video.chunks.forEach(function (c) { items.push([c.ts, 0, c]); });
    if (o.audio) (o.audio.chunks || []).forEach(function (c) { items.push([c.ts, 1, c]); });
    items.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    items.forEach(function (x) { if (x[1]) wr.audio(x[2]); else wr.video(x[2]); });
    wr.finish();
    return concat(parts);
  }

  /* ================================================================== đồng bộ tiếng: bù độ trễ mồi của bộ mã hoá (encoder delay / priming) KHÔNG dùng edit list
   * AAC: bộ mã hoá luôn nhả trước D mẫu "mồi" (Apple AudioToolbox thường 2112, FFmpeg / Media Foundation thường 1024 — KHÔNG đoán theo hệ điều hành).
   * MP4 không edit list (YouTube khuyên) → đầu phát giải mã từ mẫu 0 → tiếng trễ D mẫu so với hình + dài thêm D + đệm cuối.
   * Cách bù: ĐO D trên chính bộ mã hoá của trình duyệt (mã hoá tín hiệu hiệu chuẩn → giải mã → tương quan chéo), rồi BỎ D mẫu PCM đầu phim
   * trước khi đưa vào bộ mã hoá (D < 0: chèn −D mẫu im lặng) → mẫu giải mã thứ j = mẫu phim thứ j. Đuôi: cắt các gói bắt đầu từ mốc cuối hình trở đi.
   *   sync.noise(n, seed)                → Float32Array nhiễu trắng tất định (mẫu dấu / tín hiệu hiệu chuẩn)
   *   sync.calibSignal(sr)               → { pcm, at, tpl }   im lặng · nhiễu tpl tại mẫu `at` · im lặng
   *   sync.findLag(tpl, sig, lo, hi)     → { lag, score }      vị trí k ∈ [lo, hi] mà sig[k…] giống tpl nhất (tương quan chuẩn hoá, score ∈ [−1, 1])
   *   sync.delayOf(cal, decoded)         → { delay, score }    độ trễ đo được (mẫu) từ PCM giải mã của calibSignal
   *   sync.lagRanges(cal, step)          → [[lo, hi]…]          dải của delayOf cắt từng đoạn (findLag từng đoạn rồi gộp = delayOf)
   *   sync.hints(chunks, inFrames, sr)   → gợi ý bộ mã hoá TỰ BÁO: ts gói đầu (âm?), tổng mẫu ra so với mẫu vào
   *   sync.pick(measured, hints, sr)     → { shift, source }   chọn độ bù: đo giải mã (tin cậy) > ts âm của gói đầu > 0
   *   new sync.Feeder({ shift, marks, gap }) .push(l, r) · .take(limit, emit(l, r, n, outPos))   PCM phim → bộ mã hoá, bỏ / chèn đầu, dập mẫu dấu (test)
   *   sync.trim(chunks, endFrames, sr)   → { chunks, dropped, frames }   giữ gói khi điểm bắt đầu (theo mẫu giải mã) < endFrames */
  function noise(n, seed) { var s = seed >>> 0 || 1, o = new Float32Array(n); for (var i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; o[i] = (s / 4294967296 - 0.5); } return o; }
  function calibSignal(sr) { var tpl = noise(4096, 0xC0FFEE), at = Math.round(sr * 0.2), pcm = new Float32Array(at + tpl.length + Math.round(sr * 0.3)); pcm.set(tpl, at); return { pcm: pcm, at: at, tpl: tpl }; }
  function findLag(tpl, sig, lo, hi) {
    lo = Math.max(0, lo | 0); hi = Math.min(sig.length - tpl.length, hi | 0);
    var et = 0, i, k, best = { lag: -1, score: -2 }, L = tpl.length;
    for (i = 0; i < L; i++) et += tpl[i] * tpl[i];
    if (hi < lo || !et) return best;
    var es = 0; for (i = 0; i < L; i++) es += sig[lo + i] * sig[lo + i];
    for (k = lo; k <= hi; k++) {
      if (k > lo) { es += sig[k + L - 1] * sig[k + L - 1] - sig[k - 1] * sig[k - 1]; if (es < 0) es = 0; }
      var c = 0; for (i = 0; i < L; i++) c += tpl[i] * sig[k + i];
      var sc = es > 1e-12 ? c / Math.sqrt(et * es) : 0;
      if (sc > best.score) best = { lag: k, score: sc };
    }
    return best;
  }
  function delayOf(cal, decoded) { var r = findLag(cal.tpl, decoded, cal.at - 4096, cal.at + 8192); return { delay: r.lag < 0 ? null : r.lag - cal.at, score: r.score }; }
  // dải độ trễ của delayOf cắt thành đoạn `step` vị trí (trang xuất chạy mỗi đoạn một tác vụ — ngân sách long task); gộp: điểm cao nhất, hoà thì sớm hơn
  function lagRanges(cal, step) { var out = [], lo = Math.max(0, cal.at - 4096), hi = cal.at + 8192; step = Math.max(1, step | 0); for (var a = lo; a <= hi; a += step) out.push([a, Math.min(hi, a + step - 1)]); return out; }
  function hints(chunks, inFrames, sr) {
    var out = 0; chunks.forEach(function (c) { out += Math.round(c.dur * sr / 1e6); });
    var t0 = chunks.length ? chunks[0].ts : 0;
    return { chunks: chunks.length, firstTs: t0, negative: chunks.filter(function (c) { return c.ts < 0; }).length, outFrames: out, inFrames: inFrames, extra: out - inFrames,
      tsDelay: t0 < 0 ? Math.round(-t0 * sr / 1e6) : 0 };
  }
  // độ bù hợp lệ: |D| ≤ 3 khung AAC + vài mẫu (8192 rộng rãi) và tương quan rõ (≥ 0,5); không thì lùi về ts âm của gói đầu, rồi 0 (in ra nguồn để CI thấy)
  function pick(measured, h) {
    if (measured && measured.delay != null && measured.score >= 0.5 && Math.abs(measured.delay) <= 8192) return { shift: measured.delay, source: 'decode' };
    if (h && h.tsDelay > 0 && h.tsDelay <= 8192) return { shift: h.tsDelay, source: 'timestamp' };
    return { shift: 0, source: 'none' };
  }
  function Feeder(o) {
    o = o || {};
    this.q = []; this.got = 0; this.pos = 0; this.out = 0;
    this.drop = Math.max(0, o.shift | 0); this.pad = Math.max(0, -(o.shift | 0)); this.shift = o.shift | 0;
    this.marks = o.marks || []; this.gap = o.gap == null ? 9600 : o.gap;
  }
  Feeder.prototype.push = function (l, r) { this.q.push({ l: l, r: r || l }); this.got += l.length; };
  // dập mẫu dấu (chỉ khi test): vùng [at − gap, at + len + gap) im lặng, tpl tại `at` — vị trí theo MẪU PHIM
  Feeder.prototype._stamp = function (l, r, p0) {
    var n = l.length, gap = this.gap;
    this.marks.forEach(function (m) {
      var a = m.at - gap, b = m.at + m.tpl.length + gap, s = Math.max(a, p0), e = Math.min(b, p0 + n);
      for (var p = s; p < e; p++) { var v = p >= m.at && p < m.at + m.tpl.length ? m.tpl[p - m.at] : 0; l[p - p0] = v; r[p - p0] = v; }
    });
  };
  // đưa mẫu phim [pos, limit) ra emit(l, r, n, outPos): bỏ `drop` mẫu đầu / chèn `pad` mẫu im lặng trước tiên
  Feeder.prototype.take = function (limit, emit) {
    if (this.pad && limit > this.pos) { var z = new Float32Array(this.pad); emit(z, z, this.pad, this.out); this.out += this.pad; this.pad = 0; }
    while (this.q.length && this.pos < limit) {
      var b = this.q[0], n = Math.min(b.l.length, limit - this.pos);
      var l = b.l.slice(0, n), r = b.r === b.l ? l.slice() : b.r.slice(0, n);
      if (this.marks.length) this._stamp(l, r, this.pos);
      var skip = Math.min(this.drop, n);
      if (n > skip) { emit(skip ? l.subarray(skip) : l, skip ? r.subarray(skip) : r, n - skip, this.out); this.out += n - skip; }
      this.drop -= skip; this.pos += n;
      if (n === b.l.length) this.q.shift(); else this.q[0] = { l: b.l.subarray(n), r: b.r.subarray(n) };
    }
  };
  function trim(chunks, endFrames, sr) {
    var keep = [], pos = 0;
    for (var i = 0; i < chunks.length && pos < endFrames; i++) { keep.push(chunks[i]); pos += Math.round(chunks[i].dur * sr / 1e6); }
    return { chunks: keep, dropped: chunks.length - keep.length, frames: pos };
  }
  var sync = { noise: noise, calibSignal: calibSignal, findLag: findLag, delayOf: delayOf, lagRanges: lagRanges, hints: hints, pick: pick, Feeder: Feeder, trim: trim };

  var API = { mp4: mp4, mp4Parts: mp4Parts, webm: webm, WebmWriter: WebmWriter, concat: concat, ascOf: ascOf, sync: sync };
  if (typeof module === 'object' && module.exports) module.exports = API; else root.GenMux = API;
})(typeof self !== 'undefined' ? self : this);
