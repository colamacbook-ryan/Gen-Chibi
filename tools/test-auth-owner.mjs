// Kiểm đăng nhập chủ máy + bảng truy cập v0.21 (spec v021 §3.2–§3.4; cortex CNS-166/167/173/191–199; L-66). Server tạm thật, không ra mạng ngoài.
//  0) đơn vị (đồng hồ giả): mã setup (định dạng / TTL / một lần) · chính sách mật khẩu · phiên 30 ngày · cookie thiết bị (HMAC, thu hồi) · tên cookie theo cổng ·
//     Secure · online-config (nguồn .env chỉ đọc / app, bật tạm → chính thức / trả về, hỏi trước khi đổi audience) + OAuth đọc publicUrl lúc chạy
//  1) bảng §3.4 từng ô, trước / sau khi có mật khẩu, lớp N (máy mình = proxy tối giản kiểu nginx: không XFF, Host 127.0.0.1) và P (có XFF) — N KHÔNG được quyền chủ (CNS-191)
//  2) mã setup qua HTTP: sai định dạng không đếm · trần riêng xét TRƯỚC khi kiểm · T đặt được không cần mã · một lần
//  3) trần kiểu L-66: 10.000 lần đoán từ 500 IP → lần TRÚNG khi IP đã chạm trần vẫn 429; chủ có cookie thiết bị vẫn 200; kẻ lạ không khoá được chủ; trần riêng của thiết bị
//  4) trần toàn cục chỉ làm CHẬM (không khoá): kẻ lạ đúng mật khẩu vẫn vào được nhưng chậm; chủ có cookie thiết bị không bị chậm
//  5) phiên: đăng xuất · đổi mật khẩu thu hồi mọi phiên · CSRF X-GC-Request / Origin vẫn áp khi có cookie
//  6) máy kế thừa (kiểu máy Ryan: .env GC_PUBLIC_URL + GC_ALLOWED_HOSTS + GC_API_TOKEN + GC_MCP_KEY, request mang XFF) · dấu legacy.json ghi một lần
//  7) nâng cấp v0.20 không token: data/owner-token tự sinh (0600) · genchibi mcp (stdio) vẫn chạy · /mcp không header → 401 có hướng dẫn · Studio dẫn tới /setup
//  8) data/online.json đọc LÚC CHẠY: OAuth + Host được phép đổi theo tệp, không khởi động lại · bí mật không vào log · tệp bí mật 0600
//  9) CLI thật (bản cài native giả): genchibi status / open in-mở mã setup · password (app chạy → API; app dừng → ghi thẳng) · agent connect · mcp — token / mật khẩu không vào argv
// Dùng: node tools/test-auth-owner.mjs   (cổng 7741–7749). GC_TEST_ROOT=<cây mã khác> để chạy bộ kiểm trên bản đã sửa (rào ngược).
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
const { Auth, normCode, pwProblem, cookieName, isHttps } = require(ROOT + '/server/auth.js');
const { OnlineConfig, normUrl } = require(ROOT + '/server/online-config.js');
const { OAuth } = require(ROOT + '/server/oauth.js');

let failn = 0, passn = 0;
const ok = (c, m) => { if (c) { passn++; console.log('   ✓', m); } else { failn++; console.log('   ✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), 'gc-auth-' + p + '-'));
const mode = f => { try { return (fs.statSync(f).mode & 0o777).toString(8); } catch (e) { return 'không có'; } };
const kids = [];
process.on('exit', () => kids.forEach(k => { try { k.c.kill(); } catch (e) { /* đã tắt */ } }));
process.on('uncaughtException', e => { console.log('   ✗ lỗi bất ngờ: ' + (e && e.stack)); process.exit(1); });

// env sạch: bỏ mọi GC_* của máy chạy test (không để GC_API_TOKEN / GC_PUBLIC_URL lọt vào làm sai ca)
const baseEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GC_/.test(k)));
function boot(port, env, home) {
  home = home || tmp('h' + port);
  const c = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...baseEnv(), GC_HOME: home, GC_PORT: String(port), GC_NO_AUTOCHECK: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { c, home, port, out: '' }; kids.push(k);
  c.stdout.on('data', d => { k.out += d; }); c.stderr.on('data', d => { k.out += d; });
  return k;
}
async function ready(k) { for (let i = 0; i < 80; i++) { try { const r = await req(k.port, 'GET', '/api/health'); if (r.status === 200) return k; } catch (e) { /* chưa lên */ } await sleep(100); } throw new Error('server không lên ở cổng ' + k.port + '\n' + k.out); }
async function stop(k) { if (k.c.exitCode !== null) return; k.c.kill(); await new Promise(r => k.c.once('exit', r)); }

// HTTP thô (đặt được Host / X-Forwarded-For như một proxy thật)
const agent = new http.Agent({ keepAlive: false, maxSockets: 256 });
function req(port, method, p, o) {
  o = o || {};
  return new Promise((done, bad) => {
    const body = o.body === undefined ? null : Buffer.from(typeof o.body === 'string' ? o.body : JSON.stringify(o.body));
    const headers = Object.assign({ host: '127.0.0.1:' + port }, body ? { 'content-type': 'application/json', 'content-length': body.length } : {}, o.headers || {});
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers, agent }, res => {
      const ch = []; res.on('data', d => ch.push(d));
      res.on('end', () => { const text = Buffer.concat(ch).toString(); let json = null; try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ } done({ status: res.statusCode, headers: res.headers, text, json, set: res.headers['set-cookie'] || [] }); });
    });
    r.on('error', bad); if (body) r.write(body); r.end();
  });
}
const jar = set => Object.fromEntries(set.map(x => x.split(';')[0]).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const cookie = j => ({ cookie: Object.entries(j).map(([k, v]) => k + '=' + v).join('; ') });
const W = { 'x-gc-request': '1' };
const bearer = t => ({ authorization: 'Bearer ' + t });
const P = (ip, host) => ({ 'x-forwarded-for': ip, ...(host ? { host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' } : {}) });   // lớp P: proxy riêng có thêm XFF
async function pool(n, items, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }
// băm mật khẩu kiểu của server với tham số NHẸ (N=1024) — fixture cho các ca đoán số lượng lớn (server kiểm theo tham số lưu trong chuỗi băm)
function weakHash(pw) { const salt = crypto.randomBytes(16), h = crypto.scryptSync(pw, salt, 32, { N: 1024, r: 8, p: 1 }); return ['scrypt', 1024, 8, 1, salt.toString('base64url'), h.toString('base64url')].join('$'); }
function seedPassword(home, pw) { fs.mkdirSync(path.join(home, 'data'), { recursive: true }); fs.writeFileSync(path.join(home, 'data/auth.json'), JSON.stringify({ v: 1, users: { owner: { id: 'owner', role: 'owner', hash: weakHash(pw), setAt: new Date().toISOString() } }, sessions: {}, devices: {} }), { mode: 0o600 }); }
const codeOf = home => (fs.readFileSync(path.join(home, 'data/setup-code.txt'), 'utf8').split('\n')[0] || '').trim();
const PW = 'correct horse battery staple', PW2 = 'một cụm từ mới dài hơn 12';
const SECRETS = [PW];   // mọi bí mật đã dùng — kiểm cuối: không tệp log nào chứa

// ---- OAuth: chạy trọn một kết nối (register → authorize → approve bằng `ownerHdr` → code → token). Trả { approve, token, page }
async function oauthGrant(port, host, ownerHdr) {
  const CB = 'https://claude.ai/api/mcp/auth_callback', H = { host, ...P('203.0.113.77') };
  const reg = await req(port, 'POST', '/oauth/register', { headers: H, body: { client_name: 'Claude', redirect_uris: [CB] } });
  const v = crypto.randomBytes(32).toString('base64url'), ch = crypto.createHash('sha256').update(v).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.json.client_id, redirect_uri: CB, code_challenge: ch, code_challenge_method: 'S256', state: 's1' });
  const page = await req(port, 'GET', '/oauth/authorize?' + q, { headers: { ...H, ...(ownerHdr && ownerHdr.cookie ? { cookie: ownerHdr.cookie } : {}) } });
  const data = JSON.parse((/<script type="application\/json" id="gc-data">([\s\S]*?)<\/script>/.exec(page.text) || [])[1] || '{}');
  const ap = await req(port, 'POST', '/api/oauth/approve', { headers: { ...H, ...W, ...(ownerHdr || {}) }, body: { request: data.request, decision: 'approve', scope: 'mcp:write' } });
  let token = null;
  if (ap.status === 200) {
    const code = new URL(ap.json.redirect).searchParams.get('code');
    const t = await req(port, 'POST', '/oauth/token', { headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CB, client_id: reg.json.client_id, code_verifier: v, resource: 'https://' + host + '/mcp' }).toString() });
    token = t.json && t.json.access_token;
  }
  return { approve: ap, token, data, page };
}
const mcpInit = (port, headers, p) => req(port, 'POST', p || '/mcp', { headers, body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } } });

/* ================================================================== 0) đơn vị */
console.log('0) đơn vị (đồng hồ giả): mã setup · mật khẩu · phiên · cookie thiết bị · online-config + OAuth đọc lúc chạy');
{
  let t = Date.parse('2026-10-20T00:00:00Z'); const now = () => t;
  const dir = tmp('u'), key = crypto.randomBytes(32), logs = [];
  const a = new Auth({ dir, envToken: '', key, now, log: s => logs.push(s) });
  const tok = a.token;
  ok(/^[0-9a-f]{64}$/.test(tok) && fs.readFileSync(path.join(dir, 'owner-token'), 'utf8').trim() === tok && mode(path.join(dir, 'owner-token')) === '600', 'env trống → sinh data/owner-token 256 bit, 0600');
  ok(new Auth({ dir, envToken: '', key, now }).token === tok && new Auth({ dir, envToken: 'tu-env-123', key, now }).token === 'tu-env-123', 'khởi động lại dùng lại owner-token; GC_API_TOKEN (env) thắng tệp');
  a.ensureSetupCode(false);
  const txt = fs.readFileSync(path.join(dir, 'setup-code.txt'), 'utf8'), code = txt.split('\n')[0];
  ok(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(code) && /^expires=\d{10}$/m.test(txt) && mode(path.join(dir, 'setup-code.txt')) === '600' && mode(path.join(dir, 'setup-code')) === '600', 'mã setup: Crockford base32 10 ký tự (50 bit) dạng XXXXX-XXXXX, tệp bản rõ + tệp băm đều 0600: ' + code);
  ok(!fs.readFileSync(path.join(dir, 'setup-code'), 'utf8').includes(code.replace('-', '')) && !logs.join('\n').includes(code), 'tệp setup-code chỉ có HMAC + hạn (không bản rõ); log không có mã');
  ok(a.checkCode(code) === 'ok' && a.checkCode(code.toLowerCase().replace('-', ' ')) === 'ok' && a.checkCode('abc') === 'format' && a.checkCode(code.slice(0, 10) + (code[10] === '0' ? '1' : '0')) === 'wrong', 'kiểm mã: đúng (kể cả chữ thường / khoảng trắng) · sai định dạng → format · sai một ký tự → wrong');
  ok(normCode('iloo0-11111') === '1100011111' && normCode(' ab cd e-fgh jk ') === 'ABCDEFGHJK' && normCode('ABCDE-FGHJU') === '', 'Crockford: chữ thường / khoảng trắng / I L → 1, O → 0 được chuẩn hoá; U (không có trong bảng) → sai định dạng');
  t += 3600e3 + 1000;
  ok(a.checkCode(code) === 'expired', 'TTL 1 giờ: sau 1 giờ mã đúng → expired');
  a.tick(); const code2 = fs.readFileSync(path.join(dir, 'setup-code.txt'), 'utf8').split('\n')[0];
  ok(code2 !== code && a.checkCode(code2) === 'ok' && a.checkCode(code) === 'wrong', 'mã hết hạn → tick sinh mã mới, mã cũ không còn dùng được');
  const seen = new Set(); for (let i = 0; i < 300; i++) { a.ensureSetupCode(true); seen.add(fs.readFileSync(path.join(dir, 'setup-code.txt'), 'utf8').split('\n')[0]); }
  ok(seen.size === 300 && [...seen].every(c => /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(c)), '300 mã sinh liên tiếp đều khác nhau, đúng bảng chữ');
  // mật khẩu
  ok(pwProblem('ngắn quá 11') && !pwProblem('đủ mười hai!') && pwProblem('a'.repeat(1025)) && pwProblem('có\ttab dài dài') && pwProblem(' '.repeat(14)) && !pwProblem('Đường lên trời'), 'chính sách: ≥ 12 ký tự (đếm ký tự, không byte) · ≤ 1 KB · không ký tự điều khiển · không toàn khoảng trắng');
  await a.setPassword(PW, 'test');
  const u = JSON.parse(fs.readFileSync(path.join(dir, 'auth.json'), 'utf8')).users.owner;
  ok(/^scrypt\$16384\$8\$5\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(u.hash) && mode(path.join(dir, 'auth.json')) === '600' && !fs.readFileSync(path.join(dir, 'auth.json'), 'utf8').includes(PW), 'auth.json 0600: scrypt N=2^14 r=8 p=5 (OWASP), muối 16 byte, không có mật khẩu rõ; cấu trúc users{} để chỗ nhiều người dùng');
  ok(!fs.existsSync(path.join(dir, 'setup-code')) && !fs.existsSync(path.join(dir, 'setup-code.txt')) && a.checkCode(code2) === 'wrong', 'đặt mật khẩu xong: xoá cả hai tệp mã setup (dùng một lần)');
  ok(await a.checkPassword(PW) && !(await a.checkPassword(PW + 'x')), 'kiểm mật khẩu đúng / sai');
  // băm cũ yếu hơn mặc định → băm lại khi đăng nhập đúng
  const d2 = tmp('u2'); seedPassword(d2, PW);
  const a2 = new Auth({ dir: path.join(d2, 'data'), envToken: 'x'.repeat(40), key, now });
  ok(await a2.checkPassword(PW) && /^scrypt\$16384\$/.test(a2.owner().hash), 'băm tham số yếu (N=1024) vẫn kiểm được và được băm lại theo mặc định khi đăng nhập đúng');
  // phiên + thiết bị
  const R = (hd) => ({ headers: Object.assign({ host: 'localhost:7480' }, hd || {}), socket: { remoteAddress: '127.0.0.1' } });
  const set = a.issue(R()), cj = jar(set);
  ok(set.length === 2 && set.every(c => /; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/.test(c)) && /Max-Age=2592000/.test(set[0]) && cj.gc_session_7480 && /^v1\./.test(cj.gc_device_7480), 'đăng nhập: cookie phiên 30 ngày + cookie thiết bị, HttpOnly · SameSite=Lax · Path=/ (không Secure trên http://localhost); tên theo cổng (gc_session_7480)');
  const withC = R(cookie(cj));
  ok(a.ownerOf(withC) === 'S' && a.ownerOf(R()) === null && a.ownerOf(R(bearer(a.token))) === 'T' && a.ownerOf(R(bearer('sai'))) === null, 'ownerOf: phiên → S · token → T · không có gì / token sai → null');
  ok(a.ownerOf({ headers: { host: 'localhost:7481', cookie: 'gc_session_7480=' + cj.gc_session_7480 }, socket: {} }) === null, 'cookie của bản cài cổng 7480 không mở bản cài cổng 7481 (cookie tách theo cổng)');
  t += 30 * 86400e3 - 5000; ok(a.ownerOf(withC) === 'S', 'phiên còn hạn ở ngày thứ 29,99');
  t += 10000; ok(a.ownerOf(withC) === null, 'phiên hết hạn sau 30 ngày');
  const cj2 = jar(a.issue(R(cookie({ gc_device_7480: cj.gc_device_7480 })))), dev = a.deviceOf(R(cookie(cj2)));
  ok(dev && cj2.gc_device_7480 === cj.gc_device_7480, 'đăng nhập lại trên cùng trình duyệt: giữ cookie thiết bị cũ (một thiết bị)');
  const forged = cj2.gc_device_7480.replace(/.$/, c => c === 'A' ? 'B' : 'A');
  ok(!a.deviceOf(R(cookie({ gc_device_7480: forged }))) && !new Auth({ dir, envToken: 'x'.repeat(40), key: crypto.randomBytes(32), now }).deviceOf(R(cookie(cj2))), 'cookie thiết bị sửa chữ ký / ký bằng khoá chủ khác → không nhận (HMAC)');
  ok(a.logout(R(cookie(cj2))) && a.ownerOf(R(cookie(cj2))) === null, 'đăng xuất: phiên bị thu hồi');
  const cj3 = jar(a.issue(R())); a.dropDevice(a.deviceOf(R(cookie(cj3))).id);
  ok(!a.deviceOf(R(cookie(cj3))) && a.ownerOf(R(cookie(cj3))) === null, 'thu hồi thiết bị: cookie thiết bị chết + phiên của thiết bị đó chết');
  const cj4 = jar(a.issue(R())); await a.setPassword(PW2, 'test');
  ok(a.ownerOf(R(cookie(cj4))) === null && !a.deviceOf(R(cookie(cj4))) && Object.keys(a.s.sessions).length === 0, 'đổi mật khẩu: thu hồi MỌI phiên + thiết bị');
  ok(cookieName('gc_session', { headers: { host: 'chibi.example.com' } }) === 'gc_session' && isHttps({ headers: {}, gcEdge: 'caddy' }) && isHttps({ headers: { 'x-forwarded-proto': 'http, https' } }) && !isHttps({ headers: {} }) && / Secure$/.test(a.issue({ headers: { host: 'chibi.example.com' }, gcEdge: 'tunnel', socket: {} })[0]), 'Host không cổng → tên gốc gc_session · Secure khi qua edge của app / X-Forwarded-Proto https');
  ok(logs.every(l => !l.includes(tok) && !l.includes(PW) && !l.includes(PW2)), 'log của Auth không có token / mật khẩu');
  // trần theo tài khoản (giảm thiểu DoS — Gen 2026-10-20): cửa sổ CỐ ĐỊNH ≤ 15 phút từ lần sai đầu, không tích luỹ; T luôn qua; ghi sự kiện báo chủ
  const X = ip => ({ headers: { host: 'localhost:7480' }, socket: { remoteAddress: ip } });
  const t0 = t; for (let i = 0; i < 100; i++) { const g = a.guard('login', X('203.0.113.' + (i % 250))); if (!g.wait) a.fail('login', g); t += 1000; }
  const gl = a.guard('login', X('198.51.100.1'));
  ok(gl.wait > 0 && gl.wait <= 900 && gl.locked && a.state(R()).locked > 0, '100 lần sai từ 100 IP → người lạ (IP mới) bị chặn theo tài khoản, còn ≤ 15 phút (' + gl.wait + ' s); /api/auth/state báo locked');
  ok(a.guard('login', Object.assign(X('198.51.100.1'), { headers: { host: 'localhost:7480', authorization: 'Bearer ' + a.token } })).who === 'T', 'token chủ (T) luôn qua trần tài khoản');
  const ev = a.s.events[a.s.events.length - 1];
  ok(ev && ev.failures === 100 && ev.ips === 100 && !ev.seen && logs.some(l => /temporarily blocked .* 100 failed attempts from 100 address/.test(l)) && a.view(R()).alerts.length === 1, 'chạm trần tài khoản → ghi sự kiện cho chủ (100 lần sai, 100 địa chỉ, lúc chặn, tới khi) + log; /api/info.auth.alerts có cảnh báo');
  t = t0 + 900e3 - 1000; ok(a.guard('login', X('198.51.100.1')).wait > 0, 'vẫn chặn sát cuối cửa sổ 15 phút (lần sai đầu + 15 phút)');
  t = t0 + 900e3 + 1000; ok(a.guard('login', X('198.51.100.1')).wait === 0, 'hết cửa sổ cố định 15 phút → hết chặn (không tích luỹ, không kéo dài)');

  // online-config + OAuth đọc publicUrl lúc chạy
  const od = tmp('on'), oa = { v: null };
  const envCfg = new OnlineConfig({ dir: od, env: { publicUrl: 'https://chibi.example.test', allowedHosts: 'chibi.example.test,*.trycloudflare.com' } });
  ok(envCfg.get().source === 'env' && envCfg.get().readOnly && envCfg.publicUrl() === 'https://chibi.example.test' && envCfg.hostAllowed('chibi.example.test') && envCfg.hostAllowed('ab.trycloudflare.com') && !envCfg.hostAllowed('trycloudflare.com'), '.env kế thừa: nguồn env, chỉ đọc, publicUrl + Host (kể cả *.trycloudflare.com) từ .env');
  ok(envCfg.setPending('https://khac.example.test').readOnly === true && envCfg.publicUrl() === 'https://chibi.example.test', 'nguồn .env: setPending bị từ chối (chỉ đọc), không trộn khoá');
  const mg = envCfg.migrate();
  ok(mg.ok && envCfg.get().source === 'app' && envCfg.publicUrl() === 'https://chibi.example.test' && envCfg.hostAllowed('ab.trycloudflare.com'), 'migrate(): chép .env vào online.json, từ đó online.json là nguồn (adopted)');
  const cfg = new OnlineConfig({ dir: tmp('on2'), env: {}, impact: url => oa.v ? oa.v.grantsNotFor(url) : 0, onCommit: () => oa.v.prune() });
  const oauth = new OAuth({ dir: tmp('oa'), publicUrl: () => cfg.publicUrl(), pruneOk: () => !cfg.pending() }); oa.v = oauth;
  ok(!oauth.enabled && cfg.get().source === 'app' && cfg.get().mode === 'off', 'chưa cấu hình: OAuth tắt, mode off');
  ok(cfg.setPending('http://evil.example').ok === false && cfg.setPending('https://x.example.test/duong').ok === false && !normUrl('https://a_b.example').url, 'URL công khai phải https gốc, tên miền hợp lệ');
  let r = cfg.setPending('https://chibi.example.test');
  ok(r.ok && oauth.enabled && oauth.resource === 'https://chibi.example.test/mcp' && cfg.hostAllowed('chibi.example.test') && cfg.get().publicUrl === '', 'bật TẠM: OAuth bật ngay theo url tạm (không khởi động lại), Host được phép; bản chính thức vẫn rỗng');
  r = cfg.commit(); ok(r.ok && cfg.get().publicUrl === 'https://chibi.example.test' && !cfg.get().publicUrlPending && cfg.get().domain === 'chibi.example.test', 'commit: bản tạm thành chính thức, domain theo URL');
  // một kết nối OAuth cho audience hiện tại
  const reg = oauth.register({ client_name: 'C', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }).body;
  const v = crypto.randomBytes(32).toString('base64url'), view = oauth.authorize(new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: crypto.createHash('sha256').update(v).digest('base64url'), code_challenge_method: 'S256' })).view;
  const code0 = new URL(oauth.approve(view.request, 'approve', 'mcp:write').redirect).searchParams.get('code');
  const at = oauth.token({ client_id: reg.client_id, grant_type: 'authorization_code', code: code0, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_verifier: v }).body.access_token;
  ok(oauth.verify(at) && cfg.preview('https://moi.example.test').revokes === 1 && cfg.preview('https://chibi.example.test').revokes === 0, 'preview: đổi sang tên miền khác sẽ thu hồi 1 kết nối; cùng tên miền → 0');
  r = cfg.setPending('https://moi.example.test');
  ok(r.ok === false && r.needConfirm && r.revokes === 1 && cfg.publicUrl() === 'https://chibi.example.test', 'đổi audience khi đang có kết nối → needConfirm (UI hỏi chủ trước), không đổi gì');
  r = cfg.setPending('https://moi.example.test', { force: true });
  ok(r.ok && oauth.resource === 'https://moi.example.test/mcp' && !oauth.verify(at) && oauth.list().some(c => c.status === 'active'), 'force: bật tạm url mới — token cũ không dùng được ở url mới NHƯNG kết nối chưa bị gỡ');
  cfg.revert(); ok(oauth.resource === 'https://chibi.example.test/mcp' && oauth.verify(at), 'revert (lỗi giữa chừng): về url cũ, kết nối cũ dùng lại được');
  cfg.setPending('https://moi.example.test', { force: true }); cfg.commit();
  ok(oauth.resource === 'https://moi.example.test/mcp' && !oauth.list().some(c => c.status === 'active') && cfg.preview('https://chibi.example.test').revokes === 0, 'commit url mới: kết nối của url cũ bị gỡ (OAuth thu hồi)');
  r = cfg.setMode('tunnel', { clientIpHeader: 'cf-connecting-ip' }); const r2 = cfg.setMode('caddy');
  ok(r.ok && r.clientIpHeader === 'cf-connecting-ip' && r2.ok && r2.clientIpHeader === '' && cfg.ipHeader() === '' && cfg.setMode('lạ').ok === false, 'clientIpHeader gắn với mode: đổi mode thì xoá; mode lạ bị từ chối');
  cfg.setMode('quick'); ok(cfg.hostAllowed('xy-z.trycloudflare.com') && !new OnlineConfig({ dir: tmp('on3'), env: {} }).hostAllowed('xy-z.trycloudflare.com'), 'mode quick: *.trycloudflare.com được phép (chỉ khi bật)');
}

/* ================================================================== 1) bảng §3.4 */
console.log('1) bảng truy cập §3.4 — bản cài mới, trước / sau mật khẩu; lớp N (máy mình = proxy tối giản) và P (có XFF)');
const KEY = 'linkkey_' + crypto.randomBytes(12).toString('hex'), HOST = 'chibi.example.test';
const homeA = tmp('A'); fs.mkdirSync(path.join(homeA, 'data'), { recursive: true });
fs.writeFileSync(path.join(homeA, 'data/online.json'), JSON.stringify({ v: 1, adopted: true, mode: 'proxy', publicUrl: 'https://' + HOST }));   // bản cài v0.21 đã online qua app (không phải .env)
const A = await ready(boot(7741, { GC_MCP_KEY: KEY }, homeA));
const TA = fs.readFileSync(path.join(homeA, 'data/owner-token'), 'utf8').trim(); SECRETS.push(TA);
{
  const N = {}, NG = { host: '127.0.0.1:7741' }, LH = { host: 'localhost:7741' }, PX = P('198.51.100.7', HOST);   // N: không header proxy · nginx tối giản: Host 127.0.0.1 · P: proxy có XFF
  const st = async (m, p, h, b) => (await req(7741, m, p, { headers: h, body: b })).status;
  const keys = async h => Object.keys((await req(7741, 'GET', '/api/health', { headers: h })).json || {}).sort().join(',');
  let s = [];
  for (const p of ['/', '/xuong', '/thu-vien', '/tao-tac', '/studio/app.js', '/login', '/setup']) s.push(await st('GET', p, N), await st('GET', p, PX));
  ok(s.every(x => x === 200), 'chưa có mật khẩu: Studio tĩnh (/, 3 khu, app.js, /login, /setup) → 200 mọi lớp');
  ok((await keys(N)) === 'ok,uiLang,version' && (await keys(PX)) === 'ok,uiLang,version', 'GET /api/health công khai, chỉ ok / version / uiLang (launcher, healthcheck Docker, màn đăng nhập)');
  s = [await st('GET', '/api/info', N), await st('GET', '/api/info', NG), await st('GET', '/api/info', LH), await st('GET', '/api/info', PX), await st('POST', '/api/works', { ...NG, ...W }, { title: 'x' }), await st('GET', '/api/info', { ...NG, cookie: 'gc_session_7741=' + 'A'.repeat(43) })];
  ok(s.every(x => x === 401), 'CNS-191: /api/* không bằng chứng → 401 ở MỌI lớp — kể cả N (máy mình) và proxy tối giản (Host 127.0.0.1, không XFF); cookie giả → 401 [' + s + ']');
  ok(await st('GET', '/api/info', { ...NG, ...bearer(TA) }) === 200 && await st('GET', '/api/info', { ...PX, ...bearer(TA) }) === 200, 'chưa có mật khẩu: /api/* với T (token chủ từ data/owner-token) → 200');
  const sj = (await req(7741, 'GET', '/api/auth/state', { headers: N })).json;
  ok(sj.password === false && sj.setup === true && sj.owner === null && sj.legacy === false, '/api/auth/state (công khai): chưa có mật khẩu, có mã setup, không phải máy kế thừa');
  ok(await st('POST', '/api/auth/login', { ...N, ...W }, { password: PW }) === 409, '/login khi chưa có mật khẩu → 409 (chỉ đường /setup)');
  ok(await st('POST', '/api/auth/setup', { ...NG, ...W }, { password: PW }) === 400 && await st('POST', '/api/auth/setup', { ...NG, ...W }, { code: 'AAAAA-AAAAA', password: PW }) === 401, '/setup không C / T → từ chối (thiếu mã 400, mã sai 401) — N không tự đặt được mật khẩu chủ');
  // /mcp: K / O / T
  const kOk = (await mcpInit(7741, { host: HOST, ...P('203.0.113.5') }, '/mcp/' + KEY)).status, tOk = (await mcpInit(7741, { ...NG, ...bearer(TA) })).status, none = await mcpInit(7741, NG);
  ok(kOk === 200 && tOk === 200 && none.status === 401 && /resource_metadata="https:\/\/chibi\.example\.test\//.test(none.headers['www-authenticate'] || ''), '/mcp: K (link có khoá) 200 · T 200 · không header (kể cả N) 401 + WWW-Authenticate');
  const g0 = await oauthGrant(7741, HOST, null);
  ok(g0.approve.status === 401 && g0.data.needToken === true && g0.data.loginUrl === '', 'chưa có mật khẩu: /api/oauth/approve không bằng chứng → 401; trang Cấp phép hỏi token, không có lối đăng nhập');
  const g1 = await oauthGrant(7741, HOST, bearer(TA));
  ok(g1.approve.status === 200 && g1.token && (await mcpInit(7741, { host: HOST, ...bearer(g1.token) })).status === 200, 'chưa có mật khẩu: approve với T → 200; /mcp với O (access token OAuth) → 200');
  ok((await req(7741, 'GET', '/.well-known/oauth-protected-resource', { headers: { host: HOST } })).status === 200 && (await req(7741, 'POST', '/oauth/register', { headers: { host: HOST, ...P('203.0.113.6') }, body: { client_name: 'x', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] } })).status === 201, 'OAuth máy (.well-known, /oauth/register) công khai');
  ok(await st('GET', '/api/online/status', PX) === 401 && await st('GET', '/api/online/status', { ...PX, ...bearer(TA) }) === 404, '/api/online/*: không bằng chứng → 401 · T qua cổng (404 = route chưa có ở P1, P3 gắn)');

  // ---- đặt mật khẩu bằng mã setup (C) từ N
  const code = codeOf(homeA); SECRETS.push(code);
  const su = await req(7741, 'POST', '/api/auth/setup', { headers: { ...NG, ...W }, body: { code, password: PW } }), cA = jar(su.set);
  ok(su.status === 200 && cA.gc_session_7741 && cA.gc_device_7741 && su.set.every(c => /HttpOnly; SameSite=Lax/.test(c) && !/Secure/.test(c)), 'C: mã setup đúng → 200, đặt phiên + cookie thiết bị (HttpOnly, SameSite=Lax; http cục bộ không Secure)');
  ok(!fs.existsSync(path.join(homeA, 'data/setup-code.txt')) && (await req(7741, 'POST', '/api/auth/setup', { headers: { ...NG, ...W }, body: { code, password: PW2 } })).status === 404, 'mã dùng một lần: tệp bị xoá; /setup lần nữa → 404 (đã có mật khẩu)');
  const SA = cookie(cA);
  // ---- sau khi có mật khẩu
  s = [];
  for (const p of ['/', '/xuong', '/studio/app.js', '/login']) s.push(await st('GET', p, N), await st('GET', p, PX));
  const toLogin = await req(7741, 'GET', '/setup', { headers: N });
  ok(s.every(x => x === 200) && toLogin.status === 302 && toLogin.headers.location === '/login', 'có mật khẩu: Studio tĩnh vẫn 200 mọi lớp; GET /setup → 302 /login');
  ok((await keys(PX)) === 'ok,uiLang,version', 'có mật khẩu: /api/health vẫn công khai');
  s = [await st('GET', '/api/info', N), await st('GET', '/api/info', NG), await st('GET', '/api/info', LH), await st('GET', '/api/info', PX)];
  ok(s.every(x => x === 401), 'CNS-191: có mật khẩu, không phiên / token → 401 ở mọi lớp (N, proxy tối giản, localhost, P) [' + s + ']');
  ok(await st('GET', '/api/info', { ...NG, ...SA }) === 200 && await st('GET', '/api/info', { ...NG, ...bearer(TA) }) === 200, 'có mật khẩu: /api/* với S (phiên) → 200, với T → 200');
  // đăng nhập qua proxy (P, https): cookie tên gốc + Secure
  const lp = await req(7741, 'POST', '/api/auth/login', { headers: { ...PX, ...W }, body: { password: PW } }), cP = jar(lp.set);
  ok(lp.status === 200 && cP.gc_session && lp.set.every(c => / Secure$/.test(c)) && await st('GET', '/api/info', { ...PX, ...cookie(cP) }) === 200, '/login qua proxy https (P): 200, cookie gc_session / gc_device có Secure; /api/* bằng phiên đó → 200');
  ok(await st('POST', '/api/auth/login', { ...PX, ...W }, { password: 'sai mật khẩu rồi nhé' }) === 401, '/login sai mật khẩu → 401');
  ok((await mcpInit(7741, { ...NG, ...SA })).status === 401 && (await mcpInit(7741, { ...NG, ...bearer(TA) })).status === 200 && (await mcpInit(7741, { host: HOST }, '/mcp/' + KEY)).status === 200 && (await mcpInit(7741, { host: HOST, ...bearer(g1.token) })).status === 200, '/mcp: phiên cookie (S) KHÔNG mở /mcp → 401; K / O / T vẫn 200');
  const g2 = await oauthGrant(7741, HOST, cookie(cP)), g3 = await oauthGrant(7741, HOST, null), g4 = await oauthGrant(7741, HOST, bearer(TA));
  ok(g2.approve.status === 200 && g2.data.needToken === false && g3.approve.status === 401 && g3.data.needToken === true && /^\/login\?next=%2Foauth%2Fauthorize%3F/.test(g3.data.loginUrl) && g4.approve.status === 200, 'có mật khẩu: Cấp phép với S → 200 (trang không hỏi token) · không bằng chứng → 401, trang có lối /login?next= quay lại đúng trang · T → 200');
  ok(await st('GET', '/api/online/status', { ...NG, ...SA }) === 404 && await st('GET', '/api/online/status', NG) === 401, '/api/online/*: S qua cổng (404 = route của P3), không bằng chứng → 401');
  // CSRF: cookie tự gửi → mọi lệnh thay đổi vẫn cần X-GC-Request + Origin hợp lệ
  s = [await st('POST', '/api/works', { ...NG, ...SA }, { title: 'csrf' }), await st('POST', '/api/works', { ...NG, ...SA, ...W, origin: 'http://evil.example' }, { title: 'csrf' }), await st('POST', '/api/auth/login', NG, { password: PW }), await st('POST', '/api/auth/logout', { ...NG, ...SA })];
  ok(s.every(x => x === 403) && await st('POST', '/api/works', { ...NG, ...SA, ...W }, { title: 'Phim S' }) === 200, 'CSRF: có phiên cookie nhưng thiếu X-GC-Request / Origin lạ → 403 (kể cả /login, /logout); đủ header → 200 [' + s + ']');
  // ---- 5) phiên: đăng xuất, đổi mật khẩu thu hồi
  console.log('5) phiên: đăng xuất · đổi mật khẩu thu hồi mọi phiên · danh sách / thu hồi thiết bị');
  const lo = await req(7741, 'POST', '/api/auth/logout', { headers: { ...NG, ...W, ...cookie(cP) } });
  ok(lo.status === 200 && /gc_session_7741=; .*Max-Age=0/.test(lo.set.join('\n')) && await st('GET', '/api/info', { ...PX, ...cookie(cP) }) === 200, 'đăng xuất (cookie của Host khác) chỉ xoá phiên của chính request đó');
  const lo2 = await req(7741, 'POST', '/api/auth/logout', { headers: { ...PX, ...W, ...cookie(cP) } });
  ok(lo2.status === 200 && await st('GET', '/api/info', { ...PX, ...cookie(cP) }) === 401, 'đăng xuất: phiên đó 401 ngay');
  const list = (await req(7741, 'GET', '/api/auth/sessions', { headers: { ...NG, ...SA } })).json;
  ok(list && list.sessions.some(x => x.current) && list.devices.length >= 1 && !JSON.stringify(list).includes(cA.gc_session_7741), 'GET /api/auth/sessions (S): liệt kê phiên + thiết bị, đánh dấu phiên hiện tại, không lộ giá trị cookie');
  const cB = jar((await req(7741, 'POST', '/api/auth/login', { headers: { ...NG, ...W }, body: { password: PW } })).set);
  ok(await st('POST', '/api/auth/password', { ...NG, ...W, ...SA }, { current: 'sai rồi sai rồi', password: PW2 }) === 401 && await st('GET', '/api/info', { ...NG, ...cookie(cB) }) === 200, 'đổi mật khẩu bằng phiên cần mật khẩu hiện tại: sai → 401, không đổi gì');
  const ch = await req(7741, 'POST', '/api/auth/password', { headers: { ...NG, ...W, ...SA }, body: { current: PW, password: PW2 } }); SECRETS.push(PW2);
  ok(ch.status === 200 && ch.json.revoked >= 2 && await st('GET', '/api/info', { ...NG, ...cookie(cB) }) === 401 && await st('GET', '/api/info', { ...NG, ...cookie(jar(ch.set)) }) === 200, 'đổi mật khẩu: thu hồi MỌI phiên cũ (' + (ch.json && ch.json.revoked) + '); trình duyệt vừa đổi nhận phiên mới');
  ok(await st('POST', '/api/auth/login', { ...NG, ...W }, { password: PW }) === 401 && await st('POST', '/api/auth/login', { ...NG, ...W }, { password: PW2 }) === 200, 'mật khẩu cũ hết tác dụng, mật khẩu mới đăng nhập được');
  const tr = await req(7741, 'POST', '/api/auth/password', { headers: { ...NG, ...W, ...bearer(TA) }, body: { password: PW } });
  ok(tr.status === 200 && await st('GET', '/api/info', { ...NG, ...cookie(jar(ch.set)) }) === 401, 'T (genchibi password, quên mật khẩu) đặt lại không cần mật khẩu cũ, thu hồi mọi phiên');
}

/* ================================================================== 2) mã setup qua HTTP */
console.log('2) mã setup qua HTTP: trần riêng xét trước khi kiểm · sai định dạng không đếm · T đặt không cần mã');
{
  const S2 = await ready(boot(7742, { GC_CLIENT_IP_HEADER: 'x-forwarded-for' })), code = codeOf(S2.home), T2 = fs.readFileSync(path.join(S2.home, 'data/owner-token'), 'utf8').trim(); SECRETS.push(code, T2);
  const try1 = (ip, c, pw) => req(7742, 'POST', '/api/auth/setup', { headers: { ...P(ip), ...W }, body: { code: c, password: pw || PW } });
  const fmt = []; for (let i = 0; i < 15; i++) fmt.push((await try1('198.51.100.20', 'sai-dinh-dang')).status);
  const bad = []; for (let i = 0; i < 12; i++) bad.push((await try1('198.51.100.21', 'ZZZZZ-ZZZZ' + (i % 10))).status);
  ok(fmt.every(x => x === 400) && bad.slice(0, 10).every(x => x === 401) && bad.slice(10).every(x => x === 429), 'trần mã setup theo IP: 10 lần sai → 401, lần 11+ → 429; 15 lần sai ĐỊNH DẠNG → 400 và không bị đếm [' + bad + ']');
  const hit = await try1('198.51.100.21', code), p = await req(7742, 'GET', '/api/auth/state');
  ok(hit.status === 429 && Number(hit.headers['retry-after']) > 0 && p.json.password === false, 'mã ĐÚNG từ IP đã chạm trần → vẫn 429 + Retry-After, mật khẩu chưa được đặt (xét trần TRƯỚC khi kiểm — CNS-166)');
  ok((await try1('198.51.100.20', code, 'ngắn')).status === 400 && (await req(7742, 'GET', '/api/auth/state')).json.password === false, 'mật khẩu < 12 ký tự → 400, không tiêu mã');
  const okr = await try1('198.51.100.22', code);
  ok(okr.status === 200 && (await req(7742, 'GET', '/api/auth/state')).json.password === true, 'IP khác, mã đúng → 200 (kẻ lạ chạm trần không khoá được người có mã)');
  const S3 = await ready(boot(7743, {})), T3 = fs.readFileSync(path.join(S3.home, 'data/owner-token'), 'utf8').trim(); SECRETS.push(T3);
  const rc = await req(7743, 'POST', '/api/auth/setup-code', { headers: { ...W, ...bearer(T3) } }), noT = await req(7743, 'POST', '/api/auth/setup-code', { headers: W });
  ok(rc.status === 200 && rc.json.expiresAt && !rc.text.includes(codeOf(S3.home)) && noT.status === 401, 'CLI xin mã mới: POST /api/auth/setup-code chỉ với T (không T → 401); trả hạn, KHÔNG trả mã (CLI đọc tệp)');
  const viaT = await req(7743, 'POST', '/api/auth/setup', { headers: { ...W, ...bearer(T3) }, body: { password: PW } });
  ok(viaT.status === 200 && jar(viaT.set).gc_session_7743 && !fs.existsSync(path.join(S3.home, 'data/setup-code.txt')), 'T đặt mật khẩu đầu không cần mã (máy kế thừa / CLI); mã setup bị xoá');
  await stop(S2); await stop(S3);
}

/* ================================================================== 3) L-66: 10.000 lần đoán */
console.log('3) trần kiểu L-66: 10.000 lần đoán từ 500 IP (proxy riêng KHAI TƯỜNG MINH GC_CLIENT_IP_HEADER=x-forwarded-for) — trần xét TRƯỚC khi chạy scrypt; trần theo tài khoản');
{
  const hB = tmp('B'); seedPassword(hB, PW);
  const B = await ready(boot(7744, { GC_AUTH_RATE: '1000', GC_CLIENT_IP_HEADER: 'x-forwarded-for' }, hB));   // GC_AUTH_RATE: chỉ nâng ngưỡng LÀM CHẬM (không đổi trần IP / tài khoản) để đợt đoán chạy nhanh
  const login = (h, pw) => req(7744, 'POST', '/api/auth/login', { headers: { ...W, ...h }, body: { password: pw } });
  const own = await login(P('203.0.113.250'), PW), D = { gc_device_7744: jar(own.set).gc_device_7744 };   // chủ đăng nhập trước đợt đoán → giữ cookie thiết bị (bỏ phiên)
  ok(own.status === 200 && D.gc_device_7744, 'chủ đăng nhập một lần trước đợt đoán, giữ cookie thiết bị (D)');
  const par = await Promise.all(Array.from({ length: 30 }, (x, i) => login(P('198.51.102.1'), 'song song ' + i + ' sai'))).then(rs => rs.map(r => r.status));
  ok(par.filter(c => c === 401).length === 10 && par.filter(c => c === 429).length === 20, '30 lần đoán GỬI SONG SONG từ một IP → đúng 10 lần được kiểm, 20 lần 429 (lần đang kiểm cũng chiếm chỗ trong trần)');
  const guesses = []; for (let i = 0; i < 10000; i++) guesses.push(i);
  const t0 = Date.now();
  const codes = await pool(64, guesses, i => login(P('198.51.' + (100 + (i % 500 >> 8)) + '.' + (i % 500 & 255)), 'doan-' + i + '-sai-roi').then(r => r.status));
  const n401 = codes.filter(c => c === 401).length, n429 = codes.filter(c => c === 429).length;
  ok(n401 === 90 && n429 === 9910, '10.000 lần đoán / 500 IP: trần THEO TÀI KHOẢN (100 lần sai mọi IP) → chỉ 90 lần nữa được kiểm, 9.910 lần 429 trước khi kiểm — đổi IP không lách được (' + n401 + ' × 401, ' + Math.round((Date.now() - t0) / 1000) + ' s)');
  const hit = await login(P('198.51.100.7'), PW), fresh = await login(P('203.0.113.99'), PW);
  ok(hit.status === 429 && !hit.set.length && fresh.status === 429 && Number(fresh.headers['retry-after']) > 0, 'lần TRÚNG mật khẩu khi đã chặn — từ IP đã chạm trần lẫn từ IP MỚI → vẫn 429 + Retry-After, không cấp phiên (CNS-166)');
  const t1 = Date.now(), codes2 = await pool(64, guesses.slice(0, 1000), i => login(P('198.51.' + (100 + (i % 500 >> 8)) + '.' + (i % 500 & 255)), 'lan-hai-' + i).then(r => r.status));
  ok(codes2.every(c => c === 429), 'đợt thứ hai 1.000 lần → toàn 429, không chạy scrypt (' + (Date.now() - t1) + ' ms)');
  const withD = await login({ ...P('198.51.100.7'), ...cookie(D) }, PW);
  ok(withD.status === 200 && jar(withD.set).gc_session_7744, 'chủ có cookie thiết bị (có TRƯỚC đợt đoán), cùng IP đã bị khoá, tài khoản đang bị chặn → 200 (kẻ lạ không khoá được chủ — L-66)');
  const TB = fs.readFileSync(path.join(hB, 'data/owner-token'), 'utf8').trim();
  ok((await login({ ...P('198.51.100.8'), ...bearer(TB) }, PW)).status === 200, 'token chủ (T) cũng không bị trần');
  const stB = (await req(7744, 'GET', '/api/auth/state')).json;
  ok(stB.locked > 0 && stB.locked <= 900 && fresh.json.locked === true && /token/.test(fresh.json.error) && /phút|minutes/.test(fresh.json.error), 'đang chặn: /api/auth/state.locked (≤ 15 phút) + câu lỗi "đang bị chặn tạm — dùng token hoặc chờ N phút" (Studio hiện kèm lối "Dùng token")');
  const alerts = (await req(7744, 'GET', '/api/info', { headers: bearer(TB) })).json.auth.alerts;
  ok(alerts.length === 1 && alerts[0].failures === 100 && alerts[0].ips >= 90 && alerts[0].at && alerts[0].until && /temporarily blocked/.test(B.out), 'báo chủ: sự kiện chặn (số lần sai, số địa chỉ, lúc chặn / tới khi) trong /api/info.auth.alerts + log server');
  const ack = await req(7744, 'POST', '/api/auth/alerts/ack', { headers: { ...W, ...bearer(TB) } });
  ok(ack.status === 200 && (await req(7744, 'GET', '/api/info', { headers: bearer(TB) })).json.auth.alerts.length === 0 && (await req(7744, 'POST', '/api/auth/alerts/ack', { headers: W })).status === 401, 'chủ bấm "Đã xem" (S / T) → cảnh báo không hiện lại; không bằng chứng → 401');
  const dc = []; for (let i = 0; i < 11; i++) dc.push((await login({ ...P('203.0.113.252'), ...cookie(D) }, 'chu go sai ' + i + ' lan')).status);
  const dHit = await login({ ...P('203.0.113.252'), ...cookie(D) }, PW);
  ok(dc.slice(0, 10).every(c => c === 401) && dc[10] === 429 && dHit.status === 429, 'cookie thiết bị có trần sai RIÊNG: 10 lần sai → lần 11 và cả lần đúng → 429 cho thiết bị đó [' + dc + ']');
  ok(B.c.exitCode === null && (await req(7744, 'GET', '/api/health')).status === 200, 'server vẫn sống, /api/health trả lời sau 11.000 lần đoán');
  await stop(B);
}
console.log('3b) cấu hình mặc định (không khai header IP): XFF / Cf-Connecting-Ip do client gửi KHÔNG được tin — đổi mỗi lần không né được trần');
{
  const hS = tmp('Sp'); seedPassword(hS, PW);
  const Sp = await ready(boot(7744, {}, hS));
  const login = (h, pw) => req(7744, 'POST', '/api/auth/login', { headers: { ...W, ...h }, body: { password: pw } });
  const D = { gc_device_7744: jar((await login({}, PW)).set).gc_device_7744 };
  const codes = await pool(16, Array.from({ length: 1000 }, (x, i) => i), i => login({ 'x-forwarded-for': '10.' + (i >> 8) + '.' + (i & 255) + '.9', 'cf-connecting-ip': '172.16.' + (i >> 8) + '.' + (i & 255), 'x-real-ip': '192.168.0.' + (i & 255) }, 'gia-ip-' + i).then(r => r.status));
  ok(codes.filter(c => c === 401).length === 10 && codes.filter(c => c === 429).length === 990, '1.000 lần đoán, mỗi lần một X-Forwarded-For / Cf-Connecting-Ip / X-Real-IP khác qua cổng chính → chỉ 10 lần được kiểm (cùng peer), 990 × 429');
  const hit = await login({ 'x-forwarded-for': '203.0.113.1' }, PW);
  ok(hit.status === 429 && !hit.set.length, 'lần TRÚNG mật khẩu (kèm XFF "mới") khi đã chặn → vẫn 429');
  ok((await login({ 'x-forwarded-for': '203.0.113.2', ...cookie(D) }, PW)).status === 200, 'chủ có cookie thiết bị → 200');
  await stop(Sp);
}

/* ================================================================== 4) trần toàn cục chỉ làm chậm */
console.log('4) trần toàn cục chỉ LÀM CHẬM kẻ lạ, không khoá; chủ có cookie thiết bị không bị chậm');
{
  const hC = tmp('C'); seedPassword(hC, PW);
  const C = await ready(boot(7745, { GC_CLIENT_IP_HEADER: 'x-forwarded-for' }, hC));
  const login = (h, pw) => req(7745, 'POST', '/api/auth/login', { headers: { ...W, ...h }, body: { password: pw } });
  const D = { gc_device_7745: jar((await login(P('203.0.113.200'), PW)).set).gc_device_7745 };
  const st = []; for (let i = 0; i < 55; i++) st.push((await login(P('192.0.2.' + (i + 1)), 'sai ' + i + ' rồi nhé bạn')).status);
  ok(st.every(c => c === 401), '55 lần sai từ 55 IP khác nhau → đều 401 (không IP nào chạm trần riêng, trần toàn cục không từ chối)');
  const t0 = Date.now(), late = await login(P('192.0.2.200'), PW), dt = Date.now() - t0;
  ok(late.status === 200 && dt >= 1000, 'kẻ lạ (IP mới) đúng mật khẩu sau đợt lũ → vẫn 200 nhưng bị làm chậm ' + dt + ' ms (≥ 1 s) — "chỉ làm chậm", không khoá');
  const times = []; for (let i = 0; i < 3; i++) { const t1 = Date.now(); const r = await login({ ...P('192.0.2.201'), ...cookie(D) }, PW); times.push(r.status === 200 ? Date.now() - t1 : 1e9); }
  ok(Math.min(...times) < 1000, 'chủ có cookie thiết bị: 200, không bị làm chậm (nhanh nhất ' + Math.min(...times) + ' ms trong 3 lần — L-74)');
  await stop(C);
}

/* ================================================================== 6) máy kế thừa */
console.log('6) máy kế thừa kiểu máy Ryan: .env GC_PUBLIC_URL + GC_ALLOWED_HOSTS + GC_API_TOKEN + GC_MCP_KEY, request qua Caddy riêng (XFF)');
{
  const TD = 'ryan-token-' + crypto.randomBytes(16).toString('hex'), KD = 'linkkey_' + crypto.randomBytes(12).toString('hex'); SECRETS.push(TD);
  const ENVD = { GC_PUBLIC_URL: 'https://' + HOST, GC_ALLOWED_HOSTS: HOST, GC_API_TOKEN: TD, GC_MCP_KEY: KD };
  const homeD = tmp('D'); fs.mkdirSync(path.join(homeD, 'data/works'), { recursive: true }); fs.writeFileSync(path.join(homeD, 'data/settings.json'), '{"autoUpdate":true}'); fs.writeFileSync(path.join(homeD, 'data/works/cu.json'), '{"id":"cu","title":"Phim cũ","shots":[]}');
  let D = await ready(boot(7746, ENVD, homeD));
  const CADDY = { host: HOST, 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https', 'x-forwarded-host': HOST };
  const info = await req(7746, 'GET', '/api/info', { headers: { ...CADDY, ...bearer(TD) } });
  ok(info.status === 200 && info.json.auth.legacy === true && info.json.auth.password === false && info.json.auth.tokenSource === 'env', 'token vẫn vào Studio như v0.20 (qua XFF, Host tên miền): /api/info 200, auth.legacy = true, chưa có mật khẩu');
  ok((await req(7746, 'GET', '/api/info', { headers: CADDY })).status === 401 && (await req(7746, 'GET', '/api/auth/state', { headers: CADDY })).json.legacy === true, 'không token → 401; /api/auth/state báo legacy (Studio mở màn token như v0.20 + dải Đặt mật khẩu)');
  const lj = JSON.parse(fs.readFileSync(path.join(homeD, 'data/legacy.json'), 'utf8'));
  ok(lj.envPublicUrl === 'https://' + HOST && lj.envAllowedHosts === HOST && lj.at && lj.tokenless === false && mode(path.join(homeD, 'data/legacy.json')) === '600', 'data/legacy.json ghi ở lần khởi động đầu: { envPublicUrl, envAllowedHosts, at } (+ tokenless = false vì đã có token)');
  ok((await mcpInit(7746, { ...CADDY }, '/mcp/' + KD)).status === 200 && (await mcpInit(7746, { ...CADDY, ...bearer(TD) })).status === 200, 'agent cũ: link có khoá + Bearer token vẫn chạy qua XFF');
  const su = await req(7746, 'POST', '/api/auth/setup', { headers: { ...CADDY, ...W, ...bearer(TD) }, body: { password: PW } });
  ok(su.status === 200 && su.set.every(c => / Secure$/.test(c)) && jar(su.set).gc_session, 'token chứng minh chủ để đặt mật khẩu đầu (qua proxy https → cookie Secure, tên gốc)');
  ok((await req(7746, 'GET', '/api/info', { headers: { ...CADDY, ...cookie(jar(su.set)) } })).status === 200 && (await req(7746, 'GET', '/api/info', { headers: { ...CADDY, ...bearer(TD) } })).status === 200, 'sau đó: phiên cookie và token đều vào được (không ép bỏ token)');
  await stop(D);
  D = await ready(boot(7746, {}, homeD));
  ok((await req(7746, 'GET', '/api/auth/state')).json.legacy === true && JSON.parse(fs.readFileSync(path.join(homeD, 'data/legacy.json'), 'utf8')).at === lj.at, 'khởi động lại không còn biến .env → vẫn là máy kế thừa (đọc dấu, không đọc .env hiện hành); dấu không ghi lại');
  await stop(D);
  const homeN = tmp('N'); let Nn = await ready(boot(7746, {}, homeN)); await stop(Nn);
  Nn = await ready(boot(7746, { ...ENVD, GC_API_TOKEN: 'x'.repeat(40) }, homeN));
  ok((await req(7746, 'GET', '/api/auth/state', { headers: { host: HOST } })).json.legacy === false, 'bản cài v0.21 thêm GC_PUBLIC_URL vào .env SAU lần chạy đầu → KHÔNG thành máy kế thừa (CNS-199b)');
  await stop(Nn);
}

/* ================================================================== 7) nâng cấp v0.20 không token */
console.log('7) nâng cấp v0.20 không token → v0.21: owner-token tự sinh · genchibi mcp (stdio) vẫn chạy · agent cũ nhận 401 có hướng dẫn · Studio dẫn tới /setup');
{
  const homeE = tmp('E'); fs.mkdirSync(path.join(homeE, 'data/works'), { recursive: true });
  fs.writeFileSync(path.join(homeE, 'data/settings.json'), '{"autoUpdate":true,"checkHours":6}'); fs.writeFileSync(path.join(homeE, 'data/works/cu.json'), '{"id":"cu","title":"Phim cũ","shots":[]}');
  let E = await ready(boot(7747, {}, homeE));
  const tf = path.join(homeE, 'data/owner-token'), TE = fs.readFileSync(tf, 'utf8').trim(); SECRETS.push(TE);
  ok(/^[0-9a-f]{64}$/.test(TE) && mode(tf) === '600' && !E.out.includes(TE), 'data/owner-token tự sinh lúc khởi động (256 bit, 0600), không in ra log');
  ok(/agents that connected without a token must reconnect - run `genchibi agent connect`/.test(E.out), 'lần khởi động đầu của v0.21 ghi log (tiếng Anh): agent nối không token cần nối lại — genchibi agent connect');
  const nm = await mcpInit(7747, {});
  ok(nm.status === 401 && /genchibi agent connect/.test(nm.json.hint || '') && /genchibi mcp/.test(nm.json.hint || '') && !nm.headers['www-authenticate'], 'agent cũ (HTTP, không header) → 401 kèm hướng dẫn (genchibi agent connect / genchibi mcp)');
  const inf = (await req(7747, 'GET', '/api/info', { headers: bearer(TE) })).json;
  ok(inf.auth.agentsReconnect === true && inf.auth.tokenSource === 'file' && inf.auth.legacy === false, '/api/info.auth: agentsReconnect = true (dải "Agent cũ cần nối lại"), token từ tệp');
  const sj = (await req(7747, 'GET', '/api/auth/state')).json;
  ok(sj.password === false && sj.setup === true && fs.existsSync(path.join(homeE, 'data/setup-code.txt')) && (await req(7747, 'GET', '/setup')).status === 200, 'Studio dẫn tới /setup: chưa có mật khẩu, mã setup sẵn cho genchibi open / status');
  const stdio = (home) => new Promise(done => {
    const c = spawn(process.execPath, [path.join(ROOT, 'server/mcp-stdio.js')], { env: { ...baseEnv(), GC_HOME: home, GC_PORT: '7747' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', d => { out += d; }); c.on('exit', () => done(out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return { raw: l }; } })));
    c.stdin.end(['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"ci","version":"1"}}}', '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'].join('\n') + '\n');
  });
  const so = await stdio(homeE), sx = await stdio(tmp('E2'));
  ok(so.length === 2 && so[0].result && so[0].result.protocolVersion === '2025-06-18' && so[1].result && so[1].result.tools.length >= 50, 'genchibi mcp (stdio, env không token) đọc data/owner-token → bắt tay + tools/list chạy (CNS-197)');
  ok(!sx.some(x => x.result), '…đối chứng: cầu stdio trỏ thư mục cài khác (không có owner-token) → không được phục vụ');
  await stop(E);
  E = await ready(boot(7747, {}, homeE));
  ok(fs.readFileSync(tf, 'utf8').trim() === TE && JSON.parse(fs.readFileSync(path.join(homeE, 'data/legacy.json'), 'utf8')).tokenless === true, 'khởi động lại: owner-token giữ nguyên; dấu tokenless giữ (ghi một lần)');
  await stop(E);
}

/* ================================================================== 8) online.json lúc chạy + bí mật */
console.log('8) data/online.json đọc lúc chạy (không khởi động lại) · bí mật không vào log · tệp 0600');
{
  const TF = 'tok-f-' + crypto.randomBytes(12).toString('hex'); SECRETS.push(TF);
  const F = await ready(boot(7748, { GC_API_TOKEN: TF })), of = path.join(F.home, 'data/online.json');
  const H2 = 'chibi2.example.test', H3 = 'chibi3.example.test';
  const prm = h => req(7748, 'GET', '/.well-known/oauth-protected-resource', { headers: { host: h } });
  ok((await prm(H2)).status === 403 && (await prm('127.0.0.1:7748')).status === 404, 'trước: Host chibi2 bị chặn (403), OAuth tắt (404)');
  fs.writeFileSync(of, JSON.stringify({ v: 1, adopted: true, mode: 'tunnel', publicUrl: 'https://' + H2 }));
  let r = await prm(H2), m = await mcpInit(7748, { host: H2 });
  ok(r.status === 200 && r.json.resource === 'https://' + H2 + '/mcp' && m.status === 401 && (m.headers['www-authenticate'] || '').includes(H2), 'ghi online.json (publicUrl) → KHÔNG khởi động lại: Host chibi2 được phép, OAuth bật với resource mới, /mcp 401 trỏ metadata mới');
  fs.writeFileSync(of, JSON.stringify({ v: 1, adopted: true, mode: 'tunnel', publicUrl: 'https://' + H2, publicUrlPending: 'https://' + H3 }));
  r = await prm(H3);
  ok(r.status === 200 && r.json.resource === 'https://' + H3 + '/mcp' && (await prm(H2)).status === 200, 'publicUrlPending (bật tạm) → OAuth phục vụ theo url tạm, Host của bản chính thức vẫn được phép');
  fs.writeFileSync(of, JSON.stringify({ v: 1, adopted: true, mode: 'off', publicUrl: '' }));
  ok((await prm(H2)).status === 403 && (await prm('127.0.0.1:7748')).status === 404, 'về off → Host chibi2 bị chặn lại, OAuth tắt');
  await stop(F);
  // bí mật: không tệp log nào của các server chứa token / mật khẩu / mã setup
  const logs = kids.map(k => k.out).join('\n');
  const leak = SECRETS.filter(s => s && logs.includes(s));
  ok(!leak.length && /\[auth\] no owner password yet/.test(logs) && /\[auth\] owner password set/.test(logs), 'log server: có dòng [auth] (tiếng Anh) nhưng KHÔNG có token / mật khẩu / mã setup nào (' + SECRETS.length + ' bí mật đã kiểm)');
  const perms = ['owner-token', 'auth.json', 'legacy.json'].map(f => mode(path.join(homeA, 'data', f)));
  ok(perms.every(x => x === '600'), 'tệp bí mật của bản cài 0600: owner-token · auth.json · legacy.json [' + perms + ']');
}
await stop(A);

/* ================================================================== 9) CLI */
console.log('9) CLI: genchibi status / open (mã setup) · password (app chạy → API, app dừng → ghi thẳng) · agent connect · mcp — token / mật khẩu không vào argv');
{
  const HD = tmp('cli'); fs.symlinkSync(ROOT, path.join(HD, 'current')); fs.writeFileSync(path.join(HD, '.env'), 'GC_MODE=native\nGC_PORT=7749\nGC_LANG=en\n');   // bản cài v0.20 nâng cấp: .env KHÔNG có GC_API_TOKEN
  const FB = tmp('bin'), LOG = path.join(FB, 'argv.log'), OPENED = path.join(FB, 'opened.txt'), realCurl = execFileSync('bash', ['-c', 'command -v curl'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(FB, 'curl'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> ' + JSON.stringify(LOG) + '\nexec ' + JSON.stringify(realCurl) + ' "$@"\n', { mode: 0o755 });
  for (const o of ['open', 'xdg-open']) fs.writeFileSync(path.join(FB, o), '#!/usr/bin/env bash\nprintf "%s\\n" "$1" >> ' + JSON.stringify(OPENED) + '\n', { mode: 0o755 });
  const cli = (args, input) => { const r = spawnSync('bash', [path.join(ROOT, 'cli/genchibi')].concat(args), { env: { ...baseEnv(), GC_HOME: HD, GC_CLI_INNER: '1', PATH: FB + ':' + process.env.PATH }, input: input || '', encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  let S = await ready(boot(7749, {}, HD));
  const TC = fs.readFileSync(path.join(HD, 'data/owner-token'), 'utf8').trim(); SECRETS.push(TC);
  let code = codeOf(HD), st = cli(['status']);
  ok(st.code === 0 && st.out.includes('Setup code: ' + code + ' (set the owner password'), 'genchibi status in "Setup code: XXXXX-XXXXX (set the owner password …)" khi chưa có mật khẩu');
  fs.writeFileSync(path.join(HD, 'data/setup-code.txt'), code + '\nexpires=' + (Math.floor(Date.now() / 1000) + 60) + '\n');   // còn < 5 phút
  const op = cli(['open']), url = (fs.readFileSync(OPENED, 'utf8').trim().split('\n').pop() || ''), code2 = codeOf(HD);
  ok(op.code === 0 && /No owner password yet/.test(op.out) && url === 'http://localhost:7749/setup#code=' + code2 && code2 !== code, 'genchibi open: mã sắp hết hạn → xin mã mới qua API (token chủ) rồi mở http://localhost:<cổng>/setup#code=<mã mới> (mã ở fragment)');
  SECRETS.push(code2);
  ok(cli(['password'], 'ngan qua\n').code === 1 && (await req(7749, 'GET', '/api/auth/state')).json.password === false, 'genchibi password: < 12 ký tự → từ chối, không đổi gì');
  const pw = cli(['password'], 'mat khau "kho" \\ dai hon 12\n');
  const lg = await req(7749, 'POST', '/api/auth/login', { headers: W, body: { password: 'mat khau "kho" \\ dai hon 12' } });
  ok(pw.code === 0 && /Owner password set/.test(pw.out) && lg.status === 200, 'genchibi password (app đang chạy → API bằng token chủ, mật khẩu có " và \\ qua stdin của curl) → đăng nhập được bằng mật khẩu đó');
  ok(!cli(['status']).out.includes('Setup code') && !fs.existsSync(path.join(HD, 'data/setup-code.txt')), 'có mật khẩu: status không còn in mã setup');
  const op2 = cli(['open']); ok(fs.readFileSync(OPENED, 'utf8').trim().split('\n').pop() === 'http://localhost:7749', 'có mật khẩu: genchibi open mở trang chính (không mã)');
  const ac = cli(['agent', 'connect']);
  ok(ac.code === 0 && ac.out.includes('<token — see ' + HD + '/data/owner-token>') && !ac.out.includes(TC), 'agent connect: chỉ chỗ đọc token (data/owner-token khi .env trống), KHÔNG in token');
  const mc = spawnSync('bash', [path.join(ROOT, 'cli/genchibi'), 'mcp'], { env: { ...baseEnv(), GC_HOME: HD, GC_CLI_INNER: '1', PATH: FB + ':' + process.env.PATH }, input: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"ci","version":"1"}}}\n', encoding: 'utf8' });
  ok(/"protocolVersion":"2025-06-18"/.test(mc.stdout || ''), 'genchibi mcp (native, .env không token) → cầu stdio đọc data/owner-token, bắt tay được');
  await stop(S);
  const pw2 = cli(['password'], 'mat khau moi khi app dung\n');
  ok(pw2.code === 0 && /applies at the next start/.test(pw2.out), 'genchibi password khi app dừng → ghi thẳng data/auth.json (server/auth-cli.js)');
  S = await ready(boot(7749, {}, HD));
  const l1 = await req(7749, 'POST', '/api/auth/login', { headers: W, body: { password: 'mat khau moi khi app dung' } }), l0 = await req(7749, 'POST', '/api/auth/login', { headers: W, body: { password: 'mat khau "kho" \\ dai hon 12' } });
  ok(l1.status === 200 && l0.status === 401 && (await req(7749, 'GET', '/api/info', { headers: cookie(jar(lg.set)) })).status === 401, '…chạy lại: mật khẩu mới vào được, mật khẩu cũ 401, phiên cũ bị thu hồi');
  const argv = fs.readFileSync(LOG, 'utf8');
  ok(argv.length && !argv.includes(TC) && !argv.includes('dai hon 12') && !argv.includes(code2), 'token / mật khẩu / mã setup không nằm trong argv của curl (' + argv.trim().split('\n').length + ' lần gọi)');
  await stop(S);
}
console.log('   Kết quả đăng nhập chủ / bảng truy cập: ' + passn + ' đạt, ' + failn + ' trượt');
process.exit(failn ? 1 : 0);
