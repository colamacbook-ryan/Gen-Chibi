/* gen-chibi engine — player 0.1: trình diễn TÁC PHẨM (phân cảnh → chuỗi phim)
 * © 2026 Gen Labs — All rights reserved.
 *
 * Dùng chung cho Studio (Tạo tác › Tác phẩm) và tệp phim xuất ra (HTML độc lập, không cần cài gì).
 * Cần engine/core.js + engine/render.js. Phần tính toán (spots, actors, readiness, still) không đụng DOM;
 * chỉ player() dựng DOM. Ngân sách L-42: diễn viên sống ≤ GC.render.budget mỗi phân cảnh, hết cảnh là huỷ.
 *
 *   GC.film.readiness(work)      → [{ shot, index, ok, missing: [...] }]   phân cảnh nào diễn được, thiếu gì
 *   GC.film.still(shot)          → chuỗi SVG ảnh tĩnh của phân cảnh (bối cảnh + diễn viên ở chỗ đứng)
 *   GC.film.player(el, opts)     → { show(shot), play(shots, title), stop(), destroy() }
 *                                   opts.onProgress(text), opts.onEnd()
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

  /* ---------------------------------------------------------------- DOM */
  var CSS = [
    '.gcp{position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:6px;background:#f4f1ea;container-type:inline-size;user-select:none}',
    '.gcp>img{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.gcp>img.fg{z-index:3;pointer-events:none}',
    '.gcp-actor{position:absolute;transition:left .5s ease,top .5s ease,opacity .25s}',
    '.gcp-actor .gc-full,.gcp-actor .gc-idle{position:absolute;inset:0;width:100%;height:100%}',
    '.gcp-actor.dim{opacity:.72}',
    '.gcp-actor.speaking{z-index:4!important}',
    '.gcp-bubble{position:absolute;top:0;left:-12%;right:-12%;z-index:5;background:#fff;color:#1c1b1e;border:1px solid #d3cec2;border-radius:9px;',
    'padding:.45em .7em;font:500 max(11px,1.55cqw)/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 18px rgb(0 0 0/.16);text-align:center}',
    '.gcp-bubble b{display:block;font-size:.78em;opacity:.6;font-weight:600;margin-bottom:.1em}',
    '.gcp-title{position:absolute;inset:0;z-index:6;display:grid;place-content:center;text-align:center;gap:.4em;background:#1d1d1f;color:#f4f1ea;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.gcp-title b{font-size:max(18px,3.4cqw);letter-spacing:-.01em}',
    '.gcp-title span{font-size:max(11px,1.3cqw);opacity:.7;letter-spacing:.1em;text-transform:uppercase}',
    '.gcp-empty{position:absolute;inset:0;display:grid;place-items:center;color:#8e897f;font:13px system-ui,sans-serif;padding:16px;text-align:center}',
    '@media (prefers-reduced-motion:reduce){.gcp-actor{transition:none}}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('gcp-css')) return;
    var s = document.createElement('style'); s.id = 'gcp-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function img(cls, svg, alt) { var e = el('img', cls); e.alt = alt || ''; e.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); return e; }

  function player(box, opts) {
    opts = opts || {};
    GC.render.injectCSS(); injectCSS();
    var R = GC.render, insts = {}, els = {}, names = {}, run = 0, at = {}, timers = [];
    var progress = function (t) { if (opts.onProgress) opts.onProgress(t); };
    function clearBox() {
      Object.keys(insts).forEach(function (k) { insts[k].destroy(); });
      insts = {}; els = {}; names = {};
      while (box.firstChild) box.removeChild(box.firstChild);
      box.className = 'gcp';
    }
    function place(e, spot) {
      var sp = GC.SCENE.spots[spot] || GC.SCENE.spots.center, k = sp.k, B = GC.RIG.box;
      e.style.left = ((sp.x - (100 - B[0]) * k) / GC.SCENE.W * 100) + '%';
      e.style.top = ((sp.y - (228 - B[1]) * k) / GC.SCENE.H * 100) + '%';
      e.style.width = (B[2] * k / GC.SCENE.W * 100) + '%';
      e.style.height = (B[3] * k / GC.SCENE.H * 100) + '%';
      e.style.zIndex = /^back/.test(spot) ? 1 : 2;
    }
    // hai người trở lên: ai đứng bên nào thì quay 45° vào giữa (nói chuyện với nhau)
    function face(id) { var sp = GC.SCENE.spots[at[id]]; return sp && sp.face && Object.keys(insts).length > 1 ? { view: sp.face > 0 ? 'right45' : 'left45' } : null; }
    function show(shot) {
      clearBox();
      var sc = scene(shot);
      if (!sc) { box.appendChild(el('div', 'gcp-empty', shot ? 'Phân cảnh "' + shot.title + '" chưa có bối cảnh.' : 'Chưa có phân cảnh.')); return false; }
      var list = actors(shot).slice(0, R.budget);
      at = spots(shot, sc, list.map(function (a) { return a.id; }));
      box.appendChild(img('bg', GC.sceneSvg(sc, { part: 'back' }), sc.name));
      list.forEach(function (a) {
        var st = el('div', 'gcp-stage'), e = el('div', 'gcp-actor'); e.title = a.name; e.appendChild(st);
        place(e, at[a.id]); box.appendChild(e);
        els[a.id] = e; names[a.id] = a.name; insts[a.id] = R.full(st, a, 'normal');
      });
      Object.keys(insts).forEach(function (k) { var d = face(k); if (d) insts[k].setState('normal', d); });
      box.appendChild(img('fg', GC.sceneSvg(sc, { part: 'front' })));
      return true;
    }
    function bubbles() { Object.keys(els).forEach(function (k) { var b = els[k].querySelector('.gcp-bubble'); if (b) b.remove(); els[k].classList.remove('speaking', 'dim'); }); }
    function wait(ms, r) { return new Promise(function (ok, no) { timers.push(setTimeout(function () { if (r === run) ok(); else no('stop'); }, ms)); }); }
    function steps(shot, r) {
      var ev = shot.event, i = 0;
      return (function next() {
        if (r !== run) return Promise.reject('stop');
        bubbles();
        if (!ev || i >= ev.steps.length) return Promise.resolve();
        var s = ev.steps[i++];
        progress(shot.title + ' · ' + i + '/' + ev.steps.length);
        if (!els[s.actor]) return next();
        Object.keys(els).forEach(function (k) { if (k !== s.actor) els[k].classList.add('dim'); });
        els[s.actor].classList.add('speaking');
        if (s.spot && s.spot !== at[s.actor]) { at[s.actor] = s.spot; place(els[s.actor], s.spot); }
        var dir = face(s.actor) || {};
        ['motion', 'fx', 'activity', 'posture', 'move', 'facing', 'view'].forEach(function (k) { if (s[k]) dir[k] = s[k]; });
        insts[s.actor].setState(s.state, Object.keys(dir).length ? dir : undefined);
        var b = el('div', 'gcp-bubble'); b.appendChild(el('b', null, names[s.actor])); b.appendChild(document.createTextNode(s.say));
        els[s.actor].appendChild(b);
        return wait(s.hold ? s.hold * 1000 : Math.min(4200, Math.max(1800, s.say.length * 65)), r).then(next);
      })();
    }
    function card(text, sub, r, ms) {
      clearBox();
      var c = el('div', 'gcp-title'); c.appendChild(el('b', null, text)); if (sub) c.appendChild(el('span', null, sub));
      box.appendChild(c);
      return wait(ms || 1400, r);
    }
    function stop() { run++; timers.forEach(clearTimeout); timers = []; bubbles(); }
    return {
      show: function (shot) { stop(); return show(shot); },   // show huỷ vòng diễn đang chạy
      stop: function () { stop(); progress('Đã dừng'); },
      destroy: function () { stop(); clearBox(); },
      // diễn chuỗi: thẻ tiêu đề phân cảnh → bối cảnh + diễn viên → lời thoại; bỏ qua phân cảnh chưa sẵn sàng
      play: function (list, title) {
        stop();
        var r = run, i = 0, ready = (list || []).filter(function (s) { return !issues(s).length; });
        if (!ready.length) { progress('Chưa có phân cảnh nào đủ bối cảnh + diễn viên + lời thoại'); return false; }
        (function next() {
          if (i >= ready.length) {
            progress((title || '') + ' · hết');
            return card(title || 'Hết', 'hết', r, 2200).then(function () { if (opts.onEnd) opts.onEnd(); }).catch(function () {});
          }
          var shot = ready[i++];
          return (ready.length > 1 ? card(shot.title, 'Phân cảnh ' + i + '/' + ready.length, r) : Promise.resolve())
            .then(function () { show(shot); return wait(500, r); }).then(function () { return steps(shot, r); }).then(function () { return wait(600, r); }).then(next)
            .catch(function () {});
        })();
        return true;
      }
    };
  }

  GC.film = { readiness: readiness, issues: issues, still: still, spots: spots, actors: actors, scene: scene, player: player, injectCSS: injectCSS };
})(window.GenChibi);
