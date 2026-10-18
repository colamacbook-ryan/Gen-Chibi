# gen-chibi — Đặc tả 3 giai đoạn (v3)

> **Trạng thái:** Ryan đã duyệt hướng ngày 2026-10-18 ("ok làm đi"). Đã dựng đủ ① ② ③ (v0.7.0 → v0.9.0) — chờ Ryan dùng thử và góp ý.
> v3 viết lại theo đúng lời Ryan, thay cho v1–v2 (nằm trong lịch sử git).
> © 2026 Gen Labs — All rights reserved.

## Lời Ryan (nguồn của bản này)
> "bây giờ lo làm xưởng trước, và không tam quốc gì nữa hết, chỉ là 1 nhân vật đầu trọc chung chung không quần áo trang bị gì hết → vì bản chất là 1 bộ khung. và các vật phẩm đều là 1 khung đại diện hình khối, cây, tròn dẹt gì đấy đại diện cho khung của 1 dạng hình vật phẩm, bối cảnh vị trí nền đất quang cảnh, bầu trời đều như vậy. → đây là bộ khung chuẩn cho tất cả asset. → hình thành trọn bộ qui cách tiêu chuẩn thống nhất cho tất cả asset được tạo ra
> → sau đó cần làm ra asset chủ đề nào thì vào tạo giao diện tạo asset mới thêm tham số để tạo ra asset đó, ok rồi thì mới lưu vào thư viện và thống nhất quản lý theo từng dự án chủ đề cụ thể.
> → sau khi có được thư viện thì mới qua giao diện tạo tác để chat với AI đạo diễn trên đó để tạo ra kịch bản, phân cảnh từ thư viện asset rồi xong hết mới ghép lại thành chuỗi dài. phân cảnh hay vật phẩm nào, nhân vật nào còn thiếu thì AI sẽ tự dùng xưởng để tạo thêm ra thư viện rồi mới lấy áp vào dùng → như vậy giao diện tạo tác này sẽ có chatroom với AI, khu kịch bản, mô tả phân cảnh và cảnh thành phẩm và sân khấu biểu diễn final."

---

## ① XƯỞNG — bộ khung chuẩn (làm trước)

**Là gì:** khung chung cho mọi asset, **không có chủ đề**. Kiểu "greybox" của làm game: khối xám chốt kích thước, vị trí, luật — sau này thay áo theo chủ đề.

| Loại | Khung | Đã dựng |
|---|---|---|
| Nhân vật | **ma-nơ-canh đầu trọc, không quần áo** — đủ khớp, 18 biểu cảm, 32 hoạt động, 8 hướng (2.5D) | `gen.khung/ma-no-canh` |
| Vật phẩm | **khối đại diện theo dáng**: que dài, que ngắn, đĩa dẹt, hộp, cầu, đội đầu, khoác thân, sau lưng, giày, che mặt | 10 khối + 10 item khung |
| Bối cảnh | **khối đại diện**: trời / tường, chân trời, khối nhà, nền có lưới tỉ lệ, tiền cảnh, khối hộp / trụ / cây / đá / bàn / cờ | 13 khối + 2 cảnh khung |
| Quy cách | kích thước, điểm gắn, lớp, góc nhìn, tham số, màu, luật kiểm — **thống nhất cho mọi asset** | `docs/QUY-CACH-KHUNG.md` |

**Luật:** khung do Gen Labs giữ; AI và người dùng **không sửa khung**, chỉ tạo asset **từ** khung.

## ② TẠO ASSET MỚI → THƯ VIỆN theo dự án chủ đề

1. Mở giao diện tạo asset → **chọn khung** (ma-nơ-canh, khối vật phẩm, khối bối cảnh).
2. **Thêm tham số và chi tiết** để thành asset cụ thể (dáng, màu, linh kiện vẽ thêm).
3. Xem thử trên bàn soát (mọi góc, mọi hoạt động / ngày–đêm).
4. Qua cổng kiểm (theo quy cách) → **lưu vào Thư viện, xếp theo dự án chủ đề**.

Tam Quốc đã cất khỏi bản đang chạy; sau này làm lại như một dự án chủ đề dựng từ khung (đồng thời là bài kiểm tra khung).

## ③ TẠO TÁC — làm phim / truyện với AI đạo diễn

Giao diện gồm 5 khu: **chat với AI · kịch bản · mô tả phân cảnh · cảnh thành phẩm · sân khấu diễn bản cuối**.
- AI viết kịch bản → chia phân cảnh → dựng từng cảnh từ asset trong Thư viện → ghép thành chuỗi dài.
- **Thiếu nhân vật / vật phẩm / phân cảnh nào thì AI tự vào Xưởng tạo thêm** (theo đúng quy cách, qua cổng kiểm) → lưu Thư viện → lấy ra dùng.
- **Chốt (Ryan, 2026-10-18):** asset AI tự tạo lưu vào **dự án của tác phẩm** ở trạng thái nháp và dùng ngay — **không cần bước duyệt**.
- Tác phẩm = logline + kịch bản tổng + danh sách phân cảnh (mô tả, bối cảnh, ≤ 8 diễn viên, lời thoại / diễn xuất) + lịch sử chat. Mọi ghi qua cùng cổng kiểm với MCP; agent ngoài (MCP) làm được y như AI trong Studio.

---

## Thứ tự làm
| Đợt | Nội dung | Trạng thái |
|---|---|---|
| 1a | Bộ khung chuẩn + quy cách + bảng soát bằng hình | xong (Ryan duyệt 2026-10-18) |
| 1b | Cất Tam Quốc khỏi bản chạy; đạo cụ thành khối; Studio Xưởng hiển thị khung + quy cách; test chuyển sang khung | xong — v0.6.0 |
| 1c | 8 hướng nhìn (2.5D): 45° · 90° · 135° · sau lưng cho engine + mọi linh kiện khung; sprite 8 hướng | xong — v0.7.0 |
| 2 | Giao diện tạo asset từ khung (chọn khung → tham số → soát → lưu thư viện theo dự án chủ đề) | xong — v0.8.0 (Xưởng › Tạo asset mới; Thư viện › Dự án chủ đề; MCP `list_projects` / `save_project`) |
| 3 | Tạo tác: chat AI đạo diễn, kịch bản, phân cảnh, cảnh thành phẩm, sân khấu final; AI tự gọi Xưởng khi thiếu | xong — v0.9.0 (Tạo tác › Tác phẩm; MCP `list_works` / `get_work` / `save_work` / `save_shot`) |
| 4 | Ba ứng dụng độc lập `/xuong` · `/thu-vien` · `/tao-tac` + luồng người dùng liền mạch (Ryan: "tách 3 lớp ra 3 giao diện quản lý độc lập") | xong — v0.10.0 |
| 5 | Thành phẩm: xuất phim HTML độc lập, storyboard, bảng tình trạng; gói dự án xuất / nhập qua cổng; dự án mẫu một chạm; gom một lối Tạo tác | xong — v0.11.0 / v0.11.1 |
| 6 | Áp quyết định Q1–Q4 (dưới): Nháp / Phát hành + Gói bán; đổi tên thư viện `afi.*` → `gen.*` (tên cũ vẫn đọc được); câu định vị | xong — v0.12.0 |
| 8 | **Phim sống** (Ryan 2026-10-18: "nhân vật chỉ biết đứng yên… không âm thanh, không giọng, không nhép miệng… quá tệ"): đạo diễn tự động (ra sân, đi lại, bước tới / lùi, quay về người nói, khoa tay, phản ứng), máy quay cận / hai người / toàn + rung / chớp, nhép miệng, bong bóng truyện tranh (nói / hét / nghĩ / thì thầm), âm thanh tổng hợp (hiệu ứng, nền, nhạc), giọng riêng từng nhân vật (máy đọc tiếng Việt / blip). Bộ mẫu Tam Quốc thành tủ kính Gen Labs không xuất bán | xong — v0.14.0 |
| 7 | **Bài thử khung: dựng lại Tam Quốc như một dự án chủ đề** qua đúng cổng (linh kiện dữ liệu → trang bị → bối cảnh → tướng → phim → gói bán). Khung được nâng để linh kiện dữ liệu ngang linh kiện code: `{shape}`, đánh dấu chiếu 45°, `eyeArea` / `tall` | xong — v0.13.0 (`studio/mau/tam-quoc.json`, `archive/tamquoc/port.js`) |

---

## Quyết định Q1–Q4 (Ryan, 2026-10-18: "ok theo mặc định của bạn hết")
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Lõi ẩn (khung gốc là service cần giấu) với phim HTML xuất ra | **Giai đoạn dựng:** phim HTML vẫn chứa bộ phát, kèm giấy phép *chỉ để xem phim đó*. **Trước khi làm SaaS:** chuyển sang trình phát do Gen Labs lưu trữ hoặc xuất video; repo chuyển private khi Ryan bật |
| Q2 | Câu định vị | **Nhà máy asset chibi theo chủ đề**; làm phim là *cách dùng* asset và là *bản demo sống* của thư viện |
| Q3 | "Duyệt" còn nghĩa gì khi asset AI tạo không cần duyệt | Hai trạng thái: **Nháp** (dùng ngay trong dự án — mặc định, kể cả AI tạo) · **Phát hành** (vào **Gói bán**; nhân vật cần dấu nhận diện). Dữ liệu cũ: `approved` → Phát hành, `review` → Nháp. Gói sao lưu = mọi thứ + tác phẩm; Gói bán = chỉ asset phát hành, không tác phẩm |
| Q4 | Tên thư viện `afi.*` (di sản Afi Labs) | Đổi sang **`gen.core`**, **`gen.khung`**; pack khai `aliases` để tham chiếu / gói / dữ liệu cũ `afi.*` vẫn đọc được và tự chuẩn hoá khi lưu |
