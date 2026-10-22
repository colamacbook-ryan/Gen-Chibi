#!/usr/bin/env bash
# gen-chibi — mô hình root (v0.23.1: CNS-233 / CNS-257 · doctor CNS-234 · dấu máy khi khôi phục CNS-235). Docker GIẢ (docker compose up = chạy launcher + server
# THẬT của bản cài), feed phát hành giả (gói + SHA256SUMS thật do tools/package.sh dựng). Không cần Docker, không cần mạng ngoài, không cần root thật:
#   1) máy kiểu Ryan: bản cài Docker bằng root (sudo) của bản cũ — lệnh root cũ (≤ v0.23.0: exec current/cli/genchibi), .env kế thừa, override có service đăng
#      nhập → lần gõ đầu tự tải + kiểm gói (SHA-256), lắp lệnh đã kiểm, thay lệnh trong PATH · start · status · update (tự kiểm bản mới) · rollback (lệnh root
#      không lùi) · container tự đổi current sang bản không kiểm được → root giữ tệp đã kiểm · online / online off. Override đăng nhập CHƯA duyệt (hay đổi
#      sau khi duyệt) → start / update DỪNG trước khi đụng container (container giữ nguyên), status / doctor ✗; approve → chạy được
#   2) container bị chiếm (ghi bằng user của thư mục cài): current/ + releases/*/cli/genchibi, .env có $(…) / `…` / PATH / BASH_ENV / GC_UID=0, override, tệp
#      compose, owner-token chèn cấu hình curl → root không chạy gì (tệp canary), compose chỉ nhận tệp đã kiểm; GC_MODE=native → từ chối
#   3) override: chưa quyết → dừng · approve (cần --yes khi không terminal) · đổi nội dung → lại dừng · off --yes (chạy không có nó) · đổi tiếp → lại dừng
#   5b) trình cài chạy bằng root trên thư mục cài có sẵn: tệp tạm .env.gc-tmp / launcher.js.gc-tmp / run/machine-id.gc-tmp cài sẵn là symlink → đích nguyên
#   4) khôi phục (CNS-235): cùng máy → install-id giữ · máy khác (run/machine-id khác) → install-id mới — CLI + server thật
#   5) doctor (CNS-234): bản cài root cũ GC_UID=1000 chưa ghi ai cài → báo; không terminal + không --yes → không đổi; --yes → tài khoản genchibi, đổi chủ CHỈ tệp
#      của uid cũ (find -user, chown -h), .env, chạy lại · sudo:<user uid 1000> → không đề nghị · trình cài ghi GC_INSTALLED_BY + nhắc doctor · sức khoẻ khác
#   6) root THẬT (chỉ khi test chạy bằng root): setpriv thật — .env / tệp tạm là symlink sang tệp của root → không đọc / ghi xuyên; tệp mới thuộc user thư mục cài
# Root giả bằng id giả (FAKE_ROOT); setpriv giả ghi lệnh rồi chạy phần sau "--" — chạy được bằng root lẫn user thường (L-77). Cổng 7981–7989.
# © 2026 Gen Labs — All rights reserved.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; FEED="$W/feed"; FK="$W/fake"; FS="$W/state"; mkdir -p "$FEED" "$FK" "$FS"
PORT=7981; FPORT=7985; DPORT=7987
PASS=0; FAIL=0
ok()  { echo "   ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "   ✗ $1"; FAIL=$((FAIL+1)); }
check() { if [ "$1" = 0 ]; then ok "$2"; else bad "$2${3:+ — $3}"; fi; }
FPID=""
# logs/launcher.pid: launcher native — chỉ có khi một đột biến làm root chạy native (dọn để không sót tiến trình)
stop_launchers() { local f p i; for f in "$FS"/launcher-*.pid "$W"/*/logs/launcher.pid; do [ -f "$f" ] || continue; p="$(cat "$f")"; kill "$p" 2>/dev/null; for i in $(seq 1 50); do kill -0 "$p" 2>/dev/null || break; sleep 0.1; done; kill -9 "$p" 2>/dev/null; rm -f "$f"; done; return 0; }
cleanup() { stop_launchers; [ -z "$FPID" ] || kill "$FPID" 2>/dev/null; [ -n "${KEEP:-}" ] || case "$W" in */tmp.??????????) rm -rf -- "$W" ;; esac; }
trap cleanup EXIT
for p in $PORT $((PORT+2)) $FPORT $DPORT $((DPORT+2)); do (echo > "/dev/tcp/127.0.0.1/$p") 2>/dev/null && { echo "Cổng $p đang bị tiến trình khác chiếm — dừng nó rồi chạy lại."; exit 1; }; done
[ -z "${KEEP:-}" ] || echo "   (KEEP: thư mục tạm $W)"
REALROOT=""; [ "$(id -u)" = 0 ] && REALROOT=1
[ -z "$REALROOT" ] || chmod 755 "$W"   # user của "container" (nobody) phải đi qua được thư mục tạm
SID=""; command -v setsid >/dev/null 2>&1 && SID="setsid"   # không terminal (câu hỏi c/K không treo)
# user của "container": nobody khi test chạy bằng root thật (thư mục cài chown sang nobody), không thì chính user chạy test
if [ -n "$REALROOT" ]; then AUID="$(id -u nobody)"; AGID="$(id -g nobody)"; else AUID="$(id -u)"; AGID="$(id -g)"; fi
own_app() { [ -z "$REALROOT" ] || chown -R "$AUID:$AGID" "$1"; }
as_container() { if [ -n "$REALROOT" ]; then setpriv --reuid="$AUID" --regid="$AGID" --clear-groups -- "$@"; else "$@"; fi; }   # ghi như app trong container

echo "   dựng bản phát hành thử (gói + SHA256SUMS thật)…"
build() { # build <ver> → $FEED/v<ver>/gen-chibi-v<ver>.tar.gz + SHA256SUMS
  local src="$W/src"; mkdir -p "$src"
  tar -C "$ROOT" --exclude=./.git --exclude=./dist -cf - VERSION CHANGELOG.md LICENSE README.md launcher.js install.sh docker-compose.yml docker-compose.edge.yml edge server engine kinds studio locales cli agent tools/package.sh | tar -C "$src" -xf -
  echo "$1" > "$src/VERSION"
  bash "$src/tools/package.sh" "$FEED/v$1" >/dev/null
  case "$src" in "$W"/src) rm -rf -- "$src" ;; esac
}
build 0.1.0; build 0.1.1; build 0.1.2
feed() { cat > "$FEED/latest.json" <<JSON
{"tag_name":"v$1","body":"v$1","published_at":"2026-10-22T00:00:00Z","assets":[
 {"name":"gen-chibi-v$1.tar.gz","browser_download_url":"http://127.0.0.1:$FPORT/v$1/gen-chibi-v$1.tar.gz"},
 {"name":"SHA256SUMS","browser_download_url":"http://127.0.0.1:$FPORT/v$1/SHA256SUMS"}]}
JSON
}
feed 0.1.0
python3 -m http.server $FPORT --bind 127.0.0.1 --directory "$FEED" >/dev/null 2>&1 & FPID=$!

# ---------------------------------------------------------------- công cụ giả
# test chạy bằng root thật: setpriv / chown THẬT (hạ quyền thật, đổi chủ thật) — chỉ ghi lại lệnh; user thường: setpriv / chown không làm được → chỉ ghi lại (L-77)
RSETPRIV=""; RCHOWN=""; if [ -n "$REALROOT" ]; then RSETPRIV="$(command -v setpriv || true)"; RCHOWN="$(command -v chown)"; fi
export FAKE_SETPRIV="$RSETPRIV" FAKE_CHOWN="$RCHOWN"
cat > "$FK/id" <<'EOF'
#!/bin/bash
case "$*" in
  -u|-g) if [ -n "${FAKE_NONROOT:-}" ]; then echo 1000; elif [ -n "${FAKE_ROOT:-}" ]; then echo 0; else exec /usr/bin/id "$@"; fi ;;
  -un) if [ -n "${FAKE_ROOT:-}" ]; then echo root; else exec /usr/bin/id "$@"; fi ;;
  "-u tester"|"-g tester") echo 1000 ;;
  "-nu 1000") echo tester ;;
  "-u genchibi") if [ -f "$FAKE_STATE/genchibi" ]; then echo 998; else exit 1; fi ;;
  "-g genchibi") if [ -f "$FAKE_STATE/genchibi" ]; then echo 997; else exit 1; fi ;;
  *) exec /usr/bin/id "$@" ;;
esac
EOF
cat > "$FK/setpriv" <<'EOF'
#!/bin/bash
echo "setpriv $*" >> "$FAKE_STATE/setpriv.log"
[ -z "${FAKE_SETPRIV:-}" ] || exec "$FAKE_SETPRIV" "$@"
while [ $# -gt 0 ] && [ "$1" != -- ]; do shift; done; shift
exec "$@"
EOF
cat > "$FK/chown" <<'EOF'
#!/bin/bash
echo "chown $*" >> "$FAKE_STATE/chown.log"
[ -z "${FAKE_CHOWN:-}" ] || exec "$FAKE_CHOWN" "$@"
exit 0
EOF
cat > "$FK/useradd" <<'EOF'
#!/bin/bash
echo "useradd $*" >> "$FAKE_STATE/useradd.log"; touch "$FAKE_STATE/genchibi"
EOF
# docker giả: compose up = chạy launcher THẬT của thư mục cài (--project-directory) với cổng của --env-file; stop / down = dừng nó; exec / run = chạy node của
# bản cài; config = chỉ loopback. Ghi mọi lệnh + danh sách -f; tệp compose nào có chữ CANARY → tệp canary (compose đã "dùng" tệp container ghi)
cat > "$FK/docker" <<'EOF'
#!/bin/bash
echo "$*" >> "$FAKE_STATE/docker.log"
[ "$1" = compose ] || exit 0
shift
files=""; pd="$PWD"; ef=""
while [ $# -gt 0 ]; do case "$1" in -f) files="$files $2"; shift 2 ;; --project-directory) pd="$2"; shift 2 ;; --env-file) ef="$2"; shift 2 ;; *) break ;; esac; done
sub="${1:-}"; [ $# -eq 0 ] || shift
echo "sub=$sub cwd=$PWD pd=$pd ef=$ef files=$files" >> "$FAKE_STATE/compose.log"
for f in $files; do grep -q CANARY "$f" 2>/dev/null && touch "$FAKE_STATE/canary-compose"; done
port=""; [ -z "$ef" ] || { port="$(sed -n "s/^GC_PORT='\([0-9]*\)'$/\1/p" "$ef")"; cp "$ef" "$FAKE_STATE/last-compose.env"; cp "$ef" "$FAKE_STATE/last-compose-$sub.env"; }
[ -n "$port" ] || port="$(sed -n 's/^GC_PORT=//p' "$pd/.env" | tail -1)"
# như compose: môi trường của container = các khoá của --env-file; container chạy bằng GC_UID:GC_GID (root thật: hạ quyền thật)
cu=""; cg=""
if [ -n "$ef" ]; then while IFS= read -r l; do k="${l%%=*}"; v="${l#*=}"; v="${v#\'}"; v="${v%\'}"; case "$k" in GC_UID) cu="$v" ;; GC_GID) cg="$v" ;; GC_*|HTTPS_PROXY|NO_PROXY) export "$k=$v" ;; esac; done < "$ef"; fi
AS=""; [ -z "${FAKE_SETPRIV:-}" ] || [ -z "$cu" ] || AS="$FAKE_SETPRIV --reuid=$cu --regid=$cg --clear-groups --"
pf="$FAKE_STATE/launcher-$port.pid"
alive() { [ -f "$pf" ] && kill -0 "$(cat "$pf")" 2>/dev/null; }
case "$sub" in
  version) exit 0 ;;
  config) printf '{"services":{"app":{"ports":[{"mode":"ingress","host_ip":"127.0.0.1","target":7480,"published":"%s","protocol":"tcp"}]}}}\n' "$port" ;;
  up) alive || { cd "$pd" || exit 1; GC_HOME="$pd" GC_PORT="$port" nohup $AS node "$pd/launcher.js" < /dev/null >> "$FAKE_STATE/launcher-$port.log" 2>&1 & echo $! > "$pf"; } ;;
  stop|down) if alive; then p="$(cat "$pf")"; kill "$p"; for i in $(seq 1 80); do kill -0 "$p" 2>/dev/null || break; sleep 0.1; done; fi; rm -f "$pf" ;;
  exec|run) while [ $# -gt 0 ] && [ "$1" != app ]; do shift; done; shift; [ "${1:-}" = node ] && shift
    js="$1"; shift; GC_HOME="$pd" GC_PORT="$port" exec $AS node "$pd/${js#/install/}" "$@" ;;
esac
exit 0
EOF
chmod +x "$FK"/*
canaries() { ls "$W" "$FS" 2>/dev/null | grep -c '^canary' || true; }
SHA="$(sha256sum "$FEED/v0.1.0/gen-chibi-v0.1.0.tar.gz" | cut -d' ' -f1)"

# ---------------------------------------------------------------- 1) máy kiểu Ryan
echo "   1) máy kiểu Ryan: bản cài Docker bằng root (sudo) của bản cũ → lệnh root cũ, .env kế thừa, override có service đăng nhập"
I="$W/inst"; H="$W/roothome"; mkdir -p "$I/releases/v0.1.0" "$I/data" "$I/backups" "$I/logs" "$H/.local/bin"
tar -xzf "$FEED/v0.1.0/gen-chibi-v0.1.0.tar.gz" -C "$I/releases/v0.1.0" --strip-components=1
ln -s releases/v0.1.0 "$I/current"; cp "$I/current/launcher.js" "$I/launcher.js"; cp "$I/current/docker-compose.yml" "$I/docker-compose.yml"
TOK="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
cat > "$I/.env" <<EOF
# gen-chibi — generated at install time. Do not share this file.
GC_MODE=docker
GC_PORT=$PORT
GC_BIND=127.0.0.1
GC_MASTER_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
GC_AUTO_UPDATE=1
GC_UID=1001
GC_GID=1001
GC_REPO=colamacbook-ryan/Gen-Chibi
GC_LANG=en
GC_GITHUB_TOKEN=
GC_API_TOKEN=$TOK
GC_ALLOWED_HOSTS=
HTTPS_PROXY=
NO_PROXY=
GC_EXTRA_CA=
EOF
chmod 600 "$I/.env"
printf 'services:\n  login:\n    image: example/login\n' > "$I/docker-compose.override.yml"
own_app "$I"
# lệnh root cũ (≤ v0.23.0): bản chép ở ~/.local/bin, CHUYỂN cho current/cli/genchibi (tệp container ghi được) — đúng hai dòng của bản cũ
cat > "$H/.local/bin/genchibi" <<EOF
#!/usr/bin/env bash
HOME_DIR="\${GC_HOME:-$I}"
case "\$0" in /*) _self="\$0" ;; *) _self="\$(cd "\$(dirname "\$0")" && pwd)/\$(basename "\$0")" ;; esac
INNER="\$HOME_DIR/current/cli/genchibi"
if [ -z "\${GC_CLI_INNER:-}" ] && [ -f "\$INNER" ]; then GC_CLI_INNER=1 GC_HOME="\$HOME_DIR" GC_CLI_SELF="\$_self" exec bash "\$INNER" \${1+"\$@"}; fi
echo "lệnh cũ: không có bản trong" >&2; exit 1
EOF
chmod 755 "$H/.local/bin/genchibi"
G="$H/.local/bin/genchibi"; TD="$H/.local/lib/gen-chibi"
REL="file://$FEED"
rootcli() { # rootcli <đối số…> — như root (sudo) gõ genchibi: id giả = 0, setpriv giả; móc kiểm thử chỉ từ shell này
  OUT="$(env -u GC_LANG -u GC_HOME PATH="$FK:$PATH" HOME="$H" FAKE_ROOT=1 FAKE_STATE="$FS" SUDO_USER= GC_TEST=1 GC_TEST_RELEASE_BASE="$REL" \
    GC_FEED_URL="http://127.0.0.1:$FPORT/latest.json" GC_NO_AUTOCHECK=1 GC_HEALTH_WINDOW_MS=6000 GC_HOSTCHECK_WAIT=2 HTTPS_PROXY= https_proxy= NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
    ${RC_ENV:-} timeout 180 $SID "$G" "$@" </dev/null 2>&1)"; RC=$?
}
health() { curl -fsS -m 3 "http://127.0.0.1:$1/api/health" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'; }
waitver() { local i; for i in $(seq 1 80); do [ "$(health "$1")" = "$2" ] && return 0; sleep 0.5; done; return 1; }

rootcli status
cmp -s "$G" "$TD/genchibi" && grep -qx "TRUST_BAKED=\"$TD\"" "$G" && [ -f "$TD/rel/v0.1.0/docker-compose.yml" ] && [ "$(cat "$TD/rel/v0.1.0/SHA256")" = "$SHA" ] && [ "$(cat "$TD/genchibi.version")" = v0.1.0 ] \
  && echo "$OUT" | grep -q 'Release v0.1.0 verified (SHA-256)' && echo "$OUT" | grep -q 'now runs only verified code' && echo "$OUT" | grep -q 'not running'
check $? "lệnh root cũ gọi current/cli/genchibi lần cuối: bản đó tải + kiểm gói v0.1.0 (SHA-256 khớp SHA256SUMS), lắp ~/.local/lib/gen-chibi/genchibi, THAY lệnh trong PATH bằng bản đã kiểm, chạy tiếp (status)" "rc $RC: $OUT"
[ "$(stat -c %a "$TD" 2>/dev/null || stat -f %Lp "$TD")" = 700 ] && [ -O "$TD/genchibi" ] && [ -O "$TD/rel/v0.1.0/docker-compose.yml" ]
check $? "tệp đã kiểm của root: thư mục 0700 thuộc root (user của container không đọc / ghi được)"
# từ giờ: current/cli/genchibi là tệp container ghi được — root không bao giờ chạy nó nữa
for f in "$I"/releases/*/cli/genchibi; do as_container sh -c 'printf "#!/bin/sh\ntouch %s/canary-cli\n" "$2" > "$1"' sh "$f" "$W"; done
rootcli start
[ $RC = 1 ] && ! grep -q 'sub=up' "$FS/compose.log" 2>/dev/null && [ "$(health $PORT)" = "" ] && echo "$OUT" | grep -q "Stopped before touching any container: $I/docker-compose.override.yml is not approved" \
  && echo "$OUT" | grep -q 'image: example/login' && echo "$OUT" | grep -q 'sudo genchibi override approve' && echo "$OUT" | grep -q 'sudo genchibi override off'
check $? "override đăng nhập (máy Ryan) chưa duyệt → genchibi start (root) DỪNG trước khi đụng container: không compose up, in nội dung override + lý do + 'sudo genchibi override approve' / 'off', thoát 1" "rc $RC: $OUT"
rootcli status; ST="$OUT"; rootcli doctor
echo "$ST" | grep -q "✗ Override not approved: $I/docker-compose.override.yml" && echo "$OUT" | grep -q "✗ $I/docker-compose.override.yml is not approved for root" && [ $RC = 1 ]
check $? "status + doctor (root): override chưa duyệt là ✗ kèm cách làm tiếp; doctor thoát 1" "$ST · $OUT"
rootcli override approve --yes; rootcli start
grep 'sub=up' "$FS/compose.log" | tail -1 | grep -q "cwd=$TD/run pd=$I ef=$TD/run/compose.env files= $TD/rel/v0.1.0/docker-compose.yml $TD/override.yml$" && waitver $PORT 0.1.0 && [ "$(canaries)" = 0 ] \
  && grep -qx "GC_UID='$AUID'" "$FS/last-compose.env" && grep -qx "GC_PORT='$PORT'" "$FS/last-compose.env" && ! grep -q 'GC_UID=.1001' "$FS/last-compose.env"
check $? "override approve --yes rồi genchibi start (root): docker compose -f <tệp đã kiểm của v0.1.0> -f <override đã duyệt> --project-directory <thư mục cài> --env-file <bản đã lọc> trong ~/.local/lib/gen-chibi/run; GC_UID = chủ thư mục cài; không chạy current/cli/genchibi" "rc $RC: $(tail -2 "$FS/compose.log") · $OUT"
grep -q -- "--reuid=$AUID --regid=$AGID --clear-groups -- env -i" "$FS/setpriv.log" && ! grep -q -- '--reuid=0' "$FS/setpriv.log"
check $? "mọi đọc / ghi trong thư mục cài qua setpriv --reuid=<user thư mục cài> (môi trường sạch env -i), không lần nào bằng uid 0" "$(sort -u "$FS/setpriv.log" | head -3)"
rootcli status
[ $RC = 0 ] && echo "$OUT" | grep -q '● running · v0.1.0' && echo "$OUT" | grep -q 'installed: v0.1.0'
check $? "genchibi status (root): đang chạy v0.1.0" "rc $RC: $OUT"

feed 0.1.1
# container sửa override sau khi duyệt (máy kiểu Ryan): update bằng root → DỪNG, container / phiên bản giữ nguyên; duyệt lại → update chạy
( cd "$I" && as_container sh -c 'printf "services:\n  login:\n    image: example/login:2\n" > docker-compose.override.yml' )
LP0="$(cat "$FS/launcher-$PORT.pid")"; NUP="$(grep -c 'sub=up' "$FS/compose.log")"
rootcli update
[ $RC = 1 ] && echo "$OUT" | grep -q 'Stopped before touching any container' && echo "$OUT" | grep -q 'example/login:2' && [ "$(readlink "$I/current")" = releases/v0.1.0 ] \
  && [ "$(grep -c 'sub=up' "$FS/compose.log")" = "$NUP" ] && [ "$(cat "$FS/launcher-$PORT.pid")" = "$LP0" ] && kill -0 "$LP0" && [ "$(health $PORT)" = 0.1.0 ] && ! echo "$OUT" | grep -q 'Checking for a new version'
check $? "override đổi sau khi duyệt → genchibi update (root) DỪNG trước khi đụng gì: không gọi cập nhật, không compose, container (launcher pid $LP0) + v0.1.0 giữ nguyên, thoát 1" "rc $RC · current $(readlink "$I/current") · up $NUP→$(grep -c 'sub=up' "$FS/compose.log") · pid $LP0→$(cat "$FS/launcher-$PORT.pid") · health $(health $PORT)"
rootcli override approve --yes
rootcli update
waitver $PORT 0.1.1 && [ -f "$TD/rel/v0.1.1/docker-compose.yml" ] && [ "$(cat "$TD/genchibi.version")" = v0.1.1 ] && echo "$OUT" | grep -q 'Release v0.1.1 verified' && [ "$(readlink "$I/current")" = releases/v0.1.1 ] && [ "$(canaries)" = 0 ]
check $? "genchibi update (root): app tự tải v0.1.1 (launcher + updater thật), root tự tải + kiểm gói v0.1.1 (không dùng releases/ container vừa ghi), lệnh root tiến lên v0.1.1" "rc $RC · lệnh root $(cat "$TD/genchibi.version") · rel $(ls "$TD/rel" | tr '\n' ' ') · current $(readlink "$I/current") · canary $(canaries) $(ls "$W" "$FS" | grep canary | tr '\n' ' ') · $OUT"
for f in "$I"/releases/*/cli/genchibi; do as_container sh -c 'printf "#!/bin/sh\ntouch %s/canary-cli\n" "$2" > "$1"' sh "$f" "$W"; done
rootcli rollback --yes
waitver $PORT 0.1.0 && [ "$(readlink "$I/current")" = releases/v0.1.0 ] && [ "$(cat "$TD/genchibi.version")" = v0.1.1 ] && grep 'sub=up' "$FS/compose.log" | tail -1 | grep -q "files= $TD/rel/v0.1.0/docker-compose.yml$\|sub=up" && [ "$(canaries)" = 0 ]
check $? "genchibi rollback --yes (root): app chạy lại v0.1.0, root dùng tệp compose đã kiểm của v0.1.0; lệnh root KHÔNG lùi (vẫn bản v0.1.1)" "rc $RC: $OUT · $(cat "$TD/genchibi.version")"
rootcli rollback
[ $RC = 1 ] && echo "$OUT" | grep -q 'genchibi rollback --yes' && [ "$(readlink "$I/current")" = releases/v0.1.0 ]
check $? "genchibi rollback không terminal, không --yes → không làm gì, thoát 1" "rc $RC: $OUT"
# container (bị chiếm) tự đổi current sang bản nó tự ghi; bản phát hành tương ứng không kiểm được (SHA256SUMS không khớp) → root giữ tệp đã kiểm
( cd "$I" && as_container sh -c 'mkdir -p releases/v0.1.2 && tar -xzf "$1" -C releases/v0.1.2 --strip-components=1 && printf "services:\n  app:\n    image: CANARY\n" > releases/v0.1.2/docker-compose.yml && rm -f current && ln -s releases/v0.1.2 current' sh "$FEED/v0.1.2/gen-chibi-v0.1.2.tar.gz" )
cp "$FEED/v0.1.2/SHA256SUMS" "$W/sums.good"; printf '%s  gen-chibi-v0.1.2.tar.gz\n' "$(printf 'x' | sha256sum | cut -d' ' -f1)" > "$FEED/v0.1.2/SHA256SUMS"
rootcli status
[ ! -e "$TD/rel/v0.1.2" ] && [ "$(cat "$TD/genchibi.version")" = v0.1.1 ] && echo "$OUT" | grep -q 'Could not verify release v0.1.2 (sha256)' && echo "$OUT" | grep -q 'verified files of v0.1.1'
check $? "current trỏ v0.1.2 mà gói phát hành không khớp SHA256SUMS → root KHÔNG nhận (không rel/v0.1.2, lệnh root giữ v0.1.1), dùng tệp đã kiểm mới nhất, báo rõ" "rc $RC: $OUT"
rootcli restart
grep 'sub=up' "$FS/compose.log" | tail -1 | grep -q "files= $TD/rel/v0.1.1/docker-compose.yml $TD/override.yml$" && [ ! -e "$FS/canary-compose" ]
check $? "…genchibi restart lúc đó: compose chỉ nhận tệp đã kiểm (v0.1.1), không bao giờ releases/v0.1.2/docker-compose.yml của container" "$(tail -1 "$FS/compose.log")"
cp "$W/sums.good" "$FEED/v0.1.2/SHA256SUMS"; ( cd "$I" && as_container sh -c 'rm -f current && ln -s releases/v0.1.0 current' )
rootcli online
[ $RC = 0 ] && echo "$OUT" | grep -qi 'online' && [ "$(canaries)" = 0 ]
check $? "genchibi online (trạng thái, root): app trả lời qua API, không canary" "rc $RC: $(echo "$OUT" | head -5)"
rootcli online off
[ $RC = 0 ] && [ "$(canaries)" = 0 ]
check $? "genchibi online off (root): xong, không canary" "rc $RC: $(echo "$OUT" | tail -4)"

# ---------------------------------------------------------------- 2) container bị chiếm
echo "   2) container bị chiếm: tệp root từng chạy / nạp nay đều do user của container ghi → root không chạy gì (canary)"
mkdir -p "$W/evilbin"
for c in docker curl tar sed awk cat sh bash node setpriv sudo mv cp mkdir chmod; do printf '#!/bin/sh\ntouch %s/canary-path-%s\n' "$W" "$c" > "$W/evilbin/$c"; done; chmod +x "$W/evilbin"/*
printf 'touch %s/canary-bashenv\n' "$W" > "$W/evil.sh"
cp "$I/.env" "$W/env.good"
( cd "$I" && as_container sh -c 'cat >> .env' ) <<EOF
GC_LANG=\$(touch $W/canary-env1)
GC_PUBLIC_URL=\`touch $W/canary-env2\`
PATH=$W/evilbin
BASH_ENV=$W/evil.sh
export DOCKER_HOST=unix:///tmp/evil.sock
GC_UID=0
GC_GID=0
LD_PRELOAD=$W/evil.so
GC_DOCKER_VIA=sg
GC_API_TOKEN=
output = $W/canary-curl
EOF
( cd "$I" && as_container sh -c 'printf "services:\n  app:\n    image: CANARY\n    volumes: [\"/:/host\"]\n" > docker-compose.override.yml; printf "CANARY\n" >> docker-compose.yml; printf "x\"\noutput = %s/canary-curl2\n" "$1" > data/owner-token' sh "$W" )
NUP="$(grep -c 'sub=up' "$FS/compose.log")"
for cmd in start restart "lang en" "online off" "update" "rollback --yes"; do rootcli $cmd; echo "$cmd → $RC" >> "$W/evil-gate.log"; [ $RC = 1 ] && echo "$OUT" | grep -q 'Stopped before touching any container' || echo "KHÔNG DỪNG: $cmd" >> "$W/evil-gate.log"; done
! grep -q 'KHÔNG DỪNG' "$W/evil-gate.log" && [ "$(grep -c 'sub=up' "$FS/compose.log")" = "$NUP" ] && [ "$(canaries)" = 0 ]
check $? "override độc (mount / + CANARY) khác bản đã duyệt → start / restart / lang / online off / update / rollback đều DỪNG (thoát 1), không compose up, không canary" "$(cat "$W/evil-gate.log" | tr '\n' ' ')"
rootcli override off --yes   # root chọn chạy KHÔNG có override độc (ghi SHA của nó) → các lệnh còn lại chạy thật với .env độc
for cmd in status start restart backup "lang en" "setup hint" doctor "online" "agent connect"; do rootcli $cmd; echo "$cmd → $RC" >> "$W/evil-runs.log"; done
[ "$(canaries)" = 0 ] && [ ! -e "$FS/canary-compose" ]
check $? "status / start / restart / backup / lang / setup hint / doctor / online / agent connect bằng root với .env có \$(…), \`…\`, PATH, BASH_ENV, LD_PRELOAD, chèn cấu hình curl; current/ + releases/*/cli/genchibi, override, docker-compose.yml, owner-token đều độc → KHÔNG một tệp canary nào" "$(ls "$W" "$FS" | grep canary | tr '\n' ' ') · $(cat "$W/evil-runs.log" | tr '\n' ' ')"
! grep -E 'sub=(up|config|stop)' "$FS/compose.log" | grep -vq "files= $TD/rel/v0\.1\.[01]/docker-compose.yml\( $TD/override.yml\)\{0,1\}$" && grep 'sub=up' "$FS/compose.log" | tail -1 | grep -q "docker-compose.yml$" && grep -qx "GC_UID='$AUID'" "$FS/last-compose.env" && ! grep -q "GC_UID='0'" "$FS/last-compose.env" && ! grep -q DOCKER_HOST "$FS/last-compose.env" && ! grep -q PATH "$FS/last-compose.env" && ! grep -q '^\[sg\]' "$FS/docker.log"
check $? "compose chỉ nhận tệp đã kiểm (không override / docker-compose.yml của thư mục cài); .env GC_UID=0 không làm container chạy root (GC_UID = chủ thư mục cài); DOCKER_HOST / PATH / GC_DOCKER_VIA của .env không tới docker" "$(grep -E 'sub=(up|config|stop)' "$FS/compose.log" | tail -2) · $(cat "$FS/last-compose.env" | cut -c1-40 | tr '\n' ' ')"
grep -q "GC_LANG='\$(touch $W/canary-env1)'" "$FS/last-compose.env" || grep -q "GC_LANG='en'" "$FS/last-compose.env"
check $? ".env là dữ liệu: giá trị \$(…) đi nguyên văn trong nháy đơn (compose không mở rộng), không bao giờ được chạy" "$(grep GC_LANG "$FS/last-compose.env")"
( cd "$I" && as_container sh -c 'printf "GC_MODE=native\n" >> .env' ); rootcli start
[ $RC = 1 ] && echo "$OUT" | grep -q 'runs in Node mode as uid' && [ "$(canaries)" = 0 ]
check $? ".env đổi GC_MODE=native (root sẽ phải chạy node launcher.js của user đó) → root từ chối, thoát 1" "rc $RC: $OUT"
( cd "$I" && as_container sh -c 'cat > .env' ) < "$W/env.good"

# ---------------------------------------------------------------- 3) override
echo "   3) override của chủ: chưa quyết → dừng · approve · đổi → dừng · off"
( cd "$I" && as_container sh -c 'printf "services:\n  login:\n    image: example/login\n" > docker-compose.override.yml' )
rootcli start
[ $RC = 1 ] && echo "$OUT" | grep -q 'Stopped before touching any container'
check $? "override mới (khác bản đã chọn off) → start dừng lại (off chỉ áp cho đúng nội dung đã chọn)" "rc $RC: $OUT"
rootcli override approve
[ $RC = 1 ] && [ ! -e "$TD/override.yml" ] && echo "$OUT" | grep -q 'image: example/login'
check $? "override approve không terminal, không --yes → hiện nội dung, không duyệt (không tự duyệt)" "rc $RC: $OUT"
rootcli override approve --yes
[ $RC = 0 ] && [ -f "$TD/override.yml" ] && [ -O "$TD/override.yml" ] && [ ! -e "$TD/override.off" ] && rootcli start && grep 'sub=up' "$FS/compose.log" | tail -1 | grep -q "docker-compose.yml $TD/override.yml$"
check $? "override approve --yes → chép thành ~/.local/lib/gen-chibi/override.yml (của root); start ghép -f <đã kiểm> -f <override đã duyệt>" "$(tail -1 "$FS/compose.log")"
( cd "$I" && as_container sh -c 'printf "services:\n  login:\n    image: CANARY\n" > docker-compose.override.yml' ); rootcli override; ST="$OUT"; SR=$RC; NUP="$(grep -c 'sub=up' "$FS/compose.log")"; rootcli start
[ $SR = 1 ] && echo "$ST" | grep -q 'not approved for root (or changed since)' && [ $RC = 1 ] && [ "$(grep -c 'sub=up' "$FS/compose.log")" = "$NUP" ] && [ ! -e "$FS/canary-compose" ] && grep -q example/login "$TD/override.yml"
check $? "container sửa override sau khi duyệt → override status ✗ (thoát 1), start DỪNG (không compose up), bản đã duyệt giữ nguyên" "$ST · $OUT"
rootcli override off
[ $RC = 1 ] && [ -f "$TD/override.yml" ]
check $? "override off không terminal, không --yes → không đổi gì" "rc $RC: $OUT"
rootcli override off --yes; rootcli start
[ ! -e "$TD/override.yml" ] && [ -s "$TD/override.off" ] && grep 'sub=up' "$FS/compose.log" | tail -1 | grep -q "files= $TD/rel/v0.1.0/docker-compose.yml$"
check $? "override off --yes → root chạy KHÔNG có override (ghi SHA của nó), start không ghép override" "$(tail -1 "$FS/compose.log")"
( cd "$I" && as_container sh -c 'printf "services:\n  login:\n    image: CANARY2\n" > docker-compose.override.yml' ); rootcli start
[ $RC = 1 ] && echo "$OUT" | grep -q 'image: CANARY2'
check $? "…override đổi tiếp sau khi chọn off → lại dừng, hỏi lại" "rc $RC: $OUT"
( cd "$I" && as_container rm -f docker-compose.override.yml ); rootcli start
[ $RC = 0 ]
check $? "không còn override → start chạy bình thường" "rc $RC: $OUT"

# thư mục tệp đã kiểm của root mà user khác đổi tên / tráo được (cha ghi được bởi mọi người) → từ chối chạy, không tạo / dùng gì trong đó
H2="$W/badhome"; mkdir -p "$H2/.local/lib"; chmod 777 "$H2/.local/lib"
OUT="$(env -u GC_LANG PATH="$FK:$PATH" HOME="$H2" GC_HOME="$I" FAKE_ROOT=1 FAKE_STATE="$FS" timeout 60 $SID bash "$ROOT/cli/genchibi" status </dev/null 2>&1)"; RC=$?
[ $RC = 1 ] && echo "$OUT" | grep -q 'Refusing to run as root' && [ ! -e "$H2/.local/lib/gen-chibi/rel/v0.1.0" ]
check $? "~/.local/lib ghi được bởi người khác (tráo được thư mục tệp đã kiểm) → root từ chối chạy, thoát 1" "rc $RC: $OUT"

# ---------------------------------------------------------------- 4) khôi phục: dấu máy (CNS-235)
echo "   4) khôi phục sao lưu: cùng máy giữ install-id, máy khác install-id mới (CLI + server thật)"
waitver $PORT 0.1.0 >/dev/null
IID="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
( cd "$I" && as_container sh -c 'printf "%s\n" "$1" > data/install-id' sh "$IID" ); rootcli restart; waitver $PORT 0.1.0 >/dev/null; sleep 1
[ -f "$I/data/install-id.machine" ] && [ -s "$I/run/machine-id" ]
check $? "server lúc khởi động ghi dấu máy cho install-id có sẵn (data/install-id.machine; run/machine-id, run/host-id ngoài data/)" "$(ls "$I/data" "$I/run" | tr '\n' ' ')"
rootcli backup; BK="$(echo "$OUT" | sed -n 's/^Backed up: //p')"
[ -n "$BK" ] && tar -tzf "$BK" | grep -q 'data/install-id.machine' && ! tar -tzf "$BK" | grep -q 'run/'
check $? "bản sao lưu mang data/install-id.machine, không mang run/ (dấu máy ở lại máy)" "$OUT"
printf 'yes\n' > "$W/yes"
restore_as_root() { OUT="$(env -u GC_LANG PATH="$FK:$PATH" HOME="$H" FAKE_ROOT=1 FAKE_STATE="$FS" GC_TEST=1 GC_TEST_RELEASE_BASE="$REL" GC_FEED_URL="http://127.0.0.1:$FPORT/latest.json" GC_NO_AUTOCHECK=1 GC_HOSTCHECK_WAIT=2 NO_PROXY=127.0.0.1,localhost timeout 180 $SID "$G" restore "$1" < "$W/yes" 2>&1)"; RC=$?; }
restore_as_root "$BK"; waitver $PORT 0.1.0 >/dev/null; for i in $(seq 1 20); do [ -e "$I/data/restore-pending.json" ] || break; sleep 0.5; done
[ $RC = 0 ] && [ ! -e "$I/data/restore-pending.json" ] && [ "$(tr -d '\n' < "$I/data/install-id" 2>/dev/null)" = "$IID" ] && grep -q 'same machine: install id kept' "$FS/launcher-$PORT.log"
check $? "genchibi restore (root) trên CHÍNH máy này → server giữ install-id (Go offline còn dọn được tunnel / DNS của máy mình)" "rc $RC: $(tail -3 "$FS/launcher-$PORT.log") · $OUT"
( cd "$I" && as_container sh -c 'head -c 16 /dev/urandom | od -An -tx1 | tr -d " \n" > run/machine-id' )   # = bản sao lưu đặt lên máy khác
restore_as_root "$BK"; waitver $PORT 0.1.0 >/dev/null; for i in $(seq 1 20); do [ -e "$I/data/restore-pending.json" ] || break; sleep 0.5; done
[ $RC = 0 ] && [ ! -e "$I/data/install-id" ] && grep -q 'new install id' "$FS/launcher-$PORT.log"
check $? "…cùng bản sao lưu trên máy khác (run/machine-id khác) → install-id mới (không giành tunnel của máy gốc)" "rc $RC: $(tail -3 "$FS/launcher-$PORT.log")"
stop_launchers

# ---------------------------------------------------------------- 5) doctor
echo "   5) genchibi doctor (CNS-234): bản cài root cũ GC_UID=1000 → tài khoản hệ thống genchibi"
D="$W/dinst"; mkdir -p "$D/releases/v0.1.0" "$D/data"
tar -xzf "$FEED/v0.1.0/gen-chibi-v0.1.0.tar.gz" -C "$D/releases/v0.1.0" --strip-components=1; ln -s releases/v0.1.0 "$D/current"; cp "$D/current/launcher.js" "$D/launcher.js"
printf 'GC_MODE=docker\nGC_PORT=%s\nGC_BIND=127.0.0.1\nGC_MASTER_KEY=%s\nGC_UID=1000\nGC_GID=1000\nGC_LANG=en\nGC_API_TOKEN=%s\n' "$DPORT" "$TOK" "$TOK" > "$D/.env"; chmod 600 "$D/.env"
own_app "$D"
docli() { OUT="$(env -u GC_LANG PATH="$FK:$PATH" HOME="$H" GC_HOME="$D" FAKE_STATE="$FS" GC_TEST=1 GC_TEST_RELEASE_BASE="$REL" GC_NO_AUTOCHECK=1 GC_HOSTCHECK_WAIT=2 NO_PROXY=127.0.0.1,localhost ${DO_ENV:-} timeout 180 $SID "$TD/genchibi" doctor "$@" </dev/null 2>&1)"; RC=$?; }
rm -f "$FS/useradd.log" "$FS/chown.log" "$FS/genchibi"; cp "$D/.env" "$W/denv.before"
DO_ENV="FAKE_ROOT=1 SUDO_USER=" docli
echo "$OUT" | grep -q 'guessed by an old root install' && echo "$OUT" | grep -q 'Not moved' && [ ! -e "$FS/useradd.log" ] && [ ! -e "$FS/chown.log" ] && cmp -s "$D/.env" "$W/denv.before"
check $? "doctor (root, không terminal, không --yes): báo container chạy bằng uid 1000 do bản cài root cũ đoán, KHÔNG đổi gì (không useradd / chown, .env nguyên)" "rc $RC: $OUT"
DO_ENV="FAKE_NONROOT=1 SUDO_USER=" docli
echo "$OUT" | grep -q 'guessed by an old root install' && echo "$OUT" | grep -q 'Run as root to move' && [ ! -e "$FS/useradd.log" ]
check $? "doctor bằng user thường: chỉ báo + 'Run as root to move…'" "rc $RC: $OUT"
DO_ENV="FAKE_ROOT=1 SUDO_USER=" docli --yes
grep -q '^useradd --system --no-create-home --home-dir /nonexistent --shell [^ ]*nologin --user-group genchibi$' "$FS/useradd.log" && grep -q "^chown -h 998:997 $D" "$FS/chown.log" && grep -q "^chown -h 998:997 .*$D/.env" "$FS/chown.log" \
  && grep -qx 'GC_UID=998' "$D/.env" && grep -qx 'GC_GID=997' "$D/.env" && grep -qx 'GC_INSTALLED_BY=root' "$D/.env" && grep -qx 'GC_MASTER_KEY=.*' "$D/.env" && echo "$OUT" | grep -q "Moved: files of uid $AUID now belong to genchibi (998:997)" \
  && grep 'sub=up' "$FS/compose.log" | tail -1 | grep -q "pd=$D " && grep -qx "GC_UID='998'" "$FS/last-compose-up.env"
check $? "doctor --yes (root): tạo tài khoản genchibi (useradd --system, nologin), đổi chủ CHỈ tệp đang thuộc uid cũ (find -user … chown -h, không theo symlink), .env GC_UID/GC_GID=998/997 + GC_INSTALLED_BY=root, chạy lại (compose user 998)" "rc $RC · useradd: $(cat "$FS/useradd.log" 2>&1) · .env: $(grep -E '^GC_(UID|GID|INSTALLED_BY|MASTER_KEY)=' "$D/.env" | cut -c1-24 | tr '\n' ' ') · up: $(grep 'sub=up' "$FS/compose.log" | tail -1 | cut -c1-200) · env: $(grep GC_UID "$FS/last-compose-up.env") · $(head -c 200 "$FS/chown.log")"
stop_launchers
printf 'GC_MODE=docker\nGC_PORT=%s\nGC_UID=1000\nGC_GID=1000\nGC_INSTALLED_BY=sudo:tester\nGC_BIND=0.0.0.0\nGC_LANG=en\n' "$DPORT" > "$D/.env"; own_app "$D"; rm -f "$FS/useradd.log"
printf '{"tunnel":"token","online":true,"running":false,"ready":false,"error":"token-missing"}\n' > "$D/run/edge-status.json" 2>/dev/null || { mkdir -p "$D/run"; printf '{"tunnel":"token","online":true,"running":false,"ready":false,"error":"token-missing"}\n' > "$D/run/edge-status.json"; }
rm -f "$D/data/owner-token"; own_app "$D"
DO_ENV="FAKE_ROOT=1 SUDO_USER=tester" docli
[ $RC = 1 ] && ! echo "$OUT" | grep -q 'guessed by an old root install' && echo "$OUT" | grep -q 'installed by sudo:tester' && echo "$OUT" | grep -q '✗ Refusing to start: GC_BIND=0.0.0.0' && echo "$OUT" | grep -q '✗ Tunnel (token) is not connected: token-missing' && [ ! -e "$FS/useradd.log" ]
check $? "doctor: GC_INSTALLED_BY=sudo:tester (uid 1000 = người cài) → không đề nghị chuyển; báo sức khoẻ khác (GC_BIND mở mà không token ✗, tunnel chưa nối ✗), thoát 1" "rc $RC: $OUT"
DO_ENV="FAKE_ROOT=1 SUDO_USER= GC_LANG=vi" docli
echo "$OUT" | grep -q 'Có 2 vấn đề' && echo "$OUT" | grep -q 'Thiết lập lần đầu'
check $? "doctor nói tiếng Việt (GC_LANG=vi)" "$OUT"
# trình cài (root, không sudo) chạy lại trên bản cài cũ GC_UID=1000 chưa ghi ai cài → giữ (không đoán), nhắc genchibi doctor, ghi GC_INSTALLED_BY=root
L="$W/linst"; LH="$W/lhome"; mkdir -p "$L/run" "$LH"; printf 'GC_MODE=docker\nGC_PORT=%s\nGC_MASTER_KEY=%s\nGC_UID=1000\nGC_GID=1000\nGC_LANG=en\nGC_API_TOKEN=%s\nGC_TEST_X=1\n' "$DPORT" "$TOK" "$TOK" > "$L/.env"
own_app "$L"
# user của container cài sẵn symlink ở mọi tên tệp tạm mà trình cài (root) sẽ ghi → tệp đích (của root khi test chạy bằng root thật) phải nguyên
printf 'ROOT-TARGET\n' > "$W/root-target"; chmod 644 "$W/root-target"
( cd "$L" && for t in .env.gc-tmp launcher.js.gc-tmp docker-compose.yml.gc-tmp run/machine-id.gc-tmp; do as_container ln -s "$W/root-target" "$t"; done )
: > "$FS/setpriv.log"
IOUT="$(env -u GC_LANG PATH="$FK:$PATH" HOME="$LH" FAKE_ROOT=1 FAKE_STATE="$FS" SUDO_USER= GC_TEST=1 GC_TARBALL="$FEED/v0.1.0/gen-chibi-v0.1.0.tar.gz" GC_NO_AUTOCHECK=1 GC_HOSTCHECK_WAIT=2 NO_PROXY=127.0.0.1,localhost \
  timeout 300 $SID bash "$ROOT/install.sh" --docker --dir "$L" --port "$DPORT" </dev/null 2>&1)"; IRC=$?
stop_launchers
grep -qx 'GC_UID=1000' "$L/.env" && grep -qx 'GC_INSTALLED_BY=root' "$L/.env" && echo "$IOUT" | grep -q 'keeps GC_UID=1000 from an old root install' && echo "$IOUT" | grep -q 'genchibi doctor' \
  && [ -f "$LH/.local/lib/gen-chibi/rel/v0.1.0/docker-compose.yml" ] && cmp -s "$LH/.local/bin/genchibi" "$LH/.local/lib/gen-chibi/genchibi" && [ "$(cat "$LH/.local/lib/gen-chibi/repo")" = colamacbook-ryan/Gen-Chibi ] && [ -s "$L/run/machine-id" ]
check $? "trình cài (root, không sudo) trên bản cài cũ GC_UID=1000: giữ uid (không đoán), nhắc genchibi doctor, ghi GC_INSTALLED_BY=root; lắp tệp đã kiểm của root từ gói ở thư mục tạm (rel/, lệnh, repo); tạo run/machine-id" "rc $IRC: $(echo "$IOUT" | tail -6)"
[ $IRC = 0 ] && [ "$(cat "$W/root-target")" = ROOT-TARGET ] && [ ! -L "$L/.env" ] && [ ! -e "$L/.env.gc-tmp" ] && ! grep -q GC_TEST "$L/.env" && [ -f "$L/launcher.js" ] && [ ! -L "$L/launcher.js" ] \
  && grep -q -- "--reuid=$AUID --regid=$AGID --clear-groups -- env -i" "$FS/setpriv.log"
check $? "trình cài (root) trên thư mục cài có sẵn của user khác: .env.gc-tmp / launcher.js.gc-tmp / docker-compose.yml.gc-tmp / run/machine-id.gc-tmp cài sẵn là symlink → tệp đích NGUYÊN (đọc / ghi bằng chủ thư mục qua setpriv, xoá tệp tạm cài sẵn trước khi ghi)" "rc $IRC · đích: $(cat "$W/root-target") · $(ls -la "$L" | head -12 | tr '\n' ' ')"

# ---------------------------------------------------------------- 6) root thật
if [ -n "$REALROOT" ] && command -v setpriv >/dev/null 2>&1; then
  echo "   6) root thật: setpriv thật — root không đọc / ghi xuyên symlink user của thư mục cài đặt"
  FK2="$W/fake2"; mkdir -p "$FK2"; cp "$FK/docker" "$FK2/docker"
  R6="$W/rinst"; RH="$W/rhome"; mkdir -p "$R6/releases" "$R6/data" "$R6/run" "$RH/.local/lib/gen-chibi/rel"
  cp -R "$I/releases/v0.1.0" "$R6/releases/"; ln -s releases/v0.1.0 "$R6/current"; cp -R "$TD/rel/v0.1.0" "$RH/.local/lib/gen-chibi/rel/"; chmod 700 "$RH/.local/lib/gen-chibi"
  sed -e "s#__GC_HOME__#$R6#" -e "s#__GC_TRUST__#$RH/.local/lib/gen-chibi#" "$ROOT/cli/genchibi" > "$RH/genchibi"; chmod 755 "$RH/genchibi"
  printf 'GC_MODE=docker\nGC_PORT=%s\nGC_LANG=en\n' "$DPORT" > "$W/root-secret.env"; chmod 600 "$W/root-secret.env"; cp "$W/root-secret.env" "$W/root-secret.orig"
  printf 'ROOT-ONLY\n' > "$W/root-file"; chmod 644 "$W/root-file"
  ln -s "$W/root-secret.env" "$R6/.env"; ln -s "$W/root-file" "$R6/run/cli-path.gc-tmp"; ln -s "$W/root-file" "$R6/data/owner-token"
  chown -hR nobody:"$(id -gn nobody)" "$R6"; chmod 755 "$W"
  r6() { OUT="$(env -u GC_LANG PATH="$FK2:$PATH" HOME="$RH" FAKE_STATE="$FS" NO_PROXY=127.0.0.1,localhost timeout 120 $SID "$RH/genchibi" "$@" </dev/null 2>&1)"; RC=$?; }
  r6 lang vi; r6 agent connect; r6 backup
  cmp -s "$W/root-secret.env" "$W/root-secret.orig" && [ "$(cat "$W/root-file")" = ROOT-ONLY ] && [ -f "$R6/.env" ] && [ ! -L "$R6/.env" ] && [ "$(stat -c %u "$R6/.env")" = "$(id -u nobody)" ] && grep -qx 'GC_LANG=vi' "$R6/.env" \
    && [ "$(stat -c %u "$(ls "$R6"/backups/thu-cong-*.tar.gz | head -1)")" = "$(id -u nobody)" ] && ! grep -rq ROOT-ONLY "$R6/run" 2>/dev/null
  check $? "root thật: .env → symlink sang tệp 0600 của root: root không đọc được qua nó (setpriv nobody), lang vi ghi .env MỚI thuộc nobody (symlink thay, tệp của root nguyên); run/cli-path.gc-tmp → tệp của root: không ghi xuyên; bản sao lưu thuộc nobody" "rc $RC: $OUT · $(ls -l "$R6" | head -8)"
else
  echo "   · 6) bỏ qua: cần root thật + setpriv (máy này: uid $(id -u))"
fi

echo "   Kết quả mô hình root: $PASS đạt, $FAIL trượt"
[ "$FAIL" = 0 ]
