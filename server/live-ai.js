// gen-chibi — AI TRONG STUDIO lên Sân khấu Live (v0.25, spec §8, CNS-309/310): bảng ánh xạ khu → việc, tool → loại sự kiện.
// © 2026 Gen Labs — All rights reserved.
// Một chỗ cho mỗi loại sự kiện: sự kiện của TOOL phát trong mcp.callTool (ctx.channel === 'ui' — đường API key hôm nay, cầu nối CLI sau này dùng lại);
// session_start → task → prompt → … → stop / error phát trong dockTurn (server/main.js). Nhãn = tiêu đề tool (qua redact ở LiveHub) — KHÔNG gửi tham số.
'use strict';

// việc theo khu của dock (TASKS của engine/live.js)
const TASK_OF_ZONE = { xuong: 'design', khung: 'design', 'thu-vien': 'research', 'tao-tac': 'write', 'he-thong': 'chat' };
// việc theo nút gợi ý nhanh của dock (studio/app.js dockQuick gửi kèm `task` khi tin nhắn đúng là câu của nút) — chỉ nhận giá trị trong bảng này
const QUICK_TASKS = ['design', 'write', 'plan', 'review', 'research', 'chat'];
function taskOf(zone, quick) {
  if (typeof quick === 'string' && QUICK_TASKS.indexOf(quick) >= 0) return quick;
  return TASK_OF_ZONE[zone] || 'chat';
}

// loại sự kiện của một tool — luật ĐẦU TIÊN khớp (spec §8): trước khi gọi (pre) và sau khi có kết quả (post)
//  1 validate_*  → test_run (trước), rồi test_pass / test_fail
//  2 render_* / preview_* → run
//  3 save_* / propose_edit / import_* → write (tạo mới: version 1) | edit
//  4 list_* / get_* / start_here → read
//  5 tool còn lại có readOnlyHint → search
//  6 tool lỗi → error
function ruleOf(name, tool) {
  const n = String(name || '');
  if (/^validate_/.test(n)) return 'validate';
  if (/^(render|preview)_/.test(n)) return 'run';
  if (/^(save_|import_)/.test(n) || n === 'propose_edit') return 'save';
  if (/^(list|get)_/.test(n) || n === 'start_here') return 'read';
  if (tool && tool.annotations && tool.annotations.readOnlyHint === true) return 'search';
  return null;   // không khớp luật nào → không phát (test đòi 100 % tool của các khu khớp một luật)
}
function preKind(name, tool) { return ruleOf(name, tool) === 'validate' ? 'test_run' : null; }
function postKind(name, tool, res) {
  const r = ruleOf(name, tool), bad = !res || res.isError;
  if (r === 'validate') return bad ? 'test_fail' : 'test_pass';
  if (bad) return 'error';
  if (r === 'save') { const sc = res.structuredContent || {}; return sc.version === 1 ? 'write' : 'edit'; }
  return r;   // run | read | search | null
}

module.exports = { TASK_OF_ZONE, QUICK_TASKS, taskOf, ruleOf, preKind, postKind };
