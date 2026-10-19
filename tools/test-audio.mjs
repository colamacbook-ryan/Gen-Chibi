// Kiểm thử âm thanh (engine/sounds.js + engine/audio.js): thư viện âm · dựng offline MỌI âm (bộ chuẩn + gói Tam Quốc) · độ to · gắt ·
// limiter khi chồng · ghép mẫu · rò node · CPU của sfx() · nạp gói / trùng tên trên trang thật · renderWav (WAV tải về) · clip giọng trong say().
// © 2026 Gen Labs — All rights reserved.
// Dùng: node tools/test-audio.mjs     [GC_AUDIO_METRICS=bang-do.json] (cần Playwright + Chromium; không có thì phần trình duyệt BỎ QUA có báo — đặt GC_REQUIRE_PLAYWRIGHT=1 để coi là lỗi)
// Không cần cổng mạng: trang thử được phục vụ bằng page.route. Phần dữ liệu thuần (cổng kiểm, luật ghép, tự gán) ở tools/test-sounds.js.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { openRenderer, measure, loadPlaywright, wavMono16 } from './audio-render.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = fs.readFileSync(path.join(ROOT, 'engine/audio.js'), 'utf8'), SOUNDS = fs.readFileSync(path.join(ROOT, 'engine/sounds.js'), 'utf8');
const SRC = SOUNDS + '\n' + AUDIO;                       // trang dựng nạp thư viện (dữ liệu) rồi bộ thông dịch
const TQ = fs.readFileSync(path.join(ROOT, 'kinds/sound/tq-am.json'), 'utf8');
const SETUP = '(A) => { const r = window.GenChibi.sounds.registerPack(' + TQ + '); if (r.errors.length) throw new Error(r.errors[0]); }';
let fails = 0;
const ok = (c, msg, extra) => { if (!c) fails++; console.log('   ' + (c ? '✓' : '✗') + ' ' + msg + (!c && extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const T0 = Date.now();

/* ------------------------------------------------ 1. từ vựng (Node thuần, luôn chạy) */
const A = (() => { const w = { GenChibi: {} }; vm.runInNewContext(SRC, { window: w, console }, { filename: 'engine/sounds+audio.js' }); w.GenChibi.sounds.registerPack(JSON.parse(TQ)); return w.GenChibi.audio; })();
const S = (() => { const w = { GenChibi: {} }; vm.runInNewContext(SOUNDS, { window: w, console }); w.GenChibi.sounds.registerPack(JSON.parse(TQ)); return w.GenChibi.sounds; })();
const { loadEngine } = require('../server/engine-node.js');
const GC = loadEngine(ROOT);
const NAMES = A.sfxNames, INFO = A.sfxInfo(), LEGACY = S.LEGACY, FRAME = NAMES.filter(n => S.get(n).pack === 'gen.am');
{
  const vocab = GC.choreo.MOTION.sfx;
  ok(vocab.every(n => NAMES.includes(n)), 'mọi tiếng trong từ vựng biên đạo (MOTION.sfx) đều có trong thư viện âm', vocab.filter(n => !NAMES.includes(n)));
  ok(LEGACY.every(n => NAMES.includes(n)) && FRAME.length >= 45, '17 tên cũ còn đủ + bộ chuẩn ' + FRAME.length + ' âm (≥ 45) + gói Tam Quốc ' + (NAMES.length - FRAME.length) + ' âm', LEGACY.filter(n => !NAMES.includes(n)));
  ok(NAMES.every(n => INFO[n].dur > 0 && INFO[n].level > 0 && INFO[n].nodes <= 60 && INFO[n].cat && INFO[n].label), 'sfxInfo(): mỗi âm có dur, level, nhóm, nhãn, node ≤ 60');
  ok(['unlock', 'setMuted', 'setVolume', 'sfx', 'ambient', 'music', 'voiceOf', 'say', 'decodeClip', 'setVoiceMode', 'hush', 'stopAll', 'info'].every(k => typeof A[k] === 'function'), 'API công khai đủ (sfx, say, decodeClip, …)');
  A.sfx('pop'); A.sfx('khong-co'); A.sfx(null); A.sfx('pop', { delay: 99, gain: 'x', pan: NaN });
  const solo = (() => { const w = { GenChibi: {} }; vm.runInNewContext(AUDIO, { window: w, console }); return w.GenChibi.audio; })();
  solo.sfx('pop');
  ok(Array.isArray(solo.sfxNames) && solo.sfxNames.length === 0, 'sfx() trước unlock / tên lạ / null / opts rác / thiếu sounds.js không ném lỗi');
  let rej = null; A.decodeClip(new ArrayBuffer(8)).catch(e => { rej = e; });
  await new Promise(r => setTimeout(r, 20));
  ok(rej && /AudioContext/.test(rej.message), 'decodeClip không có AudioContext → từ chối rõ ràng (say() sẽ rơi về blip / im lặng)', rej && rej.message);
}

/* ------------------------------------------------------------ 2. cần trình duyệt */
if (!loadPlaywright()) {
  console.log('   ⚠ không có Playwright — bỏ qua dựng offline + clip giọng' + (process.env.GC_REQUIRE_PLAYWRIGHT ? ' (GC_REQUIRE_PLAYWRIGHT=1 → lỗi)' : ''));
  if (process.env.GC_REQUIRE_PLAYWRIGHT) fails++;
  process.exit(fails ? 1 : 0);
}
// công suất trên 4 kHz theo khung 20 ms (bộ lọc thông cao bậc 2 RBJ, Q 0.707): "gắt kéo dài" = tổng thời gian khung có phần > 4 kHz to hơn −30 dBFS
function harsh(l, r, sr) {
  const w0 = 2 * Math.PI * 4000 / sr, al = Math.sin(w0) / (2 * 0.7071), c = Math.cos(w0), a0 = 1 + al;
  const b = [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0], a = [1, -2 * c / a0, (1 - al) / a0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, e = 0, et = 0, sec = 0, hi = 0, tot = 0; const N = Math.round(sr * 0.02);
  for (let i = 0; i < l.length; i++) {
    const x = (l[i] + r[i]) / 2, y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
    e += y * y; et += x * x; hi += y * y; tot += x * x;
    if ((i + 1) % N === 0) { if (Math.sqrt(e / N) > 0.0316) sec += 0.02; e = 0; et = 0; }
  }
  return { sec: +sec.toFixed(2), ratio: +(hi / Math.max(tot, 1e-12)).toFixed(3) };
}
const loud = m => (m.activeRmsDb + m.activeRmsA + m.lufs) / 3;      // cùng thước đo với audio-lab calibrate
const median = v => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const R = await openRenderer();
try {
  /* ---------------------------------- 2a. dựng offline từng âm (âm lượng 1, gain 1: tệ nhất) */
  const M = {};
  for (const n of NAMES) { const r = await R.render(SRC, n, { volume: 1, seed: 1, secs: Math.max(1.5, INFO[n].dur + 1.2), setup: SETUP }); M[n] = { ...measure(r.l, r.r, r.sr), nodes: r.nodes, hf: harsh(r.l, r.r, r.sr) }; }
  const bad = (f) => NAMES.filter(n => f(M[n], INFO[n], n));
  ok(!bad(m => m.nan).length, 'không NaN / Infinity trong mẫu nào (' + NAMES.length + ' âm)', bad(m => m.nan));
  ok(!bad(m => m.clipped).length, 'không mẫu nào vỡ (≥ 0.9995)', bad(m => m.clipped));
  ok(!bad(m => m.peakDb > -0.3).length, 'đỉnh ≤ −0,3 dBFS sau limiter (âm lượng 1, gain 1)', bad(m => m.peakDb > -0.3).map(n => n + ' ' + M[n].peakDb));
  ok(!bad(m => m.peakDb < -40 || m.activeRmsDb < -45).length, 'không âm nào câm (đỉnh > −40 dBFS)', bad(m => m.peakDb < -40 || m.activeRmsDb < -45));
  ok(!bad(m => Math.abs(+m.dc) > 0.002).length, 'không lệch DC (|dc| < 0.002)', bad(m => Math.abs(+m.dc) > 0.002).map(n => n + ' ' + M[n].dc));
  ok(!bad((m, i) => m.dur60 > i.dur + 0.1 + 0.7).length, 'tắt hẳn (−60 dBFS) trong dur + 0.1 s + đuôi vang 0.7 s', bad((m, i) => m.dur60 > i.dur + 0.8).map(n => n + ' ' + M[n].dur60 + ' > ' + INFO[n].dur));
  ok(!bad((m, i) => m.dur60 < i.dur * 0.3).length, 'dur khai báo không phóng đại (âm kéo dài ≥ 30 % dur)', bad((m, i) => m.dur60 < i.dur * 0.3).map(n => n + ' ' + M[n].dur60 + ' < ' + INFO[n].dur));
  ok(!bad(m => m.nodes > 60).length, 'mỗi âm ≤ 60 node (ngân sách L-42)', bad(m => m.nodes > 60).map(n => n + ' ' + M[n].nodes));
  ok(!bad((m, i) => m.nodes > i.nodes).length, 'node đếm thật ≤ node cổng kiểm tính trước (cổng chặn đúng ngân sách)', bad((m, i) => m.nodes > i.nodes).map(n => n + ' ' + M[n].nodes + ' > ' + INFO[n].nodes));
  ok(!bad(m => m.hf.sec > 0.25).length, 'không gắt kéo dài: phần > 4 kHz to hơn −30 dBFS tổng ≤ 0,25 s mỗi âm', bad(m => m.hf.sec > 0.25).map(n => n + ' ' + M[n].hf.sec + ' s'));
  const spread = (k, list) => { const v = list.map(n => M[n][k]); return +(Math.max(...v) - Math.min(...v)).toFixed(1); };
  ok(spread('activeRmsDb', LEGACY) <= 10 && spread('lufs', LEGACY) <= 10 && spread('activeRmsA', LEGACY) <= 13, '17 âm cũ đồng đều: RMS có cổng lệch ' + spread('activeRmsDb', LEGACY) + ' dB (≤ 10) · LUFS ' + spread('lufs', LEGACY) + ' (≤ 10) · A ' + spread('activeRmsA', LEGACY) + ' (≤ 13)');
  const mid = median(LEGACY.map(n => loud(M[n])));
  ok(!bad(m => Math.abs(loud(m) - mid) > 7).length, 'mọi âm (khung + Tam Quốc) cùng dải ±7 dB quanh trung vị 17 âm cũ (' + mid.toFixed(1) + ' dB)', bad(m => Math.abs(loud(m) - mid) > 7).map(n => n + ' ' + loud(M[n]).toFixed(1)));
  console.log('     (độ to: ' + Math.min(...NAMES.map(n => loud(M[n]))).toFixed(1) + '…' + Math.max(...NAMES.map(n => loud(M[n]))).toFixed(1) + ' dB · đỉnh cao nhất ' + Math.max(...NAMES.map(n => M[n].peakDb)) + ' dBFS · node nhiều nhất ' + Math.max(...NAMES.map(n => M[n].nodes)) + ' · gắt nhất ' + NAMES.reduce((a, n) => M[n].hf.sec > M[a].hf.sec ? n : a, NAMES[0]) + ')');
  // GC_AUDIO_METRICS=tệp.json → ghi bảng đo của mọi âm (để soạn báo cáo / so phiên bản)
  if (process.env.GC_AUDIO_METRICS) fs.writeFileSync(process.env.GC_AUDIO_METRICS, JSON.stringify(M, (k, v) => (k === 'bands' ? undefined : v), 1));

  // biến thiên mỗi lần phát: hai seed cho hai bản khác nhau nhưng cùng độ to (±3 dB); { v, r } của bước chân đổi dáng gót / mũi
  {
    const a = await R.render(SRC, 'hit', { volume: 1, seed: 11, secs: 2 }), b = await R.render(SRC, 'hit', { volume: 1, seed: 12, secs: 2 });
    let diff = 0; for (let i = 0; i < a.l.length; i++) diff += Math.abs(a.l[i] - b.l[i]);
    const ma = measure(a.l, a.r), mb = measure(b.l, b.r);
    ok(diff > 1 && Math.abs(ma.activeRmsDb - mb.activeRmsDb) <= 3, 'hai lần phát khác nhau (cao độ / lọc / độ to lệch nhẹ) nhưng cùng cỡ độ to', { rms: [ma.activeRmsDb, mb.activeRmsDb] });
    // cùng seed → cùng tham số. Mẫu không trùng từng bit: Chromium cộng ≥ 3 đầu vào của một node theo thứ tự không cố định (cộng float
    // không kết hợp → lệch 1 ulp), bộ lọc chặn DC 24 Hz trên bus (cực sát z = 1) khuếch đại sai số làm tròn đó lên ~1e-5 (≈ −90 dBFS,
    // không nghe được; đo 15 cặp: lớn nhất 8,2e-5). Điều cần giữ là SỐ ĐO lặp lại được: mọi chỉ số trùng tới 0,01 dB.
    const c = await R.render(SRC, 'hit', { volume: 1, seed: 11, secs: 2 }), mc = measure(c.l, c.r);
    let md = 0; for (let i = 0; i < a.l.length; i++) md = Math.max(md, Math.abs(a.l[i] - c.l[i]));
    const same = ['peakDb', 'activeRmsDb', 'lufs', 'activeRmsA', 'dur60', 'centroid'].every(k => Math.abs(ma[k] - mc[k]) <= (k === 'centroid' ? 1 : 0.01));
    ok(md < 3e-4 && same, 'cùng seed → cùng mẫu (lệch ' + md.toExponential(1) + ' ≤ 3e-4 ≈ −70 dBFS, làm tròn float) và cùng mọi chỉ số đo (≤ 0,01 dB) — kết quả đo lặp lại được', { md, ma, mc });
  }
  // tuỳ chọn gain / pan / delay
  {
    const full = measure(...(await R.render(SRC, { name: 'hit', opts: { gain: 1 } }, { volume: 1, seed: 3, secs: 2 }).then(r => [r.l, r.r])));
    const half = measure(...(await R.render(SRC, { name: 'hit', opts: { gain: 0.5 } }, { volume: 1, seed: 3, secs: 2 }).then(r => [r.l, r.r])));
    ok(half.activeRmsDb < full.activeRmsDb - 2.5, 'opts.gain = 0.5 hạ độ to ≥ 2,5 dB', [full.activeRmsDb, half.activeRmsDb]);
    const pl = await R.render(SRC, { name: 'pop', opts: { pan: -1 } }, { volume: 1, seed: 3, secs: 1 });
    const e = x => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return s; };
    ok(e(pl.l) > e(pl.r) * 8, 'opts.pan = −1 đẩy tiếng sang trái (≥ 9 dB)', [e(pl.l), e(pl.r)]);
    ok(M.whoosh.sideDb > -30 && M.tweet.sideDb > -30, 'whoosh / tweet có bề rộng stereo (làn trượt; kênh bên ≥ −30 dB so với giữa)', [M.whoosh.sideDb, M.tweet.sideDb]);
    const dl = await R.render(SRC, { name: 'pop', opts: { delay: 0.5 } }, { volume: 1, seed: 3, secs: 1.2 });
    let first = -1; for (let i = 0; i < dl.l.length; i++) if (Math.abs(dl.l[i]) > 0.003) { first = i / dl.sr; break; }
    ok(first >= 0.49 && first < 0.56, 'opts.delay = 0,5 s → âm bắt đầu đúng lúc theo đồng hồ âm thanh (' + first.toFixed(3) + ' s)', first);
  }
  // tắt tiếng → im; hạn mức MAX_FX; nhiều âm to nhất chồng nhau → limiter giữ ≤ −0,3 dBFS
  {
    const mu = await R.render(SRC, 'hit', { volume: 1, seed: 1, secs: 1, setup: '(A) => A.setMuted(true)' });
    ok(mu.nodes === 0, 'setMuted(true) → sfx() không dựng node nào', mu.nodes);
    const one = M.hit.nodes, many = await R.render(SRC, Array(40).fill('hit'), { volume: 1, seed: 1, secs: 1.5 });
    ok(many.nodes <= 12 * one, 'MAX_FX = 12: 40 lần hit cùng nhịp chỉ dựng ≤ 12 hiệu ứng (' + many.nodes + ' ≤ ' + 12 * one + ' node)', { many: many.nodes, one });
    const top = [...NAMES].sort((x, y) => M[y].peakDb - M[x].peakDb || loud(M[y]) - loud(M[x])).slice(0, 12);
    const st = await R.render(SRC, top, { volume: 1, seed: 5, secs: 4, setup: SETUP }), ms = measure(st.l, st.r);
    ok(ms.peakDb <= -0.3 && ms.clipped === 0 && !ms.nan, '12 âm có đỉnh cao nhất chồng cùng lúc (gain 1, âm lượng 1) không vỡ: đỉnh ' + ms.peakDb + ' dBFS (' + top.join(', ') + ')', ms);
    const stN = await R.render(SRC, Array(12).fill(top[0]), { volume: 1, seed: 5, secs: 4, setup: SETUP }), mn = measure(stN.l, stN.r);
    ok(mn.peakDb <= -0.3 && mn.clipped === 0, '12 × ' + top[0] + ' (tệ nhất) vẫn ≤ −0,3 dBFS', mn.peakDb);
  }
  // công thức ghép mẫu (GC.sounds.RECIPES) phát liền một mạch bằng delay: không vỡ, có tiếng suốt chuỗi
  {
    for (const rc of S.RECIPES) {
      const end = Math.max(...rc.seq.map(x => x[0] + S.get(x[1]).dur));
      const r = await R.render(SRC, rc.seq.map(x => ({ name: x[1], opts: { delay: x[0] } })), { volume: 1, seed: 7, secs: end + 1 }), m = measure(r.l, r.r);
      ok(!m.nan && m.clipped === 0 && m.peakDb <= -0.3 && m.dur60 >= end * 0.8, 'ghép mẫu "' + rc.id + '" (' + rc.seq.map(x => x[1]).join(' → ') + '): ' + m.dur60 + ' s, đỉnh ' + m.peakDb + ' dBFS', m);
    }
  }
  console.log('   … dựng offline xong sau ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s');

  /* ------------------------------------------- 2b. thời gian thực: say() + clip giọng */
  const sr = 24000;
  function speechClip() {          // 0.35 s lặng · 5 "âm tiết" 0.18 s cách 0.08 s · 0.4 s lặng
    const x = new Float32Array(Math.round(2.05 * sr));
    for (let b = 0; b < 5; b++) {
      const s0 = Math.round((0.35 + b * 0.26) * sr), n = Math.round(0.18 * sr);
      for (let i = 0; i < n; i++) { const env = Math.sin(Math.PI * i / n) ** 2; let v = 0; for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * 150 * (1 + b * 0.06) * k * i / sr) / k; x[s0 + i] = 0.55 * env * v / 1.6; }
    }
    return wavMono16(x, sr);
  }
  const WAV = speechClip(), B64 = WAV.toString('base64');
  const tone = (f, sec) => { const x = new Float32Array(Math.round(sec * sr)); for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr) * Math.min(1, i / 400, (x.length - i) / 400); return wavMono16(x, sr); };
  const LONG = (() => { const x = new Float32Array(Math.round(4 * sr)); for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 200 * i / sr) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * i / sr)); return wavMono16(x, sr); })();
  const TAP = `(() => {
    const Base = window.AudioContext, dd = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination').get;
    window.__nodes = { made: 0, disc: 0 };    // đếm node tạo ra / ngắt (rò rỉ?)
    for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
      if (!/^create/.test(k) || k === 'createBuffer' || k === 'createPeriodicWave') continue;
      const orig = BaseAudioContext.prototype[k]; BaseAudioContext.prototype[k] = function () { window.__nodes.made++; return orig.apply(this, arguments); };
    }
    const odis = AudioNode.prototype.disconnect; AudioNode.prototype.disconnect = function () { if (!arguments.length) window.__nodes.disc++; return odis.apply(this, arguments); };
    window.__targets = []; const ost = AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime = function (v) { window.__targets.push(v); return ost.apply(this, arguments); };
    class Tap extends Base {
      constructor() {
        super(); const an = this.createAnalyser(); an.fftSize = 1024; an.connect(dd.call(this)); this.__an = an; window.__ctx = this;
        const buf = new Float32Array(1024), m = window.__meter = { peak: 0 };
        setInterval(() => { an.getFloatTimeDomainData(buf); for (const x of buf) if (Math.abs(x) > m.peak) m.peak = Math.abs(x); }, 20);
      }
      get destination() { return this.__an; }
    }
    window.AudioContext = Tap;
  })();`;
  const files = { '/engine/core.js': fs.readFileSync(path.join(ROOT, 'engine/core.js')), '/engine/audio.js': AUDIO, '/engine/sounds.js': SOUNDS };
  const bg = await R.browser.newContext(), pg = await bg.newPage(), errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  // dòng "Failed to load resource … 404" là của Chromium khi test cố tình xin URL không có — không phải lỗi của engine
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.addInitScript(TAP);
  await pg.route('http://gc.test/**', r => {
    const u = new URL(r.request().url()).pathname;
    // sounds.js nạp SAU audio.js: bộ thông dịch tra thư viện lúc phát, thứ tự thẻ <script> không quan trọng
    if (u === '/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><button id="b">go</button><script src="/engine/core.js"></script><script src="/engine/audio.js"></script><script src="/engine/sounds.js"></script>' });
    if (files[u]) return r.fulfill({ contentType: 'text/javascript', body: files[u] });
    if (u === '/clip.wav') return r.fulfill({ contentType: 'audio/wav', body: WAV });
    if (u === '/long.wav') return r.fulfill({ contentType: 'audio/wav', body: LONG });
    return r.fulfill({ status: 404, body: 'không có' });
  });
  await pg.goto('http://gc.test/');
  await pg.waitForFunction(() => window.GenChibi && window.GenChibi.audio && window.GenChibi.sounds);
  await pg.click('#b', { force: true }); await pg.evaluate(() => window.GenChibi.audio.unlock());
  await pg.waitForFunction(() => window.__ctx && window.__ctx.state === 'running', null, { timeout: 5000 });
  // gói chủ đề nạp được trên trang thật; trùng tên bị từ chối (chỉ ra gói giữ tên); âm của gói phát được
  const pk = await pg.evaluate((tq) => {
    const S = window.GenChibi.sounds, A = window.GenChibi.audio, n = window.__nodes, r = S.registerPack(JSON.parse(tq)), d = JSON.parse(tq);
    d.id = 'trung-ten'; d.sounds = { hit: d.sounds['trong-tran'] };
    const dup = S.registerPack(d), m0 = n.made; A.sfx('trong-tran');
    return { errs: r.errors, dup: dup.errors, made: n.made - m0, names: A.sfxNames.length };
  }, TQ);
  ok(!pk.errs.length && pk.made > 10 && pk.names === NAMES.length, 'gói Tam Quốc nạp trên trang, sfx("trong-tran") dựng ' + pk.made + ' node, sfxNames có ' + pk.names + ' âm', pk);
  ok(pk.dup.length === 1 && /trùng tên âm của gói "gen\.am"/.test(pk.dup[0]), 'gói có âm trùng tên ("hit") bị từ chối, chỉ ra gói giữ tên', pk.dup);
  // CPU của sfx(): chỉ dựng node + lập lịch (L-42: ≤ ~2 ms mỗi lần) — đo mọi âm sau một lượt khởi động, giữa các lượt chờ cho MAX_FX nhả
  // (chỉ tính lần gọi THẬT dựng node — lần bị MAX_FX chặn thì nhanh vô nghĩa; lô 6 âm, chờ 1,3 s cho hạn mức nhả; đo HAI lượt, lấy lần
  // nhanh hơn của mỗi âm — máy dùng chung với tiến trình khác nên một lần đo lẻ có thể bị bộ lập lịch của hệ điều hành chen ngang)
  const cpu = await pg.evaluate(async (names) => {
    const A = window.GenChibi.audio, n = window.__nodes, sleep = ms => new Promise(r => setTimeout(r, ms)), t = {};
    for (let k = 0; k < names.length; k += 10) { for (const nm of names.slice(k, k + 10)) A.sfx(nm, { gain: 0.05 }); await sleep(120); }
    await sleep(5000);
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < names.length; k += 6) {
        for (const nm of names.slice(k, k + 6)) { const m0 = n.made, t0 = performance.now(); A.sfx(nm, { gain: 0.05, pan: 0.3 }); const dt = performance.now() - t0; if (n.made > m0) t[nm] = Math.min(t[nm] == null ? 1e9 : t[nm], dt); }
        await sleep(1300);
      }
      await sleep(3500);
    }
    return t;
  }, NAMES);
  const cv = Object.values(cpu).sort((a, b) => a - b), p90 = cv[Math.floor(cv.length * 0.9)], worst = Object.keys(cpu).reduce((a, k) => cpu[k] > cpu[a] ? k : a, Object.keys(cpu)[0]);
  ok(cv.length >= NAMES.length * 0.9 && p90 <= 2 && cv[cv.length - 1] <= 8, 'CPU sfx() (' + cv.length + '/' + NAMES.length + ' âm đo được): trung vị ' + cv[cv.length >> 1].toFixed(2) + ' ms · p90 ' + p90.toFixed(2) + ' ms (≤ 2) · chậm nhất ' + worst + ' ' + cpu[worst].toFixed(2) + ' ms (≤ 8)', cpu);
  // rò rỉ: phát MỌI âm (theo lô 10 âm, dưới hạn mức 12 → không âm nào bị bỏ) rồi chờ tắt hết → mọi node dựng ra phải được ngắt (onended → free)
  await pg.evaluate(() => new Promise(r => setTimeout(r, 4500)));
  const leak = await pg.evaluate(async (o) => {
    const A = window.GenChibi.audio, n = window.__nodes, sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(300); const m0 = n.made, d0 = n.disc;
    for (let k = 0; k < o.names.length; k += 10) {
      const lot = o.names.slice(k, k + 10);
      for (const nm of lot) { A.sfx(nm, { gain: 0.3 }); await sleep(30); }
      await sleep(Math.max(...lot.map(nm => o.info[nm].dur)) * 1000 + 1200);
    }
    await sleep(500);
    return { made: n.made - m0, disc: n.disc - d0 };
  }, { names: NAMES, info: INFO });
  const want = NAMES.reduce((a, nm) => a + INFO[nm].nodes - 1, 0);   // không pan → mỗi âm ít hơn số tính trước 1 node
  ok(leak.made >= want * 0.9 && leak.disc >= leak.made, 'không rò node: ' + leak.made + ' node dựng cho ' + NAMES.length + ' âm (đủ, không âm nào bị bỏ), ' + leak.disc + ' đã ngắt khi xong', { leak, want });
  // renderWav (v0.18): dựng một âm / một công thức ghép ra WAV ngoại tuyến để nghe lại / tải về — chuỗi trộn riêng, KHÔNG đụng bộ phát đang chạy
  const wv = await pg.evaluate(async () => {
    const A = window.GenChibi.audio, S = window.GenChibi.sounds, ctx0 = window.__ctx;
    const info = x => { const v = new DataView(x), u = new Uint8Array(x); let pk = 0; for (let i = 44; i < u.length; i += 2) pk = Math.max(pk, Math.abs(v.getInt16(i, true))); return { riff: String.fromCharCode(...u.slice(0, 4)) + String.fromCharCode(...u.slice(8, 12)), ch: v.getUint16(22, true), sr: v.getUint32(24, true), bits: v.getUint16(34, true), data: v.getUint32(40, true), len: x.byteLength, pk }; };
    const diff = (p, q) => { const x = new Int16Array(p.slice(44)), y = new Int16Array(q.slice(44)); let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - y[i])); return m; };
    const a = await A.renderWav('wham', { seed: 1 }), b = await A.renderWav('wham', { seed: 1 }), c = await A.renderWav('wham', { seed: 9 });
    const seq = await A.renderWav(S.RECIPES[0].seq.map(x => ({ name: x[1], delay: x[0] })), { seed: 2 }), half = await A.renderWav([{ name: 'wham', gain: 0.5 }], { seed: 1 });
    const out = { a: info(a), seq: info(seq), half: info(half).pk, same: diff(a, b), other: diff(a, c), rej: [] };
    for (const bad of ['khong-co', [], Array(13).fill('pop'), 5]) { try { await A.renderWav(bad); out.rej.push(null); } catch (e) { out.rej.push(e.message); } }
    const m0 = window.__nodes.made; A.sfx('pop');
    out.live = { same: window.__ctx === ctx0, made: window.__nodes.made - m0, state: window.__ctx.state };
    return out;
  });
  ok(wv.a.riff === 'RIFFWAVE' && wv.a.ch === 2 && wv.a.sr === 44100 && wv.a.bits === 16 && wv.a.data === wv.a.len - 44, 'renderWav: WAV 16-bit stereo 44,1 kHz đúng đầu tệp (' + wv.a.len + ' byte)', wv.a);
  ok(wv.a.pk > 3000 && wv.a.pk <= 31700, 'renderWav: có tiếng, đỉnh ≤ −0,3 dBFS (limiter như lúc phát): ' + wv.a.pk + ' / 32767', wv.a);
  ok(wv.seq.len > wv.a.len * 1.5 && wv.seq.pk > 3000, 'renderWav: danh sách công thức ghép (5 âm theo delay) dài hơn một âm: ' + wv.seq.len + ' byte', wv.seq);
  ok(wv.half < wv.a.pk * 0.75, 'renderWav: opts gain 0,5 nhỏ hơn rõ (' + wv.half + ' < ' + Math.round(wv.a.pk * 0.75) + ')');
  ok(wv.same <= 8 && wv.other > wv.same, 'renderWav: cùng seed gần như cùng tệp (lệch tối đa ' + wv.same + ' LSB), khác seed khác hẳn (' + wv.other + ' LSB)', wv);
  ok(/Không có âm "khong-co"/.test(wv.rej[0]) && /1…12/.test(wv.rej[1]) && /1…12/.test(wv.rej[2]) && wv.rej[3] && /Không có âm/.test(wv.rej[3]), 'renderWav: âm lạ / danh sách rỗng / > 12 lần phát → từ chối rõ ràng', wv.rej);
  ok(wv.live.same && wv.live.made >= 4 && wv.live.state === 'running', 'renderWav không đụng bộ phát đang chạy: cùng AudioContext, sfx() vẫn dựng node sau đó', wv.live);
  {
    // không cần unlock / AudioContext thật: trang chưa bấm gì vẫn dựng được WAV (nút tải ở Thư viện bấm lần đầu cũng chạy)
    const p2 = await bg.newPage(); await p2.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    for (const f of ['engine/core.js', 'engine/sounds.js', 'engine/audio.js']) await p2.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
    const pre = await p2.evaluate(async () => ({ ctx: window.GenChibi.audio.info().ctx, bytes: (await window.GenChibi.audio.renderWav('pop', { sampleRate: 22050 })).byteLength }));
    await p2.close();
    ok(pre.ctx === false && pre.bytes > 2000 && pre.bytes < 40000, 'renderWav chạy khi chưa unlock() (chưa có AudioContext), sampleRate 22050 → tệp nhỏ hơn: ' + pre.bytes + ' byte', pre);
  }
  const SAY = `async (o) => {
    const A = window.GenChibi.audio, log = { mouth: [], word: [], tm: [], tw: [], t0: performance.now() };
    const mk = k => k === 'buf' ? Uint8Array.from(atob(o.b64), c => c.charCodeAt(0)).buffer : k === 'view' ? new Uint8Array(Uint8Array.from(atob(o.b64), c => c.charCodeAt(0)).buffer, 0) : k === 'blob' ? new Blob([Uint8Array.from(atob(o.b64), c => c.charCodeAt(0))], { type: 'audio/wav' }) : k === 'data' ? 'data:audio/wav;base64,' + o.b64 : k === 'raw' ? Uint8Array.from(atob(o.b64), c => c.charCodeAt(0)).slice(44).buffer : o.url;
    window.__meter.peak = 0; window.__targets.length = 0;
    if (o.mode) A.setVoiceMode(o.mode); if (o.muted != null) A.setMuted(o.muted);
    const p = A.say(o.text, A.voiceOf({ id: 'x', role: 'Võ tướng' }), { clip: o.kind === 'none' ? undefined : mk(o.kind), clipRate: o.rate,
      onMouth: l => { log.mouth.push(l); log.tm.push(performance.now() - log.t0); }, onWord: (i, n) => { log.word.push([i, n]); log.tw.push(performance.now() - log.t0); } });
    if (o.hushAt) setTimeout(() => A.hush(), o.hushAt);
    await p; log.ms = performance.now() - log.t0; log.peak = window.__meter.peak; log.info = A.info(); log.targets = window.__targets.slice();
    if (o.mode) A.setVoiceMode('auto'); if (o.muted != null) A.setMuted(false);
    return log;
  }`;
  const say = (o) => pg.evaluate(`(${SAY})(${JSON.stringify(o)})`);
  const TEXT = 'một hai ba bốn năm';
  const sane = (lg, label) => {
    const nz = lg.mouth.filter(v => v > 0.05), words = lg.word.map(w => w[0]);
    ok(lg.ms > 900 && lg.ms < 1900, label + ': Promise xong khi hết phần có tiếng (bỏ lặng đầu / cuối: ' + Math.round(lg.ms) + ' ms, không phải 2050)', lg.ms);
    ok(lg.mouth.every(v => v >= 0 && v <= 1) && nz.length >= 8 && Math.max(...lg.mouth) >= 0.6, label + ': onMouth theo biên độ thật — ' + nz.length + ' mẫu khác 0, cao nhất ' + Math.max(...lg.mouth).toFixed(2), { n: nz.length, max: Math.max(...lg.mouth) });
    const core = lg.mouth.slice(lg.mouth.findIndex(v => v >= 0.5)), lastHi = core.length - 1 - [...core].reverse().findIndex(v => v >= 0.5), inner = core.slice(0, lastHi + 1);
    ok(Math.min(...inner) <= 0.5, label + ': miệng khép lại giữa các âm tiết (min trong đoạn nói ' + Math.min(...inner).toFixed(2) + ')', Math.min(...inner));
    ok(lg.mouth[lg.mouth.length - 1] === 0, label + ': onMouth(0) cuối cùng');
    ok(words.slice(0, 5).join() === '0,1,2,3,4' && lg.word[lg.word.length - 1][0] === 5 && lg.word[lg.word.length - 1][1] === 5, label + ': onWord(i, 5) đủ 0→4 rồi 5/5 lúc xong', lg.word);
    ok(lg.tw[0] < 250 && lg.tw[4] > lg.ms * 0.5 && lg.tw[4] < lg.ms * 1.01, label + ': chữ rải theo thời lượng nói (chữ 0 lúc ' + Math.round(lg.tw[0]) + ' ms, chữ 4 lúc ' + Math.round(lg.tw[4]) + ' / ' + Math.round(lg.ms) + ' ms)', { tw: lg.tw });
    ok(lg.tw.every((t, i) => i === 0 || t >= lg.tw[i - 1]), label + ': thời điểm chữ tăng dần');
  };
  let lg = await say({ kind: 'buf', b64: B64, text: TEXT });
  sane(lg, 'clip ArrayBuffer (WAV)');
  ok(lg.peak > 0.05, 'clip thật sự ra loa (đo bằng AnalyserNode: đỉnh ' + lg.peak.toFixed(2) + ')', lg.peak);
  ok(lg.targets.includes(0.5) && lg.targets.includes(1), 'hạ nền + nhạc (duck 0.5) khi nói, nhả (1) khi xong', lg.targets.filter((v, i, a) => a.indexOf(v) === i));
  ok(lg.info.clipError === null, 'info().clipError rỗng khi clip tốt', lg.info);
  lg = await say({ kind: 'data', b64: B64, text: TEXT }); sane(lg, 'clip data: URI');
  lg = await say({ kind: 'url', url: '/clip.wav', text: TEXT }); sane(lg, 'clip URL (fetch)');
  lg = await say({ kind: 'blob', b64: B64, text: TEXT }); sane(lg, 'clip Blob');
  lg = await say({ kind: 'view', b64: B64, text: TEXT }); sane(lg, 'clip TypedArray');
  lg = await say({ kind: 'raw', b64: B64, text: TEXT, rate: sr }); sane(lg, 'clip PCM thô s16le (không header)');
  // giải mã đệm (LRU): cùng nguồn → cùng AudioBuffer; nạp quá hạn mức thì đẩy cái cũ nhất ra
  const lru = await pg.evaluate(async (o) => {
    const A = window.GenChibi.audio, mk = b => 'data:audio/wav;base64,' + b, first = mk(o.list[0]);
    const a = await A.decodeClip(first), b = await A.decodeClip(first), c = await A.decodeClip(Uint8Array.from(atob(o.list[0]), x => x.charCodeAt(0)).buffer);
    const buf = Uint8Array.from(atob(o.list[0]), x => x.charCodeAt(0)).buffer, before = buf.byteLength; await A.decodeClip(buf);
    const out = { same: a === b, sameBin: c === (await A.decodeClip(Uint8Array.from(atob(o.list[0]), x => x.charCodeAt(0)).buffer)), dur: +a.duration.toFixed(3), rate: a.sampleRate, detached: buf.byteLength !== before };
    for (let i = 1; i < o.list.length; i++) await A.decodeClip(mk(o.list[i]));
    const again = await A.decodeClip(first); out.evicted = again !== a; const last = await A.decodeClip(mk(o.list[o.list.length - 1])); out.lastKept = last === (await A.decodeClip(mk(o.list[o.list.length - 1])));
    return out;
  }, { list: Array.from({ length: 20 }, (_, i) => tone(300 + i * 40, 0.2).toString('base64')) });
  ok(lru.same && lru.sameBin, 'decodeClip: cùng nguồn (data URI / ArrayBuffer cùng nội dung) → cùng AudioBuffer (đệm LRU)', lru);
  ok(!lru.detached, 'decodeClip không "detach" ArrayBuffer người gọi đưa vào');
  ok(lru.evicted && lru.lastKept, 'LRU: nạp 20 clip (hạn mức 16) → clip cũ nhất bị đẩy ra, clip mới nhất còn', lru);
  ok(Math.abs(lru.dur - 0.2) < 0.01 && lru.rate === 24000, 'decodeClip giữ đúng độ dài + tần số mẫu của WAV (' + lru.dur + ' s · ' + lru.rate + ' Hz)', lru);
  // dự phòng: clip thiếu / hỏng → lặng lẽ rơi về blip (vẫn nhép miệng + chữ + Promise xong), không ném lỗi, không console.error
  errs.length = 0;
  for (const [label, o] of [['URL 404', { kind: 'url', url: '/khong-co.wav' }], ['WAV hỏng (RIFF cụt)', { kind: 'data', b64: Buffer.from('RIFF\x10\0\0\0WAVEjunkjunkjunk').toString('base64') }], ['ArrayBuffer rỗng', { kind: 'buf', b64: '' }]]) {
    const f = await say({ ...o, text: TEXT, mode: 'auto' });
    ok(f.ms > 300 && f.ms < 6000 && f.mouth.some(v => v > 0.05) && f.word.length >= 5 && f.mouth[f.mouth.length - 1] === 0, 'dự phòng (' + label + '): rơi về blip — nhép miệng, đủ chữ, Promise xong sau ' + Math.round(f.ms) + ' ms', { ms: f.ms, n: f.mouth.length });
    ok(typeof f.info.clipError === 'string' && f.info.clipError.length > 0, 'dự phòng (' + label + '): lý do ở info().clipError = "' + f.info.clipError + '"');
  }
  ok(!errs.length, 'clip hỏng không gây pageerror / console.error', errs);
  // hush giữa chừng
  lg = await say({ kind: 'url', url: '/long.wav', text: 'một hai ba bốn năm sáu', hushAt: 400 });
  ok(lg.ms > 350 && lg.ms < 900 && lg.mouth[lg.mouth.length - 1] === 0, 'hush() giữa chừng cắt clip dài 4 s: Promise xong sau ' + Math.round(lg.ms) + ' ms, onMouth(0)', lg.ms);
  const peakAfter = await pg.evaluate(async () => { await new Promise(r => setTimeout(r, 120)); window.__meter.peak = 0; await new Promise(r => setTimeout(r, 350)); return window.__meter.peak; });   // 120 ms: cửa sổ AnalyserNode ~21 ms + fade 10 ms đã trôi hết
  ok(peakAfter < 0.02, 'sau hush() loa im (đỉnh ' + peakAfter.toFixed(4) + ')', peakAfter);
  // say mới cắt say cũ
  const two = await pg.evaluate(async (b64) => {
    const A = window.GenChibi.audio, clip = 'data:audio/wav;base64,' + b64, t0 = performance.now(); let first = 0;
    const p1 = A.say('một hai ba', A.voiceOf({ id: 'x' }), { clip }).then(() => { first = performance.now() - t0; });
    await new Promise(r => setTimeout(r, 300)); const p2 = A.say('bốn năm', A.voiceOf({ id: 'x' }), { clip }); await p1; const a = first; await p2; return [a, performance.now() - t0];
  }, B64);
  ok(two[0] < 700 && two[1] > two[0] + 700, 'say() mới ngắt say() cũ ngay (cũ xong sau ' + Math.round(two[0]) + ' ms, mới sau ' + Math.round(two[1]) + ' ms)', two);
  // voiceMode 'blip' bỏ qua clip; 'off' / tắt tiếng: im nhưng miệng + chữ chạy theo độ dài THẬT của clip
  lg = await say({ kind: 'data', b64: B64, text: TEXT, mode: 'blip' });
  ok(lg.peak > 0.005 && lg.ms > 500 && lg.mouth.some(v => v > 0.05), 'voiceMode "blip" ép giọng blip (bỏ qua clip): vẫn có tiếng + nhép miệng', { peak: lg.peak, ms: lg.ms });
  lg = await say({ kind: 'data', b64: B64, text: TEXT, mode: 'off' });
  sane(lg, 'voiceMode "off" (im, theo độ dài clip)');
  ok(lg.peak < 0.005, 'voiceMode "off": không ra loa (đỉnh ' + lg.peak.toFixed(4) + ')', lg.peak);
  lg = await say({ kind: 'data', b64: B64, text: TEXT, muted: true });
  sane(lg, 'tắt tiếng (im, theo độ dài clip)');
  ok(lg.peak < 0.005, 'tắt tiếng: không ra loa', lg.peak);
  // không clip: đường cũ vẫn chạy như trước
  lg = await say({ kind: 'none', text: TEXT, mode: 'blip' });
  ok(lg.ms > 600 && lg.mouth.some(v => v > 0.05) && lg.word.length >= 5, 'không có clip: đường blip cũ không đổi', { ms: lg.ms });
  // âm thanh nền / nhạc vẫn chạy trong chuỗi mới
  const bed = await pg.evaluate(async () => { const A = window.GenChibi.audio; A.ambient({ time: 'day', weather: 'rain', indoor: false }); A.music('comic'); A.sfx('hit'); A.sfx('gong'); window.__meter.peak = 0; await new Promise(r => setTimeout(r, 1500)); const p = window.__meter.peak; A.stopAll(); return p; });
  ok(bed > 0.003 && bed < 0.99, 'nền + nhạc + sfx cùng lúc trong chuỗi mới: có tiếng, không vỡ (đỉnh ' + bed.toFixed(3) + ')', bed);
  ok(!errs.length, 'không có pageerror / console.error trong cả phiên thử', errs);
  await bg.close();
} finally { await R.close(); }
console.log('   (tổng ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s)');
process.exit(fails ? 1 : 0);
