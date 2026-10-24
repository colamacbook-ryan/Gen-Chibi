#!/usr/bin/env node
// gen-chibi — bộ chuyển hooks của Claude Code → Sân khấu sống (INT-21). Node thuần, không phụ thuộc.
// © 2026 Gen Labs — All rights reserved.
//
// Claude Code gọi lệnh này ở mỗi hook (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Notification, Stop, SubagentStart,
// SubagentStop, PreCompact, SessionEnd — dạng JSON đối chiếu với Claude Code 2.1.310), JSON của hook đi vào stdin. Bộ chuyển chỉ PHÂN LOẠI cục bộ (tên tool, lệnh trông như test / phát hành, có lỗi không) rồi gửi
// MỘT sự kiện { kind, tool, agent, at, sub? } tới app — KHÔNG BAO GIỜ gửi nội dung: không prompt, không đường dẫn, không lệnh, không kết quả tool.
// Không bao giờ chặn hay làm hỏng agent: đọc stdin tối đa 250 ms, gửi tối đa 300 ms, luôn thoát 0, không in gì ra stdout
// (stdout của vài hook được Claude Code chèn vào ngữ cảnh), lỗi chỉ ghi stderr khi GC_LIVE_DEBUG=1.
//   GC_LIVE_URL   địa chỉ app (mặc định http://127.0.0.1:7480)
//   GC_LIVE_TOKEN token live của bản cài (Studio › Hệ thống › Live › Kết nối Claude Code) — chỉ mở POST /api/live/event
// Dùng như thư viện (test): import { classify } from './live-hook.mjs'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const TEST_RE = /(^|[\s;&|(])((npm|pnpm|yarn|bun)\s+(run\s+)?test\b|npx\s+(jest|vitest|mocha|playwright)\b|jest\b|vitest\b|mocha\b|pytest\b|python3?\s+-m\s+(pytest|unittest)\b|go\s+test\b|cargo\s+test\b|dotnet\s+test\b|mvn\s+test\b|gradle\w*\s+test\b|rspec\b|phpunit\b|ctest\b|make\s+(test|check)\b|deno\s+test\b|node\s+--test\b|\S*test[\w.-]*\.(sh|mjs|js|py)\b)/i;
const RELEASE_RE = /(^|[\s;&|(])(git\s+push\b|gh\s+release\b|npm\s+publish\b|cargo\s+publish\b|twine\s+upload\b|docker\s+push\b|git\s+tag\b)/i;
const FAIL_RE = /(\b[1-9]\d*\s+(failed|failing|failures?|errors?)\b|\bFAIL(ED)?\b|✗|Traceback|AssertionError|exit code [1-9]|Error:)/;
const PASS_RE = /(\b0\s+(failed|failures)\b|\ball\s+tests?\s+passed\b|\b\d+\s+passed\b|✓|\bok\b|\bPASS\b)/i;

function toolKind(name) {
  if (/^(Read|NotebookRead|Skill)$/.test(name)) return 'read';
  if (/^(Grep|Glob|LS|WebSearch|WebFetch|ToolSearch)$/.test(name)) return 'search';
  if (/^(Edit|MultiEdit|NotebookEdit)$/.test(name)) return 'edit';
  if (name === 'Write') return 'write';
  if (/^(Bash|BashOutput|PowerShell)$/.test(name)) return 'run';
  if (/^(Task|Agent)$/.test(name)) return 'delegate';
  if (/^(TodoWrite|ExitPlanMode|EnterPlanMode)$/.test(name)) return 'think';
  if (/^mcp__/.test(name)) return 'run';
  return 'think';
}
// loại trợ lý (agent_type / subagent_type của Claude Code) → nhóm cố định; tên thật KHÔNG gửi đi (sân khấu nói bằng lời thường theo nhóm)
function subOf(t) {
  t = typeof t === 'string' ? t : '';
  if (!t) return 'general';
  if (/explor|search|scout|find/i.test(t)) return 'explore';
  if (/plan|architect|design/i.test(t)) return 'plan';
  if (/review|audit|check|critic|cortex/i.test(t)) return 'review';
  if (/test|qa|verif/i.test(t)) return 'test';
  if (/general/i.test(t)) return 'general';
  return 'other';
}
function cmdOf(h) { const c = h && h.tool_input && h.tool_input.command; return typeof c === 'string' ? c : ''; }
function failed(h) {
  const r = h && (h.tool_response !== undefined ? h.tool_response : h.tool_result);
  if (!r) return false;
  if (typeof r === 'object') {
    if (r.is_error === true || r.isError === true || r.interrupted === true || r.success === false) return true;
    if (typeof r.exit_code === 'number' && r.exit_code !== 0) return true;
    if (typeof r.exitCode === 'number' && r.exitCode !== 0) return true;
  }
  const txt = typeof r === 'string' ? r : [r.stderr, r.stdout, r.error, r.output].filter(x => typeof x === 'string').join('\n');
  return FAIL_RE.test(txt.slice(-4000)) && !/\b0\s+failed\b/i.test(txt.slice(-4000));
}
// hook JSON → sự kiện (chỉ kind + tên tool + nhãn LOẠI agent) hoặc null. Không trường nào của sự kiện lấy từ nội dung người dùng / agent
export function classify(h) {
  if (!h || typeof h !== 'object') return null;
  const ev = String(h.hook_event_name || ''), tool = typeof h.tool_name === 'string' ? h.tool_name.replace(/^mcp__.*$/, 'mcp').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24) : '';
  const out = k => k ? { kind: k, tool: tool || undefined, agent: 'claude-code', at: Date.now() } : null;
  switch (ev) {
    case 'SessionStart': return out('session_start');
    case 'UserPromptSubmit': return /^\s*<task-notification>/.test(String(h.prompt || '')) ? null : out('prompt');   // thông báo trợ lý chạy nền xong (Claude Code tự chèn) — không phải tin của bạn
    case 'Stop': return out('wait_user');
    case 'Notification': {   // notification_type (Claude Code 2.x): permission_prompt · idle_prompt · elicitation_dialog · auth_success — chỉ phân loại, không gửi câu
      const nt = String(h.notification_type || '');
      if (nt === 'auth_success') return null;
      if (/limit|quota|usage/i.test(String(h.message || ''))) return out('limit');
      return out(nt === 'idle_prompt' ? 'idle' : 'wait_user');
    }
    case 'SubagentStart': { const e = out('delegate_start'); e.sub = subOf(h.agent_type); return e; }
    case 'SubagentStop': return out('delegate_end');
    case 'PreCompact': return out('limit');
    case 'SessionEnd': return out('stop');
    case 'PreToolUse': {
      const k = toolKind(h.tool_name || '');
      if (k === 'delegate') return null;   // SubagentStart báo trợ lý vào việc (kèm loại) — không đếm hai lần
      if (k === 'run') { const c = cmdOf(h); return out(RELEASE_RE.test(c) ? 'release' : TEST_RE.test(c) ? 'test_run' : 'run'); }
      return out(k);
    }
    case 'PostToolUse': case 'PostToolUseFailure': {
      if (ev === 'PostToolUseFailure' && h.is_interrupt === true) return out('wait_user');   // bạn bấm dừng: agent đứng chờ bạn
      const k = toolKind(h.tool_name || ''), bad = ev === 'PostToolUseFailure' || failed(h);
      if (k === 'run' && TEST_RE.test(cmdOf(h))) return out(bad ? 'test_fail' : 'test_pass');
      if (k === 'delegate') return null;   // SubagentStop báo xong việc (không đếm hai lần)
      return bad ? out('error') : null;
    }
  }
  return null;
}
function readStdin(ms) {
  return new Promise(resolve => {
    let s = '', done = false; const fin = () => { if (!done) { done = true; resolve(s); } };
    const t = setTimeout(fin, ms); t.unref();
    if (process.stdin.isTTY) return fin();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { s += c; if (s.length > 2e6) { s = ''; fin(); } });
    process.stdin.on('end', fin); process.stdin.on('error', fin);
  });
}
function post(url, token, ev, ms) {
  return new Promise(resolve => {
    let u; try { u = new URL('/api/live/event', url); } catch (e) { return resolve(false); }
    const data = Buffer.from(JSON.stringify(ev)), lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, 'X-GC-Request': '1', Authorization: 'Bearer ' + token }, timeout: ms }, res => { res.resume(); res.on('end', () => resolve(res.statusCode < 300)); });
    const t = setTimeout(() => { req.destroy(); resolve(false); }, ms); t.unref();
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(false));
    req.end(data);
  });
}
async function main() {
  const dbg = process.env.GC_LIVE_DEBUG === '1', say = m => { if (dbg) process.stderr.write('[live-hook] ' + m + '\n'); };
  try {
    // token: tệp live-token (0600) cạnh chính tệp này — genchibi live hook ghi; GC_LIVE_TOKEN chỉ còn cho thử tay / test (lộ qua /proc/*/cmdline)
    let token = process.env.GC_LIVE_TOKEN || '';
    if (!token) { try { token = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'live-token'), 'utf8').trim(); } catch (e) { say('no live-token file'); } }
    if (!/^gcl_[A-Za-z0-9_-]{32,}$/.test(token)) { say('no GC_LIVE_TOKEN'); return; }
    const raw = await readStdin(250);
    let h = null; try { h = JSON.parse(raw); } catch (e) { say('stdin is not JSON'); return; }
    const ev = classify(h); if (!ev) return;
    const ok = await post(process.env.GC_LIVE_URL || 'http://127.0.0.1:7480', token, ev, 300);
    say(ev.kind + (ok ? ' sent' : ' not delivered'));
  } catch (e) { say(String(e && e.message || e)); }
}
// chạy trực tiếp (không phải import trong test): so ĐƯỜNG THẬT — đúng cả khi đường có dấu cách / ký tự mã hoá % / đi qua symlink (macOS /Users/John Smith)
function isMain() { try { return !!process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch (e) { return false; } }
if (isMain()) {
  process.on('uncaughtException', () => process.exit(0)); process.on('unhandledRejection', () => process.exit(0));
  main().finally(() => process.exit(0));
}
