// gen-chibi — giọng đọc TTS LOCAL miễn phí (v0.25.1, INT-23): máy chủ TTS kiểu OpenAI chạy trên máy chủ nhà (VieNeu-TTS, Kokoro-FastAPI…).
//   POST {base}/v1/audio/speech  { model, voice, input, response_format: 'wav' } → WAV
//   GET  {base}/v1/voices (VieNeu) hoặc {base}/v1/audio/voices (Kokoro) → danh sách giọng — quét LÚC CHẠY, thử cả hai (STD-10)
// Phần này chỉ giữ hàm thuần + lời gọi HTTP an toàn; cấu hình / trần / lưu đệm nằm ở server/voice.js (một đường xử lý âm thanh với Gemini).
// AN TOÀN (chống SSRF): base_url chỉ do CHỦ MÁY đặt (Studio › Cài đặt AI, PUT /api/voice — đường /api chỉ chủ máy mở được); agent / MCP không có
// đường nào đặt được. Chỉ nhận http(s) tới loopback / host.docker.internal / IP mạng riêng / tên container một nhãn (mạng Docker), và KIỂM LẠI
// địa chỉ đã phân giải ngay lúc nối (lookup) — tên miền trỏ ra Internet (hay đổi DNS sau khi đặt) bị chặn. Không đi qua proxy, không theo chuyển hướng.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');
const MSG = require('./i18n-msg'), { VI, tr } = MSG;

const MAX_BYTES = 20 * 1024 * 1024;   // phản hồi WAV tối đa 20 MB (câu ≤ 240 ký tự ~ vài trăm KB)
const LIST_MAX_BYTES = 2 * 1024 * 1024;
const SPEAK_MS = 60000, PROBE_MS = 2500;
const fail = (code, msg, extra) => Object.assign(new Error(msg), { code }, extra || {});

// IPv4 / IPv6 dạng chữ → có thuộc loopback / mạng riêng không. KHÔNG nhận 169.254/16 (metadata đám mây), 0/8, 100.64/10, địa chỉ công khai
function privateIp(ip) {
  ip = String(ip || '').replace(/^\[|\]$/g, '').toLowerCase();
  const m4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (m4) {
    const a = +m4[1], b = +m4[2];
    if ([1, 2, 3, 4].some(i => +m4[i] > 255)) return false;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (!net.isIPv6(ip)) return false;
  if (ip === '::1') return true;
  return /^f[cd][0-9a-f]{0,2}:/.test(ip);   // fc00::/7 (ULA)
}
const NAMED = new Set(['localhost', 'host.docker.internal', 'gateway.docker.internal']);
const CONTAINER = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/;   // tên container / service trong mạng Docker: MỘT nhãn, không dấu chấm
// base_url do chủ máy nhập → dạng chuẩn "http(s)://host[:port][/tiền-tố]" hoặc ném 400 (không bao giờ nhận chữ tự do)
function safeBase(input) {
  const s = String(input == null ? '' : input).trim();
  if (!s || s.length > 200) throw fail(400, 'Địa chỉ máy TTS trống hoặc dài quá');
  let u; try { u = new URL(s); } catch { throw fail(400, 'Địa chỉ máy TTS không hợp lệ (vd http://127.0.0.1:8000)'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw fail(400, 'Máy TTS chỉ nhận http:// hoặc https://');
  if (u.username || u.password || u.search || u.hash) throw fail(400, 'Địa chỉ máy TTS không được chứa tài khoản, ? hay #');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ok = NAMED.has(host) || (net.isIP(host) ? privateIp(host) : CONTAINER.test(host));
  if (!ok) throw fail(400, tr(VI, 'Máy TTS phải ở trên máy này hoặc mạng riêng (127.0.0.1, host.docker.internal, 10.x / 172.16–31.x / 192.168.x, tên container) — không nhận {host}', { host: host.slice(0, 60) }));
  const p = u.pathname.replace(/\/+$/, '');
  if (!/^(\/[A-Za-z0-9._-]+)*$/.test(p) || /(^|\/)\.\.?(\/|$)/.test(p)) throw fail(400, 'Tiền tố đường dẫn của máy TTS không hợp lệ');
  return u.protocol + '//' + u.host + p;
}
// lookup có rào: tên được phân giải phải ra TOÀN địa chỉ riêng (chặn DNS trỏ ra Internet / đổi DNS sau khi chủ máy đặt)
function guardLookup(hostname, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  // trả lời luôn BẤT ĐỒNG BỘ (setImmediate): lỗi nối đồng bộ trước khi http gắn bộ nghe lỗi của socket sẽ làm sập tiến trình
  dns.lookup(hostname, opts, (err, addr, fam) => setImmediate(() => {
    if (err) return cb(err);
    const list = Array.isArray(addr) ? addr : [{ address: addr, family: fam }];
    if (!list.length || list.some(x => !privateIp(x.address))) return cb(Object.assign(new Error('địa chỉ máy TTS không thuộc mạng riêng'), { code: 'EGCPUBLIC' }));
    cb(null, addr, fam);
  }));
}
// một lời gọi HTTP tới máy TTS: không proxy (agent riêng), có rào lookup, hạn giờ tổng, trần cỡ phản hồi → { status, type, buf }
function request(method, url, body, opts) {
  const o = opts || {}, max = o.max || MAX_BYTES, ms = o.timeout || SPEAK_MS;
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(fail(400, 'Địa chỉ máy TTS không hợp lệ')); }
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && !privateIp(u.hostname)) return reject(fail(400, 'Địa chỉ máy TTS không thuộc mạng riêng'));
    const mod = u.protocol === 'https:' ? https : http, data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = { 'User-Agent': 'gen-chibi', Accept: o.accept || '*/*' };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = data.length; }
    let done = false;
    const end = (e, r) => { if (done) return; done = true; clearTimeout(timer); if (e) reject(e); else resolve(r); };
    const req = mod.request(u, { method, headers, agent: false, lookup: guardLookup, timeout: ms }, res => {
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n > max) { req.destroy(); end(fail(502, tr(VI, 'Máy TTS trả về quá {mb} MB — bỏ', { mb: Math.round(max / 1048576) }))); } else chunks.push(c); });
      res.on('end', () => end(null, { status: res.statusCode, type: String(res.headers['content-type'] || ''), buf: Buffer.concat(chunks) }));
      res.on('error', e => end(e));
    });
    const timer = setTimeout(() => { req.destroy(); end(fail(504, 'Máy TTS không trả lời kịp')); }, ms);
    req.on('timeout', () => { req.destroy(); end(fail(504, 'Máy TTS không trả lời kịp')); });
    req.on('error', e => end(e && e.code === 'EGCPUBLIC' ? fail(400, 'Địa chỉ máy TTS không thuộc mạng riêng') : e));
    req.end(data || undefined);
  });
}
// danh sách giọng (dạng VieNeu / Kokoro / OpenAI-ish) → [{ id, name, desc }] hoặc null nếu không đọc được
const VID = /^[^\u0000-\u001f"<>\\]{1,80}$/;
function parseVoices(j) {
  const arr = Array.isArray(j) ? j : j && typeof j === 'object' ? (j.voices || j.data || j.items) : null;
  if (!Array.isArray(arr)) return null;
  const out = [], seen = new Set();
  for (const x of arr.slice(0, 2000)) {
    let id = '', name = '', desc = '';
    if (typeof x === 'string') { id = x; name = x; }
    else if (x && typeof x === 'object') {
      id = [x.id, x.voice_id, x.voice, x.name].find(v => typeof v === 'string' && v) || '';
      name = [x.name, x.display_name, x.label].find(v => typeof v === 'string' && v) || id;
      desc = [x.description, x.gender, x.accent, x.region, x.dialect, x.language, x.lang].filter(v => typeof v === 'string').join(' ').slice(0, 200);
    }
    id = id.trim();
    if (!VID.test(id) || seen.has(id)) continue;
    seen.add(id); out.push({ id, name: String(name).slice(0, 80), desc });
  }
  return out;
}
// quét giọng: thử /v1/voices (VieNeu) rồi /v1/audio/voices (Kokoro). → { alive, voices (mảng | null), path, error }
// alive = máy TTS có trả lời HTTP; voices = null khi không đường nào trả danh sách đọc được
async function probe(base, req) {
  const call = req || request;
  let alive = false, lastErr = '';
  for (const p of ['/v1/voices', '/v1/audio/voices']) {
    try {
      const r = await call('GET', base + p, null, { timeout: PROBE_MS, max: LIST_MAX_BYTES, accept: 'application/json' });
      alive = true;
      if (r.status >= 200 && r.status < 300) {
        let j = null; try { j = JSON.parse(r.buf.toString('utf8')); } catch { j = null; }
        const v = parseVoices(j);
        if (v) return { alive: true, voices: v, path: p, error: '' };
      }
      lastErr = 'HTTP ' + r.status;
    } catch (e) { lastErr = String((e && (e.code || e.message)) || e).slice(0, 120); break; }   // không nối được / hết giờ: đường kia cũng thế — khỏi chờ thêm lần nữa
  }
  return { alive, voices: null, path: '', error: lastErr };
}

// WAV PCM 16-bit (mono / stereo) → { pcm mono, rate } hoặc ném 502. Máy TTS ghi WAV theo luồng có thể để cỡ "data" = 0 hoặc 0xFFFFFFFF → lấy tới hết tệp
function readWav(buf, wavInfo) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw fail(502, 'Máy TTS không trả WAV (thiếu RIFF / WAVE)');
  const w = wavInfo(buf);
  if (!w) throw fail(502, 'WAV của máy TTS hỏng (thiếu fmt / data)');
  let data = w.data;
  if (!data.length) { const i = buf.indexOf('data', 12, 'ascii'); data = i > 0 ? buf.subarray(i + 8) : data; }
  if (w.bits !== 16 || (w.ch !== 1 && w.ch !== 2)) throw fail(502, tr(VI, 'WAV của máy TTS dạng lạ ({bits} bit, {ch} kênh) — cần PCM 16-bit', { bits: w.bits, ch: w.ch }));
  if (!(w.rate >= 8000 && w.rate <= 96000)) throw fail(502, 'WAV của máy TTS có tần số mẫu lạ');
  let pcm = data.subarray(0, data.length - (data.length % (2 * w.ch)));
  if (w.ch === 2) {   // trộn về mono
    const n = pcm.length / 4, out = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) out.writeInt16LE((pcm.readInt16LE(i * 4) + pcm.readInt16LE(i * 4 + 2)) >> 1, i * 2);
    pcm = out;
  }
  if (pcm.length < w.rate * 2 * 0.05) throw fail(502, 'Máy TTS trả âm thanh rỗng');
  return { pcm, rate: w.rate };
}

// bản đồ vai → giọng (kinds/voice/local-tts.json): giá trị khởi tạo cho từng ngôn ngữ + ứng viên giọng theo giọng vùng × giới (× vai)
let MAP = null;
function voiceMap(root) {
  if (MAP) return MAP;
  try { MAP = JSON.parse(fs.readFileSync(path.join(root || path.join(__dirname, '..'), 'kinds', 'voice', 'local-tts.json'), 'utf8')); }
  catch (e) { MAP = { rev: 0, defaults: {}, voices: {}, roles: {} }; }
  return MAP;
}
// ứng viên giọng cho (ngôn ngữ, giọng vùng, giới, vai) theo TẦNG ưu tiên: vai riêng → giọng vùng × giới → "*" × giới → giọng vùng KHÁC cùng giới
// (vd chưa có giọng Huế → giọng Bắc / Nam cùng giới — vẫn hơn giọng mặc định khác giới). Chọn ở tầng đầu tiên có giọng thật trên máy TTS
function candidates(map, lang, accent, gender, role) {
  const V = (map.voices || {})[lang] || {}, R = ((map.roles || {})[lang] || {})[role];
  const g = gender === 'f' ? 'f' : 'm', pick = o => (o && Array.isArray(o[g]) ? o[g] : []);
  const other = Object.keys(V).filter(k => k !== accent && k !== '*').reduce((a, k) => a.concat(pick(V[k])), []);
  const clean = a => a.filter(v => typeof v === 'string' && v);
  return [Array.isArray(R) ? R : [], pick(V[accent]), pick(V['*']), other].map(clean).filter(t => t.length);
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
// giọng có trên máy TTS không (so id / tên đã bỏ dấu) → id thật hoặc ''
function findVoice(list, want) {
  const n = norm(want);
  if (!n) return '';
  const hit = list.find(v => v.id === want) || list.find(v => norm(v.id) === n || norm(v.name) === n);
  return hit ? hit.id : '';
}

module.exports = { safeBase, privateIp, guardLookup, request, parseVoices, probe, readWav, voiceMap, candidates, findVoice, MAX_BYTES };
