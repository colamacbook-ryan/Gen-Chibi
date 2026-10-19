// Kiểm thử âm thanh (engine/audio.js): từ vựng tiếng động · dựng offline từng tiếng · limiter khi chồng · clip giọng trong say().
// © 2026 Gen Labs — All rights reserved.
// Dùng: node tools/test-audio.mjs     (cần Playwright + Chromium; không có thì phần trình duyệt BỎ QUA có báo — đặt GC_REQUIRE_PLAYWRIGHT=1 để coi là lỗi)
// Không cần cổng mạng: trang thử được phục vụ bằng page.route. Chạy < 60 s.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { openRenderer, measure, loadPlaywright, wavMono16 } from './audio-render.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'engine/audio.js'), 'utf8');
let fails = 0;
const ok = (c, msg, extra) => { if (!c) fails++; console.log('   ' + (c ? '✓' : '✗') + ' ' + msg + (!c && extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const T0 = Date.now();

/* ------------------------------------------------ 1. từ vựng (Node thuần, luôn chạy) */
const A = (() => { const w = { GenChibi: {} }; vm.runInNewContext(SRC, { window: w, console }, { filename: 'engine/audio.js' }); return w.GenChibi.audio; })();
const { loadEngine } = require('../server/engine-node.js');
const GC = loadEngine(ROOT);
const NAMES = A.sfxNames, INFO = A.sfxInfo();
{
  const vocab = GC.choreo.MOTION.sfx;
  ok(vocab.every(n => NAMES.includes(n)), 'mọi tiếng trong từ vựng biên đạo (MOTION.sfx) đều có trong engine/audio.js', vocab.filter(n => !NAMES.includes(n)));
  ok(NAMES.length === 17 && NAMES.every(n => INFO[n].dur > 0 && INFO[n].level > 0), '17 tiếng, mỗi tiếng có dur + level hợp lệ', NAMES);
  ok(['unlock', 'setMuted', 'setVolume', 'sfx', 'ambient', 'music', 'voiceOf', 'say', 'decodeClip', 'setVoiceMode', 'hush', 'stopAll', 'info'].every(k => typeof A[k] === 'function'), 'API công khai đủ (sfx, say, decodeClip, …)');
  A.sfx('pop'); A.sfx('khong-co'); A.sfx(null);
  ok(true, 'sfx() trước unlock / tên lạ / null không ném lỗi');
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
const R = await openRenderer();
try {
  /* ---------------------------------- 2a. dựng offline từng tiếng (âm lượng 1, gain 1: tệ nhất) */
  const M = {};
  for (const n of NAMES) { const r = await R.render(SRC, n, { volume: 1, seed: 1, secs: 4.5 }); M[n] = { ...measure(r.l, r.r, r.sr), nodes: r.nodes }; }
  const bad = (f) => NAMES.filter(n => f(M[n], INFO[n], n));
  ok(!bad(m => m.nan).length, 'không NaN / Infinity trong mẫu nào', bad(m => m.nan));
  ok(!bad(m => m.clipped).length, 'không mẫu nào vỡ (≥ 0.9995)', bad(m => m.clipped));
  ok(!bad(m => m.peakDb > -0.3).length, 'đỉnh ≤ −0,3 dBFS sau limiter (âm lượng 1, gain 1)', bad(m => m.peakDb > -0.3).map(n => n + ' ' + M[n].peakDb));
  ok(!bad(m => m.peakDb < -40 || m.activeRmsDb < -45).length, 'không tiếng nào câm (đỉnh > −40 dBFS)', bad(m => m.peakDb < -40 || m.activeRmsDb < -45));
  ok(!bad(m => Math.abs(+m.dc) > 0.002).length, 'không lệch DC (|dc| < 0.002)', bad(m => Math.abs(+m.dc) > 0.002).map(n => n + ' ' + M[n].dc));
  ok(!bad((m, i) => m.dur60 > i.dur + 0.1 + 0.7).length, 'tắt hẳn (−60 dBFS) trong dur + 0.1 s + đuôi vang 0.7 s', bad((m, i) => m.dur60 > i.dur + 0.8).map(n => n + ' ' + M[n].dur60 + ' > ' + INFO[n].dur));
  ok(!bad((m, i) => m.dur60 < i.dur * 0.3).length, 'dur khai báo không phóng đại (tiếng kéo dài ≥ 30 % dur)', bad((m, i) => m.dur60 < i.dur * 0.3).map(n => n + ' ' + M[n].dur60 + ' < ' + INFO[n].dur));
  ok(!bad(m => m.nodes > 40).length, 'mỗi tiếng ≤ 40 node (ngân sách L-42)', bad(m => m.nodes > 40).map(n => n + ' ' + M[n].nodes));
  const spread = k => { const v = NAMES.map(n => M[n][k]); return +(Math.max(...v) - Math.min(...v)).toFixed(1); };
  ok(spread('activeRmsDb') <= 10, 'độ to đồng đều: RMS có cổng lệch ≤ 10 dB giữa 17 tiếng', spread('activeRmsDb'));
  ok(spread('lufs') <= 10, 'độ to đồng đều: LUFS xấp xỉ lệch ≤ 10 dB', spread('lufs'));
  ok(spread('activeRmsA') <= 13, 'độ to đồng đều ở loa nhỏ (A-trọng số) lệch ≤ 13 dB', spread('activeRmsA'));
  console.log('     (lệch RMS ' + spread('activeRmsDb') + ' dB · LUFS ' + spread('lufs') + ' dB · A ' + spread('activeRmsA') + ' dB · đỉnh cao nhất ' + Math.max(...NAMES.map(n => M[n].peakDb)) + ' dBFS · node nhiều nhất ' + Math.max(...NAMES.map(n => M[n].nodes)) + ')');

  // biến thiên mỗi lần phát: hai seed cho hai bản khác nhau nhưng cùng độ to (±3 dB)
  {
    const a = await R.render(SRC, 'hit', { volume: 1, seed: 11, secs: 2 }), b = await R.render(SRC, 'hit', { volume: 1, seed: 12, secs: 2 });
    let diff = 0; for (let i = 0; i < a.l.length; i++) diff += Math.abs(a.l[i] - b.l[i]);
    const ma = measure(a.l, a.r), mb = measure(b.l, b.r);
    ok(diff > 1 && Math.abs(ma.activeRmsDb - mb.activeRmsDb) <= 3, 'hai lần phát khác nhau (cao độ / lọc / độ to lệch nhẹ) nhưng cùng cỡ độ to', { rms: [ma.activeRmsDb, mb.activeRmsDb] });
    const c = await R.render(SRC, 'hit', { volume: 1, seed: 11, secs: 2 });
    let md = 0; for (let i = 0; i < a.l.length; i++) md = Math.max(md, Math.abs(a.l[i] - c.l[i]));
    ok(md < 1e-5, 'cùng seed → cùng mẫu (lệch ≤ 1e-5: chỉ là làm tròn float của Convolver; kết quả đo lặp lại được)', md);
  }
  // tuỳ chọn gain / pan
  {
    const full = measure(...(await R.render(SRC, { name: 'hit', opts: { gain: 1 } }, { volume: 1, seed: 3, secs: 2 }).then(r => [r.l, r.r])));
    const half = measure(...(await R.render(SRC, { name: 'hit', opts: { gain: 0.5 } }, { volume: 1, seed: 3, secs: 2 }).then(r => [r.l, r.r])));
    ok(half.activeRmsDb < full.activeRmsDb - 2.5, 'opts.gain = 0.5 hạ độ to ≥ 2,5 dB', [full.activeRmsDb, half.activeRmsDb]);
    const pl = await R.render(SRC, { name: 'pop', opts: { pan: -1 } }, { volume: 1, seed: 3, secs: 1 });
    const e = x => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return s; };
    ok(e(pl.l) > e(pl.r) * 8, 'opts.pan = −1 đẩy tiếng sang trái (≥ 9 dB)', [e(pl.l), e(pl.r)]);
    const wh = await R.render(SRC, 'whoosh', { volume: 1, seed: 3, secs: 1.5 }), half1 = Math.floor(wh.l.length * 0.12), n1 = Math.floor(wh.l.length * 0.45);
    let el = 0, er = 0, el2 = 0, er2 = 0; for (let i = 0; i < n1; i++) { if (i < half1 + 4000 && i > 2000) { el += wh.l[i] ** 2; er += wh.r[i] ** 2; } if (i > n1 - 12000) { el2 += wh.l[i] ** 2; er2 += wh.r[i] ** 2; } }
    ok(wh.l.length > 0 && M.whoosh.sideDb > -30, 'whoosh có bề rộng stereo (kênh bên ≥ −30 dB so với giữa)', M.whoosh.sideDb);
  }
  // tắt tiếng → im; hạn mức MAX_FX; nhiều tiếng chồng → limiter giữ ≤ −0,3 dBFS
  {
    const mu = await R.render(SRC, 'hit', { volume: 1, seed: 1, secs: 1, setup: '(A) => A.setMuted(true)' });
    ok(mu.nodes === 0, 'setMuted(true) → sfx() không dựng node nào', mu.nodes);
    const one = M.hit.nodes, many = await R.render(SRC, Array(40).fill('hit'), { volume: 1, seed: 1, secs: 1.5 });
    ok(many.nodes <= 12 * one, 'MAX_FX = 12: 40 lần hit cùng nhịp chỉ dựng ≤ 12 hiệu ứng (' + many.nodes + ' ≤ ' + 12 * one + ' node)', { many: many.nodes, one });
    const mix = ['hit', 'hit', 'hit', 'hit', 'sting', 'gong', 'whoosh', 'swish', 'boing', 'party', 'rumble', 'sparkle'];
    const st = await R.render(SRC, mix, { volume: 1, seed: 5, secs: 3 }), ms = measure(st.l, st.r);
    ok(ms.peakDb <= -0.3 && ms.clipped === 0 && !ms.nan, '12 tiếng chồng cùng lúc (gain 1, âm lượng 1) không vỡ: đỉnh ' + ms.peakDb + ' dBFS, 0 mẫu vỡ', ms);
    const stN = await R.render(SRC, Array(12).fill('sting'), { volume: 1, seed: 5, secs: 3 }), mn = measure(stN.l, stN.r);
    ok(mn.peakDb <= -0.3 && mn.clipped === 0, '12 × sting (tệ nhất) vẫn ≤ −0,3 dBFS', mn.peakDb);
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
  const files = { '/engine/core.js': fs.readFileSync(path.join(ROOT, 'engine/core.js')), '/engine/audio.js': fs.readFileSync(path.join(ROOT, 'engine/audio.js')) };
  const bg = await R.browser.newContext(), pg = await bg.newPage(), errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  // dòng "Failed to load resource … 404" là của Chromium khi test cố tình xin URL không có — không phải lỗi của engine
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.addInitScript(TAP);
  await pg.route('http://gc.test/**', r => {
    const u = new URL(r.request().url()).pathname;
    if (u === '/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><button id="b">go</button><script src="/engine/core.js"></script><script src="/engine/audio.js"></script>' });
    if (files[u]) return r.fulfill({ contentType: 'text/javascript', body: files[u] });
    if (u === '/clip.wav') return r.fulfill({ contentType: 'audio/wav', body: WAV });
    if (u === '/long.wav') return r.fulfill({ contentType: 'audio/wav', body: LONG });
    return r.fulfill({ status: 404, body: 'không có' });
  });
  await pg.goto('http://gc.test/');
  await pg.waitForFunction(() => window.GenChibi && window.GenChibi.audio);
  await pg.click('#b', { force: true }); await pg.evaluate(() => window.GenChibi.audio.unlock());
  await pg.waitForFunction(() => window.__ctx && window.__ctx.state === 'running', null, { timeout: 5000 });
  // rò rỉ: phát đủ 17 tiếng (chồng nhau, hạn mức 12 cắt bớt) rồi chờ tắt hết → mọi node dựng ra phải được ngắt (onended → free)
  const leak = await pg.evaluate(async (names) => {
    const A = window.GenChibi.audio, n = window.__nodes, sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(300); const m0 = n.made, d0 = n.disc;
    for (const nm of names) { A.sfx(nm); await sleep(60); }
    await sleep(4300);
    return { made: n.made - m0, disc: n.disc - d0 };
  }, NAMES);
  ok(leak.made > 100 && leak.disc >= leak.made, 'không rò node: ' + leak.made + ' node dựng cho 17 tiếng, ' + leak.disc + ' đã ngắt khi xong', leak);
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
