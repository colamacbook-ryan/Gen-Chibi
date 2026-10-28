// Golden render (v0.26): nhân vật CŨ phải dựng ra SVG GIỐNG HỆT TỪNG BYTE sau mọi thay đổi engine (tương thích ngược — Gen-Studio 0.2.0 vendor engine này).
// Mỗi ca = sha256 của svgString: ma-nơ-canh của khung + 3 nhân vật Tam Quốc × (trạng thái · hoạt động · góc nhìn · thời điểm · hướng).
// Cập nhật CHỦ ĐÍCH (khi cố ý đổi hình vẽ): node tools/test-golden.mjs --update  — rồi ghi lý do vào CHANGELOG.
// © 2026 Gen Labs — All rights reserved.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = path.join(ROOT, 'tools/fixtures/golden/render-hashes.json');
const { loadEngine } = require(ROOT + '/server/engine-node.js');
const GC = loadEngine(ROOT);
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8'));
GC.pack({ id: 'local.my', name: 'golden', owner: 'golden', group: 'mine', license: 'x' }, function () {});
B.parts.forEach(p => { const r = GC.registerDataPart('local.my', p); if (r.errors.length) throw new Error(p.id + ': ' + r.errors.join('; ')); });
B.characters.forEach(a => GC.registerAsset('local.my', a));
const chars = [GC.getAsset('gen.khung/ma-no-canh')].concat(['tq-quan-vu', 'tq-tao-thao', 'tq-gia-cat-luong'].map(id => GC.getAsset('local.my/' + id)));
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);
const cases = {};
chars.forEach(a => {
  const id = a.key;
  ['normal', 'rage', 'cry', 'smug', 'think'].forEach(s => { cases[id + ' state=' + s] = GC.svgString(a, s); });
  cases[id + ' crop'] = GC.svgString(a, 'normal', { crop: true, noShadow: true });
  ['left', 'right', 'left45', 'right45', 'left90', 'left135', 'back'].forEach(v => { cases[id + ' view=' + v] = GC.svgString(a, 'normal', { director: { view: v } }); });
  ['walk', 'run', 'attack', 'sit-chair', 'lie', 'victory', 'wave', 'point', 'eat', 'jump'].forEach(act => {
    cases[id + ' act=' + act + ' t=0'] = GC.svgString(a, 'normal', { director: { activity: act } });
    cases[id + ' act=' + act + ' t=0.37 left'] = GC.svgString(a, 'normal', { director: { activity: act, facing: 'left' }, t: 0.37 });
  });
  cases[id + ' act=run view=left45 t=0.21'] = GC.svgString(a, 'vow', { director: { activity: 'run', view: 'left45' }, t: 0.21 });
});
const got = {};
Object.keys(cases).forEach(k => { got[k] = hash(cases[k]); });
if (process.argv.includes('--update')) { fs.writeFileSync(FILE, JSON.stringify(got, null, 1) + '\n'); console.log('   đã ghi ' + Object.keys(got).length + ' ca golden → ' + path.relative(ROOT, FILE)); process.exit(0); }
const want = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const diff = Object.keys(want).filter(k => want[k] !== got[k]), extra = Object.keys(got).filter(k => !(k in want));
if (diff.length || extra.length) {
  console.log('   ✗ golden render: ' + diff.length + ' ca đổi byte, ' + extra.length + ' ca mới chưa có trong fixture');
  diff.slice(0, 8).forEach(k => console.log('     · ' + k));
  process.exit(1);
}
console.log('   ✓ golden render: ' + Object.keys(want).length + ' ca (ma-nơ-canh + 3 nhân vật Tam Quốc × trạng thái / góc / hoạt động / thời điểm) dựng giống hệt từng byte');
