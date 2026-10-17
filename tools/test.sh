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
 | GC_PORT=$PORT node server/mcp-stdio.js > "$H/mcp.out"
node -e '
const L = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map(JSON.parse);
const by = id => L.find(r => r.id === id);
const ok = (c, m) => { if (!c) { console.log("   ✗", m); process.exit(1); } };
ok(by(1).result.protocolVersion === "2025-06-18", "bắt tay");
ok(by(2).result.tools.length === 12, "12 tool");
ok(!by(3).result.isError && JSON.parse(by(3).result.content[0].text).saved, "lưu nhân vật hợp lệ");
ok(by(4).result.isError, "chặn linh kiện lạ");
console.log("   ✓ MCP: bắt tay, 12 tool, lưu hợp lệ, chặn linh kiện lạ");
' "$H/mcp.out"
kill $SP 2>/dev/null || true

echo "4) khoá truy cập"
bash tools/test-auth.sh || exit 1

echo "5) tự cập nhật"
bash tools/test-update.sh
