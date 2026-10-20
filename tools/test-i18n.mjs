// Kiểm thử i18n lõi (ADR 0007): engine/i18n.js (t / tr / placeholder / số nhiều / fallback / danh sách thiếu),
// server/i18n.js (langOf theo X-GC-Lang → Accept-Language → mặc định máy → en; tr; readLocales) và bảng locales/en/*.json hợp lệ.
// Dùng: node tools/test-i18n.mjs
// © 2026 Gen Labs — All rights reserved.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fail = 0;
const ok = (c, m) => { if (c) console.log('   ✓', m); else { fail = 1; console.log('   ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + (a === b ? '' : ' — nhận "' + a + '", cần "' + b + '"'));

const I = require(ROOT + '/engine/i18n.js');
// mặc định en; vi trả nguyên msgid
eq(I.lang(), 'en', 'mặc định là en');
I.add('en', { 'Lưu': 'Save', 'Đã lưu "{name}".': 'Saved "{name}".', '{n} phân cảnh': ['{n} shot', '{n} shots'], '//': 'ghi chú bị bỏ qua', 'Rỗng': '' });
eq(I.t('Lưu'), 'Save', 't tra bảng en');
eq(I.t('Đã lưu "{name}".', { name: 'Lưu Bị' }), 'Saved "Lưu Bị".', 'placeholder {name}');
eq(I.t('{n} phân cảnh', { n: 1 }), '1 shot', 'số nhiều: n = 1');
eq(I.t('{n} phân cảnh', { n: 3 }), '3 shots', 'số nhiều: n = 3');
eq(I.t('Chưa dịch {x}', { x: 5 }), 'Chưa dịch 5', 'thiếu bản dịch → msgid + placeholder');
ok(I.missing('en').includes('Chưa dịch {x}'), 'thiếu bản dịch được ghi vào missing()');
ok(!I.missing('en').includes('Lưu'), 'có bản dịch thì không nằm trong missing()');
// NGỮ CẢNH (pt, kiểu pgettext): cùng chữ Việt, hai nghĩa tiếng Anh — khoá "[ngữ cảnh] msgid"; vi giữ msgid; thiếu ngữ cảnh → rơi về bản dịch msgid trần + ghi thiếu
I.add('en', { 'Cập nhật': 'Updates', '[cột] Cập nhật': 'Updated', '{n} lần': ['{n} time', '{n} times'], '[đếm] {n} lần': ['{n} go', '{n} goes'] });
eq(I.pt('cột', 'Cập nhật'), 'Updated', 'pt: khoá có ngữ cảnh thắng');
eq(I.t('Cập nhật'), 'Updates', 'pt: không ảnh hưởng t() của msgid trần');
eq(I.pt('lạ', 'Cập nhật'), 'Updates', 'pt: thiếu ngữ cảnh → bản dịch msgid trần');
ok(I.missing('en').includes('[lạ] Cập nhật'), 'pt: thiếu ngữ cảnh được ghi vào missing() (khoá có ngữ cảnh)');
eq(I.pt('đếm', '{n} lần', { n: 2 }), '2 goes', 'pt: số nhiều + placeholder theo ngữ cảnh');
eq(I.ptr('vi', 'cột', 'Cập nhật'), 'Cập nhật', 'pt: tiếng Việt luôn là msgid (không lộ ngữ cảnh)');
eq(I.ctxKey('cột', 'Cập nhật'), '[cột] Cập nhật', 'ctxKey: dạng khoá trong locales');
eq(I.t('Rỗng'), 'Rỗng', 'bản dịch rỗng = coi như thiếu (không hiện chuỗi trống)');
ok(!I.has('en', '//'), 'khoá "//" (ghi chú) không nạp');
eq(I.t('Giữ {lạ} và {y}', { y: undefined }), 'Giữ {lạ} và undefined', 'placeholder: không có khoá thì giữ nguyên, có khoá thì String() như phép cộng chuỗi cũ');
I.clearMissing();
eq(I.label('Lưu Bị'), 'Lưu Bị', 'label(): nội dung người dùng giữ nguyên');
ok(!I.missing('en').length, 'label() không ghi missing');
eq(I.label('Lưu'), 'Save', 'label(): có bản dịch thì dịch');
I.setLang('vi');
eq(I.t('Lưu'), 'Lưu', 'vi trả nguyên msgid');
eq(I.t('Đã lưu "{name}".', { name: 'A' }), 'Đã lưu "A".', 'vi vẫn thay placeholder');
eq(I.t('{n} phân cảnh', { n: 1 }), '1 phân cảnh', 'vi: số nhiều không đổi msgid');
eq(I.setLang('xx'), 'vi', 'setLang ngôn ngữ lạ: giữ ngôn ngữ cũ');
eq(I.setLang('en-GB'), 'en', 'setLang chuẩn hoá en-GB → en');
eq(I.tr('vi', 'Lưu'), 'Lưu', 'tr(lang) không phụ thuộc ngôn ngữ chung');
eq(I.lang(), 'en', 'tr không đổi ngôn ngữ chung');
eq(I.locale('vi'), 'vi-VN', 'locale vi'); eq(I.locale('en'), 'en-GB', 'locale en');
eq(I.N('Bảng hằng'), 'Bảng hằng', 'N() trả nguyên msgid');
eq(I.add('vi', { a: 'b' }), 0, 'không nạp bảng cho ngôn ngữ nguồn');

// server: langOf + tr
const L = require(ROOT + '/server/i18n.js');
const rq = hd => ({ headers: hd });
eq(L.langOf(rq({ 'x-gc-lang': 'vi', 'accept-language': 'en' }), 'en'), 'vi', 'langOf: X-GC-Lang thắng Accept-Language');
eq(L.langOf(rq({ 'x-gc-lang': 'xx', 'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8' }), 'en'), 'vi', 'langOf: X-GC-Lang lạ → Accept-Language');
eq(L.langOf(rq({ 'accept-language': 'de-DE,de;q=0.9,en;q=0.8,vi;q=0.5' }), 'vi'), 'en', 'langOf: Accept-Language chọn ngôn ngữ hỗ trợ q cao nhất');
eq(L.langOf(rq({ 'accept-language': 'de,fr' }), 'vi'), 'vi', 'langOf: Accept-Language không có ngôn ngữ hỗ trợ → mặc định máy');
eq(L.langOf(rq({}), ''), 'en', 'langOf: không có gì → en');
eq(L.langOf(null, 'vi'), 'vi', 'langOf: không có req → mặc định máy');
const all = L.readLocales(ROOT);
ok(all.en && typeof all.en === 'object', 'readLocales đọc được locales/en');
L.load(ROOT);
const k = Object.keys(all.en).find(x => x.slice(0, 2) !== '//' && typeof all.en[x] === 'string');
if (k) { eq(L.tr('en', k), all.en[k], 'tr(en) dùng bảng locales'); eq(L.tr('vi', k), k, 'tr(vi) trả msgid'); }
eq(L.label('en', 'Tên do người dùng đặt'), 'Tên do người dùng đặt', 'label() server: không dịch được thì giữ nguyên');

// mọi tệp bảng: JSON hợp lệ, giá trị là chuỗi (hoặc [một, nhiều]), giữ đủ placeholder của msgid
for (const f of fs.readdirSync(path.join(ROOT, 'locales/en')).filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/en', f), 'utf8'));
  const bad = [];
  for (const [m, v] of Object.entries(j)) {
    if (m.slice(0, 2) === '//') continue;
    const vs = Array.isArray(v) ? v : [v];
    if (!vs.length || vs.some(x => typeof x !== 'string' || !x.trim())) { bad.push(m + ' → giá trị rỗng / sai kiểu'); continue; }
    const need = (m.match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join();
    vs.forEach(x => { const have = [...new Set(x.match(/\{[A-Za-z0-9_]+\}/g) || [])].sort().join(); if ([...new Set(need.split(','))].filter(Boolean).sort().join() !== have) bad.push(m + ' → placeholder lệch: ' + have); });
  }
  ok(!bad.length, 'locales/en/' + f + ': ' + Object.keys(j).length + ' khoá hợp lệ, giữ đủ placeholder' + (bad.length ? '\n      ' + bad.slice(0, 10).join('\n      ') : ''));
}

// vm của server: engine có GC.i18n, ngôn ngữ chung giữ vi (câu engine không đổi so với trước)
const { loadEngine } = require(ROOT + '/server/engine-node.js');
const GC = loadEngine(ROOT);
ok(GC.i18n && GC.i18n.lang() === 'vi', 'loadEngine: GC.i18n có trong vm, ngôn ngữ chung = vi');

const VI_CH = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
// LOG VẬN HÀNH TIẾNG ANH (CNS-156): người vận hành đọc `genchibi logs` đúng lúc app lỗi. Chuỗi trong lời gọi console.* / log() / this.log() của
// server + launcher, và mọi chuỗi mở đầu bằng nhãn log "[oauth] …", không có chữ Việt. Câu trả lời cho Studio / agent (fail / send) có bảng dịch riêng — không tính
{
  const { tokenize } = await import('./i18n-scan.mjs');
  const files = fs.readdirSync(path.join(ROOT, 'server')).filter(f => f.endsWith('.js')).map(f => 'server/' + f).concat('launcher.js');
  const bad = [], isStr = t => t && (t.type === 'str' || t.type === 'tpl');
  for (const f of files) {
    const T = tokenize(fs.readFileSync(path.join(ROOT, f), 'utf8')).filter(t => t.type !== 'ws' && t.type !== 'comment');
    const v = k => T[k] ? T[k].value : '';
    for (let i = 0; i < T.length; i++) {
      let open = -1;
      if (v(i) === 'console' && v(i + 1) === '.' && /^(log|warn|error|info)$/.test(v(i + 2)) && v(i + 3) === '(') open = i + 3;
      else if (v(i) === 'log' && v(i + 1) === '(' && (v(i - 1) !== '.' || v(i - 2) === 'this')) open = i + 1;
      if (open < 0) { if (isStr(T[i]) && /^.\[[a-z0-9]+\]/.test(v(i)) && VI_CH.test(v(i))) bad.push(f + ':' + T[i].line + ' ' + v(i).slice(0, 70)); continue; }
      for (let d = 0, j = open; j < T.length; j++) {
        if (v(j) === '(') d++; else if (v(j) === ')' && --d === 0) break;
        if (isStr(T[j]) && VI_CH.test(v(j))) bad.push(f + ':' + T[j].line + ' ' + v(j).slice(0, 70));
      }
    }
  }
  ok(!bad.length, 'log vận hành của server + launcher viết tiếng Anh (console.* / log() / "[nhãn] …") — ' + files.length + ' tệp' + (bad.length ? '\n      ' + bad.slice(0, 12).join('\n      ') : ''));
  const dc = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  ok(!VI_CH.test(dc) && /GC_MASTER_KEY:\?GC_MASTER_KEY missing in \.env/.test(dc), 'docker-compose.yml (chép vào thư mục cài) không có chữ Việt; thiếu GC_MASTER_KEY báo tiếng Anh');
}

// HỢP ĐỒNG GC_LANG + QUY TẮC NÂNG CẤP (server/main.js initUiLang): dựng server thật trên GC_HOME tạm, đọc /api/info › uiLang
// Một nguồn sự thật = settings.uiLang; GC_LANG chỉ là giá trị khởi tạo / ghi đè có chủ ý (Q24 · CNS-152 / 153)
const { spawn } = await import('child_process');
const os = await import('os');
let port = 7681;
// put: chuỗi = Studio đổi mặc định ({ uiLang }); đối tượng = thân PUT nguyên văn (genchibi lang gửi { uiLang, uiLangEnv }); mảng = nhiều PUT lần lượt trong CÙNG một lần chạy
async function boot(home, lang, put) {
  const p = port++, out = [];
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: String(p), GC_NO_AUTOCHECK: '1', GC_LANG: lang || '', GC_API_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => out.push(String(d)));
  try {
    const U = 'http://127.0.0.1:' + p;
    for (let i = 0; i < 80; i++) { try { if ((await fetch(U + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 100)); }
    // v0.21: GC_API_TOKEN rỗng → server tự sinh data/owner-token (CNS-195) — harness đọc tệp đó làm token chủ như CLI
    const OWN = { Authorization: 'Bearer ' + fs.readFileSync(path.join(home, 'data/owner-token'), 'utf8').trim() };
    let putStatus = 0;
    for (const x of put ? [].concat(put) : []) putStatus = (await fetch(U + '/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1', ...OWN }, body: JSON.stringify(typeof x === 'string' ? { uiLang: x } : x) })).status;
    const info = await (await fetch(U + '/api/info', { headers: OWN })).json();
    return { uiLang: info.uiLang, putStatus, log: out.join(''), file: fs.existsSync(path.join(home, 'data/settings.json')) ? JSON.parse(fs.readFileSync(path.join(home, 'data/settings.json'), 'utf8')) : null };
  } finally { srv.kill(); await new Promise(r => srv.once('exit', r)); }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gc-i18n-'));
{ const h = tmp(); const r = await boot(h);
  ok(r.uiLang === 'en' && r.file && r.file.uiLang === 'en' && !r.file.uiLangEnv && !/upgrade/.test(r.log), 'bản cài mới (data trống, không GC_LANG) → en, ghi settings.uiLang = en MỘT lần (không log nâng cấp)');
  const { Store } = require(ROOT + '/server/store.js'); new Store(path.join(h, 'data')).saveWork({ id: 'moi', title: 'My film', shots: [] });
  const r2 = await boot(h); ok(r2.uiLang === 'en' && !/upgrade/.test(r2.log), 'bản cài mới không GC_LANG, tạo tác phẩm rồi khởi động lại → vẫn en (không bị coi là bản ≤ v0.19)'); }
{ const h = tmp(); fs.mkdirSync(path.join(h, 'data'), { recursive: true }); fs.writeFileSync(path.join(h, 'data/settings.json'), JSON.stringify({ autoUpdate: true, checkHours: 6 }));
  const r = await boot(h), r2 = await boot(h);
  ok(r.uiLang === 'vi' && r.file && r.file.uiLang === 'vi' && /\[i18n\] upgrade of an existing install/.test(r.log), 'nâng cấp ≤ v0.19 (settings.json có sẵn) → giữ vi, ghi settings.uiLang = vi + log một dòng');
  ok(!VI_CH.test(r.log), 'log khởi động của server tiếng Anh (CNS-156)' + (VI_CH.test(r.log) ? ': ' + r.log.split('\n').filter(l => VI_CH.test(l)).slice(0, 3).join(' | ') : ''));
  ok(r2.uiLang === 'vi' && !/upgrade/.test(r2.log), 'migration chỉ chạy MỘT lần (lần khởi động sau không ghi lại)'); }
{ const h = tmp(); const { Store } = require(ROOT + '/server/store.js'); new Store(path.join(h, 'data')).saveWork({ id: 'cu', title: 'Phim cũ', shots: [] });
  const r = await boot(h);
  ok(r.uiLang === 'vi', 'nâng cấp: chưa có settings.json nhưng đã có tác phẩm → vi'); }
// CNS-152 D: bản cài cũ chỉ có dự án / asset / vật phẩm / bối cảnh / gói / linh kiện (không tác phẩm, không settings.json) cũng là "có dữ liệu"
for (const [what, f, body] of [['dự án (projects.json)', 'projects.json', [{ id: 'p1', name: 'P1' }]], ['asset', 'assets/local.my~a.json', { id: 'a' }], ['linh kiện', 'parts/hat~mu.json', { id: 'mu' }],
  ['vật phẩm', 'items/kiem.json', { id: 'kiem' }], ['bối cảnh', 'scenes/san.json', { id: 'san' }], ['gói động tác', 'motionpacks/m1.json', { id: 'm1' }], ['gói âm', 'soundpacks/s1.json', { id: 's1' }]]) {
  const h = tmp(); fs.mkdirSync(path.dirname(path.join(h, 'data', f)), { recursive: true }); fs.writeFileSync(path.join(h, 'data', f), JSON.stringify(body));
  const r = await boot(h); ok(r.uiLang === 'vi' && r.file && r.file.uiLang === 'vi', 'nâng cấp: chỉ có ' + what + ' → vi');
}
{ const h = tmp(); fs.mkdirSync(path.join(h, 'data'), { recursive: true }); fs.writeFileSync(path.join(h, 'data/settings.json'), JSON.stringify({ autoUpdate: true }));
  const r = await boot(h, 'en');
  ok(r.uiLang === 'en', 'bản cài cũ nhưng người cài CHỌN RÕ GC_LANG=en (--lang en / genchibi lang en) → en (lựa chọn có chủ ý thắng luật nâng cấp)'); }
{ const h = tmp();
  const a = await boot(h, 'vi'); ok(a.uiLang === 'vi' && a.file.uiLangEnv === 'vi', 'GC_LANG=vi lúc cài → mặc định máy vi');
  const b = await boot(h, 'vi', 'en'); ok(b.uiLang === 'en', 'Studio PUT uiLang=en đổi mặc định máy');
  const c = await boot(h, 'vi'); ok(c.uiLang === 'en', 'khởi động lại, GC_LANG không đổi → giữ lựa chọn của Studio (en)');
  // probe C (CNS-153): .env vẫn vi, Studio đã đặt en → `genchibi lang vi` gửi { uiLang: vi, uiLangEnv: vi } → khởi động lại vẫn vi
  const c2 = await boot(h, 'vi', { uiLang: 'vi', uiLangEnv: 'vi' }), c3 = await boot(h, 'vi');
  ok(c2.putStatus === 200 && c2.uiLang === 'vi' && c3.uiLang === 'vi', 'Studio en + `genchibi lang vi` (PUT uiLang + uiLangEnv) → vi ngay và sau khởi động lại');
  const d = await boot(h, 'en'), e = await boot(h, 'vi'); ok(d.uiLang === 'en' && e.uiLang === 'vi', 'genchibi lang đổi GC_LANG (app dừng) → lần khởi động đó thắng (en rồi vi)');
  const g = await boot(h, ''); ok(g.uiLang === 'vi', 'GC_LANG rỗng / không đặt → giữ settings.uiLang'); }
{ const h = tmp();
  // app chạy với GC_LANG=en; `genchibi lang vi` ghi .env + PUT { uiLang: vi, uiLangEnv: vi }; SAU đó Studio đổi en → khởi động lại với GC_LANG=vi KHÔNG đè lựa chọn của Studio
  await boot(h, 'en'); const a = await boot(h, 'en', [{ uiLang: 'vi', uiLangEnv: 'vi' }, 'en']); const c = await boot(h, 'vi');
  ok(a.uiLang === 'en' && c.uiLang === 'en', 'giá trị .env đã áp qua API không bị áp lại khi khởi động: lựa chọn Studio làm SAU lệnh CLI (cùng lần chạy) được giữ'
    + (c.uiLang === 'en' ? '' : ' — nhận ' + c.uiLang));
  const bad = await boot(h, 'vi', { uiLangEnv: 'fr' }); ok(bad.putStatus === 400, 'PUT uiLangEnv lạ → 400'); }
process.exit(fail);
