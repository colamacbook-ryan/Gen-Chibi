# Changelog

## v0.5.3 — Studio ba lớp: Thư viện · Tạo tác · Xưởng
- **Thư viện** (xanh dương): hàng mẫu Afi đã duyệt — xem, tải ảnh, chép mã.
- **Tạo tác** (xanh lá, mới): nhân vật / trang bị / cảnh của tôi, Đạo diễn AI, Trợ lý AI (chat) — nơi người dùng phối và xuất thành phẩm.
- **Xưởng** (hổ phách): chỉ còn khuôn của Afi — kho linh kiện & phông, khung tư thế & hoạt động, khung biểu cảm & động tác, cổng kiểm.
- Dòng chảy Xưởng → Thư viện → Tạo tác; `docs/QUY-TRINH-LINH-KIEN.md` mục 8 viết lại theo ba lớp.

## v0.5.2 — Hỗ trợ repo private: token cập nhật
- **`GC_GITHUB_TOKEN`** (fine-grained, chỉ Contents: Read-only): bộ cập nhật gọi API GitHub có `Authorization: Bearer`, tải gói và SHA256SUMS qua URL API của asset (`Accept: application/octet-stream`). Token **chỉ gửi tới đúng host đầu tiên** — khi GitHub chuyển hướng sang host lưu trữ, token bị bỏ. Không token thì hành vi cũ giữ nguyên.
- Repo private mà thiếu / sai token → báo lỗi rõ (nêu cách sửa), vẫn chạy bản cũ; không đoán qua trang công khai.
- `install.sh` nhận `GC_GITHUB_TOKEN`: đọc release qua API, chọn asset theo tên, tải qua URL API; token đi bằng tệp cấu hình curl (không nằm trên dòng lệnh), ghi vào `.env` (thêm dòng nếu thiếu, giữ nguyên dòng khác). Không token mà repo private → hướng dẫn tạo token.
- Lệnh mới `genchibi token [giá-trị|--clear]`: nhập ẩn (hoặc stdin) để token không vào lịch sử shell, ghi `.env`, khởi động lại. `docker-compose.yml` truyền `GC_GITHUB_TOKEN` vào container.
- Rào mới `tools/test-token.js` (GitHub giả: 404 khi thiếu token, asset redirect sang host khác — host đích mà nhận Authorization là trượt; token sai; installer; `genchibi token`; token không lọt vào trạng thái/lịch sử/output).
- README: mục "Repo private: token cập nhật".

## v0.5.1 — Vá theo review v0.5.0 (cảnh)
- Review: không có blocker; không chèn được script/markup vào SVG cảnh, không prototype pollution, không ghi đè thư viện chính thức, không path traversal.
- **Phông "Trời quang" thiếu tham số màu ở hai đám mây** → 6 cảnh mất mây và SVG chứa `NaN`/`undefined`. Đã sửa; **rào mới**: test quét mọi cảnh × giờ × thời tiết và mọi phông × giờ, cấm `NaN`, `undefined`, `null`, `[object`, `Infinity`.
- **Mã nhúng web**: JSON trong `<script>` được escape (`<` `>` `&` U+2028/2029) — tên do agent đặt chứa `</script>` không thoát ra trang của người dùng. Test hồi quy trên trình duyệt.
- Đạo diễn: `spot` chỉ dùng khi có `scene`, phải là chỗ đứng cảnh mở, hai diễn viên không đứng cùng chỗ; Studio báo khi diễn viên nhiều hơn chỗ đứng.
- Sân khấu đạo diễn dựng hai lớp (nền sau diễn viên · lớp trước: đạo cụ trước, tiền cảnh, thời tiết, màu giờ) — hết nhuộm màu giờ hai lần, đúng thứ tự như ảnh tĩnh.
- `render_scene` giờ / thời tiết lạ → lỗi rõ ràng; lỗi cảnh tối đa 20 dòng, giá trị lặp lại bị cắt (không khuếch đại dữ liệu); mô tả cảnh không tạo dòng giả trong prompt đạo diễn; id gradient trời theo giờ (bàn soát ngày/đêm không lẫn); tra chỗ đứng qua `own()`.

## v0.5.0 — Loại asset thứ ba: cảnh · Studio tách Thư viện / Xưởng
- **Cảnh** = phối phông có sẵn theo 6 lớp (trời, cảnh xa, công trình, mặt đất, đạo cụ, tiền cảnh) + bảng màu + giờ (ngày / bình minh / hoàng hôn / đêm) + thời tiết (mưa, tuyết, hoa rơi, lá bay, sương, đom đóm). Phông chỉ dùng token màu cảnh nên đổi giờ không phải vẽ lại.
- Thư viện chính thức `afi.scenes`: 27 phông → 8 cảnh (Thảo lư Long Trung, Doanh trại lúc chiều, Dưới chân thành, Bờ sông Xích Bích, Thư phòng, Rừng trúc đêm, Vườn đào, Núi tuyết). Rào test: mọi phông chính thức phải được ít nhất một cảnh dùng.
- **Chỗ đứng chuẩn của engine** (8 chỗ, hai hàng): mọi dàn diễn viên đặt được vào mọi cảnh, dựng bằng đúng khung nhân vật (45°, 32 hoạt động, trang bị). Từ hai diễn viên, ai chưa chọn góc tự quay 45° về giữa. Ngân sách: diễn viên ≤ 8, đạo cụ ≤ 10, hạt thời tiết ≤ 60; mưa/tuyết có hạt giống → ảnh ổn định.
- **Một cổng ghi**: `saveSceneChecked` cho MCP (4 tool mới — 23 tool), `POST /api/scenes` và AI trong chatroom. Phông mới đi qua chính `get_part_spec` → `preview_part` (bàn soát ngày/đêm kèm diễn viên) → `save_part`, cùng bộ lọc SVG an toàn với token màu cảnh. Không ghi đè cảnh chính thức.
- **Đạo diễn AI diễn trong cảnh**: kịch bản có `"scene"`, mỗi bước có `"spot"`; Studio đặt diễn viên đúng chỗ, phủ màu giờ.
- **Studio tách hai khu**: **Thư viện** (xanh) — thành phẩm duyệt theo nhóm (Chính thức / Của tôi… rồi phe / loại / ngoài trời–trong nhà), xem biến thể và **lấy về dùng**: ảnh (SVG, PNG, avatar, sprite 18 biểu cảm, icon/thẻ item, cảnh 1280/1920, nền trống) và mã (mã tham chiếu, lệnh MCP, mã nhúng web, SVG, JSON công thức). **Xưởng** (hổ phách) — bàn phối nhân vật / trang bị / cảnh, kho linh kiện & phông (bàn soát phông), khung tư thế & biểu cảm, Xưởng AI, Đạo diễn AI, cổng kiểm. Trang "Xuất bản" cũ gộp vào khu Dùng của Thư viện.
- `docs/QUY-TRINH-LINH-KIEN.md`: mục 7 có hai ví dụ (item, cảnh) + chuẩn phông; mục 8 mới: Thư viện và Xưởng.

## v0.4.1 — Vá độ bền cho item (review v0.4.0)
- Review bảo mật v0.4.0: **không có lỗ hổng** (escape chữ, hex, prototype, path traversal, ghi đè chính thức đều đứng vững). Vá 4 điểm độ bền:
- Item bị lưu lại sang bộ phận khác không còn làm vỡ nhân vật đang mặc nó (engine bỏ qua item lệch bộ phận); cổng ghi chặn đổi bộ phận của item đã lưu — muốn đổi thì tạo id mới.
- `equip.part` không phải chuỗi → báo lỗi rõ ràng thay vì lỗi nội bộ.
- Lọc ký tự điều khiển trong tên / Hán tự / mô tả / truyền thuyết (trước đây làm thẻ SVG hỏng).
- `render_item` chế độ `equipped` mặc thử được **item nháp chưa lưu** (đăng ký tạm, xoá ngay sau khi dựng).
- Test hồi quy cho cả 4 điểm.

## v0.4.0 — Loại asset thứ hai: item trang bị
- **Item trang bị** = phối: trỏ tới linh kiện có sẵn + bảng màu riêng (chỉ áp lên linh kiện đó) + tham số + độ hiếm + chỉ số. Một linh kiện cho nhiều phẩm cấp (Đao sắt thường ↔ Thanh Long Yển Nguyệt Đao huyền thoại) — không vẽ thêm.
- Từ vựng đóng: 8 loại (vũ khí, tay phụ, pháp khí, mũ/khăn, giáp/áo, áo choàng, giày, mặt nạ) → bộ phận mặc; 5 độ hiếm; 6 chỉ số.
- **Tự đứng được**: icon theo độ hiếm và thẻ item (tên, Hán tự, loại, độ hiếm, chỉ số, mô tả). Khung icon là thuộc tính của linh kiện (`part.icon`) — vẽ một lần, mọi item dùng chung.
- **Mặc được**: nhân vật có `look.equip.<slot>`; mọi thứ của khung tự áp dụng (45°, 32 hoạt động, bàn soát, trait theo linh kiện).
- Thư viện chính thức `afi.items`: 13 item (Thanh Long đao, Xà mâu, Đao sắt, Thương gỗ, Kiếm sắt, Quạt lông vũ, Bầu rượu, Khăn cuốn, Khăn chiến đỏ, Giáp đồng, Giáp bạc Thường Sơn, Áo choàng đỏ, Ủng da).
- **Một cổng ghi**: `saveItemChecked` cho MCP (4 tool mới: `list_items`, `validate_item`, `save_item`, `render_item` — 19 tool), HTTP `POST /api/items` và AI trong chatroom. Item chính thức không bị ghi đè — sửa sẽ tạo bản trong "Của tôi".
- Studio › **Trang bị**: lưới icon theo loại, thẻ, mặc thử lên mọi nhân vật (chính diện / 45° / tấn công / chạy), sửa độ hiếm, linh kiện, bảng màu, chỉ số.
- Linh kiện dữ liệu (agent tạo) khai báo được khung icon.
- `docs/QUY-TRINH-LINH-KIEN.md` mục 7: **quy trình thêm một loại asset** (8 phần), item là ví dụ mẫu.

## v0.3.1 — Vá bảo mật cho tạo linh kiện (review v0.3.0)
- **ReDoS** (cao): regex kiểm `transform` có thể bị chuỗi ~1 300 ký tự làm treo server (mọi lối ghi, kể cả link MCP). Viết lại không chồng lấn; gộp khoảng trắng trước khi tách thẻ để bộ lọc chạy tuyến tính.
- **MCP / AI trong chatroom không còn ghi đè được nhân vật của thư viện chính thức** (trước đây truyền `pack: "afi.tamquoc"` là đè được). Chỉ Studio của chủ máy được lưu bản chỉnh trong thư viện chính thức.
- Bảng tra của bộ lọc không còn dính prototype (`constructor`…); chặn thuộc tính lặp; token màu chỉ nhận hex; lỗi trong tool không làm hỏng cả lượt AI.
- Linh kiện của người dùng không được trùng id với linh kiện chính thức cùng bộ phận.
- Test hồi quy cho cả 5 điểm.

## v0.3.0 — Tạo linh kiện qua MCP + một cổng ghi duy nhất cho mọi agent
- **Linh kiện dạng dữ liệu**: agent/người dùng tạo linh kiện bằng SVG thuộc tập con an toàn (path, circle, ellipse, rect, line, polyline, polygon, g), màu là hex hoặc token bảng màu `{robe}`. Engine đọc rồi dựng lại SVG — chặn script, on*, url(), style, href, image, text, comment, entity (16 kiểu tấn công trong test). Bắt buộc khai báo 45°: `drawn` | `same` | `face45` | `body45`.
- **3 tool MCP mới** (15 tool): `get_part_spec` (khung sườn dạng máy đọc + ví dụ), `preview_part` (bàn soát: ma-nơ-canh × 4 góc × 4 tình huống, một ảnh SVG), `save_part` (lưu vào "Của tôi", có phiên bản). Nhân vật dùng ngay qua `look.parts.<slot> = "local.my/<id>"`.
- **Một cổng ghi duy nhất**: MCP, API HTTP của Studio (`PUT /api/assets`, `POST /api/parts`) và AI trong chatroom cùng đi qua `saveAssetChecked` / `savePartChecked`. Trước đây `PUT /api/assets` lưu thẳng không qua cổng kiểm — đã đóng.
- **Luật chặn chung** `GC.blockingGates`: lỗi cấu trúc/an toàn chặn mọi trạng thái; dấu nhận diện bắt buộc khi chờ duyệt / đã duyệt.
- **Xưởng AI (chat)** trong Studio: AI chạy bằng LLM API của người dùng nhưng chỉ làm việc qua đúng bộ tool MCP (trừ cập nhật/rollback app), cùng chỉ dẫn; hiện từng lượt gọi tool và ảnh bàn soát/dựng hình.
- Cổng nhận diện so theo mã linh kiện (khớp cả `ci-hat` lẫn `local.my/ci-hat`).
- Test mới: bộ lọc SVG (tấn công), luồng MCP tạo linh kiện → phối → dựng 45°, `tools/test-agent.mjs` (AI chatroom với LLM giả lập đi đúng cổng).

## v0.2.3 — Phủ đủ 45° + quy trình tạo lập linh kiện
- **Toàn bộ 24 linh kiện chính thức có bản 45° vẽ thật** (thêm: tóc búi, tóc dựng, râu ba chòm, râu hổ, râu dài mảnh, khăn buộc trán, mũ vải mềm, mũ quan, áo bào, giáp trận, áo choàng, 3 mặt nạ kinh kịch) → cả 5 nhân vật tự đủ 45° mà không sửa nhân vật nào.
- **Công cụ chiếu 45° dùng chung** `GC.helpers.face45` (chi tiết bám mặt, cùng phép chiếu với mắt/miệng của engine) và `body45` (chi tiết trên thân, dồn về đường giữa áo mới).
- **Quy trình tạo lập linh kiện** thành chuẩn: `docs/QUY-TRINH-LINH-KIEN.md` (khung sườn, góc nhìn, công cụ, 6 bước tạo).
- **Bàn soát linh kiện** (Studio › Thư viện linh kiện › bấm một linh kiện): mặc lên ma-nơ-canh chuẩn × 4 góc nhìn × đứng/kinh ngạc/chạy/ngồi + bảng kiểm (45°, tham số, license, nguồn). Thư viện xem trước bằng ma-nơ-canh, không dựa vào nhân vật cụ thể.
- **Rào tự động**: test chặn phát hành khi linh kiện chính thức thiếu bản 45°, license hoặc nguồn.

## v0.2.2 — Góc nghiêng 45° vẽ thật (ở mức linh kiện)
- **Trục góc nhìn trong hệ linh kiện**: linh kiện có thể kèm bản vẽ `views.q45`; nhân vật phối linh kiện nào cũng tự có 45° (`view: left45 | right45`). Bản chuẩn quay mặt sang trái màn hình, 45° phải = lật gương.
- Linh kiện chưa có bản 45°: engine tự trượt parallax (φ = 32°) để vẫn dùng được. Cổng kiểm **"Bản vẽ nghiêng 45°: x/y linh kiện"** cho biết còn thiếu linh kiện nào; Thư viện linh kiện gắn nhãn "45°".
- Vị trí mặt 45° (mắt gần/xa, mày, miệng) thuộc engine → mọi kiểu mắt/mày/miệng đều hưởng. Hiệu ứng bám mặt (nước mắt, má hồng, mặt tái, bong bóng) tự ánh xạ theo mắt gần/xa. Tay đưa lên mặt (che miệng, vuốt râu, uống) tự đi theo miệng.
- Bản vẽ 45° đã có: dáng đầu tròn / hàm vuông / trái xoan (tai phía gáy nằm trên đầu), mái gọn, tóc dài sau lưng, râu dê, quần ống gọn, ủng, khăn cuốn, áo hạc sưởng → **Gia Cát Lượng đủ bộ 45° vẽ thật**.
- Studio: chọn góc 45° trái/phải; sân khấu báo linh kiện nào đang dùng bản trượt. MCP: `get_catalog` liệt kê `views` của từng linh kiện, `render_character` nhận `left45/right45`.
- Test: 32 hoạt động × mọi nhân vật × 3 thời điểm × 2 hướng × 5 góc nhìn; khẳng định bộ Gia Cát Lượng phủ đủ 45°.

## v0.2.1 — Góc nghiêng 3/4
- **Góc nhìn 3/4** (`view: front | left | right`, theo màn hình) cho mọi nhân vật, không vẽ lại linh kiện: quay kiểu parallax trên mặt cầu (x = R·sin(θ − φ)) — mắt xa hẹp lại, mắt gần rộng ra, miệng/râu/mái trượt theo, tóc sau và tai trượt ngược, thân quay ít hơn đầu, phía sau đầu lộ tóc (lưỡi liềm tóc tới ngang tai), tay phía xa lùi ra sau thân khi đang buông.
- Đang di chuyển mà chưa chọn góc: tự nghiêng 3/4 về hướng đi.
- Studio › Tư thế & hoạt động: chọn góc nhìn (Tự động · Chính diện · 3/4 trái · 3/4 phải); Đạo diễn AI và MCP `render_character` nhận `view`.
- Test: 32 hoạt động × mọi nhân vật × 3 thời điểm × 2 hướng × 3 góc nhìn.

## v0.2.0 — Tư thế & hoạt động (engine 0.3)
- **Khung xương có chân**: hông, đùi, gối, cổ chân; vạt áo tách khỏi thân trên và co giãn theo tư thế. Thêm khớp sân khấu cho đạo cụ đứng yên.
- **Ghép 4 trục** như animation layer của game engine: tư thế nền × di chuyển × động tác tay × biểu cảm, cộng đạo cụ và hướng (quay trái/phải).
  - 12 tư thế: đứng, đứng tấn, ngồi ghế, ngồi xếp bằng, quỳ, ngồi xổm, co rúm, nằm, bò, trên không, bay, bơi.
  - 10 di chuyển: đi, chạy, rón rén, nhảy, bò, bơi, bay lượn, lơ lửng, run rẩy, nhún nhảy.
  - 15 động tác mới: ăn, uống, đọc, viết, chém, đâm, đỡ, ôm đầu, vẫy, chỉ, cúi chào, ôm quyền, cổ vũ, vung tay, thả lỏng.
  - 11 đạo cụ (ghế, nệm, chiếu + gối, chăn, bàn, mặt nước, bát, đũa, chén, sách, bút lông) và 5 hiệu ứng (bụi chân, vệt tốc độ, gió, bọt nước, run).
  - **32 hoạt động đặt sẵn** theo nhóm Tư thế · Di chuyển · Sinh hoạt · Chiến đấu · Cảm xúc · Giao tiếp — agent gọi theo tên (`eat`, `sleep`, `attack`, `flee`…).
- Bóng đổ co lại khi nhảy/bay, giãn khi nằm; chữ hiệu ứng (Zzz, !!) luôn đứng thẳng và đọc xuôi kể cả khi nằm hoặc quay trái.
- Studio: trang **Tư thế & hoạt động** — lưới hoạt động theo nhóm, sân khấu ghép tự do từng trục, tải SVG khung hình.
- Đạo diễn AI và MCP: mỗi cảnh nhận `activity`, `posture`, `move`, `facing`; `get_catalog` liệt kê hoạt động/tư thế/di chuyển/đạo cụ; `render_character` dựng theo hoạt động và theo thời điểm `t` trong chu kỳ.
- Cổng kiểm "Dựng đủ hoạt động" (chạy ở hồ sơ asset, khi lưu qua MCP, trong test — không chạy ở danh sách để giữ nhanh với hàng trăm nhân vật).

## v0.1.9
- Bảo mật `genchibi expose`: chỉ nhận `cert.pem` trình duyệt tải về **sau** khi lần đăng nhập bắt đầu (đúng tên, tệp thường) và hỏi xác nhận trước khi dùng — không còn tự lấy tệp có sẵn trong thư mục Tải xuống (tránh tệp bị cài sẵn đưa tunnel sang tài khoản Cloudflare khác).

## v0.1.8
- `genchibi expose`: bước đăng nhập Cloudflare chịu lỗi — tự thử lại 3 lần khi hết 1 phút chờ bấm Authorize, tự nhận `cert.pem` trình duyệt đã tải về (thư mục Tải xuống, 2 giờ gần đây), dùng lại chứng chỉ có sẵn; chỉ in link cần mở, không in đường dẫn bên trong container.

## v0.1.7
- Sửa: cài đặt và tự cập nhật lỗi 403 khi GitHub API hết lượt gọi của IP (giới hạn 60 lượt/giờ, mạng dùng chung IP hay gặp). Giờ tự chuyển sang đọc bản mới nhất từ trang `github.com/.../releases/latest` và tải gói trực tiếp; vẫn kiểm SHA-256 như cũ.

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
