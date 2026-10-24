#!/usr/bin/env bash
# Kiểm thử end-to-end cơ chế tự cập nhật (không cần Docker):
#   1) cập nhật v0.1.0 → v0.1.1 thành công
#   2) gói sai checksum → từ chối, vẫn chạy bản cũ
#   3) bản v0.1.2 hỏng (server chết) → launcher tự rollback về v0.1.1
#   4) rollback thủ công (xác nhận 2 bước)
#   5) agent tự kiểm và cập nhật qua MCP (get_app_version, update_app)
#   7) bản mới mang launcher MỚI, chạy native (không ai canh): launcher tự thay mình, tự chạy lại, trao tệp pid (CNS-171)
#   8) edge (v0.21): launcher giám sát cloudflared GIẢ (tools/fixtures/fake-cloudflared.js) theo run/edge-intent.json — schema đóng,
#      không tải khi tắt, quick / token (quyền 0600, không lộ token), SHA sai → không chạy, sức khoẻ cập nhật gồm edge,
#      hợp đồng launcher (không tự thay bằng launcher cũ hơn), không tự rollback xuống bản không có edge khi online, rollback tay cảnh báo, dừng sạch
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; FEED="$W/feed"; HOME_DIR="$W/home"; PORT=7499; FPORT=7498
IPORT=$((PORT+2)); MPORT=$((PORT+4)); XPID=""   # cổng nghe riêng cho cloudflared · /ready của cloudflared (launcher.js)
trap 'kill $LPID $FPID $XPID $(cat "$HOME_DIR/logs/launcher.pid" 2>/dev/null) 2>/dev/null || true; sleep 1; [ -n "${KEEP:-}" ] || rm -rf "$W"' EXIT
mkdir -p "$FEED" "$HOME_DIR/releases"
pass=0; failn=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; failn=$((failn+1)); }

build() { # build <ver> [broken]
  local src="$W/src-$1"; rm -rf "$src"; cp -R "$ROOT" "$src"; rm -rf "$src/.git" "$src/dist"
  echo "$1" > "$src/VERSION"
  if [ "${2:-}" = broken ]; then echo 'throw new Error("bản hỏng cố ý");' > "$src/server/main.js"; fi
  if [ "${2:-}" = newlauncher ]; then printf '\n// launcher của bản thử %s\n' "$1" >> "$src/launcher.js"; fi   # launcher khác bản đang chạy → nhánh tự thay launcher
  # bản "không có edge" (như ≤ v0.20): launcher đi kèm có hợp đồng thấp hơn
  if [ "${2:-}" = noedge ]; then sed -e 's/^const LAUNCHER_ABI = [0-9]*;/const LAUNCHER_ABI = 1;/' "$src/launcher.js" > "$src/launcher.js.tmp" && mv "$src/launcher.js.tmp" "$src/launcher.js"; fi
  bash "$src/tools/package.sh" "$FEED/$1" >/dev/null
}
feed() { # feed <ver> [badsum]
  local d="$FEED/$1"
  # làm hỏng checksum: LUÔN đổi ký tự đầu sang ký tự khác (thay cứng bằng "0" là no-op khi hash vốn bắt đầu bằng 0 → trượt 1/16 lần)
  if [ "${2:-}" = badsum ]; then
    local s; s="$(cat "$d/SHA256SUMS")"; local c="${s:0:1}" r=0; [ "$c" = 0 ] && r=1
    printf '%s%s\n' "$r" "${s:1}" > "$d/SHA256SUMS"
    [ "$(head -c1 "$d/SHA256SUMS")" != "$c" ] || { echo "  ✗ không làm hỏng được SHA256SUMS"; exit 1; }
  fi
  cat > "$FEED/latest.json" <<JSON
{"tag_name":"v$1","body":"Ghi chú v$1","published_at":"2026-10-17T00:00:00Z","assets":[
 {"name":"gen-chibi-v$1.tar.gz","browser_download_url":"http://127.0.0.1:$FPORT/$1/gen-chibi-v$1.tar.gz"},
 {"name":"SHA256SUMS","browser_download_url":"http://127.0.0.1:$FPORT/$1/SHA256SUMS"}]}
JSON
}
# X-GC-Lang: vi — các kiểm dưới so câu tiếng Việt (msgid) như Studio ở chế độ vi; bản tiếng Anh mặc định kiểm ở tools/test-i18n-server.mjs (ADR 0007)
# v0.21: server tự sinh data/owner-token (không đặt GC_API_TOKEN) — harness gắn token chủ qua stdin của curl (-K -), như CLI; không nới luật truy cập
own() { printf 'header = "Authorization: Bearer %s"\n' "$(tr -d ' \n' < "$HOME_DIR/data/owner-token" 2>/dev/null)"; }
api() { own | curl -s -K - -X "$1" -H 'X-GC-Request: 1' -H 'X-GC-Lang: vi' -H 'Content-Type: application/json' ${3:+-d "$3"} "http://127.0.0.1:$PORT$2"; }
ver() { curl -s "http://127.0.0.1:$PORT/api/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch{console.log("down")}})'; }
waitver() { for i in $(seq 1 40); do [ "$(ver)" = "$1" ] && return 0; sleep 0.5; done; return 1; }

for p in $PORT $FPORT $IPORT $MPORT; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && { echo "Cổng $p đang bị tiến trình khác chiếm — dừng nó rồi chạy lại."; exit 1; }; done
echo "Dựng các bản thử…"
build 0.1.0; build 0.1.1; build 0.1.2 broken
# cloudflared giả, phục vụ như asset tải về; launcher chỉ nhận nó khi GC_TEST=1 + đúng SHA (GC_TEST_CF_*)
mkdir -p "$FEED/cf"; cp "$ROOT/tools/fixtures/fake-cloudflared.js" "$FEED/cf/cloudflared"; cp "$FEED/cf/cloudflared" "$W/cf.good"
sha() { node -e 'console.log(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"; }
CFSHA="$(sha "$FEED/cf/cloudflared")"
python3 -m http.server $FPORT --directory "$FEED" >/dev/null 2>&1 & FPID=$!
# cài v0.1.0 như install.sh làm
mkdir -p "$HOME_DIR/releases/v0.1.0"
tar -xzf "$FEED/0.1.0/gen-chibi-v0.1.0.tar.gz" -C "$HOME_DIR/releases/v0.1.0" --strip-components=1
ln -s releases/v0.1.0 "$HOME_DIR/current"; cp "$HOME_DIR/current/launcher.js" "$HOME_DIR/launcher.js"
GC_HOME="$HOME_DIR" GC_PORT=$PORT GC_FEED_URL="http://127.0.0.1:$FPORT/latest.json" GC_NO_AUTOCHECK=1 GC_HEALTH_WINDOW_MS=6000 \
  GC_TEST=1 GC_TEST_CF_URL="http://127.0.0.1:$FPORT/cf/cloudflared" GC_TEST_CF_SHA256="$CFSHA" GC_EDGE_HEALTH_WINDOW_MS=8000 \
  node "$HOME_DIR/launcher.js" > "$W/launcher.log" 2>&1 & LPID=$!
waitver 0.1.0 && ok "cài v0.1.0 chạy" || bad "v0.1.0 không chạy"
# người dùng Docker tự thêm service (cổng đăng nhập, Caddy…) vào docker-compose.override.yml — genchibi / update không bao giờ đụng file này (v0.19)
printf 'services:\n  login:\n    image: example/login\n  caddy:\n    image: caddy:2\n' > "$HOME_DIR/docker-compose.override.yml"; cp "$HOME_DIR/docker-compose.override.yml" "$W/override.orig"

echo "1) cập nhật thành công"
feed 0.1.1
api POST /api/update/check | grep -q '"available":true' && ok "phát hiện v0.1.1" || bad "không thấy bản mới"
api POST /api/update/apply >/dev/null
waitver 0.1.1 && ok "đang chạy v0.1.1" || bad "không lên v0.1.1"
sleep 1; api GET /api/update | grep -q '"to": *"v0.1.1"' && ok "lịch sử ghi cập nhật" || bad "thiếu lịch sử"
ls "$HOME_DIR/backups" | grep -q before-v0.1.1 && ok "đã backup dữ liệu trước khi cập nhật" || bad "không có backup"

echo "1b) chống CSRF: Origin hợp lệ qua, nguồn lạ bị chặn kèm lời giải thích (Ryan 2026-10-19: nút cập nhật báo chặn nguồn lạ)"
orig() { own | curl -s -K - -o "$W/orig.out" -w '%{http_code}' -X POST -H 'X-GC-Request: 1' -H 'X-GC-Lang: vi' -H "Origin: $1" ${2:+-H "$2"} "http://127.0.0.1:$PORT/api/update/check"; }
[ "$(orig "http://127.0.0.1:$PORT")" = 200 ] && ok "Origin trùng Host → qua" || bad "Origin trùng Host bị chặn"
[ "$(orig "http://localhost:$PORT")" = 200 ] && ok "localhost ↔ 127.0.0.1 cùng cổng → qua" || bad "localhost bị coi là nguồn lạ"
[ "$(orig "http://[::1]:$PORT")" = 200 ] && ok "[::1] cùng cổng → qua" || bad "[::1] bị coi là nguồn lạ"
[ "$(orig "https://chibi.example" "X-Forwarded-Host: chibi.example")" = 200 ] && ok "proxy báo X-Forwarded-Host trùng Origin → qua" || bad "proxy hợp lệ bị chặn"
[ "$(orig "http://localhost:1$PORT")" = 403 ] && ok "localhost khác cổng → chặn" || bad "khác cổng mà qua"
c="$(orig "https://evil.example")"; [ "$c" = 403 ] && grep -q 'nguồn lạ' "$W/orig.out" && grep -q 'evil.example' "$W/orig.out" && grep -q 'genchibi update' "$W/orig.out" \
  && ok "nguồn lạ → 403 kèm địa chỉ trang + địa chỉ máy chủ + cách khắc phục" || bad "nguồn lạ: $c $(cat "$W/orig.out")"
[ "$(orig "http://[")" = 403 ] && ok "Origin hỏng → 403 (không 500)" || bad "Origin hỏng không ra 403"

echo "2) sai checksum"
feed 0.1.2 badsum
R2=$(api POST /api/update/apply); echo "$R2" | grep -q 'checksum' && ok "từ chối gói sai checksum" || { bad "không chặn checksum"; echo "      phản hồi: $(echo "$R2" | head -c 300)"; }
[ "$(ver)" = 0.1.1 ] && ok "vẫn chạy v0.1.1" || bad "phiên bản đổi sai"

echo "3) bản mới hỏng → tự rollback"
build 0.1.2 broken; feed 0.1.2
api POST /api/update/check >/dev/null; api POST /api/update/apply >/dev/null
sleep 8
waitver 0.1.1 && ok "tự rollback về v0.1.1" || bad "không tự rollback"
api GET /api/update | grep -q '"rolledBack": *true' && ok "lịch sử ghi rollback" || bad "thiếu ghi rollback"

echo "4) rollback thủ công"
api POST /api/update/rollback '{}' | grep -q 'xác nhận' && ok "từ chối khi thiếu xác nhận" || bad "không đòi xác nhận"
api POST /api/update/rollback '{"confirm":"ROLLBACK"}' >/dev/null
waitver 0.1.0 && ok "chạy lại v0.1.0 theo yêu cầu" || bad "rollback thủ công hỏng"

echo "5) agent cập nhật qua MCP"
mcpcall() { own | curl -s -K - -X POST -H 'Content-Type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":${2:-{\}}}}" "http://127.0.0.1:$PORT/mcp"; }
build 0.1.3; feed 0.1.3
mcpcall get_app_version | grep -q 'available\\": true' && ok "get_app_version thấy v0.1.3" || bad "get_app_version không thấy bản mới"
mcpcall update_app | grep -q 'restart\\": true' && ok "update_app nhận lệnh" || bad "update_app không chạy"
waitver 0.1.3 && ok "đang chạy v0.1.3 (do agent yêu cầu)" || bad "không lên v0.1.3"
sleep 7; mcpcall get_app_version '{"check":false}' | grep -q 'current\\": \\"v0.1.3' && ok "get_app_version xác nhận v0.1.3 sau cửa sổ sức khoẻ" || bad "xác nhận sai"
mcpcall rollback_app | grep -q 'ROLLBACK' && ok "rollback_app đòi xác nhận" || bad "rollback_app không đòi xác nhận"

echo "7) bản mới mang launcher mới, chạy native (nohup, không ai canh) — launcher tự thay mình rồi tự chạy lại (CNS-171)"
build 0.1.5 newlauncher; feed 0.1.5
api POST /api/update/check >/dev/null; api POST /api/update/apply >/dev/null
waitver 0.1.5 && ok "lên v0.1.5 sau khi launcher tự thay mình (trước v0.20.1: launcher thoát, bản native tắt hẳn)" || bad "bản native tắt sau khi thay launcher"
NPID="$(cat "$HOME_DIR/logs/launcher.pid" 2>/dev/null || true)"
[ -n "$NPID" ] && [ "$NPID" != "$LPID" ] && kill -0 "$NPID" 2>/dev/null && ok "tệp pid trỏ launcher mới (pid $NPID) — genchibi stop / status vẫn đúng" || bad "tệp pid không trỏ launcher mới đang chạy ($NPID)"
kill -0 "$LPID" 2>/dev/null && bad "launcher cũ còn sống (hai launcher)" || ok "launcher cũ đã thoát — chỉ một launcher"
cmp -s "$HOME_DIR/launcher.js" "$HOME_DIR/current/launcher.js" && ok "launcher.js ở thư mục cài = bản đi kèm v0.1.5" || bad "launcher.js chưa được thay"

echo "6) docker-compose.override.yml: update / rollback / sync_compose không xoá, không ghi đè"
cmp -s "$HOME_DIR/docker-compose.override.yml" "$W/override.orig" && ok "sau cập nhật + rollback tự động + rollback thủ công + agent cập nhật: override còn nguyên từng byte" || bad "docker-compose.override.yml bị đổi / mất sau khi update"
CD="$W/compose"; mkdir -p "$CD/current"; echo "# compose bản mới" > "$CD/current/docker-compose.yml"; echo "# compose bản cũ" > "$CD/docker-compose.yml"; cp "$W/override.orig" "$CD/docker-compose.override.yml"
( cd "$CD"; MODE=docker; eval "$(sed -n '/^sync_compose() {/,/^}/p' "$ROOT/cli/genchibi")"; sync_compose )
cmp -s "$CD/docker-compose.yml" "$CD/current/docker-compose.yml" && ok "sync_compose vẫn chép docker-compose.yml của bản mới (hành vi cũ không đổi)" || bad "sync_compose không chép docker-compose.yml"
cmp -s "$CD/docker-compose.override.yml" "$W/override.orig" && ok "sync_compose không đụng docker-compose.override.yml" || bad "sync_compose làm đổi docker-compose.override.yml"
# v0.23.1: bản override ĐÃ DUYỆT của bản cài ($TI/override.yml + giá trị biến $TI/override.env + hiệu ứng đã duyệt $TI/override.effect) và quyết định chạy không có nó ($TI/override.off), ngoài thư mục cài, là của root — genchibi override approve / off ghi / xoá nó; tệp của chủ thì không bao giờ
grep -n 'override' "$ROOT/cli/genchibi" | grep -vE '^[0-9]+:[[:space:]]*#' | grep -vE '^[0-9]+:    [a-z0-9_]+\) F="' | grep -v '\$TI/override\.\(yml\|env\|off\|effect\)' | grep -q 'rm \|cp \|mv \|>' && bad "cli/genchibi có lệnh ghi / xoá liên quan override" || ok "cli/genchibi không có lệnh nào ghi / xoá docker-compose.override.yml (chỉ bản root đã duyệt ở ~/.local/lib/gen-chibi)"

echo "8) edge: launcher giám sát cloudflared (giả) theo run/edge-intent.json (v0.21, spec §3.1, CNS-170)"
EST="$HOME_DIR/run/edge-status.json"
est() { node -e 'try{const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=s[process.argv[2]];console.log(v===undefined?"":v)}catch{console.log("")}' "$EST" "$1"; }
waitest() { for i in $(seq 1 ${3:-40}); do [ "$(est "$1")" = "$2" ] && return 0; sleep 0.5; done; return 1; }
intent() { mkdir -p "$HOME_DIR/run"; printf '%s' "$1" > "$HOME_DIR/run/edge-intent.json.tmp" && mv "$HOME_DIR/run/edge-intent.json.tmp" "$HOME_DIR/run/edge-intent.json"; }
alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }
nfake() { ps -eo args 2>/dev/null | grep -F "$HOME_DIR/bin/cloudflared-test" | grep -v grep | wc -l | tr -d ' '; }   # số cloudflared giả đang chạy
# cổng nghe riêng cho cloudflared: app tự mở theo run/edge-intent.json; launcher chỉ spawn cloudflared khi cổng đó chứng minh là app con của nó
# (X-GC-Ingress — sửa bảo mật B). Không còn bộ chuyển tiếp giả: nó chính là "tiến trình lạ chiếm cổng" mà launcher phải từ chối (tools/test-ingress.mjs)

echo " 8a) hàm thuần: schema ý định đóng, argv tự dựng, hợp đồng, giải nén .tgz, móc test chỉ khi GC_TEST=1"
U="$W/unit"; mkdir -p "$U/run" "$U/tgz"; printf '#!/bin/sh\necho cf\n' > "$U/tgz/cloudflared"; tar -czf "$U/cf.tgz" -C "$U" tgz/cloudflared
printf 'const LAUNCHER_ABI = 7;\n' > "$U/abi7.js"; printf '// không có hằng\n' > "$U/abi-none.js"
UNIT="$(GC_HOME="$U" GC_PORT=7480 GC_TEST_CF_URL="http://evil/cf" GC_TEST_CF_SHA256=00 node -e '
const fs = require("fs"), zlib = require("zlib"), L = require(process.argv[1]), U = process.argv[2], out = [];
const put = s => { fs.writeFileSync(U + "/run/edge-intent.json", s); const r = L.readIntent(); return r.tunnel + "/" + r.online; };
const cases = [["{\"tunnel\":\"token\"}", "token/true"], ["{\"tunnel\":\"quick\",\"bin\":\"/bin/sh\",\"args\":[\"-c\",\"x\"]}", "quick/true"],
  ["{\"tunnel\":\"/bin/sh\",\"online\":\"yes\"}", "off/false"], ["{\"tunnel\":\"off\",\"online\":true}", "off/true"], ["{oops", "off/false"],
  ["{\"tunnel\":\"quick\",\"pad\":\"" + "x".repeat(5000) + "\"}", "off/false"], ["[\"quick\"]", "off/false"]];
cases.forEach(([s, want]) => { const got = put(s); if (got !== want) out.push("intent " + s.slice(0, 40) + " → " + got + " (cần " + want + ")"); });
const t = L.cfArgs("token", 7484), q = L.cfArgs("quick", 7484);
if (t.join(" ") !== "--no-autoupdate tunnel --config /dev/null --metrics 127.0.0.1:7484 --grace-period 5s --management-diagnostics=false run --token-file " + U + "/run/tunnel.token") out.push("argv token: " + t.join(" "));
if (q.slice(-2).join(" ") !== "--url http://127.0.0.1:7482" || q.indexOf("run") >= 0) out.push("argv quick: " + q.join(" "));
if (L.abiOf(U + "/abi7.js") !== 7 || L.abiOf(U + "/abi-none.js") !== 1 || L.abiOf(U + "/nope.js") !== 0) out.push("abiOf");
const x = L.untarOne(zlib.gunzipSync(fs.readFileSync(U + "/cf.tgz")), "cloudflared");
if (!x || x.toString() !== fs.readFileSync(U + "/tgz/cloudflared", "utf8")) out.push("untarOne");
const p = L.cfPin();   // GC_TEST chưa bật → bỏ qua GC_TEST_CF_*
if (!p || p.version !== L.CF_VERSION || !/^https:\/\/github\.com\/cloudflare\/cloudflared\/releases\/download\//.test(p.url) || !/^[0-9a-f]{64}$/.test(p.sha256)) out.push("cfPin (không GC_TEST): " + JSON.stringify(p));
Object.keys(L.CF_ASSETS).forEach(k => { if (!/^[0-9a-f]{64}$/.test(L.CF_ASSETS[k].sha256)) out.push("thiếu SHA " + k); });
process.env.GC_TEST = "1"; if (L.cfPin().url !== "http://evil/cf") out.push("móc test không bật khi GC_TEST=1");
console.log(out.join("; ") || "ok");' "$HOME_DIR/launcher.js" "$U")"
[ "$UNIT" = ok ] && ok "schema đóng (giá trị lạ / trường lạ / tệp hỏng / quá lớn = off), argv cố định, abiOf, .tgz, móc test chỉ khi GC_TEST=1" || bad "hàm thuần: $UNIT"

echo " 8b) ý định tắt → không tải, không chạy"
ls "$HOME_DIR/bin" 2>/dev/null | grep -q cloudflared && bad "đã tải cloudflared khi chưa bật tunnel" || ok "chưa bật tunnel: không tải cloudflared"
[ "$(est tunnel)" = off ] && [ "$(est running)" = false ] && [ "$(est abi)" = 2 ] && ok "run/edge-status.json: tunnel off, không chạy, abi 2" || bad "edge-status khi tắt: $(cat "$EST" 2>/dev/null | tr -d '\n')"

echo " 8c) quick: tải (kiểm SHA) → chạy → ready → link tạm"
intent '{"tunnel":"quick"}'
waitest ready true 60 && ok "quick: cloudflared giả chạy + /ready → ready" || bad "quick không lên: $(cat "$EST" 2>/dev/null | tr -d '\n')"
[ "$(sha "$HOME_DIR/bin/cloudflared-test" 2>/dev/null)" = "$CFSHA" ] && ok "tải về bin/cloudflared-test, đúng SHA ghim" || bad "bin/cloudflared-test thiếu / sai SHA"
est url | grep -qE '^https://fake-[0-9]+\.trycloudflare\.com$' && ok "edge-status có link tạm: $(est url)" || bad "thiếu link tạm trong edge-status"
RUNF="$HOME_DIR/fake-cf-run.json"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")),a=r.argv.join(" ");
const need=["--no-autoupdate tunnel","--config /dev/null","--url http://127.0.0.1:"+process.argv[3]];
const miss=need.filter(n=>a.indexOf(n)<0), env=r.env.filter(k=>/^(GC_|TUNNEL_)/.test(k)), mp=(/--metrics 127\.0\.0\.1:(\d+)/.exec(a)||[])[1];
if(!mp||+mp===+process.argv[2])miss.push("metrics cổng ngẫu nhiên: "+mp);
if(miss.length||env.length){console.error(miss,env);process.exit(1)}' "$RUNF" $MPORT $IPORT && ok "argv do launcher dựng (--no-autoupdate, metrics 127.0.0.1:<cổng rảnh ngẫu nhiên>, --url 127.0.0.1:$IPORT); env không có GC_* / TUNNEL_* (kể cả GC_INGRESS_NONCE)" || bad "argv / env của cloudflared sai"
grep -q 'started cloudflared test (quick' "$HOME_DIR/logs/tunnel.log" && ok "logs/tunnel.log ghi sự kiện + log của cloudflared" || bad "logs/tunnel.log thiếu"

echo " 8d) token: tệp 0600, không lộ token, đổi token → khởi động lại"
SECRET="eyJhIjoiZ2VuLWNoaWJpLXRlc3QiLCJzIjoiU0VDUkVULVRPS0VOLTQyIn0"
mkdir -p "$HOME_DIR/run"; printf '%s\n' "$SECRET" > "$HOME_DIR/run/tunnel.token"; chmod 644 "$HOME_DIR/run/tunnel.token"
intent '{"tunnel":"token"}'
waitest error token-perms && [ "$(est running)" = false ] && ok "token 0644 → không chạy, error token-perms" || bad "token 0644 vẫn chạy / sai mã lỗi: $(cat "$EST" | tr -d '\n')"
chmod 600 "$HOME_DIR/run/tunnel.token"
waitest ready true 30 && [ "$(est tunnel)" = token ] && ok "chmod 600 → tự chạy lại ở chế độ token" || bad "token 0600 không chạy: $(cat "$EST" | tr -d '\n')"
grep -q -- "run --token-file $HOME_DIR/run/tunnel.token" <(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).argv.join(" "))' "$RUNF") && ok "argv: run --token-file <thư mục cài>/run/tunnel.token" || bad "argv token sai"
leak=""; for f in "$RUNF" "$HOME_DIR/logs/tunnel.log" "$W/launcher.log" "$EST"; do grep -q "$SECRET" "$f" 2>/dev/null && leak="$leak $f"; done
ps -eo args 2>/dev/null | grep -v grep | grep -q "$SECRET" && leak="$leak ps"
[ -z "$leak" ] && ok "token không nằm trong argv / env / log / edge-status / danh sách tiến trình" || bad "lộ token ở:$leak"
P1="$(est pid)"; printf '%s-v2\n' "$SECRET" > "$HOME_DIR/run/tunnel.token"; chmod 600 "$HOME_DIR/run/tunnel.token"
for i in $(seq 1 30); do P2="$(est pid)"; [ -n "$P2" ] && [ "$P2" != "$P1" ] && [ "$(est ready)" = true ] && break; sleep 0.5; done
[ "$P2" != "$P1" ] && ! alive "$P1" && ok "đổi token → cloudflared khởi động lại (pid $P1 → $P2), bản cũ đã dừng" || bad "đổi token không khởi động lại"

echo " 8e) tắt → dừng"
P1="$(est pid)"; intent '{"tunnel":"off"}'
waitest running false && ! alive "$P1" && ok "tunnel off → cloudflared dừng (pid $P1)" || bad "tunnel off mà cloudflared còn chạy"

echo " 8f) SHA sai → không chạy (cả lúc spawn lẫn lúc tải), sửa nguồn → tự tải lại bản sạch"
printf '\n// bị sửa\n' >> "$HOME_DIR/bin/cloudflared-test"; cp "$HOME_DIR/bin/cloudflared-test" "$FEED/cf/cloudflared"; rm -f "$RUNF"
intent '{"tunnel":"quick"}'
waitest error sha-mismatch 30 && sleep 6
[ ! -e "$RUNF" ] && [ "$(est running)" = false ] && [ "$(est error)" = sha-mismatch ] && ok "binary bị sửa (trong bin/ và ở nguồn tải) → KHÔNG chạy, error sha-mismatch" || bad "chạy binary sai SHA / sai trạng thái: $(cat "$EST" | tr -d '\n')"
[ -e "$HOME_DIR/bin/cloudflared-test.bad" ] && ok "binary sai SHA bị cách ly (.bad)" || bad "binary sai SHA không bị cách ly"
cp "$W/cf.good" "$FEED/cf/cloudflared"
waitest ready true 80 && [ "$(sha "$HOME_DIR/bin/cloudflared-test")" = "$CFSHA" ] && ok "nguồn sạch lại → tự tải lại, kiểm SHA, chạy" || bad "không tự hồi phục sau khi nguồn sạch"

echo " 8g) cập nhật mang launcher mới khi tunnel đang chạy: một cloudflared, sức khoẻ gồm edge"
P1="$(est pid)"; LP1="$(cat "$HOME_DIR/logs/launcher.pid" 2>/dev/null || true)"
build 0.1.6 newlauncher; feed 0.1.6
api POST /api/update/check >/dev/null; api POST /api/update/apply >/dev/null
waitver 0.1.6 && ok "lên v0.1.6 (launcher tự thay mình)" || bad "không lên v0.1.6"
for i in $(seq 1 40); do api GET /api/update | grep -q '"to": *"v0.1.6"' && api GET /api/update | grep -q '"ok": *true' && [ "$(est ready)" = true ] && [ "$(est pid)" != "$P1" ] && break; sleep 0.5; done
[ "$(est pid)" != "$P1" ] && ! alive "$P1" && [ "$(nfake)" = 1 ] && ok "launcher cũ dừng cloudflared trước khi nhường; launcher mới chạy lại đúng một bản (pid $(est pid))" || bad "cloudflared mồ côi / trùng: cũ $P1 sống=$(alive "$P1" && echo y || echo n), số tiến trình $(nfake)"
api GET /api/update | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const h=JSON.parse(s).history[0];process.exit(h.to==="v0.1.6"&&h.ok?0:1)})' && ok "v0.1.6 qua cửa sổ sức khoẻ có edge (pending chụp tunnel đang sẵn sàng)" || bad "lịch sử v0.1.6 sai"

echo " 8h) bản mới làm hỏng edge (cloudflared không ready) → tự rollback"
build 0.1.7; feed 0.1.7; echo v0.1.7 > "$HOME_DIR/fake-cf-notready"
api POST /api/update/check >/dev/null; api POST /api/update/apply >/dev/null
waitver 0.1.7 || true
for i in $(seq 1 60); do [ "$(ver)" = 0.1.6 ] && api GET /api/update | grep -q 'edge không sẵn sàng' && break; sleep 0.5; done
[ "$(ver)" = 0.1.6 ] && ok "edge không sẵn sàng ở v0.1.7 → tự chạy lại v0.1.6 (app vẫn khoẻ)" || bad "không rollback khi edge hỏng (đang chạy $(ver))"
api GET /api/update | grep -q 'edge không sẵn sàng' && ok "lịch sử ghi lý do edge" || bad "lịch sử thiếu lý do edge"
rm -f "$HOME_DIR/fake-cf-notready"

echo " 8i) hợp đồng launcher: bản đi kèm launcher cũ hơn (không edge) → KHÔNG tự thay launcher"
intent '{"tunnel":"quick","online":true}'; waitest ready true 30 || true
LBEFORE="$(sha "$HOME_DIR/launcher.js")"
build 0.1.8 noedge; feed 0.1.8
api POST /api/update/check >/dev/null; api POST /api/update/apply >/dev/null
waitver 0.1.8 && ok "lên v0.1.8 (bản không có edge)" || bad "không lên v0.1.8"
sleep 2
[ "$(sha "$HOME_DIR/launcher.js")" = "$LBEFORE" ] && grep -q '^const LAUNCHER_ABI = 2;' "$HOME_DIR/launcher.js" && ok "launcher.js giữ hợp đồng 2 (không bị launcher hợp đồng 1 của v0.1.8 thay)" || bad "launcher bị thay bằng bản cũ hơn"
grep -q 'keeping this launcher' "$W/launcher.log" && ok "log ghi lý do giữ launcher" || bad "log thiếu lý do giữ launcher"
[ "$(est running)" = true ] && ok "tunnel vẫn chạy trên bản không có edge (launcher giữ edge)" || bad "tunnel tắt sau khi lên v0.1.8"

echo " 8j) rollback tay xuống bản không có edge khi online: vẫn làm, nhưng cảnh báo trước + trong kết quả"
build 0.1.10; feed 0.1.10
api POST /api/update/check >/dev/null; api POST /api/update/apply >/dev/null
waitver 0.1.10 && ok "lên v0.1.10" || bad "không lên v0.1.10"
for i in $(seq 1 30); do api GET /api/update | grep -q '"to": *"v0.1.10"' && break; sleep 0.5; done
api GET /api/update | grep -q '"rollbackOffline": *true' && ok "trạng thái cập nhật báo trước: rollback sẽ làm máy offline" || bad "thiếu rollbackOffline"
R="$(api POST /api/update/rollback '{"confirm":"ROLLBACK"}')"
echo "$R" | grep -q '"offline": *true' && echo "$R" | grep -q 'không có edge' && ok "rollback tay trả cảnh báo \"máy sẽ offline\"" || bad "rollback tay không cảnh báo: $R"
waitver 0.1.8 && ok "rollback tay vẫn chạy (về v0.1.8)" || bad "rollback tay bị chặn"

echo " 8k) bản mới hỏng, bản cũ không có edge, máy đang online → KHÔNG tự rollback (giữ bản mới, báo đỏ)"
build 0.1.9 broken; feed 0.1.9
api POST /api/update/check >/dev/null; api POST /api/update/apply >/dev/null
sleep 10
[ "$(basename "$(readlink "$HOME_DIR/current")")" = v0.1.9 ] && ok "giữ v0.1.9 (không tự chạy lại v0.1.8 không có edge)" || bad "đã tự rollback xuống bản không có edge ($(readlink "$HOME_DIR/current"))"
node -e 'const h=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[0];process.exit(h.to==="v0.1.9"&&h.ok===false&&h.rollbackBlocked===true&&/không có edge/.test(h.error)?0:1)' "$HOME_DIR/data/update-history.json" && ok "lịch sử báo đỏ: rollbackBlocked + lý do" || bad "lịch sử thiếu rollbackBlocked"

echo " 8l) dừng sạch: SIGTERM launcher → dừng cloudflared + server"
LP="$(cat "$HOME_DIR/logs/launcher.pid")"; CP="$(est pid)"
kill -TERM "$LP"
for i in $(seq 1 30); do alive "$LP" || break; sleep 0.5; done
! alive "$LP" && ! alive "$CP" && [ "$(nfake)" = 0 ] && ok "launcher thoát, cloudflared (pid $CP) dừng theo" || bad "còn tiến trình sau SIGTERM: launcher=$(alive "$LP" && echo y || echo n) cloudflared=$(alive "$CP" && echo y || echo n)"
[ "$(est running)" = false ] && ok "edge-status cuối: không chạy" || bad "edge-status sau khi dừng: $(cat "$EST" | tr -d '\n')"

echo; echo "Kết quả: $pass đạt, $failn trượt"
[ $failn -eq 0 ] || { echo "--- launcher.log ---"; tail -40 "$W/launcher.log"; exit 1; }
