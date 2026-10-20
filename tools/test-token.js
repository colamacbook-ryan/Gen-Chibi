// Kiểm thử token GitHub cho repo private (Updater + install.sh), bằng "GitHub giả" cục bộ:
//  - API chỉ trả bản phát hành / asset khi có Authorization: Bearer đúng, thiếu hoặc sai → 404 (như repo private)
//  - asset API chuyển hướng (302) sang host khác (localhost) — server đích PHẢI nhận request KHÔNG có Authorization
// © 2026 Gen Labs — All rights reserved.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { Updater } = require('../server/updater');

const ROOT = path.resolve(__dirname, '..');
const GOOD = 'github_pat_TESTtokenGOOD123';
let pass = 0, failn = 0;
const ok = m => { console.log('  ✓ ' + m); pass++; };
const bad = m => { console.log('  ✗ ' + m); failn++; };
const check = (c, m) => (c ? ok(m) : bad(m));

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-token-'));
const dist = path.join(W, 'dist');
execFileSync('bash', [path.join(ROOT, 'tools/package.sh'), dist], { stdio: 'ignore' });
const VER = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const TARNAME = 'gen-chibi-v' + VER + '.tar.gz';
const blobs = { 1: fs.readFileSync(path.join(dist, TARNAME)), 2: fs.readFileSync(path.join(dist, 'SHA256SUMS')), 3: Buffer.from('không phải gói') };
const names = { 1: TARNAME, 2: 'SHA256SUMS', 3: 'ghi-chu.txt' };

let storageAuth = [];   // Authorization của mọi request tới host lưu trữ (phải rỗng)
let apiHits = [];
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const storage = http.createServer((req, res) => {
  storageAuth.push(req.headers.authorization || '');
  const id = (req.url.match(/^\/blob\/(\d)/) || [])[1];
  if (!id) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(blobs[id]);
});
let APIP, STP;
const api = http.createServer((req, res) => {
  const auth = req.headers.authorization || '';
  apiHits.push(req.url + ' ' + (auth ? 'auth' : 'noauth'));
  if (auth !== 'Bearer ' + GOOD) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"message":"Not Found"}'); }
  const base = 'http://127.0.0.1:' + APIP;
  const asset = id => ({ url: base + '/repos/o/r/releases/assets/' + id, id: +id, name: names[id], browser_download_url: base + '/nope/' + names[id] });
  if (/\/releases\/(latest|tags\/[^/]+)$/.test(req.url)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tag_name: 'v' + VER, body: 'ghi chú', published_at: '2026-10-18T00:00:00Z', assets: [asset(3), asset(1), asset(2)] }, null, 2));
  }
  const m = req.url.match(/\/releases\/assets\/(\d)$/);
  if (m) {
    if (/octet-stream/.test(req.headers.accept || '')) { res.writeHead(302, { Location: 'http://localhost:' + STP + '/blob/' + m[1] }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(asset(m[1]), null, 2));
  }
  res.writeHead(404); res.end();
});

async function freePort() { const s = http.createServer(); const p = await listen(s); await new Promise(r => s.close(r)); return p; }
function run(cmd, args, env) {
  return new Promise(resolve => {
    const c = spawn(cmd, args, { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
    c.on('error', e => resolve({ code: -1, out: String(e) }));
    c.on('close', code => resolve({ code, out }));
  });
}
function mkHome(name) { const h = path.join(W, name); fs.mkdirSync(path.join(h, 'data'), { recursive: true }); fs.mkdirSync(path.join(h, 'releases'), { recursive: true }); return h; }

(async () => {
  APIP = await listen(api); STP = await listen(storage);
  const feedUrl = 'http://127.0.0.1:' + APIP + '/repos/o/r/releases/latest';
  const mk = (name, token) => new Updater({ home: mkHome(name), version: '0.1.0', repo: 'o/r', feedUrl, token, log: () => {} });

  console.log('1) Updater: không token / token sai → lỗi rõ');
  const u0 = mk('h0', '');
  const s0 = await u0.check().catch(() => null);
  check(!s0 || !s0.available, 'không token: không thấy bản mới');
  const uBad = mk('hbad', 'github_pat_SAI');
  const eBad = await uBad.check().then(() => null, e => e);
  const stBad = uBad.status();
  check((eBad && /404|từ chối|token/i.test(eBad.message)) || (stBad.error && /404|token/i.test(stBad.error)), 'token sai: báo lỗi');
  check(fs.readdirSync(path.join(uBad.home, 'releases')).length === 0 && !fs.existsSync(path.join(uBad.home, 'current')), 'token sai: không đổi gì trên đĩa (vẫn chạy bản cũ)');

  console.log('2) Updater: token đúng → tải qua API, redirect sang host khác không mang token');
  const u = mk('hgood', GOOD);
  const st = await u.check();
  check(st.available === true, 'phát hiện bản mới qua API có token');
  check(/\/releases\/assets\/1$/.test(st.tarUrl) && st.tarName === TARNAME, 'chọn đúng asset gói theo tên (bỏ qua ghi-chu.txt)');
  const r = await u.apply();
  check(r.restart === true, 'cập nhật thành công với token');
  check(fs.existsSync(path.join(u.home, 'releases', 'v' + VER, 'server', 'main.js')), 'đã giải nén bản mới');
  check(storageAuth.length >= 2, 'host lưu trữ đã nhận request (redirect được theo)');
  check(storageAuth.every(a => a === ''), 'host lưu trữ KHÔNG nhận Authorization');

  console.log('3) Không lộ token');
  const blob = JSON.stringify(u.status()) + fs.readFileSync(path.join(u.home, 'data', 'update-state.json'), 'utf8')
    + (fs.existsSync(path.join(u.home, 'data', 'update-history.json')) ? fs.readFileSync(path.join(u.home, 'data', 'update-history.json'), 'utf8') : '');
  check(!blob.includes(GOOD) && !blob.includes('Bearer'), 'trạng thái / lịch sử cập nhật không chứa token');
  check(!JSON.stringify(uBad.status()).includes('github_pat_SAI'), 'trạng thái khi token sai không chứa token');
  check(!(eBad && eBad.message.includes('github_pat_SAI')), 'thông báo lỗi không chứa token');

  console.log('4) install.sh');
  // GC_LANG rỗng = trình cài nói tiếng Anh (mặc định, ADR 0007) dù máy chạy test có đặt GC_LANG
  const base = { GC_GITHUB_API: 'http://127.0.0.1:' + APIP, GC_REPO: 'o/r', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', HTTPS_PROXY: '', https_proxy: '', HTTP_PROXY: '', http_proxy: '', GC_LANG: '' };
  const inst = async (name, extra, args = []) => {
    const home = path.join(W, name + '-home'); fs.mkdirSync(home, { recursive: true });
    const port = await freePort(), dir = path.join(home, 'gc');
    storageAuth = [];
    const res = await run('bash', [path.join(ROOT, 'install.sh'), '--native', '--dir', dir, '--port', String(port)].concat(args), Object.assign({ HOME: home }, base, extra));
    try { await run(path.join(home, '.local/bin/genchibi'), ['stop'], {}); } catch { /* chưa cài */ }
    return Object.assign(res, { dir, home });
  };
  const a = await inst('inst-good', { GC_GITHUB_TOKEN: GOOD });
  check(a.code === 0 && fs.existsSync(path.join(a.dir, 'current', 'server', 'main.js')), 'cài với token đúng thành công' + (a.code ? '\n' + a.out.slice(-600) : ''));
  check(storageAuth.length >= 2 && storageAuth.every(x => x === ''), 'install.sh: host lưu trữ KHÔNG nhận Authorization (curl bỏ header khi sang host khác)');
  const envf = fs.readFileSync(path.join(a.dir, '.env'), 'utf8');
  check(envf.includes('GC_GITHUB_TOKEN=' + GOOD), 'token được ghi vào .env');
  check((fs.statSync(path.join(a.dir, '.env')).mode & 0o077) === 0, '.env chmod 600');
  check(!a.out.includes(GOOD), 'installer không in token ra màn hình');

  const b = await inst('inst-nokey', {});
  check(b.code !== 0 && /fine-grained|Contents/.test(b.out) && !fs.existsSync(path.join(b.dir, 'current')), 'repo private không token: báo lỗi hướng dẫn tạo token');
  const c = await inst('inst-badkey', { GC_GITHUB_TOKEN: 'github_pat_SAI' });
  check(c.code !== 0 && /token/i.test(c.out) && !c.out.includes('github_pat_SAI'), 'token sai: lỗi rõ, không in token');
  const d = await inst('inst-weird', { GC_GITHUB_TOKEN: 'a b"c' });
  check(d.code !== 0 && /invalid characters/.test(d.out), 'token có ký tự lạ bị từ chối');

  // .env có sẵn: thêm/ghi dòng token, giữ nguyên dòng khác
  const e = await inst('inst-env', { GC_GITHUB_TOKEN: GOOD });
  fs.writeFileSync(path.join(e.dir, '.env'), fs.readFileSync(path.join(e.dir, '.env'), 'utf8').replace(/^GC_GITHUB_TOKEN=.*\n/m, '') + 'GC_FOO=giu-nguyen\n');
  const port2 = await freePort();
  fs.writeFileSync(path.join(e.dir, '.env'), fs.readFileSync(path.join(e.dir, '.env'), 'utf8').replace(/^GC_PORT=.*$/m, 'GC_PORT=' + port2));   // .env cũ giữ cổng cũ
  storageAuth = [];
  const e2 = await run('bash', [path.join(ROOT, 'install.sh'), '--native', '--dir', e.dir, '--port', String(port2)], Object.assign({ HOME: e.home }, base, { GC_GITHUB_TOKEN: GOOD }));
  try { await run(path.join(e.home, '.local/bin/genchibi'), ['stop'], {}); } catch { /* ok */ }
  const env2 = fs.readFileSync(path.join(e.dir, '.env'), 'utf8');
  check(e2.code === 0 && env2.includes('GC_GITHUB_TOKEN=' + GOOD) && env2.includes('GC_FOO=giu-nguyen') && env2.includes('GC_MASTER_KEY='), '.env cũ: thêm dòng token, giữ dòng khác' + (e2.code === 0 ? '' : '\n' + e2.out.slice(-500)));

  // genchibi token: đọc từ stdin, ghi .env, không lộ ra output
  const tk = await new Promise(resolve => {
    const ch = spawn(path.join(a.home, '.local/bin/genchibi'), ['token'], { env: Object.assign({}, process.env, { HOME: a.home }), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; ch.stdout.on('data', x => out += x); ch.stderr.on('data', x => out += x);
    ch.on('error', er => resolve({ code: -1, out: String(er) })); ch.on('close', code => resolve({ code, out })); ch.stdin.end('github_pat_NEWtoken456\n');
  });
  try { await run(path.join(a.home, '.local/bin/genchibi'), ['stop'], {}); } catch { /* ok */ }
  const env3 = fs.readFileSync(path.join(a.dir, '.env'), 'utf8');
  check(tk.code === 0 && env3.includes('GC_GITHUB_TOKEN=github_pat_NEWtoken456') && !env3.includes(GOOD) && !tk.out.includes('NEWtoken456'), 'genchibi token: đọc stdin, ghi .env, không in token');
  check((env3.match(/^GC_GITHUB_TOKEN=/gm) || []).length === 1, 'không nhân đôi dòng token');

  console.log('\nKết quả token: ' + pass + ' đạt, ' + failn + ' trượt');
  api.close(); storage.close();
  fs.rmSync(W, { recursive: true, force: true });
  process.exit(failn ? 1 : 0);
})().catch(e => { console.error(e); try { fs.rmSync(W, { recursive: true, force: true }); } catch {} process.exit(1); });
