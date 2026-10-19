// Kiểm LÕI dock + phòng làm phim ở phía server, gọi thẳng MCP trong tiến trình (không HTTP, không LLM) — nhanh và tất định.
// Các rào mà cortex v0.18 (CNS-116…125) đòi: quyền duyệt theo tác giả · bản sao khung luôn nháp · ranh giới tin cậy của chỉ dẫn · trần ngân sách ngữ cảnh · khu Thư viện không tạo mới.
import { createRequire } from 'module';
import { mkdtempSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const { MCP, LIMITS, ZONES, cleanContext, cleanAnchors } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js');
let fail = 0; const ok = (c, m) => { if (c) console.log('   ✓', m); else { fail = 1; console.log('   ✗', m); } };
const fresh = () => { const store = new Store(mkdtempSync(path.join(tmpdir(), 'gc-dockcore-'))), m = new MCP({ engine: loadEngine(ROOT), store, version: 't', system: {} }); return { store, m, GC: m.GC }; };
const J = r => r.structuredContent || JSON.parse(r.content[0].text);
const txt = r => (r.content && r.content[0] && r.content[0].text) || '';
const clone = x => JSON.parse(JSON.stringify(x));
const BUNDLE = JSON.parse(readFileSync(ROOT + '/studio/mau/tam-quoc.json', 'utf8')), WID = 'tq-vuon-dao-xich-bich', PID = 'mau-tam-quoc';
// ba kênh ghi không phải chủ: dock (ui) · MCP có token / stdio · link MCP — và chủ trong Studio (gọi thẳng saveWorkChecked như POST /api/works)
const CH = { 'dock (ui)': { channel: 'ui' }, 'MCP token / stdio': {}, 'link MCP': { viaLink: true } };

try {
  /* ---------------------------------------------------------------- CNS-116: "Đạt" + ghi chú duyệt là của chủ */
  {
    const { m, store } = fresh();
    m.importProject(clone(BUNDLE), {});
    const w0 = store.getWork(WID), S1 = w0.shots[0].id, S2 = w0.shots[1].id, S3 = w0.shots[2].id;
    const owner = rv => m.saveWorkChecked({ id: WID, review: rv });
    const state = () => store.getWork(WID).review;
    owner({ shots: { [S1]: { status: 'fix', notes: [{ text: 'Chủ: cắt lời dài', step: 1 }] }, [S2]: { status: 'ok' } }, note: 'chủ ghi chung' });
    ok(state().shots[S2].status === 'ok' && state().shots[S1].notes[0].by === 'owner', 'chủ (Studio) đặt được "Đạt" + ghi chú; ghi chú mang by = owner');
    for (const [name, ctx] of Object.entries(CH)) {
      const call = review => m.callTool('save_work', { id: WID, review }, ctx);
      let r = await call({ shots: { [S1]: { status: 'ok' } } });
      ok(r.isError && /chỉ chủ duyệt/.test(txt(r)) && state().shots[S1].status === 'fix', name + ': không đặt được "Đạt" (cảnh đang Cần sửa), trạng thái giữ nguyên');
      r = await call({ shots: { [S3]: { status: 'ok' } } });
      ok(r.isError && !(state().shots[S3] && state().shots[S3].status === 'ok'), name + ': không đặt "Đạt" cho cảnh chưa duyệt');
      r = await call(null);
      ok(r.isError && /chỉ chủ xoá/.test(txt(r)) && state() && state().shots[S1].notes.length >= 1, name + ': review: null bị chặn, duyệt + ghi chú của chủ còn nguyên');
      r = await call({ note: 'AI đổi ghi chú chung' });
      ok(r.isError && /ghi chú chung là của chủ/.test(txt(r)) && state().note === 'chủ ghi chung', name + ': không ghi đè ghi chú chung của chủ');
      r = await call({ note: 'chủ ghi chung', shots: { [S1]: { status: 'fix' } } });
      ok(!r.isError, name + ': gửi lại đúng ghi chú chung + giữ trạng thái không báo lỗi (gửi lại nguyên get_work › review được)');
      const n0 = state().shots[S1].notes;
      r = await call({ shots: { [S1]: { notes: [] } } });
      ok(r.isError && /không được xoá/.test(txt(r)) && state().shots[S1].notes.length === n0.length, name + ': notes [] không xoá được ghi chú của chủ');
      r = await call({ shots: { [S1]: { notes: [{ id: n0[0].id, text: 'AI sửa chữ của chủ', step: 1 }] } } });
      ok(r.isError && /không được sửa/.test(txt(r)) && state().shots[S1].notes[0].text === 'Chủ: cắt lời dài', name + ': không sửa chữ ghi chú của chủ');
      const keep = n0.map(n => ({ id: n.id, text: n.text, step: n.step, by: 'owner' }));   // gửi lại mọi ghi chú đã có (nguyên id + chữ; by do client khai bị bỏ qua) + một ghi chú mới
      r = await call({ shots: { [S1]: { notes: keep.concat({ text: 'Gợi ý từ ' + name, by: 'owner' }) } } });
      const ns = state().shots[S1].notes, mine = ns[ns.length - 1];
      ok(!r.isError && ns[0].by === 'owner' && ns[0].text === 'Chủ: cắt lời dài' && ns.length === n0.length + 1 && /Gợi ý/.test(mine.text) && mine.by === (ctx.channel === 'ui' ? 'ai' : 'agent'), name + ': chỉ THÊM được ghi chú — server gắn by = ' + mine.by + ' (không tin by do client gửi)');
    }
    let r = await m.callTool('save_work', { id: WID, review: { shots: { [S2]: { status: 'draft' } } } }, CH['dock (ui)']);
    ok(!r.isError && state().shots[S2].status === 'draft', 'AI đặt được "Nháp" (hạ từ Đạt); đặt lại "Đạt" thì không');
    r = await m.callTool('save_work', { id: WID, review: { shots: { [S2]: { status: 'ok' } } } }, CH['dock (ui)']);
    ok(r.isError && state().shots[S2].status === 'draft', 'sau khi hạ Nháp, AI không nâng lại thành Đạt');
    owner({ shots: { [S2]: { status: 'ok' }, [S1]: { notes: [] } }, note: '' });
    ok(state().shots[S2].status === 'ok' && !state().shots[S1].notes.length && state().note === '', 'chủ vẫn làm được mọi việc: đặt Đạt, xoá ghi chú (kể cả của AI), xoá ghi chú chung');
    r = await m.callTool('save_shot', { work: WID, shot: { id: S2, description: 'Mô tả đã đổi' } }, CH['MCP token / stdio']);
    ok(!r.isError && state().shots[S2].status === 'draft' && state().shots[S2].notes.some(n => n.by === 'system'), 'sửa cảnh sau "Đạt" (mọi kênh) → về Nháp + ghi chú máy (by = system)');
    owner(null);
    ok(store.getWork(WID).review === undefined, 'chủ xoá được review');
  }
  // nhập gói: đặt "Đạt" qua gói bằng kênh MCP bị chặn; nhập đè cảnh đã đổi nội dung → "Đạt" cũ về "Nháp"
  {
    const { m, store } = fresh();
    m.importProject(clone(BUNDLE), {});
    const w0 = store.getWork(WID), S1 = w0.shots[0].id, S2 = w0.shots[1].id;
    m.saveWorkChecked({ id: WID, review: { shots: { [S1]: { status: 'ok' }, [S2]: { status: 'ok' } }, note: 'x' } });
    const ex = m.exportProject(PID, {}), wb = ex.works.find(w => w.id === WID);
    ok(wb.review.shots[S1].status === 'ok', 'gói xuất mang review (Đạt)');
    // (a) nhập đè GÓI GIỐNG HỆT → vẫn Đạt (không hạ oan)
    m.importProject(clone(ex), { overwrite: true });
    ok(store.getWork(WID).review.shots[S1].status === 'ok' && store.getWork(WID).review.shots[S2].status === 'ok', 'nhập đè gói giống hệt: các cảnh vẫn "Đạt"');
    // (b) cảnh 1 đổi mô tả, gói không mang review → cảnh 1 về Nháp, cảnh 2 (không đổi) giữ Đạt
    const ex2 = clone(ex), wb2 = ex2.works.find(w => w.id === WID); wb2.shots[0].description = 'NỘI DUNG KHÁC HẲN sau khi duyệt'; delete wb2.review;
    const im = m.importProject(ex2, { overwrite: true });
    const rv = store.getWork(WID).review;
    ok(!im.errors.length && rv.shots[S1].status === 'draft' && rv.shots[S1].notes.some(n => /đã đổi sau khi duyệt/.test(n.text)) && rv.shots[S2].status === 'ok', 'nhập đè cảnh đã đổi nội dung → "Đạt" cũ về "Nháp" (cảnh không đổi giữ Đạt)');
    // (c) gói mang review "Đạt": chủ (Studio) nhập được; kênh MCP / dock bị chặn, báo lỗi review
    const owned = fresh();
    const io = owned.m.importProject(clone(ex), {}), bw = owned.store.getWork(WID);
    ok(bw && bw.review && bw.review.shots[S1].status === 'ok' && !io.errors.some(e => e.kind === 'review'), 'chủ nhập gói mang review: giữ "Đạt"' + (io.errors.length ? ' — ' + JSON.stringify(io.errors).slice(0, 200) : ''));
    for (const [name, ctx] of Object.entries(CH)) {
      const { m: m2, store: st2 } = fresh();
      const via = await m2.callTool('import_project', { bundle: clone(ex) }, ctx);
      const got = st2.getWork(WID), j = J(via);
      ok(got && !(got.review && Object.values(got.review.shots || {}).some(x => x.status === 'ok')) && (j.errors || []).some(e => e.kind === 'review'), name + ': import_project mang review "Đạt" → không lọt Đạt, báo lỗi review');
    }
  }

} catch (e) { fail = 1; console.log('   ✗', e.stack || e.message); }
process.exit(fail);
