#!/usr/bin/env bash
# Ghi chú phát hành = mục "## vX.Y.Z — tiêu đề" của CHANGELOG.md (bỏ dòng tiêu đề, dừng ở mục "## " kế tiếp).
# Dùng chung cho CI (release.yml) và kiểm thử. Bản cài đọc ghi chú này ở nút Kiểm tra phiên bản.
#   bash tools/release-notes.sh v0.20.0 [CHANGELOG.md]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:?cần tag, vd v0.20.0}"
FILE="${2:-$ROOT/CHANGELOG.md}"
# khớp "## vX.Y.Z" đứng một mình HOẶC theo sau là dấu cách (tiêu đề có mô tả) — v0.2.0 không khớp nhầm v0.20.0
awk -v t="## $TAG" '!f && ($0 == t || index($0, t " ") == 1) { f = 1; next } f && /^## / { exit } f' "$FILE"
