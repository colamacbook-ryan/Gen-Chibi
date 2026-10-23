// Kiểm Sân khấu sống (Agent Live Stage, INT-21) — không cần trình duyệt. Phần trình duyệt: GC_ONLY=live node tools/test-browser.mjs
// © 2026 Gen Labs — All rights reserved.
//  1) làm sạch nhãn: đường dẫn / lệnh / token / email / URL / chuỗi dài không bao giờ lọt (từng luật một ca) + kiểm dạng sự kiện
//  2) đạo diễn: KHÔNG dịch chuyển tức thời (≈ 2000 dãy ngẫu nhiên, vị trí liên tục giữa mọi bước và trong mọi khung 60 fps) · đạo cụ chỉ ra từ túi / về túi
//     · gộp loạt · leo thang (chờ lâu, test đỏ liên tiếp) · tất định · không giật tư thế ở chỗ nối bước (đo — và chứng minh rào có tác dụng: tắt trộn thì trượt)
//  3) bộ chuyển hooks: luôn thoát 0 (rác, rỗng, server treo, không có server), ≤ ~1 s, không gửi nội dung thô; bảng phân loại tool → sự kiện
//  4) HTTP: token live chỉ mở POST /api/live/event · quyền chủ · CSRF / Content-Type / cỡ · trần tần suất (429 + Retry-After) · SSE nhận sự kiện đã làm sạch
//     · MCP live_event · tệp token 0600 · đổi token vô hiệu token cũ · phát lại phiên mẫu qua tools/live-replay.mjs
// Dùng: node tools/test-live.mjs   (cổng GC_LIVE_TEST_PORT, mặc định 7764)
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { loadEngine } = require(path.join(ROOT, 'server/engine-node.js'));
const GC = loadEngine(ROOT), L = GC.live;
let bad = 0;
const ok = (c, m, extra) => { if (c) console.log('   ✓ ' + m); else { bad = 1; console.log('   ✗ ' + m + (extra ? ' — ' + String(extra).slice(0, 600) : '')); } };
const kids = [], tmp = [];
process.on('exit', () => { kids.forEach(k => { try { k.kill(); } catch (e) { /* đã tắt */ } }); tmp.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* bỏ */ } }); });
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => process.exit(130));

/* ------------------------------------------------------------------ 1. làm sạch */
{
  const R = L.redact, SECRETS = ['sk-ant-api03-AbCdEf0123456789xyzXYZ', 'ghp_0123456789abcdefABCDEF0123456789ab', 'AKIAIOSFODNN7EXAMPLE', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig', 'gcl_abcdefghijklmnopqrstuvwxyz0123456789', 'xoxb-1234-5678-abcdef'];
  const cases = [
    ['đường dẫn tuyệt đối', 'Reading /home/ryan/.ssh/id_rsa now', s => !/home|ssh|id_rsa/.test(s)],
    ['đường dẫn Windows', 'Open C:\\Users\\ryan\\secrets.txt', s => !/Users|secrets/.test(s)],
    ['đường dẫn ~ / ./', 'Edit ~/notes and ./src/app', s => !/notes|src|app/.test(s)],
    ['tên tệp có đuôi', 'Fixing server.js and README.md', s => !/server|README/.test(s) && /Fixing/.test(s)],
    ['lệnh (tên chương trình đầu câu)', 'git push origin main --force', s => s === ''],
    ['lệnh (ống / &&)', 'build it && deploy | tee log', s => s === ''],
    ['lệnh ($VAR, $(…), `…`)', 'print $HOME value', s => s === ''],
    ['cờ dòng lệnh', 'Run with --token and -v', s => !/--token|-v\b/.test(s)],
    ['email', 'Mail ryan@example.com about it', s => !/@|example/.test(s)],
    ['URL', 'Fetch https://evil.example/x?q=1 page', s => !/https|evil/.test(s)],
    ['key=value bí mật', 'set password=hunter2 then token:abc', s => !/hunter2|password|token:abc/.test(s)],
    ['hex dài', 'hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b', s => !/9f86d0/.test(s)],
    ['chuỗi ngẫu nhiên dài', 'value Zx9Qw8Er7Ty6Ui5Op4As3Df2', s => !/Zx9Qw8/.test(s)],
    ['ký tự mã ({ } = ; < >)', 'const a = { b: 1 }; x<y', s => s === ''],
    ['ký tự điều khiển / xuống dòng', 'Line one\nLine two\u0007', s => !/[\u0000-\u001f]/.test(s)],
    ['dài → cắt ≤ 48 ký tự', 'This is a very long summary of what the agent is doing right now in many words', s => Array.from(s).length <= 48 && s.endsWith('…')],
    ['câu thường giữ nguyên', 'Reading the setup guide', s => s === 'Reading the setup guide'],
    ['tiếng Việt giữ dấu', 'Đọc hướng dẫn cài đặt', s => s === 'Đọc hướng dẫn cài đặt'],
    ['số phiên bản giữ', 'Release v0.24.0 today', s => s === 'Release v0.24.0 today'],
    ['không phải chuỗi', { x: 1 }, s => s === ''],
  ];
  const fails = cases.filter(c => !c[2](R(c[1]))).map(c => c[0] + ': ' + JSON.stringify(R(c[1])));
  ok(!fails.length, 'redact: ' + cases.length + ' luật (đường dẫn · lệnh · cờ · email · URL · key=value · hex · chuỗi dài · ký tự mã · điều khiển · cắt 48)', fails.join(' | '));
  const sec = SECRETS.filter(t => R('the key ' + t + ' here').includes(t.slice(0, 8)) || R(t) !== '');
  ok(!sec.length, 'redact: ' + SECRETS.length + ' kiểu token (sk-, ghp_, AKIA, JWT, gcl_, xoxb-) không bao giờ lọt', sec.join(' '));
  // ngẫu nhiên: 3000 nhãn trộn từ mảnh nguy hiểm → không mảnh nào còn sau làm sạch
  const BAD = ['/etc/passwd', '~/.aws/credentials', 'C:\\x\\y', 'a@b.co', 'http://x.y/z', 'npm test', 'rm -rf', 'sk-AAAAAAAAAAAAAAAAAAAAAAAA', 'deadbeefdeadbeefdead', '--force', 'k=v;', '$(id)', 'secret.json'];
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const leaks = [];
  for (let i = 0; i < 3000; i++) {
    const parts = []; for (let k = 0; k < 1 + Math.floor(rnd() * 6); k++) parts.push(rnd() < 0.4 ? BAD[Math.floor(rnd() * BAD.length)] : ['Reading', 'the', 'guide', 'fixing', 'bug', 'Đọc', 'tài liệu'][Math.floor(rnd() * 7)]);
    const out = L.redact(parts.join(' '));
    BAD.forEach(b => { if (out.includes(b) || (b.length > 6 && out.includes(b.slice(0, 6)) && !/^[A-Za-z]+$/.test(b.slice(0, 6)))) leaks.push(b + ' ⊂ ' + out); });
    if (Array.from(out).length > 48) leaks.push('quá dài: ' + out);
  }
  ok(!leaks.length, 'redact: 3000 nhãn trộn ngẫu nhiên — không mảnh nguy hiểm nào còn, không nhãn nào > 48 ký tự', leaks.slice(0, 5).join(' | '));
  const ce = L.cleanEvent;
  ok(ce({ kind: 'nope' }).error && ce(null).error && ce([]).error && ce({ kind: 'read', label: 5 }).error && ce({ kind: 'read' }).ev && !('extra' in ce({ kind: 'read', extra: 'x' }).ev)
    && ce({ kind: 'read', tool: '../../etc' }).ev.tool === 'etc' && ce({ kind: 'read', tool: 'a'.repeat(99) }).ev.tool.length === 24 && L.KINDS.length === 19,
    'cleanEvent: kind ngoài 19 loại / không phải object / label không phải chuỗi → lỗi · khoá lạ bị bỏ · tool chỉ [A-Za-z0-9_.-] ≤ 24');
}

/* ------------------------------------------------------------------ 2. đạo diễn */
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function randomSeq(seed) {
  const r = rng(seed), n = 4 + Math.floor(r() * 36), out = []; let t = 0;
  for (let i = 0; i < n; i++) { t += r() < 0.35 ? r() * 0.25 : r() * 4; out.push({ kind: L.KINDS[Math.floor(r() * L.KINDS.length)], at: +t.toFixed(3) }); }
  return out;
}
function run(seq, tail, step) {
  const D = L.director(); let i = 0; const end = (seq.length ? seq[seq.length - 1].at : 0) + (tail || 40);
  for (let t = 0; t <= end; t += step || 0.25) { while (i < seq.length && seq[i].at <= t) { D.push({ kind: seq[i].kind }, t); i++; } D.advance(t); }
  return D;
}
function checkSteps(D) {
  const errs = [], S = D.steps, maxV = L.SPEED.run * 1.0001;
  for (let k = 0; k < S.length; k++) {
    const s = S[k], p = S[k - 1];
    if (p && Math.abs(p.x1 - s.x0) > 1e-6) errs.push('nhảy vị trí ở bước ' + s.i + ': ' + p.x1.toFixed(1) + ' → ' + s.x0.toFixed(1));
    if (p && Math.abs(p.t1 - s.t0) > 1e-6) errs.push('hở thời gian ở bước ' + s.i);
    if (s.t1 < s.t0 - 1e-9) errs.push('bước âm ' + s.i);
    if (s.type !== 'walk' && Math.abs(s.x1 - s.x0) > 1e-9) errs.push('di chuyển ngoài bước đi ' + s.i);
    if (s.type === 'walk' && Math.abs(s.x1 - s.x0) > maxV * (s.t1 - s.t0) + 1e-6) errs.push('đi quá nhanh ' + s.i);
    if (p && p.propOut !== s.propIn) errs.push('đạo cụ đổi ngoài bước lấy / cất ở bước ' + s.i + ': ' + p.propOut + ' → ' + s.propIn);
    if (s.type === 'takeOut' && (s.propIn !== null || !s.propOut)) errs.push('lấy đồ khi tay chưa rảnh ' + s.i);
    if (s.type === 'takeOut' && L.PROPS[s.propOut].src === 'bag' && s.clip !== 'lvRummage') errs.push('đồ của túi không lấy bằng lục túi ' + s.i);
    if (s.type === 'takeOut' && L.PROPS[s.propOut].src === 'shelf' && Math.abs(s.x0 - L.ZONES.shelf.x) > 1) errs.push('lấy sách khi không ở giá ' + s.i);
    if (s.type === 'putBack' && (!s.propIn || s.propOut !== null)) errs.push('cất đồ khi tay không có gì ' + s.i);
    if (s.type === 'putBack' && L.PROPS[s.propIn].src === 'shelf' && Math.abs(s.x0 - L.ZONES.shelf.x) > 1) errs.push('trả sách khi không ở giá ' + s.i);
    if (s.type === 'walk' && s.propIn === 'book') errs.push('mang sách của giá đi chỗ khác ' + s.i);
    if (s.type !== 'takeOut' && s.type !== 'putBack' && s.propIn !== s.propOut) errs.push('đạo cụ tự hiện / tự biến ' + s.i);
  }
  return errs;
}
{
  const t0 = Date.now(); let errs = [], nSteps = 0, nWalkCut = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const seq = randomSeq(seed), D = run(seq.concat([{ kind: 'stop', at: (seq.length ? seq[seq.length - 1].at : 0) + 0.5 }]), 45);
    const e = checkSteps(D); nSteps += D.steps.length; nWalkCut += D.steps.filter(s => s.type === 'walk' && s.cut).length;
    // khung 60 fps: vị trí liên tục (≤ tốc độ chạy / 60 + sai số)
    if (seed % 10 === 0) { const end = D.steps[D.steps.length - 1].t1; let px = D.xAt(0); for (let t = 1 / 60; t < end; t += 1 / 60) { const x = D.xAt(t); if (Math.abs(x - px) > L.SPEED.run / 60 + 0.01) { e.push('khung ' + t.toFixed(2) + ' nhảy ' + (x - px).toFixed(1)); break; } px = x; } }
    // kết thúc phiên (stop) + đủ lâu: đạo cụ về túi
    const last = D.steps[D.steps.length - 1]; if (last.propOut) e.push('cuối phiên còn cầm ' + last.propOut);
    if (e.length) { errs.push('seed ' + seed + ': ' + e.slice(0, 3).join('; ')); if (errs.length > 5) break; }
  }
  ok(!errs.length, 'đạo diễn: 2000 dãy sự kiện ngẫu nhiên — vị trí liên tục giữa mọi bước + mọi khung 60 fps (không dịch chuyển tức thời, kể cả ' + nWalkCut + ' lần đổi kế hoạch giữa đường) · đạo cụ chỉ đổi tay ở bước lấy / cất · sách không rời giá · cuối phiên đồ về túi (' + nSteps + ' bước, ' + (Date.now() - t0) + ' ms)', errs.join(' | '));
  // rào có tác dụng: một dãy bị làm hỏng (một bước đi bị "dịch chuyển") phải bị bắt
  const D = run(randomSeq(42), 30), w = D.steps.find(s => s.type === 'walk');
  w.x1 += 120; const caught = checkSteps(D).some(x => /nhảy vị trí/.test(x));
  const D2 = run(randomSeq(43), 30), tk = D2.steps.find(s => s.type === 'perform' && D2.steps.indexOf(s) > 0); tk.propIn = 'hammer';
  ok(caught && checkSteps(D2).some(x => /đạo cụ/.test(x)), 'kiểm tra không mù: bước đi bị dịch chuyển 120 đơn vị và đạo cụ tự hiện đều bị bắt');
  // TẤT ĐỊNH: cùng dãy → cùng kế hoạch (khác bước tiến đồng hồ vẫn ra cùng bước khi sự kiện đến cùng lúc)
  const sig = D => JSON.stringify(D.steps.map(s => [s.type, s.clip, +s.t0.toFixed(4), +s.t1.toFixed(4), +s.x0.toFixed(3), +s.x1.toFixed(3), s.propIn, s.propOut, s.emo, s.bubble && s.bubble.id]));
  let det = 0; for (let seed = 500; seed < 700; seed++) { const q = randomSeq(seed); if (sig(run(q, 30)) !== sig(run(q, 30))) det++; }
  ok(!det, 'tất định: 200 dãy chạy hai lần ra đúng cùng kế hoạch (không Math.random, không đồng hồ thật)');
}
{
  // GỘP: 20 lần đọc trong 2 s = một lần tới giá sách, lấy sách một lần, diễn liên tục, bậc hài tăng dần
  const seq = [{ kind: 'edit', at: 0 }]; for (let i = 0; i < 20; i++) seq.push({ kind: i % 3 ? 'read' : 'search', at: 4 + i * 0.1 });
  const D = run(seq, 20, 1 / 30), S = D.steps.filter(s => s.t0 >= 4);
  const walks = S.filter(s => s.type === 'walk' && s.zone === 'shelf'), shelfMain = S.filter(s => s.type === 'perform' && s.main && (s.act === 'read' || s.act === 'search'));
  const takes = S.filter(s => s.type === 'takeOut' && Math.abs(s.x0 - L.ZONES.shelf.x) < 1), lv = shelfMain.map(s => s.level), merged = D.log.filter(x => x.merged).length;
  ok(walks.length === 1 && takes.length === 1 && shelfMain.length >= 1 && shelfMain.length <= 3 && lv[lv.length - 1] === 2 && lv.every((v, i) => !i || v >= lv[i - 1]) && merged >= 17,
    'gộp loạt: 20 lần đọc / tìm trong 2 s → 1 lần đi tới giá, 1 lần lấy đồ, ' + shelfMain.length + ' đoạn diễn liền (bậc ' + lv.join('→') + '), ' + merged + ' sự kiện gộp — không 20 lần làm lại', JSON.stringify(S.map(s => s.type + ':' + s.clip)));
  // KHÔNG gộp thì trượt (rào có tác dụng): xử lý từng sự kiện như một việc mới → nhiều lần đi / lấy đồ
  const D2 = L.director(); let t = 0; for (let i = 0; i < 4; i++) { D2.push({ kind: i % 2 ? 'read' : 'edit' }, t); for (let k = 0; k < 160; k++) { t += 1 / 30; D2.advance(t); } }
  ok(D2.steps.filter(s => s.type === 'walk').length >= 4, 'đối chứng: đọc / sửa xen kẽ (khác lớp) thì mỗi lần là một chuyến đi riêng');
}
{
  // LEO THANG khi chờ: cà phê → đồng hồ → ngáp → cất ly → tới sofa → ngồi → ngủ gật; có việc → giật mình tỉnh, rồi đi làm
  const D = run([{ kind: 'wait_user', at: 0 }, { kind: 'edit', at: 50 }], 15, 1 / 30);
  const clips = D.steps.map(s => s.clip), idx = c => clips.indexOf(c);
  const order = ['lvSip', 'lvWatch', 'lvYawn', 'lvStow', 'lvSitDown', 'lvNap', 'lvWake', 'lvType'].map(idx);
  ok(order.every((v, i) => v >= 0 && (!i || v > order[i - 1])) && D.steps[idx('lvNap')].emo === 'sleep' && D.steps[idx('lvWatch')].propIn === 'mug',
    'leo thang khi chờ: nhấp cà phê → xem đồng hồ → ngáp → cất ly vào túi → tới sofa → ngồi → ngủ gật (sleep) → có việc thì giật mình tỉnh → tới bàn gõ phím', clips.join(' '));
  // LEO THANG khi test đỏ liên tiếp: giật mình → ôm đầu + búa → vịt cao su → CHÁY + bình chữa cháy; xanh thì về 0
  const seq = []; let t = 0; for (let i = 0; i < 4; i++) { seq.push({ kind: 'test_run', at: t }, { kind: 'test_fail', at: t + 3 }); t += 12; } seq.push({ kind: 'test_run', at: t }, { kind: 'test_pass', at: t + 3 }, { kind: 'test_run', at: t + 12 }, { kind: 'test_fail', at: t + 15 });
  const E = run(seq, 20, 1 / 30), took = E.steps.filter(s => s.type === 'takeOut' && s.propOut !== 'mug').map(s => s.propOut), fails = E.steps.filter(s => s.act === 'test_fail' && s.main).map(s => s.bubble.id);
  ok(took.join(',') === 'hammer,duck,extinguisher' && fails.length === 5 && fails[0] === fails[4] && fails[1] !== fails[0] && /CHÁY/.test(fails[3]) && E.steps.some(s => s.world === 'extinguish' && s.clip === 'lvSpray'),
    'leo thang test đỏ: lần 1 úp mặt · lần 2 búa · lần 3 vịt cao su · lần 4+ cháy màn hình → bình chữa cháy (lục túi, xịt, cất lại) · test xanh đặt lại về lần 1', took.join(',') + ' | ' + fails.join(' / '));
  // thời gian đứng tối thiểu: việc chính diễn ≥ 1,2 s dù sự kiện kế đã chờ
  const F = run([{ kind: 'edit', at: 0 }, { kind: 'test_run', at: 3.5 }, { kind: 'release', at: 3.6 }], 15, 1 / 30);
  const mains = F.steps.filter(s => s.main);
  ok(mains.length === 3 && mains.every(s => s.t1 - s.t0 >= L.MIN_DWELL - 1e-6), 'thời gian đứng tối thiểu: mỗi việc chính ≥ ' + L.MIN_DWELL + ' s dù việc sau đã xếp hàng', mains.map(s => s.clip + ' ' + (s.t1 - s.t0).toFixed(2)).join(', '));
  // trợ lý: ≤ 8 cùng lúc, vào / ra qua cửa
  const G = run(Array.from({ length: 11 }, (x, i) => ({ kind: 'delegate_start', at: i * 6 })).concat([{ kind: 'delegate_end', at: 70 }]), 30, 0.5);
  let maxLive = 0; for (let t2 = 0; t2 < 110; t2 += 0.5) maxLive = Math.max(maxLive, G.helpers.filter(h => G.helperAt(h, t2)).length);
  const h0 = G.helpers[0];
  ok(maxLive === 8 && Math.abs(G.helperAt(h0, h0.tIn).x - L.ZONES.door.x) < 1 && G.helperAt(h0, h0.tGone - 0.01) && Math.abs(G.helperAt(h0, h0.tGone - 0.01).x - L.ZONES.door.x) < 5,
    'trợ lý (L-42): 11 lần giao việc → tối đa ' + maxLive + ' trợ lý cùng lúc (trần 8) · vào và ra qua cửa');
}
{
  // KHÔNG GIẬT TƯ THẾ ở chỗ nối bước: đo điểm mốc cơ thể giữa hai khung 60 fps liền nhau quanh mọi chỗ nối (trộn 0,22 s)
  const seq = randomSeq(9).concat(randomSeq(10).map(e => ({ kind: e.kind, at: e.at + 70 })));
  const D = run(seq, 20, 1 / 30);
  const jumps = blend => {
    const S = L.stage(null, D, { blend }), out = []; let prev = null;
    D.steps.forEach(s => { if (!D.prevOf(s)) return; [-1 / 60, 0, 1 / 60].forEach(dt => {
      const t = s.t0 + dt; if (t <= 0) return;
      const a = S.sample(t - 1 / 60), b = S.sample(t); if (!a || !b || a.pose.root.sx * b.pose.root.sx < 0) return;   // lật hướng (quay người) đo riêng — bản vẽ đổi
      const ka = GC.keyPoints(a.pose), kb = GC.keyPoints(b.pose); let m = 0; for (const k in kb) m = Math.max(m, Math.hypot(kb[k][0] - ka[k][0], kb[k][1] - ka[k][1]));
      out.push(m); }); });
    out.sort((x, y) => x - y); return { p95: out[Math.floor(out.length * 0.95)] || 0, n: out.length };
  };
  const on = jumps(), off = jumps(0);
  ok(on.p95 < 12 && off.p95 > on.p95 * 1.8, 'không giật tư thế ở chỗ nối bước: p95 bước nhảy điểm mốc / khung = ' + on.p95.toFixed(1) + ' đơn vị khung (tắt trộn: ' + off.p95.toFixed(1) + ' — rào có tác dụng, ' + on.n + ' mẫu)');
  // vẽ được trong Node: một khung SVG hoàn chỉnh có túi đeo + đạo cụ + bong bóng (dịch được)
  const S = L.stage(null, D), tk = D.steps.find(s => s.type === 'takeOut' && s.propOut !== 'book');
  const sv = tk ? S.svg(tk.t1 - 0.05, { tr: x => 'EN:' + x }) : '';
  ok(tk && /<svg[^>]+viewBox="0 0 1280 720"/.test(sv) && sv.includes('#a36a3c') && sv.includes(L.PROP_ART[tk.propOut].slice(0, 40)) && /EN:/.test(sv) && sv.length < 400000, 'khung SVG (Node): sân khấu + túi đeo + ' + (tk && tk.propOut) + ' trong tay + bong bóng qua hàm dịch (' + Math.round(sv.length / 1024) + ' KB)');
  // ngân sách: lấy mẫu một khung < 2 ms trung bình (Node)
  const t0 = process.hrtime.bigint(); let n = 0; for (let t = 0; t < 60; t += 1 / 60) { S.sample(t); n++; } const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  ok(ms < 2, 'ngân sách: sample() trung bình ' + ms.toFixed(3) + ' ms / khung (Node, gồm dựng clip theo bước)');
}

/* ------------------------------------------------------------------ 3. bộ chuyển hooks */
const HOOK = path.join(ROOT, 'tools/live-hook.mjs');
const { classify } = await import(HOOK);
{
  const SENT = 'ZZSENTINEL', H = (ev, extra) => Object.assign({ hook_event_name: ev, session_id: SENT + 'sid', transcript_path: '/home/' + SENT + '/t.jsonl', cwd: '/srv/' + SENT }, extra);
  const T = [
    [H('UserPromptSubmit', { prompt: SENT + ' my password is hunter2' }), 'prompt'],
    [H('PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/etc/' + SENT } }), 'read'],
    [H('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: SENT } }), 'search'],
    [H('PreToolUse', { tool_name: 'Glob', tool_input: { pattern: '**/' + SENT } }), 'search'],
    [H('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: '/x/' + SENT, old_string: SENT, new_string: SENT } }), 'edit'],
    [H('PreToolUse', { tool_name: 'Write', tool_input: { file_path: '/x', content: SENT } }), 'write'],
    [H('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls ' + SENT } }), 'run'],
    [H('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'cd x && bash tools/test.sh ' + SENT } }), 'test_run'],
    [H('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test -- ' + SENT } }), 'test_run'],
    [H('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'git push origin HEAD:main' } }), 'release'],
    [H('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npx vitest' }, tool_response: { stdout: '3 failed, 10 passed ' + SENT, stderr: '' } }), 'test_fail'],
    [H('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'pytest -q' }, tool_response: { stdout: '12 passed ' + SENT, stderr: '' } }), 'test_pass'],
    [H('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'make' }, tool_response: { stdout: '', stderr: 'Error: ' + SENT, interrupted: false, exit_code: 2 } }), 'error'],
    [H('PostToolUse', { tool_name: 'Read', tool_response: { content: SENT } }), null],
    [H('PreToolUse', { tool_name: 'Task', tool_input: { subagent_type: 'Explore', description: SENT, prompt: SENT } }), 'delegate_start'],
    [H('SubagentStop', {}), 'delegate_end'],
    [H('Stop', { stop_hook_active: false }), 'wait_user'],
    [H('Notification', { message: 'Claude needs your permission ' + SENT }), 'wait_user'],
    [H('Notification', { message: 'Usage limit reached ' + SENT }), 'limit'],
    [H('PreCompact', {}), 'limit'],
    [H('SessionStart', { source: 'startup' }), 'session_start'],
    [H('SessionEnd', {}), 'stop'],
    [H('PreToolUse', { tool_name: 'mcp__' + SENT + '__x', tool_input: { a: SENT } }), 'run'],
    [H('PreToolUse', { tool_name: 'TodoWrite', tool_input: { todos: [{ content: SENT }] } }), 'think'],
  ];
  const wrong = T.filter(([h, k]) => (classify(h) || { kind: null }).kind !== k).map(([h, k]) => h.hook_event_name + '/' + (h.tool_name || '') + ' → ' + JSON.stringify(classify(h)) + ' (cần ' + k + ')');
  const leaky = T.map(([h]) => JSON.stringify(classify(h) || {})).filter(s => s.includes(SENT) || /hunter2|\/etc|\/home|\/srv/.test(s));
  ok(!wrong.length, 'hooks → sự kiện: ' + T.length + ' ca (Read / Grep / Glob / Edit / Write / Bash · test · phát hành · lỗi · Task / SubagentStop · Stop / Notification / PreCompact / Session*)', wrong.join(' | '));
  ok(!leaky.length && classify(T[14][0]).label === 'Explore', 'hooks: sự kiện chỉ có kind + tên tool + "claude-code" (+ loại trợ lý) — không prompt / đường dẫn / lệnh / kết quả tool nào', leaky.join(' | '));
  // chạy thật như Claude Code gọi: server giả ghi lại thân, kiểm mã thoát + thời gian + không rò nội dung
  const bodies = []; let hang = false;
  const fake = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { bodies.push({ b, auth: req.headers.authorization, xr: req.headers['x-gc-request'] }); if (hang) return; res.writeHead(202); res.end('{}'); }); });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const URL0 = 'http://127.0.0.1:' + fake.address().port, TOK = 'gcl_' + 'a'.repeat(40);
  const runHook = (input, env) => new Promise(resolve => {
    const t0 = Date.now(), c = spawn(process.execPath, [HOOK], { env: Object.assign({ PATH: process.env.PATH, HOME: os.tmpdir() }, env), stdio: ['pipe', 'pipe', 'pipe'] });
    kids.push(c); let out = ''; c.stdout.on('data', d => out += d);
    c.on('exit', code => resolve({ code, ms: Date.now() - t0, out }));
    if (input === null) return;   // stdin để mở, không gửi gì (agent treo)
    c.stdin.on('error', () => {}); c.stdin.end(input);
  });
  const res = [];
  for (const [h] of T) res.push(await runHook(JSON.stringify(h), { GC_LIVE_URL: URL0, GC_LIVE_TOKEN: TOK }));
  const junk = [await runHook('not json {{{', { GC_LIVE_URL: URL0, GC_LIVE_TOKEN: TOK }), await runHook('', { GC_LIVE_URL: URL0, GC_LIVE_TOKEN: TOK }), await runHook(null, { GC_LIVE_URL: URL0, GC_LIVE_TOKEN: TOK }),
    await runHook('x'.repeat(3e6), { GC_LIVE_URL: URL0, GC_LIVE_TOKEN: TOK }), await runHook(JSON.stringify(T[0][0]), {}), await runHook(JSON.stringify(T[1][0]), { GC_LIVE_URL: 'http://127.0.0.1:1', GC_LIVE_TOKEN: TOK }),
    await runHook(JSON.stringify(T[1][0]), { GC_LIVE_URL: '::not a url', GC_LIVE_TOKEN: TOK })];
  hang = true; const slow = await runHook(JSON.stringify(T[1][0]), { GC_LIVE_URL: URL0, GC_LIVE_TOKEN: TOK }); hang = false;
  const all = res.concat(junk, [slow]);
  ok(all.every(r => r.code === 0 && r.out === ''), 'live-hook.mjs: ' + all.length + ' lần chạy (hợp lệ · rác · rỗng · stdin treo · 3 MB · thiếu token · không có server · URL hỏng · server treo) đều thoát 0, stdout trống', all.map(r => r.code).join(','));
  const worst = Math.max(...all.map(r => r.ms));
  ok(worst < 1500 && slow.ms < 1500, 'live-hook.mjs không chặn agent: lâu nhất ' + worst + ' ms (server treo: ' + slow.ms + ' ms; trần đọc stdin 250 ms + gửi 300 ms + khởi động Node)');
  const sent = bodies.map(x => x.b), leak = sent.filter(b => b.includes(SENT) || /hunter2|\/etc\/|\/home\//.test(b) || b.length > 200);
  ok(sent.length >= T.length - 1 && !leak.length && bodies.every(x => x.auth === 'Bearer ' + TOK && x.xr === '1') && sent.every(b => Object.keys(JSON.parse(b)).every(k => ['kind', 'tool', 'agent', 'at', 'label'].includes(k))),
    'live-hook.mjs gửi ' + sent.length + ' sự kiện thật: chỉ { kind, tool, agent, at, label? }, ≤ 200 byte, Bearer + X-GC-Request — không mảnh nội dung nào (prompt, đường dẫn, lệnh, kết quả)', leak.slice(0, 3).join(' | '));
  fake.close();
}

/* ------------------------------------------------------------------ 4. HTTP + SSE + MCP */
{
  const PORT = +(process.env.GC_LIVE_TEST_PORT || 7764), HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-live-')); tmp.push(HOME);
  const OWNER = 'owner-live-' + Math.random().toString(36).slice(2) + 'x'.repeat(20), BASE = 'http://127.0.0.1:' + PORT;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: HOME, GC_PORT: String(PORT), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: OWNER, HOME: HOME }), stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(srv); let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 100)); }
  const J = { 'Content-Type': 'application/json', 'X-GC-Request': '1' };
  const post = (body, h) => fetch(BASE + '/api/live/event', { method: 'POST', headers: Object.assign({}, J, h), body: typeof body === 'string' ? body : JSON.stringify(body) });
  const own = { Authorization: 'Bearer ' + OWNER };
  const info = await (await fetch(BASE + '/api/live/info', { headers: own })).json(), LT = info.token;
  const st = fs.statSync(path.join(HOME, 'data', 'live-token'));
  ok(/^gcl_[A-Za-z0-9_-]{32,}$/.test(LT) && (st.mode & 0o777) === 0o600 && info.settings.hooks.PreToolUse[0].hooks[0].command.includes(LT) && info.settings.hooks.PreToolUse[0].hooks[0].command.includes('live-hook.mjs') && Object.keys(info.settings.hooks).length === 9,
    'token live: data/live-token 0600 · /api/live/info (chủ) trả token + đoạn settings.json cho 9 hook của Claude Code');
  const sse = await fetch(BASE + '/api/live/stream', { headers: own }), rd = sse.body.getReader(), dec = new TextDecoder(); let got = '';
  const pump = (async () => { for (;;) { const x = await rd.read().catch(() => ({ done: true })); if (x.done) return; got += dec.decode(x.value); } })();
  const codes = {};
  codes.none = (await post({ kind: 'read' })).status;
  codes.live = (await post({ kind: 'read', label: 'Reading /etc/shadow with sk-ant-api03-AAAABBBBCCCCDDDDEEEE and ryan@x.io' }, { Authorization: 'Bearer ' + LT })).status;
  codes.liveHdr = (await post({ kind: 'edit', label: 'Fixing the date bug' }, { 'X-GC-Live-Token': LT })).status;
  codes.owner = (await post({ kind: 'test_pass' }, own)).status;
  codes.liveInfo = (await fetch(BASE + '/api/info', { headers: { Authorization: 'Bearer ' + LT } })).status;
  codes.liveStream = (await fetch(BASE + '/api/live/stream', { headers: { Authorization: 'Bearer ' + LT } })).status;
  codes.liveRotate = (await fetch(BASE + '/api/live/token', { method: 'POST', headers: Object.assign({}, J, { Authorization: 'Bearer ' + LT }) })).status;
  codes.liveMcp = (await fetch(BASE + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LT }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' })).status;
  codes.noXR = (await fetch(BASE + '/api/live/event', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LT }, body: '{"kind":"read"}' })).status;
  codes.ctype = (await fetch(BASE + '/api/live/event', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-GC-Request': '1', Authorization: 'Bearer ' + LT }, body: '{"kind":"read"}' })).status;
  codes.badKind = (await post({ kind: 'rm -rf' }, { Authorization: 'Bearer ' + LT })).status;
  codes.big = (await post({ kind: 'read', label: 'x'.repeat(5000) }, { Authorization: 'Bearer ' + LT })).status;
  codes.badJson = (await post('{nope', { Authorization: 'Bearer ' + LT })).status;
  codes.wrongTok = (await post({ kind: 'read' }, { Authorization: 'Bearer gcl_' + 'b'.repeat(40) })).status;
  codes.evilOrigin = (await post({ kind: 'read' }, Object.assign({ Origin: 'https://evil.example' }, own))).status;
  ok(codes.none === 401 && codes.live === 202 && codes.liveHdr === 202 && codes.owner === 202 && codes.wrongTok === 401, 'POST /api/live/event: không token → 401 · token live (Bearer / X-GC-Live-Token) → 202 · token chủ → 202 · token live sai → 401', JSON.stringify(codes));
  ok(codes.liveInfo === 401 && codes.liveStream === 401 && codes.liveRotate === 401 && codes.liveMcp === 401, 'token live CHỈ mở POST /api/live/event: /api/info, SSE, đổi token, /mcp đều 401', JSON.stringify(codes));
  ok(codes.noXR === 403 && codes.ctype === 415 && codes.badKind === 400 && codes.big === 413 && codes.badJson === 400 && codes.evilOrigin === 403, 'CSRF + dạng: thiếu X-GC-Request 403 · Content-Type khác JSON 415 · kind lạ 400 · thân > 4 KB 413 · JSON hỏng 400 · Origin lạ (chủ) 403', JSON.stringify(codes));
  // MCP live_event (agent không phải Claude Code)
  const mr = await (await fetch(BASE + '/mcp', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, own), body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'live_event', arguments: { kind: 'search', label: 'Grep for TODO in ~/secret/plan.md now' } } }) })).json();
  const mres = JSON.parse(mr.result.content[0].text);
  const mbad = await (await fetch(BASE + '/mcp', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, own), body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'live_event', arguments: { kind: 'hack' } } }) })).json();
  ok(mres.ok && mres.kind === 'search' && !/secret|plan|TODO in ~/.test(mres.label) && mbad.result.isError, 'MCP live_event: sự kiện vào cùng đường (nhãn đã làm sạch: "' + mres.label + '") · kind lạ → lỗi có mã');
  // trần tần suất: dồn 60, hồi 10 / s → bắn 90 liên tục phải có 429 + Retry-After
  let n429 = 0, retry = null;
  const burst = await Promise.all(Array.from({ length: 90 }, () => post({ kind: 'read' }, { Authorization: 'Bearer ' + LT })));
  burst.forEach(r => { if (r.status === 429) { n429++; retry = r.headers.get('retry-after'); } });
  const other = (await post({ kind: 'read' }, own)).status;   // kênh khác (chủ) không bị kênh hook làm nghẹt
  ok(n429 >= 20 && +retry >= 1 && other === 202, 'trần tần suất theo kênh: 90 sự kiện dồn dập qua token live → ' + n429 + ' lần 429 (Retry-After ' + retry + ' s) · kênh chủ vẫn 202');
  await new Promise(r => setTimeout(r, 400));
  const frames = got.split('\n\n').filter(f => f.includes('data: ')).map(f => JSON.parse(f.split('\n').find(l => l.startsWith('data: ')).slice(6)));
  const leak = /etc|shadow|sk-ant|ryan@|x\.io|secret|plan\.md|rm -rf/.test(got);
  ok(frames.length >= 5 && frames[0].kind === 'read' && frames[0].label === 'Reading with and', 'SSE: ' + frames.length + ' sự kiện tới trình xem theo thứ tự (id, ts, kind, label đã làm sạch: "' + (frames[0] && frames[0].label) + '")');
  ok(!leak && !/sk-ant|shadow|ryan@x\.io/.test(log), 'không rò: luồng SSE và log server không chứa đường dẫn / token / email / lệnh của nhãn gốc');
  // đổi token: token cũ hết hiệu lực
  const rot = await (await fetch(BASE + '/api/live/token', { method: 'POST', headers: Object.assign({}, J, own) })).json();
  const oldS = (await post({ kind: 'read' }, { Authorization: 'Bearer ' + LT })).status, newS = (await post({ kind: 'edit' }, { Authorization: 'Bearer ' + rot.token })).status;
  ok(rot.token !== LT && oldS === 401 && (newS === 202 || newS === 429) && fs.readFileSync(path.join(HOME, 'data', 'live-token'), 'utf8').trim() === rot.token, 'đổi token live: token cũ 401, token mới dùng được, tệp ghi token mới');
  // phát lại phiên mẫu qua đúng đường HTTP (như hooks)
  await new Promise(r => setTimeout(r, 6500));   // bình token của kênh hook hồi đầy (60 / 10 mỗi giây)
  const rp = spawnSync(process.execPath, [path.join(ROOT, 'tools/live-replay.mjs'), '--speed', '25', '--url', BASE], { env: Object.assign({}, process.env, { GC_LIVE_TOKEN: rot.token, HOME }), encoding: 'utf8', timeout: 30000 });
  const nDemo = L.parseJSONL(fs.readFileSync(path.join(ROOT, 'kinds/live/demo-session.jsonl'), 'utf8')).length;
  ok(rp.status === 0 && new RegExp('replayed ' + nDemo + '/' + nDemo).test(rp.stdout) && nDemo >= 40, 'tools/live-replay.mjs: phát lại ' + nDemo + ' sự kiện của phiên mẫu (prompt → đọc / tìm → sửa → test đỏ ×4 → giao việc → test xanh → phát hành → chờ) ×25 qua HTTP', rp.stdout + rp.stderr);
  // phiên mẫu đi hết các khu trên sân khấu
  const DD = L.director(), DL = L.parseJSONL(fs.readFileSync(path.join(ROOT, 'kinds/live/demo-session.jsonl'), 'utf8')); let di = 0; for (let t = 0; t < 140; t += 0.1) { while (di < DL.length && DL[di].at <= t) { DD.push(DL[di].ev, t); di++; } DD.advance(t); }
  const zones = new Set(DD.steps.filter(s => s.type === 'walk').map(s => s.zone)), props = new Set(DD.steps.filter(s => s.type === 'takeOut').map(s => s.propOut));
  ok(['shelf', 'desk', 'lab', 'door', 'rocket', 'coffee', 'sofa'].every(z => zones.has(z)) && props.size >= 6 && !checkSteps(DD).length, 'phiên mẫu: đi qua ' + zones.size + ' khu (' + [...zones].join(', ') + ') · lấy ' + props.size + ' loại đồ (' + [...props].join(', ') + ')');
  try { await rd.cancel(); } catch (e) { /* bỏ */ } await pump;
  srv.kill(); await new Promise(r => srv.once('exit', r));
}
console.log(bad ? '   ✗ test-live: có lỗi' : '   ✓ test-live: đạt');
process.exit(bad);
