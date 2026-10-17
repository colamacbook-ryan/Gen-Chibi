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

Tool: `get_catalog`, `list_characters`, `get_character`, `validate_character`, `save_character`, `render_character`, `get_director_schema`, `validate_event`, `save_event`.

### Mở ra ngoài (tunnel, tên miền riêng)
Mặc định app chỉ phục vụ chính máy này. Trước khi gắn tunnel (cloudflared, ngrok…) hoặc mở cho mạng LAN, **bắt buộc** đặt trong `~/gen-chibi/.env`:

```bash
GC_API_TOKEN=<openssl rand -hex 32>
GC_ALLOWED_HOSTS=chibi.example.com      # tên miền của tunnel
```

rồi `genchibi restart`. Khi có token: mọi `/api` và `/mcp` đều cần `Authorization: Bearer <token>`, Studio hiện màn đăng nhập. Chưa có token mà request đi qua tunnel/proxy (có `X-Forwarded-For`, `Cf-Connecting-Ip`…) thì server từ chối hết. Khuyên dùng: tunnel chỉ chuyển đường `/mcp`, Studio để ở máy.

Agent ở máy khác: `claude mcp add --transport http gen-chibi https://chibi.example.com/mcp --header "Authorization: Bearer <token>"`.

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
