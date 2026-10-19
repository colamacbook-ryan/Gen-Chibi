// gen-chibi — test 2m: thư viện âm thanh (engine/sounds.js, Node thuần): cổng kiểm từng luật một ca sai · ngân sách node · không mã ·
// tên trùng chỉ ra gói giữ tên · 17 tên cũ còn đủ · tự gán (cueFor) = bảng cứng cũ của engine/player.js · luật ghép S1–S7 · gói Tam Quốc.
// Chạy: node tools/test-sounds.js (bash tools/test.sh gọi). Phần nghe (dựng offline, độ to, rò node, CPU) ở tools/test-audio.mjs.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'engine/sounds.js'), 'utf8');
const TQ = JSON.parse(fs.readFileSync(path.join(ROOT, 'kinds/sound/tq-am.json'), 'utf8'));
const { loadEngine } = require(ROOT + '/server/engine-node.js');
let n = 0;
const FAILS = [];   // GC_KEEP_GOING=1: không thoát ở lỗi đầu — in hết để thấy ca nào đỏ trên mã cũ (thử ngược)
const no = (c, msg) => { if (c) { console.log('   ✗', msg); if (!process.env.GC_KEEP_GOING) process.exit(1); FAILS.push(msg); return; } n++; };
const clone = o => JSON.parse(JSON.stringify(o));
// sổ đăng ký mới tinh mỗi lần (mỗi vm một bản engine/sounds.js) — các ca không dính nhau
const fresh = () => { const w = { GenChibi: {} }, errs = []; vm.runInNewContext(SRC, { window: w, console: { error: (...a) => errs.push(a.join(' ')), warn() {}, log() {} } }, { filename: 'engine/sounds.js' }); no(errs.length, 'bộ âm chuẩn không qua cổng: ' + errs.join(' | ')); return w.GenChibi.sounds; };

// bảng tự gán cũ của engine/player.js (v0.17, dòng ~83–88) — chép NGUYÊN VĂN để so
const SFX_STATE = { shock: ['sting'], panic: ['sting'], rage: ['rumble'], proud: ['sparkle'], smug: ['sparkle'], vow: ['whoosh'], cry: ['sad'], sleep: ['snore'],
  think: ['hmm'], unsure: ['hmm'], greedy: ['chime'], dizzy: ['boing'], beg: ['drip'], exhausted: ['sad'], injured: ['hit'] };
const SFX_FX = { exclaim: 'sting', confetti: 'party', sparkles: 'sparkle', vein: 'rumble', fire: 'rumble', sweat: 'drip', sweatMany: 'drip', tears: 'sad', zzz: 'snore',
  question: 'hmm', dots: 'hmm', coins: 'chime', stars: 'boing' };
const SFX_ACT = { attack: 'swish', thrust: 'swish', charge: 'whoosh', jump: 'boing', victory: 'sparkle', cheer: 'party', bow: 'chime', salute: 'chime', kowtow: 'hit',
  faint: 'hit', scared: 'sting', run: 'whoosh', flee: 'whoosh' };
const uniq = a => a.filter((x, i) => x && a.indexOf(x) === i);
const old = s => uniq((SFX_STATE[s.state] || []).concat((s.fx || []).map(f => SFX_FX[f]), [SFX_ACT[s.activity]])).slice(0, 2);
const LEGACY = ['pop', 'whoosh', 'step', 'sting', 'hit', 'boing', 'sparkle', 'rumble', 'drip', 'sad', 'snore', 'party', 'hmm', 'gong', 'chime', 'swish', 'tick'];

// ---------- 1. bộ âm chuẩn: đủ, đa dạng, mọi âm có siêu dữ liệu
{
  const S = fresh(), all = S.list(), frame = all.filter(x => x.pack === 'gen.am');
  no(frame.length < 45 || frame.length > 64, 'bộ chuẩn cần 45…64 âm (đang có ' + frame.length + ')');
  no(LEGACY.some(x => !S.has(x)), '17 tên cũ phải còn đủ: thiếu ' + LEGACY.filter(x => !S.has(x)).join(', '));
  no(JSON.stringify(S.LEGACY) !== JSON.stringify(LEGACY), 'GC.sounds.LEGACY phải đúng 17 tên cũ, đúng thứ tự');
  for (const c of S.CATS) no(frame.filter(x => x.cat === c[0]).length < 4, 'nhóm "' + c[0] + '" cần ≥ 4 âm (đa dạng)');
  for (const x of frame) {
    no(!x.label || !x.use || x.use.length > 160 || !x.tags.length || !(x.nodes <= 60) || !(x.dur > 0), 'âm ' + x.name + ' thiếu nhãn / dùng khi / thẻ hoặc vượt ngân sách: ' + JSON.stringify(x));
  }
  // bản xuất của gói chạy lại qua cổng y hệt (JSON thuần, không trường nội bộ)
  const P = S.pack('gen.am'), again = S.validateSoundPack(P, { frame: true });
  no(again.errors.length, 'gen.am xuất ra không qua lại cổng: ' + again.errors.slice(0, 3).join(' | '));
  no(JSON.stringify(P) !== JSON.stringify(JSON.parse(JSON.stringify(P))) || /"(name|pack|nodes)":/.test(JSON.stringify(Object.values(P.sounds)[0]).replace(/"label":"[^"]*"/, '')), 'gói xuất phải là JSON thuần, không có name / pack / nodes trên từng âm');
  no(Object.keys(P.sounds).length !== frame.length, 'gói xuất thiếu âm');
  // từ vựng cue khớp engine (kịch bản), từ vựng âm của biên đạo / kịch bản đều có trong thư viện
  const GC = loadEngine(ROOT);
  no(JSON.stringify(S.VOCAB.state) !== JSON.stringify(Object.keys(GC.LIB.states)), 'VOCAB.state lệch GC.LIB.states');
  no(JSON.stringify(S.VOCAB.fx) !== JSON.stringify(Object.keys(GC.LIB.fx)), 'VOCAB.fx lệch GC.LIB.fx');
  no(JSON.stringify(S.VOCAB.activity) !== JSON.stringify(Object.keys(GC.LIB.activities)), 'VOCAB.activity lệch GC.LIB.activities');
  no(JSON.stringify(S.VOCAB.mood) !== JSON.stringify(GC.choreo.MOTION.music), 'VOCAB.mood lệch nhạc nền (MOTION.music)');
  no(GC.choreo.MOTION.sfx.some(x => !S.has(x)) || GC.FILM.sfx.some(x => !S.has(x)), 'âm của biên đạo (MOTION.sfx) / kịch bản (FILM.sfx) phải có trong thư viện');
  // không có mã trong cổng / sổ đăng ký
  no(/\beval\s*\(|new Function|Function\s*\(/.test(SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'engine/sounds.js không được dùng eval / Function');
  console.log('   ✓ bộ chuẩn gen.am: ' + frame.length + ' âm / ' + S.CATS.length + ' nhóm (' + S.CATS.map(c => c[0] + ' ' + frame.filter(x => x.cat === c[0]).length).join(' · ') + '), node nhiều nhất ' + Math.max(...frame.map(x => x.nodes)) + ' ≤ 60, 17 tên cũ đủ, từ vựng khớp engine');
}

// ---------- 2. cổng kiểm: mỗi luật một ca sai — bị chặn ĐÚNG chỗ, không ném lỗi, không treo
{
  const S = fresh();
  const base = () => ({ format: 'gen-chibi.sound/1', id: 'ci-am', name: 'CI', project: 'ci-du-an', sounds: { 'ci-coc': { label: 'Cốc', cat: 'hai', use: 'thử', tags: ['thử'], dur: 0.6, level: 0.8, rev: 0.1, vary: 0.03,
    lanes: [[-0.5, 0.5]], cue: { event: ['impact'], mood: ['comic'] },
    layers: [
      { k: 'tone', type: 'sine', hz: 400, to: 200, dur: 0.3, peak: 0.5, vib: 8, vibc: 40, lane: 0 },
      { k: 'noise', col: 'pink', type: 'bandpass', f0: 900, f1: 400, dur: 0.1, peak: 0.4, mv: [-0.2, 0.2] },
      { k: 'crackle', n: 4, span: 0.2, len: 0.02, f0: 1500, peak: 0.3 },
      { k: 'modes', hz: 800, list: [[1, 1, 0.2], [2.4, 0.4, 0.1, 0.001]], peak: 0.5 },
      { k: 'voice', hz: [[0, 300], [0.2, 350, 's']], cut: [[0, 900], [0.2, 1500]], amp: [[0, 0], [0.02, 1], [0.25, 0]], peak: 0.4, det: 6, ftype: 'bandpass' },
      { k: 'fm', hz: { v: 500, r: 100 }, curve: [[0, 500], [0.5, 900], [1, 300]], ratio: 2, index: 2, index1: 0.3, dur: 0.4, peak: 0.4, at: 0.1, jit: 0.02 },
      { k: 'mallet', inst: 'xylo', notes: [[0, 523.25], [0.05, 659.26, 0.8]], decay: 0.3, peak: 0.5, poly: 2 },
      { k: 'drum', hz: 150, to: 50, dur: 0.2, peak: 0.6, sat: 2, click: 0.4, snare: 0.5, nf: 2400 }
    ] } } });
  const ok0 = S.validateSoundPack(base());
  no(ok0.errors.length, 'gói mẫu của test phải hợp lệ: ' + ok0.errors.join('; '));
  // đếm node tĩnh (cổng) = đếm của từng nguyên hàm: 3 (gain, pan, vang) + 1 làn + tone 2+vib 2 · noise 3+mv 1 · crackle 3 · modes 2×2 · voice 3+2 · fm 4 · mallet 2·2·3 · drum 2+sat 1+click 3+snare 3
  no(ok0.def.sounds['ci-coc'].nodes !== 3 + 1 + 4 + 4 + 3 + 4 + 5 + 4 + 12 + 9, 'đếm node tĩnh sai: ' + ok0.def.sounds['ci-coc'].nodes);
  let cases = 0;
  const bad = (what, mut, re, opts) => {
    cases++;
    const p = base(); mut(p); let r; const t0 = Date.now();
    try { r = S.validateSoundPack(p, opts); } catch (e) { no(true, what + ': cổng ném lỗi thay vì báo lỗi — ' + e.message); }
    no(Date.now() - t0 > 300, what + ': cổng chạy quá lâu');
    no(!r.errors.length || r.def, what + ': phải bị chặn');
    if (re) no(!r.errors.some(e => re.test(e)), what + ': báo sai chỗ — ' + r.errors.slice(0, 3).join(' | '));
  };
  const L = (p, i) => p.sounds['ci-coc'].layers[i], SND = p => p.sounds['ci-coc'];
  bad('không phải object', p => { p.sounds = 'x'; }, /^sounds/);
  bad('format lạ', p => { p.format = 'gen-chibi.motion/1'; }, /^format/);
  bad('id hoa', p => { p.id = 'CI Am'; }, /^id/);
  bad('id "gen." không phải khung', p => { p.id = 'gen.am'; }, /gen\./);
  bad('khung sai id', p => { p.id = 'ci-am'; }, /khung/, { frame: true });
  bad('không có âm', p => { p.sounds = {}; }, /^sounds/);
  bad('65 âm', p => { for (let i = 0; i < 65; i++) p.sounds['ci-' + i] = clone(SND(p)); }, /^sounds: 1…64/);
  bad('tên âm hoa', p => { p.sounds.HIT = clone(SND(p)); }, /tên âm/);
  bad('tên âm JavaScript', p => { p.sounds.constructor = clone(SND(p)); }, /constructor/);
  bad('thiếu label', p => { delete SND(p).label; }, /\.label/);
  bad('cat lạ', p => { SND(p).cat = 'noi'; }, /\.cat/);
  bad('thiếu use', p => { delete SND(p).use; }, /\.use/);
  bad('use quá dài', p => { SND(p).use = 'x'.repeat(161); }, /\.use: dài quá/);
  bad('tags không phải chuỗi', p => { SND(p).tags = [1]; }, /\.tags/);
  bad('dur 5 s', p => { SND(p).dur = 5; }, /\.dur/);
  bad('level 3', p => { SND(p).level = 3; }, /\.level/);
  bad('rev 0.9', p => { SND(p).rev = 0.9; }, /\.rev/);
  bad('vary 0.5', p => { SND(p).vary = 0.5; }, /\.vary/);
  bad('hitAt sau dur', p => { SND(p).hitAt = 2; }, /\.hitAt/);
  bad('khoá lạ của âm', p => { SND(p).play = 'x'; }, /\.play: khoá lạ/);
  bad('không có lớp', p => { SND(p).layers = []; }, /\.layers/);
  bad('25 lớp', p => { SND(p).layers = Array.from({ length: 25 }, () => clone(L(p, 1))); }, /\.layers: mảng 1…24/);
  bad('loại lớp lạ', p => { L(p, 0).k = 'sample'; }, /layers\[0\]\.k/);
  bad('khoá lớp gõ nhầm (fo)', p => { L(p, 1).fo = 900; }, /layers\[1\]\.fo: khoá lạ/);
  bad('tone thiếu dur', p => { delete L(p, 0).dur; }, /thiếu "dur"/);
  bad('tone thiếu hz lẫn curve', p => { delete L(p, 0).hz; }, /cần "hz" hoặc "curve"/);
  bad('tần số 30 kHz', p => { L(p, 0).hz = 30000; }, /layers\[0\]\.hz/);
  bad('peak 2', p => { L(p, 0).peak = 2; }, /layers\[0\]\.peak/);
  bad('q 50', p => { L(p, 1).q = 50; }, /layers\[1\]\.q/);
  bad('sat 5', p => { L(p, 7).sat = 5; }, /layers\[7\]\.sat/);
  bad('NaN', p => { L(p, 0).peak = NaN; }, /layers\[0\]\.peak/);
  bad('{v, r} vượt khoảng', p => { L(p, 5).hz = { v: 15000, r: 5000 }; }, /\{ v, r \}/);
  bad('{v, r} có khoá lạ', p => { L(p, 5).hz = { v: 500, r: 10, x: 1 }; }, /layers\[5\]\.hz/);
  bad('n lẻ', p => { L(p, 2).n = 2.5; }, /layers\[2\]\.n: cần số nguyên/);
  bad('làn không có', p => { L(p, 0).lane = 3; }, /lane/);
  bad('path lùi giờ', p => { L(p, 0).path = [[0.2, 300], [0.1, 400]]; }, /tăng dần/);
  bad('curve không bắt đầu ở u = 0', p => { L(p, 5).curve = [[0.1, 500], [1, 300]]; }, /u = 0/);
  bad('modes list sai', p => { L(p, 3).list = [[1, 1]]; }, /layers\[3\]\.list/);
  bad('33 nốt', p => { L(p, 6).notes = Array.from({ length: 33 }, (x, i) => [i * 0.01, 440]); }, /notes/);
  bad("amp có 's'", p => { L(p, 4).amp = [[0, 0], [0.1, 1, 's'], [0.2, 0]]; }, /chỉ được là 's'/);
  bad('mv sai', p => { L(p, 1).mv = [0, 2]; }, /mv/);
  bad('sóng lạ', p => { L(p, 0).type = 'noise'; }, /type: chọn/);
  bad('nhạc cụ lạ', p => { L(p, 6).inst = 'piano'; }, /inst: chọn/);
  bad('lớp vượt dur của âm', p => { L(p, 0).at = 0.5; }, /> dur/);
  bad('a + hold ≥ dur', p => { L(p, 0).a = 0.2; L(p, 0).hold = 0.2; }, /a \+ hold/);
  bad('vibc thiếu vib', p => { delete L(p, 0).vib; }, /thiếu "vib"/);
  bad('vibd sau khi hết lớp', p => { L(p, 0).vibd = 0.4; }, /vibd/);
  bad('ngân sách node > 60', p => { SND(p).layers = Array.from({ length: 20 }, () => ({ k: 'tone', type: 'sawtooth', hz: 200, dur: 0.3, peak: 0.1, lp: 900, am: 5 })); delete SND(p).lanes; }, /node Web Audio > ngân sách 60/);
  bad('cue khoá lạ', p => { SND(p).cue = { emotion: ['shock'] }; }, /cue\.emotion/);
  bad('cue giá trị lạ', p => { SND(p).cue = { state: ['angry'] }; }, /cue\.state: giá trị lạ "angry"/);
  bad('cue chỉ có mood', p => { SND(p).cue = { mood: ['epic'] }; }, /cue\.mood: là điều kiện/);
  bad('hàm trong gói (không mã)', p => { SND(p).play = function () {}; }, /chứa mã/);
  bad('getter (không mã)', p => { Object.defineProperty(L(p, 0), 'peak', { get() { return 0.5; }, enumerable: true }); }, /getter/);
  bad('chuỗi mã trong ô số', p => { L(p, 0).hz = 'eval("1")'; }, /layers\[0\]\.hz/);
  bad('khoá __proto__', p => { SND(p).layers[0] = JSON.parse('{"k":"tone","__proto__":{"x":1},"hz":400,"dur":0.3,"peak":0.5}'); }, /__proto__/);
  bad('gói quá lớn', p => { p.description = 'x'.repeat(210000); }, /quá lớn/);
  // CNS-100: gói dùng chung (không dự án) KHÔNG được có cue — nếu được thì một gói đổi âm tự gán của KHUNG ở mọi dự án
  bad('cue của gói dùng chung (project rỗng)', p => { p.project = ''; }, /^sounds\.ci-coc\.cue: gói dùng chung không được đổi âm tự gán của khung/);
  bad('cue của gói dùng chung (không có project)', p => { delete p.project; }, /^sounds\.ci-coc\.cue: gói dùng chung/);
  // CNS-108: khoá lạ ở cấp gói là lỗi (project_id gõ nhầm từng lặng lẽ thành gói dùng chung); partial không bị bỏ im
  bad('khoá lạ cấp gói (project_id)', p => { p.project_id = 'tam-quoc'; }, /^pack\.project_id: khoá lạ ở cấp gói/);
  bad('khoá lạ cấp gói (bogus)', p => { p.bogus = 1; }, /^pack\.bogus: khoá lạ/);
  bad('gói chỉ có một phần (partial)', p => { p.partial = true; }, /^pack\.partial: đây là gói CHỈ CÓ MỘT PHẦN/);
  bad('license không phải chuỗi', p => { p.license = 5; }, /^pack\.license: cần chuỗi/);
  // CNS-112: id gói trùng thuộc tính của Object không được vào sổ
  ['constructor', 'prototype'].forEach(id => bad('id gói "' + id + '"', p => { p.id = id; }, /^id: "[a-z]+" là tên dành riêng của JavaScript/));
  // lúc NẠP gói đã lưu từ trước (tolerant): gói không rơi khỏi sổ — cue của gói chung bị bỏ, khoá lạ bị bỏ, kèm ghi chú có path
  const old1 = base(); old1.project = ''; old1.bogus = 1; old1.partial = true;
  const t1 = S.validateSoundPack(old1, { tolerant: true });
  no(t1.errors.length || !t1.def || t1.def.sounds['ci-coc'].cue !== undefined || t1.notes.length !== 3 || !t1.notes.some(x => /^sounds\.ci-coc\.cue: gói dùng chung/.test(x)) || !t1.notes.some(x => /^pack\.bogus/.test(x)) || !t1.notes.some(x => /^pack\.partial/.test(x)), 'nạp khoan dung: bỏ cue gói chung + khoá lạ, ghi chú có path: ' + JSON.stringify(t1));
  no(!S.validateSoundPack(old1).errors.length, 'lưu (không tolerant) vẫn là lỗi');
  no(!S.validateSoundPack(Object.assign(base(), { id: 'gen.am' }), { tolerant: true }).errors.length, 'tolerant không nới lỗi thật (id gen.)');
  // license / owner / author đi theo gói: nạp → xuất; PACK_META dùng thật (bản ghi store savedAt / note / version vẫn được chấp nhận)
  const lic = base(); lic.license = '© 2026 Gen Labs — All rights reserved'; lic.owner = 'Gen Labs'; lic.author = 'Ryan'; lic.savedAt = '2026-10-19T00:00:00Z'; lic.note = 'ghi chú'; lic.version = 3;
  const Sl = fresh(), rl = Sl.registerPack(lic);
  no(rl.errors.length || Sl.pack('ci-am').license !== lic.license || Sl.pack('ci-am').owner !== 'Gen Labs' || Sl.pack('ci-am').author !== 'Ryan' || 'savedAt' in Sl.pack('ci-am') || Sl.pack('ci-am').version !== 3, 'license / owner / author đi theo gói, bản ghi store thì bỏ: ' + JSON.stringify(rl.errors));
  no(!Sl.validateSoundPack(Sl.pack('ci-am')).def.license, 'bản xuất nạp lại vẫn mang license');
  // CNS-112: sổ đăng ký không prototype — tra theo id / tên lạ không ném, không trả thuộc tính của Object
  const Sp = fresh();
  no(Sp.pack('constructor') !== null || Sp.pack('__proto__') !== null || Sp.pack('toString') !== null || Sp.get('constructor') !== null || Sp.has('__proto__') || Sp.unregisterPack('constructor') !== false, 'sổ đăng ký tra id / tên "constructor", "__proto__" phải trả null / false, không ném');
  const rc = Sp.registerPack(Object.assign(base(), { id: 'constructor' }));
  no(!rc.errors.length || Sp.packs().some(x => x.id === 'constructor') || Sp.packs().length !== 1, 'id "constructor" bị cổng chặn, sổ không đổi: ' + JSON.stringify(rc.errors));
  console.log('   ✓ cổng kiểm: ' + cases + ' ca sai đều bị chặn đúng chỗ (khung, khoảng số, khoá lạ cả cấp gói, không mã, ngân sách node ≤ 60, cue chỉ khoá có thật, cue của gói chung, id dành riêng) · nạp khoan dung · license / owner đi theo gói · đếm node tĩnh đúng');
}

// ---------- 3. sổ đăng ký: tên chung toàn thư viện, trùng tên báo lỗi chỉ ra gói giữ tên; nạp lại = cập nhật; khung không gỡ được
{
  const S = fresh();
  const r = S.registerPack(clone(TQ));
  no(r.errors.length, 'gói Tam Quốc phải qua cổng: ' + r.errors.join(' | '));
  no(Object.keys(TQ.sounds).length < 5, 'gói Tam Quốc cần 5–8 âm');
  const dup = clone(TQ); dup.id = 'ci-trung'; dup.sounds = { hit: clone(TQ.sounds['kiem-co']) };
  const d1 = S.registerPack(dup);
  no(!d1.errors.length || !/sounds\.hit: trùng tên âm của gói "gen\.am"/.test(d1.errors[0]), 'trùng tên âm với khung phải bị chặn, chỉ ra gói gen.am: ' + d1.errors.join(' | '));
  const dup2 = clone(TQ); dup2.id = 'ci-trung-2'; dup2.sounds = { 'trong-tran': clone(TQ.sounds['trong-tran']) };
  const d2 = S.registerPack(dup2);
  no(!d2.errors.length || !/trùng tên âm của gói "tq-am"/.test(d2.errors[0]), 'trùng tên với gói dự án khác phải chỉ ra gói tq-am: ' + d2.errors.join(' | '));
  no(S.has('ci-trung') || S.get('trong-tran').pack !== 'tq-am', 'gói bị chặn không được để lại dấu vết');
  const v2 = clone(TQ); v2.version = 2; v2.sounds['trong-tran'].label = 'Trống trận v2'; delete v2.sounds['ngua-hi'];
  no(S.registerPack(v2).errors.length || S.get('trong-tran').label !== 'Trống trận v2' || S.has('ngua-hi'), 'nạp lại cùng id = cập nhật (âm bỏ đi thì gỡ)');
  no(S.unregisterPack('gen.am') !== false || !S.has('hit'), 'không gỡ được bộ khung');
  // nhìn thấy theo dự án: khung + gói dùng chung + gói của dự án
  no(S.names({ project: '' }).includes('trong-tran') || !S.names({ project: 'mau-tam-quoc' }).includes('trong-tran') || !S.names().includes('trong-tran'), 'names({project}) lọc sai');
  const L = S.list({ q: 'trong tran' });
  no(!L.length || L[0].name !== 'trong-tran', 'list tìm chữ bỏ dấu ("trong tran" → trong-tran)');
  no(S.list({ cat: 'nhac-cu', project: '' }).some(x => x.pack !== 'gen.am'), 'list({cat, project}) lọc sai');
  no(!S.list({ tag: 'mộc cầm' }).length, 'list({tag})');
  const I = S.info('wham');
  no(!I || I.hitAt !== 0.24 || I.cat !== 'danh' || I.accent || I.catLabel !== 'Va chạm & đánh', 'info(): ' + JSON.stringify(I));
  no(!S.packs().some(p => p.id === 'tq-am' && p.project === 'mau-tam-quoc' && p.version === 2), 'packs() liệt kê gói + dự án + phiên bản');
  // ví dụ trong spec chạy được (agent chép là dùng được)
  const ex = S.spec().example, re = S.registerPack(ex);
  no(re.errors.length, 'ví dụ trong spec() phải qua cổng: ' + re.errors.join(' | '));
  console.log('   ✓ sổ đăng ký: gói Tam Quốc ' + Object.keys(TQ.sounds).length + ' âm nạp được · trùng tên báo đúng gói giữ tên · nạp lại = cập nhật · khung không gỡ được · lọc theo dự án / nhóm / thẻ / chữ bỏ dấu · ví dụ spec chạy được');
}

// ---------- 4. tự gán: cueFor = bảng cứng cũ của engine/player.js (mọi tổ hợp), gói dự án ưu tiên đúng phạm vi
{
  const S = fresh(); S.registerPack(clone(TQ));        // gói dự án đã nạp KHÔNG được làm đổi kết quả của phim không thuộc dự án đó
  const GC = loadEngine(ROOT), ST = [undefined].concat(Object.keys(GC.LIB.states)), FX = Object.keys(GC.LIB.fx), AC = [undefined].concat(Object.keys(GC.LIB.activities));
  let cases = 0;
  const same = (s, ctx) => { cases++; const a = S.cueFor(Object.assign({}, s, ctx)), b = old(s); if (JSON.stringify(a) !== JSON.stringify(b)) no(true, 'cueFor lệch bảng cũ ở ' + JSON.stringify(s) + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };
  for (const st of ST) for (const ac of AC) { same({ state: st, activity: ac }); for (const f of FX) same({ state: st, fx: [f], activity: ac }); }
  for (const a of FX) for (const b of FX) for (const st of [undefined, 'shock', 'normal']) for (const ac of [undefined, 'run']) same({ state: st, fx: [a, b], activity: ac });
  for (const mood of ['calm', 'tense', 'epic', 'comic', 'sad']) for (const st of ST) for (const ac of AC) same({ state: st, activity: ac }, { mood });
  const T = S.cueTable();
  const flat = o => JSON.stringify(Object.keys(o).sort().map(k => [k, Array.isArray(o[k]) ? o[k][0] : o[k]]));
  no(flat(T.state) !== flat(SFX_STATE) || flat(T.fx) !== flat(SFX_FX) || flat(T.activity) !== flat(SFX_ACT), 'cueTable() phải bằng đúng ba bảng cũ');
  no(JSON.stringify(T.event) !== JSON.stringify({ impact: 'hit', miss: 'swish', block: 'do-don', enter: 'step', exit: 'zip', cut: 'whoosh' }), 'bảng sự kiện: ' + JSON.stringify(T.event));
  // gói dự án: chỉ trong dự án đó + điều kiện mood
  const P = 'mau-tam-quoc';
  no(JSON.stringify(S.cueFor({ activity: 'charge', mood: 'epic', project: P })) !== '["trong-tran"]', 'Tam Quốc + hùng tráng + xông lên → trống trận');
  no(JSON.stringify(S.cueFor({ activity: 'charge', mood: 'calm', project: P })) !== '["whoosh"]', 'không khí êm → về âm khung');
  no(JSON.stringify(S.cueFor({ activity: 'charge', mood: 'epic', project: 'van-phong' })) !== '["whoosh"]', 'dự án khác không dùng âm Tam Quốc');
  no(JSON.stringify(S.cueFor({ state: 'vow', mood: 'epic', project: P })) !== '["tu-va"]' || JSON.stringify(S.cueFor({ event: 'block', mood: 'epic', project: P })) !== '["kiem-co"]', 'tù và / kiếm cổ theo dự án');
  no(S.cueTable({ project: P, mood: 'epic' }).activity.charge !== 'trong-tran', 'cueTable theo dự án + mood');
  no(S.cueFor({ state: 'shock', fx: ['exclaim', 'confetti', 'coins'], activity: 'run', max: 3 }).length !== 3, 'max = 3');
  console.log('   ✓ tự gán: cueFor = bảng cứng cũ của player.js ở ' + cases + ' tổ hợp (state × fx × activity × mood, kể cả khi gói Tam Quốc đã nạp) · gói dự án thắng khung chỉ trong dự án đó + đúng mood');
}

// ---------- 5. luật ghép S1–S7: mỗi luật một ca bắt, một ca không bắt; kịch bản sạch không cảnh báo
{
  const S = fresh(); S.registerPack(clone(TQ));
  const codes = (steps, o) => S.lintSoundTrack(steps, o).map(w => w.code);
  const has = (steps, code, o) => codes(steps, o).includes(code);
  const clean = [
    { actor: 'a', state: 'normal', say: 'Chào buổi sáng cả nhà.' },
    { actor: 'b', state: 'shock', say: '', sfx: ['sting'] },
    { actor: 'b', state: 'panic', say: 'Trễ giờ rồi!' },
    { actor: 'a', state: 'normal', say: 'Bình tĩnh nào.', activity: 'attack', sfx: ['swish'] },
    { actor: 'b', state: 'dizzy', say: 'Ôi đầu tôi.', sfx: ['tweet'] },
    { actor: 'a', state: 'proud', say: '', sfx: ['ta-da'] }
  ];
  no(S.lintSoundTrack(clean).length, 'kịch bản sạch không được có cảnh báo: ' + JSON.stringify(S.lintSoundTrack(clean)));
  no(!has([{ say: '', sfx: ['pop', 'drip', 'tick', 'chime'] }], 'S1'), 'S1: 4 âm một bước');
  no(!has([{ say: '', sfx: ['ding', 'ta-da'] }], 'S1') || has([{ say: '', sfx: ['ding', 'pop'] }], 'S1'), 'S1: hai âm nhấn một bước (một âm nhấn + một âm thường thì không)');
  const busy = Array.from({ length: 3 }, () => ({ say: 'Ừ.', sfx: ['pop', 'drip', 'chime'] }));
  no(!has(busy, 'S2') || has([{ say: 'Ừ.', sfx: ['pop', 'drip', 'chime'] }, { say: 'Một hai ba bốn năm sáu bảy tám chín mười.' }, { say: 'Ừ.', sfx: ['pop', 'drip', 'chime'] }], 'S2'), 'S2: ba bước ngắn liền mỗi bước 3 âm = dày; cách nhau một câu dài thì không');
  no(!has([{ say: 'Trời ơi là trời!', sfx: ['sting'] }], 'S3') || has([{ say: '', sfx: ['sting'] }], 'S3'), 'S3: âm nhấn đè lời thoại (bước không lời thì không)');
  no(!has([{ say: 'Này!', sfx: ['hit'] }], 'S4') || !has([{ say: 'Đỡ này!', action: 'punch', target: 'b', sfx: ['pow'] }], 'S4') || has([{ say: 'Đỡ này!', activity: 'attack', sfx: ['pow'] }], 'S4'), 'S4: âm va chạm rải tay / chồng âm của đòn (activity attack thì được)');
  const rep = k => Array.from({ length: k }, () => ({ say: 'Ừm.', sfx: ['chime'] }));
  no(!has(rep(4), 'S5') || has(rep(3), 'S5') || has(Array.from({ length: 6 }, () => ({ say: 'Đi.', sfx: ['step'] })), 'S5'), 'S5: cùng âm 4 bước liền (3 bước thì được, step thì được)');
  const auto = S.lintSoundTrack(Array.from({ length: 4 }, () => ({ say: 'Để xem nào.', state: 'think' }))).filter(w => w.code === 'S5');
  no(!auto.length || !/tự gán/.test(auto[0].msg), 'S5 bắt cả âm tự gán (4 bước think → hmm) và nói cách thay');
  const s6 = S.lintSoundTrack([{ say: '', sfx: ['bonkk'] }]);
  no(!s6.length || s6[0].code !== 'S6' || s6[0].level !== 'error' || !/gần nhất: "bonk"/.test(s6[0].msg), 'S6: tên lạ + gợi ý gần nhất: ' + JSON.stringify(s6));
  const s6b = S.lintSoundTrack([{ say: '', sfx: ['trong-tran'] }], { project: 'van-phong' });
  no(!s6b.length || !/gói "tq-am" của dự án khác/.test(s6b[0].msg) || S.lintSoundTrack([{ say: '', sfx: ['trong-tran'] }], { project: 'mau-tam-quoc' }).length, 'S6: âm của dự án khác là lỗi, trong đúng dự án thì không');
  no(S.suggest('trong tran', 'mau-tam-quoc') !== 'trong-tran' || S.suggest('sấm', '') !== 'sam', 'gợi ý theo nhãn / thẻ bỏ dấu');
  no(!has([{ say: '' }, { say: '', sfx: ['gong'] }, { say: '' }], 'S7') || has([{ say: '', sfx: ['gong'] }, { say: '' }], 'S7'), 'S7: âm dài giữa cảnh (đầu cảnh thì được)');
  // dạng đầu vào: tác phẩm / phân cảnh / mảng; sai dạng → S0
  const work = { shots: [{ event: { steps: [{ say: '', sfx: ['bonkk'] }] } }, { event: { steps: [{ say: '', sfx: ['pop', 'drip', 'tick', 'chime'] }] } }] }, W = S.lintSoundTrack(work);
  no(W.length !== 2 || W[0].path !== 'shots[0].event.steps[0].sfx[0]' || W[1].shot !== 1, 'lint tác phẩm: đường dẫn + chỉ số phân cảnh: ' + JSON.stringify(W));
  no(S.lintSoundTrack({ event: { steps: [{ say: '', sfx: ['bonkk'] }] } })[0].path !== 'event.steps[0].sfx[0]', 'lint phân cảnh');
  no(S.lintSoundTrack('x')[0].code !== 'S0', 'đầu vào sai dạng → S0');
  // một nguồn: luật / nhóm / công thức nằm trong guide + spec
  const G = S.guide();
  no(S.RULES.list.map(r => r.code).join() !== 'S1,S2,S3,S4,S5,S6,S7' || S.RULES.list.some(r => G.indexOf('**' + r.code + '**') < 0), 'guide phải có đủ S1–S7');
  no(S.CATS.some(c => G.indexOf('(`' + c[0] + '`)') < 0) || S.names({ project: '' }).some(x => G.indexOf('`' + x + '`') < 0), 'guide phải liệt kê mọi nhóm + mọi âm');
  no(S.RECIPES.some(r => r.seq.some(x => !S.has(x[1]) || S.get(x[1]).pack !== 'gen.am')), 'công thức ghép mẫu chỉ dùng âm của khung');
  no(S.RECIPES.some(r => S.lintSoundTrack(r.seq.map(x => ({ say: '', sfx: [x[1]] }))).some(w => w.level === 'error')), 'công thức ghép mẫu (mỗi âm một bước) không được phạm lỗi');
  const sp = S.spec();
  no(sp.format !== 'gen-chibi.sound/1' || Object.keys(sp.kinds).length !== 8 || !sp.ranges.hz || sp.rules.length !== 7 || sp.budget.nodes !== 60, 'spec() đủ khuôn');
  console.log('   ✓ luật ghép S1–S7: mỗi luật một ca bắt + một ca không bắt, kịch bản sạch 0 cảnh báo, S6 gợi ý tên gần nhất / chặn âm dự án khác · guide + spec một nguồn (' + G.length + ' ký tự)');
}
console.log('   (' + n + ' kiểm tra)');
if (FAILS.length) { console.log('   ✗ ' + FAILS.length + ' kiểm tra đỏ'); process.exit(1); }
