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
process.exit(fail);
