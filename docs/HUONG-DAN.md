# Hướng dẫn sử dụng gen-chibi

> gen-chibi giúp bạn **làm phim / truyện chibi** từ một bộ khung chuẩn: dựng nhân vật, vật phẩm, bối cảnh → cất vào thư viện theo chủ đề → chat với AI đạo diễn để ra phim.
> © 2026 Gen Labs — All rights reserved · Tác giả: Ryan — 090.919.8823

## Nhanh nhất: 10 giây để thấy cả luồng
1. Mở gen-chibi (mặc định `http://localhost:7480`).
2. Ở màn **Chọn khu làm việc**, bấm **✨ Mở dự án mẫu "Văn phòng vui"**.
3. Bạn được đưa tới **Thư viện**: 3 nhân vật, 1 vật phẩm, 2 bối cảnh của dự án mẫu.
4. Mở **Tạo tác** → tác phẩm *Ngày đầu đi làm* (4 phân cảnh) → bấm **▶ Diễn toàn bộ**.
5. Bấm **Phim (HTML)** để tải phim về — mở tệp bằng trình duyệt bất kỳ là xem, gửi cho người xem.

## Ba khu — ba ứng dụng riêng

| Khu | Địa chỉ | Làm gì |
|---|---|---|
| **Xưởng** (hổ phách) | `/xuong` | Bộ khung chuẩn (không chủ đề), **Tạo asset mới** từ khung, bàn chỉnh, Trợ lý AI tạo asset |
| **Thư viện** (xanh dương) | `/thu-vien` | Asset đã qua cổng kiểm, **xếp theo dự án chủ đề** — xem, tải ảnh / sprite, chép mã, tải / nhập gói dự án |
| **Tạo tác** (xanh lá) | `/tao-tac` | **Tác phẩm**: chat với AI đạo diễn, kịch bản, phân cảnh, cảnh thành phẩm, sân khấu final, xuất phim |

Dòng chảy một chiều: **Xưởng → Thư viện → Tạo tác**. Thanh chuyển khu luôn ở góc trên bên trái.

## 1. Tạo dự án chủ đề (Thư viện)
**Thư viện › Dự án chủ đề › Dự án mới** — đặt tên (ví dụ "Tam Quốc", "Cổ tích Việt"). Mọi asset và tác phẩm thuộc một dự án; Studio nhớ dự án bạn dùng gần nhất.

## 2. Tạo asset từ khung (Xưởng › Tạo asset mới)
Bốn bước trên một trang:
1. **Chọn khung** — Nhân vật (ma-nơ-canh), Vật phẩm (10 khối theo dáng: que dài, que ngắn, đĩa, hộp, cầu, mũ, áo, choàng, giày, che mặt), Bối cảnh (sân khấu ngoài trời / trong nhà). Chọn dự án để lưu vào.
2. **Tham số & chi tiết** — tên, linh kiện từng bộ phận, độ dài / cỡ, bảng màu, mắt / mày, dấu nhận diện, tính cách (vật phẩm: loại, độ hiếm, chỉ số; bối cảnh: lớp phông, giờ, thời tiết, màu).
3. **Soát mọi góc** — nhân vật 8 hướng + 4 hoạt động; vật phẩm icon + thẻ + mặc lên ma-nơ-canh; bối cảnh ngày / đêm / có diễn viên.
4. **Cổng kiểm & lưu** — ✓ đạt, ✗ chặn (phải sửa), ⚠ chỉ cần khi chuyển duyệt (bản nháp vẫn lưu được).

Lưu xong: **+ Tạo tiếp** (cùng khung, cùng dự án) · **Xem trong Thư viện** · **Làm phim với dự án này**.
Khung không bao giờ bị sửa — asset của bạn là bản sao của khung + tham số của bạn.

## 3. Làm phim (Tạo tác › Tác phẩm)
- **Tác phẩm mới**: đặt tên, chọn dự án.
- **Kịch bản lẻ**: agent ngoài gửi kịch bản qua MCP (`save_event`) → hiện ở khung *Kịch bản lẻ* → **+ Thành phân cảnh**.
- **AI đạo diễn** (cần API key ở *Cài đặt AI*): kể ý tưởng hoặc bấm nút nhanh *Viết kịch bản · Chia phân cảnh · Viết lời thoại · Kiểm thiếu*. AI chỉ dùng asset trong Thư viện; **thiếu nhân vật / bối cảnh thì AI tự vào Xưởng tạo** (đúng dự án, qua cổng kiểm) rồi mới dùng. Mỗi câu trả lời kèm nhật ký việc AI đã làm (✓ / ✗).
- **Không có AI vẫn làm được**: tự thêm phân cảnh, chọn bối cảnh, bấm chọn diễn viên (≤ 8), rồi *AI viết lời thoại* cho từng cảnh hoặc chỉnh JSON qua MCP.
- **Tình trạng**: thanh "Sẵn sàng x/y phân cảnh" + danh sách cảnh còn thiếu gì — bấm để tới đúng phân cảnh.
- **Sân khấu final**: ▶ Diễn toàn bộ — thẻ tiêu đề từng phân cảnh, diễn viên sống, bóng thoại có tên người nói.

### Xuất thành phẩm
| Nút | Ra gì |
|---|---|
| **Phim (HTML)** | Một tệp .html tự chứa (bộ phát + nhân vật + bối cảnh + lời thoại). Mở bằng trình duyệt, không cần cài, không cần mạng. Có danh sách phân cảnh, toàn màn hình, phím cách để xem / dừng. Bộ phát bên trong thuộc Gen Labs — giấy phép **chỉ để xem phim đó** (ghi trong tệp) |
| **Storyboard SVG / PNG** | Bảng phân cảnh: ảnh từng cảnh + mô tả + lời thoại — để duyệt, in, gửi khách |
| **JSON** | Kịch bản + phân cảnh dạng dữ liệu |

## 4. Gói dự án — sao lưu, chuyển máy, chia sẻ / bán bộ asset theo chủ đề
- **Tải gói dự án (JSON)** (Thư viện › Dự án chủ đề): nhân vật, trang bị, bối cảnh, linh kiện / phông tự vẽ đang dùng, tác phẩm.
- **Nhập gói…**: mọi mục đi qua đúng cổng kiểm như khi tạo mới. Trùng id thì hỏi lưu đè — lưu đè tạo **phiên bản mới**, bản cũ vẫn trong lịch sử.

## 5. Dùng asset ở nơi khác
Ở Thư viện, mỗi asset có khu **Dùng**: tải SVG / PNG / avatar / sprite biểu cảm / **sprite 8 hướng**, chép mã tham chiếu, mã gọi MCP, mã nhúng web, JSON công thức.

## 6. Cho agent AI (MCP)
gen-chibi có MCP server (`/mcp` hoặc lệnh `genchibi mcp`) với 31 tool: tạo / kiểm / dựng nhân vật, linh kiện, item, cảnh; dự án chủ đề; tác phẩm (`save_work`, `save_shot`); gói dự án (`export_project`, `import_project`). Agent đi qua **cùng cổng kiểm** với Studio.

## Câu hỏi thường gặp
- **AI tự tạo asset có cần duyệt không?** Không — lưu dạng nháp trong dự án của tác phẩm và dùng ngay.
- **Lỡ sửa hỏng?** Mọi asset và tác phẩm có phiên bản; bản cũ nằm trong thư mục dữ liệu (`versions/`).
- **Hiệu năng?** Mỗi sân khấu tối đa 8 diễn viên sống; ảnh tĩnh được cache; hết phân cảnh là huỷ diễn viên.
