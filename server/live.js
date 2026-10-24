// gen-chibi — Sân khấu sống (Agent Live Stage, INT-21): nhận sự kiện của agent → làm sạch → phát qua SSE cho Studio.
// © 2026 Gen Labs — All rights reserved.
//   POST /api/live/event   quyền chủ (S / T) HOẶC token live của bản cài (data/live-token, chỉ mở đúng đường này — hooks của Claude Code dùng)
//   GET  /api/live/stream  SSE (chỉ chủ; quyền kiểm lại mỗi nhịp) · GET /api/live/info (token live + lệnh genchibi live hook) · POST /api/live/token (đổi token)
//   Studio KHÔNG phát dòng lệnh hook dạng JSON: container (bản Docker) không được quyết định lệnh chạy trên máy chủ — chỉ lệnh CLI đã kiểm (v0.23.1)
//   MCP: tool live_event (agent không phải Claude Code) → cùng accept()
// Riêng tư: nhãn đi qua engine/live.js redact() (không đường dẫn / lệnh / bí mật / email / chuỗi dài); server không ghi nhãn vào log, không lưu đĩa.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RING = 300, CLIENTS_MAX = 8;
const RATE = { cap: 60, perSec: 10 };          // mỗi kênh: dồn tối đa 60 sự kiện, hồi 10 / giây (Claude Code đọc 20 tệp trong 2 s vẫn lọt)

function sha(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
function tokKeyOf(t) { return 'live:' + sha(t).slice(0, 12); }
function safeEq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

class LiveHub {
  constructor({ dir, engine, log, now, pingMs }) {
    this.dir = dir; this.L = engine.live; this.log = log || (() => {}); this.now = now || Date.now;
    this.file = path.join(dir, 'live-token');
    this.ring = []; this.seq = 0; this.clients = new Set(); this.buckets = new Map();
    this.lastTask = new Map();   // việc hiện hành THEO KÊNH (token live / từng agent / MCP / chủ) — kênh này không làm "cùng việc" của kênh khác
    this.agentsFile = path.join(dir, 'live-agents.json'); this.agents = this.loadAgents(); this.flushT = null;
    this.tok = this.loadToken();
    // nhịp giữ kết nối + KIỂM LẠI QUYỀN: phiên đã đăng xuất / bị thu hồi → đóng luồng (người xem không nghe tiếp sau khi mất quyền)
    this.beat = setInterval(() => this.clients.forEach(c => {
      try { if (c.alive && !c.alive()) { this.clients.delete(c); c.res.end(); return; } c.res.write(': ping\n\n'); } catch (e) { this.clients.delete(c); }
    }), pingMs > 0 ? pingMs : 15000);
    this.beat.unref();
  }
  loadToken() {
    try { const t = fs.readFileSync(this.file, 'utf8').trim(); if (/^gcl_[A-Za-z0-9_-]{32,}$/.test(t)) { this.tok = t; this.tokKey = tokKeyOf(t); return t; } } catch (e) { /* chưa có */ }
    return this.rotate();
  }
  // ---- token RIÊNG cho từng agent (live_setup): chỉ lưu băm SHA-256; liệt kê / thu hồi ở Studio › Sân khấu Live; mỗi token một bình tần suất
  loadAgents() { try { const j = JSON.parse(fs.readFileSync(this.agentsFile, 'utf8')); return Array.isArray(j) ? j.filter(a => a && /^[a-f0-9]{16}$/.test(a.id) && /^[a-f0-9]{64}$/.test(a.hash)) : []; } catch (e) { return []; } }
  saveAgents() { const tmp = this.agentsFile + '.tmp-' + process.pid; fs.writeFileSync(tmp, JSON.stringify(this.agents, null, 1), { mode: 0o600 }); fs.renameSync(tmp, this.agentsFile); }
  createAgent(name) {
    const t = 'gcl_' + crypto.randomBytes(32).toString('base64url'), id = crypto.randomBytes(8).toString('hex');
    const nm = String(name || 'agent').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 40) || 'agent';
    this.agents.push({ id, name: nm, hash: sha(t), created: new Date(this.now()).toISOString(), last: null, revoked: false });
    this.agents = this.agents.filter(a => !a.revoked).slice(-50).concat(this.agents.filter(a => a.revoked).slice(-50));   // trần 50 đang dùng + 50 đã thu hồi (sổ)
    this.saveAgents();
    return { id, token: t, name: nm };
  }
  listAgents() { return this.agents.map(a => ({ id: a.id, name: a.name, created: a.created, last: a.last, revoked: !!a.revoked })); }
  revokeAgent(id) { const a = this.agents.find(x => x.id === id && !x.revoked); if (!a) return false; a.revoked = true; a.revokedAt = new Date(this.now()).toISOString(); this.saveAgents(); this.lastTask.delete('agent:' + id); this.buckets.delete('agent:' + id); return true; }
  // kênh của token trong request: 'live' (token của bản cài) · 'agent:<id>' (token của một agent) · null
  tokenWho(req) {
    const h = String(req.headers.authorization || ''), m = /^Bearer\s+(gcl_[A-Za-z0-9_-]{32,})$/.exec(h);
    const t = m ? m[1] : String(req.headers['x-gc-live-token'] || '');
    if (!/^gcl_[A-Za-z0-9_-]{32,}$/.test(t)) return null;
    if (safeEq(t, this.tok)) return 'live';
    const hh = sha(t), a = this.agents.find(x => !x.revoked && safeEq(x.hash, hh));
    return a ? 'agent:' + a.id : null;
  }
  rotate() {
    const t = 'gcl_' + crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(this.file, t + '\n', { mode: 0o600 });
    try { fs.chmodSync(this.file, 0o600); } catch (e) { /* hệ tệp không hỗ trợ */ }
    this.tok = t; this.tokKey = tokKeyOf(t);   // trần tần suất RIÊNG theo token (đổi token = bình mới)
    return t;
  }
  token() { return this.tok; }
  // token live trong Authorization: Bearer gcl_… hoặc X-GC-Live-Token
  tokenOk(req) { return !!this.tokenWho(req); }
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
    const chan = who === 'live' ? this.tokKey : who || 'owner', w = this.gate(chan);
    if (w) return { error: 'too many live events — slow down', code: 429, retry: w };
    const now = this.now(), c = this.L.cleanEvent(raw, now);
    if (!c.ev) return { error: c.error, code: 400 };
    // cùng việc (theo KÊNH) → không làm gì; cùng việc mà đổi tiêu đề → phát "retitle" (chip cập nhật, không nhịp mới). Phiên mới / kết thúc → quên việc
    if (c.ev.kind === 'session_start' || c.ev.kind === 'stop') this.lastTask.delete(chan);
    if (c.ev.kind === 'task') {
      const lt = this.lastTask.get(chan);
      if (lt && lt.task === c.ev.task) { if (lt.title === c.ev.title) return { same: true }; c.ev.retitle = true; }
      this.lastTask.set(chan, { task: c.ev.task, title: c.ev.title });
    }
    if (/^agent:/.test(String(who))) { const a = this.agents.find(x => 'agent:' + x.id === who); if (a) { a.last = new Date(now).toISOString(); this.flushSoon(); } }
    const ev = Object.assign({ id: ++this.seq, ts: now, via: who === 'live' ? 'hook' : /^agent:/.test(String(who)) ? 'agent' : who === 'mcp' ? 'mcp' : 'owner' }, c.ev);
    this.ring.push(ev); if (this.ring.length > RING) this.ring.shift();
    const frame = 'id: ' + ev.id + '\nevent: live\ndata: ' + JSON.stringify(ev) + '\n\n';
    // người xem đã mất quyền (đăng xuất / thu hồi) KHÔNG nhận sự kiện kế — kiểm ngay lúc phát, không đợi nhịp ping
    this.clients.forEach(c => { try { if (c.alive && !c.alive()) { this.clients.delete(c); c.res.end(); return; } c.res.write(frame); } catch (e) { this.clients.delete(c); } });
    return { ev };
  }
  flushSoon() { if (this.flushT) return; this.flushT = setTimeout(() => { this.flushT = null; try { this.saveAgents(); } catch (e) { this.log('[live] could not save live-agents.json: ' + e.message); } }, 5000); this.flushT.unref(); }
  recent(since) { return this.ring.filter(e => e.id > (since || 0)); }
  // SSE: gửi bù sự kiện sau since (Last-Event-ID / ?since=), rồi phát tiếp. Tối đa 8 người xem cùng lúc
  // alive(): quyền của người xem còn không (main.js: auth.ownerOf(req)) — kiểm ở mỗi nhịp
  stream(req, res, since, alive) {
    if (this.clients.size >= CLIENTS_MAX) { res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '5' }); return res.end(JSON.stringify({ error: 'too many live viewers (max ' + CLIENTS_MAX + ')' })); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    this.recent(since).forEach(ev => res.write('id: ' + ev.id + '\nevent: live\ndata: ' + JSON.stringify(ev) + '\n\n'));
    const c = { res, alive };
    this.clients.add(c);
    const done = () => this.clients.delete(c);
    req.on('close', done); res.on('close', done); res.on('error', done);
  }
  close() { clearInterval(this.beat); if (this.flushT) { clearTimeout(this.flushT); this.flushT = null; try { this.saveAgents(); } catch (e) { /* bỏ qua */ } } this.clients.forEach(c => { try { c.res.end(); } catch (e) { /* bỏ qua */ } }); this.clients.clear(); }
}

module.exports = { LiveHub, RATE, CLIENTS_MAX };
