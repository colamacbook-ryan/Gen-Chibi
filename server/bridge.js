// gen-chibi — phía APP của cầu nối CLI (v0.26, spec v025-cli-bridge §5, INT-22). © 2026 Gen Labs — All rights reserved.
// Cầu nối (bridge/ai-bridge.mjs, chạy trên MÁY CHỦ) gọi RA app — app không bao giờ gọi vào máy chủ:
//   POST /api/ai/bridge/pair           genchibi (token chủ, request local) xin bridge token gcb_ + bí mật HMAC — trả MỘT lần; app lưu băm token, bí mật trong secrets
//   POST /api/ai/bridge/hello          { proto, bridge_version, registry } — lệch proto → 409 UPGRADE
//   GET  /api/ai/bridge/next?wait=25   long-poll + nhịp sống (online nếu có poll trong 60 s). Job ký HMAC (envelope { id, job, gcj, exp, sig })
//   POST /api/ai/bridge/jobs/<id>/events { phase: started | beat | text | done | error } ≤ 16 KB → { cancel }
// Mọi đường /api/ai/bridge/* CHỈ nhận request local (không edge / tunnel / link) và CHỈ bridge token (trừ pair) — main.js chặn trước khi tới đây.
// Token lượt gcj_ (D9): chỉ hợp lệ từ lúc cầu nối báo started tới trần lượt + 30 s, thu hồi ngay khi huỷ / xong; ctx MCP { channel: 'ui', zone, readOnly, liveChan }
// → cổng khu ở mcp.callTool (CNS-302). Trần theo token: 60 lần gọi / 30 lần ghi (CNS-313) — vượt → [LIMIT]. App không bao giờ trả WWW-Authenticate cho gcj_ (CNS-303).
// Pairing gắn install-id: khôi phục sao lưu sang máy khác / install-id mới → pairing bị xoá, cầu nối nhận 401 (CNS-306).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROTO = 1;
const ZONES = ['xuong', 'khung', 'thu-vien', 'tao-tac', 'he-thong'];
const CLIS = ['agy', 'claude'];
const TOKEN_CAPS = { toolCalls: 60, writes: 30 };
const ONLINE_MS = 60e3, BEAT_DEAD_MS = 30e3, QUEUE_MS = 10 * 60e3;
// mã lỗi → câu cho người dùng (msgid tiếng Việt, dịch ở rìa). Dự phòng API key chỉ với các mã ở FALLBACK (D11) và chỉ khi token lượt CHƯA ghi lần nào (CNS-312)
const CODE_MSG = {
  BRIDGE_OFFLINE: 'Cầu nối CLI đang tắt — chạy `genchibi ai bridge start` trên máy chủ',
  UPGRADE: 'Cầu nối CLI khác giao thức với app — chạy `genchibi update` rồi `genchibi ai bridge install` trên máy chủ',
  NOT_INSTALLED: 'Chưa cài cầu nối CLI — chạy `genchibi ai bridge install` trên máy chủ',
  NOT_ENABLED: 'CLI này chưa được bật trên máy chủ — chạy `genchibi ai bridge enable <cli>`',
  AUTH_REQUIRED: 'CLI chưa đăng nhập — chạy `genchibi ai bridge login <cli>` trên máy chủ',
  QUOTA: 'CLI báo hết lượt / quota của gói',
  TIMEOUT: 'Lượt AI quá thời gian cho phép',
  CONFINEMENT: 'Khoá của CLI chưa đạt — lượt bị chặn',
  NO_SANDBOX: 'Máy chủ chưa có bubblewrap / user namespace — CLI cần hộp cát để chạy',
  RATE_CAP: 'Đã chạm trần số lượt mỗi giờ của cầu nối',
  BUSY: 'Cầu nối đang bận (đủ hàng đợi) — đợi lượt trước xong',
  CANCELLED: 'Đã huỷ lượt AI',
  BAD_JOB: 'Cầu nối từ chối lượt (dữ liệu lượt không hợp lệ)',
  CLI_ERROR: 'CLI trả lỗi'
};
const FALLBACK = new Set(['BRIDGE_OFFLINE', 'NOT_INSTALLED', 'NOT_ENABLED', 'UPGRADE', 'AUTH_REQUIRED', 'QUOTA', 'CONFINEMENT', 'NO_SANDBOX']);
const HTTP_OF = { BRIDGE_OFFLINE: 503, UPGRADE: 503, NOT_INSTALLED: 503, NOT_ENABLED: 409, AUTH_REQUIRED: 503, QUOTA: 429, TIMEOUT: 504, CONFINEMENT: 409, NO_SANDBOX: 409, RATE_CAP: 429, BUSY: 429, CANCELLED: 409, BAD_JOB: 400, CLI_ERROR: 502 };

// JSON chuẩn tắc — CÙNG thuật toán với bridge/ai-bridge.mjs canon() (test so chéo)
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rid = n => crypto.randomBytes(n).toString('base64url');
const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function bridgeError(code, extra) { const e = new Error(CODE_MSG[code] || code); e.code = HTTP_OF[code] || 502; e.bridgeCode = code; if (extra) e.detail = String(extra).slice(0, 300); return e; }

// registry công khai do cầu nối gửi (hello) — chỉ giữ trường đã biết, đúng kiểu, có trần (container hiển thị, không tin để quyết gì ở máy chủ)
function cleanRegistry(r) {
  const out = { clis: {}, caps: {} }, s = (x, n) => (typeof x === 'string' ? x.slice(0, n) : ''), list = (x, n, m) => (Array.isArray(x) ? x.filter(v => typeof v === 'string').slice(0, n).map(v => v.slice(0, m)) : []);
  const cl = r && r.clis && typeof r.clis === 'object' ? r.clis : {};
  CLIS.forEach(n => {
    const c = cl[n]; if (!c || typeof c !== 'object') return;
    out.clis[n] = { label: s(c.label, 40), installed: c.installed === true, version: s(c.version, 80), login: s(c.login, 20), sandbox: s(c.sandbox, 20), selftest: c.selftest === true ? true : c.selftest === false ? false : null,
      confinement: ['verified', 'unverified', 'failed'].includes(c.confinement) ? c.confinement : 'unverified', missing: list(c.missing, 8, 160), evidence: list(c.evidence, 12, 160),
      at: s(c.at, 40) || null, probed_at: s(c.probed_at, 40) || null, enabled: c.enabled === true, models: list(c.models, 40, 80), modelsConfidence: s(c.modelsConfidence, 20) || null,
      authMode: c.authMode === 'key' || c.authMode === 'oauth' ? c.authMode : null, broadScope: c.broadScope === true };
  });
  const cp = r && r.caps && typeof r.caps === 'object' ? r.caps : {};
  ['turnSec', 'perHour', 'concurrent', 'queue', 'toolCalls', 'writes'].forEach(k => { if (Number.isFinite(cp[k]) && cp[k] >= 0 && cp[k] <= 100000) out.caps[k] = Math.round(cp[k]); });
  return out;
}

function createBridge(o) {
  const file = path.join(o.dataDir, 'ai-bridge.json'), now = o.now || Date.now, log = o.log || (() => {});
  const secrets = o.secrets, installId = o.installId || (() => '');
  let st = null;            // { installId, tokenHash, pairedAt, hello: { proto, bridge_version, registry, at } }
  let lastPoll = 0;
  const waiters = new Set(), queue = [], jobs = new Map(), tokens = new Map();
  let controls = [];
  const read = () => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j.tokenHash === 'string' ? j : null; } catch (e) { return null; } };
  const write = v => { const t = file + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1) + '\n', { mode: 0o600 }); fs.renameSync(t, file); };
  st = read();
  function unpair(why) {
    if (st) log('[bridge] pairing removed: ' + why);
    st = null; try { fs.rmSync(file, { force: true }); } catch (e) { /* không có */ }
    try { secrets.set('bridge.hmac', ''); } catch (e) { /* bỏ */ }
    for (const j of jobs.values()) finish(j, bridgeError('NOT_INSTALLED'));
  }
  // pairing gắn install-id của bản cài (khôi phục sao lưu sang máy khác → install-id mới → pairing cũ vô hiệu)
  function paired() {
    if (!st) return false;
    let id = ''; try { id = installId() || ''; } catch (e) { id = ''; }
    if (st.installId !== id) { unpair('install-id changed (restore / new machine)'); return false; }
    return true;
  }
  function pair() {
    let id = ''; try { id = installId() || ''; } catch (e) { id = ''; }
    const token = 'gcb_' + rid(32), secret = crypto.randomBytes(32).toString('hex');
    for (const j of jobs.values()) finish(j, bridgeError('NOT_INSTALLED'));
    secrets.set('bridge.hmac', secret);
    st = { installId: id, tokenHash: sha(token), pairedAt: new Date(now()).toISOString(), hello: null };
    write(st);
    log('[bridge] paired a new CLI bridge');
    return { token, secret, proto: PROTO, installId: id };
  }
  const authOk = bearer => typeof bearer === 'string' && /^gcb_[A-Za-z0-9_-]{32,64}$/.test(bearer) && paired() && sameHash(sha(bearer), st.tokenHash);
  function hello(b) {
    b = b && typeof b === 'object' ? b : {};
    if (b.proto !== PROTO) { log('[bridge] protocol mismatch (bridge ' + JSON.stringify(b.proto) + ', app ' + PROTO + ')'); st.hello = { proto: Number.isFinite(b.proto) ? b.proto : null, bridge_version: String(b.bridge_version || '').slice(0, 40), registry: { clis: {}, caps: {} }, at: new Date(now()).toISOString(), upgrade: true }; write(st); return { status: 409, body: { code: 'UPGRADE', error: CODE_MSG.UPGRADE, proto: PROTO } }; }
    st.hello = { proto: PROTO, bridge_version: String(b.bridge_version || '').slice(0, 40), registry: cleanRegistry(b.registry), at: new Date(now()).toISOString() };
    write(st); lastPoll = now();
    return { status: 200, body: { ok: true, proto: PROTO } };
  }
  const online = () => !!st && now() - lastPoll < ONLINE_MS;
  const reg = () => (st && st.hello && st.hello.registry) || { clis: {}, caps: {} };
  const hostCaps = () => Object.assign({ turnSec: 900, perHour: 100, queue: 3, toolCalls: TOKEN_CAPS.toolCalls, writes: TOKEN_CAPS.writes }, reg().caps);
  function status() {
    const p = paired(), h = p && st.hello;
    return { paired: p, online: p && online(), lastPoll: lastPoll ? new Date(lastPoll).toISOString() : null, version: h ? h.bridge_version : '', proto: h ? h.proto : null, appProto: PROTO, upgrade: !!(h && h.upgrade),
      clis: p ? reg().clis : {}, caps: hostCaps(), queued: queue.length, running: [...jobs.values()].filter(j => j.status === 'running').length };
  }
  // CLI dùng được = cầu nối online + CLI đã bật trên máy chủ + khoá Đạt (Studio chỉ chọn trong danh sách này — D5)
  function ready(cli) { const s = status(), c = s.clis[cli]; return !!(s.online && !s.upgrade && c && c.enabled && c.confinement === 'verified'); }

  /* ---- long-poll */
  function flush() {
    while (waiters.size && (queue.length || controls.length)) {
      const w = waiters.values().next().value; waiters.delete(w); clearTimeout(w.timer);
      if (controls.length) { w.send(200, { control: controls.shift() }); continue; }
      const j = queue.shift(); j.status = 'sent'; j.sentAt = now();
      w.send(200, { envelope: j.envelope });
    }
  }
  function next(res, waitSec, send) {
    lastPoll = now();
    const w = { send: (code, body) => { if (w.done) return; w.done = true; if (code === 204) { res.writeHead(204); res.end(); } else send(res, code, body); }, timer: null, done: false };
    w.timer = setTimeout(() => { waiters.delete(w); lastPoll = now(); w.send(204); }, Math.max(0, Math.min(25, waitSec | 0)) * 1000);
    res.on('close', () => { waiters.delete(w); clearTimeout(w.timer); w.done = true; });
    waiters.add(w); flush();
  }
  function signed(p) { const secret = secrets.get('bridge.hmac'); if (!/^[0-9a-f]{64}$/.test(secret)) throw bridgeError('NOT_INSTALLED'); return Object.assign({}, p, { sig: crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(canon(p)).digest('hex') }); }
  // lệnh điều khiển từ Studio (Quét lại / Kiểm tra khoá): cũng ký HMAC — cầu nối tự giới hạn tần suất
  function control(kind, cli) {
    if (!paired()) throw bridgeError('NOT_INSTALLED');
    if (!online()) throw bridgeError('BRIDGE_OFFLINE');
    if (!['probe', 'verify'].includes(kind) || (cli && !CLIS.includes(cli))) throw Object.assign(new Error('lệnh không hợp lệ'), { code: 400 });
    controls = controls.filter(c => !(c.control === kind && c.cli === (cli || ''))).slice(-3);
    controls.push(signed({ id: rid(9), control: kind, cli: cli || '', exp: now() + 120e3 }));
    flush();
    return { queued: true };
  }

  /* ---- job */
  function finish(j, err, val) {
    if (j.done) return; j.done = true; j.status = err ? 'error' : 'done';
    const t = tokens.get(j.gcj); if (t) t.revoked = true;
    setTimeout(() => tokens.delete(j.gcj), 60e3).unref();
    const qi = queue.indexOf(j); if (qi >= 0) queue.splice(qi, 1);
    jobs.delete(j.id);
    if (err) j.reject(err); else j.resolve(val);
  }
  // job: { kind, cli, model, system, context, messages, zone, readOnly } · opt: { caps (Studio, chỉ hạ), liveChan }
  function createJob(job, opt) {
    opt = opt || {};
    if (!paired()) throw bridgeError('NOT_INSTALLED');
    const s = status();
    if (s.upgrade) throw bridgeError('UPGRADE');
    if (!s.online) throw bridgeError('BRIDGE_OFFLINE');
    const c = s.clis[job.cli];
    if (!c || !c.enabled) throw bridgeError('NOT_ENABLED');
    if (c.confinement !== 'verified') throw bridgeError(c.sandbox && c.sandbox !== 'ok' ? 'NO_SANDBOX' : 'CONFINEMENT', (c.missing || []).join('; '));
    const host = hostCaps();
    if (queue.length >= Math.max(1, host.queue || 3) + 1 || jobs.size >= Math.max(1, host.queue || 3) + 1) throw bridgeError('BUSY');
    const sc = opt.caps && typeof opt.caps === 'object' ? opt.caps : {};
    const caps = { turnSec: Math.min(host.turnSec, Number.isFinite(sc.turnSec) && sc.turnSec > 0 ? sc.turnSec : Infinity), toolCalls: Math.min(host.toolCalls, TOKEN_CAPS.toolCalls), writes: Math.min(host.writes, TOKEN_CAPS.writes) };
    const id = rid(12), gcj = 'gcj_' + rid(32);
    const body = { kind: job.kind, cli: job.cli, model: job.model || '', system: String(job.system || ''), context: String(job.context || ''), messages: job.messages, zone: job.zone || '', readOnly: !!job.readOnly, caps: { turnSec: caps.turnSec } };
    const envelope = signed({ id, job: body, gcj, exp: now() + QUEUE_MS + caps.turnSec * 1000 });
    const tok = { jobId: id, zone: body.zone, readOnly: body.readOnly, liveChan: opt.liveChan || '', active: false, revoked: false, exp: 0, calls: 0, writes: 0, caps, log: [], renders: [] };
    const j = { id, gcj, kind: body.kind, envelope, status: 'queued', at: now(), lastBeat: 0, done: false, cancelled: false, caps, tok, progress: { phase: 'queued', log: tok.log, text: '' } };
    j.promise = new Promise((res, rej) => { j.resolve = res; j.reject = rej; });
    j.promise.catch(() => {});
    jobs.set(id, j); tokens.set(gcj, tok); queue.push(j);
    flush();
    return { id, promise: j.promise, tok, cancel: () => cancel(id), progress: () => ({ phase: j.progress.phase, text: j.progress.text.slice(-4000), log: tok.log.slice(-30).map(l => ({ tool: l.tool, ok: l.ok, summary: l.summary })) }) };
  }
  function events(id, b) {
    const j = jobs.get(id);
    if (!j) return { status: 404, body: { error: 'no such job' } };
    b = b && typeof b === 'object' ? b : {};
    if (JSON.stringify(b).length > 16 * 1024) return { status: 413, body: { error: 'event too large' } };
    const ph = b.phase;
    // job complete (AI đạo diễn) KHÔNG có MCP: gcj của nó không bao giờ hoạt động
    if (ph === 'started') { j.status = 'running'; j.lastBeat = now(); j.tok.active = !j.cancelled && j.kind === 'agent'; j.tok.exp = now() + (j.caps.turnSec + 30) * 1000; j.progress.phase = 'running'; }
    else if (ph === 'beat') { j.lastBeat = now(); }
    else if (ph === 'text') { j.lastBeat = now(); if (typeof b.text === 'string') j.progress.text = b.text.slice(-8000); }
    else if (ph === 'done') finish(j, null, { text: typeof b.text === 'string' ? b.text.slice(0, 60000) : '' });
    else if (ph === 'error') { const code = typeof b.code === 'string' && /^[A-Z_]{2,30}$/.test(b.code) ? b.code : 'CLI_ERROR'; finish(j, bridgeError(CODE_MSG[code] ? code : 'CLI_ERROR', typeof b.detail === 'string' ? b.detail : '')); }
    else return { status: 400, body: { error: 'phase' } };
    lastPoll = now();
    return { status: 200, body: { cancel: !!j.cancelled } };
  }
  // huỷ: thu hồi gcj NGAY (MCP từ chối tức thì) + cờ huỷ (cầu nối đọc ở nhịp beat ≤ 2 s → SIGINT, 5 s sau SIGTERM)
  function cancel(id) {
    const j = jobs.get(id); if (!j) return false;
    j.cancelled = true; j.tok.revoked = true; j.tok.active = false;
    if (j.status === 'queued') finish(j, bridgeError('CANCELLED'));
    else setTimeout(() => finish(j, bridgeError('CANCELLED')), 8000).unref();
    return true;
  }
  // canh: cầu nối chết giữa lượt (không nhịp 30 s) → BRIDGE_OFFLINE; quá trần lượt + 60 s → TIMEOUT; nằm hàng quá lâu → BRIDGE_OFFLINE
  const watch = setInterval(() => {
    const t = now();
    for (const j of [...jobs.values()]) {
      if (j.status === 'running' && t - j.lastBeat > BEAT_DEAD_MS) finish(j, bridgeError('BRIDGE_OFFLINE', 'no heartbeat'));
      else if (j.status === 'running' && t - j.at > (j.caps.turnSec + 60) * 1000) finish(j, bridgeError('TIMEOUT'));
      else if ((j.status === 'queued' || j.status === 'sent') && t - j.at > (j.status === 'queued' ? 60e3 : 90e3) && !online()) finish(j, bridgeError('BRIDGE_OFFLINE'));
    }
  }, 2000);
  if (watch.unref) watch.unref();

  /* ---- MCP của token lượt */
  // ctx cho /mcp với bearer gcj_: null khi sai / hết hạn / đã thu hồi / chưa bắt đầu (main.js trả 403 JSON, KHÔNG WWW-Authenticate)
  function mcpCtx(bearer) {
    if (typeof bearer !== 'string' || !/^gcj_[A-Za-z0-9_-]{32,64}$/.test(bearer)) return null;
    const t = tokens.get(bearer);
    if (!t || t.revoked || !t.active || now() > t.exp) return null;
    return { channel: 'ui', zone: t.zone, readOnly: t.readOnly, liveChan: t.liveChan, local: true, conn: 'bridge', bridgeTok: t };
  }
  return { PROTO, pair, unpair, paired, authOk, hello, next, events, createJob, cancel, status, ready, mcpCtx, control, online, close: () => clearInterval(watch), _jobs: jobs, _tokens: tokens };
}

module.exports = { createBridge, canon, cleanRegistry, PROTO, CODE_MSG, FALLBACK, TOKEN_CAPS, bridgeError };
