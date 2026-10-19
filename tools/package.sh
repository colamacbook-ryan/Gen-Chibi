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
for p in VERSION CHANGELOG.md LICENSE README.md launcher.js install.sh docker-compose.yml server engine kinds studio cli agent; do
  [ -e "$ROOT/$p" ] && cp -R "$ROOT/$p" "$STAGE/$NAME/"
done
tar --format=pax --owner=0 --group=0 --numeric-owner -C "$STAGE" -czf "$OUT/$NAME.tar.gz" "$NAME"
( cd "$OUT" && sha256sum "$NAME.tar.gz" > SHA256SUMS )
echo "$OUT/$NAME.tar.gz"
