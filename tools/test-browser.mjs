// Kiểm thử trong trình duyệt (cần Playwright — cục bộ hoặc CI: .github/workflows/browser.yml, mỗi nhóm GC_ONLY một máy): mọi lớp gắn vào đầu phải đi cùng đầu.
// Dùng: node tools/test-browser.mjs   (cả bộ, tự dựng server tạm ở cổng 7496) · GC_ONLY=core → chỉ các khối chung (Studio, Thư viện, phim, biên đạo…) · GC_ONLY=a,b → nhiều nhóm · GC_ONLY=voice node tools/test-browser.mjs → chỉ nhóm giọng AI (cổng 7660) · GC_ONLY=lib → chỉ Thư viện Âm thanh / Giọng (cổng 7662) · GC_ONLY=oauth → chỉ nhóm OAuth (cổng 7664–7666) · GC_ONLY=online → chỉ Hệ thống › Lên mạng + Tài khoản chủ (cổng 7672–7680; GC_SHOTS=<thư mục> chụp màn en + vi) · GC_ONLY=setup → chỉ thiết lập lần đầu v0.23 (cổng 7700–7704; GC_SHOTS=<thư mục> chụp en + vi) · GC_ONLY=bubble → chỉ "lời thoại chuyên nghiệp" (cổng 7495; GC_THROTTLE=4 → CPU trang chậm 4× như máy yếu) · GC_ONLY=video → chỉ xuất video v0.22 (cổng 7690; cần ffmpeg để so khung giải mã lại; GC_SHOTS=<thư mục> chụp bảng Xuất video en + vi)
import { createRequire } from 'module';
import { spawn, spawnSync, execFileSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import * as fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Store } = require('../server/store.js');
import { loadPlaywright } from './pw.mjs';
const pw = loadPlaywright();
if (!pw) { console.error('  ✗ không có Playwright — cài: npm i -g playwright@<bản ghim trong .github/workflows/browser.yml> && npx playwright install chromium'); process.exit(1); }
// Phòng tác phẩm (v0.18) có 5 tab: thao tác vào phần tử đang nằm ở tab ẩn thì bấm đúng tab trước — như người dùng. Chỉ có tác dụng khi phần tử nằm trong [role=tabpanel] đang ẩn.
async function revealTab(page, sel, ms) {
  const t0 = Date.now();
  for (;;) {
    let id = null;
    try { id = await page.locator(sel).first().evaluate(e => { const p = e.closest('[role="tabpanel"]'); return p && p.hidden ? p.id.replace('wpanel-', '') : ''; }, null, { timeout: 300 }); } catch (e) { /* chưa có phần tử */ }
    if (id) { await page.locator('#wtab-' + id).click(); return; }
    if (id === '' || Date.now() - t0 > ms) return;
    await page.waitForTimeout(100);
  }
}
function autoTab(page) {
  for (const m of ['click', 'selectOption', 'fill', 'hover', 'check', 'press']) {
    const orig = page[m].bind(page);
    page[m] = async (sel, ...rest) => { if (typeof sel === 'string' && !/^#wtab-/.test(sel)) await revealTab(page, sel, 3000); return orig(sel, ...rest); };
  }
  const ws = page.waitForSelector.bind(page);
  page.waitForSelector = async (sel, o) => { if (typeof sel === 'string' && (!o || !o.state || o.state === 'visible')) await revealTab(page, sel, (o && o.timeout) || 8000); return ws(sel, o); };
  return page;
}
// NGÔN NGỮ (ADR 0007): Studio mặc định tiếng Anh. Các nhóm test CŨ so chữ tiếng Việt → chạy ở chế độ vi (gc-lang=vi đặt trước khi trang chạy,
// chỉ khi trang chưa có lựa chọn) để giữ nguyên ý nghĩa, không sửa từng regex. Nhóm i18n tự chọn ngôn ngữ: legacyVi(false) trước khi mở trình duyệt.
let LEGACY_VI = true;
const legacyVi = on => { LEGACY_VI = on; };
const viInit = () => { try { if (!localStorage.getItem('gc-lang')) localStorage.setItem('gc-lang', 'vi'); } catch (e) { /* file:// / about:blank */ } };
// ĐĂNG NHẬP CHỦ (v0.21, spec §3.4 — CNS-191): bản cài nào cũng có token chủ và Studio (kể cả ở localhost) phải đăng nhập. Harness KHÔNG nới luật:
//  · mọi server thử dùng chung token chủ TEST_TOKEN (process.env.GC_API_TOKEN — nhóm nào cần token riêng / không token thì tự đặt env);
//  · lời gọi Node tới /api/* của server thử tự gắn Authorization: Bearer TEST_TOKEN nếu chưa có (như CLI);
//  · trước lần mở trang đầu tiên của mỗi server, trình duyệt đăng nhập THẬT bằng tên + mật khẩu chủ (v0.23: lần đầu khởi tạo owner bằng token qua
//    /api/auth/password + bỏ qua wizard qua /api/setup/skip, sau đó /api/auth/login) rồi nhận cookie phiên của server đó — fetch trong trang (cùng nguồn) tự mang cookie như người dùng thật.
//  Nhóm kiểm chính luồng đăng nhập / trang Cấp phép tắt việc này: autoLogin(false) trước khi mở trình duyệt.
const TEST_TOKEN = 'tok-browser-' + Math.random().toString(36).slice(2) + Date.now().toString(36), TEST_PW = 'mat khau thu nghiem trinh duyet', TEST_USER = 'owner';
process.env.GC_API_TOKEN = TEST_TOKEN;
const _fetch = globalThis.fetch;
globalThis.fetch = (u, o) => {
  const url = typeof u === 'string' ? u : (u && u.url) || '';
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+\/api\/(?!health$|auth\/)/.test(url)) { const h = new Headers((o && o.headers) || {}); if (!h.has('authorization')) { h.set('authorization', 'Bearer ' + TEST_TOKEN); o = Object.assign({}, o, { headers: h }); } }
  return _fetch(u, o);
};
let AUTO_LOGIN = true;
const autoLogin = on => { AUTO_LOGIN = on; };
async function ensureSession(ctx, origin) {
  ctx.__gcSess = ctx.__gcSess || new Map();
  const have = ctx.__gcSess.get(origin);
  let st; try { st = await (await _fetch(origin + '/api/auth/state', { headers: have ? { cookie: have } : {} })).json(); } catch (e) { return; }   // không có server ở đó (trang tĩnh, bản xem thử)
  if (st.session) return;
  const post = (p, body, tok) => _fetch(origin + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1', ...(tok ? { Authorization: 'Bearer ' + TEST_TOKEN } : {}) }, body: JSON.stringify(body) });
  // v0.23: bản cài mới ở stage admin → khởi tạo owner bằng token chủ (như genchibi password) rồi bỏ qua wizard lần đầu (genchibi setup skip) — nhóm 'setup' tự kiểm wizard
  if (!st.password) await post('/api/auth/password', { password: TEST_PW }, true);   // admin / must_init: = khởi tạo (tên owner); máy kế thừa (done): đặt mật khẩu đầu
  if (st.stage !== 'done') await post('/api/setup/skip', { reason: 'test-browser harness' }, true);
  const r = await post('/api/auth/login', { username: TEST_USER, password: TEST_PW });
  if (r.status !== 200) return;   // server dùng token / mật khẩu riêng (nhóm OAuth, nhóm đăng nhập) — nhóm đó tự lo
  const kv = r.headers.getSetCookie().map(c => c.split(';')[0]);
  await ctx.addCookies(kv.map(x => ({ name: x.slice(0, x.indexOf('=')), value: x.slice(x.indexOf('=') + 1), url: origin, httpOnly: true, sameSite: 'Lax' })));
  ctx.__gcSess.set(origin, kv.join('; '));
}
function loginGoto(pg) {
  const g = pg.goto.bind(pg);
  pg.goto = async (url, ...rest) => { const m = /^(http:\/\/(?:localhost|127\.0\.0\.1):\d+)(\/|$)/.exec(String(url)); if (m) await ensureSession(pg.context(), m[1]); return g(url, ...rest); };
  return pg;
}
// CSP của Studio (v0.21, review bảo mật 🟡5): MỌI trang của bộ test ghi lại vi phạm Content-Security-Policy (console) — cuối bộ còn vi phạm nào là trượt
const CSP_VIOL = [];
{ const launch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async (...a) => {
    const b = await launch(...a), np = b.newPage.bind(b), nc = b.newContext.bind(b), vi = LEGACY_VI, auto = AUTO_LOGIN;
    const wrap = pg => { autoTab(pg); pg.on('console', m => { const t = m.text(); if (/Content Security Policy/i.test(t)) CSP_VIOL.push(pg.url().slice(0, 80) + ' · ' + t.slice(0, 200)); }); return auto ? loginGoto(pg) : pg; };
    b.newPage = async (...x) => { const pg = await np(...x); if (vi) await pg.addInitScript(viInit); return wrap(pg); };
    b.newContext = async (...x) => { const c = await nc(...x), cp = c.newPage.bind(c); if (vi) await c.addInitScript(viInit); c.newPage = async (...y) => wrap(await cp(...y)); return c; };
    return b;
  }; }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCRIPTS = JSON.parse(readFileSync(path.join(ROOT, 'engine/scripts.json'), 'utf8'));   // một nguồn danh sách mã engine (CNS-054)
// server con do test dựng: tắt hết khi thoát — kể cả khi test sập giữa chừng (L-55: server sót lại khiến lần chạy sau dùng nhầm dữ liệu cũ)
const kids = []; const kid = c => { kids.push(c); return c; };
const up = async (...ports) => { for (const p of ports) { const t0 = Date.now(); for (;;) { try { await new Promise((res, rej) => { const q = require('http').get({ host: '127.0.0.1', port: +p, path: '/api/health' }, r => { r.resume(); res(); }); q.on('error', rej); q.setTimeout(2000, () => q.destroy(new Error('timeout'))); }); break; } catch (e) { if (Date.now() - t0 > 30000) throw new Error('server :' + p + ' không lên sau 30 s'); await new Promise(r => setTimeout(r, 100)); } } } };   // server lên = trả lời HTTP bất kỳ
// GC_ONLY=voice node tools/test-browser.mjs → chỉ chạy nhóm "giọng AI" (lặp nhanh khi làm giọng); không đặt = chạy cả bộ như CI
const ONLY = process.env.GC_ONLY || '';
// v0.23 (B6, CNS-032): CI chạy bộ này theo NHÓM song song (ma trận trong .github/workflows/browser.yml) — GC_ONLY nhận một nhóm hoặc danh sách
// "a,b". Nhóm "core" = các khối không tên (Studio, Thư viện, phim, biên đạo…). Mọi khối của bộ đều thuộc đúng một nhóm (test.sh 2v kiểm ma trận CI
// phủ đủ nhóm). Tên nhóm sai → thoát 2 (không lặng lẽ chạy 0 kiểm).
const GROUPS = ['core', 'auth', 'bubble', 'lib', 'voice', 'dock', 'oauth', 'online', 'i18n', 'setup', 'video', 'video-ui', 'live'];
const ONLY_SET = ONLY ? ONLY.split(',').map(x => x.trim()).filter(Boolean) : [];
{ const bad = ONLY_SET.filter(g => !GROUPS.includes(g)); if (bad.length) { console.error('GC_ONLY: nhóm không có: ' + bad.join(', ') + ' — có: ' + GROUPS.join(', ')); process.exit(2); } }
const want = g => !ONLY_SET.length || ONLY_SET.includes(g);
process.on('exit', () => kids.forEach(c => { try { c.kill(); } catch (e) { /* đã tắt */ } }));
// bị dừng giữa chừng (timeout, Ctrl+C, harness huỷ): thoát có trật tự để 'exit' ở trên tắt mọi server con — không để lại main.js mồ côi
for (const sg of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sg, () => process.exit(130));
process.on('uncaughtException', e => { console.error(e); process.exit(1); });
let fail = 0;
const home = mkdtempSync(path.join(tmpdir(), 'gc-'));
if (want('core')) {
const srv = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: '7496', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
await up(7496);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
const b = await pw.chromium.launch();
const p = await b.newPage();
try {
  await p.goto('http://localhost:7496/');
  await p.waitForFunction(() => window.GenChibi && window.GenChibi.render);
  // CSP thật sự có hiệu lực (đột biến: bỏ header → script chèn vào chạy được): script inline chèn vào trang bị chặn; vi phạm CỐ Ý này không tính vào kiểm cuối bộ
  { const n0 = CSP_VIOL.length;
    const ran = await p.evaluate(async () => { const sc = document.createElement('script'); sc.textContent = 'window.__gcCspProbe = 1'; document.head.appendChild(sc); await new Promise(r => setTimeout(r, 100)); return window.__gcCspProbe === 1; });
    await p.waitForTimeout(200); const caught = CSP_VIOL.length - n0; CSP_VIOL.splice(n0);
    if (ran || caught < 1) { fail = 1; console.log('  ✗ CSP Studio: script inline chèn vào trang phải bị chặn (chạy: ' + ran + ', vi phạm ghi nhận: ' + caught + ')'); }
    else console.log('  ✓ CSP Studio: script inline chèn vào trang bị chặn (script-src \'self\')'); }
  const res = await p.evaluate(async () => {
    const GC = window.GenChibi, out = [];
    const host = document.createElement('div'); host.style.cssText = 'width:300px;height:330px'; document.body.appendChild(host);
    const HEAD_LAYERS = GC.RIG.layers.filter(l => l[1] === 'head').map(l => l[0]);
    for (const a of GC.assets()) {
      for (const st of ['normal', 'think', 'sob' in GC.LIB.motions ? 'cry' : 'normal', 'sleep', 'rage']) {
        const inst = GC.render.full(host, a, st, { force: true });
        for (let k = 0; k < 6; k++) {
          await new Promise(r => setTimeout(r, 180));
          const ref = inst.groups.head.getCTM();
          for (const l of HEAD_LAYERS) {
            const g = inst.groups[l]; if (!g.firstChild) continue;
            const m = g.getCTM();
            const d = Math.abs(m.a - ref.a) + Math.abs(m.b - ref.b) + Math.abs(m.e - ref.e) + Math.abs(m.f - ref.f);
            if (d > 0.01) out.push(a.id + '/' + st + ': lớp ' + l + ' lệch khỏi đầu ' + d.toFixed(2));
          }
        }
        inst.destroy();
      }
    }
    return [...new Set(out)];
  });
  if (res.length) { fail = 1; res.slice(0, 20).forEach(x => console.log('  ✗', x)); }
  else console.log('  ✓ mọi lớp gắn vào đầu đi cùng đầu (mọi nhân vật × 5 biểu cảm × 6 khung hình)');
} finally { await b.close(); srv.kill(); }
}
// v0.21 (spec §3.3–§3.4, Q35): Studio đăng nhập chủ — kể cả mở ở localhost. Bản cài mới (v0.23): admin / admin + màn khởi tạo — nhóm setup; ở đây khởi tạo bằng token (mã setup v0.21 đã bỏ;
// không còn #code=…) → đăng xuất → đăng nhập bằng mật khẩu → "Dùng token". Máy kế thừa (.env có GC_PUBLIC_URL từ trước): token như v0.20 + dải Đặt mật khẩu,
// có phiên cookie thì xoá gc-token khỏi localStorage. GC_ONLY=auth chỉ chạy nhóm này (cổng 7497 + 7669).
if (want('auth')) {
  const home2 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv2 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home2, GC_PORT: '7497', GC_NO_AUTOCHECK: '1', GC_API_TOKEN: 'tok-test-123', GC_CLIENT_IP_HEADER: 'x-forwarded-for' }, stdio: 'ignore' }));
  const home2l = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv2l = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home2l, GC_PORT: '7669', GC_NO_AUTOCHECK: '1', GC_API_TOKEN: 'tok-legacy-456', GC_PUBLIC_URL: 'https://chibi.example.test', GC_ALLOWED_HOSTS: 'chibi.example.test' }, stdio: 'ignore' }));
  await up(7497, 7669);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  autoLogin(false); const b2 = await pw.chromium.launch(); autoLogin(true);
  const errs2 = []; let q = null;
  const PWB = 'mot cum tu de nho cho studio', SUB = '#gcLogin button[type=submit]';
  const studioUp = pg => pg.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
  const alertText = async pg => { await pg.waitForSelector('#gcLogin [role=alert]:not([hidden])', { timeout: 5000 }); return pg.textContent('#gcLogin [role=alert]'); };
  try {
    q = await b2.newPage(); q.on('pageerror', e => errs2.push(e.message));
    // 1) bản cài mới (stage admin), chưa cửa sổ → màn Đăng nhập có dải "lần đầu: admin / admin"; admin / admin bị từ chối kèm ĐÚNG lý do + cách vào
    await q.goto('http://localhost:7497/');
    await q.waitForSelector('#gcLogin form[data-auth="login"] #gcFirstRun', { timeout: 8000 });
    if (!/admin \/ admin/.test(await q.textContent('#gcFirstRun'))) throw new Error('màn đăng nhập lần đầu phải nhắc admin / admin');
    await q.fill('#gcUser', 'admin'); await q.fill('#gcPw', 'admin'); await q.click(SUB);
    if (!/genchibi open/.test(await alertText(q)) || await q.getAttribute('#gcLogin [role=alert]', 'data-reason') !== 'window') throw new Error('ngoài cửa sổ: admin / admin phải báo lý do "window" + genchibi open: ' + await q.textContent('#gcLogin [role=alert]'));
    // 2) lệnh trên máy chủ mở cửa sổ (như genchibi open) → admin / admin → màn KHỞI TẠO (bắt buộc): luật tên / mật khẩu, rồi wizard
    fs.mkdirSync(path.join(home2, 'run'), { recursive: true, mode: 0o700 });
    const key2 = (await import('crypto')).randomBytes(16).toString('hex');   // khoá một lần (CNS-268) — owner mở đúng link http://localhost:<cổng>/login#k=<khoá> do genchibi open in / mở
    fs.writeFileSync(path.join(home2, 'run/admin-window'), JSON.stringify({ v: 1, exp: Date.now() + 1800e3, mode: 'native', composeLoopback: false, by: 'test', key: key2 }), { mode: 0o600 });
    await q.goto('http://localhost:7497/login#k=' + key2); await q.waitForSelector('#gcFirstRun[data-key="yes"]', { timeout: 8000 });
    await q.fill('#gcUser', 'admin'); await q.fill('#gcPw', 'admin'); await q.click(SUB);
    await q.waitForSelector('#gcLogin form[data-auth="init"]', { timeout: 8000 });
    if (!await q.$('#gcAdminLeft')) throw new Error('màn khởi tạo phải nói phiên admin hết hạn lúc nào');
    await q.fill('#gcUser', 'admin'); await q.fill('#gcPw', PWB); await q.fill('#gcPw2', PWB); await q.click(SUB);
    if (!/admin/.test(await alertText(q))) throw new Error('tên đăng nhập admin phải bị chặn');
    await q.fill('#gcUser', 'ryan'); await q.fill('#gcPw', 'ngan qua'); await q.fill('#gcPw2', 'ngan qua'); await q.click(SUB);
    if (!/12/.test(await alertText(q))) throw new Error('mật khẩu < 12 ký tự phải báo lỗi');
    await q.fill('#gcPw', PWB); await q.fill('#gcPw2', PWB + 'x'); await q.click(SUB);
    if (!/không khớp/.test(await alertText(q))) throw new Error('hai lần nhập khác nhau phải báo lỗi');
    await q.fill('#gcPw2', PWB); await q.fill('#gcName', 'Ryan'); await q.click(SUB);
    await q.waitForSelector('#suBox #suDomain', { timeout: 10000 });
    if (await q.evaluate(() => document.cookie)) throw new Error('cookie phiên phải HttpOnly (JS không đọc được)');
    await _fetch('http://localhost:7497/api/setup/skip', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1', Authorization: 'Bearer tok-test-123' }, body: '{"reason":"test auth"}' });
    await q.goto('http://localhost:7497/'); await studioUp(q);
    console.log('  ✓ Lần đầu: màn đăng nhập nhắc admin / admin · ngoài cửa sổ → lý do "window" + genchibi open · cửa sổ mở → màn khởi tạo bắt buộc (chặn tên admin / mật khẩu < 12 / hai lần khác) → wizard; cookie HttpOnly');
    // 3) đăng xuất → màn Đăng nhập; sai → báo lỗi; đúng (tên + mật khẩu) → vào lại
    await q.click('#authLogout');
    await q.waitForSelector('#gcLogin form[data-auth="login"]', { timeout: 8000 });
    if (new URL(q.url()).pathname !== '/login') throw new Error('đăng xuất phải về /login');
    if (await q.$('#gcFirstRun')) throw new Error('đã khởi tạo: màn đăng nhập không còn dải admin / admin');
    await q.fill('#gcUser', 'ryan'); await q.fill('#gcPw', 'sai mat khau roi nhe'); await q.click(SUB);
    if (!/(không đúng|wrong)/.test(await alertText(q))) throw new Error('sai mật khẩu phải báo lỗi');
    await q.fill('#gcUser', 'admin'); await q.fill('#gcPw', 'admin'); await q.click(SUB);
    // đợi CÂU TRẢ LỜI của lần bấm này (lỗi cũ "sai mật khẩu" bị ẩn + bỏ data-reason lúc gửi) rồi mới đọc lý do
    const rsn = await q.waitForSelector('#gcLogin [role=alert][data-reason]:not([hidden])', { timeout: 8000 }).then(e => e.getAttribute('data-reason'));
    if (rsn !== 'stage') throw new Error('sau khởi tạo: admin / admin phải báo lý do "stage": ' + rsn);
    await q.fill('#gcUser', 'ryan'); await q.fill('#gcPw', PWB); await q.click(SUB); await studioUp(q);
    console.log('  ✓ Đăng xuất (chân thanh bên) → /login · sai mật khẩu → báo lỗi · admin / admin sau khởi tạo → lý do "stage" · tên + mật khẩu đúng → vào lại');
    // 4) /setup khi đã có mật khẩu → /login; đã đăng nhập mà mở /login → về trang chính
    const ctx2 = await b2.newContext(); const q2 = await ctx2.newPage(); q2.on('pageerror', e => errs2.push(e.message));
    await q2.goto('http://localhost:7497/setup'); await q2.waitForSelector('#gcLogin form[data-auth="login"]', { timeout: 8000 });
    if (new URL(q2.url()).pathname !== '/login') throw new Error('/setup khi đã có mật khẩu phải chuyển /login: ' + q2.url());
    await q.goto('http://localhost:7497/login'); await studioUp(q);
    if (new URL(q.url()).pathname !== '/') throw new Error('đã đăng nhập mà mở /login phải về trang chính');
    // 5) "Dùng token" (CLI / máy kế thừa): sai → báo; đúng → vào
    await q2.click('#gcLogin a:has-text("Dùng token")'); await q2.waitForSelector('#gcTok');
    await q2.fill('#gcTok', 'sai-token'); await q2.click(SUB);
    await q2.waitForFunction(() => /không đúng/.test((document.getElementById('gcLogin') || {}).textContent || ''), null, { timeout: 5000 });
    await q2.fill('#gcTok', 'tok-test-123'); await q2.click(SUB); await studioUp(q2);
    if (await q2.evaluate(() => localStorage.getItem('gc-token')) !== 'tok-test-123') throw new Error('đăng nhập bằng token phải nhớ token trong trình duyệt (như v0.20)');
    await ctx2.close();
    // 5b) trần theo tài khoản: 100 lần sai từ 100 "IP" (proxy khai tường minh) → màn đăng nhập báo chặn tạm + lối token; chủ vào bằng token thấy dải cảnh báo, "Đã xem" tắt
    for (let i = 0; i < 100; i++) await _fetch('http://localhost:7497/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1', 'X-Forwarded-For': '198.51.100.' + (i + 1) }, body: JSON.stringify({ username: 'ryan', password: 'doan sai lan ' + i }) });
    const ctx4 = await b2.newContext(); const q4 = await ctx4.newPage(); q4.on('pageerror', e => errs2.push(e.message));
    await q4.goto('http://localhost:7497/login'); await q4.waitForSelector('#gcPw', { timeout: 8000 });
    // CNS-210: /api/auth/state công khai không báo locked → trước lần thử chưa có dải; lần thử trả 429 locked → dải "chặn tạm" + lối token
    if (await q4.$('#gcLocked')) throw new Error('CNS-210: trước khi thử, màn đăng nhập của người lạ không được biết tài khoản đang bị chặn');
    await q4.fill('#gcUser', 'ryan'); await q4.fill('#gcPw', PWB); await q4.click(SUB);
    if (!/chặn tạm/.test(await alertText(q4))) throw new Error('đang bị chặn: đúng mật khẩu (chưa có cookie thiết bị) vẫn bị từ chối, kèm câu chặn tạm');
    await q4.waitForSelector('#gcLocked', { timeout: 8000 });
    if (!/chặn tạm/.test(await q4.textContent('#gcLocked'))) throw new Error('đang bị chặn theo tài khoản: sau lần thử, màn đăng nhập phải báo "chặn tạm — dùng token hoặc chờ N phút"');
    await q4.click('#gcLogin a:has-text("Dùng token")'); await q4.fill('#gcTok', 'tok-test-123'); await q4.click(SUB); await studioUp(q4);
    await q4.waitForSelector('#authAlert', { timeout: 5000 });
    if (!/100 lần sai từ 100 địa chỉ/.test(await q4.textContent('#authAlert'))) throw new Error('dải cảnh báo phải nêu số lần sai / số địa chỉ: ' + await q4.textContent('#authAlert'));
    await q4.click('#authAlert a'); await q4.waitForSelector('#authAlert', { state: 'detached', timeout: 5000 });
    await ctx4.close();
    console.log('  ✓ Chặn theo tài khoản: màn đăng nhập báo "chặn tạm — dùng token hoặc chờ N phút", mật khẩu đúng vẫn bị từ chối · token vẫn vào · Studio hiện dải cảnh báo (100 lần sai / 100 địa chỉ), "Đã xem" tắt dải');
    console.log('  ✓ /setup sau khi có mật khẩu → /login · đã đăng nhập mở /login → về trang chính · "Dùng token": sai → báo, đúng → vào (nhớ như v0.20)');
    // 6) máy kế thừa: token trước (như v0.20) + dải "Chưa có mật khẩu chủ" → Đặt mật khẩu bằng token → có phiên thì xoá gc-token
    const ctx3 = await b2.newContext(); const q3 = await ctx3.newPage(); q3.on('pageerror', e => errs2.push(e.message));
    await q3.goto('http://localhost:7669/'); await q3.waitForSelector('#gcLogin form[data-auth="token"]', { timeout: 8000 });
    await q3.fill('#gcTok', 'tok-legacy-456'); await q3.click(SUB); await studioUp(q3);
    await q3.waitForSelector('#authNoPw', { timeout: 5000 });
    if (!/Chưa có mật khẩu chủ/.test(await q3.textContent('#authNote'))) throw new Error('máy kế thừa vào bằng token: chân thanh bên phải có dải "Chưa có mật khẩu chủ"');
    if (await q3.$('#suBox')) throw new Error('máy kế thừa (stage done): không bị giữ ở wizard');
    await q3.evaluate(() => { location.href = '/xuong'; }); await studioUp(q3);
    await q3.click('#nav button:has-text("Tài khoản chủ")'); await q3.waitForSelector('#acPw', { timeout: 8000 });
    if (await q3.$('#acCur')) throw new Error('đang vào bằng token: đặt mật khẩu không cần mật khẩu hiện tại');
    await q3.fill('#acPw', PWB); await q3.fill('#acPw2', PWB); await q3.click('#acSave');
    await q3.waitForSelector('#acProfile', { timeout: 8000 });   // có mật khẩu → hồ sơ chủ (tên đăng nhập owner) hiện
    if (await q3.inputValue('#acLogin') !== 'owner') throw new Error('máy kế thừa: tên đăng nhập mặc định phải là owner');
    const ctx3b = await b2.newContext(); const q3b = await ctx3b.newPage(); q3b.on('pageerror', e => errs2.push(e.message));
    await q3b.goto('http://localhost:7669/login'); await q3b.waitForSelector('#gcUser', { timeout: 8000 });
    await q3b.fill('#gcUser', 'owner'); await q3b.fill('#gcPw', PWB); await q3b.click(SUB); await studioUp(q3b);
    await q3b.waitForSelector('#authLogout', { timeout: 8000 });
    await ctx3b.close(); await ctx3.close();
    console.log('  ✓ Máy kế thừa (.env GC_PUBLIC_URL): vào bằng token như v0.20, không bị giữ ở wizard, dải "Chưa có mật khẩu chủ" → Tài khoản chủ đặt mật khẩu bằng token (không cần mật khẩu cũ) → đăng nhập "owner" + mật khẩu');
    if (errs2.length) throw new Error('lỗi trang: ' + errs2.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ đăng nhập Studio:', e.message); if (q) { try { console.log('    trang:', q.url()); } catch (x) { /* đã đóng */ } } }
  finally { await b2.close(); srv2.kill(); srv2l.kill(); }
}
// Studio tách hai khu: Thư viện (thành phẩm, lấy về dùng) và Xưởng (tạo lập). Mọi trang mở không lỗi;
// thư viện có thẻ theo nhóm + khu "Dùng" (tải ảnh, chép mã); đạo diễn diễn được trong cảnh.
if (want('core')) {
  const home3 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv3 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home3, GC_PORT: '7498', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await up(7498);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  const b3 = await pw.chromium.launch();
  const q = await b3.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = []; q.on('pageerror', e => errs.push(e.message));
  try {
    // "/" = màn chọn khu: 3 thẻ dẫn sang 3 ứng dụng độc lập
    await q.goto('http://localhost:7498/');
    await q.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 5000 });
    await q.waitForSelector('.appcard', { timeout: 5000 });
    const hrefs = await q.$$eval('.appcard', els => els.map(e => e.getAttribute('href')));
    if (hrefs.join() !== '/xuong,/thu-vien,/tao-tac') throw new Error('màn chọn khu: ' + hrefs.join());
    let pages = 0;
    for (const [app, zone0] of [['xuong', 'zone-fab'], ['thu-vien', 'zone-lib'], ['tao-tac', 'zone-make']]) {
    await q.goto('http://localhost:7498/' + app);
    await q.waitForSelector('.nav-group.' + zone0, { timeout: 5000 });
    // ỨNG DỤNG ĐỘC LẬP: chỉ có menu của lớp mình (+ Hệ thống), không lẫn lớp khác
    const zones = await q.$$eval('.nav-group', els => els.map(e => e.className.replace('nav-group ', '')));
    if (zones.some(z => z !== zone0 && z !== 'zone-sys')) throw new Error(app + ': menu lẫn lớp khác ' + zones.join(','));
    const n = await q.$$eval('.nav-item', els => els.length); pages += n;
    for (let i = 0; i < n; i++) {
      const btn = (await q.$$('.nav-item'))[i]; const label = (await btn.textContent()).trim(), cls = await btn.getAttribute('class');
      await btn.click(); await q.waitForTimeout(350);
      const zone = await q.evaluate(() => document.body.getAttribute('data-zone')), tag = await q.textContent('.zone-tag');
      if (!zone || !tag) throw new Error('trang "' + label + '" thiếu nhãn khu');
      if (zone === 'lib' && /zone-lib/.test(cls) && !/^(Âm thanh|Giọng)\d*$/.test(label)) {   // Âm thanh / Giọng là bảng Data Console (không phải lưới thẻ), có test riêng ở nhóm lib
        // Thư viện không bày đồ của khung: bản cài mới thì trống (có lời dẫn); có asset đã tạo thì có thẻ + khu Dùng
        const cards = await q.$$('.libcard'), use = await q.$$('.usebar'), code = await q.$('textarea.code'), empty = await q.$('.lib-empty');
        if (!empty && (!cards.length || use.length < 2 || !code)) throw new Error('thư viện "' + label + '" thiếu thẻ hoặc khu Dùng');
        if (cards.length && await q.$('.libcard img[alt="Ma-nơ-canh"]')) throw new Error('thư viện "' + label + '" bày đồ của khung');
        if (code) { const txt = await code.inputValue(); if (!/\//.test(txt)) throw new Error('thư viện "' + label + '": mã tham chiếu rỗng'); }
      }
      if (zone === 'lib' && /^(Âm thanh|Giọng)\d*$/.test(label) && (await q.$$('.lc-t tbody tr[data-id]')).length < 22) throw new Error('trang "' + label + '" không có bảng');
      if (label === 'Bộ khung chuẩn' && (await q.$$('.libcard')).length < 10) throw new Error('trang Bộ khung chuẩn thiếu khối vật phẩm');
      if (!new RegExp('/' + app + '$').test(new URL(q.url()).pathname)) throw new Error('trang "' + label + '" rời khỏi ứng dụng ' + app);
    }
    }
    await q.goto('http://localhost:7498/tao-tac'); await q.waitForSelector('.nav-item');
    // hồi quy: mã nhúng web không để tên do agent đặt thoát khỏi <script>
    await q.evaluate(async () => {
      const a = JSON.parse(JSON.stringify(window.GenChibi.ASSETS['gen.khung/ma-no-canh']));
      Object.assign(a, { id: 'xss-ci', pack: 'local.my', name: '</script><img src=x onerror=alert(1)>', status: 'draft' }); delete a.key;
      const r = await fetch('api/assets/local.my/xss-ci', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify(a) });
      if (!r.ok) throw new Error('không lưu được nhân vật thử: ' + r.status);
      localStorage.setItem('gc-route-thu-vien', JSON.stringify({ page: 'lib-characters', key: 'local.my/xss-ci' }));
    });
    await q.goto('http://localhost:7498/thu-vien'); await q.waitForTimeout(900);
    await q.click('button:text-is("Nhúng web")');
    const embed = await q.inputValue('textarea.code');
    const dataLine = embed.split('\n').find(l => /registerAsset/.test(l)) || '';
    if (!/xss-ci/.test(dataLine) || /<\//.test(dataLine)) throw new Error('mã nhúng để chữ thoát khỏi <script>: ' + dataLine.slice(0, 120));
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Studio: ' + pages + ' trang mở không lỗi; 3 lớp Thư viện / Tạo tác / Xưởng; Thư viện có thẻ theo nhóm + tải ảnh + chép mã; đạo diễn diễn trong cảnh; mã nhúng không bị chèn script');
  } catch (e) { fail = 1; console.log('  ✗ Studio Thư viện/Xưởng:', e.message); }
  finally { await b3.close(); srv3.kill(); }
}
// Giai đoạn ②: Xưởng › Tạo asset mới (chọn khung → tham số → soát → cổng → lưu) → Thư viện xếp theo dự án chủ đề
if (want('core')) {
  const home4 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv4 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home4, GC_PORT: '7499', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await up(7499);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  const b4 = await pw.chromium.launch();
  const q = await b4.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = []; q.on('pageerror', e => errs.push(e.message));
  try {
    await q.goto('http://localhost:7499/');
    await q.evaluate(async () => {
      const r = await fetch('api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ id: 'ci-du-an', name: 'Dự án CI' }) });
      if (!r.ok) throw new Error('không tạo được dự án: ' + r.status);
      localStorage.setItem('gc-route-xuong', JSON.stringify({ page: 'create', project: 'ci-du-an' }));
    });
    await q.goto('http://localhost:7499/xuong'); await q.waitForTimeout(700);
    const saveIn = async kind => {
      if (kind) { await q.click('.split.create .seg button:has-text("' + kind + '")'); await q.waitForTimeout(250); }
      await q.click('.split.create .libcard'); await q.waitForTimeout(350);
      if (!(await q.$$('.split.create .sticky img')).length) throw new Error('bàn soát trống (' + (kind || 'Nhân vật') + ')');
      await q.click('button:has-text("Lưu vào Thư viện · Dự án CI")'); await q.waitForTimeout(700);
      if (!/Đã lưu local\.my\//.test(await q.textContent('.split.create .sticky'))) throw new Error('chưa lưu được ' + (kind || 'Nhân vật'));
    };
    await q.fill('.split.create input[type=text]', 'Nhân vật CI').catch(() => {});
    await saveIn(null);
    await q.fill('.split.create input[type=text]', 'Nhân vật CI'); await q.waitForTimeout(200);
    await saveIn('Vật phẩm'); await saveIn('Bối cảnh');
    await q.goto('http://localhost:7499/thu-vien'); await q.waitForSelector('.nav-item');
    await q.click('.nav-item:has-text("Dự án chủ đề")'); await q.waitForTimeout(500);
    const card = await q.textContent('.libcard.proj');
    if (!/Dự án CI/.test(card) || !/1 nhân vật · 1 vật phẩm · 1 bối cảnh/.test(card)) throw new Error('trang dự án: ' + card);
    await q.click('.nav-item.zone-lib:has-text("Vật phẩm")'); await q.waitForTimeout(400);
    if (!(await q.$('.seg button:has-text("Dự án · Dự án CI")'))) throw new Error('Thư viện không có mục theo dự án');
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    // Giai đoạn ③: Tác phẩm — phân cảnh (bối cảnh + diễn viên + lời thoại) → cảnh thành phẩm → sân khấu final diễn cả chuỗi
    await q.evaluate(async () => {
      const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify(b) }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
      await post('api/works', { title: 'Phim CI', project: 'ci-du-an' });
      for (const t of ['Một', 'Hai']) await post('api/works/phim-ci/shots', { shot: { title: 'Cảnh ' + t, scene: 'gen.khung/san-khau-chuan', cast: ['ma-no-canh'], event: { title: t, steps: [{ actor: 'ma-no-canh', state: 'shock', spot: 'center', say: 'Cảnh ' + t, hold: 1 }] } } });
      localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'phim-ci' }));   // v0.18: Tạo tác mở danh sách; vào thẳng phòng của tác phẩm bằng tuyến có work
    });
    await q.goto('http://localhost:7499/tao-tac'); await q.waitForTimeout(900);
    if ((await q.$$('.shot img.still')).length !== 2 || (await q.$$('.shot')).length !== 2) throw new Error('phòng tác phẩm thiếu phân cảnh (ảnh khung đầu + thẻ)');
    await q.click('button[data-playall]'); await q.waitForTimeout(300);
    if (!(await q.$('.gcp .gcp-title'))) throw new Error('sân khấu final không mở bằng thẻ tiêu đề phân cảnh');
    await q.waitForSelector('.gcp .gcp-bub', { timeout: 6000 });   // bong bóng truyện tranh (v0.14: lớp phủ .gcp-bub, không còn gắn trong diễn viên)
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Tác phẩm: phân cảnh → cảnh thành phẩm → sân khấu final diễn cả chuỗi (thẻ tiêu đề + diễn viên + thoại)');
    // Kịch bản lẻ do agent gửi qua MCP (save_event) → "+ Thành phân cảnh" → tác phẩm thêm 1 phân cảnh sẵn sàng
    await q.evaluate(async () => {
      const r = await fetch('api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ author: 'agent-ci', event: { title: 'Lẻ CI', scene: 'gen.khung/san-khau-chuan', steps: [{ actor: 'ma-no-canh', state: 'vow', spot: 'center', say: 'Từ agent!' }] } }) });
      if (!r.ok) throw new Error('save_event ' + r.status);
    });
    await q.reload(); await q.waitForSelector('button:has-text("+ Thành phân cảnh")');
    await q.click('button:has-text("+ Thành phân cảnh")'); await q.waitForTimeout(700);
    if ((await q.$$('.shot')).length !== 3 || !/Sẵn sàng diễn cả 3 phân cảnh/.test(await q.textContent('.readybar'))) throw new Error('kịch bản lẻ chưa thành phân cảnh sẵn sàng');
    const redir = await fetch('http://localhost:7499/tao-tac/', { redirect: 'manual' });
    if (redir.status !== 301 || redir.headers.get('location') !== '/tao-tac') throw new Error('/tao-tac/ phải chuyển về /tao-tac (' + redir.status + ')');
    console.log('  ✓ Kịch bản lẻ (agent qua MCP) → "+ Thành phân cảnh" → sẵn sàng diễn; /tao-tac/ → /tao-tac');
    // Xuất phim HTML độc lập: tải về, mở bằng file:// (KHÔNG có server), bấm xem → phải diễn được thật
    const [dl] = await Promise.all([q.waitForEvent('download'), q.click('button:has-text("Phim (HTML)")')]);
    const filmPath = path.join(home4, 'phim.html'); await dl.saveAs(filmPath);
    const f = await b4.newPage({ viewport: { width: 1280, height: 900 } }); const ferr = [];
    f.on('pageerror', e => ferr.push(e.message)); f.on('requestfailed', r => ferr.push('mạng: ' + r.url()));
    await f.goto('file://' + filmPath); await f.waitForTimeout(500);
    if ((await f.$$('#chapters li')).length !== 3) throw new Error('phim xuất ra thiếu danh sách phân cảnh');
    await f.click('#big'); await f.waitForSelector('.gcp .gcp-title', { timeout: 3000 }); await f.waitForSelector('.gcp .gcp-bub', { timeout: 6000 });
    if (ferr.length) throw new Error('phim xuất ra lỗi: ' + ferr.slice(0, 3).join(' | '));
    await f.close();
    const [sb] = await Promise.all([q.waitForEvent('download'), q.click('button:has-text("Storyboard SVG")')]);
    const sbText = require('fs').readFileSync(await sb.path(), 'utf8');
    if (!/<image [^>]*href="data:image\/svg\+xml;base64,/.test(sbText) || !/Cảnh Một/.test(sbText)) throw new Error('storyboard thiếu ảnh phân cảnh / tiêu đề');
    // CNS-047: MCP export_film_html / get_storyboard = ĐÚNG tệp Studio vừa xuất (cùng tác phẩm, cùng ngôn ngữ giao diện vi, không giọng AI) — một nguồn studio/film-html.js
    {
      const wid = await q.evaluate(() => fetch('api/works', { headers: { 'X-GC-Request': '1' } }).then(r => r.json()).then(l => l[0].id));
      const mcpCall = (name, args) => fetch('http://localhost:7499/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TEST_TOKEN }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }).then(r => r.json()).then(j => j.result);
      const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i + ': studio «' + a.slice(Math.max(0, i - 60), i + 80) + '» ≠ mcp «' + b.slice(Math.max(0, i - 60), i + 80) + '»'; };
      const studioFilm = require('fs').readFileSync(filmPath, 'utf8'), mf = await mcpCall('export_film_html', { work: wid, lang: 'vi' });
      if (!mf || mf.isError || mf.content[1].resource.text !== studioFilm) throw new Error('MCP export_film_html khác phim Studio xuất: ' + (mf && !mf.isError ? firstDiff(studioFilm, mf.content[1].resource.text) : JSON.stringify(mf).slice(0, 200)));
      const ms = await mcpCall('get_storyboard', { work: wid, lang: 'vi' });
      if (!ms || ms.isError || ms.content[1].resource.text !== sbText) throw new Error('MCP get_storyboard khác storyboard Studio: ' + (ms && !ms.isError ? firstDiff(sbText, ms.content[1].resource.text) : JSON.stringify(ms).slice(0, 200)));
    }
    console.log('  ✓ Xuất thành phẩm: phim HTML độc lập mở không cần server và diễn được; storyboard có ảnh + lời thoại; MCP export_film_html / get_storyboard ra ĐÚNG từng byte tệp Studio xuất');
    console.log('  ✓ Tạo asset mới: chọn khung → soát → cổng → lưu nhân vật / vật phẩm / bối cảnh vào dự án; Thư viện xếp theo dự án chủ đề');
  } catch (e) { fail = 1; console.log('  ✗ Tạo asset mới / dự án:', e.message); }
  finally { await b4.close(); srv4.kill(); }
}
// Người dùng mới: màn chọn khu → "Mở dự án mẫu" một chạm → Thư viện có dự án đủ asset → Tạo tác sẵn sàng diễn cả phim
if (want('core')) {
  const home5 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv5 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home5, GC_PORT: '7494', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await up(7494);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  const b5 = await pw.chromium.launch();
  const q = await b5.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; q.on('pageerror', e => errs.push(e.message));
  try {
    await q.goto('http://localhost:7494/'); await q.waitForSelector('.qsteps');
    await q.click('button:has-text("Mở dự án mẫu")'); await q.waitForURL(/\/thu-vien$/, { timeout: 8000 }); await q.waitForSelector('.libcard.proj');
    const card = await q.textContent('.libcard.proj');
    if (!/Văn phòng vui/.test(card) || !/3 nhân vật · 1 vật phẩm · 2 bối cảnh/.test(card)) throw new Error('dự án mẫu: ' + card);
    if (await q.$('button:has-text("Dự án mẫu")')) throw new Error('đã có dự án mẫu mà vẫn mời mở lại');
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('table.worklist tr.click');   // v0.18: danh sách tác phẩm trước, click hàng vào phòng
    if (!/mau-ngay-dau-di-lam/.test(await q.textContent('table.worklist'))) throw new Error('danh sách thiếu tác phẩm mẫu');
    await q.click('table.worklist a.rowlink'); await q.waitForSelector('.readybar');
    const rb = await q.textContent('.readybar');
    if (!/Sẵn sàng diễn cả 4 phân cảnh/.test(rb)) throw new Error('tác phẩm mẫu: ' + rb);
    await q.goto('http://localhost:7494/'); await q.waitForSelector('.qsteps');
    if ((await q.$$('.qsteps li.done')).length !== 3) throw new Error('Bắt đầu nhanh chưa đánh dấu đủ 3 bước sau khi mở dự án mẫu');
    // Nháp → Phát hành (Q3): bấm ở khung Dùng, vẫn đứng ở asset đó; gói bán chỉ có asset phát hành, không tác phẩm, trang bị nháp → cảnh báo
    await q.goto('http://localhost:7494/thu-vien'); await q.click('.nav-item.zone-lib:has-text("Nhân vật")');
    await q.click('.libcard[title="local.my/mau-anh-ba"]'); await q.click('.sticky button.btn.sm:text-is("Phát hành")');
    await q.waitForSelector('.sticky button.btn.sm:text-is("Về nháp")', { timeout: 5000 });
    if (!/Anh Ba/.test(await q.textContent('.sticky h3'))) throw new Error('phát hành xong bị nhảy sang asset khác');
    await q.click('.nav-item.zone-lib:has-text("Dự án chủ đề")'); await q.click('.libcard.proj[title="mau-van-phong-vui"]');
    const alerts = []; q.on('dialog', d => { alerts.push(d.message()); d.accept(); });
    const [gb] = await Promise.all([q.waitForEvent('download'), q.click('button:has-text("Gói bán · 1 asset phát hành")')]);
    const sale = JSON.parse(require('fs').readFileSync(await gb.path(), 'utf8'));
    if (sale.kind !== 'sale' || sale.characters.length !== 1 || sale.characters[0].id !== 'mau-anh-ba' || sale.works.length) throw new Error('gói bán sai: ' + JSON.stringify({ k: sale.kind, c: sale.characters.map(a => a.id), w: sale.works.length }));
    if (!alerts.some(m => /mau-tap-ho-so/.test(m))) throw new Error('gói bán thiếu cảnh báo trang bị còn nháp');
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Người dùng mới: "Mở dự án mẫu" một chạm → Thư viện đủ asset → Tạo tác sẵn sàng 4/4 phân cảnh → Bắt đầu nhanh 3/3');
    console.log('  ✓ Phát hành ở khung Dùng (giữ chỗ chọn) → Gói bán chỉ asset phát hành, không tác phẩm, trang bị nháp có cảnh báo');
    // tác phẩm lưu trước v0.12 (tham chiếu afi.*): Studio chọn đúng bối cảnh / diễn viên, bấm Lưu không âm thầm xoá bối cảnh
    new Store(path.join(home5, 'data')).saveWork({ id: 'phim-cu', title: 'Phim cũ', project: 'mau-van-phong-vui', shots: [{ id: 'c1', title: 'Cũ', scene: 'afi.khung/san-khau-chuan', cast: ['afi.khung/ma-no-canh'], event: { title: 'x', scene: 'afi.khung/san-khau-chuan', steps: [{ actor: 'ma-no-canh', state: 'vow', spot: 'center', say: 'A' }] } }] });
    new Store(path.join(home5, 'data')).saveAsset('afi.khung/ban-cu', { name: 'Bản chỉnh khung cũ', look: { eyes: 'round', brows: 'normal', parts: {} } }, 'giả lập dữ liệu trước v0.11');
    await q.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'phim-cu' })));
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('select[aria-label="Bối cảnh"]');
    const scv = await q.$eval('select[aria-label="Bối cảnh"]', e => e.value);
    if (scv !== 'gen.khung/san-khau-chuan') throw new Error('phân cảnh cũ: select bối cảnh = "' + scv + '"');
    if (!(await q.evaluate(() => !!GenChibi.ASSETS['local.my/ban-cu'] && !GenChibi.ASSETS['gen.khung/ban-cu']))) throw new Error('Studio: bản ghi cũ trong pack khung phải nạp thành bản sao Của tôi, không vào khung');
    await q.click('.shot button:text-is("Lưu")'); await q.waitForTimeout(600);
    const wcu = await (await fetch('http://localhost:7494/api/works/phim-cu')).json();
    if (wcu.shots[0].scene !== 'gen.khung/san-khau-chuan' || !wcu.shots[0].event) throw new Error('lưu phân cảnh cũ làm mất bối cảnh / lời thoại: ' + JSON.stringify(wcu.shots[0]));
    console.log('  ✓ Dữ liệu cũ (afi.*): Studio chọn đúng bối cảnh, Lưu giữ nguyên bối cảnh + lời thoại; bản ghi trong pack khung thành bản sao Của tôi');
    // PHIM SỐNG (L-51): đo đúng thứ người xem thấy — nhân vật di chuyển thật, miệng nhép thật, bong bóng vẽ thật, máy quay cận, âm thanh bật
    await q.evaluate(() => { localStorage.setItem('gc-audio', JSON.stringify({ voice: 'blip' })); localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'mau-ngay-dau-di-lam' })); });
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('.readybar:not(.dubbar)');
    await q.click('button[data-playall]');
    const seen = { left: new Set(), mouth: new Set(), scale: 0, bubble: 0, tail: 0, name: 0 };
    for (let k = 0; k < 26; k++) {
      await q.waitForTimeout(350);
      const o = await q.evaluate(() => {
        const a = document.querySelector('.gcp-actor'), m = document.querySelector('.gcp .gcp-actor.speaking [data-l="mouth"]'), c = document.querySelector('.gcp-cam'), b = document.querySelector('.gcp-bub.on');
        const sc = c && /scale\(([\d.]+)\)/.exec(c.style.transform);
        return { left: a ? a.style.left : '', mouth: m ? m.innerHTML : '', scale: sc ? +sc[1] : 1, bubble: !!b, tail: !!(b && b.querySelector('svg path, svg polygon, svg circle')), name: !!(b && b.querySelector('.nm')), audio: window.GenChibi.audio && window.GenChibi.audio.info().ctx };
      });
      if (o.left) seen.left.add(o.left); if (o.mouth) seen.mouth.add(o.mouth); seen.scale = Math.max(seen.scale, o.scale); seen.bubble += o.bubble; seen.tail += o.tail; seen.name += o.name; seen.audio = seen.audio || o.audio;
    }
    await q.click('button:has-text("Dừng")');
    if (seen.left.size < 3) throw new Error('phim sống: nhân vật không di chuyển (vị trí: ' + [...seen.left].join(' ') + ')');
    if (seen.mouth.size < 2) throw new Error('phim sống: miệng người nói không nhép');
    if (seen.scale < 1.3) throw new Error('phim sống: máy quay không cận vào người nói');
    if (!seen.bubble || !seen.tail || !seen.name) throw new Error('phim sống: bong bóng thiếu hình vẽ / đuôi / thẻ tên');
    if (!seen.audio) throw new Error('phim sống: âm thanh không được bật khi bấm diễn');
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Phim sống: nhân vật đi ra sân (' + seen.left.size + ' vị trí) · miệng nhép (' + seen.mouth.size + ' khẩu hình) · máy quay cận ×' + seen.scale.toFixed(2) + ' · bong bóng vẽ có đuôi + thẻ tên · âm thanh bật');
    // bộ chủ đề mẫu Tam Quốc: một chạm → Thư viện đủ bộ → gói bán trọn → Tạo tác sẵn sàng 6/6
    await q.goto('http://localhost:7494/'); await q.waitForSelector('.qsteps');
    await q.click('button:has-text("Mở bộ chủ đề mẫu")'); await q.waitForURL(/\/thu-vien$/, { timeout: 8000 }); await q.waitForSelector('.libcard.proj[title="mau-tam-quoc"]');
    const tqc = await q.textContent('.libcard.proj[title="mau-tam-quoc"]');
    if (!/7 nhân vật · 13 vật phẩm · 8 bối cảnh/.test(tqc)) throw new Error('bộ Tam Quốc: ' + tqc);
    await q.click('.libcard.proj[title="mau-tam-quoc"]'); await q.waitForSelector('text=Gói bán · bộ mẫu, không bán');
    if (await q.$('button:has-text("Gói bán ·")')) throw new Error('bộ mẫu Gen Labs không được có nút xuất gói bán');
    await q.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'tq-vuon-dao-xich-bich' })));
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('.readybar:not(.dubbar)');
    if (!/Sẵn sàng diễn cả 6 phân cảnh/.test(await q.textContent('.readybar'))) throw new Error('phim Tam Quốc chưa sẵn sàng: ' + await q.textContent('.readybar'));
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    // máy đã nhập bộ mẫu bản cũ (trước phân cảnh đấu): Thư viện mời cập nhật → nhập đè → đủ phân cảnh mới (CNS-036)
    await q.evaluate(async () => {
      const b = await fetch('studio/mau/tam-quoc.json').then(r => r.json());
      b.sample.version = 'cu'; b.works[0].shots = b.works[0].shots.filter(s => s.id !== 'canh-dau-tap');
      const r = await fetch('api/projects/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ bundle: b, overwrite: true }) });
      if (!r.ok) throw new Error('nhập bản cũ ' + r.status);
    });
    await q.evaluate(() => localStorage.setItem('gc-route-thu-vien', JSON.stringify({ page: 'projects', project: 'mau-tam-quoc' })));
    await q.goto('http://localhost:7494/thu-vien'); await q.waitForSelector('button:has-text("Cập nhật Tam Quốc")', { timeout: 6000 });
    // hộp xác nhận "Cập nhật…?": trang này đã tự chấp nhận mọi hộp thoại (q.on('dialog') ở trên)
    // nhập đè cả bộ (dựng thử gói động tác, kiểm luật âm) mất vài giây khi máy bận: chờ tới 20 s cho nút biến mất thay vì 0,8 s cố định
    const tUp = Date.now(); await q.click('button:has-text("⟳ Cập nhật Tam Quốc")'); await q.waitForURL(/\/thu-vien$/);
    await q.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => /⟳ Cập nhật Tam Quốc/.test(b.textContent)), null, { timeout: 20000 }).catch(() => {});
    if (await q.$('button:has-text("⟳ Cập nhật Tam Quốc")')) throw new Error('cập nhật xong vẫn còn mời cập nhật (sau ' + ((Date.now() - tUp) / 1000).toFixed(1) + ' s)');
    console.log('    (cập nhật bộ mẫu Tam Quốc xong sau ' + ((Date.now() - tUp) / 1000).toFixed(1) + ' s)');
    await q.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'tq-vuon-dao-xich-bich' })));
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('.readybar:not(.dubbar)');
    if (!/Sẵn sàng diễn cả 6 phân cảnh/.test(await q.textContent('.readybar'))) throw new Error('cập nhật bộ mẫu chưa có phân cảnh mới: ' + await q.textContent('.readybar'));
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Bộ mẫu cũ trên máy → nút "Cập nhật Tam Quốc" → nhập đè → đủ 6 phân cảnh (có màn đấu)');
    console.log('  ✓ Bộ chủ đề mẫu Tam Quốc một chạm: 7 tướng · 13 trang bị · 8 bối cảnh · dấu bộ mẫu Gen Labs (không xuất bán) → phim 6/6 phân cảnh sẵn sàng (có màn đấu)');
  } catch (e) { fail = 1; console.log('  ✗ dự án mẫu một chạm:', e.message); }
  try {
    // hồi quy (review v0.16 #1): phim HTML xuất từ tác phẩm có đòn của gói động tác phải mang theo gói đó (DATA.motionPacks) —
    // thiếu thì bộ phát không có đòn "combo / spin…", chương màn đấu bị loại (5/6) mà không báo lỗi
    errs.length = 0;
    await q.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'tq-vuon-dao-xich-bich' })));
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('#shot-canh-dau-tap');
    const [fdl] = await Promise.all([q.waitForEvent('download'), q.click('button:text-is("Phim (HTML)")')]);
    const fpath = path.join(home5, 'tam-quoc-phim.html'); await fdl.saveAs(fpath);
    const fhtml = require('fs').readFileSync(fpath, 'utf8'), fm = fhtml.match(/var DATA = (.*);\nvar FILM/);
    if (!fm) throw new Error('không tìm thấy DATA trong phim xuất ra');
    const FD = JSON.parse(fm[1]);
    if (!Array.isArray(FD.motionPacks) || !FD.motionPacks.some(x => x.id === 'tq-dong-tac' && x.actions && x.actions.combo)) throw new Error('DATA.motionPacks thiếu gói tq-dong-tac: ' + JSON.stringify(FD.motionPacks && FD.motionPacks.map(x => x.id)));
    // v0.18: gói âm của dự án đi theo phim (DATA.soundPacks + project) — mở file:// vẫn có âm Tam Quốc, bộ phát chọn đúng gói theo dự án
    if (!Array.isArray(FD.soundPacks) || FD.soundPacks.length !== 1 || FD.soundPacks[0].id !== 'tq-am' || FD.project !== 'mau-tam-quoc' || FD.soundPacks[0].sounds['trong-tran'].nodes !== undefined) throw new Error('DATA.soundPacks / project của phim: ' + JSON.stringify(FD.soundPacks && FD.soundPacks.map(x => x.id)) + ' / ' + FD.project);
    if (!/<script>\/\* engine\/sounds\.js \*\//.test(fhtml)) throw new Error('phim xuất ra thiếu engine/sounds.js');
    if (!/player\.setProject\(DATA\.project\)/.test(fhtml)) throw new Error('phim xuất ra không đặt dự án cho bộ phát (player.setProject)');
    // CNS-047: phim có gói động tác + gói âm của dự án — MCP export_film_html ra ĐÚNG từng byte tệp Studio vừa xuất
    { const r = await fetch('http://localhost:7494/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TEST_TOKEN }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'export_film_html', arguments: { work: 'tq-vuon-dao-xich-bich', lang: 'vi' } } }) }).then(x => x.json());
      const mt = r.result && !r.result.isError ? r.result.content[1].resource.text : '';
      if (mt !== fhtml) { let i = 0; while (i < fhtml.length && fhtml[i] === mt[i]) i++; throw new Error('MCP export_film_html (Tam Quốc) khác phim Studio tại ' + i + ': «' + fhtml.slice(Math.max(0, i - 60), i + 80) + '» ≠ «' + mt.slice(Math.max(0, i - 60), i + 80) + '»'); } }
    // Studio (Tạo tác) nạp gói âm của server lúc mở; lược đồ bảng bước theo dự án của dàn diễn viên; nhãn âm trong ô chọn lấy từ thư viện
    const sbr = await q.evaluate(() => ({ has: GenChibi.sounds.has('trong-tran'), n: GenChibi.sounds.names().length, lbl: GenChibi.sounds.get('wham').label,
      sch: GenChibi.director.schema(GenChibi.assets().filter(a => a.project === 'mau-tam-quoc')).properties.steps.items.properties.sfx.items.enum.length,
      sch0: GenChibi.director.schema([GenChibi.ASSETS['gen.khung/ma-no-canh']]).properties.steps.items.properties.sfx.items.enum.length }));
    if (!sbr.has || sbr.n !== 69 || sbr.sch !== 69 || sbr.sch0 !== 62 || !sbr.lbl) throw new Error('Studio chưa nạp gói âm / lược đồ theo dự án: ' + JSON.stringify(sbr));
    const ff = await b5.newPage({ viewport: { width: 1280, height: 900 } }), fe = [];
    ff.on('pageerror', e => fe.push(e.message)); ff.on('requestfailed', r => fe.push('mạng: ' + r.url()));
    await ff.goto('file://' + fpath); await ff.waitForTimeout(500);
    const fr = await ff.evaluate(async () => ({
      snd: { has: GenChibi.sounds.has('trong-tran'), n: GenChibi.sounds.names().length, plan: (p => ({ project: p.project, tu: p.beats.filter(b => b.type === 'line')[2].sfx }))(GenChibi.film.direct(FILM.shots.find(s => s.id === 'canh-1'), { project: DATA.project })),
        wav: (await GenChibi.audio.renderWav('trong-tran', { seed: 1 })).byteLength },
      chapters: document.querySelectorAll('#chapters li').length,
      missing: GenChibi.film.readiness(FILM).filter(x => !x.ok).map(x => x.shot.id + ': ' + x.missing.join('+')),
      warn: GenChibi.film.direct(FILM.shots.find(s => s.id === 'canh-dau-tap')).warnings
    }));
    // phát thật chương 1 từ phim xuất: lời thề (vow + hùng tráng) phải gọi tù và của gói Tam Quốc → bộ phát nhận đúng dự án + gói âm nhúng
    await ff.evaluate(() => { window.__sfx = []; const A = GenChibi.audio, o = A.sfx; A.sfx = function (n) { window.__sfx.push(n); return o.apply(A, arguments); }; });
    await ff.click('#chapters li:nth-child(1) button');
    await ff.waitForFunction(() => window.__sfx.includes('tu-va'), null, { timeout: 45000 });
    await ff.click('#stop');
    await ff.close();
    if (!fr.snd.has || fr.snd.n !== 69 || fr.snd.plan.project !== 'mau-tam-quoc' || !fr.snd.plan.tu.includes('tu-va') || fr.snd.wav < 100000) throw new Error('phim xuất ra: gói âm Tam Quốc ' + JSON.stringify(fr.snd));
    if (fr.chapters !== 6 || fr.missing.length || fr.warn.length) throw new Error('phim Tam Quốc xuất ra: ' + fr.chapters + '/6 chương, thiếu ' + JSON.stringify(fr.missing) + ', cảnh báo ' + JSON.stringify(fr.warn));
    if (fe.length) throw new Error('phim xuất ra lỗi: ' + fe.slice(0, 3).join(' | '));
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Phim HTML Tam Quốc: DATA.motionPacks có tq-dong-tac · DATA.soundPacks có tq-am + project → mở file:// phát lời thề gọi tù và của gói âm nhúng, renderWav chạy · đủ 6/6 chương, màn đấu không thiếu đòn');
  } catch (e) { fail = 1; console.log('  ✗ phim HTML Tam Quốc (gói động tác):', e.message); }
  try {
    // v0.16 (Q9, ADR 0006): BẢNG BƯỚC — soạn kịch bản không cần AI. Ô chọn sinh từ lược đồ đạo diễn; ô Hành động chỉ có đòn người của hàng
    // làm được (needs); lỗi hiện cạnh hàng; lưu qua đúng đường lưu phân cảnh (server kiểm lại) → tải lại trang vẫn còn
    try {
      errs.length = 0;
      await q.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'tq-vuon-dao-xich-bich' })));
      await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('#shot-canh-dau-tap');
      await q.click('#shot-canh-dau-tap button:text-is("Bảng bước")'); await q.waitForSelector('.sheet table.stepgrid');
      const nStep = await q.$$eval('.sheet tr[data-step]', e => e.length), nAct = await q.$$eval('.sheet select[data-cell$=":action"]', e => e.length);
      if (nStep !== 8 || nAct !== 8) throw new Error('"Đấu tập trước trận": ' + nStep + ' hàng, ' + nAct + ' ô action (cần 8)');
      // Gia Cát Lượng (quạt lông — tay không): thêm vào dàn + một bước của ông → ô action không có đòn binh khí
      await q.click('.sheet .fxchips button:text-is("Gia Cát Lượng")'); await q.click('.sheet button:text-is("+ Thêm bước")');
      await q.selectOption('.sheet select[data-cell="8:actor"]', 'tq-gia-cat-luong');
      const gcl = await q.$$eval('.sheet select[data-cell="8:action"] option', o => o.map(x => x.value));
      if (gcl.includes('weaponThrust') || gcl.includes('thrust') || gcl.includes('combo') || !gcl.includes('punch')) throw new Error('ô action của Gia Cát Lượng: ' + gcl.join(','));
      // lỗi sống ngay cạnh hàng: đổi người ra đòn binh khí sang người tay không → báo lỗi needs, khoá nút lưu
      await q.selectOption('.sheet select[data-cell="2:actor"]', 'tq-gia-cat-luong');
      const rowErr = await q.$$eval('.sheet tr.errrow:not([hidden])', e => e.map(x => x.textContent).join(' | '));
      if (!/không làm được "weaponThrust"/.test(rowErr) || !(await q.$eval('.sheet button:text-is("Lưu bước")', x => x.disabled))) throw new Error('không báo lỗi needs cạnh hàng / không khoá nút lưu: ' + rowErr);
      await q.selectOption('.sheet select[data-cell="2:actor"]', 'tq-trieu-van');
      await q.click('.sheet button[aria-label="Xoá bước 9"]'); await q.click('.sheet .fxchips button:text-is("Gia Cát Lượng")');
      // đổi đòn bước 3 (Triệu Vân cầm thương): weaponThrust (bộ mẫu ghi "thrust" — id cũ, server chuyển khi nhập, CNS-065) → sweep → lưu → tải lại trang → vẫn là sweep
      await q.selectOption('.sheet select[data-cell="2:action"]', 'sweep');
      await q.click('.sheet button:text-is("Lưu bước")');
      await q.waitForFunction(() => /Đã lưu/.test(document.querySelector('.sheet .pad > .row.note').textContent), null, { timeout: 5000 });
      await q.reload(); await q.waitForSelector('#shot-canh-dau-tap');
      await q.click('#shot-canh-dau-tap button:text-is("Bảng bước")'); await q.waitForSelector('.sheet table.stepgrid');
      const a3 = await q.$eval('.sheet select[data-cell="2:action"]', s => s.value), n2 = await q.$$eval('.sheet tr[data-step]', e => e.length);
      if (a3 !== 'sweep' || n2 !== 8) throw new Error('sau khi lưu + tải lại: bước 3 = "' + a3 + '", ' + n2 + ' bước');
      await q.keyboard.press('Escape');
      if (await q.$('.sheet')) throw new Error('Esc không đóng bảng bước');
      if (!/Sẵn sàng diễn cả 6 phân cảnh/.test(await q.textContent('.readybar'))) throw new Error('sau khi sửa đòn: ' + await q.textContent('.readybar'));
      if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
      console.log('  ✓ Bảng bước (không cần AI): 8 bước "Đấu tập"; ô action lọc theo người làm được (Gia Cát Lượng tay không: không có weaponThrust); lỗi needs cạnh hàng; đổi đòn → lưu qua cổng → tải lại còn');
    } catch (e) { fail = 1; console.log('  ✗ bảng bước:', e.message); }
    // Bảng bước — độ bền khi dùng thật (review v0.16): nền / kéo bôi chữ, cảnh báo đạo diễn không tính lại mỗi phím,
    // tiêu điểm bàn phím, chặn đóng nhầm khi còn chữ chưa lưu, và đua giữa "đang lưu" với "sửa tiếp"
    try {
      errs.length = 0;
      const route = () => q.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'tq-vuon-dao-xich-bich' })));
      const fresh = async () => {   // trang mới + bảng bước mở sẵn; window.confirm do test điều khiển (ghi câu hỏi, trả lời theo window.__ans)
        await route(); await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('#shot-canh-dau-tap');
        await q.evaluate(() => { window.__asked = []; window.__ans = false; window.confirm = m => { window.__asked.push(m); return window.__ans; }; });
        await q.click('#shot-canh-dau-tap button:text-is("Bảng bước")'); await q.waitForSelector('.sheet table.stepgrid');
      };
      const active = () => q.evaluate(() => { const a = document.activeElement; return a ? { cell: a.getAttribute('data-cell'), chip: a.getAttribute('data-chip'), pressed: a.getAttribute('aria-pressed'), inSheet: !!a.closest('.sheet-back') } : null; });
      const chipText = () => q.$$eval('.sheet .pad > .row.note .chip', e => e.map(x => x.textContent).join('|'));
      // (1) kéo bôi chữ trong ô rồi nhả chuột ra nền KHÔNG đóng bảng; bấm thẳng vào nền thì đóng (bảng sạch)
      await fresh();
      const bb = await q.$eval('.sheet input[data-cell="0:say"]', e => { const r = e.getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; });
      await q.mouse.move(bb.x, bb.y); await q.mouse.down(); await q.mouse.move(6, bb.y, { steps: 6 }); await q.mouse.up(); await q.waitForTimeout(150);
      if (!(await q.$('.sheet'))) throw new Error('kéo bôi chữ rồi nhả ra nền làm đóng bảng bước');
      await q.mouse.click(6, 450); await q.waitForTimeout(150);
      if (await q.$('.sheet')) throw new Error('bấm vào nền không đóng bảng bước');
      // (2) cảnh báo đạo diễn: tính lại khi CẤU TRÚC đổi, không tính lại và không nháy khi gõ lời thoại
      await q.evaluate(() => { const F = GenChibi.film, o = F.direct; window.__direct = 0; F.direct = function () { window.__direct++; const p = o.apply(this, arguments); p.warnings = (p.warnings || []).concat(['CẢNH-BÁO-THỬ']); return p; }; });
      await q.click('#shot-canh-dau-tap button:text-is("Bảng bước")'); await q.waitForSelector('.sheet table.stepgrid');
      await q.waitForSelector('.sheet .note.warn', { timeout: 3000 });
      const d0 = await q.evaluate(() => window.__direct);
      await q.fill('.sheet input[data-cell="0:say"]', 'gõ dở một'); await q.keyboard.type(' hai ba');
      if (!(await q.$('.sheet .note.warn'))) throw new Error('gõ lời thoại làm khung cảnh báo bị xoá (nháy)');
      await q.waitForTimeout(800);
      if ((await q.evaluate(() => window.__direct)) !== d0) throw new Error('gõ lời thoại làm tính lại cảnh báo đạo diễn (direct gọi lại)');
      const a2 = await q.$eval('.sheet select[data-cell="2:action"]', x => x.value);
      await q.selectOption('.sheet select[data-cell="2:action"]', a2 === 'weaponThrust' ? 'sweep' : 'weaponThrust');
      await q.waitForFunction(n => window.__direct > n, d0, { timeout: 3000 });
      // (3) tiêu điểm: chip hiệu ứng giữ tiêu điểm sau khi bật / tắt; xoá hàng thì tiêu điểm sang hàng kế (hết thì hàng trước)
      await q.click('.sheet button[data-cell="0:more"]');
      await q.click('.sheet .moregrid .fxchips button >> nth=0');
      let fa = await active();
      if (!fa || !/^0:fx:/.test(fa.chip || '') || fa.pressed !== 'true') throw new Error('chip fx mất tiêu điểm sau khi bật: ' + JSON.stringify(fa));
      await q.keyboard.press('Space'); fa = await active();
      if (!fa || !/^0:fx:/.test(fa.chip || '') || fa.pressed !== 'false') throw new Error('chip fx mất tiêu điểm sau khi tắt (bàn phím): ' + JSON.stringify(fa));
      await q.click('.sheet button[aria-label="Xoá bước 3"]'); fa = await active();
      if (!fa || fa.cell !== '2:say') throw new Error('xoá hàng giữa: tiêu điểm phải sang ô lời thoại hàng kế (2:say), đang ở ' + JSON.stringify(fa));
      const nRows = await q.$$eval('.sheet tr[data-step]', e => e.length);
      await q.click('.sheet button[aria-label="Xoá bước ' + nRows + '"]'); fa = await active();
      if (!fa || fa.cell !== (nRows - 2) + ':say') throw new Error('xoá hàng cuối: tiêu điểm phải về hàng trước, đang ở ' + JSON.stringify(fa));
      // (4) bảng đang sửa dở (bẩn): chặn đóng tab (beforeunload), Esc hỏi lại, Esc của bộ gõ (isComposing) không đóng, Tab xoay vòng trong bảng
      const unload = () => q.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
      if (!(await unload())) throw new Error('bảng bước còn thay đổi chưa lưu mà beforeunload không chặn');
      await q.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })));
      if (!(await q.$('.sheet')) || (await q.evaluate(() => window.__asked.length))) throw new Error('Esc đang gõ dở bộ gõ (isComposing) vẫn đóng / hỏi');
      await q.focus('.sheet h3 button >> nth=0'); await q.keyboard.press('Shift+Tab');
      if (!(await active() || {}).inSheet) throw new Error('Shift+Tab ở nút đầu bảng làm tiêu điểm thoát ra ngoài hộp thoại');
      await q.keyboard.press('Escape');
      if (!(await q.$('.sheet')) || !/chưa lưu/.test((await q.evaluate(() => window.__asked))[0] || '')) throw new Error('Esc khi còn thay đổi chưa lưu phải hỏi và (trả lời không) giữ bảng mở: ' + JSON.stringify(await q.evaluate(() => window.__asked)));
      await q.evaluate(() => { window.__ans = true; }); await q.click('.sheet button:text-is("Đóng")');
      if (await q.$('.sheet')) throw new Error('trả lời đồng ý mà bảng vẫn không đóng');
      if (await unload()) throw new Error('đã đóng bảng mà beforeunload vẫn chặn (chưa gỡ)');
      // (5) đua lưu: sửa tiếp trong lúc yêu cầu lưu còn bay → nút Lưu khoá (không gửi đôi), lưu xong vẫn "Chưa lưu", Esc vẫn hỏi, không mất chữ mới
      await fresh();
      const say0 = await q.$eval('.sheet input[data-cell="0:say"]', x => x.value);
      let release; const gate = new Promise(r => { release = r; }); let posts = 0;
      await q.route('**/api/works/*/shots', async rt => { if (rt.request().method() === 'POST') posts++; await gate; await rt.continue(); });
      await q.fill('.sheet input[data-cell="0:say"]', say0 + ' [lưu-1]');
      await q.click('.sheet button:text-is("Lưu bước")');
      const saveBtn = () => q.$eval('.sheet h3 .btn.primary', x => ({ off: x.disabled, text: x.textContent }));
      let sb = await saveBtn();
      if (!sb.off) throw new Error('đang lưu mà nút Lưu chưa khoá: ' + JSON.stringify(sb));
      await q.fill('.sheet input[data-cell="1:say"]', 'SỬA-TRONG-LÚC-LƯU');
      sb = await saveBtn();
      if (!sb.off) throw new Error('sửa trong lúc lưu làm nút Lưu bật lại (gửi đôi): ' + JSON.stringify(sb));
      release();
      await q.waitForFunction(() => document.querySelector('.sheet h3 .btn.primary').textContent === 'Lưu bước', null, { timeout: 5000 });
      await q.unroute('**/api/works/*/shots');
      if (posts !== 1) throw new Error('gửi lưu ' + posts + ' lần (cần đúng 1)');
      const ch = await chipText();
      if (/Đã lưu/.test(ch) || !/Chưa lưu/.test(ch)) throw new Error('sửa trong lúc lưu mà chip báo đã lưu (mất chữ âm thầm): ' + ch);
      await q.keyboard.press('Escape');
      if (!(await q.$('.sheet')) || !/chưa lưu/.test((await q.evaluate(() => window.__asked))[0] || '')) throw new Error('Esc sau khi lưu dở phải hỏi trước khi bỏ chữ mới');
      const sw = await q.evaluate(() => fetch('api/works/tq-vuon-dao-xich-bich', { headers: { 'X-GC-Request': '1' } }).then(r => r.json()));
      const st = sw.shots.find(x => x.id === 'canh-dau-tap').event.steps;
      if (st[0].say !== say0 + ' [lưu-1]' || st[1].say === 'SỬA-TRONG-LÚC-LƯU') throw new Error('server giữ sai bản: bước 1 "' + st[0].say + '", bước 2 "' + st[1].say + '"');
      await q.click('.sheet button:text-is("Lưu bước")');   // lưu lại phần sửa thêm → mới "Đã lưu"
      await q.waitForFunction(() => /Đã lưu/.test(document.querySelector('.sheet .pad > .row.note').textContent), null, { timeout: 5000 });
      await q.keyboard.press('Escape');
      if (await q.$('.sheet') || (await q.evaluate(() => window.__asked.length)) !== 1) throw new Error('bảng sạch: Esc phải đóng ngay, không hỏi thêm');
      if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
      console.log('  ✓ Bảng bước bền: kéo bôi chữ ra nền không đóng · cảnh báo đạo diễn không tính lại khi gõ (có khi đổi đòn) · tiêu điểm giữ ở chip / sang hàng kế khi xoá · Esc / đóng tab hỏi khi chưa lưu · sửa trong lúc lưu không bị coi là đã lưu');
    } catch (e) { fail = 1; console.log('  ✗ bảng bước (độ bền):', e.message); }
    // v0.16 (Q9): THƯ VIỆN › ĐỘNG TÁC — đòn khung + gói động tác; xem trước chạy thật; tải PNG sprite sheet / GIF / JSON timeline;
    // nhân vật không làm được đòn (needs) thì báo vì sao, không dựng; nhập gói hỏng → hiện lỗi 422, gói đúng → có nhóm mới
    try {
      errs.length = 0;
      await q.evaluate(() => localStorage.setItem('gc-route-thu-vien', JSON.stringify({ page: 'lib-motions' })));
      await q.goto('http://localhost:7494/thu-vien'); await q.waitForSelector('.libcard.act');
      const nFrame = await q.$$eval('[data-pack="gen.dong-tac"] .libcard.act', e => e.length), nTq = await q.$$eval('[data-pack="local.my/tq-dong-tac"] .libcard.act', e => e.length);
      if (nFrame < 16 || nTq < 1) throw new Error('danh sách: ' + nFrame + ' đòn khung, ' + nTq + ' đòn của gói tq-dong-tac');
      // CNS-065: số đếm Thư viện › Động tác không tính đòn của khung (như Nhân vật / Vật phẩm / Bối cảnh không tính đồ của khung); id cũ không thành thẻ riêng
      const navN = await q.evaluate(() => { const b = document.querySelector('.nav-item[aria-current="page"] .n'), C = GenChibi.choreo; return { n: b ? +b.textContent : -1, packs: Object.keys(C.ACTIONS).filter(k => C.ACTIONS[k].pack !== C.FRAME_PACK).length, old: ['thrust', 'rage', 'victory', 'salute', 'wave'].filter(k => document.querySelector('.libcard.act[data-action="' + k + '"]')) }; });
      if (navN.n !== navN.packs || navN.old.length) throw new Error('CNS-065: số đếm Thư viện › Động tác = ' + navN.n + ' (cần ' + navN.packs + ' đòn của gói, không tính ' + nFrame + ' đòn khung); thẻ id cũ: ' + navN.old.join(','));
      // Gia Cát Lượng (tay không) chọn đòn ai cũng làm được → rồi đổi sang đòn binh khí: báo vì sao + không dựng; trong ô chọn người, ai không làm được thì mờ kèm lý do
      await q.click('.libcard.act[data-action="punch"]');
      await q.selectOption('.sticky select[aria-label="Nhân vật"]', 'local.my/tq-gia-cat-luong');
      await q.click('.libcard.act[data-action="weaponThrust"]');
      if (!/không làm được/.test(await q.textContent('.sticky .banner.bad')) || await q.$('.mstage')) throw new Error('người tay không chọn đòn binh khí: phải báo vì sao và không dựng');
      const opts = await q.$$eval('.sticky select[aria-label="Nhân vật"] option', os => os.map(o => ({ v: o.value, off: o.disabled, t: o.textContent })));
      const oG = opts.find(o => o.v === 'local.my/tq-gia-cat-luong'), oT = opts.find(o => o.v === 'local.my/tq-trieu-van');
      if (!oG || !oG.off || !/cần binh khí/.test(oG.t) || !oT || oT.off) throw new Error('ô chọn người ra đòn "weaponThrust": Gia Cát Lượng phải mờ + "cần binh khí", Triệu Vân chọn được: ' + JSON.stringify([oG, oT]));
      await q.selectOption('.sticky select[aria-label="Nhân vật"]', 'local.my/tq-trieu-van');
      const fr = new Set(); for (let k = 0; k < 10; k++) { await q.waitForTimeout(120); fr.add(await q.getAttribute('.mstage', 'data-frame')); }
      if (fr.size < 3) throw new Error('xem trước không chạy (khung: ' + [...fr].join(',') + ')');
      const grab = async label => { const [d] = await Promise.all([q.waitForEvent('download'), q.click('.sticky .usebar button:text-is("' + label + '")')]); return { name: d.suggestedFilename(), buf: require('fs').readFileSync(await d.path()) }; };
      const png = await grab('PNG sprite sheet'), gif = await grab('GIF'), js = await grab('JSON');
      if (png.name !== 'tq-trieu-van-weaponThrust-12fps.png' || png.buf.length < 1024 || png.buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG sprite sheet: ' + png.name + ' ' + png.buf.length + ' B');
      if (gif.buf.slice(0, 6).toString() !== 'GIF89a' || gif.buf.length < 1024) throw new Error('GIF: ' + gif.name + ' ' + gif.buf.length + ' B');
      const meta = JSON.parse(js.buf.toString());
      if (meta.format !== 'gen-chibi.anim/1' || meta.frames.length !== meta.frameCount) throw new Error('JSON timeline: ' + JSON.stringify(meta).slice(0, 160));
      // nhân vật của bộ mẫu Gen Labs: giấy phép là điều khoản bộ mẫu, KHÔNG phải "thuộc người tạo"; gói của bộ mẫu tải về mang dấu sample
      if (meta.license.indexOf('Bộ mẫu Gen Labs — xem, thử, làm phim; được đăng và kiếm tiền từ phim / video làm từ bộ mẫu kèm dòng ghi công "Made with gen-chibi · Gen Labs"; không bán lại, không phân phối lại nhân vật hay asset của bộ mẫu, không dùng làm logo / thương hiệu') < 0 || /thuộc người tạo/.test(meta.license) || !meta.sample || meta.sample.owner !== 'Gen Labs') throw new Error('giấy phép JSON của nhân vật bộ mẫu: ' + JSON.stringify([meta.license, meta.sample]));
      const [tqp] = await Promise.all([q.waitForEvent('download'), q.click('[data-pack="local.my/tq-dong-tac"] button:text-is("Tải gói (.json)")')]);
      const tqj = JSON.parse(require('fs').readFileSync(await tqp.path(), 'utf8'));
      if (!tqj.sample || tqj.sample.owner !== 'Gen Labs' || !/không bán lại/.test(tqj.sample.license) || tqj.key) throw new Error('tải gói bộ mẫu thiếu dấu sample: ' + JSON.stringify(tqj.sample));
      // đòn của khung với nhân vật của khung (không thuộc bộ mẫu nào): giữ câu cũ
      await q.click('.libcard.act[data-action="waveHello"]'); await q.selectOption('.sticky select[aria-label="Nhân vật"]', 'gen.khung/ma-no-canh');
      const wv = JSON.parse((await grab('JSON')).buf.toString());
      if (/Bộ mẫu/.test(wv.license) || wv.sample) throw new Error('nhân vật của khung bị ghi nhầm giấy phép bộ mẫu: ' + wv.license);
      await q.click('.libcard.act[data-action="weaponThrust"]'); await q.selectOption('.sticky select[aria-label="Nhân vật"]', 'local.my/tq-trieu-van');
      // đòn dài: engine tự hạ fps cho đủ cả đòn (anim.fps < fps đã chọn) → Studio nói rõ, GIF / JSON / tên tệp theo fps thật; cắt cụt thì cảnh báo.
      // (giả lập engine trả về fps đã hạ + cờ truncated để kiểm phần hiển thị của Studio — phần tính fps của engine do bài test engine kiểm)
      await q.evaluate(() => { const C = GenChibi.choreo, o = C.animate; window.__animate0 = o; C.animate = function (tl, op) { const a = o.call(C, tl, { fps: Math.min(op.fps, 8) }); a.meta.requestedFps = op.fps; if (op.fps >= 24) a.meta.truncated = true; return a; }; });
      await q.click('.sticky .seg button:text-is("24 fps")');
      const fnote = await q.textContent('.sticky [data-note="fps"]');
      if (!/tự hạ còn 8 fps/.test(fnote) || !/24/.test(fnote)) throw new Error('thiếu ghi chú tự hạ fps: ' + fnote);
      if (!/bị cắt/.test(await q.textContent('.sticky [data-note="truncated"]'))) throw new Error('đòn bị cắt cụt mà không cảnh báo');
      const g8 = await grab('GIF'), j8 = await grab('JSON'), m8 = JSON.parse(j8.buf.toString());
      const dl8 = []; for (let i = 0; i < g8.buf.length - 6; i++) if (g8.buf[i] === 0x21 && g8.buf[i + 1] === 0xF9 && g8.buf[i + 2] === 4) dl8.push(g8.buf.readUInt16LE(i + 4));
      if (g8.name !== 'tq-trieu-van-weaponThrust-8fps.gif' || m8.fps !== 8 || dl8.length !== m8.frameCount || dl8[0] < 12 || dl8[0] > 13) throw new Error('GIF / JSON phải theo fps thật (8): ' + JSON.stringify([g8.name, m8.fps, dl8.slice(0, 3), dl8.length, m8.frameCount]));
      await q.evaluate(() => { GenChibi.choreo.animate = window.__animate0; });
      await q.click('.sticky .seg button:text-is("12 fps")');
      if (await q.$('.sticky [data-note]')) throw new Error('đòn vừa khung mà vẫn hiện ghi chú / cảnh báo fps');
      // GIF giải mã được thật bằng bộ giải mã của trình duyệt: đủ khung, lặp vô hạn
      const dec = await q.evaluate(async b64 => {
        if (!('ImageDecoder' in window)) return null;
        const d = new ImageDecoder({ data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)), type: 'image/gif' }); await d.tracks.ready; await d.completed;
        return { n: d.tracks.selectedTrack.frameCount, rep: d.tracks.selectedTrack.repetitionCount };
      }, gif.buf.toString('base64'));
      const gce = gif.buf.toString('latin1').split('\x21\xF9\x04').length - 1;
      if (dec ? (dec.n !== meta.frameCount || dec.rep !== Infinity) : gce !== meta.frameCount) throw new Error('GIF ' + (dec ? dec.n + ' khung, lặp ' + dec.rep : gce + ' khối khung') + ' ≠ ' + meta.frameCount + ' khung');
      // nhập gói động tác: hỏng → lỗi 422 hiện rõ; đúng → thêm nhóm, tải lại được
      const pf = (n, o) => { const f = path.join(home5, n); require('fs').writeFileSync(f, JSON.stringify(o)); return f; };
      const imp = async f => { const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.click('button:text-is("Nhập gói động tác (.json)")')]); await fc.setFiles(f); };
      await imp(pf('hong.json', { id: 'ci-hong', name: 'Hỏng', actions: { zap: { label: 'Zap', clips: ['khongCo'] } } }));
      await q.waitForSelector('.motions .banner.bad');
      if (!/khongCo/.test(await q.textContent('.motions .banner.bad'))) throw new Error('gói hỏng: không hiện lỗi 422 chi tiết');
      // gói nhập về thuộc dự án chọn ở ô "Nhập vào dự án" (mặc định dự án vừa dùng, TRỪ dự án mẫu); "Chưa xếp dự án" thì là gói chung
      await q.evaluate(async () => {
        const r = await fetch('api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ id: 'ci-du-an', name: 'Dự án CI' }) });
        if (!r.ok) throw new Error('không tạo được dự án: ' + r.status);
        localStorage.setItem('gc-last-project', 'mau-tam-quoc');
      });
      await q.reload(); await q.waitForSelector('.libcard.act');
      const PICK = '#actions select[aria-label="Dự án chủ đề"]';
      if ((await q.inputValue(PICK)) !== '') throw new Error('ô "Nhập vào dự án" không được mặc định là dự án MẪU (gói tự làm sẽ mang dấu mẫu): ' + await q.inputValue(PICK));
      await imp(pf('dung.json', { id: 'ci-chao', name: 'Chào CI', actions: { ciBow: { label: 'Chào rồi vẫy', clips: ['salute', 'wave'] } } }));
      await q.waitForSelector('[data-pack="local.my/ci-chao"] .libcard.act[data-action="ciBow"]', { timeout: 5000 });
      await q.selectOption(PICK, '');
      await imp(pf('chung.json', { id: 'ci-chung', name: 'Chung CI', actions: { ciNod: { label: 'Gật đầu chào', clips: ['wave', 'salute'] } } }));
      await q.waitForSelector('[data-pack="local.my/ci-chung"] .libcard.act[data-action="ciNod"]', { timeout: 5000 });
      await q.selectOption(PICK, 'ci-du-an');
      await imp(pf('khac.json', { id: 'ci-khac', name: 'Khác CI', actions: { ciOther: { label: 'Chào dự án khác', clips: ['salute', 'wave'] } } }));
      await q.waitForSelector('[data-pack="local.my/ci-khac"] .libcard.act[data-action="ciOther"]', { timeout: 5000 });
      const pj = await q.evaluate(() => fetch('api/motion-packs', { headers: { 'X-GC-Request': '1' } }).then(r => r.json()).then(l => Object.fromEntries(l.map(x => [x.id, x.project || '']))));
      if (pj['ci-chao'] !== '' || pj['ci-chung'] !== '' || pj['ci-khac'] !== 'ci-du-an') throw new Error('dự án của gói nhập: ' + JSON.stringify(pj));
      if (!/Dự án · Dự án CI/.test(await q.textContent('[data-pack="local.my/ci-khac"] .packmeta')) || !/Chưa xếp dự án/.test(await q.textContent('[data-pack="local.my/ci-chung"] .packmeta'))) throw new Error('nhãn dự án của gói nhập sai');
      // gói nhập dùng được trong Bảng bước: gói của dự án đúng dàn diễn viên + gói chung có mặt; gói của dự án khác thì không
      await q.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'tq-vuon-dao-xich-bich' })));
      await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('#shot-canh-dau-tap');
      await q.click('#shot-canh-dau-tap button:text-is("Bảng bước")'); await q.waitForSelector('.sheet table.stepgrid');
      const sheetActs = await q.$$eval('.sheet select[data-cell="0:action"] option', o => o.map(x => x.value));
      if (!sheetActs.includes('ciBow') || !sheetActs.includes('ciNod') || sheetActs.includes('ciOther')) throw new Error('Bảng bước thiếu / thừa đòn của gói nhập: ' + sheetActs.join(','));
      await q.keyboard.press('Escape');
      await q.evaluate(() => localStorage.setItem('gc-route-thu-vien', JSON.stringify({ page: 'lib-motions' })));
      await q.goto('http://localhost:7494/thu-vien'); await q.waitForSelector('.libcard.act');
      const [pk] = await Promise.all([q.waitForEvent('download'), q.click('[data-pack="local.my/ci-chao"] button:text-is("Tải gói (.json)")')]);
      const pkj = JSON.parse(require('fs').readFileSync(await pk.path(), 'utf8'));
      if (pkj.id !== 'ci-chao' || !pkj.actions.ciBow || pkj.key) throw new Error('tải gói: ' + JSON.stringify(pkj).slice(0, 120));
      if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
      console.log('  ✓ Thư viện › Động tác: ' + nFrame + ' đòn khung + gói tq-dong-tac · báo rõ người tay không · xem trước chạy · tải PNG sprite sheet, GIF ' + meta.frameCount + ' khung (giải mã được, lặp vô hạn), JSON gen-chibi.anim/1 · ô chọn người ra đòn mờ người không làm được · fps tự hạ + cảnh báo cắt cụt, GIF / JSON theo fps thật · giấy phép bộ mẫu trong JSON / gói tải về · nhập gói: 422 hiện lỗi, gói vào đúng dự án (hoặc gói chung) và dùng được trong Bảng bước');
    } catch (e) { fail = 1; console.log('  ✗ Thư viện › Động tác:', e.message); }
  } finally { await b5.close(); srv5.kill(); }
}
// Bảng bước › Thêm… › Âm thanh (CNS-104 / CNS-109 d): chip lấy NHÃN tiếng Việt từ thư viện âm; danh sách âm theo dự án của TÁC PHẨM chứ không theo dàn diễn viên —
// phim Tam Quốc có trống trận; phim của dự án KHÁC dùng cùng nhân vật Tam Quốc thì không được mời âm Tam Quốc (từng mời rồi bị luật S6 từ chối lúc lưu)
if (want('core')) {
  const home5s = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv5s = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home5s, GC_PORT: '7573', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await up(7573);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  const b5s = await pw.chromium.launch(), q = await b5s.newPage({ viewport: { width: 1440, height: 900 } }), errs = [];
  q.on('pageerror', e => errs.push(e.message));
  try {
    try {
      const post = async (u, body) => { const r = await fetch('http://localhost:7573' + u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gc-request': '1' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(u + ' → ' + r.status + ' ' + (await r.text()).slice(0, 120)); return r.json(); };
      await post('/api/projects/import', { bundle: JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8')) });
      await post('/api/projects', { id: 'cua-toi', name: 'Của tôi' }); await post('/api/works', { id: 'phim-toi', title: 'Phim của tôi', project: 'cua-toi' });
      await post('/api/works/phim-toi/shots', { shot: { id: 'c1', title: 'C1', scene: 'gen.khung/san-khau-chuan', cast: ['local.my/tq-quan-vu'] } });
      const chipsOf = async (work, shot) => {
        await q.goto('http://localhost:7573/tao-tac'); await q.evaluate(w => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: w })), work);
        await q.goto('http://localhost:7573/tao-tac'); await q.waitForSelector('#shot-' + shot);
        await q.click('#shot-' + shot + ' button:text-is("Bảng bước")'); await q.waitForSelector('.sheet table.stepgrid');
        await q.click('.sheet button[data-cell="0:more"]');
        const r = await q.$$eval('.sheet button[data-chip^="0:sfx:"]', bs => bs.map(b => [b.getAttribute('data-chip').split(':')[2], b.textContent]));
        await q.keyboard.press('Escape'); return Object.fromEntries(r);
      };
      const tq = await chipsOf('tq-vuon-dao-xich-bich', 'canh-dau-tap'), mine = await chipsOf('phim-toi', 'c1');
      const lab = await q.evaluate(ns => ns.map(n => (window.GenChibi.sounds.get(n) || {}).label), ['trong-tran', 'bonk']);
      if (Object.keys(tq).length !== 69 || !lab[0] || tq['trong-tran'] !== lab[0] || tq['bonk'] !== lab[1] || lab[1] === 'bonk') throw new Error('phim Tam Quốc: ' + Object.keys(tq).length + ' chip, trống trận = "' + tq['trong-tran'] + '" (nhãn thư viện "' + lab[0] + '")');
      if ('trong-tran' in mine || !('bonk' in mine) || Object.keys(mine).length !== 62) throw new Error('phim của dự án khác (dàn Tam Quốc) vẫn được mời âm Tam Quốc: ' + Object.keys(mine).length + ' chip, trong-tran: ' + ('trong-tran' in mine));
      if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
      console.log('  ✓ Bảng bước › Âm thanh: 69 chip nhãn tiếng Việt từ thư viện (phim Tam Quốc có trống trận) · phim của dự án khác dùng dàn Tam Quốc chỉ có 62 âm khung — dự án của TÁC PHẨM quyết');
    } catch (e) { fail = 1; console.log('  ✗ Bảng bước › Âm thanh:', e.message); }
  } finally { await b5s.close(); srv5s.kill(); }
}
// Biên đạo liên hoàn: trang "Tử Long 30 giây" xuất bằng tools/choreo-demo.js chạy độc lập (file://), không lỗi, phát thật,
// khung vẽ rẻ (≤ 8 ms), nhân vật đổi góc nhìn + nét mặt khi diễn, tua được, âm thanh bật khi bấm xem
if (want('core')) {
  const out = path.join(home, 'choreo.html');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/choreo-demo.js'), 'tuLong30s', out], { stdio: 'ignore' });
  const b6 = await pw.chromium.launch(), q = await b6.newPage({ viewport: { width: 1280, height: 900 } }), errs = [];
  q.on('pageerror', e => errs.push(e.message)); q.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await q.goto('file://' + out); await q.waitForSelector('.gcc-stage');
    if (await q.$$eval('#chap li', l => l.length) !== 29) throw new Error('danh sách hành vi phải đủ 29');
    await q.click('#big');
    const seen = new Set(), sigs = new Set();
    for (let i = 0; i < 12; i++) {
      await q.waitForTimeout(250);
      const o = await q.evaluate(() => ({ now: document.getElementById('now').textContent, eyes: ((document.querySelector('.gcc-actors') || {}).innerHTML || '').length }));
      seen.add(o.now); sigs.add(o.eyes);
    }
    const t = await q.evaluate(() => parseFloat(document.getElementById('time').textContent.replace(',', '.')));
    if (t < 2) throw new Error('trình phát không chạy (' + t + ' s)');
    if (seen.size < 2 || sigs.size < 3) throw new Error('nhân vật không đổi hành vi / bản vẽ khi diễn');
    const cost = await q.evaluate(() => { const s = document.getElementById('seek'), t0 = performance.now(); for (let i = 0; i < 40; i++) { s.value = (i * 0.75).toFixed(2); s.oninput(); } return (performance.now() - t0) / 40; });
    if (cost > 8) throw new Error('một khung vẽ tốn ' + cost.toFixed(1) + ' ms (ngân sách 8 ms)');
    await q.evaluate(() => { const s = document.getElementById('seek'); s.value = 14.4; s.oninput(); });
    // nhãn #now cập nhật ở khung vẽ kế tiếp (rAF), không đồng bộ với oninput — chờ tới 2 s thay vì đọc ngay (đọc ngay = đỏ chập chờn khi máy bận)
    await q.waitForFunction(() => /Bổ thương/.test(document.getElementById('now').textContent), null, { timeout: 2000 }).catch(() => {});
    if (!/Bổ thương/.test(await q.textContent('#now'))) throw new Error('tua tới 14,4 s phải là "Bổ thương xuống đất": ' + await q.textContent('#now'));
    const audio = await q.evaluate(() => window.GenChibi.audio && window.GenChibi.audio.info().ctx);
    if (!audio) throw new Error('âm thanh không bật khi bấm xem');
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Biên đạo Tử Long 30 giây: trang độc lập chạy · 29 hành vi · đổi bản vẽ khi diễn · khung vẽ ' + cost.toFixed(1) + ' ms · tua đúng hành vi · âm thanh bật');
  } catch (e) { fail = 1; console.log('  ✗ biên đạo liên hoàn:', e.message); }
  finally { await b6.close(); }
}
// Biên đạo trong phim (v0.15): phân cảnh "Đấu tập trước trận" của phim Tam Quốc diễn được thật — diễn viên lướt / văng,
// hiệu ứng va chạm có chữ tượng thanh, người xem giật mình, xong màn đấu thì thôi điều khiển và dọn lớp hiệu ứng
if (want('core')) {
  const R = (f) => 'file://' + path.join(ROOT, f), B = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8'));
  const shot = B.works[0].shots.find(s => s.id === 'canh-dau-tap');
  const page = path.join(home, 'duel.html');
  require('fs').writeFileSync(page, '<!doctype html><meta charset=utf-8><body style="margin:0"><div id=st style="width:960px"></div><div id=pg></div>' +
    SCRIPTS.engine.map(f => '<script src="' + R(f) + '"></script>').join('') +   // đúng danh sách + thứ tự của Studio (engine/scripts.json, CNS-054)
    '<script>var B=' + JSON.stringify({ parts: B.parts, items: B.items, scenes: B.scenes, characters: B.characters, motionPacks: B.motionPacks || [] }) + ',SHOT=' + JSON.stringify(shot) + ';var GC=window.GenChibi;' +
    'GC.pack({id:"local.my",name:"x",owner:"x",group:"mine",license:"x"},function(){});B.parts.forEach(function(p){GC.registerDataPart("local.my",p)});B.items.forEach(function(x){GC.registerItem("local.my",x)});' +
    'B.scenes.forEach(function(x){GC.registerScene("local.my",x)});B.characters.forEach(function(a){GC.registerAsset("local.my",a)});' +
    // gói động tác của bộ (combo, leap…) — như phim xuất ra; thiếu gói thì Sẵn sàng (v0.16) báo đòn thiếu và không diễn
    'B.motionPacks.forEach(function(m){var r=GC.choreo.registerPack("local.my",m);if(r.errors.length)throw new Error(r.errors.join("; "))});' +
    'window.P=GC.film.player(document.getElementById("st"),{onProgress:function(t){document.getElementById("pg").textContent=t}});P.show(SHOT);</script>');
  const b7 = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] }), q = await b7.newPage({ viewport: { width: 1000, height: 700 } }), errs = [];
  q.on('pageerror', e => errs.push(e.message)); q.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await q.goto('file://' + page); await q.waitForSelector('.gcp-actor');
    await q.evaluate(() => { GC.audio && GC.audio.setVoiceMode('blip'); P.play([SHOT], 'Thử'); });
    const seen = { words: new Set(), xs: new Set(), acts: new Set(), jolt: 0 }; const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      await q.waitForTimeout(110);
      const o = await q.evaluate(() => ({ pg: document.getElementById('pg').textContent, fx: Array.from(document.querySelectorAll('.gcp-fx text')).map(t => t.textContent).join(' '),
        x: Array.from(document.querySelectorAll('.gcp-actor')).map(e => Math.round(parseFloat(e.style.left))).join(','), done: !document.querySelector('.gcp-actor') }));
      o.fx.split(' ').filter(Boolean).forEach(w => seen.words.add(w)); seen.xs.add(o.x);
      if (/Đâm|Liên hoàn|Tung|Ôm quyền/.test(o.pg)) seen.acts.add(o.pg.split('· ').pop());
      if (seen.acts.size >= 4 && !/Đâm|Liên hoàn|Tung|Ôm quyền/.test(o.pg) && !(await q.$('.gcp-fx'))) break;
    }
    if (seen.acts.size < 4) throw new Error('chưa thấy đủ 4 màn hành động: ' + [...seen.acts].join(' | '));
    if (!['VÚT!', 'XOẸT!', 'RẦM!'].some(w => seen.words.has(w))) throw new Error('không thấy chữ va chạm: ' + [...seen.words].join(' '));
    if (seen.xs.size < 12) throw new Error('diễn viên gần như không di chuyển khi đấu (' + seen.xs.size + ' vị trí)');
    if (await q.$('.gcp-fx')) throw new Error('xong màn đấu mà lớp hiệu ứng chưa dọn');
    // bấm dừng GIỮA màn đấu: lớp hiệu ứng / màu phủ phải dọn, diễn viên thôi bị điều khiển (review v0.15 #4)
    await q.evaluate(() => { P.stop(); P.play([SHOT], 'Thử lại'); });
    await q.waitForFunction(() => /Đâm|Liên hoàn|Tung/.test(document.getElementById('pg').textContent), null, { timeout: 30000 });
    await q.waitForTimeout(500);
    await q.evaluate(() => P.stop()); await q.waitForTimeout(400);
    const left = await q.evaluate(() => ({ fx: document.querySelectorAll('.gcp-fx').length, driven: Array.from(document.querySelectorAll('.gcp-actor svg.gc-full')).filter(s => s.__gc && s.__gc.driver).length }));
    if (left.fx || left.driven) throw new Error('dừng giữa màn đấu còn sót ' + left.fx + ' lớp hiệu ứng, ' + left.driven + ' diễn viên bị điều khiển');
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Biên đạo trong phim: "Đấu tập trước trận" diễn ' + seen.acts.size + ' màn (' + [...seen.acts].join(', ') + ') · chữ va chạm ' + [...seen.words].join(' ') + ' · ' + seen.xs.size + ' thế đứng · dọn lớp hiệu ứng');
  } catch (e) { fail = 1; console.log('  ✗ biên đạo trong phim:', e.message); }
  finally { await b7.close(); }
}
// Lời thoại chuyên nghiệp (v0.17, Track A). Ryan: "bong bóng chat che vào nhân vật và cách trình bày không chuyên nghiệp".
// Diễn THẬT hai phim mẫu (Tam Quốc có các cảnh cận, Văn phòng vui) trong trình duyệt và ĐO từng câu thoại: hình chữ nhật của bong bóng
// (không đuôi) so với hình chữ nhật của ĐẦU mọi diễn viên (hợp getBoundingClientRect các lớp mặt / tai / tóc mái / mũ ĐANG vẽ — không dùng số liệu
// của chính bộ giải), đo hai lần cách nhau 1 s vì nhân vật vẫn cử động. Mỗi rào đã thử ngược: tắt bộ giải → test đỏ.
// CNS-099: máy chậm / bảy trang song song thì khung hình chạy SAU đồng hồ hẹn giờ — bong bóng phải mở khi sân khấu ĐÃ đứng yên trên màn hình và hiện đủ lâu tính từ lúc thật sự hiện.
if (want('bubble')) {
  const fs = require('fs');
  const home9 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv9 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home9, GC_PORT: '7495', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await up(7495);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  const b9 = await pw.chromium.launch();
  const URL9 = 'http://localhost:7495/';
  // ---- thư viện đo chạy TRONG trang (một bản duy nhất cho mọi lượt) ----
  const LT = String.raw`(() => {
    const FACE = ['ears', 'head', 'mask', 'shade', 'cheeks', 'eyes', 'brows', 'mouth', 'mustache', 'hairFront', 'hat'];
    const ST = () => document.getElementById('__st');
    const rgb = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const Lm = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const over = (c, bg) => ({ r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a), a: 1 });
    const cr = (a, b) => { const x = Lm(a), y = Lm(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const ov = (a, c) => Math.max(0, Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0)) * Math.max(0, Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0));
    function segHit(ax, ay, bx, by, r) { let t0 = 0, t1 = 1; const d = [bx - ax, by - ay], p = [-d[0], d[0], -d[1], d[1]], q = [ax - r.x0, r.x1 - ax, ay - r.y0, r.y1 - ay];
      for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return false; continue; } const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } } return true; }
    function measure(el) {
      const st = ST(), fr = st.getBoundingClientRect();
      if (!el || !el.isConnected || !el.classList.contains('on')) return null;
      const rel = r => ({ x0: r.left - fr.left, y0: r.top - fr.top, x1: r.right - fr.left, y1: r.bottom - fr.top });
      const heads = [...st.querySelectorAll('.gcp-actor')].map(a => {
        let u = null;
        FACE.forEach(n => { const g = a.querySelector('svg.gc-full g[data-l="' + n + '"]'); if (!g || !g.firstChild) return; const r = g.getBoundingClientRect(); if (!r.width && !r.height) return;
          u = u ? { left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
        return { id: a.title, full: !!a.querySelector('svg.gc-full'), rect: u && rel(u) };
      });
      const W = fr.width, H = fr.height, b = rel(el.getBoundingClientRect()), vis = heads.filter(h => h.rect && h.rect.x1 > 0 && h.rect.x0 < W && h.rect.y1 > 0 && h.rect.y0 < H);
      const cap = el.classList.contains('gcp-cap'), tx = el.querySelector('.tx'), cs = getComputedStyle(el), who = el.querySelector('.nm').textContent;
      const bg = cap ? over(rgb(cs.backgroundColor), { r: 255, g: 255, b: 255, a: 1 }) : { r: 255, g: 253, b: 248, a: 1 };   // phụ đề: xét trường hợp xấu nhất (nền sáng dưới dải mờ)
      // từ chưa đọc / đã đọc: dựng bản sao rồi bỏ / thêm lớp "on" → đo màu thật (không phụ thuộc giọng đọc đang tới đâu)
      const probe = el.cloneNode(true); probe.style.visibility = 'hidden'; el.parentNode.appendChild(probe);
      const pw_ = [...probe.querySelectorAll('.w')]; pw_.forEach(w => w.classList.remove('on', 'cur'));
      const unread = pw_.map(w => ({ c: rgb(getComputedStyle(w).color), o: +getComputedStyle(w).opacity }));
      pw_.forEach(w => w.classList.add('on'));
      const read = pw_.map(w => ({ c: rgb(getComputedStyle(w).color), o: +getComputedStyle(w).opacity }));
      probe.remove();
      const nm = getComputedStyle(el.querySelector('.nm')), fam = getComputedStyle(tx), tail = (el.dataset.tail || '').split(',').map(Number);
      const spk = heads.find(h => h.id === who), others = vis.filter(h => h.id !== who);
      let tailCross = 0, tailInCore = 0;
      if (!cap && tail.length === 4 && spk && spk.rect) {
        others.forEach(h => { if (segHit(tail[0], tail[1], tail[2], tail[3], h.rect)) tailCross++; });
        const r = spk.rect, cw = (r.x1 - r.x0) * 0.2, ch = (r.y1 - r.y0) * 0.2;   // lõi mặt = khung đầu thu 20% mỗi phía: đầu đuôi phải nằm NGOÀI
        if (tail[2] > r.x0 + cw && tail[2] < r.x1 - cw && tail[3] > r.y0 + ch && tail[3] < r.y1 - ch) tailInCore++;
      }
      return {
        mode: cap ? 'caption' : 'bubble', clean: el.dataset.clean, tag: el.dataset.tag, kind: [...el.classList].filter(c => !/^gcp|^on$/.test(c)).join(' '), text: tx.textContent.slice(0, 30),
        W, H, rect: b, widthFrac: (b.x1 - b.x0) / W, ms: parseFloat(el.dataset.ms || '0'),
        overlaps: vis.map(h => ({ id: h.id, px2: Math.round(ov(b, h.rect)) })).filter(o => o.px2 > 0), visibleHeads: vis.length, fullTier: heads.every(h => h.full),
        margin: Math.min(b.x0 / W, (W - b.x1) / W, b.y0 / H, (H - b.y1) / H),
        minOpacity: Math.min(...unread.map(w => w.o), ...read.map(w => w.o), +cs.opacity), opParts: [Math.min(...unread.map(w => w.o)), Math.min(...read.map(w => w.o)), +cs.opacity],
        contrast: Math.min(...unread.map(w => cr(w.c, bg)), ...read.map(w => cr(w.c, bg))),
        chipContrast: cr(rgb(nm.color), rgb(nm.backgroundColor)), chipPx: parseFloat(nm.fontSize),
        font: fam.fontFamily, weight: fam.fontWeight, px: parseFloat(fam.fontSize), faces: [...document.fonts].filter(f => f.family.replace(/["']/g, '') === 'Be Vietnam Pro').map(f => f.weight + ':' + f.status),
        tail: cap ? null : tail, tailCross, tailInCore, svgPath: !cap && !!el.querySelector('svg path')
      };
    }
    window.__lt = {
      async setup(work, W, dialog) {
        const GC = window.GenChibi, w = await fetch('api/works/' + work).then(r => r.json());
        if (GC.audio) GC.audio.setVoiceMode('blip');
        let st = ST(); if (st) st.remove();
        st = document.createElement('div'); st.id = '__st'; st.style.cssText = 'position:fixed;left:20px;top:20px;width:' + W + 'px;z-index:99999;background:#000';
        document.body.appendChild(st);
        window.__orig = GC.film.solveLayout; window.__calls = 0;
        GC.film.solveLayout = function (c) { window.__calls++; return window.__orig(c); };
        window.__W = w; window.__P = GC.film.player(st, dialog ? { dialog } : {});
        return w.shots.map(s => s.id);
      },
      mutate(src) { window.__orig2 = GenChibi.film.solveLayout; const f = eval(src); GenChibi.film.solveLayout = function (c) { window.__calls++; return f(c); }; },
      restore() { GenChibi.film.solveLayout = function (c) { window.__calls++; return window.__orig(c); }; },
      start(sid, cost) {
        const st = ST(); window.__seq = 0; window.__res = {}; window.__life = {}; window.__pend = 0; window.__prog = ''; window.__calls = 0; window.__xcalls = 0;
        if (window.__mo) window.__mo.disconnect();
        window.__mo = new MutationObserver(() => {
          // bong bóng tắt (bỏ lớp "on"): ghi giờ → thời gian hiện THẬT trên màn hình
          st.querySelectorAll('.gcp-bub[data-seq]:not(.on),.gcp-cap[data-seq]:not(.on)').forEach(e => { const L = window.__life[e.dataset.seq]; if (L && !L.off) L.off = performance.now(); });
          st.querySelectorAll('.gcp-bub.on,.gcp-cap.on').forEach(e => {
          if (e.dataset.seq) return;
          const n = e.dataset.seq = String(++window.__seq); window.__res[n] = [];
          // lúc bong bóng mở, sân khấu phải ĐỨNG YÊN trên màn hình: không còn chuyển tiếp nào của diễn viên (đi / bước tới / lùi) hay máy quay đang chạy.
          // Bố cục tính theo chỗ đích; hình còn đang đi thì bong bóng đè đầu (máy chậm: chuyển tiếp CSS chạy sau đồng hồ hẹn giờ của bộ phát)
          const moving = [...st.querySelectorAll('.gcp-actor'), st.querySelector('.gcp-cam')].filter(Boolean).flatMap(x => x.getAnimations().filter(a => isFinite(a.effect.getComputedTiming().endTime))
            .map(a => (x.title || 'máy quay') + ' ' + (a.transitionProperty || a.animationName) + ' ' + Math.round(a.currentTime) + '/' + a.effect.getTiming().duration + ' ms'));
          window.__life[n] = { on: performance.now(), off: 0, moving };
          // đo sau 0,35 s và 0,95 s kể từ lúc bong bóng hiện; kết thúc ngay chuyển tiếp vào của CHÍNH bong bóng (mờ → rõ, nảy) để đo trạng thái cuối — khung hình tới trễ thì nó còn treo ở đầu.
          // Máy quay / diễn viên KHÔNG được kết thúc hộ: họ phải tự đứng yên trước khi bong bóng mở (rào "moving" ở trên)
          [350, 950].forEach(ms => { window.__pend++; setTimeout(() => {
            if (e.isConnected) e.getAnimations().forEach(a => { try { a.finish(); } catch (_) { /* hoạt hình vô hạn: bỏ qua */ } });
            const m = measure(e);
            // chi phí bố cục (lượt đo riêng): giải lại "cost" lần đúng câu này (setDialog → bố cục đầy đủ: đo khung xương, cỡ chữ, bộ giải), lấy NHỎ NHẤT. Giờ treo tường của một mẫu
            // trên máy dùng chung còn gồm lúc hệ điều hành cho tiến trình khác chạy (CNS-099: một mẫu 44,8 ms khi tải 3–6); nhỏ nhất = chi phí thật, ngưỡng giữ nguyên
            if (m && cost && ms === 350) { const c0 = window.__calls; m.costs = [m.ms]; for (let k = 0; k < cost; k++) { window.__P.setDialog(window.__P.dialog()); m.costs.push(parseFloat(e.dataset.ms)); } window.__xcalls += window.__calls - c0; }
            if (m) window.__res[n].push(m); window.__pend--; }, ms); });
          });
        });
        window.__mo.observe(st, { attributes: true, subtree: true, attributeFilter: ['class'] });
        window.__P.play([window.__W.shots.find(s => s.id === sid)], 'T');
      },
      progress() { return GenChibi && document.querySelector('#__st') ? { pend: window.__pend, seq: window.__seq, card: !!document.querySelector('#__st .gcp-title b') && /^T$/.test(document.querySelector('#__st .gcp-title b').textContent) } : null; },
      result() { return { res: window.__res, life: window.__life, calls: window.__calls - window.__xcalls }; }
    };
  })();`;
  // chạy một phân cảnh tới hết, trả các lần đo của từng câu
  const playShot = async (page, sid, cost) => {
    await page.evaluate(([sid, cost]) => window.__lt.start(sid, cost), [sid, cost || 0]);
    const t0 = Date.now(); let ended = 0;
    while (Date.now() - t0 < 150000) {
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => window.__lt.progress());
      if (s && s.card && !s.pend && s.seq) { if (++ended > 2) break; } else ended = 0;
    }
    await page.evaluate(() => window.__P.stop());
    const r = await page.evaluate(() => window.__lt.result());
    return { lines: Object.keys(r.res).sort((a, c) => a - c).map(k => { const L = r.life[k] || {}; return { shot: sid, idx: +k, ms: r.res[k], moving: L.moving || [], life: L.off ? Math.round(L.off - L.on) : null }; }), calls: r.calls };
  };
  const mkPage = async (opts, work, W, dialog) => {
    const q = await b9.newPage(opts || { viewport: { width: 1320, height: 780 } }), errs = []; q.on('pageerror', e => errs.push(e.message));
    if (+process.env.GC_THROTTLE > 1) await (await q.context().newCDPSession(q)).send('Emulation.setCPUThrottlingRate', { rate: +process.env.GC_THROTTLE });   // giả lập máy yếu (tái hiện CNS-099)
    await q.goto(URL9 + 'tao-tac'); await q.waitForFunction(() => window.GenChibi && window.GenChibi.film && /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
    await q.waitForTimeout(500);
    await q.evaluate(LT);
    const shots = await q.evaluate(([w, W, d]) => window.__lt.setup(w, W, d), [work, W, dialog || null]);
    q.errs = errs; q.shots = shots; return q;
  };
  // luật kiểm một câu thoại (dùng cho mọi lượt); trả danh sách lỗi
  const judge = (L, o) => {
    const bad = [];
    L.ms.forEach((m, k) => {
      const tag = L.shot + '#' + L.idx + (k ? 'b' : 'a') + ' "' + m.text + '"';
      if (m.overlaps.length) bad.push(tag + ': ' + m.mode + ' ĐÈ ĐẦU ' + JSON.stringify(m.overlaps));
      if (!m.text.trim()) bad.push(tag + ': bong bóng rỗng (bước im — không lời — không được mở bong bóng)');
      if (m.margin < 0.02) bad.push(tag + ': ra ngoài vùng an toàn (lề ' + (m.margin * 100).toFixed(1) + '%)');
      if (m.minOpacity < 0.85) bad.push(tag + ': chữ mờ (opacity ' + m.minOpacity.toFixed(2) + ' ← chưa đọc / đã đọc / cả khối: ' + m.opParts.map(v => v.toFixed(2)).join(' / ') + ')');
      if (m.contrast < 4.5) bad.push(tag + ': tương phản chữ ' + m.contrast.toFixed(2) + ' < 4,5');
      if (m.chipContrast < 4.5 || m.chipPx < 10) bad.push(tag + ': thẻ tên tương phản ' + m.chipContrast.toFixed(2) + ' / chữ ' + m.chipPx + 'px');
      if (!/^"?Be Vietnam Pro"?/.test(m.font)) bad.push(tag + ': phông không phải Be Vietnam Pro: ' + m.font);
      if (!m.faces.includes(m.weight + ':loaded')) bad.push(tag + ': phông ' + m.weight + ' chưa nạp (' + m.faces.join(' ') + ')');
      if (m.px < 13) bad.push(tag + ': cỡ chữ ' + m.px + 'px < 13');
      if (m.mode === 'bubble' && m.widthFrac > 0.385) bad.push(tag + ': bong bóng rộng ' + (m.widthFrac * 100).toFixed(0) + '% > 38%');
      if (m.mode === 'bubble' && !m.svgPath) bad.push(tag + ': bong bóng không có hình vẽ');
      if (m.tailCross) bad.push(tag + ': đuôi cắt ngang đầu người khác');
      if (m.tailInCore) bad.push(tag + ': đầu đuôi đâm vào lõi mặt người nói');
      if (!m.fullTier) bad.push(tag + ': diễn viên không ở tầng diễn đủ (ngân sách) — số đo không đáng tin');
      // (chi phí bố cục KHÔNG xét ở đây: bảy trang chạy song song nên giờ treo tường vô nghĩa — đo riêng ở lượt cô lập bên dưới)
      if (o && o.mode && m.mode !== o.mode) bad.push(tag + ': chế độ ' + m.mode + ' ≠ ' + o.mode);
    });
    if (!L.ms.length) bad.push(L.shot + '#' + L.idx + ': không đo được (bong bóng biến mất sớm?)');
    if (L.moving.length) bad.push(L.shot + '#' + L.idx + ': bong bóng mở khi sân khấu chưa đứng yên (' + L.moving.slice(0, 3).join(' · ') + ')');
    if (L.life != null && L.life < 380) bad.push(L.shot + '#' + L.idx + ': bong bóng chỉ hiện ' + L.life + ' ms trên màn hình (< 380 ms giữ khung tối thiểu)');
    return bad;
  };
  const errsAll = [];
  try {
    // ---- 0) tệp phông + giấy phép + sổ tài sản ----
    const fsz = fs.statSync(path.join(ROOT, 'engine/fonts.js')).size, ofl = fs.readFileSync(path.join(ROOT, 'engine/fonts/OFL-BeVietnamPro.txt'), 'utf8'), man = fs.readFileSync(path.join(ROOT, 'ASSET_MANIFEST.md'), 'utf8'), fj = fs.readFileSync(path.join(ROOT, 'engine/fonts.js'), 'utf8');
    if (fsz > 120 * 1024) throw new Error('engine/fonts.js ' + Math.round(fsz / 1024) + ' KB > 120 KB');
    if (!/SIL OPEN FONT LICENSE Version 1\.1/.test(ofl) || !/Be Vietnam Pro Project Authors/.test(ofl)) throw new Error('thiếu giấy phép OFL của Be Vietnam Pro');
    if (!/SIL OPEN FONT LICENSE Version 1\.1/.test(fj) || (fj.match(/\[(500|700|800), "d09GMg/g) || []).length !== 3) throw new Error('engine/fonts.js thiếu toàn văn OFL hoặc không đủ 3 độ đậm');
    if (!/Be Vietnam Pro/.test(man) || !/OFL/.test(man) || !/github\.com\/google\/fonts/.test(man)) throw new Error('ASSET_MANIFEST.md chưa ghi phông Be Vietnam Pro + OFL + nguồn');
    // ---- nhập hai bộ mẫu ----
    const boot = await b9.newPage(); await boot.goto(URL9 + 'tao-tac'); await boot.waitForFunction(() => window.GenChibi && /^v\d/.test((document.getElementById('verChip') || {}).textContent));
    await boot.evaluate(async () => { for (const f of ['tam-quoc', 'van-phong-vui', 'fun-office']) {
      const bn = await fetch('studio/mau/' + f + '.json').then(r => r.json());
      const r = await fetch('api/projects/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ bundle: bn, overwrite: true }) });
      if (!r.ok) throw new Error('nhập ' + f + ' ' + r.status);
    } });
    await boot.close();
    const TQ = 'tq-vuon-dao-xich-bich', VP = 'mau-ngay-dau-di-lam', FO = 'fo-first-day';
    // ---- 1) bộ giải thuần số: chạy với hình chữ nhật giả (nhanh, xác định) ----
    const up = await b9.newPage(); await up.goto(URL9 + 'tao-tac'); await up.waitForFunction(() => window.GenChibi && window.GenChibi.film && window.GenChibi.film.solveLayout);
    const unit = await up.evaluate(() => {
      const S = window.GenChibi.film.solveLayout, bad = [], H = (id, x0, y0, x1, y1) => ({ id, x0, y0, x1, y1 });
      const base = { W: 1280, H: 720, m: 32, who: 'a', mouth: { x: 640, y: 330 }, bodies: [], sizes: [{ w: 480, h: 110 }, { w: 360, h: 140 }, { w: 260, h: 190 }], prev: null };
      const inside = (r, c) => r.x0 >= c.m - 1e-6 && r.y0 >= c.m - 1e-6 && r.x1 <= c.W - c.m + 1e-6 && r.y1 <= c.H - c.m + 1e-6;
      const hit = (r, h) => Math.min(r.x1, h.x1) > Math.max(r.x0, h.x0) && Math.min(r.y1, h.y1) > Math.max(r.y0, h.y0);
      // a) khung trống: bong bóng trên đầu, đuôi dừng NGOÀI elip của đầu (cách mặt một đoạn)
      const head = H('a', 560, 220, 720, 400), r1 = S({ ...base, kind: 'bubble', heads: [head] });
      if (!r1 || !r1.clean || r1.y1 > head.y0) bad.push('khung trống: phải đặt trên đầu và sạch ' + JSON.stringify(r1 && [r1.tag, r1.clean, r1.y1]));
      else { const cx = 640, cy = 310, a = 80, b = 90, T = r1.tail; if (T.len < 8 || Math.pow((T.tx - cx) / a, 2) + Math.pow((T.ty - cy) / b, 2) <= 1) bad.push('đuôi không dừng cách mặt: ' + JSON.stringify(T)); }
      // b) chật: đầu người nói sát mép trên, hai người khác hai bên → phải tìm chỗ sạch, đuôi không cắt đầu họ
      const crowd = [H('a', 540, 10, 740, 420), H('b', 0, 40, 380, 500), H('c', 900, 40, 1280, 500)], r2 = S({ ...base, kind: 'bubble', mouth: { x: 640, y: 330 }, heads: crowd });
      if (!r2 || (r2.clean && crowd.some(h => hit(r2, h)))) bad.push('chật: bong bóng đè đầu ' + JSON.stringify(r2));
      if (r2 && r2.clean && !inside(r2, base)) bad.push('chật: ra ngoài vùng an toàn');
      // c) đuôi cắt ngang đầu người khác: người nói sát mép trái, một bức "tường đầu" cao kín khung ngay bên phải; chỗ duy nhất đủ rộng cho bong bóng là bên kia tường,
      //    gần đủ để không bị loại vì quá xa → đuôi sẽ xuyên qua tường. Phải báo KHÔNG sạch (tắt luật này thì bộ giải sẽ báo sạch).
      const r3 = S({ ...base, kind: 'bubble', mouth: { x: 75, y: 400 }, sizes: [{ w: 260, h: 110 }], heads: [H('a', 20, 300, 130, 500), H('b', 150, 0, 210, 720)] });
      if (!r3 || r3.clean) bad.push('đuôi xuyên đầu người khác mà vẫn báo sạch ' + JSON.stringify(r3 && [r3.tag, r3.x0, r3.clean]));
      // d) hết chỗ: bốn đầu phủ kín khung → báo KHÔNG sạch (bộ phát chuyển sang phụ đề)
      const full = [H('a', 0, 0, 640, 360), H('b', 640, 0, 1280, 360), H('c', 0, 360, 640, 720), H('d', 640, 360, 1280, 720)], r4 = S({ ...base, kind: 'bubble', heads: full });
      if (!r4 || r4.clean) bad.push('hết chỗ mà vẫn báo sạch');
      // e) phụ đề: dải dưới, không đè đầu, trong vùng an toàn; đầu chiếm dải dưới thì lùi lên / né sang bên
      const r5 = S({ ...base, kind: 'caption', sizes: [{ w: 900, h: 60 }, { w: 600, h: 90 }], heads: [H('a', 500, 150, 780, 450)] });
      if (!r5 || !r5.clean || r5.y0 < 450 || !inside(r5, base)) bad.push('phụ đề: phải ở dải dưới, sạch, trong lề ' + JSON.stringify(r5 && [r5.tag, r5.y0]));
      const r6 = S({ ...base, kind: 'caption', sizes: [{ w: 900, h: 60 }, { w: 520, h: 90 }], heads: [H('a', 300, 200, 700, 690)] });
      if (!r6 || !r6.clean || hit(r6, H('a', 300, 200, 700, 690))) bad.push('phụ đề: đầu thấp phải né sang bên ' + JSON.stringify(r6 && [r6.tag, r6.x0, r6.y0]));
      // f) ổn định: cùng người nói liên tiếp, chỗ cũ còn sạch → giữ chỗ cũ
      const heads7 = [H('a', 560, 220, 720, 400)], first = S({ ...base, kind: 'bubble', heads: heads7 }), again = S({ ...base, kind: 'bubble', heads: heads7, prev: { id: 'a', cx: (first.x0 + first.x1) / 2 + 10, cy: (first.y0 + first.y1) / 2 } });
      if (Math.abs(again.x0 - first.x0) > 40 || Math.abs(again.y0 - first.y0) > 40) bad.push('không ổn định: nhảy ' + JSON.stringify([first.x0, first.y0, again.x0, again.y0]));
      // g) màu thẻ tên: mọi màu nhân vật đều ra tương phản ≥ 4,5 với chữ trắng
      const F = window.GenChibi.film;
      ['#f0f0f0', '#ffd700', '#c0392b', '#27ae60', '#4a5563', '#000000', '#ffffff', '#ff00ff'].forEach(c => { const k = F.chipColor(c); if (F.contrast(k, '#ffffff') < 4.5) bad.push('thẻ tên ' + c + ' → ' + k + ' tương phản ' + F.contrast(k, '#ffffff').toFixed(2)); });
      return bad;
    });
    await up.close();
    if (unit.length) throw new Error('bộ giải: ' + unit.join(' | '));
    console.log('  ✓ Bộ giải bố cục lời thoại (hình chữ nhật giả): trên đầu khi trống · né mọi đầu khi chật · đuôi dừng ngoài elip đầu, không cắt đầu người khác · hết chỗ → báo không sạch · phụ đề dải dưới · giữ chỗ cũ · thẻ tên ≥ 4,5:1');
    // ---- 2) diễn thật: hai phim mẫu (tự động), phụ đề ép buộc ở cảnh cận, khung 640, và THỬ NGƯỢC (bộ giải hỏng) — chạy song song ----
    const MUTANT = `(c) => { const S = c.heads.find(h => h.id === c.who) || { x0: c.mouth.x - 50, x1: c.mouth.x + 50, y0: c.mouth.y - 100, y1: c.mouth.y }, s = c.sizes[0], cx = (S.x0 + S.x1) / 2,
      x = Math.max(c.m, Math.min(c.W - c.m - s.w, cx - s.w / 2)), y = Math.max(0.04 * c.H, Math.min(0.6 * c.H, S.y0 - 0.05 * c.H - s.h));
      return { x0: x, y0: y, x1: x + s.w, y1: y + s.h, w: s.w, h: s.h, si: 0, tail: { px: cx, py: y + s.h, tx: cx, ty: y + s.h + 0.05 * c.H, len: 0.05 * c.H }, hard: 0, soft: 0, tag: 'lỗi-cố-ý', clean: true }; }`;   // hành vi CŨ: đặt trên đỉnh đầu người nói, không biết ai khác
    const job = async (fn) => { try { return await fn(); } catch (e) { return { err: e }; } };
    // khung hình tới trễ (máy yếu / bận: đo được rAF đứng 0,7–3 s trong khi hẹn giờ vẫn chạy): mọi khung trễ 0,9 s — câu vẫn phải mở khi sân khấu đứng yên và hiện đủ lâu
    const SLOW_FRAMES = () => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(() => setTimeout(() => raf(cb), 900)); };
    const [rTQ, rVP, rCap, rBub, r640, r360, rMut, rSlow] = await Promise.all([
      job(async () => { const q = await mkPage(null, TQ, 1280); const out = []; let calls = 0; for (const s of q.shots) { const r = await playShot(q, s); out.push(...r.lines); calls += r.calls; } await q.close(); return { lines: out, calls, errs: q.errs }; }),
      job(async () => { const q = await mkPage(null, VP, 1280); const out = []; let calls = 0; for (const s of q.shots) { const r = await playShot(q, s); out.push(...r.lines); calls += r.calls; } await q.close(); return { lines: out, calls, errs: q.errs }; }),
      job(async () => { const q = await mkPage(null, TQ, 1280, 'caption'); const r = await playShot(q, 'canh-dau-tap'); await q.close(); return { lines: r.lines, errs: q.errs }; }),
      job(async () => { const q = await mkPage(null, TQ, 1280, 'bubble'); const r = await playShot(q, 'canh-1'); await q.close(); return { lines: r.lines, errs: q.errs }; }),
      job(async () => { const q = await mkPage({ viewport: { width: 700, height: 420 } }, TQ, 640); const r = await playShot(q, 'canh-dau-tap'); await q.close(); return { lines: r.lines, errs: q.errs }; }),
      job(async () => { const q = await mkPage({ viewport: { width: 480, height: 300 } }, TQ, 420); const r = await playShot(q, 'canh-dau-tap'); await q.close(); return { lines: r.lines, errs: q.errs }; }),   // khung nhỏ: bong bóng 38% thành quá bé → tự động chuyển phụ đề
      job(async () => {
        const q = await mkPage(null, TQ, 1280); await q.evaluate(src => window.__lt.mutate(src), MUTANT);
        const a = await playShot(q, 'canh-dau-tap'), c = await playShot(q, 'canh-1');   // cảnh cận: bong bóng "trên đầu" CHẮC CHẮN đè mặt
        await q.evaluate(() => window.__lt.restore());
        const back = await playShot(q, 'canh-dau-tap'); await q.close();
        return { mut: a.lines.concat(c.lines), back: back.lines, errs: q.errs };
      }),
      job(async () => { const q = await mkPage(null, VP, 1280); await q.evaluate(SLOW_FRAMES); const r = await playShot(q, 'canh-2'); await q.close(); return { lines: r.lines, errs: q.errs }; })
    ]);
    // Q23: bản tiếng Anh (Fun Office) — câu tiếng Anh dài hơn câu Việt vẫn phải vừa bong bóng / phụ đề sạch như bản Việt (chạy sau lượt song song: giữ ≤ 8 trang cùng lúc)
    const rFO = await job(async () => { const q = await mkPage(null, FO, 1280); const out = []; let calls = 0; for (const s of q.shots) { const r = await playShot(q, s); out.push(...r.lines); calls += r.calls; } await q.close(); return { lines: out, calls, errs: q.errs }; });
    for (const r of [rTQ, rVP, rCap, rBub, r640, r360, rMut, rSlow, rFO]) if (r.err) throw r.err;
    [rTQ, rVP, rCap, rBub, r640, r360, rMut, rSlow, rFO].forEach(r => errsAll.push(...r.errs));
    // Tam Quốc + Văn phòng vui, chế độ tự động: mọi câu sạch
    const film = [...rTQ.lines, ...rVP.lines, ...rFO.lines];
    if (film.length < 55 || rFO.lines.length < 15) throw new Error('chỉ đo được ' + film.length + ' câu thoại, Fun Office ' + rFO.lines.length + ' (cần ≥ 55: Tam Quốc 31 + Văn phòng vui 15 + Fun Office 15)');
    const badFilm = film.flatMap(L => judge(L));
    if (badFilm.length) throw new Error(badFilm.length + ' lỗi trình bày, ví dụ: ' + badFilm.slice(0, 4).join(' | '));
    const nB = film.filter(L => L.ms[0].mode === 'bubble').length, nC = film.length - nB;
    const calls = (rTQ.calls + rVP.calls + rFO.calls) / film.length;
    if (calls > 3) throw new Error('bố cục chạy ' + calls.toFixed(1) + ' lần mỗi câu (> 3) — nghi tính lại theo khung hình');
    const tqClose = rTQ.lines.filter(L => L.shot === 'canh-dau-tap').length;
    if (tqClose < 5) throw new Error('thiếu câu thoại ở cảnh cận "Đấu tập trước trận" (' + tqClose + ')');
    console.log('  ✓ Lời thoại ba phim mẫu (Fun Office tiếng Anh, ' + film.length + ' câu, đo 2 lần mỗi câu): bong bóng ' + nB + ' · phụ đề ' + nC + ' · mở khi sân khấu đứng yên, hiện ≥ 380 ms, không bong bóng rỗng · đè đầu 0 px² · trong lề an toàn ≥ 2% · chữ ≥ 85% đậm & tương phản ≥ 4,5:1 · bong bóng ≤ 38% khung · đuôi không cắt đầu / không đâm lõi mặt · Be Vietnam Pro đã nạp · bố cục ' + calls.toFixed(1) + ' lần/câu');
    // phụ đề ép buộc: cũng không đè đầu, trong lề
    const badCap = rCap.lines.flatMap(L => judge(L, { mode: 'caption' }));
    if (badCap.length || rCap.lines.length < 5) throw new Error('phụ đề ép buộc: ' + (badCap.slice(0, 3).join(' | ') || 'chỉ ' + rCap.lines.length + ' câu'));
    const low = rCap.lines.filter(L => (L.ms[0].rect.y0 + L.ms[0].rect.y1) / 2 > L.ms[0].H * 0.5).length;
    if (low < rCap.lines.length - 1) throw new Error('phụ đề phải nằm dải dưới: chỉ ' + low + '/' + rCap.lines.length + ' câu');
    const badBub = rBub.lines.flatMap(L => judge(L, { mode: 'bubble' }));
    if (badBub.length || rBub.lines.length < 4) throw new Error('chế độ bong bóng: ' + (badBub.slice(0, 3).join(' | ') || 'chỉ ' + rBub.lines.length + ' câu'));
    const bad640 = r640.lines.flatMap(L => judge(L));
    if (bad640.length || r640.lines.length < 5) throw new Error('khung 640 px: ' + (bad640.slice(0, 3).join(' | ') || 'chỉ ' + r640.lines.length + ' câu'));
    // khung 420 px (tự động; cỡ sân khấu nhỏ trong Studio): bong bóng 38% chỉ còn ~160 px → nhiều câu không còn chỗ sạch → PHẢI chuyển phụ đề, vẫn không đè đầu
    const bad420 = r360.lines.flatMap(L => judge(L)), cap360 = r360.lines.filter(L => L.ms[0].mode === 'caption').length;
    if (bad420.length || r360.lines.length < 5 || cap360 < 1) throw new Error('khung 420 px (tự động): ' + (bad420.slice(0, 3).join(' | ') || r360.lines.length + ' câu, phụ đề ' + cap360 + ' — mong đợi ≥ 1 câu chuyển phụ đề'));
    const badSlow = rSlow.lines.flatMap(L => judge(L));
    if (badSlow.length || rSlow.lines.length < 5) throw new Error('khung hình trễ 0,9 s: ' + (badSlow.slice(0, 3).join(' | ') || 'chỉ ' + rSlow.lines.length + ' câu'));
    console.log('  ✓ Khung hình trễ 0,9 s (máy yếu): ' + rSlow.lines.length + ' câu Văn phòng vui "canh-2" mở khi sân khấu đứng yên, hiện ' + Math.min(...rSlow.lines.map(L => L.life)) + '–' + Math.max(...rSlow.lines.map(L => L.life)) + ' ms tính từ lúc thật sự hiện, 0 px² đè đầu');
    console.log('  ✓ Chế độ lời thoại: phụ đề ép buộc ' + rCap.lines.length + ' câu (dải dưới, không đè đầu) · bong bóng ép buộc ' + rBub.lines.length + ' câu · khung 640 px: chữ ≥ 13 px, ' + r640.lines.length + ' câu sạch · khung 420 px tự động: ' + (r360.lines.length - cap360) + ' bong bóng + ' + cap360 + ' phụ đề (hết chỗ sạch thì chuyển phụ đề), 0 px² đè đầu');
    // THỬ NGƯỢC: bộ giải hỏng (đặt trên đỉnh đầu, không biết ai khác) → phải đè đầu ở cảnh cận; khôi phục → hết đè
    const mutHits = rMut.mut.filter(L => L.ms.some(m => m.overlaps.length)).length;
    if (mutHits < 2) throw new Error('THỬ NGƯỢC: tắt bộ giải mà chỉ ' + mutHits + ' câu đè đầu — bài đo không bắt được lỗi');
    const backBad = rMut.back.flatMap(L => judge(L));
    if (backBad.length || rMut.back.length < 5) throw new Error('khôi phục bộ giải vẫn lỗi: ' + (backBad[0] || rMut.back.length + ' câu'));
    console.log('  ✓ Thử ngược: bộ giải hỏng làm ' + mutHits + '/' + rMut.mut.length + ' câu đè đầu (test đỏ) → khôi phục lại sạch ' + rMut.back.length + '/' + rMut.back.length);
    // ngân sách hiệu năng (L-42): bố cục tính MỘT lần mỗi câu — đo cô lập (không trang nào khác chạy) trên cảnh cận nhiều diễn viên nhất
    {
      const q = await mkPage(null, TQ, 1280), r = await playShot(q, 'canh-dau-tap', 4); await q.close();
      const ms = r.lines.flatMap(L => L.ms.filter(m => m.costs).map(m => Math.min(...m.costs))).sort((a, c) => a - c), one = r.lines.flatMap(L => L.ms.filter(m => m.costs).map(m => m.ms)).sort((a, c) => a - c);
      // GC_THROTTLE=N (núm giả lập, CI không đặt): CPU của trang bị làm chậm N× THẬT → ngân sách quy về máy chuẩn = 30 ms × N
      const thr = Math.max(1, +process.env.GC_THROTTLE || 1), bud = 30 * thr, budTxt = bud + ' ms' + (thr > 1 ? ' = 30 × GC_THROTTLE ' + thr : '');
      if (ms.length < 6 || ms[ms.length - 1] > bud || r.calls / r.lines.length > 3) throw new Error('chi phí bố cục (đo riêng, nhỏ nhất của 5 lần giải mỗi câu): ' + ms.length + ' câu, tối đa ' + ms[ms.length - 1] + ' ms (> ' + budTxt + ') hoặc ' + (r.calls / r.lines.length).toFixed(1) + ' lần/câu');
      console.log('  ✓ Hiệu năng lời thoại (L-42, đo riêng ' + r.lines.length + ' câu, mỗi câu giải 5 lần lấy nhỏ nhất): bố cục trung vị ' + ms[Math.floor(ms.length / 2)] + ' ms, tối đa ' + ms[ms.length - 1] + ' ms (≤ ' + budTxt + '; lần giải đầu tối đa ' + one[one.length - 1] + ' ms), ' + (r.calls / r.lines.length).toFixed(1) + ' lần giải mỗi câu — không tính theo khung hình');
    }
    // ---- 3) Studio: ô chọn kiểu lời thoại, nhớ theo máy, áp vào sân khấu; phim xuất ra mang kiểu đã chọn + phông nhúng (mở file://, không mạng) ----
    const sq = await b9.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); sq.on('pageerror', e => errsAll.push(e.message));
    await sq.goto(URL9 + 'tao-tac'); await sq.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works', work: 'tq-vuon-dao-xich-bich' })));
    await sq.goto(URL9 + 'tao-tac'); await sq.waitForSelector('select[aria-label="Kiểu lời thoại"]', { timeout: 8000 });
    const opts = await sq.$$eval('select[aria-label="Kiểu lời thoại"] option', os => os.map(o => o.value + '|' + o.textContent));
    if (opts.join(';') !== 'auto|Lời thoại: tự động;bubble|Lời thoại: bong bóng;caption|Lời thoại: phụ đề') throw new Error('ô kiểu lời thoại: ' + opts.join(';'));
    if (await sq.$eval('select[aria-label="Kiểu lời thoại"]', e => e.value) !== 'auto') throw new Error('mặc định phải là tự động');
    await sq.selectOption('select[aria-label="Kiểu lời thoại"]', 'caption');
    if ((await sq.evaluate(() => localStorage.getItem('gc-stage'))) !== '{"dialog":"caption"}') throw new Error('chưa nhớ kiểu lời thoại: ' + await sq.evaluate(() => localStorage.getItem('gc-stage')));
    await sq.goto(URL9 + 'tao-tac'); await sq.waitForSelector('select[aria-label="Kiểu lời thoại"]');
    if (await sq.$eval('select[aria-label="Kiểu lời thoại"]', e => e.value) !== 'caption') throw new Error('tải lại trang mất kiểu lời thoại');
    await sq.click('button[data-playall]'); await sq.waitForSelector('.gcp .gcp-cap.on', { timeout: 30000 });
    if (await sq.$('.gcp .gcp-bub.on')) throw new Error('chọn "phụ đề" mà sân khấu vẫn hiện bong bóng');
    await sq.click('button:text-is("Dừng")');
    await sq.selectOption('select[aria-label="Kiểu lời thoại"]', 'bubble'); await sq.click('button[data-playall]'); await sq.waitForSelector('.gcp .gcp-bub.on', { timeout: 30000 });
    if (await sq.$('.gcp .gcp-cap.on')) throw new Error('chọn "bong bóng" mà sân khấu hiện phụ đề');
    await sq.click('button:text-is("Dừng")');
    await sq.selectOption('select[aria-label="Kiểu lời thoại"]', 'caption');   // xuất phim với kiểu "phụ đề"
    const [dl] = await Promise.all([sq.waitForEvent('download'), sq.click('button:text-is("Phim (HTML)")')]);
    const fp = path.join(home9, 'phim-loi-thoai.html'); await dl.saveAs(fp);
    const html = fs.readFileSync(fp, 'utf8');
    if (!/var FILM = \{[^\n]*"dialog":"caption"/.test(html)) throw new Error('phim xuất ra không mang kiểu lời thoại đã chọn');
    if (!/\/\* engine\/fonts\.js \*\//.test(html) || (html.match(/\[(500|700|800), "d09GMg/g) || []).length !== 3 || !/SIL OPEN FONT LICENSE Version 1\.1/.test(html)) throw new Error('phim xuất ra thiếu phông nhúng / giấy phép OFL');
    if (/https?:\/\/[^"' )]*\.(woff2?|ttf|otf)|fonts\.googleapis|fonts\.gstatic/.test(html)) throw new Error('phim xuất ra tải phông từ mạng');
    const ff = await b9.newPage({ viewport: { width: 1280, height: 900 } }), fe = []; ff.on('pageerror', e => fe.push(e.message)); ff.on('requestfailed', r => fe.push('mạng: ' + r.url()));
    ff.on('request', r => { if (!/^file:|^data:|^blob:/.test(r.url())) fe.push('gọi ra ngoài: ' + r.url()); });
    await ff.goto('file://' + fp); await ff.waitForSelector('#dialog');
    if (await ff.$eval('#dialog', e => e.value) !== 'caption') throw new Error('phim xuất ra: ô lời thoại không mặc định theo kiểu đã chọn');
    await ff.click('#big'); await ff.waitForSelector('.gcp-cap.on', { timeout: 30000 });
    const fo = await ff.evaluate(() => { const t = document.querySelector('.gcp-cap.on .tx'); return { fam: getComputedStyle(t).fontFamily, w: getComputedStyle(t).fontWeight, faces: [...document.fonts].filter(f => /Be Vietnam Pro/.test(f.family)).map(f => f.weight + ':' + f.status), cap: !!document.querySelector('.gcp-bub.on') }; });
    if (!/Be Vietnam Pro/.test(fo.fam) || !fo.faces.includes(fo.w + ':loaded') || fo.cap) throw new Error('phim xuất ra: phông / kiểu lời thoại sai ' + JSON.stringify(fo));
    await ff.selectOption('#dialog', 'bubble'); await ff.waitForSelector('.gcp-bub.on', { timeout: 30000 });   // người xem đổi sang bong bóng giữa chừng
    if (fe.length) throw new Error('phim xuất ra lỗi: ' + fe.slice(0, 3).join(' | '));
    await ff.close(); await sq.close();
    console.log('  ✓ Studio: ô "Lời thoại: tự động / bong bóng / phụ đề" cạnh âm thanh · nhớ theo máy (gc-stage) · áp vào sân khấu · phim xuất ra mang kiểu đã chọn + phông Be Vietnam Pro nhúng + OFL, mở file:// không gọi mạng, người xem đổi được');
    // ---- 4) giảm chuyển động: không bật nảy / trượt ----
    const rm = await (async () => { const q = await mkPage({ viewport: { width: 1320, height: 780 }, reducedMotion: 'reduce' }, TQ, 1280);
      await q.evaluate(() => window.__lt.start('canh-3')); await q.waitForSelector('#__st .gcp-bub.on, #__st .gcp-cap.on', { timeout: 30000 });
      const o = await q.evaluate(() => { const e = document.querySelector('#__st .gcp-bub.on, #__st .gcp-cap.on'), c = getComputedStyle(e); return { tr: c.transform, dur: parseFloat(c.transitionDuration), cam: parseFloat(getComputedStyle(document.querySelector('#__st .gcp-cam')).transitionDuration) }; });
      await q.evaluate(() => window.__P.stop()); await q.close(); return o; })();
    if (rm.tr !== 'none' || rm.dur > 0.1 || rm.cam > 0) throw new Error('giảm chuyển động chưa tắt hiệu ứng nảy: ' + JSON.stringify(rm));
    console.log('  ✓ Giảm chuyển động (prefers-reduced-motion): bong bóng không nảy / trượt, máy quay không lướt');
    if (errsAll.length) throw new Error('lỗi trang: ' + errsAll.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ lời thoại chuyên nghiệp:', e.message); }
  finally { await b9.close(); srv9.kill(); }
}
// Thư viện › Âm thanh + Thư viện › Giọng (v0.18, Data Console STD-07). TUYỆT ĐỐI không gọi Google / mạng thật: api/voice* và api/sound-packs bị chặn và trả lời giả
// bằng máy chủ trong bộ nhớ; mọi địa chỉ ngoài máy bị chặn và đếm. GC_ONLY=lib → chỉ nhóm này. GC_SHOTS=<thư mục> → chụp màn hình 1440×900 (tên lib-*), GC_SCHEME=light|dark.
if (want('lib')) {
  const fs = require('fs'), crypto = require('crypto'), GV = require('../engine/voices.js'), SND = require('../engine/sounds.js'), TQ = JSON.parse(fs.readFileSync(path.join(ROOT, 'kinds/sound/tq-am.json'), 'utf8'));
  const home11 = mkdtempSync(path.join(tmpdir(), 'gc-')), PORT11 = 7662, URL11 = 'http://localhost:' + PORT11 + '/', SHOTS = process.env.GC_SHOTS || '', SCHEME = process.env.GC_SCHEME === 'light' ? 'light' : 'dark';
  const srv11 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home11, GC_PORT: String(PORT11), GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await up(PORT11);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  const b11 = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
  const ctx11 = await b11.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, colorScheme: SCHEME });
  await ctx11.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:' + PORT11 });
  const PROJ = 'mau-tam-quoc', WORK = 'tq-vuon-dao-xich-bich';
  const wav = (sec, hz) => { const rate = 24000, n = Math.round(rate * sec), b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * hz * i / rate) * Math.min(1, i / 600, (n - i) / 600)), 44 + i * 2); return b; };
  const WAV = wav(0.6, 220), tomorrow = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.toISOString(); };
  // ---- "máy chủ" giả: giọng AI Google + gói âm ----
  const M = { hasKey: false, off: false, today: 3, fresh: 0, budget: Infinity, designs: {}, ids: new Set(), haveRoles: {}, dry404: false, lines: [], casts: [], designCalls: [], leaks: [],
    packs: [TQ], sound404: false, soundPosts: [], dailyCap: 200, soundDels: [], delMode: '' };
  const cfgOf = () => ({ enabled: M.hasKey && !M.off, off: M.off, model: 'gemini-3.8-flash-tts', hasKey: M.hasKey, keySource: M.hasKey ? 'voice' : '', blocked: [], today: M.today, cached: M.ids.size, keyUrl: 'https://aistudio.google.com/apikey',
    roles: GV.roleList(), langs: GV.langList(), designs: M.designs, dailyCap: M.dailyCap, bad: [] });
  // giọng AI mà "server" chọn cho một vai: đã thiết kế → giọng thiết kế; tiếng Việt → giọng dựng sẵn; ngôn ngữ khác → giọng thư viện theo mã vùng (en-US ≠ en-GB)
  const castVoice = (role, lang, accent) => {
    const d = M.designs[role + '|' + lang + '|' + accent];
    if (d) return { voice: d.voice, source: 'design', label: role + ' (thiết kế)' };
    const c = GV.cast({ id: role, voice: { role } }, { lang, accent });
    return lang === 'vi' ? { voice: c.ai, source: 'prebuilt', label: c.ai + ' (có sẵn)' } : { voice: 'lib-' + c.libLang + '-' + c.ai.toLowerCase(), source: 'library', label: 'Thư viện ' + c.libLang };
  };
  const idOf = b => crypto.createHash('sha1').update(JSON.stringify([b.voice, b.role, b.lang, b.accent, b.state, b.bubble, b.text])).digest('hex');
  await ctx11.route(/\/api\/voice(\/|\?|$)/, async route => {
    const req = route.request(), u = new URL(req.url()), m = req.method(), p = u.pathname.replace(/^\/api\/voice/, '') || '/', body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, o) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(o) });
    if (p === '/' && m === 'GET') return json(200, cfgOf());
    if (p === '/cast' && m === 'POST') { M.casts.push(body); const out = {}; (body.actors || []).forEach(a => { out[a.id] = castVoice(a.role, body.lang, body.accent); }); return json(200, { lang: body.lang, accent: body.accent, cast: out }); }
    if (p === '/design' && m === 'POST') {
      M.designCalls.push(body);
      if (!GV.canDesign(body.role)) return json(400, { error: 'Google chặn thiết kế giọng trẻ em (chính sách an toàn)' });
      const voice = 'voice_gia_' + body.role + '_' + body.accent, id = crypto.createHash('sha1').update('design' + voice).digest('hex');
      M.designs[body.role + '|' + body.lang + '|' + body.accent] = { voice, at: new Date().toISOString(), preview: 'api/voice/clip/' + id + '.wav' }; M.ids.add(id); M.today++;
      return json(200, { voice, role: body.role, lang: body.lang, accent: body.accent, preview: 'api/voice/clip/' + id + '.wav' });
    }
    if (p === '/line' && m === 'POST') {
      M.lines.push(body);
      const id = idOf(body);
      if (M.ids.has(id) || (body.dry && M.haveRoles[body.role + '|' + body.lang])) return json(200, { id, cached: true, seconds: 0.6, voice: body.voice, url: 'api/voice/clip/' + id + '.wav' });
      if (body.dry) return M.dry404 ? json(404, { error: 'Câu này chưa đọc bằng giọng AI' }) : json(200, { found: false });   // server thật: dry chưa có clip = 200 { found: false }
      if (!M.hasKey || M.off) return json(409, { error: 'Giọng AI đang tắt (Cài đặt AI › Giọng AI)' });
      if (M.fresh >= M.budget) return json(429, { error: 'Hết lượt đọc giọng hôm nay', retryAt: new Date(Date.now() + 3 * 3600e3).toISOString() });
      M.fresh++; M.today++; M.ids.add(id);
      return json(200, { id, cached: false, seconds: 0.6, voice: body.voice, url: 'api/voice/clip/' + id + '.wav' });
    }
    if (p.startsWith('/clip/') && m === 'GET') return route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV });
    return json(404, { error: 'mock: chưa có ' + m + ' ' + p });
  });
  await ctx11.route(/\/api\/sound-packs$/, async route => {
    const req = route.request(), m = req.method(), body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, o) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(o) });
    if (M.sound404) return json(404, { error: 'không tìm thấy' });
    if (m === 'GET') return json(200, M.packs);
    M.soundPosts.push(body);
    const pk = body.pack || {};
    if (pk.id === 'server-chan') return json(422, { error: 'Gói âm chưa đạt: sounds.chan.layers[1].peak: máy chủ chặn (giả)', errors: ['sounds.chan.layers[1].peak: máy chủ chặn (giả)'] });
    const c = SND.validateSoundPack(pk);
    if (c.errors.length) return json(422, { error: 'Gói âm chưa đạt: ' + c.errors[0], errors: c.errors });
    const rec = Object.assign({}, pk, { version: 1 }); M.packs = M.packs.filter(x => x.id !== rec.id).concat(rec);
    return json(200, Object.assign({}, rec, { warnings: [] }));
  });
  // gỡ gói âm: DELETE api/sound-packs/<id>[?force=1] — delMode: '' = gỡ được · '404' / '405' = máy chủ chưa có đường này · 'conflict' = 409 kèm conflicts[] (còn chỗ gọi âm của gói) trừ khi ?force=1
  await ctx11.route(/\/api\/sound-packs\/[a-z0-9-]+(\?.*)?$/, async route => {
    const req = route.request(), u = new URL(req.url()), id = u.pathname.split('/').pop(), force = u.searchParams.get('force') === '1';
    const json = (status, o) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(o) });
    M.soundDels.push({ id, force, method: req.method() });
    if (M.delMode === '404') return json(404, { error: 'không tìm thấy' });
    if (M.delMode === '405') return json(405, { error: 'phương thức không được hỗ trợ' });
    const deps = ['tác phẩm tq-vuon-dao-xich-bich › phân cảnh 2 › bước 3: gọi âm "vi-du-coc"', 'gói động tác tq-dong-tac › clip bonk: gọi âm "vi-du-coc"'];
    if (M.delMode === 'conflict' && !force) return json(409, { error: 'Gói âm "' + id + '" còn được gọi ở 2 chỗ', errors: deps, conflicts: deps });
    M.packs = M.packs.filter(x => x.id !== id);
    return json(200, { deleted: true, id, sounds: 1, warnings: M.delMode === 'conflict' ? deps.map(d => 'đã làm hỏng — ' + d) : [] });
  });
  // tác phẩm Tam Quốc có giọng đã chốt cho 2 nhân vật (work.voices) — server thật chốt khi Lồng tiếng / cast
  await ctx11.route(new RegExp('/api/works/' + WORK + '$'), async route => {
    const r = await route.fetch(); let j; try { j = await r.json(); } catch (e) { return route.fulfill({ response: r }); }
    j.voices = { 'vi|bac': { 'tq-quan-vu': 'Alnilam', 'tq-luu-bi': 'Schedar' } };
    return route.fulfill({ response: r, json: j });
  });
  await ctx11.route(u => !/^(http:\/\/localhost:|file:|data:|blob:|about:)/.test(u.href), route => { M.leaks.push(route.request().url()); return route.abort(); });
  const errs11 = [], sleep = ms => new Promise(r => setTimeout(r, ms)), must = (c, msg) => { if (!c) throw new Error(msg); };
  const SPY = `(() => { const A = window.GenChibi.audio; if (A.__spy) { A.__spy.sfx.length = 0; A.__spy.say.length = 0; return; } A.__spy = { sfx: [], say: [] }; const so = A.sfx;
    A.sfx = function (n, o) { A.__spy.sfx.push({ name: n, delay: o && o.delay }); return so.apply(A, arguments); };
    A.say = function (text, voice, hooks) { const c = hooks && hooks.clip; A.__spy.say.push({ text, lang: voice && voice.lang, role: voice && voice.role, gender: voice && voice.gender, clip: c ? 'buf:' + (c.byteLength || 0) : null }); return new Promise(r => setTimeout(r, 60)); }; })()`;
  const SPY_T = `(() => { window.__toasts = []; new MutationObserver(() => { const t = document.getElementById('toast'); if (t && !t.hidden) window.__toasts.push(t.textContent); }).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true, attributes: true }); })()`;
  let q = null;
  const open = async route => {   // mở Thư viện ở một trang con (đặt tuyến vào localStorage rồi nạp lại)
    q = await ctx11.newPage(); q.on('pageerror', e => errs11.push(e.message)); q.on('dialog', d => d.accept());
    await q.goto(URL11 + 'VERSION');   // cùng nguồn gốc, chưa chạy Studio: đặt tuyến vào localStorage rồi mới mở (một lần nạp duy nhất)
    await q.evaluate(([r, pj]) => { localStorage.setItem('gc-route-thu-vien', JSON.stringify(r)); localStorage.setItem('gc-last-project', pj); localStorage.setItem('gc-dock', JSON.stringify({ open: false })); }, [route, PROJ]);   // dock đóng: đo bố cục bảng + inspector đủ rộng (dock mở kiểm riêng ở A1)
    await q.goto(URL11 + 'thu-vien'); await q.waitForFunction(() => window.GenChibi && /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
    await q.evaluate(SPY); await q.evaluate(SPY_T); return q;
  };
  const shot = async (name, scroll) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await q.evaluate(sc => { const t = document.getElementById('toast'); if (t) t.hidden = true; const v = document.getElementById('view'); if (typeof sc === 'string') { const e = document.querySelector(sc); if (e) e.scrollIntoView({ block: 'start' }); } else if (v) v.scrollTop = sc ? v.scrollHeight : 0; }, scroll || false); await q.waitForTimeout(300); await q.screenshot({ path: path.join(SHOTS, 'lib-' + name + (SCHEME === 'light' ? '-light' : '') + '.png') }); };
  const rowsOf = () => q.$$eval('.lc-t tbody tr[data-id]', es => es.map(e => e.getAttribute('data-id')));
  const selOf = () => q.$eval('.lc-t tbody tr[aria-selected="true"]', e => e.getAttribute('data-id')).catch(() => '');
  const spy = (k) => q.evaluate(k => window.GenChibi.audio.__spy[k].slice(), k);
  const toasts = () => q.evaluate(() => window.__toasts.slice());
  const waitRows = async n => { await q.waitForFunction(n => document.querySelectorAll('.lc-t tbody tr[data-id]').length === n, n, { timeout: 8000 }); };
  const pollq = async (fn, what, ms) => { const t = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch (e) { /* chưa có */ } if (v) return v; if (Date.now() - t > (ms || 6000)) throw new Error('hết giờ chờ: ' + what); await sleep(80); } };
  const tab = async id => { await q.click('.lc-tabs button[data-tab="' + id + '"]'); await q.waitForSelector('.lc-tabs button[data-tab="' + id + '"][aria-selected="true"]'); };
  try {
    // ---- 0) dựng dữ liệu: bộ mẫu Tam Quốc vào thư viện (nhân vật có vai giọng + tác phẩm); gói âm tq-am do máy chủ giả trả ----
    const boot = await ctx11.newPage(); boot.on('pageerror', e => errs11.push(e.message));
    await boot.goto(URL11 + 'thu-vien'); await boot.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
    await boot.evaluate(async () => {
      const b = await fetch('studio/mau/tam-quoc.json').then(r => r.json());
      const r = await fetch('api/projects/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ bundle: b, overwrite: true }) });
      if (!r.ok) throw new Error('không nhập được bộ mẫu: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    });
    await boot.close();

    /* ================= A. THƯ VIỆN › ÂM THANH ================= */
    // khung 1440: dock Trợ lý AI (380 px) mở thì vùng làm việc < 880 px → inspector xếp dưới bảng (STD-07: chật thì inspector thu lại). Kiểm cạnh nhau khi dock đóng, xếp dưới khi dock mở
    await open({ page: 'lib-sounds' });
    await q.waitForSelector('.lc-t tbody tr[data-id]');
    // A1) bảng đủ 62 âm khung + 7 âm của mẫu Tam Quốc; 8 nhóm có số đếm; ID = tên âm; nav có số đếm; chữ cột A B C…
    await waitRows(69);
    const ids = await rowsOf();
    must(new Set(ids).size === 69 && ids.includes('hit') && ids.includes('trong-tran') && ids.includes('ban-ten'), 'bảng âm thiếu / trùng ID: ' + ids.length);
    must(SND.names().length === 62 && SND.list().filter(x => x.pack === 'gen.am').length === 62 && Object.keys(TQ.sounds).length === 7, 'dữ liệu gốc không còn 62 + 7 âm');
    const chips = await q.$$eval('.lc-cats button', es => es.map(e => [e.getAttribute('data-cat'), +e.querySelector('.n').textContent]));
    must(chips.length === 9 && chips[0][0] === '' && chips[0][1] === 69 && chips.slice(1).reduce((a, c) => a + c[1], 0) === 69, 'chip nhóm: ' + JSON.stringify(chips));
    must((await q.textContent('.nav-item[aria-current="page"]')).includes('69'), 'nav Âm thanh thiếu số đếm 69');
    must((await q.$$eval('.lc-t tr.letters th', es => es.map(e => e.textContent).join(''))).startsWith('ABCDEFGHIJ'), 'thiếu dải chữ cột A…J');
    must(/69 âm · 8 nhóm/.test(await q.textContent('.lc-foot')), 'footer: ' + await q.textContent('.lc-foot'));
    must(await q.$eval('.lc-insp', e => Math.round(e.getBoundingClientRect().width)) === 400, 'inspector phải rộng 400 px');
    await q.keyboard.press('Alt+j'); await q.waitForTimeout(300);
    const stack = await q.evaluate(() => { const i = document.querySelector('.lc-insp').getBoundingClientRect(), t = document.querySelector('.lc-t').getBoundingClientRect(), d = document.querySelector('.dock'); return { dock: !!d && d.getBoundingClientRect().width > 300, below: i.top > t.top + 40 && Math.abs(i.left - t.left) < 40, w: Math.round(i.width) }; });   // xếp một cột: inspector cùng mép trái với bảng, nằm dưới
    must(stack.dock && stack.below && stack.w >= 380, 'dock mở: inspector phải xếp dưới bảng, đủ rộng: ' + JSON.stringify(stack));
    await q.keyboard.press('Alt+j'); await q.waitForTimeout(300);
    // A2) lọc theo nhóm · tìm không dấu · thẻ · gói · dự án
    await q.click('.lc-cats button[data-cat="hai"]');
    const nHai = await q.evaluate(() => window.GenChibi.sounds.list({ cat: 'hai' }).length);   // trong trang: gồm cả âm gói Tam Quốc
    await waitRows(nHai);
    must(await q.evaluate(ids => ids.every(id => window.GenChibi.sounds.get(id).cat === 'hai'), await rowsOf()), 'lọc nhóm "Hài hước" lẫn nhóm khác');
    await q.click('.lc-cats button[data-cat="hai"]'); await waitRows(69);   // bấm lại = bỏ lọc
    await q.fill('#lsQ', 'dau'); const nDau = await q.evaluate(() => window.GenChibi.sounds.list({ q: 'dau' }).length);
    await waitRows(nDau); must(nDau >= 3, 'tìm "dau" quá ít kết quả: ' + nDau);
    const dauIds = await rowsOf();
    await q.fill('#lsQ', 'đầu'); await waitRows(nDau);   // có dấu / không dấu cho cùng kết quả
    must((await rowsOf()).join() === dauIds.join(), 'tìm "đầu" khác "dau"');
    await q.fill('#lsQ', 'trong tran'); await waitRows(await q.evaluate(() => window.GenChibi.sounds.list({ q: 'trong tran' }).length)); must((await rowsOf())[0] === 'trong-tran', 'tìm "trong tran" phải đưa trong-tran (khớp tên) lên đầu');
    await q.fill('#lsQ', 'khongcogiha'); await q.waitForSelector('.lc-t td.lc-empty'); must((await rowsOf()).length === 0, 'tìm vô nghĩa vẫn ra hàng');
    await q.fill('#lsQ', ''); await waitRows(69);
    await q.fill('.lc-bar input[list="lsTags"]', 'trống'); await q.press('.lc-bar input[list="lsTags"]', 'Enter');
    const nTag = await q.evaluate(() => window.GenChibi.sounds.list({ tag: 'trống' }).length); await waitRows(nTag);
    must((await rowsOf()).includes('trong-tran') && await q.$('.lc-chipx:not([hidden])'), 'lọc thẻ "trống" hỏng');
    await q.click('.lc-chipx button'); await waitRows(69);
    await q.selectOption('.lc-bar select[aria-label="Lọc theo gói"]', 'tq-am'); await waitRows(7);
    must((await rowsOf()).sort().join() === Object.keys(TQ.sounds).sort().join(), 'lọc gói tq-am không đủ 7 âm');
    await q.selectOption('.lc-bar select[aria-label="Lọc theo gói"]', '');
    await q.selectOption('.lc-bar select[aria-label="Lọc theo dự án"]', '-'); await waitRows(62);   // chỉ khung + gói chung: không có âm của Tam Quốc
    must(!(await rowsOf()).includes('trong-tran'), 'dự án "không" vẫn thấy âm của gói Tam Quốc');
    await q.selectOption('.lc-bar select[aria-label="Lọc theo dự án"]', PROJ); await waitRows(69);
    await q.selectOption('.lc-bar select[aria-label="Lọc theo dự án"]', '');
    // sắp xếp bấm tiêu đề cột: Giây tăng dần
    await q.click('.lc-t th[data-col="4"] button'); const sorted = await q.$$eval('.lc-t tbody tr[data-id] td:nth-child(5)', es => es.map(e => +e.textContent.replace(',', '.')));
    must(sorted.every((v, i) => !i || sorted[i - 1] <= v), 'sắp xếp cột Giây sai'); await q.click('.lc-t th[data-col="4"] button'); await q.click('.lc-t th[data-col="4"] button');   // desc rồi bỏ sắp xếp
    console.log('  ✓ Thư viện › Âm thanh: bảng 69 âm (62 khung + 7 Tam Quốc), 8 nhóm có số đếm, inspector 400 px · lọc nhóm / thẻ / gói / dự án · tìm không dấu ("dau" = "đầu" = ' + nDau + ' âm) · sắp xếp cột');

    // A3) ▶ trên hàng gọi sfx đúng tên; bàn phím ↑↓ / Space; chọn hàng → inspector
    await q.click('[data-play="bonk"]');
    must((await spy('sfx')).map(s => s.name).join() === 'bonk', 'bấm ▶ hàng bonk không gọi sfx("bonk"): ' + JSON.stringify(await spy('sfx')));
    must(await selOf() === 'bonk' && /bonk/.test(await q.textContent('.lc-insp h3')), 'bấm ▶ phải chọn hàng + mở inspector');
    await q.focus('.lc-t'); await q.keyboard.press('ArrowDown');
    const next = ids[ids.indexOf('bonk') + 1]; must(await selOf() === next, 'ArrowDown phải sang hàng kế (' + next + '): ' + await selOf());
    await q.keyboard.press('Space');
    must((await spy('sfx')).map(s => s.name).join() === 'bonk,' + next, 'Space không nghe hàng đang chọn: ' + JSON.stringify(await spy('sfx')));
    await q.keyboard.press('ArrowUp'); must(await selOf() === 'bonk', 'ArrowUp phải về bonk'); await q.keyboard.press('j'); must(await selOf() === next, 'phím j = xuống');
    await q.keyboard.press('End'); must(await selOf() === ids[ids.length - 1], 'End phải tới hàng cuối'); await q.keyboard.press('Home'); must(await selOf() === ids[0], 'Home phải về hàng đầu');
    await q.keyboard.press('/'); must(await q.evaluate(() => document.activeElement && document.activeElement.id) === 'lsQ', 'phím / phải nhảy vào ô tìm');
    // âm có điểm va (wham): ghi chú ở inspector; chép tên / JSON bước / gọi MCP
    await q.fill('#lsQ', ''); await q.click('tr[data-id="wham"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("wham")');
    must(/TRƯỚC khung trúng đòn/.test(await q.textContent('.lc-insp')), 'wham: thiếu ghi chú điểm va (hitAt)');
    await q.click('.lc-insp button:has-text("Chép tên")'); must(await q.evaluate(() => navigator.clipboard.readText()) === 'wham', 'Chép tên không vào clipboard');
    await q.click('.lc-insp .seg button:has-text("Bước kịch bản")'); await q.click('.lc-insp button:text-is("Chép")');
    const step = JSON.parse(await q.evaluate(() => navigator.clipboard.readText()));
    must(Array.isArray(step.sfx) && step.sfx.join() === 'wham' && step.actor && step.state, 'JSON bước kịch bản sai: ' + JSON.stringify(step));
    must((await q.evaluate(() => window.GenChibi.sounds.lintSoundTrack([JSON.parse(document.querySelector('.lc-insp textarea.code').value)], { project: '' }))).filter(i => i.level === 'error').length === 0, 'bước kịch bản chép ra không qua S1–S7');
    must(/Đã chép/.test((await toasts()).join('|')), 'thiếu thông báo đã chép');
    await q.click('.lc-insp .seg button:has-text("Gọi MCP")'); const mcp = await q.inputValue('.lc-insp textarea.code');
    must(/lint_sound_track/.test(mcp) && /"wham"/.test(mcp) && /list_sounds/.test(mcp) && /get_sound_pack/.test(mcp), 'đoạn gọi MCP thiếu: ' + mcp.slice(0, 200));
    // âm của gói dự án: bước kịch bản mang dự án; tải WAV (renderWav có → tải được tệp RIFF)
    await q.click('tr[data-id="trong-tran"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("trong-tran")');
    must(/Âm NHẤN/.test(await q.textContent('.lc-insp')) && /Tam Quốc/.test(await q.textContent('.lc-insp .lc-kv')), 'trong-tran: thiếu ghi chú âm nhấn / dự án');
    await q.click('.lc-insp .seg button:has-text("Gọi MCP")'); must(/"project": "mau-tam-quoc"/.test(await q.inputValue('.lc-insp textarea.code')), 'gọi MCP của âm gói dự án phải mang project');
    const dlp = q.waitForEvent('download', { timeout: 15000 }); await q.click('.lc-insp button:has-text("Tải WAV")'); const dl = await dlp;
    must(dl.suggestedFilename() === 'trong-tran.wav', 'tên tệp WAV: ' + dl.suggestedFilename());
    const wavBytes = fs.readFileSync(await dl.path()); must(wavBytes.slice(0, 4).toString() === 'RIFF' && wavBytes.slice(8, 12).toString() === 'WAVE' && wavBytes.length > 20000, 'WAV tải về không phải RIFF/WAVE đủ dài (' + wavBytes.length + ' byte)');
    await q.click('.lc-insp button.tag >> nth=0'); await q.waitForSelector('.lc-chipx:not([hidden])');   // bấm thẻ trong inspector = lọc theo thẻ đó
    const tg = (await q.textContent('.lc-chipx')).replace(/^thẻ: /, '').replace(/×$/, '').trim(); await waitRows(await q.evaluate(t => window.GenChibi.sounds.list({ tag: t }).length, tg)); must((await rowsOf()).includes('trong-tran'), 'lọc theo thẻ từ inspector không còn trong-tran');
    await q.click('.lc-chipx button'); await waitRows(69);
    await q.click('tr[data-id="hit"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("hit")'); await shot('sounds-bang');
    console.log('  ✓ Thư viện › Âm thanh: ▶ gọi sfx đúng tên · ↑↓ / J K / Home / End chọn hàng, Space nghe hàng chọn, / vào ô tìm · inspector: chép tên, chép JSON bước (qua S1–S7), đoạn gọi MCP (mang project), tải WAV (RIFF) · ghi chú điểm va / âm nhấn');

    // A4) tab Luật ghép: S1–S7 lấy từ GC.sounds.RULES (một nguồn), quy trình từ guide(), công thức ▶ nghe chuỗi, kiểm thử chuỗi
    await tab('rules');
    const rules = await q.$$eval('tr[data-rule]', es => es.map(e => [e.getAttribute('data-rule'), e.children[2].textContent, e.children[1].textContent]));
    const src = await q.evaluate(() => window.GenChibi.sounds.RULES.list.map(r => [r.code, r.rule, r.level]));
    must(rules.length === 7 && rules.every((r, i) => r[0] === 'S' + (i + 1) && r[1] === src[i][1]), 'luật S1–S7 không khớp GC.sounds.RULES: ' + JSON.stringify(rules.map(r => r[0])));
    must(rules.every((r, i) => (src[i][2] === 'error') === /Lỗi/.test(r[2])), 'mức lỗi / cảnh báo của luật sai');
    must((await q.$$('.lc-steps li')).length >= 5 && /TRỐNG/.test(await q.textContent('.lc-steps')), 'quy trình ghép thiếu bước (lấy từ guide())');
    const recs = await q.$$eval('.lc-recipe', es => es.map(e => e.getAttribute('data-id'))); must(recs.join() === SND.RECIPES.map(r => r.id).join(), 'công thức mẫu: ' + recs.join());
    await q.evaluate(SPY); await q.click('button[data-recipe="vo-chuoi"]');
    const rc = SND.RECIPES.find(r => r.id === 'vo-chuoi'), sq = await spy('sfx');
    must(sq.length === rc.seq.length && sq.every((c, i) => c.name === rc.seq[i][1] && Math.abs((c.delay || 0) - rc.seq[i][0]) < 1e-9), 'nghe chuỗi vo-chuoi phải gọi sfx(tên, { delay }) theo seq: ' + JSON.stringify(sq));
    await q.click('.lc-recipe[data-id="y-tuong"] button:has-text("Chép các bước")'); const rsteps = JSON.parse(await q.evaluate(() => navigator.clipboard.readText()));
    must(rsteps.length === 2 && rsteps[0].sfx[0] === 'ding' && rsteps[1].sfx[0] === 'scramble', 'chép các bước công thức sai');
    await q.click('#lsLintGo'); await q.waitForSelector('[data-lint]'); must((await q.getAttribute('[data-lint]', 'data-lint')).split('/')[0] === '0', 'chuỗi mẫu vo-chuoi không được có lỗi: ' + await q.textContent('.lc-lint [role=status]'));
    await q.fill('#lsLintIn', JSON.stringify([{ actor: 'a', state: 'normal', say: 'Xin chào các bạn', sfx: ['hit', 'bonk', 'pow', 'zip', 'khong-co-am-nay'] }]));
    await q.click('#lsLintGo'); await q.waitForFunction(() => { const e = document.querySelector('[data-lint]'); return e && e.getAttribute('data-lint').split('/')[0] !== '0'; });
    const lintTxt = await q.textContent('.lc-issues'); must(/S1/.test(lintTxt) && /S6/.test(lintTxt) && /khong-co-am-nay/.test(lintTxt), 'kiểm luật phải báo S1 + S6: ' + lintTxt.slice(0, 200));
    await q.fill('#lsLintIn', '{ không phải json'); await q.click('#lsLintGo'); await q.waitForSelector('.lc-msg.bad:has-text("Không phải JSON")');
    await q.fill('#lsLintIn', JSON.stringify([{ actor: 'a', state: 'normal', say: 'Xin chào các bạn', sfx: ['hit', 'bonk', 'pow', 'zip', 'khong-co-am-nay'] }])); await q.click('#lsLintGo'); await q.waitForSelector('.lc-issues');
    await shot('sounds-luat'); await shot('sounds-luat-cong-thuc', true);
    console.log('  ✓ Thư viện › Âm thanh › Luật ghép: S1–S7 khớp GC.sounds.RULES (chữ + mức) · quy trình từ guide() · ' + recs.length + ' công thức, ▶ nghe chuỗi đúng delay, chép các bước · kiểm thử chuỗi báo S1 + S6');

    // A5) tab Gói âm: danh sách · tải gói JSON · nhập (cổng kiểm cục bộ + máy chủ, lỗi kèm path) · máy chủ không có endpoint thì chỉ còn gói trong engine
    await tab('packs');
    const prow = await q.$$eval('tr[data-pack]', es => es.map(e => [e.getAttribute('data-pack'), e.children[3].textContent, e.children[4].textContent, e.children[2].textContent]));
    must(prow.length === 2 && prow[0][0] === 'gen.am' && prow[0][2] === '62' && prow[1][0] === 'tq-am' && prow[1][2] === '7' && /Tam Quốc/.test(prow[1][3]), 'bảng gói âm: ' + JSON.stringify(prow));
    const dgp = q.waitForEvent('download'); await q.click('tr[data-pack="tq-am"] button:has-text("Tải JSON")'); const dg = await dgp;
    const gj = JSON.parse(fs.readFileSync(await dg.path(), 'utf8')); must(dg.suggestedFilename() === 'tq-am.json' && gj.format === 'gen-chibi.sound/1' && gj.id === 'tq-am' && Object.keys(gj.sounds).length === 7, 'gói tải về sai');
    must(!(await q.$('tr[data-pack="gen.am"] button:has-text("Tải JSON")')), 'bộ khung gen.am không có nút tải gói');
    const bad = { format: 'gen-chibi.sound/1', id: 'loi-goi', name: 'Gói lỗi', sounds: { 'am-hong': { label: 'Âm hỏng', cat: 'khong-co-nhom', tags: ['x'], use: 'thử', dur: 0.5, level: 1, layers: [{ k: 'tone', hz: 440, dur: 0.3, peak: 0.5 }] } } };
    await q.fill('#lsImport', JSON.stringify(bad)); await q.click('#lsImportGo');
    await q.waitForSelector('.lc-import ul.errs li'); const e1 = await q.$$eval('.lc-import ul.errs li', es => es.map(e => e.textContent));
    must(e1.length >= 1 && /sounds\.am-hong/.test(e1.join('|')) && /cat/.test(e1.join('|')), 'lỗi cổng kiểm phải kèm path (sounds.am-hong…cat): ' + e1.join(' | '));
    must(M.soundPosts.length === 0, 'gói không qua cổng kiểm cục bộ không được gửi lên máy chủ');
    await q.fill('#lsImport', JSON.stringify(Object.assign({}, SND.EXAMPLE, { id: 'trung-ten', sounds: { hit: SND.EXAMPLE.sounds['vi-du-coc'] } })));   // tên âm "hit" trùng bộ khung
    await q.click('#lsCheck'); await q.waitForFunction(() => /trùng tên âm của gói "gen\.am"/.test(document.querySelector('.lc-import').textContent));
    await q.fill('#lsImport', '{ hỏng'); await q.click('#lsCheck'); await q.waitForSelector('.lc-import .lc-msg.bad:has-text("Không phải JSON")');
    const ex = JSON.parse(JSON.stringify(SND.EXAMPLE)); ex.id = 'server-chan';   // qua cổng cục bộ, bị máy chủ giả từ chối
    await q.fill('#lsImport', JSON.stringify(ex)); await q.click('#lsImportGo'); await q.waitForFunction(() => /sounds\.chan\.layers\[1\]\.peak/.test(document.querySelector('.lc-import').textContent));
    must(M.soundPosts.length === 1 && M.soundPosts[0].pack.id === 'server-chan', 'chưa gửi gói lên máy chủ giả'); must(/máy chủ chặn/.test(await q.textContent('.lc-import ul.errs')), 'lỗi máy chủ không hiện kèm path');
    await q.selectOption('.lc-import select', PROJ);
    await q.fill('#lsImport', JSON.stringify(SND.EXAMPLE)); await q.click('#lsImportGo');
    await q.waitForSelector('tr[data-pack="vi-du-am"]'); must(M.soundPosts.length === 2 && M.soundPosts[1].pack.id === 'vi-du-am' && M.soundPosts[1].pack.project === PROJ, 'POST api/sound-packs thiếu gói / dự án: ' + JSON.stringify(M.soundPosts[1] && M.soundPosts[1].pack.project));
    must(await q.evaluate(() => window.GenChibi.sounds.has('vi-du-coc')), 'gói nhập xong chưa nạp vào GC.sounds'); must(/Đã nhập gói/.test((await toasts()).join('|')), 'thiếu thông báo nhập gói');
    await tab('sounds'); await waitRows(71); await tab('packs');
    must(/Phát hành|Nháp/.test(await q.textContent('tr[data-pack="vi-du-am"]')), 'hàng gói mới thiếu trạng thái');
    await shot('sounds-goi');
    // Gỡ gói (CNS-106): chỉ gói của người dùng (gói khung + bộ mẫu không có nút); bấm 2 lần; 404 / 405 → "máy chủ chưa hỗ trợ"; 409 → danh sách phụ thuộc + "Vẫn gỡ" (gửi ?force=1)
    must(!(await q.$('tr[data-pack="gen.am"] button[aria-label^="Gỡ gói"]')) && !(await q.$('tr[data-pack="tq-am"] button[aria-label^="Gỡ gói"]')), 'gói khung / gói mẫu không được có nút Gỡ gói');
    const delB = 'tr[data-pack="vi-du-am"] button[aria-label="Gỡ gói vi-du-am"]';
    must(!!(await q.$(delB)), 'gói của người dùng phải có nút Gỡ gói');
    for (const code of ['404', '405']) {   // máy chủ chưa có DELETE
      M.delMode = code; M.soundDels.length = 0;
      await q.click(delB); must(M.soundDels.length === 0 && /Bấm lần nữa/.test(await q.textContent(delB)), 'lần bấm 1 chỉ xác nhận, chưa gọi máy chủ');
      await q.click(delB); await pollq(async () => /Máy chủ chưa hỗ trợ gỡ gói/.test(await q.textContent('#lsDelBox')), 'báo máy chủ chưa hỗ trợ (' + code + ')');
      must(M.soundDels.length === 1 && M.soundDels[0].method === 'DELETE' && !M.soundDels[0].force && !!(await q.$('tr[data-pack="vi-du-am"]')) && await q.evaluate(() => window.GenChibi.sounds.has('vi-du-coc')), 'chưa gỡ được thì gói vẫn còn');
      must(!(await q.$eval(delB, e => e.disabled)) && /Gỡ gói/.test(await q.textContent(delB)), 'sau lỗi nút Gỡ gói bấm lại được');
    }
    M.delMode = 'conflict'; M.soundDels.length = 0;   // 409 + danh sách phụ thuộc → "Vẫn gỡ"
    await q.click(delB); await q.click(delB); await q.waitForSelector('#lsDelForce', { timeout: 5000 });
    const deps = await q.$$eval('#lsDelBox li', es => es.map(e => e.textContent));
    must(deps.length === 2 && /tq-vuon-dao-xich-bich/.test(deps[0]) && /gói động tác tq-dong-tac/.test(deps[1]) && /còn được gọi ở 2 chỗ/.test(await q.textContent('#lsDelBox')), 'danh sách phụ thuộc: ' + deps.join(' | '));
    must(M.soundDels.length === 1 && !M.soundDels[0].force && !!(await q.$('tr[data-pack="vi-du-am"]')), 'chưa bấm "Vẫn gỡ" thì chưa gửi force, gói vẫn còn'); await shot('goi-am-go');
    await q.click('#lsDelForce'); await q.waitForFunction(() => !document.querySelector('tr[data-pack="vi-du-am"]'), null, { timeout: 5000 });
    must(M.soundDels.length === 2 && M.soundDels[1].force === true, '"Vẫn gỡ" phải gửi ?force=1: ' + JSON.stringify(M.soundDels));
    must(!(await q.evaluate(() => window.GenChibi.sounds.has('vi-du-coc') || window.GenChibi.sounds.packs().some(p => p.id === 'vi-du-am'))), 'gỡ xong phải bỏ khỏi GC.sounds');
    await pollq(async () => /đã làm hỏng/.test(await q.textContent('#lsDelBox')) && (await toasts()).some(t => /Đã gỡ gói “Gói ví dụ/.test(t) || /Đã gỡ gói/.test(t)), 'sau khi gỡ cưỡng bức: toast + cảnh báo');
    M.delMode = '';   // gỡ thường (không còn phụ thuộc): nhập lại gói rồi gỡ bằng 2 lần bấm, không gửi force
    await q.fill('#lsImport', JSON.stringify(SND.EXAMPLE)); await q.click('#lsImportGo'); await q.waitForSelector(delB);
    M.soundDels.length = 0; await q.click(delB); await q.click(delB); await q.waitForFunction(() => !document.querySelector('tr[data-pack="vi-du-am"]'), null, { timeout: 5000 });
    must(M.soundDels.length === 1 && !M.soundDels[0].force && M.soundDels[0].id === 'vi-du-am', 'gỡ thường: một lời gọi DELETE, không force: ' + JSON.stringify(M.soundDels));
    await q.close();
    M.sound404 = true; await open({ page: 'lib-sounds', tab: 'packs' }); await q.waitForSelector('tr[data-pack]');
    must((await q.$$('tr[data-pack]')).length === 1 && await q.$eval('#lsImportGo', e => e.disabled) && /chưa có api\/sound-packs/.test(await q.textContent('.lc-import')), 'máy chủ không có api/sound-packs: chỉ còn gói trong engine, nút nhập khoá');
    await q.fill('#lsImport', JSON.stringify(SND.EXAMPLE)); await q.click('#lsCheck'); await q.waitForSelector('.lc-import .lc-msg.ok');   // vẫn kiểm được gói
    M.sound404 = false; M.packs = [TQ]; await q.close();
    console.log('  ✓ Thư viện › Âm thanh › Gói âm: bảng gói (ID, dự án, phiên bản, số âm) · tải gói JSON · nhập: lỗi cổng kiểm hiện kèm path (cục bộ + máy chủ), trùng tên âm bị chặn, nhập đúng thì nạp ngay · endpoint 404 → chỉ gói trong engine, nút nhập khoá · Gỡ gói (chỉ gói của người dùng, bấm 2 lần; 404 / 405 → "Máy chủ chưa hỗ trợ"; 409 → danh sách phụ thuộc + "Vẫn gỡ" gửi ?force=1; gỡ xong bỏ khỏi GC.sounds)');

    /* ================= B. THƯ VIỆN › GIỌNG ================= */
    // B1) chưa có key: vẫn xem + nghe giọng máy, có lời nhắc và lối tới Cài đặt AI
    M.hasKey = false;
    await open({ page: 'lib-voices', project: PROJ });
    await waitRows(22);
    must((await rowsOf()).join() === GV.roleList().map(r => r.id).join(), 'bảng giọng không đủ 22 vai đúng thứ tự');
    const rcells = await q.$$eval('tr[data-id="ong-lao"] td', es => es.map(e => e.textContent));
    must(/ong-lao/.test(rcells.join('|')) && /Ông lão/.test(rcells[2]) && /Cao tuổi/.test(rcells[3]) && /Nam/.test(rcells[4]) && /Thường ngày/.test(rcells[5]) && /Được/.test(rcells[6]) && /slow, slightly raspy, wise/.test(rcells[7]), 'hàng ong-lao: ' + rcells.join(' | '));
    must((await q.$$eval('tr[data-id] td:nth-child(7)', es => es.filter(e => /Google chặn/.test(e.textContent)).length)) === 4, '4 vai trẻ em phải ghi "Google chặn"');
    must(/Chưa có key Google/.test(await q.textContent('.lv-banner')) && await q.$('#lvKey'), 'chưa có key mà thiếu lời nhắc + nút tới Cài đặt AI');
    must((await q.$$eval('[data-ai]', es => es.every(e => e.disabled))) && (await q.$$('tr[data-id] [data-ai]')).length === 22, 'chưa có key: nút giọng AI phải mờ (22 hàng)');
    must(M.casts.length === 0 && M.lines.length === 0, 'chưa có key mà vẫn hỏi cast / đọc: ' + M.casts.length + '/' + M.lines.length);
    await q.evaluate(SPY); await q.click('[data-machine="ong-lao"]');
    const s1 = (await spy('say'))[0]; must(s1 && /^Con à, đời người như chén trà/.test(s1.text) && s1.role === 'ong-lao' && s1.lang === 'vi-VN' && s1.gender === 'm', '▶ giọng máy ông lão (vi): ' + JSON.stringify(s1));
    await q.click('tr[data-id="ba-lao"] td.id'); await q.click('#lvHear'); const s2 = (await spy('say'))[1]; must(s2 && s2.role === 'ba-lao' && s2.gender === 'f' && /Lại đây với bà/.test(s2.text), '▶ giọng máy bà lão: ' + JSON.stringify(s2));
    await q.click('#lvKey'); await q.waitForSelector('#voice-panel', { timeout: 8000 });   // dẫn tới Cài đặt AI › Giọng AI
    must(/Cài đặt AI/.test(await q.textContent('.crumbs')), 'nút lời nhắc phải dẫn tới Cài đặt AI › Giọng AI'); await q.close();
    console.log('  ✓ Thư viện › Giọng (chưa có key): 22 vai đúng ID · cột nhóm tuổi / giới / văn-võ / phong cách / thiết kế được (4 vai trẻ em "Google chặn") · lời nhắc + lối tới Cài đặt AI · không gọi máy chủ giọng · ▶ giọng máy đọc đúng câu mẫu theo vai (ông lão vi: "Con à, đời người như chén trà…")');

    // B2) có key: cast theo ngôn ngữ / giọng vùng · clip mẫu có sẵn (dry) nghe miễn phí · "Đọc mẫu bằng AI" gửi đúng vai / ngôn ngữ / vùng, xác nhận 2 bước
    M.hasKey = true; M.haveRoles = { 'ong-lao|vi': true };
    await open({ page: 'lib-voices', role: 'ong-lao', project: PROJ });
    await waitRows(22); await q.waitForSelector('.lv-banner[data-state="ready"]');
    await pollq(async () => (await q.$$eval('tr[data-id] [data-ai="play"], tr[data-id] [data-ai="read"]', es => es.length)) === 22, 'đủ 22 hàng đã kiểm clip mẫu', 10000);
    must((await q.$$('tr[data-id="ong-lao"] [data-ai="play"]')).length === 1 && (await q.$$('tr[data-id="hai-huoc"] [data-ai="read"]')).length === 1, 'ong-lao có clip (▶ AI), hai-huoc chưa (Đọc AI · 1 lượt)');
    must(M.lines.length >= 22 && M.lines.every(l => l.dry === true && l.voice && l.role && l.lang === 'vi' && l.accent === 'bac'), 'lần kiểm đầu chỉ được dùng dry (không tốn lượt): ' + M.lines.filter(l => !l.dry).length + ' lời gọi không dry');
    must(M.casts.length === 22 && M.casts.every(c => c.actors.length === 1 && c.actors[0].id === c.actors[0].role), 'cast mỗi vai một lần: ' + M.casts.length + ' lời gọi · ' + [...new Set(M.casts.map(c => c.actors.map(a => a.id).join()))].length + ' vai khác nhau · ' + M.casts.map(c => c.actors[0].id + ':' + c.lang + '/' + c.accent).slice(0, 30).join(' '));
    const cast0 = castVoice('ong-lao', 'vi', 'bac').voice;
    must(await q.textContent('[data-cast="ong-lao"]').then(t => t.includes(cast0)), 'inspector: giọng AI sẽ dùng phải là ' + cast0);
    await q.evaluate(SPY); await q.click('tr[data-id="ong-lao"] [data-ai="play"]');
    await pollq(async () => (await spy('say')).length === 1, 'nghe clip có sẵn');
    const aiSay = (await spy('say'))[0]; must(/^buf:\d+/.test(aiSay.clip || '') && aiSay.role === 'ong-lao' && /^Con à/.test(aiSay.text), '▶ AI phải phát clip có sẵn: ' + JSON.stringify(aiSay));
    must(M.fresh === 0 && M.lines.filter(l => !l.dry).length === 0, '▶ AI với clip có sẵn không được tốn lượt (fresh=' + M.fresh + ')');
    // đổi ngôn ngữ / giọng vùng → cast đổi (tiếng Anh Mỹ ≠ Anh Anh), câu mẫu đổi theo ngôn ngữ
    await q.selectOption('#lvLang', 'en'); await q.waitForFunction(() => /Hello|Mom|My child/.test(document.querySelector('.lv-line').textContent));
    const enUS = castVoice('ong-lao', 'en', 'us').voice, enGB = castVoice('ong-lao', 'en', 'uk').voice; must(enUS !== enGB && enUS !== cast0, 'mock cast không đổi theo ngôn ngữ / vùng');
    await q.waitForFunction(v => document.querySelector('[data-cast="ong-lao"]') && document.querySelector('[data-cast="ong-lao"]').textContent.includes(v), enUS, { timeout: 8000 });
    await q.selectOption('#lvAccent', 'uk'); await q.waitForFunction(v => document.querySelector('[data-cast="ong-lao"]') && document.querySelector('[data-cast="ong-lao"]').textContent.includes(v), enGB, { timeout: 8000 });
    must(/My child, life is like a cup of tea/.test(await q.textContent('.lv-line')), 'câu mẫu tiếng Anh của ông lão sai'); must(/English|Tiếng Anh/.test(await q.textContent('.lc-foot')) && /Anh Anh/.test(await q.textContent('.lc-foot')), 'footer phải nói ngôn ngữ + vùng đang chọn');
    await q.evaluate(SPY); await q.click('#lvHear'); const sEn = (await spy('say'))[0]; must(sEn.lang === 'en-GB' && /^My child/.test(sEn.text), '▶ giọng máy en-uk: ' + JSON.stringify(sEn));
    for (const [lang, acc, re] of [['zh', 'tw', /孩子，人生就像一杯茶/], ['yue', 'hk', /乖仔，人生好似一杯茶/]]) {
      await q.selectOption('#lvLang', lang); if (acc !== 'hk') await q.selectOption('#lvAccent', acc);
      await q.waitForFunction(([l, a]) => document.querySelector('#lvLang').value === l && document.querySelector('#lvAccent').value === a, [lang, acc]); must(re.test(await q.textContent('.lv-line')), 'câu mẫu ' + lang + '/' + acc + ' của ông lão sai');
    }
    await q.selectOption('#lvLang', 'vi'); await q.selectOption('#lvAccent', 'bac'); await q.waitForFunction(() => /Con à, đời người/.test(document.querySelector('.lv-line').textContent));
    // "Đọc mẫu bằng AI (1 lượt)": chưa có clip → báo trước, bấm 2 lần mới đọc, gửi đúng vai / ngôn ngữ / vùng / giọng
    await q.click('tr[data-id="hai-huoc"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("hai-huoc")');
    await pollq(async () => (await q.$$('.lc-insp [data-ai="read"]')).length === 1, 'nút Đọc mẫu bằng AI trong inspector');
    must(/Đọc mẫu bằng AI \(1 lượt\)/.test(await q.textContent('.lc-insp [data-ai="read"]')), 'nhãn nút phải là "Đọc mẫu bằng AI (1 lượt)"');
    const nLines = M.lines.length; await q.evaluate(SPY); await q.click('.lc-insp [data-ai="read"]');
    must(/tốn 1 lượt/.test(await q.textContent('.lc-insp [data-ai="read"]')) && M.lines.length === nLines && M.fresh === 0, 'bấm lần 1 chỉ báo trước tốn lượt, chưa đọc');
    await q.click('.lc-insp [data-ai="read"]'); await pollq(async () => M.fresh === 1, 'đã đọc 1 câu mới');
    const rd = M.lines.filter(l => !l.dry).pop(), hv = castVoice('hai-huoc', 'vi', 'bac').voice;
    must(rd.role === 'hai-huoc' && rd.lang === 'vi' && rd.accent === 'bac' && rd.voice === hv && rd.state === 'normal' && rd.bubble === 'say' && /^Ối trời ơi/.test(rd.text), 'đọc mẫu gửi sai vai / ngôn ngữ / vùng / giọng: ' + JSON.stringify(rd));
    await pollq(async () => (await spy('say')).length === 1, 'phát clip vừa đọc'); must(M.fresh === 1 && M.today === 4, 'đúng 1 lượt');
    await pollq(async () => (await q.$$('.lc-insp [data-ai="play"]')).length === 1 && (await q.$$('tr[data-id="hai-huoc"] [data-ai="play"]')).length === 1, 'sau khi đọc: hàng + inspector chuyển thành ▶ AI (clip có sẵn)', 8000);
    // hết lượt: báo giờ thử lại, không phát, không khoá giao diện
    M.budget = 1; await q.click('tr[data-id="nu-hai-huoc"] td.id'); await pollq(async () => (await q.$$('.lc-insp [data-ai="read"]')).length === 1, 'nu-hai-huoc chưa có clip');
    await q.click('.lc-insp [data-ai="read"]'); await q.click('.lc-insp [data-ai="read"]');
    await q.waitForFunction(() => /Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}/.test(document.querySelector('.lc-insp').textContent), null, { timeout: 8000 });
    must(M.fresh === 1 && (await q.$$('.lc-insp [data-ai="read"]')).length === 1 && !(await q.$eval('.lc-insp [data-ai="read"]', e => e.disabled)), 'hết lượt: nút phải bấm lại được, không có clip mới'); M.budget = Infinity;
    // dry 404 (phiên bản server khác): vẫn coi là "chưa có clip"
    M.dry404 = true; await q.selectOption('#lvAccent', 'nam'); await pollq(async () => (await q.$$('tr[data-id] [data-ai="read"], tr[data-id] [data-ai="play"]')).length === 22, 'kiểm lại 22 hàng (dry 404)', 10000);
    must((await q.$$('tr[data-id="hai-huoc"] [data-ai="read"]')).length === 1, 'dry 404 phải hiểu là chưa có clip'); M.dry404 = false; await q.selectOption('#lvAccent', 'bac');
    console.log('  ✓ Thư viện › Giọng (có key): cast mỗi vai một lần, kiểm clip mẫu bằng dry (không tốn lượt) · ▶ AI phát clip có sẵn · đổi ngôn ngữ / vùng → cast + câu mẫu đổi (vi · en Mỹ/Anh · zh Đài · yue Hồng Kông) · "Đọc mẫu bằng AI (1 lượt)" báo trước, bấm 2 lần, gửi đúng role / lang / accent / giọng · hết lượt báo giờ thử lại');

    // B3) thiết kế giọng: vai trẻ em bị chặn kèm lý do; vai khác bấm 2 lần mới tốn lượt, xong thì cast đổi sang giọng thiết kế
    await q.click('tr[data-id="be-gai"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("be-gai")');
    must(await q.$eval('#lvDesign', e => e.disabled) && /Google không cho thiết kế giọng trẻ em/.test(await q.textContent('[data-why="design"]')), 'vai trẻ em phải mờ nút thiết kế kèm lý do');
    must(/vai trẻ em: không thiết kế được/.test(await q.textContent('.lc-insp .lc-kv')), 'vai trẻ em: chân dung phải ghi không thiết kế được');
    await q.click('tr[data-id="quan-su"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("quan-su")'); await q.waitForFunction(() => { const b = document.getElementById('lvDesign'); return b && !b.disabled; });
    await q.click('#lvDesign'); must(/tốn 1 lượt/.test(await q.textContent('#lvDesign')) && M.designCalls.length === 0, 'thiết kế: lần bấm 1 chỉ xác nhận');
    await q.evaluate(SPY); await q.click('#lvDesign'); await pollq(async () => M.designCalls.length === 1, 'đã gọi thiết kế');
    must(M.designCalls[0].role === 'quan-su' && M.designCalls[0].lang === 'vi' && M.designCalls[0].accent === 'bac', 'thiết kế gửi sai: ' + JSON.stringify(M.designCalls[0]));
    await pollq(async () => /voice_gia_quan-su_bac/.test(await q.textContent('[data-cast="quan-su"]')), 'cast chuyển sang giọng thiết kế', 8000);
    must(/voice_gia_quan-su_bac/.test(await q.textContent('tr[data-id="quan-su"]')) && /Thiết kế lại giọng cho vai này/.test(await q.textContent('#lvDesign')), 'thiết kế xong: hàng + nút phải đổi'); await pollq(async () => (await spy('say')).length >= 1, 'nghe thử mẫu thiết kế');
    // nhân vật dùng vai (trong dự án Tam Quốc): Quan Vũ + Trương Phi dùng võ tướng
    await q.click('tr[data-id="vo-tuong"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("vo-tuong")');
    const users = await q.$$eval('.lv-chars button', es => es.map(e => e.getAttribute('data-char')));
    must(users.slice().sort().join() === 'local.my/tq-quan-vu,local.my/tq-truong-phi', 'nhân vật dùng vai võ tướng trong Tam Quốc: ' + users.join()); must(/Tam Quốc/.test(await q.textContent('.lc-insp')), 'inspector phải nói dự án đang lọc');
    must(/Quan Vũ/.test(await q.textContent('tr[data-id="vo-tuong"]')) && /Trương Phi/.test(await q.textContent('tr[data-id="vo-tuong"]')), 'cột "Nhân vật dùng vai" thiếu tên');
    await q.fill('#lvQ', 'ong lao'); await waitRows(1); must((await rowsOf())[0] === 'ong-lao', 'tìm không dấu "ong lao"'); await q.fill('#lvQ', 'quan vu'); await waitRows(1); must((await rowsOf())[0] === 'vo-tuong', 'tìm theo tên nhân vật (Quan Vũ) phải ra vai võ tướng');
    await q.fill('#lvQ', ''); await waitRows(22); await q.click('.lc-cats button[data-age="cao-tuoi"]'); await waitRows(2); await q.click('.lc-cats button[data-age="cao-tuoi"]'); await waitRows(22);
    await q.click('tr[data-id="ong-lao"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("ong-lao")'); await pollq(async () => (await q.$$('.lc-insp [data-ai="play"]')).length === 1, 'ong-lao: clip có sẵn trong inspector', 8000);
    await q.click('tr[data-id="vo-tuong"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("vo-tuong")'); await pollq(async () => (await q.$$('.lc-insp .lv-chars button')).length === 2, 'vo-tuong: 2 nhân vật Tam Quốc', 8000); await q.waitForTimeout(500);
    await shot('voices-bang');
    console.log('  ✓ Thư viện › Giọng › thiết kế: vai trẻ em mờ nút kèm lý do Google chặn · thiết kế bấm 2 lần, gửi đúng vai / ngôn ngữ / vùng, cast + hàng đổi sang giọng thiết kế · nhân vật Tam Quốc dùng vai (Quan Vũ, Trương Phi → võ tướng) · lọc tuổi + tìm không dấu'); await q.close();

    // B4) CNS-106: tab "Giọng của dự án / tác phẩm" đã chuyển vào phòng tác phẩm (Tạo tác › tab Giọng & âm thanh) — Thư viện › Giọng chỉ còn bộ giọng vai + cột "Nhân vật dùng vai" + liên kết sang phòng làm phim
    await open({ page: 'lib-voices', project: PROJ }); await waitRows(22);
    must(!(await q.$('.lc-tabs')) && !(await q.$('#lvWork')) && !(await q.$('#lvCastAll')) && !/Giọng của dự án/.test(await q.textContent('#view')), 'Thư viện › Giọng không được còn tab / ô chọn tác phẩm / nút "Chốt giọng cả dàn"');
    must(/Nhân vật dùng vai/.test(await q.textContent('.lc-t thead')) && /Quan Vũ/.test(await q.textContent('tr[data-id="vo-tuong"]')), 'còn cột "Nhân vật dùng vai" (nhân vật trong dự án dùng vai)');
    await q.click('#lvRoom');   // dự án Tam Quốc có đúng một tác phẩm → mở thẳng phòng làm phim, tab Giọng & âm thanh
    await q.waitForURL(/\/tao-tac/, { timeout: 10000 }); await q.waitForSelector('#wpanel-voice:not([hidden])', { timeout: 10000 });
    must(q.url().endsWith('#/tac-pham/' + WORK + '/voice'), 'liên kết phải mở đúng phòng + tab Giọng & âm thanh: ' + q.url());
    await q.close();
    // tuyến lưu từ bản trước (tab "works" của Thư viện › Giọng): mở đúng phòng làm phim, quên tab cũ — không nảy lại lần sau
    q = await ctx11.newPage(); q.on('pageerror', e => errs11.push(e.message));
    await q.goto(URL11 + 'VERSION'); await q.evaluate(([r, pj]) => { localStorage.setItem('gc-route-thu-vien', JSON.stringify(r)); localStorage.setItem('gc-last-project', pj); localStorage.setItem('gc-dock', JSON.stringify({ open: false })); }, [{ page: 'lib-voices', tab: 'works', work: WORK, project: PROJ }, PROJ]);
    await q.goto(URL11 + 'thu-vien'); await q.waitForURL(/\/tao-tac/, { timeout: 10000 }); await q.waitForSelector('#wpanel-voice:not([hidden])', { timeout: 10000 });
    const oldRoute = await q.evaluate(() => JSON.parse(localStorage.getItem('gc-route-thu-vien')));
    must(oldRoute.page === 'lib-voices' && !oldRoute.tab && !oldRoute.work, 'tuyến cũ của Thư viện phải được dọn (không còn tab / work): ' + JSON.stringify(oldRoute));
    console.log('  ✓ Thư viện › Giọng (CNS-106): không còn tab "Giọng của dự án / tác phẩm" · còn cột "Nhân vật dùng vai" + liên kết "Chốt giọng cho tác phẩm › phòng làm phim" mở đúng tab Giọng & âm thanh · tuyến cũ (tab works) mở đúng phòng và được dọn'); await q.close();

    // B5) CNS-106: giọng của TÁC PHẨM chốt ở phòng làm phim (Tạo tác › tác phẩm › tab Giọng & âm thanh) — MỘT bảng: nhân vật → vai → giọng chốt (work.voices) · nguồn · ▶ máy / AI · Chốt giọng cả dàn
    // (các điều kiện của tab "Giọng của dự án / tác phẩm" cũ ở Thư viện, nay kiểm ở phòng; "không chọn tác phẩm thì không chốt được" = tác phẩm chưa có diễn viên thì nút mờ)
    const openRoom = async (work, tabName) => {
      q = await ctx11.newPage(); q.on('pageerror', e => errs11.push(e.message)); q.on('dialog', d => d.accept());
      await q.goto(URL11 + 'VERSION'); await q.evaluate(([pj]) => { localStorage.setItem('gc-last-project', pj); localStorage.setItem('gc-dock', JSON.stringify({ open: false })); }, [PROJ]);
      await q.goto(URL11 + 'tao-tac#/tac-pham/' + work + '/' + (tabName || 'voice')); await q.waitForFunction(() => window.GenChibi && /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
      await q.waitForSelector('#wpanel-voice:not([hidden])', { timeout: 8000 }); await q.evaluate(SPY); await q.evaluate(SPY_T); return q;
    };
    await openRoom(WORK);
    await pollq(async () => (await rowsOf()).length > 0 && /Alnilam/.test(await q.textContent('tr[data-id="tq-quan-vu"]')), 'bảng giọng chốt của tác phẩm', 8000);
    must((await q.$$('#wpanel-voice table')).length === 1 && !(await q.$('#wpanel-voice table.roles')), 'tab Giọng & âm thanh chỉ được có MỘT bảng giọng của tác phẩm');
    const wr = await rowsOf(); must(wr.includes('tq-quan-vu') && wr.includes('tq-luu-bi') && wr.includes('tq-tao-thao'), 'bảng tác phẩm thiếu nhân vật: ' + wr.join());
    must(/Võ tướng/.test(await q.textContent('tr[data-id="tq-quan-vu"]')) && /Đã chốt/.test(await q.textContent('tr[data-id="tq-quan-vu"]')) && /Schedar/.test(await q.textContent('tr[data-id="tq-luu-bi"]')), 'cột vai / giọng chốt sai');
    must(/Chưa chốt/.test(await q.textContent('tr[data-id="tq-tao-thao"]')), 'nhân vật chưa chốt phải ghi "Chưa chốt"');
    must(/Ngôn ngữ phim: Tiếng Việt/.test(await q.textContent('#wvLangNote')), 'thiếu ngôn ngữ phim');
    must(/Câu thoại/.test(await q.textContent('.lc-t thead')), 'bảng gộp phải giữ cột "Câu thoại" của bảng giọng chốt cũ');
    await q.evaluate(SPY); await q.click('tr[data-id="tq-quan-vu"] [data-machine]'); const sw = (await spy('say'))[0]; must(sw && sw.role === 'vo-tuong' && /^Ta là đại tướng/.test(sw.text), '▶ giọng máy nhân vật tác phẩm: ' + JSON.stringify(sw));
    await pollq(async () => (await q.$$('tr[data-id="tq-quan-vu"] [data-ai="read"], tr[data-id="tq-quan-vu"] [data-ai="play"]')).length === 1, 'kiểm clip của Quan Vũ'); must(M.lines.some(l => l.voice === 'Alnilam' && l.role === 'vo-tuong' && l.dry === true && l.lang === 'vi'), 'kiểm clip phải dùng giọng chốt Alnilam (dry)');
    must(await q.$eval('tr[data-id="tq-tao-thao"] [data-ai]', e => e.disabled), 'nhân vật chưa chốt giọng: nút giọng AI mờ');
    await q.click('tr[data-id="tq-quan-vu"] td.id'); await q.waitForSelector('.lc-insp h3 .mono:text-is("tq-quan-vu")'); await shot('phong-giong-am-thanh');
    await shot('phong-giong-chot-bang', '#wpanel-voice .lc');
    must(!(await q.$eval('#wvCastAll', e => e.disabled)), 'có diễn viên: nút "Chốt giọng cả dàn" phải bấm được');
    const nCast5 = M.casts.length; await q.evaluate(SPY_T); await q.click('#wvCastAll');
    await pollq(async () => M.casts.length > nCast5 && /Chốt giọng cả dàn \(miễn phí\)/.test(await q.textContent('#wvCastAll')), 'chốt giọng cả dàn xong');
    const cast5 = M.casts[M.casts.length - 1];
    must(cast5.work === WORK && cast5.lang === 'vi' && cast5.accent === 'bac' && cast5.actors.length === (await rowsOf()).length && cast5.actors.length >= 3, 'chốt giọng cả dàn phải gửi work + cả dàn của tác phẩm: ' + JSON.stringify([cast5.work, cast5.actors.length]));
    must((await toasts()).some(t => /Đã chốt giọng cho \d+ nhân vật của/.test(t)), 'thiếu toast chốt giọng cả dàn');
    // đổi ngôn ngữ phim: bảng đọc work.voices của ngôn ngữ đó (en|us chưa chốt gì); về lại vi|bac thì giọng chốt trở lại
    await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'en|us'); await pollq(async () => /Anh|English/.test(await q.textContent('#wvLangNote')) && /Chưa chốt/.test(await q.textContent('tr[data-id="tq-quan-vu"]')), 'đổi ngôn ngữ phim: bảng đọc giọng chốt của ngôn ngữ đó');
    must(await q.$eval('tr[data-id="tq-quan-vu"] [data-ai]', e => e.disabled), 'ngôn ngữ chưa chốt: nút AI mờ');
    await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|bac'); await pollq(async () => /Alnilam/.test(await q.textContent('tr[data-id="tq-quan-vu"]')), 'về tiếng Việt: giọng chốt trở lại');
    // bộ giọng vai (nghe / thiết kế) chỉ ở Thư viện › Giọng: liên kết dẫn tới đó
    await q.click('#wvToLib'); await q.waitForURL(/\/thu-vien/, { timeout: 10000 }); await waitRows(22); must(/Giọng/.test(await q.textContent('.crumbs')), 'liên kết "Bộ giọng vai ›" phải mở Thư viện › Giọng');
    await q.close();
    // tác phẩm chưa có diễn viên: không có gì để chốt → nút mờ + dòng nhắc, không bảng
    const emptyW = await fetch(URL11 + 'api/works', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ id: 'trong-giong', title: 'Tác phẩm trống', project: PROJ }) }).then(r => r.json());
    await openRoom(emptyW.id); await q.waitForSelector('#wvEmpty:not([hidden])');
    must(await q.$eval('#wvCastAll', e => e.disabled) && !(await q.isVisible('#wpanel-voice .lc-t')), 'tác phẩm chưa có diễn viên: nút "Chốt giọng cả dàn" mờ, không có bảng');
    console.log('  ✓ Phòng tác phẩm › Giọng & âm thanh (CNS-106): MỘT bảng giọng chốt — nhân vật → vai → giọng chốt (work.voices) · nguồn (Đã chốt / Chưa chốt) · cột Câu thoại · ▶ máy + ▶ AI dùng đúng giọng đã chốt (dry) · chưa chốt thì nút AI mờ · "Chốt giọng cả dàn (miễn phí)" gửi work + cả dàn, toast, đọc lại work.voices · đổi ngôn ngữ phim → bảng theo ngôn ngữ đó · liên kết sang Thư viện › Giọng · tác phẩm chưa có diễn viên thì nút mờ'); await q.close();

    must(M.leaks.length === 0, 'có yêu cầu ra ngoài máy: ' + M.leaks.slice(0, 3).join(' | '));
    must(errs11.length === 0, 'lỗi trang: ' + errs11.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ Thư viện Âm thanh / Giọng:', e.message); if (errs11.length) console.log('    lỗi trang:', errs11.slice(0, 3).join(' | ')); if (q) { try { console.log('    trang:', (await q.evaluate(() => (document.querySelector('.view') || document.body).innerText)).replace(/\s+/g, ' ').slice(0, 500)); } catch (e2) { /* trang đã đóng */ } } }
  finally { await b11.close(); srv11.kill(); }
}
// Giọng AI theo vai (v0.17): Cài đặt AI (dán key → tự bật; chỉ còn cài đặt) · bộ giọng vai ở Thư viện › Giọng (22 vai, vai trẻ em không thiết kế được — nơi duy nhất, CNS-106) · ô ngôn ngữ phim lưu vào tác phẩm ·
// Lồng tiếng AI (đủ câu, dừng đúng khi hết lượt) · bộ phát dùng clip và rơi về giọng máy khi clip lỗi · phim xuất có giọng AI nhúng, chạy file:// không gọi mạng ·
// Hồ sơ nhân vật (vai · giọng vùng · giọng AI; cao độ / tốc độ chỉ ghi khi đã kéo). TUYỆT ĐỐI không gọi Google: mọi api/voice/* bị chặn và trả lời giả bằng page.route,
// mọi địa chỉ ngoài máy bị chặn và đếm. GC_SHOTS=<thư mục> → chụp màn hình các màn chính.
if (want('voice')) {
  const fs = require('fs'), crypto = require('crypto'), GV = require('../engine/voices.js');
  const home10 = mkdtempSync(path.join(tmpdir(), 'gc-')), PORT10 = 7660, URL10 = 'http://localhost:' + PORT10 + '/', SHOTS = process.env.GC_SHOTS || '';
  const srv10 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home10, GC_PORT: String(PORT10), GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await up(PORT10);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  const b10 = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
  const ctx10 = await b10.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const WORK = 'mau-ngay-dau-di-lam', HDR = { 'Content-Type': 'application/json', 'X-GC-Request': '1' };
  // ---- giọng AI GIẢ: một "máy chủ Google" trong bộ nhớ ----
  const wav = (sec, hz) => { const rate = 24000, n = Math.round(rate * sec), b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * hz * i / rate) * Math.min(1, i / 600, (n - i) / 600)), 44 + i * 2); return b; };
  const WAV = wav(0.6, 220);
  const M = { good: 'AIzaSy-key-gia-0123456789abcdef', hasKey: false, off: false, keySource: '', today: 0, designs: {}, ids: new Set(), budget: Infinity, fresh: 0, calls: [], casts: [], puts: [], designCalls: [], failFn: null, clipFail: false, delay: 0, retryAt: new Date(Date.now() + 3600e3).toISOString(), leaks: [], workPosts: [],
    // hợp đồng server v0.17 (CNS-085 / 087 / 090): trần câu / ngày, giọng tạm hỏng, dàn vượt 48, thiết kế tuần tự có thể dừng ở 429
    dailyCap: 200, bad: [], missing: [], capHit: false, minute: null, designBudget: Infinity, designCap: false, designDelay: 0, designLive: 0, designPeak: 0 };
  const tomorrow = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.toISOString(); };   // 00:00 ngày mai giờ máy (retryAt của 429 do trần ngày)
  const cfgOf = () => ({ enabled: M.hasKey && !M.off, off: M.off, model: 'gemini-3.8-flash-tts', hasKey: M.hasKey, keySource: M.hasKey ? M.keySource : '', blocked: M.fresh >= M.budget ? [{ model: 'gemini-3.8-flash-tts', until: M.retryAt }] : [],
    today: M.today, cached: M.ids.size, keyUrl: 'https://aistudio.google.com/apikey', roles: GV.roleList(), langs: GV.langList(), designs: M.designs, dailyCap: M.dailyCap, bad: M.bad });
  const castOf = (lang, accent, actors) => {
    const taken = {}, out = {};
    actors.forEach(a => {
      const d = M.designs[a.role + '|' + lang + '|' + accent];
      if (a.voice) { out[a.id] = { voice: a.voice, source: 'chosen', label: a.voice + ' (đã chọn)' }; taken[a.voice] = 1; return; }
      if (d) { out[a.id] = { voice: d.voice, source: 'design', label: d.voice + ' (thiết kế)' }; return; }
      const c = GV.cast({ id: a.id, voice: { role: a.role } }, { lang, accent, taken }); taken[c.ai] = 1;
      out[a.id] = { voice: c.ai, source: 'prebuilt', label: c.ai + ' (có sẵn)' };
    });
    return out;
  };
  const idOf = b => crypto.createHash('sha1').update(JSON.stringify([b.voice, b.role, b.lang, b.accent, b.state, b.bubble, b.text])).digest('hex');
  await ctx10.route(/\/api\/voice(\/|\?|$)/, async route => {
    const req = route.request(), u = new URL(req.url()), m = req.method(), p = u.pathname.replace(/^\/api\/voice/, '') || '/', body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, o) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(o) });
    if (p === '/' && m === 'GET') return json(200, cfgOf());
    if (p === '/' && m === 'PUT') {
      M.puts.push(body);
      if (typeof body.apiKey === 'string') {
        if (body.apiKey !== M.good) return json(400, { error: 'Google từ chối key này — kiểm lại key (Google AI Studio › Get API key)' });
        M.hasKey = true; M.keySource = 'voice'; M.off = false;
        return json(200, { ...cfgOf(), models: ['gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'] });
      }
      if (typeof body.enabled === 'boolean') M.off = !body.enabled;
      if (body.clearKey) { M.hasKey = false; M.keySource = ''; }
      if (typeof body.dailyCap === 'number') M.dailyCap = body.dailyCap;
      if (body.clearBad === true) M.bad = [];
      return json(200, cfgOf());
    }
    if (p === '/cast' && m === 'POST') { M.casts.push(body); return json(200, Object.assign({ cast: castOf(body.lang, body.accent, body.actors || []) }, body.work && M.missing.length ? { missing: M.missing } : {})); }
    if (p === '/library' && m === 'GET') {
      const l = u.searchParams.get('lang');
      return json(200, { voices: [{ id: 'lib-' + l + '-minh', name: 'Minh', gender: 'm', age: 35, pitch: 0.9, description: 'trầm, ấm', source: 'library' }, { id: 'lib-' + l + '-lan', name: 'Lan', gender: 'f', age: null, pitch: 1.1, description: 'trong, nhẹ', source: 'library' },
        { id: 'Charon', name: 'Charon', gender: 'm', age: null, pitch: 1, description: 'trầm, rõ', source: 'prebuilt' }] });
    }
    if (p === '/design' && m === 'POST') {
      M.designCalls.push(body);
      if (['be-trai', 'be-gai', 'thieu-nien', 'thieu-nu'].includes(body.role)) return json(400, { error: 'Google chặn thiết kế giọng trẻ em (chính sách an toàn)' });
      if (M.designBudget < 1) return M.designCap ? json(429, { error: 'Đã chạm trần câu / ngày', retryAt: tomorrow(), cap: true }) : json(429, { error: 'Hết lượt thiết kế giọng hôm nay', retryAt: M.retryAt });
      M.designBudget--; M.designLive++; M.designPeak = Math.max(M.designPeak, M.designLive);
      if (M.designDelay) await new Promise(r => setTimeout(r, M.designDelay));
      M.designLive--;
      const voice = 'design-' + body.role, id = crypto.createHash('sha1').update('design' + voice).digest('hex');
      M.designs[body.role + '|' + body.lang + '|' + body.accent] = { voice, at: new Date().toISOString() }; M.ids.add(id);
      return json(200, { voice, preview: 'api/voice/clip/' + id + '.wav', role: body.role, lang: body.lang, accent: body.accent });
    }
    if (p === '/line' && m === 'POST') {
      M.calls.push(body);
      const id = idOf(body), st = M.failFn && M.failFn(body);
      if (st) return json(st, { error: 'mock: lỗi giả ' + st });
      if (M.ids.has(id)) return json(200, { id, cached: true, seconds: 0.6, voice: body.voice, url: 'api/voice/clip/' + id + '.wav' });
      if (body.dry) return json(404, { error: 'Câu này chưa đọc bằng giọng AI' });
      if (!M.hasKey || M.off) return json(409, { error: 'Giọng AI đang tắt (Cài đặt AI › Giọng AI)' });
      if (M.capHit) return json(429, { error: 'Đã chạm trần ' + M.dailyCap + ' câu hôm nay', retryAt: tomorrow(), cap: true });
      if (M.fresh >= M.budget) return json(429, { error: 'Hết lượt đọc giọng hôm nay', retryAt: M.retryAt });
      // giới hạn MỖI PHÚT giả (CNS-098): sau `after` câu mới thì 429 kèm retryAt = now + ms (ms epoch nếu numeric, ISO nếu không); tới giờ thì cho qua; `episodes` = số đợt; stuck = 429 mãi
      const mn = M.minute;
      if (mn && M.fresh >= mn.after && (mn.stuck || mn.episodes > 0)) {
        if (mn.stuck || !mn.until) mn.until = Date.now() + mn.ms;
        if (mn.stuck || Date.now() < mn.until) { mn.hits++; return json(429, { error: 'mock: Google giới hạn mỗi phút', retryAt: mn.numeric ? mn.until : new Date(mn.until).toISOString() }); }
        mn.episodes--; mn.until = 0;
      }
      if (M.delay) await new Promise(r => setTimeout(r, M.delay));
      M.fresh++; M.today++; M.ids.add(id);
      return json(200, { id, cached: false, seconds: 0.6, voice: body.voice, url: 'api/voice/clip/' + id + '.wav' });
    }
    if (p.startsWith('/clip/') && m === 'GET') return M.clipFail ? json(500, { error: 'mock: clip hỏng' }) : route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV });
    return json(404, { error: 'mock: chưa có ' + m + ' ' + p });
  });
  // tác phẩm lưu ngôn ngữ: server thật (Gen đang hoàn thiện) có thể chưa lưu lang / accent → lớp phủ giữ hộ để UI kiểm được; thiếu thật thì in ghi chú bên dưới
  const LANGMEM = {};
  await ctx10.route(/\/api\/works(\/[a-z0-9-]+)?(\?.*)?$/, async route => {
    const req = route.request(), body = req.method() === 'POST' && req.postData() ? JSON.parse(req.postData()) : null;
    if (body && body.lang) { LANGMEM[body.id] = { lang: body.lang, accent: body.accent }; M.workPosts.push(body); }
    const r = await route.fetch();
    let j; try { j = await r.json(); } catch (e) { return route.fulfill({ response: r }); }
    if (j && !Array.isArray(j) && j.id && LANGMEM[j.id] && !j.lang) Object.assign(j, LANGMEM[j.id]);
    return route.fulfill({ response: r, json: j });
  });
  // mọi địa chỉ ngoài máy bị chặn (không bao giờ ra Google)
  await ctx10.route(u => !/^(http:\/\/localhost:|file:|data:|blob:|about:)/.test(u.href), route => { M.leaks.push(route.request().url()); return route.abort(); });
  const errs10 = [], pg = async (page, route, app) => {
    app = app || 'tao-tac';
    page.on('pageerror', e => errs10.push(e.message));
    await page.goto(URL10 + app); await page.waitForFunction(() => window.GenChibi && /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
    if (route) { await page.waitForSelector('.nav-item', { timeout: 8000 });   // go() đầu tiên ghi tuyến vào localStorage SAU khi verChip hiện — đợi nó xong rồi mới đặt tuyến
      await page.evaluate(([k, r]) => localStorage.setItem(k, JSON.stringify(r)), ['gc-route-' + app, route]); await page.goto(URL10 + app); await page.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 }); }
    return page;
  };
  // chờ một điều kiện phía Node (selector kiểu Playwright dùng được) — waitForFunction chỉ hiểu CSS thuần
  const poll = async (fn, what, ms) => { const t = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch (e) { /* chưa có */ } if (v) return v; if (Date.now() - t > (ms || 6000)) throw new Error('hết giờ chờ: ' + what); await q.waitForTimeout(80); } };
  const SPY_A = `(() => { const A = window.GenChibi.audio; if (A.__spy) return; const orig = A.say; A.__spy = [];
    A.say = function (text, voice, hooks) { const h = hooks || {}, c = h.clip;
      A.__spy.push({ text, lang: voice && voice.lang, gender: voice && voice.gender, role: voice && voice.role, needGood: !!(voice && voice.needGood), clip: c ? (typeof c === 'string' ? 'str:' + c.slice(0, 22) : 'buf:' + (c.byteLength || 0)) : null, t: Date.now() });
      if (window.__realSay) return orig.apply(A, arguments);
      return new Promise(r => setTimeout(r, 80)); }; })()`;
  const SPY_T = `(() => { window.__toasts = []; new MutationObserver(() => { const t = document.getElementById('toast'); if (t && !t.hidden) window.__toasts.push(t.textContent); }).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true, attributes: true }); })()`;
  const spyOn = async page => { await page.evaluate(SPY_A); await page.evaluate(SPY_T); };
  const shot = async (page, name, sel) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const o = { path: path.join(SHOTS, name + '.png') }; if (sel) await page.locator(sel).first().screenshot(o); else await page.screenshot(o); };
  const toasts = page => page.evaluate(() => window.__toasts.slice());
  let q = null;
  try {
    // ---- 0) dựng dữ liệu: bộ Văn phòng vui + một nhân vật CHƯA có giọng (thử thanh trượt theo vai) ----
    const boot = await pg(await ctx10.newPage(), null);
    await boot.evaluate(async ([H]) => {
      const bn = await fetch('studio/mau/van-phong-vui.json').then(r => r.json());
      let r = await fetch('api/projects/import', { method: 'POST', headers: H, body: JSON.stringify({ bundle: bn, overwrite: true }) }); if (!r.ok) throw new Error('nhập bộ mẫu ' + r.status);
      const a = JSON.parse(JSON.stringify(window.GenChibi.ASSETS['gen.khung/ma-no-canh']));
      Object.assign(a, { id: 'ci-giong', pack: 'local.my', name: 'Bà Tám', role: 'Hàng xóm', persona: 'bà lão hay nói', status: 'draft' }); delete a.key; delete a.voice;
      r = await fetch('api/assets/local.my/ci-giong', { method: 'PUT', headers: H, body: JSON.stringify(a) }); if (!r.ok) throw new Error('lưu nhân vật thử ' + r.status);
    }, [HDR]);
    await boot.close();
    const probe = await fetch(URL10 + 'api/works', { method: 'POST', headers: HDR, body: JSON.stringify({ id: WORK, lang: 'en', accent: 'uk' }) }).then(() => fetch(URL10 + 'api/works/' + WORK, { headers: HDR })).then(r => r.json());
    const serverKeepsLang = probe.lang === 'en' && probe.accent === 'uk';
    await fetch(URL10 + 'api/works', { method: 'POST', headers: HDR, body: JSON.stringify({ id: WORK, lang: 'vi', accent: 'bac' }) });
    delete LANGMEM[WORK]; M.workPosts.length = 0;
    // ---- 0b) tải lại khi phòng tác phẩm còn đang tải (CI 2 vCPU, run 39719396085): fetch dở bị huỷ lúc rời trang → catch của loadWork
    //      ("lỗi → về danh sách") từng go() và ghi đè tuyến đã lưu → trang kế mở danh sách, không phải tác phẩm. Làm chậm GET tác phẩm cho chắc ca đó xảy ra.
    { const rp = await pg(await ctx10.newPage(), { page: 'works', work: WORK }); await rp.waitForSelector('.shot', { timeout: 10000 });   // tuyến đã lưu = phòng tác phẩm
      let slow = 0; await rp.route(u => new URL(u).pathname === '/api/works/' + WORK, async r => { slow++; await new Promise(x => setTimeout(x, 1500)); r.continue().catch(() => {}); });
      await pg(rp, { page: 'works', work: WORK });   // lần mở đầu của pg đang chờ GET tác phẩm (chậm) thì pg đặt tuyến + tải lại
      const got = await rp.waitForSelector('.shot', { timeout: 10000 }).then(() => 'work', async () => 'danh sách · tuyến đã lưu ' + await rp.evaluate(() => localStorage.getItem('gc-route-tao-tac')));
      if (slow < 2 || got !== 'work') throw new Error('tải lại khi tác phẩm còn đang tải phải mở lại đúng tác phẩm (fetch bị huỷ không được đè tuyến): ' + got + ' · GET chậm ' + slow);
      await rp.close(); console.log('  ✓ Tải lại khi phòng tác phẩm còn đang tải (GET chậm 1,5 s): mở lại đúng tác phẩm — fetch bị huỷ lúc rời trang không đè tuyến đã lưu'); }

    // ---- 1) Cài đặt AI › Giọng AI: dán key sai → lỗi rõ; đúng → tự bật ----
    q = await pg(await ctx10.newPage(), { page: 'ai' });
    await q.waitForSelector('#voice-panel input[type="password"]', { timeout: 8000 });
    const chip = () => q.textContent('#voice-panel .panel:first-child h3 .r');
    if (!/Chưa có key/.test(await chip())) throw new Error('chưa có key mà panel báo: ' + await chip());
    if (!/Gói miễn phí của Google rất ít lượt/.test(await q.textContent('#voice-panel'))) throw new Error('thiếu ghi chú gói miễn phí');
    await q.fill('#voice-panel input[type="password"]', 'sai-key-xxxxxxxxxxxxxxxxxxxx'); await q.click('#voice-panel button:text-is("Kết nối")');
    await q.waitForFunction(() => /Google từ chối key này/.test(document.querySelector('#voice-panel').textContent), null, { timeout: 5000 });
    if (!/Chưa có key/.test(await chip())) throw new Error('key sai mà panel đổi trạng thái');
    if (!M.puts.some(x => x.apiKey === 'sai-key-xxxxxxxxxxxxxxxxxxxx')) throw new Error('không gửi PUT api/voice { apiKey }');
    await q.fill('#voice-panel input[type="password"]', M.good); await q.click('#voice-panel button:text-is("Kết nối")');
    await q.waitForFunction(() => /Đã kết nối — 2 model đọc giọng/.test(document.querySelector('#voice-panel').textContent), null, { timeout: 5000 });
    if (!/Đã bật/.test(await chip())) throw new Error('đúng key mà chưa Đã bật: ' + await chip());
    const stText = await q.textContent('#voice-panel .kv');
    if (!/key: riêng/.test(stText) || !/hôm nay 0 \/ 200 câu/.test(stText) || !/0 câu đã lưu/.test(stText)) throw new Error('dòng trạng thái thiếu: ' + stText.slice(0, 200));
    if (await q.$eval('#voice-panel input[type="password"]', e => e.value) !== '') throw new Error('ô key không được xoá sau khi kết nối');
    if ((await q.content()).indexOf(M.good) >= 0) throw new Error('key lộ ra DOM');

    // ---- 2) Cài đặt AI chỉ còn CÀI ĐẶT (CNS-106): không bảng "Bộ giọng vai", không nút Thiết kế giọng — chỉ có liên kết sang Thư viện › Giọng ----
    if (await q.$('#voice-panel table') || await q.$('#voice-panel button[aria-label^="Thiết kế giọng"]') || await q.$('#voice-panel button:text-is("Thiết kế giọng")') || await q.$$eval('#voice-panel h3', es => es.some(e => /Bộ giọng vai/.test(e.textContent)))) throw new Error('Cài đặt AI không được còn bảng "Bộ giọng vai" / nút Thiết kế giọng (nơi duy nhất là Thư viện › Giọng)');
    if (!/Xem bộ giọng vai → Thư viện › Giọng/.test(await q.textContent('#voiceToLib'))) throw new Error('thiếu liên kết "Xem bộ giọng vai → Thư viện › Giọng"');
    await shot(q, 'panel-giong-ai', '#voice-panel'); await shot(q, 'cai-dat-giong');

    // ---- 2a) Thư viện › Giọng = nơi DUY NHẤT của bộ giọng vai: đủ 22 vai, vai trẻ em không thiết kế được (các điều kiện của bảng cũ ở Cài đặt AI, nay kiểm ở đây) ----
    await q.click('#voiceToLib'); await q.waitForSelector('.lc-t tbody tr[data-id]', { timeout: 10000 }); await spyOn(q);   // liên kết đổi ứng dụng (Tạo tác → Thư viện)
    await q.waitForFunction(() => document.querySelectorAll('.lc-t tbody tr[data-id]').length === 22, null, { timeout: 5000 });
    const ids = await q.$$eval('.lc-t tbody tr[data-id]', es => es.map(e => e.getAttribute('data-id')));
    if (ids.join() !== GV.roleList().map(r => r.id).join()) throw new Error('bảng thiếu / lệch vai: ' + ids.join());
    const kids10 = ['be-trai', 'be-gai', 'thieu-nien', 'thieu-nu'];
    const row = id => `.lc-t tbody tr[data-id="${id}"]`, pickRole = async id => { await q.click(row(id) + ' td.id'); await q.waitForFunction(r => { const t = document.querySelector('.lc-insp h3 .mono'); return !!t && t.textContent === r; }, id); };
    for (const r of ids) {   // nút Thiết kế giọng (ở Inspector của hàng) chỉ mờ với 4 vai trẻ em
      await pickRole(r);
      const dis = await q.$eval('#lvDesign', e => e.disabled);
      if (dis !== kids10.includes(r)) throw new Error('nút thiết kế của ' + r + ': disabled=' + dis);
    }
    await pickRole('be-gai');
    const tip = await q.$eval('#lvDesign', e => e.title);
    if (!/Google không cho thiết kế giọng trẻ em/.test(tip)) throw new Error('thiếu tooltip vai trẻ em: ' + tip);
    // giọng đang dùng: hỏi api/voice/cast với một diễn viên giả cho từng vai (22 lần), hiện tên giọng + nguồn
    const castsReady = () => q.waitForFunction(() => [...document.querySelectorAll('.lc-t tbody tr[data-id]')].filter(r => /có sẵn/.test(r.children[8].textContent)).length === 22, null, { timeout: 8000 });
    await castsReady();
    await poll(async () => (await q.$$('.lc-t tbody tr[data-id] [data-ai="play"], .lc-t tbody tr[data-id] [data-ai="read"]')).length === 22, 'kiểm clip mẫu (dry) của 22 hàng', 10000);
    const one = M.casts.filter(c => c.actors.length === 1 && c.actors[0].id === c.actors[0].role);
    if (one.length < 22 || !one.every(c => c.lang === 'vi' && c.accent === 'bac')) throw new Error('cast từng vai: ' + one.length);
    const nCalls0 = M.calls.length, nDes0 = M.designCalls.length, nonDryCalls = () => M.calls.filter(c => !c.dry);
    await q.click(row('vo-tuong') + ' [data-machine]'); await q.waitForTimeout(200);
    if (M.calls.length !== nCalls0) throw new Error('▶ giọng máy đọc không được gọi giọng AI');
    // ▶ AI: chưa có clip → ghi rõ tốn 1 lượt; bấm 2 lần mới đọc câu mẫu của vai, đúng ngôn ngữ + giọng vùng
    const aiBtn = row('vo-tuong') + ' [data-ai]';
    if (!/tốn 1 lượt/.test(await q.$eval(aiBtn, e => e.title))) throw new Error('▶ AI không ghi rõ tốn lượt');
    await q.click(aiBtn); await q.waitForTimeout(150);
    if (nonDryCalls().length !== 0) throw new Error('bấm ▶ AI lần 1 chỉ được báo trước, chưa đọc');
    await q.click(aiBtn); await q.waitForTimeout(500);
    const aiCall = nonDryCalls()[nonDryCalls().length - 1];
    if (nonDryCalls().length !== 1 || aiCall.role !== 'vo-tuong' || aiCall.lang !== 'vi' || aiCall.accent !== 'bac' || aiCall.text !== 'Ta là đại tướng của nước này! Kẻ nào dám tiến thêm một bước, chém!' || aiCall.dry) throw new Error('▶ AI gửi sai: ' + JSON.stringify(aiCall));
    // thiết kế giọng: POST api/voice/design { role, lang, accent }; xong → "Thiết kế lại" + nguồn "thiết kế"; ghi rõ ~25 giây + tốn 1 lượt, bấm 2 lần
    await pickRole('vo-tuong');
    const desTxt = await q.textContent('.lc-insp');
    if (!/~25 giây/.test(desTxt) || !/[Tt]ốn 1 lượt/.test(desTxt)) throw new Error('khu thiết kế không ghi ~25 giây + tốn lượt');
    await q.click('#lvDesign'); if (M.designCalls.length !== nDes0) throw new Error('thiết kế: lần bấm 1 chỉ được báo trước'); await q.click('#lvDesign');
    await poll(async () => /Thiết kế lại/.test(await q.textContent('#lvDesign')), 'nút Thiết kế lại');
    if (M.designCalls.length !== nDes0 + 1 || JSON.stringify(M.designCalls[nDes0]) !== JSON.stringify({ role: 'vo-tuong', lang: 'vi', accent: 'bac' })) throw new Error('thiết kế gửi sai: ' + JSON.stringify(M.designCalls));
    await poll(async () => { const t = await q.textContent(row('vo-tuong') + ' td:nth-child(9)'); return /thiết kế/.test(t) && /design-vo-tuong/.test(t); }, 'giọng thiết kế hiện ở ô giọng AI');
    // đổi ngôn ngữ + giọng vùng: cast hỏi lại theo ngôn ngữ mới
    await q.selectOption('#lvLang', 'en'); await q.waitForTimeout(200);
    if (await q.$$eval('#lvLang option', os => os.map(o => o.value).join()) !== GV.langList().map(l => l.id).join()) throw new Error('bảng bộ giọng phải lấy ngôn ngữ từ langList()');
    if (await q.$$eval('#lvAccent option', os => os.map(o => o.value).join()) !== GV.langList().find(l => l.id === 'en').accents.map(a => a.id).join()) throw new Error('giọng vùng tiếng Anh sai');
    await q.selectOption('#lvAccent', 'uk');
    await castsReady();
    if (!M.casts.some(c => c.lang === 'en' && c.accent === 'uk')) throw new Error('đổi ngôn ngữ mà cast không hỏi lại');
    if (/thiết kế/.test(await q.textContent(row('vo-tuong') + ' td:nth-child(9)'))) throw new Error('giọng thiết kế tiếng Việt không được dính sang tiếng Anh');
    await q.selectOption('#lvLang', 'vi'); await q.waitForTimeout(300);
    // tắt / bật (Cài đặt AI — cùng ứng dụng, không nạp lại trang)
    await q.click('.nav-item:has-text("Cài đặt AI")'); await q.waitForSelector('#voice-panel button:text-is("Tắt giọng AI")');
    await q.click('#voice-panel button:text-is("Tắt giọng AI")'); await q.waitForFunction(() => /Đã tắt/.test(document.querySelector('#voice-panel .panel h3 .r').textContent));
    await q.click('#voice-panel button:text-is("Bật giọng AI")'); await q.waitForFunction(() => /Đã bật/.test(document.querySelector('#voice-panel .panel h3 .r').textContent));
    if (JSON.stringify(M.puts.slice(-2)) !== JSON.stringify([{ enabled: false }, { enabled: true }])) throw new Error('tắt / bật gửi sai: ' + JSON.stringify(M.puts.slice(-2)));
    // key Gemini của AI đạo diễn dùng chung: nói rõ "đã dùng được, không cần dán"
    M.keySource = 'llm'; await q.reload(); await q.waitForSelector('#voice-panel .banner.acc', { timeout: 8000 });
    if (!/Đã dùng được key Gemini của AI đạo diễn — không cần dán thêm/.test(await q.textContent('#voice-panel .banner.acc')) || !/dùng chung key AI đạo diễn/.test(await q.textContent('#voice-panel .kv'))) throw new Error('key dùng chung không được nói rõ');
    M.keySource = 'voice';

    // ---- 2b) trần câu / ngày (Q13, CNS-090) · giọng tạm hỏng (CNS-087): cài đặt ở Cài đặt AI, báo lỗi khi nghe ở Thư viện › Giọng ----
    M.today = 0; await q.reload(); await q.waitForSelector('#voice-panel .kv'); await spyOn(q);   // (▶ AI ở trên đã đọc 1 câu mới: đếm lại từ 0 cho dòng "hôm nay N / trần")
    const capSel = '#voice-panel input[aria-label="Trần câu / ngày"]', capNum = () => q.$eval(capSel, e => e.value), capGo = () => q.click('#voice-panel button:text-is("Lưu trần")');
    const lastPut = () => JSON.stringify(M.puts[M.puts.length - 1]), statusTxt = () => q.textContent('#voice-panel .kv');
    if (await capNum() !== '200' || !/hôm nay 0 \/ 200 câu/.test(await statusTxt())) throw new Error('ô trần mặc định 200 + "hôm nay 0 / 200 câu": ' + await capNum() + ' · ' + (await statusTxt()).slice(0, 120));
    if (/giọng tạm hỏng/.test(await q.textContent('#voice-panel')) || await q.$('#voice-panel button:text-is("Thử lại giọng hỏng")')) throw new Error('không có giọng hỏng mà vẫn hiện dòng / nút');
    const nPut0 = M.puts.length;
    for (const v of ['-1', '5001', '1.5', '']) {   // sai: không gửi lên server, báo rõ khoảng hợp lệ
      await q.fill(capSel, v); await capGo();
      await q.waitForFunction(() => /Nhập số nguyên từ 0 đến 5000/.test(document.querySelector('#voice-panel').textContent), null, { timeout: 3000 });
    }
    if (M.puts.length !== nPut0) throw new Error('trần sai (-1 / 5001 / 1,5 / trống) mà vẫn gửi PUT: ' + lastPut());
    await q.fill(capSel, '120'); await q.press(capSel, 'Enter');   // Enter cũng lưu
    await q.waitForFunction(() => /hôm nay 0 \/ 120 câu/.test(document.querySelector('#voice-panel .kv').textContent), null, { timeout: 5000 });
    if (lastPut() !== '{"dailyCap":120}' || await capNum() !== '120') throw new Error('lưu trần 120: ' + lastPut() + ' · ô = ' + await capNum());
    await q.fill(capSel, '0'); await capGo();
    await q.waitForFunction(() => /hôm nay 0 câu \(không giới hạn\)/.test(document.querySelector('#voice-panel .kv').textContent), null, { timeout: 5000 });
    if (lastPut() !== '{"dailyCap":0}') throw new Error('trần 0 = không giới hạn: ' + lastPut());
    await q.fill(capSel, '200'); await capGo();
    await q.waitForFunction(() => /hôm nay 0 \/ 200 câu/.test(document.querySelector('#voice-panel .kv').textContent), null, { timeout: 5000 });
    // chạm trần: 429 { cap: true } → "Đã chạm trần 200 câu hôm nay (Cài đặt AI)" + giờ đọc tiếp (00:00 ngày mai); KHÁC thông điệp hết lượt của Google. Nghe ▶ AI ở Thư viện › Giọng (chưa có clip → bấm 2 lần)
    const hearAi = async id => { const b = row(id) + ' [data-ai="read"]'; await q.waitForSelector(b, { timeout: 10000 }); await q.click(b); await q.click(b); };
    M.today = 200; M.capHit = true; await q.reload(); await q.waitForSelector('#voice-panel .kv'); await spyOn(q);
    if (!/hôm nay 200 \/ 200 câu \(đã chạm trần\)/.test(await statusTxt())) throw new Error('đủ trần mà dòng trạng thái không nói: ' + (await statusTxt()).slice(0, 140));
    await q.click('#voiceToLib'); await q.waitForSelector('.lc-t tbody tr[data-id]');
    await hearAi('ong-lao');
    await poll(async () => (await toasts(q)).some(t => /Đã chạm trần 200 câu hôm nay \(Cài đặt AI\)/.test(t)), 'toast chạm trần');
    let capT = (await toasts(q)).filter(t => /chạm trần/.test(t));
    if (!/đọc tiếp lúc \d{2}:\d{2} \d{2}[\/-]\d{2}/.test(capT[0]) || (await toasts(q)).some(t => /Hết lượt|giới hạn mỗi phút/.test(t))) throw new Error('trần ngày phải có giờ đọc tiếp và KHÔNG được báo như hết lượt Google: ' + JSON.stringify(await toasts(q)));
    M.capHit = false; M.today = 0; M.budget = 0; await q.reload(); await q.waitForSelector('.lc-t tbody tr[data-id]'); await spyOn(q);   // hết lượt của Google (không cap)
    await hearAi('ba-lao');
    await poll(async () => (await toasts(q)).some(t => /^Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}/.test(t)), 'toast hết lượt Google (retryAt xa → "Hết lượt hôm nay")');
    if ((await toasts(q)).some(t => /chạm trần/.test(t))) throw new Error('hết lượt Google không được báo là chạm trần: ' + JSON.stringify(await toasts(q)));
    M.budget = Infinity;
    // giọng tạm hỏng: "M giọng tạm hỏng (tự thử lại sau 24 h)" + nút gỡ → PUT { clearBad: true }; xong thì Thư viện › Giọng (cùng phiên, không nạp lại trang) phải chọn lại giọng cả bộ
    const until = new Date(Date.now() + 24 * 3600e3).toISOString();
    M.bad = [{ voice: 'Charon', until }, { voice: 'design-vo-tuong', until }];
    await q.click('.nav-item:has-text("Cài đặt AI")'); await q.waitForSelector('#voice-panel .kv');
    if (!/2 giọng tạm hỏng \(tự thử lại sau 24 h\)/.test(await q.textContent('#voice-panel .kv')) || !await q.$('#voice-panel button:text-is("Thử lại giọng hỏng")')) throw new Error('thiếu dòng / nút giọng hỏng: ' + (await q.textContent('#voice-panel .kv')).slice(0, 200));
    const nCast2b = M.casts.length;
    await shot(q, 'panel-giong-ai-tran-va-hong', '#voice-panel .panel:first-child');
    await q.click('#voice-panel button:text-is("Thử lại giọng hỏng")');
    await q.waitForFunction(() => !/giọng tạm hỏng/.test(document.querySelector('#voice-panel').textContent), null, { timeout: 5000 });
    if (lastPut() !== '{"clearBad":true}' || M.bad.length) throw new Error('Thử lại giọng hỏng phải gửi PUT { clearBad: true }: ' + lastPut());
    await q.click('.nav-item:has-text("Giọng")'); await q.waitForSelector('.lc-t tbody tr[data-id]');
    await poll(async () => M.casts.length > nCast2b, 'cast tính lại sau khi gỡ giọng hỏng');
    if (!(await toasts(q)).some(t => /Đã gỡ dấu giọng hỏng/.test(t))) throw new Error('thiếu toast gỡ giọng hỏng');
    M.today = 0;
    // ghi chú giọng vùng trung thực ở Thư viện › Giọng (không còn ở Cài đặt AI)
    if (!/Giọng vùng chỉ có hiệu lực ở vai đã Thiết kế giọng; chưa thiết kế = giọng chung của ngôn ngữ\./.test(await q.textContent('#lvRegionNote'))) throw new Error('Thư viện › Giọng thiếu ghi chú giọng vùng chỉ có ở vai đã thiết kế');
    await q.close();
    console.log('  ✓ Cài đặt AI › Giọng AI chỉ còn cài đặt: dán key sai → lỗi rõ, đúng → "Đã kết nối — 2 model" + Đã bật (key không lộ ra trang) · dòng trạng thái · key dùng chung nói rõ không cần dán · tắt / bật · ô "Trần câu / ngày" (200 mặc định; -1 / 5001 / 1,5 / trống không gửi; Enter lưu; 0 = không giới hạn) + "hôm nay N / trần" · "2 giọng tạm hỏng (tự thử lại sau 24 h)" + nút "Thử lại giọng hỏng" gửi { clearBad: true } rồi Thư viện › Giọng chọn lại giọng · KHÔNG còn bảng "Bộ giọng vai", chỉ liên kết "Xem bộ giọng vai → Thư viện › Giọng" · Thư viện › Giọng (nơi duy nhất): 22 vai có ID, giọng AI đang dùng + nguồn, ▶ giọng máy không tốn lượt, ▶ AI ghi rõ tốn 1 lượt (bấm 2 lần), thiết kế → "Thiết kế lại", vai trẻ em mờ + tooltip · đổi ngôn ngữ hỏi lại cast · 429 cap → "Đã chạm trần 200 câu hôm nay (Cài đặt AI)" + giờ 00:00, khác "Hết lượt hôm nay" của Google · ghi chú giọng vùng chỉ có ở vai đã thiết kế');

    // ---- 3) Sân khấu final: ô ngôn ngữ phim lưu vào tác phẩm, áp ngay cho bộ phát ----
    M.hasKey = true; M.keySource = 'voice'; M.off = false; M.ids.clear(); M.fresh = 0; M.budget = Infinity; M.calls.length = 0; M.casts.length = 0;
    q = await pg(await ctx10.newPage(), { page: 'works', work: WORK });
    await q.waitForSelector('select[aria-label="Ngôn ngữ phim"]', { timeout: 8000 }); await q.waitForSelector('.shot');
    await spyOn(q);
    const langOpts = await q.$$eval('select[aria-label="Ngôn ngữ phim"] option', os => os.map(o => o.value + '|' + o.textContent));
    // danh sách lấy từ GC.voices.langList() (không giả định số ngôn ngữ: hiện vi · en · zh · yue) — thêm ngôn ngữ ở engine là ô chọn tự có
    const want = GV.langList().flatMap(l => l.accents.map(a => l.id + '|' + a.id + '|Ngôn ngữ: ' + l.label + ' · ' + a.label));
    if (want.length < 8 || langOpts.join(';') !== want.join(';')) throw new Error('ô ngôn ngữ phim: ' + langOpts.join(';') + ' ≠ ' + want.join(';'));
    if (await q.$eval('select[aria-label="Ngôn ngữ phim"]', e => e.value) !== 'vi|bac') throw new Error('mặc định phải là tiếng Việt · giọng Bắc');
    const regionLine = () => q.textContent('.usebar:has(button:text-is("Thiết kế giọng vùng cho các vai")) .note');   // Q14: giọng vùng thật chỉ có ở vai đã thiết kế
    await poll(async () => /^giọng vùng có ở \d+\/\d+ vai \(đã thiết kế\)/.test(await regionLine()), 'dòng "giọng vùng có ở N/M vai" của phim mẫu');
    const voiceModes = await q.$$eval('select[aria-label="Giọng nhân vật"] option', os => os.map(o => o.value + '|' + o.textContent));
    if (voiceModes.join(';') !== 'auto|Giọng: tự động;ai|Giọng: AI Google;tts|Giọng: máy đọc;blip|Giọng: blip kiểu game;off|Giọng: tắt') throw new Error('kiểu giọng: ' + voiceModes.join(';'));
    await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'en|uk'); await q.waitForTimeout(400);
    if (!M.workPosts.some(b => b.id === WORK && b.lang === 'en' && b.accent === 'uk')) throw new Error('chưa lưu ngôn ngữ vào tác phẩm: ' + JSON.stringify(M.workPosts));
    // chọn "AI Google" khi mới tải: đang có key nên không báo thiếu key
    await q.selectOption('select[aria-label="Giọng nhân vật"]', 'ai'); await q.waitForTimeout(300);
    if ((await toasts(q)).some(t => /Chưa có key giọng AI/.test(t))) throw new Error('có key mà báo thiếu key');
    if ((await q.evaluate(() => [localStorage.getItem('gc-audio'), GenChibi.audio.voiceMode]))[1] !== 'auto' || JSON.parse(await q.evaluate(() => localStorage.getItem('gc-audio'))).voice !== 'ai') throw new Error('kiểu "AI Google" phải nhớ là ai và ánh xạ sang auto của engine');
    // diễn phân cảnh 1 bằng tiếng Anh (Anh Anh): giọng trình duyệt dự phòng đúng en-GB (theo giọng vùng), clip AI gửi kèm, cast theo tiếng Anh
    await q.click('button:text-is("Diễn thử") >> nth=0');
    await q.waitForFunction(() => window.GenChibi.audio.__spy.length >= 4, null, { timeout: 60000 });
    await q.click('button:text-is("Dừng")');
    let spy = await q.evaluate(() => window.GenChibi.audio.__spy.slice());
    if (!spy.slice(0, 4).every(s => s.lang === 'en-GB')) throw new Error('giọng trình duyệt phải theo ngôn ngữ + giọng vùng của phim (en|uk → en-GB): ' + JSON.stringify(spy.map(s => s.lang)));
    if (!spy.slice(0, 4).every(s => s.clip && /^buf:\d{3,}/.test(s.clip))) throw new Error('kiểu AI Google mà bộ phát không dùng clip: ' + JSON.stringify(spy.map(s => s.clip)));
    const aiCalls = M.calls.filter(c => !c.dry);
    if (aiCalls.length < 4 || !aiCalls.every(c => c.lang === 'en' && c.accent === 'uk' && c.voice && c.role && c.text)) throw new Error('lời gọi api/voice/line sai: ' + JSON.stringify(aiCalls.slice(0, 2)));
    const cast0 = M.casts.find(c => c.actors.length > 1);   // (bỏ các cast một-diễn-viên còn sót của Thư viện › Giọng)
    if (!cast0 || cast0.lang !== 'en' || cast0.accent !== 'uk' || cast0.actors.length < 3 || !cast0.actors.every(a => GV.ROLES[a.role] && a.gender === GV.ROLES[a.role].gender)) throw new Error('cast cả dàn diễn viên sai: ' + JSON.stringify(cast0));
    // CNS-085: cast cả dàn LUÔN gửi `work` (server chốt giọng vào tác phẩm → Studio, MCP, phim xuất cùng một giọng); cast lẻ (Thư viện › Giọng, hồ sơ nhân vật) không thuộc tác phẩm nào thì không gửi
    if (cast0.work !== WORK || M.casts.some(c => c.actors.length > 1 && c.work !== WORK) || M.casts.some(c => c.actors.length === 1 && 'work' in c)) throw new Error('cast phải gửi work = id tác phẩm: ' + JSON.stringify(M.casts.map(c => [c.actors.length, c.work])));
    const castVoices = Object.values(castOf('en', 'uk', cast0.actors)).map(c => c.voice);
    if (new Set(castVoices).size !== castVoices.length) throw new Error('mỗi diễn viên phải một giọng khác nhau: ' + castVoices.join());
    // mọi câu của cảnh đã hỏi MỘT lần, kể cả câu chưa tới lượt (hỏi trước đầu phân cảnh)
    if (new Set(aiCalls.map(c => c.text)).size !== aiCalls.length) throw new Error('một câu hỏi server nhiều lần: ' + aiCalls.map(c => c.text).join(' | '));
    // reload: ngôn ngữ đã lưu vẫn còn (server thật lưu hoặc lớp phủ của test)
    await q.reload(); await q.waitForSelector('select[aria-label="Ngôn ngữ phim"]'); await q.waitForSelector('.shot');
    if (await q.$eval('select[aria-label="Ngôn ngữ phim"]', e => e.value) !== 'en|uk') throw new Error('tải lại mất ngôn ngữ phim');
    // tiếng Quảng Đông: lưu lang 'yue' + accent 'hk', có dòng gợi ý viết lời thoại bằng tiếng Quảng Đông (chữ phồn thể, 喺 / 咩 / 我哋); ngôn ngữ khác thì dòng chú thường
    const noteOf = () => q.textContent('.usebar:has(select[aria-label="Ngôn ngữ phim"]) .note');
    const noteVi = await noteOf();
    await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'yue|hk'); await q.waitForTimeout(400);
    if (!M.workPosts.some(b => b.id === WORK && b.lang === 'yue' && b.accent === 'hk')) throw new Error('chưa lưu yue / hk: ' + JSON.stringify(M.workPosts.slice(-2)));
    if (!/Quảng Đông/.test(await noteOf()) || !/喺/.test(await noteOf()) || !/咩/.test(await noteOf()) || !/我哋/.test(await noteOf())) throw new Error('thiếu gợi ý tiếng Quảng Đông: ' + await noteOf());
    await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|bac'); await q.waitForTimeout(300);
    if (await noteOf() !== noteVi) throw new Error('rời tiếng Quảng Đông mà gợi ý vẫn còn');
    console.log('  ✓ Sân khấu final: ô "Ngôn ngữ" lấy từ langList() (Việt Bắc / Nam / Trung · Anh Mỹ / Anh · Trung phổ thông / Đài Loan · Quảng Đông) lưu vào tác phẩm, Quảng Đông có dòng gợi ý chữ phồn thể + khẩu ngữ' + (serverKeepsLang ? ' (server lưu lang + accent)' : ' — GHI CHÚ: server hiện CHƯA lưu lang / accent của tác phẩm, test dùng lớp phủ') + ' · áp ngay cho bộ phát (giọng trình duyệt en-GB theo giọng vùng, cast + clip AI theo en/uk) · kiểu "Giọng: AI Google" ánh xạ sang auto của engine · cast cả dàn một lần, mỗi người một giọng · mỗi câu hỏi server một lần');

    // ---- 4) bộ phát: clip lỗi / hết lượt → rơi về giọng máy, MỘT thông báo; kiểu tự động chỉ lấy clip ĐÃ đọc (dry, không tốn lượt) ----
    const playN = async (n, ms) => { await q.evaluate(() => { window.GenChibi.audio.__spy.length = 0; window.__toasts.length = 0; }); await q.click('button:text-is("Diễn thử") >> nth=0'); await q.waitForFunction(k => window.GenChibi.audio.__spy.length >= k, n, { timeout: ms || 60000 }); await q.click('button:text-is("Dừng")'); return q.evaluate(() => window.GenChibi.audio.__spy.slice()); };
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q);   // bộ nhớ clip sạch
    M.ids.clear(); M.fresh = 0; M.budget = Infinity; M.calls.length = 0;
    M.failFn = b => (/^Ơ/.test(b.text) || /^Đến sớm/.test(b.text)) ? 500 : 0;   // hai câu của cảnh 1 hỏng
    await q.selectOption('select[aria-label="Giọng nhân vật"]', 'ai');
    spy = await playN(4);
    const noClip = spy.filter(s => !s.clip).map(s => s.text);
    if (noClip.length !== 2 || !noClip.every(t => /^Ơ|^Đến sớm/.test(t)) || spy.filter(s => s.clip).length !== 2) throw new Error('clip lỗi phải rơi về giọng máy (đúng 2 câu), còn lại có clip: ' + JSON.stringify(spy.map(s => [s.text.slice(0, 8), s.clip])));
    let tt = (await toasts(q)).filter(t => /Giọng AI lỗi/.test(t));
    if (tt.length !== 1) throw new Error('clip lỗi phải báo ĐÚNG MỘT toast, thấy ' + tt.length);
    M.failFn = null; M.clipFail = true; await q.reload(); await q.waitForSelector('.shot'); await spyOn(q);   // clip tải về hỏng (server báo có clip nhưng tải 500)
    spy = await playN(4);
    if (spy.some(s => s.clip)) throw new Error('tải clip hỏng mà vẫn đưa clip cho bộ phát: ' + JSON.stringify(spy.map(s => s.clip)));
    M.clipFail = false;
    // hết lượt: 2 câu đầu có giọng AI, rồi 429 → một toast có giờ thử lại, các câu sau giọng máy; sau 429 KHÔNG hỏi server thêm
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); M.ids.clear(); M.fresh = 0; M.budget = 2; M.calls.length = 0;
    spy = await playN(4);
    if (spy.filter(s => s.clip).length !== 2 || spy.filter(s => !s.clip).length !== 2) throw new Error('hết lượt: 2 câu có clip + 2 câu giọng máy, thấy ' + JSON.stringify(spy.map(s => !!s.clip)));
    tt = (await toasts(q)).filter(t => /Hết lượt/.test(t));
    if (tt.length !== 1 || !/^Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}/.test(tt[0]) || !/giọng máy đọc hoặc blip/.test(tt[0])) throw new Error('hết lượt: một toast kèm giờ thử lại, thấy ' + JSON.stringify(tt));
    const non429 = M.calls.filter(c => !c.dry).length;
    if (non429 > 4) throw new Error('hết lượt rồi vẫn hỏi server ' + non429 + ' lần');
    // phim đã có clip AI (2 câu đầu) → câu thiếu clip chỉ đọc bằng giọng máy hạng tốt, không thì blip: bộ phát bật needGood
    if (!spy.every(s => s.needGood)) throw new Error('kiểu AI Google, tác phẩm có clip AI: mọi câu phải needGood: ' + JSON.stringify(spy.map(s => [!!s.clip, s.needGood])));
    // kiểu "tự động": chỉ clip ĐÃ đọc (dry) — 2 câu đã đọc ở trên có giọng AI, câu còn lại không; không bao giờ gọi đọc mới, không toast
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); M.calls.length = 0; M.budget = Infinity; M.fresh = 0;
    await q.selectOption('select[aria-label="Giọng nhân vật"]', 'auto');
    spy = await playN(4);
    if (M.calls.length < 4 || !M.calls.every(c => c.dry === true)) throw new Error('kiểu tự động phải chỉ hỏi dry: ' + JSON.stringify(M.calls.map(c => !!c.dry)));
    if (spy.filter(s => s.clip).length !== 2) throw new Error('kiểu tự động: đúng 2 câu đã đọc có clip, thấy ' + spy.filter(s => s.clip).length);
    if ((await toasts(q)).length) throw new Error('kiểu tự động không được báo gì: ' + JSON.stringify(await toasts(q)));
    if (!spy.filter(s => !s.clip).length || !spy.every(s => s.needGood)) throw new Error('kiểu tự động + có clip AI: câu thiếu clip phải needGood (không rơi vào robot): ' + JSON.stringify(spy.map(s => [!!s.clip, s.needGood])));
    // máy đọc / blip / tắt: không đụng tới giọng AI
    await q.selectOption('select[aria-label="Giọng nhân vật"]', 'tts'); M.calls.length = 0; M.casts.length = 0;
    spy = await playN(2);
    if (M.calls.length || spy.some(s => s.clip)) throw new Error('kiểu máy đọc không được gọi giọng AI');
    if (spy.some(s => s.needGood)) throw new Error('chọn hẳn "máy đọc" thì KHÔNG được bật needGood (người dùng muốn TTS thì cứ đọc): ' + JSON.stringify(spy.map(s => s.needGood)));
    // tác phẩm CHƯA có clip AI nào (kiểu tự động): giọng máy như cũ, không needGood (toàn bộ là giọng máy thì không có gì để lẫn)
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); M.ids.clear(); M.calls.length = 0;
    await q.selectOption('select[aria-label="Giọng nhân vật"]', 'auto');
    spy = await playN(3);
    if (spy.some(s => s.clip || s.needGood)) throw new Error('chưa có clip AI nào: không clip, không needGood: ' + JSON.stringify(spy.map(s => [!!s.clip, s.needGood])));
    console.log('  ✓ Bộ phát: kiểu "AI Google" đọc từng câu bằng clip · clip lỗi / tải hỏng → giọng máy + đúng MỘT toast · hết lượt (429) → 2 câu AI rồi giọng máy, một toast "Hết lượt hôm nay — thử lại lúc", thôi hỏi server · kiểu "tự động" chỉ lấy clip đã đọc (dry), không tốn lượt, không toast · máy đọc không đụng tới giọng AI · needGood: bật khi (tự động | AI Google) + tác phẩm đã có clip AI, KHÔNG bật khi chọn máy đọc hoặc tác phẩm chưa có clip nào');

    // ---- 5) Lồng tiếng AI: đủ câu · câu đã có thì nhanh · dừng đúng khi 429 (báo giờ thử lại + số câu đã xong) · 409 mở Cài đặt AI ----
    const dubText = () => q.evaluate(() => [...document.querySelectorAll('.readybar')].map(e => e.textContent).filter(t => /Lồng tiếng AI \d/.test(t)).join('|'));
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|nam'); await q.waitForTimeout(300);
    M.ids.clear(); M.fresh = 0; M.budget = Infinity; M.calls.length = 0; M.today = 0;
    const dubB = 'button:text-is("Lồng tiếng AI")';
    if (await q.$eval(dubB, e => e.disabled)) throw new Error('có key mà nút Lồng tiếng AI mờ');
    await q.click(dubB);
    await q.waitForFunction(() => [...document.querySelectorAll('.readybar b')].some(b => /^Lồng tiếng AI \d+\/15$/.test(b.textContent)), null, { timeout: 8000 });
    await q.waitForFunction(() => /Xong 15\/15 câu/.test(document.body.textContent), null, { timeout: 30000 });
    if (!/Xong 15\/15 câu \(15 mới · 0 có sẵn\)/.test(await dubText())) throw new Error('lồng tiếng đủ câu: ' + await dubText());
    const dubCalls = M.calls.filter(c => !c.dry);
    if (dubCalls.length !== 15 || new Set(dubCalls.map(c => c.text)).size !== 15 || !dubCalls.every(c => c.lang === 'vi' && c.accent === 'nam')) throw new Error('lồng tiếng phải đọc đủ 15 câu, đúng ngôn ngữ / giọng vùng: ' + dubCalls.length);
    if (await q.$eval('.readybar span.meter[role="progressbar"]', e => e.parentElement.hidden || +e.getAttribute('aria-valuenow') !== 15 || +e.getAttribute('aria-valuemax') !== 15)) throw new Error('thanh tiến độ ẩn hoặc aria-valuenow / aria-valuemax sai');
    await shot(q, 'san-khau-final', '#wpanel-voice > .panel:first-child');
    // làm lại sau khi tải lại trang (bộ nhớ trình duyệt sạch): server báo cached → "15 có sẵn", nhanh, không tốn lượt
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|nam'); M.calls.length = 0; const fresh0 = M.fresh;
    await q.click(dubB); await q.waitForFunction(() => /Xong 15\/15 câu/.test(document.body.textContent), null, { timeout: 30000 });
    if (!/Xong 15\/15 câu \(0 mới · 15 có sẵn\)/.test(await dubText()) || M.fresh !== fresh0) throw new Error('lồng lại phải toàn câu có sẵn, không tốn lượt: ' + await dubText());
    // hết lượt giữa chừng: dừng đúng chỗ — 4 câu xong, câu thứ 5 gặp 429 rồi KHÔNG hỏi thêm; báo giờ thử lại + số câu đã xong
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|nam'); M.ids.clear(); M.fresh = 0; M.budget = 4; M.calls.length = 0;
    await q.click(dubB); await q.waitForFunction(() => /Hết lượt hôm nay/.test(document.body.textContent), null, { timeout: 30000 });
    if (!/Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}(?: \d{2}[\/.-]\d{2})? · đã lồng 4\/15 câu \(4 mới · 0 có sẵn\)/.test(await dubText()) || !/Lồng tiếng AI 4\/15/.test(await dubText())) throw new Error('báo hết lượt: ' + await dubText());
    await q.waitForTimeout(500);
    if (M.calls.filter(c => !c.dry).length !== 5) throw new Error('phải dừng ngay sau 429 (5 lời gọi), thấy ' + M.calls.filter(c => !c.dry).length);
    if (!(await toasts(q)).some(t => /^Hết lượt hôm nay — thử lại lúc/.test(t) && /Đã lồng 4\/15 câu/.test(t))) throw new Error('thiếu toast hết lượt');
    if (await q.$eval(dubB, e => e.disabled)) throw new Error('hết lượt xong nút phải bấm lại được (lượt sau đọc tiếp)');
    // còn lượt trở lại: đọc tiếp — 4 câu đã đọc là "có sẵn", 11 câu mới
    M.budget = Infinity; await q.click(dubB); await q.waitForFunction(() => /Xong 15\/15 câu/.test(document.body.textContent), null, { timeout: 30000 });
    if (!/Xong 15\/15 câu \(11 mới · 4 có sẵn\)/.test(await dubText())) throw new Error('đọc tiếp sau hết lượt: ' + await dubText());
    // bấm dừng giữa chừng
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|nam'); M.ids.clear(); M.fresh = 0; M.calls.length = 0; M.delay = 150;
    await q.click(dubB); await q.waitForFunction(() => /Lồng tiếng AI [1-9]\d?\/15/.test(document.body.textContent)); await q.click('button:text-is("Dừng lồng tiếng")');
    await q.waitForFunction(() => /Đã dừng · đã lồng \d+\/15 câu/.test(document.body.textContent), null, { timeout: 15000 });
    const nStop = M.calls.filter(c => !c.dry).length; await q.waitForTimeout(600); M.delay = 0;
    if (nStop >= 15 || M.calls.filter(c => !c.dry).length !== nStop) throw new Error('dừng lồng tiếng mà vẫn đọc tiếp');
    // 409 (key bị xoá / tắt giữa chừng): mở Cài đặt AI › Giọng AI, trỏ vào ô key
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|nam'); M.ids.clear(); M.fresh = 0;
    await q.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'Lồng tiếng AI'); return b && !b.disabled; });
    M.off = true; await q.click(dubB);
    await q.waitForSelector('#voice-panel', { timeout: 15000 });
    if ((await q.evaluate(() => JSON.parse(localStorage.getItem('gc-route-tao-tac')).page)) !== 'ai') throw new Error('409 phải mở Cài đặt AI');
    await q.waitForFunction(() => document.activeElement && document.activeElement.type === 'password', null, { timeout: 5000 });
    M.off = false;
    // chưa có key: nút mờ kèm lời nhắc + nút dẫn tới Cài đặt AI
    M.hasKey = false; await pg(q, { page: 'works', work: WORK }); await q.waitForSelector('.shot');
    await q.waitForFunction(() => /Chưa có key Google/.test(document.body.textContent), null, { timeout: 5000 });
    if (!(await q.$eval(dubB, e => e.disabled)) || !/Cần key Google/.test(await q.$eval(dubB, e => e.title))) throw new Error('chưa có key: nút Lồng tiếng AI phải mờ kèm lời nhắc');
    // chọn "AI Google" khi chưa có key: MỘT toast nhắc dán key, rồi phim vẫn chạy bằng giọng máy (không clip, không gọi đọc)
    await spyOn(q); M.calls.length = 0; await q.selectOption('select[aria-label="Giọng nhân vật"]', 'ai');
    await poll(async () => (await toasts(q)).some(t => /Chưa có key giọng AI — dán key ở Cài đặt AI › Giọng AI/.test(t)), 'toast nhắc dán key');
    spy = await playN(2);
    if (spy.some(s => s.clip) || M.calls.some(c => !c.dry) || (await toasts(q)).filter(t => /Giọng AI chưa sẵn sàng/.test(t)).length !== 1) throw new Error('chưa có key: phải rơi về giọng máy, đúng một toast, không gọi đọc: ' + JSON.stringify(await toasts(q)));
    await q.selectOption('select[aria-label="Giọng nhân vật"]', 'auto');
    await q.click('button:text-is("Dán key ở Cài đặt AI ›")'); await q.waitForSelector('#voice-panel');
    await q.waitForFunction(() => document.activeElement && document.activeElement.type === 'password', null, { timeout: 5000 });
    M.hasKey = true;
    console.log('  ✓ Lồng tiếng AI: thanh tiến độ "Lồng tiếng AI k/15" · đủ 15 câu đúng ngôn ngữ / giọng vùng · lồng lại toàn "có sẵn", không tốn lượt · hết lượt giữa chừng: dừng ngay sau 429 (4/15 xong), báo giờ thử lại, bấm lại đọc tiếp (11 mới + 4 có sẵn) · nút Dừng · 409 mở Cài đặt AI › Giọng AI trỏ vào ô key · chưa có key: nút mờ + lời nhắc');
    await q.close();

    // ---- 5b) CNS-098: Google giới hạn MỖI PHÚT (429 không cap, retryAt cách ≤ 2 phút) → KHÔNG dừng hẳn: "tự lồng tiếp lúc HH:MM:SS", chờ tới giờ rồi đọc tiếp CHÍNH câu đó; Dừng huỷ cả lúc chờ; tối đa 10 lần chờ ----
    q = await pg(await ctx10.newPage(), { page: 'works', work: WORK }); await q.waitForSelector('.shot'); await spyOn(q);
    const waitRe = 'Google giới hạn mỗi phút — tự lồng tiếp lúc \\d{2}:\\d{2}:\\d{2}';
    const resetDub = async () => { await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|nam'); await q.waitForTimeout(300); M.ids.clear(); M.fresh = 0; M.budget = Infinity; M.calls.length = 0; M.today = 0; M.capHit = false; M.minute = null; };
    const nonDry = () => M.calls.filter(c => !c.dry).length;
    // (a) 429 sau 4 câu, retryAt = now + 3 s (ms epoch): hiện giờ lồng tiếp, chờ, rồi đủ 15 câu — đúng MỘT lần 429, không toast lỗi
    await resetDub(); M.minute = { after: 4, ms: 3000, episodes: 1, hits: 0, until: 0, numeric: true };
    const tA = Date.now(); await q.click(dubB);
    await q.waitForFunction(re => new RegExp(re).test(document.body.textContent), waitRe, { timeout: 10000 });
    if (!/Lồng tiếng AI 4\/15/.test(await dubText()) || await q.$eval('button:text-is("Dừng lồng tiếng")', e => e.disabled)) throw new Error('đang chờ giới hạn mỗi phút: phải ở 4/15 và nút Dừng bấm được: ' + await dubText());
    await q.waitForFunction(() => /Xong 15\/15 câu/.test(document.body.textContent), null, { timeout: 30000 });
    if (!/Xong 15\/15 câu \(15 mới · 0 có sẵn\)/.test(await dubText()) || M.minute.hits !== 1 || Date.now() - tA < 2800 || nonDry() !== 16) throw new Error('lồng tiếp sau giới hạn mỗi phút: ' + await dubText() + ' · 429 ×' + M.minute.hits + ' · ' + nonDry() + ' lời gọi · ' + (Date.now() - tA) + ' ms');
    if ((await toasts(q)).some(t => /Hết lượt|Google giới hạn|Dừng/.test(t))) throw new Error('giới hạn mỗi phút tự qua không được toast lỗi: ' + JSON.stringify(await toasts(q)));
    // (b) bấm Dừng khi đang chờ: huỷ ngay (không đợi hết giờ), không đọc thêm
    await resetDub(); M.minute = { after: 2, ms: 20000, episodes: 1, hits: 0, until: 0 };
    await q.click(dubB); await q.waitForFunction(re => new RegExp(re).test(document.body.textContent), waitRe, { timeout: 10000 });
    const tB = Date.now(); await q.click('button:text-is("Dừng lồng tiếng")');
    await q.waitForFunction(() => /Đã dừng · đã lồng 2\/15 câu/.test(document.body.textContent), null, { timeout: 5000 });
    if (Date.now() - tB > 3000) throw new Error('Dừng khi đang chờ giới hạn mỗi phút phải huỷ ngay, mất ' + (Date.now() - tB) + ' ms');
    await q.waitForTimeout(800);
    if (nonDry() !== 3 || await q.$eval(dubB, e => e.disabled)) throw new Error('Dừng lúc chờ: đúng 3 lời gọi (2 xong + 1 bị 429), nút bấm lại được: ' + nonDry());
    // (c) 429 mãi mãi: chờ tối đa 10 lần rồi dừng, báo giờ thử lại (không phải "hôm nay")
    await resetDub(); M.minute = { after: 0, ms: 150, stuck: true, hits: 0, until: 0 };
    await q.click(dubB);
    await q.waitForFunction(() => /Google giới hạn mỗi phút — thử lại lúc \d{2}:\d{2}:\d{2} \(đã chờ 10 lần\) · đã lồng 0\/15 câu/.test(document.body.textContent), null, { timeout: 40000 });
    if (M.minute.hits !== 11 || nonDry() !== 11 || !(await toasts(q)).some(t => /^Google giới hạn mỗi phút — thử lại lúc \d{2}:\d{2}:\d{2}\. Đã lồng 0\/15 câu/.test(t)) || (await toasts(q)).some(t => /hôm nay/.test(t))) throw new Error('tối đa 10 lần chờ (11 lời gọi): ' + M.minute.hits + ' lần 429 · ' + JSON.stringify(await toasts(q)));
    // (d) trần câu / ngày của máy (cap) KHÔNG chờ: dừng ngay, giữ chữ cũ
    await resetDub(); M.capHit = true; await q.click(dubB);
    await q.waitForFunction(() => /Dừng vì chạm trần câu \/ ngày \(Cài đặt AI\) — đọc tiếp lúc \d{2}:\d{2} \d{2}[\/-]\d{2} · đã lồng 0\/15 câu/.test(document.body.textContent), null, { timeout: 15000 });
    await q.waitForTimeout(500);
    if (nonDry() !== 1 || /giới hạn mỗi phút/.test(await q.textContent('.works'))) throw new Error('chạm trần phải dừng ngay, không chờ: ' + nonDry() + ' lời gọi');
    M.capHit = false; M.minute = null;
    await q.close();
    console.log('  ✓ Giới hạn mỗi phút (CNS-098): 429 không cap + retryAt ≤ 2 phút → "Google giới hạn mỗi phút — tự lồng tiếp lúc HH:MM:SS", chờ rồi đọc tiếp đúng câu đó (4/15 → 15/15, một lần 429, không toast lỗi, retryAt ms epoch cũng được) · Dừng huỷ cả lúc chờ · 429 mãi → tối đa 10 lần chờ rồi dừng · retryAt xa → "Hết lượt hôm nay — thử lại lúc" · chạm trần ngày dừng ngay, giữ chữ cũ');

    // ---- 5c) bấm "Phim (HTML)" khi còn câu chưa có giọng AI (và Giọng AI sẵn sàng): hộp 3 nút [Lồng tiếng rồi xuất] [Xuất luôn] [Huỷ]; chưa sẵn sàng / đủ giọng → xuất thẳng ----
    const BOX = '[aria-label="Xác nhận xuất phim thiếu giọng AI"]', EXP = 'button:text-is("Phim (HTML)")';
    const dlOf = async trigger => { const [d] = await Promise.all([q.waitForEvent('download', { timeout: 30000 }), trigger()]); const f = path.join(home10, 'x-' + Date.now() + '.html'); await d.saveAs(f); return JSON.parse(fs.readFileSync(f, 'utf8').match(/var DATA = (\{.*?\});\nvar FILM/s)[1]); };
    const noDl = async (trigger, ms) => { let n = 0; const on = () => n++; q.on('download', on); await trigger(); await q.waitForTimeout(ms || 1200); q.off('download', on); return n === 0; };
    q = await pg(await ctx10.newPage(), { page: 'works', work: WORK }); await q.waitForSelector('.shot'); await spyOn(q);
    await resetDub();
    await q.click(EXP); await q.waitForSelector(BOX, { timeout: 8000 });
    const bt = await q.textContent(BOX), bn = await q.$$eval(BOX + ' button', bs => bs.map(b => b.textContent));
    if (!/Còn 15\/15 câu chưa có giọng AI — câu thiếu sẽ đọc bằng giọng máy \/ blip\./.test(bt) || bn.join('|') !== 'Lồng tiếng rồi xuất|Xuất luôn|Huỷ') throw new Error('hộp thiếu giọng AI: ' + bt + ' · ' + bn.join('|'));
    if (nonDry() || !await q.$eval(BOX + ' button', e => e === document.activeElement)) throw new Error('hộp chỉ hỏi (không tốn lượt), nút đầu nhận focus');
    await shot(q, 'xuat-phim-thieu-giong', '#wpanel-publish > .panel:first-child');
    // Huỷ: đóng hộp, không tải gì, không đọc mới
    if (!await noDl(() => q.click(BOX + ' button:text-is("Huỷ")')) || await q.$(BOX) || nonDry()) throw new Error('Huỷ phải đóng hộp, không tải tệp, không tốn lượt');
    // Xuất luôn: tải đúng tệp ngay, 0/15 câu có giọng, DATA.voiceTotal = 15 (nhãn "Giọng AI x/15" của phim)
    await q.click(EXP); await q.waitForSelector(BOX);
    let dx = await dlOf(() => q.click(BOX + ' button:text-is("Xuất luôn")'));
    if (Object.keys(dx.voices).length !== 0 || dx.voiceTotal !== 15 || nonDry() || await q.$(BOX)) throw new Error('Xuất luôn: 0 clip, voiceTotal 15, không đọc mới: ' + JSON.stringify([Object.keys(dx.voices).length, dx.voiceTotal, nonDry()]));
    // Lồng tiếng rồi xuất: lồng đủ 15 câu như nút Lồng tiếng AI, xong tự tải phim có đủ 15 clip
    await q.click(EXP); await q.waitForSelector(BOX);
    dx = await dlOf(() => q.click(BOX + ' button:text-is("Lồng tiếng rồi xuất")'));
    if (Object.keys(dx.voices).length !== 15 || dx.voiceTotal !== 15 || M.fresh !== 15 || !/Xong 15\/15 câu/.test(await q.textContent('.works')) || await q.$(BOX)) throw new Error('Lồng tiếng rồi xuất: ' + JSON.stringify([Object.keys(dx.voices).length, dx.voiceTotal, M.fresh]));
    if (!(await toasts(q)).some(t => /15\/15 câu có giọng AI/.test(t))) throw new Error('thiếu toast xuất 15/15: ' + JSON.stringify(await toasts(q)));
    // đủ giọng: không hộp, tải thẳng
    dx = await dlOf(() => q.click(EXP));
    if (Object.keys(dx.voices).length !== 15 || await q.$(BOX)) throw new Error('đủ 15/15 phải xuất thẳng, không hộp');
    // hết lượt giữa lúc "lồng tiếng rồi xuất": vẫn xuất những câu đã có (6/15), báo hết lượt hôm nay
    await resetDub(); M.budget = 6;
    await q.click(EXP); await q.waitForSelector(BOX);
    dx = await dlOf(() => q.click(BOX + ' button:text-is("Lồng tiếng rồi xuất")'));
    if (Object.keys(dx.voices).length !== 6 || dx.voiceTotal !== 15) throw new Error('hết lượt giữa chừng: phải xuất 6/15 câu có giọng: ' + Object.keys(dx.voices).length + '/' + dx.voiceTotal);
    await q.waitForFunction(() => /Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}(?: \d{2}[\/-]\d{2})? · đã lồng 6\/15 câu/.test(document.body.textContent), null, { timeout: 5000 });
    // bấm Dừng lồng tiếng giữa chừng: KHÔNG xuất (người dùng đổi ý)
    await resetDub(); M.delay = 150;
    await q.click(EXP); await q.waitForSelector(BOX);
    if (!await noDl(async () => { await q.click(BOX + ' button:text-is("Lồng tiếng rồi xuất")'); await q.waitForFunction(() => /Lồng tiếng AI [1-9]\d?\/15/.test(document.body.textContent)); await q.click('button:text-is("Dừng lồng tiếng")'); await q.waitForFunction(() => /Đã dừng · đã lồng \d+\/15 câu/.test(document.body.textContent), null, { timeout: 15000 }); }, 1800)) throw new Error('Dừng lồng tiếng thì không được tự xuất');
    if (!(await toasts(q)).some(t => /Đã dừng lồng tiếng — chưa xuất phim/.test(t))) throw new Error('thiếu toast "chưa xuất phim": ' + JSON.stringify(await toasts(q)));
    M.delay = 0;
    // đang lồng tiếng mà bấm Phim (HTML): nhắc chờ, không xuất, không lồng đôi
    await resetDub(); M.delay = 200; await q.click(dubB); await q.waitForFunction(() => /Lồng tiếng AI [1-9]\d?\/15/.test(document.body.textContent));
    if (!await noDl(() => q.click(EXP), 800) || await q.$(BOX) || !(await toasts(q)).some(t => /Đang lồng tiếng AI — chờ xong/.test(t))) throw new Error('đang lồng tiếng thì Phim (HTML) chỉ nhắc chờ');
    await q.click('button:text-is("Dừng lồng tiếng")'); await q.waitForFunction(() => /Đã dừng/.test(document.body.textContent), null, { timeout: 15000 }); M.delay = 0;
    // Giọng AI chưa sẵn sàng (chưa có key): xuất như cũ, không hộp
    await q.close(); await new Promise(r => setTimeout(r, 600)); M.hasKey = false; M.ids.clear();   // chờ các lời gọi lồng tiếng còn bay của trang vừa đóng (M.delay = 200) trả xong rồi mới xoá clip — không thì clip về muộn lọt vào "chưa có key"
    q = await pg(await ctx10.newPage(), { page: 'works', work: WORK }); await q.waitForSelector('.shot'); await spyOn(q); await q.waitForFunction(() => /Chưa có key Google/.test(document.body.textContent), null, { timeout: 5000 });
    dx = await dlOf(() => q.click(EXP));
    if (Object.keys(dx.voices).length !== 0 || await q.$(BOX)) throw new Error('chưa có key: xuất như cũ, không hộp · ' + JSON.stringify({ voices: Object.keys(dx.voices).length, box: !!(await q.$(BOX)), hasKey: M.hasKey, ids: M.ids.size, cfg: await q.evaluate(() => JSON.stringify(window.GCDock && window.GCDock.state())) }));
    M.hasKey = true; M.ids.clear();
    await q.close();
    console.log('  ✓ Xuất phim thiếu giọng AI: bấm Phim (HTML) khi còn câu chưa có clip + Giọng AI sẵn sàng → hộp "Còn 15/15 câu chưa có giọng AI — câu thiếu sẽ đọc bằng giọng máy / blip" với đúng 3 nút (focus nút đầu, chưa tốn lượt) · Huỷ: đóng, không tải · Xuất luôn: tải ngay (DATA.voiceTotal) · Lồng tiếng rồi xuất: lồng đủ 15 câu rồi tự tải · hết lượt giữa chừng vẫn xuất phần đã có · Dừng lồng tiếng thì KHÔNG xuất · đang lồng tiếng chỉ nhắc chờ · đủ giọng / chưa có key: xuất thẳng, không hộp');

    // ---- 6) Hồ sơ nhân vật: vai · giọng vùng · giọng AI; cao độ / tốc độ chỉ ghi khi đã kéo ----
    M.hasKey = true; M.ids.clear(); M.calls.length = 0; M.casts.length = 0;
    const putBodies = [];
    ctx10.on('request', r => { if (r.method() === 'PUT' && /\/api\/assets\//.test(r.url())) putBodies.push(JSON.parse(r.postData())); });
    q = await pg(await ctx10.newPage(), { page: 'lib-characters', key: 'local.my/ci-giong' }, 'thu-vien');
    await q.waitForSelector('.voicebox', { timeout: 8000 }); await spyOn(q);
    const vb = '.voicebox ';
    const guess = await q.evaluate(() => GenChibi.voices.guessRole(GenChibi.ASSETS['local.my/ci-giong']));
    if (guess !== 'ba-lao') throw new Error('đoán vai "bà lão hay nói" phải ra bà lão, ra ' + guess);
    const roleOpts = await q.$$eval(vb + 'select[aria-label="Vai giọng"] option', os => os.map(o => o.value + '|' + o.textContent));
    if (roleOpts.length !== 23 || roleOpts[0] !== '|Tự đoán: Bà lão' || await q.$$eval(vb + 'select[aria-label="Vai giọng"] optgroup', gs => gs.map(g => g.label).join()) !== 'Trẻ em,Thiếu niên,Thanh niên,Trung niên,Cao tuổi') throw new Error('ô Vai giọng: ' + roleOpts.slice(0, 3).join(';') + ' (' + roleOpts.length + ')');
    if (await q.$eval(vb + 'select[aria-label="Vai giọng"]', e => e.value) !== '') throw new Error('chưa chọn vai thì phải là "Tự đoán"');
    if (await q.$$eval(vb + 'select[aria-label="Giọng vùng"] option', os => os.map(o => o.value).join()) !== ',bac,nam,trung' || (await q.$eval(vb + 'select[aria-label="Giọng vùng"] option', e => e.textContent)) !== 'Theo phim') throw new Error('ô Giọng vùng sai');
    await q.waitForFunction(() => { const s = document.querySelector('.voicebox select[aria-label="Giọng AI"]'); return s && !s.hidden && s.options.length >= 4; }, null, { timeout: 5000 });
    const aiOpts = await q.$$eval(vb + 'select[aria-label="Giọng AI"] option', os => os.map(o => o.value));
    if (aiOpts[0] !== '' || !aiOpts.includes('lib-vi-minh') || !aiOpts.includes('Charon')) throw new Error('ô Giọng AI không lấy từ api/voice/library: ' + aiOpts.join());
    const pitch0 = +await q.$eval(vb + 'input[aria-label="Cao độ giọng"]', e => e.value), rate0 = +await q.$eval(vb + 'input[aria-label="Tốc độ nói"]', e => e.value);
    const def = r => q.evaluate(r => { const v = GenChibi.audio.voiceOf({ id: 'ci-giong', key: 'local.my/ci-giong', name: 'Bà Tám', voice: { role: r } }, { lang: 'vi' }); return [v.pitch, v.rate]; }, r);
    const dBa = await def('ba-lao');
    if (Math.abs(pitch0 - dBa[0]) > 0.026 || Math.abs(rate0 - dBa[1]) > 0.026) throw new Error('chưa lưu giọng: thanh trượt phải ở mặc định của vai đoán: ' + [pitch0, rate0] + ' vs ' + dBa);
    // đổi vai → thanh trượt nhảy về mặc định của vai
    await q.selectOption(vb + 'select[aria-label="Vai giọng"]', 'vo-tuong');
    const dVT = await def('vo-tuong');
    if (Math.abs(+await q.$eval(vb + 'input[aria-label="Cao độ giọng"]', e => e.value) - dVT[0]) > 0.026) throw new Error('đổi vai mà cao độ không nhảy về mặc định võ tướng: ' + dVT);
    // Lưu khi CHƯA kéo: có role / accent / ai, KHÔNG có pitch / rate
    await q.selectOption(vb + 'select[aria-label="Giọng vùng"]', 'trung'); await q.selectOption(vb + 'select[aria-label="Giọng AI"]', 'Charon');
    await q.click(vb + 'button:text-is("Lưu giọng")'); await q.waitForFunction(() => /Đã lưu giọng của Bà Tám/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
    const s1 = putBodies[putBodies.length - 1];
    if (JSON.stringify(s1.voice) !== JSON.stringify({ role: 'vo-tuong', accent: 'trung', ai: 'Charon' })) throw new Error('lưu chưa kéo phải chỉ có role / accent / ai: ' + JSON.stringify(s1.voice));
    // kéo cao độ → đổi vai: cao độ ĐÃ kéo giữ nguyên, tốc độ (chưa kéo) nhảy theo vai; Lưu ghi pitch, không ghi rate
    await q.reload(); await q.waitForSelector('.voicebox'); await spyOn(q);
    if (await q.$eval(vb + 'select[aria-label="Vai giọng"]', e => e.value) !== 'vo-tuong' || await q.$eval(vb + 'select[aria-label="Giọng vùng"]', e => e.value) !== 'trung') throw new Error('tải lại mất vai / giọng vùng đã lưu');
    await q.$eval(vb + 'input[aria-label="Cao độ giọng"]', e => { e.value = '1.8'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await q.selectOption(vb + 'select[aria-label="Vai giọng"]', 'quan-su');
    if (+await q.$eval(vb + 'input[aria-label="Cao độ giọng"]', e => e.value) !== 1.8) throw new Error('đã kéo cao độ mà đổi vai làm nhảy');
    const dQS = await def('quan-su');
    if (Math.abs(+await q.$eval(vb + 'input[aria-label="Tốc độ nói"]', e => e.value) - dQS[1]) > 0.026) throw new Error('tốc độ chưa kéo phải nhảy theo vai quân sư');
    await q.click(vb + 'button:text-is("Lưu giọng")'); await q.waitForFunction(() => /Đã lưu giọng/.test(document.getElementById('toast').textContent));
    const s2 = putBodies[putBodies.length - 1];
    if (s2.voice.pitch !== 1.8 || 'rate' in s2.voice || s2.voice.role !== 'quan-su' || s2.voice.accent !== 'trung' || s2.voice.ai !== 'Charon') throw new Error('lưu đã kéo cao độ: ' + JSON.stringify(s2.voice));
    // ↺ theo vai: bỏ cao độ / tốc độ đã lưu
    await q.reload(); await q.waitForSelector('.voicebox'); await q.click(vb + 'button:text-is("↺ theo vai")'); await q.click(vb + 'button:text-is("Lưu giọng")'); await q.waitForFunction(() => /Đã lưu giọng/.test(document.getElementById('toast').textContent));
    const s3 = putBodies[putBodies.length - 1];
    if ('pitch' in s3.voice || 'rate' in s3.voice || s3.voice.role !== 'quan-su') throw new Error('↺ theo vai phải bỏ pitch / rate: ' + JSON.stringify(s3.voice));
    // nghe thử: giọng trình duyệt theo vai, không gọi server; ▶ Giọng AI: đúng 1 lời gọi, đúng ngôn ngữ
    await q.reload(); await q.waitForSelector('.voicebox'); await spyOn(q); await q.evaluate(() => { window.__realSay = false; }); M.calls.length = 0;
    await q.click(vb + 'button:text-is("▶ Nghe thử")'); await q.waitForTimeout(200);
    const sp1 = await q.evaluate(() => GenChibi.audio.__spy.slice());
    if (M.calls.length || sp1.length !== 1 || sp1[0].lang !== 'vi-VN' || sp1[0].role !== 'quan-su' || !/Bà Tám/.test(sp1[0].text)) throw new Error('▶ Nghe thử: ' + JSON.stringify(sp1) + ' · ' + M.calls.length + ' lời gọi');
    await q.selectOption(vb + 'select[aria-label="Ngôn ngữ nghe thử"]', 'en'); await q.waitForTimeout(100);
    if (await q.$$eval(vb + 'select[aria-label="Giọng vùng"] option', os => os.map(o => o.value).join()) !== ',' + GV.langList().find(l => l.id === 'en').accents.map(a => a.id).join()) throw new Error('đổi ngôn ngữ nghe thử mà giọng vùng không đổi theo');
    if (await q.$$eval(vb + 'select[aria-label="Ngôn ngữ nghe thử"] option', os => os.map(o => o.value).join()) !== GV.langList().map(l => l.id).join()) throw new Error('ô ngôn ngữ nghe thử phải lấy từ langList()');
    await q.click(vb + 'button:text-is("▶ Giọng AI")'); await q.waitForFunction(() => window.GenChibi.audio.__spy.length >= 2, null, { timeout: 5000 });
    const sp2 = await q.evaluate(() => GenChibi.audio.__spy.slice()), c2 = M.calls[M.calls.length - 1];
    if (M.calls.length !== 1 || c2.lang !== 'en' || c2.role !== 'quan-su' || c2.voice !== 'Charon' || !/^Hello, I am Bà Tám/.test(c2.text) || !sp2[1].clip || sp2[1].lang !== 'en-US') throw new Error('▶ Giọng AI: ' + JSON.stringify([c2, sp2[1]]));
    await shot(q, 'ho-so-nhan-vat-giong', '.voicebox');
    // chưa có key: ẩn ô Giọng AI + nút ▶ Giọng AI
    M.hasKey = false; await q.reload(); await q.waitForSelector('.voicebox'); await q.waitForTimeout(400);
    if (await q.$eval(vb + 'select[aria-label="Giọng AI"]', e => !e.hidden) || await q.$eval(vb + 'button:text-is("▶ Giọng AI")', e => !e.hidden)) throw new Error('chưa có key mà vẫn hiện giọng AI');
    M.hasKey = true;
    console.log('  ✓ Hồ sơ nhân vật › Giọng: "Tự đoán: Bà lão" mặc định (optgroup theo nhóm tuổi) · giọng vùng Theo phim / Bắc Nam Trung · ô Giọng AI từ api/voice/library (chỉ khi có key) · đổi vai → thanh trượt nhảy về mặc định của vai, trừ khi đã kéo · Lưu chỉ ghi role / accent / ai, KHÔNG ghi pitch / rate khi chưa kéo · ↺ theo vai bỏ giá trị đã lưu · ▶ Nghe thử không gọi server, ▶ Giọng AI đúng 1 lời gọi');
    await q.close();

    // ---- 7) phim xuất ra: nhúng clip AI ĐÃ có (dry), mở file:// không gọi mạng, giọng AI chỉ ở kiểu "tự động" ----
    M.ids.clear(); M.fresh = 0; M.budget = Infinity; M.calls.length = 0;
    q = await pg(await ctx10.newPage(), { page: 'works', work: WORK }); await q.waitForSelector('.shot'); await spyOn(q);
    await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'en|us'); await q.waitForTimeout(300);
    // còn câu chưa có giọng AI (và Giọng AI sẵn sàng) thì hiện hộp hỏi → chọn "Xuất luôn" (lồng tiếng rồi xuất có test riêng ở 5c)
    const exportFilm = async name => { const BX = '[aria-label="Xác nhận xuất phim thiếu giọng AI"]', dlP = q.waitForEvent('download', { timeout: 30000 }); dlP.catch(() => null);
      await q.click('button:text-is("Phim (HTML)")');
      let d = await Promise.race([dlP, q.waitForSelector(BX, { timeout: 20000 }).then(() => 'box', () => new Promise(() => {}))]);
      if (d === 'box') { await q.click(BX + ' button:text-is("Xuất luôn")'); d = await dlP; }
      const f = path.join(home10, name); await d.saveAs(f); return f; };
    // chưa lồng tiếng câu nào: phim vẫn xuất được, 0/15 câu có giọng AI
    let fp0 = await exportFilm('phim-0.html'), h0 = fs.readFileSync(fp0, 'utf8');
    if (!/"voices":\{\}/.test(h0) || !/"lang":"en"/.test(h0) || !/"accent":"us"/.test(h0)) throw new Error('phim chưa lồng tiếng: DATA.voices phải rỗng, DATA.lang / accent phải theo tác phẩm');
    if (!(await toasts(q)).some(t => /0\/15 câu có giọng AI/.test(t))) throw new Error('toast phim 0/15: ' + JSON.stringify(await toasts(q)));
    await q.click(dubB); await q.waitForFunction(() => /Xong 15\/15 câu/.test(document.body.textContent), null, { timeout: 30000 });
    M.calls.length = 0;
    const fp = await exportFilm('phim-ai.html'), html = fs.readFileSync(fp, 'utf8');
    if (M.calls.some(c => !c.dry)) throw new Error('xuất phim không được đọc mới: ' + JSON.stringify(M.calls.filter(c => !c.dry).length));
    const dv = html.match(/var DATA = (\{.*?\});\nvar FILM/s), DATA = JSON.parse(dv[1]);
    if (Object.keys(DATA.voices).length !== 15 || !Object.values(DATA.voices).every(v => /^data:audio\/wav;base64,UklGR/.test(v)) || DATA.lang !== 'en' || DATA.accent !== 'us') throw new Error('DATA.voices: ' + Object.keys(DATA.voices).length + ' clip, lang ' + DATA.lang);
    if (!Object.keys(DATA.voices).every(k => /^[^|]+\|[a-z]+\|[a-z]+\|.+/.test(k))) throw new Error('khoá câu sai dạng: ' + Object.keys(DATA.voices)[0]);
    if (html.indexOf('/* engine/voices.js */') < 0 || html.indexOf('/* engine/voices.js */') > html.indexOf('/* engine/audio.js */')) throw new Error('phim phải nhúng engine/voices.js TRƯỚC engine/audio.js');
    if (!DATA.characters.every(c => c.voice && GV.ROLES[c.voice.role])) throw new Error('mọi nhân vật trong phim phải chốt vai giọng');
    if (!(await toasts(q)).some(t => /15\/15 câu có giọng AI/.test(t) && /\((?:\d+(?:\.\d)?) (?:MB|KB)\)/.test(t))) throw new Error('toast phim thiếu "15/15 câu có giọng AI" + cỡ tệp: ' + JSON.stringify((await toasts(q)).slice(-2)));
    // xuất khi trình duyệt chưa có clip nào trong bộ nhớ và server chỉ giữ MỘT PHẦN: câu thiếu bị bỏ qua, phim vẫn xuất
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'en|us'); await q.waitForTimeout(300);
    [...M.ids].slice(0, 6).forEach(i => M.ids.delete(i));
    const fp2 = await exportFilm('phim-mot-phan.html'), D2 = JSON.parse(fs.readFileSync(fp2, 'utf8').match(/var DATA = (\{.*?\});\nvar FILM/s)[1]);
    if (Object.keys(D2.voices).length !== 9 || !(await toasts(q)).some(t => /9\/15 câu có giọng AI \(câu còn lại dùng giọng máy đọc hoặc blip/.test(t))) throw new Error('xuất một phần: ' + Object.keys(D2.voices).length + ' clip');
    // <html lang> theo ngôn ngữ phim (không cố định "vi"): vi · en · zh-CN (phổ thông) · zh-TW (Đài Loan) · zh-HK (Quảng Đông)
    const langOfHtml = t => (t.match(/<html lang="([^"]+)">/) || [])[1];
    if (langOfHtml(html) !== 'en') throw new Error('phim tiếng Anh phải <html lang="en">, thấy ' + langOfHtml(html));
    for (const [v, want] of [['vi|bac', 'vi'], ['zh|pt', 'zh-CN'], ['zh|tw', 'zh-TW'], ['yue|hk', 'zh-HK'], ['en|uk', 'en']]) {
      await q.selectOption('select[aria-label="Ngôn ngữ phim"]', v); await q.waitForTimeout(250);
      const ft = fs.readFileSync(await exportFilm('phim-' + v.replace('|', '-') + '.html'), 'utf8'), dl = JSON.parse(ft.match(/var DATA = (\{.*?\});\nvar FILM/s)[1]);
      if (langOfHtml(ft) !== want || dl.lang + '|' + dl.accent !== v) throw new Error('phim ' + v + ' phải <html lang="' + want + '">, thấy ' + langOfHtml(ft) + ' (DATA ' + dl.lang + '|' + dl.accent + ')');
    }
    await q.close();
    // mở file:// — không một yêu cầu mạng; "tự động" dùng clip nhúng (data:), "máy đọc" bỏ qua clip; lời thoại chạy
    const ff = await ctx10.newPage(), fe = []; ff.on('pageerror', e => fe.push(e.message)); ff.on('request', r => { if (!/^file:|^data:|^blob:/.test(r.url())) fe.push('gọi ra ngoài: ' + r.url()); });
    await ff.goto('file://' + fp); await ff.waitForSelector('#voice');
    if (!/có giọng AI/.test(await ff.$eval('#voice option', e => e.textContent))) throw new Error('phim có giọng AI mà ô giọng không nói');
    await ff.evaluate(SPY_A); await ff.evaluate(() => { window.__realSay = true; }); await ff.click('#big');
    await ff.waitForFunction(() => window.GenChibi.audio.__spy.length >= 3, null, { timeout: 60000 });
    const fs1 = await ff.evaluate(() => ({ spy: window.GenChibi.audio.__spy.slice(), err: window.GenChibi.audio.info().clipError }));
    if (!fs1.spy.slice(0, 3).every(s => s.clip && /^str:data:audio\/wav;base64/.test(s.clip)) || !fs1.spy.slice(0, 3).every(s => s.lang === 'en-US')) throw new Error('phim file://: kiểu tự động phải dùng clip nhúng + giọng en-US: ' + JSON.stringify(fs1.spy));
    if (fs1.err) throw new Error('clip nhúng giải mã lỗi: ' + fs1.err);
    if (!fs1.spy.every(s => s.needGood)) throw new Error('phim có giọng AI + kiểu tự động: needGood phải bật: ' + JSON.stringify(fs1.spy.map(s => s.needGood)));
    if (!await ff.$eval('#ainote', e => e.hidden)) throw new Error('đủ 15/15 câu thì không hiện nhãn "Giọng AI x/y"');
    await ff.click('#stop'); await ff.evaluate(() => { window.GenChibi.audio.__spy.length = 0; }); await ff.selectOption('#voice', 'tts'); await ff.click('#big');
    await ff.waitForFunction(() => window.GenChibi.audio.__spy.length >= 2, null, { timeout: 60000 }); await ff.click('#stop');
    { const sp2 = await ff.evaluate(() => window.GenChibi.audio.__spy.slice());
      if (sp2.some(s => s.clip)) throw new Error('chọn máy đọc mà phim vẫn dùng clip AI');
      if (sp2.some(s => s.needGood)) throw new Error('chọn hẳn "máy đọc" thì không needGood: ' + JSON.stringify(sp2.map(s => s.needGood))); }
    if (fe.length) throw new Error('phim file:// lỗi: ' + fe.slice(0, 3).join(' | '));
    await ff.close();
    // phim chỉ có MỘT PHẦN clip (9/15): nhãn "Giọng AI 9/15" + title; kiểu tự động → câu thiếu needGood; chọn máy đọc → nhãn ẩn, không needGood. Phim 0 clip AI: không nhãn, không needGood
    const part = async (file, fn) => { const pg2 = await ctx10.newPage(); pg2.on('pageerror', e => fe.push(e.message)); await pg2.goto('file://' + file); await pg2.waitForSelector('#voice'); await pg2.evaluate(SPY_A); try { return await fn(pg2); } finally { await pg2.close(); } };
    const playSome = async (pg2, n) => { await pg2.evaluate(() => { window.GenChibi.audio.__spy.length = 0; }); await pg2.click('#big'); await pg2.waitForFunction(k => window.GenChibi.audio.__spy.length >= k, n, { timeout: 60000 }); await pg2.click('#stop'); return pg2.evaluate(() => window.GenChibi.audio.__spy.slice()); };
    await part(fp2, async pg2 => {
      const nt = await pg2.$eval('#ainote', e => ({ hidden: e.hidden, text: e.textContent, title: e.title }));
      if (nt.hidden || nt.text !== 'Giọng AI 9/15' || !/6 câu chưa có giọng AI/.test(nt.title) || !/giọng máy \/ blip/.test(nt.title)) throw new Error('nhãn phim 9/15: ' + JSON.stringify(nt));
      const sp3 = await playSome(pg2, 6);
      if (!sp3.every(s => s.needGood)) throw new Error('phim 9/15 + tự động: needGood phải bật: ' + JSON.stringify(sp3.map(s => s.needGood)));
      await pg2.selectOption('#voice', 'tts'); if (!await pg2.$eval('#ainote', e => e.hidden)) throw new Error('chọn máy đọc thì nhãn "Giọng AI 9/15" phải ẩn (clip AI không dùng)');
      const sp4 = await playSome(pg2, 3); if (sp4.some(s => s.needGood || s.clip)) throw new Error('phim 9/15 + máy đọc: không needGood, không clip');
      await pg2.selectOption('#voice', 'blip'); await pg2.selectOption('#voice', 'auto'); if (await pg2.$eval('#ainote', e => e.hidden)) throw new Error('về tự động thì nhãn hiện lại');
    });
    await part(fp0, async pg2 => {
      if (!await pg2.$eval('#ainote', e => e.hidden)) throw new Error('phim 0 clip AI: không nhãn "Giọng AI"');
      const sp5 = await playSome(pg2, 3); if (sp5.some(s => s.needGood || s.clip)) throw new Error('phim 0 clip AI: giọng máy như cũ, không needGood: ' + JSON.stringify(sp5.map(s => s.needGood)));
    });
    if (fe.length) throw new Error('phim file:// lỗi: ' + fe.slice(0, 3).join(' | '));
    console.log('  ✓ Phim xuất ra: DATA.voices = 15 clip AI đã có (dry — không đọc mới, không tốn lượt) + DATA.lang / accent · engine/voices.js nhúng trước audio.js · chưa lồng tiếng → 0/15 vẫn xuất · server giữ một phần → 9/15, câu thiếu bị bỏ qua · toast "15/15 câu có giọng AI" + cỡ tệp · <html lang> theo ngôn ngữ phim (vi · en · zh-CN phổ thông · zh-TW Đài Loan · zh-HK Quảng Đông) · mở file://: không yêu cầu mạng, kiểu tự động phát clip nhúng (en-US), máy đọc bỏ qua clip · phim thiếu clip (9/15): nhãn "Giọng AI 9/15" + title "câu chưa có giọng AI — giọng máy / blip", tự động → câu thiếu needGood, máy đọc → nhãn ẩn + không needGood · phim 0 clip: không nhãn, không needGood');

    // ---- 8) bộ phát thuần (không qua Studio): hỏi clip một lần mỗi câu từ đầu phân cảnh (≤ 2 song song), chờ ≤ 2,5 s, lỗi / quá hạn → giọng trình duyệt ----
    q = await pg(await ctx10.newPage(), { page: 'works', work: WORK }); await q.waitForSelector('.shot'); await spyOn(q);
    const unit = await q.evaluate(async ([WORK_]) => {
      const GC = window.GenChibi, w = await fetch('api/works/' + WORK_).then(r => r.json()), shot = w.shots[0], nLines = shot.event.steps.length, out = {};
      const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:640px;z-index:99999'; document.body.appendChild(box);
      const buf = new Uint8Array([1, 2, 3, 4]).buffer;
      const run = async (voiceClip, need, opts) => {
        const A = GC.audio; A.__spy.length = 0; const t0 = Date.now();
        const P = GC.film.player(box, Object.assign({ voiceClip }, opts || {})); P.play([shot], 'T');
        const t = Date.now(); while (A.__spy.length < need && Date.now() - t < 20000) await new Promise(r => setTimeout(r, 40));
        const spy = A.__spy.slice(), at = Date.now() - t0; P.destroy(); await new Promise(r => setTimeout(r, 100)); return { spy, at };
      };
      // (a) clip có sẵn → hooks.clip; mỗi câu hỏi ĐÚNG một lần; ≤ 2 yêu cầu song song; lang / accent của tác phẩm vào giọng trình duyệt
      let calls = [], live = 0, peak = 0;
      const a = await run((line, asset) => { calls.push(line.say); live++; peak = Math.max(peak, live); return new Promise(r => setTimeout(() => { live--; r(buf); }, 250)); }, 1, { lang: 'zh', accent: 'tw' });
      out.a = { clip: a.spy[0].clip, lang: a.spy[0].lang, calls: calls.length, uniq: new Set(calls).size, peak, nLines };
      // (b) voiceClip ném lỗi / reject → giọng trình duyệt như cũ
      const b = await run(() => Promise.reject(new Error('hỏng')), 1); out.b = { clip: b.spy[0].clip, lang: b.spy[0].lang };
      const b2 = await run(() => { throw new Error('ném lỗi đồng bộ'); }, 1); out.b2 = { clip: b2.spy[0].clip };
      // (c) quá hạn 2,5 s (mặc định) → bắt đầu nói bằng giọng trình duyệt, không chờ mãi
      const c = await run(() => new Promise(r => setTimeout(() => r(buf), 8000)), 1); out.c = { clip: c.spy[0].clip, wait: c.at - b.at };
      // (d) clipWait ngắn hơn / dài hơn theo opts
      //     (clip hỏi từ đầu phân cảnh nên tới lượt nói thường đã về — chỉ câu CHƯA về mới phải chờ; hai ca dưới cho clip về rất muộn)
      const d = await run(() => new Promise(r => setTimeout(() => r(buf), 7000)), 1, { clipWait: 300 }); out.d = { clip: d.spy[0].clip, wait: d.at - b.at };
      const e = await run(() => new Promise(r => setTimeout(() => r(buf), 5000)), 1, { clipWait: () => 9000 }); out.e = { clip: e.spy[0].clip, wait: e.at - b.at };
      // (f) trả thẳng (không Promise) + chuỗi data: URI
      const f = await run(() => 'data:audio/wav;base64,AAAA', 1); out.f = { clip: f.spy[0].clip };
      // (g) không có voiceClip: giọng trình duyệt như cũ, đúng ngôn ngữ
      const g = await run(null, 1, { lang: 'en', accent: 'uk' }); out.g = { clip: g.spy[0].clip, lang: g.spy[0].lang };
      // (h) khoá câu
      out.key = GC.film.clipKey({ actor: 'x', state: 'rage', bubble: 'shout', say: ' Xin chào ' });
      box.remove(); return out;
    }, [WORK]);
    // (a) kiểm ĐÚNG một giá trị: tiếng Trung · Đài Loan → giọng trình duyệt zh-TW (CNS-088; trước đây chấp nhận cả zh-CN nhưng in "zh-TW")
    if (unit.a.clip !== 'buf:4' || unit.a.lang !== 'zh-TW') throw new Error('(a) clip / ngôn ngữ (zh|tw phải ra zh-TW): ' + JSON.stringify(unit.a));
    if (unit.a.calls !== unit.a.nLines || unit.a.uniq !== unit.a.nLines || unit.a.peak > 2 || unit.a.peak < 2) throw new Error('(a) hỏi trước mọi câu một lần, ≤ 2 song song: ' + JSON.stringify(unit.a));
    if (unit.b.clip || unit.b2.clip || unit.b.lang !== 'vi-VN') throw new Error('(b) lỗi phải rơi về giọng máy: ' + JSON.stringify([unit.b, unit.b2]));
    if (unit.c.clip || unit.c.wait < 2000 || unit.c.wait > 3400) throw new Error('(c) chờ tối đa ~2,5 s rồi rơi về: ' + JSON.stringify(unit.c));
    if (unit.d.clip || unit.d.wait > 1000 || unit.e.clip !== 'buf:4' || unit.e.wait < 1200) throw new Error('(d/e) clipWait theo opts (300 ms → rơi về ngay; hàm 9 s → chờ clip về): ' + JSON.stringify([unit.d, unit.e]));
    if (!/^str:data:audio\/wav/.test(unit.f.clip)) throw new Error('(f) clip chuỗi: ' + JSON.stringify(unit.f));
    if (unit.g.clip || unit.g.lang !== 'en-GB') throw new Error('(g) không voiceClip (en|uk phải ra en-GB): ' + JSON.stringify(unit.g));
    if (unit.key !== 'x|rage|shout|Xin chào') throw new Error('khoá câu: ' + unit.key);
    await q.close();
    console.log('  ✓ Bộ phát (hợp đồng voiceClip): có clip → hooks.clip · mỗi câu hỏi đúng 1 lần, hỏi trước từ đầu phân cảnh, ≤ 2 song song · lỗi / ném lỗi / quá 2,5 s → giọng trình duyệt (clipWait chỉnh được) · lang / accent của tác phẩm vào giọng trình duyệt (zh|tw → zh-TW, en|uk → en-GB)');

    // ---- 9) giọng vùng THẬT (Q14, CNS-088) · dàn vượt 48 (CNS-094) ----
    // Google chỉ cho giọng Bắc / Trung / Nam, Đài Loan đúng chất qua Thiết kế giọng: Sân khấu final đếm "giọng vùng có ở N/M vai (đã thiết kế)" và có nút thiết kế hàng loạt
    // (bấm tay, hộp xác nhận TRONG TRANG ghi số lượt, tuần tự từng vai, bỏ vai trẻ em, dừng ngay ở 429, xong thì cast lại).
    M.hasKey = true; M.off = false; M.keySource = 'voice'; M.ids.clear(); M.fresh = 0; M.budget = Infinity; M.capHit = false; M.today = 0; M.dailyCap = 200;
    M.designs = {}; M.designBudget = Infinity; M.designCap = false; M.designDelay = 0; M.designPeak = 0; M.missing = []; M.calls.length = 0; M.casts.length = 0; M.designCalls.length = 0;
    // một tác phẩm riêng: 3 vai thiết kế được (bà lão × 2 — trùng vai chỉ đếm một, võ tướng, quân sư) + 2 vai trẻ em (bé gái, cô thiếu nữ — không tính vào M)
    const RGR = ['ba-lao', 'ba-lao', 'vo-tuong', 'quan-su', 'be-gai', 'thieu-nu'];
    q = await pg(await ctx10.newPage(), null);
    const RG = await q.evaluate(async ([H, roles]) => {
      const GC = window.GenChibi, keys = [];
      for (let i = 0; i < roles.length; i++) {
        const a = JSON.parse(JSON.stringify(GC.ASSETS['gen.khung/ma-no-canh'])), id = 'ci-rg-' + i;
        Object.assign(a, { id, pack: 'local.my', name: 'Vai ' + i, role: 'Thử giọng', status: 'draft', voice: { role: roles[i] } }); delete a.key;
        const r = await fetch('api/assets/local.my/' + id, { method: 'PUT', headers: H, body: JSON.stringify(a) }); if (!r.ok) throw new Error('lưu nhân vật thử ' + id + ' ' + r.status);
        keys.push('local.my/' + id);
      }
      let r = await fetch('api/works', { method: 'POST', headers: H, body: JSON.stringify({ title: 'Thử giọng vùng' }) }); if (!r.ok) throw new Error('tạo tác phẩm thử ' + r.status);
      const w = await r.json();
      r = await fetch('api/works/' + w.id + '/shots', { method: 'POST', headers: H, body: JSON.stringify({ shot: { title: 'Dàn thử', cast: keys } }) }); if (!r.ok) throw new Error('lưu phân cảnh thử ' + r.status + ' ' + await r.text());
      return w.id;
    }, [HDR, RGR]);
    await q.close();
    const kidLabels = /Bé gái|thiếu nữ/i, regB = 'button:text-is("Thiết kế giọng vùng cho các vai")', cf = '[aria-label="Xác nhận thiết kế giọng vùng"]';
    let dialogs = 0;
    const openRg = async lang => {   // mở tác phẩm thử, chọn ngôn ngữ (lưu vào tác phẩm), chờ dòng đếm
      q = await pg(await ctx10.newPage(), { page: 'works', work: RG }); q.on('dialog', d => { dialogs++; d.dismiss(); });
      await q.waitForSelector('.shot'); await spyOn(q);
      if (lang && await q.$eval('select[aria-label="Ngôn ngữ phim"]', e => e.value) !== lang) { await q.selectOption('select[aria-label="Ngôn ngữ phim"]', lang); await q.waitForTimeout(300); }
      await poll(async () => /^giọng vùng có ở \d+\/\d+ vai/.test(await regionLine()), 'dòng đếm giọng vùng');
    };
    const startRg = async n => { await q.click(regB); await q.waitForSelector(cf); await q.click(cf + ' button:text-is("Bắt đầu thiết kế ' + n + ' vai")'); };
    await openRg('vi|nam');
    if (!/^giọng vùng có ở 0\/3 vai \(đã thiết kế\)/.test(await regionLine())) throw new Error('đếm ban đầu phải 0/3 (6 diễn viên, 3 vai khác nhau thiết kế được, 2 vai trẻ em không tính): ' + await regionLine());
    if (!/đọc giọng chung của ngôn ngữ/.test(await regionLine())) throw new Error('dòng giọng vùng phải nói vai chưa thiết kế đọc giọng chung: ' + await regionLine());
    // đã có một vai thiết kế (bên server) → 1/3, chỉ còn 2 vai phải thiết kế
    M.designs['vo-tuong|vi|nam'] = { voice: 'design-vo-tuong', at: new Date().toISOString() };
    await q.reload(); await q.waitForSelector('.shot'); await spyOn(q); await poll(async () => /^giọng vùng có ở 1\/3 vai \(đã thiết kế\)/.test(await regionLine()), 'đếm 1/3').catch(async e => { throw new Error(e.message + ' · dòng hiện: «' + await regionLine() + '» · url ' + q.url()); });
    // bấm nút → hộp xác nhận TRONG TRANG (không window.confirm): ghi số vai ≈ số lượt Google + ~25 s mỗi vai; chưa tốn gì
    await q.click(regB); await q.waitForSelector(cf);
    let cfT = await q.textContent(cf);
    if (!/cho 2 vai/.test(cfT) || !/≈ 2 lượt Google/.test(cfT) || !/~25 s mỗi vai/.test(cfT) || !/Bắt đầu thiết kế 2 vai/.test(cfT) || /Võ tướng/.test(cfT) || /Trần câu \/ ngày còn/.test(cfT) || kidLabels.test(cfT.replace(/Vai trẻ em không thiết kế được nên không tính\./, ''))) throw new Error('hộp xác nhận: ' + cfT);
    if (M.designCalls.length || dialogs) throw new Error('chưa bấm "Bắt đầu" mà đã tốn lượt / hiện hộp thoại hệ thống: ' + M.designCalls.length + ' lượt, ' + dialogs + ' hộp');
    await shot(q, 'san-khau-giong-vung-xac-nhan', '#wpanel-voice > .panel:first-child');
    await q.click(cf + ' button:text-is("Huỷ")'); if (await q.$(cf) || M.designCalls.length) throw new Error('Huỷ phải đóng hộp, không tốn lượt');
    // chạy: tuần tự (không bao giờ 2 lời gọi cùng lúc), đúng 2 vai chưa thiết kế, KHÔNG có vai trẻ em, tiến độ, xong thì cast lại cả dàn
    M.designDelay = 150; const nCast9 = M.casts.length;
    await startRg(2);
    await q.waitForFunction(() => /Thiết kế giọng vùng [01]\/2/.test(document.body.textContent) && !!document.querySelector('[aria-label="Tiến độ thiết kế giọng vùng"]'), null, { timeout: 8000 });
    if (!await q.$eval(regB, b => b.disabled) || await q.$eval('button:text-is("Lồng tiếng AI")', b => !b.disabled)) throw new Error('đang thiết kế mà nút thiết kế / Lồng tiếng AI chưa khoá');
    await q.waitForFunction(() => /Xong · đã thiết kế 2\/2 vai/.test(document.body.textContent), null, { timeout: 20000 });
    if (JSON.stringify(M.designCalls) !== JSON.stringify([{ role: 'ba-lao', lang: 'vi', accent: 'nam' }, { role: 'quan-su', lang: 'vi', accent: 'nam' }]) || M.designPeak !== 1) throw new Error('thiết kế phải tuần tự đúng 2 vai (bà lão, quân sư), bỏ vai trẻ em + vai đã có: ' + JSON.stringify(M.designCalls) + ' · cao nhất ' + M.designPeak + ' lời gọi cùng lúc');
    await poll(async () => /^giọng vùng có ở 3\/3 vai \(đã thiết kế\)/.test(await regionLine()), 'đếm 3/3 sau khi thiết kế');
    await poll(async () => M.casts.length > nCast9, 'cast lại sau khi thiết kế xong');
    const lastCast = M.casts[M.casts.length - 1];
    if (lastCast.work !== RG || lastCast.actors.length !== 6 || lastCast.lang !== 'vi' || lastCast.accent !== 'nam') throw new Error('xong phải cast lại cả dàn của tác phẩm (6 diễn viên): ' + JSON.stringify([lastCast.work, lastCast.actors.length, lastCast.lang, lastCast.accent]));
    if (!await q.$eval(regB, b => b.disabled) || !/Mọi vai trong phim đã có giọng thiết kế/.test(await q.$eval(regB, b => b.title))) throw new Error('đủ 3/3 thì nút phải mờ kèm lý do');
    await shot(q, 'san-khau-giong-vung-xong', '#wpanel-voice > .panel:first-child');
    if (!(await toasts(q)).some(t => /Đã thiết kế giọng vùng cho 2\/2 vai/.test(t)) || dialogs) throw new Error('thiếu toast xong / có hộp thoại hệ thống: ' + JSON.stringify(await toasts(q)));
    // đổi giọng vùng của phim → đếm lại theo (vai, ngôn ngữ, giọng vùng): tiếng Trung Đài Loan chưa thiết kế vai nào
    await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'zh|tw'); await q.waitForTimeout(300);
    if (!/^giọng vùng có ở 0\/3 vai/.test(await regionLine())) throw new Error('zh|tw phải đếm lại 0/3: ' + await regionLine());
    await q.selectOption('select[aria-label="Ngôn ngữ phim"]', 'vi|nam'); await q.waitForTimeout(300);
    if (!/^giọng vùng có ở 3\/3 vai/.test(await regionLine())) throw new Error('quay về vi|nam phải 3/3: ' + await regionLine());
    await q.close();
    // dừng đúng ở 429 của Google: 1 vai xong, vai thứ hai gặp 429 → DỪNG (không gọi vai thứ ba), báo giờ thử lại + số vai đã xong
    M.designs = {}; M.designCalls.length = 0; M.designDelay = 0; M.designBudget = 1;
    await openRg('vi|nam'); await poll(async () => /^giọng vùng có ở 0\/3/.test(await regionLine()), 'đếm 0/3 trước khi thử 429');
    await startRg(3);
    await q.waitForFunction(() => /Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}(?: \d{2}[\/-]\d{2})? · đã thiết kế 1\/3 vai/.test(document.body.textContent), null, { timeout: 15000 });
    await q.waitForTimeout(500);
    if (M.designCalls.length !== 2) throw new Error('phải dừng ngay sau 429 (2 lời gọi: 1 xong + 1 bị 429), thấy ' + M.designCalls.length + ': ' + JSON.stringify(M.designCalls.map(c => c.role)));
    if (!/^giọng vùng có ở 1\/3/.test(await regionLine()) || !(await toasts(q)).some(t => /^Hết lượt hôm nay — thử lại lúc/.test(t) && /Đã thiết kế 1\/3 vai/.test(t))) throw new Error('sau 429: đếm 1/3 + toast hết lượt: ' + await regionLine() + ' · ' + JSON.stringify(await toasts(q)));
    if (await q.$eval(regB, b => b.disabled)) throw new Error('hết lượt xong nút phải bấm lại được (lần sau thiết kế tiếp 2 vai còn lại)');
    await q.close();
    // chạm trần câu / ngày giữa lúc thiết kế: thông điệp "chạm trần" (không phải hết lượt Google)
    M.designs = {}; M.designCalls.length = 0; M.designBudget = 0; M.designCap = true; M.today = 199;   // còn 1 lượt trong trần: hộp xác nhận phải nói (thiết kế cũng tính vào trần)
    await openRg('vi|nam'); await q.click(regB); await q.waitForSelector(cf);
    if (!/Trần câu \/ ngày còn 1 lượt \(Cài đặt AI\) — chạy tới đó sẽ dừng/.test(await q.textContent(cf))) throw new Error('hộp xác nhận phải báo trần ngày còn 1 lượt: ' + await q.textContent(cf));
    await q.click(cf + ' button:text-is("Bắt đầu thiết kế 3 vai")');
    await q.waitForFunction(() => /Dừng vì chạm trần câu \/ ngày \(Cài đặt AI\) — đọc tiếp lúc \d{2}:\d{2} \d{2}[\/-]\d{2} · đã thiết kế 0\/3 vai/.test(document.body.textContent), null, { timeout: 15000 });
    if (M.designCalls.length !== 1 || !(await toasts(q)).some(t => /Đã chạm trần 200 câu hôm nay \(Cài đặt AI\)/.test(t)) || (await toasts(q)).some(t => /Hết lượt/.test(t))) throw new Error('chạm trần khi thiết kế: ' + M.designCalls.length + ' lời gọi · ' + JSON.stringify(await toasts(q)));
    M.designCap = false; M.designBudget = Infinity; M.today = 0;
    await q.close();
    // bấm "Dừng thiết kế" giữa chừng: vai đang chạy làm nốt, các vai sau không chạy
    M.designs = {}; M.designCalls.length = 0; M.designDelay = 400;
    await openRg('vi|nam'); await startRg(3);
    await q.click('button:text-is("Dừng thiết kế")');
    await q.waitForFunction(() => /Đã dừng · đã thiết kế 1\/3 vai/.test(document.body.textContent), null, { timeout: 15000 });
    await q.waitForTimeout(700);
    if (M.designCalls.length !== 1) throw new Error('Dừng thiết kế mà vẫn chạy tiếp: ' + M.designCalls.length + ' lời gọi');
    M.designDelay = 0;
    await q.close();
    // dàn vượt 48: server trả `missing` → MỘT dòng báo ở khối Lồng tiếng (và chỉ khi có)
    M.designs = {}; M.missing = ['a1', 'a2', 'a3'];
    await openRg('vi|nam');
    if (/vượt 48/.test(await q.textContent('.works'))) throw new Error('chưa cast mà đã báo vượt 48');
    await q.click(dubB);
    await poll(async () => /3 diễn viên vượt 48 chưa có giọng AI/.test(await q.textContent('.works')), 'dòng "3 diễn viên vượt 48 chưa có giọng AI"');
    if ((await q.$$eval('.works .note.warn', es => es.filter(e => /vượt 48/.test(e.textContent)).length)) !== 1) throw new Error('dòng báo vượt 48 phải đúng MỘT dòng');
    await q.close();
    M.missing = []; await openRg('vi|nam'); await q.click(dubB); await poll(async () => /Chưa có câu thoại nào sẵn sàng/.test(await q.textContent('.works')), 'lồng tiếng xong (tác phẩm thử không có lời thoại)');
    if (/vượt 48/.test(await q.textContent('.works'))) throw new Error('server không báo missing mà vẫn hiện dòng vượt 48');
    await q.close();
    console.log('  ✓ Giọng vùng thật + dàn vượt 48: cast cả dàn gửi work (server chốt giọng) · Sân khấu final "giọng vùng có ở N/M vai (đã thiết kế)" (trùng vai đếm một, vai trẻ em không tính, đếm theo ngôn ngữ + giọng vùng) · nút "Thiết kế giọng vùng cho các vai": hộp xác nhận TRONG TRANG (≈ N lượt Google, ~25 s mỗi vai, không hộp thoại hệ thống, Huỷ không tốn), tuần tự đúng các vai còn thiếu, tiến độ + khoá nút, xong cast lại cả dàn · dừng ngay ở 429 (báo giờ thử lại, không gọi vai kế) · chạm trần ngày báo riêng · nút Dừng giữa chừng · dàn vượt 48 → đúng một dòng "N diễn viên vượt 48 chưa có giọng AI"');

    if (M.leaks.length) throw new Error('có yêu cầu ra ngoài máy: ' + M.leaks.slice(0, 3).join(' | '));
    if (errs10.length) throw new Error('lỗi trang: ' + errs10.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ giọng AI theo vai:', e.message); if (errs10.length) console.log('    lỗi trang:', errs10.slice(0, 3).join(' | ')); if (q) { try { console.log('    trang đang mở:', q.url(), '·', (await q.evaluate(() => document.getElementById('view').innerText)).slice(0, 240).replace(/\n/g, ' / '), '· toast:', await q.evaluate(() => (document.getElementById('toast') || {}).textContent || '—'), '· tuyến đã lưu:', await q.evaluate(() => localStorage.getItem('gc-route-tao-tac'))); } catch (e2) { /* trang đã đóng */ } } }
  finally { await b10.close(); srv10.kill(); }
}
// ===== v0.18 — Dock "Trợ lý AI" ở cột phải (mọi khu) + Tạo tác = danh sách tác phẩm → phòng làm phim riêng =====
// LLM giả lập chuẩn OpenAI (tất định, không ra mạng ngoài); server tạm có bộ mẫu Tam Quốc. GC_ONLY=dock chỉ chạy nhóm này.
if (want('dock')) {
  const http11 = require('http');
  const LLM = { steps: [], reply: 'Xong.', last: null, calls: 0 };
  const mock11 = http11.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d).on('end', () => {
      const body = JSON.parse(b), done = body.messages.filter(m => m.role === 'tool').length;
      const cm = body.messages.find(m => m.role === 'user' && /^UI DATA/.test(m.content));   // tin dữ liệu giao diện (JSON, nhãn tiếng Anh cho AI — CNS-067) — tách khỏi chỉ dẫn hệ thống (CNS-118)
      LLM.last = { system: body.messages[0].content, tools: body.tools.map(t => t.function.name), messages: body.messages, ctxText: cm ? cm.content : '', ctx: cm ? JSON.parse(cm.content.slice(cm.content.indexOf('\n') + 1)) : null }; LLM.calls++;
      const msg = done < LLM.steps.length
        ? { role: 'assistant', content: '', tool_calls: [{ id: 'c' + done, type: 'function', function: { name: LLM.steps[done][0], arguments: JSON.stringify(LLM.steps[done][1]) } }] }
        : { role: 'assistant', content: typeof LLM.reply === 'function' ? LLM.reply() : LLM.reply };
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  }).listen(7571, '127.0.0.1');
  const home11 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv11 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home11, GC_PORT: '7570', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await up(7570);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  const U11 = 'http://localhost:7570/', H11 = { 'Content-Type': 'application/json', 'X-GC-Request': '1' };
  const b11 = await pw.chromium.launch();
  const errs11 = [];
  const open11 = async (ctx, url, vw) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs11.push(e.message)); await pg.goto(url); await pg.waitForFunction(() => window.GenChibi && /^v\d/.test((document.getElementById('verChip') || {}).textContent) && window.GCDock && window.GCDock.state().ready !== undefined, null, { timeout: 8000 }); await pg.waitForSelector('#dock .dock-ctx .path', { timeout: 8000 }); return pg; };
  const ask = async (pg, text) => { await pg.fill('#dock textarea.dock-ta', text); await pg.click('#dock button.send'); await pg.waitForFunction(() => !document.querySelector('#dock .msg.busy') && !window.GCDock.state().busy, null, { timeout: 8000 }); };
  let ctx11 = null, q = null, durS1 = '';
  try {
    const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8'));
    const imp = await fetch(U11 + 'api/projects/import', { method: 'POST', headers: H11, body: JSON.stringify({ bundle }) }).then(r => r.json());
    if (!imp.imported || imp.errors.length) throw new Error('nhập Tam Quốc: ' + JSON.stringify(imp.errors).slice(0, 200));
    await fetch(U11 + 'api/ai', { method: 'PUT', headers: H11, body: JSON.stringify({ provider: 'custom', baseUrl: 'http://127.0.0.1:7571/v1', apiKey: 'khoa-thu', model: 'mock' }) });
    const PJ_TQ = 'mau-tam-quoc', WID = 'tq-vuon-dao-xich-bich', W0 = await fetch(U11 + 'api/works/' + WID, { headers: H11 }).then(r => r.json()), S1 = W0.shots[0], S2 = W0.shots[1];
    ctx11 = await b11.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    await ctx11.route(u => !/^(http:\/\/localhost:|file:|data:|blob:|about:)/.test(u.href), route => route.abort());

    // ---- 1) dock có ở cả 4 khu + context đổi theo khu (bar "Đang xem" + payload + bộ tool + chỉ dẫn theo khu) ----
    q = await open11(ctx11, U11 + 'xuong');
    const posts = []; q.on('request', r => { if (/\/api\/ai\/agent$/.test(r.url()) && r.method() === 'POST') posts.push(JSON.parse(r.postData())); });
    if (await q.$('.nav-item:has-text("Trợ lý AI tạo asset")')) throw new Error('còn trang chat riêng "Trợ lý AI tạo asset"');
    // cột cuối: zone_label trong tin UI DATA gửi AI (tiếng Anh, mọi ngôn ngữ giao diện — v0.20 CNS-067)
    const zones = [['xuong', 'Bàn chỉnh nhân vật', 'Xưởng', 'xuong', 'save_part', 'save_shot', 'Workshop'], ['xuong', 'Bộ khung chuẩn', 'Bộ khung', 'khung', 'save_motion_pack', 'save_shot', 'Core frame'],
      ['thu-vien', 'Nhân vật', 'Thư viện', 'thu-vien', 'list_characters', 'save_part', 'Library'], ['tao-tac', 'Tác phẩm', 'Tạo tác', 'tao-tac', 'save_shot', null, 'Create']];
    for (const [app, nav, label, zone, has, hasnt, labelEn] of zones) {
      if (!new RegExp('/' + app + '$').test(new URL(q.url()).pathname)) { await q.goto(U11 + app); await q.waitForSelector('#dock .dock-ctx .path'); }
      await q.click('.nav-item:text-is("' + nav + '")', { timeout: 5000 }).catch(async () => q.click('.nav-item:has-text("' + nav + '")')); await q.waitForTimeout(350);
      if (!(await q.isVisible('#dock .dock-head')) || !/Trợ lý AI/.test(await q.textContent('#dock .dock-head'))) throw new Error('khu ' + label + ': dock không hiện');
      const path11 = await q.textContent('#dock .dock-ctx .path');
      if (path11.indexOf(label) < 0) throw new Error('khu ' + label + ': context bar ' + path11);
      LLM.steps = []; LLM.reply = 'Chào từ ' + label; await ask(q, 'Xin chào ở ' + label);
      const c = posts[posts.length - 1].context;
      if (c.zone !== zone || !LLM.last.tools.includes(has) || (hasnt && LLM.last.tools.includes(hasnt)) || LLM.last.tools.includes('update_app')) throw new Error('khu ' + label + ': context ' + JSON.stringify(c) + ' tools ' + LLM.last.tools.length);
      if (!LLM.last.ctx || LLM.last.ctx.zone_label !== labelEn || /zone_label|› page/.test(LLM.last.system)) throw new Error('dữ liệu giao diện không nói khu ' + label + ': ' + LLM.last.ctxText.slice(0, 120));
    }
    // liên kết cũ tới trang chat riêng → mở dock
    await q.evaluate(() => { localStorage.setItem('gc-route-xuong', JSON.stringify({ page: 'workshop' })); localStorage.setItem('gc-dock', JSON.stringify({ open: false, w: 380 })); });
    await q.goto(U11 + 'xuong'); await q.waitForSelector('#dock .dock-head'); await q.waitForTimeout(500);
    if (!(await q.evaluate(() => document.body.classList.contains('dock-open') && window.GCDock.state().open))) throw new Error('route workshop cũ không mở dock');
    // màn chọn khu ("/") và trang Hệ thống cũng có dock (vai chung)
    await q.goto(U11); await q.waitForSelector('.appcard'); await q.waitForSelector('#dock .dock-ctx .path');
    if (!(await q.isVisible('#dock .dock-head')) || !/Hệ thống|Chọn khu/.test(await q.textContent('#dock .dock-ctx .path'))) throw new Error('màn chọn khu: dock / context: ' + await q.textContent('#dock .dock-ctx'));
    await q.close();
    console.log('  ✓ Dock Trợ lý AI có ở cả 4 khu (Xưởng · Bộ khung · Thư viện · Tạo tác), không còn trang chat riêng; context bar + payload + bộ tool + chỉ dẫn đổi theo khu; route cũ "workshop" mở dock');

    // ---- 2) thu gọn / mở / kéo rộng / nhớ trạng thái / ngăn kéo màn hẹp ----
    q = await open11(ctx11, U11 + 'thu-vien');
    await q.evaluate(() => localStorage.setItem('gc-dock', JSON.stringify({ open: true, w: 380 }))); await q.reload(); await q.waitForSelector('#dock .dock-head');
    const wid = () => q.evaluate(() => Math.round(document.getElementById('dock').getBoundingClientRect().width));
    if (await wid() !== 380) throw new Error('rộng mặc định ' + await wid());
    await q.focus('#dock .dock-sep'); await q.keyboard.press('ArrowLeft'); await q.keyboard.press('ArrowLeft');
    if (await wid() !== 412) throw new Error('kéo bằng phím: ' + await wid());
    await q.keyboard.down('Alt'); await q.keyboard.press('KeyJ'); await q.keyboard.up('Alt');
    if (await q.isVisible('#dock .dock-head')) throw new Error('Alt+J không thu gọn');
    await q.reload(); await q.waitForSelector('.nav-item'); await q.waitForTimeout(300);
    if (await q.isVisible('#dock .dock-head')) throw new Error('trạng thái thu gọn không được nhớ');
    await q.click('#dockToggle'); await q.waitForSelector('#dock .dock-head', { state: 'visible' });
    if (await wid() !== 412) throw new Error('độ rộng không được nhớ: ' + await wid());
    const box = await (await q.$('#dock .dock-sep')).boundingBox();
    await q.mouse.move(box.x + 3, box.y + 300); await q.mouse.down(); await q.mouse.move(box.x - 60, box.y + 300, { steps: 4 }); await q.mouse.up();
    if (await wid() < 460) throw new Error('kéo chuột không đổi rộng: ' + await wid());
    await q.close();
    const qn = await ctx11.newPage(); await qn.setViewportSize({ width: 1000, height: 800 }); qn.on('pageerror', e => errs11.push(e.message));
    await qn.goto(U11 + 'tao-tac'); await qn.waitForSelector('#dockToggle'); await qn.waitForTimeout(500);
    if (await qn.isVisible('#dock .dock-head')) throw new Error('màn hẹp: dock phải mặc định đóng');
    await qn.click('#dockToggle'); await qn.waitForSelector('#dock .dock-head', { state: 'visible' }); await qn.waitForTimeout(300);
    const nar = await qn.evaluate(() => { const d = document.getElementById('dock'), r = d.getBoundingClientRect(); return { pos: getComputedStyle(d).position, right: Math.round(r.right), w: Math.round(r.width), vw: innerWidth }; });
    if (nar.pos !== 'fixed' || nar.right !== nar.vw || nar.w > 560) throw new Error('màn hẹp: dock không thành ngăn kéo phủ ' + JSON.stringify(nar));
    await qn.close();
    console.log('  ✓ Dock: rộng mặc định 380, kéo đổi được (phím + chuột), thu gọn / mở bằng nút và Alt+J, nhớ trạng thái + độ rộng; < 1100 px thành ngăn kéo phủ');

    // ---- 3) @ picker mờ → chip; chế độ chỉ Alt+P; payload có anchors + snapshot + ước tính token ----
    q = await open11(ctx11, U11 + 'thu-vien'); posts.length = 0; q.on('request', r => { if (/\/api\/ai\/agent$/.test(r.url()) && r.method() === 'POST') posts.push(JSON.parse(r.postData())); });
    await q.click('.nav-item.zone-lib:has-text("Nhân vật")'); await q.waitForSelector('.libcard[data-anchor^="asset:"]');
    const ta = '#dock textarea.dock-ta';
    await q.fill(ta, 'Xem giúp @luubi'); await q.waitForSelector('#dock .dock-pop .pop-opt');
    if (!/Lưu Bị/.test(await q.textContent('#dock .dock-pop .pop-opt'))) throw new Error('@luubi không khớp mờ Lưu Bị: ' + await q.textContent('#dock .dock-pop'));
    await q.keyboard.press('Enter');
    if (!(await q.$('#dock .dock-pins .achip[data-chip="asset:local.my/tq-luu-bi"]')) || /@/.test(await q.inputValue(ta))) throw new Error('@ không chèn chip / không xoá chữ @: ' + await q.inputValue(ta));
    const tk0 = await q.textContent('#dock .tok');
    await q.keyboard.down('Alt'); await q.keyboard.press('KeyP'); await q.keyboard.up('Alt');
    if (!(await q.evaluate(() => document.body.classList.contains('dock-pick')))) throw new Error('Alt+P không bật chế độ chỉ');
    await q.hover('.libcard[data-anchor="asset:local.my/tq-quan-vu"]'); await q.waitForSelector('.pick-ring:not([hidden])');
    if (!/Quan Vũ/.test(await q.textContent('.pick-ring'))) throw new Error('nhãn viền đứt: ' + await q.textContent('.pick-ring'));
    await q.click('.libcard[data-anchor="asset:local.my/tq-quan-vu"]');
    if (await q.evaluate(() => document.body.classList.contains('dock-pick'))) throw new Error('bấm xong chế độ chỉ phải tắt');
    if (!(await q.$('#dock .dock-pins .achip[data-chip="asset:local.my/tq-quan-vu"]'))) throw new Error('click ở chế độ chỉ không thêm chip');
    await q.keyboard.down('Alt'); await q.keyboard.press('KeyP'); await q.keyboard.up('Alt'); await q.keyboard.press('Escape');
    if (await q.evaluate(() => document.body.classList.contains('dock-pick'))) throw new Error('Esc không thoát chế độ chỉ');
    if (await q.textContent('#dock .tok') === tk0) throw new Error('ước tính token không đổi khi ghim thêm');
    LLM.steps = []; LLM.reply = 'Đã xem.'; await ask(q, 'So sánh hai người này');
    const ap = posts[posts.length - 1];
    if (!ap.anchors || ap.anchors.length !== 2 || ap.anchors[0].anchor !== 'asset:local.my/tq-luu-bi' || ap.anchors[1].anchor !== 'asset:local.my/tq-quan-vu' || !/Lưu Bị/.test(ap.anchors[0].snapshot) || ap.anchors[0].kind !== 'asset' || !ap.anchors[0].label) throw new Error('payload anchors: ' + JSON.stringify(ap.anchors).slice(0, 300));
    const pinsLLM = (LLM.last.ctx && LLM.last.ctx.pins) || [];
    if (pinsLLM.length !== 2 || pinsLLM[0].anchor !== 'asset:local.my/tq-luu-bi' || !/Quan Vũ/.test(JSON.stringify(pinsLLM)) || /Quan Vũ/.test(LLM.last.system)) throw new Error('tin dữ liệu gửi LLM thiếu phần tử ghim (hoặc ghim lọt vào chỉ dẫn hệ thống)');
    if (await q.$('#dock .dock-pins .achip')) throw new Error('chip ghim phải được dọn sau khi gửi');
    if (!(await q.$('#dock .msg.user .achip'))) throw new Error('tin của chủ phải còn chip ghim');
    // token THẬT hiện dưới câu trả lời; ô "~N token" ước tính gồm cả chỉ dẫn khu + dữ liệu giao diện + lịch sử (không chỉ chữ gõ + ghim)
    const usageTxt = await q.textContent('#dock .msg.assistant .usage');
    if (!/^token vào 10 · ra 5$/.test(usageTxt.trim())) throw new Error('dock không hiện token thật: ' + usageTxt);
    const tokNow = +(await q.textContent('#dock .tok')).replace(/\D/g, ''), tokReal = Math.round(LLM.last.messages.reduce((n, m) => n + String(m.content || '').length, 0) / 3);
    if (tokNow < 0.6 * tokReal || tokNow > 2 * tokReal || !/chỉ dẫn của khu/.test(await q.getAttribute('#dock .tok', 'title'))) throw new Error('ước tính token ' + tokNow + ' lệch số đo thật ~' + tokReal + ' (phải gồm cả ngữ cảnh)');
    await q.close();
    console.log('  ✓ Ghim: @ mở picker mờ ("@luubi" → Lưu Bị) chèn chip · Alt+P rê → viền đứt + nhãn, click = chip, Esc thoát · ước tính token đổi · payload có anchors[{anchor, kind, id, label, snapshot}] · LLM nhận chỉ dẫn kèm phần tử ghim');

    // Shift+bấm ở chế độ chỉ = ghim NHIỀU phần tử liên tiếp (chế độ chỉ giữ nguyên); bấm thường mới ghim rồi thoát
    q = await open11(ctx11, U11 + 'thu-vien'); await q.click('.nav-item.zone-lib:has-text("Nhân vật")'); await q.waitForSelector('.libcard[data-anchor^="asset:"]');
    const cardIds = await q.$$eval('.libcard[data-anchor^="asset:"]', es => es.slice(0, 3).map(e => e.getAttribute('data-anchor')));
    const pickOn = () => q.evaluate(() => document.body.classList.contains('dock-pick')), pinned = () => q.$$eval('#dock .dock-pins .achip', es => es.map(e => e.getAttribute('data-chip')));
    await q.keyboard.down('Alt'); await q.keyboard.press('KeyP'); await q.keyboard.up('Alt');
    await q.click('.libcard[data-anchor="' + cardIds[0] + '"]', { modifiers: ['Shift'] }); await q.click('.libcard[data-anchor="' + cardIds[1] + '"]', { modifiers: ['Shift'] });
    if (!(await pickOn()) || (await pinned()).length !== 2) throw new Error('Shift+bấm: chế độ chỉ phải giữ nguyên, 2 ghim: ' + JSON.stringify(await pinned()));
    await q.click('.libcard[data-anchor="' + cardIds[2] + '"]');
    if (await pickOn() || JSON.stringify(await pinned()) !== JSON.stringify(cardIds)) throw new Error('bấm thường: ghim rồi thoát chế độ chỉ: ' + JSON.stringify(await pinned()));
    await q.close();
    console.log('  ✓ Shift+bấm ghim nhiều: chế độ chỉ giữ nguyên qua 2 lần Shift+bấm, bấm thường ghim phần tử cuối rồi thoát (3 ghim đúng thứ tự)');

    // ---- 4) Soi: chip trong trả lời → rê tô sáng, bấm đi tới + tô sáng 2 s; "không còn"; kết quả tool tự thành chip ----
    q = await open11(ctx11, U11 + 'thu-vien');
    // khu Thư viện chỉ ghép / sửa asset ĐÃ CÓ (CNS-125): AI chỉnh Lưu Bị → kết quả tool tự thành chip
    const luuRec = await fetch(U11 + 'api/assets/local.my/tq-luu-bi', { headers: H11 }).then(r => r.json());
    LLM.steps = [['save_character', { asset: Object.assign({}, luuRec, { persona: 'Đại ca nhân hậu (AI chỉnh ở Thư viện)' }) }]];
    LLM.reply = 'Mời xem ⟦shot:' + WID + '/' + S1.id + '|Cảnh đầu⟧ và ⟦asset:local.my/ma-khong-ton-tai|Người lạ⟧ nhé.';
    await ask(q, 'Chỉnh tính cách Lưu Bị và chỉ cho tôi cảnh đầu');
    const chips = await q.$$('#dock .msg.assistant .achip');
    if (chips.length < 3) throw new Error('thiếu chip trong trả lời (cảnh, người lạ, kết quả tool): ' + chips.length);
    await q.waitForFunction(() => document.querySelector('#dock .msg.assistant .achip.gone'));
    const gtx = await q.textContent('#dock .msg.assistant .achip.gone');
    if (!/không còn/.test(gtx) || !(await q.$eval('#dock .achip.gone', e => e.disabled)) || !/không còn/.test(await q.getAttribute('#dock .achip.gone', 'aria-label'))) throw new Error('chip phần tử không tồn tại: ' + gtx);
    if (!(await q.$('#dock .msg.assistant .made .achip[data-chip="asset:local.my/tq-luu-bi"]'))) throw new Error('nhân vật AI vừa sửa không tự thành chip');
    const kind = await q.$eval('#dock .msg.assistant .achip', e => e.tagName + ':' + (e.getAttribute('aria-label') || ''));
    if (!/^BUTTON:Chỉ tới/.test(kind)) throw new Error('chip phải là <button> có aria-label: ' + kind);
    // rê chip nhân vật vừa tạo (thẻ nằm trong Thư viện sau khi dock nạp lại): thẻ được tô sáng, phần còn lại mờ
    await q.waitForSelector('.libcard[data-anchor="asset:local.my/tq-luu-bi"]', { timeout: 5000 });
    await q.hover('#dock .msg.assistant .made .achip[data-chip="asset:local.my/tq-luu-bi"]');
    await q.waitForSelector('.spot-ring:not([hidden])'); const dimShadow = await q.$eval('.spot-ring', e => getComputedStyle(e).boxShadow);
    if (!/rgba?\(0, 0, 0, 0\.4/.test(dimShadow) || !/Lưu Bị/.test(await q.textContent('.spot-ring'))) throw new Error('rê chip: tô sáng + nhãn + làm mờ phần còn lại: ' + dimShadow);
    await q.mouse.move(700, 600); await q.waitForSelector('.spot-ring', { state: 'hidden' });
    // bấm chip phân cảnh: điều hướng sang Tạo tác (ứng dụng khác) → tô sáng đúng phân cảnh 2 giây
    await q.click('#dock .msg.assistant .achip[data-chip="shot:' + WID + '/' + S1.id + '"]');
    await q.waitForURL(/\/tao-tac/, { timeout: 8000 }); await q.waitForSelector('#shot-' + S1.id, { timeout: 8000 });
    await q.waitForSelector('.spot-ring:not([hidden])', { timeout: 5000 });
    const near = await q.evaluate(id => { const r = document.querySelector('.spot-ring').getBoundingClientRect(), t = document.getElementById('shot-' + id).getBoundingClientRect(); return Math.abs(r.top - t.top) < 12 && Math.abs(r.left - t.left) < 12; }, S1.id);
    if (!near) throw new Error('vòng tô sáng không nằm đúng phân cảnh');
    await q.waitForSelector('.spot-ring', { state: 'hidden', timeout: 4000 });
    await q.close();
    // Thư viện KHÔNG tạo asset mới từ đầu: tool bị từ chối (✗ trong nhật ký), không có asset mới; AI mời sang Xưởng bằng chip zone: bấm vào → mở ứng dụng Xưởng
    q = await open11(ctx11, U11 + 'thu-vien');
    LLM.steps = [['save_character', { asset: { id: 'tq-ai-moi', name: 'Tướng AI mới', project: 'mau-tam-quoc', look: { eyes: 'round', brows: 'normal', parts: { hat: 'gen.khung/khoi-mu' } } } }]];
    LLM.reply = 'Tạo asset mới thì sang Xưởng nhé: ⟦zone:xuong|Mở Xưởng⟧.';
    await ask(q, 'Vẽ cho tôi một tướng mới');
    if (!(await q.$('#dock .msg.assistant .toollog .bad')) || (await fetch(U11 + 'api/assets/local.my/tq-ai-moi', { headers: H11 })).status !== 404) throw new Error('Thư viện: tạo asset mới từ đầu phải bị từ chối');
    const zchip = '#dock .msg.assistant .achip[data-chip="zone:xuong"]';
    await q.waitForSelector(zchip); if ((await q.textContent(zchip + ' .tx')).trim() !== 'Mở Xưởng' || await q.$eval(zchip, e => e.disabled)) throw new Error('chip chuyển khu: ' + await q.textContent(zchip));
    await q.click(zchip); await q.waitForURL(/\/xuong$/, { timeout: 8000 }); await q.waitForSelector('#dock .dock-ctx .path');
    if (!/Xưởng/.test(await q.textContent('#dock .dock-ctx .path'))) throw new Error('sau chip: chưa ở khu Xưởng: ' + await q.textContent('#dock .dock-ctx .path'));
    await q.close();
    console.log('  ✓ Thư viện không tạo asset mới từ đầu (tool bị từ chối, AI mời sang Xưởng bằng chip ⟦zone:xuong⟧; bấm chip = mở ứng dụng Xưởng) · sửa / ghép asset đã có vẫn được\n  ✓ Soi: anchor trong trả lời thành <button aria-label> · rê = viền + nhãn + phần còn lại mờ · bấm = đi tới (qua ứng dụng khác) + tô sáng 2 s rồi tắt · phần tử không tồn tại = chip "không còn" (vô hiệu) · asset AI vừa tạo tự thành chip');

    // ---- 5) danh sách tác phẩm → phòng tác phẩm (địa chỉ có id); lịch sử chat theo tác phẩm ----
    q = await open11(ctx11, U11 + 'tao-tac'); await q.click('.nav-item:text-is("Tác phẩm")');   // tuyến đã lưu có thể đang ở trong một phòng — về danh sách
    await q.waitForSelector('table.worklist tr.click'); const row = await q.textContent('table.worklist tr.click');
    if (!new RegExp(WID).test(row) || !/Từ vườn đào tới Xích Bích/.test(row) || !/Tam Quốc/.test(row) || !/6/.test(row)) throw new Error('hàng danh sách: ' + row);
    const heads = await q.$$eval('table.worklist th', es => es.map(e => e.textContent)); if (heads.join() !== 'ID,Tên tác phẩm,Dự án,Cảnh,Đạt,Giọng AI,Cập nhật,Trạng thái') throw new Error('cột danh sách: ' + heads.join());
    if (!(await q.$('#dock .dock-ctx .path')) || /Từ vườn/.test(await q.textContent('#dock .dock-ctx .path'))) throw new Error('ở danh sách chưa có tác phẩm đang mở');
    await q.click('table.worklist tr.click'); await q.waitForSelector('.roomtabs'); await q.waitForSelector('#shot-' + S1.id);
    if (!new RegExp('#/tac-pham/' + WID + '/shots$').test(q.url())) throw new Error('địa chỉ phòng tác phẩm: ' + q.url());
    if (!/Từ vườn đào tới Xích Bích/.test(await q.textContent('#dock .dock-ctx .path'))) throw new Error('context bar không nói tác phẩm đang mở: ' + await q.textContent('#dock .dock-ctx .path'));
    const durs = await q.$$eval('.shot .shotmeta .tag[title^="Thời lượng ước tính"]', es => es.map(e => e.textContent));
    if (durs.length !== 6 || !durs.every(t => /^(≈ (\d+|\d+,\d) s|\d+ phút \d+ s)$/.test(t)) || durs.every(t => t === durs[0])) throw new Error('thời lượng ước tính mỗi cảnh: ' + durs.join(' | '));
    durS1 = durs[0];
    const tabs = await q.$$eval('.roomtabs button', es => es.map(e => e.textContent.replace(/[\d\/·\s]+đề xuất|\s*\d+(\/\d+)?$/g, '').trim())); if (tabs.join() !== 'Kịch bản,Phân cảnh,Xem & duyệt,Giọng & âm thanh,Xuất bản') throw new Error('tab phòng: ' + tabs.join());
    LLM.steps = []; LLM.reply = 'Ý tưởng hay cho phim này.'; await ask(q, 'Đề xuất thêm một cảnh về cầu Trường Bản');
    if (!/Ý tưởng hay/.test(await q.textContent('#dock .dock-log'))) throw new Error('chưa thấy trả lời');
    if (!/OPEN WORK: id tq-vuon/.test(LLM.last.system) || !LLM.last.ctx.work || !/Từ vườn đào tới Xích Bích/.test(LLM.last.ctx.work.title) || /Từ vườn đào/.test(LLM.last.system)) throw new Error('Tạo tác: quy trình ở chỉ dẫn, hiện trạng tác phẩm ở tin dữ liệu');
    await q.click('.crumbs a:text-is("Tác phẩm")'); await q.waitForSelector('table.worklist'); 
    await q.waitForTimeout(500); if (/Ý tưởng hay|cầu Trường Bản/.test(await q.textContent('#dock .dock-log'))) throw new Error('rời tác phẩm mà dock vẫn hiện luồng của tác phẩm');
    await q.goBack(); await q.waitForSelector('.roomtabs'); await q.waitForTimeout(500);
    if (!/Ý tưởng hay/.test(await q.textContent('#dock .dock-log')) || !/cầu Trường Bản/.test(await q.textContent('#dock .dock-log'))) throw new Error('mở lại tác phẩm không thấy lại luồng');
    await q.reload(); await q.waitForSelector('.roomtabs'); await q.waitForTimeout(500);
    if (!/Ý tưởng hay/.test(await q.textContent('#dock .dock-log'))) throw new Error('sau tải lại không thấy lại luồng (server giữ)');
    // luồng của asset khác hẳn: sang Thư viện mở nhân vật → luồng riêng, trống
    const th = await fetch(U11 + 'api/chats/work/' + WID, { headers: H11 }).then(r => r.json()); if (th.messages.length !== 2) throw new Error('luồng trên server: ' + th.messages.length);
    // × bỏ ngữ cảnh: AI chỉ biết khu (payload không có đối tượng, chỉ dẫn không có tác phẩm), luồng về luồng của khu; "Gắn lại" trả lại
    const p5 = []; q.on('request', r => { if (/\/api\/ai\/agent$/.test(r.url()) && r.method() === 'POST') p5.push(JSON.parse(r.postData())); });
    await q.click('#dock .dock-ctx .x'); await q.waitForSelector('#dock .dock-ctx button:text-is("Gắn lại")');
    LLM.steps = []; LLM.reply = 'Tôi chỉ biết bạn đang ở khu Tạo tác.'; await ask(q, 'Chào bạn');
    if (p5[0].context.zone !== 'tao-tac' || p5[0].context.object || p5[0].context.page || /OPEN WORK/.test(LLM.last.system) || LLM.last.ctx.work || LLM.last.ctx.object || !LLM.last.tools.includes('save_shot')) throw new Error('bỏ ngữ cảnh: ' + JSON.stringify(p5[0].context));
    await q.click('#dock .dock-ctx button:text-is("Gắn lại")'); await q.waitForFunction(() => /Từ vườn đào/.test(document.querySelector('#dock .dock-ctx .path').textContent));
    await q.goto(U11 + 'tao-tac#/tac-pham/' + WID + '/review'); await q.waitForSelector('.roomtabs'); await q.waitForTimeout(400);
    if (await q.getAttribute('#wtab-review', 'aria-selected') !== 'true') throw new Error('deep link tab review không mở đúng tab');
    await q.close();
    q = await open11(ctx11, U11 + 'thu-vien'); await q.click('.nav-item.zone-lib:has-text("Nhân vật")'); await q.waitForSelector('.libcard[data-anchor^="asset:"]'); await q.waitForTimeout(400);
    if (/Ý tưởng hay|cầu Trường Bản|Xin chào ở (Tạo tác|Xưởng|Bộ khung)/.test(await q.textContent('#dock .dock-log'))) throw new Error('luồng asset không được lẫn tin của tác phẩm / khu');
    await q.close();
    console.log('  ✓ Tạo tác: danh sách (cột ID · tên · dự án · cảnh · Đạt · giọng AI · cập nhật · trạng thái) → click hàng vào phòng, địa chỉ #/tac-pham/<id>/<tab> (deep link, Back); 5 tab; context bar nói tác phẩm; lịch sử chat theo tác phẩm (đổi đối tượng đổi luồng, mở lại / tải lại vẫn thấy, server giữ data/chats)');

    // ---- 6) Xem & duyệt: trạng thái + ghi chú lưu vào tác phẩm, "Đạt x/y" ở phòng + danh sách; Gửi AI sửa theo ghi chú ghim vào dock ----
    q = await open11(ctx11, U11 + 'tao-tac#/tac-pham/' + WID + '/review'); await q.waitForSelector('.rvrow');
    if (!/Đạt 0\/6/.test(await q.textContent('.roomhead'))) throw new Error('đầu phòng: ' + await q.textContent('.roomhead'));
    if ((await q.textContent('.rvrow .rvhead .note:not(.mono)')).trim() !== durS1) throw new Error('thời lượng ước tính ở tab Xem & duyệt khác tab Phân cảnh: ' + await q.textContent('.rvrow .rvhead .note:not(.mono)') + ' vs ' + durS1);
    const rv1 = '.rvrow[data-anchor="shot:' + WID + '/' + S1.id + '"]', rv2 = '.rvrow[data-anchor="shot:' + WID + '/' + S2.id + '"]';
    await q.click(rv1 + ' button[data-review="' + S1.id + ':fix"]'); await q.waitForFunction(sel => document.querySelector(sel + ' button[aria-pressed="true"]').textContent === 'Cần sửa', rv1);
    await q.fill(rv1 + ' input[aria-label^="Ghi chú duyệt"]', 'Lời thoại dài quá, cắt bớt'); await q.selectOption(rv1 + ' select[aria-label="Gắn ghi chú vào bước"]', '2'); await q.click(rv1 + ' button:text-is("+ Ghi chú")');
    await q.waitForSelector(rv1 + ' .note-row'); if (!/Lời thoại dài quá/.test(await q.textContent(rv1 + ' .note-row')) || !/B02/.test(await q.textContent(rv1 + ' .note-row'))) throw new Error('ghi chú gắn bước: ' + await q.textContent(rv1 + ' .note-row'));
    await q.click(rv2 + ' button[data-review="' + S2.id + ':ok"]'); await q.waitForFunction(() => /Đạt 1\/6/.test(document.querySelector('.roomhead').textContent));
    const wsv = await fetch(U11 + 'api/works/' + WID, { headers: H11 }).then(r => r.json());
    if (wsv.review.shots[S1.id].status !== 'fix' || wsv.review.shots[S1.id].notes[0].step !== 2 || wsv.review.shots[S2.id].status !== 'ok') throw new Error('review không lưu vào tác phẩm: ' + JSON.stringify(wsv.review).slice(0, 200));
    await q.click(rv1 + ' button[data-askai]'); await q.waitForSelector('#dock .dock-pins .achip[data-chip="shot:' + WID + '/' + S1.id + '"]');
    if (!(await q.$('#dock .dock-pins .achip[data-chip="step:' + WID + '/' + S1.id + '/2"]')) || !/cắt bớt/.test(await q.inputValue(ta))) throw new Error('Gửi AI sửa theo ghi chú: thiếu ghim cảnh / bước / ghi chú');
    posts.length = 0; q.on('request', r => { if (/\/api\/ai\/agent$/.test(r.url()) && r.method() === 'POST') posts.push(JSON.parse(r.postData())); });
    LLM.steps = []; LLM.reply = 'Đã đọc ghi chú.'; await q.click('#dock button.send'); await q.waitForFunction(() => !window.GCDock.state().busy && /Đã đọc ghi chú/.test(document.querySelector('#dock .dock-log').textContent));
    if (!/Lời thoại dài quá/.test(JSON.stringify(LLM.last.ctx.work.review)) || /Lời thoại dài quá/.test(LLM.last.system)) throw new Error('AI không thấy ghi chú duyệt trong tin dữ liệu (hoặc ghi chú lọt vào chỉ dẫn hệ thống)');
    if (posts[0].anchors.length !== 2 || !/Lời thoại dài quá/.test(JSON.stringify(posts[0].anchors))) throw new Error('payload ghim cảnh + ghi chú: ' + JSON.stringify(posts[0].anchors).slice(0, 300));
    await q.close();
    q = await open11(ctx11, U11 + 'tao-tac'); await q.click('.nav-item:text-is("Tác phẩm")'); await q.waitForSelector('table.worklist tr.click');
    const lrow = await q.$$eval('table.worklist tr.click td', es => es.map(e => e.textContent));
    if (lrow[4] !== '1/6' || lrow[7] !== 'Cần sửa') throw new Error('danh sách chưa hiện Đạt 1/6 + Cần sửa: ' + lrow.join('|'));
    await q.close();
    console.log('  ✓ Xem & duyệt: trạng thái Nháp / Cần sửa / Đạt + ghi chú (gắn cảnh, tuỳ chọn bước) lưu vào work.review qua cổng server · "Đạt 1/6" ở đầu phòng và danh sách (trạng thái "Cần sửa") · "Gửi AI sửa theo ghi chú" ghim cảnh + bước + soạn câu nhờ sửa · AI đọc được ghi chú');

    // ---- 7) đề xuất sửa của AI: diff chờ duyệt với Áp dụng / Bỏ (mô tả + danh sách bước) ----
    q = await open11(ctx11, U11 + 'tao-tac#/tac-pham/' + WID + '/shots'); await q.waitForSelector('#shot-' + S1.id);
    const newSteps = JSON.parse(JSON.stringify(S2.event.steps)); newSteps[0].say = 'Câu mới do AI đề xuất';
    LLM.steps = [['propose_edit', { work: WID, shot: S1.id, field: 'description', value: 'Ba anh em thề nguyện dưới hoa đào, trời quang mây tạnh.', note: 'rõ hơn' }], ['propose_edit', { work: WID, shot: S2.id, field: 'steps', value: newSteps }]];
    LLM.reply = 'Đã đề xuất sửa ⟦shot:' + WID + '/' + S1.id + '|Cảnh 1⟧ và ⟦shot:' + WID + '/' + S2.id + '|Cảnh 2⟧.';
    await ask(q, 'Sửa mô tả cảnh 1 và lời cảnh 2');
    await q.waitForSelector('#shot-' + S1.id + ' .diff', { timeout: 5000 });
    const d1 = await q.textContent('#shot-' + S1.id + ' .diff'), d2 = await q.textContent('#shot-' + S2.id + ' .diff');
    if (!/AI đề xuất sửa mô tả/.test(d1) || !/Áp dụng/.test(d1) || !/Bỏ/.test(d1) || !/hoa đào/.test(d1) || !/AI đề xuất sửa danh sách bước/.test(d2) || !/Câu mới do AI đề xuất/.test(d2)) throw new Error('diff: ' + d1.slice(0, 150) + ' // ' + d2.slice(0, 150));
    if (!(await q.$('#shot-' + S1.id + ' .diff .d-ins')) || !(await q.$('#shot-' + S2.id + ' .diff .d-ins')) || !(await q.$('#shot-' + S2.id + ' .diff .d-del'))) throw new Error('diff thiếu phần thêm / bớt');
    const before = await fetch(U11 + 'api/works/' + WID, { headers: H11 }).then(r => r.json()); if (before.shots[0].description === 'Ba anh em thề nguyện dưới hoa đào, trời quang mây tạnh.') throw new Error('đề xuất đã ghi thẳng');
    if (!/2 đề xuất/.test(await q.textContent('#wtab-shots'))) throw new Error('tab Phân cảnh không báo đề xuất: ' + await q.textContent('#wtab-shots'));
    await q.click('#shot-' + S1.id + ' .diff button:text-is("Áp dụng")'); await q.waitForFunction(id => !document.querySelector('#shot-' + id + ' .diff'), S1.id);
    if (await q.inputValue('#shot-' + S1.id + ' textarea') !== 'Ba anh em thề nguyện dưới hoa đào, trời quang mây tạnh.') throw new Error('Áp dụng không đổi mô tả: ' + await q.inputValue('#shot-' + S1.id + ' textarea'));
    await q.click('#shot-' + S2.id + ' .diff button:text-is("Bỏ")'); await q.waitForFunction(id => !document.querySelector('#shot-' + id + ' .diff'), S2.id);
    const after = await fetch(U11 + 'api/works/' + WID, { headers: H11 }).then(r => r.json());
    if (after.shots[0].description !== 'Ba anh em thề nguyện dưới hoa đào, trời quang mây tạnh.' || JSON.stringify(after.shots[1].event.steps) !== JSON.stringify(S2.event.steps) || (after.proposals || []).length) throw new Error('sau Áp dụng / Bỏ: ' + JSON.stringify({ d: after.shots[0].description, p: after.proposals }));
    await q.close();
    console.log('  ✓ Đề xuất sửa (propose_edit): AI không ghi thẳng — Phân cảnh hiện diff chờ duyệt (mô tả: từ thêm / bớt; bước: dòng thêm / bớt) với Áp dụng / Bỏ; Áp dụng đổi qua cổng phân cảnh, Bỏ không đổi gì');

    // ---- 8) các tab còn lại của phòng + chưa có key LLM ----
    q = await open11(ctx11, U11 + 'tao-tac#/tac-pham/' + WID + '/voice'); await q.waitForSelector('#wpanel-voice:not([hidden])');
    const vt = await q.textContent('#wpanel-voice');
    if (!/Ngôn ngữ & giọng vùng/.test(vt) || !/Lồng tiếng AI/.test(vt) || !/Giọng chốt theo nhân vật/.test(vt) || !/Âm thanh/.test(vt) || !/Đạt luật ghép S1–S7|cảnh báo|lỗi/.test(vt)) throw new Error('tab Giọng & âm thanh: ' + vt.slice(0, 200));
    await q.click('#wtab-publish'); const pt = await q.textContent('#wpanel-publish');
    if (!/Phim \(HTML\)/.test(pt) || !/Storyboard SVG/.test(pt) || !/Storyboard PNG/.test(pt) || !/JSON/.test(pt) || !/Gói dự án/.test(pt)) throw new Error('tab Xuất bản: ' + pt.slice(0, 200));
    await q.click('#wtab-script'); if (!(await q.$('#wpanel-script textarea')) || !/Dàn nhân vật/.test(await q.textContent('#wpanel-script')) || !(await q.$('#wpanel-script select[aria-label="Ngôn ngữ lời thoại"]'))) throw new Error('tab Kịch bản thiếu logline / dàn nhân vật / ngôn ngữ');
    await q.close();
    // ---- 9) bảng tác phẩm: tìm (bỏ dấu, theo tên / id / dự án) + lọc theo dự án + lọc theo trạng thái + bộ đếm ----
    for (const [t, pj] of [['Phim lọc A', 'ci-loc'], ['Truyện lọc B', 'ci-loc']]) await fetch(U11 + 'api/works', { method: 'POST', headers: H11, body: JSON.stringify({ title: t, project: pj }) });
    q = await open11(ctx11, U11 + 'tao-tac'); await q.click('.nav-item:text-is("Tác phẩm")'); await q.waitForSelector('table.worklist tr.click');
    const nRows = () => q.$$eval('table.worklist tr.click', es => es.length), cnt = () => q.textContent('#workCount');
    if (await nRows() !== 3 || !/^3 \/ 3 tác phẩm/.test(await cnt())) throw new Error('bảng chưa đủ 3 tác phẩm: ' + await cnt());
    await q.fill('input[aria-label="Tìm tác phẩm"]', 'LỌC'); if (await nRows() !== 2 || !/^2 \/ 3/.test(await cnt())) throw new Error('tìm "LỌC" (hoa / có dấu): ' + await nRows());
    await q.fill('input[aria-label="Tìm tác phẩm"]', 'xich'); if (await nRows() !== 1 || !/Xích Bích/.test(await q.textContent('table.worklist tr.click'))) throw new Error('tìm "xich" (bỏ dấu) phải ra phim Tam Quốc');
    await q.fill('input[aria-label="Tìm tác phẩm"]', 'tq-vuon'); if (await nRows() !== 1) throw new Error('tìm theo id');
    await q.fill('input[aria-label="Tìm tác phẩm"]', 'tam quoc'); if (await nRows() !== 1) throw new Error('tìm theo tên dự án');
    await q.fill('input[aria-label="Tìm tác phẩm"]', 'khong-co-gi'); if (await nRows() !== 0 || !/Không có tác phẩm nào khớp bộ lọc/.test(await q.textContent('table.worklist'))) throw new Error('không khớp: phải báo "Không có tác phẩm nào khớp bộ lọc"');
    await q.fill('input[aria-label="Tìm tác phẩm"]', '');
    await q.selectOption('select[aria-label="Lọc theo dự án"]', 'ci-loc'); if (await nRows() !== 2) throw new Error('lọc dự án ci-loc: ' + await nRows());
    await q.selectOption('select[aria-label="Lọc theo dự án"]', PJ_TQ); if (await nRows() !== 1) throw new Error('lọc dự án ' + PJ_TQ + ': ' + await nRows());
    await q.selectOption('select[aria-label="Lọc theo dự án"]', '*');
    await q.selectOption('select[aria-label="Lọc theo trạng thái"]', 'empty'); if (await nRows() !== 2) throw new Error('lọc "Trống": ' + await nRows());
    await q.selectOption('select[aria-label="Lọc theo trạng thái"]', 'fix'); if (await nRows() !== 1 || !/Xích Bích/.test(await q.textContent('table.worklist tr.click'))) throw new Error('lọc "Cần sửa" phải ra phim Tam Quốc (đã có cảnh Cần sửa ở bước 6)');
    await q.selectOption('select[aria-label="Lọc theo trạng thái"]', 'ok'); if (await nRows() !== 0) throw new Error('lọc "Đã duyệt": ' + await nRows());
    await q.close();
    console.log('  ✓ Bảng tác phẩm: tìm (hoa / thường, bỏ dấu, theo tên · id · tên dự án) · lọc theo dự án · lọc theo trạng thái (Trống / Cần sửa / Đã duyệt) · bộ đếm "n / m tác phẩm" · báo "không khớp"');
    const home12 = mkdtempSync(path.join(tmpdir(), 'gc-')), srv12 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home12, GC_PORT: '7572', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
    await up(7572);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
    q = await open11(ctx11, 'http://localhost:7572/xuong');
    const gate = await q.textContent('#dock .dock-gate'); if (!/Chưa có API key LLM/.test(gate) || !(await q.isDisabled('#dock button.send'))) throw new Error('chưa có key: thiếu lời nhắc / nút gửi chưa khoá: ' + gate);
    await q.click('#dock .dock-gate button:has-text("Mở Cài đặt AI")'); await q.waitForSelector('text=Cài đặt AI >> nth=0');
    if (!(await q.isVisible('#dock .dock-head'))) throw new Error('dock biến mất ở trang Cài đặt AI');
    await q.close(); srv12.kill();
    console.log('  ✓ Phòng tác phẩm đủ 5 tab (Kịch bản: logline + dàn nhân vật + ngôn ngữ · Giọng & âm thanh: giọng vùng, lồng tiếng, giọng chốt, lint S1–S7 · Xuất bản: phim, storyboard, JSON, gói) · chưa có key LLM: dock vẫn hiện, kèm lời nhắc + lối tới Cài đặt AI');
    if (errs11.length) throw new Error('lỗi trang: ' + errs11.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ dock Trợ lý AI + phòng tác phẩm:', e.message); if (errs11.length) console.log('    lỗi trang:', errs11.slice(0, 3).join(' | ')); if (q) { try { console.log('    trang:', q.url()); } catch (x) { /* đã đóng */ } } }
  finally { await b11.close(); srv11.kill(); mock11.close(); }
}
// ---- v0.19: OAuth cho MCP từ xa — trang "Cấp phép kết nối agent" (tự chứa, ngoài Studio) + Cài đặt › Kết nối agent. GC_ONLY=oauth chỉ chạy nhóm này (cổng 7664–7666).
// Không ra mạng ngoài: callback của agent (claude.ai …) bị chặn lại bằng page.route và đọc URL đích.
if (want('oauth')) {
  const crypto = await import('crypto');
  const H = 'https://chibi.example.test', TOK = 'tok-oauth-' + crypto.randomBytes(6).toString('hex'), CB = 'https://claude.ai/api/mcp/auth_callback', ALT = 'https://agent.example.org/cb';
  const home13 = mkdtempSync(path.join(tmpdir(), 'gc-')), srv13 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home13, GC_PORT: '7664', GC_NO_AUTOCHECK: '1', GC_API_TOKEN: TOK, GC_PUBLIC_URL: H, GC_OAUTH_REDIRECTS: ALT }, stdio: 'ignore' }));
  const home14 = mkdtempSync(path.join(tmpdir(), 'gc-')), srv14 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home14, GC_PORT: '7665', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  const home15 = mkdtempSync(path.join(tmpdir(), 'gc-')), srv15 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home15, GC_PORT: '7666', GC_NO_AUTOCHECK: '1', GC_PUBLIC_URL: H }, stdio: 'ignore' }));
  await up(7664, 7665, 7666);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  autoLogin(false); const B = 'http://127.0.0.1:7664', b13 = await pw.chromium.launch(); autoLogin(true);   // nhóm này tự lo đăng nhập (token trong trang Cấp phép, phiên khi cần)
  const own = { 'Content-Type': 'application/json', 'X-GC-Request': '1', Authorization: 'Bearer ' + TOK };
  const reg = async (base, name, uri) => (await fetch(base + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: name, redirect_uris: [uri || CB] }) })).json();
  const mkq = (cl, uri) => { const v = crypto.randomBytes(32).toString('base64url'); return { v, q: new URLSearchParams({ response_type: 'code', client_id: cl.client_id, redirect_uri: uri || CB, code_challenge: crypto.createHash('sha256').update(v).digest('base64url'), code_challenge_method: 'S256', state: 'trinh-duyet-1', scope: 'mcp:write' }).toString() }; };
  const errs13 = []; let q = null;
  try {
    const ctx = await b13.newContext(); q = await ctx.newPage();
    q.on('pageerror', e => errs13.push(e.message));
    const landed = [];
    await ctx.route(/^https:\/\/(claude\.ai|agent\.example\.org)\//, r => { landed.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<title>cb</title>cb' }); });
    // ---- trang Cấp phép: chưa có token trong trình duyệt
    const c1 = await reg(B, '<img src=x onerror=alert(1)> Claude', CB), k1 = mkq(c1);
    await q.goto(B + '/oauth/authorize?' + k1.q);
    await q.waitForSelector('#ok');
    const t0 = await q.textContent('main');
    // trang Cấp phép theo Accept-Language của trình duyệt (Playwright mặc định en-US → tiếng Anh; bản vi: tools/test-i18n-server.mjs)
    if (!/Authorize agent connection/.test(t0) || !/claude\.ai/.test(await q.textContent('#cb')) || !/known domain/.test(await q.textContent('#cc'))) throw new Error('trang thiếu tiêu đề / tên miền callback / nhãn "quen": ' + t0.slice(0, 200));
    if (await q.$('main img') || !/<img src=x/.test(await q.textContent('#cn'))) throw new Error('tên agent phải hiện nguyên chữ, không dựng thẻ');
    if (!(await q.isVisible('#tk')) || (await q.inputValue('#tki')) !== '') throw new Error('có GC_API_TOKEN mà chưa đăng nhập: phải hiện ô nhập token chủ máy');
    if ((await q.$$('#sc input[type=radio]')).length !== 3 || (await q.inputValue('#sc input:checked')) !== 'mcp:write') throw new Error('3 mức quyền, mặc định mcp:write');
    console.log('  ✓ Trang Cấp phép: tiêu đề · tên agent (chữ thô) · domain callback + nhãn "quen" · ô token chủ máy · 3 mức quyền, mặc định mcp:write');
    // chống bấm nhầm / clickjacking qua popup: nút Cấp phép chỉ bật sau 800 ms kể từ khi trang hiện hoặc nhận lại focus
    for (const ev of ['focus', 'visibilitychange']) {
      const armT = await q.evaluate(async name => { if (name === 'focus') window.dispatchEvent(new Event('focus')); else document.dispatchEvent(new Event('visibilitychange')); const b = document.getElementById('ok'), dis = b.disabled; b.click(); const t0 = performance.now(); await new Promise(res => { const iv = setInterval(() => { if (!b.disabled) { clearInterval(iv); res(); } }, 5); }); return { dis, ms: performance.now() - t0 }; }, ev);
      if (!armT.dis || armT.ms < 700 || armT.ms > 4000 || landed.length) throw new Error('nút Cấp phép phải tắt ~800 ms sau ' + ev + ' (tắt=' + armT.dis + ', chờ ' + Math.round(armT.ms) + ' ms, đã quay về=' + landed.length + ')');
    }
    console.log('  ✓ Nút Cấp phép chỉ bật sau ~800 ms kể từ khi trang hiện / nhận lại focus (bấm khi đang tắt không làm gì)');
    if (/\sstyle\s*=/.test(await q.content())) throw new Error('trang Cấp phép còn style inline (CSP chặn)');
    await q.fill('#tki', 'token-sai'); await q.click('#ok');
    await q.waitForFunction(() => !document.getElementById('er').hidden);
    if (!/owner token/.test(await q.textContent('#er')) || landed.length) throw new Error('token sai: phải báo lỗi và KHÔNG quay về agent');
    console.log('  ✓ Token chủ sai → báo lỗi, không cấp, không quay về agent');
    await q.fill('#tki', TOK); await q.check('#sc input[value="mcp:read"]'); await q.click('#ok');
    await q.waitForFunction(() => location.protocol === 'https:', null, { timeout: 8000 });
    const u1 = new URL(landed[0]);
    if (u1.origin + u1.pathname !== CB || u1.searchParams.get('state') !== 'trinh-duyet-1' || u1.searchParams.get('iss') !== H || !u1.searchParams.get('code')) throw new Error('redirect sai: ' + landed[0]);
    const tk1 = await (await fetch(B + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: u1.searchParams.get('code'), redirect_uri: CB, client_id: c1.client_id, code_verifier: k1.v }).toString() })).json();
    if (tk1.scope !== 'mcp:read') throw new Error('phạm vi chủ chọn (mcp:read) không vào token: ' + JSON.stringify(tk1));
    console.log('  ✓ Cấp phép → quay về callback kèm code + state + iss; token mang đúng mức chủ chọn (mcp:read)');
    // ---- Từ chối
    landed.length = 0;
    const c2 = await reg(B, 'Agent B', CB), k2 = mkq(c2);
    await q.addInitScript(t => { try { localStorage.setItem('gc-token', t); } catch (e) { /* bỏ qua */ } }, TOK);
    await q.goto(B + '/oauth/authorize?' + k2.q); await q.waitForSelector('#ok');
    if (await q.isVisible('#tk')) throw new Error('đã có token trong trình duyệt (đăng nhập Studio): không hỏi lại');
    await q.click('#no'); await q.waitForFunction(() => location.protocol === 'https:', null, { timeout: 8000 });
    const u2 = new URL(landed[0]);
    if (u2.searchParams.get('error') !== 'access_denied' || u2.searchParams.get('state') !== 'trinh-duyet-1' || u2.searchParams.get('code')) throw new Error('từ chối: ' + landed[0]);
    console.log('  ✓ Từ chối → error=access_denied (+state), không có code');
    // ---- callback lạ + lỗi redirect_uri
    landed.length = 0;
    const c3 = await reg(B, 'Agent lạ', ALT), k3 = mkq(c3, ALT);
    await q.goto(B + '/oauth/authorize?' + k3.q); await q.waitForSelector('#ok');
    if (await q.isVisible('#warn') || !/added by you/.test(await q.textContent('#cc')) || !/agent\.example\.org/.test(await q.textContent('#cb'))) throw new Error('callback do chủ thêm (GC_OAUTH_REDIRECTS): phải ghi rõ "bạn đã thêm" + domain: ' + await q.textContent('#cc'));
    await q.goto(B + '/oauth/authorize?' + mkq(c3, ALT).q.replace(encodeURIComponent(ALT), encodeURIComponent('https://evil.example/cb')));
    const bad = await q.textContent('main');
    if (!/no redirect/.test(bad) || landed.length || new URL(q.url()).origin !== B) throw new Error('redirect_uri lệch: phải hiện trang lỗi, không chuyển hướng');
    console.log('  ✓ Callback do chủ thêm (GC_OAUTH_REDIRECTS) → ghi rõ domain + "bạn đã thêm"; redirect_uri lệch → trang lỗi, KHÔNG chuyển hướng');
    // ---- Cài đặt › Kết nối agent
    await q.goto(B + '/xuong'); await q.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
    await q.click('.nav-item:has-text("Kết nối agent")'); await q.waitForSelector('#connectUrl');
    if ((await q.textContent('#connectUrl')) !== H + '/mcp') throw new Error('địa chỉ MCP sai: ' + await q.textContent('#connectUrl'));
    const pageTxt = await q.textContent('#connectBox');
    // v0.23: hướng dẫn nối agent = thẻ dùng chung (#connectCards — cùng component với wizard lần đầu, CNS-134 / CNS-261)
    const cardsTxt = (await q.textContent('#connectCards').catch(() => '')) || '';
    if (!/Customize › Connectors › Add custom connector/.test(cardsTxt) || !cardsTxt.includes('claude mcp add -s user --transport http gen-chibi ' + H + '/mcp') || !/Ba mức quyền/.test(pageTxt) || !/Link có khoá \(cách cũ/.test(pageTxt)) throw new Error('thiếu thẻ nối agent (claude.ai 3 bước + lệnh Claude Code OAuth) / mức quyền / mục link cũ');
    if (!(await q.isChecked('#connectReg'))) throw new Error('công tắc tự đăng ký mặc định phải BẬT khi có GC_PUBLIC_URL');
    const rows = await q.$$('#connectTable tr[data-client]');
    if (rows.length !== 3) throw new Error('bảng client: muốn 3 dòng, có ' + rows.length);
    const row1 = q.locator('#connectTable tr[data-client="' + c1.client_id + '"]');
    const r1 = await row1.textContent();
    if (!/claude\.ai/.test(r1) || !/Đang kết nối/.test(r1) || !/<img src=x/.test(r1)) throw new Error('dòng client 1: ' + r1);
    if (!/Chờ cấp phép/.test(await q.locator('#connectTable tr[data-client="' + c2.client_id + '"]').textContent())) throw new Error('client chưa cấp phép phải hiện "Chờ cấp phép"');
    if (await q.$('#connectBox img')) throw new Error('tên agent dựng thành thẻ img');
    if ((await q.content()).includes(tk1.access_token) || (await q.content()).includes(tk1.refresh_token)) throw new Error('trang Cài đặt lộ token');
    console.log('  ✓ Cài đặt › Kết nối agent: địa chỉ MCP + 3 bước + công tắc (mặc định bật) + bảng client (tên, domain, trạng thái) + 3 mức quyền + mục link cũ; không lộ token');
    // đổi phạm vi + thu hồi
    const mcp = (tok, name, args) => fetch(B + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }).then(r => r.json());
    if (!/FORBIDDEN/.test((await mcp(tk1.access_token, 'save_project', { id: 'bt-1', name: 'x' })).result.content[0].text)) throw new Error('mcp:read phải chặn save_project');
    await row1.locator('select').selectOption('mcp:write');
    await row1.locator('button:has-text("Đổi phạm vi")').click();
    await q.waitForFunction(id => /Tạo và sửa/.test(document.querySelector('tr[data-client="' + id + '"] select option:checked').textContent) && document.querySelector('tr[data-client="' + id + '"] button.sm:not(.danger)').disabled, c1.client_id);
    if ((await mcp(tk1.access_token, 'save_project', { id: 'bt-1', name: 'x' })).result.isError) throw new Error('đổi phạm vi lên mcp:write: phải có hiệu lực ngay');
    console.log('  ✓ Đổi phạm vi (read → write) trên bảng: token đang dùng đổi quyền ngay');
    q.once('dialog', d => d.accept());
    await row1.locator('button:has-text("Thu hồi")').click();
    await q.waitForFunction(id => /Đã thu hồi/.test(document.querySelector('tr[data-client="' + id + '"]').textContent), c1.client_id);
    const after = await fetch(B + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk1.access_token }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
    if (after.status !== 401) throw new Error('thu hồi: token vẫn dùng được (' + after.status + ')');
    console.log('  ✓ Thu hồi (có hỏi lại) → trạng thái "Đã thu hồi", token của client đó 401');
    // công tắc tự đăng ký
    await q.uncheck('#connectReg'); await q.waitForFunction(() => !document.getElementById('connectReg').checked);
    const off = await fetch(B + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'x', redirect_uris: [CB] }) });
    if (off.status !== 403) throw new Error('tắt công tắc: /oauth/register phải 403, nay ' + off.status);
    await q.check('#connectReg'); await q.waitForFunction(() => document.getElementById('connectReg').checked);
    if ((await fetch(B + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'x', redirect_uris: [CB] }) })).status !== 201) throw new Error('bật lại phải đăng ký được');
    console.log('  ✓ Công tắc "Cho phép agent tự đăng ký": tắt → 403, bật lại → 201');
    // ---- chưa đặt GC_PUBLIC_URL: báo cần đặt, không hiện địa chỉ
    const q14 = await ctx.newPage(); q14.on('pageerror', e => errs13.push(e.message));
    await ensureSession(ctx, 'http://127.0.0.1:7665');   // v0.21: Studio cần đăng nhập (máy này dùng token chung của bộ test)
    await q14.goto('http://127.0.0.1:7665/xuong'); await q14.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
    await q14.click('.nav-item:has-text("Kết nối agent")'); await q14.waitForSelector('#connectBox .chip');
    const off14 = await q14.textContent('#connectBox');
    if (!/Chưa bật/.test(off14) || !/genchibi online/.test(off14) || /genchibi expose/.test(off14) || await q14.$('#connectUrl')) throw new Error('thiếu địa chỉ công khai: phải chỉ Lên mạng / genchibi online (không còn genchibi expose, bỏ ở v0.23) + không có địa chỉ MCP: ' + off14.slice(0, 300));
    console.log('  ✓ Chưa có địa chỉ công khai: Cài đặt báo "Chưa bật" + chỉ Hệ thống › Lên mạng / genchibi online (không còn genchibi expose), không có địa chỉ MCP');
    // ---- v0.21 (CNS-191): máy không đặt GC_API_TOKEN vẫn có token chủ (tự sinh) — chủ mở ở chính máy KHÔNG còn được miễn; cấp phép bằng phiên đăng nhập (S)
    const c5 = await reg('http://127.0.0.1:7666', 'Agent local', CB), k5 = mkq(c5), ctx15 = await b13.newContext(), q15 = await ctx15.newPage();
    q15.on('pageerror', e => errs13.push(e.message));
    await q15.route(/^https:\/\/claude\.ai\//, r => { landed.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: 'cb' }); });
    landed.length = 0;
    await q15.goto('http://127.0.0.1:7666/oauth/authorize?' + k5.q); await q15.waitForSelector('#ok');
    if (!(await q15.isVisible('#tk')) || await q15.isVisible('#lg')) throw new Error('chưa đăng nhập, máy chưa có mật khẩu: phải hỏi token (chưa có lối đăng nhập)');
    await q15.waitForFunction(() => !document.getElementById('ok').disabled); await q15.click('#ok');
    await q15.waitForFunction(() => !document.getElementById('er').hidden);
    if (landed.length) throw new Error('không token / phiên mà vẫn cấp phép được');
    await ensureSession(ctx15, 'http://127.0.0.1:7666');   // chủ đặt mật khẩu + đăng nhập (cookie phiên)
    const ctx15b = await b13.newContext(), q15b = await ctx15b.newPage(); q15b.on('pageerror', e => errs13.push(e.message));
    await q15b.route(/^https:\/\/claude\.ai\//, r => { landed.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: 'cb' }); });
    const k6 = mkq(await reg('http://127.0.0.1:7666', 'Agent local 2', CB));
    await q15b.goto('http://127.0.0.1:7666/oauth/authorize?' + k6.q); await q15b.waitForSelector('#lga');
    if (!(await q15b.isVisible('#lga')) || !/^\/login\?next=%2Foauth%2Fauthorize%3F/.test(await q15b.getAttribute('#lga', 'href'))) throw new Error('máy đã có mật khẩu, trình duyệt chưa đăng nhập: trang Cấp phép phải có lối "Đăng nhập bằng mật khẩu chủ" quay lại đúng trang');
    await q15b.click('#lga'); await q15b.waitForSelector('#gcLogin form[data-auth="login"]', { timeout: 8000 });
    await q15b.fill('#gcUser', TEST_USER); await q15b.fill('#gcPw', TEST_PW); await q15b.click('#gcLogin button[type=submit]');
    await q15b.waitForURL(/\/oauth\/authorize\?/, { timeout: 8000 }); await q15b.waitForSelector('#ok');
    if (await q15b.isVisible('#tk')) throw new Error('đăng nhập xong quay lại trang Cấp phép: không hỏi token nữa (phiên S)');
    await q15b.waitForFunction(() => !document.getElementById('ok').disabled); await q15b.click('#ok'); await q15b.waitForFunction(() => location.protocol === 'https:', null, { timeout: 8000 });
    if (!landed.length || !new URL(landed[landed.length - 1]).searchParams.get('code')) throw new Error('cấp phép bằng phiên: không có code: ' + landed.join(' | '));
    await ctx15.close(); await ctx15b.close();
    console.log('  ✓ v0.21: không đặt GC_API_TOKEN vẫn có token chủ — chủ ở chính máy không được miễn (hỏi token, không cấp được); máy có mật khẩu: trang Cấp phép → "Đăng nhập" → quay lại đúng trang → Cấp phép bằng phiên (không cần token)');
    if (errs13.length) throw new Error('lỗi trang: ' + errs13.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ OAuth (trang Cấp phép + Kết nối agent):', e.message); if (errs13.length) console.log('    lỗi trang:', errs13.slice(0, 3).join(' | ')); }
  finally { await b13.close(); srv13.kill(); srv14.kill(); srv15.kill(); }
}
// ---- v0.20 (ADR 0007, INT-18): giao diện tiếng Anh là mặc định, chuyển sang tiếng Việt được (nút EN | VI), nhớ theo trình duyệt,
// mặc định của máy (settings.uiLang); lỗi server hiện theo ngôn ngữ người dùng. GC_ONLY=i18n chỉ chạy nhóm này (cổng 7668).
// v0.21 P4 (spec v021 §2, §3.3, §3.7): Hệ thống › Lên mạng (Go online) + Tài khoản chủ — đi thật trên Studio, không gọi mạng ngoài:
//   · server A (cổng 7672): GC_TEST_ONLINE_VIA trỏ lời gọi "từ Internet" của wizard về chính nó, GC_TEST_CF_API = Cloudflare API GIẢ
//     (tools/fixtures/fake-cloudflare-api.mjs, dùng chung với tools/test-online.mjs), GC_IN_DOCKER=1 (đường Caddy hiện được; edge chưa bật);
//     Caddy tới bậc "edge chưa publish" (cách sửa = đúng một lệnh host) → Cloudflare: token chỉ ở ô password, chọn zone (choices), CNAME đã có → hỏi đè →
//     WAF → MCP → Xong (link Studio + MCP, trỏ Kết nối agent) → đổi địa chỉ (urlChange, số kết nối bị gỡ) → proxy riêng (đoạn cấu hình + chép) →
//     Go offline có token (dọn tunnel + CNAME ở Cloudflare giả) → WAF không quyền: "Tôi đã làm" → Go offline không token (bậc dọn Cloudflare ✗ làm tay)
//     → Tài khoản chủ: lưới phiên + thiết bị, thu hồi một phiên, cảnh báo đăng nhập sai + Đã xem, đổi mật khẩu thu hồi phiên khác, token chủ không hiện;
//   · server B (7680): máy kế thừa (.env GC_PUBLIC_URL) — wizard chỉ đọc + Migrate (POST /api/online/migrate);
//   · launcher thật + app + cloudflared giả (7676, như tools/test-ingress.mjs): Link tạm đi hết qua cổng ingress → Xong → Go offline (cloudflared dừng).
//   Ở mỗi màn chính: chế độ en không còn chữ Việt, bố cục 1366 px không chồng; GC_SHOTS=<thư mục> → chụp en + vi (Q29). GC_ONLY=online chỉ chạy nhóm này.
if (want('online')) {
  const crypto = await import('crypto'), net = await import('net'), http = await import('http'), os = await import('os');
  const { fakeCloudflare } = await import('./fixtures/fake-cloudflare-api.mjs');
  const SHOTS = process.env.GC_SHOTS || '';
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const CF_TOK = 'cfapi_' + crypto.randomBytes(18).toString('hex');
  const cf = await fakeCloudflare({ token: CF_TOK, zones: [{ id: crypto.randomBytes(16).toString('hex'), name: 'example.com', status: 'active', type: 'full' }, { id: crypto.randomBytes(16).toString('hex'), name: 'other.org', status: 'active', type: 'full' }],
    dns: [{ type: 'A', name: 'chibi.example.com', content: '45.33.32.156' }] });
  const PA = 7672, PB = 7680, PL = 7676, PLX = 7679;
  const homeA = mkdtempSync(path.join(tmpdir(), 'gc-'));
  let logA = '';
  const srvA = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: homeA, GC_PORT: String(PA), GC_NO_AUTOCHECK: '1', GC_TEST: '1', GC_TEST_ONLINE_VIA: '127.0.0.1:' + PA, GC_TEST_CF_API: cf.base, GC_IN_DOCKER: '1',
    GC_CLIENT_IP_HEADER: 'x-forwarded-for', GC_AUTH_RATE: '3', GC_PUBLIC_URL: '', GC_ALLOWED_HOSTS: '', HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: '', NO_PROXY: '', no_proxy: '' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  srvA.stdout.on('data', d => { logA += d; }); srvA.stderr.on('data', d => { logA += d; });
  const homeB = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srvB = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: homeB, GC_PORT: String(PB), GC_NO_AUTOCHECK: '1', GC_PUBLIC_URL: 'https://legacy.example.test', GC_ALLOWED_HOSTS: 'legacy.example.test' }, stdio: 'ignore' }));
  await up(PA, PB);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  legacyVi(true); const b20 = await pw.chromium.launch();
  const errs20 = [], VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
  const found = [], shotList = [];
  let launcher = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    const ctx = await b20.newContext({ viewport: { width: 1366, height: 900 } });
    const q = await ctx.newPage(); q.on('pageerror', e => errs20.push(e.message)); q.on('dialog', d => d.accept().catch(() => {}));
    const ready = pg => pg.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 10000 });
    const openPage = async (pg, base, page, sel) => { await pg.goto(base + '/xuong'); await ready(pg); await pg.waitForSelector('.nav-item'); await pg.evaluate(p => localStorage.setItem('gc-route-xuong', JSON.stringify({ page: p })), page); await pg.reload(); await ready(pg); await pg.waitForSelector(sel, { timeout: 10000 }); };
    const idle = (pg, ms) => pg.waitForFunction(() => document.getElementById('olBox') && document.getElementById('olStatus') && !document.getElementById('olBusy'), null, { timeout: ms || 30000 });
    const step = (pg, id) => pg.$eval('#olSteps tr[data-step="' + id + '"]', tr => ({ state: tr.getAttribute('data-state'), text: tr.textContent })).catch(() => null);
    const gap = () => sleep(2100);   // trần lệnh Go online: hai lệnh cách nhau ≥ 2 giây (CNS-180)
    const leak = pg => pg.evaluate(t => document.documentElement.outerHTML.includes(t) || JSON.stringify(localStorage).includes(t) || JSON.stringify(sessionStorage).includes(t) || [...document.querySelectorAll('input')].some(i => (i.value || '').includes(t)), CF_TOK);
    // quét chữ Việt ở chế độ en (như nhóm i18n: bỏ ô nhập, nội dung người dùng) + bố cục thanh đầu trang / banner ở 1366 px
    const scanEn = (pg, where) => pg.evaluate(([where, src]) => {
      const VI = new RegExp(src), out = [], vis = el => !!el && (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0);
      const skip = el => !!el.closest('[data-user-content], [lang|="vi"], script, style, input, textarea, svg title');
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) { const el = n.parentElement; if (el && VI.test(n.nodeValue) && !skip(el) && vis(el)) out.push(where + ' · ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' · ' + n.nodeValue.trim().slice(0, 90)); }
      for (const el of document.body.querySelectorAll('[title], [placeholder], [aria-label]')) { if (skip(el) && el.tagName !== 'INPUT' || !vis(el)) continue; for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && VI.test(v)) out.push(where + ' · [' + a + '] ' + v.slice(0, 90)); } }
      const R = e => e.getBoundingClientRect(), hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      const items = [...document.querySelectorAll('.pagehead .actions > *, #dockToggle, #crumbs')].filter(vis);
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (!items[i].contains(items[j]) && !items[j].contains(items[i]) && hit(R(items[i]), R(items[j]))) out.push('BỐ CỤC ' + where + ' · thanh đầu trang chồng: ' + items[i].textContent.trim().slice(0, 30) + ' ↔ ' + items[j].textContent.trim().slice(0, 30));
      for (const sp of document.querySelectorAll('.banner > span:first-child')) { if (!vis(sp)) continue; const w = R(sp).width, bw = R(sp.parentElement).width; if (bw > 320 && w < 180) out.push('BỐ CỤC ' + where + ' · chữ banner bị ép ' + Math.round(w) + 'px'); }
      const view = document.getElementById('view'); if (view && view.scrollWidth > view.clientWidth + 4) out.push('BỐ CỤC ' + where + ' · trang tràn ngang ' + view.scrollWidth + ' > ' + view.clientWidth);
      // lưới không được tràn ngang ở MỌI bộ phông: đo với phông của máy, rồi đo lại với phông rộng (DejaVu Sans — mặc định sans-serif của runner Ubuntu
      // khi không có IBM Plex / Inter: CI run 39719396085 tràn 729 > 724 chỉ ở đó) + giãn chữ 3 %. Bảng kiểu dựng sẵn (adoptedStyleSheets) không vướng CSP.
      const gridOver = tag => { for (const sc of document.querySelectorAll('#olBox .scroll, #acBox .scroll')) if (vis(sc) && sc.scrollWidth > sc.clientWidth + 2) out.push('BỐ CỤC ' + where + tag + ' · lưới ' + ((sc.firstElementChild || {}).id || '') + ' tràn ngang ' + sc.scrollWidth + ' > ' + sc.clientWidth + ' (cột cuối bị che) · cột ' + [...sc.querySelectorAll('tr:not(.letters) > th')].map(t => t.textContent + ' ' + Math.round(R(t).width)).join(' | ')); };
      gridOver('');
      const wide = new CSSStyleSheet(); wide.replaceSync('#olBox, #olBox *, #acBox, #acBox * { font-family: "DejaVu Sans", Verdana, sans-serif !important; letter-spacing: .03em !important; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, wide]; void document.body.offsetWidth; gridOver(' (phông rộng)');
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(x => x !== wide);
      return out;
    }, [where, VI.source]);
    const setLang = async (pg, l) => { if ((await pg.evaluate(() => document.documentElement.lang)) === l) return; await pg.click('#langSwitch button[data-lang="' + l + '"]'); await pg.waitForFunction(l => document.documentElement.lang === l, l, { timeout: 5000 }); await pg.waitForTimeout(500); };
    // một màn: quét en (luôn) + chụp en / vi khi có GC_SHOTS; prep dựng lại trạng thái chỉ có trong trang (hộp hỏi, bảng Go offline) sau khi đổi ngôn ngữ
    const screen = async (pg, name, prep) => {
      for (const l of ['en', 'vi']) {
        await setLang(pg, l); if (prep) await prep(pg, l); await pg.waitForTimeout(300);
        if (l === 'en') found.push(...await scanEn(pg, name));
        if (SHOTS) {   // khung trang cố định, #view tự cuộn: kéo cao khung nhìn bằng nội dung để ảnh có đủ màn (rộng giữ 1366 px)
          const f = path.join(SHOTS, name + '-' + l + '.png'), hgt = await pg.evaluate(() => { const v = document.getElementById('view'); return v ? v.scrollHeight + v.getBoundingClientRect().top + 24 : 900; });
          await pg.setViewportSize({ width: 1366, height: Math.max(900, Math.min(4000, Math.ceil(hgt))) }); await pg.waitForTimeout(200);
          await pg.screenshot({ path: f }); shotList.push(f); await pg.setViewportSize({ width: 1366, height: 900 });
        }
      }
    };
    const A = 'http://localhost:' + PA;
    // ---- 1) chọn đường
    await openPage(q, A, 'online', '#olPaths');
    const cards = await q.$$eval('.olpath', els => els.map(e => [e.getAttribute('data-path'), !!e.querySelector('.tag.badge'), e.disabled].join(':')).join(' '));
    if (cards !== 'caddy:true:false cloudflare:true:false proxy:false:false quick:false:false') throw new Error('4 thẻ chọn đường (beta cho Caddy + Cloudflare): ' + cards);
    if (!/(Lên mạng)/.test(await q.$$eval('.nav-item', els => els.map(e => e.textContent).join('|'))) || !/Tài khoản chủ/.test(await q.$$eval('.nav-item', els => els.map(e => e.textContent).join('|')))) throw new Error('menu Hệ thống thiếu Lên mạng / Tài khoản chủ');
    await screen(q, '01-chon-duong');
    console.log('  ✓ Hệ thống › Lên mạng: 4 thẻ chọn đường (Caddy · Cloudflare có nhãn beta · proxy riêng · link tạm) kèm điều kiện tiên quyết');
    // ---- 2) Caddy → bậc edge chưa publish: cách sửa = đúng một lệnh host
    await q.click('.olpath[data-path="caddy"]'); await q.fill('#olDomCaddy', 'chibi.example.com'); await q.click('#olGo');
    await q.waitForSelector('#olSteps tr[data-step="edge"][data-state="fail"]', { timeout: 20000 }); await idle(q);
    const sDom = await step(q, 'domain'), sEdge = await step(q, 'edge'), cmd = await q.$eval('#olSteps tr[data-step="edge"] .olcmd', e => e.textContent).catch(() => '');
    if (sDom.state !== 'ok' || cmd !== 'genchibi online --caddy' || !(await q.$('#olSteps tr[data-step="edge"] button'))) throw new Error('Caddy: domain ✓ rồi edge ✗ với lệnh host + nút chép: ' + JSON.stringify([sDom, sEdge, cmd]));
    const ids = await q.$$eval('#olSteps td.id', els => els.map(e => e.textContent).join(','));
    if (ids !== 'GO-01,GO-02,GO-03,GO-04,GO-05,GO-06' || !(await q.$('#olSteps tr.letters')) || !/1 /.test(await q.textContent('#olFoot'))) throw new Error('lưới bậc Data Console (ID hàng, chữ cột, chân lưới): ' + ids);
    // CNS-211: máy còn Offline (luồng dừng ở ✗, chưa có gì ra ngoài) → không có nút Go offline
    if (await q.$('#olOffBtn')) throw new Error('CNS-211: đang Offline (Caddy dừng ở bậc edge) mà vẫn hiện nút Go offline');
    await screen(q, '02-caddy-edge-chua-bat');
    console.log('  ✓ Caddy: Tên miền ✓ → Edge ✗ "chưa publish 80/443", cách sửa = một lệnh host (genchibi online --caddy) + nút chép; lưới GO-01…07, chữ cột, chân lưới');
    // ---- 3) Cloudflare: token chỉ ở ô password → choices (2 tên miền) → CNAME đã có → hỏi đè → Xong
    await gap();
    await q.click('.olpath[data-path="cloudflare"]');
    const tl = await q.$eval('#olTokenLink', a => [a.href, a.target, a.rel].join('|')), tType = await q.$eval('#olToken', e => e.type);
    if (!/^https:\/\/dash\.cloudflare\.com\/profile\/api-tokens\?permissionGroupKeys=/.test(tl) || !/\|_blank\|noopener noreferrer$/.test(tl) || tType !== 'password' || (await q.$$('#olHowto li')).length !== 4) throw new Error('form Cloudflare: link tạo token điền sẵn quyền + hướng dẫn 4 bước + ô password: ' + tl + ' ' + tType);
    if ((await q.inputValue('#olSub')) !== 'chibi') throw new Error('tên con mặc định phải là chibi');
    await screen(q, '03-cloudflare-form', async pg => { if (!(await pg.$('#olForm[data-path="cloudflare"]'))) await pg.click('.olpath[data-path="cloudflare"]'); });
    await q.fill('#olToken', CF_TOK); await q.click('#olGo');
    await q.waitForSelector('#olZoneSel option', { state: 'attached', timeout: 20000 }); await idle(q);
    if (await leak(q)) throw new Error('token Cloudflare còn trong DOM / ô nhập / bộ nhớ trình duyệt sau khi gửi');
    const zs = await q.$$eval('#olZoneSel option', o => o.map(x => x.value).join(','));
    if (zs !== 'example.com,other.org' || (await step(q, 'token')).state !== 'fail') throw new Error('choices: ' + zs);
    await screen(q, '04-cloudflare-chon-ten-mien');
    await gap();
    await q.selectOption('#olZoneSel', 'example.com'); await q.click('#olGo');   // ô token để trống: server còn giữ token trong bộ nhớ (≤ 30 phút)
    await q.waitForSelector('#olConfirm', { timeout: 20000 }); await idle(q);
    if (!/A 45\.33\.32\.156/.test(await q.textContent('#olConfirm')) || cf.st.dns.some(r => r.type === 'CNAME')) throw new Error('CNAME đã có: phải hỏi, chưa ghi DNS');
    await screen(q, '05-cloudflare-hoi-de-cname');
    await gap();
    await q.click('#olOverwrite');
    await q.waitForSelector('#olDone', { timeout: 30000 }); await idle(q);
    const done = await q.evaluate(() => [document.getElementById('olDoneStudio').textContent, document.getElementById('olDoneMcp').textContent, document.getElementById('olMode').getAttribute('data-mode')].join('|'));
    const steps3 = await q.$$eval('#olSteps tr[data-step]', trs => trs.map(t => t.getAttribute('data-step') + ':' + t.getAttribute('data-state')).join(' '));
    if (done !== 'https://chibi.example.com|https://chibi.example.com/mcp|cloudflare' || /fail|pending|running/.test(steps3)) throw new Error('Cloudflare xong: ' + done + ' · ' + steps3);
    const cn = cf.st.dns.find(r => r.name === 'chibi.example.com');
    if (!cn || cn.type !== 'CNAME' || !cf.st.tunnels.length || !cf.st.ruleset) throw new Error('Cloudflare giả: thiếu CNAME / tunnel / luật WAF');
    if (await leak(q)) throw new Error('token Cloudflare lọt vào trang sau khi xong');
    await screen(q, '06-cloudflare-xong');
    await q.click('#olToConnect'); await q.waitForSelector('#connectUrl', { timeout: 8000 });
    if ((await q.textContent('#connectUrl')) !== 'https://chibi.example.com/mcp') throw new Error('Kết nối agent sau khi lên mạng: ' + await q.textContent('#connectUrl'));
    console.log('  ✓ Cloudflare (API giả): token chỉ ở ô password, xoá ngay khi gửi (không còn trong DOM / ô / bộ nhớ trình duyệt) → chọn tên miền (choices) → CNAME đã có → hỏi đè → tunnel · WAF · MCP ✓ → trang Xong (Studio + MCP + chép) → Kết nối agent hiện ' + 'https://chibi.example.com/mcp');
    // ---- 4) đổi địa chỉ: hỏi trước (số kết nối agent bị gỡ) → proxy riêng: đoạn cấu hình + chép
    await openPage(q, A, 'online', '#olDone'); await gap();
    const askProxy = async pg => { if (await pg.$('#olAsk')) return; await gap(); await pg.click('.olpath[data-path="proxy"]'); await pg.fill('#olDomProxy', 'proxy.example.com'); await pg.click('#olGo'); await pg.waitForSelector('#olAsk', { timeout: 8000 }); };
    await askProxy(q);
    if (!/https:\/\/chibi\.example\.com/.test(await q.textContent('#olAsk')) || !/\b0\b/.test(await q.textContent('#olAsk'))) throw new Error('hộp hỏi đổi địa chỉ: ' + await q.textContent('#olAsk'));
    await screen(q, '07-hoi-doi-dia-chi', askProxy);
    await gap(); await q.click('#olAskYes');
    await q.waitForSelector('#olSnippets', { timeout: 20000 }); await idle(q);
    if (!/proxy\.example\.com/.test(await q.textContent('#olSnippets pre')) || !(await q.$('#olCopyCaddy')) || !(await q.$('#olCopyNginx'))) throw new Error('đoạn cấu hình proxy + nút chép');
    const pub4 = await q.textContent('#olPub');
    if ((await step(q, 'public')).state !== 'fail' || pub4 !== 'https://chibi.example.com') throw new Error('proxy không gửi X-Forwarded-For → bậc public ✗, publicUrl trả về giá trị cũ: ' + pub4);
    await screen(q, '08-proxy-doan-cau-hinh');
    console.log('  ✓ Đổi địa chỉ công khai: hỏi trước (từ https://chibi.example.com, số kết nối agent bị gỡ) → proxy riêng: đoạn Caddy / nginx + nút chép; bậc ✗ → publicUrl về giá trị cũ');
    // ---- 5) Go offline có token: dọn tunnel + CNAME ở Cloudflare
    await gap();
    const offPrep = async pg => { if (!(await pg.$('#olOffPanel'))) { await pg.click('#olOffBtn'); await pg.waitForSelector('#olOffPanel'); } };
    await offPrep(q);
    if (!(await q.$('#olOffToken'))) throw new Error('Go offline đường Cloudflare phải xin token để dọn');
    await screen(q, '09-go-offline-hoi', offPrep);
    await q.fill('#olOffToken', CF_TOK); await q.click('#olOffYes');
    await q.waitForSelector('#olMode[data-mode="off"]', { timeout: 20000 }); await idle(q);
    const offS = await q.$$eval('#olSteps tr[data-step]', trs => trs.map(t => t.getAttribute('data-step') + ':' + t.getAttribute('data-state')).join(' '));
    if (offS !== 'local:ok remote:ok' || cf.st.dns.some(r => r.name === 'chibi.example.com') || cf.st.tunnels.some(t => !t.deleted_at) || await leak(q)) throw new Error('Go offline (token): ' + offS);
    await screen(q, '10-offline');
    console.log('  ✓ Go offline (hỏi trước, liệt kê hệ quả, xin token Cloudflare): dọn trên máy ✓ + dọn ở Cloudflare ✓ (CNAME + tunnel đã xoá ở API giả), token không lọt vào trang');
    // ---- 6) token không có quyền WAF → "Tôi đã làm" → Xong; Go offline không token → bậc dọn Cloudflare ✗ (làm tay)
    cf.st.perms.waf = false;
    await gap();
    await q.click('.olpath[data-path="cloudflare"]'); await q.fill('#olToken', CF_TOK); await q.fill('#olZone', 'example.com'); await q.click('#olGo');
    await q.waitForSelector('#olWafDone', { timeout: 30000 }); await idle(q);
    if (!/Skip/.test((await step(q, 'waf')).text) || !(await q.$('#olSteps tr[data-step="waf"] button:not(#olWafDone)'))) throw new Error('bậc WAF làm tay: cách sửa + nút chép biểu thức');
    // CNS-208a: cột "Tôi đã làm" có tiêu đề + chữ cột như mọi cột (Data Console)
    const actCol = await q.evaluate(() => { const t = document.getElementById('olSteps'), L = [...t.querySelectorAll('tr.letters td')].map(x => x.textContent), H = [...t.querySelectorAll('tr th')].map(x => x.textContent); return { L, H }; });
    if (actCol.L[actCol.L.length - 1] !== 'F' || actCol.H[actCol.H.length - 1] !== 'Thao tác' || actCol.L.length !== actCol.H.length) throw new Error('CNS-208a: cột thao tác của lưới bậc phải có tiêu đề + chữ cột: ' + JSON.stringify(actCol));
    if (!(await q.$('#olOffBtn'))) throw new Error('CNS-211: luồng Cloudflare dừng ở WAF nhưng tunnel đã tạo (tunnel bật, cần dọn) → nút Go offline phải còn');
    await screen(q, '11-waf-lam-tay');
    await gap(); await q.click('#olWafDone');
    await q.waitForSelector('#olDone', { timeout: 30000 }); await idle(q);
    await gap(); await q.click('#olOffBtn'); await q.click('#olOffYes');
    await q.waitForSelector('#olMode[data-mode="off"]', { timeout: 20000 }); await idle(q);
    const rem = await step(q, 'remote');
    if (rem.state !== 'fail' || !/dash\.cloudflare\.com/.test(rem.text)) throw new Error('Go offline không token: bậc dọn Cloudflare phải ✗ kèm cách xoá tay: ' + JSON.stringify(rem));
    console.log('  ✓ Token không có quyền WAF: bậc WAF ✗ + cách tạo luật tay + "Tôi đã làm" → Xong; Go offline không token → dọn ở Cloudflare ✗ (nêu cách xoá tay)');
    const files = fs.readdirSync(path.join(homeA, 'data')).map(f => { try { return fs.readFileSync(path.join(homeA, 'data', f), 'utf8'); } catch (e) { return ''; } }).join('\n');
    if (logA.includes(CF_TOK) || files.includes(CF_TOK)) throw new Error('token Cloudflare lọt vào log / data của server');
    // ---- 7) Tài khoản chủ: phiên + thiết bị, thu hồi, cảnh báo, đổi mật khẩu thu hồi phiên khác
    const loginNode = async () => { const r = await _fetch(A + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Firefox/131.0' }, body: JSON.stringify({ username: TEST_USER, password: TEST_PW }) }); return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '); };
    const ck1 = await loginNode(), ck2 = await loginNode();
    const stOf = async ck => (await _fetch(A + '/api/auth/sessions', { headers: { cookie: ck } })).status;
    for (let i = 0; i < 100; i++) await _fetch(A + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1', 'X-Forwarded-For': '198.51.100.' + (i % 10 + 1) + ', 203.0.113.' + (i % 10 + 1) }, body: JSON.stringify({ username: TEST_USER, password: 'doan sai ' + i }) });
    await openPage(q, A, 'account', '#acSessGrid');
    const nS = (await q.$$('#acSessGrid tr[data-session]')).length, cur = await q.$$eval('#acSessGrid tr[data-current]', t => t.length);
    if (nS < 3 || cur !== 1 || !(await q.$('#acDevGrid tr[data-device]')) || !(await q.$('#acAlertGrid tr[data-alert]'))) throw new Error('Tài khoản chủ: lưới phiên (' + nS + ', hiện tại ' + cur + ') / thiết bị / cảnh báo');
    const tokTxt = await q.textContent('#acToken');
    // CNS-200: `genchibi token` đặt token GitHub — không được chỉ chủ tới đó; chỉ đúng chỗ token chủ nằm + lệnh in sẵn cấu hình nối agent
    if (/genchibi token/.test(tokTxt) || !/GC_API_TOKEN/.test(tokTxt) || !/data\/owner-token/.test(tokTxt) || !/genchibi agent connect/.test(tokTxt) || tokTxt.includes(TEST_TOKEN) || (await q.content()).includes(TEST_TOKEN)) throw new Error('dòng token chủ: GC_API_TOKEN trong .env / data/owner-token + genchibi agent connect, không "genchibi token", không hiện token: ' + tokTxt);
    // CNS-208b: cột thu hồi của lưới thiết bị có tiêu đề + chữ cột
    const devCol = await q.evaluate(() => { const t = document.getElementById('acDevGrid'), L = [...t.querySelectorAll('tr.letters td')].map(x => x.textContent), H = [...t.querySelectorAll('tr th')].map(x => x.textContent); return { L, H }; });
    if (devCol.L[devCol.L.length - 1] !== 'E' || devCol.H[devCol.H.length - 1] !== 'Thu hồi') throw new Error('CNS-208b: cột thu hồi của lưới thiết bị phải có tiêu đề + chữ cột: ' + JSON.stringify(devCol));
    await screen(q, '12-tai-khoan-chu');
    await q.click('#acAck'); await q.waitForSelector('#acAlertGrid', { state: 'detached', timeout: 8000 });
    const sid1 = await q.$$eval('#acSessGrid tr[data-session]:not([data-current])', t => t.map(x => x.getAttribute('data-session')));
    await q.click('#acSessGrid tr[data-session="' + sid1[0] + '"] button');
    await q.waitForFunction(id => !document.querySelector('#acSessGrid tr[data-session="' + id + '"]'), sid1[0], { timeout: 8000 });
    const killed = [await stOf(ck1), await stOf(ck2)].filter(s => s === 401).length;
    if (killed !== 1) throw new Error('thu hồi một phiên: đúng một phiên Node phải bị 401, có ' + killed);
    const NEWPW = 'mat khau moi cua chu may 2026';
    await q.fill('#acCur', 'sai mat khau hien tai'); await q.fill('#acPw', NEWPW); await q.fill('#acPw2', NEWPW); await q.click('#acSave');
    await q.waitForSelector('#acErr:not([hidden])', { timeout: 8000 });
    if (await q.$('#gcLogin')) throw new Error('mật khẩu hiện tại sai không được đẩy ra màn đăng nhập');
    await q.fill('#acCur', TEST_PW); await q.fill('#acPw', NEWPW); await q.fill('#acPw2', NEWPW); await q.click('#acSave');
    await q.waitForFunction(() => document.querySelectorAll('#acSessGrid tr[data-session]').length === 1, null, { timeout: 8000 });
    if ((await stOf(ck1)) !== 401 || (await stOf(ck2)) !== 401 || (await q.evaluate(async () => (await fetch('api/auth/sessions')).status)) !== 200) throw new Error('đổi mật khẩu: phiên khác phải bị thu hồi, trình duyệt này vẫn vào được');
    // kẻ lạ đang bị khoá theo tài khoản (100 lần sai ở trên) — trình duyệt của chủ có cookie thiết bị (mới cấp khi đổi mật khẩu) vẫn đăng nhập được bằng mật khẩu mới
    const relog = await q.evaluate(async pw => (await fetch('api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ username: 'owner', password: pw }) })).status, NEWPW);
    const stranger = await _fetch(A + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ username: TEST_USER, password: NEWPW }) });
    if (relog !== 200 || stranger.status !== 429) throw new Error('mật khẩu mới: trình duyệt chủ (cookie thiết bị) ' + relog + ' (cần 200) · kẻ lạ lúc bị khoá ' + stranger.status + ' (cần 429)');
    console.log('  ✓ Tài khoản chủ: lưới phiên (' + nS + ') + thiết bị + cảnh báo đăng nhập sai (Đã xem), thu hồi một phiên → phiên đó 401; mật khẩu hiện tại sai báo lỗi tại chỗ; đổi mật khẩu → mọi phiên khác 401, trình duyệt này vẫn vào (cookie thiết bị mới — đăng nhập lại được cả khi kẻ lạ đang bị khoá); token chủ không hiện (chỉ "genchibi token")');
    // ---- 8) máy kế thừa: wizard chỉ đọc + Migrate
    const qb = await ctx.newPage(); qb.on('pageerror', e => errs20.push(e.message));
    await openPage(qb, 'http://localhost:' + PB, 'online', '#olLegacy');
    if (!(await qb.$$eval('.olpath', els => els.every(e => e.disabled))) || !/legacy\.example\.test/.test(await qb.textContent('#olLegacy'))) throw new Error('máy kế thừa: thẻ chọn đường phải khoá, banner nêu .env');
    await screen(qb, '13-may-ke-thua');
    await qb.click('#olMigrate'); await qb.waitForSelector('#olLegacy', { state: 'detached', timeout: 8000 });
    if ((await qb.getAttribute('#olMode', 'data-mode')) !== 'proxy' || (await qb.textContent('#olPub')) !== 'https://legacy.example.test' || await qb.$eval('.olpath[data-path="quick"]', e => e.disabled)) throw new Error('sau Migrate: mode proxy, publicUrl giữ nguyên, hết chỉ đọc');
    console.log('  ✓ Máy kế thừa (.env GC_PUBLIC_URL): wizard chỉ đọc + nút Migrate → POST /api/online/migrate → mode proxy, publicUrl giữ nguyên, thẻ mở lại');
    await qb.close();
    // ---- 9) link tạm: launcher thật + cloudflared giả (cách của tools/test-ingress.mjs) → Xong → Go offline
    const FAKE = fs.readFileSync(path.join(ROOT, 'tools/fixtures/fake-cloudflared.js')), FAKE_SHA = crypto.createHash('sha256').update(FAKE).digest('hex'), VER = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
    const homeL = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-online-'));
    const rel = path.join(homeL, 'releases', 'v' + VER.replace(/^v/, ''));
    fs.cpSync(ROOT, rel, { recursive: true, filter: s => !/(^|\/)(\.git|dist|node_modules)$/.test(s) });
    fs.symlinkSync(path.join('releases', path.basename(rel)), path.join(homeL, 'current'));
    fs.copyFileSync(path.join(rel, 'launcher.js'), path.join(homeL, 'launcher.js'));
    fs.mkdirSync(path.join(homeL, 'bin'), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(homeL, 'bin', 'cloudflared-test'), FAKE, { mode: 0o700 });
    fs.mkdirSync(path.join(homeL, 'run'), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(homeL, 'fake-cf-proxy-port'), String(PLX));
    launcher = spawn(process.execPath, [path.join(homeL, 'launcher.js')], { detached: true, stdio: 'ignore', env: { ...process.env, GC_HOME: homeL, GC_PORT: String(PL), GC_NO_AUTOCHECK: '1', GC_PUBLIC_URL: '', GC_ALLOWED_HOSTS: '', GC_TUNNEL: '',
      GC_TEST: '1', GC_TEST_CF_URL: 'http://127.0.0.1:9/cloudflared', GC_TEST_CF_SHA256: FAKE_SHA, GC_TEST_INGRESS_RECHECK_MS: '1500', GC_TEST_ONLINE_VIA: '127.0.0.1:' + PLX, HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: '', NO_PROXY: '', no_proxy: '' } });
    { const L = launcher; kids.push({ kill: () => { try { process.kill(-L.pid, 'SIGKILL'); } catch (e) { /* đã tắt */ } } }); }   // bị dừng giữa chừng: cả nhóm tiến trình launcher
    for (let i = 0; i < 100; i++) { try { if ((await _fetch('http://127.0.0.1:' + PL + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await sleep(200); }
    const L = 'http://localhost:' + PL;
    await openPage(q, L, 'online', '#olPaths');
    await q.click('.olpath[data-path="quick"]'); await q.click('#olGo');
    await q.waitForSelector('#olDone', { timeout: 60000 }); await idle(q);
    const qurl = await q.textContent('#olDoneStudio'), edgeOk = await q.$eval('#olDone', e => /✓/.test(e.textContent));
    const est = JSON.parse(fs.readFileSync(path.join(homeL, 'run', 'edge-status.json'), 'utf8'));
    if (!/^https:\/\/fake-\d+\.trycloudflare\.com$/.test(qurl) || !edgeOk || est.ready !== true || est.url !== qurl) throw new Error('link tạm qua launcher: ' + qurl + ' ' + JSON.stringify(est));
    // CNS-208c: bậc tunnel của link tạm mang nhãn của nó (không có CNAME nào)
    const qLbl = await q.$eval('#olSteps tr[data-step="tunnel"] td:nth-child(2) b', e => e.textContent);
    if (/CNAME/.test(qLbl) || !/Tunnel tạm/.test(qLbl)) throw new Error('CNS-208c: nhãn bậc tunnel của link tạm: ' + qLbl);
    await screen(q, '14-link-tam-xong');
    await gap(); await q.click('#olOffBtn');
    if (await q.$('#olOffToken')) throw new Error('Go offline link tạm không cần token Cloudflare');
    await q.click('#olOffYes'); await q.waitForSelector('#olMode[data-mode="off"]', { timeout: 20000 }); await idle(q);
    let st9 = null; for (let i = 0; i < 60; i++) { st9 = JSON.parse(fs.readFileSync(path.join(homeL, 'run', 'edge-status.json'), 'utf8')); if (st9.running === false) break; await sleep(250); }
    if (st9.running !== false) throw new Error('Go offline: cloudflared phải dừng: ' + JSON.stringify(st9));
    console.log('  ✓ Link tạm (launcher thật + cloudflared giả, đi qua cổng ingress): ' + qurl + ' → Xong (tunnel ✓) → Go offline không hỏi token → cloudflared dừng');
    const uniq = [...new Set(found)];
    if (uniq.length) throw new Error('chế độ en / bố cục 1366 px còn ' + uniq.length + ' lỗi:\n      ' + uniq.slice(0, 40).join('\n      '));
    console.log('  ✓ Chế độ en: 14 màn mới (Lên mạng mọi trạng thái, Tài khoản chủ, máy kế thừa) không còn chữ Việt; bố cục 1366 px không chồng, không tràn ngang' + (SHOTS ? ' · ' + shotList.length + ' ảnh ở ' + SHOTS : ''));
    if (errs20.length) throw new Error('lỗi trang: ' + errs20.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ Lên mạng / Tài khoản chủ:', e.message); }
  finally {
    await b20.close(); srvA.kill(); srvB.kill(); cf.close();
    if (launcher) { try { process.kill(-launcher.pid, 'SIGTERM'); } catch (e) { /* đã tắt */ } await sleep(1500); try { process.kill(-launcher.pid, 'SIGKILL'); } catch (e) { /* đã tắt */ } }
  }
}
if (want('i18n')) {
  const home16 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv16 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home16, GC_PORT: '7668', GC_NO_AUTOCHECK: '1', GC_LANG: '' }, stdio: 'ignore' }));
  await up(7668);   // chờ server trả lời (≤ 30 s), không ngủ cố định — máy vừa khởi động / đang tải nặng thì 1,2 s không đủ
  legacyVi(false); const b16 = await pw.chromium.launch(); legacyVi(true);   // nhóm này tự chọn ngôn ngữ: không đặt sẵn gc-lang=vi
  const U = 'http://localhost:7668/', errs16 = [];
  const ready = async q => q.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 8000 });
  try {
    const ctx = await b16.newContext({ viewport: { width: 1500, height: 950 } }), q = await ctx.newPage();
    q.on('pageerror', e => errs16.push(e.message));
    // 1) mặc định: tiếng Anh (máy không đặt GC_LANG, trình duyệt chưa chọn)
    await q.goto(U + 'xuong'); await ready(q); await q.waitForSelector('.nav-item');   // go() đầu tiên ghi tuyến SAU khi verChip hiện — đợi xong rồi mới đặt tuyến
    const l0 = await q.evaluate(() => [document.documentElement.lang, localStorage.getItem('gc-lang'), document.querySelector('#langSwitch [aria-pressed="true"]') && document.querySelector('#langSwitch [aria-pressed="true"]').getAttribute('data-lang')]);
    if (l0.join() !== 'en,,en') throw new Error('mặc định phải là en: ' + l0.join());
    await q.evaluate(() => localStorage.setItem('gc-route-xuong', JSON.stringify({ page: 'lang' }))); await q.reload(); await ready(q);
    if ((await q.textContent('#crumbs b')) !== 'Language') throw new Error('trang Ngôn ngữ ở chế độ en: ' + await q.textContent('#crumbs'));
    console.log('  ✓ Mặc định tiếng Anh: <html lang="en">, nút EN đang chọn, Hệ thống › Language');
    // 2) bấm VI: có hiệu lực ngay (vẽ lại, không tải trang), nhớ theo trình duyệt; tải lại vẫn vi
    await q.evaluate(() => { window.__noReload = 1; });
    await q.click('#langSwitch button[data-lang="vi"]');
    await q.waitForFunction(() => document.documentElement.lang === 'vi' && (document.querySelector('#crumbs b') || {}).textContent === 'Ngôn ngữ', null, { timeout: 4000 });
    if (!(await q.evaluate(() => window.__noReload === 1))) throw new Error('đổi ngôn ngữ không được tải lại trang (mất bản nháp)');
    const navVi = await q.$$eval('.nav-item', els => els.map(e => e.textContent.trim()).join('|'));
    if (!/Bàn chỉnh nhân vật/.test(navVi) || !/Cài đặt AI/.test(navVi) || /Character editor|AI settings/.test(navVi)) throw new Error('menu sau khi chuyển vi: ' + navVi);
    if (!/Trợ lý AI/.test(await q.textContent('#dockToggle'))) throw new Error('nút dock sau khi chuyển vi: ' + await q.textContent('#dockToggle'));
    if ((await q.evaluate(() => localStorage.getItem('gc-lang'))) !== 'vi') throw new Error('không nhớ gc-lang');
    await q.reload(); await ready(q);
    if ((await q.evaluate(() => document.documentElement.lang)) !== 'vi' || (await q.textContent('#crumbs b')) !== 'Ngôn ngữ') throw new Error('tải lại không nhớ tiếng Việt');
    console.log('  ✓ Bấm VI: vẽ lại ngay (không tải trang), nhớ gc-lang; tải lại vẫn tiếng Việt');
    // 3) lỗi server theo ngôn ngữ người dùng (toast): mở tác phẩm không có → 404 "không có tác phẩm này"
    const toastOf = async () => { await q.waitForSelector('#toast:not([hidden])', { timeout: 6000 }); return (await q.textContent('#toast')).trim(); };
    await q.goto(U + 'tao-tac#/tac-pham/khong-co-that'); await ready(q);
    const tv = await toastOf();
    if (tv !== 'không có tác phẩm này') throw new Error('toast lỗi ở chế độ vi: ' + tv);
    await q.evaluate(() => localStorage.setItem('gc-lang', 'en'));
    await q.goto('about:blank'); await q.goto(U + 'tao-tac#/tac-pham/khong-co-that-2'); await ready(q);   // chỉ đổi # thì không tải lại trang
    const te = await toastOf();
    if (te !== 'Work not found') throw new Error('toast lỗi ở chế độ en: ' + te);
    console.log('  ✓ Lỗi server theo ngôn ngữ người dùng: "' + tv + '" (vi) · "' + te + '" (en)');
    // 4) mặc định của máy: PUT api/settings { uiLang } → trình duyệt chưa chọn thì theo máy; ?lang= thắng; /api/info trả uiLang
    const put = async v => (await fetch(U + 'api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ uiLang: v }) }));
    if ((await put('xx')).status !== 400) throw new Error('uiLang lạ phải bị từ chối 400');
    if ((await (await put('vi')).json()).uiLang !== 'vi') throw new Error('PUT api/settings uiLang');
    const info = await (await fetch(U + 'api/info')).json();
    if (info.uiLang !== 'vi') throw new Error('/api/info thiếu uiLang: ' + info.uiLang);
    const q2 = await (await b16.newContext()).newPage(); q2.on('pageerror', e => errs16.push(e.message));
    await q2.goto(U + 'thu-vien'); await ready(q2);
    if ((await q2.evaluate(() => document.documentElement.lang)) !== 'vi') throw new Error('trình duyệt mới không theo mặc định máy (vi)');
    await q2.goto(U + 'thu-vien?lang=en'); await ready(q2);
    if ((await q2.evaluate(() => document.documentElement.lang)) !== 'en') throw new Error('?lang=en phải thắng mặc định máy');
    if (await q2.evaluate(() => localStorage.getItem('gc-lang'))) throw new Error('?lang= không được ghi đè lựa chọn đã lưu');
    await put('en');
    console.log('  ✓ Mặc định của máy (PUT api/settings uiLang, /api/info): trình duyệt mới theo máy; ?lang= thắng mà không lưu');
    // 4b) Q23: dự án mẫu một chạm theo NGÔN NGỮ GIAO DIỆN — en mời Fun Office (bản tiếng Anh) trước, vi mời Văn phòng vui trước;
    //     Bắt đầu nhanh / thư viện trống chỉ mời bản đúng tiếng (+ Tam Quốc); bản tiếng kia vẫn ở thanh Dự án chủ đề, xếp sau
    const q4 = await (await b16.newContext({ viewport: { width: 1500, height: 950 } })).newPage(); q4.on('pageerror', e => errs16.push(e.message));
    const demoBtns = async () => q4.$$eval('ol.qsteps ~ .row > button', els => els.map(e => e.textContent.trim()));
    const projBtns = async () => q4.$$eval('.pagehead .actions button', els => els.map(e => e.textContent.trim()));
    const SAMPLE_UI = {
      en: { quick: ['✨ Open the sample project "Fun Office"', '🏯 Open the sample theme set "Three Kingdoms"'], bar: ['✨ Fun Office (sample)', '🏯 Three Kingdoms sample', '✨ Fun Office — Vietnamese edition'] },
      vi: { quick: ['✨ Mở dự án mẫu "Văn phòng vui"', '🏯 Mở bộ chủ đề mẫu "Tam Quốc"'], bar: ['✨ Văn phòng vui (mẫu)', '🏯 Tam Quốc (bộ chủ đề)', '✨ Fun Office (mẫu tiếng Anh)'] } };
    for (const L of ['en', 'vi']) {
      await q4.goto(U + '?lang=' + L); await ready(q4); await q4.waitForSelector('ol.qsteps');
      const qb = await demoBtns();
      if (JSON.stringify(qb) !== JSON.stringify(SAMPLE_UI[L].quick)) throw new Error('Bắt đầu nhanh (' + L + '): mời bộ mẫu sai thứ tự / sai bản: ' + JSON.stringify(qb));
      await q4.evaluate(() => localStorage.setItem('gc-route-thu-vien', JSON.stringify({ page: 'projects' })));
      await q4.goto(U + 'thu-vien?lang=' + L); await ready(q4); await q4.waitForSelector('.lib-empty');
      const bar = (await projBtns()).filter(t => /^(✨|🏯)/.test(t)), empty = await q4.$$eval('.lib-empty .row > button', els => els.map(e => [e.textContent.trim(), e.classList.contains('primary')]));
      if (JSON.stringify(bar) !== JSON.stringify(SAMPLE_UI[L].bar)) throw new Error('Dự án chủ đề (' + L + '): thanh bộ mẫu ' + JSON.stringify(bar));
      if (!empty.length || empty[0][0] !== SAMPLE_UI[L].quick[0] || !empty[0][1] || empty.some(x => /Vietnamese edition|mẫu tiếng Anh/.test(x[0]))) throw new Error('thư viện trống (' + L + '): nút chính phải là ' + SAMPLE_UI[L].quick[0] + ': ' + JSON.stringify(empty));
    }
    await q4.context().close();
    console.log('  ✓ Q23 bộ mẫu theo ngôn ngữ giao diện: en mời "Fun Office" trước, vi mời "Văn phòng vui" trước (Bắt đầu nhanh, nút chính thư viện trống); Tam Quốc ở cả hai; bản tiếng kia xếp sau ở Dự án chủ đề');
    // 5) QUÉT CHỮ VIỆT ở chế độ en (INT-18c): mọi trang chính + 5 tab phòng làm phim + dock — không còn ký tự có dấu tiếng Việt,
    //    trừ nội dung người dùng: input / textarea / [data-user-content] / [lang="vi"] và mọi chuỗi có trong dữ liệu người dùng (bộ mẫu Tam Quốc: tên tướng, lời thoại…)
    const H = { 'Content-Type': 'application/json', 'X-GC-Request': '1' };
    const tq = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8'));
    const imp = await fetch(U + 'api/projects/import', { method: 'POST', headers: H, body: JSON.stringify({ bundle: tq }) });
    if (!imp.ok) throw new Error('nhập bộ mẫu Tam Quốc: ' + imp.status);
    const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
    const userStr = new Set(), grab = o => { if (typeof o === 'string') { if (VI.test(o)) { userStr.add(o); o.split(/\n+/).forEach(x => x.trim() && userStr.add(x.trim())); } } else if (o && typeof o === 'object') Object.values(o).forEach(grab); };
    const getJ = async p => { const r = await fetch(U + p); return r.ok ? r.json() : []; };
    for (const p of ['api/assets', 'api/items', 'api/scenes', 'api/projects', 'api/motion-packs', 'api/sound-packs', 'api/parts']) grab(await getJ(p));
    const works = await getJ('api/works'); grab(works);
    for (const w of works) grab(await getJ('api/works/' + w.id));
    const USER = [...userStr].sort((a, b) => b.length - a.length);
    // câu ĐỘNG do engine ghép (core.js — cổng kiểm có số đếm): chưa dịch được bằng tra bảng nguyên câu; builder engine chuyển sang mẫu {n}.
    // Đếm riêng và in cảnh báo — KHÔNG làm đỏ test; xoá dần danh sách này khi engine đã dịch (mục tiêu: rỗng).
    const PENDING = [];   // v0.20: câu động của cổng kiểm đã thành mẫu (labelId / detailId) và Studio dịch theo mẫu — danh sách rỗng: còn chữ Việt là ĐỎ
    const pendingSeen = new Set();
    const scanEn = async (q, where) => (await q.evaluate(([USER, where, PENDING]) => {
      const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
      const skip = el => !!el.closest('[data-user-content], [lang|="vi"], script, style, noscript, svg title');
      const vis = el => { const v = el.closest('option, optgroup') ? el.closest('select') : el; return !!v && (v.checkVisibility ? v.checkVisibility({ visibilityProperty: true }) : v.getClientRects().length > 0); };
      // bỏ nội dung người dùng theo NGUYÊN CỤM (biên là ký tự không phải chữ): chuỗi ngắn như "Hí" không được ăn mất một phần chữ giao diện
      const RX = window.__gcUserRx || (window.__gcUserRx = USER.map(u => new RegExp('(?<![\\p{L}\\p{M}])' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{M}])', 'gu')));
      const strip = s => { for (let i = 0; i < USER.length; i++) if (s.indexOf(USER[i]) >= 0) s = s.replace(RX[i], ' '); return s; };
      const tag = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      const bad = new Set(), PEND = PENDING.map(p => new RegExp(p));
      const pend = s => PEND.some(r => r.test(s.trim()));
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) {
        const el = n.parentElement; if (!el || !VI.test(n.nodeValue) || skip(el) || el.closest('input, textarea') || !vis(el)) continue;
        const rest = strip(n.nodeValue); if (VI.test(rest)) bad.add((pend(rest) ? '~' : '') + where + ' · ' + tag(el) + ' · ' + rest.trim().slice(0, 100));
      }
      for (const el of document.body.querySelectorAll('[title], [placeholder], [aria-label], optgroup[label]')) {
        if (skip(el) || !vis(el)) continue;
        for (const a of ['title', 'placeholder', 'aria-label', 'label']) { const v = el.getAttribute(a); if (v && VI.test(v) && (a !== 'label' || el.tagName === 'OPTGROUP')) { const rest = strip(v); if (VI.test(rest)) bad.add((pend(rest) ? '~' : '') + where + ' · ' + tag(el) + ' [' + a + '] · ' + rest.trim().slice(0, 100)); } }
      }
      return [...bad];
    }, [USER, where, PENDING])).filter(x => { if (x[0] === '~') { pendingSeen.add(x.slice(x.lastIndexOf(' · ') + 3)); return false; } return true; });
    // BỐ CỤC (v0.20): chữ tiếng Anh dài hơn → nút thanh đầu trang không được chồng lên nhau / lên nút Trợ lý AI; chữ trong banner không bị ép thành cột hẹp
    const layoutBad = async (q, where) => q.evaluate(where => {
      const out = [], vis = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const R = el => el.getBoundingClientRect(), hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      const items = [...document.querySelectorAll('.pagehead .actions > *, #dockToggle, #crumbs')].filter(vis), nm = el => (el.id ? '#' + el.id : '') + ' "' + el.textContent.trim().slice(0, 30) + '"';
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (!items[i].contains(items[j]) && !items[j].contains(items[i]) && hit(R(items[i]), R(items[j]))) out.push('BỐ CỤC ' + where + ' · thanh đầu trang chồng: ' + nm(items[i]) + ' ↔ ' + nm(items[j]));
      for (const sp of document.querySelectorAll('.banner > span:first-child')) { if (!vis(sp)) continue; const w = R(sp).width, bw = R(sp.parentElement).width; if (bw > 320 && w < 180) out.push('BỐ CỤC ' + where + ' · chữ banner bị ép ' + Math.round(w) + 'px: "' + sp.textContent.trim().slice(0, 40) + '"'); }
      return out;
    }, where);
    const ctxE = await b16.newContext({ viewport: { width: 1366, height: 900 } }), qe = await ctxE.newPage();
    qe.on('pageerror', e => errs16.push(e.message)); qe.on('dialog', d => d.dismiss().catch(() => {}));
    const found = [];
    await qe.goto(U + '?lang=en'); await ready(qe); await qe.waitForSelector('.appcard');
    found.push(...await scanEn(qe, 'Chọn khu'), ...await layoutBad(qe, 'Chọn khu'));
    let nPages = 0;
    for (const app of ['xuong', 'thu-vien', 'tao-tac']) {
      await qe.goto(U + app + '?lang=en'); await ready(qe); await qe.waitForSelector('.nav-item');
      const n = await qe.$$eval('.nav-item', els => els.length);
      for (let i = 0; i < n; i++) {
        const btn = (await qe.$$('.nav-item'))[i], label = (await btn.textContent()).trim();
        await btn.click(); await qe.waitForTimeout(700); nPages++;
        found.push(...await scanEn(qe, app + ' › ' + label), ...await layoutBad(qe, app + ' › ' + label));
        if (/^Theme projects/.test(label) && await qe.$('.libcard.proj[title="mau-tam-quoc"]')) { await qe.click('.libcard.proj[title="mau-tam-quoc"]'); await qe.waitForTimeout(600); found.push(...await scanEn(qe, app + ' › ' + label + ' › Tam Quốc'), ...await layoutBad(qe, app + ' › ' + label + ' › Tam Quốc')); }
        if (/^(Characters|Items|Scenes|Motions)/.test(label) && await qe.$('.libcard')) { await qe.click('.libcard'); await qe.waitForTimeout(600); found.push(...await scanEn(qe, app + ' › ' + label + ' › thẻ đầu'), ...await layoutBad(qe, app + ' › ' + label + ' › thẻ đầu')); }
      }
    }
    // Tạo tác: phòng làm phim của tác phẩm Tam Quốc, đủ 5 tab
    await qe.goto(U + 'tao-tac?lang=en#/tac-pham/tq-vuon-dao-xich-bich/script'); await ready(qe); await qe.waitForSelector('#wtab-script');
    for (const t of ['script', 'shots', 'review', 'voice', 'publish']) { await qe.click('#wtab-' + t); await qe.waitForTimeout(700); found.push(...await scanEn(qe, 'Tạo tác › phòng làm phim › ' + t), ...await layoutBad(qe, 'Tạo tác › phòng làm phim › ' + t)); }
    // v0.22 P3: bảng Xuất video (mở bằng nút thật — Chromium qua localhost nên nút mở) cũng không được còn chữ Việt ở chế độ en
    await qe.waitForFunction(() => { const b = document.getElementById('videoExportB'); return b && !b.disabled; }, null, { timeout: 15000 });
    await qe.click('#videoExportB'); await qe.waitForSelector('.vidpanel [data-v="est"]', { timeout: 15000 }); await qe.waitForTimeout(800);
    found.push(...await scanEn(qe, 'Tạo tác › phòng làm phim › publish › Export video'), ...await layoutBad(qe, 'Tạo tác › phòng làm phim › publish › Export video'));
    if (!/Export video/.test(await qe.textContent('.vidpanel h3'))) throw new Error('bảng Xuất video (en): ' + await qe.textContent('.vidpanel h3'));
    // phim HTML xuất ở chế độ en: chữ trình phát tiếng Anh + mang bảng player/engine để engine/player.js dịch lúc chạy; lời thoại giữ nguyên
    await qe.click('#wtab-publish');
    const [fdl16] = await Promise.all([qe.waitForEvent('download'), qe.click('button:text-is("Film (HTML)")')]);
    const fp16 = path.join(home16, 'phim-en.html'); await fdl16.saveAs(fp16);
    const fh = fs.readFileSync(fp16, 'utf8');
    for (const w of ['>▶ Play<', '>■ Stop<', 'aria-label="Character voices"', '>Voice: auto<', 'Made with gen-chibi', 'I.setLang("en")']) if (!fh.includes(w)) throw new Error('phim xuất ra (en) thiếu ' + JSON.stringify(w));
    if (!/I\.add\("en", \{[^]*"Đã dừng":"Stopped"/.test(fh)) throw new Error('phim xuất ra (en) không mang bảng player');
    if (/>▶ Xem<|>■ Dừng</.test(fh)) throw new Error('phim xuất ra (en) còn nút tiếng Việt');
    // <html lang> theo ngôn ngữ PHIM (work.lang), không theo giao diện: tác phẩm Tam Quốc không có lang (trước v0.20) = tiếng Việt dù xuất ở giao diện en (CNS-151)
    if (!/<html lang="vi">/.test(fh)) throw new Error('phim xuất ra: <html lang> phải theo ngôn ngữ phim (vi), có ' + (/<html lang="[^"]*">/.exec(fh) || ['?'])[0]);
    const pf = await ctxE.newPage(); await pf.goto('file://' + fp16); await pf.waitForFunction(() => window.GenChibi && window.GenChibi.film);
    const fl = await pf.evaluate(() => [document.getElementById('play').textContent, window.GenChibi.i18n.lang(), window.GenChibi.i18n.t('Đã dừng')]);
    if (fl.join('|') !== '▶ Play|en|Stopped') throw new Error('phim mở bằng file:// ở chế độ en: ' + fl.join('|'));
    const uniq = [...new Set(found)];
    if (process.env.GC_I18N_DUMP) fs.writeFileSync(process.env.GC_I18N_DUMP, uniq.join('\n') + '\n');   // GC_I18N_DUMP=<tệp>: ghi đủ danh sách để sửa
    if (uniq.length) throw new Error('chế độ en còn ' + uniq.length + ' lỗi (chữ tiếng Việt chưa dịch / bố cục chồng lấn) trên giao diện:\n      ' + uniq.slice(0, 60).join('\n      '));
    if (pendingSeen.size) console.log('  ! ' + pendingSeen.size + ' câu động của engine (core.js, cổng kiểm) còn tiếng Việt — chờ builder engine: ' + [...pendingSeen].slice(0, 4).map(x => JSON.stringify(x.slice(0, 40))).join(', ') + (pendingSeen.size > 4 ? '…' : ''));
    console.log('  ✓ Chế độ en: không còn chữ tiếng Việt trên ' + (nPages + 6) + ' trang / tab (Xưởng, Thư viện mọi mục, Tạo tác + 5 tab phòng làm phim + bảng Xuất video, Hệ thống, dock Trợ lý AI) + phim HTML xuất ra (nút, bảng player, mở file://) — trừ nội dung người dùng (' + USER.length + ' chuỗi của bộ mẫu)');
    // 6) CNS-155: chữ HỆ THỐNG điền sẵn vào ô nhập của "Tạo asset mới" (tên, mã, mô tả chép từ khung). Bước quét trên bỏ input / textarea vì coi là nội dung
    //    người dùng — nhưng chữ điền sẵn mà người dùng giữ nguyên sẽ THÀNH nội dung người dùng (không dịch được nữa). Mở form từ MỌI khung nhân vật / vật phẩm /
    //    bối cảnh ở chế độ en, quét ngay sau khi mở: không còn chữ Việt; tên = "New character | New item | New scene", mã sinh từ tên tiếng Anh
    await qe.evaluate(() => localStorage.setItem('gc-route-xuong', JSON.stringify({ page: 'create' })));
    await qe.goto(U + 'xuong?lang=en'); await ready(qe); await qe.waitForSelector('.split.create .libcard');
    const L6 = '.split.create > .stack:first-child', pre = [];
    let nForms = 0;
    for (const [kind, name, idRe] of [['Character', 'New character', /^new-character(-\d+)?$/], ['Item', 'New item', /^new-item(-\d+)?$/], ['Scene', 'New scene', /^new-scene(-\d+)?$/]]) {
      await qe.click(L6 + ' .seg button:text-is("' + kind + '")'); await qe.waitForTimeout(250);
      const nf = await qe.$$eval(L6 + ' .libgrid .libcard', els => els.length);
      if (!nf) throw new Error('Tạo asset mới (en): không có khung ' + kind);
      for (let i = 0; i < nf; i++) {
        const card = (await qe.$$(L6 + ' .libgrid .libcard'))[i], key = await card.getAttribute('title');
        await card.click(); await qe.waitForSelector(L6 + ' input.mono'); nForms++;
        const v = await qe.$$eval(L6 + ' input, ' + L6 + ' textarea', els => els.filter(e => e.value && !/^(color|range|number|checkbox|radio|hidden)$/.test(e.type))
          .map(e => [(e.closest('label') ? e.closest('label').textContent.trim() : e.getAttribute('aria-label') || e.tagName.toLowerCase()).slice(0, 24), e.value, e.classList.contains('mono')]));
        v.filter(([, val]) => VI.test(val)).forEach(([f, val]) => pre.push(kind + ' ' + key + ' · ô "' + f + '" = ' + JSON.stringify(val.slice(0, 80))));
        const nm = (v.find(x => x[0] === 'Name') || [])[1], id = (v.find(x => x[2]) || [])[1];
        if (nm !== name) pre.push(kind + ' ' + key + ' · tên điền sẵn = ' + JSON.stringify(nm) + ' (cần "' + name + '")');
        if (!idRe.test(id || '')) pre.push(kind + ' ' + key + ' · mã điền sẵn = ' + JSON.stringify(id) + ' (cần ' + idRe + ')');
      }
    }
    if (pre.length) throw new Error('chế độ en: form "Tạo asset mới" điền sẵn chữ chưa dịch (' + pre.length + '):\n      ' + pre.slice(0, 30).join('\n      '));
    // chế độ vi giữ nguyên từng chữ như trước v0.20 (tên + mã + mô tả chép từ khung)
    await qe.goto(U + 'xuong?lang=vi'); await ready(qe); await qe.waitForSelector('.split.create .libcard');
    for (const [kind, key, name, id, desc] of [['Nhân vật', 'gen.khung/ma-no-canh', 'Nhân vật mới', 'nhan-vat-moi', null], ['Vật phẩm', 'gen.khung/khung-vu-khi-dai', 'vũ khí dài mới', 'vu-khi-dai-moi', 'Khối đại diện — gốc để tạo vật phẩm cùng dáng.'], ['Bối cảnh', 'gen.khung/san-khau-chuan', 'Cảnh mới', 'canh-moi', null]]) {
      await qe.click(L6 + ' .seg button:text-is("' + kind + '")'); await qe.waitForTimeout(250);
      await qe.click(L6 + ' .libgrid .libcard[title="' + key + '"]'); await qe.waitForSelector(L6 + ' input.mono');
      const got = await qe.evaluate(L => { const f = [...document.querySelectorAll(L + ' label.fld')], val = t => { const l = f.find(x => x.firstChild && x.firstChild.textContent === t); return l && l.querySelector('input') ? l.querySelector('input').value : null; }; return [val('Tên'), val('Mã (id)'), val('Mô tả')]; }, L6);
      if (got[0] !== name || got[1] !== id || (desc && got[2] !== desc)) throw new Error('chế độ vi: form "Tạo asset mới" (' + key + ') đổi chữ điền sẵn: ' + JSON.stringify(got) + ' (cần ' + JSON.stringify([name, id, desc]) + ')');
    }
    console.log('  ✓ Chế độ en: form "Tạo asset mới" mở từ ' + nForms + ' khung (nhân vật / vật phẩm / bối cảnh) — ô nhập điền sẵn không còn chữ Việt; tên "New …", mã new-character / new-item / new-scene; chế độ vi giữ nguyên "Nhân vật mới" / "vũ khí dài mới" / "Cảnh mới" + mã cũ');
    // 7) CNS-151: ô nghe thử giọng (Thư viện › Giọng) khi trình duyệt chưa chọn ngôn ngữ nghe thử → theo ngôn ngữ giao diện, không mặc định tiếng Việt
    await qe.evaluate(() => { localStorage.removeItem('gc-voice'); localStorage.setItem('gc-route-thu-vien', JSON.stringify({ page: 'lib-voices' })); });
    await qe.goto(U + 'thu-vien?lang=en'); await ready(qe); await qe.waitForSelector('#lvLang');
    const lv7 = await qe.evaluate(() => document.querySelector('#lvLang').value + '/' + document.querySelector('#lvAccent').value);
    if (lv7 !== 'en/us') throw new Error('Thư viện › Giọng (en, chưa chọn): ngôn ngữ nghe thử = ' + lv7 + ' (cần en/us)');
    console.log('  ✓ Chế độ en: ô nghe thử giọng chưa chọn → ' + lv7 + ' (theo ngôn ngữ giao diện)');
    // 8) CNS-151: Studio tạo tác phẩm gửi lang = ngôn ngữ giao diện — máy đặt mặc định vi, người dùng ở giao diện en → tác phẩm en (lời thoại, giọng, AI đạo diễn)
    await put('vi');
    await qe.evaluate(() => localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works' })));   // danh sách tác phẩm (bước 5 để lại tuyến phòng làm phim)
    await qe.goto('about:blank'); await qe.goto(U + 'tao-tac?lang=en'); await ready(qe); await qe.waitForSelector('.newwork input[type=text]');
    await qe.fill('.newwork input[type=text]', 'My first film');
    const [rq8] = await Promise.all([qe.waitForRequest(r => r.method() === 'POST' && /\/api\/works$/.test(r.url())), qe.click('.newwork button:text-is("Create work")')]);
    const sent8 = JSON.parse(rq8.postData() || '{}'), w8 = await (await rq8.response()).json();
    await put('en');
    if (sent8.lang !== 'en' || w8.lang !== 'en' || (w8.stats || {}).lang !== 'en') throw new Error('Studio en tạo tác phẩm trên máy vi: gửi lang=' + sent8.lang + ', lưu lang=' + w8.lang + ' (cần en)');
    console.log('  ✓ Studio (giao diện en, máy mặc định vi) tạo "My first film": gửi lang en → tác phẩm lang en');
    // 9) CNS-158: tên do NGƯỜI DÙNG đặt không bị dịch dù trùng msgid (bảng en có "Nam" → "Male", "Đạt" → "Approved"); nhãn của bộ khung vẫn dịch.
    //    Tạo SAU lượt quét (5) để không lẫn vào danh sách nội dung người dùng của lượt quét
    const fr16 = await qe.evaluate(() => JSON.parse(JSON.stringify(window.GenChibi.ASSETS['gen.khung/ma-no-canh'])));
    Object.assign(fr16, { id: 'nam', pack: 'local.my', name: 'Nam', role: 'Đạt', faction: '', persona: 'Văn võ song toàn', status: 'draft' }); delete fr16.key;
    const putN = await fetch(U + 'api/assets/local.my/nam', { method: 'PUT', headers: H, body: JSON.stringify(fr16) });
    const putD = await fetch(U + 'api/items', { method: 'POST', headers: H, body: JSON.stringify({ item: { id: 'dat', name: 'Đạt', type: 'weapon', rarity: 'common', equip: { slot: 'heldR', part: 'gen.khung/khoi-que-ngan' } } }) });
    if (!putN.ok || !putD.ok) throw new Error('không lưu được nhân vật "Nam" / vật phẩm "Đạt": ' + putN.status + ' / ' + putD.status);
    const at = async (app, route, sel) => { await qe.evaluate(([k, v]) => localStorage.setItem(k, v), ['gc-route-' + app, JSON.stringify(route)]); await qe.goto(U + app + '?lang=en'); await ready(qe); await qe.waitForSelector(sel, { timeout: 6000 }); };
    const lbl = sel => qe.$eval(sel, el => [el.getAttribute('data-anchor-label'), (el.querySelector('b') || {}).textContent].join('|'));
    const names = [];
    await at('xuong', { page: 'characters' }, '[data-anchor="asset:local.my/nam"]');   // Xưởng › Bàn chỉnh nhân vật: bảng có cả khung lẫn của tôi
    const rowN = await qe.$eval('[data-anchor="asset:local.my/nam"]', el => [el.getAttribute('data-anchor-label'), ...[...el.querySelectorAll('td')].map(td => td.textContent.trim())].join('|'));
    names.push(['Xưởng › nhân vật "Nam" (tên | vai)', rowN, /^Nam\|/.test(rowN) && /\|Đạt\|/.test(rowN) && !/Male|Approved/.test(rowN)]);
    const rowF = await qe.$eval('[data-anchor="asset:gen.khung/ma-no-canh"]', el => [el.getAttribute('data-anchor-label'), ...[...el.querySelectorAll('td')].map(td => td.textContent.trim())].join('|'));
    names.push(['Xưởng › khung ma-nơ-canh', rowF, /^Mannequin\|/.test(rowF) && /\|Standard character frame\|/.test(rowF)]);
    await at('xuong', { page: 'items' }, '[data-anchor="item:local.my/dat"]');
    names.push(['Xưởng › vật phẩm "Đạt"', await lbl('[data-anchor="item:local.my/dat"]'), null]);
    names[names.length - 1][2] = names[names.length - 1][1] === 'Đạt|Đạt';
    names.push(['Xưởng › vật phẩm khung', await lbl('[data-anchor="item:gen.khung/khung-vu-khi-dai"]'), null]);
    names[names.length - 1][2] = names[names.length - 1][1] === 'Long weapon frame|Long weapon frame';
    await at('thu-vien', { page: 'lib-characters', key: 'local.my/nam' }, '.libcard[data-anchor="asset:local.my/nam"]');   // Thư viện › Nhân vật: thẻ + hồ sơ đang mở
    names.push(['Thư viện › thẻ "Nam"', await lbl('.libcard[data-anchor="asset:local.my/nam"]'), null]);
    names[names.length - 1][2] = names[names.length - 1][1] === 'Nam|Nam';
    await qe.waitForSelector('.sticky .panel h3', { timeout: 6000 }); const insp16 = await qe.$eval('.sticky .panel h3', el => el.textContent);
    names.push(['Thư viện › hồ sơ "Nam"', insp16, /^Nam/.test(insp16) && !/Male/.test(insp16)]);
    await at('thu-vien', { page: 'lib-items', key: 'local.my/dat' }, '.libcard[data-anchor="item:local.my/dat"]');
    names.push(['Thư viện › thẻ "Đạt"', await lbl('.libcard[data-anchor="item:local.my/dat"]'), null]);
    names[names.length - 1][2] = names[names.length - 1][1] === 'Đạt|Đạt';
    const badN = names.filter(x => !x[2]);
    if (badN.length) throw new Error('CNS-158 — tên người dùng bị dịch / nhãn khung không dịch: ' + badN.map(x => x[0] + ': "' + x[1] + '"').join(' · '));
    console.log('  ✓ CNS-158: tên người dùng không bị dịch dù trùng msgid — "Nam" (vai "Đạt"), vật phẩm "Đạt" ở Xưởng + Thư viện (thẻ, hồ sơ, nhãn neo); nhãn khung vẫn dịch ("' + rowF.split('|')[0] + '", "Long weapon frame")');
    // 10) Q23: một chạm "Fun Office" ở giao diện en → nhập qua cổng như mọi gói; rồi một chạm bản Việt ở vi → hai bộ cài cạnh nhau;
    //     phòng làm phim + thẻ dự án Fun Office ở chế độ en không còn chữ Việt; phim HTML xuất ra là phim tiếng Anh (<html lang="en">, lời thoại Anh) và diễn được
    await qe.goto(U + '?lang=en'); await ready(qe); await qe.waitForSelector('ol.qsteps');
    await qe.click('ol.qsteps ~ .row > button:has-text("Open the sample project")'); await qe.waitForURL(/\/thu-vien/, { timeout: 8000 });
    await qe.waitForSelector('.libcard.proj[title="mau-fun-office"]', { timeout: 8000 });
    const foCard = await qe.textContent('.libcard.proj[title="mau-fun-office"]');
    if (!/Fun Office \(sample\)/.test(foCard)) throw new Error('thẻ dự án Fun Office (en): ' + foCard);
    await qe.click('.libcard.proj[title="mau-fun-office"]'); await qe.waitForTimeout(600);
    const foFound = [...await scanEn(qe, 'Dự án chủ đề › Fun Office')];
    const foW = await (await fetch(U + 'api/works/fo-first-day')).json();
    if (foW.lang !== 'en' || foW.shots.length !== 4) throw new Error('tác phẩm Fun Office sau một chạm: lang ' + foW.lang + ', ' + (foW.shots || []).length + ' phân cảnh');
    await qe.goto(U + 'tao-tac?lang=en#/tac-pham/fo-first-day/script'); await ready(qe); await qe.waitForSelector('#wtab-script');
    for (const t of ['script', 'shots', 'review', 'voice', 'publish']) { await qe.click('#wtab-' + t); await qe.waitForTimeout(600); foFound.push(...await scanEn(qe, 'Fun Office › phòng làm phim › ' + t)); }
    if (foFound.length) throw new Error('Fun Office ở chế độ en còn chữ Việt:\n      ' + [...new Set(foFound)].slice(0, 20).join('\n      '));
    const [fdl10] = await Promise.all([qe.waitForEvent('download'), qe.click('button:text-is("Film (HTML)")')]);
    const fp10 = path.join(home16, 'fun-office.html'); await fdl10.saveAs(fp10);
    const fh10 = fs.readFileSync(fp10, 'utf8');
    if (!/<html lang="en">/.test(fh10)) throw new Error('phim Fun Office: <html lang> phải là en (ngôn ngữ phim), có ' + (/<html lang="[^"]*">/.exec(fh10) || ['?'])[0]);
    for (const w of ['THREE HUNDRED PAGES?!', 'the door is still locked at 6', '>▶ Play<']) if (!fh10.includes(w)) throw new Error('phim Fun Office thiếu ' + JSON.stringify(w));
    if (/BA TRĂM TRANG|Chào sếp ạ|Ngày đầu đi làm/.test(fh10)) throw new Error('phim Fun Office lẫn nội dung bản Việt');
    const pf10 = await ctxE.newPage(), pe10 = []; pf10.on('pageerror', e => pe10.push(e.message));
    await pf10.goto('file://' + fp10); await pf10.waitForFunction(() => window.GenChibi && window.GenChibi.film);
    const rd10 = await pf10.evaluate(() => [document.querySelectorAll('#chapters li').length, GenChibi.film.readiness(FILM).filter(x => !x.ok).length, window.GenChibi.i18n.lang()]);
    await pf10.click('#chapters li:nth-child(1) button');   // diễn thật chương 1: câu đầu tiên hiện lên (bong bóng / phụ đề) bằng tiếng Anh
    await pf10.waitForSelector('.gcp-bub.on, .gcp-cap.on', { timeout: 30000 });
    const st10 = (await pf10.textContent('.gcp-bub.on, .gcp-cap.on')).trim();
    await pf10.click('#stop'); await pf10.close();
    if (pe10.length || rd10.join() !== '4,0,en' || !/Good morning, boss!/.test(st10)) throw new Error('phim Fun Office mở bằng file:// ' + JSON.stringify([rd10, st10]) + ' ' + pe10.slice(0, 2).join(' | '));
    // bản Việt cài SAU lượt quét (nội dung Việt của nó hiện ở ô chọn cảnh / diễn viên của mọi tác phẩm — là nội dung người dùng)
    await qe.goto(U + '?lang=vi'); await ready(qe); await qe.waitForSelector('ol.qsteps');
    const viLeft = await qe.$$eval('ol.qsteps ~ .row > button', els => els.map(e => e.textContent.trim()));
    if (viLeft[0] !== '✨ Mở dự án mẫu "Văn phòng vui"') throw new Error('vi sau khi cài Fun Office: phải còn mời Văn phòng vui: ' + JSON.stringify(viLeft));
    await qe.click('ol.qsteps ~ .row > button:has-text("Văn phòng vui")'); await qe.waitForURL(/\/thu-vien/, { timeout: 8000 });
    await qe.waitForSelector('.libcard.proj[title="mau-van-phong-vui"]', { timeout: 8000 });
    const pj10 = (await (await fetch(U + 'api/projects')).json()).map(p => p.id), ch10 = (await (await fetch(U + 'api/assets')).json()).map(a => a.id);
    if (!pj10.includes('mau-fun-office') || !pj10.includes('mau-van-phong-vui') || !['fo-nana', 'fo-boss-ted', 'fo-barry', 'mau-be-na', 'mau-sep-tu', 'mau-anh-ba'].every(i => ch10.includes(i))) throw new Error('hai bộ văn phòng phải cài cạnh nhau: ' + pj10 + ' / ' + ch10.filter(i => /^(fo|mau)-/.test(i)));
    console.log('  ✓ Q23: một chạm "Fun Office" (en) + "Văn phòng vui" (vi) → hai bộ cài cạnh nhau qua cổng nhập · thẻ dự án + 5 tab phòng làm phim Fun Office (en) không chữ Việt · phim xuất <html lang="en">, lời thoại Anh, mở file:// 4 chương sẵn sàng, diễn câu đầu "' + st10.slice(0, 40) + '"');
    await ctxE.close();
    if (errs16.length) throw new Error('lỗi trang: ' + errs16.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ i18n (ngôn ngữ giao diện):', e.message); }
  finally { await b16.close(); srv16.kill(); }
}
// ---- v0.23 §A: THIẾT LẬP LẦN ĐẦU qua Studio thật — đăng nhập lần đầu (admin / admin, lý do khi bị từ chối) → màn khởi tạo bắt buộc → wizard: bước 2 tên miền
// (Go online nhúng; bước Internet lỗi → đỏ + cách sửa + "Tạm dùng trên máy này" — không khoá) → bước 3 chẩn đoán MCP (tự kiểm cục bộ thật, thẻ nối agent dùng chung,
// kiểm thật lời gọi MCP đầu tiên) → Studio + dải nhắc; đăng nhập lại về đúng bước đang dở · token trong Studio vẫn bị giữ ở màn khởi tạo · "Chỉ dùng trên máy này" +
// "Tôi nối agent sau" · máy nâng cấp: "Kiểm tra thiết lập" một lần. Mỗi màn: en không lọt chữ Việt, vi là tiếng Việt; GC_SHOTS=<thư mục> chụp en + vi.
// GC_ONLY=setup (cổng 7700, 7702, 7704).
if (want('setup')) {
  const crypto = await import('crypto');
  const { fakeCloudflare } = await import('./fixtures/fake-cloudflare-api.mjs');
  const SHOTS = process.env.GC_SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const cf = await fakeCloudflare({ token: 'cfapi_' + crypto.randomBytes(18).toString('hex'), zones: [{ id: crypto.randomBytes(16).toString('hex'), name: 'example.com', status: 'active', type: 'full' }] });
  const TOKS = 'tok-setup-' + crypto.randomBytes(8).toString('hex'), P1 = 7700, P2 = 7702, P3 = 7704;
  const boot = (port, home, extra) => kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: String(port), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: TOKS, GC_PUBLIC_URL: '', GC_ALLOWED_HOSTS: '',
    GC_TEST: '1', GC_TEST_ONLINE_VIA: '127.0.0.1:' + port, GC_TEST_CF_API: cf.base, HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: '', ...(extra || {}) }, stdio: 'ignore' }));
  const home1 = mkdtempSync(path.join(tmpdir(), 'gc-su1-')), home2 = mkdtempSync(path.join(tmpdir(), 'gc-su2-')), home3 = mkdtempSync(path.join(tmpdir(), 'gc-su3-'));
  // máy v0.22 nâng cấp (đã có mật khẩu, chưa setup.json) — tên đăng nhập "owner"
  { const salt = crypto.randomBytes(16), hh = crypto.scryptSync('mat khau cua ban v022', salt, 32, { N: 1024, r: 8, p: 1 });
    fs.mkdirSync(path.join(home3, 'data'), { recursive: true });
    fs.writeFileSync(path.join(home3, 'data/auth.json'), JSON.stringify({ v: 1, users: { owner: { id: 'owner', role: 'owner', hash: ['scrypt', 1024, 8, 1, salt.toString('base64url'), hh.toString('base64url')].join('$'), setAt: 'x' } }, sessions: {}, devices: {} }), { mode: 0o600 }); }
  const s1 = boot(P1, home1), s2 = boot(P2, home2), s3 = boot(P3, home3);
  for (const p of [P1, P2, P3]) for (let i = 0; i < 100; i++) { try { if ((await _fetch('http://127.0.0.1:' + p + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 100)); }
  autoLogin(false); legacyVi(false); const bs = await pw.chromium.launch(); autoLogin(true); legacyVi(true);
  const errsS = [], found = [], shots = [];
  const VIS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  const SUB = '#gcLogin button[type=submit]';
  // cửa sổ admin như genchibi open ghi: khoá một lần 128 bit (CNS-268) — trả khoá; link = http://localhost:<cổng>/login#k=<khoá>
  const win = home => { const key = crypto.randomBytes(16).toString('hex'); fs.mkdirSync(path.join(home, 'run'), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(home, 'run/admin-window'), JSON.stringify({ v: 1, exp: Date.now() + 1800e3, mode: 'native', composeLoopback: false, by: 'test', key }), { mode: 0o600 }); return key; };
  const stage = home => { try { return JSON.parse(fs.readFileSync(path.join(home, 'data/setup.json'), 'utf8')).stage; } catch (e) { return ''; } };
  // chữ Việt lọt ở chế độ en (bỏ ô nhập / nội dung người dùng / phần tử lang="vi")
  const scanEn = (pg, where) => pg.evaluate(([where, src]) => {
    const VI = new RegExp(src, 'i'), out = [], vis = el => !!el && (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0);
    const skip = el => !!el.closest('[data-user-content], [lang|="vi"], script, style, input, textarea, svg title');
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { const el = n.parentElement; if (el && VI.test(n.nodeValue) && !skip(el) && vis(el)) out.push(where + ' · ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' · ' + n.nodeValue.trim().slice(0, 90)); }
    for (const el of document.body.querySelectorAll('[title], [placeholder], [aria-label]')) { if (el.closest('[data-user-content], [lang|="vi"]') || !vis(el)) continue; for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && VI.test(v)) out.push(where + ' · [' + a + '] ' + v.slice(0, 60)); } }
    const view = document.getElementById('view'); if (view && view.scrollWidth > view.clientWidth + 4) out.push('BỐ CỤC ' + where + ' · trang tràn ngang ' + view.scrollWidth + ' > ' + view.clientWidth);
    return out;
  }, [where, VIS.source]);
  // một màn ở en + vi: đổi ngôn ngữ bằng gc-lang rồi nạp lại (lớp phủ đăng nhập che nút chuyển ngôn ngữ), redo dựng lại trạng thái chỉ có trong trang
  const screen = async (pg, name, sel, redo) => {
    for (const l of ['en', 'vi']) {
      await pg.evaluate(l => localStorage.setItem('gc-lang', l), l); await pg.reload(); await pg.waitForSelector(sel, { timeout: 15000 });
      if (redo) await redo(pg); await pg.waitForTimeout(400);
      if (l === 'en') found.push(...await scanEn(pg, name));
      else { const t = await pg.evaluate(() => document.body.innerText); if (!VIS.test(t)) found.push(name + ' · vi: không thấy chữ Việt'); }
      if (SHOTS) {
        const f = path.join(SHOTS, name + '-' + l + '.png'), hgt = await pg.evaluate(() => { const v = document.getElementById('view'); return v && !document.getElementById('gcLogin') ? v.scrollHeight + v.getBoundingClientRect().top + 24 : 900; });
        await pg.setViewportSize({ width: 1366, height: Math.max(900, Math.min(4000, Math.ceil(hgt))) }); await pg.waitForTimeout(200);
        await pg.screenshot({ path: f }); shots.push(f); await pg.setViewportSize({ width: 1366, height: 900 });
      }
    }
    await pg.evaluate(() => localStorage.setItem('gc-lang', 'en'));
  };
  const alertOf = async pg => { await pg.waitForSelector('#gcLogin [role=alert]:not([hidden])', { timeout: 8000 }); return { text: await pg.textContent('#gcLogin [role=alert]'), reason: await pg.getAttribute('#gcLogin [role=alert]', 'data-reason') }; };
  const loginAs = async (pg, u, p) => { await pg.fill('#gcUser', u); await pg.fill('#gcPw', p); await pg.click(SUB); };
  try {
    const ctx = await bs.newContext({ viewport: { width: 1366, height: 900 } });
    const q = await ctx.newPage(); q.on('pageerror', e => errsS.push(e.message));
    const A = 'http://localhost:' + P1;
    // ---- 1) đăng nhập lần đầu: dải admin / admin; ngoài cửa sổ → ĐÚNG lý do + cách vào
    await q.goto(A + '/'); await q.evaluate(() => localStorage.setItem('gc-lang', 'en'));
    await screen(q, 'su-01-login', '#gcLogin form[data-auth="login"] #gcFirstRun');
    // CNS-272: lúc stage admin không có câu "nhớ 30 ngày" (phiên admin 30 phút, không nhớ thiết bị) và không có dòng "nâng cấp từ v0.22 … owner" (bản cài mới)
    if (await q.$('#gcRemember') || await q.$('#gcOwnerDefault')) throw new Error('stage admin: không được có "nhớ đăng nhập 30 ngày" / "nâng cấp từ v0.22: tên owner"');
    if (await q.getAttribute('#gcFirstRun', 'data-key') !== 'no' || !/genchibi open/.test(await q.textContent('#gcFirstRun'))) throw new Error('không mở bằng link: dải lần đầu phải nói admin / admin chỉ qua link (genchibi open)');
    await loginAs(q, 'admin', 'admin');
    let al = await alertOf(q);
    if (al.reason !== 'window' || !/genchibi open/.test(al.text) || !/genchibi password/.test(al.text)) throw new Error('ngoài cửa sổ: lý do window + genchibi open / password: ' + JSON.stringify(al));
    await screen(q, 'su-02-login-reason', '#gcLogin form[data-auth="login"]', async pg => { await loginAs(pg, 'admin', 'admin'); await alertOf(pg); });
    console.log('  ✓ Đăng nhập lần đầu: dải "admin / admin"; ngoài cửa sổ → lý do "window" + genchibi open / genchibi password (en + vi)');
    // ---- 2) lệnh trên máy chủ mở cửa sổ → admin / admin → màn khởi tạo bắt buộc
    const key1 = win(home1);
    // cửa sổ mở nhưng trang KHÔNG mở bằng link (không khoá) → lý do link (CNS-268: user Unix khác / container khác chạm được cổng nhưng không có khoá)
    await q.reload(); await q.waitForSelector('#gcUser'); await loginAs(q, 'admin', 'admin');
    al = await alertOf(q);
    if (al.reason !== 'link' || !/genchibi open/.test(al.text)) throw new Error('cửa sổ mở, không link → lý do link + genchibi open: ' + JSON.stringify(al));
    // mở đúng link từ máy chủ: khoá đọc từ #k=…, xoá khỏi thanh địa chỉ ngay, chỉ giữ trong sessionStorage của tab
    await q.goto(A + '/login#k=' + key1); await q.waitForSelector('#gcFirstRun[data-key="yes"]', { timeout: 10000 });
    const kst = await q.evaluate(() => ({ hash: location.hash, href: location.href, ss: sessionStorage.getItem('gc-admin-key') }));
    if (kst.hash || kst.href.includes(key1) || kst.ss !== key1) throw new Error('khoá của link phải rời thanh địa chỉ và chỉ nằm trong sessionStorage: ' + JSON.stringify(kst));
    await screen(q, 'su-02b-login-link', '#gcFirstRun[data-key="yes"]');
    await loginAs(q, 'admin', 'admin');
    await q.waitForSelector('#gcLogin form[data-auth="init"]', { timeout: 10000 });
    if (await q.$$eval('#gcSteps > div', d => d.map(x => x.getAttribute('data-state')).join(',')) !== 'cur,todo,todo') throw new Error('màn khởi tạo phải có dải 3 bước, bước 1 đang làm (CNS-272)');
    await screen(q, 'su-03-init', '#gcLogin form[data-auth="init"]');
    const wantInit = ['#gcUser', '#gcName', '#gcEmail', '#gcPw', '#gcPw2', '#gcAdminLeft'];
    for (const sel of wantInit) if (!(await q.$(sel))) throw new Error('màn khởi tạo thiếu ' + sel);
    // phiên admin chỉ mở màn khởi tạo: đi tới trang khác vẫn là màn khởi tạo
    await q.goto(A + '/xuong'); await q.waitForSelector('#gcLogin form[data-auth="init"]', { timeout: 10000 });
    await q.fill('#gcUser', 'ryan'); await q.fill('#gcName', 'Ryan'); await q.fill('#gcEmail', 'ryan@example.com'); await q.fill('#gcPw', 'mot cum tu cua ryan day'); await q.fill('#gcPw2', 'mot cum tu cua ryan day'); await q.click(SUB);
    // ---- 3) wizard bước 2: hai lựa chọn; "Đưa lên mạng" nhúng Go online
    await q.waitForSelector('#suBox #suDomain', { timeout: 15000 });
    if (stage(home1) !== 'domain' || await q.$('#gcLogin')) throw new Error('khởi tạo xong phải vào wizard bước 2 (stage domain): ' + stage(home1));
    const nav = await q.$$eval('#nav .nav-item', els => els.map(e => e.id).join(','));
    if (nav !== 'navSu-setup,navSu-online,navSu-account') throw new Error('wizard: thanh bên chỉ có Thiết lập lần đầu / Lên mạng / Tài khoản chủ: ' + nav);
    await q.goto(A + '/thu-vien'); await q.waitForSelector('#suDomain', { timeout: 10000 });   // trang khác → vẫn wizard (cổng theo stage)
    await screen(q, 'su-04-domain', '#suDomain');
    console.log('  ✓ Màn khởi tạo bắt buộc (tên đăng nhập / tên hiển thị / email / mật khẩu ×2, phiên admin hết hạn lúc …) — mở trang khác vẫn là màn khởi tạo; xong → wizard bước 2, thanh bên chỉ ba trang, trang khác vẫn về wizard');
    await q.click('#suPick-online'); await q.waitForSelector('#suOnline #olPaths', { timeout: 10000 });
    await screen(q, 'su-05-online', '#suDomain', async pg => { await pg.click('#suPick-online'); await pg.waitForSelector('#suOnline #olPaths'); });
    // ---- 4) bước Internet lỗi (token Cloudflare sai) → đỏ + cách sửa + "Tạm dùng trên máy này" (không khoá)
    await q.click('.olpath[data-path="cloudflare"]'); await q.fill('#olToken', 'x'.repeat(40)); await q.click('#olGo');
    await q.waitForSelector('#olSteps tr[data-step="token"][data-state="fail"]', { timeout: 20000 });
    await q.waitForSelector('#suLaterBar.bad #suLocalPending', { timeout: 10000 });
    const fixTxt = await q.textContent('#olSteps tr[data-step="token"]');
    if (!/401/.test(fixTxt)) throw new Error('bậc token ✗ phải mang mã gốc 401 + cách sửa: ' + fixTxt);
    if (SHOTS) for (const l of ['en', 'vi']) { await q.click('#langSwitch button[data-lang="' + l + '"]'); await q.waitForTimeout(600); if (l === 'en') found.push(...await scanEn(q, 'su-06-online-fail')); const hgt = await q.evaluate(() => { const v = document.getElementById('view'); return v ? v.scrollHeight + v.getBoundingClientRect().top + 24 : 900; }); await q.setViewportSize({ width: 1366, height: Math.max(900, Math.min(4000, Math.ceil(hgt))) }); await q.waitForTimeout(200); await q.screenshot({ path: path.join(SHOTS, 'su-06-online-fail-' + l + '.png') }); shots.push(path.join(SHOTS, 'su-06-online-fail-' + l + '.png')); await q.setViewportSize({ width: 1366, height: 900 }); }   // khung trang cố định, #view tự cuộn: kéo cao khung nhìn để ảnh có cả hàng ✗
    else { await q.click('#langSwitch button[data-lang="en"]').catch(() => {}); await q.waitForTimeout(300); found.push(...await scanEn(q, 'su-06-online-fail')); }
    await q.click('#langSwitch button[data-lang="en"]').catch(() => {}); await q.waitForTimeout(300);
    await q.click('#suLocalPending');
    console.log('  ✓ Bước Internet lỗi (Cloudflare 401) → bậc ✗ đỏ kèm mã gốc + cách sửa; dải "Tạm dùng trên máy này" chuyển đỏ — bấm được, không khoá owner');
    // ---- 5) bước 3: tự kiểm cục bộ thật (tự chạy) → thẻ nối agent → kiểm thật
    await q.waitForSelector('#suMcp #suSelfState', { timeout: 30000 });
    const selfOk = await q.$eval('#suSelfState', e => e.className.includes('ok'));
    const rows = await q.$$eval('#suSelfGrid tr[data-check]', t => t.map(x => x.getAttribute('data-check') + ':' + x.getAttribute('data-state')).join(' '));
    if (!selfOk || rows !== 'http:ok token:ok stdio:ok host:wait') throw new Error('tự kiểm cục bộ phải đạt cả 3 (HTTP /mcp, token, cầu stdio trong app) + MCP-04 chờ genchibi setup check: ' + rows);
    if (!/genchibi setup check/.test(await q.textContent('#suSelfGrid tr[data-check="host"]'))) throw new Error('MCP-04 chưa chạy: phải nói đúng lệnh cần chạy trên máy chủ');
    // MCP-04 THẬT (CNS-269): CLI thật trên thư mục cài giả (current → cây mã) chạy "<đường tuyệt đối> mcp" rồi báo về app
    fs.symlinkSync(ROOT, path.join(home1, 'current')); fs.writeFileSync(path.join(home1, '.env'), 'GC_MODE=native\nGC_PORT=' + P1 + '\nGC_LANG=en\nGC_API_TOKEN=' + TOKS + '\n', { mode: 0o600 });
    { const t = path.join(home1, '.local/lib/gen-chibi'); fs.mkdirSync(t, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(t, 'installs'), 'native ' + fs.realpathSync(home1) + '\n', { mode: 0o600 }); }   // bản ghi native như trình cài ghi (v0.23.1)
    const hcr = spawnSync('bash', [path.join(ROOT, 'cli/genchibi'), 'setup', 'check'], { env: { PATH: process.env.PATH, HOME: home1, GC_HOME: home1, GC_CLI_INNER: '1' }, encoding: 'utf8', timeout: 60000 });
    if (hcr.status !== 0 || !/MCP-04 ✓/.test(hcr.stdout)) throw new Error('genchibi setup check phải đạt: ' + hcr.stdout + hcr.stderr);
    await q.waitForSelector('#suSelfGrid tr[data-check="host"][data-state="ok"]', { timeout: 15000 });
    const cliAbs = path.join(ROOT, 'cli/genchibi');
    if (!(await q.textContent('#suCards #agCcLocal')).includes(cliAbs + ' mcp') || !(await q.textContent('#suCards #agJsonCfg')).includes(JSON.stringify(cliAbs))) throw new Error('thẻ nối agent phải dùng đường tuyệt đối của lệnh (run/cli-path): ' + await q.textContent('#suCards #agCcLocal'));
    if (!(await q.$('#suCards #agCcLocal')) || !(await q.$('#suCards #agAiOff')) || !(await q.$('#suCards #agJsonCfg'))) throw new Error('thẻ nối agent (Claude Code / claude.ai khi chưa lên mạng / JSON) phải có ở bước 3');
    if (!(await q.$eval('#suFinish', b => b.disabled)) || (await q.$eval('#suLater', b => b.disabled))) throw new Error('chưa agent nào nối: "Xong" khoá, "Tôi nối agent sau" mở (tự kiểm đã đạt)');
    if (await q.$('#suInet')) throw new Error('chưa lên mạng: không có phần kiểm từ Internet');
    await screen(q, 'su-07-mcp', '#suMcp #suSelfState');
    // đăng nhập lại khi wizard chưa xong → về đúng bước đang dở (bước 3)
    const ctxR = await bs.newContext({ viewport: { width: 1366, height: 900 } }), qr = await ctxR.newPage(); qr.on('pageerror', e => errsS.push(e.message));
    await qr.goto(A + '/login'); await qr.evaluate(() => localStorage.setItem('gc-lang', 'en')); await qr.reload(); await qr.waitForSelector('#gcUser');
    await loginAs(qr, 'ryan', 'mot cum tu cua ryan day'); await qr.waitForSelector('#suMcp', { timeout: 15000 });
    if (await qr.$('#suDomain')) throw new Error('đăng nhập lại phải về đúng bước 3');
    await ctxR.close();
    // agent đầu tiên nối qua genchibi mcp (cầu stdio thật) → ✓ "Agent … đã nối", "Xong" mở
    await new Promise(done => { const c = spawn(process.execPath, [path.join(ROOT, 'server/mcp-stdio.js')], { env: { ...process.env, GC_HOME: home1, GC_PORT: String(P1), GC_API_TOKEN: TOKS }, stdio: ['pipe', 'ignore', 'ignore'] }); c.on('exit', done);
      c.stdin.end('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-code","version":"2"}}}\n'); });
    await q.waitForSelector('#suLiveOk[data-client="claude-code"]', { timeout: 15000 });
    if (await q.$eval('#suFinish', b => b.disabled)) throw new Error('agent đã nối: "Xong" phải mở');
    await screen(q, 'su-08-agent', '#suLiveOk');
    await q.click('#suFinish');
    await q.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent) && !document.getElementById('suBox'), null, { timeout: 15000 });
    await q.waitForSelector('#remOnline', { timeout: 10000 });
    if (await q.$('#remAgent') || stage(home1) !== 'done') throw new Error('xong: Studio mở, dải "Lên mạng chưa xong" (tạm dùng trên máy này), không dải "chưa agent"');
    await screen(q, 'su-09-home', '#remOnline');
    console.log('  ✓ Bước 3: tự kiểm cục bộ THẬT tự chạy (HTTP /mcp · token · stdio ✓) · thẻ nối agent dùng chung · "Xong" chỉ mở khi agent gọi MCP (genchibi mcp → ✓ claude-code) · đăng nhập lại về đúng bước dở · xong → Studio + dải "Lên mạng chưa xong"');
    await ctx.close();
    // ---- 6) Studio vào bằng token ở stage admin → vẫn là màn khởi tạo (cổng đọc stage cho cả token); "Chỉ dùng trên máy này" + "Tôi nối agent sau"
    const ctx2 = await bs.newContext({ viewport: { width: 1366, height: 900 } }), q2 = await ctx2.newPage(); q2.on('pageerror', e => errsS.push(e.message));
    const B = 'http://localhost:' + P2;
    await q2.goto(B + '/login'); await q2.evaluate(t => { localStorage.setItem('gc-lang', 'en'); localStorage.setItem('gc-token', t); }, TOKS);
    await q2.goto(B + '/thu-vien'); await q2.waitForSelector('#gcLogin form[data-auth="init"]', { timeout: 10000 });
    if (await q2.$('#gcAdminLeft')) throw new Error('token: màn khởi tạo không có phiên admin');
    await q2.fill('#gcUser', 'chu-may'); await q2.fill('#gcPw', 'mat khau chu may hai'); await q2.fill('#gcPw2', 'mat khau chu may hai'); await q2.click(SUB);
    await q2.waitForSelector('#suDomain', { timeout: 15000 });
    await q2.click('#suPick-local'); await q2.waitForSelector('#suLocalBox'); await q2.click('#suLocal');
    await q2.waitForSelector('#suSelfState.ok', { timeout: 30000 });
    await q2.click('#suLater');
    await q2.waitForSelector('#remAgent', { timeout: 15000 });
    if (await q2.$('#remOnline')) throw new Error('"Chỉ dùng trên máy này": không có dải "Lên mạng chưa xong"');
    await ctx2.close();
    console.log('  ✓ Studio đăng nhập bằng token ở stage admin → vẫn màn khởi tạo (cổng theo stage cho cả token) · "Chỉ dùng trên máy này" → bước 3 · "Tôi nối agent sau" (tự kiểm đạt) → Studio + dải "chưa agent nào nối"');
    // ---- 7) máy v0.22 nâng cấp: done + "Kiểm tra thiết lập" một lần
    const ctx3 = await bs.newContext({ viewport: { width: 1366, height: 900 } }), q3 = await ctx3.newPage(); q3.on('pageerror', e => errsS.push(e.message));
    const C = 'http://localhost:' + P3;
    await q3.goto(C + '/login'); await q3.evaluate(() => localStorage.setItem('gc-lang', 'en')); await q3.reload(); await q3.waitForSelector('#gcUser');
    if (await q3.$('#gcFirstRun')) throw new Error('máy có mật khẩu: không dải admin / admin');
    if ((await q3.$('#gcOwnerDefault')) || !(await q3.$('#gcRemember'))) throw new Error('máy đã thiết lập: có "nhớ 30 ngày", chưa có dòng "tên là owner" khi chưa sai lần nào (CNS-272)');
    await loginAs(q3, 'ryan', 'sai mat khau roi day'); await alertOf(q3);
    if (!(await q3.$('#gcOwnerDefault'))) throw new Error('sai một lần ở máy đã thiết lập → gợi ý "nâng cấp từ v0.22: tên đăng nhập là owner"');
    await loginAs(q3, 'owner', 'mat khau cua ban v022');
    await q3.waitForSelector('#remReview', { timeout: 15000 });
    await q3.click('#remReviewOpen'); await q3.waitForSelector('#suReviewDone', { timeout: 10000 });
    await q3.click('#suSelfRun'); await q3.waitForSelector('#suSelfState.ok', { timeout: 30000 });
    await screen(q3, 'su-10-review', '#remReview', async pg => { await pg.click('#remReviewOpen'); await pg.waitForSelector('#suReviewDone', { timeout: 10000 }); await pg.waitForSelector('#suSelfState.ok', { timeout: 10000 }); });   // trang thiết lập không lưu làm route: tải lại → trang cũ + dải nhắc
    await q3.click('#suReviewDone');
    await q3.waitForFunction(() => /^v\d/.test((document.getElementById('verChip') || {}).textContent) && !document.getElementById('suBox'), null, { timeout: 15000 });
    await q3.waitForTimeout(500);
    if (await q3.$('#remReview')) throw new Error('đã kiểm xong: dải "Kiểm tra thiết lập" không hiện lại');
    // L-73 / CNS-272: mọi trang có nhãn người đọc cho dock ("Đang xem: …") — không trang nào rơi về id thô, ở en không lọt chữ Việt
    const labels = await q3.evaluate(() => window.GCStudioPageLabels());
    const rawIds = labels.filter(([k, l]) => !l || l === k || VIS.test(l));
    if (!labels.length || rawIds.length) throw new Error('nhãn trang cho dock lọt id thô / chữ Việt ở en: ' + JSON.stringify(rawIds));
    await ctx3.close();
    console.log('  ✓ Máy v0.22 nâng cấp (có mật khẩu): đăng nhập "owner", Studio mở + dải "Kiểm tra thiết lập" một lần → trang kiểm (tự kiểm MCP + thẻ nối agent) → "Đã kiểm xong" → hết dải');
    if (found.length) throw new Error('i18n / bố cục: ' + found.slice(0, 8).join(' | '));
    console.log('  ✓ i18n: ' + 10 + ' màn của thiết lập lần đầu — en không lọt chữ Việt, vi là tiếng Việt' + (SHOTS ? ' · ' + shots.length + ' ảnh (en + vi) ở ' + SHOTS : ''));
    if (errsS.length) throw new Error('lỗi trang: ' + errsS.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ thiết lập lần đầu (Studio):', e.message); }
  finally { await bs.close(); s1.kill(); s2.kill(); s3.kill(); try { cf.close(); } catch (e) { /* đã đóng */ } }
}
// ---- v0.22: XUẤT VIDEO — qua server THẬT + Studio thật (không file://), iframe ẩn studio/video-export.html dưới CSP của Studio (CNS-214). GC_ONLY=video (cổng 7690).
//  Fun Office phân cảnh 1 (720p, giọng AI giả = clip WAV 2 kHz, MỘT câu cố ý thiếu clip — Q39): payload = phim HTML (CNS-219) · giống bộ phát sống ở 4 khung
//  (≤ 2/255) · tiếng ≈ hình ±1 khung · câu thoại đầu đúng giờ ±1 khung · câu thiếu clip im lặng, không blip, bong bóng + phụ đề vẫn có · long task ≤ 100 ms ·
//  phim tiếng Anh không chữ Việt (khung / .srt / .txt) · không rò bản vá sang Studio, Studio vẫn phát thời gian thực · Huỷ giải phóng, không để tệp ·
//  tab nền THẬT SỰ bị ẩn (CDP thuần — Playwright luôn giữ trang "visible") vẫn xong · Tam Quốc 1 phân cảnh 1080p ghi luồng ra tệp (OPFS): đo heap + nhịp tim (chặn ở 100 ms — B5 chụp theo lớp).
//  P3 (bảng Xuất video trong Studio, đi bằng nút thật): nút khoá đúng lý do theo phép dò (không an toàn / thiếu VideoEncoder / không phải Chromium) · dùng lại
//  askExport · bảng chọn (định dạng dò thật, trần độ dài, ước tính, vượt trần → chặn) · Bắt đầu → chọn thư mục trong cú bấm → tiến độ theo phân cảnh → 4 tệp
//  (OPFS) · Xem thử phát · Chọn khung khác thay bìa · 9:16 ra 1080×1920 · Huỷ không để tệp · Fun Office 1080p nhịp tim (chặn 100 ms) · 9:16 thật (Q37 b) · work.video (B9) · en / vi. GC_SHOTS=<thư mục> chụp màn.
if (want('video') || want('video-ui')) {
  const P3_ONLY = ONLY_SET.includes('video-ui') && !ONLY_SET.includes('video');   // GC_ONLY=video-ui: chỉ phần P3 (bảng Xuất video) — lặp nhanh khi sửa giao diện / chạy đột biến
  const { inspectMp4, inspectWebm } = require('./media-inspect.js');
  const { launch: cdpLaunch } = await import('./cdp.mjs');
  const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
  const home20 = mkdtempSync(path.join(tmpdir(), 'gc-')), PORT20 = 7690, O20 = 'http://localhost:' + PORT20, U20 = O20 + '/';
  const srv20 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home20, GC_PORT: String(PORT20), GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  for (let i = 0; i < 60; i++) { try { await fetch(U20 + 'api/health'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const b20 = await pw.chromium.launch({ args: ['--enable-precise-memory-info'] });
  const ctx20 = await b20.newContext({ viewport: { width: 1400, height: 900 } });
  const T0 = Date.now(), FPS = 30, FR = 1000 / FPS, HAS_FF = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  const errs20 = [];
  // NHỊP TIM ĐỐI CHỨNG (ngân sách long task 100 ms, spec §3): một trang rỗng ở browser context KHÁC (tiến trình renderer khác, luồng chính khác) chạy cùng
  // nhịp 10 ms. Máy ảo của bộ test có lúc khựng CẢ MÁY (đo: trang rỗng này hở tới ~100 ms, tiến trình Node rảnh hở ~60 ms) — phần đó không phải việc của
  // Studio. Mỗi khoảng hở của Studio trừ đi khoảng hở lớn nhất của trang đối chứng trùng thời điểm; ngưỡng 100 ms áp lên phần còn lại, và báo cả số thô.
  const ctlCtx20 = await b20.newContext(), ctl20 = await ctlCtx20.newPage();
  await ctl20.goto('data:text/html,<title>ctl</title>');
  await ctl20.evaluate(() => { window.G = []; let last = performance.now(); setInterval(() => { const n = performance.now(); window.G.push([n - last, performance.timeOrigin + n]); last = n; }, 10); });
  // gaps: [[ms, mốc cuối tuyệt đối (timeOrigin + now)]] của trang Studio → { raw, mine, top } (top: "thô−đối chứng" của 5 khoảng hở lớn nhất)
  const hbJudge = async gaps => {
    const G = await ctl20.evaluate(() => window.G.slice()), ov = (d, t) => Math.max(0, ...G.filter(x => x[1] >= t - d && x[1] - x[0] <= t).map(x => x[0]));
    const rows = gaps.map(([d, t]) => { const c = d > 50 ? ov(d, t) : 0; return { d, c, m: d - c }; });
    return { raw: Math.max(0, ...rows.map(r => r.d)), mine: Math.max(0, ...rows.map(r => r.m)), n: rows.length,
      top: rows.slice().sort((a, b) => b.d - a.d).slice(0, 5).map(r => Math.round(r.d) + (r.c > 20 ? '−' + Math.round(r.c) : '')).join(' / ') };
  };
  try {
    const HDR = { 'Content-Type': 'application/json', 'X-GC-Request': '1' };
    for (const f of ['fun-office', 'tam-quoc']) {
      const r = await fetch(U20 + 'api/projects/import', { method: 'POST', headers: HDR, body: JSON.stringify({ bundle: JSON.parse(readFileSync(path.join(ROOT, 'studio/mau', f + '.json'), 'utf8')), overwrite: true }) });
      if (r.status !== 200) throw new Error('nhập bộ mẫu ' + f + ': HTTP ' + r.status);
    }
    // giọng AI GIẢ (đã lồng sẵn — mọi câu "dry" trúng đệm): clip WAV 1,2 s âm 2 kHz đầu dốc → đo được lúc tiếng bắt đầu; câu SKIP cố ý chưa lồng (Q39)
    const SKIP = 'The clock says 8:01', SKIP_TQ = 'Tam đệ chớ vội uống';   // i18n-ignore(lời thoại của bộ mẫu Tam Quốc — dữ liệu so khớp)
    const wav = (sec, hz) => { const rate = 24000, n = Math.round(rate * sec), b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
      for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * hz * i / rate) * Math.min(1, i / 48, (n - i) / 240)), 44 + i * 2); return b; };
    const CLIP = wav(1.2, 2000), voiceCalls = [];
    await ctx20.route(/\/api\/voice(\/|\?|$)/, async route => {
      const req = route.request(), pth = new URL(req.url()).pathname.replace(/^\/api\/voice/, '') || '/', m = req.method(), body = req.postData() ? JSON.parse(req.postData()) : {};
      const json = (status, o) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(o) });
      if (pth === '/' && m === 'GET') return json(200, { enabled: true, hasKey: true, cached: 12, designs: {}, blocked: [], bad: [], dailyCap: 0, roles: [], langs: [] });
      if (pth === '/cast') return json(200, { cast: Object.fromEntries((body.actors || []).map(a => [a.id, { voice: 'Fake-' + a.id, source: 'prebuilt', label: a.id }])) });
      if (pth === '/line') { voiceCalls.push(body); if (!body.dry) return json(409, { error: 'test: không đọc mới' }); if (String(body.text).includes(SKIP) || String(body.text).includes(SKIP_TQ)) return json(404, { error: 'Câu này chưa đọc bằng giọng AI' }); const id = 'c' + Buffer.from(body.text).toString('hex').slice(0, 30); return json(200, { id, cached: true, seconds: 1.2, url: 'api/voice/clip/' + id + '.wav' }); }
      if (/^\/clip\/c[0-9a-f]+\.wav$/.test(pth)) return route.fulfill({ status: 200, contentType: 'audio/wav', body: CLIP });
      return json(404, { error: 'mock' });
    });
    // mọi khung (cả iframe xuất): đếm âm "blip" (dao động PeriodicWave — chỉ giọng blip của engine/audio.js dùng) về cửa sổ trên cùng; long task của trang
    await ctx20.addInitScript(() => {
      const top = window.top; if (window === top) { window.__gcBlip = 0; window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.duration), e.startTime]))).observe({ type: 'longtask', buffered: true }); } catch (e) { /* không có */ } }
      const O = window.OscillatorNode && window.OscillatorNode.prototype, f = O && O.setPeriodicWave;
      if (f) O.setPeriodicWave = function () { try { top.__gcBlip++; } catch (e) { /* khác nguồn */ } return f.apply(this, arguments); };
    });
    const q = await ctx20.newPage(); q.on('pageerror', e => errs20.push(e.message));
    await q.goto(U20 + 'tao-tac?lang=en#/tac-pham/fo-first-day/publish');
    await q.waitForFunction(() => window.GCVideo && window.GCVideo.studio && /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 15000 });
    await q.waitForTimeout(800);
    const natives = () => q.evaluate(() => ({ st: String(window.setTimeout), pn: String(performance.now), raf: String(window.requestAnimationFrame), dn: String(Date.now), ac: String(window.AudioContext), ss: typeof window.speechSynthesis, vc: typeof window.GCVClock, mux: typeof window.GenMux, frames: document.querySelectorAll('iframe').length }));
    const nat0 = await natives();
    // tự kiểm nhịp tim đối chứng: Studio bận 250 ms một mạch → đối chứng (tiến trình khác) KHÔNG được khựng theo, phép trừ giữ nguyên ~250 ms
    { const g = await q.evaluate(async () => { const G = []; let last = performance.now(); const t = setInterval(() => { const n = performance.now(); G.push([n - last, performance.timeOrigin + n]); last = n; }, 10);
        await new Promise(r => setTimeout(r, 60)); const b = performance.now(); while (performance.now() - b < 250) { /* bận */ } await new Promise(r => setTimeout(r, 60)); clearInterval(t); return G; });
      const j = await hbJudge(g);
      if (!(j.raw >= 240) || !(j.mine >= 200)) throw new Error('nhịp tim đối chứng không độc lập với Studio: ' + JSON.stringify(j)); }

    if (!P3_ONLY) {
    // ---- 1) MỘT payload cho phim HTML và video (CNS-219): xuất phim HTML qua nút thật, so DATA / FILM / ngôn ngữ / bảng chữ với GCVideo.studio.payload(W)
    const dl0 = q.waitForEvent('download', { timeout: 30000 }); dl0.catch(() => null);
    await q.click('button:text-is("Film (HTML)")');
    let d0 = await Promise.race([dl0, q.waitForSelector('[aria-label="Export without all AI voices?"]', { timeout: 20000 }).then(() => 'box', () => new Promise(() => {}))]);
    if (d0 === 'box') { await q.click('[aria-label="Export without all AI voices?"] button:text-is("Export now")'); d0 = await dl0; }
    const fh = path.join(home20, 'phim.html'); await d0.saveAs(fh);
    const html = readFileSync(fh, 'utf8');
    const H = { data: JSON.parse(html.match(/var DATA = (\{.*?\});\nvar FILM/s)[1]), film: JSON.parse(html.match(/\nvar FILM = (\{.*?\});\n/s)[1]) };
    const im = html.match(/I\.add\(("[a-z]+"), (\{.*?\})\); I\.setLang/s); H.ui = JSON.parse(im[1]); H.dict = JSON.parse(im[2]);
    const P = await q.evaluate(async () => { const W = await (await fetch('api/works/fo-first-day')).json(); const p = await GCVideo.studio.payload(W); return { data: p.data, film: p.film, ui: p.ui, dict: p.dict, srcs: p.srcs }; });
    const same = k => JSON.stringify(H[k]) === JSON.stringify(P[k]);
    if (!['data', 'film', 'ui', 'dict'].every(same)) throw new Error('payload video ≠ phim HTML ở: ' + ['data', 'film', 'ui', 'dict'].filter(k => !same(k)).join(', '));
    if (P.data.voiceTotal < 8 || Object.keys(P.data.voices).length !== P.data.voiceTotal - 1 || P.ui !== 'en' || !Object.keys(P.dict).length) throw new Error('payload: mọi câu có clip AI trừ 1 câu cố ý thiếu, ui en, có bảng chữ trình phát; có ' + Object.keys(P.data.voices).length + '/' + P.data.voiceTotal + ' clip, ui ' + P.ui);
    if (/GCVClock|GenMux|gc-video|WebmWriter|video\/client\.js/.test(html)) throw new Error('phim HTML lẫn mã xuất video (CNS-228)');
    if (P.srcs.some(s => !/^(engine|kinds)\//.test(s))) throw new Error('srcs của payload lẫn tệp ngoài engine/ + kinds/: ' + P.srcs);
    console.log('  ✓ CNS-219: phim HTML (nút thật) và video nhận CÙNG payload (data · film · ngôn ngữ en · bảng chữ trình phát · ' + Object.keys(P.data.voices).length + '/' + P.data.voiceTotal + ' clip AI); phim HTML không mang mã xuất video');

    // ---- 2) xuất video 1 phân cảnh qua iframe thật
    // nhịp tim 10 ms của trang Studio: khoảng hở lớn nhất = lần luồng chính bị chặn lâu nhất (gồm việc KHÔNG phải JS: dựng ảnh SVG, raster, GC — Long Tasks API
    // không quy được việc chạy sau img.decode() của SVG lớn cho iframe: đã thử một vòng bận 150 ms ở đó, API không báo)
    await q.evaluate(() => { window.__lt.length = 0; window.__gcBlip = 0; window.__hbGaps = []; let last = performance.now(); window.__hbT = setInterval(() => { const n = performance.now(); window.__hbGaps.push([n - last, n]); last = n; }, 10); });
    const PROBES = [45, 150, 300, 480], shots = {};
    const probeWin = [];   // khoảng thời gian (đồng hồ trang) test chụp màn: đưa iframe ra màn hình bắt trình duyệt vẽ lại → long task của TEST, không tính
    await q.exposeFunction('__vprobe', async frame => {
      const w0 = await q.evaluate(() => { const f = document.querySelector('iframe[data-gc-video="render"]'); f.style.left = '0px'; f.style.zIndex = '99999'; return performance.now(); });
      probeWin.push([w0 - 20, null]);
      const png = await q.frameLocator('iframe[data-gc-video="render"]').locator('#stage').screenshot();
      probeWin[probeWin.length - 1][1] = await q.evaluate(() => { document.querySelector('iframe[data-gc-video="render"]').style.left = '-30000px'; return performance.now() + 250; });
      shots[frame] = png; return png.toString('base64');
    });
    const R1 = await q.evaluate(async ({ PROBES }) => {
      const W = await (await fetch('api/works/fo-first-day')).json(), prog = [];
      const cmp = async (blob, b64, sy) => {   // trung bình |Δ| RGB (thang 255) giữa khung đưa vào bộ mã hoá và ảnh chụp sân khấu sống
        const a = await createImageBitmap(blob), img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const w = img.naturalWidth, h = img.naturalHeight, c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(a, 0, -sy); const A = g.getImageData(0, 0, w, h).data; g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0); const B = g.getImageData(0, 0, w, h).data;
        let s = 0; for (let i = 0; i < A.length; i += 4) s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        return s / (A.length / 4 * 3);
      };
      const diffs = [];
      const r = await GCVideo.exportWork(W, { quality: '720p', shots: [0], debug: true, probe: PROBES, onProbe: async m => { const live = await window.__vprobe(m.frame); diffs.push([m.frame, await cmp(m.png, live, m.sy)]); } }, x => prog.push(x));
      // tiếng của TỆP ra (giải mã lại trong trình duyệt): đường bao năng lượng 2 kHz (Goertzel, cửa sổ 5 ms) + mức to chung
      const vf = r.files.find(f => f.kind === 'video');
      const buf = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(await vf.blob.arrayBuffer()), x = buf.getChannelData(0), N = 240, k = 2 * Math.cos(2 * Math.PI * 2000 / 48000), env = [];
      for (let s = 0; s + N <= x.length; s += N) { let p1 = 0, p2 = 0; for (let i = 0; i < N; i++) { const p0 = x[s + i] + k * p1 - p2; p2 = p1; p1 = p0; } env.push(Math.sqrt(Math.max(0, p1 * p1 + p2 * p2 - k * p1 * p2)) / N); }
      const files = {};
      for (const f of r.files) files[f.kind] = { name: f.name, type: f.type, size: f.blob.size, text: /srt|txt/.test(f.kind) ? await f.blob.text() : null, head: Array.from(new Uint8Array(await f.blob.slice(0, 4).arrayBuffer())) };
      window.__vblob = vf.blob;
      delete r.files;
      return { r, diffs, env, audioMs: buf.duration * 1000, files, prog: prog.length, phases: [...new Set(prog.map(p => p.phase))], lastProg: prog[prog.length - 1] };
    }, { PROBES });
    const r = R1.r, ltAll = await q.evaluate(() => window.__lt.slice()), blips = await q.evaluate(() => window.__gcBlip), hb = await q.evaluate(() => { clearInterval(window.__hbT); return window.__hbGaps.slice(); });
    const inProbe = e => probeWin.some(w => e[1] + e[0] >= w[0] && e[1] <= w[1]), lt = ltAll.filter(e => !inProbe(e)).map(e => e[0]), ltProbe = ltAll.filter(inProbe).map(e => e[0]);
    const hbIn = g => probeWin.some(w => g[1] >= w[0] && g[1] - g[0] <= w[1]), hbProbe = hb.filter(hbIn).map(g => g[0]), qTO = await q.evaluate(() => performance.timeOrigin);
    const hbJ = await hbJudge(hb.filter(g => !hbIn(g)).map(g => [g[0], qTO + g[1]])), hbMax = hbJ.mine;
    const vbytes = Buffer.from(await q.evaluate(async () => { const u = new Uint8Array(await window.__vblob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }), 'base64');
    const vfile = path.join(home20, R1.files.video.name); fs.writeFileSync(vfile, vbytes);
    // cấu trúc tệp + A/V
    if (r.frames !== r.dry.frames) throw new Error('lượt dựng ' + r.frames + ' khung ≠ lượt dò ' + r.dry.frames + ' — timeline không tất định');
    let aEnd, nV;
    if (r.format.container === 'webm') { const w = inspectWebm(vbytes), ab = w.blocks.filter(b => b.track === 2); nV = w.blocks.filter(b => b.track === 1).length; aEnd = ab[ab.length - 1].ms + 20; if (w.tracks[1].codec !== 'A_OPUS' || w.cues.length < 1) throw new Error('WebM: ' + JSON.stringify(w.tracks.map(t => t.codec))); }
    else { const m = inspectMp4(vbytes), A = m.tracks.find(t => t.handler === 'soun'), V = m.tracks.find(t => t.handler === 'vide'); nV = V.samples.length; aEnd = A.duration / A.timescale * 1000; if (m.top.join() !== 'ftyp,moov,mdat' || m.edts) throw new Error('MP4: ' + m.top); }
    if (nV !== r.frames) throw new Error('tệp có ' + nV + ' khung, cần ' + r.frames);
    if (Math.abs(aEnd - r.durationMs) > FR || Math.abs(R1.audioMs - r.durationMs) > FR) throw new Error('tiếng ' + aEnd + ' ms (giải mã lại: ' + R1.audioMs.toFixed(1) + ') ≠ hình ' + r.durationMs.toFixed(1) + ' ms quá 1 khung');
    if (HAS_FF) { const d = spawnSync('ffmpeg', ['-v', 'error', '-i', vfile, '-f', 'null', '-'], { encoding: 'utf8' }); if (d.status || d.stderr.trim()) throw new Error('ffmpeg giải mã không sạch: ' + d.stderr.slice(0, 300)); }
    // độ giống bộ phát sống (spec §3: ≥ 4 thời điểm, trung bình ≤ 2/255): khung đưa vào bộ mã hoá; + khung giải mã lại từ tệp (có mất mát của codec) khi có ffmpeg
    if (R1.diffs.length !== 4 || R1.diffs.some(d => !(d[1] <= 2))) throw new Error('khác bộ phát sống: ' + JSON.stringify(R1.diffs));
    const codecDiff = [];
    if (HAS_FF) for (const f of PROBES) {
      const x = spawnSync('ffmpeg', ['-v', 'error', '-i', vfile, '-vf', 'select=eq(n\\,' + f + ')', '-frames:v', '1', '-f', 'image2', '-c:v', 'png', '-'], { maxBuffer: 64 << 20 });
      codecDiff.push(await q.evaluate(async ([a, b]) => {
        const ld = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
        const A = await ld(a), B = await ld(b), w = B.naturalWidth, h = B.naturalHeight, c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(A, 0, 0); const p = g.getImageData(0, 0, w, h).data; g.drawImage(B, 0, 0); const o = g.getImageData(0, 0, w, h).data; let s = 0; for (let i = 0; i < p.length; i += 4) s += Math.abs(p[i] - o[i]) + Math.abs(p[i + 1] - o[i + 1]) + Math.abs(p[i + 2] - o[i + 2]); return +(s / (p.length / 4 * 3)).toFixed(2);
      }, [x.stdout.toString('base64'), shots[f].toString('base64')]));
    }
    if (codecDiff.some(d => !(d <= 4))) throw new Error('khung giải mã lại từ tệp khác bộ phát sống quá 4/255: ' + codecDiff);
    // giọng AI THẬT trong tệp + câu đầu đúng giờ: âm 2 kHz của clip bắt đầu ở (lúc say + 40 ms lập lịch của engine) ±1 khung; bong bóng hiện ≤ 1 khung quanh lúc say
    const says = r.says, env = R1.env, peak = Math.max(...env), on = from => { for (let i = Math.max(0, Math.floor(from / 5)); i + 8 < env.length; i++) if (env.slice(i, i + 8).every(v => v > peak * 0.25)) return i * 5; return -1; };
    if (says.length !== 4 || says.filter(s => s.clip).length !== 3 || says.find(s => s.text.includes(SKIP)).clip) throw new Error('say: 4 câu, 3 có clip AI, câu "' + SKIP + '" không: ' + JSON.stringify(says));
    const a0 = on(says[0].t - 200), bub0 = r.firstDialogFrame * FR;
    if (a0 < 0 || Math.abs(a0 - (says[0].t + 40)) > FR) throw new Error('câu đầu: tiếng bắt đầu ' + a0 + ' ms, cần ' + (says[0].t + 40).toFixed(1) + ' ± ' + FR.toFixed(1));
    if (Math.abs(bub0 - says[0].t) > FR) throw new Error('câu đầu: bong bóng hiện ở ' + bub0.toFixed(1) + ' ms, say lúc ' + says[0].t.toFixed(1));
    // Q39: câu thiếu clip im lặng (không âm 2 kHz trong suốt câu, không một "blip"), bong bóng + phụ đề vẫn có
    const sk = says.findIndex(s => s.text.includes(SKIP)), win = env.slice(Math.floor(says[sk].t / 5), Math.floor(says[sk + 1].t / 5));
    if (Math.max(...win) > peak * 0.05) throw new Error('Q39: câu chưa có giọng AI phải im lặng, có năng lượng 2 kHz ' + (Math.max(...win) / peak).toFixed(3) + ' × đỉnh');
    if (blips !== 0) throw new Error('Q39: câu thiếu clip rơi về blip (' + blips + ' dao động PeriodicWave)');
    if (!R1.files.srt.text.includes(SKIP) || !r.cues.some(c => c.text.includes(SKIP))) throw new Error('Q39: câu thiếu clip vẫn phải có bong bóng / phụ đề');
    // tệp phụ: .srt theo khung thật, bìa .jpg (khung có thoại đầu — Q43), .txt tiêu đề + mô tả + ghi công (Q47); tên tệp từ tiêu đề
    const srt = R1.files.srt.text, txt = R1.files.txt.text, cues = srt.trim().split(/\r?\n\r?\n/);
    if (cues.length !== 4 || !/^1\r\n00:00:0\d,\d{3} --> 00:00:\d\d,\d{3}\r\nGood morning, boss!/.test(srt)) throw new Error('.srt: ' + JSON.stringify(srt.slice(0, 200)));
    const c1 = srt.match(/^1\r\n(\d\d):(\d\d):(\d\d),(\d{3})/), c1ms = ((+c1[1] * 60 + +c1[2]) * 60 + +c1[3]) * 1000 + +c1[4];
    if (Math.abs(c1ms - bub0) > 1) throw new Error('.srt câu 1 bắt đầu ' + c1ms + ' ms ≠ khung bong bóng hiện ' + bub0.toFixed(1));
    if (R1.files.cover.head[0] !== 0xFF || R1.files.cover.head[1] !== 0xD8 || r.coverFrame < r.firstDialogFrame) throw new Error('bìa .jpg: ' + JSON.stringify(R1.files.cover) + ' ở khung ' + r.coverFrame);
    if (!/^First Day at Work\n\n.+\n\nMade with gen-chibi · Gen Labs\n$/s.test(txt)) throw new Error('.txt: ' + JSON.stringify(txt));
    if (Object.values(R1.files).some(f => !f.name.startsWith('first-day-at-work.'))) throw new Error('tên tệp: ' + Object.values(R1.files).map(f => f.name));
    // phim tiếng Anh: không chữ Việt trong khung hình (chữ của sân khấu ở mọi khung), .srt, .txt (CNS-224 — spike từng lộ "PHÂN CẢNH 2/4")
    const vi = r.texts.concat([srt, txt]).filter(t => VI.test(t));
    if (vi.length) throw new Error('phim tiếng Anh lộ chữ Việt: ' + vi.slice(0, 3).join(' | '));
    // mượt (L-42, CNS-221): long task của trang Studio (gồm iframe cùng nguồn) trong suốt lượt xuất
    if (!(hb.length > 100) || hbMax > 100) throw new Error('luồng chính của Studio bị chặn ' + hbMax.toFixed(0) + ' ms sau khi trừ khựng cả máy (nhịp tim 10 ms → ngân sách 100 ms, spec §3) — top thô−đối chứng: ' + hbJ.top);
    if (R1.phases.join() !== 'prepare,measured,render' || R1.lastProg.shots !== 1) throw new Error('tiến độ: ' + JSON.stringify([R1.phases, R1.lastProg]));
    const pf = r.stats.perFrameMs;
    // thời gian (CNS-238): spec ≤ 3× (4 phân cảnh 1080p); tài liệu hứa ~2–3,5× — CHỈ BÁO (máy test chậm / bận thì lệch)
    if (r.wallMs / r.durationMs > 3.5) console.log('  ! thời gian xuất Fun Office 720p ' + (r.wallMs / r.durationMs).toFixed(2) + '× thời lượng > 3,5× (chỉ báo)');
    console.log('  ✓ xuất video qua iframe ẩn (Studio thật, server thật): ' + r.format.container + ' ' + r.format.video + ' + ' + r.format.audio + ' ' + r.format.width + '×' + r.format.height + ' · ' + r.frames + ' khung = lượt dò · '
      + (r.durationMs / 1000).toFixed(2) + ' s phim / ' + (r.wallMs / 1000).toFixed(1) + ' s xuất (' + (r.wallMs / r.durationMs).toFixed(2) + '×, lượt dò ' + (r.dry.stats.perFrameMs).toFixed(1) + ' ms/khung) · mỗi khung ' + pf.total.toFixed(1) + ' ms (advance ' + pf.advance.toFixed(1) + ' · chụp ' + pf.snap.toFixed(1) + ' · raster ' + pf.raster.toFixed(1) + ' · mã hoá ' + pf.encode.toFixed(1) + ')');
    console.log('  ✓ giống bộ phát sống ở 4 khung: ' + R1.diffs.map(d => d[1].toFixed(2)).join(' / ') + ' /255 (≤ 2)' + (HAS_FF ? ' · sau codec (giải mã lại bằng ffmpeg): ' + codecDiff.join(' / ') + ' /255 (≤ 4)' : ' · (không có ffmpeg: bỏ qua so khung giải mã lại)') + (HAS_FF ? ' · ffmpeg giải mã sạch' : ''));
    console.log('  ✓ A/V: tiếng ' + aEnd.toFixed(0) + ' ms ≈ hình ' + r.durationMs.toFixed(0) + ' ms (±1 khung) · câu đầu: bong bóng ' + (bub0 - says[0].t).toFixed(1) + ' ms, giọng AI ' + (a0 - says[0].t).toFixed(0) + ' ms sau lúc say (engine lập lịch +40 ms; ±1 khung) · clip AI thật trong tệp 3/4 câu');
    console.log('  ✓ Q39: câu chưa có giọng AI im lặng (2 kHz ≤ 5% đỉnh, 0 blip) nhưng bong bóng + phụ đề vẫn có · .srt 4 câu theo khung thật (câu 1 = khung bong bóng hiện) · bìa .jpg ở khung ' + r.coverFrame + ' (thoại đầu: ' + r.firstDialogFrame + ') · .txt có ghi công · không chữ Việt (khung / .srt / .txt) · luồng chính bị chặn tối đa ' + hbMax.toFixed(0) + ' ms (thô ' + Math.round(hbJ.raw) + ' · top ' + hbJ.top + '; nhịp tim 10 ms, gồm lượt dò + 2 lần nạp iframe; ≤ 100' + (hbProbe.length ? '; không tính lúc test chụp màn: ' + Math.round(Math.max(...hbProbe)) + ' ms' : '') + ') · Long Tasks API: tối đa ' + (lt.length ? Math.max(...lt) : 0) + ' ms');

    // ---- 2b) độ giống ở 1080p (CNS-239 — mặc định của Studio, 4 dải raster + dải mịn lúc khởi động): một khung Fun Office 1080p so bộ phát sống ≤ 2/255, rồi Huỷ
    await q.setViewportSize({ width: 1960, height: 1120 });   // iframe xuất 1920 × 1080 phải nằm trọn trong khung nhìn lúc test chụp sân khấu sống
    const D1080 = await q.evaluate(async () => {
      const W = await (await fetch('api/works/fo-first-day')).json(); let d = null, sz = null;
      const cmp = async (blob, b64, sy) => { const a = await createImageBitmap(blob), img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const w = img.naturalWidth, h = img.naturalHeight, c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(a, 0, -sy); const A = g.getImageData(0, 0, w, h).data; g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0); const B = g.getImageData(0, 0, w, h).data;
        let s = 0; for (let i = 0; i < A.length; i += 4) s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); return { diff: s / (A.length / 4 * 3), w, h, fw: a.width, fh: a.height }; };
      const p = GCVideo.exportWork(W, { quality: '1080p', shots: [0], probe: [150], onProbe: async m => { const live = await window.__vprobe(m.frame); const r = await cmp(m.png, live, m.sy); d = r.diff; sz = [r.w, r.h, r.fw, r.fh]; setTimeout(() => p.cancel(), 0); } });
      try { await p; } catch (e) { if (e.code !== 'cancelled') throw e; }
      return { d, sz };
    });
    await q.setViewportSize({ width: 1400, height: 900 });
    if (!(D1080.d <= 2) || D1080.sz.join() !== '1920,1080,1920,1080') throw new Error('1080p khác bộ phát sống: ' + JSON.stringify(D1080));
    console.log('  ✓ 1080p (4 dải raster): khung 150 của Fun Office giống bộ phát sống ' + D1080.d.toFixed(2) + ' /255 (≤ 2) · 1920×1080');

    // ---- 2c) KHUNG DỌC 9:16 thật (v0.23.2, Q37 b): sân khấu dọc 720×1280 (không dải đen / không phim ngang đặt giữa), máy quay bám người nói,
    //      mọi bong bóng / phụ đề nằm trọn trong khung, người nói luôn trong khung — ở MỌI khung có lời thoại; hai lượt cùng đầu vào → khung y hệt (tất định)
    const V916 = await q.evaluate(async () => {
      const W = await (await fetch('api/works/fo-first-day')).json(), out = [];
      for (let k = 0; k < 2; k++) {
        const pngs = {};
        const r = await GCVideo.exportWork(W, { quality: '720p', aspect: '9:16', shots: [0], debug: true, probe: [120, 300], onProbe: async m => { const b = await createImageBitmap(m.png), c = new OffscreenCanvas(b.width, b.height), g = c.getContext('2d'); g.drawImage(b, 0, 0);
          const d = g.getImageData(0, 0, b.width, b.height).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (Math.imul(h, 31) + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0;
          const top = g.getImageData(0, 0, b.width, 24).data; let dark = 0; for (let i = 0; i < top.length; i += 4) if (top[i] < 40 && top[i + 1] < 40 && top[i + 2] < 40) dark++;
          pngs[m.frame] = { w: b.width, h: b.height, hash: h, dark: dark / (top.length / 4), sy: m.sy }; } });
        out.push({ fmt: r.format, frames: r.frames, dry: r.dry.frames, vf: r.vfacts, pngs });
      }
      return out;
    });
    // mặt bị cắt ở các bộ mẫu: Fun Office các phân cảnh còn lại + Tam Quốc phân cảnh 1 (720p) — ở browser context RIÊNG (tiến trình renderer khác, đóng ngay sau):
    // rác / heap của 3 lượt xuất thêm không dồn vào trang Studio mà các mục sau đo nhịp tim (ngân sách 100 ms)
    { const cV = await b20.newContext({ viewport: { width: 1400, height: 900 } }), pV = await cV.newPage(); pV.on('pageerror', e => errs20.push(e.message));
      try {
        await pV.goto(U20 + 'tao-tac?lang=en#/tac-pham/fo-first-day/publish');
        await pV.waitForFunction(() => window.GCVideo && window.GCVideo.studio && /^v\d/.test((document.getElementById('verChip') || {}).textContent), null, { timeout: 15000 });
        V916.push(...await pV.evaluate(async () => { const out = [];
          for (const [wid, shots] of [['fo-first-day', [1, 2, 3]], ['tq-vuon-dao-xich-bich', [0]]]) {
            const W2 = await (await fetch('api/works/' + wid)).json(), r = await GCVideo.exportWork(W2, { quality: '720p', aspect: '9:16', shots, debug: true });
            out.push({ wid, frames: r.frames, dry: r.dry.frames, vf: r.vfacts });
          }
          return out; }));
      } finally { await cV.close(); } }
    { const [a, b] = V916, pa = Object.values(a.pngs), all = [a].concat(V916.slice(2));
      const T = all.reduce((t, x) => ({ fr: t.fr + x.vf.frames, spk: t.spk + x.vf.spk, spkCut: t.spkCut + x.vf.spkCut, faces: t.faces + x.vf.faces, faceCut: t.faceCut + x.vf.faceCut, allFaces: t.allFaces + x.vf.allFaces, allCut: t.allCut + x.vf.allCut, out: t.out + x.vf.out, lost: t.lost + x.vf.lost }), { fr: 0, spk: 0, spkCut: 0, faces: 0, faceCut: 0, allFaces: 0, allCut: 0, out: 0, lost: 0 });
      if (V916.slice(2).some(x => x.frames !== x.dry) || T.spkCut || T.out || T.lost || !(T.spk > 300)) throw new Error('9:16 bộ mẫu: mặt người nói bị cắt / bong bóng ra ngoài / lượt dựng ≠ lượt dò: ' + JSON.stringify(V916.slice(2).map(x => [x.wid, x.frames, x.dry, x.vf]).concat([T])));
      if (a.fmt.width !== 720 || a.fmt.height !== 1280 || pa.length !== 2 || pa.some(x => x.w !== 720 || x.h !== 1280 || x.sy !== 0 || x.dark > 0.2)) throw new Error('9:16: khung phải là sân khấu dọc 720×1280, không dải đen: ' + JSON.stringify(a.pngs));
      if (!(a.vf.frames > 200) || a.vf.out || a.vf.lost) throw new Error('9:16: bong bóng / phụ đề ra ngoài khung hoặc mất người nói: ' + JSON.stringify(a.vf));
      if (a.frames !== a.dry || b.frames !== a.frames || JSON.stringify(a.pngs) !== JSON.stringify(b.pngs)) throw new Error('9:16 không tất định: ' + JSON.stringify([a.frames, a.dry, b.frames, a.pngs, b.pngs]));
      console.log('  ✓ 9:16 thật (Q37 b): sân khấu dọc 720×1280, không dải đen · hai lượt cùng đầu vào → ' + a.frames + ' khung, khung 120 / 300 giống hệt từng pixel · bộ mẫu (Fun Office 4 phân cảnh + Tam Quốc phân cảnh 1): ' + T.fr + ' khung có lời thoại — bong bóng / phụ đề trọn trong khung, mặt người nói trọn trong khung ' + T.spk + '/' + T.spk + ' · mặt người khác bị mép khung cắt ' + (T.faces ? (T.faceCut / T.faces * 100).toFixed(1) : '0') + '% (' + T.faceCut + '/' + T.faces + ' lần xuất hiện) · mọi khung (cả lúc lia máy / đi lại / đấu): ' + (T.allFaces ? (T.allCut / T.allFaces * 100).toFixed(1) : '0') + '% (' + T.allCut + '/' + T.allFaces + ')'); }

    // ---- 3) không rò bản vá sang Studio; Studio vẫn phát phim thời gian thực đúng
    const nat1 = await natives();
    if (JSON.stringify(nat0) !== JSON.stringify(nat1) || !/\[native code\]/.test(nat1.st + nat1.pn + nat1.raf + nat1.dn) || nat1.vc !== 'undefined' || nat1.mux !== 'undefined' || nat1.frames !== 0 || nat1.ss !== 'object')
      throw new Error('Studio sau khi xuất khác trước: ' + JSON.stringify([nat0, nat1]));
    const live = await q.evaluate(async () => {
      const GC = window.GenChibi, W = await (await fetch('api/works/fo-first-day')).json(), box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px;z-index:9999'; document.body.appendChild(box);
      GC.audio.setMuted(true);
      const t0 = performance.now(), d0 = Date.now(), pl = GC.film.player(box, { dialog: 'auto', lang: 'en', accent: 'us' }); pl.play([W.shots[0]], W.title);
      for (let i = 0; i < 200 && !box.querySelector('.gcp-bub.on, .gcp-cap.on'); i++) await new Promise(r => setTimeout(r, 50));
      const out = { bubbleMs: performance.now() - t0, wallMs: Date.now() - d0, on: !!box.querySelector('.gcp-bub.on, .gcp-cap.on') }; pl.destroy(); box.remove(); GC.audio.setMuted(false); return out;
    });
    if (!live.on || Math.abs(live.bubbleMs - live.wallMs) > 100 || live.bubbleMs < says[0].t - 400 || live.bubbleMs > says[0].t + 1500) throw new Error('Studio phát thời gian thực sau khi xuất: ' + JSON.stringify(live) + ' (video: câu đầu lúc ' + says[0].t.toFixed(0) + ' ms)');
    console.log('  ✓ cách ly: setTimeout / performance.now / Date.now / rAF / AudioContext của Studio vẫn là bản gốc, không GCVClock / GenMux, iframe đã gỡ · Studio phát lại phân cảnh: câu đầu hiện sau ' + live.bubbleMs.toFixed(0) + ' ms THẬT (video: ' + says[0].t.toFixed(0) + ' ms)');

    // ---- 4) Huỷ giữa chừng: bộ mã hoá đóng, iframe gỡ, tệp chọn sẵn (OPFS) không có byte nào
    const C = await q.evaluate(async () => {
      const W = await (await fetch('api/works/fo-first-day')).json(), dir = await navigator.storage.getDirectory(), fh = await dir.getFileHandle('huy.webm', { create: true });
      let p, at = -1; const t0 = performance.now();
      const res = await new Promise(ok => { p = GCVideo.exportWork(W, { quality: '720p', shots: [0], handle: fh }, x => { if (x.phase === 'render' && x.frame >= 40 && at < 0) { at = x.frame; p.cancel(); } }); p.then(v => ok({ done: true, v: !!v }), e => ok({ code: e.code, encoders: e.encoders })); });
      return Object.assign(res, { at, ms: performance.now() - t0, frames: document.querySelectorAll('iframe[data-gc-video]').length, size: (await fh.getFile()).size });
    });
    if (C.code !== 'cancelled' || C.at < 0 || C.frames !== 0 || C.size !== 0 || !C.encoders || C.encoders.venc !== 'closed' || C.encoders.aenc !== 'closed') throw new Error('Huỷ: ' + JSON.stringify(C));
    console.log('  ✓ Huỷ ở khung ' + C.at + ': lỗi "cancelled", VideoEncoder + AudioEncoder "closed", iframe gỡ, tệp đã chọn (OPFS) 0 byte');

    // ---- 5) Tam Quốc 1 phân cảnh 1080p ghi LUỒNG ra tệp (FileSystemFileHandle, như khi owner chọn thư mục lúc bấm — CNS-226): heap ≤ 1,5 × tệp + 200 MB
    const TQ = await q.evaluate(async () => {
      const W = await (await fetch('api/works/tq-vuon-dao-xich-bich')).json(), dir = await navigator.storage.getDirectory(), fh = await dir.getFileHandle('tq.webm', { create: true });
      // giọng AI đã hỏi TRƯỚC (như Studio: lúc bấm Xuất video — hộp askExport), rồi mới đo trong lúc xuất
      const vo = await GCVideo.studio.voices(W);
      const gaps = []; let last = performance.now(); const hbT = setInterval(() => { const n = performance.now(); gaps.push([n - last, performance.timeOrigin + n]); last = n; }, 10);
      const h0 = performance.memory.usedJSHeapSize, r = await GCVideo.exportWork(W, { quality: '1080p', shots: [0], handle: fh, missingVoice: 'blip', voices: vo });
      clearInterval(hbT);
      const f = await fh.getFile(), head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
      return { h0, heapPeak: r.stats.heapPeak, frames: r.frames, dryFrames: r.dry.frames, durationMs: r.durationMs, wallMs: r.wallMs, size: f.size, bytes: r.files.find(x => x.kind === 'video').bytes, blob: !!r.files.find(x => x.kind === 'video').blob, head: Array.from(head), pf: r.stats.perFrameMs, maxFrameMs: r.stats.maxFrameMs, layers: r.stats.layers, gaps };
    });
    const tqBuf = Buffer.from(await q.evaluate(async () => { const f = await (await (await navigator.storage.getDirectory()).getFileHandle('tq.webm')).getFile(), u = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }), 'base64');
    const tqw = inspectWebm(tqBuf);
    // giọng clip AI + MỘT câu blip (missingVoice: 'blip'): lượt dò và lượt dựng phải ra CÙNG số khung — dãy Math.random (đã gieo) không được lệch vì tần số mẫu
    if (TQ.frames !== TQ.dryFrames) throw new Error('Tam Quốc: lượt dựng ' + TQ.frames + ' khung ≠ lượt dò ' + TQ.dryFrames + ' (timeline không tất định)');
    if (TQ.size !== TQ.bytes || TQ.blob || tqw.blocks.filter(b => b.track === 1).length !== TQ.frames || tqw.segmentEnd !== tqBuf.length || Math.abs(tqw.durationMs - TQ.durationMs) > FR) throw new Error('Tam Quốc ghi ra tệp: ' + JSON.stringify([TQ.size, TQ.bytes, TQ.blob, tqw.durationMs, TQ.durationMs]));
    // mượt (spec §3, CNS-221): Tam Quốc 1080p — phim nặng nhất của bộ mẫu — nhịp tim 10 ms của Studio hở ≤ 100 ms suốt lượt xuất
    // Rào thụt lùi tất định cho các bước giảm tải nằm ở tools/test-video.mjs (không cloneNode sâu, đầu data: URL đóng sẵn, dải raster, nhả 2 bước, chụp theo lớp)
    if (TQ.wallMs / TQ.durationMs > 3.5) console.log('  ! thời gian xuất Tam Quốc 1080p ' + (TQ.wallMs / TQ.durationMs).toFixed(2) + '× thời lượng > 3,5× (chỉ báo — tài liệu hứa ~2–3,5×)');
    const tqJ = await hbJudge(TQ.gaps);
    // v0.23.2 B5 (CNS-248): CHỤP THEO LỚP — phông sau đệm theo khung máy quay, mảnh sân khấu không nhúng phông chữ (dùng lại mảnh không đổi), lời thoại raster lại
    // chỉ khi đổi → rào CỨNG 100 ms (spec §3). Trước B5 (một tài liệu SVG ~640 phần tử + phông 60 KB mỗi khung): 74–118 ms (2 CPU, user nobody) — rào cũ 250 ms
    if (!(tqJ.n > 100) || tqJ.mine > 100) throw new Error('Tam Quốc 1080p: luồng chính của Studio bị chặn ' + Math.round(tqJ.mine) + ' ms sau khi trừ khựng cả máy (ngân sách 100 ms, spec §3 — B5) — top thô−đối chứng: ' + tqJ.top + ' · ' + tqJ.n + ' mẫu');
    const L5 = TQ.layers || {};
    if (!(L5.bgHit > TQ.frames / 2) || !(L5.sliceHit > 0) || !(L5.topHit > L5.topDraw) || !(L5.bgDraw > 0)) throw new Error('chụp theo lớp (B5) phải dùng lại phông đệm / mảnh / lớp lời thoại: ' + JSON.stringify(L5));
    const budget = 1.5 * TQ.size + 200 * 1048576;
    if (!(TQ.heapPeak > 0) || TQ.heapPeak > budget) throw new Error('heap ' + (TQ.heapPeak / 1048576).toFixed(1) + ' MB > ngân sách ' + (budget / 1048576).toFixed(1) + ' MB');
    console.log('  ✓ Tam Quốc phân cảnh 1, 1080p, clip AI + 1 câu blip, ghi luồng ra tệp (OPFS, phần đầu viết lại khi xong): ' + TQ.frames + ' khung = lượt dò · ' + (TQ.durationMs / 1000).toFixed(1) + ' s phim / ' + (TQ.wallMs / 1000).toFixed(1) + ' s xuất (' + (TQ.wallMs / TQ.durationMs).toFixed(2) + '×) · ' + (TQ.size / 1048576).toFixed(1) + ' MB · heap đỉnh ' + (TQ.heapPeak / 1048576).toFixed(1) + ' MB (Studio trước khi xuất ' + (TQ.h0 / 1048576).toFixed(1) + ' MB; ngân sách ' + (budget / 1048576).toFixed(0) + ' MB) · mỗi khung ' + TQ.pf.total.toFixed(1) + ' ms (raster ' + TQ.pf.raster.toFixed(1) + ') · luồng chính bị chặn tối đa ' + Math.round(tqJ.mine) + ' ms (≤ 100; thô ' + Math.round(tqJ.raw) + ' · top thô−đối chứng ' + tqJ.top + ') · chụp theo lớp: phông đệm dùng lại ' + L5.bgHit + '/' + (L5.bgHit + L5.bgDraw) + ' khung, mảnh sân khấu dùng lại ' + L5.sliceHit + ', lớp lời thoại dùng lại ' + L5.topHit + '/' + (L5.topHit + L5.topDraw));

    // ---- 6) tab NỀN thật sự bị ẩn (CDP thuần, --headless=new): xuất vẫn xong, không chậm vì timer bị bóp (CNS-221)
    await ensureSession(ctx20, O20);
    const ck = ctx20.__gcSess.get(O20).split('; ').map(kv => ({ name: kv.slice(0, kv.indexOf('=')), value: kv.slice(kv.indexOf('=') + 1), url: O20 }));
    const cd = await cdpLaunch();
    try {
      await cd.send('Storage.setCookies', { cookies: ck });
      const pg = await cd.open(U20 + 'tao-tac?lang=en');
      // chờ Studio nạp xong thư viện (diễn viên / bối cảnh của tác phẩm) — payload gom asset từ trạng thái Studio
      for (let i = 0; i < 150 && !(await pg.eval(`(async () => !!(window.GCVideo && GCVideo.studio && window.GenChibi && GenChibi.film && GenChibi.film.readiness(await (await fetch('api/works/fo-first-day')).json()).filter(x => x.ok).length === 4))()`)); i++) await new Promise(r => setTimeout(r, 100));
      await pg.eval(`(window.__hid = { vis: [document.visibilityState] }, document.addEventListener('visibilitychange', () => __hid.vis.push(document.visibilityState)),
        fetch('api/works/fo-first-day').then(r => r.json()).then(W => GCVideo.exportWork(W, { quality: '720p', shots: [0], dryEstimate: 5, missingVoice: 'blip' }, p => { __hid.p = p; __hid.vis.push(document.visibilityState); }))
        .then(r => { __hid.done = { frames: r.frames, dry: r.dry.frames, wallMs: r.wallMs, size: r.files[0].blob.size, durationMs: r.durationMs }; }, e => { __hid.err = e.code + ' ' + e.message; }), true)`, { awaitPromise: false });
      const other = await cd.open('about:blank'); await other.activate();
      const t1 = Date.now(); let hid;
      for (;;) { hid = await pg.eval('JSON.stringify(window.__hid)').then(JSON.parse); if (hid.done || hid.err || Date.now() - t1 > 150000) break; await new Promise(r => setTimeout(r, 1000)); }
      const throttled = await pg.eval('(async () => { const t = performance.now(); for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 1)); return performance.now() - t; })()');
      if (!hid.done || !hid.vis.includes('hidden') || hid.done.frames !== hid.done.dry || hid.done.wallMs > 3 * r.wallMs + 20000) throw new Error('tab nền: ' + JSON.stringify(hid).slice(0, 400));
      console.log('  ✓ tab nền THẬT SỰ bị ẩn (CDP, visibilityState hidden; setTimeout ở tab đó bị bóp: 5 lần 1 ms = ' + throttled.toFixed(0) + ' ms): xuất vẫn xong ' + hid.done.frames + ' khung = lượt dò (giọng blip — dãy ngẫu nhiên hai lượt phải y hệt; ước 5 s quá ngắn → dò lại theo trần) trong ' + (hid.done.wallMs / 1000).toFixed(1) + ' s (tab hiện: ' + (r.wallMs / 1000).toFixed(1) + ' s)');
    } finally { await cd.close(); }
    }   // !P3_ONLY
    // ---- 7) P3: bảng Xuất video trong Studio (phòng tác phẩm › Xuất bản) — đi bằng nút thật, như owner
    const SHOTS20 = process.env.GC_SHOTS || '';
    const shot20 = async (pg, name) => { if (SHOTS20) { fs.mkdirSync(SHOTS20, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS20, name + '.png') }); } };
    // tác phẩm 1 phân cảnh (Fun Office phân cảnh 1) cho các lượt xuất bằng nút — phim ~19 s
    const foW = await (await fetch(U20 + 'api/works/fo-first-day')).json();
    let rq = await fetch(U20 + 'api/works', { method: 'POST', headers: HDR, body: JSON.stringify({ id: 'fo-one', title: foW.title, logline: foW.logline, lang: foW.lang, accent: foW.accent, project: foW.project }) });
    if (rq.status !== 200) throw new Error('tạo tác phẩm fo-one: HTTP ' + rq.status);
    rq = await fetch(U20 + 'api/works/fo-one/shots', { method: 'POST', headers: HDR, body: JSON.stringify({ shot: foW.shots[0] }) });
    if (rq.status !== 200) throw new Error('thêm phân cảnh fo-one: HTTP ' + rq.status);
    // mở phòng tác phẩm ở tab Xuất bản và CHỜ đúng tác phẩm đã vẽ (đổi hash không tải lại trang: nút của phòng cũ còn trên màn tới khi phòng mới dựng xong)
    const openWork = async (pg, id, lang) => {
      await pg.goto(U20 + 'tao-tac?lang=' + lang + '#/tac-pham/' + id + '/publish');
      await pg.waitForFunction(id => { const h = document.querySelector('.roomhead .mono.note'), b = document.getElementById('videoExportB'); return h && h.textContent === id && b && !b.disabled && b.isConnected; }, id, { timeout: 20000 });
    };
    // bấm Xuất video → (fo-one còn 1 câu chưa có giọng AI: hộp askExport → Export now / Xuất luôn) → bảng chọn, chờ Bắt đầu mở
    const openPanel = async pg => {
      await pg.click('#videoExportB');
      const w = await Promise.race([pg.waitForSelector('[data-kind="video"][role="group"]', { timeout: 20000 }).then(() => 'ask'), pg.waitForSelector('.vidpanel', { timeout: 20000 }).then(() => 'panel')]);
      if (w === 'ask') await pg.click('[data-kind="video"][role="group"] button:nth-of-type(2)');
      await pg.waitForSelector('.vidpanel [data-v="start"]:not([disabled])', { timeout: 20000 });
    };
    const VWHY = { insecure: 'Open the Studio over https or localhost to export video.', 'no-webcodecs': 'This browser can\'t encode video yet — use Chrome or Edge on a computer.',
      browser: 'This version exports video only in Chrome or Edge on a computer — Firefox, Safari and phone browsers aren\'t supported yet.' };
    // a) dò năng lực THẬT → nút khoá + đúng lý do (CNS-223, Q44): giả trang không an toàn (http qua IP LAN), thiếu VideoEncoder, trình duyệt không phải Chromium
    const btnState = async (init, lang) => {
      const pg = await ctx20.newPage(); pg.on('pageerror', e => errs20.push(e.message));
      if (init) await pg.addInitScript(init);
      await pg.goto(U20 + 'tao-tac?lang=' + (lang || 'en') + '#/tac-pham/fo-one/publish');
      await pg.waitForSelector('#videoExportB', { timeout: 15000 });
      await pg.waitForFunction(() => { const w = document.getElementById('videoWhy'); return w && w.textContent && !/Checking this browser|Đang kiểm tra/.test(w.textContent); }, null, { timeout: 15000 });
      const st = await pg.evaluate(() => ({ disabled: document.getElementById('videoExportB').disabled, why: document.getElementById('videoWhy').textContent, label: document.getElementById('videoExportB').textContent }));
      return { pg, st };
    };
    const capCases = [['insecure', () => Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })],
      ['no-webcodecs', () => { delete window.VideoEncoder; }],
      ['browser', () => Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true })]];
    for (const [code, init] of capCases) {
      const { pg, st } = await btnState(init);
      if (!st.disabled || st.why !== VWHY[code] || st.label !== 'Export video') throw new Error('nút Xuất video khi ' + code + ': ' + JSON.stringify(st));
      if (code === 'insecure') { await shot20(pg, 'video-en-disabled'); }
      await pg.close();
    }
    { const { pg, st } = await btnState(() => Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }), 'vi');
      if (!st.disabled || st.why !== 'Mở Studio qua https hoặc localhost để xuất video.' || st.label !== 'Xuất video') throw new Error('nút Xuất video (vi) khi insecure: ' + JSON.stringify(st));
      await shot20(pg, 'video-vi-disabled'); await pg.close(); }
    const { pg: qv, st: st0 } = await btnState(() => { window.__pick = []; window.showDirectoryPicker = async o => { window.__pick.push({ active: navigator.userActivation.isActive, o }); const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle(window.__pickDir || 'ui-out', { create: true }); }; });
    const FMT0 = st0.why.startsWith('MP4') ? 'MP4 (H.264 + AAC)' : 'WebM (VP9 + Opus)';
    if (st0.disabled || !/^(MP4 \(H\.264 \+ AAC\)|WebM \(VP9 \+ Opus\)) · detected in this browser$/.test(st0.why)) throw new Error('nút Xuất video trên Chromium: ' + JSON.stringify(st0));
    console.log('  ✓ P3 nút Xuất video theo phép dò thật (CNS-223, Q44): trang không an toàn / thiếu VideoEncoder / không phải Chromium → khoá kèm đúng lý do (en + vi); Chromium → mở, báo "' + st0.why + '"');

    // b) dùng lại hộp askExport (CNS-218): Fun Office còn 1 câu chưa có giọng AI → hỏi trước; "Export now" mở BẢNG (không tải tệp ngay); câu thiếu im lặng (Q39)
    // B9 (CNS-250): bản cũ nhớ cấu hình xuất ở localStorage (chung) → tác phẩm chưa có work.video dùng nó MỘT lần: lưu vào tác phẩm rồi gỡ khoá cũ
    await qv.goto(U20 + 'tao-tac?lang=en'); await qv.evaluate(() => localStorage.setItem('gc-video-opts', JSON.stringify({ aspect: '16:9', quality: '720p', container: '' })));
    if ((await (await fetch(U20 + 'api/works/fo-first-day')).json()).video) throw new Error('fo-first-day không được có work.video trước khi mở bảng Xuất video');
    await openWork(qv, 'fo-first-day', 'en');
    let dlAny = 0; qv.on('download', () => dlAny++);
    await qv.click('#videoExportB');
    await qv.waitForSelector('[aria-label="Export without all AI voices?"][data-kind="video"]', { timeout: 20000 });
    const ask = await qv.textContent('[aria-label="Export without all AI voices?"]');
    if (!/1\/15 lines have no AI voice yet — in the video those lines are silent \(bubbles \/ captions still show\)\./.test(ask) || !/Dub, then export/.test(ask) || !/Export now/.test(ask)) throw new Error('hộp hỏi khi xuất video: ' + ask);
    await qv.click('[aria-label="Export without all AI voices?"] button:text-is("Export now")');
    await qv.waitForSelector('.vidpanel [data-v="voice"]', { timeout: 15000 });
    await qv.waitForFunction(() => /14\/15 lines have AI voices — the rest are silent/.test(document.querySelector('.vidpanel [data-v="voice"]').textContent), null, { timeout: 20000 });
    if (dlAny) throw new Error('Export now (video) không được tải tệp ngay — phải mở bảng chọn');
    { let wv = null; for (let i = 0; i < 50 && !(wv && wv.quality === '720p'); i++) { wv = (await (await fetch(U20 + 'api/works/fo-first-day')).json()).video; if (!(wv && wv.quality === '720p')) await new Promise(r => setTimeout(r, 100)); }
      const ls = await qv.evaluate(() => localStorage.getItem('gc-video-opts')), q0 = await qv.textContent('.vidpanel .seg[aria-label="Quality"] [aria-pressed="true"]');
      if (JSON.stringify(wv) !== '{"aspect":"16:9","quality":"720p","container":""}' || ls !== null || q0 !== '720p') throw new Error('migrate localStorage → work.video: ' + JSON.stringify([wv, ls, q0]));
      console.log('  ✓ B9 (CNS-250): cấu hình xuất cũ trong localStorage → work.video của tác phẩm (một lần, gỡ khoá cũ), bảng chọn dùng nó (720p)'); }
    console.log('  ✓ P3 dùng lại hộp askExport của phim HTML (CNS-218): "1/15 lines have no AI voice yet — in the video those lines are silent" · Export now → bảng chọn (14/15 câu có giọng AI, câu còn lại im lặng — Q39)');

    // c) bảng chọn: định dạng dò thật, trần độ dài (GCVideo.limits — WebM 15 phút ở cả hai chất lượng, MP4 5 / 10 phút), ước tính; vượt trần → chặn + gợi ý
    await openWork(qv, 'fo-one', 'en');
    await openPanel(qv);
    const opt0 = await qv.evaluate(() => { const t = s => (document.querySelector('.vidpanel ' + s) || {}).textContent || ''; return { fmt: t('.chip[data-fmt]') || t('.seg[aria-label="Format"] [aria-pressed="true"]'), len: t('[data-v="len"]'), limit: t('[data-v="limit"]'), est: t('[data-v="est"]'), save: t('[data-v="save"]'), dims: t('.seg[aria-label="Quality"] + .note'), q: t('.seg[aria-label="Quality"] [aria-pressed="true"]'), a: t('.seg[aria-label="Frame"] [aria-pressed="true"]'), all: document.querySelector('.vidpanel').innerText }; });
    const limTxt = FMT0.startsWith('MP4') ? '5 minutes for MP4 1080p (MP4 keeps the whole file in memory until it\'s done)' : '15 minutes for WebM (written to the file as it goes)';
    if (opt0.fmt !== FMT0 || opt0.limit !== limTxt || !/^~\d+ seconds \(estimated from the script; measured exactly when exporting\)$/.test(opt0.len) || !/^takes ~\d+ seconds · file up to ~[\d.]+ MB$/.test(opt0.est)
      || opt0.dims !== '1920×1080 · 30 fps' || opt0.q !== '1080p' || opt0.a !== 'Landscape 16:9' || !/^pick a folder when you press Start/.test(opt0.save) || !/Keep this tab in front while exporting/.test(opt0.all) || !/Made with gen-chibi · Gen Labs/.test(opt0.all))
      throw new Error('bảng chọn video: ' + JSON.stringify(opt0));
    if (VI.test(opt0.all)) throw new Error('bảng chọn video (en) lộ chữ Việt: ' + opt0.all.split('\n').filter(l => VI.test(l)).slice(0, 3).join(' | '));
    await shot20(qv, 'video-en-idle');
    // 9:16 + 720p đổi nhãn kích thước; vượt trần (giả trần 10 s) → banner chặn + gợi ý, Bắt đầu khoá
    await qv.click('.vidpanel .seg[aria-label="Frame"] button[data-v="9:16"]'); await qv.click('.vidpanel .seg[aria-label="Quality"] button[data-v="720p"]');
    await qv.waitForFunction(() => /^720×1280 · 30 fps$/.test(document.querySelector('.vidpanel .seg[aria-label="Quality"] + .note').textContent), null, { timeout: 10000 });
    // B9: mỗi lựa chọn lưu vào TÁC PHẨM trên server (work.video) — mở lại tác phẩm (trang mới) bảng chọn nhớ đúng; tác phẩm khác không bị ảnh hưởng
    { let wv = null; for (let i = 0; i < 50 && !(wv && wv.aspect === '9:16' && wv.quality === '720p'); i++) { wv = (await (await fetch(U20 + 'api/works/fo-one')).json()).video; await new Promise(r => setTimeout(r, 100)); }
      if (!wv || wv.aspect !== '9:16' || wv.quality !== '720p' || !['webm', 'mp4'].includes(wv.container)) throw new Error('bảng chọn phải lưu work.video của fo-one: ' + JSON.stringify(wv));
      const pg9 = await ctx20.newPage(); await openWork(pg9, 'fo-one', 'en'); await openPanel(pg9);
      const sel9 = await pg9.evaluate(() => ({ a: document.querySelector('.vidpanel .seg[aria-label="Frame"] [aria-pressed="true"]').textContent, q: document.querySelector('.vidpanel .seg[aria-label="Quality"] [aria-pressed="true"]').textContent }));
      await pg9.close();
      if (sel9.a !== 'Vertical 9:16' || sel9.q !== '720p') throw new Error('mở lại fo-one: bảng chọn phải nhớ work.video: ' + JSON.stringify(sel9)); }
    await qv.evaluate(() => { window.__lim0 = GCVideo.limits; GCVideo.limits = () => 10; });
    await qv.click('.vidpanel .seg[aria-label="Quality"] button[data-v="1080p"]');
    await qv.waitForSelector('.vidpanel [data-v="over"]', { timeout: 10000 });
    const over = await qv.evaluate(() => ({ t: document.querySelector('.vidpanel [data-v="over"]').textContent, start: document.querySelector('.vidpanel [data-v="start"]').disabled }));
    await qv.evaluate(() => { GCVideo.limits = window.__lim0; });
    if (!over.start || !/^The film runs ~\d+ seconds, over the 10 seconds limit for (WebM \(VP9 \+ Opus\)|MP4 \(H\.264 \+ AAC\)) 1080p — choose 720p( or WebM)?\.$/.test(over.t)) throw new Error('vượt trần độ dài: ' + JSON.stringify(over));
    console.log('  ✓ P3 bảng chọn: ' + opt0.fmt + ' (dò thật) · ' + opt0.len.replace(/ \(.*/, '') + ' · trần "' + opt0.limit + '" · ' + opt0.est + ' · 16:9 1920×1080 / 9:16 720×1280 · vượt trần → chặn, Bắt đầu khoá: "' + over.t + '"');

    // d) Bắt đầu → hỏi thư mục NGAY trong cú bấm (CNS-226) → tiến độ theo phân cảnh + Huỷ + "giữ tab ở phía trước" (tab bị ẩn → cảnh báo) → 4 tệp trong thư mục,
    //    Xem thử phát được, Chọn khung khác thay ảnh bìa. 16:9 1080p — đo nhịp tim 10 ms của Studio suốt lượt xuất (≤ 100 ms, spec §3)
    await qv.click('.vidpanel .seg[aria-label="Frame"] button[data-v="16:9"]');
    await qv.waitForSelector('.vidpanel [data-v="start"]:not([disabled])', { timeout: 10000 });
    await qv.evaluate(() => { window.__hbG = []; let last = performance.now(); window.__hbI = setInterval(() => { const n = performance.now(); window.__hbG.push([n - last, performance.timeOrigin + n]); last = n; }, 10); });
    await qv.click('.vidpanel [data-v="start"]');
    await qv.waitForSelector('.vidpanel table.vidshots tr[data-shot="0"]', { timeout: 60000 });
    await qv.waitForFunction(() => +(document.querySelector('.vidpanel [data-v="pct"]') || { textContent: '0' }).textContent.replace('%', '') >= 25, null, { timeout: 120000 });
    const run0 = await qv.evaluate(() => ({ pick: window.__pick.slice(), pct: document.querySelector('.vidpanel [data-v="pct"]').textContent, row: document.querySelector('.vidshots tr[data-shot="0"]').innerText, front: document.querySelector('.vidpanel [data-v="front"]').textContent, cancel: !!document.querySelector('.vidpanel [data-v="cancel"]'), all: document.querySelector('.vidpanel').innerText }));
    await shot20(qv, 'video-en-progress');
    // tab bị ẩn giữa chừng (giả visibilitychange — Playwright luôn giữ trang "visible") → cảnh báo đổi chữ. Giả CẢ hidden + visibilityState (engine/render.js đọc
    // document.hidden: chỉ giả một nửa thì nó tưởng tab vừa hiện lại và vẽ bù mọi nhân vật sống — việc của bài test, không phải của lượt xuất); trả lại "hiện" sau khi đo
    await qv.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hid = await qv.textContent('.vidpanel [data-v="front"]');
    if (run0.pick.length !== 1 || !run0.pick[0].active || run0.pick[0].o.mode !== 'readwrite' || !/^\d+%$/.test(run0.pct) || !/^1\s+The first morning\s+\d+%$/.test(run0.row.trim()) || !run0.cancel
      || run0.front !== 'Keep this tab in front until it\'s done — the browser slows down hidden tabs.' || hid !== 'This tab was hidden — the browser slowed the export down. Keep this tab in front until it\'s done.' || VI.test(run0.all))
      throw new Error('đang xuất: ' + JSON.stringify([run0, hid]));
    await qv.waitForSelector('.vidpanel [data-v="done"]', { timeout: 240000 });
    const hbUI = await hbJudge(await qv.evaluate(() => { clearInterval(window.__hbI); return window.__hbG.slice(); }));
    await qv.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    const dirList = async name => qv.evaluate(async name => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(name); const o = {}; for await (const [n, h] of d.entries()) o[n] = (await h.getFile()).size; return o; }, name);
    const out1 = await dirList('ui-out'), ext1 = FMT0.startsWith('MP4') ? 'mp4' : 'webm';
    const done1 = await qv.evaluate(() => ({ banner: document.querySelector('.vidpanel [data-v="done"]').textContent, rows: [...document.querySelectorAll('.vidfiles tr[data-file]')].map(r => r.innerText.replace(/\s+/g, ' ').trim()), all: document.querySelector('.vidpanel').innerText }));
    if (Object.keys(out1).sort().join() !== ['first-day-at-work.' + ext1, 'first-day-at-work.jpg', 'first-day-at-work.srt', 'first-day-at-work.txt'].sort().join() || Object.values(out1).some(v => !(v > 0))
      || !/^Done — 4 files saved to the folder "ui-out" · (WEBM|MP4) 1920×1080 · \d+ seconds$/.test(done1.banner) || done1.rows.length !== 4 || VI.test(done1.all)) throw new Error('xong: ' + JSON.stringify([out1, done1]));
    // Fun Office 1080p qua nút: v0.23.2 B5 (chụp theo lớp) → rào CỨNG 100 ms (spec §3; trước B5: thường 50–90, lượt lẻ ~120 ms — rào cũ 250)
    if (!(hbUI.n > 100) || hbUI.mine > 100) throw new Error('Fun Office 1080p qua nút Xuất video: luồng chính của Studio bị chặn ' + Math.round(hbUI.mine) + ' ms sau khi trừ khựng cả máy (ngân sách 100 ms, spec §3 — B5) — top thô−đối chứng: ' + hbUI.top);
    // Xem thử phát được (tệp vừa ghi); độ dài ≈ phim
    const pv = await qv.evaluate(async () => { const v = document.querySelector('.vidpanel video.vidprev'); if (!v) return { none: true }; v.muted = true;
      if (v.readyState < 2) await Promise.race([new Promise(r => v.addEventListener('loadeddata', r, { once: true })), new Promise(r => setTimeout(r, 10000))]);
      if (v.readyState < 2) return { ready: v.readyState, src: v.currentSrc }; const t0 = v.currentTime; await Promise.race([v.play(), new Promise(r => setTimeout(r, 5000))]); await new Promise(r => setTimeout(r, 1500)); v.pause(); return { dur: v.duration, adv: v.currentTime - t0, w: v.videoWidth, h: v.videoHeight }; });
    if (!(pv.adv > 0.5) || pv.w !== 1920 || pv.h !== 1080 || !(pv.dur > 10)) throw new Error('Xem thử: ' + JSON.stringify(pv));
    await shot20(qv, 'video-en-done');
    // Chọn khung khác (Q43): kéo tới 12 s → Dùng khung này làm bìa → tệp .jpg trong thư mục đổi
    const cov0 = await qv.evaluate(async () => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ui-out')).getFileHandle('first-day-at-work.jpg')).getFile(); return Array.from(new Uint8Array(await f.arrayBuffer())).slice(-64).join(); });
    await qv.click('.vidpanel [data-v="repick"]');
    await qv.evaluate(async () => { const v = document.querySelector('.vidpanel video.vidprev'), s = document.querySelector('.vidpanel input[type="range"]'); s.value = '12'; s.dispatchEvent(new Event('input')); await new Promise(r => v.addEventListener('seeked', r, { once: true })); });
    await qv.click('.vidpanel [data-v="use-frame"]');
    await qv.waitForFunction(() => /Cover replaced with the frame at 12\.0 s\./.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
    const cov1 = await qv.evaluate(async () => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ui-out')).getFileHandle('first-day-at-work.jpg')).getFile(); const b = new Uint8Array(await f.arrayBuffer()); const bm = await createImageBitmap(f); return { tail: Array.from(b).slice(-64).join(), head: [b[0], b[1]], w: bm.width, h: bm.height }; });
    if (cov1.tail === cov0 || cov1.head.join() !== '255,216' || cov1.w !== 1920 || cov1.h !== 1080) throw new Error('Chọn khung khác: ảnh bìa không đổi / sai: ' + JSON.stringify(cov1));
    console.log('  ✓ P3 Bắt đầu: hộp chọn thư mục gọi NGAY trong cú bấm (userActivation còn hiệu lực — CNS-226) · tiến độ theo phân cảnh "' + run0.row.replace(/\s+/g, ' ').trim() + '" + Huỷ + "giữ tab ở phía trước" (tab bị ẩn → cảnh báo) · xong: 4 tệp trong thư mục ('
      + Object.entries(out1).map(([n, b]) => n.replace('first-day-at-work', '') + ' ' + Math.round(b / 1024) + ' KB').join(', ') + ') · Xem thử phát được ' + pv.w + '×' + pv.h + ' ' + pv.dur.toFixed(1) + ' s · Chọn khung khác → .jpg mới ở 12 s · Fun Office 1080p: luồng chính bị chặn tối đa ' + Math.round(hbUI.mine) + ' ms (≤ 100; thô ' + Math.round(hbUI.raw) + ' · top thô−đối chứng ' + hbUI.top + ')');

    // e) 9:16 1080p qua nút → tệp ra đúng 1080×1920 (khung dọc thật — Q37 b); tên trùng → -2 (không ghi đè lượt trước)
    await qv.click('.vidpanel button:text-is("Export again")');
    await qv.waitForSelector('.vidpanel [data-v="start"]:not([disabled])', { timeout: 20000 });
    await qv.click('.vidpanel .seg[aria-label="Frame"] button[data-v="9:16"]');
    await qv.waitForSelector('.vidpanel [data-v="start"]:not([disabled])', { timeout: 10000 });
    await qv.click('.vidpanel [data-v="start"]');
    await qv.waitForSelector('.vidpanel [data-v="done"]', { timeout: 240000 });
    const out2 = await dirList('ui-out'), vb2 = Buffer.from(await qv.evaluate(async ext => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ui-out')).getFileHandle('first-day-at-work-2.' + ext)).getFile(), u = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }, ext1), 'base64');
    let dim2;
    if (ext1 === 'webm') { const w = inspectWebm(vb2); dim2 = [w.tracks[0].width, w.tracks[0].height]; } else { const m = inspectMp4(vb2), V = m.tracks.find(t => t.handler === 'vide'); dim2 = [V.width, V.height]; }
    const ban2 = await qv.textContent('.vidpanel [data-v="done"]');
    if (Object.keys(out2).length !== 8 || dim2.join('×') !== '1080×1920' || !/ 1080×1920 · /.test(ban2)) throw new Error('9:16 1080p: ' + JSON.stringify([Object.keys(out2), dim2, ban2]));
    console.log('  ✓ P3 9:16 1080p qua nút: tệp ' + dim2.join('×') + ' (khung dọc thật, máy quay bám người nói — Q37 b) · tên trùng → first-day-at-work-2.* (lượt trước còn nguyên, 8 tệp)');

    // f) Huỷ giữa chừng qua nút → không để lại tệp nào trong thư mục đã chọn, bảng đóng, toast báo
    await qv.click('.vidpanel button:text-is("Export again")');
    await qv.waitForSelector('.vidpanel [data-v="start"]:not([disabled])', { timeout: 20000 });
    await qv.click('.vidpanel .seg[aria-label="Quality"] button[data-v="720p"]');
    await qv.waitForSelector('.vidpanel [data-v="start"]:not([disabled])', { timeout: 10000 });
    await qv.evaluate(() => { window.__pickDir = 'ui-cancel'; });
    await qv.click('.vidpanel [data-v="start"]');
    await qv.waitForFunction(() => +(document.querySelector('.vidpanel [data-v="pct"]') || { textContent: '0' }).textContent.replace('%', '') >= 10, null, { timeout: 120000 });
    await qv.click('.vidpanel [data-v="cancel"]');
    await qv.waitForFunction(() => /Video export cancelled — no files left behind\./.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
    const out3 = await dirList('ui-cancel'), fr3 = await qv.evaluate(() => ({ iframes: document.querySelectorAll('iframe[data-gc-video]').length, panel: !!document.querySelector('.vidpanel') }));
    if (Object.keys(out3).length || fr3.iframes || fr3.panel) throw new Error('Huỷ qua nút: ' + JSON.stringify([out3, fr3]));
    console.log('  ✓ P3 Huỷ qua nút giữa chừng: thư mục đã chọn trống (tệp video tạo lúc bấm đã gỡ), iframe gỡ, bảng đóng, toast "Video export cancelled — no files left behind."');

    // i) Huỷ chỉ gỡ tệp LƯỢT NÀY tạo, không bao giờ ghi đè: thư mục đã có first-day-at-work.webm + -2 … -51 (51 tệp "OLD") → lượt mới lấy tên khác,
    //    Huỷ → 51 tệp cũ còn nguyên, không thừa tệp nào. Và gỡ tệp dở: trình duyệt chưa nhả tệp lần đầu (removeEntry lỗi 1 lần) → thử lại, vẫn sạch;
    //    lỗi mãi → toast nói thật tên tệp còn lại (không nói "không để lại tệp nào")
    const cancelRun = async dirName => {
      await qv.evaluate(n => { window.__pickDir = n; }, dirName);
      await openPanel(qv);
      await qv.click('.vidpanel .seg[aria-label="Quality"] button[data-v="720p"]'); await qv.waitForSelector('.vidpanel [data-v="start"]:not([disabled])', { timeout: 10000 });
      await qv.evaluate(() => { document.getElementById('toast').textContent = ''; });
      await qv.click('.vidpanel [data-v="start"]');
      await qv.waitForFunction(() => +(document.querySelector('.vidpanel [data-v="pct"]') || { textContent: '0' }).textContent.replace('%', '') >= 8, null, { timeout: 120000 });
      await qv.click('.vidpanel [data-v="cancel"]');
      await qv.waitForFunction(() => /cancelled/.test(document.getElementById('toast').textContent), null, { timeout: 20000 });
      return { toast: await qv.textContent('#toast'), files: await dirList(dirName) };
    };
    await qv.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('ui-col', { create: true });
      for (let k = 1; k <= 51; k++) { const w = await (await d.getFileHandle('first-day-at-work' + (k === 1 ? '' : '-' + k) + '.webm', { create: true })).createWritable(); await w.write('OLD'); await w.close(); } });
    const col = await cancelRun('ui-col'), olds = await qv.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('ui-col'); let n = 0; for await (const [nm, h] of d.entries()) if ((await (await h.getFile()).text()) === 'OLD') n++; return n; });
    if (Object.keys(col.files).length !== 51 || olds !== 51 || !/no files left behind/.test(col.toast)) throw new Error('Huỷ khi thư mục có 51 tên trùng: ' + JSON.stringify([Object.keys(col.files).length, olds, col.toast]));
    await qv.evaluate(() => { const P = FileSystemDirectoryHandle.prototype; window.__rm0 = window.__rm0 || P.removeEntry; let n = 0; P.removeEntry = function () { if (n++ === 0) return Promise.reject(new DOMException('busy', 'NoModificationAllowedError')); return window.__rm0.apply(this, arguments); }; });
    const r1 = await cancelRun('ui-busy1');
    await qv.evaluate(() => { FileSystemDirectoryHandle.prototype.removeEntry = function () { return Promise.reject(new DOMException('busy', 'NoModificationAllowedError')); }; });
    const r2 = await cancelRun('ui-busy2');
    await qv.evaluate(() => { FileSystemDirectoryHandle.prototype.removeEntry = window.__rm0; });
    if (Object.keys(r1.files).length || !/no files left behind/.test(r1.toast) || Object.keys(r2.files).length !== 1 || !/couldn't delete the partial file "first-day-at-work\.webm" in the folder "ui-busy2"/.test(r2.toast))
      throw new Error('gỡ tệp dở khi Huỷ: ' + JSON.stringify([r1, r2]));
    console.log('  ✓ Huỷ không bao giờ đụng tệp cũ: 51 tên trùng → lượt mới lấy tên khác, Huỷ → 51 tệp "OLD" còn nguyên · removeEntry lỗi 1 lần → thử lại sau 200 ms, thư mục sạch · lỗi mãi → toast nói rõ "' + r2.toast + '"');

    // h) điều khoản bộ mẫu (Q47, CNS-240): bản cài CŨ mang câu cũ trong dấu sample (cùng version) → Thư viện hiện câu HIỆN HÀNH, KHÔNG mời "cập nhật bộ mẫu"
    //    (đổi câu điều khoản không phải bản mới của bộ mẫu); bảng Xuất video của tác phẩm Fun Office (bộ mẫu đi kèm, không có dấu sample) cũng nêu điều khoản
    { const TQB = JSON.parse(readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8'));
      TQB.sample.license = '© 2026 Gen Labs — bộ mẫu trưng bày: xem, sửa thử, làm phim; không bán lại, không phân phối';   // câu của bản cài trước v0.22
      const ri = await fetch(U20 + 'api/projects/import', { method: 'POST', headers: HDR, body: JSON.stringify({ bundle: TQB, overwrite: true }) });
      if (ri.status !== 200) throw new Error('nhập Tam Quốc câu cũ: HTTP ' + ri.status);
      const pg = await ctx20.newPage(); pg.on('pageerror', e => errs20.push(e.message));
      await pg.goto(U20 + 'thu-vien?lang=en'); await pg.waitForSelector('.nav-item', { timeout: 15000 });
      await pg.click('.nav-item:has-text("Theme projects")'); await pg.waitForSelector('.libcard.proj[title="mau-tam-quoc"]', { timeout: 15000 });
      await pg.click('.libcard.proj[title="mau-tam-quoc"]'); await pg.waitForTimeout(800);
      const ban = await pg.evaluate(() => [...document.querySelectorAll('.banner')].map(b => b.textContent).filter(t => /Gen Labs/.test(t)).join(' | '));
      const upd = await pg.evaluate(() => [...document.querySelectorAll('button')].some(b => /Update sample/.test(b.textContent)));
      const TERMS_EN = "view, try and make films; films / videos made from the sample may be posted and monetized with the credit line \"Made with gen-chibi · Gen Labs\"; don't resell or redistribute the sample characters or assets themselves, or use them as a logo / brand";
      if (ban.indexOf(TERMS_EN) < 0 || /view, try and film only|trial films only/.test(ban) || upd) throw new Error('điều khoản bộ mẫu (bản cài câu cũ): ' + JSON.stringify([ban, upd]));
      await pg.close();
      await openWork(qv, 'fo-one', 'en'); await openPanel(qv);
      const cr = await qv.evaluate(() => (document.querySelector('.vidpanel [data-v="credit"]') || {}).textContent || '');
      if (cr.indexOf(TERMS_EN) < 0) throw new Error('bảng Xuất video (Fun Office — bộ mẫu đi kèm) phải nêu điều khoản bộ mẫu: ' + JSON.stringify(cr));
      console.log('  ✓ điều khoản bộ mẫu (Q47): bản cài câu cũ → Thư viện hiện câu hiện hành, không mời cập nhật bộ mẫu · bảng Xuất video của Fun Office nêu điều khoản + dòng ghi công'); }

    // g) giao diện tiếng Việt: cùng bảng, chữ Việt (msgid) — chụp màn idle / đang xuất / xong
    await openWork(qv, 'fo-one', 'vi');
    await openPanel(qv);
    const vi0 = await qv.evaluate(() => document.querySelector('.vidpanel').innerText);
    for (const w of ['Khung hình', 'Ngang 16:9', 'Chất lượng', 'Định dạng', 'Trần độ dài', 'Ước tính', 'Lưu vào', 'Bắt đầu', 'Giữ tab này ở phía trước']) if (!vi0.includes(w)) throw new Error('bảng Xuất video (vi) thiếu "' + w + '": ' + vi0);
    await shot20(qv, 'video-vi-idle');
    if (SHOTS20) {
      await qv.evaluate(() => { window.__pickDir = 'ui-vi'; });
      await qv.click('.vidpanel .seg[aria-label="Chất lượng"] button[data-v="720p"]');
      await qv.waitForSelector('.vidpanel [data-v="start"]:not([disabled])', { timeout: 10000 });
      await qv.click('.vidpanel [data-v="start"]');
      await qv.waitForFunction(() => +(document.querySelector('.vidpanel [data-v="pct"]') || { textContent: '0' }).textContent.replace('%', '') >= 30, null, { timeout: 120000 });
      await shot20(qv, 'video-vi-progress');
      await qv.waitForSelector('.vidpanel [data-v="done"]', { timeout: 240000 });
      await shot20(qv, 'video-vi-done');
    }
    console.log('  ✓ P3 giao diện tiếng Việt: bảng Xuất video đủ chữ (Khung hình · Chất lượng · Định dạng · Trần độ dài · Ước tính · Lưu vào · Bắt đầu · giữ tab ở phía trước)' + (SHOTS20 ? ' · ảnh chụp en + vi ở ' + SHOTS20 : ''));
    await qv.close();
    if (errs20.length) throw new Error('lỗi trang: ' + errs20.slice(0, 3).join(' | '));
    console.log('  ✓ nhóm xuất video xong trong ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s');
  } catch (e) { fail = 1; console.log('  ✗ xuất video:', e && e.stack || e); }
  finally { await b20.close(); srv20.kill(); }
}
// SÂN KHẤU SỐNG (INT-21): mở trang Live → phát lại phiên mẫu (tại chỗ) + phát qua server (SSE) → bảng sự kiện hiện, nhân vật đi qua các khu,
// đạo cụ ra / về túi; đo ngân sách (L-42): long task ≤ 50 ms, khung ~60 fps; chụp ≥ 12 khung (GC_LIVE_SHOTS=<thư mục>: lưu ảnh + tờ ghép + WebM dựng offline bằng GenMux)
if (want('live')) {
  const LHOME = mkdtempSync(path.join(tmpdir(), 'gc-live-b-'));
  const srvL = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: LHOME, GC_PORT: '7670', GC_NO_AUTOCHECK: '1', HOME: LHOME }, stdio: 'ignore' }));
  for (let i = 0; i < 100; i++) { try { if ((await fetch('http://127.0.0.1:7670/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 100)); }
  const OUT = process.env.GC_LIVE_SHOTS || '';
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const bL = await pw.chromium.launch();
  try {
    const ctx = await bL.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage(), errsL = [];
    pg.on('pageerror', e => errsL.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/Content Security Policy|favicon/.test(m.text())) errsL.push(m.text()); });
    await pg.addInitScript(() => { try { localStorage.setItem('gc-route-xuong', JSON.stringify({ page: 'live' })); } catch (e) { /* bỏ */ } });
    await pg.goto('http://localhost:7670/xuong');
    await pg.waitForSelector('#liveStage', { timeout: 20000 });
    const navOk = await pg.evaluate(() => [...document.querySelectorAll('.nav-item')].some(b => b.getAttribute('aria-current') === 'page' && /Sân khấu Live/.test(b.textContent)));
    await pg.waitForSelector('#liveConn.ok', { timeout: 10000 });
    const cmdTxt = await pg.textContent('#liveCmd'), panel = await pg.textContent('#liveConnect');
    if (!navOk || cmdTxt.trim() !== 'genchibi live hook --install-into ~/.claude/settings.json' || /GC_LIVE|live-hook\.mjs|"hooks"/.test(panel) || await pg.$('#liveSnippet')) throw new Error('trang Live: mục menu / lệnh CLI chưa đúng, hoặc còn dòng lệnh hook do app soạn');
    console.log('  ✓ Live: mục "Sân khấu Live" trong menu Hệ thống · SSE nối (Đang nghe) · bảng "Kết nối Claude Code" chỉ có lệnh genchibi live hook --install-into (không dòng lệnh hook nào do app soạn) + token live');
    // đo hiệu năng: long task + khoảng cách khung (rAF) suốt lúc phát lại
    await pg.evaluate(() => {
      window.__lt = []; window.__fr = []; let last = 0;
      window.__shots = [];
      try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: false }); } catch (e) { window.__lt = null; }
      (function tick(t) { if (last) window.__fr.push(t - last); last = t; if (window.__fr.length < 100000) requestAnimationFrame(tick); })();
    });
    await pg.selectOption('#liveSpeed', '2');
    await pg.evaluate(() => { window.__t0rep = performance.now(); });
    await pg.click('#liveReplay');
    const shots = [], N = 20, t0 = Date.now();
    for (let k = 0; k < N; k++) {
      await pg.waitForTimeout(2800);
      await pg.evaluate(() => window.__shots.push([performance.now(), 0]));
      const buf = await pg.locator('#liveStageBox').screenshot();
      await pg.evaluate(() => { const s = window.__shots[window.__shots.length - 1]; s[1] = performance.now(); });
      shots.push(buf); if (OUT) fs.writeFileSync(path.join(OUT, 'frame-' + String(k + 1).padStart(2, '0') + '.png'), buf);
    }
    const st = await pg.evaluate(() => { const L = window.__gcLive, D = L.director; return { rows: document.querySelectorAll('#liveRows tr').length, kinds: [...new Set([...document.querySelectorAll('#liveRows tr')].map(r => r.dataset.kind))], zones: Object.keys(L.stats.zones), clips: Object.keys(L.stats.clips), worst: L.stats.worst, slow: L.stats.slow, frames: L.stats.frames,
      takes: D.steps.filter(s => s.type === 'takeOut').map(s => s.propOut), puts: D.steps.filter(s => s.type === 'putBack').length, labels: [...document.querySelectorAll('#liveRows td:last-child')].map(td => td.textContent).join('|') }; });
    const need = ['shelf', 'desk', 'lab', 'door'];
    if (st.rows < 30 || need.some(z => !st.zones.includes(z)) || st.takes.length < 4 || st.puts < 3) throw new Error('phát lại: ' + JSON.stringify(st).slice(0, 600));
    console.log('  ✓ Live phát lại phiên mẫu ×2: ' + st.rows + ' dòng sự kiện (' + st.kinds.length + ' loại) · nhân vật dừng ở ' + st.zones.join(', ') + ' · ' + st.clips.length + ' clip · lấy đồ từ túi: ' + st.takes.join(', ') + ' · ' + shots.length + ' khung chụp');
    // hết phiên mẫu: chờ diễn nốt (phát hành, chờ người) rồi đo
    await pg.waitForTimeout(Math.max(0, 60000 - (Date.now() - t0)));
    // long task do CHÍNH bộ test gây ra (chụp màn hình — trình duyệt dựng khung để chụp) không tính; còn lại là của trang
    const st2 = await pg.evaluate(() => ({ zones: Object.keys(window.__gcLive.stats.zones), all: window.__lt, lt: window.__lt && window.__lt.filter(([a, d]) => !window.__shots.some(([s0, s1]) => a + d >= s0 - 5 && a <= s1 + 5)).map(x => x[1]), ltAt: window.__lt && window.__lt.map(x => [Math.round(x[0]), Math.round(x[1]), Math.round(x[0] - window.__t0rep)]), fr: window.__fr.slice(30) }));
    if (!['rocket', 'coffee'].some(z => st2.zones.includes(z))) throw new Error('chưa tới bệ phóng / góc cà phê: ' + st2.zones);
    // công tắc việc: chip "Đang làm: …" + dòng sự kiện gắn việc; phiên mẫu đổi việc 2 lần (debug → release), lần gửi lại cùng việc không thêm nhịp
    const tk = await pg.evaluate(() => ({ chip: document.getElementById('liveTask').hidden ? '' : document.getElementById('liveTask').textContent, tasks: [...new Set([...document.querySelectorAll('#liveRows tr')].map(r => r.dataset.task).filter(Boolean))],
      claps: window.__gcLive.director.steps.filter(s => s.clip === 'lvClap').map(s => s.taskMark) }));
    if (!/^Đang làm: /.test(tk.chip) || !tk.tasks.includes('debug') || !tk.tasks.includes('release') || tk.claps.join(',') !== 'debug,release') throw new Error('công tắc việc: ' + JSON.stringify(tk));
    console.log('  ✓ Live công tắc việc: chip "' + tk.chip + '" · dòng sự kiện gắn việc (' + tk.tasks.join(', ') + ') · nhịp clapper ' + tk.claps.join(' → ') + ' (gửi lại cùng việc: không thêm nhịp)');
    // NGÂN SÁCH đo ở một cửa sổ SẠCH: phát lại lần nữa 30 s, không chụp màn hình (chụp qua CDP tự sinh việc nặng trên luồng chính, không phải của trang)
    await pg.evaluate(() => { window.__lt.length = 0; window.__fr.length = 0; window.__shots.length = 0; window.__gcLive.stats.worst = 0; window.__gcLive.stats.slow.length = 0; window.__t0rep = performance.now(); });
    await pg.click('#liveReplay');
    await pg.waitForTimeout(30000);
    Object.assign(st2, await pg.evaluate(() => ({ all: window.__lt, lt: window.__lt && window.__lt.map(x => x[1]), ltAt: window.__lt && window.__lt.map(x => [Math.round(x[0]), Math.round(x[1]), Math.round(x[0] - window.__t0rep)]), fr: window.__fr.slice(30) })));
    st.worst = await pg.evaluate(() => window.__gcLive.stats.worst); st.slow = await pg.evaluate(() => window.__gcLive.stats.slow);
    const fr = st2.fr.slice().sort((a, b) => a - b), p50 = fr[Math.floor(fr.length / 2)], p95 = fr[Math.floor(fr.length * 0.95)], ltMax = st2.lt ? Math.max(0, ...st2.lt) : -1;
    const perf = { cpus: (await import('os')).cpus().length, frames: fr.length, p50: +p50.toFixed(1), p95: +p95.toFixed(1), fps: +(1000 / p50).toFixed(1), longTasks: st2.lt ? st2.lt.length : 'n/a', longestTask: ltMax, harnessLongTasks: st2.all ? st2.all.length - st2.lt.length : 0, harnessLongest: st2.all && st2.all.length ? Math.round(Math.max(...st2.all.map(x => x[1]))) : 0, worstPaint: +st.worst.toFixed(2), slowFrames: st.slow, longAt: st2.ltAt };
    if (OUT) fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(perf, null, 1));
    // L-42: việc của TRANG mỗi khung (đạo diễn + vẽ) ≤ 50 ms là luật cứng; long task của trình duyệt (GC / raster của Chromium headless trên máy 2 CPU)
    // thỉnh thoảng nhích quá 50 ms dù khung của trang chỉ ≤ 15 ms — cho phép tối đa MỘT cái ≤ 120 ms trong 30 s và in ra để theo dõi
    const over = (st2.lt || []).filter(d => d > 50);
    if (perf.worstPaint > 50 || p95 > 34 || over.length > 1 || over.some(d => d > 120)) throw new Error('ngân sách L-42: ' + JSON.stringify(perf));
    console.log('  ✓ Live ngân sách (L-42): ' + perf.frames + ' khung, p50 ' + perf.p50 + ' ms (' + perf.fps + ' fps), p95 ' + perf.p95 + ' ms · long task: ' + perf.longTasks + ' (dài nhất ' + Math.round(perf.longestTask) + ' ms) · vẽ một khung tối đa ' + perf.worstPaint + ' ms · ' + perf.cpus + ' CPU');
    // đường server thật: tools/live-replay.mjs (token live như hooks) → SSE → bảng (ID không có tiền tố D)
    const info = await (await fetch('http://127.0.0.1:7670/api/live/info')).json();
    const rp = spawn(process.execPath, [path.join(ROOT, 'tools/live-replay.mjs'), '--speed', '20', '--url', 'http://127.0.0.1:7670'], { env: { ...process.env, GC_LIVE_TOKEN: info.token, HOME: LHOME }, stdio: 'ignore' });
    const rc = await new Promise(r => rp.on('exit', r));
    await pg.waitForFunction(() => document.querySelectorAll('#liveRows tr:not([data-id^="D"])').length >= 40, null, { timeout: 15000 });
    const leak = await pg.evaluate(() => /\/|@|sk-|gcl_/.test([...document.querySelectorAll('#liveRows td:last-child')].map(td => td.textContent).join('') + (document.querySelector('.lv-bubble text') || {}).textContent)
      || window.__gcLive.director.steps.some(s => s.bubble && /\b(Read|Grep|Glob|Bash|Edit|Write|Agent|Task|Explore|TodoWrite|WebFetch|WebSearch)\b/.test(window.GenChibi.live.bubbleText(s.bubble, window.GenChibi.i18n.t))));
    if (rc !== 0 || leak) throw new Error('replay qua server rc=' + rc + ' leak=' + leak);
    console.log('  ✓ Live qua server: tools/live-replay.mjs (token live) → POST /api/live/event → SSE → bảng sự kiện (≥ 40 dòng) · bong bóng / nhãn không có đường dẫn / email / token');
    // âm thanh mặc định tắt, bật được
    const snd = await pg.evaluate(() => { const b = document.getElementById('liveSound'), a = b.getAttribute('aria-pressed'); b.click(); const c = b.getAttribute('aria-pressed'); b.click(); return a + '>' + c; });
    if (snd !== 'false>true') throw new Error('nút âm thanh: ' + snd);
    console.log('  ✓ Live âm thanh: mặc định tắt, nút bật / tắt');
    if (OUT) {
      // tờ ghép ≥ 12 khung (4 cột)
      const cs = await ctx.newPage();
      await cs.setContent('<html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(4,480px);gap:6px;padding:6px;width:max-content">' + shots.map((b, i) => '<div style="position:relative"><img style="width:480px;display:block" src="data:image/png;base64,' + b.toString('base64') + '"><span style="position:absolute;left:6px;top:4px;color:#fff;background:#0008;font:12px sans-serif;padding:1px 5px">' + (i + 1) + '</span></div>').join('') + '</body></html>');
      await cs.screenshot({ path: path.join(OUT, 'contact-sheet.png'), fullPage: true }); await cs.close();
      // WebM dựng offline (tất định) từ phiên mẫu: engine/live.js svg(t) → canvas → VideoEncoder VP9 → GenMux.webm (bộ ghép của đường xuất video)
      await pg.addScriptTag({ url: '/studio/video/mux.js' });
      const webm = await pg.evaluate(async () => {
        const GC = window.GenChibi, LV = GC.live, txt = await (await fetch('kinds/live/demo-session.jsonl')).text(), list = LV.parseJSONL(txt), D = LV.director(), S = LV.stage(null, D);
        const W = 960, H = 540, FPS = 24, SPEED = 3, END = list[list.length - 1].at + 22, cv = new OffscreenCanvas(W, H), g = cv.getContext('2d', { alpha: false }), chunks = [];
        const img = {}, imageOf = h => img[h.tint] || (img[h.tint] = GC.render.imageURL(LV.agentAsset(h.tint), 'work', { noShadow: true }));
        const enc = new VideoEncoder({ output: c => { const b = new Uint8Array(c.byteLength); c.copyTo(b); chunks.push({ data: b, ts: c.timestamp, key: c.type === 'key' }); }, error: e => { throw e; } });
        enc.configure({ codec: 'vp09.00.31.08', width: W, height: H, bitrate: 3e6, framerate: FPS });
        let i = 0, n = 0;
        for (let f = 0; f * SPEED / FPS <= END; f++) {
          const t = f * SPEED / FPS;
          while (i < list.length && list[i].at <= t) { D.push(list[i].ev, t); i++; }
          D.advance(t);
          const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(S.svg(t, { tr: GC.i18n.t, imageOf }));
          await im.decode(); g.drawImage(im, 0, 0, W, H);
          const vf = new VideoFrame(cv, { timestamp: Math.round(f * 1e6 / FPS) }); enc.encode(vf, { keyFrame: f % 48 === 0 }); vf.close(); n++;
          if (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 0));
        }
        await enc.flush();
        const bytes = window.GenMux.webm({ video: { codec: 'vp09', width: W, height: H, fps: FPS, chunks } });
        let s = ''; for (let k = 0; k < bytes.length; k += 32768) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 32768));
        return { b64: btoa(s), frames: n, sec: n / FPS };
      });
      fs.writeFileSync(path.join(OUT, 'live-demo.webm'), Buffer.from(webm.b64, 'base64'));
      console.log('  ✓ Live bằng chứng: ' + shots.length + ' khung + contact-sheet.png + live-demo.webm (' + webm.frames + ' khung VP9, ' + webm.sec.toFixed(1) + ' s, tua ×3, GenMux) → ' + OUT);
    }
    // token riêng của agent (live_setup, v0.24.1): Studio liệt kê (tên · tạo lúc · sự kiện cuối) và Thu hồi
    {
      const OT = process.env.GC_API_TOKEN || fs.readFileSync(path.join(LHOME, 'data', 'owner-token'), 'utf8').trim();
      const ms = await (await fetch('http://127.0.0.1:7670/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OT }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'live_setup', arguments: { name: 'browser box', os: 'linux' } } }) })).json();
      const tid = JSON.parse(ms.result.content[0].text).tokenId;
      const p2 = await ctx.newPage(); p2.on('pageerror', e => errsL.push(String(e)));
      await p2.goto('http://localhost:7670/xuong'); await p2.waitForSelector('#liveAgents tr[data-agent="' + tid + '"]', { timeout: 15000 });
      const row = await p2.textContent('#liveAgents tr[data-agent="' + tid + '"]');
      await p2.click('#liveAgents button[data-revoke="' + tid + '"]');
      await p2.waitForFunction(id => !document.querySelector('#liveAgents tr[data-agent="' + id + '"]'), tid, { timeout: 10000 });
      const ag = (await (await fetch('http://127.0.0.1:7670/api/live/agents', { headers: { Authorization: 'Bearer ' + OT } })).json()).agents.find(a => a.id === tid);
      if (!/browser box/.test(row) || !ag || !ag.revoked) throw new Error('Studio danh sách token agent: ' + row + ' ' + JSON.stringify(ag));
      console.log('  ✓ Live token agent: live_setup cấp token → Studio liệt kê "browser box" (tạo lúc, sự kiện cuối) · nút Thu hồi → hàng biến mất, server ghi đã thu hồi');
      await p2.close();
    }
    if (errsL.length) throw new Error('lỗi trang: ' + errsL.slice(0, 3).join(' | '));
    await ctx.close();
  } catch (e) { fail = 1; console.log('  ✗ Live:', e && e.stack || e); }
  finally { await bL.close(); srvL.kill(); }
}
// CSP: bộ test vừa đi khắp Studio (mọi khu, dock, xuất phim, âm thanh, Lên mạng…) — không được có vi phạm nào
{ const v = [...new Set(CSP_VIOL)];
  if (v.length) { fail = 1; console.log('  ✗ CSP của Studio chặn ' + v.length + ' thứ Studio cần:\n      ' + v.slice(0, 20).join('\n      ')); }
  else console.log('  ✓ CSP của Studio (script-src \'self\', không frame): không vi phạm nào trên mọi trang của bộ test'); }
process.exit(fail);
