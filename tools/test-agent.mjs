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
const steps = [
  ['get_part_spec', { slot: 'hat' }],
  ['save_part', { part: Object.assign({}, HAT, { layers: { hat: '<path d="M0,0" onload="alert(1)"/>' } }) }],
  ['save_part', { part: HAT }],
  ['save_character', { asset: { id: 'ai-mix', name: 'Phối bởi AI', status: 'review', look: { eyes: 'round', brows: 'normal', parts: { hat: 'local.my/ai-hat' } }, identity: { must: [] } } }],
  ['save_character', { asset: { id: 'ai-mix', name: 'Phối bởi AI', status: 'review', look: { eyes: 'round', brows: 'normal', parts: { hat: 'local.my/ai-hat' } }, identity: { must: ['hat:ai-hat'] } } }],
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
  ok(L[3] && !L[3].ok && /identity|nhận diện/.test(L[3].summary), 'nhân vật "chờ duyệt" thiếu dấu nhận diện bị chặn (luật chung)');
  ok(L[4] && L[4].ok, 'sửa xong thì lưu được');
  ok(L[5] && !L[5].ok && /không có trong nhà xưởng/.test(L[5].summary), 'tool hệ thống (update_app) bị từ chối với AI trong chatroom');
  const parts = await api('GET', '/api/parts'), assets = await api('GET', '/api/assets');
  ok(parts.some(p => p.id === 'ai-hat') && assets.some(a => a.id === 'ai-mix' && a.look.parts.hat === 'local.my/ai-hat'), 'kết quả nằm trong kho, đúng chuẩn');
  const put = await fetch('http://127.0.0.1:' + APP + '/api/assets/local.my/lach-cong', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, body: JSON.stringify({ name: 'Lách', look: { eyes: 'round', brows: 'normal', parts: { hat: 'ufo' } } }) });
  ok(put.status === 422, 'API HTTP của Studio cũng đi qua cổng kiểm (linh kiện lạ → 422)');
} catch (e) { fail = 1; console.log('   ✗', e.message); }
finally { srv.kill(); mock.close(); }
process.exit(fail);
