// gen-chibi — Sân khấu sống (Agent Live Stage, INT-21): nhận sự kiện của agent → làm sạch → phát qua SSE cho Studio.
// © 2026 Gen Labs — All rights reserved.
//   POST /api/live/event   quyền chủ (S / T) HOẶC token live của bản cài (data/live-token, chỉ mở đúng đường này — hooks của Claude Code dùng)
//   GET  /api/live/stream  SSE (chỉ chủ) · GET /api/live/info (token live + đoạn cấu hình hooks) · POST /api/live/token (đổi token live)
//   MCP: tool live_event (agent không phải Claude Code) → cùng accept()
// Riêng tư: nhãn đi qua engine/live.js redact() (không đường dẫn / lệnh / bí mật / email / chuỗi dài); server không ghi nhãn vào log, không lưu đĩa.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RING = 300, CLIENTS_MAX = 8;
const RATE = { cap: 60, perSec: 10 };          // mỗi kênh: dồn tối đa 60 sự kiện, hồi 10 / giây (Claude Code đọc 20 tệp trong 2 s vẫn lọt)

function safeEq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

class LiveHub {
  constructor({ dir, engine, log, now }) {
    this.dir = dir; this.L = engine.live; this.log = log || (() => {}); this.now = now || Date.now;
    this.file = path.join(dir, 'live-token');
    this.ring = []; this.seq = 0; this.clients = new Set(); this.buckets = new Map();
    this.tok = this.loadToken();
    this.beat = setInterval(() => this.clients.forEach(c => { try { c.write(': ping\n\n'); } catch (e) { /* đã đóng */ } }), 15000);
    this.beat.unref();
  }
  loadToken() {
    try { const t = fs.readFileSync(this.file, 'utf8').trim(); if (/^gcl_[A-Za-z0-9_-]{32,}$/.test(t)) return t; } catch (e) { /* chưa có */ }
    return this.rotate();
  }
  rotate() {
    const t = 'gcl_' + crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(this.file, t + '\n', { mode: 0o600 });
    try { fs.chmodSync(this.file, 0o600); } catch (e) { /* hệ tệp không hỗ trợ */ }
    this.tok = t;
    return t;
  }
  token() { return this.tok; }
  // token live trong Authorization: Bearer gcl_… hoặc X-GC-Live-Token
  tokenOk(req) {
    const h = String(req.headers.authorization || ''), m = /^Bearer\s+(gcl_[A-Za-z0-9_-]{32,})$/.exec(h);
    const t = m ? m[1] : String(req.headers['x-gc-live-token'] || '');
    return !!t && safeEq(t, this.tok);
  }
  // giới hạn tốc độ theo kênh (token bucket) → 0 = được, > 0 = số giây phải chờ
  gate(key) {
    const now = this.now() / 1000;
    let b = this.buckets.get(key);
    if (!b) { b = { n: RATE.cap, at: now }; this.buckets.set(key, b); }
    b.n = Math.min(RATE.cap, b.n + (now - b.at) * RATE.perSec); b.at = now;
    if (b.n < 1) return Math.max(1, Math.ceil((1 - b.n) / RATE.perSec));
    b.n -= 1;
    return 0;
  }
  // sự kiện thô (không tin) → { ev } (đã làm sạch, có id + ts) | { error, code, retry }
  accept(raw, who) {
    const w = this.gate(who || 'owner');
    if (w) return { error: 'too many live events — slow down', code: 429, retry: w };
    const now = this.now(), c = this.L.cleanEvent(raw, now);
    if (!c.ev) return { error: c.error, code: 400 };
    const ev = Object.assign({ id: ++this.seq, ts: now, via: who === 'live' ? 'hook' : who === 'mcp' ? 'mcp' : 'owner' }, c.ev);
    this.ring.push(ev); if (this.ring.length > RING) this.ring.shift();
    const frame = 'id: ' + ev.id + '\nevent: live\ndata: ' + JSON.stringify(ev) + '\n\n';
    this.clients.forEach(res => { try { res.write(frame); } catch (e) { /* đã đóng */ } });
    return { ev };
  }
  recent(since) { return this.ring.filter(e => e.id > (since || 0)); }
  // SSE: gửi bù sự kiện sau since (Last-Event-ID / ?since=), rồi phát tiếp. Tối đa 8 người xem cùng lúc
  stream(req, res, since) {
    if (this.clients.size >= CLIENTS_MAX) { res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '5' }); return res.end(JSON.stringify({ error: 'too many live viewers (max ' + CLIENTS_MAX + ')' })); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    this.recent(since).forEach(ev => res.write('id: ' + ev.id + '\nevent: live\ndata: ' + JSON.stringify(ev) + '\n\n'));
    this.clients.add(res);
    const done = () => this.clients.delete(res);
    req.on('close', done); res.on('close', done); res.on('error', done);
  }
  // đoạn cấu hình cho ~/.claude/settings.json (chủ tự dán — app KHÔNG ghi vào ~/.claude)
  hookSnippet(appDir, url) {
    const q = x => "'" + String(x).replace(/'/g, "'\\''") + "'";   // trích dẫn shell (đường cài có dấu cách vẫn đúng)
    const cmd = 'GC_LIVE_URL=' + q(url) + ' GC_LIVE_TOKEN=' + this.tok + ' node ' + q(path.join(appDir, 'tools', 'live-hook.mjs'));
    const one = { hooks: [{ type: 'command', command: cmd, timeout: 2 }] };
    const evs = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'SessionEnd'];
    const hooks = {}; evs.forEach(e => { hooks[e] = [e === 'PreToolUse' || e === 'PostToolUse' ? Object.assign({ matcher: '*' }, one) : one]; });
    return { hooks };
  }
  close() { clearInterval(this.beat); this.clients.forEach(r => { try { r.end(); } catch (e) { /* bỏ qua */ } }); this.clients.clear(); }
}

module.exports = { LiveHub, RATE, CLIENTS_MAX };
