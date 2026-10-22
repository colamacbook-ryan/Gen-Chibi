#!/usr/bin/env node
// gen-chibi — cầu stdio cho MCP: agent (Claude Code, Claude Desktop…) nói JSON-RPC qua stdin/stdout,
// cầu chuyển tiếp từng thông điệp vào http://127.0.0.1:<cổng>/mcp của bản đang chạy.
// © 2026 Gen Labs — All rights reserved.
// Dùng: `genchibi mcp`  (hoặc: node <thư mục cài>/current/server/mcp-stdio.js)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PORT = +(process.env.GC_PORT || 7480);
// token chủ: GC_API_TOKEN (env) → data/owner-token của bản cài (v0.21: server tự sinh khi env trống — CNS-195 / 197; `docker compose exec` có GC_HOME=/install).
// Thư mục cài: GC_HOME → suy từ vị trí tệp (<cài>/releases/<bản>/server/…) như main.js. Đọc lại mỗi lần gọi khi chưa có (server có thể sinh tệp SAU khi cầu chạy)
const APP = path.resolve(__dirname, '..');
const HOME = process.env.GC_HOME || (path.basename(path.dirname(APP)) === 'releases' ? path.resolve(APP, '..', '..') : path.join(APP, '.home'));
let TOKEN = process.env.GC_API_TOKEN || '';
function token() {
  if (!TOKEN) { try { const t = fs.readFileSync(path.join(HOME, 'data', 'owner-token'), 'utf8').trim(); if (/^[A-Za-z0-9_-]{32,256}$/.test(t)) TOKEN = t; } catch (e) { /* chưa có tệp: gọi không token, server trả 401 */ } }
  return TOKEN;
}

function post(line) {
  return new Promise(resolve => {
    const data = Buffer.from(line);
    // X-GC-Bridge: chỉ là NHÃN kênh cho wizard bước 3 ("Agent … đã nối qua stdio") — không cấp quyền gì (quyền vẫn là token chủ)
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': data.length, Host: '127.0.0.1:' + PORT, 'X-GC-Bridge': 'stdio' };
    if (token()) headers.Authorization = 'Bearer ' + token();
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/mcp', method: 'POST', headers, timeout: 120000 }, res => {
      let s = '';
      res.on('data', c => (s += c));
      res.on('end', () => resolve(res.statusCode === 202 ? '' : s));
    });
    req.on('error', e => {
      let id = null; try { id = JSON.parse(line).id; } catch { /* bỏ qua */ }
      resolve(id === null || id === undefined ? '' : JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'gen-chibi is not running on port ' + PORT + ' (' + e.message + '). Run: genchibi start' } }));   // agent đọc → tiếng Anh (CNS-067)
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
