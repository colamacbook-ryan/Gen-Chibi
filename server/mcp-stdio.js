#!/usr/bin/env node
// gen-chibi — cầu stdio cho MCP: agent (Claude Code, Claude Desktop…) nói JSON-RPC qua stdin/stdout,
// cầu chuyển tiếp từng thông điệp vào http://127.0.0.1:<cổng>/mcp của bản đang chạy.
// © 2026 Afi Labs — All rights reserved.
// Dùng: `genchibi mcp`  (hoặc: node <thư mục cài>/current/server/mcp-stdio.js)
'use strict';
const http = require('http');
const readline = require('readline');

const PORT = +(process.env.GC_PORT || 7480);
const TOKEN = process.env.GC_API_TOKEN || '';

function post(line) {
  return new Promise(resolve => {
    const data = Buffer.from(line);
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': data.length, Host: '127.0.0.1:' + PORT };
    if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/mcp', method: 'POST', headers, timeout: 120000 }, res => {
      let s = '';
      res.on('data', c => (s += c));
      res.on('end', () => resolve(res.statusCode === 202 ? '' : s));
    });
    req.on('error', e => {
      let id = null; try { id = JSON.parse(line).id; } catch { /* bỏ qua */ }
      resolve(id === null || id === undefined ? '' : JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'gen-chibi chưa chạy ở cổng ' + PORT + ' (' + e.message + '). Chạy: genchibi start' } }));
    });
    req.write(data);
    req.end();
  });
}

const rl = readline.createInterface({ input: process.stdin });
let chain = Promise.resolve();
rl.on('line', line => {
  if (!line.trim()) return;
  chain = chain.then(() => post(line)).then(out => { if (out) process.stdout.write(out.replace(/\n/g, '') + '\n'); });
});
rl.on('close', () => chain.then(() => process.exit(0)));
