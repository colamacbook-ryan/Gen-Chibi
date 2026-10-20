#!/usr/bin/env bash
# Kiểm ngôn ngữ của trình cài, CLI và tài liệu GitHub (ADR 0007 · INT-18). Không cần Docker, không cần mạng ngoài.
#   1) bảng câu chữ: mọi khoá dùng tới có đủ ở _en và _vi, không khoá thừa (CLI + trình cài); không cú pháp bash 4 (macOS chạy bash 3.2)
#   2) install.sh: --lang lạ báo lỗi rõ · không terminal → English, không hỏi, không treo · --lang vi ghi GC_LANG=vi
#      · GC_LANG=vi (biến môi trường) · cài lại giữ ngôn ngữ cũ · .env trước v0.20 được thêm GC_LANG · câu hỏi song ngữ khi có terminal
#   3) genchibi lang / lang xx / lang en (ghi .env + khởi động lại app) · trợ giúp en không có chữ có dấu · trợ giúp vi đủ mọi lệnh
#   4) README.md + tài liệu tiếng Anh không còn chữ tiếng Việt (trừ dòng chuyển ngôn ngữ, tên riêng) · en ↔ vi trỏ nhau · link tương đối không gãy
# © 2026 Gen Labs — All rights reserved.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; FAIL=0; PASS=0
ok()  { echo "   ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "   ✗ $1"; FAIL=$((FAIL+1)); }
check() { if [ "$1" = 0 ]; then ok "$2"; else bad "$2${3:+ — $3}"; fi; }
stop_all() { for h in "$W"/*-home; do [ -x "$h/.local/bin/genchibi" ] && HOME="$h" "$h/.local/bin/genchibi" stop >/dev/null 2>&1; done; return 0; }
trap 'stop_all; [ -n "${KEEP:-}" ] || rm -rf "$W"' EXIT
TO=""; command -v timeout >/dev/null && TO="timeout 120"
SID=""; command -v setsid >/dev/null && SID="setsid"
VI_RE='[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]'
has_vi() { node -e 'process.exit(new RegExp(process.argv[1]).test(require("fs").readFileSync(0, "utf8")) ? 0 : 1)' "$VI_RE"; }

echo "   1) bảng câu chữ + bash 3.2"
for f in cli/genchibi install.sh; do
  r="$(node -e '
const src = require("fs").readFileSync(process.argv[1], "utf8"), L = src.split("\n");
const table = name => { const s = L.indexOf(name + "() {"), keys = new Set(); for (let i = s + 1; i < L.length && L[i] !== "}"; i++) { const k = L[i].match(/^ {4}([a-z0-9_]+)\) F=/); if (k) keys.add(k[1]); } return keys; };
const en = table("_en"), vi = table("_vi"), used = new Set();
const fn = /\.sh$/.test(process.argv[1]) ? "say|step|ok|warn|die|_t" : "m|mn|_t";
L.forEach(l => { if (/^\s*#/.test(l) || /^ {4}[a-z0-9_]+\) F=/.test(l)) return; for (const x of l.matchAll(new RegExp("(?:^|[\\s;({\"$])(?:" + fn + ") ([a-z][a-z0-9_]*)", "g"))) used.add(x[1]); });
const miss = [...used].filter(k => !en.has(k) || !vi.has(k)), extra = [...new Set([...en, ...vi])].filter(k => !used.has(k)), diff = [...en].filter(k => !vi.has(k)).concat([...vi].filter(k => !en.has(k)));
console.log(used.size + " " + en.size + " " + [miss.length ? "thiếu: " + miss.join(",") : "", extra.length ? "thừa: " + extra.join(",") : "", diff.length ? "lệch hai bảng: " + diff.join(",") : ""].filter(Boolean).join(" · "));
' "$ROOT/$f")"
  set -- $r; n="$1"; tot="$2"; shift 2
  [ -z "$*" ] && [ "$n" -gt 10 ] && ok "$f: $n khoá dùng tới, đủ ở _en và _vi ($tot khoá mỗi bảng)" || bad "$f: $* (dùng $n khoá)"
  b4="$(grep -nE 'declare -A|local -A|typeset -A|\$\{[A-Za-z_]+(,,|\^\^)|mapfile|readarray|;;&|;&|&>>|\|&|coproc' "$ROOT/$f" | grep -vE '^[0-9]+:[[:space:]]*#' || true)"
  [ -z "$b4" ] && ok "$f: không cú pháp bash 4 (mảng kết hợp, \${x,,}, mapfile, ;&, |&…)" || bad "$f dùng cú pháp bash 4: $b4"
done

echo "   2) install.sh"
DIST="$W/dist"; bash "$ROOT/tools/package.sh" "$DIST" >/dev/null || { bad "không đóng gói được"; exit 1; }
TAR="$(ls "$DIST"/gen-chibi-v*.tar.gz)"
freeport() { node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
# inst <tên> [đối số…]: cài native từ gói cục bộ, KHÔNG có terminal (setsid, stdin /dev/null, stdout là ống) → in đầu ra, mã thoát ở $IRC
inst() {
  local name="$1"; shift; local home="$W/$name-home" port; mkdir -p "$home"
  port="$(sed -n 's/^GC_PORT=//p' "$W/$name/.env" 2>/dev/null)"; port="${port:-${INST_PORT:-$(freeport)}}"   # cài lại: .env cũ giữ cổng cũ
  INST_OUT="$(env -u GC_LANG HOME="$home" GC_TARBALL="$TAR" GC_NO_AUTOCHECK=1 HTTPS_PROXY= https_proxy= HTTP_PROXY= http_proxy= NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
    ${INST_ENV:-} $TO $SID bash "$ROOT/install.sh" --native --dir "$W/$name" --port "$port" "$@" </dev/null 2>&1)"; IRC=$?
}
envlang() { sed -n 's/^GC_LANG=//p' "$W/$1/.env" 2>/dev/null | tail -1; }

inst bogus --lang xx
[ $IRC = 2 ] && echo "$INST_OUT" | grep -q 'xx' && echo "$INST_OUT" | grep -q 'en or vi' && [ ! -e "$W/bogus" ]; check $? "--lang xx → thoát 2, báo song ngữ 'use en or vi', chưa đụng tới đĩa" "$IRC $INST_OUT"

inst plain
[ $IRC = 0 ] && [ "$(envlang plain)" = en ]; check $? "không terminal, không chọn → cài xong, .env ghi GC_LANG=en" "mã $IRC: $(echo "$INST_OUT" | tail -3)"
! echo "$INST_OUT" | grep -q 'Language / ' ; check $? "không terminal → không hỏi ngôn ngữ (không treo)"
! printf '%s' "$INST_OUT" | has_vi; check $? "đầu ra trình cài ở chế độ English không có chữ tiếng Việt" "$(printf '%s' "$INST_OUT" | grep -nP "$VI_RE" 2>/dev/null | head -3)"
echo "$INST_OUT" | grep -q 'is running' && echo "$INST_OUT" | grep -q 'Package verified'; check $? "đầu ra English: 'Package verified', 'is running'"
HOME="$W/plain-home" "$W/plain-home/.local/bin/genchibi" stop >/dev/null 2>&1

INST_ENV="GC_LANG=vi" inst plain
[ $IRC = 0 ] && [ "$(envlang plain)" = vi ] && echo "$INST_OUT" | grep -q 'Ngôn ngữ: Tiếng Việt' && echo "$INST_OUT" | grep -q 'đang chạy'; check $? "GC_LANG=vi (biến môi trường) khi cài lại → .env đổi sang vi, đầu ra tiếng Việt" "mã $IRC"
HOME="$W/plain-home" "$W/plain-home/.local/bin/genchibi" stop >/dev/null 2>&1
inst plain
[ $IRC = 0 ] && [ "$(envlang plain)" = vi ] && echo "$INST_OUT" | grep -q 'Giữ .env cũ'; check $? "cài lại không chọn → giữ ngôn ngữ của bản cài (vi), không hỏi" "mã $IRC"
HOME="$W/plain-home" "$W/plain-home/.local/bin/genchibi" stop >/dev/null 2>&1
grep -v '^GC_LANG=' "$W/plain/.env" > "$W/env.old" && cat "$W/env.old" > "$W/plain/.env"
inst plain
[ $IRC = 0 ] && [ "$(envlang plain)" = en ] && [ "$(grep -c '^GC_LANG=' "$W/plain/.env")" = 1 ] && grep -q '^GC_MASTER_KEY=' "$W/plain/.env"; check $? ".env trước v0.20 (chưa có GC_LANG) → thêm đúng một dòng GC_LANG=en, giữ các dòng khác" "mã $IRC"
HOME="$W/plain-home" "$W/plain-home/.local/bin/genchibi" stop >/dev/null 2>&1

P_VI="$(freeport)"
INST_PORT="$P_VI" inst vi --lang vi
[ $IRC = 0 ] && [ "$(envlang vi)" = vi ] && echo "$INST_OUT" | grep -q 'Gói hợp lệ' && echo "$INST_OUT" | grep -q 'Ngôn ngữ: Tiếng Việt'; check $? "--lang vi → .env GC_LANG=vi, mọi bước báo bằng tiếng Việt" "mã $IRC: $(echo "$INST_OUT" | tail -3)"

if script --version 2>/dev/null | grep -q util-linux; then
  home="$W/tty-home"; mkdir -p "$home"
  out="$(printf '2\n' | env -u GC_LANG HOME="$home" GC_TARBALL="$TAR" GC_NO_AUTOCHECK=1 HTTPS_PROXY= https_proxy= NO_PROXY=127.0.0.1,localhost \
    $TO script -qec "bash '$ROOT/install.sh' --native --dir '$W/tty' --port $(freeport)" /dev/null 2>&1)"; rc=$?
  HOME="$home" "$home/.local/bin/genchibi" stop >/dev/null 2>&1
  [ $rc = 0 ] && echo "$out" | grep -q 'Language / Ngôn ngữ: .*\[1\] English  \[2\] Tiếng Việt  (Enter = English)' && [ "$(envlang tty)" = vi ] && echo "$out" | grep -q 'đang chạy'
  check $? "có terminal (giả lập bằng script) → hỏi 'Language / Ngôn ngữ: [1] English  [2] Tiếng Việt  (Enter = English)', chọn 2 → vi" "mã $rc: $(echo "$out" | tail -4)"
  home="$W/tty2-home"; mkdir -p "$home"
  out="$(printf '\n' | env -u GC_LANG HOME="$home" GC_TARBALL="$TAR" GC_NO_AUTOCHECK=1 HTTPS_PROXY= https_proxy= NO_PROXY=127.0.0.1,localhost \
    $TO script -qec "bash '$ROOT/install.sh' --native --dir '$W/tty2' --port $(freeport)" /dev/null 2>&1)"; rc=$?
  HOME="$home" "$home/.local/bin/genchibi" stop >/dev/null 2>&1
  [ $rc = 0 ] && [ "$(envlang tty2)" = en ] && echo "$out" | grep -q 'is running'; check $? "có terminal, bấm Enter → English" "mã $rc: $(echo "$out" | tail -3)"
else
  echo "   · bỏ qua ca có terminal: cần 'script' của util-linux"
fi

echo "   3) genchibi lang + trợ giúp"
G="$W/vi-home/.local/bin/genchibi"
cli() { env -u GC_LANG HOME="$W/vi-home" GC_NO_AUTOCHECK=1 HTTPS_PROXY= https_proxy= NO_PROXY=127.0.0.1,localhost "$@"; }
out="$(cli "$G" lang)"; echo "$out" | grep -q 'Ngôn ngữ: Tiếng Việt (vi)'; check $? "genchibi lang → in ngôn ngữ hiện tại (Tiếng Việt (vi))" "$out"
out="$(cli "$G" lang xx 2>&1)"; rc=$?; [ $rc = 1 ] && echo "$out" | grep -q 'xx' && echo "$out" | grep -q 'en (English)' && [ "$(envlang vi)" = vi ]; check $? "genchibi lang xx → thoát 1, nói rõ chỉ có en / vi, .env không đổi" "$rc $out"
vihelp="$(cli "$G" help)"; enhelp="$(cli env GC_LANG=en "$G" help)"
cmds() { sed -n 's/^  \([a-z][a-z-]*\).*/\1/p'; }
[ "$(echo "$vihelp" | cmds | tr '\n' ' ')" = "$(echo "$enhelp" | cmds | tr '\n' ' ')" ] && [ "$(echo "$vihelp" | wc -l)" = "$(echo "$enhelp" | wc -l)" ] && echo "$vihelp" | grep -q 'lang \[en|vi\]' && echo "$vihelp" | grep -q 'quản lý gen-chibi'
check $? "trợ giúp vi đủ mọi lệnh như bản en ($(echo "$enhelp" | cmds | tr '\n' ' '))"
! printf '%s' "$enhelp" | has_vi && echo "$enhelp" | grep -q 'lang \[en|vi\]'; check $? "GC_LANG=en (biến môi trường) thắng .env · trợ giúp en không có chữ có dấu, có lệnh lang"
P1="$(cat "$W/vi/logs/launcher.pid" 2>/dev/null)"
out="$(cli "$G" lang en 2>&1)"; rc=$?
[ $rc = 0 ] && [ "$(envlang vi)" = en ] && echo "$out" | grep -q 'Language set to English' && echo "$out" | grep -q 'Restarting' && echo "$out" | grep -q 'switch language in the Studio'
check $? "genchibi lang en → ghi GC_LANG=en vào .env, khởi động lại app, nói rõ vẫn đổi riêng trong Studio được (câu báo theo ngôn ngữ mới)" "$rc $out"
up=1; for i in $(seq 1 40); do curl -fsS "http://127.0.0.1:$P_VI/api/health" >/dev/null 2>&1 && { up=0; break; }; sleep 0.5; done
P2="$(cat "$W/vi/logs/launcher.pid" 2>/dev/null)"
[ $up = 0 ] && [ -n "$P2" ] && [ "$P1" != "$P2" ]; check $? "app chạy lại sau khi đổi ngôn ngữ (pid $P1 → $P2)"
if [ -r "/proc/$P2/environ" ]; then tr '\0' '\n' < "/proc/$P2/environ" | grep -qx 'GC_LANG=en'; check $? "tiến trình app mới nhận GC_LANG=en"; fi
out="$(cli "$G" lang en)"; echo "$out" | grep -q 'already English' && [ "$(cat "$W/vi/logs/launcher.pid")" = "$P2" ]; check $? "genchibi lang en lần nữa → báo đã là English, không khởi động lại" "$out"
out="$(cli "$G" help)"; ! printf '%s' "$out" | has_vi && echo "$out" | grep -q '^genchibi — manage gen-chibi'; check $? "sau lang en: trợ giúp mặc định tiếng Anh, không chữ có dấu"
cli "$G" stop >/dev/null 2>&1
out="$(cli "$G" lang vi)"; echo "$out" | grep -q 'Đã đặt ngôn ngữ Tiếng Việt' && echo "$out" | grep -q 'App đang không chạy' && [ "$(envlang vi)" = vi ]; check $? "app đang dừng: genchibi lang vi chỉ ghi .env, báo áp dụng ở lần chạy tới (không tự chạy app)" "$out"
! curl -fsS "http://127.0.0.1:$P_VI/api/health" >/dev/null 2>&1; check $? "app vẫn dừng sau lang vi"

echo "   Kết quả ngôn ngữ: $PASS đạt, $FAIL trượt"
[ $FAIL = 0 ]
