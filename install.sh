#!/usr/bin/env bash
# gen-chibi — one-command installer (Linux, macOS). Every value has a default; the only question is the language,
# asked once in an interactive terminal (Enter = English) and skipped when there is no terminal (CI, pipes).
#   curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi
# Options: --dir <folder> (default ~/gen-chibi) · --port <port> (7480) · --native (run with Node, no Docker)
#          --version vX.Y.Z (default: latest) · --lang en|vi (default en; or GC_LANG=vi)
# Private repo: set GC_GITHUB_TOKEN=<fine-grained token, Contents: Read-only> (see README). The token goes into .env and is never printed.
# © 2026 Gen Labs — All rights reserved.
set -euo pipefail

REPO="${GC_REPO:-colamacbook-ryan/Gen-Chibi}"
DIR="${GC_DIR:-$HOME/gen-chibi}"
PORT="${GC_PORT:-7480}"
MODE=""
WANT=""
LANG_ARG=""; HAS_LANG_ARG=""; BADOPT=""; HELP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --native) MODE="native"; shift ;;
    --docker) MODE="docker"; shift ;;
    --version) WANT="$2"; shift 2 ;;
    --lang) LANG_ARG="${2:-}"; HAS_LANG_ARG=1; if [ $# -gt 1 ]; then shift 2; else shift; fi ;;
    --lang=*) LANG_ARG="${1#--lang=}"; HAS_LANG_ARG=1; shift ;;
    -h|--help) HELP=1; shift ;;
    *) [ -n "$BADOPT" ] || BADOPT="$1"; shift ;;
  esac
done

B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'

# ---------- ngôn ngữ (ADR 0007): English mặc định; --lang / GC_LANG / .env của bản cài cũ / câu hỏi khi có terminal
# Hai bảng câu chữ _en / _vi (chuỗi printf, %s = đối số). bash 3.2: không mảng kết hợp; "$@" viết ${1+"$@"} (rỗng dưới set -u).
_en() {
  case "$1" in
    usage) F="gen-chibi installer (Linux, macOS)\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi\nOptions: --dir <folder> (default ~/gen-chibi) · --port <port> (7480) · --native (run with Node, no Docker)\n         --docker · --version vX.Y.Z (default: latest) · --lang en|vi (default en; or GC_LANG=vi)\nPrivate repo: set GC_GITHUB_TOKEN=<fine-grained token, Contents: Read-only> (see README). The token goes into .env and is never printed." ;;
    bad_opt) F="Unknown option: %s" ;;
    os_unsupported) F="Unsupported operating system %s (Linux, macOS)." ;;
    need_curl) F="curl is required." ;;
    need_tar) F="tar is required." ;;
    tok_bad) F="GC_GITHUB_TOKEN has invalid characters — copy the token again (letters, digits, _ . - only)." ;;
    banner) F="%sgen-chibi%s · installing to %s · %s %s" ;;
    lang_ok) F="Language: English (switch later: genchibi lang vi)" ;;
    docker_installing) F="Docker not found — installing Docker (get.docker.com)…" ;;
    docker_fail) F="Could not install Docker, and Node ≥ 18 is not available." ;;
    native_fallback) F="Docker is not running: using Node mode directly." ;;
    need_runtime) F="Needs Docker Desktop (running) or Node ≥ 18. macOS: install Docker Desktop or 'brew install node', then run the install command again." ;;
    native_need_node) F="--native mode needs Node ≥ 18." ;;
    mode_ok) F="Run mode: %s" ;;
    find_latest) F="Looking for the latest release…" ;;
    find_ver) F="Looking for release %s…" ;;
    private_help) F="Cannot read the releases of %s. If the repo is private: create a fine-grained token (GitHub › Settings › Developer settings › Fine-grained tokens; Repository access: only this repo; Permissions: Contents = Read-only), then run again with GC_GITHUB_TOKEN=<token> (see README, section 'Private repo')." ;;
    token_rejected) F="GitHub rejected the token or found no release of %s — check that the token has not expired, has Repository access to this repo and Contents: Read-only." ;;
    api_limited) F="GitHub API refused (usually the IP's rate limit ran out) — downloading straight from the releases page" ;;
    release_incomplete) F="The release is missing the package or SHA256SUMS." ;;
    downloading) F="Downloading %s" ;;
    bad_sum) F="Checksum mismatch — installation stopped to be safe." ;;
    sum_ok) F="Package verified (SHA-256)" ;;
    bad_name) F="The package name is not of the form gen-chibi-vX.Y.Z.tar.gz" ;;
    extracted) F="Extracted %s" ;;
    proxy_local) F="A proxy on localhost cannot be reached from inside Docker; edit HTTPS_PROXY in %s/.env if needed." ;;
    env_created) F="Created .env (encryption key unique to this machine)" ;;
    env_token) F="GC_GITHUB_TOKEN written to .env" ;;
    env_kept) F="Kept the existing .env" ;;
    cli_ok) F="Command: %s/genchibi" ;;
    path_hint) F="Add to PATH: echo 'export PATH=\"%s:\$PATH\"' >> ~/.%src" ;;
    starting) F="Starting…" ;;
    running) F="✓ gen-chibi %s is running" ;;
    sum_studio) F="  Studio:    %s%s%s" ;;
    sum_cmds) F="  Commands:  genchibi start|stop|status|update|logs|backup|restore|mcp|expose|link|lang|uninstall" ;;
    sum_mcp) F="  MCP:       claude mcp add gen-chibi -- %s mcp" ;;
    sum_mcp_net) F="  MCP over the Internet: genchibi expose <domain>  (prints the link for agents)" ;;
    sum_update) F="  Auto-update: on (turn off in Studio › System › Updates)" ;;
    sum_lang) F="  Language:  English (Vietnamese: genchibi lang vi, or the language switch in the Studio)" ;;
    no_answer) F="gen-chibi is not answering on port %s yet. See: genchibi logs" ;;
  esac
}
_vi() {
  case "$1" in
    usage) F="Trình cài gen-chibi (Linux, macOS)\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi\nTuỳ chọn: --dir <thư mục> (mặc định ~/gen-chibi) · --port <cổng> (7480) · --native (chạy bằng Node, không Docker)\n          --docker · --version vX.Y.Z (mặc định bản mới nhất) · --lang en|vi (mặc định en; hoặc GC_LANG=vi)\nRepo private: đặt GC_GITHUB_TOKEN=<fine-grained token, Contents: Read-only> (xem README). Token được ghi vào .env, không in ra." ;;
    bad_opt) F="Tuỳ chọn lạ: %s" ;;
    os_unsupported) F="Chưa hỗ trợ hệ điều hành %s (Linux, macOS)." ;;
    need_curl) F="Cần curl." ;;
    need_tar) F="Cần tar." ;;
    tok_bad) F="GC_GITHUB_TOKEN có ký tự lạ — chép lại token (chỉ gồm chữ, số, _ . -)." ;;
    banner) F="%sgen-chibi%s · cài vào %s · %s %s" ;;
    lang_ok) F="Ngôn ngữ: Tiếng Việt (đổi sau: genchibi lang en)" ;;
    docker_installing) F="Chưa có Docker — đang cài Docker (get.docker.com)…" ;;
    docker_fail) F="Không cài được Docker và máy chưa có Node ≥ 18." ;;
    native_fallback) F="Không thấy Docker đang chạy: dùng chế độ Node trực tiếp." ;;
    need_runtime) F="Cần Docker Desktop (đang chạy) hoặc Node ≥ 18. macOS: cài Docker Desktop hoặc 'brew install node', rồi chạy lại lệnh cài." ;;
    native_need_node) F="Chế độ --native cần Node ≥ 18." ;;
    mode_ok) F="Cách chạy: %s" ;;
    find_latest) F="Tìm bản phát hành mới nhất…" ;;
    find_ver) F="Tìm bản phát hành %s…" ;;
    private_help) F="Không đọc được bản phát hành của %s. Nếu repo là private: tạo fine-grained token (GitHub › Settings › Developer settings › Fine-grained tokens; Repository access: chỉ repo này; Permissions: Contents = Read-only) rồi chạy lại với GC_GITHUB_TOKEN=<token> (xem README, mục 'Repo private')." ;;
    token_rejected) F="GitHub từ chối token hoặc không thấy bản phát hành của %s — kiểm token còn hạn, có Repository access tới repo này và Contents: Read-only." ;;
    api_limited) F="GitHub API từ chối (thường do hết lượt gọi của IP) — tải trực tiếp từ trang phát hành" ;;
    release_incomplete) F="Bản phát hành thiếu gói hoặc SHA256SUMS." ;;
    downloading) F="Tải %s" ;;
    bad_sum) F="Sai checksum, dừng cài để an toàn." ;;
    sum_ok) F="Gói hợp lệ (SHA-256)" ;;
    bad_name) F="Tên gói không đúng dạng gen-chibi-vX.Y.Z.tar.gz" ;;
    extracted) F="Đã giải nén %s" ;;
    proxy_local) F="Proxy chạy trên localhost không tới được từ trong Docker; sửa HTTPS_PROXY trong %s/.env nếu cần." ;;
    env_created) F="Đã tạo .env (khoá mã hoá riêng cho máy này)" ;;
    env_token) F="Đã ghi GC_GITHUB_TOKEN vào .env" ;;
    env_kept) F="Giữ .env cũ" ;;
    cli_ok) F="Lệnh: %s/genchibi" ;;
    path_hint) F="Thêm vào PATH: echo 'export PATH=\"%s:\$PATH\"' >> ~/.%src" ;;
    starting) F="Khởi động…" ;;
    running) F="✓ gen-chibi %s đang chạy" ;;
    sum_studio) F="  Studio:  %s%s%s" ;;
    sum_cmds) F="  Lệnh:    genchibi start|stop|status|update|logs|backup|restore|mcp|expose|link|lang|uninstall" ;;
    sum_mcp) F="  MCP:     claude mcp add gen-chibi -- %s mcp" ;;
    sum_mcp_net) F="  MCP qua Internet: genchibi expose <tên-miền>  (in ra link cho agent)" ;;
    sum_update) F="  Tự cập nhật: bật (tắt trong Studio › Hệ thống › Cập nhật)" ;;
    sum_lang) F="  Ngôn ngữ: Tiếng Việt (English: genchibi lang en, hoặc nút chuyển ngôn ngữ trong Studio)" ;;
    no_answer) F="Chưa thấy gen-chibi trả lời ở cổng %s. Xem: genchibi logs" ;;
  esac
}
UI=en
_t() { F=""; if [ "$UI" = vi ]; then _vi "$1"; fi; if [ -z "$F" ]; then _en "$1"; fi; if [ -z "$F" ]; then F="$1"; fi; }
say()  { _t "$1"; shift; printf "%s$F\n" "" ${1+"$@"}; }
step() { _t "$1"; shift; printf "%s◐%s $F\n" "$Y" "$N" ${1+"$@"}; }
ok()   { _t "$1"; shift; printf "%s✓%s $F\n" "$G" "$N" ${1+"$@"}; }
warn() { _t "$1"; shift; printf "%s!%s $F\n" "$Y" "$N" ${1+"$@"}; }
die()  { _t "$1"; shift; printf "%s✗ $F%s\n" "$R" ${1+"$@"} "$N" >&2; exit 1; }

lang_of() { # chuẩn hoá: en | vi | "" (lạ)
  case "$1" in en|EN|En|en[_.-]*|EN[_.-]*) echo en ;; vi|VI|Vi|vi[_.-]*|VI[_.-]*) echo vi ;; *) echo "" ;; esac
}
bad_lang() { # chưa biết ngôn ngữ nên báo song ngữ
  printf "%s✗ Unsupported language: %s — use en or vi. / Không hỗ trợ ngôn ngữ: %s — dùng en hoặc vi.%s\n" "$R" "$1" "$1" "$N" >&2; exit 2
}
can_ask() { # chỉ hỏi khi có người ngồi trước terminal: stdout là terminal và mở được /dev/tty (curl | bash vẫn hỏi được; CI / ống dẫn thì không)
  [ -t 1 ] && { : < /dev/tty; } 2>/dev/null
}
ask_lang() {
  local a=""
  printf "Language / Ngôn ngữ: [1] English  [2] Tiếng Việt  (Enter = English) " > /dev/tty
  if ! read -r -t 60 a < /dev/tty; then a=""; printf "\n" > /dev/tty; fi   # hết 60 giây hay EOF → English, không treo
  case "$a" in 2|vi|VI|v|V) echo vi ;; *) echo en ;; esac
}
LANG_SET=""   # có giá trị khi người cài chọn rõ (--lang / GC_LANG / câu hỏi) → ghi vào .env cả khi .env đã có
OLD="$( [ -f "$DIR/.env" ] && sed -n 's/^GC_LANG=//p' "$DIR/.env" | tail -1 || true)"   # ngôn ngữ của bản cài cũ (cài lại / nâng cấp)
if [ -n "$HAS_LANG_ARG" ]; then
  UI="$(lang_of "$LANG_ARG")"; [ -n "$UI" ] || bad_lang "$LANG_ARG"; LANG_SET="$UI"
elif [ -n "${GC_LANG:-}" ]; then
  UI="$(lang_of "$GC_LANG")"; [ -n "$UI" ] || bad_lang "$GC_LANG"; LANG_SET="$UI"
else
  UI="$(lang_of "$OLD")"
  if [ -z "$UI" ]; then
    if [ -z "$HELP$BADOPT" ] && can_ask; then UI="$(ask_lang)"; LANG_SET="$UI"; else UI=en; fi
  fi
fi
[ -z "$HELP" ] || { say usage; exit 0; }
[ -z "$BADOPT" ] || { say bad_opt "$BADOPT" >&2; exit 2; }

OS="$(uname -s)"; ARCH="$(uname -m)"
case "$OS" in Linux|Darwin) ;; *) die os_unsupported "$OS" ;; esac
command -v curl >/dev/null || die need_curl
command -v tar >/dev/null || die need_tar
TOKEN="${GC_GITHUB_TOKEN:-}"
case "$TOKEN" in *[!A-Za-z0-9_.-]*) die tok_bad ;; esac
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

say banner "$B" "$N" "$DIR" "$OS" "$ARCH"
ok lang_ok

# ---------- chọn cách chạy
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
docker_ok() { command -v docker >/dev/null && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; }
if [ -z "$MODE" ]; then
  if docker_ok; then MODE="docker"
  elif [ "$OS" = "Linux" ] && [ "$(id -u)" = "0" -o -n "$(command -v sudo)" ]; then
    step docker_installing
    SUDO=""; [ "$(id -u)" = "0" ] || SUDO="sudo"
    curl -fsSL https://get.docker.com | $SUDO sh >/dev/null && $SUDO usermod -aG docker "$USER" 2>/dev/null || true
    docker_ok && MODE="docker" || { node_ok && MODE="native" || die docker_fail; }
  elif node_ok; then MODE="native"; warn native_fallback
  else die need_runtime
  fi
fi
[ "$MODE" = "native" ] && ! node_ok && die native_need_node
ok mode_ok "$MODE"

# ---------- tải bản phát hành
mkdir -p "$DIR/releases" "$DIR/data" "$DIR/backups" "$DIR/logs"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ -n "${GC_TARBALL:-}" ]; then
  # chỉ dùng khi kiểm thử: cài từ gói cục bộ (kèm SHA256SUMS cùng thư mục)
  cp "$GC_TARBALL" "$TMP/"; cp "$(dirname "$GC_TARBALL")/SHA256SUMS" "$TMP/"; TARNAME="$(basename "$GC_TARBALL")"
else
  if [ -n "$WANT" ]; then step find_ver "$WANT"; else step find_latest; fi
  API="${GC_GITHUB_API:-https://api.github.com}/repos/$REPO/releases/${WANT:+tags/}${WANT:-latest}"
  if [ -n "$TOKEN" ]; then
    # token đi qua tệp cấu hình curl (chmod 600), không nằm trên dòng lệnh nên không lộ trong ps.
    # curl không chuyển header Authorization tự đặt sang host khác khi bị chuyển hướng (GitHub chuyển file sang host lưu trữ có chữ ký).
    ( umask 077; printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" > "$TMP/auth.curl" )
    acurl() { curl -K "$TMP/auth.curl" ${1+"$@"}; }
    META="$(acurl -fsSL -H 'Accept: application/vnd.github+json' "$API" 2>/dev/null)" || die token_rejected "$REPO"
    # asset trong repo private chỉ tải được qua URL API (.../releases/assets/<id>); đọc tên từng asset để chọn đúng gói
    TARURL=""; SUMURL=""
    for AU in $(printf '%s' "$META" | grep -o '"url": *"[^"]*/releases/assets/[0-9]*"' | sed 's/.*"\(http[^"]*\)"/\1/'); do
      AN="$(acurl -fsSL -H 'Accept: application/vnd.github+json' "$AU" 2>/dev/null | grep -o '"name": *"[^"]*"' | head -1 | sed 's/.*: *"\(.*\)"/\1/')" || AN=""
      case "$AN" in
        gen-chibi-v[0-9]*.tar.gz) [ -n "$TARURL" ] || { TARURL="$AU"; TARNAME="$AN"; } ;;
        SHA256SUMS) SUMURL="$AU" ;;
      esac
    done
  else
    META="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$API" 2>/dev/null)" || META=""
    if [ -n "$META" ]; then
      TARURL="$(printf '%s' "$META" | grep -o '"browser_download_url": *"[^"]*\.tar\.gz"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')"
      SUMURL="$(printf '%s' "$META" | grep -o '"browser_download_url": *"[^"]*SHA256SUMS"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')"
    else
      # API GitHub giới hạn 60 lượt/giờ cho mỗi IP (mạng dùng chung IP hay hết lượt) → hỏi thẳng trang phát hành
      warn api_limited
      TAG="${WANT:-$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null | sed -n 's#.*/releases/tag/\(v[^/?]*\).*#\1#p' || true)}"
      [ -n "$TAG" ] || die private_help "$REPO"
      TARURL="https://github.com/$REPO/releases/download/$TAG/gen-chibi-$TAG.tar.gz"
      SUMURL="https://github.com/$REPO/releases/download/$TAG/SHA256SUMS"
      curl -fsSIL -o /dev/null "$SUMURL" 2>/dev/null || die private_help "$REPO"
    fi
    TARNAME="$(basename "$TARURL")"
  fi
  [ -n "$TARURL" ] && [ -n "$SUMURL" ] || die release_incomplete
  step downloading "$TARNAME"
  if [ -n "$TOKEN" ]; then
    acurl -fL --progress-bar -H 'Accept: application/octet-stream' -o "$TMP/$TARNAME" "$TARURL"
    acurl -fsSL -H 'Accept: application/octet-stream' -o "$TMP/SHA256SUMS" "$SUMURL"
  else
    curl -fL --progress-bar -o "$TMP/$TARNAME" "$TARURL"
    curl -fsSL -o "$TMP/SHA256SUMS" "$SUMURL"
  fi
fi
WANTSUM="$(grep " \*\?$TARNAME\$" "$TMP/SHA256SUMS" | cut -d' ' -f1)"
[ -n "$WANTSUM" ] && [ "$(sha256 "$TMP/$TARNAME")" = "$WANTSUM" ] || die bad_sum
ok sum_ok

VER="$(echo "$TARNAME" | sed 's/^gen-chibi-\(v[0-9][^/]*\)\.tar\.gz$/\1/')"
case "$VER" in v[0-9]*) ;; *) die bad_name;; esac
rm -rf "$DIR/releases/$VER"; mkdir -p "$DIR/releases/$VER"
tar -xzf "$TMP/$TARNAME" -C "$DIR/releases/$VER" --strip-components=1
ln -sfn "releases/$VER" "$DIR/current"
cp "$DIR/current/launcher.js" "$DIR/launcher.js"
cp "$DIR/current/docker-compose.yml" "$DIR/docker-compose.yml"
ok extracted "$VER"

# đặt/ thêm một dòng KHOÁ=giá trị trong .env mà không đưa giá trị lên dòng lệnh (awk đọc từ môi trường)
env_put() { # env_put KHOÁ BIẾN_CHỨA_GIÁ_TRỊ
  local tmp; tmp="$(mktemp)"
  K="$1" V="${!2}" awk 'BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; d = 0 }
    index($0, k "=") == 1 { print k "=" v; d = 1; next } { print } END { if (!d) print k "=" v }' "$DIR/.env" > "$tmp" && cat "$tmp" > "$DIR/.env"; rm -f "$tmp"
}

# ---------- .env (sinh một lần; không có bí mật mặc định)
if [ ! -f "$DIR/.env" ]; then
  KEY="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > "$DIR/.env" <<EOF
# gen-chibi — generated at install time. Do not share this file.
GC_MODE=$MODE
GC_PORT=$PORT
GC_BIND=127.0.0.1
GC_MASTER_KEY=$KEY
GC_AUTO_UPDATE=1
GC_UID=$(id -u)
GC_GID=$(id -g)
GC_REPO=$REPO
# Interface language (CLI + Studio default): en | vi — change with: genchibi lang vi|en
GC_LANG=$UI
# Private repo: fine-grained read-only token (Contents: Read-only) for auto-update
GC_GITHUB_TOKEN=$TOKEN
# Open to other machines on the network: set GC_BIND=0.0.0.0, GC_ALLOWED_HOSTS=<host name> and GC_API_TOKEN=<long random string>
GC_API_TOKEN=
GC_ALLOWED_HOSTS=
# Proxy (taken from this machine at install time, if any)
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
  case "${HTTPS_PROXY:-${https_proxy:-}}" in *127.0.0.1*|*localhost*) [ "$MODE" = docker ] && warn proxy_local "$DIR" ;; esac
  ok env_created
else
  sed -i.bak "s/^GC_MODE=.*/GC_MODE=$MODE/" "$DIR/.env" && rm -f "$DIR/.env.bak"
  [ -z "$TOKEN" ] || { env_put GC_GITHUB_TOKEN TOKEN; chmod 600 "$DIR/.env"; ok env_token; }
  # ngôn ngữ: chọn rõ lần này → ghi đè; .env cũ (trước v0.20) chưa có GC_LANG hoặc giá trị lạ → ghi giá trị đang dùng
  if [ -n "$LANG_SET" ] || [ -z "$(lang_of "$OLD")" ]; then env_put GC_LANG UI; fi
  ok env_kept
fi

# ---------- CLI
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
sed "s#__GC_HOME__#$DIR#" "$DIR/current/cli/genchibi" > "$BIN/genchibi"; chmod +x "$BIN/genchibi"
ok cli_ok "$BIN"
case ":$PATH:" in *":$BIN:"*) ;; *) warn path_hint "$BIN" "$(basename "${SHELL:-bash}")" ;; esac

# ---------- chạy
step starting
"$BIN/genchibi" start >/dev/null
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    printf "\n%s" "$G"; _t running; printf "%s$F%s\n" "" "$VER" "$N"
    say sum_studio "$B" "http://localhost:$PORT" "$N"
    say sum_cmds
    say sum_mcp "$BIN/genchibi"
    say sum_mcp_net
    say sum_update
    say sum_lang
    exit 0
  fi
  sleep 1
done
die no_answer "$PORT"
