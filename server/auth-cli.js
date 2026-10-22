#!/usr/bin/env node
// gen-chibi — đặt mật khẩu chủ khi app ĐANG DỪNG (genchibi password). App đang chạy thì CLI đi qua API (POST /api/auth/password, token chủ) —
// không ghi thẳng tệp lúc server giữ data/auth.json trong bộ nhớ (lần ghi sau của server sẽ đè mất).
// v0.23: máy chưa khởi tạo owner (data/setup.json stage admin / must_init) → đây CHÍNH là khởi tạo: tên đăng nhập mặc định "owner" (hoặc dòng đầu stdin với
// --with-user — trình cài), setup.json → domain (admin / admin đóng vĩnh viễn). --init-only: đã khởi tạo rồi thì không đổi mật khẩu (thoát 1).
// Dùng: printf '%s\n' "<mật khẩu>" | GC_HOME=<thư mục cài> node server/auth-cli.js password [en|vi] [--with-user] [--init-only]
//   (Docker: docker compose run --rm -T --no-deps app node /install/current/server/auth-cli.js password)
// Mật khẩu đọc từ stdin — không bao giờ nằm trong argv / log. In "ok <số phiên bị thu hồi> <tên đăng nhập>" hoặc lỗi (theo ngôn ngữ CLI) ra stderr, thoát 1.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs');
const path = require('path');
const { Auth } = require('./auth');
const { Setup } = require('./setup');
const { Secrets } = require('./secrets');
const { flowWaitsOwner } = require('./online');
const MSG = require('./i18n-msg');

const APP = path.resolve(__dirname, '..');
const HOME = process.env.GC_HOME || (path.basename(path.dirname(APP)) === 'releases' ? path.resolve(APP, '..', '..') : path.join(APP, '.home'));
const DATA = path.join(HOME, 'data');
const args = process.argv.slice(2), cmd = args[0], lang = args.find(a => a === 'en' || a === 'vi');
const withUser = args.includes('--with-user'), initOnly = args.includes('--init-only');
const say = s => MSG.label(lang === 'vi' ? 'vi' : 'en', s);

if (cmd !== 'password') { process.stderr.write('usage: auth-cli.js password [en|vi] [--with-user] [--init-only]  (password on stdin)\n'); process.exit(2); }
let raw = '';
process.stdin.on('data', d => { raw += d; if (raw.length > 8192) { process.stderr.write(say(MSG.tr(MSG.VI, 'mật khẩu quá dài (tối đa {n} byte)', { n: 1024 })) + '\n'); process.exit(1); } });
process.stdin.on('end', async () => {
  const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));
  const login = withUser ? lines[0].trim().toLowerCase() : '', pw = withUser ? lines[1] || '' : lines[0];
  try {
    const setup = new Setup({ dataDir: DATA, runDir: path.join(HOME, 'run'), log: () => {} });
    const auth = new Auth({ dir: DATA, envToken: process.env.GC_API_TOKEN || '', key: new Secrets(DATA).key, log: () => {}, setup });
    auth.markLegacy({ publicUrl: process.env.GC_PUBLIC_URL, allowedHosts: process.env.GC_ALLOWED_HOSTS });
    let flow = null; try { flow = JSON.parse(fs.readFileSync(path.join(DATA, 'online.json'), 'utf8')).flow; } catch (e) { /* chưa có online.json */ }
    setup.boot({ hasPassword: auth.hasPassword(), legacy: auth.isLegacy(), onlineWaiting: flowWaitsOwner(flow) });
    const r = await auth.setPassword(pw, 'cli', { login, initOnly });
    process.stdout.write('ok ' + r.revoked + ' ' + (r.login || auth.loginName()) + (r.init ? ' init' : '') + '\n');
  } catch (e) { process.stderr.write(say(e.message) + '\n'); process.exit(1); }
});
