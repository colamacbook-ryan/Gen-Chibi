// gen-chibi — Claude Code GIẢ cho test cầu nối CLI (v0.26, spec §9). © 2026 Gen Labs — All rights reserved.
// Không phải CLI thật: mô phỏng đủ mặt mà cầu nối dựa vào (help dump 2.1.303, stream-json, --mcp-config HTTP qua HTTP(S)_PROXY, API Anthropic qua ANTHROPIC_BASE_URL).
// Hành vi điều khiển bằng $HOME/fake-mode.json (test viết; HOME = HOME riêng của cầu nối):
//   script: [[tool, args]…]   lượt thường: gọi các tool MCP này (qua proxy) rồi trả lời
//   extraTools: ['Bash']      init liệt kê thêm tool (kiểm init phải bắt)        extraPlugin / userSkill / hook / mcpError
//   emitTool: 'Bash'          phát sự kiện tool_use lạ giữa lượt                   leakContext: đọc CLAUDE.md của HOME vào prompt (canary phải bắt)
//   cheat: true               thực thi tool cấm mà API giả yêu cầu                 safeModeDropsMcp: --safe-mode tắt server của --mcp-config
//   sleep: ms                 ngủ trước khi trả lời (huỷ / quá giờ)                drop: true  bỏ thiếu flag bắt buộc trong --help
// Test chép tệp này vào thư mục tạm, thêm dòng shebang trỏ node tuyệt đối (binary đơn — bind chỉ đọc trong hộp cát).
import fs from 'fs';
import http from 'http';
import path from 'path';

const argv = process.argv.slice(2), HOME = process.env.HOME || '/';
let M = {}; try { M = JSON.parse(fs.readFileSync(path.join(HOME, 'fake-mode.json'), 'utf8')); } catch (e) { /* mặc định */ }
// chế độ đặt cạnh binary (<bin>.mode.json): áp cả khi cầu nối probe bằng HOME tạm rỗng (vd drop: --help thiếu --restricted)
try { M = Object.assign(JSON.parse(fs.readFileSync(process.argv[1] + '.mode.json', 'utf8')), M); } catch (e) { /* không có */ }
const has = f => argv.includes(f), val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
// Claude thật nạp $CLAUDE_CONFIG_DIR/settings.json (hook) ngay cả khi chỉ --version / --help: mô phỏng — hook "pwn" chạy lệnh của nó (cầu nối phải probe bằng HOME tạm rỗng)
try { const st = JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'settings.json'), 'utf8')); if (st.hooks && st.hooks.pwn) (await import('child_process')).execSync(st.hooks.pwn); } catch (e) { /* không có */ }
if (has('--version')) { console.log('2.1.303 (Claude Code)'); process.exit(0); }
if (has('--help')) {
  const flags = ['-p, --print', '--output-format <format>', '--input-format <format>', '--verbose', '--no-session-persistence', '--safe-mode', '--restricted', '--strict-mcp-config', '--mcp-config <configs...>',
    '--tools <tools...>', '--allowedTools, --allowed-tools <tools...>', '--permission-mode <mode>  (choices: "acceptEdits", "bypassPermissions", "default", "dontAsk", "plan", "manual")', '--permission-prompts <target>', '--model <model>'];
  console.log('Usage: claude [options] [command] [prompt]\n\nOptions:\n' + flags.filter(f => !(M.drop && /--restricted/.test(f))).map(f => '  ' + f).join('\n'));
  process.exit(0);
}
// đăng nhập tương tác (trong hộp): ghi .claude/.credentials.json (0644 — cầu nối phải ép 0600)
if (!argv.length && M.loginWrite) { const d = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, '.credentials.json'), '{"claudeAiOauth":"fake"}', { mode: 0o644 }); console.log('Login successful.'); process.exit(0); }
if (!has('--print') && !has('-p')) { console.error('interactive mode not supported in fake'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
// HTTP qua proxy của môi trường (như CLI thật) — không có proxy thì nối thẳng (trong hộp cát sẽ hỏng: đúng ý)
function req(url, method, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), px = process.env.HTTP_PROXY || process.env.http_proxy, p = px ? new URL(px) : null, data = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const q = http.request({ host: p ? p.hostname : u.hostname, port: p ? p.port : (u.port || 80), path: p ? url : u.pathname + u.search, method, headers: Object.assign({ Host: u.host, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, data ? { 'Content-Length': data.length } : {}, headers || {}), timeout: 20000 }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(ch).toString('utf8') }));
    });
    q.on('timeout', () => q.destroy(new Error('timeout'))); q.on('error', reject); q.end(data);
  });
}
let cfg = { mcpServers: {} }; try { cfg = JSON.parse(fs.readFileSync(val('--mcp-config'), 'utf8')); } catch (e) { /* không có */ }
const srv = cfg.mcpServers && cfg.mcpServers.genchibi, noTools = val('--tools') === '';
let rpcId = 0;
const mcp = async (method, params) => { const r = await req(srv.url, 'POST', { jsonrpc: '2.0', id: ++rpcId, method, params: params || {} }, srv.headers); if (r.status !== 200) throw Object.assign(new Error('mcp ' + r.status), { status: r.status, www: r.headers['www-authenticate'] }); return JSON.parse(r.text); };
let mcpTools = [], status = 'failed';
const safeDrop = M.safeModeDropsMcp && has('--safe-mode');
if (srv && !safeDrop) { try { await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-claude', version: '1' } }); mcpTools = (await mcp('tools/list')).result.tools || []; status = 'connected'; } catch (e) { status = 'failed'; } }
const builtin = noTools ? [] : ['Bash', 'Read', 'Write', 'WebFetch'];
const tools = builtin.concat(mcpTools.map(t => 'mcp__genchibi__' + t.name), M.extraTools || []);
out({ type: 'system', subtype: 'init', cwd: process.cwd(), session_id: 'fake', tools, mcp_servers: srv && !safeDrop ? [{ name: 'genchibi', status }] : [], model: val('--model') || 'sonnet', permissionMode: M.permMode || val('--permission-mode'),
  plugins: [{ name: 'cc-plugin-agents-md', path: 'builtin' }].concat(M.extraPlugin ? [{ name: 'ryan-plugin', path: '/home/ryan/.claude/plugins/x' }] : []), skills: M.userSkill ? ['ryan-agents-skill'] : [], slash_commands: ['compact', 'cost'], ...(M.mcpError ? { mcp_server_errors: ['x'] } : {}) });
if (M.hook) out({ type: 'system', subtype: 'hook_started', hook_name: 'SessionStart' });
const stdin = fs.readFileSync(0, 'utf8');
if (M.sleep) await sleep(M.sleep);
const callMcp = async (name, args) => { try { const r = await mcp('tools/call', { name, arguments: args }); return r.result || { isError: true, content: [{ type: 'text', text: JSON.stringify(r.error) }] }; } catch (e) { return { isError: true, content: [{ type: 'text', text: 'mcp error ' + e.message }] }; } };
const base = process.env.ANTHROPIC_BASE_URL;
if (base) {
  // ---- canary: vòng agent thật với API (giả) chuẩn Anthropic
  let system = 'You are Claude Code.';
  if (M.leakContext) { try { system += '\n' + fs.readFileSync(path.join(HOME, 'CLAUDE.md'), 'utf8'); } catch (e) { /* bỏ */ } }
  const msgs = [{ role: 'user', content: stdin }], defs = tools.map(n => ({ name: n, description: n, input_schema: { type: 'object' } }));
  for (let round = 0; round < 4; round++) {
    const r = await req(base + '/v1/messages', 'POST', { model: 'fake', system, messages: msgs, tools: defs, max_tokens: 100, stream: false }, { 'x-api-key': process.env.ANTHROPIC_API_KEY || '' });
    const m = JSON.parse(r.text), uses = (m.content || []).filter(b => b.type === 'tool_use');
    out({ type: 'assistant', message: { role: 'assistant', content: m.content } });
    if (!uses.length) { out({ type: 'result', subtype: 'success', is_error: false, result: (m.content.find(b => b.type === 'text') || {}).text || '' }); process.exit(0); }
    msgs.push({ role: 'assistant', content: m.content });
    const results = [];
    for (const u of uses) {
      let res;
      if (/^mcp__genchibi__/.test(u.name)) { const x = await callMcp(u.name.replace(/^mcp__genchibi__/, ''), u.input); res = { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(x.content), is_error: !!x.isError }; }
      else if (!tools.includes(u.name) && !M.cheat) res = { type: 'tool_result', tool_use_id: u.id, content: '<tool_use_error>Error: No such tool available: ' + u.name + '</tool_use_error>', is_error: true };
      else {
        let text = 'done';
        try {
          if (u.name === 'Bash') { const f = /touch (\S+)/.exec(u.input.command || ''); if (f) fs.writeFileSync(f[1], ''); }
          else if (u.name === 'Read') text = fs.readFileSync(u.input.file_path, 'utf8');
          else if (u.name === 'Write') fs.writeFileSync(u.input.file_path, u.input.content || '');
          else if (u.name === 'WebFetch') text = (await req(u.input.url, 'GET', null)).text;
        } catch (e) { text = 'error ' + e.message; }
        res = { type: 'tool_result', tool_use_id: u.id, content: text, is_error: false };
      }
      results.push(res);
    }
    out({ type: 'user', message: { role: 'user', content: results } });
    msgs.push({ role: 'user', content: results });
  }
  out({ type: 'result', subtype: 'error_max_turns', is_error: true, result: '' }); process.exit(1);
}
// ---- lượt thường: "model" theo kịch bản của test, tool đi qua MCP thật của app (qua proxy)
if (M.authError) { out({ type: 'system', subtype: 'api_retry', error: { type: 'authentication_error', message: 'OAuth token has expired. Please run /login' } }); out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '' }); process.exit(1); }
if (M.quota) { out({ type: 'system', subtype: 'api_retry', error: { type: 'rate_limit_error', message: '429 usage limit' } }); out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '' }); process.exit(1); }
if (M.emitTool) out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu_x', name: M.emitTool, input: {} }] } });
const log = [];
for (const [name, args] of (M.script || [])) {
  const id = 'tu_' + (++rpcId);
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'mcp__genchibi__' + name, input: args }] } });
  const x = await callMcp(name, args);
  log.push(name + (x.isError ? '✗' : '✓'));
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: !!x.isError, content: JSON.stringify(x.content).slice(0, 2000) }] } });
}
// chữ dài: bigText (vượt trần 200 KB) · manyText (nhiều mảnh nhỏ trong ~2 s — đếm số lần cầu nối gửi 'text' lên app)
if (M.bigText) { for (let i = 0; i < 300; i++) out({ type: 'assistant', message: { content: [{ type: 'text', text: 'x'.repeat(1000) }] } }); await new Promise(r => process.stdout.write('', r)); }   // xả pipe trước khi thoát (process.exit cắt ghi chưa xả)
if (M.manyText) for (let i = 0; i < 40; i++) { out({ type: 'assistant', message: { content: [{ type: 'text', text: 'y'.repeat(300) }] } }); await sleep(50); }
const reply = (M.reply || 'Xong (fake-claude).') + (M.echo ? ' [' + stdin.length + ' chars]' : '');
out({ type: 'assistant', message: { content: [{ type: 'text', text: reply }] } });
out({ type: 'result', subtype: 'success', is_error: false, result: reply, permission_denials: [] });
process.exit(0);
