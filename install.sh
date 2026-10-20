#!/usr/bin/env bash
# gen-chibi — one-command installer (Linux, macOS). Every value has a default; the only question is the language,
# asked once in an interactive terminal (Enter = English) and skipped when there is no terminal (CI, pipes).
# Running it again over an existing install without --lang keeps the language in use (the Studio default is never changed).
#   curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi
# Options: --dir <folder> (default ~/gen-chibi) · --port <port> (7480) · --native (run with Node, no Docker)
#          --version vX.Y.Z (default: latest) · --lang en|vi (default en; or GC_LANG=vi)
#          --domain <name> (go online: path A — the domain's A record → this machine, edge Caddy + HTTPS, Docker)
#          --domain <name> --cloudflare (path B — Cloudflare Tunnel with an API token: asked hidden in a terminal, otherwise GC_CF_TOKEN; never an argument)
# Private repo: set GC_GITHUB_TOKEN=<fine-grained token, Contents: Read-only> (see README). The token goes into .env and is never printed.
# © 2026 Gen Labs — All rights reserved.
set -euo pipefail

REPO="${GC_REPO:-colamacbook-ryan/Gen-Chibi}"
DIR="${GC_DIR:-$HOME/gen-chibi}"
PORT="${GC_PORT:-7480}"
MODE=""
WANT=""
LANG_ARG=""; HAS_LANG_ARG=""; BADOPT=""; HELP=""; DOMAIN=""; CF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --native) MODE="native"; shift ;;
    --docker) MODE="docker"; shift ;;
    --version) WANT="$2"; shift 2 ;;
    --lang) LANG_ARG="${2:-}"; HAS_LANG_ARG=1; if [ $# -gt 1 ]; then shift 2; else shift; fi ;;
    --lang=*) LANG_ARG="${1#--lang=}"; HAS_LANG_ARG=1; shift ;;
    --domain) DOMAIN="${2:-}"; if [ $# -gt 1 ]; then shift 2; else shift; fi ;;
    --domain=*) DOMAIN="${1#--domain=}"; shift ;;
    --cloudflare) CF=1; shift ;;
    -h|--help) HELP=1; shift ;;
    *) [ -n "$BADOPT" ] || BADOPT="$1"; shift ;;
  esac
done

B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'

# ---------- ngôn ngữ (ADR 0007): English mặc định; --lang / GC_LANG / .env của bản cài cũ / câu hỏi khi có terminal
# Hai bảng câu chữ _en / _vi (chuỗi printf, %s = đối số). bash 3.2: không mảng kết hợp; "$@" viết ${1+"$@"} (rỗng dưới set -u).
_en() {
  case "$1" in
    usage) F="gen-chibi installer (Linux, macOS)\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --domain chibi.example.com [--cloudflare]\nOptions: --dir <folder> (default ~/gen-chibi) · --port <port> (7480) · --native (run with Node, no Docker)\n         --docker · --version vX.Y.Z (default: latest) · --lang en|vi (default en; or GC_LANG=vi)\n         --domain <name>: go online after installing (beta) — path A: point the domain's A record at this machine (Docker, ports 80/443 open)\n         --domain <name> --cloudflare: path B (beta) — Cloudflare Tunnel; the API token is asked hidden, or read from GC_CF_TOKEN (never an argument)\nPrivate repo: set GC_GITHUB_TOKEN=<fine-grained token, Contents: Read-only> (see README). The token goes into .env and is never printed." ;;
    bad_opt) F="Unknown option: %s" ;;
    os_unsupported) F="Unsupported operating system %s (Linux, macOS)." ;;
    need_curl) F="curl is required." ;;
    need_tar) F="tar is required." ;;
    tok_bad) F="GC_GITHUB_TOKEN has invalid characters — copy the token again (letters, digits, _ . - only)." ;;
    banner) F="%sgen-chibi%s · installing to %s · %s %s" ;;
    lang_ok) F="Language: English (switch later: genchibi lang vi)" ;;
    lang_kept) F="Language: kept (Studio default unchanged; switch: genchibi lang en|vi)" ;;
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
    sum_cmds) F="  Commands:  genchibi start|stop|status|update|logs|backup|restore|mcp|online|open|password|lang|uninstall" ;;
    sum_mcp) F="  MCP:       claude mcp add gen-chibi -- %s mcp" ;;
    sum_mcp_net) F="  Go online (domain + HTTPS + MCP): genchibi online --help, or Studio › System › Go online" ;;
    root_uid) F="Running as root: the containers run as user %s:%s (not root) — %s now belongs to that user" ;;
    sum_update) F="  Auto-update: on (turn off in Studio › System › Updates)" ;;
    sum_lang) F="  Language:  English (Vietnamese: genchibi lang vi, or the language switch in the Studio)" ;;
    no_answer) F="gen-chibi is not answering on port %s yet. See: genchibi logs" ;;
    dom_bad) F="Invalid domain: %s (a name like chibi.example.com — no IP, no port, no *)" ;;
    cf_need_domain) F="--cloudflare goes with --domain <name>, e.g. --domain chibi.example.com --cloudflare" ;;
    cf_tok_none) F="--cloudflare needs a Cloudflare API token: in a terminal the installer asks for it (hidden); without a terminal set GC_CF_TOKEN in the environment — never as an argument." ;;
    cf_tok_bad) F="GC_CF_TOKEN looks wrong (too short or unexpected characters) — copy the token again from dash.cloudflare.com." ;;
    docker_group) F="Docker is installed, but this login session is not in the docker group yet — continuing with %s. Log out and back in to use genchibi without sudo." ;;
    dns_check) F="Checking that %s points to this machine…" ;;
    dns_ok) F="%s → %s (this machine)" ;;
    dns_wrong) F="%s does not point to this machine yet (now: %s). Create this record at your DNS provider:  A  %s  →  %s" ;;
    dns_none) F="none" ;;
    dns_noip) F="Could not find this machine's public IP — the app checks DNS in the next step" ;;
    dns_wait) F="Waiting up to %s minutes for the record (checked every %s s; Ctrl-C stops — later: genchibi online caddy %s)" ;;
    dns_gave_up) F="%s still does not point to %s. gen-chibi is installed and running; once the A record is in place run: genchibi online caddy %s" ;;
    caddy_native) F="--domain without --cloudflare needs Docker mode (Caddy on ports 80/443). Use --cloudflare, or later: genchibi online cloudflare %s" ;;
    online_go) F="Going online: %s" ;;
    online_fail) F="Going online did not finish — gen-chibi is installed and running. Fix the step marked ✗ above, then: genchibi online recheck" ;;
    sum_online) F="  Online:    %s%s%s  ·  MCP: %s/mcp" ;;
    sum_setup) F="Setup code: %s%s%s (one-time, 1 hour) — open %s/setup and choose the owner password%s" ;;
    sum_setup_local) F=" (on this machine: genchibi open)" ;;
    sum_online_wait) F="  Online (temporary — waiting for the owner password): %s%s%s  ·  MCP: %s/mcp" ;;
    sum_setup_online) F=" — once it is set the app finishes going online by itself (or on the server: genchibi password)" ;;
  esac
}
_vi() {
  case "$1" in
    usage) F="Trình cài gen-chibi (Linux, macOS)\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi\n  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --domain chibi.example.com [--cloudflare]\nTuỳ chọn: --dir <thư mục> (mặc định ~/gen-chibi) · --port <cổng> (7480) · --native (chạy bằng Node, không Docker)\n          --docker · --version vX.Y.Z (mặc định bản mới nhất) · --lang en|vi (mặc định en; hoặc GC_LANG=vi)\n          --domain <tên>: ra Internet ngay sau khi cài (beta) — đường A: trỏ bản ghi A của tên miền về máy này (Docker, mở cổng 80/443)\n          --domain <tên> --cloudflare: đường B (beta) — Cloudflare Tunnel; API token được hỏi ẩn, hoặc đọc GC_CF_TOKEN (không bao giờ là đối số)\nRepo private: đặt GC_GITHUB_TOKEN=<fine-grained token, Contents: Read-only> (xem README). Token được ghi vào .env, không in ra." ;;
    bad_opt) F="Tuỳ chọn lạ: %s" ;;
    os_unsupported) F="Chưa hỗ trợ hệ điều hành %s (Linux, macOS)." ;;
    need_curl) F="Cần curl." ;;
    need_tar) F="Cần tar." ;;
    tok_bad) F="GC_GITHUB_TOKEN có ký tự lạ — chép lại token (chỉ gồm chữ, số, _ . -)." ;;
    banner) F="%sgen-chibi%s · cài vào %s · %s %s" ;;
    lang_ok) F="Ngôn ngữ: Tiếng Việt (đổi sau: genchibi lang en)" ;;
    lang_kept) F="Ngôn ngữ: giữ nguyên (mặc định của Studio không đổi; đổi: genchibi lang en|vi)" ;;
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
    sum_cmds) F="  Lệnh:    genchibi start|stop|status|update|logs|backup|restore|mcp|online|open|password|lang|uninstall" ;;
    sum_mcp) F="  MCP:     claude mcp add gen-chibi -- %s mcp" ;;
    sum_mcp_net) F="  Ra Internet (tên miền + HTTPS + MCP): genchibi online --help, hoặc Studio › Hệ thống › Lên mạng" ;;
    root_uid) F="Đang chạy bằng root: container chạy bằng user %s:%s (không phải root) — %s giờ thuộc user đó" ;;
    sum_update) F="  Tự cập nhật: bật (tắt trong Studio › Hệ thống › Cập nhật)" ;;
    sum_lang) F="  Ngôn ngữ: Tiếng Việt (English: genchibi lang en, hoặc nút chuyển ngôn ngữ trong Studio)" ;;
    no_answer) F="Chưa thấy gen-chibi trả lời ở cổng %s. Xem: genchibi logs" ;;
    dom_bad) F="Tên miền không hợp lệ: %s (dạng chibi.example.com — không IP, không cổng, không *)" ;;
    cf_need_domain) F="--cloudflare đi cùng --domain <tên>, vd --domain chibi.example.com --cloudflare" ;;
    cf_tok_none) F="--cloudflare cần API token Cloudflare: có terminal thì trình cài hỏi (ẩn); không có terminal thì đặt GC_CF_TOKEN trong môi trường — không bao giờ là đối số." ;;
    cf_tok_bad) F="GC_CF_TOKEN có vẻ sai (quá ngắn hoặc ký tự lạ) — chép lại token từ dash.cloudflare.com." ;;
    docker_group) F="Đã cài Docker nhưng phiên đăng nhập này chưa vào nhóm docker — tiếp tục bằng %s. Đăng xuất rồi vào lại để dùng genchibi không cần sudo." ;;
    dns_check) F="Kiểm %s đã trỏ về máy này chưa…" ;;
    dns_ok) F="%s → %s (máy này)" ;;
    dns_wrong) F="%s chưa trỏ về máy này (hiện: %s). Tạo bản ghi này ở nơi quản lý DNS:  A  %s  →  %s" ;;
    dns_none) F="chưa có" ;;
    dns_noip) F="Không tìm được IP công khai của máy — app sẽ kiểm DNS ở bước sau" ;;
    dns_wait) F="Chờ bản ghi tối đa %s phút (kiểm mỗi %s giây; Ctrl-C để dừng — sau đó: genchibi online caddy %s)" ;;
    dns_gave_up) F="%s vẫn chưa trỏ về %s. gen-chibi đã cài và đang chạy; trỏ xong bản ghi A thì chạy: genchibi online caddy %s" ;;
    caddy_native) F="--domain không kèm --cloudflare cần chế độ Docker (Caddy giữ cổng 80/443). Dùng --cloudflare, hoặc sau này: genchibi online cloudflare %s" ;;
    online_go) F="Đưa lên Internet: %s" ;;
    online_fail) F="Chưa ra Internet xong — gen-chibi đã cài và đang chạy. Sửa bậc ✗ ở trên rồi chạy: genchibi online recheck" ;;
    sum_online) F="  Online:  %s%s%s  ·  MCP: %s/mcp" ;;
    sum_setup) F="Mã setup: %s%s%s (dùng một lần, 1 giờ) — mở %s/setup và đặt mật khẩu chủ%s" ;;
    sum_setup_local) F=" (trên máy này: genchibi open)" ;;
    sum_online_wait) F="  Online (tạm — chờ mật khẩu chủ): %s%s%s  ·  MCP: %s/mcp" ;;
    sum_setup_online) F=" — đặt xong là app tự hoàn tất lên mạng (hoặc trên máy chủ: genchibi password)" ;;
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
studio_lang() { # mặc định của Studio đang dùng (data/settings.json › uiLang, do server ghi) — sed, không cần node / jq
  sed -n 's/.*"uiLang"[[:space:]]*:[[:space:]]*"\([A-Za-z_-]*\)".*/\1/p' "$DIR/data/settings.json" 2>/dev/null | head -1 || true
}
# MỘT nguồn sự thật cho ngôn ngữ của máy: data/settings.json › uiLang. GC_LANG trong .env chỉ là giá trị KHỞI TẠO (cài mới) hoặc ghi đè CÓ CHỦ Ý.
LANG_SET=""   # có giá trị khi người cài chọn rõ (--lang / GC_LANG / câu hỏi) → ghi vào .env cả khi .env đã có
KEPT=""       # bản cài đã có (.env chưa có GC_LANG — trước v0.20 — hoặc đã có settings.json) mà lần này không chọn → không hỏi, không ghi GC_LANG:
              # server áp luật nâng cấp (có dữ liệu → giữ tiếng Việt), mặc định của Studio giữ nguyên (CNS-152)
OLD="$( [ -f "$DIR/.env" ] && sed -n 's/^GC_LANG=//p' "$DIR/.env" | tail -1 || true)"   # ngôn ngữ ghi trong .env của bản cài cũ (cài lại / nâng cấp)
if [ -n "$HAS_LANG_ARG" ]; then
  UI="$(lang_of "$LANG_ARG")"; [ -n "$UI" ] || bad_lang "$LANG_ARG"; LANG_SET="$UI"
elif [ -n "${GC_LANG:-}" ]; then
  UI="$(lang_of "$GC_LANG")"; [ -n "$UI" ] || bad_lang "$GC_LANG"; LANG_SET="$UI"
else
  UI="$(lang_of "$OLD")"
  if [ -z "$UI" ]; then
    if [ -f "$DIR/.env" ] || [ -f "$DIR/data/settings.json" ]; then
      # trình cài nói theo mặc định của Studio; chưa có (bản ≤ v0.19 chưa chạy v0.20 lần nào) mà .env có sẵn → tiếng Việt (≤ v0.19 chỉ có tiếng Việt)
      KEPT=1; UI="$(lang_of "$(studio_lang)")"
      if [ -z "$UI" ]; then if [ -f "$DIR/.env" ]; then UI=vi; else UI=en; fi; fi
    elif [ -z "$HELP$BADOPT" ] && can_ask; then UI="$(ask_lang)"; LANG_SET="$UI"
    else UI=en; fi
  fi
fi
[ -z "$HELP" ] || { say usage; exit 0; }
[ -z "$BADOPT" ] || { say bad_opt "$BADOPT" >&2; exit 2; }
# --domain / --cloudflare (v0.21 §3.6): kiểm trước khi đụng tới đĩa. Token Cloudflare: GC_CF_TOKEN đọc một lần rồi xoá khỏi môi trường (tiến trình con —
# curl, Docker, get.docker.com — không thừa hưởng); không có thì hỏi ẩn ở bước Go online (cần terminal) — không terminal thì dừng NGAY, chưa cài gì.
if [ -n "$DOMAIN" ]; then
  [[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$ ]] && [ "${#DOMAIN}" -le 253 ] || { say dom_bad "$DOMAIN" >&2; exit 2; }
  DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z')"
fi
CFTOK=""
if [ -n "$CF" ]; then
  [ -n "$DOMAIN" ] || { say cf_need_domain >&2; exit 2; }
  CFTOK="${GC_CF_TOKEN:-}"
  if [ -n "$CFTOK" ]; then
    case "$CFTOK" in *[!A-Za-z0-9_.-]*) say cf_tok_bad >&2; exit 2 ;; esac
    [ "${#CFTOK}" -ge 20 ] || { say cf_tok_bad >&2; exit 2; }
  elif ! can_ask; then say cf_tok_none >&2; exit 2; fi
fi
unset GC_CF_TOKEN

OS="$(uname -s)"; ARCH="$(uname -m)"
case "$OS" in Linux|Darwin) ;; *) die os_unsupported "$OS" ;; esac
command -v curl >/dev/null || die need_curl
command -v tar >/dev/null || die need_tar
TOKEN="${GC_GITHUB_TOKEN:-}"
case "$TOKEN" in *[!A-Za-z0-9_.-]*) die tok_bad ;; esac
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

say banner "$B" "$N" "$DIR" "$OS" "$ARCH"
if [ -n "$KEPT" ]; then ok lang_kept; else ok lang_ok; fi

# ---------- chọn cách chạy
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
docker_ok() { command -v docker >/dev/null && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; }
# Docker dùng được trong PHIÊN NÀY không (CNS-174): thẳng · qua nhóm docker bằng sg (user đã có tên trong nhóm — vừa usermod — nhưng phiên đăng nhập chưa nhận;
# chỉ thử sg khi /etc/group đã ghi tên, để sg không hỏi mật khẩu nhóm) · sudo không hỏi mật khẩu (vừa nhập cho get.docker.com). → DOCKER_VIA = "" | sg | sudo
DOCKER_VIA=""
docker_access() {
  DOCKER_VIA=""
  docker_ok && return 0
  command -v docker >/dev/null || return 1
  local g; g=" $(id -nG "$(id -un 2>/dev/null)" 2>/dev/null) "
  case "$g" in *" docker "*)
    if command -v sg >/dev/null && sg docker -c 'docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1' </dev/null >/dev/null 2>&1; then DOCKER_VIA=sg; return 0; fi ;;
  esac
  if [ "$(id -u)" != 0 ] && command -v sudo >/dev/null && sudo -n docker info </dev/null >/dev/null 2>&1 && sudo -n docker compose version </dev/null >/dev/null 2>&1; then DOCKER_VIA=sudo; return 0; fi
  return 1
}
DOCKER_SH="https://get.docker.com"
[ "${GC_TEST:-}" != 1 ] || DOCKER_SH="${GC_TEST_DOCKER_SH:-$DOCKER_SH}"   # CHỈ cho kiểm thử (tools/test-lang.sh): script cài Docker giả
if [ -z "$MODE" ]; then
  if docker_access; then MODE="docker"
  elif [ "$OS" = "Linux" ] && [ "$(id -u)" = "0" -o -n "$(command -v sudo)" ]; then
    step docker_installing
    SUDO=""; [ "$(id -u)" = "0" ] || SUDO="sudo"
    curl -fsSL "$DOCKER_SH" | $SUDO sh >/dev/null && $SUDO usermod -aG docker "$(id -un)" 2>/dev/null || true
    docker_access && MODE="docker" || { node_ok && MODE="native" || die docker_fail; }
  elif node_ok; then MODE="native"; warn native_fallback
  else die need_runtime
  fi
elif [ "$MODE" = docker ]; then docker_access || true
fi
[ "$MODE" = "native" ] && ! node_ok && die native_need_node
ok mode_ok "$MODE"
if [ -n "$DOCKER_VIA" ]; then
  if [ "$DOCKER_VIA" = sg ]; then warn docker_group "sg docker"; else warn docker_group "sudo docker"; fi
  export GC_DOCKER_VIA="$DOCKER_VIA"   # genchibi (start, online…) trong phiên này dùng cùng đường
fi

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

# ---------- user của container (Docker): trình cài chạy bằng root → KHÔNG cho container chạy root (GC_UID=0 = app + edge Caddy là root trong container).
# Dùng uid của người gọi sudo (SUDO_USER) nếu có, không thì 1000:1000; thư mục cài chown cho user đó (bind mount data/ edge/ run/ phải ghi được).
CUID="$(id -u)"; CGID="$(id -g)"; AS_ROOT=""
if [ "$CUID" = 0 ] && [ "$MODE" = docker ]; then
  AS_ROOT=1; CUID=1000; CGID=1000
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ] && id -u "$SUDO_USER" >/dev/null 2>&1 && [ "$(id -u "$SUDO_USER")" != 0 ]; then CUID="$(id -u "$SUDO_USER")"; CGID="$(id -g "$SUDO_USER")"; fi
fi

# ---------- .env (sinh một lần; không có bí mật mặc định)
if [ ! -f "$DIR/.env" ]; then
  KEY="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  APITOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"   # v0.21: bản cài nào cũng có token chủ (CLI, agent, đăng nhập dự phòng — spec §3.4 T)
  ENV_LANG="$UI"; [ -z "$KEPT" ] || ENV_LANG=""   # dữ liệu có sẵn mà không chọn: không đặt GC_LANG (giữ mặc định của Studio)
  cat > "$DIR/.env" <<EOF
# gen-chibi — generated at install time. Do not share this file.
GC_MODE=$MODE
GC_PORT=$PORT
GC_BIND=127.0.0.1
GC_MASTER_KEY=$KEY
GC_AUTO_UPDATE=1
GC_UID=$CUID
GC_GID=$CGID
GC_REPO=$REPO
# Interface language (CLI + initial Studio default): en | vi — change with: genchibi lang vi|en (empty = follow the Studio default)
GC_LANG=$ENV_LANG
# Private repo: fine-grained read-only token (Contents: Read-only) for auto-update
GC_GITHUB_TOKEN=$TOKEN
# Owner token: the CLI, agents (Authorization: Bearer) and the Studio's "use a token" sign-in use it. Keep it secret.
GC_API_TOKEN=$APITOKEN
# Open to other machines on the network: set GC_BIND=0.0.0.0 and GC_ALLOWED_HOSTS=<host name> (the Studio then asks for the owner password)
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
  # ngôn ngữ: CHỈ ghi khi người cài chọn rõ lần này. .env cũ (trước v0.20) chưa có GC_LANG → không ghi gì: server giữ ngôn ngữ đang dùng (CNS-152)
  if [ -n "$LANG_SET" ]; then env_put GC_LANG UI; fi
  # bản cài cũ do root cài (GC_UID=0) → đổi sang user thường (chown ở dưới)
  if [ -n "$AS_ROOT" ] && grep -q '^GC_UID=0$' "$DIR/.env"; then env_put GC_UID CUID; env_put GC_GID CGID; fi
  # móc kiểm thử không bao giờ nằm trong .env (review bảo mật 🟡7): CLI nạp .env bằng set -a → app / launcher sẽ thấy
  if grep -q '^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}GC_TEST' "$DIR/.env"; then tmp="$(mktemp)"; grep -v '^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}GC_TEST' "$DIR/.env" > "$tmp"; cat "$tmp" > "$DIR/.env"; rm -f "$tmp"; fi
  ok env_kept
fi
if [ -n "$AS_ROOT" ]; then
  # GC_UID trong .env (có thể đã có từ trước, khác 0) là user container dùng — chown theo đúng nó
  CUID="$(sed -n 's/^GC_UID=\([0-9]*\)$/\1/p' "$DIR/.env" | tail -1)"; CGID="$(sed -n 's/^GC_GID=\([0-9]*\)$/\1/p' "$DIR/.env" | tail -1)"
  chown -R "${CUID:-1000}:${CGID:-1000}" "$DIR"; warn root_uid "${CUID:-1000}" "${CGID:-1000}" "$DIR"
fi

# ---------- CLI
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
sed "s#__GC_HOME__#$DIR#" "$DIR/current/cli/genchibi" > "$BIN/genchibi"; chmod +x "$BIN/genchibi"
ok cli_ok "$BIN"
case ":$PATH:" in *":$BIN:"*) ;; *) warn path_hint "$BIN" "$(basename "${SHELL:-bash}")" ;; esac

# ---------- Go online (--domain [--cloudflare]) — v0.21 §2 / §3.6: cùng lệnh genchibi online (API /api/online/*) mà owner dùng sau này
dns_a() { # IPv4 hiện tại của $1, cách nhau dấu cách (resolver của máy; app kiểm lại ở nameserver có thẩm quyền)
  if [ "${GC_TEST:-}" = 1 ] && [ -n "${GC_TEST_DNS_A+x}" ]; then printf '%s' "$GC_TEST_DNS_A" | tr ',' ' '; return 0; fi
  local r=""
  if command -v getent >/dev/null; then r="$(getent ahostsv4 "$1" 2>/dev/null | awk '{ print $1 }' | sort -u | tr '\n' ' ')"
  elif command -v dig >/dev/null; then r="$(dig +short A "$1" 2>/dev/null | grep -E '^[0-9.]+$' | tr '\n' ' ')"
  elif command -v host >/dev/null; then r="$(host -t A "$1" 2>/dev/null | awk '/has address/ { print $NF }' | tr '\n' ' ')"
  elif command -v nslookup >/dev/null; then r="$(nslookup "$1" 2>/dev/null | awk '/^Name:/ { n = 1 } n && /^Address/ { print $NF }' | tr '\n' ' ')"; fi
  printf '%s' "${r% }"
}
public_ip() { # IPv4 ra Internet của máy (đi thẳng, không qua proxy công ty — như app: https://1.1.1.1/cdn-cgi/trace)
  if [ "${GC_TEST:-}" = 1 ] && [ -n "${GC_TEST_PUBLIC_IP+x}" ]; then printf '%s' "$GC_TEST_PUBLIC_IP"; return 0; fi
  curl -fsS --noproxy '*' -m 6 https://1.1.1.1/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=\([0-9.]*\)$/\1/p' | head -n 1
}
go_online() { # 0 đã ra Internet (xong, hoặc chỉ còn chờ mật khẩu chủ — VPS mới luôn dừng ở đây, mã setup in ở dòng cuối) · khác: chưa xong (app vẫn chạy)
  local ip a waited=0 limit poll rc
  if [ -z "$CF" ]; then
    step dns_check "$DOMAIN"
    ip="$(public_ip)"
    if [ -z "$ip" ]; then warn dns_noip
    else
      limit=$(( ${GC_DNS_WAIT:-10} * 60 )); poll="${GC_DNS_POLL:-15}"
      a="$(dns_a "$DOMAIN")"
      while :; do
        case " $a " in *" $ip "*) ok dns_ok "$DOMAIN" "$ip"; break ;; esac
        if [ "$waited" = 0 ]; then
          warn dns_wrong "$DOMAIN" "${a:-$(_t dns_none; printf '%s' "$F")}" "$DOMAIN" "$ip"
          [ "$limit" -gt 0 ] && say dns_wait "${GC_DNS_WAIT:-10}" "$poll" "$DOMAIN"
        fi
        if [ "$waited" -ge "$limit" ]; then warn dns_gave_up "$DOMAIN" "$ip" "$DOMAIN"; return 1; fi
        sleep "$poll"; waited=$((waited + poll)); a="$(dns_a "$DOMAIN")"
      done
    fi
    [ "$MODE" = docker ] || { warn caddy_native "$DOMAIN"; return 1; }
    step online_go "https://$DOMAIN"
    "$BIN/genchibi" online caddy "$DOMAIN" --yes && rc=0 || rc=$?
  else
    step online_go "https://$DOMAIN"
    if [ -n "$CFTOK" ]; then printf '%s\n' "$CFTOK" | "$BIN/genchibi" online cloudflare "$DOMAIN" --token-stdin --yes && rc=0 || rc=$?
    else "$BIN/genchibi" online cloudflare "$DOMAIN" --yes && rc=0 || rc=$?; fi   # hỏi token ẩn trên terminal
    CFTOK=""
  fi
  case "$rc" in 0|3) ONLINE="https://$DOMAIN"; BASE="$ONLINE"; [ "$rc" = 3 ] && ONLINE_WAIT=1; return 0 ;; esac
  warn online_fail; return "$rc"
}
finish_lines() { # dòng cuối: địa chỉ online (nếu có) + MÃ SETUP khi chưa có mật khẩu chủ (server ghi data/setup-code.txt lúc khởi động)
  local c="" e="" i
  # chưa có mật khẩu chủ: luồng Go online dừng ở bậc cuối, địa chỉ chỉ đang bật TẠM (CNS-209) — nói rõ, rồi dòng cuối = mã setup
  local nopw=""; case "$(curl -fsS -m 5 "http://127.0.0.1:$PORT/api/auth/state" 2>/dev/null || true)" in *'"password":false'*) nopw=1 ;; esac
  if [ -n "$ONLINE" ]; then if [ -n "$ONLINE_WAIT" ] && [ -n "$nopw" ]; then say sum_online_wait "$B" "$ONLINE" "$N" "$ONLINE"; else say sum_online "$B" "$ONLINE" "$N" "$ONLINE"; fi; fi
  [ -n "$nopw" ] || return 0   # đã có mật khẩu chủ
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if [ -r "$DIR/data/setup-code.txt" ]; then c="$(sed -n '1p' "$DIR/data/setup-code.txt" | tr -d ' \r')"; break; fi
    sleep 0.5
  done
  case "$c" in [0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]-[0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]) ;; *) return 0 ;; esac
  if [ "$BASE" = "http://localhost:$PORT" ]; then _t sum_setup_local; e="$F"; elif [ -n "$ONLINE_WAIT" ]; then _t sum_setup_online; e="$F"; fi
  printf '\n'; say sum_setup "$B" "$c" "$N" "$BASE" "$e"
}

# ---------- chạy
step starting
"$BIN/genchibi" start >/dev/null
for i in $(seq 1 60); do
  if H="$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"; then
    SL="$(lang_of "$(printf '%s' "$H" | sed -n 's/.*"uiLang"[[:space:]]*:[[:space:]]*"\([A-Za-z_-]*\)".*/\1/p')")"
    # chọn rõ mà mặc định của Studio vẫn khác (.env đã đúng từ trước, Studio từng đổi; hoặc app cũ còn chạy) → genchibi lang đồng bộ qua API
    if [ -n "$LANG_SET" ] && [ -n "$SL" ] && [ "$SL" != "$UI" ]; then "$BIN/genchibi" lang "$UI" >/dev/null 2>&1 || true; fi
    # giữ nguyên: tóm tắt nói theo mặc định THẬT của Studio (server vừa áp luật nâng cấp)
    if [ -n "$KEPT" ] && [ -n "$SL" ]; then UI="$SL"; fi
    printf "\n%s" "$G"; _t running; printf "%s$F%s\n" "" "$VER" "$N"
    say sum_studio "$B" "http://localhost:$PORT" "$N"
    say sum_cmds
    say sum_mcp "$BIN/genchibi"
    say sum_mcp_net
    say sum_update
    say sum_lang
    RC=0; ONLINE=""; ONLINE_WAIT=""; BASE="http://localhost:$PORT"
    if [ -n "$DOMAIN" ]; then go_online && RC=0 || RC=$?; fi
    finish_lines
    exit "$RC"
  fi
  sleep 1
done
die no_answer "$PORT"
