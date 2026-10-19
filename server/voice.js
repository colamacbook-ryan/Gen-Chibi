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
// Tên giọng dựng sẵn của Gemini TTS (API không có lệnh liệt kê giọng) — nam / nữ là DỰ KIẾN, nghe thử ở Studio trước khi chọn.
// Giọng bị API từ chối thì đánh dấu hỏng lúc chạy, không dùng nữa.
const VOICES = [
  ['Charon', 'nam', 'trầm, rõ'], ['Algenib', 'nam', 'khàn, dày'], ['Orus', 'nam', 'chắc, dứt khoát'], ['Alnilam', 'nam', 'chắc'], ['Rasalgethi', 'nam', 'rõ ý'],
  ['Iapetus', 'nam', 'trong, rõ'], ['Schedar', 'nam', 'đều, điềm tĩnh'], ['Sadaltager', 'nam', 'từng trải'], ['Algieba', 'nam', 'mượt'], ['Enceladus', 'nam', 'nhiều hơi thở'],
  ['Umbriel', 'nam', 'thoải mái'], ['Zubenelgenubi', 'nam', 'tự nhiên, đời thường'], ['Achird', 'nam', 'thân thiện'], ['Puck', 'nam', 'vui tươi'], ['Fenrir', 'nam', 'hào hứng'], ['Sadachbia', 'nam', 'sinh động'],
  ['Kore', 'nữ', 'chắc, rõ'], ['Gacrux', 'nữ', 'trưởng thành'], ['Sulafat', 'nữ', 'ấm áp'], ['Vindemiatrix', 'nữ', 'dịu dàng'], ['Achernar', 'nữ', 'nhẹ nhàng'], ['Despina', 'nữ', 'mượt'],
  ['Erinome', 'nữ', 'trong'], ['Callirrhoe', 'nữ', 'thoải mái'], ['Aoede', 'nữ', 'thoáng, nhẹ'], ['Pulcherrima', 'nữ', 'thẳng thắn'], ['Zephyr', 'nữ', 'sáng'], ['Autonoe', 'nữ', 'sáng'],
  ['Laomedeia', 'nữ', 'vui tươi'], ['Leda', 'nữ', 'trẻ trung']
].map(v => ({ name: v[0], gender: v[1], style: v[2] }));
const VOICE_SET = new Set(VOICES.map(v => v.name));

// cảm xúc (18 trạng thái của khung) + kiểu bong bóng → thẻ giọng điệu đặt trong [ ] đầu câu (model không đọc to thẻ; đo 2026-10-19)
const STATE_TAGS = {
  normal: '', work: 'focused', think: 'thoughtful', unsure: 'hesitant', smug: 'smug', greedy: 'greedy, sly', proud: 'proud',
  vow: 'determined, solemn', beg: 'pleading', shock: 'shocked', panic: 'panicked, fast', rage: 'angry', dizzy: 'dazed',
  cry: 'crying, sobbing', injured: 'in pain', exhausted: 'exhausted, out of breath', lazy: 'lazy, yawning', sleep: 'sleepy, mumbling'
};
const BUBBLE_TAGS = { shout: 'shouting', whisper: 'whispering', think: 'inner thought, softly' };
function tagsOf(state, bubble) {
  return [STATE_TAGS[state] || '', BUBBLE_TAGS[bubble] || ''].filter(Boolean).join(', ');
}
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
    this.secrets = secrets;
    this._models = null; this._modelsAt = 0;
    this._busy = Promise.resolve();
    this.http = http || { get: u => get(u, this.key(), 30000), post: (u, b) => post(u, this.key(), b, 90000) };
    fs.mkdirSync(this.dir, { recursive: true });
  }
  read() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; } }
  write(v) { fs.writeFileSync(this.file + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  config() { return Object.assign({ enabled: false, model: '', blocked: {}, badVoices: [], usage: {} }, this.read()); }
  // key riêng cho giọng; chưa có thì dùng key Gemini đã nhập ở AI đạo diễn (cùng một key Google AI Studio)
  key() { return this.secrets.get('voice.gemini') || this.secrets.get('llm.gemini') || ''; }
  keySource() { return this.secrets.get('voice.gemini') ? 'voice' : this.secrets.get('llm.gemini') ? 'llm' : ''; }
  publicConfig() {
    const c = this.config(), day = new Date().toISOString().slice(0, 10), now = Date.now();
    return { enabled: c.enabled, model: c.model, hasKey: !!this.key(), keySource: this.keySource(),
      blocked: Object.keys(c.blocked).filter(m => c.blocked[m] > now).map(m => ({ model: m, until: new Date(c.blocked[m]).toISOString() })),
      today: (c.usage[day] || 0), cached: this.cachedCount(), voices: VOICES.filter(v => c.badVoices.indexOf(v.name) < 0), keyUrl: 'https://aistudio.google.com/apikey' };
  }
  setConfig(b) {
    const c = this.config();
    if (typeof b.enabled === 'boolean') c.enabled = b.enabled;
    if (typeof b.model === 'string') c.model = /^[a-z0-9.-]{0,80}$/.test(b.model) ? b.model : c.model;
    if (typeof b.apiKey === 'string' && b.apiKey.trim()) { this.secrets.set('voice.gemini', b.apiKey.trim()); c.blocked = {}; this._models = null; }
    if (b.clearKey === true) this.secrets.set('voice.gemini', '');
    this.write(c);
    return this.publicConfig();
  }
  cachedCount() { try { return fs.readdirSync(this.dir).filter(f => f.endsWith('.wav')).length; } catch { return 0; } }
  idOf(text, voice, tags) { return crypto.createHash('sha256').update(JSON.stringify([voice, tags, text])).digest('hex').slice(0, 40); }
  clipPath(id) { return /^[a-f0-9]{40}$/.test(String(id)) ? path.join(this.dir, id + '.wav') : null; }
  defaultVoice(asset) {
    // giọng mặc định ổn định theo nhân vật: từ khoá vai / tên → nam trầm · nam trẻ · nữ; trong nhóm chọn theo băm id
    const s = String([asset && asset.name, asset && asset.role, asset && asset.persona].join(' ')).toLowerCase();
    const female = /(^|[\s,.;:()])(cô|chị|bà|nàng|công chúa|tiểu thư|bé gái|mẹ|nữ|phu nhân|hoàng hậu|tiên nữ)(?=$|[\s,.;:()])/.test(s);   // \b của JS không hiểu chữ có dấu
    const low = /(tướng|vua|lão|ông|sếp|thừa tướng|đại ca|thầy|sư phụ|giám đốc|quan)/.test(s);
    const pool = VOICES.filter(v => v.gender === (female ? 'nữ' : 'nam')).map(v => v.name);
    const deep = ['Charon', 'Algenib', 'Orus', 'Alnilam', 'Gacrux', 'Kore', 'Sadaltager'], young = ['Puck', 'Fenrir', 'Sadachbia', 'Leda', 'Laomedeia', 'Zephyr', 'Achird'];
    const pick = pool.filter(n => (low ? deep : young).indexOf(n) >= 0);
    const list = pick.length ? pick : pool, h = crypto.createHash('md5').update(String(asset && asset.id || '')).digest().readUInt32LE(0);
    return list[h % list.length];
  }

  // model đọc giọng: quét lúc chạy, giữ 6 giờ; mới nhất trước, bản "lite" sau bản thường, preview sau cùng
  async models() {
    if (this._models && Date.now() - this._modelsAt < 6 * 3600e3) return this._models;
    const key = this.key(); if (!key) throw fail(409, 'Chưa có API key Google AI Studio (Cài đặt AI › Giọng AI)');
    const r = await this.http.get(API + '/models?pageSize=200');
    if (r.status >= 400 || !r.json) throw fail(502, 'Không lấy được danh sách model của Google (' + r.status + ')');
    const ver = n => { const m = /gemini-([\d.]+)/.exec(n); return m ? m[1].split('.').map(Number) : [0]; };
    const cmp = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) { if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0); } return 0; };
    const rank = n => (/preview/.test(n) ? 2 : 0) + (/lite/.test(n) ? 1 : 0);
    this._models = (r.json.models || []).filter(m => /-tts\b/.test(m.name) && (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
      .map(m => m.name.replace(/^models\//, '')).sort((a, b) => cmp(a, b) || rank(a) - rank(b));
    this._modelsAt = Date.now();
    return this._models;
  }
  // đọc một câu → { id, cached, model, seconds }; cùng giọng + cảm xúc + chữ → cùng clip (không gọi lại API)
  async line({ text, voice, state, bubble }) {
    const t = cleanText(text);
    if (!t) throw fail(400, 'Câu thoại trống');
    if (t.length > 240) throw fail(400, 'Câu thoại dài quá 240 ký tự');
    if (!VOICE_SET.has(voice)) throw fail(400, 'Không có giọng "' + String(voice).slice(0, 30) + '" (chọn trong danh sách giọng AI)');
    const tags = tagsOf(state, bubble), id = this.idOf(t, voice, tags), file = this.clipPath(id);
    if (fs.existsSync(file)) return { id, cached: true, seconds: this.seconds(file) };
    const c = this.config();
    if (!c.enabled) throw fail(409, 'Giọng AI đang tắt (Cài đặt AI › Giọng AI)');
    if (c.badVoices.indexOf(voice) >= 0) throw fail(400, 'Giọng ' + voice + ' không dùng được với model hiện có');
    // một lời gọi Google mỗi lúc (gói miễn phí: 3 câu / phút / model)
    const job = this._busy.then(() => this.render(t, voice, tags, id, file));
    this._busy = job.catch(() => {});
    return job;
  }
  seconds(file) { try { const w = wavInfo(fs.readFileSync(file)); return w ? +(w.data.length / (w.rate * 2)).toFixed(2) : null; } catch { return null; } }
  async render(t, voice, tags, id, file) {
    if (fs.existsSync(file)) return { id, cached: true, seconds: this.seconds(file) };
    const key = this.key(); if (!key) throw fail(409, 'Chưa có API key Google AI Studio (Cài đặt AI › Giọng AI)');
    const c = this.config(), now = Date.now(), all = await this.models();
    const order = (c.model && all.indexOf(c.model) >= 0 ? [c.model] : []).concat(all.filter(m => m !== c.model)).filter(m => !(c.blocked[m] > now));
    if (!all.length) throw fail(502, 'Key này không gọi được model đọc giọng nào của Google');
    if (!order.length) {
      const soon = Math.min.apply(null, all.map(m => c.blocked[m] || now));
      throw fail(429, 'Hết lượt đọc giọng AI hôm nay (gói miễn phí của Google ~10 câu / ngày / model). Thử lại sau ' + new Date(soon).toLocaleString('vi-VN') + ', hoặc bật thanh toán cho project Google.', { retryAt: new Date(soon).toISOString() });
    }
    const body = { contents: [{ parts: [{ text: (tags ? '[' + tags + '] ' : '') + t }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
    let last = null;
    for (const model of order) {
      const t0 = Date.now();
      const r = await this.http.post(API + '/models/' + model + ':generateContent', body);
      const err = r.json && r.json.error;
      if (r.status === 429 || r.status === 503) {   // hết hạn mức / quá tải: khoá model này tới giờ Google báo, thử model kế
        const cc = this.config(); cc.blocked[model] = Date.now() + (r.status === 503 ? 60000 : retryMs(err)); this.write(cc);
        last = fail(r.status === 429 ? 429 : 503, 'Google: ' + (r.status === 429 ? 'hết hạn mức' : 'đang quá tải') + ' (' + model + ')'); continue;
      }
      if (r.status === 400 && err && /voice/i.test(err.message || '')) { const cc = this.config(); if (cc.badVoices.indexOf(voice) < 0) cc.badVoices.push(voice); this.write(cc); throw fail(400, 'Giọng ' + voice + ' không dùng được'); }
      if (r.status >= 400 || !r.json) { last = fail(502, 'Google trả lỗi ' + r.status + (err && err.message ? ': ' + String(err.message).slice(0, 160) : '')); continue; }
      const part = (((r.json.candidates || [])[0] || {}).content || {}).parts;
      const inl = part && part[0] && part[0].inlineData;
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
    if (last && (last.code === 429 || last.code === 503)) {
      const cc = this.config(), soon = Math.min.apply(null, order.map(m => cc.blocked[m] || Date.now()));
      throw fail(429, 'Hết lượt đọc giọng AI lúc này (gói miễn phí của Google ~10 câu / ngày / model). Thử lại sau ' + new Date(soon).toLocaleString('vi-VN') + ', hoặc bật thanh toán cho project Google.', { retryAt: new Date(soon).toISOString() });
    }
    throw last || fail(502, 'Không đọc được câu thoại');
  }
}

module.exports = { Voice, VOICES, STATE_TAGS, BUBBLE_TAGS, tagsOf, cleanText, wavInfo, wavOf, tidy };
