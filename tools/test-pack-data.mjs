// Gói dữ liệu + mở rộng engine v0.26 (E2–E9): rig.size 0,6 · chân dài · biến thể tâm trạng · dáng đầu / kiểu mắt / dáng mắt / mày / miệng / đạo cụ gắn khớp tay /
// hiệu ứng / động tác / hoạt động bằng JSON thuần · màu INK cấu hình được · viền nướng vào path · token cel shading dẫn xuất.
// Gói mẫu bên dưới là GÓI TỔNG HỢP (không phải linh kiện chữ ký của ai) — chỉ để thử schema.
// © 2026 Gen Labs — All rights reserved.
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { loadEngine } = require(ROOT + '/server/engine-node.js');
let bad = 0;
const ok = (c, msg, x) => { if (c) console.log('   ✓ ' + msg); else { bad = 1; console.log('   ✗ ' + msg + (x !== undefined ? ' — ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500) : '')); } };
const GC = loadEngine(ROOT), L = GC.LIB, INK = GC.INK;
const mannequin = () => GC.getAsset('gen.khung/ma-no-canh');
const clone = o => JSON.parse(JSON.stringify(o));
const withLook = (patch) => { const a = clone(mannequin()); a.look = Object.assign({}, a.look, patch); a.key = 'gen.khung/' + a.id; return a; };

/* E2 + E3 ------------------------------------------------------------- */
{
  const g = a => GC.gate(a).find(x => x.id === 'params');
  ok(g(withLook({ params: { rig: { size: 0.6 } } })).ok, 'E2: rig.size 0,6 hợp lệ (cận dưới hạ từ 0,85)');
  ok(!g(withLook({ params: { rig: { size: 0.55 } } })).ok && GC.FACE_PARAMS.rig.size.min === 0.6 && GC.FACE_PARAMS.rig.size.def === 1, 'E2: dưới 0,6 vẫn bị cổng chặn, mặc định vẫn 1');
  const base = mannequin(), tall = withLook({ params: { rig: { legs: 1.6 } } });
  ok(g(tall).ok && !g(withLook({ params: { rig: { legs: 2.5 } } })).ok, 'E3: rig.legs trong [1, 1,8]');
  const st = GC.resolveState(base, 'normal'), st2 = GC.resolveState(tall, 'normal');
  const p0 = GC.poseAt(base, st, 0, true), p1 = GC.poseAt(tall, st2, 0, true);
  const K0 = GC.keyPoints(p0), K1 = GC.keyPoints(p1);
  ok(Math.abs(K1.footL[1] - K0.footL[1]) < 0.6 && Math.abs(K1.footR[1] - K0.footR[1]) < 0.6, 'E3: chân dài vẫn chạm đất (bàn chân lệch < 0,6 đơn vị)', [K0.footL, K1.footL]);
  ok(Math.abs(K0.head[1] - K1.head[1] - 9 * 0.6) < 0.5 && K0.pelvis[1] - K1.pelvis[1] > 4, 'E3: đầu và hông cao hơn khi chân dài', [K0.head, K1.head]);
  const lie = GC.poseAt(tall, GC.resolveState(tall, 'normal', { activity: 'lie' }), 0, true), lie0 = GC.poseAt(base, GC.resolveState(base, 'normal', { activity: 'lie' }), 0, true);
  ok(lie.root.y === lie0.root.y, 'E3: tư thế nằm không nâng thân (noLegLift)');
  const all = GC.LIB.activityOrder.every(id => { const s = GC.svgString(tall, 'normal', { director: { activity: id }, t: 0.3 }); return !/NaN|undefined/.test(s); });
  ok(all, 'E3: mọi hoạt động dựng được với chân dài, không NaN');
}

/* INK (E1 phía engine) ------------------------------------------------ */
{
  const a = mannequin(), s0 = GC.svgString(a, 'normal'), s1 = GC.svgString(a, 'normal', { ink: '#14121A' });
  ok(s0.indexOf(INK) > 0 && s1.indexOf(INK) < 0 && s1.indexOf('#14121A') > 0, 'INK: opts.ink thay mọi màu viền của engine, không sót #2b211d');
  const b = clone(a); b.look = Object.assign({}, a.look, { palette: Object.assign({}, a.look.palette, { ink: '#112233' }) }); b.key = 'gen.khung/x-ink';
  const s2 = GC.svgString(b, 'normal');
  ok(s2.indexOf(INK) < 0 && s2.indexOf('#112233') > 0 && GC.svgString(b, 'normal', { ink: '#445566' }).indexOf('#112233') < 0, 'INK: palette.ink đổi màu viền cho nhân vật; opts.ink thắng palette.ink');
  ok(GC.svgString(a, 'normal', { ink: 'url(#x)' }) === s0, 'INK: giá trị không phải hex bị bỏ qua (không chèn markup)');
}

/* E7 token dẫn xuất ----------------------------------------------------- */
{
  const a = mannequin(), P = GC.palette(a), b = withLook({ palette: { hair: '#ff0000' } }), Pb = GC.palette(b);
  ok(['hairShade', 'hairLight', 'rim', 'robeShade', 'robeLight', 'trimShade', 'glow'].every(k => /^#[0-9a-f]{6}$/i.test(P[k]) && k in L.defaults), 'E7: 7 token cel shading có trong bộ mặc định');
  ok(Pb.hairShade === GC.mixHex('#ff0000', '#000000', 0.28) && Pb.hairLight === GC.mixHex('#ff0000', '#ffffff', 0.35), 'E7: hairShade / hairLight dẫn xuất từ hair của nhân vật');
  ok(GC.palette(withLook({ palette: { hair: '#ff0000', hairShade: '#00ff00' } })).hairShade === '#00ff00', 'E7: nhân vật khai báo token thì thắng bản dẫn xuất');
}

/* Gói mẫu --------------------------------------------------------------- */
const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="{ink}" stroke-width="3"/>`;
const PACK = () => ({
  format: 'gen-chibi.pack/1', id: 'test.mini', name: 'Gói thử', owner: 'Test', license: '© test', version: '0.0.1',
  tokens: { fur: '#a0522d', furShade: { from: 'fur', to: '#000000', t: 0.3 }, hairDeep: { from: 'hair', to: '#000000', t: 0.5 } },
  browStyles: [{ id: 'mini-brow', label: 'Mày thử', w: 7, len: 20 }],
  browPoses: [{ id: 'mini-flat', rot: 0, dy: -2, arc: 0 }],
  eyePoses: [{ id: 'mini-dot', svg: '<circle cx="{=x}" cy="{=y}" r="{=w/2}" fill="{ink}"/>' }],
  mouths: [{ id: 'mini-o', vars: { r: 4 }, svg: '<circle cx="{=x}" cy="{=y}" r="{=r}" fill="#a33" stroke="{ink}" stroke-width="2.4"/>' }],
  eyeStyles: [{
    id: 'mini-eye', label: 'Mắt thử', w: 10, h: 12, vars: { k: 1, dx: 0, big: 0 }, calc: { ew: 'w*k', px: 'x+dx*ew*.5' },
    template: ['<ellipse cx="{=x}" cy="{=y}" rx="{=ew}" ry="{=h*k}" fill="#fff" stroke="{ink}" stroke-width="3"/>', '<circle cx="{=px}" cy="{=y}" r="4" fill="{ink}"/>',
      { if: 'big', svg: '<circle cx="{=x}" cy="{=y}" r="{=ew+2}" fill="none" stroke="{ink}" stroke-width="2"/>' }],
    poses: { normal: {}, wide: { vars: { k: 1.3, big: 1 } }, lookSide: { vars: { dx: -1 } }, closed: { svg: '<path d="M{=x-w},{=y} L{=x+w},{=y}" fill="none" stroke="{ink}" stroke-width="3"/>' } }
  }],
  parts: [
    { slot: 'head', id: 'mini-head', label: 'Đầu thử', shape: 'M52,100 C52,70 72,56 100,56 C128,56 148,70 148,100 C148,128 128,146 100,146 C72,146 52,128 52,100 Z',
      shape45: 'M50,100 C50,70 70,56 98,56 C126,56 144,70 144,100 C144,128 124,146 98,146 C70,146 50,128 50,100 Z',
      layers: { head: '<path d="{shape}" fill="{skin}" stroke="{ink}" stroke-width="3.2"/>' }, views: { q45: { mode: 'drawn', layers: { head: '<path d="{shape}" fill="{skin}" stroke="{ink}" stroke-width="3.2"/>' } } } },
    { slot: 'hat', id: 'mini-ears', label: 'Tai theo tâm trạng', layers: { hat: '<path d="M70,60 L74,40 L84,58 Z" fill="{fur}" stroke="{ink}" stroke-width="2.4"/>' }, views: { q45: 'same' },
      variants: { mood: { sad: { hat: '<path d="M70,60 L56,70 L72,72 Z" fill="{furShade}" stroke="{ink}" stroke-width="2.4"/>' }, angry: { hat: '<path d="M70,60 L66,44 L80,56 Z" fill="{hairDeep}"/>' } } } },
    { slot: 'hair', id: 'mini-tuft', label: 'Tóc + sợi theo tâm trạng', layers: { hairFront: '<path d="M60,70 C60,50 140,50 140,70 Z" fill="{hair}" stroke="{ink}" stroke-width="3"/>' },
      views: { q45: 'same', q180: 'same' }, variants: { mode: 'append', mood: { happy: { hairFront: '<circle cx="100" cy="46" r="5" fill="{accent}"/>' }, shock: { hairFront: '<circle cx="100" cy="40" r="7" fill="{glow}"/>' } } } },
    { slot: 'heldR', id: 'mini-stick', label: 'Gậy', layers: { heldR: rect(124, 160, 6, 40, '{wood}') }, views: { q45: 'same' } }
  ],
  props: [{ id: 'mini-finger', label: 'Ngón', anchor: { joint: 'handR', dx: 2, dy: -4, rot: 10, scale: 0.8 }, layers: { held: '<rect x="-3" y="-30" width="6" height="30" rx="3" fill="{skin}" stroke="{ink}" stroke-width="2"/>' } },
    { id: 'mini-flag', label: 'Cờ', anchor: { joint: 'hand', z: 'held' }, layers: { held: '<rect x="-2" y="-40" width="4" height="40" fill="{wood}"/>' } }],
  fx: [{ id: 'mini-spark', label: 'Tia', layers: { fxHead: '<circle cx="150" cy="60" r="4" fill="{glow}"/>' } }],
  motions: [{ id: 'mini-point', label: 'Chỉ thử', dur: 1, tracks: { armR: { rot: [[0, -80], [1, -80]] }, foreR: { rot: [[0, -10], [1, -10]] } }, hide: ['heldR'] }],
  activities: [{ id: 'mini-pointing', label: 'Chỉ', group: 'Thử', posture: 'stance', action: 'mini-point', state: 'normal', props: ['mini-finger'], face: { eyes: 'wide', mouth: 'mini-o' }, fx: ['mini-spark'] }],
  assets: [{ id: 'mini-hero', name: 'Hero thử', look: { eyes: 'mini-eye', brows: 'mini-brow', parts: { head: 'mini-head', hat: 'mini-ears', hair: 'mini-tuft' }, params: { rig: { size: 0.8, legs: 1.3 } }, palette: { hair: '#223344', ink: '#101820' } } }]
});
const reg = (p) => GC.registerDataPack(p || PACK());
const snap = () => JSON.stringify([Object.keys(L.eyeStyles), Object.keys(L.eyePoses), Object.keys(L.props), Object.keys(L.fx), Object.keys(L.motions), Object.keys(L.activities), Object.keys(L.parts), Object.keys(L.defaults), Object.keys(GC.PACKS), GC.ASSET_ORDER.slice()]);

/* Đăng ký trọn gói + đủ loại ------------------------------------------- */
const before = snap();
let r = reg();
ok(!r.errors.length, 'gói mẫu (token, mày, mắt, miệng, đầu, tóc, đạo cụ, fx, động tác, hoạt động, nhân vật) đăng ký được', r.errors);
ok(r.counts.eyeStyle === 1 && r.counts.prop === 2 && r.counts.part === 4 && r.counts.character === 1 && r.counts.activity === 1, 'đếm mục của gói đúng', r.counts);
const hero = GC.getAsset('test.mini/mini-hero');
ok(!GC.blockingGates(GC.gate(hero, { poses: true }), 'draft').length, 'nhân vật của gói qua cổng gate (kể cả dựng mọi hoạt động)', GC.gate(hero, { poses: true }).filter(g => !g.ok));
const SV = (st, o) => GC.svgString(hero, st || 'normal', o || {});
ok(L.defaults.fur === '#a0522d' && GC.palette(hero).furShade === GC.mixHex('#a0522d', '#000000', 0.3) && GC.palette(hero).hairDeep === GC.mixHex('#223344', '#000000', 0.5), 'E7: gói đăng ký token màu cố định + dẫn xuất (furShade từ fur, hairDeep từ hair của nhân vật)');

// E5: đầu bằng dữ liệu
ok(L.parts['test.mini/head:mini-head'].shape.indexOf('M52,100') === 0 && SV().indexOf('M52,100 C52,70') > 0 && SV('normal', { director: { view: 'left45' } }).indexOf('M50,100 C50,70') > 0, 'E5: dáng đầu dữ liệu — {shape} khít viền chính diện và shape45 ở góc 45°');
// E5 + E9: kiểu mắt + bộ dáng riêng
{
  const es = L.eyeStyles['mini-eye'], ctx = GC.compose(hero, 'normal', { eyes: 'wide' });
  ok(es.poses && typeof es.poses.wide === 'function' && ctx.layers.eyes.indexOf('rx="13"') > 0 && ctx.layers.eyes.indexOf('stroke-width="2"') > 0, 'E9: dáng "wide" của kiểu mắt thắng dáng chung — mẫu + biến (k 1,3 → rx 13, điều kiện if big vẽ thêm vòng)', ctx.layers.eyes.slice(0, 300));
  ok(GC.compose(hero, 'normal', { eyes: 'normal' }).layers.eyes.indexOf('rx="10"') > 0 && GC.compose(hero, 'normal', { eyes: 'normal' }).layers.eyes.indexOf('stroke-width="2"') < 0, 'E5: biến mặc định + if sai → không vẽ phần có điều kiện');
  ok(GC.compose(hero, 'normal', { eyes: 'lookSide' }).layers.eyes.indexOf('cx="75"') > 0 || GC.compose(hero, 'normal', { eyes: 'lookSide' }).layers.eyes.indexOf('cx="7') > 0, 'E5: biểu thức tính theo toạ độ mắt (x + dx·ew·0,5)');
  ok(GC.compose(hero, 'normal', { eyes: 'star' }).layers.eyes.length > 50 && GC.compose(hero, 'normal', { eyes: 'closed' }).layers.eyes.indexOf('<path') > 0, 'E9: dáng không có trong bộ riêng (star) rơi về dáng chung; closed dùng svg riêng của kiểu mắt');
  ok(GC.compose(hero, 'normal', { mouth: 'mini-o' }).layers.mouth.indexOf('r="4"') > 0 && GC.compose(hero, 'normal', { brows: 'mini-flat' }).layers.brows.indexOf('stroke-width="7.00"') > 0, 'E5: miệng và dáng/kiểu mày bằng dữ liệu');
  ok(GC.svgString(hero, 'normal', { director: { eyes: 'mini-dot' } }).indexOf('r="5"') > 0, 'E5: dáng mắt chung bằng dữ liệu (không thuộc kiểu mắt nào)');
}
// E4: biến thể tâm trạng
{
  const hat = (o) => GC.compose(hero, 'normal', o).layers.hat, hair = (o) => GC.compose(hero, 'normal', o).layers.hairFront;
  ok(hat({}) !== hat({ eyes: 'teary', brows: 'sad' }) && hat({ eyes: 'teary' }).indexOf('M70,60 L56,70') > 0 && hat({}).indexOf('M70,60 L74,40') > 0, 'E4: tai đổi hình theo tâm trạng (sad) và về dáng gốc khi bình thường');
  ok(hat({ eyes: 'angry' }).indexOf('M70,60 L66,44') > 0 && GC.moodOf(GC.resolveState(hero, 'rage')) === 'angry', 'E4: tâm trạng suy từ nét mặt đã resolve — trạng thái rage → angry');
  ok(hair({}).indexOf('<circle') < 0 && hair({ mouth: 'laugh' }).indexOf('r="5" fill') > 0 && hair({ eyes: 'wide' }).indexOf('r="7"') > 0 && hair({ mouth: 'laugh' }).indexOf('M60,70') > 0, 'E4: mode append — vẽ thêm lên trên lớp gốc (sợi tóc), không thay mái');
  ok(GC.svgString(hero, 'normal', { director: { eyes: 'wide', view: 'left45' } }).indexOf('r="7"') > 0, 'E4: biến thể cũng chạy ở góc 45° (views.q45 = same)');
  const bad = GC.checkDataPart({ slot: 'hat', id: 'zz', layers: { hat: '<circle cx="1" cy="1" r="1"/>' }, views: { q45: 'same' }, variants: { mood: { vui_ve: { hat: '<circle cx="1" cy="1" r="1"/>' } } } });
  ok(bad.errors.some(e => /tâm trạng/.test(e)), 'E4: khoá tâm trạng lạ bị chặn', bad.errors);
  const ok2 = GC.checkDataPart({ slot: 'hat', id: 'zz', layers: { hat: '<circle cx="1" cy="1" r="1"/>' }, views: { q45: 'same' }, variants: { mood: { rage: { hat: '<circle cx="1" cy="1" r="2"/>' } } } });
  ok(!ok2.errors.length, 'E4: khoá có thể là id trạng thái (rage)', ok2.errors);
}
// E8: đạo cụ gắn khớp tay
{
  const act = (a) => GC.svgBody(hero, 'normal', { director: { activity: a }, noShadow: true });
  const s1 = act('mini-pointing'), s0 = GC.svgBody(hero, 'normal', { noShadow: true });
  const CH = /<g transform="([^"]*)">(?:(?!<g transform)[\s\S])*?<g transform="translate\(130 189\) rotate\(10\) scale\(0\.8\)">/;
  const m = CH.exec(s1);
  ok(!!m && s0.indexOf('translate(130 189)') < 0, 'E8: đạo cụ nằm TRONG nhóm khớp handR, gốc = điểm nắm (128,193) + lệch (2,−4), xoay 10°, co 0,8', m && m[1]);
  const t = (a) => /<g transform="([^"]*)">(?:(?!<g transform)[\s\S])*?<g transform="translate\(130 189\)/.exec(act(a));
  const a1 = t('mini-pointing'), z = GC.svgBody(hero, 'normal', { director: { activity: 'mini-pointing', facing: 'left' }, noShadow: true });
  ok(a1 && /rotate\(-80/.test(a1[1].replace(/\s+/g, ' ')) || a1 && a1[1].indexOf('-80') > 0, 'E8: chuỗi biến đổi của khớp tay mang góc cánh tay −80° (đạo cụ đi theo tay, không toạ độ cố định)', a1 && a1[1].slice(0, 200));
  ok(z.indexOf('translate(130 189)') > 0, 'E8: hướng trái vẫn gắn khớp (lật gương cả nhóm gốc)');
  const held = GC.compose(hero, 'normal', { activity: 'mini-pointing' });
  ok(held.layers.handR.indexOf('translate(130 189)') > 0 && held.layers.handR.indexOf('<circle cx="128" cy="193"') < held.layers.handR.indexOf('translate(130 189)'), 'E8: z "front" vẽ SAU bàn tay, không bị hide:["heldR"] của động tác cất đi');
  const flag = GC.compose(hero, 'normal', {}), fl = GC.LIB.props['mini-flag'].draw(flag.state ? { P: GC.palette(hero), A: GC.RIG.anchors } : null, {}, 'L');
  ok(fl.heldL && fl.heldL.indexOf('translate(72 193)') >= 0, 'E8: anchor.joint "hand" theo tay đang cầm (L → gripL), z "held" vào lớp heldL', fl);
}
// E5: fx, motion, activity
{
  const c = GC.compose(hero, 'normal', { activity: 'mini-pointing' });
  ok(c.layers.fxHead.indexOf('r="4"') > 0 && c.state.motion === 'mini-point' && c.state.eyes === 'wide' && c.state.mouth === 'mini-o', 'E5: hoạt động dữ liệu gom động tác + đạo cụ + hiệu ứng + nét mặt dữ liệu');
  ok(GC.director.validate({ title: 't', steps: [{ actor: 'mini-hero', state: 'normal', activity: 'mini-pointing', say: 'a' }] }, [hero]).length === 0, 'E5: đạo diễn nhận hoạt động của gói (schema + validate)');
}

/* Kiểm lỗi / an toàn --------------------------------------------------- */
const errOf = (mut) => { const p = PACK(); mut(p); const c = GC.checkDataPack(p); return c.errors.join(' | '); };
ok(/thẻ <script>/.test(errOf(p => { p.eyePoses[0].svg = '<script>alert(1)</script>'; })), 'an toàn: thẻ <script> trong dáng mắt bị chặn');
ok(/onload|không được phép/.test(errOf(p => { p.fx[0].layers.fxHead = '<circle cx="1" cy="1" r="1" onload="x()"/>'; })), 'an toàn: thuộc tính onload trong hiệu ứng bị chặn');
ok(/không hợp lệ/.test(errOf(p => { p.eyePoses[0].svg = '<circle cx="{=x}" cy="{=y}" r="3" fill="url(#a)"/>'; })), 'an toàn: fill url() bị chặn');
ok(/biến lạ|hàm lạ/.test(errOf(p => { p.eyePoses[0].svg = '<circle cx="{=process}" cy="1" r="3"/>'; })) && /hàm lạ/.test(errOf(p => { p.eyePoses[0].svg = '<circle cx="{=constructor(1)}" cy="1" r="3"/>'; })), 'an toàn: biểu thức không gọi được process / constructor (không eval)');
ok(/ký tự lạ/.test(errOf(p => { p.eyePoses[0].svg = '<circle cx="{=x;1}" cy="1" r="3"/>'; })) && /không hợp lệ/.test(errOf(p => { p.eyePoses[0].svg = '<circle cx="{=' + '1+'.repeat(120) + '1}" cy="1" r="3"/>'; })), 'an toàn: biểu thức chỉ nhận số / biến / toán tử; dài quá 200 ký tự không thành biểu thức (bị bộ lọc SVG chặn)');
ok(/khoá sai/.test(errOf(p => { p.motions[0].tracks.armR.rot = [[0, 0], [2, 5]]; })) && /khớp lạ/.test(errOf(p => { p.motions[0].tracks.wing = { rot: [[0, 1]] }; })), 'động tác: khoá sai (t > 1) và khớp lạ bị chặn');
ok(/trùng tên trạng thái/.test(errOf(p => { p.activities[0].id = 'rage'; })), 'hoạt động: id trùng state của kịch bản bị chặn');
ok(/không có trong kho/.test(errOf(p => { p.activities[0].action = 'khong-co'; })) && /đạo cụ có thật/.test(errOf(p => { p.activities[0].props = ['ma']; })), 'hoạt động: tham chiếu động tác / đạo cụ không có bị chặn');
ok(/cần anchor/.test(errOf(p => { delete p.props[0].anchor; })) && /chọn handL/.test(errOf(p => { p.props[0].anchor.joint = 'footL'; })), 'đạo cụ: lớp held cần anchor hợp lệ');
ok(/chưa có trong kho/.test(errOf(p => { p.eyeStyles[0].poses.zzz = { vars: { k: 2 } }; })), 'kiểu mắt: dáng riêng phải có trong kho chung');
ok(/shape/.test(errOf(p => { delete p.parts[0].shape; })) && /chỉ dáng đầu/.test(errOf(p => { p.parts[1].shape = 'M0,0 L1,1'; })), 'dáng đầu: bắt buộc shape; slot khác không được có shape');
ok(/đã thuộc thư viện gen\.core/.test(errOf(p => { p.tokens.skin = '#fff'; })) && /đã thuộc thư viện gen\.core/.test(errOf(p => { p.motions[0].id = 'idle'; })), 'không đè token / động tác của khung');
ok(/license/.test(errOf(p => { delete p.license; })) && /id thư viện/.test(errOf(p => { p.id = 'x'; })), 'gói thiếu license / id sai bị chặn');
ok(snap().length > 0 && GC.PACKS['test.mini'], 'gói thử vẫn đăng ký sau các lần kiểm lỗi (kiểm không đụng kho)');
// hoàn tác: nhân vật không qua gate → gỡ sạch; nạp lại thay bản cũ
{
  const s0 = snap();
  const p = PACK(); p.id = 'test.broken'; p.assets = [{ id: 'xx', name: 'x', look: { eyes: 'khong-co-mat', brows: 'mini-brow', parts: {}, palette: {} } }];
  const r2 = GC.registerDataPack(p);
  ok(r2.errors.length > 0 && !GC.PACKS['test.broken'] && !L.eyeStyles['mini-eye-x'], 'nhân vật hỏng → đăng ký thất bại, kho y nguyên (hoàn tác)', r2.errors.slice(0, 2));
  ok(snap() === s0, 'hoàn tác sạch: mọi bảng của kho giống hệt trước lần đăng ký lỗi');
  const p3 = PACK(); p3.id = 'test.other';
  ok(/đã thuộc thư viện test\.mini/.test(GC.checkDataPack(p3).errors.join('|')), 'gói khác không đè id của gói đã có (kiểu mắt, token…)');
  const p4 = PACK(); p4.eyeStyles[0].w = 11; const r4 = reg(p4);
  ok(!r4.errors.length && L.eyeStyles['mini-eye'].w === 11 && GC.ASSET_ORDER.filter(k => k === 'test.mini/mini-hero').length === 1, 'nạp lại gói cùng id thay bản cũ (không nhân đôi)');
  ok(GC.unregisterPack('test.mini') && !GC.PACKS['test.mini'] && snap() === before, 'unregisterPack gỡ sạch: kho về đúng như trước khi có gói');
}

/* E6 viền nướng ---------------------------------------------------------- */
{
  const a = mannequin(), plain = GC.svgString(a, 'normal'), O = (o) => GC.svgString(a, 'normal', { outline: o });
  const s1 = O({ width: 3 }), s2 = O({ width: 3, sticker: true });
  ok(plain.indexOf('gc-outline') < 0 && s1.indexOf('gc-outline') > 0 && !/<filter|filter=|feMorphology/.test(s2), 'E6: có viền → nhóm gc-outline, KHÔNG filter / feMorphology');
  ok(s2.indexOf('stroke="#ffffff"') > 0 && s1.indexOf('stroke="#ffffff"') < 0, 'E6: sticker thêm dải trắng nướng vào path');
  ok(/stroke="#2b211d" stroke-width="6\.\d+"/.test(s1) || /stroke="#2b211d" stroke-width="6"/.test(s1), 'E6: bề dày viền = 2 × width (+ nét gốc) tính theo đơn vị khung');
  ok(O({ width: 3, sticker: true, color: '#ff00ff' }).indexOf('stroke="#ff00ff"') > 0 && GC.svgString(a, 'normal', { ink: '#112233', outline: { width: 3 } }).indexOf('stroke="#112233" stroke-width="6') > 0, 'E6: màu viền mặc định = INK của lần dựng; đổi được bằng outline.color');
  ok(O({ width: 3, skip: ['fxBack', 'fxFront'] }).length <= s1.length && !/stroke-width="NaN"/.test(s2), 'E6: outline.skip bỏ lớp; không NaN');
  ok(s2.indexOf('<defs') === s2.lastIndexOf('<defs') || (s2.match(/<clipPath id="([^"]+)"/g) || []).length === new Set(s2.match(/<clipPath id="([^"]+)"/g) || []).size, 'E6: hình bóng không nhân đôi <defs> / id clipPath');
  const w1 = GC.svgString(withLook({ params: { rig: { size: 0.6 } } }), 'normal', { outline: { width: 3 } });
  ok(/stroke-width="(?:7|6\.[5-9]|7\.\d+|8\.\d+)\d*"/.test(w1), 'E6: đầu thu nhỏ (rig.size 0,6) vẫn được bù bề dày viền (không mỏng đi theo cỡ khớp)');
  const all = GC.VIEW_ORDER.every(v => !/NaN|undefined/.test(GC.svgString(a, 'normal', { director: { view: v, activity: 'run' }, t: 0.2, outline: { width: 3, sticker: true } })));
  ok(all, 'E6: viền dựng được ở mọi góc nhìn / hoạt động (không NaN)');
  ok(GC.normalizeOutline({ width: 99 }, '#000000').width === 12 && GC.normalizeOutline(false, '#000') === null && GC.normalizeOutline({ color: 'red' }, '#123456').color === '#123456', 'E6: tham số viền được kẹp / lọc (width ≤ 12, màu chỉ hex)');
}
process.exit(bad ? 1 : 0);
