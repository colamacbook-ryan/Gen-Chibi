// Danh sách mã engine / Studio chỉ ở MỘT nơi: engine/scripts.json (v0.23 B10, CNS-054). Không cần trình duyệt.
// © 2026 Gen Labs — All rights reserved.
//  · scripts.json hợp lệ: tệp có thật, không trùng, dom ⊂ engine, đúng thư mục
//  · studio/index.html = engine + studio, ĐÚNG thứ tự (phim HTML + trang xuất video lấy danh sách engine từ chính các thẻ này)
//  · studio/video-export.html = videoPage
//  · mọi tệp .js trong engine/, kinds/, studio/ (kể cả studio/video/) đều có tên trong scripts.json — thêm tệp mà quên khai là trượt
//  · không nơi nào khác (server, tools, studio, agent) còn chép tay một danh sách ≥ 3 tệp engine — phải đọc scripts.json (ngoại lệ ghi rõ lý do bên dưới)
//  · Node (server/engine-node.js) nạp đúng engine − dom, đúng thứ tự
// Dùng: node tools/test-scripts.mjs [thư-mục-gốc]   (thư mục gốc khác: cho đột biến)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let bad = 0;
const ok = (c, msg) => { if (c) console.log('   ✓ ' + msg); else { bad = 1; console.log('   ✗ ' + msg); } };
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const M = JSON.parse(rd('engine/scripts.json'));
const arr = k => Array.isArray(M[k]) ? M[k] : [];
const ENG = arr('engine'), DOM = arr('dom'), NODE = arr('nodeModules'), STU = arr('studio'), VID = arr('videoPage'), WRK = arr('workers');
const all = ENG.concat(NODE, STU, WRK, VID.map(f => 'studio/' + f));
const dups = all.filter((f, i) => all.indexOf(f) !== i), gone = all.filter(f => !fs.existsSync(path.join(ROOT, f)));
ok(ENG.length && STU.length && VID.length && !dups.length && !gone.length && DOM.every(f => ENG.includes(f)) && ENG.every(f => /^(engine|kinds)\/[\w./-]+\.js$/.test(f))
  && NODE.every(f => /^engine\/[\w.-]+\.js$/.test(f)) && STU.concat(WRK).every(f => /^studio\/[\w./-]+\.js$/.test(f)) && VID.every(f => /^video\/[\w.-]+\.js$/.test(f)),
  'engine/scripts.json hợp lệ: ' + ENG.length + ' engine (' + DOM.length + ' cần DOM) · ' + STU.length + ' Studio · ' + VID.length + ' trang xuất video · ' + WRK.length + ' worker' + (dups.length ? ' — TRÙNG: ' + dups.join(' ') : '') + (gone.length ? ' — KHÔNG CÓ TỆP: ' + gone.join(' ') : ''));

const srcs = html => [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const diff = (got, want) => 'thừa: [' + got.filter(x => !want.includes(x)).join(' ') + '] · thiếu: [' + want.filter(x => !got.includes(x)).join(' ') + ']' + (got.length === want.length ? ' · lệch thứ tự' : '');
const IDX = srcs(rd('studio/index.html')), WANT_IDX = ENG.concat(STU);
ok(same(IDX, WANT_IDX), 'studio/index.html nạp đúng engine + studio của scripts.json, đúng thứ tự (' + IDX.length + ' thẻ)' + (same(IDX, WANT_IDX) ? '' : ' — ' + diff(IDX, WANT_IDX)));
const VX = srcs(rd('studio/video-export.html'));
ok(same(VX, VID), 'studio/video-export.html nạp đúng videoPage của scripts.json (' + VX.length + ' thẻ)' + (same(VX, VID) ? '' : ' — ' + diff(VX, VID)));

// mọi tệp .js của engine/, kinds/, studio/ phải có tên trong scripts.json
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
const files = ['engine', 'kinds', 'studio'].flatMap(walk).filter(f => f.endsWith('.js'));
const orphan = files.filter(f => !all.includes(f));
ok(!orphan.length, 'mọi tệp .js trong engine/ kinds/ studio/ (' + files.length + ') có tên trong scripts.json' + (orphan.length ? ' — CHƯA KHAI: ' + orphan.join(' ') : ''));

// không chép tay danh sách ở nơi khác: một dòng nhắc ≥ 3 tệp engine trong nháy = danh sách chép tay
const ALLOW = {
  'studio/app.js': 'engineScripts(): mẫu thẻ script TỐI THIỂU để vẽ nhân vật ngoài Studio (core + render + khung) — cố ý là tập con',
  'tools/test-sounds-app.js': 'kiểm THỨ TỰ phụ thuộc trong index.html (core < voices < sounds < audio < player) — không phải danh sách nạp',
  'tools/test-audio.mjs': 'trang thử âm thanh tối thiểu (core + sounds + audio) — cố ý là tập con',
  'tools/test-scripts.mjs': 'chính bộ kiểm này'
};
const SCAN = ['server', 'tools', 'studio', 'agent', 'cli'].flatMap(d => fs.existsSync(path.join(ROOT, d)) ? walk(d) : []).filter(f => /\.(m?js|sh|html)$|^cli\/genchibi$/.test(f)).concat(['launcher.js', 'install.sh'].filter(f => fs.existsSync(path.join(ROOT, f))));
const hand = [];
for (const f of SCAN) {
  if (ALLOW[f]) continue;
  rd(f).split('\n').forEach((l, i) => {
    const n = new Set(ENG.filter(e => l.includes("'" + e + "'") || l.includes('"' + e + '"') || l.includes('`' + e + '`'))).size;
    if (n >= 3) hand.push(f + ':' + (i + 1) + ' (' + n + ' tệp)');
  });
}
ok(!hand.length, 'không nơi nào khác chép tay danh sách mã engine (' + SCAN.length + ' tệp server / tools / studio / agent / cli; ngoại lệ có lý do: ' + Object.keys(ALLOW).length + ')' + (hand.length ? ' — CHÉP TAY: ' + hand.join(' · ') + ' → đọc engine/scripts.json (server/engine-node.js engineScripts)' : ''));

// Node nạp đúng engine − dom theo thứ tự, và engine chạy được
const EN = require(path.join(ROOT, 'server/engine-node.js'));
const nodeList = EN.engineScripts(ROOT), WANT_NODE = ENG.filter(f => !DOM.includes(f));
let GC = null; try { GC = EN.loadEngine(ROOT); } catch (e) { console.log('     ' + e.message); }
ok(same(nodeList, WANT_NODE) && GC && GC.film && GC.choreo && GC.sounds && GC.i18n, 'server/engine-node.js nạp ' + nodeList.length + ' tệp = engine − dom, đúng thứ tự; GC.film / choreo / sounds / i18n có mặt');
process.exit(bad);
