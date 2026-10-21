// Kiểm `genchibi online` (v0.21 P4) với server THẬT + launcher thật + Cloudflare API giả + cloudflared giả — không mạng ngoài, không Docker:
//   1) cách dùng: token trên dòng lệnh bị từ chối (không gửi đi) · app dừng → báo rõ · trạng thái khi chưa online (en + vi)
//   2) đường Cloudflare qua CLI: không terminal + không token → dừng có hướng dẫn · CNAME có sẵn + không terminal → dừng, KHÔNG đè ·
//      --token-stdin --overwrite-dns → chạy hết các bậc tới "chờ mật khẩu" (mã thoát 3, in mã setup; status nói "tạm — chờ mật khẩu") · genchibi password → luồng TỰ xong (CNS-201)
//      (in https://tên + /mcp) · trạng thái · đổi địa chỉ không --yes → hỏi / dừng · proxy (in đoạn cấu hình, bậc lỗi in cách sửa) · Go offline dọn Cloudflare
//   3) token API: không có trong argv / môi trường của bất kỳ tiến trình con nào (shim ghi argv + env của curl, awk, sed… và quét /proc/*/cmdline),
//      không trong đầu ra CLI, log app / launcher, tệp dữ liệu · có terminal (script): hỏi ẩn, không hiện lại
//   4) đột biến: CLI gửi token bằng `curl -d <thân>` (argv) → rào ở (3) phải ĐỎ
//   5) link tạm (quick) qua CLI tới xong, qua cloudflared giả đóng vai Cloudflare
// © 2026 Gen Labs — All rights reserved.
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { fakeCloudflare } from './fixtures/fake-cloudflare-api.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let passn = 0, failn = 0;
const ok = (c, m, extra) => { if (c) { passn++; console.log('   ✓', m); } else { failn++; console.log('   ✗', m + (extra ? '\n        ' + String(extra).slice(0, 1500).replace(/\n/g, '\n        ') : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE = fs.readFileSync(path.join(ROOT, 'tools/fixtures/fake-cloudflared.js'));
const FAKE_SHA = crypto.createHash('sha256').update(FAKE).digest('hex');
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const TOKEN = 'cfcli' + crypto.randomBytes(20).toString('hex');   // token API giả: phải KHÔNG BAO GIỜ xuất hiện trong argv / env con / log / đầu ra
const tmps = [], kids = [];
process.on('exit', () => kids.forEach(k => { try { process.kill(-k.pid, 'SIGKILL'); } catch (e) { /* đã tắt */ } }));
async function until(fn, ms, step = 200) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } }
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const health = port => new Promise(r => { http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1000 }, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)); });

// ---------------------------------------------------------------- shim: ghi argv + môi trường của mọi lệnh ngoài CLI hay gọi, rồi chạy lệnh thật
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-')); tmps.push(W);
const SHIM = path.join(W, 'shim'), SHIM_LOG = path.join(W, 'shim.log');
fs.mkdirSync(SHIM);
for (const c of ['curl', 'awk', 'sed', 'tr', 'cut', 'tail', 'head', 'cat', 'grep', 'sleep', 'date', 'node', 'mktemp', 'basename', 'readlink', 'seq', 'id', 'xdg-open']) {
  let real = ''; try { real = execFileSync('bash', ['-c', 'command -v ' + c], { encoding: 'utf8' }).trim(); } catch (e) { continue; }
  if (!real.startsWith('/')) continue;
  fs.writeFileSync(path.join(SHIM, c), '#!/bin/bash\n{ printf \'%s\\0\' ARGV "$0" "$@"; /usr/bin/env -0; printf \'\\n\'; } >> "$SHIM_LOG" 2>/dev/null\nexec ' + real + ' "$@"\n', { mode: 0o755 });
}
// quét /proc: argv của mọi tiến trình (và môi trường của tiến trình đã exec — không phải bản fork của bash) trong lúc CLI chạy
let procHits = [];
function procScan() {
  for (const p of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(p) || +p === process.pid) continue;
    let cmd = ''; try { cmd = fs.readFileSync('/proc/' + p + '/cmdline', 'latin1'); } catch (e) { continue; }
    if (cmd.includes(TOKEN)) procHits.push('argv ' + p + ': ' + cmd.replace(/\0/g, ' ').slice(0, 200));
    if (/^(\/\S*\/)?(ba)?sh\0/.test(cmd) || /^bash\0/.test(cmd)) continue;   // bash (và các bản fork của nó) giữ môi trường lúc khởi động — xét riêng ở ca GC_CF_TOKEN
    let env = ''; try { env = fs.readFileSync('/proc/' + p + '/environ', 'latin1'); } catch (e) { continue; }
    if (env.includes(TOKEN)) procHits.push('env ' + p + ': ' + cmd.replace(/\0/g, ' ').slice(0, 120));
  }
}

// ---------------------------------------------------------------- thư mục cài thử + launcher (như tools/test-ingress.mjs)
function mkHome(name, port) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-' + name + '-')); tmps.push(home);
  const rel = path.join(home, 'releases', 'v' + VERSION.replace(/^v/, ''));
  fs.cpSync(ROOT, rel, { recursive: true, filter: s => !/(^|\/)(\.git|dist|node_modules)$/.test(s) });
  fs.symlinkSync(path.join('releases', path.basename(rel)), path.join(home, 'current'));
  fs.copyFileSync(path.join(rel, 'launcher.js'), path.join(home, 'launcher.js'));
  fs.mkdirSync(path.join(home, 'bin'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(home, 'bin', 'cloudflared-test'), FAKE, { mode: 0o700 });
  fs.mkdirSync(path.join(home, 'run'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(home, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(home, 'h'), { recursive: true });
  fs.writeFileSync(path.join(home, '.env'), 'GC_MODE=native\nGC_PORT=' + port + '\nGC_LANG=en\nGC_BIND=127.0.0.1\n', { mode: 0o600 });
  return home;
}
function startLauncher(home, port, extra) {
  const env = Object.assign({ PATH: process.env.PATH, HOME: path.join(home, 'h') }, {
    GC_HOME: home, GC_PORT: String(port), GC_NO_AUTOCHECK: '1', GC_LANG: 'en',
    GC_TEST: '1', GC_TEST_CF_URL: 'http://127.0.0.1:9/cloudflared', GC_TEST_CF_SHA256: FAKE_SHA, GC_TEST_INGRESS_RECHECK_MS: '1500',
    HTTPS_PROXY: '', https_proxy: '', NO_PROXY: '127.0.0.1,localhost'
  }, extra || {});
  const c = spawn(process.execPath, [path.join(home, 'launcher.js')], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  kids.push(c);
  let log = ''; c.stdout.on('data', d => { log += d; }); c.stderr.on('data', d => { log += d; });
  return { c, home, port, log: () => log };
}
async function stopLauncher(L) {
  try { process.kill(L.c.pid, 'SIGTERM'); } catch (e) { return; }
  await until(() => !alive(L.c.pid), 15000);
  try { process.kill(-L.c.pid, 'SIGKILL'); } catch (e) { /* nhóm đã tắt */ }
}

// ---------------------------------------------------------------- chạy CLI: phiên riêng (setsid → không có terminal), PATH có shim
const CLI = path.join(ROOT, 'cli', 'genchibi');
function cli(home, args, { env = {}, input = '', cliPath = CLI, timeoutMs = 120000 } = {}) {
  return new Promise(resolve => {
    const e = Object.assign({ PATH: SHIM + ':' + process.env.PATH, HOME: path.join(home, 'h'), LANG: 'C.UTF-8', GC_HOME: home, GC_CLI_INNER: '1', GC_LANG: 'en', SHIM_LOG,
      HTTPS_PROXY: '', https_proxy: '', HTTP_PROXY: '', http_proxy: '', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
      GC_ONLINE_POLL: '0.3', GC_ONLINE_RETRY: '2.2', GC_ONLINE_TIMEOUT: '120' }, env);
    const c = spawn('bash', [cliPath].concat(args), { env: e, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    kids.push(c);
    let out = '';
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
    const iv = setInterval(procScan, 15);
    const to = setTimeout(() => { try { process.kill(-c.pid, 'SIGKILL'); } catch (er) { /* đã tắt */ } }, timeoutMs);
    c.on('close', code => { clearInterval(iv); clearTimeout(to); resolve({ code, out }); });
    c.stdin.end(input);
  });
}
const shimLeaks = () => { try { const s = fs.readFileSync(SHIM_LOG, 'latin1'); return s.split('\n').filter(l => l.includes(TOKEN)).map(l => l.split('\0').slice(0, 6).join(' ').slice(0, 200)); } catch (e) { return []; } };
const ownerOf = home => fs.readFileSync(path.join(home, 'data', 'owner-token'), 'utf8').trim();
async function api(L, m, p, body) {
  const r = await fetch('http://127.0.0.1:' + L.port + p, { method: m, headers: { Authorization: 'Bearer ' + ownerOf(L.home), 'X-GC-Request': '1', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
  return { status: r.status, j };
}
function walk(d) { let out = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'releases') out = out.concat(walk(p)); } else if (e.isFile()) out.push(p); } return out; }
const fileLeaks = home => walk(home).filter(f => { try { return fs.readFileSync(f, 'latin1').includes(TOKEN); } catch (e) { return false; } }).map(f => path.relative(home, f));

const P = 7841, PQ = 7851, PX = 7855;
const home = mkHome('cf', P);
const cf = await fakeCloudflare({ token: TOKEN, dns: [{ type: 'A', name: 'chibi.example.com', content: '203.0.113.9' }] });
const outs = [];

// ---------------------------------------------------------------- 1) cách dùng, app dừng
console.log('   — cách dùng, app dừng');
{
  let r = await cli(home, ['online', 'cloudflare', 'chibi.example.com', TOKEN]); outs.push(r.out);
  ok(r.code === 2 && /not accepted on the command line/.test(r.out) && cf.st.log.length === 0, 'token đưa trên dòng lệnh → thoát 2, giải thích vì sao, không gọi Cloudflare / app', r.code + ' ' + r.out);
  r = await cli(home, ['online', 'cloudflare', 'chibi.example.com', '--token=' + 'x'.repeat(30)]);
  ok(r.code === 2 && /not accepted on the command line/.test(r.out), '--token=… cũng bị từ chối (thoát 2)', r.out);
  r = await cli(home, ['online']);
  ok(r.code === 1 && /does not answer at http:\/\/127\.0\.0\.1:7841 — start it: genchibi start/.test(r.out), 'app dừng → "does not answer … genchibi start", thoát 1', r.code + ' ' + r.out);
  r = await cli(home, ['online', '--help']);
  ok(r.code === 0 && /online caddy <domain>/.test(r.out) && /cloudflare \[<domain>\]/.test(r.out) && /never accepted on the command line/.test(r.out) && /Exit code 3/.test(r.out), 'genchibi online --help: caddy · cloudflare · proxy · quick · recheck · off · migrate · mã thoát 3', r.out);
  r = await cli(home, ['online', 'caddy', 'chibi.example.com']);
  ok(r.code === 1 && /needs Docker mode/.test(r.out), 'native: online caddy <tên-miền> → cần Docker, gợi ý Cloudflare (không gọi API)', r.out);
  r = await cli(home, ['online', 'bogus']);
  ok(r.code === 2 && /Unknown option bogus/.test(r.out), 'lệnh con lạ → thoát 2 + trợ giúp', r.out);
  // CNS-204 (spec §3.5): expose / link = bí danh mỏng của online — một dòng "Deprecated … removed in v0.23", rồi ĐÚNG đầu ra + mã thoát của lệnh online tương ứng
  const DEP = /^Deprecated: genchibi (.+) is an alias of genchibi (.+) and will be removed in v0\.23 — running that now\.$/m;
  const strip = o => o.split('\n').filter(l => !DEP.test(l)).join('\n');
  const pairs = [[['expose', 'chibi.example.com', '--overwrite-dns'], ['online', 'cloudflare', 'chibi.example.com', '--overwrite-dns']], [['expose', '--quick'], ['online', 'quick']],
    [['expose', '--off'], ['online', 'off']], [['expose', '--help'], ['online', '--help']], [['link'], ['online']], [['link', '--check'], ['online', 'recheck']]];
  for (const [old, neu] of pairs) {
    const a = await cli(home, old), b = await cli(home, neu), dl = a.out.split('\n').filter(l => DEP.test(l)), mm = DEP.exec(a.out) || [];
    ok(dl.length === 1 && mm[1] === old.join(' ') && mm[2] === neu.join(' '), 'genchibi ' + old.join(' ') + ': đúng một dòng "Deprecated … alias of genchibi ' + neu.join(' ') + ' … removed in v0.23"', a.out);
    ok(a.code === b.code && strip(a.out) === b.out && cf.st.log.length === 0, 'genchibi ' + old.join(' ') + ' ≡ genchibi ' + neu.join(' ') + ' (cùng đầu ra, cùng mã thoát ' + b.code + ')', 'expose: ' + a.code + ' ' + a.out + '\nonline: ' + b.code + ' ' + b.out);
  }
  r = await cli(home, ['expose', '--bogus']);
  ok(r.code === 1 && /--bogus/.test(r.out) && !/cloudflared login/.test(r.out), 'expose với tuỳ chọn lạ → báo lỗi (thoát 1), không còn đường cloudflared login', r.code + ' ' + r.out);
}

const L = startLauncher(home, P, { GC_TEST_CF_API: cf.base, GC_TEST_ONLINE_VIA: '127.0.0.1:' + (P + 2) });
ok(await until(() => health(P), 30000), 'launcher + app thật lên (native, GC_TEST: Cloudflare API giả, lời gọi "từ Internet" → cổng ingress ' + (P + 2) + ')');

// ---------------------------------------------------------------- 2) đường Cloudflare qua CLI
console.log('   — đường Cloudflare qua CLI (Cloudflare API giả)');
{
  let r = await cli(home, ['online']); outs.push(r.out);
  ok(r.code === 0 && /Go online · mode off/.test(r.out) && /Public address: none/.test(r.out) && /Edge: Caddy off · tunnel off/.test(r.out), 'genchibi online (chưa online): mode off · không địa chỉ · edge tắt', r.out);
  r = await cli(home, ['online'], { env: { GC_LANG: 'vi' } });
  ok(r.code === 0 && /chế độ off/.test(r.out) && /Địa chỉ công khai: không có/.test(r.out), 'GC_LANG=vi → trạng thái tiếng Việt', r.out);
  r = await cli(home, ['online', 'cloudflare', 'chibi.example.com']); outs.push(r.out);
  ok(r.code === 1 && /No Cloudflare API token/.test(r.out) && /GC_CF_TOKEN/.test(r.out) && cf.st.log.length === 0, 'không terminal, không GC_CF_TOKEN → dừng, chỉ cách đặt GC_CF_TOKEN (không gọi Cloudflare)', r.code + ' ' + r.out);

  // CNAME / bản ghi có sẵn, không terminal → dừng, không đè
  procHits = [];
  r = await cli(home, ['online', 'cloudflare', 'chibi.example.com'], { env: { GC_CF_TOKEN: TOKEN } }); outs.push(r.out);
  const a = cf.st.dns.find(x => x.name === 'chibi.example.com');
  ok(r.code === 1 && /already has a different DNS record|A 203\.0\.113\.9/.test(r.out) && /--overwrite-dns/.test(r.out) && /other\.example\.com/.test(r.out) && a && a.type === 'A' && !cf.writes(/dns_records/).length,
    'CNAME conflict + không terminal → dừng kèm hướng dẫn (tên khác / --overwrite-dns), bản ghi A giữ nguyên, không ghi DNS', r.code + ' ' + r.out);
  ok(!procHits.length, 'GC_CF_TOKEN: không tiến trình con nào (đã exec) có token trong argv / môi trường', procHits.join('\n'));

  // --token-stdin --overwrite-dns: chạy hết tới "chờ mật khẩu"
  procHits = [];
  r = await cli(home, ['online', 'cloudflare', 'chibi.example.com', '--token-stdin', '--overwrite-dns'], { input: TOKEN + '\n' }); outs.push(r.out);
  const code = (/[0-9A-Z]{5}-[0-9A-Z]{5}/.exec(fs.existsSync(path.join(home, 'data', 'setup-code.txt')) ? fs.readFileSync(path.join(home, 'data', 'setup-code.txt'), 'utf8') : '') || [])[0];
  const cname = cf.st.dns.find(x => x.name === 'chibi.example.com');
  ok(r.code === 3 && code && r.out.includes(code) && /https:\/\/chibi\.example\.com\/setup/.test(r.out) && /finishes going online by itself/.test(r.out) && /genchibi password/.test(r.out) && !/then run: genchibi online recheck/.test(r.out),
    '--token-stdin --overwrite-dns → các bậc chạy tới "chờ mật khẩu": thoát 3, in mã setup ' + code + ' + https://chibi.example.com/setup', r.code + ' ' + r.out);
  ok(['Owner', 'API token', 'Domain + sub-name', 'Tunnel', 'Public address', 'WAF rule', 'MCP from the Internet'].every(n => new RegExp('✓ ' + n.replace(/[+]/g, '\\+')).test(r.out)) && /… Owner password/.test(r.out),
    'tiến độ từng bậc in ra: ✓ owner · token · zone · tunnel · public · waf · mcp, … mật khẩu', r.out);
  ok(cname && cname.type === 'CNAME' && cf.st.tunnels.length === 1 && cf.st.ruleset && cf.st.ruleset.rules.length === 1, 'Cloudflare giả: CNAME thay bản ghi A (đã xác nhận bằng --overwrite-dns), 1 tunnel, 1 luật WAF', JSON.stringify(cf.st.dns));
  ok(!procHits.length && !shimLeaks().length, '--token-stdin: token không có trong argv / môi trường của tiến trình nào (quét /proc + shim curl / awk / sed …)', procHits.concat(shimLeaks()).join('\n'));

  // CNS-209: trong lúc chờ mật khẩu, status / online nói rõ trạng thái TẠM (không phải "off")
  r = await cli(home, ['status']);
  ok(/Online \(temporary — waiting for the owner password\): https:\/\/chibi\.example\.com \(mode cloudflare\)/.test(r.out) && /genchibi password/.test(r.out) && !/Online: off/.test(r.out), 'chờ mật khẩu: genchibi status in "Online (temporary — waiting for the owner password): https://chibi.example.com" + cách đặt, không báo off', r.out);
  r = await cli(home, ['online']);
  ok(/Waiting for the owner password: https:\/\/chibi\.example\.com is on temporarily/.test(r.out), 'genchibi online: dòng "Waiting for the owner password … on temporarily"', r.out);
  const v0 = (await api(L, 'GET', '/api/online')).j;
  ok(v0 && v0.mode === 'off' && v0.flow.waitingPassword === true && v0.cloudflare.tokenInMemory === true, 'server lúc chờ: mode còn off, luồng chờ ở bậc mật khẩu, token API còn trong bộ nhớ');
  // CNS-201: genchibi password → app TỰ hoàn tất (không recheck): mode / publicUrl chính thức / online: true / bỏ API token
  r = await cli(home, ['password'], { input: 'correct horse battery staple\n' });
  ok(r.code === 0, 'genchibi password (stdin) đặt mật khẩu chủ', r.out);
  const v = await until(async () => { const x = (await api(L, 'GET', '/api/online')).j; return x && x.flow && x.flow.done && !x.busy ? x : null; }, 15000, 250);
  const intent = (() => { try { return JSON.parse(fs.readFileSync(path.join(home, 'run', 'edge-intent.json'), 'utf8')); } catch (e) { return {}; } })();
  ok(v && v.mode === 'cloudflare' && v.publicUrl === 'https://chibi.example.com' && !v.publicUrlPending && v.flow.done && !v.cloudflare.tokenInMemory && intent.online === true && intent.tunnel === 'token',
    'đặt mật khẩu → luồng TỰ xong, KHÔNG cần Kiểm lại: mode cloudflare, publicUrl chính thức, intent online: true, token API đã bỏ khỏi bộ nhớ', JSON.stringify(v && { mode: v.mode, pub: v.publicUrl, done: v.flow && v.flow.done, mem: v.cloudflare.tokenInMemory }) + ' ' + JSON.stringify(intent));
  r = await cli(home, ['online', 'recheck']); outs.push(r.out);
  ok(r.code === 0 && /✓ Online: https:\/\/chibi\.example\.com/.test(r.out) && /https:\/\/chibi\.example\.com\/mcp/.test(r.out), 'genchibi online recheck (lối dự phòng) vẫn chạy: in https://chibi.example.com + https://chibi.example.com/mcp', r.code + ' ' + r.out);
  r = await cli(home, ['online']);
  ok(r.code === 0 && /mode cloudflare · chibi\.example\.com/.test(r.out) && /Public address: https:\/\/chibi\.example\.com/.test(r.out) && /Last run: cloudflare · finished/.test(r.out) && (r.out.match(/  ✓ /g) || []).length === 8 && /tunnel token/.test(r.out),
    'genchibi online: mode · địa chỉ · 8 bậc ✓ · edge tunnel token', r.out);
  r = await cli(home, ['status']);
  ok(/Online: https:\/\/chibi\.example\.com \(mode cloudflare/.test(r.out), 'genchibi status có dòng Online: https://chibi.example.com', r.out);

  // đổi địa chỉ: không terminal, không --yes → dừng, không đổi
  r = await cli(home, ['online', 'quick']); outs.push(r.out);
  const v2 = (await api(L, 'GET', '/api/online')).j;
  ok(r.code === 1 && /changes the public address \(https:\/\/chibi\.example\.com → a new address\): 0 connected agent/.test(r.out) && /--yes/.test(r.out) && v2.mode === 'cloudflare' && v2.publicUrl === 'https://chibi.example.com', 'needs urlChange + không terminal → hỏi không được → dừng, gợi ý --yes, địa chỉ giữ nguyên', r.code + ' ' + r.out);

  // proxy: in đoạn cấu hình; bậc lỗi in cách sửa (cổng ingress đã đóng sau off nên "từ Internet" không tới)
  r = await cli(home, ['online', 'off'], { env: { GC_CF_TOKEN: TOKEN } }); outs.push(r.out);
  const gone = !cf.st.tunnels.some(t => !t.deleted_at) && !cf.st.dns.some(x => x.name === 'chibi.example.com');
  ok(r.code === 0 && /Offline/.test(r.out) && /✓ This machine/.test(r.out) && /✓ Cloudflare cleanup/.test(r.out) && gone, 'genchibi online off (GC_CF_TOKEN) → offline, app dọn tunnel + CNAME ở Cloudflare', r.code + ' ' + r.out);
  r = await cli(home, ['online', 'proxy', 'chibi.example.com', '--yes']); outs.push(r.out);
  ok(r.code === 1 && /# Caddy/.test(r.out) && /# nginx/.test(r.out) && /proxy_pass http:\/\/127\.0\.0\.1:7841;/.test(r.out) && /✗ Public address/.test(r.out) && /      → /.test(r.out) && /Stopped at: Public address/.test(r.out),
    'online proxy: in đoạn cấu hình Caddy + nginx (nhiều dòng), bậc ✗ in cách sửa → thoát 1 "Stopped at"', r.code + ' ' + r.out);
}

// ---------------------------------------------------------------- 3) có terminal: hỏi token ẩn
if ((() => { try { return /util-linux/.test(execFileSync('script', ['--version'], { encoding: 'utf8' })); } catch (e) { return false; } })()) {
  console.log('   — có terminal (script): hỏi token ẩn');
  procHits = [];
  const sh = path.join(W, 'tty.sh');
  fs.writeFileSync(sh, 'exec bash ' + JSON.stringify(CLI) + ' online cloudflare chibi.example.com --yes\n');
  const r = await new Promise(resolve => {
    const e = { PATH: SHIM + ':' + process.env.PATH, HOME: path.join(home, 'h'), LANG: 'C.UTF-8', GC_HOME: home, GC_CLI_INNER: '1', GC_LANG: 'en', SHIM_LOG, NO_PROXY: '127.0.0.1,localhost', GC_ONLINE_POLL: '0.3', GC_ONLINE_RETRY: '2.2', TERM: 'dumb' };
    const c = spawn('script', ['-qec', 'bash ' + sh, '/dev/null'], { env: e, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    kids.push(c);
    let out = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
    const iv = setInterval(procScan, 15);
    // gõ token khi lời hỏi hiện ra (như người dùng dán)
    const typer = setInterval(() => { if (/API token \(hidden while typing\)/.test(out)) { clearInterval(typer); c.stdin.write(TOKEN + '\r'); } }, 50);
    const to = setTimeout(() => { try { process.kill(-c.pid, 'SIGKILL'); } catch (er) { /* đã tắt */ } }, 120000);
    c.on('close', code => { clearInterval(iv); clearInterval(typer); clearTimeout(to); resolve({ code, out }); });
  });
  outs.push(r.out);
  ok(/Create a Cloudflare API token/.test(r.out) && /permissionGroupKeys/.test(r.out) && /Cloudflare API token \(hidden while typing\)/.test(r.out) && !r.out.includes(TOKEN), 'có terminal → in link tạo token (điền sẵn quyền) + hỏi ẩn; token gõ vào không hiện lại', r.out);
  ok(r.code === 0 && /✓ Online: https:\/\/chibi\.example\.com/.test(r.out), 'dán token trên terminal → chạy tới xong (đã có mật khẩu)', r.code + ' ' + r.out);
  ok(!procHits.length && !shimLeaks().length, 'hỏi trên terminal: token không trong argv / môi trường tiến trình nào', procHits.concat(shimLeaks()).join('\n'));
  await cli(home, ['online', 'off'], { env: { GC_CF_TOKEN: TOKEN } });
} else console.log('   · bỏ qua ca có terminal: cần script của util-linux');

// ---------------------------------------------------------------- 4) rò rỉ + đột biến
console.log('   — token API không lọt; đột biến gửi token bằng argv');
{
  const fl = fileLeaks(home);
  ok(!outs.some(o => o.includes(TOKEN)) && !L.log().includes(TOKEN) && !fl.length, 'token không có trong đầu ra CLI, log launcher / app, tệp nào của thư mục cài (data/, run/, logs/, .env)', fl.join(', '));
  const mut = path.join(W, 'genchibi-mut');
  const src = fs.readFileSync(CLI, 'utf8');
  const a1 = '{ auth_cfg; if [ -n "${3:-}" ]; then printf \'data = "%s"\\n\' "$(cfg_esc "$3")"; fi; } | curl -sS -m 30 -K - -X "$1"';
  const t = src.replace(a1, 'auth_cfg | curl -sS -m 30 -K - ${3:+-d "$3"} -X "$1"');
  ok(t !== src, 'đột biến áp được (oapi gửi thân lệnh bằng curl -d trong argv)');
  fs.writeFileSync(mut, t);
  fs.writeFileSync(SHIM_LOG, ''); procHits = [];
  await sleep(2200);
  const r = await cli(home, ['online', 'cloudflare', 'chibi.example.com', '--token-stdin', '--yes'], { input: TOKEN + '\n', cliPath: mut });
  ok(shimLeaks().length > 0 || procHits.length > 0, 'CLI đột biến (token trong argv của curl) → rào bắt được (' + (shimLeaks().length + procHits.length) + ' lần thấy) — kiểm ở (2) / (3) sẽ ĐỎ', r.out);
  fs.writeFileSync(SHIM_LOG, ''); procHits = [];   // các ca sau dùng lại CLI thật
  await sleep(2200);
  await cli(home, ['online', 'off'], { env: { GC_CF_TOKEN: TOKEN } });
}

// ---------------------------------------------------------------- 4b) token thấy nhiều tên miền · WAF phải làm tay
console.log('   — nhiều tên miền (choices) · WAF làm tay');
{
  cf.st.zones.push({ id: crypto.randomBytes(16).toString('hex'), name: 'example.org', status: 'active', type: 'full' });
  await sleep(2200);
  let r = await cli(home, ['online', 'cloudflare', '--token-stdin', '--yes'], { input: TOKEN + '\n' });
  ok(r.code === 1 && /several domains/.test(r.out) && /1\) example\.com/.test(r.out) && /2\) example\.org/.test(r.out) && /genchibi online cloudflare <domain>/.test(r.out),
    'không nêu tên miền + token thấy 2 zone + không terminal → liệt kê 1) example.com 2) example.org, dừng kèm cách chạy lại', r.code + ' ' + r.out);
  cf.st.zones.pop();
  cf.st.perms.waf = false;
  await sleep(2200);
  r = await cli(home, ['online', 'cloudflare', 'chibi.example.com', '--token-stdin', '--yes'], { input: TOKEN + '\n' }); outs.push(r.out);
  ok(r.code === 1 && /✗ WAF rule/.test(r.out) && /http\.host eq "chibi\.example\.com"/.test(r.out) && /genchibi online recheck --waf-done/.test(r.out), 'token không có quyền WAF + không terminal → bậc WAF ✗ in biểu thức luật Skip + "genchibi online recheck --waf-done"', r.code + ' ' + r.out);
  await sleep(2200);
  r = await cli(home, ['online', 'recheck', '--waf-done']); outs.push(r.out);
  ok(r.code === 0 && /✓ WAF rule/.test(r.out) && /✓ Online: https:\/\/chibi\.example\.com/.test(r.out), 'genchibi online recheck --waf-done → chủ xác nhận đã làm tay → đi tiếp tới xong', r.code + ' ' + r.out);
  cf.st.perms.waf = true;
  await sleep(2200);
  r = await cli(home, ['online', 'off'], { env: { GC_CF_TOKEN: TOKEN } });
  ok(r.code === 0 && !cf.st.tunnels.some(t => !t.deleted_at), 'off dọn lại Cloudflare', r.out);
  ok(!outs.some(o => o.includes(TOKEN)) && !shimLeaks().length, 'các ca trên: token không trong đầu ra / argv / env', shimLeaks().join('\n'));
}
await stopLauncher(L);

// ---------------------------------------------------------------- 5) link tạm qua CLI
console.log('   — link tạm (quick) qua CLI: launcher + cloudflared giả đóng vai Cloudflare');
{
  const hq = mkHome('quick', PQ);
  fs.writeFileSync(path.join(hq, 'fake-cf-proxy-port'), String(PX));
  const LQ = startLauncher(hq, PQ, { GC_TEST_ONLINE_VIA: '127.0.0.1:' + PX });
  await until(() => health(PQ), 30000);
  let r = await cli(hq, ['password'], { input: 'correct horse battery staple\n' });
  r = await cli(hq, ['online', 'quick']);
  const url = (/✓ Online: (https:\/\/fake-\d+\.trycloudflare\.com)/.exec(r.out) || [])[1];
  ok(r.code === 0 && url && r.out.includes(url + '/mcp') && /✓ Tunnel/.test(r.out) && /✓ MCP from the Internet/.test(r.out), 'genchibi online quick → tunnel · public · mcp · mật khẩu ✓, in link tạm + /mcp', r.code + ' ' + r.out);
  r = await cli(hq, ['online', 'off']);
  ok(r.code === 0 && /Offline/.test(r.out), 'genchibi online off (link tạm) → offline', r.out);
  // bật lại trên CÙNG launcher: tunnel.log còn link cũ (đã chết) — bậc Tunnel phải đợi link MỚI của cloudflared mới, không lấy link cũ từ log
  r = await cli(hq, ['online', 'quick']);
  const urlB = (/✓ Online: (https:\/\/fake-\d+\.trycloudflare\.com)/.exec(r.out) || [])[1];
  const cfPid = (() => { try { return JSON.parse(fs.readFileSync(path.join(hq, 'fake-cf-run.json'), 'utf8')).pid; } catch (e) { return 0; } })();
  ok(r.code === 0 && urlB && urlB !== url && urlB === 'https://fake-' + cfPid + '.trycloudflare.com' && /✓ MCP from the Internet/.test(r.out), 'online quick → off → quick (cùng launcher) → link MỚI của cloudflared mới, không lấy link cũ còn trong tunnel.log', r.code + ' ' + r.out);
  r = await cli(hq, ['online', 'off']);
  ok(r.code === 0 && /Offline/.test(r.out), 'genchibi online off lần hai → offline', r.out);
  await stopLauncher(LQ);
  // CNS-204: bí danh cũ chạy đúng luồng mới tới xong (app chạy) — bản cài riêng
  const PQ2 = 7891, PX2 = 7897, hq2 = mkHome('quick2', PQ2);
  fs.writeFileSync(path.join(hq2, 'fake-cf-proxy-port'), String(PX2));
  const LQ2 = startLauncher(hq2, PQ2, { GC_TEST_ONLINE_VIA: '127.0.0.1:' + PX2 });
  await until(() => health(PQ2), 30000);
  r = await cli(hq2, ['password'], { input: 'correct horse battery staple\n' });
  r = await cli(hq2, ['expose', '--quick']);
  const url2 = (/✓ Online: (https:\/\/fake-\d+\.trycloudflare\.com)/.exec(r.out) || [])[1];
  ok(r.code === 0 && url2 && /^Deprecated: genchibi expose --quick is an alias of genchibi online quick/m.test(r.out) && /✓ MCP from the Internet/.test(r.out), 'genchibi expose --quick (cũ) → nhắc một dòng rồi chạy online quick tới xong, in link tạm', r.code + ' ' + r.out);
  r = await cli(hq2, ['link']);
  ok(r.code === 0 && /^Deprecated: genchibi link is an alias of genchibi online/m.test(r.out) && url2 && r.out.includes(url2), 'genchibi link → trạng thái online: in địa chỉ (Studio + /mcp)', r.code + ' ' + r.out);
  await sleep(2200);
  r = await cli(hq2, ['expose', '--off']);
  ok(r.code === 0 && /^Deprecated: genchibi expose --off is an alias of genchibi online off/m.test(r.out) && /Offline/.test(r.out), 'genchibi expose --off → online off', r.code + ' ' + r.out);
  await stopLauncher(LQ2);
}

// ---------------------------------------------------------------- 6) máy kế thừa (.env có GC_PUBLIC_URL) → needs legacy · migrate
console.log('   — máy kế thừa: cấu hình ra ngoài bằng .env');
{
  const PL = 7861, hl = mkHome('legacy', PL);
  const LL = startLauncher(hl, PL, { GC_PUBLIC_URL: 'https://old.example.com', GC_ALLOWED_HOSTS: 'old.example.com' });
  await until(() => health(PL), 30000);
  let r = await cli(hl, ['online']);
  ok(r.code === 0 && /goes online through \.env/.test(r.out) && /genchibi online migrate/.test(r.out), 'genchibi online: báo máy đang ra ngoài bằng .env (chỉ đọc) + lệnh migrate', r.out);
  r = await cli(hl, ['online', 'quick', '--yes']);
  ok(r.code === 1 && /does not mix the two/.test(r.out) && /genchibi online migrate/.test(r.out), 'POST bị 409 needs legacy → giải thích .env + genchibi online migrate, thoát 1', r.code + ' ' + r.out);
  await sleep(2200);
  r = await cli(hl, ['online', 'migrate']);
  ok((r.code === 1 && /no migrate step yet — update first: genchibi update/.test(r.out)) || (r.code === 0 && /now live in Go online/.test(r.out)), 'genchibi online migrate: route chưa có (404) → "cần bản mới"; có route → chuyển xong', r.code + ' ' + r.out);
  await stopLauncher(LL);
}

// ---------------------------------------------------------------- 7) móc kiểm thử chỉ có tác dụng khi GC_TEST=1 (review bảo mật 🟡7)
console.log('   — móc kiểm thử: GC_TEST_* / GC_AUTH_RATE không tác dụng khi thiếu GC_TEST=1; không đi qua .env');
{
  // (a) server: GC_TEST_CF_API có mà thiếu GC_TEST=1 → client Cloudflare KHÔNG gọi API giả (gọi api.cloudflare.com thật → trong sandbox không có mạng → lỗi)
  const PG = 7871, hg = mkHome('gate', PG), calls0 = cf.st.log.length;
  const env = Object.assign({}, Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GC_/.test(k))), { GC_HOME: hg, GC_PORT: String(PG), GC_NO_AUTOCHECK: '1', GC_TEST_CF_API: cf.base, GC_AUTH_RATE: '1000', HTTPS_PROXY: '', https_proxy: '' });
  const sv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env, stdio: 'ignore', detached: true }); kids.push(sv);
  await until(() => health(PG), 20000);
  const Lg = { port: PG, home: hg };
  const st0 = await api(Lg, 'POST', '/api/online/cloudflare', { token: TOKEN, zone: 'example.com' });
  const vg = await until(async () => { const x = (await api(Lg, 'GET', '/api/online')).j; return x && !x.busy && x.flow ? x : null; }, 30000, 300);
  const tok = vg && vg.flow.steps.find(x => x.id === 'token');
  ok(st0.status === 202 && tok && tok.state === 'fail' && cf.st.log.length === calls0, 'GC_TEST_CF_API mà KHÔNG có GC_TEST=1 → bị bỏ qua: Cloudflare API giả không nhận lời gọi nào, bậc token ✗ (gọi API thật, không có mạng)', JSON.stringify(tok));
  try { process.kill(-sv.pid, 'SIGTERM'); } catch (e) { /* đã tắt */ }
  // (b) launcher: env của app con bỏ GC_TEST* / GC_AUTH_RATE / GC_OAUTH_RATE trừ khi chính launcher chạy với GC_TEST=1
  const { createRequire } = await import('module'), req = createRequire(import.meta.url), Lmod = req(path.join(ROOT, 'launcher.js'));
  const keep = { GC_TEST: process.env.GC_TEST, GC_TEST_CF_API: process.env.GC_TEST_CF_API, GC_AUTH_RATE: process.env.GC_AUTH_RATE };
  delete process.env.GC_TEST; process.env.GC_TEST_CF_API = 'http://127.0.0.1:9/client/v4'; process.env.GC_AUTH_RATE = '1000';
  const e1 = Lmod.appEnv(); process.env.GC_TEST = '1'; const e2 = Lmod.appEnv();
  Object.entries(keep).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  ok(!Object.keys(e1).some(k => /^GC_TEST/.test(k) || k === 'GC_AUTH_RATE') && e1.PATH && e2.GC_TEST === '1' && e2.GC_TEST_CF_API && e2.GC_AUTH_RATE === '1000', 'launcher: thiếu GC_TEST=1 → env của app không có GC_TEST_* / GC_AUTH_RATE; có GC_TEST=1 (bộ test) → giữ');
  // (c) CLI: .env có GC_TEST=1 / GC_TEST_CF_API → không xuất sang launcher (genchibi start); set_env ghi .env thì bỏ hẳn các dòng đó
  const hc = mkHome('envhook', 7881), dump = path.join(hc, 'launcher-env.json');
  fs.appendFileSync(path.join(hc, '.env'), 'GC_TEST=1\nexport GC_TEST_CF_API=http://127.0.0.1:9/client/v4\nGC_TEST_ONLINE_VIA=127.0.0.1:9\n');
  fs.writeFileSync(path.join(hc, 'launcher.js'), 'require("fs").writeFileSync(' + JSON.stringify(dump) + ', JSON.stringify(process.env));\n');
  let r = await cli(hc, ['start']);
  await until(() => fs.existsSync(dump), 10000);
  const de = (() => { try { return JSON.parse(fs.readFileSync(dump, 'utf8')); } catch (e) { return null; } })();
  ok(r.code === 0 && de && de.GC_PORT === '7881' && !Object.keys(de).some(k => /^GC_TEST/.test(k)), 'CLI nạp .env có GC_TEST=1 / GC_TEST_CF_API → launcher KHÔNG nhận móc nào (chỉ từ shell gọi lệnh)', r.out + ' ' + (de ? Object.keys(de).filter(k => /^GC_/.test(k)).join(',') : 'không có env'));
  fs.rmSync(dump, { force: true }); fs.rmSync(path.join(hc, 'logs', 'launcher.pid'), { force: true });   // launcher giả đã thoát (sandbox có thể chưa dọn zombie — kill -0 vẫn thấy)
  r = await cli(hc, ['start'], { env: { GC_TEST: '1' } });
  await until(() => fs.existsSync(dump), 10000);
  const de2 = (() => { try { return JSON.parse(fs.readFileSync(dump, 'utf8')); } catch (e) { return null; } })();
  ok(de2 && de2.GC_TEST === '1' && !de2.GC_TEST_CF_API, 'đối chứng: GC_TEST=1 từ shell gọi lệnh (bộ test) vẫn tới launcher; GC_TEST_CF_API trong .env thì không', r.out + ' ' + (de2 ? Object.keys(de2).filter(k => /^GC_/.test(k)).join(',') : 'không có env'));
  r = await cli(hc, ['lang', 'vi']);
  const envTxt = fs.readFileSync(path.join(hc, '.env'), 'utf8');
  ok(/^GC_LANG=vi$/m.test(envTxt) && !/GC_TEST/.test(envTxt), 'CLI ghi .env (genchibi lang vi) → các dòng GC_TEST* bị bỏ khỏi .env', envTxt);
}

cf.close();
tmps.forEach(d => { if (path.dirname(d) === os.tmpdir() && path.basename(d).startsWith('gcc-')) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* bỏ qua */ } } });
console.log('   ' + (failn ? '✗' : '✓') + ' test-online-cli: ' + passn + ' ✓ · ' + failn + ' ✗');
process.exit(failn ? 1 : 0);
