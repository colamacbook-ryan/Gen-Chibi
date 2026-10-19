#!/usr/bin/env node
// gen-chibi — "agent từ số 0" (INT-05, Ryan 2026-10-18: agent sau này chưa chắc là Claude — phải dùng ĐÚNG cách chỉ bằng hướng dẫn).
// Một agent TẤT ĐỊNH, không SDK, không model: chỉ gửi JSON-RPC thuần qua HTTP, chỉ đọc start_here / get_guide, dán NGUYÊN VĂN ví dụ
// trong hướng dẫn, đi trọn luồng (dự án → linh kiện → trang bị → nhân vật → cảnh → gói động tác → phim → hoạt ảnh → gói dự án).
// Kèm: hợp đồng lỗi có mã, đường không-MCP (GET ?tools / ?guide), lớp bọc từng hãng, độ phủ hướng dẫn ↔ tool thật.
// © 2026 Gen Labs — All rights reserved.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const Agent = require(path.join(ROOT, 'server/agent.js'));
const { TOOLS } = require(path.join(ROOT, 'server/mcp.js'));
const { packTar } = require(path.join(ROOT, 'server/tar.js'));
const PORT = +(process.env.GC_ZERO_PORT || 7493), TOKEN = 'zero-' + Math.random().toString(36).slice(2);
const BASE = 'http://127.0.0.1:' + PORT;
const fail = m => { console.log('   ✗ ' + m); cleanup(); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); };

// ---------- 0. độ phủ hướng dẫn (tĩnh, trước khi chạy server)
const names = TOOLS.map(t => t.name), corpus = Agent.guide('all');
const missingDoc = names.filter(n => !new RegExp('`' + n + '`').test(corpus));
ok(!missingDoc.length, 'tool chưa có trong hướng dẫn agent: ' + missingDoc.join(', '));
const cited = [...new Set([...corpus.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(m => m[1]))].filter(n => /^(get|list|save|validate|render|preview|import|export|install|update|rollback|start)_/.test(n));
const stale = cited.filter(n => names.indexOf(n) < 0);
ok(!stale.length, 'hướng dẫn nhắc tool không tồn tại: ' + stale.join(', '));
const topicIds = Agent.topics().map(t => t.id), table = [...Agent.guide('guide').matchAll(/^\| `([a-z-]+)` \|/gm)].map(m => m[1]);
ok(JSON.stringify(topicIds.slice().sort()) === JSON.stringify(table.slice().sort()), 'bảng chủ đề GUIDE.md lệch thư mục workflows: ' + table + ' ↔ ' + topicIds);
ok(!/<!-- example: /.test(corpus), 'còn ví dụ không nhúng được (thiếu tệp agent/examples)');
ok(Agent.rules().length >= 8, 'luật vàng đọc từ GUIDE.md thiếu');
console.log('   ✓ hướng dẫn phủ đủ ' + names.length + ' tool · không nhắc tool lạ · ' + topicIds.length + ' chủ đề khớp bảng · mọi ví dụ nhúng được · ' + Agent.rules().length + ' luật vàng');

// ---------- server cô lập, CÓ token (agent phải gửi header)
const H = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-zero-'));
let srv = null;
function cleanup() { try { if (srv) srv.kill(); } catch {} try { fs.rmSync(H, { recursive: true, force: true }); } catch {} }
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); }); process.on('uncaughtException', e => { console.log('   ✗ ' + e.stack); cleanup(); process.exit(1); });
srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: H, GC_PORT: String(PORT), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: TOKEN }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/api/health'); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }

let id = 0;
const rpc = async (method, params, auth = true) => {
  const r = await fetch(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + TOKEN } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  return { status: r.status, body: r.status === 200 ? await r.json() : null };
};
const call = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args || {} }); ok(r.status === 200 && r.body.result, name + ': HTTP ' + r.status); return r.body.result; };
const good = async (name, args, check) => {
  const res = await call(name, args), t = res.content[0].text;
  ok(!res.isError && !/"ok": false|"saved": false|"ready": false/.test(t), name + ' trượt: ' + t.slice(0, 300));
  if (check) ok(check(res), name + ': kết quả không như hướng dẫn hứa — ' + t.slice(0, 200));
  return res;
};
// "agent" lấy ví dụ CHỈ từ hướng dẫn (khối ```json đầu tiên sau dòng `agent/examples/<tệp>`) — không đọc thẳng tệp
const exampleIn = (md, file) => { const i = md.indexOf('`agent/examples/' + file + '`'); ok(i >= 0, 'hướng dẫn thiếu ví dụ ' + file); const a = md.indexOf('```json\n', i) + 8; return JSON.parse(md.slice(a, md.indexOf('\n```', a))); };

// ---------- 1. bắt tay như client lạ (không SDK)
ok((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'zero', version: '1' } }, false)).status === 401, 'MCP không token phải 401');
const init = (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'zero', version: '1' } })).body.result;
ok(/start_here/.test(init.instructions) && /get_guide/.test(init.instructions), 'instructions phải chỉ đường start_here → get_guide');
const list = (await rpc('tools/list', {})).body.result.tools;
ok(list[0].name === 'start_here' && list[1].name === 'get_guide', 'start_here / get_guide phải đứng đầu tools/list');
const start = (await good('start_here', {})).structuredContent;
ok(start.rules.length >= 8 && start.topics.length === topicIds.length && start.next_steps.length, 'start_here thiếu luật / chủ đề / bước kế');
console.log('   ✓ client lạ: 401 khi thiếu token · instructions chỉ start_here → get_guide · start_here đứng đầu ' + list.length + ' tool · trả ' + start.rules.length + ' luật, ' + start.topics.length + ' chủ đề, bước kế');

// ---------- 2. đi trọn luồng CHỈ bằng hướng dẫn
const G = {}; for (const t of topicIds) G[t] = (await good('get_guide', { topic: t })).content[0].text;
const project = exampleIn(G['project-bundle'] + '\n' + Agent.guide('all'), 'project.json');
await good('save_project', project);
const part = exampleIn(G.part, 'part.json');
await good('preview_part', { part }); await good('save_part', { part });
const item = exampleIn(G.item, 'item.json');
await good('validate_item', { item }); await good('save_item', { item });
const asset = exampleIn(G.character, 'character.json');
await good('validate_character', { asset }); await good('save_character', { asset });
const scene = exampleIn(G.scene, 'scene.json');
await good('validate_scene', { scene }); await good('save_scene', { scene });
const pack = exampleIn(G['motion-pack'], 'motion-pack.json');
await good('get_motion_spec', {}, r => r.structuredContent.example && r.structuredContent.framePoses.indexOf('fistGuard') >= 0);
await good('validate_motion_pack', { pack }); await good('save_motion_pack', { pack });
const work = exampleIn(G.film, 'work.json'), shot = exampleIn(G.film, 'shot.json');
await good('save_work', work);
const cast = shot.event.steps.map(s => s.actor).filter((v, i, a) => a.indexOf(v) === i);
await good('get_director_schema', { cast }, r => r.structuredContent.actorsCan.some(a => a.id === asset.id && a.actions.indexOf('bonk') >= 0 && a.weapon === true));
await good('validate_event', { event: shot.event, cast });
await good('save_shot', { work: work.id, shot });
const pv = await good('preview_shot', { work: work.id, shot: '0' }, r => r.structuredContent.ready === true && r.structuredContent.beats.some(b => b.act === 'bonk'));
await good('render_action', { character: 'local.my/' + asset.id, action: 'bonk', format: 'sheet', fps: 8 }, r => r.content[1] && /^<svg/.test(r.content[1].resource.text) && r.structuredContent.impactFrame > 0);
await good('render_character', { key: 'local.my/' + asset.id, action: 'bowDeep' }, r => /^<svg/.test(r.content[1].resource.text));
const bundle = (await good('export_project', { id: project.id })).structuredContent;
ok(bundle.motionPacks.length === 1 && bundle.characters.length === 1 && bundle.works.length === 1, 'gói dự án thiếu mục: ' + JSON.stringify({ m: bundle.motionPacks.length, c: bundle.characters.length, w: bundle.works.length }));
console.log('   ✓ chỉ bằng hướng dẫn + ví dụ nguyên văn: dự án → linh kiện → trang bị → nhân vật (có binh khí) → cảnh → gói động tác → phim (' + pv.structuredContent.beats.length + ' nhịp, sẵn sàng) → hoạt ảnh → gói dự án đủ mục');

// ---------- 3. hợp đồng lỗi: mã ổn định + path + gợi ý; tự sửa theo path rồi qua
const bad = JSON.parse(JSON.stringify(pack)); bad.id = 'zero-sai'; bad.actions = { bonkTwo: { label: 'x', clips: ['bonk'], attack: true } }; bad.clips.bonk.keys[0][0] = 99;
const e1 = await call('validate_motion_pack', { pack: bad }), er = e1.structuredContent && e1.structuredContent.error;
ok(e1.isError && /^\[VALIDATION_FAILED\]/.test(e1.content[0].text) && er && er.code === 'VALIDATION_FAILED' && er.details.some(d => d.path === 'clips.bonk.keys[0][0]') && er.hint, 'lỗi phải có [CODE] + structuredContent.error.details[].path + hint: ' + e1.content[0].text.slice(0, 200));
bad.clips.bonk.keys[0][0] = 0.16;   // "agent" sửa đúng path được chỉ
await good('validate_motion_pack', { pack: bad });
const e2 = await call('render_action', { character: 'gen.khung/ma-no-canh', action: 'thrust' });
ok(e2.isError && e2.structuredContent.error.code === 'VALIDATION_FAILED' && e2.structuredContent.error.allowed.indexOf('punch') >= 0, 'tay không gọi đòn binh khí phải bị chặn kèm danh sách đòn làm được');
const e3 = await call('get_guide', { topic: 'khong-co' });
ok(e3.isError && e3.structuredContent.error.code === 'NOT_FOUND' && e3.structuredContent.error.allowed.indexOf('film') >= 0, 'chủ đề lạ phải NOT_FOUND kèm danh sách');
const e4 = await call('save_motion_pack', { pack: Object.assign({}, pack, { id: 'zero-trung', actions: { punch: pack.actions.bonk } }) });
ok(e4.isError && /trùng id hành động của bộ khung/.test(e4.content[0].text), 'id hành động trùng khung phải bị chặn');
console.log('   ✓ lỗi có mã: [VALIDATION_FAILED] + details[].path chỉ đúng chỗ → sửa đúng chỗ là qua · đòn binh khí cho tay không bị chặn kèm đòn làm được · NOT_FOUND kèm danh sách · không đè đòn của khung');

// ---------- 4. agent KHÔNG có MCP client: GET ?guide / ?tools (cùng token), function-calling
ok((await fetch(BASE + '/mcp?tools=openai')).status === 401, 'GET ?tools không token phải 401');
const H2 = { authorization: 'Bearer ' + TOKEN };
const oa = await (await fetch(BASE + '/mcp?tools=openai', { headers: H2 })).json();
ok(oa.length === names.length && oa.every(f => f.type === 'function' && names.indexOf(f.function.name) >= 0 && f.function.parameters.type === 'object'), 'schema openai sai');
const gm = await (await fetch(BASE + '/mcp?tools=gemini', { headers: H2 })).json(), gs = JSON.stringify(gm);
ok(gm.functionDeclarations.length === names.length && !/additionalProperties|\$schema/.test(gs), 'schema gemini còn khoá Gemini không nhận');
const md = await (await fetch(BASE + '/mcp?guide=film', { headers: H2 })).text();
ok(/^# Topic: film/.test(md) && /```json/.test(md), 'GET ?guide=film phải trả markdown kèm ví dụ');
console.log('   ✓ không có MCP client: GET ?tools=openai|gemini (' + oa.length + ' hàm, sạch khoá lạ) · GET ?guide=<chủ đề> markdown kèm ví dụ · cùng token');

// ---------- 5. lớp bọc từng hãng sinh từ cùng nguồn, giải nén được bằng tar
for (const v of Agent.VENDORS) {
  const files = Agent.wrapper(v); ok(files && files.length && files.every(f => f.content.length > 2000 && /start_here/.test(f.content) || /references\//.test(f.path)), 'lớp bọc ' + v + ' thiếu nội dung');
}
const sk = Agent.wrapper('claude')[0].content;
ok(/^---\nname: gen-chibi\ndescription: .+\n---\n/.test(sk), 'SKILL.md của Claude thiếu frontmatter name / description');
const tarFile = path.join(H, 'claude.tar'); fs.writeFileSync(tarFile, packTar(Agent.wrapper('claude')));
const listed = execFileSync('tar', ['-tf', tarFile], { encoding: 'utf8' }).trim().split('\n');
ok(listed.indexOf('gen-chibi/SKILL.md') >= 0 && listed.length === 1 + topicIds.length, 'tar lớp bọc Claude sai: ' + listed.join(','));
const tr = await fetch(BASE + '/api/agent/skill?vendor=cursor', { headers: H2 });
ok(tr.ok && /x-tar/.test(tr.headers.get('content-type')), '/api/agent/skill phải trả tar');
console.log('   ✓ lớp bọc ' + Agent.VENDORS.join(' / ') + ' sinh từ agent/ · Claude SKILL.md có frontmatter + ' + topicIds.length + ' tệp tham chiếu · tar giải nén được · /api/agent/skill');
cleanup(); process.exit(0);
