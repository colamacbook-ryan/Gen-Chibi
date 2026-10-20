#!/usr/bin/env bash
# Kiểm ngôn ngữ của trình cài, CLI và tài liệu GitHub (ADR 0007 · INT-18). Không cần Docker, không cần mạng ngoài.
#   1) bảng câu chữ: mọi khoá dùng tới có đủ ở _en và _vi, không khoá thừa (CLI + trình cài); không cú pháp bash 4 (macOS chạy bash 3.2)
#   2) install.sh: --lang lạ báo lỗi rõ · không terminal → English, không hỏi, không treo · --lang vi ghi GC_LANG=vi
#      · GC_LANG=vi (biến môi trường) · cài lại giữ ngôn ngữ cũ · cài lại bản ≤ v0.19 có dữ liệu (không chọn, không terminal) → KHÔNG ghi GC_LANG,
#        Studio + CLI giữ tiếng Việt (CNS-152) · câu hỏi song ngữ khi có terminal
#   3) genchibi lang (CLI + mặc định THẬT của Studio) / lang xx / lang en (ghi .env + đổi mặc định Studio qua API, không khởi động lại)
#      · Studio đã đổi mà .env vẫn cũ → lang vẫn đồng bộ được (CNS-153, app chạy và app dừng) · trợ giúp en không có chữ có dấu · trợ giúp vi đủ mọi lệnh
#   4) README.md + tài liệu tiếng Anh không còn chữ tiếng Việt (trừ dòng chuyển ngôn ngữ, tên riêng) · en ↔ vi trỏ nhau · link tương đối không gãy
#   5) trình cài --domain (A record sai → in bản ghi cần tạo, thoát rõ; dòng cuối = mã setup) · --cloudflare (không terminal + không GC_CF_TOKEN → dừng trước khi cài;
#      có GC_CF_TOKEN → Cloudflare API giả tới bậc mật khẩu, token không vào argv / env của curl) · Docker vừa cài mà phiên chưa vào nhóm → sg docker / sudo docker (giả lập) + đột biến
# © 2026 Gen Labs — All rights reserved.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; FAIL=0; PASS=0
ok()  { echo "   ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "   ✗ $1"; FAIL=$((FAIL+1)); }
check() { if [ "$1" = 0 ]; then ok "$2"; else bad "$2${3:+ — $3}"; fi; }
CFPID=""
stop_all() { for h in "$W"/*-home; do [ -x "$h/.local/bin/genchibi" ] && HOME="$h" "$h/.local/bin/genchibi" stop >/dev/null 2>&1; done; [ -z "$CFPID" ] || kill "$CFPID" 2>/dev/null; return 0; }
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
  set -- $r; n="$1"; tot="$2"; shift 2; rest="${*:-}"
  [ -z "$rest" ] && [ "$n" -gt 10 ] && ok "$f: $n khoá dùng tới, đủ ở _en và _vi ($tot khoá mỗi bảng)" || bad "$f: $rest (dùng $n khoá)"
  b4="$( { grep -nE 'declare -A|local -A|typeset -A|\$\{[A-Za-z_]+(,,|\^\^)|mapfile|readarray|;;&|;&|&>>|\|&|coproc' "$ROOT/$f"; grep -n '"\$@"' "$ROOT/$f" | grep -v '\${1+"\$@"}'; } | grep -vE '^[0-9]+:[[:space:]]*#' || true)"
  [ -z "$b4" ] && ok "$f: không cú pháp bash 4 (mảng kết hợp, \${x,,}, mapfile, ;&, |&…), \"\$@\" luôn có rào \${1+…} cho set -u" || bad "$f không chạy được trên bash 3.2: $b4"
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
grep -qE '^GC_API_TOKEN=[0-9a-f]{64}$' "$W/plain/.env" && ! printf '%s' "$INST_OUT" | grep -q "$(sed -n 's/^GC_API_TOKEN=//p' "$W/plain/.env")"
check $? "v0.21: .env mới luôn có GC_API_TOKEN (256 bit, hex) — trình cài không in token ra màn hình"
! printf '%s' "$INST_OUT" | has_vi; check $? "đầu ra trình cài ở chế độ English không có chữ tiếng Việt" "$(printf '%s' "$INST_OUT" | grep -nP "$VI_RE" 2>/dev/null | head -3)"
echo "$INST_OUT" | grep -q 'is running' && echo "$INST_OUT" | grep -q 'Package verified'; check $? "đầu ra English: 'Package verified', 'is running'"
HOME="$W/plain-home" "$W/plain-home/.local/bin/genchibi" stop >/dev/null 2>&1

INST_ENV="GC_LANG=vi" inst plain
[ $IRC = 0 ] && [ "$(envlang plain)" = vi ] && echo "$INST_OUT" | grep -q 'Ngôn ngữ: Tiếng Việt' && echo "$INST_OUT" | grep -q 'đang chạy'; check $? "GC_LANG=vi (biến môi trường) khi cài lại → .env đổi sang vi, đầu ra tiếng Việt" "mã $IRC"
HOME="$W/plain-home" "$W/plain-home/.local/bin/genchibi" stop >/dev/null 2>&1
inst plain
[ $IRC = 0 ] && [ "$(envlang plain)" = vi ] && echo "$INST_OUT" | grep -q 'Giữ .env cũ'; check $? "cài lại không chọn → giữ ngôn ngữ của bản cài (vi), không hỏi" "mã $IRC"
HOME="$W/plain-home" "$W/plain-home/.local/bin/genchibi" stop >/dev/null 2>&1
# bản cài ≤ v0.19 có dữ liệu: .env chưa có GC_LANG, data/ chưa có settings.json nhưng có tác phẩm → chạy lại trình cài, KHÔNG terminal, không chọn (CNS-152)
grep -v '^GC_LANG=' "$W/plain/.env" > "$W/env.old" && cat "$W/env.old" > "$W/plain/.env"
rm -f "$W/plain/data/settings.json"; mkdir -p "$W/plain/data/works"; printf '{"id":"cu","title":"Phim cũ","shots":[]}\n' > "$W/plain/data/works/cu.json"
inst plain
[ $IRC = 0 ] && [ "$(grep -c '^GC_LANG' "$W/plain/.env")" = 0 ] && grep -q '^GC_MASTER_KEY=' "$W/plain/.env" && ! echo "$INST_OUT" | grep -q 'Language / '
check $? "cài lại bản ≤ v0.19 có dữ liệu, không terminal, không chọn → không hỏi, .env KHÔNG bị ghi GC_LANG, giữ các dòng khác" "mã $IRC: $(grep -n '^GC_LANG' "$W/plain/.env")"
echo "$INST_OUT" | grep -q 'Ngôn ngữ: giữ nguyên' && echo "$INST_OUT" | grep -q 'đang chạy' && echo "$INST_OUT" | grep -q 'Ngôn ngữ: Tiếng Việt'
check $? "trình cài báo 'Ngôn ngữ: giữ nguyên', nói tiếng Việt như bản cài đang dùng" "$(echo "$INST_OUT" | sed -n '1,3p;$p')"
PP="$(sed -n 's/^GC_PORT=//p' "$W/plain/.env")"
h="$(curl -fsS "http://127.0.0.1:$PP/api/health" 2>/dev/null)"; echo "$h" | grep -q '"uiLang":"vi"'; check $? "server khởi động ra uiLang vi (luật nâng cấp: có dữ liệu → giữ tiếng Việt)" "$h"
grep -q '"uiLang": *"vi"' "$W/plain/data/settings.json" 2>/dev/null; check $? "settings.json › uiLang = vi (một nguồn sự thật)"
GP="$W/plain-home/.local/bin/genchibi"
out="$(env -u GC_LANG HOME="$W/plain-home" "$GP" help)"; echo "$out" | grep -q 'quản lý gen-chibi'; check $? "CLI không có GC_LANG → đọc settings.uiLang → nói tiếng Việt (CNS-152)" "$(echo "$out" | head -1)"
out="$(env -u GC_LANG HOME="$W/plain-home" "$GP" lang)"; echo "$out" | grep -q 'CLI: Tiếng Việt (vi) · Mặc định của Studio: Tiếng Việt (vi)'; check $? "genchibi lang → 'CLI: Tiếng Việt (vi) · Mặc định của Studio: Tiếng Việt (vi)'" "$out"
HOME="$W/plain-home" "$GP" stop >/dev/null 2>&1

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
  # có terminal, bản ≤ v0.19 có dữ liệu (.env chưa có GC_LANG, có tác phẩm, chưa có settings.json) → KHÔNG hỏi (Enter sẽ là English), không ghi GC_LANG
  grep -v '^GC_LANG=' "$W/tty2/.env" > "$W/env.old" && cat "$W/env.old" > "$W/tty2/.env"
  rm -f "$W/tty2/data/settings.json"; mkdir -p "$W/tty2/data/works"; printf '{"id":"cu","title":"Phim cũ","shots":[]}\n' > "$W/tty2/data/works/cu.json"
  p2="$(sed -n 's/^GC_PORT=//p' "$W/tty2/.env")"
  out="$(printf '\n' | env -u GC_LANG HOME="$home" GC_TARBALL="$TAR" GC_NO_AUTOCHECK=1 HTTPS_PROXY= https_proxy= NO_PROXY=127.0.0.1,localhost \
    $TO script -qec "bash '$ROOT/install.sh' --native --dir '$W/tty2' --port $p2" /dev/null 2>&1)"; rc=$?
  HOME="$home" "$home/.local/bin/genchibi" stop >/dev/null 2>&1
  [ $rc = 0 ] && ! echo "$out" | grep -q 'Language / ' && [ "$(grep -c '^GC_LANG' "$W/tty2/.env")" = 0 ] && echo "$out" | grep -q 'đang chạy' && grep -q '"uiLang": *"vi"' "$W/tty2/data/settings.json"
  check $? "có terminal, cài lại bản ≤ v0.19 có dữ liệu → không hỏi, không ghi GC_LANG, Studio giữ vi (settings.uiLang)" "mã $rc · $(cat "$W/tty2/data/settings.json" 2>/dev/null | tr -d '\n') · $(echo "$out" | tail -3)"
else
  echo "   · bỏ qua ca có terminal: cần 'script' của util-linux"
fi

echo "   3) genchibi lang + trợ giúp"
G="$W/vi-home/.local/bin/genchibi"
cli() { env -u GC_LANG HOME="$W/vi-home" GC_NO_AUTOCHECK=1 HTTPS_PROXY= https_proxy= NO_PROXY=127.0.0.1,localhost "$@"; }
out="$(cli "$G" lang)"; echo "$out" | grep -q 'CLI: Tiếng Việt (vi) · Mặc định của Studio: Tiếng Việt (vi)'; check $? "genchibi lang → in ngôn ngữ CLI + mặc định thật của Studio" "$out"
out="$(cli "$G" lang xx 2>&1)"; rc=$?; [ $rc = 1 ] && echo "$out" | grep -q 'xx' && echo "$out" | grep -q 'en (English)' && [ "$(envlang vi)" = vi ]; check $? "genchibi lang xx → thoát 1, nói rõ chỉ có en / vi, .env không đổi" "$rc $out"
vihelp="$(cli "$G" help)"; enhelp="$(cli env GC_LANG=en "$G" help)"
cmds() { sed -n 's/^  \([a-z][a-z-]*\).*/\1/p'; }
[ "$(echo "$vihelp" | cmds | tr '\n' ' ')" = "$(echo "$enhelp" | cmds | tr '\n' ' ')" ] && [ "$(echo "$vihelp" | wc -l)" = "$(echo "$enhelp" | wc -l)" ] && echo "$vihelp" | grep -q 'lang \[en|vi\]' && echo "$vihelp" | grep -q 'quản lý gen-chibi'
check $? "trợ giúp vi đủ mọi lệnh như bản en ($(echo "$enhelp" | cmds | tr '\n' ' '))"
! printf '%s' "$enhelp" | has_vi && echo "$enhelp" | grep -q 'lang \[en|vi\]'; check $? "GC_LANG=en (biến môi trường) thắng .env · trợ giúp en không có chữ có dấu, có lệnh lang"
grep -q 'X-GC-Lang: \$UI' "$ROOT/cli/genchibi"; check $? "api() của CLI gửi X-GC-Lang theo ngôn ngữ CLI (câu server trả về đúng ngôn ngữ CLI)"
health_lang() { curl -fsS "http://127.0.0.1:$P_VI/api/health" 2>/dev/null | sed -n 's/.*"uiLang":"\([a-z]*\)".*/\1/p'; }
# v0.21: trình cài sinh GC_API_TOKEN vào .env mới — "Studio" giả lập ở đây gọi API bằng token chủ (qua stdin của curl, không vào argv)
own_vi() { printf 'header = "Authorization: Bearer %s"\n' "$(sed -n 's/^GC_API_TOKEN=//p' "$W/vi/.env" | tail -1)"; }
P1="$(cat "$W/vi/logs/launcher.pid" 2>/dev/null)"
out="$(cli "$G" lang en 2>&1)"; rc=$?
[ $rc = 0 ] && [ "$(envlang vi)" = en ] && echo "$out" | grep -q 'Language set to English' && echo "$out" | grep -q 'Studio default switched to English' && echo "$out" | grep -q 'switch language in the Studio' && [ "$(health_lang)" = en ]
check $? "genchibi lang en (app chạy) → ghi GC_LANG=en vào .env + đổi mặc định Studio ngay qua API (/api/health › uiLang = en), câu báo theo ngôn ngữ mới" "$rc $out"
[ "$(cat "$W/vi/logs/launcher.pid" 2>/dev/null)" = "$P1" ]; check $? "không cần khởi động lại app (pid $P1 giữ nguyên)"
out="$(cli "$G" lang en)"; echo "$out" | grep -q 'already English' && [ "$(cat "$W/vi/logs/launcher.pid")" = "$P1" ]; check $? "genchibi lang en lần nữa → báo đã là English, không đổi gì" "$out"
out="$(cli "$G" help)"; ! printf '%s' "$out" | has_vi && echo "$out" | grep -q '^genchibi — manage gen-chibi'; check $? "sau lang en: trợ giúp mặc định tiếng Anh, không chữ có dấu"
# probe C (CNS-153): Studio đổi mặc định của máy sang vi trong khi .env vẫn en → genchibi lang thấy lệch, lang en vẫn đổi lại được
own_vi | curl -fsS -K - -X PUT -H 'X-GC-Request: 1' -H 'Content-Type: application/json' -d '{"uiLang":"vi"}' "http://127.0.0.1:$P_VI/api/settings" >/dev/null
out="$(cli "$G" lang)"; echo "$out" | grep -q 'CLI: English (en) · Studio default: Tiếng Việt (vi)'; check $? "Studio đổi sang vi, .env en → genchibi lang báo đúng cả hai: 'CLI: English (en) · Studio default: Tiếng Việt (vi)'" "$out"
out="$(cli "$G" lang en)"; ! echo "$out" | grep -q 'already' && [ "$(health_lang)" = en ]; check $? "genchibi lang en khi .env đã en mà Studio vi → không báo 'already', mặc định Studio về en" "$out"
cli "$G" restart >/dev/null 2>&1
up=1; for i in $(seq 1 40); do curl -fsS "http://127.0.0.1:$P_VI/api/health" >/dev/null 2>&1 && { up=0; break; }; sleep 0.5; done
[ $up = 0 ] && [ "$(health_lang)" = en ]; check $? "khởi động lại sau đó → vẫn en (giá trị .env đã áp qua API, không lệch)" "$(health_lang)"
cli "$G" stop >/dev/null 2>&1
out="$(cli "$G" lang vi)"; echo "$out" | grep -q 'Đã đặt ngôn ngữ Tiếng Việt' && echo "$out" | grep -q 'App đang không chạy' && [ "$(envlang vi)" = vi ] && grep -q '"uiLang": *"vi"' "$W/vi/data/settings.json"
check $? "app đang dừng: genchibi lang vi ghi .env + data/settings.json › uiLang, báo áp dụng ở lần chạy tới (không tự chạy app)" "$out"
! curl -fsS "http://127.0.0.1:$P_VI/api/health" >/dev/null 2>&1; check $? "app vẫn dừng sau lang vi"
# app dừng, .env đã vi nhưng mặc định Studio đang en (Studio đổi trước khi dừng) → lang vi vẫn sửa settings.json; chạy lại → vi
sed 's/"uiLang": *"vi"/"uiLang": "en"/' "$W/vi/data/settings.json" > "$W/st.tmp" && cat "$W/st.tmp" > "$W/vi/data/settings.json"
out="$(cli "$G" lang vi)"; ! echo "$out" | grep -q 'đã là' && grep -q '"uiLang": *"vi"' "$W/vi/data/settings.json"; check $? "app dừng, .env vi + Studio en → lang vi không báo 'đã là', sửa settings.json về vi" "$out"
cli "$G" start >/dev/null 2>&1
up=1; for i in $(seq 1 40); do curl -fsS "http://127.0.0.1:$P_VI/api/health" >/dev/null 2>&1 && { up=0; break; }; sleep 0.5; done
[ $up = 0 ] && [ "$(health_lang)" = vi ]; check $? "chạy lại → /api/health › uiLang = vi" "$(health_lang)"
# chạy lại trình cài với --lang vi (lựa chọn CÓ CHỦ Ý) khi .env đã vi nhưng Studio vừa đổi sang en → trình cài đồng bộ mặc định Studio về vi
own_vi | curl -fsS -K - -X PUT -H 'X-GC-Request: 1' -H 'Content-Type: application/json' -d '{"uiLang":"en"}' "http://127.0.0.1:$P_VI/api/settings" >/dev/null
inst vi --lang vi
[ $IRC = 0 ] && [ "$(envlang vi)" = vi ] && [ "$(health_lang)" = vi ]; check $? "cài lại --lang vi khi Studio đang en (.env đã vi) → mặc định Studio về vi (lựa chọn rõ thắng)" "mã $IRC · uiLang $(health_lang)"
cli "$G" stop >/dev/null 2>&1

echo "   5) trình cài: --domain / --cloudflare (Go online một bước) · Docker vừa cài, phiên chưa vào nhóm docker (sg / sudo)"
lastline() { printf '%s\n' "$1" | sed '/^[[:space:]]*$/d' | tail -n 1; }
codeof() { sed -n '1p' "$W/$1/data/setup-code.txt" 2>/dev/null | tr -d ' \r'; }
inst bogus --domain 'bad_domain!'
[ $IRC = 2 ] && echo "$INST_OUT" | grep -q 'Invalid domain: bad_domain!' && [ ! -e "$W/bogus" ]; check $? "--domain sai dạng → thoát 2, chưa đụng tới đĩa" "$IRC $INST_OUT"
inst bogus --cloudflare
[ $IRC = 2 ] && echo "$INST_OUT" | grep -q -- '--cloudflare goes with --domain' && [ ! -e "$W/bogus" ]; check $? "--cloudflare thiếu --domain → thoát 2, chưa đụng tới đĩa" "$IRC $INST_OUT"
inst bogus --domain chibi.example.com --cloudflare
[ $IRC = 2 ] && echo "$INST_OUT" | grep -q 'GC_CF_TOKEN' && echo "$INST_OUT" | grep -q 'never as an argument' && [ ! -e "$W/bogus" ]; check $? "--cloudflare, không terminal, không GC_CF_TOKEN → dừng NGAY (thoát 2, chưa cài gì), chỉ cách đặt GC_CF_TOKEN" "$IRC $INST_OUT"
# đường A, A record sai (DNS / IP giả bằng biến kiểm thử, chỉ khi GC_TEST=1) → in IP cần trỏ, thoát rõ ràng; app vẫn cài + chạy; dòng cuối = mã setup
INST_ENV="GC_TEST=1 GC_TEST_PUBLIC_IP=198.51.100.7 GC_TEST_DNS_A=203.0.113.9 GC_DNS_WAIT=0" inst doma --domain chibi.example.com
c="$(codeof doma)"
[ $IRC = 1 ] && echo "$INST_OUT" | grep -q 'now: 203.0.113.9' && echo "$INST_OUT" | grep -q 'A  chibi.example.com  →  198.51.100.7' && echo "$INST_OUT" | grep -q 'genchibi online caddy chibi.example.com' && echo "$INST_OUT" | grep -q 'is running'
check $? "--domain, bản ghi A sai → in đúng bản ghi cần tạo (A chibi.example.com → 198.51.100.7), thoát 1 rõ ràng kèm lệnh làm tiếp; app đã cài + chạy" "$IRC $(echo "$INST_OUT" | tail -6)"
[ -n "$c" ] && lastline "$INST_OUT" | grep -q "^Setup code: .*$c.*http://localhost:[0-9]*/setup.*genchibi open"; check $? "dòng cuối = mã setup ($c) + http://localhost:<cổng>/setup + genchibi open" "$(lastline "$INST_OUT")"
HOME="$W/doma-home" "$W/doma-home/.local/bin/genchibi" stop >/dev/null 2>&1
INST_ENV="GC_TEST=1 GC_TEST_PUBLIC_IP=198.51.100.7 GC_TEST_DNS_A=198.51.100.7 GC_DNS_WAIT=0" inst doma --domain chibi.example.com
[ $IRC = 1 ] && echo "$INST_OUT" | grep -q 'chibi.example.com → 198.51.100.7 (this machine)' && echo "$INST_OUT" | grep -q 'needs Docker mode' && echo "$INST_OUT" | grep -q 'genchibi online cloudflare chibi.example.com'
check $? "--domain, bản ghi A đúng nhưng bản native → báo cần Docker (Caddy giữ 80/443), gợi ý --cloudflare / genchibi online cloudflare" "$IRC $(echo "$INST_OUT" | tail -5)"
HOME="$W/doma-home" "$W/doma-home/.local/bin/genchibi" stop >/dev/null 2>&1

# đường B tới cuối: Cloudflare API giả + lời gọi "từ Internet" về cổng ingress (GC_TEST) · token chỉ qua GC_CF_TOKEN → stdin của CLI, shim ghi argv + env của curl
CFT="cfinst$(head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')"
CFOUT="$W/cf.base"
T="$CFT" O="$CFOUT" node --input-type=module -e "import { fakeCloudflare } from '$ROOT/tools/fixtures/fake-cloudflare-api.mjs'; const f = await fakeCloudflare({ token: process.env.T }); (await import('fs')).writeFileSync(process.env.O, f.base);" >/dev/null 2>&1 &
CFPID=$!
for i in $(seq 1 40); do [ -s "$CFOUT" ] && break; sleep 0.25; done
SHIMD="$W/shim"; mkdir -p "$SHIMD"
printf '#!/bin/bash\n{ printf "%%s\\0" ARGV "$0" "$@"; /usr/bin/env -0; printf "\\n"; } >> "%s/shim.log"\nexec %s "$@"\n' "$W" "$(command -v curl)" > "$SHIMD/curl"; chmod +x "$SHIMD/curl"
PB="$(freeport)"
GC_CF_TOKEN="$CFT" INST_PORT="$PB" INST_ENV="PATH=$SHIMD:$PATH GC_TEST=1 GC_TEST_CF_API=$(cat "$CFOUT" 2>/dev/null) GC_TEST_ONLINE_VIA=127.0.0.1:$((PB + 2)) GC_ONLINE_POLL=0.3 GC_ONLINE_RETRY=2.2" inst domb --domain chibi.example.com --cloudflare
c="$(codeof domb)"
[ $IRC = 0 ] && echo "$INST_OUT" | grep -q '✓ Tunnel' && echo "$INST_OUT" | grep -q '✓ MCP from the Internet' && echo "$INST_OUT" | grep -q 'Online: .*https://chibi.example.com.*MCP: https://chibi.example.com/mcp'
check $? "--domain chibi.example.com --cloudflare (GC_CF_TOKEN) → cài + genchibi online cloudflare tới bậc mật khẩu: in tiến độ, Online https://chibi.example.com + /mcp, thoát 0 (VPS mới: chỉ còn đặt mật khẩu)" "$IRC $(echo "$INST_OUT" | tail -14)"
[ -n "$c" ] && lastline "$INST_OUT" | grep -q "^Setup code: .*$c.*https://chibi.example.com/setup" && ! lastline "$INST_OUT" | grep -q 'genchibi open'; check $? "dòng cuối = mã setup ($c) + https://chibi.example.com/setup" "$(lastline "$INST_OUT")"
! printf '%s' "$INST_OUT" | grep -q "$CFT" && ! grep -q "$CFT" "$W/shim.log" 2>/dev/null && ! grep -rq "$CFT" "$W/domb" 2>/dev/null && [ -s "$W/shim.log" ]
check $? "token Cloudflare không có trong đầu ra trình cài, argv / môi trường của mọi lần gọi curl (shim), tệp nào của thư mục cài" "$(grep -c "$CFT" "$W/shim.log" 2>/dev/null) lần trong shim.log"
HOME="$W/domb-home" "$W/domb-home/.local/bin/genchibi" stop >/dev/null 2>&1
kill "$CFPID" 2>/dev/null; CFPID=""

# máy Ubuntu sạch, user không root: trình cài tự cài Docker (giả), usermod -aG docker; phiên này chưa nhận nhóm → phần còn lại chạy qua sg docker -c (hoặc sudo docker)
FK="$W/fakedocker"; FS="$W/fakestate"; mkdir -p "$FK"
cat > "$FK/id" <<'EOF'
#!/bin/bash
case "$*" in
  -u|-g) echo 1000 ;;
  -un) echo tester ;;
  "-nG tester") if [ -f "$FAKE_STATE/usermod" ]; then echo "tester docker"; else echo tester; fi ;;
  *) exec /usr/bin/id "$@" ;;
esac
EOF
cat > "$FK/sudo" <<'EOF'
#!/bin/bash
[ "$1" = -n ] && shift
echo "sudo $*" >> "$FAKE_STATE/sudo.log"
FAKE_SUDO=1 exec "$@"
EOF
cat > "$FK/usermod" <<'EOF'
#!/bin/bash
echo "usermod $*" >> "$FAKE_STATE/usermod.log"; touch "$FAKE_STATE/usermod"
EOF
cat > "$FK/sg" <<'EOF'
#!/bin/bash
[ -z "${FAKE_NO_SG:-}" ] || exit 1
[ "$1" = docker ] && [ "$2" = -c ] && [ -f "$FAKE_STATE/usermod" ] || exit 1
echo "sg -c $3" >> "$FAKE_STATE/sg.log"
FAKE_DOCKER_GROUP=1 exec sh -c "$3"
EOF
cat > "$FK/docker" <<'EOF'
#!/bin/bash
echo "${FAKE_DOCKER_GROUP:+[sg]}${FAKE_SUDO:+[sudo]} $*" >> "$FAKE_STATE/docker.log"
[ -f "$FAKE_STATE/installed" ] || { echo "docker: command not found" >&2; exit 127; }
[ -n "${FAKE_DOCKER_GROUP:-}${FAKE_SUDO:-}" ] || { echo "permission denied while trying to connect to the Docker daemon socket" >&2; exit 1; }
if [ "$1" = compose ]; then
  for a in "$@"; do [ "$a" = up ] || continue
    nohup node "$FAKE_STATE/../fakeapp.js" "$(sed -n 's/^GC_PORT=//p' .env)" "$PWD" >/dev/null 2>&1 &
    echo $! >> "$FAKE_STATE/app.pids"
  done
fi
exit 0
EOF
chmod +x "$FK"/*
cat > "$W/fakeapp.js" <<'EOF'
// app giả của "docker compose up" giả: /api/health + /api/auth/state, ghi mã setup như server thật
const fs = require('fs'), http = require('http'), [port, dir] = process.argv.slice(2);
fs.mkdirSync(dir + '/data', { recursive: true });
fs.writeFileSync(dir + '/data/setup-code.txt', 'FAKE1-CODE2\nexpires=' + (Math.floor(Date.now() / 1000) + 3600) + '\n');
http.createServer((q, s) => { s.writeHead(q.url === '/api/health' || q.url === '/api/auth/state' ? 200 : 404, { 'Content-Type': 'application/json' });
  s.end(q.url === '/api/health' ? '{"ok":true,"version":"v0.0.0","uiLang":"en"}' : '{"password":false}'); }).listen(+port, '127.0.0.1');
setTimeout(() => process.exit(0), 120000);
EOF
printf '#!/bin/sh\ntouch "%s/installed"\n' "$FS" > "$W/get-docker.sh"
dockinst() { # dockinst <tên> [biến…]: cài KHÔNG --native, PATH có docker / sudo / sg / id / usermod giả
  local name="$1" home="$W/$1-home"; shift; rm -rf "$FS"; mkdir -p "$FS" "$home"
  INST_OUT="$(env -u GC_LANG HOME="$home" GC_TARBALL="$TAR" GC_NO_AUTOCHECK=1 HTTPS_PROXY= https_proxy= NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
    PATH="$FK:$PATH" FAKE_STATE="$FS" GC_TEST=1 GC_TEST_DOCKER_SH="file://$W/get-docker.sh" ${1+"$@"} $TO $SID bash "$ROOT/install.sh" --dir "$W/$name" --port "$(freeport)" </dev/null 2>&1)"; IRC=$?
  [ -f "$FS/app.pids" ] && kill $(cat "$FS/app.pids") 2>/dev/null; return 0
}
dockinst dsg
[ $IRC = 0 ] && [ -f "$FS/installed" ] && grep -q 'usermod -aG docker tester' "$FS/usermod.log" && echo "$INST_OUT" | grep -q 'continuing with sg docker' && echo "$INST_OUT" | grep -q 'Log out and back in to use genchibi without sudo' && echo "$INST_OUT" | grep -q 'Run mode: docker'
check $? "Docker chưa có → cài (giả) + usermod -aG docker tester; phiên chưa vào nhóm → tiếp tục bằng sg docker, in 'Log out and back in…'" "$IRC $(echo "$INST_OUT" | tail -8) · $(cat "$FS/docker.log" 2>/dev/null | tail -3)"
grep -q '^\[sg\] compose -f docker-compose.yml up -d' "$FS/docker.log" && ! grep -qE '^ compose' "$FS/docker.log" && lastline "$INST_OUT" | grep -q '^Setup code: .*FAKE1-CODE2'
check $? "genchibi start trong cùng phiên chạy docker compose qua sg (không lệnh compose nào chạy thẳng bị từ chối); dòng cuối = mã setup" "$(cat "$FS/docker.log" 2>/dev/null | tail -4) · $(lastline "$INST_OUT")"
dockinst dsudo FAKE_NO_SG=1
[ $IRC = 0 ] && echo "$INST_OUT" | grep -q 'continuing with sudo docker' && grep -q '^\[sudo\] compose -f docker-compose.yml up -d' "$FS/docker.log"
check $? "không dùng được sg → sudo docker (không hỏi mật khẩu: -n), compose chạy qua sudo" "$IRC $(echo "$INST_OUT" | tail -4) · $(tail -3 "$FS/docker.log" 2>/dev/null)"
# đột biến: bỏ đường sg / sudo (chỉ docker thẳng) → trình cài phải rơi về native / dừng, kiểm ở trên ĐỎ
sed 's/^  case "\$g" in \*" docker "\*)$/  case "$g" in *" docker-mutated "*)/; s/command -v sudo >\/dev\/null \&\& sudo -n docker info/false \&\& sudo -n docker info/' "$ROOT/install.sh" > "$W/install-mut.sh"
if ! cmp -s "$ROOT/install.sh" "$W/install-mut.sh"; then
  rm -rf "$FS"; mkdir -p "$FS" "$W/dmut-home"
  out="$(env -u GC_LANG HOME="$W/dmut-home" GC_TARBALL="$TAR" GC_NO_AUTOCHECK=1 HTTPS_PROXY= https_proxy= NO_PROXY=127.0.0.1,localhost PATH="$FK:$PATH" FAKE_STATE="$FS" GC_TEST=1 GC_TEST_DOCKER_SH="file://$W/get-docker.sh" \
    $TO $SID bash "$W/install-mut.sh" --dir "$W/dmut" --port "$(freeport)" </dev/null 2>&1)"
  [ -f "$FS/app.pids" ] && kill $(cat "$FS/app.pids") 2>/dev/null
  HOME="$W/dmut-home" "$W/dmut-home/.local/bin/genchibi" stop >/dev/null 2>&1
  ! echo "$out" | grep -q 'continuing with sg docker' && ! grep -q '^\[sg\] compose' "$FS/docker.log" 2>/dev/null
  check $? "đột biến (không đường sg / sudo) → không còn 'continuing with sg docker' / compose qua sg — rào ở trên bắt được" "$(echo "$out" | tail -3)"
else bad "đột biến trình cài không áp được"; fi

echo "   4) README + tài liệu"
DOCS_OUT="$(node -e '
const fs = require("fs"), path = require("path"), root = process.argv[1], VI = new RegExp(process.argv[2]);
// tên riêng / chuỗi trích nguyên văn được phép giữ dấu trong bản tiếng Anh: tên ngôn ngữ, câu hỏi song ngữ của trình cài,
// tên bộ mẫu và nội dung mẫu (nội dung người dùng không dịch — ADR 0007 §4)
const ALLOW = ["Language / Ngôn ngữ", "Tiếng Việt", "Tam Quốc", "Văn phòng vui", "Ngày đầu đi làm", "Từ vườn đào tới Xích Bích", "Lưu Bị"];
let bad = 0; const say = (ok, m) => { console.log("   " + (ok ? "✓ " : "✗ ") + m); if (!ok) bad++; };
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const leftovers = f => read(f).split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => !(/README\.vi\.md|HUONG-DAN\.md|QUY-CACH-KHUNG\.md|QUY-TRINH-LINH-KIEN\.md/.test(l) && /English/.test(l) && /Tiếng Việt/.test(l)))
  .filter(([, l]) => VI.test(ALLOW.reduce((s, a) => s.split(a).join(""), l))).map(([n, l]) => n + ": " + l.slice(0, 90));
for (const f of ["README.md", "docs/USER-GUIDE.md", "docs/FRAME-SPEC.md", "docs/PART-WORKFLOW.md"]) {
  if (!fs.existsSync(path.join(root, f))) { say(false, f + " chưa có"); continue; }
  const left = leftovers(f); say(!left.length, f + ": không còn chữ tiếng Việt (trừ dòng chuyển ngôn ngữ, tên riêng)" + (left.length ? "\n      " + left.slice(0, 8).join("\n      ") : ""));
}
const pairs = [["README.md", "README.vi.md"], ["docs/USER-GUIDE.md", "docs/HUONG-DAN.md"], ["docs/FRAME-SPEC.md", "docs/QUY-CACH-KHUNG.md"], ["docs/PART-WORKFLOW.md", "docs/QUY-TRINH-LINH-KIEN.md"]];
for (const [en, vi] of pairs) {
  const head = f => fs.existsSync(path.join(root, f)) ? read(f).split("\n").slice(0, 3).join("\n") : "";
  say(head(en).includes("(" + path.basename(vi) + ")") && head(vi).includes("(" + path.basename(en) + ")") && /English/.test(head(en)) && /Tiếng Việt/.test(head(vi)),
    en + " ↔ " + vi + ": dòng chuyển ngôn ngữ ở đầu cả hai bản, trỏ nhau");
}
const rd = read("README.md");
say(["docs/USER-GUIDE.md", "docs/FRAME-SPEC.md", "docs/PART-WORKFLOW.md"].every(d => rd.indexOf(d) >= 0) && !/HUONG-DAN|QUY-CACH|QUY-TRINH/.test(rd) && /^## Language/m.test(rd) && /--lang vi/.test(rd) && /genchibi lang vi/.test(rd) && /GC_LANG/.test(rd),
  "README.md trỏ bản tiếng Anh của tài liệu, có mục Language (--lang vi · GC_LANG · genchibi lang · Studio)");
// link tương đối trong README* và docs/*.md phải tới tệp có thật
const broken = [];
for (const f of ["README.md", "README.vi.md"].concat(fs.readdirSync(path.join(root, "docs")).filter(x => x.endsWith(".md")).map(x => "docs/" + x)))
  for (const m of read(f).matchAll(/\]\(([^)\s]+)\)/g)) { const t = m[1].split("#")[0]; if (!t || /^[a-z]+:/.test(t)) continue; if (!fs.existsSync(path.join(root, path.dirname(f), t))) broken.push(f + " → " + m[1]); }
say(!broken.length, "link tương đối trong README* + docs/*.md không gãy" + (broken.length ? ": " + broken.join(", ") : ""));
process.exit(bad ? 1 : 0);
' "$ROOT" "$VI_RE" 2>&1)" || FAIL=$((FAIL+1))
echo "$DOCS_OUT"; PASS=$((PASS + $(echo "$DOCS_OUT" | grep -c '^   ✓')))

echo "   Kết quả ngôn ngữ: $PASS đạt, $FAIL trượt"
[ $FAIL = 0 ]
