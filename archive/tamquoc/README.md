# Bộ Tam Quốc (đã cất — không nạp vào bản chạy)

Cất ngày 2026-10-18 theo quyết định của Ryan: Xưởng làm **bộ khung chuẩn** trước (ma-nơ-canh, khối vật phẩm, khối bối cảnh),
không còn nội dung chủ đề trong bản chạy. Sau này Tam Quốc sẽ được dựng lại như một **dự án chủ đề** tạo từ khung.

Ảnh chụp nguyên trạng v0.5.x:
- `afi.core.v0.5.js` — afi.core cũ (còn tóc, râu, mũ, áo bào, giáp, áo choàng, quần, ủng, kiếm, đạo cụ có màu)
- `afi.tamquoc.js` — 5 nhân vật (Gia Cát Lượng, Quan Vũ, Trương Phi, Tào Tháo, Lính quèn) + linh kiện riêng
- `afi.items.js` — 13 trang bị · `afi.scenes.js` — 27 phông, 8 cảnh

**Đã dựng lại (v0.13.0)** thành dự án chủ đề tạo từ khung: `node archive/tamquoc/port.js` dựng bộ v0.5 với bảng màu token + dáng đầu `{shape}`
và đánh dấu chiếu 45°, ra gói `studio/mau/tam-quoc.json` (linh kiện dữ liệu, trang bị, bối cảnh, 7 tướng, phim) — gói đi qua đúng cổng nhập như mọi gói.
Sửa bộ Tam Quốc thì sửa `port.js` rồi chạy lại; `tools/test.sh` (2f) chặn gói lệch nguồn.

Muốn xem lại: nạp `engine/core.js` → `archive/tamquoc/afi.core.v0.5.js` → `afi.tamquoc.js` → `afi.items.js` → `afi.scenes.js`
(thay cho `kinds/`). Thư mục này không nằm trong gói phát hành.

© 2026 Gen Labs — All rights reserved.
