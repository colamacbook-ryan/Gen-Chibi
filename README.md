# gen-chibi

**gen-chibi — nhà máy asset chibi theo chủ đề + làm phim với AI đạo diễn.** Từ một bộ khung chuẩn (ma-nơ-canh, khối vật phẩm, khối bối cảnh) dựng nhân vật / vật phẩm / bối cảnh **bằng code**, cất vào thư viện theo dự án chủ đề, rồi chat với AI đạo diễn để ra phim — xuất thành một tệp HTML xem được ở mọi trình duyệt. Mỗi asset là một **công thức JSON** qua cổng kiểm tự động; engine dựng SVG / PNG / sprite 8 hướng hoặc nhân vật "sống" đổi biểu cảm lúc chạy.

**Bắt đầu nhanh:** mở Studio → **✨ Mở dự án mẫu "Văn phòng vui"** → Tạo tác → ▶ Diễn toàn bộ → *Phim (HTML)*. Hướng dẫn đầy đủ: [`docs/HUONG-DAN.md`](docs/HUONG-DAN.md).

- **Studio** — **3 ứng dụng độc lập** `/xuong` · `/thu-vien` · `/tao-tac` (desktop, kiểu Data Console), theo dòng chảy: **Xưởng** — bộ khung chuẩn + **Tạo asset mới** (chọn khung → tham số → soát → cổng kiểm → lưu), bàn chỉnh, linh kiện, khung tư thế & biểu cảm, cổng kiểm; **Thư viện** — asset đã qua cổng xếp theo **dự án chủ đề**, tải ảnh / sprite 8 hướng, chép mã, **tải / nhập gói dự án**; **Tạo tác** — **Tác phẩm**: chat với AI đạo diễn, kịch bản, phân cảnh, bảng tình trạng, cảnh thành phẩm, sân khấu final diễn cả chuỗi, **xuất phim HTML độc lập + storyboard**; AI thiếu nhân vật / bối cảnh thì tự vào Xưởng tạo (đúng dự án).
- **AI đạo diễn**: LLM viết kịch bản / lời thoại trong từ vựng đóng của kho; server kiểm và bắt model sửa nếu sai.
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
genchibi token             # đặt token GitHub (repo private), nhập ẩn
genchibi open | uninstall
```

## Bộ khung chuẩn (Xưởng)
Mọi asset dựng từ một **bộ khung chuẩn không chủ đề** (kiểu greybox của làm game):
- **Nhân vật:** ma-nơ-canh đầu trọc, không quần áo — 18 khớp, 18 biểu cảm, 32 hoạt động, **8 hướng** (chính diện · 45° · 90° · 135° · sau lưng, hai bên) + 3/4 nhẹ; tải sprite 8 hướng từ Thư viện.
- **Vật phẩm:** 10 khối đại diện theo dáng — que dài, que ngắn, đĩa dẹt, hộp, cầu, đội đầu, khoác thân, sau lưng, giày, che mặt.
- **Bối cảnh:** khối trời / tường, chân trời, khối nhà, nền có lưới tỉ lệ, tiền cảnh, khối hộp / trụ / cây / đá / bàn / cờ; 8 chỗ đứng chuẩn.
- **Quy cách** thống nhất cho mọi asset: [`docs/QUY-CACH-KHUNG.md`](docs/QUY-CACH-KHUNG.md). Đặc tả 3 giai đoạn: [`docs/spec/DAC-TA-3-GIAI-DOAN.md`](docs/spec/DAC-TA-3-GIAI-DOAN.md).
- Bộ Tam Quốc cũ đã cất ở `archive/tamquoc/` (không nạp vào bản chạy).

## Tư thế & hoạt động
Một khung hình = **biểu cảm** (mặt) × **tư thế nền** (thân dưới) × **di chuyển** (chu kỳ) × **động tác** (tay) + đạo cụ + hướng. Không vẽ tay từng tổ hợp: engine ghép lớp như animation layer của game engine.

- 32 hoạt động đặt sẵn: đứng, ngồi ghế, ngồi xếp bằng, quỳ, ngồi xổm, nằm · đi, chạy, rón rén, nhảy, bò, bay, bơi, bỏ chạy · ăn, uống, ngủ, đọc sách, viết · chém, đâm, phòng thủ, xông lên, ăn mừng · sợ hãi, ngất · cúi chào, ôm quyền, quỳ lạy, vẫy, chỉ tay, cổ vũ.
- Ghép tự do: `{ "state": "panic", "posture": "stand", "move": "run", "motion": "flail", "facing": "left" }`.
- Xưởng › Khung tư thế & hoạt động: xem và ghép thử, tải SVG.

## Vật phẩm (loại asset thứ hai)
Item = phối linh kiện có sẵn + bảng màu riêng + độ hiếm + chỉ số; tự đứng được (icon, thẻ) và mặc được lên nhân vật (`look.equip`). Thư viện › Vật phẩm (tải icon/thẻ, chép mã), Xưởng › Tạo asset mới / Bàn chỉnh vật phẩm; mọi vật phẩm bắt đầu từ một khối khung; MCP `list_items` / `validate_item` / `save_item` / `render_item`.

## Bối cảnh (loại asset thứ ba)
Cảnh = phối phông có sẵn (trời, cảnh xa, công trình, mặt đất, đạo cụ, tiền cảnh) + bảng màu + giờ (ngày, bình minh, hoàng hôn, đêm) + thời tiết (mưa, tuyết, hoa rơi, lá bay, sương, đom đóm). Nhân vật đứng vào 8 chỗ đứng chuẩn, tự quay 45° về phía nhau. Kịch bản đặt vào cảnh bằng `"scene"` + `"spot"`. MCP `list_scenes` / `validate_scene` / `save_scene` / `render_scene`; phông mới qua `get_part_spec` → `preview_part` → `save_part`.

## Quy trình tạo lập linh kiện
Nhà xưởng giữ giá trị ở **khung sườn + quy trình**; nhân vật chỉ là phối linh kiện. Chuẩn tạo một linh kiện (toạ độ, lớp, góc nhìn chính diện + 45° (+ 90° / 135° / sau lưng), công cụ `face45`/`body45`, soát trên ma-nơ-canh, cổng kiểm, phát hành): [`docs/QUY-TRINH-LINH-KIEN.md`](docs/QUY-TRINH-LINH-KIEN.md).

## Nối agent qua MCP

```bash
claude mcp add gen-chibi -- genchibi mcp                                  # stdio
claude mcp add --transport http gen-chibi http://localhost:7480/mcp       # HTTP
```

31 tool: `get_catalog`, `list_characters`, `get_character`, `validate_character`, `save_character`, `render_character`, `get_director_schema`, `validate_event`, `save_event`, `get_part_spec`, `preview_part`, `save_part`, `list_items`, `validate_item`, `save_item`, `render_item`, `list_scenes`, `validate_scene`, `save_scene`, `render_scene`, `list_projects`, `save_project`, `export_project`, `import_project`, `list_works`, `get_work`, `save_work`, `save_shot`, `get_app_version`, `update_app`, `rollback_app`.

Làm phim: `save_work` → `save_shot` (bối cảnh + dàn diễn viên + lời thoại qua cổng đạo diễn) → owner xem / xuất ở Studio › Tạo tác › Tác phẩm. Gói chủ đề: `export_project` / `import_project` (gen-chibi.project/1, có `requires`).

Tạo linh kiện: `get_part_spec` → vẽ (SVG an toàn, token màu) → `preview_part` (bàn soát) → `save_part`. AI trong Studio (Xưởng › Trợ lý AI tạo asset, Tạo tác › AI đạo diễn) dùng đúng bộ tool này — mọi lối ghi đi qua một cổng kiểm (xem `docs/QUY-TRINH-LINH-KIEN.md` mục 6).

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
engine/       core.js (khung xương, thư viện, kế thừa 4 tầng, cổng kiểm), render.js (3 tầng vẽ có ngân sách), player.js (trình diễn tác phẩm — dùng chung Studio và phim xuất ra)
kinds/        character/afi.core.js (khung lõi: khuôn mặt, biểu cảm, chuyển động, thân ma-nơ-canh) · khung/afi.khung.js (khối vật phẩm, khối bối cảnh, ma-nơ-canh, sân khấu chuẩn)
studio/       3 ứng dụng Xưởng / Thư viện / Tạo tác (một bộ mã) · mau/ dự án mẫu
server/       API cục bộ, updater, core AI, MCP, kho bí mật
launcher.js   chạy phiên bản hiện tại, canh sức khoẻ sau cập nhật, tự rollback
install.sh    cài một lệnh · cli/genchibi
tools/        test.sh (CI), test-update.sh, package.sh
```

## Repo private: token cập nhật

Khi repo phát hành là private, mọi request không token đều bị GitHub trả 404 — cả cài mới lẫn tự cập nhật cần một token chỉ-đọc.

1. GitHub › Settings › Developer settings › Fine-grained personal access tokens › Generate new token.
2. **Repository access**: *Only select repositories* → chỉ `gen-chibi`. **Permissions**: *Contents* = **Read-only** (không cần quyền nào khác).
3. Cài mới (máy chưa có gen-chibi):
   ```bash
   curl -fsSL -H "Authorization: Bearer $GC_GITHUB_TOKEN" https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | GC_GITHUB_TOKEN=$GC_GITHUB_TOKEN bash
   ```
   Installer ghi token vào `.env` (chmod 600), không in ra màn hình.
4. Máy đã cài: chạy `genchibi token` (dán token, ẩn khi gõ) — lệnh ghi `GC_GITHUB_TOKEN` vào `.env` rồi tự khởi động lại. Gỡ token: `genchibi token --clear`.

Token chỉ gửi tới `api.github.com`; khi GitHub chuyển hướng tải file sang host lưu trữ, token bị bỏ. Token không xuất hiện trong `/api/info`, trạng thái cập nhật, log hay MCP.

## Phát hành

Sửa `VERSION` + `CHANGELOG.md` rồi đẩy lên `main` (hoặc đẩy tag `vX.Y.Z`). Workflow `release` chạy kiểm thử, đóng gói, tạo tag và GitHub Release; mọi bản cài tự nhận trong vòng 6 giờ (hoặc bấm "Kiểm tra phiên bản").

## License

© 2026 Gen Labs — **All rights reserved.** Tác giả: **Ryan** — 090.919.8823. Repo công khai để xem, không cấp quyền sử dụng. Xem [LICENSE](LICENSE).
