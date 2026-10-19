// gen-chibi — test 2n: thư viện âm thanh NỐI VÀO APP (v0.18): nạp engine · lược đồ / bộ kiểm đạo diễn theo thư viện · bộ phát tự gán theo dự án + không khí ·
// gói động tác gọi tên âm · store · MCP 6 tool · lint khi lưu (save_shot / save_work) · HTTP /api/sound-packs · gói dự án (sao lưu / nhập / bán, tự đủ, chặn bán theo
// nội dung) · bộ mẫu Tam Quốc · hướng dẫn agent một nguồn. Phần dữ liệu thuần của thư viện (cổng kiểm, tự gán, luật S1–S7) ở tools/test-sounds.js (2m).
// Chạy: node tools/test-sounds-app.js (bash tools/test.sh gọi; GC_SOUNDS_PORT đổi cổng HTTP, mặc định 7812). Viết tách tệp để khỏi vướng nháy đơn trong node -e (L-56).
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { MCP, TOOLS } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js'), Agent = require(ROOT + '/server/agent.js');
const SOUNDS_SRC = fs.readFileSync(path.join(ROOT, 'engine/sounds.js'), 'utf8');
let n = 0;
const FAILS = [];   // GC_KEEP_GOING=1: không thoát ở lỗi đầu — in hết để thấy ca nào đỏ trên mã cũ (thử ngược)
const no = (c, msg) => { if (c) { console.log('   ✗', msg); if (!process.env.GC_KEEP_GOING) process.exit(1); FAILS.push(msg); return; } n++; };
const clone = o => JSON.parse(JSON.stringify(o));
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const TQ = read('kinds/sound/tq-am.json'), TQB = read('studio/mau/tam-quoc.json');
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gc-snd-'));
const fresh = dir => { const GC = loadEngine(ROOT), store = new Store(dir || tmpDir()); return { GC, S: GC.sounds, store, m: new MCP({ engine: GC, store, version: 't', system: {} }) }; };
const J = r => (r.structuredContent || JSON.parse(r.content[0].text));
const errOf = r => (r.structuredContent && r.structuredContent.error) || {};
// engine KHÔNG nạp sounds.js (đường dự phòng: bản cũ / trang chủ không nạp thư viện âm)
function engineWithout() {
  const ctx = { window: {}, console }; vm.createContext(ctx);
  ['engine/core.js', 'engine/voices.js', 'engine/choreo.js', 'kinds/character/gen.core.js', 'kinds/khung/gen.khung.js', 'kinds/character/gen.choreo.js', 'engine/player.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return ctx.window.GenChibi;
}
// gói âm nhỏ dựng nhanh (cổng thật vẫn chạy trên nó)
const snd = (label, cat, extra) => Object.assign({ label, cat, use: 'thử', tags: ['thử'], dur: 0.5, level: 0.8, layers: [{ k: 'tone', hz: 440, dur: 0.3, peak: 0.4 }] }, extra || {});
const pk = (id, project, sounds, extra) => Object.assign({ format: 'gen-chibi.sound/1', id, name: id, project, status: 'draft', sounds }, extra || {});
const FRAME_STEPS = [{ actor: 'ma-no-canh', state: 'normal', say: 'Chào bạn.' }, { actor: 'ma-no-canh', state: 'shock', say: 'Ồ!' }];

(async () => {
  // ---------- 1. nạp engine + lược đồ / bộ kiểm / lời nhắc đạo diễn + gói động tác theo thư viện
  {
    const GC = loadEngine(ROOT), S = GC.sounds;
    no(!S || S.names().length !== 62 || !S.packs().some(p => p.id === 'gen.am' && p.frame), 'server nạp engine/sounds.js: GC.sounds + bộ khung gen.am (62 âm) luôn có');
    no(typeof GC.film.moodOf !== 'function', 'GC.film.moodOf phải lộ ra (lint theo không khí)');
    const html = fs.readFileSync(path.join(ROOT, 'studio/index.html'), 'utf8'), ord = ['engine/core.js', 'engine/voices.js', 'engine/sounds.js', 'engine/audio.js', 'engine/player.js'].map(f => html.indexOf('src="' + f + '"'));
    no(ord.some(i => i < 0) || ord.some((v, i) => i && v < ord[i - 1]), 'studio/index.html nạp engine/sounds.js sau core.js + voices.js, trước audio.js / player.js');
    const M = GC.ASSETS['gen.khung/ma-no-canh'], sch = GC.director.schema([M]).properties.steps.items.properties.sfx.items.enum;
    no(sch.length !== 62 || !sch.includes('wham') || !sch.includes('pop'), 'lược đồ đạo diễn: step.sfx = mọi âm của thư viện (62): ' + sch.length);
    // lược đồ theo DỰ ÁN của dàn diễn viên (không phình theo gói dự án khác): gói Tam Quốc chỉ hiện khi dàn có asset của dự án đó
    S.registerPack(clone(TQ));
    const tqCast = [Object.assign({}, M, { id: 'x', project: 'mau-tam-quoc' })];
    const e1 = GC.director.schema([M]).properties.steps.items.properties.sfx.items.enum, e2 = GC.director.schema(tqCast).properties.steps.items.properties.sfx.items.enum;
    no(e1.includes('trong-tran') || !e2.includes('trong-tran') || e2.length !== 69, 'lược đồ: âm Tam Quốc chỉ trong dàn của dự án Tam Quốc (' + e1.length + ' / ' + e2.length + ')');
    const ev = steps => ({ title: 't', steps });
    const ok1 = GC.director.validate(ev([{ actor: 'ma-no-canh', state: 'normal', say: 'a', sfx: ['wham', 'ta-da', 'hit'] }]), [M]);
    no(ok1.length, 'sfx bằng tên thư viện (cả tên cũ) phải đạt: ' + ok1);
    const bad = GC.director.validate(ev([{ actor: 'ma-no-canh', state: 'normal', say: 'a', sfx: ['bonkk'] }]), [M]);
    no(bad.length !== 1 || !/^steps\[0\]\.sfx: âm "bonkk" không có trong thư viện âm — gần nhất: "bonk"/.test(bad[0]), 'âm lạ: lỗi có path + gợi ý tên gần nhất: ' + bad);
    no(GC.director.validate(ev([{ actor: 'ma-no-canh', state: 'normal', say: 'a', sfx: ['pop', 'hit', 'tick', 'gong'] }]), [M]).length !== 1, 'sfx > 3 vẫn bị chặn');
    no(GC.director.validate(ev([{ actor: 'ma-no-canh', state: 'normal', say: 'a', sfx: [] }]), [M]).length, 'sfx: [] (bước im) hợp lệ');
    const pr = GC.director.prompt([M]);
    no(!/sfx \(tuỳ chọn/.test(pr) || !/Va chạm & đánh: .*wham/.test(pr) || !/để TRỐNG gần hết các bước/.test(pr) || /- sfx: pop, whoosh/.test(pr), 'lời nhắc đạo diễn: âm theo nhóm + dặn để trống gần hết các bước');
    no(/trong-tran/.test(pr) || !/trong-tran/.test(GC.director.prompt(tqCast)), 'lời nhắc đạo diễn theo dự án của dàn diễn viên');
    // đường dự phòng: không có sounds.js → 17 tên cũ như trước
    const G0 = engineWithout(), M0 = G0.ASSETS['gen.khung/ma-no-canh'];
    no(G0.sounds !== undefined, 'engineWithout phải không có GC.sounds');
    no(G0.director.validate(ev([{ actor: 'ma-no-canh', state: 'normal', say: 'a', sfx: ['pop', 'gong'] }]), [M0]).length !== 0 || G0.director.validate(ev([{ actor: 'ma-no-canh', state: 'normal', say: 'a', sfx: ['wham'] }]), [M0]).length !== 1, 'thiếu sounds.js: step.sfx chỉ nhận 17 tên cũ (phim / kịch bản cũ chạy như cũ)');
    no(G0.director.schema([M0]).properties.steps.items.properties.sfx.items.enum.length !== 17 || !/- sfx: pop, whoosh/.test(G0.director.prompt([M0])), 'thiếu sounds.js: lược đồ + lời nhắc giữ 17 tên cũ');
    // gói động tác: sự kiện gọi tên âm trong thư viện (17 tên cũ vẫn hợp lệ); gói âm của dự án phải nạp trước
    const mp = (project, sfx) => ({ id: 'ci-am-dt', project, poses: { aa: { $: 'guard', armR: { rot: 40 } } }, clips: { cc: { keys: [[0, 'aa'], [0.3, 'guard']], events: [[0.2, { hit: true, sfx }]] } }, actions: { ciHit: { attack: true, clips: ['cc'] } } });
    const C = GC.choreo;
    no(C.checkPack(mp('', 'wham')).errors.length || C.checkPack(mp('', ['hit', 'ta-da'])).errors.length, 'gói động tác gọi âm của thư viện (tên mới + tên cũ) phải qua cổng');
    const e3 = C.checkPack(mp('', 'bonkk')).errors;
    no(e3.length !== 1 || !/^clips\.cc\.events\[0\]\.sfx: âm "bonkk" không có trong thư viện âm của gói dùng chung/.test(e3[0]), 'âm lạ trong sự kiện gói động tác bị chặn đúng chỗ: ' + e3);
    no(C.checkPack(mp('mau-tam-quoc', 'trong-tran')).errors.length, 'gói động tác của dự án Tam Quốc gọi âm của gói âm dự án đó phải qua');
    no(!C.checkPack(mp('', 'trong-tran')).errors.length || !C.checkPack(mp('khac', 'trong-tran')).errors.length, 'gói động tác không thuộc dự án đó KHÔNG gọi được âm của gói dự án khác (S6)');
    no(!C.checkPack(mp('', ['hit', 'ta-da', 'pop', 'gong'])).errors.length, 'sfx sự kiện > 3 vẫn bị chặn');
    no(G0.choreo.checkPack(mp('', 'pop')).errors.length || !G0.choreo.checkPack(mp('', 'wham')).errors.length, 'thiếu sounds.js: gói động tác chỉ nhận 17 tên cũ');
    console.log('   ✓ nạp engine: GC.sounds ở server + trình duyệt (đúng thứ tự thẻ) · lược đồ / bộ kiểm / lời nhắc đạo diễn theo thư viện và theo dự án của dàn diễn viên (lỗi có path + gợi ý) · gói động tác gọi tên âm (17 tên cũ vẫn hợp lệ, gói dự án khác bị chặn) · thiếu sounds.js thì chạy như cũ');
  }

  // ---------- 2. bộ phát (direct): tự gán theo thư viện + dự án + không khí; sfx ghi tay; âm của bước ra đòn không lời
  {
    const { GC, S, m } = fresh(); m.importProject(clone(TQB), {});
    const works = m.store.getWork('tq-vuon-dao-xich-bich'), shot = id => works.shots.find(s => s.id === id), lines = pl => pl.beats.filter(b => b.type === 'line');
    const p1 = GC.film.direct(shot('canh-1'));
    no(p1.project !== 'mau-tam-quoc' || p1.mood !== 'epic', 'direct(): dự án suy ra từ bối cảnh / diễn viên + không khí: ' + p1.project + ' / ' + p1.mood);
    const l1 = lines(p1);
    no(!l1[2].sfx.includes('tu-va') || l1[2].say !== '' || l1[3].sfx.length !== 0 || l1[4].sfx.length !== 0, 'Vườn đào: tù và (vow + hùng tráng, tự gán) vang ở BƯỚC IM trước lời thề — không đè lời (S3, CNS-103); lời thề và câu đáp sfx: [] im: ' + JSON.stringify(l1.map(l => [l.say.slice(0, 8), l.sfx])));
    const pd = GC.film.direct(shot('canh-dau-tap')), act = pd.beats.filter(b => b.type === 'act');
    no(act.length !== 4 || JSON.stringify(act.map(b => b.sfx)) !== '[[],["trong-tran"],[],[]]' || lines(pd).some(l => l.sfx.includes('trong-tran')), 'Đấu tập: trống trận gắn vào bước ra đòn KHÔNG lời (beat act.sfx), không lặp ở dòng thoại: ' + JSON.stringify(act.map(b => b.sfx)));
    no(JSON.stringify(lines(GC.film.direct(shot('canh-4')))[0].sfx) !== '["vo-ngua"]' || JSON.stringify(lines(GC.film.direct(shot('canh-5')))[4].sfx) !== '["ngua-hi"]', 'sfx ghi tay bằng tên âm của gói dự án vào kế hoạch dàn dựng');
    // chỉ định dự án: người gọi > shot.project > suy ra
    const sh = clone(shot('canh-1')), line2 = o => lines(GC.film.direct(sh, o))[2].sfx;
    no(line2({ project: '' }).includes('tu-va') || !line2().includes('tu-va') || !line2({ project: 'mau-tam-quoc' }).includes('tu-va'), 'opts.project thắng dự án suy ra: gói Tam Quốc chỉ khi đúng dự án');
    sh.project = 'khac'; no(line2().includes('tu-va'), 'shot.project thắng dự án suy ra'); delete sh.project;
    // thư viện quyết, không còn bảng cứng: đổi cue của khung → bộ phát đổi theo (cùng engine) — và khớp cueFor
    const F = GC.ASSETS['gen.khung/ma-no-canh'], fs1 = { id: 'f', title: 'f', scene: 'gen.khung/san-khau-chuan', cast: [F.key], event: { title: 'f', scene: 'gen.khung/san-khau-chuan', steps: [
      { actor: 'ma-no-canh', state: 'shock', say: 'Ồ!' }, { actor: 'ma-no-canh', state: 'proud', say: 'Hay!', fx: ['sparkles'] }, { actor: 'ma-no-canh', state: 'normal', activity: 'jump', say: 'Hop!' }, { actor: 'ma-no-canh', state: 'normal', say: 'x', sfx: ['bonk'] }] } };
    const pf = GC.film.direct(fs1), lf = lines(pf);
    no(pf.project !== '' || lf.some((l, i) => i < 3 && JSON.stringify(l.sfx) !== JSON.stringify(S.cueFor({ state: fs1.event.steps[i].state, fx: fs1.event.steps[i].fx, activity: fs1.event.steps[i].activity, mood: pf.mood, project: '' }))) || JSON.stringify(lf[3].sfx) !== '["bonk"]', 'bước thường: line.sfx = GC.sounds.cueFor({state, fx, activity, mood, project}); sfx ghi tay giữ nguyên: ' + JSON.stringify(lf.map(l => l.sfx)));
    // thiếu sounds.js: bảng cứng cũ
    const G0 = engineWithout(), P0 = G0.film.direct(Object.assign(clone(fs1), { cast: ['gen.khung/ma-no-canh'] })), l0 = lines(P0);
    no(JSON.stringify(l0.slice(0, 3).map(l => l.sfx)) !== '[["sting"],["sparkle"],["boing"]]', 'thiếu sounds.js: bộ phát tự gán đúng bảng cũ (shock → sting · proud + sparkles → sparkle · jump → boing): ' + JSON.stringify(l0.map(l => l.sfx)));
    console.log('   ✓ bộ phát: âm tự gán = GC.sounds.cueFor theo state / fx / activity + không khí + dự án (suy ra từ bối cảnh / diễn viên, hoặc chỉ định) · sfx ghi tay (cả gói dự án) vào kế hoạch · bước ra đòn không lời có sfx riêng · thiếu sounds.js → bảng cũ');
  }

  // ---------- 3. MCP: 52 tool, 6 tool âm thanh (danh sách · chuẩn · gói · kiểm · lưu · chấm luật), lưu bền, nạp lại, cảnh báo âm bị bỏ
  {
    const dir = tmpDir(), { GC, S, store, m } = fresh(dir), call = (t, a) => m.callTool(t, a);
    no(TOOLS.length !== 52 || ['list_sounds', 'get_sound_spec', 'get_sound_pack', 'validate_sound_pack', 'save_sound_pack', 'lint_sound_track'].some(t => !TOOLS.some(x => x.name === t && x.description.length > 150 && /âm/.test(x.description))), 'MCP: 52 tool, 6 tool âm thanh có mô tả tiếng Việt rõ');
    no(TOOLS.filter(t => /sound|lint/.test(t.name)).some(t => t.inputSchema.type !== 'object' || t.inputSchema.additionalProperties !== false), 'inputSchema của tool âm thanh phải là object đóng');
    // list_sounds
    let r = J(await call('list_sounds', {}));
    no(r.count !== 62 || r.cats.length !== 8 || r.packs.length !== 1 || r.sounds.some(x => !x.name || !x.use || !x.label), 'list_sounds: 62 âm, 8 nhóm, mỗi âm có tên + nhãn + dùng khi');
    no(J(await call('list_sounds', { cat: 'danh' })).sounds.some(x => x.cat !== 'danh') || J(await call('list_sounds', { cat: 'danh' })).count !== 8, 'list_sounds lọc theo nhóm');
    no(!J(await call('list_sounds', { tag: 'mộc cầm' })).sounds.length || J(await call('list_sounds', { q: 'sam set' })).sounds[0].name !== 'sam', 'list_sounds lọc theo thẻ / chữ bỏ dấu');
    const ec = await call('list_sounds', { cat: 'khong-co' });
    no(!ec.isError || errOf(ec).code !== 'NOT_FOUND' || !errOf(ec).allowed.includes('danh'), 'list_sounds nhóm lạ: NOT_FOUND kèm danh sách nhóm');
    // get_sound_spec: nguồn là engine (không chép tay)
    const sp = J(await call('get_sound_spec', {}));
    no(sp.format !== 'gen-chibi.sound/1' || sp.rules.map(x => x.code).join() !== 'S1,S2,S3,S4,S5,S6,S7' || sp.recipes.length < 5 || sp.budget.nodes !== 60 || sp.legacy.length !== 17 || !sp.workflow || !sp.hearing || JSON.stringify(sp.rules) !== JSON.stringify(S.RULES.list), 'get_sound_spec: chuẩn + 7 luật + công thức + ngân sách, sinh từ engine');
    const vx = await call('validate_sound_pack', { pack: sp.example });
    no(vx.isError || !J(vx).ok || J(vx).sounds !== 2, 'ví dụ trong get_sound_spec chạy được qua validate_sound_pack');
    // get_sound_pack
    r = J(await call('get_sound_pack', { id: 'gen.am' }));
    no(Object.keys(r.sounds).length !== 62 || r.format !== 'gen-chibi.sound/1' || S.validateSoundPack(r, { frame: true }).errors.length, 'get_sound_pack gen.am: bộ chuẩn, nạp lại được qua cổng');
    r = J(await call('get_sound_pack', { id: 'gen.am', names: ['bonk', 'zip'] }));
    no(Object.keys(r.sounds).join() !== 'bonk,zip' || !r.partial, 'get_sound_pack names: chỉ các âm xin (làm mẫu)');
    const e404 = await call('get_sound_pack', { id: 'khong-co' }), e405 = await call('get_sound_pack', { id: 'gen.am', names: ['khong-co'] });
    no(errOf(e404).code !== 'NOT_FOUND' || !errOf(e404).allowed.includes('gen.am') || errOf(e405).code !== 'NOT_FOUND', 'get_sound_pack lạ: NOT_FOUND kèm danh sách');
    // validate_sound_pack: lỗi có path, trùng tên chỉ ra gói, không lưu gì
    const base = () => pk('ci-am', 'p1', { 'ci-bop': snd('Bốp', 'hai', { cue: { event: ['impact'], mood: ['comic'] } }), 'ci-ting': snd('Ting', 'nhac-cu') });
    let v = await call('validate_sound_pack', { pack: Object.assign(base(), { sounds: { 'ci-bop': snd('Bốp', 'hai', { layers: [{ k: 'tone', hz: 440, dur: 0.3, peak: 0.4, fo: 1 }] }) } }) });
    no(!v.isError || errOf(v).code !== 'VALIDATION_FAILED' || !errOf(v).details.some(d => d.path === 'sounds.ci-bop.layers[0].fo' && /khoá lạ/.test(d.message)), 'validate_sound_pack: lỗi có path tới trường sai: ' + v.content[0].text.slice(0, 200));
    v = await call('validate_sound_pack', { pack: pk('ci-trung', 'p1', { hit: snd('Hit', 'danh') }) });
    no(!v.isError || !errOf(v).details.some(d => d.path === 'sounds.hit' && /trùng tên âm của gói "gen\.am"/.test(d.message)), 'validate_sound_pack: trùng tên với khung → chỉ ra gói gen.am');
    v = await call('validate_sound_pack', { pack: Object.assign(base(), { id: 'gen.am' }) });
    no(!v.isError || !/gen\./.test(v.content[0].text), 'không đặt id gen.am (tiền tố dành cho khung)');
    v = await call('validate_sound_pack', { pack: pk('ci-chung', '', { 'ci-x': snd('X', 'hai', { cue: { state: ['shock'] } }) }) });
    no(!v.isError || !errOf(v).details.some(d => d.path === 'sounds.ci-x.cue' && /gói dùng chung không được đổi âm tự gán của khung/.test(d.message)), 'gói dùng chung có cue là LỖI có path (CNS-100: không đổi âm tự gán của khung ở mọi dự án): ' + v.content[0].text.slice(0, 200));
    no(S.has('ci-bop') || store.listSoundPacks().length, 'validate_sound_pack không được lưu / nạp gì');
    // save_sound_pack → phiên bản, tệp trên đĩa qua cổng, nạp lại ở máy khác
    await call('save_project', { id: 'p1', name: 'P1' }); await call('save_project', { id: 'p2', name: 'P2' });
    let sv = await call('save_sound_pack', { pack: base(), note: 'v1' });
    no(sv.isError || !J(sv).saved || J(sv).version !== 1 || !S.has('ci-bop') || S.get('ci-bop').pack !== 'ci-am', 'save_sound_pack: lưu + nạp ngay: ' + sv.content[0].text.slice(0, 200));
    const file = path.join(dir, 'soundpacks', 'ci-am.json'), rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    no(rec.version !== 1 || rec.note !== 'v1' || !rec.savedAt || S.validateSoundPack(rec).errors.length || /"nodes"|"pack"/.test(JSON.stringify(rec)), 'tệp gói âm trên đĩa: bản xuất sạch (không nodes / pack nội bộ), nạp lại được qua cổng, có phiên bản + ghi chú');
    sv = await call('save_sound_pack', { pack: base(), note: 'v2' });
    no(J(sv).version !== 2 || !fs.existsSync(path.join(dir, 'versions', 'soundpacks~ci-am', '1.json')) || S.packs().find(p => p.id === 'ci-am').version !== 2, 'lưu lại cùng id = phiên bản 2, bản 1 giữ trong lịch sử');
    const m2 = new MCP({ engine: loadEngine(ROOT), store: new Store(dir), version: 't', system: {} });
    no(!m2.GC.sounds.has('ci-bop') || m2.GC.sounds.packs().find(p => p.id === 'ci-am').version !== 2, 'khởi động lại: gói âm đã lưu được nạp (trước gói động tác)');
    sv = await call('save_sound_pack', { pack: pk('ci-am-2', 'p1', { 'ci-bop': snd('Bốp 2', 'hai') }) });
    no(!sv.isError || !/trùng tên âm của gói "ci-am"/.test(sv.content[0].text) || S.packs().some(p => p.id === 'ci-am-2') || store.listSoundPacks().length !== 1, 'save_sound_pack: trùng tên âm bị từ chối, không để dấu vết');
    const nop = base(); delete nop.project; sv = await call('save_sound_pack', { pack: nop });
    no(J(sv).version !== 3 || S.pack('ci-am').project !== 'p1', 'bản sửa không gửi "project" vẫn giữ dự án (không lặng lẽ đẩy gói ra khỏi dự án)');
    // lint_sound_track: mọi dạng đầu vào, lỗi có path, cảnh báo thì ok
    const W = [{ say: '', sfx: ['wham'] }];
    let L = await call('lint_sound_track', { steps: W });
    no(L.isError || !J(L).ok || J(L).warnings !== 1 || J(L).issues[0].code !== 'S4' || J(L).issues[0].path !== 'steps[0].sfx[0]', 'lint_sound_track chỉ có cảnh báo (S4) → ok: true + issues kèm path: ' + L.content[0].text.slice(0, 160));
    L = await call('lint_sound_track', { steps: [{ say: '', sfx: ['bonkk'] }] });
    no(!L.isError || errOf(L).code !== 'VALIDATION_FAILED' || !errOf(L).details.some(d => d.path === 'steps[0].sfx[0]' && /gần nhất: "bonk"/.test(d.message)) || !/"ok":\s*false/.test(L.content[0].text) || !L.structuredContent.issues.length, 'lint_sound_track có lỗi (S6) → [VALIDATION_FAILED] + path + gợi ý + issues');
    const evS = { title: 't', steps: [{ actor: 'a', state: 'normal', say: '', sfx: ['bonkk'] }] };
    L = await call('lint_sound_track', { event: evS }); const L2 = await call('lint_sound_track', { shot: { event: evS } });
    no(!errOf(L).details.some(d => d.path === 'event.steps[0].sfx[0]') || !errOf(L2).details.some(d => d.path === 'event.steps[0].sfx[0]'), 'lint_sound_track nhận event / shot (path event.steps[i].sfx[k])');
    no(!errOf(await call('lint_sound_track', { steps: [{ say: '', sfx: ['ci-bop'] }] })).details.some(d => /gói "ci-am" của dự án khác/.test(d.message)) || (await call('lint_sound_track', { steps: [{ say: '', sfx: ['ci-bop'] }], project: 'p1' })).isError, 'lint theo dự án: âm của gói dự án p1 chỉ hợp lệ khi project = p1 (S6)');
    const th = Array.from({ length: 4 }, () => ({ say: 'Để xem nào.', state: 'think' }));
    no(J(await call('lint_sound_track', { steps: th })).issues.every(x => x.code !== 'S5') || J(await call('lint_sound_track', { steps: th, auto: false })).issues.length, 'lint_sound_track: auto = false bỏ qua âm tự gán');
    no(errOf(await call('lint_sound_track', {})).code !== 'BAD_REQUEST' || errOf(await call('lint_sound_track', { work: 'khong-co' })).code !== 'NOT_FOUND', 'lint_sound_track thiếu đầu vào → BAD_REQUEST; tác phẩm lạ → NOT_FOUND');
    // save_shot / save_work chạy lint: lỗi → từ chối có path; cảnh báo → trả kèm; âm gói dự án chỉ trong dự án đó
    await call('save_work', { id: 'phim-ci', title: 'Phim CI', project: 'p1' }); await call('save_work', { id: 'phim-p2', title: 'Phim P2', project: 'p2' });
    const shotOf = (sfx, extra) => ({ title: 'Cảnh', scene: 'gen.khung/san-khau-chuan', cast: ['ma-no-canh'], event: { title: 'Cảnh', steps: [Object.assign({ actor: 'ma-no-canh', state: 'normal', say: 'Chào.', sfx }, extra || {})] } });
    let sh = await call('save_shot', { work: 'phim-ci', shot: Object.assign({ id: 'canh-1' }, shotOf(['ci-bop'])) });
    no(sh.isError || !J(sh).hasEvent || J(sh).warnings, 'save_shot: âm của gói dự án p1 dùng được trong tác phẩm của dự án p1: ' + sh.content[0].text.slice(0, 160));
    sh = await call('save_shot', { work: 'phim-p2', shot: Object.assign({ id: 'canh-1' }, shotOf(['ci-bop'])) });
    no(!sh.isError || !errOf(sh).details.some(d => d.path === 'shot.event.steps[0].sfx[0]' && /S6.*gói "ci-am" của dự án khác/.test(d.message)) || !/"saved":\s*false/.test(sh.content[0].text) || m.store.getWork('phim-p2').shots.length, 'save_shot: âm của dự án khác bị từ chối ở shot.event.steps[0].sfx[0] (S6), không lưu');
    sh = await call('save_shot', { work: 'phim-p2', shot: Object.assign({ id: 'canh-2' }, shotOf(['ding', 'ta-da'])) });
    no(!sh.isError || !errOf(sh).details.some(d => /^shot\.event\.steps\[0\]\.sfx\[1\]$/.test(d.path) && /S1/.test(d.message)), 'save_shot: hai âm nhấn một bước (S1) bị từ chối, path chỉ đúng âm thứ hai');
    sh = await call('save_shot', { work: 'phim-p2', shot: Object.assign({ id: 'canh-3' }, shotOf(['sting'])) });
    no(sh.isError || !J(sh).saved || !(J(sh).warnings || []).some(x => /^event\.steps\[0\]\.sfx\[0\]: S3/.test(x)), 'save_shot: S3 chỉ là cảnh báo — lưu được, trả kèm warnings: ' + sh.content[0].text.slice(0, 200));
    let sw = await call('save_work', { id: 'phim-p2', logline: 'x' });
    no(sw.isError || !(J(sw).warnings || []).some(x => /^shots\[0\]\.event\.steps\[0\]\.sfx\[0\]: S3/.test(x)), 'save_work: chạy lint mọi phân cảnh, cảnh báo trả kèm: ' + sw.content[0].text.slice(0, 200));
    sw = await call('save_work', { id: 'phim-ci', project: 'p2' });
    no(!sw.isError || !errOf(sw).details.some(d => d.path === 'shots[0].event.steps[0].sfx[0]' && /S6/.test(d.message)) || m.store.getWork('phim-ci').project !== 'p1', 'save_work: đổi dự án làm âm của gói dự án cũ thành S6 → từ chối có path, không đổi dự án');
    sw = await call('save_work', { id: 'phim-ci', logline: 'vẫn lưu được' });
    no(sw.isError, 'save_work không đổi dự án: lưu bình thường');
    L = await call('lint_sound_track', { work: 'phim-ci' });
    no(L.isError || J(L).project !== 'p1' || J(L).issues.length, 'lint_sound_track work: theo dự án của tác phẩm, sạch');
    L = await call('lint_sound_track', { work: 'phim-ci', project: 'p2' });
    no(!L.isError || !errOf(L).details.some(d => d.path === 'shots[0].event.steps[0].sfx[0]'), 'lint_sound_track work + project khác → S6 có path shots[i].event.steps[j].sfx[k]');
    // đổi gói: bỏ âm mà tác phẩm còn gọi → cảnh báo (không chặn); lint tác phẩm báo S6 từ đó
    sv = await call('save_sound_pack', { pack: pk('ci-am', 'p1', { 'ci-ting': snd('Ting', 'nhac-cu') }) });
    no(sv.isError || !(J(sv).warnings || []).some(x => /tác phẩm phim-ci › phân cảnh canh-1 › bước 1: còn gọi âm "ci-bop"/.test(x)), 'save_sound_pack bỏ âm đang được gọi → warnings nêu tác phẩm / phân cảnh / bước: ' + sv.content[0].text.slice(0, 240));
    no(!errOf(await call('lint_sound_track', { work: 'phim-ci' })).details.some(d => /S6/.test(d.message)), 'sau đó lint tác phẩm báo S6');
    await call('save_sound_pack', { pack: base() });
    // gói động tác gọi âm của gói dự án: nạp lại sau khi khởi động (gói âm trước gói động tác)
    const mpk = { id: 'ci-dt-am', project: 'p1', poses: { aa: { $: 'guard', armR: { rot: 40 } } }, clips: { cc: { keys: [[0, 'aa'], [0.3, 'guard']], events: [[0.2, { hit: true, sfx: 'ci-bop' }]] } }, actions: { ciAmHit: { attack: true, clips: ['cc'] } } };
    const sm = await call('save_motion_pack', { pack: mpk });
    no(sm.isError, 'save_motion_pack gọi âm của gói âm cùng dự án: ' + sm.content[0].text.slice(0, 200));
    const m3 = new MCP({ engine: loadEngine(ROOT), store: new Store(dir), version: 't', system: {} });
    no(!m3.GC.choreo.ACTIONS.ciAmHit, 'khởi động lại: gói động tác gọi âm của gói âm dự án vẫn nạp được (gói âm nạp trước)');
    // get_catalog / start_here nhắc thư viện âm
    const cat = J(await call('get_catalog', {})), sh0 = J(await call('start_here', {}));
    no(cat.sounds.count !== 64 || cat.sounds.cats.length !== 8 || cat.sounds.rules.length !== 7 || !/^S1: /.test(cat.sounds.rules[0]) || cat.sounds.list !== 'list_sounds' || cat.sounds.lint !== 'lint_sound_track', 'get_catalog: thư viện âm (nhóm, số âm, gói, luật S1–S7 lấy từ engine)');
    no(sh0.state.soundPacks !== 2 || sh0.state.sounds !== 64 || !sh0.topics.some(t => t.id === 'sound'), 'start_here: số gói âm / số âm + chủ đề hướng dẫn "sound"');
    no(J(await call('get_motion_spec', {})).sfx.length !== 64, 'get_motion_spec: tên âm lấy từ thư viện (không còn 17 tên cứng)');
    console.log('   ✓ MCP: 52 tool · list_sounds (nhóm / thẻ / chữ / dự án) · get_sound_spec = engine · get_sound_pack (names) · validate_sound_pack (path, trùng tên, không lưu) · save_sound_pack (phiên bản, bản xuất sạch, nạp lại, giữ dự án, cảnh báo bỏ âm) · lint_sound_track (4 dạng đầu vào, lỗi path, cảnh báo ok) · save_shot / save_work chạy S1–S7 · catalog / start_here');
  }

  // ---------- 4. HTTP /api/sound-packs (server thật, cổng 78xx)
  {
    const PORT = +(process.env.GC_SOUNDS_PORT || 7812), H = tmpDir(), BASE = 'http://127.0.0.1:' + PORT, S = loadEngine(ROOT).sounds;
    no(await fetch(BASE + '/api/health').then(() => true, () => false), 'cổng ' + PORT + ' đang bị chiếm (đặt GC_SOUNDS_PORT khác)');
    const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: H, GC_PORT: String(PORT), GC_NO_AUTOCHECK: '1' }), stdio: 'ignore' });
    process.on('exit', () => { try { srv.kill(); } catch (e) { /* đã tắt */ } });   // no() thoát thẳng — không để server mồ côi giữ cổng
    try {
      for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 250)); }
      const api = async (p, o) => { const r = await fetch(BASE + p, o && o.body ? { method: o.method || 'POST', headers: { 'content-type': 'application/json', 'x-gc-request': '1' }, body: JSON.stringify(o.body) } : undefined); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* văn bản */ } return { status: r.status, j, t }; };
      no((await fetch(BASE + '/engine/sounds.js')).status !== 200, 'Studio tải được engine/sounds.js từ server');
      let r = await api('/api/sound-packs');
      no(r.status !== 200 || !Array.isArray(r.j) || r.j.length, 'GET /api/sound-packs: danh sách rỗng lúc đầu');
      const P = pk('ci-http', '', { 'ci-http-bop': snd('Bốp HTTP', 'hai') });
      r = await api('/api/sound-packs', { body: { pack: P, note: 'từ Studio' } });
      no(r.status !== 200 || r.j.id !== 'ci-http' || r.j.version !== 1 || !Array.isArray(r.j.warnings) || S.registerPack(((({ warnings, ...rest }) => rest))(r.j)).errors.length, 'POST /api/sound-packs: lưu qua cổng, trả bản xuất sạch nạp lại được qua GC.sounds.registerPack: ' + r.t.slice(0, 200));
      r = await api('/api/sound-packs', { body: { pack: pk('ci-xau', '', { 'ci-xau-1': snd('Xấu', 'khong-co') }) } });
      no(r.status !== 422 || !Array.isArray(r.j.errors) || !r.j.errors.some(e => /^sounds\.ci-xau-1\.cat/.test(e)), 'POST gói sai → 422 + errors có path: ' + r.t.slice(0, 200));
      r = await api('/api/sound-packs', { body: { pack: pk('ci-trung-http', '', { hit: snd('Hit', 'hai') }) } });
      no(r.status !== 422 || !/trùng tên âm của gói "gen\.am"/.test(r.j.error), 'POST gói trùng tên âm khung → 422 nêu gói giữ tên: ' + r.status + ' ' + r.t.slice(0, 200));
      r = await api('/api/sound-packs', { body: {} });
      no(r.status < 400 || r.status >= 500, 'POST không có pack → lỗi 4xx, server không sập: ' + r.status);
      r = await api('/api/sound-packs');
      no(r.j.length !== 1 || r.j[0].id !== 'ci-http' || r.j[0].version !== 1 || !fs.existsSync(path.join(H, 'data', 'soundpacks', 'ci-http.json')), 'GET /api/sound-packs trả bản đã lưu (Studio nạp lúc mở)');
      // nhập bộ mẫu Tam Quốc qua HTTP: gói âm đi theo gói dự án
      r = await api('/api/projects/import', { body: { bundle: TQB } });
      no(r.status !== 200 || r.j.errors.length || r.j.counts.soundPacks !== 1, 'nhập Tam Quốc qua HTTP: có 1 gói âm: ' + r.t.slice(0, 200));
      r = await api('/api/sound-packs');
      no(!r.j.some(p => p.id === 'tq-am' && p.project === 'mau-tam-quoc' && Object.keys(p.sounds).length === 7), 'gói tq-am trong /api/sound-packs sau khi nhập bộ mẫu');
      // Studio lưu phân cảnh qua HTTP: cảnh báo S2–S5 / S7 đi kèm tác phẩm trả về; lỗi S1 / S6 là 422 có path
      r = await api('/api/works', { body: { title: 'Phim HTTP', project: '' } });
      const hs = (sfx, id) => ({ shot: { id: id, title: 'C', scene: 'gen.khung/san-khau-chuan', cast: ['ma-no-canh'], event: { title: 'C', steps: [{ actor: 'ma-no-canh', state: 'normal', say: 'Chào.', sfx: sfx }] } } });
      no(r.status !== 200 || r.j.id !== 'phim-http', 'tạo tác phẩm qua HTTP: ' + r.t.slice(0, 120));
      r = await api('/api/works/phim-http/shots', { body: hs(['sting'], 'canh-1') });
      no(r.status !== 200 || !(r.j.warnings || []).some(x => /^event\.steps\[0\]\.sfx\[0\]: S3/.test(x)) || r.j.shots.length !== 1, 'POST /api/works/<id>/shots: lưu được, cảnh báo S3 đi kèm tác phẩm: ' + r.t.slice(0, 200));
      r = await api('/api/works/phim-http/shots', { body: hs(['trong-tran'], 'canh-2') });
      no(r.status !== 422 || !r.j.errors.some(e => /^event\.steps\[0\]\.sfx\[0\]: S6.*gói "tq-am" của dự án khác/.test(e)), 'POST shot với âm của dự án khác → 422 + errors[] có path (S6): ' + r.t.slice(0, 200));
      // MCP qua HTTP: 52 tool; hướng dẫn agent
      const rpc = await (await fetch(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_sounds', arguments: { project: 'mau-tam-quoc', cat: 'nhac-cu' } } }) })).json();
      no(!JSON.parse(rpc.result.content[0].text).sounds.some(x => x.name === 'trong-tran'), 'MCP qua HTTP: list_sounds thấy gói Tam Quốc vừa nhập');
      const gd = await fetch(BASE + '/api/agent/guide?topic=sound');
      no(gd.status !== 200 || !/\*\*S1\*\*/.test(await gd.text()), '/api/agent/guide?topic=sound');
    } finally { srv.kill(); }
    console.log('   ✓ HTTP /api/sound-packs (cổng ' + PORT + '): GET / POST qua cổng, 422 có path, trùng tên báo gói giữ tên, lưu bền, Studio tải được engine/sounds.js, nhập Tam Quốc mang gói âm, MCP + hướng dẫn agent qua HTTP');
  }

  // ---------- 5. gói dự án: sao lưu / nhập / bán — gói âm tự đủ; chặn bán theo NỘI DUNG bộ mẫu
  {
    const A = fresh(), { m } = A, call = (t, a) => m.callTool(t, a);
    await call('save_project', { id: 'pa', name: 'PA' });
    await call('save_sound_pack', { pack: pk('pa-am', 'pa', { 'pa-bop': snd('Bốp A', 'hai'), 'pa-ting': snd('Ting A', 'nhac-cu') }, { status: 'published' }) });
    await call('save_sound_pack', { pack: pk('pa-nhap', 'pa', { 'pa-nhap-1': snd('Nháp', 'hai') }) });                         // nháp
    await call('save_sound_pack', { pack: pk('chung-am', '', { 'chung-bop': snd('Chung', 'hai') }, { status: 'published' }) });    // gói dùng chung (không dự án)
    await call('save_work', { id: 'phim-pa', title: 'Phim PA', project: 'pa' });
    const sa = await call('save_shot', { work: 'phim-pa', shot: { id: 'canh-1', title: 'C1', scene: 'gen.khung/san-khau-chuan', cast: ['ma-no-canh'], event: { title: 'C1', steps: [{ actor: 'ma-no-canh', state: 'normal', say: 'Chào.', sfx: ['pa-bop', 'chung-bop'] }] } } });
    no(sa.isError, 'tác phẩm dùng âm của gói dự án + gói dùng chung: ' + sa.content[0].text.slice(0, 160));
    const bk = m.exportProject('pa');
    no(bk.soundPacks.length !== 3 || !bk.soundPacks.some(p => p.id === 'chung-am') || bk.soundPacks.some(p => p.version || p.savedAt || p.note || p.key) || bk.soundPacks.some(p => m.GC.sounds.validateSoundPack(p).errors.length), 'sao lưu: gói âm của dự án + gói dùng chung mà phân cảnh gọi tên (tự đủ), sạch trường nội bộ, qua cổng: ' + bk.soundPacks.map(p => p.id));
    // nhập vào máy sạch: gói âm vào TRƯỚC tác phẩm (S6 tra gói của dự án), thuộc dự án nhập
    const B = fresh(), r = B.m.importProject(clone(bk), {});
    no(r.errors.length || r.counts.soundPacks !== 3 || r.counts.shots !== 1 || !B.S.has('pa-bop') || !B.S.has('chung-bop') || B.S.pack('chung-am').project !== 'pa', 'nhập gói: 3 gói âm vào trước tác phẩm, tác phẩm qua S1–S7: ' + JSON.stringify(r));
    let c = null; try { B.m.importProject(clone(bk), {}); } catch (e) { c = e; }
    no(!c || c.code !== 409 || !c.conflicts.includes('gói âm pa-am'), 'nhập trùng: 409 liệt kê "gói âm pa-am"');
    const r2 = B.m.importProject(clone(bk), { overwrite: true });
    no(r2.errors.length || B.S.packs().find(p => p.id === 'pa-am').version !== 2, 'nhập đè = phiên bản 2 của gói âm');
    const bad = clone(bk); bad.soundPacks[0].sounds[Object.keys(bad.soundPacks[0].sounds)[0]].layers[0].hz = 99999;
    const rb = fresh().m.importProject(bad, {});
    no(!rb.errors.some(e => e.kind === 'soundPacks' && /hz/.test(e.error)), 'gói âm hỏng trong gói dự án bị cổng chặn khi nhập (báo kind soundPacks, path trường): ' + JSON.stringify(rb.errors));
    let e9 = null; try { fresh().m.importProject({ format: 'gen-chibi.project/1', project: { id: 'chin' }, soundPacks: Array.from({ length: 9 }, (x, i) => pk('goi-' + i, 'chin', { ['am-' + i]: snd('x', 'hai') })) }, {}); } catch (e) { e9 = e; }
    no(!e9 || !/soundPacks/.test(e9.message), 'gói dự án có 9 gói âm bị chặn (tối đa 8)');
    // gói bán: chỉ gói PHÁT HÀNH của dự án, không kèm tác phẩm
    const sale = m.exportProject('pa', { sale: true });
    no(sale.soundPacks.length !== 1 || sale.soundPacks[0].id !== 'pa-am' || sale.works.length, 'gói bán: chỉ gói âm đã phát hành của dự án (nháp ở lại máy): ' + sale.soundPacks.map(p => p.id));
    // bộ mẫu: dấu nguồn gốc, chặn bán theo NỘI DUNG (đổi tên gói / tên âm / nhãn vẫn bị nhận ra)
    const T = fresh(); T.m.importProject(clone(TQB), {});
    no(!T.store.provenance()['sound:tq-am'] || T.store.provenance()['sound:tq-am'].owner !== 'Gen Labs', 'nhập bộ mẫu: gói âm mang dấu nguồn gốc Gen Labs');
    const tqBk = T.m.exportProject('mau-tam-quoc');
    no(tqBk.soundPacks.length !== 1 || tqBk.soundPacks[0].id !== 'tq-am' || !tqBk.sample || !tqBk.provenance['sound:tq-am'], 'sao lưu bộ mẫu mang gói âm + dấu');
    await T.m.callTool('save_project', { id: 'cua-toi', name: 'Của tôi' });
    const cp = clone(TQ); cp.id = 'am-chep'; cp.project = 'cua-toi'; cp.status = 'published'; cp.sounds = {};
    Object.keys(TQ.sounds).forEach(k => { cp.sounds[k + '-chep'] = Object.assign(clone(TQ.sounds[k]), { label: 'Chép ' + k, tags: ['chép'], use: 'bản chép' }); delete cp.sounds[k + '-chep'].cue; });
    const sc = await T.m.callTool('save_sound_pack', { pack: cp });
    no(sc.isError, 'gói chép nội dung tq-am lưu được (đổi tên âm / gói): ' + sc.content[0].text.slice(0, 200));
    let es = null; try { T.m.exportProject('cua-toi', { sale: true }); } catch (e) { es = e; }
    no(!es || es.code !== 403 || !/bộ mẫu Gen Labs/.test(es.message) || !/am-chep/.test(es.message), 'gói bán có âm chép từ bộ mẫu (đổi tên, đổi nhãn) bị chặn 403 theo nội dung: ' + (es && es.message));
    const bk2 = T.m.exportProject('cua-toi'); delete bk2.provenance;   // gỡ tay dấu trong gói: nhập ở máy khác vẫn bị nhận ra theo hình công thức
    const T2 = fresh(); no(T2.m.importProject(clone(bk2), {}).errors.length, 'nhập gói sao lưu đã gỡ dấu lỗi');
    let es2 = null; try { T2.m.exportProject('cua-toi', { sale: true }); } catch (e) { es2 = e; }
    no(!es2 || es2.code !== 403, 'gỡ dấu + nhập ở máy khác: gói bán vẫn bị chặn theo nội dung công thức');
    const own = pk('am-rieng', 'cua-toi', { 'rieng-bop': snd('Riêng', 'hai', { layers: [{ k: 'tone', hz: 333, dur: 0.3, peak: 0.4 }, { k: 'noise', col: 'pink', type: 'lowpass', f0: 900, dur: 0.2, peak: 0.2 }] }) }, { status: 'published' });
    await T.m.callTool('save_sound_pack', { pack: Object.assign({}, cp, { status: 'draft' }) });
    await T.m.callTool('save_sound_pack', { pack: own });
    const sale2 = T.m.exportProject('cua-toi', { sale: true });
    no(sale2.soundPacks.length !== 1 || sale2.soundPacks[0].id !== 'am-rieng', 'gói bán sau khi gói chép về nháp: chỉ còn gói âm riêng đã phát hành');
    console.log('   ✓ gói dự án: sao lưu mang gói âm của dự án + gói dùng chung được gọi tên (tự đủ) · nhập: gói âm trước tác phẩm, trùng → 409, đè → phiên bản 2, gói hỏng bị cổng chặn, ≤ 8 gói · gói bán chỉ gói phát hành · bộ mẫu: dấu nguồn gốc + chặn bán theo nội dung (đổi tên không lách được)');
  }

  // ---------- 6. bộ mẫu Tam Quốc: gói âm + phân cảnh gán âm, lint sạch; phiên bản bộ mẫu đổi
  {
    const { S, m } = fresh(), r = m.importProject(clone(TQB), {});
    no(r.errors.length || r.counts.soundPacks !== 1, 'Tam Quốc nhập được cùng gói âm: ' + JSON.stringify(r));
    no(!TQB.soundPacks || TQB.soundPacks.length !== 1 || TQB.soundPacks[0].id !== 'tq-am' || TQB.soundPacks[0].project !== 'mau-tam-quoc' || JSON.stringify(Object.keys(TQB.soundPacks[0].sounds)) !== JSON.stringify(Object.keys(TQ.sounds)), 'gói mẫu mang đúng kinds/sound/tq-am.json');
    const L = m.callTool('lint_sound_track', { work: 'tq-vuon-dao-xich-bich' });
    const lr = J(await L);
    no(lr.project !== 'mau-tam-quoc' || lr.issues.length, 'phim Tam Quốc qua lintSoundTrack SẠCH (0 lỗi, 0 cảnh báo): ' + JSON.stringify(lr.issues));
    const used = [].concat(...TQB.works[0].shots.map(s => [].concat(...s.event.steps.map(x => x.sfx || []))));
    no(JSON.stringify(used.sort()) !== JSON.stringify(['ngua-hi', 'trong-tran', 'vo-ngua']), 'phân cảnh gán âm Tam Quốc (trống trận ở đấu tập, vó ngựa báo tin, ngựa hí ở Xích Bích): ' + used);
    const ver = (fs.readFileSync(path.join(ROOT, 'studio/app.js'), 'utf8').match(/id: 'mau-tam-quoc', file: 'tam-quoc', version: '([^']+)'/) || [])[1];
    no(TQB.sample.version !== ver || TQB.sample.version === '2026.10.19-giong', 'phiên bản bộ mẫu đã đổi (nút ⟳ Cập nhật Tam Quốc hiện) và khớp studio/app.js: ' + TQB.sample.version + ' / ' + ver);
    console.log('   ✓ bộ mẫu Tam Quốc: kèm gói âm tq-am (7 âm), 3 phân cảnh gán âm, lintSoundTrack sạch, phiên bản mẫu ' + TQB.sample.version + ' khớp Studio');
  }

  // ---------- 7. hướng dẫn agent: một nguồn với engine
  {
    const { GC } = fresh(), g = Agent.guide('sound'), S = GC.sounds;
    no(!g || S.RULES.list.some(r => g.indexOf('**' + r.code + '**') < 0 || g.indexOf(r.rule) < 0), 'hướng dẫn "sound" chứa NGUYÊN VĂN 7 luật từ engine (sinh lúc chạy)');
    no(S.RECIPES.some(r => g.indexOf('`' + r.id + '`') < 0 || g.indexOf(r.label) < 0) || S.CATS.some(c => g.indexOf('`' + c[0] + '`') < 0), 'hướng dẫn "sound" chứa công thức mẫu + nhóm từ engine');
    no(/<!-- (example|generated):/.test(g), 'hướng dẫn "sound" không còn chỗ nhúng chưa thay');
    no(!Agent.topics().some(t => t.id === 'sound' && /sound library/.test(t.title)) || !/\| `sound` \|/.test(Agent.guide('guide')), 'chủ đề sound có trong danh sách + bảng GUIDE.md');
    const doc = fs.readFileSync(path.join(ROOT, 'docs/HUONG-DAN.md'), 'utf8');
    no(S.RULES.list.some(r => doc.indexOf('**' + r.code + '**') < 0) || S.CATS.some(c => doc.indexOf(c[1]) < 0) || S.RECIPES.some(r => r.seq.some(x => doc.indexOf(x[1]) < 0 && r.id === 'vo-chuoi')), 'docs/HUONG-DAN.md nhắc đủ 7 luật S1–S7 + 8 nhóm âm (lệch engine là đỏ)');
    const man = fs.readFileSync(path.join(ROOT, 'ASSET_MANIFEST.md'), 'utf8');
    no(!/gen\.am/.test(man) || !/kinds\/sound/.test(man) || !/không có tệp mẫu âm thanh/.test(man), 'ASSET_MANIFEST.md ghi nguồn + license âm thanh (tổng hợp bằng code, không tệp mẫu)');
    console.log('   ✓ hướng dẫn agent: luật S1–S7 / nhóm / công thức sinh từ engine (một nguồn) · chủ đề sound · docs / manifest khớp');
  }
  console.log('   (' + n + ' kiểm tra)');
  if (FAILS.length) { console.log('   ✗ ' + FAILS.length + ' kiểm tra đỏ'); process.exit(1); }
})().catch(e => { console.log('   ✗ ngoại lệ:', e.stack); process.exit(1); });
