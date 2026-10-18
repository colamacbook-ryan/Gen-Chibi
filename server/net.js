// gen-chibi — kết nối HTTPS có hỗ trợ proxy (HTTPS_PROXY / NO_PROXY), không dùng thư viện ngoài.
// © 2026 Gen Labs — All rights reserved.
// Node 22 không tự đọc biến proxy; người dùng sau proxy công ty sẽ không cập nhật hay gọi LLM được nếu thiếu phần này.
'use strict';
const http = require('http');
const https = require('https');
const tls = require('tls');

function proxyUrl() { return process.env.HTTPS_PROXY || process.env.https_proxy || ''; }
function noProxy(host) {
  const list = String(process.env.NO_PROXY || process.env.no_proxy || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  host = String(host).toLowerCase();
  if (/^(localhost|127\.|::1$)/.test(host)) return true;
  return list.some(e => {
    if (e === '*') return true;
    if (/\/\d+$/.test(e)) return false;                      // bỏ qua dải CIDR (đã xử lý địa chỉ cục bộ ở trên)
    const d = e.replace(/^\*?\./, '');
    return host === d || host.endsWith('.' + d);
  });
}

class TunnelAgent extends https.Agent {
  constructor(proxy) { super({ keepAlive: false }); this.proxy = new URL(proxy); }
  createConnection(opts, cb) {
    const target = opts.host + ':' + (opts.port || 443);
    const headers = { Host: target };
    if (this.proxy.username) headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(decodeURIComponent(this.proxy.username) + ':' + decodeURIComponent(this.proxy.password)).toString('base64');
    const req = http.request({ host: this.proxy.hostname, port: this.proxy.port || 80, method: 'CONNECT', path: target, headers });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return cb(new Error('proxy từ chối kết nối tới ' + opts.host + ' (' + res.statusCode + ')')); }
      cb(null, tls.connect({ socket, servername: opts.servername || opts.host }));
    });
    req.on('error', cb);
    req.end();
  }
}

let cached = null;
// Agent cho một URL https: qua proxy nếu có HTTPS_PROXY và host không nằm trong NO_PROXY
function agentFor(url) {
  const u = new URL(url);
  const p = proxyUrl();
  if (u.protocol !== 'https:' || !p || noProxy(u.hostname)) return undefined;
  if (!cached || cached.proxy.href !== new URL(p).href) cached = new TunnelAgent(p);
  return cached;
}

module.exports = { agentFor, noProxy };
