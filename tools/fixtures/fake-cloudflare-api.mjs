// gen-chibi — Cloudflare API v4 GIẢ (Node http) cho tools/test-online.mjs, tools/test-online-cli.mjs và tools/test-browser.mjs (nhóm online): đúng endpoint + thân của nghiên cứu
// (zones · cfd_tunnel · configurations · token · dns_records · rulesets WAF), lỗi quyền / Zero Trust / CNAME có sẵn. Không gọi Cloudflare thật.
//   fakeCloudflare({ token, zones?, perms?, dns?, healthy?, zeroTrustMissing? }) → { st, srv, base, writes, close }
// © 2026 Gen Labs — All rights reserved.
import http from 'http';
import crypto from 'crypto';
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

export function tunnelTokenOf(t) { return 'eyJ' + Buffer.from(JSON.stringify({ a: 'acc', t: t.id, s: 'c2VjcmV0' })).toString('base64').replace(/=+$/, ''); }
export async function fakeCloudflare(o = {}) {
  if (!o.token) throw new Error('fakeCloudflare: o.token missing');
  const hex = () => crypto.randomBytes(16).toString('hex');
  const st = {
    acc: hex(), zones: o.zones || [{ id: hex(), name: 'example.com', status: 'active', type: 'full' }],
    perms: Object.assign({ zone: true, tunnel: true, tunnelCreate: true, dns: true, waf: true, wafWrite: true }, o.perms),
    tunnels: [], configs: {}, dns: [], ruleset: null, log: [], zeroTrustMissing: !!o.zeroTrustMissing
  };
  (o.dns || []).forEach(r => st.dns.push(Object.assign({ id: hex(), proxied: false }, r)));
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/^\/client\/v4/, ''), m = req.method;
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
      st.log.push({ m, p, q: u.search, body });
      const out = (code, result, errors) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: code < 400, errors: errors || [], messages: [], result: result === undefined ? null : result })); };
      const deny = () => out(403, null, [{ code: 10000, message: 'Authentication error' }]);
      const nf = () => out(404, null, [{ code: 7003, message: 'Could not route to ' + p }]);
      if (req.headers.authorization !== 'Bearer ' + o.token) return out(401, null, [{ code: 1000, message: 'Invalid API Token' }]);
      let mm;
      if (p === '/zones' && m === 'GET') {
        if (!st.perms.zone) return deny();
        const name = u.searchParams.get('name'), status = u.searchParams.get('status');
        return out(200, st.zones.filter(z => (!name || z.name === name) && (!status || z.status === status)).map(z => Object.assign({ account: { id: st.acc } }, z)));
      }
      if ((mm = /^\/accounts\/([^/]+)\/cfd_tunnel$/.exec(p))) {
        if (!st.perms.tunnel || mm[1] !== st.acc) return deny();
        if (m === 'GET') { const name = u.searchParams.get('name'); return out(200, st.tunnels.filter(t => !t.deleted_at && (!name || t.name === name))); }
        if (m === 'POST') {
          if (st.zeroTrustMissing) return out(400, null, [{ code: 1003, message: 'You must create a Zero Trust organization before creating a tunnel' }]);
          if (!st.perms.tunnelCreate) return deny();
          if (!body || body.config_src !== 'cloudflare' || !body.name) return out(400, null, [{ code: 1001, message: 'bad body' }]);
          const t = { id: crypto.randomUUID(), name: body.name, config_src: body.config_src, status: 'inactive', connections: [] };
          st.tunnels.push(t); return out(200, t);
        }
      }
      if ((mm = /^\/accounts\/([^/]+)\/cfd_tunnel\/([^/]+)(\/configurations|\/token|\/connections)?$/.exec(p))) {
        if (!st.perms.tunnel) return deny();
        const t = st.tunnels.find(x => x.id === mm[2] && !x.deleted_at);
        if (!t) return out(404, null, [{ code: 1003, message: 'tunnel not found' }]);
        if (!mm[3] && m === 'GET') return out(200, Object.assign({}, t, t.connected ? { status: 'healthy', connections: [{ id: 'c1' }] } : {}));
        if (!mm[3] && m === 'DELETE') { t.deleted_at = new Date().toISOString(); return out(200, t); }
        if (mm[3] === '/connections' && m === 'DELETE') return out(200, null);
        if (mm[3] === '/configurations' && m === 'GET') return out(200, { tunnel_id: t.id, version: 1, config: st.configs[t.id] || null });
        if (mm[3] === '/configurations' && m === 'PUT') { st.configs[t.id] = body.config; return out(200, { tunnel_id: t.id, config: body.config }); }
        if (mm[3] === '/token' && m === 'GET') { if (o.healthy !== false) t.connected = true; return out(200, tunnelTokenOf(t)); }
      }
      if ((mm = /^\/zones\/([^/]+)\/dns_records(?:\/([^/]+))?$/.exec(p))) {
        if (!st.perms.dns) return deny();
        if (!mm[2] && m === 'GET') { const n = u.searchParams.get('name.exact'); return out(200, st.dns.filter(r => !n || r.name === n)); }
        if (!mm[2] && m === 'POST') { const r = Object.assign({ id: hex() }, body); st.dns.push(r); return out(200, r); }
        const r = st.dns.find(x => x.id === mm[2]); if (!r) return nf();
        if (m === 'PATCH') { Object.assign(r, body); return out(200, r); }
        if (m === 'DELETE') { st.dns = st.dns.filter(x => x !== r); return out(200, { id: r.id }); }
      }
      if (/^\/zones\/[^/]+\/rulesets\/phases\/http_request_firewall_custom\/entrypoint$/.test(p)) {
        if (!st.perms.waf) return deny();
        if (m === 'GET') return st.ruleset ? out(200, st.ruleset) : out(404, null, [{ code: 10003, message: 'could not find entrypoint ruleset' }]);
        if (m === 'PUT') { if (!st.perms.wafWrite) return deny(); st.ruleset = { id: hex(), phase: 'http_request_firewall_custom', rules: body.rules.map(x => Object.assign({ id: hex() }, x)) }; return out(200, st.ruleset); }
      }
      if ((mm = /^\/zones\/[^/]+\/rulesets\/([^/]+)\/rules(?:\/([^/]+))?$/.exec(p))) {
        if (!st.perms.waf || !st.perms.wafWrite) return deny();
        if (!st.ruleset || st.ruleset.id !== mm[1]) return nf();
        if (!mm[2] && m === 'POST') { const x = Object.assign({ id: hex() }, body); delete x.position; st.ruleset.rules.splice(body.position && body.position.index ? body.position.index - 1 : st.ruleset.rules.length, 0, x); return out(200, st.ruleset); }
        const i = st.ruleset.rules.findIndex(x => x.id === mm[2]); if (i < 0) return nf();
        if (m === 'PATCH') { Object.assign(st.ruleset.rules[i], body); return out(200, st.ruleset); }
        if (m === 'DELETE') { st.ruleset.rules.splice(i, 1); return out(200, st.ruleset); }
      }
      nf();
    });
  });
  const port = await listen(srv);
  const writes = re => st.log.filter(x => x.m !== 'GET' && re.test(x.p));
  return { st, srv, base: 'http://127.0.0.1:' + port + '/client/v4', writes, close: () => srv.close() };
}
