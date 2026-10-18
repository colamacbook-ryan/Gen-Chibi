/* gen-chibi engine — player 0.2 "Phim sống": trình diễn TÁC PHẨM có dàn dựng
 * © 2026 Gen Labs — All rights reserved.
 *
 * Dùng chung cho Studio (Tạo tác › Tác phẩm) và tệp phim xuất ra (HTML độc lập, không cần cài gì).
 * Cần engine/core.js + engine/render.js; engine/audio.js (nếu có) cho hiệu ứng âm thanh, nền, nhạc và giọng nói.
 *
 *   GC.film.readiness(work)      → [{ shot, index, ok, missing: [...] }]   phân cảnh nào diễn được, thiếu gì
 *   GC.film.still(shot)          → chuỗi SVG ảnh tĩnh của phân cảnh (bối cảnh + diễn viên ở chỗ đứng)
 *   GC.film.direct(shot)         → KẾ HOẠCH DÀN DỰNG (thuần dữ liệu, chạy cả trong Node): ai ra sân từ đâu, ai đi tới đâu,
 *                                   ai nói với ai, quay mặt, cử chỉ, bong bóng, máy quay, hiệu ứng màn hình, âm thanh, khẩu hình
 *   GC.film.player(el, opts)     → { show(shot), play(shots, title), stop(), destroy() }
 *                                   opts.onProgress(text), opts.onEnd()
 *
 * Ngân sách (L-42): diễn viên sống ≤ GC.render.budget mỗi phân cảnh, hết cảnh là huỷ; máy quay = một transform CSS;
 * nhép miệng chỉ thay LỚP MIỆNG của người đang nói (không dựng lại cả nhân vật); âm thanh tổng hợp, không tải tệp.
 */
(function (GC) {
  'use strict';
  var MY_PACK = 'local.my';
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
    var miss = [], sc = scene(s), acts = actors(s);
    if (!s.scene) miss.push('bối cảnh'); else if (!sc) miss.push('bối cảnh đã bị xoá khỏi Thư viện');
    if (!(s.cast || []).length) miss.push('diễn viên'); else if (acts.length < s.cast.length) miss.push((s.cast.length - acts.length) + ' diễn viên không còn trong Thư viện');
    if (!s.event) miss.push('lời thoại');
    if (sc && acts.length > sc.spots.length) miss.push('dàn diễn viên nhiều hơn chỗ đứng');
    return miss;
  }
  function readiness(work) {
    return (work && work.shots || []).map(function (s, i) { var miss = issues(s); return { shot: s, index: i, ok: !miss.length, missing: miss }; });
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

  function sx(spot) { var s = GC.SCENE.spots[spot]; return s ? s.x : 320; }
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
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function faceTo(cur, me, target) {
    if (!target || !cur[target]) return 'front';
    var d = sx(cur[target]) - sx(cur[me]);
    return d < -4 ? 'left45' : d > 4 ? 'right45' : 'front';
  }

  function direct(shot) {
    var sc = scene(shot), ev = shot && shot.event;
    if (!sc || !ev) return null;
    var budget = GC.render ? GC.render.budget : 8;
    var list = actors(shot).slice(0, budget), ids = list.map(function (a) { return a.id; });
    var home = spots(shot, sc, ids), cur = {}, state = {}, steps = (ev.steps || []).filter(function (s) { return ids.indexOf(s.actor) >= 0; });
    var sky = sc.layers && sc.layers.sky && GC.getPart && GC.getPart('sky', sc.layers.sky.part);
    var plan = { scene: sc, mood: moodOf(steps), ambient: { time: sc.time || 'day', weather: sc.weather || 'clear', indoor: !!(sky && sky.outdoor === false) }, cast: [], beats: [] };
    // ra sân: ai đứng nửa trái vào từ trái, nửa phải vào từ phải; so le để không ùa vào cùng lúc
    list.forEach(function (a, i) {
      var to = home[a.id];
      plan.cast.push({ id: a.id, key: a.key, name: a.name, home: to, color: colorOf(a), voice: a.voice || null, role: a.role || '', persona: a.persona || '' });
      var first = (ev.steps || []).filter(function (s) { return s.actor === a.id; })[0];
      plan.beats.push({ type: 'enter', actor: a.id, from: sx(to) < 320 ? 'left' : 'right', to: to, delay: +(i * 0.28).toFixed(2),
        gait: first && (first.state === 'panic' || first.state === 'rage') ? 'run' : 'walk' });
      cur[a.id] = to; state[a.id] = 'normal';
    });
    var prev = null, lastCam = null, pair = null;
    steps.forEach(function (s, i) {
      var me = s.actor, base = GC.LIB.states[s.state] || GC.LIB.states.normal;
      var line = { type: 'line', i: i, actor: me, say: s.say, state: s.state, hold: s.hold || 0 };
      // đi tới chỗ mới khi spot đổi (chạy khi hoảng / giận hoặc đường xa)
      if (s.spot && s.spot !== cur[me]) {
        var dist = Math.abs(sx(s.spot) - sx(cur[me]));
        line.move = { from: cur[me], to: s.spot, gait: s.state === 'panic' || s.state === 'rage' || dist > 300 ? 'run' : 'walk' };
        cur[me] = s.spot;
      }
      // nói với ai: chỉ định > người vừa nói > người đứng gần nhất
      var to = s.to && s.to !== me && ids.indexOf(s.to) >= 0 ? s.to : prev && prev !== me ? prev : nearest(me, ids, cur);
      line.to = to || null;
      // hướng nhìn: người nói nhìn người nghe; mọi người khác nhìn người nói
      line.face = {};
      ids.forEach(function (id) { line.face[id] = faceTo(cur, id, id === me ? to : me); });
      // cử chỉ: activity / motion chỉ định > động tác riêng của cảm xúc; cảm xúc "đứng yên" thì khoa tay khi nói
      line.director = {};
      ['motion', 'fx', 'activity', 'posture', 'move', 'facing', 'view'].forEach(function (k) { if (s[k] !== undefined) line.director[k] = s[k]; });
      if (s.view) line.face[me] = s.view;
      if (!s.activity && !s.motion && (!base.motion || base.motion === 'idle')) line.director.motion = 'talk';
      // người nghe: về nét mặt bình thường (trừ ngủ / khóc / mệt…), gật gù xen kẽ; câu hét làm người nghe giật mình
      state[me] = s.state;
      line.listen = {};
      ids.forEach(function (id) {
        if (id === me) return;
        var st = KEEP[state[id]] ? state[id] : 'normal';
        line.listen[id] = { state: st, motion: SHOUT[s.state] ? 'jolt' : (i + id.length) % 2 && st === 'normal' ? 'nod' : null };
      });
      // bong bóng: chỉ định > nghĩ (think / sleep) > hét (cảm xúc mạnh có "!") > nói
      line.bubble = s.bubble || (THINK[s.state] ? 'think' : SHOUT[s.state] && /[!?]/.test(s.say) ? 'shout' : 'say');
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
      line.sfx = s.sfx ? s.sfx.slice(0, 3) : uniq((SFX_STATE[s.state] || []).concat((s.fx || []).map(function (f) { return SFX_FX[f]; }), [SFX_ACT[s.activity]])).slice(0, 2);
      // khẩu hình: miệng ngậm (giữ nét cười / mím của cảm xúc) ↔ mở nhỏ ↔ mở to (hét / cười lớn)
      var mouth = base.mouth;
      line.mouths = { closed: CLOSED[mouth] ? mouth : 'flat', small: 'oSmall', big: line.bubble === 'shout' ? 'shout' : mouth === 'laugh' ? 'laugh' : 'oBig' };
      line.estimate = Math.max(1.6, words(s.say) * 0.3 + 0.6, s.hold || 0);
      // bước tới / lùi lại theo cảm xúc (không khi vừa đi tới chỗ mới hoặc hoạt động tự di chuyển); xong câu thì về chỗ
      var lean = LEAN[s.state] || 0, act0 = s.activity && GC.LIB.activities[s.activity];
      // bước tới không đè lên người nghe: giữ khoảng cách tối thiểu ~ một thân người (100 đơn vị cảnh)
      var gapTo = to ? Math.abs(sx(cur[to]) - sx(cur[me])) : 0, room = lean > 0 ? Math.max(0, gapTo - 100) : 60;
      if (lean && to && !line.move && !(act0 && act0.move) && Math.min(Math.abs(lean), room) >= 12) line.nudge = (sx(cur[to]) < sx(cur[me]) ? -1 : 1) * (lean > 0 ? Math.min(lean, room) : lean);
      pair = to ? [me, to] : null; lastCam = cam; prev = me;
      plan.beats.push(line);
    });
    return plan;
  }

  /* ============================================================ DOM */
  var INK = '#1f1a17';
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
    // bong bóng thoại: hình vẽ SVG (nói / hét / nghĩ / thì thầm) + chữ hiện theo giọng đọc
    '.gcp-bub{position:absolute;max-width:46%;min-width:14%;padding:.7em 1.05em .75em;color:' + INK + ';font:700 max(12px,2.05cqw)/1.32 ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",system-ui,sans-serif;text-align:center;letter-spacing:.005em;',
    'opacity:0;transform:scale(.6);transform-origin:var(--ox,50%) var(--oy,100%);transition:opacity .16s ease-out,transform .32s cubic-bezier(.3,1.7,.5,1)}',
    '.gcp-bub.on{opacity:1;transform:scale(1)}',
    '.gcp-bub>svg{position:absolute;left:0;top:0;overflow:visible;z-index:-1}',
    '.gcp-bub .nm{position:absolute;left:.9em;top:-1.05em;padding:.14em .75em .18em;border-radius:1em;color:#fff;font-size:.74em;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:2px solid ' + INK + ';white-space:nowrap}',
    '.gcp-bub .w{opacity:.12;transition:opacity .12s}.gcp-bub .w.on{opacity:1}',
    '.gcp-bub.shout{font-size:max(13px,2.35cqw);font-weight:900;letter-spacing:.01em}.gcp-bub.shout.on{animation:gcp-quake .12s linear 4}',
    '@keyframes gcp-quake{25%{transform:translate(1px,-1px)}75%{transform:translate(-1px,1px)}}',
    '.gcp-bub.think{font-style:italic;font-weight:600}.gcp-bub.whisper{font-weight:500;color:#5d5852;font-size:max(11px,1.8cqw)}',
    '.gcp-title{position:absolute;inset:0;z-index:60;display:grid;place-content:center;text-align:center;gap:.5em;background:radial-gradient(ellipse at center,#26252b,#111);color:#f4f1ea;',
    'font-family:ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,sans-serif;animation:gcp-in .5s ease-out}',
    '@keyframes gcp-in{from{opacity:0}}',
    '.gcp-title b{font-size:max(20px,4cqw);letter-spacing:-.01em}',
    '.gcp-title span{font-size:max(11px,1.3cqw);opacity:.65;letter-spacing:.18em;text-transform:uppercase}',
    '.gcp-empty{position:absolute;inset:0;display:grid;place-items:center;color:#8e897f;font:13px system-ui,sans-serif;padding:16px;text-align:center}',
    '@media (prefers-reduced-motion:reduce){.gcp-cam{transition:none}.gcp-shk.shake,.gcp-bub.shout.on{animation:none}}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('gcp-css')) return;
    var s = document.createElement('style'); s.id = 'gcp-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function img(cls, svg, alt) { var e = el('img', cls); e.alt = alt || ''; e.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); return e; }
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  /* ---- hình bong bóng (toạ độ px của chính bong bóng; đuôi chỉ tới (tx, ty) ngoài khung) ---- */
  function roundRect(w, h, r) { return 'M' + r + ',0 H' + (w - r) + ' Q' + w + ',0 ' + w + ',' + r + ' V' + (h - r) + ' Q' + w + ',' + h + ' ' + (w - r) + ',' + h + ' H' + r + ' Q0,' + h + ' 0,' + (h - r) + ' V' + r + ' Q0,0 ' + r + ',0 Z'; }
  function tailBase(w, h, tx, ty) {
    // gốc đuôi trên cạnh gần đích nhất (đáy / trên / trái / phải), rộng ~ 16% cạnh, lệch về phía đích
    var cx = Math.max(w * 0.18, Math.min(w * 0.82, tx)), cy = Math.max(h * 0.25, Math.min(h * 0.75, ty)), half = Math.max(9, Math.min(w, h) * 0.13);
    if (ty > h) return [[cx - half, h - 2], [cx + half, h - 2]];
    if (ty < 0) return [[cx - half, 2], [cx + half, 2]];
    if (tx < 0) return [[2, cy - half], [2, cy + half]];
    return [[w - 2, cy - half], [w - 2, cy + half]];
  }
  function drawBubble(svg, kind, w, h, tx, ty) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    var sw = 3, fill = '#fffdf8', b = tailBase(w, h, tx, ty), tail = [b[0], [tx, ty], b[1]].map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var shadow = svgEl('g', { transform: 'translate(3 4)', opacity: '.16' });
    if (kind === 'think') {
      // đám mây: chuỗi vòng tròn quanh elip + ba bọt nhỏ bay về phía đầu
      var cs = [], n = Math.max(9, Math.round((w + h) / 26));
      for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; cs.push([w / 2 + Math.cos(a) * w * 0.47, h / 2 + Math.sin(a) * h * 0.44, Math.max(10, Math.min(w, h) * (0.2 + 0.05 * (i % 2)))]); }
      cs.forEach(function (c) { shadow.appendChild(svgEl('circle', { cx: c[0], cy: c[1], r: c[2], fill: '#000' })); });
      svg.appendChild(shadow);
      cs.forEach(function (c) { svg.appendChild(svgEl('circle', { cx: c[0], cy: c[1], r: c[2], fill: fill, stroke: INK, 'stroke-width': sw })); });
      svg.appendChild(svgEl('ellipse', { cx: w / 2, cy: h / 2, rx: w * 0.47, ry: h * 0.44, fill: fill }));
      [0.35, 0.62, 0.84].forEach(function (t, j) {
        var px = w / 2 + (tx - w / 2) * t, py = h / 2 + (ty - h / 2) * t + (j ? 0 : h * 0.1);
        svg.appendChild(svgEl('circle', { cx: px, cy: py, r: Math.max(3, 9 - j * 3), fill: fill, stroke: INK, 'stroke-width': 2.4 }));
      });
      return;
    }
    if (kind === 'shout') {
      // nổ tung: răng cưa quanh elip, đuôi nhọn
      var pts = [], m = Math.max(14, Math.round((w + h) / 18));
      for (var q = 0; q < m * 2; q++) { var ang = q / (m * 2) * Math.PI * 2, rr = q % 2 ? 1.0 : 1.16 + (q % 4 === 0 ? 0.05 : 0); pts.push((w / 2 + Math.cos(ang) * w * 0.53 * rr).toFixed(1) + ',' + (h / 2 + Math.sin(ang) * h * 0.58 * rr).toFixed(1)); }
      shadow.appendChild(svgEl('polygon', { points: pts.join(' '), fill: '#000' }));
      svg.appendChild(shadow);
      svg.appendChild(svgEl('polygon', { points: tail, fill: fill, stroke: INK, 'stroke-width': sw, 'stroke-linejoin': 'miter' }));
      svg.appendChild(svgEl('polygon', { points: pts.join(' '), fill: fill, stroke: INK, 'stroke-width': sw + 0.5, 'stroke-linejoin': 'miter' }));
      svg.appendChild(svgEl('polygon', { points: tail, fill: fill, stroke: 'none', transform: 'translate(0 0)' }));
      return;
    }
    var r = Math.min(22, h / 2), body = roundRect(w, h, r);
    shadow.appendChild(svgEl('path', { d: body, fill: '#000' }));
    svg.appendChild(shadow);
    var dash = kind === 'whisper' ? { 'stroke-dasharray': '7 6' } : {};
    svg.appendChild(svgEl('polygon', Object.assign({ points: tail, fill: fill, stroke: INK, 'stroke-width': sw, 'stroke-linejoin': 'round' }, dash)));
    svg.appendChild(svgEl('path', Object.assign({ d: body, fill: fill, stroke: INK, 'stroke-width': sw }, dash)));
    // che đường viền thân ở gốc đuôi → đuôi liền với thân: tam giác tô nền từ gốc (lùi vào trong thân) tới 40% đường về đích
    var horiz = b[0][1] === b[1][1], inX = horiz ? 2.5 : 0, inY = horiz ? 0 : 2.5;
    var c0 = [b[0][0] + inX + (b[0][0] < 3 ? 3 : b[0][0] > w - 3 ? -3 : 0), b[0][1] + inY + (b[0][1] < 3 ? 3 : b[0][1] > h - 3 ? -3 : 0)];
    var c1 = [b[1][0] - inX + (b[1][0] < 3 ? 3 : b[1][0] > w - 3 ? -3 : 0), b[1][1] - inY + (b[1][1] < 3 ? 3 : b[1][1] > h - 3 ? -3 : 0)];
    var mid = [(c0[0] + c1[0]) / 2 * 0.6 + tx * 0.4, (c0[1] + c1[1]) / 2 * 0.6 + ty * 0.4];
    svg.appendChild(svgEl('polygon', { points: [c0, mid, c1].map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), fill: fill }));
  }

  function player(box, opts) {
    opts = opts || {};
    GC.render.injectCSS(); injectCSS();
    var R = GC.render, A = GC.audio || null, insts = {}, els = {}, cast = {}, pos = {}, run = 0, timers = [], cam = null, ov = null, shk = null, flash = null, bub = null, plan = null, camState = null;
    var progress = function (t) { if (opts.onProgress) opts.onProgress(t); };
    var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { if (bub) bub.layout(); }) : null;
    if (ro) ro.observe(box);
    function clearBox() {
      Object.keys(insts).forEach(function (k) { insts[k].destroy(); });
      insts = {}; els = {}; cast = {}; pos = {}; bub = null; camState = null;
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
    function sfx(name, o) { if (A && name) A.sfx(name, o); }
    function voiceOf(id) { var a = cast[id]; return A && a ? A.voiceOf(a) : null; }
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
      var tx = mode === 'wide' ? 0 : Math.max(1 - S, Math.min(0, 0.5 - fx * S)), ty = mode === 'wide' ? 0 : Math.max(1 - S, Math.min(0, cy - fy * S));
      camState = { S: S, tx: tx, ty: ty };
      cam.classList.toggle('cut', !!cut);
      cam.style.transform = 'translate(' + (tx * 100).toFixed(3) + '%,' + (ty * 100).toFixed(3) + '%) scale(' + S.toFixed(4) + ')';
      if (cut) { void cam.offsetWidth; cam.classList.remove('cut'); }
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
      var steps = Math.floor(secs / (gait === 'run' ? 0.21 : 0.32));
      for (var i = 0; i < steps; i++) (function (i) { timers.push(setTimeout(function () { if (r === run) sfx('step', { gain: gait === 'run' ? 0.55 : 0.35, pan: panOf(id) }); }, i * (gait === 'run' ? 210 : 320))); })(i);
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

    /* ---- bong bóng: đặt cạnh đầu người nói, đuôi chỉ tới miệng, chữ hiện từng từ theo giọng ---- */
    function bubble(line) {
      var b = el('div', 'gcp-bub ' + line.bubble), svg = svgEl('svg', {}), c = (plan.cast.filter(function (x) { return x.id === line.actor; })[0] || {});
      var nm = el('span', 'nm', c.name || line.actor); nm.style.background = c.color || '#5b6b7b';
      b.appendChild(svg); b.appendChild(nm);
      var ws = String(line.say).split(/\s+/).filter(Boolean).map(function (w, i) { var s = el('span', 'w', w); return s; });
      ws.forEach(function (s, i) { if (i) b.appendChild(document.createTextNode(' ')); b.appendChild(s); });
      ov.appendChild(b);
      var api = {
        el: b,
        layout: function () {
          var W = box.clientWidth, H = box.clientHeight, p = pos[line.actor];
          if (!W || !p) return;
          var mouth = toScreen(p.x / GC.SCENE.W, (p.y - (228 - 131) * p.k) / GC.SCENE.H), crown = toScreen(p.x / GC.SCENE.W, (p.y - 178 * p.k) / GC.SCENE.H);
          var bw = b.offsetWidth, bh = b.offsetHeight, gap = 0.05 * H;
          // trên đầu nếu đủ chỗ; không thì đặt cạnh đầu, về phía còn trống của khung
          var left, top;
          if (crown.y * H - bh - gap > 6) { left = mouth.x * W - bw * (mouth.x < 0.5 ? 0.3 : 0.7); top = crown.y * H - bh - gap; }
          else { var right = mouth.x < 0.55; left = right ? mouth.x * W + 0.1 * W : mouth.x * W - 0.1 * W - bw; top = Math.max(0.05 * H, crown.y * H - bh * 0.35); }
          left = Math.max(0.02 * W, Math.min(W * 0.98 - bw, left)); top = Math.max(0.04 * H, Math.min(H * 0.6, top));
          b.style.left = left + 'px'; b.style.top = top + 'px';
          var tx = mouth.x * W - left, ty = mouth.y * H - top - 0.02 * H;
          // đuôi không đâm quá sâu vào mặt: dừng cách miệng một đoạn
          var bx = Math.max(0, Math.min(bw, tx)), by = Math.max(0, Math.min(bh, ty)), dx = tx - bx, dy = ty - by, d = Math.sqrt(dx * dx + dy * dy) || 1, keep = Math.min(d, Math.max(18, d * 0.62));
          tx = bx + dx / d * keep; ty = by + dy / d * keep;
          b.style.setProperty('--ox', (Math.max(0, Math.min(bw, tx)) / bw * 100).toFixed(1) + '%'); b.style.setProperty('--oy', (ty > bh ? 100 : ty < 0 ? 0 : 50) + '%');
          drawBubble(svg, line.bubble, bw, bh, tx, ty);
        },
        word: function (i) { for (var j = 0; j < ws.length; j++) ws[j].classList.toggle('on', j <= i); },
        show: function () { api.layout(); requestAnimationFrame(function () { b.classList.add('on'); }); },
        close: function () { b.classList.remove('on'); setTimeout(function () { b.remove(); }, 200); }
      };
      return api;
    }

    function build(shot, entering) {
      clearBox();
      var sc = scene(shot);
      if (!sc) { box.appendChild(el('div', 'gcp-empty', shot ? 'Phân cảnh "' + shot.title + '" chưa có bối cảnh.' : 'Chưa có phân cảnh.')); return null; }
      plan = direct(shot) || { scene: sc, cast: actors(shot).slice(0, R.budget).map(function (a) { return { id: a.id, key: a.key, name: a.name, home: 'center', color: colorOf(a) }; }), beats: [] };
      shk = el('div', 'gcp-shk'); cam = el('div', 'gcp-cam'); ov = el('div', 'gcp-ov'); flash = el('div', 'gcp-flash');
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
      var mouth = lipSync(id, line, dir), voice = voiceOf(id), b = bubble(line), done = false;
      bub = b;
      act(id, line.state, dir);
      Object.keys(els).forEach(function (k) { els[k].classList.toggle('speaking', k === id); });   // người nói luôn ở lớp trên
      // bước tới / lùi nửa bước theo cảm xúc (ngắn, không chặn lời thoại) — xong câu thì về chỗ
      var home = pos[id] && pos[id].spot, nudged = false;
      if (line.nudge && pos[id]) {
        nudged = true;
        var p0 = pos[id], e = els[id];
        e.style.transitionDuration = '.34s'; place(id, { x: p0.x + line.nudge, y: p0.y, k: p0.k, spot: p0.spot });
        sfx('step', { gain: 0.4, pan: panOf(id) });
        timers.push(setTimeout(function () { e.style.transitionDuration = '0s'; }, 360));
      }
      Object.keys(line.listen).forEach(function (o) { var L = line.listen[o]; act(o, L.state, Object.assign({ view: line.face[o] }, L.motion ? { motion: L.motion } : {})); });
      line.sfx.forEach(function (n, i) { timers.push(setTimeout(function () { if (r === run) sfx(n, { pan: panOf(id) }); }, 120 + i * 260)); });
      if (line.screen === 'flash') { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }
      if (line.screen) { shk.classList.remove('shake'); void shk.offsetWidth; shk.classList.add('shake'); }
      return wait(260, r).then(function () {
        b.show(); sfx('pop', { gain: 0.5, pan: panOf(id) });
        var n = String(line.say).split(/\s+/).filter(Boolean).length;
        var hooks = { onMouth: function (v) { if (r === run && !done) mouth(v); }, onWord: function (i) { if (r === run && !done) b.word(i); } };
        var talk = A ? A.say(line.say, voice, hooks) : fallbackSay(line, n, hooks, r);
        var cap = wait((line.estimate * 2.2 + 3) * 1000, r);   // giọng đọc treo (onend không về) cũng không làm kẹt phim
        return Promise.race([talk, cap]).then(function () { b.word(n); mouth(0); return wait(Math.max(380, (line.hold || 0) * 1000 - line.estimate * 1000), r); });
      }).then(function () {
        done = true; mouth(0); b.close(); bub = null;
        if (nudged && r === run) { var p1 = pos[id]; els[id].style.transitionDuration = '.4s'; place(id, spotAt(home)); timers.push(setTimeout(function () { if (els[id]) els[id].style.transitionDuration = '0s'; }, 420)); }
      }, function (e) { done = true; b.close(); bub = null; throw e; });
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
    function lines(r) {
      var L = plan.beats.filter(function (b) { return b.type === 'line'; }), i = 0, lastCam = 'wide';
      return (function next() {
        if (r !== run) return Promise.reject('stop');
        if (i >= L.length) return Promise.resolve();
        var line = L[i++];
        progress((plan.shotTitle || '') + ' · ' + i + '/' + L.length);
        var go = Promise.resolve();
        if (line.move) { camera('wide'); go = wait(300, r).then(function () { sfx('whoosh', { gain: 0.35, pan: panOf(line.actor) }); return walk(line.actor, line.move.to, line.move.gait, r); }); }
        return go.then(function () {
          camera(line.camera, line.camOn, line.punch);
          if (line.camera !== 'wide' && line.camera !== lastCam) sfx('whoosh', { gain: 0.18 });
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
    function stop() { run++; timers.forEach(clearTimeout); timers = []; if (A) A.stopAll(); bub = null; if (ov) Array.prototype.forEach.call(ov.querySelectorAll('.gcp-bub'), function (b) { b.remove(); }); }
    function playShot(shot, r) {
      if (!build(shot, true)) return Promise.resolve();
      plan.shotTitle = shot.title;
      if (A) { A.ambient(plan.ambient); A.music(plan.mood); }
      return wait(350, r).then(function () { return enterAll(r); }).then(function () { return wait(250, r); }).then(function () { return lines(r); }).then(function () { camera('wide'); return wait(900, r); });
    }
    return {
      show: function (shot) { stop(); return show(shot); },   // show huỷ vòng diễn đang chạy
      stop: function () { stop(); progress('Đã dừng'); },
      destroy: function () { stop(); if (ro) ro.disconnect(); clearBox(); },
      plan: function () { return plan; },
      // diễn chuỗi: thẻ tiêu đề phân cảnh → nhân vật ra sân → lời thoại có dàn dựng; bỏ qua phân cảnh chưa sẵn sàng
      play: function (list, title) {
        stop();
        if (A) A.unlock();   // gọi ngay trong cú bấm của người xem (trình duyệt chỉ cho phát tiếng sau thao tác)
        var r = run, i = 0, ready = (list || []).filter(function (s) { return !issues(s).length; });
        if (!ready.length) { progress('Chưa có phân cảnh nào đủ bối cảnh + diễn viên + lời thoại'); return false; }
        (function next() {
          if (i >= ready.length) {
            progress((title || '') + ' · hết');
            if (A) { A.music(null); A.ambient(null); }
            return card(title || 'Hết', 'hết', r, 2400).then(function () { if (opts.onEnd) opts.onEnd(); }).catch(function () {});
          }
          var shot = ready[i++];
          return (ready.length > 1 ? card(shot.title, 'Phân cảnh ' + i + '/' + ready.length, r) : Promise.resolve())
            .then(function () { return playShot(shot, r); }).then(next)
            .catch(function () {});
        })();
        return true;
      }
    };
  }

  GC.film = { readiness: readiness, issues: issues, still: still, spots: spots, actors: actors, scene: scene, direct: direct, player: player, injectCSS: injectCSS };
})(window.GenChibi);
