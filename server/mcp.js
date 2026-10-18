// gen-chibi — MCP server (Model Context Protocol), không phụ thuộc SDK.
// © 2026 Afi Labs — All rights reserved.
// Agent tự làm phần sáng tạo (viết công thức nhân vật, viết kịch bản); hệ thống cung cấp từ vựng,
// kiểm theo cổng, dựng SVG và lưu. Không cần LLM API lõi.
// Vận chuyển: HTTP (POST /mcp, JSON) và stdio (server/mcp-stdio.js chuyển tiếp vào /mcp).
'use strict';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'gen-chibi', title: 'gen-chibi — nhà máy nhân vật chibi bằng code' };
const MY_PACK = 'local.my';
const TMP_PACK = 'local.preview';
// lớp nên dùng cho từng bộ phận (theo thư viện chính thức)
const SLOT_LAYERS = {
  head: ['head', 'ears', 'shade'], mask: ['mask'], hair: ['hairFront', 'hairBack'], beard: ['beard', 'mustache'], hat: ['hat', 'hairBack'],
  outfit: ['body', 'hem', 'armL', 'foreL', 'armR', 'foreR'], back: ['backItem'], legwear: ['thighL', 'shinL', 'thighR', 'shinR'], shoes: ['footL', 'footR'],
  heldL: ['heldL'], heldR: ['heldR']
};
const EXAMPLE_PART = {
  id: 'non-la', slot: 'hat', label: 'Nón lá',
  layers: { hat: '<path d="M38,78 L100,22 L162,78 C130,86 70,86 38,78 Z" fill="#e8d39a" stroke="{ink}" stroke-width="2.8" stroke-linejoin="round"/><path d="M100,22 L118,80 M100,22 L82,80" fill="none" stroke="#b89a55" stroke-width="1.4"/><path d="M60,80 C80,92 120,92 140,80" fill="none" stroke="{accent}" stroke-width="2.4"/>' },
  views: { q45: { mode: 'drawn', layers: { hat: '<path d="M36,80 L92,22 L162,76 C128,86 68,88 36,80 Z" fill="#e8d39a" stroke="{ink}" stroke-width="2.8" stroke-linejoin="round"/><path d="M92,22 L104,82 M92,22 L72,82" fill="none" stroke="#b89a55" stroke-width="1.4"/><path d="M56,82 C76,92 112,92 134,82" fill="none" stroke="{accent}" stroke-width="2.4"/>' } } },
  params: { height: { label: 'Độ cao nón', type: 'scaleY', min: 0.85, max: 1.2, def: 1, pivot: [100, 80] } }
};
// phông cảnh mẫu (đạo cụ: gốc toạ độ ở chân vật, cao lên phía y âm)
const EXAMPLE_SCENERY = {
  id: 'den-da', slot: 'deco', label: 'Đèn đá',
  svg: '<ellipse cx="0" cy="0" rx="24" ry="4" fill="#000000" opacity="0.12"/><rect x="-8" y="-40" width="16" height="40" fill="{stone}"/>' +
    '<rect x="-20" y="-58" width="40" height="18" rx="3" fill="{stone}"/><rect x="-9" y="-55" width="18" height="12" fill="{light}"/>' +
    '<path d="M-27,-58 L0,-78 L27,-58 Z" fill="{stone}"/><path d="M0,-78 L27,-58 L12,-58 Z" fill="#000000" opacity="0.12"/>'
};

const INSTRUCTIONS = [
  'gen-chibi dựng nhân vật chibi bằng code từ công thức JSON. Bạn (agent) viết công thức và kịch bản; hệ thống kiểm và dựng.',
  'Quy trình tạo nhân vật: get_catalog → (tuỳ chọn) get_character một nhân vật mẫu → viết asset mới → validate_character → sửa đến khi đạt → save_character → render_character để xem.',
  'Quy trình kịch bản: list_characters → get_director_schema → viết event JSON → validate_event → save_event. Owner mở Studio › Đạo diễn AI để diễn.',
  'Tư thế & hoạt động: mỗi cảnh có thể thêm activity (ăn, ngủ, chạy, tấn công…) hoặc tự ghép posture × move × motion, facing left/right. render_character nhận các khoá này để xem thử.',
  'Tạo linh kiện (đúng quy trình nhà xưởng): get_part_spec → vẽ chính diện + chọn chế độ 45° → preview_part (soát trên ma-nơ-canh, sửa đến khi đạt) → save_part → dùng trong look.parts của nhân vật. Linh kiện là DỮ LIỆU SVG (tập con an toàn), không phải code.',
  'Item trang bị (loại asset thứ hai): list_items → viết item (phối linh kiện có sẵn + bảng màu + chỉ số + độ hiếm) → validate_item → save_item → render_item (icon / card / equipped). Nhân vật mặc qua look.equip.<slot>.',
  'Cảnh (loại asset thứ ba): list_scenes → viết cảnh (phối phông có sẵn theo lớp sky/far/mid/ground/front + deco + bảng màu + time + weather) → validate_scene → save_scene → render_scene (kèm cast: nhân vật đứng ở chỗ đứng chuẩn, có activity/view). Thiếu phông: get_part_spec slot=sky|far|mid|ground|front|deco → preview_part → save_part. Kịch bản đặt vào cảnh bằng event.scene + step.spot.',
  'Phiên bản: get_app_version xem bản đang chạy và bản mới trên GitHub; update_app cập nhật ngay (tự rollback nếu bản mới lỗi); rollback_app quay về bản trước.',
  'Luật: chỉ dùng id có trong catalog; màu là mã hex; tham số nằm trong khoảng min–max; nhân vật mới lưu vào thư viện "local.my"; luôn khai báo identity.must (dấu nhận diện bắt buộc). Biểu cảm luôn khoa trương, hài, không máu.'
].join('\n');

function obj(props, required) { return { type: 'object', properties: props, required: required || [], additionalProperties: false }; }
const TOOLS = [
  { name: 'get_catalog', title: 'Kho từ vựng', description: 'Toàn bộ từ vựng được phép dùng: thư viện, bộ phận (slot) và linh kiện kèm tham số, kiểu mắt/mày, 18 biểu cảm, động tác, hiệu ứng, khoá màu, hồ sơ ánh xạ. Gọi trước khi viết công thức.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'list_characters', title: 'Danh sách nhân vật', description: 'Các nhân vật hiện có (chính thức + của người dùng): id, key, tên, thư viện, trạng thái duyệt, phiên bản, tính cách.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'get_character', title: 'Xem công thức nhân vật', description: 'Công thức JSON đầy đủ của một nhân vật (dùng làm mẫu để tạo nhân vật mới).', inputSchema: obj({ key: { type: 'string', description: 'key đầy đủ (vd. afi.khung/ma-no-canh) hoặc id ngắn (ma-no-canh)' } }, ['key']), annotations: { readOnlyHint: true } },
  { name: 'validate_character', title: 'Kiểm công thức', description: 'Chạy cổng kiểm (linh kiện, license, tham số, nhận diện, 18 biểu cảm, động tác) trên một công thức chưa lưu.', inputSchema: obj({ asset: { type: 'object', description: 'công thức nhân vật: { id, name, look: { eyes, brows, parts, params, palette }, expressions?, identity, persona? }' } }, ['asset']), annotations: { readOnlyHint: true } },
  { name: 'save_character', title: 'Lưu nhân vật', description: 'Kiểm rồi lưu nhân vật (có phiên bản). Mặc định vào thư viện local.my; nếu key trùng nhân vật đã có thì lưu thành phiên bản mới.', inputSchema: obj({ asset: { type: 'object' }, note: { type: 'string', description: 'ghi chú phiên bản' } }, ['asset']) },
  { name: 'render_character', title: 'Dựng hình', description: 'Dựng SVG của một nhân vật ở một biểu cảm. Dùng key của nhân vật đã có, hoặc truyền asset chưa lưu để xem thử.', inputSchema: obj({ key: { type: 'string' }, asset: { type: 'object' }, state: { type: 'string', description: 'id biểu cảm, mặc định normal' }, activity: { type: 'string', description: 'hoạt động: eat, sleep, run, attack… (get_catalog › activities)' }, posture: { type: 'string' }, move: { type: 'string' }, motion: { type: 'string' }, facing: { type: 'string', enum: ['left', 'right'] }, view: { type: 'string', enum: ['front', 'left', 'right', 'left45', 'right45'], description: 'góc nhìn: chính diện, nghiêng nhẹ 3/4, hoặc nghiêng 45° vẽ thật (trái/phải theo màn hình)' }, t: { type: 'number', description: 'giây trong chu kỳ động tác (bỏ trống = khung đại diện)' }, crop: { type: 'boolean', description: 'true = khung avatar (đầu và vai)' } }) , annotations: { readOnlyHint: true } },
  { name: 'get_director_schema', title: 'Schema kịch bản', description: 'JSON Schema + hướng dẫn viết kịch bản sự kiện cho các diễn viên đã chọn.', inputSchema: obj({ cast: { type: 'array', items: { type: 'string' }, description: 'id diễn viên; bỏ trống = tất cả' } }), annotations: { readOnlyHint: true } },
  { name: 'validate_event', title: 'Kiểm kịch bản', description: 'Kiểm một kịch bản sự kiện theo schema (diễn viên, biểu cảm, động tác, hiệu ứng có trong kho).', inputSchema: obj({ event: { type: 'object' }, cast: { type: 'array', items: { type: 'string' } } }, ['event']), annotations: { readOnlyHint: true } },
  { name: 'save_event', title: 'Lưu kịch bản', description: 'Kiểm rồi lưu kịch bản để owner mở và diễn trong Studio.', inputSchema: obj({ event: { type: 'object' }, author: { type: 'string', description: 'tên agent viết kịch bản' } }, ['event']) },
  { name: 'get_part_spec', title: 'Chuẩn tạo linh kiện', description: 'Khung sườn để tự vẽ linh kiện mới: khung 200×240, neo khuôn mặt/thân, lớp nên dùng cho từng bộ phận, token màu, tập SVG cho phép, quy tắc góc 45° (drawn | same | face45 | body45) và ví dụ hoàn chỉnh. Gọi trước khi vẽ.', inputSchema: obj({ slot: { type: 'string', description: 'bộ phận muốn vẽ (hat, outfit, hair…); bỏ trống = tất cả' } }), annotations: { readOnlyHint: true } },
  { name: 'preview_part', title: 'Soát linh kiện', description: 'Kiểm linh kiện chưa lưu (SVG an toàn, lớp, tham số, 45°) rồi mặc lên ma-nơ-canh chuẩn: 4 góc nhìn × đứng / kinh ngạc / chạy / ngồi. Trả lỗi cụ thể hoặc một ảnh SVG bàn soát để xem và sửa.', inputSchema: obj({ part: { type: 'object', description: '{ id, slot, label, layers: { lớp: svg }, views: { q45: "same" | "face45" | "body45" | { mode: "drawn", layers } }, params? }' } }, ['part']), annotations: { readOnlyHint: true } },
  { name: 'save_part', title: 'Lưu linh kiện', description: 'Kiểm rồi lưu linh kiện vào thư viện "Của tôi" (local.my), có phiên bản. Sau khi lưu, nhân vật dùng được qua look.parts.<slot> = "local.my/<id>".', inputSchema: obj({ part: { type: 'object' }, note: { type: 'string' } }, ['part']) },
  { name: 'list_items', title: 'Danh sách item', description: 'Item trang bị hiện có (chính thức + của người dùng): key, tên, loại, độ hiếm, bộ phận mặc, linh kiện, chỉ số. Lọc theo type / rarity.', inputSchema: obj({ type: { type: 'string' }, rarity: { type: 'string' } }), annotations: { readOnlyHint: true } },
  { name: 'validate_item', title: 'Kiểm item', description: 'Kiểm item chưa lưu: loại ↔ bộ phận, linh kiện có thật, màu hex theo token, chỉ số 0–999, dựng được icon/thẻ. Item = phối linh kiện có sẵn (hoặc linh kiện tự tạo qua save_part) + bảng màu riêng + chỉ số + độ hiếm.', inputSchema: obj({ item: { type: 'object', description: '{ id, name, han?, type, rarity, equip: { slot?, part, params?, palette? }, stats?, description?, lore?, icon? }' } }, ['item']), annotations: { readOnlyHint: true } },
  { name: 'save_item', title: 'Lưu item', description: 'Kiểm rồi lưu item vào thư viện "Của tôi" (có phiên bản). Nhân vật mặc qua look.equip.<slot> = "local.my/<id>".', inputSchema: obj({ item: { type: 'object' }, note: { type: 'string' } }, ['item']) },
  { name: 'render_item', title: 'Dựng item', description: 'SVG của item: mode icon (ô vuông theo độ hiếm), card (thẻ: tên, loại, độ hiếm, chỉ số, mô tả) hoặc equipped (mặc lên nhân vật character, có thể kèm view/activity).', inputSchema: obj({ key: { type: 'string' }, item: { type: 'object' }, mode: { type: 'string', enum: ['icon', 'card', 'equipped'] }, character: { type: 'string' }, view: { type: 'string', enum: ['front', 'left', 'right', 'left45', 'right45'] }, activity: { type: 'string' } }), annotations: { readOnlyHint: true } },
  { name: 'list_scenes', title: 'Danh sách cảnh', description: 'Cảnh hiện có (chính thức + của người dùng): key, tên, giờ, thời tiết, các lớp phông, chỗ đứng.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'validate_scene', title: 'Kiểm cảnh', description: 'Kiểm cảnh chưa lưu: phông có thật đúng lớp, đạo cụ ≤ 10, màu hex theo token cảnh, giờ, thời tiết, chỗ đứng; dựng được và đặt được diễn viên ở mọi chỗ đứng. Cảnh = phối phông có sẵn (hoặc phông tự tạo qua save_part).', inputSchema: obj({ scene: { type: 'object', description: '{ id, name, han?, description?, layers: { sky, ground, far?, mid?, front? : "id phông" | { part, dx?, flip? } }, deco?: [{ part, x, y?, scale?, flip?, z?: back|mid|front }], palette?, time?: day|dawn|dusk|night, weather?: clear|rain|snow|petals|leaves|mist|fireflies, spots? }' } }, ['scene']), annotations: { readOnlyHint: true } },
  { name: 'save_scene', title: 'Lưu cảnh', description: 'Kiểm rồi lưu cảnh vào thư viện "Của tôi" (có phiên bản). Kịch bản dùng qua event.scene = "local.my/<id>".', inputSchema: obj({ scene: { type: 'object' }, note: { type: 'string' } }, ['scene']) },
  { name: 'render_scene', title: 'Dựng cảnh', description: 'SVG 640×360 của một cảnh (key đã lưu hoặc scene nháp), có thể đặt dàn diễn viên: cast = [{ character, spot, state?, activity?, posture?, move?, motion?, facing?, view? }] (≤ 8). Từ hai diễn viên trở lên, ai chưa chọn view sẽ tự quay 45° về giữa. time / weather để xem thử biến thể.', inputSchema: obj({ key: { type: 'string' }, scene: { type: 'object' }, cast: { type: 'array', items: { type: 'object' } }, time: { type: 'string', enum: ['day', 'dawn', 'dusk', 'night'] }, weather: { type: 'string', enum: ['clear', 'rain', 'snow', 'petals', 'leaves', 'mist', 'fireflies'] } }), annotations: { readOnlyHint: true } },
  { name: 'get_app_version', title: 'Phiên bản ứng dụng', description: 'Phiên bản đang chạy, bản mới nhất trên GitHub Releases, ghi chú phát hành, bản có thể quay về và lịch sử cập nhật. check=false để không hỏi GitHub.', inputSchema: obj({ check: { type: 'boolean', description: 'hỏi GitHub bản mới nhất (mặc định true)' } }), annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'update_app', title: 'Cập nhật ứng dụng', description: 'Tải bản mới nhất từ GitHub Releases (kiểm SHA-256, sao lưu dữ liệu) rồi khởi động lại. Bản mới lỗi thì launcher tự quay về bản cũ. Kết nối ngắt vài giây; gọi get_app_version sau ~15 giây để xác nhận. force=true áp cả bản từng bị bỏ qua vì lần trước chạy lỗi.', inputSchema: obj({ force: { type: 'boolean' } }), annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true } },
  { name: 'rollback_app', title: 'Quay về bản trước', description: 'Chạy lại bản cài trước đó (sao lưu dữ liệu trước khi đổi). Cần confirm = "ROLLBACK".', inputSchema: obj({ confirm: { type: 'string', enum: ['ROLLBACK'] } }, ['confirm']), annotations: { destructiveHint: true } }
];

function text(t, extra) { return Object.assign({ content: [{ type: 'text', text: t }] }, extra || {}); }
function json(v) { return { content: [{ type: 'text', text: JSON.stringify(v, null, 2) }], structuredContent: Array.isArray(v) ? { items: v } : v }; }
function toolError(msg) { return { content: [{ type: 'text', text: msg }], isError: true }; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

class MCP {
  // system (tuỳ chọn): { updater, restartSoon } — để agent tự kiểm và cập nhật phiên bản
  constructor({ engine, store, version, system }) {
    this.GC = engine;
    this.store = store;
    this.version = version;
    this.system = system || null;
    this.restarting = false;
    if (!this.GC.PACKS[MY_PACK]) this.GC.pack({ id: MY_PACK, name: 'Của tôi', owner: 'Bạn', group: 'mine', visibility: 'private', license: 'Thuộc người tạo' }, () => {});
    if (!this.GC.PACKS[TMP_PACK]) this.GC.pack({ id: TMP_PACK, name: 'Bàn soát (tạm)', owner: 'Bạn', group: 'mine', visibility: 'private', license: 'Thuộc người tạo' }, () => {});
    (this.store.listParts ? this.store.listParts() : []).forEach(d => this.GC.registerDataPart(MY_PACK, d));
    (this.store.listItems ? this.store.listItems() : []).forEach(d => { const r = this.GC.registerItem(MY_PACK, d); if (r.errors.length) console.warn('bỏ item', d.id, r.errors); });
    (this.store.listScenes ? this.store.listScenes() : []).forEach(d => { const r = this.GC.registerScene(MY_PACK, d); if (r.errors.length) console.warn('bỏ cảnh', d.id, r.errors); });
  }
  sync() { this.store.listAssets().forEach(a => this.GC.registerAsset(a.pack, clone(a))); }

  catalog() {
    const GC = this.GC, L = GC.LIB;
    const slots = {};
    Object.keys(L.slots).forEach(s => {
      slots[s] = { label: L.slots[s].label, default: L.slots[s].fallback, parts: GC.partsOfSlot(s).map(p => {
        const o = { id: p.id, label: p.label, pack: p.pack, views: ['front'].concat(p.views ? Object.keys(p.views) : []) };
        if (p.params) o.params = Object.keys(p.params).reduce((m, k) => { const d = p.params[k]; m[k] = { label: d.label, min: d.min, max: d.max, default: d.def }; return m; }, {});
        return o;
      }) };
    });
    const face = {};
    Object.keys(GC.FACE_PARAMS).forEach(g => { face[g] = Object.keys(GC.FACE_PARAMS[g]).reduce((m, k) => { const d = GC.FACE_PARAMS[g][k]; m[k] = { label: d.label, min: d.min, max: d.max, default: d.def }; return m; }, {}); });
    return {
      engine: GC.version, app: this.version,
      packs: Object.keys(GC.PACKS).map(k => { const p = GC.PACKS[k]; return { id: p.id, name: p.name, group: p.group, owner: p.owner }; }),
      slots, eyeStyles: Object.keys(L.eyeStyles).map(k => ({ id: k, label: L.eyeStyles[k].label })),
      browStyles: Object.keys(L.browStyles).map(k => ({ id: k, label: L.browStyles[k].label })),
      faceParams: face,
      paletteKeys: Object.keys(L.defaults), paletteDefaults: L.defaults,
      states: L.stateOrder.map(id => ({ id, label: L.states[id].label, hint: L.states[id].hint })),
      expressionOverrides: { eyes: Object.keys(L.eyePoses), brows: Object.keys(L.browPoses), mouth: Object.keys(L.mouths), motion: Object.keys(L.motions), fx: Object.keys(L.fx) },
      motions: Object.keys(L.motions).map(id => ({ id, label: L.motions[id].label })),
      activities: L.activityOrder.map(id => { const a = L.activities[id]; return { id, label: a.label, group: a.group, hint: a.hint, posture: a.posture || 'stand', move: a.move || null, action: a.action || null }; }),
      postures: Object.keys(L.postures).map(id => ({ id, label: L.postures[id].label, handsBusy: !!L.postures[id].handsBusy })),
      moves: Object.keys(L.moves).map(id => ({ id, label: L.moves[id].label, postures: L.moves[id].postures || null })),
      props: Object.keys(L.props).map(id => ({ id, label: L.props[id].label })),
      items: { types: Object.keys(GC.ITEM.types).map(k => ({ id: k, label: GC.ITEM.types[k].label, slots: GC.ITEM.types[k].slots })), rarity: GC.ITEM.rarityOrder.map(k => ({ id: k, label: GC.ITEM.rarity[k].label })),
        stats: GC.ITEM.stats, count: GC.items().length },
      scenes: this.sceneVocab(),
      composition: 'Khung hình = state (nét mặt) × activity (đặt sẵn) hoặc posture × move × motion, cộng facing left/right và view front/left/right (nghiêng nhẹ) / left45/right45 (nghiêng 45° vẽ thật ở mức linh kiện; linh kiện chưa có bản 45° thì engine trượt).',
      fx: Object.keys(L.fx).map(id => ({ id, label: L.fx[id].label })),
      traits: L.traits.map(t => ({ id: t.id, label: t.label })),
      profiles: Object.keys(L.profiles).map(id => ({ id, label: L.profiles[id].label, map: L.profiles[id].map })),
      assetShape: {
        id: 'chữ thường-gạch-ngang', name: 'Tên hiển thị', han: 'tuỳ chọn', faction: '', role: '', persona: 'tính cách cho AI đạo diễn',
        look: { eyes: 'id kiểu mắt', brows: 'id kiểu mày', parts: { slot: 'id linh kiện' }, params: { 'slot|eyes|brows|mouth|rig': { tham_so: 'số' } }, palette: { khoa_mau: '#hex' } },
        expressions: { 'id biểu cảm': { eyes: '', brows: '', mouth: '', motion: '', fx: ['…'], fxAdd: ['…'], fxRemove: ['…'] } },
        lines: { 'id biểu cảm': ['câu cửa miệng'] },
        identity: { p1: 'dấu nhận diện chính ở 32 px', must: ['slot:id linh kiện'], source: 'nguồn tư liệu' }
      }
    };
  }

  // opts.allowAnyPack: chỉ đường Studio (chủ máy, có token) — MCP và AI trong chatroom chỉ ghi vào thư viện group "mine"
  prepare(a, opts) {
    if (!a || typeof a !== 'object') throw new Error('asset phải là object');
    const x = clone(a);
    x.id = String(x.id || '').toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(x.id)) throw new Error('id phải gồm chữ thường, số, gạch ngang (1–64 ký tự)');
    const P = x.pack && Object.prototype.hasOwnProperty.call(this.GC.PACKS, x.pack) ? this.GC.PACKS[x.pack] : null;
    x.pack = P && (P.group === 'mine' || (opts && opts.allowAnyPack)) && x.pack !== TMP_PACK ? x.pack : MY_PACK;
    x.key = x.pack + '/' + x.id;
    x.look = x.look || {};
    x.look.parts = x.look.parts || {};
    x.version = x.version || 0;
    x.status = ['draft', 'review', 'approved'].indexOf(x.status) >= 0 ? x.status : 'draft';
    return this.GC.migrate(x);
  }
  // nhận key đầy đủ (pack/id) hoặc id ngắn (ưu tiên bản trong "Của tôi")
  findAsset(key) {
    this.sync();
    if (this.GC.ASSETS[key]) return this.GC.ASSETS[key];
    const hits = this.GC.assets().filter(a => a.id === key);
    return hits.filter(a => a.pack === MY_PACK)[0] || hits[0] || null;
  }

  async callTool(name, args, ctx) {
    const GC = this.GC;
    args = args || {};
    switch (name) {
      case 'get_catalog': return json(this.catalog());
      case 'list_characters': {
        this.sync();
        return json(GC.assets().map(a => ({ id: a.id, key: a.key, name: a.name, pack: a.pack, status: a.status, version: a.version, role: a.role, persona: a.persona })));
      }
      case 'get_character': {
        const a = this.findAsset(String(args.key || ''));
        return a ? json(a) : toolError('Không có nhân vật ' + args.key + '. Gọi list_characters để xem khoá.');
      }
      case 'validate_character': {
        let a; try { a = this.prepare(args.asset); } catch (e) { return toolError(e.message); }
        const g = GC.gate(a, { poses: true });
        return json({ ok: g.every(x => x.ok), gates: g });
      }
      case 'save_character': {
        let r;
        try { r = this.saveAssetChecked(args.asset, args.note || 'Lưu qua ' + (ctx && ctx.channel === 'ui' ? 'AI trong Studio' : 'MCP')); }
        catch (e) { return e.gates ? Object.assign(json({ saved: false, blocking: e.blocking, gates: e.gates }), { isError: true }) : toolError(e.message); }
        return json({ saved: true, key: r.key, version: r.version, status: r.status, studio: 'Mở Studio › Nhân vật › ' + r.name });
      }
      case 'render_character': {
        let a;
        if (args.asset) { try { a = this.prepare(args.asset); } catch (e) { return toolError(e.message); } }
        else a = this.findAsset(String(args.key || ''));
        if (!a) return toolError('Cần key của nhân vật đã có hoặc asset để dựng thử.');
        const act = args.activity && GC.LIB.activities[args.activity];
        if (args.activity && !act) return toolError('Không có hoạt động ' + args.activity + '. Xem get_catalog › activities.');
        const state = GC.LIB.states[args.state] ? args.state : (act && act.state) || 'normal';
        const dir = {};
        if (act) dir.activity = act.id;
        ['posture', 'move', 'motion', 'facing', 'view'].forEach(k => { if (typeof args[k] === 'string') dir[k] = args[k]; });
        let svg;
        try { svg = GC.svgString(a, state, { crop: !!args.crop, noShadow: !!args.crop, director: Object.keys(dir).length ? dir : undefined, t: typeof args.t === 'number' && isFinite(args.t) ? Math.max(0, Math.min(60, args.t)) : undefined }); } catch (e) { return toolError('Không dựng được: ' + e.message); }
        const label = GC.LIB.states[state].label + (act ? ' · ' + act.label : '');
        return {
          content: [
            { type: 'text', text: 'SVG của ' + (a.name || a.id) + ' · ' + label + ' (' + svg.length + ' ký tự). Mở được trực tiếp trong trình duyệt.' },
            { type: 'resource', resource: { uri: 'genchibi://render/' + a.key + '/' + state + (act ? '-' + act.id : '') + (args.crop ? '-avatar' : '') + '.svg', mimeType: 'image/svg+xml', text: svg } }
          ]
        };
      }
      case 'get_director_schema': {
        this.sync();
        const cast = this.castOf(args.cast);
        return json({ schema: GC.director.schema(cast), guide: GC.director.prompt(cast).split('\nSchema:')[0] });
      }
      case 'validate_event': {
        this.sync();
        const errs = GC.director.validate(args.event, this.castOf(args.cast));
        return json({ ok: !errs.length, errors: errs });
      }
      case 'save_event': {
        this.sync();
        const errs = GC.director.validate(args.event, GC.assets());
        if (errs.length) return Object.assign(json({ saved: false, errors: errs }), { isError: true });
        const rec = this.store.saveEvent(args.event, args.author || 'agent qua MCP');
        return json({ saved: true, id: rec.id, studio: 'Mở Studio › Đạo diễn AI › Kịch bản đã lưu › ' + args.event.title });
      }
      case 'get_app_version': case 'update_app': case 'rollback_app': return this.appTool(name, args, ctx || {});
      case 'get_part_spec': return json(this.partSpec(args.slot));
      case 'list_items': {
        return json(GC.items().filter(i => (!args.type || i.type === args.type) && (!args.rarity || i.rarity === args.rarity))
          .map(i => ({ key: i.key, name: i.name, type: i.type, rarity: i.rarity, slot: i.equip.slot, part: i.equip.part, stats: i.stats })));
      }
      case 'validate_item': {
        const c = GC.checkItem(args.item);
        return json({ ok: !c.errors.length, errors: c.errors, gates: c.errors.length ? [] : GC.itemGate(c.def) });
      }
      case 'save_item': {
        let rec;
        try { rec = this.saveItemChecked(args.item, args.note || 'Lưu qua MCP'); }
        catch (e) { return Object.assign(json({ saved: false, errors: e.errors || [e.message] }), { isError: true }); }
        return json({ saved: true, key: rec.key, version: rec.version, use: 'Nhân vật mặc: look.equip.' + rec.equip.slot + ' = "' + rec.key + '"', studio: 'Studio › Trang bị › ' + rec.name });
      }
      case 'render_item': {
        let it;
        if (args.item) { const c = GC.checkItem(args.item); if (c.errors.length) return toolError(c.errors.join('; ')); it = Object.assign({ key: 'preview/' + c.def.id }, c.def); }
        else it = GC.getItem(String(args.key || ''), MY_PACK);
        if (!it) return toolError('Không có item ' + args.key + '. Gọi list_items.');
        let svg, tmp = null;
        if (args.mode === 'equipped' && args.item) { tmp = GC.registerItem(TMP_PACK, it).def; it = tmp; }   // bản nháp: mặc thử, xoá ngay sau khi dựng
        try {
        if (args.mode === 'equipped') {
          const base = this.findAsset(String(args.character || 'ma-no-canh'));
          if (!base) return toolError('Không có nhân vật ' + args.character);
          const a = clone(base); a.key = 'equip/' + it.key.replace(/[^a-z0-9]/gi, ''); a.look.equip = Object.assign({}, a.look.equip, { [it.equip.slot]: it.key });
          const dir = {}; if (args.view) dir.view = args.view; if (args.activity && GC.LIB.activities[args.activity]) dir.activity = args.activity;
          try { svg = GC.svgString(a, (GC.LIB.activities[dir.activity] || {}).state || 'normal', { director: dir }); } catch (e) { return toolError('Không dựng được: ' + e.message); }
        } else svg = GC.itemSvg(it, { mode: args.mode === 'card' ? 'card' : 'icon', size: 160 });
        } finally { if (tmp) { delete GC.ITEMS[tmp.key]; const i = GC.ITEM_ORDER.indexOf(tmp.key); if (i >= 0) GC.ITEM_ORDER.splice(i, 1); } }
        return { content: [{ type: 'text', text: it.name + ' · ' + (GC.ITEM.rarity[it.rarity] || {}).label + ' · ' + (args.mode || 'icon') }, { type: 'resource', resource: { uri: 'genchibi://item/' + it.key + '/' + (args.mode || 'icon') + '.svg', mimeType: 'image/svg+xml', text: svg } }] };
      }
      case 'list_scenes': {
        return json(GC.scenes().map(x => ({ key: x.key, name: x.name, han: x.han, time: x.time, weather: x.weather, layers: Object.keys(x.layers).reduce((m, k) => { m[k] = x.layers[k].part; return m; }, {}), deco: x.deco.length, spots: x.spots, description: x.description })));
      }
      case 'validate_scene': {
        const c = GC.checkScene(args.scene);
        return json({ ok: !c.errors.length, errors: c.errors, gates: c.errors.length ? [] : GC.sceneGate(c.def) });
      }
      case 'save_scene': {
        let rec;
        try { rec = this.saveSceneChecked(args.scene, args.note || 'Lưu qua MCP'); }
        catch (e) { return Object.assign(json({ saved: false, errors: e.errors || [e.message] }), { isError: true }); }
        return json({ saved: true, key: rec.key, version: rec.version, use: 'Kịch bản: event.scene = "' + rec.key + '"; dựng: render_scene key=' + rec.key, studio: 'Studio › Thư viện › Cảnh › ' + rec.name });
      }
      case 'render_scene': {
        let sc;
        if (args.scene) { const c = GC.checkScene(args.scene); if (c.errors.length) return toolError(c.errors.join('; ')); sc = Object.assign({ key: 'preview/' + c.def.id }, c.def); }
        else sc = GC.getScene(String(args.key || ''), MY_PACK);
        if (!sc) return toolError('Không có cảnh ' + args.key + '. Gọi list_scenes.');
        this.sync();
        const cast = args.cast || [];
        const errs = GC.checkCast(cast, sc);
        if (errs.length) return toolError(errs.join('; '));
        const opts = { cast: cast.map(m => Object.assign({}, m, { asset: this.findAsset(String(m.character)) })) };
        const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
        if (args.time !== undefined && !has(GC.SCENE.times, args.time)) return toolError('time: chọn ' + GC.SCENE.timeOrder.join(' | '));
        if (args.weather !== undefined && !has(GC.SCENE.weathers, args.weather)) return toolError('weather: chọn ' + GC.SCENE.weatherOrder.join(' | '));
        if (args.time) opts.time = args.time; if (args.weather) opts.weather = args.weather;
        let svg;
        try { svg = GC.sceneSvg(sc, opts); } catch (e) { return toolError('Không dựng được: ' + e.message); }
        return { content: [{ type: 'text', text: sc.name + ' · ' + GC.SCENE.times[opts.time || sc.time].label + ' · ' + GC.SCENE.weathers[opts.weather || sc.weather].label + ' · ' + cast.length + ' diễn viên' },
          { type: 'resource', resource: { uri: 'genchibi://scene/' + sc.key + '.svg', mimeType: 'image/svg+xml', text: svg } }] };
      }
      case 'preview_part': {
        const c = GC.checkDataPart(args.part);
        if (c.errors.length) return Object.assign(json({ ok: false, errors: c.errors, hint: 'Sửa đúng các lỗi trên rồi gọi lại preview_part. Chuẩn: get_part_spec.' }), { isError: true });
        const r = GC.registerDataPart(TMP_PACK, c.def);
        if (c.def.kind === 'scenery') {
          try {
            return { content: [{ type: 'text', text: 'Đạt kiểm dữ liệu. Bàn soát phông: đặt vào sân khấu chuẩn kèm ma-nơ-canh, ban ngày và ban đêm. Kiểm: đúng khung 640×360 (đạo cụ: gốc ở chân), màu theo token cảnh, không che diễn viên. Ổn thì save_part.' },
              { type: 'resource', resource: { uri: 'genchibi://bench/' + c.def.slot + '/' + c.def.id + '.svg', mimeType: 'image/svg+xml', text: this.sceneBench(c.def.slot, TMP_PACK + '/' + c.def.id) } }] };
          } finally { delete GC.LIB.parts[TMP_PACK + '/' + c.def.slot + ':' + c.def.id]; }
        }
        try {
          const svg = this.bench(c.def.slot, TMP_PACK + '/' + c.def.id, c.def.label);
          return {
            content: [
              { type: 'text', text: 'Đạt kiểm dữ liệu. Bàn soát: ma-nơ-canh × 4 góc nhìn (chính diện, 3/4, 45° trái, 45° phải) × đứng / kinh ngạc / chạy / ngồi. 45°: ' + c.def.views.q45.mode + '. Kiểm: mép khớp đầu/thân, 45° không lệch, màu theo token. Ổn thì save_part.' },
              { type: 'resource', resource: { uri: 'genchibi://bench/' + c.def.slot + '/' + c.def.id + '.svg', mimeType: 'image/svg+xml', text: svg } }
            ]
          };
        } finally { delete GC.LIB.parts[TMP_PACK + '/' + c.def.slot + ':' + c.def.id]; if (r && r.errors.length) { /* đã báo ở trên */ } }
      }
      case 'save_part': {
        let rec;
        try { rec = this.savePartChecked(args.part, args.note || 'Lưu qua MCP'); }
        catch (e) { return Object.assign(json({ saved: false, errors: e.errors || [e.message] }), { isError: true }); }
        if (rec.kind === 'scenery') return json({ saved: true, ref: MY_PACK + '/' + rec.id, slot: rec.slot, version: rec.version,
          use: rec.slot === 'deco' ? 'Trong cảnh: deco: [{ part: "' + MY_PACK + '/' + rec.id + '", x, y }]' : 'Trong cảnh: layers.' + rec.slot + ' = "' + MY_PACK + '/' + rec.id + '"', studio: 'Studio › Xưởng › Kho linh kiện › Phông cảnh' });
        return json({ saved: true, ref: MY_PACK + '/' + rec.id, slot: rec.slot, version: rec.version,
          use: 'Trong công thức nhân vật: look.parts.' + rec.slot + ' = "' + MY_PACK + '/' + rec.id + '"', studio: 'Studio › Xưởng › Kho linh kiện › ' + rec.label + ' (bấm để soát)' });
      }
      default: return null;
    }
  }
  async appTool(name, args, ctx) {
    const sys = this.system;
    if (!sys || !sys.updater) return toolError('Bản chạy này không tự cập nhật được (đang chạy từ mã nguồn, không qua bản cài).');
    const up = sys.updater;
    // Link có khoá chỉ được kiểm và cập nhật lên bản mới bình thường. Rollback và force (ép chạy bản từng hỏng)
    // cần token chủ máy hoặc stdio: lặp rollback qua link sẽ đẩy hết backup cũ ra khỏi vòng giữ 10 bản.
    if (ctx.viaLink && (name === 'rollback_app' || (name === 'update_app' && args.force === true)))
      return toolError('Qua link MCP chỉ được kiểm và cập nhật bình thường. Rollback/force: dùng Studio, genchibi, hoặc MCP có token chủ máy.');
    if (name !== 'get_app_version' && this.restarting) return toolError('Đang khởi động lại để đổi phiên bản — gọi get_app_version sau ~15 giây.');
    const view = (st) => ({
      current: 'v' + String(st.current).replace(/^v/, ''), latest: st.latest || null, available: !!st.available, skipped: !!st.skipped,
      publishedAt: st.publishedAt || null, notes: st.notes ? String(st.notes).slice(0, 4000) : null, lastCheck: st.lastCheck || null, error: st.error || null,
      previous: st.previous, canRollback: !!st.canRollback, busy: !!st.busy, history: (st.history || []).slice(0, 5)
    });
    if (name === 'get_app_version') {
      if (args.check === false) return json(view(up.status()));
      try { return json(view(await up.check())); }
      catch (e) { return json(Object.assign(view(up.status()), { error: 'Không hỏi được GitHub: ' + e.message })); }
    }
    if (name === 'update_app') {
      let r;
      try { r = await up.apply({ force: args.force === true }); }
      catch (e) { return toolError('Cập nhật thất bại, vẫn chạy bản hiện tại: ' + e.message); }
      if (r.restart) { this.restarting = true; sys.restartSoon(); }
      return json(Object.assign({}, r, { next: r.restart ? 'Đợi ~15 giây rồi gọi get_app_version để xác nhận bản mới đang chạy.' : null }));
    }
    if (args.confirm !== 'ROLLBACK') return toolError('Cần confirm = "ROLLBACK".');
    if (up.busy) return toolError('Đang cập nhật, thử lại sau.');
    try { const r = up.rollback(); this.restarting = true; sys.restartSoon(); return json(r); }
    catch (e) { return toolError(e.message); }
  }
  /* ---- CỔNG GHI DUY NHẤT: MCP, HTTP (Studio) và AI trong chatroom đều ghi qua hai hàm này ---- */
  saveAssetChecked(raw, note, opts) {
    const a = this.prepare(raw, opts);
    const gates = this.GC.gate(a, { poses: true });
    const blocking = this.GC.blockingGates(gates, a.status);
    if (blocking.length) throw Object.assign(new Error('Chưa đạt cổng kiểm: ' + blocking.map(g => g.label + (g.detail ? ' (' + g.detail + ')' : '')).join('; ')), { code: 422, gates, blocking: blocking.map(g => g.id) });
    const rec = this.store.saveAsset(a.key, a, note);
    this.GC.registerAsset(rec.pack, clone(rec));
    return rec;
  }
  savePartChecked(part, note) {
    const c = this.GC.checkDataPart(part);
    if (!c.errors.length) {
      const clash = this.GC.partsOfSlot(c.def.slot).find(p => p.id === c.def.id && p.pack !== MY_PACK && p.pack !== TMP_PACK);
      if (clash) c.errors.push('id "' + c.def.id + '" trùng linh kiện của thư viện ' + clash.pack + ' — chọn id khác (ví dụ "' + c.def.id + '-2")');
    }
    if (c.errors.length) throw Object.assign(new Error('Linh kiện chưa đạt: ' + c.errors.slice(0, 6).join('; ')), { code: 422, errors: c.errors });
    const rec = this.store.savePart(c.def, note);
    this.GC.registerDataPart(MY_PACK, rec);
    return rec;
  }
  saveItemChecked(item, note) {
    const c = this.GC.checkItem(item);
    if (!c.errors.length) {
      if (this.GC.items().some(i => i.id === c.def.id && i.pack !== MY_PACK)) c.errors.push('id "' + c.def.id + '" trùng item của thư viện chính thức — chọn id khác');
      const prev = this.GC.ITEMS[MY_PACK + '/' + c.def.id];
      if (prev && prev.equip.slot !== c.def.equip.slot) c.errors.push('item "' + c.def.id + '" đang ở bộ phận ' + prev.equip.slot + ' — đổi bộ phận thì tạo id mới (nhân vật đang mặc sẽ không vỡ)');
      const bad = this.GC.itemGate(c.def).filter(g => !g.ok && !g.info);
      bad.forEach(g => c.errors.push(g.label + (g.detail ? ': ' + g.detail : '')));
    }
    if (c.errors.length) throw Object.assign(new Error('Item chưa đạt: ' + c.errors.slice(0, 6).join('; ')), { code: 422, errors: c.errors });
    const rec = this.store.saveItem(c.def, note);
    const r = this.GC.registerItem(MY_PACK, rec);
    return r.def;
  }
  saveSceneChecked(scene, note) {
    const c = this.GC.checkScene(scene);
    if (!c.errors.length) {
      if (this.GC.scenes().some(x => x.id === c.def.id && x.pack !== MY_PACK)) c.errors.push('id "' + c.def.id + '" trùng cảnh của thư viện chính thức — chọn id khác');
      this.GC.sceneGate(Object.assign({ key: MY_PACK + '/' + c.def.id }, c.def)).filter(g => !g.ok && !g.info).forEach(g => c.errors.push(g.label + (g.detail ? ': ' + g.detail : '')));
    }
    if (c.errors.length) throw Object.assign(new Error('Cảnh chưa đạt: ' + c.errors.slice(0, 6).join('; ')), { code: 422, errors: c.errors });
    const rec = this.store.saveScene(c.def, note);
    return this.GC.registerScene(MY_PACK, rec).def;
  }
  // Từ vựng cảnh (catalog): lớp + phông, chỗ đứng, giờ, thời tiết, token màu, ngân sách
  sceneVocab() {
    const GC = this.GC, S = GC.SCENE;
    return {
      canvas: { width: S.W, height: S.H }, count: GC.scenes().length,
      layers: Object.keys(S.slots).reduce((m, k) => { m[k] = { label: S.slots[k].label, required: !!S.slots[k].required, scenery: GC.scenery(k).filter(p => p.pack !== TMP_PACK).map(p => ({ ref: p.pack + '/' + p.id, label: p.label })) }; return m; }, {}),
      spots: S.spotOrder.map(k => ({ id: k, label: S.spots[k].label, x: S.spots[k].x, y: S.spots[k].y, scale: S.spots[k].k })),
      times: S.timeOrder.map(k => ({ id: k, label: S.times[k].label })), weathers: S.weatherOrder.map(k => ({ id: k, label: S.weathers[k].label })),
      paletteKeys: Object.keys(S.defaults), paletteDefaults: S.defaults, budget: S.budget
    };
  }
  sceneSpec(slot) {
    const GC = this.GC, S = GC.SCENE;
    return {
      standard: 'Phông là nguyên liệu của cảnh: vẽ một lần, dùng cho nhiều cảnh. Chỉ dùng token màu cảnh để đổi giờ (đêm, hoàng hôn) và bảng màu riêng của cảnh không phải vẽ lại.',
      canvas: { width: S.W, height: S.H, horizon: '≈ y 230–260', groundFrom: 258, frontRow: 330, backRow: 280,
        note: 'sky/far/mid/ground/front vẽ trên cả khung 640×360; deco (đạo cụ) vẽ quanh gốc (0,0) = chân vật, cao lên phía y âm (cao 40–200), engine đặt theo x, y, scale, flip' },
      layers: Object.keys(S.slots).filter(k => !slot || k === slot).map(k => ({ slot: k, label: S.slots[k].label, examples: GC.scenery(k).filter(p => p.pack !== TMP_PACK).slice(0, 6).map(p => p.pack + '/' + p.id) })),
      paint: { tokens: Object.keys(S.defaults).map(k => '{' + k + '}').concat('{ink}'), rule: 'fill/stroke: hex, "none" hoặc token cảnh {sky} {grass}… (KHÔNG dùng token nhân vật)' },
      style: 'phẳng, mềm, viền mảnh hoặc không viền (nhân vật có viền đậm phải nổi lên trên phông); bóng: fill="#000000" opacity 0.06–0.14',
      svg: 'cùng tập SVG an toàn như linh kiện (g, path, circle, ellipse, rect, line, polyline, polygon); ≤ 20 000 ký tự',
      shape: '{ id, slot, label, svg: "<…/>", outdoor?: (chỉ sky) false nếu là trong nhà }',
      example: EXAMPLE_SCENERY
    };
  }
  // Bàn soát phông: sân khấu chuẩn + phông đang soát + ma-nơ-canh, ngày và đêm cạnh nhau
  sceneBench(slot, ref) {
    const GC = this.GC, S = GC.SCENE;
    const sc = { key: 'bench/' + slot, id: 'bench', layers: { sky: { part: 'afi.khung/khung-troi', dx: 0 }, ground: { part: 'afi.khung/khung-nen', dx: 0 } }, deco: [], palette: {}, time: 'day', weather: 'clear', spots: S.spotOrder.slice() };
    if (slot === 'deco') sc.deco = [{ part: ref, x: 130, y: 300, scale: 1, flip: false, z: 'back' }, { part: ref, x: 500, y: 290, scale: 0.7, flip: true, z: 'back' }];
    else sc.layers[slot] = { part: ref, dx: 0 };
    const demo = this.findAsset('ma-no-canh'), cast = demo ? [{ asset: demo, spot: 'center' }] : [];
    const one = t => GC.sceneSvg(sc, { cast, time: t }).replace(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 640 360">/, '');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1290 360"><svg x="0" y="0" width="640" height="360" viewBox="0 0 640 360">' + one('day') +
      '<svg x="650" y="0" width="640" height="360" viewBox="0 0 640 360">' + one('night') + '</svg>';
  }
  // Tool cho AI trong chatroom (LLM API): đúng bộ tool MCP, trừ tool hệ thống (cập nhật/rollback app)
  toolsFor(channel) { return TOOLS.filter(t => channel !== 'ui' || !/^(update_app|rollback_app)$/.test(t.name)); }
  partSpec(slot) {
    const GC = this.GC, A = GC.RIG.anchors;
    if (slot && Object.prototype.hasOwnProperty.call(GC.SCENE.slots, slot)) return { kind: 'scenery', scenery: this.sceneSpec(slot) };
    const slots = Object.keys(GC.LIB.slots).filter(k => !slot || k === slot).map(k => ({ slot: k, label: GC.LIB.slots[k].label, layers: SLOT_LAYERS[k] || [],
      examples: GC.partsOfSlot(k).filter(p => p.id !== 'none' && p.pack !== TMP_PACK).slice(0, 6).map(p => p.pack + '/' + p.id) }));
    return {
      standard: 'docs/QUY-TRINH-LINH-KIEN.md — nhân vật = phối linh kiện; linh kiện tốt dùng cho hàng trăm nhân vật ở mọi biểu cảm, tư thế, góc nhìn.',
      canvas: { box: GC.RIG.box, ground: 228, centerX: 100, note: 'toạ độ tư thế nghỉ, đơn vị SVG; đầu chiếm khoảng x 50–150, y 54–150; thân trên y 146–194 (thắt lưng), vạt 188–219; chân y 198–228' },
      anchors: A,
      joints: Object.keys(GC.RIG.joints).reduce((m, j) => { m[j] = { parent: GC.RIG.joints[j].parent, pivot: GC.RIG.joints[j].pivot }; return m; }, {}),
      shapes: { headRound: 'M50,100 C50,68 72,54 100,54 C128,54 150,68 150,100 C150,130 128,147 100,147 C72,147 50,130 50,100 Z', torsoUp: GC.helpers.TORSO_UP, hem: GC.helpers.HEM },
      slots,
      paint: { tokens: Object.keys(GC.LIB.defaults).map(k => '{' + k + '}').concat('{ink}'), rule: 'fill/stroke chỉ nhận mã hex (#rrggbb), "none" hoặc token {robe}… — token đổi theo bảng màu của từng nhân vật nên linh kiện dùng chung được' },
      style: { outline: 'stroke="{ink}" stroke-width 2.6–3.2, stroke-linejoin="round"', inner: 'chi tiết 1.4–2', shade: 'bóng: fill="#000" fill-opacity 0.08–0.14' },
      svg: { tags: ['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'], attributes: ['d', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'transform', 'class'],
        rules: 'thuộc tính dùng nháy kép; thẻ không phải g phải tự đóng />; không text, image, style, script, url(), on*; mỗi lớp ≤ 20 000 ký tự' },
      views: {
        q45: 'BẮT BUỘC. Bản chuẩn 45° quay mặt sang TRÁI màn hình (phía gáy ở bên phải); 45° phải = engine lật gương.',
        modes: { drawn: 'tự vẽ lại lớp cho 45° (tóc, mũ, khăn, giày — vật có dáng riêng): chi tiết giữa dịch trái, phía gáy (phải) lộ khối sau, mặt bên tối hơn',
          face45: 'chi tiết bám lên mặt (râu, ria, hoa văn mặt nạ): engine chiếu theo mắt gần/xa', body45: 'chi tiết trên thân (cổ áo, đai, giáp): dồn về đường giữa áo x = 88',
          same: 'không đổi khi quay (ống quần, đồ tròn đều)' },
        engineHandles: 'vị trí mắt/mày/miệng 45°, tay xa ra sau thân, lật gương, tư thế × di chuyển × động tác — linh kiện KHÔNG tự xử lý'
      },
      params: 'tuỳ chọn, tối đa 6: { label, type: scale|scaleX|scaleY|dx|dy, min, max, def, pivot: [x, y] }',
      example: EXAMPLE_PART,
      scenery: slot ? undefined : 'Phông cảnh (sky, far, mid, ground, front, deco): gọi get_part_spec với slot đó để lấy khung riêng 640×360.'
    };
  }
  // Bàn soát: một SVG gộp — ma-nơ-canh mặc linh kiện × 4 góc nhìn × 4 tình huống
  bench(slot, ref, label) {
    const GC = this.GC;
    const m = { id: 'mannequin', name: 'Ma-nơ-canh', pack: 'afi.core', key: 'bench/' + ref.replace(/[^a-z0-9]/gi, ''), version: 1, kind: 'character',
      look: { eyes: 'round', brows: 'normal', parts: { [slot]: ref }, params: {}, palette: {} }, expressions: {}, identity: { must: [] } };
    if (slot === 'hair') m.look.parts.hat = 'none';
    const views = [['front', 'Chính diện'], ['left', '3/4 trái'], ['left45', '45° trái'], ['right45', '45° phải']];
    const cases = [['normal', null, 'Đứng'], ['shock', null, 'Kinh ngạc'], ['vow', 'run', 'Chạy'], ['normal', 'sit-floor', 'Ngồi']];
    const W = 150, H = 156, L = 70, T = 26;
    let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (L + views.length * W) + ' ' + (T + cases.length * H + 8) + '" font-family="Arial, sans-serif" font-size="12">' +
      '<rect width="100%" height="100%" fill="#f6f4ef"/>';
    views.forEach((v, i) => { out += '<text x="' + (L + i * W + W / 2) + '" y="17" text-anchor="middle" fill="#555">' + v[1] + '</text>'; });
    cases.forEach((c, r) => {
      out += '<text x="8" y="' + (T + r * H + H / 2) + '" fill="#555">' + c[2] + '</text>';
      views.forEach((v, i) => {
        const dir = { view: v[0] }; if (c[1]) dir.activity = c[1];
        const one = GC.svgString(m, c[0], { director: dir });
        out += '<rect x="' + (L + i * W + 2) + '" y="' + (T + r * H + 2) + '" width="' + (W - 4) + '" height="' + (H - 4) + '" rx="6" fill="#fff"/>' +
          one.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox=', '<svg x="' + (L + i * W + 2) + '" y="' + (T + r * H + 2) + '" width="' + (W - 4) + '" height="' + (H - 4) + '" viewBox=');
      });
    });
    return out + '</svg>';
  }
  castOf(ids) {
    const all = this.GC.assets();
    if (!Array.isArray(ids) || !ids.length) return all;
    return all.filter(a => ids.indexOf(a.id) >= 0);
  }

  // Xử lý một thông điệp JSON-RPC. Trả về phản hồi, hoặc null với notification.
  // ctx.viaLink: gọi qua link có khoá (/mcp/<key>) — quyền hẹp hơn token chủ máy
  async handle(msg, ctx) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return { jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'Invalid Request' } };
    }
    const isNote = msg.id === undefined || msg.id === null;
    const ok = result => (isNote ? null : { jsonrpc: '2.0', id: msg.id, result });
    const err = (code, message) => (isNote ? null : { jsonrpc: '2.0', id: msg.id, error: { code, message } });
    try {
      switch (msg.method) {
        case 'initialize': {
          const want = msg.params && msg.params.protocolVersion;
          return ok({
            protocolVersion: PROTOCOLS.indexOf(want) >= 0 ? want : PROTOCOLS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: Object.assign({ version: this.version }, SERVER_INFO),
            instructions: INSTRUCTIONS
          });
        }
        case 'notifications/initialized': case 'notifications/cancelled': return null;
        case 'ping': return ok({});
        case 'tools/list': return ok({ tools: TOOLS });
        case 'tools/call': {
          const p = msg.params || {};
          const r = await this.callTool(p.name, p.arguments, ctx || {});
          if (!r) return err(-32602, 'Không có tool: ' + p.name);
          return ok(r);
        }
        default: return err(-32601, 'Không hỗ trợ: ' + msg.method);
      }
    } catch (e) {
      return err(-32603, e.message);
    }
  }
}

module.exports = { MCP, TOOLS, INSTRUCTIONS };
