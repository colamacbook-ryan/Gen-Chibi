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
const { inspectMp4, inspectWebm } = require(path.join(ROOT, 'tools/media-inspect.js'));
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
      MessageChannel: class { constructor() { const self = this; this.port1 = { onmessage: null }; this.port2 = { postMessage: () => setImmediate(() => self.port1.onmessage && self.port1.onmessage({})) }; } },   // như MessageChannel thật: một tác vụ vĩ mô
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
  };
  await run();
  if (bad === b0) ok('đồng hồ ảo: chỉ vá ở trang xuất (có meta), thứ tự hẹn giờ (thời điểm → thứ tự đặt, 0 ms lồng nhau, interval, huỷ), rAF một lượt / khung, beforeFire trước mỗi lần bắn, chờ việc async đã track, không dùng setTimeout thật');
}

/* ---------------------------------------------------------------- tệp chữ */
{
  const b0 = bad;
  const s = T.srt([{ from: 3066.7, to: 5466.7, text: '  Good   morning, boss!\u0007 ' }, { from: 6000, to: 6000, text: 'rỗng thời lượng' }, { from: 3723004, to: 3725000, text: 'Một giờ sau' }, { from: 1, to: 2, text: '' }]);
  no(s !== '1\r\n00:00:03,067 --> 00:00:05,467\r\nGood morning, boss!\r\n\r\n2\r\n01:02:03,004 --> 01:02:05,000\r\nMột giờ sau\r\n', '.srt: đánh số lại, mốc hh:mm:ss,mmm, bỏ câu rỗng / 0 s, bỏ ký tự điều khiển: ' + JSON.stringify(s));
  no(T.txt({ title: 'First Day', description: '', credit: 'Made with gen-chibi · Gen Labs' }) !== 'First Day\n\nMade with gen-chibi · Gen Labs\n', '.txt: tiêu đề + mô tả + ghi công');
  no(T.slug('Ngày đầu đi làm!') !== 'ngay-dau-di-lam' || T.slug('') !== 'video', 'slug tên tệp');
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
  const vc = fs.readFileSync(path.join(ROOT, 'studio/video/vclock.js'), 'utf8');
  no(/(^|\/)engine\//.test(path.relative(ROOT, path.join(ROOT, 'studio/video/vclock.js'))), 'vclock không nằm trong engine/');
  no(!/window\.parent/.test(cap) || !/e\.origin !== ORIGIN \|\| e\.source !== PARENT/.test(cap), 'trang xuất kiểm origin + source của tin nhắn');
  if (bad === b0) ok('cách ly: Studio chỉ nạp client.js (không vclock / mux / capture), trang xuất không script inline, phim HTML chỉ nhúng engine/ + kinds/, một filmPayload cho hai đường, data: URL, không setTimeout, kiểm origin');
  void vc;
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
      ['/studio/video-export.html?x=1', 'SAMEORIGIN', "frame-ancestors 'self'"], ['/studio/video-export.html/', 'DENY', null], ['/studio//video-export.html', 'DENY', null]];
    const seen = [];
    for (const [u, xfo, fa] of cases) {
      const r = await fetch('http://127.0.0.1:' + PORT + u, { redirect: 'manual' }), csp = r.headers.get('content-security-policy') || '';
      seen.push(u + ' ' + r.status + ' ' + r.headers.get('x-frame-options'));
      no(r.headers.get('x-frame-options') !== xfo, u + ': X-Frame-Options phải là ' + xfo + ', có ' + r.headers.get('x-frame-options'));
      if (fa) no(csp.indexOf(fa) < 0 || csp.indexOf("script-src 'self'") < 0, u + ': CSP phải có ' + fa + " + script-src 'self', có " + csp);
      else no(/frame-ancestors 'self'/.test(csp), u + ': không được mang frame-ancestors \'self\'');
    }
    const pg = await (await fetch('http://127.0.0.1:' + PORT + '/studio/video-export.html')).text();
    no(pg.indexOf('gc-video-export') < 0, 'server trả đúng trang xuất video');
    if (bad === b0) ok('server: CHỈ studio/video-export.html nhận X-Frame-Options SAMEORIGIN + CSP frame-ancestors \'self\'; ' + (cases.length - 2) + ' loại phản hồi khác (Studio, đăng nhập, js, css, json, mẫu, API, 404, đường lách) giữ DENY');
  } finally { srv.kill(); }
}

process.exit(bad ? 1 : 0);
