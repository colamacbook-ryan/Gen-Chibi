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
const { Auth } = require('./auth');                       // v0.21: đăng nhập chủ máy — mật khẩu / phiên / cookie thiết bị / token chủ (spec §3.3–§3.4); v0.23: admin / admin + khởi tạo
const { Setup, adminReasons, loginReasons } = require('./setup');       // v0.23: thiết lập lần đầu — data/setup.json stage + cửa sổ admin run/admin-window (spec v023 §A.0 / §A.1)
const { OnlineConfig } = require('./online-config');      // v0.21: data/online.json — publicUrl / Host / header IP đọc LÚC CHẠY (spec §3.2)
const { consentPage, errorPage } = require('./oauth-page');
const { Store, KEY, CHAT_KINDS, readJSON, writeJSON } = require('./store');
const { loadEngine } = require('./engine-node');
const L10N = require('./i18n');   // ngôn ngữ (ADR 0007): langOf(req) + tr(lang, msgid) — builder sau dịch câu server qua đây
const VI = (msgid, vars) => L10N.tr('vi', msgid, vars);   // câu tiếng Việt dựng từ MẪU (msgid có {x}): localize() khớp ngược sang ngôn ngữ người gọi; công cụ quét thấy msgid
const MSG = require('./i18n-msg');   // câu ghép động (khớp ngược mẫu {x}) + ngôn ngữ của yêu cầu đang chạy (AsyncLocalStorage) — v0.20

const APP = path.resolve(__dirname, '..');                       // thư mục phiên bản đang chạy
const HOME = process.env.GC_HOME || (path.basename(path.dirname(APP)) === 'releases' ? path.resolve(APP, '..', '..') : path.join(APP, '.home'));
const VERSION = fs.readFileSync(path.join(APP, 'VERSION'), 'utf8').trim();
const PORT = +(process.env.GC_PORT || 7480);
// cổng owner thấy trên MÁY CHỦ (CNS-270): Docker map ${GC_PORT}:7480 nên trong container GC_PORT luôn 7480 — compose truyền GC_HOST_PORT; mọi câu / link cho owner dùng cổng này
const HOST_PORT = /^\d{1,5}$/.test(String(process.env.GC_HOST_PORT || '')) ? +process.env.GC_HOST_PORT : PORT;
const HOST = process.env.GC_LISTEN || '127.0.0.1';   // trong Docker đặt 0.0.0.0; cổng ngoài vẫn chỉ mở cho 127.0.0.1
// Token chủ (T): GC_API_TOKEN; trống thì server tự sinh data/owner-token (CNS-195) — xem auth.loadToken. Bản cài nào cũng có token (v0.21)
const ENV_TOKEN = process.env.GC_API_TOKEN || '';
// Link MCP có khoá (https://<tên miền>/mcp/<GC_MCP_KEY>): chỉ cấp quyền MCP, không mở Studio hay /api.
// Dùng cho agent không đặt được header (Claude web/desktop Connectors). Đổi khoá: sửa GC_MCP_KEY trong .env rồi genchibi restart (expose --rotate bỏ ở v0.23).
const MCP_KEY = process.env.GC_MCP_KEY || '';
if (MCP_KEY && !/^[A-Za-z0-9_-]{24,}$/.test(MCP_KEY)) { console.error('GC_MCP_KEY must be at least 24 characters of [A-Za-z0-9_-].'); process.exit(2); }
function safeEq(x, y) {
  const a = Buffer.from(String(x)), b = Buffer.from(String(y));
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}
const REPO = process.env.GC_REPO || 'colamacbook-ryan/Gen-Chibi';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
// Chống DNS rebinding: Host cục bộ + tên được cho phép đọc LÚC CHẠY từ online-config (.env kế thừa GC_ALLOWED_HOSTS / GC_PUBLIC_URL, hoặc data/online.json).
// "*.trycloudflare.com" = mọi tên con (tunnel tạm đổi tên mỗi lần chạy). Tên công cộng như vậy không trỏ được về 127.0.0.1 nên không mở lại lỗ DNS rebinding.
function hostAllowed(h) { return LOCAL_HOSTS.has(h) || online.hostAllowed(h); }
const DATA = path.join(HOME, 'data');
const SETTINGS = path.join(DATA, 'settings.json');
fs.mkdirSync(DATA, { recursive: true });

function log(...a) { console.log(new Date().toISOString(), ...a); }
// uiLang: ngôn ngữ mặc định của MÁY cho Studio / câu trả lời API (người dùng vẫn chọn riêng trong trình duyệt). Quy tắc — xem initUiLang()
const UI_LANG0 = L10N.norm(process.env.GC_LANG) || 'en';
const SETTINGS_EXISTED = fs.existsSync(path.join(HOME, 'data', 'settings.json'));   // đo TRƯỚC mọi lần ghi: phân biệt bản cài cũ (nâng cấp) với bản cài mới
// settings.json đọc lại chỉ khi tệp đổi (mtime + cỡ) — langOf() chạy MỖI request kể cả tệp tĩnh (L-42); ghi qua saveSettings() xoá nhớ ngay
let settingsMemo = null;
function settingsRaw() {
  let st = null; try { st = fs.statSync(SETTINGS); } catch (e) { /* chưa có tệp */ }
  const key = st ? st.mtimeMs + ':' + st.size : '-';
  if (!settingsMemo || settingsMemo.key !== key) settingsMemo = { key, val: readJSON(SETTINGS, {}) };
  return settingsMemo.val;
}
function saveSettings(s) { writeJSON(SETTINGS, s); settingsMemo = null; }
function settings() { const s = Object.assign({ autoUpdate: process.env.GC_AUTO_UPDATE !== '0', checkHours: 6, oauthRegister: true, uiLang: UI_LANG0 }, settingsRaw()); if (!L10N.norm(s.uiLang)) s.uiLang = UI_LANG0; return s; }   // oauthRegister: cho agent tự đăng ký OAuth (v0.19; chỉ có tác dụng khi có GC_PUBLIC_URL)

L10N.load(APP);
const store = new Store(DATA);
// NGÔN NGỮ MẶC ĐỊNH CỦA MÁY (ADR 0007) — một nguồn sự thật: settings.uiLang. Người mở Studio: ?lang= › gc-lang của trình duyệt › settings.uiLang › 'en'.
//   GC_LANG ('en' | 'vi'; rỗng = không đặt) chỉ là giá trị KHỞI TẠO hoặc ghi đè CÓ CHỦ Ý: install.sh ghi .env khi người cài chọn rõ (--lang / GC_LANG= /
//     câu hỏi) hoặc cài mới; `genchibi lang` ghi .env (+ PUT /api/settings khi .env đã đúng mà Studio khác). Khi khởi động thấy GC_LANG khác giá trị
//     đã áp lần trước (settings.uiLangEnv) thì chép vào settings.uiLang. GC_LANG không đổi thì không đè.
//   Studio (Hệ thống › Ngôn ngữ) PUT { uiLang } đổi settings.uiLang — giữ tới lần GC_LANG đổi tiếp.
//   NÂNG CẤP từ ≤ v0.19 (Gen quyết, Q24): GC_LANG rỗng + chưa có settings.uiLang + bản cài đã có dữ liệu (hasUserData) → ghi settings.uiLang = 'vi'
//     MỘT lần: bản cài cũ không tự đổi sang tiếng Anh — kể cả khi chạy lại trình cài mà không chọn ngôn ngữ (CNS-152). Bản cài mới (data trống) → ghi 'en' một lần.
// "Đã có dữ liệu" = settings.json có từ trước, hoặc bất kỳ tác phẩm / asset / linh kiện / vật phẩm / bối cảnh / gói động tác / gói âm / dự án nào
// (CNS-152 D: chỉ có dự án / gói cũng là bản cài đang dùng). Store đã tạo sẵn các thư mục → đếm TỆP, không đếm thư mục. cli/genchibi + install.sh không lặp luật này
const DATA_DIRS = ['works', 'assets', 'parts', 'items', 'scenes', 'motionpacks', 'soundpacks'];
function hasUserData() {
  if (SETTINGS_EXISTED) return true;
  const any = d => { try { return fs.readdirSync(path.join(DATA, d)).some(f => f.endsWith('.json')); } catch (e) { return false; } };
  return DATA_DIRS.some(any) || store.listProjects().length > 0;
}
function initUiLang() {
  const env = L10N.norm(process.env.GC_LANG), s = readJSON(SETTINGS, {});
  if (env && env !== s.uiLangEnv) {
    s.uiLang = env; s.uiLangEnv = env; saveSettings(s);
    log('[i18n] GC_LANG=' + env + ' → machine default language = ' + env);
  } else if (!env && !L10N.norm(s.uiLang)) {
    if (hasUserData()) {
      s.uiLang = 'vi'; saveSettings(s);
      log('[i18n] upgrade of an existing install: keeping the Vietnamese interface (settings.uiLang = vi, once; change it in System › Language or with genchibi lang)');
    } else { s.uiLang = 'en'; saveSettings(s); }   // bản cài mới không có GC_LANG: ghi 'en' MỘT lần — dữ liệu tạo về sau không biến nó thành "bản cũ" (khởi động lại không lật sang vi)
  }
}
initUiLang();
const engine = loadEngine(APP);
const updater = new Updater({ home: HOME, version: VERSION, repo: REPO, feedUrl: process.env.GC_FEED_URL, log, token: process.env.GC_GITHUB_TOKEN || '' });
const secrets = new Secrets(DATA);
// cấu hình online lúc chạy (§3.2) + đăng nhập chủ (§3.3). Thứ tự: online trước (auth lấy header IP từ đây), oauth gắn vào online sau khi tạo
const online = new OnlineConfig({ dir: DATA, log, env: { publicUrl: process.env.GC_PUBLIC_URL, allowedHosts: process.env.GC_ALLOWED_HOSTS, tunnel: process.env.GC_TUNNEL, clientIpHeader: process.env.GC_CLIENT_IP_HEADER },
  impact: url => oauth.grantsNotFor(url), onCommit: () => { const n = oauth.prune(); if (n) log('[oauth] public URL changed: ' + n + ' agent connection(s) issued for the old address were revoked'); } });
const TOKEN_FILE_EXISTED = fs.existsSync(path.join(DATA, 'owner-token'));   // đo TRƯỚC khi auth tự sinh: phân biệt bản cài v0.20 không token (nâng cấp) với lần chạy sau
// GC_TEST=1 là điều kiện của MỌI móc / núm chỉ dành cho kiểm thử (review bảo mật 🟡7): thiếu thì GC_AUTH_RATE / GC_OAUTH_RATE / GC_TEST_* bị bỏ qua hẳn
const TESTING = process.env.GC_TEST === '1';
const IN_DOCKER = process.env.GC_IN_DOCKER === '1';
// thiết lập lần đầu (v0.23 §A.0): stage đọc lúc chạy; boot() (bảng lối vào) chạy SAU khi Go online dựng xong (cần biết luồng v0.21 / v0.22 "chờ mật khẩu")
const setup = new Setup({ dataDir: DATA, runDir: path.join(HOME, 'run'), log });
// admin / admin (§A.1): MỘT hàm cho mọi điều kiện — ảnh chụp trạng thái máy (stage, cửa sổ do lệnh host mở, chưa lên mạng, edge / tunnel, Docker publish, GC_BIND)
// + request (socket loopback ở bản native, Origin / Host localhost khớp cổng, không header proxy / edge). Lý do + cách vào: server/setup.js REASON_MSG
function machineState() {
  const c = online.get() || {};
  return { stage: setup.stage, window: setup.windowOf(), online: { mode: c.mode || 'off', publicUrl: c.publicUrl || '', pending: c.publicUrlPending || '', busy: goOnline.busy() },
    legacyEnv: !!(process.env.GC_PUBLIC_URL || process.env.GC_ALLOWED_HOSTS), legacyMarked: auth.isLegacy(), caddy: fs.existsSync(path.join(HOME, 'edge', 'caddy.enabled')),
    tunnel: goOnline.intent() !== 'off', inDocker: IN_DOCKER, bind: process.env.GC_BIND || '', listen: HOST };
}
const auth = new Auth({ dir: DATA, envToken: ENV_TOKEN, key: secrets.key, log, ipHeader: () => online.ipHeader(), rate: TESTING ? process.env.GC_AUTH_RATE : 1,
  publicUrl: () => online.publicUrl(), setup, port: HOST_PORT, adminCheck: (req, key) => loginReasons(machineState(), req, key) });
// dấu máy kế thừa (CNS-173, 199b): MỘT lần ở lần khởi động đầu của v0.21 — đọc env lúc đó; tokenless = bản cài đã có dữ liệu chạy không token (agent cũ cần nối lại, CNS-197)
auth.markLegacy({ publicUrl: process.env.GC_PUBLIC_URL, allowedHosts: process.env.GC_ALLOWED_HOSTS, tokenless: !ENV_TOKEN && !TOKEN_FILE_EXISTED && hasUserData() });
setInterval(() => auth.tick(), 60000).unref();   // phiên hết hạn (cả phiên admin), seenAt
// HỢP ĐỒNG CHO ROUTE MỚI (P3 /api/online/*, P4): mọi /api/* (trừ /api/health, /api/auth/*) đã qua cổng S / T ở route() — req.gcOwner = 'S' | 'T'.
// Route đặt ngoài /api mà cần quyền chủ: `if (!requireOwner(req, res)) return;`. Lớp E: listener của edge gắn req.gcEdge = 'caddy' | 'tunnel' TRƯỚC khi gọi route()
// (chỉ ảnh hưởng IP dùng cho trần + cờ Secure, không cấp quyền). Cấu hình online: online.get() / preview(url) / setPending(url, { force }) / commit() / revert() / setMode() / migrate()
function requireOwner(req, res) { return auth.requireOwner(req, res, { send }); }
const ai = new AI({ dataDir: DATA, secrets, engine });
const voice = new Voice({ dataDir: DATA, secrets });   // giọng AI (Google Gemini TTS) — dùng chung kho bí mật với AI đạo diễn
const mcp = new MCP({ engine, store, version: VERSION, system: { updater, restartSoon }, voice, uiLang: () => settings().uiLang });   // uiLang: lời thoại mặc định của tác phẩm agent tạo qua MCP (/mcp luôn 'en' ở tầng HTTP) — CNS-151
// OAuth 2.1 cho MCP từ xa (v0.19): mọi URL dựng từ publicUrl — đọc LÚC CHẠY từ online-config (v0.21: data/online.json; .env GC_PUBLIC_URL kế thừa).
// Thiếu hoặc không phải gốc (có đường dẫn) thì OAuth tắt, /mcp vẫn 401 như cũ. publicUrl đang bật TẠM thì không gỡ kết nối của địa chỉ cũ (trả về còn dùng)
const oauth = new OAuth({ dir: DATA, publicUrl: () => online.publicUrl(), pruneOk: () => !online.pending(), warn: log, accessTtl: process.env.GC_OAUTH_ACCESS_TTL, redirects: String(process.env.GC_OAUTH_REDIRECTS || '').split(',').map(x => x.trim()).filter(Boolean) });
if (online.publicUrl() && !oauth.enabled) log('[oauth] OAuth is OFF: ' + MSG.en(oauth.why));
// header chứa IP khách để giới hạn tốc độ (xem clientIp) ở lớp P: mặc định mục cuối của x-forwarded-for; đứng sau Cloudflare (proxy riêng) đặt GC_CLIENT_IP_HEADER=cf-connecting-ip
// (kế thừa) hoặc online.json clientIpHeader. Lớp E (edge của app) lấy IP theo cờ req.gcEdge — xem auth.ipOf
const IP_HEADER0 = String(process.env.GC_CLIENT_IP_HEADER || '').trim().toLowerCase();
if (IP_HEADER0 && ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip'].indexOf(IP_HEADER0) < 0) { console.error('GC_CLIENT_IP_HEADER must be x-forwarded-for | cf-connecting-ip | x-real-ip.'); process.exit(2); }
const ipHeader = () => online.ipHeader();
setInterval(() => oauth.flush(), 30000).unref();   // lastUsedAt ghi đĩa trễ

/* ---------------------------------------------------------------- tiện ích HTTP */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };
// ngôn ngữ của người gọi: header X-GC-Lang (Studio) → Accept-Language → mặc định của máy. Đường của MÁY (MCP, metadata / đăng ký / token OAuth)
// luôn tiếng Anh — hợp đồng agent một ngôn ngữ (CNS-067), không theo uiLang của chủ máy. Tính một lần mỗi request
const MACHINE_PATH = /^\/(mcp(\/[A-Za-z0-9_-]+)?|\.well-known\/oauth-[a-z-]+(\/mcp)?|oauth\/(register|token|revoke))$/;
function langOf(req) {
  if (req._gcLang) return req._gcLang;
  return (req._gcLang = MACHINE_PATH.test(String(req.url || '').split('?')[0]) ? 'en' : L10N.langOf(req, settings().uiLang));
}
// câu do server sinh trong JSON — error, message, errors[] (chuỗi | { error }), warnings[], conflicts[] — dịch theo người gọi (ADR 0007, v0.20):
// khớp nguyên văn → khớp ngược MẪU có placeholder (câu ghép động: engine/i18n-msg.js) → giữ nguyên. Trường dữ liệu khác không đụng
function localize(res, body) {
  if (!res.req) return body;
  return MSG.localizeBody(langOf(res.req), body);   // khớp nguyên văn → khớp ngược MẪU (câu ghép động) → giữ nguyên; trường dữ liệu khác không đụng
}
// cấu hình AI cho Studio: chữ người đọc (nhãn nhà cung cấp, nhãn / vai / lời giới thiệu của từng khu ở dock) theo ngôn ngữ người gọi
function aiView(lang, c) {
  const L = s => typeof s === 'string' ? L10N.label(lang, s) : s;
  const out = Object.assign({}, c);
  if (c.providers) { out.providers = {}; Object.keys(c.providers).forEach(k => { out.providers[k] = Object.assign({}, c.providers[k], { label: L(c.providers[k].label) }); }); }
  if (c.zones) { out.zones = {}; Object.keys(c.zones).forEach(k => { const z = c.zones[k]; out.zones[k] = Object.assign({}, z, { label: L(z.label), short: L(z.short), intro: L(z.intro), ask: L(z.ask) }); }); }
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
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error(VI('dữ liệu gửi lên quá lớn (tối đa {n} MB)', { n: Math.round(limit / 1048576 * 10) / 10 })), { code: 413 })); req.destroy(); } else chunks.push(c); });
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
    req.on('data', c => { n += c.length; if (n > 32 * 1024) { reject(Object.assign(new Error('request body too large (max 32 KB)'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (/^application\/x-www-form-urlencoded\b/.test(ct)) { const o = Object.create(null); for (const [k, v] of new URLSearchParams(raw)) if (!(k in o)) o[k] = v; return resolve(o); }
      if (/^application\/json\b/.test(ct)) {
        let j; try { j = raw ? JSON.parse(raw) : {}; } catch (e) { return reject(Object.assign(new Error('invalid JSON'), { code: 400 })); }   // error_description: ASCII tiếng Anh (RFC 6749 §5.2)
        return j && typeof j === 'object' && !Array.isArray(j) ? resolve(j) : reject(Object.assign(new Error('the body must be a JSON object'), { code: 400 }));
      }
      reject(Object.assign(new Error('Content-Type phải là application/x-www-form-urlencoded hoặc application/json'), { code: 415 }));
    });
  });
}
const { bearerOf } = require('./auth');   // Authorization: Bearer … | X-GC-Token

/* ---------------------------------------------------------------- tệp tĩnh */
// CSP của Studio + header riêng của trang xuất video (CNS-214): server/headers.js
const { STUDIO_HEADERS, VIDEO_EXPORT_PAGE, VIDEO_EXPORT_HEADERS } = require('./headers');
const STATIC_ROOTS = ['engine', 'kinds', 'studio', 'locales'];   // locales/<lang>/*.json: bảng dịch Studio nạp trước lần vẽ đầu
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  // đường dẫn KHÔNG chuẩn (// · /./ · /../ · \) → 404, TRƯỚC mọi so khớp trang có header riêng: /studio//index.html từng được phục vụ như tệp tĩnh thường
  // (path.join tự gộp //) nên mất CSP của Studio (review bảo mật v0.22). Chỉ đúng một cách viết của mỗi tệp được phục vụ.
  if (rel && (rel.indexOf('\\') >= 0 || rel.indexOf('\0') >= 0 || path.posix.normalize(rel) !== rel || rel.split('/').some(seg => seg === '..' || seg === '.'))) return fail(res, 404, 'không tìm thấy');
  const slash = rel.match(/^(xuong|thu-vien|tao-tac)\/$/);   // /xuong/ → /xuong (đường dẫn tương đối của trang chỉ đúng khi không có / cuối)
  if (slash) { res.writeHead(301, { Location: '/' + slash[1] }); return res.end(); }
  // /setup (đặt mật khẩu đầu bằng mã setup, v0.21) đã bỏ ở v0.23 — địa chỉ cũ chuyển sang /login (lần đầu: admin / admin) (bảng truy cập v0.23)
  if (rel === 'setup') { res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' }); return res.end(); }
  if (rel === '' || rel === 'index.html' || rel === 'xuong' || rel === 'thu-vien' || rel === 'tao-tac' || rel === 'login') rel = 'studio/index.html';   // 3 ứng dụng độc lập + màn đăng nhập / khởi tạo / thiết lập lần đầu dùng chung một bộ mã (Studio tĩnh — mọi lớp)
  if (rel === 'studio/index.html') return send(res, 200, fs.readFileSync(path.join(APP, rel)), MIME['.html'], STUDIO_HEADERS);
  if (rel === VIDEO_EXPORT_PAGE) return send(res, 200, fs.readFileSync(path.join(APP, rel)), MIME['.html'], VIDEO_EXPORT_HEADERS);   // DUY NHẤT trang nhúng được (cùng nguồn)
  if (rel === 'CHANGELOG.md' || rel === 'VERSION') return send(res, 200, fs.readFileSync(path.join(APP, rel)), MIME[path.extname(rel)] || 'text/plain; charset=utf-8');
  const top = rel.split('/')[0];
  if (!STATIC_ROOTS.includes(top) || rel.split('/').includes('..')) return fail(res, 404, 'không tìm thấy');
  const file = path.join(APP, rel);
  if (!file.startsWith(APP + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, 'không tìm thấy');
  // mọi trang .html khác (nếu có) cũng mang CSP của Studio — không trang HTML nào của máy chủ đi ra mà thiếu CSP
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream', /\.html$/i.test(file) ? STUDIO_HEADERS : undefined);
}

/* ---------------------------------------------------------------- định tuyến */
function restartSoon() { setTimeout(() => { log('[server] exiting so the launcher restarts it'); oauth.flush(); auth.flush(); process.exit(RESTART_CODE); }, 400); }
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
  const pub = online.publicUrl();
  if (pub) { try { if (new URL(pub).host.toLowerCase() === oh) return true; } catch (e) { /* GC_PUBLIC_URL hỏng: bỏ qua */ } }
  const [a, ap] = hostPort(oh), [b, bp] = hostPort(host);
  return LOOPBACK.has(a) && LOOPBACK.has(b) && ap === bp;
}
// câu báo khi chặn: nói rõ trang mở ở đâu và máy chủ nhận địa chỉ nào để người dùng tự sửa (chuỗi đã cắt ngắn, chỉ là chữ)
function originMsg(req) {
  const cut = x => String(x || '?').replace(/[^\x20-\x7e]/g, '').slice(0, 120);
  return VI('yêu cầu từ nguồn lạ bị chặn: trang đang mở ở {origin} nhưng máy chủ nhận địa chỉ {host} — mở Studio bằng đúng địa chỉ máy chủ (vd. http://127.0.0.1:{port}), hoặc cập nhật bằng lệnh: genchibi update',
    { origin: cut(req.headers.origin), host: cut(req.headers.host), port: PORT });
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
// LƯỢT AI DÀI qua proxy cắt khi im lặng (CNS-175, v0.21): Cloudflare ngắt request ~100 s không có byte nào, còn một lượt dock / AI đạo diễn có thể tới
// 10 vòng LLM × 120 s. Client gửi { async: true } → server trả 202 + id lượt NGAY, việc chạy nền (cùng hàm, cùng khoá lượt, cùng kết quả); Studio hỏi
// GET /api/ai/turns/<id> mỗi giây tới khi xong. Lỗi tức thì (tin rỗng, đối tượng đang bận — ném trước lần chờ đầu tiên) vẫn trả ngay như cũ.
// Không có async → chặn như v0.20 (MCP, client cũ). Lượt giữ trong bộ nhớ 10 phút sau khi xong, tối đa 200 lượt xong (bỏ cũ nhất — review bảo mật 🟡9),
// tối đa 40 lượt đang chạy; id 128 bit; chỉ chủ (đã qua cổng /api). Bộ nhớ: server/turns.js
const TURNS = require('./turns').createTurns({ keepMs: 10 * 60e3, maxRunning: 40, maxDone: 200 });
async function turnOrWait(res, b, fn) {
  if (b.async !== true) return send(res, 200, await fn());
  TURNS.sweep();
  if (TURNS.running() >= TURNS.limits.maxRunning) return fail(res, 429, 'quá nhiều lượt AI đang chạy — đợi xong rồi gửi tiếp');
  const p = fn(), early = await Promise.race([p.then(r => ({ r }), e => ({ e })), new Promise(r => setImmediate(() => r(null)))]);
  if (early && early.e) throw early.e;            // lỗi đồng bộ (400 / 409): trả ngay, không tạo lượt
  if (early) return send(res, 200, early.r);
  const id = TURNS.add(p);
  if (!id) { p.catch(() => {}); return fail(res, 429, 'quá nhiều lượt AI đang chạy — đợi xong rồi gửi tiếp'); }
  return send(res, 202, { turn: id, status: 'running', poll: '/api/ai/turns/' + id, pollMs: 1000 });
}
function turnView(res, id) {
  const t = TURNS.get(id);
  if (!t) return fail(res, 404, 'không có lượt AI này (đã quá 10 phút hoặc server đã khởi động lại)');
  if (t.status === 'running') return send(res, 200, { turn: id, status: 'running', since: new Date(t.at).toISOString() });
  if (t.status === 'error') return send(res, 200, { turn: id, status: 'error', code: t.code, error: t.error });
  return send(res, 200, { turn: id, status: 'done', result: t.result });
}
/* ---------------------------------------------------------------- OAuth 2.1 (v0.19) */
// GC_OAUTH_RATE (1–100, mặc định 1) nhân trần TOÀN CỤC (register 200 / 10 phút, authorize 600 / phút) — chỉ dùng để chạy test số lượng lớn
const OAUTH_RATE = TESTING ? Math.max(1, Math.min(100, Math.round(+process.env.GC_OAUTH_RATE) || 1)) : 1;
// Cho agent tự đăng ký: công tắc của chủ (Cài đặt › Kết nối agent), mặc định BẬT
const registerOn = () => settings().oauthRegister !== false;
function oauthView(lang) {   // lang: nhãn / mô tả phạm vi theo ngôn ngữ người gọi (Studio › Kết nối agent)
  const L = s => lang ? L10N.label(lang, s) : s;
  return { enabled: oauth.enabled, configured: !!online.publicUrl(), publicUrl: oauth.publicUrl, mcpUrl: oauth.enabled ? oauth.resource : null, register: registerOn(), tokenSet: true,   // v0.21: bản cài nào cũng có token chủ
    scopes: OAUTH_SCOPES.map(id => Object.assign({ id }, OAUTH_SCOPE_INFO[id], { label: L(OAUTH_SCOPE_INFO[id].label), desc: L(OAUTH_SCOPE_INFO[id].desc) })), redirects: oauth.redirects, accessTtl: oauth.accessTtl, clients: oauth.list() };
}
// /.well-known/oauth-* và /oauth/*. Trả true nếu đã trả lời. Tắt (thiếu GC_PUBLIC_URL) → 404 để /mcp 401 trơn như cũ
async function oauthRoute(req, res, url, p, m) {
  if (!oauth.enabled) { fail(res, 404, 'OAuth chưa bật — đưa máy lên mạng ở Hệ thống › Lên mạng (hoặc genchibi online)'); return true; }
  const wk = /^\/\.well-known\/(oauth-protected-resource|oauth-authorization-server)(\/mcp)?$/.exec(p);
  if (wk) {   // RFC 9728 (cả dạng có hậu tố /mcp chèn sau host) + RFC 8414
    if (m !== 'GET' && m !== 'HEAD') { send(res, 405, { error: 'chỉ GET' }, null, { Allow: 'GET, HEAD' }); return true; }
    send(res, 200, wk[1] === 'oauth-protected-resource' ? oauth.protectedResource() : oauth.authServer(registerOn())); return true;
  }
  // Giới hạn tốc độ: kiểm trần IP trước, trần toàn cục (rất cao) chỉ cộng cho request đã qua trần IP; CHỈ ĐẾM thất bại (token / revoke) hoặc mọi lần (register / authorize — mỗi lần tạo trạng thái).
  // Request loopback thật (không header proxy) được miễn. Trả true nếu đã trả 429.
  const ip = clientIp(req.headers, req.socket.remoteAddress, ipHeader()), direct = isDirectLocal(req.headers, req.socket.remoteAddress);
  const throttled = kind => { const w = direct ? 0 : oauth.gate(kind, ip, OAUTH_RATE); if (w) send(res, 429, { error: 'temporarily_unavailable', error_description: 'too many requests - retry after ' + w + ' seconds' }, null, { 'Retry-After': String(w) }); return !!w; };
  const tick = kind => { if (!direct) oauth.tick(kind, ip); };
  const oerr = (e) => send(res, e.code >= 400 && e.code < 600 ? e.code : 400, { error: 'invalid_request', error_description: e.message });
  if (p === '/oauth/authorize') {
    if (m !== 'GET') { send(res, 405, { error: 'chỉ GET' }, null, { Allow: 'GET' }); return true; }
    if (throttled('authorize')) return true;
    tick('authorize');
    const r = oauth.authorize(url.searchParams);
    if (r.page) { const e = errorPage(r.page); send(res, r.status || 400, e.html, 'text/html; charset=utf-8', { 'Content-Security-Policy': e.csp }); return true; }
    if (r.redirect) { res.writeHead(302, { Location: r.redirect, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); return true; }
    // chưa có bằng chứng chủ (S / T) → trang hỏi token; máy đã có mật khẩu → kèm lối "đăng nhập" quay lại đúng trang này (bảng §3.4: Cấp phép = S hoặc T)
    const pg = consentPage(r.view, { needToken: !auth.ownerOf(req), loginUrl: auth.hasPassword() ? '/login?next=' + encodeURIComponent(req.url) : '', publicHost: new URL(oauth.publicUrl).host });
    send(res, 200, pg.html, 'text/html; charset=utf-8', { 'Content-Security-Policy': pg.csp }); return true;
  }
  if (p === '/oauth/register' || p === '/oauth/token' || p === '/oauth/revoke') {
    if (m !== 'POST') { send(res, 405, { error: 'chỉ POST' }, null, { Allow: 'POST' }); return true; }
    if (throttled(p === '/oauth/register' ? 'register' : 'token')) return true;
    if (p === '/oauth/register' && !registerOn()) { send(res, 403, { error: 'access_denied', error_description: 'the owner turned off agent self-registration (Studio > System > Agent connections)' }); return true; }
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
    if (!MCP_KEY || !safeEq(lm[1], MCP_KEY)) return fail(res, 404, 'không có API này');   // sai khoá = như đường không tồn tại
    p = '/mcp'; viaLink = true;
  }
  // ---- Go online (v0.21): kiểm từ ngoài vào (bậc cổng / proxy riêng) — công khai, chỉ GET, chỉ trả lời đúng nonce 128 bit của luồng đang chạy (server/online.js).
  // Đặt TRƯỚC rào Host: lúc kiểm, tên miền của luồng chưa thành Host được phép (chỉ thành khi publicUrl bật tạm ở bậc sau); không lộ gì ngoài nonce người gọi đã biết
  if (p.startsWith('/.well-known/gen-chibi-check/')) return m === 'GET' ? goOnline.checkRoute(req, res, p, send) : fail(res, 405, 'chỉ GET');
  // Chống DNS rebinding: chỉ phục vụ khi Host là máy cục bộ (hoặc tên được cho phép trong GC_ALLOWED_HOSTS)
  const hostName = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostAllowed(hostName)) return fail(res, 403, 'Host không được phép');
  // BẢNG TRUY CẬP v0.23 (spec v023 §A.0–§A.4 trên nền v0.21 §3.4, CNS-167 / 191 / 193 / 195 / 251–255): quyền chủ CHỈ từ bằng chứng dương — S (phiên cookie),
  // T (token chủ), K / O (link có khoá / OAuth, chỉ /mcp); A (phiên admin) chỉ mở màn khởi tạo. Mã setup (C) của v0.21 đã bỏ. KHÔNG lớp nào được quyền vì
  // THIẾU header (localhost, Docker, proxy không thêm XFF đều như nhau). Lớp E / P / N chỉ dùng cho trần tần suất (auth.ipOf).
  //   Studio tĩnh · GET /api/health · GET /api/auth/state (tối thiểu) · OAuth máy → mọi lớp · /setup (cũ) → 302 /login
  //   POST /api/auth/login { username: admin } → A khi và chỉ khi stage admin + cửa sổ run/admin-window (lệnh host, ≤ 30 phút) + chưa lên mạng (online.json off,
  //     không GC_PUBLIC_URL / GC_ALLOWED_HOSTS, không edge Caddy, không tunnel) + native: socket loopback + GC_BIND loopback / Docker: CLI đã kiểm compose chỉ
  //     publish loopback (kể cả network_mode mặc định) + Origin http://localhost|127.0.0.1|[::1]:<cổng> khớp Host + không header proxy / edge
  //     + KHOÁ MỘT LẦN của link (body.key == run/admin-window.key, 128 bit, so thời gian hằng — CNS-268: user / container khác chạm được cổng nhưng không có khoá);
  //     trần xét TRƯỚC. Từ chối: request không đạt điều kiện request → chỉ 'local-only' (CNS-271); máy chưa đạt → đúng lý do; khoá sai → 'link' (setup.js loginReasons)
  //   POST /api/auth/login { username: <tên> } → S (trần §3.3) · POST /api/auth/init → A hoặc T, chỉ khi stage admin / must_init (nguyên tử)
  //   /api/* khác: A → 403 gate init · S (Studio) và T kèm X-GC-Studio (Studio đăng nhập bằng token) → theo stage: admin / must_init chỉ /api/info;
  //     domain / mcp chỉ wizard (/api/info · /api/setup* · /api/online* · /api/oauth* · /api/agent/* · /api/settings); done → mọi /api
  //     T không kèm X-GC-Studio (agent, CLI) → mọi /api ở mọi stage (lời hứa v0.21: genchibi mcp chạy ngay) — Go online vẫn chặn khi stage admin / must_init
  //     (trừ máy kế thừa; online.js) · /api/setup/skip | reset | hostcheck → chỉ T · /mcp → K, O, T ở mọi stage (S, A không bao giờ mở /mcp)
  // ---- OAuth (v0.19): khám phá + đăng ký + token + thu hồi là đường MÁY (công khai, bảo vệ bằng PKCE / token — không cần cookie hay phiên Studio); authorize là trang cho chủ
  if (p.startsWith('/oauth/') || p.startsWith('/.well-known/oauth-')) { const done = await oauthRoute(req, res, url, p, m); if (done) return; }

  // Đã đặt token: mọi /api (trừ health) và /mcp đều cần token, bất kể Host hay địa chỉ. Studio đăng nhập bằng token.
  // /mcp còn nhận access token OAuth (Authorization: Bearer): phạm vi → kênh SẴN CÓ (scopeCtx). Không có / sai token → 401 + WWW-Authenticate trỏ metadata để agent tự khám phá.
  let mcpCtx = { viaLink }, oauthGrant = null;
  if (p === '/mcp' && !viaLink) {
    const b = bearerOf(req), owner = auth.tokenOk(b);   // /mcp: K / O / T — phiên cookie (S) KHÔNG mở /mcp
    oauthGrant = !owner && oauth.enabled ? oauth.verify(b) : null;   // token OAuth hợp lệ luôn được áp phạm vi của nó (quyền ít hơn token chủ)
    if (oauthGrant) mcpCtx = scopeCtx(oauthGrant.scope);
    // agent cũ nối không token (bản cài v0.20) nhận 401 KÈM lối đi (CNS-197): genchibi mcp (stdio tự đọc token) hoặc genchibi agent connect
    else if (!owner) return send(res, 401, { error: oauth.enabled ? VI('cần token của bản cài hoặc kết nối OAuth (xem WWW-Authenticate)') : 'cần token của bản cài', hint: 'gen-chibi now always requires the owner token: on the server run `genchibi agent connect` for the connection settings (Authorization: Bearer <token>), or use `genchibi mcp` (stdio, reads the token itself)' }, null, oauth.enabled ? { 'WWW-Authenticate': 'Bearer resource_metadata="' + oauth.metaUrl + '"' } : undefined);
  }
  if (p.startsWith('/api/') && p !== '/api/health' && !p.startsWith('/api/auth/')) {
    const who = auth.ownerOf(req);
    if (!who && auth.adminOf(req)) return send(res, 403, { error: 'phiên admin chỉ dùng để khởi tạo tài khoản chủ', gate: 'init', stage: setup.stage });
    if (!who) {
      // approve là đường /api mà tunnel / cổng ngoài thường mở ra Internet → chỗ thử token chủ máy. Token ĐÚNG không bao giờ bị trần; chỉ đếm (theo IP) và chặn các lần SAI
      if (p === '/api/oauth/approve' && oauth.enabled && !isDirectLocal(req.headers, req.socket.remoteAddress)) {
        // token chủ 256 bit (không đoán được): giữ cách lấy IP của OAuth v0.19 (XFF mục cuối khi peer riêng) — kẻ lạ đổi header chỉ rải được lần sai, không đoán được;
        // lớp E (cờ edge) dùng IP edge. Trần MẬT KHẨU dùng auth.ipOf (không tin header tự khai) + trần theo tài khoản — xem auth.js
        const ip = req.gcEdge ? auth.ipOf(req) : clientIp(req.headers, req.socket.remoteAddress, ipHeader()), w = oauth.gate('approve', ip);
        if (w) return send(res, 429, { error: VI('quá nhiều lần sai token — thử lại sau {n} giây', { n: w }) }, null, { 'Retry-After': String(w) });
        oauth.tick('approve', ip);
      }
      return fail(res, 401, 'cần token của bản cài');
    }
    req.gcOwner = who;   // 'S' | 'T' — route sau (P3 /api/online/*) đọc được nếu cần phân biệt
    // CỔNG STUDIO theo stage (§A.0): Studio (phiên S, hoặc token gửi kèm X-GC-Studio) chỉ tới màn khởi tạo / wizard tới khi xong; agent / CLI (T) không bị chặn
    const studio = who === 'S' || req.headers['x-gc-studio'] === '1';
    if (studio && setup.stage !== 'done' && !gateOpen(p)) return send(res, 403, { error: setup.ownerReady() ? 'hoàn tất thiết lập lần đầu trước (tên miền → chẩn đoán MCP)' : 'khởi tạo tài khoản chủ trước', gate: setup.ownerReady() ? 'wizard' : 'init', stage: setup.stage });
  }

  // ---- MCP (Streamable HTTP, trả JSON). Chống CSRF: bắt buộc Content-Type JSON (trang khác gửi kiểu này phải qua preflight, server không cho)
  if (p === '/mcp') {
    // GET cho agent KHÔNG có MCP client (trung lập model, INT-05): ?guide=<chủ đề> → markdown · ?tools=openai|gemini|mcp → schema tool
    if (m === 'GET' && (url.searchParams.has('guide') || url.searchParams.has('tools'))) {
      if (url.searchParams.has('guide')) { const md = Agent.guide(url.searchParams.get('guide') || 'guide'); return md == null ? fail(res, 404, VI('chủ đề lạ: {ids}', { ids: Agent.topics().map(t => t.id).join(', ') })) : send(res, 200, md, 'text/markdown; charset=utf-8'); }
      const out = Agent.toolsExport(MCP_TOOLS, url.searchParams.get('tools') || 'openai'); return out ? send(res, 200, out) : fail(res, 400, 'tools: openai | gemini | mcp');
    }
    if (m !== 'POST') return send(res, 405, { error: 'MCP: chỉ nhận POST (GET ?guide=<chủ đề> hoặc ?tools=openai|gemini|mcp cho agent không có MCP client)' }, null, { Allow: 'POST' });
    // Origin chỉ chống CSRF cho request mang quyền "có sẵn" (cục bộ không token, hoặc token chủ máy do trình duyệt tự gắn); access token OAuth là Bearer tường minh → backend của agent gọi (không có Origin hoặc claude.ai) không bị chặn
    if (!oauthGrant && !originOK(req)) return fail(res, 403, 'Origin không được phép');
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return fail(res, 415, 'MCP cần Content-Type: application/json');
    const msg = await body(req, 2 * 1024 * 1024);
    mcpSeen(msg, req, viaLink, oauthGrant);   // wizard bước 3 "kiểm thật": agent nào vừa gọi MCP (tên, lúc, kênh)
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

  if (p === '/api/health') return send(res, 200, { ok: true, version: VERSION, uiLang: settings().uiLang });   // CÔNG KHAI, chỉ 3 trường: launcher, healthcheck Docker, màn đăng nhập (ngôn ngữ của máy) — §3.4
  // đăng nhập chủ: state (công khai) · setup (C / T) · login (mọi lớp, trần §3.3) · logout · password / setup-code / sessions (S / T) — luật trong auth.handle
  if (p.startsWith('/api/auth/')) return auth.handle(req, res, p, m, { send, body });
  if (p === '/api/setup' || p.startsWith('/api/setup/')) return setupRoute(req, res, p, m);   // thiết lập lần đầu (v0.23 §A.3) — S / T (đã qua cổng /api)
  if (p === '/api/info') { const pub = online.publicUrl(); return send(res, 200, { version: VERSION, repo: REPO, home: HOME, port: PORT, settings: settings(), uiLang: settings().uiLang, lang: langOf(req), auth: auth.view(req), setup: setup.view(), mcp: { http: '/mcp', stdio: 'genchibi mcp', cli: cliPath(), link: pub && MCP_KEY ? pub + '/mcp/' + MCP_KEY : null, oauth: oauth.enabled ? oauth.resource : null } }); }
  if (p === '/api/online' || p.startsWith('/api/online/')) return goOnline.route(req, res, p, m, { send, body, lang: langOf(req) });   // Go online (v0.21): S / T (đã qua cổng /api ở trên) — server/online.js
  if (p === '/api/settings' && m === 'PUT') {
    const b = await body(req);
    const s = settings();
    if (typeof b.autoUpdate === 'boolean') s.autoUpdate = b.autoUpdate;
    if (Number.isFinite(b.checkHours) && b.checkHours >= 1 && b.checkHours <= 168) s.checkHours = Math.round(b.checkHours);
    if (typeof b.oauthRegister === 'boolean') s.oauthRegister = b.oauthRegister;
    if (b.uiLang !== undefined) { const l = L10N.norm(b.uiLang); if (!l) return fail(res, 400, 'uiLang phải là en hoặc vi'); s.uiLang = l; }   // ngôn ngữ mặc định của máy (Hệ thống › Ngôn ngữ)
    // `genchibi lang` vừa ghi GC_LANG vào .env và đổi luôn mặc định qua đây (không khởi động lại): đánh dấu giá trị .env đó ĐÃ ÁP,
    // để lần khởi động sau không áp lại nó đè lên lựa chọn Studio làm sau lệnh CLI (CNS-153). Studio không gửi trường này
    if (b.uiLangEnv !== undefined) { const l = L10N.norm(b.uiLangEnv); if (!l) return fail(res, 400, 'uiLang phải là en hoặc vi'); s.uiLangEnv = l; }
    saveSettings(s);
    scheduleChecks();
    return send(res, 200, s);
  }

  // ---- cập nhật
  if (p === '/api/update' && m === 'GET') return send(res, 200, Object.assign(updater.status(), { settings: settings() }));
  if (p === '/api/update/check' && m === 'POST') {
    try { return send(res, 200, Object.assign(await updater.check(), { settings: settings() })); }
    catch (e) { updater.state.error = e.message; updater.state.lastCheck = new Date().toISOString(); return fail(res, 502, VI('Không kiểm tra được phiên bản: {error}', { error: e.message })); }
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

  // ---- kết nối agent (OAuth, v0.19): chủ máy duyệt + quản lý. Đã qua cổng /api: S hoặc T + X-GC-Request + originOK — KHÔNG tin cổng đăng nhập ngoài app
  if (p === '/api/oauth' && m === 'GET') return send(res, 200, oauthView(langOf(req)));
  if (p === '/api/oauth/approve' && m === 'POST') {
    if (!oauth.enabled) return fail(res, 404, 'OAuth chưa bật — đặt GC_PUBLIC_URL');
    const b = await body(req, 8 * 1024), r = oauth.approve(b.request, b.decision, typeof b.scope === 'string' ? b.scope : '');
    if (!r.redirect) return fail(res, r.status || 400, r.error);
    log('[oauth] owner ' + (b.decision === 'approve' ? 'approved (' + b.scope + ')' : 'denied') + ' an agent connection');
    return send(res, 200, { redirect: r.redirect });
  }
  const ocm = p.match(/^\/api\/oauth\/clients\/(?!(?:__proto__|constructor|prototype)(?:\/|$))([A-Za-z0-9_-]{1,128})(\/revoke)?$/);
  if (ocm && !ocm[2] && m === 'PUT') { const b = await body(req, 4 * 1024); return oauth.setScope(ocm[1], b.scope) ? send(res, 200, oauthView(langOf(req))) : fail(res, 400, 'client không có hoặc phạm vi không hợp lệ'); }
  if (ocm && ocm[2] && m === 'POST') { if (!oauth.revokeClient(ocm[1])) return fail(res, 404, 'không có client này'); log('[oauth] owner revoked an agent connection'); return send(res, 200, oauthView(langOf(req))); }

  // ---- core AI (LLM qua API chuẩn OpenAI; key mã hoá, không trả về trình duyệt)
  if (p === '/api/ai' && m === 'GET') return send(res, 200, aiView(langOf(req), Object.assign(ai.publicConfig(), { zones: mcp.zoneInfo() })));   // zones: nhãn / vai / lời giới thiệu theo khu cho dock (một nguồn: mcp ZONES)
  if (p === '/api/ai' && m === 'PUT') return send(res, 200, aiView(langOf(req), ai.setConfig(await body(req))));
  if (p === '/api/ai/models' && m === 'GET') {
    try { return send(res, 200, await ai.models()); } catch (e) { return fail(res, e.code || 502, VI('Không lấy được danh sách model: {error}', { error: e.message })); }
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
  const tm = /^\/api\/ai\/turns\/([A-Za-z0-9_-]{22})$/.exec(p);
  if (tm && m === 'GET') return turnView(res, tm[1]);   // trạng thái lượt AI chạy nền (CNS-175)
  if (p === '/api/ai/test' && m === 'POST') { const b = await body(req); return send(res, 200, await ai.test(typeof b.model === 'string' ? b.model : '')); }
  if (p === '/api/ai/agent' && m === 'POST') {
    const b = await body(req);
    try {
      if (typeof b.message === 'string') return await turnOrWait(res, b, () => dockTurn(b));   // dock: ngữ cảnh + ghim + luồng theo đối tượng (async: 202 + hỏi lượt — CNS-175)
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
    try { return await turnOrWait(res, b, () => ai.director(b, store.listAssets())); } catch (e) { return fail(res, e.code || 502, e.message); }
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
    try { return await turnOrWait(res, b, () => dockTurn(Object.assign({}, b, { context: { zone: 'tao-tac', page: 'works', object: { kind: 'work', id: wm[1] } } }))); }
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

/* ---------------------------------------------------------------- thiết lập lần đầu (v0.23 §A.3): /api/setup/* + tự kiểm MCP cục bộ */
const SELFTEST_CLIENT = 'gen-chibi-selftest';   // clientInfo.name của lần tự kiểm — không tính là "agent đã nối"
const N_ = (msg, vars) => ({ msg, vars: vars || null });   // msgid + biến, dịch lúc trả về theo người gọi (tools/i18n-scan.mjs nhận N_('…'))
const txOf = (x, lang) => x && typeof x === 'object' && typeof x.msg === 'string' ? MSG._t(x.msg, x.vars, lang) : (typeof x === 'string' ? x : '');
// cổng Studio (§A.0): đường /api Studio được gọi khi stage chưa done. Khởi tạo (admin / must_init): chỉ /api/info. Wizard (domain / mcp): thêm Go online,
// Kết nối agent (OAuth: thẻ claude.ai + nút Cấp phép), hướng dẫn agent, cài đặt (công tắc tự đăng ký OAuth) — wizard nhúng đúng các trang đó
function gateOpen(p) {
  if (p === '/api/info') return true;
  return setup.ownerReady() && /^\/api\/(setup|online|oauth|agent|settings)(\/|$)/.test(p);
}
// agent vừa gọi MCP: initialize (có clientInfo.name) hoặc tools/call. Kênh: link có khoá · OAuth · cầu stdio (genchibi mcp gắn X-GC-Bridge: stdio) · HTTP token.
// Không tính lần tự kiểm của chính app (X-GC-Selftest / clientInfo gen-chibi-selftest) và lần kiểm từ Internet của Go online (không có token → 401, không tới đây)
function mcpSeen(msg, req, viaLink, grant) {
  const list = Array.isArray(msg) ? msg : [msg];
  const init = list.find(x => x && x.method === 'initialize'), call = list.some(x => x && x.method === 'tools/call');
  if ((!init && !call) || req.headers['x-gc-selftest'] === '1') return;
  const name = init && init.params && init.params.clientInfo && typeof init.params.clientInfo.name === 'string' ? init.params.clientInfo.name : '';
  if (name === SELFTEST_CLIENT) return;
  const channel = viaLink ? 'link' : grant ? 'oauth' : req.headers['x-gc-bridge'] === 'stdio' ? 'stdio' : 'http';
  if (init) setup.seenClient(name || 'agent', channel);
  else if (!setup.view().mcp.lastClient) setup.seenClient('agent', channel);
}
// một lời gọi JSON-RPC tới /mcp của CHÍNH app này (như agent cục bộ): token chủ, Host 127.0.0.1 — không bao giờ ra ngoài máy
function selfMcp(rpc) {
  return new Promise(resolve => {
    const data = Buffer.from(JSON.stringify(rpc)), host = HOST === '0.0.0.0' || HOST === '::' ? '127.0.0.1' : HOST;
    const r = http.request({ host, port: PORT, path: '/mcp', method: 'POST', timeout: 10000, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': data.length, Host: '127.0.0.1:' + PORT, Authorization: 'Bearer ' + auth.token, 'X-GC-Selftest': '1' } }, rs => {
      let s = ''; rs.on('data', c => { s += c; }); rs.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* không phải JSON */ } resolve({ status: rs.statusCode, j }); });
    });
    r.on('timeout', () => r.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    r.on('error', e => resolve({ status: 0, error: e.code || e.message }));
    r.end(data);
  });
}
// cầu stdio (genchibi mcp) chạy được: chạy ĐÚNG tệp server/mcp-stdio.js mà lệnh dùng (Docker: compose exec trong container = chính môi trường của app) — initialize + tools/list
function selfStdio() {
  return new Promise(resolve => {
    let out = '', err = '', done = false;
    const c = require('child_process').spawn(process.execPath, [path.join(APP, 'server', 'mcp-stdio.js')], { env: Object.assign({}, process.env, { GC_HOME: HOME, GC_PORT: String(PORT) }), stdio: ['pipe', 'pipe', 'pipe'] });
    const end = r => { if (done) return; done = true; clearTimeout(t); try { c.kill(); } catch (e) { /* đã thoát */ } resolve(r); };
    const t = setTimeout(() => end({ ok: false, error: 'timeout' }), 15000);
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err += String(d).slice(0, 500); });
    c.on('error', e => end({ ok: false, error: e.code || e.message }));
    c.on('exit', code => {
      const rows = out.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } });
      const init = rows.find(x => x && x.id === 1), list = rows.find(x => x && x.id === 2);
      const n = list && list.result && Array.isArray(list.result.tools) ? list.result.tools.length : 0;
      end(init && init.result && n ? { ok: true, tools: n } : { ok: false, error: (init && init.error && init.error.message) || (err.trim().split('\n').pop() || 'exit ' + code).slice(0, 200) });
    });
    c.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: SELFTEST_CLIENT, version: VERSION } } }) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  });
}
// TỰ KIỂM CỤC BỘ (bắt buộc đạt — Q49): /mcp cục bộ initialize + tools/list · token chủ mà genchibi mcp / agent đọc (env hoặc data/owner-token) khớp app · cầu stdio chạy
async function selfTest() {
  const checks = [];
  const a = await selfMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: SELFTEST_CLIENT, version: VERSION } } });
  const b = a.status === 200 && a.j && a.j.result ? await selfMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) : null;
  const n = b && b.j && b.j.result && Array.isArray(b.j.result.tools) ? b.j.result.tools.length : 0;
  checks.push({ id: 'http', ok: n > 0, detail: n ? N_('/mcp trên máy này trả lời: initialize + tools/list ({n} tool)', { n }) : N_('/mcp trên máy này không trả lời đúng ({error})', { error: String(a.error || (b ? 'tools/list HTTP ' + b.status : 'HTTP ' + a.status)) }) });
  let fileTok = ''; try { fileTok = fs.readFileSync(path.join(DATA, 'owner-token'), 'utf8').trim(); } catch (e) { /* không có tệp: token ở .env */ }
  const bridgeTok = process.env.GC_API_TOKEN || fileTok, src = process.env.GC_API_TOKEN ? 'GC_API_TOKEN · .env' : 'data/owner-token';
  const tokOk = auth.tokenOk(bridgeTok);
  checks.push({ id: 'token', ok: tokOk, detail: tokOk ? N_('Token chủ hợp lệ ({source}) — cầu stdio và agent dùng token này', { source: src }) : N_('Token chủ mà genchibi mcp đọc ({source}) không khớp token của app — chạy genchibi restart trên máy chủ', { source: src }) });
  const c = await selfStdio();
  // CNS-269: đây là cầu stdio CHẠY TRONG APP (Docker: trong container) — không phải lệnh owner dán cho agent; lệnh thật trên máy chủ là MCP-04 (genchibi setup check)
  checks.push({ id: 'stdio', ok: c.ok, detail: c.ok ? N_('Cầu stdio của app (chạy trong app) trả lời: initialize + tools/list ({n} tool) — lệnh trên máy chủ: xem MCP-04', { n: c.tools }) : N_('Cầu stdio của app (chạy trong app) không chạy được ({error})', { error: String(c.error || '') }) });
  return { ok: checks.every(x => x.ok), at: new Date().toISOString(), checks };
}
// đường tuyệt đối của lệnh genchibi trên máy chủ (CLI ghi run/cli-path ở start / open / setup check) — thẻ nối agent dùng thay cho "genchibi" trần (CNS-269)
function cliPath() {
  let t = ''; try { t = fs.readFileSync(path.join(HOME, 'run', 'cli-path'), 'utf8').split('\n')[0]; } catch (e) { return ''; }
  return /^\/[^\u0000-\u001f\u007f]{0,511}$/.test(t) ? t : '';
}
function setupView(lang) {
  const v = setup.view(), c = online.get() || {}, st = v.mcp.selfTest;
  if (st) v.mcp.selfTest = Object.assign({}, st, { checks: (st.checks || []).map(x => Object.assign({}, x, { detail: txOf(x.detail, lang) })) });
  return Object.assign(v, { cli: cliPath(), admin: setup.stage === 'admin' ? { reasons: adminReasons(machineState()) } : null, port: HOST_PORT, localMcp: 'http://localhost:' + HOST_PORT + '/mcp',
    mcpUrl: oauth.enabled ? oauth.resource : null, online: { mode: c.mode || 'off', publicUrl: c.publicUrl || '', pending: c.publicUrlPending || '', busy: goOnline.busy(), legacy: auth.isLegacy() } });
}
async function setupRoute(req, res, p, m) {
  const lang = langOf(req);
  if (p === '/api/setup' && m === 'GET') return send(res, 200, setupView(lang));
  if (m !== 'POST') return fail(res, 404, 'không có API này');
  const b = await body(req, 8 * 1024);
  // lối thoát trên MÁY CHỦ (genchibi setup skip | reset — token chủ): phiên Studio không làm được
  if (p === '/api/setup/skip' || p === '/api/setup/reset') {
    if (req.gcOwner !== 'T') return fail(res, 403, 'chỉ lệnh genchibi setup trên máy chủ (token của bản cài) làm được việc này');
    if (p === '/api/setup/reset') { setup.reset(auth.hasPassword(), 'token'); return send(res, 200, setupView(lang)); }
    if (!setup.skip(typeof b.reason === 'string' ? b.reason : '', 'token')) return fail(res, 409, setup.ownerReady() ? 'thiết lập lần đầu đã xong — không có gì để bỏ qua' : 'chưa khởi tạo tài khoản chủ — chạy genchibi password trên máy chủ (bỏ qua chỉ áp cho bước tên miền / MCP)');
    return send(res, 200, setupView(lang));
  }
  if (p === '/api/setup/choice') {
    if (!setup.choose(b.choice)) return fail(res, 409, 'chỉ chọn được ở bước tên miền: local (chỉ dùng trên máy này) hoặc local-pending (tạm dùng trên máy này)');
    return send(res, 200, setupView(lang));
  }
  if (p === '/api/setup/selftest') {
    if (!setup.ownerReady()) return fail(res, 409, 'khởi tạo tài khoản chủ trước');
    setup.setSelfTest(await selfTest());
    return send(res, 200, setupView(lang));
  }
  // kiểm từ Internet (đã lên mạng): /mcp trả 401 + metadata OAuth, đường agent không bị luật chặn bot / WAF — CHỈ BÁO, không khoá (Q49)
  if (p === '/api/setup/internet') return send(res, 200, await goOnline.internetCheck(lang));
  if (p === '/api/setup/finish') {
    if (setup.stage !== 'mcp') return fail(res, 409, 'chưa tới bước chẩn đoán MCP');
    const mm = setup.view().mcp;
    if (!mm.selfTest || !mm.selfTest.ok) return fail(res, 409, 'phần tự kiểm cục bộ phải đạt trước (bấm Kiểm lại) — nếu chính phần kiểm bị lỗi: chạy genchibi setup skip trên máy chủ');
    if (b.later !== true && !mm.lastClient) return fail(res, 409, 'chưa thấy agent nào gọi MCP — nối agent theo thẻ hướng dẫn, hoặc chọn "Tôi nối agent sau"');
    setup.finish(b.later === true);
    return send(res, 200, setupView(lang));
  }
  // MCP-04: CLI trên máy chủ (genchibi setup check / start / open) gửi kết quả chạy THẬT "<đường tuyệt đối> mcp" — chỉ token chủ (T), như skip / reset
  if (p === '/api/setup/hostcheck') {
    if (req.gcOwner !== 'T') return fail(res, 403, 'chỉ lệnh genchibi setup check trên máy chủ (token của bản cài) gửi được kết quả này');
    setup.setHostCheck(b || {});
    return send(res, 200, setupView(lang));
  }
  if (p === '/api/setup/review') { setup.dismissReview(); return send(res, 200, setupView(lang)); }
  return fail(res, 404, 'không có API này');
}

/* ---------------------------------------------------------------- Go online (v0.21): edge của app + /api/online/* */
// Lớp edge của request (server/edge.js — chỉ cho trần tần suất + chẩn đoán, không cấp quyền): Caddy = X-GC-Edge đúng bí mật edge/conf/edge-secret
// (IP khách = mục cuối X-Forwarded-For); cloudflared = request đến trên CỔNG NGHE RIÊNG 127.0.0.1:<GC_PORT+2> (IP khách = Cf-Connecting-Ip chỉ ở đó).
// Cổng riêng chỉ mở khi tunnel bật (run/edge-intent.json), không giành cổng khi không cần. P1 đọc req.gcEdge / req.gcIp.
const { createEdge, createTunnelListener } = require('./edge');
const edge = createEdge({ edgeDir: path.join(HOME, 'edge') });
const tunnelListener = createTunnelListener({ port: PORT + 2, handler: (req, res) => handle(req, res, 'tunnel'), log });
// online-config (P1) là nguồn duy nhất của mode / domain / publicUrl + trạng thái luồng (flow) + tài nguyên Cloudflare đã tạo (cfResources).
// isOwner = bằng chứng dương S / T (auth.ownerOf); legacy.active = đang chạy bằng .env kế thừa (chỉ đọc — di chuyển trước), marked = dấu data/legacy.json
// CHỈ cho kiểm thử (tools/test-ingress.mjs): GC_TEST=1 + GC_TEST_ONLINE_VIA=127.0.0.1:<cổng> — lời gọi "từ Internet" của wizard đi tới cổng loopback đó
// (cloudflared giả đóng vai Cloudflare, Host giữ nguyên), tên miền phân giải ra một IP công khai giả không bao giờ được gọi. Thiếu GC_TEST=1 → bỏ qua hẳn.
const ONLINE_TEST_VIA = TESTING && /^127\.0\.0\.1:\d{2,5}$/.test(process.env.GC_TEST_ONLINE_VIA || '') ? process.env.GC_TEST_ONLINE_VIA : '';
// GC_TEST=1 + GC_TEST_CF_API=http://127.0.0.1:<cổng>/client/v4 — client Cloudflare của wizard gọi Cloudflare API GIẢ (tools/fixtures/fake-cloudflare-api.mjs — test-browser + test-online-cli)
const ONLINE_TEST_CF = TESTING && /^http:\/\/127\.0\.0\.1:\d{2,5}\/client\/v4$/.test(process.env.GC_TEST_CF_API || '') ? process.env.GC_TEST_CF_API : '';
const onlineTestCf = !ONLINE_TEST_CF ? {} : { cloudflare: o => require('./cloudflare').createCloudflare(Object.assign({}, o, { base: ONLINE_TEST_CF })) };
const onlineTestNet = !ONLINE_TEST_VIA ? {} : {
  resolve: async () => ({ a: ['192.0.32.10'], aaaa: [], via: 'system', error: '' }), publicIp: async () => ({ v4: '192.0.32.10', v6: '' }),
  probe: (url, o) => { const u = new URL(url); return require('./online').probeUrl('http://' + ONLINE_TEST_VIA + u.pathname + u.search, Object.assign({}, o, { ip: null, headers: Object.assign({}, o && o.headers, { Host: u.host }) })); }
};
const goOnline = require('./online').createOnline(Object.assign({ home: HOME, dataDir: DATA, port: PORT, inDocker: process.env.GC_IN_DOCKER === '1', config: online, secrets, log, edge, tunnel: tunnelListener,
  isOwner: req => !!auth.ownerOf(req),
  // v0.23: Go online cần owner đã khởi tạo (stage ≥ domain) — máy kế thừa được miễn (genchibi online migrate); xong luồng → wizard bước 2 đạt; email Let's Encrypt (CNS-267)
  ownerReady: () => setup.ownerReady() || auth.isLegacy(), onDone: () => setup.onlineDone(), ownerEmail: () => auth.ownerEmail(),
  legacy: () => { const c = online.get(); return { active: !!c.readOnly, marked: auth.isLegacy(), publicUrl: c.env.publicUrl, allowedHosts: c.env.allowedHosts.join(','), tunnel: c.env.tunnel }; } }, onlineTestNet, onlineTestCf));

// KHÔI PHỤC SAO LƯU (CNS-202): `genchibi restore` đặt data/restore-pending.json vào bản vừa giải nén. Lần khởi động đầu sau đó: Go online về off
// (online.json mode off, publicUrl rỗng, intent off, xoá run/tunnel.token, install-id mới) và THU HỒI mọi phiên + thiết bị (mật khẩu giữ theo bản sao lưu).
// Sao lưu có thể từ máy khác: không quảng bá tên miền / không giành tunnel của máy gốc, phiên cũ không sống lại.
{
  const mark = path.join(DATA, 'restore-pending.json');
  if (fs.existsSync(mark)) {
    // CNS-138: kết nối agent (OAuth) trong bản sao lưu — kể cả cái chủ đã thu hồi sau lúc sao lưu — không sống lại: thu hồi hết, agent cấp phép lại
    try { goOnline.resetAfterRestore(); auth.revokeAll('backup restored'); oauth.revokeAll('backup restored'); fs.rmSync(mark, { force: true }); }
    catch (e) { log('[server] after restore: ' + MSG.en(e.message)); }
  }
}
// bảng lối vào (§A.0): SAU khôi phục + khi đã biết luồng Go online v0.21 / v0.22 đang "chờ mật khẩu" (máy đó vẫn online, stage must_init).
// Owner vừa khởi tạo (mọi đường) → luồng đó tự xong (thay móc onPasswordSet của v0.21)
setup.boot({ hasPassword: auth.hasPassword(), legacy: auth.isLegacy(), onlineWaiting: goOnline.waitingOwner() });
setup.hooks.push(() => { if (setup.ownerReady()) goOnline.ownerReady(); });

// Chứng minh cổng ingress (launcher, CNS-B v0.21): launcher sinh GC_INGRESS_NONCE ngẫu nhiên mỗi lần khởi động, truyền cho app con qua env; trước khi
// spawn cloudflared (và định kỳ) nó GET http://127.0.0.1:<GC_PORT+2>/api/health kèm X-GC-Ingress-Challenge: <hex ngẫu nhiên>. CHỈ listener ingress của app trả
// X-GC-Ingress = HMAC-SHA256(nonce, "ingress:" + challenge) → tiến trình lạ chiếm cổng trước app không trả lời đúng → launcher không trỏ tunnel vào nó.
// Thách thức-đáp thay vì nonce trần: /api/health trên cổng này cũng tới được từ Internet qua tunnel — giá trị cố định sẽ bị đọc rồi phát lại.
// Nonce xoá khỏi process.env ngay (không lọt sang tiến trình con), không bao giờ ghi log.
const INGRESS_NONCE = String(process.env.GC_INGRESS_NONCE || '');
delete process.env.GC_INGRESS_NONCE;
function ingressProof(req, res) {
  const c = String(req.headers['x-gc-ingress-challenge'] || '');
  if (!INGRESS_NONCE || !/^[a-f0-9]{32,128}$/.test(c)) return;
  if (String(req.url || '').split('?')[0] !== '/api/health') return;
  res.setHeader('X-GC-Ingress', require('crypto').createHmac('sha256', INGRESS_NONCE).update('ingress:' + c).digest('hex'));
}
function handle(req, res, via) {
  edge.mark(req, via);
  if (via === 'tunnel') ingressProof(req, res);
  MSG.run(langOf(req), () => route(req, res)).catch(e => {   // ngôn ngữ của yêu cầu cho trang Cấp phép, nhãn khu / nhà cung cấp / giọng, tên phân cảnh mặc định…
    log('[server] error', MSG.en(e.message)); if (!res.headersSent) fail(res, e.code && e.code >= 400 && e.code < 600 ? e.code : 500, e.message); });
}
const server = http.createServer((req, res) => handle(req, res, 'main'));

/* ---------------------------------------------------------------- tự kiểm tra phiên bản */
let timer = null;
async function autoCheck() {
  const s = settings();
  try {
    const st = await updater.check();
    log('[updater] check: current v' + VERSION.replace(/^v/, '') + ', latest ' + st.latest + (st.available ? ' (update available)' : ''));
    if (st.available && s.autoUpdate) {
      const r = await updater.apply();
      if (r.restart) restartSoon();
    }
  } catch (e) { log('[updater] could not check:', MSG.en(e.message)); }
}
function scheduleChecks() {
  clearInterval(timer);
  timer = MSG.exit(() => setInterval(autoCheck, settings().checkHours * 3600 * 1000));   // gọi từ PUT /api/settings: timer không giữ ngôn ngữ của request đó
}

server.listen(PORT, HOST, () => {
  log('[server] gen-chibi v' + VERSION.replace(/^v/, '') + ' running at http://' + HOST + ':' + PORT + ' · home ' + HOME);
  scheduleChecks();
  if (process.env.GC_NO_AUTOCHECK !== '1') setTimeout(autoCheck, 15000);
  goOnline.init();   // tunnel đang bật → mở cổng nghe riêng cho cloudflared
});
process.on('SIGTERM', () => { tunnelListener.set(false); server.close(() => { oauth.flush(); auth.flush(); process.exit(0); }); });
