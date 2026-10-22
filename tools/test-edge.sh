#!/usr/bin/env bash
# gen-chibi — kiểm edge v0.21 phía máy chủ (không cần Docker daemon):
#   1) CLI ghép compose: -f docker-compose.yml [-f docker-compose.edge.yml] [-f override] — không bao giờ COMPOSE_FILE (CNS-169),
#      service edge tên riêng, không trộn với `caddy` của override (CNS-194). Dùng `docker compose config` thật nếu có.
#   2) sync_compose / edge_prepare: chép tệp của bản mới; không đụng override, edge/conf/Caddyfile (bản sống), edge/conf/sites.caddy (app sinh)
#   1b) Caddy chỉ mount đúng thứ nó cần (edge/conf chỉ đọc, edge/run, caddy-data, caddy-config) — KHÔNG thấy run/tunnel.token (sửa bảo mật A)
#   3) genchibi online --caddy / --caddy-off với docker giả: kiểm cổng, dấu edge/caddy.enabled, -f đúng, native từ chối
#   4) Caddy thật (binary chính thức, không Docker): Caddyfile.base hợp lệ, admin CHỈ unix socket 0660, nạp lại qua socket vẫn giữ admin,
#      tls internal phục vụ được, khởi động lại vẫn đọc cấu hình từ tệp. Không có binary (máy không mạng) → bỏ qua, ghi rõ.
# © 2026 Gen Labs — All rights reserved.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; CPID=""; LPIDS=""
trap 'kill $CPID $LPIDS 2>/dev/null || true; [ -n "${KEEP:-}" ] || rm -rf "$W"' EXIT
pass=0; failn=0; skip=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; failn=$((failn+1)); }
skp() { echo "  - bỏ qua: $1"; skip=$((skip+1)); }
sha() { node -e 'console.log(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"; }
mode() { node -e 'console.log((require("fs").statSync(process.argv[1]).mode & 0o777).toString(8))' "$1"; }
# các hàm compose của CLI, chạy trong thư mục cài giả (CLI thật cd vào thư mục cài rồi mới gọi)
CLI_FUNCS="$(sed -n -e '/^EDGE_MARK=/p' -e '/^DOCKER_VIA=/p' -e '/^dk_pick() {/,/^}/p' -e '/^dk() {/,/^}/p' -e '/^compose_override() {/,/^}/p' -e '/^compose_files() {/,/^}/p' -e '/^compose() {/,/^}/p' -e '/^own_fix() {/,/^}/p' \
  -e '/^sync_compose() {/,/^}/p' -e '/^edge_prepare() {/,/^}/p' -e '/^port_busy() {/,/^}/p' "$ROOT/cli/genchibi")"
HAVE_COMPOSE=""; docker compose version >/dev/null 2>&1 && HAVE_COMPOSE=1

# thư mục cài kiểu máy Ryan: override có login + caddy (giữ 80/443), .env có COMPOSE_PROFILES
mkinst() {
  local d="$1"; mkdir -p "$d/current/edge"
  cp "$ROOT/docker-compose.yml" "$ROOT/docker-compose.edge.yml" "$d/current/"; cp "$ROOT/edge/Caddyfile.base" "$d/current/edge/"
  cp "$ROOT/docker-compose.yml" "$d/"
  printf 'services:\n  login:\n    image: example/login\n  caddy:\n    image: caddy:2\n    ports: ["80:80", "443:443"]\n' > "$d/docker-compose.override.yml"
  printf 'GC_MODE=docker\nGC_MASTER_KEY=test-key\nGC_UID=1000\nGC_GID=1000\n' > "$d/.env"
}

echo "1) CLI ghép compose bằng -f, không COMPOSE_FILE"
bad_cf="$(grep -nE 'COMPOSE_FILE' "$ROOT/cli/genchibi" "$ROOT/install.sh" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' || true)"
[ -z "$bad_cf" ] && ok "cli/genchibi + install.sh không đặt / ghi / đọc COMPOSE_FILE (chỉ nhắc trong chú thích)" || bad "có COMPOSE_FILE: $bad_cf"
direct="$(grep -nE 'docker compose ' "$ROOT/cli/genchibi" | grep -vE '^[0-9]+:[[:space:]]*#' | grep -vE 'docker compose "\$\{a\[@\]\}"' || true)"
[ -z "$direct" ] && ok "mọi lệnh docker compose của CLI đi qua compose() (một nơi ghép -f)" || bad "gọi docker compose trực tiếp: $direct"
I="$W/inst"; mkinst "$I"
fl() { ( cd "$I"; eval "$CLI_FUNCS"; compose_files | tr '\n' ' ' ); }
[ "$(fl)" = "-f docker-compose.yml -f docker-compose.override.yml " ] && ok "chưa bật edge: -f docker-compose.yml -f docker-compose.override.yml" || bad "danh sách -f khi chưa bật edge: $(fl)"
mkdir -p "$I/edge"; : > "$I/edge/caddy.enabled"; cp "$ROOT/docker-compose.edge.yml" "$I/"
[ "$(fl)" = "-f docker-compose.yml -f docker-compose.edge.yml -f docker-compose.override.yml " ] && ok "đã bật edge: base · edge · override (override sau cùng)" || bad "danh sách -f khi bật edge: $(fl)"
mv "$I/docker-compose.override.yml" "$I/compose.override.yaml"
[ "$(fl)" = "-f docker-compose.yml -f docker-compose.edge.yml -f compose.override.yaml " ] && ok "override tên khác (compose.override.yaml) cũng được ghép" || bad "bỏ sót compose.override.yaml: $(fl)"
mv "$I/compose.override.yaml" "$I/docker-compose.override.yml"
if [ -n "$HAVE_COMPOSE" ]; then
  svc() { ( cd "$I"; eval "$CLI_FUNCS"; compose config --services 2>/dev/null | sort | tr '\n' ' ' ); }
  [ "$(svc)" = "app caddy gen-chibi-edge login " ] && ok "docker compose config: app + gen-chibi-edge + đủ service của override (login, caddy)" || bad "services khi bật edge: $(svc)"
  [ "$(COMPOSE_FILE=docker-compose.yml:docker-compose.edge.yml svc)" = "app caddy gen-chibi-edge login " ] && ok "COMPOSE_FILE trong môi trường / .env không làm rơi override (-f thắng)" || bad "COMPOSE_FILE làm rơi service: $(COMPOSE_FILE=docker-compose.yml:docker-compose.edge.yml svc)"
  img="$(cd "$I"; eval "$CLI_FUNCS"; compose config 2>/dev/null | sed -n '/^  caddy:/,/^  [a-z]/p' | grep -c 'image: caddy:2$' || true)"
  [ "$img" = 1 ] && ok "service caddy của override không bị trộn với gen-chibi-edge (CNS-194)" || bad "caddy của override bị trộn"
  ports="$(cd "$I"; eval "$CLI_FUNCS"; compose config --format json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const e=JSON.parse(s).services["gen-chibi-edge"];console.log(e.ports.map(p=>p.published+">"+p.target).join(" ")+" "+e.user+" "+e.volumes.map(v=>v.target).join(","))})')"
  [ "$ports" = "80>8080 443>8443 1000:1000 /edge/conf,/edge/run,/edge/caddy-data,/edge/caddy-config" ] && ok "edge: 80→8080, 443→8443, chạy bằng GC_UID:GC_GID, chỉ mount edge/conf · edge/run · caddy-data · caddy-config" || bad "cấu hình edge: $ports"
  # sửa bảo mật A: tunnel token (run/tunnel.token) không bao giờ nằm dưới một nguồn mount của Caddy; không mount cả ./edge / thư mục cài; edge/conf chỉ đọc
  mkdir -p "$I/run" "$I/edge"; : > "$I/run/tunnel.token"; : > "$I/edge/tunnel.token"   # tệp cũ (P2 đặt ở edge/) cũng không được lộ
  mounts_ok() { # mounts_ok <tệp compose edge> → "ok" | danh sách lỗi
    ( cd "$I"; docker compose -f docker-compose.yml -f "$1" config --format json 2>/dev/null ) | I="$I" node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const path=require("path"),fs=require("fs"),I=fs.realpathSync(process.env.I),e=JSON.parse(s).services["gen-chibi-edge"],bad=[];
      const toks=[path.join(I,"run","tunnel.token"),path.join(I,"edge","tunnel.token")];
      (e.volumes||[]).forEach(v=>{const src=fs.existsSync(v.source)?fs.realpathSync(v.source):path.resolve(v.source);
        toks.forEach(t=>{if(t===src||t.startsWith(src+path.sep))bad.push("thấy "+path.relative(I,t)+" qua "+v.source)});
        if(src===I||src===path.join(I,"edge"))bad.push("mount cả "+v.source);
        if(v.target==="/edge/conf"&&!v.read_only)bad.push("/edge/conf không chỉ đọc")});
      console.log(bad.join("; ")||"ok")})'
  }
  vis="$(mounts_ok docker-compose.edge.yml)"
  [ "$vis" = ok ] && ok "Caddy không thấy tunnel token (run/ lẫn edge/); không mount cả ./edge hay thư mục cài; edge/conf chỉ đọc" || bad "mount của Caddy: $vis"
  # đột biến: mount cả ./edge như P2 → kiểm trên phải ĐỎ
  sed -e 's#^      - ./edge/conf:/edge/conf:ro.*#      - ./edge:/edge#' -e '/^      - .\/edge\/\(run\|caddy-data\|caddy-config\):/d' "$I/docker-compose.edge.yml" > "$I/edge-mut.yml"
  mvis="$(mounts_ok edge-mut.yml)"
  [ "$mvis" != ok ] && grep -q 'thấy edge/tunnel.token' <<< "$mvis" && ok "đột biến (mount cả ./edge) → kiểm mount ĐỎ: $mvis" || bad "đột biến không bị bắt: $mvis"
  rm -f "$I/edge-mut.yml" "$I/edge/tunnel.token"
  rm "$I/edge/caddy.enabled"
  [ "$(svc)" = "app caddy login " ] && ok "tắt edge (bỏ dấu) → không còn gen-chibi-edge, override vẫn đủ" || bad "services khi tắt edge: $(svc)"
else
  skp "docker compose không có trên máy này — chỉ kiểm danh sách -f"
  rm "$I/edge/caddy.enabled"
fi

echo "2) sync_compose / edge_prepare"
S="$W/sync"; mkinst "$S"; mkdir -p "$S/edge"
echo "# compose bản mới" > "$S/current/docker-compose.yml"; echo "# edge bản mới" > "$S/current/docker-compose.edge.yml"; echo "# caddy gốc bản mới" > "$S/current/edge/Caddyfile.base"
echo "# compose bản cũ" > "$S/docker-compose.yml"
mkdir -p "$S/edge/conf"; echo "# Caddyfile sống (đã sửa)" > "$S/edge/conf/Caddyfile"; echo "chibi.example.com { respond ok }" > "$S/edge/conf/sites.caddy"
cp "$S/docker-compose.override.yml" "$W/ovr.orig"; cp "$S/edge/conf/Caddyfile" "$W/cf.orig"; cp "$S/edge/conf/sites.caddy" "$W/sites.orig"
( cd "$S"; MODE=docker; eval "$CLI_FUNCS"; sync_compose )
cmp -s "$S/docker-compose.yml" "$S/current/docker-compose.yml" && cmp -s "$S/docker-compose.edge.yml" "$S/current/docker-compose.edge.yml" && cmp -s "$S/edge/Caddyfile.base" "$S/current/edge/Caddyfile.base" \
  && ok "chép docker-compose.yml + docker-compose.edge.yml + edge/Caddyfile.base của bản mới" || bad "sync_compose không chép đủ tệp của bản mới"
cmp -s "$S/docker-compose.override.yml" "$W/ovr.orig" && cmp -s "$S/edge/conf/Caddyfile" "$W/cf.orig" && cmp -s "$S/edge/conf/sites.caddy" "$W/sites.orig" \
  && ok "không đụng docker-compose.override.yml, edge/conf/Caddyfile, edge/conf/sites.caddy" || bad "sync_compose ghi đè tệp của chủ / của app"
( cd "$S"; MODE=native; eval "$CLI_FUNCS"; echo "# đổi" > current/docker-compose.edge.yml; sync_compose )
grep -q 'đổi' "$S/docker-compose.edge.yml" && bad "native mà vẫn chép tệp compose" || ok "chế độ native: sync_compose không làm gì"
P="$W/prep"; mkinst "$P"; mkdir -p "$P/edge"; cp "$ROOT/edge/Caddyfile.base" "$P/edge/"
( cd "$P"; eval "$CLI_FUNCS"; edge_prepare )
[ ! -e "$P/edge/run" ] && [ ! -e "$P/edge/conf" ] && ok "chưa bật edge: edge_prepare không tạo gì" || bad "edge_prepare chạy khi chưa bật"
: > "$P/edge/caddy.enabled"
( cd "$P"; eval "$CLI_FUNCS"; edge_prepare )
[ -d "$P/edge/caddy-data" ] && [ -d "$P/edge/caddy-config" ] && [ "$(mode "$P/edge/run")" = 700 ] && [ "$(mode "$P/edge/conf")" = 700 ] && cmp -s "$P/edge/conf/Caddyfile" "$ROOT/edge/Caddyfile.base" && [ -f "$P/edge/conf/sites.caddy" ] && [ ! -s "$P/edge/conf/sites.caddy" ] \
  && ok "bật edge: tạo conf/ + run/ (700), caddy-data, caddy-config bằng user này; conf/Caddyfile từ bản gốc; conf/sites.caddy rỗng" || bad "edge_prepare thiếu thư mục / tệp"
echo "site { }" > "$P/edge/conf/sites.caddy"; echo "# sửa tay" >> "$P/edge/conf/Caddyfile"; cp "$P/edge/conf/Caddyfile" "$W/cf2.orig"
( cd "$P"; eval "$CLI_FUNCS"; edge_prepare )
grep -q 'site' "$P/edge/conf/sites.caddy" && cmp -s "$P/edge/conf/Caddyfile" "$W/cf2.orig" && ok "edge_prepare không ghi đè Caddyfile / sites.caddy đã có" || bad "edge_prepare ghi đè tệp đã có"

echo "3) genchibi online --caddy / --caddy-off (docker giả, ghi lại lệnh)"
C="$W/cli"; mkinst "$C"; mkdir -p "$W/fakebin"
printf '#!/bin/sh\necho "$*" >> "%s/docker.log"\nexit 0\n' "$W" > "$W/fakebin/docker"; chmod +x "$W/fakebin/docker"
gc() { GC_HOME="$C" GC_CLI_INNER=1 GC_LANG=en PATH="$W/fakebin:$PATH" bash "$ROOT/cli/genchibi" ${1+"$@"}; }
: > "$W/docker.log"
(echo > /dev/tcp/127.0.0.1/80) 2>/dev/null && P80=1 || P80=""
(echo > /dev/tcp/127.0.0.1/443) 2>/dev/null && P443=1 || P443=""
if [ -z "$P80$P443" ]; then
  out="$(gc online --caddy 2>&1)" && rc=0 || rc=$?
  [ $rc = 0 ] && [ -f "$C/edge/caddy.enabled" ] && grep -q 'compose -f docker-compose.yml -f docker-compose.edge.yml -f docker-compose.override.yml up -d' "$W/docker.log" \
    && ok "cổng 80/443 rảnh → bật: dấu edge/caddy.enabled, compose -f base -f edge -f override up -d" || bad "online --caddy ($rc): $out | $(cat "$W/docker.log")"
  [ -d "$C/edge/run" ] && [ -f "$C/edge/conf/sites.caddy" ] && [ -f "$C/edge/conf/Caddyfile" ] && [ -f "$C/docker-compose.edge.yml" ] && ok "đã chép docker-compose.edge.yml + chuẩn bị ./edge trước khi compose up" || bad "thiếu tệp / thư mục edge sau online --caddy"
  : > "$W/docker.log"; gc stop >/dev/null 2>&1 || true
  grep -q 'compose -f docker-compose.yml -f docker-compose.edge.yml -f docker-compose.override.yml stop' "$W/docker.log" && ok "genchibi stop dùng cùng bộ -f (gồm edge)" || bad "stop: $(cat "$W/docker.log")"
  : > "$W/docker.log"; out="$(gc online --caddy-off 2>&1)" || true
  grep -q 'compose -f docker-compose.yml -f docker-compose.edge.yml -f docker-compose.override.yml rm -sf gen-chibi-edge' "$W/docker.log" && [ ! -f "$C/edge/caddy.enabled" ] && [ -d "$C/edge/caddy-data" ] \
    && ok "--caddy-off: gỡ đúng container gen-chibi-edge, bỏ dấu, giữ dữ liệu edge (chứng chỉ)" || bad "--caddy-off: $out | $(cat "$W/docker.log")"
  : > "$W/docker.log"; gc stop >/dev/null 2>&1 || true
  grep -q 'compose -f docker-compose.yml -f docker-compose.override.yml stop' "$W/docker.log" && ok "sau khi tắt: stop không còn tệp edge" || bad "stop sau khi tắt: $(cat "$W/docker.log")"
  # genchibi online caddy <tên-miền> (v0.21 P4): bật edge nếu chưa → chờ admin socket của Caddy → mới gọi API (app không chạy ở đây → báo rõ)
  : > "$W/docker.log"; out="$(GC_EDGE_WAIT=1 gc online caddy chibi.example.com 2>&1)" && rc=0 || rc=$?
  [ $rc = 1 ] && [ -f "$C/edge/caddy.enabled" ] && grep -q 'docker-compose.edge.yml .*up -d' "$W/docker.log" && grep -q 'did not start' <<< "$out" && ! grep -q 'Go online · caddy' <<< "$out" \
    && ok "online caddy <tên-miền>: tự bật edge (compose -f … edge … up -d); Caddy không lên → dừng trước khi gọi API" || bad "online caddy (không socket) ($rc): $out | $(cat "$W/docker.log")"
  node -e 'require("net").createServer().listen(process.argv[1])' "$C/edge/run/caddy-admin.sock" & LPIDS="$!"
  for i in $(seq 1 20); do [ -S "$C/edge/run/caddy-admin.sock" ] && break; sleep 0.1; done
  out="$(GC_EDGE_WAIT=2 gc online caddy chibi.example.com 2>&1)" && rc=0 || rc=$?
  [ $rc = 1 ] && grep -q 'already on' <<< "$out" && grep -q 'Go online · caddy · chibi.example.com' <<< "$out" && grep -q 'does not answer' <<< "$out" \
    && ok "online caddy: edge đã bật + admin socket có → gửi POST /api/online/caddy (app dừng → 'does not answer … genchibi start')" || bad "online caddy (có socket) ($rc): $out"
  kill $LPIDS 2>/dev/null || true; LPIDS=""; rm -f "$C/edge/run/caddy-admin.sock"
  out="$(gc online caddy 'bad domain' 2>&1)" && rc=0 || rc=$?
  [ $rc = 2 ] && grep -q 'Invalid domain' <<< "$out" && ok "online caddy tên miền sai → thoát 2" || bad "online caddy tên sai ($rc): $out"
  gc online --caddy-off >/dev/null 2>&1 || true
else
  skp "cổng 80/443 trên máy này đang bận — không thử nhánh bật"
fi
# cổng bận → không bật (cần quyền mở cổng 80; netns của kiểm thử có, CI thường không)
if node -e 'require("net").createServer().listen(80,"127.0.0.1",()=>process.exit(0)).on("error",()=>process.exit(1))' 2>/dev/null; then
  node -e 'require("net").createServer().listen(80,"127.0.0.1")' & LPIDS="$!"; sleep 0.5
  : > "$W/docker.log"; out="$(gc online --caddy 2>&1)" && rc=0 || rc=$?
  [ $rc != 0 ] && [ ! -f "$C/edge/caddy.enabled" ] && ! grep -q ' up ' "$W/docker.log" && grep -q 'Port(s) 80 already in use' <<< "$out" && grep -q 'Cloudflare' <<< "$out" \
    && ok "cổng 80 bận → KHÔNG bật, báo rõ + gợi ý đường Cloudflare, không gọi compose up" || bad "cổng bận ($rc): $out"
  kill $LPIDS 2>/dev/null || true; LPIDS=""
else
  skp "không mở được cổng 80 để giả cổng bận (không phải root) — port_busy vẫn kiểm ở dưới"
fi
node -e 'require("net").createServer().listen(7591,"127.0.0.1")' & LPIDS="$!"; sleep 0.5
( cd "$C"; eval "$CLI_FUNCS"; port_busy 7591 ) && pb1=1 || pb1=""
kill $LPIDS 2>/dev/null || true; LPIDS=""; sleep 0.2
( cd "$C"; eval "$CLI_FUNCS"; port_busy 7591 ) && pb2=1 || pb2=""
[ -n "$pb1" ] && [ -z "$pb2" ] && ok "port_busy: thấy cổng đang nghe, không báo nhầm cổng rảnh" || bad "port_busy sai (bận=$pb1 rảnh=$pb2)"
printf 'GC_MODE=native\n' >> "$C/.env"
out="$(gc online --caddy 2>&1)" && rc=0 || rc=$?
[ $rc != 0 ] && grep -q 'needs Docker mode' <<< "$out" && ok "native: online --caddy từ chối (cổng < 1024), gợi ý Cloudflare" || bad "native ($rc): $out"
out="$(GC_HOME="$C" GC_CLI_INNER=1 GC_LANG=vi PATH="$W/fakebin:$PATH" bash "$ROOT/cli/genchibi" online --caddy 2>&1)" || true
grep -q 'cần chế độ Docker' <<< "$out" && ok "câu báo có bản tiếng Việt" || bad "thiếu câu tiếng Việt: $out"
out="$(gc expose --help 2>&1)" && rc=0 || rc=$?
[ $rc = 2 ] && [ "$out" = "genchibi expose --help was removed in v0.23 — use: genchibi online --help" ] && ok "genchibi expose: đã bỏ ở v0.23 — một dòng chỉ lệnh online, thoát 2 (B11)" || bad "expose ($rc): $out"
# v0.23 B11: máy Docker còn GC_TUNNEL + COMPOSE_PROFILES=tunnel (genchibi expose cũ) — docker-compose.yml không còn service tunnel / tunnel-quick
grep -qE '^  tunnel(-quick)?:|profiles:' "$ROOT/docker-compose.yml" && bad "docker-compose.yml còn service / profile tunnel cũ" || ok "docker-compose.yml không còn service tunnel / tunnel-quick (profiles tunnel / quick đã bỏ)"
DL="$W/dleg"; mkinst "$DL"; printf 'GC_TUNNEL=named\nGC_PUBLIC_URL=https://old.example.com\nCOMPOSE_PROFILES=tunnel\n' >> "$DL/.env"; : > "$W/docker.log"
out="$(GC_HOME="$DL" GC_CLI_INNER=1 GC_LANG=en PATH="$W/fakebin:$PATH" bash "$ROOT/cli/genchibi" start 2>&1)" && rc=0 || rc=$?
nn="$(grep -c '^! .env still has GC_TUNNEL=named from the old genchibi expose (removed in v0.23) — that tunnel is no longer started. Move this machine to Go online: genchibi online migrate$' <<< "$out" || true)"
[ $rc = 0 ] && [ "$nn" = 1 ] && grep -q '^rm -f gen-chibi-tunnel gen-chibi-tunnel-quick$' "$W/docker.log" && grep -q 'compose .*up -d' "$W/docker.log" && ! grep -q 'profile' "$W/docker.log" \
  && ok "Docker + GC_TUNNEL: genchibi start in đúng một dòng nhắc genchibi online migrate, gỡ container tunnel cũ còn sót, compose up không profile cũ" || bad "Docker + GC_TUNNEL ($rc, $nn dòng nhắc): $out / $(cat "$W/docker.log")"
: > "$W/docker.log"; printf 'GC_MODE=docker\nGC_MASTER_KEY=test-key\n' > "$DL/.env"
GC_HOME="$DL" GC_CLI_INNER=1 GC_LANG=en PATH="$W/fakebin:$PATH" bash "$ROOT/cli/genchibi" start >/dev/null 2>&1 || true
grep -q 'gen-chibi-tunnel' "$W/docker.log" && bad "máy không có GC_TUNNEL vẫn gọi docker rm tunnel cũ" || ok "máy không có GC_TUNNEL: start không đụng container tunnel cũ"
if [ -n "$HAVE_COMPOSE" ]; then
  svl="$(cd "$DL"; COMPOSE_PROFILES=tunnel docker compose -f docker-compose.yml config --services 2>&1 | tr '\n' ' ')"
  [ "$svl" = "app " ] && ok "docker compose với COMPOSE_PROFILES=tunnel còn sót trong .env: không lỗi, chỉ có app" || bad "COMPOSE_PROFILES=tunnel: $svl"
fi

echo "4) Caddy thật: Caddyfile.base + nạp lại qua unix socket"
CADDY_VER=2.11.7
# CHỈ để kiểm thử: gói .deb amd64 từ kho apt chính thức của Caddy (https://dl.cloudsmith.io/public/caddy/stable), SHA kiểm 2026-10-20
CADDY_DEB_SHA=a22b914ffd1958da42bc7ab13b7b62c6100634e0798ab594891d2d61d53ba749
CADDY_BIN_SHA=678ade3bfc088749c81a681adc603333ee0bb023b6a6cfe3c0f58bef8ff854e9
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/gen-chibi-test"
get_caddy() {
  if [ -n "${GC_TEST_CADDY:-}" ] && [ -x "$GC_TEST_CADDY" ]; then echo "$GC_TEST_CADDY"; return 0; fi
  local c="$CACHE/caddy-$CADDY_VER" d="$W/caddy-dl"
  if [ -x "$c" ] && [ "$(sha "$c")" = "$CADDY_BIN_SHA" ]; then echo "$c"; return 0; fi
  [ "$(uname -s)-$(uname -m)" = Linux-x86_64 ] && command -v ar >/dev/null || return 1
  mkdir -p "$d"
  curl -fsSL -m 120 -o "$d/caddy.deb" "https://dl.cloudsmith.io/public/caddy/stable/deb/debian/pool/any-version/main/c/ca/caddy_$CADDY_VER/caddy_${CADDY_VER}_linux_amd64.deb" 2>/dev/null || return 1
  [ "$(sha "$d/caddy.deb")" = "$CADDY_DEB_SHA" ] || { echo "  ✗ caddy.deb sai SHA — không dùng" >&2; return 1; }
  ( cd "$d" && ar x caddy.deb data.tar.gz && tar -xzf data.tar.gz ./usr/bin/caddy ) || return 1
  [ "$(sha "$d/usr/bin/caddy")" = "$CADDY_BIN_SHA" ] || return 1
  mkdir -p "$CACHE" && cp "$d/usr/bin/caddy" "$c" && chmod 755 "$c" && echo "$c"
}
CADDY="$(get_caddy || true)"
if [ -z "$CADDY" ]; then
  skp "chưa có binary caddy $CADDY_VER (máy không mạng / không phải linux-amd64) — đặt GC_TEST_CADDY hoặc chạy một lần khi có mạng"
else
  E="$W/edge"; mkdir -p "$E/conf" "$E/run" "$E/caddy-data" "$E/caddy-config"; chmod 700 "$E/run"
  sed "s#/edge/#$E/#g" "$ROOT/edge/Caddyfile.base" > "$E/conf/Caddyfile"; : > "$E/conf/sites.caddy"
  cx() { XDG_DATA_HOME="$E/caddy-data" XDG_CONFIG_HOME="$E/caddy-config" HOME="$E" "$CADDY" ${1+"$@"}; }
  # chạy nền: exec trong subshell nền → $! là PID của CHÍNH caddy (gọi hàm cx ở nền thì $! là subshell — kill chỉ giết subshell, caddy mồ côi sống tiếp)
  cxrun() { XDG_DATA_HOME="$E/caddy-data" XDG_CONFIG_HOME="$E/caddy-config" HOME="$E" exec "$CADDY" run --config "$E/conf/Caddyfile" --adapter caddyfile; }
  J="$(cx adapt --config "$E/conf/Caddyfile" --adapter caddyfile 2>/dev/null || true)"
  grep -q "\"listen\":\"unix/$E/run/caddy-admin.sock|0660\"" <<< "$J" && ok "Caddyfile.base hợp lệ (caddy $CADDY_VER adapt), admin = unix socket 0660" || bad "adapt: $J"
  cxrun > "$W/caddy.log" 2>&1 & CPID=$!
  SOCK="$E/run/caddy-admin.sock"
  for i in $(seq 1 40); do [ -S "$SOCK" ] && break; sleep 0.25; done
  [ -S "$SOCK" ] && [ "$(mode "$SOCK")" = 660 ] && ok "admin socket ./edge/run/caddy-admin.sock, quyền 660" || bad "không có admin socket 660 ($(ls -l "$SOCK" 2>&1))"
  curl -s --noproxy "*" -m 2 -o /dev/null http://127.0.0.1:2019/config/ && bad "admin còn nghe TCP 2019" || ok "không có admin trên TCP (2019)"
  printf 'chibi.test {\n\ttls internal\n\trespond "gen-chibi edge ok"\n}\n' > "$E/conf/sites.caddy"
  code="$(curl -s -o "$W/load.out" -w '%{http_code}' --unix-socket "$SOCK" -H 'Content-Type: text/caddyfile' --data-binary @"$E/conf/Caddyfile" http://localhost/load || true)"
  [ "$code" = 200 ] && ok "app nạp lại cấu hình qua unix socket (POST /load, text/caddyfile)" || bad "POST /load: $code $(cat "$W/load.out")"
  body=""; for i in $(seq 1 40); do body="$(curl -sk --noproxy "*" -m 3 --resolve chibi.test:8443:127.0.0.1 https://chibi.test:8443/ 2>/dev/null || true)"; [ "$body" = "gen-chibi edge ok" ] && break; sleep 0.25; done
  [ "$body" = "gen-chibi edge ok" ] && ok "site trong sites.caddy phục vụ HTTPS trên 8443 (tls internal)" || bad "HTTPS 8443: '$body' $(tail -3 "$W/caddy.log")"
  curl -s -m 3 -o /dev/null -w '%{http_code}' --unix-socket "$SOCK" http://localhost/config/admin | grep -q 200 && ok "sau khi nạp lại, admin vẫn ở unix socket (khai trong tệp — CNS-194)" || bad "mất admin socket sau khi nạp lại"
  hdr="$(curl -sk --noproxy "*" -m 3 -D - -o /dev/null --resolve chibi.test:8443:127.0.0.1 https://chibi.test:8443/ || true)"
  grep -q '^HTTP/' <<< "$hdr" && ! grep -qi '^alt-svc:.*h3' <<< "$hdr" && ok "không quảng bá HTTP/3 (chỉ publish TCP 443)" || bad "Caddy quảng bá HTTP/3 (UDP 443 không được publish) / không đọc được header: $hdr"
  r="$(curl -s --noproxy "*" -m 3 -o /dev/null -w "%{http_code} %{redirect_url}" -H 'Host: chibi.test' http://127.0.0.1:8080/ || true)"
  [ "$r" = "308 https://chibi.test/" ] && ok "8080 (HTTP) chuyển sang https://tên/ — không lộ cổng 8443 trong container" || bad "8080: $r"
  kill "$CPID"; wait "$CPID" 2>/dev/null || true; CPID=""
  cxrun >> "$W/caddy.log" 2>&1 & CPID=$!
  body=""; for i in $(seq 1 40); do body="$(curl -sk --noproxy "*" -m 3 --resolve chibi.test:8443:127.0.0.1 https://chibi.test:8443/ 2>/dev/null || true)"; [ "$body" = "gen-chibi edge ok" ] && break; sleep 0.25; done
  [ "$body" = "gen-chibi edge ok" ] && ok "khởi động lại Caddy: cấu hình đọc lại từ tệp, site vẫn chạy" || bad "sau khởi động lại: '$body'"
  kill "$CPID"; wait "$CPID" 2>/dev/null || true; CPID=""
fi

echo; echo "Kết quả: $pass đạt, $failn trượt, $skip bỏ qua"
[ $failn -eq 0 ]
