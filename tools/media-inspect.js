// Đọc cấu trúc tệp MP4 / WebM do studio/video/mux.js ghép (chỉ dùng để KIỂM THỬ — tools/test-video.mjs, tools/video-ci.mjs, test trình duyệt).
// Không phải bộ tách luồng đầy đủ: đủ để kiểm thứ tự hộp, bảng mẫu, khung khoá, thời lượng, xen kẽ tiếng / hình.
//   inspectMp4(buf)  → { top: ['ftyp','moov','mdat'], edts, brands, tracks: [{ handler, codec, timescale, duration, samples: [{ dts, dur, size, offset, key }], avcC, esds, asc }], movieDuration, mdat: {start,end} }
//   decodeAudio(file) → { pcm: Float32Array (mono, 48 kHz), sr, firstPts (giây — mốc của mẫu giải mã đầu tiên trên dòng thời gian tệp) } | { error }   (cần ffmpeg + ffprobe)
//   measureMarks(dec, marks, win) → [{ at, expectMs, foundMs, offsetMs, score }]   tìm từng mẫu dấu (GenMux.sync.noise) trong PCM giải mã ±win mẫu
//   inspectWebm(buf) → { docType, segmentSize, segmentEnd, durationMs, seek: {id: pos}, tracks: [{ number, codec, uid, codecPrivate, codecDelay }], clusters: [{ pos, t0, blocks }], blocks: [{ track, ms, key, size, order }], cues: [{ t, pos }], tags: {uid: 'hh:mm:ss…'} }
// © 2026 Gen Labs — All rights reserved.
'use strict';

function be(b, p, n) { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[p + i]; return v; }
const s4 = (b, p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);

/* ---------------------------------------------------------------- MP4 */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts', 'udta', 'mvex']);
function boxes(b, start, end) {
  const out = [];
  for (let p = start; p < end;) {
    let size = be(b, p, 4); const type = s4(b, p + 4); let hdr = 8;
    if (size === 1) { size = be(b, p + 8, 8); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) throw new Error('hộp ' + type + ' tại ' + p + ' cỡ ' + size + ' vượt ra ngoài (' + end + ')');
    const bx = { type, start: p, size, body: p + hdr, end: p + size };
    if (CONTAINERS.has(type)) bx.kids = boxes(b, bx.body, bx.end);
    out.push(bx); p += size;
  }
  return out;
}
const find = (list, type) => (list || []).find(x => x.type === type);
const path = (list, ...types) => types.reduce((l, t) => l && find(l.kids || l, t), { kids: list });
function inspectMp4(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const top = boxes(b, 0, b.length), r = { top: top.map(x => x.type), tracks: [] };
  const ftyp = find(top, 'ftyp'); if (ftyp) { r.major = s4(b, ftyp.body); r.brands = []; for (let p = ftyp.body + 8; p < ftyp.end; p += 4) r.brands.push(s4(b, p)); }
  const moov = find(top, 'moov'), mdat = find(top, 'mdat');
  if (!moov) throw new Error('không có moov');
  r.mdat = mdat ? { start: mdat.body, end: mdat.end } : null;
  const mv = find(moov.kids, 'mvhd'); r.movieTimescale = be(b, mv.body + 12, 4); r.movieDuration = be(b, mv.body + 16, 4);
  r.edts = false;
  for (const trak of moov.kids.filter(x => x.type === 'trak')) {
    if (find(trak.kids, 'edts')) r.edts = true;
    const tk = find(trak.kids, 'tkhd'), md = path(trak.kids, 'mdia', 'mdhd'), hd = path(trak.kids, 'mdia', 'hdlr'), st = path(trak.kids, 'mdia', 'minf', 'stbl');
    const t = { id: be(b, tk.body + 12, 4), tkhdDuration: be(b, tk.body + 20, 4), width: be(b, tk.body + 76, 2), height: be(b, tk.body + 80, 2),
      timescale: be(b, md.body + 12, 4), duration: be(b, md.body + 16, 4), handler: s4(b, hd.body + 8) };
    const stsd = find(st.kids, 'stsd'), entry = stsd.body + 8; t.codec = s4(b, entry + 4);
    const eSize = be(b, entry, 4), inner = boxes(b, entry + 8 + (t.handler === 'vide' ? 78 : 28), entry + eSize);
    const avcC = find(inner, 'avcC'), es = find(inner, 'esds');
    if (avcC) t.avcC = { profile: b[avcC.body + 1], level: b[avcC.body + 3], bytes: b.slice(avcC.body, avcC.end) };
    if (es) { t.esds = true; for (let p = es.body + 4; p < es.end - 1; p++) if (b[p] === 5 && b[p + 1] === 0x80) { t.asc = b.slice(p + 5, p + 5 + b[p + 4]); break; } }
    if (t.handler === 'soun') { t.channels = be(b, entry + 8 + 16, 2); t.sampleRate = be(b, entry + 8 + 24, 2); }
    const stts = find(st.kids, 'stts'), stsz = find(st.kids, 'stsz'), co = find(st.kids, 'co64') || find(st.kids, 'stco'), stss = find(st.kids, 'stss'), stsc = find(st.kids, 'stsc');
    const durs = []; for (let i = 0, n = be(b, stts.body + 4, 4); i < n; i++) { const c = be(b, stts.body + 8 + i * 8, 4), d = be(b, stts.body + 12 + i * 8, 4); for (let k = 0; k < c; k++) durs.push(d); }
    const fixed = be(b, stsz.body + 4, 4), count = be(b, stsz.body + 8, 4), sizes = []; for (let i = 0; i < count; i++) sizes.push(fixed || be(b, stsz.body + 12 + i * 4, 4));
    const w = co.type === 'co64' ? 8 : 4, offs = []; for (let i = 0, n = be(b, co.body + 4, 4); i < n; i++) offs.push(be(b, co.body + 8 + i * w, w));
    const sc = []; for (let i = 0, n = be(b, stsc.body + 4, 4); i < n; i++) sc.push([be(b, stsc.body + 8 + i * 12, 4), be(b, stsc.body + 12 + i * 12, 4)]);
    t.stsc = sc;
    const keys = stss ? new Set(Array.from({ length: be(b, stss.body + 4, 4) }, (_, i) => be(b, stss.body + 8 + i * 4, 4) - 1)) : null;
    t.keyCount = keys ? keys.size : count;
    if (durs.length !== count) throw new Error('track ' + t.handler + ': stts ' + durs.length + ' mẫu ≠ stsz ' + count);
    // vị trí mẫu: chỉ hỗ trợ đúng kiểu mux.js viết (1 mẫu / chunk) — kiểu khác thì báo
    if (!(sc.length === 1 && sc[0][0] === 1 && sc[0][1] === 1) || offs.length !== count) throw new Error('track ' + t.handler + ': stsc / co64 không phải 1 mẫu mỗi chunk');
    let dts = 0; t.samples = sizes.map((size, i) => { const s = { dts, dur: durs[i], size, offset: offs[i], key: keys ? keys.has(i) : true }; dts += durs[i]; return s; });
    r.tracks.push(t);
  }
  return r;
}

/* ---------------------------------------------------------------- WebM / EBML */
function vint(b, p, keepMarker) {
  const first = b[p]; let len = 1, mask = 0x80;
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 8) throw new Error('vint hỏng tại ' + p);
  let v = keepMarker ? first : first & (mask - 1), allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < len; i++) { v = v * 256 + b[p + i]; if (b[p + i] !== 255) allOnes = false; }
  return { v, len, unknown: !keepMarker && allOnes };
}
const MASTER = new Set([0x18538067, 0x114D9B74, 0x4DBB, 0x1549A966, 0x1654AE6B, 0xAE, 0xE0, 0xE1, 0x1F43B675, 0x1C53BB6B, 0xBB, 0xB7, 0x1254C367, 0x7373, 0x63C0, 0x67C8, 0x1A45DFA3]);
function elements(b, start, end, out, depth) {
  for (let p = start; p < end;) {
    const id = vint(b, p, true), sz = vint(b, p + id.len, false), body = p + id.len + sz.len;
    if (sz.unknown) throw new Error('phần tử 0x' + id.v.toString(16) + ' cỡ "không biết" — mux.js luôn ghi cỡ thật');
    const e = { id: id.v, pos: p, body, end: body + sz.v, depth };
    if (e.end > end) throw new Error('phần tử 0x' + id.v.toString(16) + ' tại ' + p + ' vượt ra ngoài cha (' + e.end + ' > ' + end + ')');
    out.push(e);
    if (MASTER.has(id.v)) elements(b, body, e.end, out, depth + 1);
    p = e.end;
  }
  return out;
}
function inspectWebm(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const all = elements(b, 0, b.length, [], 0), r = { tracks: [], clusters: [], blocks: [], cues: [], seek: {}, tags: {} };
  const uintAt = e => be(b, e.body, e.end - e.body), strAt = e => Buffer.from(b.subarray(e.body, e.end)).toString('utf8');
  const top = all.filter(e => e.depth === 0).map(e => e.id);
  if (top[0] !== 0x1A45DFA3 || top[1] !== 0x18538067 || top.length !== 2) throw new Error('cấp ngoài cùng phải là EBML + Segment, có ' + top.map(x => x.toString(16)));
  const seg = all.find(e => e.id === 0x18538067); r.segmentSize = seg.end - seg.body; r.segmentEnd = seg.end; r.fileSize = b.length;
  const segStart = seg.body;
  r.docType = strAt(all.find(e => e.id === 0x4282));
  let curTrack = null, curCluster = null, seekId = null, cueT = null, tagUid = null, tagName = null, order = 0;
  for (const e of all) {
    switch (e.id) {
      case 0x53AB: seekId = be(b, e.body, e.end - e.body); break;
      case 0x53AC: r.seek[seekId.toString(16)] = uintAt(e); break;
      case 0x4489: r.durationMs = e.end - e.body === 8 ? new DataView(b.buffer, b.byteOffset + e.body, 8).getFloat64(0) : new DataView(b.buffer, b.byteOffset + e.body, 4).getFloat32(0); break;
      case 0xAE: curTrack = {}; r.tracks.push(curTrack); break;
      case 0xD7: curTrack.number = uintAt(e); break;
      case 0x73C5: curTrack.uid = uintAt(e); break;
      case 0x86: curTrack.codec = strAt(e); break;
      case 0x63A2: curTrack.codecPrivate = b.slice(e.body, e.end); break;
      case 0x56AA: curTrack.codecDelay = uintAt(e); break;
      case 0x23E383: curTrack.defaultDuration = uintAt(e); break;
      case 0xB0: curTrack.width = uintAt(e); break;
      case 0xBA: curTrack.height = uintAt(e); break;
      case 0x9F: curTrack.channels = uintAt(e); break;
      case 0x1F43B675: curCluster = { pos: e.pos - segStart, t0: null, blocks: 0 }; r.clusters.push(curCluster); break;
      case 0xE7: if (curCluster && e.depth === 2) curCluster.t0 = uintAt(e); break;
      case 0xA3: {
        const tn = vint(b, e.body, false), rel = (b[e.body + tn.len] << 24 >> 16) | b[e.body + tn.len + 1], fl = b[e.body + tn.len + 2];
        r.blocks.push({ track: tn.v, ms: curCluster.t0 + rel, key: !!(fl & 0x80), size: e.end - e.body - tn.len - 3, order: order++, cluster: r.clusters.length - 1 });
        curCluster.blocks++; break;
      }
      case 0xB3: cueT = uintAt(e); break;
      case 0xF1: r.cues.push({ t: cueT, pos: uintAt(e) }); break;
      case 0x63C5: tagUid = uintAt(e); break;
      case 0x45A3: tagName = strAt(e); break;
      case 0x4487: if (tagName === 'DURATION') r.tags[tagUid] = strAt(e); break;
    }
  }
  r.segStart = segStart;
  r.elementAt = pos => { const e = all.find(x => x.pos === segStart + pos); return e ? e.id : null; };
  return r;
}

/* ---------------------------------------------------------------- giải mã THẬT bằng ffmpeg (như đầu phát không đọc edit list) → đo vị trí tiếng */
function decodeAudio(file) {
  const { spawnSync } = require('child_process');
  const pr = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_frames', '-read_intervals', '%+#1', '-show_entries', 'stream=sample_rate:frame=pts_time', '-of', 'json', file], { encoding: 'utf8' });
  if (pr.error || pr.status !== 0) return { error: 'ffprobe: ' + (pr.error ? pr.error.message : pr.stderr.slice(0, 300)) };
  const j = JSON.parse(pr.stdout), sr = +(j.streams && j.streams[0] && j.streams[0].sample_rate), firstPts = +(j.frames && j.frames[0] && j.frames[0].pts_time);
  if (!sr || !isFinite(firstPts)) return { error: 'ffprobe không đọc được sample_rate / pts khung tiếng đầu: ' + pr.stdout.slice(0, 300) };
  // -ac 1: trộn mono (hai kênh y hệt nhau ở tệp test); giữ nguyên tần số mẫu; không lọc gì thêm → mẫu thứ i ở thời điểm firstPts + i / sr
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-c:a', 'pcm_f32le', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.error || r.status !== 0) return { error: 'ffmpeg: ' + (r.error ? r.error.message : String(r.stderr).slice(0, 300)) };
  const b = r.stdout, pcm = new Float32Array(b.length >> 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = b.readFloatLE(i * 4);
  return { pcm, sr, firstPts, durationMs: (firstPts + pcm.length / sr) * 1000 };
}
function measureMarks(dec, marks, win) {
  const { sync } = require('../studio/video/mux.js');
  return marks.map(m => {
    const exp = m.at - Math.round(dec.firstPts * dec.sr), r = sync.findLag(m.tpl, dec.pcm, exp - win, exp + win);
    return { at: m.at, expectMs: m.at / dec.sr * 1000, foundMs: r.lag < 0 ? null : (r.lag / dec.sr + dec.firstPts) * 1000, offsetMs: r.lag < 0 ? null : (r.lag - exp) / dec.sr * 1000, offsetSamples: r.lag < 0 ? null : r.lag - exp, score: r.score };
  });
}

module.exports = { inspectMp4, inspectWebm, decodeAudio, measureMarks };
