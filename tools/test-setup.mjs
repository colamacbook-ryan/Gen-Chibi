// Kiểm thiết lập lần đầu của owner (v0.23, spec v023-owner-ready §A.0–§A.5; cortex CNS-251…267). Server tạm thật + CLI thật, không ra mạng ngoài.
//  0) đơn vị (đồng hồ giả): máy trạng thái setup.json (bảng lối vào, chỉ tiến, sàn admin đã chết, reset / skip) · cửa sổ admin (quyền / hạn / nội dung) ·
//     adminReasons từng điều kiện của máy + request · phiên admin 30 phút, không cookie thiết bị · init nguyên tử (ghi setup.json lỗi → auth.json như cũ)
//  1) admin / admin qua HTTP: bị từ chối ĐÚNG lý do ở từng ca (ngoài cửa sổ · online · GC_PUBLIC_URL · tunnel · edge Caddy · Docker publish · GC_BIND ·
//     Origin / Host lạ · header proxy / edge · sau khởi tạo · sau khôi phục sao lưu · sau khi xoá auth.json) · trần xét TRƯỚC khi so mật khẩu
//  2) phiên admin: chỉ màn khởi tạo (mọi /api khác 403 gate, /mcp 401) · không cookie thiết bị · Max-Age 30 phút
//  3) POST /api/auth/init: nguyên tử · thu hồi mọi phiên admin · song song chỉ một lần · 4 rào CSRF / rebinding (Host lạ · *.localhost · Origin khác cổng ·
//     thiếu X-GC-Request) cho CẢ đăng nhập admin lẫn init · luật tên đăng nhập / mật khẩu · đăng nhập sau đó bằng tên + mật khẩu
//  4) cổng stage: phiên S / token kèm X-GC-Studio / cookie thiết bị đều bị giữ ở wizard; agent (token) + /mcp không bị chặn
//  5) mọi lối vào của bảng §A.0 (mỗi dòng một ca) + máy v0.21 / v0.22 "online tạm, chờ mật khẩu" vẫn online rồi tự xong khi có owner
//  6) Go online bị chặn khi chưa khởi tạo (API + CLI) — máy kế thừa được miễn (migrate)
//  7) wizard: chọn local / local-pending · tự kiểm cục bộ thật (HTTP + token + stdio) bắt buộc · "nối sau" chỉ khi tự kiểm đạt · lastClient (tên / kênh) ·
//     dải nhắc · skip / reset (chỉ token) · kiểm từ Internet chỉ báo
//  8) khôi phục sao lưu: kết nối OAuth trong bản sao lưu không sống lại (CNS-138) · admin không sống lại · CLI genchibi restore
//  9) CLI: genchibi open / start mở cửa sổ (native: GC_BIND; Docker giả: docker compose config chỉ loopback — override 0.0.0.0 / config lỗi → không mở) ·
//     genchibi password (chạy / dừng) khởi tạo · --init-stdin · genchibi setup / skip / reset / hint · status · không mật khẩu trong argv
// 10) ngôn ngữ: mọi câu mới của server có bản en (không lọt chữ Việt ở en), vi trả tiếng Việt
// Dùng: node tools/test-setup.mjs   (cổng 7951–7969). GC_TEST_ROOT=<cây mã khác> để chạy bộ kiểm trên bản đã sửa (đột biến).
// © 2026 Gen Labs — All rights reserved.
import http from 'http';
import crypto from 'crypto';
import { spawn, spawnSync, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = process.env.GC_TEST_ROOT ? path.resolve(process.env.GC_TEST_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { Setup, adminReasons, loginReasons, REASON_MSG, loginProblem, emailProblem } = require(ROOT + '/server/setup.js');
const { acmeEmail } = require(ROOT + '/server/caddy.js');
const { Auth, TTL } = require(ROOT + '/server/auth.js');
const VI_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

let failn = 0, passn = 0;
const ok = (c, m, extra) => { if (c) { passn++; console.log('   ✓', m); } else { failn++; console.log('   ✗', m + (extra ? ' — ' + String(extra).slice(0, 600) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), 'gc-setup-' + p + '-'));
const kids = [];
process.on('exit', () => kids.forEach(k => { try { k.c.kill(); } catch (e) { /* đã tắt */ } }));
process.on('uncaughtException', e => { console.log('   ✗ lỗi bất ngờ: ' + (e && e.stack)); process.exit(1); });
for (const sg of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sg, () => process.exit(130));

const baseEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GC_/.test(k)));
function boot(port, env, home) {
  home = home || tmp('h' + port);
  const c = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...baseEnv(), GC_HOME: home, GC_PORT: String(port), GC_NO_AUTOCHECK: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { c, home, port, out: '' }; kids.push(k); HOME_OF[port] = home;
  c.stdout.on('data', d => { k.out += d; }); c.stderr.on('data', d => { k.out += d; });
  return k;
}
async function ready(k) { for (let i = 0; i < 100; i++) { try { const r = await req(k.port, 'GET', '/api/health'); if (r.status === 200) return k; } catch (e) { /* chưa lên */ } await sleep(100); } throw new Error('server không lên ở cổng ' + k.port + '\n' + k.out); }
async function stop(k) { if (k.c.exitCode !== null) return; k.c.kill(); await new Promise(r => k.c.once('exit', r)); }
const agent = new http.Agent({ keepAlive: false, maxSockets: 64 });
function req(port, method, p, o) {
  o = o || {};
  return new Promise((done, bad) => {
    const body = o.body === undefined ? null : Buffer.from(typeof o.body === 'string' ? o.body : JSON.stringify(o.body));
    const headers = Object.assign({ host: '127.0.0.1:' + port }, body ? { 'content-type': 'application/json', 'content-length': body.length } : {}, o.headers || {});
    Object.keys(headers).forEach(k => { if (headers[k] === null) delete headers[k]; });
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers, agent }, res => {
      const ch = []; res.on('data', d => ch.push(d));
      res.on('end', () => { const text = Buffer.concat(ch).toString(); let json = null; try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ } done({ status: res.statusCode, headers: res.headers, text, json, set: res.headers['set-cookie'] || [] }); });
    });
    r.on('error', bad); if (body) r.write(body); r.end();
  });
}
const jar = set => Object.fromEntries(set.map(x => x.split(';')[0]).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]).filter(([, v]) => v));
const cookie = j => ({ cookie: Object.entries(j).map(([k, v]) => k + '=' + v).join('; ') });
const W = { 'x-gc-request': '1' };
const bearer = t => ({ authorization: 'Bearer ' + t });
const local = port => ({ host: 'localhost:' + port, origin: 'http://localhost:' + port, ...W });   // trình duyệt trên máy chủ, đúng nguồn
const tokOf = home => fs.readFileSync(path.join(home, 'data/owner-token'), 'utf8').trim();
const stageOf = home => { try { return JSON.parse(fs.readFileSync(path.join(home, 'data/setup.json'), 'utf8')).stage; } catch (e) { return ''; } };
// cửa sổ admin như CLI ghi (run/admin-window 0600, run/ 0700): mode native | docker, composeLoopback
function openWindow(home, o) {
  o = o || {};
  fs.mkdirSync(path.join(home, 'run'), { recursive: true, mode: 0o700 });
  const f = path.join(home, 'run/admin-window');
  const key = o.key === undefined ? crypto.randomBytes(16).toString('hex') : o.key;
  fs.writeFileSync(f, JSON.stringify(Object.assign({ v: 1, exp: Date.now() + (o.ms === undefined ? 1800e3 : o.ms), mode: o.mode || 'native', composeLoopback: o.cl === true, by: 'test' }, key === null ? {} : { key })) + '\n', { mode: 0o600 });
  fs.chmodSync(f, o.perm || 0o600);
  KEYS[home] = key; return key;
}
// khoá một lần của cửa sổ (CNS-268): như trang /login#k=<khoá> gửi kèm. keyOf(port) = khoá của cửa sổ đang mở ở server cổng đó
const KEYS = {}, HOME_OF = {};
const keyOf = port => { try { return JSON.parse(fs.readFileSync(path.join(HOME_OF[port], 'run/admin-window'), 'utf8')).key || ''; } catch (e) { return ''; } };   // đọc như người có quyền đọc run/ (0700)
const adminLogin = (port, hd, pw, key) => req(port, 'POST', '/api/auth/login', { headers: Object.assign(local(port), hd || {}), body: { username: 'admin', password: pw || 'admin', key: key === undefined ? keyOf(port) : key } });
const PW = 'mot cum tu chu so huu dai', PW2 = 'mat khau moi cua owner day';
const initBody = (u, pw) => ({ username: u || 'ryan', displayName: 'Ryan', email: 'ryan@example.com', password: pw || PW, password2: pw || PW });
const mcpInit = (port, headers, name) => req(port, 'POST', '/mcp', { headers: Object.assign({ host: '127.0.0.1:' + port }, headers), body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: name || 't', version: '1' } } } });
function weakHash(pw) { const salt = crypto.randomBytes(16), h = crypto.scryptSync(pw, salt, 32, { N: 1024, r: 8, p: 1 }); return ['scrypt', 1024, 8, 1, salt.toString('base64url'), h.toString('base64url')].join('$'); }
function seedPassword(home, pw, extra) { fs.mkdirSync(path.join(home, 'data'), { recursive: true }); fs.writeFileSync(path.join(home, 'data/auth.json'), JSON.stringify({ v: 1, users: { owner: Object.assign({ id: 'owner', role: 'owner', hash: weakHash(pw), setAt: new Date().toISOString() }, extra || {}) }, sessions: {}, devices: {} }), { mode: 0o600 }); }
// CLI thật trên một thư mục cài giả (native: current → cây mã đang kiểm)
function cliHome(port, envText) {
  const HD = tmp('cli' + port); fs.symlinkSync(ROOT, path.join(HD, 'current'));
  fs.writeFileSync(path.join(HD, '.env'), envText || ('GC_MODE=native\nGC_PORT=' + port + '\nGC_LANG=en\n'));
  return HD;
}
function shims(dir, extra) {
  const FB = path.join(dir, 'fakebin'); fs.mkdirSync(FB, { recursive: true });
  const LOG = path.join(FB, 'argv.log'), realCurl = execFileSync('bash', ['-c', 'command -v curl'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(FB, 'curl'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> ' + JSON.stringify(LOG) + '\nexec ' + JSON.stringify(realCurl) + ' "$@"\n', { mode: 0o755 });
  for (const o of ['open', 'xdg-open']) fs.writeFileSync(path.join(FB, o), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> ' + JSON.stringify(path.join(FB, 'opened.txt')) + '\n', { mode: 0o755 });
  Object.entries(extra || {}).forEach(([n, body]) => fs.writeFileSync(path.join(FB, n), body, { mode: 0o755 }));
  return { FB, LOG };
}
const cliRunK = (HD, FB, args) => cliRun(HD, FB, args, '', { HOME: path.join(fs.readlinkSync(path.join(HD, '.khome'))), GC_TEST: '1' });   // GC_TEST=1: sàn tin cậy kiểm thử (tệp đã kiểm của test là v0.0.0)   // bản cài Docker giả (HOME riêng — xem HDk)
const cliRun = (HD, FB, args, input, env) => { const r = spawnSync('bash', [path.join(ROOT, 'cli/genchibi')].concat(args), { env: { ...baseEnv(), GC_HOME: HD, GC_CLI_INNER: '1', PATH: FB + ':' + process.env.PATH, ...(env || {}) }, input: input || '', encoding: 'utf8', timeout: 60000 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };

/* ================================================================== 0) đơn vị */
console.log('0) đơn vị: setup.json (bảng lối vào, chỉ tiến, sàn) · cửa sổ admin · adminReasons · phiên admin · init nguyên tử');
{
  let t = Date.parse('2026-10-22T00:00:00Z'); const now = () => t;
  const mk = () => { const h = tmp('u'); return { h, s: new Setup({ dataDir: path.join(h, 'data'), runDir: path.join(h, 'run'), now }) }; };
  let u = mk(); ok(u.s.boot({}) === 'admin' && stageOf(u.h) === 'admin', 'bản cài mới (chưa setup.json, không mật khẩu, không kế thừa) → admin');
  { const u3 = mk(); u3.s.boot({}); const u4 = new Setup({ dataDir: path.join(u3.h, 'data'), runDir: path.join(u3.h, 'run'), now });
    ok(u4.boot({ hasPassword: true }) === 'must_init' && stageOf(u3.h) === 'must_init', 'review F3: setup.json nói admin nhưng auth.json đã có mật khẩu → must_init (admin không bao giờ khởi tạo đè mật khẩu)'); }
  ok(emailProblem('#ops@example.com') && acmeEmail('#ops@example.com') === '' && emailProblem('o#ps@example.com') === '' && acmeEmail('ops@example.com') === 'ops@example.com', "review 🔵2: email bắt đầu bằng '#' (chú thích Caddyfile) bị từ chối ở cả màn khởi tạo lẫn Caddy; lớp ký tự chặt giữ nguyên");
  u = mk(); ok(u.s.boot({ legacy: true, hasPassword: false }) === 'done' && !u.s.view().review, 'máy kế thừa (legacy.json) → done, không dải kiểm tra');
  u = mk(); ok(u.s.boot({ hasPassword: true }) === 'done' && u.s.view().review === true, 'máy v0.21 / v0.22 đã có mật khẩu → done + "Kiểm tra thiết lập" một lần');
  u = mk(); ok(u.s.boot({ onlineWaiting: true }) === 'must_init', 'máy v0.21 / v0.22 "online tạm, chờ mật khẩu" → must_init (owner vào bằng token / genchibi password)');
  u = mk(); u.s.boot({});
  ok(u.s.advance('domain', 't') && !u.s.advance('must_init', 't') && !u.s.advance('domain', 't') && u.s.stage === 'domain', 'stage chỉ tiến: domain → must_init / domain bị bỏ qua');
  ok(fs.readFileSync(path.join(u.h, 'run/setup-floor'), 'utf8').trim() === 'must_init' && (fs.statSync(path.join(u.h, 'run/setup-floor')).mode & 0o777) === 0o600 && (fs.statSync(path.join(u.h, 'data/setup.json')).mode & 0o777) === 0o600, 'rời admin → sàn run/setup-floor (0600) + setup.json 0600');
  fs.writeFileSync(path.join(u.h, 'data/setup.json'), JSON.stringify({ v: 1, stage: 'admin', history: [] }));   // như khôi phục bản sao lưu chụp trước khi khởi tạo
  const u2 = new Setup({ dataDir: path.join(u.h, 'data'), runDir: path.join(u.h, 'run'), now });
  ok(u2.boot({}) === 'must_init', 'setup.json nói admin nhưng sàn đã đóng (khôi phục / sửa tay) → must_init, không bao giờ admin');
  fs.rmSync(path.join(u.h, 'data/setup.json'));
  ok(new Setup({ dataDir: path.join(u.h, 'data'), runDir: path.join(u.h, 'run'), now }).boot({}) === 'must_init', 'xoá setup.json + auth.json (máy trống) mà sàn còn → must_init');
  ok(u2.reset(false, 't') === 'must_init' && u2.reset(true, 't') === 'domain' && u2.stage !== 'admin', 'genchibi setup reset: có mật khẩu → domain, không → must_init — không bao giờ admin');
  ok(u2.skip('x', 't') && u2.stage === 'done' && u2.view().skipped.reason === 'x' && !u2.skip('y', 't'), 'genchibi setup skip: domain → done, ghi lý do; đã done thì không còn gì để bỏ qua');
  const u3 = mk(); u3.s.boot({}); ok(!u3.s.skip('x', 't') && u3.s.stage === 'admin', 'skip KHÔNG bỏ được khởi tạo owner (stage admin giữ nguyên)');
  // CNS-277 (v0.23.1): agent gọi MCP mãi mãi — sau khi xong, setup.json chỉ ghi lại lastClient cùng agent ≤ 1 lần / 24 giờ (trước: mỗi 60 giây, mãi mãi)
  { const sc = mk(); sc.s.boot({}); const f = path.join(sc.h, 'data/setup.json'), writes = () => fs.statSync(f).mtimeMs;
    const t0 = t; sc.s.seenClient('claude-code', 'stdio'); const a1 = sc.s.view().mcp.lastClient.at;
    t += 61e3; sc.s.seenClient('claude-code', 'stdio'); const a2 = sc.s.view().mcp.lastClient.at;
    sc.s.advance('done', 'skip'); const m0 = writes(); const at0 = JSON.parse(fs.readFileSync(f, 'utf8')).mcp.lastClient.at;
    let n = 0; for (let i = 0; i < 300; i++) { t += 61e3; const b = JSON.parse(fs.readFileSync(f, 'utf8')).mcp.lastClient.at; sc.s.seenClient('claude-code', 'stdio'); if (JSON.parse(fs.readFileSync(f, 'utf8')).mcp.lastClient.at !== b) n++; }
    const late = JSON.parse(fs.readFileSync(f, 'utf8')).mcp.lastClient.at;
    t += 24 * 3600e3; sc.s.seenClient('claude-code', 'stdio'); const day = JSON.parse(fs.readFileSync(f, 'utf8')).mcp.lastClient.at;
    sc.s.seenClient('cursor', 'http'); const other = JSON.parse(fs.readFileSync(f, 'utf8')).mcp.lastClient;
    ok(a2 !== a1 && n === 0 && late === at0 && day !== late && other.name === 'cursor' && other.channel === 'http' && Object.keys(JSON.parse(fs.readFileSync(f, 'utf8')).mcp).length <= 6 && m0 > 0,
      'CNS-277: lastClient — trước khi xong ghi mỗi ≥ 60 s; đã xong: 300 lần gọi cách 61 s (5 giờ) KHÔNG ghi lại setup.json, sau 24 giờ ghi một lần, agent / kênh khác ghi ngay; một bản ghi duy nhất (không danh sách lớn dần)', JSON.stringify({ a1, a2, n, at0, late, day, other }));
    t = t0; }
  // cửa sổ admin
  const w = mk(); w.s.boot({});
  ok(w.s.windowOf().reason === 'window', 'cửa sổ: không có tệp → window');
  openWindow(w.h, { ms: t - Date.now() + 1800e3 }); ok(w.s.windowOf().ok, 'cửa sổ: tệp 0600 hạn 30 phút → mở');
  fs.chmodSync(path.join(w.h, 'run/admin-window'), 0o644); ok(w.s.windowOf().reason === 'window-perms', 'cửa sổ: tệp 0644 (người khác đọc / ghi được) → window-perms');
  openWindow(w.h, { ms: t - Date.now() - 1000 }); ok(w.s.windowOf().reason === 'window', 'cửa sổ: hết hạn → window');
  openWindow(w.h, { ms: t - Date.now() + 5 * 3600e3 }); ok(w.s.windowOf().reason === 'window-perms', 'cửa sổ: hạn xa hơn 30 phút (không do genchibi ghi) → window-perms');
  fs.writeFileSync(path.join(w.h, 'run/admin-window'), 'not json', { mode: 0o600 }); ok(w.s.windowOf().reason === 'window-perms', 'cửa sổ: nội dung hỏng → window-perms');
  for (const k of [null, 'abc', 'G'.repeat(32)]) { openWindow(w.h, { ms: t - Date.now() + 1800e3, key: k }); }
  ok(w.s.windowOf().reason === 'window-perms', 'cửa sổ: không có khoá 128 bit hex hợp lệ (CLI cũ / ghi tay) → window-perms (CNS-268)');
  openWindow(w.h, { ms: t - Date.now() + 1800e3, key: null }); ok(w.s.windowOf().reason === 'window-perms', 'cửa sổ: thiếu hẳn khoá → window-perms');
  // CNS-268 / CNS-271 đơn vị: loginReasons — request từ xa chỉ local-only; Docker: container khác trên bridge (Origin / Host tự khai) mà không có khoá → link
  { const OKm = { stage: 'admin', window: { ok: true, mode: 'docker', composeLoopback: true, key: 'a'.repeat(32) }, online: {}, inDocker: true };
    const RQd = (hd, so) => ({ headers: Object.assign({ host: 'localhost:7480', origin: 'http://localhost:7480' }, hd || {}), socket: Object.assign({ remoteAddress: '172.18.0.5', localAddress: '172.18.0.2' }, so || {}) });
    ok(JSON.stringify(loginReasons(OKm, RQd(), '')) === '["link"]' && JSON.stringify(loginReasons(OKm, RQd(), 'b'.repeat(32))) === '["link"]' && loginReasons(OKm, RQd(), 'a'.repeat(32)).length === 0,
      'Docker: tiến trình / container khác gọi thẳng IP container với Origin / Host giả → link (thiếu / sai khoá); đúng khoá → nhận');
    const OKn = Object.assign({}, OKm, { inDocker: false, window: Object.assign({}, OKm.window, { mode: 'native' }) });
    ok(JSON.stringify(loginReasons(OKn, RQd({}, { remoteAddress: '203.0.113.9', localAddress: '10.0.0.2' }), 'a'.repeat(32))) === '["local-only"]'
      && JSON.stringify(loginReasons(Object.assign({}, OKn, { stage: 'done', online: { mode: 'proxy' } }), RQd({ 'x-forwarded-for': '1.2.3.4' }, { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' }), '')) === '["local-only"]',
      'CNS-271: request từ xa / qua proxy → CHỈ ["local-only"] (không lộ stage / online / cửa sổ), kể cả khi máy đã khởi tạo');
    ok(JSON.stringify(loginReasons(Object.assign({}, OKn, { tunnel: true }), RQd({}, { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' }), 'a'.repeat(32))) === '["tunnel"]', 'request đạt điều kiện request → đủ lý do của máy (tunnel)'); }
  // adminReasons — một hàm, từng điều kiện
  const OK = { stage: 'admin', window: { ok: true, mode: 'native' }, online: { mode: 'off' }, inDocker: false, bind: '127.0.0.1', listen: '127.0.0.1' };
  const R = (hd, sock) => ({ headers: Object.assign({ host: 'localhost:7480', origin: 'http://localhost:7480' }, hd || {}), socket: Object.assign({ localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' }, sock || {}) });
  ok(adminReasons(OK, R()).length === 0 && adminReasons(OK, R({ host: '127.0.0.1:7480', origin: 'http://127.0.0.1:7480' }, { localAddress: '::ffff:127.0.0.1', remoteAddress: '::ffff:127.0.0.1' })).length === 0 && adminReasons(OK, R({ host: '[::1]:7480', origin: 'http://[::1]:7480' }, { localAddress: '::1', remoteAddress: '::1' })).length === 0, 'đủ điều kiện (localhost / 127.0.0.1 / [::1], socket loopback) → nhận');
  const cases = [
    ['stage', Object.assign({}, OK, { stage: 'domain' }), R()], ['window', Object.assign({}, OK, { window: { ok: false, reason: 'window' } }), R()],
    ['online', Object.assign({}, OK, { online: { mode: 'proxy' } }), R()], ['online', Object.assign({}, OK, { online: { mode: 'off', pending: 'https://x.example.com' } }), R()],
    ['online', Object.assign({}, OK, { online: { mode: 'off', busy: true } }), R()], ['legacy-env', Object.assign({}, OK, { legacyEnv: true }), R()],
    ['edge', Object.assign({}, OK, { caddy: true }), R()], ['tunnel', Object.assign({}, OK, { tunnel: true }), R()],
    ['bind', Object.assign({}, OK, { bind: '0.0.0.0' }), R()], ['bind', Object.assign({}, OK, { listen: '0.0.0.0' }), R()],
    ['docker-publish', Object.assign({}, OK, { inDocker: true, window: { ok: true, mode: 'docker', composeLoopback: false } }), R()],
    ['docker-publish', Object.assign({}, OK, { inDocker: true, window: { ok: true, mode: 'native', composeLoopback: true } }), R()],
    ['socket', OK, R({}, { remoteAddress: '192.168.1.5' })], ['socket', OK, R({}, { localAddress: '192.168.1.2' })],
    ['origin', OK, R({ origin: null })], ['origin', OK, R({ origin: 'http://evil.example' })], ['origin', OK, R({ origin: 'http://localhost:3000' })],
    ['origin', OK, R({ host: '127.0.0.1:7480' })], ['origin', OK, R({ origin: 'https://localhost:7480', host: 'localhost:7480' })], ['origin', OK, R({ origin: 'http://localhost', host: 'localhost' })]
  ];
  ['x-forwarded-for', 'forwarded', 'via', 'x-real-ip', 'cf-connecting-ip', 'x-forwarded-host', 'x-gc-edge'].forEach(hh => cases.push(['proxy', OK, R({ [hh]: '1.2.3.4' })]));
  cases.push(['proxy', OK, Object.assign(R(), { gcEdge: 'tunnel' })]);
  const badCase = cases.filter(([want, m, rq]) => { const r = adminReasons(Object.assign({}, m, { origin: undefined }), Object.assign({}, rq, { headers: Object.fromEntries(Object.entries(rq.headers).filter(([, v]) => v !== null)) })); return !r.includes(want); });
  ok(!badCase.length, 'adminReasons: ' + cases.length + ' ca — mỗi điều kiện thiếu (stage · cửa sổ · online / bật tạm / đang chạy · .env kế thừa · edge · tunnel · GC_BIND / GC_LISTEN · Docker publish · socket · Origin thiếu / lạ / khác cổng / Host khác / https · header proxy từng loại · cờ edge) → đúng mã lý do', JSON.stringify(badCase.map(c => c[0])));
  const ok2 = adminReasons(Object.assign({}, OK, { inDocker: true, window: { ok: true, mode: 'docker', composeLoopback: true }, listen: '0.0.0.0' }), R({}, { remoteAddress: '172.18.0.1', localAddress: '172.18.0.2' }));
  ok(ok2.length === 0, 'Docker: peer là gateway bridge (172.x) + GC_LISTEN 0.0.0.0 vẫn nhận khi CLI đã kiểm compose chỉ publish loopback (app không thấy IP thật — CNS-252)', ok2);
  ok(Object.keys(REASON_MSG).every(k => typeof REASON_MSG[k] === 'string') && ['stage', 'window', 'window-perms', 'online', 'legacy-env', 'edge', 'tunnel', 'docker-publish', 'bind', 'socket', 'proxy', 'origin'].every(k => REASON_MSG[k] && /genchibi (open|password)|ssh -L/.test(REASON_MSG[k])), 'mọi lý do có câu + cách vào (genchibi open / genchibi password / SSH port-forward)');
  ok(loginProblem('ryan') === '' && loginProblem('admin') && loginProblem('ab') && loginProblem('Ryan') && loginProblem('a'.repeat(33)) && loginProblem('ry an') && loginProblem('r.y_a-n') === '' && emailProblem('a@b.example') === '' && emailProblem('x }@b.c') && emailProblem('noat'), 'luật tên đăng nhập (3–32 [a-z0-9._-], khác admin) + email');
  // phiên admin + init nguyên tử (Auth + Setup, đồng hồ giả)
  const a0 = mk(); a0.s.boot({});
  const A = new Auth({ dir: path.join(a0.h, 'data'), envToken: 'x'.repeat(40), key: crypto.randomBytes(32), now, setup: a0.s });
  const RQ = hd => ({ headers: Object.assign({ host: 'localhost:7480' }, hd || {}), socket: { remoteAddress: '127.0.0.1' } });
  const setA = A.issueAdmin(RQ()), cjA = jar(setA);
  ok(setA.length === 1 && /Max-Age=1800\b/.test(setA[0]) && /HttpOnly; SameSite=Lax/.test(setA[0]) && !setA.some(c => /gc_device/.test(c)), 'phiên admin: MỘT cookie (không cookie thiết bị), HttpOnly, SameSite=Lax, Max-Age 1800 s');
  ok(A.whoOf(RQ(cookie(cjA))) === 'A' && A.ownerOf(RQ(cookie(cjA))) === null && !A.deviceOf(RQ(cookie(cjA))), 'phiên admin không phải quyền chủ (ownerOf null) và không có thiết bị');
  t += 30 * 60e3 - 2000; ok(A.whoOf(RQ(cookie(cjA))) === 'A', 'phiên admin còn sống ở phút 29:58');   // số cứng 30 phút, KHÔNG lấy TTL.admin của auth.js (đột biến TTL phải làm đỏ)
  t += 4000; ok(A.whoOf(RQ(cookie(cjA))) === null, 'phiên admin hết hạn sau 30 phút');
  const cjB = jar(A.issueAdmin(RQ()));
  fs.mkdirSync(path.join(a0.h, 'data/setup.json.tmp'));   // ghi setup.json sẽ lỗi (tệp tạm là thư mục)
  let threw = false; try { await A.initOwner({ login: 'ryan', displayName: 'R', email: '', password: PW }, 'test'); } catch (e) { threw = true; }
  const aj = JSON.parse(fs.readFileSync(path.join(a0.h, 'data/auth.json'), 'utf8'));
  ok(threw && !aj.users.owner && !A.hasPassword() && a0.s.stage === 'admin' && stageOf(a0.h) === 'admin' && A.whoOf(RQ(cookie(cjB))) === 'A', 'init NGUYÊN TỬ: ghi setup.json lỗi → auth.json về như trước (không mật khẩu), stage vẫn admin, phiên admin không mất');
  fs.rmdirSync(path.join(a0.h, 'data/setup.json.tmp'));
  const cjC = jar(A.issueAdmin(RQ()));
  const r0 = await A.initOwner({ login: 'ryan', displayName: 'R', email: '', password: PW }, 'test');
  ok(Object.keys(JSON.parse(fs.readFileSync(path.join(a0.h, 'data/auth.json'), 'utf8')).sessions || {}).length === 0 && r0.revoked >= 2 && A.whoOf(RQ(cookie(cjB))) === null && A.whoOf(RQ(cookie(cjC))) === null && a0.s.stage === 'domain' && A.loginName() === 'ryan' && A.profile().id === 'owner', 'init: thu hồi MỌI phiên admin (' + r0.revoked + '), stage → domain, id nội bộ vẫn owner, tên đăng nhập ryan');
  { // hai lời gọi initOwner cùng lúc (bỏ qua khoá của route): kiểm lại SAU khi băm → đúng một lần thắng
    const a2 = mk(), A2 = (a2.s.boot({}), new Auth({ dir: path.join(a2.h, 'data'), envToken: 'y'.repeat(40), key: crypto.randomBytes(32), now, setup: a2.s }));
    const rr = await Promise.allSettled(['ryana', 'ryanb'].map(l => A2.initOwner({ login: l, displayName: '', email: '', password: PW }, 'test')));
    ok(rr.filter(x => x.status === 'fulfilled').length === 1 && rr.some(x => x.status === 'rejected' && x.reason.code === 409) && ['ryana', 'ryanb'].includes(A2.loginName()), 'initOwner gọi song song 2 lần (không qua route) → đúng một lần thắng, lần kia 409 (kiểm lại sau khi băm)', rr.map(x => x.status));
  }
  let again = 0; try { await A.initOwner({ login: 'ryan2', displayName: '', email: '', password: PW }, 'test'); } catch (e) { again = e.code; }
  ok(again === 409 && A.loginName() === 'ryan', 'init lần hai → 409, không đổi gì (admin chết vĩnh viễn)');
}

/* ================================================================== 1) admin / admin qua HTTP */
console.log('1) admin / admin qua HTTP: đúng lý do ở từng ca · trần xét trước khi so mật khẩu');
{
  const P = 7951, S = await ready(boot(P, {}));
  const why = async (hd, pw) => { const r = await adminLogin(P, hd, pw); return { s: r.status, reason: r.json && r.json.reason, err: r.json && r.json.error, r }; };
  ok(stageOf(S.home) === 'admin' && (await req(P, 'GET', '/api/auth/state')).json.stage === 'admin', 'bản cài mới: stage admin; /api/auth/state công khai báo stage');
  let x = await why();
  ok(x.s === 403 && x.reason === 'window' && /genchibi open/.test(x.err), 'ngoài cửa sổ (chưa lệnh host nào mở) → 403 window + "genchibi open"', x.r.text);
  openWindow(S.home);
  x = await why({}, 'sai roi');
  ok(x.s === 401, 'cửa sổ mở, mật khẩu sai → 401');
  const fails = []; for (let i = 0; i < 10; i++) fails.push((await why({}, 'sai ' + i)).s);
  const hit = await why();
  ok(hit.s === 429 && !hit.r.set.length, 'trần xét TRƯỚC khi so mật khẩu: sau 11 lần sai, admin / admin ĐÚNG → 429, không phiên [' + fails.join(',') + ']');
  await stop(S);
  const S1 = await ready(boot(P, {}, S.home));   // trần trong bộ nhớ → khởi động lại xoá trần
  openWindow(S1.home);
  const cases = [
    ['origin', { origin: null }], ['origin', { origin: 'http://localhost:3000' }], ['origin', { origin: 'http://evil.example' }], ['origin', { host: '127.0.0.1:' + P }],
    ['proxy', { 'x-forwarded-for': '203.0.113.9' }], ['proxy', { forwarded: 'for=203.0.113.9' }], ['proxy', { via: '1.1 nginx' }], ['proxy', { 'cf-connecting-ip': '203.0.113.9' }]
  ];
  const res = []; for (const [want, hd] of cases) { const y = await why(hd); res.push(want + ':' + y.s + '/' + y.reason); }
  // Origin trang khác / khác cổng: rào CSRF chung của /api (originOK) chặn trước cả lối admin — 403, không lý do riêng
  // CNS-271: request không đạt điều kiện request chỉ nhận mã chung local-only (người lạ không đọc được trạng thái máy); Origin trang khác / khác cổng: rào CSRF chung chặn trước
  ok(res.every((r, i) => r === cases[i][0] + ':403/local-only' || (i === 1 || i === 2) && r === 'origin:403/undefined'), 'Origin / Host lạ (thiếu Origin · khác cổng · trang khác · Host ≠ Origin) và header proxy / edge (XFF · Forwarded · Via · Cf-Connecting-Ip) → 403 local-only, không so mật khẩu', res.join(' '));
  { const r = await adminLogin(P, { 'x-forwarded-for': '203.0.113.9' }); ok(r.status === 403 && JSON.stringify(r.json.reasons) === '["local-only"]' && !/window|online|tunnel|edge|stage/.test(JSON.stringify(r.json)), 'CNS-271: request qua proxy chỉ thấy ["local-only"] — không lộ cửa sổ / online / tunnel / stage', r.text); }
  // CNS-268: khoá một lần của link (run/admin-window, 0600) — thiếu / sai / sai dạng → 403 link, không phiên; đúng khoá → nhận
  { const y = []; for (const k of ['', 'f'.repeat(32), keyOf(P).toUpperCase(), keyOf(P).slice(0, 31), 'x']) { const r = await adminLogin(P, {}, 'admin', k); y.push(r.status + '/' + (r.json && r.json.reason) + '/' + r.set.length); }
    ok(y.every(v => v === '403/link/0'), 'admin / admin đúng nhưng thiếu / sai khoá của link (rỗng · khoá khác · HOA · thiếu 1 ký tự · rác) → 403 link, không phiên — user Unix khác / container khác không có khoá', y.join(' '));
    const r = await adminLogin(P, {}, 'admin', keyOf(P)); ok(r.status === 200 && r.set.length === 1, 'đúng khoá của link + admin / admin → phiên admin', r.text);
    const lk = await adminLogin(P, {}, 'admin', ''); ok(/genchibi open/.test(lk.json.error) && /link/.test(lk.json.error), 'lý do link: câu nói mở link của trình cài hoặc chạy genchibi open', lk.text); }
  const ok1 = await why();
  ok(ok1.s === 200 && ok1.r.json.admin === true && jar(ok1.r.set)['gc_session_' + P] && !Object.keys(jar(ok1.r.set)).some(k => /device/.test(k)), 'đủ điều kiện → 200, phiên admin, KHÔNG cookie thiết bị');
  // trạng thái máy: online / tunnel / edge / GC_PUBLIC_URL / GC_BIND / Docker
  const on = path.join(S1.home, 'data/online.json');
  fs.writeFileSync(on, JSON.stringify({ v: 1, adopted: true, mode: 'proxy', domain: 'x.example.com', publicUrl: 'https://x.example.com' }));
  x = await why(); ok(x.s === 403 && x.reason === 'online', 'máy đang online (online.json mode proxy + publicUrl) → 403 online', x.r.text);
  fs.writeFileSync(on, JSON.stringify({ v: 1, adopted: true, mode: 'off', publicUrl: '' }));
  fs.writeFileSync(path.join(S1.home, 'run/edge-intent.json'), JSON.stringify({ tunnel: 'quick', online: true }));
  x = await why(); ok(x.s === 403 && x.reason === 'tunnel', 'tunnel bật (run/edge-intent.json quick) → 403 tunnel', x.r.text);
  fs.writeFileSync(path.join(S1.home, 'run/edge-intent.json'), JSON.stringify({ tunnel: 'off', online: false }));
  fs.mkdirSync(path.join(S1.home, 'edge'), { recursive: true }); fs.writeFileSync(path.join(S1.home, 'edge/caddy.enabled'), '1');
  x = await why(); ok(x.s === 403 && x.reason === 'edge', 'edge Caddy đã bật (edge/caddy.enabled) → 403 edge', x.r.text);
  fs.rmSync(path.join(S1.home, 'edge/caddy.enabled'));
  ok((await why()).s === 200, '…gỡ hết → nhận lại (đối chứng)');
  await stop(S1);
  const S2 = await ready(boot(P, { GC_PUBLIC_URL: 'https://legacy.example.com', GC_ALLOWED_HOSTS: 'legacy.example.com' }, S.home));   // thêm vào .env SAU lần chạy đầu (không thành máy kế thừa)
  openWindow(S2.home); x = await why(); ok(stageOf(S2.home) === 'admin' && x.s === 403 && x.reason === 'legacy-env', 'còn GC_PUBLIC_URL / GC_ALLOWED_HOSTS trong env → 403 legacy-env', x.r.text);
  ok(x.r.json.reasons.includes('legacy-env'), '…danh sách lý do có legacy-env', x.r.text);
  await stop(S2);
  const S3 = await ready(boot(P, { GC_BIND: '0.0.0.0' }, S.home));
  openWindow(S3.home); x = await why(); ok(x.s === 403 && x.reason === 'bind', 'native GC_BIND=0.0.0.0 → 403 bind', x.r.text);
  await stop(S3);
  const S4 = await ready(boot(P, { GC_IN_DOCKER: '1' }, S.home));
  openWindow(S4.home, { mode: 'docker', cl: false }); x = await why(); ok(x.s === 403 && x.reason === 'docker-publish', 'Docker: cửa sổ không kèm bằng chứng compose chỉ loopback → 403 docker-publish', x.r.text);
  openWindow(S4.home, { mode: 'docker', cl: true }); ok((await why()).s === 200, 'Docker: CLI đã kiểm compose chỉ publish loopback → nhận');
  await stop(S4);
  // CNS-270: Docker map ${GC_PORT}:7480 — app trong container biết cổng trên máy chủ qua GC_HOST_PORT; câu hướng dẫn / localMcp nói đúng cổng owner mở
  const S5 = await ready(boot(P, { GC_HOST_PORT: '7481' }));
  const lo = await adminLogin(P, { 'x-forwarded-for': '203.0.113.9' });
  ok(lo.status === 403 && /ssh -L 7481:localhost:7481/.test(lo.json.error) && !/7951/.test(lo.json.error), 'GC_HOST_PORT=7481 (Docker, cổng khác 7480): câu từ chối chỉ đúng cổng trên máy chủ (ssh -L 7481…), không cổng trong container', lo.text);
  await stop(S5);
}

/* ================================================================== 2) + 3) phiên admin, init, CSRF */
console.log('2) phiên admin chỉ mở màn khởi tạo · 3) init nguyên tử, thu hồi, song song, 4 rào CSRF / rebinding');
{
  const P = 7952, S = await ready(boot(P, {})), T = tokOf(S.home);
  openWindow(S.home);
  const A1 = cookie(jar((await adminLogin(P)).set)), A2 = cookie(jar((await adminLogin(P)).set));
  const st = (await req(P, 'GET', '/api/auth/state', { headers: { host: 'localhost:' + P, ...A1 } })).json;
  ok(st.who === 'A' && st.admin === true && Math.abs(Date.parse(st.expiresAt) - Date.now() - 1800e3) < 60e3, 'phiên admin: /api/auth/state who = A, hết hạn sau ~30 phút');
  const g = []; for (const p of ['/api/info', '/api/works', '/api/online', '/api/setup', '/api/auth/sessions']) g.push(p + ':' + (await req(P, 'GET', p, { headers: { host: 'localhost:' + P, ...A1 } })).status);
  ok(g.join(' ') === '/api/info:403 /api/works:403 /api/online:403 /api/setup:403 /api/auth/sessions:401', 'phiên admin đi tới trang khác → bị chặn (403 gate init; Tài khoản chủ 401)', g.join(' '));
  ok((await mcpInit(P, { ...A1 })).status === 401, 'phiên admin không mở /mcp (401)');
  // 4 rào CSRF / rebinding — cho cả đăng nhập admin lẫn init (CNS-262)
  const four = async (p, body, hd) => [
    // DNS rebinding thật: trình duyệt ở trang kẻ lạ gửi Origin == Host == tên của kẻ lạ (trỏ về 127.0.0.1) — chỉ rào Host chặn được
    (await req(P, 'POST', p, { headers: { ...local(P), ...hd, host: 'evil.example:' + P, origin: 'http://evil.example:' + P }, body })).status,
    (await req(P, 'POST', p, { headers: { ...local(P), ...hd, host: 'x.localhost:' + P, origin: 'http://x.localhost:' + P }, body })).status,
    (await req(P, 'POST', p, { headers: { ...local(P), ...hd, origin: 'http://localhost:3000' }, body })).status,
    (await req(P, 'POST', p, { headers: { ...local(P), ...hd, 'x-gc-request': null }, body })).status];
  const fl = await four('/api/auth/login', { username: 'admin', password: 'admin' }, {}), fi = await four('/api/auth/init', initBody(), A1);
  ok(fl.every(c => c === 403) && fi.every(c => c === 403) && stageOf(S.home) === 'admin', '4 rào CSRF / rebinding (Host evil.example · Host x.localhost · Origin localhost:3000 · thiếu X-GC-Request) → 403 cho đăng nhập admin [' + fl + '] và init [' + fi + ']');
  const bads = [['admin', PW], ['ab', PW], ['Ryan Pham', PW], ['ryan', 'ngan'], ['ryan', 'admin'], ['ryan', '    Admin    ']];   // "admin" đệm khoảng trắng đủ 12 ký tự vẫn bị từ chối
  const bs = []; for (const [u, pw] of bads) bs.push((await req(P, 'POST', '/api/auth/init', { headers: { ...local(P), ...A1 }, body: initBody(u, pw) })).status);
  ok(bs.every(c => c === 400) && (await req(P, 'POST', '/api/auth/init', { headers: { ...local(P), ...A1 }, body: Object.assign(initBody(), { password2: 'khac han mat khau' }) })).status === 400 && (await req(P, 'POST', '/api/auth/init', { headers: { ...local(P), ...A1 }, body: Object.assign(initBody(), { email: 'x y@z' }) })).status === 400, 'init: tên admin / ngắn / có hoa-cách · mật khẩu ngắn / "admin" (kể cả đệm khoảng trắng đủ 12 ký tự) · hai lần khác nhau · email sai → 400');
  ok((await req(P, 'POST', '/api/auth/init', { headers: local(P), body: initBody() })).status === 401, 'init không phiên admin / token → 401');
  // song song: 5 init cùng lúc từ phiên admin → đúng một 200
  const par = await Promise.all([0, 1, 2, 3, 4].map(i => req(P, 'POST', '/api/auth/init', { headers: { ...local(P), ...A1 }, body: initBody('ryan' + i) })));
  const win = par.filter(r => r.status === 200);
  ok(win.length === 1 && par.every(r => [200, 409].includes(r.status)) && stageOf(S.home) === 'domain', 'init gửi song song 5 lần → đúng MỘT 200, còn lại 409; stage domain [' + par.map(r => r.status) + ']');
  ok(par.filter(r => r.status === 409).every(r => r.json && r.json.login === '/login'), 'init song song: các lần thua bị từ chối NGAY (khoá initBusy / đã khởi tạo — không băm scrypt lần hai), kèm lối /login', par.map(r => r.json));
  const login = JSON.parse(fs.readFileSync(path.join(S.home, 'data/auth.json'), 'utf8')).users.owner.login;
  ok((await req(P, 'GET', '/api/auth/state', { headers: { host: 'localhost:' + P, ...A2 } })).json.who === undefined && (await req(P, 'POST', '/api/auth/init', { headers: { ...local(P), ...A2 }, body: initBody() })).status === 401, 'init xong: phiên admin KHÁC (trình duyệt thứ hai) bị thu hồi → init 401');
  const S0 = cookie(jar(win[0].set));
  ok((await req(P, 'GET', '/api/info', { headers: { host: 'localhost:' + P, ...S0 } })).status === 200 && !fs.existsSync(path.join(S.home, 'run/admin-window')), 'trình duyệt vừa init nhận phiên owner (/api/info 200); app xoá run/admin-window');
  const x = await adminLogin(P);
  ok(x.status === 403 && x.json.reason === 'stage', 'sau khởi tạo: admin / admin → 403 stage (kể cả cửa sổ còn mở)', x.text);
  openWindow(S.home); ok((await adminLogin(P)).json.reason === 'stage', '…mở lại cửa sổ cũng không cứu admin');
  const l1 = await req(P, 'POST', '/api/auth/login', { headers: local(P), body: { username: login, password: PW } }), l2 = await req(P, 'POST', '/api/auth/login', { headers: local(P), body: { username: 'owner', password: PW } }), l3 = await req(P, 'POST', '/api/auth/login', { headers: local(P), body: { password: PW } });
  ok(l1.status === 200 && l2.status === 401 && l3.status === 400 && /username or password/.test(l2.json.error), 'đăng nhập = tên đăng nhập + mật khẩu: đúng → 200 · tên khác → 401 (câu không nói phần nào sai) · thiếu tên → 400');
  ok((await req(P, 'POST', '/api/auth/password', { headers: { ...W, ...bearer(T) }, body: { password: PW2, initOnly: true } })).status === 409, 'password initOnly (trình cài chạy lại) khi đã khởi tạo → 409, không đè');
  const pf = await req(P, 'PUT', '/api/auth/profile', { headers: { ...local(P), ...S0 }, body: { login: 'ryanp', displayName: 'Ryan P', email: 'r@example.com' } });
  ok(pf.status === 200 && pf.json.user.login === 'ryanp' && (await req(P, 'GET', '/api/info', { headers: { host: 'localhost:' + P, ...S0 } })).status === 200 && (await req(P, 'POST', '/api/auth/login', { headers: local(P), body: { username: 'ryanp', password: PW } })).status === 200, 'Tài khoản chủ đổi tên đăng nhập / tên hiển thị / email: không đăng xuất ai, đăng nhập bằng tên mới');
  ok((await req(P, 'PUT', '/api/auth/profile', { headers: { ...local(P), ...S0 }, body: { login: 'admin' } })).status === 400, '…đổi tên thành admin → 400');
  await stop(S);
}

/* ================================================================== 4) cổng stage */
console.log('4) cổng stage: phiên / token Studio / cookie thiết bị bị giữ ở wizard; agent (token) + /mcp không bị chặn');
{
  const P = 7953, S = await ready(boot(P, {})), T = tokOf(S.home);
  const TS = { ...bearer(T), 'x-gc-studio': '1' };
  ok((await req(P, 'GET', '/api/works', { headers: TS })).status === 403 && (await req(P, 'GET', '/api/info', { headers: TS })).json.setup.stage === 'admin', 'stage admin: Studio vào bằng token (X-GC-Studio) → /api/works 403 gate, /api/info cho biết stage (Studio mở màn khởi tạo)');
  ok((await req(P, 'GET', '/api/works', { headers: bearer(T) })).status === 200 && (await mcpInit(P, bearer(T))).status === 200, 'stage admin: agent / CLI bằng token (không X-GC-Studio) → /api/works 200, /mcp initialize 200 (genchibi mcp chạy ngay — lời hứa v0.21)');
  const it = await req(P, 'POST', '/api/auth/init', { headers: { ...W, ...TS }, body: initBody() });
  ok(it.status === 200 && stageOf(S.home) === 'domain', 'Studio đăng nhập bằng token khởi tạo được (T) → domain');
  const SC = jar(it.set);
  const gs = []; for (const p of ['/api/works', '/api/assets', '/api/ai', '/api/update']) gs.push((await req(P, 'GET', p, { headers: cookie(SC) })).status);
  const os2 = []; for (const p of ['/api/info', '/api/setup', '/api/online', '/api/oauth', '/api/agent/topics']) os2.push((await req(P, 'GET', p, { headers: cookie(SC) })).status);
  ok(gs.every(c => c === 403) && os2.every(c => c === 200), 'stage domain, phiên cookie (S): trang thường 403 gate wizard [' + gs + ']; wizard + Lên mạng + Kết nối agent + hướng dẫn agent mở [' + os2 + ']');
  ok((await req(P, 'GET', '/api/works', { headers: TS })).status === 403 && (await req(P, 'GET', '/api/works', { headers: bearer(T) })).status === 200, 'stage domain: token kèm X-GC-Studio → 403; token của agent → 200');
  // cookie thiết bị: đăng xuất (phiên mất, D còn) → đăng nhập lại qua thiết bị → vẫn bị giữ ở wizard
  await req(P, 'POST', '/api/auth/logout', { headers: { ...W, ...cookie(SC) } });
  const D = { ['gc_device_' + P]: SC['gc_device_' + P] };
  const re = await req(P, 'POST', '/api/auth/login', { headers: { ...W, ...cookie(D) }, body: { username: 'ryan', password: PW } });
  ok(re.status === 200 && (await req(P, 'GET', '/api/works', { headers: cookie(jar(re.set)) })).status === 403 && (await req(P, 'GET', '/api/works', { headers: cookie(D) })).status === 401, 'cookie thiết bị: đăng nhập lại (thiết bị đã nhớ) vẫn bị giữ ở wizard (403); chỉ cookie thiết bị không phải đăng nhập (401)');
  ok((await mcpInit(P, bearer(T))).status === 200, 'stage domain: /mcp với token vẫn chạy');
  await stop(S);
}

/* ================================================================== 5) bảng lối vào §A.0 */
console.log('5) bảng lối vào §A.0 — mỗi dòng một ca');
{
  const P = 7954;
  // dòng 1: bản cài mới
  let S = await ready(boot(P, {})); ok(stageOf(S.home) === 'admin', 'dòng 1 — bản cài mới → admin'); await stop(S);
  // dòng 4: v0.21 / v0.22 đã có mật khẩu (chưa có setup.json, chưa có login)
  let h = tmp('r4'); seedPassword(h, PW); fs.writeFileSync(path.join(h, 'data/legacy.json'), JSON.stringify({ envPublicUrl: '', envAllowedHosts: '', at: 'x' }));
  S = await ready(boot(P, {}, h));
  const l4 = await req(P, 'POST', '/api/auth/login', { headers: local(P), body: { username: 'owner', password: PW } });
  ok(stageOf(h) === 'done' && l4.status === 200 && (await req(P, 'GET', '/api/info', { headers: cookie(jar(l4.set)) })).json.setup.review === true && (await req(P, 'GET', '/api/works', { headers: cookie(jar(l4.set)) })).status === 200,
    'dòng 4 — v0.21 / v0.22 có mật khẩu → done (Studio mở), đăng nhập bằng "owner", dải "Kiểm tra thiết lập" một lần');
  await req(P, 'POST', '/api/setup/review', { headers: { ...W, ...cookie(jar(l4.set)) } });
  ok((await req(P, 'GET', '/api/info', { headers: cookie(jar(l4.set)) })).json.setup.review === false, '…đóng dải → không hiện lại');
  await stop(S);
  // dòng 5: v0.21 / v0.22 chưa có mật khẩu (đang đợi mã setup) + tệp mã setup cũ
  h = tmp('r5'); fs.mkdirSync(path.join(h, 'data'), { recursive: true }); fs.writeFileSync(path.join(h, 'data/setup-code'), '{}', { mode: 0o600 }); fs.writeFileSync(path.join(h, 'data/setup-code.txt'), 'AAAAA-AAAAA\n', { mode: 0o600 });
  fs.writeFileSync(path.join(h, 'data/legacy.json'), JSON.stringify({ envPublicUrl: '', envAllowedHosts: '', at: 'x' }));
  S = await ready(boot(P, {}, h));
  ok(stageOf(h) === 'admin' && !fs.existsSync(path.join(h, 'data/setup-code')) && !fs.existsSync(path.join(h, 'data/setup-code.txt')) && (await req(P, 'GET', '/setup')).headers.location === '/login' && (await req(P, 'POST', '/api/auth/setup', { headers: W, body: { code: 'AAAAA-AAAAA', password: PW } })).status === 404,
    'dòng 5 — v0.21 / v0.22 chưa có mật khẩu → admin; data/setup-code* bị xoá; /setup → 302 /login; POST /api/auth/setup (mã setup) → 404');
  await stop(S);
  // dòng 6: máy kế thừa (như chibi.genos.top): .env GC_PUBLIC_URL ở lần chạy đầu → legacy.json → done, không chặn gì
  h = tmp('r6'); fs.mkdirSync(path.join(h, 'data/works'), { recursive: true }); fs.writeFileSync(path.join(h, 'data/works/cu.json'), '{"id":"cu","title":"Cũ","shots":[]}');
  const LT = 'ryan-token-' + crypto.randomBytes(12).toString('hex'), LE = { GC_PUBLIC_URL: 'https://chibi.example.test', GC_ALLOWED_HOSTS: 'chibi.example.test', GC_API_TOKEN: LT };
  S = await ready(boot(P, LE, h));
  const CADDY = { host: 'chibi.example.test', 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https' };
  ok(stageOf(h) === 'done' && (await req(P, 'GET', '/api/works', { headers: { ...CADDY, ...bearer(LT), 'x-gc-studio': '1' } })).status === 200, 'dòng 6 — máy kế thừa → done: Studio (token) không bị chặn gì');
  const mg = await req(P, 'POST', '/api/online/migrate', { headers: { ...CADDY, ...W, ...bearer(LT) } });
  ok(mg.status === 200, 'dòng 6 — genchibi online migrate (POST /api/online/migrate) chạy trên máy kế thừa', mg.text);
  await stop(S);
  // dòng 3: genchibi password khi admin / must_init → domain (API — CLI ở mục 9)
  S = await ready(boot(P, {})); const T3 = tokOf(S.home);
  const pw3 = await req(P, 'POST', '/api/auth/password', { headers: { ...W, ...bearer(T3) }, body: { password: PW } });
  ok(pw3.status === 200 && pw3.json.init === true && pw3.json.login === 'owner' && stageOf(S.home) === 'domain', 'dòng 3 — genchibi password (token) khi stage admin → khởi tạo, tên owner, stage domain (bỏ qua màn khởi tạo)', pw3.text);
  await stop(S);
  // dòng 2: trình cài --domain: password --init-stdin (tên do người cài chọn) → domain; Go online xong → mcp (luồng thật ở test-lang.sh / test-online-cli; ở đây: móc onlineDone)
  const hs = tmp('r2'); const s2 = new Setup({ dataDir: path.join(hs, 'data'), runDir: path.join(hs, 'run') }); s2.boot({}); s2.advance('domain', 'cli');
  ok(s2.onlineDone() && s2.stage === 'mcp' && s2.view().choice === 'online', 'dòng 2 — trình cài --domain: owner đặt trong terminal (domain) → Go online xong → mcp (lần đầu vào Studio vẫn qua chẩn đoán MCP)');
  // v0.21 / v0.22 "online tạm, chờ mật khẩu": vẫn online (publicUrlPending), stage must_init, genchibi password → luồng tự xong
  h = tmp('rw'); fs.mkdirSync(path.join(h, 'data'), { recursive: true });
  fs.writeFileSync(path.join(h, 'data/legacy.json'), JSON.stringify({ envPublicUrl: '', envAllowedHosts: '', at: 'x' }));
  const st = id => ({ id, state: 'ok', detail: null, fix: null, at: 'x' });
  fs.writeFileSync(path.join(h, 'data/online.json'), JSON.stringify({ v: 1, adopted: true, mode: 'off', domain: '', publicUrl: '', publicUrlPending: 'https://wait.example.test',
    flow: { mode: 'proxy', domain: 'wait.example.test', url: '', startedAt: 'x', done: false, nonce: 'a'.repeat(32), pending: true, needs: null, conflicts: null, choices: null, waitSince: {}, steps: ['domain', 'config', 'public', 'mcp'].map(st).concat({ id: 'password', state: 'running', detail: null, fix: null, at: 'x' }) } }));
  S = await ready(boot(P, {}, h)); const TW = tokOf(h);
  const ov = (await req(P, 'GET', '/api/online', { headers: bearer(TW) })).json;
  ok(stageOf(h) === 'must_init' && ov.publicUrlPending === 'https://wait.example.test' && ov.flow.waitingOwner === true && !ov.flow.steps.some(s => s.id === 'password') && /genchibi password/.test(S.out), 'v0.21 / v0.22 "online tạm, chờ mật khẩu" → vẫn online tạm, stage must_init, bậc password bỏ, log chỉ genchibi password');
  await req(P, 'POST', '/api/auth/password', { headers: { ...W, ...bearer(TW) }, body: { password: PW } });
  let ov2 = null; for (let i = 0; i < 50; i++) { ov2 = (await req(P, 'GET', '/api/online', { headers: bearer(TW) })).json; if (ov2.flow && ov2.flow.done) break; await sleep(100); }
  ok(ov2.flow.done === true && ov2.publicUrl === 'https://wait.example.test' && ov2.mode === 'proxy' && stageOf(h) === 'mcp', '…genchibi password → luồng tự xong (publicUrl chính thức, mode proxy), wizard sang bước MCP', JSON.stringify({ done: ov2.flow.done, pub: ov2.publicUrl, st: stageOf(h) }));
  await stop(S);
}

/* ================================================================== 6) Go online bị chặn khi chưa khởi tạo */
console.log('6) Go online bị chặn khi stage admin / must_init (API + CLI); máy kế thừa được miễn');
{
  const P = 7955, HD = cliHome(P), { FB } = shims(HD);
  const S = await ready(boot(P, {}, HD)), T = tokOf(HD);
  const b = [];
  for (const [p, body] of [['/api/online/proxy', { domain: 'x.example.com' }], ['/api/online/quick', {}], ['/api/online/recheck', {}], ['/api/online/caddy', { domain: 'x.example.com' }]]) { const r = await req(P, 'POST', p, { headers: { ...W, ...bearer(T) }, body }); b.push(r.status + ':' + (r.json && r.json.needs)); }
  ok(b.every(x => x === '409:owner'), 'stage admin: bắt đầu / kiểm lại Go online → 409 needs owner [' + b + ']');
  ok((await req(P, 'POST', '/api/online/off', { headers: { ...W, ...bearer(T) }, body: {} })).status === 202, '…Go offline vẫn chạy (an toàn)');
  const c = cliRun(HD, FB, ['online', 'proxy', 'x.example.com']);
  ok(c.code === 1 && /Set up the owner account first/.test(c.out) && /genchibi password/.test(c.out), 'CLI genchibi online proxy … khi chưa khởi tạo → thoát 1 + "Set up the owner account first … genchibi password"', c.out);
  await stop(S);
}

/* ================================================================== 7) wizard */
console.log('7) wizard: local / local-pending · tự kiểm cục bộ bắt buộc · nối sau · lastClient · dải nhắc · skip / reset chỉ token · kiểm từ Internet chỉ báo');
{
  const P = 7956, S = await ready(boot(P, {})), T = tokOf(S.home);
  const it = await req(P, 'POST', '/api/auth/init', { headers: { ...W, ...bearer(T) }, body: initBody() }), SC = cookie(jar(it.set));
  const api = (m, p, body, hd) => req(P, m, p, { headers: { host: '127.0.0.1:' + P, ...W, ...(hd || SC) }, body });
  ok((await api('POST', '/api/setup/finish', { later: true })).status === 409 && (await api('POST', '/api/setup/choice', { choice: 'weird' })).status === 409, 'bước 2: chưa tới bước 3 thì không "xong"; lựa chọn lạ → 409');
  const sk = await api('POST', '/api/setup/skip', { reason: 'x' }), rs = await api('POST', '/api/setup/reset', {});
  ok(sk.status === 403 && rs.status === 403, 'skip / reset từ Studio (phiên S) → 403 — chỉ genchibi setup trên máy chủ (token)');
  const ch = await api('POST', '/api/setup/choice', { choice: 'local-pending' });
  ok(ch.status === 200 && ch.json.stage === 'mcp' && ch.json.choice === 'local-pending', '"Tạm dùng trên máy này" → bước 3, choice local-pending');
  ok((await api('POST', '/api/setup/finish', { later: true })).status === 409, 'bước 3: chưa tự kiểm → "Tôi nối agent sau" 409 (tự kiểm cục bộ bắt buộc)');
  const inet = await api('POST', '/api/setup/internet', {});
  ok(inet.status === 200 && inet.json.state === 'skip', 'kiểm từ Internet khi chưa lên mạng → skip (chỉ báo)');
  const t0 = Date.now(), stt = await api('POST', '/api/setup/selftest', {});
  const chk = stt.json.mcp.selfTest;
  ok(stt.status === 200 && chk.ok === true && chk.checks.map(x => x.id + ':' + x.ok).join(' ') === 'http:true token:true stdio:true' && chk.checks.every(x => typeof x.detail === 'string' && !VI_RE.test(x.detail)), 'tự kiểm cục bộ THẬT: /mcp HTTP initialize + tools/list · token chủ · cầu stdio (server/mcp-stdio.js) — đạt, chi tiết tiếng Anh (' + (Date.now() - t0) + ' ms)', JSON.stringify(chk));
  ok(!stt.json.mcp.lastClient, 'lần tự kiểm KHÔNG tính là agent đã nối (lastClient trống)');
  ok((await api('POST', '/api/setup/finish', {})).status === 409, '"Xong" (không "nối sau") khi chưa agent nào gọi MCP → 409');
  const fin = await api('POST', '/api/setup/finish', { later: true });
  ok(fin.status === 200 && fin.json.stage === 'done' && fin.json.reminders.agent === true && fin.json.reminders.online === true && (await api('GET', '/api/works')).status === 200, '"Tôi nối agent sau" (tự kiểm đạt) → done; Studio mở; dải nhắc: chưa agent + lên mạng chưa xong');
  // agent đầu tiên qua stdio (genchibi mcp) → lastClient + hết dải nhắc
  await new Promise(done => { const c = spawn(process.execPath, [path.join(ROOT, 'server/mcp-stdio.js')], { env: { ...baseEnv(), GC_HOME: S.home, GC_PORT: String(P) }, stdio: ['pipe', 'ignore', 'ignore'] }); c.on('exit', done); c.stdin.end('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-code","version":"1"}}}\n'); });
  const v1 = (await api('GET', '/api/setup')).json;
  ok(v1.mcp.lastClient && v1.mcp.lastClient.name === 'claude-code' && v1.mcp.lastClient.channel === 'stdio' && v1.reminders.agent === false, 'agent nối qua genchibi mcp → lastClient { claude-code, stdio, lúc }; dải "chưa agent" tắt', JSON.stringify(v1.mcp.lastClient));
  await mcpInit(P, bearer(T), 'cursor');
  ok((await api('GET', '/api/setup')).json.mcp.lastClient.channel === 'http', '…agent khác qua HTTP + token → kênh http');
  // genchibi setup reset → làm lại wizard (không về admin) · skip → done
  ok((await api('POST', '/api/setup/reset', {}, bearer(T))).json.stage === 'domain' && (await api('GET', '/api/works')).status === 403, 'genchibi setup reset (token) → domain (wizard lại), Studio bị giữ ở wizard');
  ok((await api('POST', '/api/setup/choice', { choice: 'local' })).json.stage === 'mcp' && (await api('POST', '/api/setup/skip', { reason: 'self-test broken' }, bearer(T))).json.stage === 'done' && /wizard skipped at "mcp" \(self-test broken\)/.test(S.out), '"Chỉ dùng trên máy này" → mcp; genchibi setup skip (token) → done, ghi log lý do');
  ok((await api('POST', '/api/setup/skip', {}, bearer(T))).status === 409, 'skip khi đã xong → 409');
  // tự kiểm hỏng thật (cầu stdio không tới được app) → không qua được bước 3
  await api('POST', '/api/setup/reset', {}, bearer(T)); await api('POST', '/api/setup/choice', { choice: 'local' });
  await stop(S);
  const S2 = await ready(boot(P, { GC_API_TOKEN: 'env-token-khac-voi-tep-' + crypto.randomBytes(8).toString('hex') }, S.home));
  const S2c = cookie(jar((await req(P, 'POST', '/api/auth/login', { headers: local(P), body: { username: 'ryan', password: PW } })).set));
  fs.writeFileSync(path.join(S.home, 'data/owner-token'), crypto.randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  const st2 = await req(P, 'POST', '/api/setup/selftest', { headers: { ...W, ...S2c } });
  ok(st2.json.mcp.selfTest.ok === true, 'đối chứng: token từ env (GC_API_TOKEN) — genchibi mcp cũng đọc env → tự kiểm đạt', JSON.stringify(st2.json.mcp.selfTest.checks));
  await stop(S2);
}

/* ================================================================== 8) khôi phục sao lưu */
console.log('8) khôi phục sao lưu (CLI genchibi restore): admin không sống lại · kết nối OAuth trong bản sao lưu không sống lại (CNS-138)');
{
  const P = 7957, HOST = 'chibi.example.test', HD = cliHome(P), { FB } = shims(HD);
  fs.mkdirSync(path.join(HD, 'data'), { recursive: true });
  fs.writeFileSync(path.join(HD, 'data/online.json'), JSON.stringify({ v: 1, adopted: true, mode: 'proxy', domain: HOST, publicUrl: 'https://' + HOST }));
  let S = await ready(boot(P, {}, HD));
  const bk0 = cliRun(HD, FB, ['backup']), pre = (/Backed up: (\S+)/.exec(bk0.out) || [])[1];   // bản sao lưu chụp TRƯỚC khi khởi tạo (stage admin)
  const T = tokOf(HD), it = await req(P, 'POST', '/api/auth/init', { headers: { ...W, ...bearer(T) }, body: initBody() });
  await req(P, 'POST', '/api/setup/choice', { headers: { ...W, ...bearer(T) }, body: { choice: 'local' } });
  // một kết nối OAuth thật: register → authorize → approve (T) → token
  const CB = 'https://claude.ai/api/mcp/auth_callback', H = { host: HOST, 'x-forwarded-for': '203.0.113.7' };
  const reg = (await req(P, 'POST', '/oauth/register', { headers: H, body: { client_name: 'Claude', redirect_uris: [CB] } })).json;
  const v = crypto.randomBytes(32).toString('base64url'), chl = crypto.createHash('sha256').update(v).digest('base64url');
  const page = await req(P, 'GET', '/oauth/authorize?' + new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: CB, code_challenge: chl, code_challenge_method: 'S256', state: 's' }), { headers: H });
  const data = JSON.parse((/<script type="application\/json" id="gc-data">([\s\S]*?)<\/script>/.exec(page.text) || [])[1] || '{}');
  // CNS-128: yêu cầu đang chờ hiện trong Studio (GET /api/oauth) — Cấp phép được từ Studio (cùng API)
  const lst = (await req(P, 'GET', '/api/oauth', { headers: bearer(T) })).json.clients.find(c => c.id === reg.client_id);
  ok(lst && lst.requests && lst.requests.length === 1 && lst.requests[0].id === data.request, 'CNS-128: GET /api/oauth liệt kê yêu cầu cấp phép đang chờ của client (Studio có nút Cấp phép)');
  const ap = await req(P, 'POST', '/api/oauth/approve', { headers: { ...H, ...W, ...bearer(T) }, body: { request: data.request, decision: 'approve', scope: 'mcp:write' } });
  const code = new URL(ap.json.redirect).searchParams.get('code');
  const tk = (await req(P, 'POST', '/oauth/token', { headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CB, client_id: reg.client_id, code_verifier: v, resource: 'https://' + HOST + '/mcp' }).toString() })).json.access_token;
  ok(tk && (await mcpInit(P, { host: HOST, ...bearer(tk) }, 'claude-ai')).status === 200 && (await req(P, 'GET', '/api/setup', { headers: bearer(T) })).json.mcp.lastClient.channel === 'oauth', 'kết nối OAuth (claude.ai giả) chạy; lastClient kênh oauth');
  const bk = cliRun(HD, FB, ['backup']), bkf = (/Backed up: (\S+)/.exec(bk.out) || [])[1];
  await req(P, 'POST', '/api/oauth/clients/' + reg.client_id + '/revoke', { headers: { ...W, ...bearer(T) } });
  ok((await mcpInit(P, { host: HOST, ...bearer(tk) })).status === 401, 'chủ thu hồi kết nối sau lúc sao lưu → token 401');
  await stop(S);
  fs.writeFileSync(path.join(HD, 'launcher.js'), '');   // genchibi start (native) trong restore: launcher rỗng — server bật tay ở dưới
  const rs = cliRun(HD, FB, ['restore', bkf], 'yes\n');
  // khôi phục chuyển online về off → bật lại publicUrl để thấy OAuth (kiểm token cũ ở đúng audience)
  S = await ready(boot(P, {}, HD));
  fs.writeFileSync(path.join(HD, 'data/online.json'), JSON.stringify({ v: 1, adopted: true, mode: 'proxy', domain: HOST, publicUrl: 'https://' + HOST }));
  ok(rs.code === 0 && /Agent connections \(OAuth\) from the backup were revoked/.test(rs.out) && (await mcpInit(P, { host: HOST, ...bearer(tk) })).status === 401 && /backup restored: 1 agent connection/.test(S.out), 'CNS-138: khôi phục bản sao lưu còn kết nối → kết nối đó KHÔNG sống lại (401), log + CLI nói rõ', rs.out.slice(-300) + ' · ' + S.out.slice(-300));
  await stop(S);
  // khôi phục bản sao lưu chụp lúc stage admin → không mở lại admin
  const rs0 = cliRun(HD, FB, ['restore', pre], 'yes\n');
  S = await ready(boot(P, {}, HD)); openWindow(HD);
  const ad = await adminLogin(P);
  ok(rs0.code === 0 && stageOf(HD) === 'must_init' && ad.status === 403 && ad.json.reason === 'stage', 'khôi phục bản sao lưu chụp TRƯỚC khi khởi tạo (setup.json admin) → must_init, admin / admin 403 (sàn run/setup-floor)', 'restore ' + rs0.code + ': ' + rs0.out.slice(-400) + ' · stage ' + stageOf(HD) + ' · ' + ad.text);
  await stop(S);
  // xoá auth.json → không mở lại admin
  fs.rmSync(path.join(HD, 'data/auth.json'));
  S = await ready(boot(P, {}, HD)); openWindow(HD);
  const ad2 = await adminLogin(P);
  ok(ad2.status === 403 && ad2.json.reason === 'stage' && (await req(P, 'GET', '/api/auth/state')).json.password === false, 'xoá auth.json → admin / admin vẫn 403 (stage giữ); lối vào: genchibi password / token');
  await stop(S);
}

/* ================================================================== 9) CLI */
console.log('9) CLI: open / start mở cửa sổ (native GC_BIND · Docker giả: compose config chỉ loopback) · password · setup · status');
{
  const P = 7958, HD = cliHome(P), { FB, LOG } = shims(HD);
  const S = await ready(boot(P, {}, HD));
  let st = cliRun(HD, FB, ['status']);
  ok(st.code === 0 && /admin \/ admin window is closed/.test(st.out), 'genchibi status (stage admin, chưa cửa sổ): "admin / admin window is closed — genchibi open"', st.out);
  const op = cliRun(HD, FB, ['open']);
  const wf = path.join(HD, 'run/admin-window'), wj = JSON.parse(fs.readFileSync(wf, 'utf8'));
  ok(op.code === 0 && /sign in with admin \/ admin within 30 minutes/.test(op.out) && (fs.statSync(wf).mode & 0o777) === 0o600 && (fs.statSync(path.join(HD, 'run')).mode & 0o777) === 0o700 && wj.mode === 'native' && Math.abs(wj.exp - Date.now() - 1800e3) < 60e3 && /^[0-9a-f]{32}$/.test(wj.key)
    && op.out.includes('http://localhost:' + P + '/login#k=' + wj.key), 'genchibi open: ghi run/admin-window (0600, run/ 0700, native, hạn 30 phút, khoá 128 bit) + in link http://localhost:<cổng>/login#k=<khoá>', op.out);
  { const opened = fs.readFileSync(path.join(FB, 'opened.txt'), 'utf8').trim().split('\n').pop(), red = path.join(HD, 'run/open-admin.html');
    ok(opened === red && !opened.includes(wj.key) && (fs.statSync(red).mode & 0o777) === 0o600 && fs.readFileSync(red, 'utf8').includes('url=http://localhost:' + P + '/login#k=' + wj.key),
      'genchibi open: trình duyệt mở run/open-admin.html (0600) chuyển sang link — khoá KHÔNG nằm trong argv của trình mở (ps của user khác không thấy)', opened); }
  { const k1 = wj.key, op2 = cliRun(HD, FB, ['open']), k2 = JSON.parse(fs.readFileSync(wf, 'utf8')).key;
    ok(op2.code === 0 && /^[0-9a-f]{32}$/.test(k2) && k2 !== k1 && (await adminLogin(P, {}, 'admin', k1)).json.reason === 'link', 'genchibi open lần nữa → khoá MỚI (ngẫu nhiên 128 bit), link cũ hết hiệu lực', k1 + ' ' + k2); }
  ok((await adminLogin(P)).status === 200, '…admin / admin nhận ngay sau genchibi open');
  st = cliRun(HD, FB, ['status']); ok(/open http:\/\/localhost:\d+\/login#k=[0-9a-f]{32} and sign in with admin \/ admin \(window open until \d\d:\d\d; only through this link\)/.test(st.out), 'genchibi status: "window open until HH:MM"', st.out);
  let sh = cliRun(HD, FB, ['setup', 'hint']);
  const lastLine = sh.out.trim().split('\n').pop();
  ok(/^Next: open http:\/\/localhost:\d+\/login#k=[0-9a-f]{32} and sign in with admin \/ admin within 30 minutes/.test(lastLine) && /ssh -L/.test(sh.out), 'genchibi setup hint (dòng cuối của trình cài): "Next: open http://localhost:<cổng>/login#k=<khoá> and sign in with admin / admin within 30 minutes" + dòng SSH port-forward', sh.out);
  // native GC_BIND không loopback → không mở cửa sổ
  fs.rmSync(wf);
  const HB = cliHome(P, 'GC_MODE=native\nGC_PORT=' + P + '\nGC_LANG=en\nGC_BIND=0.0.0.0\nGC_API_TOKEN=' + tokOf(HD) + '\n');
  fs.rmSync(path.join(HB, 'current')); fs.symlinkSync(ROOT, path.join(HB, 'current')); fs.mkdirSync(path.join(HB, 'data'), { recursive: true }); fs.copyFileSync(path.join(HD, 'data/setup.json'), path.join(HB, 'data/setup.json'));
  const ob = cliRun(HB, FB, ['open']);
  ok(!fs.existsSync(path.join(HB, 'run/admin-window')) && /GC_BIND=0\.0\.0\.0 opens the app to the network/.test(ob.out), 'native GC_BIND=0.0.0.0 → genchibi open KHÔNG mở cửa sổ, nói lý do', ob.out);
  // Docker giả: docker compose config --format json
  const DD = path.join(HD, 'fakedocker'); fs.mkdirSync(DD, { recursive: true });
  const fakeDocker = cfg => '#!/usr/bin/env bash\necho "$*" >> ' + JSON.stringify(path.join(DD, 'docker.log')) + '\ncase " $* " in *" info "*) exit 0 ;; *" config --format json"*) ' + (cfg === null ? 'exit 1' : 'cat <<\'JSON\'\n' + JSON.stringify(cfg) + '\nJSON\n') + ' ;; esac\nexit 0\n';
  const HDk = cliHome(P, 'GC_MODE=docker\nGC_PORT=' + P + '\nGC_LANG=en\nGC_API_TOKEN=' + tokOf(HD) + '\nGC_DOCKER_VIA=direct\n');
  fs.mkdirSync(path.join(HDk, 'data'), { recursive: true });
  // v0.23.1 (CNS-279): bản cài Docker ở MỌI uid dùng tệp compose đã kiểm của ~/.local/lib/gen-chibi — dựng sẵn như trình cài (rel/<bản>/ + mode), HOME riêng;
  // root: home của uid 0 theo passwd → getent giả trả HOME này. Chạy bằng root thật: thư mục cài thuộc nobody (như user của container) — genchibi hạ quyền
  const HKH = tmp('home'), KTD = path.join(HKH, '.local/lib/gen-chibi'); fs.mkdirSync(path.join(KTD, 'rel/v0.0.0'), { recursive: true, mode: 0o700 }); fs.chmodSync(KTD, 0o700);
  for (const f of ['docker-compose.yml', 'docker-compose.edge.yml']) fs.copyFileSync(path.join(ROOT, f), path.join(KTD, 'rel/v0.0.0', f));
  fs.writeFileSync(path.join(KTD, 'installs'), 'docker ' + fs.realpathSync(HDk) + '\n');
  fs.writeFileSync(path.join(FB, 'getent'), '#!/usr/bin/env bash\nif [ "$1 $2" = "passwd 0" ]; then echo "root:x:0:0:root:' + HKH + ':/bin/bash"; exit 0; fi\nexec /usr/bin/getent "$@"\n', { mode: 0o755 });
  fs.symlinkSync(HKH, path.join(HDk, '.khome'));
  if (process.getuid && process.getuid() === 0) execFileSync('chown', ['-hR', '65534:65534', HDk]);
  const dk = cfg => { const b = path.join(DD, 'bin-' + crypto.randomBytes(4).toString('hex')); fs.mkdirSync(b); fs.writeFileSync(path.join(b, 'docker'), fakeDocker(cfg), { mode: 0o755 }); return b + ':' + FB; };
  const svc = (ports) => ({ services: { app: { ports } } });
  try { fs.rmSync(path.join(HDk, 'run/admin-window')); } catch (e) { /* chưa có */ }
  let r = cliRunK(HDk, dk(svc([{ mode: 'ingress', host_ip: '127.0.0.1', target: 7480, published: String(P), protocol: 'tcp' }])), ['open']);
  let dw = fs.existsSync(path.join(HDk, 'run/admin-window')) ? JSON.parse(fs.readFileSync(path.join(HDk, 'run/admin-window'), 'utf8')) : null;
  ok(dw && dw.mode === 'docker' && dw.composeLoopback === true && /within 30 minutes/.test(r.out), 'Docker: compose config chỉ publish 127.0.0.1 → cửa sổ mở, composeLoopback true', r.out);
  fs.rmSync(path.join(HDk, 'run/admin-window'));
  r = cliRunK(HDk, dk({ services: { app: { ports: [{ mode: 'ingress', host_ip: '127.0.0.1', target: 7480, published: String(P), protocol: 'tcp' }] }, proxy: { ports: [{ mode: 'ingress', target: 80, published: '8080', protocol: 'tcp' }] } } }), ['open']);
  ok(!fs.existsSync(path.join(HDk, 'run/admin-window')) && /Docker publishes a port beyond loopback \(0\.0\.0\.0:8080\)/.test(r.out), 'Docker: override publish cổng ra 0.0.0.0 (service khác, không host_ip) → KHÔNG mở cửa sổ, nói lý do + địa chỉ', r.out);
  r = cliRunK(HDk, dk(svc([{ mode: 'ingress', host_ip: '0.0.0.0', target: 7480, published: String(P), protocol: 'tcp' }])), ['open']);
  ok(!fs.existsSync(path.join(HDk, 'run/admin-window')) && /beyond loopback \(0\.0\.0\.0:/.test(r.out), 'Docker: GC_BIND=0.0.0.0 (app publish 0.0.0.0) → không mở cửa sổ', r.out);
  r = cliRunK(HDk, dk(null), ['open']);
  ok(!fs.existsSync(path.join(HDk, 'run/admin-window')) && /could not read the Docker compose configuration/.test(r.out), 'Docker: docker compose config lỗi → không mở cửa sổ (đóng khi nghi ngờ)', r.out);
  for (const nm of ['host', 'container:other', 'service:db']) {
    r = cliRunK(HDk, dk({ services: { app: { network_mode: nm, ports: [{ mode: 'ingress', host_ip: '127.0.0.1', target: 7480, published: String(P), protocol: 'tcp' }] } } }), ['open']);
    ok(!fs.existsSync(path.join(HDk, 'run/admin-window')) && new RegExp('beyond loopback \\(network_mode:' + nm + '\\)').test(r.out), 'review F2: Docker network_mode ' + nm + ' (mạng của host / service khác) → KHÔNG mở cửa sổ', r.out);
  }
  r = cliRunK(HDk, dk({ services: { app: { network_mode: 'bridge', ports: [{ mode: 'ingress', host_ip: '127.0.0.1', target: 7480, published: String(P), protocol: 'tcp' }] } } }), ['open']);
  ok(fs.existsSync(path.join(HDk, 'run/admin-window')), 'Docker network_mode bridge (mặc định) + publish loopback → cửa sổ mở', r.out); fs.rmSync(path.join(HDk, 'run/admin-window'));
  r = cliRunK(HDk, dk(svc([{ mode: 'ingress', host_ip: '127.0.0.1', target: 7480, published: String(P), protocol: 'tcp' }])), ['start']);
  ok(fs.existsSync(path.join(HDk, 'run/admin-window')) && /within 30 minutes/.test(r.out) && /compose .*up -d/.test(fs.readFileSync(path.join(DD, 'docker.log'), 'utf8')), 'Docker: genchibi start (compose up giả) → mở cửa sổ', r.out);
  // genchibi password khởi tạo (app chạy) + --init-stdin
  const pi = cliRun(HD, FB, ['password', '--init-stdin'], 'Ryan\nmot cum tu rat dai day\n');
  ok(pi.code === 0 && /Owner account ready: username ryan/.test(pi.out) && stageOf(HD) === 'domain', 'genchibi password --init-stdin (trình cài): tên + mật khẩu qua stdin → khởi tạo (tên chữ thường), stage domain', pi.out);
  const pi2 = cliRun(HD, FB, ['password', '--init-stdin'], 'ryan\nmot mat khau khac nua\n');
  ok(pi2.code === 1 && /already exists — the password was not changed/.test(pi2.out), '…chạy lại khi đã có owner → thoát 1, không đổi mật khẩu', pi2.out);
  ok(cliRun(HD, FB, ['password', '--init-stdin'], 'admin\nmot cum tu rat dai day\n').code === 1, '…tên admin → từ chối');
  sh = cliRun(HD, FB, ['setup', 'hint']); ok(/Next: open http:\/\/localhost:\d+, sign in as ryan and finish the first-run setup/.test(sh.out), 'setup hint sau khởi tạo: "sign in as ryan and finish the first-run setup"', sh.out);
  const ss = cliRun(HD, FB, ['setup']); ok(ss.code === 0 && /First-run setup: domain/.test(ss.out), 'genchibi setup: in stage', ss.out);
  const sk = cliRun(HD, FB, ['setup', 'skip', 'agent "test" \\ broken']); ok(sk.code === 0 && /skipped/.test(sk.out) && stageOf(HD) === 'done', 'genchibi setup skip [lý do] → done (lý do có " \\ bị lọc)', sk.out);
  const rr = cliRun(HD, FB, ['setup', 'reset']); ok(rr.code === 0 && /reset \(stage domain\)/.test(rr.out) && stageOf(HD) === 'domain', 'genchibi setup reset → domain', rr.out);
  // MCP-04 (CNS-269): genchibi setup check chạy THẬT "<đường tuyệt đối> mcp" trên máy chủ, gửi kết quả (token) → wizard; ghi run/cli-path → thẻ nối agent dùng đường đầy đủ
  const self = path.join(ROOT, 'cli/genchibi');
  const hc = cliRun(HD, FB, ['setup', 'check']);
  const sv = (await req(P, 'GET', '/api/setup', { headers: bearer(tokOf(HD)) })).json || {}, hk = (sv.mcp || {}).hostCheck || {};
  ok(hc.code === 0 && hc.out.includes('MCP-04 ✓') && hk.ok === true && hk.cmd === self && hk.tools > 10 && sv.cli === self && fs.readFileSync(path.join(HD, 'run/cli-path'), 'utf8').trim() === self,
    'genchibi setup check: chạy thật ' + self + ' mcp (initialize + tools/list) → MCP-04 ✓ trong /api/setup (cmd = đường tuyệt đối, ' + hk.tools + ' tool); run/cli-path → /api/setup.cli', hc.out + JSON.stringify(hk));
  ok(!(sv.mcp || {}).lastClient, 'MCP-04 không tính là "agent đã nối" (clientInfo gen-chibi-selftest)');
  { const lg = await req(P, 'POST', '/api/auth/login', { headers: local(P), body: { username: 'ryan', password: 'mot cum tu rat dai day' } }), ck = (lg.set[0] || '').split(';')[0];
    const hs = await req(P, 'POST', '/api/setup/hostcheck', { headers: { ...local(P), cookie: ck }, body: { ok: true, tools: 5, cmd: '/tmp/x' } });
    ok(lg.status === 200 && hs.status === 403, 'POST /api/setup/hostcheck từ phiên Studio (S) → 403 — chỉ CLI trên máy chủ (token chủ)', hs.text); }
  { const bad = await req(P, 'POST', '/api/setup/hostcheck', { headers: { ...W, ...bearer(tokOf(HD)) }, body: { ok: true, tools: 5, cmd: 'relative/genchibi' } });
    ok(bad.status === 200 && bad.json.mcp.hostCheck.ok === false, 'hostcheck với đường không tuyệt đối → không bao giờ ✓', bad.text); }
  ok(!fs.readFileSync(LOG, 'utf8').includes('rat dai day') && !fs.readFileSync(LOG, 'utf8').includes(tokOf(HD)), 'mật khẩu / token không nằm trong argv của curl');
  await stop(S);
  { const hf = cliRun(HD, FB, ['setup', 'check']); ok(hf.code === 1 && hf.out.includes('MCP-04 ✗'), 'genchibi setup check khi app dừng → MCP-04 ✗ + cách kiểm, thoát 1', hf.out); }
  // genchibi password khi app DỪNG trên máy chưa khởi tạo → auth-cli.js khởi tạo (tên owner) + setup.json domain
  const HS = cliHome(P);
  let S2 = await ready(boot(P, {}, HS)); await stop(S2);
  const ps = cliRun(HS, FB, ['password'], 'mot cum tu khi app dung\n');
  ok(ps.code === 0 && /Owner account set while the app is stopped \(username owner\)/.test(ps.out) && stageOf(HS) === 'domain', 'genchibi password khi app dừng (stage admin) → auth-cli.js khởi tạo, tên owner, setup.json domain', ps.out);
  S2 = await ready(boot(P, {}, HS));
  ok((await req(P, 'POST', '/api/auth/login', { headers: local(P), body: { username: 'owner', password: 'mot cum tu khi app dung' } })).status === 200 && stageOf(HS) === 'domain', '…chạy lại: đăng nhập owner được, stage giữ domain');
  await stop(S2);
}

/* ================================================================== 10) ngôn ngữ */
console.log('10) ngôn ngữ: câu mới của server có bản en (không lọt chữ Việt), vi trả tiếng Việt');
{
  const P = 7959, S = await ready(boot(P, {})), T = tokOf(S.home);
  openWindow(S.home);
  const msgs = async lang => {
    const L = { 'x-gc-lang': lang }, out = [];
    out.push((await req(P, 'POST', '/api/auth/login', { headers: { ...local(P), ...L, origin: null }, body: { username: 'admin', password: 'admin' } })).json.error);
    out.push((await req(P, 'POST', '/api/auth/login', { headers: { ...local(P), ...L }, body: { password: 'x' } })).json.error);
    out.push((await req(P, 'POST', '/api/auth/login', { headers: { ...local(P), ...L }, body: { username: 'ryan', password: 'xxxxxxxxxxxxx' } })).json.error);
    out.push((await req(P, 'POST', '/api/auth/init', { headers: { ...local(P), ...L, ...bearer(T) }, body: initBody('admin') })).json.error);
    out.push((await req(P, 'POST', '/api/online/quick', { headers: { ...W, ...L, ...bearer(T) }, body: {} })).json.error);
    out.push((await req(P, 'GET', '/api/works', { headers: { ...L, ...bearer(T), 'x-gc-studio': '1' } })).json.error);
    out.push((await req(P, 'POST', '/api/setup/skip', { headers: { ...W, ...L, ...bearer(T) }, body: {} })).json.error);
    return out;
  };
  const en = await msgs('en'), vi = await msgs('vi');
  ok(en.every(m => typeof m === 'string' && m && !VI_RE.test(m)), 'en: ' + en.length + ' câu lỗi mới (admin lý do · thiếu tên · sai tên / mật khẩu · init · Go online chặn · cổng stage · skip) không có chữ Việt', JSON.stringify(en));
  ok(vi.every(m => typeof m === 'string' && VI_RE.test(m)), 'vi: cùng các câu đó là tiếng Việt', JSON.stringify(vi));
  await stop(S);
}

console.log('   Kết quả thiết lập lần đầu: ' + passn + ' đạt, ' + failn + ' trượt');
process.exit(failn ? 1 : 0);
