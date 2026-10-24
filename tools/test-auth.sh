#!/usr/bin/env bash
# Kiểm khoá truy cập: không có đường vòng qua Host/địa chỉ khi đã đặt token. v0.21 (spec §3.4, CNS-191): bản cài nào cũng có token chủ —
# không đặt GC_API_TOKEN thì server tự sinh data/owner-token; KHÔNG lớp nào được quyền chủ vì thiếu header (localhost cũng phải có token / phiên).
# Bảng truy cập đầy đủ (mật khẩu, khởi tạo bằng token, phiên, trần L-66, máy kế thừa…): tools/test-auth-owner.mjs
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; F=0
K=linkkey_0123456789abcdefghijklmn
for p in 7493 7494; do curl -s -o /dev/null "http://127.0.0.1:$p/" && { echo "   ✗ cổng $p đang bận"; exit 1; }; done
GC_HOME="$T/a" GC_PORT=7493 GC_NO_AUTOCHECK=1 GC_API_TOKEN=tok123 GC_MCP_KEY=$K GC_ALLOWED_HOSTS='mcp.example.com,*.trycloudflare.com' node "$ROOT/server/main.js" >/dev/null 2>&1 & A=$!
GC_HOME="$T/b" GC_PORT=7494 GC_NO_AUTOCHECK=1 GC_MCP_KEY=$K node "$ROOT/server/main.js" >/dev/null 2>&1 & B=$!
trap 'kill $A $B 2>/dev/null; rm -rf "$T"' EXIT
# chờ cả hai server trả lời HTTP (≤ 30 s) — không ngủ cố định (máy vừa khởi động / đang tải nặng: 1,2 s không đủ → mọi kiểm "nhận 000")
for p in 7493 7494; do for i in $(seq 1 300); do [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/api/health")" != 000 ] && break; sleep 0.1; done
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/api/health")" != 000 ] || { echo "   ✗ server :$p không lên sau 30 s"; exit 1; }; done
c() { local want="$1" name="$2"; shift 2; local got; got="$(curl -s -o /dev/null -w '%{http_code}' "$@")"
  if [ "$got" = "$want" ]; then echo "   ✓ $name ($got)"; else echo "   ✗ $name: muốn $want, nhận $got"; F=1; fi; }
J=(-H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}')
c 401 "có token: localhost /api không token"           http://localhost:7493/api/info
c 401 "có token: Host giả localhost"                    -H 'Host: localhost' http://127.0.0.1:7493/api/assets
c 401 "có token: sai token"                             -H 'Authorization: Bearer tok12X' http://localhost:7493/api/info
c 200 "có token: đúng token"                            -H 'Authorization: Bearer tok123' http://localhost:7493/api/info
c 200 "có token: /api/health mở cho launcher"           http://localhost:7493/api/health
c 401 "có token: tunnel /mcp không token"               -H 'Host: mcp.example.com' -H 'Cf-Connecting-Ip: 1.2.3.4' "${J[@]}" http://127.0.0.1:7493/mcp
c 200 "có token: tunnel /mcp đúng token"                -H 'Host: mcp.example.com' -H 'Cf-Connecting-Ip: 1.2.3.4' -H 'Authorization: Bearer tok123' "${J[@]}" http://127.0.0.1:7493/mcp
c 200 "có token: link /mcp/<key> qua tunnel tạm"      -H 'Host: ab-cd.trycloudflare.com' -H 'Cf-Connecting-Ip: 1.2.3.4' "${J[@]}" "http://127.0.0.1:7493/mcp/$K"
c 404 "có token: link sai khoá"                         -H 'Host: mcp.example.com' -H 'Cf-Connecting-Ip: 1.2.3.4' "${J[@]}" "http://127.0.0.1:7493/mcp/${K}x"
c 401 "có token: link không mở /api"                    -H 'Host: mcp.example.com' -H 'Cf-Connecting-Ip: 1.2.3.4' "http://127.0.0.1:7493/api/info?k=$K"
t() { curl -s -H 'Host: mcp.example.com' -H 'Content-Type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}" "http://127.0.0.1:7493/mcp/$K"; }
# MCP trả agent tiếng Anh (ADR 0007, CNS-067)
if t rollback_app '{"confirm":"ROLLBACK"}' | grep -q 'Through an MCP link' && t update_app '{"force":true}' | grep -q 'Through an MCP link'; then echo "   ✓ link không được rollback/force"; else echo "   ✗ link vượt quyền rollback/force"; F=1; fi
c 403 "có token: Host lạ"                               -H 'Host: evil.example.net' "${J[@]}" "http://127.0.0.1:7493/mcp/$K"
c 403 "có token: wildcard không khớp tên gốc"           -H 'Host: trycloudflare.com' "${J[@]}" "http://127.0.0.1:7493/mcp/$K"
c 401 "không GC_API_TOKEN: localhost không header → 401 (v0.21: owner-token tự sinh, máy mình KHÔNG được miễn — CNS-191)" http://localhost:7494/api/info
c 401 "không GC_API_TOKEN: tunnel đổi Host=localhost (XFF) → 401" -H 'X-Forwarded-For: 1.2.3.4' http://localhost:7494/api/assets
c 200 "không GC_API_TOKEN: Studio tĩnh qua tunnel → 200 (không chứa dữ liệu; dữ liệu nằm sau /api)" -H 'Cf-Connecting-Ip: 1.2.3.4' http://localhost:7494/
c 401 "không GC_API_TOKEN: /mcp không header → 401"     "${J[@]}" http://localhost:7494/mcp
OT="$(tr -d ' \n' < "$T/b/data/owner-token" 2>/dev/null)"
[ "${#OT}" = 64 ] && [ "$(stat -c %a "$T/b/data/owner-token" 2>/dev/null || stat -f %Lp "$T/b/data/owner-token")" = 600 ] && echo "   ✓ data/owner-token tự sinh: 256 bit, 0600" || { echo "   ✗ thiếu data/owner-token (256 bit, 0600)"; F=1; }
printf 'header = "Authorization: Bearer %s"\n' "$OT" | c 200 "không GC_API_TOKEN: token từ data/owner-token → 200" -K - http://localhost:7494/api/info
c 200 "không GC_API_TOKEN: link có khoá vẫn dùng được qua tunnel" -H 'Cf-Connecting-Ip: 1.2.3.4' "${J[@]}" "http://localhost:7494/mcp/$K"
exit $F
