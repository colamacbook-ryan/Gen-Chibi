// gen-chibi — chạy đột biến (L-79: test không có đột biến làm đỏ có thể là test mù). © 2026 Gen Labs — All rights reserved.
// Mỗi đột biến: một bản chép RIÊNG của cây làm việc trong mktemp (fs.mkdtempSync), thay ĐÚNG MỘT chuỗi trong một tệp, chạy bộ kiểm của rào đó, đòi:
// mã thoát ≠ 0 VÀ có dòng ✗ chứa `expect` (đúng test của rào, không phải lỗi khác). Xong là xoá bản chép (chỉ thư mục do chính lệnh này tạo).
// Dữ liệu: tools/mutations/<bản>.json — { id, guard, file, find, replace, test: [lệnh…], env?, expect }. Bảng người đọc: tools/mutations/<bản>.md.
// Dùng:
//   node tools/mutate.mjs --check                       mọi `find` còn khớp đúng 1 lần + mọi id có trong bảng .md (nhanh — test.sh chạy)
//   node tools/mutate.mjs [--jobs 4] [--wrap "<tiền tố>"] [ID…]   chạy (tất cả hoặc các ID); --wrap: vd "bash netns.sh" (mỗi đột biến một netns → chạy song song)
//   node tools/mutate.mjs --md                          in bảng markdown từ dữ liệu (dán vào tools/mutations/<bản>.md)
//   --data tools/mutations/v023.json (mặc định)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = k => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const dataFile = path.resolve(ROOT, opt('--data') || 'tools/mutations/v023.json');
const jobs = Math.max(1, +(opt('--jobs') || 1));
const wrap = (opt('--wrap') || '').split(' ').filter(Boolean);
const CHECK = flag('--check'), MD = flag('--md');
const all = JSON.parse(fs.readFileSync(dataFile, 'utf8')).mutations;
const list = args.length ? all.filter(m => args.includes(m.id)) : all;
const count = (s, x) => s.split(x).length - 1;

if (MD) {
  const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, '⏎');
  console.log('| ID | Rào (A.5 / review) | Tệp | Đột biến | Test | Dòng ✗ phải có |\n|---|---|---|---|---|---|');
  for (const m of all) console.log('| ' + [m.id, m.guard, '`' + m.file + '`', '`' + esc(m.find).slice(0, 70) + '` → `' + esc(m.replace).slice(0, 40) + '`', '`' + m.test.join(' ') + (m.env ? ' ' + JSON.stringify(m.env) : '') + '`', esc(m.expect)].join(' | ') + ' |');
  process.exit(0);
}

if (CHECK) {
  const bad = [], md = fs.existsSync(dataFile.replace(/\.json$/, '.md')) ? fs.readFileSync(dataFile.replace(/\.json$/, '.md'), 'utf8') : '';
  const ids = new Set();
  for (const m of all) {
    if (ids.has(m.id)) bad.push(m.id + ': id trùng'); ids.add(m.id);
    let s = ''; try { s = fs.readFileSync(path.join(ROOT, m.file), 'utf8'); } catch (e) { bad.push(m.id + ': không có tệp ' + m.file); continue; }
    const n = count(s, m.find); if (n !== 1) bad.push(m.id + ': `find` khớp ' + n + ' lần trong ' + m.file + ' (mã đã đổi — sửa đột biến)');
    if (!md.includes('| ' + m.id + ' |')) bad.push(m.id + ': thiếu trong bảng ' + path.basename(dataFile.replace(/\.json$/, '.md')));
    if (!m.expect || !Array.isArray(m.test) || !m.test.length) bad.push(m.id + ': thiếu expect / test');
  }
  if (bad.length) { console.log('   ✗ đột biến ' + path.basename(dataFile) + ':\n      ' + bad.join('\n      ')); process.exit(1); }
  console.log('   ✓ ' + all.length + ' đột biến (' + path.basename(dataFile) + '): mọi `find` còn khớp đúng 1 lần, mọi id có trong bảng .md');
  process.exit(0);
}

const skip = new Set(['.git', 'dist', 'node_modules']);
function runOne(m) {
  return new Promise(resolve => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-mut-')), tree = path.join(dir, 'gc');
    const done = r => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* để lại cho người xem */ } resolve(Object.assign({ id: m.id }, r)); };
    try {
      fs.cpSync(ROOT, tree, { recursive: true, verbatimSymlinks: true, filter: src => !skip.has(path.basename(src)) || path.dirname(src) !== ROOT });
      const f = path.join(tree, m.file), s = fs.readFileSync(f, 'utf8'), n = count(s, m.find);
      if (n !== 1) return done({ state: 'pattern', detail: '`find` khớp ' + n + ' lần' });
      fs.writeFileSync(f, s.replace(m.find, () => m.replace));
    } catch (e) { return done({ state: 'error', detail: e.message }); }
    const cmd = wrap.concat(m.test), t0 = Date.now();
    const c = spawn(cmd[0], cmd.slice(1), { cwd: tree, env: Object.assign({}, process.env, { GC_TEST_ROOT: tree }, m.env || {}), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
    const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) { /* đã thoát */ } }, (m.timeout || 1500) * 1000);
    c.on('close', code => {
      clearTimeout(kill);
      const red = out.split('\n').map(l => l.trim()).filter(l => l.startsWith('✗'));
      const hit = red.find(l => l.includes(m.expect));
      done({ state: code !== 0 && hit ? 'red' : 'survived', code, red: hit || red[0] || '', secs: Math.round((Date.now() - t0) / 1000), tail: hit ? '' : out.slice(-600) });
    });
  });
}

const res = []; let next = 0;
async function worker() { while (next < list.length) { const m = list[next++]; const r = await runOne(m); res.push(r); console.log((r.state === 'red' ? '   ✓ ' : '   ✗ ') + r.id + ' ' + r.state + (r.code !== undefined ? ' rc=' + r.code + ' ' + r.secs + 's' : '') + ' | ' + (r.red || r.detail || '').slice(0, 300) + (r.tail ? '\n      ' + r.tail.replace(/\n/g, '\n      ') : '')); } }
await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));
const bad = res.filter(r => r.state !== 'red');
console.log('   Kết quả đột biến: ' + (res.length - bad.length) + '/' + res.length + ' đỏ' + (bad.length ? ' — SỐNG SÓT / lỗi: ' + bad.map(r => r.id).join(', ') : ''));
process.exit(bad.length ? 1 : 0);
