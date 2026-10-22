// gen-chibi — đăng nhập chủ máy (v0.21 spec §3.3 + §3.4; v0.23 spec v023-owner-ready §A.1 / §A.2): mật khẩu · phiên cookie · cookie thiết bị · token chủ ·
// admin / admin lần đầu · khởi tạo tài khoản chủ.
// © 2026 Gen Labs — All rights reserved.
//
// Quyền chủ CHỈ đến từ bằng chứng dương (CNS-191): S = phiên cookie còn hạn · T = token chủ (GC_API_TOKEN hoặc data/owner-token) ·
// A = phiên admin (v0.23 — CHỈ mở màn khởi tạo, 30 phút, không cookie thiết bị; chỉ cấp khi setup.json stage = admin + cửa sổ admin do lệnh trên máy chủ mở +
// máy chưa lên mạng + request từ trình duyệt trên máy — main.js dựng adminCheck, luật ở server/setup.js adminReasons). Mã setup của v0.21 (C) đã bỏ.
// Không có lớp request nào được quyền vì THIẾU một header. Lớp E / P / N chỉ dùng để lấy IP cho trần.
// Trần đăng nhập (CNS-166, L-66): client chưa có bằng chứng → xét trần TRƯỚC khi chạy scrypt (chạm trần = từ chối, không kiểm);
// miễn trừ chỉ bằng bằng chứng: S / T (không trần) · D = cookie thiết bị ký HMAC (trần sai RIÊNG cho từng thiết bị, không chung với kẻ lạ).
// Trần toàn cục: từ ngưỡng mềm thì làm CHẬM (trễ tăng dần + trần số lần kiểm cùng lúc); vượt trần THEO TÀI KHOẢN thì chặn mọi client không có S / T / D
// tới hết cửa sổ (đổi IP không lách được — chủ có cookie thiết bị / token vẫn vào; quên cả hai: `genchibi password`).
// Tệp trong data/ (đều 0600): auth.json (người dùng + phiên + thiết bị; phiên chỉ lưu băm) · owner-token (khi env trống) · legacy.json (dấu máy kế thừa).
// Người dùng: id nội bộ cố định `owner` (OAuth / MCP / trang Cấp phép không đổi — CNS-260); login = tên đăng nhập (đổi được; bản cài cũ chưa có → "owner"),
// displayName, email (tuỳ chọn — chỉ làm email liên hệ Let's Encrypt của đường Caddy, CNS-267).
// Thuần Node (không DOM, không HTTP server): main.js định tuyến; handle() nhận io = { send, body } của main.js. Có `now` để test chạy đồng hồ giả.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { clientIp } = require('./oauth');
const MSG = require('./i18n-msg'), { VI, tr } = MSG;
const { REASON_MSG, loginProblem, displayProblem, emailProblem, WINDOW_MS } = require('./setup');

// scrypt theo OWASP (Password Storage Cheat Sheet): N=2^14, r=8, p=5 ≡ N=2^17, p=1 về chi phí nhưng chỉ 16 MiB bộ nhớ mỗi lần băm (máy nhỏ chạy 4 luồng song song = 64 MiB).
// Tham số lưu trong chuỗi băm ("scrypt$N$r$p$salt$hash") → đổi mặc định về sau thì băm cũ vẫn kiểm được và được băm lại khi đăng nhập đúng.
const SCRYPT = { N: 16384, r: 8, p: 5, keylen: 32, maxmem: 64 * 1024 * 1024 };
const PW = { min: 12, maxBytes: 1024 };
const TTL = { session: 30 * 86400e3, device: 400 * 86400e3, admin: WINDOW_MS };   // ms — cookie thiết bị 400 ngày (trần của trình duyệt) · phiên admin 30 phút
// trần (số lần SAI, cửa sổ giây). ip/dev/sess = khoá; soft = ngưỡng toàn cục bắt đầu làm chậm (nhân GC_AUTH_RATE — chỉ để chạy test số lượng lớn);
// acct = trần THEO TÀI KHOẢN (mọi IP cộng lại, KHÔNG nhân GC_AUTH_RATE): vượt → client không có S / T / D bị CHẶN tới hết cửa sổ — đổi IP không reset được
// (review bảo mật P1: IP do kẻ tấn công kiểm soát được ở lớp P / N thì trần theo IP vô dụng; chủ có cookie thiết bị / token vẫn vào)
const LIMIT = { login: { ip: [10, 900], dev: [10, 900], sess: [10, 900], soft: [50, 900], acct: [100, 900] } };
const SLOW = { step: 250, max: 10000, inflight: 8 };   // trễ = step × (số lần sai toàn cục vượt ngưỡng), tối đa max ms; kiểm cùng lúc của kẻ lạ tối đa inflight
const MAX = { sessions: 100, devices: 50, buckets: 5000, ua: 80 };
const COOKIE = { session: 'gc_session', device: 'gc_device' };

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rnd = n => crypto.randomBytes(n).toString('base64url');
const iso = ms => new Date(ms).toISOString();
function safeEq(x, y) { const a = Buffer.from(String(x)), b = Buffer.from(String(y)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nul = o => Object.assign(Object.create(null), o && typeof o === 'object' && !Array.isArray(o) ? o : {});
function writeSecret(f, data) {   // ghi nguyên tử, 0600 (tệp tạm luôn mới → mode áp đúng; chmod lại phòng tệp tạm sót từ lần sập trước)
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  try { fs.unlinkSync(tmp); } catch (e) { /* không có tệp tạm cũ */ }
  fs.writeFileSync(tmp, data, { mode: 0o600 }); fs.chmodSync(tmp, 0o600); fs.renameSync(tmp, f);
}
function readText(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } }
const rmf = f => { try { fs.unlinkSync(f); } catch (e) { /* đã không còn */ } };

// mật khẩu chủ: ≥ 12 ký tự (đếm theo ký tự, không theo byte), ≤ 1 KB (trần chi phí scrypt), không ký tự điều khiển, không toàn khoảng trắng. '' = hợp lệ
function pwProblem(pw) {
  if (typeof pw !== 'string' || !pw) return 'cần mật khẩu';
  if (Buffer.byteLength(pw) > PW.maxBytes) return tr(VI, 'mật khẩu quá dài (tối đa {n} byte)', { n: PW.maxBytes });
  if (/[\u0000-\u001f\u007f]/.test(pw)) return 'mật khẩu không được chứa ký tự điều khiển (xuống dòng, tab…)';
  if ([...pw].length < PW.min || !pw.trim()) return tr(VI, 'mật khẩu cần ít nhất {n} ký tự — gợi ý: một cụm từ dễ nhớ', { n: PW.min });
  if (pw.trim().toLowerCase() === 'admin') return 'mật khẩu không được là admin';
  return '';
}
function cookiesOf(req) {   // { tên: [giá trị…] } — tên trùng (hai cookie cùng tên) giữ cả, thử lần lượt
  const out = Object.create(null);
  String((req.headers || {}).cookie || '').split(';').forEach(part => {
    const i = part.indexOf('='); if (i < 0) return;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k && v && v.length <= 200) (out[k] = out[k] || []).push(v);
  });
  return out;
}
// tên cookie theo cổng của Host: hai bản cài cùng máy (localhost:7480 / localhost:7481) không giẫm cookie của nhau — cookie không tách theo cổng.
// Host không có cổng (tên miền qua edge / proxy) → tên gốc gc_session / gc_device
function cookieName(base, req) {
  const m = /:(\d{1,5})$/.exec(String((req.headers || {}).host || ''));
  return m ? base + '_' + m[1] : base;
}
// request đi qua https? Chỉ quyết định cờ Secure (không cấp quyền gì): edge của app (luôn TLS ở phía khách) · socket TLS · X-Forwarded-Proto mục cuối ·
// publicUrl (chính thức hoặc đang bật tạm) là https và Host khớp đúng tên đó (review bảo mật 🟡3: proxy riêng tối giản không gửi X-Forwarded-Proto —
// trang vẫn là https ở phía khách, cookie không được đi trần qua http://<tên>/ khi kẻ trên đường mạng chèn link). pub = publicUrl đang phục vụ ('' = không có)
function isHttps(req, pub) {
  if (req.gcEdge === 'caddy' || req.gcEdge === 'tunnel' || (req.socket && req.socket.encrypted)) return true;
  if (String((req.headers || {})['x-forwarded-proto'] || '').split(',').pop().trim().toLowerCase() === 'https') return true;
  if (!pub) return false;
  let u = null; try { u = new URL(pub); } catch (e) { return false; }
  const host = String((req.headers || {}).host || '').toLowerCase().replace(/:\d+$/, '');
  return u.protocol === 'https:' && !!host && host === u.hostname.toLowerCase();
}
function bearerOf(req) { const h = req.headers || {}; return String(h.authorization || '').replace(/^Bearer\s+/i, '') || String(h['x-gc-token'] || ''); }
const uaOf = req => String((req.headers || {})['user-agent'] || '').replace(/[^\x20-\x7e]/g, '').slice(0, MAX.ua);

class Auth {
  // opts: { dir, envToken, key (Buffer — khoá chủ, Secrets.key), log?, now?, ipHeader?: () => tên header IP cho lớp P/N, rate?: GC_AUTH_RATE (main.js chỉ chuyển khi GC_TEST=1),
  //         publicUrl?: () => địa chỉ công khai đang phục vụ (cờ Secure), setup?: Setup (server/setup.js — stage + cửa sổ admin),
  //         adminCheck?: req => [mã lý do] (main.js: setup.adminReasons(ảnh chụp máy, req) — [] = admin / admin được nhận), port?: cổng cho câu hướng dẫn }
  constructor(opts) {
    this.dir = opts.dir;
    this.now = opts.now || Date.now;
    this.log = opts.log || (() => {});
    this.ipHeader = opts.ipHeader || (() => '');
    this.publicUrl = opts.publicUrl || (() => '');
    this.setup = opts.setup || null;
    this.adminCheck = opts.adminCheck || (() => ['stage']);
    this.port = +opts.port || 7480;
    this.initBusy = false;   // một lần khởi tạo owner đang chạy (đang băm scrypt) — request song song thứ hai → 409 (nguyên tử, §A.2)
    this.rate = Math.max(1, Math.min(1000, Math.round(+opts.rate) || 1));
    // khoá con suy từ khoá chủ (HKDF): ký cookie thiết bị — lộ khoá con không lộ khoá chủ
    const key = Buffer.isBuffer(opts.key) && opts.key.length >= 32 ? opts.key : crypto.createHash('sha256').update(String(opts.key || '')).digest();
    this.kDevice = Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), 'gen-chibi device cookie v1', 32));
    this.f = { auth: path.join(this.dir, 'auth.json'), token: path.join(this.dir, 'owner-token'), legacy: path.join(this.dir, 'legacy.json') };
    // v0.23: mã setup v0.21 đã bỏ (thay bằng setup.json stage + cửa sổ admin) — tệp còn sót của bản cũ thì xoá
    ['setup-code', 'setup-code.txt'].forEach(f => { const p = path.join(this.dir, f); if (fs.existsSync(p)) { rmf(p); this.log('[auth] removed the old setup code file data/' + f + ' (v0.23: first run uses admin / admin + the owner account screen)'); } });
    this.s = this.load();
    this.buckets = new Map();   // trần theo khoá (ip / thiết bị / phiên): { n, reset }
    this.pend = new Map();      // số lần thử ĐANG kiểm theo khoá — tính như lần sai cho tới khi có kết quả (gửi song song không vượt được trần)
    this.soft = new Map();      // đếm lần sai toàn cục của kẻ lạ: { n, reset }
    this.acct = new Map();      // trần theo tài khoản (một chủ): lần sai của kẻ lạ — không bị đẩy ra khỏi bộ nhớ. Cửa sổ CỐ ĐỊNH tính từ lần sai đầu
                                // (≤ 15 phút, lần sai trong lúc chặn không kéo dài cửa sổ — không tích luỹ vô hạn)
    this.acctIps = new Map();   // loại → Set IP đã sai trong cửa sổ (≤ 1000) — cho sự kiện báo chủ
    this.inflight = { login: 0 };
    this.dirty = false;
    this.tokenInfo = this.loadToken(String(opts.envToken || ''));
  }

  /* ------------------------------------------------------------ lưu trữ */
  load() {
    let d = {};
    const raw = readText(this.f.auth);
    if (raw !== null) {
      try { d = JSON.parse(raw); if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('not a JSON object'); }
      catch (e) {   // tệp hỏng: không âm thầm ghi đè — đổi tên giữ lại, bắt đầu trống (chưa có mật khẩu; token chủ vẫn vào được; admin / admin KHÔNG mở lại — setup.json + sàn)
        d = {}; const bak = this.f.auth + '.corrupt-' + Date.now();
        try { fs.renameSync(this.f.auth, bak); this.log('[auth] auth.json is corrupt (' + MSG.en(e.message) + ') - renamed to ' + path.basename(bak) + '; the owner password must be set again (genchibi password)'); }
        catch (e2) { this.log('[auth] auth.json is corrupt and could not be renamed: ' + e2.message); }
      }
    }
    return { v: 1, users: nul(d.users), sessions: nul(d.sessions), devices: nul(d.devices), events: Array.isArray(d.events) ? d.events.slice(-20) : [] };
  }
  save() { writeSecret(this.f.auth, JSON.stringify(this.s, null, 1)); this.dirty = false; }
  flush() { if (this.dirty) this.save(); }   // seenAt ghi trễ (không ghi đĩa mỗi request)

  /* ------------------------------------------------------------ token chủ (T) — CNS-195 */
  // GC_API_TOKEN (env) thắng. Env trống → data/owner-token; chưa có / hỏng → sinh 256 bit (0600). Không bao giờ ghi token ra log
  loadToken(env) {
    if (env) return { token: env, source: 'env', generated: false };
    const cur = (readText(this.f.token) || '').trim();
    if (/^[A-Za-z0-9_-]{32,256}$/.test(cur)) return { token: cur, source: 'file', generated: false };
    const t = crypto.randomBytes(32).toString('hex');
    writeSecret(this.f.token, t + '\n');
    this.log('[auth] no GC_API_TOKEN set: generated an owner token in data/owner-token (the CLI and `genchibi mcp` read it from there)');
    return { token: t, source: 'file', generated: true };
  }
  get token() { return this.tokenInfo.token; }
  tokenOk(t) { return !!t && safeEq(t, this.tokenInfo.token); }

  /* ------------------------------------------------------------ dấu máy kế thừa (CNS-173, 199b) */
  // ghi MỘT lần ở lần khởi động đầu của v0.21: env lúc đó có GC_PUBLIC_URL / GC_ALLOWED_HOSTS = máy cấu hình ra ngoài bằng tay từ trước.
  // tokenless: bản cài cũ (đã có dữ liệu) chạy không token → agent nối không token cần nối lại (CNS-197)
  markLegacy(env) {
    let cur = null; try { cur = JSON.parse(readText(this.f.legacy) || 'null'); } catch (e) { cur = null; }
    if (cur && typeof cur === 'object') { this.legacyRec = cur; return cur; }
    const rec = { envPublicUrl: String(env.publicUrl || ''), envAllowedHosts: String(env.allowedHosts || ''), at: iso(this.now()), tokenless: !!env.tokenless };
    writeSecret(this.f.legacy, JSON.stringify(rec, null, 1) + '\n');
    this.legacyRec = rec;
    if (rec.tokenless) this.log('[auth] upgraded from an install without GC_API_TOKEN: agents that connected without a token must reconnect - run `genchibi agent connect` (or use `genchibi mcp`)');
    return rec;
  }
  isLegacy() { const r = this.legacyRec || {}; return !!(r.envPublicUrl || r.envAllowedHosts); }

  /* ------------------------------------------------------------ tài khoản chủ */
  owner() { const u = this.s.users.owner; return u && typeof u.hash === 'string' ? u : null; }
  hasPassword() { return !!this.owner(); }
  // tên đăng nhập của chủ: bản cài ≤ v0.22 chưa có trường login → "owner" (CNS-260)
  loginName() { const u = this.owner(); return u && typeof u.login === 'string' && u.login ? u.login : 'owner'; }
  profile() { const u = this.owner(); return u ? { id: 'owner', login: this.loginName(), displayName: String(u.displayName || '') || this.loginName(), email: String(u.email || '') } : null; }
  stage() { return this.setup ? this.setup.stage : 'done'; }
  initPending() { return ['admin', 'must_init'].includes(this.stage()); }
  async hash(pw) {
    const salt = crypto.randomBytes(16), { N, r, p, keylen, maxmem } = SCRYPT;
    const h = await new Promise((ok, no) => crypto.scrypt(pw, salt, keylen, { N, r, p, maxmem }, (e, k) => e ? no(e) : ok(k)));
    return ['scrypt', N, r, p, salt.toString('base64url'), h.toString('base64url')].join('$');
  }
  async verifyHash(pw, stored) {
    const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(String(stored || ''));
    if (!m) return { ok: false };
    const N = +m[1], r = +m[2], p = +m[3], salt = Buffer.from(m[4], 'base64url'), want = Buffer.from(m[5], 'base64url');
    if (!(N >= 2 && N <= 1 << 17 && (N & (N - 1)) === 0 && r >= 1 && r <= 16 && p >= 1 && p <= 16 && want.length >= 16)) return { ok: false };   // trần bộ nhớ (≤ 270 MB) kể cả khi tệp bị sửa tay
    const got = await new Promise((ok, no) => crypto.scrypt(pw, salt, want.length, { N, r, p, maxmem: Math.max(SCRYPT.maxmem, 129 * N * r) }, (e, k) => e ? no(e) : ok(k)));
    return { ok: crypto.timingSafeEqual(got, want), weak: N < SCRYPT.N || r < SCRYPT.r || p < SCRYPT.p };
  }
  // KHỞI TẠO tài khoản chủ (§A.2) — MỘT thao tác nguyên tử: ghi auth.json (owner: id cố định "owner" + login / displayName / email / băm) + setup.json stage = domain
  // + thu hồi MỌI phiên (gồm mọi phiên admin) + thiết bị. Ghi setup.json lỗi → auth.json trả về như trước rồi ném (không bao giờ "có mật khẩu mà stage vẫn admin").
  // Token chủ giữ nguyên. Gọi khi stage ∈ { admin, must_init }; kiểm lại SAU lần await scrypt (hai request cùng lúc: người sau thua). Trả { revoked }
  async initOwner(o, by) {
    const bad = loginProblem(o.login) || displayProblem(o.displayName) || emailProblem(o.email) || pwProblem(o.password);
    if (bad) throw Object.assign(new Error(bad), { code: 400 });
    const hash = await this.hash(o.password);
    if (!this.initPending()) throw Object.assign(new Error('tài khoản chủ đã được khởi tạo — đăng nhập ở /login'), { code: 409 });
    const prev = { users: this.s.users, sessions: this.s.sessions, devices: this.s.devices };
    const admins = Object.keys(prev.sessions).filter(h => prev.sessions[h].user === 'admin').length, revoked = Object.keys(prev.sessions).length;
    this.s.users = nul(Object.assign({}, prev.users, { owner: { id: 'owner', role: 'owner', login: o.login, displayName: String(o.displayName || '').trim() || o.login, email: String(o.email || ''), hash, setAt: iso(this.now()), by: String(by || '') } }));
    this.s.sessions = nul(); this.s.devices = nul();
    const undo = () => { this.s.users = prev.users; this.s.sessions = prev.sessions; this.s.devices = prev.devices; try { this.save(); } catch (e2) { this.log('[auth] could not restore auth.json after a failed init: ' + e2.message); } };
    try { this.save(); } catch (e) { undo(); throw e; }
    try { if (this.setup) this.setup.advance('domain', by); } catch (e) { undo(); this.log('[auth] owner init rolled back (setup.json could not be written): ' + MSG.en(e.message)); throw e; }
    if (this.setup) this.setup.closeWindow();   // cửa sổ admin hết việc
    this.log('[auth] owner account initialized (' + (by || '?') + '); ' + admins + ' admin session(s) revoked');
    return { revoked };
  }
  // đặt / đổi mật khẩu: thu hồi MỌI phiên + thiết bị (người giữ phiên cũ — kể cả kẻ lạ nếu mật khẩu cũ đã lộ — phải đăng nhập lại).
  // Chưa khởi tạo (stage admin / must_init) → đây CHÍNH là khởi tạo (genchibi password / trình cài): tên đăng nhập o.login hoặc "owner" (đổi được ở Tài khoản chủ).
  // o.initOnly (trình cài): đã khởi tạo rồi thì KHÔNG đổi mật khẩu (409) — chạy lại trình cài không đè mật khẩu của chủ
  async setPassword(pw, by, o) {
    o = o || {};
    const bad = pwProblem(pw); if (bad) throw Object.assign(new Error(bad), { code: 400 });
    if (this.initPending()) {
      const login = o.login || (this.owner() && this.owner().login) || 'owner';
      const r = await this.initOwner({ login, displayName: login, email: '', password: pw }, by);
      return { revoked: r.revoked, init: true, login };
    }
    if (o.initOnly) throw Object.assign(new Error('tài khoản chủ đã được khởi tạo — không đổi mật khẩu (đổi: genchibi password)'), { code: 409 });
    const had = this.hasPassword(), revoked = Object.keys(this.s.sessions).length, cur = this.owner() || {};
    this.s.users.owner = { id: 'owner', role: 'owner', login: this.hasPassword() ? this.loginName() : (o.login || 'owner'), displayName: String(cur.displayName || ''), email: String(cur.email || ''), hash: await this.hash(pw), setAt: iso(this.now()), by: String(by || '') };
    this.s.sessions = nul(); this.s.devices = nul();
    this.save();
    this.log('[auth] owner password ' + (had ? 'changed' : 'set') + ' (' + (by || '?') + '); ' + revoked + ' session(s) revoked');
    return { revoked, login: this.loginName() };
  }
  // Tài khoản chủ: đổi tên đăng nhập / tên hiển thị / email (không thu hồi phiên — tên đăng nhập chỉ là nhãn; id nội bộ vẫn "owner")
  setProfile(b) {
    const u = this.owner(); if (!u) throw Object.assign(new Error('máy chưa có tài khoản chủ — chạy genchibi password trên máy chủ'), { code: 409 });
    const next = { login: b.login !== undefined ? String(b.login).trim().toLowerCase() : this.loginName(), displayName: b.displayName !== undefined ? String(b.displayName).trim() : String(u.displayName || ''), email: b.email !== undefined ? String(b.email).trim() : String(u.email || '') };
    const bad = loginProblem(next.login) || displayProblem(next.displayName) || emailProblem(next.email);
    if (bad) throw Object.assign(new Error(bad), { code: 400 });
    Object.assign(u, { login: next.login, displayName: next.displayName || next.login, email: next.email });
    this.save();
    this.log('[auth] owner profile updated');
    return this.profile();
  }
  ownerEmail() { const u = this.owner(); return u && typeof u.email === 'string' ? u.email : ''; }
  // thu hồi MỌI phiên + thiết bị (giữ mật khẩu) — khôi phục sao lưu (CNS-202): phiên / thiết bị trong bản sao lưu không sống lại
  revokeAll(why) {
    const n = Object.keys(this.s.sessions).length, d = Object.keys(this.s.devices).length;
    this.s.sessions = nul(); this.s.devices = nul(); this.save();
    this.log('[auth] ' + (why || 'revoke') + ': ' + n + ' session(s) and ' + d + ' device(s) revoked');
    return { sessions: n, devices: d };
  }
  async checkPassword(pw) {
    const u = this.owner(); if (!u || typeof pw !== 'string' || Buffer.byteLength(pw) > PW.maxBytes) return false;
    const r = await this.verifyHash(pw, u.hash);
    if (r.ok && r.weak) { u.hash = await this.hash(pw); this.save(); }   // băm cũ yếu hơn mặc định → băm lại khi biết mật khẩu đúng
    return r.ok;
  }

  /* ------------------------------------------------------------ phiên (S) + phiên admin (A) + thiết bị (D) */
  // phiên còn hạn có user `user` ('owner' | 'admin'); cookie hỏng / hết hạn → bỏ qua (hết hạn thì xoá)
  sessOf(req, user) {
    for (const v of cookiesOf(req)[cookieName(COOKIE.session, req)] || []) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(v)) continue;
      const h = sha(v), s = this.s.sessions[h];
      if (!s || s.user !== user) continue;
      if (s.exp <= this.now()) { delete this.s.sessions[h]; this.dirty = true; continue; }
      if (!s.seenAt || Date.parse(s.seenAt) + 60e3 < this.now()) { s.seenAt = iso(this.now()); this.dirty = true; }
      return Object.assign({ hash: h }, s);
    }
    return null;
  }
  sessionOf(req) { return this.hasPassword() ? this.sessOf(req, 'owner') : null; }
  // phiên admin chỉ sống khi stage còn là admin (khởi tạo xong = chết, kể cả khi thu hồi trượt)
  adminOf(req) { return this.stage() === 'admin' ? this.sessOf(req, 'admin') : null; }
  devSig(id) { return crypto.createHmac('sha256', this.kDevice).update('v1.' + id + '.owner').digest('base64url'); }
  deviceOf(req) {
    for (const v of cookiesOf(req)[cookieName(COOKIE.device, req)] || []) {
      const m = /^v1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(v);
      if (!m || !safeEq(this.devSig(m[1]), m[2])) continue;   // chữ ký sai = không phải thiết bị của máy này
      const d = this.s.devices[m[1]];
      if (!d || d.user !== 'owner') continue;                   // đã thu hồi / mật khẩu đã đổi
      return Object.assign({ id: m[1] }, d);
    }
    return null;
  }
  // T / S → 'T' | 'S'; không có bằng chứng → null. Thứ tự: T (rẻ) rồi S. Phiên admin KHÔNG phải quyền chủ (chỉ mở màn khởi tạo — whoOf)
  ownerOf(req) { return this.tokenOk(bearerOf(req)) ? 'T' : this.sessionOf(req) ? 'S' : null; }
  whoOf(req) { return this.ownerOf(req) || (this.adminOf(req) ? 'A' : null); }
  // cho route cần quyền chủ đặt NGOÀI cổng /api: có S / T → trả 'S' | 'T'; không → tự trả 401 (io.send của main.js — câu dịch theo người gọi) và trả null
  requireOwner(req, res, io) { const w = this.ownerOf(req); if (!w) io.send(res, 401, { error: 'cần đăng nhập (mật khẩu chủ) hoặc token của bản cài' }); return w; }
  // tạo phiên owner + (làm mới) cookie thiết bị cho trình duyệt vừa chứng minh là chủ. Trả mảng Set-Cookie
  issue(req) {
    const t = this.now(), S = this.s, raw = rnd(32), ua = uaOf(req);
    let dev = this.deviceOf(req);
    if (!dev) {
      const ids = Object.keys(S.devices);
      if (ids.length >= MAX.devices) { const old = ids.sort((a, b) => String(S.devices[a].seenAt).localeCompare(String(S.devices[b].seenAt)))[0]; this.dropDevice(old); }
      dev = { id: rnd(16) }; S.devices[dev.id] = { user: 'owner', createdAt: iso(t), seenAt: iso(t), ua };
    } else S.devices[dev.id].seenAt = iso(t);
    this.trimSessions();
    S.sessions[sha(raw)] = { id: rnd(9), user: 'owner', device: dev.id, createdAt: iso(t), seenAt: iso(t), exp: t + TTL.session, ua };
    this.save();
    const sec = isHttps(req, this.publicUrl());
    return [this.cookie(cookieName(COOKIE.session, req), raw, TTL.session, sec), this.cookie(cookieName(COOKIE.device, req), 'v1.' + dev.id + '.' + this.devSig(dev.id), TTL.device, sec)];
  }
  // phiên admin (§A.1): 30 phút, KHÔNG cookie thiết bị (danh tính công khai không được miễn trần), chỉ mở màn khởi tạo
  issueAdmin(req) {
    const t = this.now(), raw = rnd(32);
    this.trimSessions();
    this.s.sessions[sha(raw)] = { id: rnd(9), user: 'admin', createdAt: iso(t), seenAt: iso(t), exp: t + TTL.admin, ua: uaOf(req) };
    this.save();
    return [this.cookie(cookieName(COOKIE.session, req), raw, TTL.admin, isHttps(req, this.publicUrl()))];
  }
  trimSessions() { const S = this.s, hs = Object.keys(S.sessions); if (hs.length >= MAX.sessions) delete S.sessions[hs.sort((a, b) => S.sessions[a].exp - S.sessions[b].exp)[0]]; }
  cookie(name, value, ttl, secure) { return name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(ttl / 1000) + (secure ? '; Secure' : ''); }
  clearCookie(req) { return this.cookie(cookieName(COOKIE.session, req), '', 0, isHttps(req, this.publicUrl())); }
  logout(req) { const s = this.sessionOf(req) || this.adminOf(req); if (s) { delete this.s.sessions[s.hash]; this.save(); } return !!s; }
  dropDevice(id) {
    if (!Object.hasOwn(this.s.devices, id)) return false;
    delete this.s.devices[id];
    for (const h of Object.keys(this.s.sessions)) if (this.s.sessions[h].device === id) delete this.s.sessions[h];
    return true;
  }
  sweep() {
    const t = this.now(); let ch = false;
    for (const h of Object.keys(this.s.sessions)) if (this.s.sessions[h].exp <= t || (this.s.sessions[h].user === 'admin' && this.stage() !== 'admin')) { delete this.s.sessions[h]; ch = true; }
    for (const id of Object.keys(this.s.devices)) if (Date.parse(this.s.devices[id].seenAt || 0) + TTL.device <= t) { this.dropDevice(id); ch = true; }
    for (const [k, b] of this.buckets) if (b.reset <= t) this.buckets.delete(k);
    for (const [k, b] of this.soft) if (b.reset <= t) this.soft.delete(k);
    for (const [k, b] of this.acct) if (b.reset <= t) this.acct.delete(k);
    if (ch) this.save();
  }
  // việc định kỳ (main.js gọi mỗi phút): dọn phiên hết hạn (cả phiên admin sau khi khởi tạo), ghi seenAt
  tick() { this.sweep(); this.flush(); }

  /* ------------------------------------------------------------ trần (chỉ đếm lần SAI) */
  // IP của khách (chỉ dùng cho trần, không cấp quyền). Header chuyển tiếp CHỈ tin khi có cơ sở: E-caddy (cờ do app gắn sau khi X-GC-Edge đúng) → mục cuối
  // X-Forwarded-For; E-tunnel (socket cổng nghe riêng GC_PORT+2) → Cf-Connecting-Ip; proxy riêng mà CHỦ cấu hình tường minh (GC_CLIENT_IP_HEADER kế thừa /
  // online.json clientIpHeader) → header đó khi peer là mạng riêng. Còn lại: địa chỉ socket — XFF / Cf-Connecting-Ip do client tự gửi bị bỏ qua (đổi header không ra "IP mới")
  ipOf(req) {
    const h = req.headers || {}, peer = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/i, '').slice(0, 64) || '?';
    if (req.gcEdge === 'tunnel') return (String(h['cf-connecting-ip'] || '').trim() || peer).slice(0, 64);
    if (req.gcEdge === 'caddy') return (String(h['x-forwarded-for'] || '').split(',').pop().trim() || peer).slice(0, 64);
    const hdr = this.ipHeader();
    return hdr ? clientIp(h, req.socket && req.socket.remoteAddress, hdr) : peer;
  }
  wait(key, lim) {
    const b = this.buckets.get(key), t = this.now(), live = b && b.reset > t ? b.n : 0;
    return live + (this.pend.get(key) || 0) >= lim[0] ? Math.max(1, Math.ceil(((b && b.reset > t ? b.reset : t + lim[1] * 1000) - t) / 1000)) : 0;
  }
  // giữ chỗ một lần thử trong trần của khoá (gọi ngay sau guard() cho qua, trước khi kiểm); trả hàm nhả chỗ
  hold(g) {
    const keys = [g.key, g.who === 'X' ? 'acct:' + g.kind : null].filter(Boolean); if (!keys.length) return () => {};
    keys.forEach(k => this.pend.set(k, (this.pend.get(k) || 0) + 1));
    let done = false;
    return () => { if (done) return; done = true; keys.forEach(k => { const n = (this.pend.get(k) || 1) - 1; if (n > 0) this.pend.set(k, n); else this.pend.delete(k); }); };
  }
  acctWait(kind) {   // trần theo tài khoản: lần sai + lần đang kiểm của MỌI kẻ lạ (mọi IP)
    const lim = LIMIT[kind].acct, b = this.acct.get(kind), t = this.now(), live = b && b.reset > t ? b.n : 0;
    return live + (this.pend.get('acct:' + kind) || 0) >= lim[0] ? Math.max(1, Math.ceil(((b && b.reset > t ? b.reset : t + lim[1] * 1000) - t) / 1000)) : 0;
  }
  bump(map, key, sec) {
    const t = this.now(), b = map.get(key);
    if (!b || b.reset <= t) { if (map === this.buckets && map.size >= MAX.buckets) map.delete(map.keys().next().value); map.set(key, { n: 1, reset: t + sec * 1000 }); } else b.n++;
  }
  slowMs(kind) {   // trễ cho kẻ lạ khi lần sai toàn cục vượt ngưỡng mềm — chỉ làm chậm, không từ chối
    const b = this.soft.get(kind), soft = LIMIT[kind].soft[0] * this.rate;
    return b && b.reset > this.now() && b.n >= soft ? Math.min(SLOW.max, SLOW.step * (b.n - soft + 1)) : 0;
  }
  // gác MỘT lần thử đăng nhập (owner hoặc admin / admin — CHUNG một trần theo tài khoản: đoán admin cũng bị chặn như đoán mật khẩu chủ):
  // { who: 'T'|'S'|'D'|'X', key, wait (giây, >0 = 429 không kiểm), slow (ms) }
  guard(kind, req) {
    const L = LIMIT[kind];
    if (this.tokenOk(bearerOf(req))) return { who: 'T' };
    const s = this.sessionOf(req); if (s) { const key = 'sess:' + s.hash; return { who: 'S', key, lim: L.sess, wait: this.wait(key, L.sess) }; }
    const d = this.deviceOf(req); if (d) { const key = 'dev:' + d.id; return { who: 'D', key, lim: L.dev, wait: this.wait(key, L.dev) }; }
    const ip = this.ipOf(req), key = kind + ':ip:' + ip, w = this.wait(key, L.ip), a = w ? 0 : this.acctWait(kind);
    return { who: 'X', kind, key, ip, lim: L.ip, wait: w || a, locked: !!a, slow: this.slowMs(kind) };
  }
  fail(kind, g) {
    if (g.who === 'T') return;
    this.bump(this.buckets, g.key, g.lim[1]);
    if (g.who !== 'X') return;
    this.bump(this.soft, kind, LIMIT[kind].soft[1]);
    const b0 = this.acct.get(kind); if (!b0 || b0.reset <= this.now()) this.acctIps.set(kind, new Set());
    this.bump(this.acct, kind, LIMIT[kind].acct[1]);
    const ips = this.acctIps.get(kind); if (ips && ips.size < 1000 && g.ip) ips.add(g.ip);
    const b = this.acct.get(kind);
    if (b.n === LIMIT[kind].acct[0]) {   // vừa chạm trần tài khoản → ghi sự kiện cho chủ (Studio hiện dải ở lần đăng nhập kế tiếp) + log (không bí mật)
      const ev = { id: rnd(6), kind, at: iso(this.now()), until: iso(b.reset), failures: b.n, ips: ips ? ips.size : 0, sample: ips ? [...ips].slice(-3) : [], seen: false };
      this.s.events = (this.s.events || []).concat(ev).slice(-20); this.save();
      this.log('[auth] ' + kind + ' temporarily blocked for clients without a device cookie / token: ' + ev.failures + ' failed attempts from ' + ev.ips + ' address(es) until ' + ev.until);
    }
  }
  lockedFor(kind) { return this.acctWait(kind); }   // giây còn bị chặn theo tài khoản (0 = không chặn)

  /* ------------------------------------------------------------ trạng thái cho Studio / CLI */
  // GET /api/auth/state là CÔNG KHAI (CNS-210): người chưa chứng minh là chủ chỉ nhận cái màn /login cần để vẽ — password, minLength, đường dẫn, stage
  // (admin = màn đăng nhập ghi "lần đầu: admin / admin"), legacy CHỈ khi chưa có mật khẩu (máy kế thừa → màn token). Không trả locked, session / owner,
  // tên đăng nhập (nửa còn lại của thông tin đăng nhập). Phiên admin (A) thêm who / expiresAt. Chủ (S / T) nhận đủ.
  state(req) {
    const who = this.whoOf(req), pw = this.hasPassword();
    const pub = { password: pw, minLength: PW.min, login: '/login', stage: this.stage() };
    if (!who) return pw ? pub : Object.assign(pub, { legacy: this.isLegacy() });
    if (who === 'A') { const a = this.adminOf(req); return Object.assign(pub, { who, admin: true, session: false, expiresAt: iso(a.exp) }); }
    return Object.assign(pub, { who, legacy: this.isLegacy(), session: !!this.sessionOf(req), owner: who, locked: this.lockedFor('login'), user: this.profile() });
  }
  view(req) {   // /api/info.auth (đã là chủ): thêm nguồn token + dải "agent cũ cần nối lại"
    return Object.assign(this.state(req), { tokenSource: this.tokenInfo.source, agentsReconnect: !!(this.legacyRec && this.legacyRec.tokenless), alerts: (this.s.events || []).filter(e => !e.seen) });
  }
  sessions(req) {
    this.sweep();
    const cur = this.sessionOf(req), dv = this.deviceOf(req), own = Object.keys(this.s.sessions).filter(h => this.s.sessions[h].user === 'owner');
    return {
      sessions: own.map(h => { const x = this.s.sessions[h]; return { id: x.id, device: x.device, createdAt: x.createdAt, seenAt: x.seenAt, expiresAt: iso(x.exp), ua: x.ua || '', current: !!cur && cur.hash === h }; }),
      devices: Object.keys(this.s.devices).map(id => { const x = this.s.devices[id]; return { id, createdAt: x.createdAt, seenAt: x.seenAt, ua: x.ua || '', current: !!dv && dv.id === id }; })
    };
  }

  /* ------------------------------------------------------------ HTTP: /api/auth/* (main.js đã kiểm Host + CSRF X-GC-Request / Origin cho lệnh thay đổi) */
  // io = { send(res, code, body, type, extra), body(req, limit) }. Luôn trả lời (true)
  async handle(req, res, p, m, io) {
    const json = (code, b, extra) => io.send(res, code, b, null, extra);
    // câu 429 chỉ thẳng lối thoát (review bảo mật 🟡2): trên máy chủ `genchibi password` đặt (lại) mật khẩu, hoặc dùng token của bản cài — không phải chờ
    const busy = sec => json(429, { error: tr(VI, 'quá nhiều lần thử sai — thử lại sau {n} giây (quên mật khẩu: chạy genchibi password trên máy chủ)', { n: sec }), retryAfter: sec }, { 'Retry-After': String(sec) });
    const blocked = (g) => g.locked ? json(429, { error: tr(VI, 'đăng nhập đang bị chặn tạm vì nhiều lần sai — trên máy chủ chạy genchibi password (đặt lại mật khẩu), hoặc dùng token của bản cài, hoặc chờ {n} phút', { n: Math.ceil(g.wait / 60) }), retryAfter: g.wait, locked: true }, { 'Retry-After': String(g.wait) }) : busy(g.wait);
    const taken = () => json(409, { error: 'đang khởi tạo tài khoản chủ từ một trình duyệt khác — đợi vài giây rồi đăng nhập ở /login', login: '/login' });
    const errOut = e => { if (e && e.code >= 400 && e.code < 500) return json(e.code, { error: e.message }); throw e; };
    if (p === '/api/auth/state' && m === 'GET') return json(200, this.state(req));
    if (p === '/api/auth/setup' || p === '/api/auth/setup-code') return json(404, { error: 'không có API này' });   // mã setup v0.21 đã bỏ (v0.23 §A.4)

    // ---- đăng nhập (mọi lớp, trần §3.3 — xét TRƯỚC mọi lần kiểm): { username, password }. username "admin" = lối lần đầu (§A.1)
    if (p === '/api/auth/login' && m === 'POST') {
      const b = await io.body(req, 8 * 1024), g = this.guard('login', req);
      const user = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
      if (typeof b.password !== 'string' || !b.password) return json(400, { error: 'cần mật khẩu' });
      if (!user) return json(400, { error: 'cần tên đăng nhập' });
      if (g.wait) return blocked(g);                                    // chạm trần → từ chối, KHÔNG kiểm gì thêm
      if (user === 'admin') {
        const why = this.adminCheck(req);                               // điều kiện của máy + request: không đạt → nói ĐÚNG lý do + cách vào, không kiểm mật khẩu, không đếm
        if (why.length) return json(403, { error: tr(VI, REASON_MSG[why[0]] || REASON_MSG.stage, { port: this.port }), reason: why[0], reasons: why });
        if (!safeEq(b.password, 'admin')) { this.fail('login', g); return json(401, { error: 'tên đăng nhập hoặc mật khẩu không đúng' }); }
        this.log('[auth] admin / admin accepted for the first-run owner account screen (30 minutes)');
        return json(200, { ok: true, next: '/', admin: true }, { 'Set-Cookie': this.issueAdmin(req) });
      }
      if (!this.hasPassword()) return json(409, { error: this.stage() === 'admin' ? 'lần đầu: đăng nhập bằng admin / admin (trong 30 phút sau genchibi start / genchibi open trên máy chủ), hoặc chạy genchibi password trên máy chủ' : 'máy chưa có mật khẩu chủ — chạy genchibi password trên máy chủ (hoặc dùng token của bản cài)', stage: this.stage() });
      let okPw = false;
      const release = this.hold(g);
      if (g.who === 'X') {
        if (this.inflight.login >= SLOW.inflight * this.rate) { release(); return busy(2); }   // trần lũ: số lần kiểm cùng lúc của kẻ lạ (chủ có D / S / T không dùng chung)
        this.inflight.login++;
        try { if (g.slow) await sleep(g.slow); okPw = await this.checkPassword(b.password); } finally { this.inflight.login--; release(); }
      } else { try { okPw = await this.checkPassword(b.password); } finally { release(); } }
      // tên sai cũng chạy đủ scrypt (thời gian như nhau) và đếm như mật khẩu sai — câu lỗi không nói phần nào sai
      if (!okPw || !safeEq(user, this.loginName())) { this.fail('login', g); return json(401, { error: 'tên đăng nhập hoặc mật khẩu không đúng' }); }
      if (g.key && g.who !== 'X') this.buckets.delete(g.key);          // chủ gõ đúng: xoá đếm sai của chính thiết bị / phiên đó (không đụng đếm theo IP)
      return json(200, { ok: true, next: '/' }, { 'Set-Cookie': this.issue(req) });
    }

    if (p === '/api/auth/logout' && m === 'POST') { this.logout(req); return json(200, { ok: true }, { 'Set-Cookie': this.clearCookie(req) }); }

    // ---- khởi tạo tài khoản chủ (§A.2): phiên admin (A) hoặc token chủ (T), chỉ khi stage ∈ { admin, must_init }. JSON — main.js đã áp Host allowlist +
    //      X-GC-Request + Origin khớp cả cổng (CNS-262). Nguyên tử: initOwner. Xong: phiên admin chết, trình duyệt này nhận phiên owner mới
    if (p === '/api/auth/init' && m === 'POST') {
      const w = this.whoOf(req);
      if (w !== 'A' && w !== 'T') return json(401, { error: 'cần đăng nhập admin / admin (lần đầu) hoặc token của bản cài' });
      if (!this.initPending()) return json(409, { error: 'tài khoản chủ đã được khởi tạo — đăng nhập ở /login', login: '/login' });
      const b = await io.body(req, 8 * 1024);
      const o = { login: typeof b.username === 'string' ? b.username.trim().toLowerCase() : '', displayName: typeof b.displayName === 'string' ? b.displayName.trim() : '', email: typeof b.email === 'string' ? b.email.trim() : '', password: b.password };
      const bad = loginProblem(o.login) || displayProblem(o.displayName) || emailProblem(o.email) || pwProblem(o.password);
      if (bad) return json(400, { error: bad });
      if (b.password2 !== undefined && b.password2 !== b.password) return json(400, { error: 'hai lần nhập mật khẩu không khớp' });
      if (this.initBusy) return taken();
      this.initBusy = true;
      try { await this.initOwner(o, w === 'A' ? 'init' : 'init-token'); } catch (e) { return errOut(e); } finally { this.initBusy = false; }
      return json(200, { ok: true, next: '/' }, { 'Set-Cookie': this.issue(req) });
    }

    // ---- từ đây: chỉ chủ (S / T)
    const who = this.ownerOf(req);
    if (!who) return json(401, { error: 'cần đăng nhập (mật khẩu chủ) hoặc token của bản cài' });
    // đổi mật khẩu: S phải nhập mật khẩu hiện tại (trần theo phiên); T (genchibi password, quên mật khẩu) đặt lại thẳng.
    // T khi chưa khởi tạo = khởi tạo (login tuỳ chọn, mặc định owner); initOnly (trình cài) không đè mật khẩu đã có
    if (p === '/api/auth/password' && m === 'POST') {
      const b = await io.body(req, 8 * 1024);
      const bad = pwProblem(b.password) || (b.login !== undefined ? loginProblem(String(b.login).trim().toLowerCase()) : ''); if (bad) return json(400, { error: bad });
      if (this.initBusy) return taken();
      if (who === 'S' && this.hasPassword()) {
        const g = this.guard('login', req); if (g.wait) return busy(g.wait);
        const release = this.hold(g); let good = false;
        try { good = await this.checkPassword(b.current); } finally { release(); }
        if (!good) { this.fail('login', g); return json(401, { error: 'mật khẩu hiện tại không đúng' }); }
      }
      let r;
      this.initBusy = this.initPending();
      try { r = await this.setPassword(b.password, who === 'T' ? 'token' : 'session', { login: b.login !== undefined ? String(b.login).trim().toLowerCase() : '', initOnly: b.initOnly === true }); }
      catch (e) { return errOut(e); } finally { this.initBusy = false; }
      return json(200, { ok: true, revoked: r.revoked, init: !!r.init, login: r.login, stage: this.stage() }, who === 'S' ? { 'Set-Cookie': this.issue(req) } : undefined);
    }
    if (p === '/api/auth/profile' && m === 'PUT') {
      const b = await io.body(req, 8 * 1024);
      try { return json(200, { ok: true, user: this.setProfile(b) }); } catch (e) { return errOut(e); }
    }
    if (p === '/api/auth/sessions' && m === 'GET') return json(200, this.sessions(req));
    // chủ đã xem cảnh báo "đăng nhập bị chặn tạm" → không hiện lại
    if (p === '/api/auth/alerts/ack' && m === 'POST') { let n = 0; (this.s.events || []).forEach(e => { if (!e.seen) { e.seen = true; n++; } }); if (n) this.save(); return json(200, { ok: true, acked: n }); }
    const rv = /^\/api\/auth\/(sessions|devices)\/([A-Za-z0-9_-]{1,32})\/revoke$/.exec(p);
    if (rv && m === 'POST') {
      let done = false;
      if (rv[1] === 'devices') done = this.dropDevice(rv[2]);
      else { const h = Object.keys(this.s.sessions).find(k => this.s.sessions[k].id === rv[2] && this.s.sessions[k].user === 'owner'); if (h) { delete this.s.sessions[h]; done = true; } }
      if (!done) return json(404, { error: 'không có phiên / thiết bị này' });
      this.save(); this.log('[auth] owner revoked a ' + (rv[1] === 'devices' ? 'device' : 'session'));
      return json(200, this.sessions(req));
    }
    return json(404, { error: 'không có API này' });
  }
}

module.exports = { Auth, pwProblem, cookieName, isHttps, bearerOf, SCRYPT, PW, TTL, LIMIT, SLOW, COOKIE };
