// gen-chibi — MCP server (Model Context Protocol), không phụ thuộc SDK.
// © 2026 Gen Labs — All rights reserved.
// Agent tự làm phần sáng tạo (viết công thức nhân vật, viết kịch bản); hệ thống cung cấp từ vựng,
// kiểm theo cổng, dựng SVG và lưu. Không cần LLM API lõi.
// Vận chuyển: HTTP (POST /mcp, JSON) và stdio (server/mcp-stdio.js chuyển tiếp vào /mcp).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Agent = require('./agent.js');
const GV = require('../engine/voices.js'), AI_VOICES = new Set(GV.AI_VOICES.map(v => v.name));   // hướng dẫn agent một nguồn (agent/*.md + ví dụ) — trung lập model

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'gen-chibi', title: 'gen-chibi — nhà máy asset chibi bằng code (nhân vật, vật phẩm, bối cảnh, gói động tác, phim)' };
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

// v0.16 (INT-05, trung lập model): lời dặn NGẮN, tiếng Anh — nhiều client không đưa instructions vào ngữ cảnh model, nên luật thật nằm ở
// tool start_here / get_guide (một nguồn: agent/GUIDE.md); ở đây chỉ chỉ đường
const INSTRUCTIONS = [
  'gen-chibi is a factory of chibi assets made from code: characters, items, scenes, motion packs (poses + animated actions) and films. You write JSON; the system checks it (gates), renders and stores it.',
  'FIRST call start_here (current state, golden rules, topics). Then call get_guide with the topic of your job: character, part, item, scene, motion-pack, animation, film, project-bundle, system. Each guide is a numbered procedure with a runnable JSON example.',
  'Never invent vocabulary — read it from get_catalog, get_part_spec, get_motion_spec, get_director_schema. Validate, fix, then save. Put "project" on everything you create. New assets are drafts. Viewer-facing text is Vietnamese with full diacritics.',
  'Failed calls start with [CODE] and carry structuredContent.error {code, message, details: [{path, message}], hint}. Fix exactly those paths and retry at most 3 times, then report to the owner.'
].join('\n');

function obj(props, required) { return { type: 'object', properties: props, required: required || [], additionalProperties: false }; }
const TOOLS = [
  { name: 'start_here', title: 'START HERE — call first', description: 'CALL THIS FIRST in every session. Returns the app version, what already exists (projects, characters, items, scenes, motion packs, works, samples), the golden rules, the guide topics and suggested next steps. Then call get_guide with the topic of your job.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'get_guide', title: 'Agent guide (procedures + runnable examples)', description: 'Step-by-step procedure for a job, with a JSON example that passes the gates. topic: guide (overview, read once) | character | part | item | scene | motion-pack | animation | film | project-bundle | system | all.', inputSchema: obj({ topic: { type: 'string', description: 'guide | character | part | item | scene | motion-pack | animation | film | project-bundle | system | all' } }), annotations: { readOnlyHint: true } },
  { name: 'get_catalog', title: 'Kho từ vựng', description: 'Toàn bộ từ vựng được phép dùng: thư viện, bộ phận (slot) và linh kiện kèm tham số, kiểu mắt/mày, 18 biểu cảm, động tác, hiệu ứng, khoá màu, hồ sơ ánh xạ. Gọi trước khi viết công thức.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'list_characters', title: 'Danh sách nhân vật', description: 'Các nhân vật hiện có (chính thức + của người dùng): id, key, tên, thư viện, trạng thái duyệt, phiên bản, tính cách.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'get_character', title: 'Xem công thức nhân vật', description: 'Công thức JSON đầy đủ của một nhân vật (dùng làm mẫu để tạo nhân vật mới).', inputSchema: obj({ key: { type: 'string', description: 'key đầy đủ (vd. gen.khung/ma-no-canh) hoặc id ngắn (ma-no-canh)' } }, ['key']), annotations: { readOnlyHint: true } },
  { name: 'validate_character', title: 'Kiểm công thức', description: 'Chạy cổng kiểm (linh kiện, license, tham số, nhận diện, 18 biểu cảm, động tác) trên một công thức chưa lưu.', inputSchema: obj({ asset: { type: 'object', description: 'công thức nhân vật: { id, name, look: { eyes, brows, parts, params, palette }, expressions?, identity, persona? }' } }, ['asset']), annotations: { readOnlyHint: true } },
  { name: 'save_character', title: 'Lưu nhân vật', description: 'Kiểm rồi lưu nhân vật (có phiên bản). Mặc định vào thư viện local.my; nếu key trùng nhân vật đã có thì lưu thành phiên bản mới. Trạng thái (cả item / cảnh): status "draft" (mặc định — nháp, dùng ngay trong dự án) hoặc "published" (phát hành — vào gói bán; nhân vật phát hành cần dấu nhận diện identity). AI tự tạo thì để nháp; người dùng quyết phát hành. Giọng trong phim: voice { pitch 0.5–2 (trầm → cao), rate 0.6–1.6 (chậm → nhanh) }.', inputSchema: obj({ asset: { type: 'object' }, note: { type: 'string', description: 'ghi chú phiên bản' } }, ['asset']) },
  { name: 'render_character', title: 'Dựng hình', description: 'Dựng SVG của một nhân vật ở một biểu cảm. Dùng key của nhân vật đã có, hoặc truyền asset chưa lưu để xem thử. action = id hành động (list_actions) → khung lúc va chạm / giữa động tác (cả chuỗi: render_action).', inputSchema: obj({ key: { type: 'string' }, action: { type: 'string', description: 'id hành động (tuỳ chọn)' }, asset: { type: 'object' }, state: { type: 'string', description: 'id biểu cảm, mặc định normal' }, activity: { type: 'string', description: 'hoạt động: eat, sleep, run, attack… (get_catalog › activities)' }, posture: { type: 'string' }, move: { type: 'string' }, motion: { type: 'string' }, facing: { type: 'string', enum: ['left', 'right'] }, view: { type: 'string', enum: ['front', 'left', 'right', 'left45', 'right45', 'left90', 'right90', 'left135', 'right135', 'back'], description: 'góc nhìn 8 hướng: chính diện, nghiêng nhẹ 3/4, 45°, 90° (nhìn ngang), 135° (quay lưng chéo), back (sau lưng) — trái/phải theo màn hình' }, t: { type: 'number', description: 'giây trong chu kỳ động tác (bỏ trống = khung đại diện)' }, crop: { type: 'boolean', description: 'true = khung avatar (đầu và vai)' } }) , annotations: { readOnlyHint: true } },
  { name: 'get_director_schema', title: 'Schema kịch bản', description: 'JSON Schema + hướng dẫn viết kịch bản sự kiện cho các diễn viên đã chọn.', inputSchema: obj({ cast: { type: 'array', items: { type: 'string' }, description: 'id diễn viên; bỏ trống = tất cả' } }), annotations: { readOnlyHint: true } },
  { name: 'validate_event', title: 'Kiểm kịch bản', description: 'Kiểm một kịch bản sự kiện theo schema (diễn viên, biểu cảm, động tác, hiệu ứng có trong kho).', inputSchema: obj({ event: { type: 'object' }, cast: { type: 'array', items: { type: 'string' } } }, ['event']), annotations: { readOnlyHint: true } },
  { name: 'save_event', title: 'Lưu kịch bản', description: 'Kiểm rồi lưu kịch bản để owner mở và diễn trong Studio.', inputSchema: obj({ event: { type: 'object' }, author: { type: 'string', description: 'tên agent viết kịch bản' } }, ['event']) },
  { name: 'get_part_spec', title: 'Chuẩn tạo linh kiện', description: 'Khung sườn để tự vẽ linh kiện mới: khung 200×240, neo khuôn mặt/thân, lớp nên dùng cho từng bộ phận, token màu, tập SVG cho phép, quy tắc góc 45° (drawn | same | face45 | body45) và ví dụ hoàn chỉnh. Gọi trước khi vẽ.', inputSchema: obj({ slot: { type: 'string', description: 'bộ phận muốn vẽ (hat, outfit, hair…); bỏ trống = tất cả' } }), annotations: { readOnlyHint: true } },
  { name: 'preview_part', title: 'Soát linh kiện', description: 'Kiểm linh kiện chưa lưu (SVG an toàn, lớp, tham số, 45°) rồi mặc lên ma-nơ-canh chuẩn: 5 góc nhìn (chính diện · 45° · 90° · 135° · sau lưng) × đứng / kinh ngạc / chạy / ngồi. Trả lỗi cụ thể hoặc một ảnh SVG bàn soát để xem và sửa.', inputSchema: obj({ part: { type: 'object', description: '{ id, slot, label, layers: { lớp: svg }, views: { q45: "same" | "face45" | "body45" | { mode: "drawn", layers } }, params? }' } }, ['part']), annotations: { readOnlyHint: true } },
  { name: 'save_part', title: 'Lưu linh kiện', description: 'Kiểm rồi lưu linh kiện vào thư viện "Của tôi" (local.my), có phiên bản. Sau khi lưu, nhân vật dùng được qua look.parts.<slot> = "local.my/<id>".', inputSchema: obj({ part: { type: 'object' }, note: { type: 'string' } }, ['part']) },
  { name: 'list_items', title: 'Danh sách item', description: 'Item trang bị hiện có (chính thức + của người dùng): key, tên, loại, độ hiếm, bộ phận mặc, linh kiện, chỉ số. Lọc theo type / rarity.', inputSchema: obj({ type: { type: 'string' }, rarity: { type: 'string' } }), annotations: { readOnlyHint: true } },
  { name: 'validate_item', title: 'Kiểm item', description: 'Kiểm item chưa lưu: loại ↔ bộ phận, linh kiện có thật, màu hex theo token, chỉ số 0–999, dựng được icon/thẻ. Item = phối linh kiện có sẵn (hoặc linh kiện tự tạo qua save_part) + bảng màu riêng + chỉ số + độ hiếm.', inputSchema: obj({ item: { type: 'object', description: '{ id, name, han?, type, rarity, equip: { slot?, part, params?, palette? }, stats?, description?, lore?, icon? }' } }, ['item']), annotations: { readOnlyHint: true } },
  { name: 'save_item', title: 'Lưu item', description: 'Kiểm rồi lưu item vào thư viện "Của tôi" (có phiên bản). Nhân vật mặc qua look.equip.<slot> = "local.my/<id>".', inputSchema: obj({ item: { type: 'object' }, note: { type: 'string' } }, ['item']) },
  { name: 'render_item', title: 'Dựng item', description: 'SVG của item: mode icon (ô vuông theo độ hiếm), card (thẻ: tên, loại, độ hiếm, chỉ số, mô tả) hoặc equipped (mặc lên nhân vật character, có thể kèm view/activity).', inputSchema: obj({ key: { type: 'string' }, item: { type: 'object' }, mode: { type: 'string', enum: ['icon', 'card', 'equipped'] }, character: { type: 'string' }, view: { type: 'string', enum: ['front', 'left', 'right', 'left45', 'right45', 'left90', 'right90', 'left135', 'right135', 'back'] }, activity: { type: 'string' } }), annotations: { readOnlyHint: true } },
  { name: 'list_scenes', title: 'Danh sách cảnh', description: 'Cảnh hiện có (chính thức + của người dùng): key, tên, giờ, thời tiết, các lớp phông, chỗ đứng.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'validate_scene', title: 'Kiểm cảnh', description: 'Kiểm cảnh chưa lưu: phông có thật đúng lớp, đạo cụ ≤ 10, màu hex theo token cảnh, giờ, thời tiết, chỗ đứng; dựng được và đặt được diễn viên ở mọi chỗ đứng. Cảnh = phối phông có sẵn (hoặc phông tự tạo qua save_part).', inputSchema: obj({ scene: { type: 'object', description: '{ id, name, han?, description?, layers: { sky, ground, far?, mid?, front? : "id phông" | { part, dx?, flip? } }, deco?: [{ part, x, y?, scale?, flip?, z?: back|mid|front }], palette?, time?: day|dawn|dusk|night, weather?: clear|rain|snow|petals|leaves|mist|fireflies, spots? }' } }, ['scene']), annotations: { readOnlyHint: true } },
  { name: 'save_scene', title: 'Lưu cảnh', description: 'Kiểm rồi lưu cảnh vào thư viện "Của tôi" (có phiên bản). Kịch bản dùng qua event.scene = "local.my/<id>".', inputSchema: obj({ scene: { type: 'object' }, note: { type: 'string' } }, ['scene']) },
  { name: 'render_scene', title: 'Dựng cảnh', description: 'SVG 640×360 của một cảnh (key đã lưu hoặc scene nháp), có thể đặt dàn diễn viên: cast = [{ character, spot, state?, activity?, posture?, move?, motion?, facing?, view? }] (≤ 8). Từ hai diễn viên trở lên, ai chưa chọn view sẽ tự quay 45° về giữa. time / weather để xem thử biến thể.', inputSchema: obj({ key: { type: 'string' }, scene: { type: 'object' }, cast: { type: 'array', items: { type: 'object' } }, time: { type: 'string', enum: ['day', 'dawn', 'dusk', 'night'] }, weather: { type: 'string', enum: ['clear', 'rain', 'snow', 'petals', 'leaves', 'mist', 'fireflies'] } }), annotations: { readOnlyHint: true } },
  { name: 'list_projects', title: 'Dự án chủ đề', description: 'Các dự án chủ đề của Thư viện (mỗi asset của người dùng thuộc một dự án): id, tên, mô tả, số nhân vật / item / cảnh. Lưu asset vào dự án bằng trường "project": "<id>" trong save_character / save_item / save_scene.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'save_project', title: 'Tạo / sửa dự án chủ đề', description: 'Tạo hoặc đổi tên một dự án chủ đề (id slug, name, description). Không xoá asset.', inputSchema: obj({ id: { type: 'string', description: 'slug: chữ thường, số, gạch nối' }, name: { type: 'string' }, description: { type: 'string' } }, ['id', 'name']) },
  { name: 'list_works', title: 'Danh sách tác phẩm', description: 'Các tác phẩm (phim / truyện) đang làm ở khu Tạo tác: id, tên, dự án chủ đề, số phân cảnh, số cảnh đã có lời thoại.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'get_work', title: 'Xem tác phẩm', description: 'Toàn bộ một tác phẩm: kịch bản, danh sách phân cảnh (mô tả, cảnh, dàn diễn viên, lời thoại / diễn xuất).', inputSchema: obj({ id: { type: 'string' } }, ['id']), annotations: { readOnlyHint: true } },
  { name: 'save_work', title: 'Lưu tác phẩm', description: 'Tạo hoặc sửa phần chung của tác phẩm: title, project (dự án chủ đề), logline (một câu), script (kịch bản tổng, văn xuôi), lang (ngôn ngữ lời thoại vi | en | zh | yue (Quảng Đông) — mặc định vi) + accent (giọng vùng: bac / nam / trung · us / uk · pt / tw · hk). Không đụng phân cảnh. Bỏ id để tạo mới.', inputSchema: obj({ id: { type: 'string' }, title: { type: 'string' }, project: { type: 'string' }, logline: { type: 'string' }, script: { type: 'string' }, lang: { type: 'string', enum: Object.keys(GV.LANGS) }, accent: { type: 'string' } }) },
  { name: 'save_shot', title: 'Lưu phân cảnh', description: 'Thêm / sửa / bỏ một phân cảnh của tác phẩm. shot = { id? (bỏ trống = thêm mới), title, description (mô tả phân cảnh), scene (key cảnh trong Thư viện, xem list_scenes), cast (≤ 8 nhân vật: id hoặc key, xem list_characters), event? (lời thoại + diễn xuất theo get_director_schema; engine tự đặt event.scene = scene) }. position = vị trí chèn (0 = đầu). remove = true để bỏ phân cảnh. Thiếu nhân vật / cảnh thì tạo ở Xưởng trước (save_character / save_scene với project của tác phẩm).', inputSchema: obj({ work: { type: 'string' }, shot: { type: 'object' }, position: { type: 'integer' }, remove: { type: 'boolean' } }, ['work', 'shot']) },
  { name: 'export_project', title: 'Xuất gói dự án', description: 'Gói JSON của một dự án chủ đề (gen-chibi.project/1): nhân vật, item, cảnh, linh kiện / phông tự vẽ đang dùng, tác phẩm. Dùng để sao lưu, chuyển máy, bán / chia sẻ bộ asset theo chủ đề.', inputSchema: obj({ id: { type: 'string', description: 'id dự án (list_projects)' }, sale: { type: 'boolean', description: 'true = GÓI BÁN: chỉ asset trạng thái published (phát hành), không kèm tác phẩm' } }, ['id']), annotations: { readOnlyHint: true } },
  { name: 'import_project', title: 'Nhập gói dự án', description: 'Nhập một gói gen-chibi.project/1 vào Thư viện. Mọi linh kiện, item, cảnh, nhân vật, tác phẩm đi qua đúng cổng kiểm như khi tạo mới. Trùng id thì báo danh sách trùng; overwrite = true để lưu đè thành phiên bản mới (bản cũ vẫn giữ trong lịch sử).', inputSchema: obj({ bundle: { type: 'object' }, overwrite: { type: 'boolean' } }, ['bundle']) },
  { name: 'list_actions', title: 'Danh sách hành động', description: 'Mọi hành động dùng được trong kịch bản (step.action) và xuất hoạt ảnh: id, nhãn, attack (đòn đánh, cần target), needs (weapon = cần cầm binh khí), ranged (ném), aim, pack (gen.dong-tac = của khung, còn lại = gói động tác) + các phản ứng (react). Truyền character để biết nhân vật đó làm được đòn nào (can).', inputSchema: obj({ character: { type: 'string', description: 'id hoặc key nhân vật (tuỳ chọn)' } }), annotations: { readOnlyHint: true } },
  { name: 'list_motion_packs', title: 'Danh sách gói động tác', description: 'Các gói động tác đã nạp (của người dùng + bộ mẫu): key, tên, dự án, trạng thái, phiên bản, các hành động và màn diễn trong gói.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'get_motion_pack', title: 'Xem gói động tác', description: 'Toàn bộ JSON một gói động tác (tư thế, clip, hành động, màn diễn) — dùng làm mẫu hoặc để sửa rồi save_motion_pack.', inputSchema: obj({ key: { type: 'string', description: 'local.my/<id> hoặc id' } }, ['key']), annotations: { readOnlyHint: true } },
  { name: 'get_motion_spec', title: 'Chuẩn gói động tác', description: 'Định dạng gen-chibi.motion/1: khớp + kênh + khoảng số, nhịp (ease), điểm đánh, hiệu ứng / âm thanh / nhạc được phép, ngân sách, tư thế khung có thể kế thừa ($), quy ước góc nghiêng, ví dụ hoàn chỉnh chạy được. Gọi trước khi viết gói.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'validate_motion_pack', title: 'Kiểm gói động tác', description: 'Kiểm gói chưa lưu: cổng dữ liệu + DỰNG THỬ mọi hành động trên ma-nơ-canh khung (đòn đánh: đấu với ma-nơ-canh thứ hai). Không lưu gì.', inputSchema: obj({ pack: { type: 'object', description: 'gói gen-chibi.motion/1 — xem get_motion_spec' } }, ['pack']), annotations: { readOnlyHint: true } },
  { name: 'save_motion_pack', title: 'Lưu gói động tác', description: 'Kiểm, dựng thử rồi lưu gói động tác vào Thư viện (có phiên bản). Hành động của gói dùng ngay trong kịch bản (step.action) và render_action. Đặt "project".', inputSchema: obj({ pack: { type: 'object' }, note: { type: 'string' } }, ['pack']) },
  { name: 'render_action', title: 'Xuất hoạt ảnh một hành động', description: 'Một nhân vật diễn một hành động → khung cố định, nền trong suốt. format: sheet (một SVG sprite sheet + timeline), frames (SVG từng khung, tối đa 60), meta (chỉ timeline: fps, số khung, thời lượng, khung va chạm, khung ôm). Đòn đánh: partner (mặc định ma-nơ-canh) + react.', inputSchema: obj({ character: { type: 'string' }, action: { type: 'string' }, partner: { type: 'string' }, react: { type: 'string', enum: ['hit', 'fall', 'ko', 'block', 'dodge'] }, fps: { type: 'integer', minimum: 4, maximum: 30 }, format: { type: 'string', enum: ['sheet', 'frames', 'meta'] }, cell: { type: 'integer', minimum: 48, maximum: 512 } }, ['character', 'action']), annotations: { readOnlyHint: true } },
  { name: 'render_voice', title: 'Đọc thoại bằng giọng AI', description: 'Đọc một câu thoại bằng giọng AI (Google Gemini TTS) → clip WAV (nội dung audio). Giọng theo VAI: character (vai + giọng đã chọn của nhân vật; chưa chọn thì đoán từ vai trò / tính cách / tên) hoặc role (get_catalog › voiceRoles: bé trai, bà lão, võ tướng, quân sư…); voice = tên giọng ghi đè (get_catalog › aiVoices). Ngôn ngữ lang = vi | en | zh | yue (Quảng Đông — viết chữ Quảng Đông) — chữ phải đúng ngôn ngữ đó; accent = giọng vùng (get_catalog › voiceLangs: bac / nam / trung · us / uk · pt / tw · hk). Cảm xúc theo state + bubble. Câu đã đọc được lưu đệm (không tốn lượt). Cần chủ máy dán key Google AI Studio ở Studio › Cài đặt AI › Giọng AI (tự bật); gói miễn phí ~10 câu / ngày / model — hết lượt trả UNAVAILABLE kèm retryAt.', inputSchema: obj({ text: { type: 'string', maxLength: 240 }, character: { type: 'string' }, role: { type: 'string', enum: Object.keys(GV.ROLES) }, lang: { type: 'string', enum: Object.keys(GV.LANGS) }, accent: { type: 'string' }, voice: { type: 'string' }, state: { type: 'string' }, bubble: { type: 'string', enum: ['say', 'shout', 'think', 'whisper'] } }, ['text']), annotations: { readOnlyHint: false, openWorldHint: true } },
  { name: 'design_voice', title: 'Thiết kế giọng vai', description: 'THIẾT KẾ một giọng AI mới cho một vai (get_catalog › voiceRoles: ông lão, bà lão, võ tướng, quân sư…) + ngôn ngữ (vi | en | zh | yue) + giọng vùng (accent: bac / nam / trung · us / uk · pt / tw · hk) trên project Google của chủ máy; từ đó render_voice của mọi nhân vật vai đó tự dùng giọng này. Tốn một lượt Google (~25 giây); Google chặn thiết kế giọng trẻ em / vị thành niên (vai bé, thiếu niên → BAD_REQUEST, dùng giọng trẻ trung có sẵn). Trả JSON + clip nghe thử.', inputSchema: obj({ role: { type: 'string', enum: Object.keys(GV.ROLES) }, lang: { type: 'string', enum: Object.keys(GV.LANGS) }, accent: { type: 'string' } }, ['role']), annotations: { readOnlyHint: false, openWorldHint: true } },
  { name: 'preview_shot', title: 'Xem trước phân cảnh', description: 'Phân cảnh đã sẵn sàng diễn chưa (ready, missing) + kế hoạch dàn dựng của bộ phát: ai ra sân / đi đâu / nói gì / ra đòn gì, bao lâu, cảnh báo (đòn thiếu, không dựng được). Gọi sau save_shot.', inputSchema: obj({ work: { type: 'string' }, shot: { type: 'string', description: 'id phân cảnh (hoặc số thứ tự từ 0)' } }, ['work', 'shot']), annotations: { readOnlyHint: true } },
  { name: 'list_samples', title: 'Bộ mẫu đi kèm', description: 'Các dự án mẫu đi kèm bản cài (Văn phòng vui, bộ chủ đề Tam Quốc…): id, tên, phiên bản, đã cài chưa, có bản mới không.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'install_sample', title: 'Cài / cập nhật bộ mẫu', description: 'Nhập một bộ mẫu đi kèm vào Thư viện qua đúng cổng nhập. overwrite = true để cập nhật bộ mẫu đã cài (chỗ đã sửa thành phiên bản cũ). Bộ mẫu chỉ để xem, thử, làm phim — không bán.', inputSchema: obj({ id: { type: 'string' }, overwrite: { type: 'boolean' } }, ['id']) },
  { name: 'list_events', title: 'Kịch bản lẻ', description: 'Các kịch bản lẻ đã lưu qua save_event (chờ owner biến thành phân cảnh trong Studio).', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'get_app_version', title: 'Phiên bản ứng dụng', description: 'Phiên bản đang chạy, bản mới nhất trên GitHub Releases, ghi chú phát hành, bản có thể quay về và lịch sử cập nhật. check=false để không hỏi GitHub.', inputSchema: obj({ check: { type: 'boolean', description: 'hỏi GitHub bản mới nhất (mặc định true)' } }), annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'update_app', title: 'Cập nhật ứng dụng', description: 'Tải bản mới nhất từ GitHub Releases (kiểm SHA-256, sao lưu dữ liệu) rồi khởi động lại. Bản mới lỗi thì launcher tự quay về bản cũ. Kết nối ngắt vài giây; gọi get_app_version sau ~15 giây để xác nhận. force=true áp cả bản từng bị bỏ qua vì lần trước chạy lỗi.', inputSchema: obj({ force: { type: 'boolean' } }), annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true } },
  { name: 'rollback_app', title: 'Quay về bản trước', description: 'Chạy lại bản cài trước đó (sao lưu dữ liệu trước khi đổi). Cần confirm = "ROLLBACK".', inputSchema: obj({ confirm: { type: 'string', enum: ['ROLLBACK'] } }, ['confirm']), annotations: { destructiveHint: true } }
];

function text(t, extra) { return Object.assign({ content: [{ type: 'text', text: t }] }, extra || {}); }
function json(v) { return { content: [{ type: 'text', text: JSON.stringify(v, null, 2) }], structuredContent: Array.isArray(v) ? { items: v } : v }; }
// lỗi CÓ CẤU TRÚC, mã ổn định tiếng Anh (agent của mọi hãng dựa vào mã + path, không cần hiểu câu tiếng Việt):
// text = "[CODE] <câu cũ>\n→ <gợi ý>" (client chỉ đọc text vẫn thấy mã) · structuredContent.error = { code, message, details[{ path, message }], hint }
const ERR_HTTP = { 400: 'BAD_REQUEST', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_FAILED', 503: 'UNAVAILABLE' };
const ERR_HINT = {
  VALIDATION_FAILED: 'Fix exactly the fields in details[].path, then call the matching validate_* tool again. Runnable examples: get_guide.',
  NOT_FOUND: 'List what exists first (list_characters, list_items, list_scenes, list_actions, list_works…) and use an existing id / key.',
  CONFLICT: 'Choose another id, or repeat with overwrite: true only if the owner agrees.',
  FORBIDDEN: 'Not allowed for agents or for this content — do not retry; tell the owner.',
  BAD_REQUEST: 'Read the tool inputSchema (tools/list) — an argument is missing or malformed.',
  UNAVAILABLE: 'The app is busy or restarting — wait ~15 s, then call get_app_version.',
  INTERNAL: 'Unexpected failure — report the message to the owner.'
};
function guessCode(m) {
  if (/không có|chưa có|not found/i.test(m)) return 'NOT_FOUND';
  if (/trùng|đã có|conflict/i.test(m)) return 'CONFLICT';
  if (/không được|bị chặn|chỉ để xem|chỉ được/i.test(m)) return 'FORBIDDEN';
  if (/^cần |thiếu /i.test(m)) return 'BAD_REQUEST';
  if (/đang (khởi động|cập nhật)/i.test(m)) return 'UNAVAILABLE';
  return 'VALIDATION_FAILED';
}
function toolError(x, opt) {
  opt = opt || {};
  const msg = typeof x === 'string' ? x : String((x && x.message) || x);
  const code = opt.code || (x && typeof x === 'object' && ERR_HTTP[x.code]) || guessCode(msg);
  const list = opt.errors || (x && Array.isArray(x.errors) ? x.errors : null) || (code === 'VALIDATION_FAILED' ? msg.replace(/^[^:]*chưa đạt: /, '').split('; ') : [msg]);
  const details = list.slice(0, 30).map(e => { const t = typeof e === 'string' ? e : JSON.stringify(e), m = /^([A-Za-z0-9_.$\[\]-]{1,80}): ([\s\S]*)$/.exec(t); return m ? { path: m[1], message: m[2] } : { message: t }; });
  const hint = opt.hint || ERR_HINT[code];
  return { content: [{ type: 'text', text: '[' + code + '] ' + msg + (hint ? '\n→ ' + hint : '') }], structuredContent: { error: Object.assign({ code, message: msg, details, hint }, opt.allowed ? { allowed: opt.allowed } : {}) }, isError: true };
}
// lỗi kiểu cũ (saved:false + errors / gates / conflicts): vẫn đúng hợp đồng — chữ mở đầu [CODE], structuredContent.error là object —
// và giữ nguyên các trường cũ (client / Studio đời trước đọc saved, errors, gates, conflicts)
function legacyError(body, x, opt) {
  const r = toolError(x, opt);
  r.content[0].text += '\n' + JSON.stringify(body);
  r.structuredContent = Object.assign({}, body, r.structuredContent);
  return r;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
// Dấu theo NỘI DUNG (review bảo mật): dấu ở siêu dữ liệu gói xoá được bằng tay trước khi nhập lại → so thêm bản vẽ của từng
// linh kiện với các bộ mẫu app mang sẵn (studio/mau/*.json, kind "sample"). Trùng hình = mục mẫu, dù đã đổi id hay gỡ dấu.
// Giới hạn đã biết: bản sửa khác đi hoặc sửa thẳng dữ liệu trên máy của chính mình thì không chặn được ở app tự cài — giấy phép điều chỉnh.
let SAMPLE_ART = null;
// chuỗi hoá CHUẨN (khoá sắp xếp, đệ quy) — đảo thứ tự khoá layers / views không đổi được chữ ký
function canonJSON(v) { return Array.isArray(v) ? '[' + v.map(canonJSON).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonJSON(v[k]); }).join(',') + '}' : JSON.stringify(v === undefined ? null : v); }
// chữ ký NỘI DUNG từng clip của gói động tác (dữ liệu đã qua cổng; tư thế giải ra số khớp làm tròn 0,1; bỏ nhãn / chữ): đổi id gói, id đòn,
// tên clip, tên tư thế hay thêm tư thế thừa đều không đổi được chữ ký (review v0.16). Clip một then chốt quá đơn giản → không ký (tránh trùng oan)
function motionClipSigs(GC, m) {
  const C = GC.choreo, c = C && C.checkPack(m);
  if (!c || c.errors.length) return [];
  const d = c.def, r1 = v => Math.round(v * 10) / 10, drop = ['label', 'text', 'title', 'sub'];
  return Object.keys(d.clips).map(k => {
    const cl = d.clips[k];
    if (!cl.keys || cl.keys.length < 2) return '';
    let keys; try { keys = cl.keys.map(q => [q[0], Array.from(C.resolveIn(d.poses, q[1])).map(r1)].concat(q.slice(2))); } catch { return ''; }
    const body = JSON.parse(JSON.stringify(Object.assign({}, cl, { keys }), (key, v) => drop.indexOf(key) >= 0 ? undefined : v));
    return crypto.createHash('sha256').update(canonJSON(body)).digest('hex');
  }).filter(Boolean);
}
function artSig(p) { return p && p.layers ? crypto.createHash('sha256').update(canonJSON([p.slot, p.layers, p.views || null])).digest('hex') : ''; }
function sampleArt(GC) {   // ký theo dạng ĐÃ QUA CỔNG (cổng chuẩn hoá SVG) — cùng dạng với linh kiện đã lưu
  if (SAMPLE_ART) return SAMPLE_ART;
  SAMPLE_ART = new Map();
  const dir = path.join(__dirname, '..', 'studio', 'mau');
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { /* bản cài không kèm bộ mẫu */ }
  files.forEach(f => {
    let b; try { b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return; }
    if (!b || b.kind !== 'sample' || !Array.isArray(b.parts)) return;
    const owner = (b.sample && b.sample.owner) || 'Gen Labs';
    b.parts.forEach(p => { const c = GC.checkDataPart(p), h = artSig(c.errors.length ? p : c.def); if (h) SAMPLE_ART.set(h, { owner, id: p.id }); });
    (Array.isArray(b.motionPacks) ? b.motionPacks : []).forEach(m => motionClipSigs(GC, m).forEach(h => SAMPLE_ART.set('motion:' + h, { owner, id: m.id })));
  });
  return SAMPLE_ART;
}
// khoá dấu nguồn gốc bộ mẫu (store.markProvenance) của mọi mục trong một gói dự án
function provKeys(b) {
  const arr = x => Array.isArray(x) ? x.filter(v => v && typeof v === 'object') : [];
  return [].concat(arr(b.parts).map(p => 'part:' + p.slot + ':' + p.id), arr(b.items).map(x => 'item:' + x.id), arr(b.scenes).map(x => 'scene:' + x.id),
    arr(b.characters).map(a => 'char:' + String(a.id || '').toLowerCase()), arr(b.motionPacks).map(x => 'motion:' + x.id));
}
function slugOf(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

class MCP {
  // system (tuỳ chọn): { updater, restartSoon } — để agent tự kiểm và cập nhật phiên bản; smokeMs: hạn chót dựng thử gói động tác (test hạ xuống)
  constructor({ engine, store, version, system, smokeMs, voice }) {
    this.voice = voice || null;   // server/voice.js (giọng AI) — chỉ có ở bản chạy server
    this.GC = engine;
    this.smokeMs = smokeMs || 4000;
    this.store = store;
    this.version = version;
    this.system = system || null;
    this.restarting = false;
    if (!this.GC.PACKS[MY_PACK]) this.GC.pack({ id: MY_PACK, name: 'Của tôi', owner: 'Bạn', group: 'mine', visibility: 'private', license: 'Thuộc người tạo' }, () => {});
    if (!this.GC.PACKS[TMP_PACK]) this.GC.pack({ id: TMP_PACK, name: 'Bàn soát (tạm)', owner: 'Bạn', group: 'mine', visibility: 'private', license: 'Thuộc người tạo' }, () => {});
    (this.store.listParts ? this.store.listParts() : []).forEach(d => this.GC.registerDataPart(MY_PACK, d));
    (this.store.listItems ? this.store.listItems() : []).forEach(d => { const r = this.GC.registerItem(MY_PACK, d); if (r.errors.length) console.warn('bỏ item', d.id, r.errors); });
    (this.store.listScenes ? this.store.listScenes() : []).forEach(d => { const r = this.GC.registerScene(MY_PACK, d); if (r.errors.length) console.warn('bỏ cảnh', d.id, r.errors); });
    (this.store.listMotionPacks ? this.store.listMotionPacks() : []).forEach(d => { try { const r = this.GC.choreo.registerPack(MY_PACK, d); if (r.errors.length) console.warn('bỏ gói động tác', d.id, r.errors); } catch (e) { console.warn('bỏ gói động tác hỏng', d && d.id, e.message); } });   // tệp sửa tay hỏng không được chặn server khởi động
  }
  sync() {
    if (this._bulk) return;
    this.store.listAssets().forEach(a => {
      // bản ghi cũ lưu thẳng vào pack khung (trước v0.11) không được đè khung: nạp thành bản sao "Của tôi" nếu chưa có
      const P = this.GC.PACKS[this.GC.canonPack(a.pack)];
      if (P && P.group === 'frame') { if (!this.GC.ASSETS[MY_PACK + '/' + a.id]) this.GC.registerAsset(MY_PACK, Object.assign(clone(a), { pack: MY_PACK })); return; }
      this.GC.registerAsset(a.pack, clone(a));
    });
  }   // nhập hàng loạt: asset đã đăng ký khi lưu, không đọc lại đĩa
  // dự án + số asset mỗi loại (asset trỏ dự án chưa đăng ký vẫn hiện, để không "mất" thứ gì)
  projects() {
    const GC = this.GC, list = this.store.listProjects(), ids = list.map(p => p.id);
    const mine = [].concat(GC.assets(), GC.items(), GC.scenes()).filter(x => x.pack === MY_PACK);
    mine.forEach(x => { if (x.project && ids.indexOf(x.project) < 0) { ids.push(x.project); list.push({ id: x.project, name: x.project, description: '(chưa đăng ký)' }); } });
    return list.map(p => Object.assign({}, p, {
      characters: GC.assets().filter(x => x.pack === MY_PACK && x.project === p.id).length,
      items: GC.items().filter(x => x.pack === MY_PACK && x.project === p.id).length,
      scenes: GC.scenes().filter(x => x.pack === MY_PACK && x.project === p.id).length }));
  }

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
      actions: Object.keys(GC.choreo.ACTIONS).map(k => { const a = GC.choreo.ACTIONS[k]; return { id: k, label: a.label, attack: !!a.attack, needs: a.needs || null, ranged: !!a.ranged, pack: a.pack }; }),
      reacts: Object.keys(GC.choreo.REACTS), motionPacks: GC.choreo.packs().map(p => p.key), motionSpec: 'get_motion_spec',
      aiVoices: this.voice ? this.voice.publicConfig().voices.map(v => ({ name: v.name, gender: v.gender, style: v.style })) : [],
      voiceRoles: GV.roleList(), voiceLangs: GV.langList(),
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
      composition: 'Khung hình = state (nét mặt) × activity (đặt sẵn) hoặc posture × move × motion, cộng facing left/right và view 8 hướng: front · left/right (nghiêng nhẹ) · left45/right45 · left90/right90 (nhìn ngang) · left135/right135 (quay lưng chéo) · back — vẽ thật ở mức linh kiện; linh kiện thiếu góc nào thì engine mượn góc gần nhất.',
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
    x.pack = this.GC.canonPack(x.pack);
    // tham chiếu tên thư viện cũ (afi.*) → tên mới khi lưu — dữ liệu cũ vẫn đọc được nhờ alias, bản lưu mới gọn một tên
    if (x.look && typeof x.look === 'object') ['parts', 'equip'].forEach(k => { const o = x.look[k]; if (o && typeof o === 'object') Object.keys(o).forEach(sl => { if (typeof o[sl] === 'string') o[sl] = this.GC.canon(o[sl]); }); });
    if (!/^[a-z0-9-]{1,64}$/.test(x.id)) throw new Error('id phải gồm chữ thường, số, gạch ngang (1–64 ký tự)');
    const P = x.pack && Object.prototype.hasOwnProperty.call(this.GC.PACKS, x.pack) ? this.GC.PACKS[x.pack] : null;
    // khung (group "frame") KHÔNG BAO GIỜ bị sửa, kể cả từ Studio: lưu thành bản sao trong "Của tôi"
    x.pack = P && P.group !== 'frame' && (P.group === 'mine' || (opts && opts.allowAnyPack)) && x.pack !== TMP_PACK ? x.pack : MY_PACK;
    x.key = x.pack + '/' + x.id;
    x.look = x.look || {};
    x.look.parts = x.look.parts || {};
    x.version = x.version || 0;
    x.status = this.GC.statusOf(x.status);   // nháp / phát hành (giá trị cũ review → nháp, approved → phát hành)
    if (x.project === undefined) { const prev = this.store.getAsset(x.key); if (prev && prev.project) x.project = prev.project; }   // giữ dự án khi bản sửa không gửi kèm
    if (x.project != null && x.project !== '' && !this.GC.projectId(x.project)) throw new Error('project: slug dự án (chữ thường, số, gạch nối, ≤ 40 ký tự) — xem list_projects');
    x.project = this.GC.projectId(x.project);
    // giọng riêng của nhân vật trong phim (engine/audio.js): cao độ + tốc độ, kẹp trong khoảng nghe được; ai = tên giọng AI Google
    // (server/voice.js VOICES) — sai kiểu / tên lạ thì bỏ
    if (x.voice !== undefined) {
      const v = x.voice && typeof x.voice === 'object' ? x.voice : {}, num = (n, lo, hi) => typeof n === 'number' && isFinite(n) ? Math.max(lo, Math.min(hi, n)) : undefined;
      const out = {}, pitch = num(v.pitch, 0.5, 2), rate = num(v.rate, 0.6, 1.6);
      if (pitch !== undefined) out.pitch = pitch;
      if (rate !== undefined) out.rate = rate;
      // ai: tên giọng dựng sẵn, id giọng thư viện Google (vi-vn-tutor-2) hoặc giọng đã thiết kế (voice_…) — chữ tự do bị bỏ
      if (typeof v.ai === 'string' && (AI_VOICES.has(v.ai) || /^[a-z]{2,3}-[a-z0-9]{2,4}-[a-z0-9-]{2,40}$/.test(v.ai) || /^voice_[a-z0-9]{6,40}$/.test(v.ai))) out.ai = v.ai;
      if (typeof v.role === 'string' && Object.prototype.hasOwnProperty.call(GV.ROLES, v.role)) out.role = v.role;   // vai giọng (get_catalog › voiceRoles)
      if (typeof v.accent === 'string' && GV.langList().some(l => l.accents.some(a => a.id === v.accent))) out.accent = v.accent;
      if (Object.keys(out).length) x.voice = out; else delete x.voice;
    }
    return this.GC.migrate(x);
  }
  // nhận key đầy đủ (pack/id) hoặc id ngắn (ưu tiên bản trong "Của tôi")
  findAsset(key) {
    this.sync();
    key = this.GC.canon(key);   // tên thư viện cũ (afi.khung/…) → tên mới
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
        let a; try { a = this.prepare(args.asset); } catch (e) { return toolError(e); }
        // ok = qua được cổng CHẶN của trạng thái đang khai (nháp không cần dấu nhận diện) — mục chưa đạt nhưng không chặn → warnings
        const g = GC.gate(a, { poses: true }), bl = GC.blockingGates(g, a.status), warn = g.filter(x => !x.ok && bl.indexOf(x) < 0).map(x => x.label);
        if (bl.length) return legacyError({ ok: false, gates: g, blocking: bl.map(x => x.id), warnings: warn }, 'Nhân vật chưa qua cổng: ' + bl.map(x => x.label).join('; '), { code: 'VALIDATION_FAILED', errors: bl.map(x => 'gates.' + x.id + ': ' + x.label + (x.detail ? ' (' + x.detail + ')' : '')) });
        return json({ ok: true, gates: g, warnings: warn });
      }
      case 'save_character': {
        let r;
        try { r = this.saveAssetChecked(args.asset, args.note || 'Lưu qua ' + (ctx && ctx.channel === 'ui' ? 'AI trong Studio' : 'MCP')); }
        catch (e) { return e.gates ? legacyError({ saved: false, blocking: e.blocking, gates: e.gates }, e, { code: 'VALIDATION_FAILED', errors: e.gates.filter(g => (e.blocking || []).indexOf(g.id) >= 0).map(g => 'gates.' + g.id + ': ' + g.label + (g.detail ? ' (' + g.detail + ')' : '')) }) : toolError(e); }
        return json({ saved: true, key: r.key, version: r.version, status: r.status, studio: 'Studio › Thư viện › Nhân vật › ' + r.name });
      }
      case 'render_character': {
        let a;
        if (args.asset) { try { a = this.prepare(args.asset); } catch (e) { return toolError(e); } }
        else a = this.findAsset(String(args.key || ''));
        if (!a) return toolError('Cần key của nhân vật đã có hoặc asset để dựng thử.');
        if (args.action) {   // một khung của hành động: lúc va chạm (đòn đánh) hoặc giữa động tác
          const C = GC.choreo, ac = Object.prototype.hasOwnProperty.call(C.ACTIONS, String(args.action)) ? C.ACTIONS[args.action] : null;
          if (!ac) return toolError('Không có hành động ' + args.action, { code: 'NOT_FOUND', allowed: Object.keys(C.ACTIONS) });
          if (!C.canDo(a, ac)) return toolError((a.name || a.id) + ' không làm được "' + ac.label + '" (cần cầm binh khí)', { code: 'VALIDATION_FAILED', allowed: C.actionsFor(a) });
          let tl; try { tl = C.actionTimeline({ asset: a, action: args.action }); } catch (e) { return toolError(e, { code: 'INTERNAL' }); }
          const r = tl.duel && tl.duel.impact != null ? C.storyToReal(tl, tl.duel.impact) : tl.real / 2, sv = C.animFrame(tl, r, C.animBox(tl), { size: 480 });
          return { content: [{ type: 'text', text: 'SVG của ' + (a.name || a.id) + ' · ' + ac.label + ' (khung ' + r.toFixed(2) + ' s / ' + tl.real.toFixed(2) + ' s). Cả chuỗi: render_action.' },
            { type: 'resource', resource: { uri: 'genchibi://render/' + a.key + '/action-' + args.action + '.svg', mimeType: 'image/svg+xml', text: sv } }] };
        }
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
        const sch = GC.director.schema(cast), en = (sch.properties.steps.items.properties.action || {}).enum || [];
        return json({ schema: sch, actorsCan: cast.map(a => ({ id: a.id, weapon: GC.choreo.hasWeapon(a), actions: GC.choreo.actionsFor(a).filter(k => en.indexOf(k) >= 0) })), guide: GC.director.prompt(cast).split('\nSchema:')[0] });
      }
      case 'validate_event': {
        this.sync();
        const errs = GC.director.validate(args.event, this.castOf(args.cast));
        return errs.length ? legacyError({ ok: false, errors: errs }, 'Kịch bản chưa đạt: ' + errs.slice(0, 6).join('; '), { code: 'VALIDATION_FAILED', errors: errs }) : json({ ok: true, errors: [] });
      }
      case 'save_event': {
        this.sync();
        const errs = GC.director.validate(args.event, GC.assets());
        if (errs.length) return legacyError({ saved: false, errors: errs }, 'Kịch bản chưa đạt: ' + errs.slice(0, 6).join('; '), { code: 'VALIDATION_FAILED', errors: errs });
        const rec = this.store.saveEvent(args.event, args.author || 'agent qua MCP');
        return json({ saved: true, id: rec.id, studio: 'Studio › Tạo tác › Tác phẩm › Kịch bản lẻ › ' + args.event.title });
      }
      case 'start_here': return json(this.startHere());
      case 'get_guide': {
        const t = String(args.topic || 'guide'), md = Agent.guide(t);
        if (md == null) return toolError('Không có chủ đề "' + t.slice(0, 40) + '"', { code: 'NOT_FOUND', allowed: ['guide', 'all'].concat(Agent.topics().map(x => x.id)) });
        return { content: [{ type: 'text', text: md }] };
      }
      case 'list_actions': {
        const C = GC.choreo, who = args.character ? this.findAsset(String(args.character)) : null;
        if (args.character && !who) return toolError('Không có nhân vật ' + args.character, { code: 'NOT_FOUND' });
        return json({
          actions: Object.keys(C.ACTIONS).map(k => { const a = C.ACTIONS[k]; return Object.assign({ id: k, label: a.label, attack: !!a.attack, needs: a.needs || null, ranged: !!a.ranged, aim: a.aim || null, pack: a.pack, hint: a.hint || '' }, who ? { can: C.canDo(who, a) } : {}); }),
          reacts: Object.keys(C.REACTS).map(k => ({ id: k, label: C.REACTS[k].label })),
          character: who ? { key: who.key, weapon: C.hasWeapon(who) } : undefined,
          note: 'attack actions need step.target (another actor); needs "weapon" = the actor holds a weapon item / grip:"weapon" part in heldR'
        });
      }
      case 'list_motion_packs': return json(GC.choreo.packs().map(p => ({ key: p.key, id: p.id, name: p.name, project: p.project, status: p.status, version: p.version, actions: Object.keys(p.actions), shows: Object.keys(p.shows), clips: Object.keys(p.clips).length, poses: Object.keys(p.poses).length })));
      case 'get_motion_pack': {
        const k = String(args.key || ''), P = GC.choreo.PACKS[k.indexOf('/') > 0 ? k : MY_PACK + '/' + k];
        if (!P) return toolError('Không có gói động tác ' + k + ' (list_motion_packs)', { code: 'NOT_FOUND' });
        const o = clone(P); ['pack', 'key', 'kind', 'format'].forEach(x => delete o[x]); return json(o);
      }
      case 'get_motion_spec': return json(this.motionSpec());
      case 'validate_motion_pack': {
        let r; try { r = this.motionTry(args.pack); } catch (e) { return toolError(e, { code: 'VALIDATION_FAILED' }); }
        return r.errors.length ? toolError('Gói động tác chưa đạt: ' + r.errors.slice(0, 6).join('; '), { code: 'VALIDATION_FAILED', errors: r.errors }) : json({ ok: true, actions: r.actions, shows: r.shows, errors: [] });
      }
      case 'save_motion_pack': {
        let d; try { d = this.saveMotionPackChecked(args.pack, args.note || 'Lưu qua MCP'); } catch (e) { return toolError(e); }
        return json({ saved: true, key: d.key, version: d.version, actions: Object.keys(d.actions), shows: Object.keys(d.shows), use: 'Kịch bản: step.action = "<id hành động>"; xem: render_action', studio: 'Studio › Thư viện › Động tác' });
      }
      case 'render_voice': {
        if (!this.voice) return toolError('Giọng AI chỉ có ở bản cài chạy server', { code: 'UNAVAILABLE' });
        const A = args.character ? this.findAsset(String(args.character)) : null;
        if (args.character && !A) return toolError('Không có nhân vật ' + args.character + ' (list_characters)', { code: 'NOT_FOUND' });
        try {
          const v = await this.voice.pick({ asset: A, voice: args.voice, role: args.role, lang: args.lang, accent: args.accent }), vname = v.voice;
          const r = await this.voice.line({ text: args.text, voice: vname, role: v.role, state: args.state || 'normal', bubble: args.bubble || 'say' });
          const wav = fs.readFileSync(this.voice.clipPath(r.id)), meta = { voice: vname, role: v.role, lang: v.lang, accent: v.accent, seconds: r.seconds, cached: r.cached, clip: 'api/voice/clip/' + r.id + '.wav' };
          return { content: [{ type: 'text', text: JSON.stringify(meta) }, { type: 'audio', data: wav.toString('base64'), mimeType: 'audio/wav' }], structuredContent: meta };
        } catch (e) {
          const code = e.code === 429 ? 'UNAVAILABLE' : e.code === 409 ? 'FORBIDDEN' : e.code === 400 ? 'BAD_REQUEST' : 'UNAVAILABLE';
          return toolError(e, { code, hint: e.code === 409 ? 'Giọng AI chưa có key / bị tắt — nhờ chủ máy dán key Google AI Studio ở Studio › Cài đặt AI › Giọng AI (dán là chạy).' : e.code === 429 ? 'Hết hạn mức Google — thử lại sau ' + (e.retryAt || 'vài giờ') + ' hoặc dùng giọng trình duyệt.' : undefined });
        }
      }
      case 'design_voice': {
        if (!this.voice) return toolError('Giọng AI chỉ có ở bản cài chạy server', { code: 'UNAVAILABLE' });
        try {
          const d = await this.voice.design({ role: args.role, lang: args.lang, accent: args.accent });
          const meta = Object.assign({ designed: true, use: 'render_voice với role "' + d.role + '" + lang "' + d.lang + '" + accent "' + d.accent + '" tự dùng giọng này' }, d);
          const f = d.preview ? this.voice.clipPath(d.preview.replace(/^api\/voice\/clip\//, '').replace(/\.wav$/, '')) : null;
          const content = [{ type: 'text', text: JSON.stringify(meta) }];
          if (f && fs.existsSync(f)) content.push({ type: 'audio', data: fs.readFileSync(f).toString('base64'), mimeType: 'audio/wav' });
          return { content, structuredContent: meta };
        } catch (e) {
          const code = e.code === 429 ? 'UNAVAILABLE' : e.code === 409 ? 'FORBIDDEN' : e.code === 400 ? 'BAD_REQUEST' : 'UNAVAILABLE';
          return toolError(e, Object.assign({ code }, e.retryAt ? { retryAt: e.retryAt } : {}));
        }
      }
      case 'render_action': {
        const C = GC.choreo, A = this.findAsset(String(args.character || '')), act = Object.prototype.hasOwnProperty.call(C.ACTIONS, String(args.action)) ? C.ACTIONS[args.action] : null;
        if (!A) return toolError('Không có nhân vật ' + args.character + ' (list_characters)', { code: 'NOT_FOUND' });
        if (!act) return toolError('Không có hành động ' + args.action, { code: 'NOT_FOUND', allowed: Object.keys(C.ACTIONS) });
        if (!C.canDo(A, act)) return toolError((A.name || A.id) + ' không làm được "' + act.label + '" (cần cầm binh khí)', { code: 'VALIDATION_FAILED', allowed: C.actionsFor(A) });
        const B = args.partner ? this.findAsset(String(args.partner)) : null;
        if (args.partner && !B) return toolError('Không có nhân vật ' + args.partner, { code: 'NOT_FOUND' });
        if (args.react !== undefined && !Object.prototype.hasOwnProperty.call(C.REACTS, String(args.react))) return toolError('react: không có phản ứng "' + String(args.react).slice(0, 40) + '"', { code: 'NOT_FOUND', allowed: Object.keys(C.REACTS) });
        // số từ client không tin: kẹp fps / cell đúng inputSchema (cell đi thẳng vào thuộc tính SVG)
        const fmt = ['sheet', 'frames', 'meta'].indexOf(args.format) >= 0 ? args.format : 'sheet', fps = Math.max(4, Math.min(30, Math.round(+args.fps) || 12)), cell = Math.max(48, Math.min(512, Math.round(+args.cell) || 160));
        let an; try { an = C.animate(C.actionTimeline({ asset: A, action: args.action, partner: B, react: args.react }), { fps, maxFrames: fmt === 'frames' ? 60 : 120 }); } catch (e) { return toolError(e, { code: 'INTERNAL' }); }
        const meta = Object.assign({ character: A.key }, an.meta), head = (A.name || A.id) + ' · ' + act.label + ' — ' + an.frames.length + ' khung, ' + an.fps + ' fps, ' + an.duration + ' s';
        if (fmt === 'meta') return json(meta);
        if (fmt === 'frames') return { content: [{ type: 'text', text: head + '\n' + JSON.stringify(meta) }].concat(an.frames.map((f, i) => ({ type: 'resource', resource: { uri: 'genchibi://action/' + A.key + '/' + args.action + '/' + i + '.svg', mimeType: 'image/svg+xml', text: f.svg } }))), structuredContent: meta };
        const sh = C.sheetSVG(an, { cell });
        return { content: [{ type: 'text', text: head + ' · sprite sheet ' + sh.cols + '×' + sh.rows + ', ô ' + sh.cell.w + '×' + sh.cell.h + ' px\n' + JSON.stringify(Object.assign({ sheet: { cols: sh.cols, rows: sh.rows, cell: sh.cell } }, meta)) },
          { type: 'resource', resource: { uri: 'genchibi://action/' + A.key + '/' + args.action + '-sheet.svg', mimeType: 'image/svg+xml', text: sh.svg } }], structuredContent: Object.assign({ sheet: { cols: sh.cols, rows: sh.rows, cell: sh.cell } }, meta) };
      }
      case 'preview_shot': {
        this.sync();
        const w = this.store.getWork(String(args.work || ''));
        if (!w) return toolError('Không có tác phẩm ' + args.work + ' (list_works)', { code: 'NOT_FOUND' });
        const sid = String(args.shot), shots = w.shots || [], s = shots.find(x => x.id === sid) || (/^\d+$/.test(sid) ? shots[+sid] : null);
        if (!s) return toolError('Không có phân cảnh ' + sid + ' trong ' + w.id, { code: 'NOT_FOUND', allowed: shots.map(x => x.id) });
        const F = GC.film, miss = F.readiness({ shots: [s] })[0].missing, plan = miss.length ? null : F.direct(s);
        return json({ ready: !miss.length, missing: miss, warnings: plan ? plan.warnings : [],
          beats: plan ? plan.beats.filter(b => b.type !== 'enter').map(b => b.type === 'act' ? { act: b.action, actor: b.actor, target: b.target || undefined, react: b.react || undefined, seconds: b.real } : { line: b.say, actor: b.actor, to: b.to || undefined, camera: b.camera, bubble: b.bubble, move: b.move ? b.move.to : undefined }) : [],
          studio: 'Studio › Tạo tác › Tác phẩm › ' + w.title });
      }
      case 'list_samples': return json(this.samples());
      case 'install_sample': {
        const S = this.samples().find(x => x.id === String(args.id || ''));
        if (!S) return toolError('Không có bộ mẫu ' + args.id, { code: 'NOT_FOUND', allowed: this.samples().map(x => x.id) });
        try { return json(this.importProject(JSON.parse(fs.readFileSync(S.path, 'utf8')), { overwrite: args.overwrite === true })); } catch (e) { return toolError(e); }
      }
      case 'list_events': return json(this.store.listEvents().map(e => ({ id: e.id, title: e.title, author: e.author, savedAt: e.savedAt, steps: (e.event && e.event.steps || e.steps || []).length })));
      case 'get_app_version': case 'update_app': case 'rollback_app': return this.appTool(name, args, ctx || {});
      case 'get_part_spec': return json(this.partSpec(args.slot));
      case 'list_projects': { this.sync(); return json(this.projects()); }
      case 'list_works': return json(this.store.listWorks());
      case 'export_project': { try { return json(this.exportProject(String(args.id || ''), { sale: args.sale === true })); } catch (e) { return toolError(e); } }
      case 'import_project': {
        try { return json(this.importProject(args.bundle, { overwrite: args.overwrite === true })); }
        catch (e) { return legacyError({ imported: false, conflicts: e.conflicts || null }, e, e.conflicts ? { code: 'CONFLICT', errors: e.conflicts.map(c => 'conflicts: ' + c), hint: 'Đã có các mục này — gọi lại với overwrite: true để lưu đè (tạo phiên bản mới), hoặc đổi id.' } : {}); }
      }
      case 'get_work': { const w = this.store.getWork(String(args.id || '')); return w ? json(this.workView(w)) : toolError('Không có tác phẩm ' + args.id + '. Gọi list_works.'); }
      case 'save_work': {
        try { const w = this.saveWorkChecked(args); return json({ saved: true, id: w.id, version: w.version, studio: 'Studio › Tạo tác › Tác phẩm › ' + w.title }); }
        catch (e) { return legacyError({ saved: false, errors: e.errors || [e.message] }, e); }
      }
      case 'save_shot': {
        try { const r = this.saveShotChecked(args); return json(r); }
        catch (e) {   // lỗi kịch bản chỉ đường dẫn tính từ tham số của tool: shot.event.steps[i].field (CNS-080)
          const errs = (e.errors || [e.message]).map(x => typeof x === 'string' && /^(event|scene|cast|title)\b/.test(x) ? 'shot.' + x : x);
          return legacyError({ saved: false, errors: errs }, e, { errors: errs });
        }
      }
      case 'save_project': {
        try { return json(this.store.saveProject(args)); } catch (e) { return toolError(e); }
      }
      case 'list_items': {
        return json(GC.items().filter(i => (!args.type || i.type === args.type) && (!args.rarity || i.rarity === args.rarity))
          .map(i => ({ key: i.key, name: i.name, type: i.type, rarity: i.rarity, slot: i.equip.slot, part: i.equip.part, stats: i.stats })));
      }
      case 'validate_item': {
        const c = GC.checkItem(args.item);
        return c.errors.length ? legacyError({ ok: false, errors: c.errors, gates: [] }, 'Trang bị chưa đạt: ' + c.errors.slice(0, 6).join('; '), { code: 'VALIDATION_FAILED', errors: c.errors }) : json({ ok: true, errors: [], gates: GC.itemGate(c.def) });
      }
      case 'save_item': {
        let rec;
        try { rec = this.saveItemChecked(args.item, args.note || 'Lưu qua MCP'); }
        catch (e) { return legacyError({ saved: false, errors: e.errors || [e.message] }, e); }
        return json({ saved: true, key: rec.key, version: rec.version, use: 'Nhân vật mặc: look.equip.' + rec.equip.slot + ' = "' + rec.key + '"', studio: 'Studio › Thư viện › Vật phẩm › ' + rec.name });
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
        return c.errors.length ? legacyError({ ok: false, errors: c.errors, gates: [] }, 'Cảnh chưa đạt: ' + c.errors.slice(0, 6).join('; '), { code: 'VALIDATION_FAILED', errors: c.errors }) : json({ ok: true, errors: [], gates: GC.sceneGate(c.def) });
      }
      case 'save_scene': {
        let rec;
        try { rec = this.saveSceneChecked(args.scene, args.note || 'Lưu qua MCP'); }
        catch (e) { return legacyError({ saved: false, errors: e.errors || [e.message] }, e); }
        return json({ saved: true, key: rec.key, version: rec.version, use: 'Kịch bản: event.scene = "' + rec.key + '"; dựng: render_scene key=' + rec.key, studio: 'Studio › Thư viện › Bối cảnh › ' + rec.name });
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
        if (c.errors.length) return legacyError({ ok: false, errors: c.errors }, 'Linh kiện chưa đạt: ' + c.errors.slice(0, 6).join('; '), { code: 'VALIDATION_FAILED', errors: c.errors, hint: 'Sửa đúng các lỗi trên rồi gọi lại preview_part. Chuẩn: get_part_spec.' });
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
              { type: 'text', text: 'Đạt kiểm dữ liệu. Bàn soát: ma-nơ-canh × 5 góc nhìn (chính diện, 45°, 90°, 135°, sau lưng) × đứng / kinh ngạc / chạy / ngồi. 45°: ' + c.def.views.q45.mode + '. Kiểm: mép khớp đầu/thân, 45° không lệch, màu theo token. Ổn thì save_part.' +
                GC.partAdvice(c.def).map(w => '\n⚠ ' + w).join('') },
              { type: 'resource', resource: { uri: 'genchibi://bench/' + c.def.slot + '/' + c.def.id + '.svg', mimeType: 'image/svg+xml', text: svg } }
            ]
          };
        } finally { delete GC.LIB.parts[TMP_PACK + '/' + c.def.slot + ':' + c.def.id]; if (r && r.errors.length) { /* đã báo ở trên */ } }
      }
      case 'save_part': {
        let rec;
        try { rec = this.savePartChecked(args.part, args.note || 'Lưu qua MCP'); }
        catch (e) { return legacyError({ saved: false, errors: e.errors || [e.message] }, e); }
        if (rec.kind === 'scenery') return json({ saved: true, ref: MY_PACK + '/' + rec.id, slot: rec.slot, version: rec.version,
          use: rec.slot === 'deco' ? 'Trong cảnh: deco: [{ part: "' + MY_PACK + '/' + rec.id + '", x, y }]' : 'Trong cảnh: layers.' + rec.slot + ' = "' + MY_PACK + '/' + rec.id + '"', studio: 'Studio › Xưởng › Kho linh kiện › Phông cảnh' });
        return json({ saved: true, ref: MY_PACK + '/' + rec.id, slot: rec.slot, version: rec.version, advice: this.GC.partAdvice(rec),
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
    catch (e) { return toolError(e); }
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
  // bản sửa không gửi "project" (bàn chỉnh cũ, agent quên) → GIỮ dự án đang có, không lặng lẽ đẩy asset ra khỏi dự án
  keepProject(def, prev) { return def && typeof def === 'object' && def.project === undefined && prev && prev.project ? Object.assign({}, def, { project: prev.project }) : def; }
  saveItemChecked(item, note) {
    item = this.keepProject(item, item && this.GC.ITEMS[MY_PACK + '/' + item.id]);
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
    scene = this.keepProject(scene, scene && this.GC.SCENES[MY_PACK + '/' + scene.id]);
    const c = this.GC.checkScene(scene);
    if (!c.errors.length) {
      if (this.GC.scenes().some(x => x.id === c.def.id && x.pack !== MY_PACK)) c.errors.push('id "' + c.def.id + '" trùng cảnh của thư viện chính thức — chọn id khác');
      this.GC.sceneGate(Object.assign({ key: MY_PACK + '/' + c.def.id }, c.def)).filter(g => !g.ok && !g.info).forEach(g => c.errors.push(g.label + (g.detail ? ': ' + g.detail : '')));
    }
    if (c.errors.length) throw Object.assign(new Error('Cảnh chưa đạt: ' + c.errors.slice(0, 6).join('; ')), { code: 422, errors: c.errors });
    const rec = this.store.saveScene(c.def, note);
    return this.GC.registerScene(MY_PACK, rec).def;
  }
  // ---- mở đầu cho agent mới (bất kỳ hãng nào): trạng thái + luật + chủ đề + bước kế (luật đọc từ agent/GUIDE.md — một nguồn)
  startHere() {
    this.sync();
    const GC = this.GC, mine = list => list.filter(x => x.pack === MY_PACK), pj = this.projects(), works = this.store.listWorks();
    const st = { projects: pj.map(p => ({ id: p.id, name: p.name, sample: !!p.sample, characters: p.characters, items: p.items, scenes: p.scenes })),
      characters: mine(GC.assets()).length, items: mine(GC.items()).length, scenes: mine(GC.scenes()).length, motionPacks: GC.choreo.packs().length,
      works: works.length, samples: this.samples().map(x => ({ id: x.id, installed: x.installed, update: x.update })) };
    const next = [];
    if (!pj.some(p => !p.sample)) next.push('save_project — create the project you will work in (every asset you make belongs to it)');
    if (!pj.length) next.push('install_sample with id "' + (this.samples()[0] || { id: 'mau-van-phong-vui' }).id + '" — optional: a ready-made project to learn from');
    next.push('get_guide with topic "guide" (once), then the topic of your job');
    return { app: 'gen-chibi', version: this.version, protocol: 'MCP ' + PROTOCOLS[0], instructions: 'Read the golden rules below; follow get_guide procedures literally.',
      rules: Agent.rules(), topics: Agent.topics(), state: st, next_steps: next,
      errors: 'Failed calls start with [CODE] (VALIDATION_FAILED, NOT_FOUND, CONFLICT, FORBIDDEN, BAD_REQUEST, UNAVAILABLE, INTERNAL) and carry structuredContent.error.details[].path.' };
  }
  // chuẩn gói động tác cho agent: từ vựng LẤY LÚC CHẠY từ engine (không chép tay — STD-10) + ví dụ chạy được
  motionSpec() {
    const GC = this.GC, C = GC.choreo, M = C.MOTION;
    return { format: M.format, structure: 'see get_guide topic motion-pack', joints: GC.JOINT_IDS.filter(j => j !== 'stage'),
      channels: { x: [-400, 400], y: [-400, 400], rot: [-2160, 2160], sx: [0.1, 3], sy: [0.1, 3] }, weaponAngles: { wR: [-2160, 2160], wL: [-2160, 2160] },
      convention: 'Side views are authored facing LEFT: forward = -x, R = near limbs; arm rot + swings forward; thigh rot + kicks forward; shin rot - bends the knee; root.rot - leans forward; wR/wL = weapon angle in the world (0 = upright). Use "$" to inherit a framework pose and change only what moves.',
      framePoses: Object.keys(C.POSES).filter(k => k.indexOf(':') < 0), frameClips: Object.keys(C.CLIPS).filter(k => k.indexOf(':') < 0 && !C.CLIPS[k].make),
      eases: Object.keys(C.EASE), views: M.views, strikePoints: ['tip', 'hand', 'handL', 'foot'], eventAt: M.points, fx: M.fx, sfx: M.sfx, music: M.music, grades: M.grades,
      projectileArt: M.arts, needs: M.needs, aim: ['body', 'head'], hideSlots: M.hide, face: { eyes: Object.keys(GC.LIB.eyePoses), brows: Object.keys(GC.LIB.browPoses), mouth: Object.keys(GC.LIB.mouths), fx: Object.keys(GC.LIB.fx) },
      budget: M.budget, takenActionIds: Object.keys(C.ACTIONS), reacts: Object.keys(C.REACTS), example: Agent.examples()['motion-pack'] || null };
  }
  // kiểm gói KHÔNG lưu: cổng + dựng thử trong bàn soát tạm (gỡ ra ngay, trả lại bản đang nạp nếu đang sửa gói cũ)
  motionTry(pack) {
    const C = this.GC.choreo, c = C.checkPack(pack);
    if (c.errors.length) return { errors: c.errors };
    const live = C.PACKS[MY_PACK + '/' + c.def.id] || null;
    if (live) C.unregisterPack(live.key);
    try {
      const r = C.registerPack(TMP_PACK, c.def);
      if (r.errors.length) return { errors: r.errors };
      return { errors: this.motionSmoke(r.def), actions: Object.keys(c.def.actions), shows: Object.keys(c.def.shows) };
    } finally {
      C.unregisterPack(TMP_PACK + '/' + c.def.id);
      if (live && !C.PACKS[live.key]) C.registerPack(MY_PACK, live);
    }
  }
  // bộ mẫu đi kèm bản cài (studio/mau/*.json): đã cài chưa, có bản mới không (sample.version)
  samples() {
    const dir = path.join(__dirname, '..', 'studio', 'mau'), pj = this.store.listProjects();
    let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort(); } catch { return []; }
    return files.map(f => {
      let b; try { b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
      if (!b || !b.project) return null;
      const P = pj.find(p => p.id === b.project.id), v = b.sample && b.sample.version;
      return { id: b.project.id, name: b.project.name, file: f, path: path.join(dir, f), kind: b.kind || 'project', version: v || null, installed: !!P,
        update: !!(P && v && (!P.sample || P.sample.version !== v)), sale: false };
    }).filter(Boolean).map(x => Object.assign({}, x, { path: undefined, _path: x.path }))
      .map(x => Object.defineProperty(x, 'path', { value: x._path, enumerable: false })).map(x => { delete x._path; return x; });
  }
  // gói động tác: cổng dữ liệu (choreo.checkPack) → không trùng id hành động / màn diễn → nạp → DỰNG THỬ mọi hành động trên ma-nơ-canh khung
  // (đòn đánh: đấu với một ma-nơ-canh; một mình: diễn tại chỗ) — dựng hỏng thì gỡ ra, trả lại bản cũ, báo lỗi
  saveMotionPackChecked(pack, note) {
    const GC = this.GC, C = GC.choreo, key = MY_PACK + '/' + (pack && pack.id);
    pack = this.keepProject(pack, C.PACKS[key]);
    const c = C.checkPack(pack);
    if (c.errors.length) throw Object.assign(new Error('Gói động tác chưa đạt: ' + c.errors.slice(0, 6).join('; ')), { code: 422, errors: c.errors });
    const prev = this.store.listMotionPacks().find(x => x.id === c.def.id) || null;
    const r = C.registerPack(MY_PACK, Object.assign({}, c.def, { version: prev ? (prev.version || 1) + 1 : 1 }));
    if (r.errors.length) throw Object.assign(new Error('Gói động tác chưa đạt: ' + r.errors.slice(0, 6).join('; ')), { code: 422, errors: r.errors });
    const errs = this.motionSmoke(r.def);
    if (errs.length) {
      C.unregisterPack(key); if (prev) C.registerPack(MY_PACK, prev);
      throw Object.assign(new Error('Gói động tác dựng thử hỏng: ' + errs.slice(0, 4).join('; ')), { code: 422, errors: errs });
    }
    const rec = this.store.saveMotionPack(c.def, note);
    return C.registerPack(MY_PACK, rec).def;
  }
  motionSmoke(d) {
    const GC = this.GC, C = GC.choreo, M = GC.ASSETS['gen.khung/ma-no-canh'], errs = [], t0 = Date.now(), LIMIT = this.smokeMs;
    const late = () => { if (Date.now() - t0 > LIMIT) { if (errs.indexOf(SLOW) < 0) errs.push(SLOW); return true; } return false; };
    const SLOW = 'pack: dựng thử quá ' + LIMIT / 1000 + ' s — gói quá nặng (bớt hành động / clip / sự kiện)';
    Object.keys(d.actions).forEach(k => {
      if (late()) return;
      try {
        const tl = C.ACTIONS[k].attack ? C.duel({ a: { asset: M, x: 210, y: 330, k: 0.8 }, b: { asset: M, x: 430, y: 330, k: 0.8 }, action: k, react: 'hit' }) : C.solo({ a: { asset: M, x: 320, y: 330, k: 0.8 }, action: k });
        if (!(tl.real > 0.2 && tl.real < 30)) errs.push('actions.' + k + ': thời lượng bất thường ' + tl.real.toFixed(2) + ' s');
        if (/NaN/.test(C.frameSVG(tl, tl.real / 2))) errs.push('actions.' + k + ': khung hình có NaN');
      } catch (e) { errs.push('actions.' + k + ': ' + String(e.message).slice(0, 160)); }
    });
    Object.keys(d.shows).forEach(k => {
      if (late()) return;
      const S = C.demos[k], A = S && (GC.getAsset(S.character || '', MY_PACK) || M);
      try { const tl = C.build(A, S); if (!(tl.real > 0.2 && tl.real < 120)) errs.push('shows.' + k + ': thời lượng bất thường'); } catch (e) { errs.push('shows.' + k + ': ' + String(e.message).slice(0, 160)); }
    });
    return errs;
  }
  /* ---- GÓI DỰ ÁN (gen-chibi.project/1): xuất / nhập trọn một dự án chủ đề — nền cho bán / chia sẻ bộ asset theo chủ đề ---- */
  // opts.sale: GÓI BÁN — chỉ asset PHÁT HÀNH (nháp ở lại máy), không kèm tác phẩm; phụ thuộc bắt buộc mà còn nháp → cảnh báo
  exportProject(id, opts) {
    const GC = this.GC, S = this.store, sale = !!(opts && opts.sale);
    if (!GC.projectId(id)) throw Object.assign(new Error('Chọn một dự án để xuất (asset "chưa xếp dự án" thì xếp vào một dự án trước)'), { code: 400 });
    this.sync();
    const P = S.listProjects().find(p => p.id === id);
    if (!P) throw Object.assign(new Error('Không có dự án ' + id + ' (list_projects)'), { code: 404 });
    if (sale && P.sample) throw Object.assign(new Error('Bộ mẫu của ' + (P.sample.owner || 'Gen Labs') + ' — chỉ để xem, sửa thử, làm phim; không xuất gói bán. Dựng bộ của bạn trong một dự án riêng rồi phát hành.'), { code: 403 });
    const clean = r => { const o = this.canonRefs(r); ['version', 'savedAt', 'note', '_note', 'key'].forEach(k => delete o[k]); return o; };   // gói luôn ghi tên thư viện mới
    const inP = r => (r.project || '') === id && (!sale || GC.statusOf(r.status) === 'published');
    const allA = S.listAssets().filter(a => a.pack === MY_PACK), allI = S.listItems(), allS = S.listScenes(), dataParts = S.listParts();
    const chars = allA.filter(inP), items = allI.filter(inP), scenes = allS.filter(inP), used = {}, motionPacks = S.listMotionPacks().filter(inP);
    const works = sale ? [] : S.listWorks().map(w => S.getWork(w.id)).filter(w => w && (w.project || '') === id).map(w => clean(Object.assign({}, w, { chat: undefined })));
    const add = (list, rec) => { if (rec && !list.some(x => x.id === rec.id)) list.push(rec); };
    // gói phải TỰ ĐỦ: phân cảnh của tác phẩm có thể dùng nhân vật / bối cảnh của dự án khác → kéo theo
    works.forEach(w => (w.shots || []).forEach(s => {
      (s.cast || []).forEach(k => { const a = GC.ASSETS[k] || GC.getAsset(k, MY_PACK); if (a && a.pack === MY_PACK) add(chars, allA.find(x => x.id === a.id)); });
      const sc = s.scene && GC.getScene(s.scene, MY_PACK); if (sc && sc.pack === MY_PACK) add(scenes, allS.find(x => x.id === sc.id));
      // gói động tác chứa đòn mà phân cảnh dùng (kể cả gói của dự án khác) — khôi phục ở máy sạch không mất màn đấu (CNS-060)
      ((s.event && s.event.steps) || []).forEach(st => { const ac = st && st.action && Object.prototype.hasOwnProperty.call(GC.choreo.ACTIONS, st.action) ? GC.choreo.ACTIONS[st.action] : null, P2 = ac && GC.choreo.PACKS[ac.pack];
        if (P2 && P2.pack === MY_PACK) add(motionPacks, S.listMotionPacks().find(x => x.id === P2.id)); });
    }));
    // trang bị nhân vật đang mặc (kể cả ngoài dự án)
    chars.forEach(a => Object.values((a.look && a.look.equip) || {}).forEach(ref => { const it = GC.getItem(ref, MY_PACK); if (it && it.pack === MY_PACK) add(items, allI.find(x => x.id === it.id)); }));
    const usePart = p => { if (p && p.pack === MY_PACK) { const d = dataParts.find(x => x.slot === p.slot && x.id === p.id); if (d) used[d.slot + '~' + d.id] = clean(d); } };
    chars.forEach(a => Object.keys(GC.LIB.slots).forEach(sl => { const ref = GC.partRef(GC.ASSETS[a.pack + '/' + a.id] || a, sl); usePart(ref && GC.getPart(sl, ref, MY_PACK)); }));
    items.forEach(x => usePart(GC.getPart(x.equip.slot, x.equip.part)));
    scenes.forEach(x => Object.keys(x.layers).map(k => x.layers[k].part).concat((x.deco || []).map(d => d.part)).forEach(ref => {
      usePart(Object.values(GC.LIB.parts).find(p => p.kind === 'scenery' && p.pack + '/' + p.id === ref));
    }));
    // gói bán vẫn kéo theo phụ thuộc còn nháp (để gói tự đủ) nhưng báo rõ để người bán phát hành nó trước
    const drafts = (list, what) => list.filter(r => GC.statusOf(r.status) !== 'published').map(r => what + ' ' + r.id + ' còn nháp nhưng asset phát hành cần nó — phát hành nó trước khi bán');
    const warnings = sale ? drafts(items, 'vật phẩm').concat(drafts(scenes, 'bối cảnh')) : [];
    const out = { format: 'gen-chibi.project/1', kind: sale ? 'sale' : 'backup', license: '© 2026 Gen Labs — All rights reserved', project: { id: P.id, name: P.name, description: P.description || '' }, warnings,
      sample: P.sample || undefined,   // sao lưu bộ mẫu vẫn mang dấu mẫu → nhập lại ở máy khác vẫn không xuất bán được
      characters: chars.map(clean), items: items.map(clean), scenes: scenes.map(clean), parts: Object.values(used), motionPacks: motionPacks.map(clean), works, exportedAt: new Date().toISOString() };
    // mục của bộ mẫu dùng trong dự án KHÁC (linh kiện Tam Quốc gắn vào nhân vật của bạn…): gói bán chặn, gói sao lưu mang dấu theo
    const prov = S.provenance(), marked = provKeys(out).filter(k => prov[k]);
    if (sale) { const art = sampleArt(GC); out.parts.forEach(p => { const c = GC.checkDataPart(p), hit = art.get(artSig(c.errors.length ? p : c.def)), k = 'part:' + p.slot + ':' + p.id; if (hit && !prov[k]) { prov[k] = { owner: hit.owner }; marked.push(k); } }); }
    if (sale) { const art = sampleArt(GC); out.motionPacks.forEach(m => { const hit = motionClipSigs(GC, m).map(h => art.get('motion:' + h)).find(Boolean), k = 'motion:' + m.id; if (hit && !prov[k]) { prov[k] = { owner: hit.owner }; marked.push(k); } }); }
    if (sale && marked.length) {
      const owner = prov[marked[0]].owner || 'Gen Labs', names = marked.slice(0, 6).map(k => k.split(':').pop()).join(', ') + (marked.length > 6 ? '…' : '');
      throw Object.assign(new Error('Gói bán đang dùng ' + marked.length + ' mục của bộ mẫu ' + owner + ' (' + names + ') — bộ mẫu chỉ để xem, sửa thử, làm phim. Thay bằng linh kiện / trang bị / cảnh của riêng bạn rồi xuất lại.'), { code: 403, sample: marked });
    }
    if (marked.length) out.provenance = marked.reduce((o, k) => (o[k] = prov[k], o), {});
    // gói cần những thư viện nào (khung, chủ đề…) để mở được ở bản cài khác
    const packs = {}; JSON.stringify(out).replace(/"([a-z0-9]+(?:\.[a-z0-9-]+)+)\/[a-z0-9-]+"/g, (_, pk) => { const c = GC.canonPack(pk); if (c !== MY_PACK && GC.PACKS[c]) packs[c] = 1; return _; });
    out.requires = { engine: this.version, packs: Object.keys(packs).sort() };
    return out;
  }
  importProject(b, opts) {
    const GC = this.GC, S = this.store;
    if (!b || typeof b !== 'object' || b.format !== 'gen-chibi.project/1') throw Object.assign(new Error('Không phải gói gen-chibi.project/1'), { code: 400 });
    const P = b.project || {}, pid = GC.projectId(P.id);
    if (!pid) throw Object.assign(new Error('project.id: slug dự án (chữ thường, số, gạch nối)'), { code: 400 });
    const bad = m => Object.assign(new Error(m), { code: 400 });
    const arr = (x, n, what) => { if (x === undefined) return []; if (!Array.isArray(x)) throw bad(what + ': cần mảng'); if (x.length > n) throw bad(what + ': tối đa ' + n); return x.filter(v => v && typeof v === 'object'); };
    const parts = arr(b.parts, 300, 'parts'), items = arr(b.items, 500, 'items'), scenes = arr(b.scenes, 200, 'scenes'), chars = arr(b.characters, 500, 'characters'), works = arr(b.works, 50, 'works'), motions = arr(b.motionPacks, 8, 'motionPacks');   // mỗi gói động tác phải dựng thử (≤ 4 s) — giữ tổng thời gian chặn có trần
    // ngân sách: tổng phân cảnh ≤ 200 (mỗi phân cảnh chạy cổng đạo diễn) — chặn gói phình to làm treo server
    // gói làm bằng bản gen-chibi mới hơn bản đang chạy: báo cập nhật TRƯỚC khi ghi gì (CNS-023) — tránh nhập nửa vời
    const semver = v => { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '')); return m ? [+m[1], +m[2], +m[3]] : null; };
    const want = semver(b.requires && b.requires.engine), have = semver(this.version);
    if (want && have && (want[0] - have[0] || want[1] - have[1] || want[2] - have[2]) > 0) throw bad('Gói làm bằng gen-chibi ' + b.requires.engine + ', bản đang chạy là ' + this.version + ' — cập nhật gen-chibi (Hệ thống › Cập nhật) rồi nhập lại');
    const need = (b.requires && Array.isArray(b.requires.packs) ? b.requires.packs : []).filter(pk => typeof pk === 'string' && !Object.prototype.hasOwnProperty.call(GC.PACKS, GC.canonPack(pk)));
    if (need.length) throw bad('Gói cần thư viện chưa cài: ' + need.slice(0, 6).join(', ') + ' — cập nhật gen-chibi hoặc cài thư viện đó trước');
    const nShots = works.reduce((n, w) => n + (Array.isArray(w.shots) ? w.shots.length : 0), 0);
    if (nShots > 200) throw bad('works: tổng phân cảnh tối đa 200 (gói có ' + nShots + ')');
    // id trùng ngay trong gói: mục sau sẽ đè mục trước một cách lặng lẽ → chặn
    const dup = [];
    [['linh kiện', parts, p => p.slot + ':' + p.id], ['item', items, x => x.id], ['cảnh', scenes, x => x.id], ['nhân vật', chars, a => String(a.id || '').toLowerCase()], ['gói động tác', motions, m => m.id], ['tác phẩm', works, w => w.id]].forEach(([what, list, key]) => {
      const seen = {}; list.forEach(x => { const k = key(x); if (seen['$' + k]) dup.push(what + ' ' + k); seen['$' + k] = 1; });
    });
    if (dup.length) throw bad('Gói có id trùng: ' + dup.slice(0, 8).join(', '));
    this.sync();
    const conflicts = [], partsNow = S.listParts();
    if (S.listProjects().some(p => p.id === pid)) conflicts.push('dự án ' + pid);
    parts.forEach(p => { if (partsNow.some(x => x.slot === p.slot && x.id === p.id)) conflicts.push('linh kiện ' + p.slot + ':' + p.id); });
    items.forEach(x => { if (GC.ITEMS[MY_PACK + '/' + x.id]) conflicts.push('item ' + x.id); });
    scenes.forEach(x => { if (GC.SCENES[MY_PACK + '/' + x.id]) conflicts.push('cảnh ' + x.id); });
    chars.forEach(a => { if (GC.ASSETS[MY_PACK + '/' + String(a.id || '').toLowerCase()]) conflicts.push('nhân vật ' + a.id); });
    motions.forEach(m => { if (GC.choreo.PACKS[MY_PACK + '/' + m.id]) conflicts.push('gói động tác ' + m.id); });
    works.forEach(w => { if (S.getWork(String(w.id || ''))) conflicts.push('tác phẩm ' + w.id); });
    if (conflicts.length && !(opts && opts.overwrite)) throw Object.assign(new Error('Trùng ' + conflicts.length + ' mục với Thư viện: ' + conflicts.slice(0, 8).join(', ') + (conflicts.length > 8 ? '…' : '') + ' — nhập lại với overwrite để lưu đè thành phiên bản mới (các mục trùng sẽ chuyển sang dự án ' + pid + ')'), { code: 409, conflicts });
    const note = 'Nhập gói dự án ' + pid, done = { parts: 0, items: 0, scenes: 0, characters: 0, motionPacks: 0, works: 0, shots: 0 }, errors = [];
    const strip = r => { const o = clone(r); ['version', 'savedAt', 'note', '_note', 'key', 'pack', 'chat'].forEach(k => delete o[k]); return o; };
    const step = (kind, id, fn) => { try { fn(); done[kind]++; } catch (e) { errors.push({ kind, id: String(id || '').slice(0, 64), error: String(e.message).slice(0, 300) }); } };
    this._bulk = true;   // một lần đọc đĩa cho cả gói (sync / findAsset không đọc lại mỗi mục)
    try {
      // thứ tự phụ thuộc: linh kiện → item (trỏ linh kiện) → cảnh (trỏ phông) → nhân vật (trỏ linh kiện + item) → gói động tác → tác phẩm (trỏ nhân vật + cảnh + hành động)
      parts.forEach(p => step('parts', p.id, () => this.savePartChecked(strip(p), note)));
      items.forEach(x => step('items', x.id, () => this.saveItemChecked(Object.assign(strip(x), { project: pid }), note)));
      scenes.forEach(x => step('scenes', x.id, () => this.saveSceneChecked(Object.assign(strip(x), { project: pid }), note)));
      chars.forEach(a => step('characters', a.id, () => this.saveAssetChecked(Object.assign(strip(a), { pack: MY_PACK, project: pid }), note)));
      // gói động tác trước tác phẩm: phân cảnh gọi hành động của gói bằng tên
      motions.forEach(m => step('motionPacks', m.id, () => this.saveMotionPackChecked(Object.assign(strip(m), { project: pid }), note)));
      works.forEach(w => step('works', w.id, () => {
        const rec = this.saveWorkChecked({ id: String(w.id || ''), title: w.title, project: pid, logline: w.logline || '', script: w.script || '' });
        const mem = Object.assign(S.getWork(rec.id), { shots: [], chat: [] });   // nhập = thay trọn phân cảnh; lịch sử chat cũ không còn khớp → bỏ
        (Array.isArray(w.shots) ? w.shots.slice(0, 40) : []).forEach(s => step('shots', w.id + '/' + (s && s.id), () => this.saveShotChecked({ work: rec.id, shot: { id: s.id, title: s.title, description: s.description, scene: s.scene, cast: s.cast, event: s.event || undefined } }, { work: mem })));
        S.saveWork(mem);   // ghi MỘT lần cho cả tác phẩm
      }));
    } finally { this._bulk = false; }
    const total = Object.keys(done).reduce((n, k) => n + done[k], 0);
    // dấu nguồn gốc bộ mẫu: gói mẫu đánh dấu mọi mục của nó; gói sao lưu mang dấu nào thì giữ dấu đó (không "rửa" dấu qua sao lưu → nhập lại)
    const mark = b.sample && typeof b.sample === 'object' ? b.sample : null;
    if (mark) S.markProvenance(provKeys(b), mark);
    if (b.provenance && typeof b.provenance === 'object') Object.keys(b.provenance).slice(0, 2000).forEach(k => { const v = b.provenance[k]; if (v && typeof v === 'object') S.markProvenance([k], v); });
    // bộ mẫu (Gen Labs): dự án mang dấu chủ sở hữu + giấy phép, xuất bán bị chặn (CNS-022)
    const sample = b.sample && typeof b.sample === 'object' ? { owner: b.sample.owner, license: b.sample.license, version: b.sample.version } : null;
    if (total || !errors.length) S.saveProject({ id: pid, name: P.name || pid, description: P.description || '' }, sample ? { sample } : undefined);   // không tạo dự án rỗng khi mọi mục đều hỏng
    return { imported: total > 0, project: pid, counts: done, errors, conflicts: conflicts.length };
  }
  /* ---- TÁC PHẨM: kịch bản → phân cảnh → lời thoại; mọi phân cảnh chỉ dùng asset có trong Thư viện ---- */
  workView(w) { return this.canonRefs(Object.assign({}, w, { chat: undefined, chatCount: (w.chat || []).length })); }
  // tham chiếu "<tên thư viện cũ>/<id>" trong dữ liệu đã lưu (vd "afi.khung/khoi-mu") → tên mới; chỉ đụng chuỗi BẮT ĐẦU bằng một alias pack đã khai
  canonRefs(x) {
    const GC = this.GC;
    return JSON.parse(JSON.stringify(x).replace(/"([a-z0-9]+(?:\.[a-z0-9-]+)+)\//g, (m, pk) => { const c = GC.canonPack(pk); return c === pk ? m : '"' + c + '/'; }));
  }
  saveWorkChecked(args) {
    const GC = this.GC, errs = [];
    const plain = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, n);
    let w = args.id ? this.store.getWork(String(args.id)) : null;
    if (args.id && !w && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(args.id))) errs.push('id: chữ thường, số, gạch nối');
    if (!w) {
      const title = plain(args.title, 80).trim();
      if (!title) errs.push('title: tác phẩm mới cần tên');
      let id = args.id ? String(args.id) : slugOf(title) || 'tac-pham', n = 2;
      if (!args.id) { const base = id; while (this.store.getWork(id)) id = base + '-' + n++; }
      w = { id, title, project: '', logline: '', script: '', shots: [], chat: [], kind: 'work', createdAt: new Date().toISOString() };
    }
    if (args.title !== undefined && plain(args.title, 80).trim()) w.title = plain(args.title, 80).trim();
    if (args.project !== undefined) {
      if (args.project !== '' && !GC.projectId(args.project)) errs.push('project: slug dự án (xem list_projects)');
      else w.project = GC.projectId(args.project);
    }
    if (args.logline !== undefined) w.logline = plain(args.logline, 300);
    if (args.script !== undefined) w.script = plain(args.script, 8000);
    // ngôn ngữ lời thoại + giọng vùng của phim (engine/voices.js): giọng trình duyệt đúng tiếng, giọng AI đúng vùng
    if (args.lang !== undefined) { if (Object.prototype.hasOwnProperty.call(GV.LANGS, args.lang)) w.lang = args.lang; else errs.push('lang: ' + Object.keys(GV.LANGS).join(' | ')); }
    if (args.accent !== undefined) {
      const L = GV.lang(w.lang);
      if (GV.accent(L, args.accent) === args.accent) w.accent = args.accent; else errs.push('accent: giọng vùng của ' + L + ' — ' + GV.LANGS[L].accents.map(a => a[0]).join(' | '));
    }
    if (errs.length) throw Object.assign(new Error(errs.join('; ')), { code: 422, errors: errs });
    return this.store.saveWork(w);
  }
  shotCast(list, errs) {
    const out = [];
    (Array.isArray(list) ? list : []).slice(0, 12).forEach(ref => {
      const a = typeof ref === 'string' ? this.findAsset(ref) : null;
      if (!a) { errs.push('cast: không có nhân vật "' + String(ref).slice(0, 60) + '" trong Thư viện (list_characters) — thiếu thì tạo ở Xưởng (save_character)'); return; }
      if (out.some(x => x.id === a.id)) { errs.push('cast: "' + a.id + '" lặp'); return; }
      out.push(a);
    });
    if (out.length > 8) errs.push('cast: tối đa 8 diễn viên một cảnh (ngân sách hiệu năng)');
    return out;
  }
  saveShotChecked(args, opts) {
    const GC = this.GC, errs = [], mem = opts && opts.work;   // mem: tác phẩm trong bộ nhớ (nhập gói) — kiểm như thường, không ghi đĩa
    const w = mem || this.store.getWork(String(args.work || ''));
    if (!w) throw Object.assign(new Error('Không có tác phẩm ' + args.work + ' (list_works / save_work)'), { code: 404 });
    this.sync();
    const plain = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, n);
    const s = args.shot && typeof args.shot === 'object' ? args.shot : {};
    const shots = w.shots || [];
    let i = typeof s.id === 'string' && s.id ? shots.findIndex(x => x.id === s.id) : -1;
    if (args.remove === true) {
      if (i < 0) throw Object.assign(new Error('Không có phân cảnh ' + s.id), { code: 404 });
      shots.splice(i, 1); w.shots = shots;
      const rec = this.store.saveWork(w);
      return { saved: true, removed: s.id, shots: rec.shots.length };
    }
    if (s.id !== undefined && s.id !== null && s.id !== '' && (typeof s.id !== 'string' || (i < 0 && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(s.id)))) errs.push('shot.id: chuỗi chữ thường, số, gạch nối');
    if (i < 0 && shots.length >= 40) errs.push('tối đa 40 phân cảnh một tác phẩm — tách thành tác phẩm mới');
    const cur = i >= 0 ? this.canonRefs(shots[i]) : { id: s.id || null, title: '', description: '', scene: '', cast: [], event: null };   // phân cảnh cũ (afi.*) lưu lại thành tên mới
    if (!cur.id) { let n = shots.length + 1; while (shots.some(x => x.id === 'canh-' + n)) n++; cur.id = 'canh-' + n; }
    if (s.title !== undefined) cur.title = plain(s.title, 80);
    if (s.description !== undefined) cur.description = plain(s.description, 1000);
    if (s.scene !== undefined) {
      const sc = s.scene ? GC.getScene(String(s.scene), MY_PACK) : null;
      if (s.scene && !sc) errs.push('scene: không có cảnh "' + String(s.scene).slice(0, 60) + '" trong Thư viện (list_scenes) — thiếu thì tạo ở Xưởng (save_scene)');
      else cur.scene = sc ? sc.key : '';
    }
    let cast = (cur.cast || []).map(k => this.findAsset(k)).filter(Boolean);
    if (s.cast !== undefined) { cast = this.shotCast(s.cast, errs); cur.cast = cast.map(a => a.key); }
    if (s.event !== undefined && s.event !== null) {
      const ev = JSON.parse(JSON.stringify(s.event));
      if (ev && typeof ev === 'object') { if (cur.scene) ev.scene = cur.scene; else delete ev.scene; if (!ev.title) ev.title = cur.title || w.title; }
      const e2 = cast.length ? GC.director.validate(ev, cast) : ['event: phân cảnh cần cast trước khi viết lời thoại'];
      if (e2.length) e2.slice(0, 10).forEach(x => errs.push(/^[A-Za-z0-9_.\[\]]+: /.test(x) ? 'event.' + x : 'event: ' + x)); else cur.event = ev;   // đường dẫn liền: event.steps[i].field
    } else if (s.event === null) cur.event = null;
    else if (cur.event && (s.scene !== undefined || s.cast !== undefined)) {
      // đổi cảnh / dàn diễn viên: lời thoại cũ phải còn hợp lệ, không thì bỏ để viết lại (không giữ thứ không diễn được)
      const ev = Object.assign({}, cur.event); if (cur.scene) ev.scene = cur.scene; else delete ev.scene;
      if (GC.director.validate(ev, cast).length) cur.event = null; else cur.event = ev;
    }
    const scObj = cur.scene && GC.getScene(cur.scene);
    if (scObj && cast.length > scObj.spots.length) errs.push('cast: bối cảnh "' + scObj.name + '" chỉ mở ' + scObj.spots.length + ' chỗ đứng — bớt diễn viên hoặc chọn bối cảnh khác');
    if (!cur.title) cur.title = 'Phân cảnh ' + (i >= 0 ? i + 1 : shots.length + 1);
    if (errs.length) throw Object.assign(new Error('Phân cảnh chưa đạt: ' + errs.slice(0, 6).join('; ')), { code: 422, errors: errs });
    if (i >= 0) {
      shots[i] = cur;
      if (Number.isInteger(args.position)) { shots.splice(i, 1); shots.splice(Math.max(0, Math.min(shots.length, args.position)), 0, cur); }   // đổi thứ tự
    } else {
      const pos = Number.isInteger(args.position) ? Math.max(0, Math.min(shots.length, args.position)) : shots.length;
      shots.splice(pos, 0, cur);
    }
    w.shots = shots;
    if (mem) return { saved: true, work: w.id, shot: cur.id };
    const rec = this.store.saveWork(w);
    return { saved: true, work: rec.id, shot: cur.id, index: rec.shots.findIndex(x => x.id === cur.id), hasEvent: !!cur.event, shots: rec.shots.length };
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
    const sc = { key: 'bench/' + slot, id: 'bench', layers: { sky: { part: 'gen.khung/khung-troi', dx: 0 }, ground: { part: 'gen.khung/khung-nen', dx: 0 } }, deco: [], palette: {}, time: 'day', weather: 'clear', spots: S.spotOrder.slice() };
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
        q90: 'tuỳ chọn — nhìn ngang (quay trái). drawn (kèm layers) | same (= bản 45°) | front (= bản chính diện) | hide (không thấy). Thiếu → mượn 45°.',
        q135: 'tuỳ chọn — quay lưng chéo (thấy gáy + một bên má). drawn | same | front | hide. Thiếu → mượn sau lưng, rồi 45°.',
        q180: 'tuỳ chọn — sau lưng (engine giấu mặt, đưa vật sau lưng lên trước thân). drawn | same | front | hide. Thiếu → tóc: engine phủ một mảng tóc trơn theo viền đầu (vẽ q180 để giữ búi / dải / tóc dài); vật khác: bản chính diện.',
        engineHandles: 'vị trí mắt/mày/miệng 45°, tay xa ra sau thân, lật gương, tư thế × di chuyển × động tác — linh kiện KHÔNG tự xử lý',
        marks: 'trong layers của views (drawn): bọc chi tiết bằng <g class="gc-f45">…</g> (chiếu bám mặt: râu, hoa văn), gc-f45c (như trên + cắt theo viền đầu: mặt nạ), gc-b45t (chiếu trên thân trên: cổ áo, giáp ngực), gc-b45h (chiếu trên vạt) — dáng (silhouette) vẽ tay bên ngoài, chi tiết bên trong để engine chiếu'
      },
      shapeToken: 'd="{shape}" = viền đầu của nhân vật đang mặc (đổi theo dáng đầu tròn / vuông / oval và theo góc nhìn) — dùng cho mặt nạ, sơn mặt phủ kín đầu',
      extras: { eyeArea: 'mặt nạ: màu vùng quanh mắt "#rrggbb" (mặt nạ kinh kịch tô kín mặt)', tall: 'vật cầm tay dài (giáo, đao): true → engine giấu khi động tác cần hai tay', upright: 'vật cầm tay: false → không dựng thẳng theo cổ tay' },
      params: 'tuỳ chọn, tối đa 6: { label, type: scale|scaleX|scaleY|dx|dy, min, max, def, pivot: [x, y] }',
      example: EXAMPLE_PART,
      scenery: slot ? undefined : 'Phông cảnh (sky, far, mid, ground, front, deco): gọi get_part_spec với slot đó để lấy khung riêng 640×360.'
    };
  }
  // Bàn soát: một SVG gộp — ma-nơ-canh mặc linh kiện × 4 góc nhìn × 4 tình huống
  bench(slot, ref, label) {
    const GC = this.GC;
    const m = { id: 'mannequin', name: 'Ma-nơ-canh', pack: 'gen.core', key: 'bench/' + ref.replace(/[^a-z0-9]/gi, ''), version: 1, kind: 'character',
      look: { eyes: 'round', brows: 'normal', parts: { [slot]: ref }, params: {}, palette: {} }, expressions: {}, identity: { must: [] } };
    if (slot === 'hair') m.look.parts.hat = 'none';
    const views = [['front', 'Chính diện'], ['left45', '45° trái'], ['left90', '90° trái'], ['left135', '135° trái'], ['back', 'Sau lưng']];
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
    return all.filter(a => ids.indexOf(a.id) >= 0 || ids.indexOf(a.key) >= 0);   // nhận cả id lẫn key (agent hay đưa key từ list_characters)
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
