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
#          --domain also sets up the owner account first (v0.23): username + password asked in the terminal (password hidden), otherwise read from
#          GC_OWNER_USER / GC_OWNER_PASSWORD (read once, removed from the environment, never written to .env / argv / logs); neither → installs, does not go
#          online, prints the next commands. Without --domain the last line says: open http://localhost:7480 and sign in with admin / admin within 30 minutes.
# Private repo: set GC_GITHUB_TOKEN=<fine-grained token, Contents: Read-only> (see README). The token goes into .env and is never printed.
# © 2026 Gen Labs — All rights reserved.
set -euo pipefail
# tài khoản chủ cho --domain (v0.23 §A.4, CNS-264): đọc GC_OWNER_USER / GC_OWNER_PASSWORD MỘT lần rồi xoá khỏi môi trường NGAY — trước mọi tiến trình con
# (sed, curl, Docker, get.docker.com…): không tiến trình nào thừa hưởng, không vào .env / argv / log. Mật khẩu chỉ đi qua stdin của genchibi password.
OWNER_U="${GC_OWNER_USER-}"; OWNER_P="${GC_OWNER_PASSWORD-}"; OWNER_FROM_ENV=""; [ -z "$OWNER_U$OWNER_P" ] || OWNER_FROM_ENV=1
unset GC_OWNER_USER GC_OWNER_PASSWORD

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
    docker_rec) F="%s is a Docker install, but Docker cannot be used right now — not switching it to Node mode. Fix Docker access (or run with --native on purpose), then run the installer again." ;;
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
    sum_cmds) F="  Commands:  genchibi start|stop|status|update|rollback|doctor|logs|backup|restore|mcp|online|open|password|lang|uninstall" ;;
    sum_mcp) F="  MCP:       claude mcp add gen-chibi -- %s mcp" ;;
    sum_mcp_net) F="  Go online (domain + HTTPS + MCP): genchibi online --help, or Studio › System › Go online" ;;
    root_uid) F="Running as root: the containers run as user %s:%s (not root) — %s now belongs to that user" ;;
    sys_user_ok) F="Running as root without sudo: the containers run as the system account %s (%s:%s, no login) — not root, not a person's account" ;;
    root_trust) F="genchibi command: verified copy in %s (it never runs or loads files the app can write)" ;;
    priv_group) F="Refusing to install: %s belongs to group %s, a privileged group (docker, sudo, wheel, adm…) — the containers must not run with it. Give the folder to a normal account (or use another --dir)." ;;
    td_unsafe) F="Refusing to install: %s (genchibi's verified files) or a folder above it can be changed by another user, or it is inside the install folder." ;;
    root_nodrop) F="Cannot act as the install folder's owner (uid %s): neither setpriv nor sudo is available. Refusing to write into it as root." ;;
    root_link) F="Refusing to install: %s is a symbolic link — an existing install folder must not redirect root's writes. Remove the link (or use another --dir) and run again." ;;
    root_legacy_uid) F="This install keeps GC_UID=%s from an old root install (v0.21.0–0.21.2 guessed 1000). Check and move it to the genchibi system account: genchibi doctor" ;;
    sys_user_fail) F="Running as root without sudo, and the system account %s could not be created (no useradd / adduser). gen-chibi was not installed. Rerun from your own account: sudo bash install.sh … — the app then runs as your user, never as root." ;;
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
    own_intro) F="--domain: set up the owner account first (going online needs it; the Studio asks for nothing else at the first sign-in except the MCP check)." ;;
    own_ask_user) F="Owner username (3–32: a-z 0-9 . _ -, not admin): " ;;
    own_ask_pw) F="Owner password (at least 12 characters, hidden while typing): " ;;
    own_ask_pw2) F="Repeat the password: " ;;
    own_bad_user) F="Invalid owner username: 3–32 characters a-z 0-9 . _ - and not admin." ;;
    own_bad_pw) F="The owner password needs at least 12 characters (no control characters, not admin)." ;;
    own_mismatch) F="The two passwords differ." ;;
    own_set) F="Owner account ready: username %s" ;;
    own_fail) F="Could not set up the owner account — not going online. Next: genchibi password, then genchibi online %s %s" ;;
    own_none) F="Not going online: no owner account yet (no terminal to ask, and GC_OWNER_USER / GC_OWNER_PASSWORD are not set). gen-chibi is installed and running." ;;
    own_next) F="Next, on this machine: genchibi password (sets the owner account), then: genchibi online %s %s" ;;
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
    docker_rec) F="%s là bản cài Docker, nhưng lúc này không dùng được Docker — không tự chuyển sang chế độ Node. Sửa quyền / Docker (hoặc chủ ý chạy với --native) rồi chạy lại trình cài." ;;
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
    sum_cmds) F="  Lệnh:    genchibi start|stop|status|update|rollback|doctor|logs|backup|restore|mcp|online|open|password|lang|uninstall" ;;
    sum_mcp) F="  MCP:     claude mcp add gen-chibi -- %s mcp" ;;
    sum_mcp_net) F="  Ra Internet (tên miền + HTTPS + MCP): genchibi online --help, hoặc Studio › Hệ thống › Lên mạng" ;;
    root_uid) F="Đang chạy bằng root: container chạy bằng user %s:%s (không phải root) — %s giờ thuộc user đó" ;;
    sys_user_ok) F="Đang chạy bằng root không qua sudo: container chạy bằng tài khoản hệ thống %s (%s:%s, không đăng nhập được) — không phải root, không phải tài khoản của ai" ;;
    root_trust) F="Lệnh genchibi: bản chép đã kiểm ở %s (không bao giờ chạy hay nạp tệp mà app ghi được)" ;;
    priv_group) F="Từ chối cài: %s thuộc nhóm %s, một nhóm đặc quyền (docker, sudo, wheel, adm…) — container không được chạy với nó. Giao thư mục cho một tài khoản thường (hoặc dùng --dir khác)." ;;
    td_unsafe) F="Từ chối cài: %s (tệp đã kiểm của genchibi) hoặc một thư mục phía trên nó user khác đổi được, hoặc nó nằm trong thư mục cài." ;;
    root_nodrop) F="Không làm việc được bằng chủ thư mục cài (uid %s): không có setpriv hay sudo. Từ chối ghi vào đó bằng root." ;;
    root_link) F="Từ chối cài: %s là liên kết tượng trưng — thư mục cài có sẵn không được chuyển hướng chỗ root ghi. Gỡ liên kết (hoặc dùng --dir khác) rồi chạy lại." ;;
    root_legacy_uid) F="Bản cài này giữ GC_UID=%s của bản cài root cũ (v0.21.0–0.21.2 đoán 1000). Kiểm và chuyển sang tài khoản hệ thống genchibi: genchibi doctor" ;;
    sys_user_fail) F="Đang chạy bằng root không qua sudo và không tạo được tài khoản hệ thống %s (không có useradd / adduser). Chưa cài gen-chibi. Chạy lại từ tài khoản của bạn: sudo bash install.sh … — app sẽ chạy bằng user của bạn, không bao giờ bằng root." ;;
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
    own_intro) F="--domain: đặt tài khoản chủ trước (lên mạng cần tài khoản này; lần đăng nhập đầu Studio chỉ còn bước chẩn đoán MCP)." ;;
    own_ask_user) F="Tên đăng nhập chủ (3–32: a-z 0-9 . _ -, không phải admin): " ;;
    own_ask_pw) F="Mật khẩu chủ (ít nhất 12 ký tự, ẩn khi gõ): " ;;
    own_ask_pw2) F="Nhập lại mật khẩu: " ;;
    own_bad_user) F="Tên đăng nhập chủ không hợp lệ: 3–32 ký tự a-z 0-9 . _ - và không phải admin." ;;
    own_bad_pw) F="Mật khẩu chủ cần ít nhất 12 ký tự (không ký tự điều khiển, không phải admin)." ;;
    own_mismatch) F="Hai lần nhập mật khẩu không khớp." ;;
    own_set) F="Đã có tài khoản chủ: tên đăng nhập %s" ;;
    own_fail) F="Không đặt được tài khoản chủ — chưa lên mạng. Bước tiếp: genchibi password, rồi genchibi online %s %s" ;;
    own_none) F="Chưa lên mạng: chưa có tài khoản chủ (không có terminal để hỏi, cũng không có GC_OWNER_USER / GC_OWNER_PASSWORD). gen-chibi đã cài và đang chạy." ;;
    own_next) F="Bước tiếp, trên máy này: genchibi password (đặt tài khoản chủ), rồi: genchibi online %s %s" ;;
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
# Thư mục cài CÓ SẴN thuộc user khác (bản cài Docker cũ — user của container ghi được cả thư mục) mà trình cài chạy bằng root (CNS-257): mọi đọc / ghi trong đó
# chạy bằng CHÍNH user đó (in_dir: setpriv → sudo -u '#uid'), không bằng root — symlink cài sẵn (.env.gc-tmp → /etc/shadow, releases/<bản> → /etc…) không
# chuyển hướng được chỗ root ghi, tệp của root không bị đọc vào. Thư mục mới / của root / trình cài không chạy bằng root → chạy thẳng như cũ.
DIR_UID=0; DIR_GID=0
if [ -d "$DIR" ]; then DIR_UID="$(ls -ldn "$DIR/." | awk '{ print $3 }')"; DIR_GID="$(ls -ldn "$DIR/." | awk '{ print $4 }')"; fi
# in_dir LỆNH… (đường TƯƠNG ĐỐI với thư mục cài): cwd = thư mục cài (root cd vào trước — đi được cả khi cha là /root 0700), rồi hạ quyền nếu cần
in_dir() {
  [ -d "$DIR" ] || return 1
  if [ "$(id -u)" != 0 ] || [ "$DIR_UID" = 0 ]; then ( cd "$DIR" && ${1+"$@"} ); return; fi
  command -v setpriv >/dev/null 2>&1 || command -v sudo >/dev/null 2>&1 || die root_nodrop "$DIR_UID"
  ( cd "$DIR" || exit 1
    if command -v setpriv >/dev/null 2>&1; then exec setpriv --reuid="$DIR_UID" --regid="$DIR_GID" --clear-groups -- env -i PATH="$PATH" LC_ALL=C ${1+"$@"}
    else exec sudo -n -u "#$DIR_UID" -g "#$DIR_GID" -- env -i PATH="$PATH" LC_ALL=C ${1+"$@"}; fi )
}
rd_dir() { in_dir cat -- "$1" 2>/dev/null || true; }   # đọc một tệp của thư mục cài như dữ liệu
env_has() { rd_dir .env | grep -c -- "$1" >/dev/null; }   # .env có dòng khớp mẫu (grep -c đọc hết — không SIGPIPE dưới pipefail)
studio_lang() { # mặc định của Studio đang dùng (data/settings.json › uiLang, do server ghi) — sed, không cần node / jq
  rd_dir data/settings.json | sed -n 's/.*"uiLang"[[:space:]]*:[[:space:]]*"\([A-Za-z_-]*\)".*/\1/p' | head -1 || true
}
# MỘT nguồn sự thật cho ngôn ngữ của máy: data/settings.json › uiLang. GC_LANG trong .env chỉ là giá trị KHỞI TẠO (cài mới) hoặc ghi đè CÓ CHỦ Ý.
LANG_SET=""   # có giá trị khi người cài chọn rõ (--lang / GC_LANG / câu hỏi) → ghi vào .env cả khi .env đã có
KEPT=""       # bản cài đã có (.env chưa có GC_LANG — trước v0.20 — hoặc đã có settings.json) mà lần này không chọn → không hỏi, không ghi GC_LANG:
              # server áp luật nâng cấp (có dữ liệu → giữ tiếng Việt), mặc định của Studio giữ nguyên (CNS-152)
OLD="$( [ -f "$DIR/.env" ] && rd_dir .env | sed -n 's/^GC_LANG=//p' | tail -1 || true)"   # ngôn ngữ ghi trong .env của bản cài cũ (cài lại / nâng cấp)
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
# --domain cần tài khoản chủ (Go online bị chặn khi chưa khởi tạo owner — v0.23 §A.4). Hỏi TRƯỚC khi cài (chỉ khi máy này chưa có owner: bản cài mới, hoặc
# setup.json còn admin / must_init): GC_OWNER_* (đã đọc + xoá ở đầu tệp) → hỏi trên terminal (tên hiện, mật khẩu ẩn ×2) → không có cả hai: cài nhưng không lên mạng
OWNER_NEED=""; OWNER_SKIP=""
if [ -n "$DOMAIN" ]; then
  OST="$(rd_dir data/setup.json | sed -n 's/^[[:space:]]*"stage":[[:space:]]*"\([a-z_]*\)".*/\1/p' | head -1 || true)"
  if [ -z "$OST" ] && rd_dir data/auth.json | grep -c '"hash"' >/dev/null; then OST=done; fi   # v0.21 / v0.22 đã có mật khẩu: server ghi done lúc khởi động
  case "$OST" in ''|admin|must_init) OWNER_NEED=1 ;; esac
fi
owner_ok() { # kiểm OWNER_U / OWNER_P (luật như server: tên 3–32 [a-z0-9._-] khác admin · mật khẩu ≥ 12 ký tự, không ký tự điều khiển, khác admin)
  OWNER_U="$(printf '%s' "$OWNER_U" | tr 'A-Z' 'a-z')"
  case "$OWNER_U" in admin|*[!a-z0-9._-]*) say own_bad_user >&2; return 1 ;; esac
  [ "${#OWNER_U}" -ge 3 ] && [ "${#OWNER_U}" -le 32 ] || { say own_bad_user >&2; return 1; }
  case "$OWNER_P" in *[[:cntrl:]]*|admin|ADMIN|Admin) say own_bad_pw >&2; return 1 ;; esac
  [ "${#OWNER_P}" -ge 12 ] || { say own_bad_pw >&2; return 1; }
}
if [ -n "$OWNER_NEED" ]; then
  if [ -n "$OWNER_FROM_ENV" ]; then owner_ok || exit 2
  elif can_ask; then
    say own_intro
    OP2=""
    for _try in 1 2 3; do
      printf '%s' "$(_t own_ask_user; printf '%s' "$F")" > /dev/tty; IFS= read -r OWNER_U < /dev/tty || OWNER_U=""
      printf '%s' "$(_t own_ask_pw; printf '%s' "$F")" > /dev/tty; IFS= read -r -s OWNER_P < /dev/tty || OWNER_P=""; printf '\n' > /dev/tty
      printf '%s' "$(_t own_ask_pw2; printf '%s' "$F")" > /dev/tty; IFS= read -r -s OP2 < /dev/tty || OP2=""; printf '\n' > /dev/tty
      if [ "$OWNER_P" != "$OP2" ]; then say own_mismatch >&2; OWNER_P=""; OP2=""; continue; fi
      OP2=""; owner_ok && break
      OWNER_P=""
    done
    [ -n "$OWNER_P" ] || exit 2
  else OWNER_SKIP=1; OWNER_U=""; OWNER_P=""; fi
else OWNER_U=""; OWNER_P=""; fi

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
AUTO_MODE=""; [ -n "$MODE" ] || AUTO_MODE=1
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
# thư mục đã có bản ghi "docker" (genchibi v0.23.1) mà lúc này Docker không dùng được → KHÔNG tự chuyển sang native (bản ghi native = genchibi sẽ chạy
# mã trong thư mục cài, container ghi được). Chỉ --native tường minh mới đổi
if [ -n "$AUTO_MODE" ] && [ "$MODE" = native ] && [ -d "$DIR" ]; then
  DPN="$(cd -P "$DIR" && pwd)"; RH0=""; [ "$(id -u)" != 0 ] || RH0="$(getent passwd 0 2>/dev/null | cut -d: -f6)"
  for rh in "$HOME" $RH0; do for rt in .local/lib/gen-chibi gen-chibi-trust; do
    [ -r "$rh/$rt/installs" ] && grep -qxF "docker $DPN" "$rh/$rt/installs" && die docker_rec "$DIR"
  done; done
fi
[ "$MODE" = "native" ] && ! node_ok && die native_need_node
ok mode_ok "$MODE"
if [ -n "$DOCKER_VIA" ]; then
  if [ "$DOCKER_VIA" = sg ]; then warn docker_group "sg docker"; else warn docker_group "sudo docker"; fi
  export GC_DOCKER_VIA="$DOCKER_VIA"   # genchibi (start, online…) trong phiên này dùng cùng đường
fi

# ---------- user của container (Docker): trình cài chạy bằng root → KHÔNG cho container chạy root (GC_UID=0 = app + edge Caddy là root trong container).
# Có SUDO_USER (sudo từ tài khoản của owner) → uid của người đó. Root thật không SUDO_USER (CNS-212) → tài khoản hệ thống riêng `genchibi`
# (không đăng nhập, không home; có rồi thì dùng lại; không bao giờ uid 0) — KHÔNG đoán 1000: trên máy dùng chung uid 1000 có thể là người khác.
# Không tạo được (không useradd / adduser) → dừng TRƯỚC khi cài gì, bảo owner chạy lại bằng sudo từ tài khoản của mình.
# Thư mục cài chown -R cho user này (ở dưới): bind mount ./:/install phải ghi được, và tự cập nhật ghi releases/ + đổi current.
# v0.23.1 (CNS-233 / CNS-257): thư mục cài vẫn ghi được bởi user này (app tự cập nhật trong container), nhưng root KHÔNG BAO GIỜ chạy / nạp tệp nào trong đó:
# lệnh ~/.local/bin/genchibi + ~/.local/lib/gen-chibi/genchibi là bản chép từ gói ĐÃ KIỂM SHA-256 (ở $TMP, trước khi thư mục cài thấy nó), tệp compose root
# dùng nằm ở ~/.local/lib/gen-chibi/rel/<bản>/, .env đọc như dữ liệu, thao tác trong thư mục cài chạy bằng user này (cli/genchibi: mô hình root).
SYS_USER=genchibi
sys_ids() { # CUID/CGID của tài khoản hệ thống; 1 nếu chưa có hoặc là root
  local u g; u="$(id -u "$SYS_USER" 2>/dev/null)" || return 1; g="$(id -g "$SYS_USER" 2>/dev/null)" || return 1
  case "$u$g" in ''|*[!0-9]*) return 1 ;; esac
  [ "$u" != 0 ] && [ "$g" != 0 ] || return 1
  CUID="$u"; CGID="$g"
}
sys_user() { # dùng lại / tạo tài khoản hệ thống: useradd (glibc) → adduser -S (BusyBox / Alpine)
  local nl; nl="$(command -v nologin 2>/dev/null || true)"; [ -n "$nl" ] || nl=/usr/sbin/nologin
  if id -u "$SYS_USER" >/dev/null 2>&1; then sys_ids; return; fi
  if command -v useradd >/dev/null 2>&1 && useradd --system --no-create-home --home-dir /nonexistent --shell "$nl" --user-group "$SYS_USER" >/dev/null 2>&1 && sys_ids; then return 0; fi
  if command -v adduser >/dev/null 2>&1; then
    command -v addgroup >/dev/null 2>&1 && addgroup -S "$SYS_USER" >/dev/null 2>&1 || true
    adduser -S -D -H -h /nonexistent -s "$nl" -G "$SYS_USER" "$SYS_USER" >/dev/null 2>&1 || adduser -S -D -H -h /nonexistent -s "$nl" "$SYS_USER" >/dev/null 2>&1 || true
    sys_ids && return 0
  fi
  return 1
}
# nhóm đặc quyền: container không bao giờ chạy với gid của root, docker, sudo, wheel, adm, admin
priv_gid() { local n x; [ "$1" = 0 ] && return 0; for n in docker sudo wheel adm admin root; do x="$(getent group "$n" 2>/dev/null | cut -d: -f3)" || x=""; [ "$x" != "$1" ] || [ -z "$x" ] || return 0; done; return 1; }
# user của container KHÔNG BAO GIỜ lấy từ .env (container ghi được .env): thư mục cài có sẵn của user thường → chính chủ đó; mới → SUDO_USER (nhóm chính
# không đặc quyền) hoặc tài khoản hệ thống genchibi
CUID="$(id -u)"; CGID="$(id -g)"; AS_ROOT=""
if [ "$CUID" = 0 ] && [ "$MODE" = docker ]; then
  AS_ROOT=1
  if [ -d "$DIR" ] && [ "$DIR_UID" != 0 ]; then
    CUID="$DIR_UID"; CGID="$DIR_GID"
    ! priv_gid "$CGID" || die priv_group "$DIR" "$CGID"
  elif [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ] && id -u "$SUDO_USER" >/dev/null 2>&1 && [ "$(id -u "$SUDO_USER")" != 0 ] && ! priv_gid "$(id -g "$SUDO_USER")"; then CUID="$(id -u "$SUDO_USER")"; CGID="$(id -g "$SUDO_USER")"
  else
    sys_user || die sys_user_fail "$SYS_USER"
    ok sys_user_ok "$SYS_USER" "$CUID" "$CGID"
  fi
fi

# ---------- tải bản phát hành
# root (CNS-257): thư mục cài có sẵn có thể đã bị user của container sửa — không để liên kết tượng trưng chuyển chỗ root ghi (releases → /etc …)
if [ "$(id -u)" = 0 ]; then for p in "$DIR" "$DIR/releases" "$DIR/data" "$DIR/backups" "$DIR/logs" "$DIR/run" "$DIR/.env" "$DIR/launcher.js" "$DIR/docker-compose.yml"; do [ ! -L "$p" ] || die root_link "$p"; done; fi
[ -d "$DIR" ] || { FRESH=1; mkdir -p "$DIR"; }   # thư mục mới: root tạo cả cây, chưa ai khác ghi được (chown ở cuối)
in_dir mkdir -p releases data backups logs
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
# giải nén ở $TMP (của người cài) TRƯỚC: lệnh + tệp compose của root lấy từ đây, không từ thư mục cài (user của container ghi được)
PKG="$TMP/pkg"; mkdir -p "$PKG"
tar -xzf "$TMP/$TARNAME" -C "$PKG" --strip-components=1
in_dir sh -c 'rm -rf "$1" && mkdir -p "$1" && tar -xzf - -C "$1" --strip-components=1' sh "releases/$VER" < "$TMP/$TARNAME"
in_dir ln -sfn "releases/$VER" current
put_file() { in_dir sh -c 'rm -f "$1.gc-tmp" && cat > "$1.gc-tmp" && mv -f "$1.gc-tmp" "$1"' sh "$1"; }   # stdin → tệp của thư mục cài (tệp tạm + mv, bằng in_dir)
put_file launcher.js < "$PKG/launcher.js"
put_file docker-compose.yml < "$PKG/docker-compose.yml"
# dấu máy (v0.23.1, CNS-235): ngẫu nhiên, ngoài data/ (không theo bản sao lưu) — khôi phục trên chính máy này giữ install-id
in_dir mkdir -p run && in_dir chmod 700 run
[ -s "$DIR/run/machine-id" ] || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n' | in_dir sh -c 'umask 077; rm -f "$1.gc-tmp" && cat > "$1.gc-tmp" && mv -f "$1.gc-tmp" "$1"' sh run/machine-id
ok extracted "$VER"

# đặt/ thêm một dòng KHOÁ=giá trị trong .env mà không đưa giá trị lên dòng lệnh (awk đọc từ môi trường)
# env_put KHOÁ BIẾN_CHỨA_GIÁ_TRỊ — bằng in_dir (thư mục cài có sẵn của user khác: chạy bằng user đó), tệp tạm cạnh .env rồi mv, giữ 600
ENV_AWK='BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; d = 0 } index($0, k "=") == 1 { print k "=" v; d = 1; next } { print } END { if (!d) print k "=" v }'
# khoá + giá trị đi qua STDIN (không argv — ps của user khác đọc được argv); awk đọc chúng từ môi trường của chính sh con
env_put() { printf '%s\n%s\n' "$1" "${!2}" | in_dir env P="$ENV_AWK" sh -c 'IFS= read -r K; IFS= read -r V; export K V; umask 077; rm -f .env.gc-tmp; awk "$P" .env > .env.gc-tmp && mv -f .env.gc-tmp .env'; }
# ai cài (v0.23.1, CNS-234 — genchibi doctor đọc): sudo:<user> · root (root không sudo) · user:<tên> (không root)
if [ "$(id -u)" = 0 ]; then
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then INSTALLED_BY="sudo:$SUDO_USER"; else INSTALLED_BY=root; fi
else INSTALLED_BY="user:$(id -un 2>/dev/null || id -u)"; fi
case "$INSTALLED_BY" in *[!A-Za-z0-9:._-]*) INSTALLED_BY="${INSTALLED_BY%%:*}:?" ;; esac

# ---------- .env (sinh một lần; không có bí mật mặc định)
if [ ! -f "$DIR/.env" ]; then
  KEY="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  APITOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"   # v0.21: bản cài nào cũng có token chủ (CLI, agent, đăng nhập dự phòng — spec §3.4 T)
  ENV_LANG="$UI"; [ -z "$KEPT" ] || ENV_LANG=""   # dữ liệu có sẵn mà không chọn: không đặt GC_LANG (giữ mặc định của Studio)
  in_dir sh -c 'umask 077; rm -f "$1.gc-tmp" && cat > "$1.gc-tmp" && mv -f "$1.gc-tmp" "$1"' sh .env <<EOF
# gen-chibi — generated at install time. Do not share this file.
GC_MODE=$MODE
GC_PORT=$PORT
GC_BIND=127.0.0.1
GC_MASTER_KEY=$KEY
GC_AUTO_UPDATE=1
GC_UID=$CUID
GC_GID=$CGID
GC_INSTALLED_BY=$INSTALLED_BY
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
  # chứng chỉ CA bổ sung của proxy công ty (nếu máy có): chép vào thư mục cài để cả Docker lẫn Node đọc được
  if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "$NODE_EXTRA_CA_CERTS" ]; then
    in_dir mkdir -p certs; put_file certs/extra-ca.pem < "$NODE_EXTRA_CA_CERTS"
    if [ "$MODE" = docker ]; then CA=/install/certs/extra-ca.pem; else CA="$DIR/certs/extra-ca.pem"; fi
    env_put GC_EXTRA_CA CA
  fi
  case "${HTTPS_PROXY:-${https_proxy:-}}" in *127.0.0.1*|*localhost*) [ "$MODE" = docker ] && warn proxy_local "$DIR" ;; esac
  ok env_created
else
  env_has '^GC_MODE=' && env_put GC_MODE MODE
  [ -z "$TOKEN" ] || { env_put GC_GITHUB_TOKEN TOKEN; ok env_token; }
  # ngôn ngữ: CHỈ ghi khi người cài chọn rõ lần này. .env cũ (trước v0.20) chưa có GC_LANG → không ghi gì: server giữ ngôn ngữ đang dùng (CNS-152)
  if [ -n "$LANG_SET" ]; then env_put GC_LANG UI; fi
  # bản cài cũ do root cài (GC_UID=0) → đổi sang user thường (chown ở dưới)
  # (thiếu dòng GC_UID cũng vậy: compose sẽ rơi về mặc định 1000 — CNS-212)
  # GC_UID / GC_GID của .env luôn = user thật của container (chủ thư mục cài) — .env không bao giờ quyết user
  if [ -n "$AS_ROOT" ]; then env_put GC_UID CUID; env_put GC_GID CGID; fi
  # bản cài root cũ (v0.21.0–0.21.2) không sudo, chưa ghi ai cài, GC_UID=1000 (đoán) → chỉ báo; genchibi doctor hỏi rồi chuyển (CNS-234)
  if [ -n "$AS_ROOT" ] && [ -z "${SUDO_USER:-}" ] && [ "$CUID" = 1000 ] && ! env_has '^GC_INSTALLED_BY='; then LEGACY_UID=1000; fi
  env_put GC_INSTALLED_BY INSTALLED_BY
  # móc kiểm thử không bao giờ nằm trong .env (review bảo mật 🟡7): CLI nạp .env bằng set -a → app / launcher sẽ thấy
  if env_has '^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}GC_TEST'; then in_dir sh -c 'umask 077; rm -f "$1.gc-tmp"; { grep -v "^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}GC_TEST" "$1" || true; } > "$1.gc-tmp" && mv -f "$1.gc-tmp" "$1"' sh .env; fi
  ok env_kept
fi
if [ -n "$AS_ROOT" ]; then
  [ "$CUID" != 0 ] && [ "$CGID" != 0 ] || die sys_user_fail "$SYS_USER"   # không bao giờ cho root / đoán uid
  # Đổi chủ CHỈ khi cây là của root: (a) thư mục mới — root vừa tạo cả cây, chưa ai khác ghi được; (b) thư mục cũ của root (bản cài GC_UID=0 rất cũ) — dừng
  # container trước (không ai ghi trong lúc đổi). Thư mục có sẵn của user thường: KHÔNG đổi chủ gì (mọi tệp đã ghi bằng chính user đó — in_dir).
  # Không theo symlink (-h), một filesystem, không tệp có nhiều liên kết cứng
  if [ -n "${FRESH:-}" ] || [ "$DIR_UID" = 0 ]; then
    [ -n "${FRESH:-}" ] || { docker stop gen-chibi gen-chibi-edge >/dev/null 2>&1 || true; }
    find "$DIR" -xdev \( -type d -o -type l -o -links 1 \) -exec chown -h "$CUID:$CGID" {} +
  fi
  warn root_uid "$CUID" "$CGID" "$DIR"
  [ -z "${LEGACY_UID:-}" ] || warn root_legacy_uid "$LEGACY_UID"
fi

# ---------- CLI (từ gói đã kiểm ở $TMP — không từ thư mục cài)
# Root: home theo passwd (KHÔNG theo $HOME — sudo -E / HOME của user sẽ đặt lệnh root vào chỗ user ghi được, CNS-284)
# path_safe / home_of / snap_docker / td_default: lấy NGUYÊN VĂN từ cli/genchibi của gói đã kiểm (một nguồn — CNS-287): cùng luật an toàn (cả ACL), cùng chỗ $TD
eval "$(sed -n -e '/^path_safe() {/,/^}/p' -e '/^file_safe() {/p' -e '/^home_of() {/,/^}/p' -e '/^snap_docker() {/,/^}/p' -e '/^td_default() {/p' "$PKG/cli/genchibi")"
declare -F path_safe >/dev/null && declare -F home_of >/dev/null && declare -F td_default >/dev/null || die td_unsafe "$PKG/cli/genchibi"
# root: $HOME chỉ khi nó an toàn (thuộc root, không ai khác ghi được, cả các thư mục cha); không thì home của uid 0 theo passwd (sudo -E — CNS-284)
if [ "$(id -u)" = 0 ]; then if [ -n "${HOME:-}" ] && path_safe "$HOME"; then UHOME="$HOME"; else UHOME="$(home_of 0)"; fi; else UHOME="$HOME"; fi
BIN="$UHOME/.local/bin"; mkdir -p "$BIN"
DP="$(cd -P "$DIR" && pwd)"
put_rec() { # put_rec <thư mục tin cậy> <chế độ>: bản ghi "<chế độ> <đường thật thư mục cài>" (thay dòng cũ của thư mục này — cài lại native xoá bản ghi docker cũ)
  { [ ! -f "$1/installs" ] || awk -v p="$DP" '{ l = $0; sub(/^[^ ]* /, ""); if ($0 != p) print l }' "$1/installs"; printf '%s %s\n' "$2" "$DP"; } > "$1/installs.tmp"
  chmod 600 "$1/installs.tmp"; mv -f "$1/installs.tmp" "$1/installs"
}
if [ "$MODE" = docker ]; then
  # Docker (mọi uid — CNS-279): tệp đã kiểm của lệnh — ~/.local/lib/gen-chibi (0700, container không thấy): rel/<bản>/ compose + lệnh, genchibi (bản mới nhất),
  # repo, mode, ca.pem (CA của người cài, cho lần tải kiểm SHA sau này)
  TRUSTD="$(td_default "$UHOME")"   # Docker cài bằng snap: đường không ẩn (snap không đọc ~/.local)
  TP="$TRUSTD"; while [ ! -e "$TP" ]; do TP="$(dirname "$TP")"; done; path_safe "$TP" || die td_unsafe "$TRUSTD"
  ( umask 077; mkdir -p "$TRUSTD/rel" "$TRUSTD/run" ); chmod 700 "$TRUSTD"
  TRUSTD="$(cd -P "$TRUSTD" && pwd)"; path_safe "$TRUSTD" || die td_unsafe "$TRUSTD"
  case "$TRUSTD/" in "$(cd -P "$DIR" && pwd)"/*) die td_unsafe "$TRUSTD" ;; esac   # trong thư mục cài = container ghi được
  R="$TRUSTD/rel/$VER"; rm -rf "$R.tmp"; mkdir -p "$R.tmp"
  cp "$PKG/docker-compose.yml" "$R.tmp/"
  [ ! -f "$PKG/docker-compose.edge.yml" ] || cp "$PKG/docker-compose.edge.yml" "$R.tmp/"
  [ ! -f "$PKG/edge/Caddyfile.base" ] || cp "$PKG/edge/Caddyfile.base" "$R.tmp/Caddyfile.base"
  cp "$PKG/cli/genchibi" "$R.tmp/genchibi"; printf '%s\n' "$VER" > "$R.tmp/VERSION"; printf '%s\n' "$WANTSUM" > "$R.tmp/SHA256"
  rm -rf "$R"; mv "$R.tmp" "$R"
  printf '%s\n' "$REPO" > "$TRUSTD/repo"; put_rec "$TRUSTD" docker
  # dấu (chỉ để nhắc, không quyết gì): bản cài này do tài khoản nào quản lý bản duyệt / edge — user thường gõ genchibi trên bản cài sudo sẽ được nhắc dùng sudo
  if [ -n "$AS_ROOT" ]; then printf 'root\n'; else printf 'user\n'; fi | in_dir sh -c 'rm -f run/trust-owner.gc-tmp && cat > run/trust-owner.gc-tmp && mv -f run/trust-owner.gc-tmp run/trust-owner' 
  if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "$NODE_EXTRA_CA_CERTS" ]; then cp "$NODE_EXTRA_CA_CERTS" "$TRUSTD/ca.pem.tmp" && mv -f "$TRUSTD/ca.pem.tmp" "$TRUSTD/ca.pem"; fi
  sed -e "s#__GC_HOME__#$DIR#" -e "s#__GC_TRUST__#$TRUSTD#" "$PKG/cli/genchibi" > "$TRUSTD/genchibi.tmp" && chmod 755 "$TRUSTD/genchibi.tmp" && mv -f "$TRUSTD/genchibi.tmp" "$TRUSTD/genchibi"
  printf '%s\n' "$VER" > "$TRUSTD/genchibi.version"
  cp "$TRUSTD/genchibi" "$BIN/genchibi.tmp" && chmod 755 "$BIN/genchibi.tmp" && mv -f "$BIN/genchibi.tmp" "$BIN/genchibi"
  ok root_trust "$TRUSTD"
else
  sed "s#__GC_HOME__#$DIR#" "$PKG/cli/genchibi" > "$BIN/genchibi"; chmod +x "$BIN/genchibi"
  # native: bản ghi "native" (genchibi không đoán chế độ theo .env nữa); thư mục tin cậy không an toàn → bỏ qua (genchibi sẽ coi là Docker — an toàn)
  TRUSTD="$(td_default "$UHOME")"; TP="$TRUSTD"; while [ ! -e "$TP" ]; do TP="$(dirname "$TP")"; done
  if path_safe "$TP"; then ( umask 077; mkdir -p "$TRUSTD" ) && [ ! -L "$TRUSTD/installs" ] && path_safe "$TRUSTD" && put_rec "$TRUSTD" native; fi
fi
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
go_online() { # 0 đã ra Internet · khác: chưa xong (app vẫn chạy). Tài khoản chủ đặt TRƯỚC (Go online bị chặn khi chưa khởi tạo — v0.23 §A.4)
  local ip a waited=0 limit poll rc
  local how; if [ -n "$CF" ]; then how=cloudflare; else how=caddy; fi
  if [ -n "$OWNER_SKIP" ]; then warn own_none; say own_next "$how" "$DOMAIN"; return 1; fi
  if [ -n "$OWNER_U" ]; then
    # tên + mật khẩu qua stdin (không argv); --init-stdin: chỉ khởi tạo, máy đã có owner thì không đè mật khẩu
    if printf '%s\n%s\n' "$OWNER_U" "$OWNER_P" | "$BIN/genchibi" password --init-stdin >/dev/null; then OWNER_P=""; ok own_set "$OWNER_U"
    else OWNER_P=""; warn own_fail "$how" "$DOMAIN"; return 1; fi
  fi
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
  case "$rc" in 0) ONLINE="https://$DOMAIN"; return 0 ;; esac
  warn online_fail; return "$rc"
}
finish_lines() { # dòng cuối (v0.23 §A.0 / spec "Đạt khi" 1): địa chỉ online (nếu có) + BƯỚC TIẾP theo stage — bản cài mới: mở http://localhost:<cổng>,
  # đăng nhập admin / admin trong vòng 30 phút (genchibi start vừa mở cửa sổ) · không mở được cửa sổ: lý do + genchibi password · đã có owner: đăng nhập bằng tên đó.
  # Câu do `genchibi setup hint` in (một nguồn với CLI; server quyết định admin / admin có dùng được không)
  [ -z "$ONLINE" ] || say sum_online "$B" "$ONLINE" "$N" "$ONLINE"
  printf '\n'; "$BIN/genchibi" setup hint || true
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
    RC=0; ONLINE=""
    if [ -n "$DOMAIN" ]; then go_online && RC=0 || RC=$?; fi
    finish_lines
    exit "$RC"
  fi
  sleep 1
done
die no_answer "$PORT"
