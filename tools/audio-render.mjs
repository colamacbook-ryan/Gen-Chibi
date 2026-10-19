// Khung dựng âm thanh offline cho engine/audio.js — dùng chung cho tools/audio-lab.mjs (nghe bằng máy) và tools/test-audio.mjs (kiểm thử).
// © 2026 Gen Labs — All rights reserved.
//
// Cách làm: nạp NGUYÊN VĂN mã engine/audio.js (bản hiện tại hoặc bản cũ để so sánh) vào trang Chromium không đầu, thay
// window.AudioContext bằng một OfflineAudioContext giả vờ "running" (engine không cần sửa gì), gọi GC.audio.unlock() + sfx(name)
// rồi startRendering(). Mỗi lần dựng nạp lại engine từ đầu (trạng thái sạch, MAX_FX về 0) và gieo Math.random theo seed → lặp lại được.
// Trả về PCM float32 hai kênh + số node đã tạo. Chỉ số khách quan (đỉnh, RMS, LUFS xấp xỉ, trọng tâm phổ, ...) tính ở phía Node.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export function loadPlaywright() {
  try { return require('playwright'); } catch { /* không cài cục bộ */ }
  try { return require('/opt/node22/lib/node_modules/playwright'); } catch { return null; }
}

export const SR = 48000;

/* ------------------------------------------------------------------ trang dựng */
const HARNESS = `(() => {
  const SRATE = ${SR};
  const L = window.__lab = { secs: 4, ctx: null, counts: null, counting: false };
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // đếm node tạo ra qua mọi create*() (trừ buffer / periodic wave)
  for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!/^create/.test(k) || k === 'createBuffer' || k === 'createPeriodicWave') continue;
    const orig = BaseAudioContext.prototype[k];
    BaseAudioContext.prototype[k] = function () { if (L.counting) L.counts[k] = (L.counts[k] || 0) + 1; return orig.apply(this, arguments); };
  }
  class FakeCtx extends OfflineAudioContext {
    constructor() { super(2, Math.ceil(L.secs * SRATE), SRATE); L.ctx = this; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
  }
  function b64(f32) {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  // calls: [{ name, opts }] — tất cả phát lúc 0 (đúng như gọi sfx() cùng một nhịp)
  L.render = async (src, calls, o) => {
    L.secs = o.secs || 4;
    const realRandom = Math.random; Math.random = mulberry(o.seed == null ? 1 : o.seed);
    try {
      window.AudioContext = FakeCtx; window.webkitAudioContext = undefined;
      window.GenChibi = {}; (0, eval)(src);
      const A = window.GenChibi.audio;
      A.unlock();
      if (!L.ctx) throw new Error('engine không tạo AudioContext');
      if (o.volume != null) A.setVolume(o.volume);
      if (o.setup) (0, eval)('(' + o.setup + ')')(A, L.ctx);
      const t0 = L.ctx.currentTime;
      L.counts = {}; L.counting = true;
      for (const c of calls) A.sfx(c.name, c.opts);
      L.counting = false;
      const nodes = Object.values(L.counts).reduce((a, b) => a + b, 0), kinds = L.counts;
      const buf = await L.ctx.startRendering();
      return { sr: buf.sampleRate, l: b64(buf.getChannelData(0)), r: b64(buf.getChannelData(1)), nodes, kinds, t0 };
    } finally { Math.random = realRandom; }
  };
})()`;

export async function openRenderer() {
  const pw = loadPlaywright();
  if (!pw) throw new Error('không có Playwright');
  const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.evaluate(HARNESS);
  return {
    page, browser,
    // src: mã nguồn engine/audio.js · calls: tên (chuỗi) hoặc { name, opts } hoặc mảng các thứ đó
    async render(src, calls, o = {}) {
      calls = [].concat(calls).map(c => typeof c === 'string' ? { name: c } : c);
      const r = await page.evaluate(([s, c, op]) => window.__lab.render(s, c, op), [src, calls, o]);
      const f32 = x => { const b = Buffer.from(x, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); };
      return { sr: r.sr, l: f32(r.l), r: f32(r.r), nodes: r.nodes, kinds: r.kinds };
    },
    close: () => browser.close(),
  };
}

/* --------------------------------------------------------------------- chỉ số */
const db = x => x > 1e-12 ? 20 * Math.log10(x) : -240;
function biquad(x, b, a) {
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function fft(re, im) {                   // radix-2 tại chỗ
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// l, r: Float32Array · trả về: peakDb, rmsDb (cả tệp), activeRmsDb (các khối 10 ms trong 30 dB đỉnh), lufs (BS.1770 xấp xỉ, khối 100 ms),
// activeRmsA (activeRms + độ lệch A-trọng số), dur60 (s, tới khối 10 ms cuối cùng > −60 dBFS), centroid (Hz), bands (% công suất: sub/thấp/giữa/cao/khí), clipped (mẫu ≥ 0.9995), dc, nan, attackMs, crestDb, sideDb
export function measure(l, r, sr = SR) {
  const n = l.length;
  let peak = 0, sumSq = 0, nan = 0, clipped = 0, sl = 0, sr_ = 0, side = 0, mid = 0;
  for (let i = 0; i < n; i++) {
    const a = l[i], b = r[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; }
    const pa = Math.abs(a), pb = Math.abs(b);
    if (pa > peak) peak = pa; if (pb > peak) peak = pb;
    if (pa >= 0.9995 || pb >= 0.9995) clipped++;
    sumSq += (a * a + b * b) / 2; sl += a; sr_ += b;
    side += ((a - b) / 2) ** 2; mid += ((a + b) / 2) ** 2;
  }
  const blk = Math.round(sr * 0.01), nb = Math.floor(n / blk), br = new Float64Array(nb);
  let bmax = 0;
  for (let k = 0; k < nb; k++) {
    let s = 0; for (let i = k * blk; i < (k + 1) * blk; i++) s += (l[i] * l[i] + r[i] * r[i]) / 2;
    br[k] = Math.sqrt(s / blk); if (br[k] > bmax) bmax = br[k];
  }
  let act = 0, an = 0, last60 = -1, first = -1, lastAct = -1;
  const thr = bmax * Math.pow(10, -30 / 20), thr40 = bmax * Math.pow(10, -40 / 20);
  for (let k = 0; k < nb; k++) {
    if (br[k] >= thr) { act += br[k] * br[k]; an++; }
    if (br[k] > 1e-3) last60 = k;                       // −60 dBFS
    if (br[k] >= thr40) { if (first < 0) first = k; lastAct = k; }
  }
  // LUFS xấp xỉ: K-weighting 48 kHz của BS.1770, khối 100 ms bước 50 ms (ngắn hơn chuẩn 400 ms để công bằng với tiếng ngắn)
  const kw = x => biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
  const kl = kw(l), kr = kw(r), B = Math.round(sr * 0.1), H = B / 2, loud = [];
  for (let s = 0; s + B <= n; s += H) {
    let e = 0; for (let i = s; i < s + B; i++) e += kl[i] * kl[i] + kr[i] * kr[i];
    loud.push(e / B);
  }
  const lk = e => -0.691 + 10 * Math.log10(Math.max(e, 1e-12));
  const g1 = loud.filter(e => lk(e) > -70);
  let lufs = -240;
  if (g1.length) { const rel = lk(g1.reduce((a, b) => a + b, 0) / g1.length) - 10, g2 = g1.filter(e => lk(e) > rel); if (g2.length) lufs = lk(g2.reduce((a, b) => a + b, 0) / g2.length); }
  // trọng tâm phổ trên đoạn có tiếng (khung 2048, Hann, bước 1024; trung bình công suất)
  const N = 2048, win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const P = new Float64Array(N / 2); let frames = 0;
  if (first >= 0) {
    const s0 = first * blk, s1 = Math.min(n, (lastAct + 1) * blk);
    for (let s = s0; s < Math.max(s1, s0 + 1); s += N / 2) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) { const j = s + i; re[i] = j < n ? (l[j] + r[j]) / 2 * win[i] : 0; }
      fft(re, im); for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k]; frames++;
    }
  }
  let num = 0, den = 0; for (let k = 2; k < N / 2; k++) { const fr = k * sr / N; num += fr * P[k]; den += P[k]; }
  // cân bằng phổ: phần trăm công suất trong 5 dải (sub <120 · thấp 120–400 · giữa 0.4–2k · cao 2–6k · khí >6k Hz)
  const edges = [0, 120, 400, 2000, 6000, 1e9], bandP = [0, 0, 0, 0, 0];
  for (let k = 1; k < N / 2; k++) { const fr = k * sr / N; for (let b = 0; b < 5; b++) if (fr >= edges[b] && fr < edges[b + 1]) { bandP[b] += P[k]; break; } }
  const bandSum = bandP.reduce((x, y) => x + y, 0) || 1;
  // A-trọng số từ phổ trung bình: loa laptop / điện thoại gần như không phát < 150 Hz → RMS "nghe được" = RMS + độ lệch A
  let pw = 0, pt = 0;
  for (let k = 2; k < N / 2; k++) { const f2 = (k * sr / N) ** 2, A = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)) / 0.7943; pw += P[k] * A * A; pt += P[k]; }
  const aOff = 10 * Math.log10((pw + 1e-30) / (pt + 1e-30));
  let a10 = -1, a90 = -1;
  for (let i = 0; i < n; i++) { const v = Math.max(Math.abs(l[i]), Math.abs(r[i])); if (a10 < 0 && v >= peak * 0.01) a10 = i; if (v >= peak * 0.9) { a90 = i; break; } }
  const rms = Math.sqrt(sumSq / n);
  return {
    peakDb: +db(peak).toFixed(2), rmsDb: +db(rms).toFixed(2), activeRmsDb: +db(an ? Math.sqrt(act / an) : 0).toFixed(2), lufs: +lufs.toFixed(2),
    dur60: +((last60 + 1) * 0.01).toFixed(2), centroid: Math.round(den ? num / den : 0), clipped, dc: +(Math.abs(sl + sr_) / 2 / n).toExponential(2),
    activeRmsA: +(db(an ? Math.sqrt(act / an) : 0) + aOff).toFixed(2), bands: bandP.map(x => Math.round(x / bandSum * 100)), nan, attackMs: a10 >= 0 ? +((a90 - a10) / sr * 1000).toFixed(1) : 0, crestDb: +(db(peak) - db(rms)).toFixed(1), sideDb: +(10 * Math.log10((side + 1e-12) / (mid + 1e-12))).toFixed(1),
  };
}

/* ------------------------------------------------------------------------ WAV */
// 16-bit PCM stereo. trimSec: cắt đuôi (giữ phần đầu tới trimSec); trả về Buffer
export function wavBytes(l, r, sr = SR, trimSec = null) {
  const n = trimSec == null ? l.length : Math.min(l.length, Math.round(trimSec * sr)), buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const q = x => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) { buf.writeInt16LE(q(l[i]), 44 + i * 4); buf.writeInt16LE(q(r[i]), 46 + i * 4); }
  return buf;
}
// WAV mono 16-bit (cho clip giọng thử trong test)
export function wavMono16(samples, sr) {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}
