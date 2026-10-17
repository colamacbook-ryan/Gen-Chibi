#!/usr/bin/env bash
# Kiểm khoá truy cập: không có đường vòng qua Host/địa chỉ khi đã đặt token; tunnel bị chặn khi chưa có token.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; F=0
K=linkkey_0123456789abcdefghijklmn
for p in 7493 7494; do curl -s -o /dev/null "http://127.0.0.1:$p/" && { echo "   ✗ cổng $p đang bận"; exit 1; }; done
GC_HOME="$T/a" GC_PORT=7493 GC_NO_AUTOCHECK=1 GC_API_TOKEN=tok123 GC_MCP_KEY=$K GC_ALLOWED_HOSTS='mcp.example.com,*.trycloudflare.com' node "$ROOT/server/main.js" >/dev/null 2>&1 & A=$!
GC_HOME="$T/b" GC_PORT=7494 GC_NO_AUTOCHECK=1 GC_MCP_KEY=$K node "$ROOT/server/main.js" >/dev/null 2>&1 & B=$!
trap 'kill $A $B 2>/dev/null; rm -rf "$T"' EXIT
sleep 1.2
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
c 403 "có token: Host lạ"                               -H 'Host: evil.example.net' "${J[@]}" "http://127.0.0.1:7493/mcp/$K"
c 403 "có token: wildcard không khớp tên gốc"           -H 'Host: trycloudflare.com' "${J[@]}" "http://127.0.0.1:7493/mcp/$K"
c 200 "chưa token: localhost dùng bình thường"          http://localhost:7494/api/info
c 403 "chưa token: tunnel đổi Host=localhost (XFF)"     -H 'X-Forwarded-For: 1.2.3.4' http://localhost:7494/api/assets
c 403 "chưa token: tunnel Cloudflare"                   -H 'Cf-Connecting-Ip: 1.2.3.4' http://localhost:7494/
c 200 "chưa token: link có khoá vẫn dùng được qua tunnel" -H 'Cf-Connecting-Ip: 1.2.3.4' "${J[@]}" "http://localhost:7494/mcp/$K"
exit $F
