// Nạp Playwright cho công cụ kiểm thử / CI — KHÔNG phải phụ thuộc của sản phẩm (sản phẩm không dùng npm lúc chạy).
// © 2026 Gen Labs — All rights reserved.
// Thứ tự: require('playwright') (node_modules cạnh repo, NODE_PATH) → gói cài toàn cục của npm (`npm root -g`; CI: npm i -g playwright@<bản ghim>,
// xem .github/workflows/browser.yml) → bản có sẵn ở máy dev của Gen (/opt/node22/…). Không có → null (người gọi tự quyết bỏ qua hay báo lỗi).
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import path from 'path';
const require = createRequire(import.meta.url);

export function loadPlaywright() {
  try { return require('playwright'); } catch { /* không có cục bộ */ }
  let g = '';
  try { g = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim(); } catch { /* không có npm */ }
  if (g) { try { return require(path.join(g, 'playwright')); } catch { /* chưa cài toàn cục */ } }
  try { return require('/opt/node22/lib/node_modules/playwright'); } catch { return null; }
}
