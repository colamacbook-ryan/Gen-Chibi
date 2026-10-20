#!/usr/bin/env bash
# Kiểm ngôn ngữ của trình cài, CLI và tài liệu GitHub (ADR 0007 · INT-18). Không cần Docker, không cần mạng ngoài.
#   1) bảng câu chữ: mọi khoá dùng tới có đủ ở _en và _vi, không khoá thừa (CLI + trình cài); không cú pháp bash 4 (macOS chạy bash 3.2)
#   2) install.sh: --lang lạ báo lỗi rõ · không terminal → English, không hỏi, không treo · --lang vi ghi GC_LANG=vi
#      · GC_LANG=vi (biến môi trường) · cài lại giữ ngôn ngữ cũ · cài lại bản ≤ v0.19 có dữ liệu (không chọn, không terminal) → KHÔNG ghi GC_LANG,
#        Studio + CLI giữ tiếng Việt (CNS-152) · câu hỏi song ngữ khi có terminal
#   3) genchibi lang (CLI + mặc định THẬT của Studio) / lang xx / lang en (ghi .env + đổi mặc định Studio qua API, không khởi động lại)
#      · Studio đã đổi mà .env vẫn cũ → lang vẫn đồng bộ được (CNS-153, app chạy và app dừng) · trợ giúp en không có chữ có dấu · trợ giúp vi đủ mọi lệnh
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
P1="$(cat "$W/vi/logs/launcher.pid" 2>/dev/null)"
out="$(cli "$G" lang en 2>&1)"; rc=$?
[ $rc = 0 ] && [ "$(envlang vi)" = en ] && echo "$out" | grep -q 'Language set to English' && echo "$out" | grep -q 'Studio default switched to English' && echo "$out" | grep -q 'switch language in the Studio' && [ "$(health_lang)" = en ]
check $? "genchibi lang en (app chạy) → ghi GC_LANG=en vào .env + đổi mặc định Studio ngay qua API (/api/health › uiLang = en), câu báo theo ngôn ngữ mới" "$rc $out"
[ "$(cat "$W/vi/logs/launcher.pid" 2>/dev/null)" = "$P1" ]; check $? "không cần khởi động lại app (pid $P1 giữ nguyên)"
out="$(cli "$G" lang en)"; echo "$out" | grep -q 'already English' && [ "$(cat "$W/vi/logs/launcher.pid")" = "$P1" ]; check $? "genchibi lang en lần nữa → báo đã là English, không đổi gì" "$out"
out="$(cli "$G" help)"; ! printf '%s' "$out" | has_vi && echo "$out" | grep -q '^genchibi — manage gen-chibi'; check $? "sau lang en: trợ giúp mặc định tiếng Anh, không chữ có dấu"
# probe C (CNS-153): Studio đổi mặc định của máy sang vi trong khi .env vẫn en → genchibi lang thấy lệch, lang en vẫn đổi lại được
curl -fsS -X PUT -H 'X-GC-Request: 1' -H 'Content-Type: application/json' -d '{"uiLang":"vi"}' "http://127.0.0.1:$P_VI/api/settings" >/dev/null
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
curl -fsS -X PUT -H 'X-GC-Request: 1' -H 'Content-Type: application/json' -d '{"uiLang":"en"}' "http://127.0.0.1:$P_VI/api/settings" >/dev/null
inst vi --lang vi
[ $IRC = 0 ] && [ "$(envlang vi)" = vi ] && [ "$(health_lang)" = vi ]; check $? "cài lại --lang vi khi Studio đang en (.env đã vi) → mặc định Studio về vi (lựa chọn rõ thắng)" "mã $IRC · uiLang $(health_lang)"
cli "$G" stop >/dev/null 2>&1

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
