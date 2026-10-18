#!/usr/bin/env bash
# Bộ kiểm thử chạy trong CI và trước mỗi lần phát hành.
#   1) cú pháp mọi tệp JS + script bash
#   2) cổng kiểm của mọi nhân vật trong thư viện chính thức (chạy engine trong Node)
#   3) MCP: bắt tay, danh sách tool, tạo nhân vật, chặn linh kiện lạ
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
  acts.forEach(id => [0, 0.21, 0.5].forEach(t => ["left", "right"].forEach(f => ["front", "left", "right", "left45", "right45"].forEach(v => {
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
// 45° vẽ thật ở mức linh kiện: bộ của Gia Cát Lượng phủ đủ; nhân vật khác vẫn dựng được (engine trượt phần thiếu)
const gcl = GC.assets().find(a => a.id === "gia-cat-luong");
const cov = GC.gate(gcl).find(x => x.id === "view45");
if (!cov || !/đủ/.test(cov.detail)) { bad++; console.log("   ✗ Gia Cát Lượng chưa đủ bản vẽ 45°:", cov && cov.detail); }
// rào quy trình (docs/QUY-TRINH-LINH-KIEN.md): linh kiện thư viện chính thức phải có bản 45°, license và nguồn
Object.values(GC.LIB.parts).filter(p => GC.PACKS[p.pack].group === "official" && p.id !== "none" && !/^held[LR]$/.test(p.slot)).forEach(p => {
  if (!(p.views && p.views.q45)) { bad++; console.log("   ✗ linh kiện chính thức thiếu bản 45°:", p.pack + "/" + p.slot + ":" + p.id); }
  if (!p.license || !p.source) { bad++; console.log("   ✗ linh kiện thiếu license/nguồn:", p.pack + "/" + p.slot + ":" + p.id); }
});
if (bad) process.exit(1);
console.log("   ✓", acts.length, "hoạt động ×", GC.assets().length, "nhân vật × 3 thời điểm × 2 hướng × 5 góc nhìn; kịch bản có hoạt động được kiểm");
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
const ow = mcp.saveAssetChecked({ pack: "afi.tamquoc", id: "truong-phi", name: "hacked", look: { eyes: "round", brows: "normal", parts: {} } }, "x");
if (ow.pack !== "local.my") { bad++; console.log("   ✗ MCP/AI ghi đè được nhân vật chính thức:", ow.key); }
try { mcp.savePartChecked({ id: "lun-jin", slot: "hat", layers: { hat: "<path d=\"M0,0\"/>" }, views: { q45: "same" } }); bad++; console.log("   ✗ linh kiện trùng id chính thức được lưu"); } catch (e) { /* đúng: bị chặn */ }
if (bad) process.exit(1);
console.log("   ✓", Object.keys(attacks).length, "kiểu tấn công bị chặn; SVG hợp lệ qua; 45° bắt buộc; lớp sân khấu bị cấm");
console.log("   ✓ hồi quy bảo mật: không ReDoS, không tra prototype, không attr trùng, MCP/AI không ghi đè thư viện chính thức, không che id chính thức");
'

echo "2c) item trang bị (loại asset thứ hai)"
node -e '
const { loadEngine } = require("./server/engine-node"); const GC = loadEngine(process.cwd());
let bad = 0; const no = (c, m) => { if (c) { bad++; console.log("   ✗", m); } };
GC.items().forEach(i => GC.itemGate(i).forEach(g => no(!g.ok, i.key + ": " + g.label + " " + g.detail)));
const B = { id: "item-mau", name: "X", type: "weapon", rarity: "rare", equip: { part: "afi.tamquoc/guandao" } };
const err = d => GC.checkItem(Object.assign({}, B, d)).errors.length;
no(err({}), "item mẫu phải hợp lệ (nếu không, các phép chặn dưới đây vô nghĩa): " + GC.checkItem(B).errors.join("; "));
no(!err({ type: "boots" }), "loại không khớp linh kiện vẫn qua");
no(!err({ equip: { part: "khong-co" } }), "linh kiện lạ vẫn qua");
no(!err({ equip: { part: "afi.tamquoc/guandao", palette: { metal: "red; x" } } }), "màu không phải hex vẫn qua");
no(!err({ equip: { part: "afi.tamquoc/guandao", palette: { constructor: "#fff" } } }), "token màu prototype vẫn qua");
no(!err({ stats: { atk: 5000 } }), "chỉ số ngoài 0–999 vẫn qua");
no(!err({ rarity: "mythic" }), "độ hiếm lạ vẫn qua");
const card = GC.itemSvg(Object.assign({ key: "t" }, GC.checkItem(Object.assign({}, B, { name: "<script>alert(1)</script>" })).def), { mode: "card" });
no(/<script/.test(card), "tên item không được escape trong thẻ");
const qv = JSON.parse(JSON.stringify(GC.ASSETS["afi.tamquoc/quan-vu"])); qv.key = "t/qv"; qv.look.equip = { heldR: "afi.items/dao-sat", outfit: "afi.items/giap-bac", back: "afi.items/ao-choang-do" };
no(GC.blockingGates(GC.gate(qv, { poses: true }), "review").length, "nhân vật mặc trang bị không qua cổng");
no(GC.partRef(qv, "heldR") !== "afi.tamquoc/guandao", "trang bị không thay linh kiện");
qv.look.equip = { heldR: "afi.items/giap-bac" };
no(!GC.gate(qv).find(g => g.id === "parts" && !g.ok), "mặc item sai bộ phận vẫn qua");
if (bad) process.exit(1);
// hồi quy v0.4.1: part không phải chuỗi, ký tự điều khiển, item lệch bộ phận không làm vỡ nhân vật
let thrown = null; try { GC.checkItem(Object.assign({}, B, { equip: { part: { x: 1 } } })); GC.checkItem(Object.assign({}, B, { equip: { part: 7 } })); } catch (e) { thrown = e; }
no(thrown, "equip.part không phải chuỗi làm checkItem ném lỗi: " + (thrown && thrown.message));
no(err({ equip: { part: 7 } }) === 0, "equip.part là số vẫn qua");
const cc = GC.checkItem(Object.assign({}, B, { name: "A\u0000B\u001f", description: "x\u0007y" })).def;
no(/[\u0000-\u001f]/.test(cc.name + cc.description), "ký tự điều khiển lọt vào item");
qv.look.equip = { hat: "afi.items/dao-sat" };
let vo = null; try { GC.svgString(qv, "normal"); } catch (e) { vo = e; }
no(vo, "item lệch bộ phận làm vỡ nhân vật: " + (vo && vo.message));
console.log("   ✓", GC.items().length, "item chính thức đạt cổng; chặn loại/linh kiện/màu/chỉ số/độ hiếm sai; thẻ escape chữ; nhân vật mặc trang bị đạt cổng");
'

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
 '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-test","name":"CI","look":{"eyes":"round","brows":"normal","parts":{"hat":"warrior-band"}},"identity":{"must":["hat:warrior-band"]}}}}}' \
 '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-bad","name":"Bad","look":{"eyes":"round","brows":"normal","parts":{"hat":"ufo"}},"identity":{"must":["hat:ufo"]}}}}}' \
 '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_part_spec","arguments":{"slot":"hat"}}}' \
 '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"preview_part","arguments":{"part":{"id":"ci-hat","slot":"hat","label":"Mũ CI","layers":{"hat":"<path d=\"M50,80 L100,30 L150,80 Z\" fill=\"{hat}\" stroke=\"{ink}\" stroke-width=\"2.8\"/>"},"views":{"q45":"same"}}}}}' \
 '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"preview_part","arguments":{"part":{"id":"ci-evil","slot":"hat","layers":{"hat":"<path d=\"M0,0\" onload=\"alert(1)\"/>"},"views":{"q45":"same"}}}}}' \
 '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"save_part","arguments":{"part":{"id":"ci-hat","slot":"hat","label":"Mũ CI","layers":{"hat":"<path d=\"M50,80 L100,30 L150,80 Z\" fill=\"{hat}\" stroke=\"{ink}\" stroke-width=\"2.8\"/>"},"views":{"q45":"same"}}}}}' \
 '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-mix","name":"Phối","look":{"eyes":"round","brows":"normal","parts":{"hat":"local.my/ci-hat"}},"identity":{"must":["hat:ci-hat"]}}}}}' \
 '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"render_character","arguments":{"key":"ci-mix","view":"left45","activity":"run"}}}' \
 '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"save_item","arguments":{"item":{"id":"ci-dao","name":"Đao CI","type":"weapon","rarity":"epic","equip":{"part":"guandao","palette":{"metal":"#ffcc00"}},"stats":{"atk":77}}}}}' \
 '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"render_item","arguments":{"key":"ci-dao","mode":"card"}}}' \
 '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"save_character","arguments":{"asset":{"id":"ci-equip","name":"Mặc đồ","look":{"eyes":"round","brows":"normal","parts":{},"equip":{"heldR":"local.my/ci-dao"}}}}}}' \
 '{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"render_item","arguments":{"key":"ci-dao","mode":"equipped","character":"ci-equip","view":"left45","activity":"attack"}}}' \
 '{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"save_item","arguments":{"item":{"id":"ci-dao","name":"Đổi bộ phận","type":"helmet","rarity":"common","equip":{"part":"local.my/ci-hat"}}}}}' \
 '{"jsonrpc":"2.0","id":16,"method":"tools/call","params":{"name":"render_item","arguments":{"item":{"id":"ci-nhap","name":"Nháp","type":"weapon","rarity":"rare","equip":{"part":"guandao","palette":{"metal":"#12ab34"}}},"mode":"equipped","character":"ci-equip"}}}' \
 '{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"list_items","arguments":{}}}' \
 | GC_PORT=$PORT node server/mcp-stdio.js > "$H/mcp.out"
node -e '
const L = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map(JSON.parse);
const by = id => L.find(r => r.id === id);
const ok = (c, m) => { if (!c) { console.log("   ✗", m); process.exit(1); } };
ok(by(1).result.protocolVersion === "2025-06-18", "bắt tay");
ok(by(2).result.tools.length === 19, "19 tool");
ok(!by(3).result.isError && JSON.parse(by(3).result.content[0].text).saved, "lưu nhân vật hợp lệ");
ok(by(4).result.isError, "chặn linh kiện lạ");
console.log("   ✓ MCP: bắt tay, 19 tool, lưu hợp lệ, chặn linh kiện lạ");
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
' "$H/mcp.out"
kill $SP 2>/dev/null || true

echo "3b) AI trong chatroom (LLM API) đi đúng cổng nhà xưởng"
node tools/test-agent.mjs || exit 1

echo "4) khoá truy cập"
bash tools/test-auth.sh || exit 1

echo "5) tự cập nhật"
bash tools/test-update.sh
