/* gen-chibi Studio — dock "Trợ lý AI" ở cột phải, có mặt ở MỌI khu (STD-08 §0 + "Ghim & Soi")
 * © 2026 Gen Labs — All rights reserved.
 *   - MỘT trợ lý, đổi vai theo khu (Xưởng · Bộ khung · Thư viện · Tạo tác): server chọn chỉ dẫn + bộ tool theo `context`.
 *   - GHIM (owner → AI): phần tử có `data-anchor` (ID thật) gắn vào tin nhắn bằng @ hoặc chế độ chỉ Alt+P; gửi snapshot cắt theo ngân sách.
 *   - SOI (AI → owner): anchor trong trả lời ⟦anchor|nhãn⟧ thành nút; rê = tô sáng (phần còn lại mờ), bấm = đi tới + tô sáng 2 s; phần tử mất → "không còn".
 *   - Luồng hội thoại do SERVER giữ theo đối tượng (tác phẩm / asset / dự án / khu): data/chats/<loại>-<id>.json.
 * Nạp TRƯỚC app.js; app.js gọi GCDock.attach(cầu nối) lúc khởi động. Không innerHTML với dữ liệu người dùng. */
(function () {
  'use strict';
  var GC = window.GenChibi, B = null;
  var _t = GC.i18n.t, _pt = GC.i18n.pt, _l = GC.i18n.label, N_ = GC.i18n.N;   // ngôn ngữ (ADR 0007): _t câu giao diện · _l nhãn dữ liệu (nhãn khu do server gửi, tên phần tử)
  // nhãn / vai / lời giới thiệu của từng khu do SERVER giữ (mcp.js ZONES, qua GET /api/ai › zones) — dock không chép lại; chưa có (bản xem thử không server) thì hiện id khu
  var KIND_LABEL = { asset: N_('Nhân vật'), item: N_('Vật phẩm'), scene: N_('Bối cảnh'), action: N_('Hành động'), work: N_('Tác phẩm'), shot: N_('Phân cảnh'), step: N_('Bước'), project: N_('Dự án'), panel: N_('Khu vực'), zone: N_('Khu') };
  var ANCHOR_RE = /^(asset|item|scene|action|work|shot|step|project|panel|zone):[A-Za-z0-9][A-Za-z0-9._~\/-]{0,160}$/;
  var CHIP_RE = /⟦([^|⟧]{1,200})(?:\|([^⟧]{0,100}))?⟧/g;
  var BUDGET = 4000, MAX_PINS = 8;   // ngân sách snapshot (ký tự ≈ 1/3 token tiếng Việt) và số ghim tối đa một tin
  var W_MIN = 300, W_MAX = 720, W_DEF = 380;
  var NARROW = window.matchMedia ? window.matchMedia('(max-width: 1099.98px)') : { matches: false };
  var REDUCED = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var h, add, clear, toast;
  var S = { info: null, obj: null, tab: '', shot: '', ctxOn: true, pins: [], msgs: [], key: '', busy: false, cfg: null, zones: null, sent: null, sentKey: '', pick: false, loadTok: 0, open: false, w: W_DEF };
  var E = {};   // phần tử giao diện
  var ready = false, pend = [];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function plain(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function cut(t, n) { var a = Array.from(String(t == null ? '' : t)); return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); }
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }
  function zoneOf(id) { return (S.zones && S.zones[id]) || null; }
  // nhãn LOẠI một phần tử (số ít: "Character", không phải tên mục menu "Characters") — ngữ cảnh 'số ít' (engine/i18n.js pt)
  function kindLabel(k) {
    switch (k) {
      case 'asset': return _pt('số ít', 'Nhân vật');
      case 'item': return _pt('số ít', 'Vật phẩm');
      case 'scene': return _pt('số ít', 'Bối cảnh');
      case 'work': return _pt('số ít', 'Tác phẩm');
      case 'shot': return _pt('số ít', 'Phân cảnh');
      default: return KIND_LABEL[k] ? _t(KIND_LABEL[k]) : k;
    }
  }
  function zoneLabel(id) { var z = zoneOf(id); return z ? _l(z.label) : id; }   // nhãn khu do server gửi (đã theo X-GC-Lang); _l phòng server cũ
  function esc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  /* ============================================================ trạng thái nhớ theo máy */
  function loadPref() {
    try { var p = JSON.parse(localStorage.getItem('gc-dock') || '{}') || {}; return { open: p.open !== false, w: clamp(+p.w || W_DEF, W_MIN, W_MAX) }; }
    catch (e) { return { open: true, w: W_DEF }; }
  }
  function savePref() { try { localStorage.setItem('gc-dock', JSON.stringify({ open: S.openWide !== false, w: S.w })); } catch (e) { /* bỏ qua */ } }   // open: trạng thái ở màn rộng (màn hẹp luôn bắt đầu đóng)

  /* ============================================================ ANCHOR: địa chỉ ổn định theo ID thật */
  var Works = {   // tác phẩm đã tải (để kiểm "còn / không còn" và dựng snapshot) — app.js báo khi sửa
    map: {}, at: {},
    put: function (w) { if (w && w.id) { this.map[w.id] = w; this.at[w.id] = Date.now(); } },
    peek: function (id) { return this.map[id] || null; },
    get: function (id, fresh) {
      var self = this;
      if (!fresh && this.map[id] && Date.now() - this.at[id] < 4000) return Promise.resolve(this.map[id]);
      if (B.Store.mode !== 'server') return Promise.resolve(null);
      return B.Store.api('GET', 'api/works/' + encodeURIComponent(id)).then(function (w) { self.put(w); return w; }, function () { delete self.map[id]; return null; });
    }
  };
  var Anchors = {
    parse: function (a) { var i = String(a).indexOf(':'); return { kind: a.slice(0, i), id: a.slice(i + 1) }; },
    valid: function (a) { return typeof a === 'string' && ANCHOR_RE.test(a); },
    // phần tử ĐANG HIỆN mang anchor này (tab ẩn / trang khác không tính)
    find: function (a) {
      var list = document.querySelectorAll('[data-anchor="' + esc(a) + '"]');
      for (var i = 0; i < list.length; i++) { var r = list[i].getBoundingClientRect(); if (r.width > 0 && r.height > 0 && !list[i].closest('#dock')) return list[i]; }
      return null;
    },
    labelOf: function (a) {
      var p = this.parse(a), el = this.find(a), w, s, n;
      if (el && el.getAttribute('data-anchor-label')) return el.getAttribute('data-anchor-label');
      try {
        if (p.kind === 'asset') { var x = GC.ASSETS[GC.canon(p.id)]; if (x) return x.name; }
        else if (p.kind === 'item') { var it = GC.getItem(p.id); if (it) return it.name; }
        else if (p.kind === 'scene') { var sc = GC.getScene(p.id); if (sc) return sc.name; }
        else if (p.kind === 'action') { var ac = GC.choreo && GC.choreo.ACTIONS[p.id]; if (ac) return ac.label; }
        else if (p.kind === 'project') return B.Projects.name(p.id);
        else if (p.kind === 'zone') return _t('Mở {zoneLabel}', { zoneLabel: zoneLabel(p.id) });
        else if (p.kind === 'work') { w = Works.peek(p.id); if (w) return w.title; }
        else if (p.kind === 'shot' || p.kind === 'step') {
          var q = p.id.split('/'); w = Works.peek(q[0]); s = w && (w.shots || []).filter(function (z) { return z.id === q[1]; })[0];
          if (s) return (p.kind === 'step' ? _t('Bước {x} · ', { x: q[2] }) : '') + s.title;
          return (p.kind === 'step' ? _t('Bước {x} · ', { x: q[2] }) : '') + q[1];
        }
      } catch (e) { /* dùng id */ }
      n = p.id.split('/'); return n[n.length - 1];
    },
    // còn tồn tại không? → true / false (hoặc Promise khi phải hỏi server)
    exists: function (a) {
      var p = this.parse(a), q;
      try {
        if (p.kind === 'asset') return !!GC.ASSETS[GC.canon(p.id)];
        if (p.kind === 'item') return !!GC.getItem(p.id);
        if (p.kind === 'scene') return !!GC.getScene(p.id);
        if (p.kind === 'action') return !!(GC.choreo && GC.choreo.ACTIONS[p.id]);
        if (p.kind === 'project') return B.Projects.all().some(function (x) { return x.id === p.id; });
        if (p.kind === 'panel') return !!this.find(a);
        if (p.kind === 'zone') return !!B.zoneHome(p.id);
        q = p.id.split('/');
        return Works.get(q[0]).then(function (w) {
          if (!w) return false;
          if (p.kind === 'work') return true;
          var s = (w.shots || []).filter(function (z) { return z.id === q[1]; })[0];
          if (!s) return false;
          return p.kind === 'shot' ? true : !!(s.event && s.event.steps && s.event.steps[+q[2] - 1]);
        });
      } catch (e) { return false; }
    },
    // đường tới phần tử: trang của khu đang mở (Xưởng → hồ sơ / bàn chỉnh; Thư viện → thẻ)
    route: function (a) {
      var p = this.parse(a), fab = B.zoneNow() === 'fab', q;
      if (p.kind === 'asset') return /^gen\.khung\//.test(p.id) || fab ? { page: 'character', key: p.id, tab: 'look' } : { page: 'lib-characters', key: p.id };
      if (p.kind === 'item') return fab ? { page: 'items', key: p.id } : { page: 'lib-items', key: p.id };
      if (p.kind === 'scene') return fab ? { page: 'scenes', key: p.id } : { page: 'lib-scenes', key: p.id };
      if (p.kind === 'action') return { page: 'lib-motions', action: p.id };
      if (p.kind === 'project') return { page: 'projects', project: p.id };
      if (p.kind === 'panel') return null;
      if (p.kind === 'zone') return B.zoneHome(p.id);   // chip "Mở Xưởng": về trang chủ của khu đó (khác khu → mở ứng dụng của khu)
      q = p.id.split('/');
      if (p.kind === 'work') return { page: 'works', work: q[0], tab: 'shots' };
      return { page: 'works', work: q[0], tab: 'shots', shot: q[1], step: p.kind === 'step' ? +q[2] : undefined };
    },
    // snapshot gọn của một phần tử cho AI (chỉ phần cần, không cả màn hình) — Promise<string>
    snapshot: function (a, max) {
      var p = this.parse(a), o;
      function pack(x) { var s = JSON.stringify(x); return Promise.resolve(cut(s, max)); }
      try {
        if (p.kind === 'asset') {
          var x = GC.ASSETS[GC.canon(p.id)]; if (!x) return Promise.resolve('');
          o = { key: x.key, name: x.name, role: x.role, faction: x.faction, status: x.status, project: x.project, persona: cut(x.persona || '', 160), equip: x.look && x.look.equip, voice: x.voice && x.voice.role };
          return pack(o);
        }
        if (p.kind === 'item') { var it = GC.getItem(p.id); return it ? pack({ key: it.key, name: it.name, type: it.type, rarity: it.rarity, slot: it.equip && it.equip.slot, status: it.status, project: it.project }) : Promise.resolve(''); }
        if (p.kind === 'scene') { var sc = GC.getScene(p.id); return sc ? pack({ key: sc.key, name: sc.name, time: sc.time, weather: sc.weather, spots: sc.spots && sc.spots.length, project: sc.project, status: sc.status }) : Promise.resolve(''); }
        if (p.kind === 'action') { var ac = GC.choreo && GC.choreo.ACTIONS[p.id]; return ac ? pack({ id: p.id, label: ac.label, attack: !!ac.attack, ranged: !!ac.ranged, needs: ac.needs }) : Promise.resolve(''); }
        if (p.kind === 'project') {
          var pj = B.Projects.all().filter(function (z) { return z.id === p.id; })[0];
          return pack({ id: p.id, name: pj && pj.name, description: pj && pj.description, nhanVat: B.inProject(GC.assets(), p.id).length, vatPham: B.inProject(GC.items(), p.id).length, boiCanh: B.inProject(GC.scenes(), p.id).length });
        }
        if (p.kind === 'panel') { var el = this.find(a); return Promise.resolve(el ? cut(plain(el.textContent), max) : ''); }
        if (p.kind === 'zone') return Promise.resolve('');
        var q = p.id.split('/');
        return Works.get(q[0], true).then(function (w) {
          if (!w) return '';
          if (p.kind === 'work') return cut(JSON.stringify({ id: w.id, title: w.title, project: w.project, logline: w.logline, script: cut(w.script || '', 300), lang: w.lang, shots: (w.shots || []).map(function (s) { return s.id + ': ' + s.title; }) }), max);
          var s = (w.shots || []).filter(function (z) { return z.id === q[1]; })[0];
          if (!s) return '';
          var steps = (s.event && s.event.steps) || [];
          if (p.kind === 'step') return cut(JSON.stringify(steps[+q[2] - 1] || null), max);
          var rv = w.review && w.review.shots && w.review.shots[s.id];
          return cut(JSON.stringify({ id: s.id, title: s.title, description: s.description, scene: s.scene, cast: s.cast, buoc: steps.length, loiThoai: steps.slice(0, 6).map(function (t) { return t.actor + ': ' + (t.say || t.action || ''); }), duyet: rv ? { status: rv.status, notes: (rv.notes || []).map(function (n) { return (n.step ? _t('bước {step}: ', { step: n.step }) : '') + n.text; }) } : undefined }), max);
        });
      } catch (e) { return Promise.resolve(''); }
    },
    // ứng viên cho picker @ : phần tử đang hiện (có data-anchor) + dữ liệu của khu
    candidates: function () {
      var out = [], seen = {};
      function put(a, label, sub, rank) { if (!seen[a] && Anchors.valid(a)) { seen[a] = 1; out.push({ anchor: a, label: label || Anchors.labelOf(a), sub: sub || kindLabel(Anchors.parse(a).kind), rank: rank || 2 }); } }
      Array.prototype.forEach.call(document.querySelectorAll('[data-anchor]'), function (el) {
        var a = el.getAttribute('data-anchor');
        if (!el.closest('#dock') && Anchors.valid(a)) { var r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) put(a, el.getAttribute('data-anchor-label'), _t('đang hiện · {kind}', { kind: kindLabel(Anchors.parse(a).kind) }), 1); }
      });
      try {
        GC.assets().forEach(function (x) { if (!/^gen\.khung\//.test(x.key) || B.zoneNow() === 'fab') put('asset:' + x.key, x.name, _t('Nhân vật · {key}', { key: x.key })); });
        GC.items().forEach(function (x) { if (x.pack === B.MY_PACK || B.zoneNow() === 'fab') put('item:' + x.key, x.name, _t('Vật phẩm · {key}', { key: x.key })); });
        GC.scenes().forEach(function (x) { if (x.pack === B.MY_PACK || B.zoneNow() === 'fab') put('scene:' + x.key, x.name, _t('Bối cảnh · {key}', { key: x.key })); });
        B.Projects.all().forEach(function (x) { put('project:' + x.id, x.name, _t('Dự án · {id}', { id: x.id })); });
        Object.keys(Works.map).forEach(function (id) {
          var w = Works.map[id]; put('work:' + id, w.title, _t('Tác phẩm · {id}', { id: id }));
          (w.shots || []).forEach(function (s, i) { put('shot:' + id + '/' + s.id, _t('Cảnh {n} · {title}', { n: i + 1, title: s.title }), _t('Phân cảnh · {title}', { title: w.title })); });
        });
      } catch (e) { /* thiếu nguồn nào bỏ nguồn đó */ }
      return out;
    }
  };
  // khớp mờ (fuzzy): bỏ dấu, khớp theo thứ tự ký tự; điểm cao = khớp liền + khớp đầu từ
  function fuzzy(q, text) {
    q = norm(q); text = norm(text);
    if (!q) return 1;
    var i = 0, score = 0, last = -2;
    for (var j = 0; j < text.length && i < q.length; j++) {
      if (text[j] === q[i]) { score += 1 + (last === j - 1 ? 2 : 0) + (j === 0 || /[\s\/._-]/.test(text[j - 1]) ? 3 : 0); last = j; i++; }
    }
    return i === q.length ? score : 0;
  }

  /* ============================================================ SOI: tô sáng + điều hướng */
  var Spot = {
    ring: null, tag: null, el: null, timer: 0, raf: 0,
    init: function () {
      this.ring = h('div', { class: 'spot-ring', hidden: true, 'aria-hidden': 'true' }, this.tag = h('span', { class: 'spot-tag' }));
      document.body.appendChild(this.ring);
    },
    place: function () {
      if (!this.el || !document.contains(this.el)) { this.hide(); return; }
      var r = this.el.getBoundingClientRect(), p = 3;
      this.ring.style.cssText = 'left:' + (r.left - p) + 'px;top:' + (r.top - p) + 'px;width:' + (r.width + 2 * p) + 'px;height:' + (r.height + 2 * p) + 'px';
      this.tag.classList.toggle('below', r.top < 30);
    },
    show: function (a, label) {
      var el = Anchors.find(a);
      if (!el) return false;
      this.el = el; this.tag.textContent = label || Anchors.labelOf(a);
      this.ring.hidden = false; this.place();
      var self = this; cancelAnimationFrame(this.raf);
      (function loop() { if (self.ring.hidden) return; self.place(); self.raf = requestAnimationFrame(loop); })();   // bám theo khi cuộn / bố cục đổi
      return true;
    },
    hide: function () { clearTimeout(this.timer); cancelAnimationFrame(this.raf); this.el = null; if (this.ring) this.ring.hidden = true; },
    // đi tới + tô sáng 2 giây (cuộn tới giữa màn hình; giảm chuyển động thì cuộn tức thì)
    flash: function (a, ms) {
      var el = Anchors.find(a), self = this;
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: REDUCED.matches ? 'auto' : 'smooth' });
      this.show(a); clearTimeout(this.timer);
      this.timer = setTimeout(function () { self.hide(); }, ms || 2000);
      return true;
    }
  };
  // đi tới anchor: điều hướng (nếu cần) rồi tô sáng 2 giây. Khác ứng dụng → trang tải lại: nhớ anchor qua sessionStorage
  function goAnchor(a) {
    if (Spot.flash(a)) return;   // đang hiện sẵn ở đây: tô sáng luôn
    var r = Anchors.route(a);
    if (!r) { toast(_t('Phần tử này không còn trên màn hình.')); return; }
    var z = B.zoneOfPage(r.page), cross = z !== 'sys' && z !== 'home' && (!B.APP() || z !== B.APP().zone);
    if (cross) { if (Anchors.parse(a).kind !== 'zone') { try { sessionStorage.setItem('gc-spot', a); } catch (e) { /* bỏ qua */ } } B.go(r); return; }
    B.go(r);
    if (Anchors.parse(a).kind !== 'zone') waitFor(a, 2500, function () { Spot.flash(a); });   // chip chuyển khu không có phần tử để tô sáng
  }
  function waitFor(a, ms, fn) {
    var t0 = Date.now();
    (function tick() { if (Anchors.find(a)) fn(); else if (Date.now() - t0 < ms) setTimeout(tick, 60); })();
  }

  /* ============================================================ chip anchor (Soi trong trả lời; Ghim trong ô soạn) */
  function chipEl(anchor, label, opt) {
    opt = opt || {};
    var p = Anchors.parse(anchor), name = label || Anchors.labelOf(anchor);
    var b = h('button', { type: 'button', class: 'achip' + (opt.pin ? ' pin' : ''), 'data-chip': anchor, 'aria-label': _t('Chỉ tới {kind} {name}', { kind: kindLabel(p.kind).toLowerCase(), name: name }),
      onmouseenter: function () { if (!b.disabled) Spot.show(anchor, name); }, onmouseleave: function () { Spot.hide(); },
      onfocus: function () { if (!b.disabled) Spot.show(anchor, name); }, onblur: function () { Spot.hide(); },
      onclick: function () { if (!b.disabled) goAnchor(anchor); } },
      h('span', { class: 'gl', 'aria-hidden': 'true', text: '⌖' }), h('span', { class: 'tx', text: name }));
    function mark(ok) {
      b.disabled = !ok; b.classList.toggle('gone', !ok);
      b.setAttribute('aria-label', ok ? _t('Chỉ tới {kind} {name}', { kind: kindLabel(p.kind).toLowerCase(), name: name }) : _t('{name} — không còn', { name: name }));
      b.title = ok ? kindLabel(p.kind) + ' · ' + p.id : _t('Phần tử này không còn nữa (đã xoá hoặc đổi id)');
      b.lastChild.textContent = ok ? name : _t('{name} · không còn', { name: name });
    }
    b.title = kindLabel(p.kind) + ' · ' + p.id;
    var ex = Anchors.exists(anchor);
    if (ex && typeof ex.then === 'function') ex.then(mark, function () { /* không kiểm được: giữ nguyên, bấm sẽ báo */ }); else mark(ex);
    return b;
  }
  // văn bản + ⟦anchor|nhãn⟧ → nút bấm; chỉ anchor đúng dạng mới thành nút, còn lại giữ nguyên chữ
  function richText(text, into) {
    var last = 0, m;
    CHIP_RE.lastIndex = 0;
    while ((m = CHIP_RE.exec(text))) {
      if (m.index > last) into.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = m[1].trim();
      if (Anchors.valid(a)) into.appendChild(chipEl(a, plain(m[2])));
      else into.appendChild(document.createTextNode(m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
    return into;
  }

  /* ============================================================ chế độ chỉ (Alt+P) */
  var Pick = {
    ring: null, tag: null, banner: null, cur: null,
    init: function () {
      this.ring = h('div', { class: 'pick-ring', hidden: true, 'aria-hidden': 'true' }, this.tag = h('span', { class: 'spot-tag' }));
      this.banner = h('div', { class: 'pick-banner', hidden: true, role: 'status' });   // chữ: relabel()
      document.body.appendChild(this.ring); document.body.appendChild(this.banner);
      var self = this;
      document.addEventListener('mousemove', function (ev) { if (S.pick) self.hover(ev); }, true);
      document.addEventListener('click', function (ev) { if (S.pick) self.click(ev); }, true);
      document.addEventListener('mousedown', function (ev) { if (S.pick && !ev.target.closest('#dock')) ev.preventDefault(); }, true);
      document.addEventListener('scroll', function () { if (S.pick) self.place(); }, true);
    },
    target: function (ev) { var t = ev.target && ev.target.closest ? ev.target.closest('[data-anchor]') : null; return t && !t.closest('#dock') && Anchors.valid(t.getAttribute('data-anchor')) ? t : null; },
    hover: function (ev) { this.cur = ev.target.closest && ev.target.closest('#dock') ? null : this.target(ev); this.place(); },
    place: function () {
      if (!this.cur || !document.contains(this.cur)) { this.ring.hidden = true; return; }
      var r = this.cur.getBoundingClientRect(), a = this.cur.getAttribute('data-anchor');
      this.ring.style.cssText = 'left:' + (r.left - 2) + 'px;top:' + (r.top - 2) + 'px;width:' + (r.width + 4) + 'px;height:' + (r.height + 4) + 'px';
      this.tag.textContent = kindLabel(Anchors.parse(a).kind) + ' · ' + (this.cur.getAttribute('data-anchor-label') || a);
      this.tag.classList.toggle('below', r.top < 30);
      this.ring.hidden = false;
    },
    click: function (ev) {
      if (ev.target.closest && ev.target.closest('#dock')) return;
      var t = this.target(ev);
      ev.preventDefault(); ev.stopPropagation();
      if (!t) return;
      addPin(t.getAttribute('data-anchor'), t.getAttribute('data-anchor-label'));
      if (!ev.shiftKey) setPick(false);
    }
  };
  function setPick(on) {
    S.pick = !!on && ready;
    document.body.classList.toggle('dock-pick', S.pick);
    Pick.banner.hidden = !S.pick;
    if (!S.pick) { Pick.cur = null; Pick.ring.hidden = true; }
    if (E.pickB) E.pickB.setAttribute('aria-pressed', String(S.pick));
    if (S.pick && !S.open) setOpen(true);
  }

  /* ============================================================ ghim (chip trong ô soạn) */
  function addPin(anchor, label) {
    if (!Anchors.valid(anchor)) return false;
    if (S.pins.some(function (p) { return p.anchor === anchor; })) { toast(_t('Đã ghim rồi.')); return false; }
    if (S.pins.length >= MAX_PINS) { toast(_t('Ghim tối đa {MAX_PINS} phần tử một tin.', { MAX_PINS: MAX_PINS })); return false; }
    var pin = { anchor: anchor, label: plain(label) || Anchors.labelOf(anchor), snap: '' };
    S.pins.push(pin);
    if (!S.open) setOpen(true);
    paintPins();
    Anchors.snapshot(anchor, 1200).then(function (t) { pin.snap = t; tokens(); });
    return true;
  }
  function paintPins() {
    clear(E.pins);
    S.pins.forEach(function (p, i) {
      var c = chipEl(p.anchor, p.label, { pin: true });
      E.pins.appendChild(h('span', { class: 'pinwrap' }, c, h('button', { type: 'button', class: 'pinx', 'aria-label': _t('Bỏ ghim {label}', { label: p.label }), onclick: function () { S.pins.splice(i, 1); paintPins(); E.ta.focus(); } }, '×')));
    });
    E.pins.hidden = !S.pins.length;
    tokens();
  }
  // ước tính token của VÒNG ĐẦU của tin sắp gửi (CNS-119): chữ gõ + snapshot các ghim + CHỈ DẪN TĨNH của khu + tin dữ liệu giao diện (số đo của lượt trước nếu có, không thì ~400 ký tự)
  // + lịch sử luồng (tối đa 19 tin gần nhất, như server) ~ 3 ký tự / token. Số THẬT (vào / ra, cộng mọi vòng tool) hiện dưới mỗi câu trả lời
  function baseChars() {
    var z = zoneOf(S.info && S.info.zone), sys = z ? z.systemChars : 0, ctxc = S.sent && S.sentKey === S.key ? S.sent.context : 400, hist = 0, n = 0, i;
    for (i = S.msgs.length - 1; i >= 0 && n < 19; i--, n++) if (!S.msgs[i].err) hist += Math.min(4000, (S.msgs[i].content || '').length);
    return { sys: sys, ctx: ctxc, hist: Math.min(hist, 16000) };
  }
  function tokens() {
    var n = S.pins.length, per = n ? Math.max(300, Math.min(1200, Math.floor(BUDGET / n))) : 0, typed = E.ta.value.length + 80, pins = 0, b = baseChars();
    S.pins.forEach(function (p) { pins += Math.min(p.snap.length, per) + p.label.length + p.anchor.length; });
    E.tok.textContent = _t('~{n} token', { n: Math.ceil((typed + pins + b.sys + b.ctx + b.hist) / 3) });
    E.tok.title = _t('Ước tính token vòng đầu của tin này: chữ bạn gõ ~{ceil} + {n} phần tử ghim ~{ceil2} + chỉ dẫn của khu ~{ceil3} + dữ liệu giao diện ~{ceil4} + lịch sử ~{ceil5}. Mỗi lần AI gọi tool là một vòng nữa; số thật hiện dưới câu trả lời.', { ceil: Math.ceil(typed / 3), n: n, ceil2: Math.ceil(pins / 3), ceil3: Math.ceil(b.sys / 3), ceil4: Math.ceil(b.ctx / 3), ceil5: Math.ceil(b.hist / 3) });
  }

  /* ============================================================ picker @ (khớp mờ) */
  var Mention = { at: -1, list: [], idx: 0 };
  function mentionClose() { Mention.at = -1; E.pop.hidden = true; E.ta.removeAttribute('aria-activedescendant'); E.ta.setAttribute('aria-expanded', 'false'); }
  function mentionUpdate() {
    var pos = E.ta.selectionStart, m = /(^|\s)@([^\s@]{0,30})$/.exec(E.ta.value.slice(0, pos));
    if (!m) { mentionClose(); return; }
    var q = m[2];
    Mention.at = pos - q.length - 1;
    var all = Anchors.candidates(), scored = [];
    all.forEach(function (c) { var s = fuzzy(q, c.label + ' ' + c.anchor); if (s) scored.push({ c: c, s: s - c.rank * 0.5 }); });
    scored.sort(function (a, b) { return b.s - a.s; });
    Mention.list = scored.slice(0, 8).map(function (x) { return x.c; });
    Mention.idx = 0;
    mentionPaint();
  }
  function mentionPaint() {
    clear(E.pop);
    if (!Mention.list.length) { E.pop.appendChild(h('div', { class: 'pop-empty', text: _t('Không thấy phần tử nào khớp') })); E.pop.hidden = false; return; }
    Mention.list.forEach(function (c, i) {
      var id = 'dockopt' + i;
      E.pop.appendChild(h('div', { id: id, role: 'option', class: 'pop-opt', 'aria-selected': String(i === Mention.idx), onmousedown: function (ev) { ev.preventDefault(); mentionPick(i); } },
        h('b', { text: c.label }), h('span', { class: 'note', text: c.sub })));
    });
    E.pop.hidden = false; E.ta.setAttribute('aria-expanded', 'true'); E.ta.setAttribute('aria-activedescendant', 'dockopt' + Mention.idx);
  }
  function mentionPick(i) {
    var c = Mention.list[i];
    if (!c) return;
    var v = E.ta.value, pos = E.ta.selectionStart;
    E.ta.value = v.slice(0, Mention.at) + v.slice(pos);
    E.ta.setSelectionRange(Mention.at, Mention.at);
    mentionClose(); addPin(c.anchor, c.label); autosize(); E.ta.focus();
  }

  /* ============================================================ luồng chat */
  function objKey() {
    var o = S.obj;
    if (S.ctxOn && o && o.id) return { kind: o.kind, id: String(o.id).toLowerCase().replace('/', '~') };
    return { kind: 'khu', id: S.info ? S.info.zone : 'xuong' };
  }
  function ctxPayload() {
    var i = S.info || { zone: 'xuong', page: '' }, c = { zone: i.zone, lang: GC.i18n.lang() };   // lang: AI trả lời đúng ngôn ngữ người dùng (server đọc)
    if (S.ctxOn) {
      c.page = i.page;
      if (S.obj && S.obj.id) c.object = { kind: S.obj.kind, id: S.obj.id };
      if (S.tab) c.tab = S.tab;
      if (S.shot) c.shot = S.shot;
    }
    return c;
  }
  function loadThread() {
    var k = objKey(), id = k.kind + '/' + k.id;
    if (id === S.key) return;
    S.key = id; var tok = ++S.loadTok;
    S.msgs = []; paintLog();
    if (B.Store.mode !== 'server') return;
    B.Store.api('GET', 'api/chats/' + encodeURIComponent(k.kind) + '/' + encodeURIComponent(k.id)).then(function (c) {
      if (tok !== S.loadTok) return;   // đã đổi đối tượng trong lúc chờ
      S.msgs = (c.messages || []).map(function (m) { return { role: m.role, content: m.content, log: m.log, anchors: m.anchors, pins: m.pins, usage: m.usage, at: m.at }; });
      tokens();
      paintLog();
    }, function () { /* chưa có luồng */ });
  }
  function ctxPath() {
    var i = S.info; if (!i) return '';
    var parts = [zoneLabel(i.zone)];
    parts.push(S.tabLabel || i.pageLabel);
    if (S.obj && S.obj.label) parts.push(S.obj.label + (S.shotLabel ? ' · ' + S.shotLabel : ''));   // Studio gửi nhãn ĐÃ theo ngôn ngữ (_lo: chỉ dịch đồ Gen Labs) — dịch lại ở đây thì tên người dùng "Nam" thành "Male" (CNS-158)
    return parts.filter(Boolean);
  }
  function paintCtx() {
    if (!ready) return;
    var i = S.info;
    clear(E.ctx);
    if (!i) return;
    E.role.textContent = _l((zoneOf(i.zone) || {}).short) || _t('Trợ lý');
    if (S.ctxOn) {
      var path = ctxPath();
      E.ctx.appendChild(h('span', { class: 'lbl', text: _t('Đang xem:') }));
      E.ctx.appendChild(h('span', { class: 'path', title: path.join(' › ') }, path.map(function (p, n) { return [n ? h('span', { class: 'sep', 'aria-hidden': 'true', text: '›' }) : null, h(n === path.length - 1 ? 'b' : 'span', { text: p })]; })));
      E.ctx.appendChild(h('button', { type: 'button', class: 'x', 'aria-label': _t('Bỏ ngữ cảnh: không nói cho AI biết bạn đang xem gì'), title: _t('Bỏ ngữ cảnh (AI chỉ biết khu đang mở)'), onclick: function () { S.ctxOn = false; paintCtx(); loadThread(); } }, '×'));
    } else {
      E.ctx.appendChild(h('span', { class: 'lbl', text: _t('Không gắn ngữ cảnh — AI chỉ biết khu {zoneLabel}', { zoneLabel: zoneLabel(i.zone) }) }));
      E.ctx.appendChild(h('button', { type: 'button', class: 'btn sm', onclick: function () { S.ctxOn = true; paintCtx(); loadThread(); } }, _t('Gắn lại')));
    }
    paintQuick();
  }
  function paintQuick() {
    clear(E.quick);
    var list = B.quick(S.info, S.obj) || [];
    list.forEach(function (q) { E.quick.appendChild(h('button', { type: 'button', class: 'qk', title: q[1], onclick: function () { E.ta.value = q[1]; S.quick = { text: q[1], task: q[2] || '' }; autosize(); tokens(); E.ta.focus(); } }, q[0])); });
    E.quick.hidden = !list.length;
    var p = _l((zoneOf(S.info && S.info.zone) || {}).ask) || _t('Nhắn trợ lý…');
    E.ta.placeholder = _t('{p} · gõ @ để gắn thứ đang xem · Alt+P chỉ vào màn hình', { p: p });
  }
  function msgEl(m) {
    var el = h('div', { class: 'msg ' + m.role + (m.err ? ' err' : '') });
    if (m.role === 'user' && m.pins && m.pins.length) el.appendChild(h('div', { class: 'pins' }, m.pins.map(function (p) { return chipEl(p.anchor, p.label, { pin: true }); })));
    var body = h('div', { class: 'tx' });
    if (m.role === 'assistant') richText(m.content || _t('(đã làm, không lời)'), body); else body.textContent = m.content || '';
    el.appendChild(body);
    if (m.log && m.log.length) {
      var lg = h('div', { class: 'toollog' });
      m.log.forEach(function (x) { lg.appendChild(h('span', { class: x.ok ? 'ok' : 'bad', title: x.summary, text: (x.ok ? '✓ ' : '✗ ') + x.tool })); });
      el.appendChild(lg);
    }
    // kết quả tool (thứ vừa tạo / sửa) tự thành nút — kể cả khi AI quên nhắc trong lời
    var named = {}; (m.content || '').replace(CHIP_RE, function (_, a) { named[a.trim()] = 1; return ''; });
    var extra = (m.anchors || []).filter(function (a) { return Anchors.valid(a.anchor) && !named[a.anchor]; });
    if (extra.length) el.appendChild(h('div', { class: 'made' }, h('span', { class: 'note', text: _t('Vừa làm:') }), extra.map(function (a) { return chipEl(a.anchor, a.label); })));
    if (m.usage && (m.usage.prompt || m.usage.completion)) el.appendChild(h('div', { class: 'usage note mono', title: _t('Token THẬT nhà cung cấp tính cho lượt này (cộng mọi vòng gọi tool): vào = chỉ dẫn + dữ liệu giao diện + lịch sử + kết quả tool, ra = lời AI viết'), text: _t('token vào {prompt} · ra {completion}', { prompt: m.usage.prompt, completion: m.usage.completion }) }));
    if (m.renders && m.renders.length) el.appendChild(h('div', { class: 'renders' }, m.renders.map(function (r) { return h('img', { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg), alt: _t('Ảnh do tool {tool} dựng', { tool: r.tool }) }); })));
    return el;
  }
  function paintLog() {
    if (!ready) return;
    clear(E.log);
    if (!S.msgs.length) E.log.appendChild(h('div', { class: 'dock-empty note' }, emptyText()));
    S.msgs.forEach(function (m) { E.log.appendChild(msgEl(m)); });
    if (S.busy) { E.busy = h('div', { class: 'msg assistant busy', role: 'status', id: 'dockBusy' }); paintBusy(); E.log.appendChild(E.busy); }
    E.log.scrollTop = E.log.scrollHeight;
  }
  // v0.26 P1c (tối thiểu): lượt qua cầu nối CLI — tiến trình (pha, tool ✓/✗ gần nhất, đoạn chữ cuối) + nút Huỷ (POST api/ai/turns/<id>/cancel: thu hồi token lượt ngay).
  // Vẽ lại CHỈ khối này mỗi lần hỏi lượt (không vẽ lại cả luồng)
  function paintBusy() {
    if (!E.busy) return;
    clear(E.busy);
    var p = S.prog && S.prog.progress;
    E.busy.appendChild(h('div', { text: !p ? _t('AI đang làm (gọi tool của nhà xưởng)…') : p.phase === 'queued' ? _t('Agent CLI: đang chờ cầu nối nhận lượt…') : _t('Agent CLI đang làm…') }));
    if (p && p.log && p.log.length) E.busy.appendChild(h('div', { class: 'note' }, p.log.slice(-4).map(function (l) { return h('div', { text: (l.ok ? '✓ ' : '✗ ') + l.tool }); })));
    if (p && p.text) E.busy.appendChild(h('div', { class: 'note', text: '… ' + String(p.text).slice(-160) }));
    if (S.prog && S.prog.cancellable) E.busy.appendChild(h('button', { type: 'button', class: 'btn sm danger', id: 'dockCancel', disabled: !!S.prog.cancelling, onclick: function () {
      var id = S.prog.turn; S.prog.cancelling = true; paintBusy();
      B.Store.api('POST', 'api/ai/turns/' + encodeURIComponent(id) + '/cancel', {}).then(function () { toast(_t('Đang huỷ lượt AI…')); }, function (e) { S.prog.cancelling = false; paintBusy(); toast(e.message); });
    } }, S.prog.cancelling ? _t('Đang huỷ…') : _t('Huỷ')));
  }
  function emptyText() { return _l((zoneOf(S.info && S.info.zone) || {}).intro) || _t('Tôi là trợ lý của gen-chibi — hỏi cách dùng hoặc nhờ làm việc ở khu đang mở.'); }

  /* ============================================================ cấu hình AI (có key chưa) */
  function loadCfg() {
    if (B.Store.mode !== 'server') { S.cfg = { off: true }; paintGate(); return; }
    B.Store.api('GET', 'api/ai').then(function (c) { S.cfg = { hasKey: !!c.hasKey, model: c.model || '', provider: (c.providers && c.providers[c.provider] || {}).label || c.provider, mode: c.primary === 'cli' ? 'cli' : 'api', cliReady: !!c.cliReady, cli: (c.cli && c.cli.name) || '' }; S.zones = c.zones || S.zones; paintGate(); paintCtx(); paintLog(); tokens(); }, function () { S.cfg = { hasKey: false, model: '' }; paintGate(); });
  }
  // v0.26 (CNS-316): đường Agent CLI sẵn sàng = cầu nối online + CLI đã bật trên máy chủ + khoá Đạt (server tính cliReady); đường API = key + model
  function aiReady() { var c = S.cfg; return !!(c && !c.off && (c.mode === 'cli' ? c.cliReady : c.hasKey && c.model)); }
  function paintGate() {
    if (!ready) return;
    clear(E.gate);
    var c = S.cfg;
    if (!c) { E.gate.hidden = true; return; }
    if (c.off) E.gate.appendChild(h('div', { class: 'banner warn', role: 'status' }, h('span', { text: _t('Trợ lý AI cần bản cài trên máy (server) và một API key LLM. Bản xem thử trong trình duyệt chỉ cho xem.') })));
    else if (c.mode === 'cli' && !c.cliReady) E.gate.appendChild(h('div', { class: 'banner warn', role: 'status' },
      h('span', { text: _t('Agent CLI trên máy này chưa sẵn sàng (cầu nối tắt, CLI chưa bật hoặc khoá chưa đạt) — xem Cài đặt AI.') }),
      h('button', { type: 'button', class: 'btn sm primary', onclick: function () { B.go({ page: 'ai' }); } }, _t('Mở Cài đặt AI ›'))));
    else if (c.mode !== 'cli' && (!c.hasKey || !c.model)) E.gate.appendChild(h('div', { class: 'banner warn', role: 'status' },
      h('span', { text: !c.hasKey ? _t('Chưa có API key LLM — dán key ở Cài đặt AI để trợ lý trả lời.') : _t('Chưa chọn model — chọn model ở Cài đặt AI.') }),
      h('button', { type: 'button', class: 'btn sm primary', onclick: function () { B.go({ page: 'ai' }); } }, _t('Mở Cài đặt AI ›'))));
    E.gate.hidden = !E.gate.firstChild;
    E.send.disabled = S.busy || !aiReady();
    E.send.title = aiReady() ? _t('Gửi (Ctrl/⌘ + Enter)') : c.mode === 'cli' ? _t('Cần Agent CLI sẵn sàng ở Cài đặt AI') : _t('Cần API key + model ở Cài đặt AI');
  }

  /* ============================================================ gửi */
  function send(text) {
    text = String(text == null ? E.ta.value : text).trim();
    if (!text || S.busy) return;
    if (!aiReady()) { paintGate(); toast(S.cfg && S.cfg.mode === 'cli' ? _t('Agent CLI chưa sẵn sàng — mở Cài đặt AI.') : _t('Chưa có API key / model — mở Cài đặt AI.')); return; }
    var pins = S.pins.slice(), sentCtx = ctxPayload(), key = S.key, quickTask = S.quick && S.quick.text === text ? S.quick.task : '';   // nút gợi ý gửi nguyên câu → việc của nút lên công tắc Live
    S.quick = null;
    S.msgs.push({ role: 'user', content: text, pins: pins.map(function (p) { return { anchor: p.anchor, label: p.label }; }) });
    S.busy = true; E.ta.value = ''; S.pins = []; paintPins(); autosize(); paintLog(); paintGate();
    // snapshot lấy lại lúc gửi (tác phẩm vừa sửa → không gửi bản cũ); cắt theo ngân sách chung
    var per = pins.length ? Math.max(300, Math.min(1200, Math.floor(BUDGET / pins.length))) : 0;
    Promise.all(pins.map(function (p) { return Anchors.snapshot(p.anchor, per).then(function (t) { return { anchor: p.anchor, kind: Anchors.parse(p.anchor).kind, id: Anchors.parse(p.anchor).id, label: p.label, snapshot: t }; }); }))
      .then(function (anchors) { return B.Store.turn('api/ai/agent', Object.assign({ message: text, context: sentCtx, anchors: anchors }, quickTask ? { task: quickTask } : {}), function (t, id) { S.prog = { turn: id, progress: t.progress || null, cancellable: !!t.cancellable, cancelling: S.prog && S.prog.turn === id && S.prog.cancelling }; paintBusy(); }); })   // 202 + hỏi lượt: lượt dài không bị proxy cắt ~100 s (CNS-175)
      .then(function (r) {
        if (S.key === key) { S.msgs.push({ role: 'assistant', content: r.reply || '', log: r.log, anchors: r.anchors, renders: r.renders, usage: r.usage }); S.sent = r.sent || null; S.sentKey = key; }
        if (r.work) Works.put(r.work);
        if (S.key !== key) toast(_t('AI đã trả lời ở luồng khác — mở lại đối tượng đó để xem.'));
        return Promise.resolve(B.refreshData(r)).catch(function () { /* nạp lại kho lỗi: chip kiểm lại ở lần vẽ sau */ });   // nạp kho TRƯỚC khi vẽ chip → chip của asset vừa tạo không bị báo "không còn"
      })
      .catch(function (e) { if (S.key === key) S.msgs.push({ role: 'assistant', content: _t('Lỗi: {message}', { message: e.message }), err: true }); })
      .then(function () { S.busy = false; S.prog = null; E.busy = null; paintLog(); paintGate(); });
  }
  function autosize() { E.ta.style.height = 'auto'; E.ta.style.height = clamp(E.ta.scrollHeight + 2, 56, 160) + 'px'; }
  function clearThread() {
    var k = objKey();
    if (!S.msgs.length || !window.confirm(_t('Xoá luồng hội thoại này?\n\nChỉ xoá tin nhắn với trợ lý ({ctxPath}); tác phẩm / asset giữ nguyên.', { ctxPath: ctxPath().join(' › ') }))) return;
    B.Store.api('DELETE', 'api/chats/' + encodeURIComponent(k.kind) + '/' + encodeURIComponent(k.id)).then(function () { S.msgs = []; paintLog(); toast(_t('Đã xoá luồng.')); }).catch(function (e) { toast(e.message); });
  }

  /* ============================================================ mở / đóng / kéo rộng */
  function applyLayout() {
    var narrow = NARROW.matches, open = S.open;
    document.body.classList.toggle('dock-open', open);
    document.body.classList.toggle('dock-narrow', narrow);
    document.documentElement.style.setProperty('--dock-w', (open && !narrow ? S.w : 0) + 'px');
    document.documentElement.style.setProperty('--dock-drawer-w', S.w + 'px');
    E.dock.setAttribute('aria-hidden', String(!open));
    if (E.dock.inert !== undefined) E.dock.inert = !open;
    E.toggle.setAttribute('aria-expanded', String(open));
    E.toggle.classList.toggle('on', open);
    E.sep.setAttribute('aria-valuenow', String(S.w));
  }
  function setOpen(v, focus) {
    S.open = !!v; if (!NARROW.matches) S.openWide = S.open;
    applyLayout(); savePref();
    if (S.open) { loadCfg(); if (focus) setTimeout(function () { E.ta.focus(); }, 0); }
    else { setPick(false); mentionClose(); }
    lvKick();
    window.dispatchEvent(new Event('resize'));   // lưới / bộ phát co giãn theo bề rộng mới
  }
  function setWidth(w, save) { S.w = clamp(Math.round(w), W_MIN, Math.min(W_MAX, Math.floor(window.innerWidth * 0.6))); applyLayout(); if (save) savePref(); }

  /* ============================================================ SÂN KHẤU LIVE Ở ĐỈNH DOCK (v0.25, spec §8 — Ryan: "phải luôn hiển thị trên đầu khung chatroom")
   * Một sân khấu, một diễn viên, theo kênh đang hoạt động (chan công khai của sự kiện); bộ chọn kênh để ghim. Nguồn: GCLiveFeed (một SSE / trình duyệt).
   * Chiều cao CỐ ĐỊNH trước khi vẽ (96–240, mặc định 132, nhớ theo máy) → khung chat lệch 0 px. Thu gọn = thanh 28 px (nhớ theo máy).
   * L-42: diễn đủ chỉ khi có kế hoạch (+3 s, tối đa 20 s sau sự kiện cuối) và giữ 1 suất "diễn đủ ≤ 8" (GC.render.reserve); rảnh = tầng thở ≤ 12 khung / giây;
   * DỪNG HẲN vòng vẽ khi tab ẩn, dock đóng, thu gọn, ra ngoài màn hình, đang ở trang Live (tự thu — CNS-317) hoặc prefers-reduced-motion (vẽ một khung tĩnh). */
  var LV_MIN = 96, LV_MAX = 240, LV_DEF = 132, LV_HOLD = 10, LV_ACT_TAIL = 3, LV_ACT_MAX = 20, LV_BREATHE_MS = 1000 / 12;
  var LVD = { h: LV_DEF, folded: false, forced: false, pin: 'auto', P: null, D: null, t0: 0, raf: 0, tm: 0, inView: true, lastEvt: -1e9, planEnd: -1e9, lastPaint: -1e9,
    shown: null, shownAt: -1e9, unseen: 0, chans: {}, names: {}, task: null, titles: {}, status: 'off', slot: false,
    stats: { frames: 0, act: 0, breathe: 0, sumAct: 0, sumBreathe: 0, worstAct: 0, worstBreathe: 0, mode: 'stop', why: '' } };
  function lvNow() { return performance.now() / 1000 - LVD.t0; }
  function lvLoad() {
    try { var p = JSON.parse(localStorage.getItem('gc-dock-live') || '{}') || {}; LVD.h = clamp(+p.h || LV_DEF, LV_MIN, LV_MAX); LVD.folded = !!p.folded; LVD.pin = typeof p.pin === 'string' && /^(auto|studio-ai|ext|hook|mcp|owner|agent:[a-f0-9]{16})$/.test(p.pin) ? p.pin : 'auto'; }
    catch (e) { /* mặc định */ }
  }
  function lvSave() { try { localStorage.setItem('gc-dock-live', JSON.stringify({ h: LVD.h, folded: LVD.folded, pin: LVD.pin })); } catch (e) { /* bỏ qua */ } }
  function lvFolded() { return LVD.folded || LVD.forced; }
  // vì sao không vẽ (rỗng = được vẽ) — test đọc lý do
  function lvWhy() { return window.GCVideo && window.GCVideo.busy > 0 ? 'video' : !S.open ? 'closed' : lvFolded() ? (LVD.forced ? 'live-page' : 'folded') : document.hidden ? 'hidden' : !LVD.inView ? 'offscreen' : REDUCED.matches ? 'reduced' : ''; }
  // nhóm kênh: AI trong Studio (mọi lượt) | từng kênh ngoài (hook / agent:<id> / mcp / owner)
  function lvGroup(ch) { return /^studio-ai:/.test(ch) ? 'studio-ai' : ch || 'owner'; }
  function lvMatch(sel, g) { return sel === 'ext' ? g !== 'studio-ai' : sel === g; }
  function lvChanLabel(g) {
    if (g === 'studio-ai') return _t('AI trong Studio');
    if (g === 'ext') return _t('Agent ngoài');
    if (g === 'hook') return _t('Claude Code (hook)');
    if (g === 'mcp') return _t('Agent qua MCP');
    if (g === 'owner') return _t('Chủ máy');
    if (/^agent:/.test(g)) return LVD.names[g.slice(6)] || _t('Agent {id}', { id: g.slice(6, 12) });
    return g;
  }
  function lvSelPaint() {
    if (!E.lvSel) return;
    var cur = LVD.pin, opts = ['auto', 'studio-ai', 'ext'].concat(Object.keys(LVD.chans).filter(function (g) { return g !== 'studio-ai'; }).sort());
    if (opts.indexOf(cur) < 0) opts.push(cur);
    clear(E.lvSel);
    opts.forEach(function (v) { E.lvSel.appendChild(h('option', { value: v, selected: v === cur ? true : null }, v === 'auto' ? _t('Tự động') : lvChanLabel(v))); });
    E.lvCnt.hidden = !LVD.unseen; E.lvCnt.textContent = LVD.unseen > 99 ? '99+' : String(LVD.unseen);
  }
  function lvTaskPaint() {
    if (!E.lvTask) return;
    var g = LVD.shown, tk = LVD.task;
    E.lvTask.textContent = tk ? _t('Đang làm: {task}', { task: _t(GC.live.TASK_LABEL[tk]) }) + (LVD.titles[tk] ? ' · ' + LVD.titles[tk] : '') + (g ? ' — ' + lvChanLabel(g) : '')
      : g ? lvChanLabel(g) : _t('Sân khấu Live');
  }
  // sự kiện từ GCLiveFeed: đúng kênh đang hiện → đạo diễn; kênh khác → chấm đếm trên bộ chọn
  function lvOnEvent(ev) {
    var g = lvGroup(ev.chan), t = lvNow(), isNew = !LVD.chans[g];
    LVD.chans[g] = (LVD.chans[g] || 0) + 1;
    if (isNew) lvSelPaint();
    if (ev.quiet) return;   // lượt AI khác lượt đang diễn: chỉ đếm
    var sel = LVD.pin;
    if (sel === 'auto') {   // bám kênh có sự kiện mới nhất, giữ ≥ 10 s trước khi đổi
      if (!LVD.shown || (LVD.shown !== g && t - LVD.shownAt >= LV_HOLD)) { if (LVD.shown !== g) { LVD.shown = g; LVD.task = null; } }
      if (LVD.shown === g) LVD.shownAt = t;
    } else if (lvMatch(sel, g)) LVD.shown = g;
    if (!(sel === 'auto' ? LVD.shown === g : lvMatch(sel, g))) { LVD.unseen++; lvSelPaint(); return; }
    if (ev.kind === 'task' && GC.live.TASK_LABEL[ev.task]) { LVD.task = ev.task; LVD.titles[ev.task] = ev.title || ''; }
    lvTaskPaint();
    if (!LVD.D) LVD.D = GC.live.director({ x0: GC.live.ZONES.center.x });
    LVD.D.push({ id: 'k' + ev.id, kind: ev.kind, label: ev.label, tool: ev.tool, sub: ev.sub, task: ev.task }, t);
    LVD.lastEvt = t;
    lvKick();
  }
  // Player dựng LÚC RẢNH (requestIdleCallback) — không chen vào lúc trang đang tải (L-42); xong thì lvKick lại
  // chưa từng có sự kiện nào → chưa dựng Player (0 chi phí ở trang không có hoạt động; sân khấu hiện lời "chưa có hoạt động")
  function lvEnsure() {
    if (LVD.P || !window.GCLive || !E.lvBox) return !!LVD.P;
    if (LVD.lastEvt <= -1e9) return false;
    if (!LVD.building) {
      LVD.building = true;
      var ric = window.requestIdleCallback || function (f) { return setTimeout(f, 200); };
      ric(function () { lvBuildPlayer(); LVD.building = false; lvKick(); }, { timeout: 1500 });
    }
    return false;
  }
  function lvBuildPlayer() {
    if (LVD.P || !window.GCLive || !E.lvBox) return;
    if (!LVD.D) LVD.D = GC.live.director({ x0: GC.live.ZONES.center.x });
    LVD.P = window.GCLive.Player(E.lvBox, LVD.D, { id: 'dockLiveStage', raster: 1 });
    if (E.lvEmpty) E.lvEmpty.hidden = true;
    LVD.P.svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');   // dải thấp: giữ sàn + nhân vật, cắt trần
  }
  function lvStop(why) {
    if (LVD.raf) cancelAnimationFrame(LVD.raf); if (LVD.tm) clearTimeout(LVD.tm); LVD.raf = LVD.tm = 0;
    if (LVD.slot && GC.render && GC.render.release) { GC.render.release('dock-live'); LVD.slot = false; }
    LVD.stats.mode = 'stop'; LVD.stats.why = why;
  }
  // bật / tắt vòng vẽ theo trạng thái hiện tại (gọi mỗi khi dock / tab / thu gọn / màn hình / sự kiện đổi)
  function lvKick() {
    if (!ready || !E.lv) return;
    if (window.GCLiveFeed) window.GCLiveFeed.poke();
    var why = lvWhy();
    if (why === 'reduced' && lvEnsure()) { lvStop(why); LVD.D.advance(lvNow()); LVD.P.paint(lvNow()); return; }   // chuyển động giảm: một khung tĩnh
    if (why) { lvStop(why); return; }
    if (!lvEnsure()) return;
    if (!LVD.raf && !LVD.tm) LVD.raf = requestAnimationFrame(lvLoop);
  }
  function lvLoop() {
    LVD.raf = LVD.tm = 0;
    var why = lvWhy(); if (why) { lvStop(why); return; }
    var t = lvNow(), D = LVD.D, A = D.activity && D.activity();
    if (D.queue.length || (A && A.intents && A.intents.length)) { var s0 = D.stepAt(t); LVD.planEnd = Math.max(LVD.planEnd, s0 ? s0.t1 : t); }
    var acting = t - LVD.lastEvt < LV_ACT_MAX && t < Math.max(LVD.lastEvt, LVD.planEnd) + LV_ACT_TAIL;
    if (acting && !LVD.slot && GC.render && GC.render.reserve) LVD.slot = GC.render.reserve('dock-live');
    if (acting && GC.render && GC.render.reserve && !LVD.slot) acting = false;   // hết suất "diễn đủ ≤ 8": thở
    if (!acting && LVD.slot) { GC.render.release('dock-live'); LVD.slot = false; }
    var a = performance.now();
    D.advance(t); LVD.P.paint(t, !acting);
    var cost = performance.now() - a, st = LVD.stats;
    st.frames++; LVD.lastPaint = t; st.mode = acting ? 'act' : 'breathe'; st.why = '';
    if (acting) { st.act++; st.sumAct += cost; if (cost > st.worstAct) st.worstAct = cost; }
    else { st.breathe++; st.sumBreathe += cost; if (cost > st.worstBreathe) st.worstBreathe = cost; }
    if (acting) LVD.raf = requestAnimationFrame(lvLoop);
    else LVD.tm = setTimeout(function () { LVD.tm = 0; LVD.raf = requestAnimationFrame(lvLoop); }, LV_BREATHE_MS);   // tầng thở ≤ 12 khung / giây
  }
  function lvFold(v, save) {
    LVD.folded = !!v; if (save) lvSave();
    lvApply(); lvKick();
  }
  function lvApply() {
    if (!E.lv) return;
    var f = lvFolded();
    E.lv.classList.toggle('folded', f);
    E.lvBody.style.height = LVD.h + 'px';
    E.lvFoldB.setAttribute('aria-expanded', String(!f)); E.lvFoldB.textContent = f ? '▾' : '▴';
    E.lvGrip.setAttribute('aria-valuenow', String(LVD.h));
  }
  function lvSetH(v, save) { LVD.h = clamp(Math.round(v), LV_MIN, LV_MAX); lvApply(); if (save) lvSave(); }
  function lvBuild() {
    lvLoad(); LVD.t0 = performance.now() / 1000;
    E.lvDot = h('span', { class: 'dot', id: 'dockLiveDot' });
    E.lvTask = h('span', { class: 'task', id: 'dockLiveTask' });
    E.lvSel = h('select', { id: 'dockLiveChan', onchange: function () { LVD.pin = E.lvSel.value; LVD.unseen = 0; if (LVD.pin !== 'auto' && LVD.pin !== 'ext') LVD.shown = LVD.pin; lvSave(); lvSelPaint(); lvTaskPaint(); } });
    E.lvCnt = h('span', { class: 'cnt', id: 'dockLiveCount', hidden: true });
    E.lvOpenB = h('button', { type: 'button', class: 'btn sm ic', id: 'dockLiveOpen', onclick: function () { B.go({ page: 'live' }); } }, '⤢');
    E.lvFoldB = h('button', { type: 'button', class: 'btn sm ic', id: 'dockLiveFold', 'aria-controls': 'dockLiveBody', onclick: function () { if (!LVD.forced) lvFold(!LVD.folded, true); } }, '▴');
    E.lvBox = h('div', { class: 'dock-lv-box', style: 'position:absolute;inset:0' });
    E.lvEmpty = h('div', { class: 'dock-lv-empty note', id: 'dockLiveEmpty' });
    E.lvGrip = h('div', { class: 'dock-lv-grip', id: 'dockLiveGrip', role: 'separator', 'aria-orientation': 'horizontal', tabindex: '0', 'aria-valuemin': String(LV_MIN), 'aria-valuemax': String(LV_MAX) });
    E.lvBody = h('div', { class: 'dock-lv-body', id: 'dockLiveBody', style: 'height:' + LVD.h + 'px' }, E.lvBox, E.lvEmpty, E.lvGrip);
    E.lv = h('section', { class: 'dock-lv', id: 'dockLive' }, h('div', { class: 'dock-lv-bar' }, E.lvDot, E.lvTask, E.lvCnt, E.lvSel, E.lvOpenB, E.lvFoldB), E.lvBody);
    E.lvGrip.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); E.lvGrip.setPointerCapture(ev.pointerId);
      var y0 = ev.clientY, h0 = LVD.h;
      function mv(e) { lvSetH(h0 + e.clientY - y0, false); }
      function up() { E.lvGrip.removeEventListener('pointermove', mv); E.lvGrip.removeEventListener('pointerup', up); lvSave(); }
      E.lvGrip.addEventListener('pointermove', mv); E.lvGrip.addEventListener('pointerup', up);
    });
    E.lvGrip.addEventListener('keydown', function (ev) { var d = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0; if (!d) return; ev.preventDefault(); lvSetH(LVD.h + d * (ev.shiftKey ? 24 : 8), true); });
    if (typeof IntersectionObserver === 'function') new IntersectionObserver(function (es) { es.forEach(function (e) { LVD.inView = e.isIntersecting; }); lvKick(); }).observe(E.lvBody);
    document.addEventListener('visibilitychange', lvKick);
    window.addEventListener('gc-video-busy', lvKick);   // Studio đang xuất video: nhường luồng chính
    if (REDUCED.addEventListener) REDUCED.addEventListener('change', lvKick);
    var FD = window.GCLiveFeed;
    if (FD && B.Store.mode === 'server') {
      FD.init({ mode: B.Store.mode, headers: function () { return B.Store.headers(); } });
      FD.subscribe(lvOnEvent, { replay: true });
      FD.onStatus(function (st) { LVD.status = st; lvDotPaint(); });
      FD.want('dock', function () { return S.open && !lvFolded() && !(window.GCVideo && window.GCVideo.busy > 0); });
      B.Store.api('GET', 'api/live/agents').then(function (r) { (r.agents || []).forEach(function (a) { LVD.names[a.id] = a.name; }); lvSelPaint(); }).catch(function () { /* không có */ });
    }
    lvApply(); lvSelPaint(); lvTaskPaint();
  }
  function lvDotPaint() {
    var st = LVD.status;
    E.lvDot.className = 'dot ' + (st === 'on' ? 'on' : st === 'retry' ? 'retry' : '');
    E.lvDot.title = st === 'on' ? _t('Đang nghe') : st === 'retry' ? _t('Mất kết nối — thử lại…') : _t('Tạm dừng (sân khấu thu gọn hoặc tab ẩn)');
  }
  function lvRelabel() {
    if (!E.lv) return;
    lvDotPaint();
    if (LVD.P) LVD.P.svg.setAttribute('aria-label', _t('Sân khấu sống'));   // Player dựng lúc ngôn ngữ cũ
    E.lv.setAttribute('aria-label', _t('Sân khấu Live'));
    E.lvSel.setAttribute('aria-label', _t('Kênh trên sân khấu'));
    E.lvOpenB.title = _t('Mở trang Sân khấu Live'); E.lvOpenB.setAttribute('aria-label', E.lvOpenB.title);
    E.lvFoldB.title = _t('Thu gọn / mở sân khấu'); E.lvFoldB.setAttribute('aria-label', E.lvFoldB.title);
    E.lvGrip.setAttribute('aria-label', _t('Kéo để đổi chiều cao sân khấu (phím ↑ ↓)'));
    E.lvEmpty.textContent = _t('Chưa có hoạt động — nhân vật lên sân khấu khi AI trong Studio hoặc một agent làm việc.');
    lvSelPaint(); lvTaskPaint();
  }

  /* ============================================================ dựng giao diện */
  function build() {
    var host = document.getElementById('dock');
    E.dock = host; E.toggle = document.getElementById('dockToggle');
    E.sep = h('div', { class: 'dock-sep', role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'aria-valuemin': String(W_MIN), 'aria-valuemax': String(W_MAX), 'aria-valuenow': String(S.w) });
    E.role = h('span', { class: 'role' });
    E.ctx = h('div', { class: 'dock-ctx' });
    E.gate = h('div', { class: 'dock-gate', hidden: true });
    E.log = h('div', { class: 'dock-log', role: 'log', 'aria-live': 'polite', tabindex: '0' });
    E.quick = h('div', { class: 'dock-quick', hidden: true });
    E.pins = h('div', { class: 'dock-pins', hidden: true });
    E.pop = h('div', { class: 'dock-pop', role: 'listbox', hidden: true });
    E.ta = h('textarea', { class: 'dock-ta', rows: 2, 'aria-autocomplete': 'list', 'aria-expanded': 'false', maxlength: 4000,
      oninput: function () { autosize(); tokens(); mentionUpdate(); },
      onkeydown: function (ev) {
        if (Mention.at >= 0 && !E.pop.hidden && Mention.list.length) {
          if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); Mention.idx = (Mention.idx + (ev.key === 'ArrowDown' ? 1 : Mention.list.length - 1)) % Mention.list.length; mentionPaint(); return; }
          if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); mentionPick(Mention.idx); return; }
        }
        if (ev.key === 'Escape' && Mention.at >= 0) { ev.preventDefault(); mentionClose(); return; }
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); }
      },
      onclick: mentionUpdate, onblur: function () { setTimeout(mentionClose, 120); } });
    E.tok = h('span', { class: 'tok mono', text: _t('~{n} token', { n: 0 }) });
    E.pickB = h('button', { type: 'button', class: 'btn sm', 'aria-pressed': 'false', onclick: function () { setPick(!S.pick); } });
    E.atB = h('button', { type: 'button', class: 'btn sm', onclick: function () { var p = E.ta.selectionStart, v = E.ta.value; E.ta.value = v.slice(0, p) + (p && !/\s$/.test(v.slice(0, p)) ? ' @' : '@') + v.slice(p); E.ta.focus(); E.ta.setSelectionRange(E.ta.value.length, E.ta.value.length); mentionUpdate(); } }, '@');
    E.sendL = h('span'); E.send = h('button', { type: 'button', class: 'btn primary sm send', onclick: function () { send(); } }, E.sendL, ' ', h('span', { class: 'kb', text: '⌘↵' }));
    E.title = h('b'); E.clearB = h('button', { type: 'button', class: 'btn sm', onclick: clearThread });
    E.foldB = h('button', { type: 'button', class: 'btn sm ic', onclick: function () { setOpen(false); E.toggle.focus(); } }, '›');
    var head = h('div', { class: 'dock-head' }, E.title, E.role, h('span', { class: 'sp' }), E.clearB, E.foldB);
    var form = h('div', { class: 'dock-compose' }, E.pins, E.ta, E.pop, h('div', { class: 'dock-bar' }, E.pickB, E.atB, h('span', { class: 'sp' }), E.tok, E.send));
    clear(host);
    lvBuild();
    host.appendChild(E.sep); host.appendChild(h('div', { class: 'dock-in' }, E.lv, head, E.ctx, E.gate, E.log, E.quick, form));
    // kéo đổi độ rộng
    E.sep.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); E.sep.setPointerCapture(ev.pointerId); document.body.classList.add('dock-drag');
      function mv(e) { setWidth(window.innerWidth - e.clientX, false); }
      function up() { E.sep.removeEventListener('pointermove', mv); E.sep.removeEventListener('pointerup', up); document.body.classList.remove('dock-drag'); savePref(); window.dispatchEvent(new Event('resize')); }
      E.sep.addEventListener('pointermove', mv); E.sep.addEventListener('pointerup', up);
    });
    E.sep.addEventListener('keydown', function (ev) {
      var d = ev.key === 'ArrowLeft' ? 1 : ev.key === 'ArrowRight' ? -1 : 0;
      if (!d) return;
      ev.preventDefault(); setWidth(S.w + d * (ev.shiftKey ? 48 : 16), true);
    });
    E.toggle.addEventListener('click', function () { setOpen(!S.open, true); });
    document.addEventListener('keydown', function (ev) {
      if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (ev.code === 'KeyJ') { ev.preventDefault(); setOpen(!S.open, true); }
      else if (ev.code === 'KeyP') { ev.preventDefault(); setPick(!S.pick); }
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.pick) { ev.preventDefault(); setPick(false); } }, true);
    NARROW.addEventListener && NARROW.addEventListener('change', function () { if (NARROW.matches) S.open = false; else S.open = S.openWide !== false; applyLayout(); window.dispatchEvent(new Event('resize')); });
    Spot.init(); Pick.init();
    relabel();
  }
  // chữ tĩnh của dock theo ngôn ngữ hiện tại — gọi lúc dựng và mỗi lần đổi ngôn ngữ (không dựng lại: giữ chữ đang gõ, ghim, luồng)
  function relabel() {
    E.sep.setAttribute('aria-label', _t('Kéo để đổi độ rộng trợ lý AI (phím ← →)'));
    E.log.setAttribute('aria-label', _t('Hội thoại với trợ lý AI'));
    E.pins.setAttribute('aria-label', _t('Phần tử đã ghim'));
    E.pop.setAttribute('aria-label', _t('Chọn phần tử để ghim'));
    E.ta.setAttribute('aria-label', _t('Nhắn trợ lý AI'));
    E.pickB.title = _t('Chế độ chỉ (Alt+P): rê lên phần tử rồi bấm để ghim vào tin nhắn'); E.pickB.textContent = _t('⌖ Chỉ vào màn hình');
    E.atB.title = _t('Gắn phần tử (hoặc gõ @ trong ô nhập)'); E.atB.setAttribute('aria-label', _t('Gắn phần tử bằng @')); E.atB.textContent = '@';
    E.sendL.textContent = _t('Gửi');
    E.title.textContent = _t('Trợ lý AI');
    E.clearB.title = _t('Xoá luồng hội thoại của đối tượng đang xem'); E.clearB.textContent = _t('Xoá luồng');
    E.foldB.setAttribute('aria-label', _t('Thu gọn trợ lý AI (Alt+J)')); E.foldB.title = _t('Thu gọn (Alt+J)');
    Pick.banner.textContent = _t('Chế độ chỉ: rê vào một phần tử rồi bấm để ghim · Shift+bấm ghim nhiều · Esc thoát');
    lvRelabel();
  }

  /* ============================================================ API cho app.js */
  var API = {
    // app.js đưa cầu nối (h, Store, go, route…) lúc khởi động — trước lần go() đầu tiên
    attach: function (bridge) {
      B = bridge; h = B.h; add = B.add; clear = B.clear; toast = B.toast;
      var p = loadPref(); S.w = p.w; S.openWide = p.open; S.open = NARROW.matches ? false : p.open;
      build(); ready = true;
      applyLayout(); tokens(); paintGate(); if (S.open) loadCfg();
      lvKick();
      pend.forEach(function (f) { f(); }); pend = [];
      var spot = null; try { spot = sessionStorage.getItem('gc-spot'); sessionStorage.removeItem('gc-spot'); } catch (e) { /* bỏ qua */ }
      if (spot) waitFor(spot, 4000, function () { Spot.flash(spot); });
    },
    // mỗi lần đổi trang: info = { zone, page, pageLabel } — đối tượng / tab về mặc định, ngữ cảnh gắn lại
    route: function (info) {
      if (!ready) { pend.push(function () { API.route(info); }); return; }
      var same = S.info && S.info.page === info.page && S.info.zone === info.zone;
      S.info = info;
      if (!same) { S.obj = null; S.tab = S.tabLabel = ''; S.shot = S.shotLabel = ''; S.ctxOn = true; }
      Spot.hide();
      if (S.cfg && !aiReady()) loadCfg();   // vừa quay về từ Cài đặt AI
      paintCtx(); loadThread();
    },
    // trang báo phần tử đang xem: obj { kind, id, label } · tab / shot (+ nhãn)
    ctx: function (o) {
      if (!ready) { pend.push(function () { API.ctx(o); }); return; }
      if (o.hasOwnProperty('object')) S.obj = o.object;
      if (o.hasOwnProperty('tab')) { S.tab = o.tab || ''; S.tabLabel = o.tabLabel || ''; }
      if (o.hasOwnProperty('shot')) { S.shot = o.shot || ''; S.shotLabel = o.shotLabel || ''; }
      paintCtx(); loadThread();
    },
    // đổi ngôn ngữ (app.js repaint): chữ tĩnh + vẽ lại ngữ cảnh / luồng / cổng; nhãn khu (server giữ) hỏi lại theo ngôn ngữ mới
    relang: function () { if (!ready) return; relabel(); paintPins(); paintCtx(); paintLog(); paintGate(); tokens(); if (B.Store.mode === 'server') loadCfg(); },
    pin: function (anchor, label) { return ready ? addPin(anchor, label) : false; },
    open: function (focus) { if (ready) setOpen(true, focus !== false); },
    // đặt chữ vào ô nhập (vd. "Gửi AI sửa theo ghi chú")
    compose: function (text) { if (!ready) return; setOpen(true); E.ta.value = text || ''; autosize(); tokens(); E.ta.focus(); E.ta.setSelectionRange(E.ta.value.length, E.ta.value.length); },
    send: send,
    workChanged: function (w) { Works.put(w); },
    flash: function (a) { return Spot.flash(a); },
    // trang Live đầy đủ báo mở / đóng: sân khấu dock tự thu về thanh 28 px (không lưu vào lựa chọn của người dùng)
    livePage: function (on) { LVD.forced = !!on; if (ready) { lvApply(); lvKick(); } },
    // số đo cho test trình duyệt (L-42): chỉ đọc
    live: function () { var s = LVD.stats; return { h: LVD.h, folded: LVD.folded, forced: LVD.forced, pin: LVD.pin, shown: LVD.shown, unseen: LVD.unseen, chans: Object.assign({}, LVD.chans), task: LVD.task, status: LVD.status, running: !!(LVD.raf || LVD.tm), slot: LVD.slot,
      stats: { frames: s.frames, act: s.act, breathe: s.breathe, sumAct: s.sumAct, sumBreathe: s.sumBreathe, avgAct: s.act ? s.sumAct / s.act : 0, avgBreathe: s.breathe ? s.sumBreathe / s.breathe : 0, worstAct: s.worstAct, worstBreathe: s.worstBreathe, mode: s.mode, why: s.why }, steps: LVD.D ? LVD.D.steps.length : 0 }; },
    state: function () { return { open: S.open, w: S.w, pins: S.pins.map(function (p) { return p.anchor; }), key: S.key, busy: S.busy, ctx: ctxPayload(), ready: aiReady() }; }
  };
  window.GCDock = API;
})();
