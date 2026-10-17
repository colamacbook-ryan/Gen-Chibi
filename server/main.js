// gen-chibi — server cục bộ (Node thuần, không phụ thuộc thư viện ngoài)
// © 2026 Afi Labs — All rights reserved.
// Phục vụ Studio + API: lưu asset có phiên bản, cài đặt, kiểm tra / cập nhật / chạy lại bản cũ.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Updater, RESTART_CODE } = require('./updater');

const APP = path.resolve(__dirname, '..');                       // thư mục phiên bản đang chạy
const HOME = process.env.GC_HOME || (path.basename(path.dirname(APP)) === 'releases' ? path.resolve(APP, '..', '..') : path.join(APP, '.home'));
const VERSION = fs.readFileSync(path.join(APP, 'VERSION'), 'utf8').trim();
const PORT = +(process.env.GC_PORT || 7480);
const HOST = process.env.GC_LISTEN || '0.0.0.0';
const REPO = process.env.GC_REPO || 'colamacbook-ryan/Gen-Chibi';
const DATA = path.join(HOME, 'data');
const ASSET_DIR = path.join(DATA, 'assets');
const VER_DIR = path.join(DATA, 'versions');
const TRASH_DIR = path.join(DATA, 'trash');
const SETTINGS = path.join(DATA, 'settings.json');
[DATA, ASSET_DIR, VER_DIR, TRASH_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

function log(...a) { console.log(new Date().toISOString(), ...a); }
function readJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }
function writeJSON(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); }

function settings() {
  return Object.assign({ autoUpdate: process.env.GC_AUTO_UPDATE !== '0', checkHours: 6 }, readJSON(SETTINGS, {}));
}

const updater = new Updater({ home: HOME, version: VERSION, repo: REPO, feedUrl: process.env.GC_FEED_URL, log });

/* ---------------------------------------------------------------- tiện ích HTTP */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };
function send(res, code, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8', 'Content-Length': buf.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
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

/* ---------------------------------------------------------------- asset có phiên bản */
const KEY = /^[a-z0-9]+(\.[a-z0-9-]+)+\/[a-z0-9-]{1,64}$/;
function fileOf(key) { return key.replace('/', '~'); }
function listAssets() {
  return fs.readdirSync(ASSET_DIR).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(ASSET_DIR, f), null)).filter(Boolean);
}
function saveAsset(key, a, note) {
  if (!a || typeof a !== 'object' || !a.look || typeof a.look !== 'object') throw Object.assign(new Error('asset phải có "look"'), { code: 400 });
  const vdir = path.join(VER_DIR, fileOf(key));
  fs.mkdirSync(vdir, { recursive: true });
  const n = fs.readdirSync(vdir).filter(f => /^\d+\.json$/.test(f)).map(f => +f.slice(0, -5)).reduce((m, x) => Math.max(m, x), 0) + 1;
  const [pack, id] = key.split('/');
  const rec = Object.assign({}, a, { pack, id, key, version: n, savedAt: new Date().toISOString() });
  delete rec._note;
  writeJSON(path.join(vdir, n + '.json'), Object.assign({ _note: String(note || '').slice(0, 200) }, rec));
  writeJSON(path.join(ASSET_DIR, fileOf(key) + '.json'), rec);
  return rec;
}
function versionsOf(key) {
  const vdir = path.join(VER_DIR, fileOf(key));
  if (!fs.existsSync(vdir)) return [];
  return fs.readdirSync(vdir).filter(f => /^\d+\.json$/.test(f)).map(f => {
    const v = readJSON(path.join(vdir, f), {});
    return { version: v.version, savedAt: v.savedAt, note: v._note || '', status: v.status || '' };
  }).sort((x, y) => y.version - x.version);
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

async function route(req, res) {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname, m = req.method;
  if (!p.startsWith('/api/')) return m === 'GET' ? serveStatic(req, res, p) : fail(res, 405, 'không hỗ trợ');
  // chặn gọi API từ trang web khác (app chỉ nghe máy cục bộ, nhưng vẫn phòng CSRF)
  if (m !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return fail(res, 403, 'yêu cầu từ nguồn lạ bị chặn');
  }

  if (p === '/api/health') return send(res, 200, { ok: true, version: VERSION });
  if (p === '/api/info') return send(res, 200, { version: VERSION, repo: REPO, home: HOME, settings: settings() });
  if (p === '/api/settings' && m === 'PUT') {
    const b = await body(req);
    const s = settings();
    if (typeof b.autoUpdate === 'boolean') s.autoUpdate = b.autoUpdate;
    if (Number.isFinite(b.checkHours) && b.checkHours >= 1 && b.checkHours <= 168) s.checkHours = Math.round(b.checkHours);
    writeJSON(SETTINGS, s);
    scheduleChecks();
    return send(res, 200, s);
  }
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

  if (p === '/api/assets' && m === 'GET') return send(res, 200, listAssets());
  const am = p.match(/^\/api\/assets\/([^/]+)\/([^/]+)(\/versions(?:\/(\d+))?)?$/);
  if (am) {
    const key = am[1] + '/' + am[2];
    if (!KEY.test(key)) return fail(res, 400, 'khoá asset không hợp lệ');
    const file = path.join(ASSET_DIR, fileOf(key) + '.json');
    if (am[3]) {
      if (am[4]) {
        const v = readJSON(path.join(VER_DIR, fileOf(key), am[4] + '.json'), null);
        return v ? send(res, 200, v) : fail(res, 404, 'không có phiên bản này');
      }
      return send(res, 200, versionsOf(key));
    }
    if (m === 'GET') { const a = readJSON(file, null); return a ? send(res, 200, a) : fail(res, 404, 'chưa có bản lưu'); }
    if (m === 'PUT') { const b = await body(req); return send(res, 200, saveAsset(key, b, b._note)); }
    if (m === 'DELETE') {
      if (!fs.existsSync(file)) return fail(res, 404, 'chưa có bản lưu');
      fs.renameSync(file, path.join(TRASH_DIR, fileOf(key) + '-' + Date.now() + '.json'));
      return send(res, 200, { ok: true });
    }
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
  const h = settings().checkHours;
  timer = setInterval(autoCheck, h * 3600 * 1000);
}

server.listen(PORT, HOST, () => {
  log('[server] gen-chibi v' + VERSION.replace(/^v/, '') + ' chạy tại http://' + HOST + ':' + PORT + ' · home ' + HOME);
  scheduleChecks();
  if (process.env.GC_NO_AUTOCHECK !== '1') setTimeout(autoCheck, 15000);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
