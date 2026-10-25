// Kiểm phía server của "Sân khấu Live ở đỉnh dock" (v0.25 phần A, spec §8) + cổng khu trong callTool (CNS-302) + bề mặt luật của AI trong Studio (CNS-308).
// © 2026 Gen Labs — All rights reserved.
//  1) cổng khu ở mcp.callTool / handle() cho ctx.channel 'ui': tool ngoài khu (rollback_app, update_app, live_*, render_voice…) → FORBIDDEN ở MỌI khu
//  2) bảng ánh xạ (CNS-310): 100 % tool của mọi khu khớp một luật · khu → việc
//  3) vòng tool của ai.js (LLM giả chuẩn OpenAI) → sự kiện 'studio-ai' theo thứ tự qua SSE thật: session_start → task → prompt → … → stop; nhãn đã làm sạch,
//     không tham số; công tắc việc chỉ khi đổi (khu / nút gợi ý); lỗi LLM → error + stop
//  4) LiveHub: một lượt studio-ai diễn tại một thời điểm (quiet) · bình tần suất riêng · ≤ 16 người xem, ≤ 2 luồng mỗi người xem (đóng luồng cũ nhất)
//  5) CNS-308: chỉ dẫn của AI trong Studio (mọi khu) không nhắc live_task / live_setup / live_event
// Dùng: node tools/test-dock-live.mjs   (cổng 7786 LLM giả, 7787 app)
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { loadEngine } = require(path.join(ROOT, 'server/engine-node.js'));
const GC = loadEngine(ROOT);
const { MCP, TOOLS, ZONES, UI_TOOLS } = require(path.join(ROOT, 'server/mcp.js'));
const { Store } = require(path.join(ROOT, 'server/store.js'));
const { LiveHub, CLIENTS_MAX, PER_VIEWER } = require(path.join(ROOT, 'server/live.js'));
const LiveAI = require(path.join(ROOT, 'server/live-ai.js'));
const Rules = require(path.join(ROOT, 'server/rules.js'));
let bad = 0;
const ok = (c, m, extra) => { if (c) console.log('   ✓ ' + m); else { bad = 1; console.log('   ✗ ' + m + (extra ? ' — ' + String(extra).slice(0, 600) : '')); } };
const kids = [], tmp = [];
process.on('exit', () => { kids.forEach(k => { try { k.kill(); } catch (e) { /* đã tắt */ } }); tmp.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* bỏ */ } }); });
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => process.exit(130));
const mk = p => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); tmp.push(d); return d; };

/* ---------------------------------------------------------------- 1. cổng khu trong callTool */
{
  const evs = [];
  const M = new MCP({ engine: GC, store: new Store(mk('gc-dl-mcp-')), version: 't', live: { accept: (e, who) => { evs.push([who, e]); return { ev: e }; } }, liveSetup: () => ({ ok: true }) });
  const OUT = ['rollback_app', 'update_app', 'live_task', 'live_event', 'live_setup', 'render_voice', 'design_voice', 'delete_sound_pack', 'get_storyboard', 'nope_tool'];
  const res = [];
  for (const z of Object.keys(ZONES).concat(['khu-la'])) for (const n of OUT) res.push([z, n, await M.callTool(n, { confirm: 'ROLLBACK', kind: 'read', task: 'code' }, { channel: 'ui', zone: z })]);
  const leaked = res.filter(([, , r]) => !(r && r.isError && /\[FORBIDDEN\]/.test(r.content[0].text)));
  // đường JSON-RPC (handle) cũng qua cổng: cầu nối CLI (sau này) gọi /mcp với ctx channel 'ui'
  const rpc = await M.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'rollback_app', arguments: { confirm: 'ROLLBACK' } } }, { channel: 'ui', zone: 'he-thong' });
  const inZone = await M.callTool('list_characters', {}, { channel: 'ui', zone: 'xuong' }), libSave = await M.callTool('save_work', { title: 'x' }, { channel: 'ui', zone: 'thu-vien' });
  const owner = await M.callTool('live_event', { kind: 'read' }, {});
  ok(!leaked.length && rpc.result && rpc.result.isError && /FORBIDDEN/.test(rpc.result.content[0].text) && !inZone.isError && libSave.isError && /FORBIDDEN/.test(libSave.content[0].text) && !owner.isError && !evs.some(([w]) => /studio-ai/.test(w)),
    'cổng khu ở mcp.callTool (channel ui): ' + OUT.length + ' tool ngoài khu × ' + (Object.keys(ZONES).length + 1) + ' khu → FORBIDDEN (cả qua handle() JSON-RPC) · tool trong khu chạy · save_work ở Thư viện → FORBIDDEN · kênh chủ (MCP) không bị cổng khu', leaked.slice(0, 3).map(x => x[0] + '/' + x[1] + ': ' + (x[2] && x[2].content[0].text)).join(' | '));
  // tool trong khu có liveChan → phát sự kiện đúng kênh, nhãn = tiêu đề tool, KHÔNG tham số
  evs.length = 0;
  await M.callTool('list_characters', { q: '/home/ryan/.ssh/id_rsa secret-arg' }, { channel: 'ui', zone: 'xuong', liveChan: 'studio-ai:7' });
  await M.callTool('get_character', { key: 'khong-co-secret-arg' }, { channel: 'ui', zone: 'xuong', liveChan: 'studio-ai:7' });
  await M.callTool('validate_character', { asset: { id: 'x' } }, { channel: 'ui', zone: 'xuong', liveChan: 'studio-ai:7' });
  await M.callTool('rollback_app', { confirm: 'ROLLBACK' }, { channel: 'ui', zone: 'xuong', liveChan: 'studio-ai:7' });
  const kinds = evs.map(([w, e]) => e.kind), labels = evs.map(([, e]) => e.label).join('|');
  ok(evs.every(([w]) => w === 'studio-ai:7') && kinds.join(',') === 'read,error,test_run,test_fail' && !/ssh|id_rsa|secret-arg/.test(JSON.stringify(evs)) && /character/i.test(labels),
    'callTool (ui + liveChan) phát sự kiện: list_characters → read · get_character không có → error · validate_character lỗi → test_run, test_fail · tool bị cổng chặn → không phát · nhãn = tiêu đề tool, không tham số', JSON.stringify(evs).slice(0, 300));
}

/* ---------------------------------------------------------------- 2. bảng ánh xạ phủ 100 % */
{
  const M = new MCP({ engine: GC, store: new Store(mk('gc-dl-map-')), version: 't' });
  const all = new Map(); Object.keys(ZONES).forEach(z => M.toolsFor('ui', z).forEach(t => all.set(t.name, t)));
  const miss = [...all.values()].filter(t => !LiveAI.ruleOf(t.name, t));
  const K = (n, r) => LiveAI.postKind(n, all.get(n), r);
  ok(all.size >= 40 && !miss.length && all.has('propose_edit') && Object.keys(ZONES).every(z => LiveAI.TASK_OF_ZONE[z] && GC.live.TASKS.indexOf(LiveAI.TASK_OF_ZONE[z]) >= 0)
    && LiveAI.QUICK_TASKS.every(t => GC.live.TASKS.indexOf(t) >= 0) && LiveAI.taskOf('xuong', 'review') === 'review' && LiveAI.taskOf('xuong', 'rm -rf') === 'design' && LiveAI.taskOf('khu-la') === 'chat'
    && LiveAI.preKind('validate_item', all.get('validate_item')) === 'test_run' && K('validate_item', { isError: true }) === 'test_fail' && K('validate_item', {}) === 'test_pass'
    && K('render_scene', {}) === 'run' && K('preview_shot', {}) === 'run' && K('save_character', { structuredContent: { version: 1 } }) === 'write' && K('save_character', { structuredContent: { version: 3 } }) === 'edit'
    && K('propose_edit', {}) === 'edit' && K('list_works', {}) === 'read' && K('start_here', {}) === 'read' && K('lint_sound_track', {}) === 'search' && K('render_scene', { isError: true }) === 'error',
    'bảng ánh xạ (CNS-310): ' + all.size + ' tool của 5 khu đều khớp một luật (validate → test_run / pass / fail · render / preview → run · save / propose → write | edit · list / get → read · còn lại chỉ đọc → search · lỗi → error) · khu → việc · nút gợi ý → việc (giá trị lạ bị bỏ)', miss.map(t => t.name).join(','));
}

/* ---------------------------------------------------------------- 4. LiveHub: một lượt diễn · bình riêng · người xem */
{
  const H = new LiveHub({ dir: mk('gc-dl-hub-'), engine: GC }); clearInterval(H.beat);
  const a1 = H.accept({ kind: 'session_start' }, 'studio-ai:1'), b1 = H.accept({ kind: 'session_start' }, 'studio-ai:2'), a2 = H.accept({ kind: 'read', label: 'Reading /etc/shadow now' }, 'studio-ai:1');
  const b2 = H.accept({ kind: 'read' }, 'studio-ai:2'); H.accept({ kind: 'stop' }, 'studio-ai:1'); const b3 = H.accept({ kind: 'edit' }, 'studio-ai:2');
  ok(a1.ev.chan === 'studio-ai:1' && a1.ev.via === 'studio-ai' && !a1.ev.quiet && b1.ev.quiet && b2.ev.quiet && !a2.ev.quiet && !b3.ev.quiet && !/etc|shadow/.test(a2.ev.label),
    'một lượt AI trong Studio diễn tại một thời điểm: lượt 2 "quiet" (chỉ đếm) tới khi lượt 1 dừng · chan công khai studio-ai:<n>, via studio-ai · nhãn qua redact');
  const ext = H.accept({ kind: 'read' }, 'mcp'), own = H.accept({ kind: 'read' }, 'owner');
  let n429 = 0; for (let i = 0; i < 80; i++) if (H.accept({ kind: 'read' }, 'studio-ai:3').code === 429) n429++;
  ok(ext.ev.chan === 'mcp' && own.ev.chan === 'owner' && n429 > 0 && !H.accept({ kind: 'read' }, 'mcp').error && H.accept({ kind: 'read' }, 'studio-ai:9').code === 429,
    'bình tần suất riêng của AI trong Studio (mọi lượt chung một bình): cạn bình (' + n429 + ' lần 429) không làm nghẹt kênh MCP');
  // người xem SSE: ≤ 16 · mỗi phiên / token ≤ 2 luồng — luồng thứ 3 nhận 429 + Retry-After khi hai luồng cũ còn TRẺ (≤ 30 s); luồng cũ đã sống > 30 s thì bị thay
  // (tab bỏ quên) · người xem không rõ ('') chung một nhóm 'anon' trần 2 · không có vòng đá nhau
  const fake = () => { const r = { ended: 0, code: 0, retry: null, writeHead(c, h) { r.code = c; r.retry = h && h['Retry-After']; }, write() {}, end() { r.ended++; }, on() {} }; return r; };
  let VT = 1e9; const HV = new LiveHub({ dir: mk('gc-dl-view-'), engine: GC, now: () => VT }); clearInterval(HV.beat);
  const rq = { on() {}, headers: {} }, v = Array.from({ length: 5 }, fake);
  HV.stream(rq, v[0], 0, () => true, 'S:a'); VT += 1000; HV.stream(rq, v[1], 0, () => true, 'S:a'); VT += 1000; HV.stream(rq, v[2], 0, () => true, 'S:a'); HV.stream(rq, v[3], 0, () => true, 'S:a');
  const young = v.slice(0, 4).map(r => r.code + (r.ended ? 'x' : '')).join(',');
  VT += 31000; HV.stream(rq, v[4], 0, () => true, 'S:a');
  const anon = Array.from({ length: 3 }, fake); anon.forEach(r => HV.stream(rq, r, 0, () => true, ''));
  const others = Array.from({ length: 14 }, fake); others.forEach((r, i) => HV.stream(rq, r, 0, () => true, 'T:' + i));
  ok(CLIENTS_MAX === 16 && PER_VIEWER === 2 && young === '200,200,429x,429x' && +v[2].retry >= 25 && v[0].ended === 1 && v[4].code === 200 && !v[1].ended
    && anon.map(r => r.code).join() === '200,200,429' && others.slice(0, 12).every(r => r.code === 200) && others.slice(12).every(r => r.code === 429) && HV.clients.size === 16,
    'người xem SSE: tối đa 16 · mỗi phiên / token ≤ 2 luồng — luồng 3, 4 khi hai luồng cũ còn trẻ → 429 + Retry-After ' + v[2].retry + ' s (không đá nhau) · luồng cũ > 30 s mới bị thay · không rõ người xem → nhóm anon trần 2', young + ' · ' + JSON.stringify({ v0: v[0].ended, v4: v[4].code, anon: anon.map(r => r.code), size: HV.clients.size }));
  HV.close();
  // stop / error / limit của AI trong Studio KHÔNG bị bình tần suất làm rơi → lượt dẫn luôn được nhả, lượt sau không bị "quiet" 60 s
  const HT = new LiveHub({ dir: mk('gc-dl-term-'), engine: GC }); clearInterval(HT.beat);
  HT.accept({ kind: 'session_start' }, 'studio-ai:1'); let drained = 0; for (let i = 0; i < 200 && drained < 5; i++) if (HT.accept({ kind: 'read' }, 'studio-ai:1').code === 429) drained++;
  const er = HT.accept({ kind: 'error' }, 'studio-ai:1'), st = HT.accept({ kind: 'stop' }, 'studio-ai:1'), lead = HT.aiLead, nx = HT.accept({ kind: 'session_start' }, 'studio-ai:2');
  ok(drained === 5 && st.ev && er.ev && lead === null && (nx.code === 429 || (nx.ev && !nx.ev.quiet)) && (!HT.aiLead || HT.aiLead.chan === 'studio-ai:2'),
    'bình của AI trong Studio cạn: stop / error vẫn qua (lượt dẫn được nhả ngay) — lượt sau không bị "quiet"', JSON.stringify({ st: !!st.ev, nx, lead: HT.aiLead }));
  HT.close();
  H.close();
}

/* ---------------------------------------------------------------- 5. CNS-308: bề mặt luật của AI trong Studio */
{
  const M = new MCP({ engine: GC, store: new Store(mk('gc-dl-rules-')), version: 't', live: { accept: () => ({}) }, liveSetup: () => ({}) });
  const sys = Object.keys(ZONES).map(z => M.uiSystem({ zone: z })), chat = Object.keys(ZONES).map(z => Rules.chat({ zone: z, tools: M.toolsFor('ui', z), allTools: TOOLS.concat(UI_TOOLS) }));
  const hit = sys.concat(chat).filter(s => /live_(task|setup|event)|Live stage/.test(s));
  ok(!hit.length && Rules.mcp({}, TOOLS).includes('live_task') && Rules.mcp({}, TOOLS).includes('live_setup'),
    'CNS-308: chỉ dẫn của AI trong Studio (5 khu, uiSystem + Rules.chat) không nhắc live_task / live_setup / live_event (hai tool đó không thuộc khu nào — server tự phát sự kiện); agent MCP ngoài vẫn có luật 12 / 13', hit.map(s => (s.match(/.{0,60}live_\w+.{0,40}/) || [''])[0]).join(' | '));
}

/* ---------------------------------------------------------------- 3. vòng tool của ai.js → sự kiện studio-ai qua SSE thật */
{
  const MOCK = 7786, APP = 7787;
  let script = [], fail500 = false;
  const mock = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d).on('end', () => {
      const body = JSON.parse(b), done = body.messages.filter(m => m.role === 'tool').length;
      if (fail500) { res.statusCode = 500; return res.end('{"error":{"message":"boom"}}'); }
      const msg = done < script.length ? { role: 'assistant', content: '', tool_calls: [{ id: 'c' + done, type: 'function', function: { name: script[done][0], arguments: JSON.stringify(script[done][1]) } }] } : { role: 'assistant', content: 'Xong.' };
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
  });
  await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));
  const HOME = mk('gc-dl-app-'), TOKEN = 'owner-dl-' + Math.random().toString(36).slice(2) + 'z'.repeat(20), OWN = { Authorization: 'Bearer ' + TOKEN }, BASE = 'http://127.0.0.1:' + APP;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: HOME, GC_PORT: String(APP), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: TOKEN, HOME }), stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(srv); let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 100)); }
  const api = (m, p, b) => fetch(BASE + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', 'X-GC-Request': '1' }, OWN), body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
  await api('PUT', '/api/ai', { provider: 'custom', baseUrl: 'http://127.0.0.1:' + MOCK + '/v1', apiKey: 'test-key', model: 'mock' });
  const sse = await fetch(BASE + '/api/live/stream', { headers: OWN }), rd = sse.body.getReader(), dec = new TextDecoder(); let got = '';
  const pump = (async () => { for (;;) { const x = await rd.read().catch(() => ({ done: true })); if (x.done) return; got += dec.decode(x.value); } })();
  const frames = () => got.split('\n\n').filter(f => f.includes('data: ')).map(f => JSON.parse(f.split('\n').find(l => l.startsWith('data: ')).slice(6)));
  const turn = async (msg, ctx, extra) => { const r = await api('POST', '/api/ai/agent', Object.assign({ message: msg, context: ctx }, extra || {})); await new Promise(r2 => setTimeout(r2, 150)); return r; };
  script = [['get_character', { key: 'ma-no-canh' }], ['validate_character', { asset: { id: 'bad', note: '/home/ryan/.ssh/id_rsa ryan@x.io' } }], ['rollback_app', { confirm: 'ROLLBACK' }], ['list_works', {}]];
  const r1 = await turn('Soát giúp tôi nhân vật, file /home/ryan/secret.txt', { zone: 'xuong', page: 'character' });
  const f1 = frames(), seq1 = f1.map(e => e.kind).join(','), ch1 = f1[0] && f1[0].chan;
  ok(r1.reply === 'Xong.' && seq1 === 'session_start,task,prompt,read,test_run,test_fail,read,stop' && f1.every(e => e.chan === ch1 && e.via === 'studio-ai') && /^studio-ai:\d+$/.test(ch1) && f1[1].task === 'design'
    && r1.log.some(l => l.tool === 'rollback_app' && !l.ok && /FORBIDDEN/.test(l.summary)),
    'lượt dock (API key, LLM giả) → SSE: ' + seq1 + ' · một kênh ' + ch1 + ' · việc theo khu Xưởng = design · rollback_app bị cổng khu chặn (log ✗ FORBIDDEN, không sự kiện)', seq1 + ' ' + JSON.stringify(r1.log && r1.log.map(l => l.tool + (l.ok ? '✓' : '✗'))));
  ok(!/secret|ssh|id_rsa|ryan@|x\.io|ma-no-canh|Soát/.test(got) && f1.filter(e => e.kind === 'prompt' || e.kind === 'task').every(e => !e.label && !e.title),
    'không rò: sự kiện không chứa chữ người dùng / tham số tool (prompt không nhãn, task không tiêu đề, nhãn = tiêu đề tool)');
  got = '';
  script = [['list_works', {}]];
  await turn('lần hai', { zone: 'xuong', page: 'character' });
  const f2 = frames().map(e => e.kind).join(',');
  await turn('đổi khu', { zone: 'thu-vien', page: 'lib-characters' }); const f3 = frames();
  got = '';
  await turn('Soát nhân vật đang xem: cổng kiểm, nhận diện, còn thiếu gì.', { zone: 'thu-vien', page: 'lib-characters' }, { task: 'review' }); const f4 = frames();
  got = '';
  await turn('việc lạ', { zone: 'thu-vien', page: 'lib-characters' }, { task: 'rm -rf /' }); const f5 = frames();
  ok(f2 === 'session_start,prompt,read,stop' && f3.filter(e => e.kind === 'task').map(e => e.task).join() === 'research' && f4.filter(e => e.kind === 'task').map(e => e.task).join() === 'review' && f5.filter(e => e.kind === 'task').map(e => e.task).join() === 'research',
    'công tắc việc chỉ khi đổi: cùng khu → không task · sang Thư viện → research · nút gợi ý "Soát…" → review · task lạ từ client → bỏ, về việc của khu', JSON.stringify([f2, f3.map(e => e.kind + (e.task ? ':' + e.task : '')), f4.map(e => e.task).filter(Boolean)]));
  got = ''; fail500 = true;
  const r6 = await fetch(BASE + '/api/ai/agent', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'X-GC-Request': '1' }, OWN), body: JSON.stringify({ message: 'hỏng', context: { zone: 'thu-vien' } }) });
  await new Promise(r => setTimeout(r, 150)); const f6 = frames().map(e => e.kind).join(',');
  ok(r6.status >= 400 && f6 === 'session_start,prompt,error,stop', 'LLM lỗi → error rồi stop (lượt dẫn nhường ngay cho lượt sau)', r6.status + ' ' + f6);
  ok(!/secret|ssh|ryan@/.test(log), 'log server không chứa chữ người dùng / tham số');
  try { await rd.cancel(); } catch (e) { /* bỏ */ } await pump;
  srv.kill(); await new Promise(r => srv.once('exit', r)); mock.close();
}

console.log(bad ? '   ✗ test-dock-live: có lỗi' : '   ✓ test-dock-live: đạt');
process.exit(bad);
