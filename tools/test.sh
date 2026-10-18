#!/usr/bin/env bash
# Bộ kiểm thử chạy trong CI và trước mỗi lần phát hành.
#   1) cú pháp mọi tệp JS + script bash
#   2) cổng kiểm của mọi nhân vật trong thư viện chính thức (chạy engine trong Node)
#   2c/2d) item trang bị, cảnh (loại asset thứ hai, thứ ba)
#   3) MCP: bắt tay, danh sách tool, tạo nhân vật / linh kiện / item / cảnh, chặn dữ liệu xấu
#   4) tự cập nhật end-to-end (tools/test-update.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "1) cú pháp"
for f in $(git ls-files '*.js' 2>/dev/null || find engine kinds server studio -name '*.js') launcher.js; do node --check "$f"; done
bash -n install.sh; bash -n cli/genchibi; bash -n tools/package.sh
echo "   ✓ cú pháp"
# luật cấu trúc: không đặt animation/transform CSS lên nhóm lớp của khung xương (lỗi mắt đứng yên v0.1.3)
if grep -nE "\[data-l=[^]]*\][^{]*\{[^}]*(animation|transform)" engine/render.js studio/*.css 2>/dev/null; then echo "   ✗ CSS đặt transform/animation lên nhóm lớp [data-l]"; exit 1; fi
echo "   ✓ không có CSS đè transform của khung xương"
# luật cấu trúc: không có method trùng tên trong một class (method sau đè method trước, không báo lỗi — lỗi castOf v0.9.0)
node -e '
const fs = require("fs"); let bad = 0;
for (const f of fs.readdirSync("server").filter(x => x.endsWith(".js")).map(x => "server/" + x)) {
  const seen = Object.create(null);
  fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { const m = l.match(/^  (?:async )?([A-Za-z_]\w*)\([^)]*\) \{/); if (!m || /^(if|for|while|switch|catch)$/.test(m[1])) return;
    if (seen[m[1]]) { bad++; console.log("   ✗ " + f + ": method \"" + m[1] + "\" trùng (dòng " + seen[m[1]] + " và " + (i + 1) + ")"); } else seen[m[1]] = i + 1; });
}
if (bad) process.exit(1);
' || exit 1
echo "   ✓ không có method trùng tên trong class (server)"

echo "2) cổng kiểm thư viện"
node -e '
const { loadEngine } = require("./server/engine-node");
const GC = loadEngine(process.cwd());
let bad = 0;
GC.assets().forEach(a => { GC.gate(a).forEach(g => { if (!g.ok) { bad++; console.log("   ✗", a.key, g.label, g.detail); } }); });
GC.assets().forEach(a => GC.LIB.stateOrder.forEach(s => { const svg = GC.svgString(a, s); if (svg.length < 2000) { bad++; console.log("   ✗ SVG rỗng", a.key, s); } }));
if (bad) process.exit(1);
console.log("   ✓", GC.assets().length, "nhân vật ×", GC.LIB.stateOrder.length, "biểu cảm");
// tư thế & hoạt động (engine 0.3): dựng đủ mọi hoạt động, ở nhiều thời điểm, cả hai hướng
const acts = GC.LIB.activityOrder;
GC.assets().forEach(a => {
  const g = GC.gate(a, { poses: true }).find(x => x.id === "poses");
  if (!g || !g.ok) { bad++; console.log("   ✗ hoạt động", a.key, g && g.detail); }
  acts.forEach(id => [0, 0.21, 0.5].forEach(t => ["left", "right"].forEach(f => GC.VIEW_ORDER.forEach(v => {
    const svg = GC.svgString(a, GC.LIB.activities[id].state || "normal", { director: { activity: id, facing: f, view: v }, t });
    if (/NaN|undefined/.test(svg)) { bad++; console.log("   ✗", a.key, id, "t=" + t, f, v, "SVG có NaN/undefined"); }
  }))));
});
// mọi di chuyển có tư thế hợp lệ; mọi hoạt động trỏ tới mục có thật
acts.forEach(id => { const x = GC.LIB.activities[id];
  if (x.posture && !GC.LIB.postures[x.posture]) { bad++; console.log("   ✗", id, "tư thế lạ", x.posture); }
  if (x.move && !GC.LIB.moves[x.move]) { bad++; console.log("   ✗", id, "di chuyển lạ", x.move); }
  if (x.action && !GC.LIB.motions[x.action]) { bad++; console.log("   ✗", id, "động tác lạ", x.action); }
  (x.props || []).forEach(p => { if (!GC.LIB.props[p]) { bad++; console.log("   ✗", id, "đạo cụ lạ", p); } }); });
// đạo diễn: kịch bản dùng hoạt động hợp lệ thì đạt, ghép sai thì bị chặn
const cast = GC.assets();
const ok = GC.director.validate({ title: "t", steps: [{ actor: cast[0].id, state: "normal", activity: "eat", say: "a" }, { actor: cast[0].id, state: "panic", move: "run", facing: "left", say: "b" }] }, cast);
const ko = GC.director.validate({ title: "t", steps: [{ actor: cast[0].id, state: "normal", move: "swim", posture: "stand", say: "a" }, { actor: cast[0].id, state: "normal", activity: "bay-len-troi", say: "b" }] }, cast);
if (ok.length || ko.length !== 2) { bad++; console.log("   ✗ đạo diễn:", ok, ko); }
// 45° vẽ thật ở mức linh kiện: ma-nơ-canh của khung phủ đủ (mọi asset dựng từ khung kế thừa)
const gcl = GC.assets().find(a => a.id === "ma-no-canh");
const cov = GC.gate(gcl).find(x => x.id === "view45");
if (!cov || !/đủ/.test(cov.detail)) { bad++; console.log("   ✗ Ma-nơ-canh (khung) chưa đủ bản vẽ 45°:", cov && cov.detail); }
const cov8 = GC.gate(gcl).find(x => x.id === "views8");
if (!cov8 || !/đủ/.test(cov8.detail)) { bad++; console.log("   ✗ Ma-nơ-canh (khung) chưa đủ 8 hướng:", cov8 && cov8.detail); }
// rào 8 hướng: linh kiện của KHUNG phải vẽ đủ 4 dáng góc (khung là quy cách — asset dựng từ khung mượn được góc gần nhất, khung thì không)
Object.values(GC.LIB.parts).filter(p => GC.PACKS[p.pack].group === "frame" && p.id !== "none" && !/^held[LR]$/.test(p.slot) && p.kind !== "scenery").forEach(p => {
  const lack = GC.VIEW_KINDS.filter(k => !(p.views && p.views[k]));
  if (lack.length) { bad++; console.log("   ✗ linh kiện khung thiếu góc:", p.pack + "/" + p.slot + ":" + p.id, lack.join(", ")); }
});
// rào quy trình (docs/QUY-TRINH-LINH-KIEN.md): linh kiện thư viện chính thức phải có bản 45°, license và nguồn
Object.values(GC.LIB.parts).filter(p => ["official", "frame"].indexOf(GC.PACKS[p.pack].group) >= 0 && p.id !== "none" && !/^held[LR]$/.test(p.slot) && p.kind !== "scenery").forEach(p => {
  if (!(p.views && p.views.q45)) { bad++; console.log("   ✗ linh kiện chính thức thiếu bản 45°:", p.pack + "/" + p.slot + ":" + p.id); }
  if (!p.license || !p.source) { bad++; console.log("   ✗ linh kiện thiếu license/nguồn:", p.pack + "/" + p.slot + ":" + p.id); }
});
if (bad) process.exit(1);
console.log("   ✓", acts.length, "hoạt động ×", GC.assets().length, "nhân vật × 3 thời điểm × 2 hướng ×", GC.VIEW_ORDER.length, "góc nhìn; kịch bản có hoạt động được kiểm");
'

echo "2b) linh kiện dữ liệu: bộ lọc SVG an toàn"
node -e '
const { loadEngine } = require("./server/engine-node"); const GC = loadEngine(process.cwd());
let bad = 0;
const attacks = {
  "thẻ script": "<script>alert(1)</script>",
  "onload": "<path d=\"M0,0 L1,1\" onload=\"alert(1)\"/>",
  "url()": "<path d=\"M0,0\" fill=\"url(javascript:alert(1))\"/>",
  "style": "<path d=\"M0,0\" style=\"fill:red\"/>",
  "href": "<g href=\"javascript:alert(1)\"></g>",
  "image": "<image href=\"x.png\"/>",
  "foreignObject": "<foreignObject><div/></foreignObject>",
  "text": "<text>hi</text>",
  "chữ thừa": "<path d=\"M0,0\"/>hello",
  "nháy đơn": "<path d='M0,0'/>",
  "comment": "<!-- x --><path d=\"M0,0\"/>",
  "entity": "<path d=\"M0,0&#x3C;\"/>",
  "token lạ": "<path d=\"M0,0\" fill=\"{evil}\"/>",
  "transform lạ": "<g transform=\"url(#x)\"></g>",
  "g không đóng": "<g>",
  "lồng sai": "<g><path d=\"M0,0\"></g>"
};
for (const k in attacks) { const r = GC.sanitizeSvg(attacks[k]); if (!r.errors.length) { bad++; console.log("   ✗ lọt:", k, r.svg); } }
const good = GC.sanitizeSvg("<g transform=\"translate(2 3)\"><path d=\"M38,78 L100,22 Z\" fill=\"{hat}\" stroke=\"{ink}\" stroke-width=\"2.8\"/><circle cx=\"1\" cy=\"2\" r=\"3\" fill=\"#fff\"/></g>");
if (good.errors.length) { bad++; console.log("   ✗ chặn nhầm SVG hợp lệ:", good.errors); }
const noq = GC.checkDataPart({ id: "x-1", slot: "hat", layers: { hat: "<path d=\"M0,0\"/>" } });
if (!noq.errors.some(e => /q45/.test(e))) { bad++; console.log("   ✗ không bắt buộc 45°"); }
const lay = GC.checkDataPart({ id: "x-2", slot: "hat", layers: { propFront: "<path d=\"M0,0\"/>" }, views: { q45: "same" } });
if (!lay.errors.length) { bad++; console.log("   ✗ cho dùng lớp đạo cụ"); }
// linh kiện dữ liệu 8 hướng (tuỳ chọn): drawn | same | front | hide; mode lạ bị chặn; đăng ký xong dựng được mọi góc
if (!GC.checkDataPart({ id: "x-4", slot: "hat", layers: { hat: "<path d=\"M0,0\"/>" }, views: { q45: "same", q90: "bay" } }).errors.some(e => /q90/.test(e))) { bad++; console.log("   ✗ mode góc 90° lạ vẫn qua"); }
const d8 = GC.registerDataPart("gen.khung", { id: "x-8", slot: "hat", layers: { hat: "<path d=\"M50,80 L150,80 L100,40 Z\" fill=\"{hat}\"/>" }, views: { q45: "same", q90: { mode: "drawn", layers: { hat: "<path d=\"M60,80 L140,80 L96,40 Z\" fill=\"{hat}\"/>" } }, q135: "front", q180: "hide" } });
if (d8.errors.length || !["q45", "q90", "q135", "q180"].every(k => d8.part.views[k]) || d8.part.views.q180({ P: {} }) !== null) { bad++; console.log("   ✗ linh kiện dữ liệu 8 hướng:", d8.errors); }
else delete GC.LIB.parts["gen.khung/hat:x-8"];
// hồi quy review bảo mật v0.3.0
const t0 = Date.now();
GC.sanitizeSvg("<g transform=\"" + ("translate(1)" + " ".repeat(100)).repeat(6) + "x\"></g>");
GC.sanitizeSvg("<g" + " ".repeat(19000));
if (Date.now() - t0 > 300) { bad++; console.log("   ✗ ReDoS: lọc mất", Date.now() - t0, "ms"); }
for (const k of ["<constructor/>", "<path d=\"M0,0\" fill=\"{constructor}\"/>", "<path d=\"M0,0\" constructor=\"x\"/>", "<path d=\"M0,0\" fill=\"#000\" fill=\"#fff\"/>"]) {
  let r; try { r = GC.sanitizeSvg(k); } catch (e) { r = { errors: [] , thrown: e.message }; }
  if (!r.errors.length) { bad++; console.log("   ✗ lọt/ném lỗi:", k, r.thrown || ""); }
}
if (!GC.checkDataPart({ id: "x-3", slot: "constructor", layers: { hat: "<path d=\"M0,0\"/>" }, views: { q45: "same" } }).errors.length) { bad++; console.log("   ✗ slot constructor lọt"); }
const { MCP } = require("./server/mcp"); const { Store } = require("./server/store");
const tmp = require("fs").mkdtempSync(require("os").tmpdir() + "/gc-sec-");
const mcp = new MCP({ engine: GC, store: new Store(tmp), version: "test" });
const ow = mcp.saveAssetChecked({ pack: "gen.khung", id: "ma-no-canh", name: "hacked", look: { eyes: "round", brows: "normal", parts: {} } }, "x");
if (ow.pack !== "local.my") { bad++; console.log("   ✗ MCP/AI ghi đè được nhân vật chính thức:", ow.key); }
try { mcp.savePartChecked({ id: "khoi-mu", slot: "hat", layers: { hat: "<path d=\"M0,0\"/>" }, views: { q45: "same" } }); bad++; console.log("   ✗ linh kiện trùng id chính thức được lưu"); } catch (e) { /* đúng: bị chặn */ }
if (bad) process.exit(1);
console.log("   ✓", Object.keys(attacks).length, "kiểu tấn công bị chặn; SVG hợp lệ qua; 45° bắt buộc; lớp sân khấu bị cấm");
console.log("   ✓ hồi quy bảo mật: không ReDoS, không tra prototype, không attr trùng, MCP/AI không ghi đè thư viện chính thức, không che id chính thức");
'

echo "2c) item trang bị (loại asset thứ hai)"
node -e '
const { loadEngine } = require("./server/engine-node"); const GC = loadEngine(process.cwd());
let bad = 0; const no = (c, m) => { if (c) { bad++; console.log("   ✗", m); } };
GC.items().forEach(i => GC.itemGate(i).forEach(g => no(!g.ok, i.key + ": " + g.label + " " + g.detail)));
const B = { id: "item-mau", name: "X", type: "weapon", rarity: "rare", equip: { part: "gen.khung/khoi-que-dai" } };
const err = d => GC.checkItem(Object.assign({}, B, d)).errors.length;
no(err({}), "item mẫu phải hợp lệ (nếu không, các phép chặn dưới đây vô nghĩa): " + GC.checkItem(B).errors.join("; "));
no(!err({ type: "boots" }), "loại không khớp linh kiện vẫn qua");
no(!err({ equip: { part: "khong-co" } }), "linh kiện lạ vẫn qua");
no(!err({ equip: { part: "gen.khung/khoi-que-dai", palette: { metal: "red; x" } } }), "màu không phải hex vẫn qua");
no(!err({ equip: { part: "gen.khung/khoi-que-dai", palette: { constructor: "#fff" } } }), "token màu prototype vẫn qua");
no(!err({ stats: { atk: 5000 } }), "chỉ số ngoài 0–999 vẫn qua");
no(!err({ rarity: "mythic" }), "độ hiếm lạ vẫn qua");
const card = GC.itemSvg(Object.assign({ key: "t" }, GC.checkItem(Object.assign({}, B, { name: "<script>alert(1)</script>" })).def), { mode: "card" });
no(/<script/.test(card), "tên item không được escape trong thẻ");
const qv = JSON.parse(JSON.stringify(GC.ASSETS["gen.khung/ma-no-canh"])); qv.key = "t/qv"; qv.look.equip = { heldR: "gen.khung/khung-vu-khi-dai", outfit: "gen.khung/khung-khoac-than", back: "gen.khung/khung-sau-lung" };
no(GC.blockingGates(GC.gate(qv, { poses: true }), "published").length, "nhân vật mặc trang bị không qua cổng");
no(GC.partRef(qv, "heldR") !== "gen.khung/khoi-que-dai", "trang bị không thay linh kiện");
qv.look.equip = { heldR: "gen.khung/khung-khoac-than" };
no(!GC.gate(qv).find(g => g.id === "parts" && !g.ok), "mặc item sai bộ phận vẫn qua");
if (bad) process.exit(1);
// hồi quy v0.4.1: part không phải chuỗi, ký tự điều khiển, item lệch bộ phận không làm vỡ nhân vật
let thrown = null; try { GC.checkItem(Object.assign({}, B, { equip: { part: { x: 1 } } })); GC.checkItem(Object.assign({}, B, { equip: { part: 7 } })); } catch (e) { thrown = e; }
no(thrown, "equip.part không phải chuỗi làm checkItem ném lỗi: " + (thrown && thrown.message));
no(err({ equip: { part: 7 } }) === 0, "equip.part là số vẫn qua");
const cc = GC.checkItem(Object.assign({}, B, { name: "A\u0000B\u001f", description: "x\u0007y" })).def;
no(/[\u0000-\u001f]/.test(cc.name + cc.description), "ký tự điều khiển lọt vào item");
qv.look.equip = { hat: "gen.khung/khung-vu-khi-dai" };
let vo = null; try { GC.svgString(qv, "normal"); } catch (e) { vo = e; }
no(vo, "item lệch bộ phận làm vỡ nhân vật: " + (vo && vo.message));
console.log("   ✓", GC.items().length, "item chính thức đạt cổng; chặn loại/linh kiện/màu/chỉ số/độ hiếm sai; thẻ escape chữ; nhân vật mặc trang bị đạt cổng");
'

echo "2d) cảnh (loại asset thứ ba)"
node -e '
const { loadEngine } = require("./server/engine-node"); const GC = loadEngine(process.cwd());
GC.registerAsset("t.cast", Object.assign(JSON.parse(JSON.stringify(GC.ASSETS["gen.khung/ma-no-canh"])), { id: "nguoi-2" }));   // diễn viên thứ hai dựng từ khung
let bad = 0; const no = (c, m) => { if (c) { bad++; console.log("   ✗", m); } };
GC.scenes().forEach(s => GC.sceneGate(s).forEach(g => no(!g.ok, s.key + ": " + g.label + " " + g.detail)));
GC.scenery().filter(p => GC.PACKS[p.pack].group === "official").forEach(p => no(!p.license || !p.source, "phông thiếu license/nguồn: " + p.pack + "/" + p.slot + ":" + p.id));
// phông chính thức phải được dùng lại: mỗi phông nằm trong ít nhất một cảnh (thư viện là nguyên liệu, không vẽ thừa)
GC.scenery().filter(p => p.pack === "gen.khung").forEach(p => { const ref = p.pack + "/" + p.id; no(!GC.scenes().some(s => Object.values(s.layers).some(l => l.part === ref) || s.deco.some(d => d.part === ref)), "phông không cảnh nào dùng: " + ref); });
const B = { id: "canh-mau", name: "Mẫu", layers: { sky: "khung-troi", ground: "khung-nen" } };
const err = d => GC.checkScene(Object.assign({}, B, d)).errors.length;
no(err({}), "cảnh mẫu phải hợp lệ: " + GC.checkScene(B).errors.join("; "));
no(!err({ layers: { sky: "khung-troi" } }), "thiếu mặt đất vẫn qua");
no(!err({ layers: { sky: "khung-troi", ground: "khung-nen", far: "khong-co" } }), "phông lạ vẫn qua");
no(!err({ layers: { sky: "khung-nen", ground: "khung-nen" } }), "phông sai lớp vẫn qua");
no(!err({ layers: { sky: "khung-troi", ground: "khung-nen", hat: "x" } }), "lớp lạ vẫn qua");
no(!err({ layers: { sky: { part: 7 }, ground: "khung-nen" } }), "part không phải chuỗi vẫn qua");
no(!err({ palette: { grass: "red" } }), "màu không phải hex vẫn qua");
no(!err({ palette: { robe: "#ffffff" } }), "token màu nhân vật vẫn qua ở cảnh");
no(!err({ palette: { constructor: "#ffffff" } }), "token prototype vẫn qua");
no(!err({ time: "noon" }) || !err({ weather: "storm" }), "giờ / thời tiết lạ vẫn qua");
no(!err({ spots: ["left", "san-khau"] }) || !err({ spots: [] }), "chỗ đứng lạ / rỗng vẫn qua");
no(!err({ deco: new Array(11).fill({ part: "khoi-da", x: 100 }) }), "quá ngân sách 10 đạo cụ vẫn qua");
const c0 = GC.checkScene(Object.assign({}, B, { name: "A\u0000<b>", deco: [{ part: "khoi-da", x: 9999, scale: 99 }] })).def;
no(/[\u0000]/.test(c0.name) || c0.deco[0].x !== 640 || c0.deco[0].scale !== 2.5, "chữ / số không được làm sạch, kẹp khoảng");
// diễn viên
const sc = GC.getScene("san-khau-chuan");
no(GC.checkCast([{ character: "ma-no-canh", spot: "left" }, { character: "nguoi-2", spot: "right", activity: "attack", view: "left45" }], sc).length, "dàn diễn viên hợp lệ bị chặn");
no(!GC.checkCast([{ character: "khong-co", spot: "left" }], sc).length, "nhân vật lạ vẫn qua");
no(!GC.checkCast([{ character: "nguoi-2", spot: "left" }, { character: "ma-no-canh", spot: "left" }], sc).length, "hai người cùng chỗ đứng vẫn qua");
no(!GC.checkCast([{ character: "nguoi-2", spot: "__proto__" }], sc).length, "chỗ đứng prototype vẫn qua");
no(!GC.checkCast(new Array(9).fill(0).map((x, i) => ({ character: "nguoi-2", spot: GC.SCENE.spotOrder[i % 8] })), sc).length, "quá 8 diễn viên vẫn qua");
const a1 = GC.sceneSvg(sc, { cast: [{ character: "ma-no-canh", spot: "midLeft" }, { character: "nguoi-2", spot: "midRight" }] });
no(a1 !== GC.sceneSvg(sc, { cast: [{ character: "ma-no-canh", spot: "midLeft" }, { character: "nguoi-2", spot: "midRight" }] }), "dựng cảnh không ổn định (ảnh cache sẽ nhảy)");
GC.SCENE.timeOrder.forEach(t => GC.SCENE.weatherOrder.forEach(w => { try { GC.sceneSvg(sc, { time: t, weather: w }); } catch (e) { no(true, "dựng " + t + "/" + w + ": " + e.message); } }));
// phông dạng dữ liệu: cùng bộ lọc SVG, token cảnh
const okS = GC.checkDataPart({ id: "da-ci", slot: "deco", label: "Đá", svg: "<circle cx=\"0\" cy=\"-10\" r=\"10\" fill=\"{stone}\"/>" });
no(okS.errors.length, "phông dữ liệu hợp lệ bị chặn: " + okS.errors.join("; "));
no(!GC.checkDataPart({ id: "da-ci", slot: "deco", svg: "<circle r=\"1\" onload=\"x\"/>" }).errors.length, "phông có on* vẫn qua");
no(!GC.checkDataPart({ id: "da-ci", slot: "deco", svg: "<image href=\"x\"/>" }).errors.length, "phông có <image> vẫn qua");
no(!GC.checkDataPart({ id: "da-ci", slot: "deco", svg: "<circle r=\"1\" fill=\"{robe}\"/>" }).errors.length, "phông dùng token nhân vật vẫn qua");
no(!GC.checkDataPart({ id: "da-ci", slot: "deco", layers: { hat: "<g/>" } }).errors.length, "phông dùng layers (sai khuôn) vẫn qua");
// đạo diễn: kịch bản đặt vào cảnh
const cast = GC.assets();
no(GC.director.validate({ title: "t", scene: "gen.khung/san-khau-chuan", steps: [{ actor: "ma-no-canh", state: "normal", spot: "left", say: "a" }] }, cast).length, "kịch bản có cảnh hợp lệ bị chặn");
no(!GC.director.validate({ title: "t", scene: "khong-co", steps: [{ actor: "ma-no-canh", state: "normal", say: "a" }] }, cast).length, "cảnh lạ vẫn qua");
no(!GC.director.validate({ title: "t", steps: [{ actor: "ma-no-canh", state: "normal", spot: "tren-troi", say: "a" }] }, cast).length, "chỗ đứng lạ vẫn qua");
// hồi quy v0.5.1: không có giá trị hỏng (NaN, undefined…) trong mọi phông × giờ × thời tiết; tách lớp back/front đủ nội dung
const BAD = /NaN|undefined|null|\[object|Infinity/;
GC.scenes().forEach(s => GC.SCENE.timeOrder.forEach(t => GC.SCENE.weatherOrder.forEach(w => { const v = GC.sceneSvg(s, { time: t, weather: w, cast: [{ character: "ma-no-canh", spot: "left" }, { character: "nguoi-2", spot: "right" }] }); no(BAD.test(v), "giá trị hỏng trong " + s.key + " " + t + "/" + w + ": " + (v.match(BAD) || [""])[0]); })));
GC.SCENE.timeOrder.forEach(t => Object.keys(GC.SCENE.slots).forEach(slot => GC.scenery(slot).forEach(p => {
  const sc = { key: "q/" + p.id, id: "q", layers: { sky: { part: "gen.khung/khung-troi", dx: 0 }, ground: { part: "gen.khung/khung-nen", dx: 0 } }, deco: [], palette: {}, time: t, weather: "clear", spots: GC.SCENE.spotOrder };
  if (slot === "deco") sc.deco = [{ part: p.pack + "/" + p.id, x: 300, y: 300, scale: 1, flip: false, z: "back" }]; else sc.layers[slot] = { part: p.pack + "/" + p.id, dx: 0 };
  no(BAD.test(GC.sceneSvg(sc)), "phông " + p.id + " sinh giá trị hỏng ở giờ " + t);
})));
const full = GC.sceneSvg(sc), bk = GC.sceneSvg(sc, { part: "back" }), fr = GC.sceneSvg(sc, { part: "front" });
no(bk.length + fr.length < full.length || fr.length < 200, "tách lớp back/front thiếu nội dung");   // lớp trước phải có tiền cảnh
// đạo diễn: chỗ đứng theo cảnh
const one = { id: "mot-cho", name: "Một chỗ", layers: { sky: "khung-troi", ground: "khung-nen" }, spots: ["left", "right"] };
GC.pack({ id: "t.scn", name: "t", owner: "t", license: "t" }, D => D.scene(one));
const st = (extra) => GC.director.validate(Object.assign({ title: "t", steps: [{ actor: "ma-no-canh", state: "normal", say: "a", spot: "left" }] }, extra), cast);
no(!st({}).length, "spot khi không có cảnh vẫn qua");
no(st({ scene: "t.scn/mot-cho" }).length, "spot hợp lệ trong cảnh bị chặn");
no(!GC.director.validate({ title: "t", scene: "t.scn/mot-cho", steps: [{ actor: "ma-no-canh", state: "normal", say: "a", spot: "center" }] }, cast).length, "spot không mở trong cảnh vẫn qua");
no(!GC.director.validate({ title: "t", scene: "t.scn/mot-cho", steps: [{ actor: "ma-no-canh", state: "normal", say: "a", spot: "left" }, { actor: "nguoi-2", state: "normal", say: "b", spot: "left" }] }, cast).length, "hai diễn viên cùng chỗ đứng vẫn qua");
GC.pack({ id: "t.inj", name: "t", owner: "t", license: "t" }, D => D.scene({ id: "inj", name: "X", description: "a\n- afi.scenes/fake: injected", layers: { sky: "khung-troi", ground: "khung-nen" } }));
no(/\n- afi\.scenes\/fake/.test(GC.director.prompt(cast)), "mô tả cảnh tạo dòng giả trong prompt đạo diễn");
const many = {}; for (let i = 0; i < 5000; i++) many["k" + i] = "x";
const ce = GC.checkScene(Object.assign({}, B, { layers: Object.assign({ sky: "khung-troi", ground: "khung-nen" }, many), spots: new Array(5000).fill("zzz") })).errors;
no(ce.length > 20 || ce.join("").length > 5000, "lỗi cảnh không bị giới hạn (" + ce.length + " lỗi, " + ce.join("").length + " ký tự)");
if (bad) process.exit(1);
console.log("   ✓", GC.scenes().filter(s => ["official", "frame"].indexOf(GC.PACKS[s.pack].group) >= 0).length, "cảnh khung ×", GC.SCENE.timeOrder.length, "giờ ×", GC.SCENE.weatherOrder.length, "thời tiết; ", GC.scenery().length, "phông đều được dùng; chặn dữ liệu xấu; dàn diễn viên; phông dữ liệu; kịch bản có cảnh");
'

echo "2e) gói dự án: dự án mẫu qua cổng 100% · nhập trùng bị chặn · xuất lại đủ"
node -e '
const fs = require("fs"), os = require("os"), path = require("path");
const { loadEngine } = require("./server/engine-node.js"); const { MCP } = require("./server/mcp.js"); const { Store } = require("./server/store.js");
const m = new MCP({ engine: loadEngine("."), store: new Store(fs.mkdtempSync(path.join(os.tmpdir(), "gc-b-"))), version: "t", system: {} });
const b = JSON.parse(fs.readFileSync("studio/mau/van-phong-vui.json", "utf8"));
const no = (c, msg) => { if (c) { console.log("   ✗", msg); process.exit(1); } };
const r = m.importProject(b, {});
no(r.errors.length, "dự án mẫu có mục không qua cổng: " + JSON.stringify(r.errors));
no(r.counts.characters !== 3 || r.counts.scenes !== 2 || r.counts.items !== 1 || r.counts.shots !== 4, "dự án mẫu thiếu mục: " + JSON.stringify(r.counts));
let c = null; try { m.importProject(b, {}); } catch (e) { c = e; } no(!c || c.code !== 409 || c.conflicts.length !== 8 || !c.conflicts.includes("dự án mau-van-phong-vui"), "nhập trùng phải trả 409 + danh sách trùng (kể cả dự án): " + (c && c.conflicts));
no(m.importProject(b, { overwrite: true }).errors.length, "lưu đè lỗi");
const ex = m.exportProject("mau-van-phong-vui");
no(ex.characters.length !== 3 || ex.works.length !== 1 || ex.works[0].shots.length !== 4 || ex.works[0].chat, "xuất gói thiếu / lộ chat");
no(ex.kind !== "backup" || ex.warnings.length, "gói sao lưu: kind backup, không cảnh báo");
// GÓI BÁN (Q3, 2026-10-18): chỉ asset PHÁT HÀNH, không kèm tác phẩm; phụ thuộc còn nháp → kéo theo + cảnh báo
const s0 = m.exportProject("mau-van-phong-vui", { sale: true });
no(s0.kind !== "sale" || s0.characters.length || s0.items.length || s0.scenes.length || s0.works.length, "dự án toàn nháp → gói bán rỗng: " + JSON.stringify({ c: s0.characters.length, i: s0.items.length, s: s0.scenes.length, w: s0.works.length }));
const pub = id => { const r = m.store.listAssets().find(a => a.pack === "local.my" && a.id === id); return m.saveAssetChecked(Object.assign({}, r, { pack: "local.my", status: "published" }), "phát hành", { allowAnyPack: true }); };
no(pub("mau-anh-ba").status !== "published", "phát hành nhân vật");
const s1 = m.exportProject("mau-van-phong-vui", { sale: true });
no(s1.characters.length !== 1 || s1.characters[0].id !== "mau-anh-ba" || s1.works.length, "gói bán chỉ có asset phát hành, không tác phẩm");
no(!s1.items.some(i => i.id === "mau-tap-ho-so") || !s1.warnings.some(w => /mau-tap-ho-so/.test(w)), "trang bị còn nháp: vẫn kéo theo (gói tự đủ) + cảnh báo: " + JSON.stringify(s1.warnings));
no(m.GC.statusOf("approved") !== "published" || m.GC.statusOf("review") !== "draft" || m.GC.statusOf(undefined) !== "draft", "statusOf: dữ liệu cũ approved → phát hành, còn lại → nháp");
let eid = null; try { pub("mau-be-na"); m.saveAssetChecked({ pack: "local.my", id: "mau-thieu-nd", name: "x", status: "published", look: { eyes: "round", brows: "normal", parts: {} } }, "t", { allowAnyPack: true }); } catch (x) { eid = x; }
no(!eid || !/nhận diện|identity/i.test(eid.message), "phát hành thiếu dấu nhận diện phải bị chặn; nháp thì không");
no(!m.saveAssetChecked({ pack: "local.my", id: "mau-thieu-nd", name: "x", look: { eyes: "round", brows: "normal", parts: {} } }, "t", { allowAnyPack: true }), "nháp thiếu nhận diện vẫn lưu được");
for (const bad of [null, { format: "x" }, { format: "gen-chibi.project/1", project: { id: "../x" } }, { format: "gen-chibi.project/1", project: { id: "ok" }, characters: "x" }]) {
  let e = null; try { m.importProject(bad, {}); } catch (x) { e = x; } no(!e || e.code !== 400, "gói hỏng phải bị chặn: " + JSON.stringify(bad));
}
const evil = JSON.parse(JSON.stringify(b)); evil.project.id = "evil"; evil.characters = [{ id: "x-evil", name: "x", look: { eyes: "round", brows: "normal", parts: { hat: "ufo" } } }]; evil.items = evil.scenes = evil.works = [];
const re = m.importProject(evil, {}); no(!re.errors.length || re.counts.characters, "nhân vật dùng linh kiện lạ phải bị cổng chặn khi nhập");
// hồi quy review v0.11: ngân sách phân cảnh, id trùng trong gói, dự án rỗng không được tạo, gói tự đủ, không xuất "chưa xếp"
const big = { format: "gen-chibi.project/1", project: { id: "big" }, works: [{ id: "w", title: "w", shots: Array.from({ length: 201 }, (_, i) => ({ id: "c" + i })) }] };
let eb = null; try { m.importProject(big, {}); } catch (x) { eb = x; } no(!eb || !/200/.test(eb.message), "gói > 200 phân cảnh phải bị chặn");
let ed = null; try { m.importProject({ format: "gen-chibi.project/1", project: { id: "dup" }, items: [{ id: "a" }, { id: "a" }] }, {}); } catch (x) { ed = x; } no(!ed || !/trùng/.test(ed.message), "id trùng trong gói phải bị chặn");
no(m.store.listProjects().some(p => p.id === "evil"), "gói mà mọi mục đều hỏng không được tạo dự án rỗng");
let e0 = null; try { m.exportProject(""); } catch (x) { e0 = x; } no(!e0 || e0.code !== 400, "không xuất gói \"chưa xếp dự án\"");
m.store.saveProject({ id: "khac", name: "Khác" });
m.saveWorkChecked({ id: "phim-khac", title: "Phim khác", project: "khac" });
m.saveShotChecked({ work: "phim-khac", shot: { title: "x", scene: "local.my/mau-van-phong", cast: ["mau-be-na"] } });
const ek = m.exportProject("khac");
no(!ek.characters.some(a => a.id === "mau-be-na") || !ek.scenes.some(x => x.id === "mau-van-phong"), "gói phải tự đủ: kéo theo nhân vật / bối cảnh dự án khác mà phân cảnh dùng");
// sửa ở bàn chỉnh (không gửi project) không được đẩy asset ra khỏi dự án (CNS-002)
const it0 = m.GC.ITEMS["local.my/mau-tap-ho-so"];
m.saveItemChecked({ id: it0.id, name: "Tập hồ sơ (sửa)", type: it0.type, rarity: it0.rarity, equip: it0.equip }, "t");
no(m.GC.ITEMS["local.my/mau-tap-ho-so"].project !== "mau-van-phong-vui", "sửa item làm rơi dự án");
const sc0 = m.GC.SCENES["local.my/mau-van-phong"];
m.saveSceneChecked({ id: sc0.id, name: "VP", layers: sc0.layers, deco: sc0.deco }, "t");
no(m.GC.SCENES["local.my/mau-van-phong"].project !== "mau-van-phong-vui", "sửa cảnh làm rơi dự án");
const ch0 = m.saveAssetChecked({ pack: "local.my", id: "mau-be-na", name: "Na", look: { eyes: "round", brows: "normal", parts: {} } }, "t", { allowAnyPack: true });
no(ch0.project !== "mau-van-phong-vui", "sửa nhân vật làm rơi dự án");
no(m.saveItemChecked({ id: it0.id, name: "x", type: it0.type, rarity: it0.rarity, equip: it0.equip, project: "" }, "t").project !== "", "đặt project rỗng có chủ đích vẫn phải được");
no(JSON.stringify(m.exportProject("mau-van-phong-vui").requires.packs) !== JSON.stringify(["gen.khung"]), "gói phải khai báo thư viện cần có (requires.packs)");
let er = null; try { m.importProject({ format: "gen-chibi.project/1", project: { id: "can" }, requires: { packs: ["afi.tamquoc"] } }, {}); } catch (x) { er = x; } no(!er || !/afi.tamquoc/.test(er.message), "gói cần thư viện chưa cài phải báo rõ");
// đổi tên thư viện afi.* → gen.* (Q4, 2026-10-18): dữ liệu / gói cũ vẫn đọc được, lưu mới ghi tên mới
no(!m.GC.getAsset("afi.khung/ma-no-canh") || m.GC.getAsset("afi.khung/ma-no-canh").key !== "gen.khung/ma-no-canh", "alias asset afi.khung → gen.khung");
const oldCh = m.saveAssetChecked({ id: "cu-afi", name: "Cũ", look: { eyes: "round", brows: "normal", parts: { hat: "afi.khung/khoi-mu", outfit: "afi.core/than-tran" } } }, "t");
no(oldCh.look.parts.hat !== "gen.khung/khoi-mu" || oldCh.look.parts.outfit !== "gen.core/than-tran", "lưu nhân vật phải chuẩn hoá tên thư viện cũ: " + JSON.stringify(oldCh.look.parts));
no(!/<svg/.test(m.GC.svgString(m.GC.ASSETS["local.my/cu-afi"], "normal")), "nhân vật tham chiếu cũ phải dựng được");
no(m.saveItemChecked({ id: "cu-item", name: "x", type: "weapon", rarity: "rare", equip: { part: "afi.khung/khoi-que-dai" } }, "t").equip.part !== "gen.khung/khoi-que-dai", "item tham chiếu cũ");
const oldB = JSON.parse(JSON.stringify(b).replace(/gen\.(core|khung)/g, "afi.$1")); oldB.project.id = "goi-cu"; oldB.requires = { packs: ["afi.khung"] };
const rOld = m.importProject(oldB, { overwrite: true });
no(rOld.errors.length || rOld.counts.shots !== 4, "gói kiểu cũ (afi.*) phải nhập được: " + JSON.stringify(rOld.errors.slice(0, 2)));
// hồi quy review v0.12: mọi lối tra cứu / đọc / xuất đều chuẩn hoá tên cũ
no(!m.findAsset("afi.khung/ma-no-canh") || m.findAsset("afi.khung/ma-no-canh").key !== "gen.khung/ma-no-canh", "findAsset nhận tên cũ");
const ob = { format: "gen-chibi.project/1", project: { id: "goi-cu-cast" }, works: [{ id: "phim-cu-cast", title: "x", shots: [{ id: "c1", scene: "afi.khung/san-khau-chuan", cast: ["afi.khung/ma-no-canh"], event: { title: "x", steps: [{ actor: "ma-no-canh", state: "vow", spot: "center", say: "A" }] } }] }] };
const rOc = m.importProject(ob, {});
no(rOc.errors.length || rOc.counts.shots !== 1, "gói cũ cast / scene afi.* phải nhập được: " + JSON.stringify(rOc.errors));
const wOc = m.store.getWork("phim-cu-cast").shots[0];
no(wOc.scene !== "gen.khung/san-khau-chuan" || wOc.cast[0] !== "gen.khung/ma-no-canh", "phân cảnh nhập phải lưu tên mới: " + JSON.stringify(wOc));
m.store.saveProject({ id: "goi-cu-2", name: "Cũ 2" });
m.store.saveWork({ id: "phim-cu", title: "Phim cũ", project: "goi-cu-2", shots: [{ id: "c1", title: "Cũ", scene: "afi.khung/san-khau-chuan", cast: ["afi.khung/ma-no-canh"], event: { title: "x", scene: "afi.khung/san-khau-chuan", steps: [{ actor: "ma-no-canh", state: "vow", spot: "center", say: "A" }] } }] });
no(JSON.stringify(m.workView(m.store.getWork("phim-cu"))).includes("afi."), "workView phải trả tên mới");
m.saveShotChecked({ work: "phim-cu", shot: { id: "c1", title: "Mới" } });
const wC = m.store.getWork("phim-cu").shots[0];
no(wC.title !== "Mới" || wC.scene !== "gen.khung/san-khau-chuan" || wC.cast[0] !== "gen.khung/ma-no-canh" || !wC.event || wC.event.scene !== "gen.khung/san-khau-chuan", "sửa phân cảnh cũ: giữ cảnh / diễn viên / lời thoại, lưu tên mới: " + JSON.stringify(wC));
m.store.saveAsset("local.my/nv-cu", { name: "NV cũ", project: "goi-cu-2", look: { eyes: "round", brows: "normal", parts: { hat: "afi.khung/khoi-mu" } } }, "giả lập bản ghi trước v0.12");
const eOld = m.exportProject("goi-cu-2");
no(eOld.characters.find(a => a.id === "nv-cu").look.parts.hat !== "gen.khung/khoi-mu" || JSON.stringify(eOld).includes("afi.") || JSON.stringify(eOld.requires.packs) !== JSON.stringify(["gen.khung"]), "xuất gói từ bản ghi cũ: tên mới + requires đủ: " + JSON.stringify(eOld.requires));
m.store.saveAsset("afi.khung/ban-cu", { name: "Bản chỉnh khung cũ", look: { eyes: "round", brows: "normal", parts: {} } }, "giả lập dữ liệu trước v0.11");
m.sync();
no(!m.GC.ASSETS["local.my/ban-cu"] || m.GC.ASSETS["gen.khung/ban-cu"], "bản ghi cũ trong pack khung phải nạp thành bản sao Của tôi, không vào khung");
// khung không bao giờ bị sửa, kể cả đường Studio (allowAnyPack)
const fr = m.saveAssetChecked({ pack: "gen.khung", id: "ma-no-canh", name: "Sửa khung", look: { eyes: "round", brows: "normal", parts: {} } }, "t", { allowAnyPack: true });
no(fr.pack !== "local.my" || m.GC.ASSETS["gen.khung/ma-no-canh"].name !== "Ma-nơ-canh", "lưu vào khung phải thành bản sao trong Của tôi, khung giữ nguyên");
console.log("   ✓ dự án mẫu qua cổng 100% (3 nhân vật · 1 item · 2 cảnh · phim 4 cảnh) · nhập trùng → 409 · lưu đè · xuất lại đủ · gói hỏng / asset lạ bị chặn");
' || exit 1
echo "3) MCP"
H="$(mktemp -d)"; PORT=7495
(echo > /dev/tcp/127.0.0.1/$PORT) 2>/dev/null && { echo "Cổng $PORT đang bị chiếm"; exit 1; }
GC_HOME="$H" GC_PORT=$PORT GC_NO_AUTOCHECK=1 node server/main.js > "$H/s.log" 2>&1 & SP=$!
trap 'kill $SP 2>/dev/null || true; rm -rf "$H"' EXIT
for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"ci","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-test","name":"CI","look":{"eyes":"round","brows":"normal","parts":{"hat":"khoi-mu"}},"identity":{"must":["hat:khoi-mu"]}}}}}' \
 '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-bad","name":"Bad","look":{"eyes":"round","brows":"normal","parts":{"hat":"ufo"}},"identity":{"must":["hat:ufo"]}}}}}' \
 '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_part_spec","arguments":{"slot":"hat"}}}' \
 '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"preview_part","arguments":{"part":{"id":"ci-hat","slot":"hat","label":"Mũ CI","layers":{"hat":"<path d=\"M50,80 L100,30 L150,80 Z\" fill=\"{hat}\" stroke=\"{ink}\" stroke-width=\"2.8\"/>"},"views":{"q45":"same"}}}}}' \
 '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"preview_part","arguments":{"part":{"id":"ci-evil","slot":"hat","layers":{"hat":"<path d=\"M0,0\" onload=\"alert(1)\"/>"},"views":{"q45":"same"}}}}}' \
 '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"save_part","arguments":{"part":{"id":"ci-hat","slot":"hat","label":"Mũ CI","layers":{"hat":"<path d=\"M50,80 L100,30 L150,80 Z\" fill=\"{hat}\" stroke=\"{ink}\" stroke-width=\"2.8\"/>"},"views":{"q45":"same"}}}}}' \
 '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-mix","name":"Phối","look":{"eyes":"round","brows":"normal","parts":{"hat":"local.my/ci-hat"}},"identity":{"must":["hat:ci-hat"]}}}}}' \
 '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"render_character","arguments":{"key":"ci-mix","view":"left45","activity":"run"}}}' \
 '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"save_item","arguments":{"item":{"id":"ci-dao","name":"Đao CI","type":"weapon","rarity":"epic","equip":{"part":"khoi-que-dai","palette":{"metal":"#ffcc00"}},"stats":{"atk":77}}}}}' \
 '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"render_item","arguments":{"key":"ci-dao","mode":"card"}}}' \
 '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-equip","name":"Mặc đồ","look":{"eyes":"round","brows":"normal","parts":{},"equip":{"heldR":"local.my/ci-dao"}}}}}}' \
 '{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"render_item","arguments":{"key":"ci-dao","mode":"equipped","character":"ci-equip","view":"left45","activity":"attack"}}}' \
 '{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"save_item","arguments":{"item":{"id":"ci-dao","name":"Đổi bộ phận","type":"helmet","rarity":"common","equip":{"part":"local.my/ci-hat"}}}}}' \
 '{"jsonrpc":"2.0","id":16,"method":"tools/call","params":{"name":"render_item","arguments":{"item":{"id":"ci-nhap","name":"Nháp","type":"weapon","rarity":"rare","equip":{"part":"khoi-que-dai","palette":{"metal":"#12ab34"}}},"mode":"equipped","character":"ci-equip"}}}' \
 '{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"list_items","arguments":{}}}' \
 '{"jsonrpc":"2.0","id":18,"method":"tools/call","params":{"name":"get_part_spec","arguments":{"slot":"deco"}}}' \
 '{"jsonrpc":"2.0","id":19,"method":"tools/call","params":{"name":"preview_part","arguments":{"part":{"id":"ci-den","slot":"deco","label":"Đèn CI","svg":"<rect x=\"-8\" y=\"-40\" width=\"16\" height=\"40\" fill=\"{stone}\"/>"}}}}' \
 '{"jsonrpc":"2.0","id":20,"method":"tools/call","params":{"name":"save_part","arguments":{"part":{"id":"ci-den","slot":"deco","label":"Đèn CI","svg":"<rect x=\"-8\" y=\"-40\" width=\"16\" height=\"40\" fill=\"{stone}\"/>"}}}}' \
 '{"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"save_scene","arguments":{"scene":{"id":"ci-canh","name":"Cảnh CI","layers":{"sky":"khung-troi","ground":"khung-nen"},"deco":[{"part":"local.my/ci-den","x":200}],"time":"night","weather":"rain"}}}}' \
 '{"jsonrpc":"2.0","id":22,"method":"tools/call","params":{"name":"render_scene","arguments":{"key":"ci-canh","cast":[{"character":"ci-equip","spot":"left","activity":"attack"},{"character":"ma-no-canh","spot":"right"}]}}}' \
 '{"jsonrpc":"2.0","id":23,"method":"tools/call","params":{"name":"save_scene","arguments":{"scene":{"id":"san-khau-chuan","name":"Đè","layers":{"sky":"khung-troi","ground":"khung-nen"}}}}}' \
 '{"jsonrpc":"2.0","id":24,"method":"tools/call","params":{"name":"validate_event","arguments":{"event":{"title":"CI","scene":"local.my/ci-canh","steps":[{"actor":"ma-no-canh","state":"normal","spot":"left","say":"Mưa rồi"}]}}}}' \
 '{"jsonrpc":"2.0","id":26,"method":"tools/call","params":{"name":"render_scene","arguments":{"key":"gen.khung/san-khau-chuan","time":"bogus"}}}' \
 '{"jsonrpc":"2.0","id":25,"method":"tools/call","params":{"name":"render_scene","arguments":{"scene":{"id":"ci-nhap","layers":{"sky":"khung-troi","ground":"khung-nen"}},"cast":[{"character":"ma-no-canh","spot":"san-khau"}]}}}' \
 '{"jsonrpc":"2.0","id":27,"method":"tools/call","params":{"name":"save_project","arguments":{"id":"ci-chu-de","name":"Chủ đề CI","description":"dự án thử"}}}' \
 '{"jsonrpc":"2.0","id":28,"method":"tools/call","params":{"name":"save_item","arguments":{"item":{"id":"ci-proj","name":"Que dự án","type":"weapon","rarity":"rare","project":"ci-chu-de","equip":{"part":"khoi-que-dai"}}}}}' \
 '{"jsonrpc":"2.0","id":29,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-proj-nv","name":"NV dự án","project":"ci-chu-de","look":{"eyes":"round","brows":"normal","parts":{}}}}}}' \
 '{"jsonrpc":"2.0","id":30,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}' \
 '{"jsonrpc":"2.0","id":31,"method":"tools/call","params":{"name":"save_project","arguments":{"id":"Sai Id","name":"x"}}}' \
 '{"jsonrpc":"2.0","id":32,"method":"tools/call","params":{"name":"save_item","arguments":{"item":{"id":"ci-proj2","name":"x","type":"weapon","rarity":"rare","project":"../x","equip":{"part":"khoi-que-dai"}}}}}' \
 '{"jsonrpc":"2.0","id":33,"method":"tools/call","params":{"name":"save_work","arguments":{"title":"Phim MCP","project":"ci-chu-de","logline":"thử"}}}' \
 '{"jsonrpc":"2.0","id":34,"method":"tools/call","params":{"name":"save_shot","arguments":{"work":"phim-mcp","shot":{"title":"Mở đầu","scene":"gen.khung/san-khau-chuan","cast":["ma-no-canh"],"event":{"title":"Mở","steps":[{"actor":"ma-no-canh","state":"vow","spot":"center","say":"Bắt đầu!"}]}}}}}' \
 '{"jsonrpc":"2.0","id":35,"method":"tools/call","params":{"name":"save_shot","arguments":{"work":"phim-mcp","shot":{"title":"Lạ","scene":"gen.khung/khong-co","cast":["ai-do"]}}}}' \
 '{"jsonrpc":"2.0","id":36,"method":"tools/call","params":{"name":"get_work","arguments":{"id":"phim-mcp"}}}' \
 '{"jsonrpc":"2.0","id":37,"method":"tools/call","params":{"name":"export_project","arguments":{"id":"ci-chu-de"}}}' \
 '{"jsonrpc":"2.0","id":38,"method":"tools/call","params":{"name":"import_project","arguments":{"bundle":{"format":"gen-chibi.project/1","project":{"id":"ci-chu-de"},"items":[{"id":"ci-proj","name":"x","type":"weapon","rarity":"rare","equip":{"part":"gen.khung/khoi-que-dai"}}]}}}}' \
 '{"jsonrpc":"2.0","id":39,"method":"tools/call","params":{"name":"export_project","arguments":{"id":"ci-chu-de","sale":true}}}' \
 | GC_PORT=$PORT node server/mcp-stdio.js > "$H/mcp.out"
node -e '
const L = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map(JSON.parse);
const by = id => L.find(r => r.id === id);
const ok = (c, m) => { if (!c) { console.log("   ✗", m); process.exit(1); } };
ok(by(1).result.protocolVersion === "2025-06-18", "bắt tay");
ok(by(2).result.tools.length === 31, "31 tool");
ok(!by(3).result.isError && JSON.parse(by(3).result.content[0].text).saved, "lưu nhân vật hợp lệ");
ok(by(4).result.isError, "chặn linh kiện lạ");
console.log("   ✓ MCP: bắt tay, 31 tool, lưu hợp lệ, chặn linh kiện lạ");
const spec = JSON.parse(by(5).result.content[0].text);
ok(spec.slots[0].slot === "hat" && spec.example && spec.views.q45, "get_part_spec có khung + ví dụ");
ok(!by(6).result.isError && /<svg/.test(by(6).result.content[1].resource.text), "preview_part trả bàn soát SVG");
ok(by(7).result.isError && /onload/.test(by(7).result.content[0].text), "preview_part chặn SVG độc");
ok(JSON.parse(by(8).result.content[0].text).saved, "save_part lưu linh kiện");
ok(!by(9).result.isError, "phối nhân vật bằng linh kiện mới");
ok(!by(10).result.isError && /<svg/.test(by(10).result.content[1].resource.text), "dựng nhân vật dùng linh kiện mới ở 45° + chạy");
console.log("   ✓ MCP tạo linh kiện: chuẩn → soát → chặn SVG độc → lưu → phối nhân vật → dựng 45°");
ok(JSON.parse(by(11).result.content[0].text).saved, "save_item");
ok(/Đao CI/.test(by(12).result.content[1].resource.text), "render_item card");
ok(!by(13).result.isError, "nhân vật mặc item của tôi");
ok(!by(14).result.isError && /<svg/.test(by(14).result.content[1].resource.text), "render_item equipped 45° + tấn công");
console.log("   ✓ MCP item: lưu → thẻ → nhân vật mặc → dựng 45° tấn công");
ok(by(15).result.isError && /bộ phận/.test(by(15).result.content[0].text), "chặn đổi bộ phận của item đã lưu");
ok(!by(16).result.isError && /12ab34/i.test(by(16).result.content[1].resource.text), "render_item equipped với item nháp phải mặc thử được");
ok(!/ci-nhap/.test(JSON.stringify(by(17).result)), "item nháp không được lưu lại sau khi dựng");
console.log("   ✓ MCP item: chặn đổi bộ phận · mặc thử item nháp không để lại dấu");
const ss = JSON.parse(by(18).result.content[0].text);
ok(ss.kind === "scenery" && ss.scenery.example && ss.scenery.canvas.width === 640, "get_part_spec phông có khung 640×360 + ví dụ");
ok(!by(19).result.isError && /<svg/.test(by(19).result.content[1].resource.text), "preview_part phông trả bàn soát cảnh");
ok(JSON.parse(by(20).result.content[0].text).saved, "save_part lưu phông");
ok(JSON.parse(by(21).result.content[0].text).saved, "save_scene phối phông tự tạo");
ok(!by(22).result.isError && /<svg/.test(by(22).result.content[1].resource.text), "render_scene có dàn diễn viên (nhân vật mặc item của tôi)");
ok(by(23).result.isError && /chính thức/.test(by(23).result.content[0].text), "không ghi đè cảnh chính thức");
ok(JSON.parse(by(24).result.content[0].text).ok, "kịch bản đặt vào cảnh của tôi");
ok(by(25).result.isError && /chỗ đứng/.test(by(25).result.content[0].text), "render_scene chặn chỗ đứng lạ");
ok(by(26).result && by(26).result.isError && /time: chọn/.test(by(26).result.content[0].text), "render_scene giờ lạ phải báo lỗi rõ");
const pj = JSON.parse(by(30).result.content[0].text).find(p => p.id === "ci-chu-de");
ok(pj && pj.name === "Chủ đề CI" && pj.items === 1 && pj.characters === 1, "list_projects đếm asset theo dự án: " + JSON.stringify(pj));
ok(by(31).result.isError, "chặn id dự án sai");
ok(by(32).result.isError && /project/.test(by(32).result.content[0].text), "chặn project không phải slug");
ok(JSON.parse(by(33).result.content[0].text).saved, "save_work tạo tác phẩm");
ok(JSON.parse(by(34).result.content[0].text).hasEvent, "save_shot: phân cảnh có bối cảnh + diễn viên + lời thoại");
ok(by(35).result.isError && /khong-co/.test(by(35).result.content[0].text) && /ai-do/.test(by(35).result.content[0].text), "save_shot chặn bối cảnh / diễn viên không có trong Thư viện");
const gw = JSON.parse(by(36).result.content[0].text);
ok(gw.shots.length === 1 && gw.shots[0].event.scene === "gen.khung/san-khau-chuan" && gw.project === "ci-chu-de", "get_work trả tác phẩm đủ phân cảnh");
const exb = JSON.parse(by(37).result.content[0].text);
ok(exb.format === "gen-chibi.project/1" && exb.items.some(i => i.id === "ci-proj") && exb.works.some(w => w.id === "phim-mcp"), "export_project đủ item + tác phẩm");
ok(by(38).result.isError && /ci-proj/.test(by(38).result.content[0].text), "import_project báo trùng thay vì ghi đè lặng lẽ");
const sb = JSON.parse(by(39).result.content[0].text);
ok(exb.kind === "backup" && sb.kind === "sale" && !sb.items.length && !sb.characters.length && !sb.works.length, "export_project sale: chỉ asset phát hành (ở đây toàn nháp → rỗng), không tác phẩm");
console.log("   ✓ MCP gói dự án: export_project đủ · gói bán chỉ asset phát hành · import_project báo trùng");
console.log("   ✓ MCP tác phẩm: save_work → save_shot (lời thoại qua cổng đạo diễn) → get_work; chặn asset không có");
console.log("   ✓ MCP dự án chủ đề: tạo → lưu item / nhân vật vào dự án → đếm; chặn id lạ");
console.log("   ✓ MCP cảnh: chuẩn phông → soát → lưu phông → phối cảnh → dựng có diễn viên → kịch bản trong cảnh; chặn đè chính thức");
' "$H/mcp.out"
kill $SP 2>/dev/null || true

echo "3b) AI trong chatroom (LLM API) đi đúng cổng nhà xưởng"
node tools/test-agent.mjs || exit 1

echo "4) khoá truy cập"
bash tools/test-auth.sh || exit 1

echo "5) tự cập nhật"
bash tools/test-update.sh
echo "4b) token GitHub (repo private)"
node tools/test-token.js
