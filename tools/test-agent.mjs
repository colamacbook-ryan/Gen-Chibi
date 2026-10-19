// Kiểm AI trong chatroom (LLM API) đi đúng cổng nhà xưởng: dùng LLM giả lập chuẩn OpenAI, kịch bản tất định.
// Chứng minh: model chỉ ghi được qua tool; SVG độc bị chặn; tool hệ thống bị từ chối; cổng kiểm giống hệt MCP.
import http from 'http';
import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MOCK = 7490, APP = 7491;
const HAT = { id: 'ai-hat', slot: 'hat', label: 'Mũ do AI vẽ', layers: { hat: '<path d="M52,80 L100,28 L148,80 Z" fill="{hat}" stroke="{ink}" stroke-width="2.8"/>' }, views: { q45: 'same' } };
let steps = [
  ['get_part_spec', { slot: 'hat' }],
  ['save_part', { part: Object.assign({}, HAT, { layers: { hat: '<path d="M0,0" onload="alert(1)"/>' } }) }],
  ['save_part', { part: HAT }],
  ['save_character', { asset: { id: 'ai-mix', name: 'Phối bởi AI', status: 'published', look: { eyes: 'round', brows: 'normal', parts: { hat: 'local.my/ai-hat' } }, identity: { must: [] } } }],
  ['save_character', { asset: { id: 'ai-mix', name: 'Phối bởi AI', status: 'published', look: { eyes: 'round', brows: 'normal', parts: { hat: 'local.my/ai-hat' } }, identity: { must: ['hat:ai-hat'] } } }],
  ['update_app', {}]
];
let sawTools = null;
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d).on('end', () => {
    const body = JSON.parse(b), done = body.messages.filter(m => m.role === 'tool').length;
    sawTools = body.tools.map(t => t.function.name);
    const msg = done < steps.length
      ? { role: 'assistant', content: '', tool_calls: [{ id: 'c' + done, type: 'function', function: { name: steps[done][0], arguments: JSON.stringify(steps[done][1]) } }] }
      : { role: 'assistant', content: 'Đã tạo mũ và phối nhân vật.' };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
}).listen(MOCK);
const home = mkdtempSync(path.join(tmpdir(), 'gc-agent-'));
const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: String(APP), GC_NO_AUTOCHECK: '1' }, stdio: 'ignore' });
const api = (m, p, body) => fetch('http://127.0.0.1:' + APP + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
let fail = 0; const ok = (c, m) => { if (c) console.log('   ✓', m); else { fail = 1; console.log('   ✗', m); } };
try {
  for (let i = 0; i < 40; i++) { try { await api('GET', '/api/health'); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  await api('PUT', '/api/ai', { provider: 'custom', baseUrl: 'http://127.0.0.1:' + MOCK + '/v1', apiKey: 'test-key', model: 'mock' });
  const r = await api('POST', '/api/ai/agent', { messages: [{ role: 'user', content: 'Vẽ một chiếc mũ rồi phối vào nhân vật mới.' }] });
  const L = r.log || [];
  ok(sawTools && sawTools.includes('save_part') && !sawTools.includes('update_app') && !sawTools.includes('rollback_app'), 'AI nhận đúng bộ tool MCP (trừ tool hệ thống)');
  ok(L[1] && !L[1].ok && /onload/.test(L[1].summary), 'SVG độc bị chặn ở cùng cổng với MCP');
  ok(L[2] && L[2].ok, 'linh kiện hợp lệ được lưu qua save_part');
  ok(L[3] && !L[3].ok && /identity|nhận diện/.test(L[3].summary), 'nhân vật "phát hành" thiếu dấu nhận diện bị chặn (luật chung)');
  ok(L[4] && L[4].ok, 'sửa xong thì lưu được');
  ok(L[5] && !L[5].ok && /không có trong nhà xưởng/.test(L[5].summary), 'tool hệ thống (update_app) bị từ chối với AI trong chatroom');
  const parts = await api('GET', '/api/parts'), assets = await api('GET', '/api/assets');
  ok(parts.some(p => p.id === 'ai-hat') && assets.some(a => a.id === 'ai-mix' && a.look.parts.hat === 'local.my/ai-hat'), 'kết quả nằm trong kho, đúng chuẩn');
  const put = await fetch('http://127.0.0.1:' + APP + '/api/assets/local.my/lach-cong', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ name: 'Lách', look: { eyes: 'round', brows: 'normal', parts: { hat: 'ufo' } } }) });
  ok(put.status === 422, 'API HTTP của Studio cũng đi qua cổng kiểm (linh kiện lạ → 422)');
  // Giai đoạn ③: AI đạo diễn của một tác phẩm — thiếu nhân vật thì tự tạo ở Xưởng (từ khung, đúng dự án), rồi chia phân cảnh và viết lời thoại
  const w = await api('POST', '/api/works', { title: 'Phim CI', project: 'ci-phim' });
  ok(w.id === 'phim-ci' && w.project === 'ci-phim', 'tạo tác phẩm qua API');
  const EV = { title: 'Gặp nhau', steps: [{ actor: 'ai-be-na', state: 'proud', spot: 'left', say: 'Chào!' }, { actor: 'ma-no-canh', state: 'shock', spot: 'right', say: 'Ơ, bạn là ai?' }] };
  steps = [
    ['list_characters', {}],
    ['save_shot', { work: 'phim-ci', shot: { title: 'Gặp gỡ', scene: 'gen.khung/san-khau-chuan', cast: ['ai-be-na', 'ma-no-canh'] } }],
    ['save_character', { asset: { id: 'ai-be-na', name: 'Bé Na', project: 'ci-phim', look: { eyes: 'round', brows: 'normal', parts: { hat: 'gen.khung/khoi-mu' }, palette: { hat: '#e05a5a' } } } }],
    ['save_shot', { work: 'phim-ci', shot: { title: 'Gặp gỡ', description: 'Bé Na gặp ma-nơ-canh', scene: 'gen.khung/san-khau-chuan', cast: ['ai-be-na', 'ma-no-canh'] } }],
    ['save_shot', { work: 'phim-ci', shot: { id: 'canh-1', event: Object.assign({}, EV, { steps: [{ actor: 'ai-be-na', state: 'bay', say: 'x' }] }) } }],
    ['save_shot', { work: 'phim-ci', shot: { id: 'canh-1', event: EV } }]
  ];
  const c = await api('POST', '/api/works/phim-ci/chat', { message: 'Làm cảnh Bé Na gặp ma-nơ-canh.' });
  const CL = c.log || []; if (process.env.DBG) console.log(JSON.stringify(CL, null, 1));
  ok(CL[1] && !CL[1].ok && /ai-be-na/.test(CL[1].summary), 'phân cảnh dùng nhân vật chưa có → bị chặn, chỉ đường sang Xưởng');
  ok(CL[2] && CL[2].ok, 'AI tự tạo nhân vật thiếu ở Xưởng');
  ok(CL[3] && CL[3].ok && CL[4] && !CL[4].ok && /bay/.test(CL[4].summary) && CL[5] && CL[5].ok, 'phân cảnh + lời thoại qua cổng kiểm của đạo diễn (sai thì sửa)');
  const wf = await api('GET', '/api/works/phim-ci'), na = (await api('GET', '/api/assets')).find(a => a.id === 'ai-be-na');
  ok(wf.shots.length === 1 && wf.shots[0].event && wf.shots[0].event.scene === 'gen.khung/san-khau-chuan' && wf.shots[0].cast.length === 2, 'tác phẩm có phân cảnh đủ cảnh + diễn viên + lời thoại');
  ok(na && na.project === 'ci-phim', 'nhân vật AI tạo nằm trong dự án của tác phẩm');
  const keep = await api('POST', '/api/works/phim-ci/shots', { shot: { id: 'canh-1' }, remove: 'false' });
  ok(keep.shots && keep.shots.length === 1, 'remove phải là true thật mới bỏ phân cảnh ("false" không xoá)');
  const many = await fetch('http://127.0.0.1:' + APP + '/api/works/phim-ci/shots', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ shot: { id: 7, title: 'x' } }) });
  ok(many.status === 422, 'shot.id không phải chuỗi bị chặn');
  const th = await api('GET', '/api/chats/work/phim-ci');
  ok(th.messages.length === 2 && th.messages[1].log.length === 6, 'lịch sử chat được lưu theo tác phẩm (data/chats/work-<id>.json, kèm nhật ký tool)');
  ok(th.messages[1].anchors && th.messages[1].anchors.some(a => a.anchor === 'shot:phim-ci/canh-1') && th.messages[1].anchors.some(a => a.anchor === 'asset:local.my/ai-be-na'), 'thứ AI vừa tạo / sửa (nhân vật, phân cảnh) có anchor để dock hiện chip');
} catch (e) { fail = 1; console.log('   ✗', e.message); }
finally { srv.kill(); mock.close(); }
process.exit(fail);
