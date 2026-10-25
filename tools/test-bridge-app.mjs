// Kiểm phía APP của cầu nối CLI (v0.26, spec v025-cli-bridge §5, §9.8, §9.9 phần server). © 2026 Gen Labs — All rights reserved.
//  1) server/bridge.js: pair / install-id / proto / online / BUSY · JSON chuẩn tắc + HMAC khớp chéo với bridge/ai-bridge.mjs
//  2) server thật (main.js) + "cầu nối tay" (test gọi /api/ai/bridge/* như cầu nối): chỉ local, chỉ bridge token · job ký đúng · gcj: 403 không WWW-Authenticate,
//     tools/list theo khu, initialize.instructions rỗng, tool ngoài khu → FORBIDDEN, trần 60 gọi / 30 ghi · huỷ thu hồi gcj ngay · dự phòng API key chỉ khi chưa ghi ·
//     lệch proto → UPGRADE · đổi install-id → pairing bị xoá · AI đạo diễn = job complete · sự kiện studio-ai qua SSE cho đường CLI
//  3) có bubblewrap: cầu nối THẬT (serve) + fake-claude / fake-agy trong hộp cát → lượt dock từ đầu tới cuối
// Dùng: node tools/test-bridge-app.mjs   (cổng 7795 app, 7796 LLM giả)
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const B = await import(path.join(ROOT, 'bridge/ai-bridge.mjs'));
const SB = require(path.join(ROOT, 'server/bridge.js'));
let bad = 0;
const ok = (c, m, extra) => { if (c) console.log('   ✓ ' + m); else { bad = 1; console.log('   ✗ ' + m + (extra ? ' — ' + String(extra).slice(0, 700) : '')); } };
const kids = [], tmp = [];
process.on('exit', () => { kids.forEach(k => { try { k.kill(); } catch (e) { /* đã tắt */ } }); tmp.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* bỏ */ } }); });
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => process.exit(130));
const mk = p => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); fs.chmodSync(d, 0o700); tmp.push(d); return d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); for (;;) { const v = await f(); if (v || Date.now() - t > ms) return v; await sleep(60); } };

/* ---------------------------------------------------------------- 1. server/bridge.js */
{
  const D = mk('gc-tba-u-'), store = {}, secrets = { get: k => store[k] || '', set: (k, v) => { if (v) store[k] = v; else delete store[k]; } };
  let T = 1e12, iid = 'a'.repeat(32);
  const br = SB.createBridge({ dataDir: D, secrets, installId: () => iid, now: () => T });
  const p = br.pair();
  const fileTxt = fs.readFileSync(path.join(D, 'ai-bridge.json'), 'utf8');
  ok(/^gcb_[A-Za-z0-9_-]{43}$/.test(p.token) && /^[0-9a-f]{64}$/.test(p.secret) && br.authOk(p.token) && !br.authOk('gcb_' + 'x'.repeat(43)) && !fileTxt.includes(p.token) && !fileTxt.includes(p.secret) && store['bridge.hmac'] === p.secret,
    'pair: bridge token gcb_ + bí mật HMAC trả MỘT lần · app chỉ lưu băm token (data/ai-bridge.json), bí mật trong secrets');
  const h1 = br.hello({ proto: 2, bridge_version: '9.9', registry: {} });
  const h2 = br.hello({ proto: 1, bridge_version: '0.26.0', registry: { clis: { claude: { installed: true, confinement: 'verified', enabled: true, sandbox: 'ok', models: ['sonnet'], evil: 'x' }, codex: { confinement: 'verified' } }, caps: { turnSec: 900, perHour: 100, queue: 1, toolCalls: 60, writes: 30 } } });
  const st = br.status();
  ok(h1.status === 409 && h1.body.code === 'UPGRADE' && h2.status === 200 && st.online && st.clis.claude.confinement === 'verified' && !('evil' in st.clis.claude) && !st.clis.codex && br.ready('claude') && !br.ready('agy'),
    'hello: lệch proto → 409 UPGRADE · registry công khai chỉ giữ trường đã biết, chỉ CLI đã biết · ready(cli) = online + bật + khoá Đạt', JSON.stringify(st).slice(0, 300));
  const job = { kind: 'agent', cli: 'claude', model: 'sonnet', system: 's', context: 'c', messages: [{ role: 'user', content: 'hi' }], zone: 'xuong', readOnly: false };
  const r1 = br.createJob(job, { caps: { turnSec: 99999 } }), r2 = br.createJob(job);
  let busy = ''; try { br.createJob(job); } catch (e) { busy = e.bridgeCode; }
  const env = br._jobs.get(r1.id).envelope;
  // JSON chuẩn tắc + HMAC khớp chéo: envelope app ký → cầu nối kiểm đạt (secret thật, registry giả)
  let cross = ''; try { cross = B.checkEnvelope(env, { secret: p.secret, reg: { clis: { claude: { confinement: { status: 'verified' }, models: { list: ['sonnet'] } } } }, enabled: ['claude'], now: T }).id; } catch (e) { cross = e.code + ':' + e.detail; }
  const objs = [{ b: 1, a: [3, { z: 'é', y: null }], c: 'x"y' }, [1, 'a', { q: true }], 'str', 5];
  ok(cross === r1.id && env.job.caps.turnSec === 900 && busy === 'BUSY' && objs.every(o => SB.canon(o) === B.canon(o)) && !JSON.stringify(env.job).includes('gcj_') && /^gcj_/.test(env.gcj),
    'job: app ký HMAC (canon giống hệt cầu nối — kiểm chéo đạt) · trần lượt Studio 99999 s → 900 s (trần máy chủ) · hàng đợi đầy → BUSY', cross + ' ' + busy);
  ok(br.mcpCtx(env.gcj) === null && br.events(r1.id, { phase: 'started' }).status === 200 && br.mcpCtx(env.gcj).channel === 'ui' && br.mcpCtx(env.gcj).zone === 'xuong',
    'token lượt gcj chỉ sống từ lúc cầu nối báo started (ctx channel ui, đúng khu)');
  T += 31e3; await sleep(2100);
  const after = await Promise.race([r1.promise.then(() => 'done', e => e.bridgeCode), sleep(100).then(() => 'pending')]);
  ok(after === 'BRIDGE_OFFLINE' && br.mcpCtx(env.gcj) === null, 'cầu nối mất nhịp beat 30 s giữa lượt → lượt lỗi BRIDGE_OFFLINE, token lượt bị thu hồi', after);
  T += 61e3;
  let off = ''; try { br.createJob(job); } catch (e) { off = e.bridgeCode; }
  iid = 'b'.repeat(32);
  const gone = br.authOk(p.token), st2 = br.status();
  ok(off === 'BRIDGE_OFFLINE' && !gone && !st2.paired && !fs.existsSync(path.join(D, 'ai-bridge.json')) && !store['bridge.hmac'],
    'không poll trong 60 s → BRIDGE_OFFLINE · đổi install-id (khôi phục sang máy khác) → pairing + bí mật HMAC bị xoá, bridge token bị từ chối (CNS-306)');
  void r2; br.close();
}

/* ---------------------------------------------------------------- 2. server thật + cầu nối tay */
const APP = 7795, MOCK = 7796, BASE = 'http://127.0.0.1:' + APP;
let llmCalls = 0;
const mock = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d).on('end', () => { llmCalls++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Trả lời từ API dự phòng.' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })); }); });
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));
const HOME = mk('gc-tba-app-'), TOKEN = 'owner-tba-' + Math.random().toString(36).slice(2) + 'z'.repeat(20);
const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: HOME, GC_PORT: String(APP), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: TOKEN, HOME }), stdio: ['ignore', 'pipe', 'pipe'] });
kids.push(srv); let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await sleep(100); }
const req = (m, p, b, h) => fetch(BASE + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-GC-Request': '1' }, h || {}), body: b === undefined ? undefined : JSON.stringify(b) }).then(async r => { const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* bỏ */ } return { status: r.status, body: j, text: t, headers: r.headers }; });
const OWN = { Authorization: 'Bearer ' + TOKEN };
const api = (m, p, b) => req(m, p, b, OWN);
// --- pair: chỉ token chủ + local
const pairXff = await req('POST', '/api/ai/bridge/pair', {}, Object.assign({ 'X-Forwarded-For': '203.0.113.9' }, OWN)), pairNo = await req('POST', '/api/ai/bridge/pair', {});
const pr = await api('POST', '/api/ai/bridge/pair', {});
const GCB = pr.body && pr.body.token, SECRET = pr.body && pr.body.secret, BR = { Authorization: 'Bearer ' + GCB };
const ownerPoll = await req('GET', '/api/ai/bridge/next?wait=0', undefined, OWN), gcbApi = await req('GET', '/api/ai', undefined, BR), xffPoll = await req('GET', '/api/ai/bridge/next?wait=0', undefined, Object.assign({ 'X-Forwarded-For': '203.0.113.9' }, BR));
const linkPoll = await req('GET', '/api/ai/bridge/hello', undefined, BR);
ok(pr.status === 200 && /^gcb_/.test(GCB) && pairXff.status === 404 && pairNo.status === 401 && ownerPoll.status === 401 && gcbApi.status === 401 && xffPoll.status === 404 && linkPoll.status === 404,
  '/api/ai/bridge/*: pair cần token chủ + request local · qua proxy / edge (X-Forwarded-For) → 404 · token chủ KHÔNG poll được · bridge token không mở /api khác', JSON.stringify([pr.status, pairXff.status, pairNo.status, ownerPoll.status, gcbApi.status, xffPoll.status, linkPoll.status]));
const regPub = (enabled, conf) => ({ clis: { claude: { label: 'Claude Code', installed: true, version: '2.1.303', login: 'ok', sandbox: 'ok', selftest: true, confinement: conf || 'verified', missing: [], evidence: ['x'], enabled: enabled !== false, models: ['sonnet'] } }, caps: { turnSec: 900, perHour: 100, concurrent: 1, queue: 3, toolCalls: 60, writes: 30 } });
const hello = (proto, reg) => req('POST', '/api/ai/bridge/hello', { proto, bridge_version: '0.26.0', registry: reg || regPub() }, BR);
await hello(1);
const next = async () => { const r = await req('GET', '/api/ai/bridge/next?wait=3', undefined, BR); return r.status === 200 ? r.body : null; };
const ev = (id, b) => req('POST', '/api/ai/bridge/jobs/' + id + '/events', b, BR);
const mcpCall = (gcj, msg, h) => req('POST', '/mcp', msg, Object.assign({ Authorization: 'Bearer ' + gcj }, h || {}));
const rpc = (gcj, method, params, h) => mcpCall(gcj, { jsonrpc: '2.0', id: 1, method, params: params || {} }, h);
const tcall = async (gcj, name, args) => { const r = await rpc(gcj, 'tools/call', { name, arguments: args || {} }); return r.body && r.body.result ? r.body.result : r; };
// --- cấu hình AI: CLI
const cfgR = await api('PUT', '/api/ai', { primary: 'cli', cli: 'claude', cliModel: 'sonnet', caps: { turnSec: 99999, perHour: 50 } });
const badModel = await api('PUT', '/api/ai', { cliModel: 'gpt-evil' });
ok(cfgR.status === 200 && cfgR.body.primary === 'cli' && cfgR.body.cli.name === 'claude' && cfgR.body.cliReady === true && cfgR.body.caps.turnSec === 900 && cfgR.body.caps.perHour === 50 && cfgR.body.primaryView.provider === 'cli' && badModel.status === 400 && cfgR.body.v === 2,
  'ai.json v2: primary cli + CLI / model chỉ trong danh sách cầu nối đã quét · trần Studio chỉ hạ (99999 s → 900 s) · cliReady khi cầu nối online + bật + Đạt', JSON.stringify(cfgR.body && { p: cfgR.body.primaryView, caps: cfgR.body.caps, ready: cfgR.body.cliReady }) + ' ' + badModel.status);
// --- một lượt dock qua cầu nối tay + SSE studio-ai
const sse = await fetch(BASE + '/api/live/stream', { headers: OWN }), rd = sse.body.getReader(), dec = new TextDecoder(); let got = '';
const pump = (async () => { for (;;) { const x = await rd.read().catch(() => ({ done: true })); if (x.done) return; got += dec.decode(x.value); } })();
const frames = () => got.split('\n\n').filter(f => f.includes('data: ')).map(f => { try { return JSON.parse(f.split('\n').find(l => l.startsWith('data: ')).slice(6)); } catch (e) { return {}; } });
const t1 = await api('POST', '/api/ai/agent', { message: 'Xem nhân vật', context: { zone: 'xuong', page: 'character' }, async: true });
const e1 = await next();
let chk = ''; try { chk = B.checkEnvelope(e1.envelope, { secret: SECRET, reg: { clis: { claude: { confinement: { status: 'verified' }, models: { list: ['sonnet'] } } } }, enabled: ['claude'] }).job.kind; } catch (e) { chk = e.code + ':' + e.detail; }
const J = e1 && e1.envelope, GCJ = J && J.gcj;
const pre = await rpc(GCJ, 'initialize');
ok(t1.status === 202 && chk === 'agent' && J.job.zone === 'xuong' && /CLI BRIDGE/.test(J.job.system) && !/live_task|live_setup/.test(J.job.system) && /UI DATA/.test(J.job.context) && J.job.messages.slice(-1)[0].content === 'Xem nhân vật' && J.job.caps.turnSec === 900
  && pre.status === 403 && !pre.headers.get('www-authenticate'),
  'lượt dock → job agent ký HMAC (cầu nối kiểm đạt) · system = bề mặt `bridge` (chat + CLI BRIDGE, không live_task / live_setup) · dữ liệu giao diện riêng · gcj trước started → 403 không WWW-Authenticate', JSON.stringify({ chk, st: pre.status, sys: J && J.job.system.slice(-200) }));
await ev(J.id, { phase: 'started' });
const init = await rpc(GCJ, 'initialize', { protocolVersion: '2025-06-18' }), list = await rpc(GCJ, 'tools/list');
const names = (list.body.result.tools || []).map(t => t.name);
const OUT = ['rollback_app', 'update_app', 'live_task', 'live_event', 'live_setup', 'render_voice', 'design_voice', 'delete_sound_pack'];
const forb = []; for (const n of OUT) forb.push(await tcall(GCJ, n, { confirm: 'ROLLBACK', kind: 'read', task: 'code' }));
const r1 = await tcall(GCJ, 'list_characters'), r2 = await tcall(GCJ, 'get_character', { key: 'ma-no-canh' });
const xff = await rpc(GCJ, 'tools/list', {}, { 'X-Forwarded-For': '203.0.113.9' });
const prog = await api('GET', '/api/ai/turns/' + t1.body.turn);
ok(init.body.result.instructions === '' && names.includes('save_character') && !names.some(n => OUT.includes(n)) && forb.every(r => r.isError && /\[FORBIDDEN\]/.test(r.content[0].text)) && !r1.isError && !r2.isError && xff.status === 404
  && prog.body.status === 'running' && prog.body.cancellable === true && prog.body.progress.log.length >= OUT.length + 2,
  'gcj ở /mcp: initialize.instructions rỗng (CNS-308) · tools/list = bộ của khu · rollback_app / update_app / live_task / live_event / live_setup / render_voice … → FORBIDDEN (cổng ở callTool) · tool trong khu chạy · qua proxy → 404 · lượt nền có progress + huỷ được',
  JSON.stringify({ instr: init.body.result.instructions, out: names.filter(n => OUT.includes(n)), prog: prog.body.progress && prog.body.progress.log.length }));
await ev(J.id, { phase: 'beat' });
const done1 = await ev(J.id, { phase: 'done', text: 'Đây là ⟦asset:gen.khung/ma-no-canh|Ma-nơ-canh⟧.' });
const res1 = await until(async () => { const r = await api('GET', '/api/ai/turns/' + t1.body.turn); return r.body.status !== 'running' && r.body; });
const postGcj = await rpc(GCJ, 'tools/list');
await sleep(150);
const kinds = frames().map(e => e.kind).join(','), chan = (frames()[0] || {}).chan;
ok(done1.body.cancel === false && res1.status === 'done' && /Ma-nơ-canh/.test(res1.result.reply) && res1.result.via === 'cli' && res1.result.model === 'cli:claude/sonnet' && res1.result.log.some(l => l.tool === 'rollback_app' && !l.ok) && res1.result.log.some(l => l.tool === 'list_characters' && l.ok)
  && postGcj.status === 403 && !postGcj.headers.get('www-authenticate') && /^session_start,task,prompt,.*read.*,stop$/.test(kinds) && frames().every(f => f.chan === chan && f.via === 'studio-ai'),
  'cầu nối báo done → lượt dock xong: trả lời + log ✓/✗ như bản API (via cli) · gcj sau khi xong → 403 không WWW-Authenticate · sự kiện studio-ai qua SSE: session_start → task → prompt → (tool) → stop, một kênh', kinds + ' ' + JSON.stringify(res1).slice(0, 300));
// --- trần theo token: 60 gọi / 30 ghi
const t2 = await api('POST', '/api/ai/agent', { message: 'nhiều', context: { zone: 'xuong' }, async: true }), e2 = (await next()).envelope;
await ev(e2.id, { phase: 'started' });
let lastRead = null; for (let i = 0; i < 61; i++) lastRead = await tcall(e2.gcj, 'list_characters');
await ev(e2.id, { phase: 'done', text: 'x' }); await until(async () => (await api('GET', '/api/ai/turns/' + t2.body.turn)).body.status !== 'running');
const t3 = await api('POST', '/api/ai/agent', { message: 'ghi', context: { zone: 'xuong' }, async: true }), e3 = (await next()).envelope;
await ev(e3.id, { phase: 'started' });
let lastW = null; for (let i = 0; i < 31; i++) lastW = await tcall(e3.gcj, 'save_character', { asset: { id: 'x' } });
const readAfter = await tcall(e3.gcj, 'list_characters');
ok(/\[LIMIT\]/.test(lastRead.content[0].text) && /\[LIMIT\]/.test(lastW.content[0].text) && !readAfter.isError,
  'trần theo token lượt (CNS-313): lời gọi thứ 61 → [LIMIT] · lần ghi thứ 31 → [LIMIT] (đọc vẫn được)', lastRead.content[0].text.slice(0, 80) + ' | ' + lastW.content[0].text.slice(0, 80));
await ev(e3.id, { phase: 'done', text: 'x' }); await until(async () => (await api('GET', '/api/ai/turns/' + t3.body.turn)).body.status !== 'running');
// --- huỷ: thu hồi gcj NGAY, cờ cancel ở nhịp beat
const t4 = await api('POST', '/api/ai/agent', { message: 'huỷ đi', context: { zone: 'xuong' }, async: true }), e4 = (await next()).envelope;
await ev(e4.id, { phase: 'started' });
const okBefore = await tcall(e4.gcj, 'list_characters');
const cc = await api('POST', '/api/ai/turns/' + t4.body.turn + '/cancel', {});
const gcjAfter = await rpc(e4.gcj, 'tools/list'), beat = await ev(e4.id, { phase: 'beat' });
await ev(e4.id, { phase: 'error', code: 'CANCELLED' });
const r4 = await until(async () => { const r = await api('GET', '/api/ai/turns/' + t4.body.turn); return r.body.status !== 'running' && r.body; });
ok(!okBefore.isError && cc.body.cancelled === true && gcjAfter.status === 403 && !gcjAfter.headers.get('www-authenticate') && beat.body.cancel === true && r4.status === 'error' && r4.bridgeCode === 'CANCELLED',
  'huỷ: POST /api/ai/turns/<id>/cancel → gcj bị thu hồi ngay (403) · nhịp beat kế tiếp trả cancel: true · lượt kết thúc CANCELLED', JSON.stringify({ cc: cc.body, g: gcjAfter.status, beat: beat.body, r4 }));
// --- dự phòng API key: chỉ khi CHƯA ghi (CNS-312)
await api('PUT', '/api/ai', { provider: 'custom', baseUrl: 'http://127.0.0.1:' + MOCK + '/v1', apiKey: 'test-key', model: 'mock', fallback: true });
const t5 = await api('POST', '/api/ai/agent', { message: 'dự phòng', context: { zone: 'xuong' }, async: true }), e5 = (await next()).envelope;
await ev(e5.id, { phase: 'started' }); await tcall(e5.gcj, 'list_characters');
await ev(e5.id, { phase: 'error', code: 'QUOTA' });
const r5 = await until(async () => { const r = await api('GET', '/api/ai/turns/' + t5.body.turn); return r.body.status !== 'running' && r.body; });
const calls5 = llmCalls;
const t6 = await api('POST', '/api/ai/agent', { message: 'ghi rồi lỗi', context: { zone: 'xuong' }, async: true }), e6 = (await next()).envelope;
await ev(e6.id, { phase: 'started' }); await tcall(e6.gcj, 'save_character', { asset: { id: 'y' } });
await ev(e6.id, { phase: 'error', code: 'QUOTA' });
const r6 = await until(async () => { const r = await api('GET', '/api/ai/turns/' + t6.body.turn); return r.body.status !== 'running' && r.body; });
ok(r5.status === 'done' && r5.result.via === 'api-fallback' && r5.result.fallbackFrom === 'QUOTA' && /API dự phòng/.test(r5.result.reply) && calls5 >= 1 && r6.status === 'error' && r6.bridgeCode === 'QUOTA' && llmCalls === calls5,
  'dự phòng API key (D11): CLI hết quota trước khi ghi → chạy bằng API key · đã có một lần gọi save_* → KHÔNG dự phòng, báo lỗi QUOTA (CNS-312)', JSON.stringify({ r5: r5.result && r5.result.via, r6 }));
await api('PUT', '/api/ai', { fallback: false });
// --- AI đạo diễn = job complete (không MCP) + bài đo director cho CLI
const td = await api('POST', '/api/ai/director', { description: 'Ma-nơ-canh chào khán giả.', cast: ['ma-no-canh'], async: true });
const evJson = JSON.stringify({ title: 'Chào', steps: [{ who: 'ma-no-canh', say: 'Xin chào!' }] }), dj = [];
let dMcp = null, rd2 = null;
for (let i = 0; i < 3 && !rd2; i++) {   // app sửa tối đa 2 lần: mỗi lần là một job complete mới (lịch sử sửa trong messages)
  const ed = await next(); if (!ed || !ed.envelope) break; dj.push(ed.envelope.job);
  await ev(ed.envelope.id, { phase: 'started' });
  if (!dMcp) dMcp = await rpc(ed.envelope.gcj, 'tools/list');
  await ev(ed.envelope.id, { phase: 'done', text: '```json\n' + evJson + '\n```' });
  rd2 = await until(async () => { const r = await api('GET', '/api/ai/turns/' + td.body.turn); return r.body.status !== 'running' && r.body; }, 1500);
}
ok(dj.length >= 1 && dj.every(j => j.kind === 'complete' && j.readOnly === true && j.zone === '') && dMcp.status === 403 && rd2 && (rd2.status === 'done' ? rd2.result.model === 'cli:claude/sonnet' : dj.length === 3 && /3/.test(rd2.error || '')),
  'AI đạo diễn qua cầu nối = job `complete` (chỉ đọc, không khu, gcj của nó không mở MCP: 403); app vẫn extractJSON + validate, sửa tối đa 2 lần (' + dj.length + ' job)', JSON.stringify({ n: dj.length, rd2, m: dMcp && dMcp.status, last: dj.length && dj[dj.length - 1].messages.length }));
// --- CLI chưa bật / chưa Đạt / lệch proto → lỗi rõ
await hello(1, regPub(true, 'unverified'));
const tc = await api('POST', '/api/ai/agent', { message: 'x', context: { zone: 'xuong' } });
await hello(1, regPub(false));
const tn = await api('POST', '/api/ai/agent', { message: 'x', context: { zone: 'xuong' } });
const up = await hello(2);
const tu = await api('POST', '/api/ai/agent', { message: 'x', context: { zone: 'xuong' } }), cliView = await api('GET', '/api/ai/cli');
ok(tc.status === 409 && /Khoá của CLI chưa đạt|confinement|lock/i.test(tc.body.error) && tn.status === 409 && up.status === 409 && up.body.code === 'UPGRADE' && tu.status === 503 && cliView.body.upgrade === true,
  'CLI chưa Đạt khoá → 409 CONFINEMENT · chưa bật trên máy chủ → 409 · cầu nối lệch proto → 409 UPGRADE, lượt dock báo "chạy genchibi update" (503)', JSON.stringify([tc.status, tc.body && tc.body.error, tn.status, up.body, tu.status, tu.body && tu.body.error]));
await hello(1);
// --- đổi install-id (khôi phục sang máy khác) → pairing bị xoá, cầu nối nhận 401
fs.writeFileSync(path.join(HOME, 'data', 'install-id'), 'c'.repeat(32) + '\n');
const h401 = await hello(1), st401 = await api('GET', '/api/ai/cli');
ok(h401.status === 401 && st401.body.paired === false && !fs.existsSync(path.join(HOME, 'data', 'ai-bridge.json')), 'đổi install-id → pairing bị xoá, bridge token nhận 401 (cầu nối báo "genchibi ai bridge install")', JSON.stringify([h401.status, st401.body.paired]));
ok(!slog.includes(GCB) && !slog.includes(SECRET) && !slog.includes(GCJ), 'log server không chứa bridge token / bí mật HMAC / token lượt');
try { await rd.cancel(); } catch (e) { /* bỏ */ } await pump;

/* ---------------------------------------------------------------- 3. cầu nối THẬT + CLI giả trong hộp cát */
const sb = B.probeSandbox(process.env);
if (sb.bwrap !== 'ok') console.log('   ⚠ BỎ QUA lượt đầu-cuối với cầu nối thật: bubblewrap ' + sb.bwrap + ' — cần bwrap + user namespace (Fedora có sẵn)');
else {
  const T = mk('gc-tba-e2e-'), H = path.join(T, 'home'), X = path.join(T, 'xdg'), BIN = path.join(T, 'bin');
  for (const d of [H, X, BIN]) fs.mkdirSync(d, { mode: 0o700 });
  for (const n of ['claude', 'agy']) fs.writeFileSync(path.join(BIN, n), '#!' + fs.realpathSync(process.execPath) + '\n' + fs.readFileSync(path.join(ROOT, 'tools/fixtures/bridge/fake-' + n + '.mjs'), 'utf8'), { mode: 0o755 });
  const paths = B.bridgePaths({ HOME: H, XDG_RUNTIME_DIR: X, PATH: BIN + ':/usr/bin:/bin' });
  const p2 = await api('POST', '/api/ai/bridge/pair', {});
  B.loginKey(paths, 'AIzaTESTkey' + 'e'.repeat(28));   // agy mặc định chế độ key (T-07)
  B.writePrivate(paths.config, JSON.stringify({ app: BASE, version: '0.26.0' })); B.writePrivate(paths.token, p2.body.token + '\n'); B.writePrivate(paths.hmac, p2.body.secret + '\n');
  for (const n of ['claude', 'agy']) { fs.mkdirSync(paths.cliHome(n), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(paths.cliHome(n), 'fake-mode.json'), JSON.stringify({ script: [['list_characters', {}], ['rollback_app', { confirm: 'ROLLBACK' }]] })); await B.verifyCli(n, paths, undefined, { allowReset: true }); }
  B.writePrivate(paths.enabled, JSON.stringify({ clis: ['claude', 'agy'] }));
  const stop = { stop: false }, blog = [];
  const loop = B.serve({ paths, stopSignal: stop, log: m => blog.push(m) });
  await until(async () => (await api('GET', '/api/ai/cli')).body.online, 8000);
  const out = {};
  for (const cli of ['claude', 'agy']) {
    const model = cli === 'agy' ? 'gemini-3.8-flash-low' : 'sonnet';
    await api('PUT', '/api/ai', { primary: 'cli', cli, cliModel: model });
    const t = await api('POST', '/api/ai/agent', { message: 'Liệt kê nhân vật (' + cli + ')', context: { zone: 'thu-vien', page: 'lib-characters' }, async: true });
    out[cli] = await until(async () => { const r = await api('GET', '/api/ai/turns/' + t.body.turn); return r.body.status !== 'running' && r.body; }, 30000);
  }
  ok(['claude', 'agy'].every(c => out[c] && out[c].status === 'done' && /Xong \(fake-/.test(out[c].result.reply) && out[c].result.log.some(l => l.tool === 'list_characters' && l.ok) && out[c].result.log.some(l => l.tool === 'rollback_app' && !l.ok) && out[c].result.via === 'cli'),
    'đầu-cuối (cầu nối thật, bwrap, fake-claude + fake-agy): lượt dock → job ký → CLI trong hộp cát gọi MCP qua proxy bằng gcj → log ✓ list_characters, ✗ rollback_app (cổng khu) → trả lời', JSON.stringify(out).slice(0, 600) + ' ' + blog.join(' | '));
  stop.stop = true;
  await Promise.race([loop, sleep(30000)]);
}
srv.kill(); await new Promise(r => srv.once('exit', r)); mock.close();
console.log(bad ? '   ✗ test-bridge-app: có lỗi' : '   ✓ test-bridge-app: đạt');
process.exit(bad);
