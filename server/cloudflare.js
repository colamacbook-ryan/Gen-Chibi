// gen-chibi — client Cloudflare API v4 cho đường B (v0.21, spec §2 B, CNS-168 / 179; nghiên cứu spikes/2026-10-20-online-setup-research.md)
// © 2026 Gen Labs — All rights reserved.
//
// Node thuần (https + net.agentFor: đi qua HTTPS_PROXY như mọi lời gọi ra ngoài khác của app), không npm.
// Token API chỉ sống trong closure của một client (online.js giữ trong bộ nhớ suốt phiên wizard rồi bỏ) — không bao giờ vào log, lỗi hay giá trị trả về.
// Mọi lỗi Cloudflare ném CfError { status, cfCode, op } kèm câu gốc (cắt 200 ký tự) để giao diện hiện "mã gốc" (spec §3.7).
// Chuỗi (remotely-managed tunnel): GET /zones?name → zone + account · cfd_tunnel?name (idempotent) / POST cfd_tunnel {config_src:"cloudflare"}
//   → PUT configurations (đọc–sửa–ghi: giữ mục của người khác) → CNAME proxied (đã có bản ghi khác → conflict, KHÔNG đè) → GET token → GET tunnel (status)
// Quyền: kiểm bằng chính các lời gọi đọc (403 = thiếu quyền), không dựa /user/tokens/verify (token của account trả lỗi ở đó).
'use strict';
const http = require('http');
const https = require('https');
const { agentFor } = require('./net');

const BASE = 'https://api.cloudflare.com/client/v4';
const WAF_PHASE = 'http_request_firewall_custom';
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const TOKEN_RE = /^[\x21-\x7e]{20,400}$/;            // in được, không khoảng trắng / xuống dòng (không chèn header)
const TUNNEL_TOKEN_RE = /^[A-Za-z0-9+/=_-]{20,4096}$/;
// đường MÁY (agent không qua được trang đăng nhập / thử thách bot) — khớp MACHINE_PATH của main.js; /mcp/<khoá> là link có khoá
const MACHINE_PATHS = { exact: ['/mcp', '/oauth/register', '/oauth/token', '/oauth/revoke'], prefix: ['/mcp/', '/.well-known/oauth-'] };
// skip cho luật custom (developers.cloudflare.com/waf/custom-rules/skip/options — kiểm 2026-10-20). Bot Fight Mode (gói Free) KHÔNG skip được (tài liệu ghi rõ)
const SKIP = { ruleset: 'current', phases: ['http_ratelimit', 'http_request_firewall_managed', 'http_request_sbfm'], products: ['zoneLockdown', 'uaBlock', 'bic', 'hot', 'securityLevel', 'rateLimit', 'waf'] };
// link tạo token điền sẵn quyền (developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template). Khoá 'argotunnel' (Cloudflare Tunnel)
// CHƯA xác minh — spike P0 (§8); 'dns', 'zone', 'firewall_services' có trong bảng khoá của tài liệu (kiểm 2026-10-20)
const TOKEN_PERMS = [{ key: 'argotunnel', type: 'edit' }, { key: 'dns', type: 'edit' }, { key: 'zone', type: 'read' }, { key: 'firewall_services', type: 'edit' }];
function tokenLink() { return 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=' + encodeURIComponent(JSON.stringify(TOKEN_PERMS)) + '&accountId=*&zoneId=all&name=gen-chibi'; }

class CfError extends Error {
  constructor(status, cfCode, message, op) { super(message); this.name = 'CfError'; this.status = status; this.cfCode = cfCode; this.op = op; }
}

function request(method, url, { headers = {}, body, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'https:' ? https : http;
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = mod.request(u, { method, timeout: timeoutMs, agent: agentFor(url), headers: Object.assign({ 'User-Agent': 'gen-chibi', Accept: 'application/json' }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}, headers) }, res => {
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n <= 2 * 1024 * 1024) chunks.push(c); });
      res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { json = null; } resolve({ status: res.statusCode, json }); });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// biểu thức luật skip: đúng tên miền + đúng đường máy (tên miền đã qua regex hostname → không có ký tự đặc biệt)
function machineExpression(host) {
  const paths = MACHINE_PATHS.exact.filter(p => p !== '/mcp').map(p => '"' + p + '"').join(' ');
  return '(http.host eq "' + host + '" and (http.request.uri.path eq "/mcp" or ' + MACHINE_PATHS.prefix.map(p => 'starts_with(http.request.uri.path, "' + p + '")').join(' or ') + ' or http.request.uri.path in {' + paths + '}))';
}

function createCloudflare({ token, base = BASE, requestFn = request, timeoutMs = 20000 } = {}) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw Object.assign(new Error('cloudflare: token format'), { code: 'TOKEN_FORMAT' });
  const ctx = { accountId: '', zoneId: '', zone: '' };
  const scrub = s => String(s == null ? '' : s).split(token).join('***').replace(/\s+/g, ' ').slice(0, 200);
  const need = id => { if (!ID_RE.test(String(id || ''))) throw new CfError(0, 'bad_id', 'unexpected id from Cloudflare', 'id'); return id; };
  async function call(op, method, p, body) {
    let r;
    try { r = await requestFn(method, base + p, { headers: { Authorization: 'Bearer ' + token }, body, timeoutMs }); }
    catch (e) { throw new CfError(0, e.code || 'network', scrub(e.message), op); }
    const j = r.json;
    if (r.status >= 400 || !j || j.success === false) {
      const e0 = (j && Array.isArray(j.errors) && j.errors[0]) || {};
      throw new CfError(r.status, e0.code || r.status, scrub(e0.message || ('HTTP ' + r.status)), op);
    }
    return j;
  }
  // lời gọi đọc để kiểm quyền: 401/403 → false (kèm lỗi gốc); 404 (vd chưa có ruleset) → true
  async function can(op, p) {
    try { await call(op, 'GET', p); return { ok: true }; }
    catch (e) { if (e.status === 401 || e.status === 403) return { ok: false, error: e }; if (e.status === 404) return { ok: true }; throw e; }
  }
  const acc = () => '/accounts/' + need(ctx.accountId);
  const zone = () => '/zones/' + need(ctx.zoneId);
  const wafEntry = () => zone() + '/rulesets/phases/' + WAF_PHASE + '/entrypoint';

  // dùng lại zone / account đã lưu (Go offline: không cần verify lại)
  function use(c) { ctx.accountId = need(c && c.accountId); ctx.zoneId = need(c && c.zoneId); ctx.zone = String((c && c.zone) || ''); }
  async function zones(name) {
    const q = name ? '?name=' + encodeURIComponent(name) + '&per_page=5' : '?status=active&per_page=50';
    return ((await call('zone', 'GET', '/zones' + q)).result || []).filter(z => z && typeof z.name === 'string');
  }
  // zone + account từ token; quyền tunnel / DNS / WAF kiểm bằng lời gọi đọc
  async function verify(zoneName) {
    const z = (await zones(zoneName)).find(x => x.name.toLowerCase() === zoneName);
    if (!z) return { found: false };
    ctx.zoneId = need(z.id); ctx.accountId = need(z.account && z.account.id); ctx.zone = z.name.toLowerCase();
    const perms = {
      tunnel: await can('tunnel', acc() + '/cfd_tunnel?is_deleted=false&per_page=1'),
      dns: await can('dns', zone() + '/dns_records?per_page=1'),
      waf: await can('waf', wafEntry())
    };
    return { found: true, zoneId: ctx.zoneId, accountId: ctx.accountId, name: ctx.zone, status: String(z.status || ''), type: String(z.type || ''), perms };
  }
  async function findTunnel(name) {
    const r = await call('tunnel', 'GET', acc() + '/cfd_tunnel?is_deleted=false&name=' + encodeURIComponent(name));
    return (r.result || []).find(t => t && t.name === name && !t.deleted_at) || null;
  }
  async function createTunnel(name) {
    const r = await call('tunnel', 'POST', acc() + '/cfd_tunnel', { name, config_src: 'cloudflare' });
    need(r.result && r.result.id);
    return r.result;
  }
  // đọc–sửa–ghi: mục của mình (cùng host, hoặc cùng service = mục cũ của bản cài này) thay bằng mục mới; mục khác giữ; catch-all 404 luôn cuối
  async function putIngress(id, host, service) {
    const p = acc() + '/cfd_tunnel/' + need(id) + '/configurations';
    let cur = [];
    try { const r = await call('ingress', 'GET', p); cur = (r.result && r.result.config && Array.isArray(r.result.config.ingress)) ? r.result.config.ingress : []; }
    catch (e) { if (e.status !== 404) throw e; }
    const keep = cur.filter(x => x && x.hostname && x.hostname !== host && x.service !== service);
    const ingress = [{ hostname: host, service }].concat(keep, [{ service: 'http_status:404' }]);
    await call('ingress', 'PUT', p, { config: { ingress } });
    return ingress;
  }
  async function dnsAt(host) {
    const r = await call('dns', 'GET', zone() + '/dns_records?name.exact=' + encodeURIComponent(host) + '&per_page=50');
    return (r.result || []).filter(x => x && String(x.name).toLowerCase() === host);
  }
  const brief = x => ({ type: String(x.type), content: String(x.content).slice(0, 120), proxied: !!x.proxied });
  // bản ghi ở host không phải CNAME → <id>.cfargotunnel.com (id rỗng: chưa có tunnel — mọi bản ghi đều là xung đột)
  async function dnsConflicts(host, id) {
    const target = id ? (id + '.cfargotunnel.com').toLowerCase() : '';
    return (await dnsAt(host)).filter(x => !(x.type === 'CNAME' && target && String(x.content).toLowerCase() === target)).map(brief);
  }
  // CNAME proxied → tunnel. Đã có bản ghi KHÁC: overwrite=false → { result:'conflict', records } (không ghi gì); true (chủ đã xác nhận) → xoá đúng các bản ghi ở host rồi tạo
  async function ensureCname(host, id, { overwrite = false, comment = 'gen-chibi' } = {}) {
    const target = need(id) + '.cfargotunnel.com';
    const recs = await dnsAt(host);
    const mine = recs.find(x => x.type === 'CNAME' && String(x.content).toLowerCase() === target.toLowerCase());
    const others = recs.filter(x => x !== mine);
    if (others.length && !overwrite) return { result: 'conflict', records: others.map(brief) };
    for (const x of others) await call('dns', 'DELETE', zone() + '/dns_records/' + need(x.id));
    if (mine) {
      if (!mine.proxied) await call('dns', 'PATCH', zone() + '/dns_records/' + need(mine.id), { proxied: true });
      return { result: others.length ? 'overwritten' : 'exists', id: mine.id };
    }
    const r = await call('dns', 'POST', zone() + '/dns_records', { type: 'CNAME', name: host, content: target, proxied: true, ttl: 1, comment });
    return { result: others.length ? 'overwritten' : 'created', id: r.result && r.result.id };
  }
  async function getTunnelToken(id) {
    const r = await call('token', 'GET', acc() + '/cfd_tunnel/' + need(id) + '/token');
    if (typeof r.result !== 'string' || !TUNNEL_TOKEN_RE.test(r.result)) throw new CfError(200, 'bad_token', 'unexpected tunnel token shape', 'token');
    return r.result;
  }
  async function tunnelStatus(id) {
    const r = await call('tunnel', 'GET', acc() + '/cfd_tunnel/' + need(id));
    const t = r.result || {};
    return { status: String(t.status || ''), connections: Array.isArray(t.connections) ? t.connections.length : 0, name: String(t.name || '') };
  }
  // luật skip cho đường máy (Q31). tag = tên tunnel của bản cài (nhận ra luật của mình qua mô tả). Thiếu quyền → needs_manual + biểu thức để dán tay
  async function wafSkipRule(host, tag) {
    const expression = machineExpression(host);
    const description = 'gen-chibi ' + tag + ': AI agents reach MCP + OAuth (machine routes only)';
    const rule = { description, expression, action: 'skip', action_parameters: SKIP, enabled: true };
    const manual = e => ({ result: 'needs_manual', expression, status: e.status, cfCode: e.cfCode, error: e.message });
    let rs = null;
    try { rs = (await call('waf', 'GET', wafEntry())).result; }
    catch (e) { if (e.status === 404) rs = null; else if (e.status === 401 || e.status === 403) return manual(e); else throw e; }
    try {
      if (!rs) {
        const r = await call('waf', 'PUT', wafEntry(), { rules: [rule] });
        const mine = ((r.result && r.result.rules) || []).find(x => x.description === description) || {};
        return { result: 'created', rulesetId: r.result && r.result.id, ruleId: mine.id || '', expression };
      }
      const mine = (rs.rules || []).find(x => typeof x.description === 'string' && x.description.startsWith('gen-chibi ' + tag + ':'));
      if (mine) {
        if (mine.expression === expression && mine.action === 'skip' && mine.enabled !== false) return { result: 'exists', rulesetId: rs.id, ruleId: mine.id, expression };
        await call('waf', 'PATCH', zone() + '/rulesets/' + need(rs.id) + '/rules/' + need(mine.id), rule);
        return { result: 'updated', rulesetId: rs.id, ruleId: mine.id, expression };
      }
      // đặt ĐẦU danh sách: luật chặn đứng trước sẽ chặn trước khi tới luật skip
      const r = await call('waf', 'POST', zone() + '/rulesets/' + need(rs.id) + '/rules', Object.assign({ position: { index: 1 } }, rule));
      const added = ((r.result && r.result.rules) || []).find(x => x.description === description) || {};
      return { result: 'created', rulesetId: rs.id, ruleId: added.id || '', expression };
    } catch (e) { if (e.status === 401 || e.status === 403) return manual(e); throw e; }
  }
  // Go offline: xoá CNAME trỏ tunnel của mình, tunnel của mình (đúng tên), luật WAF của mình. Không ném — trả từng phần + lỗi
  async function teardown({ host, tunnelId, tag }) {
    const out = { dns: 'none', tunnel: 'none', waf: 'none', errors: [] };
    const step = async (k, fn) => { try { out[k] = await fn(); } catch (e) { out[k] = 'error'; out.errors.push({ part: k, status: e.status || 0, cfCode: e.cfCode || '', error: e.message }); } };
    if (host && tunnelId) await step('dns', async () => {
      const target = (tunnelId + '.cfargotunnel.com').toLowerCase();
      const mine = (await dnsAt(host)).filter(x => x.type === 'CNAME' && String(x.content).toLowerCase() === target);
      for (const x of mine) await call('dns', 'DELETE', zone() + '/dns_records/' + need(x.id));
      return mine.length ? 'deleted' : 'none';
    });
    if (tunnelId && tag) await step('tunnel', async () => {
      let t = null;
      try { t = (await call('tunnel', 'GET', acc() + '/cfd_tunnel/' + need(tunnelId))).result; } catch (e) { if (e.status === 404) return 'none'; throw e; }
      if (!t || t.name !== tag || t.deleted_at) return 'none';   // chỉ xoá tunnel do app tạo (tên gen-chibi-<installId>)
      try { await call('tunnel', 'DELETE', acc() + '/cfd_tunnel/' + need(tunnelId) + '/connections'); } catch (e) { if (e.status !== 404) throw e; }
      await call('tunnel', 'DELETE', acc() + '/cfd_tunnel/' + need(tunnelId));
      return 'deleted';
    });
    if (tag) await step('waf', async () => {
      let rs = null;
      try { rs = (await call('waf', 'GET', wafEntry())).result; } catch (e) { if (e.status === 404) return 'none'; throw e; }
      const mine = ((rs && rs.rules) || []).filter(x => typeof x.description === 'string' && x.description.startsWith('gen-chibi ' + tag + ':'));
      for (const x of mine) await call('waf', 'DELETE', zone() + '/rulesets/' + need(rs.id) + '/rules/' + need(x.id));
      return mine.length ? 'deleted' : 'none';
    });
    return out;
  }
  return { ctx, use, zones, verify, findTunnel, createTunnel, putIngress, dnsAt, dnsConflicts, ensureCname, getTunnelToken, tunnelStatus, wafSkipRule, teardown };
}

module.exports = { createCloudflare, CfError, request, machineExpression, tokenLink, TOKEN_PERMS, SKIP, BASE };
