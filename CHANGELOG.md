# Changelog

## v0.1.6
- **`genchibi expose <tên-miền>`**: một lệnh mở MCP ra Internet qua Cloudflare Tunnel — tạo tunnel, trỏ DNS (không ghi đè bản ghi có sẵn trừ khi thêm `--overwrite-dns`), chỉ cho đường `/mcp` đi qua, sinh khoá, khởi động lại, thử gọi qua Internet và in link. Thêm `--quick` (link tạm trycloudflare), `--rotate`, `--off`; `genchibi link [--check]`. Docker: tunnel là container `gen-chibi-tunnel` tự bật lại cùng app.
- **Link MCP có khoá** `/mcp/<GC_MCP_KEY>`: agent dán link là nối được, không cần header (Claude web/desktop Connectors, Cursor…). Link chỉ cấp quyền MCP; sai khoá trả 404. Qua link chỉ được kiểm và cập nhật bình thường; `rollback_app` và `force` cần token chủ máy hoặc stdio (chống xoá vòng backup bằng rollback lặp).
- **MCP tự cập nhật**: tool `get_app_version`, `update_app`, `rollback_app` — agent tự kiểm và cập nhật từ GitHub Releases (SHA-256, sao lưu, tự rollback khi bản mới lỗi). MCP có 12 tool.
- Studio › Cài đặt AI: hiện link MCP, nút sao chép link và lệnh Claude Code.
- CLI `genchibi` đi theo bản cài: lệnh mới đến cùng bản cập nhật (cài lại một lần từ v0.1.5 trở về trước). `genchibi start` đồng bộ `docker-compose.yml` theo bản đang chạy.
- `GC_ALLOWED_HOSTS` nhận tên con dạng `*.trycloudflare.com`.
- Bảo mật tunnel: chứng chỉ tài khoản Cloudflare (`cert.pem`) chỉ dùng lúc thiết lập rồi xoá — container tunnel chỉ giữ khoá của riêng tunnel; tên miền được kiểm chặt trước khi ghi `.env`; link không lộ trong danh sách tiến trình khi kiểm.
- Test: `tools/test-auth.sh` 16 ca (link, wildcard host); `tools/test-update.sh` thêm bước agent cập nhật qua MCP (16 ca).

## v0.1.5
- Bảo mật (sửa v0.1.4): khi có `GC_API_TOKEN`, **mọi** `/api` (trừ `/api/health`) và `/mcp` đều cần token — không còn miễn cho Host `localhost`, vì tunnel có thể đổi Host thành localhost và chạy trên chính máy này. So token bằng thời gian hằng.
- Bảo mật: chưa có token mà request đi qua tunnel/reverse proxy (`X-Forwarded-For`, `Forwarded`, `Cf-Connecting-Ip`, `X-Real-Ip`) thì từ chối toàn bộ — app không bao giờ lộ ra Internet khi chưa khoá.
- Studio: màn đăng nhập bằng token cho bản cài có khoá (giữ trong trình duyệt), báo token sai.
- README: hướng dẫn mở MCP qua tunnel/tên miền riêng.

## v0.1.4
- Sửa lỗi: mắt của mọi nhân vật đứng yên khi đầu nghiêng/nhún. Nguyên nhân: animation chớp mắt (CSS `transform`) đặt trên chính nhóm lớp `eyes` nên đè mất transform của khung xương. Giờ chớp mắt chạy trên nhóm con `.gc-eyes`.
- Mở MCP qua tunnel/tên miền riêng: khi đã đặt `GC_API_TOKEN`, `/mcp` luôn cần token; `/api` chỉ cần token khi truy cập qua tên miền ngoài. Studio mở bằng `localhost` vẫn dùng như cũ.
- Test: luật cấu trúc chặn CSS animation/transform trên nhóm lớp `[data-l]`; `tools/test-browser.mjs` kiểm mọi lớp gắn vào đầu đi cùng đầu (Chromium).

## v0.1.3
- Studio: dải báo "Có bản mới" trên mọi trang, bấm để xem ghi chú và cập nhật.
- `genchibi start` gọn hơn với Docker.

## v0.1.2
- Mạng có proxy: tự cập nhật và gọi LLM đi qua `HTTPS_PROXY` (tôn trọng `NO_PROXY`, hỗ trợ proxy có mật khẩu và chứng chỉ CA bổ sung). Trước đây Node bỏ qua proxy nên máy sau proxy công ty không cập nhật được.
- `install.sh` ghi cấu hình proxy và CA của máy vào `.env`.

## v0.1.1
- MCP: `get_character` và `render_character` nhận cả id ngắn (vd. `trieu-van`), không bắt buộc key đầy đủ.
- Bảo mật: không có token thì server chỉ phục vụ kết nối từ chính máy này (kiểm địa chỉ thật, không tin header Host); CLI từ chối chạy khi mở ra mạng mà thiếu `GC_API_TOKEN`.
- Phát hành tự động khi `VERSION` trên `main` thay đổi.

## v0.1.0
Bản MVP đầu tiên.
- Engine 0.2: khung xương có khuỷu tay, thư viện theo nhóm (pack), kế thừa 4 tầng (kho → trait → nhân vật → đạo diễn), tham số linh kiện.
- Thư viện chính thức `afi.core` (18 biểu cảm, 28 động tác, 21 hiệu ứng) và `afi.tamquoc` (5 tướng).
- Tầng vẽ có ngân sách: ảnh cache cho danh sách, thở bằng CSS cho avatar, diễn đủ tối đa 8 nhân vật.
- Studio: quản lý nhân vật, chỉnh linh kiện + tham số + màu, ghi đè biểu cảm, phiên bản, xuất SVG/PNG/sprite sheet.
- Đạo diễn AI qua LLM API (OpenRouter, DeepSeek, MiniMax, tuỳ chỉnh), có kiểm tra model.
- MCP server (HTTP + stdio) cho agent.
- Cài một lệnh, tự cập nhật từ GitHub Releases, sao lưu trước khi cập nhật, tự rollback.
