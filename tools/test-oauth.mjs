// Kiểm OAuth 2.1 cho MCP từ xa (v0.19): đóng vai claude.ai / Claude Code bằng fetch, server tạm thật, không ra mạng ngoài.
//  1) khám phá: 401 + WWW-Authenticate · 2 đường PRM · AS metadata (không cờ CIMD) · DCR (không secret, allowlist callback, trần, tốc độ)
//  2) authorize: chỉ chủ duyệt được · lỗi không redirect khi redirect_uri lệch · PKCE / resource / state / iss
//  3) token (form + JSON): PKCE sai · code dùng lại · refresh xoay vòng + dùng lại = thu hồi chuỗi · hết hạn · revoke · thu hồi trong Cài đặt
//  4) phạm vi → kênh sẵn có: read / write / owner · token chủ máy + link có khoá vẫn chạy · oauth.json chỉ băm · log không lộ token
//  5) đường máy đi qua "cổng đăng nhập ngoài" giả (Caddy + login): không cần cookie / phiên Studio, authorize vẫn đòi token chủ máy trong app
//  6) đồng hồ giả (không chờ thật): code 60 s · client chưa cấp phép 24 giờ · refresh trượt 30 ngày · trần 50 client
// © 2026 Gen Labs — All rights reserved.
import http from 'http';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { TOOLS } = require('../server/mcp');
const { OAuth } = require('../server/oauth');
const H = 'https://chibi.example.test', OWNER = 'owner-token-' + crypto.randomBytes(8).toString('hex'), KEY = 'linkkey_' + crypto.randomBytes(12).toString('hex');
const P = { main: 7611, off: 7612, open: 7613, ttl: 7614, proxy: 7615 };
let failn = 0, passn = 0;
const ok = (c, m) => { if (c) { passn++; console.log('   ✓', m); } else { failn++; console.log('   ✗', m); } };
const b64 = b => Buffer.from(b).toString('base64url');
const sha256b64 = s => crypto.createHash('sha256').update(s).digest('base64url');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const kids = [];
process.on('exit', () => kids.forEach(c => { try { c.kill(); } catch (e) { /* đã tắt */ } }));
function spawnServer(port, env) {
  const home = mkdtempSync(path.join(tmpdir(), 'gc-oauth-'));
  const c = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: String(port), GC_NO_AUTOCHECK: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(c);
  let log = ''; c.stdout.on('data', d => { log += d; }); c.stderr.on('data', d => { log += d; });
  return { home, c, log: () => log, base: 'http://127.0.0.1:' + port };
}
async function ready(s) { for (let i = 0; i < 60; i++) { try { const r = await fetch(s.base + '/api/health'); if (r.ok) return; } catch (e) { /* chưa lên */ } await sleep(200); } throw new Error('server không lên: ' + s.base + '\n' + s.log()); }

// ---------------------------------------------------------------- máy khách giả
const jh = { 'Content-Type': 'application/json' };
const own = { Authorization: 'Bearer ' + OWNER, 'X-GC-Request': '1', 'Content-Type': 'application/json' };
const rpc = (base, method, params, headers, id) => fetch(base + '/mcp', { method: 'POST', headers: { ...jh, Accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(id === null ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: id || 1, method, params }) });
const call = async (base, tok, name, args) => { const r = await rpc(base, 'tools/call', { name, arguments: args || {} }, { Authorization: 'Bearer ' + tok }); const j = await r.json(); return j.result || j; };
const forbidden = r => r && r.isError === true && /^\[FORBIDDEN\]/.test(r.content[0].text);
// mỗi lời gọi một "IP" khác (cf-connecting-ip) để không dính giới hạn tốc độ theo IP — trừ máy chủ không token (header proxy ở đó = bị chặn) và ca thử giới hạn (tự đặt IP)
let ipn = 0; const noise = base => (base === open.base ? {} : { 'cf-connecting-ip': '10.' + ((++ipn >> 8) & 255) + '.' + (ipn & 255) + '.1' });
const form = (base, p, o, headers) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...noise(base), ...headers }, body: new URLSearchParams(o).toString() });
const dcr = (base, body, headers) => fetch(base + '/oauth/register', { method: 'POST', headers: { ...jh, ...noise(base), ...headers }, body: JSON.stringify(body) });
const CB = 'https://claude.ai/api/mcp/auth_callback';
const pkce = () => { const verifier = b64(crypto.randomBytes(32)); return { verifier, challenge: sha256b64(verifier) }; };
const authQ = (cl, o) => new URLSearchParams({ response_type: 'code', client_id: cl.client_id, redirect_uri: CB, code_challenge_method: 'S256', state: 'st-' + crypto.randomBytes(4).toString('hex'), ...o });
const reqId = html => JSON.parse(/<script type="application\/json" id="gc-data">([\s\S]*?)<\/script>/.exec(html)[1]).request;
// chạy trọn: register → authorize (trang) → approve (chủ) → mã. Trả { client, pk, code, state, redirect }
async function grantCode(base, o) {
  o = o || {};
  const cl = o.client || await (await dcr(base, { client_name: 'Claude', redirect_uris: [o.redirect_uri || CB] })).json();
  const pk = pkce(), state = 'st-' + crypto.randomBytes(4).toString('hex');
  const q = authQ(cl, { redirect_uri: o.redirect_uri || CB, code_challenge: pk.challenge, state, ...(o.query || {}) });
  const pg = await fetch(base + '/oauth/authorize?' + q, { redirect: 'manual', headers: noise(base) });
  if (pg.status !== 200) return { client: cl, pk, state, page: pg };
  const id = reqId(await pg.text());
  const ap = await fetch(base + '/api/oauth/approve', { method: 'POST', headers: o.headers || own, body: JSON.stringify({ request: id, decision: o.decision || 'approve', scope: o.scope || 'mcp:write' }) });
  const aj = await ap.json();
  const u = aj.redirect ? new URL(aj.redirect) : null;
  return { client: cl, pk, state, id, uri: o.redirect_uri || CB, approve: ap, redirect: u, code: u && u.searchParams.get('code') };
}
const exchange = (base, g, extra) => form(base, '/oauth/token', { grant_type: 'authorization_code', code: g.code, redirect_uri: g.uri || CB, client_id: g.client.client_id, code_verifier: g.pk.verifier, resource: H + '/mcp', ...extra });
async function tokens(base, o) { const g = await grantCode(base, o); const r = await exchange(base, g); return { g, r, j: await r.json() }; }
const initWith = (base, tok, headers) => rpc(base, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } }, { Authorization: 'Bearer ' + tok, ...headers });

// ---------------------------------------------------------------- server tạm
const main = spawnServer(P.main, { GC_API_TOKEN: OWNER, GC_PUBLIC_URL: H, GC_MCP_KEY: KEY, GC_ALLOWED_HOSTS: 'chibi.example.test' });
const off = spawnServer(P.off, { GC_API_TOKEN: OWNER });                                   // không GC_PUBLIC_URL → OAuth tắt
const open = spawnServer(P.open, { GC_PUBLIC_URL: H });                                    // không GC_API_TOKEN → chỉ máy cục bộ
const ttl = spawnServer(P.ttl, { GC_API_TOKEN: OWNER, GC_PUBLIC_URL: H, GC_OAUTH_ACCESS_TTL: '2', GC_OAUTH_REDIRECTS: 'https://agent.example.org/cb' });   // access token sống 2 giây; callback thêm
let proxy = null;
try {
  await Promise.all([main, off, open, ttl].map(ready));
  const M = main.base;

  console.log('1) khám phá — 401 + WWW-Authenticate, metadata, đăng ký');
  const mcpBody = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } };
  const WWW = 'Bearer resource_metadata="' + H + '/.well-known/oauth-protected-resource/mcp"';
  let r = await fetch(M + '/mcp', { method: 'POST', headers: jh, body: JSON.stringify(mcpBody) });
  ok(r.status === 401 && r.headers.get('www-authenticate') === WWW, 'POST /mcp không token → 401 + WWW-Authenticate: ' + WWW);
  ok(!/scope=/.test(r.headers.get('www-authenticate') || ''), 'WWW-Authenticate không đặt scope (để chủ chọn mức lúc duyệt)');
  r = await fetch(M + '/mcp', { method: 'POST', headers: { ...jh, Authorization: 'Bearer sai-token' }, body: JSON.stringify(mcpBody) });
  ok(r.status === 401 && r.headers.get('www-authenticate') === WWW, 'token sai → 401 + cùng header');
  r = await fetch(M + '/.well-known/oauth-protected-resource/mcp'); let prm = await r.json();
  const r2 = await fetch(M + '/.well-known/oauth-protected-resource'); const prm2 = await r2.json();
  ok(r.status === 200 && prm.resource === H + '/mcp' && JSON.stringify(prm.authorization_servers) === JSON.stringify([H]) && JSON.stringify(prm.bearer_methods_supported) === '["header"]' && prm.scopes_supported.join(' ') === 'mcp:read mcp:write mcp:owner', 'PRM /.well-known/oauth-protected-resource/mcp: resource, authorization_servers, header, 3 phạm vi');
  ok(r2.status === 200 && JSON.stringify(prm2) === JSON.stringify(prm), 'PRM /.well-known/oauth-protected-resource (không hậu tố) cùng nội dung');
  r = await fetch(M + '/.well-known/oauth-authorization-server'); const as = await r.json();
  ok(r.status === 200 && as.issuer === H && as.authorization_endpoint === H + '/oauth/authorize' && as.token_endpoint === H + '/oauth/token' && as.registration_endpoint === H + '/oauth/register' && as.revocation_endpoint === H + '/oauth/revoke', 'AS metadata: issuer khớp từng byte + 4 endpoint');
  ok(JSON.stringify(as.response_types_supported) === '["code"]' && JSON.stringify(as.grant_types_supported) === '["authorization_code","refresh_token"]' && JSON.stringify(as.token_endpoint_auth_methods_supported) === '["none"]' && JSON.stringify(as.code_challenge_methods_supported) === '["S256"]' && as.authorization_response_iss_parameter_supported === true, 'AS metadata: code · 2 grant · auth "none" · S256 · iss được hỗ trợ');
  ok(!('client_id_metadata_document_supported' in as) && !JSON.stringify(as).includes('offline_access') && !JSON.stringify(as).includes('openid'), 'AS metadata KHÔNG có cờ CIMD, offline_access, openid');
  r = await fetch(M + '/.well-known/oauth-authorization-server', { method: 'POST' }); ok(r.status === 405, 'well-known chỉ nhận GET');

  // ---- DCR
  r = await dcr(M, { client_name: 'Claude', redirect_uris: [CB] }); let c1 = await r.json();
  ok(r.status === 201 && /^gcc_/.test(c1.client_id) && c1.redirect_uris[0] === CB && c1.client_name === 'Claude' && c1.token_endpoint_auth_method === 'none' && !('client_secret' in c1) && typeof c1.client_id_issued_at === 'number' && c1.grant_types.includes('authorization_code') && c1.response_types[0] === 'code', 'DCR 201: client_id, echo redirect_uris + tên, auth "none", KHÔNG client_secret');
  r = await dcr(M, { redirect_uris: ['https://claude.com/api/mcp/auth_callback'], token_endpoint_auth_method: 'client_secret_post', client_secret: 'x', logo_uri: 'https://x/y.png', tos_uri: 1, foo: { bar: 1 }, grant_types: ['authorization_code', 'implicit'], scope: 'mcp:read lạ' }); const c2 = await r.json();
  ok(r.status === 201 && c2.token_endpoint_auth_method === 'none' && !('client_secret' in c2) && c2.client_name === 'Agent không tên' && !('foo' in c2) && c2.grant_types.join() === 'authorization_code', 'DCR khoan dung: claude.com, thiếu tên, trường lạ bị bỏ qua, xin client_secret_post vẫn không cấp secret');
  r = await dcr(M, { client_name: 'CLI', redirect_uris: ['http://localhost:54321/callback', 'http://127.0.0.1:1/callback'] });
  ok(r.status === 201, 'DCR: loopback http://localhost:<port bất kỳ>/callback và http://127.0.0.1:<port>/callback được');
  for (const [uri, why] of [['https://evil.example/cb', 'https lạ'], ['http://evil.example/callback', 'http không loopback'], ['http://localhost:1/steal', 'loopback sai đường dẫn'], ['javascript:alert(1)', 'javascript:'], ['https://claude.ai/api/mcp/auth_callback#x', 'có fragment'], ['https://u:p@claude.ai/api/mcp/auth_callback', 'có user:pass'], ['https://claude.ai/api/mcp/auth_callback/', 'khác đuôi / (so tuyệt đối)']]) {
    r = await dcr(M, { client_name: 'x', redirect_uris: [uri] }); const j = await r.json();
    ok(r.status === 400 && j.error === 'invalid_redirect_uri', 'DCR từ chối redirect_uri ' + why + ' → 400 invalid_redirect_uri');
  }
  r = await dcr(M, { client_name: 'x' }); ok(r.status === 400 && (await r.json()).error === 'invalid_redirect_uri', 'DCR thiếu redirect_uris → 400');
  r = await dcr(M, { redirect_uris: [CB], grant_types: ['implicit'] }); ok(r.status === 400 && (await r.json()).error === 'invalid_client_metadata', 'DCR grant_types không có authorization_code → 400 invalid_client_metadata');
  r = await fetch(M + '/oauth/register', { method: 'POST', headers: { ...jh }, body: '{hỏng' }); ok(r.status === 400, 'DCR JSON hỏng → 400');
  r = await fetch(M + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }); ok(r.status === 415, 'DCR Content-Type lạ → 415');
  r = await dcr(M, { client_name: 'A'.repeat(500) + '‮<b>x</b>\n\t' + 'B', redirect_uris: [CB] }); const cn = await r.json();
  ok(cn.client_name.length <= 80 && !cn.client_name.includes('‮') && !/[\n\t]/.test(cn.client_name), 'DCR kẹp tên ≤ 80 ký tự, bỏ ký tự điều khiển / đảo chiều');
  r = await dcr(M, { client_name: 'x', redirect_uris: [CB, CB, CB, CB, CB, CB] }); ok(r.status === 400, 'DCR trần 5 redirect_uris');

  console.log('2) authorize — chỉ chủ duyệt được, lỗi an toàn');
  const pk = pkce(), st = 'giu-nguyen-state-123';
  const A = (o, cl) => fetch(M + '/oauth/authorize?' + authQ(cl || c1, { code_challenge: pk.challenge, state: st, ...o }), { redirect: 'manual', headers: noise(M) });
  r = await A({}); const page = await r.text();
  ok(r.status === 200 && /text\/html/.test(r.headers.get('content-type')) && page.includes('Cấp phép kết nối agent') && /nonce-/.test(r.headers.get('content-security-policy') || ''), 'GET /oauth/authorize → trang "Cấp phép kết nối agent" (HTML, có CSP nonce)');
  const rid = reqId(page);
  const aprBody = { request: rid, decision: 'approve', scope: 'mcp:write' };
  const apr = (headers, body) => fetch(M + '/api/oauth/approve', { method: 'POST', headers, body: JSON.stringify(body || aprBody) });
  r = await apr({ ...jh, 'X-GC-Request': '1' }); ok(r.status === 401, 'duyệt KHÔNG có token chủ máy → 401');
  r = await apr({ ...jh, 'X-GC-Request': '1', Authorization: 'Bearer sai' }); ok(r.status === 401, 'duyệt token chủ sai → 401');
  r = await apr({ ...jh, 'X-GC-Request': '1', Authorization: 'Bearer ' + OWNER, 'X-Forwarded-For': '1.2.3.4' }, { ...aprBody, request: 'khong-co' }); ok(r.status === 410, 'duyệt request id lạ → 410 (đã hết hạn / xử lý)');
  r = await apr({ ...jh, Authorization: 'Bearer ' + OWNER }); ok(r.status === 403, 'duyệt có token nhưng thiếu X-GC-Request → 403 (CSRF)');
  r = await apr({ ...own, Origin: 'https://evil.example' }); ok(r.status === 403, 'duyệt từ Origin lạ → 403 (originOK)');
  const tok0 = await fetch(M + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=authorization_code&client_id=' + c1.client_id + '&code=x&redirect_uri=' + encodeURIComponent(CB) + '&code_verifier=' + pk.verifier });
  ok(tok0.status === 400 && (await tok0.json()).error === 'invalid_grant', 'chưa duyệt thì không có mã để đổi (đoán mã → invalid_grant)');
  r = await apr(own, { ...aprBody, scope: 'mcp:root' }); ok(r.status === 400, 'duyệt với phạm vi lạ → 400 (request vẫn còn)');
  r = await apr(own, { ...aprBody, decision: 'maybe' }); ok(r.status === 400, 'decision lạ → 400');
  r = await apr(own); let aj = await r.json(); let ru = new URL(aj.redirect);
  ok(r.status === 200 && ru.origin + ru.pathname === CB && ru.searchParams.get('state') === st && ru.searchParams.get('iss') === H && ru.searchParams.get('code').length >= 40, 'chủ duyệt → redirect_uri?code=…&state=<nguyên>&iss=' + H);
  r = await apr(own); ok(r.status === 410, 'request chỉ duyệt được MỘT lần');

  // redirect_uri lệch / client lạ → trang lỗi, KHÔNG redirect
  for (const [uri, why] of [['https://evil.example/cb', 'domain lạ'], [CB + '/', 'khác đuôi /'], [CB + '?x=1', 'thêm query'], ['https://claude.com/api/mcp/auth_callback', 'callback hợp lệ nhưng không phải bản đã đăng ký'], ['', 'thiếu']]) {
    r = await A({ redirect_uri: uri }); const t = await r.text();
    ok(r.status === 400 && !r.headers.get('location') && t.includes('không chuyển hướng'), 'authorize redirect_uri lệch (' + why + ') → trang lỗi 400, KHÔNG Location');
  }
  r = await A({}, { client_id: 'gcc_khong_co' }); ok(r.status === 400 && !r.headers.get('location'), 'authorize client_id lạ → trang lỗi, không redirect');
  const lb = await (await dcr(M, { client_name: 'CLI', redirect_uris: ['http://127.0.0.1:40001/callback'] })).json();
  r = await A({ redirect_uri: 'http://127.0.0.1:40002/callback' }, lb); ok(r.status === 200, 'loopback: authorize bỏ qua port (CLI chọn port lúc chạy)');
  r = await A({ redirect_uri: 'http://127.0.0.1:40002/khac' }, lb); ok(r.status === 400, 'loopback: khác đường dẫn vẫn lệch');
  // lỗi sau khi redirect_uri đã tin được → redirect về đó kèm error + state + iss
  const errRedirect = async (o, want, why) => { const x = await A(o); const u = x.headers.get('location') ? new URL(x.headers.get('location')) : null; ok(x.status === 302 && u && u.origin + u.pathname === CB && u.searchParams.get('error') === want && u.searchParams.get('state') === st && u.searchParams.get('iss') === H, 'authorize ' + why + ' → 302 về redirect_uri error=' + want + ' (+state +iss)'); };
  await errRedirect({ code_challenge: '' }, 'invalid_request', 'thiếu code_challenge (PKCE bắt buộc)');
  await errRedirect({ code_challenge_method: 'plain' }, 'invalid_request', 'method plain');
  await errRedirect({ code_challenge_method: '' }, 'invalid_request', 'thiếu method');
  await errRedirect({ response_type: 'token' }, 'unsupported_response_type', 'response_type=token');
  await errRedirect({ resource: 'https://khac.example/mcp' }, 'invalid_target', 'resource sai');
  await errRedirect({ resource: H + '/khac' }, 'invalid_target', 'resource đúng host sai đường dẫn');
  r = await A({ resource: 'HTTPS://Chibi.Example.Test:443/mcp/' }); ok(r.status === 200, 'resource chuẩn hoá (chữ hoa, port mặc định, "/" cuối) vẫn khớp H/mcp');
  r = await A({ resource: '' }); ok(r.status === 200, 'resource vắng → chấp nhận');
  r = await A({ scope: 'lạ khác' }); ok(r.status === 200, 'scope lạ không gây lỗi (chủ chọn mức)');
  r = await A({ state: 'x'.repeat(600) }); ok(r.status === 302 && /error=invalid_request/.test(r.headers.get('location')), 'state quá dài bị chặn');
  r = await A({ client_id: 'x'.repeat(5000) }); ok(r.status === 400 && !r.headers.get('location'), 'client_id dài bất thường → trang lỗi');
  r = await fetch(M + '/oauth/authorize', { method: 'POST' }); ok(r.status === 405, '/oauth/authorize chỉ nhận GET');
  // tên client do agent tự khai không phá được trang
  const evil = await (await dcr(M, { client_name: '</script><img src=x onerror=alert(1)>', redirect_uris: [CB] })).json();
  r = await A({}, evil); const evilPage = await r.text();
  ok(!evilPage.includes('<img src=x') && !evilPage.includes('</script><img'), 'tên client chứa HTML / </script> không thoát khỏi trang (nhúng JSON đã thoát)');

  console.log('3) token — form-urlencoded + JSON, PKCE, code một lần, xoay vòng refresh');
  const g1 = await grantCode(M);
  r = await exchange(M, g1); const t1 = await r.json();
  ok(r.status === 200 && r.headers.get('cache-control') === 'no-store' && t1.token_type === 'Bearer' && t1.expires_in === 3600 && t1.scope === 'mcp:write' && /^[A-Za-z0-9_-]{43}$/.test(t1.access_token) && /^[A-Za-z0-9_-]{43}$/.test(t1.refresh_token) && t1.access_token !== t1.refresh_token, 'đổi mã (form-urlencoded + resource): 200, no-store, Bearer, 3600 s, scope đã cấp, token 32 byte ngẫu nhiên');
  r = await initWith(M, t1.access_token, { Origin: 'https://claude.ai' }); const ij = await r.json();
  ok(r.status === 200 && ij.result && ij.result.serverInfo, 'initialize + Bearer + Origin https://claude.ai → 200');
  r = await initWith(M, t1.access_token); ok(r.status === 200, 'initialize + Bearer, không Origin → 200');
  r = await initWith(M, t1.access_token, { Origin: 'https://evil.example' }); ok(r.status === 200, 'Bearer là tường minh (không CSRF): Origin lạ không chặn request mang token OAuth');
  r = await rpc(M, 'notifications/initialized', undefined, { Authorization: 'Bearer ' + t1.access_token }, null); ok(r.status === 202 && (await r.text()) === '', 'notification → 202 không thân');
  r = await fetch(M + '/mcp', { headers: { Authorization: 'Bearer ' + t1.access_token } }); ok(r.status === 405 && /POST/.test(r.headers.get('allow') || ''), 'GET /mcp → 405 (không SSE)');
  r = await fetch(M + '/mcp', { method: 'DELETE', headers: { Authorization: 'Bearer ' + t1.access_token } }); ok(r.status === 405, 'DELETE /mcp → 405');
  r = await exchange(M, g1); const t1b = await r.json();
  ok(r.status === 400 && t1b.error === 'invalid_grant', 'dùng lại code → invalid_grant');
  r = await initWith(M, t1.access_token); ok(r.status === 401, 'code dùng 2 lần → token đã cấp từ code đó bị thu hồi (401)');

  // PKCE sai, redirect_uri lệch, resource sai, client khác, code sai
  let g = await grantCode(M); g.pk = pkce();
  r = await exchange(M, g); let j = await r.json(); ok(r.status === 400 && j.error === 'invalid_grant', 'PKCE sai (verifier lạ) → invalid_grant');
  r = await exchange(M, { ...g, pk: { verifier: g.pk.verifier } }); ok((await r.json()).error === 'invalid_grant', '…và mã đã bị đốt, không thử lại được');
  g = await grantCode(M); r = await exchange(M, g, { redirect_uri: 'https://claude.com/api/mcp/auth_callback' }); ok((await r.json()).error === 'invalid_grant', 'redirect_uri lúc đổi khác lúc xin → invalid_grant');
  g = await grantCode(M); r = await exchange(M, g, { resource: 'https://khac.example/mcp' }); j = await r.json(); ok(r.status === 400 && j.error === 'invalid_target', 'resource sai lúc đổi → invalid_target');
  g = await grantCode(M); const other = await (await dcr(M, { client_name: 'khác', redirect_uris: [CB] })).json();
  r = await exchange(M, g, { client_id: other.client_id }); ok((await r.json()).error === 'invalid_grant', 'client khác đổi mã của client này → invalid_grant');
  r = await exchange(M, g, { client_id: 'gcc_khong_co' }); j = await r.json(); ok(r.status === 401 && j.error === 'invalid_client', 'client_id lạ → 401 invalid_client');
  g = await grantCode(M); r = await exchange(M, g, { code_verifier: 'ngan' }); ok(r.status === 400 && (await r.json()).error === 'invalid_request', 'code_verifier sai định dạng → invalid_request');
  r = await form(M, '/oauth/token', { grant_type: 'password', client_id: g.client.client_id }); ok(r.status === 400 && (await r.json()).error === 'unsupported_grant_type', 'grant_type lạ → unsupported_grant_type');
  r = await fetch(M + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' }); ok(r.status === 415, '/oauth/token Content-Type lạ → 415');
  r = await fetch(M + '/oauth/token'); ok(r.status === 405, '/oauth/token chỉ nhận POST');
  g = await grantCode(M);
  r = await fetch(M + '/oauth/token', { method: 'POST', headers: jh, body: JSON.stringify({ grant_type: 'authorization_code', code: g.code, redirect_uri: CB, client_id: g.client.client_id, code_verifier: g.pk.verifier }) });
  j = await r.json(); ok(r.status === 200 && j.access_token, '/oauth/token nhận cả JSON (resource vắng cũng được)');

  // refresh xoay vòng
  const R = await tokens(M); const tk = R.j;
  r = await form(M, '/oauth/token', { grant_type: 'refresh_token', refresh_token: tk.refresh_token, client_id: R.g.client.client_id, resource: H + '/mcp' }); const rf = await r.json();
  ok(r.status === 200 && rf.access_token && rf.refresh_token && rf.refresh_token !== tk.refresh_token && rf.access_token !== tk.access_token && rf.scope === 'mcp:write' && r.headers.get('cache-control') === 'no-store', 'refresh (form): token mới + refresh MỚI (xoay vòng), scope giữ nguyên');
  r = await initWith(M, rf.access_token); ok(r.status === 200, 'access token từ refresh dùng được');
  r = await form(M, '/oauth/token', { grant_type: 'refresh_token', refresh_token: tk.refresh_token, client_id: R.g.client.client_id }); j = await r.json();
  ok(r.status === 400 && j.error === 'invalid_grant', 'dùng lại refresh cũ → invalid_grant');
  r = await initWith(M, rf.access_token); ok(r.status === 401, '…và THU HỒI CẢ CHUỖI: access token mới nhất cũng 401');
  r = await form(M, '/oauth/token', { grant_type: 'refresh_token', refresh_token: rf.refresh_token, client_id: R.g.client.client_id }); ok((await r.json()).error === 'invalid_grant', '…refresh mới nhất cũng chết');
  r = await form(M, '/oauth/token', { grant_type: 'refresh_token', refresh_token: 'khong-co', client_id: R.g.client.client_id }); ok((await r.json()).error === 'invalid_grant', 'refresh sai → invalid_grant');
  const R2 = await tokens(M);
  r = await form(M, '/oauth/token', { grant_type: 'refresh_token', refresh_token: R2.j.refresh_token, client_id: other.client_id }); ok((await r.json()).error === 'invalid_grant', 'refresh của client khác → invalid_grant');

  // revoke (RFC 7009)
  const RV = await tokens(M);
  r = await form(M, '/oauth/revoke', { token: 'khong-co-token', client_id: RV.g.client.client_id }); ok(r.status === 200, 'revoke token lạ → vẫn 200 (không lộ có / không)');
  r = await form(M, '/oauth/revoke', { token: RV.j.access_token, client_id: other.client_id }); ok(r.status === 200 && (await initWith(M, RV.j.access_token)).status === 200, 'revoke bằng client KHÁC → không thu hồi gì');
  r = await form(M, '/oauth/revoke', { token: RV.j.refresh_token, client_id: RV.g.client.client_id }); ok(r.status === 200 && (await initWith(M, RV.j.access_token)).status === 401, 'revoke refresh → cả chuỗi (access) chết');
  r = await form(M, '/oauth/revoke', { token: 'x', client_id: 'gcc_khong_co' }); ok(r.status === 401, 'revoke với client_id lạ → invalid_client');

  // hết hạn (server TTL 2 giây)
  const T = ttl.base;
  const tt = await tokens(T, { headers: own, redirect_uri: 'https://agent.example.org/cb' }); r = await initWith(T, tt.j.access_token);
  ok(tt.j.expires_in === 2 && r.status === 200, 'GC_OAUTH_ACCESS_TTL=2 → expires_in 2, dùng được lúc mới cấp; GC_OAUTH_REDIRECTS thêm callback cho client khác');
  await sleep(2400); r = await initWith(T, tt.j.access_token);
  ok(r.status === 401 && /resource_metadata/.test(r.headers.get('www-authenticate') || ''), 'access token HẾT HẠN → 401 + WWW-Authenticate (agent biết đi refresh)');
  r = await form(T, '/oauth/token', { grant_type: 'refresh_token', refresh_token: tt.j.refresh_token, client_id: tt.g.client.client_id }); const tr = await r.json();
  ok(r.status === 200 && (await initWith(T, tr.access_token)).status === 200, 'refresh sau khi access hết hạn → cấp token mới dùng được');

  console.log('4) phạm vi → kênh sẵn có (read / write / owner) + quản lý trong Cài đặt');
  const S = {};
  for (const sc of ['mcp:read', 'mcp:write', 'mcp:owner']) { const x = await tokens(M, { scope: sc }); S[sc] = x; ok(x.j.scope === sc, 'token mang đúng phạm vi chủ chọn: ' + sc); }
  const ownerList = await (await rpc(M, 'tools/list', {}, { Authorization: 'Bearer ' + OWNER })).json();
  const roNames = TOOLS.filter(t => t.annotations && t.annotations.readOnlyHint === true).map(t => t.name), rwNames = TOOLS.filter(t => !(t.annotations && t.annotations.readOnlyHint === true)).map(t => t.name);
  const lr = await (await rpc(M, 'tools/list', {}, { Authorization: 'Bearer ' + S['mcp:read'].j.access_token })).json();
  ok(ownerList.result.tools.length === TOOLS.length && lr.result.tools.length === roNames.length && lr.result.tools.every(t => roNames.includes(t.name)), 'mcp:read: tools/list chỉ còn tool readOnlyHint (' + roNames.length + '/' + TOOLS.length + ')');
  const rdok = await call(M, S['mcp:read'].j.access_token, 'list_projects');
  ok(!rdok.isError, 'mcp:read: tool đọc (list_projects) chạy được');
  let denied = 0; for (const n of rwNames) { const x = await call(M, S['mcp:read'].j.access_token, n, {}); if (forbidden(x)) denied++; }
  ok(denied === rwNames.length, 'mcp:read: MỌI tool ghi / tốn tài nguyên bị chặn FORBIDDEN (' + denied + '/' + rwNames.length + ')');
  const sp = await call(M, S['mcp:read'].j.access_token, 'save_project', { id: 'doc-thu', name: 'Thử' }); ok(forbidden(sp), 'mcp:read: save_project → FORBIDDEN');
  const wr = await call(M, S['mcp:write'].j.access_token, 'save_project', { id: 'ghi-thu', name: 'Ghi thử' }); ok(!wr.isError, 'mcp:write: save_project (tạo trong dự án) chạy được');
  for (const [n, a] of [['update_app', {}], ['update_app', { force: true }], ['rollback_app', { confirm: 'ROLLBACK' }], ['design_voice', { role: 'ong-lao' }], ['delete_sound_pack', { id: 'x' }]]) {
    const x = await call(M, S['mcp:write'].j.access_token, n, a); ok(forbidden(x), 'mcp:write: ' + n + (a.force ? '(force)' : '') + ' → FORBIDDEN');
  }
  const rv = await call(M, S['mcp:write'].j.access_token, 'render_voice', { text: 'xin chào' }); ok(rv.isError === true, 'mcp:write: render_voice không chi tiêu giọng AI (kênh link: chỉ lấy câu đã lồng) → lỗi');
  const gv = await call(M, S['mcp:write'].j.access_token, 'get_app_version', { check: false }); ok(!gv.isError, 'mcp:write: get_app_version (chỉ đọc) vẫn xem được');
  const ow = await call(M, S['mcp:owner'].j.access_token, 'rollback_app', {}); ok(ow.isError && !/^\[FORBIDDEN\]/.test(ow.content[0].text) && /confirm/i.test(ow.content[0].text), 'mcp:owner: rollback_app qua được cổng phạm vi (dừng ở xác nhận ROLLBACK) — như token chủ máy');
  const owl = await (await rpc(M, 'tools/list', {}, { Authorization: 'Bearer ' + S['mcp:owner'].j.access_token })).json(); ok(owl.result.tools.length === TOOLS.length, 'mcp:owner: thấy đủ ' + TOOLS.length + ' tool');
  const ow2 = await call(M, OWNER, 'rollback_app', {}); ok(ow2.content[0].text === ow.content[0].text, 'mcp:owner trả đúng như token chủ máy');
  // token OAuth không mở /api
  r = await fetch(M + '/api/info', { headers: { Authorization: 'Bearer ' + S['mcp:owner'].j.access_token } }); ok(r.status === 401, 'token OAuth (kể cả mcp:owner) KHÔNG mở /api (401) — chỉ /mcp');

  // quản lý trong Cài đặt
  let view = await (await fetch(M + '/api/oauth', { headers: own })).json();
  ok(view.enabled && view.mcpUrl === H + '/mcp' && view.register === true && view.tokenSet === true && view.clients.length > 3 && view.scopes.length === 3, 'GET /api/oauth: bật, URL, công tắc tự đăng ký, danh sách client, 3 mức');
  const dumped = JSON.stringify(view);
  ok(![S['mcp:owner'], S['mcp:write'], S['mcp:read'], R, tt].some(x => dumped.includes(x.j.access_token) || dumped.includes(x.j.refresh_token)) && !/secret|hash|sha256/i.test(dumped), 'Cài đặt KHÔNG bao giờ hiện token / băm / secret');
  const rowW = view.clients.find(c => c.id === S['mcp:write'].g.client.client_id);
  ok(rowW && rowW.status === 'active' && rowW.scope === 'mcp:write' && rowW.name === 'Claude' && rowW.hosts[0].host === 'claude.ai' && rowW.hosts[0].known && rowW.approvedAt && rowW.lastUsedAt && rowW.createdAt, 'bảng client: tên, domain callback, phạm vi, ngày cấp, lần dùng cuối, trạng thái active');
  ok(view.clients.some(c => c.status === 'pending') && view.clients.find(c => c.status === 'pending').expiresAt, 'client chưa cấp phép: trạng thái pending + hạn tự xoá');
  r = await fetch(M + '/api/oauth/clients/' + S['mcp:write'].g.client.client_id, { method: 'PUT', headers: own, body: JSON.stringify({ scope: 'mcp:read' }) });
  ok(r.status === 200 && forbidden(await call(M, S['mcp:write'].j.access_token, 'save_project', { id: 'ghi-thu', name: 'x' })), 'Đổi phạm vi (write → read) có hiệu lực NGAY với token đang dùng');
  r = await fetch(M + '/api/oauth/clients/' + S['mcp:write'].g.client.client_id, { method: 'PUT', headers: own, body: JSON.stringify({ scope: 'mcp:root' }) }); ok(r.status === 400, 'Đổi phạm vi lạ → 400');
  r = await fetch(M + '/api/oauth/clients/' + S['mcp:write'].g.client.client_id, { method: 'PUT', headers: { ...jh, 'X-GC-Request': '1' }, body: JSON.stringify({ scope: 'mcp:owner' }) }); ok(r.status === 401, 'Đổi phạm vi không có token chủ → 401');
  r = await fetch(M + '/api/oauth/clients/' + S['mcp:owner'].g.client.client_id + '/revoke', { method: 'POST', headers: { ...jh, Authorization: 'Bearer ' + OWNER } }); ok(r.status === 403, 'Thu hồi thiếu X-GC-Request → 403');
  r = await fetch(M + '/api/oauth/clients/' + S['mcp:owner'].g.client.client_id + '/revoke', { method: 'POST', headers: own });
  ok(r.status === 200 && (await initWith(M, S['mcp:owner'].j.access_token)).status === 401, 'Thu hồi ở Cài đặt → access token của client đó 401 ngay');
  r = await form(M, '/oauth/token', { grant_type: 'refresh_token', refresh_token: S['mcp:owner'].j.refresh_token, client_id: S['mcp:owner'].g.client.client_id }); ok((await r.json()).error === 'invalid_grant', '…refresh token cũng chết (huỷ cả access lẫn refresh)');
  view = await (await fetch(M + '/api/oauth', { headers: own })).json(); ok(view.clients.find(c => c.id === S['mcp:owner'].g.client.client_id).status === 'revoked', 'bảng client: trạng thái revoked');
  // duyệt lại sau khi thu hồi: client cũ xin cấp phép lại được
  const again = await grantCode(M, { client: S['mcp:owner'].g.client, scope: 'mcp:read' }); r = await exchange(M, again); ok(r.status === 200, 'client đã thu hồi xin cấp phép lại → chủ duyệt lại mới có token');
  r = await fetch(M + '/api/oauth/clients/gcc_khong_co/revoke', { method: 'POST', headers: own }); ok(r.status === 404, 'thu hồi client không có → 404');

  // công tắc "cho phép agent tự đăng ký"
  r = await fetch(M + '/api/settings', { method: 'PUT', headers: own, body: JSON.stringify({ oauthRegister: false }) }); ok(r.status === 200 && (await r.json()).oauthRegister === false, 'PUT /api/settings oauthRegister=false');
  r = await dcr(M, { client_name: 'x', redirect_uris: [CB] }); ok(r.status === 403 && (await r.json()).error === 'access_denied', 'tắt tự đăng ký → /oauth/register 403');
  const as2 = await (await fetch(M + '/.well-known/oauth-authorization-server')).json(); ok(!('registration_endpoint' in as2), '…metadata không quảng cáo registration_endpoint');
  r = await fetch(M + '/api/settings', { method: 'PUT', headers: own, body: JSON.stringify({ oauthRegister: true }) }); r = await dcr(M, { client_name: 'x', redirect_uris: [CB] }); ok(r.status === 201, 'bật lại → đăng ký được');

  console.log('5) token chủ máy + link có khoá vẫn chạy như cũ; tệp oauth.json chỉ băm; log không lộ token');
  r = await initWith(M, OWNER); ok(r.status === 200, 'token chủ máy (GC_API_TOKEN) → /mcp 200');
  r = await fetch(M + '/mcp/' + KEY, { method: 'POST', headers: jh, body: JSON.stringify(mcpBody) }); ok(r.status === 200, 'link có khoá /mcp/<key> → 200 (không dính OAuth)');
  r = await fetch(M + '/mcp/' + KEY + 'x', { method: 'POST', headers: jh, body: JSON.stringify(mcpBody) }); ok(r.status === 404, 'link sai khoá → 404 như cũ');
  r = await fetch(M + '/api/info', { headers: { Authorization: 'Bearer ' + OWNER } }); const inf = await r.json(); ok(r.status === 200 && inf.mcp.oauth === H + '/mcp' && inf.mcp.link === H + '/mcp/' + KEY, '/api/info: có cả địa chỉ OAuth lẫn link có khoá cũ');
  const file = path.join(main.home, 'data', 'oauth.json'), raw = readFileSync(file, 'utf8'), oj = JSON.parse(raw);
  const allTok = [t1, rf, tk, tr, ...Object.values(S).map(x => x.j)].flatMap(x => [x.access_token, x.refresh_token]).filter(Boolean);
  ok(allTok.length > 8 && allTok.every(t => !raw.includes(t)), 'data/oauth.json KHÔNG chứa token rõ (access / refresh)');
  ok(allTok.some(t => oj.tokens[crypto.createHash('sha256').update(t).digest('hex')]) && Object.keys(oj.tokens).every(k => /^[0-9a-f]{64}$/.test(k)), '…mà chứa băm sha256 của chúng');
  ok(!raw.includes(g1.code) && !raw.includes(OWNER) && !/code_verifier|client_secret|"code"/.test(raw), '…không chứa mã cấp phép / verifier / token chủ máy');
  ok((statSync(file).mode & 0o077) === 0, 'oauth.json chmod 600');
  const lg = main.log(); ok(allTok.every(t => !lg.includes(t)) && !lg.includes(OWNER) && !lg.includes(g1.code), 'log của server KHÔNG chứa token / mã / token chủ máy');

  console.log('6) tắt khi thiếu GC_PUBLIC_URL; chạy cục bộ không token; giới hạn');
  const O = off.base;
  r = await fetch(O + '/mcp', { method: 'POST', headers: jh, body: JSON.stringify(mcpBody) });
  ok(r.status === 401 && !r.headers.get('www-authenticate'), 'không GC_PUBLIC_URL: /mcp không token → 401 trơn như cũ (không WWW-Authenticate)');
  r = await initWith(O, 'bat-ky-token-nao'); ok(r.status === 401, '…token OAuth không có nghĩa');
  for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/oauth/authorize?client_id=x']) { r = await fetch(O + p); ok(r.status === 404, 'OAuth tắt: GET ' + p.split('?')[0] + ' → 404'); }
  r = await dcr(O, { client_name: 'x', redirect_uris: [CB] }); ok(r.status === 404, 'OAuth tắt: /oauth/register → 404');
  r = await form(O, '/oauth/token', { grant_type: 'authorization_code' }); ok(r.status === 404, 'OAuth tắt: /oauth/token → 404');
  const ov = await (await fetch(O + '/api/oauth', { headers: own })).json(); ok(ov.enabled === false && ov.configured === false && ov.mcpUrl === null, 'Cài đặt báo OAuth tắt, cần đặt GC_PUBLIC_URL');
  r = await initWith(O, OWNER); ok(r.status === 200, '…token chủ máy vẫn chạy');

  const Q = open.base;   // không GC_API_TOKEN: local = chủ máy
  const gl = await grantCode(Q, { headers: { ...jh, 'X-GC-Request': '1' } });
  r = await exchange(Q, gl); j = await r.json(); ok(gl.approve.status === 200 && r.status === 200 && j.access_token, 'không GC_API_TOKEN: chủ ở chính máy này duyệt được không cần token (như quy tắc /api)');
  const gp = await grantCode(Q, { headers: { ...jh, 'X-GC-Request': '1', 'X-Forwarded-For': '1.2.3.4' } }); ok(gp.approve.status === 403, '…nhưng qua proxy / tunnel (X-Forwarded-For) mà chưa có token → 403 (không bao giờ mở ra Internet không khoá)');

  // giới hạn tốc độ + trần client (mỗi "IP" khác nhau qua cf-connecting-ip)
  const ip = n => ({ 'cf-connecting-ip': '10.9.' + n });
  for (let i = 0; i < 20; i++) await dcr(M, { client_name: 'RL', redirect_uris: [CB] }, ip(1));
  r = await dcr(M, { client_name: 'RL', redirect_uris: [CB] }, ip(1)); j = await r.json();
  ok(r.status === 429 && Number(r.headers.get('retry-after')) > 0 && j.error === 'temporarily_unavailable', 'rate-limit đăng ký theo IP: yêu cầu thứ 21 → 429 + Retry-After');
  r = await dcr(M, { client_name: 'RL', redirect_uris: [CB] }, ip(2)); ok(r.status === 201, '…IP khác không bị ảnh hưởng');
  let tl = 0; for (let i = 0; i < 61; i++) { const x = await form(M, '/oauth/token', { grant_type: 'authorization_code', client_id: 'gcc_x' }, ip(3)); if (x.status === 429) tl++; } ok(tl >= 1, 'rate-limit /oauth/token theo IP (60 / phút) → 429');
  for (let i = 10; i < 70; i++) await dcr(M, { client_name: 'Lũ ' + i, redirect_uris: [CB] }, ip(i));
  view = await (await fetch(M + '/api/oauth', { headers: own })).json();
  ok(view.clients.length <= 50 && view.clients.length >= 45, 'trần 50 client: đầy thì xoá client cũ CHƯA từng cấp phép, không phình (đang có ' + view.clients.length + ')');
  ok(view.clients.some(c => c.status === 'active'), '…client đang hoạt động không bị xoá');

  console.log('7) đường máy qua "cổng đăng nhập ngoài" giả (Caddy + /login): không cần cookie / phiên Studio');
  // cổng ngoài: path máy đi thẳng; còn lại 401 {"error":"Chưa đăng nhập"} nếu thiếu cookie gate=ok — giống trang login của Ryan. App KHÔNG được tin cookie này.
  const MACHINE = /^\/(mcp(\/.*)?|\.well-known\/oauth-protected-resource.*|\.well-known\/oauth-authorization-server.*|oauth\/(register|token|revoke))$/;
  const seenByApp = [];
  proxy = http.createServer((q, s) => {
    const u = new URL(q.url, 'http://x'), cookie = String(q.headers.cookie || ''), passed = MACHINE.test(u.pathname) || /(^|;\s*)gate=ok/.test(cookie);
    if (!passed) { s.writeHead(401, { 'Content-Type': 'application/json' }); return s.end(JSON.stringify({ error: 'Chưa đăng nhập', loginUrl: '/login' })); }
    const headers = { ...q.headers, host: 'chibi.example.test', 'x-forwarded-host': 'chibi.example.test', 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https', 'cf-connecting-ip': '203.0.113.7' };
    delete headers.cookie; delete headers.connection;   // app không nhận cookie của cổng ngoài
    const up = http.request({ host: '127.0.0.1', port: P.main, path: q.url, method: q.method, headers }, ur => { s.writeHead(ur.statusCode, ur.headers); ur.pipe(s); seenByApp.push(u.pathname); });
    up.on('error', e => { s.writeHead(502); s.end(String(e)); }); q.pipe(up);
  }).listen(P.proxy, '127.0.0.1');
  const X = 'http://127.0.0.1:' + P.proxy, GATE = { Cookie: 'gate=ok' };
  r = await fetch(X + '/api/oauth'); j = await r.json(); ok(r.status === 401 && j.loginUrl === '/login', 'cổng ngoài chặn /api/* khi chưa đăng nhập (đúng như bản của Ryan)');
  r = await fetch(X + '/mcp', { method: 'POST', headers: jh, body: JSON.stringify(mcpBody) });
  ok(r.status === 401 && r.headers.get('www-authenticate') === WWW, 'qua cổng: /mcp không token → 401 CỦA APP kèm WWW-Authenticate (không phải 401 của trang login) → agent tự khám phá được');
  r = await fetch(X + '/.well-known/oauth-protected-resource/mcp'); prm = await r.json(); ok(r.status === 200 && prm.resource === H + '/mcp', 'qua cổng: PRM đi thẳng, không cookie');
  r = await fetch(X + '/.well-known/oauth-authorization-server'); const px = await r.json(); ok(r.status === 200 && px.issuer === H, 'qua cổng: AS metadata đi thẳng');
  r = await dcr(X, { client_name: 'Claude', redirect_uris: [CB] }); const pc = await r.json(); ok(r.status === 201 && pc.client_id, 'qua cổng: DCR đi thẳng (client mới, không cookie)');
  const pp = pkce();
  const q0 = authQ(pc, { code_challenge: pp.challenge });
  r = await fetch(X + '/oauth/authorize?' + q0, { redirect: 'manual' }); ok(r.status === 401, 'qua cổng: trang authorize nằm SAU cổng (chưa đăng nhập → bị cổng chặn)');
  r = await fetch(X + '/oauth/authorize?' + q0, { headers: GATE }); const ppage = await r.text(); ok(r.status === 200 && ppage.includes('Cấp phép kết nối agent'), 'qua cổng + đã đăng nhập cổng: thấy trang Cấp phép');
  const prid = reqId(ppage);
  r = await fetch(X + '/api/oauth/approve', { method: 'POST', headers: { ...jh, ...GATE, 'X-GC-Request': '1' }, body: JSON.stringify({ request: prid, decision: 'approve', scope: 'mcp:write' }) });
  ok(r.status === 401, 'đã qua cổng ngoài NHƯNG chưa có token chủ máy → app vẫn từ chối duyệt (không tin "đã qua cổng là chủ")');
  r = await fetch(X + '/api/oauth/approve', { method: 'POST', headers: { ...own, ...GATE, 'Remote-User': 'ryan' }, body: JSON.stringify({ request: prid, decision: 'approve', scope: 'mcp:write' }) }); aj = await r.json();
  ok(r.status === 200 && aj.redirect, 'có token chủ máy (nhập trong trang) + qua cổng → duyệt được');
  const pcode = new URL(aj.redirect).searchParams.get('code');
  r = await form(X, '/oauth/token', { grant_type: 'authorization_code', code: pcode, redirect_uri: CB, client_id: pc.client_id, code_verifier: pp.verifier, resource: H + '/mcp' }); const pt = await r.json();
  ok(r.status === 200 && pt.access_token, 'qua cổng: /oauth/token (form) đi thẳng, không cookie');
  r = await initWith(X, pt.access_token, { Origin: 'https://claude.ai' }); ok(r.status === 200, 'qua cổng: initialize + Bearer → 200 không cần cookie / phiên Studio');
  const pl = await (await rpc(X, 'tools/list', {}, { Authorization: 'Bearer ' + pt.access_token })).json(); ok(pl.result.tools.length === TOOLS.length && pl.result.tools.some(t => t.name === 'save_character'), 'qua cổng: tools/list thấy tool (mcp:write)');
  r = await rpc(X, 'notifications/initialized', undefined, { Authorization: 'Bearer ' + pt.access_token }, null); ok(r.status === 202, 'qua cổng: notification → 202');
  r = await form(X, '/oauth/revoke', { token: pt.access_token, client_id: pc.client_id }); ok(r.status === 200 && (await initWith(X, pt.access_token)).status === 401, 'qua cổng: /oauth/revoke đi thẳng và có tác dụng');
  r = await fetch(X + '/oauth/authorize?client_id=x&redirect_uri=y', { headers: GATE, redirect: 'manual' }); ok(r.status === 400, 'qua cổng: authorize lỗi → trang lỗi (không redirect)');
  ok(!seenByApp.includes('/api/oauth') && !seenByApp.includes('/api/info'), 'cổng ngoài không cho /api/* của Studio lọt khi chưa đăng nhập');
  proxy.close();

  console.log('8) đồng hồ giả (không chờ thật)');
  let now = Date.UTC(2026, 9, 19, 12, 0, 0);
  const mk = () => new OAuth({ dir: mkdtempSync(path.join(tmpdir(), 'gc-oauthu-')), publicUrl: H + '/', now: () => now });
  const reg = (o, name) => o.register({ client_name: name || 'c', redirect_uris: [CB] }).body;
  const approve = (o, cl, scope) => { const pk2 = pkce(); const a = o.authorize(new URLSearchParams({ response_type: 'code', client_id: cl.client_id, redirect_uri: CB, code_challenge: pk2.challenge, code_challenge_method: 'S256', state: 's' })); const x = o.approve(a.view.request, 'approve', scope || 'mcp:write'); return { pk: pk2, code: new URL(x.redirect).searchParams.get('code') }; };
  const xchg = (o, cl, a) => o.token({ grant_type: 'authorization_code', code: a.code, redirect_uri: CB, client_id: cl.client_id, code_verifier: a.pk.verifier });
  let o = mk(), cl = reg(o), a = approve(o, cl);
  ok(o.publicUrl === H, 'GC_PUBLIC_URL có "/" cuối được chuẩn hoá → issuer đúng H');
  now += 61000; let x = xchg(o, cl, a); ok(x.status === 400 && x.body.error === 'invalid_grant', 'mã cấp phép hết hạn sau 60 giây → invalid_grant');
  o = mk(); cl = reg(o); a = approve(o, cl); now += 59000; x = xchg(o, cl, a); ok(x.status === 200, 'mã còn trong 60 giây → đổi được');
  const tokA = x.body.access_token; now += 3599 * 1000; ok(!!o.verify(tokA), 'access token còn dùng ở giây 3599'); now += 2000; ok(o.verify(tokA) === null, 'access token hết hạn sau 1 giờ');
  let rt = x.body.refresh_token, last = x.body;
  for (let i = 1; i <= 3; i++) { now += 20 * 86400 * 1000; const y = o.token({ grant_type: 'refresh_token', refresh_token: rt, client_id: cl.client_id }); ok(y.status === 200, 'refresh trượt: lần ' + i + ' sau ' + i * 20 + ' ngày (mỗi lần cách 20 ngày < 30) vẫn được'); rt = y.body.refresh_token; last = y.body; }
  now += 31 * 86400 * 1000; x = o.token({ grant_type: 'refresh_token', refresh_token: rt, client_id: cl.client_id }); ok(x.status === 400 && x.body.error === 'invalid_grant', 'refresh quá 30 ngày không dùng → invalid_grant');
  o = mk(); cl = reg(o); now += 23 * 3600 * 1000; ok(o.list().some(c => c.id === cl.client_id), 'client chưa cấp phép còn sau 23 giờ'); now += 2 * 3600 * 1000; ok(!o.list().some(c => c.id === cl.client_id), 'client chưa từng cấp phép tự hết hạn sau 24 giờ');
  o = mk(); cl = reg(o); a = approve(o, cl); const act = xchg(o, cl, a); now += 25 * 3600 * 1000; ok(o.list().some(c => c.id === cl.client_id), 'client ĐÃ cấp phép không bị xoá theo hạn 24 giờ');
  o.revokeClient(cl.client_id); ok(o.list().find(c => c.id === cl.client_id).status === 'revoked', 'thu hồi → trạng thái revoked'); now += 8 * 86400 * 1000; ok(!o.list().some(c => c.id === cl.client_id), '…và client thu hồi được dọn sau 7 ngày');
  // trần 50
  o = mk(); const cls = []; for (let i = 0; i < 50; i++) { now += 1000; cls.push(reg(o, 'c' + i)); }
  ok(Object.keys(o.s.clients).length === 50, 'đủ 50 client');
  now += 1000; let y = o.register({ client_name: 'mới', redirect_uris: [CB] }); ok(y.status === 201 && !o.s.clients[cls[0].client_id] && !!o.s.clients[cls[1].client_id] && Object.keys(o.s.clients).length === 50, 'đầy trần: xoá client chưa từng cấp phép CŨ NHẤT, nhận client mới (vẫn 50)');
  o = mk(); for (let i = 0; i < 50; i++) { now += 1000; const c = reg(o, 'c' + i); xchg(o, c, approve(o, c)); }
  y = o.register({ client_name: 'mới', redirect_uris: [CB] }); ok(y.status === 429 && y.body.error === 'temporarily_unavailable', '50 client đều đang hoạt động → 429 (không xoá client sống)');
  o = mk(); cl = reg(o); const a1 = o.authorize(new URLSearchParams({ response_type: 'code', client_id: cl.client_id, redirect_uri: CB, code_challenge: pkce().challenge, code_challenge_method: 'S256' }));
  for (let i = 0; i < 49; i++) { now += 1000; reg(o, 'f' + i); } now += 1000; o.register({ client_name: 'mới', redirect_uris: [CB] });
  ok(!!o.s.clients[cl.client_id], 'đầy trần: client đang có yêu cầu chờ duyệt (chủ đang xem trang Cấp phép) được giữ, xoá cái khác');
  ok(o.approve(a1.view.request, 'approve', 'mcp:write').redirect, '…và vẫn duyệt được');
  o = mk(); ok(o.limit('k', 3, 60) === 0 && o.limit('k', 3, 60) === 0 && o.limit('k', 3, 60) === 0 && o.limit('k', 3, 60) > 0, 'limit(): đủ 3 lần rồi chặn'); now += 61000; ok(o.limit('k', 3, 60) === 0, 'limit(): hết cửa sổ thì mở lại');
  // lastUsedAt ghi trễ nhưng flush được
  o = mk(); cl = reg(o); a = approve(o, cl); x = xchg(o, cl, a); now += 5000; o.verify(x.body.access_token); o.flush(); const saved = JSON.parse(readFileSync(path.join(path.dirname(o.file), 'oauth.json'), 'utf8')); ok(Object.values(saved.clients)[0].lastUsedAt, 'lastUsedAt được ghi (trễ) vào oauth.json');
  const o2 = new OAuth({ dir: path.dirname(o.file), publicUrl: H, now: () => now }); ok(!!o2.verify(x.body.access_token), 'khởi động lại server: token vẫn dùng được (nạp từ oauth.json)');
  const o3 = new OAuth({ dir: path.dirname(o.file), publicUrl: 'https://khac.example.test', now: () => now }); ok(o3.verify(x.body.access_token) === null, 'đổi GC_PUBLIC_URL → token cũ (aud khác) không còn dùng được');
  ok(new OAuth({ dir: path.dirname(o.file), publicUrl: H + '/duong-dan' }).enabled === false && new OAuth({ dir: path.dirname(o.file), publicUrl: '' }).enabled === false, 'GC_PUBLIC_URL có đường dẫn hoặc trống → OAuth tắt');
} catch (e) { failn++; console.log('   ✗ test sập:', e.stack || e); }
finally { try { proxy && proxy.close(); } catch (e) { /* đã đóng */ } kids.forEach(c => { try { c.kill(); } catch (e) { /* đã tắt */ } }); }
console.log('\nKết quả: ' + passn + ' đạt, ' + failn + ' trượt');
process.exit(failn ? 1 : 0);
