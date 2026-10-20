// Kiểm cổng ingress của cloudflared + luồng "Go online" link tạm từ đầu tới cuối (v0.21, sửa bảo mật B + kiểm gộp P1 / P2 / P3):
//   1) tiến trình lạ chiếm 127.0.0.1:<GC_PORT+2> TRƯỚC app → launcher KHÔNG spawn cloudflared (error ingress-unverified); cổng trả lại cho app → tự chạy
//   2) đang chạy mà cổng bị chiếm (app khởi động lại, kẻ lạ giành cổng) → kiểm định kỳ bắt được → dừng cloudflared
//   3) /ready của cloudflared: cổng metrics ngẫu nhiên mỗi lần spawn (không phải GC_PORT+4), kẻ lạ trả 200 ở cổng cũ không làm "ready";
//      (Linux) socket metrics phải thuộc đúng PID đã spawn
//   4) đột biến: bỏ kiểm ingress trong launcher → kịch bản 1 phải ĐỎ (cloudflared giả bị spawn)
//   5) tích hợp: launcher thật + app thật + online-config thật + cloudflared giả (đóng vai Cloudflare: chuyển request tới cổng ingress) —
//      POST /api/online/quick → intent → cổng ingress mở → nonce đúng → cloudflared spawn → edge-status ready + url → bậc public / mcp ĐI QUA cổng ingress → xong;
//      Go offline → cloudflared dừng, cổng đóng
// Không gọi mạng thật: cloudflared giả (tools/fixtures/fake-cloudflared.js), GC_TEST_ONLINE_VIA (main.js, chỉ khi GC_TEST=1) trỏ lời gọi "từ Internet" về loopback.
// © 2026 Gen Labs — All rights reserved.
import fs from 'fs';
import os from 'os';
import net from 'net';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let passn = 0, failn = 0;
const ok = (c, m) => { if (c) { passn++; console.log('   ✓', m); } else { failn++; console.log('   ✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE = fs.readFileSync(path.join(ROOT, 'tools/fixtures/fake-cloudflared.js'));
const FAKE_SHA = crypto.createHash('sha256').update(FAKE).digest('hex');
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const tmps = [], kids = [];
process.on('exit', () => kids.forEach(k => { try { process.kill(-k.pid, 'SIGKILL'); } catch (e) { try { k.kill('SIGKILL'); } catch (e2) { /* đã tắt */ } } }));

const portOpen = port => new Promise(r => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
async function until(fn, ms, step = 200) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } }
const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };

// thư mục cài thử: releases/vtest = bản sao cây hiện tại (launcher có thể bị đột biến — cả bản trong release, để launcher không tự thay về bản gốc)
function mkHome(name, { mutate } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-' + name + '-')); tmps.push(home);
  const rel = path.join(home, 'releases', 'v' + VERSION.replace(/^v/, ''));
  fs.cpSync(ROOT, rel, { recursive: true, filter: s => !/(^|\/)(\.git|dist|node_modules)$/.test(s) });
  if (mutate) { const f = path.join(rel, 'launcher.js'); fs.writeFileSync(f, mutate(fs.readFileSync(f, 'utf8'))); }
  fs.symlinkSync(path.join('releases', path.basename(rel)), path.join(home, 'current'));
  fs.copyFileSync(path.join(rel, 'launcher.js'), path.join(home, 'launcher.js'));
  fs.mkdirSync(path.join(home, 'bin'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(home, 'bin', 'cloudflared-test'), FAKE, { mode: 0o700 });
  fs.mkdirSync(path.join(home, 'run'), { recursive: true, mode: 0o700 });
  return home;
}
function startLauncher(home, port, extra) {
  const env = Object.assign({}, process.env, {
    GC_HOME: home, GC_PORT: String(port), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: '', GC_PUBLIC_URL: '', GC_ALLOWED_HOSTS: '', GC_TUNNEL: '',
    GC_TEST: '1', GC_TEST_CF_URL: 'http://127.0.0.1:9/cloudflared', GC_TEST_CF_SHA256: FAKE_SHA, GC_TEST_INGRESS_RECHECK_MS: '1500',
    HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: '', NO_PROXY: '', no_proxy: ''
  }, extra || {});
  const c = spawn(process.execPath, [path.join(home, 'launcher.js')], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  kids.push(c);
  let log = ''; c.stdout.on('data', d => { log += d; }); c.stderr.on('data', d => { log += d; });
  return { c, home, port, log: () => log, st: () => readJ(path.join(home, 'run', 'edge-status.json')) || {}, run: () => readJ(path.join(home, 'fake-cf-run.json')) };
}
async function stopLauncher(L) {
  try { process.kill(L.c.pid, 'SIGTERM'); } catch (e) { return; }
  await until(() => !alive(L.c.pid), 15000);
  try { process.kill(-L.c.pid, 'SIGKILL'); } catch (e) { /* nhóm đã tắt */ }
}
const health = port => new Promise(r => { http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1000 }, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)); });
// "kẻ lạ" giỏi nhất có thể: trả /api/health y hệt app (chuyển tiếp tới cổng chính) — chỉ thiếu nonce
function squatter(port, target) {
  const srv = http.createServer((req, res) => {
    if (target) { const up = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }); up.on('error', () => { res.writeHead(502); res.end(); }); return req.pipe(up); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, version: VERSION, status: 200, readyConnections: 4 }));
  });
  return new Promise((r, j) => { srv.once('error', j); srv.listen(port, '127.0.0.1', () => r(srv)); });
}
const ownerOf = home => fs.readFileSync(path.join(home, 'data', 'owner-token'), 'utf8').trim();
async function api(L, m, p, body, headers) {
  const r = await fetch('http://127.0.0.1:' + L.port + p, { method: m, headers: Object.assign({ Authorization: 'Bearer ' + ownerOf(L.home), 'X-GC-Request': '1', 'Content-Type': 'application/json' }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
  return { status: r.status, j, t };
}
const appPid = home => { try { return +execFileSync('pgrep', ['-f', path.join(home, 'current', 'server', 'main.js')], { encoding: 'utf8' }).trim().split('\n')[0]; } catch (e) { return 0; } };

// ---------------------------------------------------------------- 0) hàm thuần của launcher
console.log('   — launcher: hàm thuần');
{
  const L = (await import('module')).createRequire(import.meta.url)(path.join(ROOT, 'launcher.js'));
  const p1 = await L.freePort(), p2 = await L.freePort();
  ok(p1 > 1024 && p2 > 1024 && L.cfArgs('quick', p1).join(' ').includes('--metrics 127.0.0.1:' + p1), 'freePort: cổng rảnh do hệ điều hành chọn → --metrics 127.0.0.1:<cổng đó>');
  const s = await new Promise(r => { const x = net.createServer().listen(0, '127.0.0.1', () => r(x)); });
  const sp = s.address().port;
  ok(L.portOwnedBy(process.pid, sp) === true && L.portOwnedBy(1, sp) === false && L.portOwnedBy(process.pid, p2) === false, 'portOwnedBy: socket đang nghe thuộc đúng PID → true; PID khác / cổng không ai nghe → false');
  s.close();
}

// ---------------------------------------------------------------- 1) kẻ lạ chiếm cổng ingress trước app
console.log('   — kẻ lạ chiếm cổng ingress trước app');
const P1 = 7821;
{
  const home = mkHome('squat');
  fs.writeFileSync(path.join(home, 'run', 'edge-intent.json'), '{"tunnel":"quick","online":true}');
  const sq = await squatter(P1 + 2, P1);   // chuyển tiếp tới app: /api/health đúng version, chỉ thiếu X-GC-Ingress
  const oldMetrics = await squatter(P1 + 4);   // kẻ lạ ở cổng metrics CŨ (cố định) trả /ready 200
  const L = startLauncher(home, P1);
  await until(() => health(P1), 20000);
  const st = await until(() => L.st().error === 'ingress-unverified' && L.st(), 15000);
  await sleep(3000);
  ok(st && st.error === 'ingress-unverified' && L.st().running === false && !L.run(), 'cổng ingress bị chiếm (dù trả /api/health đúng version) → KHÔNG spawn cloudflared, edge-status error ingress-unverified');
  ok(/does not answer as this gen-chibi/.test(L.log()) && (L.log().match(/does not answer as this gen-chibi/g) || []).length === 1, 'log ghi lý do một lần (không spam mỗi 2 s)');
  await new Promise(r => sq.close(r));
  const st2 = await until(() => L.st().ready === true && L.st(), 25000);
  const run = L.run();
  const mp = run && +((/--metrics 127\.0\.0\.1:(\d+)/.exec(run.argv.join(' ')) || [])[1]);
  ok(st2 && st2.ready === true && st2.running === true && !st2.error && /^https:\/\/fake-\d+\.trycloudflare\.com$/.test(st2.url || ''), 'kẻ lạ nhả cổng → app tự mở lại cổng ingress (theo run/edge-intent.json) → nonce đúng → cloudflared chạy, ready, có link tạm');
  ok(mp > 0 && mp !== P1 + 4 && !run.env.some(k => /^GC_/.test(k)), 'cloudflared nhận cổng metrics ngẫu nhiên (không phải GC_PORT+4), env không có GC_* (không nonce)');
  // nonce: đọc từ môi trường ban đầu của app con (/proc) — không được có trong log launcher / app, không trong env của cloudflared
  let nonce = ''; try { nonce = (/(?:^|\0)GC_INGRESS_NONCE=([a-f0-9]{64})/.exec(fs.readFileSync('/proc/' + appPid(home) + '/environ', 'latin1')) || [])[1] || ''; } catch (e) { nonce = ''; }
  let cfEnv = ''; try { cfEnv = fs.readFileSync('/proc/' + st2.pid + '/environ', 'latin1'); } catch (e) { cfEnv = ''; }
  ok(nonce.length === 64 && !L.log().includes(nonce) && !cfEnv.includes(nonce) && !fs.readFileSync(path.join(home, 'logs', 'tunnel.log'), 'utf8').includes(nonce), 'GC_INGRESS_NONCE (64 hex, chỉ app con) không có trong log launcher / app / tunnel.log, không trong env của cloudflared');
  // 3) /ready: cloudflared giả báo chưa sẵn sàng; kẻ lạ ở cổng cũ trả 200 → không được tính
  fs.writeFileSync(path.join(home, 'fake-cf-notready'), '*');
  const nr = await until(() => L.st().ready === false && L.st(), 10000);
  ok(nr && nr.ready === false && nr.running === true, '/ready lấy từ đúng cổng của tiến trình đã spawn: nó báo chưa sẵn sàng → ready false dù cổng cũ GC_PORT+4 có kẻ trả 200');
  fs.rmSync(path.join(home, 'fake-cf-notready'));
  await until(() => L.st().ready === true, 10000);
  // 2) đang chạy: app chết, kẻ lạ giành cổng trước khi app lên lại → kiểm định kỳ dừng cloudflared
  const cfPid = L.st().pid, ap = appPid(home);
  let sq2 = null;
  if (ap) {
    process.kill(ap, 'SIGKILL');
    sq2 = await until(async () => { try { return await squatter(P1 + 2, P1); } catch (e) { return null; } }, 3000, 20);
  }
  const st3 = await until(() => L.st().error === 'ingress-unverified' && L.st().running === false && L.st(), 20000);
  ok(ap > 0 && sq2 && st3 && !alive(cfPid), 'đang chạy, cổng ingress bị kẻ lạ giành (app khởi động lại) → kiểm định kỳ: dừng cloudflared (pid ' + cfPid + '), error ingress-unverified');
  if (sq2) await new Promise(r => sq2.close(r));
  const st4 = await until(() => L.st().ready === true && L.st(), 25000);
  ok(st4 && st4.ready === true && st4.pid !== cfPid, 'kẻ lạ đi → tự chạy lại cloudflared khi cổng chứng minh lại được');
  await stopLauncher(L);
  oldMetrics.close();
}

// ---------------------------------------------------------------- 4) đột biến: launcher bỏ kiểm ingress → kịch bản 1 phải đỏ
console.log('   — đột biến: bỏ kiểm ingress');
{
  const P = 7831;
  const home = mkHome('mut', { mutate: s => { const t = s.replace('async function ingressOK(ver) {', 'async function ingressOK(ver) { return true;'); if (t === s) throw new Error('đột biến không áp được'); return t; } });
  fs.writeFileSync(path.join(home, 'run', 'edge-intent.json'), '{"tunnel":"quick","online":true}');
  const sq = await squatter(P + 2, P);
  const L = startLauncher(home, P);
  await until(() => health(P), 20000);
  const spawned = await until(() => !!L.run(), 15000);
  ok(spawned, 'launcher đột biến (ingressOK luôn đúng) → cloudflared bị spawn trỏ vào cổng của kẻ lạ — kiểm ở kịch bản 1 sẽ ĐỎ (rào có tác dụng)');
  await stopLauncher(L); await new Promise(r => sq.close(r));
}

// ---------------------------------------------------------------- 5) tích hợp: Go online link tạm đi hết qua cổng ingress
console.log('   — tích hợp: launcher + app + online-config + cloudflared giả, Go online link tạm');
{
  const P = 7811, PX = 7815;
  const home = mkHome('e2e');
  fs.writeFileSync(path.join(home, 'fake-cf-proxy-port'), String(PX));
  const L = startLauncher(home, P, { GC_TEST_ONLINE_VIA: '127.0.0.1:' + PX });
  await until(() => health(P), 20000);
  ok(!(await portOpen(P + 2)) && !L.run(), 'chưa Go online: cổng ingress đóng, không có cloudflared');
  const pw = await api(L, 'POST', '/api/auth/password', { password: 'correct horse battery staple' });
  const q = await api(L, 'POST', '/api/online/quick', {});
  let v = null;
  await until(async () => { v = (await api(L, 'GET', '/api/online')).j; return v && !v.busy; }, 60000, 300);
  const steps = v && v.flow ? v.flow.steps.map(s => s.id + (s.state === 'ok' ? '✓' : '✗(' + s.detail + ')')).join(' ') : JSON.stringify(v);
  ok(pw.status === 200 && q.status === 202 && v && v.flow && v.flow.done && v.flow.steps.every(s => s.state === 'ok'), 'POST /api/online/quick → tunnel · public · mcp · password đều ✓: ' + steps);
  const url = v && v.publicUrl;
  const st = L.st(), intent = readJ(path.join(home, 'run', 'edge-intent.json'));
  ok(/^https:\/\/fake-\d+\.trycloudflare\.com$/.test(url || '') && v.mode === 'quick' && st.ready === true && st.url === url && intent && intent.tunnel === 'quick' && intent.online === true,
    'publicUrl chính thức = link tạm từ edge-status của launcher; mode quick; intent {tunnel:quick, online:true}; edge-status ready');
  const cfg = readJ(path.join(home, 'data', 'online.json'));
  ok(cfg && cfg.mode === 'quick' && cfg.publicUrl === url && cfg.publicUrlPending === '' && cfg.flow && cfg.flow.done === true, 'data/online.json (online-config P1): mode quick, publicUrl chính thức, không còn bản tạm, flow lưu kèm');
  // đi qua "Cloudflare" (cloudflared giả) → cổng ingress: lớp E tunnel, IP khách = Cf-Connecting-Ip
  const host = url ? new URL(url).host : 'x';
  const viaCf = (p, h) => new Promise(r => http.get({ host: '127.0.0.1', port: PX, path: p, headers: Object.assign({ Host: host }, h) }, res => { let s = ''; res.on('data', c => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { j = null; } r({ status: res.statusCode, j, h: res.headers }); }); }).on('error', () => r({ status: 0 })));
  const o = await viaCf('/api/online', { Authorization: 'Bearer ' + ownerOf(home) });
  const pr = await viaCf('/.well-known/oauth-protected-resource');
  const anon = await viaCf('/api/online');
  ok(o.status === 200 && o.j.request.edge === 'tunnel' && o.j.request.ip === '198.51.100.77', 'request qua tunnel tới cổng ingress: gcEdge = tunnel, IP khách = Cf-Connecting-Ip (do edge gắn trước cổng auth của P1)');
  ok(pr.status === 200 && pr.j && pr.j.resource === url + '/mcp' && anon.status === 401, 'qua tunnel: metadata OAuth đúng publicUrl; /api/online không bằng chứng chủ → 401');
  const hz1 = await viaCf('/api/health', { 'X-GC-Ingress-Challenge': 'a'.repeat(32) }), hz2 = await viaCf('/api/health', { 'X-GC-Ingress-Challenge': 'b'.repeat(32) });
  ok(hz1.status === 200 && /^[a-f0-9]{64}$/.test(hz1.h['x-gc-ingress'] || '') && hz1.h['x-gc-ingress'] !== hz2.h['x-gc-ingress'], 'từ Internet chỉ lấy được HMAC của challenge do mình chọn (mỗi challenge một giá trị) — launcher dùng challenge ngẫu nhiên mới mỗi lần, không phát lại được');
  // Go offline
  await sleep(2100);
  const off = await api(L, 'POST', '/api/online/off', {});
  await until(async () => { v = (await api(L, 'GET', '/api/online')).j; return v && !v.busy; }, 20000, 300);
  const cfPid = st.pid;
  const gone = await until(async () => !alive(cfPid) && L.st().running === false && !(await portOpen(P + 2)), 15000);
  ok(off.status === 202 && v.mode === 'off' && v.publicUrl === '' && gone, 'Go offline: mode off, publicUrl rỗng, cloudflared dừng, cổng ingress đóng');
  await stopLauncher(L);
}

tmps.filter(d => path.dirname(d) === os.tmpdir() && path.basename(d).startsWith('gci-')).forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* bỏ qua */ } });
console.log('   ' + (failn ? '✗' : '✓') + ' test-ingress: ' + passn + ' ✓ · ' + failn + ' ✗');
process.exit(failn ? 1 : 0);
