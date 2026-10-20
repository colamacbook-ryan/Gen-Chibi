# Quy cách bộ khung chuẩn — áp dụng cho MỌI asset

[English](FRAME-SPEC.md) | **Tiếng Việt**

> Bộ khung `gen.khung` là quy cách vẽ thành hình. Asset nào tạo ra (bởi Gen Labs, người dùng hay AI) cũng phải khớp quy cách này,
> và được kiểm tự động bằng cổng kiểm trước khi vào Thư viện. Chi tiết kỹ thuật vẽ linh kiện: `docs/QUY-TRINH-LINH-KIEN.md`.
> © 2026 Gen Labs — All rights reserved.

## 1. Nhân vật — khung ma-nơ-canh (`gen.khung/ma-no-canh`)

| Hạng mục | Quy cách |
|---|---|
| Khung vẽ | 200 × 240 đơn vị; chân chạm đất tại **(100, 228)**; vùng hiển thị −24…224 × −18…240 |
| Đầu | x 50–150, y 54–147 (tâm mặt 100, 100); mắt (80 / 120, 108); miệng (100, 131) |
| Thân | thân trên y 146–194 (thắt lưng 186); hông / vạt y 188–212; chân y 198–228 |
| Khớp (18) | hông → thân → đầu; vai → khuỷu (74 / 126, 177) → cổ tay / lòng bàn tay (72 / 128, 193); háng → gối → cổ chân |
| Bộ phận (11) | dáng đầu · mặt nạ · tóc · râu · mũ · trang phục · sau lưng · quần · giày · tay trái cầm · tay phải cầm |
| Góc nhìn (8 hướng + 3/4 nhẹ) | chính diện · 45° · 90° (nhìn ngang) · 135° (quay lưng chéo) · sau lưng — mỗi góc nghiêng có trái/phải (bản chuẩn quay sang trái; bên phải = lật gương) + 3/4 nhẹ trái/phải (engine trượt). Sprite 8 hướng xếp vòng theo chiều kim đồng hồ: front · left45 · left90 · left135 · back · right135 · right90 · right45 |
| Biểu cảm | 18 (mắt + mày + miệng + hiệu ứng + động tác) |
| Chuyển động | 12 tư thế × 10 di chuyển × 58 động tác lặp; 32 hoạt động đặt sẵn |
| Bộ động tác khung (v0.16, `gen.dong-tac`) | trung lập chủ đề: **tay không + hài** — đấm (vào mặt, tay cao su), đá, đẩy mặt, ném cà chua; **đòn binh khí chung** — đâm, quét (`needs: weapon`); một mình — dậm chân giận, tạo dáng, nhảy mừng, thi lễ, vẫy chào, vươn vai, gãi đầu, giật mình, lộn ngược; × 5 phản ứng (trúng, ngã lộn, choáng, gạt đỡ, né). Đòn riêng một chủ đề nằm trong **gói động tác** của bộ đó (vd. Tam Quốc: liên hoàn, xoay chém, tung người bổ, múa thương) |
| Bắt buộc với linh kiện | có bản 45° (trừ vật cầm tay), license, nguồn; qua cổng ở mọi biểu cảm × hoạt động × góc. Linh kiện **khung** vẽ đủ 4 dáng góc (q45 · q90 · q135 · q180); asset chủ đề thiếu góc nào thì engine mượn góc gần nhất |

## 2. Vật phẩm — 10 khối đại diện theo dáng

> Khối chỉ là **dáng**. Một vật cầm tay là **binh khí** (mở các đòn "cần binh khí") khi nhân vật cầm nó qua **trang bị loại Vũ khí**, hoặc linh kiện khai `grip: "weapon"`; quạt, sách, chén… là `grip: "prop"`, dụng cụ là `"tool"` (v0.16).

| Khối | Bộ phận | Điểm gắn | Tham số | Dùng làm gốc cho |
|---|---|---|---|---|
| Que dài | tay phải cầm | lòng bàn tay phải (128, 193) | độ dài 0.7–1.3 | giáo, thương, gậy, đao cán dài |
| Que ngắn | tay phải cầm | lòng bàn tay phải, nghiêng 24° | độ dài 0.7–1.4 | kiếm, dao, bút, gậy ngắn |
| Đĩa dẹt | tay trái cầm | lòng bàn tay trái (72, 193) | cỡ 0.7–1.4 | khiên, quạt, gương |
| Hộp | tay trái cầm | lòng bàn tay trái | cỡ 0.7–1.4 | sách, hộp, thư |
| Cầu | tay trái cầm | lòng bàn tay trái | cỡ 0.7–1.4 | bình, quả, bầu rượu |
| Đội đầu | mũ | đỉnh đầu, vành y ≈ 84 | độ cao 0.7–1.4 | mũ, khăn, nón |
| Khoác thân | trang phục | thân + vạt + tay áo | độ rộng 0.88–1.18 | áo, giáp, bào |
| Sau lưng | sau lưng | vai (y 150) → gót (y 222) | — | áo choàng, bao, cánh |
| Giày | giày | cổ chân (87 / 113, 221) | — | ủng, dép, guốc |
| Che mặt | mặt nạ | ngang mắt y 98–116 | — | mặt nạ, băng mắt, sơn mặt |

Vật phẩm = khối + bảng màu riêng + tham số + độ hiếm + chỉ số. Icon và thẻ dựng tự động từ khối.

## 3. Bối cảnh — khung sân khấu (`gen.khung/san-khau-chuan`, `phong-chuan`)

| Hạng mục | Quy cách |
|---|---|
| Khung vẽ | 640 × 360; chân trời y ≈ 230–260; mặt đất từ y ≈ 258 |
| Lớp (6) | trời / tường · cảnh xa · công trình · mặt đất · đạo cụ (≤ 10) · tiền cảnh |
| Chỗ đứng (8) | hàng trước y 330, cỡ 0.8: x 100 · 210 · 320 · 430 · 540 — hàng sau y 280, cỡ 0.62: x 205 · 320 · 435 (vạch đứt trên nền lưới) |
| Đạo cụ | vẽ quanh gốc (0, 0) = chân vật; đặt bằng x, y, cỡ, lật, lớp sâu (sau / giữa / trước diễn viên) |
| Khối đạo cụ khung | hộp · trụ · cây · đá · bàn · cờ / biển |
| Giờ (4) | ngày · bình minh · hoàng hôn · đêm — chỉ đổi token màu + phủ màu |
| Thời tiết (7) | quang · mưa · tuyết · hoa rơi · lá bay · sương · đom đóm |
| Ngân sách | diễn viên ≤ 8 · đạo cụ ≤ 10 · hạt thời tiết ≤ 60 |

## 4. Màu
- Mọi khung chỉ dùng **token màu**: nhân vật (`skin`, `robe`, `metal`, `wood`, `hat`…), bối cảnh (`sky`, `ground`, `wall`, `stone`, `leaf`…).
- Khung dùng bảng màu xám trung tính; asset chủ đề đổi token để "thay áo" — không vẽ lại.

## 5. Tạo asset từ khung (quy trình chung)
1. Chọn khung (ma-nơ-canh / khối vật phẩm / khối bối cảnh).
2. Thêm tham số, màu, và linh kiện vẽ thêm đúng bộ phận và lớp ở trên.
3. Soát trên bàn soát: mọi góc × hoạt động (nhân vật, vật phẩm) hoặc ngày / đêm + diễn viên (bối cảnh).
4. Qua cổng kiểm → lưu vào Thư viện theo dự án chủ đề.
