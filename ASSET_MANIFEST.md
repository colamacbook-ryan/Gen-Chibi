# ASSET_MANIFEST

Nguồn và license của mọi asset và phụ thuộc đi kèm sản phẩm.

| Thành phần | Nguồn | License |
|---|---|---|
| Toàn bộ hình vẽ nhân vật, linh kiện, hiệu ứng (`kinds/`) | Vẽ bằng code, Gen Labs | © 2026 Gen Labs — All rights reserved |
| Engine, Studio, server, launcher, installer | Gen Labs | © 2026 Gen Labs — All rights reserved |
| Image Docker `node:22-alpine` (chỉ dùng lúc chạy, không phân phối lại) | Docker Official Images | MIT (Node.js) và license các gói Alpine |
| `cloudflared` (image Docker `cloudflare/cloudflared:2026.9.3` hoặc bản cài của người dùng) — chỉ tải khi người dùng chạy `genchibi expose`, không phân phối lại | Cloudflare | Apache-2.0 |
| Hồ sơ nhận diện tướng Tam Quốc | Tam Quốc diễn nghĩa (phạm vi công cộng), ghi mã nguồn trong `identity.source` | Phạm vi công cộng |
| Phông lời thoại **Be Vietnam Pro** 500 · 700 · 800 — nhúng trong `engine/fonts.js` (WOFF2 base64, ~64 KB, đi theo cả phim HTML xuất ra, chạy ngoại tuyến). Bản cắt chỉ giữ Latin + tiếng Việt và bỏ mã hint (`tools/build-fonts.sh` dựng lại); tên phông, bản quyền, giấy phép trong phông giữ nguyên | Be Vietnam Pro Project Authors — gốc https://github.com/bettergui/BeVietnamPro; tệp lấy từ bản phát hành lại chính thức https://github.com/google/fonts/tree/main/ofl/bevietnampro | **SIL Open Font License 1.1** — © 2021 The Be Vietnam Pro Project Authors (không khai Reserved Font Name). Toàn văn: `engine/fonts/OFL-BeVietnamPro.txt` và đầu `engine/fonts.js`. Phông vẫn thuộc OFL dù nằm trong gói Gen Labs (không bán riêng phông) |

Ngoài phông Be Vietnam Pro ở trên (OFL 1.1), không dùng font, ảnh hay thư viện bên thứ ba trong gói phát hành.
