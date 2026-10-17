// gen-chibi — launcher: chạy server của phiên bản `current`, canh sức khoẻ sau cập nhật, tự rollback.
// © 2026 Afi Labs — All rights reserved.
// Nằm ở thư mục cài (ngoài releases/) để không bị thay giữa chừng khi cập nhật.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const HOME = process.env.GC_HOME || __dirname;
const PORT = +(process.env.GC_PORT || 7480);
const DATA = path.join(HOME, 'data');
const PENDING = path.join(DATA, 'update-pending.json');
const HISTORY = path.join(DATA, 'update-history.json');
const RESTART_CODE = 75;
const HEALTH_WINDOW_MS = +(process.env.GC_HEALTH_WINDOW_MS || 20000);

let child = null, backoff = 1000, stopping = false, checking = false;

function log(...a) { console.log(new Date().toISOString(), '[launcher]', ...a); }
function readJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }
function writeJSON(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); }
function addHistory(e) { const h = readJSON(HISTORY, []); h.unshift(Object.assign({ at: new Date().toISOString() }, e)); writeJSON(HISTORY, h.slice(0, 50)); }
function target(link) { try { return path.basename(fs.readlinkSync(path.join(HOME, link))); } catch { return null; } }
function link(name, tag) {
  const p = path.join(HOME, name), tmp = p + '.tmp';
  fs.rmSync(tmp, { force: true });
  fs.symlinkSync(path.join('releases', tag), tmp);
  fs.renameSync(tmp, p);
}
function norm(v) { return 'v' + String(v || '').trim().replace(/^v/, ''); }

// Launcher mới đi kèm phiên bản mới: tự thay mình rồi thoát để container khởi động lại.
function selfUpdate() {
  const next = path.join(HOME, 'current', 'launcher.js');
  try {
    if (fs.existsSync(next) && fs.readFileSync(next, 'utf8') !== fs.readFileSync(__filename, 'utf8')) {
      fs.copyFileSync(next, __filename + '.tmp');
      fs.renameSync(__filename + '.tmp', __filename);
      log('đã thay launcher bằng bản đi kèm', target('current'), '— khởi động lại');
      process.exit(0);
    }
  } catch (e) { log('không thay được launcher:', e.message); }
}

function health() {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 1500 }, res => {
      let s = ''; res.on('data', c => (s += c)); res.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function verifyPending() {
  const p = readJSON(PENDING, null);
  if (!p || checking) return;
  checking = true;
  const deadline = Date.now() + HEALTH_WINDOW_MS;
  let ok = false;
  while (Date.now() < deadline && !stopping) {
    const h = await health();
    if (h && h.ok && norm(h.version) === norm(p.to)) { ok = true; break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  fs.rmSync(PENDING, { force: true });
  checking = false;
  if (ok) {
    log((p.kind === 'rollback' ? 'chạy lại ' : 'cập nhật ') + p.to + ' khoẻ mạnh');
    addHistory({ kind: p.kind, from: p.from, to: p.to, ok: true, backup: p.backup || null });
    return;
  }
  // bản mới không khoẻ trong thời hạn → trả con trỏ về bản cũ
  const prev = p.kind === 'update' ? p.from : null;
  if (prev && fs.existsSync(path.join(HOME, 'releases', norm(prev)))) {
    log('bản', p.to, 'không khoẻ sau', HEALTH_WINDOW_MS / 1000, 'giây → tự rollback về', norm(prev));
    link('current', norm(prev));
    if (p.previousBefore && fs.existsSync(path.join(HOME, 'releases', p.previousBefore))) link('previous', p.previousBefore);
    else fs.rmSync(path.join(HOME, 'previous'), { force: true });
    // đánh dấu bỏ qua để tự cập nhật không áp lại bản hỏng này
    const skipFile = path.join(DATA, 'update-skip.json');
    const skip = readJSON(skipFile, []);
    if (skip.indexOf(norm(p.to)) < 0) { skip.push(norm(p.to)); writeJSON(skipFile, skip); }
    addHistory({ kind: 'update', from: p.from, to: p.to, ok: false, rolledBack: true, error: 'không qua kiểm tra sức khoẻ, đã tự chạy lại ' + norm(prev), backup: p.backup || null });
  } else {
    addHistory({ kind: p.kind, from: p.from, to: p.to, ok: false, error: 'không qua kiểm tra sức khoẻ' });
  }
  if (child) child.kill('SIGTERM');
}

function start() {
  if (stopping) return;
  selfUpdate();
  const entry = path.join(HOME, 'current', 'server', 'main.js');
  if (!fs.existsSync(entry)) { log('không thấy', entry, '— thử lại sau 5 giây'); return setTimeout(start, 5000); }
  log('chạy', target('current'));
  const startedAt = Date.now();
  child = spawn(process.execPath, [entry], { stdio: 'inherit', env: Object.assign({}, process.env, { GC_HOME: HOME, GC_PORT: String(PORT) }) });
  verifyPending();
  child.on('exit', code => {
    child = null;
    if (stopping) return process.exit(0);
    if (code === RESTART_CODE) { backoff = 1000; return setImmediate(start); }
    if (Date.now() - startedAt > 60000) backoff = 1000;
    log('server dừng với mã', code, '— chạy lại sau', backoff / 1000, 'giây');
    setTimeout(start, backoff);
    backoff = Math.min(backoff * 2, 30000);
  });
}

['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, () => { stopping = true; if (child) child.kill('SIGTERM'); else process.exit(0); }));
start();
