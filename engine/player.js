/* gen-chibi engine — player 0.2 "Phim sống": trình diễn TÁC PHẨM có dàn dựng
 * © 2026 Gen Labs — All rights reserved.
 *
 * Dùng chung cho Studio (Tạo tác › Tác phẩm) và tệp phim xuất ra (HTML độc lập, không cần cài gì).
 * Cần engine/core.js + engine/render.js; engine/audio.js (nếu có) cho hiệu ứng âm thanh, nền, nhạc và giọng nói.
 *
 *   GC.film.readiness(work)      → [{ shot, index, ok, missing: [...] }]   phân cảnh nào diễn được, thiếu gì
 *   GC.film.still(shot)          → chuỗi SVG ảnh tĩnh của phân cảnh (bối cảnh + diễn viên ở chỗ đứng)
 *   GC.film.direct(shot, {project}) → KẾ HOẠCH DÀN DỰNG (thuần dữ liệu, chạy cả trong Node): ai ra sân từ đâu, ai đi tới đâu,
 *                                   ai nói với ai, quay mặt, cử chỉ, bong bóng, máy quay, hiệu ứng màn hình, âm thanh, khẩu hình.
 *                                   Âm tự gán lấy từ thư viện âm (GC.sounds.cueFor theo state / fx / activity + không khí plan.mood + dự án plan.project):
 *                                   dự án = opts.project > shot.project > dự án của bối cảnh / diễn viên; thiếu engine/sounds.js thì bảng cứng cũ (SFX_STATE / SFX_FX / SFX_ACT)
 *   GC.film.player(el, opts)     → { show(shot), play(shots, title), stop(), destroy(), setDialog(mode), dialog(), setLang(lang, accent), setProject(p), plan() }
 *                                   opts.onProgress(text), opts.onEnd(), opts.dialog = 'auto' | 'bubble' | 'caption'
 *                                   opts.project (chuỗi | hàm → chuỗi) / setProject(p) = dự án của tác phẩm → chọn gói âm (S6): âm tự gán + âm sự kiện (trúng đòn / đỡ / hụt / bước chân / chuyển máy)
 *                                   opts.lang / opts.accent = ngôn ngữ phim (vi | en | zh) + giọng vùng → giọng trình duyệt đúng ngôn ngữ theo vai (engine/voices.js)
 *                                   opts.voiceClip(line, asset) → Promise<clip>|clip|null: giọng thu sẵn (vd. giọng AI) cho một câu; clip = ArrayBuffer / URL / data: URI
 *                                     như GC.audio.say. Bộ phát hỏi TRƯỚC khi nói (chờ tối đa opts.clipWait ms — số hoặc hàm (line) → ms, mặc định 2500); có clip thì phát clip,
 *                                     lỗi / null / quá hạn thì giọng trình duyệt như cũ. Đầu mỗi phân cảnh hỏi trước mọi câu (song song ≤ 2) để lúc nói đã sẵn.
 *                                   opts.needGood = true | (line) → boolean: câu không có clip chỉ được đọc bằng giọng trình duyệt hạng GOOD (thần kinh / Google / Apple có tên), không thì blip —
 *                                     hỏi lúc nói. Người gọi bật khi chế độ giọng "tự động" và tác phẩm có clip AI (đừng để robot lẫn giọng AI); chọn hẳn "máy đọc" thì không bật.
 *   GC.film.clipKey(line)        → khoá một câu thoại (diễn viên | cảm xúc | kiểu bong bóng | chữ) — bộ phát và Studio / phim xuất ra cùng dùng
 *   GC.film.lines(work)          → [{ key, line, actor, shot }] mọi câu thoại cần giọng của tác phẩm, ĐÚNG như bộ phát sẽ đọc (beat của direct() theo
 *                                   dự án tác phẩm, bỏ phân cảnh chưa diễn được, mỗi clipKey một lần) — Studio lồng tiếng / xuất phim và server đếm
 *                                   "Giọng AI x/y" cùng dùng (CNS-146: trước đây server đếm theo bước thô → lệch khi đạo diễn đổi cảm xúc / bong bóng)
 *   GC.film.solveLayout(ctx)     → BỐ CỤC LỜI THOẠI (thuần số, chạy cả trong Node): chọn chỗ cho bong bóng / phụ đề sao cho không che đầu ai
 *
 * Ngân sách (L-42): diễn viên sống ≤ GC.render.budget mỗi phân cảnh, hết cảnh là huỷ; máy quay = một transform CSS;
 * nhép miệng chỉ thay LỚP MIỆNG của người đang nói (không dựng lại cả nhân vật); âm thanh tổng hợp, không tải tệp.
 * Giọng thu sẵn (v0.17): hỏi clip MỘT lần mỗi câu (đầu phân cảnh, ≤ 2 yêu cầu song song), không việc gì mỗi khung hình.
 * Lời thoại (v0.17): bố cục tính MỘT lần mỗi câu (+ khi đổi cỡ khung / máy quay), không tính mỗi khung hình; phông Be Vietnam Pro nhúng ở engine/fonts.js.
 */
(function (GC) {
  'use strict';
  var MY_PACK = 'local.my';
  // NGÔN NGỮ (ADR 0007): chữ người xem thấy đi qua engine/i18n.js (Studio, phim xuất ra nhúng bảng player + engine); thiếu i18n thì giữ msgid
  function _t(s, v) { var I = GC.i18n; return I ? I.t(s, v) : String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && Object.prototype.hasOwnProperty.call(v, k) ? String(v[k]) : m; }); }
  function _l(s) { var I = GC.i18n; return I ? I.label(s) : s; }
  var FILL = ['midLeft', 'midRight', 'left', 'right', 'center', 'backLeft', 'backRight', 'back'];

  function actors(shot) {
    return (shot && shot.cast || []).map(function (k) { return GC.ASSETS[k] || GC.getAsset(k, MY_PACK); }).filter(Boolean);
  }
  function scene(shot) { return shot && shot.scene ? GC.getScene(shot.scene, MY_PACK) : null; }
  // chỗ đứng: theo bước thoại đầu tiên có spot; ai chưa có thì xếp vào chỗ trống theo thứ tự ưu tiên
  function spots(shot, sc, ids) {
    var at = {};
    (shot.event && shot.event.steps || []).forEach(function (st) { if (st.spot && !at[st.actor]) at[st.actor] = st.spot; });
    var taken = function (k) { return Object.keys(at).some(function (a) { return at[a] === k; }); };
    var free = FILL.filter(function (k) { return sc.spots.indexOf(k) >= 0 && !taken(k); });
    ids.forEach(function (id) { if (!at[id]) at[id] = free.shift() || sc.spots[0]; });
    return at;
  }
  // phân cảnh diễn được khi: có bối cảnh còn trong Thư viện, có diễn viên còn trong Thư viện, có lời thoại
  // MỘT định nghĩa "sẵn sàng" cho cả bảng tình trạng, sân khấu Studio và phim xuất ra
  function issues(s) {
    var miss = [], sc = scene(s), acts = actors(s), needs = [];
    if (!s.scene) { miss.push(_t('bối cảnh')); needs.push('scene'); } else if (!sc) { miss.push(_t('bối cảnh đã bị xoá khỏi Thư viện')); needs.push('scene'); }
    if (!(s.cast || []).length) { miss.push(_t('diễn viên')); needs.push('cast'); } else if (acts.length < s.cast.length) { miss.push(_t('{n} diễn viên không còn trong Thư viện', { n: s.cast.length - acts.length })); needs.push('cast'); }
    if (!s.event) { miss.push(_t('lời thoại')); needs.push('event'); }
    if (sc && acts.length > sc.spots.length) { miss.push(_t('dàn diễn viên nhiều hơn chỗ đứng')); needs.push('spots'); }
    // hành động (v0.16, CNS-042): đòn phải có (khung hoặc gói động tác đã nạp) và người làm phải làm được (needs) — thiếu thì BÁO, không lặng lẽ bỏ đòn
    var C = GC.choreo, AC = (C && C.ACTIONS) || {};
    (s.event && s.event.steps || []).forEach(function (st) {
      if (!st || !st.action) return;
      if (!Object.prototype.hasOwnProperty.call(AC, st.action)) { miss.push(_t('đòn "{action}" không có — cài / cập nhật gói động tác có đòn này', { action: st.action })); needs.push('action'); return; }
      var who = acts.filter(function (a) { return a.id === st.actor; })[0];
      if (who && C.canDo && !C.canDo(who, AC[st.action])) { miss.push(_t('{name} không làm được "{action}" (cần binh khí)', { name: who.name, action: _l(AC[st.action].label) })); needs.push('weapon'); }
    });
    miss.needs = needs;   // mã loại thiếu (không phụ thuộc ngôn ngữ): scene · cast · event · spots · action · weapon
    return miss;
  }
  function readiness(work) {
    return (work && work.shots || []).map(function (s, i) { var miss = issues(s); return { shot: s, index: i, ok: !miss.length, missing: miss.slice(), needs: miss.needs }; });
  }
  function still(shot) {
    var sc = scene(shot), acts = actors(shot);
    if (!sc) return '';
    var at = spots(shot, sc, acts.map(function (a) { return a.id; }));
    var first = {};
    (shot.event && shot.event.steps || []).forEach(function (st) { if (!first[st.actor]) first[st.actor] = st; });
    return GC.sceneSvg(sc, { cast: acts.map(function (a) {
      var st = first[a.id] || {}, c = { character: a.key, spot: at[a.id], state: st.state || 'normal' };
      if (st.activity) c.activity = st.activity;
      return c;
    }) });
  }

  /* ============================================================ ĐẠO DIỄN TỰ ĐỘNG (không DOM) */
  // Kịch bản chỉ cần ai nói gì, cảm xúc gì, đứng đâu. Phần còn lại (đi lại, quay mặt, cử chỉ, máy quay, bong bóng, âm thanh)
  // suy ra ở đây — người viết / AI vẫn ghi đè từng bước bằng to, camera, bubble, sfx, activity, motion, view.
  var SHOUT = { rage: 1, shock: 1, panic: 1, vow: 1 };
  var THINK = { think: 1, sleep: 1 };
  var KEEP = { sleep: 1, cry: 1, injured: 1, exhausted: 1, dizzy: 1 };   // trạng thái người nghe giữ nguyên (không "tỉnh lại" giữa chừng)
  // BẢNG CỨNG CŨ (v0.17) — chỉ còn là DỰ PHÒNG khi chưa nạp engine/sounds.js; có thư viện âm thì GC.sounds.cueFor quyết (cue của từng âm, theo dự án + không khí)
  var SFX_STATE = { shock: ['sting'], panic: ['sting'], rage: ['rumble'], proud: ['sparkle'], smug: ['sparkle'], vow: ['whoosh'], cry: ['sad'], sleep: ['snore'],
    think: ['hmm'], unsure: ['hmm'], greedy: ['chime'], dizzy: ['boing'], beg: ['drip'], exhausted: ['sad'], injured: ['hit'] };
  var SFX_FX = { exclaim: 'sting', confetti: 'party', sparkles: 'sparkle', vein: 'rumble', fire: 'rumble', sweat: 'drip', sweatMany: 'drip', tears: 'sad', zzz: 'snore',
    question: 'hmm', dots: 'hmm', coins: 'chime', stars: 'boing' };
  var SFX_ACT = { attack: 'swish', thrust: 'swish', charge: 'whoosh', jump: 'boing', victory: 'sparkle', cheer: 'party', bow: 'chime', salute: 'chime', kowtow: 'hit',
    faint: 'hit', scared: 'sting', run: 'whoosh', flee: 'whoosh' };
  var MOOD = { rage: 'tense', shock: 'tense', panic: 'tense', injured: 'tense', proud: 'epic', vow: 'epic', cry: 'sad', beg: 'sad', exhausted: 'sad',
    smug: 'comic', lazy: 'comic', greedy: 'comic', dizzy: 'comic' };
  var CLOSED = { smile: 1, flat: 1, cat: 1, grin: 1, wavy: 1, bite: 1 };
  // diễn bằng chân: cảm xúc tiến tới người nghe / lùi lại (đơn vị toạ độ cảnh, 640 = cả khung)
  var LEAN = { rage: 44, vow: 34, beg: 30, smug: 22, greedy: 22, proud: 16, shock: -36, panic: -30, unsure: -16 };

  // vị trí ngang: tên chỗ đứng, hoặc toạ độ x (sau một màn đấu nhân vật không còn đứng đúng chỗ)
  function sx(spot) { if (typeof spot === 'number') return spot; var s = GC.SCENE.spots[spot]; return s ? s.x : 320; }
  function words(t) { return String(t || '').trim().split(/\s+/).filter(Boolean).length; }
  // màu thẻ tên: màu chủ đạo của nhân vật, đủ đậm để chữ trắng đọc được (áo trắng thì lấy viền / mũ)
  function lum(c) { var n = parseInt(c.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
  function colorOf(a) { var p = (a.look && a.look.palette) || {}; return [p.robe, p.hat, p.armor, p.trim, p.accent, p.cape].filter(function (c) { return /^#[0-9a-f]{6}$/i.test(c || '') && lum(c) < 0.62; })[0] || '#4a5563'; }
  function nearest(id, ids, cur) {
    var best = null, bd = 1e9;
    ids.forEach(function (o) { if (o === id) return; var d = Math.abs(sx(cur[o]) - sx(cur[id])); if (d < bd) { bd = d; best = o; } });
    return best;
  }
  function moodOf(steps) {
    var n = {};
    steps.forEach(function (s) { var m = MOOD[s.state] || 'calm'; n[m] = (n[m] || 0) + 1; });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || (a === 'calm' ? 1 : -1); })[0] || 'calm';
  }
  function own(o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }   // tra bảng không dính prototype (constructor, toString…)
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function faceTo(cur, me, target) {
    if (!target || !cur[target]) return 'front';
    var d = sx(cur[target]) - sx(cur[me]);
    return d < -4 ? 'left45' : d > 4 ? 'right45' : 'front';
  }

  // dự án của phân cảnh để chọn gói âm: người gọi chỉ định > shot.project > dự án của bối cảnh > dự án của diễn viên đầu tiên có dự án (phim xuất mang project của tác phẩm)
  // quyết ở GC.sounds.projectFor — cùng hàm với lược đồ đạo diễn, Bảng bước và S6 (CNS-104); chưa nạp sounds.js thì cách cũ
  function projectOf(shot, o) {
    if (GC.sounds && GC.sounds.projectFor) return GC.sounds.projectFor({ project: o && o.project, shot: shot, scene: scene(shot), cast: actors(shot) });
    if (o && typeof o.project === 'string') return o.project;
    if (shot && typeof shot.project === 'string') return shot.project;
    var sc = scene(shot), a = actors(shot).filter(function (x) { return x.project; })[0];
    return (sc && sc.project) || (a && a.project) || '';
  }
  // âm tự gán cho một bước: thư viện âm (cue của từng âm; gói dự án thắng khung; điều kiện mood) — không có thư viện thì bảng cứng cũ
  function autoSfx(s, mood, project) {
    if (GC.sounds) return GC.sounds.cueFor({ state: s.state, fx: s.fx, activity: s.activity, mood: mood, project: project });
    return uniq((SFX_STATE[s.state] || []).concat((s.fx || []).map(function (f) { return SFX_FX[f]; }), [SFX_ACT[s.activity]])).slice(0, 2);
  }
  function direct(shot, o) {
    var sc = scene(shot), ev = shot && shot.event;
    if (!sc || !ev) return null;
    var budget = GC.render ? GC.render.budget : 8;
    var list = actors(shot).slice(0, budget), ids = list.map(function (a) { return a.id; });
    var home = spots(shot, sc, ids), cur = {}, state = {}, steps = (ev.steps || []).filter(function (s) { return ids.indexOf(s.actor) >= 0; });
    var sky = sc.layers && sc.layers.sky && GC.getPart && GC.getPart('sky', sc.layers.sky.part);
    var plan = { scene: sc, mood: moodOf(steps), project: projectOf(shot, o), ambient: { time: sc.time || 'day', weather: sc.weather || 'clear', indoor: !!(sky && sky.outdoor === false) }, cast: [], beats: [], warnings: [] };
    // ra sân: ai đứng nửa trái vào từ trái, nửa phải vào từ phải; so le để không ùa vào cùng lúc
    list.forEach(function (a, i) {
      var to = home[a.id];
      plan.cast.push({ id: a.id, key: a.key, name: a.name, home: to, color: colorOf(a), voice: a.voice || null, role: a.role || '', persona: a.persona || '' });
      var first = (ev.steps || []).filter(function (s) { return s.actor === a.id; })[0];
      plan.beats.push({ type: 'enter', actor: a.id, from: sx(to) < 320 ? 'left' : 'right', to: to, delay: +(i * 0.28).toFixed(2),
        gait: first && (first.state === 'panic' || first.state === 'rage') ? 'run' : 'walk' });
      cur[a.id] = to; state[a.id] = 'normal';
    });
    var prev = null, lastCam = null, pair = null, byId = {}, row = {};
    list.forEach(function (a) { byId[a.id] = a; row[a.id] = GC.SCENE.spots[home[a.id]] || GC.SCENE.spots.center; });
    var C = GC.choreo, AC = (C && C.ACTIONS) || {}, RE = (C && C.REACTS) || {};
    steps.forEach(function (s, i) {
      var me = s.actor, base = GC.LIB.states[s.state] || GC.LIB.states.normal;
      if (s.spot && GC.SCENE.spots[s.spot]) row[me] = GC.SCENE.spots[s.spot];
      var ac = s.action && own(AC, s.action) ? AC[s.action] : null, silent = ac && !String(s.say || '').trim();   // ra đòn không hô: chỉ có nhịp hành động
      if (s.action && !ac) plan.warnings.push(_t('bước {n}: đòn "{action}" không có — bỏ qua (cài / cập nhật gói động tác)', { n: i + 1, action: s.action }));
      var line = { type: 'line', i: i, actor: me, say: s.say == null ? '' : String(s.say), state: s.state, hold: s.hold || 0 };
      // đi tới chỗ mới khi spot đổi (chạy khi hoảng / giận hoặc đường xa)
      if (s.spot && s.spot !== cur[me]) {
        var dist = Math.abs(sx(s.spot) - sx(cur[me]));
        line.move = { from: cur[me], to: s.spot, gait: s.state === 'panic' || s.state === 'rage' || dist > 300 ? 'run' : 'walk' };
        cur[me] = s.spot;
      }
      // nói với ai: chỉ định > người vừa nói > người đứng gần nhất
      var to = s.to && s.to !== me && ids.indexOf(s.to) >= 0 ? s.to : ac && ac.attack && s.target && s.target !== me && ids.indexOf(s.target) >= 0 ? s.target : prev && prev !== me ? prev : nearest(me, ids, cur);
      line.to = to || null;
      // hướng nhìn: người nói nhìn người nghe; mọi người khác nhìn người nói
      line.face = {};
      ids.forEach(function (id) { line.face[id] = faceTo(cur, id, id === me ? to : me); });
      // cử chỉ: activity / motion chỉ định > động tác riêng của cảm xúc; cảm xúc "đứng yên" thì khoa tay khi nói
      line.director = {};
      ['motion', 'fx', 'activity', 'posture', 'move', 'facing', 'view'].forEach(function (k) { if (s[k] !== undefined) line.director[k] = s[k]; });
      if (s.view) line.face[me] = s.view;
      // đang nói chuyện: cảm xúc "đứng yên" hoặc "giơ hai tay chiến thắng" → khoa tay khi nói (giơ hai tay mọi câu thành chữ V kỳ cục — Ryan);
      // muốn giơ hai tay thì kịch bản ghi activity cheer / victory
      if (!s.activity && !s.motion && (!base.motion || base.motion === 'idle' || base.motion === 'victory')) line.director.motion = 'talk';
      // người nghe: về nét mặt bình thường (trừ ngủ / khóc / mệt…), gật gù xen kẽ; câu hét làm người nghe giật mình
      state[me] = s.state;
      line.listen = {};
      ids.forEach(function (id) {
        if (id === me) return;
        var st = KEEP[state[id]] ? state[id] : 'normal';
        line.listen[id] = { state: st, motion: SHOUT[s.state] ? 'jolt' : (i + id.length) % 2 && st === 'normal' ? 'nod' : null };
      });
      // bong bóng: chỉ định > nghĩ (think / sleep) > hét (cảm xúc mạnh có "!") > nói
      line.bubble = s.bubble || (THINK[s.state] ? 'think' : SHOUT[s.state] && /[!?]/.test(line.say) ? 'shout' : 'say');
      // máy quay: chỉ định > toàn cảnh khi có người di chuyển / cả nhóm ăn mừng > hai người khi đối đáp > cận người nói
      var cam = s.camera && s.camera !== 'auto' ? s.camera : null;
      if (!cam) {
        // (đang đi thì bộ phát tự để toàn cảnh; tới nơi mới cận vào lời thoại)
        if (ids.length > 2 && (s.activity === 'cheer' || s.activity === 'victory' || (s.fx || []).indexOf('confetti') >= 0)) cam = 'wide';
        else if (to && pair && pair.indexOf(me) >= 0 && pair.indexOf(to) >= 0 && lastCam === 'close') cam = 'two';
        else cam = 'close';
      }
      line.camera = cam; line.camOn = cam === 'two' && to ? [me, to] : [me];
      line.punch = line.bubble === 'shout';
      line.screen = s.state === 'shock' ? 'flash' : s.state === 'rage' || s.state === 'panic' ? 'shake' : null;
      line.sfx = s.sfx ? s.sfx.slice(0, 3) : autoSfx(s, plan.mood, plan.project);
      // khẩu hình: miệng ngậm (giữ nét cười / mím của cảm xúc) ↔ mở nhỏ ↔ mở to (hét / cười lớn)
      var mouth = base.mouth;
      line.mouths = { closed: CLOSED[mouth] ? mouth : 'flat', small: 'oSmall', big: line.bubble === 'shout' ? 'shout' : mouth === 'laugh' ? 'laugh' : 'oBig' };
      line.estimate = Math.max(1.6, words(line.say) * 0.3 + 0.6);   // thời gian đọc; hold (giữ khung) tính riêng lúc diễn
      // bước tới / lùi lại theo cảm xúc (không khi vừa đi tới chỗ mới hoặc hoạt động tự di chuyển); xong câu thì về chỗ
      var lean = LEAN[s.state] || 0, act0 = s.activity && GC.LIB.activities[s.activity];
      // bước tới không đè lên người nghe: giữ khoảng cách tối thiểu ~ một thân người (100 đơn vị cảnh)
      var gapTo = to ? Math.abs(sx(cur[to]) - sx(cur[me])) : 0, room = lean > 0 ? Math.max(0, gapTo - 100) : 60;
      if (lean && to && !line.move && !(act0 && act0.move) && Math.min(Math.abs(lean), room) >= 12) line.nudge = (sx(cur[to]) < sx(cur[me]) ? -1 : 1) * (lean > 0 ? Math.min(lean, room) : lean);
      pair = to ? [me, to] : null; lastCam = cam; prev = me;
      if (!silent) plan.beats.push(line);
      if (ac) {
        // hành động (biên đạo): dựng sẵn ở đây (thuần dữ liệu) để biết ai đứng đâu sau màn đấu — câu sau quay mặt đúng chỗ
        var tg = ac.attack && s.target && s.target !== me && ids.indexOf(s.target) >= 0 ? s.target : null;
        var beat = { type: 'act', i: i, actor: me, action: s.action, label: ac.label, target: tg, react: tg ? (own(RE, s.react) ? s.react : 'hit') : null,
          sfx: silent && s.sfx ? s.sfx.slice(0, 3) : [] };   // bước ra đòn KHÔNG lời: sfx ghi tay phát lúc vào màn (bước có lời thì line.sfx đã phát ở speak) — chỗ hợp để đặt âm nhấn (S3)
        if (silent && line.move) beat.move = line.move;
        var Pa = { asset: byId[me], x: sx(cur[me]), y: row[me].y, k: row[me].k }, tl = null;
        var walls = ids.filter(function (id) { return id !== me && id !== tg; }).map(function (id) { return sx(cur[id]); });   // người đứng xem: không lộn / văng đè lên
        try {
          if (tg) tl = C.duel({ a: Pa, b: { asset: byId[tg], x: sx(cur[tg]), y: row[tg].y, k: row[tg].k }, action: s.action, react: beat.react, walls: walls });
          else { var o = to || nearest(me, ids, cur); tl = C.solo({ a: Pa, action: s.action, dir: o && sx(cur[o]) < Pa.x ? -1 : 1, walls: walls }); }
        } catch (e) { tl = null; plan.warnings.push(_t('bước {n}: không dựng được đòn "{action}" — {error}', { n: i + 1, action: s.action, error: String(e.message).slice(0, 120) })); }   // bỏ hành động, câu thoại vẫn diễn — nhưng BÁO (CNS-042)
        if (tl) {
          beat.real = Math.round(tl.real * 100) / 100; beat.dir = tl.duel.dir;
          beat.from = [Pa.x, tg ? sx(cur[tg]) : null];
          beat.end = tl.duel.end.map(function (v) { return Math.round(v * 10) / 10; });
          beat.impact = tl.duel.impact != null ? Math.round(C.storyToReal(tl, tl.duel.impact) * 100) / 100 : null;
          Object.defineProperty(beat, 'tl', { value: tl, enumerable: false });   // bộ phát dùng lại (không vào JSON / kiểm thử)
          cur[me] = beat.end[0]; if (tg) cur[tg] = beat.end[1];
          if (tg) { state[tg] = beat.react === 'ko' ? 'dizzy' : beat.react === 'hit' || beat.react === 'fall' ? 'injured' : state[tg]; pair = [me, tg]; }
          plan.beats.push(beat);
        }
      }
    });
    return plan;
  }

  /* ============================================================ BỐ CỤC LỜI THOẠI (không DOM) */
  // Bộ giải thuần số — chạy được trong Node, kiểm thử bằng hình chữ nhật giả. Toạ độ: px của khung hình, gốc ở góc trên trái.
  // Vào:  { kind: 'bubble' | 'caption', W, H, m (lề an toàn), who (id người nói), mouth {x,y},
  //         heads [{id,x0,y0,x1,y1}] (ĐẦU mọi người còn trong khung — cấm che), bodies [...] (thân — hạn chế che), decor [...] (biểu tượng trên đầu: !! ? mồ hôi, vương miện — hạn chế che nhẹ),
  //         sizes [{w,h}] (các cỡ thử: rộng nhất → hẹp dần), prev {id,cx,cy} | null (chỗ câu trước, để không nhảy) }
  // Ra:   { x0,y0,x1,y1,w,h, si (cỡ nào), tail {px,py,tx,ty,len}, clean, hard, soft, tag }
  // Luật cứng (hard): không đè đầu ai · đuôi không cắt ngang đầu người khác · không cách đầu người nói quá 18% chiều cao khung.
  // Luật mềm (soft): ít đè thân · gần miệng · đuôi ngắn · ưu tiên trên đầu rồi tới cạnh đầu, nửa trên khung · ổn định theo câu trước.
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function overlap(a, b) { var w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? w * h : 0; }
  function distToRect(r, p) { var dx = Math.max(r.x0 - p.x, 0, p.x - r.x1), dy = Math.max(r.y0 - p.y, 0, p.y - r.y1); return Math.sqrt(dx * dx + dy * dy); }
  // đoạn (a→b) có cắt hình chữ nhật r không (Liang–Barsky)
  function segHits(ax, ay, bx, by, r) {
    var t0 = 0, t1 = 1, dx = bx - ax, dy = by - ay, p = [-dx, dx, -dy, dy], q = [ax - r.x0, r.x1 - ax, ay - r.y0, r.y1 - ay];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  // đuôi: từ điểm gần miệng nhất trên bong bóng đi về phía miệng, DỪNG cách mặt `gap` (elip nội tiếp khung đầu, nở thêm gap) — không đâm vào mặt
  function tailOf(R, S, mouth, gap) {
    var P = { x: clamp(mouth.x, R.x0, R.x1), y: clamp(mouth.y, R.y0, R.y1) }, dx = mouth.x - P.x, dy = mouth.y - P.y, L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1) return { px: P.x, py: P.y, tx: P.x, ty: P.y, len: 0 };
    dx /= L; dy /= L;
    var cx = (S.x0 + S.x1) / 2, cy = (S.y0 + S.y1) / 2, a = (S.x1 - S.x0) / 2 + gap, b = (S.y1 - S.y0) / 2 + gap, ox = P.x - cx, oy = P.y - cy;
    var A = dx * dx / (a * a) + dy * dy / (b * b), B = 2 * (ox * dx / (a * a) + oy * dy / (b * b)), C = ox * ox / (a * a) + oy * oy / (b * b) - 1, disc = B * B - 4 * A * C, t = L * 0.6;
    if (C <= 0) t = 0;   // gốc đuôi đã nằm trong elip (khung đầu méo): không vẽ đuôi dài
    else if (disc >= 0) { var t1 = (-B - Math.sqrt(disc)) / (2 * A); if (t1 > 0) t = Math.min(t1, L); }
    return { px: P.x, py: P.y, tx: P.x + dx * t, ty: P.y + dy * t, len: t };
  }
  function solveLayout(c) {
    var W = c.W, H = c.H, m = c.m, cap = c.kind === 'caption', heads = c.heads || [], bodies = c.bodies || [], decor = c.decor || [], mouth = c.mouth, S = null, best = null;
    heads.forEach(function (h) { if (h.id === c.who) S = h; });
    if (!S) S = { x0: mouth.x - 0.12 * H, x1: mouth.x + 0.12 * H, y0: mouth.y - 0.2 * H, y1: mouth.y + 0.06 * H };
    var gap = 0.04 * H, tg = 0.014 * H, far = 0.18 * H, scx = (S.x0 + S.x1) / 2;
    (c.sizes || []).forEach(function (s, si) {
      var w = s.w, h = s.h, area = Math.max(1, w * h), cs = [], y, i, j;
      var add = function (x0, y0, pref, tag) { cs.push([clamp(x0, m, W - m - w), clamp(y0, m, H - m - h), pref, tag]); };
      if (cap) {
        // phụ đề: dải dưới khung (giữa → sát trái / phải), lùi lên từng nấc nếu đầu người chiếm dải; cuối cùng mới tới dải trên
        var bot = H - 0.045 * H - h, step = 0.055 * H;
        // i18n-ignore-start(tên ứng viên chỗ đặt lời thoại — mã gỡ lỗi, không hiện cho người xem)
        for (j = 0; j < 7; j++) { y = bot - j * step; add((W - w) / 2, y, j * 1.2, 'dưới'); add(m, y, j * 1.2 + 2, 'dưới-trái'); add(W - m - w, y, j * 1.2 + 2, 'dưới-phải'); }
        add((W - w) / 2, m, 16, 'trên'); add(m, m, 17, 'trên-trái'); add(W - m - w, m, 17, 'trên-phải');
      } else {
        var ay = S.y0 - gap - h;   // trên đầu: giữa · lệch trái · lệch phải
        add(scx - w / 2, ay, 0, 'trên-giữa'); add(scx - w * 0.78, ay, 1, 'trên-trái'); add(scx - w * 0.22, ay, 1, 'trên-phải');
        [[S.x1 + gap, 'cạnh-phải'], [S.x0 - gap - w, 'cạnh-trái']].forEach(function (sd) {   // cạnh đầu: trên đỉnh · ngang miệng
          add(sd[0], S.y0, 2.5, sd[1]); add(sd[0], mouth.y - h / 2, 3, sd[1]); add(sd[0], S.y0 - h * 0.35, 3, sd[1]);
        });
        add(scx - w / 2, m, 4, 'dải-trên'); add(m, m, 4.5, 'góc-trái'); add(W - m - w, m, 4.5, 'góc-phải');
        for (i = 0; i <= 6; i++) for (j = 0; j <= 4; j++) add(m + (W - 2 * m - w) * i / 6, m + (H - 2 * m - h) * j / 4, 7, 'lưới');   // quét thưa cả khung: còn chỗ sạch là tìm ra
        if (c.prev && c.prev.id === c.who) add(c.prev.cx - w / 2, c.prev.cy - h / 2, 0.5, 'giữ-chỗ');
        // i18n-ignore-end
      }
      cs.forEach(function (k) {
        var R = { x0: k[0], y0: k[1], x1: k[0] + w, y1: k[1] + h }, hard = 0, soft = k[2], ho = 0, T = null;
        heads.forEach(function (hd) { ho += overlap(R, hd); });
        if (ho > 0) hard += 1 + Math.min(1, ho / area);   // đè đầu: cấm; nếu buộc phải đè thì chọn chỗ đè ít nhất
        bodies.forEach(function (bd) { soft += (cap ? 6 : bd.id === c.who ? 22 : 34) * overlap(R, bd) / area; });
        decor.forEach(function (dc) { soft += 16 * overlap(R, dc) / Math.max(1, (dc.x1 - dc.x0) * (dc.y1 - dc.y0)); });   // che hết một biểu tượng = phạt 16
        if (!cap) {
          T = tailOf(R, S, mouth, tg);
          heads.forEach(function (hd) { if (hd.id !== c.who && segHits(T.px, T.py, T.tx, T.ty, hd)) hard += 1; });   // đuôi cắt ngang đầu người khác
          if (distToRect(R, S) > far) hard += 0.5;   // quá xa đầu người nói (> 18% chiều cao): người xem không biết ai nói → nhường phụ đề
          soft += T.len / H * 28 + Math.max(0, 0.03 * H - T.len) / H * 150 + distToRect(R, mouth) / H * 12 + (R.y0 > mouth.y ? 6 : 0) + (k[1] + h / 2) / H * 6;   // đuôi quá cụt (< 3% chiều cao) trông như vết lõm: phạt
        }
        soft += h / H * (cap ? 4 : 10);
        if (c.prev && c.prev.id === c.who) soft += 8 * Math.sqrt(Math.pow((R.x0 + R.x1) / 2 - c.prev.cx, 2) + Math.pow((R.y0 + R.y1) / 2 - c.prev.cy, 2)) / W;   // cùng người nói liên tiếp: giữ chỗ cũ
        if (!best || hard < best.hard - 1e-9 || (Math.abs(hard - best.hard) < 1e-9 && soft < best.soft)) best = { x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1, w: w, h: h, si: si, tail: T, hard: hard, soft: soft, tag: k[3], clean: hard === 0 };
      });
    });
    return best;
  }
  // màu thẻ tên: giữ màu nhân vật, tối dần tới khi chữ trắng đạt tương phản ≥ 4,5:1 (WCAG AA)
  function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function relLum(hex) { var n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255); }
  function contrast(a, b) { var x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function chipColor(c) {
    var hex = /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#4a5563', n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
    var h2 = function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); };
    for (var k = 1; k > 0.2; k -= 0.04) { var cur = '#' + h2(r * k) + h2(g * k) + h2(b * k); if (contrast(cur, '#ffffff') >= 4.6) return cur; }
    return '#26211e';
  }

  // khoá một câu thoại: cùng diễn viên + cảm xúc + kiểu bong bóng + chữ → cùng một giọng thu sẵn (Studio nhúng clip vào phim xuất ra theo khoá này)
  function clipKey(line) { return [line.actor, line.state || 'normal', line.bubble || 'say', String(line.say || '').trim()].join('|'); }
  function lines(work) {
    var out = [], seen = {}, o = { project: (work && work.project) || '' };
    ((work && work.shots) || []).forEach(function (s) {
      if (issues(s).length) return;
      var by = {}, plan = direct(s, o);
      actors(s).forEach(function (a) { by[a.id] = a; });
      ((plan && plan.beats) || []).forEach(function (b) {
        if (b.type !== 'line' || !String(b.say || '').trim() || !by[b.actor]) return;
        var k = clipKey(b);
        if (seen[k]) return;
        seen[k] = 1; out.push({ key: k, line: b, actor: by[b.actor], shot: s.id });
      });
    });
    return out;
  }

  /* ============================================================ DOM */
  var INK = '#1f1a17';
  // MỘT phông cho mọi lời thoại: Be Vietnam Pro (nhúng sẵn ở engine/fonts.js, dấu tiếng Việt đúng ở mọi máy); chưa nạp thì dùng phông hệ thống
  var FAM = '"Be Vietnam Pro","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif';
  var CSS = [
    '.gcp{position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:6px;background:#f4f1ea;container-type:inline-size;user-select:none;isolation:isolate}',
    '.gcp-shk,.gcp-cam,.gcp-ov,.gcp-flash{position:absolute;inset:0}',
    '.gcp-cam{transform-origin:0 0;transition:transform .75s cubic-bezier(.3,.7,.2,1);will-change:transform}',
    '.gcp-cam.cut{transition:none}',
    '.gcp-cam>img{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.gcp-cam>img.fg{z-index:50;pointer-events:none}',
    '.gcp-actor{position:absolute;transition-property:left,top;transition-timing-function:linear}',
    '.gcp-actor.speaking{z-index:45!important}',
    '.gcp-actor .gc-full,.gcp-actor .gc-idle{position:absolute;inset:0;width:100%;height:100%}',
    '.gcp-shk.shake{animation:gcp-shake .42s cubic-bezier(.36,.07,.19,.97) both}',
    '@keyframes gcp-shake{10%,90%{transform:translate(-.4%,0)}20%,80%{transform:translate(.7%,.2%)}30%,50%,70%{transform:translate(-1%,-.3%)}40%,60%{transform:translate(1%,.3%)}}',
    '.gcp-flash{background:#fff;opacity:0;pointer-events:none;z-index:40}.gcp-flash.on{animation:gcp-flash .45s ease-out}',
    '@keyframes gcp-flash{0%{opacity:.85}100%{opacity:0}}',
    '.gcp-ov{z-index:50;pointer-events:none}',
    '.gcp-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:48;overflow:visible}.gcp-fxo{z-index:49}',
    // LỜI THOẠI: bong bóng (một đường viền SVG liền: thân + đuôi) hoặc phụ đề dải dưới. Một phông, một cỡ chữ theo khung (cqw, sàn 13px ở khung 640),
    // chữ đọc được NGAY (từ chưa đọc chỉ nhạt hơn một chút, cùng họ màu); từ đang đọc có vệt sáng nhẹ
    '.gcp-bub,.gcp-cap{position:absolute;left:0;top:0;box-sizing:border-box;margin:0;font-family:' + FAM + ';font-size:max(13px,1.9cqw);line-height:1.34;font-weight:700;font-synthesis:none;font-kerning:normal;-webkit-font-smoothing:antialiased;text-wrap:balance;overflow-wrap:anywhere;pointer-events:none;',
    'opacity:0;transition:opacity .16s ease-out,transform .3s cubic-bezier(.3,1.5,.5,1)}',
    '.gcp-bub{padding:.6em 1.05em .68em;color:' + INK + ';text-align:center;isolation:isolate;transform:scale(.7);transform-origin:var(--ox,50%) var(--oy,100%)}',
    '.gcp-bub.on{opacity:1;transform:scale(1)}',
    '.gcp-bub>svg{position:absolute;left:0;top:0;overflow:visible;z-index:-1;filter:drop-shadow(0 .14em .2em rgb(20 14 10/.3))}',
    '.gcp-bub .nm,.gcp-cap .nm{display:block;width:fit-content;padding:.1em .68em .14em;border-radius:1em;color:#fff;font-size:max(10.5px,.68em);font-weight:800;letter-spacing:.05em;line-height:1.35;text-transform:uppercase;white-space:nowrap}',
    '.gcp-bub .nm{margin:0 auto .3em}',
    '.gcp-bub .w{color:#4a433c}.gcp-bub .w.on{color:' + INK + '}',
    '.gcp-bub .w.cur,.gcp-cap .w.cur{background:rgb(255 196 70/.42);box-shadow:0 0 0 .12em rgb(255 196 70/.42);border-radius:.2em}',
    '.gcp-bub.shout{font-weight:800;padding:.78em 1.35em .85em}.gcp-bub.shout.on{animation:gcp-quake .12s linear 4}',
    '@keyframes gcp-quake{25%{transform:translate(1px,-1px)}75%{transform:translate(-1px,1px)}}',
    '.gcp-bub.think{font-weight:500;padding:1em 1.8em 1.1em}.gcp-bub.whisper{font-weight:500}.gcp-bub.whisper .w{color:#5a534b}.gcp-bub.whisper .w.on{color:#2b2622}',
    // phụ đề điện ảnh (khi không có chỗ sạch cho bong bóng, hoặc người xem chọn): dải tối mờ + thẻ tên màu nhân vật + chữ trắng — đọc được trên mọi nền
    '.gcp-cap{display:flex;gap:.75em;align-items:flex-start;padding:.52em 1em .58em;border-radius:.7em;background:rgb(14 12 18/.9);color:#fff;text-align:left;transform:translateY(.5em);box-shadow:0 .25em .9em rgb(0 0 0/.35),0 0 0 1px rgb(255 255 255/.14)}',
    '.gcp-cap.on{opacity:1;transform:none}',
    '.gcp-cap>svg{display:none}',
    '.gcp-cap .nm{flex:none;margin-top:.1em;box-shadow:0 0 0 1.5px rgb(255 255 255/.55)}',
    '.gcp-cap .tx{flex:1 1 auto;min-width:0}',
    '.gcp-cap .w{color:#e6e1d8}.gcp-cap .w.on{color:#fff}',
    '.gcp-cap.shout{font-weight:800}.gcp-cap.think,.gcp-cap.whisper{font-weight:500}.gcp-cap.think .w{color:#cfdaf5}.gcp-cap.think .w.on{color:#e8eeff}.gcp-cap.whisper .w{color:#cdc7bd}.gcp-cap.whisper .w.on{color:#ece8e0}',
    '.gcp-title{position:absolute;inset:0;z-index:60;display:grid;place-content:center;text-align:center;gap:.5em;background:radial-gradient(ellipse at center,#26252b,#111);color:#f4f1ea;',
    'font-family:' + FAM + ';animation:gcp-in .5s ease-out}',
    '@keyframes gcp-in{from{opacity:0}}',
    '.gcp-title b{font-size:max(20px,4cqw);letter-spacing:-.01em}',
    '.gcp-title span{font-size:max(11px,1.3cqw);opacity:.65;letter-spacing:.18em;text-transform:uppercase}',
    '.gcp-empty{position:absolute;inset:0;display:grid;place-items:center;color:#8e897f;font:13px system-ui,sans-serif;padding:16px;text-align:center}',
    '@media (prefers-reduced-motion:reduce){.gcp-cam{transition:none}.gcp-shk.shake,.gcp-bub.shout.on{animation:none}.gcp-bub,.gcp-cap,.gcp-bub.on,.gcp-cap.on{transform:none;transition:opacity .08s linear}}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('gcp-css')) return;
    var s = document.createElement('style'); s.id = 'gcp-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function img(cls, svg, alt) { var e = el('img', cls); e.alt = alt || ''; e.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); return e; }
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  /* ---- hình bong bóng: MỘT đường viền liền (thân + đuôi cùng một path, không chồng nét), toạ độ px của chính bong bóng ----
   * tip = đầu đuôi {x,y} (ngoài thân; null hoặc nằm trong thân = không đuôi) · o = { em (cỡ chữ px), sw (bề dày nét — MỘT bề dày cho mọi loại) } */
  function f1(v) { return Math.round(v * 10) / 10; }
  function pt(p) { return f1(p[0]) + ',' + f1(p[1]); }
  // đuôi mọc từ cạnh nào, gốc ở đâu: cạnh theo hướng đích, gốc kẹp trong đoạn thẳng của cạnh (không dính góc bo)
  function tailGeom(w, h, r, tip, half, pad) {
    var ox = Math.max(-tip.x, tip.x - w, 0), oy = Math.max(-tip.y, tip.y - h, 0), edge;
    if (!ox && !oy) return null;
    edge = oy >= ox ? (tip.y > h ? 'b' : 't') : (tip.x > w ? 'r' : 'l');
    var horiz = edge === 'b' || edge === 't', len = horiz ? w : h, lo = r + half + pad, hi = len - r - half - pad;
    if (hi < lo) lo = hi = len / 2;
    return { edge: edge, c: clamp(horiz ? tip.x : tip.y, lo, hi), half: half };
  }
  // thân bo tròn + đuôi cong lõm, nhọn (đi theo chiều kim đồng hồ: trên → phải → dưới → trái)
  function rrPath(w, h, r, tl, tip) {
    var T = function (e, p0, p1) {
      if (!tl || tl.edge !== e) return '';
      var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, k = 0.38;
      var c0 = [(p0[0] + tip.x) / 2 + (mx - p0[0]) * k, (p0[1] + tip.y) / 2 + (my - p0[1]) * k], c1 = [(p1[0] + tip.x) / 2 + (mx - p1[0]) * k, (p1[1] + tip.y) / 2 + (my - p1[1]) * k];
      return 'L' + pt(p0) + 'Q' + pt(c0) + ' ' + pt([tip.x, tip.y]) + 'Q' + pt(c1) + ' ' + pt(p1);
    }, c = tl ? tl.c : 0, hf = tl ? tl.half : 0, A = 'A' + f1(r) + ' ' + f1(r) + ' 0 0 1 ';
    return 'M' + f1(r) + ',0' + T('t', [c - hf, 0], [c + hf, 0]) + 'H' + f1(w - r) + A + f1(w) + ',' + f1(r) +
      T('r', [w, c - hf], [w, c + hf]) + 'V' + f1(h - r) + A + f1(w - r) + ',' + f1(h) +
      T('b', [c + hf, h], [c - hf, h]) + 'H' + f1(r) + A + '0,' + f1(h - r) +
      T('l', [0, c + hf], [0, c - hf]) + 'V' + f1(r) + A + f1(r) + ',0Z';
  }
  // hét: viền răng cưa NHỎ bám theo khung chữ (răng thụt vào d, không phình ra ngoài) — nổ gọn, không phải ngôi sao khổng lồ
  function burstPath(w, h, d, tooth, tl, tip) {
    var pts = [], at = { t: function (u, o) { return [u, o]; }, r: function (u, o) { return [w - o, u]; }, b: function (u, o) { return [w - u, h - o]; }, l: function (u, o) { return [o, h - u]; } };
    ['t', 'r', 'b', 'l'].forEach(function (e) {
      var len = e === 't' || e === 'b' ? w : h, n = Math.max(2, Math.round(len / tooth)), list = [], i;
      for (i = 0; i < n; i++) { list.push([len * i / n, 0]); list.push([len * (i + 0.5) / n, d]); }
      if (tl && tl.edge === e) {
        var uc = e === 't' || e === 'r' ? tl.c : len - tl.c, lo = uc - tl.half, hi = uc + tl.half;
        list = list.filter(function (q) { return q[0] < lo - tooth * 0.3 || q[0] > hi + tooth * 0.3; });
        list.push([lo, 0], [uc, 0, [tip.x, tip.y]], [hi, 0]);
        list.sort(function (p, q) { return p[0] - q[0]; });
      }
      list.forEach(function (q) { pts.push(q[2] || at[e](q[0], q[1])); });
    });
    return 'M' + pts.map(pt).join('L') + 'Z';
  }
  // nghĩ: đám mây viền lượn sóng (các cung nhỏ nối nhau trên elip), một path liền
  function cloudPath(w, h, em) {
    var n = Math.max(9, Math.round(Math.PI * (w + h) / 2 / (em * 1.75))), seg = Math.PI * (w + h) / 2 / n, bulge = seg * 0.26, a = w / 2 - bulge, b = h / 2 - bulge, p = [], i;
    for (i = 0; i < n; i++) { var th = i / n * Math.PI * 2 - Math.PI / 2; p.push([w / 2 + Math.cos(th) * a, h / 2 + Math.sin(th) * b]); }
    return 'M' + pt(p[0]) + p.map(function (q, k) {
      var z = p[(k + 1) % n], rr = Math.sqrt(Math.pow(z[0] - q[0], 2) + Math.pow(z[1] - q[1], 2)) * 0.62;
      return 'A' + f1(rr) + ' ' + f1(rr) + ' 0 0 1 ' + pt(z);
    }).join('') + 'Z';
  }
  function drawBubble(svg, kind, w, h, tip, o) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    var em = o.em, sw = o.sw, base = { fill: '#fffdf8', stroke: INK, 'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    if (kind === 'think') {
      svg.appendChild(svgEl('path', Object.assign({ d: cloudPath(w, h, em) }, base)));
      // ba bọt nhỏ dần nối từ rìa đám mây tới đích (xếp lần lượt, không chồng nhau); chỗ chật thì thu nhỏ rồi bớt bọt
      if (tip && (tip.x < 0 || tip.x > w || tip.y < 0 || tip.y > h)) {
        var cx = w / 2, cy = h / 2, dx = tip.x - cx, dy = tip.y - cy, L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
        var edge = 1 / Math.sqrt(Math.pow(ux / (w / 2), 2) + Math.pow(uy / (h / 2), 2)), D = Math.max(0, L - edge), R0 = [0.34, 0.25, 0.16], g0 = sw + 2, n = 3, fz = 1;
        for (; n > 0; n--) {
          var sum = 0; for (var q = 0; q < n; q++) sum += 2 * R0[q] * em;
          fz = Math.min(1, (D - (n + 1) * g0) / sum);
          if (fz >= 0.45) break;
        }
        for (var k = 0, s0 = edge + g0; k < n; k++) {
          var rr = Math.max(2.2, R0[k] * em * fz);
          svg.appendChild(svgEl('circle', Object.assign({ cx: f1(cx + ux * (s0 + rr)), cy: f1(cy + uy * (s0 + rr)), r: f1(rr) }, base)));
          s0 += 2 * rr + g0;
        }
      }
      return;
    }
    var r = Math.min(em * 1.0, h / 2), half = Math.max(7, Math.min(14, em * 0.52)), tl = tip ? tailGeom(w, h, r, tip, half, sw) : null;
    if (tl && Math.max(-tip.x, tip.x - w, -tip.y, tip.y - h) < em * 0.5) tl = null;   // đuôi cụt hơn nửa chữ: bỏ hẳn (khỏi thành vết lõm trên viền)
    var path = kind === 'shout' ? burstPath(w, h, em * 0.38, em * 1.15, tl, tip) : rrPath(w, h, r, tl, tip);
    var extra = kind === 'whisper' ? { 'stroke-dasharray': f1(em * 0.46) + ' ' + f1(em * 0.34) } : kind === 'shout' ? { 'stroke-linejoin': 'miter', 'stroke-miterlimit': '2.6' } : {};
    svg.appendChild(svgEl('path', Object.assign({ d: path }, base, extra)));
  }

  // đo hình thật của nhân vật đang đứng trên sân khấu (một lần mỗi câu thoại, không đo mỗi khung hình)
  var FACE = ['ears', 'head', 'mask', 'shade', 'cheeks', 'eyes', 'brows', 'mouth', 'mustache', 'hairFront', 'hat'];   // "đầu" = mặt + tai + tóc mái + mũ (không tính râu / tóc xoã xuống dưới cằm)
  var TORSO = ['hairBack', 'backItem', 'legs', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'hem', 'body', 'beard', 'armLb', 'foreLb', 'handLb', 'armRb', 'foreRb', 'handRb', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR'];
  var RIG_DEF = { head: [40, 26, 157, 149], body: [58, 142, 142, 228], mouth: [100, 131] };   // hộp mặc định (toạ độ khung xương) khi nhân vật chỉ là ảnh tĩnh
  // hộp bao (toạ độ khung xương) của một nhóm lớp THEO DÁNG ĐANG ĐỨNG (đã nội suy xong sau ~260 ms kể từ lúc đổi cảm xúc); getBBox không tính hoạt hình CSS và không phụ thuộc máy quay
  function rigBox(groups, names) {
    var u = null;
    names.forEach(function (n) {
      var g = groups[n]; if (!g || !g.firstChild) return;
      var bb; try { bb = g.getBBox(); } catch (e) { return; }
      if (!bb || (!bb.width && !bb.height)) return;
      var tf = g.transform && g.transform.baseVal && g.transform.baseVal.numberOfItems ? g.transform.baseVal.consolidate() : null, M = tf && tf.matrix;
      [bb.x, bb.x + bb.width].forEach(function (x) { [bb.y, bb.y + bb.height].forEach(function (y) {
        var ps = [M ? [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f] : [x, y]];
        ps.forEach(function (p) { u = u ? [Math.min(u[0], p[0]), Math.min(u[1], p[1]), Math.max(u[2], p[0]), Math.max(u[3], p[1])] : [p[0], p[1], p[0], p[1]]; });
      }); });
    });
    return u;
  }
  // ĐẦU quét theo thời gian: nhân vật ngủ gục / gật gù / khoa tay làm đầu đung đưa tới hàng trăm px — lấy hợp hộp đầu qua cả một chu kỳ động tác
  // (dựng tư thế bằng GC.poseAt tại ~14 mốc thời gian, KHÔNG đọc DOM từng mốc) để bong bóng đứng yên mà vẫn không bị đầu quét trúng
  function sweepHead(inst) {
    var g = inst.groups, lb = null, st = inst.resolved;
    FACE.forEach(function (n) {
      var e = g[n], bb; if (!e || !e.firstChild) return;
      try { bb = e.getBBox(); } catch (x) { return; }
      if (!bb || (!bb.width && !bb.height)) return;
      lb = lb ? [Math.min(lb[0], bb.x), Math.min(lb[1], bb.y), Math.max(lb[2], bb.x + bb.width), Math.max(lb[3], bb.y + bb.height)] : [bb.x, bb.y, bb.x + bb.width, bb.y + bb.height];
    });
    if (!lb) return null;
    if (!st || !GC.poseAt || !GC.jointMatrices) return rigBox(g, FACE);
    var mo = (GC.LIB.motions[st.motion] || {}).dur || 0, mv = (st.move && GC.LIB.moves[st.move] || {}).dur || 0, dur = Math.min(6, Math.max(mo, mv, 0)), n = inst.still || !dur ? 1 : 14;
    var t0 = (performance.now() - inst.t0) / 1000, u = null;
    for (var i = 0; i < n; i++) {
      var M = GC.jointMatrices(GC.poseAt(inst.asset, st, t0 + dur * i / n, inst.still)).head;
      [lb[0], lb[2]].forEach(function (x) { [lb[1], lb[3]].forEach(function (y) {
        var px = M[0] * x + M[2] * y + M[4], py = M[1] * x + M[3] * y + M[5];
        u = u ? [Math.min(u[0], px), Math.min(u[1], py), Math.max(u[2], px), Math.max(u[3], py)] : [px, py, px, py];
      }); });
    }
    return u;
  }
  function rigOf(inst) {
    var g = inst && inst.groups;
    if (!g) return RIG_DEF;
    // đầu = hợp (dáng ĐANG vẽ, các dáng đích trong cả chu kỳ động tác): máy chậm / khung hình thưa thì đầu còn đang trên đường từ dáng cũ tới dáng đích
    var hd = sweepHead(inst), cur = rigBox(g, FACE), bd = rigBox(g, TORSO), mo = rigBox(g, ['mouth']);
    if (hd && cur) hd = [Math.min(hd[0], cur[0]), Math.min(hd[1], cur[1]), Math.max(hd[2], cur[2]), Math.max(hd[3], cur[3])];
    return { head: hd || RIG_DEF.head, body: bd || RIG_DEF.body, mouth: mo ? [(mo[0] + mo[2]) / 2, (mo[1] + mo[3]) / 2] : RIG_DEF.mouth, fx: rigBox(g, ['fxHead']) };
  }
  // nạp sẵn phông lời thoại (engine/fonts.js) để bong bóng đầu tiên không nhảy cỡ khi phông về muộn
  function warmFonts() {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve();
    // i18n-ignore(chuỗi mẫu nạp glyph phông chữ, không hiện ra)
    return Promise.all(['500', '700', '800'].map(function (w) { return document.fonts.load(w + ' 16px "Be Vietnam Pro"', 'Aăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ'); })).catch(function () {});
  }
  var DIALOGS = ['auto', 'bubble', 'caption'];   // lời thoại: tự động (bong bóng khi có chỗ sạch, không thì phụ đề) · luôn bong bóng · luôn phụ đề

  function player(box, opts) {
    opts = opts || {};
    GC.render.injectCSS(); injectCSS();
    var R = GC.render, A = GC.audio || null, insts = {}, els = {}, cast = {}, pos = {}, run = 0, timers = [], cam = null, ov = null, shk = null, flash = null, bub = null, plan = null, camState = null, acting = null;
    var dialog = DIALOGS.indexOf(opts.dialog) >= 0 ? opts.dialog : 'auto', lastSpot = null, fontsOk = false, fontsReady = warmFonts().then(function () { fontsOk = true; });
    var lang = opts.lang, accent = opts.accent, clips = new Map();   // ngôn ngữ phim · giọng thu sẵn của phân cảnh đang diễn (khoá clipKey → Promise)
    var progress = function (t) { if (opts.onProgress) opts.onProgress(t); };
    var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { if (bub) bub.layout(false); }) : null;
    if (ro) ro.observe(box);
    function clearBox() {
      Object.keys(insts).forEach(function (k) { insts[k].destroy(); });
      insts = {}; els = {}; cast = {}; pos = {}; bub = null; camState = null; lastSpot = null;
      while (box.firstChild) box.removeChild(box.firstChild);
      box.className = 'gcp';
    }
    // vị trí theo toạ độ cảnh (x 0–640, chỗ đứng quyết định y và cỡ); x ngoài khung = ngoài sân khấu
    function spotAt(spot, x) { var sp = GC.SCENE.spots[spot] || GC.SCENE.spots.center; return { x: x == null ? sp.x : x, y: sp.y, k: sp.k, spot: spot }; }
    function place(id, p) {
      var e = els[id], B = GC.RIG.box;
      pos[id] = p;
      e.style.left = ((p.x - (100 - B[0]) * p.k) / GC.SCENE.W * 100) + '%';
      e.style.top = ((p.y - (228 - B[1]) * p.k) / GC.SCENE.H * 100) + '%';
      e.style.width = (B[2] * p.k / GC.SCENE.W * 100) + '%';
      e.style.height = (B[3] * p.k / GC.SCENE.H * 100) + '%';
      e.style.zIndex = Math.round(p.y / 10);
    }
    function wait(ms, r) { return new Promise(function (ok, no) { timers.push(setTimeout(function () { if (r === run) ok(); else no('stop'); }, ms)); }); }
    // chờ điều trình duyệt phải VẼ ra mới xong (khung hình, chuyển tiếp CSS): máy chậm / khung hình thưa thì hình chạy SAU đồng hồ hẹn giờ.
    // Tab ẩn (trình duyệt thôi vẽ) → thôi chờ, như trước. Dừng giữa chừng → 'stop'.
    function painted(p, r) {
      return new Promise(function (ok, no) {
        var done = false, fin = function () { if (done) return; done = true; if (r === run) ok(); else no('stop'); };
        p.then(fin, fin);
        (function poll() { timers.push(setTimeout(function () { if (done) return; if (r !== run || document.hidden) fin(); else poll(); }, 200)); })();
      });
    }
    // sân khấu đứng yên: mọi chuyển tiếp đang chạy của diễn viên (đi / bước tới / lùi) và máy quay (lướt / đẩy) đã xong TRÊN MÀN HÌNH.
    // Bố cục lời thoại tính theo chỗ đích (pos, camState); mở bong bóng khi hình còn ở chỗ cũ là đè đầu (CNS-099)
    function settle(r) {
      var list = Object.keys(els).map(function (k) { return els[k]; }).concat(cam ? [cam] : []), an = [];
      list.forEach(function (e) {
        if (!e.getAnimations) return;
        e.getAnimations().forEach(function (a) { var t = a.effect && a.effect.getComputedTiming(); if (t && isFinite(t.endTime) && a.playState !== 'finished') an.push(a.finished.catch(function () {})); });
      });
      return an.length ? painted(Promise.all(an), r) : (r === run ? Promise.resolve() : Promise.reject('stop'));
    }
    function sfx(name, o) { if (A && name) A.sfx(name, o); }
    // dự án của tác phẩm (chọn gói âm): opts.project / setProject — chuỗi hoặc hàm; thiếu thì direct() tự suy từ bối cảnh / diễn viên
    var projectOpt = opts.project;
    function curProject() { var p = typeof projectOpt === 'function' ? projectOpt() : projectOpt; return typeof p === 'string' ? p : undefined; }
    // âm của một SỰ KIỆN bộ phát (impact · miss · block · enter · cut) theo thư viện âm của dự án + không khí cảnh; thiếu thư viện → tên cũ
    function evSfx(event, dflt) {
      var S = GC.sounds, n = S && S.cueFor({ event: event, mood: plan && plan.mood, project: plan && plan.project, max: 1 })[0];
      return n || dflt;
    }
    // âm mặc định của đòn (trúng "hit", hụt "swish") → âm sự kiện của thư viện (trúng → impact, bị đỡ → block, né → miss); tên riêng của gói động tác giữ nguyên
    function strikeSfx(n, e, beat) {
      var hit = (e.hitstop > 0 || e.hit) && !e.miss;
      if (n === 'hit' && hit) return evSfx(beat.react === 'block' ? 'block' : 'impact', n);
      if (n === 'swish' && e.miss) return evSfx('miss', n);
      return n;
    }
    function voiceOf(id) { var a = cast[id]; return A && a ? A.voiceOf(a, { lang: lang, accent: accent }) : null; }
    // giọng thu sẵn của một câu: hỏi opts.voiceClip MỘT lần (nhớ theo khoá), lỗi → null. p.settled = đã có kết quả (không chờ được nữa thì thôi)
    function clipFor(line) {
      if (typeof opts.voiceClip !== 'function' || !String(line.say || '').trim()) return null;
      var k = clipKey(line), p = clips.get(k);
      if (p) return p;
      p = new Promise(function (ok) {
        var v; try { v = opts.voiceClip(line, cast[line.actor]); } catch (e) { v = null; }
        Promise.resolve(v).then(function (c) { ok(c || null); }, function () { ok(null); });
      });
      p.settled = false;
      p.then(function () { p.settled = true; });
      clips.set(k, p);
      return p;
    }
    // đầu phân cảnh: hỏi trước giọng của mọi câu, song song ≤ 2 — tới lượt nói thì clip đã sẵn (câu nào speak() cần gấp thì tự hỏi, không chờ hàng đợi)
    function prefetch(r) {
      if (typeof opts.voiceClip !== 'function') return;
      var q = plan.beats.filter(function (b) { return b.type === 'line' && String(b.say || '').trim(); }), busy = 0;
      (function pump() {
        while (busy < 2 && q.length && r === run) {
          var p = clipFor(q.shift());
          if (!p || p.settled) continue;
          busy++;
          p.then(function () { busy--; pump(); });
        }
      })();
    }
    // chờ clip tối đa clipWait ms (người xem không phải chờ mãi một giọng chậm): quá hạn → null → giọng trình duyệt
    function gate(p, line, r) {
      var ms = typeof opts.clipWait === 'function' ? opts.clipWait(line) : opts.clipWait;
      ms = typeof ms === 'number' && ms >= 0 ? ms : 2500;
      if (!p.settled) progress((plan.shotTitle || '') + ' · ' + _t('đang chờ giọng thu sẵn…'));
      return Promise.race([p, new Promise(function (ok) { timers.push(setTimeout(function () { ok(null); }, ms)); })]);
    }
    function panOf(id) { return pos[id] ? Math.max(-0.8, Math.min(0.8, (pos[id].x - 320) / 320)) : 0; }

    /* ---- máy quay: toàn cảnh / hai người / cận người nói — một transform; kẹp để không lộ mép ngoài cảnh ---- */
    function headOf(id) { var p = pos[id]; return p ? { x: p.x / GC.SCENE.W, y: (p.y - 128 * p.k) / GC.SCENE.H, k: p.k } : { x: 0.5, y: 0.5, k: 0.8 }; }
    function camera(mode, on, punch, cut) {
      var S = 1, fx = 0.5, fy = 0.5, cy = 0.5;
      if (mode === 'close' && on && on[0]) { var h = headOf(on[0]); S = 1.7 * 0.8 / h.k; fx = h.x; fy = h.y; cy = 0.44; }
      else if (mode === 'two' && on && on.length > 1) {
        var a = headOf(on[0]), b = headOf(on[1]); fx = (a.x + b.x) / 2; fy = (a.y + b.y) / 2; cy = 0.46;
        S = Math.max(1.15, Math.min(1.6, 0.62 / (Math.abs(a.x - b.x) + 0.24)));
      }
      if (punch) S *= 1.12;
      // toàn cảnh: zoom (nếu có punch) quanh tâm khung, không lệch về góc trái trên
      var tx = mode === 'wide' ? (1 - S) / 2 : Math.max(1 - S, Math.min(0, 0.5 - fx * S)), ty = mode === 'wide' ? (1 - S) / 2 : Math.max(1 - S, Math.min(0, cy - fy * S));
      camState = { S: S, tx: tx, ty: ty };
      cam.classList.toggle('cut', !!cut);
      cam.style.transform = 'translate(' + (tx * 100).toFixed(3) + '%,' + (ty * 100).toFixed(3) + '%) scale(' + S.toFixed(4) + ')';
      if (cut) { void cam.offsetWidth; cam.classList.remove('cut'); }
      if (bub) bub.layout(false);
    }
    // điểm cảnh (0–1) → điểm màn hình (0–1) theo máy quay hiện tại
    function toScreen(x, y) { var c = camState || { S: 1, tx: 0, ty: 0 }; return { x: x * c.S + c.tx, y: y * c.S + c.ty }; }

    /* ---- diễn viên: quay mặt, đi lại, cử chỉ, nhép miệng ---- */
    function act(id, st, dir) { if (insts[id]) insts[id].setState(st, dir && Object.keys(dir).length ? dir : undefined); }
    function walk(id, toSpot, gait, r, x) {
      var from = pos[id], to = spotAt(toSpot, x), dx = to.x - from.x;
      var secs = Math.max(0.5, Math.abs(dx) / (gait === 'run' ? 360 : 210));
      act(id, 'normal', { activity: gait, view: dx < 0 ? 'left90' : 'right90' });
      els[id].style.transitionDuration = secs.toFixed(2) + 's';
      place(id, to);
      var steps = Math.floor(secs / (gait === 'run' ? 0.21 : 0.32)), stepSfx = evSfx('enter', 'step');
      for (var i = 0; i < steps; i++) (function (i) { timers.push(setTimeout(function () { if (r === run) sfx(stepSfx, { gain: gait === 'run' ? 0.55 : 0.35, pan: panOf(id) }); }, i * (gait === 'run' ? 210 : 320))); })(i);
      return wait(secs * 1000 + 60, r).then(function () { els[id].style.transitionDuration = '0s'; });
    }
    function lipSync(id, line, dir) {
      var inst = insts[id];
      if (!inst || !inst.groups || !inst.groups.mouth) return function () {};
      var m = {}, a = cast[id];
      ['closed', 'small', 'big'].forEach(function (k) { m[k] = GC.compose(a, line.state, Object.assign({}, dir, { mouth: line.mouths[k] })).layers.mouth; });
      var lastK = null;
      return function (level) {
        var k = level <= 0.05 ? 'closed' : level < 0.6 ? 'small' : 'big';
        if (k !== lastK) { inst.groups.mouth.innerHTML = m[k]; lastK = k; }
      };
    }

    /* ---- lời thoại: BỘ GIẢI chọn chỗ (không che đầu ai) → bong bóng, hoặc phụ đề dải dưới khi tìm không ra chỗ sạch; chữ hiện theo giọng ----
     * Bố cục tính MỘT lần mỗi câu thoại (đo khung xương thật của mọi diễn viên, chiếu qua máy quay hiện tại), tính lại khi đổi cỡ khung / máy quay — không tính mỗi khung hình. */
    // khung xương → px của khung hình, theo vị trí diễn viên + máy quay hiện tại (đầu mở rộng 5 đơn vị + 0,8% chiều ngang cho đỡ hụt khi diễn viên nhún / gật)
    function project(rig, W, H, who, nudge) {
      var heads = [], bodies = [], decor = [], mouth = null, SW = GC.SCENE.W, SH = GC.SCENE.H, pad = 0.008 * W;
      var vis = function (q) { return q.x1 > 0 && q.x0 < W && q.y1 > 0 && q.y0 < H; };
      Object.keys(rig).forEach(function (id) {
        var p = pos[id], r = rig[id]; if (!p) return;
        var px = function (x, y, dx) { var q = toScreen((p.x + (dx || 0) + (x - 100) * p.k) / SW, (p.y + (y - 228) * p.k) / SH); return [q.x * W, q.y * H]; };
        var h0 = px(r.head[0] - 5, r.head[1] - 5), h1 = px(r.head[2] + 5, r.head[3] + 5), b0 = px(r.body[0], r.body[1]), b1 = px(r.body[2], r.body[3]);
        var hd = { id: id, x0: h0[0] - pad, y0: h0[1] - pad, x1: h1[0] + pad, y1: h1[1] + pad }, bd = { id: id, x0: b0[0], y0: b0[1], x1: b1[0], y1: b1[1] };
        // người nói đang bước tới / lùi (nudge, ~0,34 s): hộp đầu / thân phủ cả quãng đường — máy chậm thì lúc bong bóng hiện, họ còn đang trên đường từ chỗ cũ
        if (id === who && nudge) {
          var g0 = px(r.head[0] - 5, r.head[1] - 5, -nudge), g1 = px(r.head[2] + 5, r.head[3] + 5, -nudge), c0 = px(r.body[0], r.body[1], -nudge), c1 = px(r.body[2], r.body[3], -nudge);
          hd.x0 = Math.min(hd.x0, g0[0] - pad); hd.y0 = Math.min(hd.y0, g0[1] - pad); hd.x1 = Math.max(hd.x1, g1[0] + pad); hd.y1 = Math.max(hd.y1, g1[1] + pad);
          bd.x0 = Math.min(bd.x0, c0[0]); bd.x1 = Math.max(bd.x1, c1[0]);
        }
        if (vis(hd)) heads.push(hd);
        if (vis(bd)) bodies.push(bd);
        if (r.fx) { var f0 = px(r.fx[0], r.fx[1]), f2 = px(r.fx[2], r.fx[3]), fd = { x0: f0[0], y0: f0[1], x1: f2[0], y1: f2[1] }; if (vis(fd)) decor.push(fd); }
        if (id === who) mouth = px(r.mouth[0], r.mouth[1]);
      });
      return { heads: heads, bodies: bodies, decor: decor, mouth: mouth ? { x: mouth[0], y: mouth[1] } : { x: W / 2, y: H * 0.4 } };
    }
    function bubble(line) {
      var c = plan.cast.filter(function (x) { return x.id === line.actor; })[0] || {}, mode = 'bubble', on = false, closed = false, rig = null;
      var b = el('div', 'gcp-bub ' + line.bubble), svg = svgEl('svg', { 'aria-hidden': 'true', focusable: 'false' }), nm = el('span', 'nm', c.name || line.actor), tx = el('span', 'tx');
      nm.style.background = chipColor(c.color);
      b.appendChild(svg); b.appendChild(nm); b.appendChild(tx);
      var ws = String(line.say).split(/\s+/).filter(Boolean).map(function (w) { return el('span', 'w', w); });
      ws.forEach(function (s, i) { if (i) tx.appendChild(document.createTextNode(' ')); tx.appendChild(s); });
      b.setAttribute('data-mode', mode);
      ov.appendChild(b);
      function setMode(m) { mode = m; b.className = (m === 'caption' ? 'gcp-cap ' : 'gcp-bub ') + line.bubble + (on ? ' on' : ''); b.setAttribute('data-mode', m); }
      // các cỡ thử (rộng nhất ≤ 38% khung với bong bóng, 80% với phụ đề → hẹp dần): đo chiều cao thật của chữ đã xuống dòng
      function sizes(W) {
        var cap = mode === 'caption', maxW = (cap ? 0.8 : 0.38) * W, em = parseFloat(getComputedStyle(b).fontSize) || 16;
        b.style.width = 'max-content';
        var nw = b.offsetWidth, minW = Math.min(maxW, Math.max((cap ? 0.3 : 0.16) * W, nm.offsetWidth + em * 3.8)), w1 = Math.min(maxW, Math.max(nw, minW)), list = [w1];
        if (nw > minW * 1.3) [0.78, 0.6].forEach(function (f) { var w = Math.max(minW, Math.round(w1 * f)); if (list.every(function (x) { return Math.abs(x - w) > W * 0.03; })) list.push(w); });
        return { em: em, list: list.map(function (w) { b.style.width = w + 'px'; return { w: w, h: b.offsetHeight }; }) };
      }
      function layout(fresh) {
        var W = box.clientWidth, H = box.clientHeight, p = pos[line.actor], t0 = performance.now();
        if (!W || !H || !p) return;
        if (fresh || !rig) { rig = {}; Object.keys(insts).forEach(function (id) { rig[id] = rigOf(insts[id]); }); }
        var S = project(rig, W, H, line.actor, line.nudge), got = null;
        function ask(kind) {
          var z = sizes(W);
          return { z: z, r: GC.film.solveLayout({ kind: kind, W: W, H: H, m: 0.025 * W, who: line.actor, mouth: S.mouth, heads: S.heads, bodies: S.bodies, decor: S.decor, sizes: z.list, prev: lastSpot }) };
        }
        if (dialog !== 'caption') { setMode('bubble'); got = ask('bubble'); if (dialog === 'auto' && !(got.r && got.r.clean)) got = null; }
        if (!got) { setMode('caption'); got = ask('caption'); }
        var res = got.r;
        if (!res) return;
        b.style.width = res.w + 'px'; b.style.left = f1(res.x0) + 'px'; b.style.top = f1(res.y0) + 'px';
        b.setAttribute('data-clean', res.clean ? '1' : '0'); b.setAttribute('data-tag', res.tag || '');
        if (mode === 'bubble') {
          var T = res.tail;
          b.style.setProperty('--ox', (clamp((T.px - res.x0) / res.w, 0, 1) * 100).toFixed(1) + '%'); b.style.setProperty('--oy', (clamp((T.py - res.y0) / res.h, 0, 1) * 100).toFixed(1) + '%');
          drawBubble(svg, line.bubble, res.w, res.h, { x: T.tx - res.x0, y: T.ty - res.y0 }, { em: got.z.em, sw: Math.max(2, W * 0.0023) });
        }
        b.setAttribute('data-tail', res.tail && mode === 'bubble' ? [res.tail.px, res.tail.py, res.tail.tx, res.tail.ty].map(Math.round).join(',') : '');
        lastSpot = { id: line.actor, cx: (res.x0 + res.x1) / 2, cy: (res.y0 + res.y1) / 2 };
        b.setAttribute('data-ms', (performance.now() - t0).toFixed(1));   // chi phí bố cục của câu này (ms): đo MỘT lần mỗi câu / mỗi lần đổi khung
      }
      var api = {
        el: b,
        mode: function () { return mode; },
        layout: layout,
        word: function (i) { for (var j = 0; j < ws.length; j++) { ws[j].classList.toggle('on', j <= i); ws[j].classList.toggle('cur', j === i); } },
        // → Promise: xong khi bong bóng ĐÃ HIỆN ở một khung hình thật — người gọi tính giờ đọc từ đó (máy chậm: khung tới trễ cả giây thì câu không bị "hiện 0,1 s rồi tắt")
        show: function (r) {
          return painted(new Promise(function (ok) {
            var go = function () { layout(true); requestAnimationFrame(function () { if (!closed) { on = true; b.classList.add('on'); } ok(); }); };
            if (fontsOk) go(); else fontsReady.then(go);   // đo chữ khi phông đã về (chưa có thì đo bằng phông dự phòng, vẫn đúng)
          }), r);
        },
        close: function () { closed = true; on = false; b.classList.remove('on'); setTimeout(function () { b.remove(); }, 200); }   // khung hình tới trễ sau close: không mở lại
      };
      return api;
    }

    function build(shot, entering) {
      clearBox();
      var sc = scene(shot);
      if (!sc) { box.appendChild(el('div', 'gcp-empty', shot ? _t('Phân cảnh "{title}" chưa có bối cảnh.', { title: shot.title }) : _t('Chưa có phân cảnh.'))); return null; }
      plan = direct(shot, { project: curProject() }) || { scene: sc, cast: actors(shot).slice(0, R.budget).map(function (a) { return { id: a.id, key: a.key, name: a.name, home: 'center', color: colorOf(a) }; }), beats: [] };
      shk = el('div', 'gcp-shk'); cam = el('div', 'gcp-cam'); ov = el('div', 'gcp-ov'); ov.setAttribute('aria-live', 'polite'); flash = el('div', 'gcp-flash');
      shk.appendChild(cam); box.appendChild(shk); box.appendChild(flash); box.appendChild(ov);
      cam.appendChild(img('bg', GC.sceneSvg(sc, { part: 'back' }), sc.name));
      var list = actors(shot).slice(0, R.budget);
      if (!plan.beats.length) { var at0 = spots(shot, sc, list.map(function (a) { return a.id; })); plan.cast.forEach(function (c) { c.home = at0[c.id]; }); }
      list.forEach(function (a) {
        var c = plan.cast.filter(function (x) { return x.id === a.id; })[0], st = el('div', 'gcp-stage'), e = el('div', 'gcp-actor');
        e.title = a.name; e.appendChild(st); cam.appendChild(e);
        els[a.id] = e; cast[a.id] = a;
        var enter = entering && plan.beats.filter(function (b) { return b.type === 'enter' && b.actor === a.id; })[0];
        place(a.id, spotAt(c.home, enter ? (enter.from === 'left' ? -70 : GC.SCENE.W + 70) : null));
        insts[a.id] = R.full(st, a, 'normal');
      });
      cam.appendChild(img('fg', GC.sceneSvg(sc, { part: 'front' })));
      camera('wide', null, false, true);
      return plan;
    }
    // ảnh tĩnh của phân cảnh (chưa diễn): mọi người ở chỗ đứng, quay về nhau
    function show(shot) {
      if (!build(shot, false)) return false;
      var first = plan.beats.filter(function (b) { return b.type === 'line'; })[0];
      Object.keys(insts).forEach(function (id) { act(id, 'normal', first ? { view: first.face[id] } : null); });
      return true;
    }

    function enterAll(r) {
      var ent = plan.beats.filter(function (b) { return b.type === 'enter'; });
      if (!ent.length) return Promise.resolve();
      sfx('whoosh', { gain: 0.4 });
      var first = plan.beats.filter(function (b) { return b.type === 'line'; })[0];
      return Promise.all(ent.map(function (b) {
        // tới chỗ đứng thì quay về phía người sắp nói (hoặc người nói quay về người nghe)
        return wait(b.delay * 1000, r).then(function () { return walk(b.actor, b.to, b.gait || 'walk', r); }).then(function () { act(b.actor, 'normal', first ? { view: first.face[b.actor] } : null); });
      }));
    }
    function speak(line, r) {
      var id = line.actor, dir = Object.assign({}, line.director, line.face[id] ? { view: line.face[id] } : {});
      // bước im (không chữ — chỉ diễn + âm, vd. thề trước khi nói, v0.18): KHÔNG mở bong bóng rỗng; vẫn diễn, phát âm, giữ khung theo hold
      var spoken = !!String(line.say || '').trim(), mouth = lipSync(id, line, dir), voice = voiceOf(id), b = spoken ? bubble(line) : null, done = false;
      bub = b;
      act(id, line.state, dir);
      Object.keys(els).forEach(function (k) { els[k].classList.toggle('speaking', k === id); });   // người nói luôn ở lớp trên
      // bước tới / lùi nửa bước theo cảm xúc (ngắn, không chặn lời thoại) — xong câu thì về chỗ
      var home = pos[id], nudged = false;   // chỗ đang đứng (tên chỗ hoặc toạ độ sau màn đấu)
      if (line.nudge && pos[id]) {
        nudged = true;
        var p0 = pos[id], e = els[id];
        e.style.transitionDuration = '.34s'; place(id, { x: p0.x + line.nudge, y: p0.y, k: p0.k, spot: p0.spot });
        sfx(evSfx('enter', 'step'), { gain: 0.4, pan: panOf(id) });
        timers.push(setTimeout(function () { e.style.transitionDuration = '0s'; }, 360));
      }
      Object.keys(line.listen).forEach(function (o) { var L = line.listen[o]; act(o, L.state, Object.assign({ view: line.face[o] }, L.motion ? { motion: L.motion } : {})); });
      line.sfx.forEach(function (n, i) { timers.push(setTimeout(function () { if (r === run) sfx(n, { pan: panOf(id) }); }, 120 + i * 260)); });
      if (line.screen === 'flash') { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }
      if (line.screen) { shk.classList.remove('shake'); void shk.offsetWidth; shk.classList.add('shake'); }
      var cp = clipFor(line);   // có voiceClip thì hỏi giọng thu sẵn ngay (song song với bước vào cảnh), tới lúc nói đã sẵn
      return wait(260, r).then(function () { return cp ? gate(cp, line, r) : null; }).then(function (clip) {
        if (r !== run) return Promise.reject('stop');
        if (!b) return wait(Math.max(380, (line.hold || 0) * 1000), r);
        // mở bong bóng khi sân khấu đã đứng yên trên màn hình; giờ đọc + hold tính từ lúc bong bóng THẬT SỰ hiện (CNS-099)
        return settle(r).then(function () { return b.show(r); }).then(function () { return say(clip); });
      }).then(function () {
        done = true; mouth(0); if (b) b.close(); bub = null;
        if (nudged && r === run) { els[id].style.transitionDuration = '.4s'; place(id, home); timers.push(setTimeout(function () { if (els[id]) els[id].style.transitionDuration = '0s'; }, 420)); }
      }, function (e) { done = true; if (b) b.close(); bub = null; throw e; });
      function say(clip) {
        if (r !== run) return Promise.reject('stop');
        sfx('pop', { gain: 0.5, pan: panOf(id) }); var t0 = Date.now();
        var n = String(line.say).split(/\s+/).filter(Boolean).length;
        var hooks = { onMouth: function (v) { if (r === run && !done) mouth(v); }, onWord: function (i) { if (r === run && !done) b.word(i); } };
        if (clip) hooks.clip = clip;
        if (voice && (typeof opts.needGood === 'function' ? opts.needGood(line) : opts.needGood)) voice.needGood = true;   // phim có giọng AI: câu thiếu clip (hoặc clip hỏng) không rơi vào robot — GC.audio chỉ nhận giọng hạng good, không thì blip
        var talk = A ? A.say(line.say, voice, hooks) : fallbackSay(line, n, hooks, r);
        var cap = wait((line.estimate * 2.2 + 3) * 1000, r);   // giọng đọc treo (onend không về) cũng không làm kẹt phim
        return Promise.race([talk, cap]).then(function () { b.word(n); mouth(0); return wait(Math.max(380, (line.hold || 0) * 1000 - (Date.now() - t0)), r); });   // hold = khung hiện tối thiểu
      }
    }
    // không có engine/audio.js: vẫn nhép miệng + hiện chữ theo thời gian đọc ước tính
    function fallbackSay(line, n, hooks, r) {
      var per = Math.max(0.22, (line.estimate - 0.4) / Math.max(1, n));
      for (var i = 0; i < n; i++) (function (i) {
        timers.push(setTimeout(function () { hooks.onWord(i); hooks.onMouth(i % 3 === 2 ? 0.8 : 0.45); }, i * per * 1000));
        timers.push(setTimeout(function () { hooks.onMouth(0); }, (i + 0.55) * per * 1000));
      })(i);
      return wait(n * per * 1000 + 200, r);
    }
    /* ---- hành động (biên đạo, v0.15): chạy dòng thời gian choreo NGAY trên diễn viên đang có — đấu hai người hoặc múa một mình ---- */
    function perform(beat, r) {
      var C = GC.choreo, ids = [beat.actor].concat(beat.target ? [beat.target] : []);
      if (!C || ids.some(function (id) { return !insts[id] || !insts[id].drive; })) return Promise.resolve();
      (beat.sfx || []).forEach(function (n, i) { timers.push(setTimeout(function () { if (r === run) sfx(n, { pan: panOf(beat.actor) }); }, 120 + i * 260)); });
      var tl = beat.tl;
      // đứng lệch chỗ so với lúc đạo diễn tính (vd. tua giữa chừng) → dựng lại cho khớp vị trí thật
      if (!tl || Math.abs(pos[beat.actor].x - beat.from[0]) > 2 || (beat.target && Math.abs(pos[beat.target].x - beat.from[1]) > 2)) {
        var P = function (id) { return { asset: cast[id], x: pos[id].x, y: pos[id].y, k: pos[id].k }; };
        var walls = Object.keys(pos).filter(function (id) { return ids.indexOf(id) < 0 && insts[id]; }).map(function (id) { return pos[id].x; });
        try { tl = beat.target ? C.duel({ a: P(beat.actor), b: P(beat.target), action: beat.action, react: beat.react, walls: walls }) : C.solo({ a: P(beat.actor), action: beat.action, dir: beat.dir || 1, walls: walls }); }
        catch (e) { return Promise.resolve(); }   // không dựng lại được → bỏ màn này, phim vẫn chạy tiếp
      }
      // người xem quay về phía màn đấu
      Object.keys(insts).forEach(function (id) { if (ids.indexOf(id) < 0) act(id, 'normal', { view: pos[id].x > pos[beat.actor].x ? 'left45' : 'right45' }); });
      Object.keys(els).forEach(function (k) { els[k].classList.toggle('speaking', k === beat.actor); });
      var fxs = svgEl('svg', { viewBox: '0 0 ' + GC.SCENE.W + ' ' + GC.SCENE.H, preserveAspectRatio: 'none', class: 'gcp-fx' });
      var ovs = svgEl('svg', { viewBox: '0 0 ' + GC.SCENE.W + ' ' + GC.SCENE.H, preserveAspectRatio: 'none', class: 'gcp-fx gcp-fxo' });
      cam.appendChild(fxs); box.appendChild(ovs);
      camera(beat.target ? 'two' : 'close', ids, false);
      var t0 = performance.now(), lastR = 0, lastCam = 0, fired = {}, rows = ids.map(function (id) { return pos[id]; });
      // mỗi khung (gọi từ vòng vẽ của diễn viên chính): âm thanh, rung, đẩy máy khi trúng, người xem giật mình, hiệu ứng, máy quay bám
      function frame(rr, st) {
        tl.events.forEach(function (e) {
          if (fired[e.i] || e.rt > rr) return;
          fired[e.i] = 1;
          if (e.rt < rr - 0.25) return;   // tab ẩn rồi hiện lại: bỏ sự kiện đã quá giờ, không nổ dồn một lúc
          var pan = e.x != null ? Math.max(-0.8, Math.min(0.8, (e.x - 320) / 320)) : panOf(beat.actor);
          if (e.sfx) [].concat(e.sfx).forEach(function (n) { sfx(strikeSfx(n, e, beat), { gain: e.gain != null ? e.gain : 0.8, pan: pan }); });
          if (e.shake) { shk.classList.remove('shake'); void shk.offsetWidth; shk.classList.add('shake'); }
          if ((e.hitstop > 0 || e.hit) && !e.miss) {
            camera(beat.target ? 'two' : 'close', ids, true);
            timers.push(setTimeout(function () { if (r === run) camera(beat.target ? 'two' : 'close', ids, false); }, 260));
            Object.keys(insts).forEach(function (id) { if (ids.indexOf(id) < 0) act(id, 'shock', { motion: 'jolt', view: pos[id].x > pos[beat.actor].x ? 'left45' : 'right45' }); });
          }
        });
        lastR = rr;
        if (rr - lastCam > 0.35) { lastCam = rr; camera(beat.target ? 'two' : 'close', ids, false); }   // diễn viên lướt / văng xa → máy bám theo
        fxs.innerHTML = C.fxSvg(tl, rr, st);
        ovs.innerHTML = C.overlaySvg(tl, rr, { bare: true });
      }
      ids.forEach(function (id, ai) {
        els[id].style.transitionDuration = '0s';
        insts[id].drive(function (now) {
          if (r !== run) return null;
          var rr = Math.min(tl.real, (now - t0) / 1000), st = C.realToStory(tl, rr), F = C.finalAt(tl, st, ai);
          if (ai === 0) frame(rr, st);
          place(id, { x: F.x, y: rows[ai].y, k: rows[ai].k, spot: rows[ai].spot });
          return { pose: F.pose, layers: F.layers, sig: F.sig, blend: rr < 0.22 ? 0.3 : 1 };   // vào biên đạo: hoà dần từ dáng đang có
        });
      });
      // dọn dẹp dùng chung: hết màn, bị dừng (stop() xoá hẹn giờ nên promise không bao giờ xong) hoặc lỗi
      var cleaned = false, cleanup = function () {
        if (cleaned) return; cleaned = true; acting = null;
        fxs.remove(); ovs.remove();
        ids.forEach(function (id) { if (insts[id] && insts[id].driver) insts[id].drive(null); });
      };
      acting = cleanup;
      return wait(tl.real * 1000 + 120, r).then(function () {
        var end = ids.map(function (id, ai) { return C.finalAt(tl, tl.T, ai).x; });
        ids.forEach(function (id, ai) {
          insts[id].drive(null);
          place(id, { x: end[ai], y: rows[ai].y, k: rows[ai].k, spot: rows[ai].spot });
          var o = ids[1 - ai] || null, view = o ? (pos[o].x < end[ai] ? 'left45' : 'right45') : 'front';
          act(id, ai === 1 && beat.react === 'ko' ? 'dizzy' : ai === 1 && beat.react !== 'dodge' && beat.react !== 'block' ? 'injured' : 'normal', { view: view });
        });
        cleanup();
      }, function (e) { cleanup(); throw e; });
    }
    function lines(r) {
      var L = plan.beats.filter(function (b) { return b.type === 'line' || b.type === 'act'; }), i = 0, lastCam = 'wide';
      return (function next() {
        if (r !== run) return Promise.reject('stop');
        if (i >= L.length) return Promise.resolve();
        var line = L[i++];
        progress((plan.shotTitle || '') + ' · ' + i + '/' + L.length);
        var go = Promise.resolve();
        if (line.move) { camera('wide'); go = wait(300, r).then(function () { sfx('whoosh', { gain: 0.35, pan: panOf(line.actor) }); return walk(line.actor, line.move.to, line.move.gait, r); }); }
        if (line.type === 'act') { progress((plan.shotTitle || '') + ' · ' + _l(line.label)); lastCam = 'two'; return go.then(function () { return perform(line, r); }).then(next); }
        return go.then(function () {
          camera(line.camera, line.camOn, line.punch);
          if (line.camera !== 'wide' && line.camera !== lastCam) sfx(evSfx('cut', 'whoosh'), { gain: 0.18 });
          lastCam = line.camera;
          return wait(line.camera === 'wide' ? 150 : 420, r);
        }).then(function () { return speak(line, r); }).then(next);
      })();
    }
    function card(text, sub, r, ms) {
      clearBox();
      var c = el('div', 'gcp-title'); c.appendChild(el('b', null, text)); if (sub) c.appendChild(el('span', null, sub));
      box.appendChild(c);
      sfx('gong', { gain: 0.6 });
      return wait(ms || 1700, r);
    }
    function stop() { run++; timers.forEach(clearTimeout); timers = []; clips = new Map(); if (acting) acting(); if (A) A.stopAll(); bub = null; if (ov) Array.prototype.forEach.call(ov.querySelectorAll('.gcp-bub,.gcp-cap'), function (b) { b.remove(); }); }
    function playShot(shot, r) {
      if (r !== run) return Promise.reject('stop');   // đã stop / show trong cùng tick: không dựng lại sân khấu, không bật nhạc
      if (!build(shot, true)) return Promise.resolve();
      plan.shotTitle = shot.title;
      clips = new Map(); prefetch(r);
      if (A) { A.ambient(plan.ambient); A.music(plan.mood); }
      return wait(350, r).then(function () { return enterAll(r); }).then(function () { return wait(250, r); }).then(function () { return lines(r); }).then(function () { camera('wide'); return wait(900, r); });
    }
    return {
      show: function (shot) { stop(); return show(shot); },   // show huỷ vòng diễn đang chạy
      stop: function () { stop(); progress(_t('Đã dừng')); },
      destroy: function () { stop(); if (ro) ro.disconnect(); clearBox(); },
      plan: function () { return plan; },
      dialog: function () { return dialog; },
      // đổi kiểu lời thoại giữa chừng (Studio, phim xuất ra): 'auto' | 'bubble' | 'caption'; câu đang hiện được bố trí lại ngay
      setDialog: function (m) { if (DIALOGS.indexOf(m) < 0) return false; dialog = m; if (bub) bub.layout(true); return true; },
      // đổi ngôn ngữ phim giữa chừng (Studio): áp từ câu thoại kế tiếp
      setLang: function (l, a) { lang = l; accent = a; },
      // dự án của tác phẩm đang diễn (chọn gói âm): chuỗi hoặc hàm → chuỗi; áp từ phân cảnh kế tiếp
      setProject: function (p) { projectOpt = p; },
      // diễn chuỗi: thẻ tiêu đề phân cảnh → nhân vật ra sân → lời thoại có dàn dựng; bỏ qua phân cảnh chưa sẵn sàng
      play: function (list, title) {
        stop();
        if (A) A.unlock();   // gọi ngay trong cú bấm của người xem (trình duyệt chỉ cho phát tiếng sau thao tác)
        var r = run, i = 0, ready = (list || []).filter(function (s) { return !issues(s).length; });
        if (!ready.length) { progress(_t('Chưa có phân cảnh nào đủ bối cảnh + diễn viên + lời thoại')); return false; }
        (function next() {
          if (i >= ready.length) {
            progress((title || '') + ' · ' + _t('hết'));
            if (A) { A.music(null); A.ambient(null); }
            return card(title || _t('Hết'), _t('hết'), r, 2400).then(function () { if (opts.onEnd) opts.onEnd(); }).catch(function () {});
          }
          var shot = ready[i++];
          return (ready.length > 1 ? card(shot.title, _t('Phân cảnh {i}/{n}', { i: i, n: ready.length }), r) : Promise.resolve())
            .then(function () { return playShot(shot, r); }).then(next)
            .catch(function () {});
        })();
        return true;
      }
    };
  }

  GC.film = { moodOf: moodOf, clipKey: clipKey, lines: lines, readiness: readiness, issues: issues, still: still, spots: spots, actors: actors, scene: scene, direct: direct, player: player, injectCSS: injectCSS, solveLayout: solveLayout, chipColor: chipColor, contrast: contrast, dialogModes: DIALOGS.slice() };
})(window.GenChibi);
