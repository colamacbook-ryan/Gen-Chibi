# ASSET_MANIFEST

Nguồn và license của mọi asset và phụ thuộc đi kèm sản phẩm.

| Thành phần | Nguồn | License |
|---|---|---|
| Toàn bộ hình vẽ nhân vật, linh kiện, hiệu ứng (`kinds/`) | Vẽ bằng code, Gen Labs | © 2026 Gen Labs — All rights reserved |
| Engine, Studio, server, launcher, installer | Gen Labs | © 2026 Gen Labs — All rights reserved |
| Âm thanh hiệu ứng: bộ chuẩn `gen.am` (`engine/sounds.js`) + gói âm chủ đề (`kinds/sound/*.json`) — công thức tổng hợp Web Audio dạng dữ liệu (`gen-chibi.sound/1`), không có tệp mẫu âm thanh nào; gói âm của bộ mẫu Tam Quốc (`tq-am`) là bộ mẫu của Gen Labs (chỉ để xem, thử, quay phim — không bán lại, chặn bán theo nội dung); phim HTML xuất ra nhúng gói âm của dự án; tệp WAV dựng lại từ công thức bằng `GC.audio.renderWav` (không có mẫu thu nào bên thứ ba) | Gen Labs (tổng hợp bằng code) | © 2026 Gen Labs — All rights reserved |
| Image Docker `node:22-alpine` (chỉ dùng lúc chạy, không phân phối lại) | Docker Official Images | MIT (Node.js) và license các gói Alpine |
| `cloudflared` — binary chính thức **ghim phiên bản + SHA-256 trong `launcher.js`** (2026.10.2: Linux amd64 / arm64, macOS amd64 / arm64). Launcher tải từ GitHub Releases của Cloudflare về `bin/cloudflared-<phiên bản>` của bản cài chỉ khi chủ bật tunnel (Go online), kiểm SHA trước mỗi lần chạy; không nằm trong gói phát hành, không phân phối lại. Đường cũ `genchibi expose` (profiles `tunnel` / `quick`, bỏ ở v0.22) vẫn dùng image Docker `cloudflare/cloudflared:2026.9.3` hoặc bản cài của người dùng | Cloudflare — https://github.com/cloudflare/cloudflared | Apache-2.0 |
| Caddy — image Docker `caddy:2.11.7` (Docker Official Image), service `gen-chibi-edge` trong `docker-compose.edge.yml`: chỉ kéo khi chủ chạy `genchibi online --caddy`, không phân phối lại. Kiểm thử (`tools/test-edge.sh`) dùng binary caddy 2.11.7 từ kho apt chính thức của Caddy (kiểm SHA), chỉ trên máy dev / CI | Caddy — https://github.com/caddyserver/caddy (Matthew Holt and The Caddy Authors) | Apache-2.0 |
| Hồ sơ nhận diện tướng Tam Quốc | Tam Quốc diễn nghĩa (phạm vi công cộng), ghi mã nguồn trong `identity.source` | Phạm vi công cộng |
| Phông lời thoại **Be Vietnam Pro** 500 · 700 · 800 — nhúng trong `engine/fonts.js` (WOFF2 base64, ~64 KB, đi theo cả phim HTML xuất ra, chạy ngoại tuyến). Bản cắt chỉ giữ Latin + tiếng Việt và bỏ mã hint (`tools/build-fonts.sh` dựng lại); tên phông, bản quyền, giấy phép trong phông giữ nguyên | Be Vietnam Pro Project Authors — gốc https://github.com/bettergui/BeVietnamPro; tệp lấy từ bản phát hành lại chính thức https://github.com/google/fonts/tree/main/ofl/bevietnampro | **SIL Open Font License 1.1** — © 2021 The Be Vietnam Pro Project Authors (không khai Reserved Font Name). Toàn văn: `engine/fonts/OFL-BeVietnamPro.txt` và đầu `engine/fonts.js`. Phông vẫn thuộc OFL dù nằm trong gói Gen Labs (không bán riêng phông) |

Ngoài phông Be Vietnam Pro ở trên (OFL 1.1), không dùng font, ảnh hay thư viện bên thứ ba trong gói phát hành.
