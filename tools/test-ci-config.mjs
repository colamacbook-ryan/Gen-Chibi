// Kiểm cấu hình CI của bộ test trình duyệt (v0.23 B6, CNS-032) — không cần mạng, không cần Playwright.
// © 2026 Gen Labs — All rights reserved.
//  · .github/workflows/browser.yml: Playwright ghim ĐÚNG một bản X.Y.Z (không ^ ~ latest), ma trận phủ ĐỦ nhóm GC_ONLY của tools/test-browser.mjs, mỗi nhóm một lần
//  · tools/test-browser.mjs: mọi khối test gác bằng want('<nhóm>') thuộc danh sách GROUPS (không còn cổng ONLY cũ → khối mới không lọt khỏi ma trận CI)
//  · ci.yml gọi browser.yml; release.yml: job release cần cả video-mp4 và browser (không phát hành khi test trình duyệt đỏ)
// Dùng: node tools/test-ci-config.mjs [thư-mục-gốc]   (thư mục gốc khác: cho đột biến)
import fs from 'fs';
import path from 'path';
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let bad = 0;
const ok = (c, msg) => { if (c) console.log('   ✓ ' + msg); else { bad = 1; console.log('   ✗ ' + msg); } };

const TB = rd('tools/test-browser.mjs'), WF = rd('.github/workflows/browser.yml'), CI = rd('.github/workflows/ci.yml'), REL = rd('.github/workflows/release.yml');
const gm = /const GROUPS = \[([^\]]*)\]/.exec(TB);
const GROUPS = gm ? gm[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
const used = [...TB.matchAll(/\bwant\('([^']+)'\)/g)].map(m => m[1]);
const legacy = (TB.match(/if \(!ONLY\b|ONLY === '/g) || []).length;
// video-ui = phần con của video (lặp nhanh cục bộ) — ma trận chạy video là đủ
const NEED = GROUPS.filter(g => g !== 'video-ui');
ok(GROUPS.length >= 2 && used.every(g => GROUPS.includes(g)) && NEED.every(g => used.includes(g)) && !legacy,
  'test-browser.mjs: mọi khối gác bằng want(nhóm) ∈ GROUPS [' + GROUPS.join(' ') + '] (khối dùng: ' + [...new Set(used)].length + ' nhóm; cổng ONLY cũ còn: ' + legacy + ')');

const pin = /PLAYWRIGHT_VERSION:\s*'?([^'\s]+)'?/.exec(WF);
ok(pin && /^\d+\.\d+\.\d+$/.test(pin[1]) && /playwright@\$\{PLAYWRIGHT_VERSION\}/.test(WF) && /playwright install --with-deps chromium/.test(WF),
  'browser.yml: Playwright ghim đúng một bản X.Y.Z (' + (pin ? pin[1] : '—') + ') + cài Chromium của chính bản đó');
const mm = /\n\s+group:\s*\[([^\]]*)\]/.exec(WF);
const MATRIX = mm ? mm[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
const flat = MATRIX.flatMap(x => x.split('+'));
const missing = NEED.filter(g => !flat.includes(g)), extra = flat.filter(g => !GROUPS.includes(g)), dup = flat.filter((g, i) => flat.indexOf(g) !== i);
ok(MATRIX.length && !missing.length && !extra.length && !dup.length && /GC_ONLY: \$\{\{ matrix\.group \}\}/.test(WF) && /node tools\/test-browser\.mjs/.test(WF),
  'browser.yml: ma trận phủ đủ ' + NEED.length + ' nhóm, mỗi nhóm một lần' + (missing.length ? ' — THIẾU: ' + missing.join(' ') : '') + (extra.length ? ' — LẠ: ' + extra.join(' ') : '') + (dup.length ? ' — TRÙNG: ' + dup.join(' ') : ''));
ok(/^\s+fail-fast:\s*false\s*$/m.test(WF) && /^\s+runs-on:\s*ubuntu-/m.test(WF) && /^\s+timeout-minutes:\s*\d+/m.test(WF), 'browser.yml: Ubuntu, fail-fast: false, có trần thời gian');

ok(/uses: \.\/\.github\/workflows\/browser\.yml/.test(CI), 'ci.yml gọi browser.yml (mỗi lần đẩy main / PR)');
const relNeeds = /\n  release:\n    needs: \[([^\]]*)\]/.exec(REL);
const nd = relNeeds ? relNeeds[1].split(',').map(x => x.trim()) : [];
ok(/uses: \.\/\.github\/workflows\/browser\.yml/.test(REL) && nd.includes('browser') && nd.includes('video-mp4'), 'release.yml: job release cần [' + nd.join(', ') + '] — không phát hành khi test trình duyệt hoặc MP4 đỏ');
process.exit(bad);
