# Lệnh genchibi CŨ thật (fixture cho tools/test-root.sh — CNS-278)

© 2026 Gen Labs — All rights reserved.

Mỗi tệp là `git show <tag>:cli/genchibi` NGUYÊN VĂN của bản đã phát hành — đúng thứ trình cài của bản đó chép ra `~/.local/bin/genchibi`
(`sed "s#__GC_HOME__#<thư mục cài>#"`). Không sửa tay: `tools/test.sh` so từng tệp với `git show <tag>:cli/genchibi` khi có `.git` + tag.
Bài học (cortex CNS-278 / L-80): fixture "bản cũ" viết tay từ trí nhớ đã che một lỗ 🔴 — bản ≤ v0.22 không truyền `GC_CLI_SELF`.

| Tệp | Tag | Vì sao |
|---|---|---|
| `genchibi-v0.21.3` | v0.21.3 | bản root sớm nhất còn hỗ trợ (tài khoản `genchibi`), không `GC_CLI_SELF` |
| `genchibi-v0.22.0` | v0.22.0 | bản liền trước v0.23, không `GC_CLI_SELF` — máy cài trước 2026-10-22 |
| `genchibi-v0.23.0` | v0.23.0 | có `GC_CLI_SELF` |
