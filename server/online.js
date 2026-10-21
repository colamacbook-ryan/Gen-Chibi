// gen-chibi — "Go online": máy trạng thái wizard + route /api/online/* (v0.21 P3, spec §2 / §3.2 / §3.7 / §4)
// © 2026 Gen Labs — All rights reserved.
//
// Một API cho Studio (wizard) và CLI (`genchibi online`). Mỗi bậc: { id, state: pending|running|ok|fail, detail, fix, at } — detail / fix lưu
// dạng { msg: msgid tiếng Việt, vars } (dữ liệu trung lập ngôn ngữ trong data/online.json), dịch lúc trả về theo người gọi (ADR 0007).
// Đường:
//   caddy      (A) domain → edge → port → cert → public → mcp → password          (chỉ bản Docker)
//   cloudflare (B) owner → token → zone → tunnel → public → waf → mcp → password
//   proxy          domain → config → public → mcp → password                     (proxy riêng của owner)
//   quick          tunnel → public → mcp → password                              (*.trycloudflare.com)
// Máy kế thừa (.env GC_PUBLIC_URL / GC_ALLOWED_HOSTS): mọi luồng 409 needs legacy; POST /api/online/migrate chép .env vào online.json (migrate()).
// publicUrl: bậc `public` bật TẠM (OAuth phục vụ metadata) → hết bậc thì chính thức; một bậc sau đó ✗ → trả về giá trị cũ (CNS-193).
// Chống thành công cụ quét (CNS-180): chỉ chủ máy (isOwner — P1), chỉ gọi đúng tên miền của luồng, phân giải trước rồi TỪ CHỐI IP riêng /
// loopback / link-local và ghim kết nối vào IP đã kiểm (không DNS rebinding), không theo redirect, trần tần suất.
// Chạy dài → 202 + trạng thái ngay, việc chạy nền; client hỏi lại GET /api/online (CNS-175 cùng tinh thần).
// Token API Cloudflare: chỉ trong bộ nhớ của phiên wizard (≤ 30 phút không dùng); xong → bỏ (giữ chỉ khi chủ chọn: kho bí mật AES-GCM, GC_MASTER_KEY).
// Hợp đồng với launcher (P2, STD-11): app chỉ ghi run/edge-intent.json { tunnel: "off" | "token" | "quick", online: bool } + run/tunnel.token (0600 — run/ KHÔNG
// mount vào container Caddy); đọc run/edge-status.json + logs/tunnel.log (link tạm). Cấu hình: server/online-config.js (P1) — mode lưu theo từ vựng của nó
// (off | caddy | tunnel | proxy | quick): luồng 'cloudflare' ở đây = mode 'tunnel' ở online.json (cfgMode / flowMode).
'use strict';
const fs = require('fs');
const net = require('net');
const dns = require('dns');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const MSG = require('./i18n-msg');
const { createCaddy, validDomain, tlsInfo } = require('./caddy');
const { createCloudflare, tokenLink, machineExpression, CfError } = require('./cloudflare');
const { createEdge } = require('./edge');

const { VI: SRC, tr } = MSG;   // câu lỗi của route: tr(SRC, mẫu, biến) = tiếng Việt từ MẪU, main.js send() dịch ở rìa (công cụ quét thấy msgid)
const N_ = (msg, vars) => ({ msg, vars: vars || null });  // msgid + biến; dịch lúc HIỂN THỊ (tools/i18n-scan.mjs nhận N_('…'))

// STD-10: nguồn + ngày kiểm
const ANTHROPIC = { ips: ['160.79.104.0/21'], checked: '2026-10-20', source: 'https://platform.claude.com/docs/en/api/ip-addresses' };
const CF_IPS = {   // https://www.cloudflare.com/ips-v4 + /ips-v6 — kiểm 2026-10-20
  v4: ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'],
  v6: ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']
};
// địa chỉ app KHÔNG gọi tới (CNS-180 + review bảo mật 🟡6): riêng / loopback / link-local / CGNAT / tài liệu / benchmark / multicast + dành riêng + broadcast (224.0.0.0/3)
const PRIVATE_V4 = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/3'];
// IPv6: ::/96 (IPv4-compatible ::a.b.c.d, gồm :: và ::1 — đã bỏ, RFC 4291) · ::ffff:0:0/96 (IPv4-mapped) · NAT64 64:ff9b::/96 + 64:ff9b:1::/48 (RFC 8215) · 100::/64 (discard) ·
// 2001::/32 (Teredo — IPv4 nhúng bị che) · tài liệu · ULA fc00::/7 · link-local fe80::/10 · site-local cũ fec0::/10 · multicast ff00::/8. 6to4 2002::/16 xét IPv4 nhúng (v6to4)
const PRIVATE_V6 = ['::/96', '::ffff:0:0/96', '64:ff9b::/96', '64:ff9b:1::/48', '100::/64', '2001::/32', '2001:db8::/32', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8'];
function blockList(v4, v6) {
  const b = new net.BlockList();
  v4.forEach(c => { const [a, p] = c.split('/'); b.addSubnet(a, +p, 'ipv4'); });
  v6.forEach(c => { const [a, p] = c.split('/'); b.addSubnet(a, +p, 'ipv6'); });
  return b;
}
// hai bảng riêng: net.BlockList so IPv4 với cả luật IPv6 dạng ánh xạ (::/96, ::ffff:0:0/96 sẽ chặn MỌI IPv4) — v4 chỉ xét luật v4, v6 chỉ xét luật v6
const PRIV4 = blockList(PRIVATE_V4, []), PRIV6 = blockList([], PRIVATE_V6), CFB = blockList(CF_IPS.v4, CF_IPS.v6);
const fam = ip => net.isIP(ip) === 6 ? 'ipv6' : 'ipv4';
// IPv6 → 8 nhóm 16 bit (có dạng nhúng a.b.c.d ở cuối); null nếu không đọc được
function v6words(ip) {
  let s = String(ip).toLowerCase();
  const m = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (m) s = s.slice(0, m.index) + ((+m[1] << 8) | +m[2]).toString(16) + ':' + ((+m[3] << 8) | +m[4]).toString(16);
  const parts = s.split('::'); if (parts.length > 2) return null;
  const hd = parts[0] ? parts[0].split(':') : [], tl = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const w = parts.length === 2 ? hd.concat(Array(Math.max(0, 8 - hd.length - tl.length)).fill('0'), tl) : hd;
  return w.length === 8 && w.every(x => /^[0-9a-f]{1,4}$/.test(x)) ? w.map(x => parseInt(x, 16)) : null;
}
const v6to4 = w => [w[1] >> 8, w[1] & 255, w[2] >> 8, w[2] & 255].join('.');   // 2002:AABB:CCDD::/48 → A.B.C.D
function isPublicIp(ip) {
  if (typeof ip !== 'string' || ip.includes('%') || net.isIP(ip) === 0) return false;   // %zone = địa chỉ có phạm vi giao diện (link-local) → nội bộ
  if (net.isIP(ip) === 4 ? PRIV4.check(ip, 'ipv4') : PRIV6.check(ip, 'ipv6')) return false;
  if (net.isIP(ip) === 6) { const w = v6words(ip); if (!w) return false; if (w[0] === 0x2002) return isPublicIp(v6to4(w)); }
  return true;
}
const isCloudflareIp = ip => net.isIP(ip) > 0 && CFB.check(ip, fam(ip));

const FLOWS = {
  caddy: ['domain', 'edge', 'port', 'cert', 'public', 'mcp', 'password'],
  cloudflare: ['owner', 'token', 'zone', 'tunnel', 'public', 'waf', 'mcp', 'password'],
  proxy: ['domain', 'config', 'public', 'mcp', 'password'],
  quick: ['tunnel', 'public', 'mcp', 'password'],
  off: ['local', 'remote']
};
// "Kiểm lại" sau khi xong: chỉ các bậc trạng thái SỐNG (không cần token API, không ghi gì ở Cloudflare)
const LIVE = { caddy: ['domain', 'port', 'cert', 'public', 'mcp'], cloudflare: ['public', 'mcp'], proxy: ['domain', 'public', 'mcp'], quick: ['tunnel', 'public', 'mcp'] };
const SUB_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TOKEN_RE = /^[\x21-\x7e]{20,400}$/;
const QUICK_RE = /^https:\/\/[a-z0-9-]{1,63}\.trycloudflare\.com$/;
const SECRET_KEY = 'cloudflareApiToken';
const UA_CLAUDE = 'Claude-User';
const TOKEN_TTL = 30 * 60 * 1000;
const cfgMode = m => m === 'cloudflare' ? 'tunnel' : m;    // luồng → online.json
const flowMode = m => m === 'tunnel' ? 'cloudflare' : m;   // online.json → luồng / API

// ---------------------------------------------------------------- mạng (mặc định; test tiêm bản giả)
// một yêu cầu HTTP(S) ghim vào IP đã kiểm (lookup cố định), không agent / proxy, không theo redirect; không bao giờ ném — lỗi trong .error
function probeUrl(url, { ip, method = 'GET', headers = {}, body, timeoutMs = 10000, maxBytes = 65536 } = {}) {
  return new Promise(resolve => {
    let u; try { u = new URL(url); } catch (e) { return resolve({ status: 0, error: 'bad url', headers: {}, body: '' }); }
    const mod = u.protocol === 'https:' ? https : http, f = ip ? net.isIP(ip) : 0;
    const data = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const opts = { method, timeout: timeoutMs, agent: false, headers: Object.assign({ 'User-Agent': 'gen-chibi-online-check' }, headers, data ? { 'Content-Length': data.length } : {}) };
    if (ip) opts.lookup = (h, o, cb) => (o && o.all ? cb(null, [{ address: ip, family: f }]) : cb(null, ip, f));
    const req = mod.request(u, opts, res => {
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n <= maxBytes) chunks.push(c); else res.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', e => resolve({ status: 0, error: e.code || e.message, headers: {}, body: '' }));
    if (data) req.write(data);
    req.end();
  });
}
// IP RA Internet của máy (v4 + v6) — https://1.1.1.1/cdn-cgi/trace (spec §2 A1); đi thẳng, không qua proxy công ty
async function traceIp() {
  const one = url => probeUrl(url, { timeoutMs: 5000 }).then(r => ((/^ip=(.+)$/m.exec(r.body || '') || [])[1] || '').trim());
  const [v4, v6] = await Promise.all([one('https://1.1.1.1/cdn-cgi/trace'), one('https://[2606:4700:4700::1111]/cdn-cgi/trace')]);
  return { v4: net.isIPv4(v4) ? v4 : '', v6: net.isIPv6(v6) ? v6 : '' };
}
// A / AAAA hỏi nameserver CÓ THẨM QUYỀN trước (tránh resolver nhớ NXDOMAIN lúc owner chưa tạo bản ghi — CNS-186), không được thì resolver của máy
async function resolveFresh(domain) {
  const q = async r => {
    const [a, aaaa] = await Promise.all([r.resolve4(domain).catch(e => e), r.resolve6(domain).catch(e => e)]);
    const hard = [a, aaaa].find(x => x instanceof Error && !['ENODATA', 'ENOTFOUND'].includes(x.code));
    return { a: Array.isArray(a) ? a : [], aaaa: Array.isArray(aaaa) ? aaaa : [], error: hard ? String(hard.code || hard.message) : '' };
  };
  try {
    const ns = await authoritative(domain);
    if (ns.length) {
      const r = new dns.promises.Resolver({ timeout: 2500, tries: 1 }); r.setServers(ns.slice(0, 3));
      const x = await q(r);
      if (!x.error && (x.a.length || x.aaaa.length)) return Object.assign(x, { via: 'authoritative' });
      if (!x.error) { const y = await q(dns.promises); return Object.assign(y, { via: y.a.length || y.aaaa.length ? 'system' : 'authoritative' }); }   // CNAME ra ngoài zone: resolver máy đi tiếp
    }
  } catch (e) { /* không hỏi được nameserver có thẩm quyền: dùng resolver của máy */ }
  return Object.assign(await q(dns.promises), { via: 'system' });
}
async function authoritative(domain) {
  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    let ns = null; try { ns = await dns.promises.resolveNs(labels.slice(i).join('.')); } catch (e) { continue; }
    const ips = [];
    for (const h of (ns || []).slice(0, 3)) { try { (await dns.promises.resolve4(h)).forEach(x => ips.push(x)); } catch (e) { /* NS không phân giải được */ } }
    if (ips.length) return ips;
  }
  return [];
}

function writeAtomic(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, { mode });
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cut = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, n || 200);
function safeEq(x, y) { const a = Buffer.from(String(x)), b = Buffer.from(String(y)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function jsonOf(r) { try { return JSON.parse(r.body); } catch (e) { return null; } }

// ---------------------------------------------------------------- câu dùng chung
const VIA = { authoritative: N_('nameserver có thẩm quyền'), system: N_('resolver của máy') };
const FIX_PORTS = N_('Mở cổng 80 và 443 ở tường lửa của nhà cung cấp (security group) và ufw của máy; không để dịch vụ khác giữ 80/443');
const OPS = { zone: N_('đọc tên miền'), tunnel: N_('thao tác tunnel'), dns: N_('thao tác DNS'), waf: N_('thao tác WAF'), ingress: N_('ghi ingress của tunnel'), token: N_('lấy tunnel token'), id: N_('đọc id') };
const CNAME = { created: N_('đã tạo CNAME'), exists: N_('CNAME đã có sẵn'), overwritten: N_('đã thay bản ghi cũ bằng CNAME') };
const WAFR = { created: N_('đã tạo luật'), updated: N_('đã cập nhật luật'), exists: N_('luật đã có sẵn') };
function cfDetail(e) {
  if (!e || !(e instanceof CfError)) return N_('Lỗi không lường trước: {error}', { error: cut(e && e.message) });
  if (!e.status) return N_('Không gọi được Cloudflare API ({code}): {error}', { code: cut(e.cfCode, 40), error: e.message });
  return N_('Cloudflare trả lỗi {status} (mã {code}) khi {what}: {error}', { status: e.status, code: cut(e.cfCode, 40), what: OPS[e.op] || OPS.id, error: e.message });
}
function cfFix(e) {
  if (!e || !(e instanceof CfError)) return null;
  if (e.status === 401) return N_('API token không hợp lệ hoặc đã hết hạn — tạo token mới bằng link điền sẵn rồi dán lại');
  if (e.op === 'tunnel' && /zero.?trust|organi[sz]ation|onboard|entitle|subscription/i.test(e.message)) return N_('Tài khoản Cloudflare chưa bật Zero Trust: vào dash.cloudflare.com › Zero Trust, chọn gói Free (có thể phải thêm phương thức thanh toán, $0), rồi bấm Kiểm lại');
  if (e.status === 403) return e.op === 'dns' ? N_('Token thiếu quyền Zone › DNS › Edit — tạo lại token bằng link điền sẵn')
    : e.op === 'zone' ? N_('Token thiếu quyền Zone › Zone › Read cho tên miền này — tạo lại token bằng link điền sẵn')
    : N_('Token thiếu quyền Account › Cloudflare Tunnel › Edit — tạo lại token bằng link điền sẵn');
  return N_('Thử lại sau; lỗi vẫn còn thì ghi lại mã lỗi Cloudflare ở trên');
}
const ok = (detail, extra) => Object.assign({ state: 'ok', detail, fix: null }, extra);
const fail = (detail, fix, extra) => Object.assign({ state: 'fail', detail, fix: fix || null }, extra);
const wait = (detail, fix, extra) => Object.assign({ state: 'running', detail, fix: fix || null }, extra);

// đoạn cấu hình mẫu cho proxy riêng: đường máy (MCP + OAuth) đi thẳng; đường người qua đăng nhập của owner (nếu có — gen-chibi đã có mật khẩu riêng)
function snippets(domain, port) {
  const up = '127.0.0.1:' + port;
  const caddy = [
    domain + ' {',
    '\t# machine routes: AI agents cannot pass a login page — send them straight to gen-chibi (gen-chibi-check: the wizard\'s own outside check)',
    '\t@machine path /mcp /mcp/* /.well-known/oauth-* /.well-known/gen-chibi-check/* /oauth/register /oauth/token /oauth/revoke',
    '\thandle @machine {',
    '\t\treverse_proxy ' + up,
    '\t}',
    '\t# people (Studio, /setup, /login, /oauth/authorize): your own login may sit here (forward_auth …) — optional, gen-chibi has its own password',
    '\thandle {',
    '\t\treverse_proxy ' + up,
    '\t}',
    '}'].join('\n');
  const hdr = ['\t\tproxy_set_header Host $host;', '\t\tproxy_set_header X-Forwarded-For $remote_addr;', '\t\tproxy_set_header X-Forwarded-Proto $scheme;', '\t\tproxy_read_timeout 300s;'];
  const nginx = [
    'server {',
    '\tserver_name ' + domain + ';',
    '\t# listen 443 ssl; ssl_certificate …; ssl_certificate_key …;   (your TLS)',
    '\t# machine routes: straight to gen-chibi (AI agents cannot pass a login page)',
    '\tlocation ~ ^/(mcp(/[A-Za-z0-9_-]+)?|\\.well-known/oauth-[a-z-]+(/mcp)?|\\.well-known/gen-chibi-check/[a-f0-9]{32}|oauth/(register|token|revoke))$ {',
    '\t\tproxy_pass http://' + up + ';'].concat(hdr, [
    '\t}',
    '\t# people: your own login may sit here (auth_request …) — optional, gen-chibi has its own password',
    '\tlocation / {',
    '\t\tproxy_pass http://' + up + ';'], hdr, ['\t}', '}']).join('\n');
  return { caddy, nginx };
}

function createOnline(opts) {
  const d = Object.assign({
    now: () => Date.now(), log: () => {}, resolve: resolveFresh, publicIp: traceIp, probe: probeUrl, tlsInfo,
    cloudflare: o => createCloudflare(o), hasPassword: () => true, isOwner: () => false, inDocker: false,
    legacy: () => { const e = process.env; return { active: !!(e.GC_PUBLIC_URL || e.GC_ALLOWED_HOSTS), publicUrl: e.GC_PUBLIC_URL || '', allowedHosts: e.GC_ALLOWED_HOSTS || '', tunnel: e.GC_TUNNEL || '' }; },
    tunnel: { set() {}, listening: () => false }, secrets: null,
    waits: { certMs: 90000, certFailMs: 15 * 60000, tunnelMs: 60000, tunnelFailMs: 10 * 60000, everyMs: 5000 },
    rate: { minGapMs: 2000, perHour: 60 }
  }, opts);
  if (!d.config) throw new Error('online: config missing');
  const home = d.home, dataDir = d.dataDir || path.join(home, 'data');
  const edgeDir = path.join(home, 'edge'), runDir = path.join(home, 'run');
  const files = { intent: path.join(runDir, 'edge-intent.json'), status: path.join(runDir, 'edge-status.json'), tunnelToken: path.join(runDir, 'tunnel.token'), installId: path.join(dataDir, 'install-id'), cfLog: path.join(home, 'logs', 'tunnel.log') };
  const caddy = d.caddy || createCaddy({ edgeDir });
  const edge = d.edge || createEdge({ edgeDir });
  const tunnelPort = (+d.port || 7480) + 2;
  const iso = () => new Date(d.now()).toISOString();

  // ---- installId: tên tunnel gen-chibi-<8 ký tự đầu> (CNS-179: một tunnel cho một bản cài)
  function installId() {
    if (typeof d.installId === 'function') return d.installId();
    try { const v = fs.readFileSync(files.installId, 'utf8').trim(); if (/^[a-f0-9]{16,64}$/.test(v)) return v; } catch (e) { /* chưa có */ }
    const v = crypto.randomBytes(16).toString('hex');
    writeAtomic(files.installId, v + '\n', 0o600);
    return v;
  }
  const tunnelName = () => 'gen-chibi-' + installId().slice(0, 8);
  // CNS-213: tài nguyên Cloudflare (tunnel, CNAME, luật WAF) ghi kèm installId của bản cài tạo ra chúng. Khôi phục sao lưu sang máy khác → installId mới
  // → cfResources trong online.json là của máy cũ: Go offline / chạy lại KHÔNG xoá, chỉ báo. Bản ghi v0.21 (chưa có installId) → so tên tunnel (gen-chibi-<8 ký tự đầu>)
  function ownsCf(res) {
    if (!res) return false;
    if (res.installId) return res.installId === installId();
    return res.tunnelName === tunnelName();
  }
  const cfRes = () => (d.config.get() || {}).cfResources || null;

  // ---- token API: chỉ bộ nhớ
  let mem = null;   // { token, at, keep }
  function tokenGet() { if (mem && d.now() - mem.at > TOKEN_TTL) mem = null; if (mem) mem.at = d.now(); return mem ? mem.token : ''; }
  function dropToken() { mem = null; }
  const kept = () => { try { return d.secrets ? d.secrets.get(SECRET_KEY) : ''; } catch (e) { return ''; } };

  // ---- trạng thái luồng (data/online.json qua online-config)
  let flow = (d.config.get() || {}).flow || null;
  const save = () => d.config.set({ flow });
  function newFlow(mode, extra) {
    return Object.assign({ mode, domain: '', url: '', startedAt: iso(), done: false, nonce: crypto.randomBytes(16).toString('hex'), pending: false, needs: null, conflicts: null, choices: null, waitSince: {},
      steps: FLOWS[mode].map(id => ({ id, state: 'pending', detail: null, fix: null, at: null })) }, extra);
  }
  const stepOf = id => flow.steps.find(s => s.id === id);
  const urlOf = () => flow.mode === 'quick' ? flow.url : (flow.domain ? 'https://' + flow.domain : '');

  // ---- tệp hợp đồng với launcher (P2)
  // online: máy đang ra Internet qua bất kỳ đường nào (launcher không tự rollback xuống bản không có edge). Mặc định: tunnel bật hoặc mode đã lưu ≠ off
  function writeIntent(tunnel, online) {
    if (online === undefined) online = tunnel !== 'off' || ((d.config.get() || {}).mode || 'off') !== 'off';
    writeAtomic(files.intent, JSON.stringify({ tunnel, online: !!online }) + '\n', 0o600); d.tunnel.set(tunnel !== 'off');
  }
  function intent() { try { const j = JSON.parse(fs.readFileSync(files.intent, 'utf8')); return ['token', 'quick'].includes(j.tunnel) ? j.tunnel : 'off'; } catch (e) { return 'off'; } }
  function edgeStatus() {
    let j = null; try { j = JSON.parse(fs.readFileSync(files.status, 'utf8')); } catch (e) { return null; }
    if (!j || typeof j !== 'object') return null;
    return { tunnel: cut(j.tunnel, 10), running: j.running === true, ready: j.ready === true, since: cut(j.since, 40), error: j.error ? cut(j.error, 200) : '', url: QUICK_RE.test(String(j.url || '')) ? j.url : '' };
  }
  // link tạm: edge-status.url (P2) là nguồn duy nhất khi launcher có ghi status — launcher xoá url khi cloudflared thoát / tắt, còn
  // logs/tunnel.log (chỉ nối thêm) vẫn giữ link CŨ đã chết của lần chạy trước → không quét log nữa (quick → off → quick lấy nhầm link cũ).
  // Không có status (launcher không hiểu P2) mới quét đuôi log.
  function quickUrl() {
    const s = edgeStatus(); if (s) return s.tunnel === 'quick' && s.running ? s.url : '';
    try {
      const st = fs.statSync(files.cfLog), fd = fs.openSync(files.cfLog, 'r'), n = Math.min(st.size, 64 * 1024), buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, st.size - n); fs.closeSync(fd);
      const all = buf.toString('utf8').match(/https:\/\/[a-z0-9-]{1,63}\.trycloudflare\.com\b/g);
      return all ? all[all.length - 1] : '';
    } catch (e) { return ''; }
  }

  // ---- gọi ra ngoài: chỉ tên miền của luồng, IP đã kiểm (CNS-180)
  let dnsCache = null;   // mỗi lượt chạy một bộ nhớ đệm
  async function lookup(host) {
    if (dnsCache && dnsCache[host]) return dnsCache[host];
    const r = await d.resolve(host);
    const x = { a: (r.a || []).filter(ip => net.isIPv4(ip)), aaaa: (r.aaaa || []).filter(ip => net.isIPv6(ip)), via: r.via === 'authoritative' ? 'authoritative' : 'system', error: r.error ? cut(r.error, 60) : '' };
    if (dnsCache) dnsCache[host] = x;
    return x;
  }
  // MỘT rào cho MỌI kết nối theo tên miền (HTTP qua call(), TLS ở bậc chứng chỉ): đúng tên của luồng, phân giải, có IP riêng / loopback /
  // link-local nào thì từ chối hết (chống DNS rebinding giữa các bậc), trả về IP đã kiểm để ghim kết nối
  async function vetted(host) {
    if (!flow || host !== flow.domain) return { error: 'not the saved domain' };
    const r = await lookup(host), ips = r.a.concat(r.aaaa);
    if (!ips.length) return { error: r.error || 'ENOTFOUND' };
    const bad = ips.filter(ip => !isPublicIp(ip));
    if (bad.length) return { error: 'private address ' + bad[0], private: true };
    return { ip: r.a[0] || r.aaaa[0] };
  }
  async function call(url, o) {
    let host = ''; try { host = new URL(url).hostname; } catch (e) { return { status: 0, error: 'bad url', headers: {}, body: '' }; }
    const v = await vetted(host);
    if (!v.ip) return { status: 0, error: v.error, private: !!v.private, headers: {}, body: '' };
    return d.probe(url, Object.assign({ ip: v.ip }, o));
  }
  const errOf = r => r.error ? cut(r.error, 120) : 'HTTP ' + r.status;

  // ---------------------------------------------------------------- các bậc
  // tên miền → A / AAAA so với IP công khai của máy (strict = đường A; proxy: chỉ cần trỏ về IP công khai)
  async function stepDomain(strict) {
    const dom = flow.domain;
    const [r, pub] = await Promise.all([lookup(dom), strict ? d.publicIp() : Promise.resolve({ v4: '', v6: '' })]);
    const all = r.a.concat(r.aaaa), via = VIA[r.via];
    if (!all.length) {
      if (r.error) return fail(N_('Không phân giải được {domain} ({error})', { domain: dom, error: r.error }), N_('Kiểm DNS của máy rồi bấm Kiểm lại'));
      return fail(N_('{domain} chưa có bản ghi A / AAAA (hỏi {via})', { domain: dom, via }),
        strict && pub.v4 ? N_('Tạo bản ghi A: {domain} → {ip} ở nơi quản lý tên miền, đợi vài phút rồi bấm Kiểm lại', { domain: dom, ip: pub.v4 }) : N_('Tạo bản ghi A cho {domain} ở nơi quản lý tên miền, đợi vài phút rồi bấm Kiểm lại', { domain: dom }));
    }
    const priv = all.filter(ip => !isPublicIp(ip));
    if (priv.length) return fail(N_('{domain} trỏ về địa chỉ nội bộ {ips} — app không gọi địa chỉ nội bộ', { domain: dom, ips: priv.join(', ') }), N_('Trỏ {domain} về IP công khai của máy', { domain: dom }));
    if (!strict) return ok(N_('{domain} → {ips} (hỏi {via})', { domain: dom, ips: all.join(', '), via }));
    const cf = all.filter(isCloudflareIp);
    if (cf.length) return fail(N_('{domain} trỏ về IP của Cloudflare ({ips}) — bản ghi đang bật proxy (đám mây cam)', { domain: dom, ips: cf.join(', ') }),
      N_('Ở Cloudflare › DNS, chuyển bản ghi {domain} sang "DNS only" (đám mây xám) — hoặc dùng đường Cloudflare (Tunnel) thay cho Caddy', { domain: dom }));
    if (!pub.v4 && !pub.v6) return fail(N_('Không lấy được IP công khai của máy (https://1.1.1.1/cdn-cgi/trace)'), N_('Kiểm kết nối Internet của máy rồi bấm Kiểm lại'));
    const wrongA = r.a.filter(ip => ip !== pub.v4);
    if (r.a.length && (wrongA.length || !pub.v4)) return fail(N_('Bản ghi A của {domain} là {got}, còn IP công khai của máy là {ip} (IP ra Internet theo 1.1.1.1 — máy sau NAT có thể khác IP vào)', { domain: dom, got: r.a.join(', '), ip: pub.v4 || '?' }),
      pub.v4 ? N_('Sửa bản ghi A: {domain} → {ip}, xoá các giá trị khác', { domain: dom, ip: pub.v4 }) : N_('Máy không có IPv4 ra ngoài — xoá bản ghi A của {domain}', { domain: dom }));
    if (r.aaaa.length && !pub.v6) return fail(N_('{domain} có bản ghi AAAA {got} nhưng máy không có IPv6 ra ngoài — Let\'s Encrypt ưu tiên IPv6 nên sẽ lỗi', { domain: dom, got: r.aaaa.join(', ') }), N_('Xoá bản ghi AAAA của {domain} (hoặc trỏ về IPv6 thật của máy)', { domain: dom }));
    const wrong6 = r.aaaa.filter(ip => ip !== pub.v6);
    if (wrong6.length) return fail(N_('Bản ghi AAAA của {domain} là {got}, còn IPv6 công khai của máy là {ip}', { domain: dom, got: r.aaaa.join(', '), ip: pub.v6 }), N_('Sửa hoặc xoá bản ghi AAAA của {domain}', { domain: dom }));
    if (!r.a.length && pub.v4) return fail(N_('{domain} chỉ có AAAA, chưa có bản ghi A', { domain: dom }), N_('Tạo bản ghi A: {domain} → {ip} ở nơi quản lý tên miền, đợi vài phút rồi bấm Kiểm lại', { domain: dom, ip: pub.v4 }));
    return ok(N_('{domain} → {ips} = IP công khai của máy (hỏi {via})', { domain: dom, ips: all.join(', '), via }));
  }
  async function stepEdge() {
    if (!d.inDocker) return fail(N_('Đường Caddy chỉ có ở bản cài Docker'), N_('Bản cài native: dùng Cloudflare (Tunnel) hoặc proxy riêng'));
    if (!caddy.enabled() || !(await caddy.adminUp())) return fail(N_('Edge Caddy chưa chạy (chưa publish cổng 80 / 443)'), N_('Chạy một lệnh trên máy chủ: genchibi online --caddy'));
    edge.ensureSecret();
    caddy.writeSites([{ domain: flow.domain, nonce: flow.nonce }]);
    try { await caddy.reload(); } catch (e) { return fail(N_('Caddy không nạp được cấu hình ({code}): {error}', { code: cut(e.code, 40), error: cut(e.message) }), N_('Xem log của edge: docker logs gen-chibi-edge')); }
    return ok(N_('Edge Caddy đang chạy, đã nạp cấu hình cho {domain}', { domain: flow.domain }));
  }
  async function stepPort() {
    const r = await call('http://' + flow.domain + '/.well-known/gen-chibi-check/' + flow.nonce, { timeoutMs: 10000 });
    if (r.status === 0) return fail(N_('Không tới được http://{domain} (cổng 80): {error}', { domain: flow.domain, error: errOf(r) }), FIX_PORTS);
    if (r.status !== 200 || String(r.body).trim() !== flow.nonce) return fail(N_('http://{domain} trả {status} nhưng không phải edge Caddy của máy này', { domain: flow.domain, status: r.status }), N_('Có dịch vụ khác giữ cổng 80, hoặc tên miền đang trỏ sang máy khác'));
    return ok(N_('Cổng 80 tới được edge Caddy (kiểm từ trong máy — kiểm từ ngoài thật là bậc chứng chỉ)'));
  }
  async function stepCert() {
    const v = await vetted(flow.domain), ip = v.ip;
    if (v.private) return fail(N_('{domain} trỏ về địa chỉ nội bộ {ips} — app không gọi địa chỉ nội bộ', { domain: flow.domain, ips: v.error.replace(/^private address /, '') }), N_('Trỏ {domain} về IP công khai của máy', { domain: flow.domain }));
    if (!ip) return fail(N_('Không phân giải được {domain} ({error})', { domain: flow.domain, error: v.error }), N_('Kiểm DNS của máy rồi bấm Kiểm lại'));
    const since = flow.waitSince.cert || (flow.waitSince.cert = d.now());
    const until = d.now() + d.waits.certMs;
    let info = null;
    for (;;) {
      info = await d.tlsInfo(flow.domain, ip);
      if (info.ok && info.authorized && info.matches) { delete flow.waitSince.cert; return ok(N_('Chứng chỉ hợp lệ ({issuer}), hết hạn {date}', { issuer: cut(info.issuer, 80), date: info.validTo }), { expires: info.validTo }); }
      if (cancel || d.now() + d.waits.everyMs > until) break;
      await sleep(d.waits.everyMs);
    }
    if (d.now() - since > d.waits.certFailMs) return fail(N_('Chưa có chứng chỉ sau {min} phút ({error})', { min: Math.round((d.now() - since) / 60000), error: cut(info.error || info.issuer || '-', 120) }),
      N_('Let\'s Encrypt chưa tới được máy từ Internet: kiểm tường lửa của nhà cung cấp (80 + 443), bản ghi AAAA, proxy cam của Cloudflare. Caddy tự thử lại — không cần xin lại'));
    return wait(info.ok && info.staging ? N_('Đang có chứng chỉ thử (staging) — Caddy sẽ tự xin chứng chỉ thật') : N_('Caddy đang xin chứng chỉ (tự thử lại, dùng staging khi lỗi) — app không xin lại'), N_('Đợi vài phút rồi bấm Kiểm lại'));
  }
  // publicUrl tạm → (đường B: connector healthy) → health + metadata OAuth qua tên miền
  async function stepPublic(live) {
    const url = urlOf();
    if (!live) {
      // force: đổi địa chỉ đã được chủ xác nhận ở route (confirmUrlChange) trước khi luồng chạy
      const sp = d.config.setPending(url, { force: true });
      if (!sp || sp.ok === false) return fail(N_('Không bật tạm được publicUrl {url}: {error}', { url, error: cut(sp && sp.error, 160) }));
      flow.pending = true; save();
    }
    if (flow.mode === 'cloudflare') {
      const w = await tunnelReady(live);
      if (w) return w;
    }
    const h = await call(url + '/api/health', { headers: { Accept: 'application/json' } }), hj = jsonOf(h);
    const fixHost = flow.mode === 'proxy' ? N_('Kiểm proxy của bạn chuyển {url} tới gen-chibi (đoạn cấu hình mẫu ở bậc trước)', { url }) : flow.mode === 'caddy' ? N_('Xem log của edge: docker logs gen-chibi-edge') : N_('Xem trạng thái cloudflared ở Hệ thống › Lên mạng, rồi bấm Kiểm lại');
    if (h.status !== 200 || !hj || hj.ok !== true) return fail(N_('{url}/api/health không trả lời đúng ({error})', { url, error: errOf(h) }), fixHost);
    const m = await call(url + '/.well-known/oauth-authorization-server', { headers: { Accept: 'application/json' } }), mj = jsonOf(m);
    if (m.status !== 200 || !mj || mj.issuer !== url) return fail(N_('Metadata OAuth qua {url} chưa đúng ({error}, issuer {issuer})', { url, error: errOf(m), issuer: cut(mj && mj.issuer, 120) || '-' }), N_('OAuth chưa nhận publicUrl mới — cập nhật gen-chibi rồi bấm Kiểm lại'));
    if (flow.mode === 'proxy') {
      const c = await call(url + '/.well-known/gen-chibi-check/' + flow.nonce, { headers: { Accept: 'application/json' } }), cj = jsonOf(c);
      if (c.status !== 200 || !cj || cj.nonce !== flow.nonce) return fail(N_('{url}/.well-known/gen-chibi-check không tới được gen-chibi ({error})', { url, error: errOf(c) }), fixHost);
      if (!cj.forwarded) return fail(N_('Proxy không gửi X-Forwarded-For — app không biết IP thật của khách nên trần đăng nhập theo IP không chia được'), N_('Thêm vào proxy: X-Forwarded-For = IP khách (nginx: proxy_set_header X-Forwarded-For $remote_addr; Caddy tự thêm)'));
    }
    return ok(live ? N_('{url} trả lời (health + metadata OAuth)', { url }) : N_('{url} trả lời (health + metadata OAuth); publicUrl đang bật tạm', { url }));
  }
  // đường B: connector của tunnel healthy (API khi còn token; không thì run/edge-status.json của launcher)
  async function tunnelReady(live) {
    const since = flow.waitSince.tunnel || (flow.waitSince.tunnel = d.now());
    const until = d.now() + d.waits.tunnelMs;
    const cfc = !live && tokenGet() ? client() : null;
    let last = '';
    for (;;) {
      const s = edgeStatus();
      if (cfc) {
        try { const t = await cfc.tunnelStatus(flow.cf.tunnelId); last = t.status; if (t.status === 'healthy') break; }
        catch (e) { return fail(cfDetail(e), cfFix(e)); }
      } else if (s && s.ready) break;
      else last = s ? (s.error || (s.running ? 'starting' : 'stopped')) : 'no status';
      if (cancel || d.now() + d.waits.everyMs > until) {
        if (d.now() - since > d.waits.tunnelFailMs || (s && s.error)) { delete flow.waitSince.tunnel; return fail(N_('Connector cloudflared chưa healthy ({state})', { state: cut(last, 120) }), N_('Máy cần ra Internet qua cổng 7844 (QUIC / HTTP2); xem log của launcher rồi bấm Kiểm lại')); }
        return wait(N_('Đang chờ connector cloudflared kết nối ({state})', { state: cut(last, 120) }), N_('Đợi vài giây rồi bấm Kiểm lại'));
      }
      await sleep(d.waits.everyMs);
    }
    delete flow.waitSince.tunnel;
    return null;
  }
  const blockedFix = () => flow.mode === 'cloudflare'
    ? N_('Tắt Bot Fight Mode (gói Free không skip được bằng luật) và "Block AI bots" cho tên miền này, rồi bấm Kiểm lại')
    : N_('Nếu tên miền đi qua Cloudflare: tắt Bot Fight Mode / "Block AI bots", hoặc tạo luật Skip cho dải IP của Anthropic {ips} (nguồn {source}, kiểm {checked})', { ips: ANTHROPIC.ips.join(', '), source: ANTHROPIC.source, checked: ANTHROPIC.checked });
  // MCP từ Internet (CNS-168): với User-Agent của Claude — bắt luật chặn theo UA; KHÔNG bắt được luật chặn theo IP
  async function stepMcp() {
    const url = urlOf(), ua = { 'User-Agent': UA_CLAUDE, Accept: 'application/json' };
    const p = await call(url + '/.well-known/oauth-protected-resource', { headers: ua }), pj = jsonOf(p);
    if ([403, 429, 503].includes(p.status)) return fail(N_('{path} trả {status} cho User-Agent Claude-User — có luật chặn bot / AI phía trước app', { path: '/.well-known/oauth-protected-resource', status: p.status }), blockedFix());
    if (p.status !== 200 || !pj || pj.resource !== url + '/mcp') return fail(N_('Metadata tài nguyên MCP qua {url} chưa đúng ({error})', { url, error: errOf(p) }), N_('OAuth chưa nhận publicUrl mới — cập nhật gen-chibi rồi bấm Kiểm lại'));
    const m = await call(url + '/mcp', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, ua),
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gen-chibi-online-check', version: '1' } } } });
    if ([403, 429, 503].includes(m.status)) return fail(N_('{path} trả {status} cho User-Agent Claude-User — có luật chặn bot / AI phía trước app', { path: 'POST /mcp', status: m.status }), blockedFix());
    if (m.status !== 401 || !/resource_metadata=/.test(String((m.headers || {})['www-authenticate'] || ''))) return fail(N_('POST /mcp phải trả 401 kèm WWW-Authenticate, nhận {error}', { error: errOf(m) }), N_('Proxy phía trước phải chuyển /mcp thẳng tới gen-chibi (không qua trang đăng nhập), giữ nguyên header WWW-Authenticate'));
    return ok(N_('Agent tới được MCP từ Internet (401 + WWW-Authenticate với User-Agent Claude-User). Không kiểm được luật chặn theo IP (dải Anthropic {ips})', { ips: ANTHROPIC.ips.join(', ') }));
  }
  async function stepPassword() {
    if (d.hasPassword()) return ok(N_('Chủ máy đã có mật khẩu'));
    // đặt mật khẩu (qua /setup, Tài khoản chủ hay genchibi password) → auth báo onPasswordSet → luồng tự đi tiếp tới xong (CNS-201), không cần Kiểm lại
    return wait(N_('Chưa có mật khẩu chủ máy — địa chỉ công khai đang bật tạm, chờ bước cuối này'), N_('Mở {url}/setup, nhập mã setup (lệnh genchibi status in mã) rồi đặt mật khẩu — xong là app tự hoàn tất lên mạng (hoặc trên máy chủ: genchibi password)', { url: urlOf() }));
  }
  // ---- đường B
  function client() {
    const c = d.cloudflare({ token: tokenGet() });
    if (flow.cf && flow.cf.zoneId && flow.cf.accountId) c.use(flow.cf);
    return c;
  }
  async function stepToken() {
    if (!tokenGet()) return fail(N_('Không còn API token trong bộ nhớ (hết phiên wizard hoặc server đã khởi động lại)'), N_('Dán lại API token Cloudflare'));
    const cfc = d.cloudflare({ token: tokenGet() });
    try {
      if (!flow.cf.zone) {
        const zs = (await cfc.zones()).filter(z => z.status === 'active');
        if (zs.length !== 1) {
          flow.choices = zs.map(z => String(z.name).toLowerCase()).filter(n => validDomain(n)).slice(0, 50);
          return fail(zs.length ? N_('Token thấy {n} tên miền — chọn một', { n: zs.length }) : N_('Token không thấy tên miền nào đang active'), zs.length ? N_('Chọn tên miền rồi gửi lại') : N_('Tên miền phải ở tài khoản Cloudflare này và token phải có quyền Zone › Zone › Read'));
        }
        flow.cf.zone = String(zs[0].name).toLowerCase();
        if (!validDomain(flow.cf.zone)) return fail(N_('Tên miền {zone} không hợp lệ', { zone: cut(flow.cf.zone, 80) }), null);
      }
      flow.choices = null;
      const v = await cfc.verify(flow.cf.zone);
      if (!v.found) return fail(N_('Token không thấy tên miền {zone}', { zone: flow.cf.zone }), N_('Tên miền phải ở tài khoản Cloudflare này và token phải có quyền Zone › Zone › Read'));
      Object.assign(flow.cf, { zoneId: v.zoneId, accountId: v.accountId, status: v.status, type: v.type, waf: v.perms.waf.ok });
      if (!v.perms.tunnel.ok) return fail(cfDetail(v.perms.tunnel.error), N_('Token thiếu quyền Account › Cloudflare Tunnel › Edit — tạo lại token bằng link điền sẵn'));
      if (!v.perms.dns.ok) return fail(cfDetail(v.perms.dns.error), N_('Token thiếu quyền Zone › DNS › Edit — tạo lại token bằng link điền sẵn'));
      return ok(v.perms.waf.ok ? N_('Token hợp lệ: có quyền tunnel, DNS và WAF') : N_('Token hợp lệ: có quyền tunnel và DNS; không có quyền WAF (bậc WAF sẽ cần làm tay)'));
    } catch (e) { return fail(cfDetail(e), cfFix(e)); }
  }
  async function stepZone() {
    const cf = flow.cf;
    if (cf.status !== 'active') return fail(N_('Tên miền {zone} chưa active ở Cloudflare (trạng thái {status})', { zone: cf.zone, status: cut(cf.status, 30) }), N_('Đổi nameserver ở nhà đăng ký sang nameserver của Cloudflare (có thể mất tới 24 giờ), rồi bấm Kiểm lại'));
    if (cf.type !== 'full') return fail(N_('Tên miền {zone} dùng kiểu {type} — tunnel cần kiểu full (nameserver Cloudflare)', { zone: cf.zone, type: cut(cf.type, 30) }), N_('Chuyển tên miền sang full setup (nameserver của Cloudflare)'));
    const host = validDomain(cf.sub + '.' + cf.zone);
    if (!host) return fail(N_('Tên con {sub} không hợp lệ', { sub: cut(cf.sub, 63) }), N_('Dùng một nhãn: chữ thường, số, dấu gạch ngang'));
    flow.domain = host;
    try {
      const cfc = client(), t = await cfc.findTunnel(tunnelName());
      const conflicts = await cfc.dnsConflicts(host, t && t.id);
      if (conflicts.length && !cf.overwrite) {
        flow.needs = 'confirm'; flow.conflicts = conflicts;
        return fail(N_('{host} đã có bản ghi DNS khác: {records}', { host, records: conflicts.map(x => x.type + ' ' + x.content).join(', ') }), N_('Chọn tên con khác, hoặc xác nhận để app thay các bản ghi đó bằng CNAME tới tunnel'));
      }
      flow.needs = null; flow.conflicts = null;
      return ok(N_('Tên miền {zone} active; dùng {host}', { zone: cf.zone, host }));
    } catch (e) { return fail(cfDetail(e), cfFix(e)); }
  }
  async function stepTunnel() {
    const cf = flow.cf, name = tunnelName(), service = 'http://127.0.0.1:' + tunnelPort;
    try {
      const cfc = client();
      let t = await cfc.findTunnel(name), made = false;
      if (!t) { t = await cfc.createTunnel(name); made = true; }
      cf.tunnelId = t.id; cf.tunnelName = name;
      d.config.set({ cfResources: { installId: installId(), zone: cf.zone, zoneId: cf.zoneId, accountId: cf.accountId, tunnelId: t.id, tunnelName: name, host: flow.domain } });   // để Go offline dọn được kể cả khi luồng dừng giữa chừng
      await cfc.putIngress(t.id, flow.domain, service);
      const c = await cfc.ensureCname(flow.domain, t.id, { overwrite: cf.overwrite === true, comment: 'gen-chibi (' + name + ')' });
      if (c.result === 'conflict') {
        flow.needs = 'confirm'; flow.conflicts = c.records;
        return fail(N_('{host} đã có bản ghi DNS khác: {records}', { host: flow.domain, records: c.records.map(x => x.type + ' ' + x.content).join(', ') }), N_('Chọn tên con khác, hoặc xác nhận để app thay các bản ghi đó bằng CNAME tới tunnel'));
      }
      cf.cname = c.result;
      const tok = await cfc.getTunnelToken(t.id);
      writeAtomic(files.tunnelToken, tok, 0o600);
      writeIntent('token');
      return ok(N_('Tunnel {name} ({how}) → {host} qua cổng riêng {port}; {cname}; tunnel token đã lưu (0600)', { name, how: made ? N_('mới tạo') : N_('đã có'), host: flow.domain, port: tunnelPort, cname: CNAME[c.result] }));
    } catch (e) { return fail(cfDetail(e), cfFix(e)); }
  }
  const wafManual = extra => fail(N_('Token không có quyền WAF — app không tự mở đường cho agent được'),
    N_('Cloudflare › Security › WAF › Custom rules: tạo luật Skip (bỏ qua managed rules, rate limit, Super Bot Fight Mode, User Agent Blocking, Browser Integrity Check, Security Level) với biểu thức {expr} — xong bấm "Tôi đã làm"', { expr: machineExpression(flow.domain) }), Object.assign({ manual: true }, extra));
  async function stepWaf() {
    if (!flow.cf.waf) return wafManual();
    try {
      const r = await client().wafSkipRule(flow.domain, tunnelName());
      if (r.result === 'needs_manual') return wafManual({ cfStatus: r.status, cfCode: cut(r.cfCode, 40) });
      flow.cf.wafRule = { rulesetId: r.rulesetId || '', ruleId: r.ruleId || '' };
      const res = cfRes();
      if (res && ownsCf(res)) d.config.set({ cfResources: Object.assign({}, res, { wafRulesetId: flow.cf.wafRule.rulesetId, wafRuleId: flow.cf.wafRule.ruleId }) });   // id luật WAF cùng installId
      return ok(N_('Luật WAF Skip cho đường máy ({how}). Lưu ý: Bot Fight Mode của gói Free không skip được bằng luật', { how: WAFR[r.result] || WAFR.exists }));
    } catch (e) {
      // Cloudflare từ chối luật (vd gói không cho skip một pha — chưa xác minh, spike P0) → làm tay + "Tôi đã làm", kèm mã gốc; lỗi mạng → thử lại
      if (e instanceof CfError && e.status) return Object.assign(wafManual({ cfStatus: e.status, cfCode: cut(e.cfCode, 40) }), { detail: cfDetail(e) });
      return fail(cfDetail(e), cfFix(e));
    }
  }
  // ---- proxy riêng / link tạm
  const stepConfig = async () => ok(N_('Dán đoạn cấu hình mẫu (Caddy hoặc nginx) vào proxy của bạn: đường máy (MCP, OAuth) đi thẳng, đường người qua đăng nhập của bạn nếu có'));
  async function stepQuick() {
    writeIntent('quick');
    const until = d.now() + d.waits.tunnelMs;
    let url = '';
    for (;;) {
      url = quickUrl();
      const s = edgeStatus();
      if (url) break;
      // ingress-unverified: launcher chưa thấy cổng riêng chứng minh là app này (app vừa mở cổng — đợi tới hết hạn; còn mãi = tiến trình khác giữ cổng)
      if (s && s.error && s.error !== 'ingress-unverified') return fail(N_('cloudflared báo lỗi: {error}', { error: s.error }), N_('Máy cần ra Internet qua cổng 7844 (QUIC / HTTP2); xem log của launcher rồi bấm Kiểm lại'));
      if (cancel || d.now() + d.waits.everyMs > until) {
        if (s && s.error === 'ingress-unverified') return fail(N_('Cổng nghe riêng 127.0.0.1:{port} không chứng minh được là gen-chibi này — launcher không bật cloudflared', { port: tunnelPort }), N_('Có tiến trình khác đang giữ cổng {port}: dừng nó (xem ss -ltnp) rồi bấm Kiểm lại', { port: tunnelPort }));
        return wait(N_('Đang chờ cloudflared mở link tạm…'), N_('Đợi vài giây rồi bấm Kiểm lại'));
      }
      await sleep(d.waits.everyMs);
    }
    flow.url = url; flow.domain = new URL(url).hostname;
    return ok(N_('Link tạm: {url} (đổi mỗi lần khởi động; không dùng cho kết nối OAuth lâu dài)', { url }));
  }
  const STEPS = {
    caddy: { domain: () => stepDomain(true), edge: stepEdge, port: stepPort, cert: stepCert, public: stepPublic, mcp: stepMcp, password: stepPassword },
    cloudflare: { owner: async () => ok(N_('Đã xác nhận chủ máy')), token: stepToken, zone: stepZone, tunnel: stepTunnel, public: stepPublic, waf: stepWaf, mcp: stepMcp, password: stepPassword },
    proxy: { domain: () => stepDomain(false), config: stepConfig, public: stepPublic, mcp: stepMcp, password: stepPassword },
    quick: { tunnel: stepQuick, public: stepPublic, mcp: stepMcp, password: stepPassword }
  };

  // ---------------------------------------------------------------- chạy
  let running = null, cancel = false, offQueued = false;
  function kick(fn) {
    const p = MSG.exit(() => (async () => {
      try { await fn(); } catch (e) { d.log('[online] unexpected error: ' + cut(MSG.en(e.message), 300)); }
      finally { dnsCache = null; if (running === p) running = null; }
    })());
    running = p;
    return p;
  }
  function put(st, r) {
    st.state = r.state; st.detail = r.detail || null; st.fix = r.fix || null; st.at = iso();
    ['manual', 'expires', 'cfStatus', 'cfCode'].forEach(k => { if (r[k] !== undefined) st[k] = r[k]; else delete st[k]; });
    save();
  }
  async function advance(live) {
    dnsCache = {};
    const ids = live ? LIVE[flow.mode] : FLOWS[flow.mode];
    for (const id of ids) {
      if (cancel) return;
      const st = stepOf(id);
      if (!live && st.state === 'ok') continue;
      put(st, { state: 'running', detail: N_('Đang kiểm…') });
      let r;
      try { r = await STEPS[flow.mode][id](live); } catch (e) { r = fail(N_('Lỗi không lường trước: {error}', { error: cut(e.message) })); }
      put(st, r);
      if (r.state !== 'ok') {
        if (r.state === 'fail' && !live && flow.pending) {   // ✗ sau khi publicUrl bật tạm → trả về giá trị cũ; bậc public chạy lại lần sau
          d.config.revert(); flow.pending = false;
          const pub = stepOf('public');
          if (pub && pub !== st) put(pub, { state: 'pending', detail: N_('publicUrl đã trả về giá trị cũ — bậc này chạy lại khi bấm Kiểm lại') });
          save();
        }
        return;
      }
    }
    if (!live) finish();
  }
  // xong: publicUrl chính thức, mode mới, dọn edge cục bộ của mode cũ, bỏ token API (giữ chỉ khi chủ chọn)
  function finish() {
    // chính thức hoá publicUrl = OAuth gỡ kết nối agent của địa chỉ khác (onCommit → oauth.prune). Luồng không biết địa chỉ lúc bắt đầu (link tạm, Cloudflare
    // không ghi tên miền) chưa hỏi chủ → dừng needs 'urlChange' như các luồng khác; chủ xác nhận bằng recheck { confirmUrlChange: true } (review bảo mật 🟡8)
    if (!flow.urlOk && typeof d.config.preview === 'function') {
      const pv = d.config.preview(urlOf()), n = pv && pv.ok ? +pv.revokes || 0 : 0;
      if (n > 0) { flow.needs = 'urlChange'; flow.revokes = n; save(); d.log('[online] ' + n + ' agent connection(s) would be revoked by the new public address - waiting for the owner to confirm'); return; }
    }
    const prev = flowMode((d.config.get() || {}).mode || 'off');
    d.config.commit(); flow.pending = false;
    d.config.set({ mode: cfgMode(flow.mode), domain: flow.domain, clientIpHeader: flow.mode === 'proxy' ? 'x-forwarded-for' : '' });
    if (prev === 'caddy' && flow.mode !== 'caddy') clearCaddy().catch(e => d.log('[online] caddy cleanup: ' + cut(e.message)));
    if (['cloudflare', 'quick'].includes(prev) && !['cloudflare', 'quick'].includes(flow.mode)) { try { fs.rmSync(files.tunnelToken, { force: true }); } catch (e) { /* không có */ } }
    writeIntent(flow.mode === 'cloudflare' ? 'token' : flow.mode === 'quick' ? 'quick' : 'off', true);   // online: true — launcher giữ edge khi cập nhật
    if (flow.mode === 'cloudflare') { if (mem && mem.keep && d.secrets) d.secrets.set(SECRET_KEY, mem.token); dropToken(); }
    flow.done = true; flow.doneAt = iso(); flow.needs = null; delete flow.revokes;
    save();
    d.log('[online] online via ' + flow.mode + ' at ' + urlOf());
  }
  // luồng dừng ĐÚNG ở bậc "mật khẩu chủ" (mọi bậc trước đã ✓, publicUrl đang bật tạm)
  function waitingPassword() {
    if (!flow || flow.done || flow.mode === 'off' || flow.needs) return false;
    const st = flow.steps.find(s => s.state !== 'ok');
    return !!st && st.id === 'password';
  }
  // auth.setPassword → main.js → đây (CNS-201): đang chờ mật khẩu thì chạy tiếp ngay tới finish() (mode / publicUrl chính thức / online: true / bỏ API token).
  // Lượt khác đang chạy → đợi nó xong rồi xét lại (lượt đó tới bậc mật khẩu thì tự thấy đã có)
  function passwordSet() {
    if (running || offQueued) { waitRun().then(() => { if (!offQueued) passwordSet(); }); return false; }
    if (!waitingPassword() || !d.hasPassword()) return false;
    d.log('[online] owner password set: finishing Go online (' + flow.mode + ')');
    kick(() => advance(false));
    return true;
  }
  // khôi phục sao lưu (CNS-202): data/ có thể của máy khác → không mang trạng thái online sang. mode off, publicUrl rỗng, bỏ luồng, intent off (tunnel dừng),
  // xoá run/tunnel.token + install-id (lần Go online sau dùng tên tunnel mới — không giành tunnel của máy gốc), bỏ site Caddy. Giữ cfResources: nó mang installId cũ
  // nên Go offline ở đây chỉ báo (CNS-213), không xoá tài nguyên của máy gốc
  function resetAfterRestore() {
    flow = null;
    try { writeIntent('off', false); } catch (e) { d.log('[online] restore: ' + cut(e.message)); }
    [files.tunnelToken, files.installId].forEach(f => { try { fs.rmSync(f, { force: true }); } catch (e) { /* không có */ } });
    try { d.config.revert(); } catch (e) { /* .env kế thừa: chỉ đọc */ }
    const r = d.config.set({ mode: 'off', domain: '', clientIpHeader: '', publicUrl: '', flow: null });
    clearCaddy().catch(e => d.log('[online] caddy cleanup: ' + cut(e.message)));
    d.log('[online] backup restored: Go online is off on this machine (new install id; run Go online again to put it online)');
    return r;
  }
  async function clearCaddy() {
    if (!caddy.enabled() || !(await caddy.adminUp())) return 'skipped';
    caddy.writeSites([]); await caddy.reload(); return 'cleared';
  }
  async function goOff(token) {
    const prev = flow, res0 = (d.config.get() || {}).cfResources || null;
    flow = newFlow('off', { domain: prev ? prev.domain : '' });
    save();
    // cục bộ: dừng tunnel, bỏ site Caddy, bỏ publicUrl
    const local = stepOf('local');
    try {
      writeIntent('off', false);
      fs.rmSync(files.tunnelToken, { force: true });
      let c = 'skipped'; try { c = await clearCaddy(); } catch (e) { c = 'error'; d.log('[online] caddy cleanup: ' + cut(e.message)); }
      d.config.revert();
      const r = d.config.set({ mode: 'off', domain: '', clientIpHeader: '', publicUrl: '' });
      if (r && r.ok === false) throw new Error(r.error);
      put(local, c === 'error' ? fail(N_('Đã dừng tunnel và bỏ publicUrl; Caddy không nạp được cấu hình trống'), N_('Xem log của edge: docker logs gen-chibi-edge')) : ok(N_('Đã dừng tunnel, bỏ site Caddy và publicUrl')));
    } catch (e) { put(local, fail(N_('Lỗi không lường trước: {error}', { error: cut(e.message) }))); }
    // Cloudflare: xoá DNS + tunnel + luật WAF do app tạo (cần token: vừa dán hoặc đã giữ mã hoá)
    // tài nguyên ghi ở bậc tunnel (cfResources) — còn cả khi luồng Cloudflare dừng giữa chừng hoặc đã bị luồng khác thay
    const remote = stepOf('remote'), cf = res0 && res0.tunnelId ? res0 : null;
    if (!cf) put(remote, ok(N_('Không có gì cần dọn ở Cloudflare')));
    else if (!ownsCf(cf)) {
      // CNS-213: của bản cài khác (sao lưu khôi phục từ máy khác) — không đụng tới Cloudflare, nói rõ cái gì còn và ai giữ; bỏ bản ghi để máy này không bao giờ xoá nhầm
      put(remote, ok(N_('Không xoá gì ở Cloudflare: tunnel {name} và CNAME {host} (cùng luật WAF nếu có) do một bản cài khác tạo — máy cũ của bản sao lưu, hoặc máy này trước khi khôi phục. Chúng vẫn ở Cloudflare và thuộc về máy đó: Go offline trên máy đó, hoặc xoá tay ở dash.cloudflare.com (Zero Trust › Networks › Tunnels và DNS)', { name: cut(cf.tunnelName, 64), host: cut(cf.host, 253) })));
      d.config.set({ cfResources: null });
      d.log('[online] offline: Cloudflare resources of another install left untouched (tunnel ' + cut(cf.tunnelName, 64) + ', host ' + cut(cf.host, 253) + ')');
    } else {
      const tok = token || kept();
      if (!tok) put(remote, fail(N_('Tunnel {name} và CNAME {host} vẫn còn ở Cloudflare (không có API token để xoá)', { name: cf.tunnelName, host: cf.host }), N_('Dán API token để app xoá, hoặc xoá tay ở dash.cloudflare.com (Zero Trust › Networks › Tunnels và DNS)'), { manual: true }));
      else {
        try {
          const cfc = d.cloudflare({ token: tok }); cfc.use(cf);
          const r = await cfc.teardown({ host: cf.host, tunnelId: cf.tunnelId, tag: cf.tunnelName });
          if (r.errors.length) put(remote, fail(N_('Dọn Cloudflare chưa hết: {error}', { error: r.errors.map(x => x.part + ' ' + x.status + ' (' + x.cfCode + ') ' + x.error).join('; ') }), N_('Thử lại, hoặc xoá tay ở dash.cloudflare.com')));
          else put(remote, ok(N_('Đã dọn Cloudflare: DNS {dns}, tunnel {tunnel}, luật WAF {waf}', { dns: r.dns, tunnel: r.tunnel, waf: r.waf })));
          if (!r.errors.length) { d.config.set({ cfResources: null }); if (d.secrets) d.secrets.set(SECRET_KEY, ''); }
        } catch (e) { put(remote, fail(cfDetail(e), cfFix(e))); }
      }
    }
    dropToken();
    flow.done = true; flow.doneAt = iso(); save();
    d.log('[online] offline');
  }
  // nút "Migrate" (máy kế thừa, CNS-177): cấu hình ra ngoài bằng .env (GC_PUBLIC_URL / GC_ALLOWED_HOSTS) → chép vào data/online.json, từ đó app nhận quyền
  // (online-config.migrate). Không đụng .env, không đổi publicUrl (kết nối agent giữ nguyên); wizard hết chỉ đọc
  function migrate() {
    const lg = d.legacy();
    if (!lg || !lg.active) return { ok: false, error: tr(SRC, 'không có cấu hình .env kế thừa để di chuyển') };
    const r = d.config.migrate();
    if (!r || r.ok === false) return { ok: false, error: tr(SRC, 'không di chuyển được: {error}', { error: cut(r && r.error, 160) }) };
    flow = null; save();
    d.log('[online] legacy .env online settings moved into data/online.json (mode ' + (r.mode || 'off') + ')');
    return { ok: true };
  }
  async function waitRun() { while (running) { try { await running; } catch (e) { /* đã ghi log */ } } }
  async function idle() { while (running || offQueued) { if (running) await waitRun(); else await sleep(5); } }   // test / CLI: chờ hết việc nền (kể cả off đang xếp hàng)

  // ---- trần tần suất cho lệnh chạy (CNS-180): cách nhau ≥ minGapMs, ≤ perHour lần / giờ
  const hits = [];
  function gate() {
    const t = d.now();
    while (hits.length && t - hits[0] > 3600e3) hits.shift();
    if (hits.length && t - hits[hits.length - 1] < d.rate.minGapMs) return Math.ceil((d.rate.minGapMs - (t - hits[hits.length - 1])) / 1000) || 1;
    if (hits.length >= d.rate.perHour) return Math.ceil((3600e3 - (t - hits[0])) / 1000) || 1;
    hits.push(t);
    return 0;
  }

  // ---------------------------------------------------------------- xem (dịch theo người gọi)
  function tx(x, lang) {
    if (!x || typeof x !== 'object' || typeof x.msg !== 'string') return null;
    let vars = null;
    if (x.vars) { vars = {}; Object.keys(x.vars).forEach(k => { const v = x.vars[k]; vars[k] = v && typeof v === 'object' && typeof v.msg === 'string' ? tx(v, lang) : v; }); }
    return MSG._t(x.msg, vars, lang);
  }
  function view(req, lang) {
    const c = d.config.get() || {}, h = (req && req.headers) || {};
    const f = flow && {
      mode: flow.mode, domain: flow.domain, url: urlOf(), startedAt: flow.startedAt, done: !!flow.done, doneAt: flow.doneAt || null, pending: !!flow.pending,
      needs: flow.needs || null, conflicts: flow.conflicts || null, choices: flow.choices || null, revokes: flow.needs === 'urlChange' ? +flow.revokes || 0 : 0, waitingPassword: waitingPassword(),
      steps: flow.steps.map(s => Object.assign({ id: s.id, state: s.state, detail: tx(s.detail, lang), fix: tx(s.fix, lang), at: s.at }, s.manual ? { manual: true } : {}, s.expires ? { expires: s.expires } : {})),
      cloudflare: flow.cf ? { zone: flow.cf.zone || '', sub: flow.cf.sub || '', tunnelName: flow.cf.tunnelName || '', cname: flow.cf.cname || '', waf: !!flow.cf.waf, overwrite: !!flow.cf.overwrite } : null
    };
    return {
      mode: flowMode(c.mode || 'off'), domain: c.domain || '', publicUrl: c.publicUrl || '', publicUrlPending: c.publicUrlPending || '', busy: !!running || offQueued, flow: f,
      edge: { docker: !!d.inDocker, caddyEnabled: caddy.enabled(), tunnelPort, tunnelListening: !!d.tunnel.listening(), intent: intent(), status: edgeStatus() },
      legacy: d.legacy(),
      request: { edge: (req && req.gcEdge) || null, ip: (req && req.gcIp) || null, forwarded: !!(h['x-forwarded-for'] || h.forwarded) },
      cloudflare: { tokenLink: tokenLink(), tokenInMemory: !!tokenGet(), tokenKept: !!kept() },
      anthropic: ANTHROPIC,
      snippets: flow && flow.mode === 'proxy' && flow.domain ? snippets(flow.domain, +d.port || 7480) : null
    };
  }

  // ---------------------------------------------------------------- route /api/online/* (main.js: đã qua X-GC-Request + Origin cho lệnh thay đổi)
  async function route(req, res, p, m, h) {
    const send = h.send, lang = h.lang || 'en';
    if (!d.isOwner(req)) return send(res, 403, { error: tr(SRC, 'chỉ chủ máy được điều khiển Go online') });
    if (p === '/api/online' && m === 'GET') return send(res, 200, view(req, lang));
    if (m !== 'POST' || !/^\/api\/online\/(caddy|cloudflare|cloudflare\/confirm|proxy|quick|recheck|off|migrate)$/.test(p)) return send(res, 404, { error: tr(SRC, 'không có API này') });
    const b = await h.body(req, 16 * 1024);
    const bad = msg => send(res, 400, { error: msg });
    if (p !== '/api/online/off' && (running || offQueued)) return send(res, 409, { error: tr(SRC, 'Go online đang chạy — đợi xong rồi thử lại') });
    const w = gate();
    if (w) return send(res, 429, { error: tr(SRC, 'quá nhiều lần kiểm — thử lại sau {n} giây', { n: w }) }, null, { 'Retry-After': String(w) });
    if (p === '/api/online/migrate') { const r = migrate(); return r.ok ? send(res, 200, view(req, lang)) : send(res, 409, { error: r.error }); }
    const start = (mode, extra, url) => {
      const lg = d.legacy();
      if (lg && lg.active) return send(res, 409, { error: tr(SRC, 'máy đang cấu hình ra ngoài bằng .env (GC_PUBLIC_URL / GC_ALLOWED_HOSTS) — di chuyển sang Go online trước'), needs: 'legacy' });
      const cur = String((d.config.get() || {}).publicUrl || '');
      // kết nối OAuth của địa chỉ khác (kể cả còn sót sau Go offline) sẽ bị thu hồi khi chính thức hoá → cũng hỏi chủ (online-config preview đếm)
      const pv = url && typeof d.config.preview === 'function' ? d.config.preview(url) : null, revokes = pv && pv.ok ? +pv.revokes || 0 : 0;
      if (((cur && (!url || url !== cur)) || revokes > 0) && b.confirmUrlChange !== true) return send(res, 409, { error: tr(SRC, 'đổi địa chỉ công khai sẽ ngắt các agent đã nối (phải nối lại) — gửi lại với confirmUrlChange: true'), needs: 'urlChange', from: cur, to: url || null, revokes });
      flow = newFlow(mode, Object.assign({}, extra, { urlOk: b.confirmUrlChange === true })); save();   // urlOk: chủ đã xác nhận đổi địa chỉ — finish() không hỏi lại
      kick(() => advance(false));
      return send(res, 202, view(req, lang));
    };
    if (p === '/api/online/caddy' || p === '/api/online/proxy') {
      const dom = validDomain(b.domain);
      if (!dom) return bad(tr(SRC, 'tên miền không hợp lệ (chỉ tên kiểu chibi.example.com — không IP, không *, không cổng)'));
      return start(p === '/api/online/caddy' ? 'caddy' : 'proxy', { domain: dom }, 'https://' + dom);
    }
    if (p === '/api/online/cloudflare') {
      if (b.token !== undefined && (typeof b.token !== 'string' || !TOKEN_RE.test(b.token))) return bad(tr(SRC, 'API token Cloudflare không đúng dạng'));
      const tok = typeof b.token === 'string' ? b.token : tokenGet();
      if (!tok) return bad(tr(SRC, 'cần API token Cloudflare'));
      const zone = b.zone === undefined || b.zone === '' ? '' : validDomain(b.zone);
      if (b.zone && !zone) return bad(tr(SRC, 'tên miền không hợp lệ (chỉ tên kiểu chibi.example.com — không IP, không *, không cổng)'));
      const sub = b.sub === undefined || b.sub === '' ? 'chibi' : (typeof b.sub === 'string' ? b.sub.toLowerCase() : '');
      if (!SUB_RE.test(sub) || (zone && !validDomain(sub + '.' + zone))) return bad(tr(SRC, 'tên con không hợp lệ (một nhãn: chữ thường, số, dấu gạch ngang)'));
      mem = { token: tok, at: d.now(), keep: b.keepToken === true };
      return start('cloudflare', { domain: zone ? sub + '.' + zone : '', cf: { zone, sub, overwrite: false } }, zone ? 'https://' + sub + '.' + zone : '');
    }
    if (p === '/api/online/quick') return start('quick', {}, '');
    if (p === '/api/online/cloudflare/confirm') {
      if (!flow || flow.mode !== 'cloudflare' || flow.needs !== 'confirm') return send(res, 409, { error: tr(SRC, 'không có gì chờ xác nhận') });
      if (b.overwriteCname !== true) { flow.needs = null; save(); return send(res, 200, view(req, lang)); }   // không đè: chủ chọn tên con khác (POST /cloudflare lại)
      if (!tokenGet()) return bad(tr(SRC, 'cần API token Cloudflare'));
      flow.cf.overwrite = true; flow.needs = null; save();
      kick(() => advance(false));
      return send(res, 202, view(req, lang));
    }
    if (p === '/api/online/recheck') {
      if (!flow || flow.mode === 'off') return send(res, 409, { error: tr(SRC, 'chưa có luồng Go online nào') });
      if (flow.needs === 'urlChange') {   // finish() đang chờ chủ xác nhận gỡ kết nối agent của địa chỉ cũ
        if (b.confirmUrlChange !== true) return send(res, 409, { error: tr(SRC, 'đổi địa chỉ công khai sẽ ngắt các agent đã nối (phải nối lại) — gửi lại với confirmUrlChange: true'), needs: 'urlChange', from: String((d.config.get() || {}).publicUrl || ''), to: urlOf() || null, revokes: +flow.revokes || 0 });
        flow.urlOk = true; flow.needs = null; save();
      }
      if (b.confirmManual === 'waf' && flow.mode === 'cloudflare') {   // chủ đã tạo luật WAF bằng tay (token không có quyền WAF)
        const st = stepOf('waf');
        if (st && st.state === 'fail' && st.manual) put(st, ok(N_('Chủ máy xác nhận đã tạo luật Skip bằng tay')));
      }
      kick(() => advance(!!flow.done));
      return send(res, 202, view(req, lang));
    }
    // off: dừng lượt đang chạy (cờ cancel, các vòng chờ thoát sớm) rồi mới dọn
    if (b.token !== undefined && (typeof b.token !== 'string' || !TOKEN_RE.test(b.token))) return bad(tr(SRC, 'API token Cloudflare không đúng dạng'));
    const tok = typeof b.token === 'string' ? b.token : '';
    offQueued = true; cancel = true;
    waitRun().then(() => { cancel = false; offQueued = false; kick(() => goOff(tok)); });
    return send(res, 202, view(req, lang));
  }
  // /.well-known/gen-chibi-check/<nonce>: công khai, chỉ trả lời đúng nonce của luồng hiện tại (bậc kiểm proxy riêng: có X-Forwarded-For không)
  function checkRoute(req, res, p, send) {
    const mm = /^\/\.well-known\/gen-chibi-check\/([a-f0-9]{32})$/.exec(p);
    if (!mm || !flow || flow.mode === 'off' || !flow.nonce || !safeEq(mm[1], flow.nonce)) return send(res, 404, { error: tr(SRC, 'không tìm thấy') });
    const h = req.headers || {};
    return send(res, 200, { nonce: flow.nonce, forwarded: !!(h['x-forwarded-for'] || h.forwarded), edge: req.gcEdge || null });
  }
  // khởi động: tunnel đang bật (intent token | quick) → mở cổng nghe riêng cho cloudflared; sau đó cổng đi theo run/edge-intent.json (nguồn duy nhất của
  // hợp đồng với launcher — ai ghi tệp, kể cả CLI / trình cài, cổng cũng mở / đóng theo) — đọc một tệp nhỏ mỗi 2 s
  let watch = null;
  function init() {
    d.tunnel.set(intent() !== 'off');
    if (waitingPassword() && d.hasPassword()) passwordSet();   // mật khẩu đặt lúc app dừng (genchibi password → auth-cli.js): xong nốt luồng
    if (!watch) { watch = setInterval(() => { if (!running) d.tunnel.set(intent() !== 'off'); }, 2000); if (watch.unref) watch.unref(); }
  }

  return { route, checkRoute, view, init, intent, idle, migrate, passwordSet, waitingPassword, resetAfterRestore, files, tunnelPort, _flow: () => flow };
}

module.exports = { createOnline, isPublicIp, isCloudflareIp, probeUrl, resolveFresh, traceIp, snippets, ANTHROPIC, CF_IPS, FLOWS };
