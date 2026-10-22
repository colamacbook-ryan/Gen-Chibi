// Luật id của BỘ KHUNG (v0.23 B10, CNS-065): id đòn khung không trùng hoạt động (activity) / trạng thái (state) của kịch bản — cùng luật
// registerPack áp cho gói. 5 đòn đổi tên; id cũ là bí danh (tác phẩm / gói / agent cũ chạy y hệt) + chuyển dữ liệu lưu khi đọc / ghi.
// © 2026 Gen Labs — All rights reserved.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { MCP } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js');
let bad = 0;
const ok = (c, msg, x) => { if (c) console.log('   ✓ ' + msg); else { bad = 1; console.log('   ✗ ' + msg + (x !== undefined ? ' — ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400) : '')); } };
const sample = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau', f + '.json'), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gc-ids-'));
const J = r => r.structuredContent || JSON.parse(r.content[0].text);
const OLD = { thrust: 'weaponThrust', rage: 'stompRage', victory: 'joyHop', salute: 'fistSalute', wave: 'waveHello' };

const GC = loadEngine(ROOT), C = GC.choreo, L = GC.LIB, own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// 1) luật: id đòn của khung ∩ (activity ∪ state) = ∅
const frame = Object.keys(C.ACTIONS).filter(k => C.ACTIONS[k].pack === C.FRAME_PACK);
const clash = frame.filter(k => own(L.activities, k) || own(L.states, k));
ok(frame.length >= 16 && !clash.length, 'id ' + frame.length + ' đòn của khung không trùng activity / state của kịch bản (luật như gói)', clash);
// 2) bí danh: id cũ tra được (hasOwn, cùng đối tượng), không liệt kê
const aliasOk = Object.keys(OLD).every(o => own(C.ACTIONS, o) && C.ACTIONS[o] === C.ACTIONS[OLD[o]] && C.actionId(o) === OLD[o]);
ok(aliasOk && !Object.keys(OLD).some(o => Object.keys(C.ACTIONS).includes(o)) && JSON.stringify(Object.keys(C.ACTION_ALIASES).sort()) === JSON.stringify(Object.keys(OLD).sort()),
  'id cũ ' + Object.keys(OLD).join(' / ') + ' là bí danh ẩn: tra được (cùng đòn), không nằm trong danh sách / số đếm');

// 3) MCP: list_actions chỉ id mới; render_action / render_character / validate_event với id cũ ≡ id mới
const m = new MCP({ engine: GC, store: new Store(tmp()), version: 't', system: {} });
const imp = m.importProject(sample('tam-quoc'), {});
ok(!imp.errors.length, 'nhập bộ mẫu Tam Quốc (ghi "thrust" / "salute" — id cũ) qua cổng', imp.errors);
const la = J(await m.callTool('list_actions', {}));
ok(Object.values(OLD).every(n => la.actions.some(a => a.id === n)) && !la.actions.some(a => own(OLD, a.id)), 'list_actions: id mới, không có id cũ');
for (const [o, n] of [['thrust', 'weaponThrust'], ['wave', 'waveHello']]) {
  const who = o === 'thrust' ? 'tq-trieu-van' : 'gen.khung/ma-no-canh';
  const ra = J(await m.callTool('render_action', { character: who, action: o, fps: 6, cell: 96 })), rb = J(await m.callTool('render_action', { character: who, action: n, fps: 6, cell: 96 }));
  const strip = x => JSON.stringify(x).split(n).join('§').split(o).join('§');   // id mới trước (waveHello chứa wave)
  ok(ra && rb && !ra.error && strip(ra) === strip(rb), 'render_action "' + o + '" (id cũ) ≡ "' + n + '": cùng khung hình, cùng thời lượng', [ra && ra.error, rb && rb.error]);
  const ca = await m.callTool('render_character', { key: who, action: o }), cb = await m.callTool('render_character', { key: who, action: n });
  ok(!ca.isError && ca.content[1].resource.text === cb.content[1].resource.text, 'render_character action "' + o + '" ≡ "' + n + '" (SVG giống hệt)');
}
const ev = act => ({ title: 't', steps: [{ actor: 'tq-trieu-van', state: 'vow', say: 'Xem đây!', action: act, target: 'tq-quan-vu' }] });
const va = J(await m.callTool('validate_event', { event: ev('thrust') })), vb = J(await m.callTool('validate_event', { event: ev('weaponThrust') }));
ok(va.ok === true && vb.ok === true, 'validate_event chấp nhận id cũ như id mới', [va, vb]);

// 4) chuyển dữ liệu: tác phẩm nhập về được ghi bằng id mới; tệp cũ trên đĩa (id cũ) đọc ra id mới; kế hoạch diễn y hệt
const steps = w => w.shots.flatMap(s => ((s.event && s.event.steps) || []).filter(x => x.action).map(x => x.action));
const W0 = sample('tam-quoc').works[0], disk = JSON.parse(fs.readFileSync(path.join(m.store.workDir, W0.id + '.json'), 'utf8'));
ok(steps(disk).includes('weaponThrust') && steps(disk).includes('fistSalute') && !steps(disk).some(a => own(OLD, a)), 'nhập tác phẩm: tệp lưu dùng id mới (' + steps(disk).join(' ') + ')');
const raw = JSON.parse(JSON.stringify(W0)); raw.id = 'tq-cu'; fs.writeFileSync(path.join(m.store.workDir, 'tq-cu.json'), JSON.stringify(raw));   // tệp kiểu v0.22 (id cũ)
const got = m.store.getWork('tq-cu');
ok(JSON.stringify(steps(got)) === JSON.stringify(steps(W0).map(a => C.actionId(a))) && steps(W0).some(a => own(OLD, a)), 'đọc tác phẩm v0.22 (id cũ trên đĩa) → id mới: ' + steps(W0).join(' ') + ' → ' + steps(got).join(' '));
const ev0 = m.store.saveEvent({ title: 'sk', steps: [{ actor: 'tq-trieu-van', action: 'salute' }] }, 't');
ok(JSON.parse(fs.readFileSync(path.join(m.store.eventDir, ev0.id + '.json'), 'utf8')).event.steps[0].action === 'fistSalute', 'kịch bản lưu riêng (events/) cũng chuyển sang id mới');
// kế hoạch diễn của phân cảnh có đòn: id cũ ≡ id mới (bỏ qua chính chuỗi id)
const shotOld = raw.shots.find(s => s.id === 'canh-dau-tap'), shotNew = got.shots.find(s => s.id === 'canh-dau-tap');
const norm = x => JSON.stringify(x, (k, v) => typeof v === 'string' && own(OLD, v) ? OLD[v] : v);
const pa = GC.film.direct(shotOld), pb = GC.film.direct(shotNew);
ok(pa && norm(pa) === norm(pb), 'kế hoạch diễn "Đấu tập trước trận": id cũ ≡ id mới (cùng nhịp, máy quay, chỗ đứng, đòn)');
const ra0 = GC.film.readiness({ shots: [shotOld] })[0], rb0 = GC.film.readiness({ shots: [shotNew] })[0];
ok(ra0 && rb0 && ra0.ok && rb0.ok, 'readiness: phân cảnh id cũ / id mới đều sẵn sàng', [ra0 && ra0.miss, rb0 && rb0.miss]);

// 5) gói: không lấy được id cũ (trùng activity / state) cũng không lấy được id mới (trùng đòn khung)
const pk = id => ({ format: C.MOTION.format, id: 'ci-' + id.toLowerCase(), name: 'ci', actions: { [id]: { label: 'x', clips: ['wave'] } } });
const e1 = C.registerPack('local.my', pk('salute')).errors, e2 = C.registerPack('local.my', pk('fistSalute')).errors;
ok(e1.length && e2.length && /bộ khung/.test(e2.join(' ')), 'gói đặt id "salute" (id cũ) hoặc "fistSalute" (id khung) đều bị chặn', [e1, e2]);
process.exit(bad);
