// gen-chibi — OAuth 2.1 cho MCP từ xa (v0.19): app vừa là authorization server vừa là resource server.
// © 2026 Gen Labs — All rights reserved.
// Agent (claude.ai, Claude Code…) tự khám phá → tự đăng ký (DCR) → chủ máy bấm "Cấp phép" trên web → agent cầm token gọi /mcp.
// Nguyên tắc: token / mã / secret CHỈ lưu băm sha256 (data/oauth.json); mã cấp phép chỉ nằm trong bộ nhớ (60 s, dùng một lần);
// phạm vi (mcp:read / mcp:write / mcp:owner) ánh xạ vào kênh SẴN CÓ của mcp.js (scopeCtx) — module này không biết tool nào là gì.
// Thuần logic (không đụng HTTP): main.js lo định tuyến + dựng trang; có `now` để test chạy đồng hồ giả.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCOPES = ['mcp:read', 'mcp:write', 'mcp:owner'];            // thứ tự = mức quyền tăng dần
const SCOPE_INFO = {
  'mcp:read': { label: 'Chỉ xem', desc: 'Đọc thư viện, tác phẩm, kiểm công thức, dựng ảnh xem thử. Không lưu gì.' },
  'mcp:write': { label: 'Tạo và sửa', desc: 'Như link MCP có khoá: tạo / sửa nhân vật, vật phẩm, cảnh, tác phẩm trong dự án. Không tốn lượt giọng AI, không cập nhật hay quay lại bản cũ của app.' },
  'mcp:owner': { label: 'Toàn quyền chủ máy', desc: 'Như token chủ máy: thêm cả giọng AI (tốn lượt), gỡ gói âm, cập nhật / quay lại bản cũ. Chỉ cấp cho agent bạn tin hoàn toàn.' }
};
const DEFAULT_SCOPE = 'mcp:write';
// Callback mặc định cho phép đăng ký (researcher đã kiểm docs Claude): claude.ai / claude.com (URL đang chuyển sang claude.com → cho cả hai) + loopback của CLI (Claude Code)
// — loopback so BỎ QUA port (CLI chọn port ngẫu nhiên), mọi địa chỉ khác so tuyệt đối. Chủ máy thêm client khác bằng GC_OAUTH_REDIRECTS (danh sách, cách nhau dấu phẩy).
const DEFAULT_REDIRECTS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback', 'http://localhost/callback', 'http://127.0.0.1/callback'];
const LOOP = new Set(['127.0.0.1', 'localhost', '[::1]']);
const MAX = { clients: 50, uris: 5, uri: 512, name: 80, id: 128, state: 512, challenge: 128, scope: 200, secret: 256, code: 256, verifier: 128, pending: 100, codes: 1000, buckets: 5000 };
const TTL = { access: 3600, refresh: 30 * 86400, code: 60, client: 86400, pending: 600, revoked: 7 * 86400, keepUsed: 5 };   // giây (client: hạn của client chưa từng cấp phép — Claude đăng ký client mới mỗi lần Connect; keepUsed: số refresh cũ giữ lại để bắt dùng-lại)

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rnd = n => crypto.randomBytes(n).toString('base64url');
function safeEq(x, y) { const a = Buffer.from(String(x)), b = Buffer.from(String(y)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
// chữ do agent tự khai (tên client): bỏ ký tự điều khiển + ký tự đảo chiều chữ (giả mạo hiển thị), gom khoảng trắng, cắt độ dài
const text = (v, n) => str(v, n * 2).replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const iso = ms => new Date(ms).toISOString();
const oerr = (status, error, error_description, extra) => ({ status, body: Object.assign({ error, error_description }, extra || {}) });

// IP khách để giới hạn tốc độ. Header proxy (cf-connecting-ip, x-real-ip, mục CUỐI của x-forwarded-for = do proxy gần nhất ghi) chỉ đáng tin khi kết nối TRỰC TIẾP tới app là của proxy
// (loopback / mạng riêng: 127/8, ::1, 10/8, 172.16/12, 192.168/16, fc00::/7); ngược lại ai cũng tự đặt được header → dùng địa chỉ socket. Đây chỉ là lớp phụ: trần TOÀN CỤC (limitGlobal) không dựa vào IP.
const PRIVATE_PEER = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:)/i;
function clientIp(headers, peer) {
  peer = String(peer || '').replace(/^::ffff:/i, '');
  if (!PRIVATE_PEER.test(peer)) return peer.slice(0, 64) || '?';
  const h = headers || {};
  return String(h['cf-connecting-ip'] || h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',').pop().trim() || peer).slice(0, 64);
}

// redirect_uri: https hoặc http loopback (CLI); không fragment, không user:pass, độ dài có trần. Trả '' nếu hợp lệ, ngược lại lý do
function shapeRedirect(u) {
  if (typeof u !== 'string' || !u || u.length > MAX.uri || /[\s\u0000-\u001F\u007F]/.test(u)) return 'redirect_uri rỗng, có khoảng trắng hoặc dài quá ' + MAX.uri + ' ký tự';
  if (u.indexOf('#') >= 0) return 'redirect_uri không được có fragment (#)';
  let x; try { x = new URL(u); } catch (e) { return 'redirect_uri không phải URL'; }
  if (x.username || x.password) return 'redirect_uri không được chứa user:pass';
  if (x.protocol === 'http:') return LOOP.has(x.hostname.toLowerCase()) ? '' : 'redirect_uri http chỉ nhận loopback (127.0.0.1 / localhost) — còn lại phải https';
  return x.protocol === 'https:' && x.hostname ? '' : 'redirect_uri phải là https (hoặc http loopback)';
}
// khoá so khớp: loopback bỏ port (RFC 8252 §7.3); địa chỉ khác = chính chuỗi (so tuyệt đối)
function redirectKey(u) {
  let x; try { x = new URL(u); } catch (e) { return u; }
  return x.protocol === 'http:' && LOOP.has(x.hostname.toLowerCase()) ? 'loopback:' + x.hostname.toLowerCase() + x.pathname + x.search : u;
}
// RFC 8707: chuẩn hoá (scheme/host chữ thường, bỏ port mặc định, bỏ "/" cuối) rồi mới so; rỗng = không hợp lệ
function canonResource(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) && !x.search && !x.hash && !x.username ? x.origin + x.pathname.replace(/\/+$/, '') : ''; } catch (e) { return ''; }
}

class OAuth {
  // opts: { dir, publicUrl, now?, accessTtl?, redirects?: [] (thêm vào DEFAULT_REDIRECTS) }
  constructor(opts) {
    // H = origin công khai: scheme + host chữ thường, không port mặc định, không "/" cuối, không đường dẫn. Thiếu / sai thì OAuth tắt
    let raw = ''; try { const x = new URL(String(opts.publicUrl || '')); if (/^https?:$/.test(x.protocol) && (x.pathname === '/' || x.pathname === '') && !x.search && !x.hash && !x.username) raw = x.origin; } catch (e) { raw = ''; }
    this.publicUrl = raw;
    this.enabled = !!raw;
    this.now = opts.now || Date.now;
    this.accessTtl = Math.max(1, Math.min(86400, Math.round(+opts.accessTtl) || TTL.access));
    const extra = (opts.redirects || []).filter(u => !shapeRedirect(u));
    this.redirects = DEFAULT_REDIRECTS.concat(extra);
    this.redirectKeys = new Set(this.redirects.map(redirectKey));
    this.defaultKeys = new Set(DEFAULT_REDIRECTS.map(redirectKey));
    this.file = path.join(opts.dir, 'oauth.json');
    let d = {}; try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { d = {}; }
    this.s = { v: 1, clients: d.clients || {}, grants: d.grants || {}, tokens: d.tokens || {} };
    this.codes = new Map();      // băm mã → { client, redirectUri, challenge, scope, exp, used, grant } — chỉ trong bộ nhớ
    this.pending = new Map();    // id yêu cầu chờ chủ duyệt → { client, redirectUri, state, challenge, requested, resource, exp }
    this.buckets = new Map();    // giới hạn tốc độ theo IP (lớp phụ; đầy thì bỏ khoá cũ nhất)
    this.global = new Map();     // trần TOÀN CỤC theo loại việc (không phụ thuộc IP, không bị dồn ra khỏi bộ nhớ)
    this.useDirty = false;
    // đổi GC_PUBLIC_URL sang miền khác: mọi token cấp cho miền cũ (aud ≠ H/mcp hiện tại) bị gỡ cùng cả chuỗi — kể cả refresh. Chỉ khi OAuth bật (tắt tạm thì giữ nguyên để bật lại còn dùng)
    if (this.enabled) {
      const stale = new Set(Object.keys(this.s.tokens).filter(h => this.s.tokens[h].aud !== this.resource).map(h => this.s.tokens[h].g));
      if (stale.size) { stale.forEach(g => this.dropGrant(g)); this.sweep(); this.save(); }
    }
  }
  get resource() { return this.publicUrl + '/mcp'; }
  get metaUrl() { return this.publicUrl + '/.well-known/oauth-protected-resource/mcp'; }   // RFC 9728 §3.1: hậu tố đường dẫn của resource chèn sau host

  /* ------------------------------------------------------------ lưu trữ */
  save() {
    const tmp = this.file + '.tmp';
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.s, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.useDirty = false;
  }
  flush() { if (this.useDirty) this.save(); }   // lastUsedAt ghi trễ (không ghi đĩa mỗi lời gọi /mcp)

  // dọn: token hết hạn, nhịp refresh cũ, grant mồ côi, client chưa từng cấp phép quá 24 giờ, client đã thu hồi / hết hạn quá 7 ngày
  sweep() {
    const t = this.now(), S = this.s;
    let ch = false;
    for (const h of Object.keys(S.tokens)) if (S.tokens[h].exp <= t) { delete S.tokens[h]; ch = true; }
    for (const gid of Object.keys(S.grants)) {
      if (Object.values(S.tokens).some(x => x.g === gid)) continue;
      const c = S.clients[S.grants[gid].client]; if (c) c.endedAt = iso(t);   // hết hạn tự nhiên: client còn hiện 7 ngày (trạng thái "hết hạn") rồi mới dọn
      delete S.grants[gid]; ch = true;
    }
    for (const id of Object.keys(S.clients)) {
      const c = S.clients[id], live = this.live(id);
      const dead = !c.approvedAt ? Date.parse(c.createdAt) + TTL.client * 1000 <= t && ![...this.pending.values()].some(p => p.client === id)
        : !live && Math.max(Date.parse(c.revokedAt || 0) || 0, Date.parse(c.endedAt || 0) || 0, Date.parse(c.lastUsedAt || 0) || 0, Date.parse(c.approvedAt)) + TTL.revoked * 1000 <= t;
      if (dead) { this.dropClient(id); ch = true; }
    }
    for (const [h, c] of this.codes) if (c.exp + 600000 <= t) this.codes.delete(h);   // giữ thêm 10 phút để mã dùng-lại còn bị nhận ra
    for (const [id, p] of this.pending) if (p.exp <= t) this.pending.delete(id);
    for (const [k, b] of this.buckets) if (b.reset <= t) this.buckets.delete(k);
    for (const [k, b] of this.global) if (b.reset <= t) this.global.delete(k);
    if (ch) this.save();
  }
  live(clientId) { return Object.values(this.s.grants).some(g => g.client === clientId); }
  dropClient(id) {
    Object.keys(this.s.grants).filter(g => this.s.grants[g].client === id).forEach(g => this.dropGrant(g));
    for (const [h, c] of this.codes) if (c.client === id) this.codes.delete(h);
    for (const [k, p] of this.pending) if (p.client === id) this.pending.delete(k);
    delete this.s.clients[id];
  }
  dropGrant(gid) {
    delete this.s.grants[gid];
    for (const h of Object.keys(this.s.tokens)) if (this.s.tokens[h].g === gid) delete this.s.tokens[h];
  }

  /* ------------------------------------------------------------ giới hạn tốc độ (trong bộ nhớ) */
  // trả 0 nếu cho qua, ngược lại số giây phải đợi
  hit(map, key, max, windowSec) {
    const t = this.now(), b = map.get(key);
    if (!b || b.reset <= t) { if (map === this.buckets && map.size >= MAX.buckets) map.delete(map.keys().next().value); map.set(key, { n: 1, reset: t + windowSec * 1000 }); return 0; }
    if (++b.n > max) return Math.max(1, Math.ceil((b.reset - t) / 1000));
    return 0;
  }
  limit(key, max, windowSec) { return this.hit(this.buckets, key, max, windowSec); }                 // theo IP
  limitGlobal(kind, max, windowSec) { return this.hit(this.global, kind, max, windowSec); }          // cho cả máy — chặn trước khi tới lớp theo IP

  /* ------------------------------------------------------------ metadata (RFC 9728 / RFC 8414) */
  protectedResource() {
    return { resource: this.resource, authorization_servers: [this.publicUrl], scopes_supported: SCOPES, bearer_methods_supported: ['header'] };
  }
  // Cố ý KHÔNG khai client_id_metadata_document_supported (có cờ này Claude chuyển sang CIMD) và offline_access
  authServer(registration) {
    const u = p => this.publicUrl + p;
    const m = { issuer: this.publicUrl, authorization_endpoint: u('/oauth/authorize'), token_endpoint: u('/oauth/token') };
    if (registration) m.registration_endpoint = u('/oauth/register');   // chủ tắt "tự đăng ký" thì không quảng cáo
    return Object.assign(m, {
      revocation_endpoint: u('/oauth/revoke'), response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: SCOPES,
      authorization_response_iss_parameter_supported: true   // RFC 9207: redirect có iss=H; thiếu / lệch thì Claude không gọi /token
    });
  }

  /* ------------------------------------------------------------ đăng ký động (RFC 7591) */
  // Chịu được trường lạ và trường thiếu. Không bao giờ cấp client_secret (client công khai + PKCE): token_endpoint_auth_method luôn "none" — client xin khác thì ta thay (RFC 7591 §3.2.1)
  register(b) {
    this.sweep();
    b = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
    const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : null;
    if (!uris || !uris.length) return oerr(400, 'invalid_redirect_uri', 'cần redirect_uris (mảng, 1–' + MAX.uris + ' địa chỉ)');
    if (uris.length > MAX.uris) return oerr(400, 'invalid_redirect_uri', 'tối đa ' + MAX.uris + ' redirect_uris');
    for (const u of uris) {
      const why = shapeRedirect(u);
      if (why) return oerr(400, 'invalid_redirect_uri', why);
      if (!this.redirectKeys.has(redirectKey(u))) return oerr(400, 'invalid_redirect_uri', 'redirect_uri ' + new URL(u).origin + ' không nằm trong danh sách cho phép (claude.ai, claude.com, loopback). Chủ máy thêm bằng GC_OAUTH_REDIRECTS.');
    }
    let grants = ['authorization_code', 'refresh_token'];
    if (Array.isArray(b.grant_types)) { grants = grants.filter(g => b.grant_types.indexOf(g) >= 0); if (grants.indexOf('authorization_code') < 0) return oerr(400, 'invalid_client_metadata', 'grant_types phải có authorization_code'); }
    if (Array.isArray(b.response_types) && b.response_types.length && b.response_types.indexOf('code') < 0) return oerr(400, 'invalid_client_metadata', 'response_types phải có "code"');
    if (Object.keys(this.s.clients).length >= MAX.clients && !this.evict()) return oerr(429, 'temporarily_unavailable', 'đã đủ ' + MAX.clients + ' client đang dùng — chủ máy thu hồi bớt ở Studio › Hệ thống › Kết nối agent', { retry_after: 60 });
    const t = this.now(), id = 'gcc_' + rnd(18);
    const requested = str(b.scope, MAX.scope).split(/\s+/).filter(x => SCOPES.indexOf(x) >= 0);
    const c = { id, name: text(b.client_name, MAX.name) || 'Agent không tên', redirectUris: uris.slice(), grantTypes: grants, createdAt: iso(t), approvedAt: null, scope: DEFAULT_SCOPE, requested };
    this.s.clients[id] = c; this.save();
    return { status: 201, body: { client_id: id, client_id_issued_at: Math.floor(t / 1000), client_name: c.name, redirect_uris: c.redirectUris, token_endpoint_auth_method: 'none', grant_types: grants, response_types: ['code'], scope: (requested.length ? requested : [DEFAULT_SCOPE]).join(' ') } };
  }
  // đầy trần: chỉ xoá client CHƯA từng cấp phép và KHÔNG có yêu cầu đang chờ chủ duyệt (cũ nhất trước), rồi client đã chết (hết hạn / thu hồi, không còn token).
  // Client đang chờ duyệt hoặc đang hoạt động không bao giờ bị đẩy ra — còn lại toàn client như vậy → false (register trả 429), để DCR flood không đuổi được client thật
  evict() {
    const all = Object.values(this.s.clients).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const busy = new Set([...this.pending.values()].map(p => p.client));
    const v = all.find(c => !c.approvedAt && !busy.has(c.id)) || all.find(c => c.approvedAt && !this.live(c.id) && !busy.has(c.id));
    if (!v) return false;
    this.dropClient(v.id); return true;
  }

  /* ------------------------------------------------------------ authorize */
  // Trả { page } (lỗi trước khi tin được redirect_uri → trang lỗi, KHÔNG redirect) | { redirect } (lỗi sau đó: về redirect_uri đã đăng ký) | { view } (hiện trang cấp phép).
  authorize(q) {
    this.sweep();
    const p = k => str(q.get ? q.get(k) : q[k], MAX.state + 1);
    const cid = p('client_id'), uri = p('redirect_uri'), state = p('state');
    const c = cid.length <= MAX.id ? this.s.clients[cid] : null;
    if (!c) return { page: 'client_id không tồn tại hoặc đã hết hạn (client chưa được cấp phép tự xoá sau 24 giờ). Quay lại agent và thêm kết nối lại.' };
    // trùng tuyệt đối với bản đã đăng ký (riêng loopback bỏ qua port — CLI chọn port lúc chạy); lệch → trang lỗi, KHÔNG chuyển hướng (không open-redirect)
    if (!uri || uri.length > MAX.uri || shapeRedirect(uri) || !c.redirectUris.some(r => r === uri || redirectKey(r) === redirectKey(uri))) return { page: 'redirect_uri không trùng địa chỉ agent đã đăng ký — từ chối, không chuyển hướng.' };
    // danh sách cho phép đổi sau lúc đăng ký (chủ bỏ một mục GC_OAUTH_REDIRECTS) → client cũ cũng mất quyền dùng callback đó
    if (!this.redirectKeys.has(redirectKey(uri))) return { page: 'Địa chỉ quay về ' + new URL(uri).origin + ' không còn nằm trong danh sách cho phép của máy này (GC_OAUTH_REDIRECTS) — từ chối, không chuyển hướng.' };
    const back = (error, description) => ({ redirect: this.redirectTo(uri, { error, error_description: description, state }) });
    if (state.length > MAX.state) return back('invalid_request', 'state dài quá ' + MAX.state + ' ký tự');
    if (p('response_type') !== 'code') return back('unsupported_response_type', 'chỉ hỗ trợ response_type=code');
    const ch = p('code_challenge');
    if (!/^[A-Za-z0-9_-]{43}$/.test(ch) || ch.length > MAX.challenge) return back('invalid_request', 'cần code_challenge (PKCE S256, 43 ký tự base64url)');
    if (p('code_challenge_method') !== 'S256') return back('invalid_request', 'cần code_challenge_method=S256');
    const res = p('resource');
    if (res && canonResource(res) !== this.resource) return back('invalid_target', 'resource phải là ' + this.resource);
    const req = p('scope').slice(0, MAX.scope).split(/\s+/).filter(x => SCOPES.indexOf(x) >= 0);
    // gợi ý mức quyền: mức cao nhất agent xin nhưng không quá mcp:write — mcp:owner chỉ khi chủ chủ động chọn
    const top = req.length ? SCOPES[Math.max.apply(null, req.map(x => SCOPES.indexOf(x)))] : '';
    const def = top === 'mcp:read' ? 'mcp:read' : DEFAULT_SCOPE;
    if (this.pending.size >= MAX.pending) this.pending.delete(this.pending.keys().next().value);
    const id = rnd(24);
    this.pending.set(id, { client: c.id, redirectUri: uri, state, challenge: ch, requested: req, resource: res, exp: this.now() + TTL.pending * 1000 });
    return { view: { request: id, client: c.name, callback: this.callbackInfo(uri), requested: req, scope: def, scopes: SCOPES.map(s => Object.assign({ id: s }, SCOPE_INFO[s])), expiresIn: TTL.pending } };
  }
  callbackInfo(uri) {
    const x = new URL(uri), host = x.hostname.toLowerCase();
    return { host, origin: x.origin, loopback: LOOP.has(host), known: this.defaultKeys.has(redirectKey(uri)), added: !this.defaultKeys.has(redirectKey(uri)) && this.redirectKeys.has(redirectKey(uri)) };   // known = claude.ai / claude.com · added = chủ thêm bằng GC_OAUTH_REDIRECTS · loopback = CLI trên máy chủ
  }
  redirectTo(uri, params) {
    const x = new URL(uri);
    Object.keys(params).forEach(k => { if (params[k] !== undefined && params[k] !== '') x.searchParams.set(k, params[k]); });
    x.searchParams.set('iss', this.publicUrl);   // RFC 9207 — Claude từ chối đi tiếp nếu thiếu hoặc lệch iss
    return x.toString();
  }
  // chủ bấm Cấp phép / Từ chối (main.js đã kiểm quyền chủ máy). Trả { redirect } hoặc { status, error }
  approve(id, decision, scope) {
    this.sweep();
    id = String(id || '').slice(0, 64);
    const p = this.pending.get(id);
    if (!p) return { status: 410, error: 'Yêu cầu này đã hết hạn hoặc đã xử lý. Quay lại agent và bấm kết nối lại.' };
    if (decision === 'deny') { this.pending.delete(id); return { redirect: this.redirectTo(p.redirectUri, { error: 'access_denied', error_description: 'chủ máy đã từ chối', state: p.state }) }; }
    if (decision !== 'approve') return { status: 400, error: 'decision phải là approve hoặc deny' };
    if (SCOPES.indexOf(scope) < 0) return { status: 400, error: 'phạm vi không hợp lệ (mcp:read | mcp:write | mcp:owner)' };
    this.pending.delete(id);
    const c = this.s.clients[p.client];
    if (!c) return { status: 410, error: 'Agent này đã bị xoá. Quay lại agent và thêm kết nối lại.' };
    if (this.codes.size >= MAX.codes) this.codes.delete(this.codes.keys().next().value);
    const code = rnd(32);
    this.codes.set(sha(code), { client: c.id, redirectUri: p.redirectUri, challenge: p.challenge, scope, resource: this.resource, exp: this.now() + TTL.code * 1000, used: false, grant: null });
    c.approvedAt = c.approvedAt || iso(this.now()); c.scope = scope; delete c.revokedAt; delete c.endedAt;
    this.save();
    return { redirect: this.redirectTo(p.redirectUri, { code, state: p.state }) };
  }

  /* ------------------------------------------------------------ token */
  // client công khai: chỉ cần client_id (PKCE chứng minh phần còn lại). Không có client_secret ở bất cứ đâu
  authClient(f) {
    const cid = str(f.client_id, MAX.id), c = cid ? this.s.clients[cid] : null;
    return c ? { client: c } : oerr(401, 'invalid_client', 'client_id không tồn tại hoặc đã hết hạn');
  }
  token(f) {
    this.sweep();
    const a = this.authClient(f); if (a.status) return a;
    const c = a.client, gt = str(f.grant_type, 40);
    if (gt !== 'authorization_code' && gt !== 'refresh_token') return oerr(400, 'unsupported_grant_type', 'grant_type: authorization_code | refresh_token');
    if (c.grantTypes.indexOf(gt) < 0) return oerr(400, 'unauthorized_client', 'client này không đăng ký grant_type ' + gt);
    if (f.resource !== undefined && f.resource !== '' && canonResource(str(f.resource, MAX.uri)) !== this.resource) return oerr(400, 'invalid_target', 'resource phải là ' + this.resource);
    if (gt === 'authorization_code') {
      const rec = this.codes.get(sha(str(f.code, MAX.code)));
      if (!rec) return oerr(400, 'invalid_grant', 'code sai hoặc đã hết hạn');
      if (rec.used) { if (rec.grant) this.dropGrant(rec.grant); this.save(); return oerr(400, 'invalid_grant', 'code đã được dùng — token cấp từ code này đã bị thu hồi'); }
      rec.used = true;   // đốt mã ngay: mọi lần thử sau (kể cả sai PKCE) đều không dùng lại được
      if (rec.exp <= this.now()) return oerr(400, 'invalid_grant', 'code đã hết hạn (60 giây)');
      if (rec.client !== c.id) return oerr(400, 'invalid_grant', 'code không thuộc client này');
      if (str(f.redirect_uri, MAX.uri + 1) !== rec.redirectUri) return oerr(400, 'invalid_grant', 'redirect_uri không khớp lúc xin code');
      const v = str(f.code_verifier, MAX.verifier + 1);
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(v)) return oerr(400, 'invalid_request', 'cần code_verifier (43–128 ký tự)');
      if (!safeEq(crypto.createHash('sha256').update(v).digest('base64url'), rec.challenge)) return oerr(400, 'invalid_grant', 'code_verifier không khớp code_challenge (PKCE)');
      const gid = 'g_' + rnd(12);
      this.s.grants[gid] = { id: gid, client: c.id, scope: rec.scope, createdAt: iso(this.now()) };
      rec.grant = gid;
      return { status: 200, body: this.issue(c, gid) };
    }
    // refresh_token: xoay vòng — dùng lại refresh cũ = thu hồi cả chuỗi
    const h = sha(str(f.refresh_token, MAX.code)), t = this.s.tokens[h];
    if (!t || t.k !== 'r') return oerr(400, 'invalid_grant', 'refresh_token sai hoặc đã hết hạn');
    if (t.aud !== this.resource) { this.dropGrant(t.g); this.save(); return oerr(400, 'invalid_grant', 'refresh_token cấp cho địa chỉ khác (đã đổi GC_PUBLIC_URL) — cần cấp phép lại'); }
    const g = this.s.grants[t.g];
    if (!g || g.client !== c.id) return oerr(400, 'invalid_grant', 'refresh_token không thuộc client này');
    if (t.used) { this.dropGrant(t.g); this.save(); return oerr(400, 'invalid_grant', 'refresh_token đã được dùng — cả chuỗi token đã bị thu hồi, cần cấp phép lại'); }
    t.used = true;
    return { status: 200, body: this.issue(c, g.id) };
  }
  issue(c, gid) {
    const t = this.now(), S = this.s, access = rnd(32), refresh = rnd(32), g = S.grants[gid];
    S.tokens[sha(access)] = { k: 'a', g: gid, aud: this.resource, exp: t + this.accessTtl * 1000 };
    const out = { access_token: access, token_type: 'Bearer', expires_in: this.accessTtl, scope: g.scope };
    if (c.grantTypes.indexOf('refresh_token') >= 0) {
      S.tokens[sha(refresh)] = { k: 'r', g: gid, aud: this.resource, exp: t + TTL.refresh * 1000, at: t };   // refresh trượt: mỗi lần xoay vòng được đủ 30 ngày
      out.refresh_token = refresh;
      // chỉ giữ vài refresh đã dùng gần nhất (bắt dùng-lại) — chuỗi dài không phình tệp
      const used = Object.keys(S.tokens).filter(x => S.tokens[x].g === gid && S.tokens[x].k === 'r' && S.tokens[x].used).sort((x, y) => S.tokens[y].at - S.tokens[x].at);
      used.slice(TTL.keepUsed).forEach(x => delete S.tokens[x]);
    }
    this.save();
    return out;
  }
  // RFC 7009: luôn 200 (không lộ token có thật hay không); thu hồi refresh hoặc access = thu hồi cả chuỗi
  revoke(f) {
    const a = this.authClient(f); if (a.status) return a;
    const h = sha(str(f.token, MAX.code)), t = this.s.tokens[h], g = t && this.s.grants[t.g];
    if (g && g.client === a.client.id) { this.dropGrant(g.id); this.save(); }
    return { status: 200, body: {} };
  }

  /* ------------------------------------------------------------ dùng token ở /mcp */
  // Tra bảng theo BĂM sha256 của token 256-bit ngẫu nhiên: kẻ tấn công không điều khiển được băm nên không có kênh phụ thời gian để dò token (khác so khớp chuỗi rõ)
  verify(bearer) {
    if (!this.enabled || typeof bearer !== 'string' || !bearer || bearer.length > MAX.code) return null;
    const t = this.s.tokens[sha(bearer)];
    if (!t || t.k !== 'a' || t.exp <= this.now() || t.aud !== this.resource) return null;   // aud: token chỉ dành cho H/mcp (đổi GC_PUBLIC_URL thì token cũ chết)
    const g = this.s.grants[t.g], c = g && this.s.clients[g.client];
    if (!g || !c) return null;
    g.lastUsedAt = c.lastUsedAt = iso(this.now()); this.useDirty = true;
    return { client: c, grant: g, scope: g.scope };
  }

  /* ------------------------------------------------------------ chủ máy quản lý (Studio › Kết nối agent) */
  // KHÔNG bao giờ trả token / băm / secret
  list() {
    this.sweep();
    return Object.values(this.s.clients).map(c => {
      const grants = Object.values(this.s.grants).filter(g => g.client === c.id);
      const status = !c.approvedAt ? 'pending' : grants.length ? 'active' : c.revokedAt ? 'revoked' : 'expired';
      const best = grants.length ? SCOPES[Math.max.apply(null, grants.map(g => SCOPES.indexOf(g.scope)))] : c.scope;
      return { id: c.id, name: c.name, hosts: c.redirectUris.map(u => this.callbackInfo(u)), scope: best, createdAt: c.createdAt, approvedAt: c.approvedAt, lastUsedAt: c.lastUsedAt || null, status,
        expiresAt: status === 'pending' ? iso(Date.parse(c.createdAt) + TTL.client * 1000) : null };
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  setScope(id, scope) {
    const c = this.s.clients[String(id || '').slice(0, MAX.id)];
    if (!c || SCOPES.indexOf(scope) < 0) return false;
    c.scope = scope;
    Object.values(this.s.grants).filter(g => g.client === c.id).forEach(g => { g.scope = scope; });
    this.save(); return true;
  }
  revokeClient(id) {
    const c = this.s.clients[String(id || '').slice(0, MAX.id)];
    if (!c) return false;
    Object.keys(this.s.grants).filter(g => this.s.grants[g].client === c.id).forEach(g => this.dropGrant(g));
    for (const [h, x] of this.codes) if (x.client === c.id) this.codes.delete(h);
    for (const [k, p] of this.pending) if (p.client === c.id) this.pending.delete(k);
    c.revokedAt = iso(this.now());
    this.save(); return true;
  }
}

module.exports = { OAuth, clientIp, SCOPES, SCOPE_INFO, DEFAULT_SCOPE, DEFAULT_REDIRECTS, TTL, shapeRedirect, canonResource };
