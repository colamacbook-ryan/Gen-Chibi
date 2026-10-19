#!/usr/bin/env bash
# Dựng lại engine/fonts.js: phông lời thoại Be Vietnam Pro (SIL OFL 1.1) cắt còn Latin + tiếng Việt, WOFF2, nhúng base64.
# Chỉ chạy khi đổi phông / bộ ký tự (kết quả đã nằm trong repo). Cần: python3 + fonttools + brotli (pip install fonttools brotli), curl.
#   bash tools/build-fonts.sh [thư-mục-tạm]
# Nguồn: https://github.com/google/fonts/tree/main/ofl/bevietnampro (bản chính thức, phát hành lại của Be Vietnam Pro Project Authors).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d)}"; mkdir -p "$WORK"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl/bevietnampro"
WEIGHTS="Medium:500 Bold:700 ExtraBold:800"
# Latin cơ bản + Latin-1 + toàn bộ chữ Việt (dựng sẵn U+1EA0–1EF9, Ă Đ Ĩ Ũ Ơ Ư, dấu rời U+0300–0304 / 0309 / 0323) + dấu câu, tiền tệ (₫ €), mũi tên
UNI="U+0020-007E,U+00A0-00FF,U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0304,U+0309,U+0323,U+1EA0-1EF9,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+20AB,U+20AC,U+2122,U+2190-2193,U+2212,U+00D7"
curl -fsSL -o "$WORK/OFL.txt" "$BASE/OFL.txt"
for wt in $WEIGHTS; do
  n="${wt%%:*}"
  curl -fsSL -o "$WORK/BeVietnamPro-$n.ttf" "$BASE/BeVietnamPro-$n.ttf"
  pyftsubset "$WORK/BeVietnamPro-$n.ttf" --unicodes="$UNI" --flavor=woff2 --layout-features='kern,liga,ccmp,locl,mark,mkmk,calt' \
    --no-hinting --desubroutinize --name-IDs='*' --notdef-outline --output-file="$WORK/bvp-$n.woff2"
done
cp "$WORK/OFL.txt" "$ROOT/engine/fonts/OFL-BeVietnamPro.txt"
node - "$WORK" "$ROOT" <<'JS'
const fs = require('fs'), [work, root] = process.argv.slice(2);
const W = [['Medium', 500], ['Bold', 700], ['ExtraBold', 800]];
const ofl = fs.readFileSync(work + '/OFL.txt', 'utf8').replace(/\*\//g, '* /').trim();
const faces = W.map(([n, w]) => '[' + w + ', "' + fs.readFileSync(work + '/bvp-' + n + '.woff2').toString('base64') + '"]').join(',\n    ');
const out = `/* gen-chibi engine — fonts 1.0: phông lời thoại NHÚNG SẴN (một tệp, chạy ngoại tuyến, đi theo cả phim HTML xuất ra)
 * Be Vietnam Pro 500 · 700 · 800, cắt chỉ còn Latin + tiếng Việt, WOFF2 base64 (tools/build-fonts.sh dựng lại tệp này).
 *
 * PHÔNG (không phải mã của Gen Labs): Copyright 2021 The Be Vietnam Pro Project Authors (https://github.com/bettergui/BeVietnamPro)
 * Giấy phép phông: SIL Open Font License, Version 1.1 — toàn văn bên dưới, chép nguyên từ
 * https://github.com/google/fonts/blob/main/ofl/bevietnampro/OFL.txt (cũng có ở engine/fonts/OFL-BeVietnamPro.txt).
 * Bản cắt (subset) chỉ bỏ ký tự ngoài Latin + tiếng Việt và mã hint; tên phông, bản quyền, giấy phép trong phông giữ nguyên.
 * Phần mã bên dưới tệp này: © 2026 Gen Labs — All rights reserved.
 *
 * ------------------------------------------------------------------------------------------------
${ofl}
 * ------------------------------------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (typeof document === 'undefined' || document.getElementById('gc-fonts')) return;
  var FACES = [
    ${faces}
  ];
  var css = FACES.map(function (f) { return '@font-face{font-family:"Be Vietnam Pro";font-style:normal;font-weight:' + f[0] + ';font-display:block;src:url(data:font/woff2;base64,' + f[1] + ') format("woff2")}'; }).join('\\n');
  var s = document.createElement('style'); s.id = 'gc-fonts'; s.textContent = css; document.head.appendChild(s);
})();
`;
// mỗi dòng của khối giấy phép nằm trong chú thích: không có "*/" (đã thay ở trên)
fs.writeFileSync(root + '/engine/fonts.js', out);
console.log('engine/fonts.js', Math.round(out.length / 1024) + ' KB');
JS
