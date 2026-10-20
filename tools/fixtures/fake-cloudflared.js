#!/usr/bin/env node
// gen-chibi — cloudflared GIẢ cho tools/test-update.sh: không nối Cloudflare, chỉ diễn phần launcher cần thấy.
// © 2026 Gen Labs — All rights reserved.
// Launcher tải tệp này về <GC_HOME>/bin/cloudflared-test (kiểm SHA như binary thật) rồi chạy với argv thật.
//   - ghi <GC_HOME>/fake-cf-run.json: pid, argv, tên biến môi trường nhận được (test kiểm: không token / GC_* trong argv / env)
//   - token: đọc tệp --token-file như cloudflared thật (một lần), KHÔNG in nội dung · quick: in link *.trycloudflare.com giả
//   - mở /ready trên cổng --metrics: 200, trừ khi <GC_HOME>/fake-cf-notready chứa "*" hoặc đúng tên bản `current` đang trỏ tới → 503
//   - quick + tệp <GC_HOME>/fake-cf-proxy-port (một số cổng): đóng vai Cloudflare — nghe 127.0.0.1:<cổng đó>, chuyển mọi request tới --url
//     (cổng ingress của app) kèm Cf-Connecting-Ip giả, giữ Host (tools/test-ingress.mjs: bậc public / mcp đi qua đúng đường của tunnel)
//   - SIGTERM: thoát 0
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const HOME = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
fs.writeFileSync(path.join(HOME, 'fake-cf-run.json'), JSON.stringify({ pid: process.pid, argv, env: Object.keys(process.env) }));
if (argv.includes('run')) {
  const t = fs.readFileSync(arg('--token-file'), 'utf8');
  console.log(new Date().toISOString() + ' INF read the tunnel token file (' + t.trim().length + ' chars)');
}
if (arg('--url')) console.log(new Date().toISOString() + ' INF |  https://fake-' + process.pid + '.trycloudflare.com  |');
function notReady() {
  try {
    const w = fs.readFileSync(path.join(HOME, 'fake-cf-notready'), 'utf8').trim();
    return w === '*' || w === path.basename(fs.readlinkSync(path.join(HOME, 'current')));
  } catch { return false; }
}
const [host, port] = String(arg('--metrics')).split(':');
http.createServer((req, res) => {
  if (req.url !== '/ready') { res.writeHead(404); return res.end(); }
  const ok = !notReady();
  res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: ok ? 200 : 503, readyConnections: ok ? 4 : 0 }));
}).listen(+port, host, () => console.log(new Date().toISOString() + ' INF Starting metrics server on ' + host + ':' + port + '/metrics'));
let proxyPort = 0; try { proxyPort = +fs.readFileSync(path.join(HOME, 'fake-cf-proxy-port'), 'utf8').trim(); } catch { /* không đóng vai Cloudflare */ }
if (arg('--url') && proxyPort > 0) {
  const to = new URL(arg('--url'));
  http.createServer((req, res) => {
    const up = http.request({ host: to.hostname, port: to.port, method: req.method, path: req.url, headers: Object.assign({}, req.headers, { 'cf-connecting-ip': '198.51.100.77' }) }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end('bad gateway'); });
    req.pipe(up);
  }).listen(proxyPort, '127.0.0.1');
}
process.on('SIGTERM', () => { console.log(new Date().toISOString() + ' INF Initiating graceful shutdown due to signal terminated'); process.exit(0); });
