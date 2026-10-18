// Kiểm thử trong trình duyệt (chạy cục bộ, cần Playwright): mọi lớp gắn vào đầu phải đi cùng đầu.
// Dùng: node tools/test-browser.mjs   (tự dựng server tạm ở cổng 7496)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
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
    await q.goto('http://localhost:7498/');
    await q.waitForFunction(() => /^v\d/.test(document.getElementById('verChip').textContent), null, { timeout: 5000 });
    await q.waitForSelector('.nav-group.zone-make', { timeout: 5000 });
    const zones = await q.$$eval('.nav-group', els => els.map(e => e.className));
    if (!['zone-lib', 'zone-make', 'zone-fab'].every(k => zones.some(z => z.indexOf(k) >= 0))) throw new Error('thiếu lớp Thư viện / Tạo tác / Xưởng trong điều hướng');
    const pages = await q.$$eval('.nav-item', els => els.length);
    for (let i = 0; i < pages; i++) {
      const btn = (await q.$$('.nav-item'))[i]; const label = (await btn.textContent()).trim();
      await btn.click(); await q.waitForTimeout(350);
      const zone = await q.evaluate(() => document.body.getAttribute('data-zone')), tag = await q.textContent('.zone-tag');
      if (!zone || !tag) throw new Error('trang "' + label + '" thiếu nhãn khu');
      if (zone === 'lib') {
        // Thư viện không bày đồ của khung: bản cài mới thì trống (có lời dẫn); có asset đã tạo thì có thẻ + khu Dùng
        const cards = await q.$$('.libcard'), use = await q.$$('.usebar'), code = await q.$('textarea.code'), empty = await q.$('.lib-empty');
        if (!empty && (!cards.length || use.length < 2 || !code)) throw new Error('thư viện "' + label + '" thiếu thẻ hoặc khu Dùng');
        if (cards.length && await q.$('.libcard img[alt="Ma-nơ-canh"]')) throw new Error('thư viện "' + label + '" bày đồ của khung');
        if (code) { const txt = await code.inputValue(); if (!/\//.test(txt)) throw new Error('thư viện "' + label + '": mã tham chiếu rỗng'); }
      }
      if (label === 'Bộ khung chuẩn' && (await q.$$('.libcard')).length < 10) throw new Error('trang Bộ khung chuẩn thiếu khối vật phẩm');
    }
    await q.click('.nav-item:has-text("Diễn thử một cảnh")'); await q.waitForTimeout(300);
    await q.selectOption('select[aria-label="Cảnh"]', 'afi.khung/san-khau-chuan'); await q.click('button:text-is("Diễn")'); await q.waitForTimeout(600);
    const actors = await q.$$('.dscene .actor'), picked = await q.$$('.fxchips button[aria-pressed="true"]');
    if (!actors.length || actors.length !== picked.length) throw new Error('sân khấu cảnh: ' + actors.length + ' diễn viên / ' + picked.length + ' được chọn');
    // hồi quy: mã nhúng web không để tên do agent đặt thoát khỏi <script>
    await q.evaluate(async () => {
      const a = JSON.parse(JSON.stringify(window.GenChibi.ASSETS['afi.khung/ma-no-canh']));
      Object.assign(a, { id: 'xss-ci', pack: 'local.my', name: '</script><img src=x onerror=alert(1)>', status: 'draft' }); delete a.key;
      const r = await fetch('api/assets/local.my/xss-ci', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify(a) });
      if (!r.ok) throw new Error('không lưu được nhân vật thử: ' + r.status);
      localStorage.setItem('gc-route', JSON.stringify({ page: 'lib-characters', key: 'local.my/xss-ci' }));
    });
    await q.reload(); await q.waitForTimeout(900);
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
      localStorage.setItem('gc-route', JSON.stringify({ page: 'create', project: 'ci-du-an' }));
    });
    await q.reload(); await q.waitForTimeout(700);
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
    await q.click('.nav-item:has-text("Dự án chủ đề")'); await q.waitForTimeout(500);
    const card = await q.textContent('.libcard.proj');
    if (!/Dự án CI/.test(card) || !/1 nhân vật · 1 trang bị · 1 cảnh/.test(card)) throw new Error('trang dự án: ' + card);
    await q.click('.nav-item.zone-lib:has-text("Trang bị")'); await q.waitForTimeout(400);
    if (!(await q.$('.seg button:has-text("Dự án · Dự án CI")'))) throw new Error('Thư viện không có mục theo dự án');
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    // Giai đoạn ③: Tác phẩm — phân cảnh (bối cảnh + diễn viên + lời thoại) → cảnh thành phẩm → sân khấu final diễn cả chuỗi
    await q.evaluate(async () => {
      const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify(b) }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
      await post('api/works', { title: 'Phim CI', project: 'ci-du-an' });
      for (const t of ['Một', 'Hai']) await post('api/works/phim-ci/shots', { shot: { title: 'Cảnh ' + t, scene: 'afi.khung/san-khau-chuan', cast: ['ma-no-canh'], event: { title: t, steps: [{ actor: 'ma-no-canh', state: 'shock', spot: 'center', say: 'Cảnh ' + t, hold: 1 }] } } });
      localStorage.setItem('gc-route', JSON.stringify({ page: 'works' }));
    });
    await q.reload(); await q.waitForTimeout(900);
    if ((await q.$$('.stillgrid .libcard img')).length !== 2 || (await q.$$('.shot')).length !== 2) throw new Error('trang Tác phẩm thiếu phân cảnh / cảnh thành phẩm');
    await q.click('button:has-text("Diễn toàn bộ")'); await q.waitForTimeout(300);
    if (!(await q.$('.dscene .titlecard'))) throw new Error('sân khấu final không mở bằng thẻ tiêu đề phân cảnh');
    await q.waitForSelector('.dscene .actor .bubble', { timeout: 4000 });
    if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
    console.log('  ✓ Tác phẩm: phân cảnh → cảnh thành phẩm → sân khấu final diễn cả chuỗi (thẻ tiêu đề + diễn viên + thoại)');
    console.log('  ✓ Tạo asset mới: chọn khung → soát → cổng → lưu nhân vật / vật phẩm / bối cảnh vào dự án; Thư viện xếp theo dự án chủ đề');
  } catch (e) { fail = 1; console.log('  ✗ Tạo asset mới / dự án:', e.message); }
  finally { await b4.close(); srv4.kill(); }
}
process.exit(fail);
