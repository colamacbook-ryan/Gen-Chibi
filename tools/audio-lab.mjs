#!/usr/bin/env node
// Phòng thí nghiệm âm thanh — "tai máy" cho thư viện âm (engine/sounds.js + engine/audio.js). © 2026 Gen Labs — All rights reserved.
//
// Dựng từng hiệu ứng (bản mới — mọi âm của bộ chuẩn gen.am + gói kinds/sound/*.json; bản cũ nếu có --old: tệp audio.js tự chứa của
// v0.17, chỉ 17 tên cũ) qua OfflineAudioContext trong Chromium không đầu (tools/audio-render.mjs), ghi WAV 16-bit + chỉ số khách quan;
// hiệu chuẩn độ to (--write sửa `level` của từng âm: dòng đầu của âm trong engine/sounds.js, hoặc trong tệp gói JSON); nhờ Gemini nghe và chấm theo
// một thang cố định (kết quả đệm theo SHA-1 của WAV — nghe lại cùng âm thanh không tốn thêm lượt gọi); sinh trang A/B tự chứa
// (WAV nhúng base64 + nút phát + nhận xét giám khảo) để người nghe thật so cũ / mới.
//
//   node tools/audio-lab.mjs render    [--old FILE] [--out DIR] [--only a,b] [--seed N]       (--only nhận cả tên âm của gói kinds/sound/*.json)
//   node tools/audio-lab.mjs calibrate [--target -20] [--cap -2.5] [--write]       hiệu chuẩn `level` theo trung bình (RMS có cổng, RMS A-trọng số, LUFS) và trần đỉnh
//   node tools/audio-lab.mjs ab        [--only a,b] [--model m1,m2]                 Gemini so cũ với mới trong MỘT yêu cầu (thứ tự A/B ngẫu nhiên theo tên + model)
//   node tools/audio-lab.mjs judge     [--set new|old] [--only a,b] [--model m]     Gemini chấm một clip riêng: giống ý định? chất lượng? lỗi?
//   node tools/audio-lab.mjs verdict                                                gộp kết quả `ab` của các model → đa số + chỗ bất đồng
//   node tools/audio-lab.mjs page      [--file OUT.html]                            trang nghe thử cho Ryan
//
// Giám khảo máy KHÔNG đáng tin ở chi tiết tai nghe (cùng một clip giọng bị 6 model tả thành 6 kiểu người khác nhau): ưu tiên so cặp A/B có
// ý định, đảo thứ tự theo tên + model, kết luận = đa số 2 model, và chỉ số khách quan (đỉnh, độ to đồng đều, thời gian tắt, phổ) nặng ngang giám khảo.
// Tài khoản miễn phí hạn mức nhỏ: mặc định gemini-3.1-flash-lite + gemini-3.5-flash-lite, tối đa --max-calls 60 lượt thành công (đếm trong
// judge-log.jsonl), gặp 429 thì đọc retryDelay và lùi; hết hạn mức NGÀY thì dừng, không chờ. Mỗi lần chỉ 1 yêu cầu bay.
// Khoá Gemini: --key-file DUONG_DAN hoặc biến môi trường GEMINI_API_KEY_FILE / GEMINI_API_KEY. Không bao giờ in ra, không ghi vào repo,
// không đưa vào argv (chỉ đường dẫn tệp khoá nằm trong argv). Cần proxy môi trường: tự chạy lại với NODE_USE_ENV_PROXY=1.
// Mặc định thư mục ra: $GC_AUDIO_LAB hoặc ./audio-lab-out (ngoài repo thì truyền --out).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { openRenderer, measure, wavBytes } from './audio-render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), cmd = argv[0];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const OUT = path.resolve(opt('out', process.env.GC_AUDIO_LAB || 'audio-lab-out'));
const AUDIO_JS = path.join(ROOT, 'engine/audio.js'), SOUNDS_JS = path.join(ROOT, 'engine/sounds.js'), PACK_DIR = path.join(ROOT, 'kinds/sound');
// thư viện: bộ chuẩn (dữ liệu trong engine/sounds.js) + mọi gói JSON ở kinds/sound/ — mã nguồn dựng = sounds.js + audio.js
const LIB = (() => {
  const S = createRequire(import.meta.url)(SOUNDS_JS), packs = {};
  for (const f of fs.existsSync(PACK_DIR) ? fs.readdirSync(PACK_DIR).filter(x => x.endsWith('.json')) : []) {
    const file = path.join(PACK_DIR, f), p = JSON.parse(fs.readFileSync(file, 'utf8')), r = S.registerPack(p);
    if (r.errors.length) throw new Error(f + ': ' + r.errors.slice(0, 3).join('; '));
    packs[p.id] = { file, json: JSON.stringify(p), names: Object.keys(p.sounds) };
  }
  return { S, packs };
})();
const LEGACY = LIB.S.LEGACY;                                                  // 17 tên cũ — bản cũ (--old) chỉ có chừng này
const NAMES = LIB.S.names();
const newSrc = () => fs.readFileSync(SOUNDS_JS, 'utf8') + '\n' + fs.readFileSync(AUDIO_JS, 'utf8');
// nạp các gói JSON vào trang dựng trước khi phát (setup của audio-render)
const PACK_SETUP = '(A) => { const S = window.GenChibi.sounds; [' + Object.values(LIB.packs).map(p => p.json).join(',') + '].forEach(p => { const r = S.registerPack(p); if (r.errors.length) throw new Error(r.errors[0]); }); }';
const ONLY = String(opt('only', '')).split(',').filter(Boolean);
const names = ONLY.length ? NAMES.filter(n => ONLY.includes(n)) : NAMES;
const COMBAT = ['hit', 'swish', 'whoosh', 'rumble', 'sting', 'gong'];       // 6 tiếng dùng nhiều nhất trong màn đấu → so cũ / mới
const MODELS = String(opt('model', process.env.GC_JUDGE_MODEL || 'gemini-3.1-flash-lite')).split(',').filter(Boolean);
const MAX_CALLS = +opt('max-calls', 60);
const INTENT = {
  pop: 'a short cartoon bubble pop / UI blip — a small bubble bursting (about 0.15 s)',
  whoosh: 'a big fast whoosh — something large flying past the listener, left to right',
  step: 'a single soft footstep of a small cartoon character on a floor (heel then toe)',
  sting: 'a comic dramatic orchestral sting — a "dun-DUN!" shock / surprise stab',
  hit: 'a cartoon punch / slap impact — a comedic "bonk / whack", weighty but not gory',
  boing: 'a cartoon spring "boing" — rubbery bounce with a wobbling pitch',
  sparkle: 'a magical sparkle — a quick glittering upward twinkle of small bells',
  rumble: 'a low rumbling earthquake / rock tremor with a few pebbles falling',
  drip: 'a water drip — one droplet "plink" followed by a smaller, lower echoing droplet',
  sad: 'the classic "sad trombone" wah-wah-wah-waaah, descending (failure / disappointment)',
  snore: 'a cartoon snore — rattling inhale then a breathy exhale (a sleeping character)',
  party: 'a party popper / confetti pop followed by a bright celebratory twinkle',
  hmm: 'a thoughtful "hmm?" — a two-note questioning hum with a rising second note',
  gong: 'a big resonant gong / tam-tam strike with a long shimmering decay',
  chime: 'a bright bell chime — two quick "ting-ting" notes like a shop or door bell',
  swish: 'a fast sword / blade swish — a thin, high whoosh slicing through the air',
  tick: 'a clock tick / wood-block click — very short and crisp',
};

/* ----------------------------------------------------------------- hạ tầng */
const pad = (s, n) => String(s).padEnd(n);
const sha = b => crypto.createHash('sha1').update(b).digest('hex');
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1));
const dir = (...p) => { const d = path.join(OUT, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const oldSrcFile = opt('old', null);
const seed = +opt('seed', 1);

async function renderSet(R, src, set, list, volume = 1) {
  const res = {};
  for (const n of list) {
    const r = await R.render(src, n, { volume, seed, secs: 4.5, setup: set === 'new' ? PACK_SETUP : undefined });
    const m = measure(r.l, r.r, r.sr);
    const wav = wavBytes(r.l, r.r, r.sr, Math.max(0.25, m.dur60 + 0.12));       // cắt đuôi im lặng
    fs.writeFileSync(path.join(dir(set), n + '.wav'), wav);
    res[n] = { ...m, nodes: r.nodes, bytes: wav.length, sha: sha(wav) };
  }
  return res;
}
function table(label, M) {
  console.log('--- ' + label);
  console.log(pad('name', 8), 'peak   rms    active actA  lufs   dur60 cent  clip att   crest side  nodes bands% sub/low/mid/high/air');
  for (const n of Object.keys(M)) {
    const m = M[n];
    console.log(pad(n, 8), pad(m.peakDb, 6), pad(m.rmsDb, 6), pad(m.activeRmsDb, 6), pad(m.activeRmsA, 6), pad(m.lufs, 6), pad(m.dur60, 5), pad(m.centroid, 5), pad(m.clipped, 4), pad(m.attackMs, 5), pad(m.crestDb, 5), pad(m.sideDb, 5), pad(m.nodes, 5), m.bands.join('/'), m.nan ? 'NaN!' : '');
  }
  const sp = k => { const v = Object.values(M).map(m => m[k]); return (Math.max(...v) - Math.min(...v)).toFixed(1); };
  console.log('    spread: activeRms ' + sp('activeRmsDb') + ' dB · A-weighted ' + sp('activeRmsA') + ' dB · lufs ' + sp('lufs') + ' dB');
}

/* ------------------------------------------------------------------ render */
async function cmdRender() {
  const R = await openRenderer();
  try {
    const metrics = readJSON(path.join(OUT, 'metrics.json'), {});
    metrics.new = { ...(metrics.new || {}), ...await renderSet(R, newSrc(), 'new', names) };
    table('NEW', metrics.new);
    if (oldSrcFile) {
      metrics.old = { ...(metrics.old || {}), ...await renderSet(R, fs.readFileSync(oldSrcFile, 'utf8'), 'old', names.filter(n => LEGACY.includes(n))) };
      table('OLD', metrics.old);
    }
    // bản cũ khớp độ to: so công bằng (tiếng to hơn luôn "nghe hay hơn"). Cùng thước đo với hiệu chuẩn; không đẩy đỉnh quá −1 dBFS.
    if (metrics.old) for (const n of names) {
      const o = metrics.old[n], w = metrics.new[n]; if (!o || !w) continue;
      const L = m => (m.activeRmsDb + m.activeRmsA + m.lufs) / 3, g = Math.min(Math.pow(10, (L(w) - L(o)) / 20), Math.pow(10, (-1 - o.peakDb) / 20));
      const buf = fs.readFileSync(path.join(OUT, 'old', n + '.wav'));
      for (let i = 44; i + 1 < buf.length; i += 2) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf.readInt16LE(i) * g))), i);
      fs.writeFileSync(path.join(dir('old-matched'), n + '.wav'), buf);
      o.matchGainDb = +(20 * Math.log10(g)).toFixed(1);
    }
    writeJSON(path.join(OUT, 'metrics.json'), metrics);
    console.log('WAV + metrics.json → ' + OUT);
  } finally { await R.close(); }
}

/* --------------------------------------------------------------- calibrate */
// `level` của một âm nằm ở dòng đầu của âm: engine/sounds.js (bộ chuẩn: `  'ten': { label: …, level: 1.2,`) hoặc tệp gói JSON (`"ten": { … "level": 1.2`)
const reEsc = s => s.replace(/[-]/g, '\\-');
const levelRe = (n, json) => json ? new RegExp('("' + reEsc(n) + '": \\{[\\s\\S]*?"level": )([0-9.]+)') : new RegExp("(\\n      '?" + reEsc(n) + "'?: \\{[^\\n]*?level: )([0-9.]+)");
async function cmdCalibrate() {
  const target = +opt('target', -20), cap = +opt('cap', -2.5), write = !!opt('write', false);
  const owner = n => Object.keys(LIB.packs).find(id => LIB.packs[id].names.includes(n)) || null;
  const text = { sounds: fs.readFileSync(SOUNDS_JS, 'utf8') };
  for (const id of Object.keys(LIB.packs)) text[id] = fs.readFileSync(LIB.packs[id].file, 'utf8');
  const where = n => owner(n) || 'sounds', getLevel = n => +levelRe(n, owner(n)).exec(text[where(n)])[2];
  const setLevel = (n, v) => { text[where(n)] = text[where(n)].replace(levelRe(n, owner(n)), '$1' + v); };
  const list = names;
  const R = await openRenderer();
  try {
    for (let it = 1; it <= 8; it++) {
      let worst = 0; const M = {}; const next = {};
      // gói JSON đọc lại từ chữ đang sửa (level mới) mỗi vòng
      const setup = '(A) => { const S = window.GenChibi.sounds; [' + Object.keys(LIB.packs).map(id => text[id]).join(',') + '].forEach(p => S.registerPack(p)); }';
      const src = text.sounds + '\n' + fs.readFileSync(AUDIO_JS, 'utf8');
      for (const n of list) {
        const r = await R.render(src, n, { volume: 1, seed, secs: 4.5, setup }), m = measure(r.l, r.r, r.sr); M[n] = m;
        const cur = getLevel(n);
        // đỉnh sau limiter ≥ −2 dBFS nghĩa là limiter đang làm việc → đỉnh thật cao hơn đo được: hạ thêm
        const peakAdj = m.peakDb > -2 ? m.peakDb + 4 : m.peakDb;
        const loud = (m.activeRmsDb + m.activeRmsA + m.lufs) / 3;    // RMS có cổng · RMS có cổng A-trọng số (loa nhỏ) · LUFS xấp xỉ: cân cả tiếng ngắn / dài, trầm / sáng
        const scale = Math.min(Math.pow(10, (target - loud) / 20), Math.pow(10, (cap - peakAdj) / 20));
        worst = Math.max(worst, Math.abs(20 * Math.log10(scale)));
        next[n] = Math.max(0.05, Math.min(2, +(cur * Math.pow(scale, 0.85)).toFixed(2)));    // 0.05…2 = khoảng cổng kiểm cho phép
      }
      console.log('vòng ' + it + ': lệch lớn nhất ' + worst.toFixed(1) + ' dB');
      table('vòng ' + it, M);
      if (worst < 0.6) break;
      for (const n of list) setLevel(n, next[n]);
    }
    console.log('level đề xuất: ' + list.map(n => n + '=' + getLevel(n)).join(' '));
    if (write) {
      fs.writeFileSync(SOUNDS_JS, text.sounds);
      for (const id of Object.keys(LIB.packs)) fs.writeFileSync(LIB.packs[id].file, text[id]);
      console.log('đã ghi level vào engine/sounds.js + ' + Object.keys(LIB.packs).map(id => path.relative(ROOT, LIB.packs[id].file)).join(', '));
    }
  } finally { await R.close(); }
}

/* --------------------------------------------------------------------- Gemini */
function apiKey() {
  const f = opt('key-file', process.env.GEMINI_API_KEY_FILE);
  if (f && f !== true) return fs.readFileSync(f, 'utf8').trim();
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  throw new Error('thiếu khoá Gemini: --key-file DUONG_DAN | GEMINI_API_KEY_FILE | GEMINI_API_KEY');
}
function ensureProxyEnv() {
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    const r = spawnSync(process.execPath, process.argv.slice(1), { env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' }, stdio: 'inherit' });
    process.exit(r.status == null ? 1 : r.status);
  }
}
const CACHE_F = () => path.join(OUT, 'judge-cache.json'), LOG_F = () => path.join(OUT, 'judge-log.jsonl');
const callsSoFar = () => { try { return fs.readFileSync(LOG_F(), 'utf8').split('\n').filter(l => l && JSON.parse(l).ok).length; } catch { return 0; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// một yêu cầu generateContent; 429 → đọc retryDelay (tối đa 3 lần, không chờ quá 90 s); hạn mức NGÀY → ném QuotaExhausted
async function gemini(model, parts, schema, meta) {
  const key = apiKey();
  if (callsSoFar() >= MAX_CALLS) throw new Error('đã đủ ' + MAX_CALLS + ' lượt gọi giám khảo (--max-calls)');
  const body = { contents: [{ parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema } };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const t0 = Date.now();
    let status = 0, text = '', ok = false, wait = 0, daily = false;
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      status = r.status; text = await r.text();
      if (r.ok) {
        const j = JSON.parse(text), t = (j.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join('');
        const out = JSON.parse(t); ok = true;
        fs.appendFileSync(LOG_F(), JSON.stringify({ ts: new Date().toISOString(), model, ...meta, attempt, status, ms: Date.now() - t0, ok }) + '\n');
        return out;
      }
      if (status === 429) {
        try {
          const e = JSON.parse(text).error, det = e.details || [];
          const ri = det.find(d => /RetryInfo/.test(d['@type'] || ''));
          if (ri && ri.retryDelay) wait = Math.ceil(parseFloat(ri.retryDelay) * 1000) + 1000;
          daily = det.some(d => (d.violations || []).some(v => /PerDay/i.test(v.quotaId || '')));
        } catch { /* thân lỗi không phải JSON chuẩn */ }
      }
    } catch (e) { text = String(e.message || e).slice(0, 200); }
    fs.appendFileSync(LOG_F(), JSON.stringify({ ts: new Date().toISOString(), model, ...meta, attempt, status, ms: Date.now() - t0, ok, err: text.slice(0, 160) }) + '\n');
    if (status === 429 && daily) throw new Error('QuotaExhausted: ' + model + ' hết hạn mức ngày');
    if (status && status !== 429 && status < 500) throw new Error('Gemini ' + status + ' (' + model + '): ' + text.slice(0, 200));
    if (wait > 90000) throw new Error('QuotaExhausted: ' + model + ' đòi chờ ' + Math.round(wait / 1000) + ' s');
    await sleep(wait || 2000 * attempt);
  }
  throw new Error('Gemini: hết lượt thử cho ' + model + ' ' + JSON.stringify(meta));
}
const SCORE = { type: 'object', properties: {
  heard: { type: 'string' }, match: { type: 'integer' }, quality: { type: 'integer' }, artifacts: { type: 'array', items: { type: 'string' } }, improve: { type: 'string' } },
  required: ['heard', 'match', 'quality', 'artifacts', 'improve'] };
const RUBRIC_V = 'r2';
// âm mới (không có trong INTENT) — mô tả ý định bằng nhãn + "dùng khi" của thư viện (tiếng Việt; model đọc được)
const intentOf = n => INTENT[n] || (LIB.S.get(n) ? 'a cartoon sound effect: ' + LIB.S.get(n).label + ' — ' + LIB.S.get(n).use : n);
function rubric(name) {
  return 'You are a strict audio QA judge for a cartoon-comedy 2D game (think polished casual-game SFX, not a synthesizer demo). Listen to the clip.\n' +
    'Intended sound: ' + intentOf(name) + '.\n' +
    'Answer in JSON with: heard (one sentence: what does it actually sound like?), match (integer 1-10: how well it matches the intended sound), ' +
    'quality (integer 1-10: cartoon game SFX production standard — punch, clarity, character, polish; a plain beep or toy-like tone is low), ' +
    'artifacts (array of short strings: clicks, harshness, muddiness, thinness, too long, too short, beepy, robotic... [] if none), ' +
    'improve (max 25 words: the single most valuable change).';
}
async function judgeOne(model, set, n) {
  const f = path.join(OUT, set, n + '.wav'), wav = fs.readFileSync(f), key = model + ':' + sha(wav) + ':' + RUBRIC_V + ':' + n;
  const cache = readJSON(CACHE_F(), {});
  if (cache[key]) return { ...cache[key], cached: true };
  const r = await gemini(model, [{ text: rubric(n) }, { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }], SCORE, { kind: 'score', set, name: n, sha: sha(wav).slice(0, 8) });
  const c2 = readJSON(CACHE_F(), {}); c2[key] = r; writeJSON(CACHE_F(), c2);
  return r;
}
async function cmdJudge() {
  ensureProxyEnv();
  const set = opt('set', 'new'), res = readJSON(path.join(OUT, 'judge.json'), {}), model = MODELS[0], tag = set + ':' + model;
  res[tag] = res[tag] || {};
  let calls = 0;
  for (const n of names) {
    if (!fs.existsSync(path.join(OUT, set, n + '.wav'))) { console.log(pad(n, 8), '(chưa có WAV)'); continue; }
    const r = await judgeOne(model, set, n); if (!r.cached) calls++;
    res[tag][n] = r; writeJSON(path.join(OUT, 'judge.json'), res);
    console.log(pad(n, 8), 'match', pad(r.match, 3), 'quality', pad(r.quality, 3), r.cached ? '(đệm)' : '     ', '|', r.heard.slice(0, 90), '| lỗi:', r.artifacts.join(', ').slice(0, 70), '| sửa:', r.improve.slice(0, 110));
  }
  console.log('lượt gọi mới: ' + calls + ' · tổng đã dùng: ' + callsSoFar() + '/' + MAX_CALLS);
}
const AB = { type: 'object', properties: {
  a_heard: { type: 'string' }, b_heard: { type: 'string' }, a_match: { type: 'integer' }, b_match: { type: 'integer' }, a_quality: { type: 'integer' }, b_quality: { type: 'integer' },
  a_artifacts: { type: 'array', items: { type: 'string' } }, b_artifacts: { type: 'array', items: { type: 'string' } },
  winner: { type: 'string', enum: ['A', 'B', 'tie'] }, reason: { type: 'string' } },
  required: ['a_heard', 'b_heard', 'a_match', 'b_match', 'a_quality', 'b_quality', 'a_artifacts', 'b_artifacts', 'winner', 'reason'] };
// so cặp cũ / mới (mặc định 6 tiếng đấu; --only chọn khác; --all cả 17). Đệm theo (model, sha cũ, sha mới): không đổi WAV thì không gọi lại.
async function cmdAB() {
  ensureProxyEnv();
  const res = readJSON(path.join(OUT, 'ab.json'), {}); let calls = 0;
  const list = ONLY.length ? names.filter(n => LEGACY.includes(n)) : opt('all', false) ? LEGACY : COMBAT, flip = !!opt('flip', false), newIn = opt('new-in', null);   // --flip: đảo thứ tự A/B · --new-in A|B: ép bản mới vào vị trí (giám khảo thiên về A: mới thắng ở B là bằng chứng mạnh); lưu như "phiếu" riêng
  for (const model0 of MODELS) {
    const model = newIn ? model0 + '/newIn' + newIn : flip ? model0 + '/flip' : model0;
    res[model] = res[model] || {};
    for (const n of list) {
      const fo = path.join(OUT, 'old-matched', n + '.wav'), fn = path.join(OUT, 'new', n + '.wav');   // cũ đã khớp độ to
      if (!fs.existsSync(fo) || !fs.existsSync(fn)) { console.log(pad(n, 8), '(thiếu WAV cũ hoặc mới)'); continue; }
      const wo = fs.readFileSync(fo), wn = fs.readFileSync(fn), key = sha(wo).slice(0, 10) + sha(wn).slice(0, 10) + ':' + RUBRIC_V;
      if (res[model][n] && res[model][n].key === key) { console.log(pad(model.slice(7), 18), pad(n, 8), 'đệm:', res[model][n].verdict); continue; }
      const newIsA = newIn ? newIn === 'A' : (parseInt(sha(n + model0).slice(0, 2), 16) % 2 === 0) !== flip, A = newIsA ? wn : wo, B = newIsA ? wo : wn;   // đảo vị trí theo tên + model: triệt thiên lệch "A trước"
      let r;
      try {
        r = await gemini(model0, [
          { text: 'You are a strict audio QA judge for a cartoon-comedy 2D game. Two clips of the SAME intended sound follow. Intended sound: ' + INTENT[n] +
            '.\nFor each clip give: heard (one sentence), match (1-10: matches the intended sound), quality (1-10: cartoon game SFX standard — punch, clarity, character, polish; toy-like beeps are low), artifacts (array of short strings: clicks, harshness, muddiness, thin, too long, too short, beepy... or []). ' +
            'Then winner ("A" | "B" | "tie") = which is the better cartoon-game SFX for the intended sound, and reason (max 40 words).\nClip A:' },
          { inlineData: { mimeType: 'audio/wav', data: A.toString('base64') } }, { text: 'Clip B:' }, { inlineData: { mimeType: 'audio/wav', data: B.toString('base64') } }], AB, { kind: 'ab', name: n });
      } catch (e) { console.log(pad(model.slice(7), 18), pad(n, 8), 'LỖI:', e.message); if (/QuotaExhausted|đủ \d+ lượt/.test(e.message)) break; continue; }
      calls++;
      const pick = (a, b) => newIsA ? a : b, other = (a, b) => newIsA ? b : a;
      const verdict = r.winner === 'tie' ? 'tie' : ((r.winner === 'A') === newIsA ? 'new' : 'old');
      res[model][n] = { key, newIs: newIsA ? 'A' : 'B', verdict, reason: r.reason,
        new: { heard: pick(r.a_heard, r.b_heard), match: pick(r.a_match, r.b_match), quality: pick(r.a_quality, r.b_quality), artifacts: pick(r.a_artifacts, r.b_artifacts) },
        old: { heard: other(r.a_heard, r.b_heard), match: other(r.a_match, r.b_match), quality: other(r.a_quality, r.b_quality), artifacts: other(r.a_artifacts, r.b_artifacts) } };
      writeJSON(path.join(OUT, 'ab.json'), res);
      const x = res[model][n];
      console.log(pad(model.slice(7), 18), pad(n, 8), 'thắng:', pad(verdict, 4), '| mới đúng-ý', x.new.match, 'chất', x.new.quality, '| cũ đúng-ý', x.old.match, 'chất', x.old.quality, '| mới nghe như: ' + x.new.heard.slice(0, 70), '| lỗi mới: ' + x.new.artifacts.join(', ').slice(0, 50), '|', r.reason.slice(0, 120));
    }
  }
  console.log('lượt gọi mới: ' + calls + ' · tổng đã dùng: ' + callsSoFar() + '/' + MAX_CALLS);
}
// Kết luận mỗi tiếng — KHÔNG đếm phiếu thô (giám khảo thiên về clip nghe trước, nên một phiếu có thể chỉ phản ánh vị trí):
//  1) mỗi model: gộp các lượt của nó (kể cả lượt đảo thứ tự / ép mới vào B); đa số tuyệt đối → phiếu của model, còn lại "không rõ"
//     (vd. thắng ở A cả hai lần dù A là cũ rồi là mới ⇒ thiên lệch vị trí, không phải âm thanh);
//  2) hai model cùng một phiếu rõ → "đa số 2/2"; khác nhau → "bất đồng"; chỉ một model rõ → "1 model"; không ai rõ → "không rõ".
// Lượt đánh dấu stale (ứng với bản thiết kế cũ của tiếng đó, đã sửa sau) không được tính.
function consensus(res, n) {
  const by = {};
  for (const key of Object.keys(res)) { const e = res[key][n]; if (!e || e.stale) continue; const m = key.split('/')[0]; (by[m] = by[m] || []).push({ key, ...e }); }
  const votes = Object.keys(by).map(m => {
    const c = { new: 0, old: 0, tie: 0 }; by[m].forEach(e => c[e.verdict]++);
    const o = Object.keys(c).sort((a, b) => c[b] - c[a]);
    return { m, v: c[o[0]] > c[o[1]] ? o[0] : 'không rõ', runs: by[m], c };
  });
  const clear = votes.filter(x => x.v === 'new' || x.v === 'old');
  let result = 'không rõ';
  if (clear.length >= 2) result = clear.every(x => x.v === clear[0].v) ? clear[0].v + ' (2/2 model)' : 'bất đồng';
  else if (clear.length === 1) result = clear[0].v + ' (1 model; model kia không rõ)';
  return { votes, result };
}
const runTxt = e => (e.newIs === 'A' ? 'mới ở A' : 'mới ở B') + ' → ' + e.verdict + ' (mới ' + e.new.match + '/' + e.new.quality + ' · cũ ' + e.old.match + '/' + e.old.quality + ')';
function cmdVerdict() {
  const res = readJSON(path.join(OUT, 'ab.json'), {}), tally = { new: 0, old: 0, mixed: 0 };
  for (const n of NAMES) {
    const c = consensus(res, n);
    if (!c.votes.length) continue;
    console.log(pad(n, 8), pad(c.result, 40), c.votes.map(x => x.m.replace('gemini-', '') + ': ' + x.v + ' [' + x.runs.map(runTxt).join('; ') + ']').join('  ||  '));
    tally[/^new/.test(c.result) ? 'new' : /^old/.test(c.result) ? 'old' : 'mixed']++;
  }
  console.log('tổng: mới hay hơn ' + tally.new + ' · cũ hay hơn ' + tally.old + ' · bất đồng / không rõ ' + tally.mixed);
}

/* ------------------------------------------------------------------- trang A/B */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VN = { pop: 'Bong bóng nổ', whoosh: 'Vút qua', step: 'Bước chân', sting: 'Nhạc giật mình', hit: 'Cú đấm', boing: 'Lò xo', sparkle: 'Lấp lánh', rumble: 'Rung đất', drip: 'Giọt nước',
  sad: 'Kèn buồn', snore: 'Ngáy', party: 'Pháo giấy', hmm: 'Ừm…', gong: 'Chiêng', chime: 'Chuông', swish: 'Vung kiếm', tick: 'Tích tắc' };
const VN_DESC = { pop: 'Bong bóng nhỏ vỡ — tiếng "bóp" ngắn, tròn, dùng khi hiện bong bóng thoại.', whoosh: 'Vật lớn bay vút qua tai từ trái sang phải.', step: 'Một bước chân nhẹ của nhân vật nhỏ (gót rồi mũi).',
  sting: 'Nhạc giật mình kiểu hài kịch: "đùn — ĐÙNG!".', hit: 'Cú đấm / tát hài hước: "bốp", có trọng lượng nhưng không máu me. Dùng nhiều nhất trong màn đấu.', boing: 'Lò xo bật: "bòooing" cao su, cao độ rung lên rồi tụt.',
  sparkle: 'Lấp lánh phép thuật: chuỗi chuông nhỏ đi lên.', rumble: 'Rung chuyển đất: trầm, ù, vài hòn sỏi rơi.', drip: 'Giọt nước: "tinh" rồi một giọt nhỏ hơn vọng lại.', sad: 'Kèn trombone buồn "wah-wah-wah-waaah" — thất bại, hụt hẫng.',
  snore: 'Tiếng ngáy hoạt hình: hít vào khò khè, thở ra phì.', party: 'Pháo giấy nổ "bóc" rồi kim tuyến lấp lánh mừng.', hmm: '"Ừm…?" — hai nốt ngâm nga, nốt sau lên giọng như câu hỏi.', gong: 'Cú chiêng lớn, ngân dài, lung linh.',
  chime: 'Chuông "ting-ting" như chuông cửa hàng.', swish: 'Lưỡi kiếm vung nhanh: "xoẹt" mảnh, sáng.', tick: 'Tích tắc đồng hồ / mõ gỗ — rất ngắn, gọn.' };
function cmdPage() {
  const file = path.resolve(opt('file', path.join(OUT, 'ab.html'))), M = readJSON(path.join(OUT, 'metrics.json'), {}), J = readJSON(path.join(OUT, 'judge.json'), {}), AB_ = readJSON(path.join(OUT, 'ab.json'), {});
  const wavUri = (set, n) => { const f = path.join(OUT, set, n + '.wav'); return fs.existsSync(f) ? 'data:audio/wav;base64,' + fs.readFileSync(f).toString('base64') : ''; };
  const score = (set, n) => {
    const rows = Object.keys(AB_).filter(m => AB_[m][n]).map(m => ({ m, j: AB_[m][n][set] }));
    if (!rows.length) { const j = Object.keys(J).filter(k => k.startsWith(set + ':') && J[k][n]).map(k => J[k][n])[0]; if (j) rows.push({ m: '1 model', j }); }
    return rows.length ? rows.map(r => '<div class="sc"><b>' + r.j.match + '</b>/10 đúng ý · <b>' + r.j.quality + '</b>/10 chất lượng <span class="md">' + esc(r.m.replace('gemini-', '')) + '</span></div><div class="hd">“' + esc(r.j.heard) + '”</div>' + (r.j.artifacts && r.j.artifacts.length ? '<div class="ar">' + esc(r.j.artifacts.join(' · ')) + '</div>' : '')).join('') : '<div class="hd">(chưa chấm)</div>';
  };
  const met = (set, n) => { const m = (M[set] || {})[n]; return m ? 'đỉnh ' + m.peakDb + ' dB · to ' + m.activeRmsDb + ' dB · dài ' + m.dur60 + ' s · độ sáng ' + m.centroid + ' Hz' : ''; };
  const W_ = { new: 'MỚI hay hơn', old: 'CŨ hay hơn', tie: 'ngang nhau', 'không rõ': 'không rõ' };
  const label = r => String(r).replace(/^(new|old)/, m => W_[m]);
  const cards = LEGACY.map(n => {    // so cũ / mới: chỉ 17 tên cũ mới có bản cũ
    const c = consensus(AB_, n), runs = [];
    for (const key of Object.keys(AB_)) { const e = AB_[key][n]; if (e) runs.push('<li class="' + (e.stale ? 'stale' : '') + '"><b>' + esc(key.replace('gemini-', '')) + '</b> · ' + esc(runTxt(e)) + (e.stale ? ' <i>(bản thiết kế cũ hơn)</i>' : '') + '<br><span class="hd">cũ: “' + esc(e.old.heard) + '” · mới: “' + esc(e.new.heard) + '”</span></li>'); }
    const cls = /^new/.test(c.result) ? 'win' : /^old/.test(c.result) ? 'lose' : 'mix';
    const cmp = runs.length ? '<div class="ab ' + cls + '">Giám khảo máy: <b>' + esc(label(c.result)) + '</b><details><summary>các lượt chấm (' + runs.length + ')</summary><ul>' + runs.join('') + '</ul></details></div>' : '';
    const o = wavUri('old-matched', n), o2 = wavUri('old', n), w = wavUri('new', n), mo = (M.old || {})[n];
    return '<section class="card" id="' + n + '"><h2>' + esc(VN[n] || n) + ' <code>' + n + '</code></h2><p class="it">' + esc(VN_DESC[n] || INTENT[n]) + '</p><div class="cols">' +
      '<div class="col old"><h3>Cũ (v0.16)</h3>' + (o ? '<button data-a="old-' + n + '">▶ Nghe cũ</button> <small>(đã chỉnh to ngang bản mới' + (mo && mo.matchGainDb != null ? ': ' + (mo.matchGainDb > 0 ? '+' : '') + mo.matchGainDb + ' dB' : '') + ')</small><audio id="old-' + n + '" preload="auto" src="' + o + '"></audio>' : '') +
      (o2 ? '<br><button class="sm" data-a="raw-' + n + '">▶ cũ nguyên độ to</button><audio id="raw-' + n + '" preload="auto" src="' + o2 + '"></audio>' : '') + '<div class="mt">' + met('old', n) + '</div></div>' +
      '<div class="col new"><h3>Mới (v0.17)</h3>' + (w ? '<button data-a="new-' + n + '">▶ Nghe mới</button><audio id="new-' + n + '" preload="auto" src="' + w + '"></audio>' : '') + '<div class="mt">' + met('new', n) + '</div></div></div>' +
      (o && w ? '<button class="seq" data-s="' + n + '">▶▶ Cũ rồi mới</button>' : '') + cmp + '</section>';
  }).join('\n');
  const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>gen-chibi — so âm thanh cũ / mới</title><style>' +
    'body{font:15px/1.5 system-ui,Segoe UI,sans-serif;margin:0;background:#f4f1ec;color:#2b211d}header{padding:20px 28px;background:#2b211d;color:#f4f1ec}h1{margin:0;font-size:20px}header p{margin:4px 0 0;opacity:.8}' +
    'main{max-width:1060px;margin:0 auto;padding:18px 24px 60px;display:grid;gap:16px}.card{background:#fff;border:1px solid #ddd5c9;border-radius:10px;padding:14px 18px}.card h2{margin:0;font-size:17px}code{font-size:12px;background:#eee7dc;padding:1px 6px;border-radius:4px;margin-left:6px}' +
    '.it{margin:2px 0 10px;color:#6b5d54}.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}.col{border-radius:8px;padding:10px 12px}.old{background:#f3efe9}.new{background:#e9f3ec}h3{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#6b5d54}' +
    'button{font:inherit;padding:6px 14px;border:1px solid #2b211d;background:#fff;border-radius:6px;cursor:pointer}button:hover{background:#2b211d;color:#fff}button.on{background:#2b211d;color:#fff}.mt{font-size:12px;color:#6b5d54;margin:6px 0}.sc{font-size:13px}.md{font-size:11px;color:#8a7d72;margin-left:6px}.hd{font-size:13px;margin-top:4px;font-style:italic}.ar{font-size:12px;color:#a04a1a;margin-top:4px}' +
    '.seq{margin-top:10px}button.sm{font-size:12px;padding:3px 10px;margin-top:6px}.ab{margin-top:10px;font-size:13px;padding:8px 10px;background:#fff8e6;border-radius:6px}.ab.win{background:#e6f4ea}.ab.lose{background:#fdecea}.ab ul{margin:6px 0 0;padding-left:18px}.ab li{margin-bottom:5px}.ab li.stale{opacity:.5}.ab small,.col small{color:#8a7d72}@media(max-width:700px){.cols{grid-template-columns:1fr}}</style></head><body>' +
    '<header><h1>gen-chibi — âm thanh hiệu ứng: cũ so với mới</h1><p>17 tiếng, mỗi tiếng có bản cũ (v0.16) và bản mới (v0.17). Bấm để nghe. Giám khảo máy (hai model Gemini nghe) hay lẫn lộn — chúng thiên về clip nghe trước và có khi mô tả sai — nên đây chỉ là gợi ý, tai của bạn mới là trọng tài. Bản cũ đã được chỉnh to ngang bản mới để so công bằng (có nút nghe nguyên độ to gốc). Nghe bằng tai nghe / loa tốt để thấy bề rộng stereo.</p></header><main>' + cards +
    '</main><script>(function(){var cur=null;function stop(){document.querySelectorAll("audio").forEach(function(a){a.pause();a.currentTime=0});document.querySelectorAll("button.on").forEach(function(b){b.classList.remove("on")});cur=null}' +
    'function play(id,btn,cb){stop();var a=document.getElementById(id);if(!a)return;a.onended=function(){if(btn)btn.classList.remove("on");if(cb)cb()};if(btn)btn.classList.add("on");a.play()}' +
    'document.querySelectorAll("button[data-a]").forEach(function(b){b.onclick=function(){play(b.getAttribute("data-a"),b)}});' +
    'document.querySelectorAll("button[data-s]").forEach(function(b){b.onclick=function(){var n=b.getAttribute("data-s");play("old-"+n,b,function(){setTimeout(function(){play("new-"+n,b)},350)})}})})();</script></body></html>';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  console.log('trang A/B: ' + file + ' (' + (html.length / 1e6).toFixed(1) + ' MB)');
}

/* ------------------------------------------------------------------------- main */
const COMMANDS = { render: cmdRender, calibrate: cmdCalibrate, judge: cmdJudge, ab: cmdAB, verdict: cmdVerdict, page: cmdPage };
if (!COMMANDS[cmd]) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 21).join('\n')); process.exit(cmd ? 1 : 0); }
fs.mkdirSync(OUT, { recursive: true });
await COMMANDS[cmd]();
