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
const cited = [...new Set([...corpus.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(m => m[1]))].filter(n => /^(get|list|save|validate|render|preview|import|export|install|update|rollback|start|lint)_/.test(n));
const stale = cited.filter(n => names.indexOf(n) < 0);
ok(!stale.length, 'hướng dẫn nhắc tool không tồn tại: ' + stale.join(', '));
const topicIds = Agent.topics().map(t => t.id), table = [...(Agent.guide('guide').split(/^## 4\. /m)[1] || '').split(/^## 5\. /m)[0].matchAll(/^\| `([a-z-]+)` \|/gm)].map(m => m[1]);   // chỉ bảng ở mục 4 (mục 1 có bảng kênh / phạm vi)
ok(JSON.stringify(topicIds.slice().sort()) === JSON.stringify(table.slice().sort()), 'bảng chủ đề GUIDE.md lệch thư mục workflows: ' + table + ' ↔ ' + topicIds);
ok(!/<!-- example: /.test(corpus), 'còn ví dụ không nhúng được (thiếu tệp agent/examples)');
ok(Agent.rules().length >= 8, 'luật vàng đọc từ GUIDE.md thiếu');
ok(Agent.rules().every(r => /[.)]$/.test(r)) && Agent.rules()[0].includes('An unknown value is always rejected.'), 'luật vàng phải đủ câu (gồm các dòng nối tiếp), không cắt ở dòng đầu: ' + Agent.rules().find(r => !/[.)]$/.test(r)));
console.log('   ✓ hướng dẫn phủ đủ ' + names.length + ' tool · không nhắc tool lạ · ' + topicIds.length + ' chủ đề khớp bảng · mọi ví dụ nhúng được · ' + Agent.rules().length + ' luật vàng');

// ---------- 0b. MỘT nguồn luật cho agent (CNS-068): MCP initialize, start_here, AI chatroom đều SINH từ server/rules.js (lõi: luật vàng GUIDE.md §3)
const Rules = require(path.join(ROOT, 'server/rules.js'));
{
  // (a) tĩnh: không tệp server nào khác viết chữ dặn agent — câu ≥ 40 ký tự của rules.js / luật vàng không được chép sang, và không có dấu hiệu luật tự viết
  const others = fs.readdirSync(path.join(ROOT, 'server')).filter(f => /\.js$/.test(f) && f !== 'rules.js' && f !== 'agent.js');
  const lits = src => [...src.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map(m => m[0].slice(1, -1));
  const own = lits(fs.readFileSync(path.join(ROOT, 'server/rules.js'), 'utf8')).filter(x => x.length >= 40).concat(Agent.rules().map(r => r.slice(0, 60)));
  const MARK = /^(You are |ROLE: |RULES: |REPLY LANGUAGE|DIALOGUE LANGUAGE|GOLDEN RULES|SPOTLIGHT|UI DATA|PROPOSED EDITS|REVIEW RIGHTS|OPEN WORK|PROCESS: |FIRST call start_here|Never invent)/;
  const hits = [];
  others.forEach(f => { const src = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8'), L = lits(src);
    own.forEach(x => { if (src.includes(x)) hits.push(f + ': chép "' + x.slice(0, 50) + '…"'); });
    L.forEach(x => { if (MARK.test(x)) hits.push(f + ': luật tự viết "' + x.slice(0, 50) + '…"'); }); });
  ok(!hits.length, 'chữ dặn agent nằm ngoài server/rules.js (CNS-068): ' + hits.slice(0, 5).join(' · '));
  // (b) động: mỗi bề mặt == đúng đầu ra của rules.js cho kênh / khu / tác phẩm đó (thêm một dòng ở bề mặt nào là trượt)
  const { loadEngine } = require(path.join(ROOT, 'server/engine-node.js')), { Store } = require(path.join(ROOT, 'server/store.js')), MM = require(path.join(ROOT, 'server/mcp.js'));
  const RT = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-zero-rules-'));
  try {
    const m = new MM.MCP({ engine: loadEngine(ROOT), store: new Store(RT), version: 'rules', uiLang: () => 'en' });
    m.saveWorkChecked({ id: 'phim-luat', title: 'Luật', project: 'du-an-luat', lang: 'yue' });
    const writeTools = Rules.writeToolsOf(TOOLS), chans = { owner: {}, link: { viaLink: true }, 'mcp:read': MM.scopeCtx('mcp:read'), 'mcp:write': MM.scopeCtx('mcp:write'), 'mcp:owner': MM.scopeCtx('mcp:owner'), studio: { channel: 'ui' } };
    for (const [k, ctx] of Object.entries(chans)) {
      const ins = (await m.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx)).result.instructions, sh = m.startHere(ctx);
      ok(ins === Rules.mcp(ctx, TOOLS), 'initialize (' + k + '): instructions phải đúng Rules.mcp — có chữ ngoài nguồn');
      ok(JSON.stringify(sh.rules) === JSON.stringify(Rules.golden()) && sh.instructions === Rules.START.read && sh.errors === Rules.START.errors && Object.values(Rules.CONNECTION_NOTE).includes(sh.connection.note), 'start_here (' + k + '): luật / lời dặn / ghi chú kênh phải lấy từ rules.js');
      if (ctx.readOnly) ok(!writeTools.some(n => ins.includes(n)) && !/save_/.test(ins), 'kết nối chỉ đọc không được nghe về tool ghi: ' + writeTools.filter(n => ins.includes(n)).join(', '));
      else ok(Rules.golden().every(r => ins.includes(r)), 'initialize (' + k + '): thiếu luật vàng');
    }
    for (const z of Object.keys(MM.ZONES)) for (const lang of ['en', 'vi']) {
      const ctx = MM.cleanContext({ zone: z, lang, object: { kind: 'work', id: 'phim-luat' } }), w = MM.ZONES[z].work ? m.store.getWork('phim-luat') : null;
      ok(m.uiSystem(ctx) === Rules.chat({ zone: z, lang, work: w }), 'AI chatroom (' + z + '/' + lang + '): chỉ dẫn hệ thống phải đúng Rules.chat');
      ok(Rules.golden().every(r => m.uiSystem(ctx).includes(r)), 'AI chatroom (' + z + '): LLM của chủ phải nhận đủ luật vàng');
    }
    ok(/DIALOGUE LANGUAGE of the film: Cantonese/.test(m.uiSystem(MM.cleanContext({ zone: 'tao-tac', object: { kind: 'work', id: 'phim-luat' } }))) && MM.workInstructions === Rules.workInstructions && MM.INSTRUCTIONS === Rules.mcp({}, TOOLS), 'khu Tạo tác: luật tác phẩm (ngôn ngữ lời thoại) từ rules.js; INSTRUCTIONS xuất ra = Rules.mcp');
  } finally { fs.rmSync(RT, { recursive: true, force: true }); }
  console.log('   ✓ một nguồn luật (CNS-068): không tệp server nào chép / tự viết luật · initialize × ' + 6 + ' kênh, start_here, AI chatroom × ' + Object.keys(MM.ZONES).length + ' khu × 2 ngôn ngữ = đúng đầu ra rules.js · kết nối chỉ đọc không nghe về ' + Rules.writeToolsOf(TOOLS).length + ' tool ghi');
}

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
// thư viện âm (v0.18): CHỈ bằng hướng dẫn — spec → danh sách → mẫu → kiểm → lưu → ghép → chấm luật; luật S1–S7 trong hướng dẫn sinh từ engine
ok(/\*\*S1\*\*/.test(G.sound) && /\*\*S7\*\*/.test(G.sound) && /`vo-chuoi`/.test(G.sound) && !/<!-- generated:/.test(G.sound), 'hướng dẫn sound phải nhúng luật S1–S7 + công thức mẫu sinh từ engine');
const sndPack = exampleIn(G.sound, 'sound-pack.json'), sndTrack = exampleIn(G.sound, 'sound-track.json');
await good('get_sound_spec', {}, r => r.structuredContent.rules.length === 7 && r.structuredContent.recipes.length >= 5 && r.structuredContent.example && r.structuredContent.kinds.mallet);
await good('list_sounds', { project: project.id, cat: 'danh' }, r => r.structuredContent.sounds.some(x => x.name === 'wham') && r.structuredContent.sounds.every(x => x.cat === 'danh'));
await good('get_sound_pack', { id: 'gen.am', names: ['bonk'] }, r => r.structuredContent.sounds.bonk && Object.keys(r.structuredContent.sounds).length === 1);
await good('validate_sound_pack', { pack: sndPack }, r => r.structuredContent.sounds === 2);
await good('save_sound_pack', { pack: sndPack }, r => r.structuredContent.version === 1);
await good('list_sounds', { project: project.id, q: 'bonk' }, r => r.structuredContent.sounds.some(x => x.name === 'wooden-bonk' && x.pack === sndPack.id));
await good('lint_sound_track', sndTrack, r => r.structuredContent.ok === true && r.structuredContent.issues.length === 0);
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
ok(bundle.motionPacks.length === 1 && bundle.characters.length === 1 && bundle.works.length === 1 && bundle.soundPacks.length === 1 && bundle.soundPacks[0].id === sndPack.id, 'gói dự án thiếu mục: ' + JSON.stringify({ m: bundle.motionPacks.length, c: bundle.characters.length, w: bundle.works.length, s: bundle.soundPacks.length }));
console.log('   ✓ chỉ bằng hướng dẫn + ví dụ nguyên văn: dự án → linh kiện → trang bị → nhân vật (có binh khí) → cảnh → gói động tác → gói âm (spec → danh sách → mẫu → kiểm → lưu → chấm luật S1–S7) → phim (' + pv.structuredContent.beats.length + ' nhịp, sẵn sàng) → hoạt ảnh → gói dự án đủ mục');

// ---------- 2b. phiên bản tác phẩm + khôi phục không phá + storyboard + phim HTML + get_event (CNS-047) — qua HTTP như agent thật
{
  const v0 = (await good('list_work_versions', { work: work.id })).structuredContent;
  ok(v0.work === work.id && v0.versions[0].current === true && v0.versions.length >= 2 && v0.versions.every((v, i) => !i || v.version < v0.versions[i - 1].version), 'list_work_versions: bản đang dùng đứng đầu, mới nhất trước: ' + JSON.stringify(v0).slice(0, 200));
  const before = (await good('get_work', { id: work.id })).structuredContent, keep = before.version;
  await good('save_work', { id: work.id, title: 'Renamed by mistake' });
  const rs = (await good('restore_work_version', { work: work.id, version: keep })).structuredContent;
  const after = (await good('get_work', { id: work.id })).structuredContent, v1 = (await good('list_work_versions', { work: work.id })).structuredContent;
  ok(rs.restored === true && rs.from === keep && rs.version === keep + 2 && after.title === before.title && JSON.stringify(after.shots) === JSON.stringify(before.shots), 'restore_work_version: nội dung về đúng bản ' + keep + ', lưu thành bản MỚI: ' + JSON.stringify(rs));
  ok(v1.versions.some(v => v.version === keep + 1 && v.title === 'Renamed by mistake' && !v.current) && v1.versions.length === v0.versions.length + 2, 'khôi phục KHÔNG phá: trạng thái trước khi khôi phục còn trong lịch sử (bản ' + (keep + 1) + ')');
  const ec = await call('restore_work_version', { work: work.id, version: rs.version }), en = await call('restore_work_version', { work: work.id, version: 999 }), ew = await call('list_work_versions', { work: 'khong-co' });
  ok(ec.isError && ec.structuredContent.error.code === 'CONFLICT' && en.isError && en.structuredContent.error.code === 'NOT_FOUND' && en.structuredContent.error.allowed.indexOf(keep) >= 0 && ew.isError && ew.structuredContent.error.code === 'NOT_FOUND', 'khôi phục: bản đang dùng → CONFLICT, bản không có → NOT_FOUND kèm danh sách, tác phẩm lạ → NOT_FOUND');
  const sb = await good('get_storyboard', { work: work.id }), sv = sb.content[1].resource;
  ok(sv.mimeType === 'image/svg+xml' && /^<svg [^>]*viewBox="0 0 \d+ \d+"/.test(sv.text) && sv.text.includes('data:image/svg+xml;base64,') && sv.text.includes(shot.title) && sb.structuredContent.file === work.id + '-storyboard.svg', 'get_storyboard: SVG có ảnh phân cảnh + tiêu đề cảnh');
  const fm = await good('export_film_html', { work: work.id, lang: 'en' }), fr = fm.content[1].resource, fd = JSON.parse(fr.text.match(/var DATA = (\{.*?\});\nvar FILM/s)[1]);
  ok(fr.mimeType === 'text/html' && /^<!doctype html>/.test(fr.text) && fr.text.includes('/* engine/player.js */') && fd.characters.some(c => c.id === asset.id && c.voice && c.voice.role) && fd.motionPacks.some(m => m.id === pack.id) && fm.structuredContent.ready === 1 && /\.html$/.test(fm.structuredContent.file), 'export_film_html: một tệp HTML có engine + nhân vật (giọng chốt) + gói động tác phim dùng: ' + fm.content[0].text.slice(0, 200));
  const evId = (await good('save_event', { event: shot.event, author: 'zero' })).structuredContent.id, ev = (await good('get_event', { id: evId })).structuredContent, e0 = await call('get_event', { id: 'khong-co' });
  ok(ev.id === evId && ev.event.steps.length === shot.event.steps.length && e0.isError && e0.structuredContent.error.code === 'NOT_FOUND', 'get_event: trả nguyên kịch bản; id lạ → NOT_FOUND');
  const pj = (await good('list_projects', {})).structuredContent.items.find(p => p.id === project.id);
  ok(pj && pj.motionPacks === 1 && pj.soundPacks === 1 && pj.works === 1 && pj.characters === 1, 'list_projects đếm cả gói động tác / gói âm / tác phẩm (CNS-069): ' + JSON.stringify(pj));
  console.log('   ✓ phiên bản tác phẩm: list_work_versions (mới nhất trước) · restore_work_version giữ trạng thái hiện tại thành một bản rồi ghi bản MỚI (không mất gì) · CONFLICT / NOT_FOUND có mã · get_storyboard (SVG) · export_film_html (một tệp HTML, engine + asset + gói động tác) · get_event');
}

// ---------- 2c. rào của phiên bản / phim HTML (trong tiến trình): phạm vi kênh, "Đạt" không đi theo nội dung khôi phục, trần cỡ phim + giọng AI đã có
{
  const { loadEngine } = require(path.join(ROOT, 'server/engine-node.js')), { Store } = require(path.join(ROOT, 'server/store.js')), MM = require(path.join(ROOT, 'server/mcp.js')), GV = require(path.join(ROOT, 'engine/voices.js'));
  const RT = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-zero-film-')), CLIP = path.join(RT, 'clip.wav');
  fs.writeFileSync(CLIP, Buffer.alloc(300 * 1024, 7));
  const fakeVoice = { publicConfig: () => ({ hasKey: true, cached: 1 }), clipFile: () => CLIP };
  try {
    const m = new MM.MCP({ engine: loadEngine(ROOT), store: new Store(RT), version: 'film', uiLang: () => 'en', voice: fakeVoice });
    ok(!(await m.callTool('install_sample', { id: 'mau-fun-office' }, {})).isError, 'cài bộ mẫu Fun Office');
    const W = m.store.listWorks()[0].id, w0 = m.store.getWork(W), sid = w0.shots[0].id, keep = w0.version;
    // phạm vi: mcp:read không khôi phục được (cổng readOnlyHint), mcp:write / link được — như save_work
    const ro = await m.callTool('restore_work_version', { work: W, version: keep - 1 }, MM.scopeCtx('mcp:read'));
    ok(ro.isError && ro.structuredContent.error.code === 'FORBIDDEN' && m.store.getWork(W).version === keep, 'mcp:read: restore_work_version → FORBIDDEN, tác phẩm không đổi');
    ok(!(await m.callTool('list_work_versions', { work: W }, MM.scopeCtx('mcp:read'))).isError && !(await m.callTool('export_film_html', { work: W, voices: false }, MM.scopeCtx('mcp:read'))).isError, 'mcp:read: xem lịch sử + xuất phim (chỉ đọc) được');
    // chủ duyệt "Đạt" cảnh đầu, agent đổi mô tả cảnh rồi chủ duyệt lại; khôi phục về bản cũ (mô tả khác) → cảnh về "Nháp" + ghi chú máy; ghi chú của chủ còn nguyên
    m.saveWorkChecked({ id: W, review: { shots: { [sid]: { status: 'ok', notes: [{ text: 'Đẹp' }] } } } }, { by: 'owner' });
    const base = m.store.getWork(W).version;
    m.saveShotChecked({ work: W, shot: Object.assign({}, m.store.getWork(W).shots[0], { description: 'Mô tả mới' }) });
    m.saveWorkChecked({ id: W, review: { shots: { [sid]: { status: 'ok' } } } }, { by: 'owner' });
    ok(m.store.getWork(W).review.shots[sid].status === 'ok', 'chuẩn bị: cảnh đã "Đạt" sau khi sửa');
    const rw = await m.callTool('restore_work_version', { work: W, version: base }, MM.scopeCtx('mcp:write')), rv = m.store.getWork(W).review.shots[sid];
    ok(!rw.isError && m.store.getWork(W).shots[0].description !== 'Mô tả mới' && rv.status === 'draft' && rv.notes.some(n => n.by === 'system') && rv.notes.some(n => n.text === 'Đẹp' && n.by === 'owner'), 'khôi phục: cảnh "Đạt" đổi nội dung → "Nháp" + ghi chú máy, ghi chú của chủ giữ nguyên: ' + JSON.stringify(rv).slice(0, 200));
    // giọng AI đã lồng: nhúng clip có sẵn theo khoá câu; voices:false bỏ; quá trần thì bỏ clip; quá trần cả khi không clip → BAD_REQUEST
    const w1 = m.store.getWork(W), L = GV.lang(w1.lang), cast = {};
    w1.shots.forEach(s => (s.cast || []).forEach(k => { const a = m.findAsset(k); if (a) cast[a.id] = 'Charon'; }));
    m.saveWorkChecked({ id: W, voices: { [L + '|' + GV.accent(L, w1.accent)]: cast } }, { by: 'owner' });
    const f1 = (await m.callTool('export_film_html', { work: W }, {})).structuredContent, f0 = (await m.callTool('export_film_html', { work: W, voices: false }, {})).structuredContent;
    ok(f1.aiVoices.have > 0 && f1.aiVoices.have === f1.aiVoices.total && f0.aiVoices.have === 0 && f1.bytes > f0.bytes + 300 * 1024 && !f1.voicesDropped, 'phim HTML nhúng clip giọng AI đã có (' + f1.aiVoices.have + ' câu); voices:false bỏ clip');
    const m2 = new MM.MCP({ engine: m.GC, store: m.store, version: 'film', uiLang: () => 'en', voice: fakeVoice, filmMaxMB: (f0.bytes + 1024) / 1048576 });
    const f2 = await m2.callTool('export_film_html', { work: W }, {});
    ok(!f2.isError && f2.structuredContent.voicesDropped === true && f2.structuredContent.aiVoices.have === 0 && f2.structuredContent.bytes < f0.bytes + 64, 'quá trần cỡ phim → bỏ clip giọng AI, nói rõ trong kết quả');
    const m3 = new MM.MCP({ engine: m.GC, store: m.store, version: 'film', uiLang: () => 'en', filmMaxMB: 0.1 }), f3 = await m3.callTool('export_film_html', { work: W }, {});
    ok(f3.isError && f3.structuredContent.error.code === 'BAD_REQUEST', 'quá trần cả khi không clip → [BAD_REQUEST]');
  } finally { fs.rmSync(RT, { recursive: true, force: true }); }
  console.log('   ✓ rào: mcp:read không khôi phục được (xem / xuất được) · khôi phục không mang "Đạt" sang nội dung khác · phim nhúng clip giọng AI đã lồng, quá trần thì bỏ clip, quá trần hẳn → BAD_REQUEST');
}

// ---------- 3. hợp đồng lỗi: mã ổn định + path + gợi ý; tự sửa theo path rồi qua
const bad = JSON.parse(JSON.stringify(pack)); bad.id = 'zero-sai'; bad.actions = { bonkTwo: { label: 'x', clips: ['bonk'], attack: true } }; bad.clips.bonk.keys[0][0] = 99;
const e1 = await call('validate_motion_pack', { pack: bad }), er = e1.structuredContent && e1.structuredContent.error;
ok(e1.isError && /^\[VALIDATION_FAILED\]/.test(e1.content[0].text) && er && er.code === 'VALIDATION_FAILED' && er.details.some(d => d.path === 'clips.bonk.keys[0][0]') && er.hint, 'lỗi phải có [CODE] + structuredContent.error.details[].path + hint: ' + e1.content[0].text.slice(0, 200));
bad.clips.bonk.keys[0][0] = 0.16;   // "agent" sửa đúng path được chỉ
await good('validate_motion_pack', { pack: bad });
const e2 = await call('render_action', { character: 'gen.khung/ma-no-canh', action: 'thrust' });
ok(e2.isError && e2.structuredContent.error.code === 'VALIDATION_FAILED' && e2.structuredContent.error.allowed.indexOf('punch') >= 0, 'tay không gọi đòn binh khí phải bị chặn kèm danh sách đòn làm được');
const e5 = await call('lint_sound_track', { steps: [{ actor: 'a', state: 'normal', say: '', sfx: ['bonkk'] }] }), er5 = e5.structuredContent && e5.structuredContent.error;
ok(e5.isError && /^\[VALIDATION_FAILED\]/.test(e5.content[0].text) && er5.details.some(d => d.path === 'steps[0].sfx[0]' && /closest: "bonk"/.test(d.message)), 'lint_sound_track: tên âm lạ phải là lỗi có path + gợi ý tên gần nhất: ' + e5.content[0].text.slice(0, 240));
const e6 = await call('save_shot', { work: work.id, shot: Object.assign({}, shot, { id: 'canh-am-sai', event: Object.assign({}, shot.event, { steps: shot.event.steps.map((s, i) => i === 0 ? Object.assign({}, s, { sfx: ['bonkk'] }) : s) }) }) });
ok(e6.isError && e6.structuredContent.error.details.some(d => d.path === 'shot.event.steps[0].sfx' && /closest: "bonk"/.test(d.message)), 'save_shot với âm lạ phải bị chặn tại shot.event.steps[0].sfx kèm gợi ý: ' + e6.content[0].text.slice(0, 240));
const e7 = await call('validate_sound_pack', { pack: Object.assign({}, sndPack, { id: 'am-sai', sounds: { 'wooden-bonk': sndPack.sounds['wooden-bonk'] } }) });
ok(e7.isError && e7.structuredContent.error.details.some(d => d.path === 'sounds.wooden-bonk' && /sound name already used by pack "example-agent-sounds"/.test(d.message)), 'tên âm trùng gói khác phải bị chặn, nêu gói giữ tên: ' + e7.content[0].text.slice(0, 240));
const e3 = await call('get_guide', { topic: 'khong-co' });
ok(e3.isError && e3.structuredContent.error.code === 'NOT_FOUND' && e3.structuredContent.error.allowed.indexOf('film') >= 0, 'chủ đề lạ phải NOT_FOUND kèm danh sách');
const e4 = await call('save_motion_pack', { pack: Object.assign({}, pack, { id: 'zero-trung', actions: { punch: pack.actions.bonk } }) });
ok(e4.isError && /action id is already used by the core frame/.test(e4.content[0].text), 'id hành động trùng khung phải bị chặn');
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
// ---------- 6. giới hạn lô JSON-RPC + CLI `genchibi agent` chạy thật với server này (không ghi đè tệp người dùng, token không lộ)
const batch = n => fetch(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...H2 }, body: JSON.stringify(Array.from({ length: n }, (x, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'tools/list', params: {} }))) });
ok((await batch(21)).status === 413, 'lô JSON-RPC 21 lời gọi phải 413');
const b2 = await batch(2); ok(b2.status === 200 && (await b2.json()).length === 2, 'lô 2 lời gọi phải trả 2 kết quả');
const CH = path.join(H, 'cli-home'), U = path.join(H, 'du-an-cua-ban'), FB = path.join(H, 'bin'), LOG = path.join(H, 'curl-argv.log');
fs.mkdirSync(CH); fs.mkdirSync(U); fs.mkdirSync(FB);
const CHH = path.join(H, 'cli-user-home'); { const t = path.join(CHH, '.local/lib/gen-chibi'); fs.mkdirSync(t, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(t, 'installs'), 'native ' + fs.realpathSync(CH) + '\n', { mode: 0o600 }); }   // bản ghi native như trình cài ghi; HOME riêng (không chạm HOME thật)
fs.writeFileSync(path.join(CH, '.env'), 'GC_MODE=native\nGC_PORT=' + PORT + '\nGC_API_TOKEN=' + TOKEN + '\n');
const realCurl = execFileSync('bash', ['-c', 'command -v curl'], { encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(FB, 'curl'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> ' + JSON.stringify(LOG) + '\nexec ' + JSON.stringify(realCurl) + ' "$@"\n', { mode: 0o755 });
const cli = (args, cwd) => { try { return { code: 0, out: execFileSync('bash', [path.join(ROOT, 'cli/genchibi')].concat(args), { cwd: cwd || U, encoding: 'utf8', env: { ...process.env, GC_HOME: CH, GC_CLI_INNER: '1', PATH: FB + ':' + process.env.PATH, HOME: CHH }, stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; } };
fs.writeFileSync(path.join(U, 'GEMINI.md'), 'ghi chú riêng của tôi\n');
const r1 = cli(['agent', 'skill', 'gemini']);
ok(r1.code !== 0 && fs.readFileSync(path.join(U, 'GEMINI.md'), 'utf8') === 'ghi chú riêng của tôi\n', 'agent skill không được ghi đè GEMINI.md của người dùng: ' + r1.out.slice(0, 200));
const r2 = cli(['agent', 'skill', 'gemini', '--force']);
ok(r2.code === 0 && /generated by `genchibi agent skill`/.test(fs.readFileSync(path.join(U, 'GEMINI.md'), 'utf8')), '--force phải thay GEMINI.md');
const r3 = cli(['agent', 'skill', 'codex']);   // cài vào thư mục người gọi (không phải thư mục cài)
ok(r3.code === 0 && fs.existsSync(path.join(U, 'AGENTS.md')) && !fs.existsSync(path.join(CH, 'AGENTS.md')), 'agent skill phải cài vào thư mục đang đứng: ' + r3.out.slice(0, 200));
const SK = path.join(H, 'skills'); const r4 = cli(['agent', 'skill', 'claude', '--dir', SK]), r5 = cli(['agent', 'skill', 'claude', '--dir', SK]);
ok(r4.code === 0 && r5.code === 0 && fs.existsSync(path.join(SK, 'gen-chibi/SKILL.md')), 'cài lại skill Claude (tệp do lệnh sinh) phải được: ' + r5.out.slice(0, 200));
// v0.23.1: gói skill do app gửi là dữ liệu không tin — đích có liên kết cài sẵn (gen-chibi → thư mục khác) không bao giờ bị ghi xuyên, kể cả --force
{ const SK2 = path.join(H, 'skills-link'), TGT = path.join(H, 'noi-khac'); fs.mkdirSync(SK2); fs.mkdirSync(TGT); fs.symlinkSync(TGT, path.join(SK2, 'gen-chibi'));
  const r6 = cli(['agent', 'skill', 'claude', '--dir', SK2, '--force']);
  ok(r6.code !== 0 && fs.readdirSync(TGT).length === 0 && r6.out.includes(path.join(SK2, 'gen-chibi')), 'agent skill: đích là liên kết cài sẵn → dừng, không ghi xuyên (kể cả --force): ' + r6.out.slice(0, 200)); }
// vòng 5: đích nằm TRONG thư mục cài (app đổi được) → từ chối, cả khi đứng trong thư mục cài lẫn --dir trỏ vào đó
{ const r7 = cli(['agent', 'skill', 'codex'], CH), r8 = cli(['agent', 'skill', 'claude', '--dir', path.join(CH, 'x', 'y')]);
  ok(r7.code !== 0 && r8.code !== 0 && !fs.existsSync(path.join(CH, 'AGENTS.md')) && !fs.existsSync(path.join(CH, 'x')) && /inside the install folder/.test(r7.out + r8.out), 'agent skill: đích trong thư mục cài → từ chối: ' + (r7.out + r8.out).slice(0, 200)); }
const tp = cli(['agent', 'topics']); ok(tp.code === 0 && /"id":"film"/.test(tp.out), 'agent topics qua token phải chạy: ' + tp.out.slice(0, 120));
const con = cli(['agent', 'connect']); ok(con.code === 0 && /start_here/.test(con.out) && con.out.indexOf(TOKEN) < 0, 'agent connect không được in token');
const CLI_ABS = path.join(ROOT, 'cli/genchibi');
ok(con.out.includes('[mcp_servers.gen-chibi]\n                   command = "' + CLI_ABS + '"\n                   args = ["mcp"]'), 'cấu hình Codex phải là TOML nhiều dòng, command = đường TUYỆT ĐỐI của lệnh (CNS-269)');
// CNS-275: cùng thứ tự với thẻ nối agent của Studio — stdio (đường tuyệt đối) trước, HTTP + token sau; JSON Cursor / Gemini mặc định là stdio
{ const iStd = con.out.indexOf('claude mcp add -s user gen-chibi -- ' + CLI_ABS + ' mcp'), iHttp = con.out.indexOf('claude mcp add -s user --transport http gen-chibi http');
  ok(iStd > 0 && iHttp > iStd && con.out.indexOf('"command":"' + CLI_ABS + '","args":["mcp"]') > 0 && /^\s+stdio\s/m.test(con.out.split('Claude Code')[0]), 'agent connect: stdio với đường tuyệt đối đứng đầu (Địa chỉ + Claude Code + JSON), HTTP + token là lựa chọn sau', con.out.slice(0, 600)); }
const argv = fs.readFileSync(LOG, 'utf8'); ok(argv.length && argv.indexOf(TOKEN) < 0, 'token không được nằm trong argv của curl (lộ trong ps)');
// giọng AI qua HTTP: cấu hình không lộ key, thiếu key → 409 rõ ràng, clip lạ / leo thư mục → 404
const vc = await (await fetch(BASE + '/api/voice', { headers: H2 })).json();
ok(vc.hasKey === false && vc.enabled === false && vc.voices.length >= 20 && JSON.stringify(vc).indexOf(TOKEN) < 0, 'GET /api/voice sai: ' + JSON.stringify(vc).slice(0, 120));
const vp = { method: 'POST', headers: { ...H2, 'content-type': 'application/json', 'x-gc-request': '1' } };
await fetch(BASE + '/api/voice', Object.assign({}, vp, { method: 'PUT', body: JSON.stringify({ enabled: true }) }));
const vl = await fetch(BASE + '/api/voice/line', Object.assign({}, vp, { body: JSON.stringify({ text: 'Xin chào', voice: 'Charon', state: 'normal' }) }));
ok(vl.status === 409 && /key/i.test((await vl.json()).error), 'đọc giọng khi chưa có key phải 409 nhắc key');
for (const bad of ['../../secrets.enc.json', '..%2F..%2Fai.json', 'abc.wav', '0'.repeat(40) + '.wav']) ok((await fetch(BASE + '/api/voice/clip/' + bad, { headers: H2 })).status === 404, 'clip lạ phải 404: ' + bad);
ok((await fetch(BASE + '/api/voice')).status === 401, '/api/voice không token phải 401');
console.log('   ✓ lô JSON-RPC > 20 → 413 · CLI thật: agent skill không ghi đè GEMINI.md của bạn (--force mới thay), cài vào thư mục đang đứng, cài lại skill Claude được · topics qua token · connect không in token, TOML Codex nhiều dòng · token không nằm trong argv của curl (' + argv.trim().split('\n').length + ' lần gọi curl) · /api/voice: không lộ key, thiếu key → 409, clip lạ / leo thư mục → 404, thiếu token → 401');
cleanup(); process.exit(0);
