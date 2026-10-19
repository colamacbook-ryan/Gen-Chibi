/* gen-chibi engine — voices 0.1: GIỌNG THEO VAI (tuổi × giới × văn / võ × tính cách) cho tiếng Việt, tiếng Anh, tiếng Trung
 * © 2026 Gen Labs — All rights reserved.
 *
 * Một nguồn cho mọi nơi cần "nhân vật này nói giọng gì": giọng AI (server/voice.js — Gemini TTS), giọng trình duyệt dự phòng
 * (engine/audio.js — speechSynthesis đúng ngôn ngữ + cao độ / tốc độ theo vai), Studio (ô chọn vai), MCP (get_catalog, render_voice).
 *   vai (ROLES): mô tả giọng bằng thẻ tiếng Anh đặt trong [ ] đầu câu (model không đọc to thẻ), danh sách giọng Gemini hợp vai
 *     (nhiều nhân vật cùng vai → mỗi người một giọng, ổn định theo id), cao độ / tốc độ cho giọng trình duyệt.
 *   ngôn ngữ (LANGS): mã BCP-47 cho trình duyệt + giọng vùng (thẻ accent) — tiếng Việt Bắc / Trung / Nam, Anh Mỹ / Anh, Trung phổ thông / Đài.
 *   cast(asset, opts) → hồ sơ giọng đầy đủ của một nhân vật; tags(cast, state, bubble) → thẻ đặt đầu câu.
 * Thuần dữ liệu, không đụng DOM: chạy trong trình duyệt, trong vm của server (loadEngine) và require() thẳng từ Node.
 * Thẻ vai / giọng vùng chỉnh được bằng tai: trang thử giọng ở Studio (Cài đặt AI › Giọng) — giọng Gemini nam / nữ là DỰ KIẾN.
 */
(function (GC) {
  'use strict';
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  // 30 giọng dựng sẵn của Gemini TTS (API không có lệnh liệt kê giọng): [tên, giới m/f (DỰ KIẾN — nghe thử trước khi chốt), chất giọng]
  var AI_VOICES = [
    ['Charon', 'm', 'trầm, rõ'], ['Algenib', 'm', 'khàn, dày'], ['Orus', 'm', 'chắc, dứt khoát'], ['Alnilam', 'm', 'chắc'], ['Rasalgethi', 'm', 'rõ ý'],
    ['Iapetus', 'm', 'trong, rõ'], ['Schedar', 'm', 'đều, điềm tĩnh'], ['Sadaltager', 'm', 'từng trải'], ['Algieba', 'm', 'mượt'], ['Enceladus', 'm', 'nhiều hơi thở'],
    ['Umbriel', 'm', 'thoải mái'], ['Zubenelgenubi', 'm', 'tự nhiên, đời thường'], ['Achird', 'm', 'thân thiện'], ['Puck', 'm', 'vui tươi'], ['Fenrir', 'm', 'hào hứng'], ['Sadachbia', 'm', 'sinh động'],
    ['Kore', 'f', 'chắc, rõ'], ['Gacrux', 'f', 'trưởng thành'], ['Sulafat', 'f', 'ấm áp'], ['Vindemiatrix', 'f', 'dịu dàng'], ['Achernar', 'f', 'nhẹ nhàng'], ['Despina', 'f', 'mượt'],
    ['Erinome', 'f', 'trong'], ['Callirrhoe', 'f', 'thoải mái'], ['Aoede', 'f', 'thoáng, nhẹ'], ['Pulcherrima', 'f', 'thẳng thắn'], ['Zephyr', 'f', 'sáng'], ['Autonoe', 'f', 'sáng'],
    ['Laomedeia', 'f', 'vui tươi'], ['Leda', 'f', 'trẻ trung']
  ].map(function (v) { return { name: v[0], gender: v[1], style: v[2] }; });
  var AI_SET = {}; AI_VOICES.forEach(function (v) { AI_SET[v.name] = v; });

  // nhóm tuổi theo thứ tự hiện trong ô chọn
  var AGES = [['tre-em', 'Trẻ em'], ['thieu-nien', 'Thiếu niên'], ['thanh-nien', 'Thanh niên'], ['trung-nien', 'Trung niên'], ['cao-tuoi', 'Cao tuổi']];
  // kiểu vai (văn / võ / quyền quý / tính cách) — để lọc và để Studio gom nhóm
  var KINDS = { thuong: 'Thường ngày', van: 'Văn', vo: 'Võ', quy: 'Quyền quý', hai: 'Hài', ac: 'Phản diện', ke: 'Kể chuyện' };

  // [id, nhãn, tuổi, giới m/f, kiểu, thẻ giọng (tiếng Anh, ngắn), giọng Gemini hợp vai (thứ tự ưu tiên), cao độ, tốc độ (giọng trình duyệt)]
  var ROLE_ROWS = [
    ['be-trai', 'Bé trai', 'tre-em', 'm', 'thuong', 'young boy, child voice, bright and playful', ['Puck', 'Fenrir', 'Sadachbia'], 1.55, 1.08],
    ['be-gai', 'Bé gái', 'tre-em', 'f', 'thuong', 'little girl, child voice, sweet and cheerful', ['Leda', 'Laomedeia', 'Zephyr', 'Autonoe'], 1.7, 1.08],
    ['thieu-nien', 'Cậu thiếu niên', 'thieu-nien', 'm', 'thuong', 'teenage boy, energetic', ['Fenrir', 'Puck', 'Achird'], 1.25, 1.06],
    ['thieu-nu', 'Cô thiếu nữ', 'thieu-nien', 'f', 'thuong', 'teenage girl, lively and clear', ['Leda', 'Autonoe', 'Zephyr'], 1.38, 1.06],
    ['nam-tre', 'Nam thanh niên', 'thanh-nien', 'm', 'thuong', 'young man, friendly and natural', ['Achird', 'Puck', 'Umbriel', 'Zubenelgenubi'], 1.05, 1.02],
    ['nu-tre', 'Nữ thanh niên', 'thanh-nien', 'f', 'thuong', 'young woman, warm and natural', ['Aoede', 'Callirrhoe', 'Despina', 'Zephyr'], 1.2, 1.02],
    ['hiep-khach', 'Hiệp khách trẻ', 'thanh-nien', 'm', 'vo', 'young swordsman, calm and confident', ['Iapetus', 'Orus', 'Algieba'], 1, 1],
    ['nu-tuong', 'Nữ tướng', 'thanh-nien', 'f', 'vo', 'fierce female warrior, firm and commanding', ['Kore', 'Pulcherrima'], 1, 1],
    ['tieu-thu', 'Tiểu thư / nữ văn sĩ', 'thanh-nien', 'f', 'van', 'elegant refined lady, soft and graceful', ['Despina', 'Erinome', 'Achernar', 'Vindemiatrix'], 1.15, 0.95],
    ['nam-trung-nien', 'Đàn ông trung niên', 'trung-nien', 'm', 'thuong', 'middle-aged man, steady', ['Charon', 'Iapetus', 'Schedar'], 0.9, 0.97],
    ['nu-trung-nien', 'Phụ nữ trung niên', 'trung-nien', 'f', 'thuong', 'middle-aged woman, warm and firm', ['Sulafat', 'Kore', 'Gacrux'], 1.02, 0.97],
    ['vo-tuong', 'Võ tướng', 'trung-nien', 'm', 'vo', 'powerful warrior general, booming and commanding', ['Alnilam', 'Orus', 'Algenib', 'Charon'], 0.72, 0.96],
    ['quan-su', 'Quân sư / văn sĩ', 'trung-nien', 'm', 'van', 'calm scholarly strategist, measured and wise', ['Sadaltager', 'Rasalgethi', 'Schedar', 'Iapetus'], 0.95, 0.9],
    ['vua-chua', 'Vua / chủ công', 'trung-nien', 'm', 'quy', 'regal ruler, dignified and authoritative', ['Charon', 'Schedar', 'Alnilam'], 0.85, 0.92],
    ['hoang-hau', 'Hoàng hậu / phu nhân', 'trung-nien', 'f', 'quy', 'regal noble lady, dignified and composed', ['Gacrux', 'Kore', 'Despina'], 1, 0.93],
    ['phan-dien', 'Phản diện', 'trung-nien', 'm', 'ac', 'menacing villain, sly and low', ['Algenib', 'Enceladus', 'Charon'], 0.8, 0.94],
    ['nu-phan-dien', 'Nữ phản diện', 'trung-nien', 'f', 'ac', 'cunning villainess, cold and smooth', ['Pulcherrima', 'Despina', 'Gacrux'], 0.95, 0.95],
    ['hai-huoc', 'Vai hài', 'thanh-nien', 'm', 'hai', 'comic sidekick, silly and exaggerated', ['Fenrir', 'Sadachbia', 'Puck'], 1.3, 1.14],
    ['nu-hai-huoc', 'Vai hài (nữ)', 'thanh-nien', 'f', 'hai', 'comic girl, bubbly and exaggerated', ['Laomedeia', 'Leda', 'Autonoe'], 1.4, 1.12],
    ['ong-lao', 'Ông lão', 'cao-tuoi', 'm', 'thuong', 'elderly old man, slow, slightly raspy, wise', ['Algenib', 'Sadaltager', 'Enceladus'], 0.8, 0.84],
    ['ba-lao', 'Bà lão', 'cao-tuoi', 'f', 'thuong', 'elderly old woman, slow, gentle, slightly shaky', ['Gacrux', 'Vindemiatrix', 'Sulafat'], 0.95, 0.84],
    ['ke-chuyen', 'Người kể chuyện', 'trung-nien', 'm', 'ke', 'warm storyteller narrator, even pacing', ['Schedar', 'Charon', 'Sulafat'], 0.95, 0.95]
  ];
  var ROLES = {};
  ROLE_ROWS.forEach(function (r) { ROLES[r[0]] = { id: r[0], label: r[1], age: r[2], gender: r[3], kind: r[4], tags: r[5], ai: r[6], pitch: r[7], rate: r[8] }; });

  // ngôn ngữ phim + giọng vùng; mặc định của mỗi ngôn ngữ đứng đầu. Thẻ giọng vùng đi cùng thẻ vai trong [ ] đầu câu.
  var LANGS = {
    vi: { label: 'Tiếng Việt', bcp: 'vi-VN', accents: [['bac', 'Giọng Bắc', 'Northern Vietnamese (Hanoi) accent'], ['nam', 'Giọng Nam', 'Southern Vietnamese (Saigon) accent'], ['trung', 'Giọng Trung (Huế)', 'Central Vietnamese (Hue) accent']] },
    en: { label: 'Tiếng Anh', bcp: 'en-US', accents: [['us', 'Anh Mỹ', 'American English accent'], ['uk', 'Anh Anh', 'British English accent']] },
    zh: { label: 'Tiếng Trung', bcp: 'zh-CN', accents: [['pt', 'Phổ thông', 'standard Mandarin Chinese'], ['tw', 'Đài Loan', 'Taiwanese Mandarin accent']] }
  };
  function lang(id) { return hasOwn(LANGS, id) ? id : 'vi'; }
  function accent(l, a) {
    var L = LANGS[lang(l)], i;
    for (i = 0; i < L.accents.length; i++) if (L.accents[i][0] === a) return L.accents[i];
    return L.accents[0];
  }

  // đoán vai từ vai trò / tính cách / tên (khi nhân vật chưa chọn vai). Vai trò + tính cách xét TRƯỚC tên:
  // "Bé Na — Nhân viên mới" là người lớn, chữ "Bé" trong tên chỉ là biệt danh. \b của JS không hiểu chữ có dấu → tự viết biên.
  var B = '(?:^|[\\s,.;:()/"\'-])', E = '(?=$|[\\s,.;:()/"\'-])';
  function kw(words) { return new RegExp(B + '(?:' + words + ')' + E, 'i'); }
  var FEMALE = kw('cô|chị|bà|nàng|công chúa|tiểu thư|bé gái|mẹ|nữ|phu nhân|hoàng hậu|tiên nữ|thiếu nữ|nữ tướng|nữ hiệp|girl|woman|lady|queen|princess|mother|她|女');
  var RULES = [   // [biểu thức, vai nam, vai nữ] — luật đầu tiên khớp thắng
    [kw('ông lão|ông già|ông cụ|cụ ông|bà lão|bà già|bà cụ|cụ bà|lão nhân|trưởng lão|lão ông|lão bà|ông nội|bà nội|ông ngoại|bà ngoại|elder|old man|old woman|grandpa|grandma|老人|老爷|奶奶|爷爷'), 'ong-lao', 'ba-lao'],
    [kw('em bé|bé trai|bé gái|trẻ con|nhóc|tiểu đồng|đứa trẻ|child|kid|little boy|little girl|孩子|小孩|童'), 'be-trai', 'be-gai'],
    [kw('thiếu niên|thiếu nữ|học sinh|cậu bé|cô bé|teen|teenager|student|少年|少女'), 'thieu-nien', 'thieu-nu'],
    [kw('vua|hoàng đế|thiên tử|hoàng thượng|chúa công|chủ công|chúa|king|emperor|lord|皇帝|主公|王'), 'vua-chua', 'hoang-hau'],
    [kw('hoàng hậu|phu nhân|thái hậu|queen|empress|皇后|夫人'), 'vua-chua', 'hoang-hau'],
    [kw('quân sư|mưu sĩ|thừa tướng|tiên sinh|thư sinh|học sĩ|văn sĩ|nho sinh|đạo sĩ|nhà thơ|strategist|scholar|advisor|军师|谋士|先生'), 'quan-su', 'tieu-thu'],
    [kw('hiệp khách|kiếm khách|hiệp sĩ|kiếm sĩ|swordsman|knight|侠|剑客'), 'hiep-khach', 'nu-tuong'],
    [kw('võ tướng|đại tướng|tướng quân|tướng|chiến binh|dũng sĩ|võ sĩ|lính|binh|warrior|general|soldier|将军|将|兵'), 'vo-tuong', 'nu-tuong'],
    [kw('phản diện|gian thần|gian|ác|tặc|cướp|ma vương|villain|bandit|evil|反派|贼'), 'phan-dien', 'nu-phan-dien'],
    [kw('hài|lầy|ngố|hề|comic|clown|funny|搞笑'), 'hai-huoc', 'nu-hai-huoc'],
    [kw('người kể chuyện|người dẫn chuyện|dẫn chuyện|narrator|旁白'), 'ke-chuyen', 'nu-trung-nien'],
    [kw('tiểu thư|công chúa|princess|小姐|公主'), 'nam-tre', 'tieu-thu'],
    [kw('sếp|giám đốc|trưởng phòng|bố|cha|mẹ|chú|bác|thầy|cô giáo|boss|manager|father|mother|teacher|老板|经理'), 'nam-trung-nien', 'nu-trung-nien']
  ];
  function textOf(a) { return a ? [a.role, a.persona, a.desc].filter(Boolean).join(' · ').toLowerCase() : ''; }
  function guessRole(a) {
    var meta = textOf(a), name = String((a && a.name) || '').toLowerCase(), fem = FEMALE.test(meta) || FEMALE.test(name), i;
    for (i = 0; i < RULES.length; i++) if (RULES[i][0].test(meta)) return RULES[i][fem ? 2 : 1];
    for (i = 0; i < RULES.length; i++) if (RULES[i][0].test(name)) return RULES[i][fem ? 2 : 1];
    return fem ? 'nu-tre' : 'nam-tre';
  }
  // băm chuỗi ổn định (FNV-1a) — cùng nhân vật luôn ra cùng giọng trong nhóm hợp vai
  function hash(s) { var h = 2166136261, i; s = String(s || ''); for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var num = function (n, lo, hi, d) { return typeof n === 'number' && isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

  // giọng Gemini cho vai: xoay danh sách hợp vai theo băm id (ổn định), bỏ giọng đã có người dùng trong cùng tác phẩm (taken);
  // hết giọng hợp vai thì lấy giọng cùng giới chưa ai dùng; hết nữa mới cho trùng
  function pickAi(R, asset, taken) {
    var h = hash(asset && (asset.id || asset.key || asset.name)), n = R.ai.length, i, k, t = taken || {};
    for (i = 0; i < n; i++) { k = R.ai[(h + i) % n]; if (!t[k]) return k; }
    var same = AI_VOICES.filter(function (v) { return v.gender === R.gender && !t[v.name]; });
    return same.length ? same[h % same.length].name : R.ai[h % n];
  }
  // hồ sơ giọng của một nhân vật. opts: { lang, accent } của tác phẩm (nhân vật có voice.accent riêng thì giữ của nhân vật)
  // → { role, label, gender, lang, bcp, accent, ai, tags (vai + giọng vùng), pitch, rate }
  function cast(asset, opts) {
    var v = (asset && asset.voice) || {}, o = opts || {};
    var rid = hasOwn(ROLES, v.role) ? v.role : guessRole(asset), R = ROLES[rid];
    var l = lang(o.lang), ac = accent(l, v.accent && accent(l, v.accent)[0] === v.accent ? v.accent : o.accent);
    var ai = typeof v.ai === 'string' && hasOwn(AI_SET, v.ai) ? v.ai : pickAi(R, asset, o.taken);
    return { role: rid, label: R.label, gender: R.gender, lang: l, bcp: LANGS[l].bcp, accent: ac[0], ai: ai,
      tags: R.tags + ', ' + ac[2], pitch: num(v.pitch, 0, 2, R.pitch), rate: num(v.rate, 0.5, 1.8, R.rate) };
  }
  // cả dàn diễn viên của một tác phẩm: mỗi người một giọng AI khác nhau khi còn giọng (người tự chọn giọng giữ trước) → { id: cast }
  function castAll(list, opts) {
    var taken = {}, out = {}, o = opts || {};
    (list || []).forEach(function (a) { var v = a && a.voice; if (v && hasOwn(AI_SET, v.ai)) taken[v.ai] = 1; });
    (list || []).forEach(function (a) {
      if (!a) return;
      var c = cast(a, { lang: o.lang, accent: o.accent, taken: taken });
      taken[c.ai] = 1; out[a.id || a.key || a.name] = c;
    });
    return out;
  }
  // thẻ cảm xúc (18 trạng thái của khung) + kiểu bong bóng — model đọc thẻ trong [ ] như chỉ dẫn diễn, không đọc to (đo 2026-10-19)
  var STATE_TAGS = {
    normal: '', work: 'focused', think: 'thoughtful', unsure: 'hesitant', smug: 'smug', greedy: 'greedy, sly', proud: 'proud',
    vow: 'determined, solemn', beg: 'pleading', shock: 'shocked', panic: 'panicked, fast', rage: 'angry', dizzy: 'dazed',
    cry: 'crying, sobbing', injured: 'in pain', exhausted: 'exhausted, out of breath', lazy: 'lazy, yawning', sleep: 'sleepy, mumbling'
  };
  var BUBBLE_TAGS = { shout: 'shouting', whisper: 'whispering', think: 'inner thought, softly' };
  function mood(state, bubble) { return [STATE_TAGS[state] || '', BUBBLE_TAGS[bubble] || ''].filter(Boolean).join(', '); }
  function tags(c, state, bubble) { return [c && c.tags, mood(state, bubble)].filter(Boolean).join(', '); }
  // danh sách cho ô chọn / catalog: [{ id, label, age, ageLabel, gender, kind, kindLabel }] theo nhóm tuổi
  function roleList() {
    var out = [];
    AGES.forEach(function (ag) { ROLE_ROWS.forEach(function (r) { if (r[2] === ag[0]) out.push({ id: r[0], label: r[1], age: r[2], ageLabel: ag[1], gender: r[3], kind: r[4], kindLabel: KINDS[r[4]] }); }); });
    return out;
  }
  function langList() {
    return Object.keys(LANGS).map(function (k) { return { id: k, label: LANGS[k].label, bcp: LANGS[k].bcp, accents: LANGS[k].accents.map(function (a) { return { id: a[0], label: a[1] }; }) }; });
  }

  var V = { AI_VOICES: AI_VOICES, isAiVoice: function (n) { return hasOwn(AI_SET, n); }, castAll: castAll, ROLES: ROLES, LANGS: LANGS, AGES: AGES, KINDS: KINDS, STATE_TAGS: STATE_TAGS, BUBBLE_TAGS: BUBBLE_TAGS,
    cast: cast, guessRole: guessRole, tags: tags, mood: mood, lang: lang, accent: function (l, a) { return accent(l, a)[0]; }, roleList: roleList, langList: langList };
  if (GC) GC.voices = V;
  if (typeof module === 'object' && module && module.exports) module.exports = V;
})(typeof window !== 'undefined' ? window.GenChibi : (typeof globalThis !== 'undefined' ? globalThis.GenChibi : undefined));
