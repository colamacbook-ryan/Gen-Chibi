// gen-chibi — lượt AI chạy nền (CNS-175, v0.21): main.js trả 202 + id lượt, client hỏi GET /api/ai/turns/<id> tới khi xong.
// © 2026 Gen Labs — All rights reserved.
//
// Bộ nhớ có trần (review bảo mật 🟡9): tối đa maxRunning lượt ĐANG chạy (vượt → main.js trả 429) và tối đa maxDone lượt ĐÃ XONG giữ kết quả
// (vượt → bỏ lượt xong cũ nhất); lượt xong quá keepMs cũng bị bỏ. Dọn ở mỗi lần tạo / xem / xong một lượt — không cần bộ hẹn giờ.
// Thuần Node (không HTTP): main.js lo 202 / 404 / định dạng trả về. Có `now` để test chạy đồng hồ giả.
'use strict';
const crypto = require('crypto');

function createTurns(o) {
  o = Object.assign({ keepMs: 10 * 60e3, maxRunning: 40, maxDone: 200, now: Date.now }, o);
  const map = new Map();   // id → { status: running | done | error, at, doneAt, result?, code?, error? } — thứ tự chèn = thứ tự tạo
  function sweep() {
    const t = o.now();
    let done = 0;
    for (const [id, x] of map) {
      if (x.status === 'running') continue;
      if (t - x.doneAt > o.keepMs) map.delete(id); else done++;
    }
    if (done <= o.maxDone) return;
    // vượt trần: bỏ lượt xong CŨ NHẤT (theo lúc xong) tới khi còn maxDone
    const old = [...map].filter(([, x]) => x.status !== 'running').sort((a, b) => a[1].doneAt - b[1].doneAt);
    for (let i = 0; i < done - o.maxDone; i++) map.delete(old[i][0]);
  }
  const running = () => { let n = 0; for (const x of map.values()) if (x.status === 'running') n++; return n; };
  // p: Promise của lượt. h (tuỳ chọn, v0.26 cầu nối CLI): { cancel(), progress() } do lượt gắn vào khi chạy — GET lượt trả progress, POST …/cancel gọi cancel.
  // Trả id (128 bit) — null khi đã đủ maxRunning lượt đang chạy
  function add(p, h) {
    sweep();
    if (running() >= o.maxRunning) return null;
    const id = crypto.randomBytes(16).toString('base64url'), t = { status: 'running', at: o.now(), doneAt: 0, handle: h || null };
    map.set(id, t);
    // doneAt đặt CÙNG lúc đổi trạng thái (không để .finally): lượt "xong" mà doneAt còn 0 sẽ bị sweep() coi là quá hạn
    p.then(r => { t.doneAt = o.now(); t.status = 'done'; t.result = r; }, e => { t.doneAt = o.now(); t.status = 'error'; t.code = e && e.code >= 400 && e.code < 600 ? e.code : 502; t.error = String((e && e.message) || e); if (e && e.bridgeCode) t.bridgeCode = e.bridgeCode; })
      .then(sweep);
    return id;
  }
  function get(id) { sweep(); return map.get(id) || null; }
  return { add, get, sweep, running, size: () => map.size, limits: { keepMs: o.keepMs, maxRunning: o.maxRunning, maxDone: o.maxDone } };
}

module.exports = { createTurns };
