#!/usr/bin/env bash
# PreToolUse(Bash) — rào tự động cho bài học L-20261017-43 (tái phạm 2026-10-18, Ryan duyệt cài hook):
# `pkill -f <mẫu>` / `killall` khớp cả dòng lệnh của chính shell đang chạy ⇒ shell chết (exit 144).
# Chỉ chặn khi pkill/killall đứng ở VỊ TRÍ LỆNH (đầu dòng hoặc sau ; & | ( $(), không chặn chữ trong chuỗi / tài liệu.
# Exit 2 = chặn, stderr được đưa lại cho model kèm cách làm đúng.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0
if printf '%s\n' "$cmd" | grep -qE '(^|[;&|(]|\$\()[[:space:]]*(sudo[[:space:]]+)?(pkill[[:space:]]+([^;&|]*[[:space:]])?-[a-zA-Z]*f|killall([[:space:]]|$))'; then
  echo "Chặn bởi hook no-pkill (bài học L-20261017-43): pkill -f / killall có thể khớp chính shell đang chạy và giết nó." >&2
  echo "Dùng thay: fuser -k <cổng>/tcp  (dừng server theo cổng)  hoặc  kill <PID đúng của tiến trình>  (lấy PID bằng \$! khi chạy nền)." >&2
  exit 2
fi
exit 0
