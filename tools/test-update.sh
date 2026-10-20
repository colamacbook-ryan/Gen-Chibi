#!/usr/bin/env bash
# Kiểm thử end-to-end cơ chế tự cập nhật (không cần Docker):
#   1) cập nhật v0.1.0 → v0.1.1 thành công
#   2) gói sai checksum → từ chối, vẫn chạy bản cũ
#   3) bản v0.1.2 hỏng (server chết) → launcher tự rollback về v0.1.1
#   4) rollback thủ công (xác nhận 2 bước)
#   5) agent tự kiểm và cập nhật qua MCP (get_app_version, update_app)
#   7) bản mới mang launcher MỚI, chạy native (không ai canh): launcher tự thay mình, tự chạy lại, trao tệp pid (CNS-171)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; FEED="$W/feed"; HOME_DIR="$W/home"; PORT=7499; FPORT=7498
trap 'kill $LPID $FPID $(cat "$HOME_DIR/logs/launcher.pid" 2>/dev/null) 2>/dev/null || true; [ -n "${KEEP:-}" ] || rm -rf "$W"' EXIT
mkdir -p "$FEED" "$HOME_DIR/releases"
pass=0; failn=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; failn=$((failn+1)); }

build() { # build <ver> [broken]
  local src="$W/src-$1"; rm -rf "$src"; cp -R "$ROOT" "$src"; rm -rf "$src/.git" "$src/dist"
  echo "$1" > "$src/VERSION"
  if [ "${2:-}" = broken ]; then echo 'throw new Error("bản hỏng cố ý");' > "$src/server/main.js"; fi
  if [ "${2:-}" = newlauncher ]; then printf '\n// launcher của bản thử %s\n' "$1" >> "$src/launcher.js"; fi   # launcher khác bản đang chạy → nhánh tự thay launcher
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

for p in $PORT $FPORT; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null && { echo "Cổng $p đang bị tiến trình khác chiếm — dừng nó rồi chạy lại."; exit 1; }; done
echo "Dựng các bản thử…"
build 0.1.0; build 0.1.1; build 0.1.2 broken
python3 -m http.server $FPORT --directory "$FEED" >/dev/null 2>&1 & FPID=$!
# cài v0.1.0 như install.sh làm
mkdir -p "$HOME_DIR/releases/v0.1.0"
tar -xzf "$FEED/0.1.0/gen-chibi-v0.1.0.tar.gz" -C "$HOME_DIR/releases/v0.1.0" --strip-components=1
ln -s releases/v0.1.0 "$HOME_DIR/current"; cp "$HOME_DIR/current/launcher.js" "$HOME_DIR/launcher.js"
GC_HOME="$HOME_DIR" GC_PORT=$PORT GC_FEED_URL="http://127.0.0.1:$FPORT/latest.json" GC_NO_AUTOCHECK=1 GC_HEALTH_WINDOW_MS=6000 \
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
grep -n 'override' "$ROOT/cli/genchibi" | grep -vE '^[0-9]+:[[:space:]]*#' | grep -q 'rm \|cp \|mv \|>' && bad "cli/genchibi có lệnh ghi / xoá liên quan override" || ok "cli/genchibi không có lệnh nào ghi / xoá docker-compose.override.yml"

echo; echo "Kết quả: $pass đạt, $failn trượt"
[ $failn -eq 0 ] || { echo "--- launcher.log ---"; tail -40 "$W/launcher.log"; exit 1; }
