// gen-chibi — test 2n: thư viện âm thanh NỐI VÀO APP (v0.18): nạp engine · lược đồ / bộ kiểm đạo diễn theo thư viện · bộ phát tự gán theo dự án + không khí ·
// gói động tác gọi tên âm · store · MCP 7 tool · lint khi lưu (save_shot / save_work) · HTTP /api/sound-packs · gói dự án (sao lưu / nhập / bán, tự đủ, chặn bán theo
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
// gói động tác nhỏ gọi âm trong sự kiện clip (act = id hành động — duy nhất toàn máy)
const mpk = (id, project, sfx, act) => ({ id, project, poses: { aa: { $: 'guard', armR: { rot: 40 } } }, clips: { cc: { keys: [[0, 'aa'], [0.3, 'guard']], events: sfx ? [[0.2, { hit: true, sfx }]] : [] } }, actions: { [act || ('ciAct' + id.replace(/[^a-z]/g, ''))]: sfx ? { attack: true, clips: ['cc'] } : { clips: ['cc'] } } });
const shotWith = (sfx, extra) => ({ title: 'Cảnh', scene: 'gen.khung/san-khau-chuan', cast: ['ma-no-canh'], event: { title: 'Cảnh', steps: [Object.assign({ actor: 'ma-no-canh', state: 'normal', say: 'Chào.', sfx }, extra || {})] } });
const FRAME_STEPS = [{ actor: 'ma-no-canh', state: 'normal', say: 'Chào bạn.' }, { actor: 'ma-no-canh', state: 'shock', say: 'Ồ!' }];

// mỗi mục chạy trong sect(): ngoại lệ ở một mục (API chưa có trên mã cũ…) thành một ca đỏ, các mục sau vẫn chạy khi GC_KEEP_GOING=1
const sect = async f => { try { await f(); } catch (e) { if (!process.env.GC_KEEP_GOING) throw e; no(true, 'ngoại lệ: ' + String(e.stack).split('\n').slice(0, 2).join(' ')); } };
(async () => {
  // ---------- 1. nạp engine + lược đồ / bộ kiểm / lời nhắc đạo diễn + gói động tác theo thư viện
  await sect(async () => {
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
    // lời nhắc đạo diễn cho LLM viết tiếng Anh (ADR 0007, CNS-067); nhãn nhóm âm lấy bản dịch trong locales/en/engine-data.json
    no(!/sfx \(optional/.test(pr) || !/Impacts & hits: .*wham/.test(pr) || !/leave it EMPTY on most steps/.test(pr) || /- sfx: pop, whoosh/.test(pr), 'lời nhắc đạo diễn: âm theo nhóm + dặn để trống gần hết các bước');
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
  });

  // ---------- 2. bộ phát (direct): tự gán theo thư viện + dự án + không khí; sfx ghi tay; âm của bước ra đòn không lời
  await sect(async () => {
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
  });

  // ---------- 2b. CNS-104: "âm nào dùng được" CHỈ MỘT định nghĩa — dự án của TÁC PHẨM quyết (lược đồ, lời nhắc, Bảng bước, S6, bộ phát, list_sounds); dàn diễn viên chỉ dự phòng
  await sect(async () => {
    const { GC, S, m } = fresh(); m.importProject(clone(TQB), {});
    await m.callTool('save_project', { id: 'cua-toi', name: 'Của tôi' }); await m.callTool('save_work', { id: 'phim-toi', title: 'Phim của tôi', project: 'cua-toi' });
    const qv = GC.assets().find(a => /\/tq-quan-vu$/.test(a.key)), enumOf = sch => sch.properties.steps.items.properties.sfx.items.enum;
    no(!qv || qv.project !== 'mau-tam-quoc', 'p4: nhân vật Quan Vũ của bộ mẫu Tam Quốc');
    const work = { project: 'cua-toi' };
    no(S.allowedSounds({ work, cast: [qv] }).includes('trong-tran') || !S.allowedSounds({ cast: [qv] }).includes('trong-tran') || !S.allowedSounds({ project: 'mau-tam-quoc', work }).includes('trong-tran'), 'allowedSounds: project chỉ định > tác phẩm > dàn; dàn chỉ là dự phòng');
    no(S.projectFor({ work, cast: [qv] }) !== 'cua-toi' || S.projectFor({ cast: [qv] }) !== 'mau-tam-quoc' || S.projectFor({ work: { project: '' }, cast: [qv] }) !== '' || S.projectFor({ shot: { project: 'x' }, cast: [qv] }) !== 'x' || S.projectFor({}) !== '', 'projectFor: thứ tự chỉ định > tác phẩm > phân cảnh > bối cảnh > dàn > rỗng');
    const sch = GC.director.schema([qv], { work }), pr = GC.director.prompt([qv], { work });
    no(enumOf(sch).includes('trong-tran') || /trong-tran/.test(pr), 'p4: tác phẩm của dự án "cua-toi" dàn Tam Quốc → lược đồ + lời nhắc KHÔNG mời trong-tran (trước đây mời rồi S6 từ chối)');
    no(!enumOf(GC.director.schema([qv])).includes('trong-tran') || !/trong-tran/.test(GC.director.prompt([qv])), 'chưa biết tác phẩm: dự phòng theo dàn (dự án của diễn viên)');
    // MCP get_director_schema nhận work / project — cùng danh sách save_shot chấp nhận
    const gd = J(await m.callTool('get_director_schema', { cast: [qv.id], work: 'phim-toi' })), gp = J(await m.callTool('get_director_schema', { cast: [qv.id], project: 'mau-tam-quoc' }));
    no(enumOf(gd.schema).includes('trong-tran') || /trong-tran/.test(gd.guide) || !enumOf(gp.schema).includes('trong-tran') || errOf(await m.callTool('get_director_schema', { work: 'khong-co' })).code !== 'NOT_FOUND', 'get_director_schema { work | project }: âm theo dự án của tác phẩm; tác phẩm lạ → NOT_FOUND');
    // S6 + lược đồ + list_sounds + allowedSounds = cùng một tập, ở từng dự án
    for (const P of ['', 'cua-toi', 'mau-tam-quoc']) {
      const allowed = S.allowedSounds({ project: P }), set = new Set(allowed), en = enumOf(GC.director.schema([qv], { project: P }));
      const viaList = J(await m.callTool('list_sounds', { project: P })).sounds.map(x => x.name);
      const s6 = S.names().filter(n => S.lintSoundTrack([{ say: '', sfx: [n] }], { project: P, auto: false }).some(x => x.code === 'S6'));
      no(JSON.stringify(en) !== JSON.stringify(allowed) || JSON.stringify(viaList.slice().sort()) !== JSON.stringify(allowed.slice().sort()) || s6.some(n => set.has(n)) || S.names().some(n => !set.has(n) && !s6.includes(n)), 'dự án "' + P + '": lược đồ = list_sounds = allowedSounds, và S6 chặn đúng phần còn lại (' + allowed.length + ' / ' + S.names().length + ')');
    }
    // lưu: âm không được mời thì S6 từ chối (cùng tập)
    const shotOf = sfx => ({ title: 'C', scene: 'gen.khung/san-khau-chuan', cast: [qv.key], event: { title: 'C', steps: [{ actor: qv.id, state: 'vow', say: '', sfx }] } });
    const sr = await m.callTool('save_shot', { work: 'phim-toi', shot: Object.assign({ id: 'c1' }, shotOf(['trong-tran'])) });
    no(!sr.isError || !errOf(sr).details.some(d => /S6/.test(d.message)), 'save_shot: âm không được mời (trong-tran trong dự án cua-toi) → S6');
    // bộ phát: cùng dự án của tác phẩm (opts.project) — không tự gán âm Tam Quốc cho phim của dự án khác
    const step = { actor: qv.id, state: 'vow', activity: 'charge', say: 'Xông lên!' }, sc = GC.SCENES[Object.keys(GC.SCENES).find(k => /vuon-dao|doanh-trai/.test(k))].key;
    const pl = project => GC.film.direct({ scene: sc, cast: [qv.key], event: { title: 'x', steps: [step] } }, project === undefined ? undefined : { project }), sfxOf = p => p.beats.filter(b => b.say).map(b => b.sfx);
    no(pl().project !== 'mau-tam-quoc' || pl('cua-toi').project !== 'cua-toi' || JSON.stringify(sfxOf(pl('cua-toi'))) !== '[["whoosh"]]' || !sfxOf(pl()).flat().includes('tu-va'), 'bộ phát: dự án tác phẩm (opts.project) thắng dự án của diễn viên: ' + JSON.stringify([sfxOf(pl()), sfxOf(pl('cua-toi'))]));
    console.log('   ✓ âm nào dùng được = một hàm: lược đồ / lời nhắc đạo diễn / get_director_schema / list_sounds / S6 / bộ phát cùng theo dự án của TÁC PHẨM (dàn diễn viên chỉ dự phòng) — nhân vật Tam Quốc trong phim dự án khác không được mời trong-tran');
  });

  // ---------- 3. MCP: 53 tool, 7 tool âm thanh (danh sách · chuẩn · gói · kiểm · lưu · gỡ · chấm luật), lưu bền, nạp lại, rào khi bỏ âm đang gọi
  await sect(async () => {
    const dir = tmpDir(), { GC, S, store, m } = fresh(dir), call = (t, a) => m.callTool(t, a);
    no(TOOLS.length !== 53 || ['list_sounds', 'get_sound_spec', 'get_sound_pack', 'validate_sound_pack', 'save_sound_pack', 'delete_sound_pack', 'lint_sound_track'].some(t => !TOOLS.some(x => x.name === t && x.description.length > 150 && /sound/i.test(x.description))), 'MCP: 53 tool, 7 tool âm thanh có mô tả rõ (tiếng Anh — CNS-067)');
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
    no(sp.format !== 'gen-chibi.sound/1' || sp.rules.map(x => x.code).join() !== 'S1,S2,S3,S4,S5,S6,S7' || sp.recipes.length < 5 || sp.budget.nodes !== 60 || sp.legacy.length !== 17 || !sp.workflow || !sp.hearing || JSON.stringify(sp.rules) !== JSON.stringify(S.RULES.list.map(r => Object.assign({}, r, { short: require(ROOT + '/server/i18n-msg.js').en(r.short), rule: require(ROOT + '/server/i18n-msg.js').en(r.rule) }))), 'get_sound_spec: chuẩn + 7 luật + công thức + ngân sách, sinh từ engine (câu luật = bản tiếng Anh của đúng câu engine — CNS-067)');
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
    no(!v.isError || errOf(v).code !== 'VALIDATION_FAILED' || !errOf(v).details.some(d => d.path === 'sounds.ci-bop.layers[0].fo' && /unknown key/.test(d.message)), 'validate_sound_pack: lỗi có path tới trường sai: ' + v.content[0].text.slice(0, 200));
    v = await call('validate_sound_pack', { pack: pk('ci-trung', 'p1', { hit: snd('Hit', 'danh') }) });
    no(!v.isError || !errOf(v).details.some(d => d.path === 'sounds.hit' && /sound name already used by pack "gen\.am"/.test(d.message)), 'validate_sound_pack: trùng tên với khung → chỉ ra gói gen.am');
    v = await call('validate_sound_pack', { pack: Object.assign(base(), { id: 'gen.am' }) });
    no(!v.isError || !/gen\./.test(v.content[0].text), 'không đặt id gen.am (tiền tố dành cho khung)');
    v = await call('validate_sound_pack', { pack: pk('ci-chung', '', { 'ci-x': snd('X', 'hai', { cue: { state: ['shock'] } }) }) });
    no(!v.isError || !errOf(v).details.some(d => d.path === 'sounds.ci-x.cue' && /a shared pack may not change the frame's auto-assigned sounds/.test(d.message)), 'gói dùng chung có cue là LỖI có path (CNS-100: không đổi âm tự gán của khung ở mọi dự án): ' + v.content[0].text.slice(0, 200));
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
    no(!sv.isError || !/sound name already used by pack "ci-am"/.test(sv.content[0].text) || S.packs().some(p => p.id === 'ci-am-2') || store.listSoundPacks().length !== 1, 'save_sound_pack: trùng tên âm bị từ chối, không để dấu vết');
    const nop = base(); delete nop.project; sv = await call('save_sound_pack', { pack: nop });
    no(J(sv).version !== 3 || S.pack('ci-am').project !== 'p1', 'bản sửa không gửi "project" vẫn giữ dự án (không lặng lẽ đẩy gói ra khỏi dự án)');
    // lint_sound_track: mọi dạng đầu vào, lỗi có path, cảnh báo thì ok
    const W = [{ say: '', sfx: ['wham'] }];
    let L = await call('lint_sound_track', { steps: W });
    no(L.isError || !J(L).ok || J(L).warnings !== 1 || J(L).issues[0].code !== 'S4' || J(L).issues[0].path !== 'steps[0].sfx[0]', 'lint_sound_track chỉ có cảnh báo (S4) → ok: true + issues kèm path: ' + L.content[0].text.slice(0, 160));
    L = await call('lint_sound_track', { steps: [{ say: '', sfx: ['bonkk'] }] });
    no(!L.isError || errOf(L).code !== 'VALIDATION_FAILED' || !errOf(L).details.some(d => d.path === 'steps[0].sfx[0]' && /closest: "bonk"/.test(d.message)) || !/"ok":\s*false/.test(L.content[0].text) || !L.structuredContent.issues.length, 'lint_sound_track có lỗi (S6) → [VALIDATION_FAILED] + path + gợi ý + issues');
    const evS = { title: 't', steps: [{ actor: 'a', state: 'normal', say: '', sfx: ['bonkk'] }] };
    L = await call('lint_sound_track', { event: evS }); const L2 = await call('lint_sound_track', { shot: { event: evS } });
    no(!errOf(L).details.some(d => d.path === 'event.steps[0].sfx[0]') || !errOf(L2).details.some(d => d.path === 'event.steps[0].sfx[0]'), 'lint_sound_track nhận event / shot (path event.steps[i].sfx[k])');
    no(!errOf(await call('lint_sound_track', { steps: [{ say: '', sfx: ['ci-bop'] }] })).details.some(d => /pack "ci-am" of another project/.test(d.message)) || (await call('lint_sound_track', { steps: [{ say: '', sfx: ['ci-bop'] }], project: 'p1' })).isError, 'lint theo dự án: âm của gói dự án p1 chỉ hợp lệ khi project = p1 (S6)');
    const th = Array.from({ length: 4 }, () => ({ say: 'Để xem nào.', state: 'think' }));
    no(J(await call('lint_sound_track', { steps: th })).issues.every(x => x.code !== 'S5') || J(await call('lint_sound_track', { steps: th, auto: false })).issues.length, 'lint_sound_track: auto = false bỏ qua âm tự gán');
    no(errOf(await call('lint_sound_track', {})).code !== 'BAD_REQUEST' || errOf(await call('lint_sound_track', { work: 'khong-co' })).code !== 'NOT_FOUND', 'lint_sound_track thiếu đầu vào → BAD_REQUEST; tác phẩm lạ → NOT_FOUND');
    // save_shot / save_work chạy lint: lỗi → từ chối có path; cảnh báo → trả kèm; âm gói dự án chỉ trong dự án đó
    await call('save_work', { id: 'phim-ci', title: 'Phim CI', project: 'p1' }); await call('save_work', { id: 'phim-p2', title: 'Phim P2', project: 'p2' });
    const shotOf = (sfx, extra) => ({ title: 'Cảnh', scene: 'gen.khung/san-khau-chuan', cast: ['ma-no-canh'], event: { title: 'Cảnh', steps: [Object.assign({ actor: 'ma-no-canh', state: 'normal', say: 'Chào.', sfx }, extra || {})] } });
    let sh = await call('save_shot', { work: 'phim-ci', shot: Object.assign({ id: 'canh-1' }, shotOf(['ci-bop'])) });
    no(sh.isError || !J(sh).hasEvent || J(sh).warnings, 'save_shot: âm của gói dự án p1 dùng được trong tác phẩm của dự án p1: ' + sh.content[0].text.slice(0, 160));
    sh = await call('save_shot', { work: 'phim-p2', shot: Object.assign({ id: 'canh-1' }, shotOf(['ci-bop'])) });
    no(!sh.isError || !errOf(sh).details.some(d => d.path === 'shot.event.steps[0].sfx[0]' && /S6.*pack "ci-am" of another project/.test(d.message)) || !/"saved":\s*false/.test(sh.content[0].text) || m.store.getWork('phim-p2').shots.length, 'save_shot: âm của dự án khác bị từ chối ở shot.event.steps[0].sfx[0] (S6), không lưu');
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
    // đổi gói: bỏ âm mà tác phẩm còn gọi → 409 CONFLICT kèm danh sách, KHÔNG đổi gì (CNS-102); chủ máy chấp nhận (force) mới làm, kết quả nằm trong warnings; lint tác phẩm báo S6 từ đó
    const dropIt = () => pk('ci-am', 'p1', { 'ci-ting': snd('Ting', 'nhac-cu') });
    sv = await call('save_sound_pack', { pack: dropIt() });
    no(!sv.isError || errOf(sv).code !== 'CONFLICT' || !errOf(sv).details.some(d => /work phim-ci › shot canh-1 › step 1: still calls sound "ci-bop", which was dropped from the pack/.test(d.message)) || !S.has('ci-bop') || S.packs().find(p => p.id === 'ci-am').version !== 3, 'save_sound_pack bỏ âm đang được gọi → [CONFLICT] nêu tác phẩm / phân cảnh / bước, gói không đổi: ' + sv.content[0].text.slice(0, 240));
    sv = await call('save_sound_pack', { pack: dropIt(), force: true });
    no(sv.isError || !(J(sv).warnings || []).some(x => /work phim-ci › shot canh-1 › step 1: still calls sound "ci-bop"/.test(x)) || S.has('ci-bop'), 'force (chủ máy): lưu được, warnings nêu chỗ bị hỏng: ' + sv.content[0].text.slice(0, 240));
    no(!errOf(await call('lint_sound_track', { work: 'phim-ci' })).details.some(d => /S6/.test(d.message)), 'sau đó lint tác phẩm báo S6');
    // save_work chỉ chặn lỗi do CHÍNH lần lưu gây ra: lỗi âm cũ của phân cảnh không khoá đổi tên / ngôn ngữ (CNS-102) — thành cảnh báo
    sw = await call('save_work', { id: 'phim-ci', title: 'Phim CI (đổi tên)', lang: 'vi' });
    no(sw.isError || !(J(sw).warnings || []).some(x => /existing error.*S6/.test(x)) || m.store.getWork('phim-ci').title !== 'Phim CI (đổi tên)', 'save_work: lỗi S6 cũ của phân cảnh khác không chặn đổi tên, chỉ cảnh báo: ' + sw.content[0].text.slice(0, 200));
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
    console.log('   ✓ MCP: 53 tool · list_sounds (nhóm / thẻ / chữ / dự án) · get_sound_spec = engine · get_sound_pack (names) · validate_sound_pack (path, trùng tên, không lưu) · save_sound_pack (phiên bản, bản xuất sạch, nạp lại, giữ dự án, cảnh báo bỏ âm) · lint_sound_track (4 dạng đầu vào, lỗi path, cảnh báo ok) · save_shot / save_work chạy S1–S7 · catalog / start_here');
  });

  // ---------- 3b. CNS-100: gói dùng chung KHÔNG có cue; link MCP / AI chatroom bắt buộc project, không ghi đè gói dự án khác; save trả nhắc; gỡ gói chỉ chủ máy
  await sect(async () => {
    const dir = tmpDir(), { GC, S, store, m } = fresh(dir), call = (t, a, c) => m.callTool(t, a, c);
    const probe = () => JSON.stringify([S.cueFor({ state: 'shock', project: 'mau-tam-quoc' }), S.cueFor({ state: 'normal', project: 'x' }), S.cueFor({ event: 'impact', project: 'bat-ky' }), S.cueFor({ event: 'enter', project: 'bat-ky' }), S.cueFor({ event: 'cut', project: 'bat-ky' }), S.cueFor({ state: 'think', project: '' })]);
    const base0 = probe(), nPacks0 = S.packs().length;
    const evil = () => pk('khoa-la', '', { 'la-1': snd('Lạ', 'hai', { cue: { state: ['shock', 'normal', 'think'], event: ['impact', 'enter', 'cut'] } }) });
    // (a) mọi kênh: gói chung có cue là LỖI có path; sổ + đĩa không đổi; tự gán của khung ở mọi dự án y nguyên (p3 A–B)
    for (const [name, ctx] of [['chủ máy', undefined], ['link MCP', { viaLink: true }], ['AI chatroom', { channel: 'ui' }]]) {
      const r = await call('save_sound_pack', { pack: evil() }, ctx);
      no(!r.isError || !/sounds\.la-1\.cue|dự án|project/.test(r.content[0].text) || S.has('la-1') || S.packs().length !== nPacks0 || store.listSoundPacks().length || probe() !== base0, 'save_sound_pack gói chung có cue qua ' + name + ': bị từ chối, sổ không đổi, tự gán của khung không đổi: ' + r.content[0].text.slice(0, 160));
    }
    const ow = await call('save_sound_pack', { pack: evil() });
    no(errOf(ow).code !== 'VALIDATION_FAILED' || !errOf(ow).details.some(d => d.path === 'sounds.la-1.cue' && /a shared pack may not change the frame's auto-assigned sounds/.test(d.message)), 'chủ máy: lỗi có path sounds.la-1.cue (Q16 mặc định: gói chung không đổi âm tự gán): ' + ow.content[0].text.slice(0, 200));
    // (b) link / chatroom: bắt buộc project (khoá gõ nhầm project_id không thành gói chung), không ghi đè gói dự án khác / gói chung, không force
    await call('save_project', { id: 'pa', name: 'PA' }); await call('save_project', { id: 'pb', name: 'PB' });
    for (const [name, ctx] of [['link MCP', { viaLink: true }], ['AI chatroom', { channel: 'ui' }]]) {
      const noProj = await call('save_sound_pack', { pack: pk('qua-' + name.length, '', { ['qua-am-' + name.length]: snd('Q', 'hai') }) }, ctx);
      no(!noProj.isError || errOf(noProj).code !== 'FORBIDDEN' || !/project/.test(errOf(noProj).hint || '') || S.packs().length !== nPacks0, name + ': gói không có project → FORBIDDEN + hint "đặt project": ' + noProj.content[0].text.slice(0, 200));
      const typo = Object.assign(pk('go-nham', undefined, { 'nham-1': snd('Nhầm', 'hai') }), { project_id: 'pa' }); delete typo.project;
      const rt = await call('save_sound_pack', { pack: typo }, ctx);
      no(!rt.isError || S.pack('go-nham') || errOf(rt).code !== 'FORBIDDEN', name + ': khoá gõ nhầm project_id không được thành gói chung: ' + rt.content[0].text.slice(0, 160));
    }
    const mine = await call('save_sound_pack', { pack: pk('am-link', 'pa', { 'link-bop': snd('Bốp link', 'hai', { cue: { event: ['cut'] } }) }) }, { viaLink: true });
    no(mine.isError || S.pack('am-link').project !== 'pa' || S.cueFor({ event: 'cut', project: 'pa' })[0] !== 'link-bop' || S.cueFor({ event: 'cut', project: 'pb' })[0] !== 'whoosh', 'link MCP lưu gói CÓ project (kể cả cue): chỉ đổi âm tự gán trong dự án đó: ' + mine.content[0].text.slice(0, 160));
    await call('save_sound_pack', { pack: pk('am-pb', 'pb', { 'pb-bop': snd('Bốp pb', 'hai') }) });                              // gói của dự án pb (chủ máy)
    await call('save_sound_pack', { pack: pk('chung-am', '', { 'chung-bop': snd('Chung', 'hai') }) });                         // gói dùng chung (chủ máy)
    for (const [name, ctx] of [['link MCP', { viaLink: true }], ['AI chatroom', { channel: 'ui' }]]) {
      const x1 = await call('save_sound_pack', { pack: pk('am-pb', 'pa', { 'pb-bop': snd('Bốp pb', 'hai') }) }, ctx), x2 = await call('save_sound_pack', { pack: pk('chung-am', 'pa', { 'chung-bop': snd('Chung', 'hai') }) }, ctx);
      no(!x1.isError || !x2.isError || errOf(x1).code !== 'FORBIDDEN' || errOf(x2).code !== 'FORBIDDEN' || S.pack('am-pb').project !== 'pb' || S.pack('chung-am').project !== '', name + ': không ghi đè gói của dự án khác / gói dùng chung (p3 D–E)');
    }
    const keep = await call('save_sound_pack', { pack: Object.assign(pk('am-link', 'pa', { 'link-bop': snd('Bốp link v2', 'hai') })) }, { viaLink: true });
    no(keep.isError || S.pack('am-link').version !== 2, 'link MCP sửa gói CỦA CHÍNH dự án mình thì được (phiên bản 2)');
    // (b2) ĐƯỜNG NHẬP cũng qua cổng kênh (review bảo mật: import_project qua link từng ghi đè gói dùng chung / gói dự án khác, lách save_sound_pack):
    // link / chatroom nhập gói mới vào dự án của gói thì được; ghi đè gói dùng chung hoặc gói / gói động tác của dự án khác thì bị từ chối ở TỪNG MỤC (kind soundPacks / motionPacks)
    {
      await call('save_motion_pack', { pack: mpk('dt-chung', '', null, 'ciImpChung') }); await call('save_motion_pack', { pack: mpk('dt-pb', 'pb', null, 'ciImpPb') });
      const bundle = (soundPacks, motionPacks, pid) => ({ format: 'gen-chibi.project/1', project: { id: pid || 'pa', name: (pid || 'pa').toUpperCase() }, soundPacks, motionPacks });
      const sharedAfter = () => JSON.stringify([S.pack('chung-am').project, Object.keys(S.pack('chung-am').sounds), S.pack('am-pb').project, Object.keys(S.pack('am-pb').sounds), GC.choreo.PACKS['local.my/dt-chung'].project, GC.choreo.PACKS['local.my/dt-pb'].project]);
      const before = sharedAfter(), cueBefore = probe();
      const overwrite = [pk('chung-am', '', { 'chung-bop': snd('Chung', 'hai'), 'chung-moi': snd('Chung mới', 'hai') }), pk('am-pb', 'pb', { 'pb-bop': snd('Bốp pb', 'hai'), 'pb-moi': snd('PB mới', 'hai') })];
      for (const [name, ctx] of [['link MCP', { viaLink: true }], ['AI chatroom', { channel: 'ui' }]]) {
        const r = J(await call('import_project', { bundle: bundle(clone(overwrite), [clone(mpk('dt-chung', '', null, 'ciImpChung')), clone(mpk('dt-pb', 'pb', null, 'ciImpPb'))]), overwrite: true }, ctx));
        const bad = k => r.errors.filter(e => e.kind === k);
        no(bad('soundPacks').length !== 2 || !bad('soundPacks').every(e => /MCP link \/ the AI chatroom.*may not overwrite another project's pack/.test(e.error)) || bad('motionPacks').length !== 2 || !bad('motionPacks').every(e => /MCP link \/ the AI chatroom|belongs to project "pb"/.test(e.error)) || sharedAfter() !== before || probe() !== cueBefore,
          name + ': import_project (overwrite) KHÔNG ghi đè được gói âm dùng chung / gói âm + gói động tác của dự án khác — mỗi mục báo lỗi, dữ liệu y nguyên: ' + JSON.stringify(r.errors.map(e => e.kind + ' ' + e.id + ': ' + e.error.slice(0, 70))));
      }
      // gói MỚI mang cue vào dự án của nó qua link: được (chỉ đổi âm tự gán trong dự án đó); cue không bao giờ thành gói dùng chung
      const viaLinkNew = J(await call('import_project', { bundle: bundle([pk('am-nhap-moi', 'pn', { 'nhap-moi-1': snd('Nhập mới', 'hai', { cue: { event: ['exit'] } }) })], [], 'pn') }, { viaLink: true }));
      no(!viaLinkNew.errors || viaLinkNew.errors.length || S.pack('am-nhap-moi').project !== 'pn' || S.cueFor({ event: 'exit', project: 'pn' })[0] !== 'nhap-moi-1' || S.cueFor({ event: 'exit', project: 'pb' })[0] !== 'zip', 'link MCP nhập gói MỚI có cue: thuộc dự án nhập (không thành gói chung), cue chỉ trong dự án đó');
      const evilShared = J(await call('import_project', { bundle: bundle([pk('chung-am', '', { 'chung-bop': snd('Chung', 'hai', { cue: { state: ['shock'] } }) })], []), overwrite: true }));
      no(!evilShared.errors.some(e => e.kind === 'soundPacks' && /a shared pack may not change the frame's auto-assigned sounds/.test(e.error)) || sharedAfter() !== before || probe() !== cueBefore, 'chủ máy: nhập đè gói dùng chung kèm cue → lỗi cổng (gói chung không có cue), không đổi gì: ' + JSON.stringify(evilShared.errors.map(e => e.error.slice(0, 80))));
      // chủ máy (token / stdio) theo luật thường: nhập đè gói dùng chung → vẫn là gói dùng chung; gói của dự án khác thì vẫn không chuyển dự án
      const owner = J(await call('import_project', { bundle: bundle(clone(overwrite), [clone(mpk('dt-chung', '', null, 'ciImpChung')), clone(mpk('dt-pb', 'pb', null, 'ciImpPb'))]), overwrite: true }));
      no(owner.errors.filter(e => e.kind === 'soundPacks' || e.kind === 'motionPacks').length !== 2 || !owner.errors.some(e => e.kind === 'soundPacks' && e.id === 'am-pb') || !owner.errors.some(e => e.kind === 'motionPacks' && e.id === 'dt-pb') || S.pack('chung-am').project !== '' || !S.has('chung-moi') || GC.choreo.PACKS['local.my/dt-chung'].project !== '' || S.pack('am-pb').project !== 'pb' || GC.choreo.PACKS['local.my/dt-pb'].project !== 'pb', 'chủ máy: nhập đè giữ gói chung (âm + động tác) là gói chung; gói của dự án khác bị từ chối: ' + JSON.stringify(owner.errors.map(e => e.kind + ' ' + e.id)));
    }
    // (c) mô tả tool ghi kênh (L-45); save trả nhắc phạm vi trong warnings; validate nhắc trong notes
    const tl = n => TOOLS.find(t => t.name === n).description;
    no(!/MCP link or the AI chatroom/.test(tl('save_sound_pack')) || !/owner ONLY/.test(tl('delete_sound_pack')) || !/FORBIDDEN/.test(tl('delete_sound_pack')), 'mô tả tool ghi rõ kênh được gọi (L-45)');
    no(!(J(await call('save_sound_pack', { pack: pk('chung-am', '', { 'chung-bop': snd('Chung', 'hai') }) })).warnings || []).some(x => /Shared pack/.test(x)) || !(J(await call('save_sound_pack', { pack: pk('am-link', 'pa', { 'link-bop': snd('Bốp link v2', 'hai', { cue: { event: ['cut'] } }) }) })).warnings || []).some(x => /has "cue".*only inside project "pa"/.test(x)), 'save_sound_pack trả lời nhắc phạm vi trong warnings (gói chung / gói dự án có cue)');
    no(!(J(await call('validate_sound_pack', { pack: pk('chung-2', '', { 'chung-2-a': snd('C2', 'hai') }) })).notes || []).some(x => /Shared pack/.test(x)), 'validate_sound_pack nhắc trong notes');
    // (d) tệp đã lưu từ trước có cue ở gói chung / khoá lạ (bản dev v0.18): khởi động nạp khoan dung — bỏ cue, gói còn, cảnh báo ở log + start_here.warnings
    const bd = tmpDir(), st0 = new Store(bd), legacy = pk('goi-cu', '', { 'cu-1': snd('Cũ', 'hai', { cue: { state: ['shock'] } }) }, { bogus: 1, partial: true });
    fs.writeFileSync(path.join(bd, 'soundpacks', 'goi-cu.json'), JSON.stringify(Object.assign({ version: 1, savedAt: '2026-10-19T00:00:00Z', note: '' }, legacy)));
    const warns = [], ow0 = console.warn; console.warn = (...a) => warns.push(a.join(' '));
    let mb; try { mb = new MCP({ engine: loadEngine(ROOT), store: new Store(bd), version: 't', system: {} }); } finally { console.warn = ow0; }
    no(!mb.GC.sounds.has('cu-1') || mb.GC.sounds.get('cu-1').cue !== undefined || mb.GC.sounds.cueFor({ state: 'shock' })[0] !== 'sting' || !warns.some(x => /^\[mcp\] sound pack goi-cu/.test(x)) || !(J(await mb.callTool('start_here', {})).state.warnings || []).some(x => /gói âm goi-cu.*cue: gói dùng chung/.test(x)), 'khởi động: gói chung cũ có cue vẫn nạp (bỏ cue, âm tự gán của khung y nguyên) + cảnh báo log và start_here.warnings: ' + warns.join(' | ').slice(0, 200));
    console.log('   ✓ CNS-100: gói dùng chung không có cue (lỗi có path, mọi kênh) · link MCP / AI chatroom bắt buộc project + không ghi đè gói dự án khác / gói chung + không force · tự gán của khung ở mọi dự án không đổi · save / validate nhắc phạm vi · gói cũ nạp khoan dung kèm cảnh báo');
  });

  // ---------- 3c. CNS-102: rào theo phụ thuộc (bỏ âm đang gọi / đổi dự án → 409 + force) · nạp khoan dung gói động tác · nhập đè không đổi phạm vi gói · gỡ gói
  await sect(async () => {
    const dir = tmpDir(), A = fresh(dir), { S, m } = A, call = (t, a, c) => m.callTool(t, a, c);
    await call('save_project', { id: 'pa', name: 'PA' }); await call('save_project', { id: 'pb', name: 'PB' });
    await call('save_sound_pack', { pack: pk('am-a', 'pa', { 'a-bop': snd('Bốp', 'hai'), 'a-ting': snd('Ting', 'hai') }) });
    // p7: gói động tác gọi a-bop; lưu lại gói bỏ a-bop → 409 nêu cả gói động tác
    const dt = mpk('dt-a', 'pa', 'a-bop', 'ciBonk'); dt.clips.cc2 = { keys: [[0, 'aa'], [0.3, 'guard']], events: [[0.1, { sfx: 'a-ting' }]] }; dt.actions.ciBowDeep = { clips: ['cc2'] };
    no((await call('save_motion_pack', { pack: dt })).isError, 'gói động tác dt-a gọi a-bop / a-ting lưu được');
    const drop = () => pk('am-a', 'pa', { 'a-ting': snd('Ting', 'hai') });
    let r = await call('save_sound_pack', { pack: drop() });
    no(!r.isError || errOf(r).code !== 'CONFLICT' || !errOf(r).details.some(d => /motion pack dt-a › clip cc: still calls sound "a-bop", which was dropped from the pack/.test(d.message)) || !S.has('a-bop'), 'p7: bỏ âm gói động tác còn gọi → [CONFLICT] nêu gói động tác / clip, gói không đổi: ' + r.content[0].text.slice(0, 220));
    r = await call('save_sound_pack', { pack: drop() }, { viaLink: true }); no(!r.isError || S.has('a-bop') === false, 'link MCP không force được (kênh link chỉ nhận 409): ' + r.content[0].text.slice(0, 120));
    r = await call('save_sound_pack', { pack: drop(), force: true });
    no(r.isError || !(J(r).warnings || []).some(x => /motion pack dt-a › clip cc: still calls sound "a-bop"/.test(x)) || S.has('a-bop'), 'force (chủ máy): lưu được, warnings nêu chỗ hỏng');
    // KHỞI ĐỘNG LẠI: gói động tác KHÔNG rơi khỏi sổ — chỉ bỏ sfx của sự kiện thiếu âm; đòn không dùng âm đó còn nguyên; cảnh báo hiện ở start_here
    const warns = [], ow0 = console.warn; console.warn = (...a) => warns.push(a.join(' '));
    let B; try { B = fresh(dir); } finally { console.warn = ow0; }
    const acts = Object.keys(B.GC.choreo.ACTIONS).filter(k => /^ciBonk$|^ciBowDeep$/.test(k)), P0 = B.GC.choreo.PACKS['local.my/dt-a'];
    no(acts.length !== 2 || !P0 || JSON.stringify(P0.clips.cc.events) !== '[[0.2,{"hit":true}]]' || !P0.clips.cc2.events[0][1].sfx || !warns.some(x => /^\[mcp\] motion pack dt-a/.test(x)), 'p7: khởi động lại → gói động tác dt-a CÒN (cả hai đòn), chỉ sfx thiếu bị bỏ khỏi sự kiện: ' + acts + ' ' + JSON.stringify(P0 && P0.clips.cc.events));
    no(!(J(await B.m.callTool('start_here', {})).state.warnings || []).some(x => /gói động tác dt-a.*a-bop/.test(x)), 'start_here.warnings báo gói động tác nạp khoan dung');
    // Studio nạp cùng cách (tolerant): engine ở trình duyệt dùng cùng registerPack
    const G2 = loadEngine(ROOT); G2.sounds.registerPack(S.pack('am-a'));
    const strict = G2.choreo.registerPack('local.my', JSON.parse(JSON.stringify(A.store.listMotionPacks()[0]))), G3 = loadEngine(ROOT); G3.sounds.registerPack(S.pack('am-a'));
    const tol = G3.choreo.registerPack('local.my', JSON.parse(JSON.stringify(A.store.listMotionPacks()[0])), { tolerant: true });
    no(!strict.errors.length || tol.errors.length || !tol.notes.length || !G3.choreo.ACTIONS.ciBonk, 'choreo.registerPack: mặc định nghiêm (âm thiếu là lỗi), { tolerant: true } bỏ sfx thiếu + ghi chú');
    // p3 D: đổi project của gói khi còn tác phẩm của dự án cũ gọi → 409; force rồi save_work không bị khoá
    await call('save_sound_pack', { pack: pk('am-d', 'pa', { 'd-bop': snd('Bốp D', 'hai') }) });
    await call('save_work', { id: 'phim-a', title: 'Phim A', project: 'pa' });
    no((await call('save_shot', { work: 'phim-a', shot: Object.assign({ id: 'c1' }, shotWith(['d-bop'])) })).isError, 'tác phẩm pa gọi d-bop');
    r = await call('save_sound_pack', { pack: pk('am-d', 'pb', { 'd-bop': snd('Bốp D', 'hai') }) });
    no(!r.isError || errOf(r).code !== 'CONFLICT' || !errOf(r).details.some(d => /work phim-a › shot c1 › step 1: still calls sound "d-bop" — the pack moves to project "pb", so project "pa" no longer sees/.test(d.message)) || S.pack('am-d').project !== 'pa', 'p3 D: đổi project của gói khi còn tác phẩm gọi → [CONFLICT] nêu lý do, gói không đổi: ' + r.content[0].text.slice(0, 220));
    r = await call('save_sound_pack', { pack: pk('am-d', 'pa', { 'd-bop': snd('Bốp D', 'hai'), 'd-ting': snd('Ting D', 'hai') }) });
    no(r.isError, 'thêm âm vào gói (không bỏ, không đổi dự án) thì không bị rào: ' + r.content[0].text.slice(0, 120));
    await call('save_sound_pack', { pack: pk('am-d', 'pb', { 'd-bop': snd('Bốp D', 'hai'), 'd-ting': snd('Ting D', 'hai') }), force: true });
    const sw = await call('save_work', { id: 'phim-a', title: 'Phim A (đổi tên)' });
    no(sw.isError || !(J(sw).warnings || []).some(x => /existing error/.test(x)), 'p3 D: sau force, đổi tên tác phẩm pa không bị khoá bởi S6 cũ, chỉ cảnh báo: ' + sw.content[0].text.slice(0, 160));
    // p3 E: nhập đè gói sao lưu của pa — gói chung giữ là gói chung, tác phẩm pb không khoá
    const E = fresh(); await E.m.callTool('save_project', { id: 'pa', name: 'PA' }); await E.m.callTool('save_project', { id: 'pb', name: 'PB' });
    await E.m.callTool('save_sound_pack', { pack: pk('chung-am', '', { 'chung-bop': snd('Chung', 'hai') }) });
    for (const [w, pj] of [['phim-a', 'pa'], ['phim-b', 'pb']]) { await E.m.callTool('save_work', { id: w, title: w, project: pj }); no((await E.m.callTool('save_shot', { work: w, shot: Object.assign({ id: 'c1' }, shotWith(['chung-bop'])) })).isError, 'tác phẩm ' + w + ' gọi chung-bop'); }
    const bkE = E.m.exportProject('pa'), rE = E.m.importProject(clone(bkE), { overwrite: true });
    no(rE.errors.length || E.S.pack('chung-am').project !== '' || (await E.m.callTool('save_work', { id: 'phim-b', title: 'Phim B (đổi tên)' })).isError, 'p3 E: nhập đè gói sao lưu của pa — gói chung vẫn là gói chung, tác phẩm pb đổi tên được: ' + JSON.stringify(rE.errors));
    // nhập đè không chuyển gói giữa các dự án
    await E.m.callTool('save_sound_pack', { pack: pk('am-pb-only', 'pb', { 'pbo-1': snd('PBO', 'hai') }) });
    const crossB = clone(bkE); crossB.project = { id: 'pa', name: 'PA' }; crossB.soundPacks = [pk('am-pb-only', 'pa', { 'pbo-1': snd('PBO', 'hai') })];
    const rX = E.m.importProject(crossB, { overwrite: true });
    no(!rX.errors.some(e => e.kind === 'soundPacks' && /đang thuộc dự án "pb"/.test(e.error)) || E.S.pack('am-pb-only').project !== 'pb', 'nhập đè gói của dự án khác bị từ chối (không chuyển gói giữa dự án): ' + JSON.stringify(rX.errors));
    // gỡ gói: chỉ chủ máy; còn gọi → 409 + danh sách; force; khung không gỡ được; tệp vào thùng rác, lịch sử còn
    const D = fresh(), dc = (t, a, c) => D.m.callTool(t, a, c), dsnd = D.S;
    await dc('save_project', { id: 'pa', name: 'PA' });
    await dc('save_sound_pack', { pack: pk('am-x', 'pa', { 'x-bop': snd('X', 'hai') }) }); await dc('save_sound_pack', { pack: pk('am-x', 'pa', { 'x-bop': snd('X2', 'hai') }) });
    await dc('save_work', { id: 'phim-x', title: 'X', project: 'pa' }); await dc('save_shot', { work: 'phim-x', shot: Object.assign({ id: 'c1' }, shotWith(['x-bop'])) });
    for (const [name, ctx] of [['link MCP', { viaLink: true }], ['AI chatroom', { channel: 'ui' }]]) { const f = await dc('delete_sound_pack', { id: 'am-x', force: true }, ctx); no(!f.isError || errOf(f).code !== 'FORBIDDEN' || !dsnd.pack('am-x'), name + ': delete_sound_pack bị từ chối (chỉ chủ máy)'); }
    r = await dc('delete_sound_pack', { id: 'am-x' });
    no(!r.isError || errOf(r).code !== 'CONFLICT' || !errOf(r).details.some(d => /work phim-x › shot c1 › step 1: still calls sound "x-bop" — removing the pack loses this sound/.test(d.message)) || !dsnd.pack('am-x'), 'gỡ gói còn được gọi → [CONFLICT] kèm danh sách: ' + r.content[0].text.slice(0, 200));
    no(errOf(await dc('delete_sound_pack', { id: 'gen.am' })).code !== 'FORBIDDEN' || errOf(await dc('delete_sound_pack', { id: 'khong-co' })).code !== 'NOT_FOUND' || errOf(await dc('delete_sound_pack', { id: 'constructor' })).code !== 'NOT_FOUND', 'không gỡ được khung (FORBIDDEN); gói lạ / id "constructor" → NOT_FOUND, không ném');
    r = await dc('delete_sound_pack', { id: 'am-x', force: true });
    no(r.isError || !J(r).deleted || !(J(r).warnings || []).length || dsnd.pack('am-x') || D.store.listSoundPacks().length || !fs.readdirSync(path.join(D.store.dir || D.store.soundDir, '..', 'trash')).some(f => /^soundpack-am-x-/.test(f)) || !fs.existsSync(path.join(D.store.soundDir, '..', 'versions', 'soundpacks~am-x', '1.json')), 'force: gỡ được, tệp vào thùng rác, lịch sử phiên bản còn: ' + r.content[0].text.slice(0, 200));
    no(fresh(path.join(D.store.soundDir, '..')).S.has('x-bop'), 'khởi động lại: gói đã gỡ không về lại');
    console.log('   ✓ CNS-102: bỏ âm đang gọi / đổi dự án → 409 + danh sách (force chỉ chủ máy) · khởi động lại gói động tác không rơi khỏi sổ (chỉ bỏ sfx thiếu + cảnh báo) · save_work không bị khoá bởi lỗi âm cũ · nhập đè giữ gói chung, không chuyển gói giữa dự án · gỡ gói (409 / force / thùng rác)');
  });

  // ---------- 4. HTTP /api/sound-packs (server thật, cổng 78xx)
  await sect(async () => {
    const PORT = +(process.env.GC_SOUNDS_PORT || 7812), H = tmpDir(), BASE = 'http://127.0.0.1:' + PORT, S = loadEngine(ROOT).sounds;
    no(await fetch(BASE + '/api/health').then(() => true, () => false), 'cổng ' + PORT + ' đang bị chiếm (đặt GC_SOUNDS_PORT khác)');
    const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: H, GC_PORT: String(PORT), GC_NO_AUTOCHECK: '1' }), stdio: 'ignore' });
    process.on('exit', () => { try { srv.kill(); } catch (e) { /* đã tắt */ } });   // no() thoát thẳng — không để server mồ côi giữ cổng
    try {
      for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 250)); }
      // x-gc-lang: vi — các kiểm HTTP dưới so câu tiếng Việt (msgid) như Studio ở chế độ vi; bản tiếng Anh mặc định: tools/test-i18n-server.mjs (ADR 0007)
      const api = async (p, o) => { const r = await fetch(BASE + p, o && o.body ? { method: o.method || 'POST', headers: { 'content-type': 'application/json', 'x-gc-request': '1', 'x-gc-lang': 'vi' }, body: JSON.stringify(o.body) } : { headers: { 'x-gc-lang': 'vi' } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* văn bản */ } return { status: r.status, j, t }; };
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
      // CNS-102 / CNS-100 qua HTTP: bỏ âm đang được gọi → 409 + conflicts[]; force → làm; DELETE /api/sound-packs/<id> (chủ máy): 409 → force → thùng rác
      await api('/api/projects', { body: { id: 'hp', name: 'HP' } });
      r = await api('/api/sound-packs', { body: { pack: pk('ci-hp', 'hp', { 'hp-bop': snd('HP bốp', 'hai'), 'hp-ting': snd('HP ting', 'hai') }) } });
      no(r.status !== 200, 'POST gói dự án hp: ' + r.t.slice(0, 120));
      r = await api('/api/works', { body: { title: 'Phim HP', project: 'hp' } });
      r = await api('/api/works/phim-hp/shots', { body: { shot: { id: 'canh-1', title: 'C', scene: 'gen.khung/san-khau-chuan', cast: ['ma-no-canh'], event: { title: 'C', steps: [{ actor: 'ma-no-canh', state: 'normal', say: 'Chào.', sfx: ['hp-bop'] }] } } } });
      no(r.status !== 200, 'tác phẩm hp gọi hp-bop: ' + r.t.slice(0, 160));
      r = await api('/api/sound-packs', { body: { pack: pk('ci-hp', 'hp', { 'hp-ting': snd('HP ting', 'hai') }) } });
      no(r.status !== 409 || !Array.isArray(r.j.conflicts) || !/tác phẩm phim-hp › phân cảnh canh-1 › bước 1: còn gọi âm "hp-bop"/.test(r.j.conflicts[0]), 'POST bỏ âm đang gọi → 409 + conflicts[]: ' + r.t.slice(0, 200));
      r = await api('/api/sound-packs', { body: { pack: pk('ci-hp', 'hp', { 'hp-ting': snd('HP ting', 'hai') }), force: true } });
      no(r.status !== 200 || !r.j.warnings.some(x => /còn gọi âm "hp-bop"/.test(x)), 'POST force: true → lưu, warnings nêu chỗ hỏng: ' + r.t.slice(0, 200));
      r = await api('/api/sound-packs', { body: { pack: pk('ci-hp', 'hp', { 'hp-bop': snd('HP bốp', 'hai'), 'hp-ting': snd('HP ting', 'hai') }) } });
      r = await api('/api/sound-packs/ci-hp', { method: 'DELETE', body: {} });
      no(r.status !== 409 || !r.j.conflicts.length, 'DELETE /api/sound-packs/<id> còn được gọi → 409 + conflicts[]: ' + r.t.slice(0, 200));
      r = await api('/api/sound-packs/ci-hp?force=1', { method: 'DELETE', body: {} });
      no(r.status !== 200 || !r.j.deleted || fs.existsSync(path.join(H, 'data', 'soundpacks', 'ci-hp.json')) || !fs.readdirSync(path.join(H, 'data', 'trash')).some(f => /^soundpack-ci-hp-/.test(f)), 'DELETE ?force=1 → gỡ, tệp vào thùng rác: ' + r.t.slice(0, 200));
      no((await api('/api/sound-packs/ci-hp', { method: 'DELETE', body: {} })).status !== 404 || (await api('/api/sound-packs/gen.am', { method: 'DELETE', body: {} })).status !== 404 || (await api('/api/sound-packs/constructor', { method: 'DELETE', body: {} })).status !== 404, 'DELETE gói không có / id lạ → 404');
      no((await fetch(BASE + '/api/sound-packs/ci-http', { method: 'DELETE' })).status !== 403, 'DELETE thiếu header X-GC-Request → 403 (chống CSRF như mọi lệnh ghi)');
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
      // MCP qua HTTP: hướng dẫn agent
      const rpc = await (await fetch(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_sounds', arguments: { project: 'mau-tam-quoc', cat: 'nhac-cu' } } }) })).json();
      no(!JSON.parse(rpc.result.content[0].text).sounds.some(x => x.name === 'trong-tran'), 'MCP qua HTTP: list_sounds thấy gói Tam Quốc vừa nhập');
      const gd = await fetch(BASE + '/api/agent/guide?topic=sound');
      no(gd.status !== 200 || !/\*\*S1\*\*/.test(await gd.text()), '/api/agent/guide?topic=sound');
    } finally { srv.kill(); }
    console.log('   ✓ HTTP /api/sound-packs (cổng ' + PORT + '): GET / POST qua cổng, 422 có path, trùng tên báo gói giữ tên, lưu bền, Studio tải được engine/sounds.js, nhập Tam Quốc mang gói âm, MCP + hướng dẫn agent qua HTTP');
  });

  // ---------- 5. gói dự án: sao lưu / nhập / bán — gói âm tự đủ; chặn bán theo NỘI DUNG bộ mẫu
  await sect(async () => {
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
    let e9 = null; try { fresh().m.importProject({ format: 'gen-chibi.project/1', project: { id: 'chin' }, soundPacks: Array.from({ length: 33 }, (x, i) => pk('goi-' + i, 'chin', { ['am-' + i]: snd('x', 'hai') })) }, {}); } catch (e) { e9 = e; }
    no(!e9 || !/soundPacks: tối đa 32/.test(e9.message), 'gói dự án có 33 gói âm bị chặn khi nhập (trần 32 = trần khi lưu — ma trận ở mục 5b)');
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
  });

  // ---------- 5b. CNS-101: MA TRẬN L-61 cho gói âm — LƯU → XUẤT → NHẬP máy sạch (trần lưu = trần nhập · phụ thuộc chéo âm ↔ gói động tác ↔ tác phẩm · gói bán phụ thuộc nháp)
  await sect(async () => {
    const roundTrip = (m0, id, sale) => { const bk = m0.exportProject(id, sale ? { sale: true } : undefined), B = fresh(), r = B.m.importProject(clone(bk), {}); return { bk, B, r }; };
    // (a) 32 gói âm một dự án: lưu được cả 32, gói thứ 33 bị TỪ CHỐI ở lưu; xuất → nhập máy sạch đủ 32 (trước đây lưu 9 gói, nhập tối đa 8 → cả gói bị từ chối — p8)
    {
      const A = fresh(), call = (t, a, c) => A.m.callTool(t, a, c);
      await call('save_project', { id: 'pa', name: 'PA' });
      let saved = 0; for (let i = 0; i < 33; i++) { const r = await call('save_sound_pack', { pack: pk('goi-' + i, 'pa', { ['am-' + i]: snd('x' + i, 'hai') }) }); if (!r.isError) saved++; else if (i !== 32) no(true, 'gói thứ ' + (i + 1) + ' phải lưu được: ' + r.content[0].text.slice(0, 160)); else { const e = errOf(r); no(e.code !== 'VALIDATION_FAILED' || !/at most 32/.test(r.content[0].text) || !/Merge sounds/.test(e.hint || ''), 'gói âm thứ 33 của một dự án bị từ chối kèm cách xử lý: ' + r.content[0].text.slice(0, 200)); } }
      no(saved !== 32, 'lưu được đúng 32 gói âm một dự án (đang ' + saved + ')');
      no((await call('save_sound_pack', { pack: pk('goi-5', 'pa', { 'am-5': snd('x5 v2', 'hai') }) })).isError || (await call('save_sound_pack', { pack: pk('goi-chung-moi', '', { 'chung-moi': snd('cm', 'hai') }) })).isError, 'sửa gói đã có / gói dùng chung vẫn lưu được khi dự án đầy');
      const { bk, r } = roundTrip(A.m, 'pa');
      no(bk.soundPacks.length !== 32 || r.errors.length || r.counts.soundPacks !== 32, 'p8: 32 gói âm → xuất → nhập máy sạch đủ 32: ' + JSON.stringify(r.errors.slice(0, 2)) + ' ' + bk.soundPacks.length);
    }
    // (b) gói động tác gọi âm của gói dùng chung / dự án khác: sao lưu mang đủ gói âm; máy sạch nhập đủ gói động tác (p3 F)
    {
      const A = fresh(), call = (t, a, c) => A.m.callTool(t, a, c);
      await call('save_project', { id: 'pa', name: 'PA' }); await call('save_project', { id: 'pb', name: 'PB' });
      await call('save_sound_pack', { pack: pk('chung-am', '', { 'chung-bop': snd('Chung', 'hai') }) });
      await call('save_sound_pack', { pack: pk('am-pa', 'pa', { 'pa-bop': snd('PA', 'hai') }) });
      await call('save_sound_pack', { pack: pk('am-pb', 'pb', { 'pb-bop': snd('PB', 'hai') }) });
      no((await call('save_motion_pack', { pack: mpk('dt-chung', 'pa', 'chung-bop', 'ciDtChung') })).isError || (await call('save_motion_pack', { pack: mpk('dt-pa', 'pa', 'pa-bop', 'ciDtPa') })).isError, 'gói động tác pa gọi âm gói chung + gói của chính pa');
      await call('save_work', { id: 'phim-a', title: 'Phim A', project: 'pa' });
      // phân cảnh dùng đòn của gói động tác dự án KHÁC (pb) mà gói đó gọi âm của gói âm pb: kéo theo cả hai (CNS-060 + CNS-101)
      no((await call('save_motion_pack', { pack: mpk('dt-pb', 'pb', 'pb-bop', 'ciDtPb') })).isError, 'gói động tác pb gọi âm gói pb');
      const sh = await call('save_shot', { work: 'phim-a', shot: { id: 'c1', title: 'C', scene: 'gen.khung/san-khau-chuan', cast: ['ma-no-canh', 'ma-no-canh'.replace('ma-no-canh', 'ma-no-canh')].slice(0, 1), event: { title: 'C', steps: [{ actor: 'ma-no-canh', state: 'normal', say: '', action: 'ciDtPb', target: 'ma-no-canh' }] } } });
      const { bk, r, B } = roundTrip(A.m, 'pa');
      const ids = bk.soundPacks.map(p => p.id).sort(), mids = bk.motionPacks.map(p => p.id).sort();
      no(JSON.stringify(ids) !== JSON.stringify(['am-pa', 'chung-am']) && JSON.stringify(ids) !== JSON.stringify(['am-pa', 'am-pb', 'chung-am']), 'sao lưu kéo gói âm mà gói động tác gọi (gói chung + gói của dự án): ' + ids);
      no(r.errors.length || r.counts.motionPacks !== mids.length || !mids.includes('dt-chung') || !mids.includes('dt-pa') || !B.GC.choreo.ACTIONS.ciDtChung || !B.GC.choreo.ACTIONS.ciDtPa, 'p3 F: máy sạch nhập đủ gói động tác gọi âm gói chung / gói dự án — không bị loại: ' + JSON.stringify(r.errors) + ' ' + mids);
      // đòn của gói pb phân cảnh dùng (nếu save_shot nhận): gói âm pb phải đi theo gói động tác pb
      if (!sh.isError) no(!mids.includes('dt-pb') || !ids.includes('am-pb') || r.errors.length, 'gói động tác kéo từ dự án khác kéo theo cả gói âm của nó: ' + mids + ' / ' + ids);
      // (c) gói bán: gói động tác PHÁT HÀNH gọi âm của gói âm NHÁP → gói âm vẫn đi theo + cảnh báo có tên gói; người mua nhập đủ (p3 G)
      await call('save_sound_pack', { pack: pk('nhap-am', 'pa', { 'nhap-bop': snd('Nháp', 'hai') }) });
      await call('save_motion_pack', { pack: Object.assign(mpk('dt-ban', 'pa', 'nhap-bop', 'ciDtBan'), { status: 'published' }) });
      const sale = A.m.exportProject('pa', { sale: true });
      no(!sale.soundPacks.some(p => p.id === 'nhap-am') || !sale.warnings.some(x => /gói âm nhap-am còn nháp nhưng asset phát hành cần nó — phát hành nó trước khi bán/.test(x)), 'gói bán: gói âm nháp mà gói động tác phát hành cần vẫn đi theo + warnings nêu tên gói: ' + JSON.stringify([sale.soundPacks.map(p => p.id), sale.warnings]));
      const rb = fresh().m.importProject(clone(sale), {});
      no(rb.errors.length || rb.counts.motionPacks !== 1, 'người mua nhập gói bán: gói động tác không bị loại: ' + JSON.stringify(rb.errors));
      // (e) trần khi XUẤT = trần khi NHẬP: dự án đầy 32 gói + gói động tác kéo thêm gói chung → báo ngay lúc xuất, không để phát hiện lúc khôi phục
      const F = fresh(), fc = (t, a) => F.m.callTool(t, a);
      await fc('save_project', { id: 'pf', name: 'PF' }); await fc('save_sound_pack', { pack: pk('chung-f', '', { 'chung-f1': snd('cf', 'hai') }) });
      for (let i = 0; i < 32; i++) await fc('save_sound_pack', { pack: pk('f-goi-' + i, 'pf', { ['f-am-' + i]: snd('f' + i, 'hai') }) });
      await fc('save_motion_pack', { pack: mpk('dt-f', 'pf', 'chung-f1', 'ciDtF') });
      let ee = null; try { F.m.exportProject('pf'); } catch (e) { ee = e; }
      no(!ee || ee.code !== 400 || !/33 gói âm.*> 32/.test(ee.message) || !/gộp bớt/.test(ee.message), 'xuất vượt trần nhập (32 gói của dự án + 1 gói chung kéo theo) → lỗi rõ ngay lúc xuất: ' + (ee && ee.message.slice(0, 200)));
    }
    // (d) gói động tác: trần lưu = trần nhập = 8 (CNS-061 chỉ đúng một nửa trước đây)
    {
      const A = fresh(), call = (t, a) => A.m.callTool(t, a);
      await call('save_project', { id: 'pm', name: 'PM' });
      const letters = 'abcdefghi'; let ok = 0, last = null;
      for (let i = 0; i < 9; i++) { const r = await call('save_motion_pack', { pack: mpk('dt-' + letters[i], 'pm', null, 'ciMoPk' + letters[i]) }); if (!r.isError) ok++; else last = r; }
      no(ok !== 8 || !last || !/at most 8/.test(last.content[0].text), 'gói động tác thứ 9 của một dự án bị từ chối ở lưu (trần = trần nhập 8): ' + ok + ' ' + (last && last.content[0].text.slice(0, 160)));
      const { bk, r } = roundTrip(A.m, 'pm');
      no(bk.motionPacks.length !== 8 || r.errors.length || r.counts.motionPacks !== 8, '8 gói động tác → xuất → nhập máy sạch đủ 8: ' + JSON.stringify(r.errors.slice(0, 2)));
    }
    // CNS-108: license / owner đi theo gói qua lưu → xuất → nhập; partial không bị bỏ im
    {
      const A = fresh(), call = (t, a) => A.m.callTool(t, a);
      await call('save_project', { id: 'pa', name: 'PA' });
      const lic = pk('am-lic', 'pa', { 'lic-bop': snd('Lic', 'hai') }, { license: '© 2026 Người bán — mọi quyền', owner: 'Người bán', author: 'Ryan' });
      no((await call('save_sound_pack', { pack: lic })).isError, 'lưu gói có license / owner / author');
      const { bk, B } = roundTrip(A.m, 'pa'), got = bk.soundPacks[0];
      no(got.license !== lic.license || got.owner !== 'Người bán' || got.author !== 'Ryan' || B.S.pack('am-lic').license !== lic.license || J(await B.m.callTool('get_sound_pack', { id: 'am-lic' })).owner !== 'Người bán', 'license / owner / author đi theo gói: lưu → xuất → nhập → get_sound_pack');
      const T = fresh(); T.m.importProject(clone(TQB), {});
      no(T.S.pack('tq-am').license !== TQ.license || !/Gen Labs/.test(T.S.pack('tq-am').license) || !T.m.exportProject('mau-tam-quoc').soundPacks[0].license, 'tq-am có lại giấy phép Gen Labs sau khi nạp / xuất');
      const part = J(await call('get_sound_pack', { id: 'am-lic', names: ['lic-bop'] }));
      no(part.partial !== true, 'get_sound_pack names trả partial: true');
      const sp = await call('save_sound_pack', { pack: part });
      no(!sp.isError || !errOf(sp).details.some(d => d.path === 'pack.partial' && /PARTIAL pack/.test(d.message)), 'lưu lại gói partial bị từ chối rõ ràng (không bị bỏ im làm gói co lại): ' + sp.content[0].text.slice(0, 200));
      const typoPk = Object.assign(pk('am-typo', '', { 'typo-1': snd('T', 'hai') }), { project_id: 'pa' }); delete typoPk.project;   // JSON thật: không có khoá project, có khoá gõ nhầm
      const typo = await call('save_sound_pack', { pack: typoPk });
      no(!typo.isError || errOf(typo).code !== 'VALIDATION_FAILED' || !errOf(typo).details.some(d => d.path === 'pack.project_id') || A.S.pack('am-typo'), 'khoá lạ cấp gói (project_id) → lỗi có path, không thành gói chung (p1)');
    }
    // CNS-112: id gói "constructor" không làm hỏng sổ, callTool không ném (p6)
    {
      const A = fresh(), call = (t, a) => A.m.callTool(t, a), P = pk('constructor', 'pa', { 'c-bop': snd('C', 'hai') });
      let threw = null, rs = [];
      try { rs = [await call('validate_sound_pack', { pack: P }), await call('save_sound_pack', { pack: P }), await call('get_sound_pack', { id: 'constructor' }), await call('delete_sound_pack', { id: 'constructor' })]; } catch (e) { threw = e; }
      no(threw || !rs[0].isError || !rs[1].isError || errOf(rs[2]).code !== 'NOT_FOUND' || errOf(rs[3]).code !== 'NOT_FOUND' || A.S.packs().length !== 1 || A.store.listSoundPacks().length, 'p6: id "constructor" — validate / save bị từ chối, get / delete NOT_FOUND, không ném, sổ + đĩa không đổi: ' + (threw && threw.message) + ' ' + rs.map(r => r.isError));
      let ie = null, ir = null; try { ir = A.m.importProject({ format: 'gen-chibi.project/1', project: { id: 'pa', name: 'pa' }, soundPacks: [P] }, {}); } catch (e) { ie = e; }
      no(ie || !ir.errors.some(e => e.kind === 'soundPacks' && /dành riêng/.test(e.error)), 'nhập gói có id "constructor": lỗi theo mục (kind soundPacks), không ném: ' + (ie && ie.message));
    }
    // CNS-105 qua MCP: lint_sound_track bị từ chối ngay khi quá trần (p2) — 15 000 bước, 13 bước, quá cỡ byte
    {
      const A = fresh(), call = (t, a, c) => A.m.callTool(t, a, c), t0 = Date.now();
      for (const [what, args, re] of [['15 000 bước', { steps: Array.from({ length: 15000 }, () => ({ sfx: ['zzaa', 'zzbb', 'zzcc'] })) }, /at most 12 steps/], ['13 bước', { steps: Array.from({ length: 13 }, () => ({ say: '' })) }, /at most 12 steps/], ['quá cỡ', { steps: Array.from({ length: 12 }, () => ({ say: 'x'.repeat(100000) })) }, /too large/]]) {
        const t1 = Date.now(), r = await call('lint_sound_track', args, { viaLink: true });
        no(!r.isError || errOf(r).code !== 'VALIDATION_FAILED' || !re.test(r.content[0].text) || Date.now() - t1 > 200, 'lint_sound_track (link) ' + what + ': VALIDATION_FAILED nhanh: ' + r.content[0].text.slice(0, 120) + ' ' + (Date.now() - t1) + ' ms');
      }
      const big = { work: 'w-big' }; await call('save_work', { id: 'w-big', title: 'Big' });
      const w = A.store.getWork('w-big'); w.shots = Array.from({ length: 40 }, (x, j) => ({ id: 'c' + j, event: { title: 't', steps: Array.from({ length: 12 }, (y, i) => ({ actor: 'a', state: 'normal', say: 'Xin chào.', sfx: ['zz-a' + j + i, 'zz-b' + j + i, 'zz-c' + j + i] })) } })); A.store.saveWork(w);
      const t2 = Date.now(), r2 = await call('lint_sound_track', big);
      no(!r2.isError || Date.now() - t2 > 1000 || errOf(r2).details.length < 5, 'lint_sound_track work lớn nhất lưu được (40 phân cảnh × 12 bước, toàn tên lạ) xong < 1 s (' + (Date.now() - t2) + ' ms)');
    }
    console.log('   ✓ CNS-101 / 108 / 112 / 105 qua MCP: lưu → xuất → nhập máy sạch (32 gói âm; gói động tác gọi âm gói chung / dự án khác; gói bán phụ thuộc nháp có cảnh báo; 8 gói động tác) · trần lưu = trần nhập · license / owner đi theo gói · id "constructor" · lint từ chối request quá trần ngay');
  });

  // ---------- 6. bộ mẫu Tam Quốc: gói âm + phân cảnh gán âm, lint sạch; phiên bản bộ mẫu đổi
  await sect(async () => {
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
    // CNS-109 (a): preview_shot cho agent (không nghe được) thấy ÂM NÀO SẼ PHÁT ở từng bước — tự gán, ghi tay, bước im ([]), bước ra đòn — kèm dự án + không khí
    const pvj = async shot => J(await m.callTool('preview_shot', { work: 'tq-vuon-dao-xich-bich', shot })), pv1 = await pvj('canh-1'), pv0 = await pvj('0'), pvd = await pvj('canh-dau-tap'), pv4 = await pvj('canh-4');
    no(!pv1.ready || pv1.project !== 'mau-tam-quoc' || pv1.mood !== 'epic' || JSON.stringify(pv1.beats.map(b => b.sfx)) !== '[["sparkle"],[],["tu-va","chime"],[],[],["sparkle","party"]]' || JSON.stringify(pv0.beats) !== JSON.stringify(pv1.beats), 'preview_shot canh-1: project + mood + sfx từng bước (tự gán; [] = bước im; tù và ở bước im trước lời thề): ' + JSON.stringify(pv1.beats.map(b => b.sfx)));
    no(pvd.mood !== 'tense' || pvd.beats.find(b => b.act === 'combo').sfx.join() !== 'trong-tran' || pvd.beats.find(b => b.act === 'thrust').sfx !== undefined || pv4.beats[0].sfx.join() !== 'vo-ngua', 'preview_shot: bước ra đòn mang sfx ghi tay (trống trận), đòn không âm thì bỏ trường; sfx ghi tay của bước thoại (vó ngựa)');
    console.log('   ✓ bộ mẫu Tam Quốc: kèm gói âm tq-am (7 âm), 3 phân cảnh gán âm, lintSoundTrack sạch, phiên bản mẫu ' + TQB.sample.version + ' khớp Studio');
  });

  // ---------- 7. hướng dẫn agent: một nguồn với engine
  await sect(async () => {
    const { GC } = fresh(), g = Agent.guide('sound'), S = GC.sounds, EN = require(ROOT + '/server/i18n-msg.js').en;   // hướng dẫn agent = tiếng Anh của đúng câu engine (CNS-067)
    no(!g || S.RULES.list.some(r => g.indexOf('**' + r.code + '**') < 0 || g.indexOf(EN(r.rule)) < 0), 'hướng dẫn "sound" chứa NGUYÊN VĂN 7 luật từ engine (sinh lúc chạy)');
    no(S.RECIPES.some(r => g.indexOf('`' + r.id + '`') < 0 || g.indexOf(EN(r.label)) < 0) || S.CATS.some(c => g.indexOf('`' + c[0] + '`') < 0), 'hướng dẫn "sound" chứa công thức mẫu + nhóm từ engine');
    no(/<!-- (example|generated):/.test(g), 'hướng dẫn "sound" không còn chỗ nhúng chưa thay');
    no(!Agent.topics().some(t => t.id === 'sound' && /sound library/.test(t.title)) || !/\| `sound` \|/.test(Agent.guide('guide')), 'chủ đề sound có trong danh sách + bảng GUIDE.md');
    const doc = fs.readFileSync(path.join(ROOT, 'docs/HUONG-DAN.md'), 'utf8');
    no(S.RULES.list.some(r => doc.indexOf('**' + r.code + '**') < 0) || S.CATS.some(c => doc.indexOf(c[1]) < 0) || S.RECIPES.some(r => r.seq.some(x => doc.indexOf(x[1]) < 0 && r.id === 'vo-chuoi')), 'docs/HUONG-DAN.md nhắc đủ 7 luật S1–S7 + 8 nhóm âm (lệch engine là đỏ)');
    // CNS-107: MỘT nguồn — mọi chỗ nói luật S1–S7 / ngưỡng khớp RULES TỪNG CÂU (đổi RULES mà quên chỗ chép tay = đỏ)
    const rowOf = r => '  | **' + r.code + '** | ' + (r.level === 'error' ? 'lỗi' : 'cảnh báo') + ' | ' + r.rule + ' |', tl = n => TOOLS.find(t => t.name === n).description, R = S.RULES, B = S.BUDGET, LM = S.LINT_MAX;
    const lv = lvl => R.list.filter(r => (lvl === 'error') === (r.level === 'error')).map(r => r.code).join();
    no(R.list.some(r => doc.indexOf(rowOf(r)) < 0), 'docs/HUONG-DAN.md: bảng S1–S7 khớp NGUYÊN VĂN từng câu của RULES + mức lỗi / cảnh báo (mất khớp: ' + R.list.filter(r => doc.indexOf(rowOf(r)) < 0).map(r => r.code) + ')');
    no(lv('error').replace(/,/g, ', ') !== R.levels.error || R.levels.warn !== 'S2–S5, S7', 'RULES.levels sinh từ mức của từng luật (gộp dãy liền): ' + JSON.stringify(R.levels));
    no(R.list.some(r => tl('lint_sound_track').indexOf(r.code + ' ' + EN(r.short)) < 0) || tl('lint_sound_track').indexOf('Errors (' + R.levels.error + ')') < 0 || tl('lint_sound_track').indexOf('warnings only (' + R.levels.warn + ')') < 0
      || tl('lint_sound_track').indexOf('≤ ' + LM.steps + ' steps per shot, ≤ ' + LM.shots + ' shots') < 0 || tl('save_shot').indexOf('errors (' + R.levels.error + ')') < 0 || tl('save_shot').indexOf('warnings (' + R.levels.warn + ')') < 0, 'mô tả tool lint_sound_track / save_shot sinh từ RULES: từng luật + mức + trần đầu vào');
    no(tl('get_sound_spec').indexOf('≤ ' + B.nodes + ' Web Audio nodes per sound, ≤ ' + B.layers + ' layers, ≤ ' + B.dur + ' s') < 0 || tl('get_sound_spec').indexOf(R.list.length + ' MIXING RULES S1–S' + R.list.length) < 0, 'mô tả get_sound_spec: ngân sách + số luật lấy từ engine');
    const appSrc = fs.readFileSync(path.join(ROOT, 'studio/app.js'), 'utf8');
    no(/\(S1, S6\)|\(S2–S5, S7\)|'Bảy luật/.test(appSrc.replace(/\/\/[^\n]*/g, '')), 'studio/app.js không chép tay mức lỗi / cảnh báo (S1, S6) · (S2–S5, S7) — lấy từ GC.sounds.RULES.levels');
    const gm = fs.readFileSync(path.join(ROOT, 'agent/GUIDE.md'), 'utf8'), swf = fs.readFileSync(path.join(ROOT, 'agent/workflows/sound.md'), 'utf8');
    no(+(/≤ (\d+) sfx per step/.exec(gm) || [])[1] !== R.maxPerStep || +(/≤ (\d+) Web Audio nodes/.exec(gm) || [])[1] !== B.nodes, 'agent/GUIDE.md luật vàng: số sfx / bước + node khớp RULES / BUDGET');
    no(+(/≤ (\d+) names per step/.exec(swf) || [])[1] !== R.maxPerStep || [B.nodes + ' Web Audio nodes per sound', '≤ ' + B.layers + ' layers', '≤ ' + B.dur + ' s', '≤ ' + B.sounds + ' sounds per pack', '≤ ' + B.bytes / 1000 + ' KB'].some(t => swf.indexOf(t) < 0), 'agent/workflows/sound.md: ngưỡng khớp RULES / BUDGET');
    const dq = /chỉ đặt `sfx` khi muốn \*\*nhấn\*\* \(≤ (\d+) âm, ≤ (\d+) âm nhấn/.exec(doc) || [];
    no(+dq[1] !== R.maxPerStep || +dq[2] !== R.maxAccent, 'docs/HUONG-DAN.md quy trình ghép: ngưỡng khớp RULES');
    const man = fs.readFileSync(path.join(ROOT, 'ASSET_MANIFEST.md'), 'utf8');
    no(!/gen\.am/.test(man) || !/kinds\/sound/.test(man) || !/không có tệp mẫu âm thanh/.test(man), 'ASSET_MANIFEST.md ghi nguồn + license âm thanh (tổng hợp bằng code, không tệp mẫu)');
    console.log('   ✓ hướng dẫn agent: luật S1–S7 / nhóm / công thức sinh từ engine (một nguồn) · chủ đề sound · docs / manifest khớp');
  });
  console.log('   (' + n + ' kiểm tra)');
  if (FAILS.length) { console.log('   ✗ ' + FAILS.length + ' kiểm tra đỏ'); process.exit(1); }
})().catch(e => { console.log('   ✗ ngoại lệ:', e.stack); process.exit(1); });
