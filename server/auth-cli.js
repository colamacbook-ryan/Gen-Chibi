#!/usr/bin/env node
// gen-chibi — đặt mật khẩu chủ khi app ĐANG DỪNG (genchibi password). App đang chạy thì CLI đi qua API (POST /api/auth/password, token chủ) —
// không ghi thẳng tệp lúc server giữ data/auth.json trong bộ nhớ (lần ghi sau của server sẽ đè mất).
// Dùng: printf '%s\n' "<mật khẩu>" | GC_HOME=<thư mục cài> node server/auth-cli.js password [en|vi]
//   (Docker: docker compose run --rm -T --no-deps app node /install/current/server/auth-cli.js password)
// Mật khẩu đọc từ stdin (dòng đầu) — không bao giờ nằm trong argv / log. In "ok <số phiên bị thu hồi>" hoặc lỗi (theo ngôn ngữ CLI) ra stderr, thoát 1.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const path = require('path');
const { Auth } = require('./auth');
const { Secrets } = require('./secrets');
const MSG = require('./i18n-msg');

const APP = path.resolve(__dirname, '..');
const HOME = process.env.GC_HOME || (path.basename(path.dirname(APP)) === 'releases' ? path.resolve(APP, '..', '..') : path.join(APP, '.home'));
const DATA = path.join(HOME, 'data');
const [cmd, lang] = process.argv.slice(2);
const say = s => MSG.label(lang === 'vi' ? 'vi' : 'en', s);

if (cmd !== 'password') { process.stderr.write('usage: auth-cli.js password [en|vi]  (password on stdin)\n'); process.exit(2); }
let raw = '';
process.stdin.on('data', d => { raw += d; if (raw.length > 8192) { process.stderr.write(say(MSG.tr(MSG.VI, 'mật khẩu quá dài (tối đa {n} byte)', { n: 1024 })) + '\n'); process.exit(1); } });
process.stdin.on('end', async () => {
  const pw = raw.split('\n')[0].replace(/\r$/, '');
  try {
    const auth = new Auth({ dir: DATA, envToken: process.env.GC_API_TOKEN || '', key: new Secrets(DATA).key, log: () => {} });
    const r = await auth.setPassword(pw, 'cli');
    process.stdout.write('ok ' + r.revoked + '\n');
  } catch (e) { process.stderr.write(say(e.message) + '\n'); process.exit(1); }
});
