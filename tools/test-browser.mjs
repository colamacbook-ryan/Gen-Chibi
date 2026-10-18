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
const home = mkdtempSync(path.join(tmpdir(), 'gc-'));
const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: '7496', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' });
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
  const srv2 = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home2, GC_PORT: '7497', GC_NO_AUTOCHECK: '1', GC_API_TOKEN: 'tok-test-123' }, stdio: 'ignore' });
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
  const srv3 = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home3, GC_PORT: '7498', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' });
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
  const srv4 = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home4, GC_PORT: '7499', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' });
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
  const srv5 = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home5, GC_PORT: '7494', GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' });
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
    console.log('  ✓ Bộ chủ đề mẫu Tam Quốc một chạm: 7 tướng · 13 trang bị · 8 bối cảnh · dấu bộ mẫu Gen Labs (không xuất bán) → phim 6/6 phân cảnh sẵn sàng (có màn đấu)');
  } catch (e) { fail = 1; console.log('  ✗ dự án mẫu một chạm:', e.message); }
  finally { await b5.close(); srv5.kill(); }
}
// Biên đạo liên hoàn: trang "Tử Long 30 giây" xuất bằng tools/choreo-demo.js chạy độc lập (file://), không lỗi, phát thật,
// khung vẽ rẻ (≤ 8 ms), nhân vật đổi góc nhìn + nét mặt khi diễn, tua được, âm thanh bật khi bấm xem
{
  const out = path.join(home, 'choreo.html');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/choreo-demo.js'), 'tu-long-30s', out], { stdio: 'ignore' });
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
    '<script>var B=' + JSON.stringify({ parts: B.parts, items: B.items, scenes: B.scenes, characters: B.characters }) + ',SHOT=' + JSON.stringify(shot) + ';var GC=window.GenChibi;' +
    'GC.pack({id:"local.my",name:"x",owner:"x",group:"mine",license:"x"},function(){});B.parts.forEach(function(p){GC.registerDataPart("local.my",p)});B.items.forEach(function(x){GC.registerItem("local.my",x)});' +
    'B.scenes.forEach(function(x){GC.registerScene("local.my",x)});B.characters.forEach(function(a){GC.registerAsset("local.my",a)});' +
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
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Biên đạo trong phim: "Đấu tập trước trận" diễn ' + seen.acts.size + ' màn (' + [...seen.acts].join(', ') + ') · chữ va chạm ' + [...seen.words].join(' ') + ' · ' + seen.xs.size + ' thế đứng · dọn lớp hiệu ứng');
  } catch (e) { fail = 1; console.log('  ✗ biên đạo trong phim:', e.message); }
  finally { await b7.close(); }
}
process.exit(fail);
