# Override mẫu cho `genchibi override approve` (tools/test-root.sh — bảo mật vòng 5)

© 2026 Gen Labs — All rights reserved.

`bad-c1` … `bad-c9`: các đường vòng reviewer đã chứng minh qua bộ kiểm cũ (dò từng dòng bằng regex): flow mapping / sequence, khoá có nháy, bind có khoảng trắng,
nguồn có `=`, `type: bind` + `source:` không `/`, `extends: {file: …}`, anchor + merge. Các tệp `bad-*` khác: khối chữ `|`, tag `!!`, khoá phức `?`, `---`, tab,
chú thích sau giá trị có nháy (che `{…}`), `device:` tương đối, biến trong nguồn bind, anchor / alias riêng (`bad-anchor`), merge `<<` riêng (`bad-merge`). Mỗi tệp phải bị `approve` từ chối (✗, có số dòng).
`ok-block.yml`: YAML khối thường của một service đăng nhập (biến `${…}`, volume có tên, bind tuyệt đối ngoài thư mục cài, `type: volume`) — phải duyệt được.
