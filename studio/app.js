/* gen-chibi Studio — giao diện quản lý (Data Console, desktop-first)
 * © 2026 Afi Labs — All rights reserved.
 * Hai chế độ lưu: "máy chủ" (bản cài, /api) hoặc "trình duyệt" (xem thử, localStorage).
 */
(function () {
  'use strict';
  var GC = window.GenChibi, LIB = GC.LIB, R = GC.render;
  R.injectCSS();

  /* ============================================================ tiện ích */
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(e, x); });
    else e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtTime(s) { if (!s) return '—'; var d = new Date(s); return d.toLocaleString('vi-VN', { hour12: false }); }
  function stateLabel(id) { return (LIB.states[id] || {}).label || id; }
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800); }
  var OWN = ['#5B9BD5', '#4FB57A', '#8C86E0', '#E0A43A', '#C08463', '#2BB3A3', '#D9708F', '#B97BD0', '#8DA65A', '#E4785F'];
  function ownOf(a) { var i = GC.ASSET_ORDER.indexOf(a.key); return a.own || OWN[(i < 0 ? 0 : i) % OWN.length]; }

  /* ============================================================ lưu trữ */
  var MY_PACK = 'local.my';
  GC.pack({ id: MY_PACK, name: 'Của tôi', owner: 'Bạn', group: 'mine', visibility: 'private', license: 'Thuộc người tạo', description: 'Nhân vật bạn tạo hoặc chỉnh trên máy này.' }, function () {});

  var Store = {
    mode: 'browser', info: null,
    // Bản cài có GC_API_TOKEN: Studio đăng nhập bằng token, giữ trong trình duyệt này.
    token: function () { try { return localStorage.getItem('gc-token') || ''; } catch (e) { return ''; } },
    headers: function () {
      var hd = { 'Content-Type': 'application/json', 'X-GC-Request': '1' }, t = this.token();
      if (t) hd.Authorization = 'Bearer ' + t;
      return hd;
    },
    api: function (method, url, body) {
      var self = this;
      return fetch(url, { method: method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined })
        .then(function (r) {
          if (r.status === 401) { self.login(); throw new Error('Cần đăng nhập bằng token'); }
          return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('Lỗi ' + r.status)); return j; });
        });
    },
    login: function (wrong) {
      if (document.getElementById('gcLogin')) return new Promise(function () {});
      var inp = h('input', { type: 'password', placeholder: 'GC_API_TOKEN', autocomplete: 'current-password', style: 'width:100%;margin:10px 0' });
      var form = h('form', { class: 'panel', style: 'width:380px;padding:18px 20px', onsubmit: function (ev) {
        ev.preventDefault();
        try { localStorage.setItem('gc-token', inp.value.trim()); } catch (e) { /* bỏ qua */ }
        location.reload();
      } },
        h('div', { style: 'font-weight:600;font-size:14px', text: 'Đăng nhập gen-chibi' }),
        h('div', { style: 'color:var(--fg2);margin-top:4px', text: wrong ? 'Token không đúng. Nhập lại token trong ~/gen-chibi/.env.' : 'Bản cài này có khoá. Nhập GC_API_TOKEN trong ~/gen-chibi/.env.' }),
        inp, h('button', { class: 'btn primary', type: 'submit', text: 'Đăng nhập' }));
      document.body.appendChild(h('div', { id: 'gcLogin', style: 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:var(--bg)' }, form));
      inp.focus();
      return new Promise(function () {});
    },
    init: function () {
      var self = this;
      return fetch('api/info', { headers: this.headers() }).then(function (r) {
        if (r.status === 401) return self.login(!!self.token());
        if (!r.ok) throw 0;
        return r.json().then(function (info) { self.mode = 'server'; self.info = info; return self.api('GET', 'api/parts').catch(function () { return []; }); })
          .then(function (parts) {
            // linh kiện dữ liệu (agent tạo qua MCP): engine kiểm lại SVG trước khi đăng ký — phòng thủ nhiều lớp
            (parts || []).forEach(function (d) { var r0 = GC.registerDataPart(MY_PACK, d); if (r0.errors.length) console.warn('bỏ linh kiện', d.id, r0.errors); });
            return self.api('GET', 'api/items').catch(function () { return []; });
          })
          .then(function (items) {
            (items || []).forEach(function (d) { var r1 = GC.registerItem(MY_PACK, d); if (r1.errors.length) console.warn('bỏ item', d.id, r1.errors); });
            return self.api('GET', 'api/scenes').catch(function () { return []; });
          })
          .then(function (scenes) {
            (scenes || []).forEach(function (d) { var r2 = GC.registerScene(MY_PACK, d); if (r2.errors.length) console.warn('bỏ cảnh', d.id, r2.errors); });
            return self.api('GET', 'api/assets');
          })
          .then(function (list) { (list || []).forEach(function (a) { GC.registerAsset(a.pack, a); }); });
      }).catch(function () {
          self.mode = 'browser';
          try { JSON.parse(localStorage.getItem('gc-assets') || '[]').forEach(function (a) { GC.registerAsset(a.pack, a); }); } catch (e) { /* bỏ qua */ }
        });
    },
    save: function (asset, note) {
      var key = asset.pack + '/' + asset.id;
      if (this.mode === 'server') {
        // server kiểm bằng CÙNG cổng với MCP/AI; không đạt thì báo rõ cổng nào chặn
        return this.api('PUT', 'api/assets/' + key, Object.assign({}, asset, { _note: note })).then(function (rec) { return GC.registerAsset(rec.pack, rec); })
          .catch(function (e) { toast(e.message); throw e; });
      }
      var rec = clone(asset);
      rec.version = (rec.version || 0) + 1; rec.savedAt = new Date().toISOString();
      var vk = 'gc-v-' + key, vers = [];
      try { vers = JSON.parse(localStorage.getItem(vk) || '[]'); } catch (e) { /* bỏ qua */ }
      vers.unshift({ version: rec.version, savedAt: rec.savedAt, note: note || '', data: rec });
      try {
        localStorage.setItem(vk, JSON.stringify(vers.slice(0, 30)));
        var all = JSON.parse(localStorage.getItem('gc-assets') || '[]').filter(function (x) { return x.pack + '/' + x.id !== key; });
        all.push(rec); localStorage.setItem('gc-assets', JSON.stringify(all));
      } catch (e) { /* trình duyệt chặn lưu: vẫn chạy trong phiên */ }
      return Promise.resolve(GC.registerAsset(rec.pack, rec));
    },
    versions: function (asset) {
      var key = asset.pack + '/' + asset.id;
      if (this.mode === 'server') return this.api('GET', 'api/assets/' + key + '/versions').catch(function () { return []; });
      try { return Promise.resolve(JSON.parse(localStorage.getItem('gc-v-' + key) || '[]')); } catch (e) { return Promise.resolve([]); }
    },
    version: function (asset, n) {
      var key = asset.pack + '/' + asset.id;
      if (this.mode === 'server') return this.api('GET', 'api/assets/' + key + '/versions/' + n);
      return this.versions(asset).then(function (vs) { var v = vs.filter(function (x) { return x.version === n; })[0]; return v && v.data; });
    }
  };

  /* ============================================================ điều hướng */
  // Hai khu tách bạch: THƯ VIỆN = thành phẩm, duyệt theo nhóm và lấy về dùng (ảnh, mã);
  // XƯỞNG = nơi tạo lập (bàn phối, kho linh kiện, khung chuyển động, AI, cổng kiểm). Không trộn hai việc trên một trang.
  var NAV = [
    ['lib', 'Thư viện', 'thành phẩm · lấy về dùng', [['lib-characters', 'Nhân vật'], ['lib-items', 'Trang bị'], ['lib-scenes', 'Cảnh']]],
    ['fab', 'Xưởng', 'tạo lập · phối · kiểm', [['characters', 'Bàn phối nhân vật'], ['items', 'Bàn phối trang bị'], ['scenes', 'Bàn phối cảnh'],
      ['library', 'Kho linh kiện & phông'], ['poses', 'Khung tư thế & hoạt động'], ['states', 'Khung biểu cảm & động tác'],
      ['workshop', 'Xưởng AI (chat)'], ['director', 'Đạo diễn AI'], ['gates', 'Cổng kiểm & hiệu năng']]],
    ['sys', 'Hệ thống', '', [['ai', 'Cài đặt AI'], ['update', 'Cập nhật']]]
  ];
  var PAGE_ALIAS = { character: 'characters', export: 'lib-characters' };
  function zoneOf(page) {
    var p = PAGE_ALIAS[page] || page, z = 'lib';
    NAV.forEach(function (g) { g[3].forEach(function (it) { if (it[0] === p) z = g[0]; }); });
    return z;
  }
  var route = { page: 'lib-characters' };
  var cleanup = [];
  function onLeave(fn) { cleanup.push(fn); }
  var updateBadge = false;

  function renderNav() {
    var nav = clear($('nav'));
    var COUNT = { 'lib-characters': function () { return GC.assets().length; }, 'lib-items': function () { return GC.items().length; }, 'lib-scenes': function () { return GC.scenes().length; } };
    NAV.forEach(function (g) {
      nav.appendChild(h('div', { class: 'nav-group zone-' + g[0] }, h('b', { text: g[1] }), g[2] ? h('span', { text: g[2] }) : null));
      g[3].forEach(function (it) {
        var cur = route.page === it[0] || PAGE_ALIAS[route.page] === it[0];
        var b = h('button', { class: 'nav-item zone-' + g[0], 'aria-current': cur ? 'page' : null, onclick: function () { go({ page: it[0] }); } }, it[1]);
        if (COUNT[it[0]]) b.appendChild(h('span', { class: 'n', text: String(COUNT[it[0]]()) }));
        if (it[0] === 'update' && updateBadge) b.appendChild(h('span', { class: 'dot', title: 'Có bản mới' }));
        nav.appendChild(b);
      });
    });
  }
  function go(r) {
    cleanup.forEach(function (f) { try { f(); } catch (e) { /* bỏ qua */ } });
    cleanup = [];
    route = r;
    try { localStorage.setItem('gc-route', JSON.stringify(r)); } catch (e) { /* bỏ qua */ }
    renderNav();
    document.body.setAttribute('data-zone', zoneOf(r.page));
    clear($('actions'));
    clear($('view'));
    $('view').scrollTop = 0;
    if (updateBadge && r.page !== 'update') {
      $('view').appendChild(h('div', { class: 'banner acc', style: 'margin-bottom:12px' },
        h('span', { text: 'Có bản mới ' + updateBadge + '. Dữ liệu được sao lưu trước khi cập nhật; bản mới lỗi sẽ tự chạy lại bản cũ.' }),
        h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { go({ page: 'update' }); } }, 'Xem và cập nhật')));
    }
    (PAGES[r.page] || PAGES['lib-characters'])(r);
  }
  var ZONE_LABEL = { lib: 'Thư viện', fab: 'Xưởng', sys: 'Hệ thống' };
  function crumbs(parts) {
    var c = clear($('crumbs'));
    c.appendChild(h('span', { class: 'zone-tag', text: ZONE_LABEL[zoneOf(route.page)] }));
    parts.forEach(function (p, i) {
      if (i) c.appendChild(h('span', { class: 'sep', text: '›' }));
      c.appendChild(p.go ? h('a', { onclick: function () { go(p.go); }, text: p.t }) : h('b', { text: p.t }));
    });
  }
  function actions() { var a = $('actions'); for (var i = 0; i < arguments.length; i++) add(a, arguments[i]); }

  function mountTier(el, asset, state, opts) {
    var inst = R.mount(el, asset, state, opts);
    onLeave(function () { inst.destroy(); });
    return inst;
  }

  /* ============================================================ trang: Nhân vật */
  var PAGES = {};
  PAGES.characters = function () {
    crumbs([{ t: 'Bàn phối nhân vật' }]);
    actions(h('button', { class: 'btn', onclick: function () { go({ page: 'lib-characters' }); } }, 'Xem trong Thư viện ›'), h('button', { class: 'btn primary', onclick: newCharacter }, '+ Nhân vật mới'));
    var q = '', sel = GC.assets()[0];
    var search = h('input', { type: 'search', placeholder: 'Lọc: tên, phe, thư viện, trạng thái…', style: 'width:320px', oninput: function () { q = search.value.trim().toLowerCase(); paint(); } });
    var table = h('table', { class: 'grid' });
    var insp = h('div', { class: 'stack' });
    $('view').appendChild(h('div', { class: 'split' },
      h('div', { class: 'stack' }, h('div', { class: 'row' }, search, h('span', { class: 'note', id: 'cnt' })), h('div', { class: 'panel scroll' }, table)),
      h('div', { class: 'sticky' }, insp)));
    var STATUS = { draft: ['Nháp', 'chip'], review: ['Chờ duyệt', 'chip warn'], approved: ['Đã duyệt', 'chip ok'] };
    function paint() {
      clear(table);
      var cols = ['', '', 'Tên', 'Hán', 'Phe', 'Vai', 'Thư viện', 'Trạng thái', 'Bản', 'Cổng kiểm'];
      var lt = h('tr', { class: 'letters' });
      cols.forEach(function (c, i) { lt.appendChild(h('td', { text: i > 1 ? String.fromCharCode(63 + i) : '' })); });
      table.appendChild(lt);
      var hd = h('tr');
      cols.forEach(function (c) { hd.appendChild(h('th', { text: c })); });
      table.appendChild(hd);
      var list = GC.assets().filter(function (a) {
        if (!q) return true;
        return [a.name, a.han, a.faction, a.role, a.pack, a.status, a.id].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      $('cnt').textContent = list.length + ' / ' + GC.assets().length + ' nhân vật';
      list.forEach(function (a) {
        var g = GC.gate(a), okN = g.filter(function (x) { return x.ok; }).length;
        var avCell = h('td', { style: 'width:44px' });
        var av = h('div', { class: 'av', style: '--own:' + ownOf(a) });
        avCell.appendChild(av);
        R.image(av, a, 'normal', { crop: true, noShadow: true });
        var st = STATUS[a.status] || STATUS.draft;
        var tr = h('tr', { class: 'click', 'aria-selected': sel && sel.key === a.key ? 'true' : null,
          onclick: function () { sel = a; paint(); },
          ondblclick: function () { go({ page: 'character', key: a.key, tab: 'look' }); } },
          h('td', { class: 'id', text: a.code || a.id }), avCell,
          h('td', null, h('b', { text: a.name })), h('td', { class: 'k', text: a.han || '' }), h('td', { text: a.faction || '' }),
          h('td', { text: a.role || '' }), h('td', null, h('span', { class: 'tag', text: a.pack })),
          h('td', null, h('span', { class: st[1], text: st[0] })), h('td', { class: 'v', text: 'v' + (a.version || 1) }),
          h('td', null, h('span', { class: 'chip ' + (okN === g.length ? 'ok' : 'bad'), text: okN + '/' + g.length })));
        table.appendChild(tr);
      });
      paintInspector();
    }
    var instP = null;
    function paintInspector() {
      if (instP) { instP.destroy(); instP = null; }
      clear(insp);
      if (!sel) { insp.appendChild(h('div', { class: 'panel empty', text: 'Chọn một nhân vật.' })); return; }
      var stg = h('div', { class: 'stage preview' });
      var bar = h('div', { class: 'statebar' });
      var pnl = h('div', { class: 'panel' }, h('h3', null, sel.name, h('span', { class: 'r mono', text: sel.key })), stg,
        h('div', { class: 'pad stack' }, bar,
          h('div', { class: 'note', text: (sel.identity && sel.identity.p1 ? 'Nhận diện: ' + sel.identity.p1 + '. ' : '') + (sel.persona || '') }),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: function () { go({ page: 'character', key: sel.key, tab: 'look' }); } }, 'Mở hồ sơ'),
            h('button', { class: 'btn', onclick: function () { duplicate(sel); } }, 'Nhân bản sang "Của tôi"'))));
      insp.appendChild(pnl);
      instP = R.full(stg, sel, 'normal', { force: true });
      LIB.stateOrder.forEach(function (s) {
        var b = h('button', { 'aria-pressed': String(s === 'normal'), onclick: function () {
          instP.setState(s);
          Array.prototype.forEach.call(bar.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        } }, stateLabel(s));
        bar.appendChild(b);
      });
    }
    onLeave(function () { if (instP) instP.destroy(); });
    paint();
  };

  function uniqueId(base) {
    var id = base, n = 2;
    while (GC.ASSETS[MY_PACK + '/' + id]) id = base + '-' + n++;
    return id;
  }
  function nextCode() { return 'CH-' + String(GC.assets().length + 1).padStart(4, '0'); }
  function duplicate(a) {
    var c = clone(a);
    c.id = uniqueId(a.id); c.code = nextCode(); c.name = a.name + ' (bản của tôi)'; c.status = 'draft'; c.version = 0;
    delete c.key; delete c.savedAt;
    Store.save(c, 'Nhân bản từ ' + a.key).then(function (rec) { toast('Đã nhân bản vào thư viện "Của tôi".'); go({ page: 'character', key: rec.key, tab: 'look' }); });
  }
  function newCharacter() {
    var base = GC.ASSETS['afi.tamquoc/linh-que'] || GC.assets()[0];
    var c = clone(base);
    c.id = uniqueId('nhan-vat-moi'); c.code = nextCode(); c.name = 'Nhân vật mới'; c.han = ''; c.faction = ''; c.role = '';
    c.status = 'draft'; c.version = 0; c.expressions = {}; c.lines = {}; c.persona = '';
    c.identity = { p1: '', must: [], source: '' };
    delete c.key; delete c.note;
    Store.save(c, 'Tạo mới').then(function (rec) { go({ page: 'character', key: rec.key, tab: 'look' }); });
  }

  /* ============================================================ trang: Hồ sơ nhân vật */
  PAGES.character = function (r) {
    var orig = GC.ASSETS[r.key];
    if (!orig) return go({ page: 'characters' });
    var w = clone(orig);       // bản làm việc
    w.pack = orig.pack; w.key = orig.key;
    var dirty = false, pState = 'normal';
    crumbs([{ t: 'Bàn phối nhân vật', go: { page: 'characters' } }, { t: orig.name }]);
    var saveBtn = h('button', { class: 'btn primary', disabled: true, onclick: save }, 'Lưu phiên bản');
    var undoBtn = h('button', { class: 'btn', disabled: true, onclick: function () { go(r); } }, 'Huỷ thay đổi');
    var official = orig.pack !== MY_PACK;
    actions(h('span', { class: 'tag', text: orig.pack + ' · v' + (orig.version || 1) }), undoBtn, saveBtn);

    var left = h('div', { class: 'stack' });
    var stg = h('div', { class: 'stage preview' });
    var bar = h('div', { class: 'statebar' });
    var sizes = h('div', { class: 'sizes' });
    var gateBox = h('div');
    $('view').appendChild(h('div', { class: 'detail' }, left,
      h('div', { class: 'sticky stack' },
        h('div', { class: 'panel' }, h('h3', null, 'Xem trước', h('span', { class: 'r note', id: 'pvState' })), stg, h('div', { class: 'pad stack' }, bar, sizes)),
        h('div', { class: 'panel' }, h('h3', null, 'Cổng kiểm'), gateBox))));

    var inst = R.full(stg, w, pState, { force: true });
    onLeave(function () { inst.destroy(); });
    LIB.stateOrder.forEach(function (s) {
      bar.appendChild(h('button', { 'data-s': s, 'aria-pressed': String(s === pState), onclick: function () { setPState(s); } }, stateLabel(s)));
    });
    function setPState(s) {
      pState = s; inst.setState(s);
      Array.prototype.forEach.call(bar.children, function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-s') === s)); });
      $('pvState').textContent = stateLabel(s);
      paintSizes();
    }
    function paintSizes() {
      clear(sizes);
      [[96, false], [64, true], [32, true], [20, true]].forEach(function (s) {
        var box = h('div', { class: s[1] ? 'av' : 'stage', style: 'width:' + s[0] + 'px;height:' + (s[1] ? s[0] : Math.round(s[0] * 1.08)) + 'px;border-radius:' + (s[1] ? '50%' : '4px') + ';--own:' + ownOf(orig) });
        sizes.appendChild(h('figure', null, box, h('figcaption', { text: s[0] + ' px' })));
        R.image(box, w, pState, { crop: s[1], noShadow: s[1] });
      });
    }
    function changed(rebuild) {
      dirty = true; saveBtn.disabled = false; undoBtn.disabled = false;
      R.invalidate(w);
      w.version = (orig.version || 0) + 0.001;   // chữ ký mới cho cache ảnh trong lúc chỉnh
      inst.setAsset(w);
      paintSizes(); paintGates();
      if (rebuild) paintTab();
    }
    function paintGates() {
      clear(gateBox);
      var t = h('table', { class: 'grid' });
      GC.gate(w, { poses: true }).forEach(function (g) {
        t.appendChild(h('tr', null, h('td', { text: g.label }), h('td', { class: g.ok ? 'ok' : 'bad', style: 'font-weight:600', text: g.ok ? 'Đạt' : 'Không đạt' })));
        if (!g.ok) t.appendChild(h('tr', null, h('td', { colspan: '2', class: 'note', text: g.detail })));
      });
      gateBox.appendChild(t);
    }
    function save() {
      var bad = GC.gate(w).filter(function (g) { return !g.ok && g.id !== 'identity'; });
      if (bad.length) { toast('Chưa lưu: không qua cổng "' + bad[0].label + '".'); return; }
      var note = prompt ? null : null;
      var doc = clone(w); doc.version = orig.version || 0;
      var target = doc;
      if (official && Store.mode === 'browser') { /* bản xem thử: lưu đè trong trình duyệt */ }
      Store.save(target, 'Chỉnh trong Studio').then(function (rec) {
        R.invalidate(rec);
        toast('Đã lưu ' + rec.name + ' · v' + rec.version + (Store.mode === 'browser' ? ' (trong trình duyệt này)' : ''));
        go({ page: 'character', key: rec.key, tab: r.tab });
      }).catch(function (e) { toast('Không lưu được: ' + e.message); });
    }
    onLeave(function () { if (dirty) R.invalidate(orig); });

    var TABS = [['look', 'Ngoại hình'], ['expr', 'Biểu cảm'], ['profile', 'Hồ sơ nhận diện'], ['history', 'Phiên bản'], ['json', 'JSON']];
    var tabBar = h('div', { class: 'tabs', role: 'tablist' });
    var body = h('div');
    left.appendChild(h('div', null, tabBar, body));
    TABS.forEach(function (t) {
      tabBar.appendChild(h('button', { role: 'tab', 'aria-selected': String((r.tab || 'look') === t[0]), onclick: function () {
        r.tab = t[0];
        Array.prototype.forEach.call(tabBar.children, function (x, i) { x.setAttribute('aria-selected', String(TABS[i][0] === t[0])); });
        paintTab();
      } }, t[1]));
    });

    function paintTab() {
      clear(body);
      ({ look: tabLook, expr: tabExpr, profile: tabProfile, history: tabHistory, json: tabJSON })[r.tab || 'look']();
    }

    /* ---- Ngoại hình: linh kiện + tham số + màu */
    function rangeInput(def, val, on) {
      var out = h('span', { class: 'mono note', style: 'display:inline-block;min-width:38px;text-align:right', text: String(val) });
      var inp = h('input', { type: 'range', min: def.min, max: def.max, step: def.step, value: val, 'aria-label': def.label, oninput: function () { out.textContent = inp.value; on(+inp.value); } });
      return h('span', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, h('span', { class: 'note', style: 'min-width:120px', text: def.label }), inp, out);
    }
    function setParam(slot, k, v) {
      w.look.params = w.look.params || {};
      w.look.params[slot] = w.look.params[slot] || {};
      w.look.params[slot][k] = v;
      changed(false);
    }
    function tabLook() {
      var t = h('table', { class: 'grid' });
      t.appendChild(h('tr', null, h('th', { text: '' }), h('th', { text: 'Bộ phận' }), h('th', { text: 'Linh kiện' }), h('th', { text: 'Tham số' })));
      var n = 1;
      function row(label, control, params) {
        t.appendChild(h('tr', null, h('td', { class: 'id', text: 'SL-' + String(n++).padStart(2, '0') }), h('td', { class: 'k', text: label }), h('td', null, control), h('td', null, params || h('span', { class: 'muted', text: '—' }))));
      }
      function sel(options, value, on, label) {
        var s = h('select', { 'aria-label': label, onchange: function () { on(s.value); } });
        options.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === value) op.selected = true; s.appendChild(op); });
        return s;
      }
      function paramsOf(slot, defs) {
        if (!defs) return null;
        var vals = GC.paramValues(w, slot, defs);
        return h('div', { class: 'stack', style: 'gap:4px' }, Object.keys(defs).map(function (k) { return rangeInput(defs[k], vals[k], function (v) { setParam(slot, k, v); }); }));
      }
      row('Kiểu mắt', sel(Object.keys(LIB.eyeStyles).map(function (k) { return [k, LIB.eyeStyles[k].label]; }), w.look.eyes, function (v) { w.look.eyes = v; changed(false); }, 'Kiểu mắt'), paramsOf('eyes', GC.FACE_PARAMS.eyes));
      row('Kiểu mày', sel(Object.keys(LIB.browStyles).map(function (k) { return [k, LIB.browStyles[k].label]; }), w.look.brows, function (v) { w.look.brows = v; changed(false); }, 'Kiểu mày'), paramsOf('brows', GC.FACE_PARAMS.brows));
      row('Miệng', h('span', { class: 'note', text: 'theo trạng thái' }), paramsOf('mouth', GC.FACE_PARAMS.mouth));
      row('Tỉ lệ chibi', h('span', { class: 'note', text: 'khung xương' }), paramsOf('rig', GC.FACE_PARAMS.rig));
      Object.keys(LIB.slots).forEach(function (slot) {
        var cur = GC.partRef(w, slot);
        var p = GC.getPart(slot, cur, w.pack);
        var opts = GC.partsOfSlot(slot).map(function (x) { return [x.id, x.label + (x.pack !== 'afi.core' ? ' · ' + x.pack : '')]; });
        row(LIB.slots[slot].label, sel(opts, cur, function (v) { w.look.parts[slot] = v; changed(true); }, LIB.slots[slot].label), p && p.params ? paramsOf(slot, p.params) : null);
      });
      var pal = h('table', { class: 'grid' });
      pal.appendChild(h('tr', null, h('th', { text: 'Màu' }), h('th', { text: '' }), h('th', { text: 'Mã' }), h('th', { text: 'Nguồn' })));
      [['skin', 'Da'], ['skinShade', 'Bóng da'], ['hair', 'Tóc, râu, mày'], ['iris', 'Mống mắt'], ['robe', 'Áo'], ['inner', 'Áo lót'], ['trim', 'Viền áo'],
       ['armor', 'Giáp'], ['hat', 'Mũ / khăn'], ['accent', 'Điểm nhấn'], ['metal', 'Kim loại'], ['wood', 'Gỗ'], ['tassel', 'Tua'], ['boots', 'Giày'], ['blush', 'Má hồng']].forEach(function (k) {
        var own = (w.look.palette || {})[k[0]];
        var cur = own || LIB.defaults[k[0]];
        var code = h('td', { class: 'v', text: cur });
        var src = h('td', { class: 'note', text: own ? 'nhân vật' : 'mặc định kho' });
        var inp = h('input', { type: 'color', value: cur, 'aria-label': k[1], oninput: function () {
          w.look.palette = w.look.palette || {}; w.look.palette[k[0]] = inp.value; code.textContent = inp.value; src.textContent = 'nhân vật'; changed(false);
        } });
        pal.appendChild(h('tr', null, h('td', { class: 'k', text: k[1] }), h('td', null, inp), code, src));
      });
      body.appendChild(h('div', { class: 'stack' }, h('div', { class: 'panel scroll' }, h('h3', null, 'Linh kiện & tham số'), t), h('div', { class: 'panel scroll' }, h('h3', null, 'Bảng màu'), pal)));
    }

    /* ---- Biểu cảm: lưới 18 trạng thái + ghi đè có nguồn */
    function tabExpr() {
      var grid = h('div', { class: 'states' });
      var editor = h('div', { class: 'panel' });
      body.appendChild(h('div', { class: 'stack' },
        h('div', { class: 'note', text: 'Mỗi biểu cảm lấy từ kho chung; trait theo bộ phận và ghi đè riêng của nhân vật này đè lên trên. Ô có nhãn "riêng" là đã ghi đè.' }),
        grid, editor));
      function paintGrid() {
        clear(grid);
        LIB.stateOrder.forEach(function (s) {
          var im = h('div', { class: 'im stage' });
          var cell = h('button', { class: 'state-cell', 'aria-pressed': String(s === pState), onclick: function () { setPState(s); paintGrid(); paintEditor(); } },
            im, h('div', { class: 'lb', text: stateLabel(s) }), (w.expressions || {})[s] ? h('span', { class: 'ov', text: 'riêng' }) : null);
          grid.appendChild(cell);
          R.image(im, w, s, { noShadow: true });
        });
      }
      function paintEditor() {
        clear(editor);
        var st = GC.resolveState(w, pState);
        var ov = (w.expressions || {})[pState] || {};
        editor.appendChild(h('h3', null, 'Biểu cảm: ' + stateLabel(pState), h('span', { class: 'r' },
          h('button', { class: 'btn sm', disabled: !Object.keys(ov).length, onclick: function () { delete w.expressions[pState]; changed(false); paintGrid(); paintEditor(); } }, 'Bỏ ghi đè'))));
        var t = h('table', { class: 'grid' });
        t.appendChild(h('tr', null, h('th', { text: 'Thành phần' }), h('th', { text: 'Đang dùng' }), h('th', { text: 'Nguồn' }), h('th', { text: 'Ghi đè cho nhân vật này' })));
        function setOv(k, v) {
          w.expressions = w.expressions || {};
          var o = w.expressions[pState] = w.expressions[pState] || {};
          if (v) o[k] = v; else delete o[k];
          if (!Object.keys(o).length) delete w.expressions[pState];
          changed(false); paintGrid(); paintEditor();
        }
        [['eyes', 'Dáng mắt', Object.keys(LIB.eyePoses)], ['brows', 'Dáng mày', Object.keys(LIB.browPoses)], ['mouth', 'Miệng', Object.keys(LIB.mouths)],
         ['motion', 'Động tác', Object.keys(LIB.motions)]].forEach(function (c) {
          var s = h('select', { 'aria-label': c[1], onchange: function () { setOv(c[0], s.value); } });
          s.appendChild(h('option', { value: '', text: '— kế thừa —' }));
          c[2].forEach(function (id) {
            var lbl = c[0] === 'motion' ? LIB.motions[id].label + ' (' + id + ')' : c[0] === 'brows' ? (LIB.browPoses[id].label || id) : id;
            var op = h('option', { value: id, text: lbl }); if (ov[c[0]] === id) op.selected = true; s.appendChild(op);
          });
          var shown = c[0] === 'motion' ? (LIB.motions[st.motion] || {}).label : st[c[0]];
          t.appendChild(h('tr', null, h('td', { class: 'k', text: c[1] }), h('td', { class: 'v', text: shown }),
            h('td', null, h('span', { class: 'tag' + (st.src[c[0]] !== 'Kho' ? ' acc' : ''), text: st.src[c[0]] })), h('td', null, s)));
        });
        var chips = h('div', { class: 'fxchips' });
        Object.keys(LIB.fx).forEach(function (id) {
          var on = st.fx.indexOf(id) >= 0;
          chips.appendChild(h('button', { 'aria-pressed': String(on), title: id, onclick: function () {
            w.expressions = w.expressions || {};
            var o = w.expressions[pState] = w.expressions[pState] || {};
            var cur = GC.resolveState(w, pState).fx.slice();
            o.fx = on ? cur.filter(function (x) { return x !== id; }) : cur.concat(id);
            delete o.fxAdd; delete o.fxRemove;
            changed(false); paintGrid(); paintEditor();
          } }, LIB.fx[id].label || id));
        });
        t.appendChild(h('tr', null, h('td', { class: 'k', text: 'Hiệu ứng' }), h('td', { colspan: '2' }, h('span', { class: 'tag' + (st.src.fx !== 'Kho' ? ' acc' : ''), text: st.src.fx })), h('td', null, chips)));
        t.appendChild(h('tr', null, h('td', { class: 'k', text: 'Trait áp dụng' }), h('td', { colspan: '3', class: 'v', text: st.traits.join(', ') || '—' })));
        var lines = (w.lines || {})[pState] || [];
        var ta = h('textarea', { rows: '2', placeholder: 'Mỗi dòng một câu cửa miệng cho trạng thái này (AI đạo diễn sẽ tham khảo)', oninput: function () {
          w.lines = w.lines || {}; var v = ta.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          if (v.length) w.lines[pState] = v; else delete w.lines[pState];
          dirty = true; saveBtn.disabled = false; undoBtn.disabled = false;
        } });
        ta.value = lines.join('\n');
        t.appendChild(h('tr', null, h('td', { class: 'k', text: 'Câu cửa miệng' }), h('td', { colspan: '3' }, ta)));
        editor.appendChild(h('div', { class: 'scroll' }, t));
      }
      paintGrid(); paintEditor();
    }

    /* ---- Hồ sơ nhận diện */
    function tabProfile() {
      function field(label, key, obj, attrs) {
        var inp = h(attrs && attrs.area ? 'textarea' : 'input', Object.assign({ type: 'text', 'aria-label': label, rows: '2', oninput: function () { (obj || w)[key] = inp.value; dirty = true; saveBtn.disabled = false; undoBtn.disabled = false; if (key === 'name') crumbs([{ t: 'Bàn phối nhân vật', go: { page: 'characters' } }, { t: inp.value }]); } }));
        inp.value = (obj || w)[key] || '';
        return [h('label', { text: label }), inp];
      }
      w.identity = w.identity || { must: [] };
      var status = h('select', { onchange: function () { w.status = status.value; dirty = true; saveBtn.disabled = false; undoBtn.disabled = false; } });
      [['draft', 'Nháp'], ['review', 'Chờ duyệt'], ['approved', 'Đã duyệt']].forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (w.status === o[0]) op.selected = true; status.appendChild(op); });
      var must = h('div', { class: 'fxchips' });
      var cand = Object.keys(LIB.slots).map(function (s) { return s + ':' + GC.partRef(w, s); }).filter(function (x) { return !/:none$|:undefined$/.test(x); }).concat('eyes:' + w.look.eyes);
      cand.forEach(function (c) {
        var on = (w.identity.must || []).indexOf(c) >= 0;
        must.appendChild(h('button', { 'aria-pressed': String(on), onclick: function () {
          var m = w.identity.must = (w.identity.must || []).slice();
          if (on) m.splice(m.indexOf(c), 1); else m.push(c);
          changed(true);
        } }, c));
      });
      body.appendChild(h('div', { class: 'panel pad' }, h('div', { class: 'kv' },
        field('Tên', 'name'), field('Tên Hán', 'han'), field('Phe', 'faction'), field('Vai', 'role'), field('Mã', 'code'),
        h('label', { text: 'Trạng thái duyệt' }), status,
        field('Tính cách (cho AI)', 'persona', null, { area: true }),
        field('Nhận diện chính (32 px)', 'p1', w.identity), h('label', { text: 'Dấu nhận diện bắt buộc' }), h('div', null, must, h('div', { class: 'note', text: 'Cổng kiểm sẽ chặn nếu công thức mất một trong các dấu này.' })),
        field('Nguồn tư liệu', 'source', w.identity))));
    }

    /* ---- Phiên bản */
    function tabHistory() {
      var box = h('div', { class: 'panel' }, h('h3', null, 'Lịch sử phiên bản', h('span', { class: 'r note', text: Store.mode === 'server' ? 'lưu trên máy' : 'lưu trong trình duyệt' })));
      body.appendChild(box);
      Store.versions(orig).then(function (vs) {
        if (!vs.length) { box.appendChild(h('div', { class: 'empty', text: 'Chưa có bản lưu nào. Bản đang dùng là bản gốc của thư viện ' + orig.pack + '.' })); return; }
        var t = h('table', { class: 'grid' });
        t.appendChild(h('tr', null, h('th', { text: 'Bản' }), h('th', { text: 'Lúc lưu' }), h('th', { text: 'Ghi chú' }), h('th', { text: '' })));
        vs.forEach(function (v) {
          t.appendChild(h('tr', null, h('td', { class: 'v', text: 'v' + v.version }), h('td', { class: 'nw', text: fmtTime(v.savedAt) }), h('td', { text: v.note || '—' }),
            h('td', null, h('button', { class: 'btn sm', disabled: v.version === orig.version, onclick: function () {
              Store.version(orig, v.version).then(function (data) {
                if (!data) return;
                w = clone(data); w.pack = orig.pack; w.key = orig.key; delete w._note;
                changed(false); toast('Đã nạp v' + v.version + ' vào bản làm việc. Bấm "Lưu phiên bản" để khôi phục.');
              });
            } }, v.version === orig.version ? 'Đang dùng' : 'Nạp bản này'))));
        });
        box.appendChild(h('div', { class: 'scroll' }, t));
      });
    }

    /* ---- JSON */
    function tabJSON() {
      var ta = h('textarea', { class: 'code', rows: '28', spellcheck: 'false', 'aria-label': 'JSON công thức' });
      ta.value = JSON.stringify(Object.assign({}, w, { key: undefined }), null, 2);
      var errs = h('ul', { class: 'errs' });
      body.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Công thức JSON', h('span', { class: 'r' }, h('button', { class: 'btn sm', onclick: function () {
        clear(errs);
        var o; try { o = JSON.parse(ta.value); } catch (e) { errs.appendChild(h('li', { text: 'JSON lỗi cú pháp: ' + e.message })); return; }
        if (!o.look) { errs.appendChild(h('li', { text: 'Thiếu "look".' })); return; }
        o.id = w.id; o.pack = w.pack; o.key = w.key;
        var g = GC.gate(o).filter(function (x) { return !x.ok && (x.id === 'parts' || x.id === 'params' || x.id === 'states'); });
        if (g.length) { g.forEach(function (x) { errs.appendChild(h('li', { text: x.label + ': ' + x.detail })); }); return; }
        w = o; changed(false); toast('Đã áp JSON vào bản làm việc.');
      } }, 'Áp JSON'))), h('div', { class: 'pad' }, ta, errs)));
    }

    setPState(pState);
    paintGates();
    paintTab();
  };

  /* ============================================================ trang: Thư viện linh kiện */
  PAGES.library = function () {
    crumbs([{ t: 'Kho linh kiện & phông' }]);
    var packs = Object.keys(GC.PACKS).map(function (k) { return GC.PACKS[k]; });
    var pt = h('table', { class: 'grid' });
    pt.appendChild(h('tr', null, ['Thư viện', 'Mã', 'Nhóm', 'Chủ', 'Quyền xem', 'Phiên bản', 'Nội dung', 'License'].map(function (c) { return h('th', { text: c }); })));
    var GROUP = { official: 'Chính thức', mine: 'Của tôi', team: 'Nhóm', community: 'Cộng đồng' };
    var VIS = { public: 'Công khai', private: 'Riêng', team: 'Nhóm' };
    packs.forEach(function (p) {
      var cnt = Object.keys(p.counts).map(function (k) { return p.counts[k] + ' ' + k; }).join(' · ');
      pt.appendChild(h('tr', null, h('td', null, h('b', { text: p.name })), h('td', { class: 'v', text: p.id }), h('td', { text: GROUP[p.group] || p.group }),
        h('td', { text: p.owner }), h('td', { text: VIS[p.visibility] || p.visibility }), h('td', { class: 'v', text: p.version }), h('td', { class: 'note', text: cnt || '—' }), h('td', { class: 'note', text: p.license })));
    });
    // Ma-nơ-canh chuẩn: mọi bộ phận mặc định của khung, không thuộc nhân vật nào — soát linh kiện trên nền trung tính
    function mannequin(slot, p) {
      var m = { id: 'mannequin', name: 'Ma-nơ-canh', pack: 'afi.core', version: 1, kind: 'character',
        look: { eyes: 'round', brows: 'normal', parts: {}, params: {}, palette: {} }, expressions: {}, identity: { must: [] } };
      m.key = 'studio/mannequin-' + slot + '-' + p.pack + '-' + p.id;
      m.look.parts[slot] = p.pack + '/' + p.id;
      if (slot === 'hair') m.look.parts.hat = 'none';
      return m;
    }
    var bench = h('div', { class: 'stack' });
    var t = h('table', { class: 'grid' });
    var cols = ['', 'Xem', 'Bộ phận', 'Mã', 'Tên', 'Thư viện', 'Tham số', 'Dùng bởi'];
    var lt = h('tr', { class: 'letters' });
    cols.forEach(function (c, i) { lt.appendChild(h('td', { text: i ? String.fromCharCode(64 + i) : '' })); });
    t.appendChild(lt);
    t.appendChild(h('tr', null, cols.map(function (c) { return h('th', { text: c }); })));
    var n = 0;
    Object.keys(LIB.slots).forEach(function (slot) {
      GC.partsOfSlot(slot).forEach(function (p) {
        if (p.id === 'none') return;
        n++;
        var th = h('div', { class: 'thumb' });
        var r = mannequin(slot, p);
        var users = GC.assets().filter(function (a) { var v = GC.partRef(a, slot); return v === p.id || v === p.pack + '/' + p.id; }).map(function (a) { return a.name; });
        t.appendChild(h('tr', { style: 'cursor:pointer', title: 'Bấm để soát trên ma-nơ-canh', onclick: (function (slot0, p0) { return function () { showBench(slot0, p0); }; })(slot, p) }, h('td', { class: 'id', text: 'PT-' + String(n).padStart(4, '0') }), h('td', null, th), h('td', { class: 'k', text: LIB.slots[slot].label }),
          h('td', { class: 'v', text: p.id }), h('td', { class: 'nw' }, p.label, p.views && p.views.q45 ? h('span', { class: 'tag', style: 'margin-left:6px', title: 'Có bản vẽ nghiêng 45° thật', text: '45°' }) : null), h('td', null, h('span', { class: 'tag', text: p.pack })),
          h('td', { class: 'note', text: p.params ? Object.keys(p.params).map(function (k) { return p.params[k].label; }).join(', ') : '—' }),
          h('td', { class: 'note', text: users.join(', ') || '—' })));
        R.image(th, r, 'normal', { crop: ['head', 'mask', 'hair', 'hat'].indexOf(slot) >= 0, noShadow: true });
      });
    });
    // Bàn soát (bước 4 của quy trình tạo lập — docs/QUY-TRINH-LINH-KIEN.md): linh kiện trên ma-nơ-canh × góc nhìn × tình huống
    var VIEWS = [['front', 'Chính diện'], ['left', '3/4 trái'], ['left45', '45° trái'], ['right45', '45° phải']];
    var CASES = [['normal', null, 'Đứng'], ['shock', null, 'Kinh ngạc'], ['vow', 'run', 'Chạy'], ['normal', 'sit-floor', 'Ngồi']];
    function showBench(slot, p) {
      clear(bench);
      var m = mannequin(slot, p);
      var g = h('div', { style: 'display:grid;grid-template-columns:70px repeat(' + VIEWS.length + ',1fr);gap:4px;align-items:center' });
      g.appendChild(h('div'));
      VIEWS.forEach(function (v) { g.appendChild(h('div', { class: 'note', style: 'text-align:center', text: v[1] })); });
      CASES.forEach(function (c) {
        g.appendChild(h('div', { class: 'note', text: c[2] }));
        VIEWS.forEach(function (v) {
          var cell = h('div', { class: 'stage', style: 'height:92px;border-radius:4px;overflow:hidden' });
          var dir = { view: v[0] }; if (c[1]) dir.activity = c[1];
          R.image(cell, m, c[0], { director: dir });
          g.appendChild(cell);
        });
      });
      var has45 = !!(p.views && p.views.q45);
      var checks = [
        ['Bản vẽ chính diện', true, 'toạ độ khung 200 × 240, lớp đúng bộ phận'],
        ['Bản vẽ 45°', has45, has45 ? 'views.q45 — vẽ thật' : 'chưa có: engine đang trượt tạm (bắt buộc với thư viện chính thức)'],
        ['Tham số', true, p.params ? Object.keys(p.params).map(function (k) { return p.params[k].label + ' ' + p.params[k].min + '–' + p.params[k].max; }).join(', ') : 'không có'],
        ['License', !!p.license, p.license || 'thiếu'],
        ['Nguồn', !!p.source, p.source || 'thiếu']
      ];
      bench.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Bàn soát · ' + p.label, h('span', { class: 'r mono', text: slot + ':' + p.id })),
        h('div', { class: 'pad stack' }, g,
          h('table', { class: 'grid' }, checks.map(function (c) { return h('tr', null, h('td', { text: c[1] ? '✓' : '✗', style: 'color:' + (c[1] ? 'var(--ok, #2e8b57)' : 'var(--danger)') }), h('td', { text: c[0] }), h('td', { class: 'note', text: c[2] })); })),
          h('div', { class: 'note', text: 'Quy trình: vẽ chính diện → vẽ 45° (face45 / body45 / vẽ tay) → soát ở đây → test → phát hành. Chi tiết: docs/QUY-TRINH-LINH-KIEN.md' }))));
    }
    // Phông cảnh: nguyên liệu của cảnh — soát trong cảnh trung tính kèm diễn viên, ngày và đêm
    var S = GC.SCENE, ft = h('table', { class: 'grid' }), nf = 0;
    ft.appendChild(h('tr', null, ['', 'Xem', 'Lớp', 'Mã', 'Tên', 'Thư viện', 'Dùng trong cảnh'].map(function (c) { return h('th', { text: c }); })));
    function benchScene(slot, p, extra) {
      var sc = { key: 'bench/' + slot + '-' + p.pack + '-' + p.id, id: 'bench', layers: { sky: { part: 'afi.scenes/plain', dx: 0 }, ground: { part: 'afi.scenes/grass', dx: 0 } }, deco: [], palette: {}, time: 'day', weather: 'clear', spots: S.spotOrder.slice() };
      var ref = p.pack + '/' + p.id;
      if (slot === 'deco') sc.deco = [{ part: ref, x: 150, y: 300, scale: 1, flip: false, z: 'back' }, { part: ref, x: 500, y: 290, scale: 0.7, flip: true, z: 'back' }];
      else sc.layers[slot] = { part: ref, dx: 0 };
      return GC.sceneSvg(sc, extra);
    }
    Object.keys(S.slots).forEach(function (slot) {
      GC.scenery(slot).forEach(function (p) {
        nf++;
        var ref = p.pack + '/' + p.id;
        var used = GC.scenes().filter(function (sc) { return Object.keys(sc.layers).some(function (k) { return sc.layers[k].part === ref; }) || sc.deco.some(function (x) { return x.part === ref; }); }).map(function (sc) { return sc.name; });
        ft.appendChild(h('tr', { style: 'cursor:pointer', title: 'Bấm để soát trong cảnh', onclick: function () { showSceneryBench(slot, p, used); } },
          h('td', { class: 'id', text: 'SC-' + String(nf).padStart(4, '0') }), h('td', null, h('img', { src: svgURL(benchScene(slot, p, { size: 120 })), alt: p.label, style: 'width:96px;display:block;border-radius:3px' })),
          h('td', { class: 'k', text: S.slots[slot].label }), h('td', { class: 'v', text: p.id }), h('td', { text: p.label }), h('td', null, h('span', { class: 'tag', text: p.pack })),
          h('td', { class: 'note', text: used.join(', ') || '—' })));
      });
    });
    function showSceneryBench(slot, p, used) {
      clear(bench);
      var demo = GC.getAsset('gia-cat-luong'), cast = demo ? [{ asset: demo, spot: 'center' }] : [];
      var checks = [['Khung', true, slot === 'deco' ? 'đạo cụ: gốc (0,0) ở chân vật' : 'toàn khung 640 × 360'], ['License', !!p.license, p.license || 'thiếu'], ['Nguồn', !!p.source, p.source || 'thiếu'], ['Dùng trong', used.length > 0, used.join(', ') || 'chưa cảnh nào']];
      bench.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Bàn soát phông · ' + p.label, h('span', { class: 'r mono', text: slot + ':' + p.id })),
        h('div', { class: 'pad stack' },
          h('img', { src: svgURL(benchScene(slot, p, { cast: cast })), alt: 'ban ngày', style: 'width:100%;border-radius:4px' }),
          h('img', { src: svgURL(benchScene(slot, p, { cast: cast, time: 'night' })), alt: 'ban đêm', style: 'width:100%;border-radius:4px' }),
          h('table', { class: 'grid' }, checks.map(function (c) { return h('tr', null, h('td', { text: c[1] ? '✓' : '✗' }), h('td', { text: c[0] }), h('td', { class: 'note', text: c[2] })); })),
          h('div', { class: 'note', text: 'Phông chỉ dùng token màu cảnh ({sky}, {grass}…) nên đổi giờ không phải vẽ lại. Tạo phông mới: agent gọi get_part_spec slot=' + slot + ' → preview_part → save_part.' }))));
    }
    $('view').appendChild(h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('div', { class: 'panel scroll' }, h('h3', null, 'Nhóm thư viện', h('span', { class: 'r note', text: 'Afi Labs lo khung chuẩn và thư viện chính thức; thứ người dùng tạo ra nằm trong thư viện của họ.' })), pt),
        h('div', { class: 'panel scroll' }, h('h3', null, 'Linh kiện nhân vật', h('span', { class: 'r note', text: n + ' linh kiện · ' + Object.keys(LIB.slots).length + ' bộ phận · bấm một dòng để soát' })), t),
        h('div', { class: 'panel scroll' }, h('h3', null, 'Phông cảnh', h('span', { class: 'r note', text: nf + ' phông · ' + Object.keys(S.slots).length + ' lớp · bấm một dòng để soát' })), ft)),
      h('div', { class: 'sticky' }, bench)));
    var first = GC.partsOfSlot('hat').filter(function (p) { return p.id !== 'none'; })[0];
    if (first) showBench('hat', first);
  };

  /* ============================================================ trang: Biểu cảm & động tác */
  PAGES.states = function () {
    crumbs([{ t: 'Khung biểu cảm & động tác' }]);
    var st = h('table', { class: 'grid' });
    st.appendChild(h('tr', null, ['Mã', 'Biểu cảm', 'Khi nào', 'Mắt', 'Mày', 'Miệng', 'Hiệu ứng', 'Động tác'].map(function (c) { return h('th', { text: c }); })));
    LIB.stateOrder.forEach(function (id) {
      var s = LIB.states[id];
      st.appendChild(h('tr', null, h('td', { class: 'v', text: id }), h('td', null, h('b', { text: s.label })), h('td', { class: 'note', text: s.hint }),
        h('td', { class: 'v', text: s.eyes }), h('td', { class: 'v', text: s.brows }), h('td', { class: 'v', text: s.mouth }), h('td', { class: 'v', text: s.fx.join(', ') || '—' }), h('td', { class: 'v', text: s.motion })));
    });
    var mt = h('table', { class: 'grid' });
    mt.appendChild(h('tr', null, ['Mã', 'Động tác', 'Chu kỳ', 'Khớp điều khiển', 'Cất đồ cầm', 'Dùng ở'].map(function (c) { return h('th', { text: c }); })));
    Object.keys(LIB.motions).forEach(function (id) {
      var m = LIB.motions[id];
      var used = LIB.stateOrder.filter(function (s) { return LIB.states[s].motion === id; }).map(stateLabel)
        .concat(LIB.traits.filter(function (t) { return Object.keys(t.over).some(function (k) { return t.over[k].motion === id; }); }).map(function (t) { return 'trait ' + t.id; }));
      mt.appendChild(h('tr', null, h('td', { class: 'v', text: id }), h('td', { text: m.label }), h('td', { class: 'v', text: m.dur + ' s' }),
        h('td', { class: 'v', text: Object.keys(m.tracks).join(', ') }), h('td', { class: 'v', text: (m.hide || []).join(', ') || '—' }), h('td', { class: 'note', text: used.join(', ') || '—' })));
    });
    var tr = h('table', { class: 'grid' });
    tr.appendChild(h('tr', null, ['Trait', 'Thư viện', 'Khi mang', 'Đổi hành vi'].map(function (c) { return h('th', { text: c }); })));
    LIB.traits.forEach(function (t) {
      tr.appendChild(h('tr', null, h('td', { text: t.label }), h('td', null, h('span', { class: 'tag', text: t.pack })),
        h('td', { class: 'v', text: Object.keys(t.if).map(function (k) { return k + ' ∈ {' + t.if[k].join(', ') + '}'; }).join('; ') }),
        h('td', { class: 'v', text: Object.keys(t.over).map(function (s) { var o = t.over[s]; return stateLabel(s) + ' → ' + (o.motion || '') + (o.fxAdd ? ' +' + o.fxAdd.join(',') : ''); }).join('; ') })));
    });
    // ma trận mắt: kiểu × dáng
    var poses = Object.keys(LIB.eyePoses), styles = Object.keys(LIB.eyeStyles);
    var mx = h('table', { class: 'grid' });
    mx.appendChild(h('tr', null, h('th', { text: 'Kiểu \\ dáng' }), poses.map(function (p) { return h('th', { text: p }); })));
    var P = Object.assign({}, LIB.defaults, { eyeArea: LIB.defaults.skin });
    styles.forEach(function (s) {
      var row = h('tr', null, h('th', { text: LIB.eyeStyles[s].label }));
      poses.forEach(function (p) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="58 86 84 44"><rect x="50" y="80" width="100" height="60" fill="' + P.skin + '"/>' +
          LIB.eyePoses[p](LIB.eyeStyles[s], -1, 80, 108, { P: P, A: GC.RIG.anchors }) + LIB.eyePoses[p](LIB.eyeStyles[s], 1, 120, 108, { P: P, A: GC.RIG.anchors }) + '</svg>';
        row.appendChild(h('td', { style: 'padding:3px' }, h('img', { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), alt: s + ' × ' + p, style: 'width:64px;height:34px;display:block' })));
      });
      mx.appendChild(row);
    });
    var prof = h('table', { class: 'grid' });
    Object.keys(LIB.profiles).forEach(function (pid) {
      var p = LIB.profiles[pid];
      prof.appendChild(h('tr', null, h('th', { colspan: '2', text: p.label })));
      p.map.forEach(function (m) { prof.appendChild(h('tr', null, h('td', { text: m[0] }), h('td', { class: 'v', text: m[1] + ' · ' + stateLabel(m[1]) }))); });
    });
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'panel scroll' }, h('h3', null, 'Biểu cảm', h('span', { class: 'r note', text: LIB.stateOrder.length + ' biểu cảm = mắt + mày + miệng + hiệu ứng + động tác' })), st),
      h('div', { class: 'split' },
        h('div', { class: 'stack' }, h('div', { class: 'panel scroll' }, h('h3', null, 'Động tác (dữ liệu keyframe trên khớp)'), mt), h('div', { class: 'panel scroll' }, h('h3', null, 'Trait theo bộ phận'), tr)),
        h('div', { class: 'stack' }, h('div', { class: 'panel scroll' }, h('h3', null, 'Hồ sơ ánh xạ cho ứng dụng'), prof))),
      h('div', { class: 'panel scroll' }, h('h3', null, 'Ma trận mắt', h('span', { class: 'r note', text: styles.length + ' kiểu × ' + poses.length + ' dáng = ' + styles.length * poses.length + ' cặp, không vẽ tay cặp nào' })), mx)));
  };



  /* ============================================================ trang: Trang bị (item — loại asset thứ hai) */
  // Item = phối: linh kiện có sẵn + bảng màu riêng + chỉ số + độ hiếm. Tự đứng được (icon, thẻ) và mặc được lên nhân vật.
  // Lưu qua cùng cổng ghi với MCP và AI (POST /api/items → mcp.saveItemChecked).
  PAGES.items = function (r) {
    crumbs([{ t: 'Bàn phối trang bị' }]);
    var I = GC.ITEM, u = function (svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); };
    var sel = GC.getItem(r.key) || GC.items()[0], who = 'quan-vu', view = 'front';
    var grid = h('div', { class: 'stack' }), insp = h('div', { class: 'stack' });
    $('view').appendChild(h('div', { class: 'split' }, grid, h('div', { class: 'sticky' }, insp)));
    function paintGrid() {
      clear(grid);
      Object.keys(I.types).forEach(function (t) {
        var list = GC.items().filter(function (i) { return i.type === t; });
        if (!list.length) return;
        list.sort(function (a, b) { return I.rarityOrder.indexOf(b.rarity) - I.rarityOrder.indexOf(a.rarity); });
        var row = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px' });
        list.forEach(function (it) {
          row.appendChild(h('button', { class: 'state-cell', 'aria-pressed': String(it === sel), title: it.key, onclick: function () { sel = it; paintGrid(); paintInsp(); } },
            h('img', { src: u(GC.itemSvg(it, { size: 112 })), alt: it.name, style: 'width:100%;display:block' }),
            h('div', { class: 'lb' }, h('b', { text: it.name }), h('div', { class: 'note', style: 'color:' + I.rarity[it.rarity].color, text: I.rarity[it.rarity].label + (it.pack === MY_PACK ? ' · của tôi' : '') }))));
        });
        grid.appendChild(h('div', { class: 'panel' }, h('h3', null, I.types[t].label, h('span', { class: 'r note', text: list.length + ' item · mặc ở ' + I.types[t].slots.join('/') })), h('div', { class: 'pad' }, row)));
      });
    }
    function paintInsp() {
      clear(insp);
      if (!sel) return;
      var it = sel, mine = it.pack === MY_PACK;
      var whoSel = h('select', { onchange: function () { who = whoSel.value; paintTry(); } });
      GC.assets().forEach(function (a) { whoSel.appendChild(h('option', { value: a.id, text: a.name, selected: a.id === who })); });
      var vs = h('div', { class: 'seg' });
      [['front', 'Chính diện'], ['left45', '45°'], ['attack', 'Tấn công'], ['run', 'Chạy']].forEach(function (v) {
        vs.appendChild(h('button', { 'aria-pressed': String(view === v[0]), onclick: function () { view = v[0]; Array.prototype.forEach.call(vs.children, function (b) { b.setAttribute('aria-pressed', String(b.textContent === v[1])); }); paintTry(); } }, v[1]));
      });
      var tryBox = h('div', { class: 'stage', style: 'height:230px;border-radius:6px;overflow:hidden' });
      function paintTry() {
        clear(tryBox);
        var base = GC.assets().filter(function (a) { return a.id === who; })[0] || GC.assets()[0];
        var a = JSON.parse(JSON.stringify(base)); a.key = 'try/' + base.id + '-' + it.key.replace(/[^a-z0-9]/gi, ''); a.version = (base.version || 1) + 1;
        a.look.equip = Object.assign({}, a.look.equip, {}); a.look.equip[it.equip.slot] = it.key;
        var d = view === 'left45' ? { view: 'left45' } : view === 'front' ? {} : { activity: view, view: 'left45' };
        R.image(tryBox, a, (LIB.activities[d.activity] || {}).state || 'normal', { director: d });
      }
      var g = GC.itemGate(it);
      insp.appendChild(h('div', { class: 'panel' }, h('h3', null, it.name, h('span', { class: 'r mono', text: it.key })),
        h('div', { class: 'pad stack' },
          h('div', { class: 'row', style: 'align-items:flex-start;gap:12px' },
            h('img', { src: u(GC.itemSvg(it, { mode: 'card' })), alt: 'thẻ ' + it.name, style: 'width:180px' }),
            h('div', { class: 'stack', style: 'flex:1' }, h('label', { class: 'note', text: 'Mặc thử lên' }), whoSel, vs, tryBox)),
          h('table', { class: 'grid' }, g.map(function (x) { return h('tr', null, h('td', { text: x.ok ? '✓' : '✗' }), h('td', { text: x.label }), h('td', { class: 'note', text: x.detail || '' })); })),
          h('div', { class: 'note', text: 'Linh kiện: ' + it.equip.slot + ' · ' + it.equip.part + (Object.keys(it.equip.palette).length ? ' · màu riêng: ' + Object.keys(it.equip.palette).join(', ') : '') + (it.lore ? ' — ' + it.lore : '') }),
          Store.mode === 'server' ? editor(it, mine) : h('div', { class: 'note', text: 'Bản xem thử: tạo/sửa item cần bản cài trên máy (hoặc agent qua MCP: save_item).' }))));
      paintTry();
    }
    function editor(it, mine) {
      var d = JSON.parse(JSON.stringify({ id: mine ? it.id : it.id + '-cua-toi', name: mine ? it.name : it.name + ' (bản của tôi)', han: it.han, type: it.type, rarity: it.rarity, equip: it.equip, stats: it.stats, description: it.description, lore: it.lore, icon: it.icon }));
      var f = h('div', { class: 'kv' });
      var name = h('input', { type: 'text', value: d.name });
      var rar = h('select'); I.rarityOrder.forEach(function (k) { rar.appendChild(h('option', { value: k, text: I.rarity[k].label, selected: k === d.rarity })); });
      var part = h('select'); GC.partsOfSlot(d.equip.slot).filter(function (p) { return p.id !== 'none'; }).forEach(function (p) { var ref = p.pack + '/' + p.id; part.appendChild(h('option', { value: ref, text: p.label + ' · ' + p.pack, selected: ref === d.equip.part })); });
      var pal = h('div', { class: 'row' });
      ['metal', 'wood', 'tassel', 'accent', 'armor', 'robe', 'trim', 'hat', 'cape', 'boots'].forEach(function (k) {
        var c = h('input', { type: 'color', value: d.equip.palette[k] || LIB.defaults[k], title: k, oninput: function () { d.equip.palette[k] = c.value; } });
        pal.appendChild(h('label', { class: 'note', style: 'display:flex;gap:4px;align-items:center' }, c, k));
      });
      var st = h('div', { class: 'row' });
      Object.keys(I.stats).forEach(function (k) {
        var n = h('input', { type: 'number', min: 0, max: 999, value: d.stats[k] || '', style: 'width:64px', oninput: function () { if (n.value === '') delete d.stats[k]; else d.stats[k] = +n.value; } });
        st.appendChild(h('label', { class: 'note', style: 'display:flex;gap:4px;align-items:center' }, I.stats[k], n));
      });
      var desc = h('input', { type: 'text', value: d.description || '', maxlength: 200, style: 'width:100%' });
      f.appendChild(h('label', { text: 'Tên' })); f.appendChild(name);
      f.appendChild(h('label', { text: 'Độ hiếm' })); f.appendChild(rar);
      f.appendChild(h('label', { text: 'Linh kiện' })); f.appendChild(part);
      f.appendChild(h('label', { text: 'Bảng màu riêng' })); f.appendChild(pal);
      f.appendChild(h('label', { text: 'Chỉ số' })); f.appendChild(st);
      f.appendChild(h('label', { text: 'Mô tả' })); f.appendChild(desc);
      var save = h('button', { class: 'btn primary', onclick: function () {
        d.name = name.value; d.rarity = rar.value; d.equip = { slot: d.equip.slot, part: part.value, params: d.equip.params, palette: d.equip.palette }; d.description = desc.value;
        Store.api('POST', 'api/items', { item: d, note: 'Sửa trong Studio' }).then(function (rec) {
          var r1 = GC.registerItem(MY_PACK, rec); sel = r1.def || sel; toast('Đã lưu ' + rec.name + ' (bản ' + rec.version + ')'); paintGrid(); paintInsp();
        }).catch(function (e) { toast(e.message); });
      } }, mine ? 'Lưu' : 'Lưu thành item của tôi');
      return h('div', { class: 'stack' }, h('div', { class: 'note', text: mine ? 'Sửa item của tôi' : 'Item chính thức: sửa sẽ tạo bản riêng trong "Của tôi" (không đè bản chính thức).' }), f, h('div', { class: 'row' }, save));
    }
    paintGrid(); paintInsp();
  };

  /* ============================================================ trang: Tư thế & hoạt động */
  // Một khung hình = biểu cảm (mặt) × tư thế nền × di chuyển × động tác (tay) + đạo cụ + hướng.
  // Lưới dùng tầng ảnh (cache, 0 chi phí mỗi khung); chỉ sân khấu bên phải diễn đủ.
  PAGES.poses = function (r) {
    crumbs([{ t: 'Khung tư thế & hoạt động' }]);
    var all = GC.assets();
    var cur = GC.ASSETS[r.key] || all[0];
    var sel = { activity: r.activity || 'walk', state: null, posture: '', move: '', motion: '', facing: 'right', view: '' };
    var selA = h('select', { 'aria-label': 'Nhân vật', onchange: function () { cur = GC.ASSETS[selA.value]; paintGrid(); play(); } });
    all.forEach(function (a) { selA.appendChild(h('option', { value: a.key, text: a.name + ' · ' + a.pack, selected: a === cur })); });
    var grid = h('div', { class: 'stack' });
    var stg = h('div', { class: 'stage preview', style: 'height:340px' });
    var info = h('div', { class: 'note' });
    function opt(sel0, list, blank) {
      var s = h('select');
      if (blank) s.appendChild(h('option', { value: '', text: blank }));
      list.forEach(function (x) { s.appendChild(h('option', { value: x[0], text: x[1] })); });
      s.value = sel0 || '';
      return s;
    }
    var sState = opt('', LIB.stateOrder.map(function (id) { return [id, stateLabel(id)]; }), 'Theo hoạt động');
    var sPost = opt('', Object.keys(LIB.postures).map(function (id) { return [id, LIB.postures[id].label]; }), 'Theo hoạt động');
    var sMove = opt('', [['none', 'Đứng yên']].concat(Object.keys(LIB.moves).map(function (id) { return [id, LIB.moves[id].label]; })), 'Theo hoạt động');
    var sMot = opt('', Object.keys(LIB.motions).map(function (id) { return [id, LIB.motions[id].label]; }), 'Theo hoạt động');
    var face = h('div', { class: 'seg' });
    [['right', 'Quay phải'], ['left', 'Quay trái']].forEach(function (f) {
      face.appendChild(h('button', { 'aria-pressed': String(sel.facing === f[0]), onclick: function () { sel.facing = f[0]; Array.prototype.forEach.call(face.children, function (b, i) { b.setAttribute('aria-pressed', String(i === (f[0] === 'right' ? 0 : 1))); }); play(); } }, f[1]));
    });
    var viewSeg = h('div', { class: 'seg' });
    [['', 'Tự động'], ['front', 'Chính diện'], ['left', '3/4 trái'], ['right', '3/4 phải'], ['left45', '45° trái'], ['right45', '45° phải']].forEach(function (v) {
      viewSeg.appendChild(h('button', { 'data-v': v[0], 'aria-pressed': String(sel.view === v[0]), onclick: function () {
        sel.view = v[0];
        Array.prototype.forEach.call(viewSeg.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === sel.view)); });
        play(); paintGrid();
      } }, v[1]));
    });
    [[sState, 'state'], [sPost, 'posture'], [sMove, 'move'], [sMot, 'motion']].forEach(function (x) { x[0].onchange = function () { sel[x[1]] = x[0].value; play(); }; });
    var reset = h('button', { class: 'btn sm', onclick: function () { sel.state = null; sel.posture = sel.move = sel.motion = ''; sState.value = sPost.value = sMove.value = sMot.value = ''; play(); } }, 'Bỏ ghép tay');
    var dl = h('button', { class: 'btn sm', onclick: function () {
      var svg = GC.svgString(cur, stateOf(), { director: dirOf() });
      var a = h('a', { href: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), download: cur.id + '-' + (sel.activity || 'pose') + '.svg' });
      document.body.appendChild(a); a.click(); a.remove();
    } }, 'Tải SVG khung này');
    $('view').appendChild(h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('div', { class: 'row' }, selA, h('span', { class: 'note', text: LIB.activityOrder.length + ' hoạt động · ' + Object.keys(LIB.postures).length + ' tư thế × ' + Object.keys(LIB.moves).length + ' di chuyển × ' + Object.keys(LIB.motions).length + ' động tác × ' + LIB.stateOrder.length + ' biểu cảm' })),
        grid),
      h('div', { class: 'sticky stack' },
        h('div', { class: 'panel' }, h('h3', null, 'Sân khấu', h('span', { class: 'r note', id: 'psLabel' })), stg,
          h('div', { class: 'pad stack' }, info,
            h('div', { class: 'kv' },
              h('label', { text: 'Biểu cảm (mặt)' }), sState,
              h('label', { text: 'Tư thế nền' }), sPost,
              h('label', { text: 'Di chuyển' }), sMove,
              h('label', { text: 'Động tác (tay)' }), sMot,
              h('label', { text: 'Hướng' }), face,
              h('label', { text: 'Góc nhìn' }), viewSeg),
            h('div', { class: 'row' }, reset, dl))))));
    var inst = R.full(stg, cur, 'normal', { force: true });
    onLeave(function () { inst.destroy(); });
    function stateOf() { return sel.state || (LIB.activities[sel.activity] || {}).state || 'normal'; }
    function dirOf() {
      var d = { facing: sel.facing };
      if (sel.view) d.view = sel.view;
      if (sel.activity) d.activity = sel.activity;
      if (sel.posture) d.posture = sel.posture;
      if (sel.move) d.move = sel.move === 'none' ? null : sel.move;
      if (sel.motion) d.motion = sel.motion;
      return d;
    }
    function play() {
      if (inst.asset !== cur) inst.setAsset(cur);
      var st = inst.setState(stateOf(), dirOf());
      var act = LIB.activities[sel.activity];
      $('psLabel').textContent = act ? act.label : '';
      info.textContent = 'Đang diễn: ' + stateLabel(stateOf()) + ' · ' + (st.kind === 'q45' ? (st.mirror ? '45° phải' : '45° trái') + (st.fallback45 && st.fallback45.length ? ' (linh kiện chưa vẽ nghiêng: ' + st.fallback45.join(', ') + ')' : ' (vẽ thật đủ bộ)') : st.turn ? (st.turn < 0 ? '3/4 trái' : '3/4 phải') : 'chính diện') + ' · tư thế ' + (LIB.postures[st.posture] || {}).label + ' · ' +
        (st.move ? 'di chuyển ' + LIB.moves[st.move].label : 'đứng yên') + ' · động tác ' + ((LIB.motions[st.motion] || {}).label || st.motion) +
        (st.props.length ? ' · đạo cụ: ' + st.props.map(function (p) { return LIB.props[p].label; }).join(', ') : '');
      Array.prototype.forEach.call(grid.querySelectorAll('.state-cell'), function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-a') === sel.activity)); });
    }
    function paintGrid() {
      clear(grid);
      var groups = {};
      LIB.activityOrder.forEach(function (id) { var g = LIB.activities[id].group || 'Khác'; (groups[g] = groups[g] || []).push(id); });
      Object.keys(groups).forEach(function (g) {
        var box = h('div', { class: 'states' });
        groups[g].forEach(function (id) {
          var a = LIB.activities[id];
          var im = h('div', { class: 'im' });
          var cell = h('button', { class: 'state-cell', 'data-a': id, title: a.hint || '', onclick: function () { sel.activity = id; play(); } }, im, h('div', { class: 'lb', text: a.label }));
          R.image(im, cur, a.state || 'normal', { director: sel.view ? { activity: id, view: sel.view } : { activity: id } });
          box.appendChild(cell);
        });
        grid.appendChild(h('div', { class: 'panel' }, h('h3', null, g, h('span', { class: 'r note', text: groups[g].length + ' hoạt động' })), h('div', { class: 'pad' }, box)));
      });
    }
    paintGrid();
    play();
  };


  /* ============================================================ trang: Xưởng AI (chat) */
  // AI chạy bằng LLM API của người dùng, nhưng CHỈ tạo/sửa qua bộ tool của nhà xưởng (cùng bộ với MCP)
  // → cùng cổng kiểm, cùng chuẩn với mọi asset khác. Lịch sử chat giữ trong trình duyệt này.
  var chatLog = [];
  PAGES.workshop = function () {
    crumbs([{ t: 'Xưởng AI (chat)' }]);
    var box = h('div', { class: 'stack', style: 'max-height:62vh;overflow:auto;padding:12px' });
    var input = h('textarea', { rows: 3, placeholder: 'Ví dụ: Vẽ một chiếc nón lá (có bản 45°), rồi tạo nhân vật "Tiểu nhị" đội nón lá, áo bào nâu, đang chạy bưng trà.', style: 'width:100%' });
    var send = h('button', { class: 'btn primary', onclick: go1 }, 'Gửi');
    var clearB = h('button', { class: 'btn sm', onclick: function () { chatLog = []; paint(); } }, 'Xoá cuộc trò chuyện');
    var status = h('span', { class: 'note' });
    function bubble(m) {
      var mine = m.role === 'user';
      var el = h('div', { class: 'panel', style: 'padding:10px 12px;max-width:86%;' + (mine ? 'margin-left:auto;background:var(--accent-soft)' : '') },
        h('div', { style: 'white-space:pre-wrap', text: m.content || '' }));
      if (m.log && m.log.length) el.appendChild(h('div', { class: 'row', style: 'margin-top:6px;gap:4px' }, m.log.map(function (l) {
        return h('span', { class: 'tag', title: l.summary, style: l.ok ? '' : 'border-color:var(--danger);color:var(--danger)', text: (l.ok ? '✓ ' : '✗ ') + l.tool });
      })));
      if (m.renders && m.renders.length) el.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, m.renders.map(function (r) {
        return h('img', { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg), alt: r.tool, style: 'max-width:' + (r.tool === 'preview_part' ? '100%' : '180px') + ';background:#fff;border-radius:6px' });
      })));
      return el;
    }
    function paint() {
      clear(box);
      if (!chatLog.length) box.appendChild(h('div', { class: 'note', text: 'AI ở đây dùng đúng bộ tool của nhà xưởng (giống agent nối qua MCP): tra kho, xem chuẩn linh kiện, soát trên ma-nơ-canh, lưu qua cổng kiểm. Nó không tự ghi được gì ngoài các tool đó.' }));
      chatLog.forEach(function (m) { box.appendChild(bubble(m)); });
      box.scrollTop = box.scrollHeight;
    }
    function go1() {
      var t = input.value.trim();
      if (!t || send.disabled) return;
      chatLog.push({ role: 'user', content: t }); input.value = ''; paint();
      send.disabled = true; status.textContent = 'AI đang làm (gọi tool của nhà xưởng)…';
      Store.api('POST', 'api/ai/agent', { messages: chatLog.map(function (m) { return { role: m.role, content: m.content }; }) }).then(function (r) {
        chatLog.push({ role: 'assistant', content: r.reply, log: r.log, renders: r.renders });
        status.textContent = r.rounds + ' lượt · ' + r.model + ' · ' + (r.usage.prompt + r.usage.completion) + ' token';
        // linh kiện / nhân vật mới: nạp lại để Studio thấy ngay
        return Store.api('GET', 'api/parts').then(function (ps) { ps.forEach(function (d) { GC.registerDataPart(MY_PACK, d); }); return Store.api('GET', 'api/assets'); })
          .then(function (as) { as.forEach(function (a) { GC.registerAsset(a.pack, a); }); });
      }).catch(function (e) { chatLog.push({ role: 'assistant', content: 'Lỗi: ' + e.message }); status.textContent = ''; })
        .then(function () { send.disabled = false; paint(); });
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go1(); });
    var off = Store.mode !== 'server';
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, 'Xưởng AI', h('span', { class: 'r note', text: 'cùng bộ tool + cùng cổng kiểm với agent MCP · model: Cài đặt AI' })),
        off ? h('div', { class: 'pad note', text: 'Cần chạy bản cài trên máy (server) và nhập LLM API key ở Cài đặt AI.' }) : box,
        off ? null : h('div', { class: 'pad stack' }, input, h('div', { class: 'row' }, send, clearB, status, h('span', { class: 'note', text: 'Ctrl+Enter để gửi' }))))));
    paint();
  };

  /* ============================================================ trang: Đạo diễn AI */
  var SAMPLE = { title: 'Họp giao ban 8 giờ sáng', steps: [
    { actor: 'truong-phi', state: 'sleep', say: 'Khò... rượu ngon... khò...' },
    { actor: 'quan-vu', state: 'rage', say: 'Dực Đức! Đang họp mà ngủ!' },
    { actor: 'truong-phi', state: 'shock', say: 'Hả?! Ai đánh trống trận?!' },
    { actor: 'gia-cat-luong', state: 'think', say: 'Hôm nay bàn ba việc. Việc thứ nhất...' },
    { actor: 'linh-que', state: 'exhausted', say: '...' }] };
  PAGES.director = function () {
    crumbs([{ t: 'Đạo diễn AI' }]);
    var cast = GC.assets();
    var picked = cast.slice(0, 5).map(function (a) { return a.id; });
    var desc = h('textarea', { rows: '3', placeholder: 'Mô tả sự kiện. Ví dụ: Cả nhóm nhận thưởng cuối tháng nhưng Tào Tháo phát hiện ngân khố thiếu tiền.' });
    var ta = h('textarea', { class: 'code', rows: '16', spellcheck: 'false', 'aria-label': 'Kịch bản JSON' });
    ta.value = JSON.stringify(SAMPLE, null, 2);
    var errs = h('ul', { class: 'errs' });
    var info = h('div', { class: 'note' });
    var castBox = h('div', { class: 'fxchips' });
    cast.forEach(function (a) {
      var b = h('button', { 'aria-pressed': String(picked.indexOf(a.id) >= 0), onclick: function () {
        var i = picked.indexOf(a.id);
        if (i >= 0) picked.splice(i, 1); else if (picked.length < R.budget) picked.push(a.id); else { toast('Tối đa ' + R.budget + ' diễn viên cùng sân khấu (ngân sách hiệu năng).'); return; }
        b.setAttribute('aria-pressed', String(i < 0)); setScene(curScene && curScene.key, (function () { try { return JSON.parse(ta.value); } catch (e) { return null; } })());
      } }, a.name);
      castBox.appendChild(b);
    });
    var genBtn = h('button', { class: 'btn primary', onclick: generate }, 'Viết bằng AI');
    var savedBox = h('div');
    function loadSaved() {
      if (Store.mode !== 'server') return;
      Store.api('GET', 'api/events').then(function (list) {
        clear(savedBox);
        if (!list.length) { savedBox.appendChild(h('div', { class: 'pad note', text: 'Chưa có kịch bản nào được lưu.' })); return; }
        var t = h('table', { class: 'grid' });
        t.appendChild(h('tr', null, ['Kịch bản', 'Cảnh', 'Người viết', 'Lúc lưu', ''].map(function (c) { return h('th', { text: c }); })));
        list.forEach(function (e) {
          t.appendChild(h('tr', null, h('td', null, h('b', { text: e.title || e.id })), h('td', { class: 'v', text: String(e.steps) }), h('td', { class: 'note', text: e.author }),
            h('td', { class: 'nw note', text: fmtTime(e.savedAt) }), h('td', null, h('button', { class: 'btn sm', onclick: function () {
              Store.api('GET', 'api/events/' + e.id).then(function (rec) {
                var need = rec.event.steps.map(function (x) { return x.actor; }).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
                need.forEach(function (id) { if (picked.indexOf(id) < 0 && picked.length < R.budget && cast.some(function (c) { return c.id === id; })) picked.push(id); });
                Array.prototype.forEach.call(castBox.children, function (btn, i) { btn.setAttribute('aria-pressed', String(picked.indexOf(cast[i].id) >= 0)); });
                buildStage();
                ta.value = JSON.stringify(rec.event, null, 2); play();
              });
            } }, 'Mở và diễn'))));
        });
        savedBox.appendChild(h('div', { class: 'scroll', style: 'max-height:260px' }, t));
      }).catch(function () {});
    }
    function saveEvent() {
      clear(errs);
      var ev; try { ev = JSON.parse(ta.value); } catch (e) { errs.appendChild(h('li', { text: 'JSON lỗi cú pháp: ' + e.message })); return; }
      Store.api('POST', 'api/events', { event: ev, author: 'Studio' }).then(function () { toast('Đã lưu kịch bản.'); loadSaved(); }).catch(function (e) { errs.appendChild(h('li', { text: e.message })); });
    }
    var stageBox = h('div', { class: 'dstage' });
    var prog = h('span', { class: 'note mono', text: 'Chưa diễn' });
    // Cảnh: kịch bản có "scene" thì diễn trong cảnh đó (diễn viên đứng ở chỗ đứng chuẩn); không có thì diễn trên thẻ
    var curScene = null, spotOf = {};
    var sceneSel = h('select', { 'aria-label': 'Cảnh', onchange: function () {
      var ev; try { ev = JSON.parse(ta.value); } catch (e) { toast('JSON kịch bản đang lỗi — sửa trước khi đổi cảnh.'); sceneSel.value = curScene ? curScene.key : ''; return; }
      if (sceneSel.value) ev.scene = sceneSel.value; else delete ev.scene;
      ta.value = JSON.stringify(ev, null, 2); setScene(sceneSel.value, ev);
    } });
    sceneSel.appendChild(h('option', { value: '', text: '— không cảnh (thẻ) —' }));
    GC.scenes().forEach(function (sc) { sceneSel.appendChild(h('option', { value: sc.key, text: sc.name })); });
    function setScene(key, ev) {
      curScene = key ? GC.getScene(key) : null;
      sceneSel.value = curScene ? curScene.key : '';
      spotOf = {};
      if (curScene) {
        (ev && ev.steps || []).forEach(function (st) { if (st.spot && !spotOf[st.actor]) spotOf[st.actor] = st.spot; });
        var free = ['midLeft', 'midRight', 'left', 'right', 'center', 'backLeft', 'backRight', 'back'].filter(function (k) { return curScene.spots.indexOf(k) >= 0 && !Object.keys(spotOf).some(function (a) { return spotOf[a] === k; }); });
        var over = 0;
        picked.forEach(function (id) { if (!spotOf[id]) { var f = free.shift(); if (!f) over++; spotOf[id] = f || curScene.spots[0]; } });
        if (over) toast('Cảnh "' + curScene.name + '" chỉ mở ' + curScene.spots.length + ' chỗ đứng — ' + over + ' diễn viên đang đứng chồng; bớt diễn viên hoặc chọn cảnh khác.');
      }
      buildStage();
    }
    function placeActor(el, spot) {
      var sp = GC.SCENE.spots[spot] || GC.SCENE.spots.center, k = sp.k, B = GC.RIG.box;
      el.style.left = ((sp.x - (100 - B[0]) * k) / GC.SCENE.W * 100) + '%';
      el.style.top = ((sp.y - (228 - B[1]) * k) / GC.SCENE.H * 100) + '%';
      el.style.width = (B[2] * k / GC.SCENE.W * 100) + '%';
      el.style.height = (B[3] * k / GC.SCENE.H * 100) + '%';
      el.style.zIndex = /^back/.test(spot) ? 1 : 2;
    }
    function sceneDir(id, step) {
      var sp = curScene && GC.SCENE.spots[spotOf[id]];
      if (!sp || picked.length < 2 || (step && step.view) || !sp.face) return null;
      return { view: sp.face > 0 ? 'right45' : 'left45' };
    }
    $('view').appendChild(h('div', { class: 'detail', style: 'grid-template-columns:440px minmax(0,1fr)' },
      h('div', { class: 'stack' },
        h('div', { class: 'panel' }, h('h3', null, 'Diễn viên', h('span', { class: 'r note', text: 'tối đa ' + R.budget })), h('div', { class: 'pad' }, castBox)),
        h('div', { class: 'panel' }, h('h3', null, 'Viết kịch bản bằng AI'), h('div', { class: 'pad stack' }, desc, h('div', { class: 'row' }, genBtn, info),
          Store.mode === 'server' ? null : h('div', { class: 'note', text: 'AI chỉ chạy ở bản cài trên máy (cần API key trong Cài đặt AI). Ở bản xem thử, dán JSON từ bất kỳ AI nào vào ô dưới.' }))),
        h('div', { class: 'panel' }, h('h3', null, 'Kịch bản (JSON)', h('span', { class: 'r' }, h('button', { class: 'btn sm', onclick: copyPrompt }, 'Chép prompt'))),
          h('div', { class: 'pad' }, ta, errs, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn primary', onclick: play }, 'Diễn'), h('button', { class: 'btn', onclick: stop }, 'Dừng'),
            Store.mode === 'server' ? h('button', { class: 'btn', onclick: saveEvent }, 'Lưu kịch bản') : null))),
        Store.mode === 'server' ? h('div', { class: 'panel' }, h('h3', null, 'Kịch bản đã lưu', h('span', { class: 'r note', text: 'từ Studio hoặc agent qua MCP' })), savedBox) : null),
      h('div', { class: 'stack' }, h('div', { class: 'row' }, h('b', { text: 'Sân khấu' }), h('label', { class: 'note', style: 'display:flex;gap:6px;align-items:center' }, 'Cảnh', sceneSel), prog), stageBox)));
    var insts = {}, cards = {}, playing = 0;
    function buildStage() {
      Object.keys(insts).forEach(function (k) { insts[k].destroy(); });
      insts = {}; cards = {}; clear(stageBox);
      if (curScene) {
        stageBox.className = 'dscene';
        // nền (sau diễn viên) + lớp trước (đạo cụ trước, tiền cảnh, thời tiết, màu giờ): diễn viên sống nằm giữa, đúng thứ tự như ảnh tĩnh
        stageBox.appendChild(h('img', { class: 'bg', alt: curScene.name, src: svgURL(GC.sceneSvg(curScene, { part: 'back' })) }));
        picked.forEach(function (id) {
          var a = cast.filter(function (x) { return x.id === id; })[0];
          var st = h('div', { class: 'stage' }), el = h('div', { class: 'actor', title: a.name }, st);
          placeActor(el, spotOf[id]);
          stageBox.appendChild(el);
          cards[id] = el; insts[id] = R.full(st, a, 'normal');
          var d0 = sceneDir(id); if (d0) insts[id].setState('normal', d0);
        });
        stageBox.appendChild(h('img', { class: 'bg fg', alt: '', src: svgURL(GC.sceneSvg(curScene, { part: 'front' })) }));
        return;
      }
      stageBox.className = 'dstage';
      picked.forEach(function (id) {
        var a = cast.filter(function (x) { return x.id === id; })[0];
        var st = h('div', { class: 'stage' });
        var card = h('div', { class: 'dcard' }, st, h('div', { class: 'nm' }, h('span', { text: a.name }), h('span', { class: 'mono note', text: a.id })));
        stageBox.appendChild(card);
        cards[id] = card; insts[id] = R.full(st, a, 'normal');
      });
    }
    onLeave(function () { playing++; Object.keys(insts).forEach(function (k) { insts[k].destroy(); }); });
    buildStage();
    loadSaved();
    function castObjs() { return cast.filter(function (a) { return picked.indexOf(a.id) >= 0; }); }
    function generate() {
      if (Store.mode !== 'server') { toast('Cần bản cài trên máy để gọi AI.'); return; }
      if (!desc.value.trim()) { desc.focus(); return; }
      genBtn.disabled = true; genBtn.textContent = 'Đang viết…'; clear(errs); info.textContent = '';
      Store.api('POST', 'api/ai/director', { description: desc.value.trim(), cast: picked }).then(function (r) {
        ta.value = JSON.stringify(r.event, null, 2);
        info.textContent = r.model + ' · ' + (r.ms / 1000).toFixed(1) + ' s · ' + r.attempts + ' lần · ' + (r.usage.prompt + r.usage.completion) + ' token';
        play();
      }).catch(function (e) { errs.appendChild(h('li', { text: e.message })); })
        .then(function () { genBtn.disabled = false; genBtn.textContent = 'Viết bằng AI'; });
    }
    function copyPrompt() {
      var text = GC.director.prompt(castObjs());
      try { navigator.clipboard.writeText(text).then(function () { toast('Đã chép prompt. Dán vào AI bất kỳ, rồi dán JSON trả về vào ô kịch bản.'); }, function () { ta.value = text; ta.select(); }); }
      catch (e) { ta.value = text; ta.select(); }
    }
    function clearBubbles() { Object.keys(cards).forEach(function (k) { var b = cards[k].querySelector('.bubble'); if (b) b.remove(); cards[k].classList.remove('speaking', 'dim'); }); }
    function stop() { playing++; clearBubbles(); prog.textContent = 'Đã dừng'; }
    function play() {
      clear(errs);
      var ev; try { ev = JSON.parse(ta.value); } catch (e) { errs.appendChild(h('li', { text: 'JSON lỗi cú pháp: ' + e.message })); return; }
      var problems = GC.director.validate(ev, castObjs());
      if (problems.length) { problems.forEach(function (p) { errs.appendChild(h('li', { text: p })); }); return; }
      if ((ev.scene || '') !== (curScene ? curScene.key : '') || curScene) setScene(ev.scene || '', ev);
      var run = ++playing, i = 0;
      Object.keys(insts).forEach(function (k) { insts[k].setState('normal', sceneDir(k) || undefined); });
      (function next() {
        if (run !== playing) return;
        clearBubbles();
        if (i >= ev.steps.length) { prog.textContent = ev.title + ' · xong'; return; }
        var s = ev.steps[i++];
        prog.textContent = ev.title + ' · cảnh ' + i + '/' + ev.steps.length;
        Object.keys(cards).forEach(function (k) { if (k !== s.actor) cards[k].classList.add('dim'); });
        cards[s.actor].classList.add('speaking');
        if (curScene && s.spot && s.spot !== spotOf[s.actor]) { spotOf[s.actor] = s.spot; placeActor(cards[s.actor], s.spot); }
        var dir = sceneDir(s.actor, s) || {};
        ['motion', 'fx', 'activity', 'posture', 'move', 'facing', 'view'].forEach(function (k) { if (s[k]) dir[k] = s[k]; });
        insts[s.actor].setState(s.state, Object.keys(dir).length ? dir : undefined);
        cards[s.actor].querySelector('.stage').appendChild(h('div', { class: 'bubble', text: s.say }));
        setTimeout(next, s.hold ? s.hold * 1000 : Math.min(4200, Math.max(1800, s.say.length * 65)));
      })();
    }
  };

  /* ============================================================ tải về, chép mã (dùng chung) */
  function download(name, text, type) { downloadBlob(name, new Blob([text], { type: type })); }
  function downloadBlob(name, blob) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function svgURL(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  // SVG → PNG đúng cỡ (vẽ lại từ vector, không phóng ảnh nhỏ)
  function rasterize(url, w, hgt) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { var c = document.createElement('canvas'); c.width = w; c.height = hgt; c.getContext('2d').drawImage(img, 0, 0, w, hgt); c.toBlob(res, 'image/png'); };
      img.onerror = rej;
      img.src = url;
    });
  }
  function savePng(name, url, w, hgt) { rasterize(url, w, hgt).then(function (b) { downloadBlob(name, b); }).catch(function () { toast('Không dựng được PNG.'); }); }
  function copyText(text, what) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Đã chép ' + what + '.'); } catch (e) { toast('Trình duyệt chặn chép — bôi đen trong ô mã rồi chép tay.'); }
      ta.remove();
    }
    try { navigator.clipboard.writeText(text).then(function () { toast('Đã chép ' + what + '.'); }, fallback); } catch (e) { fallback(); }
  }
  // Ô mã nhiều thẻ: [nhãn, () => chuỗi]. Luôn hiện đúng thứ sẽ được chép.
  function codeBox(tabs) {
    var cur = 0, seg = h('div', { class: 'seg' }), ta = h('textarea', { class: 'code', rows: '9', readonly: true, spellcheck: 'false', 'aria-label': 'Mã' });
    function show() { ta.value = tabs[cur][1](); Array.prototype.forEach.call(seg.children, function (b, i) { b.setAttribute('aria-pressed', String(i === cur)); }); }
    tabs.forEach(function (t, i) { seg.appendChild(h('button', { onclick: function () { cur = i; show(); } }, t[0])); });
    var box = h('div', { class: 'stack', style: 'gap:6px' }, h('div', { class: 'row' }, seg, h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { copyText(ta.value, tabs[cur][0].toLowerCase()); } }, 'Chép')), ta);
    box.refresh = show;
    show();
    return box;
  }
  // Thẻ script để dùng engine ngoài Studio (chép thư mục engine/ và kinds/ từ bản cài)
  function engineScripts(withRender) {
    return ['engine/core.js'].concat(withRender ? ['engine/render.js'] : [], ['kinds/character/afi.core.js', 'kinds/character/afi.tamquoc.js', 'kinds/item/afi.items.js', 'kinds/scene/afi.scenes.js'])
      .map(function (f) { return '<script src="' + f + '"></script>'; }).join('\n');
  }
  // JSON đặt trong <script> của mã nhúng: escape < > & và U+2028/2029 — tên do agent đặt chứa "</script>" không thoát ra được
  function jsonForScript(x) { return JSON.stringify(x).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function mcpCall(tool, args) { return '// Agent (MCP) hoặc AI trong Xưởng AI gọi:\n' + tool + ' ' + JSON.stringify(args, null, 2); }

  /* ============================================================ THƯ VIỆN: thành phẩm theo nhóm, lấy về dùng */
  var GROUPS = [['official', 'Chính thức'], ['mine', 'Của tôi'], ['team', 'Nhóm'], ['community', 'Cộng đồng']];
  function groupOf(x) { return (GC.PACKS[x.pack] || {}).group || 'community'; }
  // cfg: { title, fab (trang Xưởng tương ứng), list(), find(key), sub(x) → nhãn nhóm con, thumb(x) → url, wide?, inspect(x, box) }
  function libPage(cfg, r) {
    crumbs([{ t: cfg.title }]);
    actions(h('span', { class: 'note', text: 'Thành phẩm đã qua cổng kiểm — chọn, xem, tải ảnh hoặc chép mã.' }),
      h('button', { class: 'btn', onclick: function () { go({ page: cfg.fab }); } }, 'Tạo / sửa trong Xưởng ›'));
    var q = '', grp = 'all', sub = 'all', sel = cfg.find(r.key) || cfg.list()[0];
    var search = h('input', { type: 'search', placeholder: 'Tìm: tên, mã, thư viện…', style: 'width:260px', oninput: function () { q = search.value.trim().toLowerCase(); paint(); } });
    var gseg = h('div', { class: 'seg' }), subs = h('div', { class: 'fxchips' });
    var body = h('div', { class: 'stack' }), insp = h('div', { class: 'stack' });
    $('view').appendChild(h('div', { class: 'split lib' + (cfg.wide ? ' wide' : '') },
      h('div', { class: 'stack' }, h('div', { class: 'row' }, search, gseg), subs, body),
      h('div', { class: 'sticky' }, insp)));
    function chip(container, cur, val, label, set) {
      container.appendChild(h('button', { 'aria-pressed': String(cur === val), onclick: function () { set(val); paint(); } }, label));
    }
    function paint() {
      var all = cfg.list(), list = all.filter(function (x) { return !q || [x.name, x.han, x.key, x.pack, cfg.sub(x)].join(' ').toLowerCase().indexOf(q) >= 0; });
      clear(gseg); chip(gseg, grp, 'all', 'Tất cả', function (v) { grp = v; });
      GROUPS.forEach(function (g) { if (all.some(function (x) { return groupOf(x) === g[0]; })) chip(gseg, grp, g[0], g[1], function (v) { grp = v; }); });
      clear(subs); chip(subs, sub, 'all', 'Mọi nhóm', function (v) { sub = v; });
      all.map(cfg.sub).filter(function (x, i, a) { return a.indexOf(x) === i; }).forEach(function (sv) { chip(subs, sub, sv, sv, function (v) { sub = v; }); });
      clear(body);
      GROUPS.forEach(function (g) {
        if (grp !== 'all' && grp !== g[0]) return;
        var part = list.filter(function (x) { return groupOf(x) === g[0] && (sub === 'all' || cfg.sub(x) === sub); });
        if (!part.length) return;
        var row = h('div', { class: 'libgrid' });
        part.forEach(function (x) {
          row.appendChild(h('button', { class: 'libcard', 'aria-pressed': String(sel && x.key === sel.key), title: x.key, onclick: function () { sel = x; paint(); paintInsp(); } },
            h('div', { class: 'im' }, h('img', { src: cfg.thumb(x), alt: x.name, loading: 'lazy' })),
            h('div', { class: 'lb' }, h('b', { text: x.name }), h('span', { class: 'note', text: cfg.sub(x) }))));
        });
        body.appendChild(h('div', { class: 'panel' }, h('h3', null, g[1], h('span', { class: 'r note', text: part.length + ' / ' + all.filter(function (x) { return groupOf(x) === g[0]; }).length })), h('div', { class: 'pad' }, row)));
      });
      if (!body.children.length) body.appendChild(h('div', { class: 'panel pad note', text: 'Không có gì khớp bộ lọc.' }));
    }
    function paintInsp() { clear(insp); if (sel) cfg.inspect(sel, insp); }
    paint(); paintInsp();
  }
  function useHead(x, box, extra) {
    box.appendChild(h('div', { class: 'panel' }, h('h3', null, x.name + (x.han ? ' · ' + x.han : ''), h('span', { class: 'r mono', text: x.key })),
      h('div', { class: 'pad stack' }, extra)));
  }

  // ---- Thư viện › Nhân vật
  var charThumb = new Map();
  PAGES['lib-characters'] = function (r) {
    libPage({
      title: 'Nhân vật', fab: 'characters', list: function () { return GC.assets(); }, find: function (k) { return GC.ASSETS[k]; },
      sub: function (a) { return a.faction || 'Khác'; },
      thumb: function (a) { return R.imageURL(a, 'normal', {}); },
      inspect: function (a, box) {
        var u = { state: 'normal', activity: '', view: 'front' };
        var stg = h('div', { class: 'stage', style: 'height:300px;border-radius:6px;overflow:hidden' });
        var selS = h('select', { onchange: function () { u.state = selS.value; paintU(); } });
        LIB.stateOrder.forEach(function (s0) { selS.appendChild(h('option', { value: s0, text: stateLabel(s0) })); });
        var selA = h('select', { onchange: function () { u.activity = selA.value; if (u.activity && LIB.activities[u.activity].state) { u.state = LIB.activities[u.activity].state; selS.value = u.state; } paintU(); } });
        selA.appendChild(h('option', { value: '', text: '— hoạt động —' }));
        LIB.activityOrder.forEach(function (k) { selA.appendChild(h('option', { value: k, text: LIB.activities[k].label })); });
        var vseg = h('div', { class: 'seg' });
        [['front', 'Chính diện'], ['left45', '45° trái'], ['right45', '45° phải']].forEach(function (v) {
          vseg.appendChild(h('button', { 'aria-pressed': String(u.view === v[0]), onclick: function () { u.view = v[0]; Array.prototype.forEach.call(vseg.children, function (b, i) { b.setAttribute('aria-pressed', String(i === ['front', 'left45', 'right45'].indexOf(u.view))); }); paintU(); } }, v[1]));
        });
        function dir() { var d = {}; if (u.activity) d.activity = u.activity; if (u.view !== 'front') d.view = u.view; return Object.keys(d).length ? d : undefined; }
        function name() { return a.id + '-' + u.state + (u.activity ? '-' + u.activity : '') + (u.view !== 'front' ? '-' + u.view : ''); }
        var code;
        function paintU() { clear(stg); R.image(stg, a, u.state, { director: dir() }); if (code) code.refresh(); }
        var mine = a.pack === MY_PACK;
        code = codeBox([
          ['Mã tham chiếu', function () { return a.key + '\n\n// trong kịch bản: { "actor": "' + a.id + '", "state": "' + u.state + '"' + (u.activity ? ', "activity": "' + u.activity + '"' : '') + (u.view !== 'front' ? ', "view": "' + u.view + '"' : '') + ', "say": "…" }\n// trong cảnh:   cast: [{ "character": "' + a.key + '", "spot": "center" }]'; }],
          ['Gọi qua MCP', function () { var x = { key: a.key, state: u.state }; if (u.activity) x.activity = u.activity; if (u.view !== 'front') x.view = u.view; return mcpCall('render_character', x); }],
          ['Nhúng web', function () {
            var d = dir();
            return '<!-- gen-chibi · © 2026 Afi Labs. Chép thư mục engine/ và kinds/ từ bản cài vào cạnh trang này. -->\n<div id="chibi" style="width:248px;height:258px"></div>\n' + engineScripts(true) + '\n<script>\n  var GC = GenChibi; GC.render.injectCSS();\n' +
              (mine ? '  GC.registerAsset("' + MY_PACK + '", ' + jsonForScript(a) + ');\n' : '') +
              '  var chibi = GC.render.full(document.getElementById("chibi"), GC.ASSETS[' + jsonForScript(a.key) + '], "normal");\n  chibi.setState(' + jsonForScript(u.state) + (d ? ', ' + jsonForScript(d) : '') + ');   // đổi biểu cảm / hoạt động khi cần\n</script>';
          }],
          ['SVG', function () { return GC.svgString(a, u.state, { director: dir() }); }],
          ['JSON công thức', function () { return JSON.stringify(a, null, 2); }]
        ]);
        useHead(a, box, [
          stg, h('div', { class: 'row' }, selS, selA, vseg),
          h('div', { class: 'note', text: (a.identity && a.identity.p1 ? 'Nhận diện: ' + a.identity.p1 + '. ' : '') + (a.persona || '') }),
          h('div', { class: 'usebar' }, h('b', { text: 'Tải ảnh' }),
            h('button', { class: 'btn sm', onclick: function () { download(name() + '.svg', GC.svgString(a, u.state, { director: dir() }), 'image/svg+xml'); } }, 'SVG'),
            h('button', { class: 'btn sm', onclick: function () { savePng(name() + '-512.png', R.imageURL(a, u.state, { director: dir() }), 512, Math.round(512 * 258 / 248)); } }, 'PNG 512'),
            h('button', { class: 'btn sm', onclick: function () { savePng(a.id + '-avatar-256.png', R.imageURL(a, u.state, { crop: true, noShadow: true, director: dir() }), 256, 256); } }, 'Avatar 256'),
            h('button', { class: 'btn sm', onclick: function () { spriteSheet(a); } }, 'Sprite ' + LIB.stateOrder.length + ' biểu cảm')),
          h('div', { class: 'usebar' }, h('b', { text: 'Tải mã' }),
            h('button', { class: 'btn sm', onclick: function () { download(a.id + '.json', JSON.stringify(a, null, 2), 'application/json'); } }, 'JSON công thức')),
          code,
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'character', key: a.key, tab: 'look' }); } }, mine ? 'Sửa trong Xưởng ›' : 'Phối bản của tôi trong Xưởng ›'))
        ]);
        paintU();
      }
    }, r);
  };
  function spriteSheet(a) {
    var cols = 6, cell = 256, ch = Math.round(cell * 258 / 248), rows = Math.ceil(LIB.stateOrder.length / cols);
    var c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * ch;
    var ctx = c.getContext('2d'), done = 0;
    LIB.stateOrder.forEach(function (s0, i) {
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, (i % cols) * cell, Math.floor(i / cols) * ch, cell, ch);
        if (++done === LIB.stateOrder.length) c.toBlob(function (b) { downloadBlob(a.id + '-sprites-' + cols + 'x' + rows + '.png', b); toast('Thứ tự ô: ' + LIB.stateOrder.join(', ')); }, 'image/png');
      };
      img.src = R.imageURL(a, s0, {});
    });
  }

  // ---- Thư viện › Trang bị
  PAGES['lib-items'] = function (r) {
    var I = GC.ITEM;
    libPage({
      title: 'Trang bị', fab: 'items', list: function () { return GC.items(); }, find: function (k) { return k ? GC.getItem(k) : null; },
      sub: function (it) { return (I.types[it.type] || {}).label || it.type; },
      thumb: function (it) { return svgURL(GC.itemSvg(it, { size: 128 })); },
      inspect: function (it, box) {
        var who = 'quan-vu', tryBox = h('div', { class: 'stage', style: 'height:200px;border-radius:6px;overflow:hidden;flex:1' });
        var whoSel = h('select', { onchange: function () { who = whoSel.value; paintTry(); } });
        GC.assets().forEach(function (a) { whoSel.appendChild(h('option', { value: a.id, text: a.name, selected: a.id === who })); });
        function paintTry() {
          clear(tryBox);
          var base = GC.assets().filter(function (a) { return a.id === who; })[0] || GC.assets()[0];
          var a = clone(base); a.key = 'try/' + base.id + '-' + it.key.replace(/[^a-z0-9]/gi, ''); a.look.equip = Object.assign({}, a.look.equip); a.look.equip[it.equip.slot] = it.key;
          R.image(tryBox, a, 'normal', { director: { view: 'left45' } });
        }
        var R0 = I.rarity[it.rarity] || I.rarity.common;
        useHead(it, box, [
          h('div', { class: 'row', style: 'align-items:flex-start;gap:12px' },
            h('img', { src: svgURL(GC.itemSvg(it, { mode: 'card' })), alt: 'thẻ ' + it.name, style: 'width:160px' }),
            h('div', { class: 'stack', style: 'flex:1;gap:6px' }, h('span', { class: 'note', style: 'color:' + R0.color, text: R0.label + ' · ' + ((I.types[it.type] || {}).label || it.type) }),
              h('label', { class: 'note', text: 'Mặc thử lên' }), whoSel, tryBox)),
          h('div', { class: 'usebar' }, h('b', { text: 'Tải ảnh' }),
            h('button', { class: 'btn sm', onclick: function () { download(it.id + '-icon.svg', GC.itemSvg(it, { size: 256 }), 'image/svg+xml'); } }, 'Icon SVG'),
            h('button', { class: 'btn sm', onclick: function () { savePng(it.id + '-icon-256.png', svgURL(GC.itemSvg(it, { size: 256 })), 256, 256); } }, 'Icon PNG 256'),
            h('button', { class: 'btn sm', onclick: function () { download(it.id + '-the.svg', GC.itemSvg(it, { mode: 'card' }), 'image/svg+xml'); } }, 'Thẻ SVG'),
            h('button', { class: 'btn sm', onclick: function () { savePng(it.id + '-the-480.png', svgURL(GC.itemSvg(it, { mode: 'card' })), 480, 660); } }, 'Thẻ PNG')),
          h('div', { class: 'usebar' }, h('b', { text: 'Tải mã' }),
            h('button', { class: 'btn sm', onclick: function () { download(it.id + '.json', JSON.stringify(it, null, 2), 'application/json'); } }, 'JSON item')),
          codeBox([
            ['Mã tham chiếu', function () { return it.key + '\n\n// nhân vật mặc item: trong công thức nhân vật\n"look": { "equip": { "' + it.equip.slot + '": "' + it.key + '" } }'; }],
            ['Gọi qua MCP', function () { return mcpCall('render_item', { key: it.key, mode: 'card' }) + '\n\n' + mcpCall('render_item', { key: it.key, mode: 'equipped', character: who, view: 'left45' }); }],
            ['SVG icon', function () { return GC.itemSvg(it, { size: 256 }); }],
            ['JSON item', function () { return JSON.stringify(it, null, 2); }]
          ]),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'items', key: it.key }); } }, it.pack === MY_PACK ? 'Sửa trong Xưởng ›' : 'Phối bản của tôi trong Xưởng ›'))
        ]);
        paintTry();
      }
    }, r);
  };

  // ---- Thư viện › Cảnh
  var sceneThumb = new Map();
  function sceneURL(sc, opts) {
    var k = sc.key + '@' + (sc.version || 1) + JSON.stringify(opts || {});
    if (!sceneThumb.has(k)) { if (sceneThumb.size > 200) sceneThumb.clear(); sceneThumb.set(k, svgURL(GC.sceneSvg(sc, opts))); }
    return sceneThumb.get(k);
  }
  function castPicker(onChange, initial) {
    // hai chỗ đứng hay dùng nhất để xem nhanh; cảnh đầy đủ dàn diễn viên làm ở Xưởng / Đạo diễn AI
    var cast = initial || [{ id: 'gia-cat-luong', spot: 'midLeft' }, { id: '', spot: 'midRight' }];
    var row = h('div', { class: 'row' });
    cast.forEach(function (c) {
      var sel = h('select', { 'aria-label': 'Diễn viên ở ' + GC.SCENE.spots[c.spot].label, onchange: function () { c.id = sel.value; onChange(); } });
      sel.appendChild(h('option', { value: '', text: '— trống —' }));
      GC.assets().forEach(function (a) { sel.appendChild(h('option', { value: a.id, text: a.name, selected: a.id === c.id })); });
      row.appendChild(h('label', { class: 'note', style: 'display:flex;gap:6px;align-items:center' }, GC.SCENE.spots[c.spot].label, sel));
    });
    row.cast = function () { return cast.filter(function (c) { return c.id; }).map(function (c) { return { character: GC.getAsset(c.id, MY_PACK) ? GC.getAsset(c.id, MY_PACK).key : c.id, spot: c.spot }; }); };
    return row;
  }
  PAGES['lib-scenes'] = function (r) {
    var S = GC.SCENE;
    libPage({
      title: 'Cảnh', fab: 'scenes', wide: true, list: function () { return GC.scenes(); }, find: function (k) { return k ? GC.getScene(k) : null; },
      sub: function (sc) { var p = sc.layers.sky && GC.getPart('sky', sc.layers.sky.part); return p && p.outdoor === false ? 'Trong nhà' : 'Ngoài trời'; },
      thumb: function (sc) { return sceneURL(sc, { size: 320 }); },
      inspect: function (sc, box) {
        var u = { time: sc.time, weather: sc.weather };
        var img = h('img', { alt: sc.name, style: 'width:100%;display:block;border-radius:6px' });
        var tseg = h('div', { class: 'seg' });
        S.timeOrder.forEach(function (t) { tseg.appendChild(h('button', { 'aria-pressed': String(u.time === t), onclick: function () { u.time = t; Array.prototype.forEach.call(tseg.children, function (b, i) { b.setAttribute('aria-pressed', String(S.timeOrder[i] === t)); }); paintU(); } }, S.times[t].label)); });
        var wsel = h('select', { 'aria-label': 'Thời tiết', onchange: function () { u.weather = wsel.value; paintU(); } });
        S.weatherOrder.forEach(function (w) { wsel.appendChild(h('option', { value: w, text: S.weathers[w].label, selected: w === u.weather })); });
        var picker = castPicker(function () { paintU(); });
        function opts(extra) { var o = { cast: picker.cast() }; if (u.time !== sc.time) o.time = u.time; if (u.weather !== sc.weather) o.weather = u.weather; return Object.assign(o, extra || {}); }
        function svg(extra) { return GC.sceneSvg(sc, opts(extra)); }
        function name() { return sc.id + (u.time !== sc.time ? '-' + u.time : '') + (u.weather !== sc.weather ? '-' + u.weather : '') + (picker.cast().length ? '-dien-vien' : ''); }
        var code;
        function paintU() { img.src = svgURL(svg()); if (code) code.refresh(); }
        code = codeBox([
          ['Mã tham chiếu', function () { return sc.key + '\n\n// kịch bản đặt vào cảnh này:\n{ "title": "…", "scene": "' + sc.key + '", "steps": [{ "actor": "gia-cat-luong", "spot": "midLeft", "state": "normal", "say": "…" }] }'; }],
          ['Gọi qua MCP', function () { var x = { key: sc.key, cast: picker.cast() }; if (u.time !== sc.time) x.time = u.time; if (u.weather !== sc.weather) x.weather = u.weather; return mcpCall('render_scene', x); }],
          ['Nhúng web', function () {
            return '<!-- gen-chibi · © 2026 Afi Labs. Chép thư mục engine/ và kinds/ từ bản cài vào cạnh trang này. -->\n<div id="canh" style="width:640px"></div>\n' + engineScripts(false) + '\n<script>\n  var GC = GenChibi;\n' +
              (sc.pack === MY_PACK ? '  GC.pack({ id: "' + MY_PACK + '", name: "Của tôi", owner: "Bạn", license: "Thuộc người tạo" }, function (D) { D.scene(' + jsonForScript(sc) + '); });\n' : '') +
              '  document.getElementById("canh").innerHTML = GC.sceneSvg(GC.SCENES[' + jsonForScript(sc.key) + '], ' + jsonForScript(opts()) + ');\n</script>';
          }],
          ['SVG', function () { return svg(); }],
          ['JSON cảnh', function () { return JSON.stringify(sc, null, 2); }]
        ]);
        useHead(sc, box, [
          img, h('div', { class: 'row' }, tseg, wsel), picker,
          h('div', { class: 'note', text: sc.description || '' }),
          h('div', { class: 'usebar' }, h('b', { text: 'Tải ảnh' }),
            h('button', { class: 'btn sm', onclick: function () { download(name() + '.svg', svg(), 'image/svg+xml'); } }, 'SVG'),
            h('button', { class: 'btn sm', onclick: function () { savePng(name() + '-1280.png', svgURL(svg()), 1280, 720); } }, 'PNG 1280×720'),
            h('button', { class: 'btn sm', onclick: function () { savePng(name() + '-1920.png', svgURL(svg()), 1920, 1080); } }, 'PNG 1920×1080'),
            h('button', { class: 'btn sm', onclick: function () { savePng(sc.id + '-nen-1920.png', svgURL(GC.sceneSvg(sc, opts({ cast: [] }))), 1920, 1080); } }, 'Nền trống 1920')),
          h('div', { class: 'usebar' }, h('b', { text: 'Tải mã' }),
            h('button', { class: 'btn sm', onclick: function () { download(sc.id + '.json', JSON.stringify(sc, null, 2), 'application/json'); } }, 'JSON cảnh')),
          code,
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'scenes', key: sc.key }); } }, sc.pack === MY_PACK ? 'Sửa trong Xưởng ›' : 'Phối bản của tôi trong Xưởng ›'))
        ]);
        paintU();
      }
    }, r);
  };

  /* ============================================================ XƯỞNG › Bàn phối cảnh (loại asset thứ ba) */
  // Cảnh = phối phông có sẵn theo lớp + đạo cụ + bảng màu + giờ + thời tiết. Lưu qua cùng cổng ghi với MCP (POST /api/scenes → saveSceneChecked).
  PAGES.scenes = function (r) {
    var S = GC.SCENE;
    crumbs([{ t: 'Bàn phối cảnh' }]);
    var base = GC.getScene(r.key) || GC.scenes()[0];
    var w, mine;
    function load(sc) {
      mine = sc.pack === MY_PACK;
      w = clone({ id: mine ? sc.id : uniqueScene(sc.id + '-cua-toi'), name: mine ? sc.name : sc.name + ' (bản của tôi)', han: sc.han, description: sc.description,
        layers: sc.layers, deco: sc.deco, palette: sc.palette, time: sc.time, weather: sc.weather, spots: sc.spots });
    }
    function uniqueScene(id) { var x = id, n = 2; while (GC.SCENES[MY_PACK + '/' + x]) x = id + '-' + n++; return x; }
    load(base);
    var saveBtn = h('button', { class: 'btn primary', onclick: save }, 'Lưu cảnh');
    actions(h('button', { class: 'btn', onclick: function () { go({ page: 'lib-scenes', key: base.key }); } }, 'Xem trong Thư viện ›'),
      h('button', { class: 'btn', onclick: function () { load({ id: 'canh-moi', pack: MY_PACK, name: 'Cảnh mới', layers: { sky: { part: 'afi.scenes/open' }, ground: { part: 'afi.scenes/grass' } }, deco: [], palette: {}, time: 'day', weather: 'clear', spots: S.spotOrder.slice() }); w.id = uniqueScene('canh-moi'); mine = true; paintAll(); } }, '+ Cảnh mới'),
      saveBtn);
    var left = h('div', { class: 'stack' }), right = h('div', { class: 'stack' });
    $('view').appendChild(h('div', { class: 'detail scenefab' }, left, h('div', { class: 'sticky stack' }, right)));
    var img = h('img', { alt: 'xem trước cảnh', style: 'width:100%;display:block;border-radius:6px' });
    var gateBox = h('div'), errBox = h('ul', { class: 'errs' });
    var castRows = [{ id: 'gia-cat-luong', spot: 'midLeft', activity: '' }, { id: 'quan-vu', spot: 'midRight', activity: '' }];
    var timer = 0;
    function draft() { var c = GC.checkScene(w); return c; }
    function preview() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var c = draft(); clear(errBox); clear(gateBox);
        if (c.errors.length) { c.errors.forEach(function (e) { errBox.appendChild(h('li', { text: e })); }); return; }
        var d = Object.assign({ key: 'draft/' + c.def.id }, c.def);
        var cast = castRows.filter(function (x) { return x.id && d.spots.indexOf(x.spot) >= 0; }).map(function (x) { var m = { asset: GC.getAsset(x.id, MY_PACK), spot: x.spot }; if (x.activity) m.activity = x.activity; return m; })
          .filter(function (m, i, a) { return m.asset && a.findIndex(function (y) { return y.spot === m.spot; }) === i; });
        try { img.src = svgURL(GC.sceneSvg(d, { cast: cast })); } catch (e) { errBox.appendChild(h('li', { text: e.message })); }
        gateBox.appendChild(h('table', { class: 'grid' }, GC.sceneGate(d).map(function (g) { return h('tr', null, h('td', { text: g.ok ? (g.info ? 'ℹ' : '✓') : '✗' }), h('td', { text: g.label }), h('td', { class: 'note', text: g.detail || '' })); })));
      }, 60);
    }
    function sceneryOpts(slot, cur, optional) {
      var sel = h('select', { 'aria-label': S.slots[slot].label });
      if (optional) sel.appendChild(h('option', { value: '', text: '— không —' }));
      GC.scenery(slot).forEach(function (p) { var ref = p.pack + '/' + p.id; sel.appendChild(h('option', { value: ref, text: p.label + (p.pack !== 'afi.scenes' ? ' · ' + p.pack : ''), selected: ref === cur })); });
      return sel;
    }
    function num(label, val, min, max, step, set) {
      var n = h('input', { type: 'number', value: String(val), min: String(min), max: String(max), step: String(step || 1), style: 'width:70px', 'aria-label': label, oninput: function () { if (n.value !== '') { set(+n.value); preview(); } } });
      return n;
    }
    function paintAll() {
      clear(left); clear(right);
      // --- lớp phông
      var lt = h('table', { class: 'grid' });
      lt.appendChild(h('tr', null, ['Lớp', 'Phông', 'Dịch ngang', 'Lật'].map(function (c) { return h('th', { text: c }); })));
      S.layerOrder.forEach(function (slot) {
        var L = w.layers[slot] || null;
        var sel = sceneryOpts(slot, L && L.part, !S.slots[slot].required);
        sel.onchange = function () { if (!sel.value) delete w.layers[slot]; else w.layers[slot] = Object.assign({ dx: 0, flip: false }, w.layers[slot], { part: sel.value }); paintAll(); };
        var flip = h('input', { type: 'checkbox', checked: !!(L && L.flip), disabled: !L, onchange: function () { w.layers[slot].flip = flip.checked; preview(); } });
        lt.appendChild(h('tr', null, h('td', { class: 'k', text: S.slots[slot].label + (S.slots[slot].required ? ' *' : '') }), h('td', null, sel),
          h('td', null, L ? num('dịch ngang', L.dx || 0, -320, 320, 10, function (v) { w.layers[slot].dx = v; }) : null), h('td', null, flip)));
      });
      // --- đạo cụ
      var dt = h('table', { class: 'grid' });
      dt.appendChild(h('tr', null, ['Đạo cụ', 'x', 'y', 'Cỡ', 'Lật', 'Lớp sâu', ''].map(function (c) { return h('th', { text: c }); })));
      (w.deco || []).forEach(function (x, i) {
        var sel = sceneryOpts('deco', x.part); sel.onchange = function () { x.part = sel.value; preview(); };
        var z = h('select', { onchange: function () { x.z = z.value; preview(); } });
        [['back', 'sau diễn viên'], ['mid', 'giữa hai hàng'], ['front', 'trước diễn viên']].forEach(function (o) { z.appendChild(h('option', { value: o[0], text: o[1], selected: (x.z || 'back') === o[0] })); });
        var flip = h('input', { type: 'checkbox', checked: !!x.flip, onchange: function () { x.flip = flip.checked; preview(); } });
        dt.appendChild(h('tr', null, h('td', null, sel), h('td', null, num('x', x.x, 0, 640, 10, function (v) { x.x = v; })), h('td', null, num('y', x.y || 300, 150, 360, 5, function (v) { x.y = v; })),
          h('td', null, num('cỡ', x.scale || 1, 0.3, 2.5, 0.1, function (v) { x.scale = v; })), h('td', null, flip), h('td', null, z),
          h('td', null, h('button', { class: 'btn sm', onclick: function () { w.deco.splice(i, 1); paintAll(); } }, 'Bỏ'))));
      });
      var addDeco = h('button', { class: 'btn sm', disabled: (w.deco || []).length >= S.budget.deco, onclick: function () { w.deco = w.deco || []; w.deco.push({ part: 'afi.scenes/rock', x: 320, y: 300, scale: 1, flip: false, z: 'back' }); paintAll(); } }, '+ Đạo cụ');
      // --- màu, giờ, thời tiết, chỗ đứng
      var pal = h('div', { class: 'row' });
      Object.keys(S.defaults).forEach(function (k) {
        var c = h('input', { type: 'color', value: (w.palette || {})[k] || S.defaults[k], title: k, oninput: function () { w.palette = w.palette || {}; w.palette[k] = c.value; preview(); } });
        pal.appendChild(h('label', { class: 'note', style: 'display:flex;gap:4px;align-items:center' }, c, k));
      });
      var tsel = h('select', { onchange: function () { w.time = tsel.value; preview(); } });
      S.timeOrder.forEach(function (t) { tsel.appendChild(h('option', { value: t, text: S.times[t].label, selected: t === w.time })); });
      var wsel = h('select', { onchange: function () { w.weather = wsel.value; preview(); } });
      S.weatherOrder.forEach(function (x) { wsel.appendChild(h('option', { value: x, text: S.weathers[x].label, selected: x === w.weather })); });
      var spots = h('div', { class: 'fxchips' });
      S.spotOrder.forEach(function (k) {
        var b = h('button', { 'aria-pressed': String((w.spots || S.spotOrder).indexOf(k) >= 0), onclick: function () {
          var cur = (w.spots || S.spotOrder).slice(), i = cur.indexOf(k);
          if (i >= 0) { if (cur.length > 1) cur.splice(i, 1); } else cur.push(k);
          w.spots = cur; b.setAttribute('aria-pressed', String(cur.indexOf(k) >= 0)); preview();
        } }, S.spots[k].label);
        spots.appendChild(b);
      });
      var nameI = h('input', { type: 'text', value: w.name, maxlength: 40, oninput: function () { w.name = nameI.value; } });
      var idI = h('input', { type: 'text', value: w.id, maxlength: 64, class: 'mono', oninput: function () { w.id = idI.value.trim(); preview(); } });
      var hanI = h('input', { type: 'text', value: w.han || '', maxlength: 12, oninput: function () { w.han = hanI.value; } });
      var descI = h('input', { type: 'text', value: w.description || '', maxlength: 300, style: 'width:100%', oninput: function () { w.description = descI.value; } });
      var kv = h('div', { class: 'kv' });
      [['Tên', nameI], ['Mã (id)', idI], ['Hán tự', hanI], ['Mô tả', descI], ['Giờ', tsel], ['Thời tiết', wsel], ['Chỗ đứng dùng được', spots]].forEach(function (x) { kv.appendChild(h('label', { text: x[0] })); kv.appendChild(x[1]); });
      left.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Thông tin', h('span', { class: 'r note', text: mine ? 'cảnh của tôi' : 'từ cảnh chính thức — lưu sẽ thành bản riêng trong "Của tôi"' })), h('div', { class: 'pad' }, kv)));
      left.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Lớp phông', h('span', { class: 'r note', text: 'trời → cảnh xa → công trình → mặt đất → (diễn viên) → tiền cảnh' })), lt));
      left.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Đạo cụ cảnh', h('span', { class: 'r' }, h('span', { class: 'note', text: (w.deco || []).length + '/' + S.budget.deco + ' (ngân sách) ' }), addDeco)), dt));
      left.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Bảng màu cảnh', h('span', { class: 'r note', text: 'token dùng chung mọi phông · giờ đêm/hoàng hôn tự phủ thêm' })), h('div', { class: 'pad' }, pal)));
      // --- bên phải: xem trước + dàn diễn viên thử + cổng kiểm
      var castT = h('table', { class: 'grid' });
      castT.appendChild(h('tr', null, ['Diễn viên thử', 'Chỗ đứng', 'Hoạt động'].map(function (c) { return h('th', { text: c }); })));
      castRows.forEach(function (x) {
        var a = h('select', { onchange: function () { x.id = a.value; preview(); } });
        a.appendChild(h('option', { value: '', text: '— trống —' }));
        GC.assets().forEach(function (as) { a.appendChild(h('option', { value: as.id, text: as.name, selected: as.id === x.id })); });
        var sp = h('select', { onchange: function () { x.spot = sp.value; preview(); } });
        S.spotOrder.forEach(function (k) { sp.appendChild(h('option', { value: k, text: S.spots[k].label, selected: k === x.spot })); });
        var ac = h('select', { onchange: function () { x.activity = ac.value; preview(); } });
        ac.appendChild(h('option', { value: '', text: '— đứng —' }));
        LIB.activityOrder.forEach(function (k) { ac.appendChild(h('option', { value: k, text: LIB.activities[k].label, selected: k === x.activity })); });
        castT.appendChild(h('tr', null, h('td', null, a), h('td', null, sp), h('td', null, ac)));
      });
      right.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Xem trước', h('span', { class: 'r mono', text: MY_PACK + '/' + w.id })), h('div', { class: 'pad stack' }, img, errBox, castT,
        h('div', { class: 'note', text: 'Diễn viên thử chỉ để soát — không lưu vào cảnh. Từ hai diễn viên, ai chưa chọn góc sẽ tự quay 45° về giữa.' }))));
      right.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Cổng kiểm cảnh'), gateBox));
      var pick = h('div', { class: 'libgrid sm' });
      GC.scenes().forEach(function (sc) {
        pick.appendChild(h('button', { class: 'libcard', title: sc.key, onclick: function () { base = sc; load(sc); paintAll(); } },
          h('div', { class: 'im' }, h('img', { src: sceneURL(sc, { size: 200 }), alt: sc.name, loading: 'lazy' })), h('div', { class: 'lb' }, h('b', { text: sc.name }))));
      });
      right.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Mở cảnh để phối', h('span', { class: 'r note', text: GC.scenes().length + ' cảnh' })), h('div', { class: 'pad' }, pick)));
      saveBtn.disabled = Store.mode !== 'server';
      saveBtn.title = Store.mode === 'server' ? '' : 'Bản xem thử: lưu cảnh cần bản cài trên máy (hoặc agent qua MCP: save_scene).';
      preview();
    }
    function save() {
      var c = draft();
      if (c.errors.length) { toast(c.errors[0]); return; }
      Store.api('POST', 'api/scenes', { scene: w, note: 'Phối trong Studio' }).then(function (rec) {
        var r1 = GC.registerScene(MY_PACK, rec); base = r1.def || base; load(base); toast('Đã lưu ' + rec.name + ' (bản ' + rec.version + ')'); paintAll(); renderNav();
      }).catch(function (e) { toast(e.message); });
    }
    paintAll();
  };

  /* ============================================================ trang: Cài đặt AI */
  PAGES.ai = function () {
    crumbs([{ t: 'Cài đặt AI' }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel empty', text: 'Cài đặt AI chỉ có ở bản cài trên máy: API key được mã hoá và giữ trên máy của bạn, không đi qua trình duyệt.' })); return; }
    var box = h('div', { class: 'stack' });
    $('view').appendChild(box);
    Store.api('GET', 'api/ai').then(render).catch(function (e) { box.appendChild(h('div', { class: 'panel empty', text: e.message })); });
    function render(cfg) {
      clear(box);
      var P = cfg.providers;
      var prov = h('select', { onchange: function () { base.value = P[prov.value].baseUrl; keyLink(); } });
      Object.keys(P).forEach(function (k) { var o = h('option', { value: k, text: P[k].label }); if (k === cfg.provider) o.selected = true; prov.appendChild(o); });
      var base = h('input', { type: 'text', value: cfg.baseUrl, style: 'width:100%' });
      var key = h('input', { type: 'password', placeholder: cfg.hasKey ? 'Đã lưu ' + cfg.keyHint + ' — để trống nếu không đổi' : 'Dán API key', style: 'width:100%', autocomplete: 'off' });
      var link = h('span', { class: 'note' });
      function keyLink() { clear(link); var u = P[prov.value].keyUrl; if (u) link.appendChild(h('span', null, 'Lấy key tại ', h('span', { class: 'mono', text: u }))); }
      keyLink();
      var model = h('input', { type: 'text', value: cfg.model, placeholder: 'vd. deepseek-chat · tên model của nhà cung cấp', style: 'width:100%' });
      var temp = h('input', { type: 'number', min: '0', max: '1.5', step: '0.1', value: String(cfg.temperature), style: 'width:80px' });
      var saveB = h('button', { class: 'btn primary', onclick: function () {
        Store.api('PUT', 'api/ai', { provider: prov.value, baseUrl: base.value.trim(), apiKey: key.value, model: model.value.trim(), temperature: +temp.value })
          .then(function (c) { toast('Đã lưu cài đặt AI.'); render(c); }).catch(function (e) { toast(e.message); });
      } }, 'Lưu');
      var clearB = h('button', { class: 'btn danger', disabled: !cfg.hasKey, onclick: function () {
        if (clearB.getAttribute('data-confirm') !== '1') { clearB.setAttribute('data-confirm', '1'); clearB.textContent = 'Bấm lần nữa để xoá key'; return; }
        Store.api('PUT', 'api/ai', { provider: prov.value, clearKey: true }).then(function (c) { toast('Đã xoá API key.'); render(c); });
      } }, 'Xoá key');
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Nhà cung cấp LLM', h('span', { class: 'r note', text: 'API chuẩn OpenAI · key mã hoá trên máy' })),
        h('div', { class: 'pad kv' }, h('label', { text: 'Nhà cung cấp' }), prov, h('label', { text: 'Địa chỉ API' }), base,
          h('label', { text: 'API key' }), h('div', { class: 'stack', style: 'gap:4px' }, key, link), h('label', { text: 'Model' }), model,
          h('label', { text: 'Độ sáng tạo' }), h('div', { class: 'row' }, temp, h('span', { class: 'note', text: '0 = chắc chắn, 1 = sáng tạo' })),
          h('span'), h('div', { class: 'row' }, saveB, clearB))));

      // danh sách model + lọc "dùng được"
      var mt = h('div');
      var onlyStruct = h('input', { type: 'checkbox', checked: true, id: 'onlyStruct' });
      var q = h('input', { type: 'search', placeholder: 'Lọc model…', style: 'width:220px' });
      var loadB = h('button', { class: 'btn', disabled: !cfg.hasKey, onclick: loadModels }, 'Lấy danh sách model');
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Chọn model', h('span', { class: 'r row' }, q, h('label', { class: 'note' }, onlyStruct, ' chỉ model hỗ trợ JSON có cấu trúc'), loadB)), mt));
      var models = [];
      function loadModels() {
        loadB.disabled = true; loadB.textContent = 'Đang lấy…';
        Store.api('GET', 'api/ai/models').then(function (list) { models = list; paintModels(); })
          .catch(function (e) { clear(mt); mt.appendChild(h('div', { class: 'pad note', text: e.message + (prov.value === 'minimax' ? ' — MiniMax không có danh sách model qua API, hãy gõ tên model.' : '') })); })
          .then(function () { loadB.disabled = false; loadB.textContent = 'Lấy danh sách model'; });
      }
      q.oninput = paintModels; onlyStruct.onchange = paintModels;
      function paintModels() {
        clear(mt);
        var list = models.filter(function (m) { return (!onlyStruct.checked || m.structured !== false) && (!q.value || (m.id + ' ' + m.name).toLowerCase().indexOf(q.value.toLowerCase()) >= 0); });
        var t = h('table', { class: 'grid' });
        t.appendChild(h('tr', null, ['Model', 'Ngữ cảnh', 'JSON có cấu trúc', 'Giá vào / ra (USD / 1M token)', ''].map(function (c) { return h('th', { text: c }); })));
        list.slice(0, 300).forEach(function (m) {
          t.appendChild(h('tr', null, h('td', null, h('div', { class: 'v', text: m.id }), m.name !== m.id ? h('div', { class: 'note', text: m.name }) : null),
            h('td', { class: 'v', text: m.context ? Math.round(m.context / 1000) + 'K' : '—' }),
            h('td', null, m.structured === null ? h('span', { class: 'chip', text: 'không rõ' }) : h('span', { class: 'chip ' + (m.structured ? 'ok' : 'bad'), text: m.structured ? 'có' : 'không' })),
            h('td', { class: 'v', text: m.priceIn !== null ? m.priceIn.toFixed(2) + ' / ' + m.priceOut.toFixed(2) : '—' }),
            h('td', { class: 'nw' }, h('button', { class: 'btn sm', onclick: function () { model.value = m.id; toast('Đã chọn ' + m.id + '. Bấm Lưu để dùng.'); } }, 'Chọn'), ' ',
              h('button', { class: 'btn sm', onclick: function () { runTest(m.id); } }, 'Kiểm tra'))));
        });
        mt.appendChild(h('div', { class: 'scroll', style: 'max-height:420px' }, t));
        mt.appendChild(h('div', { class: 'pad note', text: list.length + ' model. "Không rõ" = nhà cung cấp không công bố; bấm Kiểm tra để đo thật.' }));
      }

      // bảng đo model
      var bt = h('div');
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Kiểm tra model', h('span', { class: 'r row' }, h('span', { class: 'note', text: 'Chạy một kịch bản thử 3 diễn viên, chấm JSON đúng chuẩn, số lần sửa, độ trễ, token.' }),
        h('button', { class: 'btn primary', disabled: !cfg.hasKey || !cfg.model, onclick: function () { runTest(''); } }, 'Kiểm tra model đang chọn'))), bt));
      function runTest(m) {
        toast('Đang kiểm tra ' + (m || cfg.model) + '…');
        Store.api('POST', 'api/ai/test', { model: m }).then(function (row) { toast((row.ok ? '✓ ' : '✗ ') + row.model + ': ' + row.verdict); paintBench(); }).catch(function (e) { toast(e.message); });
      }
      function paintBench() {
        Store.api('GET', 'api/ai/bench').then(function (rows) {
          clear(bt);
          if (!rows.length) { bt.appendChild(h('div', { class: 'pad note', text: 'Chưa kiểm tra model nào.' })); return; }
          var t = h('table', { class: 'grid' });
          t.appendChild(h('tr', null, ['Lúc', 'Model', 'Kết luận', 'Lần sửa', 'Độ trễ', 'Token vào / ra', 'Ghi chú'].map(function (c) { return h('th', { text: c }); })));
          rows.forEach(function (r) {
            t.appendChild(h('tr', null, h('td', { class: 'nw note', text: fmtTime(r.at) }), h('td', { class: 'v', text: r.model }),
              h('td', null, h('span', { class: 'chip ' + (r.ok ? (r.attempts === 1 ? 'ok' : 'warn') : 'bad'), text: r.verdict })),
              h('td', { class: 'v', text: r.ok ? String(r.attempts - 1) : '—' }), h('td', { class: 'v', text: r.ms ? (r.ms / 1000).toFixed(1) + ' s' : '—' }),
              h('td', { class: 'v', text: r.ok ? r.tokensIn + ' / ' + r.tokensOut : '—' }), h('td', { class: 'note', text: r.error || '' })));
          });
          bt.appendChild(h('div', { class: 'scroll' }, t));
        });
      }
      paintBench();

      var port = (Store.info && Store.info.port) || 7480;
      var link = Store.info && Store.info.mcp && Store.info.mcp.link;
      function copyBtn(label, t) { return h('button', { class: 'btn sm', text: label, onclick: function () { navigator.clipboard.writeText(t).then(function () { toast('Đã sao chép'); }, function () { toast('Không sao chép được — chọn và copy tay'); }); } }); }
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Nối agent qua MCP', h('span', { class: 'r note', text: 'agent tự viết công thức và kịch bản, không tốn LLM API lõi' })),
        h('div', { class: 'pad stack' },
          h('div', { class: 'note', text: 'Agent (Claude Code, Claude web/desktop, hoặc agent bất kỳ hỗ trợ MCP) gọi 12 tool: tra kho, kiểm, dựng SVG, lưu nhân vật, viết và lưu kịch bản, kiểm và cập nhật phiên bản. Kết quả hiện ngay trong Studio.' }),
          h('div', { class: 'kv' },
            h('label', { text: 'Qua Internet' }),
            link ? h('div', { class: 'stack' },
              h('pre', { class: 'code', text: link }),
              h('div', null, copyBtn('Sao chép link', link), ' ', copyBtn('Sao chép lệnh Claude Code', 'claude mcp add -s user --transport http gen-chibi ' + link)),
              h('div', { class: 'note', text: 'Claude web/desktop: Settings › Connectors › Add custom connector › dán link. Giữ kín link; lộ thì chạy genchibi expose --rotate.' }))
              : h('div', { class: 'note', text: 'Chưa mở. Trong terminal: genchibi expose <tên-miền> (tên miền do Cloudflare quản lý) hoặc genchibi expose --quick để thử nhanh. Lệnh in ra một link — agent dán link là nối được.' }),
            h('label', { text: 'Claude Code (stdio)' }), h('pre', { class: 'code', text: 'claude mcp add gen-chibi -- genchibi mcp' }),
            h('label', { text: 'Claude Code (HTTP)' }), h('pre', { class: 'code', text: 'claude mcp add --transport http gen-chibi http://localhost:' + port + '/mcp' }),
            h('label', { text: 'Cấu hình JSON' }), h('pre', { class: 'code', text: JSON.stringify({ mcpServers: { 'gen-chibi': { command: 'genchibi', args: ['mcp'] } } }, null, 2) })))));
    }
  };

  /* ============================================================ trang: Cổng kiểm & hiệu năng */
  PAGES.gates = function () {
    crumbs([{ t: 'Cổng kiểm & hiệu năng' }]);
    var t = h('table', { class: 'grid' });
    var all = GC.assets();
    var head = GC.gate(all[0], { poses: true }).map(function (g) { return g.label; });
    t.appendChild(h('tr', null, h('th', { text: 'Nhân vật' }), head.map(function (x) { return h('th', { text: x }); }), h('th', { text: 'Xuất' })));
    all.forEach(function (a) {
      var gs = GC.gate(a, { poses: true }), ok = gs.every(function (g) { return g.ok; });
      t.appendChild(h('tr', null, h('td', null, h('span', { class: 'mono note', text: (a.code || '') + ' ' }), a.name),
        gs.map(function (g) { return h('td', { class: g.ok ? 'ok' : 'bad', title: g.detail || '', style: 'font-weight:600', text: g.ok ? 'Đạt' : 'Không đạt' }); }),
        h('td', { class: ok ? 'ok' : 'bad', style: 'font-weight:600', text: ok ? 'Được xuất' : 'Chặn' })));
    });
    var res = h('div', { class: 'note' });
    var host = h('div', { class: 'stage', style: 'display:grid;grid-template-columns:repeat(auto-fill,40px);gap:2px;max-height:300px;overflow:hidden;padding:4px' });
    function bench(n, tier) {
      clear(host); res.textContent = 'Đang đo ' + n + ' nhân vật ở tầng ' + tier + '…';
      var insts = [], list = GC.assets();
      for (var i = 0; i < n; i++) {
        var d = h('div', { style: 'width:40px;height:40px' }); host.appendChild(d);
        insts.push(R.mount(d, list[i % list.length], LIB.stateOrder[i % LIB.stateOrder.length], { tier: tier, crop: true, noShadow: true, force: tier === 'full' }));
      }
      // bỏ 600 ms đầu (trình duyệt giải mã ảnh lần đầu), đo 2,5 giây sau đó
      var frames = [], last = 0, start = performance.now();
      (function tick(now) {
        if (last && now - start > 600) frames.push(now - last);
        last = now;
        if (now - start < 3100) return requestAnimationFrame(tick);
        frames.sort(function (a, b) { return a - b; });
        var avg = frames.reduce(function (a, b) { return a + b; }, 0) / frames.length;
        var fps = Math.round(1000 / avg);
        res.textContent = n + ' nhân vật · tầng ' + tier + ' · ' + fps + ' fps (p95 ' + Math.round(frames[Math.floor(frames.length * 0.95)]) + ' ms/khung) · ' + (fps >= 55 ? 'ĐẠT' : 'CHẬM');
        res.className = fps >= 55 ? 'ok' : 'bad';
        insts.forEach(function (x) { x.destroy(); });
      })(start);
    }
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'panel scroll' }, h('h3', null, 'Cổng kiểm tự động', h('span', { class: 'r note', text: 'không đạt thì không được xuất' })), t),
      h('div', { class: 'panel' }, h('h3', null, 'Hiệu năng (ngân sách vẽ)'), h('div', { class: 'pad stack' },
        h('div', { class: 'note', text: 'Tầng ảnh dùng cho danh sách (hàng trăm nhân vật), tầng thở cho avatar đang hiện, tầng diễn đủ tối đa ' + R.budget + ' nhân vật cùng lúc.' }),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: function () { bench(300, 'image'); } }, '300 · tầng ảnh'),
          h('button', { class: 'btn', onclick: function () { bench(60, 'idle'); } }, '60 · tầng thở'),
          h('button', { class: 'btn', onclick: function () { bench(8, 'full'); } }, '8 · diễn đủ')),
        res, host))));
  };

  /* ============================================================ trang: Cập nhật */
  PAGES.update = function () {
    crumbs([{ t: 'Cập nhật' }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel empty', text: 'Bản xem thử không tự cập nhật. Cài bản chạy trên máy bằng một lệnh trong README để có cập nhật tự động.' })); return; }
    var box = h('div', { class: 'stack' });
    $('view').appendChild(box);
    function load() { Store.api('GET', 'api/update').then(render).catch(function (e) { clear(box); box.appendChild(h('div', { class: 'panel empty', text: e.message })); }); }
    function render(s) {
      clear(box);
      updateBadge = s.available ? s.latest : false; renderNav();
      var auto = h('input', { type: 'checkbox', checked: !!(s.settings && s.settings.autoUpdate), onchange: function () {
        Store.api('PUT', 'api/settings', { autoUpdate: auto.checked }).then(function () { toast(auto.checked ? 'Đã bật tự cập nhật.' : 'Đã tắt tự cập nhật: chỉ báo khi có bản mới.'); });
      } });
      var checkB = h('button', { class: 'btn', onclick: function () {
        checkB.disabled = true; checkB.textContent = 'Đang kiểm tra…';
        Store.api('POST', 'api/update/check').then(render).catch(function (e) { toast(e.message); checkB.disabled = false; checkB.textContent = 'Kiểm tra phiên bản'; });
      } }, 'Kiểm tra phiên bản');
      var applyB = h('button', { class: 'btn primary', disabled: !s.available && !s.newer, onclick: function () {
        applyB.disabled = true; applyB.textContent = 'Đang tải bản mới…';
        Store.api('POST', 'api/update/apply', { force: !s.available && !!s.newer }).then(function (r) { toast(r.message); if (r.restart) waitRestart(s.latest); else load(); })
          .catch(function (e) { toast(e.message); load(); });
      } }, s.available ? 'Cập nhật ngay lên ' + s.latest : (s.newer ? 'Thử lại ' + s.latest : 'Cập nhật ngay'));
      var cur = 'v' + String(s.current).replace(/^v/, '');
      var status = s.available ? h('span', { class: 'chip warn', text: 'Có bản mới ' + s.latest })
        : s.skipped ? h('span', { class: 'chip bad', text: s.latest + ' đã bị bỏ qua vì lần trước chạy lỗi' })
          : s.latest ? h('span', { class: 'chip ok', text: 'Đang dùng bản mới nhất' }) : h('span', { class: 'chip', text: 'Chưa kiểm tra' });
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Phiên bản'), h('div', { class: 'pad kv' },
        h('label', { text: 'Đang chạy' }), h('b', { class: 'mono', text: cur }),
        h('label', { text: 'Mới nhất' }), h('div', { class: 'row' }, h('span', { class: 'mono', text: s.latest || '—' }), status),
        h('label', { text: 'Kiểm tra lần cuối' }), h('span', { class: 'note', text: fmtTime(s.lastCheck) + (s.error ? ' · lỗi: ' + s.error : '') }),
        h('label', { text: 'Tự cập nhật' }), h('label', { class: 'row' }, auto, h('span', { class: 'note', text: 'kiểm tra mỗi ' + ((s.settings || {}).checkHours || 6) + ' giờ; luôn backup dữ liệu trước khi cập nhật; tự chạy lại bản cũ nếu bản mới lỗi' })),
        h('span'), h('div', { class: 'row' }, checkB, applyB))));
      if (s.notes) box.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Thay đổi trong ' + s.latest), h('div', { class: 'pad' }, h('pre', { class: 'code', style: 'white-space:pre-wrap', text: s.notes }))));
      var hist = h('table', { class: 'grid' });
      hist.appendChild(h('tr', null, ['Lúc', 'Loại', 'Từ', 'Sang', 'Kết quả', 'Backup'].map(function (c) { return h('th', { text: c }); })));
      (s.history || []).forEach(function (e) {
        hist.appendChild(h('tr', null, h('td', { class: 'nw note', text: fmtTime(e.at) }), h('td', { text: e.kind === 'rollback' ? 'Chạy lại bản cũ' : 'Cập nhật' }),
          h('td', { class: 'v', text: e.from || '—' }), h('td', { class: 'v', text: e.to || '—' }),
          h('td', null, h('span', { class: 'chip ' + (e.ok ? 'ok' : 'bad'), text: e.ok ? 'Thành công' : (e.rolledBack ? 'Lỗi · đã tự chạy lại bản cũ' : 'Lỗi') }), e.error ? h('div', { class: 'note', text: e.error }) : null),
          h('td', { class: 'note mono', text: e.backup || '—' })));
      });
      var rb = h('button', { class: 'btn danger', disabled: !s.canRollback, onclick: function () {
        if (rb.getAttribute('data-confirm') !== '1') { rb.setAttribute('data-confirm', '1'); rb.textContent = 'Xác nhận chạy lại ' + s.previous + ' (bấm lần nữa)'; return; }
        Store.api('POST', 'api/update/rollback', { confirm: 'ROLLBACK' }).then(function (r) { toast(r.message); waitRestart(s.previous); }).catch(function (e) { toast(e.message); });
      } }, s.canRollback ? 'Chạy lại bản cũ ' + s.previous : 'Chưa có bản cũ');
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Lịch sử cập nhật', h('span', { class: 'r' }, rb)),
        (s.history || []).length ? h('div', { class: 'scroll' }, hist) : h('div', { class: 'pad note', text: 'Chưa có lần cập nhật nào.' }),
        h('div', { class: 'pad note', text: 'Phiên bản đã cài trên máy: ' + (s.installed || []).join(', ') })));
    }
    function waitRestart(target) {
      clear(box); box.appendChild(h('div', { class: 'panel empty', text: 'Đang khởi động lại để chạy ' + (target || 'bản mới') + '… trang sẽ tự tải lại.' }));
      var n = 0;
      (function poll() {
        setTimeout(function () {
          fetch('api/health').then(function (r) { return r.json(); }).then(function (j) {
            if (target && 'v' + String(j.version).replace(/^v/, '') === target) location.reload();
            else if (++n < 60) poll(); else location.reload();
          }).catch(function () { if (++n < 60) poll(); });
        }, 1000);
      })();
    }
    load();
  };

  /* ============================================================ khởi động */
  Store.init().then(function () {
    $('verChip').textContent = Store.mode === 'server' ? 'v' + String(Store.info.version).replace(/^v/, '') : 'xem thử';
    $('modeNote').textContent = Store.mode === 'server' ? 'Đang chạy trên máy · dữ liệu lưu cục bộ' : 'Bản xem thử · lưu trong trình duyệt';
    var r = { page: 'lib-characters' };
    try { var saved = JSON.parse(localStorage.getItem('gc-route') || 'null'); if (saved && PAGES[saved.page] && (saved.page !== 'character' || GC.ASSETS[saved.key])) r = saved; } catch (e) { /* bỏ qua */ }
    if (Store.mode === 'server') Store.api('GET', 'api/update').then(function (s) { updateBadge = s.available ? s.latest : false; go(r); }).catch(function () { go(r); });
    else go(r);
  });
})();
