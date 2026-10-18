/* gen-chibi Studio — giao diện quản lý (Data Console, desktop-first)
 * © 2026 Gen Labs — All rights reserved.
 * Hai chế độ lưu: "máy chủ" (bản cài, /api) hoặc "trình duyệt" (xem thử, localStorage).
 */
(function () {
  'use strict';
  var GC = window.GenChibi, LIB = GC.LIB, R = GC.render;
  // 8 hướng (2.5D): tên góc → nhãn. Thứ tự = GC.VIEW_ORDER. Sprite 8 hướng đi vòng theo chiều kim đồng hồ từ chính diện.
  var VIEW_LABEL = { front: 'Chính diện', left: '3/4 trái', right: '3/4 phải', left45: '45° trái', right45: '45° phải', left90: '90° trái', right90: '90° phải',
    left135: '135° trái', right135: '135° phải', back: 'Sau lưng' };
  var VIEWS_ALL = GC.VIEW_ORDER.map(function (v) { return [v, VIEW_LABEL[v] || v]; });
  var DIR8 = ['front', 'left45', 'left90', 'left135', 'back', 'right135', 'right90', 'right45'];
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
  // Ba lớp, mỗi lớp một chủ và một nhịp thay đổi:
  //   XƯỞNG    = bộ khung chuẩn (Gen Labs giữ) + tạo asset từ khung: chọn khung → tham số → soát → cổng kiểm → lưu;
  //   THƯ VIỆN = asset đã qua cổng, xếp theo dự án chủ đề — xem, tải ảnh, chép mã;
  //   TẠO TÁC  = làm phim / truyện với AI đạo diễn từ asset trong Thư viện. Dòng chảy: Xưởng → Thư viện → Tạo tác (docs/spec/DAC-TA-3-GIAI-DOAN.md).
  var NAV = [
    ['fab', 'Xưởng', 'tạo asset từ khung', [['create', 'Tạo asset mới'], ['characters', 'Bàn chỉnh nhân vật'], ['items', 'Bàn chỉnh vật phẩm'], ['scenes', 'Bàn chỉnh bối cảnh'], ['workshop', 'Trợ lý AI tạo asset']]],
    ['fab', 'Khung chuẩn', 'quy cách · kiểm (Gen Labs giữ)', [['khung', 'Bộ khung chuẩn'], ['library', 'Kho linh kiện & phông'], ['poses', 'Khung tư thế & hoạt động'], ['states', 'Khung biểu cảm & động tác'], ['gates', 'Cổng kiểm & hiệu năng']]],
    ['lib', 'Thư viện', 'theo dự án chủ đề · lấy về dùng', [['projects', 'Dự án chủ đề'], ['lib-characters', 'Nhân vật'], ['lib-items', 'Vật phẩm'], ['lib-scenes', 'Bối cảnh']]],
    ['make', 'Tạo tác', 'làm phim / truyện với AI', [['works', 'Tác phẩm']]],
    ['sys', 'Hệ thống', '', [['ai', 'Cài đặt AI'], ['update', 'Cập nhật']]]
  ];
  var PAGE_ALIAS = { character: 'characters', export: 'lib-characters' };
  // BA ỨNG DỤNG ĐỘC LẬP (Ryan 2026-10-18): mỗi lớp một địa chỉ, một menu, một màu — không lẫn nhau.
  //   /xuong · /thu-vien · /tao-tac (bản xem thử không có server: ?app=…). "/" = màn chọn lớp.
  //   Trang Hệ thống (Cài đặt AI, Cập nhật) có ở cả ba. Bấm sang trang của lớp khác → mở ứng dụng của lớp đó.
  var PAGES = {};
  var APPS = [
    { id: 'xuong', zone: 'fab', name: 'Xưởng', desc: 'Bộ khung chuẩn (không chủ đề) → tạo asset: chọn khung, thêm tham số, soát mọi góc, qua cổng kiểm, lưu vào dự án.', home: 'create' },
    { id: 'thu-vien', zone: 'lib', name: 'Thư viện', desc: 'Asset đã qua cổng kiểm, xếp theo dự án chủ đề — xem, tải ảnh / sprite, chép mã, tải gói dự án.', home: 'projects' },
    { id: 'tao-tac', zone: 'make', name: 'Tạo tác', desc: 'Làm phim / truyện với AI đạo diễn: chat, kịch bản, phân cảnh, cảnh thành phẩm, sân khấu final.', home: 'works' }
  ];
  function appById(id) { return APPS.filter(function (a) { return a.id === id; })[0] || null; }
  function appOfZone(z) { return APPS.filter(function (a) { return a.zone === z; })[0] || null; }
  var APP = (function () {
    var q = null; try { q = new URLSearchParams(location.search).get('app'); } catch (e) { /* bỏ qua */ }
    return appById(q) || appById(location.pathname.split('/').filter(Boolean).pop() || '');
  })();
  function appURL(id) { return Store.mode === 'server' ? '/' + (id || '') : (id ? '?app=' + id : '?'); }
  function routeKey(app) { return 'gc-route-' + (app ? app.id : 'home'); }
  function zoneOf(page) {
    if (page === 'home') return 'home';
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
    // số đếm Thư viện không tính đồ của khung (khung thuộc Xưởng)
    var lib = function (arr) { return arr.filter(function (x) { return groupOf(x) !== 'frame'; }).length; };
    var COUNT = { 'lib-characters': function () { return lib(GC.assets()); }, 'lib-items': function () { return lib(GC.items()); }, 'lib-scenes': function () { return lib(GC.scenes()); }, projects: function () { return Projects.all().length; } };
    // chuyển ứng dụng: 3 lớp, lớp đang mở nổi bật; các lớp khác là liên kết sang ứng dụng riêng
    var sw = h('div', { class: 'appswitch' });
    APPS.forEach(function (a) {
      sw.appendChild(h('a', { class: 'zone-' + a.zone, href: appURL(a.id), 'aria-current': APP && APP.id === a.id ? 'page' : null, title: a.desc }, a.name));
    });
    nav.appendChild(sw);
    NAV.forEach(function (g) {
      if (!APP || (g[0] !== APP.zone && g[0] !== 'sys')) return;   // mỗi ứng dụng chỉ có menu của lớp mình (+ Hệ thống)
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
    var z = zoneOf(r.page);
    if (z !== 'sys' && z !== 'home' && (!APP || z !== APP.zone)) {   // trang thuộc lớp khác → sang ứng dụng của lớp đó
      var other = appOfZone(z);
      try { localStorage.setItem(routeKey(other), JSON.stringify(r)); } catch (e) { /* bỏ qua */ }
      location.href = appURL(other.id);
      return;
    }
    cleanup.forEach(function (f) { try { f(); } catch (e) { /* bỏ qua */ } });
    cleanup = [];
    route = r;
    try { localStorage.setItem(routeKey(APP), JSON.stringify(r)); } catch (e) { /* bỏ qua */ }
    renderNav();
    document.body.setAttribute('data-zone', APP ? APP.zone : 'home');
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
  var ZONE_LABEL = { lib: 'Thư viện', make: 'Tạo tác', fab: 'Xưởng', sys: 'Hệ thống', home: 'gen-chibi' };
  // Màn chọn lớp ("/"): ba ứng dụng độc lập theo dòng chảy Xưởng → Thư viện → Tạo tác
  PAGES.home = function () {
    crumbs([{ t: 'Chọn khu làm việc' }]);
    var lib = function (arr) { return arr.filter(function (x) { return groupOf(x) !== 'frame'; }).length; };
    var stat = {
      xuong: GC.assets().filter(function (a) { return groupOf(a) === 'frame'; }).length + ' khung nhân vật · ' + GC.items().filter(function (a) { return groupOf(a) === 'frame'; }).length + ' khối vật phẩm · ' + GC.scenes().filter(function (a) { return groupOf(a) === 'frame'; }).length + ' sân khấu chuẩn',
      'thu-vien': Projects.all().length + ' dự án · ' + lib(GC.assets()) + ' nhân vật · ' + lib(GC.items()) + ' vật phẩm · ' + lib(GC.scenes()) + ' bối cảnh',
      'tao-tac': 'chat AI đạo diễn · kịch bản · phân cảnh · sân khấu final'
    };
    var row = h('div', { class: 'apps' });
    APPS.forEach(function (a, i) {
      row.appendChild(h('a', { class: 'appcard zone-' + a.zone, href: appURL(a.id) },
        h('span', { class: 'step', text: String(i + 1) }), h('b', { text: a.name }), h('p', { text: a.desc }), h('span', { class: 'note', text: stat[a.id] }), h('span', { class: 'go', text: 'Mở ' + a.name + ' ›' })));
    });
    // Bắt đầu nhanh: 3 bước theo đúng dòng chảy, tự đánh dấu bước đã xong và đưa nút cho bước kế tiếp
    var qs = h('div', { class: 'panel quick' });
    $('view').appendChild(h('div', { class: 'stack' }, qs, h('p', { class: 'note', text: 'Ba khu là ba ứng dụng riêng, mỗi khu một việc. Dòng chảy: Xưởng tạo asset → Thư viện cất theo dự án → Tạo tác dùng để làm phim.' }), row));
    function paintQuick(works) {
      var mine = lib(GC.assets()) + lib(GC.items()) + lib(GC.scenes()), last = lastProject();
      var steps = [
        { t: 'Tạo dự án chủ đề', d: 'Ví dụ "Văn phòng vui", "Cổ tích Việt" — mọi asset và tác phẩm xếp theo dự án.', done: Projects.all().length > 0, go: { page: 'projects' }, app: 'Thư viện' },
        { t: 'Tạo nhân vật, vật phẩm, bối cảnh từ khung', d: 'Chọn khung → đổi tham số, màu → soát 8 hướng → lưu vào dự án.', done: mine > 0, go: { page: 'create', project: last }, app: 'Xưởng' },
        { t: 'Làm phim với AI đạo diễn', d: 'Tạo tác phẩm, chat với AI: kịch bản → phân cảnh → lời thoại → diễn bản final.', done: works > 0, go: { page: 'works', project: last }, app: 'Tạo tác' }
      ];
      var next = steps.filter(function (s) { return !s.done; })[0];
      clear(qs);
      qs.appendChild(h('h3', null, 'Bắt đầu nhanh', h('span', { class: 'r note', text: steps.filter(function (s) { return s.done; }).length + '/3 bước' })));
      var ol = h('ol', { class: 'qsteps' });
      steps.forEach(function (s, i) {
        ol.appendChild(h('li', { class: s.done ? 'done' : s === next ? 'next' : '' }, h('span', { class: 'n', text: s.done ? '✓' : String(i + 1) }),
          h('div', null, h('b', { text: s.t }), h('span', { class: 'note', text: s.d })),
          h('button', { class: 'btn sm' + (s === next ? ' primary' : ''), onclick: function () { go(s.go); } }, (s.done ? 'Mở ' : 'Làm ngay ở ') + s.app + ' ›')));
      });
      qs.appendChild(h('div', { class: 'pad stack' }, ol, Store.mode === 'server' && !Projects.all().some(function (p) { return p.id === DEMO_ID; }) ? h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: importDemo }, '✨ Mở dự án mẫu "Văn phòng vui"'), h('span', { class: 'note', text: '3 nhân vật · 2 bối cảnh · phim 4 phân cảnh — xem trọn luồng trong 10 giây, sửa và xuất thử thoải mái.' })) : null));
    }
    paintQuick(0);
    if (Store.mode === 'server') Store.api('GET', 'api/works').then(function (l) { paintQuick(l.length); }).catch(function () {});
  };
  // dự án dùng gần nhất: Xưởng / Tạo tác tự chọn sẵn để người dùng không phải chọn lại mỗi lần
  function lastProject() { try { var v = localStorage.getItem('gc-last-project') || ''; return GC.projectId(v) ? v : ''; } catch (e) { return ''; } }
  function setLastProject(v) { try { localStorage.setItem('gc-last-project', v || ''); } catch (e) { /* bỏ qua */ } }
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
  PAGES.characters = function () {
    crumbs([{ t: 'Bàn chỉnh nhân vật' }]);
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
  // nhân vật mới luôn đi qua Xưởng › Tạo asset mới (chọn khung → tham số → soát → cổng → lưu vào dự án) — không lưu bản mồ côi
  function newCharacter() { go({ page: 'create', kind: 'character', frame: 'afi.khung/ma-no-canh' }); }

  /* ============================================================ trang: Hồ sơ nhân vật */
  PAGES.character = function (r) {
    var orig = GC.ASSETS[r.key];
    if (!orig) return go({ page: 'characters' });
    var w = clone(orig);       // bản làm việc
    w.pack = orig.pack; w.key = orig.key;
    var dirty = false, pState = 'normal';
    crumbs([{ t: 'Bàn chỉnh nhân vật', go: { page: 'characters' } }, { t: orig.name }]);
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
        var inp = h(attrs && attrs.area ? 'textarea' : 'input', Object.assign({ type: 'text', 'aria-label': label, rows: '2', oninput: function () { (obj || w)[key] = inp.value; dirty = true; saveBtn.disabled = false; undoBtn.disabled = false; if (key === 'name') crumbs([{ t: 'Bàn chỉnh nhân vật', go: { page: 'characters' } }, { t: inp.value }]); } }));
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
    var VIEWS = ['front', 'left45', 'left90', 'left135', 'back'].map(function (v) { return [v, VIEW_LABEL[v]]; });
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
      var sc = { key: 'bench/' + slot + '-' + p.pack + '-' + p.id, id: 'bench', layers: { sky: { part: 'afi.khung/khung-troi', dx: 0 }, ground: { part: 'afi.khung/khung-nen', dx: 0 } }, deco: [], palette: {}, time: 'day', weather: 'clear', spots: S.spotOrder.slice() };
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
      var demo = GC.getAsset('ma-no-canh'), cast = demo ? [{ asset: demo, spot: 'center' }] : [];
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
        h('div', { class: 'panel scroll' }, h('h3', null, 'Nhóm thư viện', h('span', { class: 'r note', text: 'Gen Labs lo khung chuẩn và thư viện chính thức; thứ người dùng tạo ra nằm trong thư viện của họ.' })), pt),
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
    crumbs([{ t: 'Bàn chỉnh vật phẩm' }]);
    var I = GC.ITEM, u = function (svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); };
    var sel = GC.getItem(r.key) || GC.items()[0], who = 'ma-no-canh', view = 'front';
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
    [['', 'Tự động']].concat(VIEWS_ALL).forEach(function (v) {
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
      info.textContent = 'Đang diễn: ' + stateLabel(stateOf()) + ' · ' + (st.kind ? (VIEW_LABEL[dirOf().view] || st.kind) + (st.fallback45 && st.fallback45.length ? ' (linh kiện mượn góc gần nhất: ' + st.fallback45.join(', ') + ')' : ' (vẽ thật đủ bộ)') : st.turn ? (st.turn < 0 ? '3/4 trái' : '3/4 phải') : 'chính diện') + ' · tư thế ' + (LIB.postures[st.posture] || {}).label + ' · ' +
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


  /* ============================================================ trang: Trợ lý AI (chat) — lớp Tạo tác */
  // AI chạy bằng LLM API của người dùng, nhưng CHỈ tạo/sửa qua bộ tool của nhà xưởng (cùng bộ với MCP)
  // → cùng cổng kiểm, cùng chuẩn với mọi asset khác. Lịch sử chat giữ trong trình duyệt này.
  var chatLog = [];
  PAGES.workshop = function () {
    crumbs([{ t: 'Trợ lý AI tạo asset' }]);
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
      h('div', { class: 'panel' }, h('h3', null, 'Trợ lý AI', h('span', { class: 'r note', text: 'cùng bộ tool + cùng cổng kiểm với agent MCP · model: Cài đặt AI' })),
        off ? h('div', { class: 'pad note', text: 'Cần chạy bản cài trên máy (server) và nhập LLM API key ở Cài đặt AI.' }) : box,
        off ? null : h('div', { class: 'pad stack' }, input, h('div', { class: 'row' }, send, clearB, status, h('span', { class: 'note', text: 'Ctrl+Enter để gửi' }))))));
    paint();
  };

  /* ============================================================ TẠO TÁC › Tác phẩm (giai đoạn ③) */
  // 5 khu: chat với AI đạo diễn · kịch bản · phân cảnh (mô tả) · cảnh thành phẩm · sân khấu final (ghép mọi phân cảnh thành chuỗi).
  // Mọi ghi đều qua API → cùng cổng với MCP; AI thiếu asset thì tự vào Xưởng tạo (đúng dự án của tác phẩm).
  // Trình diễn nằm ở engine/player.js (GC.film) — dùng chung với tệp phim xuất ra.
  function stillURL(shot) { var svg = GC.film.still(shot); return svg ? svgURL(svg) : ''; }
  // Gói phụ thuộc của một nhóm asset "của tôi": nhân vật + trang bị nhân vật đang mặc + cảnh + linh kiện / phông tự vẽ đang dùng.
  // Dùng cho: tải gói dự án, xuất phim HTML độc lập (người xem không cần bản cài).
  function bundleOf(chars, items, scenes) {
    var ch = {}, it = {}, sc = {}, parts = {};
    function part(p) { if (p && p.pack === MY_PACK && p.data) parts[(p.kind === 'scenery' ? 'sc:' : '') + p.slot + ':' + p.id] = p.data; }
    function addItem(x) { if (!x || x.pack !== MY_PACK || it[x.key]) return; it[x.key] = x; part(GC.getPart(x.equip.slot, x.equip.part)); }
    (chars || []).forEach(function (a) {
      if (!a || (a.pack !== MY_PACK && !a.savedAt) || ch[a.key]) return;   // "của tôi" + bản đã chỉnh lưu trong kho (asset gốc đã nằm trong script)
      ch[a.key] = a;
      LIB_SLOTS().forEach(function (sl) { var ref = GC.partRef(a, sl); part(ref && GC.getPart(sl, ref, a.pack)); });
      Object.keys((a.look && a.look.equip) || {}).forEach(function (sl) { addItem(GC.ITEMS[a.look.equip[sl]] || GC.getItem(a.look.equip[sl], MY_PACK)); });
    });
    (items || []).forEach(addItem);
    (scenes || []).forEach(function (x) {
      if (!x || x.pack !== MY_PACK || sc[x.key]) return;
      sc[x.key] = x;
      Object.keys(x.layers).map(function (k) { return x.layers[k].part; }).concat(x.deco.map(function (d) { return d.part; })).forEach(function (ref) {
        Object.keys(LIB.parts).forEach(function (k) { var q = LIB.parts[k]; if (q.kind === 'scenery' && q.pack + '/' + q.id === ref) part(q); });
      });
    });
    var vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
    return { characters: vals(ch), items: vals(it), scenes: vals(sc), parts: vals(parts) };
  }
  /* ---- Xuất thành phẩm của tác phẩm ---- */
  // cắt theo code point (không chẻ đôi emoji → encodeURIComponent không ném lỗi); bỏ ký tự điều khiển (XML không cho phép)
  function cut(t, n) { var a = Array.from(String(t == null ? '' : t)); return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); }
  function xml(t) { return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function wrapText(t, n, max) {   // ngắt dòng theo số ký tự (đủ dùng cho tiếng Việt đơn giản), tối đa max dòng
    var out = [], line = '';
    String(t || '').replace(/\s+/g, ' ').trim().split(' ').forEach(function (w) {
      if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
    });
    if (line) out.push(line);
    if (out.length > max) { out = out.slice(0, max); out[max - 1] = cut(out[max - 1], Array.from(out[max - 1]).length - 1); }
    return out;
  }
  // Storyboard: một SVG — đầu trang (tên, logline) + lưới 2 cột: ảnh phân cảnh, mô tả, lời thoại
  function storyboard(W) {
    var COLS = 2, CW = 560, IH = 315, TH = 150, GAP = 24, M = 32, HEAD = 96;
    var rows = Math.max(1, Math.ceil(W.shots.length / COLS)), Wd = M * 2 + COLS * CW + (COLS - 1) * GAP, Hd = HEAD + rows * (IH + TH + GAP) + M;
    var o = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + Wd + ' ' + Hd + '" font-family="Arial, Helvetica, sans-serif">' +
      '<rect width="100%" height="100%" fill="#f6f4ef"/>' +
      '<text x="' + M + '" y="52" font-size="28" font-weight="700" fill="#1c1b1e">' + xml(W.title) + '</text>' +
      '<text x="' + M + '" y="80" font-size="14" fill="#5e5a53">' + xml(cut(W.logline || '', 140)) + '</text>' +
      '<text x="' + (Wd - M) + '" y="52" font-size="12" fill="#8e897f" text-anchor="end">Storyboard · ' + W.shots.length + ' phân cảnh · gen-chibi · © 2026 Gen Labs</text>';
    W.shots.forEach(function (s, i) {
      var x = M + (i % COLS) * (CW + GAP), y = HEAD + Math.floor(i / COLS) * (IH + TH + GAP), svg = GC.film.still(s);
      var names = {}; GC.film.actors(s).forEach(function (a) { names[a.id] = a.name; });
      o += '<rect x="' + x + '" y="' + y + '" width="' + CW + '" height="' + (IH + TH) + '" rx="10" fill="#fff" stroke="#e6e2d9"/>';
      o += svg ? '<image x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (CW - 2) + '" height="' + IH + '" preserveAspectRatio="xMidYMid slice" href="data:image/svg+xml;base64,' + b64(svg) + '"/>'
        : '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (CW - 2) + '" height="' + IH + '" fill="#efece5"/><text x="' + (x + CW / 2) + '" y="' + (y + IH / 2) + '" font-size="14" fill="#8e897f" text-anchor="middle">chưa có bối cảnh</text>';
      o += '<circle cx="' + (x + 22) + '" cy="' + (y + 22) + '" r="14" fill="#2e8b5e"/><text x="' + (x + 22) + '" y="' + (y + 27) + '" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">' + (i + 1) + '</text>';
      var ty = y + IH + 24;
      o += '<text x="' + (x + 14) + '" y="' + ty + '" font-size="16" font-weight="700" fill="#1c1b1e">' + xml(s.title) + '</text>';
      wrapText(s.description, 74, 2).forEach(function (l, k) { o += '<text x="' + (x + 14) + '" y="' + (ty + 20 + k * 17) + '" font-size="12.5" fill="#5e5a53">' + xml(l) + '</text>'; });
      var lines = (s.event ? s.event.steps : []).slice(0, 4).map(function (st) { return (names[st.actor] || st.actor) + ': ' + st.say; });
      if (s.event && s.event.steps.length > 4) lines[3] = lines[3] + '  (+' + (s.event.steps.length - 4) + ')';
      if (!lines.length) lines = ['(chưa có lời thoại)'];
      lines.forEach(function (l, k) { o += '<text x="' + (x + 14) + '" y="' + (ty + 62 + k * 17) + '" font-size="12" fill="#1c1b1e" font-style="italic">' + xml(cut(l, 80)) + '</text>'; });
    });
    return o + '</svg>';
  }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  // Phim HTML độc lập: engine + thư viện đang nạp + asset "của tôi" mà tác phẩm dùng + bộ phát — một tệp, mở bằng trình duyệt là xem
  function exportFilm(W) {
    var chars = [], scenes = [];
    W.shots.forEach(function (s) { chars = chars.concat(GC.film.actors(s)); var sc = GC.film.scene(s); if (sc) scenes.push(sc); });
    var data = bundleOf(chars, [], scenes);
    var srcs = Array.prototype.map.call(document.scripts, function (x) { return x.getAttribute('src') || ''; }).filter(function (x) { return /^(engine|kinds)\//.test(x); });
    if (srcs.indexOf('engine/player.js') < 0) { toast('Thiếu engine/player.js'); return; }
    toast('Đang đóng gói phim…');
    Promise.all(srcs.map(function (f) { return fetch(f).then(function (r) { if (!r.ok) throw new Error('Không tải được ' + f); return r.text(); }); }))
      .then(function (texts) {
        var pick = function (o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; };
        data = { parts: data.parts, characters: data.characters.map(function (a) { return pick(a, ['id', 'pack', 'name', 'version', 'look', 'expressions', 'kind']); }),
          items: data.items.map(function (x) { return pick(x, ['id', 'name', 'type', 'rarity', 'equip']); }),
          scenes: data.scenes.map(function (x) { return pick(x, ['id', 'name', 'layers', 'deco', 'palette', 'time', 'weather', 'spots']); }) };
        var film = { title: W.title, logline: W.logline || '', shots: W.shots.map(function (s) { return { id: s.id, title: s.title, description: s.description || '', scene: s.scene, cast: s.cast, event: s.event }; }) };
        var safe = function (t) { return t.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'); };
        var html = '<!doctype html>\n<!--\n  Phim "' + xml(W.title) + '" — làm bằng gen-chibi.\n  Bộ phát (engine/*, kinds/*) © 2026 Gen Labs — All rights reserved. Giấy phép: CHỈ ĐỂ XEM phim này.\n  Không trích xuất, sao chép, sửa đổi hay tái sử dụng mã bộ phát cho mục đích khác.\n-->\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + xml(W.title) + ' — gen-chibi</title>\n' +
          '<meta name="generator" content="gen-chibi ' + xml(String((Store.info || {}).version || '')) + ' · Gen Labs">\n<style>' + FILM_CSS + '</style>\n</head>\n<body>\n' +
          '<main class="film"><header><div><h1>' + xml(W.title) + '</h1><p>' + xml(W.logline || '') + '</p></div><span class="badge">' + W.shots.length + ' phân cảnh</span></header>\n' +
          '<div class="screen"><div id="stage"></div><button id="big" class="big" aria-label="Xem phim">▶</button></div>\n' +
          '<div class="bar"><button id="play">▶ Xem</button><button id="stop">■ Dừng</button><button id="full">⛶ Toàn màn hình</button><span id="prog"></span></div>\n' +
          '<ol id="chapters"></ol>\n<footer>Làm bằng gen-chibi · Bộ phát © 2026 Gen Labs — chỉ để xem phim này</footer></main>\n' +
          texts.map(function (t, i) { return '<script>/* ' + srcs[i] + ' */\n' + safe(t) + '\n</script>'; }).join('\n') + '\n' +
          '<script>\nvar DATA = ' + jsonForScript(data) + ';\nvar FILM = ' + jsonForScript(film) + ';\n' + FILM_BOOT + '\n</script>\n</body>\n</html>\n';
        download(slugify(W.title) + '.html', html, 'text/html');
        toast('Đã xuất phim "' + W.title + '" (' + Math.round(html.length / 1024) + ' KB) — mở bằng trình duyệt bất kỳ để xem.');
      }).catch(function (e) { toast(e.message); });
  }
  var FILM_CSS = [
    '*{box-sizing:border-box}html,body{margin:0;background:#121214;color:#ece9e2;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.film{max-width:min(1200px,96vw);margin:0 auto;padding:24px 0 40px;display:grid;gap:14px}',
    'header{display:flex;align-items:flex-end;gap:16px}header h1{margin:0;font-size:26px;letter-spacing:-.01em}header p{margin:4px 0 0;color:#a8a49d}',
    '.badge{margin-left:auto;font-size:12px;color:#a8a49d;border:1px solid #34333a;border-radius:12px;padding:2px 10px;white-space:nowrap}',
    '.screen{position:relative;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgb(0 0 0/.45)}.screen .gcp{border-radius:0}',
    '.big{position:absolute;inset:0;margin:auto;width:84px;height:84px;border-radius:50%;border:0;background:rgb(255 255 255/.92);color:#121214;font-size:30px;cursor:pointer;z-index:9;box-shadow:0 8px 30px rgb(0 0 0/.35)}',
    '.big[hidden]{display:none}',
    '.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bar button{background:#232227;color:#ece9e2;border:1px solid #34333a;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}',
    '.bar button:hover{background:#2c2b31}#prog{margin-left:auto;color:#a8a49d;font-variant-numeric:tabular-nums}',
    '#chapters{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}',
    '#chapters button{width:100%;text-align:left;background:#1b1b1e;color:inherit;border:1px solid #2a2a2f;border-radius:8px;padding:8px 10px;font:inherit;cursor:pointer;display:grid;gap:2px}',
    '#chapters button:hover{border-color:#4a4950}#chapters b{font-size:13px}#chapters span{font-size:12px;color:#8a857e}',
    'footer{color:#6f6b64;font-size:12px;text-align:center;margin-top:8px}',
    ':fullscreen .screen,.screen:fullscreen{display:grid;place-items:center;background:#000}.screen:fullscreen #stage{width:min(100vw,177.78vh)}'
  ].join('\n');
  var FILM_BOOT = [
    '(function () {',
    '  var GC = window.GenChibi, $ = function (id) { return document.getElementById(id); };',
    '  GC.pack({ id: "local.my", name: "Của tôi", owner: "Người tạo", group: "mine", license: "Thuộc người tạo" }, function () {});',
    '  DATA.parts.forEach(function (p) { GC.registerDataPart("local.my", p); });',
    '  DATA.items.forEach(function (x) { GC.registerItem("local.my", x); });',
    '  DATA.scenes.forEach(function (x) { GC.registerScene("local.my", x); });',
    '  DATA.characters.forEach(function (a) { GC.registerAsset(a.pack, a); });',
    '  var rs = GC.film.readiness(FILM), ready = rs.filter(function (x) { return x.ok; }).map(function (x) { return x.shot; });',
    '  var player = GC.film.player($("stage"), { onProgress: function (t) { $("prog").textContent = t; }, onEnd: function () { $("big").hidden = false; } });',
    '  player.show(ready[0] || FILM.shots[0]);',
    '  function play(from) { $("big").hidden = true; player.play(ready.slice(from || 0), FILM.title); }',
    '  $("big").onclick = $("play").onclick = function () { play(0); };',
    '  $("stop").onclick = function () { player.stop(); $("big").hidden = false; };',
    '  $("full").onclick = function () { var s = document.querySelector(".screen"); (s.requestFullscreen || s.webkitRequestFullscreen || function () {}).call(s); };',
    '  document.addEventListener("keydown", function (e) { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); if ($("big").hidden) $("stop").onclick(); else play(0); } });',
    '  ready.forEach(function (s, i) {',
    '    var li = document.createElement("li"), b = document.createElement("button"), t = document.createElement("b"), d = document.createElement("span");',
    '    t.textContent = (i + 1) + ". " + s.title; d.textContent = s.description || (s.event.steps.length + " lời thoại");',
    '    b.appendChild(t); b.appendChild(d); b.onclick = function () { play(i); window.scrollTo({ top: 0, behavior: "smooth" }); };',
    '    li.appendChild(b); $("chapters").appendChild(li);',
    '  });',
    '  if (!ready.length) $("prog").textContent = "Tác phẩm chưa có phân cảnh nào sẵn sàng.";',
    '})();'
  ].join('\n');

  PAGES.works = function (r) {
    crumbs([{ t: 'Tác phẩm' }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: 'Khu Tạo tác (tác phẩm, chat với AI đạo diễn) chạy ở bản cài trên máy.' })); return; }
    var W = null, list = [];
    var pick = h('select', { 'aria-label': 'Tác phẩm', onchange: function () { open(pick.value); } });
    var nTitle = h('input', { type: 'text', placeholder: 'Tên tác phẩm mới', maxlength: 80, style: 'width:200px' });
    // r.project chỉ dùng một lần (vào từ một dự án) — không lưu vào route để lần mở sau không hỏi lại
    var entryProj = r.project; delete r.project;
    try { localStorage.setItem(routeKey(APP), JSON.stringify(r)); } catch (e) { /* bỏ qua */ }
    var nProj = entryProj != null ? entryProj : lastProject();
    actions(pick, nTitle, projectSelect(nProj, function (v) { nProj = v; }), h('button', { class: 'btn primary', onclick: function () {
      if (!nTitle.value.trim()) { nTitle.focus(); return; }
      Store.api('POST', 'api/works', { title: nTitle.value.trim(), project: nProj }).then(function (w) { nTitle.value = ''; loadList(w.id); }).catch(function (e) { toast(e.message); });
    } }, '+ Tác phẩm mới'));
    var chatLog = h('div', { class: 'chatlog' }), chatIn = h('textarea', { rows: 3, placeholder: 'Nói với AI đạo diễn: ý tưởng, sửa cảnh, thêm nhân vật…' });
    var sendB = h('button', { class: 'btn primary', onclick: function () { send(chatIn.value); } }, 'Gửi');
    // bản nháp chưa lưu (kịch bản + từng phân cảnh): vẽ lại sau chat / lưu cảnh khác không được xoá chữ đang gõ dở
    var draftScript = null, drafts = {}, alive = true, busy = false;
    var logline = h('input', { type: 'text', maxlength: 300, placeholder: 'Logline — một câu tóm tắt', style: 'width:100%', oninput: function () { draftScript = { logline: logline.value, script: script.value }; } });
    var script = h('textarea', { rows: 6, maxlength: 8000, placeholder: 'Kịch bản tổng (văn xuôi). AI đạo diễn đọc mục này để chia phân cảnh.', oninput: function () { draftScript = { logline: logline.value, script: script.value }; } });
    var shotsBox = h('div', { class: 'stack' }), stills = h('div', { class: 'stillgrid' }), evPanel = h('div');
    var prog = h('span', { class: 'note mono', text: 'Chưa diễn' }), stage = h('div'), readyBox = h('div', { class: 'ready' });
    var player = GC.film.player(stage, { onProgress: function (t) { prog.textContent = t; } });
    onLeave(function () { alive = false; player.destroy(); });   // phản hồi đến sau khi rời trang thì bỏ qua (không dựng diễn viên mồ côi)
    var QUICK = [['Viết kịch bản', 'Từ ý tưởng trong kịch bản tổng, viết logline + kịch bản hoàn chỉnh rồi lưu (save_work).'],
      ['Chia phân cảnh', 'Chia kịch bản thành các phân cảnh (save_shot): mỗi cảnh một bối cảnh trong Thư viện + dàn diễn viên. Thiếu thì tạo ở Xưởng.'],
      ['Viết lời thoại', 'Viết lời thoại + diễn xuất cho mọi phân cảnh chưa có (save_shot với event).'],
      ['Kiểm thiếu', 'Kiểm tác phẩm còn thiếu gì (nhân vật, bối cảnh, lời thoại) và tự bổ sung.']];
    var quick = h('div', { class: 'fxchips' });
    QUICK.forEach(function (q) { quick.appendChild(h('button', { title: q[1], onclick: function () { send(q[1]); } }, q[0])); });
    $('view').appendChild(h('div', { class: 'works' },
      h('div', { class: 'panel col-chat' }, h('h3', null, 'AI đạo diễn', h('span', { class: 'r note', title: 'Dùng asset trong Thư viện; thiếu thì AI tự vào Xưởng tạo (đúng dự án)', text: 'chat' })),
        h('div', { class: 'pad stack' }, chatLog, quick, chatIn, h('div', { class: 'row' }, sendB, h('span', { class: 'note', text: 'Cần API key ở Cài đặt AI.' })))),
      h('div', { class: 'stack' },
        h('div', { class: 'panel' }, h('h3', null, 'Kịch bản', h('span', { class: 'r' }, h('button', { class: 'btn sm', onclick: saveScript }, 'Lưu'))), h('div', { class: 'pad stack' }, logline, script)),
        h('div', { class: 'panel' }, h('h3', null, 'Phân cảnh', h('span', { class: 'r' }, h('button', { class: 'btn sm', onclick: function () { saveShot({ shot: { title: 'Phân cảnh mới', scene: (GC.scenes()[0] || {}).key || '' } }); } }, '+ Phân cảnh'))), h('div', { class: 'pad' }, shotsBox)),
        evPanel),
      h('div', { class: 'stack' },
        h('div', { class: 'panel' }, h('h3', null, 'Sân khấu final', h('span', { class: 'r row', style: 'gap:6px' }, prog,
          h('button', { class: 'btn sm primary', onclick: function () { if (W) player.play(W.shots, W.title); } }, '▶ Diễn toàn bộ'), h('button', { class: 'btn sm', onclick: function () { player.stop(); } }, 'Dừng'))),
          h('div', { class: 'pad stack' }, stage, readyBox,
            h('div', { class: 'usebar' }, h('b', { text: 'Xuất' }),
              h('button', { class: 'btn sm primary', title: 'Một tệp .html chạy được ở mọi trình duyệt, không cần cài gì — gửi cho người xem', onclick: function () { if (W) exportFilm(W); } }, 'Phim (HTML)'),
              h('button', { class: 'btn sm', title: 'Bảng phân cảnh: ảnh từng cảnh + mô tả + lời thoại', onclick: function () { if (W) download(W.id + '-storyboard.svg', storyboard(W), 'image/svg+xml'); } }, 'Storyboard SVG'),
              h('button', { class: 'btn sm', onclick: function () {
                if (!W) return;
                try { var sv = storyboard(W), m = sv.match(/viewBox="0 0 (\d+) (\d+)"/); savePng(W.id + '-storyboard.png', svgURL(sv), +m[1], +m[2]); }
                catch (e) { toast('Không dựng được storyboard PNG: ' + e.message + ' — thử bản SVG.'); }
              } }, 'Storyboard PNG'),
              h('button', { class: 'btn sm', title: 'Kịch bản + phân cảnh + lời thoại dạng JSON', onclick: function () { if (W) download(W.id + '.json', JSON.stringify(Object.assign({}, W, { chat: undefined }), null, 2), 'application/json'); } }, 'JSON')))),
        h('div', { class: 'panel' }, h('h3', null, 'Cảnh thành phẩm', h('span', { class: 'r note', text: 'bấm để diễn thử' })), h('div', { class: 'pad' }, stills)))));

    // Kịch bản lẻ: agent ngoài gửi qua MCP (save_event) → thêm thành phân cảnh của tác phẩm đang mở (qua cổng đạo diễn)
    function loadEvents() {
      Store.api('GET', 'api/events').then(function (evs) {
        clear(evPanel);
        if (!alive || !evs.length) return;
        var t = h('div', { class: 'stack', style: 'gap:4px' });
        evs.slice(0, 20).forEach(function (e) {
          t.appendChild(h('div', { class: 'readyrow', style: 'grid-template-columns:minmax(0,1fr) auto auto' },
            h('span', { text: e.title || e.id }), h('span', { class: 'note', text: e.steps + ' bước · ' + (e.author || '') }),
            h('button', { class: 'btn sm', onclick: function () {
              if (!W) { toast('Mở hoặc tạo tác phẩm trước.'); return; }
              Store.api('GET', 'api/events/' + e.id).then(function (rec) {
                var ev = rec.event, ids = ev.steps.map(function (x) { return x.actor; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
                var cast = ids.map(function (id) { var a = GC.getAsset(id, MY_PACK); return a && a.key; }).filter(Boolean);
                return saveShot({ shot: { title: ev.title, description: 'Từ kịch bản lẻ "' + ev.title + '" (' + (rec.author || 'agent') + ')', scene: ev.scene || (GC.scenes()[0] || {}).key || '', cast: cast, event: ev } });
              }).then(function () { toast('Đã thêm "' + (e.title || e.id) + '" thành phân cảnh.'); }).catch(function (x) { if (x) toast(x.message); });
            } }, '+ Thành phân cảnh')));
        });
        evPanel.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Kịch bản lẻ', h('span', { class: 'r note', text: 'agent gửi qua MCP (save_event)' })), h('div', { class: 'pad' }, t)));
      }).catch(function () {});
    }
    loadEvents();
    function loadList(sel) {
      return Store.api('GET', 'api/works').then(function (l) {
        list = l; clear(pick);
        if (!l.length) pick.appendChild(h('option', { value: '', text: '— chưa có tác phẩm —' }));
        l.forEach(function (w) { pick.appendChild(h('option', { value: w.id, text: w.title + ' (' + w.done + '/' + w.shots + ' cảnh)' })); });
        // vào từ một dự án: mở tác phẩm của dự án đó; chưa có thì gợi ý đặt tên tác phẩm mới (dự án đã chọn sẵn)
        var ofProj = entryProj ? l.filter(function (w) { return w.project === entryProj; })[0] : null;
        if (entryProj && !ofProj && !sel) { nTitle.focus(); toast('Đặt tên tác phẩm mới cho dự án ' + Projects.name(entryProj) + ' rồi bấm "+ Tác phẩm mới".'); }
        entryProj = null;
        var id = sel || (ofProj && ofProj.id) || (r.work && l.some(function (w) { return w.id === r.work; }) ? r.work : l[0] && l[0].id);
        if (id) { pick.value = id; open(id); } else paint();
      }).catch(function (e) { toast(e.message); });
    }
    function open(id) { Store.api('GET', 'api/works/' + id).then(function (w) { if (!alive) return; if (!W || W.id !== w.id) { drafts = {}; draftScript = null; } W = w; route.work = w.id; paint(); }).catch(function (e) { toast(e.message); }); }
    function saveScript() {
      if (!W) return;
      Store.api('POST', 'api/works', { id: W.id, logline: logline.value, script: script.value }).then(function () { draftScript = null; toast('Đã lưu kịch bản.'); open(W.id); }).catch(function (e) { toast(e.message); });
    }
    function saveShot(body) {
      if (!W) { toast('Tạo tác phẩm trước.'); return Promise.reject(); }
      return Store.api('POST', 'api/works/' + W.id + '/shots', body).then(function (w) { if (body.shot && body.shot.id) delete drafts[body.shot.id]; if (!alive) return w; W = w; paint(); return w; }).catch(function (e) { toast(e.message); throw e; });
    }
    function send(text) {
      text = String(text || '').trim();
      if (!W || !text || busy) return;
      busy = true; setBusy(true); chatIn.value = '';
      chatLog.appendChild(h('div', { class: 'msg user', text: text }));
      Store.api('POST', 'api/works/' + W.id + '/chat', { message: text }).then(function (res) { if (!alive) return; W = res.work; renderNav(); paint(); })
        .catch(function (e) { if (alive) chatLog.appendChild(h('div', { class: 'msg err', text: e.message })); })
        .then(function () { busy = false; if (alive) setBusy(false); });
    }
    function setBusy(on) {   // một lượt AI tại một thời điểm: khoá nút gửi và các nút nhanh
      sendB.disabled = on; sendB.textContent = on ? 'AI đang làm…' : 'Gửi';
      Array.prototype.forEach.call(quick.children, function (b) { b.disabled = on; });
    }
    function paint() {
      clear(chatLog); clear(shotsBox); clear(stills);
      if (!W) { shotsBox.appendChild(h('div', { class: 'note lib-empty', text: 'Tạo một tác phẩm (ô phía trên) để bắt đầu: viết ý tưởng vào kịch bản, rồi nhờ AI đạo diễn chia phân cảnh.' })); return; }
      logline.value = draftScript ? draftScript.logline : W.logline || ''; script.value = draftScript ? draftScript.script : W.script || '';
      (W.chat || []).forEach(function (m) {
        var el = h('div', { class: 'msg ' + m.role, text: m.content || (m.role === 'assistant' ? '(đã làm, không lời)' : '') });
        if (m.log && m.log.length) { var lg = h('div', { class: 'toollog' }); m.log.forEach(function (x) { lg.appendChild(h('span', { class: x.ok ? 'ok' : 'bad', title: x.summary, text: (x.ok ? '✓ ' : '✗ ') + x.tool })); }); el.appendChild(lg); }
        chatLog.appendChild(el);
      });
      if (!(W.chat || []).length) chatLog.appendChild(h('div', { class: 'note', text: 'Chưa có tin nhắn. Ví dụ: "Làm phim 3 cảnh: một chú mèo đi lạc trong văn phòng, cả nhóm đi tìm."' }));
      chatLog.scrollTop = chatLog.scrollHeight;
      // diễn viên / bối cảnh của dự án tác phẩm lên trước, khung (ma-nơ-canh) xuống cuối
      var rank = function (x) { return groupOf(x) === 'frame' ? 2 : (W.project && x.project === W.project ? 0 : 1); };
      var byRank = function (a, b) { return rank(a) - rank(b); };
      var chars = GC.assets().slice().sort(byRank), scenes = GC.scenes().slice().sort(byRank);
      if (!GC.assets().some(function (a) { return groupOf(a) !== 'frame'; })) shotsBox.appendChild(h('div', { class: 'banner' },
        h('span', { text: 'Thư viện chưa có nhân vật nào — tạm diễn bằng ma-nơ-canh, hoặc tạo nhân vật ở Xưởng (hoặc nhờ AI đạo diễn tự tạo).' }),
        h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { go({ page: 'create', project: W.project || '' }); } }, 'Tạo ở Xưởng ›')));
      W.shots.forEach(function (s, i) {
        var dr = drafts[s.id] || (drafts[s.id] = null), keep = function () { drafts[s.id] = { title: t.value, description: d.value, scene: sc.value, cast: cast.slice() }; };
        var t = h('input', { type: 'text', value: dr ? dr.title : s.title, maxlength: 80, oninput: function () { keep(); } }), d = h('textarea', { rows: 2, maxlength: 1000, placeholder: 'Mô tả phân cảnh', oninput: function () { keep(); } }); d.value = dr ? dr.description : s.description || '';
        var sc = h('select', { 'aria-label': 'Bối cảnh' }); sc.appendChild(h('option', { value: '', text: '— bối cảnh —' }));
        scenes.forEach(function (x) { sc.appendChild(h('option', { value: x.key, text: x.name + (x.project ? ' · ' + Projects.name(x.project) : '') })); });
        sc.value = dr ? dr.scene : s.scene || ''; sc.onchange = keep;
        var cast = (dr ? dr.cast : s.cast || []).slice(), cb = h('div', { class: 'fxchips' });
        chars.forEach(function (a) {
          var b = h('button', { 'aria-pressed': String(cast.indexOf(a.key) >= 0), onclick: function () {
            var j = cast.indexOf(a.key); if (j >= 0) cast.splice(j, 1); else if (cast.length < 8) cast.push(a.key); else { toast('Tối đa 8 diễn viên một cảnh.'); return; }
            b.setAttribute('aria-pressed', String(j < 0)); keep();
          } }, a.name);
          cb.appendChild(b);
        });
        var st = s.event ? h('span', { class: 'tag acc', text: s.event.steps.length + ' bước thoại' }) : h('span', { class: 'tag', text: 'chưa có lời thoại' });
        var aiB = h('button', { class: 'btn sm', title: 'AI viết lời thoại + diễn xuất theo mô tả, đúng dàn diễn viên và bối cảnh', onclick: function () {
          if (!cast.length) { toast('Chọn diễn viên trước.'); return; }
          aiB.disabled = true; aiB.textContent = 'Đang viết…';
          var ids = cast.map(function (k) { return (GC.ASSETS[k] || {}).id; }).filter(Boolean);
          saveShot({ shot: { id: s.id, title: t.value, description: d.value, scene: sc.value, cast: cast } })
            .then(function () { return Store.api('POST', 'api/ai/director', { description: (t.value + '. ' + d.value + (sc.value ? ' Bối cảnh: ' + sc.value + ' — dùng "scene": "' + sc.value + '" và spot.' : '')).slice(0, 2000), cast: ids }); })
            .then(function (res) { return saveShot({ shot: { id: s.id, event: res.event } }); })
            .then(function () { toast('Đã viết lời thoại cho ' + s.title); })
            .catch(function (e) { if (e) toast(e.message); aiB.disabled = false; aiB.textContent = 'AI viết lời thoại'; });
        } }, 'AI viết lời thoại');
        shotsBox.appendChild(h('div', { class: 'shot', id: 'shot-' + s.id },
          h('div', { class: 'shot-head' }, h('b', { class: 'stepn', text: String(i + 1) }), t, st),
          d, h('div', { class: 'row' }, sc), cb,
          h('div', { class: 'shot-acts' },
            h('button', { class: 'btn sm primary', onclick: function () { saveShot({ shot: { id: s.id, title: t.value, description: d.value, scene: sc.value, cast: cast } }).then(function () { toast('Đã lưu ' + t.value); }); } }, 'Lưu'),
            aiB,
            h('button', { class: 'btn sm', disabled: GC.film.issues(s).length ? '' : null, title: GC.film.issues(s).length ? 'Thiếu: ' + GC.film.issues(s).join(', ') : null, onclick: function () { player.play([s], s.title); } }, 'Diễn thử'),
            h('span', { class: 'sp' }), h('button', { class: 'btn sm ic', disabled: i ? null : '', title: 'Lên', onclick: function () { saveShot({ shot: { id: s.id }, position: i - 1 }); } }, '↑'),
            h('button', { class: 'btn sm ic', disabled: i < W.shots.length - 1 ? null : '', title: 'Xuống', onclick: function () { saveShot({ shot: { id: s.id }, position: i + 1 }); } }, '↓'),
            h('button', { class: 'btn sm ic danger', title: 'Bỏ phân cảnh (bản cũ của tác phẩm vẫn được giữ)', 'aria-label': 'Bỏ phân cảnh', onclick: function () { if (window.confirm('Bỏ phân cảnh "' + s.title + '"?')) saveShot({ shot: { id: s.id }, remove: true }); } }, '✕'))));
        var url = stillURL(s);
        stills.appendChild(h('button', { class: 'libcard', title: s.title, onclick: function () { if (s.event) player.play([s], s.title); else player.show(s); } },
          h('div', { class: 'im' }, url ? h('img', { src: url, alt: s.title, loading: 'lazy' }) : h('div', { class: 'note', style: 'padding:20px', text: 'chưa có bối cảnh' })),
          h('div', { class: 'lb' }, h('b', { text: (i + 1) + '. ' + s.title }), h('span', { class: 'note', text: s.event ? s.event.steps.length + ' bước thoại' : 'chưa có lời thoại' }))));
      });
      if (!W.shots.length) shotsBox.appendChild(h('div', { class: 'note', text: 'Chưa có phân cảnh. Bấm "+ Phân cảnh" hoặc nhờ AI "Chia phân cảnh".' }));
      var firstReady = W.shots.filter(function (s) { return s.scene; })[0];
      player.show(firstReady || null);
      paintReady();
    }
    // Tình trạng: phân cảnh nào diễn được, còn thiếu gì — bấm để tới đúng phân cảnh (không cần AI)
    function paintReady() {
      clear(readyBox);
      var rs = GC.film.readiness(W), ok = rs.filter(function (x) { return x.ok; }).length;
      if (!rs.length) return;
      var bar = h('div', { class: 'readybar' }, h('span', { class: 'meter' }, h('i', { style: 'width:' + Math.round(ok / rs.length * 100) + '%' })),
        h('b', { text: ok === rs.length ? 'Sẵn sàng diễn cả ' + rs.length + ' phân cảnh' : 'Sẵn sàng ' + ok + '/' + rs.length + ' phân cảnh' }));
      readyBox.appendChild(bar);
      rs.filter(function (x) { return !x.ok; }).forEach(function (x) {
        readyBox.appendChild(h('button', { class: 'readyrow', onclick: function () { var e = document.getElementById('shot-' + x.shot.id); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); e.classList.add('flash'); setTimeout(function () { e.classList.remove('flash'); }, 1200); } } },
          h('span', { class: 'stepn', text: String(x.index + 1) }), h('span', { text: x.shot.title }), h('span', { class: 'note', text: 'thiếu: ' + x.missing.join(', ') }), h('span', { class: 'go', text: 'Sửa ›' })));
        // thiếu diễn viên / bối cảnh mà Thư viện chưa có cái hợp → tạo ngay ở Xưởng, đúng dự án của tác phẩm
        var need = x.missing.some(function (m) { return /diễn viên/.test(m); }) ? 'character' : x.missing.some(function (m) { return /bối cảnh/.test(m); }) ? 'scene' : null;
        if (need) readyBox.lastChild.appendChild(h('span', { class: 'go', title: 'Mở Xưởng › Tạo asset mới (dự án ' + Projects.name(W.project || '') + ')', onclick: function (ev) { ev.stopPropagation(); go({ page: 'create', kind: need, project: W.project || '' }); } }, need === 'character' ? '+ Nhân vật ở Xưởng' : '+ Bối cảnh ở Xưởng'));
      });
    }
    loadList();
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
    return ['engine/core.js'].concat(withRender ? ['engine/render.js'] : [], ['kinds/character/afi.core.js', 'kinds/khung/afi.khung.js'])
      .map(function (f) { return '<script src="' + f + '"></script>'; }).join('\n');
  }
  // JSON đặt trong <script> của mã nhúng: escape < > & và U+2028/2029 — tên do agent đặt chứa "</script>" không thoát ra được
  function jsonForScript(x) { return JSON.stringify(x).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function mcpCall(tool, args) { return '// Agent (MCP) hoặc Trợ lý AI trong Studio gọi:\n' + tool + ' ' + JSON.stringify(args, null, 2); }

  /* ============================================================ THƯ VIỆN: thành phẩm theo nhóm, lấy về dùng */
  function groupOf(x) { return (GC.PACKS[x.pack] || {}).group || 'community'; }
  // mục của Thư viện: chính thức → từng dự án chủ đề → chưa xếp dự án → nhóm → cộng đồng
  function secOf(x) { var g = groupOf(x); return g === 'mine' ? 'p:' + (x.project || '') : g; }
  function sections(all) {
    var out = [['official', 'Chính thức']];
    Projects.all().forEach(function (p) { out.push(['p:' + p.id, 'Dự án · ' + p.name]); });
    out.push(['p:', 'Chưa xếp dự án'], ['team', 'Nhóm'], ['community', 'Cộng đồng']);
    return out.filter(function (s) { return all.some(function (x) { return secOf(x) === s[0]; }); });
  }
  // cfg: { title, fab (trang Tạo tác tương ứng), list(), find(key), sub(x) → nhãn nhóm con, thumb(x) → url, wide?, inspect(x, box) }
  function libPage(cfg, r) {
    crumbs([{ t: cfg.title }]);
    actions(h('span', { class: 'note', text: 'Thành phẩm đã qua cổng kiểm — chọn, xem, tải ảnh hoặc chép mã.' }),
      h('button', { class: 'btn', onclick: function () { go({ page: 'create' }); } }, 'Tạo asset mới ở Xưởng ›'));
    var list0 = function () { return cfg.list().filter(function (x) { return groupOf(x) !== 'frame'; }); };   // khung thuộc Xưởng, không bày ở Thư viện
    var q = '', grp = r.project != null ? 'p:' + r.project : 'all', sub = 'all', sel = cfg.find(r.key) || list0()[0];
    if (sel && groupOf(sel) === 'frame') sel = list0()[0];
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
      var all = list0(), list = all.filter(function (x) { return !q || [x.name, x.han, x.key, x.pack, cfg.sub(x)].join(' ').toLowerCase().indexOf(q) >= 0; });
      clear(gseg); chip(gseg, grp, 'all', 'Tất cả', function (v) { grp = v; });
      var SECS = sections(all);
      SECS.forEach(function (g) { chip(gseg, grp, g[0], g[1], function (v) { grp = v; }); });
      clear(subs); chip(subs, sub, 'all', 'Mọi nhóm', function (v) { sub = v; });
      all.map(cfg.sub).filter(function (x, i, a) { return a.indexOf(x) === i; }).forEach(function (sv) { chip(subs, sub, sv, sv, function (v) { sub = v; }); });
      clear(body);
      SECS.forEach(function (g) {
        if (grp !== 'all' && grp !== g[0]) return;
        var part = list.filter(function (x) { return secOf(x) === g[0] && (sub === 'all' || cfg.sub(x) === sub); });
        if (!part.length) return;
        var row = h('div', { class: 'libgrid' });
        part.forEach(function (x) {
          row.appendChild(h('button', { class: 'libcard', 'aria-pressed': String(sel && x.key === sel.key), title: x.key, onclick: function () { sel = x; paint(); paintInsp(); } },
            h('div', { class: 'im' }, h('img', { src: cfg.thumb(x), alt: x.name, loading: 'lazy' })),
            h('div', { class: 'lb' }, h('b', { text: x.name }), h('span', { class: 'note', text: cfg.sub(x) }))));
        });
        body.appendChild(h('div', { class: 'panel' }, h('h3', null, g[1], h('span', { class: 'r note', text: part.length + ' / ' + all.filter(function (x) { return secOf(x) === g[0]; }).length })), h('div', { class: 'pad' }, row)));
      });
      if (!body.children.length) body.appendChild(h('div', { class: 'panel pad note lib-empty', text: all.length ? 'Không có gì khớp bộ lọc.' : 'Thư viện chưa có ' + cfg.title.toLowerCase() + ' nào. Asset được tạo từ bộ khung chuẩn (Xưởng) rồi mới lưu vào đây theo dự án chủ đề.' }));
    }
    function paintInsp() { clear(insp); if (sel) cfg.inspect(sel, insp); }
    paint(); paintInsp();
  }
  function useHead(x, box, extra) {
    // asset của tôi: đổi dự án chủ đề ngay tại Thư viện (lưu lại qua đúng cổng ghi của loại đó)
    var pj = x.pack === MY_PACK ? h('div', { class: 'row' }, h('span', { class: 'note', text: 'Dự án chủ đề' }), projectSelect(x.project || '', function (v) {
      var d = clone(x); d.project = v;
      resave(d, 'Chuyển sang dự án ' + Projects.name(v)).then(function () { toast('Đã chuyển ' + x.name + ' sang ' + Projects.name(v)); go(route); }).catch(function (e) { toast(e.message); });
    })) : null;
    box.appendChild(h('div', { class: 'panel' }, h('h3', null, x.name + (x.han ? ' · ' + x.han : ''), h('span', { class: 'r mono', text: x.key })),
      h('div', { class: 'pad stack' }, pj, extra)));
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
        var vsel = h('select', { 'aria-label': 'Góc nhìn', onchange: function () { u.view = vsel.value; paintU(); } });
        VIEWS_ALL.forEach(function (v) { vsel.appendChild(h('option', { value: v[0], text: v[1] })); });
        vsel.value = u.view;
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
            return '<!-- gen-chibi · © 2026 Gen Labs. Chép thư mục engine/ và kinds/ từ bản cài vào cạnh trang này. -->\n<div id="chibi" style="width:248px;height:258px"></div>\n' + engineScripts(true) + '\n<script>\n  var GC = GenChibi; GC.render.injectCSS();\n' +
              (mine ? '  GC.registerAsset("' + MY_PACK + '", ' + jsonForScript(a) + ');\n' : '') +
              '  var chibi = GC.render.full(document.getElementById("chibi"), GC.ASSETS[' + jsonForScript(a.key) + '], "normal");\n  chibi.setState(' + jsonForScript(u.state) + (d ? ', ' + jsonForScript(d) : '') + ');   // đổi biểu cảm / hoạt động khi cần\n</script>';
          }],
          ['SVG', function () { return GC.svgString(a, u.state, { director: dir() }); }],
          ['JSON công thức', function () { return JSON.stringify(a, null, 2); }]
        ]);
        useHead(a, box, [
          stg, h('div', { class: 'row' }, selS, selA, vsel),
          h('div', { class: 'note', text: (a.identity && a.identity.p1 ? 'Nhận diện: ' + a.identity.p1 + '. ' : '') + (a.persona || '') }),
          h('div', { class: 'usebar' }, h('b', { text: 'Tải ảnh' }),
            h('button', { class: 'btn sm', onclick: function () { download(name() + '.svg', GC.svgString(a, u.state, { director: dir() }), 'image/svg+xml'); } }, 'SVG'),
            h('button', { class: 'btn sm', onclick: function () { savePng(name() + '-512.png', R.imageURL(a, u.state, { director: dir() }), 512, Math.round(512 * 258 / 248)); } }, 'PNG 512'),
            h('button', { class: 'btn sm', onclick: function () { savePng(a.id + '-avatar-256.png', R.imageURL(a, u.state, { crop: true, noShadow: true, director: dir() }), 256, 256); } }, 'Avatar 256'),
            h('button', { class: 'btn sm', onclick: function () { spriteSheet(a); } }, 'Sprite ' + LIB.stateOrder.length + ' biểu cảm'),
            h('button', { class: 'btn sm', title: 'Một hàng 8 hướng (vòng theo chiều kim đồng hồ từ chính diện), theo biểu cảm + hoạt động đang chọn', onclick: function () { sprite8(a, u.state, u.activity); } }, 'Sprite 8 hướng')),
          h('div', { class: 'usebar' }, h('b', { text: 'Tải mã' }),
            h('button', { class: 'btn sm', onclick: function () { download(a.id + '.json', JSON.stringify(a, null, 2), 'application/json'); } }, 'JSON công thức')),
          code,
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'character', key: a.key, tab: 'look' }); } }, mine ? 'Sửa ở bàn chỉnh (Xưởng) ›' : 'Phối bản của tôi ở Xưởng ›'))
        ]);
        paintU();
      }
    }, r);
  };
  function sprite8(a, state, activity) {
    var cell = 256, ch = Math.round(cell * 258 / 248);
    var c = document.createElement('canvas'); c.width = DIR8.length * cell; c.height = ch;
    var ctx = c.getContext('2d'), done = 0;
    DIR8.forEach(function (v, i) {
      var img = new Image(), d = { view: v };
      if (activity) d.activity = activity;
      img.onload = function () {
        ctx.drawImage(img, i * cell, 0, cell, ch);
        if (++done === DIR8.length) c.toBlob(function (b) { downloadBlob(a.id + '-8dir-' + (activity || state) + '.png', b); toast('Thứ tự ô: ' + DIR8.join(', ')); }, 'image/png');
      };
      img.src = R.imageURL(a, state, { director: d });
    });
  }
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
      title: 'Vật phẩm', fab: 'items', list: function () { return GC.items(); }, find: function (k) { return k ? GC.getItem(k) : null; },
      sub: function (it) { return (I.types[it.type] || {}).label || it.type; },
      thumb: function (it) { return svgURL(GC.itemSvg(it, { size: 128 })); },
      inspect: function (it, box) {
        var who = 'ma-no-canh', tryBox = h('div', { class: 'stage', style: 'height:200px;border-radius:6px;overflow:hidden;flex:1' });
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
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'items', key: it.key }); } }, it.pack === MY_PACK ? 'Sửa ở bàn chỉnh (Xưởng) ›' : 'Phối bản của tôi ở Xưởng ›'))
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
    // hai chỗ đứng hay dùng nhất để xem nhanh; cảnh đầy đủ dàn diễn viên làm ở Tạo tác / Đạo diễn AI
    var cast = initial || [{ id: 'ma-no-canh', spot: 'midLeft' }, { id: '', spot: 'midRight' }];
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
      title: 'Bối cảnh', fab: 'scenes', wide: true, list: function () { return GC.scenes(); }, find: function (k) { return k ? GC.getScene(k) : null; },
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
          ['Mã tham chiếu', function () { return sc.key + '\n\n// kịch bản đặt vào cảnh này:\n{ "title": "…", "scene": "' + sc.key + '", "steps": [{ "actor": "ma-no-canh", "spot": "midLeft", "state": "normal", "say": "…" }] }'; }],
          ['Gọi qua MCP', function () { var x = { key: sc.key, cast: picker.cast() }; if (u.time !== sc.time) x.time = u.time; if (u.weather !== sc.weather) x.weather = u.weather; return mcpCall('render_scene', x); }],
          ['Nhúng web', function () {
            return '<!-- gen-chibi · © 2026 Gen Labs. Chép thư mục engine/ và kinds/ từ bản cài vào cạnh trang này. -->\n<div id="canh" style="width:640px"></div>\n' + engineScripts(false) + '\n<script>\n  var GC = GenChibi;\n' +
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
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'scenes', key: sc.key }); } }, sc.pack === MY_PACK ? 'Sửa ở bàn chỉnh (Xưởng) ›' : 'Phối bản của tôi ở Xưởng ›'))
        ]);
        paintU();
      }
    }, r);
  };


  /* ============================================================ DỰ ÁN CHỦ ĐỀ (giai đoạn ②) */
  // Mỗi asset của người dùng gắn một dự án (trường project = slug). Bản server: api/projects; bản trình duyệt: localStorage.
  var Projects = {
    list: [],
    load: function () {
      var self = this;
      if (Store.mode === 'server') return Store.api('GET', 'api/projects').then(function (l) { self.list = l || []; }).catch(function () { self.list = []; });
      try { self.list = JSON.parse(localStorage.getItem('gc-projects') || '[]'); } catch (e) { self.list = []; }
      return Promise.resolve();
    },
    save: function (p) {
      var self = this;
      if (Store.mode === 'server') return Store.api('POST', 'api/projects', p).then(function (rec) { return self.load().then(function () { return rec; }); });
      if (!GC.projectId(p.id) || !String(p.name || '').trim()) return Promise.reject(new Error('Dự án cần tên và id hợp lệ'));
      var rec = { id: p.id, name: String(p.name).trim().slice(0, 40), description: String(p.description || '').slice(0, 300) };
      self.list = self.list.filter(function (x) { return x.id !== p.id; }).concat(rec);
      try { localStorage.setItem('gc-projects', JSON.stringify(self.list)); } catch (e) { /* bỏ qua */ }
      return Promise.resolve(rec);
    },
    name: function (id) { var p = this.list.filter(function (x) { return x.id === id; })[0]; return id ? (p ? p.name : id) : 'Chưa xếp dự án'; },
    // asset của tôi theo dự án (cả dự án chưa đăng ký mà asset đang trỏ tới)
    all: function () {
      var ids = this.list.map(function (p) { return p.id; }), out = this.list.slice();
      mineAll().forEach(function (x) { if (x.project && ids.indexOf(x.project) < 0) { ids.push(x.project); out.push({ id: x.project, name: x.project, description: '' }); } });
      return out;
    }
  };
  function mineAll() { return [].concat(GC.assets(), GC.items(), GC.scenes()).filter(function (x) { return x.pack === MY_PACK; }); }
  function inProject(arr, pid) { return arr.filter(function (x) { return x.pack === MY_PACK && (x.project || '') === pid; }); }
  function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  function thumbOf(x) {
    if (x.kind === 'item') return svgURL(GC.itemSvg(x, { size: 160 }));
    if (x.kind === 'scene') return sceneURL(x, {});
    return R.imageURL(x, 'normal', { noShadow: true });
  }
  // lưu lại một asset của tôi (đổi dự án…) qua đúng cổng ghi của loại đó
  function resave(x, note) {
    var d = clone(x);
    if (x.kind === 'item') return Store.api('POST', 'api/items', { item: d, note: note }).then(function (rec) { return GC.registerItem(MY_PACK, rec).def; });
    if (x.kind === 'scene') return Store.api('POST', 'api/scenes', { scene: d, note: note }).then(function (rec) { return GC.registerScene(MY_PACK, rec).def; });
    return Store.save(d, note);
  }
  function projectSelect(cur, onChange) {
    var s = h('select', { 'aria-label': 'Dự án chủ đề', onchange: function () {
      if (s.value !== '__new') { onChange(s.value); return; }
      var name = window.prompt('Tên dự án chủ đề mới (ví dụ: Tam Quốc, Cổ tích Việt, Văn phòng):');
      if (!name || !slugify(name)) { s.value = cur || ''; return; }
      Projects.save({ id: slugify(name), name: name }).then(function (rec) { fill(rec.id); onChange(rec.id); toast('Đã tạo dự án ' + rec.name); })
        .catch(function (e) { toast(e.message); s.value = cur || ''; });
    } });
    function fill(v) {
      clear(s);
      s.appendChild(h('option', { value: '', text: '— Chưa xếp dự án —' }));
      Projects.all().forEach(function (p) { s.appendChild(h('option', { value: p.id, text: p.name })); });
      s.appendChild(h('option', { value: '__new', text: '+ Dự án mới…' }));
      s.value = v || ''; cur = v;
    }
    fill(cur);
    return s;
  }

  // ---- Thư viện › Dự án chủ đề
  PAGES.projects = function (r) {
    crumbs([{ t: 'Dự án chủ đề' }]);
    var sel = r.project != null ? r.project : null;
    actions(h('span', { class: 'note', text: 'Asset tạo từ bộ khung chuẩn được xếp theo dự án chủ đề.' }),
      Store.mode === 'server' ? h('button', { class: 'btn', title: 'Nhập tệp gói dự án (.json) — mọi thứ đi qua cổng kiểm', onclick: pickBundle }, 'Nhập gói…') : null,
      Store.mode === 'server' && !Projects.all().some(function (p) { return p.id === DEMO_ID; }) ? h('button', { class: 'btn', onclick: importDemo }, '✨ Dự án mẫu') : null,
      h('button', { class: 'btn primary', onclick: function () { go({ page: 'create', project: sel || '' }); } }, '+ Tạo asset mới ›'));
    var listBox = h('div', { class: 'stack' }), detail = h('div', { class: 'stack' });
    var nName = h('input', { type: 'text', placeholder: 'Tên dự án (vd: Tam Quốc)', maxlength: 40, style: 'width:100%' });
    var nDesc = h('input', { type: 'text', placeholder: 'Mô tả ngắn (tuỳ chọn)', maxlength: 300, style: 'width:100%' });
    var form = h('form', { class: 'panel pad stack', onsubmit: function (ev) {
      ev.preventDefault();
      var id = slugify(nName.value);
      if (!id) { toast('Nhập tên dự án.'); return; }
      Projects.save({ id: id, name: nName.value, description: nDesc.value }).then(function (rec) { sel = rec.id; nName.value = nDesc.value = ''; paint(); toast('Đã tạo dự án ' + rec.name); }).catch(function (e) { toast(e.message); });
    } }, h('b', { text: 'Dự án mới' }), nName, nDesc, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Tạo dự án')));
    $('view').appendChild(h('div', { class: 'split lib' }, h('div', { class: 'stack' }, listBox, form), h('div', { class: 'sticky' }, detail)));
    function counts(pid) { return [inProject(GC.assets(), pid).length, inProject(GC.items(), pid).length, inProject(GC.scenes(), pid).length]; }
    function paint() {
      clear(listBox);
      var ps = Projects.all();
      if (mineAll().some(function (x) { return !x.project; })) ps = ps.concat({ id: '', name: 'Chưa xếp dự án', description: 'Asset của tôi chưa gắn dự án nào.' });
      if (sel == null && ps.length) sel = ps[0].id;
      if (!ps.length) listBox.appendChild(h('div', { class: 'panel pad stack lib-empty' }, h('span', { class: 'note', text: 'Chưa có dự án chủ đề nào. Tạo một dự án (ví dụ "Tam Quốc") rồi vào Xưởng › Tạo asset mới để dựng nhân vật, trang bị, cảnh từ bộ khung chuẩn — hoặc mở dự án mẫu để xem trọn luồng ngay.' }),
        Store.mode === 'server' ? h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: importDemo }, '✨ Mở dự án mẫu "Văn phòng vui"'), h('button', { class: 'btn', onclick: pickBundle }, 'Nhập gói…')) : null));
      var grid = h('div', { class: 'libgrid' });
      ps.forEach(function (p) {
        var c = counts(p.id), first = [].concat(inProject(GC.assets(), p.id), inProject(GC.items(), p.id), inProject(GC.scenes(), p.id))[0];
        grid.appendChild(h('button', { class: 'libcard proj', 'aria-pressed': String(sel === p.id), title: p.id || '(chưa xếp)', onclick: function () { sel = p.id; paint(); } },
          h('div', { class: 'im' }, first ? h('img', { src: thumbOf(first), alt: '' }) : h('div', { class: 'note', style: 'padding:28px 0', text: 'trống' })),
          h('div', { class: 'lb' }, h('b', { text: p.name }), h('span', { class: 'note', text: c[0] + ' nhân vật · ' + c[1] + ' vật phẩm · ' + c[2] + ' bối cảnh' }))));
      });
      if (ps.length) listBox.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Dự án', h('span', { class: 'r note', text: ps.length })), h('div', { class: 'pad' }, grid)));
      paintDetail();
    }
    function paintDetail() {
      clear(detail);
      if (sel == null) return;
      var P = Projects.all().filter(function (p) { return p.id === sel; })[0] || { id: '', name: 'Chưa xếp dự án', description: '' };
      var parts = [['Nhân vật', inProject(GC.assets(), sel), 'lib-characters'], ['Vật phẩm', inProject(GC.items(), sel), 'lib-items'], ['Bối cảnh', inProject(GC.scenes(), sel), 'lib-scenes']];
      var body = h('div', { class: 'pad stack' }, P.description ? h('div', { class: 'note', text: P.description }) : null);
      parts.forEach(function (g) {
        if (!g[1].length) return;
        var row = h('div', { class: 'libgrid sm' });
        g[1].forEach(function (x) {
          row.appendChild(h('button', { class: 'libcard', title: x.key, onclick: function () { go({ page: g[2], key: x.key }); } },
            h('div', { class: 'im' }, h('img', { src: thumbOf(x), alt: x.name, loading: 'lazy' })), h('div', { class: 'lb' }, h('b', { text: x.name }))));
        });
        body.appendChild(h('div', { class: 'stack' }, h('b', { text: g[0] + ' (' + g[1].length + ')' }), row));
      });
      if (!parts.some(function (g) { return g[1].length; })) body.appendChild(h('div', { class: 'note', text: 'Dự án chưa có asset. Bấm "Tạo asset mới" để dựng từ bộ khung chuẩn.' }));
      body.appendChild(h('div', { class: 'usebar' }, h('b', { text: 'Dùng' }),
        h('button', { class: 'btn sm primary', onclick: function () { go({ page: 'create', project: sel }); } }, '+ Tạo asset trong dự án'),
        h('button', { class: 'btn sm', onclick: function () { setLastProject(sel); go({ page: 'works', project: sel }); } }, 'Làm phim với dự án này ›'),
        sel ? h('button', { class: 'btn sm', title: 'Một tệp JSON: nhân vật, vật phẩm, bối cảnh, linh kiện tự vẽ đang dùng, tác phẩm — nhập lại được ở bản cài khác', onclick: function () { exportBundle(P); } }, 'Tải gói dự án (JSON)')
          : h('span', { class: 'note', text: 'Xếp asset vào một dự án (ở khung "Dùng" của từng asset) để tải gói.' })));
      detail.appendChild(h('div', { class: 'panel' }, h('h3', null, P.name, h('span', { class: 'r mono', text: P.id || '—' })), body));
    }
    paint();
  };
  var DEMO_ID = 'mau-van-phong-vui';
  function exportBundle(P) {
    if (Store.mode !== 'server') { download((P.id || 'chua-xep') + '-du-an.json', JSON.stringify(projectBundle(P), null, 2), 'application/json'); return; }
    Store.api('GET', 'api/projects/export?id=' + encodeURIComponent(P.id)).then(function (b) {
      download((P.id || 'chua-xep') + '-du-an.json', JSON.stringify(b, null, 2), 'application/json');
      toast('Đã xuất gói ' + P.name + ': ' + b.characters.length + ' nhân vật · ' + b.items.length + ' vật phẩm · ' + b.scenes.length + ' bối cảnh · ' + b.works.length + ' tác phẩm');
    }).catch(function (e) { toast(e.message); });
  }
  // nhập gói: trùng id thì hỏi lưu đè (thành phiên bản mới — bản cũ vẫn trong lịch sử); xong thì nạp lại và mở dự án ở Thư viện
  function importBundle(bundle, overwrite) {
    return fetch('api/projects/import', { method: 'POST', headers: Store.headers(), body: JSON.stringify({ bundle: bundle, overwrite: !!overwrite }) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (x) {
        if (x.status === 409 && !overwrite) {
          if (window.confirm(x.j.error + '\n\nLưu đè các mục trùng thành phiên bản mới?')) return importBundle(bundle, true);
          return null;
        }
        if (x.status >= 400) throw new Error(x.j.error || ('Lỗi ' + x.status));
        var r = x.j, c = r.counts;
        var msg = 'Đã nhập ' + c.characters + ' nhân vật · ' + c.items + ' vật phẩm · ' + c.scenes + ' bối cảnh · ' + c.works + ' tác phẩm (' + c.shots + ' phân cảnh)';
        if (r.errors.length) window.alert(msg + '\n\n' + r.errors.length + ' mục không qua cổng kiểm:\n' + r.errors.slice(0, 10).map(function (e) { return '• ' + e.kind + ' ' + e.id + ': ' + e.error; }).join('\n'));
        try { localStorage.setItem('gc-route-thu-vien', JSON.stringify({ page: 'projects', project: r.project })); localStorage.setItem('gc-last-project', r.project); localStorage.setItem('gc-toast', msg); } catch (e) { /* bỏ qua */ }
        if (APP && APP.id === 'thu-vien') location.reload(); else location.href = appURL('thu-vien');
        return r;
      }).catch(function (e) { toast(e.message); });
  }
  function pickBundle() {
    var inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: function () {
      var f = inp.files && inp.files[0]; inp.remove();
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast('Tệp quá lớn (tối đa 8 MB).'); return; }
      f.text().then(function (t) { var b; try { b = JSON.parse(t); } catch (e) { toast('Tệp không phải JSON.'); return; } importBundle(b); });
    } });
    document.body.appendChild(inp); inp.click();
  }
  function importDemo() {
    toast('Đang dựng dự án mẫu…');
    fetch('studio/mau/van-phong-vui.json').then(function (r) { if (!r.ok) throw new Error('Không tải được dự án mẫu'); return r.json(); }).then(function (b) { return importBundle(b); }).catch(function (e) { toast(e.message); });
  }
  function projectBundle(P) {
    var b = bundleOf(inProject(GC.assets(), P.id), inProject(GC.items(), P.id), inProject(GC.scenes(), P.id));
    return Object.assign({ format: 'gen-chibi.project/1', license: '© 2026 Gen Labs — engine; asset thuộc người tạo', project: { id: P.id, name: P.name, description: P.description || '' } },
      b, { exportedAt: new Date().toISOString() });
  }
  function LIB_SLOTS() { return Object.keys(LIB.slots); }

  /* ============================================================ XƯỞNG › Tạo asset mới (chọn khung → tham số → soát → cổng & lưu) */
  // Quy trình đúng docs/QUY-CACH-KHUNG.md mục 5. Khung không bị sửa: bản nháp là một bản sao của khung + tham số của người tạo.
  var NEW_PAL_CHAR = [['skin', 'Da'], ['robe', 'Áo'], ['trim', 'Viền'], ['hat', 'Mũ'], ['accent', 'Điểm nhấn'], ['metal', 'Kim loại'], ['wood', 'Gỗ'], ['cape', 'Áo choàng'], ['boots', 'Giày'], ['pants', 'Quần'], ['hair', 'Tóc / mày'], ['iris', 'Mắt']];
  var REVIEW_ACTS = [['normal', '', 'Đứng'], ['vow', 'run', 'Chạy'], ['angry', 'attack', 'Tấn công'], ['normal', 'sit-floor', 'Ngồi']];
  PAGES.create = function (r) {
    crumbs([{ t: 'Tạo asset mới' }]);
    var I = GC.ITEM, S = GC.SCENE;
    var u = { kind: r.kind || 'character', frame: null, project: r.project != null ? r.project : lastProject(), d: null, saved: null };
    var steps = h('ol', { class: 'steps' });
    var left = h('div', { class: 'stack' }), right = h('div', { class: 'stack' });
    $('view').appendChild(h('div', { class: 'stack' }, steps, h('div', { class: 'split create' }, left, h('div', { class: 'sticky stack' }, right))));
    function frames(kind) {
      if (kind === 'character') return GC.assets().filter(function (a) { return groupOf(a) === 'frame'; });
      if (kind === 'item') return GC.items().filter(function (x) { return groupOf(x) === 'frame'; });
      return GC.scenes().filter(function (x) { return groupOf(x) === 'frame'; });
    }
    function uniq(base, map) { var id = base || 'asset-moi', n = 2; while (map[MY_PACK + '/' + id]) id = (base || 'asset-moi') + '-' + n++; return id; }
    function start(kind, fr) {
      u.kind = kind; u.frame = fr; u.saved = null;
      var d = clone(fr);
      delete d.key; delete d.savedAt; delete d.note;
      d.pack = MY_PACK; d.status = 'draft'; d.version = 0; d.project = u.project;
      if (kind === 'character') {
        d.name = 'Nhân vật mới'; d.id = uniq('nhan-vat-moi', GC.ASSETS); d.code = nextCode(); d.faction = ''; d.role = ''; d.han = ''; d.persona = '';
        d.expressions = {}; d.lines = {}; d.identity = { p1: '', must: [], source: '' }; d.look.palette = clone(d.look.palette || {});
      } else if (kind === 'item') {
        d.name = fr.name.replace(/^Khung /, '') + ' mới'; d.id = uniq(slugify(d.name), GC.ITEMS); d.equip.palette = d.equip.palette || {}; d.equip.params = d.equip.params || {}; d.stats = d.stats || {};
      } else {
        d.name = 'Cảnh mới'; d.id = uniq('canh-moi', GC.SCENES); d.palette = d.palette || {};
      }
      u.d = d; u.idTouched = false;
      paint();
    }
    var timer;
    function changed() { clearTimeout(timer); timer = setTimeout(review, 120); }
    function field(label, el) { return h('label', { class: 'fld' }, h('span', { class: 'note', text: label }), el); }
    function stepHead(n, t, sub) { return h('h3', null, h('span', { class: 'stepn', text: n }), t, sub ? h('span', { class: 'r note', text: sub }) : null); }

    function paintSteps() {
      clear(steps);
      [['Chọn khung', !!u.d], ['Tham số & chi tiết', !!u.d], ['Soát mọi góc', !!u.d], ['Cổng kiểm & lưu', !!u.saved]].forEach(function (s, i) {
        steps.appendChild(h('li', { class: s[1] ? 'done' : '' }, h('b', { text: String(i + 1) }), s[0]));
      });
    }
    function paint() {
      paintSteps(); clear(left); clear(right);
      // ① chọn khung
      var kseg = h('div', { class: 'seg' });
      [['character', 'Nhân vật'], ['item', 'Vật phẩm'], ['scene', 'Bối cảnh']].forEach(function (k) {
        kseg.appendChild(h('button', { 'aria-pressed': String(u.kind === k[0]), onclick: function () { u.kind = k[0]; u.d = null; u.frame = null; paint(); } }, k[1]));
      });
      var fgrid = h('div', { class: 'libgrid sm' });
      frames(u.kind).forEach(function (fr) {
        fgrid.appendChild(h('button', { class: 'libcard', 'aria-pressed': String(!!u.frame && u.frame.key === fr.key), title: fr.key, onclick: function () { start(u.kind, fr); } },
          h('div', { class: 'im' }, h('img', { src: thumbOf(fr), alt: fr.name, loading: 'lazy' })), h('div', { class: 'lb' }, h('b', { text: fr.name }))));
      });
      left.appendChild(h('div', { class: 'panel' }, stepHead('1', 'Chọn khung', 'khung do Gen Labs giữ — bản của bạn là bản sao'),
        h('div', { class: 'pad stack' }, h('div', { class: 'row' }, kseg, field('Lưu vào dự án', projectSelect(u.project, function (v) { u.project = v; if (u.d) u.d.project = v; }))), fgrid)));
      if (!u.d) { right.appendChild(h('div', { class: 'panel pad note', text: 'Chọn một khung bên trái để bắt đầu. Nhân vật dựng từ ma-nơ-canh; vật phẩm từ khối đại diện theo dáng; bối cảnh từ sân khấu chuẩn.' })); return; }
      // ② tham số & chi tiết
      var d = u.d, f = h('div', { class: 'pad stack' });
      var nm = h('input', { type: 'text', value: d.name, maxlength: 40, oninput: function () { d.name = nm.value; if (!u.idTouched) { var map = u.kind === 'character' ? GC.ASSETS : u.kind === 'item' ? GC.ITEMS : GC.SCENES; d.id = uniq(slugify(nm.value) || 'asset-moi', map); idI.value = d.id; } changed(); } });
      var idI = h('input', { type: 'text', value: d.id, maxlength: 64, class: 'mono', oninput: function () { u.idTouched = true; d.id = idI.value.trim(); changed(); } });
      f.appendChild(h('div', { class: 'row' }, field('Tên', nm), field('Mã (id)', idI)));
      if (u.kind === 'character') charParams(d, f); else if (u.kind === 'item') itemParams(d, f); else sceneParams(d, f);
      left.appendChild(h('div', { class: 'panel' }, stepHead('2', 'Tham số & chi tiết'), f));
      review();
    }
    function colors(list, cur, defs, set) {
      var g = h('div', { class: 'palgrid' });
      list.forEach(function (k) {
        var c = h('input', { type: 'color', value: cur[k[0]] || defs[k[0]], 'aria-label': k[1], oninput: function () { set(k[0], c.value); changed(); } });
        g.appendChild(h('label', { class: 'pal' }, c, h('span', { text: k[1] })));
      });
      return g;
    }
    function slider(p, val, set) {
      var out = h('span', { class: 'mono note', text: (+val).toFixed(2) });
      var s = h('input', { type: 'range', min: p.min, max: p.max, step: p.step || 0.01, value: val, oninput: function () { out.textContent = (+s.value).toFixed(2); set(+s.value); changed(); } });
      return h('label', { class: 'fld' }, h('span', { class: 'note', text: p.label }), h('span', { class: 'row', style: 'gap:6px' }, s, out));
    }
    function charParams(d, f) {
      var es = h('select', { onchange: function () { d.look.eyes = es.value; changed(); } }), bs = h('select', { onchange: function () { d.look.brows = bs.value; changed(); } });
      Object.keys(LIB.eyeStyles).forEach(function (k) { es.appendChild(h('option', { value: k, text: LIB.eyeStyles[k].label || k })); });
      Object.keys(LIB.browStyles).forEach(function (k) { bs.appendChild(h('option', { value: k, text: LIB.browStyles[k].label || k })); });
      es.value = d.look.eyes; bs.value = d.look.brows;
      f.appendChild(h('div', { class: 'row' }, field('Mắt', es), field('Mày', bs)));
      var t = h('div', { class: 'slotgrid' }), prm = h('div', { class: 'stack' });
      d.look.params = d.look.params || {};
      function paintParams() {
        clear(prm);
        LIB_SLOTS().forEach(function (slot) {
          var p = GC.getPart(slot, GC.partRef(d, slot), d.pack);
          if (!p || !p.params) return;
          Object.keys(p.params).forEach(function (k) {
            var cur = ((d.look.params[slot] || {})[k]);
            prm.appendChild(slider({ label: LIB.slots[slot].label + ' · ' + p.params[k].label, min: p.params[k].min, max: p.params[k].max, step: p.params[k].step }, cur == null ? p.params[k].def : cur,
              function (v) { d.look.params[slot] = d.look.params[slot] || {}; d.look.params[slot][k] = v; }));
          });
        });
      }
      // dấu nhận diện: linh kiện bắt buộc giữ khi diễn / phối lại (cổng kiểm "identity" — bắt buộc khi chuyển duyệt)
      var idBox = h('div', { class: 'fxchips' });
      function paintId() {
        clear(idBox);
        d.identity.must = d.identity.must.filter(function (m) { var x = m.split(':'), p = GC.getPart(x[0], GC.partRef(d, x[0]), d.pack); return p && p.id === x[1]; });
        LIB_SLOTS().forEach(function (slot) {
          var p = GC.getPart(slot, GC.partRef(d, slot), d.pack);
          if (!p || p.id === 'none' || (p.pack === 'afi.core' && p.khung)) return;   // thân trần của ma-nơ-canh không phải dấu nhận diện
          var tag = slot + ':' + p.id, on = d.identity.must.indexOf(tag) >= 0;
          idBox.appendChild(h('button', { 'aria-pressed': String(on), title: tag, onclick: function () {
            if (on) d.identity.must = d.identity.must.filter(function (m) { return m !== tag; }); else d.identity.must.push(tag);
            paintId(); changed();
          } }, LIB.slots[slot].label + ': ' + p.label));
        });
        if (!idBox.children.length) idBox.appendChild(h('span', { class: 'note', text: 'Chọn linh kiện riêng (không phải khung trần) để đánh dấu nhận diện.' }));
      }
      LIB_SLOTS().forEach(function (slot) {
        var s = h('select', { onchange: function () { d.look.parts[slot] = s.value; paintParams(); paintId(); changed(); } });
        GC.partsOfSlot(slot).forEach(function (p) { s.appendChild(h('option', { value: p.pack + '/' + p.id, text: p.label + (p.pack === MY_PACK ? ' · của tôi' : '') })); });
        var cur = GC.getPart(slot, GC.partRef(d, slot), d.pack);
        if (cur) s.value = cur.pack + '/' + cur.id;
        t.appendChild(field(LIB.slots[slot].label, s));
      });
      paintParams(); paintId();
      f.appendChild(h('b', { text: 'Linh kiện (khối khung hoặc linh kiện tự vẽ)' })); f.appendChild(t); f.appendChild(prm);
      f.appendChild(h('b', { text: 'Dấu nhận diện (bấm để chọn)' })); f.appendChild(idBox);
      f.appendChild(h('b', { text: 'Bảng màu' }));
      f.appendChild(colors(NEW_PAL_CHAR, d.look.palette, LIB.defaults, function (k, v) { d.look.palette[k] = v; }));
      var per = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Tính cách / vai (AI đạo diễn đọc mục này)', oninput: function () { d.persona = per.value; } });
      per.value = d.persona || '';
      f.appendChild(field('Tính cách', per));
    }
    function itemParams(d, f) {
      var p = GC.getPart(d.equip.slot, d.equip.part);
      var ty = h('select', { onchange: function () { d.type = ty.value; changed(); } }), ra = h('select', { onchange: function () { d.rarity = ra.value; changed(); } });
      Object.keys(I.types).filter(function (k) { return I.types[k].slots.indexOf(d.equip.slot) >= 0; }).forEach(function (k) { ty.appendChild(h('option', { value: k, text: I.types[k].label })); });
      I.rarityOrder.forEach(function (k) { ra.appendChild(h('option', { value: k, text: I.rarity[k].label })); });
      ty.value = d.type; ra.value = d.rarity;
      f.appendChild(h('div', { class: 'row' }, field('Loại', ty), field('Độ hiếm', ra)));
      if (p && p.params) Object.keys(p.params).forEach(function (k) {
        f.appendChild(slider(p.params[k], d.equip.params[k] == null ? p.params[k].def : d.equip.params[k], function (v) { d.equip.params[k] = v; }));
      });
      f.appendChild(h('b', { text: 'Màu' }));
      f.appendChild(colors([['metal', 'Kim loại'], ['wood', 'Gỗ'], ['accent', 'Điểm nhấn'], ['hat', 'Mũ'], ['robe', 'Áo'], ['trim', 'Viền'], ['cape', 'Choàng'], ['boots', 'Giày']], d.equip.palette, LIB.defaults, function (k, v) { d.equip.palette[k] = v; }));
      var st = h('div', { class: 'row' });
      Object.keys(I.stats).forEach(function (k) {
        var n = h('input', { type: 'number', min: 0, max: 999, value: d.stats[k] || '', style: 'width:64px', oninput: function () { if (n.value === '') delete d.stats[k]; else d.stats[k] = Math.max(0, Math.min(999, Math.round(+n.value))); changed(); } });
        st.appendChild(field(I.stats[k], n));
      });
      f.appendChild(h('b', { text: 'Chỉ số' })); f.appendChild(st);
      var ds = h('input', { type: 'text', maxlength: 200, value: d.description || '', style: 'width:100%', oninput: function () { d.description = ds.value; changed(); } });
      f.appendChild(field('Mô tả', ds));
    }
    function sceneParams(d, f) {
      var t = h('div', { class: 'slotgrid' });
      S.layerOrder.forEach(function (slot) {
        var s = h('select', { onchange: function () { if (s.value) d.layers[slot] = { part: s.value }; else delete d.layers[slot]; changed(); } });
        if (!S.slots[slot].required) s.appendChild(h('option', { value: '', text: '— không —' }));
        GC.scenery(slot).forEach(function (p) { s.appendChild(h('option', { value: p.pack + '/' + p.id, text: p.label + (p.pack === MY_PACK ? ' · của tôi' : '') })); });
        s.value = d.layers[slot] ? d.layers[slot].part : '';
        t.appendChild(field(S.slots[slot].label, s));
      });
      f.appendChild(h('b', { text: 'Lớp phông' })); f.appendChild(t);
      var tm = h('select', { onchange: function () { d.time = tm.value; changed(); } }), we = h('select', { onchange: function () { d.weather = we.value; changed(); } });
      S.timeOrder.forEach(function (k) { tm.appendChild(h('option', { value: k, text: S.times[k].label })); });
      S.weatherOrder.forEach(function (k) { we.appendChild(h('option', { value: k, text: S.weathers[k].label })); });
      tm.value = d.time; we.value = d.weather;
      f.appendChild(h('div', { class: 'row' }, field('Giờ', tm), field('Thời tiết', we)));
      f.appendChild(h('b', { text: 'Bảng màu cảnh' }));
      f.appendChild(colors(Object.keys(S.defaults).map(function (k) { return [k, k]; }), d.palette, S.defaults, function (k, v) { d.palette[k] = v; }));
      var ds = h('input', { type: 'text', maxlength: 300, value: d.description || '', style: 'width:100%', oninput: function () { d.description = ds.value; } });
      f.appendChild(field('Mô tả', ds));
    }

    // ③ soát + ④ cổng & lưu — dựng lại khi tham số đổi (ảnh tĩnh, ≤ 12 ô: trong ngân sách L-42)
    function review() {
      clear(right);
      var d = u.d; if (!d) return;
      var box = h('div', { class: 'pad stack' }), gates = [], errs = [], preview = clone(d);
      preview.key = 'draft/' + (d.id || 'x');
      if (u.kind === 'character') {
        gates = GC.gate(preview);
        var row8 = h('div', { class: 'revgrid' });
        DIR8.forEach(function (v) { row8.appendChild(h('figure', null, h('img', { src: R.imageURL(preview, 'normal', { director: { view: v } }), alt: VIEW_LABEL[v] }), h('figcaption', { class: 'note', text: VIEW_LABEL[v] }))); });
        var rowA = h('div', { class: 'revgrid' });
        REVIEW_ACTS.forEach(function (a) { var dd = { view: 'left45' }; if (a[1]) dd.activity = a[1]; rowA.appendChild(h('figure', null, h('img', { src: R.imageURL(preview, a[0], { director: dd }), alt: a[2] }), h('figcaption', { class: 'note', text: a[2] }))); });
        box.appendChild(h('b', { text: '8 hướng' })); box.appendChild(row8); box.appendChild(h('b', { text: 'Hoạt động (45°)' })); box.appendChild(rowA);
      } else if (u.kind === 'item') {
        var c = GC.checkItem(d); errs = c.errors;
        if (!errs.length) {
          var it = Object.assign({ key: 'draft/' + c.def.id, pack: 'draft' }, c.def);
          gates = GC.itemGate(it);
          var tmp = GC.registerItem('draft.tmp', c.def).def, base = GC.ASSETS['afi.khung/ma-no-canh'], a = clone(base), rowE = h('div', { class: 'revgrid' });
          a.key = 'draft/eq-' + JSON.stringify(c.def).length + '-' + c.def.id; a.look.equip = {}; a.look.equip[c.def.equip.slot] = tmp.key;
          ['front', 'left45', 'left90', 'back'].forEach(function (v) { rowE.appendChild(h('figure', null, h('img', { src: svgURL(GC.svgString(a, 'normal', { director: { view: v } })), alt: VIEW_LABEL[v] }), h('figcaption', { class: 'note', text: VIEW_LABEL[v] }))); });
          delete GC.ITEMS[tmp.key]; GC.ITEM_ORDER.splice(GC.ITEM_ORDER.indexOf(tmp.key), 1);
          box.appendChild(h('div', { class: 'row', style: 'align-items:flex-start' }, h('img', { src: svgURL(GC.itemSvg(it, { size: 120 })), alt: 'icon', style: 'width:110px' }), h('img', { src: svgURL(GC.itemSvg(it, { mode: 'card' })), alt: 'thẻ', style: 'width:130px' })));
          box.appendChild(h('b', { text: 'Mặc lên ma-nơ-canh' })); box.appendChild(rowE);
        }
      } else {
        var cs = GC.checkScene(d); errs = cs.errors;
        if (!errs.length) {
          var sc = Object.assign({ key: 'draft/' + cs.def.id }, cs.def);
          gates = GC.sceneGate(sc);
          var m = GC.ASSETS['afi.khung/ma-no-canh'];
          [['', 'Như đã chọn', []], ['night', 'Đêm', []], ['', 'Có diễn viên', [{ character: m.key, spot: 'left' }, { character: m.key, spot: 'right' }]]].forEach(function (x) {
            var o = { cast: x[2] }; if (x[0]) o.time = x[0];
            box.appendChild(h('figure', { style: 'margin:0' }, h('img', { src: svgURL(GC.sceneSvg(sc, o)), alt: x[1], style: 'width:100%;display:block;border-radius:4px' }), h('figcaption', { class: 'note', text: x[1] })));
          });
        }
      }
      right.appendChild(h('div', { class: 'panel' }, stepHead('3', 'Soát mọi góc'), errs.length ? h('div', { class: 'pad note', text: 'Sửa lỗi dữ liệu ở bước 4 để xem.' }) : box));
      // ④
      var blocking = errs.length ? errs.map(function (e) { return { label: e }; }) : (u.kind === 'character' ? GC.blockingGates(gates, 'draft') : gates.filter(function (g) { return !g.ok && !g.info; }));
      if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(d.id)) blocking = blocking.concat({ label: 'Mã (id): chữ thường, số, gạch nối' });
      var gl = h('ul', { class: 'gates' });
      (errs.length ? errs.map(function (e) { return { ok: false, label: e }; }) : gates).forEach(function (g) {
        var soft = !g.ok && blocking.indexOf(g) < 0 && !errs.length;   // không chặn bản nháp (vd. dấu nhận diện) — cần khi chuyển duyệt
        gl.appendChild(h('li', { class: g.ok ? (g.info ? 'info' : 'ok') : soft ? 'warn' : 'bad' }, h('b', { text: g.ok ? (g.info ? 'ℹ' : '✓') : soft ? '⚠' : '✗' }), ' ' + g.label,
          g.detail ? h('span', { class: 'note', text: ' — ' + g.detail }) : null, soft ? h('span', { class: 'note', text: ' (cần khi chuyển duyệt, nháp vẫn lưu được)' }) : null));
      });
      var saveB = h('button', { class: 'btn primary', disabled: blocking.length ? '' : null, onclick: function () { save(saveB); } }, 'Lưu vào Thư viện · ' + Projects.name(u.project));
      var after = h('div', { class: 'row' });
      if (u.saved) {
        var sv = u.saved, page = u.kind === 'character' ? 'lib-characters' : u.kind === 'item' ? 'lib-items' : 'lib-scenes', fab = u.kind === 'character' ? 'character' : u.kind === 'item' ? 'items' : 'scenes';
        after.appendChild(h('span', { class: 'note', text: 'Đã lưu ' + sv.key + ' (bản ' + sv.version + '). Tiếp theo:' }));
        after.appendChild(h('button', { class: 'btn sm primary', title: 'Tạo asset mới từ cùng khung, cùng dự án', onclick: function () { start(u.kind, u.frame); } }, '+ Tạo tiếp'));
        after.appendChild(h('button', { class: 'btn sm', onclick: function () { go({ page: page, key: sv.key }); } }, 'Xem trong Thư viện ›'));
        after.appendChild(h('button', { class: 'btn sm', onclick: function () { go({ page: 'works', project: u.project }); } }, 'Làm phim với dự án này ›'));
        after.appendChild(h('button', { class: 'btn sm', onclick: function () { go(fab === 'character' ? { page: 'character', key: sv.key, tab: 'look' } : { page: fab, key: sv.key }); } }, 'Chỉnh sâu ở bàn chỉnh ›'));
      }
      right.appendChild(h('div', { class: 'panel' }, stepHead('4', 'Cổng kiểm & lưu', blocking.length ? blocking.length + ' mục chặn' : 'đạt'), h('div', { class: 'pad stack' }, gl, h('div', { class: 'row' }, saveB), after)));
    }
    function save(btn) {
      var d = clone(u.d), note = 'Tạo từ khung ' + u.frame.key;
      d.project = u.project; btn.disabled = true;
      var p;
      if (u.kind === 'character') p = Store.save(d, note);
      else if (Store.mode !== 'server') p = Promise.reject(new Error('Lưu vật phẩm / bối cảnh cần chạy bản cài (server).'));
      else if (u.kind === 'item') p = Store.api('POST', 'api/items', { item: d, note: note }).then(function (rec) { return GC.registerItem(MY_PACK, rec).def; });
      else p = Store.api('POST', 'api/scenes', { scene: d, note: note }).then(function (rec) { return GC.registerScene(MY_PACK, rec).def; });
      p.then(function (rec) { u.saved = rec; u.d.version = rec.version; setLastProject(u.project); toast('Đã lưu ' + rec.name + ' vào dự án ' + Projects.name(u.project)); renderNav(); paintSteps(); review(); })
        .catch(function (e) { toast(e.message); btn.disabled = false; });
    }
    // vào thẳng một khung (từ trang Bộ khung chuẩn: ?kind=…&frame=…)
    var fr0 = r.frame && frames(u.kind).filter(function (x) { return x.key === r.frame; })[0];
    if (fr0) start(u.kind, fr0); else paint();
  };

  /* ============================================================ XƯỞNG › Bộ khung chuẩn (quy cách vẽ thành hình) */
  // Không chủ đề: ma-nơ-canh đầu trọc, khối vật phẩm, khối bối cảnh. Mọi asset tạo ra phải khớp quy cách này (docs/QUY-CACH-KHUNG.md).
  PAGES.khung = function () {
    crumbs([{ t: 'Bộ khung chuẩn' }]);
    actions(h('span', { class: 'note', text: 'Khung do Gen Labs giữ. Asset mới = bản sao của khung + tham số của bạn.' }), h('button', { class: 'btn primary', onclick: function () { go({ page: 'create' }); } }, '+ Tạo asset mới từ khung ›'));
    var m = GC.ASSETS['afi.khung/ma-no-canh'] || GC.assets()[0];
    var S = GC.SCENE;
    function cellImg(url, w, label) { return h('figure', { style: 'margin:0;display:grid;justify-items:center;gap:2px;width:' + w + 'px' }, h('img', { src: url, alt: label, style: 'width:100%;display:block' }), h('figcaption', { class: 'note', style: 'text-align:center', text: label })); }
    var views = h('div', { class: 'row', style: 'align-items:flex-end' });
    VIEWS_ALL.forEach(function (v) {
      views.appendChild(cellImg(R.imageURL(m, 'normal', { director: { view: v[0] } }), 96, v[1]));
    });
    var acts = h('div', { class: 'row', style: 'align-items:flex-end' });
    LIB.activityOrder.forEach(function (a) {
      var A = LIB.activities[a];
      acts.appendChild(cellImg(R.imageURL(m, A.state || 'normal', { director: { activity: a, view: 'left45' } }), 84, A.label));
    });
    var items = h('div', { class: 'libgrid' });
    GC.items().filter(function (it) { return it.pack === 'afi.khung'; }).forEach(function (it) {
      var a = clone(m); a.key = 'khung/' + it.id; a.look.equip = {}; a.look.equip[it.equip.slot] = it.key;
      items.appendChild(h('div', { class: 'libcard' }, h('div', { class: 'im', style: 'display:flex;gap:4px;padding:4px' },
        h('img', { src: R.imageURL(a, 'normal', { director: { view: 'left45' } }), alt: it.name, style: 'width:60%' }),
        h('img', { src: svgURL(GC.itemSvg(it, { size: 80 })), alt: '', style: 'width:38%;align-self:center' })),
        h('div', { class: 'lb' }, h('b', { text: it.name }), h('span', { class: 'note', text: (GC.getPart(it.equip.slot, it.equip.part) || {}).label || '' }))));
    });
    var scenes = h('div', { class: 'stack' });
    GC.scenes().filter(function (sc) { return sc.pack === 'afi.khung'; }).forEach(function (sc) {
      scenes.appendChild(cellImg(svgURL(GC.sceneSvg(sc, { cast: S.spotOrder.map(function (sp) { return { asset: m, spot: sp }; }) })), 640, sc.name + ' — ma-nơ-canh ở đủ ' + S.spotOrder.length + ' chỗ đứng'));
    });
    var blocks = h('div', { class: 'row' });
    GC.scenery('deco').filter(function (p) { return p.pack === 'afi.khung'; }).forEach(function (p) {
      var sc = { key: 'khung/deco-' + p.id, id: 'q', layers: { sky: { part: 'afi.khung/khung-troi', dx: 0 }, ground: { part: 'afi.khung/khung-nen', dx: 0 } }, palette: (GC.getScene('afi.khung/san-khau-chuan') || {}).palette || {},
        deco: [{ part: 'afi.khung/' + p.id, x: 320, y: 320, scale: 1.4, flip: false, z: 'back' }], time: 'day', weather: 'clear', spots: S.spotOrder.slice() };
      blocks.appendChild(cellImg(svgURL(GC.sceneSvg(sc, { size: 200 })), 150, p.label));
    });
    var spec = h('table', { class: 'grid' });
    [['Khung nhân vật', '200 × 240; chân chạm đất (100, 228); 18 khớp; 11 bộ phận; 8 hướng nhìn (2.5D); ' + LIB.stateOrder.length + ' biểu cảm; ' + LIB.activityOrder.length + ' hoạt động'],
     ['Điểm gắn tay', 'lòng bàn tay phải (128, 193) · trái (72, 193)'],
     ['Khung vật phẩm', '10 khối theo dáng — mỗi khối là gốc cho một họ vật phẩm, có tham số (độ dài, cỡ, độ cao, độ rộng)'],
     ['Khung bối cảnh', S.W + ' × ' + S.H + '; 6 lớp; chân trời y ≈ 230–260; nền từ y 258; hàng trước y 330 (cỡ 0.8) · hàng sau y 280 (cỡ 0.62)'],
     ['Giờ · thời tiết', S.timeOrder.length + ' giờ · ' + S.weatherOrder.length + ' thời tiết — chỉ đổi token màu, không vẽ lại'],
     ['Ngân sách', 'diễn viên ≤ ' + S.budget.cast + ' · đạo cụ ≤ ' + S.budget.deco + ' · hạt thời tiết ≤ ' + S.budget.particles],
     ['Màu', 'chỉ dùng token; khung dùng bảng màu xám trung tính — asset chủ đề đổi token để "thay áo"'],
     ['Quy trình tạo asset', 'chọn khung → thêm tham số / chi tiết → soát → qua cổng kiểm → lưu Thư viện theo dự án chủ đề']].forEach(function (r) {
      spec.appendChild(h('tr', null, h('td', { class: 'k nw', text: r[0] }), h('td', { text: r[1] })));
    });
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'banner' }, h('span', { text: 'Khung chuẩn không có chủ đề. Mọi asset (của Gen Labs, người dùng hay AI) tạo ra từ khung này và phải khớp quy cách. Chi tiết: docs/QUY-CACH-KHUNG.md' })),
      h('div', { class: 'panel' }, h('h3', null, 'Quy cách'), spec),
      h('div', { class: 'panel' }, h('h3', null, 'Khung nhân vật — ma-nơ-canh', h('span', { class: 'r mono', text: m.key })), h('div', { class: 'pad stack' }, views, acts)),
      h('div', { class: 'panel' }, h('h3', null, 'Khung vật phẩm — khối theo dáng', h('span', { class: 'r note', text: 'mặc lên ma-nơ-canh (45°) + icon' })), h('div', { class: 'pad' }, items)),
      h('div', { class: 'panel' }, h('h3', null, 'Khung bối cảnh', h('span', { class: 'r note', text: 'nền có lưới tỉ lệ; vạch đứt = hàng sau / hàng trước' })), h('div', { class: 'pad stack' }, scenes, blocks))));
  };

  /* ============================================================ XƯỞNG › Bàn phối cảnh (loại asset thứ ba) */
  // Cảnh = phối phông có sẵn theo lớp + đạo cụ + bảng màu + giờ + thời tiết. Lưu qua cùng cổng ghi với MCP (POST /api/scenes → saveSceneChecked).
  PAGES.scenes = function (r) {
    var S = GC.SCENE;
    crumbs([{ t: 'Bàn chỉnh bối cảnh' }]);
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
      h('button', { class: 'btn', onclick: function () { go({ page: 'create', kind: 'scene' }); } }, '+ Bối cảnh mới'),
      saveBtn);
    var left = h('div', { class: 'stack' }), right = h('div', { class: 'stack' });
    $('view').appendChild(h('div', { class: 'detail scenefab' }, left, h('div', { class: 'sticky stack' }, right)));
    var img = h('img', { alt: 'xem trước cảnh', style: 'width:100%;display:block;border-radius:6px' });
    var gateBox = h('div'), errBox = h('ul', { class: 'errs' });
    var castRows = [{ id: 'ma-no-canh', spot: 'midLeft', activity: '' }, { id: 'ma-no-canh', spot: 'midRight', activity: 'attack' }];
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
      GC.scenery(slot).forEach(function (p) { var ref = p.pack + '/' + p.id; sel.appendChild(h('option', { value: ref, text: p.label + (p.pack !== 'afi.khung' ? ' · ' + p.pack : ''), selected: ref === cur })); });
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
      var addDeco = h('button', { class: 'btn sm', disabled: (w.deco || []).length >= S.budget.deco, onclick: function () { w.deco = w.deco || []; w.deco.push({ part: 'afi.khung/khoi-da', x: 320, y: 300, scale: 1, flip: false, z: 'back' }); paintAll(); } }, '+ Đạo cụ');
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
          h('div', { class: 'note', text: 'Agent (Claude Code, Claude web/desktop, hoặc agent bất kỳ hỗ trợ MCP) gọi 31 tool: tra kho, kiểm, dựng SVG; tạo nhân vật / linh kiện / vật phẩm / bối cảnh; dự án chủ đề và gói dự án; tác phẩm (kịch bản, phân cảnh); kiểm và cập nhật phiên bản. Kết quả hiện ngay trong Studio.' }),
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
  Store.init().then(function () { return Projects.load(); }).then(function () {
    $('verChip').textContent = Store.mode === 'server' ? 'v' + String(Store.info.version).replace(/^v/, '') : 'xem thử';
    $('modeNote').textContent = Store.mode === 'server' ? 'Đang chạy trên máy · dữ liệu lưu cục bộ' : 'Bản xem thử · lưu trong trình duyệt';
    document.title = 'gen-chibi · ' + (APP ? APP.name : 'Studio');
    try { var tmsg = localStorage.getItem('gc-toast'); if (tmsg) { localStorage.removeItem('gc-toast'); setTimeout(function () { toast(tmsg); }, 300); } } catch (e) { /* bỏ qua */ }
    $('appName').textContent = APP ? APP.name : 'Studio';
    $('brand').setAttribute('href', appURL(''));
    var r = { page: APP ? APP.home : 'home' };
    try {
      var saved = APP && JSON.parse(localStorage.getItem(routeKey(APP)) || 'null');
      var z0 = saved && zoneOf(saved.page);
      if (saved && PAGES[saved.page] && (z0 === APP.zone || z0 === 'sys') && (saved.page !== 'character' || GC.ASSETS[saved.key])) r = saved;
    } catch (e) { /* bỏ qua */ }
    if (Store.mode === 'server') Store.api('GET', 'api/update').then(function (s) { updateBadge = s.available ? s.latest : false; go(r); }).catch(function () { go(r); });
    else go(r);
  });
})();
