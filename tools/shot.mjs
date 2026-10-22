// Chụp một trang bằng Chromium (Playwright cài sẵn trong môi trường dev). Dùng: node tools/shot.mjs <url> <out.png> [w] [h]
import { loadPlaywright } from './pw.mjs';
const pw = loadPlaywright();
if (!pw) { console.error('không có Playwright'); process.exit(1); }
const [,, url, out, w, h, scheme] = process.argv;
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: +w || 1600, height: +h || 900 }, colorScheme: scheme || 'light' });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url); await p.waitForTimeout(1200);
await p.screenshot({ path: out, fullPage: true });
console.log('pageerrors', JSON.stringify(errs));
console.log(JSON.stringify(await p.evaluate(() => ({ e: window.__errs, g: window.__gates })), null, 1));
await b.close();
