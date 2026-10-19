// gen-chibi — test 2j: cổng gói động tác (từng kiểu tấn công đã probe) · hình học đòn tay không (đo độc lập) · chặn bán bộ mẫu
// theo nội dung (cả bản đổi tên) · gói sao lưu tự đủ · dữ liệu trước v0.16 · hoạt ảnh phủ trọn đòn · hợp đồng lỗi [CODE] ở mọi tool.
// Chạy: node tools/test-motion.js (bash tools/test.sh gọi). Viết tách tệp để khỏi vướng nháy đơn trong node -e (L-56).
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { MCP } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js');
const no = (c, msg) => { if (c) { console.log('   ✗', msg); process.exit(1); } };
const sample = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'studio/mau', f + '.json'), 'utf8'));
const fresh = () => { const GC = loadEngine(ROOT); return { GC, C: GC.choreo, m: new MCP({ engine: GC, store: new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-mo-'))), version: 't', system: {} }) }; };
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  // ---------- 1. cổng gói động tác: mỗi kiểu tấn công bị chặn ĐÚNG chỗ, không ném lỗi, không treo
  {
    const { C } = fresh();
    const base = () => ({ id: 'ci-tan-cong', poses: { aa: { $: 'guard', armR: { rot: 40 } } }, clips: { cc: { keys: [[0, 'aa'], [0.3, 'guard']], events: [[0.2, { hit: true }]] } }, actions: { ciHit: { attack: true, clips: ['cc'] } } });
    no(base() && C.checkPack(base()).errors.length, 'gói mẫu của test phải hợp lệ: ' + C.checkPack(base()).errors.join('; '));
    const bad = (what, mut, re) => {
      const p = base(); mut(p); let r, t0 = Date.now();
      try { r = C.checkPack(p); } catch (e) { no(true, what + ': cổng ném lỗi thay vì báo lỗi — ' + e.message); }
      no(Date.now() - t0 > 500, what + ': cổng chạy quá lâu ' + (Date.now() - t0) + ' ms');
      no(!r.errors.length, what + ': phải bị chặn');
      if (re) no(!r.errors.some(e => re.test(e)), what + ': báo sai chỗ — ' + r.errors.slice(0, 3).join(' | '));
    };
    bad('thời lượng khổng lồ', p => { p.clips.cc.keys[1][0] = 1e5; }, /^clips\.cc\.keys\[1\]\[0\]/);
    bad('2 000 khựng hình', p => { p.clips.cc.events = Array.from({ length: 2000 }, (x, i) => [i / 1000, { hitstop: 0.4 }]); }, /events/);
    bad('NaN / Infinity', p => { p.poses.aa.armR.rot = NaN; }, /poses\.aa\.armR\.rot/);
    bad('hàm trong gói (make)', p => { p.clips.cc.make = 'function(){}'; }, /make/);
    bad('khoá prototype', p => { p.poses = JSON.parse('{"__proto__": {"armR": {"rot": 1}}}'); }, /poses/);
    bad('chèn màu / CSS', p => { p.clips.cc.events[0][1].flashColor = 'red;}</style><script>'; }, /flashColor/);
    bad('kế thừa vòng tròn', p => { p.poses.aa.$ = 'bb'; p.poses.bb = { $: 'aa' }; }, /vòng tròn/);
    bad('phần tử null trong mảng (review)', p => { p.clips.cc.keys.push(null); p.clips.cc.travel = [null]; p.clips.cc.events.push(null); p.clips.cc.cam = [null]; p.clips.cc.speed = [null]; p.clips.cc.faces = [null]; }, /^clips\.cc\.keys\[2\]/);
    bad('đòn đánh thiếu điểm va chạm', p => { delete p.clips.cc.events; }, /va chạm/);
    bad('ném nhưng không phải đòn đánh', p => { p.actions.ciHit.attack = false; p.actions.ciHit.ranged = true; }, /ranged/);
    bad('trường lạ ở hành động', p => { p.actions.ciHit.onload = 'x'; }, /trường lạ/);
    bad('kênh khớp lạ', p => { p.poses.aa.armR.skew = 3; }, /kênh lạ/);
    bad('tham chiếu clip hold / có dấu hai chấm', p => { p.actions.ciHit.clips = ['hold']; }, /không có clip/);
    bad('vệt chém / bóng mờ quá ngân sách', p => { p.clips.cc.events = [[0.2, { hit: true }]].concat(Array.from({ length: 5 }, (x, i) => [0.21 + i / 100, { smear: 0.3 }])); }, /ghosts \/ lines \/ smear/);
    bad('một hành động dài quá trần (review: DoS)', p => { p.clips.cc.keys[1][0] = 7; }, /tối đa 6 s/);
    // chữ hiện ra màn hình: bỏ ký tự HTML, không chặn
    const tx = base(); tx.clips.cc.events[0][1].text = '<b>BỐP</b>'; const rt = C.checkPack(tx);
    no(rt.errors.length || /[<>]/.test(rt.def.clips.cc.events[0][1].text), 'chữ hiệu ứng phải bị lọc ký tự HTML');
    // đè đòn của khung / tên activity / state: registerPack chặn (thử ngược: id hợp lệ thì qua)
    for (const [id, re] of [['punch', /bộ khung/], ['salute', /bộ khung|hoạt động/], ['toString', null]]) {
      const p = base(); p.actions = { [id]: p.actions.ciHit }; const r = C.registerPack('local.my', p);
      if (id === 'toString') { no(!r.errors.some(e => /dành riêng/.test(e)), 'id "toString" phải bị chặn là tên dành riêng: ' + r.errors.join('; ')); continue; }
      no(!r.errors.length, 'id hành động "' + id + '" phải bị chặn'); if (re) no(!r.errors.some(e => re.test(e)), 'id "' + id + '" báo sai: ' + r.errors.join('; '));
      no(r.errors.some(e => /undefined/.test(e)), 'thông báo chặn id "' + id + '" có chữ undefined');
    }
    const ok = C.registerPack('local.my', base()); no(ok.errors.length, 'gói hợp lệ phải nạp được: ' + ok.errors.join('; ')); C.unregisterPack('local.my/ci-tan-cong');
    // gói lớn nhất cổng cho qua: dựng thử có trần thời gian (không chặn server lâu) — review: trước đây 47 s
    const { m } = fresh(), big = { id: 'ci-nang', poses: {}, clips: {}, actions: {} };
    for (let i = 0; i < 6; i++) big.clips['c' + i] = { keys: [[0, 'guard'], [0.999, 'guard']], events: [[0.5, { hit: true, smear: 0.6 }]].concat(Array.from({ length: 3 }, (x, j) => [0.6 + j * 0.1, { smear: 0.6, ghosts: 3 }])) };
    for (let i = 0; i < 32; i++) big.actions['a' + i + 'x'] = { attack: true, clips: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'] };
    const t0 = Date.now(), rv = await m.callTool('validate_motion_pack', { pack: big }), ms = Date.now() - t0;
    no(ms > 6000, 'dựng thử gói nặng nhất cổng cho qua phải có trần ≤ ~4 s (đo ' + ms + ' ms)');
    no(!rv.isError && ms > 4500, 'gói chạm trần thời gian phải báo lỗi "quá nặng"');
    no(Object.keys(m.GC.choreo.ACTIONS).some(k => /^a\d+x$/.test(k)), 'dựng thử xong phải gỡ sạch gói tạm');
    console.log('   ✓ cổng gói động tác: 15 kiểu tấn công bị chặn đúng chỗ (không ném lỗi, < 0,5 s) · lọc chữ HTML · chặn đè đòn khung / tên activity / khoá prototype · gói nặng nhất cổng cho qua dựng thử ' + ms + ' ms (trần 4 s) · gỡ sạch gói tạm');
  }

  // ---------- 2. hình học đòn tay không — đo ĐỘC LẬP: ma trận khớp của tư thế cuối × toạ độ bản vẽ (không qua pointAt / hàm của engine)
  {
    const { GC, C, m } = fresh(); m.importProject(sample('van-phong-vui'), {});
    const A = GC.ASSETS['local.my/mau-be-na'], B = GC.ASSETS['local.my/mau-sep-tu'], K = 0.8;
    const P = (tl, t, ai, joint, x, y) => { const F = C.finalAt(tl, t, ai), M = GC.jointMatrices(F.pose)[joint]; return [F.x + ((M[0] * x + M[2] * y + M[4]) - 100) * F.K, F.G + (M[1] * x + M[3] * y + M[5] - 228) * F.K]; };
    let n = 0;
    for (const [xa, xb] of [[240, 420], [200, 520], [430, 250], [120, 600]]) {
      const duel = act => C.duel({ a: { asset: A, x: xa, y: 330, k: K }, b: { asset: B, x: xb, y: 330, k: K }, action: act, react: 'hit' });
      // đấm: nắm tay gần nhất chạm MẶT TRƯỚC của đầu đối thủ (±14), đúng tầm cao của đầu
      let tl = duel('punch'), d = tl.duel, t = d.reach, hd = P(tl, t, 1, 'head', 100, 96), front = hd[0] - d.dir * 52 * 0.7 * K;
      const fist = [P(tl, t, 0, 'handR', 128, 193), P(tl, t, 0, 'handL', 72, 193)].sort((a, b) => Math.abs(a[0] - front) - Math.abs(b[0] - front))[0];
      no(Math.abs(fist[0] - front) > 14 || Math.abs(fist[1] - hd[1]) > 52 * K, 'đấm (' + xa + '→' + xb + '): nắm tay ' + fist.map(Math.round) + ' không chạm mặt trước đầu ' + Math.round(front) + ',' + Math.round(hd[1]));
      // đá: bàn chân chạm mặt trước thân (gốc − hướng × nửa thân 26) ±16
      tl = duel('kick'); d = tl.duel; t = d.reach;
      const foot = P(tl, t, 0, 'footR', 108, 226), bf = C.finalAt(tl, t, 1).x - d.dir * 26 * K;
      no(Math.abs(foot[0] - bf) > 16, 'đá (' + xa + '→' + xb + '): bàn chân ' + Math.round(foot[0]) + ' lệch mặt trước thân ' + Math.round(bf));
      // đẩy mặt: lòng bàn tay nằm trên mặt đối thủ (trong bán kính đầu)
      tl = duel('push'); d = tl.duel; t = d.reach; hd = P(tl, t, 1, 'head', 100, 96);
      const palm = [P(tl, t, 0, 'handR', 128, 193), P(tl, t, 0, 'handL', 72, 193)].map(p => Math.hypot(p[0] - hd[0], p[1] - hd[1])).sort((a, b) => a - b)[0];
      no(palm > 52 * K, 'đẩy mặt (' + xa + '→' + xb + '): bàn tay cách tâm đầu ' + Math.round(palm) + ' (> bán kính đầu)');
      // ném: quả ném rời ĐÚNG bàn tay lúc buông, bay tới ngực đối thủ lúc trúng (±6)
      tl = duel('throw'); const rel = tl.events.find(e => e.release), pr = tl.events.find(e => e.fx === 'projectile');
      no(!rel || !pr, 'ném: thiếu sự kiện buông tay / quả ném');
      const hand = P(tl, rel.t, 0, 'handR', 128, 193), chest = P(tl, tl.duel.impact, 1, 'body', 100, 170);
      no(Math.hypot(pr.x0 - hand[0], pr.y0 - hand[1]) > 6, 'ném (' + xa + '→' + xb + '): quả ném không rời từ bàn tay');
      no(Math.hypot(pr.x - chest[0], pr.y - chest[1]) > 6, 'ném (' + xa + '→' + xb + '): quả ném không tới ngực đối thủ');
      n += 4;
    }
    console.log('   ✓ hình học đòn tay không (đo độc lập từ ma trận khớp, ' + n + ' màn, 4 khoảng cách, cả hai hướng): đấm chạm mặt trước đầu ±14 · đá chạm thân ±16 · đẩy mặt trong bán kính đầu · ném rời tay → tới ngực ±6');
  }

  // ---------- 3. bộ mẫu: chặn bán theo NỘI DUNG từng clip (đổi id gói / id đòn / tên clip / tên tư thế / thêm tư thế thừa) · sao lưu tự đủ · dữ liệu trước v0.16
  {
    const tq = sample('tam-quoc'), pack = tq.motionPacks[0];
    const tries = {
      'đổi id gói + id đòn': p => { p.id = 'shop-vo'; p.actions = Object.fromEntries(Object.entries(p.actions).map(([k, v]) => [k + 'X', v])); },
      'đổi tên clip': p => { const k = Object.keys(p.clips)[0]; p.clips['zz' + k] = p.clips[k]; delete p.clips[k]; Object.values(p.actions).forEach(a => { a.clips = a.clips.map(c => c === k ? 'zz' + k : c); }); Object.values(p.shows || {}).forEach(s => s.steps.forEach(x => { if (x.clip === k) x.clip = 'zz' + k; })); },
      'đổi tên tư thế': p => { const k = Object.keys(p.poses)[0], nk = 'zz' + k; p.poses[nk] = p.poses[k]; delete p.poses[k]; const fix = v => v === k ? nk : v; Object.values(p.poses).forEach(q => { if (q.$) q.$ = fix(q.$); }); Object.values(p.clips).forEach(c => c.keys.forEach(q => { q[1] = typeof q[1] === 'string' ? fix(q[1]) : (q[1].$ ? Object.assign(q[1], { $: fix(q[1].$) }) : q[1]); })); Object.values(p.shows || {}).forEach(s => s.steps.forEach(x => { if (x.pose) x.pose = fix(x.pose); })); },
      'thêm tư thế thừa': p => { p.poses.zzUnused = {}; },
    };
    let n = 0;
    for (const [what, mut] of Object.entries(tries)) {
      const { m } = fresh(), p = clone(pack); mut(p); p.id = p.id === pack.id ? 'shop-vo' : p.id; p.project = 'shop'; p.status = 'published'; delete p.sample;
      if (p.shows) p.shows = {};   // màn diễn mang id riêng — không cần cho phép thử
      m.store.saveProject({ id: 'shop', name: 'Cửa hàng' });
      const sv = await m.callTool('save_motion_pack', { pack: p }); no(sv.isError, what + ': gói phải lưu được để thử — ' + sv.content[0].text.slice(0, 200));
      let err = null; try { m.exportProject('shop', { sale: true }); } catch (e) { err = e; }
      no(!err || err.code !== 403, what + ': gói bán chứa gói động tác của bộ mẫu phải bị chặn 403 (' + (err ? err.code + ' ' + err.message.slice(0, 80) : 'không lỗi') + ')');
      n++;
    }
    // thử ngược: gói tự làm (không trùng clip mẫu) bán được
    { const { m } = fresh(); m.store.saveProject({ id: 'shop', name: 'Cửa hàng' });
      const own = { id: 'cua-toi', project: 'shop', status: 'published', poses: { aa: { $: 'guard', armR: { rot: 33 } } }, clips: { cc: { keys: [[0, 'aa'], [0.4, 'guard']], events: [[0.3, { hit: true }]] } }, actions: { myJab: { attack: true, clips: ['cc'] } } };
      no((await m.callTool('save_motion_pack', { pack: own })).isError, 'gói tự làm phải lưu được');
      let err = null, out = null; try { out = m.exportProject('shop', { sale: true }); } catch (e) { err = e; }
      no(err || !out.motionPacks.length, 'gói tự làm phải xuất bán được' + (err ? ': ' + err.message : '')); }
    // sao lưu tự đủ: tác phẩm của dự án KHÁC dùng đòn của gói Tam Quốc → gói sao lưu kéo theo gói động tác → máy sạch nhập lại vẫn đủ màn đấu
    { const { GC, m } = fresh(); m.importProject(tq, {}); m.store.saveProject({ id: 'phim-cua-toi', name: 'Phim của tôi' });
      const w = m.saveWorkChecked({ id: 'tran-dau', title: 'Trận đấu', project: 'phim-cua-toi' });
      const ev = { title: 'Đấu', steps: [{ actor: 'tq-trieu-van', state: 'rage', say: '', action: 'combo', target: 'tq-truong-phi', react: 'hit' }] };
      m.saveShotChecked({ work: w.id, shot: { title: 'Đấu', scene: 'local.my/tq-doanh-trai', cast: ['local.my/tq-trieu-van', 'local.my/tq-truong-phi'], event: ev } });
      const b = m.exportProject('phim-cua-toi', {});
      no(!b.motionPacks.some(x => x.id === pack.id), 'gói sao lưu phải kéo theo gói động tác mà phim dùng (CNS-060)');
      no(!b.provenance || !Object.keys(b.provenance).some(k => /^motion:/.test(k)), 'gói động tác của bộ mẫu đi theo sao lưu phải mang dấu bộ mẫu');
      const f = fresh(); f.m.importProject(JSON.parse(JSON.stringify(b)), {});
      const sh = f.m.store.getWork('tran-dau').shots[0], miss = f.GC.film.readiness({ shots: [sh] })[0].missing;
      no(miss.length, 'khôi phục gói sao lưu ở máy sạch: phân cảnh đấu còn thiếu ' + miss.join('; ')); }
    // dữ liệu trước v0.16 (linh kiện tự vẽ chưa khai grip): vật cầm tay DÀI vẫn là binh khí → phim cũ không mất màn đấu (CNS-062)
    { const old = clone(tq); old.parts.forEach(p => { delete p.grip; }); delete old.motionPacks; old.sample = Object.assign({}, old.sample, { version: '2026.10.17-cu' });
      const { GC, C, m } = fresh(); m.importProject(old, {});
      no(!C.hasWeapon(GC.ASSETS['local.my/tq-trieu-van']), 'Triệu Vân (thương tự vẽ trước v0.16, chưa khai grip) phải còn đòn binh khí');
      no(C.hasWeapon(GC.ASSETS['gen.khung/ma-no-canh']), 'ma-nơ-canh tay không không được coi là có binh khí'); }
    console.log('   ✓ bộ mẫu: gói bán chặn 403 với ' + n + ' kiểu ngụy trang (đổi id gói / đòn, tên clip, tên tư thế, thêm tư thế thừa) · gói tự làm bán được · sao lưu kéo theo gói động tác phim dùng (mang dấu mẫu), khôi phục máy sạch đủ màn đấu · linh kiện cũ chưa khai grip vẫn là binh khí');
  }

  // ---------- 4. hoạt ảnh: phủ TRỌN đòn (tự hạ fps khi cần) · sprite sheet: id từng khung riêng, ô kẹp số · render_action không nhận chuỗi lạ
  {
    const { GC, C, m } = fresh(); m.importProject(sample('tam-quoc'), {});
    const tv = GC.ASSETS['local.my/tq-trieu-van'], tp = GC.ASSETS['local.my/tq-truong-phi'];
    const an = C.animate(C.actionTimeline({ asset: tv, action: 'leap', partner: tp, react: 'fall' }), { fps: 30 });
    no(an.frames.length > 120 || Math.abs(an.frames[an.frames.length - 1].t - an.duration) > 0.001, 'hoạt ảnh phải phủ trọn đòn: khung cuối ' + an.frames[an.frames.length - 1].t + ' s / ' + an.duration + ' s');
    no(an.meta.truncated || an.meta.fps >= 30 || an.meta.requestedFps !== 30, 'đòn dài ở 30 fps phải tự hạ fps, ghi requestedFps, không truncated: ' + JSON.stringify({ fps: an.meta.fps, req: an.meta.requestedFps, tr: an.meta.truncated }));
    const fr = C.animate(C.actionTimeline({ asset: tv, action: 'leap', partner: tp, react: 'fall' }), { fps: 30, maxFrames: 60 });
    no(fr.frames.length > 60 || Math.abs(fr.frames[fr.frames.length - 1].t - fr.duration) > 0.001, 'maxFrames 60 vẫn phải phủ trọn đòn');
    const sh = C.sheetSVG(an, { cell: 96 }), ids = (sh.svg.match(/\bid="[^"]+"/g) || []);
    // mỗi khung mang tiền tố id riêng (f<i>-) → id của khung này không bao giờ trỏ nhầm sang khung khác trong cùng tệp
    no(ids.some(x => !/^id="f\d+-/.test(x)), 'sprite sheet có id chưa mang tiền tố khung');
    no((sh.svg.match(/url\(#([^)]+)\)/g) || []).some(u => sh.svg.indexOf('id="' + u.slice(5, -1) + '"') < 0), 'sprite sheet có url(#…) trỏ tới id không tồn tại');
    const r = await m.callTool('render_action', { character: 'tq-trieu-van', action: 'thrust', cell: '1"/><script>alert(1)</script><svg width="1', fps: 1e9 });
    no(r.isError || /<script/i.test(r.content[1].resource.text) || r.structuredContent.sheet.cell.w !== 160 || r.structuredContent.fps > 30, 'render_action phải kẹp cell / fps (chuỗi lạ → mặc định)');
    const r2 = await m.callTool('render_action', { character: 'tq-trieu-van', action: 'thrust', cell: 1e7 });
    no(r2.structuredContent.sheet.cell.w !== 512, 'cell khổng lồ phải kẹp về 512');
    console.log('   ✓ hoạt ảnh phủ trọn đòn (leap + ngã: ' + an.frames.length + ' khung ở ' + an.meta.fps + ' fps thay vì 30, khung cuối = ' + an.duration + ' s) · sprite sheet ' + ids.length + ' id đều mang tiền tố khung, url(#) đều trỏ đúng · render_action kẹp cell / fps');
  }

  // ---------- 5. hợp đồng lỗi: MỌI lời gọi hỏng (mọi tool có thể thất bại) mở đầu [CODE] + structuredContent.error đủ trường
  {
    const { m } = fresh(); m.importProject(sample('van-phong-vui'), {});
    const calls = [
      ['validate_character', { asset: { id: 'x', look: { slots: { hair: 'khong-co' } } } }], ['save_character', { asset: { id: 'x', look: { slots: { hair: 'khong-co' } } } }],
      ['save_character', { asset: { id: 'ci-thieu-dau', name: 'Thiếu dấu', status: 'published', look: {} } }],
      ['validate_event', { event: { title: 't', steps: [{ actor: 'ai-do', state: 'normal', say: '' }] } }], ['save_event', { event: {} }],
      ['preview_part', { part: { id: 'x', slot: 'hat' } }], ['save_part', { part: { id: 'x' } }],
      ['validate_item', { item: {} }], ['save_item', { item: {} }], ['validate_scene', { scene: {} }], ['save_scene', { scene: {} }],
      ['save_project', { id: 'BAD ID', name: 'x' }], ['save_work', {}], ['save_shot', { work: 'khong-co', shot: {} }], ['get_work', { id: 'khong-co' }],
      ['export_project', { id: 'khong-co' }], ['import_project', { bundle: {} }], ['import_project', { bundle: sample('van-phong-vui') }],
      ['validate_motion_pack', { pack: { id: 'x', clips: { cc: { keys: [null] } } } }], ['save_motion_pack', { pack: {} }], ['get_motion_pack', { key: 'khong-co' }],
      ['render_action', { character: 'khong-co', action: 'punch' }], ['render_action', { character: 'mau-be-na', action: 'thrust' }],
      ['render_character', { key: 'khong-co' }], ['get_character', { key: 'khong-co' }], ['preview_shot', { work: 'khong-co', shot: '0' }],
      ['install_sample', { id: 'khong-co' }], ['get_guide', { topic: 'khong-co' }],
    ];
    const codes = {};
    for (const [name, args] of calls) {
      let r; try { r = await m.callTool(name, args, {}); } catch (e) { no(true, name + ': ném lỗi ra ngoài thay vì trả lỗi có mã — ' + e.message); }
      const t = r && r.content && r.content[0] && r.content[0].text || '', er = r && r.structuredContent && r.structuredContent.error;
      no(!r.isError, name + ' ' + JSON.stringify(args).slice(0, 60) + ': phải là lỗi (isError)');
      no(!/^\[[A-Z_]+\] /.test(t), name + ': chữ lỗi phải mở đầu [CODE] — ' + t.slice(0, 80));
      no(!er || typeof er !== 'object' || er.code !== /^\[([A-Z_]+)\]/.exec(t)[1] || typeof er.message !== 'string' || !Array.isArray(er.details) || !er.details.length || !er.hint, name + ': structuredContent.error thiếu code / message / details / hint');
      codes[er.code] = (codes[er.code] || 0) + 1;
    }
    const ev = await m.callTool('validate_event', { event: { title: 't', steps: [{ actor: 'mau-be-na', state: 'normal', say: '', action: 'thrust', target: 'mau-sep-tu' }] }, cast: ['local.my/mau-be-na', 'local.my/mau-sep-tu'] });
    no(!ev.structuredContent.error.details.some(d => d.path === 'steps[0].action'), 'lỗi kịch bản phải chỉ đường dẫn steps[i].field: ' + JSON.stringify(ev.structuredContent.error.details));
    const cf = await m.callTool('import_project', { bundle: sample('van-phong-vui') });
    no(cf.structuredContent.error.code !== 'CONFLICT' || !Array.isArray(cf.structuredContent.conflicts), 'nhập trùng phải là CONFLICT kèm conflicts');
    console.log('   ✓ hợp đồng lỗi: ' + calls.length + ' lời gọi hỏng ở mọi tool có thể thất bại → [CODE] + error{code,message,details,hint} (' + Object.entries(codes).map(([k, v]) => k + ' ' + v).join(', ') + ') · lỗi kịch bản chỉ steps[i].field · nhập trùng = CONFLICT');
  }
})().catch(e => { console.log('   ✗', e.stack || e.message); process.exit(1); });
