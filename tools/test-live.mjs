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
    && ce({ kind: 'read', tool: '../../etc' }).ev.tool === 'etc' && ce({ kind: 'read', tool: 'a'.repeat(99) }).ev.tool.length === 24 && L.KINDS.length === 20,
    'cleanEvent: kind ngoài 20 loại / không phải object / label không phải chuỗi → lỗi · khoá lạ bị bỏ · tool chỉ [A-Za-z0-9_.-] ≤ 24');
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
  const sv = tk ? S.svg(tk.t1 - 0.05, { tr: x => 'EN:' + x }) : '', mb = D.steps.find(s => s.main && s.bubble), sb = mb ? S.svg(mb.t0 + 0.5, { tr: x => 'EN:' + x }) : '';
  ok(tk && /<svg[^>]+viewBox="0 0 1280 720"/.test(sv) && sv.includes('#a36a3c') && sv.includes(L.PROP_ART[tk.propOut].slice(0, 40)) && /EN:/.test(sb) && sv.length < 400000, 'khung SVG (Node): sân khấu + túi đeo + ' + (tk && tk.propOut) + ' trong tay + bong bóng qua hàm dịch (' + Math.round(sv.length / 1024) + ' KB)');
  // ngân sách: lấy mẫu một khung < 2 ms trung bình (Node)
  const t0 = process.hrtime.bigint(); let n = 0; for (let t = 0; t < 60; t += 1 / 60) { S.sample(t); n++; } const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  ok(ms < 2, 'ngân sách: sample() trung bình ' + ms.toFixed(3) + ' ms / khung (Node, gồm dựng clip theo bước)');
}


{
  // NHÃN NGƯỜI ĐỌC: bong bóng chỉ là câu của bảng (+ "×N") — không bao giờ tên công cụ / loại trợ lý / nhãn hay nội dung agent gửi
  const EN = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/en/engine.json'), 'utf8')), IDS = new Set(L.phraseIds());
  const TOOLS = ['Read', 'Grep', 'Glob', 'LS', 'Bash', 'Edit', 'MultiEdit', 'Write', 'Agent', 'Task', 'Explore', 'TodoWrite', 'WebFetch', 'WebSearch', 'ToolSearch', 'Skill', 'NotebookEdit', 'NotebookRead', 'mcp', 'ExitPlanMode', 'general-purpose'];
  const TOOL_RE = new RegExp('\\b(' + TOOLS.map(x => x.replace(/[-]/g, '\\-')).join('|') + ')\\b'), SENT = 'ZZLBL';
  const bad = [];
  let r = 3;
  for (let i = 0; i < 4000; i++) {
    r = (r * 1103515245 + 12345) % 2147483648;
    const kind = L.KINDS[r % L.KINDS.length], tool = [...TOOLS, 'x' + SENT, '', '__proto__', 'constructor'][(r >> 5) % (TOOLS.length + 4)], sub = [...L.SUBS, 'Explore', SENT, ''][(r >> 9) % (L.SUBS.length + 3)], lv = (r >> 13) % 5;
    const id = L.phrase(kind, tool, sub, lv), en = EN[id];
    if (!IDS.has(id)) bad.push('lạ: ' + id);
    if (!en) bad.push('thiếu bản en: ' + id);
    [id, en || ''].forEach(x => { if (TOOL_RE.test(x) || x.includes(SENT)) bad.push(kind + '/' + tool + '/' + sub + ' → ' + x); });
  }
  // qua cả đạo diễn: sự kiện mang nhãn + tên tool + loại trợ lý → mọi bong bóng (cả bộ đếm) sạch
  const D = L.director(); let t = 0;
  for (let i = 0; i < 300; i++) { t += 0.05 + (i % 7) * 0.4; D.push({ kind: L.KINDS[i % L.KINDS.length], label: 'Explore the ' + SENT + ' Grep thing', tool: TOOLS[i % TOOLS.length], sub: L.SUBS[i % L.SUBS.length] }, t); D.advance(t); }
  for (let k = 0; k < 400; k++) { t += 0.25; D.advance(t); }
  const texts = D.steps.filter(s => s.bubble).map(s => L.bubbleText(s.bubble, x => EN[x] || x) + ' | ' + L.bubbleText(s.bubble));
  texts.forEach(x => { if (TOOL_RE.test(x.replace(/×\d+/g, '')) || x.includes(SENT)) bad.push('bong bóng: ' + x); });
  ok(!bad.length && texts.length > 50, 'nhãn người đọc: 4000 tổ hợp (loại × công cụ × loại trợ lý × bậc) + ' + texts.length + ' bong bóng qua đạo diễn — chỉ câu của bảng (có bản en), không tên công cụ / loại trợ lý / nhãn agent', [...new Set(bad)].slice(0, 6).join(' | '));
  // câu theo công cụ: Grep / WebSearch / TodoWrite / trợ lý trinh sát ra câu riêng (người đọc hiểu đang làm gì)
  ok(L.phrase('search', 'WebSearch', '', 0) !== L.phrase('search', 'Grep', '', 0) && L.phrase('delegate_start', '', 'explore', 0) !== L.phrase('delegate_start', '', 'other', 0) && L.phrase('think', 'TodoWrite', '', 0) !== L.phrase('think', '', '', 0),
    'nhãn theo nhóm công cụ: tìm trong code ≠ tra cứu mạng · trợ lý trinh sát ≠ trợ lý chung · lên kế hoạch ≠ suy nghĩ');
  // lên kế hoạch → sổ tay từ túi (lấy, viết, cất)
  const P = run([{ kind: 'think', at: 0 }], 10, 1 / 30);
  const Q = L.director(); Q.push({ kind: 'think', tool: 'TodoWrite' }, 0); for (let u = 0; u < 12; u += 1 / 30) Q.advance(u);
  ok(!P.steps.some(s => s.propOut === 'notebook') && Q.steps.some(s => s.type === 'takeOut' && s.propOut === 'notebook') && Q.steps.some(s => s.clip === 'lvNote' && s.propIn === 'notebook') && Q.steps.some(s => s.type === 'putBack' && s.propIn === 'notebook'), 'lên kế hoạch (TodoWrite / plan) → lục túi lấy sổ tay, ghi, cất lại; suy nghĩ thường thì chống cằm');
}
{
  // DIỄN TÓM TẮT: agent nhanh hơn sân khấu — không sự kiện nào mất; việc quan trọng (lỗi, test đỏ / xanh, phát hành, chờ bạn…) luôn có nhịp riêng đúng loại
  let lost = [], critMiss = [], nEv = 0, maxQ = 0, sumOk = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed * 7919), D = L.director(), evs = []; let t = 0;
    for (let i = 0; i < 120; i++) { t += r() < 0.8 ? 0.02 + r() * 0.15 : r() * 2; const kind = r() < 0.75 ? ['read', 'search', 'edit', 'run', 'think', 'write'][Math.floor(r() * 6)] : L.KINDS[Math.floor(r() * L.KINDS.length)]; evs.push({ id: 'e' + i, kind, at: t, task: L.TASKS[Math.floor(r() * L.TASKS.length)] }); }
    let i = 0; const end = t + 120;
    for (let u = 0; u <= end; u += 0.1) { while (i < evs.length && evs[i].at <= u) { D.push({ id: evs[i].id, kind: evs[i].kind, task: evs[i].task }, u); i++; } D.advance(u); maxQ = Math.max(maxQ, D.queue.length); }
    const owner = new Map(); D.steps.filter(s => s.main && s.evs).forEach(s => s.evs.forEach(id => { if (!owner.has(id)) owner.set(id, s); }));
    const noop = new Set(D.log.filter(x => x.noop).map(x => x.id));
    evs.forEach(e => { nEv++; if (noop.has(e.id)) return; const s = owner.get(e.id); if (!s) lost.push(seed + ':' + e.id + ':' + e.kind); else if (L.CRITICAL[e.kind] && s.act !== e.kind) critMiss.push(seed + ':' + e.kind + '→' + s.act); });
    if (D.steps.some(s => s.main && s.bubble && s.bubble.n > 1)) sumOk++;
  }
  ok(!lost.length && !critMiss.length && sumOk > 250, 'diễn tóm tắt: 300 loạt × 120 sự kiện dồn dập (' + nEv + ' sự kiện) — không sự kiện nào mất (gộp vào một nhịp có bộ đếm ×N ở ' + sumOk + ' loạt) · việc quan trọng luôn diễn đúng loại của nó (hàng đợi dài nhất ' + maxQ + ')', lost.slice(0, 5).concat(critMiss.slice(0, 5)).join(' | '));
  // rào có tác dụng: bỏ bớt việc quan trọng (giả lập bản cũ: hàng đợi chỉ giữ 5 mục, bỏ cũ nhất) thì phép kiểm phải bắt được
  const D2 = L.director(); for (let k = 0; k < 20; k++) D2.push({ id: 'f' + k, kind: 'test_fail' }, 0.01 * k); D2.queue.splice(0, D2.queue.length - 5);
  for (let u = 0; u < 200; u += 0.25) D2.advance(u);
  const has = new Set(); D2.steps.filter(s => s.main && s.evs).forEach(s => s.evs.forEach(id => has.add(id)));
  ok(has.size < 20, 'kiểm tra không mù: một hàng đợi bị cắt còn 5 mục làm mất ' + (20 - has.size) + ' / 20 lần test đỏ — phép kiểm trên bắt được');
}
{
  // MÁY QUAY: tất định, êm (≤ 14 đơn vị và ≤ 0,03 zoom mỗi khung 60 fps), không lộ ngoài sân khấu; đứng làm việc thì tiến gần, đi xa thì lùi
  const D = run(randomSeq(77).concat([{ kind: 'release', at: 60 }, { kind: 'wait_user', at: 70 }]), 40, 1 / 30), S = L.stage(null, D), end = D.steps[D.steps.length - 1].t1;
  let jump = 0, zj = 0, out = 0, prev = null, zs = new Set();
  for (let t = 0; t < end; t += 1 / 60) { const c = S.camAt(t); if (prev) { jump = Math.max(jump, Math.abs(c.x - prev.x), Math.abs(c.y - prev.y)); zj = Math.max(zj, Math.abs(c.z - prev.z)); } if (c.x - L.W / 2 / c.z < -0.01 || c.x + L.W / 2 / c.z > L.W + 0.01 || c.y - L.H / 2 / c.z < -0.01 || c.y + L.H / 2 / c.z > L.H + 0.01) out++; zs.add(Math.round(c.z * 10)); prev = c; }
  const same = [3.3, 17.7, 41.2].every(t => JSON.stringify(S.camAt(t)) === JSON.stringify(L.stage(null, D).camAt(t)));
  ok(jump <= 20 && zj <= 0.03 && !out && same && zs.size >= 3, 'máy quay: tất định · êm (≤ 20 đv / khung; lệch lớn nhất ' + jump.toFixed(1) + ' đv, zoom ' + zj.toFixed(3) + ' / khung) · không lộ ngoài sân khấu · ' + zs.size + ' mức zoom (đi xa lùi, làm việc tiến gần, phóng tên lửa rộng)');
}
{
  // CÔNG TẮC VIỆC (live_task): bộ việc cố định · tiêu đề làm sạch (≤ 60) · cùng việc = không làm gì · nhịp đúng thứ tự (cất hết đồ → clapper từ túi → clap đổi dấu → cất → đi về khu của việc)
  const ce = L.cleanEvent, tt = ce({ kind: 'task', task: 'debug', title: 'Fix /etc/passwd bug with sk-ant-api03-AAAABBBBCCCCDDDDEEEE in ryan@x.io and a very long tail of many many words here' }).ev;
  ok(ce({ kind: 'task', task: 'hack' }).error && ce({ kind: 'task' }).error && ce({ kind: 'task', task: 'code', title: 5 }).error && L.TASKS.length === 12 && tt.task === 'debug' && !/etc|passwd|sk-ant|ryan|@/.test(tt.title) && Array.from(tt.title).length <= 60 && /^Fix bug with/.test(tt.title),
    'live_task: 12 việc cố định (task lạ / thiếu → lỗi) · tiêu đề qua cùng luật làm sạch, ≤ 60 ký tự ("' + tt.title + '")');
  const D = L.director(); let t = 0;
  const seqT = [['read', 0], ['task', 0.5, 'debug'], ['task', 0.7, 'debug'], ['edit', 1], ['task', 9, 'debug'], ['task', 14, 'release'], ['test_run', 15], ['task', 30, 'chat']];
  let i = 0; for (; t < 60; t += 1 / 30) { while (i < seqT.length && seqT[i][1] <= t) { D.push({ kind: seqT[i][0], task: seqT[i][2] }, t); i++; } D.advance(t); }
  const claps = D.steps.filter(s => s.clip === 'lvClap'), noops = D.log.filter(x => x.noop).length;
  const order = claps.map(c => { const k = D.steps.indexOf(c), pre = D.steps[k - 1], post = D.steps.slice(k + 1, k + 4), walk = post.find(s => s.type === 'walk');
    return pre.type === 'takeOut' && pre.propOut === 'clapper' && pre.propIn === null && pre.clip === 'lvRummage' && c.taskMark && post[0].type === 'putBack' && post[0].propIn === 'clapper' && (!walk || (walk.propIn === null && walk.zone === L.TASK_HOME[c.taskMark])); });
  ok(claps.length === 3 && claps.map(c => c.taskMark).join(',') === 'debug,release,chat' && noops === 2 && order.every(Boolean) && D.taskAt(59) === 'chat' && D.taskAt(claps[1].t0 - 0.01) === 'debug',
    'nhịp "việc mới": 3 lần đổi việc → 3 nhịp (debug, release, chat); 2 lần gửi lại cùng việc = không làm gì · thứ tự: cất hết đồ → lục túi lấy clapper → clap (đổi dấu trên mũ) → cất → đi tay không về khu của việc', claps.map(c => c.taskMark).join(',') + ' noop ' + noops + ' order ' + order.join(','));
  const S = L.stage(null, D), F = S.sample(claps[1].t0 + 0.6), sv = S.svg(claps[1].t0 + 0.6, { tr: x => x });
  ok(F.task === 'release' && /lv-badge/.test(sv) && L.bubbleText(F.bubble) === L.TASK_NEW.release, 'dấu việc trên mũ đổi ở nhịp clap · bong bóng "' + L.TASK_NEW.release + '" (câu của bảng, không tiêu đề agent)');
  // quy tắc vàng một nguồn: GUIDE.md §3 → rules.js → initialize / start_here / chatroom (khi có tool) / skill
  const Rules = require(path.join(ROOT, 'server/rules.js')), { TOOLS, scopeCtx } = require(path.join(ROOT, 'server/mcp.js')), Agent = require(path.join(ROOT, 'server/agent.js'));
  const RULE = Rules.golden().find(r => /live_task/.test(r)) || '';
  const skTxt = JSON.stringify(Agent.wrapper('claude'));
  ok(/differs from the current one/.test(RULE) && Rules.mcp({}, TOOLS).includes(RULE) && Rules.forConnection({}, TOOLS).includes(RULE) && !Rules.mcp(scopeCtx('mcp:read'), TOOLS).includes('live_task')
    && skTxt.includes('live_task') && skTxt.includes('Flip the task switch') && TOOLS.some(x => x.name === 'live_task' && x.annotations.readOnlyHint === false && x.description === Rules.LIVE.task),
    'quy tắc "đổi việc → gọi live_task trước": một nguồn (GUIDE.md §3 qua rules.js) → MCP initialize + start_here + skill Claude; kết nối chỉ đọc không nghe (live_task là tool ghi) · mô tả tool từ rules.js');
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
    [H('PreToolUse', { tool_name: 'Task', tool_input: { subagent_type: 'Explore', description: SENT, prompt: SENT } }), null],
    [H('SubagentStart', { agent_id: SENT, agent_type: 'Explore' }), 'delegate_start'],
    [H('PostToolUseFailure', { tool_name: 'Bash', tool_input: { command: 'npm test' }, error: SENT, is_interrupt: false }), 'test_fail'],
    [H('PostToolUseFailure', { tool_name: 'Edit', tool_input: { file_path: SENT }, error: SENT, is_interrupt: true }), 'wait_user'],
    [H('UserPromptSubmit', { prompt: '<task-notification>\n<task-id>' + SENT + '</task-id>' }), null],
    [H('Notification', { message: SENT, notification_type: 'idle_prompt' }), 'idle'],
    [H('Notification', { message: SENT, notification_type: 'auth_success' }), null],
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
  const sa = classify(T.find(([h]) => h.hook_event_name === 'SubagentStart')[0]);
  ok(!leaky.length && sa.sub === 'explore' && !('label' in sa), 'hooks: sự kiện chỉ có kind + tên tool + "claude-code" (+ NHÓM trợ lý: explore / plan / review / test / general / other — không gửi tên thật) — không prompt / đường dẫn / lệnh / kết quả tool nào', leaky.join(' | '));
  // DẠNG JSON THẬT: phiên claude -p thật (Claude Code 2.1.310, API giả cục bộ) ghi ở tools/fixtures/live — chuỗi sự kiện phải đúng như app nhận được hôm ghi
  const REAL = fs.readFileSync(path.join(ROOT, 'tools/fixtures/live/claude-code-2.1.310.jsonl'), 'utf8').split('\n').filter(l => l && l[0] !== '#').map(l => JSON.parse(l));
  const got = REAL.map(h => classify(h)).filter(Boolean), seqK = got.map(e => e.kind + (e.sub ? '[' + e.sub + ']' : '')).join(' → ');
  const WANT = 'session_start → prompt → read → search → delegate_start[explore] → test_run → delegate_end → test_fail → edit → test_run → test_pass → wait_user → stop';
  const realLeak = got.map(e => JSON.stringify(e)).filter(x => /add|proj|home|calc|Find where|toolu|Explore/.test(x));
  ok(seqK === WANT && !realLeak.length, 'hooks với payload THẬT của Claude Code 2.1.310 (' + REAL.length + ' hook: SessionStart · UserPromptSubmit · Pre/PostToolUse · PostToolUseFailure · SubagentStart/Stop · Stop · SessionEnd; thông báo trợ lý nền bị bỏ): ' + seqK, seqK + ' | ' + realLeak.join(' '));
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
  ok(sent.length >= T.length - 6 && !leak.length && bodies.every(x => x.auth === 'Bearer ' + TOK && x.xr === '1') && sent.every(b => Object.keys(JSON.parse(b)).every(k => ['kind', 'tool', 'agent', 'at', 'sub'].includes(k))),
    'live-hook.mjs gửi ' + sent.length + ' sự kiện thật: chỉ { kind, tool, agent, at, sub? }, ≤ 200 byte, Bearer + X-GC-Request — không mảnh nội dung nào (prompt, đường dẫn, lệnh, kết quả)', leak.slice(0, 3).join(' | '));
  fake.close();
}

/* ------------------------------------------------------------------ 4. HTTP + SSE + MCP */
{
  const PORT = +(process.env.GC_LIVE_TEST_PORT || 7764), HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-live-')); tmp.push(HOME);
  const OWNER = 'owner-live-' + Math.random().toString(36).slice(2) + 'x'.repeat(20), BASE = 'http://127.0.0.1:' + PORT;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: HOME, GC_PORT: String(PORT), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: OWNER, GC_TEST: '1', GC_LIVE_PING_MS: '300', HOME: HOME }), stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(srv); let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 100)); }
  const J = { 'Content-Type': 'application/json', 'X-GC-Request': '1' };
  const post = (body, h) => fetch(BASE + '/api/live/event', { method: 'POST', headers: Object.assign({}, J, h), body: typeof body === 'string' ? body : JSON.stringify(body) });
  const own = { Authorization: 'Bearer ' + OWNER };
  const info = await (await fetch(BASE + '/api/live/info', { headers: own })).json(), LT = info.token;
  const st = fs.statSync(path.join(HOME, 'data', 'live-token'));
  const infoTxt = JSON.stringify(info), studioSrc = fs.readFileSync(path.join(ROOT, 'studio/live.js'), 'utf8');
  ok(/^gcl_[A-Za-z0-9_-]{32,}$/.test(LT) && (st.mode & 0o777) === 0o600 && info.command === 'genchibi live hook --install-into ~/.claude/settings.json' && !('settings' in info) && !/GC_LIVE|live-hook\.mjs|"hooks"/.test(infoTxt)
    && !/v\.settings|v\.command|r\.settings|r\.command/.test(studioSrc) && /var LIVE_CMD = 'genchibi live hook --install-into ~\/\.claude\/settings\.json';/.test(studioSrc),
    'token live: data/live-token 0600 · /api/live/info (chủ) chỉ trả token + LỆNH CLI — không một dòng lệnh hook nào do app soạn (container bản Docker không được quyết định lệnh chạy trên máy chủ); Studio hiện lệnh là hằng của chính nó', infoTxt.slice(0, 300));
  const sse = await fetch(BASE + '/api/live/stream', { headers: own }), rd = sse.body.getReader(), dec = new TextDecoder(); let got = '';
  let ownEnded = false; const pump = (async () => { for (;;) { const x = await rd.read().catch(() => ({ done: true })); if (x.done) { ownEnded = true; return; } got += dec.decode(x.value); } })();
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
  // live_task qua MCP (ghi: mcp:read không gọi được) + qua token live (POST kind task) · cùng việc = không phát lại
  {
    const call = async (args, hdr) => (await (await fetch(BASE + '/mcp', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdr || own), body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'live_task', arguments: args } }) })).json()).result;
    const a1 = JSON.parse((await call({ task: 'research', title: 'Look into ~/.ssh/id_rsa options' })).content[0].text), a2 = JSON.parse((await call({ task: 'research', title: 'Look into ~/.ssh/id_rsa options' })).content[0].text), a3 = await call({ task: 'nope' });
    const pt = await post({ kind: 'task', task: 'code', title: 'Write the parser' }, { Authorization: 'Bearer ' + LT });
    const { MCP, scopeCtx } = require(path.join(ROOT, 'server/mcp.js')), { Store } = require(path.join(ROOT, 'server/store.js'));
    const MH = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-live-mcp-')); tmp.push(MH);
    const ro = await new MCP({ engine: GC, store: new Store(MH), version: 't', live: { accept: () => ({ ev: { id: 1, task: 'code', title: '' } }) } }).handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'live_task', arguments: { task: 'code' } } }, scopeCtx('mcp:read'));
    ok(a1.ok && a1.task === 'research' && !/ssh|id_rsa|~/.test(a1.title) && a2.same === true && a3.isError && pt.status === 202 && ro.result && ro.result.isError && /FORBIDDEN/.test(ro.result.content[0].text),
      'live_task: MCP (tiêu đề làm sạch "' + a1.title + '") · gửi lại cùng việc → same, không phát · task lạ → lỗi · token live gửi được kind task · kết nối mcp:read → FORBIDDEN', JSON.stringify([a1, a2, ro.result && ro.result.content[0].text.slice(0, 80)]));
  }
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
  ok(rot.token !== LT && oldS === 401 && newS === 202 && fs.readFileSync(path.join(HOME, 'data', 'live-token'), 'utf8').trim() === rot.token, 'đổi token live: token cũ 401, token mới dùng được, tệp ghi token mới');
  // phát lại phiên mẫu qua đúng đường HTTP (như hooks)
  await new Promise(r => setTimeout(r, 6500));   // bình token của kênh hook hồi đầy (60 / 10 mỗi giây)
  // trần tần suất RIÊNG theo token: token bị lộ dùng cạn bình → đổi token, token mới có bình mới ngay (không bị token cũ làm nghẹt)
  await Promise.all(Array.from({ length: 90 }, () => post({ kind: 'read' }, { Authorization: 'Bearer ' + rot.token })));
  const rot2 = await (await fetch(BASE + '/api/live/token', { method: 'POST', headers: Object.assign({}, J, own) })).json();
  const fresh = await Promise.all(Array.from({ length: 30 }, () => post({ kind: 'read' }, { Authorization: 'Bearer ' + rot2.token })));
  ok(fresh.every(r => r.status === 202), 'trần tần suất riêng theo token live: token cũ dùng cạn bình (90 lần dồn dập) → đổi token → 30 sự kiện của token mới đều 202', fresh.map(r => r.status).join(','));
  // SSE đóng khi mất quyền: phiên Studio đăng xuất → luồng của phiên đó đóng trong ≤ 1 nhịp; luồng của token chủ vẫn mở
  {
    const PW = 'mat khau live ' + Math.random().toString(36).slice(2);
    await fetch(BASE + '/api/auth/password', { method: 'POST', headers: Object.assign({}, J, own), body: JSON.stringify({ password: PW }) });
    await fetch(BASE + '/api/setup/skip', { method: 'POST', headers: Object.assign({}, J, own), body: JSON.stringify({ reason: 'test-live' }) });
    const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ username: 'owner', password: PW }) });
    const cookie = lr.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const s2 = await fetch(BASE + '/api/live/stream', { headers: { cookie } }), r2 = s2.body.getReader(); let ended = false;
    const p2 = (async () => { for (;;) { const x = await r2.read().catch(() => ({ done: true })); if (x.done) { ended = true; return; } } })();
    await new Promise(r => setTimeout(r, 700)); const before = ended;
    const lo = await fetch(BASE + '/api/auth/logout', { method: 'POST', headers: Object.assign({ cookie }, J) });
    for (let k = 0; k < 30 && !ended; k++) await new Promise(r => setTimeout(r, 100));
    ok(lr.status === 200 && s2.status === 200 && !before && lo.ok && ended && !ownEnded, 'SSE đóng khi mất quyền: phiên Studio đăng xuất → luồng của phiên đó đóng ở nhịp kế (≤ 1 s) · luồng của token chủ vẫn mở', 'login ' + lr.status + ' stream ' + s2.status + ' logout ' + lo.status + ' ended ' + ended + ' own ' + ownEnded);
    try { await r2.cancel(); } catch (e) { /* đã đóng */ } await p2;
  }
  const rp = spawnSync(process.execPath, [path.join(ROOT, 'tools/live-replay.mjs'), '--speed', '25', '--url', BASE], { env: Object.assign({}, process.env, { GC_LIVE_TOKEN: rot2.token, HOME }), encoding: 'utf8', timeout: 30000 });
  const nDemo = L.parseJSONL(fs.readFileSync(path.join(ROOT, 'kinds/live/demo-session.jsonl'), 'utf8')).length;
  ok(rp.status === 0 && new RegExp('replayed ' + nDemo + '/' + nDemo).test(rp.stdout) && nDemo >= 40, 'tools/live-replay.mjs: phát lại ' + nDemo + ' sự kiện của phiên mẫu (prompt → đọc / tìm → sửa → test đỏ ×4 → giao việc → test xanh → phát hành → chờ) ×25 qua HTTP', rp.stdout + rp.stderr);
  // phiên mẫu đi hết các khu trên sân khấu
  const DD = L.director(), DL = L.parseJSONL(fs.readFileSync(path.join(ROOT, 'kinds/live/demo-session.jsonl'), 'utf8')); let di = 0; for (let t = 0; t < 140; t += 0.1) { while (di < DL.length && DL[di].at <= t) { DD.push(DL[di].ev, t); di++; } DD.advance(t); }
  const zones = new Set(DD.steps.filter(s => s.type === 'walk').map(s => s.zone)), props = new Set(DD.steps.filter(s => s.type === 'takeOut').map(s => s.propOut));
  ok(['shelf', 'desk', 'lab', 'door', 'rocket', 'coffee', 'sofa'].every(z => zones.has(z)) && props.size >= 6 && !checkSteps(DD).length, 'phiên mẫu: đi qua ' + zones.size + ' khu (' + [...zones].join(', ') + ') · lấy ' + props.size + ' loại đồ (' + [...props].join(', ') + ')');
  try { await rd.cancel(); } catch (e) { /* bỏ */ } await pump;
  srv.kill(); await new Promise(r => srv.once('exit', r));
}

/* ------------------------------------------------------------------ 4b. LiveHub (v0.24.1): bình theo token sau khởi động lại · việc hiện hành theo kênh · alive() lúc phát · token agent */
{
  const { LiveHub } = require(path.join(ROOT, 'server/live.js'));
  const HD = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-live-hub-')); tmp.push(HD);
  let T = 1e6; const now = () => T;
  const h1 = new LiveHub({ dir: HD, engine: GC, now }), k1 = h1.tokKey; clearInterval(h1.beat);
  const h2 = new LiveHub({ dir: HD, engine: GC, now }); clearInterval(h2.beat);   // "khởi động lại": token đọc từ tệp
  const req = t => ({ headers: { authorization: 'Bearer ' + t } });
  ok(typeof k1 === 'string' && /^live:[a-f0-9]{12}$/.test(k1) && h2.tok === h1.tok && h2.tokKey === k1 && h2.tokenWho(req(h2.tok)) === 'live',
    'loadToken đặt tokKey: hub dựng lại từ data/live-token có cùng bình tần suất theo token ngay sau khởi động lại (không rơi về kênh chung)', k1 + ' / ' + h2.tokKey);
  // bình theo token sau khởi động lại: 60 sự kiện cạn bình của token live, kênh chủ vẫn qua
  let n429 = 0; for (let i = 0; i < 70; i++) if (h2.accept({ kind: 'read' }, 'live').code === 429) n429++;
  ok(n429 >= 9 && !h2.accept({ kind: 'read' }, 'owner').error, 'sau khởi động lại: token live cạn bình riêng (' + n429 + ' lần 429), kênh chủ không bị nghẹt');
  // việc hiện hành THEO KÊNH + quên khi phiên mới / kết thúc + đổi tiêu đề → retitle
  const H = new LiveHub({ dir: HD, engine: GC, now }); clearInterval(H.beat);
  const A = H.createAgent('box one'), B = H.createAgent('box two'), wa = 'agent:' + A.id, wb = 'agent:' + B.id;
  const t1 = H.accept({ kind: 'task', task: 'code', title: 'Parser' }, wa), t2 = H.accept({ kind: 'task', task: 'code', title: 'Parser' }, wb);
  const t3 = H.accept({ kind: 'task', task: 'code', title: 'Parser' }, wa), t4 = H.accept({ kind: 'task', task: 'code', title: 'Lexer' }, wa);
  H.accept({ kind: 'session_start' }, wa); const t5 = H.accept({ kind: 'task', task: 'code', title: 'Lexer' }, wa);
  H.accept({ kind: 'stop' }, wa); const t6 = H.accept({ kind: 'task', task: 'code', title: 'Lexer' }, wa);
  ok(t1.ev && t2.ev && t3.same && t4.ev && t4.ev.retitle === true && !t1.ev.retitle && t5.ev && !t5.ev.retitle && t6.ev && t1.ev.via === 'agent',
    'việc hiện hành theo kênh: agent B cùng việc với A vẫn phát · A gửi lại cùng việc + cùng tiêu đề → same · đổi tiêu đề → phát kèm retitle · session_start / stop → quên việc', JSON.stringify([t3, t4.ev && t4.ev.retitle, t5.ev && t5.ev.retitle]));
  // alive() kiểm NGAY lúc phát (không đợi nhịp ping)
  const out = []; let live1 = true, ended = 0;
  const fakeRes = () => ({ writeHead() {}, write(s) { out.push(s); }, end() { ended++; }, on() {} });
  H.stream({ on() {}, headers: {} }, fakeRes(), H.seq, () => live1);
  H.accept({ kind: 'read', label: 'first' }, 'owner'); const nBefore = out.filter(s => s.includes('event: live')).length;
  live1 = false; H.accept({ kind: 'read', label: 'second secret' }, 'owner');
  ok(nBefore === 1 && !out.some(s => /second/.test(s)) && ended === 1 && H.clients.size === 0, 'accept() kiểm alive() trước khi phát: người xem mất quyền KHÔNG nhận sự kiện kế, luồng đóng ngay', JSON.stringify({ nBefore, ended, n: H.clients.size }));
  // token agent: chỉ lưu băm · liệt kê · thu hồi → 401 · mỗi token một bình
  const raw = fs.readFileSync(path.join(HD, 'live-agents.json'), 'utf8'), st = fs.statSync(path.join(HD, 'live-agents.json'));
  for (let i = 0; i < 70; i++) H.accept({ kind: 'read' }, wa);
  const bOk = !H.accept({ kind: 'read' }, wb).error;
  const rv = H.revokeAgent(A.id), rv2 = H.revokeAgent(A.id), la = H.listAgents();
  const H2 = new LiveHub({ dir: HD, engine: GC, now }); clearInterval(H2.beat);
  ok(/^gcl_[A-Za-z0-9_-]{43}$/.test(A.token) && !raw.includes(A.token) && !raw.includes(B.token) && (st.mode & 0o777) === 0o600 && bOk && rv && !rv2
    && H.tokenWho(req(A.token)) === null && H.tokenWho(req(B.token)) === wb && la.find(x => x.id === A.id).revoked && !('hash' in la[0])
    && H2.tokenWho(req(A.token)) === null && H2.tokenWho(req(B.token)) === wb,
    'token agent: live-agents.json 0600 chỉ lưu băm SHA-256 · mỗi token một bình (A cạn, B vẫn qua) · thu hồi → không còn nhận (kể cả sau khởi động lại) · danh sách không lộ băm');
}

{
  // trần 50 token agent đang dùng: đầy → từ chối (null), KHÔNG đuổi token cũ; thu hồi một cái thì cấp lại được
  const { LiveHub, AGENTS_MAX } = require(path.join(ROOT, 'server/live.js'));
  const HD = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-live-cap-')); tmp.push(HD);
  const H = new LiveHub({ dir: HD, engine: GC }); clearInterval(H.beat);
  const toks = Array.from({ length: AGENTS_MAX }, (_, i) => H.createAgent('a' + i)), over = H.createAgent('extra');
  const req = t => ({ headers: { authorization: 'Bearer ' + t } }), allOk = toks.every(a => a && H.tokenWho(req(a.token)) === 'agent:' + a.id);
  H.revokeAgent(toks[0].id); const again = H.createAgent('after revoke');
  ok(AGENTS_MAX === 50 && allOk && over === null && again && toks.slice(1).every(a => H.tokenWho(req(a.token))), 'trần ' + AGENTS_MAX + ' token agent: đầy → từ chối (không đuổi token của agent khác) · thu hồi một cái → cấp được');
}

/* ------------------------------------------------------------------ 4c. live_setup (v0.24.1, INT-21 g "Đề nghị, có hỏi chủ") */
{
  const LS = require(path.join(ROOT, 'server/live-setup.js')), Rules = require(path.join(ROOT, 'server/rules.js')), Agent = require(path.join(ROOT, 'server/agent.js'));
  const { MCP, TOOLS, scopeCtx } = require(path.join(ROOT, 'server/mcp.js')), { Store } = require(path.join(ROOT, 'server/store.js'));
  const TK = 'gcl_' + 'A'.repeat(43), base = { version: '1.2.3', port: 7600, token: TK };
  const PFX = 'https://github.com/colamacbook-ryan/Gen-Chibi/releases/download/v1.2.3/', PFX_RULE = 'https://github.com/colamacbook-ryan/Gen-Chibi/releases/download/v<version>/';
  const p = LS.plan(Object.assign({ publicUrl: 'https://chibi.example.com' }, base));
  const cmd = p.command || '';
  const iSha = cmd.indexOf('[ "$W" = "$G" ]'), iTar = cmd.indexOf('tar -xzf'), iCp = cmd.indexOf('cp "$T'), iTok = cmd.indexOf('live-token'), iInst = cmd.indexOf('--install-claude');
  ok(p.ok && p.install && p.url === 'https://chibi.example.com' && cmd.includes("'" + PFX + "gen-chibi-v1.2.3.tar.gz'") && cmd.includes("'" + PFX + "SHA256SUMS'")
    && iSha > 0 && iSha < iTar && iTar < iCp && iCp < iTok && iTok < iInst && !/\|\s*(ba)?sh\b/.test(cmd) && !/chibi\.example\.com\/[^'"]*\.(m?js|sh)/.test(cmd),
    'live_setup: lệnh tải live-hook.mjs từ release GitHub ĐÚNG phiên bản, kiểm SHA-256 theo SHA256SUMS TRƯỚC khi giải nén / ghi · không curl | sh, không tải mã từ app');
  // nguồn GHIM: mọi URL trong lệnh bắt đầu bằng đúng tiền tố cố định (GC_REPO / tham số repo không đổi được) · curl chỉ https (cả khi chuyển hướng)
  const urls = cmd.match(/https?:\/\/[^'" ;]+/g) || [], evilRepo = LS.plan(Object.assign({ publicUrl: 'https://a.example', repo: 'evil/gen-chibi' }, base));
  const mainSrc = fs.readFileSync(path.join(ROOT, 'server/main.js'), 'utf8'), lsFn = (mainSrc.match(/function liveSetup\([\s\S]*?\n}\n/) || [''])[0];
  ok(urls.filter(u => u !== p.url).length === 2 && urls.filter(u => u !== p.url).every(u => u.startsWith(PFX)) && evilRepo.command.includes(PFX) && !/evil/.test(evilRepo.command)
    && lsFn && !/REPO|GC_REPO/.test(lsFn) && LS.prefixOf('1.2.3') === PFX && new RegExp("GC_REPO \\|\\| '" + LS.REPO + "'").test(mainSrc)
    && (cmd.match(/curl -fsSL --proto '=https' --proto-redir '=https' /g) || []).length === 2 && p.source === PFX && p.verify.includes(PFX) && /refuse and tell your user/.test(p.verify),
    'nguồn ghim: mọi URL tải đều bắt đầu bằng ' + PFX + ' (hằng trong mã, GC_REPO không đổi được; cùng chữ hoa Gen-Chibi với bộ cập nhật) · curl --proto =https --proto-redir =https · kế hoạch dặn "URL khác → từ chối, báo người dùng"', urls.join(' '));
  // token chỉ xuất hiện đúng 1 lần, trong printf (builtin của shell) ghi vào live-token — không bao giờ là đối số của tiến trình (curl / node / hook)
  const tokAt = cmd.split(TK).length - 1, tokCtx = cmd.slice(cmd.indexOf(TK) - 30, cmd.indexOf(TK) + TK.length + 30);
  ok(tokAt === 1 && /printf '%s\\n' 'gcl_A+' > "\$D\/live-token"/.test(tokCtx) && /umask 077/.test(cmd) && cmd.indexOf('chmod 600 "$D/live-token" "$D/live-url"') > cmd.indexOf('> "$D/live-url"') && !/node[^;]*gcl_/.test(cmd) && !/curl[^;]*gcl_/.test(cmd),
    'token: một lần duy nhất, qua printf (builtin) vào $D/live-token với umask 077 — không nằm trong argv của curl / node', tokCtx);
  ok(['ok', 'install', 'url', 'version', 'ask', 'installs', 'changes', 'command', 'undo', 'requirement', 'sends'].every(k => k in p) && p.ask === Rules.LIVE.ask && /ASK YOUR USER/.test(p.ask) && /--uninstall-claude/.test(p.undo),
    'live_setup trả kế hoạch đủ: cài gì / ở đâu · ĐỔI gì · MỘT lệnh · cách gỡ · gửi tới đâu · câu "ASK YOUR USER"');
  // các đường từ chối
  const nr = LS.plan(Object.assign({ publicUrl: '', local: false }, base)), loc = LS.plan(Object.assign({ publicUrl: '', local: true }, base));
  const win = LS.plan(Object.assign({ publicUrl: 'https://a.example', os: 'windows' }, base)), oth = LS.plan(Object.assign({ publicUrl: 'https://a.example', agent: 'other' }, base));
  const bos = LS.plan(Object.assign({ os: 'beos' }, base)), badUrl = LS.plan(Object.assign({ publicUrl: 'https://a.example/x\'; rm -rf ~; \'' }, base));
  const badTok = LS.plan(Object.assign({}, base, { publicUrl: 'https://a.example', token: "gcl_x'; touch /tmp/pwn; '" })), badVer = LS.plan(Object.assign({}, base, { publicUrl: 'https://a.example', version: '1.2.3; id' }));
  const badRel = LS.plan(Object.assign({}, base, { publicUrl: 'https://a.example', releaseBase: 'https://evil.example/x' })), ghRel = LS.plan(Object.assign({}, base, { publicUrl: 'https://a.example', releaseBase: 'https://github.com/evil/gen-chibi/releases/download' }));
  ok(!nr.ok && nr.reason === 'NOT_REACHABLE' && /genchibi online/.test(nr.why) && loc.ok && loc.url === 'http://127.0.0.1:7600' && /same machine/.test(loc.requirement)
    && !win.ok && win.reason === 'UNSUPPORTED_OS' && /WSL/.test(win.why) && oth.ok && oth.install === false && !JSON.stringify(oth).includes('gcl_') && !bos.ok && bos.reason === 'BAD_OS'
    && !badUrl.ok && !badTok.ok && !badVer.ok && !badRel.ok && !ghRel.ok,
    'từ chối có lý do: chỉ localhost + agent khác máy → NOT_REACHABLE (nêu điều kiện) · cùng máy → http://127.0.0.1 · windows → WSL · agent khác → không cài, không token · URL / token / phiên bản / nguồn release sai dạng → không sinh lệnh');
  // MCP: mcp:read FORBIDDEN · lỗi có mã · start_here mời (chỉ khi được ghi) · luật 13 trên mọi bề mặt
  const MH = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-live-setup-')); tmp.push(MH);
  let calls = 0; const stub = (a, ctx) => { calls++; return LS.plan(Object.assign({ publicUrl: '', local: !!ctx.local, os: a.os, agent: a.agent }, base)); };
  const M = new MCP({ engine: GC, store: new Store(MH), version: 't', live: { accept: () => ({ ev: { id: 1 } }) }, liveSetup: stub });
  const call = (args, ctx) => M.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'live_setup', arguments: args } }, ctx);
  const ro = await call({}, scopeCtx('mcp:read')), far = await call({}, {}), near = await call({}, { local: true });
  const n0 = calls, lk = await call({}, { viaLink: true, local: true }), dock = await call({}, { channel: 'ui', local: true });
  const n1 = calls, wr = await call({}, Object.assign(scopeCtx('mcp:write'), { local: true })), ow = await call({}, Object.assign(scopeCtx('mcp:owner'), { local: true }));
  ok([lk, dock].every(x => x.result.isError && /FORBIDDEN/.test(x.result.content[0].text)) && n1 === n0 && !wr.result.isError && JSON.parse(wr.result.content[0].text).command && !ow.result.isError && calls === n1 + 2,
    'live_setup: chủ máy + agent chủ đã duyệt (OAuth mcp:write / mcp:owner) gọi được · link có khoá · AI trong dock Studio → FORBIDDEN, không cấp token', [lk, dock, wr].map(x => x.result.content[0].text.slice(0, 60)).join(' | '));
  const M2 = new MCP({ engine: GC, store: new Store(MH), version: 't', live: { accept: () => ({ ev: { id: 1 } }) }, liveSetup: () => ({ ok: false, reason: 'CONFLICT', why: 'there are already 50 active agent live tokens — revoke one' }) });
  const cf = await M2.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'live_setup', arguments: {} } }, { local: true });
  ok(cf.result.isError && /\[CONFLICT\]/.test(cf.result.content[0].text), 'live_setup: hết chỗ token → [CONFLICT]', cf.result.content[0].text.slice(0, 100));
  const sh = JSON.parse((await M.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'start_here', arguments: {} } }, {})).result.content[0].text);
  const shRo = JSON.parse((await M.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'start_here', arguments: {} } }, scopeCtx('mcp:read'))).result.content[0].text);
  ok(ro.result.isError && /FORBIDDEN/.test(ro.result.content[0].text) && n0 === 2 && far.result.isError && /UNAVAILABLE/.test(far.result.content[0].text) && !near.result.isError && JSON.parse(near.result.content[0].text).command
    && TOOLS.some(t => t.name === 'live_setup' && t.annotations.readOnlyHint === false),
    'MCP live_setup: kết nối mcp:read → FORBIDDEN (không chạm tới kế hoạch) · khác máy không public → [UNAVAILABLE] · cùng máy → kế hoạch có lệnh', ro.result.content[0].text.slice(0, 120));
  const R13 = /Live stage: invite, never install silently/;
  const skill = Agent.wrapper('claude').find(f => f.path === 'gen-chibi/SKILL.md').content;
  ok(sh.live === Rules.START.live && /ASK YOUR USER/.test(sh.live) && !shRo.live && R13.test(Rules.mcp({}, TOOLS)) && R13.test(JSON.stringify(sh)) && R13.test(skill) && Agent.rules().some(r => R13.test(r) && /live_setup/.test(r) && /ask/i.test(r))
    && [Rules.mcp({}, TOOLS), JSON.stringify(sh), skill, Rules.LIVE.ask].every(x => x.includes(PFX_RULE)) && Agent.rules().some(r => R13.test(r) && r.includes(PFX_RULE) && /refuse and tell your user/.test(r)),
    'luật 13 (mời, hỏi chủ, không cài lén, GHIM tiền tố ' + PFX_RULE + ' — URL khác thì từ chối) có ở initialize · start_here · skill — sinh từ agent/GUIDE.md §3 · start_here mời Live (kết nối chỉ đọc thì không)');
}

/* ------------------------------------------------------------------ 4d. live_setup đầu-cuối: release giả (đúng gói của tools/package.sh) → chạy đúng lệnh trong HOME riêng → hook gửi bằng token agent → thu hồi */
{
  const PORT = +(process.env.GC_LIVE_TEST_PORT || 7764) + 2, B = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-live-e2e-')); tmp.push(B);
  const V = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(), DIST = path.join(B, 'dist'), BAD = path.join(B, 'bad');
  const pk = spawnSync('bash', [path.join(ROOT, 'tools/package.sh'), DIST], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: B } });
  // bản bị tráo: cùng SHA256SUMS thật, tarball khác (live-hook.mjs bị sửa)
  fs.mkdirSync(BAD); fs.copyFileSync(path.join(DIST, 'SHA256SUMS'), path.join(BAD, 'SHA256SUMS'));
  const EV = path.join(B, 'evil'); fs.mkdirSync(path.join(EV, 'gen-chibi-v' + V, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(EV, 'gen-chibi-v' + V, 'tools', 'live-hook.mjs'), 'console.log("evil")\n');
  spawnSync('tar', ['-C', EV, '-czf', path.join(BAD, 'gen-chibi-v' + V + '.tar.gz'), 'gen-chibi-v' + V]);
  const rel = http.createServer((q, s) => {
    const m = /^\/(rel|bad)\/v([0-9.]+)\/([A-Za-z0-9._-]+)$/.exec(q.url); const f = m && m[2] === V ? path.join(m[1] === 'rel' ? DIST : BAD, m[3]) : '';
    if (!f || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200); s.end(fs.readFileSync(f));
  });
  await new Promise(r => rel.listen(0, '127.0.0.1', r)); const RP = rel.address().port;
  const SH = path.join(B, 'srv'), OWNER = 'owner-e2e-' + Math.random().toString(36).slice(2) + 'y'.repeat(20), BASE = 'http://127.0.0.1:' + PORT;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: SH, GC_PORT: String(PORT), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: OWNER, GC_TEST: '1', GC_TEST_RELEASE_BASE: 'http://127.0.0.1:' + RP + '/rel', HOME: SH }), stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(srv); let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 100)); }
  const own = { Authorization: 'Bearer ' + OWNER }, J = { 'Content-Type': 'application/json', 'X-GC-Request': '1' };
  const mcpCall = async (args, extra) => (await (await fetch(BASE + '/mcp', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, own, extra || {}), body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'live_setup', arguments: args } }) })).json()).result;
  const agents = async () => (await (await fetch(BASE + '/api/live/agents', { headers: own })).json()).agents;
  // khác máy (qua proxy), app chưa online → từ chối, KHÔNG cấp token
  const far = await mcpCall({ name: 'far box' }, { 'X-Forwarded-For': '203.0.113.9' }), nAg0 = (await agents()).length;
  ok(far.isError && /UNAVAILABLE/.test(far.content[0].text) && /online/.test(far.content[0].text) && nAg0 === 0, 'HTTP: agent khác máy + app chỉ localhost → [UNAVAILABLE] nêu điều kiện, không cấp token', far.content[0].text.slice(0, 160));
  const r = await mcpCall({ name: 'ryan laptop', os: 'linux', agent: 'claude-code' }), P = r.isError ? {} : JSON.parse(r.content[0].text);
  const UH = path.join(B, 'home'), D = path.join(UH, '.local/lib/gen-chibi-live'), SET = path.join(UH, '.claude/settings.json');
  fs.mkdirSync(path.join(UH, '.claude'), { recursive: true }); fs.mkdirSync(D, { recursive: true }); fs.writeFileSync(path.join(D, 'live-token'), 'old\n', { mode: 0o644 }); fs.chmodSync(path.join(D, 'live-token'), 0o644); fs.writeFileSync(SET, JSON.stringify({ model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }));
  // bất đồng bộ: release giả chạy CÙNG tiến trình test (spawnSync sẽ chặn nó → treo)
  const sh = (c, home) => new Promise(res => { const k = spawn('bash', ['-c', c], { env: { PATH: process.env.PATH, HOME: home, LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] }); kids.push(k); let o = '', e = ''; k.stdout.on('data', d => o += d); k.stderr.on('data', d => e += d);
    const t = setTimeout(() => k.kill(), 60000); k.on('exit', st => { clearTimeout(t); res({ status: st, stdout: o, stderr: e }); }); });
  // bản bị tráo (SHA không khớp) → không cài gì
  const BH = path.join(B, 'home-bad'); fs.mkdirSync(BH);
  const bad = P.command ? await sh(P.command.replace('/rel/v', '/bad/v'), BH) : { status: -1 };
  ok(pk.status === 0 && P.command && bad.status !== 0 && /SHA-256 does not match/.test(bad.stderr) && !fs.existsSync(path.join(BH, '.local')) && !fs.existsSync(path.join(BH, '.claude')),
    'tarball bị tráo (SHA-256 không khớp SHA256SUMS) → lệnh dừng, KHÔNG ghi tệp nào, không đổi settings', (bad.stderr || '') + pk.stderr);
  const run = P.command ? await sh(P.command, UH) : { status: -1, stderr: 'no command: ' + JSON.stringify(r).slice(0, 300) };
  const S = fs.existsSync(SET) ? JSON.parse(fs.readFileSync(SET, 'utf8')) : {}, cmds = Object.values(S.hooks || {}).flat().flatMap(g => g.hooks.map(h => h.command));
  const liveCmds = cmds.filter(c => /gen-chibi-live\/live-hook\.mjs/.test(c)), tokF = path.join(D, 'live-token');
  const same = fs.existsSync(path.join(D, 'live-hook.mjs')) && fs.readFileSync(path.join(D, 'live-hook.mjs'), 'utf8') === fs.readFileSync(path.join(ROOT, 'tools/live-hook.mjs'), 'utf8');
  ok(run.status === 0 && same && (fs.statSync(D).mode & 0o777) === 0o700 && (fs.statSync(tokF).mode & 0o777) === 0o600 && (fs.statSync(path.join(D, 'live-url')).mode & 0o777) === 0o600
    && fs.readFileSync(path.join(D, 'live-url'), 'utf8').trim() === BASE && P.url === BASE && liveCmds.length >= 5 && cmds.includes('echo mine') && S.model === 'x' && !cmds.some(c => c.includes('gcl_'))
    && fs.readdirSync(path.join(UH, '.claude')).some(f => /^settings\.json\.bak-/.test(f)),
    'chạy đúng MỘT lệnh: live-hook.mjs = bản của release (SHA đã kiểm) · thư mục 0700, token / url 0600 · settings.json ghép (giữ model + hook cũ, có bản sao lưu) · lệnh hook không chứa token', (run.stderr || '').slice(0, 400));
  ok(/--proto '=http' --proto-redir '=http'/.test(P.command || ''), 'base thử (GC_TEST) dùng http — curl vẫn khoá giao thức (--proto =http)');
  // nhẹ tay: 5 lần / phút cho mỗi kết nối (lần thứ 6 → UNAVAILABLE, không cấp token)
  const nBefore = (await agents()).length, extra = [];
  for (let i = 0; i < 5; i++) extra.push(await mcpCall({ name: 'spam ' + i, agent: 'other' }));
  const nAfter = (await agents()).length;
  ok(extra.slice(0, 4).every(x => !x.isError) && extra[4].isError && /UNAVAILABLE/.test(extra[4].content[0].text) && /too often/.test(extra[4].content[0].text) && nAfter === nBefore,
    'live_setup: tối đa 5 lần / phút mỗi kết nối — lần thứ 6 → [UNAVAILABLE] "too often"', extra.map(x => x.isError ? x.content[0].text.slice(0, 60) : 'ok').join(' | '));
  // hook (đúng lệnh trong settings) gửi bằng token agent → Studio thấy "lần cuối"
  const fire = () => new Promise(res => { const c = spawn('bash', ['-c', liveCmds[0] || 'true'], { env: { PATH: process.env.PATH, HOME: UH }, stdio: ['pipe', 'ignore', 'ignore'] }); kids.push(c); c.on('exit', res); c.stdin.end(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/x' } })); });
  await fire(); const a1 = (await agents()).find(a => a.name === 'ryan laptop');
  const TOK = fs.existsSync(tokF) ? fs.readFileSync(tokF, 'utf8').trim() : '';
  const tokOnlyEvent = await Promise.all([fetch(BASE + '/api/info', { headers: { Authorization: 'Bearer ' + TOK } }), fetch(BASE + '/api/live/agents', { headers: { Authorization: 'Bearer ' + TOK } })]);
  ok(a1 && a1.last && !a1.revoked && P.tokenId === a1.id && tokOnlyEvent.every(x => x.status === 401), 'hook gửi bằng token RIÊNG của agent → Studio › Live liệt kê (tên, tạo lúc, lần cuối) · token agent không mở /api/info hay danh sách token', JSON.stringify(a1));
  // thu hồi (Studio) → hook không gửi được nữa
  const rv = await fetch(BASE + '/api/live/agents/' + (a1 ? a1.id : 'x') + '/revoke', { method: 'POST', headers: Object.assign({}, J, own) });
  const after = await fetch(BASE + '/api/live/event', { method: 'POST', headers: Object.assign({}, J, { Authorization: 'Bearer ' + TOK }), body: '{"kind":"read"}' });
  const lastBefore = (await agents()).find(a => a.id === (a1 && a1.id)); await fire(); const lastAfter = (await agents()).find(a => a.id === (a1 && a1.id));
  const rvBad = await fetch(BASE + '/api/live/agents/' + (a1 ? a1.id : 'x') + '/revoke', { method: 'POST', headers: Object.assign({}, J, own) });
  ok(rv.status === 200 && after.status === 401 && lastAfter.revoked && lastAfter.last === lastBefore.last && rvBad.status === 404, 'thu hồi token agent → POST bằng token đó 401, hook không còn ghi được "lần cuối" · thu hồi lần hai 404', rv.status + ' ' + after.status + ' ' + rvBad.status);
  // gỡ theo hướng dẫn undo
  const un = await sh(P.undo.split('   (')[0], UH), S2 = JSON.parse(fs.readFileSync(SET, 'utf8')), c2 = Object.values(S2.hooks || {}).flat().flatMap(g => g.hooks.map(h => h.command));
  ok(un.status === 0 && !fs.existsSync(D) && !c2.some(c => /live-hook/.test(c)) && c2.includes('echo mine') && S2.model === 'x', 'undo: gỡ đúng hook Live (hook cũ + model còn nguyên) và xoá thư mục gen-chibi-live', un.stderr);
  ok(TOK.length > 40 && !log.includes(TOK) && !log.includes('gcl_'), 'log server không chứa token agent');
  srv.kill(); await new Promise(r => srv.once('exit', r)); rel.close();
}

/* ------------------------------------------------------------------ 5. genchibi live hook (CLI thật, bản cài native giả, HOME riêng) */
{
  const B = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-live-cli-')); tmp.push(B);
  const CH = path.join(B, 'install'), UH = path.join(B, 'home'), TD = path.join(UH, '.local/lib/gen-chibi');
  fs.mkdirSync(path.join(CH, 'data'), { recursive: true }); fs.mkdirSync(TD, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(TD, 'installs'), 'native ' + fs.realpathSync(CH) + '\n', { mode: 0o600 });
  const OWN = 'ownerSECRETtoken' + 'q'.repeat(30), MK = 'masterKEYsecret' + 'm'.repeat(30), GH = 'ghp_SECRETgithub' + 'g'.repeat(24);
  fs.writeFileSync(path.join(CH, '.env'), 'GC_MODE=native\nGC_PORT=7765\nGC_API_TOKEN=' + OWN + '\nGC_MASTER_KEY=' + MK + '\nGC_GITHUB_TOKEN=' + GH + '\n');
  fs.writeFileSync(path.join(CH, 'data/owner-token'), OWN + '\n');
  fs.symlinkSync(ROOT, path.join(CH, 'current'));
  const LT = 'gcl_' + 'T'.repeat(40);
  const cli = (args, opt) => { const r = spawnSync('bash', [path.join(ROOT, 'cli/genchibi')].concat(args), { cwd: (opt && opt.cwd) || UH, encoding: 'utf8', env: { PATH: process.env.PATH, GC_HOME: CH, GC_CLI_INNER: '1', HOME: UH, LANG: 'C.UTF-8' }, timeout: 30000 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' }; };
  const noTok = cli(['live', 'hook', '--json']);
  fs.writeFileSync(path.join(CH, 'data/live-token'), 'gcl_bad"token;rm -rf\n'); const badTok = cli(['live', 'hook', '--json']);
  fs.writeFileSync(path.join(CH, 'data/live-token'), LT + '\n');
  const j = cli(['live', 'hook', '--json']), pr = cli(['live', 'hook']), usage = cli(['live', 'nope']);
  let snip = null; try { snip = JSON.parse(j.stdout); } catch (e) { /* hỏng */ }
  const hookFile = path.join(TD, 'live-hook.mjs'), st = fs.existsSync(hookFile) ? fs.statSync(hookFile) : null;
  const cmds = snip ? Object.values(snip.hooks).flatMap(g => g.flatMap(x => x.hooks.map(h => h.command))) : [];
  const allOut = j.out + pr.out;
  ok(noTok.code !== 0 && badTok.code !== 0 && /live-token/.test(noTok.out) && usage.code === 2, 'genchibi live hook: chưa có token live / token sai dạng (ký tự lạ) → từ chối, chỉ chỗ lấy · lệnh con lạ → 2', noTok.out.slice(0, 200) + ' | ' + badTok.out.slice(0, 200));
  ok(snip && JSON.stringify(Object.keys(snip.hooks)) === JSON.stringify(L.HOOK_EVENTS) && cmds.length === L.HOOK_EVENTS.length && cmds.every(c => !c.includes('gcl_') && (c.includes(fs.realpathSync(TD) + '/live-hook.mjs') || c.includes(TD + '/live-hook.mjs'))) && cmds.every(c => /^GC_LIVE_URL='http:\/\/127\.0\.0\.1:7765' '\/[^']+\/node' '[^']+live-hook\.mjs'$/.test(c)),
    'genchibi live hook --json: ' + L.HOOK_EVENTS.length + ' hook đúng danh sách của engine · lệnh = URL app + node tuyệt đối + bản hook chép ở ~/.local/lib/gen-chibi — KHÔNG có token (không lộ qua /proc/*/cmdline)', j.out.slice(0, 400));
  const tokFile = path.join(TD, 'live-token'), tst = fs.existsSync(tokFile) ? fs.statSync(tokFile) : null;
  ok(![OWN, MK, GH, 'ownerSECRET', 'masterKEY', 'SECRETgithub', LT].some(x => allOut.includes(x)) && tst && (tst.mode & 0o777) === 0o600 && fs.readFileSync(tokFile, 'utf8').trim() === LT && allOut.includes(tokFile), 'genchibi live hook: không in token chủ / khoá chủ / token GitHub, cả token live — token live ghi ở tệp 0600 cạnh tệp hook (lệnh chỉ nêu đường tệp)');
  ok(st && (st.mode & 0o777) === 0o600 && fs.readFileSync(hookFile, 'utf8') === fs.readFileSync(path.join(ROOT, 'tools/live-hook.mjs'), 'utf8') && !fs.realpathSync(hookFile).startsWith(fs.realpathSync(CH) + '/') && !fs.readdirSync(TD).some(f => /^live-hook\.[A-Za-z0-9]{6}$/.test(f)),
    'bản hook chép ra ngoài thư mục cài (0600, đúng nội dung của gói, không sót tệp tạm) — Claude Code không bao giờ chạy mã trong thư mục cài');
  // tệp hook chạy THẬT từ chỗ đã chép (không env token): đọc token ở tệp cạnh nó · đường có dấu cách + đi qua symlink (macOS /Users/John Smith) vẫn chạy
  {
    const got = []; const fake = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { got.push({ b, auth: req.headers.authorization }); res.writeHead(202); res.end('{}'); }); });
    await new Promise(r => fake.listen(0, '127.0.0.1', r));
    const SP = path.join(B, 'John Smith %20 dir'); fs.mkdirSync(SP); fs.copyFileSync(hookFile, path.join(SP, 'live-hook.mjs')); fs.copyFileSync(tokFile, path.join(SP, 'live-token'));
    const LNK = path.join(B, 'via-link'); fs.symlinkSync(SP, LNK);
    const runH = file => new Promise(res => { const c = spawn(process.execPath, [file], { env: { PATH: process.env.PATH, HOME: UH, GC_LIVE_URL: 'http://127.0.0.1:' + fake.address().port }, stdio: ['pipe', 'ignore', 'ignore'] }); kids.push(c); c.on('exit', res); c.stdin.end(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/x' } })); });
    const c1 = await runH(hookFile), c2 = await runH(path.join(SP, 'live-hook.mjs')), c3 = await runH(path.join(LNK, 'live-hook.mjs'));
    fake.close();
    ok(c1 === 0 && c2 === 0 && c3 === 0 && got.length === 3 && got.every(g => g.auth === 'Bearer ' + LT && JSON.parse(g.b).kind === 'read'), 'tệp hook đã chép tự đọc token ở tệp cạnh nó (không env) và gửi được — cả khi đường có dấu cách / "%20" và khi gọi qua symlink (' + got.length + '/3)');
  }
  // --install-into: tệp mới · ghép giữ khoá + hook người dùng · chạy lại không nhân đôi · sao lưu · từ chối symlink / không phải JSON / mảng / thư mục / trong thư mục cài
  const CC = path.join(UH, '.claude'), SF = path.join(CC, 'settings.json');
  const n1 = cli(['live', 'hook', '--install-into', '~/.claude/settings.json']);
  const m1 = JSON.parse(fs.readFileSync(SF, 'utf8')), mode1 = fs.statSync(SF).mode & 0o777;
  const USER = { model: 'opus', permissions: { allow: ['Bash(ls:*)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard.sh' }] }] } };
  fs.writeFileSync(SF, JSON.stringify(USER, null, 2)); fs.chmodSync(SF, 0o640);
  const n2 = cli(['live', 'hook', '--install-into', SF]), n3 = cli(['live', 'hook', '--install-into', SF]);
  const m3 = JSON.parse(fs.readFileSync(SF, 'utf8')), baks = fs.readdirSync(CC).filter(f => f.startsWith('settings.json.bak-'));
  const ours = ev => (m3.hooks[ev] || []).flatMap(g => g.hooks).filter(h => /live-hook\.mjs/.test(h.command)).length;
  ok(n1.code === 0 && mode1 === 0o600 && Object.keys(m1.hooks).length === L.HOOK_EVENTS.length, '--install-into tệp chưa có → ghi mới (0600), đủ ' + L.HOOK_EVENTS.length + ' hook', n1.out.slice(0, 300));
  ok(n2.code === 0 && n3.code === 0 && m3.model === 'opus' && m3.permissions.allow[0] === 'Bash(ls:*)' && m3.hooks.Stop.some(g => g.hooks.some(h => h.command === 'say done')) && m3.hooks.PreToolUse.some(g => g.matcher === 'Bash' && g.hooks[0].command === 'my-guard.sh') && L.HOOK_EVENTS.every(e => ours(e) === 1) && (fs.statSync(SF).mode & 0o777) === 0o640,
    '--install-into tệp có sẵn: giữ mọi khoá + hook của bạn, thêm hook Live; chạy lại thay chứ không nhân đôi (mỗi hook đúng 1) · giữ quyền tệp', JSON.stringify(m3).slice(0, 300));
  ok(baks.length === 2 && JSON.parse(fs.readFileSync(path.join(CC, baks.sort()[0]), 'utf8')).model === 'opus' && !fs.readdirSync(CC).some(f => /\.gc-/.test(f)), 'sao lưu bản cũ trước mỗi lần ghi (' + baks.length + ' bản), ghi nguyên tử (không sót tệp tạm)');
  const keep = fs.readFileSync(SF, 'utf8');
  const LNK = path.join(B, 'link.json'); fs.symlinkSync(SF, LNK); const r1 = cli(['live', 'hook', '--install-into', LNK]);
  const NJ = path.join(B, 'bad.json'); fs.writeFileSync(NJ, '{ not json'); const r2 = cli(['live', 'hook', '--install-into', NJ]);
  const AR = path.join(B, 'arr.json'); fs.writeFileSync(AR, '[1,2]'); const r3 = cli(['live', 'hook', '--install-into', AR]);
  const DR = path.join(B, 'dir.json'); fs.mkdirSync(DR); const r4 = cli(['live', 'hook', '--install-into', DR]);
  const r5 = cli(['live', 'hook', '--install-into', path.join(CH, 'settings.json')]);
  const HK = path.join(B, 'hk.json'); fs.writeFileSync(HK, '{"hooks": []}'); const r6 = cli(['live', 'hook', '--install-into', HK]);
  ok([r1, r2, r3, r4, r5, r6].every(r => r.code !== 0) && fs.readFileSync(SF, 'utf8') === keep && fs.lstatSync(LNK).isSymbolicLink() && fs.readFileSync(NJ, 'utf8') === '{ not json' && fs.readFileSync(AR, 'utf8') === '[1,2]' && !fs.existsSync(path.join(CH, 'settings.json')) && fs.readFileSync(HK, 'utf8') === '{"hooks": []}',
    '--install-into từ chối (không đổi gì): symlink · không phải JSON · JSON là mảng · thư mục · nằm trong thư mục cài · hooks không phải object', [r1, r2, r3, r4, r5, r6].map(r => r.code + ':' + r.out.trim().slice(0, 60)).join(' | '));
  // lỗi của node không bị nuốt: tên tệp dài tới mức tệp tạm vượt giới hạn → báo đúng lý do (ENAMETOOLONG), không ghi gì
  const LONG = path.join(B, 'x'.repeat(240) + '.json'); const r7 = cli(['live', 'hook', '--install-into', LONG]);
  ok(r7.code !== 0 && /ENAMETOOLONG/.test(r7.out) && !fs.existsSync(LONG), '--install-into: lỗi của node (vd ENAMETOOLONG) hiện đúng lý do, không nuốt (2>&1, không 2>/dev/null)', r7.out.slice(0, 300));
  // root (sudo) ghi vào nhà người khác / chỗ người khác ghi được → từ chối, bảo chạy không sudo (không mkdir theo symlink của user, không tệp thuộc root trong nhà user)
  if (process.getuid && process.getuid() === 0) {
    const OTHER = path.join(B, 'nha-nguoi-khac'); fs.mkdirSync(OTHER); fs.chmodSync(OTHER, 0o777);
    const r8 = cli(['live', 'hook', '--install-into', path.join(OTHER, '.claude/settings.json')]);
    ok(r8.code !== 0 && /without sudo/.test(r8.out) && !fs.existsSync(path.join(OTHER, '.claude')), 'root --install-into vào thư mục người khác ghi được → từ chối ("run … without sudo"), không tạo thư mục nào', r8.out.slice(0, 300));
  }
  // Docker (TRUST): tệp hook CHỈ lấy từ gói phát hành đã kiểm — trust_fetch giữ tools/live-hook.mjs (test-root.sh chạy luồng thật)
  const CLI = fs.readFileSync(path.join(ROOT, 'cli/genchibi'), 'utf8');
  ok(/cp "\$w\/x\/tools\/live-hook\.mjs" "\$w\/rel\/live-hook\.mjs"/.test(CLI) && /src="\$\{tf:\+\$tf\/live-hook\.mjs\}"/.test(CLI) && /mkdir -p "\$STAGE\/\$NAME\/tools"/.test(fs.readFileSync(path.join(ROOT, 'tools/package.sh'), 'utf8')) && new RegExp('^LIVE_EVENTS="' + L.HOOK_EVENTS.join(' ') + '"$', 'm').test(CLI),
    'Docker: gói phát hành mang tools/live-hook.mjs · trust_fetch giữ nó trong $TD/rel/<bản> (đã kiểm SHA-256) · genchibi live hook chỉ chép từ đó · LIVE_EVENTS của CLI = HOOK_EVENTS của engine');
}
console.log(bad ? '   ✗ test-live: có lỗi' : '   ✓ test-live: đạt');
process.exit(bad);
