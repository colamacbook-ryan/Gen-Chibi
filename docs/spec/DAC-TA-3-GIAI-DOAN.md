# gen-chibi — Đặc tả 3 giai đoạn (v3)

> **Trạng thái:** Ryan đã duyệt hướng ngày 2026-10-18 ("ok làm đi"). Đã dựng đủ ① ② ③ (v0.7.0 → v0.9.0) — chờ Ryan dùng thử và góp ý.
> v3 viết lại theo đúng lời Ryan, thay cho v1–v2 (nằm trong lịch sử git).
> © 2026 Afi Labs — All rights reserved.

## Lời Ryan (nguồn của bản này)
> "bây giờ lo làm xưởng trước, và không tam quốc gì nữa hết, chỉ là 1 nhân vật đầu trọc chung chung không quần áo trang bị gì hết → vì bản chất là 1 bộ khung. và các vật phẩm đều là 1 khung đại diện hình khối, cây, tròn dẹt gì đấy đại diện cho khung của 1 dạng hình vật phẩm, bối cảnh vị trí nền đất quang cảnh, bầu trời đều như vậy. → đây là bộ khung chuẩn cho tất cả asset. → hình thành trọn bộ qui cách tiêu chuẩn thống nhất cho tất cả asset được tạo ra
> → sau đó cần làm ra asset chủ đề nào thì vào tạo giao diện tạo asset mới thêm tham số để tạo ra asset đó, ok rồi thì mới lưu vào thư viện và thống nhất quản lý theo từng dự án chủ đề cụ thể.
> → sau khi có được thư viện thì mới qua giao diện tạo tác để chat với AI đạo diễn trên đó để tạo ra kịch bản, phân cảnh từ thư viện asset rồi xong hết mới ghép lại thành chuỗi dài. phân cảnh hay vật phẩm nào, nhân vật nào còn thiếu thì AI sẽ tự dùng xưởng để tạo thêm ra thư viện rồi mới lấy áp vào dùng → như vậy giao diện tạo tác này sẽ có chatroom với AI, khu kịch bản, mô tả phân cảnh và cảnh thành phẩm và sân khấu biểu diễn final."

---

## ① XƯỞNG — bộ khung chuẩn (làm trước)

**Là gì:** khung chung cho mọi asset, **không có chủ đề**. Kiểu "greybox" của làm game: khối xám chốt kích thước, vị trí, luật — sau này thay áo theo chủ đề.

| Loại | Khung | Đã dựng |
|---|---|---|
| Nhân vật | **ma-nơ-canh đầu trọc, không quần áo** — đủ khớp, 18 biểu cảm, 32 hoạt động, 8 hướng (2.5D) | `afi.khung/ma-no-canh` |
| Vật phẩm | **khối đại diện theo dáng**: que dài, que ngắn, đĩa dẹt, hộp, cầu, đội đầu, khoác thân, sau lưng, giày, che mặt | 10 khối + 10 item khung |
| Bối cảnh | **khối đại diện**: trời / tường, chân trời, khối nhà, nền có lưới tỉ lệ, tiền cảnh, khối hộp / trụ / cây / đá / bàn / cờ | 13 khối + 2 cảnh khung |
| Quy cách | kích thước, điểm gắn, lớp, góc nhìn, tham số, màu, luật kiểm — **thống nhất cho mọi asset** | `docs/QUY-CACH-KHUNG.md` |

**Luật:** khung do Afi giữ; AI và người dùng **không sửa khung**, chỉ tạo asset **từ** khung.

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
- Đã làm: asset AI tự tạo lưu vào **dự án của tác phẩm** (trạng thái nháp), dùng được ngay. Chờ Ryan: có cần bước duyệt trước khi asset AI tạo được dùng ở dự án khác không.
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
