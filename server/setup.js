// gen-chibi — thiết lập lần đầu của owner (v0.23, spec v023-owner-ready §A.0 / §A.1 / §A.3): máy trạng thái data/setup.json + cửa sổ admin / admin.
// © 2026 Gen Labs — All rights reserved.
//
// MỘT nguồn sự thật cho "owner đã sẵn sàng chưa" (CNS-253): data/setup.json = { v, stage, choice, mcp, at, by, review?, skipped?, history }.
//   stage đi một chiều: admin → must_init → domain → mcp → done. Chỉ `genchibi setup reset` (token chủ, máy chủ) lùi được — và KHÔNG BAO GIỜ về admin.
//   Dấu "admin đã chết" nằm NGOÀI data/ (run/setup-floor, 0600): khôi phục bản sao lưu (thay cả data/) hay xoá auth.json / setup.json không mở lại admin.
// Bảng chuyển trạng thái theo lối vào (§A.0) — boot() khi chưa có setup.json:
//   máy kế thừa (data/legacy.json, như chibi.genos.top) → done (không chặn gì) · máy v0.21 / v0.22 đã có mật khẩu → done + dải "Kiểm tra thiết lập" một lần ·
//   máy v0.21 / v0.22 đang "online tạm, chờ mật khẩu" → must_init (owner vào bằng token chủ hoặc genchibi password — admin / admin không dùng được khi online) ·
//   còn lại (bản cài mới, v0.21 / v0.22 chưa từng đặt mật khẩu) → admin.
//   Lối vào sau đó: POST /api/auth/init (màn khởi tạo) → domain · genchibi password khi admin / must_init → domain (tên đăng nhập mặc định owner) ·
//   trình cài --domain / --cloudflare: genchibi password --init-stdin → domain, Go online xong → mcp (onlineDone) · wizard: chọn "chỉ máy này" / "tạm dùng" → mcp,
//   tự kiểm cục bộ đạt + (agent nối hoặc "Tôi nối agent sau") → done · genchibi setup skip → done (ghi lý do).
// Cửa sổ admin (CNS-251 / Q50): run/admin-window (0600) do LỆNH TRÊN MÁY CHỦ ghi (trình cài, genchibi start, genchibi open) — app không bao giờ ghi tệp này,
//   chỉ đọc + xoá khi khởi tạo xong. Là bằng chứng DƯƠNG "người đang ngồi ở máy chủ" (kiểu mã setup của v0.21, nhưng owner không phải chép gì).
// Thuần Node, không DOM, không HTTP server: main.js định tuyến + dựng ảnh chụp trạng thái máy (machine) cho adminReasons().
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const STAGES = ['admin', 'must_init', 'domain', 'mcp', 'done'];
const CHOICES = ['online', 'local', 'local-pending'];
const WINDOW_MS = 30 * 60e3;                       // cửa sổ admin + phiên admin: 30 phút
const SEEN_DONE_MS = 24 * 3600e3;               // lastClient cùng agent sau khi thiết lập xong: ghi đĩa ≤ 1 lần / ngày (CNS-277)
const LOOP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// header của proxy / edge: có một cái là request KHÔNG đến thẳng từ trình duyệt trên máy (rào phụ — proxy tối giản không thêm gì: đó là rủi ro chấp nhận)
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'forwarded', 'x-real-ip', 'true-client-ip', 'cf-connecting-ip', 'cf-ray', 'cf-ipcountry', 'cdn-loop', 'x-gc-edge', 'via'];
const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;
const KEY_RE = /^[0-9a-f]{32}$/;                  // khoá một lần của cửa sổ admin (128 bit, hex) — CLI ghi, link http://localhost:<cổng>/login#k=<khoá>
const EMAIL_RE = /^[A-Za-z0-9.!#$%&*+/=?^_`|~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const idx = s => STAGES.indexOf(s);
const iso = ms => new Date(ms).toISOString();
const isLoopIp = ip => /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.test(String(ip || ''));
const isLoopName = h => /^(localhost|127\.0\.0\.1|::1|\[::1\])$/i.test(String(h || '').trim());

function writeSecret(f, data) {   // ghi nguyên tử, 0600
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  try { fs.unlinkSync(tmp); } catch (e) { /* không có tệp tạm cũ */ }
  fs.writeFileSync(tmp, data, { mode: 0o600 }); fs.chmodSync(tmp, 0o600); fs.renameSync(tmp, f);
}

// tên đăng nhập: 3–32 ký tự [a-z0-9._-], khác "admin" (CNS-260: chỉ là nhãn để đăng nhập — id nội bộ luôn "owner"). '' = hợp lệ
function loginProblem(s) {
  if (typeof s !== 'string' || !LOGIN_RE.test(s)) return 'tên đăng nhập: 3–32 ký tự chữ thường, số, dấu chấm, gạch dưới, gạch ngang';
  if (s === 'admin') return 'tên đăng nhập không được là admin';
  return '';
}
// tên hiển thị: ≤ 64 ký tự, không ký tự điều khiển; trống → dùng tên đăng nhập
function displayProblem(s) {
  if (s === undefined || s === null || s === '') return '';
  if (typeof s !== 'string' || [...s].length > 64 || /[\u0000-\u001f\u007f]/.test(s)) return 'tên hiển thị: tối đa 64 ký tự, không ký tự điều khiển';
  return '';
}
// email (tuỳ chọn): CHỈ dùng làm email liên hệ Let's Encrypt của đường Caddy (CNS-267) — dạng chặt, ≤ 254, không khoảng trắng / dấu ngoặc (đi vào Caddyfile)
function emailProblem(s) {
  if (s === undefined || s === null || s === '') return '';
  if (typeof s !== 'string' || s.length > 254 || s[0] === '#' || !EMAIL_RE.test(s)) return 'email không hợp lệ (dạng ten@example.com)';   // '#' đầu = chú thích trong Caddyfile
  return '';
}

class Setup {
  // opts: { dataDir, runDir, log?, now? }
  constructor(opts) {
    this.now = opts.now || Date.now;
    this.log = opts.log || (() => {});
    this.f = { setup: path.join(opts.dataDir, 'setup.json'), floor: path.join(opts.runDir, 'setup-floor'), window: path.join(opts.runDir, 'admin-window') };
    this.s = this.read() || null;
    this.hooks = [];   // gọi khi stage đổi: (from, to) — main.js gắn Go online "chờ owner" (luồng v0.21 / v0.22 dừng ở bậc mật khẩu tự xong)
  }

  /* ------------------------------------------------------------ lưu trữ */
  read() {
    let raw = null; try { raw = fs.readFileSync(this.f.setup, 'utf8'); } catch (e) { return null; }
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || idx(d.stage) < 0) throw new Error('bad stage');
      return { v: 1, stage: d.stage, choice: CHOICES.includes(d.choice) ? d.choice : null, mcp: d.mcp && typeof d.mcp === 'object' && !Array.isArray(d.mcp) ? d.mcp : {},
        at: String(d.at || ''), by: String(d.by || ''), review: d.review === true, skipped: d.skipped && typeof d.skipped === 'object' ? d.skipped : null, history: Array.isArray(d.history) ? d.history.slice(-20) : [] };
    } catch (e) {   // tệp hỏng: đổi tên giữ lại; boot() dựng lại theo bảng lối vào + sàn (không bao giờ thành admin nếu sàn đã đóng)
      const bak = this.f.setup + '.corrupt-' + Date.now();
      try { fs.renameSync(this.f.setup, bak); this.log('[setup] setup.json is corrupt - renamed to ' + path.basename(bak)); } catch (e2) { this.log('[setup] setup.json is corrupt and could not be renamed: ' + e2.message); }
      return null;
    }
  }
  save() {
    writeSecret(this.f.setup, JSON.stringify(this.s, null, 1) + '\n');
    if (idx(this.s.stage) > 0 && !this.adminClosed()) writeSecret(this.f.floor, 'must_init\n');   // sàn: admin đã chết vĩnh viễn trên máy này
  }
  adminClosed() { try { return fs.readFileSync(this.f.floor, 'utf8').trim() === 'must_init'; } catch (e) { return false; } }
  get stage() { return this.s ? this.s.stage : 'admin'; }
  // owner đã khởi tạo (Go online được, Studio qua màn khởi tạo)
  ownerReady() { return idx(this.stage) >= idx('domain'); }

  // lần khởi động: chưa có setup.json → bảng lối vào (§A.0); có rồi → giữ. Rồi áp sàn: admin đã đóng thì không bao giờ là admin
  // ctx: { hasPassword, legacy, onlineWaiting }
  boot(ctx) {
    let why = '';
    if (!this.s) {
      const t = iso(this.now());
      let stage = 'admin', by = 'new-install', review = false;
      if (ctx.legacy) { stage = 'done'; by = 'upgrade-legacy'; }
      else if (ctx.hasPassword) { stage = 'done'; by = 'upgrade-password'; review = true; }
      else if (ctx.onlineWaiting) { stage = 'must_init'; by = 'upgrade-online-waiting'; }
      this.s = { v: 1, stage, choice: null, mcp: {}, at: t, by, review, skipped: null, history: [{ stage, at: t, by }] };
      why = by;
    }
    if (this.s.stage === 'admin' && this.adminClosed()) {
      this.s.stage = 'must_init'; this.s.at = iso(this.now()); this.s.by = 'floor';
      this.s.history.push({ stage: 'must_init', at: this.s.at, by: 'floor' });
      why = 'floor';
      this.log('[setup] setup.json said "admin" but the owner was already initialized on this machine (backup restored or file removed): admin / admin stays closed - sign in with the owner token or run `genchibi password`');
    }
    // stage admin nhưng auth.json đã có mật khẩu (setup.json cũ / chép tay / khôi phục lệch) → must_init: admin KHÔNG BAO GIỜ được khởi tạo đè mật khẩu đang có
    if (this.s.stage === 'admin' && ctx.hasPassword) {
      this.s.stage = 'must_init'; this.s.at = iso(this.now()); this.s.by = 'password-exists';
      this.s.history.push({ stage: 'must_init', at: this.s.at, by: 'password-exists' });
      why = 'password-exists';
      this.log('[setup] setup.json said "admin" but an owner password already exists: admin / admin stays closed - sign in with the owner token or run `genchibi password`');
    }
    if (why) {
      this.save();
      if (why !== 'floor' && why !== 'password-exists') this.log('[setup] first-run stage: ' + this.s.stage + ' (' + why + ')');
      if (why === 'upgrade-online-waiting') this.log('[setup] this machine is online and waiting for the owner: run `genchibi password` on the server (sets the owner account; going online then finishes by itself)');
    }
    return this.s.stage;
  }

  // đi tiếp (chỉ tiến). Trả true nếu đổi
  // Ghi đĩa lỗi → trạng thái trong bộ nhớ trả về như cũ rồi ném (init của auth.js dựa vào đây để nguyên tử)
  advance(to, by, extra) {
    if (idx(to) < 0) throw new Error('setup: unknown stage ' + to);
    if (idx(to) <= idx(this.stage)) return false;
    const from = this.stage, t = iso(this.now()), prev = JSON.parse(JSON.stringify(this.s));
    Object.assign(this.s, extra || {}, { stage: to, at: t, by: String(by || '') });
    this.s.history = this.s.history.concat({ stage: to, at: t, by: String(by || '') }).slice(-20);
    try { this.save(); } catch (e) { this.s = prev; throw e; }
    this.log('[setup] stage ' + from + ' -> ' + to + ' (' + (by || '?') + ')');
    this.fire(from, to);
    return true;
  }
  fire(from, to) { this.hooks.forEach(fn => { try { fn(from, to); } catch (e) { this.log('[setup] hook: ' + e.message); } }); }
  // genchibi setup reset (chỉ token chủ): làm lại wizard. Không bao giờ về admin — có mật khẩu → domain; chưa có → must_init
  reset(hasPassword, by) {
    const from = this.stage, to = hasPassword ? 'domain' : 'must_init', t = iso(this.now());
    Object.assign(this.s, { stage: to, choice: null, mcp: {}, review: false, skipped: null, at: t, by: String(by || 'reset') });
    this.s.history = this.s.history.concat({ stage: to, at: t, by: 'reset' }).slice(-20);
    this.save();
    this.log('[setup] reset by the owner on the server: ' + from + ' -> ' + to);
    return to;
  }
  // genchibi setup skip (chỉ token chủ): lối thoát khi chính phần tự kiểm hỏng — ghi lý do. Chỉ bỏ được wizard (domain / mcp), không bỏ được khởi tạo owner
  skip(reason, by) {
    if (!['domain', 'mcp'].includes(this.stage)) return false;
    this.s.skipped = { at: iso(this.now()), from: this.stage, reason: String(reason || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200) || 'skip', by: String(by || '') };
    this.log('[setup] first-run wizard skipped at "' + this.stage + '" (' + this.s.skipped.reason + ')');
    return this.advance('done', 'skip');
  }
  // bước 2: chỉ dùng trên máy này (local) / tạm dùng trên máy này khi lên mạng chưa xong (local-pending — Trang chủ giữ dải nhắc)
  choose(choice) {
    if (!['local', 'local-pending'].includes(choice)) return false;
    if (this.stage !== 'domain') return false;
    return this.advance('mcp', 'choice:' + choice, { choice });
  }
  // Go online vừa xong (online.js finish): bước 2 đạt → mcp; đang "tạm dùng trên máy này" → hết nhắc
  onlineDone() {
    if (this.stage === 'domain') return this.advance('mcp', 'online', { choice: 'online' });
    if (this.s && this.s.choice === 'local-pending') { this.s.choice = 'online'; this.save(); return true; }
    return false;
  }
  // kết quả tự kiểm cục bộ (bắt buộc đạt mới qua được bước 3)
  // MCP-04 (CNS-269): kết quả `genchibi setup check` — lệnh THẬT trên máy chủ (đường tuyệt đối) chạy initialize + tools/list. Chỉ báo, không khoá
  setHostCheck(r) {
    const cmd = typeof r.cmd === 'string' && /^\/[^\u0000-\u001f\u007f]{0,511}$/.test(r.cmd) ? r.cmd : '';
    const v = { ok: r.ok === true && !!cmd, tools: Number.isInteger(r.tools) && r.tools >= 0 && r.tools < 1000 ? r.tools : 0, cmd, at: iso(this.now()),
      error: r.ok === true ? '' : String(r.error || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200) };
    this.s.mcp = Object.assign({}, this.s.mcp, { hostCheck: v }); this.save(); return v;
  }
  setSelfTest(r) { this.s.mcp = Object.assign({}, this.s.mcp, { selfTest: r }); this.save(); }
  // agent đầu tiên / mới nhất gọi MCP (lastClient: tên, lúc, kênh) — ghi đĩa khi đổi tên / kênh; cùng agent: mỗi ≥ 60 giây khi wizard còn chờ (dòng "agent vừa nối"),
  // mỗi ≥ 24 giờ khi đã xong (CNS-277: không ghi setup.json mỗi phút mãi mãi). Một bản ghi duy nhất — không có danh sách nào lớn dần
  seenClient(name, channel) {
    if (!this.s) return;
    const n = String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 80) || 'agent', ch = String(channel || ''), t = this.now();
    const cur = this.s.mcp.lastClient, gap = this.stage === 'done' ? SEEN_DONE_MS : 60e3;
    if (cur && cur.name === n && cur.channel === ch && Date.parse(cur.at) + gap > t) return;
    this.s.mcp = Object.assign({}, this.s.mcp, { lastClient: { name: n, channel: ch, at: iso(t) } });
    this.save();
  }
  // bước 3 xong: later = "Tôi nối agent sau" (Trang chủ giữ dải nhắc tới khi có agent nối)
  finish(later) {
    if (this.stage !== 'mcp') return false;
    return this.advance('done', later ? 'later' : 'agent', { mcp: Object.assign({}, this.s.mcp, { later: !!later }) });
  }
  dismissReview() { if (this.s && this.s.review) { this.s.review = false; this.save(); } return true; }
  view(extra) {
    const s = this.s || { stage: 'admin', mcp: {} }, m = s.mcp || {};
    return Object.assign({
      stage: s.stage, choice: s.choice || null, at: s.at || null, review: !!s.review, skipped: s.skipped || null,
      mcp: { selfTest: m.selfTest || null, hostCheck: m.hostCheck || null, lastClient: m.lastClient || null, later: !!m.later },
      // dải nhắc ở Trang chủ: lên mạng chưa xong (đã chọn "tạm dùng trên máy này") · chưa agent nào nối (đã chọn "nối sau")
      reminders: { online: s.stage === 'done' && s.choice === 'local-pending', agent: s.stage === 'done' && !!m.later && !m.lastClient }
    }, extra || {});
  }

  /* ------------------------------------------------------------ cửa sổ admin (run/admin-window — CHỈ lệnh trên máy chủ ghi) */
  // { ok, reason?, exp?, mode?, composeLoopback? } — reason: 'window' (không có / hết hạn) · 'window-perms' (quyền / nội dung sai)
  windowOf() {
    let st; try { st = fs.lstatSync(this.f.window); } catch (e) { return { ok: false, reason: 'window' }; }
    if (!st.isFile() || (st.mode & 0o077) || st.size > 1024) return { ok: false, reason: 'window-perms' };
    let j = null; try { j = JSON.parse(fs.readFileSync(this.f.window, 'utf8')); } catch (e) { return { ok: false, reason: 'window-perms' }; }
    const t = this.now(), exp = j && Number(j.exp);
    if (!j || j.v !== 1 || !Number.isFinite(exp) || !['native', 'docker'].includes(j.mode) || !KEY_RE.test(String(j.key || ''))) return { ok: false, reason: 'window-perms' };
    if (exp <= t) return { ok: false, reason: 'window', expired: true };
    if (exp > t + WINDOW_MS + 60e3) return { ok: false, reason: 'window-perms' };   // hạn xa hơn 30 phút: không phải do genchibi ghi
    return { ok: true, exp, mode: j.mode, composeLoopback: j.composeLoopback === true, by: String(j.by || ''), key: j.key };
  }
  closeWindow() { [this.f.window, path.join(path.dirname(this.f.window), 'open-admin.html')].forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* đã không còn */ } }); }   // cả tệp chuyển hướng của genchibi open (mang khoá)
}

// ---------------------------------------------------------------- admin / admin nhận được không? (§A.1) — một hàm, mọi lý do có mã ổn định + câu + lối vào
// machine: { stage, window: windowOf(), online: { mode, publicUrl, pending, busy }, legacyEnv, legacyMarked, caddy, tunnel, inDocker, bind, listen }
// req (tuỳ chọn — bỏ qua thì chỉ xét điều kiện của MÁY: genchibi setup / trình cài in lý do): socket, Origin, Host, header proxy / edge
// Trả [] = nhận; không thì danh sách mã theo thứ tự xét (mã đầu là lý do chính)
function machineReasons(machine) {
  const out = [], m = machine || {};
  if (m.stage !== 'admin') out.push('stage');
  const w = m.window || { ok: false, reason: 'window' };
  if (!w.ok) out.push(w.reason === 'window-perms' ? 'window-perms' : 'window');
  const on = m.online || {};
  if ((on.mode && on.mode !== 'off') || on.publicUrl || on.pending || on.busy) out.push('online');
  if (m.legacyEnv || m.legacyMarked) out.push('legacy-env');
  if (m.caddy) out.push('edge');
  if (m.tunnel) out.push('tunnel');
  if (m.inDocker) { if (w.ok && (w.mode !== 'docker' || !w.composeLoopback)) out.push('docker-publish'); }
  else {
    if ((m.bind && !isLoopName(m.bind)) || (m.listen && !isLoopName(m.listen))) out.push('bind');
    if (w.ok && w.mode !== 'native') out.push('docker-publish');
  }
  return out;
}
// điều kiện của REQUEST: socket loopback (native), không header proxy / edge, Origin http://localhost|127.0.0.1|[::1]:<cổng> khớp Host
function requestReasons(machine, req) {
  const out = [], m = machine || {}, h = req.headers || {}, sock = req.socket || {};
  if (!m.inDocker && (!isLoopIp(sock.localAddress) || !isLoopIp(sock.remoteAddress))) out.push('socket');
  if (req.gcEdge || PROXY_HEADERS.some(k => h[k] !== undefined)) out.push('proxy');
  // Origin BẮT BUỘC có và là http://localhost|127.0.0.1|[::1]:<cổng>, Host khớp đúng (cả cổng) — trình duyệt qua proxy công khai / trang khác không qua được
  let oh = '', proto = '';
  try { const u = new URL(String(h.origin || '')); oh = u.host.toLowerCase(); proto = u.protocol; } catch (e) { oh = ''; }
  const host = String(h.host || '').toLowerCase(), name = oh.replace(/:\d+$/, '');
  if (!oh || proto !== 'http:' || !LOOP_HOSTS.has(name) || !/:\d{1,5}$/.test(oh) || oh !== host) out.push('origin');
  return out;
}
// đủ danh sách (máy + request) — genchibi setup / test đơn vị. KHÔNG trả nguyên cho request đăng nhập: xem loginReasons
function adminReasons(machine, req) { return machineReasons(machine).concat(req ? requestReasons(machine, req) : []); }
// lời từ chối cho POST /api/auth/login { username: admin } (CNS-268 / CNS-271):
//   1) request không đạt điều kiện request (từ xa, qua proxy, Origin lạ) → CHỈ mã chung 'local-only' — người lạ không đọc được trạng thái máy;
//   2) điều kiện của máy (stage, cửa sổ, online, edge, tunnel, bind, Docker publish) → đủ danh sách (người ở ngay máy cần biết đúng lý do);
//   3) khoá một lần của cửa sổ (link do lệnh trên máy chủ in / mở) thiếu hoặc sai → 'link'. Cửa sổ chứng minh "owner đang ở máy", khoá chứng minh
//      "request này của người đọc được run/admin-window (0600)" — user Unix khác / container khác chạm được cổng nhưng không có khoá.
function loginReasons(machine, req, key) {
  if (requestReasons(machine, req).length) return ['local-only'];
  const mr = machineReasons(machine);
  if (mr.length) return mr;
  const w = (machine || {}).window || {};
  if (typeof key !== 'string' || !KEY_RE.test(key) || !w.key || !safeEqStr(key, w.key)) return ['link'];
  return [];
}
function safeEqStr(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
// câu cho từng mã (msgid tiếng Việt — main.js send() dịch theo người gọi): lý do + đúng cách vào
const REASON_MSG = {
  stage: 'admin / admin chỉ dùng ở lần chạy đầu — máy này đã khởi tạo tài khoản chủ: đăng nhập bằng tên đăng nhập của bạn (quên mật khẩu: chạy genchibi password trên máy chủ)',
  window: 'cửa sổ admin / admin chưa mở hoặc đã quá 30 phút — chạy genchibi open trên máy chủ (mở lại 30 phút), hoặc genchibi password để đặt tài khoản chủ ngay',
  'window-perms': 'tệp cửa sổ admin (run/admin-window) sai quyền hoặc không do genchibi ghi — chạy genchibi open trên máy chủ để ghi lại',
  online: 'máy đang lên mạng (Go online) — admin / admin chỉ dùng khi máy chưa ra Internet: trên máy chủ chạy genchibi password để đặt tài khoản chủ',
  'legacy-env': '.env đang mở app ra ngoài (GC_PUBLIC_URL / GC_ALLOWED_HOSTS) — admin / admin không dùng được: trên máy chủ chạy genchibi password',
  edge: 'edge Caddy đang mở cổng 80 / 443 — admin / admin không dùng được: trên máy chủ chạy genchibi password (hoặc genchibi online --caddy-off rồi genchibi open)',
  tunnel: 'tunnel Cloudflare đang bật — admin / admin không dùng được: trên máy chủ chạy genchibi password (hoặc genchibi online off rồi genchibi open)',
  'docker-publish': 'Docker đang mở cổng của app ra ngoài loopback (GC_BIND hoặc docker-compose.override.yml) — admin / admin không dùng được: đặt GC_BIND=127.0.0.1 rồi genchibi open, hoặc chạy genchibi password',
  bind: 'app đang nghe ra mạng (GC_BIND / GC_LISTEN không phải 127.0.0.1) — admin / admin không dùng được: đặt GC_BIND=127.0.0.1 rồi genchibi restart, hoặc chạy genchibi password',
  socket: 'admin / admin chỉ nhận từ trình duyệt ngay trên máy chủ — mở http://localhost:{port} trên máy chủ, hoặc SSH port-forward: ssh -L {port}:localhost:{port} <máy-chủ> rồi mở http://localhost:{port}; hoặc chạy genchibi password',
  proxy: 'request đi qua proxy / edge — admin / admin chỉ nhận từ trình duyệt ngay trên máy chủ: mở http://localhost:{port} (hoặc SSH port-forward: ssh -L {port}:localhost:{port} <máy-chủ>), hoặc chạy genchibi password',
  origin: 'admin / admin chỉ nhận khi trang mở đúng ở http://localhost:{port} (hoặc 127.0.0.1) — mở lại đúng địa chỉ đó trên máy chủ, hoặc SSH port-forward: ssh -L {port}:localhost:{port} <máy-chủ>',
  'local-only': 'admin / admin chỉ dùng được ngay trên máy chủ, qua link do máy chủ in ra — trên máy chủ chạy genchibi open (hoặc SSH port-forward: ssh -L {port}:localhost:{port} <máy-chủ>), hoặc chạy genchibi password',
  link: 'mở đúng link do trình cài in ra, hoặc chạy genchibi open trên máy chủ (link mới, 30 phút) — admin / admin chỉ nhận qua link đó'
};

module.exports = { Setup, SEEN_DONE_MS, adminReasons, machineReasons, requestReasons, loginReasons, KEY_RE, REASON_MSG, STAGES, CHOICES, WINDOW_MS, PROXY_HEADERS, loginProblem, displayProblem, emailProblem, isLoopIp, isLoopName };
