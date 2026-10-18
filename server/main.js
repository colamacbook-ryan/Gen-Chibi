// gen-chibi — server cục bộ (Node thuần, không phụ thuộc thư viện ngoài)
// © 2026 Afi Labs — All rights reserved.
// Phục vụ Studio + API (asset có phiên bản, kịch bản, core AI, cập nhật) + MCP cho agent.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Updater, RESTART_CODE } = require('./updater');
const { Secrets } = require('./secrets');
const { AI } = require('./ai');
const { MCP, INSTRUCTIONS: MCP_INSTRUCTIONS } = require('./mcp');
const { Store, KEY, readJSON, writeJSON } = require('./store');
const { loadEngine } = require('./engine-node');

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
function settings() { return Object.assign({ autoUpdate: process.env.GC_AUTO_UPDATE !== '0', checkHours: 6 }, readJSON(SETTINGS, {})); }

const store = new Store(DATA);
const engine = loadEngine(APP);
const updater = new Updater({ home: HOME, version: VERSION, repo: REPO, feedUrl: process.env.GC_FEED_URL, log });
const ai = new AI({ dataDir: DATA, secrets: new Secrets(DATA), engine });
const mcp = new MCP({ engine, store, version: VERSION, system: { updater, restartSoon } });

/* ---------------------------------------------------------------- tiện ích HTTP */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };
function send(res, code, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8', 'Content-Length': buf.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY'
  });
  res.end(buf);
}
function fail(res, code, message) { send(res, code, { error: message }); }
function body(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('dữ liệu gửi lên quá lớn (tối đa 1 MB)'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!n) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('JSON không hợp lệ'), { code: 400 })); }
    });
    req.on('error', reject);
  });
}

/* ---------------------------------------------------------------- tệp tĩnh */
const STATIC_ROOTS = ['engine', 'kinds', 'studio'];
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (rel === '' || rel === 'index.html') rel = 'studio/index.html';
  if (rel === 'CHANGELOG.md' || rel === 'VERSION') return send(res, 200, fs.readFileSync(path.join(APP, rel)), MIME[path.extname(rel)] || 'text/plain; charset=utf-8');
  const top = rel.split('/')[0];
  if (!STATIC_ROOTS.includes(top) || rel.split('/').includes('..')) return fail(res, 404, 'không tìm thấy');
  const file = path.join(APP, rel);
  if (!file.startsWith(APP + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, 'không tìm thấy');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
}

/* ---------------------------------------------------------------- định tuyến */
function restartSoon() { setTimeout(() => { log('[server] thoát để launcher khởi động lại'); process.exit(RESTART_CODE); }, 400); }
function originOK(req) {
  const origin = req.headers.origin;
  return !origin || origin === 'null' || new URL(origin).host === req.headers.host;
}

async function route(req, res) {
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
  // Đã đặt token: mọi /api (trừ health) và /mcp đều cần token, bất kể Host hay địa chỉ. Studio đăng nhập bằng token.
  if (API_TOKEN && !viaLink && (p === '/mcp' || (p.startsWith('/api/') && p !== '/api/health'))) {
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers['x-gc-token'] || '');
    if (!tokenOk(auth)) return fail(res, 401, 'cần token của bản cài');
  }

  // ---- MCP (Streamable HTTP, trả JSON). Chống CSRF: bắt buộc Content-Type JSON (trang khác gửi kiểu này phải qua preflight, server không cho)
  if (p === '/mcp') {
    if (m !== 'POST') return send(res, 405, { error: 'MCP: chỉ nhận POST' });
    if (!originOK(req)) return fail(res, 403, 'Origin không được phép');
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return fail(res, 415, 'MCP cần Content-Type: application/json');
    const msg = await body(req, 2 * 1024 * 1024);
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map(x => mcp.handle(x, { viaLink })))).filter(Boolean);
      return out.length ? send(res, 200, out) : send(res, 202, '');
    }
    const r = await mcp.handle(msg, { viaLink });
    return r ? send(res, 200, r) : send(res, 202, '');
  }

  if (!p.startsWith('/api/')) return m === 'GET' ? serveStatic(req, res, p) : fail(res, 405, 'không hỗ trợ');
  // Chống CSRF: lệnh thay đổi phải có header riêng (form của trang khác không gửi được;
  // fetch từ nguồn khác bị preflight chặn vì server không trả CORS) và Origin (nếu có) phải trùng Host
  if (m !== 'GET') {
    if (req.headers['x-gc-request'] !== '1') return fail(res, 403, 'thiếu header X-GC-Request');
    if (!originOK(req)) return fail(res, 403, 'yêu cầu từ nguồn lạ bị chặn');
  }

  if (p === '/api/health') return send(res, 200, { ok: true, version: VERSION });
  if (p === '/api/info') return send(res, 200, { version: VERSION, repo: REPO, home: HOME, port: PORT, settings: settings(), mcp: { http: '/mcp', stdio: 'genchibi mcp', link: PUBLIC_URL && MCP_KEY ? PUBLIC_URL + '/mcp/' + MCP_KEY : null } });
  if (p === '/api/settings' && m === 'PUT') {
    const b = await body(req);
    const s = settings();
    if (typeof b.autoUpdate === 'boolean') s.autoUpdate = b.autoUpdate;
    if (Number.isFinite(b.checkHours) && b.checkHours >= 1 && b.checkHours <= 168) s.checkHours = Math.round(b.checkHours);
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

  // ---- core AI (LLM qua API chuẩn OpenAI; key mã hoá, không trả về trình duyệt)
  if (p === '/api/ai' && m === 'GET') return send(res, 200, ai.publicConfig());
  if (p === '/api/ai' && m === 'PUT') return send(res, 200, ai.setConfig(await body(req)));
  if (p === '/api/ai/models' && m === 'GET') {
    try { return send(res, 200, await ai.models()); } catch (e) { return fail(res, e.code || 502, 'Không lấy được danh sách model: ' + e.message); }
  }
  if (p === '/api/ai/bench' && m === 'GET') return send(res, 200, ai.bench());
  if (p === '/api/ai/test' && m === 'POST') { const b = await body(req); return send(res, 200, await ai.test(typeof b.model === 'string' ? b.model : '')); }
  if (p === '/api/ai/agent' && m === 'POST') {
    const b = await body(req);
    try { return send(res, 200, await ai.agent({ messages: b.messages, model: typeof b.model === 'string' ? b.model : '' }, mcp, MCP_INSTRUCTIONS)); }
    catch (e) { return fail(res, e.code || 502, e.message); }
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
  if (p === '/api/parts' && m === 'GET') return send(res, 200, store.listParts());
  if (p === '/api/items' && m === 'GET') return send(res, 200, store.listItems());
  if (p === '/api/items' && m === 'POST') {
    const b = await body(req);
    try { return send(res, 200, mcp.saveItemChecked(b.item, b.note || 'Lưu trong Studio')); } catch (e) { return send(res, e.code || 400, { error: e.message, errors: e.errors || null }); }
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
process.on('SIGTERM', () => server.close(() => process.exit(0)));
