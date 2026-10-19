// Kiểm thử trong trình duyệt (chạy cục bộ, cần Playwright): mọi lớp gắn vào đầu phải đi cùng đầu.
// Dùng: node tools/test-browser.mjs   (tự dựng server tạm ở cổng 7496)
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Store } = require('../server/store.js');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// server con do test dựng: tắt hết khi thoát — kể cả khi test sập giữa chừng (L-55: server sót lại khiến lần chạy sau dùng nhầm dữ liệu cũ)
const kids = []; const kid = c => { kids.push(c); return c; };
process.on('exit', () => kids.forEach(c => { try { c.kill(); } catch (e) { /* đã tắt */ } }));
process.on('uncaughtException', e => { console.error(e); process.exit(1); });
const home = mkdtempSync(path.join(tmpdir(), 'gc-'));
const srv = kid(spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: '7496', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' }));
await new Promise(r => setTimeout(r, 1200));
const b = await pw.chromium.launch();
const p = await b.newPage();
let fail = 0;
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
// Bản cài có token: Studio phải hiện màn đăng nhập (không lùi về chế độ xem thử), nhập đúng token thì vào được.
{
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
{
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
      if (zone === 'lib' && /zone-lib/.test(cls)) {
        // Thư viện không bày đồ của khung: bản cài mới thì trống (có lời dẫn); có asset đã tạo thì có thẻ + khu Dùng
        const cards = await q.$$('.libcard'), use = await q.$$('.usebar'), code = await q.$('textarea.code'), empty = await q.$('.lib-empty');
        if (!empty && (!cards.length || use.length < 2 || !code)) throw new Error('thư viện "' + label + '" thiếu thẻ hoặc khu Dùng');
        if (cards.length && await q.$('.libcard img[alt="Ma-nơ-canh"]')) throw new Error('thư viện "' + label + '" bày đồ của khung');
        if (code) { const txt = await code.inputValue(); if (!/\//.test(txt)) throw new Error('thư viện "' + label + '": mã tham chiếu rỗng'); }
      }
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
{
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
      localStorage.setItem('gc-route-tao-tac', JSON.stringify({ page: 'works' }));
    });
    await q.goto('http://localhost:7499/tao-tac'); await q.waitForTimeout(900);
    if ((await q.$$('.stillgrid .libcard img')).length !== 2 || (await q.$$('.shot')).length !== 2) throw new Error('trang Tác phẩm thiếu phân cảnh / cảnh thành phẩm');
    await q.click('button:has-text("Diễn toàn bộ")'); await q.waitForTimeout(300);
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
{
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
    await q.goto('http://localhost:7494/tao-tac'); await q.waitForSelector('.readybar');
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
    await q.click('button:has-text("Diễn toàn bộ")');
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
    await q.click('button:has-text("⟳ Cập nhật Tam Quốc")'); await q.waitForURL(/\/thu-vien$/); await q.waitForTimeout(800);
    if (await q.$('button:has-text("⟳ Cập nhật Tam Quốc")')) throw new Error('cập nhật xong vẫn còn mời cập nhật');
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
    const ff = await b5.newPage({ viewport: { width: 1280, height: 900 } }), fe = [];
    ff.on('pageerror', e => fe.push(e.message)); ff.on('requestfailed', r => fe.push('mạng: ' + r.url()));
    await ff.goto('file://' + fpath); await ff.waitForTimeout(500);
    const fr = await ff.evaluate(() => ({
      chapters: document.querySelectorAll('#chapters li').length,
      missing: GenChibi.film.readiness(FILM).filter(x => !x.ok).map(x => x.shot.id + ': ' + x.missing.join('+')),
      warn: GenChibi.film.direct(FILM.shots.find(s => s.id === 'canh-dau-tap')).warnings
    }));
    await ff.close();
    if (fr.chapters !== 6 || fr.missing.length || fr.warn.length) throw new Error('phim Tam Quốc xuất ra: ' + fr.chapters + '/6 chương, thiếu ' + JSON.stringify(fr.missing) + ', cảnh báo ' + JSON.stringify(fr.warn));
    if (fe.length) throw new Error('phim xuất ra lỗi: ' + fe.slice(0, 3).join(' | '));
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Phim HTML Tam Quốc: DATA.motionPacks có tq-dong-tac · mở file:// đủ 6/6 chương, màn đấu không thiếu đòn');
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
// Biên đạo liên hoàn: trang "Tử Long 30 giây" xuất bằng tools/choreo-demo.js chạy độc lập (file://), không lỗi, phát thật,
// khung vẽ rẻ (≤ 8 ms), nhân vật đổi góc nhìn + nét mặt khi diễn, tua được, âm thanh bật khi bấm xem
{
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
{
  const R = (f) => 'file://' + path.join(ROOT, f), B = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8'));
  const shot = B.works[0].shots.find(s => s.id === 'canh-dau-tap');
  const page = path.join(home, 'duel.html');
  require('fs').writeFileSync(page, '<!doctype html><meta charset=utf-8><body style="margin:0"><div id=st style="width:960px"></div><div id=pg></div>' +
    ['engine/core.js', 'engine/render.js', 'engine/audio.js', 'engine/player.js', 'engine/choreo.js', 'kinds/character/gen.core.js', 'kinds/khung/gen.khung.js', 'kinds/character/gen.choreo.js'].map(f => '<script src="' + R(f) + '"></script>').join('') +
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
process.exit(fail);
