// Xuất video v0.22 — phần chạy được trong Node (tools/test.sh): bộ ghép MP4 / WebM (studio/video/mux.js), đồng hồ ảo (studio/video/vclock.js, trong vm
// với cửa sổ giả), tệp chữ (.srt / .txt), header của server theo từng loại tệp (CNS-214), rào cách ly (CNS-228).
// Có ffmpeg + ffprobe (máy Gen) → còn ghép luồng THẬT do ffmpeg mã hoá (H.264 + AAC → MP4, VP9 + Opus → WebM) rồi giải mã lại sạch + đếm khung.
// Không có (runner CI ubuntu) → bỏ qua phần giải mã, IN RÕ là đã bỏ qua. Phần trình duyệt: GC_ONLY=video node tools/test-browser.mjs.
// © 2026 Gen Labs — All rights reserved.
import { createRequire } from 'module';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(ROOT, 'studio/video/mux.js'));
const { inspectMp4, inspectWebm, decodeAudio, measureMarks } = require(path.join(ROOT, 'tools/media-inspect.js'));
const T = require(path.join(ROOT, 'studio/video/text.js'));
let bad = 0;
const no = (cond, msg) => { if (cond) { bad++; console.log('   ✗ ' + msg); } return !cond; };
const ok = msg => console.log('   ✓ ' + msg);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-video-'));

/* ---------------------------------------------------------------- luồng giả (cấu trúc, không giải mã) */
function rnd(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
const R = rnd(42);
const bytes = (n, tag) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (R() * 256) | 0; b[0] = tag & 255; b[1] = (tag >> 8) & 255; return b; };
function fakeStreams(sec, fps, gop) {
  const v = [], a = [];
  for (let i = 0; i < Math.round(sec * fps); i++) v.push({ data: bytes(i % gop ? 300 + (i % 7) * 40 : 4000, i), ts: Math.round(i * 1e6 / fps), key: i % gop === 0 });
  for (let i = 0; i * 1024 < sec * 48000; i++) a.push({ data: bytes(200 + (i % 5), 50000 + i), ts: Math.round(i * 1024 * 1e6 / 48000), dur: 1024 * 1e6 / 48000 });
  return { v, a };
}
const AVCC = new Uint8Array([1, 0x64, 0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x1f, 1, 0, 4, 0x68, 0xee, 0x3c, 0x80]);

console.log('   — MP4 (luồng giả 4 s, 30 khung/s, khung khoá mỗi 30, AAC 1024 mẫu)');
{
  const { v, a } = fakeStreams(4, 30, 30);
  const out = M.mp4({ video: { codec: 'avc1', width: 1280, height: 720, fps: 30, description: AVCC, chunks: v }, audio: { codec: 'mp4a', sampleRate: 48000, channels: 2, chunks: a } });
  const r = inspectMp4(out);
  no(r.top.join() !== 'ftyp,moov,mdat', 'thứ tự hộp phải là ftyp → moov → mdat (fast start), có ' + r.top.join());
  no(r.edts, 'không được có edit list (edts)');
  no(!r.brands.includes('avc1') || r.major !== 'isom', 'ftyp: major isom + brand avc1');
  const V = r.tracks.find(t => t.handler === 'vide'), A = r.tracks.find(t => t.handler === 'soun');
  no(!V || V.codec !== 'avc1' || !V.avcC || V.width !== 1280 || V.height !== 720, 'track hình avc1 1280×720 có avcC');
  no(!A || A.codec !== 'mp4a' || !A.esds || A.sampleRate !== 48000 || A.channels !== 2, 'track tiếng mp4a 48 kHz stereo có esds');
  no(!A.asc || A.asc[0] !== 0x11 || A.asc[1] !== 0x90, 'AudioSpecificConfig tự dựng khi thiếu description = AAC-LC 48 kHz stereo (11 90), có ' + (A.asc && Buffer.from(A.asc).toString('hex')));
  no(V.samples.length !== v.length || A.samples.length !== a.length, 'số mẫu: hình ' + V.samples.length + '/' + v.length + ', tiếng ' + A.samples.length + '/' + a.length);
  no(V.samples.some((s, i) => s.size !== v[i].data.length) || A.samples.some((s, i) => s.size !== a[i].data.length), 'stsz khớp cỡ từng mẫu');
  no(V.samples.some((s, i) => s.key !== v[i].key) || V.keyCount !== 4, 'stss = đúng 4 khung khoá ở 0, 30, 60, 90');
  no(V.duration / V.timescale !== 4 || Math.abs(r.movieDuration / r.movieTimescale - 4.011) > 0.01, 'thời lượng: hình 4 s (mdhd), phim = max(hình, tiếng) ≈ 4,011 s; có ' + V.duration / V.timescale + ' / ' + r.movieDuration / r.movieTimescale);
  no(A.samples.some(s => s.dur !== 1024), 'stts tiếng: mỗi mẫu 1024');
  // vị trí mẫu (co64) trỏ đúng vào dữ liệu của chính mẫu đó, nằm trong mdat
  const bad1 = V.samples.concat(A.samples).filter((s, i) => s.offset < r.mdat.start || s.offset + s.size > r.mdat.end);
  no(bad1.length, bad1.length + ' mẫu nằm ngoài mdat');
  no(V.samples.some((s, i) => out[s.offset] !== (i & 255) || out[s.offset + 1] !== ((i >> 8) & 255)) || A.samples.some((s, i) => out[s.offset] !== ((50000 + i) & 255)), 'co64 trỏ sai dữ liệu mẫu');
  // xen kẽ tiếng / hình theo thời gian: thứ tự trong mdat = thứ tự thời gian (không gom hết hình rồi mới tới tiếng)
  const all = V.samples.map(s => [s.offset, s.dts / V.timescale]).concat(A.samples.map(s => [s.offset, s.dts / A.timescale])).sort((x, y) => x[0] - y[0]);
  let back = 0; for (let i = 1; i < all.length; i++) if (all[i][1] < all[i - 1][1] - 1e-9) back++;
  no(back, 'mdat không xen kẽ theo thời gian (' + back + ' lần lùi)');
  const parts = M.mp4Parts({ video: { codec: 'avc1', width: 1280, height: 720, fps: 30, description: AVCC, chunks: v } });
  no(parts[3] !== v[0].data && parts[3].buffer !== v[0].data.buffer, 'mp4Parts phải trả CHÍNH dữ liệu mẫu (không chép) — Blob(parts) không nhân đôi bộ nhớ');
  let threw = 0;
  for (const [what, o] of [['khung đầu không phải khung khoá', { chunks: v.slice(1) }], ['thiếu avcC', { description: null }], ['codec vp09', { codec: 'vp09' }], ['thời điểm lùi (khung B)', { chunks: [v[0], v[2], v[1]] }]]) {
    try { M.mp4({ video: Object.assign({ codec: 'avc1', width: 8, height: 8, fps: 30, description: AVCC, chunks: v }, o) }); } catch (e) { threw++; continue; }
    no(true, 'mp4() phải từ chối: ' + what);
  }
  if (!bad) ok('MP4: ftyp → moov → mdat, không edts, avcC / esds (ASC tự dựng), stts / stsz / stss / co64 đúng từng mẫu, thời lượng, xen kẽ theo thời gian, mp4Parts không chép, từ chối ' + threw + ' đầu vào sai');
}

console.log('   — WebM ghi luồng (luồng giả 65 s: qua mốc 30 s của timecode cluster, khung khoá mỗi 2 s)');
{
  const b0 = bad;
  const sec = 65, { v } = fakeStreams(sec, 30, 60), a = [];
  for (let i = 0; i * 20 < sec * 1000; i++) a.push({ data: bytes(120, 60000 + i), ts: i * 20000, dur: 20000 });
  const writes = []; let size = 0, maxHeld = 0;
  const head = new Uint8Array([0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 2, 0x38, 0x01, 0x80, 0xBB, 0, 0, 0, 0, 0]);   // OpusHead, preSkip 312
  const wr = new M.WebmWriter({ video: { codec: 'vp09', width: 640, height: 360, fps: 30 }, audio: { codec: 'opus', sampleRate: 48000, channels: 2, description: head },
    write: (b, pos) => { writes.push([pos, b.length]); if (pos === 0) { no(b.length !== writes[0][1], 'viết đè phần đầu phải cùng độ dài'); store[0] = b; } else { store.push(b); size += b.length; } } });
  const store = [];
  // đưa vào như bộ mã hoá thật: tiếng đi sau hình một chút
  let ai = 0, fedBytes = 0, at30 = null;
  v.forEach((c, i) => { wr.video(c); fedBytes += c.data.length; while (ai < a.length && a[ai].ts <= c.ts - 50000) { fedBytes += a[ai].data.length; wr.audio(a[ai++]); } maxHeld = Math.max(maxHeld, wr.buffered); if (c.ts >= 30e6 && !at30) at30 = [size, fedBytes]; });
  while (ai < a.length) wr.audio(a[ai++]);
  const fin = wr.finish();
  // GHI LUỒNG thật sự (CNS-220): giữa chừng (mốc 30 s) phần lớn byte đã đưa vào phải đã ra tới nơi ghi — không gom cả tệp tới lúc finish
  no(!at30 || at30[0] < 0.8 * at30[1], 'giữa chừng (30 s) mới ghi ra ' + (at30 && at30[0]) + ' / ' + (at30 && at30[1]) + ' byte đã đưa vào — writer đang gom chứ không ghi luồng');
  const out = M.concat(store);
  let r = null; try { r = inspectWebm(out); } catch (e) { no(true, 'tệp WebM không đọc được: ' + e.message); }
  let threw = 0;
  if (r) {
  no(writes.filter(w => w[0] === 0).length !== 1 || writes[writes.length - 1][0] !== 0, 'phần đầu viết đè đúng MỘT lần, lúc finish');
  no(r.docType !== 'webm' || r.segmentEnd !== out.length, 'EBML webm, Segment có cỡ thật phủ tới cuối tệp');
  no(Math.abs(r.durationMs - sec * 1000) > 40, 'Duration ≈ ' + sec * 1000 + ' ms, có ' + r.durationMs);
  no(r.tracks.length !== 2 || r.tracks[0].codec !== 'V_VP9' || r.tracks[1].codec !== 'A_OPUS' || r.tracks[1].codecDelay !== Math.round(312 * 1e9 / 48000), 'track V_VP9 + A_OPUS (CodecDelay theo preSkip 312)');
  const vb = r.blocks.filter(b => b.track === 1), ab = r.blocks.filter(b => b.track === 2);
  no(vb.length !== v.length || ab.length !== a.length, 'số block: hình ' + vb.length + '/' + v.length + ', tiếng ' + ab.length + '/' + a.length);
  no(vb.some((b, i) => b.ms !== Math.round(v[i].ts / 1000) || b.key !== v[i].key), 'thời điểm / cờ khung khoá của block hình');
  no(r.clusters.some(c => c.t0 == null), 'cluster thiếu Timecode');
  const firstOf = r.clusters.map((c, k) => r.blocks.find(b => b.cluster === k));
  no(firstOf.some((b, k) => !(b.track === 1 && b.key) && !(r.clusters[k].t0 - r.clusters[k - 1].t0 > 0)), 'mỗi cluster mở bằng khung khoá (hoặc là cluster nối do mốc 30 s)');
  no(r.blocks.some(b => b.ms - r.clusters[b.cluster].t0 > 32767 || b.ms < r.clusters[b.cluster].t0), 'timecode tương đối của block tràn int16 / âm');
  let back = 0; for (let i = 1; i < r.blocks.length; i++) if (r.blocks[i].ms < r.blocks[i - 1].ms) back++;
  no(back, 'block không theo thứ tự thời gian (' + back + ' lần lùi) — tiếng / hình phải xen kẽ');
  no(r.cues.length !== Math.ceil(sec / 2) || r.cues.some(q => r.elementAt(q.pos) !== 0x1F43B675 || r.clusters.find(c => c.pos === q.pos).t0 !== q.t), 'Cues: mỗi khung khoá một mục, trỏ đúng cluster (vị trí + thời điểm)');
  no(r.elementAt(r.seek['1c53bb6b']) !== 0x1C53BB6B || r.elementAt(r.seek['1549a966']) !== 0x1549A966 || r.elementAt(r.seek['1654ae6b']) !== 0x1654AE6B || r.elementAt(r.seek['1254c367']) !== 0x1254C367, 'SeekHead trỏ đúng Info / Tracks / Cues / Tags');
  no(!/^00:01:05\.000/.test(r.tags[1] || '') || !/^00:01:05\.0/.test(r.tags[2] || ''), 'Tags DURATION từng track (ffprobe đọc được thời lượng stream), có ' + JSON.stringify(r.tags));
  no(fin.maxBuffered > 1.2 * 2 * 30 * 400 + 2 * 4000 + 100 * 140, 'bộ đệm ghi luồng phải ≤ ~1 cluster, đỉnh ' + fin.maxBuffered + ' byte');
  no(maxHeld > 60000, 'writer giữ ' + maxHeld + ' byte lúc đang ghi');
  no(size !== out.length, 'tổng byte ghi ra = cỡ tệp');
  for (const [what, f] of [['khung đầu không phải khung khoá', w => w.video(v[1])], ['thời điểm hình lùi', w => { w.video(v[0]); w.video(v[0]); }], ['tiếng khi không khai báo track', w => w.audio(a[0])]]) {
    const w = new M.WebmWriter({ video: { codec: 'vp09', width: 8, height: 8, fps: 30 }, write: () => {} });
    try { f(w); } catch (e) { threw++; continue; }
    no(true, 'WebmWriter phải từ chối: ' + what);
  }
  }
  if (bad === b0) ok('WebM ghi luồng: phần đầu viết đè đúng 1 lần (cùng độ dài), Segment / Duration / SeekHead / Cues / Tags đúng, cluster mở bằng khung khoá + nối ở mốc 30 s, xen kẽ theo thời gian, ghi ra dần trong lúc đưa vào (mốc 30 s: ' + Math.round(100 * at30[0] / at30[1]) + '% đã ra nơi ghi), bộ đệm ≤ 1 cluster + hàng chờ (' + fin.maxBuffered + ' B), từ chối ' + threw + ' đầu vào sai');
}

/* ---------------------------------------------------------------- đồng bộ tiếng: bù độ trễ mồi AAC KHÔNG edit list (GenMux.sync) — luồng giả mô phỏng 2 nền tảng
 * Bộ mã hoá giả: đầu ra giải mã = D mẫu mồi (im lặng) + đầu vào + đệm cuối tới bội 1024 (+ `flush` gói thừa), gói 1024 mẫu, ts từ 0 (hoặc −D nếu negTs).
 * Số liệu CI 39586887287: Windows tiếng +18,7 ms (khớp ceil(vào / 1024) gói), macOS +82,6 ms (khớp mồi 2112 + 1 gói thừa) — hai hồ sơ dưới đây. */
const SY = M.sync, SR = 48000;
function fakeAac(input, D, flush, negTs) {
  const total = Math.ceil((input.length + D) / 1024) * 1024 + (flush || 0) * 1024, dec = new Float32Array(total);
  dec.set(input, D);
  const chunks = []; for (let k = 0; k * 1024 < total; k++) chunks.push({ ts: Math.round((k * 1024 - (negTs ? D : 0)) * 1e6 / SR), dur: 1024e6 / SR, data: new Uint8Array(1) });
  return { dec, chunks };
}
// một lượt xuất giả: hiệu chuẩn → chọn độ bù → Feeder (từng khối 4096 của vòi, từng khung 1600 mẫu như capture.js) → mã hoá giả → cắt đuôi → đo mẫu dấu
function syncRun(P, film, marks, mut) {
  mut = mut || {};
  const cal = SY.calibSignal(SR), ce = fakeAac(cal.pcm, P.D, P.flush, P.negTs);
  const measured = mut.noCalib ? null : SY.delayOf(cal, ce.dec);
  let plan = SY.pick(measured, SY.hints(ce.chunks, cal.pcm.length, SR));
  if (mut.shift != null) plan = { shift: mut.shift, source: 'mutant' };
  const fd = new SY.Feeder({ shift: plan.shift, marks }), parts = [];
  for (let p = 0; p < film.length; p += 4096) fd.push(film.subarray(p, Math.min(film.length, p + 4096)), film.subarray(p, Math.min(film.length, p + 4096)));
  for (let lim = 0; lim <= film.length; lim += 1600) fd.take(Math.min(lim, fd.got), (l, r, n) => parts.push(l.slice(0, n)));
  fd.take(film.length, (l, r, n) => parts.push(l.slice(0, n)));
  const enc = new Float32Array(parts.reduce((a, x) => a + x.length, 0)); let q = 0; parts.forEach(x => { enc.set(x, q); q += x.length; });
  const out = fakeAac(enc, P.D, P.flush, P.negTs), tr = mut.noTrim ? { chunks: out.chunks, frames: out.dec.length } : SY.trim(out.chunks, film.length, SR);
  const dec = out.dec.subarray(0, tr.frames);
  const found = measureMarks({ pcm: dec, sr: SR, firstPts: 0 }, marks, 9000);
  return { plan, measured, found, frames: tr.frames, inFrames: fd.out };
}
// phán quyết như CI: mỗi mẫu dấu lệch ≤ 1 mẫu (luồng giả tất định) · tiếng trong [phim, phim + 1 khung AAC) · không bù theo hằng số hệ điều hành
function syncVerdict(r, filmLen) {
  const e = [];
  r.found.forEach((m, i) => { if (m.offsetSamples == null || Math.abs(m.offsetSamples) > 1 || m.score < 0.99) e.push('mẫu dấu ' + i + ' lệch ' + m.offsetSamples + ' mẫu (tương quan ' + m.score.toFixed(3) + ')'); });
  if (r.frames < filmLen || r.frames >= filmLen + 1024) e.push('tiếng ' + r.frames + ' mẫu ∉ [' + filmLen + ', ' + (filmLen + 1024) + ')');
  return e;
}
console.log('   — đồng bộ tiếng AAC: bù độ trễ mồi không edit list (luồng giả kiểu Windows mồi 1024 / macOS mồi 2112 + gói thừa)');
{
  const b0 = bad, N = 924800;   // = 578 khung @30 fps của fixture CI
  const film = new Float32Array(N); { const z = SY.noise(N, 77); for (let i = 0; i < N; i++) film[i] = 0.05 * z[i]; }   // nền ồn nhẹ (nhạc / giọng) quanh mẫu dấu
  const marks = [{ at: Math.round(0.5 * SR), tpl: SY.noise(2048, 0x5EED01) }, { at: N - Math.round(0.6 * SR), tpl: SY.noise(2048, 0x5EED02) }];
  const plats = [['Windows-kiểu (mồi 1024)', { D: 1024, flush: 0 }], ['macOS-kiểu (mồi 2112 + 1 gói thừa)', { D: 2112, flush: 1 }], ['macOS-kiểu, ts gói đầu âm', { D: 2112, flush: 1, negTs: true }]];
  const lines = [];
  for (const [name, P] of plats) {
    const r = syncRun(P, film, marks), v = syncVerdict(r, N);
    no(r.measured.delay !== P.D || r.plan.source !== 'decode', name + ': hiệu chuẩn phải đo đúng mồi ' + P.D + ', có ' + JSON.stringify(r.measured) + ' ' + JSON.stringify(r.plan));
    no(r.inFrames !== N - P.D, name + ': bộ mã hoá nhận phim − mồi = ' + (N - P.D) + ' mẫu, có ' + r.inFrames);
    no(v.length, name + ': bù + cắt đuôi phải khớp mẫu: ' + v.join('; '));
    // đột biến → phải ĐỎ
    const muts = [['không bù', { shift: 0 }], ['bù hằng số của hệ điều hành kia', { shift: P.D === 1024 ? 2112 : 1024 }], ['không cắt đuôi', { noTrim: true, flushOnly: true }]];
    let red = 0;
    for (const [mn, mu] of muts) {
      if (mu.flushOnly && !P.flush) continue;   // không gói thừa thì đuôi tự nhiên đã < 1 khung AAC
      const mv = syncVerdict(syncRun(P, film, marks, mu), N);
      if (mv.length) red++; else no(true, name + ': đột biến "' + mn + '" phải làm phép kiểm ĐỎ');
    }
    // không giải mã được (hiệu chuẩn hỏng): ts âm thì vẫn bù đúng, không thì nguồn 'none' (CI sẽ đỏ ở phép đo thật)
    const nc = syncRun(P, film, marks, { noCalib: true });
    no(P.negTs ? (nc.plan.source !== 'timestamp' || syncVerdict(nc, N).length) : (nc.plan.source !== 'none' || !syncVerdict(nc, N).length), name + ': lùi khi không hiệu chuẩn được: ' + JSON.stringify(nc.plan));
    lines.push(name + ' → bù ' + r.plan.shift + ', ' + red + ' đột biến đỏ');
  }
  // Feeder: shift âm chèn im lặng · mẫu dấu đè đúng chỗ (theo mẫu PHIM) · không đụng PCM gốc
  { const src = new Float32Array(10000).fill(0.25), fd = new SY.Feeder({ shift: -300, marks: [{ at: 5000, tpl: new Float32Array([1, -1]) }], gap: 10 }), got = [];
    fd.push(src, src); fd.take(3000, (l, r, n) => got.push(...l.subarray(0, n))); fd.take(10000, (l, r, n) => got.push(...l.subarray(0, n)));
    no(got.length !== 10300 || got[0] !== 0 || got[299] !== 0 || got[300] !== 0.25 || got[300 + 4990] !== 0 || got[5300] !== 1 || got[5301] !== -1 || got[5311] !== 0 || got[5312] !== 0.25 || src[5000] !== 0.25, 'Feeder: shift −300 chèn 300 mẫu im lặng, mẫu dấu tại mẫu phim 5000 (±gap im lặng), PCM gốc nguyên vẹn'); }
  no(SY.pick({ delay: 2112, score: 0.3 }, { tsDelay: 0 }).source !== 'none' || SY.pick({ delay: 99999, score: 1 }, { tsDelay: 2112 }).shift !== 2112, 'pick: tương quan yếu / độ trễ vô lý thì không tin số đo');
  if (bad === b0) ok('bù mồi AAC không edit list: ' + lines.join(' · ') + ' — hiệu chuẩn đo đúng mồi, mẫu dấu đầu + cuối lệch 0 mẫu, tiếng ∈ [hình, hình + 1 khung AAC); Feeder chèn im lặng khi bù âm; pick không tin số đo yếu');
}

/* ---------------------------------------------------------------- luồng THẬT do ffmpeg mã hoá → ghép → giải mã lại */
const have = c => spawnSync(c, ['-version'], { stdio: 'ignore' }).status === 0;
if (!have('ffmpeg') || !have('ffprobe')) console.log('   – BỎ QUA giải mã thật: máy này không có ffmpeg / ffprobe (cấu trúc tệp đã kiểm ở trên; máy Gen + job CI xuất video có ffprobe)');
else {
  const b0 = bad;
  const ff = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y'].concat(args), { encoding: 'utf8' }); if (r.status) throw new Error('ffmpeg ' + args.join(' ') + '\n' + r.stderr); };
  const probe = f => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,width,height,nb_read_frames,sample_rate,channels,duration:stream_tags=DURATION:format=duration,format_name', '-of', 'json', f], { encoding: 'utf8' }).stdout);
  const decodeClean = f => { const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-'], { encoding: 'utf8' }); return r.status === 0 && !r.stderr.trim() ? '' : 'rc ' + r.status + ' ' + r.stderr.slice(0, 300); };
  const src = ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=5', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=5'];
  // H.264 (không khung B, AUD để tách access unit) + AAC ADTS
  ff(src.concat(['-map', '0:v', '-c:v', 'libx264', '-profile:v', 'high', '-bf', '0', '-g', '30', '-pix_fmt', 'yuv420p', '-x264-params', 'aud=1', '-f', 'h264', path.join(TMP, 'v.h264')]));
  ff(src.concat(['-map', '1:a', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-f', 'adts', path.join(TMP, 'a.aac')]));
  const b = fs.readFileSync(path.join(TMP, 'v.h264')), nals = [];
  for (let i = 0, s = -1; i <= b.length; i++) {
    const sc = i + 3 <= b.length && b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 || (b[i + 2] === 0 && b[i + 3] === 1));
    if (sc || i === b.length) { if (s >= 0) nals.push(b.subarray(s, i)); if (sc) { i += b[i + 2] === 1 ? 2 : 3; s = i + 1; } }
  }
  let sps, pps; const aus = []; let cur = null;
  for (const n of nals) { const t = n[0] & 31; if (t === 9) { cur = { nals: [], key: false }; aus.push(cur); continue; } if (t === 7) { sps = sps || n; continue; } if (t === 8) { pps = pps || n; continue; } if (!cur) { cur = { nals: [], key: false }; aus.push(cur); } if (t === 5) cur.key = true; if (t === 1 || t === 5 || t === 6) cur.nals.push(n); }
  const avcC = Buffer.concat([Buffer.from([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 255]), sps, Buffer.from([1, pps.length >> 8, pps.length & 255]), pps]);
  const vch = aus.filter(x => x.nals.length).map((x, i) => ({ ts: Math.round(i * 1e6 / 30), key: x.key, data: Buffer.concat(x.nals.flatMap(n => { const l = Buffer.alloc(4); l.writeUInt32BE(n.length); return [l, n]; })) }));
  const ab = fs.readFileSync(path.join(TMP, 'a.aac')), ach = []; let asc = null;
  for (let p = 0; p < ab.length;) { const prot = !(ab[p + 1] & 1), len = ((ab[p + 3] & 3) << 11) | (ab[p + 4] << 3) | (ab[p + 5] >> 5), hl = prot ? 9 : 7;
    if (!asc) { const prof = (ab[p + 2] >> 6) + 1, sri = (ab[p + 2] >> 2) & 15, ch = ((ab[p + 2] & 1) << 2) | (ab[p + 3] >> 6); asc = Buffer.from([(prof << 3) | (sri >> 1), ((sri & 1) << 7) | (ch << 3)]); }
    ach.push({ ts: Math.round(ach.length * 1024 * 1e6 / 48000), dur: 1024 * 1e6 / 48000, data: ab.subarray(p + hl, p + len) }); p += len; }
  const mp4f = path.join(TMP, 'real.mp4');
  fs.writeFileSync(mp4f, M.mp4({ video: { codec: 'avc1', width: 640, height: 360, fps: 30, description: avcC, chunks: vch }, audio: { codec: 'mp4a', sampleRate: 48000, channels: 2, description: asc, chunks: ach } }));
  const pm = probe(mp4f), vs = pm.streams.find(s => s.codec_name === 'h264'), as = pm.streams.find(s => s.codec_name === 'aac');
  no(!vs || !as || +vs.nb_read_frames !== vch.length || vs.width !== 640 || +as.sample_rate !== 48000, 'ffprobe MP4: h264 640×360 ' + vch.length + ' khung + aac 48 kHz; có ' + JSON.stringify(pm.streams));
  no(Math.abs(+vs.duration - 5) > 0.04 || Math.abs(+as.duration - +vs.duration) > 1 / 30 + 0.025, 'MP4: thời lượng hình 5 s, tiếng ≈ hình (±1 khung); có ' + vs.duration + ' / ' + as.duration);
  const d1 = decodeClean(mp4f); no(d1, 'ffmpeg giải mã MP4 không sạch: ' + d1);
  // VP9 (IVF) + Opus (Ogg) → WebmWriter
  ff(src.concat(['-map', '0:v', '-c:v', 'libvpx-vp9', '-b:v', '1M', '-g', '60', '-deadline', 'realtime', '-cpu-used', '8', '-f', 'ivf', path.join(TMP, 'v.ivf')]));
  ff(src.concat(['-map', '1:a', '-c:a', 'libopus', '-b:a', '96k', '-ac', '2', '-f', 'ogg', path.join(TMP, 'a.ogg')]));
  const iv = fs.readFileSync(path.join(TMP, 'v.ivf')), vp = [];
  // khung khoá VP9 (profile 0): byte đầu = frame_marker(2) · profile(2) · show_existing_frame(1) · frame_type(1, 0 = KEY)
  for (let p = iv.readUInt16LE(6); p + 12 <= iv.length;) { const n = iv.readUInt32LE(p), pts = Number(iv.readBigUInt64LE(p + 4)), d = iv.subarray(p + 12, p + 12 + n); vp.push({ ts: Math.round(pts * 1e6 / 30), key: (d[0] & 0xC0) === 0x80 && !(d[0] & 0x08) && !(d[0] & 0x04), data: d }); p += 12 + n; }
  no(!vp[0].key || vp.filter(c => c.key).length < 3, 'luồng VP9 mẫu: phải nhận ra khung khoá (đầu + mỗi 60 khung), có ' + vp.filter(c => c.key).length);
  const og = fs.readFileSync(path.join(TMP, 'a.ogg')), pk = []; let part = [];
  for (let p = 0; p + 27 <= og.length;) { const ns = og[p + 26], segs = og.subarray(p + 27, p + 27 + ns); let q = p + 27 + ns; for (const L of segs) { part.push(og.subarray(q, q + L)); q += L; if (L < 255) { pk.push(Buffer.concat(part)); part = []; } } p = q; }
  const ohead = pk[0], frames = t => { const c = t[0] >> 3, sz = c < 12 ? [10, 20, 40, 60][c & 3] : c < 16 ? [10, 20][c & 1] : [2.5, 5, 10, 20][c & 3], n = (t[0] & 3) === 0 ? 1 : (t[0] & 3) < 3 ? 2 : t[1] & 63; return sz * n * 48; };
  let at = 0; const och = pk.slice(2).map(d => { const dur = frames(d), c = { ts: Math.round(at * 1e6 / 48000), dur: dur * 1e6 / 48000, data: d }; at += dur; return c; });
  const webf = path.join(TMP, 'real.webm');
  fs.writeFileSync(webf, M.webm({ video: { codec: 'vp09', width: 640, height: 360, fps: 30, chunks: vp }, audio: { codec: 'opus', sampleRate: 48000, channels: 2, description: ohead, chunks: och } }));
  const pw2 = probe(webf), vs2 = pw2.streams.find(s => s.codec_name === 'vp9'), as2 = pw2.streams.find(s => s.codec_name === 'opus');
  no(!vs2 || !as2 || +vs2.nb_read_frames !== vp.length || pw2.format.format_name.indexOf('webm') < 0, 'ffprobe WebM: vp9 ' + vp.length + ' khung + opus; có ' + JSON.stringify(pw2.streams));
  no(!vs2 || !/^00:00:05\.0/.test(vs2.tags && vs2.tags.DURATION || ''), 'WebM: ffprobe đọc được thời lượng stream hình (Tags DURATION), có ' + JSON.stringify(vs2 && vs2.tags));
  no(Math.abs(+pw2.format.duration - 5) > 0.05, 'WebM: thời lượng ≈ 5 s, có ' + pw2.format.duration);
  const d2 = decodeClean(webf); no(d2, 'ffmpeg giải mã WebM không sạch: ' + d2);
  // ĐỒNG BỘ THẬT: bộ mã hoá AAC của ffmpeg (mồi 1024, như Windows) — hiệu chuẩn → bù bằng Feeder → MP4 không edts → ffmpeg giải mã → mẫu dấu đúng chỗ.
  // Đột biến "không bù" phải lệch đúng 1024 mẫu (phép đo thấy được). Opus / WebM: CodecDelay = pre-skip → lệch 0; xoá pre-skip → lệch 312.
  {
    const f32 = (file, pcm) => { const b = Buffer.alloc(pcm.length * 8); for (let i = 0; i < pcm.length; i++) { b.writeFloatLE(pcm[i], i * 8); b.writeFloatLE(pcm[i], i * 8 + 4); } fs.writeFileSync(file, b); };
    const adts = file => { const ab = fs.readFileSync(file), ch = []; for (let p = 0; p < ab.length;) { const hl = ab[p + 1] & 1 ? 7 : 9, len = ((ab[p + 3] & 3) << 11) | (ab[p + 4] << 3) | (ab[p + 5] >> 5); ch.push({ ts: Math.round(ch.length * 1024 * 1e6 / SR), dur: 1024e6 / SR, data: ab.subarray(p + hl, p + len) }); p += len; } return ch; };
    const cal = SY.calibSignal(SR); f32(path.join(TMP, 'cal.f32'), cal.pcm);
    ff(['-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', path.join(TMP, 'cal.f32'), '-c:a', 'aac', '-b:a', '160k', '-f', 'adts', path.join(TMP, 'cal.aac')]);
    const cd = decodeAudio(path.join(TMP, 'cal.aac')), meas = SY.delayOf(cal, cd.pcm);
    no(cd.error || meas.delay !== 1024, 'hiệu chuẩn bộ mã hoá AAC của ffmpeg: mồi 1024, đo được ' + JSON.stringify(meas) + ' ' + (cd.error || ''));
    const N = vch.length * 1600, film = new Float32Array(N); for (let i = 0; i < N; i++) film[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / SR);
    const marks = [{ at: Math.round(0.5 * SR), tpl: SY.noise(2048, 0x5EED01) }, { at: N - Math.round(0.6 * SR), tpl: SY.noise(2048, 0x5EED02) }];
    const runAac = (shift, tag) => {
      const fd = new SY.Feeder({ shift, marks }), parts = []; fd.push(film, film); fd.take(N, (l, r, n) => parts.push(l.slice(0, n)));
      const enc = new Float32Array(parts.reduce((a, x) => a + x.length, 0)); let q = 0; parts.forEach(x => { enc.set(x, q); q += x.length; });
      f32(path.join(TMP, tag + '.f32'), enc);
      ff(['-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', path.join(TMP, tag + '.f32'), '-c:a', 'aac', '-b:a', '160k', '-f', 'adts', path.join(TMP, tag + '.aac')]);
      const tr = SY.trim(adts(path.join(TMP, tag + '.aac')), N, SR), f = path.join(TMP, tag + '.mp4');
      fs.writeFileSync(f, M.mp4({ video: { codec: 'avc1', width: 640, height: 360, fps: 30, description: avcC, chunks: vch }, audio: { codec: 'mp4a', sampleRate: 48000, channels: 2, description: asc, chunks: tr.chunks } }));
      const d = decodeAudio(f); return { d, m: d.error ? [] : measureMarks(d, marks, 14400) };
    };
    const good = runAac(meas.delay, 'sync'), bad0 = runAac(0, 'nosync'), vMs = N / SR * 1000;
    no(good.d.error || good.m.some(m => Math.abs(m.offsetSamples) > 2 || m.score < 0.8), 'AAC thật đã bù: mẫu dấu đầu / cuối phải lệch ≤ 2 mẫu, có ' + JSON.stringify(good.m.map(m => [m.offsetSamples, +m.score.toFixed(3)])) + ' ' + (good.d.error || ''));
    no(good.d.error || good.d.durationMs < vMs || good.d.durationMs >= vMs + 1024 / 48, 'AAC thật đã bù: tiếng giải mã ' + (good.d.durationMs || 0).toFixed(1) + ' ms ∈ [hình ' + vMs.toFixed(1) + ', + 1 khung AAC)');
    no(bad0.d.error || bad0.m.some(m => Math.abs(m.offsetSamples - 1024) > 2), 'đột biến "không bù": phép đo phải thấy lệch 1024 mẫu, có ' + JSON.stringify(bad0.m.map(m => m.offsetSamples)));
    // Opus: mẫu dấu dập thẳng (Opus tự bù qua CodecDelay = pre-skip) → ffmpeg libopus → WebmWriter
    const fo = new SY.Feeder({ shift: 0, marks }), op = []; fo.push(film, film); fo.take(N, (l, r, n) => op.push(l.slice(0, n)));
    const oe = new Float32Array(N); let q2 = 0; op.forEach(x => { oe.set(x, q2); q2 += x.length; }); f32(path.join(TMP, 'op.f32'), oe);
    ff(['-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', path.join(TMP, 'op.f32'), '-c:a', 'libopus', '-b:a', '96k', '-f', 'ogg', path.join(TMP, 'op.ogg')]);
    const og2 = fs.readFileSync(path.join(TMP, 'op.ogg')), pk2 = []; let part2 = [];
    for (let p = 0; p + 27 <= og2.length;) { const ns = og2[p + 26], segs = og2.subarray(p + 27, p + 27 + ns); let q = p + 27 + ns; for (const L of segs) { part2.push(og2.subarray(q, q + L)); q += L; if (L < 255) { pk2.push(Buffer.concat(part2)); part2 = []; } } p = q; }
    let at2 = 0; const och2 = pk2.slice(2).map(d => { const dur = frames(d), c = { ts: Math.round(at2 * 1e6 / 48000), dur: dur * 1e6 / 48000, data: d }; at2 += dur; return c; });
    const webm2 = (head, tag) => { const f = path.join(TMP, tag + '.webm'); fs.writeFileSync(f, M.webm({ video: { codec: 'vp09', width: 640, height: 360, fps: 30, chunks: vp }, audio: { codec: 'opus', sampleRate: 48000, channels: 2, description: head, chunks: och2 } })); const d = decodeAudio(f); return { d, m: d.error ? [] : measureMarks(d, marks, 14400) }; };
    const pre = pk2[0][10] | (pk2[0][11] << 8), zero = Buffer.from(pk2[0]); zero[10] = zero[11] = 0;
    const ow = webm2(pk2[0], 'opus-sync'), oz = webm2(zero, 'opus-nopreskip');
    no(ow.d.error || ow.m.some(m => Math.abs(m.offsetSamples) > 2 || m.score < 0.6), 'Opus / WebM (CodecDelay = pre-skip ' + pre + '): mẫu dấu lệch ≤ 2 mẫu, có ' + JSON.stringify(ow.m.map(m => [m.offsetSamples, +m.score.toFixed(3)])) + ' ' + (ow.d.error || ''));
    no(oz.d.error || oz.m.some(m => Math.abs(m.offsetSamples - pre) > 2), 'đột biến "pre-skip 0": phép đo phải thấy lệch ' + pre + ' mẫu, có ' + JSON.stringify(oz.m.map(m => m.offsetSamples)));
    if (bad === b0) ok('đồng bộ THẬT qua ffmpeg: AAC mồi đo được ' + meas.delay + ' → bù → MP4 không edts, mẫu dấu lệch ' + good.m.map(m => m.offsetSamples).join(' / ') + ' mẫu, tiếng ' + good.d.durationMs.toFixed(1) + ' / hình ' + vMs.toFixed(1) + ' ms (đột biến không bù: lệch ' + bad0.m.map(m => m.offsetSamples).join(' / ') + ') · WebM Opus pre-skip ' + pre + ': lệch ' + ow.m.map(m => m.offsetSamples).join(' / ') + ' (đột biến pre-skip 0: ' + oz.m.map(m => m.offsetSamples).join(' / ') + ')');
  }
  if (bad === b0) ok('luồng thật (ffmpeg): MP4 H.264 + AAC ' + vch.length + ' khung · WebM VP9 + Opus ' + vp.length + ' khung — ffprobe đúng codec / số khung / thời lượng, ffmpeg giải mã lại không một lỗi');
}

/* ---------------------------------------------------------------- đồng hồ ảo (vm + cửa sổ giả) */
{
  const b0 = bad;
  function fakeWindow(withMeta) {
    const realT = [], log = [];
    const W = { setTimeout: (f, ms) => { realT.push(f); setImmediate(f); return 1; },   // timer THẬT: đếm (đồng hồ ảo không được dùng) nhưng vẫn chạy
      clearTimeout() {}, setInterval() { return 1; }, clearInterval() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
      performance: { now: () => 1000 + performance.now() }, speechSynthesis: { speak() {} }, SpeechSynthesisUtterance: function () {}, IntersectionObserver: function () {}, ResizeObserver: function () {},
      MessageChannel: class { constructor() { const self = this; this.port1 = { onmessage: null }; this.port2 = { postMessage: () => { log.push('mc'); setImmediate(() => self.port1.onmessage && self.port1.onmessage({})); } }; } },   // như MessageChannel thật: một tác vụ vĩ mô
      document: { querySelector: s => withMeta && s === 'meta[name="gc-video-export"]' ? {} : null, getAnimations: () => [] } };
    W.window = W; W.Date = { now: () => 5000 }; W.Promise = Promise; W.console = console; W.Object = Object; W.Array = Array; W.Math = Math; W.WeakMap = WeakMap;
    return { W, realT, log };
  }
  const code = fs.readFileSync(path.join(ROOT, 'studio/video/vclock.js'), 'utf8');
  const off = fakeWindow(false); vm.runInNewContext(code, off.W);
  no(off.W.GCVClock || off.W.performance.now() < 1000 || typeof off.W.speechSynthesis !== 'object', 'vclock.js nạp ở trang KHÔNG có <meta name="gc-video-export"> phải không vá gì (CNS-228)');
  const on = fakeWindow(true), W = on.W; vm.runInNewContext(code, W);
  const VC = W.GCVClock, seen = [], T0 = W.performance.now();
  no(!VC || W.speechSynthesis !== undefined || W.IntersectionObserver !== undefined || W.ResizeObserver !== undefined || W.document.hidden !== false || W.document.visibilityState !== 'visible', 'trang xuất: tắt speechSynthesis / *Observer, document luôn "visible"');
  no(Math.abs(VC.real.now() - (1000 + performance.now())) > 50 || typeof VC.real.setTimeout !== 'function', 'GCVClock.real giữ bản gốc');
  const run = async () => {
    W.setTimeout(() => seen.push('b@' + VC.t), 20);
    W.setTimeout(() => { seen.push('a@' + VC.t); W.setTimeout(() => seen.push('a0@' + VC.t), 0); }, 10);
    const iv = W.setInterval(() => { seen.push('i@' + VC.t); if (VC.t >= 30) W.clearInterval(iv); }, 15);
    const gone = W.setTimeout(() => seen.push('X'), 5); W.clearTimeout(gone);
    W.requestAnimationFrame(t => seen.push('raf@' + (t - T0)));
    const fires = [];
    VC.beforeFire = at => { fires.push(at); return Promise.resolve(); };
    await VC.advance(16);
    seen.push('|');
    await VC.advance(40);
    no(seen.join(' ') !== 'a@10 a0@10 i@15 raf@16 | b@20 i@30', 'thứ tự bắn hẹn giờ ảo: ' + seen.join(' '));
    no(fires.join() !== '10,10,15,16,20,30,40', 'beforeFire (đưa tiếng tới đúng lúc) trước mỗi lần bắn + cuối khung: ' + fires.join());
    no(W.performance.now() !== T0 + 40 || W.Date.now() !== 5000 + 40, 'performance.now / Date.now theo đồng hồ ảo');
    no(on.realT.length, 'đồng hồ ảo không được dùng setTimeout THẬT (tab ẩn bị bóp — CNS-221), đã dùng ' + on.realT.length + ' lần');
    let done = false; VC.track(new Promise(r => setTimeout(r, 60)).then(() => { done = true; }));   // việc async thật 60 ms (vd. decodeAudioData)
    await VC.advance(41);
    no(!done, 'advance phải chờ việc async thật đã track');
    // nhả HAI bước vĩ mô mỗi lần (bước đầu rỗng: hẹn giờ của Studio tới hạn trong tác vụ nặng được chạy ngay sau nó — ngân sách long task, spec §3)
    const m0 = on.log.length; await VC.yieldReal(); await VC.yieldReal();
    no(on.log.length - m0 !== 4 || on.realT.length, 'yieldReal = 2 bước MessageChannel, không setTimeout thật; có ' + (on.log.length - m0) + ' bước / ' + on.realT.length + ' setTimeout');
  };
  await run();
  if (bad === b0) ok('đồng hồ ảo: chỉ vá ở trang xuất (có meta), thứ tự hẹn giờ (thời điểm → thứ tự đặt, 0 ms lồng nhau, interval, huỷ), rAF một lượt / khung, beforeFire trước mỗi lần bắn, chờ việc async đã track, nhả luồng 2 bước MessageChannel, không dùng setTimeout thật');
}

/* ---------------------------------------------------------------- tệp chữ */
{
  const b0 = bad;
  const s = T.srt([{ from: 3066.7, to: 5466.7, text: '  Good   morning, boss!\u0007 ' }, { from: 6000, to: 6000, text: 'rỗng thời lượng' }, { from: 3723004, to: 3725000, text: 'Một giờ sau' }, { from: 1, to: 2, text: '' }]);
  no(s !== '1\r\n00:00:03,067 --> 00:00:05,467\r\nGood morning, boss!\r\n\r\n2\r\n01:02:03,004 --> 01:02:05,000\r\nMột giờ sau\r\n', '.srt: đánh số lại, mốc hh:mm:ss,mmm, bỏ câu rỗng / 0 s, bỏ ký tự điều khiển: ' + JSON.stringify(s));
  no(T.txt({ title: 'First Day', description: '', credit: 'Made with gen-chibi · Gen Labs' }) !== 'First Day\n\nMade with gen-chibi · Gen Labs\n', '.txt: tiêu đề + mô tả + ghi công');
  no(T.slug('Ngày đầu đi làm!') !== 'ngay-dau-di-lam' || T.slug('') !== 'video', 'slug tên tệp');
  // tên thiết bị dành riêng của Windows: CÙNG luật ở 3 bản slug (text.js, slugify của Studio, dự phòng trong client.js)
  { const appS = fs.readFileSync(path.join(ROOT, 'studio/app.js'), 'utf8'), cliS = fs.readFileSync(path.join(ROOT, 'studio/video/client.js'), 'utf8');
    const grab = (src, name) => { const i = src.indexOf('function ' + name + '('), j = src.indexOf('\n  }', i); const body = src.slice(i, src.indexOf('\n', i) > j ? j + 4 : Math.max(j + 4, src.indexOf('\n', i))); return vm.runInNewContext('(' + (name === 'GCVTextSlug' ? src.slice(i, src.indexOf('\n', i)).replace(/\s*\/\/.*$/, '') : body) + ')'); };
    const fns = [['text.js', T.slug], ['app.js slugify', grab(appS, 'slugify')], ['client.js', grab(cliS, 'GCVTextSlug')]];
    for (const [n, f] of fns) for (const [inp, out] of [['CON', 'con-gc'], ['Nul', 'nul-gc'], ['com1', 'com1-gc'], ['LPT9', 'lpt9-gc'], ['aux', 'aux-gc'], ['prn', 'prn-gc'], ['con tam quoc', 'con-tam-quoc'], ['com10', 'com10'], ['Ngày đầu', 'ngay-dau']])
      no(f(inp) !== out, 'slug (' + n + ') "' + inp + '" → "' + f(inp) + '", cần "' + out + '" (tên dành riêng của Windows)'); }
  if (bad === b0) ok('.srt (SubRip, CRLF) · .txt (tiêu đề / mô tả / ghi công Q47) · tên tệp');
}

/* ---------------------------------------------------------------- cách ly (CNS-228) + trang xuất không script inline (CNS-214) */
{
  const b0 = bad;
  const idx = fs.readFileSync(path.join(ROOT, 'studio/index.html'), 'utf8'), page = fs.readFileSync(path.join(ROOT, 'studio/video-export.html'), 'utf8'), app = fs.readFileSync(path.join(ROOT, 'studio/app.js'), 'utf8');
  no(/video\/(vclock|mux|capture|text|tap-worklet)\.js/.test(idx), 'Studio (index.html) không được nạp vclock / mux / capture / text / tap-worklet — chỉ trang xuất video');
  no(!/src="studio\/video\/client\.js"/.test(idx) || idx.indexOf('studio/video/client.js') > idx.indexOf('studio/app.js'), 'Studio nạp studio/video/client.js TRƯỚC app.js (lối vào cho P3)');
  no(/<script(?![^>]*\bsrc=)[^>]*>/i.test(page), 'trang xuất video không được có <script> inline (CSP script-src \'self\')');
  no(!/<meta name="gc-video-export"/.test(page) || page.indexOf('video/vclock.js') > page.indexOf('video/capture.js'), 'trang xuất: có meta gc-video-export, vclock.js nạp trước capture.js');
  no(!/function filmSrcs\(\) \{[^\n]*\/\^\(engine\|kinds\)\\\/\//.test(app), 'filmSrcs (mã nhúng vào phim HTML / nạp vào trang xuất) chỉ lấy engine/ + kinds/ — không bao giờ studio/video/*');
  no(!/GCVideo\.studio = \{ payload: filmPayload/.test(app) || !/filmPayload\(W, pre\)\]\)/.test(app), 'exportFilm và GCVideo dùng CHUNG filmPayload (CNS-219)');
  const cap = fs.readFileSync(path.join(ROOT, 'studio/video/capture.js'), 'utf8').replace(/\/\/[^\n']*$|\/\*[\s\S]*?\*\//gm, '');   // bỏ chú thích
  no(/createObjectURL|createImageBitmap/.test(cap) || !/'data:image\/svg\+xml;charset=utf-8,'/.test(cap), 'chụp khung qua data: URL + HTMLImageElement (blob: / createImageBitmap làm bẩn canvas)');
  no(/[^.]\bsetTimeout\(/.test(cap), 'capture.js không dùng setTimeout (đồng hồ ảo / tab ẩn bị bóp) — nhả luồng bằng MessageChannel');
  // ngân sách luồng chính (spec §3): không nhân bản cả sân khấu mỗi khung (rác DOM → GC dừng luồng ~80 ms); CSS + phông chỉ thoát / mã hoá MỘT lần; raster theo dải
  // gộp P3 × bù AAC (v0.22.0): hai biến cùng tên `marks` trong run() (mốc gỡ lỗi + mẫu dấu tiếng) → var dồn một → Feeder nhận mốc gỡ lỗi → "internal"
  const runSrc = cap.slice(cap.indexOf('async function run(')), decl = n => (runSrc.match(new RegExp('(?:var|let|const|,)\\s*' + n + '\\s*=', 'g')) || []).length;
  no(decl('marks') !== 1 || decl('tmarks') !== 1, 'capture.js run(): `marks` (mẫu dấu tiếng) và `tmarks` (mốc gỡ lỗi) mỗi tên khai báo đúng một lần — có ' + decl('marks') + ' / ' + decl('tmarks'));
  // lỗi kỹ thuật tới tay người gọi: client.js giữ chi tiết ở e.detail (Studio chỉ hiện MÃ), host của CI ghi detail, video-ci in ra
  { const cli = fs.readFileSync(path.join(ROOT, 'studio/video/client.js'), 'utf8'), host = fs.readFileSync(path.join(ROOT, 'tools/fixtures/video-ci/host.js'), 'utf8'), vci = fs.readFileSync(path.join(ROOT, 'tools/video-ci.mjs'), 'utf8');
    no(!/_t\('Xuất video lỗi: \{x\}', \{ x: code \}\)/.test(cli) || !/e\.detail = String\(extra\)/.test(cli) || !/window\.__ci\.detail = e && e\.detail/.test(host) || !/st\.detail \? ' — chi tiết: ' \+ st\.detail/.test(vci),
      'lỗi kỹ thuật: Studio hiện mã, e.detail giữ chi tiết, video-ci in chi tiết'); }
  // cloneNode chỉ được dùng NÔNG (cloneNode(false): thẻ mở của lớp rung / máy quay cho từng mảnh) — không nhân bản cả sân khấu
  no(/cloneNode\((?!false\))/.test(cap) || !/function frameShell\(W, H, font\) \{\s*var k = font === false \? 'n' : 'f', P = PRE\[k\];\s*if \(!P \|\| P\.w !== W/.test(cap) || !/var BANDS = /.test(cap), 'chụp khung: không cloneNode sâu, đầu data: URL (CSS ± phông) đóng sẵn một lần, raster theo dải');
  // B5 (CNS-248) chụp theo lớp: phông sau ở canvas đệm (vẽ lại chỉ khi máy quay đổi khung), lớp sân khấu từng mảnh KHÔNG nhúng phông chữ (dùng lại mảnh không đổi),
  // lớp trên (lời thoại) raster lại chỉ khi đổi; lớp trên có mix-blend-mode → một tài liệu như cũ; o.layers = false chỉ để đo đối chứng
  no(!/LAYERED = o\.layers !== false/.test(cap) || !/if \(BG && BG\.el === \(R0 && R0\.el\) && BG\.key === key\) \{ st\.bgHit\+\+; return BG\.cv; \}/.test(cap) || !/if \(TOP && TOP\.body === body\) \{ st\.topHit\+\+; return TOP\.cv; \}/.test(cap)
    || !/if \(prev && prev\.s === sl\.s\) \{ st\.sliceHit\+\+;/.test(cap) || !/decodeOne\(sl\.s, false\)/.test(cap) || /getComputedStyle\(cs\[i\]\)/.test(cap) || !/if \(topS\.indexOf\('mix-blend-mode'\) >= 0\) split = false/.test(cap) || !/s\.id !== 'gc-fonts'/.test(cap),
    'chụp theo lớp (B5): phông sau đệm theo khung máy quay · mảnh sân khấu không phông chữ, dùng lại mảnh không đổi · lớp trên chỉ dựng lại khi đổi · mix-blend-mode → một tài liệu');
  const vc = fs.readFileSync(path.join(ROOT, 'studio/video/vclock.js'), 'utf8');
  no(/(^|\/)engine\//.test(path.relative(ROOT, path.join(ROOT, 'studio/video/vclock.js'))), 'vclock không nằm trong engine/');
  no(!/window\.parent/.test(cap) || !/e\.origin !== ORIGIN \|\| e\.source !== PARENT/.test(cap), 'trang xuất kiểm origin + source của tin nhắn');
  if (bad === b0) ok('cách ly: Studio chỉ nạp client.js (không vclock / mux / capture), trang xuất không script inline, phim HTML chỉ nhúng engine/ + kinds/, một filmPayload cho hai đường, data: URL, không setTimeout, kiểm origin');
  void vc;
}

/* ---------------------------------------------------------------- hiệu chuẩn mồi AAC cắt từng đoạn (ngân sách long task — tương quan cả dải ~130 ms) */
{
  const b0 = bad, S = M.sync, cal = S.calibSignal(48000);
  for (const D of [0, 1024, 2112, -300, 5000, 8000]) {
    const sig = new Float32Array(cal.pcm.length + 9000); for (let i = 0; i < cal.pcm.length; i++) if (i + D >= 0 && i + D < sig.length) sig[i + D] = cal.pcm[i] * 0.8 + (((i * 7919) % 97) / 97 - 0.5) * 0.01;
    const whole = S.delayOf(cal, sig); let best = { lag: -1, score: -2 };
    const rr = S.lagRanges(cal, 1024);
    for (const [a, b] of rr) { const r = S.findLag(cal.tpl, sig, a, b); if (r.lag >= 0 && r.score > best.score) best = r; }
    const sliced = { delay: best.lag < 0 ? null : best.lag - cal.at, score: best.score };
    no(rr.length < 10 || rr[0][0] !== Math.max(0, cal.at - 4096) || rr[rr.length - 1][1] !== cal.at + 8192 || rr.some((x, i) => i && x[0] !== rr[i - 1][1] + 1), 'lagRanges phủ kín, không chồng dải của delayOf');
    no(sliced.delay !== whole.delay || Math.abs(sliced.score - whole.score) > 1e-4 || whole.delay !== D, 'cắt đoạn = cả dải: trễ ' + D + ' → cả dải ' + whole.delay + ' / cắt ' + sliced.delay);
  }
  const cap2 = fs.readFileSync(path.join(ROOT, 'studio/video/capture.js'), 'utf8');
  no(/S\.delayOf\(/.test(cap2) || !/await delayOfSliced\(/.test(cap2), 'trang xuất dùng delayOfSliced (từng đoạn, nhả luồng), không gọi delayOf một mạch');
  if (bad === b0) ok('hiệu chuẩn mồi AAC: tương quan chéo cắt 13 đoạn × 1024 vị trí = cả dải (trễ 0 / 1024 / 2112 / −300 / 5000 / 8000 mẫu); trang xuất nhả luồng giữa các đoạn');
}

/* ---------------------------------------------------------------- điều khoản bộ mẫu: MỘT câu ở mọi nơi (Q47 — chủ duyệt; CNS-240, review bảo mật 🟠) */
{
  const b0 = bad, rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const VI = "xem, thử, làm phim; được đăng phim / video làm từ bộ mẫu kèm dòng ghi công \"Made with gen-chibi · Gen Labs\"; không bán lại, không phân phối lại tệp hay asset của bộ mẫu", EN = "view, try and make films; films / videos made from the sample may be posted with the credit line \"Made with gen-chibi · Gen Labs\"; no resale, no redistribution of the sample's files or assets";
  const app = rd('studio/app.js'), tq = JSON.parse(rd('studio/mau/tam-quoc.json')), vpv = JSON.parse(rd('studio/mau/van-phong-vui.json')), fo = JSON.parse(rd('studio/mau/fun-office.json'));
  const en = JSON.parse(rd('locales/en/studio.json')), enS = JSON.parse(rd('locales/en/server-msg.json')), mcp = rd('server/mcp.js'), man = rd('ASSET_MANIFEST.md');
  no(app.indexOf("var SAMPLE_TERMS = N_('" + VI + "')") < 0 || en[VI] !== EN, 'SAMPLE_TERMS (app.js) = câu điều khoản chung + bản tiếng Anh');
  no(tq.sample.license !== '© 2026 Gen Labs — bộ mẫu: ' + VI || vpv.license.indexOf(VI) < 0 || fo.license.indexOf(EN) < 0, 'giấy phép trong studio/mau/*.json dùng câu chung: ' + tq.sample.license);
  no(man.indexOf(VI) < 0, 'ASSET_MANIFEST.md (tq-am) dùng câu chung');
  const mm = [...mcp.matchAll(/tr\(VI, '([^']*bộ mẫu[^']*)'/g)].map(m => m[1]).filter(m => /gói bán/.test(m));
  no(mm.length !== 2 || mm.some(m => m.indexOf(VI) < 0 || !enS[m] || enS[m].indexOf(EN) < 0 || !/không được/.test(m)), 'thông báo bộ mẫu của server/mcp.js dùng câu chung (vẫn mã FORBIDDEN qua "không được"): ' + mm.length);
  const OLD = /chỉ để xem, thử, quay phim|chỉ để xem, sửa thử, làm phim|chỉ để xem và làm phim thử|xem, sửa thử, làm phim; không bán lại|view, try and film only|trial films only|for viewing, trying edits|viewing, trying and filming only/;
  const hit = ['studio/app.js', 'server/mcp.js', 'ASSET_MANIFEST.md', 'agent/GUIDE.md', 'agent/workflows/project-bundle.md', 'locales/en/studio.json', 'locales/en/server-msg.json', 'studio/mau/tam-quoc.json', 'docs/USER-GUIDE.md', 'docs/HUONG-DAN.md'].filter(f => OLD.test(rd(f)));
  no(hit.length, 'còn câu điều khoản bộ mẫu CŨ ("chỉ để xem…") ở: ' + hit.join(', '));
  no(/Made with gen-chibi · Gen Labs/.test(rd('studio/video/client.js')) === false || /_t\('Làm bằng gen-chibi · Gen Labs'\)/.test(rd('studio/video/client.js')), 'dòng ghi công trong .txt là đúng chữ "Made with gen-chibi · Gen Labs" ở mọi ngôn ngữ');
  if (bad === b0) ok('điều khoản bộ mẫu: một câu (vi + en) ở SAMPLE_TERMS, studio/mau/*.json, ASSET_MANIFEST, server/mcp.js, agent guide, tài liệu; không còn câu "chỉ để xem…"; dòng ghi công cố định');
}

/* ---------------------------------------------------------------- CI: nhánh MP4 Chrome thật (CNS-236 / CNS-239) */
{
  const b0 = bad, rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const vm4 = rd('.github/workflows/video-mp4.yml'), ci = rd('.github/workflows/ci.yml'), rel = rd('.github/workflows/release.yml');
  const runs = [...vm4.matchAll(/run: node tools\/video-ci\.mjs ([^\n]*)/g)].map(m => m[1]);
  no(!/workflow_call/.test(vm4) || !/windows-latest/.test(vm4) || !/macos-latest/.test(vm4), 'video-mp4.yml: workflow dùng chung (workflow_call), Windows + macOS');
  no(!runs.every(r => /--require-mp4/.test(r) && /--require-ffmpeg/.test(r)) || !runs.some(r => !/--quality|--frame|--hidden/.test(r)) || !runs.some(r => /--hidden/.test(r)) || !runs.some(r => /--quality 1080p/.test(r) && !/--frame/.test(r)) || !runs.some(r => /--quality 1080p/.test(r) && /--frame 9x16/.test(r)),
    'video-mp4.yml chạy video-ci: mặc định + --hidden + --quality 1080p + --quality 1080p --frame 9x16 (đều --require-mp4 --require-ffmpeg): ' + JSON.stringify(runs));
  no(!/video-mp4:\n\s+uses: \.\/\.github\/workflows\/video-mp4\.yml/.test(ci), 'ci.yml gọi video-mp4.yml');
  no(!/video-mp4:\n\s+uses: \.\/\.github\/workflows\/video-mp4\.yml/.test(rel) || !/\n  release:\n    needs: (video-mp4|\[([\w-]+, )*video-mp4(, [\w-]+)*\])\n/.test(rel), 'release.yml: job release CẦN video-mp4 (không phát hành khi nhánh MP4 hỏng; v0.23: needs [video-mp4, browser])');
  const vci = rd('tools/video-ci.mjs');
  no(!/--frame/.test(vci) || !/WANT\[0\] && st\.format\.height === WANT\[1\]/.test(vci), 'video-ci.mjs có --frame và kiểm cỡ khung của tệp ra');
  if (bad === b0) ok('CI: video-mp4.yml (Windows + macOS, Chrome thật) chạy mặc định / tab nền / 1080p / 9:16 1080p, dùng chung cho ci.yml và release.yml — release cần nó trước khi phát hành');
}

/* ---------------------------------------------------------------- header của server theo loại tệp (CNS-214) */
{
  const b0 = bad;
  const H = require(path.join(ROOT, 'server/headers.js'));
  no(!/frame-ancestors 'none'/.test(H.STUDIO_CSP) || !/frame-ancestors 'self'/.test(H.VIDEO_EXPORT_CSP) || H.VIDEO_EXPORT_CSP.split('frame-ancestors')[0] !== H.STUDIO_CSP.split('frame-ancestors')[0], 'CSP trang xuất = CSP Studio, chỉ khác frame-ancestors \'self\'');
  const PORT = 7697, home = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-vh-'));
  for (const P of [PORT]) { const r = spawnSync('bash', ['-c', '(echo > /dev/tcp/127.0.0.1/' + P + ') 2>/dev/null'], {}); if (r.status === 0) { no(true, 'cổng ' + P + ' đang bị chiếm'); } }
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: String(PORT), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: 'tok-video-headers-0123456789' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:' + PORT + '/api/health'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    const cases = [
      ['/', 'DENY', "frame-ancestors 'none'"], ['/studio/index.html', 'DENY', "frame-ancestors 'none'"], ['/tao-tac', 'DENY', "frame-ancestors 'none'"], ['/login', 'DENY', "frame-ancestors 'none'"],
      ['/studio/video-export.html', 'SAMEORIGIN', "frame-ancestors 'self'"],
      ['/studio/video/capture.js', 'DENY', null], ['/studio/video/vclock.js', 'DENY', null], ['/studio/app.js', 'DENY', null], ['/studio/studio.css', 'DENY', null],
      ['/engine/core.js', 'DENY', null], ['/locales/en/player.json', 'DENY', null], ['/studio/mau/fun-office.json', 'DENY', null], ['/api/health', 'DENY', null], ['/khong-co', 'DENY', null],
      ['/studio/video-export.html?x=1', 'SAMEORIGIN', "frame-ancestors 'self'"], ['/studio/video-export.html/', 'DENY', null], ['/studio//video-export.html', 'DENY', null],
      ['/studio//index.html', 'DENY', null], ['/studio/./index.html', 'DENY', null], ['/studio/video/../index.html', 'DENY', null], ['/studio/%2e/video-export.html', 'DENY', null], ['/engine//core.js', 'DENY', null]];
    // đường dẫn không chuẩn (// · /./ · /../) → 404 TRƯỚC khi so khớp trang có header riêng (review bảo mật: /studio//index.html từng ra HTML không CSP)
    const ODD = ['/studio//index.html', '/studio/./index.html', '/studio/video/../index.html', '/studio/%2e/video-export.html', '/studio//video-export.html', '/engine//core.js'];
    const seen = [];
    for (const [u, xfo, fa] of cases) {
      // HTTP THÔ (fetch / trình duyệt chuẩn hoá ./ ../ %2e trước khi gửi; kẻ tấn công dùng curl / socket thì không)
      const r = await new Promise((ok, no2) => { const rq = require('http').request({ host: '127.0.0.1', port: PORT, path: u, method: 'GET' }, rs => { rs.resume(); rs.on('end', () => ok({ status: rs.statusCode, headers: { get: k => rs.headers[k] == null ? null : String(rs.headers[k]) } })); }); rq.on('error', no2); rq.end(); }), csp = r.headers.get('content-security-policy') || '';
      seen.push(u + ' ' + r.status + ' ' + r.headers.get('x-frame-options'));
      if (ODD.includes(u)) no(r.status !== 404 && r.status !== 400, u + ': đường dẫn không chuẩn phải 404 / 400, có ' + r.status);
      if (r.status === 200 && /text\/html/.test(r.headers.get('content-type') || '')) no(csp.indexOf("script-src 'self'") < 0, u + ': trang HTML nào cũng phải mang CSP, có "' + csp + '"');
      no(r.headers.get('x-frame-options') !== xfo, u + ': X-Frame-Options phải là ' + xfo + ', có ' + r.headers.get('x-frame-options'));
      if (fa) no(csp.indexOf(fa) < 0 || csp.indexOf("script-src 'self'") < 0, u + ': CSP phải có ' + fa + " + script-src 'self', có " + csp);
      else no(/frame-ancestors 'self'/.test(csp), u + ': không được mang frame-ancestors \'self\'');
    }
    const pg = await (await fetch('http://127.0.0.1:' + PORT + '/studio/video-export.html')).text();
    no(pg.indexOf('gc-video-export') < 0, 'server trả đúng trang xuất video');
    if (bad === b0) ok('server: CHỈ studio/video-export.html nhận X-Frame-Options SAMEORIGIN + CSP frame-ancestors \'self\'; ' + (cases.length - 2) + ' loại phản hồi khác (Studio, đăng nhập, js, css, json, mẫu, API, 404, đường lách) giữ DENY; đường dẫn không chuẩn (// · /./ · /../) → 404; HTML nào cũng có CSP');
  } finally { srv.kill(); }
}

/* ---------------------------------------------------------------- KHUNG DỌC 9:16 thật (v0.23.2, Q37 b): máy quay dọc GC.film.frameV (thuần số, cùng hàm bộ phát dùng) */
console.log('   — máy quay khung dọc 9:16 (GC.film.frameV + bố cục phụ đề khung dọc)');
{
  const b0 = bad, GC = require(path.join(ROOT, 'server/engine-node.js')).loadEngine(ROOT), F = GC.film && GC.film.frameV, AX = 256 / 81;
  if (no(typeof F !== 'function', 'GC.film.frameV phải có (engine/player.js)')) {
    const sp = k => { const s = GC.SCENE.spots[k]; return { x: s.x / GC.SCENE.W, y: (s.y - 128 * s.k) / GC.SCENE.H, k: s.k, f: s.y / GC.SCENE.H }; };
    const scr = (f, a) => (a.x * f.S + f.tx) * AX;   // x màn hình (0–1) của diễn viên theo khung
    const inClamp = f => f.S >= 1 - 1e-9 && f.tx <= 1e-9 && f.tx >= 1 / AX - f.S - 1e-9 && f.ty <= 1e-9 && f.ty >= 1 - f.S - 1e-9;
    // mặt (khung xương đầu 40–157 + 5, theo cỡ chỗ đứng) so với cửa sổ: 'in' trọn trong · 'out' trọn ngoài · 'cut' bị mép cắt — CÙNG định nghĩa với frameV
    const face = (f, a) => { const L = -f.tx / f.S, R = L + 1 / (AX * f.S), h = 66 * a.k / 640, a0 = Math.max(0, a.x - h), a1 = Math.min(1, a.x + h); return a0 >= L - 1e-9 && a1 <= R + 1e-9 ? 'in' : a1 <= L + 1e-9 || a0 >= R - 1e-9 ? 'out' : 'cut'; };
    const hgt = (f, a) => ((a.f - (a.f * 360 - (228 - 18) * a.k) / 360) * f.S);   // phần chiều cao khung của thân người (đỉnh mũ ~ khung xương y 18 → chân)
    const P2 = { a: sp('left'), b: sp('right') }, P3 = { a: sp('midLeft'), m: sp('center'), c: sp('midRight') };
    // CỠ: cận người hàng trước → S 1,15, thân ~55% chiều cao khung, đỉnh đầu ≥ 30% từ trên (chỗ cho bong bóng), đáy khung ngay dưới chân; hàng sau đẩy tới cùng cỡ (≤ 1,6)
    const c3 = F({ mode: 'close', on: ['m'], actors: { m: sp('center') } }), c4 = F({ mode: 'close', on: ['k'], actors: { k: sp('back') } });
    const top3 = (sp('center').f * 360 - (228 - 18) * 0.8) / 360 * c3.S + c3.ty, feet3 = sp('center').f * c3.S + c3.ty;
    no(Math.abs(scr(c3, sp('center')) - 0.5) > 1e-6 || Math.abs(c3.S - 1.15) > 1e-9 || !(hgt(c3, sp('center')) > 0.5 && hgt(c3, sp('center')) < 0.62) || !(top3 > 0.3 && top3 < 0.45) || !(feet3 > 0.9 && feet3 < 0.97),
      'cận người giữa cảnh: giữa khung, S 1,15, thân ' + (hgt(c3, sp('center')) * 100).toFixed(0) + '% chiều cao, đỉnh đầu ' + (top3 * 100).toFixed(0) + '%, chân ' + (feet3 * 100).toFixed(0) + '% — ' + JSON.stringify(c3));
    no(!(c4.S > 1.4 && c4.S <= 1.6) || Math.abs(hgt(c4, sp('back')) - hgt(c3, sp('center'))) > 0.03, 'cận người hàng sau (k 0,62): đẩy tới cùng cỡ người hàng trước (≤ 1,6) — S ' + c4.S);
    // MẶT: người nói trọn mặt; người khác trọn trong / trọn ngoài khi xếp được
    const c1 = F({ mode: 'close', on: ['a'], actors: P2 }), t1 = F({ mode: 'two', on: ['a', 'b'], actors: P2 }), t2 = F({ mode: 'two', on: ['b', 'a'], actors: P2 });
    no(face(c1, P2.a) !== 'in' || face(c1, P2.b) === 'cut' || face(t1, P2.a) !== 'in' || face(t1, P2.b) === 'cut' || face(t2, P2.b) !== 'in' || face(t2, P2.a) === 'cut', 'hai người cách xa: mặt người nói trọn trong khung, người kia trọn ngoài (không cắt mặt)');
    const t3 = F({ mode: 'two', on: ['a', 'm'], actors: { a: sp('midLeft'), m: sp('center') } });
    no(face(t3, sp('midLeft')) !== 'in' || face(t3, sp('center')) === 'cut', 'hai người đứng gần (giữa trái + giữa): người nói trọn mặt, người nghe không bị cắt mặt');
    const n1 = F({ mode: 'close', on: ['a'], actors: P3 });
    no(face(n1, P3.a) !== 'in' || face(n1, P3.m) === 'cut' || face(n1, P3.c) === 'cut', 'cận người đứng cạnh người khác (giữa trái, giữa, giữa phải): xê cửa sổ để không cắt mặt người bên cạnh');
    // toàn cảnh: S 1,15 (cắt gần hết tường trống trên), anchor trọn mặt; không anchor thì giữa nhóm
    const w1 = F({ mode: 'wide', actors: P2, anchor: 'a' }), w2 = F({ mode: 'wide', actors: P2, anchor: 'b' }), w0 = F({ mode: 'wide', actors: P2 });
    no(face(w1, P2.a) !== 'in' || face(w2, P2.b) !== 'in' || face(w1, P2.b) === 'cut' || face(w2, P2.a) === 'cut', 'toàn cảnh nhóm rộng: anchor trọn mặt, người kia không bị cắt mặt');
    no(Math.abs(w0.S - 1.15) > 1e-9 || !(w0.ty < -0.1), 'toàn cảnh: S 1,15 neo đáy (cắt gần hết tường trống phía trên) — ' + JSON.stringify(w0));
    // người nói sắp bước nửa bước (nudge): vùng mặt phủ cả quãng bước — sau khi bước vẫn trọn trong khung
    { const nu = F({ mode: 'close', on: ['m'], actors: { m: sp('center') }, nudge: 44 / 640 }), moved = Object.assign(sp('center'), { x: sp('center').x + 44 / 640 });
      no(face(nu, sp('center')) !== 'in' || face(nu, moved) !== 'in', 'người nói bước tới 44 đơn vị (giận dữ): mặt trọn trong khung trước và sau khi bước'); }
    // đẩy máy khi người nói hét (punch) lúc khung đã siết sát mặt + nửa bước lùi: đẩy ít hơn, không cắt mặt (Fun Office phân cảnh 4, Barry hét ở mép trái)
    { const A = { b: Object.assign(sp('left'), {}), n: sp('midLeft'), r: sp('midRight') }, nd = -36 / 640, f = F({ mode: 'close', on: ['b'], actors: A, punch: true, nudge: nd });
      no(face(f, A.b) !== 'in' || face(f, Object.assign({}, A.b, { x: A.b.x + nd })) !== 'in' || !(f.S > 1.15), 'punch sát mặt + nửa bước lùi: mặt người nói vẫn trọn trong khung (S ' + f.S + ')'); }
    // đẩy máy (punch) ×1,12 · 2000 đầu vào ngẫu nhiên (seed cố định): kẹp trong cảnh, mặt người nói / anchor KHÔNG BAO GIỜ bị cắt, tất định; đo tỉ lệ cắt mặt người khác
    no(Math.abs(F({ mode: 'close', on: ['m'], actors: { m: sp('center') }, punch: true }).S - 1.15 * 1.12) > 1e-9, 'punch: S × 1,12');
    const rr = rnd(9), modes = ['wide', 'two', 'close'], keys = Object.keys(GC.SCENE.spots); let outClamp = 0, lost = 0, nondet = 0, nFace = 0, nCut = 0, nFr = 0, frCut = 0;
    for (let i = 0; i < 2000; i++) {
      const A = {}, ids = ['p', 'q', 'r'].slice(0, 1 + Math.floor(rr() * 3)); ids.forEach(id => { const s = sp(keys[Math.floor(rr() * keys.length)]); A[id] = Object.assign(s, { x: Math.min(1, Math.max(0, s.x + (rr() - 0.5) * 0.3)) }); });
      const c = { mode: modes[Math.floor(rr() * 3)], on: rr() < 0.8 ? ids.slice(0, 2) : null, punch: rr() < 0.2, actors: A, anchor: ids[0] };
      const f = F(c), g = F(JSON.parse(JSON.stringify(c)));
      if (!inClamp(f)) outClamp++;
      if (JSON.stringify(f) !== JSON.stringify(g)) nondet++;
      const who = c.on && c.on[0] || (c.mode === 'wide' ? c.anchor : null);
      if (who && face(f, A[who]) !== 'in') lost++;
      if (c.punch) continue;   // đẩy máy khi trúng đòn (~0,26 s): chỉ kiểm mặt người nói, không tính tỉ lệ
      let any = false; ids.forEach(id => { if (id === who) return; nFace++; if (face(f, A[id]) === 'cut') { nCut++; any = true; } }); nFr++; if (any) frCut++;
    }
    no(outClamp, 'kẹp trong cảnh (S ≥ 1, không lộ mép): ' + outClamp + '/2000 khung lọt ra');
    no(lost, 'mặt người nói / anchor trọn trong khung: ' + lost + '/2000 khung cắt mặt người nói');
    no(nondet, 'tất định: ' + nondet + '/2000 khung khác nhau với cùng đầu vào');
    no(nCut / nFace > 0.3, 'mặt người khác bị cắt ≤ 30% (vị trí ngẫu nhiên ±0,15 cảnh — dày hơn phim thật, nhiều chỗ không tránh được; số thật đo trên bộ mẫu ở test-browser): ' + nCut + '/' + nFace);
    console.log('   · ' + nFr + ' khung ngẫu nhiên (không tính cú đẩy máy): mặt người khác bị mép khung cắt ' + (nCut / nFace * 100).toFixed(1) + '% (' + nCut + '/' + nFace + ') · khung có ít nhất một mặt bị cắt ' + (frCut / nFr * 100).toFixed(1) + '%');
    // không rung: chênh nhỏ (diễn viên nhích 1% cảnh) → giữ khung cũ (null); chênh lớn / cắt cảnh → khung mới
    const base = F({ mode: 'close', on: ['m'], actors: { m: sp('center') } }), nudge = x => ({ m: Object.assign(sp('center'), { x: sp('center').x + x }) });
    no(F({ mode: 'close', on: ['m'], actors: nudge(0.01), prev: base }) !== null, 'không rung: lệch 1% cảnh phải giữ khung cũ');
    no(F({ mode: 'close', on: ['m'], actors: nudge(0.08), prev: base }) === null, 'lệch 8% cảnh phải lia máy theo');
    no(F({ mode: 'close', on: ['m'], actors: nudge(0.01), prev: base, cut: true }) === null, 'cắt cảnh (cut) luôn đặt khung mới');
    // khung cũ chỉ lệch ~5 đơn vị cảnh (dưới ngưỡng không rung) nhưng cắt mặt người nói sau nửa bước lùi 44 → KHÔNG giữ khung cũ
    { const pc = sp('center'), nd = -44 / 640, fz = F({ mode: 'close', on: ['m'], actors: { m: pc }, nudge: nd }), old = { S: fz.S, tx: fz.tx - 5 / 640 * fz.S, ty: fz.ty }, back = Object.assign({}, pc, { x: pc.x + nd });
      const nw = F({ mode: 'close', on: ['m'], actors: { m: pc }, prev: old, nudge: nd });
      no(face(old, back) !== 'cut' || nw === null || face(nw, back) !== 'in' || face(nw, pc) !== 'in', 'không rung nhưng không giữ khung cũ nếu nó cắt mặt người nói sau nửa bước lùi'); }
    // phụ đề khung dọc: lề dưới c.bottom (chừa giao diện TikTok / Shorts) — không đặt thì như bản ngang (4,5%)
    const capArgs = b => ({ kind: 'caption', W: 1080, H: 1920, m: 43, who: 'a', mouth: { x: 540, y: 900 }, heads: [], bodies: [], decor: [], sizes: [{ w: 900, h: 160 }], bottom: b });
    const cv = GC.film.solveLayout(capArgs(0.14)), ch = GC.film.solveLayout(capArgs(undefined));
    no(!(cv.y1 <= 1920 * 0.86 + 0.5 && cv.y1 >= 1920 * 0.86 - 1), 'phụ đề khung dọc: đáy ở 86% chiều cao, có ' + cv.y1);
    no(Math.abs(ch.y1 - 1920 * 0.955) > 1, 'phụ đề không đặt bottom: đáy ở 95,5% như cũ, có ' + ch.y1);
    if (bad === b0) ok('máy quay dọc: cận người nói giữa khung, S 1,15 (thân ~55% chiều cao, neo đáy dưới chân; hàng sau ≤ 1,6) · mặt người nói luôn trọn trong khung, người bên cạnh trọn trong / trọn ngoài · 2000 khung ngẫu nhiên: kẹp trong cảnh, không cắt mặt người nói, tất định · không rung (lệch 1% giữ khung, 8% lia) · phụ đề dọc chừa 14% đáy');
  }
}

/* ---------------------------------------------------------------- cấu hình xuất video lưu trên TÁC PHẨM: work.video (v0.23.2, CNS-250) */
console.log('   — work.video: cổng kiểm, xoá, gói dự án / nhập lại');
{
  const b0 = bad, { MCP } = require(path.join(ROOT, 'server/mcp.js')), { Store } = require(path.join(ROOT, 'server/store.js'));
  const GC = require(path.join(ROOT, 'server/engine-node.js')).loadEngine(ROOT), dir = fs.mkdtempSync(path.join(TMP, 'wv-'));
  const m = new MCP({ engine: GC, store: new Store(dir), version: 't', system: {} });
  const imp = m.importProject(JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau/fun-office.json'), 'utf8')), {});
  no(imp.errors.length, 'nhập Fun Office: ' + JSON.stringify(imp.errors));
  const wid = 'fo-first-day', err = a => { try { m.saveWorkChecked(Object.assign({ id: wid }, a)); return null; } catch (e) { return e; } };
  no(err({ video: { aspect: '9:16', quality: '720p', container: 'webm' } }), 'lưu work.video hợp lệ');
  no(JSON.stringify(m.store.getWork(wid).video) !== '{"aspect":"9:16","quality":"720p","container":"webm"}', 'work.video lưu đúng: ' + JSON.stringify(m.store.getWork(wid).video));
  no(JSON.stringify(m.workView(m.store.getWork(wid)).video) !== JSON.stringify(m.store.getWork(wid).video), 'workView (GET /api/works/<id>) trả work.video');
  for (const [v, path0] of [[{ aspect: '4:3' }, 'video.aspect'], [{ quality: '4k' }, 'video.quality'], [{ container: 'avi' }, 'video.container'], [{ fps: 60 }, 'video.fps'], ['9:16', 'video'], [[1], 'video']]) {
    const e = err({ video: v });
    no(!e || e.code !== 422 || !(e.errors || []).some(x => x.startsWith(path0 + ':')), 'work.video sai (' + JSON.stringify(v) + ') → 422 kèm đường dẫn ' + path0 + ', có ' + (e && JSON.stringify(e.errors)));
  }
  no(JSON.stringify(m.store.getWork(wid).video) !== '{"aspect":"9:16","quality":"720p","container":"webm"}', 'lần lưu bị từ chối không đổi work.video');
  // gói dự án (xuất / sao lưu theo dự án) mang work.video; nhập vào máy khác giữ nguyên
  const bundle = m.exportProject(m.store.getWork(wid).project), bw = (bundle.works || []).find(w => w.id === wid);
  no(!bw || JSON.stringify(bw.video) !== '{"aspect":"9:16","quality":"720p","container":"webm"}', 'gói dự án mang work.video: ' + JSON.stringify(bw && bw.video));
  const m2 = new MCP({ engine: GC, store: new Store(fs.mkdtempSync(path.join(TMP, 'wv2-'))), version: 't', system: {} }), imp2 = m2.importProject(bundle, { overwrite: true });
  no(imp2.errors.length || JSON.stringify((m2.store.getWork(wid) || {}).video) !== '{"aspect":"9:16","quality":"720p","container":"webm"}', 'nhập gói: work.video giữ nguyên — ' + JSON.stringify([imp2.errors, (m2.store.getWork(wid) || {}).video]));
  const bad2 = JSON.parse(JSON.stringify(bundle)); bad2.works.find(w => w.id === wid).video = { aspect: 'sideways' };
  const imp3 = new MCP({ engine: GC, store: new Store(fs.mkdtempSync(path.join(TMP, 'wv3-'))), version: 't', system: {} }).importProject(bad2, { overwrite: true });
  no(!imp3.errors.some(x => x.kind === 'works' && /video\.aspect/.test(x.error)), 'gói có work.video sai → lỗi nhập kèm video.aspect: ' + JSON.stringify(imp3.errors));
  no(err({ video: null }) || m.store.getWork(wid).video !== undefined, 'video: null → xoá (về mặc định)');
  // Studio: đọc work.video trước; localStorage cũ chỉ là hạt giống MỘT lần (migrate rồi gỡ); POST qua cổng; không còn ghi localStorage
  const app = fs.readFileSync(path.join(ROOT, 'studio/app.js'), 'utf8');
  no(!/pref: function \(W\) \{ return Vid\.norm\(W && W\.video/.test(app) || !/localStorage\.removeItem\('gc-video-opts'\)/.test(app) || /localStorage\.setItem\('gc-video-opts'/.test(app) || !/Store\.api\('POST', 'api\/works', \{ id: W\.id, video: v \}\)/.test(app),
    'Studio: cấu hình xuất đọc từ work.video, localStorage cũ chỉ migrate một lần rồi gỡ, lưu qua POST /api/works (không ghi localStorage nữa)');
  if (bad === b0) ok('work.video: lưu / đọc qua cổng saveWorkChecked · giá trị / khoá lạ → 422 kèm đường dẫn (không đổi dữ liệu) · null → xoá · gói dự án mang theo, nhập lại giữ nguyên, gói sai báo lỗi · Studio migrate localStorage một lần');
}

/* ---------------------------------------------------------------- MỘT bộ dựng payload cho Studio + MCP + job CI (CNS-219 / CNS-246): studio/film-html.js FH.payload */
{
  const b0 = bad, app = fs.readFileSync(path.join(ROOT, 'studio/app.js'), 'utf8'), vci = fs.readFileSync(path.join(ROOT, 'tools/video-ci.mjs'), 'utf8'), mcpS = fs.readFileSync(path.join(ROOT, 'server/mcp.js'), 'utf8');
  const fp = app.slice(app.indexOf('function filmPayload('), app.indexOf('function exportFilm('));
  no(!/FH\.payload\(GC, W, /.test(fp) || /pick\(|motionPacks = /.test(fp), 'filmPayload của Studio dựng dữ liệu phim bằng FH.payload (studio/film-html.js) — không chọn khoá tại chỗ');
  no(!/m\.filmPayload\(/.test(vci) || /\bpick\(a, \[|const pick = |video\/payload\.js/.test(vci) || fs.existsSync(path.join(ROOT, 'studio/video/payload.js')), 'tools/video-ci.mjs lấy payload qua MCP.filmPayload → FH.payload (không còn bộ dựng thứ hai / payload chép tay)');
  no(!/filmPayload\(id, args, vo\) \{[\s\S]{0,600}FH\.payload\(this\.GC, w, /.test(mcpS) || !/const P = this\.filmPayload\(id, args, vo\)/.test(mcpS), 'MCP export_film_html (filmHTML) dựng qua CÙNG filmPayload → FH.payload');
  // hành vi: payload thật của Fun Office qua MCP (như job CI) — đủ hình như Studio, chữ trình phát en, mã engine = engine/scripts.json
  const { MCP } = require(path.join(ROOT, 'server/mcp.js')), { Store } = require(path.join(ROOT, 'server/store.js')), GC = require(path.join(ROOT, 'server/engine-node.js')).loadEngine(ROOT);
  const m = new MCP({ engine: GC, store: new Store(fs.mkdtempSync(path.join(TMP, 'pl-'))), version: 't', system: {} });
  const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau/fun-office.json'), 'utf8')), imp = m.importProject(B, { overwrite: true });
  const P = m.filmPayload(B.works[0].id, { lang: 'en', dialog: 'auto' }), SCR = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine/scripts.json'), 'utf8')).engine;
  no(imp.errors.length || P.ui !== 'en' || !Object.keys(P.dict).length || JSON.stringify(P.srcs) !== JSON.stringify(SCR) || P.film.shots.length !== B.works[0].shots.length || P.film.dialog !== 'auto'
    || !P.data.characters.length || P.data.characters.some(a => Object.keys(a).some(k => ['id', 'pack', 'name', 'version', 'look', 'expressions', 'kind', 'voice', 'role'].indexOf(k) < 0)) || !P.data.characters.every(a => a.voice && a.voice.role),
    'MCP.filmPayload (Fun Office, en): đủ srcs / data / film / ui / dict, chỉ khoá phim cần, giọng chốt có vai — ' + JSON.stringify([imp.errors, P.ui, P.srcs.length]).slice(0, 200));
  if (bad === b0) ok('một bộ dựng payload (studio/film-html.js FH.payload) cho phim HTML của Studio, video, MCP export_film_html và job CI (CNS-219 / CNS-246)');
}

process.exit(bad ? 1 : 0);
