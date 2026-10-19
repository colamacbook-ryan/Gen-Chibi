// Kiểm thử trong trình duyệt (chạy cục bộ, cần Playwright): mọi lớp gắn vào đầu phải đi cùng đầu.
// Dùng: node tools/test-browser.mjs   (tự dựng server tạm ở cổng 7496) · GC_ONLY=voice node tools/test-browser.mjs → chỉ nhóm giọng AI (cổng 7660) · GC_ONLY=lib → chỉ Thư viện Âm thanh / Giọng (cổng 7662) · GC_ONLY=oauth → chỉ nhóm OAuth (cổng 7664–7666) · GC_ONLY=bubble → chỉ "lời thoại chuyên nghiệp" (cổng 7495; GC_THROTTLE=4 → CPU trang chậm 4× như máy yếu)
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import { mkdtempSync } from 'fs';
import * as fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Store } = require('../server/store.js');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
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
{ const launch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async (...a) => {
    const b = await launch(...a), np = b.newPage.bind(b), nc = b.newContext.bind(b);
    b.newPage = async (...x) => autoTab(await np(...x));
    b.newContext = async (...x) => { const c = await nc(...x), cp = c.newPage.bind(c); c.newPage = async (...y) => autoTab(await cp(...y)); return c; };
    return b;
  }; }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// server con do test dựng: tắt hết khi thoát — kể cả khi test sập giữa chừng (L-55: server sót lại khiến lần chạy sau dùng nhầm dữ liệu cũ)
const kids = []; const kid = c => { kids.push(c); return c; };
// GC_ONLY=voice node tools/test-browser.mjs → chỉ chạy nhóm "giọng AI" (lặp nhanh khi làm giọng); không đặt = chạy cả bộ như CI
const ONLY = process.env.GC_ONLY || '';
process.on('exit', () => kids.forEach(c => { try { c.kill(); } catch (e) { /* đã tắt */ } }));
process.on('uncaughtException', e => { console.error(e); process.exit(1); });
let fail = 0;
const home = mkdtempSync(path.join(tmpdir(), 'gc-'));
if (!ONLY) {
const srv = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: '7496', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
await new Promise(r => setTimeout(r, 1200));
const b = await pw.chromium.launch();
const p = await b.newPage();
try {
  await p.goto('http://localhost:7496/');
  await p.waitForFunction(() => window.GenChibi && window.GenChibi.render);
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
// Bản cài có token: Studio phải hiện màn đăng nhập (không lùi về chế độ xem thử), nhập đúng token thì vào được.
if (!ONLY) {
  const home2 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv2 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home2, GC_PORT: '7497', GC_NO_AUTOCHECK: '1', GC_API_TOKEN: 'tok-test-123' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
  const b2 = await pw.chromium.launch();
  const q = await b2.newPage();
  try {
    await q.goto('http://localhost:7497/');
    await q.waitForSelector('#gcLogin input', { timeout: 5000 });
    await q.fill('#gcLogin input', 'sai-token'); await q.press('#gcLogin input', 'Enter');
    await q.waitForSelector('#gcLogin', { timeout: 5000 });
    const wrongMsg = await q.textContent('#gcLogin');
    await q.fill('#gcLogin input', 'tok-test-123'); await q.press('#gcLogin input', 'Enter');
    await q.waitForFunction(() => /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 5000 });
    if (!/không đúng/.test(wrongMsg) || await q.$('#gcLogin')) throw new Error('luồng đăng nhập sai');
    console.log('  ✓ Studio đăng nhập bằng token (từ chối token sai, vào được với token đúng)');
  } catch (e) { fail = 1; console.log('  ✗ đăng nhập Studio:', e.message); }
  finally { await b2.close(); srv2.kill(); }
}
// Studio tách hai khu: Thư viện (thành phẩm, lấy về dùng) và Xưởng (tạo lập). Mọi trang mở không lỗi;
// thư viện có thẻ theo nhóm + khu "Dùng" (tải ảnh, chép mã); đạo diễn diễn được trong cảnh.
if (!ONLY) {
  const home3 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv3 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home3, GC_PORT: '7498', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
  const b3 = await pw.chromium.launch();
  const q = await b3.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = []; q.on('pageerror', e => errs.push(e.message));
  try {
    // "/" = màn chọn khu: 3 thẻ dẫn sang 3 ứng dụng độc lập
    await q.goto('http://localhost:7498/');
    await q.waitForFunction(() => /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 5000 });
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
if (!ONLY) {
  const home4 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv4 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home4, GC_PORT: '7499', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
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
    console.log('  ✓ Xuất thành phẩm: phim HTML độc lập mở không cần server và diễn được; storyboard có ảnh + lời thoại');
    console.log('  ✓ Tạo asset mới: chọn khung → soát → cổng → lưu nhân vật / vật phẩm / bối cảnh vào dự án; Thư viện xếp theo dự án chủ đề');
  } catch (e) { fail = 1; console.log('  ✗ Tạo asset mới / dự án:', e.message); }
  finally { await b4.close(); srv4.kill(); }
}
// Người dùng mới: màn chọn khu → "Mở dự án mẫu" một chạm → Thư viện có dự án đủ asset → Tạo tác sẵn sàng diễn cả phim
if (!ONLY) {
  const home5 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv5 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home5, GC_PORT: '7494', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
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
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('.readybar');
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
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('.readybar');
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
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('.readybar');
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
      if (gcl.includes('thrust') || gcl.includes('combo') || !gcl.includes('punch')) throw new Error('ô action của Gia Cát Lượng: ' + gcl.join(','));
      // lỗi sống ngay cạnh hàng: đổi người ra đòn binh khí sang người tay không → báo lỗi needs, khoá nút lưu
      await q.selectOption('.sheet select[data-cell="2:actor"]', 'tq-gia-cat-luong');
      const rowErr = await q.$$eval('.sheet tr.errrow:not([hidden])', e => e.map(x => x.textContent).join(' | '));
      if (!/không làm được "thrust"/.test(rowErr) || !(await q.$eval('.sheet button:text-is("Lưu bước")', x => x.disabled))) throw new Error('không báo lỗi needs cạnh hàng / không khoá nút lưu: ' + rowErr);
      await q.selectOption('.sheet select[data-cell="2:actor"]', 'tq-trieu-van');
      await q.click('.sheet button[aria-label="Xoá bước 9"]'); await q.click('.sheet .fxchips button:text-is("Gia Cát Lượng")');
      // đổi đòn bước 3 (Triệu Vân cầm thương): thrust → sweep → lưu → tải lại trang → vẫn là sweep
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
      console.log('  ✓ Bảng bước (không cần AI): 8 bước "Đấu tập"; ô action lọc theo người làm được (Gia Cát Lượng tay không: không có thrust); lỗi needs cạnh hàng; đổi đòn → lưu qua cổng → tải lại còn');
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
      await q.selectOption('.sheet select[data-cell="2:action"]', a2 === 'thrust' ? 'sweep' : 'thrust');
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
      // Gia Cát Lượng (tay không) chọn đòn ai cũng làm được → rồi đổi sang đòn binh khí: báo vì sao + không dựng; trong ô chọn người, ai không làm được thì mờ kèm lý do
      await q.click('.libcard.act[data-action="punch"]');
      await q.selectOption('.sticky select[aria-label="Nhân vật"]', 'local.my/tq-gia-cat-luong');
      await q.click('.libcard.act[data-action="thrust"]');
      if (!/không làm được/.test(await q.textContent('.sticky .banner.bad')) || await q.$('.mstage')) throw new Error('người tay không chọn đòn binh khí: phải báo vì sao và không dựng');
      const opts = await q.$$eval('.sticky select[aria-label="Nhân vật"] option', os => os.map(o => ({ v: o.value, off: o.disabled, t: o.textContent })));
      const oG = opts.find(o => o.v === 'local.my/tq-gia-cat-luong'), oT = opts.find(o => o.v === 'local.my/tq-trieu-van');
      if (!oG || !oG.off || !/cần binh khí/.test(oG.t) || !oT || oT.off) throw new Error('ô chọn người ra đòn "thrust": Gia Cát Lượng phải mờ + "cần binh khí", Triệu Vân chọn được: ' + JSON.stringify([oG, oT]));
      await q.selectOption('.sticky select[aria-label="Nhân vật"]', 'local.my/tq-trieu-van');
      const fr = new Set(); for (let k = 0; k < 10; k++) { await q.waitForTimeout(120); fr.add(await q.getAttribute('.mstage', 'data-frame')); }
      if (fr.size < 3) throw new Error('xem trước không chạy (khung: ' + [...fr].join(',') + ')');
      const grab = async label => { const [d] = await Promise.all([q.waitForEvent('download'), q.click('.sticky .usebar button:text-is("' + label + '")')]); return { name: d.suggestedFilename(), buf: require('fs').readFileSync(await d.path()) }; };
      const png = await grab('PNG sprite sheet'), gif = await grab('GIF'), js = await grab('JSON');
      if (png.name !== 'tq-trieu-van-thrust-12fps.png' || png.buf.length < 1024 || png.buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG sprite sheet: ' + png.name + ' ' + png.buf.length + ' B');
      if (gif.buf.slice(0, 6).toString() !== 'GIF89a' || gif.buf.length < 1024) throw new Error('GIF: ' + gif.name + ' ' + gif.buf.length + ' B');
      const meta = JSON.parse(js.buf.toString());
      if (meta.format !== 'gen-chibi.anim/1' || meta.frames.length !== meta.frameCount) throw new Error('JSON timeline: ' + JSON.stringify(meta).slice(0, 160));
      // nhân vật của bộ mẫu Gen Labs: giấy phép là điều khoản bộ mẫu, KHÔNG phải "thuộc người tạo"; gói của bộ mẫu tải về mang dấu sample
      if (!/Bộ mẫu Gen Labs — chỉ để xem, thử, quay phim; không bán lại, không phân phối/.test(meta.license) || /thuộc người tạo/.test(meta.license) || !meta.sample || meta.sample.owner !== 'Gen Labs') throw new Error('giấy phép JSON của nhân vật bộ mẫu: ' + JSON.stringify([meta.license, meta.sample]));
      const [tqp] = await Promise.all([q.waitForEvent('download'), q.click('[data-pack="local.my/tq-dong-tac"] button:text-is("Tải gói (.json)")')]);
      const tqj = JSON.parse(require('fs').readFileSync(await tqp.path(), 'utf8'));
      if (!tqj.sample || tqj.sample.owner !== 'Gen Labs' || !/không bán lại/.test(tqj.sample.license) || tqj.key) throw new Error('tải gói bộ mẫu thiếu dấu sample: ' + JSON.stringify(tqj.sample));
      // đòn của khung với nhân vật của khung (không thuộc bộ mẫu nào): giữ câu cũ
      await q.click('.libcard.act[data-action="wave"]'); await q.selectOption('.sticky select[aria-label="Nhân vật"]', 'gen.khung/ma-no-canh');
      const wv = JSON.parse((await grab('JSON')).buf.toString());
      if (/Bộ mẫu/.test(wv.license) || wv.sample) throw new Error('nhân vật của khung bị ghi nhầm giấy phép bộ mẫu: ' + wv.license);
      await q.click('.libcard.act[data-action="thrust"]'); await q.selectOption('.sticky select[aria-label="Nhân vật"]', 'local.my/tq-trieu-van');
      // đòn dài: engine tự hạ fps cho đủ cả đòn (anim.fps < fps đã chọn) → Studio nói rõ, GIF / JSON / tên tệp theo fps thật; cắt cụt thì cảnh báo.
      // (giả lập engine trả về fps đã hạ + cờ truncated để kiểm phần hiển thị của Studio — phần tính fps của engine do bài test engine kiểm)
      await q.evaluate(() => { const C = GenChibi.choreo, o = C.animate; window.__animate0 = o; C.animate = function (tl, op) { const a = o.call(C, tl, { fps: Math.min(op.fps, 8) }); a.meta.requestedFps = op.fps; if (op.fps >= 24) a.meta.truncated = true; return a; }; });
      await q.click('.sticky .seg button:text-is("24 fps")');
      const fnote = await q.textContent('.sticky [data-note="fps"]');
      if (!/tự hạ còn 8 fps/.test(fnote) || !/24/.test(fnote)) throw new Error('thiếu ghi chú tự hạ fps: ' + fnote);
      if (!/bị cắt/.test(await q.textContent('.sticky [data-note="truncated"]'))) throw new Error('đòn bị cắt cụt mà không cảnh báo');
      const g8 = await grab('GIF'), j8 = await grab('JSON'), m8 = JSON.parse(j8.buf.toString());
      const dl8 = []; for (let i = 0; i < g8.buf.length - 6; i++) if (g8.buf[i] === 0x21 && g8.buf[i + 1] === 0xF9 && g8.buf[i + 2] === 4) dl8.push(g8.buf.readUInt16LE(i + 4));
      if (g8.name !== 'tq-trieu-van-thrust-8fps.gif' || m8.fps !== 8 || dl8.length !== m8.frameCount || dl8[0] < 12 || dl8[0] > 13) throw new Error('GIF / JSON phải theo fps thật (8): ' + JSON.stringify([g8.name, m8.fps, dl8.slice(0, 3), dl8.length, m8.frameCount]));
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
if (!ONLY) {
  const home5s = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv5s = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home5s, GC_PORT: '7573', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
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
if (!ONLY) {
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
if (!ONLY) {
  const R = (f) => 'file://' + path.join(ROOT, f), B = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8'));
  const shot = B.works[0].shots.find(s => s.id === 'canh-dau-tap');
  const page = path.join(home, 'duel.html');
  require('fs').writeFileSync(page, '<!doctype html><meta charset=utf-8><body style="margin:0"><div id=st style="width:960px"></div><div id=pg></div>' +
    ['engine/core.js', 'engine/render.js', 'engine/sounds.js', 'engine/audio.js', 'engine/player.js', 'engine/choreo.js', 'kinds/character/gen.core.js', 'kinds/khung/gen.khung.js', 'kinds/character/gen.choreo.js'].map(f => '<script src="' + R(f) + '"></script>').join('') +
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
if (!ONLY || ONLY === 'bubble') {
  const fs = require('fs');
  const home9 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv9 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home9, GC_PORT: '7495', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
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
    await q.goto(URL9 + 'tao-tac'); await q.waitForFunction(() => window.GenChibi && window.GenChibi.film && /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 8000 });
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
    const boot = await b9.newPage(); await boot.goto(URL9 + 'tao-tac'); await boot.waitForFunction(() => window.GenChibi && /^v\d/.test(document.getElementById('verChip').textContent));
    await boot.evaluate(async () => { for (const f of ['tam-quoc', 'van-phong-vui']) {
      const bn = await fetch('studio/mau/' + f + '.json').then(r => r.json());
      const r = await fetch('api/projects/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ bundle: bn, overwrite: true }) });
      if (!r.ok) throw new Error('nhập ' + f + ' ' + r.status);
    } });
    await boot.close();
    const TQ = 'tq-vuon-dao-xich-bich', VP = 'mau-ngay-dau-di-lam';
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
    for (const r of [rTQ, rVP, rCap, rBub, r640, r360, rMut, rSlow]) if (r.err) throw r.err;
    [rTQ, rVP, rCap, rBub, r640, r360, rMut, rSlow].forEach(r => errsAll.push(...r.errs));
    // Tam Quốc + Văn phòng vui, chế độ tự động: mọi câu sạch
    const film = [...rTQ.lines, ...rVP.lines];
    if (film.length < 40) throw new Error('chỉ đo được ' + film.length + ' câu thoại (cần ≥ 40: Tam Quốc 31 + Văn phòng vui 15)');
    const badFilm = film.flatMap(L => judge(L));
    if (badFilm.length) throw new Error(badFilm.length + ' lỗi trình bày, ví dụ: ' + badFilm.slice(0, 4).join(' | '));
    const nB = film.filter(L => L.ms[0].mode === 'bubble').length, nC = film.length - nB;
    const calls = (rTQ.calls + rVP.calls) / film.length;
    if (calls > 3) throw new Error('bố cục chạy ' + calls.toFixed(1) + ' lần mỗi câu (> 3) — nghi tính lại theo khung hình');
    const tqClose = rTQ.lines.filter(L => L.shot === 'canh-dau-tap').length;
    if (tqClose < 5) throw new Error('thiếu câu thoại ở cảnh cận "Đấu tập trước trận" (' + tqClose + ')');
    console.log('  ✓ Lời thoại hai phim mẫu (' + film.length + ' câu, đo 2 lần mỗi câu): bong bóng ' + nB + ' · phụ đề ' + nC + ' · mở khi sân khấu đứng yên, hiện ≥ 380 ms, không bong bóng rỗng · đè đầu 0 px² · trong lề an toàn ≥ 2% · chữ ≥ 85% đậm & tương phản ≥ 4,5:1 · bong bóng ≤ 38% khung · đuôi không cắt đầu / không đâm lõi mặt · Be Vietnam Pro đã nạp · bố cục ' + calls.toFixed(1) + ' lần/câu');
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
if (!ONLY || ONLY === 'lib') {
  const fs = require('fs'), crypto = require('crypto'), GV = require('../engine/voices.js'), SND = require('../engine/sounds.js'), TQ = JSON.parse(fs.readFileSync(path.join(ROOT, 'kinds/sound/tq-am.json'), 'utf8'));
  const home11 = mkdtempSync(path.join(tmpdir(), 'gc-')), PORT11 = 7662, URL11 = 'http://localhost:' + PORT11 + '/', SHOTS = process.env.GC_SHOTS || '', SCHEME = process.env.GC_SCHEME === 'light' ? 'light' : 'dark';
  const srv11 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home11, GC_PORT: String(PORT11), GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
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
    await q.goto(URL11 + 'thu-vien'); await q.waitForFunction(() => window.GenChibi && /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 8000 });
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
    await boot.goto(URL11 + 'thu-vien'); await boot.waitForFunction(() => /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 8000 });
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
      await q.goto(URL11 + 'tao-tac#/tac-pham/' + work + '/' + (tabName || 'voice')); await q.waitForFunction(() => window.GenChibi && /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 8000 });
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
if (!ONLY || ONLY === 'voice') {
  const fs = require('fs'), crypto = require('crypto'), GV = require('../engine/voices.js');
  const home10 = mkdtempSync(path.join(tmpdir(), 'gc-')), PORT10 = 7660, URL10 = 'http://localhost:' + PORT10 + '/', SHOTS = process.env.GC_SHOTS || '';
  const srv10 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home10, GC_PORT: String(PORT10), GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
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
    await page.goto(URL10 + app); await page.waitForFunction(() => window.GenChibi && /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 8000 });
    if (route) { await page.waitForSelector('.nav-item', { timeout: 8000 });   // go() đầu tiên ghi tuyến vào localStorage SAU khi verChip hiện — đợi nó xong rồi mới đặt tuyến
      await page.evaluate(([k, r]) => localStorage.setItem(k, JSON.stringify(r)), ['gc-route-' + app, route]); await page.goto(URL10 + app); await page.waitForFunction(() => /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 8000 }); }
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
    if (!/Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}(?: \d{2}\/\d{2})? · đã lồng 4\/15 câu \(4 mới · 0 có sẵn\)/.test(await dubText()) || !/Lồng tiếng AI 4\/15/.test(await dubText())) throw new Error('báo hết lượt: ' + await dubText());
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
    await q.waitForFunction(() => /Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}(?: \d{2}\/\d{2})? · đã lồng 6\/15 câu/.test(document.body.textContent), null, { timeout: 5000 });
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
    await q.waitForFunction(() => /Hết lượt hôm nay — thử lại lúc \d{2}:\d{2}(?: \d{2}\/\d{2})? · đã thiết kế 1\/3 vai/.test(document.body.textContent), null, { timeout: 15000 });
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
  } catch (e) { fail = 1; console.log('  ✗ giọng AI theo vai:', e.message); if (errs10.length) console.log('    lỗi trang:', errs10.slice(0, 3).join(' | ')); if (q) { try { console.log('    trang đang mở:', q.url(), '·', (await q.evaluate(() => document.getElementById('view').innerText)).slice(0, 240).replace(/\n/g, ' / ')); } catch (e2) { /* trang đã đóng */ } } }
  finally { await b10.close(); srv10.kill(); }
}
// ===== v0.18 — Dock "Trợ lý AI" ở cột phải (mọi khu) + Tạo tác = danh sách tác phẩm → phòng làm phim riêng =====
// LLM giả lập chuẩn OpenAI (tất định, không ra mạng ngoài); server tạm có bộ mẫu Tam Quốc. GC_ONLY=dock chỉ chạy nhóm này.
if (!ONLY || ONLY === 'dock') {
  const http11 = require('http');
  const LLM = { steps: [], reply: 'Xong.', last: null, calls: 0 };
  const mock11 = http11.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d).on('end', () => {
      const body = JSON.parse(b), done = body.messages.filter(m => m.role === 'tool').length;
      const cm = body.messages.find(m => m.role === 'user' && /^DỮ LIỆU GIAO DIỆN/.test(m.content));   // tin dữ liệu giao diện (JSON) — tách khỏi chỉ dẫn hệ thống (CNS-118)
      LLM.last = { system: body.messages[0].content, tools: body.tools.map(t => t.function.name), messages: body.messages, ctxText: cm ? cm.content : '', ctx: cm ? JSON.parse(cm.content.slice(cm.content.indexOf('\n') + 1)) : null }; LLM.calls++;
      const msg = done < LLM.steps.length
        ? { role: 'assistant', content: '', tool_calls: [{ id: 'c' + done, type: 'function', function: { name: LLM.steps[done][0], arguments: JSON.stringify(LLM.steps[done][1]) } }] }
        : { role: 'assistant', content: typeof LLM.reply === 'function' ? LLM.reply() : LLM.reply };
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  }).listen(7571, '127.0.0.1');
  const home11 = mkdtempSync(path.join(tmpdir(), 'gc-'));
  const srv11 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home11, GC_PORT: '7570', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1200));
  const U11 = 'http://localhost:7570/', H11 = { 'Content-Type': 'application/json', 'X-GC-Request': '1' };
  const b11 = await pw.chromium.launch();
  const errs11 = [];
  const open11 = async (ctx, url, vw) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs11.push(e.message)); await pg.goto(url); await pg.waitForFunction(() => window.GenChibi && /^v\d/.test(document.getElementById('verChip').textContent) && window.GCDock && window.GCDock.state().ready !== undefined, null, { timeout: 8000 }); await pg.waitForSelector('#dock .dock-ctx .path', { timeout: 8000 }); return pg; };
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
    const zones = [['xuong', 'Bàn chỉnh nhân vật', 'Xưởng', 'xuong', 'save_part', 'save_shot'], ['xuong', 'Bộ khung chuẩn', 'Bộ khung', 'khung', 'save_motion_pack', 'save_shot'],
      ['thu-vien', 'Nhân vật', 'Thư viện', 'thu-vien', 'list_characters', 'save_part'], ['tao-tac', 'Tác phẩm', 'Tạo tác', 'tao-tac', 'save_shot', null]];
    for (const [app, nav, label, zone, has, hasnt] of zones) {
      if (!new RegExp('/' + app + '$').test(new URL(q.url()).pathname)) { await q.goto(U11 + app); await q.waitForSelector('#dock .dock-ctx .path'); }
      await q.click('.nav-item:text-is("' + nav + '")', { timeout: 5000 }).catch(async () => q.click('.nav-item:has-text("' + nav + '")')); await q.waitForTimeout(350);
      if (!(await q.isVisible('#dock .dock-head')) || !/Trợ lý AI/.test(await q.textContent('#dock .dock-head'))) throw new Error('khu ' + label + ': dock không hiện');
      const path11 = await q.textContent('#dock .dock-ctx .path');
      if (path11.indexOf(label) < 0) throw new Error('khu ' + label + ': context bar ' + path11);
      LLM.steps = []; LLM.reply = 'Chào từ ' + label; await ask(q, 'Xin chào ở ' + label);
      const c = posts[posts.length - 1].context;
      if (c.zone !== zone || !LLM.last.tools.includes(has) || (hasnt && LLM.last.tools.includes(hasnt)) || LLM.last.tools.includes('update_app')) throw new Error('khu ' + label + ': context ' + JSON.stringify(c) + ' tools ' + LLM.last.tools.length);
      if (!LLM.last.ctx || LLM.last.ctx.zone_label !== label || /khu .*› trang/.test(LLM.last.system)) throw new Error('dữ liệu giao diện không nói khu ' + label + ': ' + LLM.last.ctxText.slice(0, 120));
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
    if (!/TÁC PHẨM ĐANG MỞ: id tq-vuon/.test(LLM.last.system) || !LLM.last.ctx.work || !/Từ vườn đào tới Xích Bích/.test(LLM.last.ctx.work.title) || /Từ vườn đào/.test(LLM.last.system)) throw new Error('Tạo tác: quy trình ở chỉ dẫn, hiện trạng tác phẩm ở tin dữ liệu');
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
    if (p5[0].context.zone !== 'tao-tac' || p5[0].context.object || p5[0].context.page || /TÁC PHẨM ĐANG MỞ/.test(LLM.last.system) || LLM.last.ctx.work || LLM.last.ctx.object || !LLM.last.tools.includes('save_shot')) throw new Error('bỏ ngữ cảnh: ' + JSON.stringify(p5[0].context));
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
    await new Promise(r => setTimeout(r, 1200));
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
if (!ONLY || ONLY === 'oauth') {
  const crypto = await import('crypto');
  const H = 'https://chibi.example.test', TOK = 'tok-oauth-' + crypto.randomBytes(6).toString('hex'), CB = 'https://claude.ai/api/mcp/auth_callback', ALT = 'https://agent.example.org/cb';
  const home13 = mkdtempSync(path.join(tmpdir(), 'gc-')), srv13 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home13, GC_PORT: '7664', GC_NO_AUTOCHECK: '1', GC_API_TOKEN: TOK, GC_PUBLIC_URL: H, GC_OAUTH_REDIRECTS: ALT }, stdio: 'ignore' }));
  const home14 = mkdtempSync(path.join(tmpdir(), 'gc-')), srv14 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home14, GC_PORT: '7665', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
  const home15 = mkdtempSync(path.join(tmpdir(), 'gc-')), srv15 = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home15, GC_PORT: '7666', GC_NO_AUTOCHECK: '1', GC_PUBLIC_URL: H }, stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 1500));
  const B = 'http://127.0.0.1:7664', b13 = await pw.chromium.launch();
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
    if (!/Cấp phép kết nối agent/.test(t0) || !/claude\.ai/.test(await q.textContent('#cb')) || !/tên miền quen/.test(await q.textContent('#cc'))) throw new Error('trang thiếu tiêu đề / tên miền callback / nhãn "quen": ' + t0.slice(0, 200));
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
    if (!/token chủ máy/.test(await q.textContent('#er')) || landed.length) throw new Error('token sai: phải báo lỗi và KHÔNG quay về agent');
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
    if (await q.isVisible('#warn') || !/bạn đã thêm/.test(await q.textContent('#cc')) || !/agent\.example\.org/.test(await q.textContent('#cb'))) throw new Error('callback do chủ thêm (GC_OAUTH_REDIRECTS): phải ghi rõ "bạn đã thêm" + domain: ' + await q.textContent('#cc'));
    await q.goto(B + '/oauth/authorize?' + mkq(c3, ALT).q.replace(encodeURIComponent(ALT), encodeURIComponent('https://evil.example/cb')));
    const bad = await q.textContent('main');
    if (!/không chuyển hướng/.test(bad) || landed.length || new URL(q.url()).origin !== B) throw new Error('redirect_uri lệch: phải hiện trang lỗi, không chuyển hướng');
    console.log('  ✓ Callback do chủ thêm (GC_OAUTH_REDIRECTS) → ghi rõ domain + "bạn đã thêm"; redirect_uri lệch → trang lỗi, KHÔNG chuyển hướng');
    // ---- Cài đặt › Kết nối agent
    await q.goto(B + '/xuong'); await q.waitForFunction(() => /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 8000 });
    await q.click('.nav-item:has-text("Kết nối agent")'); await q.waitForSelector('#connectUrl');
    if ((await q.textContent('#connectUrl')) !== H + '/mcp') throw new Error('địa chỉ MCP sai: ' + await q.textContent('#connectUrl'));
    const pageTxt = await q.textContent('#connectBox');
    if (!/Settings › Connectors › Add custom connector/.test(pageTxt) || !/3 bước/.test(pageTxt) || !/Ba mức quyền/.test(pageTxt) || !/Link có khoá \(cách cũ/.test(pageTxt)) throw new Error('thiếu hướng dẫn 3 bước / mức quyền / mục link cũ');
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
    await q14.goto('http://127.0.0.1:7665/xuong'); await q14.waitForFunction(() => /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 8000 });
    await q14.click('.nav-item:has-text("Kết nối agent")'); await q14.waitForSelector('#connectBox .chip');
    const off14 = await q14.textContent('#connectBox');
    if (!/Chưa bật/.test(off14) || !/GC_PUBLIC_URL/.test(off14) || await q14.$('#connectUrl')) throw new Error('thiếu GC_PUBLIC_URL: phải báo cần đặt + không có địa chỉ MCP: ' + off14.slice(0, 200));
    console.log('  ✓ Chưa đặt GC_PUBLIC_URL: Cài đặt báo "Chưa bật — cần đặt GC_PUBLIC_URL", không có địa chỉ MCP');
    // ---- máy không GC_API_TOKEN, mở ở chính máy: trang Cấp phép không đòi token
    const c5 = await reg('http://127.0.0.1:7666', 'Agent local', CB), k5 = mkq(c5), q15 = await (await b13.newContext()).newPage();
    await q15.route(/^https:\/\/claude\.ai\//, r => { landed.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: 'cb' }); });
    landed.length = 0;
    await q15.goto('http://127.0.0.1:7666/oauth/authorize?' + k5.q); await q15.waitForSelector('#ok');
    if (await q15.isVisible('#tk')) throw new Error('không GC_API_TOKEN: không cần ô token');
    await q15.click('#ok'); await q15.waitForFunction(() => location.protocol === 'https:', null, { timeout: 8000 });
    if (!new URL(landed[0]).searchParams.get('code')) throw new Error('không có code: ' + landed[0]);
    console.log('  ✓ Không đặt GC_API_TOKEN, chủ ở chính máy: Cấp phép không đòi token (như quy tắc /api cục bộ)');
    if (errs13.length) throw new Error('lỗi trang: ' + errs13.slice(0, 3).join(' | '));
  } catch (e) { fail = 1; console.log('  ✗ OAuth (trang Cấp phép + Kết nối agent):', e.message); if (errs13.length) console.log('    lỗi trang:', errs13.slice(0, 3).join(' | ')); }
  finally { await b13.close(); srv13.kill(); srv14.kill(); srv15.kill(); }
}
process.exit(fail);
