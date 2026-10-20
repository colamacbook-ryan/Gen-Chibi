// Kiểm "Go online" (v0.21 P3): edge của app (cổng nghe riêng cho cloudflared, X-GC-Edge của Caddy) · sites.caddy + nạp lại qua admin unix socket ·
// client Cloudflare API v4 trên một Cloudflare GIẢ (Node http, đúng endpoint + thân của nghiên cứu) · máy trạng thái wizard (đường A / B / proxy / link tạm / off)
// với DNS / IP / mạng giả · token API không lọt ra log / online.json / phản hồi · rào ngược bằng đột biến. KHÔNG gọi Cloudflare / Let's Encrypt thật.
// © 2026 Gen Labs — All rights reserved.
import http from 'http';
import net from 'net';
import crypto from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fakeCloudflare as fakeCf, tunnelTokenOf } from './fixtures/fake-cloudflare-api.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CADDY = require('../server/caddy');
const CF = require('../server/cloudflare');
const ONLINE = require('../server/online');
const { createEdge, createTunnelListener } = require('../server/edge');
const { OnlineConfig } = require('../server/online-config');
const { Secrets } = require('../server/secrets');

let failn = 0, passn = 0;
const ok = (c, m) => { if (c) { passn++; console.log('   ✓', m); } else { failn++; console.log('   ✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmps = [];
const tmp = p => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gco-' + p + '-')); tmps.push(d); return d; };
const VI_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => { const p = path.join(d, e.name); return e.isDirectory() ? walk(p) : e.isFile() ? [p] : []; });
const mode = f => fs.statSync(f).mode & 0o777;
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const API_TOKEN = 'cfapi_' + crypto.randomBytes(18).toString('hex');   // token API giả — phải KHÔNG BAO GIỜ xuất hiện ở log / tệp / phản hồi
const PUB4 = '45.33.32.156', PUB6 = '2600:3c00::f03c:91ff:fe18:bb2f', CF4 = '104.21.3.4';
const INSTALL = 'abcdef0123456789abcdef0123456789';

// ---------------------------------------------------------------- Cloudflare giả (tools/fixtures/fake-cloudflare-api.mjs — dùng chung với test browser)
const fakeCloudflare = o => fakeCf(Object.assign({ token: API_TOKEN }, o));

// ---------------------------------------------------------------- mạng giả: DNS, IP công khai, chứng chỉ, các yêu cầu qua tên miền
function fakeNet(o = {}) {
  const calls = { probe: [], resolve: [] };
  return {
    calls,
    swap(dns, onTls) { o.dns = dns; o.onTls = onTls; },
    resolve: async h => { calls.resolve.push(h); return Object.assign({ a: [], aaaa: [], via: 'authoritative', error: '' }, (o.dns || {})[h]); },
    publicIp: async () => o.pub || { v4: PUB4, v6: '' },
    tlsInfo: async () => (o.onTls && o.onTls(), 0) || o.tls || { ok: true, authorized: true, matches: true, issuer: "Let's Encrypt · R11", validTo: '2027-01-18T00:00:00.000Z', staging: false },
    probe: async (url, op) => {
      const u = new URL(url), hd = op.headers || {}, ua = hd['User-Agent'] || '';
      calls.probe.push({ url, host: u.hostname, ip: op.ip, method: op.method || 'GET', ua });
      if (o.down) return { status: 0, error: 'ECONNREFUSED', headers: {}, body: '' };
      if (o.blockUA && /Claude-User/.test(ua)) return { status: 403, headers: {}, body: 'Forbidden' };
      const origin = u.origin, j = (code, b, h) => ({ status: code, headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify(b) });
      const ck = /^\/\.well-known\/gen-chibi-check\/([a-f0-9]{32})$/.exec(u.pathname);
      if (ck && u.protocol === 'http:') return o.port === false ? { status: 0, error: 'ETIMEDOUT', headers: {}, body: '' } : { status: 200, headers: {}, body: ck[1] };
      if (ck) return j(200, { nonce: ck[1], forwarded: o.xff !== false, edge: null });
      if (u.pathname === '/api/health') return j(200, { ok: true, version: 'test' });
      if (u.pathname === '/.well-known/oauth-authorization-server') return j(200, { issuer: o.issuer || origin });
      if (u.pathname === '/.well-known/oauth-protected-resource') return j(200, { resource: origin + '/mcp' });
      if (u.pathname === '/mcp' && op.method === 'POST') return j(401, { error: 'unauthorized' }, o.noWww ? {} : { 'www-authenticate': 'Bearer resource_metadata="' + origin + '/.well-known/oauth-protected-resource/mcp"' });
      return j(404, { error: 'not found' });
    }
  };
}

// ---------------------------------------------------------------- Caddy admin giả (unix socket): ghi lại mọi lần gọi
async function fakeCaddyAdmin(edgeDir, o = {}) {
  fs.mkdirSync(path.join(edgeDir, 'run'), { recursive: true });
  const sock = path.join(edgeDir, 'run', 'caddy-admin.sock'), calls = [];
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
      calls.push({ m: req.method, p: req.url, type: req.headers['content-type'] || '', body: raw });
      if (req.url === '/load' && o.loadFail) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'adapting config using caddyfile: ' + o.loadFail })); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.url === '/config/' ? '{}' : '');
    });
  });
  await new Promise(r => srv.listen(sock, r));
  return { sock, calls, close: () => srv.close() };
}
const ROOT_CADDYFILE = '{\n\tadmin unix//edge/run/caddy-admin.sock|0660\n\thttp_port 8080\n\thttps_port 8443\n}\nimport /edge/conf/sites.caddy\n';

// ---------------------------------------------------------------- dựng online.js trong tiến trình + một server HTTP mỏng như main.js
async function mkOnline(o = {}) {
  const home = tmp(o.name || 'x'), dataDir = path.join(home, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const cfg = new OnlineConfig({ dir: dataDir, env: {} });   // online-config thật (P1): nguồn app, không .env kế thừa
  if (o.publicUrl) { cfg.setPending(o.publicUrl); cfg.commit(); cfg.set({ mode: 'proxy', domain: new URL(o.publicUrl).hostname }); }
  const logs = [], responses = [];
  const netf = fakeNet(o.net || {});
  const tl = { on: false, set(v) { this.on = !!v; }, listening() { return this.on; } };
  const secrets = new Secrets(dataDir);
  const make = o.createOnline || ONLINE.createOnline, cfMake = o.createCloudflare || CF.createCloudflare;
  const online = make(Object.assign({
    home, dataDir, port: 7480, inDocker: o.inDocker !== false, config: cfg, secrets, log: m => logs.push(String(m)),
    isOwner: req => req.headers.authorization === 'Bearer owner',
    resolve: netf.resolve, publicIp: netf.publicIp, probe: netf.probe, tlsInfo: netf.tlsInfo,
    cloudflare: opts => cfMake(Object.assign({ base: o.cfBase || 'http://127.0.0.1:9/client/v4' }, opts)),
    hasPassword: () => o.hasPassword !== false, legacy: () => ({ active: !!o.legacy }),
    tunnel: tl, installId: () => INSTALL,
    waits: Object.assign({ certMs: 0, certFailMs: 60000, tunnelMs: 0, tunnelFailMs: 60000, everyMs: 5 }, o.waits),
    rate: o.rate || { minGapMs: 0, perHour: 100000 }
  }, o.extra));
  const send = (res, code, body, type, extra) => { const b = typeof body === 'string' ? body : JSON.stringify(body); responses.push(b); res.writeHead(code, Object.assign({ 'Content-Type': type || 'application/json' }, extra)); res.end(b); };
  const body = req => new Promise((resolve, reject) => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(Object.assign(e, { code: 400 })); } }); });
  const srv = http.createServer(async (req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    try { await online.route(req, res, p, req.method, { send, body, lang: req.headers['x-gc-lang'] || 'vi' }); } catch (e) { send(res, e.code || 500, { error: e.message }); }
  });
  const port = await listen(srv);
  const call = async (m, p, b, h) => { const r = await fetch('http://127.0.0.1:' + port + p, { method: m, headers: Object.assign({ Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, h), body: b === undefined ? undefined : JSON.stringify(b) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { j = null; } return { status: r.status, j, t, h: r.headers }; };
  const view = async lang => (await call('GET', '/api/online', undefined, lang ? { 'X-GC-Lang': lang } : {})).j;
  const step = (v, id) => v.flow.steps.find(s => s.id === id);
  return { netSwap: (dns, onTls) => netf.swap(dns, onTls), home, dataDir, cfg, online, net: netf, logs, responses, tl, secrets, call, view, step, idle: () => online.idle(), close: () => srv.close(), post: (p, b, h) => call('POST', p, b, h) };
}
function leaksOf(token, x, extraTexts) {
  const where = [];
  if (x.logs.some(l => l.includes(token))) where.push('log');
  if (x.responses.some(r => r.includes(token))) where.push('response');
  (extraTexts || []).forEach((t, i) => { if (t.includes(token)) where.push('text#' + i); });
  walk(x.home).forEach(f => { if (fs.readFileSync(f).includes(token)) where.push(path.relative(x.home, f)); });
  return where;
}

// ---------------------------------------------------------------- 1) tên miền + sites.caddy
const BAD_DOMAINS = ['a.com\n}', 'a.com}', '*.x.com', '*.example.com', '1.2.3.4', '::1', '[::1]', '10.0.0.1', 'a'.repeat(64) + '.com', ('a'.repeat(62) + '.').repeat(4) + 'abc', 'localhost', 'x.local', 'a..b.com', '-a.com', 'a-.com', 'a.com ', ' a.com', 'a.com:443', 'a.com/x', 'single', '', 'a.com\nhttp://evil.com {', 'a.c"m', 'a.123', null, 42];
function badDomainFailures(C) {
  const bad = [];
  BAD_DOMAINS.forEach(d => {
    if (C.validDomain(d)) bad.push(JSON.stringify(d));
    let threw = false; try { C.sitesFile([{ domain: d, nonce: 'a'.repeat(32) }]); } catch (e) { threw = true; }
    if (!threw) bad.push('sitesFile(' + JSON.stringify(d) + ')');
  });
  return bad;
}
console.log('   — tên miền + sites.caddy');
{
  ok(['chibi.example.com', 'a-b.c.io', 'xn--p1ai.xn--p1ai', 'Chibi.Example.COM', 'a'.repeat(63) + '.com'].every(d => CADDY.validDomain(d) === d.toLowerCase()), 'tên miền hợp lệ được nhận (chuẩn hoá chữ thường, nhãn 63 ký tự)');
  const bad = badDomainFailures(CADDY);
  ok(!bad.length, 'regex hostname chặn ' + BAD_DOMAINS.length + ' tên xấu (xuống dòng + "}", wildcard, IPv4 / IPv6, nhãn > 63, tổng > 253, localhost / .local, khoảng trắng, cổng, đường dẫn, dấu nháy)' + (bad.length ? ': ' + bad.join(' ') : ''));
  const nonce = crypto.randomBytes(16).toString('hex'), s = CADDY.sitesFile([{ domain: 'chibi.example.com', nonce }]);
  ok(/^http:\/\/chibi\.example\.com \{$/m.test(s) && /^https:\/\/chibi\.example\.com \{$/m.test(s) && (s.match(/example\.com/g) || []).length === 3, 'sites.caddy: một site http (kiểm cổng + chuyển https) + một site https cho đúng tên miền');
  ok(s.includes('\treverse_proxy app:7480 {') && s.includes('header_up -Cf-Connecting-Ip') && s.includes('header_up -X-Real-Ip') && s.includes('header_up X-GC-Edge {file./edge/conf/edge-secret}'), 'https → reverse_proxy app:7480, xoá header IP do client gửi, X-GC-Edge đọc từ tệp lúc chạy (không chép bí mật)');
  ok(s.includes('handle /.well-known/gen-chibi-check/' + nonce + ' {') && s.includes('respond "' + nonce + '" 200') && s.includes('redir https://chibi.example.com{uri} 308'), 'http: /.well-known/gen-chibi-check/<nonce> trả nonce, còn lại 308 sang https');
  let t1 = false; try { CADDY.sitesFile([{ domain: 'chibi.example.com', nonce: 'x"}\n' }]); } catch (e) { t1 = true; }
  let t2 = false; try { CADDY.sitesFile([{ domain: 'Chibi.example.com', nonce }]); } catch (e) { t2 = true; }
  ok(t1 && t2, 'nonce không phải hex 32 ký tự / tên chưa chuẩn hoá → ném lỗi, không ghi');
}

// ---------------------------------------------------------------- 2) Caddy: ghi nguyên tử + nạp lại kèm admin qua unix socket
console.log('   — Caddy: admin unix socket giả');
{
  const edgeDir = path.join(tmp('caddy'), 'edge');
  const adm = await fakeCaddyAdmin(edgeDir);
  const c = CADDY.createCaddy({ edgeDir });
  ok(await c.adminUp(), 'adminUp: GET /config/ qua unix socket → 200');
  c.writeSites([{ domain: 'chibi.example.com', nonce: 'b'.repeat(32) }]);
  ok(fs.existsSync(c.files.sites) && mode(c.files.sites) === 0o600 && !fs.existsSync(c.files.sites + '.tmp'), 'sites.caddy ghi nguyên tử (tmp → rename), quyền 0600');
  let e1 = null; try { await c.reload(); } catch (e) { e1 = e; }
  ok(e1 && e1.code === 'ROOT_MISSING' && !adm.calls.some(x => x.p === '/load'), 'chưa có edge/conf/Caddyfile → từ chối nạp, không gọi /load');
  fs.writeFileSync(c.files.root, '{\n\thttp_port 8080\n}\nimport /edge/conf/sites.caddy\n');
  e1 = null; try { await c.reload(); } catch (e) { e1 = e; }
  ok(e1 && e1.code === 'ROOT_NO_ADMIN' && !adm.calls.some(x => x.p === '/load'), 'Caddyfile gốc thiếu "admin unix//…" → từ chối nạp (nạp sẽ đưa admin về TCP, mất điều khiển — CNS-194)');
  fs.writeFileSync(c.files.root, ROOT_CADDYFILE);
  await c.reload();
  const ld = adm.calls.filter(x => x.p === '/load');
  ok(ld.length === 1 && ld[0].m === 'POST' && ld[0].type === 'text/caddyfile' && ld[0].body === ROOT_CADDYFILE, 'nạp lại = POST /load, Content-Type text/caddyfile, thân = Caddyfile gốc ĐẦY ĐỦ (có khối admin + import sites)');
  adm.close();
  const adm2 = await fakeCaddyAdmin(path.join(tmp('caddy2'), 'edge'), { loadFail: 'unrecognized directive: bogus' });
  const c2 = CADDY.createCaddy({ edgeDir: path.dirname(path.dirname(adm2.sock)) });
  fs.mkdirSync(path.dirname(c2.files.root), { recursive: true }); fs.writeFileSync(c2.files.root, ROOT_CADDYFILE);
  e1 = null; try { await c2.reload(); } catch (e) { e1 = e; }
  ok(e1 && e1.code === 'LOAD_400' && /unrecognized directive/.test(e1.message), 'Caddy từ chối cấu hình → lỗi mang câu gốc của Caddy');
  adm2.close();
  const c3 = CADDY.createCaddy({ edgeDir: path.join(tmp('caddy3'), 'edge') });
  ok(!(await c3.adminUp()) && !c3.enabled(), 'không có socket / dấu caddy.enabled → adminUp false, enabled false');
}

// ---------------------------------------------------------------- 3) lớp edge của request (đơn vị)
console.log('   — lớp edge của request');
{
  const edgeDir = path.join(tmp('edge'), 'edge'), e = createEdge({ edgeDir });
  ok(e.ensureSecret() === true && mode(e.file) === 0o600 && /^[a-f0-9]{64}$/.test(e.secret()) && e.ensureSecret() === false, 'bí mật edge: sinh một lần, 64 hex, 0600; gọi lại giữ nguyên');
  const sec = e.secret(), R = h => ({ headers: Object.assign({}, h), socket: { remoteAddress: '172.18.0.3' } });
  const a = e.mark(R({ 'x-gc-edge': sec, 'x-forwarded-for': '1.2.3.4, 9.9.9.9' }), 'main');
  ok(a.gcEdge === 'caddy' && a.gcIp === '9.9.9.9' && a.headers['x-gc-edge'] === undefined, 'X-GC-Edge đúng → caddy, IP = mục CUỐI X-Forwarded-For, header bí mật bị gỡ');
  const b = e.mark(R({ 'x-gc-edge': sec.slice(0, -1) + (sec.endsWith('0') ? '1' : '0'), 'x-forwarded-for': '9.9.9.9' }), 'main');
  ok(!b.gcEdge && !b.gcIp && b.headers['x-gc-edge'] === undefined, 'X-GC-Edge sai → không phải caddy');
  const c = e.mark(R({ 'cf-connecting-ip': '8.8.8.8' }), 'main');
  ok(!c.gcEdge && !c.gcIp, 'cổng chính: Cf-Connecting-Ip giả không đổi IP khách');
  const t = e.mark(R({ 'cf-connecting-ip': '8.8.4.4' }), 'tunnel');
  ok(t.gcEdge === 'tunnel' && t.gcIp === '8.8.4.4', 'cổng riêng: tunnel, IP = Cf-Connecting-Ip');
  const t2 = e.mark(R({ 'cf-connecting-ip': '<script>' }), 'tunnel');
  ok(t2.gcEdge === 'tunnel' && t2.gcIp === '172.18.0.3', 'Cf-Connecting-Ip không phải IP → dùng peer');
  fs.writeFileSync(e.file, 'short\n', { mode: 0o600 });
  ok(!e.mark(R({ 'x-gc-edge': 'short' }), 'main').gcEdge, 'bí mật < 32 ký tự bị bỏ qua (không bao giờ khớp)');
}

// ---------------------------------------------------------------- 4) client Cloudflare trên API giả
console.log('   — client Cloudflare API (giả)');
{
  const cf = await fakeCloudflare({ dns: [{ type: 'A', name: 'chibi.example.com', content: '45.33.32.156' }] });
  const c = CF.createCloudflare({ token: API_TOKEN, base: cf.base });
  const v = await c.verify('example.com');
  ok(v.found && v.status === 'active' && v.type === 'full' && v.perms.tunnel.ok && v.perms.dns.ok && v.perms.waf.ok, 'verify: zone + account từ GET /zones?name, quyền tunnel / DNS / WAF kiểm bằng lời gọi đọc (404 ruleset = có quyền)');
  ok(!(await c.verify('other.org')).found, 'zone không có → found false');
  const t = await c.createTunnel('gen-chibi-abcdef01');
  ok(cf.st.log.some(x => x.m === 'POST' && /\/cfd_tunnel$/.test(x.p) && x.body.config_src === 'cloudflare' && x.body.name === 'gen-chibi-abcdef01'), 'createTunnel: POST cfd_tunnel { name, config_src: "cloudflare" }');
  ok((await c.findTunnel('gen-chibi-abcdef01')).id === t.id && (await c.findTunnel('gen-chibi-zzz')) === null, 'findTunnel theo tên (is_deleted=false)');
  cf.st.configs[t.id] = { ingress: [{ hostname: 'old.example.com', service: 'http://127.0.0.1:7482' }, { hostname: 'nas.example.com', service: 'http://192.168.1.5:5000' }, { service: 'http_status:404' }] };
  const ing = await c.putIngress(t.id, 'chibi.example.com', 'http://127.0.0.1:7482');
  ok(ing.length === 3 && ing[0].hostname === 'chibi.example.com' && ing[1].hostname === 'nas.example.com' && ing[2].service === 'http_status:404' && !ing.some(x => x.hostname === 'old.example.com'), 'putIngress đọc–sửa–ghi: mục mình đứng đầu, mục người khác giữ, mục cũ của bản cài (cùng service) bỏ, catch-all 404 cuối');
  const before = cf.writes(/dns_records/).length;
  const cn = await c.ensureCname('chibi.example.com', t.id);
  ok(cn.result === 'conflict' && cn.records[0].type === 'A' && cf.writes(/dns_records/).length === before, 'ensureCname: tên đã có bản ghi A → conflict, KHÔNG ghi gì vào DNS');
  const cn2 = await c.ensureCname('chibi.example.com', t.id, { overwrite: true });
  const recs = cf.st.dns.filter(x => x.name === 'chibi.example.com');
  ok(cn2.result === 'overwritten' && recs.length === 1 && recs[0].type === 'CNAME' && recs[0].content === t.id + '.cfargotunnel.com' && recs[0].proxied === true, 'overwrite (chủ đã xác nhận) → xoá đúng bản ghi ở tên đó, tạo CNAME proxied → <id>.cfargotunnel.com');
  ok((await c.ensureCname('chibi.example.com', t.id)).result === 'exists', 'chạy lại → exists (idempotent)');
  ok(/^eyJ/.test(await c.getTunnelToken(t.id)) && (await c.tunnelStatus(t.id)).status === 'healthy', 'getTunnelToken + tunnelStatus');
  const w1 = await c.wafSkipRule('chibi.example.com', 'gen-chibi-abcdef01');
  const rule = cf.st.ruleset && cf.st.ruleset.rules[0];
  ok(w1.result === 'created' && rule && rule.action === 'skip' && rule.expression === CF.machineExpression('chibi.example.com') && rule.action_parameters.phases.includes('http_request_sbfm') && rule.action_parameters.products.includes('uaBlock'), 'wafSkipRule: chưa có entrypoint → PUT tạo luật skip (managed / rate limit / SBFM + uaBlock, bic…)');
  ok(/http\.host eq "chibi\.example\.com"/.test(rule.expression) && /"\/mcp"/.test(rule.expression) && /starts_with\(http\.request\.uri\.path, "\/\.well-known\/oauth-"\)/.test(rule.expression) && /"\/oauth\/token"/.test(rule.expression) && !/authorize/.test(rule.expression), 'biểu thức chỉ đúng tên miền + đường máy (/mcp, /mcp/*, /.well-known/oauth-*, /oauth/register|token|revoke) — không có /oauth/authorize');
  cf.st.ruleset.rules.push({ id: 'r-user', description: 'block bad bots', expression: 'true', action: 'block' });
  ok((await c.wafSkipRule('chibi.example.com', 'gen-chibi-abcdef01')).result === 'exists' && cf.st.ruleset.rules.length === 2, 'chạy lại → exists, không thêm luật thứ hai, luật của chủ giữ nguyên');
  const td = await c.teardown({ host: 'chibi.example.com', tunnelId: t.id, tag: 'gen-chibi-abcdef01' });
  ok(td.dns === 'deleted' && td.tunnel === 'deleted' && td.waf === 'deleted' && !td.errors.length && cf.st.ruleset.rules.length === 1 && cf.st.ruleset.rules[0].id === 'r-user' && !cf.st.dns.some(x => x.name === 'chibi.example.com'), 'teardown: xoá CNAME của mình, tunnel của mình, luật WAF của mình — luật của chủ còn');
  const wrong = CF.createCloudflare({ token: 'x'.repeat(40), base: cf.base });
  let e401 = null; try { await wrong.verify('example.com'); } catch (e) { e401 = e; }
  ok(e401 instanceof CF.CfError && e401.status === 401 && e401.cfCode === 1000 && /Invalid API Token/.test(e401.message), 'token sai → CfError 401 mang mã gốc (1000) + câu gốc');
  let bad = 0; ['', 'a b c d e f g h i j k l m n', 'x'.repeat(19), 'abc\r\nX-Evil: 1' + 'x'.repeat(30)].forEach(tk => { try { CF.createCloudflare({ token: tk, base: cf.base }); bad++; } catch (e) { /* đúng */ } });
  ok(!bad, 'token rỗng / có khoảng trắng / CRLF (chèn header) / quá ngắn bị từ chối trước khi gọi');
  const offline = CF.createCloudflare({ token: API_TOKEN, base: 'http://127.0.0.1:9/client/v4' });
  let en = null; try { await offline.zones(); } catch (e) { en = e; }
  ok(en instanceof CF.CfError && en.status === 0 && en.cfCode === 'ECONNREFUSED' && !en.message.includes(API_TOKEN), 'không tới được API → CfError status 0 + mã mạng, không chứa token');
  cf.close();
}

// ---------------------------------------------------------------- 5) đường B trọn luồng (wizard)
async function flowB(o = {}) {
  const cf = await fakeCloudflare(o.cf || {});
  // tên miền đi qua proxy Cloudflare → phân giải ra IP của Cloudflare (công khai)
  const x = await mkOnline(Object.assign({ name: 'b', cfBase: cf.base, net: { dns: { 'chibi.example.com': { a: [CF4] }, 'gc.example.org': { a: [CF4] } } } }, o.mk));
  x.cf = cf;
  return x;
}
console.log('   — đường B (Cloudflare) trọn luồng');
{
  const x = await flowB();
  const r = await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com', sub: 'chibi' }, { 'X-GC-Lang': 'vi' });
  ok(r.status === 202 && r.j && r.j.busy === true && r.j.flow.mode === 'cloudflare', 'POST /api/online/cloudflare → 202 ngay (chạy nền), busy');
  await x.idle();
  const v = await x.view();
  ok(v.flow.done && v.flow.steps.every(s => s.state === 'ok'), 'đủ 8 bậc ✓: ' + v.flow.steps.map(s => s.id + (s.state === 'ok' ? '✓' : '✗(' + s.detail + ')')).join(' '));
  ok(v.mode === 'cloudflare' && v.publicUrl === 'https://chibi.example.com' && v.domain === 'chibi.example.com', 'publicUrl chính thức https://chibi.example.com, mode cloudflare');
  const t = x.cf.st.tunnels.filter(z => !z.deleted_at);
  ok(t.length === 1 && t[0].name === 'gen-chibi-abcdef01', 'tạo đúng MỘT tunnel tên gen-chibi-<installId 8>');
  const ing = x.cf.st.configs[t[0].id].ingress;
  ok(ing.length === 2 && ing[0].hostname === 'chibi.example.com' && ing[0].service === 'http://127.0.0.1:7482' && ing[1].service === 'http_status:404', 'ingress: tên → http://127.0.0.1:<GC_PORT+2> (cổng nghe riêng) + catch-all 404');
  ok(x.cf.st.dns.some(d => d.type === 'CNAME' && d.name === 'chibi.example.com' && d.content === t[0].id + '.cfargotunnel.com' && d.proxied), 'CNAME proxied → tunnel');
  const tf = path.join(x.home, 'run', 'tunnel.token');
  ok(fs.readFileSync(tf, 'utf8') === tunnelTokenOf(t[0]) && mode(tf) === 0o600 && !fs.existsSync(path.join(x.home, 'edge', 'tunnel.token')), 'tunnel token → run/tunnel.token (0600), không nằm trong edge/ (thư mục Caddy thấy)');
  ok(JSON.stringify(JSON.parse(fs.readFileSync(path.join(x.home, 'run', 'edge-intent.json'), 'utf8'))) === '{"tunnel":"token","online":true}' && x.tl.on, 'run/edge-intent.json = {"tunnel":"token","online":true} (schema đóng) + mở cổng nghe riêng');
  ok(x.cf.st.ruleset && x.cf.st.ruleset.rules.length === 1 && x.cf.st.ruleset.rules[0].action === 'skip', 'có quyền WAF → app tự tạo luật skip cho đường máy');
  const mcpCalls = x.net.calls.probe.filter(c => /oauth-protected-resource|\/mcp$/.test(c.url));
  ok(mcpCalls.length >= 2 && mcpCalls.every(c => c.ua === 'Claude-User'), 'bậc MCP từ Internet gọi với User-Agent Claude-User');
  ok(x.net.calls.probe.length > 0 && x.net.calls.probe.every(c => c.host === 'chibi.example.com' && c.ip === CF4), 'mọi lời gọi ra ngoài chỉ tới đúng tên miền đã lưu, ghim vào IP đã kiểm');
  ok(/Không kiểm được luật chặn theo IP/.test(x.step(v, 'mcp').detail) && /160\.79\.104\.0\/21/.test(x.step(v, 'mcp').detail), 'bậc MCP ghi rõ: không bắt được luật chặn theo IP (dải Anthropic)');
  ok(v.cloudflare.tokenInMemory === false && v.cloudflare.tokenKept === false, 'xong → token API bỏ khỏi bộ nhớ, không giữ');
  const ve = await x.view('en');
  ok(ve.flow.steps.every(s => s.detail && !VI_RE.test(s.detail)) && /Agents reach MCP from the Internet/.test(x.step(ve, 'mcp').detail), 'X-GC-Lang: en → chi tiết bậc bằng tiếng Anh (bảng locales/en/server-online.json)');
  // chạy lại: idempotent
  const nPost = x.cf.writes(/\/cfd_tunnel$/).length;
  await sleep(5);
  const r2 = await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com', sub: 'chibi', confirmUrlChange: true });
  await x.idle();
  const v2 = await x.view();
  ok(r2.status === 202 && v2.flow.done && x.cf.writes(/\/cfd_tunnel$/).length === nPost && x.cf.st.tunnels.length === 1 && x.cf.st.ruleset.rules.length === 1 && x.cf.st.dns.filter(d => d.name === 'chibi.example.com').length === 1, 'chạy lại → tìm thấy tunnel theo tên, không tạo tunnel / CNAME / luật thứ hai');
  ok(/đã có/.test(x.step(v2, 'tunnel').detail) && /CNAME đã có sẵn/.test(x.step(v2, 'tunnel').detail), 'chi tiết lần hai: tunnel "đã có", CNAME "đã có sẵn"');
  // kiểm lại sau khi xong: chỉ bậc sống, không cần token — connector đọc từ run/edge-status.json của launcher (P2)
  const cfCalls = x.cf.st.log.length;
  await x.post('/api/online/recheck', {}); await x.idle();
  const vr = await x.view();
  ok(x.step(vr, 'public').state === 'running' && /Đang chờ connector/.test(x.step(vr, 'public').detail) && vr.mode === 'cloudflare' && vr.publicUrl === 'https://chibi.example.com', 'Kiểm lại sau khi xong, launcher chưa báo connector sẵn sàng → bậc public "đang chờ", KHÔNG gỡ publicUrl / mode');
  fs.writeFileSync(path.join(x.home, 'run', 'edge-status.json'), JSON.stringify({ tunnel: 'token', running: true, ready: true, since: new Date().toISOString() }));
  await x.post('/api/online/recheck', {}); await x.idle();
  ok((await x.view()).flow.steps.every(s => s.state === 'ok') && x.cf.st.log.length === cfCalls, 'edge-status ready → bậc sống (public, mcp) ✓; không một lời gọi Cloudflare API nào (không cần token)');
  // Go offline có token → dọn Cloudflare
  const off = await x.post('/api/online/off', { token: API_TOKEN });
  await x.idle();
  const vo = await x.view();
  ok(off.status === 202 && vo.mode === 'off' && vo.publicUrl === '' && vo.flow.mode === 'off' && vo.flow.steps.every(s => s.state === 'ok'), 'Go offline: mode off, publicUrl rỗng');
  ok(!x.cf.st.tunnels.some(z => !z.deleted_at) && !x.cf.st.dns.some(d => d.name === 'chibi.example.com') && x.cf.st.ruleset.rules.length === 0 && !fs.existsSync(tf) && !x.tl.on, 'Go offline có token: xoá CNAME + tunnel + luật WAF do app tạo; tunnel token cục bộ xoá; cổng riêng đóng; intent off');
  const leak = leaksOf(API_TOKEN, x);
  ok(!leak.length, 'token API không có trong log / data/online.json / mọi tệp của bản cài / mọi phản hồi' + (leak.length ? ': ' + leak.join(', ') : ''));
  x.close(); x.cf.close();
}
console.log('   — đường B: lỗi từng bậc');
{
  // zone pending / partial
  for (const [st, ty, re] of [['pending', 'full', /chưa active/], ['active', 'partial', /kiểu partial/]]) {
    const x = await flowB({ cf: { zones: [{ id: crypto.randomBytes(16).toString('hex'), name: 'example.com', status: st, type: ty }] } });
    await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await x.idle();
    const z = x.step(await x.view(), 'zone');
    ok(z.state === 'fail' && re.test(z.detail) && z.fix && !x.cf.writes(/./).length, 'zone ' + st + '/' + ty + ' → bậc zone ✗ kèm cách sửa, không ghi gì ở Cloudflare');
    x.close(); x.cf.close();
  }
  // thiếu quyền tunnel / DNS (403 từ CF)
  for (const [perm, re] of [['tunnel', /Cloudflare Tunnel › Edit/], ['dns', /DNS › Edit/]]) {
    const x = await flowB({ cf: { perms: { [perm]: false } } });
    await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await x.idle();
    const s = x.step(await x.view(), 'token');
    ok(s.state === 'fail' && /403/.test(s.detail) && /10000/.test(s.detail) && re.test(s.fix), 'thiếu quyền ' + perm + ' (403 từ CF) → bậc token ✗, chi tiết mang mã gốc 403 / 10000, cách sửa nêu đúng quyền');
    x.close(); x.cf.close();
  }
  // Zero Trust chưa bật
  {
    const x = await flowB({ cf: { zeroTrustMissing: true } });
    await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await x.idle();
    const s = x.step(await x.view(), 'tunnel');
    ok(s.state === 'fail' && /1003/.test(s.detail) && /Zero Trust/.test(s.fix), 'Zero Trust chưa bật → bậc tunnel ✗ với mã gốc + hướng dẫn bật gói Free');
    x.close(); x.cf.close();
  }
  // token sai
  {
    const x = await flowB();
    await x.post('/api/online/cloudflare', { token: 'y'.repeat(40), zone: 'example.com' }); await x.idle();
    const s = x.step(await x.view(), 'token');
    ok(s.state === 'fail' && /401/.test(s.detail) && /không hợp lệ hoặc đã hết hạn/.test(s.fix), 'token sai → 401 + "tạo token mới"');
    x.close(); x.cf.close();
  }
  // nhiều zone → chọn
  {
    const hex = () => crypto.randomBytes(16).toString('hex');
    const x = await flowB({ cf: { zones: [{ id: hex(), name: 'example.com', status: 'active', type: 'full' }, { id: hex(), name: 'example.org', status: 'active', type: 'full' }] } });
    await x.post('/api/online/cloudflare', { token: API_TOKEN }); await x.idle();
    const v = await x.view();
    ok(x.step(v, 'token').state === 'fail' && JSON.stringify(v.flow.choices) === '["example.com","example.org"]' && v.cloudflare.tokenInMemory, 'không nói zone, token thấy 2 zone → trả danh sách để chọn; token vẫn trong bộ nhớ (phiên wizard)');
    await sleep(5);
    await x.post('/api/online/cloudflare', { zone: 'example.org', sub: 'gc' }); await x.idle();
    const v2 = await x.view();
    ok(v2.flow.done && v2.publicUrl === 'https://gc.example.org', 'gửi lại zone (không gửi lại token) → dùng token trong bộ nhớ, xong với gc.example.org');
    x.close(); x.cf.close();
  }
}
// CNAME xung đột: không đè cho tới khi chủ xác nhận
async function conflictCase(createOnline, createCloudflare) {
  const x = await flowB({ cf: { dns: [{ type: 'A', name: 'chibi.example.com', content: '45.33.32.156' }] }, mk: { createOnline, createCloudflare } });
  await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com', sub: 'chibi' }); await x.idle();
  const v = await x.view(), dnsWrites = x.cf.writes(/dns_records/).length;
  const r = { x, v, dnsWrites, aStill: x.cf.st.dns.some(d => d.type === 'A' && d.name === 'chibi.example.com'), needs: v.flow.needs };
  return r;
}
console.log('   — đường B: CNAME đã có → hỏi, không đè');
{
  const c = await conflictCase();
  const z = c.x.step(c.v, 'zone');
  ok(z.state === 'fail' && c.needs === 'confirm' && c.v.flow.conflicts[0].type === 'A' && /A 45\.33\.32\.156/.test(z.detail) && c.dnsWrites === 0 && c.aStill && !c.v.flow.done, 'tên con có bản ghi A → bậc zone ✗, needs = confirm, liệt kê bản ghi, KHÔNG ghi DNS');
  const no = await c.x.post('/api/online/cloudflare/confirm', { overwriteCname: false });
  ok(no.status === 200 && no.j.flow.needs === null && c.x.cf.writes(/dns_records/).length === 0, 'chủ chọn không đè → không ghi gì');
  c.x.step(no.j, 'zone');
  const z409 = await c.x.post('/api/online/cloudflare/confirm', { overwriteCname: true });
  ok(z409.status === 409, 'không còn gì chờ xác nhận → 409');
  await c.x.post('/api/online/recheck', {}); await c.x.idle();
  const yes = await c.x.post('/api/online/cloudflare/confirm', { overwriteCname: true }); await c.x.idle();
  const v = await c.x.view();
  ok(yes.status === 202 && v.flow.done && !c.x.cf.st.dns.some(d => d.type === 'A' && d.name === 'chibi.example.com') && c.x.cf.st.dns.some(d => d.type === 'CNAME' && d.name === 'chibi.example.com') && /đã thay bản ghi cũ bằng CNAME/.test(c.x.step(v, 'tunnel').detail), 'chủ xác nhận đè → xoá bản ghi A, tạo CNAME, luồng chạy tiếp tới xong');
  c.x.close(); c.x.cf.close();
}
console.log('   — đường B: WAF có / không quyền');
{
  const x = await flowB({ cf: { perms: { waf: false } } });
  await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await x.idle();
  const v = await x.view(), w = x.step(v, 'waf');
  ok(w.state === 'fail' && w.manual === true && /Skip/.test(w.fix) && w.fix.includes('http.host eq "chibi.example.com"') && !v.flow.done && x.step(v, 'token').detail.includes('không có quyền WAF'), 'token không có quyền WAF → bậc WAF ✗ BẮT BUỘC kèm biểu thức để dán tay (không còn "tuỳ chọn")');
  ok(v.publicUrl === '', '✗ sau khi publicUrl bật tạm → publicUrl trả về giá trị cũ (rỗng)');
  await sleep(5);
  await x.post('/api/online/recheck', { confirmManual: 'waf' }); await x.idle();
  const v2 = await x.view();
  ok(v2.flow.done && /xác nhận đã tạo luật Skip bằng tay/.test(x.step(v2, 'waf').detail) && v2.publicUrl === 'https://chibi.example.com', 'chủ bấm "Tôi đã làm" → bậc WAF ✓ (ghi rõ làm tay), luồng xong (token còn trong bộ nhớ của phiên)');
  x.close(); x.cf.close();
  const y = await flowB({ cf: { perms: { wafWrite: false } } });
  await y.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await y.idle();
  const wy = y.step(await y.view(), 'waf');
  ok(wy.state === 'fail' && wy.manual === true, 'đọc được ruleset nhưng ghi bị 403 → needs_manual, không ném');
  y.close(); y.cf.close();
  const z = await flowB();
  z.cf.st.ruleset = { id: 'rs-bad', phase: 'http_request_firewall_custom', rules: [] };
  const origPost = z.cf.srv.listeners('request')[0];
  z.cf.srv.removeAllListeners('request');
  z.cf.srv.on('request', (req, res) => { if (req.method === 'POST' && /\/rulesets\/rs-bad\/rules$/.test(req.url)) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, errors: [{ code: 20120, message: 'not entitled to skip phase http_request_sbfm' }], result: null })); } origPost(req, res); });
  await z.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await z.idle();
  const wz = z.step(await z.view(), 'waf');
  ok(wz.state === 'fail' && wz.manual === true && /400/.test(wz.detail) && /20120/.test(wz.detail) && /Skip/.test(wz.fix), 'Cloudflare từ chối luật (400, vd gói không cho skip một pha) → làm tay + "Tôi đã làm", chi tiết mang mã gốc');
  z.close(); z.cf.close();
}
console.log('   — đường B: giữ token (mã hoá) · Go offline không token');
{
  const x = await flowB();
  await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com', keepToken: true }); await x.idle();
  const v = await x.view();
  ok(v.flow.done && v.cloudflare.tokenKept && !v.cloudflare.tokenInMemory && x.secrets.get('cloudflareApiToken') === API_TOKEN && !leaksOf(API_TOKEN, x).length, 'keepToken → token nằm trong kho bí mật AES-GCM (không có dạng rõ ở tệp nào), bộ nhớ đã bỏ');
  await x.post('/api/online/off', {}); await x.idle();
  ok(!x.cf.st.tunnels.some(z => !z.deleted_at) && !x.secrets.get('cloudflareApiToken'), 'Go offline dùng token đã giữ để dọn, rồi xoá luôn token đã giữ');
  x.close(); x.cf.close();
  const y = await flowB();
  await y.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await y.idle();
  await sleep(5);
  await y.post('/api/online/off', {}); await y.idle();
  const r = y.step(await y.view(), 'remote');
  ok(r.state === 'fail' && r.manual && /vẫn còn ở Cloudflare/.test(r.detail) && y.cf.st.tunnels.some(z => !z.deleted_at), 'Go offline không có token → cục bộ tắt, bậc Cloudflare ✗ nói rõ tunnel + CNAME còn lại và cách xoá');
  await sleep(5);
  await y.post('/api/online/off', { token: API_TOKEN }); await y.idle();
  ok(y.step(await y.view(), 'remote').state === 'ok' && !y.cf.st.tunnels.some(z => !z.deleted_at), 'Go offline lần nữa kèm token → dọn được (tài nguyên nhớ ở cfResources)');
  y.close(); y.cf.close();
}

// ---------------------------------------------------------------- 6) đường A (Caddy) với DNS / IP / mạng giả + admin giả
async function flowA(o = {}) {
  const x = await mkOnline(Object.assign({ name: 'a', net: Object.assign({ dns: { 'chibi.example.com': { a: [PUB4] } } }, o.net) }, o.mk));
  const edgeDir = path.join(x.home, 'edge');
  x.adm = await fakeCaddyAdmin(edgeDir);
  fs.mkdirSync(path.join(edgeDir, 'conf'), { recursive: true }); fs.writeFileSync(path.join(edgeDir, 'conf', 'Caddyfile'), ROOT_CADDYFILE);
  if (o.enabled !== false) fs.writeFileSync(path.join(edgeDir, 'caddy.enabled'), '');
  return x;
}
console.log('   — đường A (Caddy)');
{
  const x = await flowA();
  const r = await x.post('/api/online/caddy', { domain: 'chibi.example.com' });
  await x.idle();
  const v = await x.view();
  ok(r.status === 202 && v.flow.done && v.flow.steps.every(s => s.state === 'ok') && v.mode === 'caddy' && v.publicUrl === 'https://chibi.example.com', 'đủ 7 bậc ✓: ' + v.flow.steps.map(s => s.id + (s.state === 'ok' ? '✓' : '✗(' + s.detail + ')')).join(' '));
  const sites = fs.readFileSync(path.join(x.home, 'edge', 'conf', 'sites.caddy'), 'utf8'), nonce = x.online._flow().nonce;
  ok(sites.includes('https://chibi.example.com {') && sites.includes('respond "' + nonce + '" 200') && x.adm.calls.some(c => c.p === '/load' && c.body === ROOT_CADDYFILE), 'sites.caddy cho đúng tên + nonce của luồng; nạp lại qua admin kèm Caddyfile gốc');
  ok(/^[a-f0-9]{64}$/.test(fs.readFileSync(path.join(x.home, 'edge', 'conf', 'edge-secret'), 'utf8').trim()) && mode(path.join(x.home, 'edge', 'conf', 'edge-secret')) === 0o600, 'bật Caddy → sinh edge/conf/edge-secret (0600)');
  ok(x.net.calls.probe.some(c => c.url === 'http://chibi.example.com/.well-known/gen-chibi-check/' + nonce) && /hết hạn 2027-01-18/.test(x.step(v, 'cert').detail), 'bậc cổng gọi http://tên/.well-known/gen-chibi-check/<nonce>; bậc chứng chỉ báo hạn');
  ok(x.net.calls.probe.every(c => c.host === 'chibi.example.com' && c.ip === PUB4), 'mọi lời gọi chỉ tới tên miền đã lưu, ghim IP đã kiểm');
  x.close(); x.adm.close();
}
console.log('   — đường A: DNS / IP / cổng / chứng chỉ');
{
  const cases = [
    ['IP Cloudflare (đám mây cam)', { net: { dns: { 'chibi.example.com': { a: ['104.21.3.4'] } } } }, 'domain', s => /IP của Cloudflare/.test(s.detail) && /DNS only/.test(s.fix) && /đường Cloudflare/.test(s.fix)],
    ['A record sai', { net: { dns: { 'chibi.example.com': { a: ['46.1.2.3'] } } } }, 'domain', s => s.detail.includes('46.1.2.3') && s.detail.includes(PUB4) && s.fix.includes('chibi.example.com → ' + PUB4)],
    ['chưa có bản ghi', { net: { dns: {} } }, 'domain', s => /chưa có bản ghi A/.test(s.detail) && s.fix.includes(PUB4)],
    ['AAAA mà máy không có IPv6', { net: { dns: { 'chibi.example.com': { a: [PUB4], aaaa: [PUB6] } } } }, 'domain', s => /AAAA/.test(s.detail) && /Xoá bản ghi AAAA/.test(s.fix)],
    ['AAAA sai', { net: { dns: { 'chibi.example.com': { a: [PUB4], aaaa: ['2600::1'] } }, pub: { v4: PUB4, v6: PUB6 } } }, 'domain', s => s.detail.includes('2600::1') && s.detail.includes(PUB6)],
    ['edge chưa publish', { enabled: false }, 'edge', s => /chưa chạy/.test(s.detail) && s.fix === 'Chạy một lệnh trên máy chủ: genchibi online --caddy'],
    ['bản native', { mk: { inDocker: false } }, 'edge', s => /chỉ có ở bản cài Docker/.test(s.detail)],
    ['cổng 80 không tới', { net: { port: false } }, 'port', s => /cổng 80/.test(s.detail) && /security group/.test(s.fix)],
    ['chứng chỉ staging', { net: { tls: { ok: true, authorized: false, matches: true, issuer: '(STAGING) Let\'s Encrypt · (STAGING) Ersatz Edamame E1', staging: true, validTo: '' } } }, 'cert', s => s.state === 'running' && /staging/.test(s.detail)]
  ];
  for (const [name, o, id, pred] of cases) {
    const x = await flowA(o);
    await x.post('/api/online/caddy', { domain: 'chibi.example.com' }); await x.idle();
    const v = await x.view(), s = x.step(v, id);
    const exp = id === 'cert' ? 'running' : 'fail';
    ok(s.state === exp && pred(s) && !v.flow.done && v.publicUrl === '', name + ' → bậc ' + id + ' ' + (exp === 'fail' ? '✗' : '…') + ' rõ ràng (' + s.detail + ' | ' + s.fix + ')');
    x.close(); x.adm.close();
  }
  // chứng chỉ chờ quá lâu → ✗ liệt kê nguyên nhân (không xin lại)
  const y = await flowA({ net: { tls: { ok: false, error: 'ECONNRESET' } }, mk: { waits: { certFailMs: 0 } } });
  await y.post('/api/online/caddy', { domain: 'chibi.example.com' }); await y.idle(); await sleep(5);
  await y.post('/api/online/recheck', {}); await y.idle();
  const sc = y.step(await y.view(), 'cert');
  ok(sc.state === 'fail' && /tường lửa/.test(sc.fix) && /AAAA/.test(sc.fix) && /proxy cam/.test(sc.fix) && /không cần xin lại/.test(sc.fix) && y.adm.calls.filter(c => c.p === '/load').length === 1, 'chứng chỉ quá hạn chờ → ✗ liệt kê tường lửa / AAAA / proxy cam; Kiểm lại không nạp lại Caddy, app không bao giờ xin cert');
  y.close(); y.adm.close();
}
console.log('   — chống thành công cụ quét (CNS-180) + publicUrl tạm');
{
  // tên miền trỏ về địa chỉ nội bộ → ✗, không một lời gọi nào ra ngoài
  for (const ip of ['169.254.169.254', '127.0.0.1', '10.1.2.3', '192.168.1.10', '::1', 'fd00::1']) {
    const fam6 = ip.includes(':');
    const x = await flowA({ net: { dns: { 'chibi.example.com': fam6 ? { aaaa: [ip] } : { a: [ip] } } } });
    await x.post('/api/online/caddy', { domain: 'chibi.example.com' }); await x.idle();
    const s = x.step(await x.view(), 'domain');
    ok(s.state === 'fail' && /địa chỉ nội bộ/.test(s.detail) && x.net.calls.probe.length === 0, 'tên miền → ' + ip + ': từ chối, không gọi ra');
    x.close(); x.adm.close();
  }
  // DNS đổi giữa các bậc (rebinding): bậc tên miền thấy IP công khai, tới bậc chứng chỉ phân giải ra IP nội bộ → ✗, KHÔNG nối TLS
  for (const ip of ['127.0.0.1', '10.0.0.5', '::1']) {
    const x = await flowA({ net: { tls: { ok: false, error: 'ECONNRESET' } } });
    let tlsCalls = 0;
    await x.post('/api/online/caddy', { domain: 'chibi.example.com' }); await x.idle();   // dừng ở bậc cert (chờ)
    x.netSwap({ 'chibi.example.com': ip.includes(':') ? { aaaa: [ip] } : { a: [ip] } }, () => { tlsCalls++; });
    await sleep(5); await x.post('/api/online/recheck', {}); await x.idle();
    const s = x.step(await x.view(), 'cert');
    ok(s.state === 'fail' && /địa chỉ nội bộ/.test(s.detail) && tlsCalls === 0, 'rebinding ở bậc chứng chỉ → ' + ip + ': ✗, không nối TLS');
    x.close(); x.adm.close();
  }
  ok(['169.254.169.254', '100.64.1.1', '::ffff:10.0.0.1', 'fe80::1', '0.0.0.0'].every(ip => !ONLINE.isPublicIp(ip)) && [PUB4, PUB6, '1.1.1.1'].every(ONLINE.isPublicIp), 'isPublicIp: link-local / CGNAT / IPv4-mapped / unspecified bị coi là nội bộ');
  ok(ONLINE.isCloudflareIp('104.21.3.4') && ONLINE.isCloudflareIp('2606:4700::1') && !ONLINE.isCloudflareIp(PUB4), 'dải IP Cloudflare (cloudflare.com/ips, kiểm 2026-10-20)');
  // publicUrl tạm → lỗi giữa chừng (MCP bị chặn theo UA) → trả về giá trị cũ
  const x = await flowA({ net: { blockUA: true }, mk: { publicUrl: 'https://old.example.org' } });
  const r0 = await x.post('/api/online/caddy', { domain: 'chibi.example.com' });
  ok(r0.status === 409 && r0.j.needs === 'urlChange' && r0.j.from === 'https://old.example.org', 'đổi địa chỉ công khai khi đang có → 409 hỏi trước (agent đã nối sẽ phải nối lại)');
  await sleep(5);
  await x.post('/api/online/caddy', { domain: 'chibi.example.com', confirmUrlChange: true }); await x.idle();
  const v = await x.view(), m = x.step(v, 'mcp');
  ok(m.state === 'fail' && /403/.test(m.detail) && /Claude-User/.test(m.detail) && /160\.79\.104\.0\/21/.test(m.fix), 'Claude-User bị chặn (403) → bậc MCP ✗ kèm dải IP Anthropic + nguồn');
  ok(v.publicUrl === 'https://old.example.org' && x.step(v, 'public').state === 'pending' && /trả về giá trị cũ/.test(x.step(v, 'public').detail) && JSON.parse(fs.readFileSync(path.join(x.dataDir, 'online.json'), 'utf8')).publicUrlPending === '', 'publicUrl bật tạm → lỗi giữa chừng → về giá trị cũ; bậc public sẽ chạy lại');
  x.close(); x.adm.close();
  // trần tần suất
  const y = await flowA({ mk: { rate: { minGapMs: 60000, perHour: 100 } } });
  const a1 = await y.post('/api/online/caddy', { domain: 'chibi.example.com' }); await y.idle();
  const a2 = await y.post('/api/online/recheck', {});
  ok(a1.status === 202 && a2.status === 429 && +a2.h.get('retry-after') > 0, 'trần tần suất: lệnh thứ hai trong khoảng cách tối thiểu → 429 + Retry-After');
  y.close(); y.adm.close();
}
console.log('   — route: quyền chủ, kiểm đầu vào, máy kế thừa');
{
  const x = await mkOnline({ name: 'r' });
  const n1 = await x.call('GET', '/api/online', undefined, { Authorization: '' });
  const n2 = await x.post('/api/online/caddy', { domain: 'chibi.example.com' }, { Authorization: 'Bearer nope' });
  ok(n1.status === 403 && n2.status === 403 && !fs.existsSync(path.join(x.dataDir, 'online.json')), 'không phải chủ (isOwner — P1) → 403 cả GET lẫn POST, không ghi gì');
  for (const d of ['a.com\n}', '*.x.com', '1.2.3.4', 'a'.repeat(254)]) {
    const r = await x.post('/api/online/caddy', { domain: d });
    ok(r.status === 400 && /tên miền không hợp lệ/.test(r.j.error), 'POST caddy ' + JSON.stringify(d.slice(0, 20)) + ' → 400');
  }
  const bt = await x.post('/api/online/cloudflare', { token: 'abc\r\ndef' + 'x'.repeat(30) });
  const bs = await x.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com', sub: 'a.b' });
  ok(bt.status === 400 && bs.status === 400 && !bs.t.includes(API_TOKEN), 'token sai dạng / tên con nhiều nhãn → 400 (phản hồi không chép token)');
  const nf = await x.post('/api/online/nope', {});
  ok(nf.status === 404, 'đường lạ → 404');
  const { TOOLS } = require('../server/mcp');
  const hit = TOOLS.filter(t => /online|edge|tunnel|cloudflare|caddy|public.?url|dns/i.test(t.name));
  ok(TOOLS.length > 10 && !hit.length && !fs.readFileSync(path.join(ROOT, 'server', 'mcp.js'), 'utf8').includes('/api/online'), 'CNS-180: không tool MCP nào điều khiển Go online (agent / dock AI không gọi được — chỉ chủ máy qua /api/online)' + (hit.length ? ': ' + hit.map(t => t.name).join(', ') : ''));
  x.close();
  const l = await mkOnline({ name: 'l', legacy: true });
  const r = await l.post('/api/online/quick', {});
  ok(r.status === 409 && r.j.needs === 'legacy', 'máy kế thừa (.env có GC_PUBLIC_URL / GC_ALLOWED_HOSTS) → 409, không trộn cấu hình');
  l.close();
}
console.log('   — proxy riêng + link tạm');
{
  const x = await mkOnline({ name: 'p', net: { dns: { 'chibi.example.com': { a: ['104.21.3.4'] } }, xff: false } });
  await x.post('/api/online/proxy', { domain: 'chibi.example.com' }); await x.idle();
  const v = await x.view(), pb = x.step(v, 'public');
  ok(x.step(v, 'domain').state === 'ok' && pb.state === 'fail' && /X-Forwarded-For/.test(pb.detail) && /proxy_set_header X-Forwarded-For \$remote_addr/.test(pb.fix) && v.publicUrl === '', 'proxy riêng: request công khai không mang XFF → ✗ kèm dòng cấu hình cần thêm; publicUrl trả về cũ');
  ok(v.snippets && v.snippets.caddy.includes('chibi.example.com {') && v.snippets.caddy.includes('@machine path /mcp /mcp/* /.well-known/oauth-* /.well-known/gen-chibi-check/* /oauth/register /oauth/token /oauth/revoke') && v.snippets.nginx.includes('|\\.well-known/gen-chibi-check/[a-f0-9]{32}|') && v.snippets.nginx.includes('server_name chibi.example.com;') && /location ~ \^\/\(mcp/.test(v.snippets.nginx) && !/authorize/.test(v.snippets.nginx.split('location /')[0]), 'đoạn cấu hình mẫu Caddy + nginx: đường máy đi thẳng (không có /oauth/authorize), đường người chừa chỗ đăng nhập riêng');
  // trang kiểm của app: đúng nonce mới trả lời
  const sendR = []; const fakeRes = {}; const send = (res, code, b) => sendR.push({ code, b });
  const nonce = x.online._flow().nonce;
  x.online.checkRoute({ headers: { 'x-forwarded-for': '1.2.3.4' } }, fakeRes, '/.well-known/gen-chibi-check/' + nonce, send);
  x.online.checkRoute({ headers: {} }, fakeRes, '/.well-known/gen-chibi-check/' + 'f'.repeat(32), send);
  ok(sendR[0].code === 200 && sendR[0].b.forwarded === true && sendR[1].code === 404, '/.well-known/gen-chibi-check: đúng nonce → 200 { forwarded }, sai nonce → 404');
  x.close();
  const y = await mkOnline({ name: 'p2', net: { dns: { 'chibi.example.com': { a: [PUB4] } } } });
  await y.post('/api/online/proxy', { domain: 'chibi.example.com' }); await y.idle();
  const vy = await y.view();
  ok(vy.flow.done && vy.mode === 'proxy' && JSON.parse(fs.readFileSync(path.join(y.dataDir, 'online.json'), 'utf8')).clientIpHeader === 'x-forwarded-for', 'proxy có XFF → xong, mode proxy, clientIpHeader = x-forwarded-for (gắn với mode)');
  y.close();
  const q = await mkOnline({ name: 'q', net: { dns: { 'abc-def-ghi.trycloudflare.com': { a: ['104.16.1.1'] } } } });
  fs.mkdirSync(path.join(q.home, 'run'), { recursive: true });
  fs.writeFileSync(path.join(q.home, 'run', 'edge-status.json'), JSON.stringify({ tunnel: 'quick', running: true, ready: true, since: 'x', url: 'https://abc-def-ghi.trycloudflare.com' }));
  await q.post('/api/online/quick', {}); await q.idle();
  const vq = await q.view();
  ok(vq.flow.done && vq.publicUrl === 'https://abc-def-ghi.trycloudflare.com' && vq.edge.intent === 'quick' && q.tl.on && /đổi mỗi lần khởi động/.test(q.step(vq, 'tunnel').detail), 'link tạm: intent quick + cổng riêng mở, URL đọc từ run/edge-status.json, bậc ghi rõ "đổi mỗi lần khởi động"');
  q.close();
  const qu = await mkOnline({ name: 'qu' });
  fs.mkdirSync(path.join(qu.home, 'run'), { recursive: true });
  fs.writeFileSync(path.join(qu.home, 'run', 'edge-status.json'), JSON.stringify({ tunnel: 'quick', running: false, ready: false, since: 'x', error: 'ingress-unverified' }));
  await qu.post('/api/online/quick', {}); await qu.idle();
  const vu = await qu.view(), su = qu.step(vu, 'tunnel');
  ok(su.state === 'fail' && /127\.0\.0\.1:7482/.test(su.detail) && /ss -ltnp/.test(su.fix) && !vu.flow.done, 'launcher báo ingress-unverified tới hết hạn chờ → bậc tunnel ✗ nói rõ cổng 7482 bị tiến trình khác giữ + cách sửa');
  qu.close();
}

// ---------------------------------------------------------------- 7) rào ngược: đột biến → test phải đỏ
console.log('   — rào ngược (đột biến)');
function mutated(file, from, to) {
  const src = fs.readFileSync(path.join(ROOT, 'server', file), 'utf8');
  if (!src.includes(from)) throw new Error('mốc đột biến không còn trong ' + file + ': ' + from);
  const out = src.split(from).join(to).replace(/require\('\.\/([a-z0-9-]+)'\)/g, (m, n) => 'require(' + JSON.stringify(path.join(ROOT, 'server', n)) + ')');
  const f = path.join(tmp('mut'), file); fs.writeFileSync(f, out);
  return require(f);
}
{
  const M1 = mutated('caddy.js', "if (!HOST_RE.test(s) || net.isIP(s) || LOCAL_SUFFIX.test(s)) return '';", "if (!s) return '';");
  ok(badDomainFailures(M1).length > 0, 'bỏ regex hostname → bộ tên xấu ĐỎ (' + badDomainFailures(M1).length + ' ca lọt)');
  const M2 = mutated('cloudflare.js', "if (others.length && !overwrite) return { result: 'conflict', records: others.map(brief) };", '');
  const M2o = mutated('online.js', 'if (conflicts.length && !cf.overwrite) {', 'if (false) {');
  const c = await conflictCase(M2o.createOnline, M2.createCloudflare);
  ok(c.dnsWrites > 0 && !c.aStill, 'cho đè CNAME (bỏ hai rào) → ca xung đột ĐỎ: ' + c.dnsWrites + ' lần ghi DNS, bản ghi A của chủ bị xoá');
  c.x.close(); c.x.cf.close();
  const M5 = mutated('online.js', 'const v = await vetted(flow.domain), ip = v.ip;', 'const r0 = await lookup(flow.domain), v = { ip: r0.a[0] || r0.aaaa[0] }, ip = v.ip;');
  {
    const x = await flowA({ net: { tls: { ok: false, error: 'ECONNRESET' } }, mk: { createOnline: M5.createOnline } });
    let tlsCalls = 0;
    await x.post('/api/online/caddy', { domain: 'chibi.example.com' }); await x.idle();
    x.netSwap({ 'chibi.example.com': { a: ['127.0.0.1'] } }, () => { tlsCalls++; });
    await sleep(5); await x.post('/api/online/recheck', {}); await x.idle();
    ok(tlsCalls > 0, 'bỏ rào IP ở bậc chứng chỉ → ca rebinding ĐỎ (app nối TLS tới 127.0.0.1)');
    x.close(); x.adm.close();
  }
  const M3 = mutated('online.js', 'mem = { token: tok, at: d.now(), keep: b.keepToken === true };', "mem = { token: tok, at: d.now(), keep: b.keepToken === true }; d.log('[online] cloudflare token ' + tok);");
  const x3 = await flowB({ mk: { createOnline: M3.createOnline } });
  await x3.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await x3.idle();
  ok(leaksOf(API_TOKEN, x3).includes('log'), 'ghi token ra log → kiểm rò rỉ ĐỎ');
  x3.close(); x3.cf.close();
  const M4 = mutated('online.js', "cf: { zone, sub, overwrite: false }", 'cf: { zone, sub, overwrite: false, t: tok }');
  const x4 = await flowB({ mk: { createOnline: M4.createOnline } });
  await x4.post('/api/online/cloudflare', { token: API_TOKEN, zone: 'example.com' }); await x4.idle();
  ok(leaksOf(API_TOKEN, x4).some(w => /online\.json/.test(w)), 'lưu token vào luồng → kiểm rò rỉ ĐỎ (data/online.json)');
  x4.close(); x4.cf.close();
}

// ---------------------------------------------------------------- 7b) online-config (P1) — API ghi mà online.js dùng: set(patch)
console.log('   — online-config: set(patch) cho máy trạng thái');
{
  const dir = tmp('cfg'), c = new OnlineConfig({ dir, env: {} });
  const r1 = c.set({ mode: 'tunnel', domain: 'chibi.example.com', clientIpHeader: '', flow: { mode: 'cloudflare', steps: [] }, cfResources: { tunnelId: 't1' } });
  const g = c.get();
  ok(r1.ok && g.mode === 'tunnel' && g.domain === 'chibi.example.com' && g.flow.mode === 'cloudflare' && g.cfResources.tunnelId === 't1' && c.hostAllowed('chibi.example.com'), 'set ghi nông mode / domain / flow / cfResources một lần; domain thành Host được phép');
  const bad = [c.set({ mode: 'cloudflare' }), c.set({ publicUrl: 'https://evil.example.com' }), c.set({ flow: [1] }), c.set({ nope: 1 }), c.set({ domain: 'a.com\n}' }), c.set({ clientIpHeader: 'x-evil' })];
  ok(bad.every(x => x.ok === false) && c.get().mode === 'tunnel', 'set từ chối mode lạ, publicUrl khác rỗng (phải qua setPending → commit), flow không phải đối tượng, khoá lạ, domain / header xấu — không ghi gì');
  c.setPending('https://chibi.example.com', { force: true }); c.commit();
  const r2 = c.set({ mode: 'off', domain: '', publicUrl: '' });
  ok(r2.ok && c.get().publicUrl === '' && c.get().publicUrlPending === '' && c.publicUrl() === '' && c.get().flow.mode === 'cloudflare', 'set({ publicUrl: "" }) = Go offline: bỏ cả bản chính thức lẫn bản tạm, giữ flow');
  const e = new OnlineConfig({ dir: tmp('cfg2'), env: { publicUrl: 'https://legacy.example.com' } });
  ok(e.set({ flow: {} }).ok === false && e.get().readOnly === true, '.env kế thừa (chỉ đọc) → set từ chối');
}

// ---------------------------------------------------------------- 8) server thật: cổng nghe riêng + route + token không lọt
console.log('   — server thật (main.js): cổng thứ hai, quyền, token');
{
  const OWNER = 'owner-' + crypto.randomBytes(12).toString('hex');
  const kids = [];
  process.on('exit', () => kids.forEach(k => { try { k.kill(); } catch (e) { /* đã tắt */ } }));
  function spawnServer(port, pre, extraEnv) {
    const home = tmp('srv');
    pre(home);
    // HTTPS_PROXY trỏ cổng đóng: mọi lời gọi Cloudflare API thật (nếu có) chết ngay — test không bao giờ chạm Cloudflare
    const c = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: home, GC_PORT: String(port), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: OWNER, GC_PUBLIC_URL: '', GC_ALLOWED_HOSTS: '', HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: '', NO_PROXY: '', no_proxy: '' }, extraEnv || {}), stdio: ['ignore', 'pipe', 'pipe'] });
    kids.push(c);
    let log = ''; c.stdout.on('data', d => { log += d; }); c.stderr.on('data', d => { log += d; });
    return { home, c, log: () => log, base: 'http://127.0.0.1:' + port, tbase: 'http://127.0.0.1:' + (port + 2) };
  }
  async function ready(s) { for (let i = 0; i < 100; i++) { try { const r = await fetch(s.base + '/api/health'); if (r.ok) return true; } catch (e) { /* chưa lên */ } await sleep(100); } throw new Error('server không lên: ' + s.log()); }
  const portOpen = port => new Promise(r => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
  let secret = '';
  const NONCE = crypto.randomBytes(32).toString('hex');
  const A = spawnServer(7761, home => {
    fs.mkdirSync(path.join(home, 'run'), { recursive: true }); fs.mkdirSync(path.join(home, 'edge', 'conf'), { recursive: true });
    fs.writeFileSync(path.join(home, 'run', 'edge-intent.json'), '{"tunnel":"token"}');
    secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(path.join(home, 'edge', 'conf', 'edge-secret'), secret + '\n', { mode: 0o600 });
  }, { GC_INGRESS_NONCE: NONCE });
  const B = spawnServer(7771, () => {});
  await ready(A); await ready(B);
  for (let i = 0; i < 50 && !(await portOpen(7763)); i++) await sleep(50);
  const own = { Authorization: 'Bearer ' + OWNER };
  const get = async (base, h) => { const r = await fetch(base + '/api/online', { headers: Object.assign({}, own, h) }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const t1 = await get(A.tbase, { 'Cf-Connecting-Ip': '8.8.4.4', 'X-Forwarded-For': '1.1.1.1' });
  ok(t1.status === 200 && t1.j.request.edge === 'tunnel' && t1.j.request.ip === '8.8.4.4', 'intent tunnel=token → cổng GC_PORT+2 nghe ở 127.0.0.1; request trên đó: gcEdge = tunnel, IP = Cf-Connecting-Ip');
  const m1 = await get(A.base, { 'Cf-Connecting-Ip': '8.8.4.4' });
  ok(m1.status === 200 && m1.j.request.edge === null && m1.j.request.ip === null, 'cổng chính: Cf-Connecting-Ip giả KHÔNG đổi IP khách, không phải tunnel');
  const c1 = await get(A.base, { 'X-GC-Edge': secret, 'X-Forwarded-For': '1.2.3.4, 9.9.9.9' });
  const c2 = await get(A.base, { 'X-GC-Edge': 'f'.repeat(64), 'X-Forwarded-For': '9.9.9.9' });
  ok(c1.j.request.edge === 'caddy' && c1.j.request.ip === '9.9.9.9' && c2.j.request.edge === null, 'X-GC-Edge đúng bí mật → caddy + mục cuối XFF; sai → không phải caddy');
  // chứng minh cổng ingress cho launcher (thách thức-đáp HMAC(GC_INGRESS_NONCE, "ingress:" + challenge)) — chỉ trên cổng ingress, chỉ /api/health
  const chal = crypto.randomBytes(16).toString('hex'), want = crypto.createHmac('sha256', NONCE).update('ingress:' + chal).digest('hex');
  const ih = await fetch(A.tbase + '/api/health', { headers: { 'X-GC-Ingress-Challenge': chal } });
  const im = await fetch(A.base + '/api/health', { headers: { 'X-GC-Ingress-Challenge': chal } });
  const inc = await fetch(A.tbase + '/api/health');
  const io = await fetch(A.tbase + '/api/info', { headers: { 'X-GC-Ingress-Challenge': chal } });
  ok(ih.status === 200 && ih.headers.get('x-gc-ingress') === want && !im.headers.get('x-gc-ingress') && !inc.headers.get('x-gc-ingress') && !io.headers.get('x-gc-ingress'),
    'cổng ingress: /api/health + challenge → X-GC-Ingress = HMAC(nonce, challenge); cổng chính / thiếu challenge / đường khác → không có');
  ok(!A.log().includes(NONCE), 'GC_INGRESS_NONCE không vào log của app');
  // /.well-known/gen-chibi-check đi trước rào Host (tên miền của luồng chưa là Host được phép lúc kiểm cổng)
  const wh = await fetch(A.base + '/.well-known/gen-chibi-check/' + 'b'.repeat(32), { headers: { Host: 'chibi.example.com' } });
  ok(wh.status === 404 && /không tìm thấy|not found/i.test(await wh.text()), 'gen-chibi-check với Host lạ → tới route (404 nonce lạ), không phải 403 Host');
  ok(!(await portOpen(7773)), 'không bật tunnel → cổng GC_PORT+2 không mở (không giành cổng của dịch vụ khác)');
  const u1 = await fetch(A.base + '/api/online');
  const u2 = await fetch(A.base + '/api/online/caddy', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, own), body: '{"domain":"chibi.example.com"}' });
  const u3 = await fetch(A.base + '/api/online/caddy', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'X-GC-Request': '1' }, own), body: JSON.stringify({ domain: 'a.com\n}' }) });
  ok(u1.status === 401 && u2.status === 403 && u3.status === 400, 'qua main.js: không token → 401; thiếu X-GC-Request → 403; tên miền xấu → 400');
  const wk = await fetch(A.base + '/.well-known/gen-chibi-check/' + 'a'.repeat(32));
  ok(wk.status === 404, '/.well-known/gen-chibi-check với nonce lạ → 404');
  const hdr = Object.assign({ 'Content-Type': 'application/json', 'X-GC-Request': '1' }, own);
  const texts = [];
  const pc = await fetch(B.base + '/api/online/cloudflare', { method: 'POST', headers: hdr, body: JSON.stringify({ token: API_TOKEN, zone: 'example.com' }) });
  texts.push(await pc.text());
  let vb = null;
  for (let i = 0; i < 100; i++) { const r = await fetch(B.base + '/api/online', { headers: own }); const t = await r.text(); texts.push(t); vb = JSON.parse(t); if (!vb.busy) break; await sleep(100); }
  const tk = vb.flow.steps.find(s => s.id === 'token');
  ok(pc.status === 202 && tk.state === 'fail' && /Cloudflare API/.test(tk.detail), 'POST cloudflare → 202, chạy nền; API không tới được → bậc token ✗ (không gọi Cloudflare thật)');
  const leakB = [];
  if (B.log().includes(API_TOKEN)) leakB.push('log server');
  if (texts.some(t => t.includes(API_TOKEN))) leakB.push('phản hồi');
  walk(B.home).forEach(f => { if (fs.readFileSync(f).includes(API_TOKEN)) leakB.push(path.relative(B.home, f)); });
  ok(!leakB.length, 'server thật: token API không ở log, phản hồi, hay tệp nào của bản cài' + (leakB.length ? ': ' + leakB.join(', ') : ''));
  await sleep(2100);   // trần mặc định: hai lệnh cách nhau ≥ 2 giây
  const pq = await fetch(B.base + '/api/online/quick', { method: 'POST', headers: hdr, body: '{}' });
  let opened = false; for (let i = 0; i < 40 && !(opened = await portOpen(7773)); i++) await sleep(50);
  ok(pq.status === 202 && opened && JSON.parse(fs.readFileSync(path.join(B.home, 'run', 'edge-intent.json'), 'utf8')).tunnel === 'quick', 'POST quick → intent quick + cổng GC_PORT+2 mở lúc chạy');
  await sleep(2100);
  const po = await fetch(B.base + '/api/online/off', { method: 'POST', headers: hdr, body: '{}' });
  let closed = false; for (let i = 0; i < 200 && !(closed = !(await portOpen(7773))); i++) await sleep(50);
  ok(po.status === 202 && closed && JSON.parse(fs.readFileSync(path.join(B.home, 'run', 'edge-intent.json'), 'utf8')).tunnel === 'off', 'POST off (giữa lúc chờ link tạm) → huỷ lượt đang chạy, intent off, cổng riêng đóng');
  // máy đang cấu hình ra ngoài bằng .env (online-config nguồn env, chỉ đọc) → Go online đòi di chuyển trước; S (phiên mật khẩu) cũng điều khiển được
  const C = spawnServer(7781, () => {}, { GC_PUBLIC_URL: 'https://legacy.example.com', GC_ALLOWED_HOSTS: 'legacy.example.com' });
  await ready(C);
  const lc = await fetch(C.base + '/api/online/quick', { method: 'POST', headers: hdr, body: '{}' });
  const lj = await lc.json().catch(() => ({}));
  const lv = await (await fetch(C.base + '/api/online', { headers: own })).json();
  ok(lc.status === 409 && lj.needs === 'legacy' && lv.legacy.active === true && lv.legacy.marked === true, '.env kế thừa (GC_PUBLIC_URL) → 409 needs legacy; legacy.marked từ data/legacy.json');
  const pw = 'correct horse battery staple';
  const sp = await fetch(C.base + '/api/auth/password', { method: 'POST', headers: hdr, body: JSON.stringify({ password: pw }) });
  const lg = await fetch(C.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ password: pw }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).map(x => String(x).split(';')[0]).join('; ');
  const sv = await fetch(C.base + '/api/online', { headers: { Cookie: ck } });
  const nv = await fetch(C.base + '/api/online', { headers: { Cookie: 'gc_session=bogus' } });
  ok(sp.status === 200 && lg.status === 200 && sv.status === 200 && nv.status === 401, 'isOwner = auth.ownerOf: phiên mật khẩu (S) xem được /api/online; cookie giả → 401');
  // nút Migrate (v0.21 P4): POST /api/online/migrate → online.migrate() → online-config.migrate(): .env chép vào online.json, app nhận quyền, publicUrl giữ nguyên
  await sleep(2100);
  const mg = await fetch(C.base + '/api/online/migrate', { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: '{}' });
  const mv = await mg.json().catch(() => ({}));
  const mf = JSON.parse(fs.readFileSync(path.join(C.home, 'data', 'online.json'), 'utf8'));
  ok(mg.status === 200 && mv.legacy && mv.legacy.active === false && mv.mode === 'proxy' && mv.publicUrl === 'https://legacy.example.com' && mf.adopted === true && mf.publicUrl === 'https://legacy.example.com',
    'POST /api/online/migrate (phiên S): .env kế thừa → data/online.json (adopted, mode proxy, publicUrl giữ nguyên) — wizard hết chỉ đọc');
  await sleep(2100);
  const mg2 = await fetch(C.base + '/api/online/migrate', { method: 'POST', headers: hdr, body: '{}' });
  await sleep(2100);
  const lq = await fetch(C.base + '/api/online/quick', { method: 'POST', headers: hdr, body: '{}' }), lqj = await lq.json().catch(() => ({}));
  ok(mg2.status === 409 && lq.status === 409 && lqj.needs === 'urlChange' && lqj.from === 'https://legacy.example.com', 'migrate lần hai → 409 (không còn gì để di chuyển); Go online sau migrate không còn needs legacy — đổi địa chỉ thì hỏi urlChange');
  const anonM = await fetch(C.base + '/api/online/migrate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: '{}' });
  ok(anonM.status === 401, 'POST /api/online/migrate không bằng chứng chủ → 401');
  A.c.kill(); B.c.kill(); C.c.kill();
}

// chỉ xoá đúng các thư mục mkdtemp của chính bộ test này (tiền tố gco- trong thư mục tạm của hệ thống)
tmps.filter(d => path.dirname(d) === os.tmpdir() && path.basename(d).startsWith('gco-')).forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* bỏ qua */ } });
console.log('   ' + (failn ? '✗' : '✓') + ' test-online: ' + passn + ' ✓ · ' + failn + ' ✗');
process.exit(failn ? 1 : 0);
