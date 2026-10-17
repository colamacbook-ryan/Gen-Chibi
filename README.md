# gen-chibi

Nhà máy nhân vật chibi **vẽ bằng code**: một khung xương chuẩn, kho linh kiện có tham số, 18 biểu cảm khoa trương, động tác là dữ liệu, cổng kiểm tự động. Mỗi nhân vật là một **công thức JSON**; engine dựng ra SVG/PNG/sprite sheet hoặc nhân vật "sống" đổi biểu cảm lúc chạy.

- **Studio** (desktop, kiểu Data Console): quản lý nhân vật, chỉnh linh kiện và tham số, ghi đè biểu cảm theo từng nhân vật, phiên bản, xuất bản.
- **Đạo diễn AI**: LLM viết kịch bản sự kiện trong từ vựng đóng của kho; server kiểm và bắt model sửa nếu sai.
- **MCP server**: agent (Claude Code, Claude Desktop…) nối thẳng vào để tự tạo nhân vật và kịch bản, không tốn LLM API lõi.
- **Tự cập nhật** từ GitHub Releases: kiểm SHA-256, sao lưu dữ liệu trước khi đổi, tự chạy lại bản cũ nếu bản mới lỗi.

## Cài đặt (một lệnh)

```bash
curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash
```

- Cần **Docker** đang chạy (macOS: Docker Desktop) hoặc **Node ≥ 18** (`--native`).
- Mặc định cài vào `~/gen-chibi`, cổng `7480`, chỉ mở cho máy này. Mở **http://localhost:7480**.
- Tuỳ chọn: `--dir <thư mục>` · `--port <cổng>` · `--native` · `--version vX.Y.Z`.

## Lệnh

```
genchibi start | stop | restart | status
genchibi update            # kiểm tra và cập nhật ngay
genchibi logs
genchibi backup | restore <tệp>
genchibi mcp               # cầu MCP stdio cho agent
genchibi open | uninstall
```

## Nối agent qua MCP

```bash
claude mcp add gen-chibi -- genchibi mcp                                  # stdio
claude mcp add --transport http gen-chibi http://localhost:7480/mcp       # HTTP
```

Tool: `get_catalog`, `list_characters`, `get_character`, `validate_character`, `save_character`, `render_character`, `get_director_schema`, `validate_event`, `save_event`, `get_app_version`, `update_app`, `rollback_app`.

### Mở MCP ra Internet — một lệnh, một link
Cần một tên miền do Cloudflare quản lý DNS (gói miễn phí là đủ).

```bash
genchibi expose chibi.example.com   # lần đầu mở trình duyệt đăng nhập Cloudflare một lần
```

Lệnh tự làm hết: tạo Cloudflare Tunnel, trỏ DNS, **chỉ cho đường `/mcp` đi qua** (Studio ở lại máy), sinh khoá, bật token cho Studio, khởi động lại, thử gọi qua Internet, rồi in ra **link MCP**:

```
https://chibi.example.com/mcp/<khoá>
```

Agent dán link là nối được — không cần header:
- Claude Code: `claude mcp add -s user --transport http gen-chibi <link>`
- Claude web/desktop: Settings › Connectors › Add custom connector › dán link
- Cursor và client khác: `{"mcpServers":{"gen-chibi":{"url":"<link>"}}}`

Link chỉ cấp quyền MCP (không mở Studio hay cài đặt). Các lệnh khác: `genchibi link` (in lại link) · `genchibi link --check` · `genchibi expose --rotate` (đổi khoá, link cũ chết ngay) · `genchibi expose --off` · `genchibi expose --quick` (link tạm `*.trycloudflare.com`, không cần tài khoản, đổi mỗi lần khởi động lại). Docker: tunnel chạy thành container `gen-chibi-tunnel`, tự bật lại cùng app. Node: cần `cloudflared` trong PATH.

Mở thủ công (tunnel khác, mạng LAN): đặt `GC_API_TOKEN` và `GC_ALLOWED_HOSTS` trong `.env`. Có token thì mọi `/api` và `/mcp` cần `Authorization: Bearer <token>`; chưa có token mà request đi qua tunnel/proxy thì server từ chối hết.

### Agent tự cập nhật app
Tool MCP `get_app_version` (bản đang chạy, bản mới nhất trên GitHub, ghi chú), `update_app` (tải bản mới, kiểm SHA-256, sao lưu, khởi động lại; bản mới lỗi thì tự quay về bản cũ), `rollback_app` (cần `confirm: "ROLLBACK"`).

## Core AI (LLM API)

Studio › Cài đặt AI: chọn OpenRouter, DeepSeek, MiniMax hoặc địa chỉ tuỳ chỉnh chuẩn OpenAI, dán API key (mã hoá AES-256-GCM trên máy, không bao giờ trả về trình duyệt). "Kiểm tra model" chạy một kịch bản thử và chấm: JSON đúng chuẩn, số lần phải sửa, độ trễ, token.

## Cấu trúc

```
engine/       core.js (khung xương, thư viện, kế thừa 4 tầng, cổng kiểm), render.js (3 tầng vẽ có ngân sách)
kinds/        character/afi.core.js (thư viện chính thức), afi.tamquoc.js (Tam Quốc + dàn tướng)
studio/       giao diện quản lý
server/       API cục bộ, updater, core AI, MCP, kho bí mật
launcher.js   chạy phiên bản hiện tại, canh sức khoẻ sau cập nhật, tự rollback
install.sh    cài một lệnh · cli/genchibi
tools/        test.sh (CI), test-update.sh, package.sh
```

## Phát hành

Sửa `VERSION` + `CHANGELOG.md` rồi đẩy lên `main` (hoặc đẩy tag `vX.Y.Z`). Workflow `release` chạy kiểm thử, đóng gói, tạo tag và GitHub Release; mọi bản cài tự nhận trong vòng 6 giờ (hoặc bấm "Kiểm tra phiên bản").

## License

© 2026 Afi Labs — **All rights reserved.** Repo công khai để xem, không cấp quyền sử dụng. Xem [LICENSE](LICENSE).
