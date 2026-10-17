#!/usr/bin/env bash
# gen-chibi — cài bằng một lệnh (Linux, macOS). Không hỏi câu nào; mọi giá trị có mặc định.
#   curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash
# Tuỳ chọn: --dir <thư mục> (mặc định ~/gen-chibi) · --port <cổng> (7480) · --native (chạy bằng Node, không Docker)
#           --version vX.Y.Z (mặc định bản mới nhất)
# © 2026 Afi Labs — All rights reserved.
set -euo pipefail

REPO="${GC_REPO:-colamacbook-ryan/Gen-Chibi}"
DIR="${GC_DIR:-$HOME/gen-chibi}"
PORT="${GC_PORT:-7480}"
MODE=""
WANT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --native) MODE="native"; shift ;;
    --docker) MODE="docker"; shift ;;
    --version) WANT="$2"; shift 2 ;;
    -h|--help) sed -n '2,7p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Tuỳ chọn lạ: $1" >&2; exit 2 ;;
  esac
done

B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
step() { printf "%s◐%s %s\n" "$Y" "$N" "$*"; }
ok()   { printf "%s✓%s %s\n" "$G" "$N" "$*"; }
die()  { printf "%s✗ %s%s\n" "$R" "$*" "$N" >&2; exit 1; }

OS="$(uname -s)"; ARCH="$(uname -m)"
case "$OS" in Linux|Darwin) ;; *) die "Chưa hỗ trợ hệ điều hành $OS (Linux, macOS)." ;; esac
command -v curl >/dev/null || die "Cần curl."
command -v tar >/dev/null || die "Cần tar."
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

printf "%sgen-chibi%s · cài vào %s · %s %s\n" "$B" "$N" "$DIR" "$OS" "$ARCH"

# ---------- chọn cách chạy
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
docker_ok() { command -v docker >/dev/null && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; }
if [ -z "$MODE" ]; then
  if docker_ok; then MODE="docker"
  elif [ "$OS" = "Linux" ] && [ "$(id -u)" = "0" -o -n "$(command -v sudo)" ]; then
    step "Chưa có Docker — đang cài Docker (get.docker.com)…"
    SUDO=""; [ "$(id -u)" = "0" ] || SUDO="sudo"
    curl -fsSL https://get.docker.com | $SUDO sh >/dev/null && $SUDO usermod -aG docker "$USER" 2>/dev/null || true
    docker_ok && MODE="docker" || { node_ok && MODE="native" || die "Không cài được Docker và máy chưa có Node ≥ 18."; }
  elif node_ok; then MODE="native"; printf "%s!%s Không thấy Docker đang chạy: dùng chế độ Node trực tiếp.\n" "$Y" "$N"
  else die "Cần Docker Desktop (đang chạy) hoặc Node ≥ 18. macOS: cài Docker Desktop hoặc 'brew install node', rồi chạy lại lệnh cài."
  fi
fi
[ "$MODE" = "native" ] && ! node_ok && die "Chế độ --native cần Node ≥ 18."
ok "Cách chạy: $MODE"

# ---------- tải bản phát hành
mkdir -p "$DIR/releases" "$DIR/data" "$DIR/backups" "$DIR/logs"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ -n "${GC_TARBALL:-}" ]; then
  # chỉ dùng khi kiểm thử: cài từ gói cục bộ (kèm SHA256SUMS cùng thư mục)
  cp "$GC_TARBALL" "$TMP/"; cp "$(dirname "$GC_TARBALL")/SHA256SUMS" "$TMP/"; TARNAME="$(basename "$GC_TARBALL")"
else
  step "Tìm bản phát hành ${WANT:-mới nhất}…"
  API="https://api.github.com/repos/$REPO/releases/${WANT:+tags/}${WANT:-latest}"
  META="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$API")" || die "Không đọc được bản phát hành từ GitHub ($API)."
  TARURL="$(printf '%s' "$META" | grep -o '"browser_download_url": *"[^"]*\.tar\.gz"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')"
  SUMURL="$(printf '%s' "$META" | grep -o '"browser_download_url": *"[^"]*SHA256SUMS"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')"
  [ -n "$TARURL" ] && [ -n "$SUMURL" ] || die "Bản phát hành thiếu gói hoặc SHA256SUMS."
  TARNAME="$(basename "$TARURL")"
  step "Tải $TARNAME"
  curl -fL --progress-bar -o "$TMP/$TARNAME" "$TARURL"
  curl -fsSL -o "$TMP/SHA256SUMS" "$SUMURL"
fi
WANTSUM="$(grep " \*\?$TARNAME\$" "$TMP/SHA256SUMS" | cut -d' ' -f1)"
[ -n "$WANTSUM" ] && [ "$(sha256 "$TMP/$TARNAME")" = "$WANTSUM" ] || die "Sai checksum, dừng cài để an toàn."
ok "Gói hợp lệ (SHA-256)"

VER="$(echo "$TARNAME" | sed 's/^gen-chibi-\(v[0-9][^/]*\)\.tar\.gz$/\1/')"
case "$VER" in v[0-9]*) ;; *) die "Tên gói không đúng dạng gen-chibi-vX.Y.Z.tar.gz";; esac
rm -rf "$DIR/releases/$VER"; mkdir -p "$DIR/releases/$VER"
tar -xzf "$TMP/$TARNAME" -C "$DIR/releases/$VER" --strip-components=1
ln -sfn "releases/$VER" "$DIR/current"
cp "$DIR/current/launcher.js" "$DIR/launcher.js"
cp "$DIR/current/docker-compose.yml" "$DIR/docker-compose.yml"
ok "Đã giải nén $VER"

# ---------- .env (sinh một lần; không có bí mật mặc định)
if [ ! -f "$DIR/.env" ]; then
  KEY="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > "$DIR/.env" <<EOF
# gen-chibi — sinh tự động lúc cài. Không chia sẻ tệp này.
GC_MODE=$MODE
GC_PORT=$PORT
GC_BIND=127.0.0.1
GC_MASTER_KEY=$KEY
GC_AUTO_UPDATE=1
GC_UID=$(id -u)
GC_GID=$(id -g)
GC_REPO=$REPO
# Mở cho máy khác trong mạng: đặt GC_BIND=0.0.0.0, GC_ALLOWED_HOSTS=<tên máy> và GC_API_TOKEN=<chuỗi ngẫu nhiên dài>
GC_API_TOKEN=
GC_ALLOWED_HOSTS=
# Proxy (lấy từ máy lúc cài, nếu có)
HTTPS_PROXY=${HTTPS_PROXY:-${https_proxy:-}}
NO_PROXY=${NO_PROXY:-${no_proxy:-}}
GC_EXTRA_CA=
EOF
  chmod 600 "$DIR/.env"
  # chứng chỉ CA bổ sung của proxy công ty (nếu máy có): chép vào thư mục cài để cả Docker lẫn Node đọc được
  if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "$NODE_EXTRA_CA_CERTS" ]; then
    mkdir -p "$DIR/certs"; cp "$NODE_EXTRA_CA_CERTS" "$DIR/certs/extra-ca.pem"
    if [ "$MODE" = docker ]; then CA=/install/certs/extra-ca.pem; else CA="$DIR/certs/extra-ca.pem"; fi
    sed -i.bak "s#^GC_EXTRA_CA=.*#GC_EXTRA_CA=$CA#" "$DIR/.env" && rm -f "$DIR/.env.bak"
  fi
  case "${HTTPS_PROXY:-${https_proxy:-}}" in *127.0.0.1*|*localhost*) [ "$MODE" = docker ] && printf "%s!%s Proxy chạy trên localhost không tới được từ trong Docker; sửa HTTPS_PROXY trong %s/.env nếu cần.\n" "$Y" "$N" "$DIR" ;; esac
  ok "Đã tạo .env (khoá mã hoá riêng cho máy này)"
else
  sed -i.bak "s/^GC_MODE=.*/GC_MODE=$MODE/" "$DIR/.env" && rm -f "$DIR/.env.bak"
  ok "Giữ .env cũ"
fi

# ---------- CLI
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
sed "s#__GC_HOME__#$DIR#" "$DIR/current/cli/genchibi" > "$BIN/genchibi"; chmod +x "$BIN/genchibi"
ok "Lệnh: $BIN/genchibi"
case ":$PATH:" in *":$BIN:"*) ;; *) printf "%s!%s Thêm vào PATH: echo 'export PATH=\"%s:\$PATH\"' >> ~/.%src\n" "$Y" "$N" "$BIN" "$(basename "${SHELL:-bash}")" ;; esac

# ---------- chạy
step "Khởi động…"
"$BIN/genchibi" start >/dev/null
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    printf "\n%s✓ gen-chibi %s đang chạy%s\n" "$G" "$VER" "$N"
    printf "  Studio:  %shttp://localhost:%s%s\n" "$B" "$PORT" "$N"
    printf "  Lệnh:    genchibi start|stop|status|update|logs|backup|restore|mcp|expose|link|uninstall\n"
    printf "  MCP:     claude mcp add gen-chibi -- %s mcp\n" "$BIN/genchibi"
    printf "  MCP qua Internet: genchibi expose <tên-miền>  (in ra link cho agent)\n"
    printf "  Tự cập nhật: bật (tắt trong Studio › Cập nhật)\n"
    exit 0
  fi
  sleep 1
done
die "Chưa thấy gen-chibi trả lời ở cổng $PORT. Xem: genchibi logs"
