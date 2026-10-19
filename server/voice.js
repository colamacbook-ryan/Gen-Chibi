// gen-chibi — giọng AI (Google Gemini TTS): mỗi câu thoại → một clip WAV, lưu đệm theo NỘI DUNG (giọng + cảm xúc + chữ),
// đọc lại không tốn lượt gọi. Model đọc giọng quét lúc chạy (STD-10): mọi model "*-tts" key này gọi được, mới nhất trước;
// model nào hết hạn mức (429) thì khoá tới giờ Google báo rồi chuyển model kế — gói miễn phí chỉ ~10 câu / ngày / model.
// Hết hẳn thì báo lỗi có giờ thử lại; Studio / bộ phát rơi về giọng trình duyệt. Key mã hoá trong kho bí mật, không trả về trình duyệt.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { agentFor } = require('./net');

const API = 'https://generativelanguage.googleapis.com/v1beta';
// Vai giọng, giọng vùng, 30 giọng dựng sẵn của Gemini, thẻ cảm xúc: MỘT nguồn ở engine/voices.js (dùng chung với Studio, bộ phát, MCP).
// Giọng nam / nữ là DỰ KIẾN — nghe thử ở Studio; giọng bị API từ chối thì đánh dấu hỏng lúc chạy, không dùng nữa.
const GV = require('../engine/voices.js');
const VOICES = GV.AI_VOICES.map(v => ({ name: v.name, gender: v.gender === 'f' ? 'nữ' : 'nam', style: v.style }));
const VOICE_SET = new Set(VOICES.map(v => v.name));
const PREBUILT = new Map(VOICES.map(v => [v.name.toLowerCase(), v.name]));   // thư viện trả id viết thường ('achernar') → tên chuẩn
const LIB_ID = /^[a-z]{2,3}-[a-z0-9]{2,4}-[a-z0-9-]{2,40}$/;                // giọng thư viện Google, vd vi-vn-tutor-2
const DESIGN_ID = /^voice_[a-z0-9]{6,40}$/;                                 // giọng đã thiết kế trong project của người dùng
// model đời 3.8 trở lên đọc qua Interactions API: chữ là lời thoại NGUYÊN VĂN, cách nói nằm ở speech_metadata.style, giọng là bất kỳ id nào
// (dựng sẵn / thư viện / thiết kế). Đời trước: generateContent + thẻ [ ] đầu câu, chỉ 30 giọng dựng sẵn. (docs speech-generation, đo 2026-10-19)
const verOf = n => { const m = /gemini-(\d+)\.(\d+)/.exec(n); return m ? [+m[1], +m[2]] : [0, 0]; };
const interactive = n => { const v = verOf(n); return v[0] > 3 || (v[0] === 3 && v[1] >= 8); };
const ageOf = d => { const m = /(\d{1,2})-year-old/.exec(String(d || '')); return m ? +m[1] : null; };
// chất giọng hợp / không hợp vai, đọc từ MÔ TẢ của giọng thư viện Google (từ vựng mô tả thật: confident, resonant, breezy, airy…)
const KIND_KW = {
  vo: [/confident|resonant|direct|objective|textured|authoritative|commanding|deep/i, /breezy|airy|light|youthful|soft|bright/i],
  quy: [/confident|resonant|authoritative|calm|warm|measured|objective/i, /breezy|airy|light|youthful|bubbly/i],
  ac: [/cool|confident|dry|textured|resonant|direct/i, /bright|breezy|cheerful|bubbly|empathic/i],
  van: [/calm|measured|warm|clear|precise|articulate|comforting|thoughtful/i, /fast-paced|energetic|colorful/i],
  ke: [/warm|engaging|clear|resonant|comforting/i, /fast-paced|dry/i],
  hai: [/energetic|colorful|enthusiastic|fast-paced|witty|bright|lively/i, /calm|objective|measured/i],
  thuong: [/warm|comforting|relaxed|laid-back|engaging|friendly|gentle/i, null]
};
const hashN = s => crypto.createHash('md5').update(String(s)).digest().readUInt32LE(0);
const STATE_TAGS = GV.STATE_TAGS, BUBBLE_TAGS = GV.BUBBLE_TAGS;
const tagsOf = (state, bubble) => GV.mood(state, bubble);
// chữ người dùng không được tự chèn thẻ giọng điệu: [ ] → ( ); bỏ ký tự điều khiển
function cleanText(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f]/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim(); }

function wavInfo(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let p = 12, fmt = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), n = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data' && fmt) return Object.assign(fmt, { data: buf.subarray(p + 8, Math.min(buf.length, p + 8 + n)) });
    p += 8 + n + (n & 1);
  }
  return null;
}
function wavOf(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
// chuẩn hoá: mono 16-bit, cắt lặng đầu / cuối (chừa 60 ms), đỉnh về -1 dBFS — câu thoại vào nhịp đều, to đều giữa các giọng
function tidy(pcm, rate) {
  const n = Math.floor(pcm.length / 2), s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = pcm.readInt16LE(i * 2);
  let peak = 1; for (let i = 0; i < n; i++) { const a = Math.abs(s[i]); if (a > peak) peak = a; }
  const th = Math.max(300, peak * 0.03), pad = Math.round(rate * 0.06);
  let a = 0, b = n - 1; while (a < n && Math.abs(s[a]) < th) a++; while (b > a && Math.abs(s[b]) < th) b--;
  a = Math.max(0, a - pad); b = Math.min(n - 1, b + pad);
  const g = Math.min(4, 29205 / peak), out = Buffer.alloc((b - a + 1) * 2);
  for (let i = a; i <= b; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s[i] * g))), (i - a) * 2);
  return out;
}

function post(url, key, body, timeout) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = https.request(url, { method: 'POST', timeout, agent: agentFor(url),
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, 'x-goog-api-key': key, 'User-Agent': 'gen-chibi' } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* không phải JSON */ } resolve({ status: res.statusCode, json: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('hết thời gian chờ Google')));
    req.on('error', reject);
    req.end(data);
  });
}
function get(url, key, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', timeout, agent: agentFor(url), headers: { 'x-goog-api-key': key, 'User-Agent': 'gen-chibi' } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* bỏ qua */ } resolve({ status: res.statusCode, json: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('hết thời gian chờ Google')));
    req.on('error', reject); req.end();
  });
}
// "76022s" / "21.2s" → mili giây
function retryMs(err) {
  const d = ((err && err.details) || []).find(x => x && x.retryDelay);
  const m = d && /^([\d.]+)s$/.exec(String(d.retryDelay));
  return m ? Math.ceil(+m[1] * 1000) : 60000;
}
const fail = (code, msg, extra) => Object.assign(new Error(msg), { code }, extra || {});

class Voice {
  // http (tuỳ chọn, cho test): { get(url) → {status, json}, post(url, body) → {status, json} } — mặc định gọi Google thật bằng key trong kho
  constructor({ dataDir, secrets, http }) {
    this.dir = path.join(dataDir, 'voices');
    this.file = path.join(dataDir, 'voice.json');
    this.libFile = path.join(dataDir, 'voice-lib.json');
    this.secrets = secrets;
    this._models = null; this._modelsAt = 0;
    this._busy = Promise.resolve();
    this.http = http || { get: u => get(u, this.key(), 30000), post: (u, b) => post(u, this.key(), b, 90000) };
    fs.mkdirSync(this.dir, { recursive: true });
  }
  read() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; } }
  write(v) { fs.writeFileSync(this.file + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  // enabled: null = tự bật khi có key (dán key là chạy) · false = chủ máy tắt hẳn · true = bật
  // designs: { "<vai>|<ngôn ngữ>|<giọng vùng>": { voice: "voice_…", at, preview } } — giọng vai đã thiết kế trong project Google của chủ máy
  config() { return Object.assign({ enabled: null, model: '', blocked: {}, badVoices: [], usage: {}, designs: {} }, this.read()); }
  isOn() { const c = this.config(); return c.enabled !== false && !!this.key(); }
  // key riêng cho giọng; chưa có thì dùng key Gemini đã nhập ở AI đạo diễn (cùng một key Google AI Studio)
  key() { return this.secrets.get('voice.gemini') || this.secrets.get('llm.gemini') || ''; }
  keySource() { return this.secrets.get('voice.gemini') ? 'voice' : this.secrets.get('llm.gemini') ? 'llm' : ''; }
  publicConfig() {
    const c = this.config(), day = new Date().toISOString().slice(0, 10), now = Date.now(), designs = {};
    Object.keys(c.designs).forEach(k => { const d = c.designs[k]; designs[k] = { voice: d.voice, at: d.at, preview: d.preview ? 'api/voice/clip/' + d.preview + '.wav' : null }; });
    return { enabled: c.enabled !== false && !!this.key(), off: c.enabled === false, model: c.model, hasKey: !!this.key(), keySource: this.keySource(),
      blocked: Object.keys(c.blocked).filter(m => c.blocked[m] > now).map(m => ({ model: m, until: new Date(c.blocked[m]).toISOString() })),
      today: (c.usage[day] || 0), cached: this.cachedCount(), voices: VOICES.filter(v => c.badVoices.indexOf(v.name) < 0), keyUrl: 'https://aistudio.google.com/apikey',
      roles: GV.roleList().map(r => Object.assign(r, { design: GV.canDesign(r.id) })), langs: GV.langList(), designs };
  }
  setConfig(b) {
    const c = this.config();
    if (typeof b.enabled === 'boolean') c.enabled = b.enabled;
    if (typeof b.model === 'string') c.model = /^[a-z0-9.-]{0,80}$/.test(b.model) ? b.model : c.model;
    if (b.clearKey === true) this.secrets.set('voice.gemini', '');
    this.write(c);
    return this.publicConfig();
  }
  // dán key → kiểm ngay bằng lệnh liệt kê model (MIỄN PHÍ, không tốn lượt đọc) → đúng thì lưu + bật, sai thì giữ key cũ và báo rõ
  async connect(apiKey) {
    const k = String(apiKey || '').trim();
    if (!/^[\x21-\x7e]{20,200}$/.test(k)) throw fail(400, 'Key trông không đúng (key Google AI Studio dạng AIza…, lấy ở https://aistudio.google.com/apikey)');
    const prev = this.secrets.get('voice.gemini'), c0 = this.config();
    this.secrets.set('voice.gemini', k); this._models = null;
    let ms;
    try { ms = await this.models(); }
    catch (e) { this.secrets.set('voice.gemini', prev || ''); this._models = null; throw e.code === 502 && /\((400|401|403)\)/.test(e.message) ? fail(400, 'Google từ chối key này — kiểm lại key (Google AI Studio › Get API key)') : e; }
    if (!ms.length) { this.secrets.set('voice.gemini', prev || ''); this._models = null; throw fail(400, 'Key hợp lệ nhưng không gọi được model đọc giọng nào (*-tts) — project Google này chưa bật Gemini API?'); }
    c0.enabled = null; c0.blocked = {}; this.write(c0);
    try { fs.unlinkSync(this.libFile); } catch { /* chưa có */ }   // key khác = project khác: giọng thiết kế / thư viện quét lại
    return Object.assign(this.publicConfig(), { models: ms });
  }
  cachedCount() { try { return fs.readdirSync(this.dir).filter(f => f.endsWith('.wav')).length; } catch { return 0; } }
  idOf(text, voice, tags) { return crypto.createHash('sha256').update(JSON.stringify([voice, tags, text])).digest('hex').slice(0, 40); }
  clipPath(id) { return /^[a-f0-9]{40}$/.test(String(id)) ? path.join(this.dir, id + '.wav') : null; }
  // giọng dựng sẵn mặc định theo vai (engine/voices.js) — dùng khi không có thư viện / chưa cast cả tác phẩm
  defaultVoice(asset) { return GV.cast(asset || {}).ai; }
  // id giọng hợp lệ → dạng chuẩn; lạ / đã hỏng → '' (không nhận chữ tự do làm giọng)
  validVoice(v, c) {
    if (typeof v !== 'string' || !v || v === 'auto') return '';
    const bad = (c || this.config()).badVoices, p = PREBUILT.get(v.toLowerCase());
    const id = p || (LIB_ID.test(v) || DESIGN_ID.test(v) ? v : '');
    return id && bad.indexOf(id) < 0 ? id : '';
  }

  // model đọc giọng: quét lúc chạy, giữ 6 giờ; mới nhất trước, bản "lite" sau bản thường, preview sau cùng
  async models() {
    if (this._models && Date.now() - this._modelsAt < 6 * 3600e3) return this._models;
    const key = this.key(); if (!key) throw fail(409, 'Chưa có API key Google AI Studio (Cài đặt AI › Giọng AI)');
    const r = await this.http.get(API + '/models?pageSize=200');
    if (r.status >= 400 || !r.json) throw fail(502, 'Không lấy được danh sách model của Google (' + r.status + ')');
    const cmp = (a, b) => { const x = verOf(a), y = verOf(b); return (y[0] - x[0]) || (y[1] - x[1]); };
    const rank = n => (/preview/.test(n) ? 2 : 0) + (/lite/.test(n) ? 1 : 0);
    this._models = (r.json.models || []).filter(m => /-tts\b/.test(m.name) && (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
      .map(m => m.name.replace(/^models\//, '')).sort((a, b) => cmp(a, b) || rank(a) - rank(b));
    this._modelsAt = Date.now();
    return this._models;
  }
  // thư viện giọng Google theo mã ngôn ngữ (quét lúc chạy, lưu 24 giờ ra đĩa; có cả giọng đã thiết kế trong project). Lệnh liệt kê — không tốn lượt đọc.
  readLib() { try { return JSON.parse(fs.readFileSync(this.libFile, 'utf8')) || {}; } catch { return {}; } }
  async library(code) {
    const all = this.readLib(), hit = all[code];
    if (hit && Date.now() - hit.at < 24 * 3600e3) return hit.voices;
    if (!this.key()) return hit ? hit.voices : [];
    const r = await this.http.get(API + '/voices?language_code=' + encodeURIComponent(code) + '&page_size=1000');
    if (r.status >= 400 || !r.json) { if (hit) return hit.voices; throw fail(502, 'Không lấy được thư viện giọng của Google (' + r.status + ')'); }
    // lọc lại theo mã ngôn ngữ (không tin hẳn bộ lọc phía Google) + chỉ nhận id đúng dạng
    const voices = (r.json.voices || []).filter(v => v && typeof v.id === 'string' && String(v.language_code || '').toLowerCase() === code.toLowerCase() &&
      (PREBUILT.has(v.id.toLowerCase()) || LIB_ID.test(v.id) || DESIGN_ID.test(v.id))).slice(0, 1000)
      .map(v => ({ id: PREBUILT.get(v.id.toLowerCase()) || v.id, name: String(v.display_name || v.id).slice(0, 60), gender: v.gender === 'female' ? 'f' : v.gender === 'male' ? 'm' : 'n',
        pitch: /^(low|medium|high)$/.test(v.pitch) ? v.pitch : '', age: ageOf(v.description), type: v.type === 'prompted' ? 'design' : PREBUILT.has(v.id.toLowerCase()) ? 'prebuilt' : 'library',
        description: String(v.description || '').slice(0, 200) }));
    all[code] = { at: Date.now(), voices };
    fs.writeFileSync(this.libFile + '.tmp', JSON.stringify(all)); fs.renameSync(this.libFile + '.tmp', this.libFile);
    return voices;
  }
  // chọn giọng AI cho cả dàn diễn viên một tác phẩm, mỗi người một giọng khi còn giọng. Thứ tự: người dùng chọn → giọng đã THIẾT KẾ cho vai
  // (+ ngôn ngữ + giọng vùng) → giọng THƯ VIỆN hợp vai (đúng ngôn ngữ, giới, tuổi, cao độ) → giọng DỰNG SẴN hợp vai. Không tốn lượt đọc.
  // actors: [{ id, role, voice?, accent? (giọng vùng riêng của nhân vật) }] → { lang, accent, cast: { id: { voice, source, label } } }
  async cast({ lang, accent, actors }) {
    const L = GV.lang(lang), ac = GV.accent(L, accent), c = this.config(), out = {}, taken = new Set();
    const code = GV.cast({ id: 'x' }, { lang: L, accent: ac }).libLang;
    const list = (Array.isArray(actors) ? actors : []).slice(0, 24).filter(a => a && typeof a.id === 'string' && a.id)
      .map(a => ({ id: a.id.slice(0, 80), role: GV.ROLES[a.role] ? a.role : 'nam-tre', voice: this.validVoice(a.voice, c), accent: GV.accent(L, a.accent) === a.accent ? a.accent : ac }));
    let lib = [];
    try { lib = await this.library(code); } catch { lib = []; }   // mất mạng: vẫn cast được bằng giọng dựng sẵn
    const libById = new Map(lib.map(v => [v.id, v]));
    list.forEach(a => { if (a.voice) { out[a.id] = { voice: a.voice, source: 'chosen', label: (libById.get(a.voice) || {}).name || a.voice }; taken.add(a.voice); } });
    list.forEach(a => {
      if (out[a.id]) return;
      const R = GV.ROLES[a.role], d = c.designs[a.role + '|' + L + '|' + a.accent], h = hashN(a.id);   // nhân vật có giọng vùng riêng → giọng thiết kế của vùng đó
      if (d && DESIGN_ID.test(d.voice) && !taken.has(d.voice) && c.badVoices.indexOf(d.voice) < 0) { out[a.id] = { voice: d.voice, source: 'design', label: R.label + ' (thiết kế)' }; taken.add(d.voice); return; }
      if (R.ages) {   // vai người lớn: giọng bản ngữ của thư viện, chấm theo giới + tuổi + cao độ + chất giọng (mô tả của Google)
        const kw = KIND_KW[R.kind] || KIND_KW.thuong;
        const sc = v => { const lo = R.ages[0], hi = R.ages[1], dist = v.age == null ? 15 : v.age < lo ? lo - v.age : v.age > hi ? v.age - hi : 0;
          return dist + (v.pitch && v.pitch !== R.prefPitch ? 6 : 0) + (kw[0].test(v.description) ? -3 : 0) + (kw[1] && kw[1].test(v.description) ? 5 : 0); };
        const pool = lib.filter(v => v.type === 'library' && v.gender === R.gender && !taken.has(v.id) && c.badVoices.indexOf(v.id) < 0)
          .map(v => ({ v, s: sc(v) })).filter(x => x.s <= 12).sort((x, y) => x.s - y.s || (x.v.id < y.v.id ? -1 : 1));
        // đa dạng nhưng không đánh đổi độ hợp vai: chỉ xoay giữa các giọng sát điểm giọng tốt nhất (≤ 2 điểm), tối đa 3
        if (pool.length) pool.splice(Math.min(3, pool.filter(x => x.s <= pool[0].s + 2).length));
        if (pool.length) { const v = pool[h % pool.length].v; out[a.id] = { voice: v.id, source: 'library', label: v.name + (v.age ? ' · ' + v.age + ' tuổi' : '') }; taken.add(v.id); return; }
      }
      const n = R.ai.length; let pick = '';
      for (let i = 0; i < n && !pick; i++) { const k = R.ai[(h + i) % n]; if (!taken.has(k) && c.badVoices.indexOf(k) < 0) pick = k; }
      if (!pick) { const same = VOICES.filter(v => v.gender === (R.gender === 'f' ? 'nữ' : 'nam') && !taken.has(v.name) && c.badVoices.indexOf(v.name) < 0); pick = same.length ? same[h % same.length].name : R.ai[h % n]; }
      out[a.id] = { voice: pick, source: 'prebuilt', label: pick }; taken.add(pick);
    });
    return { lang: L, accent: ac, cast: out };
  }
  // nhân vật + tuỳ chọn → { voice, role, lang, accent } cho MỘT câu (MCP / API khi không gửi cast của cả tác phẩm)
  async pick({ asset, voice, role, lang, accent }) {
    const a = asset || {}, v = Object.assign({}, a.voice);
    if (role && GV.ROLES[role]) v.role = role;
    const cs = GV.cast(Object.assign({ id: a.id || a.key || 'x' }, a, { voice: v }), { lang, accent });
    const chosen = this.validVoice(voice, null) || this.validVoice(v.ai, null);
    const r = await this.cast({ lang: cs.lang, accent: cs.accent, actors: [{ id: a.id || a.key || 'x', role: cs.role, voice: chosen }] });
    return { voice: r.cast[a.id || a.key || 'x'].voice, role: cs.role, lang: cs.lang, accent: cs.accent };
  }

  // THIẾT KẾ giọng cho một vai (+ ngôn ngữ + giọng vùng) trên project Google của chủ máy: mô tả tuổi + chất giọng + giọng vùng bằng lời →
  // giọng voice_… dùng mãi (Google giữ 1 năm kể từ lần dùng cuối, tối đa 200 giọng / project). Tốn một lượt (~1.400 token âm thanh mẫu).
  // Vai trẻ em / vị thành niên: Google chặn (chính sách an toàn) → báo rõ, không gọi.
  async design({ role, lang, accent }) {
    const R = GV.ROLES[role];
    if (!R) throw fail(400, 'Không có vai "' + String(role).slice(0, 30) + '" (xem danh sách vai giọng)');
    if (!GV.canDesign(role)) throw fail(400, 'Google không cho thiết kế giọng trẻ em / vị thành niên (chính sách an toàn) — vai "' + R.label + '" dùng giọng trẻ trung có sẵn');
    const c = this.config();
    if (c.enabled === false) throw fail(409, 'Giọng AI đang tắt (Cài đặt AI › Giọng AI)');
    if (!this.key()) throw fail(409, 'Chưa có API key Google AI Studio (Cài đặt AI › Giọng AI)');
    const L = GV.lang(lang), ac = GV.accent(L, accent), cs = GV.cast({ id: 'x', voice: { role } }, { lang: L, accent: ac });
    const job = this._busy.then(() => this.designNow(R, L, ac, cs));
    this._busy = job.catch(() => {});
    return job;
  }
  async designNow(R, L, ac, cs) {
    const body = code => ({ store: true, voice: { type: 'prompted', display_name: ('gc-' + R.id + '-' + L + '-' + ac).slice(0, 60), gender: R.gender === 'f' ? 'female' : 'male', language_code: code, prompted: { input: cs.design } } });
    let r = await this.http.post(API + '/voices', body(cs.libLang));
    const msg = j => String((j && j.error && j.error.message) || '');
    if (r.status === 400 && /language/i.test(msg(r.json)) && cs.libLang !== GV.LANGS[L].bcp) r = await this.http.post(API + '/voices', body(GV.LANGS[L].bcp));   // mã ngôn ngữ lạ (cmn-CN) → thử mã BCP thường
    if (r.status === 429) { const at = Date.now() + retryMs(r.json && r.json.error); throw fail(429, 'Hết lượt thiết kế giọng lúc này — thử lại sau ' + new Date(at).toLocaleString('vi-VN'), { retryAt: new Date(at).toISOString() }); }
    if (r.status === 400 && /safety|blocked/i.test(msg(r.json))) throw fail(400, 'Google chặn mô tả giọng này (chính sách an toàn)');
    if (r.status >= 400 || !r.json || !DESIGN_ID.test(String(r.json.id || ''))) throw fail(502, 'Google không thiết kế được giọng (' + r.status + (msg(r.json) ? ': ' + msg(r.json).slice(0, 160) : '') + ')');
    const v = r.json, sa = v.sample_audio || v.sampleAudio;
    let pid = null;
    if (sa && sa.data) {   // giọng mẫu Google trả kèm → clip nghe thử (cắt lặng, chuẩn hoá, tối đa 20 giây)
      const w = wavInfo(Buffer.from(sa.data, 'base64'));
      if (w && w.bits === 16 && w.ch === 1) {
        pid = this.idOf('design', v.id, ''); const f = this.clipPath(pid), pcm = tidy(w.data, w.rate);
        fs.writeFileSync(f + '.tmp', wavOf(pcm.subarray(0, Math.min(pcm.length, w.rate * 2 * 20)), w.rate)); fs.renameSync(f + '.tmp', f);
      }
    }
    const cc = this.config(), day = new Date().toISOString().slice(0, 10);
    cc.designs[R.id + '|' + L + '|' + ac] = { voice: v.id, at: new Date().toISOString(), preview: pid };
    cc.usage = { [day]: (cc.usage[day] || 0) + 1 }; this.write(cc);
    try { const all = this.readLib(); delete all[cs.libLang]; fs.writeFileSync(this.libFile, JSON.stringify(all)); } catch { /* bỏ qua */ }
    return { voice: v.id, role: R.id, lang: L, accent: ac, preview: pid ? 'api/voice/clip/' + pid + '.wav' : null };
  }

  // đọc một câu → { id, cached, model, seconds }; cùng giọng + cách nói + chữ → cùng clip (không gọi lại API)
  // role → cách nói của vai (style); state + bubble → cảm xúc; dry: chỉ lấy clip đã có (xuất phim), không bao giờ gọi Google
  async line({ text, voice, role, state, bubble, dry }) {
    const t = cleanText(text);
    if (!t) throw fail(400, 'Câu thoại trống');
    if (t.length > 240) throw fail(400, 'Câu thoại dài quá 240 ký tự');
    const c0 = this.config(), vid = this.validVoice(voice, { badVoices: [] });
    if (!vid) throw fail(400, 'Không có giọng "' + String(voice).slice(0, 40) + '" (chọn trong danh sách giọng AI)');
    const R = GV.ROLES[role], style = [R ? R.style : '', tagsOf(state, bubble)].filter(Boolean).join(', ');
    const id = this.idOf(t, vid, style), file = this.clipPath(id);
    if (fs.existsSync(file)) return { id, cached: true, seconds: this.seconds(file) };
    if (dry) throw fail(404, 'Câu này chưa đọc bằng giọng AI');
    if (c0.enabled === false) throw fail(409, 'Giọng AI đang tắt (Cài đặt AI › Giọng AI)');
    if (c0.badVoices.indexOf(vid) >= 0) throw fail(400, 'Giọng ' + vid + ' không dùng được với model hiện có');
    // một lời gọi Google mỗi lúc (gói miễn phí giới hạn số câu / phút / model)
    const job = this._busy.then(() => this.render(t, vid, style, id, file));
    this._busy = job.catch(() => {});
    return job;
  }
  seconds(file) { try { const w = wavInfo(fs.readFileSync(file)); return w ? +(w.data.length / (w.rate * 2)).toFixed(2) : null; } catch { return null; } }
  async render(t, voice, style, id, file) {
    if (fs.existsSync(file)) return { id, cached: true, seconds: this.seconds(file) };
    const key = this.key(); if (!key) throw fail(409, 'Chưa có API key Google AI Studio (Cài đặt AI › Giọng AI)');
    const c = this.config(), now = Date.now(), all = await this.models();
    if (!all.length) throw fail(502, 'Key này không gọi được model đọc giọng nào của Google');
    // model đời trước chỉ biết 30 giọng dựng sẵn → giọng thư viện / thiết kế chỉ đi qua model 3.8+
    const fit = all.filter(m => interactive(m) || VOICE_SET.has(voice));
    if (!fit.length) throw fail(502, 'Giọng ' + voice + ' cần model đọc giọng đời 3.8 trở lên (key này chưa gọi được)');
    const order = (c.model && fit.indexOf(c.model) >= 0 ? [c.model] : []).concat(fit.filter(m => m !== c.model)).filter(m => !(c.blocked[m] > now));
    const soonest = ms => { const cc = this.config(); return Math.min.apply(null, ms.map(m => cc.blocked[m] || Date.now())); };
    const quotaErr = at => fail(429, 'Hết lượt đọc giọng AI lúc này (gói miễn phí của Google rất ít lượt / ngày / model). Thử lại sau ' + new Date(at).toLocaleString('vi-VN') + ', hoặc bật thanh toán cho project Google.', { retryAt: new Date(at).toISOString() });
    if (!order.length) throw quotaErr(soonest(fit));
    let last = null;
    for (const model of order) {
      const t0 = Date.now(), inter = interactive(model);
      const url = inter ? API + '/interactions' : API + '/models/' + model + ':generateContent';
      const body = inter
        ? { model, input: [{ type: 'user_input', content: [{ type: 'text', text: t, annotations: style ? [{ type: 'speech_metadata', style }] : [] }] }],
            response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } }
        : { contents: [{ parts: [{ text: (style ? '[' + style + '] ' : '') + t }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
      const r = await this.http.post(url, body);
      const err = r.json && r.json.error;
      if (r.status === 429 || r.status === 503) {   // hết hạn mức / quá tải: khoá model này tới giờ Google báo, thử model kế
        const cc = this.config(); cc.blocked[model] = Date.now() + (r.status === 503 ? 60000 : retryMs(err)); this.write(cc);
        last = fail(r.status === 429 ? 429 : 503, 'Google: ' + (r.status === 429 ? 'hết hạn mức' : 'đang quá tải') + ' (' + model + ')'); continue;
      }
      if ((r.status === 400 || r.status === 404) && err && /voice/i.test(err.message || '')) { const cc = this.config(); if (cc.badVoices.indexOf(voice) < 0) cc.badVoices.push(voice); this.write(cc); throw fail(400, 'Giọng ' + voice + ' không dùng được'); }
      if (r.status >= 400 || !r.json) { last = fail(502, 'Google trả lỗi ' + r.status + (err && err.message ? ': ' + String(err.message).slice(0, 160) : '')); continue; }
      let inl = null;
      if (inter) {   // Interactions: steps[].type = model_output → content[].type = audio (lấy đoạn cuối)
        (r.json.steps || []).forEach(s => { if (s && s.type === 'model_output') (s.content || []).forEach(x => { if (x && x.type === 'audio' && x.data) inl = { data: x.data, mimeType: x.mime_type || x.mimeType || '' }; }); });
      } else {
        const part = (((r.json.candidates || [])[0] || {}).content || {}).parts;
        inl = part && part[0] && part[0].inlineData;
      }
      if (!inl || !inl.data) { last = fail(502, 'Google không trả âm thanh (' + model + ')'); continue; }
      const raw = Buffer.from(inl.data, 'base64');
      let pcm, rate;
      const w = wavInfo(raw);
      if (w) { if (w.bits !== 16 || w.ch !== 1) { last = fail(502, 'Định dạng âm thanh lạ'); continue; } pcm = w.data; rate = w.rate; }
      else { const m = /rate=(\d+)/.exec(inl.mimeType || ''); pcm = raw; rate = m ? +m[1] : 24000; }   // audio/L16;rate=24000 = PCM 16-bit thô
      fs.writeFileSync(file + '.tmp', wavOf(tidy(pcm, rate), rate)); fs.renameSync(file + '.tmp', file);
      const cc = this.config(), day = new Date().toISOString().slice(0, 10); cc.usage = { [day]: (cc.usage[day] || 0) + 1 }; this.write(cc);
      return { id, cached: false, model, ms: Date.now() - t0, seconds: this.seconds(file) };
    }
    // vừa thử hết mà model nào cũng hết hạn mức / quá tải → báo kèm giờ sớm nhất dùng lại được (Studio rơi về giọng trình duyệt)
    if (last && (last.code === 429 || last.code === 503)) throw quotaErr(soonest(order));
    throw last || fail(502, 'Không đọc được câu thoại');
  }
}

module.exports = { Voice, VOICES, STATE_TAGS, BUBBLE_TAGS, tagsOf, cleanText, wavInfo, wavOf, tidy, GV, interactive };
