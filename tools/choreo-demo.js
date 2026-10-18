#!/usr/bin/env node
// gen-chibi — xuất một màn BIÊN ĐẠO thành trang HTML tự chạy (không cần server, không cần mạng)
// © 2026 Gen Labs — All rights reserved.
//   node tools/choreo-demo.js [demo] [ra.html] [--fragment]
//   demo mặc định: tu-long-30s (Triệu Vân, bộ mẫu Tam Quốc). --fragment: bỏ <!doctype>/<html>/<head>/<body> (trang được bọc sẵn khung)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2), frag = args.includes('--fragment'), pos = args.filter(a => !a.startsWith('--'));
const demoId = pos[0] || 'tu-long-30s', out = pos[1] || path.join(ROOT, 'choreo-' + demoId + '.html');
const SCRIPTS = ['engine/core.js', 'engine/render.js', 'engine/audio.js', 'engine/choreo.js', 'kinds/character/gen.core.js', 'kinds/khung/gen.khung.js', 'kinds/character/gen.choreo.js'];
const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau/tam-quoc.json'), 'utf8'));
const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();

// 1. dựng + đo trong Node (cùng engine với trang) — số liệu in trên trang lấy từ đây
const ctx = { window: {}, console }; vm.createContext(ctx);
SCRIPTS.filter(f => !/render|audio/.test(f)).forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
const GC = ctx.window.GenChibi;
function load(G, B) {
  G.pack({ id: 'local.my', name: 'Của tôi', owner: 'Người tạo', group: 'mine', license: 'Thuộc người tạo' }, function () {});
  B.parts.forEach(p => G.registerDataPart('local.my', p));
  B.items.forEach(x => G.registerItem('local.my', x));
  B.scenes.forEach(x => G.registerScene('local.my', x));
  B.characters.forEach(a => G.registerAsset('local.my', a));
}
load(GC, bundle);
const D = GC.choreo.demos[demoId];
if (!D) { console.error('Không có màn biên đạo ' + demoId + ' — có: ' + Object.keys(GC.choreo.demos).join(', ')); process.exit(1); }
const asset = GC.ASSETS[D.character];
if (!asset) { console.error('Thiếu nhân vật ' + D.character); process.exit(1); }
const tl = GC.choreo.build(asset, D), M = GC.choreo.measure(tl);
const chapters = tl.segments.map(s => ({ id: s.id, label: s.label, t: +GC.choreo.storyToReal(tl, s.t0).toFixed(3) }));

// 2. trang: engine nhúng thẳng (không tải gì từ ngoài) + dữ liệu bộ mẫu cần cho nhân vật + cảnh
const usedScene = D.scene.split('/')[1], usedChar = D.character.split('/')[1];
const DATA = { parts: bundle.parts, items: bundle.items, scenes: bundle.scenes.filter(s => s.id === usedScene), characters: bundle.characters.filter(a => a.id === usedChar) };
const safe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const json = v => safe(JSON.stringify(v)).replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
const f2 = v => (Math.round(v * 10) / 10).toLocaleString('vi-VN');
const tpl = fs.readFileSync(path.join(__dirname, 'choreo-demo.html'), 'utf8');
const page = tpl
  // chỗ trống của mẫu điền TRƯỚC khi nhúng engine (không quét nhầm mã engine)
  .replace(/\{\{([A-Z0-9]+)\}\}/g, (m, k) => {
    const V = { VERSION: version, REAL: f2(M.real), BEHAVIORS: M.behaviors, UNIQUE: M.unique, KEYS: M.keys, P99: f2(M.move.p99), P50: f2(M.move.p50), MAXMOVE: f2(M.move.max),
      TURNS: M.turns.n, MAXTURN: f2(M.turns.max), MINPAIR: f2(M.variety.minPair), MEANPAIR: f2(M.variety.meanPair), SLOW: f2(M.time.slowmo), HITSTOPS: M.time.hitstops, SFX: M.sfx, FX: M.fx, FACES: M.faces };
    if (k === 'SCRIPTS' || k === 'BOOT') return m;   // điền ở bước sau
    if (!(k in V)) throw new Error('mẫu trang có chỗ trống lạ ' + m);
    return String(V[k]);
  })
  // thay bằng HÀM: chuỗi thay thế thường hiểu $' $& $1 trong mã engine là mẫu đặc biệt → làm hỏng script nhúng
  .replace('{{SCRIPTS}}', () => SCRIPTS.map(f => '<script>/* ' + f + ' */\n' + safe(fs.readFileSync(path.join(ROOT, f), 'utf8')) + '\n</script>').join('\n'))
  .replace('{{BOOT}}', () => '<script>var DATA = ' + json(DATA) + ', DEMO = ' + json(demoId) + ', CHAPTERS = ' + json(chapters) + ', MEASURE = ' + json(M) + ';</script>');
const html = frag ? page.replace(/^[\s\S]*?<!--page-->/, '').replace(/<!--\/page-->[\s\S]*$/, '') : page;
fs.writeFileSync(out, html);
console.log('Đã xuất ' + out + ' (' + Math.round(html.length / 1024) + ' KB) · ' + M.behaviors + ' hành vi · ' + M.real.toFixed(2) + ' s · p99 dịch chuyển ' + M.move.p99.toFixed(1) + ' đv/khung');
