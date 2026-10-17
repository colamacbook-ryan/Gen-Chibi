# CLAUDE.md — gen-chibi

Bộ não (SSOT) của Ryan × Gen nằm ở repo **colamacbook-ryan/Second-Brain**.
Nếu phiên này chưa có Second-Brain: gắn thêm repo đó vào phiên, đọc `CLAUDE.md` + `claude/START-HERE.md` của nó trước khi làm việc.
Ghi nhớ, quyết định, journal luôn viết vào Second-Brain; repo này chỉ chứa code + tài liệu của chính nó.

## Quy ước repo
- License: © 2026 Afi Labs — All rights reserved. Không thêm thư viện/asset bên thứ ba khi chưa ghi vào ASSET_MANIFEST.md và kiểm license.
- Không phụ thuộc npm ở runtime (Node thuần, trình duyệt thuần). Engine (`engine/`, `kinds/`) không đụng DOM ở phần lõi để chạy được cả trong Node (server, MCP).
- Chuẩn giao diện: Data Console (STD-07), desktop-first. Chuẩn cài đặt: self-host-app (STD-06).
- Mọi thay đổi chạy `bash tools/test.sh` trước khi đẩy. Phát hành: sửa `VERSION` + `CHANGELOG.md`, đẩy tag `vX.Y.Z`.
- Bài học L-42: mọi tính năng vẽ/động phải có ngân sách hiệu năng (tầng ảnh · tầng thở · diễn đủ ≤ 8).
