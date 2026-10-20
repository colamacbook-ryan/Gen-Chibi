// gen-chibi — lớp "edge của app" cho từng request (v0.21, spec §3.1 / §3.4, CNS-192 / 198)
// © 2026 Gen Labs — All rights reserved.
//
// Hai edge do app điều khiển; chỉ dùng cho TRẦN TẦN SUẤT + CHẨN ĐOÁN, KHÔNG cấp quyền (CNS-191):
//   - cloudflared: request đến trên CỔNG NGHE RIÊNG 127.0.0.1:<GC_PORT+2> (chỉ cloudflared dùng) → req.gcEdge = 'tunnel',
//     IP khách = Cf-Connecting-Ip — CHỈ trên socket đó (cổng chính: header này do client gửi, không tin).
//   - Caddy (container gen-chibi-edge): header X-GC-Edge khớp bí mật trong edge/edge-secret (0600, so sánh hằng thời gian) → req.gcEdge = 'caddy',
//     IP khách = mục CUỐI của X-Forwarded-For (Caddy thay XFF của client không tin bằng IP thật — peer luôn là container Caddy).
//   - Còn lại: không gắn gì (P1 tự quyết IP theo peer / chế độ proxy).
// Header X-GC-Edge luôn bị gỡ khỏi request sau khi xét → bí mật không trôi xuống handler / log.
// Cổng nghe riêng chỉ mở khi tunnel bật (run/edge-intent.json tunnel = token | quick): không giành cổng của dịch vụ khác khi không cần.
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');

const MIN_SECRET = 32;
function safeEq(x, y) {
  const a = Buffer.from(String(x)), b = Buffer.from(String(y));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const ipOnly = v => { const s = String(v || '').trim(); return net.isIP(s) ? s : ''; };
function lastXff(v) { const parts = String(v || '').split(','); return ipOnly(parts[parts.length - 1]); }
function peerOf(req) { return String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, ''); }

function createEdge({ edgeDir }) {
  const file = path.join(edgeDir, 'edge-secret');
  let memo = null;   // đọc lại chỉ khi tệp đổi (mtime + cỡ) — mark() chạy mỗi request (L-42)
  function secret() {
    let st = null; try { st = fs.statSync(file); } catch (e) { memo = null; return ''; }
    const key = st.mtimeMs + ':' + st.size;
    if (!memo || memo.key !== key) { let v = ''; try { v = fs.readFileSync(file, 'utf8').trim(); } catch (e) { v = ''; } memo = { key, val: v.length >= MIN_SECRET ? v : '' }; }
    return memo.val;
  }
  // sinh bí mật khi bật Caddy (một lần; đã có thì giữ — Caddy đọc tệp mỗi request qua {file.*}, đổi bí mật không cần reload)
  function ensureSecret() {
    if (secret()) return false;
    fs.mkdirSync(edgeDir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, crypto.randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, file);
    memo = null;
    return true;
  }
  // via: 'tunnel' (socket cổng riêng) | 'main'
  function mark(req, via) {
    const h = req.headers || {};
    const given = h['x-gc-edge'];
    delete h['x-gc-edge'];
    if (via === 'tunnel') { req.gcEdge = 'tunnel'; req.gcIp = ipOnly(h['cf-connecting-ip']) || peerOf(req); return req; }
    if (typeof given === 'string' && given) {
      const s = secret();
      if (s && safeEq(given, s)) { req.gcEdge = 'caddy'; req.gcIp = lastXff(h['x-forwarded-for']) || peerOf(req); }
    }
    return req;
  }
  return { file, secret, ensureSecret, mark };
}

// cổng nghe riêng cho cloudflared: 127.0.0.1 (kể cả trong Docker — cloudflared chạy cùng container, cổng không publish). Bận → ghi log, app vẫn chạy
function createTunnelListener({ port, handler, log }) {
  const srv = require('http').createServer(handler);
  let want = false, busy = false;
  srv.on('error', e => { busy = false; log('[edge] cannot listen on 127.0.0.1:' + port + ' for cloudflared: ' + (e.code || e.message)); });
  srv.on('listening', () => { busy = false; if (!want) srv.close(); });
  function set(on) {
    want = !!on;
    if (want && !srv.listening && !busy) { busy = true; srv.listen(port, '127.0.0.1'); }
    else if (!want && srv.listening) srv.close();
  }
  return { port, set, listening: () => srv.listening, server: srv };
}

module.exports = { createEdge, createTunnelListener, lastXff, safeEq };
