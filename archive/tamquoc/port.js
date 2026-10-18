#!/usr/bin/env node
// Dựng lại Tam Quốc thành DỰ ÁN CHỦ ĐỀ tạo từ khung — công cụ dev, chạy một lần, không nằm trong gói phát hành.
//   node archive/tamquoc/port.js            → ghi studio/mau/tam-quoc.json (gói gen-chibi.project/1)
// Cách làm: nạp bộ Tam Quốc v0.5 (code) vào một VM riêng, dựng từng linh kiện với BẢNG MÀU TOKEN ({robe}…) và dáng đầu {shape},
// thay phép chiếu 45° bằng đánh dấu <g class="gc-…"> → ra linh kiện DỮ LIỆU. Gói sau đó đi qua đúng cổng nhập (importProject)
// như mọi gói khác — không có lối tắt. Nhân vật / trang bị / cảnh là công thức trỏ tới các linh kiện đó + khung gen.core.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', '..');
const SRC = 'archive/tamquoc';
const LICENSE = '© 2026 Gen Labs — All rights reserved';
const SOURCE = 'Gen Labs — bộ Tam Quốc v0.5 dựng lại từ khung (archive/tamquoc/port.js)';

/* ---------- 1. nạp bộ cũ, phép chiếu → đánh dấu ---------- */
const ctx = { window: {}, console };
vm.createContext(ctx);
ctx.__mark = (k, svg) => '<g class="gc-' + k + '">' + svg + '</g>';
const load = (f, patch) => vm.runInContext(patch ? patch(fs.readFileSync(path.join(APP, f), 'utf8')) : fs.readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f });
load('engine/core.js');
load(SRC + '/afi.core.v0.5.js', s => {
  const a = 'function face45(C, svg, clip) {', b = 'function body45(svg, shape) {';
  if (!s.includes(a) || !s.includes(b)) throw new Error('không thấy face45 / body45 trong afi.core.v0.5.js');
  return s.replace(a, a + ' return __mark(clip ? "f45c" : "f45", svg);').replace(b, b + ' return __mark(shape === HEM ? "b45h" : "b45t", svg);');
});
['afi.tamquoc.js', 'afi.items.js', 'afi.scenes.js'].forEach(f => load(SRC + '/' + f));
const OLD = ctx.window.GenChibi;

const tok = () => new Proxy({}, { get: (_, k) => typeof k === 'string' ? '{' + k + '}' : undefined });
const C = () => ({ P: tok(), A: OLD.RIG.anchors, shape: '{shape}', ink: OLD.INK, asset: { key: 'tq/port', id: 'port' }, flip: false, st: {}, view: 'front', time: 'day' });
const INK_RE = new RegExp('"' + OLD.INK + '"', 'g');
const tidy = s => String(s || '').replace(/\s+/g, ' ').trim().replace(INK_RE, '"{ink}"');   // màu nét cứng → token {ink} (đúng quy cách)

/* ---------- 2. linh kiện nhân vật ---------- */
// id cũ → id mới (tiền tố tq- để không đụng linh kiện khác trong "Của tôi")
const PARTS = {
  'afi.core/hair:neat': 'tq-toc-gon', 'afi.core/hair:long-back': 'tq-toc-dai', 'afi.core/hair:topknot': 'tq-buoi-toc', 'afi.core/hair:spiky': 'tq-toc-dung',
  'afi.core/beard:goatee': 'tq-rau-de', 'afi.core/beard:long3': 'tq-rau-ba-chom', 'afi.core/beard:tiger': 'tq-rau-ho', 'afi.core/beard:long-thin': 'tq-rau-thua',
  'afi.core/hat:warrior-band': 'tq-khan-chien', 'afi.core/hat:soft-cap': 'tq-mu-mem', 'afi.tamquoc/hat:lun-jin': 'tq-khan-cuon', 'afi.tamquoc/hat:official-cap': 'tq-mu-quan',
  'afi.core/outfit:robe': 'tq-ao-bao', 'afi.core/outfit:armor': 'tq-giap-tran', 'afi.tamquoc/outfit:crane-robe': 'tq-ao-hac',
  'afi.core/back:cape': 'tq-ao-choang', 'afi.core/legwear:pants': 'tq-quan', 'afi.core/shoes:boots': 'tq-ung',
  'afi.core/heldR:sword': 'tq-kiem', 'afi.tamquoc/heldL:wine-gourd': 'tq-bau-ruou', 'afi.tamquoc/heldR:feather-fan': 'tq-quat-long',
  'afi.tamquoc/heldR:serpent-spear': 'tq-xa-mau', 'afi.tamquoc/heldR:guandao': 'tq-dao-thanh-long',
  'afi.tamquoc/mask:opera-black': 'tq-mat-den', 'afi.tamquoc/mask:opera-red': 'tq-mat-do', 'afi.tamquoc/mask:opera-white': 'tq-mat-trang'
};
// Bản 135° / sau lưng cho tóc (bộ v0.5 chỉ có chính diện + 45°): mảng tóc phủ đúng viền đầu {shape} nên khít mọi dáng đầu ở mọi góc;
// tóc ngắn / búi để lộ gáy; tóc dài rủ xuống lưng. Thiếu bản này engine chỉ giữ lớp tóc sau → tóc búi / dựng / gọn biến mất khi quay lưng.
const S = 'stroke="{ink}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"';
const MASS = '<path d="{shape}" fill="{hair}" ' + S + '/>';
const NAPE = '<path d="M83,133 C91,138 109,138 117,133 L116,143 C108,147 92,147 84,143 Z" fill="{skin}"/><path d="M83,133 C91,138 109,138 117,133" fill="none" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>';
const SHEEN = '<path d="M68,74 C78,64 92,60 104,60" fill="none" stroke="#fff" stroke-width="3" stroke-opacity="0.2" stroke-linecap="round"/>';
const STRANDS = '<path d="M72,84 C80,104 82,118 84,130 M100,66 L100,132 M128,84 C120,104 118,118 116,130" fill="none" stroke="#000" stroke-width="1.4" stroke-opacity="0.18" stroke-linecap="round"/>';
const BACK_HAIR = {
  'tq-toc-gon': MASS + STRANDS + NAPE + SHEEN,
  'tq-buoi-toc': MASS + '<path d="M70,86 C80,72 90,62 97,56 M130,86 C120,72 110,62 103,56 M100,96 L100,58" fill="none" stroke="#000" stroke-width="1.4" stroke-opacity="0.2" stroke-linecap="round"/>' + NAPE + SHEEN +
    '<circle cx="100" cy="44" r="12" fill="{hair}" ' + S + '/><rect x="90" y="50" width="20" height="6" rx="2" fill="{accent}" stroke="{ink}" stroke-width="2"/>',
  'tq-toc-dung': '<path d="M48,104 L38,78 L55,80 L50,56 L69,66 L72,38 L88,56 L100,30 L112,56 L128,38 L131,66 L150,56 L145,80 L162,78 L152,104 L150,120 L56,120 Z" fill="{hair}" ' + S + '/>' + MASS +
    '<path d="M62,122 L70,136 L80,126 L90,140 L100,128 L110,140 L120,126 L130,136 L138,122" fill="none" stroke="{ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + SHEEN,
  'tq-toc-dai': '<path d="M52,104 C44,146 48,188 60,214 L140,214 C152,188 156,146 148,104 Z" fill="{hair}" ' + S + '/>' + MASS + STRANDS +
    '<path d="M70,150 C68,176 70,198 74,210 M100,148 L100,212 M130,150 C132,176 130,198 126,210" fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity="0.14" stroke-linecap="round"/>' + SHEEN
};
const layersOf = o => { const r = {}; Object.keys(o || {}).forEach(l => { const v = tidy(o[l]); if (v) r[l] = v; }); return r; };
const parts = Object.keys(PARTS).map(k => {
  const p = OLD.LIB.parts[k];
  if (!p) throw new Error('thiếu linh kiện cũ ' + k);
  const d = { id: PARTS[k], slot: p.slot, label: p.label, description: 'Tam Quốc — ' + p.label + '. Dựng lại từ khung (linh kiện dữ liệu).',
    layers: layersOf(p.draw(C(), {}, {})), license: LICENSE, source: SOURCE };
  const q = p.views && p.views.q45 ? layersOf(p.views.q45(C(), {}, {})) : null;
  d.views = { q45: q && Object.keys(q).length ? { mode: 'drawn', layers: q } : 'same' };
  if (BACK_HAIR[d.id]) d.views.q135 = d.views.q180 = { mode: 'drawn', layers: { hairFront: BACK_HAIR[d.id] } };
  if (p.params) d.params = JSON.parse(JSON.stringify(p.params));
  if (p.icon) d.icon = Object.assign({}, p.icon);
  if (p.eyeArea) d.eyeArea = p.eyeArea;
  if (p.tall) d.tall = true;
  if (p.upright === false) d.upright = false;
  return d;
});
const ref = (slot, oldRef) => {
  if (!oldRef || oldRef === 'none') return 'none';
  if (slot === 'head') return oldRef;   // dáng đầu dùng của khung gen.core (round / square / oval)
  const k = Object.keys(PARTS).find(x => x.endsWith('/' + slot + ':' + oldRef.replace(/^.*\//, '')));
  if (!k) throw new Error('chưa chuyển linh kiện ' + slot + ':' + oldRef);
  return 'local.my/' + PARTS[k];
};

/* ---------- 3. phông cảnh ---------- */
const SCENERY = {
  'sky:open': 'tq-troi-quang', 'sky:plain': 'tq-troi-tron', 'sky:indoor-wall': 'tq-tuong-trong',
  'far:mountains': 'tq-nui-xa', 'far:city-wall': 'tq-tuong-thanh', 'far:river': 'tq-song-xa', 'far:bamboo-far': 'tq-rung-truc',
  'mid:thatched-hut': 'tq-lieu-co', 'mid:army-tent': 'tq-trai-quan', 'mid:pavilion': 'tq-dinh',
  'ground:grass': 'tq-nen-co', 'ground:dirt-road': 'tq-duong-dat', 'ground:dirt': 'tq-nen-dat', 'ground:wood-floor': 'tq-san-go',
  'front:grass-tufts': 'tq-bui-co', 'front:bamboo-edge': 'tq-vien-truc', 'front:curtain': 'tq-rem',
  'deco:pine': 'tq-thong', 'deco:bamboo': 'tq-cay-truc', 'deco:rock': 'tq-da', 'deco:banner': 'tq-co-hieu', 'deco:tea-table': 'tq-ban-tra',
  'deco:lantern': 'tq-den-long', 'deco:fence': 'tq-hang-rao', 'deco:weapon-rack': 'tq-gia-binh-khi', 'deco:campfire': 'tq-lua-trai', 'deco:bush': 'tq-bui-cay'
};
// gradient dọc 2 màu (không có trong tập SVG an toàn) → nền màu trên + 9 dải màu dưới đậm dần: vẫn là token nên đổi giờ không vẽ lại
function flattenGradient(svg) {
  const g = /<defs><linearGradient id="([^"]+)"[^>]*><stop offset="0" stop-color="([^"]+)"\/><stop offset="1" stop-color="([^"]+)"\/><\/linearGradient><\/defs>/.exec(svg);
  if (!g) return svg;
  const [all, id, top, bottom] = g;
  const rect = new RegExp('<rect x="0" y="0" width="640" height="(\\d+)" fill="url\\(#' + id + '\\)"/>');
  const r = rect.exec(svg);
  if (!r) throw new Error('gradient ' + id + ' không dùng cho nền trời');
  const H = +r[1], n = 9, bands = Array.from({ length: n }, (_, i) => {
    const y = Math.round(H * (i + 1) / (n + 1)), h = H - y;
    return '<rect x="0" y="' + y + '" width="640" height="' + h + '" fill="' + bottom + '" fill-opacity="' + (0.16).toFixed(2) + '"/>';
  }).join('');
  return svg.replace(all, '').replace(r[0], '<rect x="0" y="0" width="640" height="' + H + '" fill="' + top + '"/>' + bands);
}
const sceneryParts = Object.keys(SCENERY).map(k => {
  const p = OLD.LIB.parts['afi.scenes/' + k];
  if (!p) throw new Error('thiếu phông cũ ' + k);
  const d = { id: SCENERY[k], slot: p.slot, label: p.label, description: 'Tam Quốc — ' + p.label + '.', svg: tidy(flattenGradient(tidy(p.draw(C())))), license: LICENSE, source: SOURCE };
  if (p.slot === 'sky') d.outdoor = p.outdoor !== false;
  return d;
});
const sref = r => { const m = /^afi\.scenes\/(.+)$/.exec(r); const p = m && Object.values(OLD.LIB.parts).find(x => x.kind === 'scenery' && x.pack === 'afi.scenes' && x.id === m[1]); if (!p) throw new Error('phông ' + r); return 'local.my/' + SCENERY[p.slot + ':' + p.id]; };
const scenes = Object.values(OLD.SCENES).map(s => {
  const layers = {}; Object.keys(s.layers).forEach(l => { const v = s.layers[l]; layers[l] = Object.assign({}, v, { part: sref(v.part) }); if (!v.dx) delete layers[l].dx; if (!v.flip) delete layers[l].flip; });
  return { id: 'tq-' + s.id, name: s.name, han: s.han || '', description: s.description || '', layers,
    deco: (s.deco || []).map(x => Object.assign({}, x, { part: sref(x.part) })), palette: Object.assign({}, s.palette), time: s.time, weather: s.weather, status: 'published' };
});

/* ---------- 4. trang bị ---------- */
const items = Object.values(OLD.ITEMS).map(it => {
  const m = /^(afi\.[a-z]+)\/(.+)$/.exec(it.equip.part);
  const k = Object.keys(PARTS).find(x => x === m[1] + '/' + it.equip.slot + ':' + m[2]);
  if (!k) throw new Error('trang bị ' + it.id + ' trỏ linh kiện chưa chuyển ' + it.equip.part);
  return { id: 'tq-' + it.id, name: it.name, han: it.han || '', type: it.type, rarity: it.rarity, description: it.description || '',
    stats: Object.assign({}, it.stats), equip: { slot: it.equip.slot, part: 'local.my/' + PARTS[k], params: Object.assign({}, it.equip.params), palette: Object.assign({}, it.equip.palette) }, status: 'published' };
});

/* ---------- 5. dàn tướng: 5 tướng cũ + 2 tướng mới phối 0 linh kiện mới ---------- */
const look = (o, extra) => {
  const parts = {}; Object.keys(o.parts).forEach(sl => { parts[sl] = ref(sl, o.parts[sl]); });
  if (!parts.legwear) parts.legwear = 'local.my/tq-quan';
  return Object.assign({ eyes: o.eyes, brows: o.brows, parts, params: JSON.parse(JSON.stringify(o.params || {})), palette: Object.assign({}, o.palette) }, extra || {});
};
const must = arr => (arr || []).map(m => { const [sl, id] = m.split(':'); return /^(eyes|brows)$/.test(sl) || id === 'none' ? m : sl + ':' + ref(sl, id).replace('local.my/', ''); });
const characters = Object.values(OLD.ASSETS).map(a => ({
  id: 'tq-' + a.id, name: a.name, han: a.han || '', faction: a.faction || '', role: a.role || '', persona: a.persona || '',
  look: look(a.look), expressions: JSON.parse(JSON.stringify(a.expressions || {})),
  identity: { p1: a.identity.p1, must: must(a.identity.must), source: a.identity.source || '', confusable: a.identity.confusable || [] }, status: 'published'
}));
characters.push({
  id: 'tq-luu-bi', name: 'Lưu Bị', han: '劉備', faction: 'Thục', role: 'Chủ công', persona: 'nhân hậu, nhẫn nại, khóc đúng lúc, giữ chữ tín với anh em',
  look: look({ eyes: 'calm', brows: 'normal', parts: { head: 'oval', hair: 'topknot', beard: 'goatee', hat: 'official-cap', outfit: 'robe', shoes: 'boots', heldR: 'sword' },
    palette: { skin: '#f6d6bd', hair: '#231d1a', robe: '#3f7d4e', inner: '#efe2b8', trim: '#c9a23f', hat: '#23232a', accent: '#d6ad45', iris: '#3a2a20', metal: '#d9dee2' } }),
  expressions: { cry: { fxAdd: ['tears'] } },
  identity: { p1: 'Mũ quan + áo bào xanh Thục + kiếm', must: ['hat:tq-mu-quan', 'outfit:tq-ao-bao', 'heldR:tq-kiem'], source: 'phối từ linh kiện Tam Quốc — 0 linh kiện mới', confusable: ['Tôn Quyền (áo đỏ Ngô)'] }, status: 'published'
});
characters.push({
  id: 'tq-trieu-van', name: 'Triệu Vân', han: '趙雲', faction: 'Thục', role: 'Võ tướng', persona: 'điềm tĩnh, gan dạ, một mình một ngựa xông trận, ít nói làm nhiều',
  look: look({ eyes: 'phoenix', brows: 'normal', parts: { head: 'round', hair: 'neat', hat: 'soft-cap', outfit: 'armor', back: 'cape', shoes: 'boots', heldR: 'serpent-spear' },
    palette: { skin: '#f7d8c0', hair: '#1d1a1a', robe: '#f4f4f0', armor: '#d9e2e8', trim: '#7d8b96', hat: '#f4f4f0', accent: '#5a8fc8', cape: '#e9eef3', metal: '#ffffff', wood: '#f4f4f0', tassel: '#c8372d', iris: '#2f2620' } }),
  expressions: {},
  identity: { p1: 'Giáp bạc + áo choàng trắng + thương', must: ['outfit:tq-giap-tran', 'back:tq-ao-choang', 'heldR:tq-xa-mau'], source: 'phối từ linh kiện Tam Quốc — 0 linh kiện mới', confusable: ['Mã Siêu (giáp bạc, mũ sư tử)'] }, status: 'published'
});

/* ---------- 6. tác phẩm: "Từ vườn đào tới Xích Bích" ---------- */
const K = id => 'local.my/tq-' + id;
const shot = (id, title, description, scene, cast, steps) => ({ id, title, description, scene: K(scene), cast: cast.map(K), event: { title, steps: steps.map(s => Object.assign({}, s, { actor: 'tq-' + s.actor })) } });
const works = [{
  id: 'tq-vuon-dao-xich-bich', title: 'Từ vườn đào tới Xích Bích',
  logline: 'Ba anh em kết nghĩa, ba lần tới lều cỏ mời Khổng Minh, rồi một trận gió đông đổi vận thiên hạ.',
  script: 'Lưu Bị, Quan Vũ, Trương Phi kết nghĩa ở vườn đào. Lần thứ ba tới Long Trung giữa trời tuyết, Trương Phi nóng ruột đòi đốt lều. Gia Cát Lượng tỉnh giấc, nhận lời xuống núi. Ở doanh trại, lính báo Tào quân tám mươi vạn; Triệu Vân xin ra trận, Khổng Minh chỉ chờ gió đông. Bên sông Xích Bích, Tào Tháo cười đắc ý — cho tới khi gió đổi chiều.',
  shots: [
    shot('canh-1', 'Kết nghĩa vườn đào', 'Ba anh em thề dưới hoa đào.', 'vuon-dao', ['luu-bi', 'quan-vu', 'truong-phi'], [
      { actor: 'luu-bi', state: 'vow', spot: 'center', activity: 'salute', say: 'Không cầu sinh cùng ngày cùng tháng cùng năm…' },
      { actor: 'quan-vu', state: 'vow', spot: 'midLeft', say: '…chỉ nguyện chết cùng ngày cùng tháng cùng năm!' },
      { actor: 'truong-phi', state: 'proud', spot: 'midRight', activity: 'cheer', fx: ['confetti'], say: 'Uống! Hôm nay phải say mới về!' }]),
    shot('canh-2', 'Lần thứ ba tới Long Trung', 'Trời tuyết, Trương Phi hết kiên nhẫn.', 'tuyet-son', ['truong-phi', 'quan-vu', 'luu-bi'], [
      { actor: 'truong-phi', state: 'rage', spot: 'midRight', fx: ['steam'], say: 'Để đệ đốt cái lều cỏ này cho hắn dậy!' },
      { actor: 'quan-vu', state: 'think', spot: 'midLeft', say: 'Tam đệ bình tĩnh. Người tài thường khó gặp.' },
      { actor: 'luu-bi', state: 'beg', spot: 'center', say: 'Chờ thêm chút nữa thôi… vì thiên hạ.', hold: 2.4 }]),
    shot('canh-3', 'Thảo lư', 'Khổng Minh tỉnh giấc và nhận lời.', 'thao-lu', ['gia-cat-luong', 'luu-bi'], [
      { actor: 'gia-cat-luong', state: 'sleep', spot: 'midRight', say: 'Đại mộng ai tỉnh trước? Bình sinh ta tự biết…' },
      { actor: 'luu-bi', state: 'beg', spot: 'midLeft', activity: 'bow', say: 'Xin tiên sinh xuống núi giúp Bị!' },
      { actor: 'gia-cat-luong', state: 'smug', say: 'Thiên hạ chia ba — kế đã sẵn trong lòng.', hold: 2.6 }]),
    shot('canh-4', 'Doanh trại bàn kế', 'Tin dữ tới, Khổng Minh vẫn ung dung.', 'doanh-trai', ['linh-que', 'trieu-van', 'gia-cat-luong'], [
      { actor: 'linh-que', state: 'panic', spot: 'left', fx: ['exclaim'], say: 'Báo! Tào quân tám mươi vạn!' },
      { actor: 'trieu-van', state: 'vow', spot: 'midRight', say: 'Có Tử Long ở đây, quân sư cứ yên tâm!' },
      { actor: 'gia-cat-luong', state: 'normal', spot: 'center', say: 'Đừng vội. Chỉ cần chờ một trận gió đông.' }]),
    shot('canh-5', 'Gió đông Xích Bích', 'Tào Tháo đắc ý, rồi gió đổi chiều.', 'xich-bich', ['tao-thao', 'gia-cat-luong'], [
      { actor: 'tao-thao', state: 'smug', spot: 'midLeft', say: 'Tám mươi vạn quân, thuyền nối thành đất bằng!' },
      { actor: 'tao-thao', state: 'shock', fx: ['sweat'], say: 'Gió… gió đông?!' },
      { actor: 'gia-cat-luong', state: 'proud', spot: 'midRight', say: 'Vạn sự đã nằm trong tính toán.', hold: 2.8 }])
  ]
}];

const bundle = {
  format: 'gen-chibi.project/1', kind: 'sale', license: LICENSE,
  project: { id: 'mau-tam-quoc', name: 'Tam Quốc (bộ chủ đề mẫu)', description: 'Bộ chủ đề trọn vẹn dựng từ khung: 7 tướng, 13 trang bị, 8 bối cảnh, 26 linh kiện nhân vật, 27 phông — và phim 5 phân cảnh. Mọi asset đã Phát hành: mở Gói bán để xem một bộ thư viện bán được trông thế nào.' },
  requires: { packs: [] }, parts: parts.concat(sceneryParts), items, scenes, characters, works
};
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(APP, 'studio/mau/tam-quoc.json');   // tham số: ghi ra chỗ khác (test so khớp)
fs.writeFileSync(out, JSON.stringify(bundle, null, 1) + '\n');
console.log('ghi', path.relative(APP, out), (fs.statSync(out).size / 1024).toFixed(0) + ' KB ·', parts.length, 'linh kiện ·', sceneryParts.length, 'phông ·', items.length, 'trang bị ·', scenes.length, 'cảnh ·', characters.length, 'tướng ·', works[0].shots.length, 'phân cảnh');
