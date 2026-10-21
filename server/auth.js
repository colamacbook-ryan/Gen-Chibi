// gen-chibi — đăng nhập chủ máy (v0.21, spec v021 §3.3 + §3.4): mật khẩu · phiên cookie · cookie thiết bị · mã setup · token chủ.
// © 2026 Gen Labs — All rights reserved.
//
// Quyền chủ CHỈ đến từ bằng chứng dương (CNS-191): S = phiên cookie còn hạn · T = token chủ (GC_API_TOKEN hoặc data/owner-token) ·
// C = mã setup (chỉ để đặt mật khẩu đầu). Không có lớp request nào được quyền vì THIẾU một header. Lớp E / P / N chỉ dùng để lấy IP cho trần.
// Trần đăng nhập (CNS-166, L-66): client chưa có bằng chứng → xét trần TRƯỚC khi chạy scrypt (chạm trần = từ chối, không kiểm);
// miễn trừ chỉ bằng bằng chứng: S / T (không trần) · D = cookie thiết bị ký HMAC (trần sai RIÊNG cho từng thiết bị, không chung với kẻ lạ).
// Trần toàn cục: từ ngưỡng mềm thì làm CHẬM (trễ tăng dần + trần số lần kiểm cùng lúc); vượt trần THEO TÀI KHOẢN thì chặn mọi client không có S / T / D
// tới hết cửa sổ (đổi IP không lách được — chủ có cookie thiết bị / token vẫn vào; quên cả hai: `genchibi password`).
// Tệp trong data/ (đều 0600): auth.json (người dùng + phiên + thiết bị; phiên chỉ lưu băm) · owner-token (khi env trống) ·
// setup-code (HMAC + hạn của mã) · setup-code.txt (bản rõ cho CLI in: dòng 1 "XXXXX-XXXXX", dòng 2 "expires=<epoch giây>") · legacy.json (dấu máy kế thừa).
// Thuần Node (không DOM, không HTTP server): main.js định tuyến; handle() nhận io = { send, body } của main.js. Có `now` để test chạy đồng hồ giả.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { clientIp } = require('./oauth');
const MSG = require('./i18n-msg'), { VI, tr } = MSG;

// scrypt theo OWASP (Password Storage Cheat Sheet): N=2^14, r=8, p=5 ≡ N=2^17, p=1 về chi phí nhưng chỉ 16 MiB bộ nhớ mỗi lần băm (máy nhỏ chạy 4 luồng song song = 64 MiB).
// Tham số lưu trong chuỗi băm ("scrypt$N$r$p$salt$hash") → đổi mặc định về sau thì băm cũ vẫn kiểm được và được băm lại khi đăng nhập đúng.
const SCRYPT = { N: 16384, r: 8, p: 5, keylen: 32, maxmem: 64 * 1024 * 1024 };
const PW = { min: 12, maxBytes: 1024 };
const TTL = { session: 30 * 86400e3, device: 400 * 86400e3, setup: 3600e3 };   // ms — cookie thiết bị 400 ngày (trần của trình duyệt)
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32: 10 ký tự = 50 bit
// trần (số lần SAI, cửa sổ giây). ip/dev/sess = khoá; soft = ngưỡng toàn cục bắt đầu làm chậm (nhân GC_AUTH_RATE — chỉ để chạy test số lượng lớn);
// acct = trần THEO TÀI KHOẢN (mọi IP cộng lại, KHÔNG nhân GC_AUTH_RATE): vượt → client không có S / T / D bị CHẶN tới hết cửa sổ — đổi IP không reset được
// (review bảo mật P1: IP do kẻ tấn công kiểm soát được ở lớp P / N thì trần theo IP vô dụng; chủ có cookie thiết bị / token vẫn vào)
const LIMIT = { login: { ip: [10, 900], dev: [10, 900], sess: [10, 900], soft: [50, 900], acct: [100, 900] }, setup: { ip: [10, 900], soft: [50, 900], acct: [100, 900] } };
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

// mã setup: chữ hoa, bỏ "-" / khoảng trắng, I L → 1, O → 0 (Crockford); hợp lệ = đúng 10 ký tự của bảng. Trả '' nếu sai định dạng
function normCode(s) {
  if (typeof s !== 'string' || s.length > 40) return '';
  const c = s.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(c) ? c : '';
}
const showCode = c => c.slice(0, 5) + '-' + c.slice(5);
// mật khẩu chủ: ≥ 12 ký tự (đếm theo ký tự, không theo byte), ≤ 1 KB (trần chi phí scrypt), không ký tự điều khiển, không toàn khoảng trắng. '' = hợp lệ
function pwProblem(pw) {
  if (typeof pw !== 'string' || !pw) return 'cần mật khẩu';
  if (Buffer.byteLength(pw) > PW.maxBytes) return tr(VI, 'mật khẩu quá dài (tối đa {n} byte)', { n: PW.maxBytes });
  if (/[\u0000-\u001f\u007f]/.test(pw)) return 'mật khẩu không được chứa ký tự điều khiển (xuống dòng, tab…)';
  if ([...pw].length < PW.min || !pw.trim()) return tr(VI, 'mật khẩu cần ít nhất {n} ký tự — gợi ý: một cụm từ dễ nhớ', { n: PW.min });
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
  //         publicUrl?: () => địa chỉ công khai đang phục vụ (cờ Secure), onPasswordSet?: () => void — báo Go online đi tiếp bậc "mật khẩu chủ" (CNS-201) }
  constructor(opts) {
    this.dir = opts.dir;
    this.now = opts.now || Date.now;
    this.log = opts.log || (() => {});
    this.ipHeader = opts.ipHeader || (() => '');
    this.publicUrl = opts.publicUrl || (() => '');
    this.onPasswordSet = opts.onPasswordSet || (() => {});
    this.setupBusy = false;   // một lần đặt mật khẩu đầu đang chạy (mã setup đã bị tiêu thụ) — request song song thứ hai → 409 (review bảo mật 🟡1)
    this.rate = Math.max(1, Math.min(1000, Math.round(+opts.rate) || 1));
    // khoá con suy từ khoá chủ (HKDF): ký cookie thiết bị · HMAC mã setup — lộ một khoá con không lộ khoá chủ / khoá kia
    const key = Buffer.isBuffer(opts.key) && opts.key.length >= 32 ? opts.key : crypto.createHash('sha256').update(String(opts.key || '')).digest();
    this.kDevice = Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), 'gen-chibi device cookie v1', 32));
    this.kSetup = Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), 'gen-chibi setup code v1', 32));
    this.f = { auth: path.join(this.dir, 'auth.json'), token: path.join(this.dir, 'owner-token'), code: path.join(this.dir, 'setup-code'), codeTxt: path.join(this.dir, 'setup-code.txt'), legacy: path.join(this.dir, 'legacy.json') };
    this.s = this.load();
    this.buckets = new Map();   // trần theo khoá (ip / thiết bị / phiên): { n, reset }
    this.pend = new Map();      // số lần thử ĐANG kiểm theo khoá — tính như lần sai cho tới khi có kết quả (gửi song song không vượt được trần)
    this.soft = new Map();      // đếm lần sai toàn cục của kẻ lạ theo loại (login / setup): { n, reset }
    this.acct = new Map();      // trần theo tài khoản (một chủ): lần sai của kẻ lạ theo loại — không bị đẩy ra khỏi bộ nhớ. Cửa sổ CỐ ĐỊNH tính từ lần sai đầu
                                // (≤ 15 phút, lần sai trong lúc chặn không kéo dài cửa sổ — không tích luỹ vô hạn)
    this.acctIps = new Map();   // loại → Set IP đã sai trong cửa sổ (≤ 1000) — cho sự kiện báo chủ
    this.inflight = { login: 0, setup: 0 };
    this.dirty = false;
    this.tokenInfo = this.loadToken(String(opts.envToken || ''));
  }

  /* ------------------------------------------------------------ lưu trữ */
  load() {
    let d = {};
    const raw = readText(this.f.auth);
    if (raw !== null) {
      try { d = JSON.parse(raw); if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('not a JSON object'); }
      catch (e) {   // tệp hỏng: không âm thầm ghi đè — đổi tên giữ lại, bắt đầu trống (chưa có mật khẩu → mã setup mới; token chủ vẫn vào được)
        d = {}; const bak = this.f.auth + '.corrupt-' + Date.now();
        try { fs.renameSync(this.f.auth, bak); this.log('[auth] auth.json is corrupt (' + MSG.en(e.message) + ') - renamed to ' + path.basename(bak) + '; the owner password must be set again'); }
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

  /* ------------------------------------------------------------ mật khẩu */
  owner() { const u = this.s.users.owner; return u && typeof u.hash === 'string' ? u : null; }
  hasPassword() { return !!this.owner(); }
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
  // đặt / đổi mật khẩu: thu hồi MỌI phiên + thiết bị (người giữ phiên cũ — kể cả kẻ lạ nếu mật khẩu cũ đã lộ — phải đăng nhập lại); xoá mã setup
  async setPassword(pw, by) {
    const bad = pwProblem(pw); if (bad) throw Object.assign(new Error(bad), { code: 400 });
    const had = this.hasPassword(), revoked = Object.keys(this.s.sessions).length;
    this.s.users.owner = { id: 'owner', role: 'owner', hash: await this.hash(pw), setAt: iso(this.now()), by: String(by || '') };
    this.s.sessions = nul(); this.s.devices = nul();
    this.save(); this.dropSetupCode();
    this.log('[auth] owner password ' + (had ? 'changed' : 'set') + ' (' + (by || '?') + '); ' + revoked + ' session(s) revoked');
    // Go online đang chờ ở bậc "mật khẩu chủ" → tự đi tiếp tới xong (CNS-201) — lỗi của móc không làm hỏng việc đặt mật khẩu
    try { this.onPasswordSet(); } catch (e) { this.log('[auth] onPasswordSet: ' + MSG.en(e.message)); }
    return { revoked };
  }
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

  /* ------------------------------------------------------------ mã setup (C) */
  codeMeta() { try { const m = JSON.parse(readText(this.f.code) || 'null'); return m && typeof m.mac === 'string' && Number.isFinite(m.exp) ? m : null; } catch (e) { return null; } }
  macOf(code) { return crypto.createHmac('sha256', this.kSetup).update('setup|' + code).digest('hex'); }
  // có mật khẩu → không có mã. force: luôn sinh mới (CLI xin mã mới); không force: chỉ sinh khi chưa có / còn < 1 phút
  ensureSetupCode(force) {
    if (this.hasPassword()) { this.dropSetupCode(); return null; }
    const cur = this.codeMeta();
    if (!force && cur && cur.exp > this.now() + 60e3 && readText(this.f.codeTxt)) return { exp: cur.exp, fresh: false };
    let c = ''; for (let i = 0; i < 10; i++) c += CROCK[crypto.randomInt(32)];
    const exp = this.now() + TTL.setup;
    writeSecret(this.f.code, JSON.stringify({ v: 1, mac: this.macOf(c), exp, createdAt: iso(this.now()) }) + '\n');
    writeSecret(this.f.codeTxt, showCode(c) + '\nexpires=' + Math.floor(exp / 1000) + '\n');
    this.log('[auth] no owner password yet: a one-time setup code (valid 1 hour) is in data/setup-code.txt - run `genchibi open` or `genchibi status` on the server');
    return { exp, fresh: true };
  }
  dropSetupCode() { rmf(this.f.code); rmf(this.f.codeTxt); }
  // 'ok' | 'format' | 'expired' (đúng mã nhưng hết hạn) | 'wrong'
  checkCode(input) {
    const c = normCode(input); if (!c) return 'format';
    const m = this.codeMeta(); if (!m) return 'wrong';
    const hit = safeEq(this.macOf(c), m.mac);
    return !hit ? 'wrong' : m.exp <= this.now() ? 'expired' : 'ok';
  }

  /* ------------------------------------------------------------ phiên (S) + thiết bị (D) */
  sessionOf(req) {
    if (!this.hasPassword()) return null;
    for (const v of cookiesOf(req)[cookieName(COOKIE.session, req)] || []) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(v)) continue;
      const h = sha(v), s = this.s.sessions[h];
      if (!s || s.user !== 'owner') continue;
      if (s.exp <= this.now()) { delete this.s.sessions[h]; this.dirty = true; continue; }
      if (!s.seenAt || Date.parse(s.seenAt) + 60e3 < this.now()) { s.seenAt = iso(this.now()); this.dirty = true; }
      return Object.assign({ hash: h }, s);
    }
    return null;
  }
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
  // T / S → 'T' | 'S'; không có bằng chứng → null. Thứ tự: T (rẻ) rồi S
  ownerOf(req) { return this.tokenOk(bearerOf(req)) ? 'T' : this.sessionOf(req) ? 'S' : null; }
  // cho route cần quyền chủ đặt NGOÀI cổng /api (P3 dùng nếu cần): có S / T → trả 'S' | 'T'; không → tự trả 401 (io.send của main.js — câu dịch theo người gọi) và trả null
  requireOwner(req, res, io) { const w = this.ownerOf(req); if (!w) io.send(res, 401, { error: 'cần đăng nhập (mật khẩu chủ) hoặc token của bản cài' }); return w; }
  // tạo phiên + (làm mới) cookie thiết bị cho trình duyệt vừa chứng minh là chủ. Trả mảng Set-Cookie
  issue(req) {
    const t = this.now(), S = this.s, raw = rnd(32), ua = uaOf(req);
    let dev = this.deviceOf(req);
    if (!dev) {
      const ids = Object.keys(S.devices);
      if (ids.length >= MAX.devices) { const old = ids.sort((a, b) => String(S.devices[a].seenAt).localeCompare(String(S.devices[b].seenAt)))[0]; this.dropDevice(old); }
      dev = { id: rnd(16) }; S.devices[dev.id] = { user: 'owner', createdAt: iso(t), seenAt: iso(t), ua };
    } else S.devices[dev.id].seenAt = iso(t);
    const hs = Object.keys(S.sessions);
    if (hs.length >= MAX.sessions) delete S.sessions[hs.sort((a, b) => S.sessions[a].exp - S.sessions[b].exp)[0]];
    S.sessions[sha(raw)] = { id: rnd(9), user: 'owner', device: dev.id, createdAt: iso(t), seenAt: iso(t), exp: t + TTL.session, ua };
    this.save();
    const sec = isHttps(req, this.publicUrl());
    return [this.cookie(cookieName(COOKIE.session, req), raw, TTL.session, sec), this.cookie(cookieName(COOKIE.device, req), 'v1.' + dev.id + '.' + this.devSig(dev.id), TTL.device, sec)];
  }
  cookie(name, value, ttl, secure) { return name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(ttl / 1000) + (secure ? '; Secure' : ''); }
  clearCookie(req) { return this.cookie(cookieName(COOKIE.session, req), '', 0, isHttps(req, this.publicUrl())); }
  logout(req) { const s = this.sessionOf(req); if (s) { delete this.s.sessions[s.hash]; this.save(); } return !!s; }
  dropDevice(id) {
    if (!Object.hasOwn(this.s.devices, id)) return false;
    delete this.s.devices[id];
    for (const h of Object.keys(this.s.sessions)) if (this.s.sessions[h].device === id) delete this.s.sessions[h];
    return true;
  }
  sweep() {
    const t = this.now(); let ch = false;
    for (const h of Object.keys(this.s.sessions)) if (this.s.sessions[h].exp <= t) { delete this.s.sessions[h]; ch = true; }
    for (const id of Object.keys(this.s.devices)) if (Date.parse(this.s.devices[id].seenAt || 0) + TTL.device <= t) { this.dropDevice(id); ch = true; }
    for (const [k, b] of this.buckets) if (b.reset <= t) this.buckets.delete(k);
    for (const [k, b] of this.soft) if (b.reset <= t) this.soft.delete(k);
    for (const [k, b] of this.acct) if (b.reset <= t) this.acct.delete(k);
    if (ch) this.save();
  }
  // việc định kỳ (main.js gọi mỗi phút): dọn phiên hết hạn, ghi seenAt, mã setup hết hạn thì sinh mã mới (genchibi status luôn có mã dùng được)
  tick() { this.sweep(); this.flush(); if (!this.hasPassword()) this.ensureSetupCode(false); }

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
  // gác MỘT lần thử (đăng nhập / mã setup) của client: { who: 'T'|'S'|'D'|'X', key, wait (giây, >0 = 429 không kiểm), slow (ms) }
  guard(kind, req) {
    const L = LIMIT[kind];
    if (this.tokenOk(bearerOf(req))) return { who: 'T' };
    if (kind === 'login') {
      const s = this.sessionOf(req); if (s) { const key = 'sess:' + s.hash; return { who: 'S', key, lim: L.sess, wait: this.wait(key, L.sess) }; }
      const d = this.deviceOf(req); if (d) { const key = 'dev:' + d.id; return { who: 'D', key, lim: L.dev, wait: this.wait(key, L.dev) }; }
    }
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
  // GET /api/auth/state là CÔNG KHAI (CNS-210): người chưa chứng minh là chủ chỉ nhận cái màn /login · /setup cần để vẽ — password, minLength, đường dẫn,
  // và legacy CHỈ khi chưa có mật khẩu (máy kế thừa → màn token thay màn mã setup). Không trả locked (kẻ đoán không biết đợt đoán đã chạm trần —
  // Studio hiện dải "chặn tạm" từ phản hồi 429 của lần thử), setup (có mã đang chờ), session / owner. Chủ (S / T) nhận đủ.
  state(req) {
    const owner = this.ownerOf(req), pw = this.hasPassword();
    const pub = { password: pw, minLength: PW.min, login: '/login', setupUrl: '/setup' };
    if (!owner) return pw ? pub : Object.assign(pub, { legacy: this.isLegacy() });
    return Object.assign(pub, { legacy: this.isLegacy(), setup: !pw && !!this.codeMeta(), session: !!this.sessionOf(req), owner, locked: this.lockedFor('login') });
  }
  view(req) {   // /api/info.auth (đã là chủ): thêm nguồn token + dải "agent cũ cần nối lại"
    return Object.assign(this.state(req), { tokenSource: this.tokenInfo.source, agentsReconnect: !!(this.legacyRec && this.legacyRec.tokenless), alerts: (this.s.events || []).filter(e => !e.seen) });
  }
  sessions(req) {
    this.sweep();
    const cur = this.sessionOf(req), dv = this.deviceOf(req);
    return {
      sessions: Object.keys(this.s.sessions).map(h => { const x = this.s.sessions[h]; return { id: x.id, device: x.device, createdAt: x.createdAt, seenAt: x.seenAt, expiresAt: iso(x.exp), ua: x.ua || '', current: !!cur && cur.hash === h }; }),
      devices: Object.keys(this.s.devices).map(id => { const x = this.s.devices[id]; return { id, createdAt: x.createdAt, seenAt: x.seenAt, ua: x.ua || '', current: !!dv && dv.id === id }; })
    };
  }

  /* ------------------------------------------------------------ HTTP: /api/auth/* (main.js đã kiểm Host + CSRF X-GC-Request / Origin cho lệnh thay đổi) */
  // io = { send(res, code, body, type, extra), body(req, limit) }. Luôn trả lời (true)
  async handle(req, res, p, m, io) {
    const json = (code, b, extra) => io.send(res, code, b, null, extra);
    // câu 429 chỉ thẳng lối thoát (review bảo mật 🟡2): trên máy chủ `genchibi password` đặt (lại) mật khẩu, hoặc dùng token của bản cài — không phải chờ
    const busy = sec => json(429, { error: tr(VI, 'quá nhiều lần thử sai — thử lại sau {n} giây (quên mật khẩu: chạy genchibi password trên máy chủ)', { n: sec }), retryAfter: sec }, { 'Retry-After': String(sec) });
    const blocked = (g) => g.locked ? json(429, { error: tr(VI, g.kind === 'setup' ? 'màn đặt mật khẩu đang bị chặn tạm vì nhiều lần sai mã — trên máy chủ chạy genchibi password (đặt mật khẩu ngay), hoặc dùng token của bản cài, hoặc chờ {n} phút'
      : 'đăng nhập đang bị chặn tạm vì nhiều lần sai — trên máy chủ chạy genchibi password (đặt lại mật khẩu), hoặc dùng token của bản cài, hoặc chờ {n} phút', { n: Math.ceil(g.wait / 60) }), retryAfter: g.wait, locked: true }, { 'Retry-After': String(g.wait) }) : busy(g.wait);
    const taken = () => json(409, { error: 'đang đặt mật khẩu chủ từ một trình duyệt khác — đợi vài giây rồi đăng nhập ở /login', login: '/login' });
    if (p === '/api/auth/state' && m === 'GET') return json(200, this.state(req));

    // ---- đặt mật khẩu đầu: C (mã setup) hoặc T. Có mật khẩu rồi → 404 (trang /setup chuyển sang /login)
    if (p === '/api/auth/setup' && m === 'POST') {
      if (this.hasPassword()) return json(404, { error: 'máy đã có mật khẩu chủ — đăng nhập ở /login', login: '/login' });
      const b = await io.body(req, 8 * 1024), g = this.guard('setup', req);
      if (this.setupBusy) return taken();
      const bad = pwProblem(b.password); if (bad) return json(400, { error: bad });
      if (g.who !== 'T') {
        if (!normCode(b.code)) return json(400, { error: 'mã setup sai định dạng (10 ký tự, dạng XXXXX-XXXXX)' });   // sai định dạng không thử mã nào → không đếm
        if (g.wait) return blocked(g);                                                       // xét trần TRƯỚC khi kiểm (CNS-166)
        if (this.inflight.setup >= SLOW.inflight * this.rate) return busy(2);
        this.inflight.setup++; const release = this.hold(g);
        let r; try { if (g.slow) await sleep(g.slow); if (this.setupBusy) r = 'busy'; else r = this.checkCode(b.code); } finally { this.inflight.setup--; release(); }
        if (r === 'busy') return taken();
        if (r !== 'ok') { if (r === 'wrong') this.fail('setup', g); return json(401, { error: r === 'expired' ? 'mã setup đã hết hạn — chạy genchibi open trên máy chủ để lấy mã mới' : 'mã setup không đúng — chạy genchibi open (hoặc genchibi status) trên máy chủ để lấy mã' }); }
        if (this.hasPassword()) return json(404, { error: 'máy đã có mật khẩu chủ — đăng nhập ở /login', login: '/login' });   // hai trình duyệt cùng đặt: người sau thua
      }
      // TIÊU THỤ mã NGAY (đồng bộ, trước lần await scrypt): request song song mang cùng mã thấy setupBusy → 409, không đặt được lần hai (review bảo mật 🟡1)
      this.setupBusy = true; if (g.who !== 'T') this.dropSetupCode();
      try { await this.setPassword(b.password, g.who === 'T' ? 'token' : 'setup-code'); }
      catch (e) { if (!this.hasPassword()) this.ensureSetupCode(true); throw e; }   // băm lỗi (hiếm): mã mới để chủ thử lại (genchibi open / status in mã)
      finally { this.setupBusy = false; }
      return json(200, { ok: true, next: '/' }, { 'Set-Cookie': this.issue(req) });
    }

    // ---- đăng nhập (mọi lớp, trần §3.3)
    if (p === '/api/auth/login' && m === 'POST') {
      if (!this.hasPassword()) return json(409, { error: 'máy chưa có mật khẩu chủ — chạy genchibi open trên máy chủ để lấy mã setup', setup: '/setup' });
      const b = await io.body(req, 8 * 1024), g = this.guard('login', req);
      if (typeof b.password !== 'string' || !b.password) return json(400, { error: 'cần mật khẩu' });
      if (g.wait) return blocked(g);                                    // chạm trần → từ chối, KHÔNG chạy scrypt
      let okPw = false;
      const release = this.hold(g);
      if (g.who === 'X') {
        if (this.inflight.login >= SLOW.inflight * this.rate) { release(); return busy(2); }   // trần lũ: số lần kiểm cùng lúc của kẻ lạ (chủ có D / S / T không dùng chung)
        this.inflight.login++;
        try { if (g.slow) await sleep(g.slow); okPw = await this.checkPassword(b.password); } finally { this.inflight.login--; release(); }
      } else { try { okPw = await this.checkPassword(b.password); } finally { release(); } }
      if (!okPw) { this.fail('login', g); return json(401, { error: 'mật khẩu không đúng' }); }
      if (g.key && g.who !== 'X') this.buckets.delete(g.key);          // chủ gõ đúng: xoá đếm sai của chính thiết bị / phiên đó (không đụng đếm theo IP)
      return json(200, { ok: true, next: '/' }, { 'Set-Cookie': this.issue(req) });
    }

    if (p === '/api/auth/logout' && m === 'POST') { this.logout(req); return json(200, { ok: true }, { 'Set-Cookie': this.clearCookie(req) }); }

    // ---- từ đây: chỉ chủ (S / T)
    const who = this.ownerOf(req);
    if (!who) return json(401, { error: 'cần đăng nhập (mật khẩu chủ) hoặc token của bản cài' });
    // đổi mật khẩu: S phải nhập mật khẩu hiện tại (trần theo phiên); T (genchibi password, quên mật khẩu) đặt lại thẳng
    if (p === '/api/auth/password' && m === 'POST') {
      const b = await io.body(req, 8 * 1024);
      const bad = pwProblem(b.password); if (bad) return json(400, { error: bad });
      if (this.setupBusy) return taken();
      if (who === 'S' && this.hasPassword()) {
        const g = this.guard('login', req); if (g.wait) return busy(g.wait);
        const release = this.hold(g); let good = false;
        try { good = await this.checkPassword(b.current); } finally { release(); }
        if (!good) { this.fail('login', g); return json(401, { error: 'mật khẩu hiện tại không đúng' }); }
      }
      const r = await this.setPassword(b.password, who === 'T' ? 'token' : 'session');
      return json(200, { ok: true, revoked: r.revoked }, who === 'S' ? { 'Set-Cookie': this.issue(req) } : undefined);
    }
    // CLI (genchibi open) xin mã setup mới — chỉ T, chỉ khi chưa có mật khẩu. Không trả mã: CLI đọc data/setup-code.txt
    if (p === '/api/auth/setup-code' && m === 'POST') {
      if (who !== 'T') return json(403, { error: 'chỉ token của bản cài (CLI trên máy chủ) xin được mã setup' });
      if (this.hasPassword()) return json(409, { error: 'máy đã có mật khẩu chủ — không cần mã setup' });
      const r = this.ensureSetupCode(true);
      return json(200, { ok: true, expiresAt: iso(r.exp) });
    }
    if (p === '/api/auth/sessions' && m === 'GET') return json(200, this.sessions(req));
    // chủ đã xem cảnh báo "đăng nhập bị chặn tạm" → không hiện lại
    if (p === '/api/auth/alerts/ack' && m === 'POST') { let n = 0; (this.s.events || []).forEach(e => { if (!e.seen) { e.seen = true; n++; } }); if (n) this.save(); return json(200, { ok: true, acked: n }); }
    const rv = /^\/api\/auth\/(sessions|devices)\/([A-Za-z0-9_-]{1,32})\/revoke$/.exec(p);
    if (rv && m === 'POST') {
      let done = false;
      if (rv[1] === 'devices') done = this.dropDevice(rv[2]);
      else { const h = Object.keys(this.s.sessions).find(k => this.s.sessions[k].id === rv[2]); if (h) { delete this.s.sessions[h]; done = true; } }
      if (!done) return json(404, { error: 'không có phiên / thiết bị này' });
      this.save(); this.log('[auth] owner revoked a ' + (rv[1] === 'devices' ? 'device' : 'session'));
      return json(200, this.sessions(req));
    }
    return json(404, { error: 'không có API này' });
  }
}

module.exports = { Auth, normCode, showCode, pwProblem, cookieName, isHttps, bearerOf, SCRYPT, PW, TTL, LIMIT, SLOW, COOKIE };
