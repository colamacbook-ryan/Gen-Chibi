// Job CI xuất video (CNS-215 / CNS-216): Chrome CÓ SẴN của runner (windows-latest / macos-latest) xuất 1 phân cảnh Fun Office bằng WebCodecs THẬT,
// lưu tệp, kiểm cấu trúc bằng tools/media-inspect.js (+ ffprobe nếu có). Không npm, không Playwright: CDP qua WebSocket có sẵn của Node 22 (tools/cdp.mjs).
//   node tools/video-ci.mjs [--require-mp4] [--hidden] [--quality 720p|1080p] [--out <thư mục>]
//     --require-mp4  TRƯỢT nếu trình duyệt không ra được MP4 avc1 + mp4a (job Windows / macOS — nhánh ưu tiên 1 phải chạy thật)
//     --hidden       trong lúc xuất mở một tab khác lên trước → trang xuất ở tab NỀN (bị bóp timer) vẫn phải xong (CNS-221)
//   Chạy cục bộ (Linux, Chromium của Playwright): ra WebM VP9 + Opus (Chromium mã nguồn mở không có H.264 / AAC) — vẫn kiểm đủ cấu trúc.
// Phục vụ repo bằng một server tĩnh nhỏ với ĐÚNG header của server thật (server/headers.js): trang xuất SAMEORIGIN + frame-ancestors 'self', còn lại DENY.
// © 2026 Gen Labs — All rights reserved.
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { launch } from './cdp.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { inspectMp4, inspectWebm } = require(path.join(ROOT, 'tools/media-inspect.js'));
const HDR = require(path.join(ROOT, 'server/headers.js'));
const argv = process.argv.slice(2), flag = f => argv.includes(f), val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const REQUIRE_MP4 = flag('--require-mp4'), HIDDEN = flag('--hidden'), QUALITY = val('--quality', '720p');
const OUT = path.resolve(val('--out', '') || fs.mkdtempSync(path.join(os.tmpdir(), 'gc-video-ci-')));
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('   ✗ ' + msg); } return cond; };

/* ---------------------------------------------------------------- payload: Fun Office như filmPayload của Studio (ui en, chữ trình phát nhúng kèm) */
function payload() {
  const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau/fun-office.json'), 'utf8')), W = B.works[0];
  const idx = fs.readFileSync(path.join(ROOT, 'studio/index.html'), 'utf8');
  const srcs = [...idx.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => /^(engine|kinds)\//.test(s));   // như filmSrcs() của Studio
  const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
  const dict = {};
  for (const f of ['engine', 'engine-data', 'player']) { const p = path.join(ROOT, 'locales/en', f + '.json'); if (fs.existsSync(p)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(p, 'utf8')))) if (k.slice(0, 2) !== '//') dict[k] = v; }
  return {
    srcs, ui: 'en', dict, have: 0, total: 0,
    data: { parts: B.parts || [], motionPacks: [], soundPacks: [], project: B.project.id,
      characters: B.characters.map(a => Object.assign(pick(a, ['id', 'name', 'version', 'look', 'expressions', 'kind', 'voice', 'role']), { pack: 'local.my' })),
      items: (B.items || []).map(x => pick(x, ['id', 'name', 'type', 'rarity', 'equip'])), scenes: (B.scenes || []).map(x => pick(x, ['id', 'name', 'layers', 'deco', 'palette', 'time', 'weather', 'spots'])),
      lang: W.lang || 'en', accent: 'us', voices: {}, voiceTotal: 0 },
    film: { title: W.title, logline: W.logline || '', dialog: 'auto', shots: W.shots.map(s => ({ id: s.id, title: s.title, description: s.description || '', scene: s.scene, cast: s.cast, event: s.event })) }
  };
}

/* ---------------------------------------------------------------- server tĩnh với header của server thật */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function serve() {
  const P = Buffer.from(JSON.stringify(payload()));
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), rel = u.replace(/^\/+/, '');
    const base = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
    if (u === '/__payload.json') { res.writeHead(200, Object.assign(base, { 'Content-Type': MIME['.json'] })); return res.end(P); }
    const ok = /^(engine|kinds|studio|locales)\//.test(rel) || /^tools\/fixtures\/video-ci\//.test(rel);
    const f = path.join(ROOT, rel);
    if (!ok || rel.split('/').includes('..') || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404, base); return res.end('not found'); }
    const extra = rel === HDR.VIDEO_EXPORT_PAGE ? HDR.VIDEO_EXPORT_HEADERS : /\.html$/.test(rel) ? HDR.STUDIO_HEADERS : {};
    res.writeHead(200, Object.assign(base, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }, extra));
    res.end(fs.readFileSync(f));
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const srv = await serve(), PORT = srv.address().port;
const chrome = await launch();
console.log('   Chrome: ' + chrome.version.product + ' · ' + chrome.chrome + ' · ' + process.platform + '/' + process.arch);
let code = 1;
try {
  const page = await chrome.open('http://127.0.0.1:' + PORT + '/tools/fixtures/video-ci/host.html?opts=' + encodeURIComponent(JSON.stringify({ quality: QUALITY, shots: [0] })));
  for (let i = 0; i < 100 && (await page.eval('window.__ci && window.__ci.state')) !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
  await page.eval('window.ciRun(), true', { awaitPromise: false });
  let other = null;
  if (HIDDEN) { other = await chrome.open('about:blank'); await other.activate(); }
  const t0 = Date.now(); let st;
  for (;;) {
    st = await page.eval('JSON.stringify(window.__ci)').then(JSON.parse);
    if (st.state !== 'running') break;
    if (Date.now() - t0 > 8 * 60000) { st.state = 'timeout'; break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  const pr = st.probe || {};
  console.log('   dò năng lực: ' + (pr.ok ? pr.format.container + ' · ' + pr.format.video.codec + ' + ' + pr.format.audio.codec : 'KHÔNG xuất được: ' + pr.code + ' — ' + pr.reason));
  if (check(st.state === 'done', 'xuất không xong: ' + st.state + ' ' + (st.code || '') + ' ' + (st.error || ''))) {
    const v = st.files.find(f => f.kind === 'video');
    const parts = [];
    for (let i = 0; i < v.size; i += 4 << 20) parts.push(Buffer.from(await page.eval('window.ciChunk(' + i + ', ' + (4 << 20) + ')'), 'base64'));
    const buf = Buffer.concat(parts), file = path.join(OUT, v.name);
    fs.writeFileSync(file, buf);
    console.log('   tệp: ' + file + ' (' + buf.length + ' B) · ' + st.frames + ' khung · ' + (st.durationMs / 1000).toFixed(2) + ' s · ' + (st.wallMs / 1000).toFixed(1) + ' s xuất (' + (st.wallMs / st.durationMs).toFixed(2) + '× thời lượng)');
    const fps = st.format.fps, frameMs = 1000 / fps;
    check(buf.length === v.size, 'tải về thiếu byte ' + buf.length + ' / ' + v.size);
    check(st.frames === st.dry.frames, 'lượt dựng ' + st.frames + ' khung ≠ lượt dò ' + st.dry.frames + ' (timeline không tất định)');
    if (st.format.container === 'mp4') {
      const r = inspectMp4(buf), V = r.tracks.find(t => t.handler === 'vide'), A = r.tracks.find(t => t.handler === 'soun');
      check(r.top.join() === 'ftyp,moov,mdat', 'MP4 phải ftyp → moov → mdat, có ' + r.top.join());
      check(!r.edts, 'MP4 không được có edit list');
      check(V && V.codec === 'avc1' && V.avcC, 'track hình avc1 + avcC');
      check(A && A.codec === 'mp4a' && A.asc, 'track tiếng mp4a + AudioSpecificConfig');
      if (V && A) {
        const vd = V.duration / V.timescale * 1000, ad = A.duration / A.timescale * 1000;
        check(V.samples.length === st.frames && V.samples[0].key, 'số khung ' + V.samples.length + ' = ' + st.frames + ', khung đầu là khung khoá');
        check(Math.abs(ad - vd) <= frameMs + 1e-6 + 1024 / 48, 'tiếng ' + ad.toFixed(1) + ' ms ≈ hình ' + vd.toFixed(1) + ' ms (±1 khung + 1 khung AAC)');
        console.log('   MP4: avc1 profile ' + V.avcC.profile + ' level ' + V.avcC.level + ' · ' + V.samples.length + ' khung (' + V.keyCount + ' khoá) · mp4a ' + A.sampleRate + ' Hz × ' + A.channels + ' · ASC ' + Buffer.from(A.asc).toString('hex') + ' · tiếng ' + ad.toFixed(1) + ' / hình ' + vd.toFixed(1) + ' ms');
      }
    } else {
      check(!REQUIRE_MP4, 'Chrome này KHÔNG ra được MP4 H.264 + AAC (ra ' + st.format.container + ' ' + st.format.video + ' + ' + st.format.audio + ') — nhánh ưu tiên 1 hỏng trên ' + process.platform);
      const r = inspectWebm(buf), vb = r.blocks.filter(b => b.track === 1), ab = r.blocks.filter(b => b.track === 2);
      check(r.tracks[0] && r.tracks[0].codec === 'V_VP9' && r.tracks[1] && r.tracks[1].codec === 'A_OPUS', 'WebM V_VP9 + A_OPUS');
      check(vb.length === st.frames && vb[0].key, 'số khung ' + vb.length + ' = ' + st.frames + ', khung đầu là khung khoá');
      const aEnd = ab.length ? ab[ab.length - 1].ms + 20 : 0;
      check(Math.abs(aEnd - st.durationMs) <= frameMs, 'tiếng kết thúc ' + aEnd + ' ms ≈ hình ' + st.durationMs.toFixed(1) + ' ms (±1 khung)');
      check(r.cues.length >= 1 && r.cues.every(q => r.elementAt(q.pos) === 0x1F43B675), 'Cues trỏ đúng cluster');
      console.log('   WebM: ' + vb.length + ' khung · ' + ab.length + ' gói Opus · ' + r.clusters.length + ' cluster · Duration ' + r.durationMs + ' ms');
    }
    if (REQUIRE_MP4) check(st.format.container === 'mp4' && /^avc1/.test(st.format.video) && /^mp4a/.test(st.format.audio), 'yêu cầu MP4 avc1 + mp4a, có ' + JSON.stringify(st.format));
    if (HIDDEN) check(st.visibility.includes('hidden'), 'tab xuất phải thực sự bị ẩn trong lúc xuất (thấy: ' + [...new Set(st.visibility)].join(',') + ')');
    const ffp = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,nb_read_frames,duration:format=duration,format_name', '-of', 'json', file], { encoding: 'utf8' });
    if (ffp.status === 0) {
      const j = JSON.parse(ffp.stdout), vs = j.streams.find(s => ['h264', 'vp9'].includes(s.codec_name));
      check(vs && +vs.nb_read_frames === st.frames, 'ffprobe đếm ' + (vs && vs.nb_read_frames) + ' khung, cần ' + st.frames);
      const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
      check(dec.status === 0 && !dec.stderr.trim(), 'ffmpeg giải mã không sạch: ' + dec.stderr.slice(0, 300));
      console.log('   ffprobe: ' + j.streams.map(s => s.codec_name).join(' + ') + ' · ' + j.format.format_name + ' · ' + (+j.format.duration).toFixed(3) + ' s · giải mã ' + (dec.status === 0 && !dec.stderr.trim() ? 'sạch' : 'LỖI'));
    } else console.log('   – không có ffprobe trên máy này: chỉ kiểm cấu trúc bằng tools/media-inspect.js');
    console.log('   mỗi khung: ' + JSON.stringify(st.stats.perFrameMs, (k, x) => typeof x === 'number' ? +x.toFixed(1) : x) + ' · heap đỉnh ' + (st.stats.heapPeak / 1048576).toFixed(1) + ' MB');
  }
  if (other) await other.close();
  code = fails.length ? 1 : 0;
} catch (e) { console.log('   ✗ ' + (e && e.stack || e)); code = 1; }
finally { await chrome.close(); srv.close(); }
console.log(code ? '   ✗ video-ci: ' + fails.length + ' lỗi' : '   ✓ video-ci: xuất 1 phân cảnh bằng WebCodecs thật + tệp đúng cấu trúc' + (HIDDEN ? ' (ở tab nền bị ẩn)' : ''));
process.exit(code);
