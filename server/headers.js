// Header bảo mật cho trang tĩnh của Studio — MỘT nơi định nghĩa, server/main.js và job CI xuất video (tools/video-ci.mjs) cùng dùng.
// © 2026 Gen Labs — All rights reserved.
'use strict';
// Trang Studio ra Internet (v0.21) → CSP làm lớp phòng thủ cho XSS từ dữ liệu agent ghi qua MCP (review bảo mật 🟡5). Studio không có script inline:
// script chỉ từ 'self'. style 'unsafe-inline' vì Studio đặt thuộc tính style + thẻ <style> (ẩn tới khi nạp bảng dịch, phông nhúng engine/fonts.js).
// data: / blob: cho ảnh SVG dựng tại chỗ, âm thanh WAV / clip, phông WOFF2 nhúng, fetch(data:) của engine/audio.js, tải tệp (blob). Không frame (frame-ancestors).
// Phim HTML xuất ra là tệp tải về riêng — không mang header này. send() đã đặt X-Frame-Options: DENY + Referrer-Policy: no-referrer (chặt hơn same-origin)
const STUDIO_CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "media-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self' data: blob:", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
const STUDIO_HEADERS = { 'Content-Security-Policy': STUDIO_CSP };
// Trang xuất video (v0.22, CNS-214): Studio nhúng nó trong iframe ẩn CÙNG NGUỒN → chỉ trang này được nhúng: X-Frame-Options SAMEORIGIN + CSP của Studio
// với frame-ancestors 'self'. Mọi phản hồi khác giữ DENY / 'none' (không nới chung — sẽ mở lại lỗ v0.21 vừa đóng). Trang không có script inline.
const VIDEO_EXPORT_PAGE = 'studio/video-export.html';
const VIDEO_EXPORT_CSP = STUDIO_CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'");
const VIDEO_EXPORT_HEADERS = { 'Content-Security-Policy': VIDEO_EXPORT_CSP, 'X-Frame-Options': 'SAMEORIGIN' };
if (VIDEO_EXPORT_CSP === STUDIO_CSP) throw new Error('VIDEO_EXPORT_CSP phải khác STUDIO_CSP đúng ở frame-ancestors');
module.exports = { STUDIO_CSP, STUDIO_HEADERS, VIDEO_EXPORT_PAGE, VIDEO_EXPORT_CSP, VIDEO_EXPORT_HEADERS };
