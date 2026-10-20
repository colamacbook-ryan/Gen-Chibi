// gen-chibi — server cục bộ (Node thuần, không phụ thuộc thư viện ngoài)
// © 2026 Gen Labs — All rights reserved.
// Phục vụ Studio + API (asset có phiên bản, kịch bản, core AI, cập nhật) + MCP cho agent.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Updater, RESTART_CODE } = require('./updater');
const { Secrets } = require('./secrets');
const { AI } = require('./ai');
const { Voice, VOICES, GV } = require('./voice');
const { MCP, TOOLS: MCP_TOOLS, cleanContext, cleanAnchors, scopeCtx } = require('./mcp');   // chỉ dẫn + bộ tool theo khu của dock nằm trong mcp.js (một nguồn)
const Agent = require('./agent.js');
const { OAuth, clientIp, isDirectLocal, SCOPES: OAUTH_SCOPES, SCOPE_INFO: OAUTH_SCOPE_INFO } = require('./oauth');
const { consentPage, errorPage } = require('./oauth-page');
const { Store, KEY, CHAT_KINDS, readJSON, writeJSON } = require('./store');
const { loadEngine } = require('./engine-node');
const L10N = require('./i18n');   // ngôn ngữ (ADR 0007): langOf(req) + tr(lang, msgid) — builder sau dịch câu server qua đây

const APP = path.resolve(__dirname, '..');                       // thư mục phiên bản đang chạy
const HOME = process.env.GC_HOME || (path.basename(path.dirname(APP)) === 'releases' ? path.resolve(APP, '..', '..') : path.join(APP, '.home'));
const VERSION = fs.readFileSync(path.join(APP, 'VERSION'), 'utf8').trim();
const PORT = +(process.env.GC_PORT || 7480);
const HOST = process.env.GC_LISTEN || '127.0.0.1';   // trong Docker đặt 0.0.0.0; cổng ngoài vẫn chỉ mở cho 127.0.0.1
const API_TOKEN = process.env.GC_API_TOKEN || '';
// Link MCP có khoá (https://<tên miền>/mcp/<GC_MCP_KEY>): chỉ cấp quyền MCP, không mở Studio hay /api.
// Dùng cho agent không đặt được header (Claude web/desktop Connectors). Đổi khoá: genchibi expose --rotate.
const MCP_KEY = process.env.GC_MCP_KEY || '';
if (MCP_KEY && !/^[A-Za-z0-9_-]{24,}$/.test(MCP_KEY)) { console.error('GC_MCP_KEY phải dài ít nhất 24 ký tự [A-Za-z0-9_-].'); process.exit(2); }
const PUBLIC_URL = String(process.env.GC_PUBLIC_URL || '').replace(/\/+$/, '');
function safeEq(x, y) {
  const a = Buffer.from(String(x)), b = Buffer.from(String(y));
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}
function tokenOk(t) { return safeEq(t, API_TOKEN); }
const IN_DOCKER = process.env.GC_IN_DOCKER === '1';
const REPO = process.env.GC_REPO || 'colamacbook-ryan/Gen-Chibi';
const EXTRA_HOSTS = String(process.env.GC_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1'].concat(EXTRA_HOSTS));
// "*.trycloudflare.com" = mọi tên con (tunnel tạm đổi tên mỗi lần chạy). Tên công cộng như vậy không trỏ được về 127.0.0.1 nên không mở lại lỗ DNS rebinding.
const WILD_HOSTS = EXTRA_HOSTS.filter(h => /^\*\.[a-z0-9.-]+\.[a-z]+$/.test(h)).map(h => h.slice(1));
function hostAllowed(h) { return ALLOWED_HOSTS.has(h) || WILD_HOSTS.some(suf => h.endsWith(suf) && h.length > suf.length); }
if (EXTRA_HOSTS.length && !API_TOKEN) { console.error('GC_ALLOWED_HOSTS cần đi kèm GC_API_TOKEN (truy cập từ máy khác phải có token).'); process.exit(2); }
const DATA = path.join(HOME, 'data');
const SETTINGS = path.join(DATA, 'settings.json');
fs.mkdirSync(DATA, { recursive: true });

function log(...a) { console.log(new Date().toISOString(), ...a); }
// uiLang: ngôn ngữ mặc định của máy cho Studio / câu trả lời API (người dùng vẫn chọn riêng trong trình duyệt); trình cài đặt đặt qua GC_LANG
const UI_LANG0 = L10N.norm(process.env.GC_LANG) || 'en';
function settings() { const s = Object.assign({ autoUpdate: process.env.GC_AUTO_UPDATE !== '0', checkHours: 6, oauthRegister: true, uiLang: UI_LANG0 }, readJSON(SETTINGS, {})); if (!L10N.norm(s.uiLang)) s.uiLang = UI_LANG0; return s; }   // oauthRegister: cho agent tự đăng ký OAuth (v0.19; chỉ có tác dụng khi có GC_PUBLIC_URL)

L10N.load(APP);
const store = new Store(DATA);
const engine = loadEngine(APP);
const updater = new Updater({ home: HOME, version: VERSION, repo: REPO, feedUrl: process.env.GC_FEED_URL, log, token: process.env.GC_GITHUB_TOKEN || '' });
const secrets = new Secrets(DATA);
const ai = new AI({ dataDir: DATA, secrets, engine });
const voice = new Voice({ dataDir: DATA, secrets });   // giọng AI (Google Gemini TTS) — dùng chung kho bí mật với AI đạo diễn
const mcp = new MCP({ engine, store, version: VERSION, system: { updater, restartSoon }, voice });
// OAuth 2.1 cho MCP từ xa (v0.19): mọi URL dựng từ GC_PUBLIC_URL — thiếu hoặc không phải gốc (có đường dẫn) thì OAuth tắt, /mcp vẫn 401 như cũ
const oauth = new OAuth({ dir: DATA, publicUrl: PUBLIC_URL, warn: log, accessTtl: process.env.GC_OAUTH_ACCESS_TTL, redirects: String(process.env.GC_OAUTH_REDIRECTS || '').split(',').map(x => x.trim()).filter(Boolean) });
if (PUBLIC_URL && !oauth.enabled) log('[oauth] OAuth đang TẮT: ' + oauth.why);
// header chứa IP khách để giới hạn tốc độ (xem clientIp): mặc định mục cuối của x-forwarded-for; đứng sau Cloudflare đặt GC_CLIENT_IP_HEADER=cf-connecting-ip
const IP_HEADER = String(process.env.GC_CLIENT_IP_HEADER || '').trim().toLowerCase();
if (IP_HEADER && ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip'].indexOf(IP_HEADER) < 0) { console.error('GC_CLIENT_IP_HEADER phải là x-forwarded-for | cf-connecting-ip | x-real-ip.'); process.exit(2); }
setInterval(() => oauth.flush(), 30000).unref();   // lastUsedAt ghi đĩa trễ

/* ---------------------------------------------------------------- tiện ích HTTP */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };
// ngôn ngữ của người gọi: header X-GC-Lang (Studio) → Accept-Language → mặc định của máy
function langOf(req) { return L10N.langOf(req, settings().uiLang); }
// câu lỗi JSON ({ error, errors[] }) dịch theo người gọi nếu bảng có ĐÚNG câu đó (msgid); câu ghép động chưa có khoá thì giữ nguyên —
// builder dịch server chuyển dần sang tr(langOf(req), 'mẫu {x}', { x }) ngay tại chỗ ném lỗi
function localize(res, body) {
  if (!res.req || !body || typeof body !== 'object' || Buffer.isBuffer(body) || Array.isArray(body)) return body;
  const hasErr = typeof body.error === 'string', hasList = Array.isArray(body.errors) && body.errors.some(x => typeof x === 'string');
  if (!hasErr && !hasList) return body;
  const lang = langOf(res.req);
  if (lang === L10N.I18N.SOURCE) return body;
  const out = Object.assign({}, body);
  if (hasErr) out.error = L10N.label(lang, body.error);
  if (hasList) out.errors = body.errors.map(x => typeof x === 'string' ? L10N.label(lang, x) : x);
  return out;
}
function send(res, code, body, type, extra) {
  if (!type && body && typeof body === 'object' && !Buffer.isBuffer(body)) body = localize(res, body);
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, Object.assign({
    'Content-Type': type || 'application/json; charset=utf-8', 'Content-Length': buf.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY'
  }, extra));
  res.end(buf);
}
function fail(res, code, message) { send(res, code, { error: message }); }
function body(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('dữ liệu gửi lên quá lớn (tối đa ' + Math.round(limit / 1048576 * 10) / 10 + ' MB)'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!n) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('JSON không hợp lệ'), { code: 400 })); }
    });
    req.on('error', reject);
  });
}

// thân của /oauth/token | /oauth/revoke | /oauth/register: form-urlencoded (Claude gửi dạng này) hoặc JSON; trần 32 KB, đối tượng không có prototype
function oauthBody(req) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '').toLowerCase(), chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > 32 * 1024) { reject(Object.assign(new Error('thân yêu cầu quá lớn (tối đa 32 KB)'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (/^application\/x-www-form-urlencoded\b/.test(ct)) { const o = Object.create(null); for (const [k, v] of new URLSearchParams(raw)) if (!(k in o)) o[k] = v; return resolve(o); }
      if (/^application\/json\b/.test(ct)) {
        let j; try { j = raw ? JSON.parse(raw) : {}; } catch (e) { return reject(Object.assign(new Error('JSON không hợp lệ'), { code: 400 })); }
        return j && typeof j === 'object' && !Array.isArray(j) ? resolve(j) : reject(Object.assign(new Error('thân phải là đối tượng JSON'), { code: 400 }));
      }
      reject(Object.assign(new Error('Content-Type phải là application/x-www-form-urlencoded hoặc application/json'), { code: 415 }));
    });
  });
}
function bearerOf(req) { return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers['x-gc-token'] || ''); }

/* ---------------------------------------------------------------- tệp tĩnh */
const STATIC_ROOTS = ['engine', 'kinds', 'studio', 'locales'];   // locales/<lang>/*.json: bảng dịch Studio nạp trước lần vẽ đầu
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const slash = rel.match(/^(xuong|thu-vien|tao-tac)\/$/);   // /xuong/ → /xuong (đường dẫn tương đối của trang chỉ đúng khi không có / cuối)
  if (slash) { res.writeHead(301, { Location: '/' + slash[1] }); return res.end(); }
  if (rel === '' || rel === 'index.html' || rel === 'xuong' || rel === 'thu-vien' || rel === 'tao-tac') rel = 'studio/index.html';   // 3 ứng dụng độc lập dùng chung một bộ mã
  if (rel === 'CHANGELOG.md' || rel === 'VERSION') return send(res, 200, fs.readFileSync(path.join(APP, rel)), MIME[path.extname(rel)] || 'text/plain; charset=utf-8');
  const top = rel.split('/')[0];
  if (!STATIC_ROOTS.includes(top) || rel.split('/').includes('..')) return fail(res, 404, 'không tìm thấy');
  const file = path.join(APP, rel);
  if (!file.startsWith(APP + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, 'không tìm thấy');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
}

/* ---------------------------------------------------------------- định tuyến */
function restartSoon() { setTimeout(() => { log('[server] thoát để launcher khởi động lại'); oauth.flush(); process.exit(RESTART_CODE); }, 400); }
// Origin (nếu có) phải trỏ về chính máy chủ này. Lớp chặn chính là header X-GC-Request (trang khác không gửi được nếu không qua preflight CORS, mà máy chủ
// không trả CORS); đây là lớp thứ hai nên chấp nhận các cách mở hợp lệ: trùng Host · trùng tên mà proxy báo (X-Forwarded-Host) hoặc GC_PUBLIC_URL ·
// cùng là máy cục bộ (localhost / 127.0.0.1 / [::1]) và cùng cổng. Origin hỏng → chặn (không ném lỗi 500).
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
function hostPort(h) { const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(String(h || '').toLowerCase()); return m ? [m[1], m[2] || ''] : ['', '']; }
function originOK(req) {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return true;
  let oh; try { oh = new URL(origin).host.toLowerCase(); } catch (e) { return false; }
  const host = String(req.headers.host || '').toLowerCase();
  if (oh === host) return true;
  if (String(req.headers['x-forwarded-host'] || '').toLowerCase().split(',').map(x => x.trim()).includes(oh)) return true;
  if (PUBLIC_URL) { try { if (new URL(PUBLIC_URL).host.toLowerCase() === oh) return true; } catch (e) { /* GC_PUBLIC_URL hỏng: bỏ qua */ } }
  const [a, ap] = hostPort(oh), [b, bp] = hostPort(host);
  return LOOPBACK.has(a) && LOOPBACK.has(b) && ap === bp;
}
// câu báo khi chặn: nói rõ trang mở ở đâu và máy chủ nhận địa chỉ nào để người dùng tự sửa (chuỗi đã cắt ngắn, chỉ là chữ)
function originMsg(req) {
  const cut = x => String(x || '?').replace(/[^\x20-\x7e]/g, '').slice(0, 120);
  return 'yêu cầu từ nguồn lạ bị chặn: trang đang mở ở ' + cut(req.headers.origin) + ' nhưng máy chủ nhận địa chỉ ' + cut(req.headers.host) +
    ' — mở Studio bằng đúng địa chỉ máy chủ (vd. http://127.0.0.1:' + PORT + '), hoặc cập nhật bằng lệnh: genchibi update';
}

// KHOÁ LƯỢT AI (CNS-120): mỗi lượt giữ khoá của LUỒNG (`<loại>-<id>`: một lượt mỗi luồng) VÀ khoá của TÁC PHẨM nó có thể ghi (`work:<id>`; lượt ở khu Tạo tác không gắn tác phẩm có thể
// ghi mọi tác phẩm → `work:*`, xung khắc với mọi `work:<id>`). Hai luồng khác nhau cùng ghi một phim không chạy song song (dễ tạo trùng phân cảnh); khác tác phẩm thì song song.
const chatBusy = new Set();
function lockKeys(ctx, key) {
  const keys = [key.kind + '-' + key.id];
  if (ctx.zone === 'tao-tac') keys.push(ctx.object && ctx.object.kind === 'work' ? 'work:' + ctx.object.id : 'work:*');
  return keys;
}
function lockHit(k) {
  if (chatBusy.has(k)) return true;
  if (k === 'work:*') return Array.from(chatBusy).some(x => x.startsWith('work:'));
  return k.startsWith('work:') && chatBusy.has('work:*');
}
// Luồng chat của dock theo ĐỐI TƯỢNG đang xem: tác phẩm → asset → dự án → (không có đối tượng) khu. Đổi đối tượng = đổi luồng.
function chatKeyOf(ctx) {
  const o = ctx.object;
  if (o && o.kind === 'work') return { kind: 'work', id: o.id };
  if (o && o.kind === 'asset') return { kind: 'asset', id: String(o.id).toLowerCase().replace('/', '~') };
  if (o && o.kind === 'project') return { kind: 'project', id: o.id };
  return { kind: 'khu', id: ctx.zone };
}
// đọc luồng; tác phẩm cũ (trước v0.18) còn chat trong work.chat → coi đó là luồng sẵn có cho tới lần chat kế (rồi mới ghi sang data/chats)
function threadOf(key) {
  const c = store.getChat(key.kind, key.id);
  if (!c) return null;
  if (!c.messages.length && key.kind === 'work') { const w = store.getWork(key.id); if (w && (w.chat || []).length) return { kind: key.kind, id: key.id, messages: w.chat.slice(-60), updatedAt: w.savedAt || null, legacy: true }; }
  return c;
}
// MỘT lượt chat của dock: ngữ cảnh + phần tử ghim → chỉ dẫn + bộ tool theo khu → AI → ghi luồng theo đối tượng
async function dockTurn(b) {
  const text = typeof b.message === 'string' ? b.message.trim().slice(0, 4000) : '';
  if (!text) throw Object.assign(new Error('cần tin nhắn'), { code: 400 });
  const ctx = cleanContext(b.context), anchors = cleanAnchors(b.anchors);
  if (ctx.object && ctx.object.kind === 'work' && !store.getWork(ctx.object.id)) ctx.object = null;   // tác phẩm đã mất: về luồng của khu
  let key = chatKeyOf(ctx);
  if (!store.chatFile(key.kind, key.id)) key = { kind: 'khu', id: ctx.zone };   // id lạ (không đặt được tên tệp): về luồng của khu
  const keys = lockKeys(ctx, key), hit = keys.find(lockHit);
  if (hit) throw Object.assign(new Error(hit.startsWith('work:') ? 'AI đang ghi tác phẩm này ở một luồng khác — đợi xong rồi gửi tiếp' : 'AI đang làm lượt trước cho đối tượng này — đợi xong rồi gửi tiếp'), { code: 409 });
  const th = threadOf(key), hist = th.messages.map(x => ({ role: x.role, content: x.content })).concat({ role: 'user', content: text });
  let r;
  keys.forEach(k => chatBusy.add(k));
  // system = luật TĨNH; ngữ cảnh + hiện trạng tác phẩm + ghi chú duyệt + ghim = một tin `user` bọc JSON "dữ liệu, không phải lệnh" (CNS-118), có trần ngân sách (CNS-119)
  try { r = await ai.agent({ messages: hist, model: typeof b.model === 'string' ? b.model : '', zone: ctx.zone, system: mcp.uiSystem(ctx), context: mcp.uiContext(ctx, anchors) }, mcp); }
  finally { keys.forEach(k => chatBusy.delete(k)); }
  const at = new Date().toISOString();
  const rec = store.saveChat(key.kind, key.id, th.messages.concat(
    { role: 'user', content: text, at, pins: anchors.map(a => ({ anchor: a.anchor, label: a.label })) },
    { role: 'assistant', content: String(r.reply || '').slice(0, 6000), at: new Date().toISOString(), log: r.log.slice(0, 30), anchors: r.anchors, usage: r.usage }));
  const out = { reply: r.reply, log: r.log, renders: r.renders, usage: r.usage, sent: r.sent, model: r.model, anchors: r.anchors, chat: key, messages: rec.messages.length, context: ctx };
  if (key.kind === 'work') {
    const w = store.getWork(key.id);   // đọc lại: AI có thể đã sửa tác phẩm qua tool; luồng cũ (work.chat) đã chuyển sang data/chats → bỏ khỏi tác phẩm
    if (w) { if ((w.chat || []).length) { w.chat = []; store.saveWork(w); } out.work = mcp.workView(store.getWork(key.id)); }
  }
  return out;
}
/* ---------------------------------------------------------------- OAuth 2.1 (v0.19) */
// GC_OAUTH_RATE (1–100, mặc định 1) nhân trần TOÀN CỤC (register 200 / 10 phút, authorize 600 / phút) — chỉ dùng để chạy test số lượng lớn
const OAUTH_RATE = Math.max(1, Math.min(100, Math.round(+process.env.GC_OAUTH_RATE) || 1));
// Cho agent tự đăng ký: công tắc của chủ (Cài đặt › Kết nối agent), mặc định BẬT
const registerOn = () => settings().oauthRegister !== false;
function oauthView() {
  return { enabled: oauth.enabled, configured: !!PUBLIC_URL, publicUrl: oauth.publicUrl, mcpUrl: oauth.enabled ? oauth.resource : null, register: registerOn(), tokenSet: !!API_TOKEN,
    scopes: OAUTH_SCOPES.map(id => Object.assign({ id }, OAUTH_SCOPE_INFO[id])), redirects: oauth.redirects, accessTtl: oauth.accessTtl, clients: oauth.list() };
}
// /.well-known/oauth-* và /oauth/*. Trả true nếu đã trả lời. Tắt (thiếu GC_PUBLIC_URL) → 404 để /mcp 401 trơn như cũ
async function oauthRoute(req, res, url, p, m) {
  if (!oauth.enabled) { fail(res, 404, 'OAuth chưa bật — đặt GC_PUBLIC_URL=https://<tên-miền> trong .env'); return true; }
  const wk = /^\/\.well-known\/(oauth-protected-resource|oauth-authorization-server)(\/mcp)?$/.exec(p);
  if (wk) {   // RFC 9728 (cả dạng có hậu tố /mcp chèn sau host) + RFC 8414
    if (m !== 'GET' && m !== 'HEAD') { send(res, 405, { error: 'chỉ GET' }, null, { Allow: 'GET, HEAD' }); return true; }
    send(res, 200, wk[1] === 'oauth-protected-resource' ? oauth.protectedResource() : oauth.authServer(registerOn())); return true;
  }
  // Giới hạn tốc độ: kiểm trần IP trước, trần toàn cục (rất cao) chỉ cộng cho request đã qua trần IP; CHỈ ĐẾM thất bại (token / revoke) hoặc mọi lần (register / authorize — mỗi lần tạo trạng thái).
  // Request loopback thật (không header proxy) được miễn. Trả true nếu đã trả 429.
  const ip = clientIp(req.headers, req.socket.remoteAddress, IP_HEADER), direct = isDirectLocal(req.headers, req.socket.remoteAddress);
  const throttled = kind => { const w = direct ? 0 : oauth.gate(kind, ip, OAUTH_RATE); if (w) send(res, 429, { error: 'temporarily_unavailable', error_description: 'quá nhiều yêu cầu — thử lại sau ' + w + ' giây' }, null, { 'Retry-After': String(w) }); return !!w; };
  const tick = kind => { if (!direct) oauth.tick(kind, ip); };
  const oerr = (e) => send(res, e.code >= 400 && e.code < 600 ? e.code : 400, { error: 'invalid_request', error_description: e.message });
  if (p === '/oauth/authorize') {
    if (m !== 'GET') { send(res, 405, { error: 'chỉ GET' }, null, { Allow: 'GET' }); return true; }
    if (throttled('authorize')) return true;
    tick('authorize');
    const r = oauth.authorize(url.searchParams);
    if (r.page) { const e = errorPage(r.page); send(res, r.status || 400, e.html, 'text/html; charset=utf-8', { 'Content-Security-Policy': e.csp }); return true; }
    if (r.redirect) { res.writeHead(302, { Location: r.redirect, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); return true; }
    const pg = consentPage(r.view, { needToken: !!API_TOKEN, publicHost: new URL(oauth.publicUrl).host });
    send(res, 200, pg.html, 'text/html; charset=utf-8', { 'Content-Security-Policy': pg.csp }); return true;
  }
  if (p === '/oauth/register' || p === '/oauth/token' || p === '/oauth/revoke') {
    if (m !== 'POST') { send(res, 405, { error: 'chỉ POST' }, null, { Allow: 'POST' }); return true; }
    if (throttled(p === '/oauth/register' ? 'register' : 'token')) return true;
    if (p === '/oauth/register' && !registerOn()) { send(res, 403, { error: 'access_denied', error_description: 'chủ máy đã tắt "cho phép agent tự đăng ký" (Studio › Hệ thống › Kết nối agent)' }); return true; }
    let f; try { f = await oauthBody(req); } catch (e) { oerr(e); return true; }
    const r = p === '/oauth/register' ? oauth.register(f) : p === '/oauth/token' ? oauth.token(f) : oauth.revoke(f);
    if (p === '/oauth/register') tick('register'); else if (r.status >= 400) tick('token');   // token / revoke: chỉ đếm THẤT BẠI — request đúng không bao giờ bị trần
    send(res, r.status, r.body, null, { 'Cache-Control': 'no-store', Pragma: 'no-cache' }); return true;   // token trả về: không bao giờ vào log
  }
  fail(res, 404, 'không có đường OAuth này'); return true;
}

async function route(req, res) {
  // dot-segment / %2e: new URL() gấp chúng lại (/oauth/./register → /oauth/register) trong khi proxy / tunnel khớp đường dẫn THÔ — hai bên hiểu khác nhau là lỗ hổng. Từ chối trước mọi định tuyến
  const rawPath = String(req.url || '').split('?')[0].split('#')[0];
  if (/%2e/i.test(rawPath) || /(^|\/)\.{1,2}(\/|$)/.test(rawPath)) return fail(res, 400, 'đường dẫn không hợp lệ (dot-segment)');
  const url = new URL(req.url, 'http://local');
  let p = url.pathname;
  const m = req.method;
  // Link MCP có khoá: sai khoá trả 404 như đường không tồn tại
  let viaLink = false;
  const lm = /^\/mcp\/([A-Za-z0-9_-]+)$/.exec(p);
  if (lm) {
    if (!MCP_KEY || !safeEq(lm[1], MCP_KEY)) return fail(res, 404, 'không có');
    p = '/mcp'; viaLink = true;
  }
  // Chống DNS rebinding: chỉ phục vụ khi Host là máy cục bộ (hoặc tên được cho phép trong GC_ALLOWED_HOSTS)
  const hostName = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostAllowed(hostName)) return fail(res, 403, 'Host không được phép');
  // Không có token thì chỉ phục vụ kết nối từ chính máy này (Host có thể bị giả, nên kiểm địa chỉ thật).
  // Trong Docker, cổng ngoài đã khoá 127.0.0.1 và CLI từ chối mở ra mạng khi thiếu token.
  if (!API_TOKEN && !IN_DOCKER && !/^(127\.|::1$|::ffff:127\.)/.test(String(req.socket.remoteAddress || ''))) return fail(res, 403, 'chỉ phục vụ máy cục bộ (đặt GC_API_TOKEN để mở cho máy khác)');
  // Request đi qua tunnel/reverse proxy (cloudflared, ngrok, nginx…) không phân biệt được với máy cục bộ
  // bằng địa chỉ hay Host (tunnel chạy trên chính máy này, có thể đổi Host thành localhost). Dấu vết duy nhất là
  // header chuyển tiếp: thấy nó mà chưa có token thì từ chối hết — không bao giờ để app mở ra Internet không khoá.
  const viaProxy = !!(req.headers['x-forwarded-for'] || req.headers.forwarded || req.headers['cf-connecting-ip'] || req.headers['x-real-ip']);
  if (!API_TOKEN && viaProxy && !viaLink) return fail(res, 403, 'đang đi qua tunnel/proxy: phải đặt GC_API_TOKEN trước khi mở ra ngoài');

  // ---- OAuth (v0.19): khám phá + đăng ký + token + thu hồi là đường MÁY (công khai, bảo vệ bằng PKCE / token — không cần cookie hay phiên Studio); authorize là trang cho chủ
  if (p.startsWith('/oauth/') || p.startsWith('/.well-known/oauth-')) { const done = await oauthRoute(req, res, url, p, m); if (done) return; }

  // Đã đặt token: mọi /api (trừ health) và /mcp đều cần token, bất kể Host hay địa chỉ. Studio đăng nhập bằng token.
  // /mcp còn nhận access token OAuth (Authorization: Bearer): phạm vi → kênh SẴN CÓ (scopeCtx). Không có / sai token → 401 + WWW-Authenticate trỏ metadata để agent tự khám phá.
  let mcpCtx = { viaLink }, oauthGrant = null;
  if (p === '/mcp' && !viaLink) {
    const b = bearerOf(req), owner = !!API_TOKEN && tokenOk(b);
    oauthGrant = !owner && oauth.enabled ? oauth.verify(b) : null;   // token OAuth hợp lệ luôn được áp phạm vi của nó — kể cả khi không đặt GC_API_TOKEN (quyền ít hơn quyền chủ máy cục bộ)
    if (oauthGrant) mcpCtx = scopeCtx(oauthGrant.scope);
    else if (API_TOKEN && !owner) return send(res, 401, { error: 'cần token của bản cài' + (oauth.enabled ? ' hoặc kết nối OAuth (xem WWW-Authenticate)' : '') }, null, oauth.enabled ? { 'WWW-Authenticate': 'Bearer resource_metadata="' + oauth.metaUrl + '"' } : undefined);
  }
  if (API_TOKEN && !viaLink && p.startsWith('/api/') && p !== '/api/health' && !tokenOk(bearerOf(req))) {
    // approve là đường /api duy nhất tunnel mở ra Internet → chỗ thử token chủ máy. Token ĐÚNG không bao giờ bị trần; chỉ đếm (theo IP) và chặn các lần SAI
    if (p === '/api/oauth/approve' && oauth.enabled && !isDirectLocal(req.headers, req.socket.remoteAddress)) {
      const ip = clientIp(req.headers, req.socket.remoteAddress, IP_HEADER), w = oauth.gate('approve', ip);
      if (w) return send(res, 429, { error: 'quá nhiều lần sai token — thử lại sau ' + w + ' giây' }, null, { 'Retry-After': String(w) });
      oauth.tick('approve', ip);
    }
    return fail(res, 401, 'cần token của bản cài');
  }

  // ---- MCP (Streamable HTTP, trả JSON). Chống CSRF: bắt buộc Content-Type JSON (trang khác gửi kiểu này phải qua preflight, server không cho)
  if (p === '/mcp') {
    // GET cho agent KHÔNG có MCP client (trung lập model, INT-05): ?guide=<chủ đề> → markdown · ?tools=openai|gemini|mcp → schema tool
    if (m === 'GET' && (url.searchParams.has('guide') || url.searchParams.has('tools'))) {
      if (url.searchParams.has('guide')) { const md = Agent.guide(url.searchParams.get('guide') || 'guide'); return md == null ? fail(res, 404, 'chủ đề lạ: ' + Agent.topics().map(t => t.id).join(', ')) : send(res, 200, md, 'text/markdown; charset=utf-8'); }
      const out = Agent.toolsExport(MCP_TOOLS, url.searchParams.get('tools') || 'openai'); return out ? send(res, 200, out) : fail(res, 400, 'tools: openai | gemini | mcp');
    }
    if (m !== 'POST') return send(res, 405, { error: 'MCP: chỉ nhận POST (GET ?guide=<chủ đề> hoặc ?tools=openai|gemini|mcp cho agent không có MCP client)' }, null, { Allow: 'POST' });
    // Origin chỉ chống CSRF cho request mang quyền "có sẵn" (cục bộ không token, hoặc token chủ máy do trình duyệt tự gắn); access token OAuth là Bearer tường minh → backend của agent gọi (không có Origin hoặc claude.ai) không bị chặn
    if (!oauthGrant && !originOK(req)) return fail(res, 403, 'Origin không được phép');
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return fail(res, 415, 'MCP cần Content-Type: application/json');
    const msg = await body(req, 2 * 1024 * 1024);
    if (Array.isArray(msg)) {
      if (msg.length > 20) return fail(res, 413, 'MCP: một lô JSON-RPC tối đa 20 lời gọi');   // lô lớn × lời gọi nặng = chặn server lâu (CNS-061)
      const out = (await Promise.all(msg.map(x => mcp.handle(x, mcpCtx)))).filter(Boolean);
      return out.length ? send(res, 200, out) : send(res, 202, '');
    }
    const r = await mcp.handle(msg, mcpCtx);
    return r ? send(res, 200, r) : send(res, 202, '');
  }

  if (!p.startsWith('/api/')) return m === 'GET' ? serveStatic(req, res, p) : fail(res, 405, 'không hỗ trợ');
  // Chống CSRF: lệnh thay đổi phải có header riêng (form của trang khác không gửi được;
  // fetch từ nguồn khác bị preflight chặn vì server không trả CORS) và Origin (nếu có) phải trùng Host
  if (m !== 'GET') {
    if (req.headers['x-gc-request'] !== '1') return fail(res, 403, 'thiếu header X-GC-Request');
    if (!originOK(req)) return fail(res, 403, originMsg(req));
  }

  if (p === '/api/health') return send(res, 200, { ok: true, version: VERSION, uiLang: settings().uiLang });   // uiLang công khai: màn đăng nhập (chưa có token) cũng nói đúng ngôn ngữ của máy
  if (p === '/api/info') return send(res, 200, { version: VERSION, repo: REPO, home: HOME, port: PORT, settings: settings(), uiLang: settings().uiLang, lang: langOf(req), mcp: { http: '/mcp', stdio: 'genchibi mcp', link: PUBLIC_URL && MCP_KEY ? PUBLIC_URL + '/mcp/' + MCP_KEY : null, oauth: oauth.enabled ? oauth.resource : null } });
  if (p === '/api/settings' && m === 'PUT') {
    const b = await body(req);
    const s = settings();
    if (typeof b.autoUpdate === 'boolean') s.autoUpdate = b.autoUpdate;
    if (Number.isFinite(b.checkHours) && b.checkHours >= 1 && b.checkHours <= 168) s.checkHours = Math.round(b.checkHours);
    if (typeof b.oauthRegister === 'boolean') s.oauthRegister = b.oauthRegister;
    if (b.uiLang !== undefined) { const l = L10N.norm(b.uiLang); if (!l) return fail(res, 400, 'uiLang phải là en hoặc vi'); s.uiLang = l; }   // ngôn ngữ mặc định của máy (Hệ thống › Ngôn ngữ)
    writeJSON(SETTINGS, s);
    scheduleChecks();
    return send(res, 200, s);
  }

  // ---- cập nhật
  if (p === '/api/update' && m === 'GET') return send(res, 200, Object.assign(updater.status(), { settings: settings() }));
  if (p === '/api/update/check' && m === 'POST') {
    try { return send(res, 200, Object.assign(await updater.check(), { settings: settings() })); }
    catch (e) { updater.state.error = e.message; updater.state.lastCheck = new Date().toISOString(); return fail(res, 502, 'Không kiểm tra được phiên bản: ' + e.message); }
  }
  if (p === '/api/update/apply' && m === 'POST') {
    const b = await body(req);
    try { const r = await updater.apply({ force: b.force === true }); send(res, 200, r); if (r.restart) restartSoon(); return; }
    catch (e) { return fail(res, 502, 'Cập nhật thất bại, vẫn chạy bản hiện tại: ' + e.message); }
  }
  if (p === '/api/update/rollback' && m === 'POST') {
    const b = await body(req);
    if (b.confirm !== 'ROLLBACK') return fail(res, 400, 'cần xác nhận hai bước');
    try { const r = updater.rollback(); send(res, 200, r); restartSoon(); return; }
    catch (e) { return fail(res, 400, e.message); }
  }

  // ---- kết nối agent (OAuth, v0.19): chủ máy duyệt + quản lý. Đã qua cổng /api: token chủ máy (hoặc cục bộ không token) + X-GC-Request + originOK — KHÔNG tin cổng đăng nhập ngoài app
  if (p === '/api/oauth' && m === 'GET') return send(res, 200, oauthView());
  if (p === '/api/oauth/approve' && m === 'POST') {
    if (!oauth.enabled) return fail(res, 404, 'OAuth chưa bật — đặt GC_PUBLIC_URL');
    const b = await body(req, 8 * 1024), r = oauth.approve(b.request, b.decision, typeof b.scope === 'string' ? b.scope : '');
    if (!r.redirect) return fail(res, r.status || 400, r.error);
    log('[oauth] chủ máy ' + (b.decision === 'approve' ? 'đã cấp phép (' + b.scope + ')' : 'đã từ chối') + ' một kết nối agent');
    return send(res, 200, { redirect: r.redirect });
  }
  const ocm = p.match(/^\/api\/oauth\/clients\/(?!(?:__proto__|constructor|prototype)(?:\/|$))([A-Za-z0-9_-]{1,128})(\/revoke)?$/);
  if (ocm && !ocm[2] && m === 'PUT') { const b = await body(req, 4 * 1024); return oauth.setScope(ocm[1], b.scope) ? send(res, 200, oauthView()) : fail(res, 400, 'client không có hoặc phạm vi không hợp lệ'); }
  if (ocm && ocm[2] && m === 'POST') { if (!oauth.revokeClient(ocm[1])) return fail(res, 404, 'không có client này'); log('[oauth] chủ máy thu hồi một kết nối agent'); return send(res, 200, oauthView()); }

  // ---- core AI (LLM qua API chuẩn OpenAI; key mã hoá, không trả về trình duyệt)
  if (p === '/api/ai' && m === 'GET') return send(res, 200, Object.assign(ai.publicConfig(), { zones: mcp.zoneInfo() }));   // zones: nhãn / vai / lời giới thiệu theo khu cho dock (một nguồn: mcp ZONES)
  if (p === '/api/ai' && m === 'PUT') return send(res, 200, ai.setConfig(await body(req)));
  if (p === '/api/ai/models' && m === 'GET') {
    try { return send(res, 200, await ai.models()); } catch (e) { return fail(res, e.code || 502, 'Không lấy được danh sách model: ' + e.message); }
  }
  if (p === '/api/ai/bench' && m === 'GET') return send(res, 200, ai.bench());
  // ---- giọng AI (Google Gemini TTS): bật / key / model quét lúc chạy; đọc một câu → clip WAV lưu đệm theo nội dung
  if (p === '/api/voice' && m === 'GET') return send(res, 200, voice.publicConfig());
  if (p === '/api/voice' && m === 'PUT') {
    const b = await body(req);
    // dán key → kiểm ngay (lệnh liệt kê model, miễn phí) rồi tự bật; sai key thì giữ key cũ, báo rõ
    if (typeof b.apiKey === 'string' && b.apiKey.trim()) { try { return send(res, 200, await voice.connect(b.apiKey)); } catch (e) { return fail(res, e.code >= 400 && e.code < 600 ? e.code : 502, e.message); } }
    return send(res, 200, voice.setConfig(b));
  }
  if (p === '/api/voice/models' && m === 'GET') { try { return send(res, 200, await voice.models()); } catch (e) { return fail(res, e.code || 502, e.message); } }
  // lỗi giọng AI → mã HTTP + retryAt (hết lượt) cho Studio
  const vfail = (e) => send(res, e.code >= 400 && e.code < 600 ? e.code : 502, Object.assign({ error: e.message }, e.retryAt ? { retryAt: e.retryAt } : {}, e.cap ? { cap: true } : {}));   // cap: chạm trần ngày của chủ máy (khác Google hết lượt)
  if (p === '/api/voice/line' && m === 'POST') {
    const b = await body(req);
    // voice = giọng đã cast cho cả tác phẩm (api/voice/cast); không gửi thì chọn theo nhân vật (character) / vai (role) + ngôn ngữ.
    // role → cách nói của vai; state + bubble → cảm xúc. dry: chỉ lấy clip đã đọc (xuất phim) — chưa có thì 404, không gọi Google
    const A = b.character ? mcp.findAsset(String(b.character)) : null;
    if (b.character && !A) return fail(res, 404, 'không có nhân vật ' + String(b.character).slice(0, 60));
    try {
      const v = b.voice && b.voice !== 'auto' && !A && b.role ? { voice: b.voice, role: b.role, lang: b.lang, accent: b.accent } : await voice.pick({ asset: A, voice: b.voice, role: b.role, lang: b.lang, accent: b.accent });
      const r = await voice.line({ text: b.text, voice: v.voice, role: v.role, state: b.state, bubble: b.bubble, dry: b.dry === true });
      return send(res, 200, Object.assign(r, { voice: v.voice, role: v.role, url: 'api/voice/clip/' + r.id + '.wav' }));
    } catch (e) { return e.code === 404 && b.dry === true ? send(res, 200, { found: false }) : vfail(e); }   // dry: câu chưa đọc không phải lỗi (khỏi rác console khi xuất phim)
  }
  // cả dàn diễn viên một tác phẩm → mỗi người một giọng AI (thiết kế → thư viện → dựng sẵn); không tốn lượt đọc
  // work → giọng CHỐT vào tác phẩm (Studio, MCP, phim xuất cùng giọng; thêm diễn viên không đổi giọng người cũ)
  if (p === '/api/voice/cast' && m === 'POST') {
    try { const b = await body(req); return send(res, 200, b.work ? await mcp.castWork(String(b.work), b) : await voice.cast(b)); } catch (e) { return vfail(e); }
  }
  // giọng chọn được cho một ngôn ngữ: thư viện Google (quét lúc chạy, lưu 24 giờ) + giọng đã thiết kế + 30 giọng dựng sẵn
  if (p === '/api/voice/library' && m === 'GET') {
    const L = GV.lang(url.searchParams.get('lang')), code = GV.cast({ id: 'x' }, { lang: L, accent: url.searchParams.get('accent') }).libLang;
    let lib = []; try { lib = await voice.library(code); } catch (e) { lib = []; }   // mất mạng / chưa có key: chỉ còn giọng dựng sẵn
    const have = new Set(lib.map(v => v.id));
    const pre = VOICES.filter(v => !have.has(v.name)).map(v => ({ id: v.name, name: v.name, gender: v.gender === 'nữ' ? 'f' : 'm', age: null, pitch: '', description: v.style, type: 'prebuilt' }));
    return send(res, 200, { lang: L, code, voices: lib.concat(pre) });
  }
  // THIẾT KẾ giọng cho một vai (tốn một lượt; vai trẻ em bị Google chặn → 400)
  if (p === '/api/voice/design' && m === 'POST') { try { return send(res, 200, await voice.design(await body(req))); } catch (e) { return vfail(e); } }
  if (p.startsWith('/api/voice/clip/') && m === 'GET') {
    const f = voice.clipPath(p.slice('/api/voice/clip/'.length).replace(/\.wav$/, ''));
    if (!f || !fs.existsSync(f)) return fail(res, 404, 'chưa có clip');
    const buf = fs.readFileSync(f);   // tên tệp = băm nội dung → không bao giờ đổi: cho trình duyệt giữ lâu
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    return res.end(buf);
  }
  if (p === '/api/ai/test' && m === 'POST') { const b = await body(req); return send(res, 200, await ai.test(typeof b.model === 'string' ? b.model : '')); }
  if (p === '/api/ai/agent' && m === 'POST') {
    const b = await body(req);
    try {
      if (typeof b.message === 'string') return send(res, 200, await dockTurn(b));   // dock: ngữ cảnh + ghim + luồng theo đối tượng
      // kiểu cũ { messages } (client không có dock): vai của Xưởng, không lưu luồng
      return send(res, 200, await ai.agent({ messages: b.messages, model: typeof b.model === 'string' ? b.model : '', zone: cleanContext(b.context).zone }, mcp));
    } catch (e) { return fail(res, e.code || 502, e.message); }
  }
  // luồng chat theo đối tượng: GET đọc · DELETE xoá (Studio hỏi lại trước)
  const cm = p.match(/^\/api\/chats\/([a-z]+)\/([A-Za-z0-9._~-]{1,81})$/);
  if (cm && CHAT_KINDS.indexOf(cm[1]) >= 0) {
    const key = { kind: cm[1], id: cm[2].toLowerCase() };
    if (m === 'GET') { const c = threadOf(key); return c ? send(res, 200, c) : fail(res, 400, 'đối tượng hội thoại không hợp lệ'); }
    if (m === 'DELETE') {
      const had = store.clearChat(key.kind, key.id);
      if (key.kind === 'work') { const w = store.getWork(key.id); if (w && (w.chat || []).length) { w.chat = []; store.saveWork(w); } }   // luồng cũ nằm trong tác phẩm cũng bỏ
      return send(res, 200, { ok: true, cleared: had });
    }
  }
  if (p === '/api/ai/director' && m === 'POST') {
    const b = await body(req);
    try { return send(res, 200, await ai.director(b, store.listAssets())); } catch (e) { return fail(res, e.code || 502, e.message); }
  }

  // ---- kịch bản sự kiện (do Studio hoặc agent qua MCP lưu)
  if (p === '/api/events' && m === 'GET') return send(res, 200, store.listEvents());
  if (p === '/api/events' && m === 'POST') {
    const b = await body(req);
    mcp.sync();
    const errs = engine.director.validate(b.event, engine.assets());
    if (errs.length) return fail(res, 400, errs.join('; '));
    return send(res, 200, store.saveEvent(b.event, b.author || 'Studio'));
  }
  const em = p.match(/^\/api\/events\/([a-z0-9-]{1,80})$/);
  if (em && m === 'GET') { const e = store.getEvent(em[1]); return e ? send(res, 200, e) : fail(res, 404, 'không có kịch bản này'); }

  // ---- asset có phiên bản
  // ---- tác phẩm (khu Tạo tác): kịch bản, phân cảnh, chat với AI đạo diễn — ghi qua đúng cổng của MCP
  if (p === '/api/works' && m === 'GET') return send(res, 200, mcp.listWorks());
  if (p === '/api/works' && m === 'POST') {
    const b = await body(req);
    try { return send(res, 200, mcp.workView(mcp.saveWorkChecked(b))); } catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null }); }
  }
  const wm = p.match(/^\/api\/works\/([a-z0-9][a-z0-9-]{0,63})(\/shots|\/chat|\/proposals)?$/);
  // tác phẩm trả về Studio luôn mang tên thư viện mới (phân cảnh lưu trước v0.12 có thể còn afi.*)
  if (wm && !wm[2] && m === 'GET') { const w = store.getWork(wm[1]); return w ? send(res, 200, mcp.workView(w)) : fail(res, 404, 'không có tác phẩm này'); }
  if (wm && wm[2] === '/shots' && m === 'POST') {
    const b = await body(req, 200 * 1024);
    // warnings (luật ghép âm S2–S5, S7 — v0.18) đi kèm tác phẩm trả về để Studio hiện cạnh phân cảnh; lỗi (S1, S6) là 422 có errors[] kèm path
    try { const r = mcp.saveShotChecked(Object.assign({}, b, { work: wm[1] })), w = mcp.workView(store.getWork(wm[1])); if (r.warnings) w.warnings = r.warnings; return send(res, 200, w); }
    catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null }); }
  }
  // đề xuất sửa của AI chờ chủ duyệt (propose_edit): { id, action: 'apply' | 'dismiss' } — áp dụng đi qua cổng phân cảnh như mọi lần lưu
  if (wm && wm[2] === '/proposals' && m === 'POST') {
    const b = await body(req, 8 * 1024);
    try { return send(res, 200, mcp.canonRefs(mcp.workView(mcp.resolveProposal(wm[1], b.id, b.action)))); }
    catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null }); }
  }
  // chat của một tác phẩm (đường cũ của AI đạo diễn) = dock với ngữ cảnh Tạo tác + tác phẩm đó; cùng một luồng data/chats/work-<id>.json
  if (wm && wm[2] === '/chat' && m === 'POST') {
    const b = await body(req);
    if (!store.getWork(wm[1])) return fail(res, 404, 'không có tác phẩm này');
    try { return send(res, 200, await dockTurn(Object.assign({}, b, { context: { zone: 'tao-tac', page: 'works', object: { kind: 'work', id: wm[1] } } }))); }
    catch (e) { return fail(res, e.code || 502, e.message); }
  }
  if (p === '/api/projects' && m === 'GET') { mcp.sync(); return send(res, 200, mcp.projects()); }
  if (p === '/api/projects/export' && m === 'GET') {
    const q = new URL(req.url, 'http://local').searchParams;
    try { return send(res, 200, mcp.exportProject(q.get('id') || '', { sale: q.get('sale') === '1' })); } catch (e) { return fail(res, e.code || 400, e.message); }
  }
  if (p === '/api/projects/import' && m === 'POST') {
    const b = await body(req, 8 * 1024 * 1024);
    try { return send(res, 200, mcp.importProject(b.bundle, { overwrite: b.overwrite === true })); }
    catch (e) { return send(res, e.code || 400, { error: e.message, conflicts: e.conflicts || null }); }
  }
  if (p === '/api/projects' && m === 'POST') {
    const b = await body(req);
    try { return send(res, 200, store.saveProject(b)); } catch (e) { return fail(res, e.code || 400, e.message); }
  }
  if (p === '/api/parts' && m === 'GET') return send(res, 200, store.listParts());
  if (p === '/api/items' && m === 'GET') return send(res, 200, store.listItems());
  if (p === '/api/items' && m === 'POST') {
    const b = await body(req);
    try { return send(res, 200, mcp.saveItemChecked(b.item, b.note || 'Lưu trong Studio')); } catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null }); }
  }
  if (p === '/api/scenes' && m === 'GET') return send(res, 200, store.listScenes());
  if (p === '/api/scenes' && m === 'POST') {
    const b = await body(req);
    try { return send(res, 200, mcp.saveSceneChecked(b.scene, b.note || 'Lưu trong Studio')); } catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null }); }
  }
  // hướng dẫn agent (một nguồn agent/) cho Studio + agent cục bộ: /api/agent/guide?topic= · /api/agent/tools?format=openai|gemini|mcp
  if (p === '/api/agent/guide' && m === 'GET') { const md = Agent.guide(url.searchParams.get('topic') || 'guide'); return md == null ? fail(res, 404, 'chủ đề lạ') : send(res, 200, md, 'text/markdown; charset=utf-8'); }
  if (p === '/api/agent/topics' && m === 'GET') return send(res, 200, Agent.topics());
  if (p === '/api/agent/skill' && m === 'GET') {   // lớp bọc của một hãng (claude | cursor | gemini | codex | generic) dạng tar — genchibi agent skill
    const files = Agent.wrapper(url.searchParams.get('vendor')); if (!files) return fail(res, 400, 'vendor: ' + Agent.VENDORS.join(' | '));
    return send(res, 200, require('./tar').packTar(files), 'application/x-tar');
  }
  if (p === '/api/agent/tools' && m === 'GET') { const out = Agent.toolsExport(MCP_TOOLS, url.searchParams.get('format') || 'openai'); return out ? send(res, 200, out) : fail(res, 400, 'format: openai | gemini | mcp'); }
  if (p === '/api/motion-packs' && m === 'GET') return send(res, 200, store.listMotionPacks());
  if (p === '/api/motion-packs' && m === 'POST') {
    const b = await body(req, 400 * 1024);
    try { return send(res, 200, mcp.saveMotionPackChecked(b.pack, b.note || 'Lưu trong Studio')); } catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null }); }
  }
  // gói âm (v0.18): GET = bản đã lưu (Studio nạp vào GC.sounds lúc mở); POST = qua cổng GC.sounds + lưu phiên bản; trả bản xuất sạch + warnings
  if (p === '/api/sound-packs' && m === 'GET') return send(res, 200, store.listSoundPacks());
  if (p === '/api/sound-packs' && m === 'POST') {
    const b = await body(req, 400 * 1024);
    // 409 = còn chỗ gọi âm bị bỏ / dự án đổi (conflicts[] liệt kê từng chỗ); body.force = true để chủ máy làm (Studio hỏi lại trước)
    try { return send(res, 200, mcp.saveSoundPackChecked(b.pack, b.note || 'Lưu trong Studio', { force: b.force === true })); } catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null, conflicts: e.conflicts || null }); }
  }
  // gỡ gói âm (chỉ chủ máy — đường /api/ là Studio; link MCP / AI chatroom không có): còn chỗ gọi thì 409 + conflicts[]; ?force=1 để gỡ. Tệp vào thùng rác
  const spm = p.match(/^\/api\/sound-packs\/([a-z0-9][a-z0-9-]{1,39})$/);
  if (spm && m === 'DELETE') {
    try { return send(res, 200, mcp.deleteSoundPackChecked(spm[1], { force: url.searchParams.get('force') === '1' })); } catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null, conflicts: e.conflicts || null }); }
  }
  if (p === '/api/parts' && m === 'POST') {
    const b = await body(req, 400 * 1024);
    try { return send(res, 200, mcp.savePartChecked(b.part, b.note || 'Lưu trong Studio')); } catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null }); }
  }   // linh kiện dữ liệu của thư viện "Của tôi"
  if (p === '/api/assets' && m === 'GET') return send(res, 200, store.listAssets());
  const am = p.match(/^\/api\/assets\/([^/]+)\/([^/]+)(\/versions(?:\/(\d+))?)?$/);
  if (am) {
    const key = am[1] + '/' + am[2];
    if (!KEY.test(key)) return fail(res, 400, 'khoá asset không hợp lệ');
    if (am[3]) {
      if (am[4]) { const v = store.version(key, am[4]); return v ? send(res, 200, v) : fail(res, 404, 'không có phiên bản này'); }
      return send(res, 200, store.versionsOf(key));
    }
    if (m === 'GET') { const a = store.getAsset(key); return a ? send(res, 200, a) : fail(res, 404, 'chưa có bản lưu'); }
    if (m === 'PUT') {
      // Studio ghi qua CÙNG cổng kiểm với MCP và AI (mcp.saveAssetChecked) — không có lối ghi thẳng
      const b = await body(req), sp = key.split('/');
      try { return send(res, 200, mcp.saveAssetChecked(Object.assign({}, b, { pack: sp[0], id: sp[1] }), b._note || 'Chỉnh trong Studio', { allowAnyPack: true })); }
      catch (e) { return send(res, e.code || 400, { error: e.message, gates: e.gates || null }); }
    }
    if (m === 'DELETE') return store.trashAsset(key) ? send(res, 200, { ok: true }) : fail(res, 404, 'chưa có bản lưu');
  }
  return fail(res, 404, 'không có API này');
}

const server = http.createServer((req, res) => {
  route(req, res).catch(e => { log('[server] lỗi', e.message); if (!res.headersSent) fail(res, e.code && e.code >= 400 && e.code < 600 ? e.code : 500, e.message); });
});

/* ---------------------------------------------------------------- tự kiểm tra phiên bản */
let timer = null;
async function autoCheck() {
  const s = settings();
  try {
    const st = await updater.check();
    log('[updater] kiểm tra: hiện tại v' + VERSION.replace(/^v/, '') + ', mới nhất ' + st.latest + (st.available ? ' (có bản mới)' : ''));
    if (st.available && s.autoUpdate) {
      const r = await updater.apply();
      if (r.restart) restartSoon();
    }
  } catch (e) { log('[updater] không kiểm tra được:', e.message); }
}
function scheduleChecks() {
  clearInterval(timer);
  timer = setInterval(autoCheck, settings().checkHours * 3600 * 1000);
}

server.listen(PORT, HOST, () => {
  log('[server] gen-chibi v' + VERSION.replace(/^v/, '') + ' chạy tại http://' + HOST + ':' + PORT + ' · home ' + HOME);
  scheduleChecks();
  if (process.env.GC_NO_AUTOCHECK !== '1') setTimeout(autoCheck, 15000);
});
process.on('SIGTERM', () => server.close(() => { oauth.flush(); process.exit(0); }));
