// gen-chibi — launcher: chạy server của phiên bản `current`, canh sức khoẻ sau cập nhật, tự rollback; giám sát cloudflared (v0.21).
// © 2026 Gen Labs — All rights reserved.
// Nằm ở thư mục cài (ngoài releases/) để không bị thay giữa chừng khi cập nhật.
// Tự đủ: chỉ dùng module có sẵn của Node, KHÔNG require mã trong releases/ — launcher phải sống được cả khi bản `current` hỏng.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');
const zlib = require('zlib');
const crypto = require('crypto');
const net = require('net');
const { spawn, execFileSync } = require('child_process');

const HOME = process.env.GC_HOME || __dirname;
const PORT = +(process.env.GC_PORT || 7480);
const DATA = path.join(HOME, 'data');
const PENDING = path.join(DATA, 'update-pending.json');
const HISTORY = path.join(DATA, 'update-history.json');
const RESTART_CODE = 75;
const HEALTH_WINDOW_MS = +(process.env.GC_HEALTH_WINDOW_MS || 20000);
// edge trong cửa sổ sức khoẻ: tính từ lúc app đã khoẻ; dài hơn vì launcher mới có thể phải tải cloudflared bản ghim mới
const EDGE_WINDOW_MS = +(process.env.GC_EDGE_HEALTH_WINDOW_MS || 120000);

// Hợp đồng của launcher (STD-11) — tăng khi launcher nhận thêm việc mà app / CLI dựa vào:
//   1 = ≤ v0.20 (tệp không có hằng này) · 2 = v0.21: giám sát cloudflared theo run/edge-intent.json, ghi run/edge-status.json.
// Bản phát hành "có edge" = launcher.js đi kèm có LAUNCHER_ABI ≥ EDGE_ABI. Đọc hằng bằng regex (abiOf), không require / eval.
// server/updater.js đọc cùng hằng này để cảnh báo rollback tay xuống bản không có edge.
const LAUNCHER_ABI = 2;
const EDGE_ABI = 2;

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
const sleep = ms => new Promise(r => setTimeout(r, ms));
// hợp đồng của một launcher.js: hằng LAUNCHER_ABI đầu dòng; không có = 1 (≤ v0.20); không đọc được tệp = 0
function abiOf(file) {
  try { const m = /^const LAUNCHER_ABI = (\d+);/m.exec(fs.readFileSync(file, 'utf8')); return m ? +m[1] : 1; } catch { return 0; }
}
function releaseHasEdge(tag) { return abiOf(path.join(HOME, 'releases', norm(tag), 'launcher.js')) >= EDGE_ABI; }

// ---------------------------------------------------------------- edge: cloudflared (v0.21, spec §3.1)
// Hợp đồng app → launcher (STD-11): app CHỈ ghi run/edge-intent.json (ghi nguyên tử: tệp tạm + rename), schema ĐÓNG
//   { "tunnel": "off" | "token" | "quick", "online": true | false }
//   tunnel  off   = không chạy cloudflared
//           token = tunnel do Cloudflare quản: cloudflared đọc run/tunnel.token (0600, app ghi; run/ KHÔNG mount vào container Caddy) MỘT LẦN lúc khởi động
//                   → tệp token đổi (nội dung / quyền) = launcher tự khởi động lại cloudflared
//           quick = link tạm *.trycloudflare.com (đổi mỗi lần khởi động)
//   online  máy đang ra Internet qua BẤT KỲ đường nào (Caddy, tunnel, proxy riêng) → không tự rollback xuống bản không có edge.
//           tunnel ≠ off thì luôn coi là online.
// Tệp không có / hỏng / giá trị lạ = off. Trường khác bị bỏ qua. Launcher tự dựng argv, đường binary cố định (bin/cloudflared-<ver>),
// kiểm SHA-256 trước MỖI lần spawn; không nhận đường dẫn / tham số nào từ tệp.
// Launcher ghi run/edge-status.json (chỉ khi đổi) cho app / CLI đọc:
//   { tunnel, online, running, pid?, ready, since, error?, detail?, url?, version, abi, launcherPid }
//   ready  = GET http://127.0.0.1:<cổng metrics>/ready trả 200 (đã nối Cloudflare) — cổng metrics do launcher chọn ngẫu nhiên (cổng rảnh) mỗi lần spawn,
//            truyền qua argv, và (Linux) socket đang nghe cổng đó phải thuộc đúng PID cloudflared đã spawn (/proc/net/tcp → inode → /proc/<pid>/fd)
//   since  = lúc (tunnel, running, ready) đổi lần cuối · url = link *.trycloudflare.com (quick)
//   error  = mã ổn định cho giao diện dịch: token-missing | token-perms | unsupported-platform | download-failed | sha-mismatch | exited | ingress-unverified
// Chứng minh cổng ingress (sửa bảo mật B): launcher sinh GC_INGRESS_NONCE (32 byte ngẫu nhiên) mỗi lần khởi động, truyền cho app con qua env (không log).
// CHỈ spawn cloudflared khi GET http://127.0.0.1:<GC_PORT+2>/api/health kèm X-GC-Ingress-Challenge: <ngẫu nhiên> trả X-GC-Ingress = HMAC-SHA256(nonce,
// "ingress:" + challenge) + đúng version của `current`; kiểm lại mỗi 30 s, sai hai lần liền → dừng cloudflared, error ingress-unverified, tự bật lại khi đúng.
// Tiến trình lạ chiếm cổng ingress trước app (app không bind được) → không bao giờ nhận lưu lượng từ Internet.
const RUN = path.join(HOME, 'run');
const INTENT = path.join(RUN, 'edge-intent.json');
const EDGE_STATUS = path.join(RUN, 'edge-status.json');
const CF_PIDF = path.join(RUN, 'cloudflared.pid');
const CF_HOME = path.join(RUN, 'cloudflared-home');   // HOME rỗng cho cloudflared: không vớ phải ~/.cloudflared của người dùng
const TOKEN_FILE = path.join(RUN, 'tunnel.token');   // run/ = chỉ app + launcher; edge/ một phần mount vào Caddy — token không ở đó
const BIN = path.join(HOME, 'bin');
const TUNNEL_LOG = path.join(HOME, 'logs', 'tunnel.log');
const TUNNEL_LOG_MAX = 1024 * 1024;   // xoay vòng: tunnel.log ≤ 1 MiB + một bản tunnel.log.1
const INGRESS_PORT = PORT + 2;   // cổng nghe riêng của app, chỉ cloudflared gửi tới (lớp E, spec §3.4) — app mở, launcher chỉ trỏ tới
const INGRESS_NONCE = crypto.randomBytes(32).toString('hex');   // một lần chạy launcher; chỉ app con nhận (env), không bao giờ ghi log / tệp
// kiểm lại cổng ingress định kỳ; GC_TEST=1 cho phép test rút ngắn (thiếu GC_TEST thì bỏ qua hẳn)
const INGRESS_RECHECK_MS = process.env.GC_TEST === '1' && +process.env.GC_TEST_INGRESS_RECHECK_MS > 0 ? +process.env.GC_TEST_INGRESS_RECHECK_MS : 30000;

// cloudflared ghim — nguồn: Cloudflare, https://github.com/cloudflare/cloudflared/releases/tag/2026.10.2 (kiểm 2026-10-20).
// sha256 = SHA-256 của CHÍNH tệp chạy (macOS: tệp `cloudflared` bên trong .tgz — launcher giải nén rồi mới kiểm).
//   linux: khớp hai nguồn độc lập — checksum của dịch vụ cập nhật chính thức https://update.argotunnel.com/?os=linux&arch=<amd64|arm64>&version=2026.10.2
//          (tính từ asset GitHub) và binary trong gói .deb của https://pkg.cloudflare.com/ (cùng một bản build). Tĩnh (CGO tắt từ 2026.10.1) → chạy được trên node:22-alpine.
//   darwin: một nguồn (update.argotunnel.com) — máy cloud của Gen chưa tải được asset GitHub để đối chiếu.
// Đổi phiên bản: sửa CF_VERSION + 4 dòng sha (lấy như trên). Bản cũ trong bin/ được giữ để edge rollback cùng app.
const CF_VERSION = '2026.10.2';
const CF_ASSETS = {
  'linux-x64': { asset: 'cloudflared-linux-amd64', sha256: '35fbdd2beb378436c7da377d7358cea8e33f9c94a6705d1d8036bf9b0d6d8005' },
  'linux-arm64': { asset: 'cloudflared-linux-arm64', sha256: 'b7e55b4d9702c2ab5f8348f780bb1db044527fc555367714c78e0595750a4665' },
  'darwin-x64': { asset: 'cloudflared-darwin-amd64.tgz', sha256: '4be2a4c0b76f6be4a84bea590743e85041949c294efcee4de86a140a9f11869a', tgz: true },
  'darwin-arm64': { asset: 'cloudflared-darwin-arm64.tgz', sha256: '823f993ef362fba5e0e288db6f3452d8de34291632971c7a40b79548420e9a18', tgz: true }
};
// CHỈ cho kiểm thử (tools/test-update.sh): GC_TEST=1 + GC_TEST_CF_URL (asset thay thế, .tgz = nén như macOS) + GC_TEST_CF_SHA256.
// Thiếu GC_TEST=1 thì hai biến kia bị bỏ qua hẳn — không có đường nào khác đổi binary hay SHA lúc chạy.
function cfPin() {
  if (process.env.GC_TEST === '1' && process.env.GC_TEST_CF_URL) {
    const url = process.env.GC_TEST_CF_URL;
    return { version: 'test', url, sha256: String(process.env.GC_TEST_CF_SHA256 || ''), tgz: /\.tgz$/.test(url) };
  }
  const a = CF_ASSETS[process.platform + '-' + process.arch];
  return a ? { version: CF_VERSION, url: 'https://github.com/cloudflare/cloudflared/releases/download/' + CF_VERSION + '/' + a.asset, sha256: a.sha256, tgz: !!a.tgz } : null;
}

function readIntent() {
  let j = null;
  try { if (fs.statSync(INTENT).size <= 4096) j = JSON.parse(fs.readFileSync(INTENT, 'utf8')); } catch { /* không có / hỏng = off */ }
  const tunnel = j && (j.tunnel === 'token' || j.tunnel === 'quick') ? j.tunnel : 'off';
  return { tunnel, online: tunnel !== 'off' || !!(j && j.online === true) };
}
// tệp token: tồn tại, tệp thường (không symlink), chỉ chủ đọc được (0600 / 0400), đúng chủ, cỡ hợp lý
function tokenProblem() {
  let st;
  try { st = fs.lstatSync(TOKEN_FILE); } catch { return { code: 'token-missing', detail: 'run/tunnel.token not found' }; }
  if (!st.isFile()) return { code: 'token-perms', detail: 'run/tunnel.token is not a regular file' };
  if (st.mode & 0o077) return { code: 'token-perms', detail: 'run/tunnel.token must be readable by the owner only (chmod 600), found ' + (st.mode & 0o777).toString(8) };
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return { code: 'token-perms', detail: 'run/tunnel.token belongs to another user' };
  if (st.size < 16 || st.size > 8192) return { code: 'token-perms', detail: 'run/tunnel.token has an unexpected size' };
  return null;
}
// dấu của tệp token: đổi nội dung / quyền / thay tệp → khởi động lại cloudflared (nó chỉ đọc token một lần)
function tokenSig() { try { const s = fs.statSync(TOKEN_FILE); return [s.ino, s.size, s.mtimeMs, s.mode].join(':'); } catch { return 'none'; } }
function sha256File(f) { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return ''; } }

// tải qua HTTPS_PROXY / NO_PROXY như server/net.js (chép lại: launcher không require mã của bản phát hành); NODE_EXTRA_CA_CERTS Node tự đọc
function noProxy(host) {
  const list = String(process.env.NO_PROXY || process.env.no_proxy || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  host = String(host).toLowerCase();
  if (/^(localhost|127\.|::1$)/.test(host)) return true;
  return list.some(e => { if (e === '*') return true; if (/\/\d+$/.test(e)) return false; const d = e.replace(/^\*?\./, ''); return host === d || host.endsWith('.' + d); });
}
function agentFor(u) {
  const p = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  if (u.protocol !== 'https:' || !p || noProxy(u.hostname)) return undefined;
  const px = new URL(p), agent = new https.Agent({ keepAlive: false });
  agent.createConnection = (opts, cb) => {
    const tgt = opts.host + ':' + (opts.port || 443), headers = { Host: tgt };
    if (px.username) headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(decodeURIComponent(px.username) + ':' + decodeURIComponent(px.password)).toString('base64');
    const req = http.request({ host: px.hostname, port: px.port || 80, method: 'CONNECT', path: tgt, headers });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return cb(new Error('proxy refused ' + opts.host + ' (' + res.statusCode + ')')); }
      cb(null, tls.connect({ socket, servername: opts.servername || opts.host }));
    });
    req.on('error', cb);
    req.end();
  };
  return agent;
}
function download(url, maxBytes = 200 * 1024 * 1024, redirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { agent: agentFor(u), headers: { 'User-Agent': 'gen-chibi-launcher' }, timeout: 30000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume(); return resolve(download(new URL(res.headers.location, url).toString(), maxBytes, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n > maxBytes) req.destroy(new Error('file too large')); else chunks.push(c); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('network timeout')));
    req.on('error', reject);
  });
}
// lấy MỘT tệp thường theo tên gốc trong tar (ustar / pax, kiểu gói .tgz của cloudflared cho macOS)
function untarOne(buf, name) {
  for (let o = 0; o + 512 <= buf.length;) {
    const h = buf.subarray(o, o + 512);
    if (!h.some(b => b !== 0)) break;
    const field = (a, b) => { const s = h.toString('utf8', a, b); const z = s.indexOf('\0'); return z < 0 ? s : s.slice(0, z); };
    const size = parseInt(field(124, 136).trim() || '0', 8) || 0, type = h[156] || 48, prefix = field(345, 500);
    const full = (prefix ? prefix + '/' : '') + field(0, 100);
    o += 512;
    if (type === 48 && path.posix.basename(full) === name) return buf.subarray(o, o + size);
    o += Math.ceil(size / 512) * 512;
  }
  return null;
}
// bin/cloudflared-<ver>: tải nếu chưa có (kiểm SHA trước khi ghi). SHA của tệp đã có kiểm ở cfStart ngay trước spawn.
async function ensureCloudflared(pin) {
  const file = path.join(BIN, 'cloudflared-' + pin.version);
  if (fs.existsSync(file)) return file;
  if (!/^[0-9a-f]{64}$/.test(pin.sha256)) throw Object.assign(new Error('no pinned SHA-256 for this platform'), { code: 'unsupported-platform' });
  edgeLog('downloading cloudflared ' + pin.version + ' from ' + pin.url);
  let buf;
  try { buf = await download(pin.url); } catch (e) { throw Object.assign(new Error('download failed: ' + e.message), { code: 'download-failed' }); }
  if (pin.tgz) {
    try { buf = untarOne(zlib.gunzipSync(buf), 'cloudflared'); } catch { buf = null; }
    if (!buf) throw Object.assign(new Error('the archive has no cloudflared file'), { code: 'download-failed' });
  }
  const got = crypto.createHash('sha256').update(buf).digest('hex');
  if (got !== pin.sha256) throw Object.assign(new Error('downloaded cloudflared does not match the pinned SHA-256 (got ' + got + ')'), { code: 'sha-mismatch' });
  fs.mkdirSync(BIN, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file + '.tmp', buf, { mode: 0o700 });
  fs.chmodSync(file + '.tmp', 0o700);
  fs.renameSync(file + '.tmp', file);
  edgeLog('cloudflared ' + pin.version + ' saved to bin/ (SHA-256 verified)');
  pruneBins(path.basename(file));
  return file;
}
// giữ bản đang ghim + 2 bản gần nhất (đủ cho rollback app một hai bước)
function pruneBins(keep) {
  try {
    const old = fs.readdirSync(BIN).filter(f => /^cloudflared-[\w.]+$/.test(f) && f !== keep)
      .map(f => ({ f, t: fs.statSync(path.join(BIN, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    old.slice(2).forEach(x => { fs.rmSync(path.join(BIN, x.f), { force: true }); edgeLog('removed old ' + x.f); });
  } catch { /* bin/ chưa có */ }
}

// log của cloudflared + sự kiện edge của launcher → logs/tunnel.log (xoay vòng có trần). Không bao giờ ghi token.
let tlogFd = null, tlogSize = 0;
function tlogWrite(buf) {
  try {
    if (tlogFd === null) {
      fs.mkdirSync(path.dirname(TUNNEL_LOG), { recursive: true });
      tlogFd = fs.openSync(TUNNEL_LOG, 'a', 0o600); tlogSize = fs.fstatSync(tlogFd).size;
    }
    if (tlogSize + buf.length > TUNNEL_LOG_MAX) {
      fs.closeSync(tlogFd); fs.renameSync(TUNNEL_LOG, TUNNEL_LOG + '.1');
      tlogFd = fs.openSync(TUNNEL_LOG, 'a', 0o600); tlogSize = 0;
    }
    fs.writeSync(tlogFd, buf); tlogSize += buf.length;
  } catch (e) { console.log('[launcher] tunnel.log:', e.message); }
}
function edgeLog(msg) { log('edge:', msg); tlogWrite(Buffer.from(new Date().toISOString() + ' [launcher] ' + msg + '\n')); }

const cf = { proc: null, mode: 'off', key: '', ready: false, metricsPort: 0, ingressAt: 0, ingressFails: 0, url: null, error: null, detail: null, nextTry: 0, backoff: 2000, startedAt: 0, intent: { tunnel: 'off', online: false } };
let edgeBusy = false, edgeHalted = false, statusKey = '', statusSince = new Date().toISOString(), edgeTimer = null, edgeWatch = null;

function cfArgs(mode, metricsPort) {
  const a = ['--no-autoupdate', 'tunnel', '--config', '/dev/null', '--metrics', '127.0.0.1:' + metricsPort, '--grace-period', '5s', '--management-diagnostics=false'];
  return mode === 'token' ? a.concat(['run', '--token-file', TOKEN_FILE]) : a.concat(['--url', 'http://127.0.0.1:' + INGRESS_PORT]);
}
// môi trường tối thiểu: không GC_MASTER_KEY / GC_API_TOKEN / TUNNEL_* của máy — cloudflared không cần, và không để token lọt vào env
function cfEnv() {
  const e = { HOME: CF_HOME, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' };
  ['HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'TZ'].forEach(k => { if (process.env[k]) e[k] = process.env[k]; });
  return e;
}
function pidIsOurCloudflared(pid) {
  let cmd = '';
  try { cmd = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8'); }
  catch { try { cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }); } catch { return false; } }
  return cmd.indexOf(path.join(BIN, 'cloudflared-')) >= 0;
}
// cloudflared mồ côi của lần chạy trước (launcher bị giết thô bạo ở native) → dừng nó, không để hai connector / hai link tạm
async function killOrphan() {
  const pid = +(readJSON(CF_PIDF, null) || 0);
  if (!pid || (cf.proc && cf.proc.pid === pid)) return;
  try { process.kill(pid, 0); } catch { return fs.rmSync(CF_PIDF, { force: true }); }
  if (!pidIsOurCloudflared(pid)) return fs.rmSync(CF_PIDF, { force: true });
  edgeLog('stopping leftover cloudflared (pid ' + pid + ')');
  try { process.kill(pid, 'SIGTERM'); } catch { /* đã thoát */ }
  for (let i = 0; i < 40; i++) { await sleep(200); try { process.kill(pid, 0); } catch { break; } }
  try { process.kill(pid, 'SIGKILL'); } catch { /* đã thoát */ }
  fs.rmSync(CF_PIDF, { force: true });
}
function cfFail(code, detail) {
  cf.error = code; cf.detail = String(detail || '').slice(0, 300);
  cf.nextTry = Date.now() + cf.backoff; cf.backoff = Math.min(cf.backoff * 2, 60000);
  edgeLog('cloudflared not started: ' + code + ' — ' + cf.detail + ' (retry in ' + Math.round((cf.nextTry - Date.now()) / 1000) + ' s)');
}
async function cfStart(mode, key) {
  cf.mode = mode; cf.key = key; cf.url = null; cf.ready = false;
  if (mode === 'token') { const p = tokenProblem(); if (p) return cfFail(p.code, p.detail); }
  const pin = cfPin();
  if (!pin) return cfFail('unsupported-platform', 'no cloudflared build pinned for ' + process.platform + '-' + process.arch);
  let bin;
  try { bin = await ensureCloudflared(pin); } catch (e) { return cfFail(e.code || 'download-failed', e.message); }
  if (stopping || edgeHalted || readIntent().tunnel !== mode) return;   // đang dừng / nhường launcher, hoặc ý định đổi trong lúc tải → vòng sau lo
  // kiểm SHA NGAY TRƯỚC KHI spawn (STD-11): tệp trong bin/ có thể đã bị đổi sau lần tải. Sai → cách ly, lần thử sau tải lại bản sạch.
  const got = sha256File(bin);
  if (got !== pin.sha256) {
    try { fs.renameSync(bin, bin + '.bad'); } catch { /* không đổi tên được: lần sau vẫn từ chối */ }
    return cfFail('sha-mismatch', path.basename(bin) + ' does not match the pinned SHA-256 — not started, moved aside to ' + path.basename(bin) + '.bad');
  }
  await killOrphan();
  if (stopping || edgeHalted) return;
  // cổng ingress phải là CHÍNH app này (thách thức-đáp HMAC + đúng version) — kiểm NGAY TRƯỚC spawn (sau tải / killOrphan có thể đã lâu)
  if (!(await ingressOK(currentVersion()))) return ingressFail();
  if (stopping || edgeHalted || readIntent().tunnel !== mode) return;
  const mport = await freePort();
  if (!mport) return cfFail('exited', 'no free local port for cloudflared metrics');
  fs.mkdirSync(CF_HOME, { recursive: true, mode: 0o700 });
  const p = spawn(bin, cfArgs(mode, mport), { cwd: CF_HOME, env: cfEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  cf.proc = p; cf.startedAt = Date.now(); cf.error = null; cf.detail = null; cf.metricsPort = mport; cf.ingressAt = Date.now() + INGRESS_RECHECK_MS; cf.ingressFails = 0;
  try { writeJSON(CF_PIDF, p.pid); } catch { /* chỉ để dọn mồ côi */ }
  edgeLog('started cloudflared ' + pin.version + ' (' + mode + ', pid ' + p.pid + ')');
  const onOut = d => {
    tlogWrite(d);
    // link tạm in ra khi tạo xong; bỏ qua api.trycloudflare.com (xuất hiện trong câu báo lỗi khi không xin được tunnel)
    if (mode === 'quick' && !cf.url) { const m = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/.exec(d.toString('utf8')); if (m) { cf.url = m[0]; edgeTick(); } }
  };
  p.stdout.on('data', onOut); p.stderr.on('data', onOut);
  p.on('error', e => {   // không chạy được (quyền / định dạng tệp): không có 'exit' → tự dọn, thử lại theo nhịp lùi
    edgeLog('cloudflared error: ' + e.message);
    if (cf.proc === p && !p.pid) { cf.proc = null; cf.ready = false; cfFail('exited', 'cannot run cloudflared: ' + e.message); }
  });
  p.on('exit', (code, sig) => {
    if (cf.proc !== p) return;
    cf.proc = null; cf.ready = false; cf.url = null;
    fs.rmSync(CF_PIDF, { force: true });
    if (p.intentional) { edgeLog('cloudflared stopped'); return edgeTick(); }
    if (Date.now() - cf.startedAt > 60000) cf.backoff = 2000;
    cfFail('exited', 'cloudflared exited (' + (sig || 'code ' + code) + ') — see logs/tunnel.log');
    edgeTick();
  });
}
function cfStop(why) {
  const p = cf.proc;
  if (!p) return Promise.resolve();
  return new Promise(resolve => {
    p.intentional = true;
    edgeLog('stopping cloudflared (' + why + ')');
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* đã thoát */ } }, 8000);
    p.once('exit', () => { clearTimeout(t); resolve(); });
    try { p.kill('SIGTERM'); } catch { clearTimeout(t); resolve(); }
  });
}
function getOK(port, p, headers) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 1500, headers: headers || {} }, res => {
      let s = ''; res.on('data', c => { if (s.length < 65536) s += c; }); res.on('end', () => resolve({ code: res.statusCode, body: s, headers: res.headers }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
function safeEq(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function currentVersion() { try { return norm(fs.readFileSync(path.join(HOME, 'current', 'VERSION'), 'utf8')); } catch { return null; } }
// cổng ingress trả lời đúng là app CON của launcher này (biết nonce) + đúng version (ver null = không so version)
async function ingressOK(ver) {
  const ch = crypto.randomBytes(16).toString('hex');
  const r = await getOK(INGRESS_PORT, '/api/health', { 'X-GC-Ingress-Challenge': ch });
  if (!r || r.code !== 200 || !safeEq(r.headers['x-gc-ingress'], crypto.createHmac('sha256', INGRESS_NONCE).update('ingress:' + ch).digest('hex'))) return false;
  try { const h = JSON.parse(r.body); return h.ok === true && (!ver || norm(h.version) === norm(ver)); } catch { return false; }
}
// không spawn: thử lại sau 2 s (app có thể đang khởi động), không lùi theo cấp số — chỉ ghi log khi trạng thái đổi
function ingressFail() {
  if (cf.error !== 'ingress-unverified') edgeLog('cloudflared not started: 127.0.0.1:' + INGRESS_PORT + ' does not answer as this gen-chibi (app still starting, or another process holds the port)');
  cf.error = 'ingress-unverified'; cf.detail = '127.0.0.1:' + INGRESS_PORT + ' did not prove it is this gen-chibi'; cf.nextTry = Date.now() + 2000;
}
// cổng rảnh do hệ điều hành chọn (bind 0 rồi đóng) — cổng metrics mỗi lần spawn một khác, tiến trình lạ không giữ sẵn được
function freePort() {
  return new Promise(resolve => {
    const s = net.createServer();
    s.on('error', () => resolve(0));
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
// (Linux) socket đang LISTEN ở cổng này thuộc đúng tiến trình pid? Không đọc được /proc/net/tcp (macOS…) → dựa vào cổng ngẫu nhiên (true)
function portOwnedBy(pid, port) {
  const hex = ':' + port.toString(16).toUpperCase().padStart(4, '0'), inodes = new Set();
  let readable = false;
  for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let t = ''; try { t = fs.readFileSync(f, 'utf8'); readable = true; } catch { continue; }
    t.split('\n').slice(1).forEach(l => { const c = l.trim().split(/\s+/); if (c.length > 9 && c[3] === '0A' && c[1].endsWith(hex)) inodes.add(c[9]); });
  }
  if (!readable) return true;
  if (!inodes.size) return false;
  let fds = []; try { fds = fs.readdirSync('/proc/' + pid + '/fd'); } catch { return false; }
  return fds.some(fd => { try { const m = /^socket:\[(\d+)\]$/.exec(fs.readlinkSync('/proc/' + pid + '/fd/' + fd)); return !!m && inodes.has(m[1]); } catch { return false; } });
}
async function cfReady() {
  if (!cf.proc || !cf.metricsPort || !portOwnedBy(cf.proc.pid, cf.metricsPort)) return false;
  const r = await getOK(cf.metricsPort, '/ready'); return !!r && r.code === 200;
}
function writeEdgeStatus() {
  const st = { tunnel: cf.intent.tunnel, online: cf.intent.online, running: !!cf.proc, pid: cf.proc ? cf.proc.pid : undefined, ready: !!cf.proc && cf.ready };
  const key = [st.tunnel, st.running, st.ready].join('|');
  if (key !== statusKey) { statusKey = key; statusSince = new Date().toISOString(); }
  Object.assign(st, { since: statusSince, error: cf.error || undefined, detail: cf.detail || undefined, url: cf.url || undefined, version: (cfPin() || {}).version || null, abi: LAUNCHER_ABI, launcherPid: process.pid });
  const s = JSON.stringify(st, null, 2);
  if (s === writeEdgeStatus.last) return;
  writeEdgeStatus.last = s;
  try { fs.mkdirSync(RUN, { recursive: true, mode: 0o700 }); fs.writeFileSync(EDGE_STATUS + '.tmp', s); fs.renameSync(EDGE_STATUS + '.tmp', EDGE_STATUS); } catch (e) { log('edge-status:', e.message); }
}
// một vòng đối chiếu: ý định (tệp) ↔ tiến trình. Gọi theo nhịp 2 s + khi run/ đổi (fs.watch, debounce).
async function edgeTick() {
  if (edgeBusy || stopping || edgeHalted) return;
  edgeBusy = true;
  try {
    const want = readIntent(); cf.intent = want;
    const key = want.tunnel === 'token' ? 'token:' + tokenSig() : want.tunnel;
    if (key !== cf.key) { cf.nextTry = 0; cf.backoff = 2000; if (!cf.proc) { cf.error = null; cf.detail = null; } }
    if (cf.proc && (want.tunnel !== cf.mode || key !== cf.key)) await cfStop(want.tunnel === 'off' ? 'tunnel off' : 'intent / token changed');
    if (want.tunnel === 'off') { cf.key = key; cf.mode = 'off'; cf.error = null; cf.detail = null; cf.url = null; }
    else if (!cf.proc && Date.now() >= cf.nextTry) await cfStart(want.tunnel, key);
    else if (cf.proc && Date.now() >= cf.ingressAt) {   // kiểm lại cổng ingress: sai hai lần liền (cách 3 s — app khởi động lại thì kịp lên) → dừng cloudflared
      if (await ingressOK(null)) { cf.ingressFails = 0; cf.ingressAt = Date.now() + INGRESS_RECHECK_MS; }
      else if (++cf.ingressFails < 2) cf.ingressAt = Date.now() + 3000;
      else { await cfStop('ingress port no longer proves it is this gen-chibi'); cf.ingressFails = 0; ingressFail(); }
    }
    cf.ready = await cfReady();
    writeEdgeStatus();
  } catch (e) { edgeLog('edge loop: ' + e.message); }
  finally { edgeBusy = false; }
}
function edgeInit() {
  try { fs.mkdirSync(RUN, { recursive: true, mode: 0o700 }); } catch (e) { log('cannot create run/:', e.message); }
  edgeTimer = setInterval(edgeTick, 2000);
  let t = null;
  try { edgeWatch = fs.watch(RUN, () => { clearTimeout(t); t = setTimeout(edgeTick, 200); }); edgeWatch.on('error', () => {}); } catch { /* chỉ còn nhịp 2 s */ }
  edgeTick();
}
// cloudflared còn sống + /ready (đúng tiến trình) + cổng nghe riêng của app (đường request thật đi qua tunnel) chứng minh là app này, đúng phiên bản
async function edgeHealthy(ver) {
  return (await cfReady()) && (await ingressOK(ver));
}

// ---------------------------------------------------------------- cập nhật: launcher mới, sức khoẻ, rollback
// Launcher mới đi kèm phiên bản mới: tự thay mình rồi khởi động lại.
// Docker: thoát, container tự khởi động lại (restart: unless-stopped). Native (nohup, không ai canh): tự chạy launcher mới
// cùng env + cùng tệp log, trao tệp pid cho nó (genchibi stop / status đọc tệp này) rồi mới thoát — trước v0.20.1 thoát luôn
// nên bản native tắt hẳn sau lần cập nhật có launcher mới (CNS-171).
// Chỉ thay bằng launcher có hợp đồng ≥ của mình: rollback về bản cũ (≤ v0.20) không kéo launcher không biết edge về (CNS-170).
const PIDF = path.join(HOME, 'logs', 'launcher.pid');
let abiNoted = '';
async function selfUpdate() {
  const next = path.join(HOME, 'current', 'launcher.js');
  try {
    if (!fs.existsSync(next) || fs.readFileSync(next, 'utf8') === fs.readFileSync(__filename, 'utf8')) return;
    const abi = abiOf(next);
    if (abi < LAUNCHER_ABI) {
      if (abiNoted !== target('current')) { abiNoted = target('current'); log('keeping this launcher (contract ' + LAUNCHER_ABI + '): the one shipped in', abiNoted, 'has contract', abi, '— it would drop the edge'); }
      return;
    }
    fs.copyFileSync(next, __filename + '.tmp');
    fs.renameSync(__filename + '.tmp', __filename);
    log('replaced the launcher with the one shipped in', target('current'), '— restarting');
    edgeHalted = true;                   // từ đây không bật lại cloudflared trong launcher sắp nhường chỗ
    await cfStop('launcher replaced');   // launcher mới chạy lại cloudflared; không để tiến trình cũ thành mồ côi
    if (process.env.GC_IN_DOCKER === '1') process.exit(0);
    const c = spawn(process.execPath, [__filename], { detached: true, stdio: 'inherit', env: process.env, cwd: process.cwd() });
    try { fs.mkdirSync(path.dirname(PIDF), { recursive: true }); fs.writeFileSync(PIDF, String(c.pid)); } catch (e) { log('could not write', PIDF, e.message); }
    c.unref();
    process.exit(0);
  } catch (e) { edgeHalted = false; log('could not replace the launcher:', e.message); }
}

async function health() { const r = await getOK(PORT, '/api/health'); try { return JSON.parse(r.body); } catch { return null; } }

async function verifyPending() {
  const p = readJSON(PENDING, null);
  if (!p || checking) return;
  checking = true;
  // app có thể ghi pending MỚI (cập nhật / rollback tiếp) trong lúc đang kiểm: pending cũ hết hiệu lực — không xoá nhầm pending mới,
  // không kết luận "hỏng" vì thấy phiên bản mới hơn (trước v0.21 có cả hai lỗi này; cửa sổ edge dài làm chúng dễ xảy ra hơn)
  const same = () => { const q = readJSON(PENDING, null); return !!q && q.at === p.at && q.to === p.to; };
  const deadline = Date.now() + HEALTH_WINDOW_MS;
  let ok = false, why = 'không qua kiểm tra sức khoẻ';
  while (Date.now() < deadline && !stopping && same()) {
    const h = await health();
    if (h && h.ok && norm(h.version) === norm(p.to)) { ok = true; break; }
    await sleep(1000);
  }
  // edge (CNS-170): tunnel đang sẵn sàng lúc bắt đầu cập nhật (updater chụp run/edge-status.json vào pending) → bản mới phải giữ được nó
  if (ok && p.edge && p.edge.ready === true && readIntent().tunnel !== 'off') {
    const edl = Date.now() + EDGE_WINDOW_MS;
    let eok = false;
    while (Date.now() < edl && !stopping && same()) { if (await edgeHealthy(p.to)) { eok = true; break; } await sleep(1000); }
    if (!eok) { ok = false; why = 'edge không sẵn sàng (cloudflared / cổng ' + INGRESS_PORT + ') sau ' + Math.round(EDGE_WINDOW_MS / 1000) + ' s'; }
  }
  if (stopping) { checking = false; return; }   // đang tắt: giữ pending, lần chạy sau kiểm lại — không rollback vì bị ngắt giữa chừng
  if (!same()) { checking = false; log('check of', p.to, 'superseded by a newer update / rollback'); return verifyPending(); }
  fs.rmSync(PENDING, { force: true });
  checking = false;
  if (ok) {
    log((p.kind === 'rollback' ? 'rollback to ' : 'update to ') + p.to + ' is healthy');
    addHistory({ kind: p.kind, from: p.from, to: p.to, ok: true, backup: p.backup || null });
    return;
  }
  // bản mới không khoẻ trong thời hạn → trả con trỏ về bản cũ
  const prev = p.kind === 'update' ? p.from : null;
  if (prev && fs.existsSync(path.join(HOME, 'releases', norm(prev)))) {
    // máy đang online mà bản cũ không có edge → rollback = máy biến khỏi Internet, không ai được báo (CNS-170): giữ bản mới, báo đỏ
    if (readIntent().online && !releaseHasEdge(prev)) {
      log('version', p.to, 'not healthy (' + why + ') but', norm(prev), 'has no edge support and this machine is online → NOT rolling back');
      addHistory({ kind: 'update', from: p.from, to: p.to, ok: false, rolledBack: false, rollbackBlocked: true, error: why + '; KHÔNG tự chạy lại ' + norm(prev) + ' vì bản đó không có edge — máy đang online sẽ mất kết nối. Chạy lại bản cũ bằng tay nếu chấp nhận offline.', backup: p.backup || null });
      return;
    }
    log('version', p.to, 'not healthy (' + why + ') → rolling back to', norm(prev));
    link('current', norm(prev));
    if (p.previousBefore && fs.existsSync(path.join(HOME, 'releases', p.previousBefore))) link('previous', p.previousBefore);
    else fs.rmSync(path.join(HOME, 'previous'), { force: true });
    // đánh dấu bỏ qua để tự cập nhật không áp lại bản hỏng này
    const skipFile = path.join(DATA, 'update-skip.json');
    const skip = readJSON(skipFile, []);
    if (skip.indexOf(norm(p.to)) < 0) { skip.push(norm(p.to)); writeJSON(skipFile, skip); }
    addHistory({ kind: 'update', from: p.from, to: p.to, ok: false, rolledBack: true, error: why + ', đã tự chạy lại ' + norm(prev), backup: p.backup || null });
  } else {
    addHistory({ kind: p.kind, from: p.from, to: p.to, ok: false, error: why });
  }
  if (child) child.kill('SIGTERM');
}

async function start() {
  if (stopping) return;
  await selfUpdate();
  const entry = path.join(HOME, 'current', 'server', 'main.js');
  if (!fs.existsSync(entry)) { log('not found:', entry, '— retrying in 5 s'); return setTimeout(start, 5000); }
  log('starting', target('current'));
  const startedAt = Date.now();
  child = spawn(process.execPath, [entry], { stdio: 'inherit', env: Object.assign({}, process.env, { GC_HOME: HOME, GC_PORT: String(PORT), GC_INGRESS_NONCE: INGRESS_NONCE }) });
  verifyPending();
  child.on('exit', code => {
    child = null;
    if (stopping) return;
    if (code === RESTART_CODE) { backoff = 1000; return setImmediate(start); }
    if (Date.now() - startedAt > 60000) backoff = 1000;
    log('server exited with code', code, '— restarting in', backoff / 1000, 's');
    setTimeout(start, backoff);
    backoff = Math.min(backoff * 2, 30000);
  });
}

// dừng sạch: SIGTERM / SIGINT → dừng cloudflared + server, chờ cả hai rồi mới thoát
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(edgeTimer); if (edgeWatch) edgeWatch.close();
  const app = new Promise(r => { if (!child) return r(); child.once('exit', r); child.kill('SIGTERM'); });
  await Promise.all([app, cfStop('launcher stopping')]);
  cf.intent = readIntent(); writeEdgeStatus();
  process.exit(0);
}

if (require.main === module) {
  ['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, shutdown));
  process.on('exit', () => { if (cf.proc) try { cf.proc.kill('SIGKILL'); } catch { /* đã thoát */ } });   // launcher chết bất thường: không bỏ lại cloudflared
  // tự thay launcher TRƯỚC khi bật edge: không khởi động (hay tải) cloudflared trong một launcher sắp nhường chỗ
  selfUpdate().then(() => { edgeInit(); start(); });
} else {
  // tools/test-update.sh kiểm các hàm thuần (schema ý định, hợp đồng, giải nén) mà không chạy launcher
  module.exports = { readIntent, abiOf, untarOne, cfArgs, cfPin, tokenProblem, portOwnedBy, freePort, LAUNCHER_ABI, EDGE_ABI, CF_VERSION, CF_ASSETS, INGRESS_PORT };
}
