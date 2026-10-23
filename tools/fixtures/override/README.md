# Override mẫu cho `genchibi override approve` (tools/test-root.sh — bảo mật vòng 5)

© 2026 Gen Labs — All rights reserved.

`bad-c1` … `bad-c9`: các đường vòng reviewer đã chứng minh qua bộ kiểm cũ (dò từng dòng bằng regex): flow mapping / sequence, khoá có nháy, bind có khoảng trắng,
nguồn có `=`, `type: bind` + `source:` không `/`, `extends: {file: …}`, anchor + merge. Các tệp `bad-*` khác: khối chữ `|`, tag `!!`, khoá phức `?`, `---`, tab,
chú thích sau giá trị có nháy (che `{…}`), `device:` tương đối, biến trong nguồn bind, anchor / alias riêng (`bad-anchor`), merge `<<` riêng (`bad-merge`). Mỗi tệp phải bị `approve` từ chối (✗, có số dòng).
`ok-block.yml`: YAML khối thường của một service đăng nhập (biến `${…}`, volume có tên, bind tuyệt đối ngoài thư mục cài, `type: volume`) — phải duyệt được.

Vòng 6: `bad-dotdot` (`/không-có/..@INSTALL@/data` — compose giữ chuỗi, daemon giải `..` vào thư mục cài), `bad-cr` / `bad-cr2` (CR là xuống dòng với YAML — `build:` ẩn sau CR), `bad-nonascii`, `bad-cont` / `bad-cont2` / `bad-cont3` (dòng nối của chuỗi nhiều dòng — giá trị compose thấy khác giá trị đã kiểm), `bad-dash` (`-` trơn + dòng dưới), `bad-develop` (`develop: watch:` đọc tệp thư mục cài), `bad-defvar` (`${X:-./data}`). `@INSTALL@` được test thay bằng đường thật của thư mục cài. `tools/test-edge.sh` chạy `docker compose config --no-interpolate` THẬT trên mọi fixture (khi có docker compose): tất cả phải được compose chấp nhận — tức là đường vòng thật, không phải lỗi cú pháp. `ok-block.yml` chỉ dùng ASCII và đường tuyệt đối có thư mục cha.
