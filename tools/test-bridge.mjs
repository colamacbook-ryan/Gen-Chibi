// Kiểm phía MÁY CHỦ của cầu nối CLI (v0.26, spec v025-cli-bridge §9.1–§9.7, §9.10 root). © 2026 Gen Labs — All rights reserved.
// Không cần CLI thật: fake-claude / fake-agy (tools/fixtures/bridge), API giả + MCP giả của chính cầu nối, app giả (/mcp) cho lượt thường.
// Phần hộp cát chạy bwrap THẬT nếu máy có (và user namespace bật) — không có thì BỎ QUA có ghi rõ (CI Ubuntu thường không có bwrap / bị AppArmor chặn userns).
// Không ghi vào HOME thật: HOME / XDG_RUNTIME_DIR là thư mục tạm. Dùng: node tools/test-bridge.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import net from 'net';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const B = await import(path.join(ROOT, 'bridge/ai-bridge.mjs'));
let bad = 0;
const ok = (c, m, extra) => { if (c) console.log('   ✓ ' + m); else { bad = 1; console.log('   ✗ ' + m + (extra ? ' — ' + String(extra).slice(0, 700) : '')); } };
const tmp = [];
process.on('exit', () => tmp.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* bỏ */ } }));
const mk = p => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); fs.chmodSync(d, 0o700); tmp.push(d); return d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// môi trường giả: HOME (có .ssh / CLAUDE.md của "owner"), XDG_RUNTIME_DIR NGOÀI HOME, bin chứa CLI giả (binary đơn, shebang node tuyệt đối)
function world() {
  const T = mk('gc-tb-'), H = path.join(T, 'home'), X = path.join(T, 'xdg'), BIN = path.join(T, 'bin');
  for (const d of [H, X, BIN]) fs.mkdirSync(d, { mode: 0o700 });
  fs.mkdirSync(path.join(H, '.ssh')); fs.writeFileSync(path.join(H, '.ssh/id_rsa'), 'OWNER-SECRET-KEY');
  fs.writeFileSync(path.join(H, 'CLAUDE.md'), 'OWNER CONTEXT');
  for (const n of ['claude', 'agy']) fs.writeFileSync(path.join(BIN, n), '#!' + fs.realpathSync(process.execPath) + '\n' + fs.readFileSync(path.join(ROOT, 'tools/fixtures/bridge/fake-' + n + '.mjs'), 'utf8'), { mode: 0o755 });
  const paths = B.bridgePaths({ HOME: H, XDG_RUNTIME_DIR: X, PATH: BIN + ':/usr/bin:/bin' });
  const mode = (n, m) => { fs.mkdirSync(paths.cliHome(n), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(paths.cliHome(n), 'fake-mode.json'), JSON.stringify(Object.assign(n === 'agy' ? { expectKey: KEY } : {}, m || {}))); };
  B.loginKey(paths, KEY);   // agy mặc định chế độ key (T-07): key AI Studio riêng, tệp 0600
  return { T, H, X, BIN, paths, mode };
}
const KEY = 'AIzaTESTkey' + 'k'.repeat(28);
const job0 = (cli, extra) => Object.assign({ kind: 'agent', cli, model: '', system: 'SYSTEM-TEXT-zz', context: 'UI DATA {}', messages: [{ role: 'user', content: 'hello USER-TEXT-qq' }], zone: 'xuong', readOnly: false }, extra || {});

/* ---------------------------------------------------------------- 1. dựng lệnh: argv + bwrap + env */
{
  const gcj = 'gcj_' + 'A'.repeat(43), j = job0('claude');
  const ent = { flags: ['--verbose', '--no-session-persistence', '--safe-mode'], safe_mode: true };
  const ca = B.ADAPTERS.claude.argv({ entry: ent, job: j, turnSec: 900, safeMode: true }), cs = B.ADAPTERS.claude.argv({ entry: ent, job: j, turnSec: 900, safeMode: false });
  const at = (a, f) => a.indexOf(f), val = (a, f) => a[a.indexOf(f) + 1];
  const aa = B.ADAPTERS.agy.argv({ entry: { flags: ['--sandbox'] }, job: job0('agy', { model: 'gemini-3.8-flash-low' }), turnSec: 900 });
  const files = B.ADAPTERS.claude.files({ job: j, gcj }).concat(B.ADAPTERS.agy.files({ job: job0('agy'), gcj }));
  const leak = ca.concat(aa).filter(x => /gcj_|http|SYSTEM-TEXT|USER-TEXT|UI DATA/.test(x));
  ok(at(ca, '--strict-mcp-config') >= 0 && val(ca, '--tools') === '' && val(ca, '--permission-mode') === 'dontAsk' && at(ca, '--restricted') >= 0 && val(ca, '--permission-prompts') === 'none'
    && val(ca, '--mcp-config') === '/work/mcp.json' && val(ca, '--allowedTools') === 'mcp__genchibi__*' && at(ca, '--safe-mode') >= 0 && at(cs, '--safe-mode') < 0 && at(ca, '--no-session-persistence') >= 0
    && val(aa, '--print-timeout') === '880s' && val(aa, '--input-format') === 'stream-json' && at(aa, '--disable-slash-commands') >= 0 && at(aa, '--sandbox') >= 0 && !leak.length
    && B.ADAPTERS.claude.stdin(j).includes('USER-TEXT-qq') && B.ADAPTERS.claude.stdin(j).indexOf('SYSTEM-TEXT') === 0 && JSON.parse(B.ADAPTERS.agy.stdin(job0('agy'))).message.content.includes('USER-TEXT')
    && files.every(f => f.ro) && JSON.stringify(files).includes(gcj) && JSON.stringify(files).includes(B.MCP_URL)
    && (() => { const c = JSON.parse(files[0].data).mcpServers.genchibi, g = JSON.parse(files.find(f => /mcp_config/.test(f.rel)).data).mcpServers.genchibi; return c.type === 'http' && c.url === B.MCP_URL && !c.command && !g.command && g.serverUrl === B.MCP_URL; })(),
    'dựng lệnh (snapshot): claude --print stream-json --restricted --strict-mcp-config --mcp-config /work/mcp.json --tools "" --allowedTools mcp__genchibi__* --permission-mode dontAsk --permission-prompts none (+ --safe-mode khi P0 cho) · agy --print-timeout 880s (trần − 20 s) --input-format stream-json --disable-slash-commands --sandbox · KHÔNG token / URL / nội dung trên argv (đi qua stdin + tệp chỉ đọc trong /work)', JSON.stringify({ ca, aa, leak }));
  const env = B.sandboxEnv('/h/claude-home', '/opt/x', B.ADAPTERS.claude.env({ home: '/h/claude-home' }));
  const ba = B.bwrapArgs({ home: '/h/claude-home', work: '/x/work', gc: '/x/gc', sock: '/x/p.sock', passwd: '/x/gc/passwd', binds: ['/opt/x/claude', '/usr/bin/node'], env, node: '/usr/bin/node', cmd: ['/opt/x/claude', '-p'] });
  const s = ba.join(' '), envKeys = []; ba.forEach((x, i) => { if (x === '--setenv') envKeys.push(ba[i + 1]); });
  ok(['--unshare-all', '--die-with-parent', '--new-session', '--clearenv'].every(f => ba.includes(f)) && s.includes('--cap-drop ALL') && s.includes('--tmpfs /home') && s.includes('--tmpfs /run') && s.includes('--ro-bind /usr /usr')
    && s.includes('--remount-ro /') && s.includes('--bind /x/work /work') && s.includes('--ro-bind /x/gc /work/.gc') && s.includes('--bind /x/p.sock /run/gc-proxy.sock') && s.includes('--chdir /work')
    && !s.includes('--ro-bind /usr/bin/node') && s.includes('--ro-bind /opt/x/claude /opt/x/claude') && ba.indexOf('--tmpfs') < ba.indexOf('/h/claude-home')
    && envKeys.sort().join() === ['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'CLAUDE_CONFIG_DIR', 'DISABLE_AUTOUPDATER', 'DISABLE_ERROR_REPORTING', 'DISABLE_TELEMETRY', 'HOME', 'HTTPS_PROXY', 'HTTP_PROXY', 'LANG', 'PATH', 'TERM', 'http_proxy', 'https_proxy'].join()
    && env.PATH === '/usr/bin:/bin:/opt/x' && env.HTTPS_PROXY === 'http://127.0.0.1:18080',
    'tham số bwrap: --unshare-all --die-with-parent --new-session --cap-drop ALL --clearenv · /usr chỉ đọc · tmpfs /home /tmp /run (trước mọi bind vào HOME) · gốc chỉ đọc · /work = thư mục lượt · shim chỉ đọc · socket proxy · env chỉ gồm danh sách cho phép (không token)', s.slice(0, 400) + ' ' + envKeys.join());
  const host = B.DEFAULT_CAPS, e1 = B.effCaps(host, { turnSec: 99999, toolCalls: 9999 }), e2 = B.effCaps(host, { turnSec: 120 });
  ok(host.turnSec === 900 && host.perHour === 100 && host.concurrent === 1 && e1.turnSec === 900 && e1.toolCalls === 60 && e2.turnSec === 120,
    'trần ở máy chủ (D10, CNS-322): mặc định 900 s / 100 lượt mỗi giờ / 1 lượt một lúc · Studio chỉ HẠ được (gửi 99999 s → 900 s, 120 s → 120 s)', JSON.stringify({ e1, e2 }));
}

/* ---------------------------------------------------------------- 2. kiểm job (HMAC, trường lạ, CLI chưa bật / chưa kiểm, model, cỡ) */
{
  const secret = 'ab'.repeat(32), reg = { clis: { claude: { confinement: { status: 'verified' }, models: { list: ['sonnet'] } }, agy: { confinement: { status: 'unverified', missing: ['fake API got no request'] }, models: { list: [] } } } };
  const env = (job, o) => { const p = Object.assign({ id: 'job12345', job, gcj: 'gcj_' + 'b'.repeat(43), exp: Date.now() + 60e3 }, o || {}); return Object.assign({}, p, { sig: B.signJob(secret, { id: p.id, job: p.job, gcj: p.gcj, exp: p.exp }) }); };
  const tryE = (e, en) => { try { B.checkEnvelope(e, { secret, reg, enabled: en || ['claude', 'agy'] }); return 'OK'; } catch (x) { return x.code + ':' + x.detail; } };
  const good = env(job0('claude', { model: 'sonnet' })), forged = Object.assign({}, good, { job: Object.assign({}, good.job, { system: 'evil' }) });
  const R = {
    good: tryE(good), forged: tryE(forged), nosig: tryE(Object.assign({}, good, { sig: '0'.repeat(64) })),
    mcpUrl: tryE(env(job0('claude', { mcpUrl: 'http://evil/mcp' }))), stdio: tryE(env(job0('claude', { mcp: { command: 'sh' } }))), cmd: tryE(env(job0('claude', { argv: ['--dangerously-skip-permissions'] }))),
    notEnabled: tryE(env(job0('claude')), ['agy']), unverified: tryE(env(job0('agy'))), model: tryE(env(job0('claude', { model: 'opus-evil' }))), cli: tryE(env(job0('codex'))),
    big: tryE(env(job0('claude', { context: 'x'.repeat(39000), system: 'y'.repeat(39000), messages: Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'z'.repeat(i === 39 ? 10 : 7000) })).concat([{ role: 'user', content: 'q' }]).slice(-40) }))),
    expired: tryE(env(job0('claude'), { exp: Date.now() - 1 })), zone: tryE(env(job0('claude', { zone: '../etc' }))), extraEnv: tryE(Object.assign({}, good, { url: 'x' })), msgKey: tryE(env(job0('claude', { messages: [{ role: 'user', content: 'x', name: 'sys' }] })))
  };
  ok(R.good === 'OK' && /^BAD_SIG/.test(R.forged) && /^BAD_SIG/.test(R.nosig) && /^BAD_JOB:unknown field mcpUrl/.test(R.mcpUrl) && /^BAD_JOB:unknown field mcp/.test(R.stdio) && /^BAD_JOB:unknown field argv/.test(R.cmd)
    && /^NOT_ENABLED/.test(R.notEnabled) && /^CONFINEMENT:agy: unverified/.test(R.unverified) && /^BAD_JOB:model/.test(R.model) && /^BAD_JOB:cli/.test(R.cli) && /^BAD_JOB:prompt too large/.test(R.big)
    && /^BAD_JOB:exp/.test(R.expired) && /^BAD_JOB:zone/.test(R.zone) && /^BAD_JOB:envelope/.test(R.extraEnv) && /^BAD_JOB:message/.test(R.msgKey),
    'kiểm job: sai HMAC / sửa nội dung sau khi ký → bỏ · trường lạ (URL MCP, MCP stdio, argv) → từ chối · CLI chưa bật / chưa kiểm khoá → từ chối · model ngoài registry · CLI lạ · prompt quá trần · hết hạn · khu lạ', JSON.stringify(R));
}

/* ---------------------------------------------------------------- 3. kiểm init của Claude + tên tool genchibi (security review #1) */
{
  const A = B.ADAPTERS.claude, base = { baseline: { plugins: ['cc-plugin-agents-md'], skills: [], slash_commands: ['compact'] } };
  const init = x => ({ t: 'init', raw: Object.assign({ permissionMode: 'dontAsk', tools: ['mcp__genchibi__get_catalog'], mcp_servers: [{ name: 'genchibi', status: 'connected' }], plugins: [{ name: 'cc-plugin-agents-md', path: 'builtin' }], skills: [], slash_commands: ['compact'] }, x) });
  const c = x => A.checkInit(init(x), base, { expectMcp: true }).join(' ');
  const R = { okk: c({}), bash: c({ tools: ['Bash', 'mcp__genchibi__x'] }), nomcp: c({ mcp_servers: [] }), failed: c({ mcp_servers: [{ name: 'genchibi', status: 'failed' }] }), errs: c({ mcp_server_errors: ['boom'] }),
    plugin: c({ plugins: [{ name: 'evil', path: '/home/ryan/x' }] }), skill: c({ skills: ['ryan-agents-skill'] }), slash: c({ slash_commands: ['compact', 'deploy-prod'] }), other: c({ mcp_servers: [{ name: 'genchibi', status: 'connected' }, { name: 'ryan', status: 'connected' }] }),
    builtinName: c({ tools: ['mcp__genchibi__run_command'] }), pmAuto: c({ permissionMode: 'auto' }), pmFoo: c({ permissionMode: 'foo' }), pmBypass: c({ permissionMode: 'bypassPermissions' }), pmNone: c({ permissionMode: undefined }) };
  const hook = A.parse({ type: 'system', subtype: 'hook_started' }), tool = A.parse({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: '1' }] } });
  ok(R.okk === '' && /tool:Bash/.test(R.bash) && /mcp_servers/.test(R.nomcp) && /mcp_servers/.test(R.failed) && /mcp_server_errors/.test(R.errs) && /plugin:evil/.test(R.plugin) && /skills:ryan-agents-skill/.test(R.skill) && /slash_commands:deploy-prod/.test(R.slash)
    && /mcp_servers/.test(R.other) && /tool:mcp__genchibi__run_command/.test(R.builtinName) && ['pmAuto', 'pmFoo', 'pmBypass', 'pmNone'].every(k => /permission_mode:/.test(R[k])) && hook[0].t === 'hook' && tool[0].t === 'tool' && tool[0].name === 'Bash',
    'kiểm init Claude (direct): có Bash · thiếu / hỏng genchibi · mcp_server_errors · plugin lạ · skill / lệnh của user · server MCP thứ hai → mỗi thứ là một lỗi · sự kiện hook_* nhận ra', JSON.stringify(R));
  const G = (n, c2) => B.isGenchibiTool(n, c2);
  ok(G('mcp__genchibi__save_character', 'claude') && G('mcp_genchibi_list_works', 'agy') && !G('run_command', 'agy') && !G('read_file', 'agy') && !G('save_character', 'claude') && !G('get_catalog', 'agy')
    && !G('mcp_genchibi_run_command', 'agy') && !G('mcp__genchibi__Bash', 'claude') && !G('mcp__genchibi__read_file', 'claude') && !G('mcp_genchibi_save_character', 'claude') && !G('mcp__genchibi__save_character', 'agy')
    && !G('mcp__genchibi__x; rm', 'claude') && !G('', 'claude') && !G('mcp__genchibi__get_catalog', 'codex'),
    'tên tool genchibi (security review #1): CHỈ đúng tiền tố MCP của CLI đó · tên trần (kể cả app liệt kê run_command / read_file) → không phải genchibi · phần sau tiền tố trùng tool cấm / có sẵn (run_command, Bash, read_file) → từ chối · tiền tố của CLI khác → từ chối');
}

/* ---------------------------------------------------------------- 3b. agy: lược đồ stream-json THẬT (P0 gen-relay T-20261025-07) */
{
  const A = B.ADAPTERS.agy, F = n => fs.readFileSync(path.join(ROOT, 'tools/fixtures/bridge/agy-p0', n), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const evOk = F('p0-ok.ndjson').flatMap(o => A.parse(o)), evTool = F('p0-tool.ndjson').flatMap(o => A.parse(o)), evAuth = F('p0-bwrap.ndjson').flatMap(o => A.parse(o));
  const initOk = evOk.find(x => x.t === 'init'), resOk = evOk.find(x => x.t === 'result'), tools = evTool.filter(x => x.t === 'tool'), resTool = evTool.find(x => x.t === 'result'), resAuth = evAuth.find(x => x.t === 'result');
  const bypass = A.checkInit({ raw: { event: 'init', init: { tools: [], permission_mode: 'bypassPermissions' } } }), noPm = A.checkInit({ raw: { event: 'init', init: { tools: [] } } });
  const odd = ['auto', 'foo', 'accept-edits', 'Request-Review', 'request-review ', 'plan'].map(m => A.checkInit({ raw: { event: 'init', init: { tools: [], permission_mode: m } } }).join());
  const mcpOk = A.parse({ event: 'step_update', step_update: { step_index: 3, state: 'ACTIVE', step_type: 'tool', tool_name: 'call_mcp_tool', tool_info: { name: 'call_mcp_tool', parameters: { ServerName: 'genchibi', ToolName: 'list_works' } } } })[0];
  const mcpOther = A.parse({ event: 'step_update', step_update: { step_index: 4, state: 'ACTIVE', step_type: 'tool', tool_name: 'call_mcp_tool', tool_info: { name: 'call_mcp_tool', parameters: { ServerName: 'ryan', ToolName: 'list_works' } } } })[0];
  const oddStep = A.parse({ event: 'step_update', step_update: { step_index: 5, state: 'ACTIVE', step_type: 'browser_action' } })[0];
  const cls = A.classify({ retries: [resAuth.error], resultText: '', stderr: fs.readFileSync(path.join(ROOT, 'tools/fixtures/bridge/agy-p0/p0-tool.err'), 'utf8'), stdoutErr: '' });
  ok(initOk && A.checkInit(initOk).length === 0 && initOk.raw.init.tools.length === 60 && evOk.filter(x => x.t === 'text').map(x => x.text).join('') === 'OK\n' && resOk.text === 'OK\n' && !resOk.isError && !evOk.some(x => x.t === 'tool')
    && tools.length === 2 && tools.every(x => x.name === 'run_command' && x.id === 'step2') && !B.isGenchibiTool('run_command', 'agy') && resTool.denied[0].action === 'command'
    && resAuth.isError && /authentication/.test(resAuth.error) && cls === 'AUTH_REQUIRED' && bypass.join() === 'permission_mode:bypassPermissions' && /permission_mode missing/.test(noPm.join()) && odd.every(x => /^permission_mode:/.test(x))
    && mcpOk.name === 'mcp_genchibi_list_works' && B.isGenchibiTool(mcpOk.name, 'agy') && mcpOther.name === 'call_mcp_tool' && !B.isGenchibiTool(mcpOther.name, 'agy') && oddStep.t === 'tool' && !B.isGenchibiTool(oddStep.name, 'agy')
    && JSON.stringify(B.ADAPTERS.agy.argv({ entry: { flags: ['--dangerously-skip-permissions'] }, job: job0('agy'), turnSec: 900 })).indexOf('dangerously') < 0,
    'agy (dump THẬT T-07): init 60 tool (báo cáo ghi 59 — đếm theo dump thô) + permission_mode request-review → kiểm init đạt · text_delta "OK" · run_command là sự kiện tool lạ (bước ACTIVE + DONE cùng id) · denied_actions [command] · bwrap không D-Bus → AUTH_REQUIRED · permission_mode ngoài allowlist [request-review] (auto, foo, plan, bypass, thiếu…) → chặn (security review #4) · call_mcp_tool chỉ server genchibi · bước lạ → coi là tool · không bao giờ --dangerously-skip-permissions',
    JSON.stringify({ init: initOk && A.checkInit(initOk), tools, deny: resTool && resTool.denied, cls, mcpOk, mcpOther }));
}

/* ---------------------------------------------------------------- 4. proxy: allowlist, route không prototype (security review #2), MCP → app */
{
  const T = mk('gc-tbp-'), sock = path.join(T, 'p.sock'), denied = [];
  const crash = e => { ok(false, 'proxy (security review #2): lỗi chưa bắt làm sập tiến trình', e && e.stack); process.exit(1); };
  process.on('uncaughtException', crash);
  let appHits = 0, canaryHits = 0, appMode = 'ok';
  const canary = http.createServer((q, s) => { canaryHits++; s.end('x'); }); await new Promise(r => canary.listen(0, '127.0.0.1', r));
  const app = http.createServer((q, s) => {
    let b = ''; q.on('data', d => b += d).on('end', () => {
      appHits++;
      if (appMode === '401') { s.writeHead(401, { 'WWW-Authenticate': 'Bearer resource_metadata="http://127.0.0.1:' + canary.address().port + '/.well-known/oauth-protected-resource"', 'Content-Type': 'application/json' }); return s.end('{"error":"x"}'); }
      s.writeHead(200, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer x', 'Set-Cookie': 'a=b' }); s.end(JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(b).id, result: { ok: true, auth: q.headers.authorization || '' } }));
    });
  });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  let auth = 0;
  const m = B.mcpToApp({ app: 'http://127.0.0.1:' + app.address().port, maxCalls: 2, onAuthFail: () => auth++ });
  const px = await B.startProxy({ sock, allow: ['api.anthropic.com'], routes: { [B.MCP_HOST]: m.handler, 'genchibi.boom': () => { throw new Error('boom'); } }, onDeny: h => denied.push(h) });
  const rq = (opts, body) => new Promise(r => { const q = http.request(Object.assign({ socketPath: sock, timeout: 4000 }, opts), res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r({ status: res.statusCode, headers: res.headers, body: b })); }); q.on('connect', res => { r({ status: res.statusCode }); q.destroy(); }); q.on('error', e => r({ status: 0, error: e.code })); q.on('timeout', () => { q.destroy(); r({ status: -1 }); }); q.end(body); });
  const post = (p, b, h) => rq({ method: 'POST', path: p, headers: Object.assign({ 'Content-Type': 'application/json', Host: 'genchibi.bridge' }, h || {}) }, JSON.stringify(b));
  const protoHosts = ['constructor', '__proto__', 'tostring', 'hasownproperty', 'valueof'];
  const pr = []; for (const h of protoHosts) pr.push((await rq({ method: 'GET', path: 'http://' + h + '/x' })).status);
  const boom = await rq({ method: 'GET', path: 'http://genchibi.boom/x' });
  const alive = await post('http://genchibi.bridge/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize' }, { Authorization: 'Bearer gcj_t' });
  ok(pr.every(s => s === 403) && boom.status === 502 && alive.status === 200 && protoHosts.every(h => denied.includes(h)),
    'proxy (security review #2): host constructor / __proto__ / toString / hasOwnProperty / valueOf → 403 (bảng route không prototype) · handler ném lỗi → 502 · proxy vẫn sống, MCP chạy tiếp', JSON.stringify({ pr, boom: boom.status, alive: alive.status }));
  const c1 = await rq({ method: 'CONNECT', path: 'example.com:443' }), c2 = await rq({ method: 'CONNECT', path: 'api.anthropic.com:80' }), c3 = await rq({ method: 'CONNECT', path: '10.0.0.1:443' });
  const other = await rq({ method: 'GET', path: 'http://169.254.169.254/latest/meta-data' }), wrongPath = await post('http://genchibi.bridge/api/info', {}), q2 = await post('http://genchibi.bridge/mcp?x=1', {});
  ok(c1.status === 403 && c2.status === 403 && c3.status === 403 && other.status === 403 && wrongPath.status === 403 && q2.status === 403 && px.stats.denied.some(d => d.host === 'example.com' && d.how === 'connect') && px.stats.denied.some(d => d.host === '169.254.169.254'),
    'proxy allowlist: CONNECT ngoài allowlist / sai cổng / IP LAN → 403 + ghi vào danh sách bị chặn (registry) · HTTP tới host khác (metadata cloud) → 403 · genchibi.bridge chỉ đúng POST/GET /mcp (không /api, không query)');
  let body1 = { result: {} }; try { body1 = JSON.parse(alive.body); } catch (e) { /* đột biến làm hỏng phản hồi: kiểm dưới sẽ đỏ */ }
  ok(alive.status === 200 && !alive.headers['www-authenticate'] && !alive.headers['set-cookie'] && body1.result.auth === 'Bearer gcj_t',
    'MCP → app: chép Authorization của lượt, BỎ WWW-Authenticate / Set-Cookie trong phản hồi (CNS-303)');
  const l1 = await post('http://genchibi.bridge/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'a' } }), l2 = await post('http://genchibi.bridge/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'b' } });
  const l3 = await post('http://genchibi.bridge/mcp', { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'c' } }), hitsAt = appHits;
  appMode = '401';
  const a401 = await post('http://genchibi.bridge/mcp', { jsonrpc: '2.0', id: 5, method: 'tools/list' });
  ok(JSON.parse(l1.body).result.ok && JSON.parse(l2.body).result.ok && /\[LIMIT\]/.test(JSON.parse(l3.body).result.content[0].text) && hitsAt === 3 && m.st.calls === 3,
    'trần lời gọi tool ở MÁY CHỦ (proxy đếm tools/call): quá trần → [LIMIT] trả ngay, không tới app', JSON.stringify({ l3: l3.body.slice(0, 120), hitsAt }));
  ok(a401.status === 403 && !a401.headers['www-authenticate'] && auth === 1 && !/resource_metadata/.test(a401.body) && canaryHits === 0,
    'MCP 401 + metadata trỏ cổng canary → proxy trả 403 KHÔNG WWW-Authenticate, báo để giết CLI · không request nào tới cổng canary', JSON.stringify({ s: a401.status, auth, canaryHits }));
  await px.close(); app.close(); canary.close();
  process.off('uncaughtException', crash);
}

/* ---------------------------------------------------------------- 5. đường dẫn, tệp bí mật, root */
{
  const W = world();
  let under = ''; try { B.runBase(B.bridgePaths({ HOME: W.H, XDG_RUNTIME_DIR: path.join(W.H, '.cache') })); } catch (e) { under = e.code + ':' + e.detail; }
  fs.mkdirSync(path.join(W.H, 'rt'), { mode: 0o700 });
  let under2 = ''; try { B.runBase(B.bridgePaths({ HOME: W.H, XDG_RUNTIME_DIR: path.join(W.H, 'rt') })); } catch (e) { under2 = e.code + ':' + e.detail; }
  const base = B.runBase(W.paths);
  const f = path.join(W.T, 'tok'); fs.writeFileSync(f, 'gcb_x', { mode: 0o644 }); let loose = ''; try { B.readPrivate(f); } catch (e) { loose = e.code; }
  fs.symlinkSync(f, f + '.l'); let sym = ''; try { B.readPrivate(f + '.l'); } catch (e) { sym = e.code; }
  ok(/NO_RUNTIME/.test(under) && /under HOME/.test(under2) && base.startsWith(fs.realpathSync(W.X)) && (fs.statSync(base).mode & 0o777) === 0o700 && loose === 'NOT_INSTALLED' && sym === 'NOT_INSTALLED',
    'thư mục lượt ở $XDG_RUNTIME_DIR/gen-chibi-bridge (0700), XDG dưới HOME → từ chối (CNS-301) · token / HMAC phải là tệp 0600 thường (không symlink)', JSON.stringify({ under, under2 }));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bridge/ai-bridge.mjs'), 'status'], { env: { HOME: W.H, PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
  const isRoot = process.getuid() === 0;
  ok(B.refuseRoot(0) && !B.refuseRoot(1000) && (isRoot ? r.status === 2 && /refusing to run as root/.test(r.stderr) : r.status === 0),
    'cầu nối TỪ CHỐI chạy bằng root (khác live hook — CNS-315)' + (isRoot ? ': chạy thật bằng root → thoát 2' : ' (máy test không phải root: kiểm hàm + chạy thường)'), r.status + ' ' + r.stderr);
  // Linux không có bwrap (hoặc selftest chưa đạt) → KHÔNG chạy CLI nào, kể cả Claude (CNS-323)
  const noSb = { clis: { claude: { installed: true, real: '/usr/bin/true', version: 'x', sandbox: { bwrap: 'missing' }, confinement: { status: 'verified' } } } }, posted = [];
  const ns = await B.runJob({ id: 'jobNOSANDBOX', gcj: 'gcj_' + 'n'.repeat(43), job: job0('claude') }, { paths: W.paths, reg: noSb, caps: B.DEFAULT_CAPS, app: 'http://127.0.0.1:9', post: async ph => { posted.push(ph); return {}; } }).catch(e => ({ code: 'THROW ' + e.code }));
  noSb.clis.claude.sandbox = { bwrap: 'ok', path: '/usr/bin/bwrap', selftest: [{ id: 'netns-lo-only', ok: false }] };
  const ns2 = await B.runJob({ id: 'jobNOSANDBOX', gcj: 'gcj_' + 'n'.repeat(43), job: job0('claude') }, { paths: W.paths, reg: noSb, caps: B.DEFAULT_CAPS, app: 'http://127.0.0.1:9', post: async ph => { posted.push(ph); return {}; } }).catch(e => ({ code: 'THROW ' + e.code }));
  ok(ns.code === 'NO_SANDBOX' && ns2.code === 'NO_SANDBOX' && !posted.length, 'không có hộp cát (Linux thiếu bwrap / selftest hỏng) → NO_SANDBOX cho cả Claude, không chạy gì (CNS-323)', JSON.stringify({ ns, ns2, posted }));
  const cfgBad = []; for (const app of ['http://10.0.0.5:7480', 'https://127.0.0.1:7480', 'http://127.0.0.1', 'http://evil.example:80', 'http://127.0.0.1:7480/mcp']) { fs.mkdirSync(W.paths.lib, { recursive: true }); fs.writeFileSync(W.paths.config, JSON.stringify({ app })); try { B.loadConfig(W.paths); cfgBad.push(app); } catch (e) { /* đúng */ } }
  fs.writeFileSync(W.paths.config, JSON.stringify({ app: 'http://127.0.0.1:7480', version: '0.26.0' }));
  ok(!cfgBad.length && B.loadConfig(W.paths).app === 'http://127.0.0.1:7480', 'địa chỉ app chốt lúc install chỉ là http://127.0.0.1:<cổng> (CNS-314)', cfgBad.join(','));
}

/* ---------------------------------------------------------------- 6–9. hộp cát THẬT (bwrap) */
const sb = B.probeSandbox(process.env);
// CI (GENCHIBI_REQUIRE_BWRAP=1, ci.yml cài bubblewrap): thiếu hộp cát là LỖI, không được bỏ qua
if (sb.bwrap !== 'ok' && process.env.GENCHIBI_REQUIRE_BWRAP === '1') ok(false, 'hộp cát thật bắt buộc trên CI (GENCHIBI_REQUIRE_BWRAP=1): bubblewrap ' + sb.bwrap, sb.raw);
if (sb.bwrap !== 'ok') {
  console.log('   ⚠ BỎ QUA phần hộp cát thật: bubblewrap ' + sb.bwrap + (sb.raw ? ' (' + sb.raw.slice(0, 120) + ')' : '') + ' — selftest, canary, giám sát lượt cần bwrap + user namespace (Fedora có sẵn). Chạy lại trên máy có bwrap.');
} else {
  const W = world();
  W.mode('claude', {}); W.mode('agy', {});
  const ec = await B.verifyCli('claude', W.paths, undefined, { allowReset: true }), ea = await B.verifyCli('agy', W.paths, undefined, { allowReset: true });
  const st = ec.sandbox.selftest || [];
  ok(ec.confinement.status === 'verified' && ea.confinement.status === 'verified' && st.length >= 13 && st.every(c => c.ok) && ['clearenv', 'no-real-home', 'home-tmpfs', 'ro-usr', 'ro-etc', 'cap-drop', 'netns-lo-only', 'netns-private', 'no-direct-net', 'proxy-deny', 'proxy-mcp'].every(id => st.some(c => c.id === id && c.ok))
    && ec.confinement.evidence.some(x => /nonce absent/.test(x)) && ec.confinement.evidence.filter(x => /^selfblock/.test(x)).length === 4 && ea.confinement.evidence.filter(x => /^selfblock/.test(x)).length === 4
    && ec.safe_mode === true && ea.models.list.includes('gemini-3.8-flash-low') && ea.models.confidence === 'direct' && ea.login.status === 'ok' && ec.baseline.plugins.join() === 'cc-plugin-agents-md',
    'hộp cát thật (bwrap ' + sb.version + '): selftest ' + st.length + ' mục đạt (env sạch, không thấy HOME thật / D-Bus / shadow, /home tmpfs, /usr /etc chỉ đọc, không đặc quyền, netns chỉ lo, không nối thẳng ra ngoài, proxy chặn example.com, MCP qua proxy) · canary claude + agy: Đạt (nonce không lọt, 4 tool cấm bị CLI từ chối, --safe-mode giữ MCP) · agy models quét trong hộp (direct)',
    JSON.stringify({ c: ec.confinement, a: ea.confinement, st: st.filter(c => !c.ok) }));
  const reg0 = B.loadRegistry(W.paths);
  // --- canary âm: mỗi cách "gian" → không Đạt
  const C = async (cli, m) => { W.mode(cli, m); const e = await B.verifyCli(cli, W.paths, undefined, { allowReset: true }); return e.confinement.status + ': ' + e.confinement.missing.join(' | '); };
  const R = { leak: await C('claude', { leakContext: true }), cheatC: await C('claude', { cheat: true, extraTools: [] }), drop: await C('claude', { drop: true }), safeDrop: await C('claude', { safeModeDropsMcp: true }),
    polite: await C('agy', { polite: true }), ignore: await C('agy', { ignoreBaseUrl: true }), cheatA: await C('agy', { cheat: true }), plugin: await C('claude', { extraPlugin: true }),
    denyOnly: await C('agy', { denyOnlyResult: true }), bypassA: await C('agy', { permMode: 'bypassPermissions' }), autoA: await C('agy', { permMode: 'auto' }), autoC: await C('claude', { permMode: 'auto' }) };
  const ecSafe = B.loadRegistry(W.paths).clis.claude;
  ok(/^failed: .*context: nonce/.test(R.leak) && /^failed: .*(not refused|executed|side effect)/.test(R.cheatC) && /^unverified: flag --restricted/.test(R.drop) && /^unverified: .*no CLI tool_result for run_command/.test(R.polite)
    && /^unverified: fake API got no request/.test(R.ignore) && /^failed: .*(read tool executed|side effect)/.test(R.cheatA) && /^failed: .*non-builtin plugin/.test(R.plugin) && /^failed|^verified/.test(R.safeDrop)
    && /^verified/.test(R.denyOnly) && /^unverified: .*permission_mode:bypassPermissions/.test(R.bypassA) && /^unverified: .*permission_mode:auto/.test(R.autoA) && /^unverified: .*permission_mode:auto/.test(R.autoC),
    'canary bắt gian (agy qua AGY_LLM_GATEWAY_URL — T-07): agy tự từ chối chỉ ghi ở denied_actions → vẫn là bằng chứng hệ thống, Đạt · permission_mode ngoài allowlist (bypass, auto) lúc enable → unverified (claude + agy) · CLI nạp CLAUDE.md của HOME → failed (nonce trong request tới API giả) · CLI thực thi tool cấm → failed (hiệu ứng phụ / nội dung tệp tới model) · thiếu --restricted → unverified · agy "lịch sự từ chối" (không có tool_result do CLI sinh) → unverified, KHÔNG Đạt · agy bỏ qua base URL → unverified · plugin lạ → failed', JSON.stringify(R));
  W.mode('claude', { safeModeDropsMcp: true }); const eSD = await B.verifyCli('claude', W.paths, undefined, { allowReset: true });
  ok(eSD.confinement.status === 'verified' && eSD.safe_mode === false, '--safe-mode tắt server của --mcp-config → canary chạy lại không có --safe-mode, ghi safe_mode: false (spec §4.2)', JSON.stringify({ c: eSD.confinement, sm: eSD.safe_mode }));
  // khôi phục: cả hai Đạt
  W.mode('claude', {}); W.mode('agy', {}); await B.verifyCli('claude', W.paths, undefined, { allowReset: true }); await B.verifyCli('agy', W.paths, undefined, { allowReset: true });

  // --- lượt thường qua app giả (/mcp có token lượt)
  const GCJ = 'gcj_' + 'Q'.repeat(43);
  let appMode = 'ok', appTools = ['get_catalog']; const calls = [];
  const app = http.createServer((q, s) => {
    let b = ''; q.on('data', d => b += d).on('end', () => {
      if (q.url !== '/mcp') { s.writeHead(404); return s.end(); }
      if (appMode === '401' || q.headers.authorization !== 'Bearer ' + GCJ) { s.writeHead(401, { 'WWW-Authenticate': 'Bearer resource_metadata="http://127.0.0.1:9/x"' }); return s.end('{}'); }
      const m = JSON.parse(b); if (m.method === 'tools/call') calls.push(m.params.name);
      const result = m.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'gen-chibi' }, instructions: '' } : m.method === 'tools/list' ? { tools: appTools.map(name => ({ name, inputSchema: { type: 'object' } })) } : { content: [{ type: 'text', text: 'ok' }] };
      s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
    });
  });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const APP = 'http://127.0.0.1:' + app.address().port;
  const fails = [];
  const turn = async (cli, m, extra, opt) => {
    W.mode(cli, m); calls.length = 0;
    const reg = B.loadRegistry(W.paths), posts = [];
    const v = { id: 'job' + Math.random().toString(36).slice(2, 10), gcj: GCJ, job: Object.assign(job0(cli), extra || {}) };
    const t0 = Date.now();
    const out = await B.runJob(v, { paths: W.paths, reg, caps: Object.assign({}, B.DEFAULT_CAPS, (opt && opt.caps) || {}), app: APP, post: async (ph, b) => { posts.push(ph); return { cancel: !!(opt && opt.cancelAfter && Date.now() - t0 > opt.cancelAfter) }; }, onFail: why => fails.push(cli + ': ' + why) });
    return Object.assign(out, { posts, ms: Date.now() - t0 });
  };
  const okC = await turn('claude', { script: [['get_catalog', {}]] }), okA = await turn('agy', { script: [['get_catalog', {}]] });
  ok(okC.phase === 'done' && !okC.argv.concat(okA.argv).some(x => /gcj_|SYSTEM-TEXT|USER-TEXT/.test(x)) && /fake-claude/.test(okC.text) && okC.posts[0] === 'started' && okA.phase === 'done' && /fake-agy/.test(okA.text) && !fails.length && calls.join() === 'get_catalog',
    'lượt thường trong hộp cát: claude + agy gọi tool genchibi qua proxy → app (token lượt) → trả lời; báo started trước', JSON.stringify({ okC, okA, fails }));
  const before = fails.length;
  const V = {
    bash: await turn('claude', { extraTools: ['Bash'] }), hook: await turn('claude', { hook: true }), skill: await turn('claude', { userSkill: true }), emit: await turn('claude', { emitTool: 'Bash' }),
    run: await turn('agy', { runCommand: true }), stray: await turn('agy', { strayFile: true }), hide: await turn('agy', { hideTools: true, script: [['get_catalog', {}]] }), out: await turn('agy', { connectOut: true })
  };
  V.permA = await turn('agy', { permMode: 'auto' }); V.permC = await turn('claude', { permMode: 'foo' }); V.other = await turn('agy', { otherServer: true, script: [['get_catalog', {}]] });
  const codes = Object.keys(V).map(k => k + '=' + V[k].phase + ':' + V[k].code).join(' ');
  const regF = B.loadRegistry(W.paths);
  ok(Object.values(V).every(x => x.phase === 'error' && x.code === 'CONFINEMENT') && /tool:Bash/.test(V.bash.detail) && /hook/.test(V.hook.detail) && /skills/.test(V.skill.detail) && /non-genchibi tool Bash/.test(V.emit.detail)
    && /non-genchibi tool run_command/.test(V.run.detail) && /unexpected files/.test(V.stray.detail) && /parser blind/.test(V.hide.detail) && /proxy blocked connect to example.com/.test(V.out.detail) && /permission_mode:auto/.test(V.permA.detail) && /permission_mode:foo/.test(V.permC.detail) && /non-genchibi tool call_mcp_tool/.test(V.other.detail) && fails.length - before === 11,
    'giám sát từng lượt → CONFINEMENT + CLI bị đánh dấu failed: claude init có Bash / hook / skill của user / tool_use lạ giữa lượt · permission_mode ngoài allowlist (agy auto, claude foo) · agy gọi MCP của server khác · agy phát run_command · tệp lạ trong /work · gọi MCP mà stream không có sự kiện tool (parser mù) · CONNECT ra ngoài allowlist', codes + ' ' + JSON.stringify(V.hide));
  // security review #1 trong lượt thật: app (bị chiếm) liệt kê tool tên run_command / read_file → claude: init có mcp__genchibi__run_command → chặn;
  // agy: model gọi mcp_genchibi_read_file → không phải tool genchibi → chặn
  await B.verifyCli('claude', W.paths, undefined, { allowReset: true }); await B.verifyCli('agy', W.paths, undefined, { allowReset: true });
  appTools = ['get_catalog', 'run_command', 'read_file'];
  const evilC = await turn('claude', { script: [['get_catalog', {}]] }), evilA = await turn('agy', { script: [['read_file', {}]] });
  appTools = ['get_catalog'];
  ok(evilC.code === 'CONFINEMENT' && /tool:mcp__genchibi__run_command/.test(evilC.detail) && evilA.code === 'CONFINEMENT' && /non-genchibi tool mcp_genchibi_read_file/.test(evilA.detail),
    'app liệt kê tool trùng tên tool có sẵn của CLI (run_command / read_file) → lượt bị chặn (claude ở init, agy khi gọi) — không tin danh sách tools/list của app (security review #1)', JSON.stringify({ evilC, evilA }));
  W.mode('claude', {});
  let refused = ''; try { B.checkEnvelope((() => { const s2 = 'cd'.repeat(32), p = { id: 'jobABCDEF', job: job0('claude'), gcj: GCJ, exp: Date.now() + 60e3 }; return Object.assign(p, { sig: B.signJob(s2, p) }); })(), { secret: 'cd'.repeat(32), reg: { clis: { claude: { confinement: { status: 'failed', missing: ['x'] }, models: { list: [] } } } }, enabled: ['claude'] }); } catch (e) { refused = e.code; }
  ok(refused === 'CONFINEMENT' && regF.clis.claude.confinement.status === 'failed' && regF.clis.agy.confinement.status === 'failed', 'CLI bị đánh dấu failed → lượt sau bị từ chối (CONFINEMENT) cho tới khi enable lại');
  // security review #3: lệnh điều khiển TỪ XA (Studio / container) không được "rửa" failed → verified; quét lúc khởi động / probe cũng vậy. Chỉ enable LOCAL đặt lại
  W.mode('claude', {}); W.mode('agy', {});
  await B.runControl({ control: 'verify', cli: 'claude' }, W.paths); await B.runControl({ control: 'probe', cli: '' }, W.paths);
  await B.verifyCli('agy', W.paths);   // mặc định (không allowReset) = như quét lúc khởi động
  const r3 = B.loadRegistry(W.paths);
  await B.verifyCli('claude', W.paths, undefined, { allowReset: true }); await B.verifyCli('agy', W.paths, undefined, { allowReset: true });
  const r4 = B.loadRegistry(W.paths);
  W.mode('claude', { leakContext: true }); await B.runControl({ control: 'verify', cli: 'claude' }, W.paths); W.mode('claude', {});
  const r5 = B.loadRegistry(W.paths);
  ok(r3.clis.claude.confinement.status === 'failed' && r3.clis.agy.confinement.status === 'failed' && r3.clis.claude.lastCheck.status === 'verified' && r3.clis.agy.lastCheck.status === 'verified'
    && r4.clis.claude.confinement.status === 'verified' && r4.clis.agy.confinement.status === 'verified' && r5.clis.claude.confinement.status === 'failed'
    && B.applyConfinement({ status: 'unverified' }, { status: 'verified' }).status === 'unverified' && B.applyConfinement({ status: 'verified' }, { status: 'unverified' }).status === 'unverified',
    'khoá đang failed: lệnh verify / probe từ Studio + quét lúc khởi động KHÔNG đặt lại (chỉ báo ở lastCheck) · enable LOCAL đặt lại về verified · verify từ xa ra kết quả xấu hơn (nonce lọt) → được hạ cấp (security review #3)',
    JSON.stringify({ r3c: r3.clis.claude.confinement.status, r3a: r3.clis.agy.confinement.status, r4: [r4.clis.claude.confinement.status, r4.clis.agy.confinement.status], r5: r5.clis.claude.confinement.status }));
  await B.verifyCli('claude', W.paths, undefined, { allowReset: true });
  await B.runControl({ control: 'probe', cli: '' }, W.paths);   // "Quét lại" từ Studio không được làm mất selftest / băm tệp → các lượt dưới vẫn chạy (không NO_SANDBOX / CONFINEMENT)
  appMode = '401';
  const a401 = await turn('claude', { script: [['get_catalog', {}]], sleep: 0 });
  appMode = 'ok';
  const auth = await turn('claude', { authError: true }), quota = await turn('claude', { quota: true }), agyAuth = await turn('agy', { loggedOut: true }), agyQ = await turn('agy', { quota: true });
  ok(a401.phase === 'error' && a401.code === 'CONFINEMENT' && /401\/403/.test(a401.detail) && auth.code === 'AUTH_REQUIRED' && quota.code === 'QUOTA' && agyAuth.code === 'AUTH_REQUIRED' && agyQ.code === 'QUOTA',
    'sau "Quét lại" từ xa: app trả 401 cho /mcp → CLI bị giết (CNS-303) · lỗi đăng nhập / quota của claude (api_retry) và agy (AGY_ERROR) → AUTH_REQUIRED / QUOTA', JSON.stringify({ a401, auth: auth.code, quota: quota.code, agyAuth: agyAuth.code, agyQ: agyQ.code }));
  await B.verifyCli('claude', W.paths, undefined, { allowReset: true });
  const can = await turn('claude', { sleep: 20000 }, {}, { cancelAfter: 300 }), tout = await turn('agy', { sleep: 20000 }, { caps: { turnSec: 2 } }, {});
  const tdirs = fs.readdirSync(B.runBase(W.paths));
  ok(can.code === 'CANCELLED' && can.ms < 6000 && tout.code === 'TIMEOUT' && tout.ms < 6000 && tdirs.length === 0,
    'huỷ (cờ cancel trong phản hồi nhịp beat ≤ 1,5 s) → SIGINT → dừng ≤ 6 s · quá trần lượt (Studio hạ còn 2 s) → TIMEOUT · thư mục lượt được dọn', JSON.stringify({ can: [can.code, can.ms], tout: [tout.code, tout.ms], tdirs }));
  // tệp cấu hình của agy bị đổi giữa hai lượt → từ chối + failed (CNS-324: bind chỉ đọc, kiểm băm)
  const sp = path.join(W.paths.cliHome('agy'), '.gemini/antigravity-cli/settings.json');
  fs.writeFileSync(sp, JSON.stringify({ permissions: { allow: ['command(*)'] } }));
  const tamper = await turn('agy', {});
  ok(tamper.code === 'CONFINEMENT' && /changed/.test(tamper.detail) && B.loadRegistry(W.paths).clis.agy.confinement.status === 'failed', 'settings.json của agy bị đổi → lượt bị chặn, agy failed (băm kiểm trước mỗi lượt)', JSON.stringify(tamper));
  await B.verifyCli('agy', W.paths, undefined, { allowReset: true });
  // --- đăng nhập agy (T-07): mặc định key AI Studio (env qua tệp chỉ đọc, KHÔNG trên argv); OAuth chạy agy TRONG hộp (không D-Bus) → tệp 0600
  await B.verifyCli('agy', W.paths, undefined, { allowReset: true });
  const keyTurn = await turn('agy', {});
  fs.renameSync(B.keyFile(W.paths, 'agy'), B.keyFile(W.paths, 'agy') + '.bak');
  const noKey = await turn('agy', {});
  fs.renameSync(B.keyFile(W.paths, 'agy') + '.bak', B.keyFile(W.paths, 'agy'));
  let badKey = ''; try { B.loginKey(W.paths, 'short'); } catch (e) { badKey = e.code; }
  ok(keyTurn.phase === 'done' && !keyTurn.argv.some(a => a.includes(KEY)) && noKey.code === 'AUTH_REQUIRED' && badKey === 'AUTH_REQUIRED' && (fs.statSync(B.keyFile(W.paths, 'agy')).mode & 0o777) === 0o600 && B.authModeOf(W.paths, 'agy') === 'key',
    'agy chế độ key (mặc định): GEMINI_API_KEY tới agy qua /work/.gc/env.json (không trên argv của bwrap) · thiếu key → AUTH_REQUIRED · key sai dạng bị từ chối · tệp key 0600', JSON.stringify({ keyTurn: keyTurn.phase, noKey: noKey.code, badKey }));
  W.mode('agy', { oauthLogin: true, needLogin: true, expectKey: undefined });
  const regO = B.loadRegistry(W.paths);
  let oErr = ''; try { await B.loginOauth(W.paths, regO); } catch (e) { oErr = e.code + ':' + e.detail; }
  const oFile = path.join(W.paths.cliHome('agy'), '.config/antigravity/plugin-secrets.json');
  await B.verifyCli('agy', W.paths, undefined, { allowReset: true });
  const oTurn = await turn('agy', { needLogin: true, expectKey: undefined }), pubO = B.publicRegistry(B.loadRegistry(W.paths), ['agy'], B.DEFAULT_CAPS);
  ok(!oErr && fs.existsSync(oFile) && (fs.statSync(oFile).mode & 0o777) === 0o600 && B.authModeOf(W.paths, 'agy') === 'oauth' && oTurn.phase === 'done' && pubO.clis.agy.broadScope === true && pubO.clis.agy.authMode === 'oauth' && /cloud-platform/.test(B.OAUTH_WARN),
    'agy OAuth (owner chọn): đăng nhập chạy agy TRONG hộp cát không D-Bus → token ở plugin-secrets.json của HOME riêng, ép 0600 · lượt sau chạy được · registry báo broadScope (cảnh báo cloud-platform)', JSON.stringify({ oErr, oTurn: oTurn.phase + ':' + oTurn.code + ':' + oTurn.detail, pub: pubO.clis.agy.broadScope }));
  B.loginKey(W.paths, KEY);
  const inside = await (async () => { W.mode('agy', {}); const e = B.loadRegistry(W.paths).clis.agy, sel = await B.selftest('agy', W.paths, B.loadRegistry(W.paths)); return sel; })();
  ok(inside.ok && !fs.readdirSync(W.H).includes('.cache'), 'selftest lúc khởi động đạt · không có gì ghi vào ~/.cache của HOME (thư mục lượt ở XDG)');
  app.close();
  void reg0;
}
console.log(bad ? '   ✗ test-bridge: có lỗi' : '   ✓ test-bridge: đạt');
process.exit(bad);
