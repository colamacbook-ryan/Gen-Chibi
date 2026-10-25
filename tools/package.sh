#!/usr/bin/env bash
# Đóng gói bản phát hành: dist/gen-chibi-v<VERSION>.tar.gz + dist/SHA256SUMS
# Dùng chung cho CI (release.yml) và kiểm thử cục bộ.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(tr -d ' \n' < "$ROOT/VERSION")"
NAME="gen-chibi-v$VER"
OUT="${1:-$ROOT/dist}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$NAME" "$OUT"
for p in VERSION CHANGELOG.md LICENSE README.md launcher.js install.sh docker-compose.yml docker-compose.edge.yml edge server engine kinds studio locales cli agent bridge; do
  [ -e "$ROOT/$p" ] && cp -R "$ROOT/$p" "$STAGE/$NAME/"
done
# Sân khấu sống: bộ chuyển hooks của Claude Code + công cụ phát lại chạy từ bản cài (đoạn settings.json trỏ tới <bản cài>/tools/live-hook.mjs)
for f in live-hook.mjs live-replay.mjs; do
  [ -e "$ROOT/tools/$f" ] && mkdir -p "$STAGE/$NAME/tools" && cp "$ROOT/tools/$f" "$STAGE/$NAME/tools/"
done
tar --format=pax --owner=0 --group=0 --numeric-owner -C "$STAGE" -czf "$OUT/$NAME.tar.gz" "$NAME"
( cd "$OUT" && sha256sum "$NAME.tar.gz" > SHA256SUMS )
echo "$OUT/$NAME.tar.gz"
