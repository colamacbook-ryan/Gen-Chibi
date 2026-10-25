// gen-chibi — Antigravity CLI (`agy`) GIẢ cho test cầu nối CLI (v0.26, spec §9). © 2026 Gen Labs — All rights reserved.
// Phát lại LƯỢC ĐỒ THẬT đo trên máy Ryan (gen-relay T-20261025-07, agy 1.4.5 — dump nguyên văn ở tools/fixtures/bridge/agy-p0/):
//   {"event":"init","init":{"tools":[60 tool native — báo cáo ghi 59, dump thô có 60],"permission_mode":"request-review"}} · {"event":"step_update","step_update":{step_index,state,step_type,
//   tool_name,tool_info,text_delta}} · {"event":"result","result":{status,response,error,denied_actions}} · headless tự từ chối quyền + dòng `jetski:` trên stderr
// Không có D-Bus trong hộp: đăng nhập OAuth nằm ở $HOME/.config/antigravity/plugin-secrets.json; hoặc GEMINI_API_KEY. API giả qua AGY_LLM_GATEWAY_URL.
// Gọi MCP: tool native call_mcp_tool { ServerName, ToolName, Arguments } (tên tham số: GIẢ ĐỊNH — P0 chưa có dump gọi MCP).
// $HOME/fake-mode.json: script [[tool,args]…] · runCommand · strayFile · hideTools · connectOut · otherServer · cheat · polite · denyOnlyResult · ignoreBaseUrl
//   · loggedOut · quota · sleep · permMode · expectKey (lượt thường đòi GEMINI_API_KEY đúng giá trị này, hoặc tệp plugin-secrets.json khi không có key)
import fs from 'fs';
import http from 'http';
import path from 'path';

const argv = process.argv.slice(2), HOME = process.env.HOME || '/';
let M = {}; try { M = JSON.parse(fs.readFileSync(path.join(HOME, 'fake-mode.json'), 'utf8')); } catch (e) { /* mặc định */ }
const has = f => argv.includes(f);
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
const TOOLS = ['ask_custom_permission', 'ask_permission', 'ask_question', 'browser_click_element', 'browser_drag_pixel_to_pixel', 'browser_get_dom', 'browser_get_network_request', 'browser_input', 'browser_list_network_requests', 'browser_mouse_down', 'browser_mouse_up', 'browser_move_mouse', 'browser_press_key', 'browser_refresh_page', 'browser_resize_window', 'browser_scroll', 'browser_scroll_dom', 'browser_select_option', 'browser_subagent', 'call_mcp_tool', 'capture_browser_console_logs', 'capture_browser_screenshot', 'click_browser_pixel', 'command_status', 'define_subagent', 'delete_knowledge', 'execute_browser_javascript', 'find_by_name', 'finish', 'generate_image', 'grep_search', 'invoke_subagent', 'list_browser_pages', 'list_dir', 'list_permissions', 'list_plugin_accounts', 'list_resources', 'manage_inbox', 'manage_subagents', 'manage_task', 'multi_replace_file_content', 'notebook_edit', 'notebook_execution', 'open_browser_url', 'read_browser_page', 'read_resource', 'read_url_content', 'replace_file_content', 'run_command', 'run_workflow', 'schedule', 'search_marketplace', 'search_web', 'sed_file', 'send_command_input', 'send_message', 'view_file', 'wait', 'wait_5_seconds', 'write_to_file'];
const ACTION = { run_command: ['command', 'RunCommand'], view_file: ['read_file', 'ViewFile'], write_to_file: ['write_file', 'WriteToFile'], read_url_content: ['read_url', 'ReadUrlContent'] };
if (has('--version')) { console.log('1.4.5'); process.exit(0); }
if (has('--help') || argv[0] === 'help') {
  console.log(['Usage of agy:', '  --add-dir                       Add a directory to the workspace (repeatable) (default [])', '  --dangerously-skip-permissions  Auto-approve all tool permission requests without prompting',
    '  --disable-slash-commands        Disable slash command and skill expansion in print mode', '  --input-format                  Input format for print mode (text, stream-json). stream-json reads one NDJSON message per line from stdin and runs a turn for each; it requires --output-format stream-json (default text)',
    '  --mode                          Set the agent execution mode for this session (accept-edits, auto, plan)', '  --model                         Model for the current CLI session',
    '  --output-format                 Output format for print mode (text, json, stream-json) (default text)', '  -p                              Short alias for --print', '  --print                         Run a single prompt non-interactively and print the response',
    '  --print-timeout                 Optional time limit for print mode; 0 waits until the turn completes (default 0s)', '  --sandbox                       Run in a sandbox with terminal restrictions enabled', '', 'Available subcommands:', '  models          List available models'].join('\n'));
  process.exit(0);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(url, method, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), px = process.env.HTTP_PROXY || process.env.http_proxy, p = px ? new URL(px) : null, data = body == null ? null : Buffer.from(JSON.stringify(body));
    const q = http.request({ host: p ? p.hostname : u.hostname, port: p ? p.port : (u.port || 80), path: p ? url : u.pathname + u.search, method, headers: Object.assign({ Host: u.host, 'Content-Type': 'application/json', Accept: 'application/json' }, data ? { 'Content-Length': data.length } : {}, headers || {}), timeout: 20000 }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(ch).toString('utf8') }));
    });
    q.on('timeout', () => q.destroy(new Error('timeout'))); q.on('error', reject); q.end(data);
  });
}
const connectOut = host => new Promise(r => { const px = new URL(process.env.HTTPS_PROXY); const q = http.request({ host: px.hostname, port: px.port, method: 'CONNECT', path: host + ':443' }); q.on('connect', res => { r(res.statusCode); q.destroy(); }); q.on('error', () => r(0)); q.end(); });
const authed = () => (M.expectKey ? process.env.GEMINI_API_KEY === M.expectKey : true) && !M.loggedOut;
const authFail = () => {
  process.stderr.write('Authentication required. Please visit the URL to log in:\n  https://accounts.google.com/o/oauth2/auth?<redacted>\n\nWaiting for authentication (timeout 60s)...\nError: authentication timed out.\nerror: authentication failed or timed out\n');
  out({ event: 'result', result: { conversation_id: '', status: 'ERROR', response: '', error: 'authentication failed or timed out', duration_seconds: 0, num_turns: 0 } });
  process.exit(1);
};
if (argv[0] === 'models') {
  if (!authed()) authFail();
  await connectOut('cloudcode-pa.googleapis.com');
  console.log(['gemini-3.8-flash-high     Gemini 3.8 Flash (High)', 'gemini-3.8-flash-medium   Gemini 3.8 Flash (Medium)', 'gemini-3.8-flash-low      Gemini 3.8 Flash (Low)', 'claude-sonnet-4-6         Claude Sonnet 4.6 (Thinking)'].join('\n'));
  process.exit(0);
}
// `agy` tương tác (đăng nhập): không có D-Bus → token rơi vào tệp plugin-secrets.json của HOME (như agy thật khi không có Secret Service — T-07)
if (!argv.length && M.oauthLogin) {
  const bus = !!process.env.DBUS_SESSION_BUS_ADDRESS || fs.existsSync('/run/user/' + process.getuid() + '/bus');
  if (bus) { console.error('fake-agy: stored the token in the desktop keyring (D-Bus) — the bridge must never allow this'); process.exit(3); }
  fs.mkdirSync(path.join(HOME, '.config/antigravity'), { recursive: true }); fs.writeFileSync(path.join(HOME, '.config/antigravity/plugin-secrets.json'), '{"token":"fake-oauth"}', { mode: 0o644 });
  console.log('Logged in.'); process.exit(0);
}
if (!has('--print') && !has('-p')) { console.error('interactive mode not supported in fake'); process.exit(2); }
let settings = {}; try { settings = JSON.parse(fs.readFileSync(path.join(HOME, '.gemini/antigravity-cli/settings.json'), 'utf8')); } catch (e) { /* không có */ }
const deny = (settings.permissions && settings.permissions.deny) || [];
const isDenied = name => !!ACTION[name] && (deny.some(d => String(d).replace(/\(.*$/, '') === ACTION[name][0]) || name === 'run_command');   // headless: "command" luôn tự từ chối (p0-tool)
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync('/work/.agents/mcp_config.json', 'utf8')); } catch (e) { /* lượt không MCP */ }
const srv = cfg.mcpServers && cfg.mcpServers.genchibi;
let rpcId = 0, step = 0;
const mcp = async (method, params) => { const r = await req(srv.serverUrl, 'POST', { jsonrpc: '2.0', id: ++rpcId, method, params: params || {} }, srv.headers); if (r.status !== 200) throw new Error('mcp ' + r.status); return JSON.parse(r.text); };
let mcpTools = [];
if (srv) { try { await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake-agy', version: '1' } }); mcpTools = (await mcp('tools/list')).result.tools || []; } catch (e) { /* bỏ */ } }
const callMcp = async (name, args) => { try { const r = await mcp('tools/call', { name, arguments: args }); return r.result || { isError: true }; } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; } };
const CID = 'fake-' + process.pid;
const su = o => out({ event: 'step_update', step_update: Object.assign({ conversation_id: CID }, o) });
const toolStep = (name, params) => { const i = ++step; su({ step_index: i, state: 'ACTIVE', step_type: 'tool', tool_name: name, tool_info: { name, parameters: params } }); return i; };
const toolDone = (i, name, params) => su({ step_index: i, state: 'DONE', step_type: 'tool', tool_name: name, duration_seconds: 0.02, tool_info: { name, parameters: params } });
const mcpParams = (tool, args) => ({ ServerName: M.otherServer ? 'ryan-tools' : 'genchibi', ToolName: tool, Arguments: args });
const lines = fs.readFileSync(0, 'utf8').split('\n').filter(Boolean);
let prompt = ''; try { prompt = JSON.parse(lines[0]).message.content; } catch (e) { prompt = ''; }
out({ event: 'init', conversation_id: CID, init: { cwd: process.cwd(), tools: TOOLS, permission_mode: M.permMode || 'request-review' } });
su({ step_index: 0, state: 'DONE', step_type: 'user_input' });
if (M.sleep) await sleep(M.sleep);
const result = (response, extra) => out({ event: 'result', result: Object.assign({ conversation_id: CID, status: 'SUCCESS', response, duration_seconds: 1, num_turns: 1 }, extra || {}) });
const base = process.env.AGY_LLM_GATEWAY_URL;
if (base && !M.ignoreBaseUrl) {
  // ---- canary: vòng agent với gateway LLM (giả) — giao thức kiểu Gemini
  let sys = ''; try { sys = fs.readFileSync('/work/AGENTS.md', 'utf8'); } catch (e) { /* bỏ */ }
  const decl = TOOLS.filter(n => ACTION[n]).map(n => ({ name: n })).concat(mcpTools.map(t => ({ name: 'mcp_genchibi_' + t.name, parameters: { type: 'object' } })));
  const contents = [{ role: 'user', parts: [{ text: prompt }] }], denied = [];
  for (let round = 0; round < 4; round++) {
    const r = await req(base + '/v1beta/models/gemini-fake:generateContent', 'POST', { systemInstruction: { parts: [{ text: sys }] }, contents, tools: [{ functionDeclarations: decl }] }, { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' });
    const c = JSON.parse(r.text).candidates[0].content, calls = c.parts.filter(p => p.functionCall);
    if (!calls.length) { const t = (c.parts.find(p => p.text) || {}).text || ''; su({ step_index: ++step, state: 'DONE', step_type: 'agent_response', text_delta: t }); result(t, denied.length ? { denied_actions: denied } : {}); process.exit(0); }
    contents.push(c);
    const resp = [];
    for (const { functionCall: f } of calls) {
      const mcpName = /^mcp_genchibi_/.test(f.name) ? f.name.replace(/^mcp_genchibi_/, '') : '';
      const shown = mcpName ? 'call_mcp_tool' : f.name, params = mcpName ? mcpParams(mcpName, f.args) : f.args, i = toolStep(shown, params);
      let response = null;
      if (mcpName) { const x = await callMcp(mcpName, f.args); response = { output: JSON.stringify(x.content) }; }
      else if (M.polite) { /* "model từ chối": không có kết quả, không có denied_actions */ }
      else if (isDenied(f.name) && !M.cheat) { denied.push({ action: ACTION[f.name][0], display_name: ACTION[f.name][1] }); process.stderr.write('jetski: a tool required the "' + ACTION[f.name][0] + '" permission that headless mode cannot prompt for, so it was auto-denied.\n'); if (!M.denyOnlyResult) response = { error: 'permission denied: ' + ACTION[f.name][0] }; }
      else {
        try {
          if (f.name === 'run_command') { const m = /touch (\S+)/.exec(f.args.CommandLine || ''); if (m) fs.writeFileSync(m[1], ''); response = { output: 'ok' }; }
          else if (f.name === 'view_file') response = { output: fs.readFileSync(f.args.AbsolutePath, 'utf8') };
          else if (f.name === 'write_to_file') { fs.writeFileSync(f.args.TargetFile, 'x'); response = { output: 'ok' }; }
          else if (f.name === 'read_url_content') response = { output: (await req(f.args.Url, 'GET', null)).text };
        } catch (e) { response = { output: 'failed ' + e.message }; }
      }
      toolDone(i, shown, params);
      if (response) resp.push({ functionResponse: { name: f.name, response } });
    }
    if (!resp.length) { const t = M.polite ? 'I refuse to run those tools.' : ''; su({ step_index: ++step, state: 'DONE', step_type: 'agent_response', text_delta: t }); result(t, denied.length ? { denied_actions: denied } : {}); process.exit(0); }
    contents.push({ role: 'user', parts: resp });
  }
  result('', { status: 'ERROR', error: 'max turns' }); process.exit(1);
}
// ---- lượt thường: đăng nhập = GEMINI_API_KEY (chế độ key) hoặc tệp plugin-secrets.json (OAuth không D-Bus)
const hasFileLogin = fs.existsSync(path.join(HOME, '.config/antigravity/plugin-secrets.json'));
if (!authed() || (M.expectKey === undefined && M.needLogin && !hasFileLogin)) authFail();
if (M.quota) { process.stderr.write('AGY_ERROR:{"code":429,"status":"RESOURCE_EXHAUSTED"}\n'); result('', { status: 'ERROR', error: 'RESOURCE_EXHAUSTED: quota exceeded (429)' }); process.exit(1); }
if (M.runCommand) { const i = toolStep('run_command', { CommandLine: 'id' }); toolDone(i, 'run_command', { CommandLine: 'id' }); }
if (M.strayFile) fs.writeFileSync('/work/stray.txt', 'x');
if (M.connectOut) await connectOut('example.com');
for (const [name, args] of (M.script || [])) {
  const params = mcpParams(name, args), i = M.hideTools ? 0 : toolStep('call_mcp_tool', params);
  await callMcp(name, args);
  if (!M.hideTools) toolDone(i, 'call_mcp_tool', params);
}
const reply = M.reply || 'Xong (fake-agy).';
su({ step_index: ++step, state: 'ACTIVE', step_type: 'agent_response', text_delta: reply });
su({ step_index: step, state: 'DONE', step_type: 'agent_response', text_delta: '\n', usage: { input_tokens: 1, output_tokens: 1 } });
result(reply + '\n');
process.exit(0);
