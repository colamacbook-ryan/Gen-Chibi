// gen-chibi — shim TRONG hộp cát của cầu nối CLI (v0.26, spec §4.4). © 2026 Gen Labs — All rights reserved.
// Chạy bằng node của máy chủ (bind chỉ đọc), trong netns riêng chỉ có `lo`:
//   1) mở 127.0.0.1:18080 và chuyển từng kết nối sang /run/gc-proxy.sock (proxy allowlist của cầu nối, NGOÀI hộp) — CLI đặt HTTPS_PROXY / HTTP_PROXY tới đây
//   2) chạy lệnh sau `--` (CLI hoặc selftest) với stdio kế thừa, chuyển SIGINT / SIGTERM, thoát theo mã của nó.
// Không đọc biến môi trường nào để quyết định đích: cổng và socket là hằng số. Không phụ thuộc npm.
import fs from 'fs';
import net from 'net';
import { spawn } from 'child_process';

const PORT = 18080, SOCK = '/run/gc-proxy.sock';
const sep = process.argv.indexOf('--');
const cmd = sep >= 0 ? process.argv.slice(sep + 1) : [];
if (!cmd.length) { process.stderr.write('shim: missing command after --\n'); process.exit(96); }

const srv = net.createServer(c => {
  const u = net.connect(SOCK);
  c.on('error', () => u.destroy()); u.on('error', () => c.destroy());
  c.pipe(u); u.pipe(c);
});
srv.on('error', e => { process.stderr.write('shim: listen ' + e.code + '\n'); process.exit(97); });
// biến bí mật của CLI (vd GEMINI_API_KEY — chế độ key của agy): cầu nối ghi /work/.gc/env.json (chỉ đọc) thay vì --setenv (argv của bwrap ai cũng đọc được)
let extra = {};
try { const j = JSON.parse(fs.readFileSync('/work/.gc/env.json', 'utf8')); Object.keys(j).forEach(k => { if (/^[A-Z][A-Z0-9_]{1,63}$/.test(k) && typeof j[k] === 'string') extra[k] = j[k]; }); } catch (e) { extra = {}; }
srv.listen(PORT, '127.0.0.1', () => {
  const ch = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', env: Object.assign({}, process.env, extra) });
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { try { ch.kill(s); } catch (e) { /* đã thoát */ } });
  ch.on('error', e => { process.stderr.write('shim: spawn ' + e.code + '\n'); process.exit(98); });
  ch.on('exit', (code, sig) => { srv.close(); process.exit(code == null ? (sig ? 128 + 15 : 1) : code); });
});
