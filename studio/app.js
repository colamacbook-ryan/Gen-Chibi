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
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }   // so khớp không dấu
  function fmtTime(s) { if (!s) return '—'; var d = new Date(s); return d.toLocaleString('vi-VN', { hour12: false }); }
  function stateLabel(id) { return (LIB.states[id] || {}).label || id; }
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800); }
  var OWN = ['#5B9BD5', '#4FB57A', '#8C86E0', '#E0A43A', '#C08463', '#2BB3A3', '#D9708F', '#B97BD0', '#8DA65A', '#E4785F'];
  function ownOf(a) { var i = GC.ASSET_ORDER.indexOf(a.key); return a.own || OWN[(i < 0 ? 0 : i) % OWN.length]; }

  /* ============================================================ lưu trữ */
  var MY_PACK = 'local.my';
  // nạp bản ghi đã lưu như sync() của server: bản ghi cũ nằm trong pack khung → bản sao "Của tôi", khung không bị đè
  function regStored(a) {
    var P = GC.PACKS[GC.canonPack(a.pack)];
    if (P && P.group === 'frame') { if (!GC.ASSETS[MY_PACK + '/' + a.id]) GC.registerAsset(MY_PACK, Object.assign({}, a, { pack: MY_PACK, status: 'draft' })); return; }   // bản sao từ khung luôn là nháp (như server)
    GC.registerAsset(a.pack, a);
  }
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
          // lỗi cổng kiểm (422) mang theo danh sách lỗi chi tiết để trang hiện đủ, không chỉ câu tóm tắt
          return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw Object.assign(new Error(j.error || ('Lỗi ' + r.status)), { status: r.status, errors: j.errors || null, retryAt: j.retryAt || null, cap: j.cap === true }); return j; });   // cap: 429 do chạm trần câu / ngày của máy (Cài đặt AI), khác hết lượt của Google
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
          .then(function (list) { (list || []).forEach(regStored); return self.api('GET', 'api/sound-packs').catch(function () { return []; }); })
          .then(function (snd) {
            // gói âm (v0.18): nạp trước gói động tác — sự kiện của gói động tác có thể gọi tên âm của gói; engine kiểm lại qua cổng như mọi gói
            (snd || []).forEach(function (d) { var r4 = GC.sounds && GC.sounds.registerPack(d); if (r4 && r4.errors.length) console.warn('bỏ gói âm', d.id, r4.errors); });
            return self.api('GET', 'api/motion-packs').catch(function () { return []; });
          })
          .then(function (packs) {
            // gói động tác (v0.16): sau nhân vật — màn diễn trong gói trỏ tới nhân vật của bộ
            (packs || []).forEach(function (d) { var r3 = GC.choreo && GC.choreo.registerPack(MY_PACK, d); if (r3 && r3.errors.length) console.warn('bỏ gói động tác', d.id, r3.errors); });
          });
      }).catch(function () {
          self.mode = 'browser';
          try { JSON.parse(localStorage.getItem('gc-assets') || '[]').forEach(regStored); } catch (e) { /* bỏ qua */ }
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
    ['fab', 'Xưởng', 'tạo asset từ khung', [['create', 'Tạo asset mới'], ['characters', 'Bàn chỉnh nhân vật'], ['items', 'Bàn chỉnh vật phẩm'], ['scenes', 'Bàn chỉnh bối cảnh']]],
    ['fab', 'Khung chuẩn', 'quy cách · kiểm (Gen Labs giữ)', [['khung', 'Bộ khung chuẩn'], ['library', 'Kho linh kiện & phông'], ['poses', 'Khung tư thế & hoạt động'], ['states', 'Khung biểu cảm & động tác'], ['gates', 'Cổng kiểm & hiệu năng']], 'khung'],
    ['lib', 'Thư viện', 'theo dự án chủ đề · lấy về dùng', [['projects', 'Dự án chủ đề'], ['lib-characters', 'Nhân vật'], ['lib-items', 'Vật phẩm'], ['lib-scenes', 'Bối cảnh'], ['lib-motions', 'Động tác'], ['lib-sounds', 'Âm thanh'], ['lib-voices', 'Giọng']]],
    ['make', 'Tạo tác', 'làm phim / truyện với AI', [['works', 'Tác phẩm']]],
    ['sys', 'Hệ thống', '', [['ai', 'Cài đặt AI'], ['update', 'Cập nhật']]]
  ];
  var PAGE_ALIAS = { character: 'characters', export: 'lib-characters', workshop: 'create' };   // workshop = trang chat cũ → nay là dock Trợ lý AI (mở dock rồi về trang chủ của khu)
  // BA ỨNG DỤNG ĐỘC LẬP (Ryan 2026-10-18): mỗi lớp một địa chỉ, một menu, một màu — không lẫn nhau.
  //   /xuong · /thu-vien · /tao-tac (bản xem thử không có server: ?app=…). "/" = màn chọn lớp.
  //   Trang Hệ thống (Cài đặt AI, Cập nhật) có ở cả ba. Bấm sang trang của lớp khác → mở ứng dụng của lớp đó.
  var PAGES = {};
  var APPS = [
    { id: 'xuong', zone: 'fab', name: 'Xưởng', desc: 'Bộ khung chuẩn (không chủ đề) → tạo asset: chọn khung, thêm tham số, soát mọi góc, qua cổng kiểm, lưu vào dự án.', home: 'create' },
    { id: 'thu-vien', zone: 'lib', name: 'Thư viện', desc: 'Asset đã qua cổng kiểm, xếp theo dự án chủ đề — xem, tải ảnh / sprite, chép mã, tải gói dự án.', home: 'projects' },
    { id: 'tao-tac', zone: 'make', name: 'Tạo tác', desc: 'Làm phim / truyện: danh sách tác phẩm → phòng làm phim riêng của từng tác phẩm (kịch bản, phân cảnh, xem & duyệt, giọng & âm thanh, xuất bản); AI đạo diễn ở cột phải.', home: 'works' }
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
    var COUNT = { 'lib-characters': function () { return lib(GC.assets()); }, 'lib-items': function () { return lib(GC.items()); }, 'lib-scenes': function () { return lib(GC.scenes()); }, projects: function () { return Projects.all().length; },
      'lib-motions': function () { return GC.choreo ? Object.keys(GC.choreo.ACTIONS).length : 0; },
      'lib-sounds': function () { return GC.sounds ? GC.sounds.names().length : 0; }, 'lib-voices': function () { return GC.voices ? GC.voices.roleList().length : 0; } };
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
    if (r.page !== 'works') setHash('', !!location.hash);   // địa chỉ #/tac-pham/<id>/<tab> chỉ có ở Tạo tác › Tác phẩm
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
    dockRoute(r);   // dock biết khu / trang trước; trang tự báo đối tượng đang xem (dockObj) khi dựng
    (PAGES[r.page] || PAGES['lib-characters'])(r);
  }
  /* ============================================================ DOCK Trợ lý AI (studio/dock.js) — cầu nối */
  // MỘT trợ lý ở cột phải mọi khu, đổi vai theo khu. Trang báo cho dock biết "đang xem gì" (đối tượng, tab, cảnh) và gắn data-anchor lên phần tử có ID thật.
  function dockZone(page) {
    var z = zoneOf(page);
    if (z === 'make') return 'tao-tac';
    if (z === 'lib') return 'thu-vien';
    if (z === 'fab') { var p = PAGE_ALIAS[page] || page; return NAV.filter(function (g) { return g[4] === 'khung'; })[0][3].some(function (it) { return it[0] === p; }) ? 'khung' : 'xuong'; }   // nhóm NAV mang id 'khung' (Khung chuẩn) = khu Bộ khung
    return 'he-thong';
  }
  function pageLabel(page) {
    var p = PAGE_ALIAS[page] || page, L = page === 'home' ? 'Chọn khu' : '';
    NAV.forEach(function (g) { g[3].forEach(function (it) { if (it[0] === p) L = it[1]; }); });
    return L || p;
  }
  function dockRoute(r) { if (window.GCDock) window.GCDock.route({ zone: dockZone(r.page), page: r.page, pageLabel: pageLabel(r.page) }); }
  // trang báo đối tượng đang xem: kind asset | project | work; id thật (key asset, id dự án / tác phẩm)
  function dockObj(kind, id, label) { if (window.GCDock) window.GCDock.ctx({ object: id ? { kind: kind, id: id, label: label || id } : null }); }
  // thuộc tính data-anchor (địa chỉ theo ID thật, sống sót khi sắp xếp / lọc / cuộn) + nhãn người đọc — trộn vào attrs của h()
  function anc(attrs, anchor, label) { attrs = attrs || {}; attrs['data-anchor'] = anchor; if (label) attrs['data-anchor-label'] = String(label).slice(0, 80); return attrs; }
  // lời gợi ý nhanh theo khu (chip dưới khung chat của dock)
  function dockQuick(info, obj) {
    var z = info && info.zone;
    if (z === 'tao-tac') return obj && obj.kind === 'work' ? [['Viết kịch bản', 'Từ ý tưởng trong kịch bản tổng, viết logline + kịch bản hoàn chỉnh rồi lưu (save_work).'],
      ['Chia phân cảnh', 'Chia kịch bản thành các phân cảnh (save_shot): mỗi cảnh một bối cảnh trong Thư viện + dàn diễn viên. Thiếu thì tạo ở Xưởng.'],
      ['Viết lời thoại', 'Viết lời thoại + diễn xuất cho mọi phân cảnh chưa có (save_shot với event).'],
      ['Sửa theo ghi chú duyệt', 'Đọc ghi chú duyệt (get_work › review) và sửa các cảnh đang "Cần sửa" theo đúng ghi chú; đề xuất bằng propose_edit.'],
      ['Kiểm thiếu', 'Kiểm tác phẩm còn thiếu gì (nhân vật, bối cảnh, lời thoại) và tự bổ sung.']] : [['Gợi ý tác phẩm mới', 'Gợi ý 3 ý tưởng phim ngắn dùng nhân vật và bối cảnh đang có trong Thư viện.']];
    if (z === 'khung') return [['Giải thích khung xương', 'Giải thích ngắn bộ khung nhân vật: khớp, 8 hướng, biểu cảm, hoạt động — dùng dữ liệu thật của khung.'], ['Tạo gói động tác', 'Giúp tôi tạo một gói động tác mới trên khung xương: hỏi tôi muốn đòn gì rồi dựng bằng get_motion_spec → validate → save_motion_pack.']];
    if (z === 'thu-vien') return [['Tìm asset', 'Liệt kê asset trong Thư viện hợp với yêu cầu của tôi (lọc theo dự án).'], ['Ghép trang bị', 'Gợi ý trang bị trong Thư viện hợp với nhân vật đang xem và mặc thử.']];
    if (z === 'xuong') return [['Tạo nhân vật từ khung', 'Tạo một nhân vật mới từ khung ma-nơ-canh: hỏi tôi tên, vai, màu rồi lưu vào dự án đang chọn.'], ['Soát nhân vật này', 'Soát nhân vật đang xem: cổng kiểm, nhận diện, còn thiếu gì.']];
    return [];
  }
  // dữ liệu đổi sau lượt AI (asset / phân cảnh mới…): nạp lại kho + báo các trang đang mở vẽ lại phần của mình
  var dataSubs = [];
  function onData(fn) { dataSubs.push(fn); onLeave(function () { dataSubs = dataSubs.filter(function (f) { return f !== fn; }); }); }
  function reloadData() {
    var jobs = [['api/parts', function (d) { GC.registerDataPart(MY_PACK, d); }], ['api/items', function (d) { GC.registerItem(MY_PACK, d); }], ['api/scenes', function (d) { GC.registerScene(MY_PACK, d); }],
      ['api/assets', regStored], ['api/sound-packs', function (d) { if (GC.sounds) GC.sounds.registerPack(d); }], ['api/motion-packs', function (d) { if (GC.choreo) GC.choreo.registerPack(MY_PACK, d); }]];
    return jobs.reduce(function (p, j) { return p.then(function () { return Store.api('GET', j[0]).catch(function () { return []; }).then(function (l) { (l || []).forEach(function (d) { try { j[1](d); } catch (e) { /* bỏ mục hỏng */ } }); }); }); }, Promise.resolve()).then(function () { return Projects.load(); });
  }
  function refreshData(r) {
    var wrote = ((r && r.log) || []).some(function (l) { return l.ok && /^(save_|install_sample|import_project|propose_edit)/.test(l.tool); });
    if (!wrote || Store.mode !== 'server') return Promise.resolve();
    return reloadData().then(function () { renderNav(); dataSubs.slice().forEach(function (f) { try { f(r); } catch (e) { /* trang đã đóng */ } }); });
  }
  var DOCK_BRIDGE = {
    h: h, add: add, clear: clear, toast: toast, Store: Store, get Projects() { return Projects; }, MY_PACK: MY_PACK,
    go: function (r) { go(r); }, route: function () { return route; }, APP: function () { return APP; },
    zoneNow: function () { return APP ? APP.zone : 'home'; }, zoneOfPage: zoneOf, inProject: function (arr, pid) { return inProject(arr, pid); },
    quick: dockQuick, refreshData: refreshData,
    // trang chủ của một khu cho chip "Mở <khu>" của AI (anchor zone:<id>): Bộ khung = trang khung; ba ứng dụng = home của ứng dụng
    zoneHome: function (zone) { if (zone === 'khung') return { page: 'khung' }; var a = appById(zone); return a ? { page: a.home } : null; }
  };
  var ZONE_LABEL = { lib: 'Thư viện', make: 'Tạo tác', fab: 'Xưởng', sys: 'Hệ thống', home: 'gen-chibi' };
  // Màn chọn lớp ("/"): ba ứng dụng độc lập theo dòng chảy Xưởng → Thư viện → Tạo tác
  PAGES.home = function () {
    crumbs([{ t: 'Chọn khu làm việc' }]);
    var lib = function (arr) { return arr.filter(function (x) { return groupOf(x) !== 'frame'; }).length; };
    var stat = {
      xuong: GC.assets().filter(function (a) { return groupOf(a) === 'frame'; }).length + ' khung nhân vật · ' + GC.items().filter(function (a) { return groupOf(a) === 'frame'; }).length + ' khối vật phẩm · ' + GC.scenes().filter(function (a) { return groupOf(a) === 'frame'; }).length + ' sân khấu chuẩn',
      'thu-vien': Projects.all().length + ' dự án · ' + lib(GC.assets()) + ' nhân vật · ' + lib(GC.items()) + ' vật phẩm · ' + lib(GC.scenes()) + ' bối cảnh',
      'tao-tac': 'danh sách tác phẩm → phòng làm phim (5 tab) · AI đạo diễn ở cột phải'
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
      var demos = Store.mode === 'server' ? samplesLeft() : [];
      qs.appendChild(h('div', { class: 'pad stack' }, ol, demos.map(function (S) {
        return h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { importDemo(S); } }, S.button), h('span', { class: 'note', text: S.note }));
      })));
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
    var STATUS = { draft: ['Nháp', 'chip'], published: ['Phát hành', 'chip ok'] };   // GC.statusOf: approved → published, review → draft
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
        var st = STATUS[GC.statusOf(a.status)];
        var tr = h('tr', anc({ class: 'click', 'aria-selected': sel && sel.key === a.key ? 'true' : null,
          onclick: function () { sel = a; paint(); },
          ondblclick: function () { go({ page: 'character', key: a.key, tab: 'look' }); } }, 'asset:' + a.key, a.name),
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
      if (!sel) { dockObj('asset', null); insp.appendChild(h('div', { class: 'panel empty', text: 'Chọn một nhân vật.' })); return; }
      dockObj('asset', sel.key, sel.name);
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
  function newCharacter() { go({ page: 'create', kind: 'character', frame: 'gen.khung/ma-no-canh' }); }

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
    dockObj('asset', orig.key, orig.name);
    $('view').appendChild(h('div', anc({ class: 'detail' }, 'asset:' + orig.key, orig.name), left,
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
        var opts = GC.partsOfSlot(slot).map(function (x) { return [x.id, x.label + (x.pack !== 'gen.core' ? ' · ' + x.pack : '')]; });
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
      [['draft', 'Nháp — dùng ngay trong dự án'], ['published', 'Phát hành — vào gói bán']].forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (GC.statusOf(w.status) === o[0]) op.selected = true; status.appendChild(op); });
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
      var m = { id: 'mannequin', name: 'Ma-nơ-canh', pack: 'gen.core', version: 1, kind: 'character',
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
      var sc = { key: 'bench/' + slot + '-' + p.pack + '-' + p.id, id: 'bench', layers: { sky: { part: 'gen.khung/khung-troi', dx: 0 }, ground: { part: 'gen.khung/khung-nen', dx: 0 } }, deco: [], palette: {}, time: 'day', weather: 'clear', spots: S.spotOrder.slice() };
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
          row.appendChild(h('button', anc({ class: 'state-cell', 'aria-pressed': String(it === sel), title: it.key, onclick: function () { sel = it; paintGrid(); paintInsp(); } }, 'item:' + it.key, it.name),
            h('img', { src: u(GC.itemSvg(it, { size: 112 })), alt: it.name, style: 'width:100%;display:block' }),
            h('div', { class: 'lb' }, h('b', { text: it.name }), h('div', { class: 'note', style: 'color:' + I.rarity[it.rarity].color, text: I.rarity[it.rarity].label + (it.pack === MY_PACK ? ' · của tôi' : '') }))));
        });
        grid.appendChild(h('div', { class: 'panel' }, h('h3', null, I.types[t].label, h('span', { class: 'r note', text: list.length + ' item · mặc ở ' + I.types[t].slots.join('/') })), h('div', { class: 'pad' }, row)));
      });
    }
    function paintInsp() {
      clear(insp);
      dockObj('asset', sel && sel.key, sel && sel.name);
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


  /* ============================================================ trang chat cũ → dock Trợ lý AI */
  // Trang "Trợ lý AI tạo asset" không còn: trợ lý là một dock ở cột phải mọi khu (studio/dock.js). Đường cũ (route đã lưu, liên kết cũ) mở dock rồi về trang chủ của khu.
  PAGES.workshop = function () {
    if (window.GCDock) window.GCDock.open();
    go({ page: APP ? APP.home : 'create' });
  };

  /* ============================================================ TẠO TÁC › Tác phẩm (giai đoạn ③) */
  // Danh sách tác phẩm → PHÒNG LÀM PHIM 5 tab: kịch bản · phân cảnh · xem & duyệt (sân khấu ghép mọi phân cảnh thành chuỗi) · giọng & âm thanh · xuất bản. AI đạo diễn = dock cột phải.
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
  // âm thanh phim: bật / tắt tiếng + kiểu giọng, nhớ theo máy (engine/audio.js)
  var AudioPref = {
    get: function () { try { return JSON.parse(localStorage.getItem('gc-audio') || '{}') || {}; } catch (e) { return {}; } },
    apply: function () { var A = GC.audio, p = AudioPref.get(); if (!A) return; A.setMuted(!!p.muted); A.setVoiceMode(p.voice === 'ai' ? 'auto' : (p.voice || 'auto')); },   // 'ai' là kiểu của Studio (đọc AI ngay khi diễn) — engine chỉ biết auto | tts | blip | off
    set: function (k, v) { var p = AudioPref.get(); p[k] = v; try { localStorage.setItem('gc-audio', JSON.stringify(p)); } catch (e) { /* bỏ qua */ } AudioPref.apply(); }
  };
  AudioPref.apply();
  function audioControls() {
    if (!GC.audio) return null;
    var p = AudioPref.get();
    var mute = h('button', { class: 'btn sm', title: 'Bật / tắt tiếng phim (hiệu ứng, nền, nhạc, giọng)', 'aria-label': 'Bật / tắt tiếng', onclick: function () { var m = !GC.audio.muted; AudioPref.set('muted', m); mute.textContent = m ? '🔇' : '🔊'; } }, p.muted ? '🔇' : '🔊');
    var vs = h('select', { 'aria-label': 'Giọng nhân vật', title: 'Tự động: giọng AI đã lồng nếu có, không thì máy đọc (đúng ngôn ngữ + giới của vai) hoặc blip · AI Google: đọc bằng giọng AI ngay khi diễn (tốn lượt) · Máy đọc: giọng có sẵn của trình duyệt', onchange: function () {
      AudioPref.set('voice', vs.value);
      if (vs.value === 'ai') AiVoice.load().then(function () { if (!AiVoice.ready()) toast('Chưa có key giọng AI — dán key ở Cài đặt AI › Giọng AI. Tạm dùng giọng máy đọc.'); });
    } });
    VOICE_MODES.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if ((p.voice || 'auto') === o[0]) op.selected = true; vs.appendChild(op); });
    return [mute, vs];
  }
  // kiểu lời thoại của sân khấu, nhớ theo máy như âm thanh (engine/player.js: opts.dialog / setDialog):
  // tự động = bong bóng khi có chỗ sạch (không che đầu ai), không thì phụ đề dải dưới · bong bóng = luôn bong bóng · phụ đề = luôn phụ đề
  var DIALOG_MODES = [['auto', 'Lời thoại: tự động'], ['bubble', 'Lời thoại: bong bóng'], ['caption', 'Lời thoại: phụ đề']];
  var StagePref = {
    get: function () {
      var p; try { p = JSON.parse(localStorage.getItem('gc-stage') || '{}') || {}; } catch (e) { p = {}; }
      return { dialog: DIALOG_MODES.some(function (m) { return m[0] === p.dialog; }) ? p.dialog : 'auto' };
    },
    set: function (k, v) { var p = StagePref.get(); p[k] = v; try { localStorage.setItem('gc-stage', JSON.stringify(p)); } catch (e) { /* bỏ qua */ } }
  };
  function dialogControl(player) {
    var cur = StagePref.get().dialog;
    var sel = h('select', { 'aria-label': 'Kiểu lời thoại', title: 'Tự động: bong bóng khi có chỗ không che mặt ai, không thì phụ đề dải dưới · Bong bóng: luôn bong bóng · Phụ đề: luôn phụ đề',
      onchange: function () { StagePref.set('dialog', sel.value); player.setDialog(sel.value); } });
    DIALOG_MODES.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (cur === o[0]) op.selected = true; sel.appendChild(op); });
    return sel;
  }
  /* ============================================================ Giọng AI (Google Gemini TTS) + giọng theo vai
   * Server (server/voice.js) giữ key; Studio chỉ hỏi qua Store.api. Kiểu giọng của sân khấu (AudioPref.voice):
   *   auto = dùng clip AI ĐÃ lồng nếu có (hỏi "dry" — không tốn lượt, không gọi Google), chưa có thì máy đọc / blip;
   *   ai   = đọc bằng giọng AI ngay khi diễn (tốn lượt; hết lượt / chưa có key → MỘT thông báo rồi rơi về máy đọc);
   *   tts · blip · off = như cũ, không đụng tới giọng AI.
   * GC.audio.setVoiceMode chỉ nhận auto | tts | blip | off → 'ai' ánh xạ thành 'auto' (AudioPref.apply). Ngân sách: mỗi câu hỏi server MỘT lần
   * (nhớ clip trong bộ nhớ, tối đa 160 clip), không việc gì mỗi khung hình. */
  var VOICE_MODES = [['auto', 'Giọng: tự động'], ['ai', 'Giọng: AI Google'], ['tts', 'Giọng: máy đọc'], ['blip', 'Giọng: blip kiểu game'], ['off', 'Giọng: tắt']];
  // ngôn ngữ + giọng vùng đang chọn ở các ô nghe thử (Hồ sơ nhân vật, Cài đặt AI) — nhớ theo máy
  var VoicePref = {
    get: function () {
      var p; try { p = JSON.parse(localStorage.getItem('gc-voice') || '{}') || {}; } catch (e) { p = {}; }
      var l = GC.voices.lang(p.lang);
      return { lang: l, accent: GC.voices.accent(l, p.accent) };
    },
    set: function (lang, accent) { try { localStorage.setItem('gc-voice', JSON.stringify({ lang: lang, accent: accent })); } catch (e) { /* bỏ qua */ } }
  };
  var VOICE_SAMPLE = { vi: 'Xin chào, rất vui được gặp bạn.', en: 'Hello, it is nice to meet you.', zh: '你好，很高兴认识你。', yue: '你好，好高興認識你。' };
  function voiceSample(lang, name) {
    if (!name) return VOICE_SAMPLE[lang] || VOICE_SAMPLE.vi;
    return lang === 'en' ? 'Hello, I am ' + name + '!' : lang === 'zh' ? '你好，我是' + name + '！' : lang === 'yue' ? '你好，我係' + name + '！' : 'Xin chào, ta là ' + name + '!';
  }
  // gợi ý khi chọn ngôn ngữ cần viết lời thoại đúng khẩu ngữ riêng (tiếng Quảng Đông khác văn phổ thông)
  var LANG_NOTE = 'giọng máy đọc + giọng AI + lồng tiếng theo ngôn ngữ này';
  var LANG_HINT = { yue: 'Lời thoại phải viết bằng tiếng Quảng Đông: chữ phồn thể + khẩu ngữ (喺 / 咩 / 我哋), không dùng văn phổ thông.' };
  function clockOf(iso) {   // "14:05" (hôm nay) hoặc "14:05 21/10"
    var d = new Date(iso), n = new Date();
    if (isNaN(d.getTime())) return '';
    var t = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return d.toDateString() === n.toDateString() ? t : t + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }
  // retryAt của server (ISO, hoặc ms epoch) → ms epoch; không hiểu thì 0 · "14:05:09" (giây — giới hạn mỗi phút tính theo giây)
  function atMs(v) { var n = typeof v === 'number' ? v : Date.parse(v); return n > 0 ? n : 0; }
  function clockSec(ms) { return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  // WAV (ArrayBuffer) → data: URI nhúng vào phim xuất ra
  function bufDataURI(buf) {
    var u = new Uint8Array(buf), s = '', i;
    for (i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return 'data:audio/wav;base64,' + btoa(s);
  }
  var SRC_CHIP = { design: ['thiết kế', 'chip ok'], library: ['thư viện Google', 'chip info'], prebuilt: ['có sẵn', 'chip'], chosen: ['đã chọn', 'chip warn'] };
  var CAST_MAX = 48;   // server chỉ chọn giọng AI cho 48 diễn viên đầu của một tác phẩm (api/voice/cast → missing)
  var MINUTE_MS = 120000, MINUTE_WAITS = 10;   // CNS-098: 429 có giờ thử lại trong ≤ 2 phút = Google giới hạn MỖI PHÚT → chờ rồi lồng tiếp (tối đa 10 lần chờ mỗi lượt bấm)
  var CHILD_AGE = { 'tre-em': 1, 'thieu-nien': 1 };   // Google chặn thiết kế giọng trẻ em (chính sách an toàn) — dùng giọng trẻ trung có sẵn

  var AiVoice = {
    cfg: null, cfgP: null, clips: new Map(), casts: {}, libs: {}, flight: {}, blockedUntil: 0, blockedCap: false, told: {},
    has: {},       // tác phẩm|ngôn ngữ|giọng vùng → đã thấy ÍT NHẤT 1 clip giọng AI (một clip về / lồng tiếng xong / xuất phim có clip) → câu thiếu clip không được rơi vào robot (needGood)
    missing: {},   // tác phẩm|ngôn ngữ|giọng vùng → [id diễn viên] server báo chưa có giọng (dàn vượt 48 người)
    onCast: null,  // trang Tạo tác đăng ký để vẽ lại dòng báo khi có kết quả cast
    on: function () { return Store.mode === 'server' && !!GC.audio && !!GC.voices; },
    // trạng thái giọng AI (api/voice); lỗi → null = coi như chưa có
    load: function (force) {
      var self = this;
      if (!this.on()) return Promise.resolve(null);
      if (force || !this.cfgP) this.cfgP = Store.api('GET', 'api/voice').then(function (c) {
        self.cfg = c;
        if (!c.blocked || !c.blocked.length) { self.blockedUntil = 0; self.blockedCap = false; }   // server báo hết hạn chế → bỏ nhớ "đã hết lượt"
        return c;
      }, function () { self.cfgP = null; return null; });
      return this.cfgP;
    },
    set: function (c) { this.cfg = c; this.cfgP = Promise.resolve(c); this.blockedUntil = 0; this.blockedCap = false; this.told = {}; },   // sau khi dán key / bật / tắt / đổi trần ngày / gỡ giọng hỏng
    ready: function () { var c = this.cfg; return !!(c && c.hasKey && c.enabled !== false && !c.off); },
    // một thông báo mỗi loại trong 60 giây (hết lượt không được bắn toast từng câu)
    tell: function (kind, msg) { var t = this.told[kind] || 0; if (Date.now() - t < 60000) return; this.told[kind] = Date.now(); toast(msg); },
    // câu báo hết lượt (429): cap = chạm TRẦN câu / ngày của máy (đặt ở Cài đặt AI, hết lúc 00:00) — khác với hết lượt của Google (gói miễn phí / model).
    // Google còn chia hai kiểu: giới hạn MỖI PHÚT (retryAt cách ≤ 2 phút — chờ chút là đọc tiếp) và hết lượt HÔM NAY (retryAt xa). e.minute (nếu có) thắng việc tự tính theo giờ
    isMinute: function (e) {
      if (!e || e.cap) return false;
      if (e.minute !== undefined) return e.minute === true;
      var at = atMs(e.retryAt); return at > 0 && at - Date.now() <= MINUTE_MS;
    },
    quotaText: function (e) {
      var at = atMs(e && e.retryAt), c = this.cfg;
      if (e && e.cap) return 'Đã chạm trần ' + (c && c.dailyCap > 0 ? c.dailyCap + ' câu' : 'số câu') + ' hôm nay (Cài đặt AI)' + (at ? ' — đọc tiếp lúc ' + clockOf(at) : '');
      if (this.isMinute(e)) return 'Google giới hạn mỗi phút' + (at ? ' — thử lại lúc ' + clockSec(at) : '');
      return at ? 'Hết lượt hôm nay — thử lại lúc ' + clockOf(at) : 'Hết lượt giọng AI';
    },
    explain: function (e) {
      if (e.status === 429) this.tell('quota', this.quotaText(e) + '. Các câu còn lại dùng giọng máy đọc hoặc blip.');
      else if (e.status === 409) this.tell('off', e.message + ' — dùng giọng máy đọc.');
      else this.tell('err', 'Giọng AI lỗi: ' + e.message + ' — dùng giọng máy đọc.');
    },
    block: function (e) { this.blockedUntil = atMs(e.retryAt) || Date.now() + 5 * 60000; this.blockedCap = !!e.cap; },
    workKey: function (W, L) { return [W.id, L.lang, L.accent].join('|'); },
    markHas: function (W, L) { if (W && L) this.has[this.workKey(W, L)] = true; },
    hasClips: function (W, L) { return !!(W && L && this.has[this.workKey(W, L)]); },
    // vai giọng của nhân vật (đã chọn, hoặc đoán từ vai trò / tính cách / tên) · giọng vùng riêng nếu hợp ngôn ngữ phim
    roleOf: function (a) { var r = a && a.voice && a.voice.role; return r && GC.voices.ROLES[r] ? r : GC.voices.guessRole(a); },
    accentOf: function (a, lang, dflt) { var x = a && a.voice && a.voice.accent; return x && GC.voices.accent(lang, x) === x ? x : dflt; },
    actorsOf: function (W) {
      var seen = {}, out = [];
      ((W && W.shots) || []).forEach(function (s) { GC.film.actors(s).forEach(function (a) { if (!seen[a.id]) { seen[a.id] = 1; out.push(a); } }); });
      return out;
    },
    actorBody: function (a, lang) {
      var r = this.roleOf(a), o = { id: a.id, role: r, gender: GC.voices.ROLES[r].gender }, ai = a.voice && a.voice.ai, ac = this.accentOf(a, lang, '');
      if (ai) o.voice = ai;
      if (ac) o.accent = ac;   // (ngoài hợp đồng: server không biết thì bỏ qua)
      return o;
    },
    // chọn giọng AI cho CẢ dàn diễn viên của tác phẩm một lần (mỗi người một giọng khác nhau) — không tốn lượt; nhớ theo tác phẩm + ngôn ngữ + danh sách vai.
    // Gửi kèm `work`: server CHỐT giọng của dàn vào tác phẩm (người cũ giữ giọng, người mới tránh giọng đã chốt) → Studio, MCP và phim xuất cùng một giọng
    castOf: function (W, lang, accent) {
      var self = this, list = this.actorsOf(W);
      var key = [W.id, lang, accent].concat(list.map(function (a) { return a.id + ':' + self.roleOf(a) + ':' + ((a.voice && a.voice.ai) || '') + ':' + ((a.voice && a.voice.accent) || ''); })).join('|');
      if (this.casts[key]) return this.casts[key];
      var p = Store.api('POST', 'api/voice/cast', { work: W.id, lang: lang, accent: accent, actors: list.map(function (a) { return self.actorBody(a, lang); }) }).then(function (r) {
        self.missing[[W.id, lang, accent].join('|')] = (r && r.missing) || [];   // người thừa (dàn > 48) chưa có giọng AI — dòng báo ở Sân khấu final
        if (self.onCast) self.onCast();
        return (r && r.cast) || {};
      });
      this.casts[key] = p;
      p.catch(function () { if (self.casts[key] === p) delete self.casts[key]; });
      return p;
    },
    missingFor: function (W, L) { return (W && this.missing[[W.id, L.lang, L.accent].join('|')]) || []; },
    // giọng vùng THẬT (Q14): Google chỉ cho qua "Thiết kế giọng" từng vai (thư viện tiếng Việt không phân Bắc / Trung / Nam).
    // → danh sách { role, accent, key, done } của dàn diễn viên tác phẩm: mỗi (vai, giọng vùng) một dòng, vai trẻ em (Google chặn thiết kế) không tính
    regionOf: function (W, L) {
      var seen = {}, out = [], d = (this.cfg && this.cfg.designs) || {}, self = this;
      this.actorsOf(W).forEach(function (a) {
        var role = self.roleOf(a);
        if (!GC.voices.canDesign(role)) return;
        var ac = self.accentOf(a, L.lang, L.accent), k = role + '|' + L.lang + '|' + ac;
        if (seen[k]) return;
        seen[k] = 1; out.push({ role: role, accent: ac, key: k, done: !!d[k] });
      });
      return out;
    },
    // tham số một lời gọi api/voice/line; khoá clip = voice|role|lang|accent|state|bubble|chữ
    paramsOf: function (L, a, line, cast) {
      var c = cast && cast[a.id];
      if (!c || !c.voice) return null;
      return { text: String(line.say).trim(), voice: c.voice, role: this.roleOf(a), lang: L.lang, accent: this.accentOf(a, L.lang, L.accent), state: line.state || 'normal', bubble: line.bubble || 'say' };
    },
    keyOf: function (p) { return [p.voice, p.role, p.lang, p.accent, p.state, p.bubble, p.text].join('|'); },
    download: function (url) {
      if (!/^\/?api\/voice\/clip\/[A-Za-z0-9_-]+\.wav$/.test(String(url))) return Promise.reject(new Error('Địa chỉ clip lạ — bỏ qua'));   // token chỉ gửi về chính server này
      return fetch(url, { headers: Store.headers() }).then(function (r) { if (!r.ok) throw new Error('Không tải được clip (' + r.status + ')'); return r.arrayBuffer(); });
    },
    keep: function (key, buf) { this.clips.set(key, buf); while (this.clips.size > 160) this.clips.delete(this.clips.keys().next().value); },
    // lấy clip của một câu → { buf, cached, seconds }. dry = chỉ lấy clip ĐÃ đọc (không gọi Google, không tốn lượt; chưa có → lỗi 404).
    // Phát phim hết lượt thì thôi hỏi server tới giờ thử lại (blockedUntil); bấm nút (force) luôn hỏi — server mới là người quyết
    get: function (p, dry, force) {
      var self = this, key = this.keyOf(p), hit = this.clips.get(key);
      if (hit) { this.clips.delete(key); this.clips.set(key, hit); return Promise.resolve({ buf: hit, cached: true }); }
      if (!dry && !force && Date.now() < this.blockedUntil) return Promise.reject(Object.assign(new Error('Hết lượt giọng AI'), { status: 429, retryAt: new Date(this.blockedUntil).toISOString(), cap: this.blockedCap }));
      var fk = (dry ? 'd|' : 'w|') + key, f = this.flight[fk];
      if (f) return f;
      f = Store.api('POST', 'api/voice/line', dry ? Object.assign({}, p, { dry: true }) : p).then(function (r) {
        return self.download(r.url).then(function (buf) { self.keep(key, buf); return { buf: buf, cached: !!r.cached, seconds: r.seconds }; });
      }, function (e) { if (e.status === 429) self.block(e); throw e; });
      this.flight[fk] = f;
      var done = function () { delete self.flight[fk]; };
      f.then(done, done);
      return f;
    },
    // giọng cho một câu của phim (bộ phát hỏi qua opts.voiceClip) → Promise<ArrayBuffer|null>. spend=false: chỉ clip đã đọc; true: chưa có thì đọc ngay (tốn lượt)
    clipForLine: function (W, L, a, line, spend) {
      var self = this;
      if (!W || !a || !String(line.say || '').trim()) return null;
      return this.load().then(function () {
        if (!self.ready()) { if (spend) self.tell('nokey', 'Giọng AI chưa sẵn sàng (chưa có key hoặc đang tắt) — dùng giọng máy đọc. Dán key ở Cài đặt AI › Giọng AI.'); return null; }
        return self.castOf(W, L.lang, L.accent).then(function (cast) {
          var p = self.paramsOf(L, a, line, cast);
          return p ? self.get(p, !spend).then(function (r) { self.markHas(W, L); return r.buf; }) : null;
        });
      }).catch(function (e) { if (spend) self.explain(e); return null; });
    },
    // giọng AI cho MỘT nhân vật (nghe thử ở Hồ sơ nhân vật): chọn tay thì dùng, không thì hỏi api/voice/cast với đúng một diễn viên
    castActor: function (a, role, lang, accent, chosen) {
      if (chosen) return Promise.resolve(chosen);
      var o = { id: a.id || 'x', role: role, gender: GC.voices.ROLES[role].gender };
      return Store.api('POST', 'api/voice/cast', { lang: lang, accent: accent, actors: [o] }).then(function (r) { var c = r && r.cast && r.cast[o.id]; if (!c || !c.voice) throw new Error('Server không chọn được giọng cho vai này'); return c.voice; });
    },
    library: function (lang) {
      if (!this.libs[lang]) {
        var self = this;
        this.libs[lang] = Store.api('GET', 'api/voice/library?lang=' + encodeURIComponent(lang)).then(function (r) { return (r && r.voices) || []; });
        this.libs[lang].catch(function () { delete self.libs[lang]; });
      }
      return this.libs[lang];
    },
    // đọc một câu mẫu bằng giọng AI rồi phát (tốn tối đa 1 lượt): buf → phát qua GC.audio với cùng giọng trình duyệt dự phòng
    speak: function (text, buf, voice) { GC.audio.unlock(); return GC.audio.say(text, voice, { clip: buf }); },
    // LỒNG TIẾNG AI: đọc lần lượt mọi câu của mọi phân cảnh sẵn sàng (không dry — tốn lượt với câu chưa có; câu đã có trả ngay). ui: { cancelled(), progress(st) }
    // → Promise<st>: { total, done, fresh, cached, failed, stop (429 | 409 | null), retryAt, cap, minute, waits, waitAt, error }.
    // Gặp 409 là dừng hẳn (chưa có key). Gặp 429: trần câu / ngày (cap) hoặc Google hết lượt hôm nay (retryAt xa) → dừng hẳn; còn giới hạn MỖI PHÚT (retryAt cách ≤ 2 phút,
    // CNS-098) → st.waitAt = giờ thử lại, chờ rồi đọc tiếp CHÍNH câu đó (tối đa 10 lần chờ mỗi lượt; bấm Dừng thì huỷ cả lúc đang chờ)
    dub: function (W, L, ui) {
      var self = this;
      return this.castOf(W, L.lang, L.accent).then(function (cast) {
        var jobs = [], seen = {};
        W.shots.filter(function (s) { return !GC.film.issues(s).length; }).forEach(function (s) {
          var by = {}, plan = GC.film.direct(s);
          GC.film.actors(s).forEach(function (a) { by[a.id] = a; });
          ((plan && plan.beats) || []).forEach(function (b) {
            if (b.type !== 'line' || !String(b.say || '').trim() || !by[b.actor]) return;
            var p = self.paramsOf(L, by[b.actor], b, cast), k = p && self.keyOf(p);
            if (!p || seen[k]) return;
            seen[k] = 1; jobs.push(p);
          });
        });
        var st = { total: jobs.length, done: 0, fresh: 0, cached: 0, failed: 0, stop: null, retryAt: null, error: '', minute: false, waits: 0, waitAt: 0 }, i = 0;
        ui.progress(st);
        return (function next() {
          if (ui.cancelled() || i >= jobs.length) return Promise.resolve(st);
          return self.get(jobs[i++], false, true).then(function (r) { st.done++; if (r.cached) st.cached++; else st.fresh++; self.markHas(W, L); }, function (e) {
            var at = atMs(e.retryAt);
            if (e.status === 429 && self.isMinute(e) && st.waits < MINUTE_WAITS) {   // giới hạn mỗi phút: chờ tới giờ Google cho thử lại rồi đọc lại đúng câu này
              st.waits++; st.waitAt = at; i--; ui.progress(st);
              return sleepUntil(Math.max(at + 300, Date.now() + 1500), ui).then(function () { st.waitAt = 0; });   // giờ thử lại đã qua (đồng hồ máy chạy nhanh hơn server) vẫn chờ tối thiểu 1,5 s
            }
            if (e.status === 429 || e.status === 409) { st.stop = e.status; st.retryAt = e.retryAt || null; st.cap = !!e.cap; st.minute = self.isMinute(e); st.error = e.message; i = jobs.length; return; }
            st.failed++; st.error = e.message;
          }).then(function () { ui.progress(st); return next(); });
        })();
      });
    }
  };
  // chờ tới `at` (ms epoch); bấm Dừng / rời trang thì thôi ngay (hỏi mỗi 250 ms)
  function sleepUntil(at, ui) {
    return new Promise(function (ok) { (function tick() { var d = at - Date.now(); if (d <= 0 || ui.cancelled()) ok(); else setTimeout(tick, Math.min(250, d)); })(); });
  }
  // Phim xuất ra mang các clip AI ĐÃ có (không đọc mới, không tốn lượt): { khoá câu (GC.film.clipKey): data: URI } + số đếm
  function filmVoices(W, L) {
    var out = { voices: {}, have: 0, total: 0 };
    if (!AiVoice.on()) return Promise.resolve(out);
    return AiVoice.load().then(function (cfg) {
      if (!cfg || !(cfg.hasKey || cfg.cached)) return out;   // chưa từng có giọng AI: khỏi hỏi từng câu
      return AiVoice.castOf(W, L.lang, L.accent).then(function (cast) {
        var jobs = [], seen = {};
        W.shots.filter(function (s) { return !GC.film.issues(s).length; }).forEach(function (s) {
          var by = {}, plan = GC.film.direct(s);
          GC.film.actors(s).forEach(function (a) { by[a.id] = a; });
          ((plan && plan.beats) || []).forEach(function (b) {
            if (b.type !== 'line' || !String(b.say || '').trim() || !by[b.actor]) return;
            var k = GC.film.clipKey(b);
            if (seen[k]) return;
            seen[k] = 1; out.total++;
            var p = AiVoice.paramsOf(L, by[b.actor], b, cast);
            if (p) jobs.push({ k: k, p: p });
          });
        });
        var i = 0;
        function worker() {   // 3 luồng song song
          if (i >= jobs.length) return Promise.resolve();
          var j = jobs[i++];
          return AiVoice.get(j.p, true).then(function (r) { out.voices[j.k] = bufDataURI(r.buf); out.have++; }, function () { /* chưa đọc câu này: bỏ qua */ }).then(worker);
        }
        return Promise.all([worker(), worker(), worker()]).then(function () { if (out.have) AiVoice.markHas(W, L); return out; });
      });
    }).catch(function () { return out; });
  }

  // giọng của nhân vật trong phim: vai (tuổi × giới × văn / võ), giọng vùng, giọng AI, cao độ + tốc độ — nghe thử ngay; asset của tôi thì lưu được.
  // Nhân vật chưa chọn vai thì "Tự đoán" (GC.voices.guessRole). Cao độ / tốc độ chỉ ghi khi người dùng ĐÃ kéo — không ghi đè mặc định của vai mãi mãi.
  function voiceRow(a, mine) {
    if (!GC.audio || !GC.voices) return null;
    var V = GC.voices, saved = a.voice || {}, vp = VoicePref.get();
    var guess = V.guessRole(a), touched = {}, fixed = { pitch: typeof saved.pitch === 'number', rate: typeof saved.rate === 'number' }, clearPR = false;
    // lưu xong: bản ghi đã đăng ký là chuẩn mới — các ô đang hiện chính là giá trị đã lưu (không còn "đã đụng"), lần Lưu sau cộng dồn trên bản mới
    function saved2(na) { a = na || a; saved = a.voice || {}; touched = {}; clearPR = false; fixed.pitch = typeof saved.pitch === 'number'; fixed.rate = typeof saved.rate === 'number'; }
    // ngôn ngữ nghe thử: theo giọng vùng đã lưu (nếu có), không thì theo máy
    var lang0 = vp.lang;
    if (saved.accent) V.langList().forEach(function (l) { if (l.accents.some(function (x) { return x.id === saved.accent; })) lang0 = l.id; });
    var roleSel = h('select', { 'aria-label': 'Vai giọng', title: 'Vai quyết định giọng: tuổi, giới, văn / võ, tính cách. Chưa chọn thì tự đoán từ vai trò, tính cách và tên', onchange: function () { touched.role = true; syncDefaults(); } });
    roleSel.appendChild(h('option', { value: '', text: 'Tự đoán: ' + V.ROLES[guess].label }));
    V.AGES.forEach(function (ag) {
      var g = h('optgroup', { label: ag[1] });
      V.roleList().filter(function (r) { return r.age === ag[0]; }).forEach(function (r) { g.appendChild(h('option', { value: r.id, text: r.label + ' · ' + (r.gender === 'f' ? 'nữ' : 'nam') + ' · ' + r.kindLabel })); });
      roleSel.appendChild(g);
    });
    roleSel.value = saved.role && V.ROLES[saved.role] ? saved.role : '';
    var langSel = h('select', { 'aria-label': 'Ngôn ngữ nghe thử', title: 'Ngôn ngữ để nghe thử (phim chọn ngôn ngữ riêng ở Sân khấu final)', onchange: function () { VoicePref.set(langSel.value, V.accent(langSel.value, '')); fillAccent(); fillAi(); } });
    V.langList().forEach(function (l) { langSel.appendChild(h('option', { value: l.id, text: l.label })); });
    langSel.value = lang0;
    var accSel = h('select', { 'aria-label': 'Giọng vùng', title: 'Giọng vùng của riêng nhân vật. "Theo phim" = theo giọng vùng của tác phẩm', onchange: function () { touched.accent = true; } });
    function fillAccent() {
      clear(accSel);
      accSel.appendChild(h('option', { value: '', text: 'Theo phim' }));
      V.langList().filter(function (l) { return l.id === langSel.value; })[0].accents.forEach(function (x) { accSel.appendChild(h('option', { value: x.id, text: x.label })); });
      var keep = touched.accent ? '' : saved.accent;   // chưa đụng tới: hiện giọng vùng đã lưu nếu hợp ngôn ngữ đang xem
      accSel.value = keep && V.accent(langSel.value, keep) === keep ? keep : '';
    }
    fillAccent();
    var aiSel = h('select', { 'aria-label': 'Giọng AI', title: 'Giọng AI Google của nhân vật. "Tự động theo vai" = server chọn giọng hợp vai, mỗi nhân vật một giọng khác nhau', onchange: function () { touched.ai = true; } });
    var aiRow = [h('label', { text: 'Giọng AI' }), aiSel];
    aiRow.forEach(function (e) { e.hidden = true; });
    function fillAi() {
      if (!AiVoice.on() || !AiVoice.ready()) { aiRow.forEach(function (e) { e.hidden = true; }); return; }
      var L = langSel.value, want = touched.ai ? aiSel.value : saved.ai || '';
      AiVoice.library(L).then(function (list) {
        if (L !== langSel.value) return;
        clear(aiSel);
        aiSel.appendChild(h('option', { value: '', text: 'Tự động theo vai' }));
        var g = V.ROLES[roleSel.value || guess].gender;
        [['design', 'Thiết kế của bạn'], ['library', 'Thư viện Google'], ['prebuilt', 'Có sẵn']].forEach(function (src) {
          var vs = list.filter(function (v) { return v.source === src[0]; }).sort(function (x, y) { return (y.gender === g) - (x.gender === g); });
          if (!vs.length) return;
          var og = h('optgroup', { label: src[1] });
          vs.forEach(function (v) { og.appendChild(h('option', { value: v.id, text: [v.name || v.id, v.gender === 'f' ? 'nữ' : 'nam', v.age ? v.age + ' tuổi' : '', v.description].filter(Boolean).join(' · ').slice(0, 80) })); });
          aiSel.appendChild(og);
        });
        if (want && !list.some(function (v) { return v.id === want; })) aiSel.appendChild(h('option', { value: want, text: want + ' (đã chọn)' }));
        aiSel.value = want;
        aiRow.forEach(function (e) { e.hidden = false; });
      }).catch(function () { aiRow.forEach(function (e) { e.hidden = true; }); });
    }
    AiVoice.load().then(fillAi);
    // cao độ / tốc độ: mặc định theo vai (+ lệch nhẹ theo id nhân vật, như bộ phát)
    function roleDefault() { return GC.audio.voiceOf({ id: a.id, key: a.key, name: a.name, voice: { role: roleSel.value || guess } }, { lang: langSel.value, accent: accSel.value || undefined }); }
    var d0 = saved.pitch !== undefined || saved.rate !== undefined ? GC.audio.voiceOf(a, { lang: lang0 }) : roleDefault();
    var pitch = h('input', { type: 'range', min: 0.5, max: 2, step: 0.05, value: d0.pitch, 'aria-label': 'Cao độ giọng', title: 'Cao độ: trầm ← → cao', oninput: function () { touched.pitch = true; clearPR = false; } });
    var rate = h('input', { type: 'range', min: 0.6, max: 1.6, step: 0.05, value: d0.rate, 'aria-label': 'Tốc độ nói', title: 'Tốc độ: chậm ← → nhanh', oninput: function () { touched.rate = true; clearPR = false; } });
    function syncDefaults() {   // đổi vai → thanh trượt nhảy về mặc định của vai, trừ khi người dùng đã chọn / kéo
      var d = roleDefault();
      if (!fixed.pitch && !touched.pitch) pitch.value = d.pitch;
      if (!fixed.rate && !touched.rate) rate.value = d.rate;
      if (AiVoice.ready()) fillAi();
    }
    var resetB = h('button', { class: 'btn sm', title: 'Bỏ cao độ / tốc độ đã lưu, về mặc định của vai (bấm Lưu giọng để áp dụng)', onclick: function () {
      fixed.pitch = fixed.rate = false; touched.pitch = touched.rate = false; clearPR = true;
      var d = roleDefault(); pitch.value = d.pitch; rate.value = d.rate;
    } }, '↺ theo vai');
    // giọng trình duyệt theo vai / ngôn ngữ đang chọn (không tốn gì)
    function localVoice() {
      var v = GC.audio.voiceOf({ id: a.id, key: a.key, name: a.name, voice: { role: roleSel.value || guess, accent: accSel.value || undefined, pitch: +pitch.value, rate: +rate.value } }, { lang: langSel.value, accent: accSel.value || V.accent(langSel.value, '') });
      return v;
    }
    var line = function () { return voiceSample(langSel.value, a.name); };
    var aiB = h('button', { class: 'btn sm', title: 'Đọc một câu mẫu bằng giọng AI Google — tốn 1 lượt (câu đã đọc rồi thì không tốn lại)', onclick: function () {
      var role = roleSel.value || guess, lang = langSel.value, accent = accSel.value || V.accent(lang, ''), text = line(), lv = localVoice();
      aiB.disabled = true; aiB.textContent = 'Đang đọc…';
      AiVoice.castActor(a, role, lang, accent, aiSel.value).then(function (voice) {
        return AiVoice.get({ text: text, voice: voice, role: role, lang: lang, accent: accent, state: 'normal', bubble: 'say' }, false, true).then(function (r) { AiVoice.speak(text, r.buf, lv); });
      }).catch(function (e) { toast(e.status === 429 ? AiVoice.quotaText(e) + '.' : e.message); })
        .then(function () { aiB.disabled = false; aiB.textContent = '▶ Giọng AI'; });
    } }, '▶ Giọng AI');
    aiB.hidden = true;
    AiVoice.load().then(function () { aiB.hidden = !AiVoice.ready(); });
    return h('div', { class: 'voicebox' }, h('b', { text: 'Giọng' }),
      h('label', { text: 'Vai giọng' }), roleSel,
      h('label', { text: 'Ngôn ngữ' }), h('div', { class: 'pair' }, langSel, accSel),
      aiRow,
      h('label', { text: 'Cao độ' }), h('div', { class: 'sl' }, h('span', { class: 'note', text: 'trầm' }), pitch, h('span', { class: 'note', text: 'cao' })),
      h('label', { text: 'Tốc độ' }), h('div', { class: 'sl' }, h('span', { class: 'note', text: 'chậm' }), rate, h('span', { class: 'note', text: 'nhanh' }), resetB),
      h('div', { class: 'vb-acts' },
        h('button', { class: 'btn sm', onclick: function () { GC.audio.unlock(); GC.audio.say(line(), localVoice()); } }, '▶ Nghe thử'),
        aiB,
        mine ? h('button', { class: 'btn sm primary', title: 'Lưu giọng vào công thức nhân vật (dùng trong mọi phim). Cao độ / tốc độ chỉ ghi khi bạn đã kéo', onclick: function () {
          var d = clone(a), v = Object.assign({}, d.voice || {});
          if (touched.role) { if (roleSel.value) v.role = roleSel.value; else delete v.role; }
          if (touched.accent) { if (accSel.value) v.accent = accSel.value; else delete v.accent; }
          if (touched.ai) { if (aiSel.value) v.ai = aiSel.value; else delete v.ai; }
          if (clearPR) { delete v.pitch; delete v.rate; }
          if (touched.pitch) v.pitch = +pitch.value;
          if (touched.rate) v.rate = +rate.value;
          if (Object.keys(v).length) d.voice = v; else delete d.voice;
          resave(d, 'Đổi giọng').then(function () { saved2(GC.ASSETS[a.key]); toast('Đã lưu giọng của ' + a.name + '.'); }).catch(function (e) { toast(e.message); });
        } }, 'Lưu giọng') : null));
  }
  // ngôn ngữ + giọng vùng của tác phẩm (lưu trong tác phẩm: lang vi | en | zh, accent theo ngôn ngữ; thiếu thì tiếng Việt, giọng đầu tiên)
  function workLang(W) { var l = GC.voices.lang(W && W.lang); return { lang: l, accent: GC.voices.accent(l, W && W.accent) }; }
  // thẻ <html lang> của phim xuất theo ngôn ngữ phim (trình đọc màn hình + phông chữ + gợi ý dịch của trình duyệt): vi · en · zh-CN (phổ thông) · zh-TW (Đài Loan) · zh-HK (Quảng Đông)
  function htmlLang(L) { return L.lang === 'en' ? 'en' : L.lang === 'zh' ? (L.accent === 'tw' ? 'zh-TW' : 'zh-CN') : L.lang === 'yue' ? 'zh-HK' : 'vi'; }
  // gói âm (không phải khung) mà tác phẩm cần: thuộc dự án của tác phẩm, hoặc có âm được gọi tên trong lời thoại / gói động tác đi kèm
  function filmSoundPacks(W, motionPacks) {
    var S = GC.sounds; if (!S) return [];
    var names = {}, want = {};
    W.shots.forEach(function (s) { ((s.event && s.event.steps) || []).forEach(function (st) { (st.sfx || []).forEach(function (n) { names[n] = 1; }); }); });
    (motionPacks || []).forEach(function (m) { Object.keys(m.clips || {}).forEach(function (k) { (m.clips[k].events || []).forEach(function (q) { [].concat(q[1].sfx || []).forEach(function (n) { names[n] = 1; }); }); }); });
    Object.keys(names).forEach(function (n) { var d = S.get(n); if (d && d.pack !== S.FRAME) want[d.pack] = 1; });
    return S.packs().filter(function (p) { return !p.frame && (want[p.id] || (W.project && p.project === W.project)); }).map(function (p) { return S.pack(p.id); });
  }
  // pre (tuỳ chọn) = kết quả filmVoices đã hỏi (hộp "thiếu giọng AI" ở Sân khấu final) — khỏi hỏi lại
  function exportFilm(W, pre) {
    var L = workLang(W), chars = [], scenes = [];
    W.shots.forEach(function (s) { chars = chars.concat(GC.film.actors(s)); var sc = GC.film.scene(s); if (sc) scenes.push(sc); });
    var data = bundleOf(chars, [], scenes);
    // gói động tác có hành động phim dùng tới (đòn của bộ chủ đề) — đòn của khung đã nằm trong mã bộ phát
    var used = {}; W.shots.forEach(function (s) { ((s.event && s.event.steps) || []).forEach(function (st) { if (st.action) used[st.action] = 1; }); });
    data.motionPacks = GC.choreo ? GC.choreo.packs().filter(function (p) { return Object.keys(p.actions).some(function (k) { return used[k]; }); })
      .map(function (p) { var o = clone(p); ['pack', 'key', 'version', 'savedAt', 'note'].forEach(function (k) { delete o[k]; }); return o; }) : [];
    // gói âm phim dùng (v0.18): gói của dự án tác phẩm + gói gọi tên trong step.sfx / sự kiện của gói động tác đi theo — mở file:// vẫn nghe đúng; bộ chuẩn gen.am nằm sẵn trong engine/sounds.js
    data.soundPacks = filmSoundPacks(W, data.motionPacks); data.project = W.project || '';
    var srcs = Array.prototype.map.call(document.scripts, function (x) { return x.getAttribute('src') || ''; }).filter(function (x) { return /^(engine|kinds)\//.test(x); });
    if (srcs.indexOf('engine/player.js') < 0) { toast('Thiếu engine/player.js'); return; }
    toast('Đang đóng gói phim…');
    // kèm các clip giọng AI ĐÃ có của từng câu (hỏi "dry": không đọc mới, không tốn lượt) — phim mở bằng file:// vẫn có giọng AI, không gọi mạng
    Promise.all([Promise.all(srcs.map(function (f) { return fetch(f).then(function (r) { if (!r.ok) throw new Error('Không tải được ' + f); return r.text(); }); })), pre ? Promise.resolve(pre) : filmVoices(W, L)])
      .then(function (res) {
        var texts = res[0], vo = res[1];
        var pick = function (o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; };
        // motionPacks phải giữ lại ở đây: dựng lại `data` mà bỏ nó thì bộ phát không nạp gói nào và phim mất các chương dùng đòn của gói
        data = { parts: data.parts, motionPacks: data.motionPacks, soundPacks: data.soundPacks, project: data.project, characters: data.characters.map(function (a) {
            // giọng chốt sẵn lúc xuất (nhân vật chưa lưu giọng thì lấy giọng Studio đang dùng — không xuất persona; vai giọng luôn chốt, vì phim không có persona để đoán lại)
            var o = pick(a, ['id', 'pack', 'name', 'version', 'look', 'expressions', 'kind', 'voice', 'role']);
            if (GC.audio) { var vv = GC.audio.voiceOf(a, L); o.voice = Object.assign({}, o.voice || vv); if (!o.voice.role && vv.role) o.voice.role = vv.role; }
            return o;
          }),
          items: data.items.map(function (x) { return pick(x, ['id', 'name', 'type', 'rarity', 'equip']); }),
          scenes: data.scenes.map(function (x) { return pick(x, ['id', 'name', 'layers', 'deco', 'palette', 'time', 'weather', 'spots']); }),
          lang: L.lang, accent: L.accent, voices: vo.voices, voiceTotal: vo.total };   // ngôn ngữ phim + clip giọng AI theo khoá GC.film.clipKey + tổng số câu (nhãn "Giọng AI 19/31")
        var film = { title: W.title, logline: W.logline || '', dialog: StagePref.get().dialog, shots: W.shots.map(function (s) { return { id: s.id, title: s.title, description: s.description || '', scene: s.scene, cast: s.cast, event: s.event }; }) };
        var safe = function (t) { return t.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'); };
        var html = '<!doctype html>\n<!--\n  Phim "' + xml(W.title) + '" — làm bằng gen-chibi.\n  Bộ phát (engine/*, kinds/*) © 2026 Gen Labs — All rights reserved. Giấy phép: CHỈ ĐỂ XEM phim này.\n  Không trích xuất, sao chép, sửa đổi hay tái sử dụng mã bộ phát cho mục đích khác.\n  Riêng phông chữ lời thoại Be Vietnam Pro (engine/fonts.js) © 2021 The Be Vietnam Pro Project Authors — SIL Open Font License 1.1 (toàn văn nằm trong chính tệp này).\n-->\n<html lang="' + htmlLang(L) + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + xml(W.title) + ' — gen-chibi</title>\n' +
          '<meta name="generator" content="gen-chibi ' + xml(String((Store.info || {}).version || '')) + ' · Gen Labs">\n<style>' + FILM_CSS + '</style>\n</head>\n<body>\n' +
          '<main class="film"><header><div><h1>' + xml(W.title) + '</h1><p>' + xml(W.logline || '') + '</p></div><span class="badge">' + W.shots.length + ' phân cảnh</span></header>\n' +
          '<div class="screen"><div id="stage"></div><button id="big" class="big" aria-label="Xem phim">▶</button></div>\n' +
          '<div class="bar"><button id="play">▶ Xem</button><button id="stop">■ Dừng</button><button id="full">⛶ Toàn màn hình</button><button id="mute" aria-label="Bật / tắt tiếng">🔊</button>' +
          '<select id="voice" aria-label="Giọng nhân vật"><option value="auto">Giọng: tự động</option><option value="tts">Giọng: máy đọc</option><option value="blip">Giọng: blip</option><option value="off">Giọng: tắt</option></select><span id="ainote" class="ainote" hidden></span>' +
          '<select id="dialog" aria-label="Kiểu lời thoại">' + DIALOG_MODES.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select><span id="prog"></span></div>\n' +
          '<ol id="chapters"></ol>\n<footer>Làm bằng gen-chibi · Bộ phát © 2026 Gen Labs — chỉ để xem phim này</footer></main>\n' +
          texts.map(function (t, i) { return '<script>/* ' + srcs[i] + ' */\n' + safe(t) + '\n</script>'; }).join('\n') + '\n' +
          '<script>\nvar DATA = ' + jsonForScript(data) + ';\nvar FILM = ' + jsonForScript(film) + ';\n' + FILM_BOOT + '\n</script>\n</body>\n</html>\n';
        var bytes = new Blob([html]).size, sz = bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
        download(slugify(W.title) + '.html', html, 'text/html');
        toast('Đã xuất phim "' + W.title + '" (' + sz + ') · ' + vo.have + '/' + vo.total + ' câu có giọng AI' + (vo.total && vo.have < vo.total ? ' (câu còn lại dùng giọng máy đọc hoặc blip — bấm Lồng tiếng AI trước khi xuất để có đủ)' : '') + ' — mở bằng trình duyệt bất kỳ để xem.');
      }).catch(function (e) { toast(e.message); });
  }
  var FILM_CSS = [
    '*{box-sizing:border-box}html,body{margin:0;background:#121214;color:#ece9e2;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.film{max-width:min(1200px,96vw);margin:0 auto;padding:24px 0 40px;display:grid;gap:14px}',
    'header{display:flex;align-items:flex-end;gap:16px}header h1{margin:0;font-size:26px;letter-spacing:-.01em}header p{margin:4px 0 0;color:#a8a49d}',
    '.badge{margin-left:auto;font-size:12px;color:#a8a49d;border:1px solid #34333a;border-radius:12px;padding:2px 10px;white-space:nowrap}',
    '.ainote{font-size:12px;color:#a8a49d;border:1px solid #34333a;border-radius:12px;padding:2px 10px;white-space:nowrap;cursor:help}',
    '.screen{position:relative;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgb(0 0 0/.45)}.screen .gcp{border-radius:0}',
    '.big{position:absolute;inset:0;margin:auto;width:84px;height:84px;border-radius:50%;border:0;background:rgb(255 255 255/.92);color:#121214;font-size:30px;cursor:pointer;z-index:9;box-shadow:0 8px 30px rgb(0 0 0/.35)}',
    '.big[hidden]{display:none}',
    '.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bar button{background:#232227;color:#ece9e2;border:1px solid #34333a;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}',
    '.bar button:hover{background:#2c2b31}#prog{margin-left:auto;color:#a8a49d;font-variant-numeric:tabular-nums}',
    '.bar select{background:#232227;color:#ece9e2;border:1px solid #34333a;border-radius:6px;padding:6px 8px;font:inherit}',
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
    '  (DATA.soundPacks || []).forEach(function (p) { if (GC.sounds) GC.sounds.registerPack(p); });',   // gói âm TRƯỚC gói động tác (sự kiện gọi tên âm)
    '  (DATA.motionPacks || []).forEach(function (m) { GC.choreo.registerPack("local.my", m); });',
    '  var rs = GC.film.readiness(FILM), ready = rs.filter(function (x) { return x.ok; }).map(function (x) { return x.shot; });',
    // giọng AI nhúng sẵn (DATA.voices: khoá câu → data: URI) chỉ dùng khi chọn "tự động"; chọn máy đọc / blip / tắt thì bỏ qua. Không gọi mạng.
    '  var VO = DATA.voices || {}, aiN = Object.keys(VO).length, aiT = DATA.voiceTotal || 0;',
    '  if (aiN) $("voice").options[0].text = "Giọng: tự động (có giọng AI)";',
    // chưa đủ clip: nhãn nhỏ cạnh ô Giọng nói rõ phần còn lại đọc bằng giọng máy / blip (chỉ khi đang ở "tự động" — chọn máy đọc / blip thì clip AI không dùng)
    '  function aiNote() { var n = $("ainote"), lack = aiT - aiN; n.hidden = !(aiN && lack > 0 && $("voice").value === "auto"); n.textContent = "Giọng AI " + aiN + "/" + aiT; n.title = lack + " câu chưa có giọng AI — phần còn lại đọc bằng giọng máy / blip."; }',
    '  var player = GC.film.player($("stage"), { onProgress: function (t) { $("prog").textContent = t; }, onEnd: function () { $("big").hidden = false; }, dialog: FILM.dialog || "auto", lang: DATA.lang, accent: DATA.accent,',
    '    voiceClip: function (line) { return $("voice").value === "auto" && aiN ? VO[GC.film.clipKey(line)] || null : null; },',
    // phim có giọng AI + đang ở "tự động": câu thiếu clip chỉ đọc bằng giọng máy hạng tốt, không thì blip (không để robot lẫn với giọng AI); chọn "máy đọc" thì đọc như cũ
    '    needGood: function () { return $("voice").value === "auto" && aiN > 0; } });',
    '  if (DATA.project) player.setProject(DATA.project);',   // dự án của tác phẩm → chọn gói âm (assets xuất ra không mang project)
    '  $("dialog").value = player.dialog(); $("dialog").onchange = function () { player.setDialog($("dialog").value); };',
    '  player.show(ready[0] || FILM.shots[0]);',
    '  function play(from) { $("big").hidden = true; player.play(ready.slice(from || 0), FILM.title); }',
    '  $("big").onclick = $("play").onclick = function () { play(0); };',
    '  $("stop").onclick = function () { player.stop(); $("big").hidden = false; };',
    '  var A = GC.audio; if (A) { $("mute").onclick = function () { A.setMuted(!A.muted); $("mute").textContent = A.muted ? "🔇" : "🔊"; }; $("voice").onchange = function () { A.setVoiceMode($("voice").value); aiNote(); }; aiNote(); } else { $("mute").hidden = $("voice").hidden = true; }',
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

  /* ---- Bảng bước (v0.16, Q9 — ADR 0006): soạn kịch bản phân cảnh KHÔNG cần AI ----
   * Mỗi hàng là một bước event.steps[i]. Mọi ô chọn sinh từ lược đồ đạo diễn GC.director.schema(dàn diễn viên) — không chép tay danh sách;
   * ô Hành động chỉ có đòn diễn viên của hàng làm được (GC.choreo.actionsFor ∩ lược đồ). Kiểm sống bằng GC.director.validate (cùng bộ kiểm
   * server dùng khi lưu); lưu qua đúng đường lưu phân cảnh (POST api/works/<id>/shots) — không có lối tắt bỏ cổng. */
  var CAMERA_LABEL = { auto: 'Tự động', wide: 'Toàn cảnh', two: 'Hai người', close: 'Cận người nói' };
  var BUBBLE_LABEL = { say: 'Nói', shout: 'Hét', think: 'Nghĩ', whisper: 'Thì thầm' };
  var FACING_LABEL = { left: 'Quay trái', right: 'Quay phải' };
  // nhãn tiếng Việt của một giá trị trong lược đồ (giá trị lấy từ lược đồ; thiếu nhãn thì hiện id)
  function enumLabel(k, v) {
    var L = { state: LIB.states, activity: LIB.activities, posture: LIB.postures, move: LIB.moves, motion: LIB.motions, fx: LIB.fx, spot: GC.SCENE.spots }[k];
    if (L && L[v] && L[v].label) return L[v].label;
    var M = { view: VIEW_LABEL, camera: CAMERA_LABEL, bubble: BUBBLE_LABEL, facing: FACING_LABEL }[k];
    if (M && M[v]) return M[v];
    if (k === 'react' && GC.choreo && GC.choreo.REACTS[v]) return GC.choreo.REACTS[v].label;
    if (k === 'sfx' && GC.sounds && GC.sounds.has(v)) return GC.sounds.get(v).label;   // âm thanh: nhãn của thư viện âm
    return v;
  }
  // huy hiệu của một đòn: đòn đánh / ném / cần binh khí / nhắm đầu (dùng ở bảng bước và Thư viện › Động tác)
  function actionBadges(A) {
    if (!A) return [];
    var out = [];
    if (A.attack) out.push(['đòn đánh', 'atk']);
    if (A.ranged) out.push(['ném', 'rng']);
    if (A.needs) out.push(['cần binh khí', 'need']);
    if (A.aim === 'head') out.push(['nhắm đầu', '']);
    return out;
  }
  function badgeEls(A) { return actionBadges(A).map(function (b) { return h('span', { class: 'tag badge ' + b[1], text: b[0] }); }); }
  // cfg: { base: { title, description, scene, cast }, event, chars (diễn viên chọn được, đã xếp), save(shot) → Promise, close() }
  function stepSheet(cfg) {
    var C = GC.choreo, base = cfg.base, cast = base.cast.slice(), dirty = false, alive = true, warnTimer = 0, serverErrs = [];
    // rev tăng mỗi lần sửa: lưu xong chỉ xoá "chưa lưu" khi trong lúc chờ không sửa thêm; saving khoá nút Lưu suốt lúc chờ (không gửi đôi)
    var rev = 0, saving = false, downOnBack = false, warnSig = null, warnPend = null;
    var evTitle = (cfg.event && cfg.event.title) || base.title || 'Phân cảnh';
    var rows = cfg.event && Array.isArray(cfg.event.steps) ? clone(cfg.event.steps) : [];
    var scene = base.scene ? GC.getScene(base.scene, MY_PACK) : null;
    var MAX = 12, MORE = ['camera', 'bubble', 'activity', 'view', 'facing', 'posture', 'move', 'motion'], MORE_ARR = ['fx', 'sfx'];
    var COLS = [['actor', 'Diễn viên'], ['state', 'Biểu cảm'], ['say', 'Lời thoại'], ['to', 'Nói với'], ['spot', 'Chỗ đứng'],
      ['action', 'Hành động'], ['target', 'Đối thủ'], ['react', 'Phản ứng'], ['hold', 'Giữ (s)'], ['more', 'Thêm…']];
    var SPAN = COLS.length + 2, opened = {}, idCells = [], errRows = [];
    function castAssets() { return cast.map(function (k) { return GC.ASSETS[k] || GC.getAsset(k, MY_PACK); }).filter(Boolean); }
    function assetOf(id) { return castAssets().filter(function (a) { return a.id === id; })[0] || null; }
    var SCH = null;   // thuộc tính của một bước trong lược đồ — tính lại khi đổi dàn diễn viên
    function schema() { SCH = GC.director.schema(castAssets()).properties.steps.items.properties; }
    schema();
    if (!rows.length) { var a0 = castAssets()[0]; rows.push({ actor: a0 ? a0.id : '', state: 'normal', say: '' }); }
    // bước sạch: bỏ ô trống (lược đồ không nhận chuỗi rỗng ở ô tuỳ chọn), giữ nguyên mọi khoá khác do AI / JSON viết
    function cleanSteps() {
      return rows.map(function (r) {
        var o = {};
        Object.keys(r).forEach(function (k) { var v = r[k]; if (k !== 'say' && (v === '' || v == null || (Array.isArray(v) && !v.length))) return; o[k] = v; });
        if (typeof o.say !== 'string') o.say = '';
        return o;
      });
    }
    function eventNow() { var ev = { title: evTitle, steps: cleanSteps() }; if (scene) ev.scene = scene.key; return ev; }
    function errorsNow() {
      var cs = castAssets(), all = cs.length ? GC.director.validate(eventNow(), cs) : ['Chọn ít nhất một diễn viên cho phân cảnh.'];
      if (scene && cs.length > scene.spots.length) all.push('Bối cảnh "' + scene.name + '" chỉ mở ' + scene.spots.length + ' chỗ đứng — bớt diễn viên.');
      var byRow = rows.map(function () { return []; }), glob = [];
      // bộ kiểm báo lỗi theo đường dẫn máy "steps[i].trường: …" (i từ 0): đặt lỗi cạnh đúng hàng, lỗi chung / không khớp thì để ở đầu bảng
      all.forEach(function (m) { var x = /^steps\[(\d+)\](?:\.[A-Za-z]+)?: (.*)$/.exec(m); if (x && byRow[+x[1]]) byRow[+x[1]].push(x[2]); else glob.push(m); });
      return { total: all.length, rows: byRow, global: glob };
    }
    // ---- khung
    var castBox = h('div', { class: 'fxchips' }), globBox = h('div'), warnBox = h('div', { class: 'stack', style: 'gap:4px' });
    var table = h('table', { class: 'grid stepgrid' }), foot = h('div', { class: 'row note' });
    var addB = h('button', { class: 'btn sm', onclick: function () { addRow(); } }, '+ Thêm bước');
    var saveB = h('button', { class: 'btn sm primary', onclick: save }, 'Lưu bước');
    var el = h('div', { class: 'sheet-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bảng bước · ' + base.title, onmousedown: function (ev) { downOnBack = ev.target === el; },
      // chỉ đóng khi nhấn xuống VÀ nhả đều ở nền: kéo bôi chữ trong ô rồi nhả ra ngoài thì "click" rơi vào nền nhưng không được đóng
      onclick: function (ev) { var ok = downOnBack && ev.target === el; downOnBack = false; if (ok) close(); } },
      h('div', { class: 'panel sheet' },
        h('h3', null, 'Bảng bước', h('span', { class: 'note', style: 'text-transform:none;letter-spacing:0', text: base.title }),
          h('span', { class: 'r row', style: 'gap:6px' }, addB, saveB, h('button', { class: 'btn sm', onclick: function () { close(); } }, 'Đóng'))),
        h('div', { class: 'pad stack', style: 'gap:10px' },
          h('div', { class: 'row', style: 'gap:6px' }, h('b', { class: 'note', text: 'Dàn diễn viên' }), castBox,
            h('span', { class: 'note', style: 'margin-left:auto', text: scene ? 'Bối cảnh: ' + scene.name + ' · ' + scene.spots.length + ' chỗ đứng' : 'Chưa chọn bối cảnh — chọn ở phân cảnh để dùng "Chỗ đứng".' })),
          h('div', { class: 'note', text: 'Soạn không cần AI: mỗi hàng một bước. Ô chọn lấy từ lược đồ đạo diễn; "Hành động" chỉ có đòn diễn viên của hàng làm được. Đòn đánh cần đối thủ; phản ứng là của đối thủ.' }),
          globBox, h('div', { class: 'scroll stepwrap' }, table), foot, warnBox)));
    // Esc đóng (bỏ qua Esc đang dùng để thoát bộ gõ tiếng Việt / IME); Tab xoay vòng trong hộp thoại (aria-modal)
    function onKey(ev) {
      if (!alive) return;
      if (ev.key === 'Escape') { if (ev.isComposing || ev.keyCode === 229) return; ev.preventDefault(); close(); }
      else if (ev.key === 'Tab') trap(ev);
    }
    function trap(ev) {
      var f = Array.prototype.filter.call(el.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var a = document.activeElement, first = f[0], last = f[f.length - 1];
      if (!el.contains(a)) { ev.preventDefault(); first.focus(); }
      else if (ev.shiftKey && a === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && a === last) { ev.preventDefault(); first.focus(); }
    }
    // đóng tab / tải lại khi còn thay đổi chưa lưu: trình duyệt hỏi lại (gỡ ở destroy)
    function onUnload(ev) { if (alive && dirty) { ev.preventDefault(); ev.returnValue = ''; return ''; } }
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    function touch() { dirty = true; rev++; serverErrs = []; }
    function set(i, k, v) {
      var r = rows[i];
      if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete r[k]; else r[k] = v;
      if (k === 'actor') { if (r.to === v) delete r.to; if (r.target === v) { delete r.target; delete r.react; } }
      if (k === 'action') {
        var A = v && C ? C.ACTIONS[v] : null;
        if (!(A && A.attack)) { delete r.target; delete r.react; }
        else if (!r.target) { var t = r.to && r.to !== r.actor ? r.to : others(r.actor)[0]; if (t) r.target = t; }   // gợi ý đối thủ: người đang nói cùng, không thì người đầu dàn
      }
      if (k === 'target' && !v) delete r.react;
      touch(); paint();
    }
    function others(id) { return (SCH.target.enum || []).filter(function (x) { return x !== id; }); }
    function nameOf(id) { var a = assetOf(id); return a ? a.name : id; }
    // ô chọn: opts = [[giá trị, nhãn, nhóm?]]; giá trị hiện tại không còn hợp lệ vẫn hiện (đánh dấu) để người soạn thấy và đổi
    function pick(i, k, label, opts, cur, onPick, off, title, bad) {
      var s = h('select', { 'data-cell': i + ':' + k, 'aria-label': label + ' · bước ' + (i + 1), disabled: off ? true : null, title: title || null, onchange: function () { onPick(s.value); } });
      var groups = {};
      opts.forEach(function (o) {
        var op = h('option', { value: o[0], text: o[1] });
        if (!o[2]) { s.appendChild(op); return; }
        if (!groups[o[2]]) { groups[o[2]] = h('optgroup', { label: o[2] }); s.appendChild(groups[o[2]]); }
        groups[o[2]].appendChild(op);
      });
      if (cur && !opts.some(function (o) { return o[0] === cur; })) s.appendChild(h('option', { value: cur, text: '⚠ ' + (bad ? bad(cur) : cur + ' (không hợp lệ)') }));
      s.value = cur == null ? '' : cur;
      return s;
    }
    function enumOpts(k, list) { return (list || SCH[k].enum || []).map(function (v) { return [v, enumLabel(k, v)]; }); }
    function moreCount(r) { return MORE.concat(MORE_ARR).filter(function (k) { return r[k] !== undefined && !(Array.isArray(r[k]) && !r[k].length); }).length; }
    function moreTitle(r) { return MORE.concat(MORE_ARR).filter(function (k) { return r[k] !== undefined; }).map(function (k) { return k + ': ' + [].concat(r[k]).map(function (v) { return enumLabel(k, v); }).join(', '); }).join(' · '); }
    function cellsOf(r, i) {
      var who = assetOf(r.actor), A = r.action && C ? C.ACTIONS[r.action] : null;
      var canList = who && C ? C.actionsFor(who) : [];
      var acts = (SCH.action.enum || []).filter(function (k) { return canList.indexOf(k) >= 0; }).map(function (k) {
        var X = C.ACTIONS[k];
        return [k, X.label + (X.ranged ? ' · ném' : '') + (X.needs ? ' · cần binh khí' : ''), X.attack ? 'Đòn đánh' : 'Động tác'];
      });
      var say = h('input', { type: 'text', 'data-cell': i + ':say', value: r.say || '', maxlength: 120, placeholder: A ? '(ra đòn không hô)' : 'Lời thoại…', 'aria-label': 'Lời thoại · bước ' + (i + 1),
        oninput: function () { r.say = say.value; touch(); check(); } });
      var hold = h('input', { type: 'number', 'data-cell': i + ':hold', min: 0.8, max: 6, step: 0.1, value: r.hold != null ? r.hold : '', placeholder: '—', title: 'Giữ khung 0,8–6 giây; bỏ trống = tự động theo độ dài câu', 'aria-label': 'Giữ khung (giây) · bước ' + (i + 1),
        oninput: function () { var v = parseFloat(hold.value); if (hold.value === '' || !isFinite(v)) delete r.hold; else r.hold = Math.round(v * 10) / 10; touch(); check(); } });
      var atk = !!(A && A.attack), spots = scene ? (SCH.spot.enum || []).filter(function (k) { return scene.spots.indexOf(k) >= 0; }) : [];
      var nMore = moreCount(r);
      return {
        actor: pick(i, 'actor', 'Diễn viên', (SCH.actor.enum || []).map(function (id) { return [id, nameOf(id)]; }), r.actor, function (v) { set(i, 'actor', v); }, false, null, function (v) { return v + ' (không có trong dàn)'; }),
        state: pick(i, 'state', 'Biểu cảm', enumOpts('state'), r.state, function (v) { set(i, 'state', v); }),
        say: say,
        to: pick(i, 'to', 'Nói với', [['', '— tự động —']].concat(others(r.actor).map(function (id) { return [id, nameOf(id)]; })), r.to || '', function (v) { set(i, 'to', v); }),
        spot: pick(i, 'spot', 'Chỗ đứng', [['', scene ? '— giữ chỗ —' : '— cần bối cảnh —']].concat(enumOpts('spot', spots)), r.spot || '', function (v) { set(i, 'spot', v); }, !scene && !r.spot, scene ? null : 'Chọn bối cảnh cho phân cảnh trước'),
        action: h('div', { class: 'actcell' },
          pick(i, 'action', 'Hành động', [['', '— không —']].concat(acts), r.action || '', function (v) { set(i, 'action', v); }, false,
            who ? who.name + ' làm được ' + acts.length + ' đòn' + (C && !C.hasWeapon(who) ? ' (tay không — đòn binh khí bị ẩn)' : '') : null,
            function (v) { var X = C && C.ACTIONS[v]; return X ? X.label + ' — ' + (who ? who.name : 'người này') + ' không làm được' : v + ' — chưa có đòn này'; }),
          A ? h('span', { class: 'badges' }, badgeEls(A)) : null),
        target: pick(i, 'target', 'Đối thủ', [['', atk ? '— chọn đối thủ —' : '— chỉ cho đòn đánh —']].concat(atk ? others(r.actor).map(function (id) { return [id, nameOf(id)]; }) : []), r.target || '', function (v) { set(i, 'target', v); }, !atk && !r.target),
        react: pick(i, 'react', 'Phản ứng', [['', r.target ? '— mặc định: ' + enumLabel('react', 'hit') + ' —' : '— cần đối thủ —']].concat(r.target ? enumOpts('react') : []), r.react || '', function (v) { set(i, 'react', v); }, !r.target && !r.react),
        hold: hold,
        more: h('button', { class: 'btn sm more' + (nMore ? ' on' : ''), 'data-cell': i + ':more', 'aria-expanded': String(!!opened[i]), title: moreTitle(r) || 'Máy quay, bong bóng, hoạt động, góc nhìn, hiệu ứng, âm thanh…', onclick: function () { opened[i] = !opened[i]; paint(); } }, nMore ? 'thêm · ' + nMore : 'thêm…')
      };
    }
    // hàng "thêm…": các ô ít dùng — vẫn sinh từ lược đồ
    function moreRow(r, i) {
      var box = h('div', { class: 'moregrid' });
      MORE.forEach(function (k) {
        if (!SCH[k]) return;
        box.appendChild(h('label', { class: 'fld' }, h('span', { class: 'note', text: { camera: 'Máy quay', bubble: 'Bong bóng', activity: 'Hoạt động', view: 'Góc nhìn', facing: 'Hướng', posture: 'Tư thế', move: 'Di chuyển', motion: 'Động tác tay' }[k] || k }),
          pick(i, k, k, [['', '— tự động —']].concat(enumOpts(k)), r[k] || '', function (v) { set(i, k, v); })));
      });
      MORE_ARR.forEach(function (k) {
        if (!SCH[k]) return;
        var cur = (r[k] || []).slice(), chips = h('div', { class: 'fxchips' }), max = SCH[k].maxItems || 3;
        (SCH[k].items.enum || []).forEach(function (v) {
          chips.appendChild(h('button', { 'aria-pressed': String(cur.indexOf(v) >= 0), 'data-chip': i + ':' + k + ':' + v, onclick: function () {
            var j = cur.indexOf(v); if (j >= 0) cur.splice(j, 1); else if (cur.length < max) cur.push(v); else { toast('Tối đa ' + max + ' mục.'); return; }
            set(i, k, cur);
          } }, enumLabel(k, v)));
        });
        box.appendChild(h('div', { class: 'fld wide' }, h('span', { class: 'note', text: (k === 'fx' ? 'Hiệu ứng' : 'Âm thanh') + ' (tối đa ' + max + ')' }), chips));
      });
      return h('tr', { class: 'morerow' }, h('td', { class: 'id' }), h('td', { colspan: SPAN - 1 }, box));
    }
    function paintCast() {
      clear(castBox);
      cfg.chars.forEach(function (a) {
        var on = cast.indexOf(a.key) >= 0;
        castBox.appendChild(h('button', { 'aria-pressed': String(on), title: a.key + (C && C.hasWeapon(a) ? ' · có binh khí' : ''), onclick: function () {
          var j = cast.indexOf(a.key);
          if (j >= 0) cast.splice(j, 1); else if (cast.length < 8) cast.push(a.key); else { toast('Tối đa 8 diễn viên một cảnh.'); return; }
          touch(); schema(); paintCast(); paint();
        } }, a.name));
      });
    }
    function paint() {
      // vẽ lại cả bảng nên nhớ ô / chip đang giữ tiêu điểm để trả lại sau khi vẽ
      var ae = document.activeElement, focus = null;
      ['data-cell', 'data-chip'].forEach(function (a) { if (!focus && ae && ae.getAttribute && ae.getAttribute(a)) focus = [a, ae.getAttribute(a)]; });
      clear(table); idCells = []; errRows = [];
      var lt = h('tr', { class: 'letters' }, h('td'));
      COLS.forEach(function (c, j) { lt.appendChild(h('td', { text: String.fromCharCode(65 + j) })); });
      lt.appendChild(h('td'));
      var hd = h('tr', null, h('th', { text: 'Bước' }));
      COLS.forEach(function (c) { hd.appendChild(h('th', { class: 'c-' + c[0], text: c[1] })); });
      hd.appendChild(h('th', { text: '' }));
      table.appendChild(lt); table.appendChild(hd);
      rows.forEach(function (r, i) {
        var cells = cellsOf(r, i), idc = h('td', { class: 'id', text: 'B' + String(i + 1).padStart(2, '0') });
        var tr = h('tr', { 'data-step': String(i) }, idc);
        COLS.forEach(function (c) { tr.appendChild(h('td', { class: 'c-' + c[0] }, cells[c[0]])); });
        tr.appendChild(h('td', { class: 'ops' },
          h('button', { class: 'btn sm ic', 'data-op': 'up', disabled: i ? null : true, title: 'Lên', 'aria-label': 'Đưa bước ' + (i + 1) + ' lên', onclick: function () { move(i, -1); } }, '↑'),
          h('button', { class: 'btn sm ic', 'data-op': 'down', disabled: i < rows.length - 1 ? null : true, title: 'Xuống', 'aria-label': 'Đưa bước ' + (i + 1) + ' xuống', onclick: function () { move(i, 1); } }, '↓'),
          h('button', { class: 'btn sm ic danger', disabled: rows.length > 1 ? null : true, title: 'Xoá bước', 'aria-label': 'Xoá bước ' + (i + 1), onclick: function () { rows.splice(i, 1); opened = {}; touch(); paint(); focusRow(Math.min(i, rows.length - 1)); } }, '✕')));
        table.appendChild(tr);
        if (opened[i]) table.appendChild(moreRow(r, i));
        var er = h('tr', { class: 'errrow', hidden: true }, h('td', { class: 'id' }), h('td', { colspan: SPAN - 1 }));
        table.appendChild(er);
        idCells.push(idc); errRows.push(er);
      });
      addB.disabled = rows.length >= MAX;
      if (focus) { var f = table.querySelector('[' + focus[0] + '="' + focus[1] + '"]'); if (f) f.focus(); }
      check();
    }
    // tiêu điểm về ô lời thoại của hàng j (sau khi xoá hàng: hàng kế, hết hàng kế thì hàng trước)
    function focusRow(j) { var f = table.querySelector('[data-cell="' + j + ':say"]'); if (f) f.focus(); }
    // sau khi đổi chỗ hàng: tiêu điểm theo hàng đó (nút cùng chiều; hết chỗ đi thì nút ngược chiều)
    function move(i, d) {
      var x = rows.splice(i, 1)[0]; rows.splice(i + d, 0, x); opened = {}; touch(); paint();
      var j = i + d, f = [d < 0 ? 'up' : 'down', d < 0 ? 'down' : 'up'].map(function (o) { return table.querySelector('tr[data-step="' + j + '"] [data-op="' + o + '"]'); }).filter(function (b) { return b && !b.disabled; })[0];
      if (f) f.focus();
    }
    function addRow() {
      if (rows.length >= MAX) return;
      var last = rows[rows.length - 1], ids = SCH.actor.enum || [];
      var nextId = last && ids.length > 1 ? ids[(ids.indexOf(last.actor) + 1) % ids.length] : ids[0] || '';   // người nói kế tiếp: lần lượt theo dàn
      rows.push({ actor: nextId, state: 'normal', say: '' });
      touch(); paint();
      var f = table.querySelector('[data-cell="' + (rows.length - 1) + ':say"]'); if (f) f.focus();
    }
    function check() {
      var E = errorsNow();
      E.rows.forEach(function (list, i) {
        var er = errRows[i], idc = idCells[i];
        if (!er) return;
        idc.classList.toggle('bad', !!list.length);
        idc.title = list.length ? list.length + ' lỗi' : '';
        clear(er.lastChild);
        if (list.length) er.lastChild.appendChild(h('ul', { class: 'errs' }, list.map(function (m) { return h('li', { text: '✗ ' + m }); })));
        er.hidden = !list.length;
      });
      clear(globBox);
      var g = E.global.concat(serverErrs);
      if (g.length) globBox.appendChild(h('div', { class: 'banner bad' }, h('ul', { class: 'errs', style: 'margin:0' }, g.slice(0, 12).map(function (m) { return h('li', { text: '✗ ' + m }); }))));
      clear(foot);
      foot.appendChild(h('span', { class: 'mono', text: rows.length + ' / ' + MAX + ' bước' }));
      foot.appendChild(E.total ? h('span', { class: 'chip bad', text: '✗ ' + E.total + ' lỗi' }) : h('span', { class: 'chip ok', text: '✓ Hợp lệ theo lược đồ đạo diễn' }));
      foot.appendChild(h('span', { class: dirty ? 'chip warn' : 'chip', text: dirty ? 'Chưa lưu' : 'Đã lưu' }));
      saveB.disabled = !!E.total || saving;
      saveB.title = saving ? 'Đang lưu…' : E.total ? 'Sửa ' + E.total + ' lỗi trước khi lưu' : 'Lưu phân cảnh (server kiểm lại bằng cùng cổng)';
      // cảnh báo đạo diễn chỉ tính lại khi cấu trúc đổi (diễn viên / đòn / đối thủ / phản ứng / chỗ đứng / dàn / bối cảnh), không tính lại mỗi phím gõ lời thoại;
      // không xoá khung cảnh báo giữa chừng (tránh nháy) — chỉ xoá khi kịch bản đang lỗi
      if (E.total) { clearTimeout(warnTimer); warnSig = warnPend = null; clear(warnBox); return; }
      var sig = structSig();
      if (sig !== warnSig && sig !== warnPend) { clearTimeout(warnTimer); warnPend = sig; warnTimer = setTimeout(function () { warnings(sig); }, 450); }
    }
    function structSig() {
      return JSON.stringify([scene ? scene.key : '', cast, rows.map(function (r) { return [r.actor, r.action, r.target, r.react, r.spot, r.to]; })]);
    }
    // cảnh báo của đạo diễn tự động (plan.warnings): đòn không dựng được… — dựng thử như lúc diễn, chỉ khi kịch bản đã hợp lệ
    function warnings(sig) {
      warnPend = null;
      if (!alive) return;
      warnSig = sig;
      if (!scene) return;
      var plan = null, ws = [];
      try { plan = GC.film.direct({ scene: scene.key, cast: cast, event: eventNow() }); ws = (plan && plan.warnings) || []; }
      catch (e) { ws = ['dựng thử lỗi: ' + e.message]; }
      clear(warnBox);
      ws.forEach(function (w) { warnBox.appendChild(h('div', { class: 'note warn', text: '⚠ ' + w })); });
    }
    function save() {
      if (saving || errorsNow().total) { check(); return; }
      var at = rev, n = rows.length;   // bản đang gửi = bản ở thời điểm bấm (cleanSteps chạy ngay bên dưới)
      saving = true; saveB.disabled = true; saveB.textContent = 'Đang lưu…';
      cfg.save({ title: base.title, description: base.description, scene: base.scene, cast: cast.slice(), event: { title: evTitle, steps: cleanSteps() } })
        .then(function () {
          saving = false;
          if (!alive) return;
          if (rev === at) { dirty = false; serverErrs = []; toast('Đã lưu ' + n + ' bước của "' + base.title + '".'); }
          else toast('Đã lưu bản lúc bấm — bạn vừa sửa thêm, phần mới vẫn chưa lưu.');   // sửa trong lúc chờ: giữ "chưa lưu" (không mất chữ âm thầm)
        })
        .catch(function (e) { saving = false; if (!alive) return; serverErrs = (e && e.errors) || (e ? [e.message] : []); })
        .then(function () { if (!alive) return; saveB.textContent = 'Lưu bước'; check(); });
    }
    function close() {
      if (!alive) return;
      if (dirty && !window.confirm('Bảng bước còn thay đổi chưa lưu. Đóng và bỏ thay đổi?')) return;
      destroy();
      cfg.close();
    }
    function destroy() { alive = false; clearTimeout(warnTimer); document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); el.remove(); }
    paintCast(); paint();
    return { el: el, destroy: destroy };
  }

  /* ============================================================ TẠO TÁC › Tác phẩm: DANH SÁCH → PHÒNG LÀM PHIM riêng cho từng tác phẩm (v0.18) */
  // Danh sách = bảng Data Console (ID, tên, dự án, cảnh, Đạt, giọng AI, cập nhật, trạng thái); mở một hàng = vào phòng của tác phẩm đó, địa chỉ có id (#/tac-pham/<id>/<tab>).
  // Phòng có 5 tab: Kịch bản · Phân cảnh · Xem & duyệt · Giọng & âm thanh · Xuất bản. AI đạo diễn là DOCK bên phải (studio/dock.js) — luồng chat gắn với tác phẩm đang mở.
  // Mọi ghi đều qua API → cùng cổng với MCP; AI thiếu asset thì tự vào Xưởng tạo (đúng dự án của tác phẩm). Trình diễn: engine/player.js (GC.film), dùng chung với phim xuất ra.
  var WORK_TABS = [['script', 'Kịch bản'], ['shots', 'Phân cảnh'], ['review', 'Xem & duyệt'], ['voice', 'Giọng & âm thanh'], ['publish', 'Xuất bản']];
  var REVIEW_ST = [['draft', 'Nháp'], ['fix', 'Cần sửa'], ['ok', 'Đạt']];
  function workHash(id, tab, shot) { return '#/tac-pham/' + id + (tab ? '/' + tab + (shot ? '/' + shot : '') : ''); }
  function parseWorkHash() {
    var m = /^#\/tac-pham\/([a-z0-9][a-z0-9-]{0,63})(?:\/(script|shots|review|voice|publish))?(?:\/([a-z0-9][a-z0-9-]{0,39}))?$/.exec(location.hash || '');
    return m ? { page: 'works', work: m[1], tab: m[2] || 'shots', shot: m[3] || undefined } : null;
  }
  function setHash(hash, push) {
    try {
      var base = location.pathname + location.search;
      if (base + (hash || '') === base + location.hash) return;
      history[push ? 'pushState' : 'replaceState'](null, '', base + (hash || ''));
    } catch (e) { /* bỏ qua */ }
  }
  function saveRoute() { try { localStorage.setItem(routeKey(APP), JSON.stringify(route)); } catch (e) { /* bỏ qua */ } }
  // trạng thái của cả tác phẩm (cột "Trạng thái" của danh sách): từ số cảnh, cảnh có lời, cảnh Đạt / Cần sửa
  function workStatus(w) {
    if (!w.shots) return ['Trống', 'chip', 'empty'];
    if (w.reviewFix) return ['Cần sửa', 'chip warn', 'fix'];
    if (w.reviewOk === w.shots) return ['Đã duyệt', 'chip ok', 'ok'];
    if (w.done < w.shots) return ['Đang soạn', 'chip info', 'draft'];
    return ['Chờ duyệt', 'chip', 'wait'];
  }
  var WORK_STATUS = [['*', 'Mọi trạng thái'], ['empty', 'Trống'], ['draft', 'Đang soạn'], ['wait', 'Chờ duyệt'], ['fix', 'Cần sửa'], ['ok', 'Đã duyệt']];
  // so khớp từ (LCS) cho diff chờ duyệt: a, b là mảng chuỗi (khoá so) → [['eq'|'del'|'ins', i của a, j của b]…]; quá lớn thì coi như thay hết
  function seqDiff(A, B) {
    var n = A.length, m = B.length, i, j;
    if (n * m > 160000) return A.map(function (_, k) { return ['del', k, -1]; }).concat(B.map(function (_, k) { return ['ins', -1, k]; }));
    var L = []; for (i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var out = []; i = 0; j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { out.push(['eq', i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['del', i++, -1]); else out.push(['ins', -1, j++]); }
    while (i < n) out.push(['del', i++, -1]);
    while (j < m) out.push(['ins', -1, j++]);
    return out;
  }
  function words(t) { return String(t || '').split(/(\s+)/).filter(function (x) { return x !== ''; }); }
  // một dòng của bước để so / hiện: "Tên · biểu cảm · "lời" · đòn → đối thủ"
  function stepLine(st, nameOf) {
    var o = [nameOf(st.actor) + (st.state && st.state !== 'normal' ? ' (' + stateLabel(st.state) + ')' : '')];
    if (st.say) o.push('“' + st.say + '”');
    if (st.action) o.push('đòn ' + ((GC.choreo && GC.choreo.ACTIONS[st.action] && GC.choreo.ACTIONS[st.action].label) || st.action) + (st.target ? ' → ' + nameOf(st.target) : ''));
    if (st.spot) o.push('chỗ ' + st.spot);
    return o.join(' · ');
  }
  // thời lượng ước tính của một phân cảnh (giây) theo kế hoạch dàn dựng của bộ phát; chưa dựng được thì ~2,2 s mỗi bước
  var secCache = new Map();
  function shotSeconds(s) {
    var steps = (s.event && s.event.steps) || [], key = s.id + '|' + JSON.stringify([s.scene, s.cast, s.event]);
    if (secCache.has(key)) return secCache.get(key);
    var t = 0;
    try {
      var plan = !GC.film.issues(s).length ? GC.film.direct(s) : null;
      if (plan) { t = 0.9; plan.beats.forEach(function (b) { if (b.type === 'line') t += Math.max(b.estimate || 1.6, b.hold || 0); else if (b.type === 'act') t += b.real || 1.2; }); }
    } catch (e) { t = 0; }
    if (!t) t = steps.length * 2.2;
    t = Math.round(t * 10) / 10;
    if (secCache.size > 400) secCache.clear();
    secCache.set(key, t);
    return t;
  }
  function secLabel(t) { return t >= 60 ? Math.floor(t / 60) + ' phút ' + Math.round(t % 60) + ' s' : '≈ ' + (t < 10 ? t.toFixed(1).replace('.', ',') : Math.round(t)) + ' s'; }

  /* ---- Danh sách tác phẩm ---- */
  function worksList(r) {
    crumbs([{ t: 'Tác phẩm' }]);
    setHash('', !!location.hash);   // từ một phòng ra danh sách: thêm một mục lịch sử để Back quay lại đúng phòng
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: 'Khu Tạo tác (tác phẩm, AI đạo diễn) chạy ở bản cài trên máy.' })); return; }
    dockObj('project', null);
    // r.project chỉ dùng một lần (vào từ một dự án) — không lưu vào route để lần mở sau không hỏi lại
    var entryProj = r.project; delete r.project; saveRoute();
    var q = '', fp = entryProj != null ? entryProj : '*', fst = '*', list = [], nProj = entryProj != null ? entryProj : lastProject(), alive = true;
    onLeave(function () { alive = false; });
    var search = h('input', { type: 'search', 'aria-label': 'Tìm tác phẩm', placeholder: 'Tìm: tên, id, dự án…', style: 'width:240px', oninput: function () { q = norm(search.value.trim()); paint(); } });
    var projF = h('select', { 'aria-label': 'Lọc theo dự án', onchange: function () { fp = projF.value; paint(); } });
    var stF = h('select', { 'aria-label': 'Lọc theo trạng thái', onchange: function () { fst = stF.value; paint(); } });
    WORK_STATUS.forEach(function (s) { stF.appendChild(h('option', { value: s[0], text: s[1] })); });
    var nTitle = h('input', { type: 'text', 'aria-label': 'Tên tác phẩm mới', placeholder: 'Tên tác phẩm mới', maxlength: 80, style: 'width:200px', onkeydown: function (ev) { if (ev.key === 'Enter') create(); } });
    function create() {
      if (!nTitle.value.trim()) { nTitle.focus(); return; }
      Store.api('POST', 'api/works', { title: nTitle.value.trim(), project: nProj }).then(function (w) { nTitle.value = ''; if (nProj) setLastProject(nProj); openWork(w.id, 'script'); }).catch(function (e) { toast(e.message); });
    }
    actions(h('button', { class: 'btn primary', onclick: function () { nTitle.focus(); } }, '+ Tác phẩm mới'));
    var table = h('table', { class: 'grid worklist' }), foot = h('div', { class: 'row note' }), box = h('div', { class: 'panel scroll' }, table);
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'row toolbar' }, search, projF, stF, h('span', { class: 'note', id: 'workCount' })),
      h('div', { class: 'row toolbar newwork' }, h('span', { class: 'note', text: 'Tác phẩm mới:' }), nTitle, projectSelect(nProj, function (v) { nProj = v; }), h('button', { class: 'btn primary', onclick: create }, 'Tạo tác phẩm')), box, foot));
    function fillProj() {
      clear(projF);
      projF.appendChild(h('option', { value: '*', text: 'Mọi dự án' }));
      var ids = {}; list.forEach(function (w) { ids[w.project || ''] = 1; });
      Projects.all().forEach(function (p) { projF.appendChild(h('option', { value: p.id, text: p.name })); delete ids[p.id]; });
      Object.keys(ids).forEach(function (id) { projF.appendChild(h('option', { value: id, text: id ? Projects.name(id) : 'Chưa xếp dự án' })); });
      projF.value = fp; if (projF.value !== fp) { fp = '*'; projF.value = '*'; }
    }
    function paint() {
      clear(table); clear(foot);
      var cols = ['ID', 'Tên tác phẩm', 'Dự án', 'Cảnh', 'Đạt', 'Giọng AI', 'Cập nhật', 'Trạng thái'];
      var lt = h('tr', { class: 'letters' }); cols.forEach(function (c, i) { lt.appendChild(h('td', { text: String.fromCharCode(65 + i) })); });
      table.appendChild(lt);
      var hd = h('tr'); cols.forEach(function (c) { hd.appendChild(h('th', { text: c })); }); table.appendChild(hd);
      var rows = list.filter(function (w) {
        if (fp !== '*' && (w.project || '') !== fp) return false;
        if (fst !== '*' && workStatus(w)[2] !== fst) return false;
        return !q || norm([w.title, w.id, Projects.name(w.project || '')].join(' ')).indexOf(q) >= 0;
      });
      var sh = 0, ok = 0;
      rows.forEach(function (w) {
        var st = workStatus(w); sh += w.shots; ok += w.reviewOk;
        var tr = h('tr', anc({ class: 'click', onclick: function (ev) { if (!ev.target.closest('a')) openWork(w.id); } }, 'work:' + w.id, w.title),
          h('td', { class: 'id', text: w.id }),
          h('td', null, h('a', { class: 'rowlink', href: workHash(w.id, 'shots'), onclick: function (ev) { ev.preventDefault(); openWork(w.id); } }, h('b', { text: w.title }))),
          h('td', null, w.project ? h('span', { class: 'tag', text: Projects.name(w.project) }) : h('span', { class: 'muted', text: '—' })),
          h('td', { class: 'v num', text: w.shots + (w.shots && w.done < w.shots ? ' (' + w.done + ' có lời)' : '') }),
          h('td', { class: 'v num' }, w.shots ? h('span', { class: 'chip ' + (w.reviewOk === w.shots ? 'ok' : ''), title: 'Số cảnh đã duyệt "Đạt" / tổng số cảnh', text: w.reviewOk + '/' + w.shots }) : h('span', { class: 'muted', text: '—' })),
          h('td', { class: 'v num', title: 'Số câu thoại đã lồng tiếng AI / tổng số câu (lưu sẵn, đọc lại không tốn lượt)' }, w.voiceTotal ? h('span', { class: 'chip ' + (w.voiceDone === w.voiceTotal ? 'ok' : ''), text: w.voiceDone + '/' + w.voiceTotal }) : h('span', { class: 'muted', text: '—' })),
          h('td', { class: 'nw', text: clockOf(w.savedAt) }),
          h('td', null, h('span', { class: st[1], text: st[0] }), w.proposals ? h('span', { class: 'chip warn', style: 'margin-left:4px', title: 'AI đã đề xuất sửa, chờ bạn duyệt', text: w.proposals + ' đề xuất' }) : null));
        table.appendChild(tr);
      });
      if (!rows.length) table.appendChild(h('tr', null, h('td', { colspan: cols.length, class: 'empty', text: list.length ? 'Không có tác phẩm nào khớp bộ lọc.' : 'Chưa có tác phẩm nào. Đặt tên ở ô phía trên rồi bấm "+ Tác phẩm mới" — hoặc mở dự án mẫu ở Thư viện để thấy trọn một phim.' })));
      $('workCount').textContent = rows.length + ' / ' + list.length + ' tác phẩm';
      foot.appendChild(h('span', { class: 'mono', text: rows.length + ' tác phẩm · ' + sh + ' cảnh' }));
      foot.appendChild(h('span', { class: 'mono', text: 'Đạt ' + ok + '/' + sh }));
    }
    function load() {
      return Store.api('GET', 'api/works').then(function (l) {
        if (!alive) return;
        list = l; fillProj(); paint();
        var ofProj = entryProj ? l.filter(function (w) { return w.project === entryProj; })[0] : null;
        // vào từ một dự án chưa có tác phẩm: gợi ý đặt tên (dự án đã chọn sẵn); đã có đúng một thì mở luôn
        if (entryProj && !ofProj) { nTitle.focus(); toast('Đặt tên tác phẩm mới cho dự án ' + Projects.name(entryProj) + ' rồi bấm "+ Tác phẩm mới".'); }
        entryProj = null;
      }).catch(function (e) { toast(e.message); });
    }
    onData(function () { if (alive) load(); });
    load();
  }
  function openWork(id, tab) { setHash(workHash(id, tab || 'shots'), true); go({ page: 'works', work: id, tab: tab || 'shots' }); }

  PAGES.works = function (r) { if (r.work) worksRoom(r); else worksList(r); };

  /* ---- Phòng làm phim của MỘT tác phẩm ---- */
  function worksRoom(r) {
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: 'Khu Tạo tác (tác phẩm, AI đạo diễn) chạy ở bản cài trên máy.' })); crumbs([{ t: 'Tác phẩm' }]); return; }
    var W = null, tab = WORK_TABS.some(function (t) { return t[0] === r.tab; }) ? r.tab : 'shots', curShot = r.shot || '', soundWarn = [], propErr = {}, noteDraft = {}, openSteps = {};
    var tabBtns = {}, panels = {};
    crumbs([{ t: 'Tác phẩm', go: { page: 'works' } }, { t: r.work }]);
    actions(h('button', { class: 'btn', onclick: function () { setHash('', true); go({ page: 'works' }); } }, '‹ Danh sách tác phẩm'));
    route.work = r.work; route.tab = tab;
    // bản nháp chưa lưu (kịch bản + từng phân cảnh): vẽ lại sau chat / lưu cảnh khác không được xoá chữ đang gõ dở
    var draftScript = null, drafts = {}, alive = true;
    var logline = h('input', { type: 'text', maxlength: 300, placeholder: 'Logline — một câu tóm tắt', style: 'width:100%', oninput: function () { draftScript = { logline: logline.value, script: script.value }; } });
    var script = h('textarea', { rows: 6, maxlength: 8000, placeholder: 'Kịch bản tổng (văn xuôi). AI đạo diễn đọc mục này để chia phân cảnh.', oninput: function () { draftScript = { logline: logline.value, script: script.value }; } });
    var shotsBox = h('div', { class: 'shotlist' }), evPanel = h('div');
    var prog = h('span', { class: 'note mono', text: 'Chưa diễn' }), stage = h('div'), readyBox = h('div', { class: 'ready' });
    // giọng thu sẵn: kiểu "tự động" lấy clip AI ĐÃ lồng (dry — không tốn lượt), kiểu "AI Google" đọc ngay khi diễn (chờ lâu hơn vì Google đọc ~3–8 s / câu)
    function voiceClip(line, asset) {
      var pref = AudioPref.get().voice || 'auto';
      if (!AiVoice.on() || (pref !== 'auto' && pref !== 'ai')) return null;
      return AiVoice.clipForLine(W, workLang(W), asset, line, pref === 'ai');
    }
    // tác phẩm đã có clip AI (kiểu tự động / AI Google): câu thiếu clip không được rơi vào robot lẫn giọng AI → giọng máy chỉ nhận hạng good, không thì blip.
    // "Đã có clip" = đã thấy ít nhất 1 clip (câu đầu đã lồng thì có ngay từ câu đầu) — không hỏi trước cả tác phẩm để nút Diễn vẫn mở âm thanh ngay trong cú bấm. Chọn hẳn "máy đọc" thì không bật.
    function needGood() { var pref = AudioPref.get().voice || 'auto'; return (pref === 'auto' || pref === 'ai') && !!W && AiVoice.on() && AiVoice.ready() && AiVoice.hasClips(W, workLang(W)); }
    var player = GC.film.player(stage, { onProgress: function (t) { prog.textContent = t; }, dialog: StagePref.get().dialog, voiceClip: voiceClip, needGood: needGood, clipWait: function () { return AudioPref.get().voice === 'ai' ? 10000 : 2500; } });
    player.setProject(function () { return W && W.project || ''; });   // gói âm theo dự án của tác phẩm đang mở (v0.18)
    var onCast = function () { if (alive) paintDub(); };   // kết quả cast mới (dàn vượt 48 người → dòng báo ở Lồng tiếng)
    AiVoice.onCast = onCast;
    onLeave(function () { alive = false; player.destroy(); if (AiVoice.onCast === onCast) AiVoice.onCast = null; });   // phản hồi đến sau khi rời trang thì bỏ qua (không dựng diễn viên mồ côi)
    if (AiVoice.on()) AiVoice.load(true).then(function () { if (alive) paintDub(); });

    // NGÔN NGỮ PHIM (lưu trong tác phẩm: lang + accent) — giọng máy đọc, giọng AI và Lồng tiếng AI đọc theo ngôn ngữ này; lời thoại phải viết đúng ngôn ngữ đã chọn
    var langSel = h('select', { 'aria-label': 'Ngôn ngữ phim', title: 'Ngôn ngữ + giọng vùng của phim: giọng máy đọc, giọng AI và Lồng tiếng AI đọc theo đây. Lời thoại phải viết đúng ngôn ngữ đã chọn.', onchange: function () { saveLang(langSel.value); } });
    GC.voices.langList().forEach(function (l) { l.accents.forEach(function (ac) { langSel.appendChild(h('option', { value: l.id + '|' + ac.id, text: 'Ngôn ngữ: ' + l.label + ' · ' + ac.label })); }); });
    var langNote = h('span', { class: 'note', text: LANG_NOTE });
    // LỒNG TIẾNG AI: đọc lần lượt mọi câu bằng giọng AI Google và lưu lại (câu đã đọc thì nhanh, không tốn lại)
    var dubB = h('button', { class: 'btn sm primary', onclick: function () { if (dubbing) dubCancel = true; else startDub(); } }, 'Lồng tiếng AI'), dubNote = h('span', { class: 'note' });
    var dubBox = h('div', { class: 'readybar dubbar', hidden: true }), dubbing = false, dubCancel = false, dubSt = null;
    var castNote = h('div', { class: 'note warn', role: 'status', hidden: true });   // "N diễn viên vượt 48 chưa có giọng AI"
    var exportBox = h('div', { class: 'stack', style: 'gap:6px', hidden: true }), exportBusy = false;   // hộp "còn N/M câu chưa có giọng AI" khi bấm Phim (HTML)
    // GIỌNG VÙNG THẬT (Q14): Google chỉ cho giọng Bắc / Trung / Nam, Đài Loan… đúng chất qua "Thiết kế giọng" từng vai — bấm tay, báo trước số lượt
    var regionNote = h('span', { class: 'note', role: 'status', title: 'Google chỉ cho giọng vùng thật khi Thiết kế giọng từng vai (mỗi vai 1 lượt, ~25 giây). Giọng có sẵn / thư viện tiếng Việt đọc giọng chung — không phân Bắc / Trung / Nam. Anh Mỹ / Anh Anh có thư viện riêng.' });
    var regionB = h('button', { class: 'btn sm', onclick: function () { designAsk = true; paintRegion(); var go1 = regionBox.querySelector('button.primary'); if (go1) go1.focus(); } }, 'Thiết kế giọng vùng cho các vai');
    var regionBox = h('div', { class: 'stack', style: 'gap:6px', hidden: true }), designing = false, designCancel = false, designSt = null, designAsk = false;

    var langSel2 = h('select', { 'aria-label': 'Ngôn ngữ lời thoại', title: 'Ngôn ngữ + giọng vùng của phim — lời thoại phải viết đúng ngôn ngữ đã chọn', onchange: function () { saveLang(langSel2.value); } });
    GC.voices.langList().forEach(function (l) { l.accents.forEach(function (ac) { langSel2.appendChild(h('option', { value: l.id + '|' + ac.id, text: l.label + ' · ' + ac.label })); }); });
    var langNote2 = h('span', { class: 'note', text: LANG_NOTE });
    var castBox = h('div'), headBox = h('div', { class: 'roomhead' }), reviewList = h('div', { class: 'stack' }), voiceBox = h('div', { class: 'stack' }), soundBox = h('div', { class: 'stack' });
    var allNote = h('textarea', { rows: 2, maxlength: 600, 'aria-label': 'Ghi chú chung khi duyệt phim', placeholder: 'Ghi chú chung cho cả phim (nhịp, giọng, âm thanh…) — AI đọc được qua get_work › review.note', onblur: function () { if (W && allNote.value.trim() !== ((W.review && W.review.note) || '')) saveReviewNote(); } });
    var sumBadge = h('span', { class: 'chip', role: 'status' });
    function nameOfActor(id) { var a = (W && AiVoice.actorsOf(W).filter(function (x) { return x.id === id; })[0]) || null; return a ? a.name : id; }
    function dockWork() {
      if (!W) return;
      if (window.GCDock) { window.GCDock.workChanged(W); window.GCDock.ctx({ object: { kind: 'work', id: W.id, label: W.title }, tab: tab, tabLabel: WORK_TABS.filter(function (t) { return t[0] === tab; })[0][1], shot: curShot, shotLabel: shotLabelOf(curShot) }); }
    }
    function shotLabelOf(id) { var i = W ? W.shots.findIndex(function (s) { return s.id === id; }) : -1; return i >= 0 ? 'Cảnh ' + (i + 1) : ''; }
    function setShot(id) { if (curShot === id) return; curShot = id; route.shot = id; saveRoute(); dockWork(); Array.prototype.forEach.call(document.querySelectorAll('.shot.sel'), function (e) { e.classList.remove('sel'); }); var e = document.getElementById('shot-' + id); if (e) e.classList.add('sel'); }

    /* -- tab bar -- */
    var tabbar = h('div', { class: 'tabs roomtabs', role: 'tablist', 'aria-label': 'Các phần của tác phẩm' });
    WORK_TABS.forEach(function (t, i) {
      var b = h('button', { role: 'tab', id: 'wtab-' + t[0], 'data-tab': t[0], 'aria-selected': 'false', 'aria-controls': 'wpanel-' + t[0], tabindex: '-1', onclick: function () { setTab(t[0]); },
        onkeydown: function (ev) {
          var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          ev.preventDefault(); var n = WORK_TABS[(i + d + WORK_TABS.length) % WORK_TABS.length][0]; setTab(n); tabBtns[n].focus();
        } }, t[1], h('span', { class: 'n' }));
      tabBtns[t[0]] = b; tabbar.appendChild(b);
    });
    function setTab(t) {
      tab = t; route.tab = t; saveRoute();
      WORK_TABS.forEach(function (x) { var on = x[0] === t; tabBtns[x[0]].setAttribute('aria-selected', String(on)); tabBtns[x[0]].tabIndex = on ? 0 : -1; panels[x[0]].hidden = !on; });
      setHash(workHash(r.work, t, t === 'shots' && curShot ? curShot : ''));
      dockWork();
      if (t !== 'review') player.stop();   // rời tab Xem & duyệt: dừng phim (sân khấu đã ẩn)
    }
    function paintTabs() {
      if (!W) return;
      var ok = W.shots.filter(function (s) { return rvOf(s.id).status === 'ok'; }).length, np = (W.proposals || []).length;
      tabBtns.shots.lastChild.textContent = W.shots.length + (np ? ' · ' + np + ' đề xuất' : '');
      tabBtns.review.lastChild.textContent = W.shots.length ? ok + '/' + W.shots.length : '';
      tabBtns.script.lastChild.textContent = ''; tabBtns.voice.lastChild.textContent = ''; tabBtns.publish.lastChild.textContent = '';
    }
    /* -- duyệt -- */
    function rvOf(sid) { return (W && W.review && W.review.shots && W.review.shots[sid]) || { status: 'draft', notes: [] }; }
    function saveReviewShot(sid, rec) {
      var body = { id: W.id, review: { shots: {} } };
      body.review.shots[sid] = rec;
      return Store.api('POST', 'api/works', body).then(function (w) { W = w; soundWarn = w.warnings || soundWarn; dockWork(); paintHead(); paintTabs(); paintReview(); paintReady(); return w; })
        .catch(function (e) { toast(e.message + (e.errors && e.errors.length ? ' — ' + e.errors.slice(0, 2).join('; ') : '')); throw e; });
    }
    function saveReviewNote() {
      Store.api('POST', 'api/works', { id: W.id, review: { note: allNote.value.trim() } }).then(function (w) { W = w; dockWork(); toast('Đã lưu ghi chú chung.'); }).catch(function (e) { toast(e.message); });
    }
    function cleanNotes(list) { return list.map(function (n) { var o = { id: n.id, text: n.text }; if (n.step) o.step = n.step; return o; }); }

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

    function loadWork(id, quiet) {
      return Store.api('GET', 'api/works/' + id).then(function (w) {
        if (!alive) return;
        if (!W || W.id !== w.id) { drafts = {}; draftScript = null; closeExport(); }
        W = w; route.work = w.id; dockWork();
        crumbs([{ t: 'Tác phẩm', go: { page: 'works' } }, { t: w.title }]);
        paint();
      }).catch(function (e) { toast(e.message); if (!quiet) { setHash(''); go({ page: 'works' }); } });
    }
    function saveScript() {
      if (!W) return;
      Store.api('POST', 'api/works', { id: W.id, logline: logline.value, script: script.value }).then(function () { draftScript = null; toast('Đã lưu kịch bản.'); loadWork(W.id); }).catch(function (e) { toast(e.message); });
    }
    function saveShot(body) {
      if (!W) { toast('Tạo tác phẩm trước.'); return Promise.reject(); }
      return Store.api('POST', 'api/works/' + W.id + '/shots', body).then(function (w) { if (body.shot && body.shot.id) delete drafts[body.shot.id]; if (!alive) return w; W = w; soundWarn = w.warnings || []; dockWork(); paint(); return w; }).catch(function (e) { toast(e.message); throw e; });
    }

    // ---- ngôn ngữ phim + Lồng tiếng AI ----
    function syncLang() {
      var L = workLang(W);
      langSel.value = L.lang + '|' + L.accent;
      langNote.textContent = LANG_HINT[L.lang] || LANG_NOTE; langNote.className = 'note' + (LANG_HINT[L.lang] ? ' warn' : '');
      langSel2.value = L.lang + '|' + L.accent; langNote2.textContent = langNote.textContent; langNote2.className = langNote.className;
      player.setLang(L.lang, L.accent);
      paintRegion();
    }
    function saveLang(v) {
      if (!W) { syncLang(); return; }
      var p = v.split('|'), w0 = W, prev = { lang: w0.lang, accent: w0.accent };
      w0.lang = p[0]; w0.accent = p[1]; designAsk = false; closeExport(); syncLang();
      if (!dubbing) { dubSt = null; paintDub(); }
      Store.api('POST', 'api/works', { id: w0.id, lang: p[0], accent: p[1] })
        .then(function () { if (alive) toast('Phim đọc bằng ' + langSel.options[langSel.selectedIndex].text.replace('Ngôn ngữ: ', '') + '.'); })
        .catch(function (e) { w0.lang = prev.lang; w0.accent = prev.accent; if (alive && W === w0) { syncLang(); paintDub(); } toast(e.message); });
    }
    // đầu câu báo DỪNG vì 429: trần câu / ngày của máy · Google giới hạn mỗi phút (đã chờ đủ 10 lần) · hết lượt hôm nay
    function quotaHead(st) {
      if (st.cap) return 'Dừng vì chạm trần câu / ngày (Cài đặt AI)' + (st.retryAt ? ' — đọc tiếp lúc ' + clockOf(st.retryAt) : '');
      return AiVoice.quotaText({ retryAt: st.retryAt, minute: !!st.minute }) + (st.minute && st.waits ? ' (đã chờ ' + st.waits + ' lần)' : '');
    }
    function dubSummary(st) {
      var mix = st.fresh + ' mới · ' + st.cached + ' có sẵn' + (st.failed ? ' · ' + st.failed + ' lỗi' : '');
      if (!st.end) return (st.waitAt ? 'Google giới hạn mỗi phút — tự lồng tiếp lúc ' + clockSec(st.waitAt) + ' · ' : '') + mix;
      if (st.end === 'quota') return quotaHead(st) + ' · đã lồng ' + st.done + '/' + st.total + ' câu (' + mix + ')';
      if (st.end === 'nokey') return 'Dừng: ' + st.error + ' · đã lồng ' + st.done + '/' + st.total + ' câu';
      if (st.end === 'cancel') return 'Đã dừng · đã lồng ' + st.done + '/' + st.total + ' câu (' + mix + ')';
      if (st.end === 'err') return 'Lỗi: ' + st.error;
      return st.total ? 'Xong ' + st.done + '/' + st.total + ' câu (' + mix + ')' + (st.failed ? ' — ' + st.error : '') : 'Chưa có câu thoại nào sẵn sàng để lồng tiếng.';
    }
    function paintDub() {
      var ready = AiVoice.ready();
      dubB.textContent = dubbing ? 'Dừng lồng tiếng' : 'Lồng tiếng AI';
      dubB.disabled = !dubbing && (!ready || !W || designing);
      dubB.title = ready ? 'Đọc từng câu của phim bằng giọng AI Google rồi lưu lại. Câu đã đọc không tốn lại; gói miễn phí chỉ có vài chục lượt mỗi ngày — hết lượt thì dừng, lần sau bấm lại sẽ đọc tiếp.' : 'Cần key Google ở Cài đặt AI › Giọng AI';
      clear(dubNote);
      if (!ready && !dubbing) {
        if (AiVoice.cfg) dubNote.appendChild(h('span', { text: (AiVoice.cfg.hasKey ? 'Giọng AI đang tắt · ' : 'Chưa có key Google · ') }));
        dubNote.appendChild(h('button', { class: 'btn sm', onclick: function () { go({ page: 'ai', focus: 'voice' }); } }, 'Dán key ở Cài đặt AI ›'));
      } else dubNote.appendChild(h('span', { text: 'câu chưa đọc tốn lượt Google; câu đã đọc thì miễn phí' }));
      var miss = W ? AiVoice.missingFor(W, workLang(W)) : [];   // server chỉ chọn giọng cho 48 diễn viên đầu; người thừa đọc bằng giọng máy
      castNote.hidden = !miss.length; castNote.textContent = miss.length ? miss.length + ' diễn viên vượt ' + CAST_MAX + ' chưa có giọng AI — câu của họ dùng giọng máy đọc.' : '';
      clear(dubBox); dubBox.hidden = !dubSt;
      if (dubSt) {
        var st = dubSt, n = st.done + st.failed;
        dubBox.appendChild(h('span', { class: 'meter', role: 'progressbar', 'aria-label': 'Tiến độ lồng tiếng AI', 'aria-valuemin': '0', 'aria-valuemax': String(st.total), 'aria-valuenow': String(n) },
          h('i', { style: 'width:' + (st.total ? Math.round(n / st.total * 100) : 0) + '%' })));
        dubBox.appendChild(h('b', { text: 'Lồng tiếng AI ' + n + '/' + st.total }));
        dubBox.appendChild(h('span', { class: 'note', 'aria-live': st.end || st.waitAt ? 'polite' : 'off', text: dubSummary(st) }));
      }
      paintRegion();
    }
    // ---- giọng vùng thật: đếm vai đã thiết kế + thiết kế hàng loạt (tuần tự, xác nhận trong trang, dừng ngay ở 429) ----
    function designSecs(n) { var s = n * 25; return s < 90 ? '~' + s + ' giây' : '~' + Math.round(s / 60) + ' phút'; }
    function accentLabel(L) { var l = GC.voices.langList().filter(function (x) { return x.id === L.lang; })[0], a = l && l.accents.filter(function (x) { return x.id === L.accent; })[0]; return l ? l.label + ' · ' + (a ? a.label : L.accent) : L.lang; }
    function designSummary(st) {
      var left = ' · đã thiết kế ' + st.done + '/' + st.total + ' vai' + (st.failed ? ' · ' + st.failed + ' lỗi' : '');
      if (!st.end) return 'đang thiết kế ' + st.cur + ' (~25 s mỗi vai, tốn 1 lượt)…' + (st.failed ? ' · ' + st.failed + ' lỗi' : '');
      if (st.end === 'quota') return quotaHead(st) + left;
      if (st.end === 'nokey') return 'Dừng: ' + st.error + left;
      if (st.end === 'cancel') return 'Đã dừng' + left;
      return 'Xong' + left + (st.failed ? ' — ' + st.error : '') + ' · đã chọn lại giọng cả dàn';
    }
    function paintRegion() {
      var L = workLang(W), cfg = AiVoice.cfg, ready = AiVoice.ready(), jobs = W && cfg ? AiVoice.regionOf(W, L) : [], todo = jobs.filter(function (j) { return !j.done; });
      regionNote.textContent = !W ? '' : !cfg ? 'đang đọc trạng thái giọng AI…'
        : !jobs.length ? 'chưa có vai nào để thiết kế giọng vùng (tác phẩm chưa có diễn viên, hoặc chỉ có vai trẻ em — Google chặn thiết kế giọng trẻ em)'
        : 'giọng vùng có ở ' + (jobs.length - todo.length) + '/' + jobs.length + ' vai (đã thiết kế) · vai chưa thiết kế đọc giọng chung của ngôn ngữ';
      regionB.disabled = !W || designing || dubbing || !ready || !todo.length;
      regionB.title = !ready ? 'Cần key Google ở Cài đặt AI › Giọng AI' : !jobs.length ? 'Tác phẩm chưa có vai nào thiết kế được'
        : !todo.length ? 'Mọi vai trong phim đã có giọng thiết kế cho ' + accentLabel(L)
        : 'Thiết kế giọng ' + accentLabel(L) + ' cho ' + todo.length + ' vai chưa có: tốn ' + todo.length + ' lượt Google, ~25 giây mỗi vai. Bấm xong sẽ hỏi lại trước khi chạy.';
      clear(regionBox); regionBox.hidden = true;
      if (!W) return;
      if (designAsk && !designing && todo.length) {   // hộp xác nhận TRONG TRANG: nói rõ số lượt + thời gian trước khi tốn
        regionBox.hidden = false;
        var left = cfg && cfg.dailyCap > 0 ? cfg.dailyCap - (cfg.today || 0) : null;   // thiết kế cũng tính vào trần câu / ngày của máy chủ
        regionBox.appendChild(h('div', { class: 'banner warn', role: 'group', 'aria-label': 'Xác nhận thiết kế giọng vùng', style: 'flex-wrap:wrap' },
          h('span', { style: 'flex:1 1 320px', text: 'Sẽ thiết kế giọng ' + accentLabel(L) + ' cho ' + todo.length + ' vai (' + todo.map(function (j) { return GC.voices.ROLES[j.role].label; }).join(', ') + ') — ≈ ' + todo.length + ' lượt Google, ~25 s mỗi vai (cả loạt ' + designSecs(todo.length) + '). Chạy lần lượt từng vai, dừng ngay khi hết lượt; xong thì chọn lại giọng cả dàn. Vai trẻ em không thiết kế được nên không tính.' + (left !== null && left < todo.length ? ' Trần câu / ngày còn ' + Math.max(0, left) + ' lượt (Cài đặt AI) — chạy tới đó sẽ dừng.' : '') }),
          h('button', { class: 'btn sm primary', onclick: startDesign }, 'Bắt đầu thiết kế ' + todo.length + ' vai'),
          h('button', { class: 'btn sm', onclick: function () { designAsk = false; paintRegion(); regionB.focus(); } }, 'Huỷ')));
      } else if (designSt && designSt.work === W.id && designSt.lang === L.lang + '|' + L.accent) {
        var st = designSt, n = st.done + st.failed;
        regionBox.hidden = false;
        regionBox.appendChild(h('div', { class: 'readybar dubbar' },
          h('span', { class: 'meter', role: 'progressbar', 'aria-label': 'Tiến độ thiết kế giọng vùng', 'aria-valuemin': '0', 'aria-valuemax': String(st.total), 'aria-valuenow': String(n) }, h('i', { style: 'width:' + (st.total ? Math.round(n / st.total * 100) : 0) + '%' })),
          h('b', { text: 'Thiết kế giọng vùng ' + n + '/' + st.total }),
          designing ? h('button', { class: 'btn sm', disabled: designCancel, onclick: function () { designCancel = true; paintRegion(); } }, designCancel ? 'Đang dừng…' : 'Dừng thiết kế') : null,
          h('span', { class: 'note', 'aria-live': st.end ? 'polite' : 'off', text: designSummary(st) })));
      }
    }
    function startDesign() {
      if (!W || designing || dubbing || !AiVoice.ready()) return;
      var w0 = W, L = workLang(W), jobs = AiVoice.regionOf(w0, L).filter(function (j) { return !j.done; }), i = 0;
      if (!jobs.length) { designAsk = false; paintRegion(); return; }
      designAsk = false; designing = true; designCancel = false;
      designSt = { work: w0.id, lang: L.lang + '|' + L.accent, total: jobs.length, done: 0, failed: 0, stop: null, cap: false, retryAt: null, error: '', cur: '', end: '' };
      paintDub();
      (function next() {   // tuần tự: mỗi lần MỘT vai (~25 s), không song song — để dừng đúng ở 429 và không đốt lượt thừa
        if (designCancel || !alive || i >= jobs.length) return Promise.resolve();
        var j = jobs[i++];
        designSt.cur = GC.voices.ROLES[j.role].label; if (alive) paintRegion();
        return Store.api('POST', 'api/voice/design', { role: j.role, lang: L.lang, accent: j.accent }).then(function (x) {
          var c = AiVoice.cfg; if (c) { c.designs = c.designs || {}; c.designs[j.key] = { voice: x.voice, at: new Date().toISOString() }; }
          designSt.done++;
        }, function (e) {
          if (e.status === 429 || e.status === 409) { designSt.stop = e.status; designSt.retryAt = e.retryAt || null; designSt.cap = !!e.cap; designSt.minute = AiVoice.isMinute(e); designSt.error = e.message; i = jobs.length; return; }
          designSt.failed++; designSt.error = e.message;   // lỗi một vai (vd. Google chặn): ghi lại, làm tiếp các vai sau
        }).then(function () { if (alive) paintRegion(); return next(); });
      })().then(function () {
        var st = designSt;
        st.end = st.stop === 429 ? 'quota' : st.stop === 409 ? 'nokey' : designCancel ? 'cancel' : 'done';
        AiVoice.casts = {}; AiVoice.libs = {};   // phim dùng ngay giọng đã thiết kế
        if (alive) {
          if (st.end === 'quota') toast(AiVoice.quotaText({ cap: st.cap, retryAt: st.retryAt, minute: st.minute }) + '. Đã thiết kế ' + st.done + '/' + st.total + ' vai.');
          else if (st.end === 'nokey') toast(st.error + ' — mở Cài đặt AI › Giọng AI.');
          else if (st.end === 'done') toast('Đã thiết kế giọng vùng cho ' + st.done + '/' + st.total + ' vai.' + (st.failed ? ' ' + st.failed + ' vai lỗi.' : ''));
        }
        // xong (hoặc dừng giữa chừng): đọc lại danh sách giọng đã thiết kế từ máy chủ rồi cast lại cả dàn (server chốt giọng mới vào tác phẩm)
        return AiVoice.load(true).then(function () { return st.done ? AiVoice.castOf(w0, L.lang, L.accent) : null; }).catch(function () { /* cast lại là phần thêm: lần phát sau sẽ cast */ });
      }).catch(function (e) { designSt = { work: w0.id, lang: L.lang + '|' + L.accent, total: jobs.length, done: 0, failed: 0, stop: null, cap: false, retryAt: null, error: e.message, cur: '', end: 'nokey' }; if (alive) toast(e.message); })
        .then(function () { designing = false; if (alive) paintDub(); });
    }
    // → Promise<st | null>: st.end = done | quota | nokey | cancel | err (null = chưa bắt đầu được: không có tác phẩm / đang lồng / đang thiết kế / chưa có key)
    function startDub() {
      if (!W || dubbing || designing || !AiVoice.ready()) return Promise.resolve(null);
      var w0 = W, L = workLang(W);
      closeExport();
      dubbing = true; dubCancel = false; dubSt = { total: 0, done: 0, fresh: 0, cached: 0, failed: 0 }; paintDub();
      return AiVoice.dub(w0, L, { cancelled: function () { return dubCancel || !alive; }, progress: function (st) { dubSt = st; if (alive) paintDub(); } })
        .then(function (st) {
          st.end = st.stop === 429 ? 'quota' : st.stop === 409 ? 'nokey' : dubCancel ? 'cancel' : 'done';
          dubSt = st;
          if (!alive) return st;
          if (st.end === 'nokey') { toast(st.error + ' — mở Cài đặt AI › Giọng AI.'); go({ page: 'ai', focus: 'voice' }); }
          else if (st.end === 'quota') toast(AiVoice.quotaText({ cap: st.cap, retryAt: st.retryAt, minute: st.minute }) + '. Đã lồng ' + st.done + '/' + st.total + ' câu.');
          else if (st.end === 'done') toast('Đã lồng tiếng AI ' + st.done + '/' + st.total + ' câu.');
          return st;
        })
        .catch(function (e) { dubSt = { total: 0, done: 0, fresh: 0, cached: 0, failed: 0, end: 'err', error: e.message }; if (alive) toast(e.message); return dubSt; })
        .then(function (st) { dubbing = false; if (alive) paintDub(); return st; });
    }
    // ---- xuất phim: còn câu chưa có giọng AI (mà Giọng AI đã sẵn sàng) thì hỏi trước — lồng tiếng rồi xuất · xuất luôn · huỷ. Chưa sẵn sàng thì xuất như cũ ----
    function closeExport() { clear(exportBox); exportBox.hidden = true; }
    function exportClick() {
      if (!W || exportBusy) return;
      var w0 = W, L = workLang(W);
      closeExport();
      if (dubbing) { toast('Đang lồng tiếng AI — chờ xong (hoặc bấm Dừng lồng tiếng) rồi xuất phim.'); return; }
      if (!AiVoice.on() || !AiVoice.ready()) { exportFilm(w0); return; }
      exportBusy = true;
      filmVoices(w0, L).then(function (vo) {   // hỏi "dry" các clip đã có (không tốn lượt) — chính kết quả này được dùng để xuất, khỏi hỏi lại
        exportBusy = false;
        if (!alive || !W || W.id !== w0.id) return;   // đã đổi tác phẩm trong lúc hỏi: bỏ, không hiện hộp của tác phẩm cũ
        if (!vo.total || vo.have >= vo.total) exportFilm(w0, vo); else askExport(w0, vo);
      });
    }
    function askExport(w0, vo) {
      exportBox.hidden = false;
      var go1 = h('button', { class: 'btn sm primary', title: 'Đọc các câu còn thiếu bằng giọng AI (tốn lượt Google; hết lượt thì dừng) rồi tự xuất phim', onclick: function () { dubThenExport(w0); } }, 'Lồng tiếng rồi xuất');
      exportBox.appendChild(h('div', { class: 'banner warn', role: 'group', 'aria-label': 'Xác nhận xuất phim thiếu giọng AI', style: 'flex-wrap:wrap' },
        h('span', { style: 'flex:1 1 320px', text: 'Còn ' + (vo.total - vo.have) + '/' + vo.total + ' câu chưa có giọng AI — câu thiếu sẽ đọc bằng giọng máy / blip.' }),
        go1,
        h('button', { class: 'btn sm', onclick: function () { closeExport(); if (W && W.id === w0.id) exportFilm(W); } }, 'Xuất luôn'),   // tính lại lúc bấm (dry, không tốn lượt): hộp có thể đã mở lâu — vừa lồng thêm, đổi ngôn ngữ, sửa kịch bản
        h('button', { class: 'btn sm', onclick: function () { closeExport(); } }, 'Huỷ')));
      go1.focus();
    }
    // lồng tiếng như nút Lồng tiếng AI, xong (hoặc dừng vì hết lượt) thì tự xuất; bấm Dừng lồng tiếng = không xuất (người dùng đổi ý); thiếu key / lỗi thì không xuất
    function dubThenExport(w0) {
      closeExport();
      if (!W || W.id !== w0.id) return;
      if (dubbing || designing) { toast(dubbing ? 'Đang lồng tiếng AI — chờ xong rồi xuất phim.' : 'Đang thiết kế giọng vùng — chờ xong rồi xuất phim.'); return; }
      startDub().then(function (st) {
        if (!st || !alive || !W || W.id !== w0.id) return;
        if (st.end === 'cancel') { toast('Đã dừng lồng tiếng — chưa xuất phim.'); return; }
        if (st.end === 'nokey' || st.end === 'err') return;   // startDub đã báo lỗi / mở Cài đặt AI
        exportFilm(W);
      });
    }

    /* ---- dữ liệu dựng giao diện ---- */
    function paintHead() {
      clear(headBox);
      if (!W) return;
      var ok = W.shots.filter(function (s) { return rvOf(s.id).status === 'ok'; }).length, st = W.stats || {}, L = workLang(W);
      headBox.appendChild(h('h2', { class: 'rt', text: W.title }));
      headBox.appendChild(h('span', { class: 'mono note', text: W.id }));
      if (W.project) headBox.appendChild(h('button', { class: 'tag proj', title: 'Mở dự án này ở Thư viện', onclick: function () { go({ page: 'projects', project: W.project }); } }, Projects.name(W.project)));
      headBox.appendChild(h('span', { class: 'chip', title: 'Ngôn ngữ phim', text: accentLabel(L) }));
      headBox.appendChild(h('span', { class: 'sp' }));
      headBox.appendChild(h('span', { class: 'mono note', text: W.shots.length + ' cảnh' }));
      headBox.appendChild(h('span', { class: 'chip ' + (W.shots.length && ok === W.shots.length ? 'ok' : ''), title: 'Số cảnh đã duyệt "Đạt" / tổng số cảnh', text: 'Đạt ' + ok + '/' + W.shots.length }));
      if (st.voiceTotal) headBox.appendChild(h('span', { class: 'chip ' + (st.voiceDone === st.voiceTotal ? 'ok' : ''), title: 'Câu thoại đã lồng tiếng AI / tổng số câu', text: 'Giọng AI ' + st.voiceDone + '/' + st.voiceTotal }));
    }
    var stillCache = {};   // ảnh khung đầu dựng MỘT lần mỗi lần vẽ phòng (thẻ phân cảnh + hàng duyệt dùng chung) — L-42
    function stillOf(s) { var u = stillCache[s.id]; if (u === undefined) u = stillCache[s.id] = stillURL(s); return u ? h('img', { class: 'still', src: u, alt: 'Khung đầu của ' + s.title, loading: 'lazy' }) : h('div', { class: 'still none note', text: 'chưa có bối cảnh' }); }
    function paintCast() {
      clear(castBox);
      var acts = AiVoice.actorsOf(W), chosen = (W.voices || {})[workLang(W).lang + '|' + workLang(W).accent] || {};
      if (!acts.length) { castBox.appendChild(h('div', { class: 'pad note', text: 'Chưa có diễn viên — chọn diễn viên trong từng phân cảnh (tab Phân cảnh) hoặc nhờ AI đạo diễn.' })); return; }
      var t = h('table', { class: 'grid' }), hd = h('tr');
      ['Nhân vật', 'Vai giọng', 'Cảnh', 'Câu thoại', 'Giọng AI đã chốt'].forEach(function (c) { hd.appendChild(h('th', { text: c })); });
      t.appendChild(hd);
      acts.forEach(function (a) {
        var nShot = W.shots.filter(function (s) { return (s.cast || []).some(function (k) { return GC.canon(k) === a.key; }); }).length;
        var nLine = W.shots.reduce(function (n, s) { return n + ((s.event && s.event.steps) || []).filter(function (st) { return st.actor === a.id && String(st.say || '').trim(); }).length; }, 0);
        var av = h('div', { class: 'av', style: '--own:' + ownOf(a) });
        var tr = h('tr', anc({ class: 'click', onclick: function () { go({ page: 'lib-characters', key: a.key }); } }, 'asset:' + a.key, a.name),
          h('td', null, h('div', { class: 'row', style: 'flex-wrap:nowrap' }, av, h('div', null, h('b', { text: a.name }), h('div', { class: 'note mono', text: a.key })))),
          h('td', { text: GC.voices.ROLES[AiVoice.roleOf(a)].label }), h('td', { class: 'v num', text: String(nShot) }), h('td', { class: 'v num', text: String(nLine) }),
          h('td', { class: 'mono' }, chosen[a.id] ? chosen[a.id] : h('span', { class: 'muted', text: 'chưa chốt' })));
        t.appendChild(tr);
        R.image(av, a, 'normal', { crop: true, noShadow: true });
      });
      castBox.appendChild(h('div', { class: 'scroll' }, t));
    }
    function proposalBox(p, s) {
      var steps = (s.event && s.event.steps) || [], box = h('div', { class: 'diff', role: 'group', 'aria-label': 'Đề xuất sửa của AI cho ' + s.title }), body = h('div', { class: 'diffbody' });
      if (p.field === 'description') {
        var cur = s.description || '', nu = p.value || '', ops = seqDiff(words(cur), words(nu)), a = words(cur), b = words(nu);
        ops.forEach(function (o) { body.appendChild(h('span', { class: 'd-' + o[0], text: o[0] === 'ins' ? b[o[2]] : a[o[1]] })); });
        if (!cur && !nu) body.appendChild(h('span', { class: 'note', text: '(trống)' }));
      } else {
        var A = steps.map(function (st) { return stepLine(st, nameOfActor); }), Bn = (p.value || []).map(function (st) { return stepLine(st, nameOfActor); });
        seqDiff(A, Bn).forEach(function (o) { body.appendChild(h('div', { class: 'd-row d-' + o[0] }, h('span', { class: 'sg', 'aria-hidden': 'true', text: o[0] === 'ins' ? '+' : o[0] === 'del' ? '−' : ' ' }), h('span', { text: o[0] === 'ins' ? Bn[o[2]] : A[o[1]] }))); });
      }
      var nIns = 0, nDel = 0;
      if (p.field === 'steps') { var sd = seqDiff(steps.map(function (st) { return stepLine(st, nameOfActor); }), (p.value || []).map(function (st) { return stepLine(st, nameOfActor); })); sd.forEach(function (o) { if (o[0] === 'ins') nIns++; else if (o[0] === 'del') nDel++; }); }
      var apply = h('button', { class: 'btn sm primary', 'data-prop': p.id + ':apply', onclick: function () { resolve('apply'); } }, 'Áp dụng'), drop = h('button', { class: 'btn sm', 'data-prop': p.id + ':dismiss', onclick: function () { resolve('dismiss'); } }, 'Bỏ');
      function resolve(action) {
        apply.disabled = drop.disabled = true;
        Store.api('POST', 'api/works/' + W.id + '/proposals', { id: p.id, action: action }).then(function (w) {
          delete propErr[p.id]; W = w; dockWork(); toast(action === 'apply' ? 'Đã áp dụng đề xuất cho ' + s.title + '.' : 'Đã bỏ đề xuất.');
          if (action === 'apply') delete drafts[s.id];
          paint();
        }).catch(function (e) { apply.disabled = drop.disabled = false; propErr[p.id] = e.message + (e.errors && e.errors.length ? ' — ' + e.errors.slice(0, 2).join('; ') : ''); paintShots(); });
      }
      box.appendChild(h('div', { class: 'diffhead' }, h('b', { text: 'AI đề xuất sửa ' + (p.field === 'description' ? 'mô tả' : 'danh sách bước') }), h('span', { class: 'note', text: p.field === 'steps' ? '+' + nIns + ' −' + nDel : '' }), h('span', { class: 'sp' }), apply, drop));
      if (p.note) box.appendChild(h('div', { class: 'note', text: 'Lý do: ' + p.note }));
      box.appendChild(body);
      if (propErr[p.id]) box.appendChild(h('div', { class: 'note warn', role: 'alert', text: '✗ Chưa áp dụng được: ' + propErr[p.id] }));
      return box;
    }
    function shotCard(s, i, chars, scenes) {
      var dr = drafts[s.id] || (drafts[s.id] = null), keep = function () { drafts[s.id] = { title: t.value, description: d.value, scene: sc.value, cast: cast.slice() }; };
      var t = h('input', { type: 'text', 'aria-label': 'Tên phân cảnh ' + (i + 1), value: dr ? dr.title : s.title, maxlength: 80, oninput: function () { keep(); } }), d = h('textarea', { rows: 2, maxlength: 1000, 'aria-label': 'Mô tả phân cảnh ' + (i + 1), placeholder: 'Mô tả phân cảnh', oninput: function () { keep(); } }); d.value = dr ? dr.description : s.description || '';
      var sc = h('select', { 'aria-label': 'Bối cảnh' }); sc.appendChild(h('option', { value: '', text: '— bối cảnh —' }));
      scenes.forEach(function (x) { sc.appendChild(h('option', { value: x.key, text: x.name + (x.project ? ' · ' + Projects.name(x.project) : '') })); });
      sc.value = GC.canon(dr ? dr.scene : s.scene || ''); sc.onchange = keep;   // phân cảnh cũ trỏ afi.* vẫn chọn đúng (không âm thầm thành "không bối cảnh")
      var cast = (dr ? dr.cast : s.cast || []).map(GC.canon), cb = h('div', { class: 'fxchips', role: 'group', 'aria-label': 'Dàn diễn viên' });
      chars.forEach(function (a) {
        var b = h('button', { 'aria-pressed': String(cast.indexOf(a.key) >= 0), onclick: function () {
          var j = cast.indexOf(a.key); if (j >= 0) cast.splice(j, 1); else if (cast.length < 8) cast.push(a.key); else { toast('Tối đa 8 diễn viên một cảnh.'); return; }
          b.setAttribute('aria-pressed', String(j < 0)); keep();
        } }, a.name);
        cb.appendChild(b);
      });
      var steps = (s.event && s.event.steps) || [], miss = GC.film.issues(s), sec = steps.length ? shotSeconds(s) : 0;
      var st = s.event ? h('span', { class: 'tag acc', text: steps.length + ' bước thoại' }) : h('span', { class: 'tag', text: 'chưa có lời thoại' });
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
      // soạn tay từng bước (không cần AI) — dùng bản nháp đang gõ dở của phân cảnh (tên, mô tả, bối cảnh, dàn diễn viên)
      var stepB = h('button', { class: 'btn sm', title: 'Soạn từng bước bằng ô chọn: ai nói gì, biểu cảm, chỗ đứng, đòn đánh… — không cần AI', onclick: function () {
        var base = { title: t.value, description: d.value, scene: sc.value, cast: cast.slice() };
        var sh = stepSheet({ base: base, event: s.event, chars: chars,
          save: function (shot) { return saveShot({ shot: Object.assign({ id: s.id }, shot) }); },
          close: function () {} });   // đã lưu thì saveShot vẽ lại trang; đóng không lưu = bỏ thay đổi
        $('view').appendChild(sh.el); onLeave(sh.destroy);
        var f = sh.el.querySelector('select, input'); if (f) f.focus();
      } }, 'Bảng bước');
      var prev = h('div', { class: 'stepprev', hidden: !openSteps[s.id] });
      steps.forEach(function (stp, n) {
        prev.appendChild(h('div', anc({ class: 'sp-row' }, 'step:' + W.id + '/' + s.id + '/' + (n + 1), 'Bước ' + (n + 1) + ' · ' + s.title), h('span', { class: 'id mono', text: 'B' + String(n + 1).padStart(2, '0') }), h('span', { class: 'tx', text: stepLine(stp, nameOfActor) })));
      });
      if (!steps.length) prev.appendChild(h('div', { class: 'note', text: 'Chưa có bước nào — bấm "AI viết lời thoại" hoặc "Bảng bước".' }));
      var openB = h('button', { class: 'btn sm', 'aria-expanded': String(!!openSteps[s.id]), 'data-steps': s.id, onclick: function () { openSteps[s.id] = !openSteps[s.id]; prev.hidden = !openSteps[s.id]; openB.setAttribute('aria-expanded', String(!!openSteps[s.id])); openB.textContent = openSteps[s.id] ? 'Ẩn bước' : 'Xem bước'; } }, openSteps[s.id] ? 'Ẩn bước' : 'Xem bước');
      var pic = h('button', { class: 'shotpic', title: s.event ? 'Bấm để diễn thử cảnh này' : 'Chưa có lời thoại', 'aria-label': 'Diễn thử ' + s.title, onclick: function () { if (!miss.length) { setTab('review'); player.play([s], s.title); } else toast('Chưa diễn được: thiếu ' + miss.join(', ') + '.'); } }, stillOf(s));
      var card = h('div', anc({ class: 'shot' + (curShot === s.id ? ' sel' : ''), id: 'shot-' + s.id, onfocusin: function () { setShot(s.id); }, onclick: function () { setShot(s.id); } }, 'shot:' + W.id + '/' + s.id, 'Cảnh ' + (i + 1) + ' · ' + s.title),
        h('div', { class: 'shotleft' }, pic,
          h('div', { class: 'shotmeta' }, h('span', { class: 'tag', text: steps.length + ' bước' }), h('span', { class: 'tag', title: 'Thời lượng ước tính theo kế hoạch dàn dựng', text: steps.length ? secLabel(sec) : '—' }),
            miss.length ? h('span', { class: 'tag bad', title: 'Thiếu: ' + miss.join(', '), text: 'thiếu ' + miss.length }) : h('span', { class: 'tag ok', text: 'sẵn sàng' }))),
        h('div', { class: 'shotbody' },
          h('div', { class: 'shot-head' }, h('b', { class: 'stepn', text: String(i + 1) }), t, st,
            h('button', { class: 'btn sm ic', disabled: i ? null : '', title: 'Lên', 'aria-label': 'Đưa phân cảnh lên', onclick: function () { saveShot({ shot: { id: s.id }, position: i - 1 }); } }, '↑'),
            h('button', { class: 'btn sm ic', disabled: i < W.shots.length - 1 ? null : '', title: 'Xuống', 'aria-label': 'Đưa phân cảnh xuống', onclick: function () { saveShot({ shot: { id: s.id }, position: i + 1 }); } }, '↓'),
            h('button', { class: 'btn sm ic danger', title: 'Bỏ phân cảnh (bản cũ của tác phẩm vẫn được giữ)', 'aria-label': 'Bỏ phân cảnh', onclick: function () { if (window.confirm('Bỏ phân cảnh "' + s.title + '"?')) saveShot({ shot: { id: s.id }, remove: true }); } }, '✕')),
          d, h('div', { class: 'row' }, sc), cb,
          h('div', { class: 'shot-acts' },
            h('button', { class: 'btn sm primary', onclick: function () { saveShot({ shot: { id: s.id, title: t.value, description: d.value, scene: sc.value, cast: cast } }).then(function () { toast('Đã lưu ' + t.value); }); } }, 'Lưu'),
            stepB, aiB, openB,
            h('button', { class: 'btn sm', disabled: miss.length ? '' : null, title: miss.length ? 'Thiếu: ' + miss.join(', ') : 'Diễn thử cảnh này ở tab Xem & duyệt', onclick: function () { setTab('review'); player.play([s], s.title); } }, 'Diễn thử'),
            h('button', { class: 'btn sm', title: 'Ghim cảnh này vào Trợ lý AI rồi nhờ sửa', onclick: function () { if (window.GCDock) { window.GCDock.pin('shot:' + W.id + '/' + s.id, 'Cảnh ' + (i + 1) + ' · ' + s.title); window.GCDock.open(); } } }, 'Hỏi AI'),
            h('span', { class: 'sp' })),
          prev,
          (W.proposals || []).filter(function (p) { return p.shot === s.id; }).map(function (p) { return proposalBox(p, s); })));
      return card;
    }
    function paintShots() {
      clear(shotsBox);
      // diễn viên / bối cảnh của dự án tác phẩm lên trước, khung (ma-nơ-canh) xuống cuối
      var rank = function (x) { return groupOf(x) === 'frame' ? 2 : (W.project && x.project === W.project ? 0 : 1); };
      var byRank = function (a, b) { return rank(a) - rank(b); };
      var chars = GC.assets().slice().sort(byRank), scenes = GC.scenes().slice().sort(byRank);
      if (!GC.assets().some(function (a) { return groupOf(a) !== 'frame'; })) shotsBox.appendChild(h('div', { class: 'banner' },
        h('span', { text: 'Thư viện chưa có nhân vật nào — tạm diễn bằng ma-nơ-canh, hoặc tạo nhân vật ở Xưởng (hoặc nhờ AI đạo diễn tự tạo).' }),
        h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { go({ page: 'create', project: W.project || '' }); } }, 'Tạo ở Xưởng ›')));
      W.shots.forEach(function (s, i) { shotsBox.appendChild(shotCard(s, i, chars, scenes)); });
      if (!W.shots.length) shotsBox.appendChild(h('div', { class: 'note', text: 'Chưa có phân cảnh. Bấm "+ Phân cảnh" hoặc nhờ AI đạo diễn ở cột bên phải: "Chia phân cảnh".' }));
    }
    function paintReview() {
      clear(reviewList);
      var ok = W.shots.filter(function (s) { return rvOf(s.id).status === 'ok'; }).length;
      sumBadge.textContent = 'Đạt ' + ok + '/' + W.shots.length; sumBadge.className = 'chip ' + (W.shots.length && ok === W.shots.length ? 'ok' : '');
      if (document.activeElement !== allNote) allNote.value = (W.review && W.review.note) || '';
      if (!W.shots.length) { reviewList.appendChild(h('div', { class: 'note', text: 'Chưa có phân cảnh để duyệt.' })); return; }
      W.shots.forEach(function (s, i) {
        var rv = rvOf(s.id), steps = (s.event && s.event.steps) || [], miss = GC.film.issues(s), nd = noteDraft[s.id] || (noteDraft[s.id] = { text: '', step: '' });
        var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Trạng thái duyệt của ' + s.title });
        REVIEW_ST.forEach(function (x) {
          seg.appendChild(h('button', { 'aria-pressed': String(rv.status === x[0]), 'data-review': s.id + ':' + x[0], onclick: function () { if (rv.status !== x[0]) saveReviewShot(s.id, { status: x[0] }); } }, x[1]));
        });
        var notes = h('div', { class: 'notes' });
        (rv.notes || []).forEach(function (n) {
          notes.appendChild(h('div', { class: 'note-row' }, n.step ? h('button', { class: 'tag', title: 'Ghim bước ' + n.step + ' vào Trợ lý AI', onclick: function () { if (window.GCDock) window.GCDock.pin('step:' + W.id + '/' + s.id + '/' + n.step, 'Bước ' + n.step + ' · ' + s.title); } }, 'B' + String(n.step).padStart(2, '0')) : h('span', { class: 'tag', text: 'cảnh' }),
            h('span', { class: 'tx', text: n.text }),
            h('button', { class: 'btn sm ic', 'aria-label': 'Xoá ghi chú: ' + n.text.slice(0, 40), title: 'Xoá ghi chú', onclick: function () { saveReviewShot(s.id, { notes: cleanNotes((rv.notes || []).filter(function (x) { return x.id !== n.id; })) }); } }, '✕')));
        });
        var nIn = h('input', { type: 'text', maxlength: 400, 'aria-label': 'Ghi chú duyệt cho ' + s.title, placeholder: 'Ghi chú: sửa gì ở cảnh này…', value: nd.text, oninput: function () { nd.text = nIn.value; }, onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); addNote(); } } });
        var nStep = h('select', { 'aria-label': 'Gắn ghi chú vào bước', onchange: function () { nd.step = nStep.value; } });
        nStep.appendChild(h('option', { value: '', text: 'cả cảnh' }));
        steps.forEach(function (_, n) { nStep.appendChild(h('option', { value: String(n + 1), text: 'bước ' + (n + 1) })); });
        nStep.value = nd.step;
        function addNote() {
          var tx = nIn.value.trim();
          if (!tx) { nIn.focus(); return; }
          var n = { text: tx }; if (nStep.value) n.step = +nStep.value;
          nd.text = ''; nd.step = '';
          saveReviewShot(s.id, { notes: cleanNotes(rv.notes || []).concat(n) }).then(function () { var f = document.querySelector('[aria-label="Ghi chú duyệt cho ' + s.title.replace(/"/g, '\\"') + '"]'); if (f) f.focus(); }, function () { nd.text = tx; });
        }
        var fix = (rv.notes || []).length || rv.status === 'fix';
        reviewList.appendChild(h('div', anc({ class: 'rvrow st-' + rv.status }, 'shot:' + W.id + '/' + s.id, 'Cảnh ' + (i + 1) + ' · ' + s.title),
          h('div', { class: 'rvpic' }, stillOf(s)),
          h('div', { class: 'rvbody' },
            h('div', { class: 'rvhead' }, h('b', { class: 'stepn', text: String(i + 1) }), h('b', { class: 'rt', text: s.title }), h('span', { class: 'mono note', text: s.id }), steps.length ? h('span', { class: 'note', text: secLabel(shotSeconds(s)) }) : null, h('span', { class: 'sp' }),
              h('button', { class: 'btn sm', 'data-play': s.id, disabled: miss.length ? '' : null, title: miss.length ? 'Chưa diễn được: thiếu ' + miss.join(', ') : 'Diễn cảnh này', onclick: function () { player.play([s], s.title); stageBox.scrollIntoView({ block: 'nearest' }); } }, '▶ Cảnh')),
            h('div', { class: 'rvbar' }, seg, h('span', { class: 'sp' }),
              h('button', { class: 'btn sm', disabled: fix ? null : '', title: 'Ghim cảnh + ghi chú vào Trợ lý AI rồi nhờ sửa theo đó (AI đề xuất, bạn duyệt)', 'data-askai': s.id, onclick: function () { askAi(s, i, rv); } }, 'Gửi AI sửa theo ghi chú')),
            notes,
            h('div', { class: 'rvadd' }, nIn, nStep, h('button', { class: 'btn sm', onclick: addNote }, '+ Ghi chú')))));
      });
    }
    // ghim cảnh (+ các bước được ghi chú) vào dock, soạn sẵn câu nhờ sửa — chủ bấm Gửi
    function askAi(s, i, rv) {
      if (!window.GCDock) return;
      var G = window.GCDock, lines = (rv.notes || []).map(function (n) { return '- ' + (n.step ? 'bước ' + n.step + ': ' : '') + n.text; });
      G.pin('shot:' + W.id + '/' + s.id, 'Cảnh ' + (i + 1) + ' · ' + s.title);
      var seen = {}; (rv.notes || []).forEach(function (n) { if (n.step && !seen[n.step] && Object.keys(seen).length < 3) { seen[n.step] = 1; G.pin('step:' + W.id + '/' + s.id + '/' + n.step, 'Bước ' + n.step + ' · ' + s.title); } });
      G.compose('Sửa phân cảnh "' + s.title + '" theo ghi chú duyệt của tôi' + (lines.length ? ':\n' + lines.join('\n') : ' (đang đặt là Cần sửa)') + '\nĐề xuất bằng propose_edit để tôi xem diff rồi duyệt.');
    }
    function paintVoice() {
      clear(soundBox);
      var S = GC.sounds, st = W.stats || {}, L = workLang(W);
      voiceStat.textContent = st.voiceTotal ? 'Giọng AI đã lồng ' + st.voiceDone + '/' + st.voiceTotal + ' câu' + (st.voiceDone === st.voiceTotal ? ' — đủ' : '') : 'Chưa có câu thoại để lồng tiếng';
      // âm thanh: luật ghép S1–S7 (engine/sounds.js) chấm cả tác phẩm — cùng bộ luật save_shot / save_work chạy ở server
      if (!S || !S.lintSoundTrack) { soundBox.appendChild(h('div', { class: 'note', text: 'Bản này chưa nạp thư viện âm (engine/sounds.js).' })); return; }
      var issues = [];
      try { issues = S.lintSoundTrack({ shots: W.shots }, { project: W.project || '', mood: GC.film && GC.film.moodOf }); } catch (e) { issues = []; }
      var nErr = issues.filter(function (x) { return x.level === 'error'; }).length;
      soundBox.appendChild(h('div', { class: 'row' }, h('span', { class: 'chip ' + (nErr ? 'bad' : issues.length ? 'warn' : 'ok'), role: 'status', text: nErr ? nErr + ' lỗi' : issues.length ? issues.length + ' cảnh báo' : '✓ Đạt luật ghép S1–S7' }),
        h('span', { class: 'note', text: 'Gói âm theo dự án: ' + (W.project ? Projects.name(W.project) : 'chưa xếp dự án') })));
      issues.slice(0, 30).forEach(function (x) {
        var m = /^shots\[(\d+)\]/.exec(x.path || ''), s = m ? W.shots[+m[1]] : null;
        soundBox.appendChild(h('div', { class: 'sndrow' }, h('span', { class: 'chip ' + (x.level === 'error' ? 'bad' : 'warn'), text: x.code }), h('span', { class: 'tx', text: String(x.msg).replace(/^S\d: /, '') }),
          s ? h('button', { class: 'tag', title: 'Tới phân cảnh này', onclick: function () { goShot(s.id); } }, 'Cảnh ' + (+m[1] + 1) + (x.step >= 0 ? ' · B' + String(x.step + 1).padStart(2, '0') : '')) : null));
      });
      if (soundWarn.length) soundBox.appendChild(h('div', { class: 'note', text: 'Lần lưu gần nhất báo thêm: ' + soundWarn.slice(0, 3).join(' · ') }));
    }
    function goShot(id) { curShot = id; route.shot = id; saveRoute(); setTab('shots'); var e = document.getElementById('shot-' + id); if (e) { e.scrollIntoView({ block: 'center', behavior: 'smooth' }); e.classList.add('flash'); setTimeout(function () { e.classList.remove('flash'); }, 1200); } }

    /* -- bố cục các tab -- */
    var stageBox = h('div', { class: 'revstage' }, stage);
    var voiceStat = h('span', { class: 'note' });
    var saveScriptB = h('button', { class: 'btn sm primary', onclick: saveScript }, 'Lưu');
    panels.script = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, 'Kịch bản', h('span', { class: 'r' }, saveScriptB)), h('div', { class: 'pad stack' }, logline, script)),
      h('div', { class: 'panel' }, h('h3', null, 'Dàn nhân vật', h('span', { class: 'r note', text: 'diễn viên của mọi phân cảnh' })), castBox),
      h('div', { class: 'panel' }, h('h3', null, 'Ngôn ngữ phim', h('span', { class: 'r note', text: 'giọng máy đọc · giọng AI · lồng tiếng theo ngôn ngữ này' })), h('div', { class: 'pad row' }, langSel2, langNote2)));
    panels.shots = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, 'Phân cảnh', h('span', { class: 'r row' }, h('span', { class: 'note', text: 'AI đạo diễn viết ra gì thì hiện ở đây — đề xuất sửa chờ bạn duyệt' }), h('button', { class: 'btn sm', onclick: function () { saveShot({ shot: { title: 'Phân cảnh mới', scene: (GC.scenes()[0] || {}).key || '' } }); } }, '+ Phân cảnh'))),
        h('div', { class: 'pad stack' }, readyBox, shotsBox)),
      evPanel);
    panels.review = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, 'Xem thử', h('span', { class: 'r' }, prog)),
        h('div', { class: 'pad revtop' }, stageBox,
          h('div', { class: 'revside stack' },
            h('div', { class: 'row' }, h('button', { class: 'btn primary', 'data-playall': '1', onclick: function () { if (W) player.play(W.shots, W.title); } }, '▶ Cả phim'), h('button', { class: 'btn', onclick: function () { player.stop(); } }, 'Dừng'), sumBadge),
            h('div', { class: 'usebar' }, h('b', { text: 'Âm thanh' }), audioControls(), dialogControl(player)),
            h('div', { class: 'note', text: 'Bấm "▶ Cảnh" ở từng hàng để xem lại một cảnh; đặt trạng thái Nháp / Cần sửa / Đạt và ghi chú (gắn cảnh hoặc một bước). "Gửi AI sửa theo ghi chú" ghim cảnh vào Trợ lý AI ở cột phải.'})))),
      h('div', { class: 'panel' }, h('h3', null, 'Duyệt từng cảnh', h('span', { class: 'r note', text: 'ghi chú lưu trong tác phẩm — AI đọc được qua get_work › review' })), h('div', { class: 'pad stack' }, allNote, reviewList)));
    panels.voice = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, 'Ngôn ngữ & giọng vùng'), h('div', { class: 'pad stack' },
        h('div', { class: 'stack', style: 'gap:6px' }, h('div', { class: 'usebar' }, h('b', { text: 'Ngôn ngữ' }), langSel, langNote), h('div', { class: 'usebar' }, h('b', { text: 'Giọng vùng' }), regionNote, regionB), regionBox))),
      h('div', { class: 'panel' }, h('h3', null, 'Lồng tiếng AI', h('span', { class: 'r' }, voiceStat)), h('div', { class: 'pad stack' },
        h('div', { class: 'usebar' }, h('b', { text: 'Lồng tiếng' }), dubB, dubNote), dubBox, castNote)),
      h('div', { class: 'panel' }, h('h3', null, 'Giọng chốt theo nhân vật', h('span', { class: 'r note', text: 'mỗi nhân vật một giọng, chốt theo tác phẩm — Studio, MCP và phim xuất cùng một giọng' })), voiceBox),
      h('div', { class: 'panel' }, h('h3', null, 'Âm thanh', h('span', { class: 'r note', text: 'luật ghép S1–S7 của cả tác phẩm' })), h('div', { class: 'pad stack' }, soundBox)));
    panels.publish = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, 'Xuất bản', h('span', { class: 'r note', text: 'phim · storyboard · dữ liệu · gói dự án' })), h('div', { class: 'pad stack' },
        h('div', { class: 'usebar' }, h('b', { text: 'Phim' }),
          h('button', { class: 'btn sm primary', title: 'Một tệp .html chạy được ở mọi trình duyệt, không cần cài gì — gửi cho người xem. Còn câu chưa có giọng AI thì hỏi trước: lồng tiếng rồi xuất / xuất luôn', onclick: function () { exportClick(); } }, 'Phim (HTML)')),
        exportBox,
        h('div', { class: 'usebar' }, h('b', { text: 'Storyboard' }),
          h('button', { class: 'btn sm', title: 'Bảng phân cảnh: ảnh từng cảnh + mô tả + lời thoại', onclick: function () { if (W) download(W.id + '-storyboard.svg', storyboard(W), 'image/svg+xml'); } }, 'Storyboard SVG'),
          h('button', { class: 'btn sm', onclick: function () {
            if (!W) return;
            try { var sv = storyboard(W), m = sv.match(/viewBox="0 0 (\d+) (\d+)"/); savePng(W.id + '-storyboard.png', svgURL(sv), +m[1], +m[2]); }
            catch (e) { toast('Không dựng được storyboard PNG: ' + e.message + ' — thử bản SVG.'); }
          } }, 'Storyboard PNG')),
        h('div', { class: 'usebar' }, h('b', { text: 'Dữ liệu' }),
          h('button', { class: 'btn sm', title: 'Kịch bản + phân cảnh + lời thoại + ghi chú duyệt dạng JSON', onclick: function () { if (W) download(W.id + '.json', JSON.stringify(Object.assign({}, W, { chat: undefined, stats: undefined, proposals: undefined }), null, 2), 'application/json'); } }, 'JSON'),
          h('button', { class: 'btn sm', title: 'Gói sao lưu của cả dự án chủ đề (asset + tác phẩm + gói động tác + gói âm) — nhập lại ở máy khác', onclick: function () { if (W && W.project) exportBundle({ id: W.project, name: Projects.name(W.project) }, false); else toast('Tác phẩm chưa xếp dự án — chọn dự án ở Thư viện › Dự án chủ đề.'); } }, 'Gói dự án (.json)')))));
    var body = h('div', { class: 'room' }, headBox, tabbar);
    WORK_TABS.forEach(function (t) { panels[t[0]].id = 'wpanel-' + t[0]; panels[t[0]].setAttribute('role', 'tabpanel'); panels[t[0]].setAttribute('aria-labelledby', 'wtab-' + t[0]); panels[t[0]].hidden = t[0] !== tab; body.appendChild(panels[t[0]]); });
    $('view').appendChild(h('div', anc({ class: 'works room-wrap' }, 'work:' + r.work, r.work), body));
    function paint() {
      stillCache = {};
      syncLang(); paintDub(); paintHead(); paintTabs();
      logline.value = draftScript ? draftScript.logline : W.logline || ''; script.value = draftScript ? draftScript.script : W.script || '';
      langSel2.value = langSel.value; langNote2.textContent = langNote.textContent; langNote2.className = langNote.className;
      paintCast(); paintShots(); paintReview(); paintVoice();
      voiceBox.hidden = false; clear(voiceBox); voiceBox.appendChild(voiceTable());
      var firstReady = W.shots.filter(function (s) { return s.scene; })[0];
      player.show(firstReady || null);
      paintReady();
    }
    // bảng giọng chốt: nhân vật · vai · giọng AI chốt · số câu
    function voiceTable() {
      var acts = AiVoice.actorsOf(W), L = workLang(W), chosen = (W.voices || {})[L.lang + '|' + L.accent] || {};
      if (!acts.length) return h('div', { class: 'pad note', text: 'Chưa có diễn viên nào trong phân cảnh.' });
      var t = h('table', { class: 'grid roles' }), hd = h('tr');
      ['Nhân vật', 'Vai giọng', 'Giọng vùng', 'Giọng AI đã chốt', 'Câu thoại'].forEach(function (c) { hd.appendChild(h('th', { text: c })); });
      t.appendChild(hd);
      acts.forEach(function (a) {
        var nLine = W.shots.reduce(function (n, s) { return n + ((s.event && s.event.steps) || []).filter(function (st) { return st.actor === a.id && String(st.say || '').trim(); }).length; }, 0);
        t.appendChild(h('tr', anc({}, 'asset:' + a.key, a.name), h('td', null, h('b', { text: a.name })), h('td', { text: GC.voices.ROLES[AiVoice.roleOf(a)].label }),
          h('td', { text: ((a.voice && a.voice.accent) ? a.voice.accent : 'theo phim') }), h('td', { class: 'mono' }, chosen[a.id] || h('span', { class: 'muted', text: 'chưa chốt' })), h('td', { class: 'v num', text: String(nLine) })));
      });
      return h('div', { class: 'scroll' }, t);
    }
    // phân cảnh nào diễn được, còn thiếu gì — bấm để tới đúng phân cảnh (không cần AI)
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
    // AI vừa sửa tác phẩm qua dock (hoặc đề xuất mới): đọc lại, giữ bản nháp đang gõ dở
    onData(function () { if (alive && W) loadWork(W.id, true); });
    setTab(tab);
    loadWork(r.work).then(function () {
      if (alive && W && r.shot) { var f = document.getElementById('shot-' + r.shot); if (f) { f.scrollIntoView({ block: 'center' }); f.classList.add('flash'); setTimeout(function () { f.classList.remove('flash'); }, 1200); } }
      if (alive && W && r.step) { var sp = document.querySelector('[data-anchor="step:' + W.id + '/' + r.shot + '/' + r.step + '"]'); if (sp) sp.scrollIntoView({ block: 'center' }); }
    });
  }

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
    return ['engine/core.js'].concat(withRender ? ['engine/render.js'] : [], ['kinds/character/gen.core.js', 'kinds/khung/gen.khung.js'])
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
          row.appendChild(h('button', anc({ class: 'libcard', 'aria-pressed': String(sel && x.key === sel.key), title: x.key, onclick: function () { sel = x; paint(); paintInsp(); } }, cfg.anchor ? cfg.anchor + ':' + x.key : null, x.name),
            h('div', { class: 'im' }, h('img', { src: cfg.thumb(x), alt: x.name, loading: 'lazy' })),
            h('div', { class: 'lb' }, h('b', { text: x.name }), h('span', { class: 'note', text: cfg.sub(x) }))));
        });
        body.appendChild(h('div', { class: 'panel' }, h('h3', null, g[1], h('span', { class: 'r note', text: part.length + ' / ' + all.filter(function (x) { return secOf(x) === g[0]; }).length })), h('div', { class: 'pad' }, row)));
      });
      if (!body.children.length) body.appendChild(h('div', { class: 'panel pad note lib-empty', text: all.length ? 'Không có gì khớp bộ lọc.' : 'Thư viện chưa có ' + cfg.title.toLowerCase() + ' nào. Asset được tạo từ bộ khung chuẩn (Xưởng) rồi mới lưu vào đây theo dự án chủ đề.' }));
    }
    function paintInsp() { clear(insp); dockObj('asset', sel && sel.key, sel && sel.name); if (sel) cfg.inspect(sel, insp); }
    onData(function () { paint(); paintInsp(); });   // AI vừa tạo / sửa asset: danh sách vẽ lại
    paint(); paintInsp();
  }
  function useHead(x, box, extra) {
    // asset của tôi: đổi dự án chủ đề ngay tại Thư viện (lưu lại qua đúng cổng ghi của loại đó)
    var pub = GC.statusOf(x.status) === 'published', smp = (Projects.all().filter(function (p) { return p.id === x.project; })[0] || {}).sample;
    var stay = Object.assign({}, route, { key: x.key });   // lưu xong vẫn đứng ở asset này, không nhảy về đầu danh sách
    var pj = x.pack === MY_PACK ? h('div', { class: 'row' }, h('span', { class: 'note', text: 'Dự án chủ đề' }), projectSelect(x.project || '', function (v) {
      var d = clone(x); d.project = v;
      resave(d, 'Chuyển sang dự án ' + Projects.name(v)).then(function () { toast('Đã chuyển ' + x.name + ' sang ' + Projects.name(v)); go(stay); }).catch(function (e) { toast(e.message); });
    }), smp ? h('span', { class: 'chip', title: smp.license || '', text: 'Bộ mẫu ' + (smp.owner || 'Gen Labs') }) : h('span', { class: pub ? 'chip ok' : 'chip', text: pub ? 'Phát hành' : 'Nháp' }),
      // Nháp = dùng ngay trong dự án; Phát hành = vào gói bán (nhân vật cần dấu nhận diện — cổng kiểm sẽ báo nếu thiếu)
      smp ? null : h('button', { class: 'btn sm', title: pub ? 'Đưa về nháp: không còn trong gói bán' : 'Phát hành: đưa vào gói bán của dự án', onclick: function () {
        var d = clone(x); d.status = pub ? 'draft' : 'published';
        resave(d, pub ? 'Về nháp' : 'Phát hành').then(function () { toast(pub ? 'Đã đưa ' + x.name + ' về nháp.' : 'Đã phát hành ' + x.name + ' — có trong gói bán của dự án.'); go(stay); }).catch(function (e) { toast(e.message); });
      } }, pub ? 'Về nháp' : 'Phát hành')) : null;
    box.appendChild(h('div', { class: 'panel' }, h('h3', null, x.name + (x.han ? ' · ' + x.han : ''), h('span', { class: 'r mono', text: x.key })),
      h('div', { class: 'pad stack' }, pj, extra)));
  }

  // ---- Thư viện › Nhân vật
  var charThumb = new Map();
  PAGES['lib-characters'] = function (r) {
    libPage({
      title: 'Nhân vật', anchor: 'asset', fab: 'characters', list: function () { return GC.assets(); }, find: function (k) { return GC.ASSETS[k]; },
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
          voiceRow(a, mine),
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
      title: 'Vật phẩm', anchor: 'item', fab: 'items', list: function () { return GC.items(); }, find: function (k) { return k ? GC.getItem(k) : null; },
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
      title: 'Bối cảnh', anchor: 'scene', fab: 'scenes', wide: true, list: function () { return GC.scenes(); }, find: function (k) { return k ? GC.getScene(k) : null; },
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


  /* ============================================================ THƯ VIỆN › Động tác (v0.16, Q9 — ADR 0006) */
  // Đòn của bộ khung (gen.dong-tac) + gói động tác theo chủ đề (asset dữ liệu, qua cổng như mọi asset). Mỗi đòn: xem trước trên nhân vật
  // bất kỳ, tải hoạt ảnh PNG sprite sheet · GIF · SVG sheet · JSON timeline. Xem trước và tệp tải về dùng CÙNG một GC.choreo.animate
  // (khung cố định, nền trong suốt) nên tải về đúng như đang thấy. Ngân sách (L-42): một khung hình dựng sẵn, chỉ đổi DOM khi sang khung mới,
  // dừng khi rời trang / tab ẩn.
  var MANNEQUIN = 'gen.khung/ma-no-canh';
  // điều khoản của bộ mẫu Gen Labs (gói / hoạt ảnh xuất ra từ bộ mẫu mang dấu này — nhập lại vẫn bị chặn bán theo dấu nội dung)
  var SAMPLE_TERMS = 'chỉ để xem, thử, quay phim; không bán lại, không phân phối';
  // smp (tuỳ chọn): dấu bộ mẫu của dự án chứa gói → bản tải về ghi rõ sample { owner, license }
  function motionPackOut(P, smp) {
    var o = clone(P); ['pack', 'key', 'version', 'savedAt', 'note'].forEach(function (k) { delete o[k]; });
    if (smp) o.sample = { owner: smp.owner || 'Gen Labs', license: 'Bộ mẫu — ' + SAMPLE_TERMS };
    return o;
  }
  PAGES['lib-motions'] = function (r) {
    crumbs([{ t: 'Động tác' }]);
    var C = GC.choreo;
    if (!C) { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: 'Bản này chưa nạp bộ biên đạo (engine/choreo.js).' })); return; }
    var server = Store.mode === 'server';
    // gói nhập về thuộc một dự án (mọi asset đều thuộc một dự án): mặc định dự án vừa dùng — trừ dự án MẪU (gói tự làm rơi vào bộ mẫu
    // sẽ mang dấu mẫu, không bán được); để trống thì giữ dự án ghi trong tệp (nếu có)
    var impProj = (function (v) { var P = Projects.list.filter(function (x) { return x.id === v; })[0]; return P && P.sample ? '' : v; })(lastProject());
    actions(h('span', { class: 'note', text: 'Đòn của bộ khung + gói động tác theo chủ đề — xem trước, tải hoạt ảnh.' }),
      server ? h('span', { class: 'note', text: 'Nhập vào dự án' }) : null,
      server ? projectSelect(impProj, function (v) { impProj = v; }) : null,
      server ? h('button', { class: 'btn', title: 'Tệp gói động tác (.json, ' + C.MOTION.format + ') — đi qua cổng kiểm như mọi asset. Gói thuộc dự án đang chọn ở ô bên cạnh', onclick: pickPack }, 'Nhập gói động tác (.json)') : null);
    var ids = Object.keys(C.ACTIONS);
    var u = { action: r.action && C.ACTIONS[r.action] ? r.action : ids[0], who: GC.ASSETS[r.who] ? r.who : MANNEQUIN, partner: MANNEQUIN, react: 'hit', fps: 12, cell: 256 };
    if (!GC.ASSETS[u.partner]) u.partner = (GC.assets()[0] || {}).key;
    if (!GC.ASSETS[u.who]) u.who = u.partner;
    var q = '', errBox = h('div'), body = h('div', { class: 'stack' }), insp = h('div', { class: 'stack' });
    var search = h('input', { type: 'search', placeholder: 'Tìm: tên đòn, id, gói…', style: 'width:260px', oninput: function () { q = search.value.trim().toLowerCase(); paintList(); } });
    $('view').appendChild(h('div', { class: 'split lib wide motions' },
      h('div', { class: 'stack' }, errBox, h('div', { class: 'row' }, search, h('span', { class: 'note', text: ids.length + ' đòn · ' + C.packs().length + ' gói động tác' })), body),
      h('div', { class: 'sticky' }, insp)));

    // ---- danh sách: Bộ khung trước, rồi từng gói động tác
    function groups() {
      var out = [{ key: C.FRAME_PACK, name: 'Bộ khung', P: null }];
      C.packs().forEach(function (P) { out.push({ key: P.key, name: P.name || P.id, P: P }); });
      return out;
    }
    // dấu "bộ mẫu" của dự án (Projects.sample: { owner, license }) — của gói, hoặc của nhân vật
    function sampleOfProject(pid) { var pj = pid ? Projects.all().filter(function (x) { return x.id === pid; })[0] : null; return pj && pj.sample ? pj.sample : null; }
    function sampleOf(P) { return P && P.project ? sampleOfProject(P.project) : null; }
    function paintList() {
      clear(body);
      groups().forEach(function (g) {
        var list = ids.filter(function (k) { return C.ACTIONS[k].pack === g.key; });
        var shown = list.filter(function (k) { var A = C.ACTIONS[k]; return !q || [k, A.label, A.hint, g.name, g.key].join(' ').toLowerCase().indexOf(q) >= 0; });
        if (!shown.length && (q || !g.P)) return;
        var grid = h('div', { class: 'libgrid acts' });
        shown.forEach(function (k) {
          var A = C.ACTIONS[k];
          grid.appendChild(h('button', { class: 'libcard act', 'aria-pressed': String(u.action === k), title: k, 'data-action': k, 'data-anchor': 'action:' + k, 'data-anchor-label': A.label, onclick: function () { u.action = k; route.action = k; remember(); paintList(); paintInsp(); } },
            h('div', { class: 'lb' }, h('b', { text: A.label }), h('span', { class: 'mono note', text: k }),
              h('span', { class: 'badges' }, badgeEls(A).length ? badgeEls(A) : h('span', { class: 'tag badge', text: 'diễn' })),
              A.hint ? h('span', { class: 'note hint', text: A.hint }) : null)));
        });
        var P = g.P, smp = sampleOf(P), pub = P && P.status === 'published';
        var head = h('h3', null, g.name, h('span', { class: 'r note mono', text: shown.length + ' / ' + list.length + ' đòn' }));
        var meta = h('div', { class: 'packmeta row' },
          P ? h('span', { class: 'note', text: P.project ? 'Dự án · ' + Projects.name(P.project) : 'Chưa xếp dự án' }) : h('span', { class: 'note', text: 'Đòn trung lập của bộ khung — có sẵn trong mọi bản cài và mọi phim xuất ra.' }),
          h('span', { class: 'tag', text: g.key }),
          P ? (smp ? h('span', { class: 'chip', title: smp.license || '', text: 'Bộ mẫu ' + (smp.owner || 'Gen Labs') }) : h('span', { class: pub ? 'chip ok' : 'chip', text: pub ? 'Phát hành' : 'Nháp' })) : null,
          P && P.description ? h('span', { class: 'note', style: 'flex-basis:100%', text: P.description }) : null,
          P ? h('button', { class: 'btn sm', style: 'margin-left:auto', title: smp ? 'Bản sao lưu của gói bộ mẫu — xem, sửa thử, làm phim; không bán lại' : 'Tải gói động tác (.json) — nhập lại được ở bản cài khác', onclick: function () { download(P.id + '.json', JSON.stringify(motionPackOut(P, smp), null, 2), 'application/json'); } }, 'Tải gói (.json)') : null);
        body.appendChild(h('div', { class: 'panel', 'data-pack': g.key }, head, meta, h('div', { class: 'pad' }, shown.length ? grid : h('div', { class: 'note', text: 'Gói chưa có đòn nào (chỉ có tư thế / màn diễn).' }))));
      });
      if (!body.children.length) body.appendChild(h('div', { class: 'panel pad note lib-empty', text: 'Không có đòn nào khớp "' + q + '".' }));
    }
    function remember() { try { localStorage.setItem(routeKey(APP), JSON.stringify(route)); } catch (e) { /* bỏ qua */ } }

    // ---- xem trước + tải hoạt ảnh
    // khung hình hiện bằng <img> + Blob URL dựng sẵn: SVG trong <img> không chạy script / không đụng id của trang, và đúng như lúc raster ra PNG / GIF
    var anim = null, urls = [], raf = 0, playing = true, t0 = 0, fi = -1, stg = null, img = null, clock = null, playB = null, code = null;
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    function drop() { urls.forEach(function (x) { URL.revokeObjectURL(x); }); urls = []; }
    function frame(i) {
      fi = i; img.src = urls[i]; stg.setAttribute('data-frame', String(i));
      clock.textContent = (anim.frames[i].t.toFixed(2) + ' / ' + anim.duration.toFixed(2) + ' s · khung ' + (i + 1) + '/' + anim.frames.length).replace(/\./g, ',');
    }
    function loop(now) {
      raf = 0;
      if (!playing || !anim || !stg.isConnected || document.hidden) return;
      if (!t0) t0 = now;
      var n = anim.frames.length, period = n / anim.fps + 0.6;   // nghỉ 0,6 s giữa hai lượt
      var k = Math.min(n - 1, Math.floor(((now - t0) / 1000 % period) * anim.fps));
      if (k !== fi) frame(k);
      raf = requestAnimationFrame(loop);
    }
    function play() { stop(); if (playing && anim && !document.hidden) { t0 = 0; raf = requestAnimationFrame(loop); } }
    function onVis() { if (document.hidden) stop(); else play(); }
    document.addEventListener('visibilitychange', onVis);
    onLeave(function () { playing = false; stop(); drop(); document.removeEventListener('visibilitychange', onVis); });
    // need (tuỳ chọn): đòn đang chọn — nhân vật không làm được thì ô chọn bị mờ kèm lý do (vẫn chọn được bằng giá trị đang có để báo vì sao)
    function charSelect(cur, label, onPick, need) {
      var s = h('select', { 'aria-label': label, onchange: function () { onPick(s.value); } }), groupsOf = {};
      GC.assets().forEach(function (a) {
        var g = groupOf(a) === 'frame' ? 'Bộ khung' : a.pack === MY_PACK ? 'Dự án · ' + Projects.name(a.project || '') : ((GC.PACKS[a.pack] || {}).name || a.pack);
        if (!groupsOf[g]) { groupsOf[g] = h('optgroup', { label: g }); s.appendChild(groupsOf[g]); }
        var no = need && !C.canDo(a, need);
        groupsOf[g].appendChild(h('option', { value: a.key, disabled: no ? true : null, title: no ? a.name + ' không làm được: đòn này cần ' + (C.MOTION.needs[need.needs] || need.needs) : null,
          text: a.name + (no ? ' — cần ' + (need.needs === 'weapon' ? 'binh khí' : C.MOTION.needs[need.needs] || need.needs) : C.hasWeapon(a) ? ' · có binh khí' : '') }));
      });
      s.value = cur;
      return s;
    }
    function baseName() { return (GC.ASSETS[u.who] || {}).id + '-' + u.action + '-' + (anim ? anim.fps : u.fps) + 'fps'; }
    // ô của sprite sheet: cạnh dài = u.cell px, cạnh kia theo khung ôm (giống GC.choreo.sheetSVG để PNG, SVG, JSON khớp toạ độ)
    function layout() {
      var b = anim.box, n = anim.frames.length, cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      var cw = b.w >= b.h ? u.cell : Math.max(1, Math.round(u.cell * b.w / b.h)), ch = Math.round(cw * b.h / b.w);
      return { cols: cols, rows: Math.ceil(n / cols), cw: cw, ch: ch };
    }
    function sized(svg, w, hh) { return svg.replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + hh + '" '); }
    function rasterFrames(L) {
      return Promise.all(anim.frames.map(function (f) {
        return new Promise(function (res, rej) { var img = new Image(); img.onload = function () { res(img); }; img.onerror = function () { rej(new Error('không dựng được khung hình')); }; img.src = svgURL(sized(f.svg, L.cw, L.ch)); });
      }));
    }
    function busy(btn, p) { var t = btn.textContent; btn.disabled = true; btn.textContent = 'Đang dựng…'; return p.catch(function (e) { toast('Không xuất được: ' + e.message); }).then(function () { btn.disabled = false; btn.textContent = t; }); }
    // làm fn(i) lần lượt cho n khung, nhả luồng một nhịp sau mỗi khung (setTimeout 0) + báo tiến độ lên nút — khung 512 px không làm đơ trang
    function eachFrame(n, fn, btn) {
      return new Promise(function (res, rej) {
        var i = 0;
        (function step() {
          try { if (i >= n) { res(); return; } fn(i++); btn.textContent = 'Đang dựng… ' + Math.round(100 * i / n) + '%'; setTimeout(step, 0); } catch (e) { rej(e); }
        })();
      });
    }
    function savePNG(btn) {
      if (!anim) return;
      var L = layout(), name = baseName(), n = anim.frames.length;   // chốt bản đang xem: chọn đòn khác giữa chừng không làm lệch tệp
      busy(btn, rasterFrames(L).then(function (imgs) {
        var c = document.createElement('canvas'); c.width = L.cols * L.cw; c.height = L.rows * L.ch;
        var ctx = c.getContext('2d');   // canvas mới = nền trong suốt
        return eachFrame(imgs.length, function (i) { ctx.drawImage(imgs[i], (i % L.cols) * L.cw, Math.floor(i / L.cols) * L.ch, L.cw, L.ch); }, btn)
          .then(function () { return new Promise(function (res) { c.toBlob(res, 'image/png'); }); });
      }).then(function (b) { downloadBlob(name + '.png', b); toast('Sprite sheet ' + L.cols + '×' + L.rows + ' ô ' + L.cw + '×' + L.ch + ' px · ' + n + ' khung — toạ độ từng khung trong tệp JSON.'); }));
    }
    function saveGIF(btn) {
      if (!anim) return;
      if (!window.GenGif) { toast('Thiếu bộ mã hoá GIF (studio/gif.js).'); return; }
      var L = layout(), name = baseName(), fps = anim.fps;   // fps thật của khung (có thể đã tự hạ) — nhịp GIF theo đúng nó
      busy(btn, rasterFrames(L).then(function (imgs) {
        var c = document.createElement('canvas'); c.width = L.cw; c.height = L.ch;
        var ctx = c.getContext('2d', { willReadFrequently: true }), frames = [];
        return eachFrame(imgs.length, function (i) { ctx.clearRect(0, 0, L.cw, L.ch); ctx.drawImage(imgs[i], 0, 0, L.cw, L.ch); frames.push(ctx.getImageData(0, 0, L.cw, L.ch).data); }, btn)
          .then(function () { btn.textContent = 'Đang mã hoá…'; return window.GenGif.encodeAsync({ width: L.cw, height: L.ch, frames: frames, fps: fps, loop: 0 }, function (i, tot) { btn.textContent = 'Đang mã hoá… ' + Math.round(100 * i / tot) + '%'; }); })
          .then(function (bytes) {
            downloadBlob(name + '.gif', new Blob([bytes], { type: 'image/gif' }));
            toast('GIF ' + L.cw + '×' + L.ch + ' px · ' + frames.length + ' khung · ' + fps + ' fps · lặp vô hạn, nền trong suốt (' + Math.round(bytes.length / 1024) + ' KB).');
          });
      }));
    }
    function saveSheetSVG() { if (!anim) return; var L = layout(); download(baseName() + '.svg', C.sheetSVG(anim, { cols: L.cols, cell: L.cw }).svg, 'image/svg+xml'); }
    // giấy phép ghi trong JSON: nhân vật / gói thuộc bộ mẫu Gen Labs thì không "thuộc người tạo" — chỉ để xem, thử, quay phim
    function sampleNow() {
      var A = C.ACTIONS[u.action], who = GC.ASSETS[u.who], pa = A && A.attack ? GC.ASSETS[u.partner] : null;
      return sampleOf(A ? C.PACKS[A.pack] : null) || sampleOfProject(who && who.pack === MY_PACK ? who.project : '') || sampleOfProject(pa && pa.pack === MY_PACK ? pa.project : '');
    }
    function licenseText(smp) { return '© 2026 Gen Labs — engine; ' + (smp ? 'Bộ mẫu ' + (smp.owner || 'Gen Labs') + ' — ' + SAMPLE_TERMS : 'nhân vật thuộc người tạo'); }
    function timeline() {
      var L = layout(), name = baseName(), A = C.ACTIONS[u.action], smp = sampleNow();
      return Object.assign({}, anim.meta, smp ? { sample: { owner: smp.owner || 'Gen Labs', license: 'Bộ mẫu — ' + SAMPLE_TERMS } } : {}, {
        fps: anim.fps,   // fps thật của các khung (engine có thể tự hạ để đủ cả đòn)
        character: u.who, partner: A && A.attack ? u.partner : null, pack: A ? A.pack : null,
        generator: 'gen-chibi ' + String((Store.info || {}).version || ''), license: licenseText(smp),
        sheet: { png: name + '.png', svg: name + '.svg', gif: name + '.gif', cols: L.cols, rows: L.rows, cell: { w: L.cw, h: L.ch }, width: L.cols * L.cw, height: L.rows * L.ch },
        frames: anim.frames.map(function (f, i) { return { i: i, t: f.t, name: name + '-' + String(i).padStart(3, '0'), x: (i % L.cols) * L.cw, y: Math.floor(i / L.cols) * L.ch, w: L.cw, h: L.ch }; })
      });
    }
    function saveJSON() { if (!anim) return; download(baseName() + '.json', JSON.stringify(timeline(), null, 2), 'application/json'); }
    function paintInsp() {
      stop(); drop(); anim = null; fi = -1; clear(insp);
      var A = C.ACTIONS[u.action];
      if (!A) { insp.appendChild(h('div', { class: 'panel pad note', text: 'Chọn một đòn.' })); return; }
      var who = GC.ASSETS[u.who], partner = GC.ASSETS[u.partner], P = C.PACKS[A.pack] || null;
      img = h('img', { alt: 'Xem trước ' + A.label, draggable: 'false' });
      stg = h('div', { class: 'mstage' }, img);
      clock = h('span', { class: 'note mono' });
      playB = h('button', { class: 'btn sm', 'aria-label': 'Phát / dừng', onclick: function () { playing = !playing; playB.textContent = playing ? '❚❚ Dừng' : '▶ Phát'; play(); } }, playing ? '❚❚ Dừng' : '▶ Phát');
      var ctl = h('div', { class: 'row' },
        h('label', { class: 'fld' }, h('span', { class: 'note', text: A.attack ? 'Người ra đòn' : 'Nhân vật' }), charSelect(u.who, 'Nhân vật', function (v) { u.who = v; route.who = v; remember(); paintInsp(); }, A.needs ? A : null)),
        A.attack ? h('label', { class: 'fld' }, h('span', { class: 'note', text: 'Đối thủ' }), charSelect(u.partner, 'Đối thủ', function (v) { u.partner = v; paintInsp(); })) : null,
        A.attack ? h('label', { class: 'fld' }, h('span', { class: 'note', text: 'Phản ứng của đối thủ' }), (function () {
          var s = h('select', { 'aria-label': 'Phản ứng', onchange: function () { u.react = s.value; paintInsp(); } });
          Object.keys(C.REACTS).forEach(function (k) { s.appendChild(h('option', { value: k, text: C.REACTS[k].label })); });
          s.value = u.react; return s;
        })()) : null);
      var fseg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Số khung / giây' });
      [8, 12, 24].forEach(function (f) { fseg.appendChild(h('button', { 'aria-pressed': String(u.fps === f), onclick: function () { u.fps = f; paintInsp(); } }, f + ' fps')); });
      var csel = h('select', { 'aria-label': 'Cỡ khung', title: 'Cạnh dài mỗi khung (px) của PNG / GIF / SVG sheet', onchange: function () { u.cell = +csel.value; if (code) code.refresh(); } });
      [160, 256, 384, 512].forEach(function (n) { csel.appendChild(h('option', { value: n, text: n + ' px' })); });
      csel.value = String(u.cell);
      var info = h('div', { class: 'note mono' }), bar = null, can = !!(who && C.canDo(who, A)), err = '';
      if (!who) err = 'Không có nhân vật này trong Thư viện.';
      else if (!can) err = who.name + ' không làm được "' + A.label + '": đòn này cần ' + (C.MOTION.needs[A.needs] || A.needs) + '. Chọn nhân vật có binh khí (nhãn "có binh khí"), hoặc trang bị vũ khí cho ' + who.name + ' ở Xưởng.';
      else {
        try { anim = C.animate(C.actionTimeline({ asset: who, action: u.action, partner: A.attack ? partner : undefined, react: A.attack ? u.react : undefined }), { fps: u.fps }); }
        catch (e) { err = 'Không dựng được đòn: ' + e.message; anim = null; }
      }
      var fpsBox = h('div', { class: 'stack', style: 'gap:6px' });
      if (anim) {
        info.textContent = (anim.frames.length + ' khung · ' + anim.fps + ' fps · ' + anim.duration.toFixed(2) + ' s' + (anim.meta.impactFrame != null ? ' · va chạm ở khung ' + (anim.meta.impactFrame + 1) : '') + ' · khung ôm ' + anim.box.w + '×' + anim.box.h).replace(/(\d)\.(\d)/g, '$1,$2');
        // đòn dài hơn số khung cho phép: engine tự hạ fps cho đủ cả đòn (anim.fps < fps đã chọn) — nói rõ để người dùng không tưởng nhầm
        var asked = anim.meta.requestedFps || u.fps, lastT = anim.frames[anim.frames.length - 1].t;
        if (anim.fps < asked) fpsBox.appendChild(h('div', { class: 'note', 'data-note': 'fps', text: 'Đòn dài ' + anim.duration.toFixed(2).replace('.', ',') + ' s nên tự hạ còn ' + anim.fps + ' fps (bạn chọn ' + asked + ') để đủ cả đòn.' }));
        // ngay cả ở fps thấp nhất vẫn không đủ khung: hoạt ảnh bị cắt cụt — báo, không để xuất ra một đòn thiếu đuôi mà không hay
        if (anim.meta.truncated || lastT < anim.duration - 0.0005) fpsBox.appendChild(h('div', { class: 'banner warn', role: 'alert', 'data-note': 'truncated' },
          h('span', { text: 'Đòn dài ' + anim.duration.toFixed(2).replace('.', ',') + ' s, quá giới hạn khung ngay cả ở ' + anim.fps + ' fps — hoạt ảnh chỉ tới giây ' + lastT.toFixed(2).replace('.', ',') + ', phần cuối bị cắt. Rút ngắn đòn (clip / nhịp) trong gói động tác.' })));
      }
      var dl = function (label, title, fn) { var b = h('button', { class: 'btn sm', title: title, disabled: anim ? null : true, onclick: function () { fn(b); } }, label); return b; };
      code = codeBox([
        ['Mã tham chiếu', function () {
          var st = { actor: (who || {}).id || 'ma-no-canh', state: A.attack ? 'rage' : 'normal', action: u.action };
          if (A.attack) { st.target = (partner || {}).id || 'ma-no-canh'; st.react = u.react; }
          st.say = '…';
          return '// một bước trong kịch bản (Bảng bước / AI đạo diễn):\n' + JSON.stringify(st) + '\n\n// đòn thuộc: ' + (P ? P.key + ' (gói "' + P.name + '")' : C.FRAME_PACK + ' (bộ khung)') + '\n// nhân vật: ' + u.who + (A.attack ? '\n// đối thủ:  ' + u.partner : '');
        }],
        ['JSON timeline', function () { return anim ? JSON.stringify(Object.assign({}, timeline(), { frames: '(' + anim.frames.length + ' khung — xem tệp JSON)' }), null, 2) : '// chưa dựng được hoạt ảnh'; }]
      ]);
      bar = h('div', { class: 'usebar' }, h('b', { text: 'Tải hoạt ảnh' }),
        dl('PNG sprite sheet', 'Mọi khung xếp lưới, nền trong suốt', savePNG),
        dl('GIF', 'GIF89a lặp vô hạn, nền trong suốt, nhịp theo fps', saveGIF),
        dl('SVG sheet', 'Sprite sheet vectơ (một tệp SVG)', saveSheetSVG),
        dl('JSON', 'Metadata timeline (' + 'gen-chibi.anim/1' + ') + toạ độ từng khung trong sprite sheet', saveJSON));
      var packBar = h('div', { class: 'usebar' }, h('b', { text: 'Gói' }),
        P ? h('span', { class: 'note', text: P.name + ' · ' + (P.project ? Projects.name(P.project) : 'chưa xếp dự án') }) : h('span', { class: 'note', text: 'Đòn của bộ khung — có sẵn trong mọi bản cài và mọi phim xuất ra.' }),
        P ? h('button', { class: 'btn sm', onclick: function () { download(P.id + '.json', JSON.stringify(motionPackOut(P, sampleOf(P)), null, 2), 'application/json'); } }, 'Tải gói (.json)') : null);
      insp.appendChild(h('div', { class: 'panel' }, h('h3', null, A.label, h('span', { class: 'r mono', text: u.action })),
        h('div', { class: 'pad stack' },
          h('div', { class: 'row' }, badgeEls(A), A.hint ? h('span', { class: 'note', text: A.hint }) : null),
          ctl, err ? h('div', { class: 'banner bad', role: 'alert' }, h('span', { text: err })) : stg,
          anim ? h('div', { class: 'row' }, playB, clock, h('span', { class: 'sp', style: 'flex:1' }), fseg) : h('div', { class: 'row' }, fseg),
          info, fpsBox, h('div', { class: 'row' }, h('span', { class: 'note', text: 'Cỡ khung khi tải' }), csel), bar, packBar, code)));
      if (anim) { urls = anim.frames.map(function (f) { return URL.createObjectURL(new Blob([f.svg], { type: 'image/svg+xml' })); }); frame(0); play(); }
    }
    // ---- nhập gói động tác: server kiểm (cùng cổng với MCP / AI), 422 thì hiện đủ danh sách lỗi
    function showErr(msg, list) {
      clear(errBox);
      if (!msg) return;
      errBox.appendChild(h('div', { class: 'banner bad', role: 'alert', style: 'display:grid;gap:6px' },
        h('div', { class: 'row' }, h('b', { text: msg }), h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { showErr(''); } }, 'Đóng')),
        list && list.length ? h('ul', { class: 'errs', style: 'margin:0' }, list.slice(0, 30).map(function (m) { return h('li', { text: '✗ ' + m }); })) : null));
    }
    function pickPack() {
      var inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: function () {
        var f = inp.files && inp.files[0]; inp.remove();
        if (!f) return;
        if (f.size > 400 * 1024) { showErr('Tệp quá lớn (gói động tác tối đa 300 KB).'); return; }
        f.text().then(function (t) { var d; try { d = JSON.parse(t); } catch (e) { showErr('Tệp không phải JSON.'); return; } importPack(d); });
      } });
      document.body.appendChild(inp); inp.click();
    }
    function importPack(def) {
      if (!def || typeof def !== 'object' || Array.isArray(def)) { showErr('Gói động tác phải là một object JSON (' + C.MOTION.format + ').'); return; }
      // dự án chọn ở ô "Nhập vào dự án" thắng; để trống thì giữ dự án ghi trong tệp (không có thì gói chưa xếp dự án = gói chung)
      var body = impProj ? Object.assign({}, def, { project: impProj }) : def;
      Store.api('POST', 'api/motion-packs', { pack: body, note: 'Nhập trong Studio' }).then(function (rec) {
        var r0 = C.registerPack(MY_PACK, rec);
        if (r0.errors.length) throw Object.assign(new Error('Server đã lưu nhưng Studio không nạp được gói'), { errors: r0.errors });
        var first = Object.keys(r0.def.actions)[0];
        toast('Đã nhập gói "' + r0.def.name + '" vào ' + (r0.def.project ? 'dự án ' + Projects.name(r0.def.project) : 'mục chưa xếp dự án (dùng chung)') + ': ' + Object.keys(r0.def.actions).length + ' đòn · ' + Object.keys(r0.def.clips).length + ' clip.');
        go(Object.assign({}, route, first ? { action: first } : {}));
      }).catch(function (e) { showErr(e.status === 422 ? 'Gói động tác chưa qua cổng kiểm' : e.message, e.errors || (e.status === 422 ? [e.message] : null)); });
    }
    paintList(); paintInsp();
  };

  /* ============================================================ THƯ VIỆN › ÂM THANH + GIỌNG (v0.18)
   * Hai trang Data Console (STD-07) đặt cạnh Thư viện › Động tác: bảng kiểu Excel (ID hàng, chữ cột, sắp xếp, ô tìm không dấu, footer) + Inspector 400 px.
   *   Âm thanh: tab Âm (62 âm khung + gói, nghe ngay trên hàng) · Luật ghép (S1–S7 từ GC.sounds.RULES, công thức RECIPES, kiểm thử chuỗi bước) · Gói âm (tải / nhập).
   *   Giọng:    tab Bộ giọng vai (22 vai × 4 ngôn ngữ, giọng máy + giọng AI) · Giọng của tác phẩm (nhân vật → vai → giọng chốt work.voices).
   * Một khối liền mạch: mọi thứ dùng chung nằm ngay đây (tiền tố lc = dùng chung, ls = âm, lv = giọng). CSS ở studio/lib-audio.css.
   * Không innerHTML với dữ liệu: mọi chữ qua h() / textContent. Nơi này là nơi XEM / NGHE; dán key + trần câu vẫn ở Cài đặt AI (voiceSettings). */
  var LC_NS = 'http://www.w3.org/2000/svg';
  var LC_ICON = {   // Lucide-style, nét 1,5, 16 px (STD-07 §8) — dựng bằng DOM, không chuỗi HTML
    play: ['M4.8 2.9v10.2L13 8z'], down: ['M8 2.5v7.3M4.9 7l3.1 3.1L11.1 7M3 13.2h10'], up: ['M8 10.5V3.2M4.9 6.3 8 3.2l3.1 3.1M3 13.2h10'],
    copy: ['M6 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z', 'M10.5 5.5V3.9a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1V10a1 1 0 0 0 1 1H5'],
    ok: ['M3.5 8.5l3 3 6-6.5'], no: ['M4 4l8 8M12 4l-8 8'], warn: ['M8 2.5l6 10.5H2z', 'M8 6.5v3M8 11.3v.1']
  };
  function lcIcon(name) {
    var s = document.createElementNS(LC_NS, 'svg'), d = LC_ICON[name] || [], i, p;
    s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('width', '14'); s.setAttribute('height', '14');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.setAttribute('class', 'lc-i' + (name === 'play' ? ' fill' : ''));
    for (i = 0; i < d.length; i++) { p = document.createElementNS(LC_NS, 'path'); p.setAttribute('d', d[i]); s.appendChild(p); }
    return s;
  }
  // nhãn trạng thái: luôn có biểu tượng + chữ (không chỉ màu): kind ok | bad | warn | idle
  function lcState(kind, text, title) { return h('span', { class: 'lc-st ' + kind, title: title || null }, lcIcon(kind === 'ok' ? 'ok' : kind === 'bad' ? 'no' : kind === 'warn' ? 'warn' : 'ok'), text); }
  function lcBtn(icon, text, o) {
    o = o || {};
    var b = h('button', { class: 'btn sm lc-ic ' + (o.cls || ''), type: 'button', title: o.title || null, 'aria-label': o.label || null, disabled: o.disabled ? true : null, onclick: function (ev) { if (o.fn) o.fn(b, ev); } });
    if (icon) b.appendChild(lcIcon(icon));
    if (text) b.appendChild(document.createTextNode(text));
    return b;
  }
  function lcPlay(label, fn) { var b = h('button', { class: 'btn lc-play lc-ic', type: 'button', title: label, 'aria-label': label, onclick: function (ev) { fn(b, ev); } }); b.appendChild(lcIcon('play')); return b; }
  function vn(n, d) { return Number(n).toFixed(d == null ? 2 : d).replace('.', ','); }
  function lcFold(t) { t = String(t == null ? '' : t).toLowerCase(); if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); return t.replace(/đ/g, 'd'); }
  // `mã` và **đậm** trong chữ markdown của GC.sounds.guide() → DOM (không HTML)
  function lcMd(s) {
    var f = document.createDocumentFragment();
    String(s).split(/(`[^`]+`|\*\*[^*]+\*\*)/).forEach(function (p) {
      if (!p) return;
      if (p.charAt(0) === '`') f.appendChild(h('code', { class: 'lc-code', text: p.slice(1, -1) }));
      else if (p.slice(0, 2) === '**') f.appendChild(h('b', { text: p.slice(2, -2) }));
      else f.appendChild(document.createTextNode(p));
    });
    return f;
  }
  function lcTabs(items, cur, onPick) {   // items: [[id, nhãn, đếm]]
    var bar = h('div', { class: 'tabs lc-tabs', role: 'tablist' });
    items.forEach(function (t) {
      bar.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': String(cur === t[0]), 'data-tab': t[0], onclick: function () { onPick(t[0]); } }, t[1], t[2] === '' || t[2] == null ? null : h('span', { class: 'n', text: String(t[2]) })));
    });
    return bar;
  }

  // Lưới Data Console (STD-07 §5): dải chữ cột A B C… + header cột (sắp xếp bấm được) + cột đóng băng + ID hàng mono + hàng chọn + footer.
  // o: { id (tiền tố id DOM), label, cols: [{ t (tên), w (px), frozen, cls, cell(row) → Node | chữ, v(row) → khoá sắp xếp, tip(row) }], group(row) → nhãn nhóm,
  //      onSelect(row | null), onAct(row) (Space / Enter), foot(view) → [Node | chữ] }. Bàn phím: ↑ ↓ (hoặc J K) · Home · End · Space · Enter khi bảng đang focus.
  function lcGrid(o) {
    var rows = [], view = [], selId = '', sk = -1, sd = 1, left = 0, total = 0, trs = {};
    var table = h('table', { class: 'lc-t', role: 'grid', 'aria-label': o.label, tabindex: '0' }), colg = h('colgroup'), lt = h('tr', { class: 'letters', 'aria-hidden': 'true' }), hd = h('tr'), tb = h('tbody');
    var foot = h('div', { class: 'lc-foot' }), scroll = h('div', { class: 'lc-scroll' }, table), el = h('div', { class: 'lc-grid' }, scroll, foot);
    o.cols.forEach(function (c, i) {
      c.left = c.frozen ? left : null; if (c.frozen) left += c.w;
      total += c.w;
      colg.appendChild(h('col', { style: 'width:' + c.w + 'px' }));
      var fz = c.frozen ? 'fz' : null, ls = c.frozen ? 'left:' + c.left + 'px' : null;
      lt.appendChild(h('th', { class: fz, style: ls, text: String.fromCharCode(65 + i) }));
      var th = h('th', { scope: 'col', class: fz, style: ls, 'data-col': String(i) });
      if (c.v) th.appendChild(h('button', { type: 'button', class: 'lc-th', onclick: function () { sortBy(i); } }, c.t, h('span', { class: 'sort', 'aria-hidden': 'true' })));
      else th.textContent = c.t;
      hd.appendChild(th);
    });
    table.style.minWidth = total + 'px'; table.style.width = '100%';
    table.appendChild(colg); table.appendChild(h('thead', null, lt, hd)); table.appendChild(tb);
    function idx(id) { for (var i = 0; i < view.length; i++) if (view[i].id === id) return i; return -1; }
    function sortBy(i) {
      if (sk === i) { if (sd === 1) sd = -1; else { sk = -1; sd = 1; } } else { sk = i; sd = 1; }
      Array.prototype.forEach.call(hd.children, function (th, k) {
        th.removeAttribute('aria-sort');
        var s = th.querySelector('.sort'); if (s) s.textContent = k === sk ? (sd === 1 ? '▲' : '▼') : '';
        if (k === sk) th.setAttribute('aria-sort', sd === 1 ? 'ascending' : 'descending');
      });
      build(); paintBody();
    }
    function build() {
      view = rows.slice();
      if (sk >= 0) {
        var f = o.cols[sk].v;
        view.sort(function (a, b) { var x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y) * sd; });
      }
    }
    function paintBody() {
      clear(tb); trs = {};
      var lastG = null;
      view.forEach(function (row, i) {
        var g = sk < 0 && o.group ? o.group(row) : null;
        if (g && g !== lastG) tb.appendChild(h('tr', { class: 'grp', role: 'row' }, h('td', { colspan: String(o.cols.length), role: 'gridcell', text: g })));
        if (g) lastG = g;
        var tr = h('tr', { id: o.id + '-' + i, role: 'row', 'aria-selected': String(row.id === selId), 'data-id': row.id, onclick: function (ev) {
          pick(row.id, false);
          if (!ev.target.closest || !ev.target.closest('button, a, input, select')) table.focus({ preventScroll: true });
        } });
        o.cols.forEach(function (c) {
          var td = h('td', { role: 'gridcell', class: [c.cls, c.frozen ? 'fz' : ''].join(' ').trim() || null, style: c.frozen ? 'left:' + c.left + 'px' : null, title: c.tip ? c.tip(row) : null });
          add(td, c.cell(row));
          tr.appendChild(td);
        });
        trs[row.id] = tr; tb.appendChild(tr);
      });
      if (!view.length) tb.appendChild(h('tr', null, h('td', { colspan: String(o.cols.length), class: 'lc-empty', text: o.empty || 'Không có hàng nào khớp bộ lọc.' })));
      clear(foot); add(foot, o.foot ? o.foot(view) : view.length + ' hàng');
      var cur = trs[selId]; if (cur) table.setAttribute('aria-activedescendant', cur.id); else table.removeAttribute('aria-activedescendant');
    }
    function pick(id, scrollTo) {
      if (id === selId && trs[id]) { if (scrollTo) trs[id].scrollIntoView({ block: 'nearest' }); return; }
      if (trs[selId]) trs[selId].setAttribute('aria-selected', 'false');
      selId = id;
      var tr = trs[id];
      if (tr) { tr.setAttribute('aria-selected', 'true'); table.setAttribute('aria-activedescendant', tr.id); if (scrollTo) tr.scrollIntoView({ block: 'nearest' }); }
      if (o.onSelect) o.onSelect(view[idx(id)] || null);
    }
    table.addEventListener('keydown', function (ev) {
      var t = ev.target, k = ev.key, n = view.length;
      if (!n || ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      var i = idx(selId), to = k === 'ArrowDown' || k === 'j' ? i + 1 : k === 'ArrowUp' || k === 'k' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? n - 1 : k === 'PageDown' ? i + 8 : k === 'PageUp' ? i - 8 : null;
      if (to !== null) { ev.preventDefault(); if (t !== table) table.focus({ preventScroll: true }); pick(view[Math.max(0, Math.min(n - 1, to))].id, true); return; }
      if ((k === ' ' || k === 'Enter') && t === table && o.onAct && i >= 0) { ev.preventDefault(); o.onAct(view[i]); }
    });
    return {
      el: el, table: table,
      // thay toàn bộ hàng; giữ hàng đang chọn nếu còn, không thì chọn hàng đầu (inspector luôn có gì để hiện)
      set: function (rs, want) {
        rows = rs; build();
        if (want && idx(want) >= 0) selId = want;
        else if (idx(selId) < 0) selId = view.length ? view[0].id : '';
        paintBody();
        if (o.onSelect) o.onSelect(view[idx(selId)] || null);
      },
      select: function (id) { pick(id, true); }, cur: function () { return view[idx(selId)] || null; }, rows: function () { return view; },
      rowEl: function (id) { return trs[id] || null; }, focus: function () { table.focus({ preventScroll: true }); }
    };
  }

  /* ---------------------------------------------------------------- ÂM THANH */
  // gói âm đã lưu trên máy (GET api/sound-packs) → GC.sounds; endpoint chưa có / lỗi → chỉ còn gói trong engine (net.server = false: không nhập được gói)
  function lsLoadPacks() {
    var S = GC.sounds;
    if (!S || Store.mode !== 'server') return Promise.resolve({ server: false, stored: {} });
    return Store.api('GET', 'api/sound-packs').then(function (l) {
      var stored = {};
      (Array.isArray(l) ? l : []).forEach(function (d) {
        if (!d || typeof d.id !== 'string') return;
        stored[d.id] = true;
        var cur = S.packs().filter(function (p) { return p.id === d.id; })[0];
        if (cur && cur.version === d.version) return;   // đã nạp lúc mở Studio
        var r0 = S.registerPack(d); if (r0.errors.length) console.warn('bỏ gói âm', d.id, r0.errors);
      });
      return { server: true, stored: stored };
    }).catch(function () { return { server: false, stored: {} }; });
  }
  function lsSig() { return GC.sounds.packs().map(function (p) { return p.id + '@' + p.version + ':' + p.count; }).join(','); }
  // dòng "cảnh tự gán" gọn cho một ô bảng: state:shock · fx:stars,tears · activity:attack · mood:epic
  function lsCueText(c) {
    if (!c) return '';
    var out = [];
    ['state', 'fx', 'activity', 'event'].forEach(function (k) { if (c[k] && c[k].length) out.push(k + ':' + c[k].join(',')); });
    if (c.mood && c.mood.length) out.push('mood:' + c.mood.join(','));
    return out.join(' · ');
  }
  // nhân vật đầu tiên của dự án (hoặc bất kỳ) để ví dụ JSON chạy được ngay
  function lsActor(project) {
    var all = GC.assets().filter(function (a) { return groupOf(a) !== 'frame'; }), a = all.filter(function (x) { return project && x.project === project; })[0] || all[0];
    return a ? a.id : 'ma-no-canh';
  }
  // MỘT bước kịch bản dùng âm này: âm NHẤN để ở bước không có lời (S3), âm thường đi kèm lời; state lấy từ cue nếu có
  function lsStep(x) {
    var st = { actor: lsActor(x.project), state: x.cue && x.cue.state && x.cue.state[0] ? x.cue.state[0] : 'normal' };
    if (x.accent) st.hold = 0.8; else st.say = '…';
    st.sfx = [x.name];
    return st;
  }
  // các dòng "n. …" của mục "Quy trình ghép" trong GC.sounds.guide() — cùng văn bản agent đọc (một nguồn, không chép tay)
  function lsGuideSteps(md) {
    var out = [], on = false;
    String(md).split('\n').forEach(function (l) {
      if (/^## /.test(l)) on = /^## Quy trình ghép/.test(l);
      else if (on && /^\d+\.\s/.test(l)) out.push(l.replace(/^\d+\.\s*/, ''));
    });
    return out;
  }
  // công thức ghép → các bước kịch bản (mỗi âm một bước; hold = khoảng tới âm kế)
  function lsRecipeSteps(rc, actor) {
    return rc.seq.map(function (x, i) {
      var nxt = rc.seq[i + 1], hold = nxt ? Math.max(0.4, Math.round((nxt[0] - x[0]) * 100) / 100) : 0.8;
      return { actor: actor, state: 'normal', hold: hold, sfx: [x[1]] };
    });
  }
  // thời gian (s) → "1,2 s"
  function lsSec(t) { return String(Math.round(t * 100) / 100).replace('.', ',') + ' s'; }

  PAGES['lib-sounds'] = function (r) {
    crumbs([{ t: 'Âm thanh' }]);
    var S = GC.sounds, A = GC.audio;
    if (!S || !A) { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: 'Bản này chưa nạp thư viện âm (engine/sounds.js).' })); return; }
    actions(h('span', { class: 'note', text: 'Hiệu ứng âm thanh dạng dữ liệu (' + S.FORMAT + ') — nghe, lọc, chép vào kịch bản.' }));
    var TABS = ['sounds', 'rules', 'packs'], canWav = typeof A.renderWav === 'function';
    var st = { tab: TABS.indexOf(r.tab) >= 0 ? r.tab : 'sounds', q: '', cat: '', tag: '', pack: S.packs().some(function (p) { return p.id === r.pack; }) ? r.pack : '', proj: '', sel: S.has(r.sound) ? r.sound : '' };
    var net = { server: false, stored: {} }, alive = true, host = h('div', { class: 'lc' }), tabsEl = h('div'), body = h('div', { class: 'lc-body' });
    host.appendChild(tabsEl); host.appendChild(body); $('view').appendChild(host);
    onLeave(function () { alive = false; document.removeEventListener('keydown', onSlash); });
    function remember() { route.tab = st.tab; route.sound = st.sel || undefined; try { localStorage.setItem(routeKey(APP), JSON.stringify(route)); } catch (e) { /* bỏ qua */ } }
    // phím "/" = nhảy vào ô tìm (như STD-07 §10), chỉ khi không đang gõ ở ô khác
    function onSlash(ev) {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((ev.target || {}).tagName || '') || st.tab !== 'sounds') return;
      var q = $('lsQ'); if (q) { ev.preventDefault(); q.focus(); q.select(); }
    }
    document.addEventListener('keydown', onSlash);
    function paintTabs() {
      clear(tabsEl).appendChild(lcTabs([['sounds', 'Âm', S.names().length], ['rules', 'Luật ghép', S.RULES.list.length], ['packs', 'Gói âm', S.packs().length]], st.tab, function (t) { st.tab = t; remember(); paintTabs(); paintTab(); }));
    }
    function paintTab() { clear(body); (st.tab === 'rules' ? paintRules : st.tab === 'packs' ? paintPacks : paintSounds)(body); }
    function play(name, btn) {
      var x = S.info(name); if (!x) return;
      A.unlock(); A.sfx(name);
      if (btn) { btn.setAttribute('data-playing', 'true'); setTimeout(function () { btn.removeAttribute('data-playing'); }, Math.max(250, x.dur * 1000)); }
    }
    // WAV dựng offline (không cần unlock) → tải về; nút khoá trong lúc dựng
    function wav(what, name, btn) {
      if (!canWav) return;
      btn.disabled = true;
      A.renderWav(what).then(function (buf) { downloadBlob(name + '.wav', new Blob([buf], { type: 'audio/wav' })); toast('Đã dựng ' + name + '.wav · ' + Math.round(buf.byteLength / 1024) + ' KB.'); })
        .catch(function (e) { toast('Không dựng được WAV: ' + e.message); }).then(function () { btn.disabled = false; });
    }
    function packName(p) { return p.frame ? 'Khung' : p.name; }
    function openSound(name) { st.tab = 'sounds'; st.cat = ''; st.tag = ''; st.q = ''; st.pack = ''; st.proj = ''; st.sel = name; remember(); paintTabs(); paintTab(); }

    /* ---- tab Âm ---- */
    function paintSounds(box) {
      var allTags = {};
      S.list().forEach(function (x) { x.tags.forEach(function (t) { allTags[t] = (allTags[t] || 0) + 1; }); });
      var q = h('input', { type: 'search', class: 'lc-q', id: 'lsQ', placeholder: 'Tìm không dấu…  ( / )', title: 'Tìm không dấu theo tên, nhãn, thẻ, câu “dùng khi”. Phím / để nhảy vào đây, ↓ để xuống bảng.', 'aria-label': 'Tìm âm', value: st.q, oninput: function () { st.q = q.value.trim(); refresh(); },
        onkeydown: function (ev) { if (ev.key === 'Escape') { q.value = ''; st.q = ''; refresh(); grid.focus(); } else if (ev.key === 'ArrowDown') { ev.preventDefault(); grid.focus(); } } });
      var dl = h('datalist', { id: 'lsTags' });
      Object.keys(allTags).sort(function (a, b) { return a.localeCompare(b, 'vi'); }).forEach(function (t) { dl.appendChild(h('option', { value: t, label: allTags[t] + ' âm' })); });
      function setTag(v) {
        var f = lcFold(v).trim(), hit = '';
        Object.keys(allTags).forEach(function (t) { if (!hit && lcFold(t) === f) hit = t; });
        if (v && !hit) toast('Không có thẻ “' + v + '” trong thư viện.');
        st.tag = hit; tagIn.value = hit; refresh();
      }
      var tagIn = h('input', { type: 'text', list: 'lsTags', placeholder: 'Thẻ…', 'aria-label': 'Lọc theo thẻ', style: 'width:132px', value: st.tag, onchange: function () { setTag(tagIn.value); }, onkeydown: function (ev) { if (ev.key === 'Enter') setTag(tagIn.value); } });
      var packSel = h('select', { 'aria-label': 'Lọc theo gói', onchange: function () { st.pack = packSel.value; refresh(); } });
      packSel.appendChild(h('option', { value: '', text: 'Mọi gói' }));
      S.packs().forEach(function (p) { packSel.appendChild(h('option', { value: p.id, text: packName(p) + ' · ' + p.count })); });
      packSel.value = st.pack;
      var projSel = h('select', { 'aria-label': 'Lọc theo dự án', title: 'Chỉ hiện âm mà dự án này dùng được (khung + gói dùng chung + gói của dự án) — luật S6', onchange: function () { st.proj = projSel.value; refresh(); } });
      projSel.appendChild(h('option', { value: '', text: 'Mọi dự án' })); projSel.appendChild(h('option', { value: '-', text: 'Không dự án (khung + gói chung)' }));
      var pids = [];
      S.packs().forEach(function (p) { if (p.project && pids.indexOf(p.project) < 0) pids.push(p.project); });
      Projects.all().forEach(function (p) { if (pids.indexOf(p.id) < 0) pids.push(p.id); });
      pids.forEach(function (id) { projSel.appendChild(h('option', { value: id, text: Projects.name(id) })); });
      projSel.value = st.proj;
      var count = h('span', { class: 'note lc-count' }), clearB = h('span', { class: 'lc-chipx', hidden: true });
      var chips = h('div', { class: 'fxchips lc-cats', role: 'group', 'aria-label': 'Lọc theo nhóm âm' }), chipEls = {};
      [['', 'Tất cả']].concat(S.CATS).forEach(function (c) {
        var n = h('span', { class: 'n' }), b = h('button', { type: 'button', 'data-cat': c[0], onclick: function () { st.cat = st.cat === c[0] ? '' : c[0]; refresh(); } }, c[1], n);
        chipEls[c[0]] = { b: b, n: n }; chips.appendChild(b);
      });
      var insp = h('aside', { class: 'lc-insp', 'aria-label': 'Chi tiết âm' });
      var grid = lcGrid({
        id: 'ls', label: 'Thư viện âm thanh', empty: 'Không có âm nào khớp bộ lọc.',
        cols: [
          { t: 'Nghe', w: 56, frozen: true, cell: function (x) { var b = lcPlay('Nghe ' + x.name, function (btn) { play(x.name, btn); }); b.setAttribute('data-play', x.name); return b; } },
          { t: 'ID âm', w: 132, frozen: true, cls: 'id', v: function (x) { return x.name; }, cell: function (x) { return x.name; }, tip: function (x) { return x.name; } },
          { t: 'Nhãn', w: 196, v: function (x) { return x.label; }, cell: function (x) { return x.label; }, tip: function (x) { return x.label; } },
          { t: 'Nhóm', w: 132, v: function (x) { return x.catLabel; }, cell: function (x) { return [x.catLabel, x.accent ? h('span', { class: 'tag acc', title: 'Âm NHẤN: mỗi bước tối đa 1 (S1)', text: 'nhấn' }) : null]; } },
          { t: 'Giây', w: 56, cls: 'num', v: function (x) { return x.dur; }, cell: function (x) { return vn(x.dur); } },
          { t: 'Dùng khi', w: 300, cls: 'mut', v: function (x) { return x.use; }, cell: function (x) { return x.use; }, tip: function (x) { return x.use; } },
          { t: 'Thẻ', w: 190, cell: function (x) { return x.tags.map(function (t) { return h('span', { class: 'tag', text: t }); }); }, tip: function (x) { return x.tags.join(', '); } },
          { t: 'Gói', w: 124, v: function (x) { return x.pack; }, cell: function (x) { var p = S.packs().filter(function (k) { return k.id === x.pack; })[0]; return p ? packName(p) : x.pack; } },
          { t: 'Dự án', w: 124, v: function (x) { return x.project; }, cell: function (x) { return x.project ? Projects.name(x.project) : '—'; } },
          { t: 'Cảnh tự gán (cue)', w: 230, cls: 'mono mut', v: function (x) { return lsCueText(x.cue); }, cell: function (x) { return lsCueText(x.cue) || '—'; }, tip: function (x) { return lsCueText(x.cue); } }
        ],
        group: function (x) { return x.catLabel + (x.accent ? ' · âm nhấn' : ''); },
        onSelect: function (x) { st.sel = x ? x.name : ''; remember(); inspect(x); },
        onAct: function (x) { play(x.name, grid.el.querySelector('[data-play="' + x.name + '"]')); },
        foot: function (v) {
          var sum = 0, cs = {}; v.forEach(function (x) { sum += x.dur; cs[x.cat] = 1; });
          return [v.length + ' âm · ' + Object.keys(cs).length + ' nhóm · Σ ' + vn(sum, 1) + ' s', h('span', { class: 'sp' }), '↑↓ chọn · Space nghe · / tìm'];
        }
      });
      box.appendChild(dl);
      box.appendChild(h('div', { class: 'stack', style: 'gap:8px' },
        h('div', { class: 'lc-bar' }, q, tagIn, packSel, projSel, clearB, h('span', { class: 'sp' }), count), chips,
        h('div', { class: 'lc-split' }, grid.el, insp)));
      var base = [];
      function refresh() {
        var o = {};
        if (st.q) o.q = st.q; if (st.tag) o.tag = st.tag; if (st.pack) o.pack = st.pack; if (st.proj) o.project = st.proj === '-' ? '' : st.proj;
        base = S.list(o);
        var cnt = {}; base.forEach(function (x) { cnt[x.cat] = (cnt[x.cat] || 0) + 1; });
        Object.keys(chipEls).forEach(function (k) { chipEls[k].n.textContent = String(k ? cnt[k] || 0 : base.length); chipEls[k].b.setAttribute('aria-pressed', String(st.cat === k)); });
        var rows = (st.cat ? base.filter(function (x) { return x.cat === st.cat; }) : base).map(function (x) { x.id = x.name; return x; });
        count.textContent = rows.length + ' / ' + S.names().length + ' âm';
        clear(clearB);
        var act = [st.tag ? 'thẻ: ' + st.tag : '', st.pack ? 'gói: ' + st.pack : ''].filter(Boolean);
        clearB.hidden = !act.length;
        if (act.length) { clearB.appendChild(document.createTextNode(act.join(' · '))); clearB.appendChild(h('button', { type: 'button', 'aria-label': 'Bỏ lọc thẻ / gói', title: 'Bỏ lọc thẻ / gói', onclick: function () { st.tag = ''; st.pack = ''; tagIn.value = ''; packSel.value = ''; refresh(); } }, '×')); }
        grid.set(rows, st.sel);
      }

      /* Inspector 400 px: nhãn · nghe / tải WAV / chép · cue · JSON một bước + gọi MCP */
      function inspect(row) {
        clear(insp);
        var x = row && S.info(row.name);
        if (!x) { insp.appendChild(h('div', { class: 'panel pad note', text: 'Chọn một âm trong bảng để xem chi tiết.' })); return; }
        var P = S.packs().filter(function (p) { return p.id === x.pack; })[0] || {}, step = lsStep(x);
        var hear = h('button', { class: 'btn primary lc-ic', type: 'button', id: 'lsHear', 'aria-label': 'Nghe ' + x.name, onclick: function () { play(x.name, hear); } }, lcIcon('play'), 'Nghe');
        var acts = h('div', { class: 'row' }, hear,
          canWav ? lcBtn('down', 'Tải WAV', { title: 'Dựng offline 44,1 kHz stereo rồi tải ' + x.name + '.wav', label: 'Tải WAV ' + x.name, fn: function (b) { wav(x.name, x.name, b); } }) : null,
          lcBtn('copy', 'Chép tên', { title: 'Chép tên âm để đặt vào step.sfx', label: 'Chép tên ' + x.name, fn: function () { copyText(x.name, 'tên âm “' + x.name + '”'); } }));
        var tags = h('div', { class: 'row', style: 'gap:2px' }, x.tags.map(function (t) {
          return h('button', { type: 'button', class: 'tag', title: 'Lọc theo thẻ “' + t + '”', onclick: function () { st.tag = t; tagIn.value = t; refresh(); } }, t);
        }));
        var cueEls = [];
        ['state', 'fx', 'activity', 'event'].forEach(function (k) {
          if (x.cue && x.cue[k] && x.cue[k].length) cueEls.push(h('div', { class: 'lc-cue' }, h('span', { class: 'k', text: k }), x.cue[k].map(function (v) { return h('span', { class: 'tag', text: v }); })));
        });
        var kv = h('dl', { class: 'lc-kv' },
          h('dt', { text: 'Nhóm' }), h('dd', null, x.catLabel, ' ', x.accent ? h('span', { class: 'tag acc', text: 'âm nhấn' }) : null),
          h('dt', { text: 'Thời lượng' }), h('dd', { text: vn(x.dur) + ' s · độ to ' + vn(x.level) + ' · ' + x.nodes + ' node' }),
          h('dt', { text: 'Gói' }), h('dd', null, packName(P), ' ', h('span', { class: 'tag', text: x.pack }), P.version ? h('span', { class: 'note mono', text: ' v' + P.version }) : null),
          h('dt', { text: 'Dự án' }), h('dd', { text: x.project ? Projects.name(x.project) : 'Dùng chung mọi dự án' }));
        var code = codeBox([
          ['Bước kịch bản (JSON)', function () { return JSON.stringify(step, null, 2); }],
          ['Gọi MCP', function () { return mcpCall('lint_sound_track', { project: x.project || '', steps: [step] }) + '\n\n// Tra cứu / lấy công thức:\nlist_sounds ' + JSON.stringify({ q: x.name }) + '\nget_sound_pack ' + JSON.stringify({ id: x.pack, names: [x.name] }); }]
        ]);
        var notes = [];
        if (x.accent) notes.push('Âm NHẤN: mỗi bước tối đa 1 âm nhấn, để ở bước không có lời hoặc trước câu thoại (S1, S3).');
        if (x.hitAt != null) notes.push('Điểm va ở ' + lsSec(x.hitAt) + ' sau khi bắt đầu — đặt ở bước TRƯỚC khung trúng đòn.');
        if (x.dur > S.RULES.long.dur) notes.push('Âm dài (' + vn(x.dur) + ' s) chỉ ở bước đầu / cuối cảnh (S7).');
        insp.appendChild(h('div', { class: 'panel' }, h('h3', null, h('span', { text: x.label }), h('span', { class: 'r mono', text: x.name })),
          h('div', { class: 'pad stack' }, acts, kv,
            h('div', null, h('div', { class: 'lc-sec', text: 'Dùng khi' }), h('p', { class: 'lc-use', text: x.use })),
            h('div', null, h('div', { class: 'lc-sec', text: 'Thẻ' }), tags),
            h('div', null, h('div', { class: 'lc-sec', text: 'Cảnh tự gán (cue)' }),
              cueEls.length ? h('div', { class: 'stack', style: 'gap:4px' }, cueEls, x.cue && x.cue.mood ? h('p', { class: 'lc-hint', text: 'Chỉ khi không khí cảnh là: ' + x.cue.mood.join(' · ') }) : null)
                : h('p', { class: 'lc-hint', text: 'Không tự gán — chỉ phát khi đặt tay vào step.sfx.' })),
            h('div', null, h('div', { class: 'lc-sec', text: 'Dùng trong kịch bản' }), code),
            notes.length ? h('div', { class: 'stack', style: 'gap:4px' }, notes.map(function (n) { return h('p', { class: 'lc-hint warn', text: n }); })) : null,
            P.frame || !P.id ? null : h('div', { class: 'usebar' }, h('b', { text: 'Gói' }), h('span', { class: 'note', text: packName(P) + ' · ' + P.count + ' âm' }),
              lcBtn('down', 'Tải gói (.json)', { label: 'Tải gói ' + P.id, fn: function () { download(P.id + '.json', JSON.stringify(S.pack(P.id), null, 2), 'application/json'); } })))));
      }
      refresh();
      if (!st.sel) grid.focus();
    }

    /* ---- tab Luật ghép: S1–S7 + quy trình + công thức mẫu + kiểm thử (mọi chữ lấy từ GC.sounds — một nguồn với agent) ---- */
    function paintRules(box) {
      var R = S.RULES, steps = lsGuideSteps(S.guide());
      var lim = [
        '≤ ' + R.maxPerStep + ' âm mỗi bước', '≤ ' + R.maxAccent + ' âm nhấn mỗi bước', '≤ ' + R.density.max + ' âm / ' + R.density.window + ' s', 'cùng âm ≤ ' + R.repeat.max + ' bước liền',
        'âm dài > ' + R.long.dur + ' s chỉ ở đầu / cuối cảnh', 'tự gán ≤ ' + R.autoMax + ' âm mỗi bước'];
      var flow = h('div', { class: 'panel' }, h('h3', null, 'Quy trình ghép', h('span', { class: 'r note', text: 'cùng văn bản agent đọc (get_sound_spec / guide)' })),
        h('div', { class: 'pad stack' }, h('ol', { class: 'lc-steps' }, steps.map(function (s) { return h('li', null, lcMd(s)); })),
          h('div', { class: 'row', style: 'gap:4px' }, h('span', { class: 'note', text: 'Ngưỡng:' }), lim.map(function (t) { return h('span', { class: 'tag', text: t }); }))));
      var rules = h('div', { class: 'panel' }, h('h3', null, 'Bảy luật S1–S7', h('span', { class: 'r note mono', text: 'GC.sounds.RULES · lintSoundTrack · save_shot / save_work chạy cùng bộ luật' })),
        h('table', { class: 'lc-rules', 'aria-label': 'Bảy luật ghép âm' }, h('thead', null, h('tr', null, h('th', { text: 'Mã' }), h('th', { text: 'Mức' }), h('th', { text: 'Luật' }))),
          h('tbody', null, R.list.map(function (x) {
            return h('tr', { 'data-rule': x.code }, h('td', { class: 'code', text: x.code }), h('td', { class: 'lv' }, x.level === 'error' ? lcState('bad', 'Lỗi — chặn lưu') : lcState('warn', 'Cảnh báo')), h('td', { text: x.rule }));
          }))));
      var recs = h('div', { class: 'panel' }, h('h3', null, 'Công thức ghép mẫu', h('span', { class: 'r note', text: S.RECIPES.length + ' công thức · đà → va → hậu quả' })),
        h('div', { class: 'lc-recipes' }, S.RECIPES.map(function (rc) {
          var seq = h('div', { class: 'seq' });
          rc.seq.forEach(function (x, i) {
            if (i) seq.appendChild(h('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }));
            seq.appendChild(h('span', { class: 't', text: lsSec(x[0]) }));
            seq.appendChild(h('button', { type: 'button', class: 'tag', title: 'Mở “' + x[1] + '” trong bảng Âm', onclick: function () { openSound(x[1]); } }, x[1]));
          });
          var hearB = h('button', { class: 'btn sm primary lc-ic', type: 'button', 'data-recipe': rc.id, 'aria-label': 'Nghe chuỗi ' + rc.id, onclick: function () {
            A.unlock(); rc.seq.forEach(function (x) { A.sfx(x[1], { delay: x[0] }); });
            var end = rc.seq[rc.seq.length - 1][0] + ((S.info(rc.seq[rc.seq.length - 1][1]) || {}).dur || 0.5);
            hearB.setAttribute('data-playing', 'true'); setTimeout(function () { hearB.removeAttribute('data-playing'); }, end * 1000 + 200);
          } }, lcIcon('play'), 'Nghe chuỗi');
          return h('div', { class: 'lc-recipe', 'data-id': rc.id }, h('div', null, h('b', { text: rc.label }), h('p', { class: 'lc-hint', text: rc.note })), seq,
            h('div', { class: 'acts' }, hearB,
              canWav ? lcBtn('down', 'Tải WAV', { label: 'Tải WAV chuỗi ' + rc.id, fn: function (b) { wav(rc.seq.map(function (x) { return [x[0], x[1]]; }), rc.id, b); } }) : null,
              lcBtn('copy', 'Chép các bước', { title: 'Chép mảng bước kịch bản (mỗi âm một bước)', label: 'Chép các bước ' + rc.id, fn: function () { copyText(JSON.stringify(lsRecipeSteps(rc, lsActor('')), null, 2), 'các bước của “' + rc.id + '”'); } })));
        })));
      // kiểm thử chuỗi bước bằng đúng bộ luật của server
      var ta = h('textarea', { class: 'code', id: 'lsLintIn', rows: '9', spellcheck: 'false', 'aria-label': 'Các bước kịch bản (JSON) để kiểm luật ghép' });
      ta.value = JSON.stringify(lsRecipeSteps(S.RECIPES[0], lsActor('')), null, 2);
      var lp = h('select', { 'aria-label': 'Dự án để tra gói âm' }), out = h('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
      lp.appendChild(h('option', { value: '', text: 'Không dự án (khung + gói chung)' }));
      var pj = []; S.packs().forEach(function (p) { if (p.project && pj.indexOf(p.project) < 0) pj.push(p.project); });
      Projects.all().forEach(function (p) { if (pj.indexOf(p.id) < 0) pj.push(p.id); });
      pj.forEach(function (id) { lp.appendChild(h('option', { value: id, text: Projects.name(id) })); });
      function lint() {
        clear(out);
        var steps2;
        try { steps2 = JSON.parse(ta.value); } catch (e) { out.appendChild(h('p', { class: 'lc-msg bad', role: 'alert', text: 'Không phải JSON: ' + e.message })); return; }
        if (!Array.isArray(steps2)) steps2 = steps2 && Array.isArray(steps2.steps) ? steps2.steps : [steps2];
        var iss = S.lintSoundTrack(steps2, { project: lp.value }), er = iss.filter(function (i) { return i.level === 'error'; }).length, wn = iss.length - er;
        out.appendChild(h('p', { class: 'lc-msg ' + (er ? 'bad' : wn ? 'warn' : 'ok'), 'data-lint': er + '/' + wn, text: er + ' lỗi · ' + wn + ' cảnh báo' + (iss.length ? '' : ' — chuỗi này qua cả bảy luật.') }));
        if (iss.length) out.appendChild(h('ul', { class: 'lc-issues' }, iss.map(function (i) {
          return h('li', null, h('span', { class: 'code', text: i.code }), i.level === 'error' ? lcState('bad', 'Lỗi') : lcState('warn', 'Cảnh báo'), h('span', null, h('span', { class: 'p', text: (i.path || '') + (i.path ? ' ' : '') }), i.msg));
        })));
      }
      var lintP = h('div', { class: 'panel lc-lint' }, h('h3', null, 'Thử kiểm luật', h('span', { class: 'r note', text: 'dán các bước (steps) — kết quả như lint_sound_track' })),
        h('div', { class: 'pad stack' }, ta, h('div', { class: 'row' }, lp, h('button', { class: 'btn primary', type: 'button', id: 'lsLintGo', onclick: lint }, 'Kiểm S1–S7'),
          h('span', { class: 'note', text: 'Lỗi (S1, S6) chặn lưu phân cảnh; cảnh báo (S2–S5, S7) chỉ nhắc.' })), out));
      box.appendChild(h('div', { class: 'stack' }, flow, rules, recs, lintP));
    }

    /* ---- tab Gói âm: danh sách · tải JSON · nhập (kiểm cổng, lỗi kèm path) ---- */
    function paintPacks(box) {
      var impProj = (function (v) { var P = Projects.list.filter(function (x) { return x.id === v; })[0]; return P && P.sample ? '' : v; })(lastProject());
      var sampleOf = function (pid) { var pj = pid ? Projects.all().filter(function (x) { return x.id === pid; })[0] : null; return pj && pj.sample ? pj.sample : null; };
      var tbl = h('table', { class: 'grid', 'aria-label': 'Gói âm' }), th = h('tr');
      ['ID gói', 'Tên', 'Dự án', 'Phiên bản', 'Số âm', 'Trạng thái', 'Nguồn', ''].forEach(function (t) { th.appendChild(h('th', { text: t })); });
      tbl.appendChild(h('thead', null, th));
      var tb = h('tbody'); tbl.appendChild(tb);
      S.packs().forEach(function (p) {
        var smp = p.status === 'published' ? sampleOf(p.project) : null, act = h('span', { class: 'acts' },   // dấu "bộ mẫu" chỉ cho gói phát hành của dự án mẫu (gói người dùng nhập vào đó vẫn là nháp của họ)

          lcBtn(null, 'Xem âm', { label: 'Xem âm của gói ' + p.id, fn: function () { st.tab = 'sounds'; st.pack = p.id; st.cat = ''; remember(); paintTabs(); paintTab(); } }),
          p.frame ? null : lcBtn('down', 'Tải JSON', { label: 'Tải gói ' + p.id, fn: function () { download(p.id + '.json', JSON.stringify(S.pack(p.id), null, 2), 'application/json'); } }));
        tb.appendChild(h('tr', { 'data-pack': p.id }, h('td', { class: 'id', text: p.id }), h('td', null, p.frame ? 'Bộ âm chuẩn (khung)' : p.name),
          h('td', { text: p.project ? Projects.name(p.project) : p.frame ? 'mọi dự án' : 'dùng chung' }), h('td', { class: 'v', text: 'v' + p.version }), h('td', { class: 'v', text: String(p.count) }),
          h('td', null, smp ? h('span', { class: 'chip', title: smp.license || '', text: 'Bộ mẫu ' + (smp.owner || 'Gen Labs') }) : p.frame ? h('span', { class: 'chip', text: 'Khung' }) : p.status === 'published' ? h('span', { class: 'chip ok', text: 'Phát hành' }) : h('span', { class: 'chip', text: 'Nháp' })),
          h('td', { class: 'note', text: p.frame ? 'trong engine' : net.stored[p.id] ? 'đã lưu trên máy' : 'nạp trong phiên' }), h('td', { class: 'nw' }, act)));
      });
      // nhập gói
      var ta = h('textarea', { class: 'code', id: 'lsImport', rows: '7', spellcheck: 'false', 'aria-label': 'JSON của gói âm', placeholder: '{ "format": "' + S.FORMAT + '", "id": "ten-goi", "name": "…", "sounds": { … } }' });
      var res = h('div', { class: 'stack', style: 'gap:6px' });
      function say(kind, head, list) {
        clear(res);
        res.appendChild(h('p', { class: 'lc-msg ' + kind, role: kind === 'bad' ? 'alert' : 'status', text: head }));
        if (list && list.length) res.appendChild(h('ul', { class: 'errs', style: 'margin:0' }, list.slice(0, 30).map(function (m) { return h('li', { text: '✗ ' + m }); })));
      }
      function parse() {
        var d;
        try { d = JSON.parse(ta.value); } catch (e) { say('bad', 'Không phải JSON: ' + e.message); return null; }
        if (!d || typeof d !== 'object' || Array.isArray(d)) { say('bad', 'Gói âm phải là một object JSON (' + S.FORMAT + ').'); return null; }
        return d;
      }
      // cổng kiểm + tên âm không trùng gói khác (tên âm là chung toàn thư viện) — cùng luật server chạy
      function check(d) {
        var c = S.validateSoundPack(d), errs = c.errors.slice();
        if (!errs.length) Object.keys(c.def.sounds).forEach(function (nm) { var o = S.get(nm); if (o && o.pack !== c.def.id) errs.push('sounds.' + nm + ': trùng tên âm của gói "' + o.pack + '" — tên âm là chung toàn thư viện, đổi tên'); });
        return { errors: errs, def: errs.length ? null : c.def };
      }
      function onlyCheck() {
        var d = parse(); if (!d) return;
        var c = check(d);
        if (c.errors.length) { say('bad', 'Gói chưa qua cổng kiểm — ' + c.errors.length + ' lỗi', c.errors); return; }
        var names = Object.keys(c.def.sounds);
        say('ok', 'Gói hợp lệ: “' + c.def.name + '” — ' + names.length + ' âm (' + names.slice(0, 6).join(', ') + (names.length > 6 ? '…' : '') + '). Chưa lưu gì.');
      }
      var impB = h('button', { class: 'btn primary', type: 'button', id: 'lsImportGo', disabled: net.server ? null : true, title: net.server ? 'Kiểm rồi lưu vào thư viện (có phiên bản)' : 'Cần bản cài có máy chủ hỗ trợ gói âm (api/sound-packs)', onclick: function () {
        var d = parse(); if (!d) return;
        var c = check(d);
        if (c.errors.length) { say('bad', 'Gói chưa qua cổng kiểm — ' + c.errors.length + ' lỗi', c.errors); return; }
        var body2 = impProj ? Object.assign({}, d, { project: impProj }) : d;
        impB.disabled = true;
        Store.api('POST', 'api/sound-packs', { pack: body2, note: 'Nhập trong Studio' }).then(function (rec) {
          var warns = Array.isArray(rec.warnings) ? rec.warnings : []; rec = clone(rec); delete rec.warnings;   // warnings không phải khoá của gói
          var r1 = S.registerPack(rec);
          if (r1.errors.length) throw Object.assign(new Error('Server đã lưu nhưng Studio không nạp được gói'), { errors: r1.errors });
          net.stored[r1.def.id] = true;
          toast('Đã nhập gói “' + r1.def.name + '” (' + Object.keys(r1.def.sounds).length + ' âm).');
          paintTabs(); paintTab();
          if (warns.length) say('warn', 'Đã lưu, nhưng có cảnh báo:', warns);
        }).catch(function (e) { say('bad', e.status === 422 ? 'Gói chưa qua cổng kiểm của máy chủ' : e.status === 404 ? 'Máy chủ này chưa hỗ trợ gói âm (api/sound-packs)' : e.message, e.errors || (e.status === 422 ? [e.message] : null)); impB.disabled = !net.server; });
      } }, 'Nhập vào thư viện');
      function pickFile() {
        var inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: function () {
          var f = inp.files && inp.files[0]; inp.remove();
          if (!f) return;
          if (f.size > S.BUDGET.bytes * 2) { say('bad', 'Tệp quá lớn (gói âm tối đa ' + Math.round(S.BUDGET.bytes / 1000) + ' KB).'); return; }
          f.text().then(function (t) { ta.value = t; onlyCheck(); });
        } });
        document.body.appendChild(inp); inp.click();
      }
      var note = net.server ? null : h('p', { class: 'lc-msg', text: Store.mode === 'server' ? 'Máy chủ này chưa có api/sound-packs — chỉ xem được gói có sẵn trong engine; vẫn kiểm gói được nhưng chưa lưu được.' : 'Bản xem thử không có máy chủ: kiểm được gói nhưng không lưu được. Cài bản máy chủ để nhập gói.' });
      box.appendChild(h('div', { class: 'stack' },
        h('div', { class: 'panel' }, h('h3', null, 'Gói âm', h('span', { class: 'r note', text: S.packs().length + ' gói · tên âm là chung toàn thư viện' })), h('div', { class: 'scroll' }, tbl)),
        h('div', { class: 'panel lc-import' }, h('h3', null, 'Nhập gói âm', h('span', { class: 'r note', text: 'qua cổng kiểm như MCP / AI — gói không chứa mã' })),
          h('div', { class: 'pad stack' }, note,
            h('div', { class: 'row' }, lcBtn('up', 'Chọn tệp .json', { label: 'Chọn tệp gói âm', fn: pickFile }), h('span', { class: 'note', text: 'hoặc dán JSON vào ô dưới' }), h('span', { class: 'sp', style: 'flex:1' }),
              net.server ? h('span', { class: 'note', text: 'Nhập vào dự án' }) : null, net.server ? projectSelect(impProj, function (v) { impProj = v; }) : null),
            ta, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', id: 'lsCheck', onclick: onlyCheck }, 'Kiểm gói (không lưu)'), impB), res))));
    }

    paintTabs(); paintTab();
    lsLoadPacks().then(function (n) {
      if (!alive) return;
      var before = lsSig(), was = net.server; net = n;
      if (lsSig() !== before || was !== n.server) { paintTabs(); paintTab(); }   // gói đã lưu mới nạp xong / đổi trạng thái máy chủ → vẽ lại, giữ nguyên bộ lọc (nằm trong st)
    });
  };

  /* ---------------------------------------------------------------- GIỌNG */
  // Câu mẫu nghe thử theo VAI × NGÔN NGỮ — SỬA Ở ĐÂY (một chỗ duy nhất). Đổi chữ thì clip AI đã đọc không còn khớp: nghe lại tốn 1 lượt.
  // Mỗi câu ≤ 240 ký tự (trần của server). Tiếng Quảng Đông (yue) viết chữ phồn thể + khẩu ngữ (喺 / 咩 / 我哋) — model đọc theo chữ. Thiếu câu → VOICE_SAMPLE.
  var VOICE_LINES = {
    vi: {
      'be-trai': 'Mẹ ơi, mẹ ơi! Con bắt được con dế to lắm này!', 'be-gai': 'Anh ơi, chờ em với! Em cũng muốn đi hái hoa nữa!',
      'thieu-nien': 'Cho em đi theo với! Em hứa sẽ không làm vướng chân ai đâu.', 'thieu-nu': 'Hôm nay trời đẹp quá, mình rủ nhau ra bờ sông đi!',
      'nam-tre': 'Chào bạn, mình là người mới đến. Rất mong được chỉ giáo.', 'nu-tre': 'Cảm ơn anh đã giúp, em không biết phải nói sao cho phải.',
      'hiep-khach': 'Kiếm trong tay, lòng không sợ. Ai muốn qua cầu, phải qua ta trước.', 'nu-tuong': 'Toàn quân nghe lệnh! Giữ vững thành, không lùi nửa bước!',
      'tieu-thu': 'Hoa rơi nước chảy, xuân đã qua rồi, biết gửi tình về đâu.', 'nam-trung-nien': 'Việc đã đến nước này, ta phải bình tĩnh mà tính cho kỹ.',
      'nu-trung-nien': 'Cơm nước xong hết rồi, con ngồi xuống ăn đi kẻo nguội.', 'vo-tuong': 'Ta là đại tướng của nước này! Kẻ nào dám tiến thêm một bước, chém!',
      'quan-su': 'Binh pháp có câu: biết người biết ta, trăm trận trăm thắng.', 'vua-chua': 'Trẫm tin ở các khanh. Giang sơn này, trông cậy cả vào các người.',
      'hoang-hau': 'Bệ hạ đừng lo, thiếp đã sắp xếp mọi việc trong cung chu toàn.', 'phan-dien': 'Hà hà… ngươi tưởng ta không biết kế của ngươi sao?',
      'nu-phan-dien': 'Ngoan ngoãn nghe lời, ta sẽ để ngươi sống thêm vài ngày.', 'hai-huoc': 'Ối trời ơi! Đại ca ơi, em quên mang tiền rồi, hi hi!',
      'nu-hai-huoc': 'Trời ơi, mặt anh kìa! Em cười không nổi nữa, ha ha ha!', 'ong-lao': 'Con à, đời người như chén trà, đắng rồi mới thấy ngọt.',
      'ba-lao': 'Lại đây với bà nào, bà kể con nghe chuyện ngày xưa.', 'ke-chuyen': 'Ngày xửa ngày xưa, ở một vùng đất xa xôi, có một người anh hùng.'
    },
    en: {
      'be-trai': 'Mom, mom! Look, I caught a huge cricket!', 'be-gai': 'Wait for me, brother! I want to pick flowers too!',
      'thieu-nien': 'Let me come along! I promise I won\'t get in the way.', 'thieu-nu': 'The weather is so nice today, let\'s go down to the river!',
      'nam-tre': 'Hi, I\'m new around here. I\'d really appreciate your advice.', 'nu-tre': 'Thank you so much for helping me. I don\'t know how to repay you.',
      'hiep-khach': 'Sword in hand, heart without fear. Whoever wants to cross this bridge must pass me first.', 'nu-tuong': 'All troops, hear my order! Hold the wall, not one step back!',
      'tieu-thu': 'Petals fall and waters flow, spring has gone. Where can I send my heart?', 'nam-trung-nien': 'It has come to this. We must stay calm and plan carefully.',
      'nu-trung-nien': 'Dinner is ready. Sit down and eat before it gets cold.', 'vo-tuong': 'I am the general of this kingdom! Anyone who takes one more step dies!',
      'quan-su': 'As the art of war says: know your enemy and know yourself, and you will win every battle.', 'vua-chua': 'I put my trust in you all. This realm depends on every one of you.',
      'hoang-hau': 'Do not worry, Your Majesty. I have arranged everything in the palace.', 'phan-dien': 'Heh heh... did you really think I didn\'t know your plan?',
      'nu-phan-dien': 'Be obedient, and I may let you live a few more days.', 'hai-huoc': 'Oh no! Boss, I forgot my wallet, hee hee!',
      'nu-hai-huoc': 'Oh my gosh, look at your face! I can\'t stop laughing, ha ha ha!', 'ong-lao': 'My child, life is like a cup of tea: bitter first, then sweet.',
      'ba-lao': 'Come sit with grandma, and I\'ll tell you stories from long ago.', 'ke-chuyen': 'Once upon a time, in a land far away, there lived a hero.'
    },
    zh: {
      'be-trai': '妈妈，妈妈！我抓到一只好大的蟋蟀！', 'be-gai': '哥哥等等我！我也想去采花！', 'thieu-nien': '带我一起去吧！我保证不会拖后腿的。', 'thieu-nu': '今天天气真好，我们一起去河边玩吧！',
      'nam-tre': '你好，我是新来的，请多多指教。', 'nu-tre': '谢谢你帮我，我真不知道该怎么感谢你。', 'hiep-khach': '剑在手，心无惧。想过此桥，先过我这一关。', 'nu-tuong': '全军听令！死守城池，不得后退半步！',
      'tieu-thu': '花落水流春去也，我这一腔心事，该寄往何处？', 'nam-trung-nien': '事已至此，我们必须冷静，仔细谋划。', 'nu-trung-nien': '饭菜都做好了，快坐下吃吧，别凉了。', 'vo-tuong': '吾乃本国大将军！谁敢再上前一步，格杀勿论！',
      'quan-su': '兵法有云：知己知彼，百战不殆。', 'vua-chua': '朕信得过各位爱卿。这万里江山，全靠你们了。', 'hoang-hau': '陛下放心，后宫诸事，臣妾都已安排妥当。', 'phan-dien': '哈哈……你以为我不知道你的计策吗？',
      'nu-phan-dien': '乖乖听话，我就让你多活几天。', 'hai-huoc': '哎呀妈呀！大哥，我忘带钱了，嘿嘿！', 'nu-hai-huoc': '天哪，你看你那张脸！我笑得停不下来了，哈哈哈！', 'ong-lao': '孩子，人生就像一杯茶，先苦后甘。',
      'ba-lao': '过来，坐到奶奶身边，奶奶给你讲讲从前的故事。', 'ke-chuyen': '很久很久以前，在一个遥远的地方，住着一位英雄。'
    },
    yue: {
      'be-trai': '媽咪媽咪！我捉到一隻好大隻嘅蟋蟀呀！', 'be-gai': '哥哥等埋我啦！我都想去摘花呀！', 'thieu-nien': '帶埋我去啦！我保證唔會阻手阻腳。', 'thieu-nu': '今日天氣咁好，我哋一齊去河邊玩啦！',
      'nam-tre': '你好，我係新嚟嘅，請多多指教。', 'nu-tre': '多謝你幫我，我真係唔知點樣報答你。', 'hiep-khach': '劍喺手，心無懼。想過呢道橋，先過我呢關。', 'nu-tuong': '全軍聽令！死守城池，唔准退後半步！',
      'tieu-thu': '花落水流春去也，我呢啲心事，應該寄去邊度？', 'nam-trung-nien': '事已至此，我哋一定要冷靜，仔細諗清楚。', 'nu-trung-nien': '飯菜煮好喇，快啲坐低食啦，凍咗就唔好食喇。', 'vo-tuong': '本將軍喺此！邊個再前進一步，格殺勿論！',
      'quan-su': '兵法有云：知己知彼，百戰百勝。', 'vua-chua': '朕信得過各位愛卿。呢個江山，就靠你哋喇。', 'hoang-hau': '陛下放心，後宮嘅事，臣妾都安排妥當喇。', 'phan-dien': '哈哈……你以為我唔知你嘅計謀咩？',
      'nu-phan-dien': '乖乖聽話，我就畀你多活幾日。', 'hai-huoc': '哎呀！大佬，我唔記得帶錢呀，嘿嘿！', 'nu-hai-huoc': '我嘅天呀，睇下你張面！我笑到停唔到呀，哈哈哈！', 'ong-lao': '乖仔，人生好似一杯茶，先苦後甜。',
      'ba-lao': '嚟，坐喺嫲嫲身邊，嫲嫲講啲以前嘅故事畀你聽。', 'ke-chuyen': '好耐好耐以前，喺一個好遠嘅地方，住咗一位英雄。'
    }
  };
  function lvLine(lang, role) { var L = VOICE_LINES[lang] || {}; return L[role] || VOICE_SAMPLE[lang] || VOICE_SAMPLE.vi; }

  // bộ nhớ của trang Giọng: cast đã biết (lang|giọng vùng|vai → { voice, source, label }) + lời gọi đang bay
  var LV = { cv: {}, cp: {} };
  // giọng AI mà server sẽ chọn cho MỘT vai (api/voice/cast với một diễn viên mang id = vai — cùng cách bảng "Bộ giọng vai" ở Cài đặt AI): không tốn lượt
  function lvCast(role, lang, accent) {
    var k = lang + '|' + accent + '|' + role;
    if (LV.cv[k]) return Promise.resolve(LV.cv[k]);
    if (LV.cp[k]) return LV.cp[k];
    LV.cp[k] = Store.api('POST', 'api/voice/cast', { lang: lang, accent: accent, actors: [{ id: role, role: role, gender: GC.voices.ROLES[role].gender }] }).then(function (r) {
      var c = r && r.cast && r.cast[role]; delete LV.cp[k];
      if (!c || !c.voice) throw new Error('Server không chọn được giọng cho vai này');
      LV.cv[k] = c; return c;
    }, function (e) { delete LV.cp[k]; throw e; });
    return LV.cp[k];
  }
  function lvReset() { LV.cv = {}; LV.cp = {}; AiVoice.casts = {}; AiVoice.libs = {}; }   // sau khi thiết kế giọng / đổi key: cast tính lại
  function lvErr(e) { return e && e.status === 429 ? AiVoice.quotaText(e) : (e && e.message) || 'Lỗi giọng AI'; }
  function lvOffWhy() {
    if (Store.mode !== 'server') return 'Bản xem thử không có máy chủ — chỉ nghe được giọng máy.';
    var c = AiVoice.cfg;
    return !c ? 'Không đọc được trạng thái giọng AI.' : !c.hasKey ? 'Chưa có key Google — dán ở Cài đặt AI › Giọng AI.' : 'Giọng AI đang tắt — bật ở Cài đặt AI › Giọng AI.';
  }
  function lvReady() { return AiVoice.on() && AiVoice.ready(); }
  // clip mẫu ĐÃ CÓ (dry: không gọi Google, không tốn lượt). Server: 404 hoặc { found: false } khi chưa đọc → { found: false }
  function lvLookup(p) {
    var hit = AiVoice.clips.get(AiVoice.keyOf(p));
    if (hit) return Promise.resolve({ found: true, buf: hit });
    return Store.api('POST', 'api/voice/line', Object.assign({}, p, { dry: true })).then(function (r) { return r && r.url ? { found: true, url: r.url } : { found: false }; }, function (e) { if (e.status === 404) return { found: false }; throw e; });
  }
  function lvBuf(p, res) { return res.buf ? Promise.resolve(res.buf) : AiVoice.download(res.url).then(function (buf) { AiVoice.keep(AiVoice.keyOf(p), buf); return buf; }); }
  function lvSpeak(g, buf) { GC.audio.unlock(); return AiVoice.speak(g.p.text, buf, g.machine()); }

  // Nút giọng AI của MỘT dòng (hàng bảng hoặc Inspector). getP() → { p: tham số api/voice/line, machine(): giọng máy dự phòng } | null (chưa có giọng để đọc).
  // Trạng thái: off (chưa sẵn sàng) · nop (chưa có giọng) · wait (đang kiểm clip đã có) · have (▶ AI — miễn phí) · none ("Đọc mẫu bằng AI (1 lượt)", bấm 2 lần) · busy.
  // o: { who (tên cho aria-label), full (nhãn đầy đủ trong Inspector), nopWhy, onSpend() }
  function lvAiCtl(getP, o) {
    o = o || {};
    var c = { el: h('span', { class: 'lv-pair' }), note: h('p', { class: 'lc-hint warn', role: 'status', hidden: true }), phase: 'idle', res: null, arm: 0, btn: null }, seq = 0, armT = 0;
    function who() { return o.who ? ' — ' + o.who : ''; }
    function say(t) { c.note.textContent = t || ''; c.note.hidden = !t; }
    c.paint = function () {
      clear(c.el);
      var g = lvReady() ? getP() : null, ph = !lvReady() ? 'off' : !g ? 'nop' : c.phase, b;
      if (ph === 'off' || ph === 'nop') {
        b = h('button', { class: 'btn lv-ai lc-ic', type: 'button', disabled: true, 'data-ai': ph, 'aria-label': 'Nghe giọng AI' + who(), title: ph === 'off' ? lvOffWhy() : (o.nopWhy || 'Chưa có giọng AI cho dòng này') }, lcIcon('play'), o.full ? 'Nghe giọng AI' : 'AI');
      } else if (ph === 'none' || ph === 'busy') {
        var armed = c.arm === 1 && ph === 'none';
        b = h('button', { class: 'btn lv-ai cost lc-ic', type: 'button', 'data-ai': 'read', 'data-confirm': armed ? '1' : null, disabled: ph === 'busy' ? true : null, onclick: c.click,
          'aria-label': 'Đọc mẫu bằng AI (1 lượt)' + who(), title: armed ? 'Bấm lần nữa để đọc — tốn 1 lượt Google' : 'Chưa có clip mẫu. Đọc mới tốn 1 lượt Google (câu đã đọc rồi thì không tốn lại).' },
          ph === 'busy' ? 'Đang đọc…' : armed ? (o.full ? 'Bấm lần nữa — tốn 1 lượt' : 'Chắc chắn?') : o.full ? 'Đọc mẫu bằng AI (1 lượt)' : 'AI · 1 lượt');
      } else {
        b = h('button', { class: 'btn lv-ai lc-ic', type: 'button', 'data-ai': ph === 'have' ? 'play' : 'check', disabled: ph === 'wait' ? true : null, onclick: c.click, 'aria-label': 'Nghe giọng AI' + who(),
          title: ph === 'have' ? 'Clip mẫu đã có — nghe miễn phí' : 'Nghe clip mẫu giọng AI nếu đã có (miễn phí)' }, lcIcon('play'), o.full ? 'Nghe giọng AI' : 'AI');
      }
      c.el.appendChild(b); c.btn = b;
    };
    function spend(g) {
      var my = ++seq; c.phase = 'busy'; c.paint(); say('');
      AiVoice.get(g.p, false, true).then(function (x) {
        if (my !== seq) return;
        c.res = { found: true, buf: x.buf }; c.phase = 'have'; c.paint(); lvSpeak(g, x.buf);
        if (o.onSpend) o.onSpend(x);
      }).catch(function (e) { if (my !== seq) return; c.phase = 'none'; c.paint(); say(lvErr(e)); toast(lvErr(e) + '.'); });
    }
    c.click = function () {
      var g = getP(); if (!lvReady() || !g) return;
      GC.audio.unlock();   // phải gọi trong cú bấm
      if (c.phase === 'none') {   // đọc mới tốn lượt: xác nhận 2 bước (tự huỷ sau 5 giây)
        if (c.arm !== 1) { c.arm = 1; clearTimeout(armT); armT = setTimeout(function () { c.arm = 0; c.paint(); say(''); }, 5000); c.paint(); say('Đọc mới tốn 1 lượt Google. Bấm lần nữa để đọc — hoặc đợi 5 giây để huỷ.'); return; }
        clearTimeout(armT); c.arm = 0; spend(g); return;
      }
      var my = ++seq; c.phase = 'wait'; c.paint(); say('');
      lvLookup(g.p).then(function (res) {
        if (my !== seq) return;
        if (!res.found) { c.phase = 'none'; c.paint(); return; }
        return lvBuf(g.p, res).then(function (buf) { if (my !== seq) return; c.res = { found: true, buf: buf }; c.phase = 'have'; c.paint(); lvSpeak(g, buf); });
      }).catch(function (e) { if (my !== seq) return; c.phase = 'idle'; c.paint(); say(lvErr(e)); });
    };
    // kiểm clip mẫu đã có (dry) để nút hiện đúng ▶ AI hay "Đọc AI · 1 lượt"
    c.check = function () {
      var g = lvReady() ? getP() : null;
      if (!g) { seq++; c.phase = 'idle'; c.paint(); return Promise.resolve(); }
      var my = ++seq; c.phase = 'wait'; c.paint();
      return lvLookup(g.p).then(function (res) { if (my !== seq) return; c.res = res; c.phase = res.found ? 'have' : 'none'; c.paint(); }, function (e) { if (my !== seq) return; c.phase = 'idle'; c.paint(); say(lvErr(e)); });
    };
    c.stop = function () { seq++; clearTimeout(armT); };
    c.paint();
    return c;
  }

  PAGES['lib-voices'] = function (r) {
    crumbs([{ t: 'Giọng' }]);
    var V = GC.voices, A = GC.audio, server = Store.mode === 'server';
    if (!V || !A) { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: 'Bản này chưa nạp bộ giọng (engine/voices.js).' })); return; }
    actions(h('span', { class: 'note', text: V.roleList().length + ' vai × ' + V.langList().length + ' ngôn ngữ — xem, nghe giọng máy / giọng AI, thiết kế giọng.' }),
      server ? h('button', { class: 'btn', type: 'button', onclick: function () { go({ page: 'ai', focus: 'voice' }); } }, 'Cài đặt AI › Giọng AI ›') : null);
    var pf = VoicePref.get(), alive = true, gen = 0;
    var st = { tab: r.tab === 'works' ? 'works' : 'roles', lang: pf.lang, accent: pf.accent, proj: r.project != null ? String(r.project) : lastProject(), q: '', age: '', kind: '', sel: V.ROLES[r.role] ? r.role : '', work: r.work || '' };
    if (st.proj && !Projects.all().some(function (p) { return p.id === st.proj; })) st.proj = '';
    var host = h('div', { class: 'lc' }), banner = h('div'), tabsEl = h('div'), body = h('div', { class: 'lc-body' });
    host.appendChild(banner); host.appendChild(tabsEl); host.appendChild(body); $('view').appendChild(host);
    function onSlash(ev) {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((ev.target || {}).tagName || '')) return;
      var q = $('lvQ'); if (q) { ev.preventDefault(); q.focus(); q.select(); }
    }
    document.addEventListener('keydown', onSlash);
    onLeave(function () { alive = false; gen++; A.hush(); document.removeEventListener('keydown', onSlash); });
    function remember() { route.tab = st.tab; route.role = st.sel || undefined; try { localStorage.setItem(routeKey(APP), JSON.stringify(route)); } catch (e) { /* bỏ qua */ } }
    function ck(role) { return st.lang + '|' + st.accent + '|' + role; }
    function accLabel(l, a) { return (V.LANGS[l].accents.filter(function (x) { return x[0] === a; })[0] || [a, a])[1]; }
    function langInfo() { return V.LANGS[st.lang].label + ' · ' + accLabel(st.lang, st.accent); }

    // lời nhắc trạng thái giọng AI — chưa có key thì vẫn xem / nghe giọng máy
    function paintBanner() {
      clear(banner);
      var c = AiVoice.cfg;
      if (lvReady()) {
        var cap = typeof c.dailyCap === 'number' && c.dailyCap > 0 ? ' / ' + c.dailyCap : '';
        banner.appendChild(h('div', { class: 'banner lv-banner ok', 'data-state': 'ready' }, lcState('ok', 'Giọng AI sẵn sàng'), h('span', { class: 'note mono', text: 'hôm nay ' + (c.today || 0) + cap + ' câu · ' + (c.cached || 0) + ' câu đã lưu' }),
          h('span', { class: 'sp' }), h('span', { class: 'note', text: 'Clip mẫu đã có thì nghe miễn phí; đọc mới và thiết kế giọng tốn lượt Google (báo trước, bấm 2 lần).' })));
        return;
      }
      var head = !server ? 'Bản xem thử' : !c ? 'Chưa đọc được trạng thái giọng AI' : !c.hasKey ? 'Chưa có key Google' : 'Giọng AI đang tắt';
      var tail = !server ? 'không có máy chủ — vẫn xem và nghe được giọng máy (miễn phí, giọng dự phòng của trình duyệt). Giọng AI cần bản cài.'
        : 'vẫn xem và nghe được giọng máy (miễn phí, giọng dự phòng của trình duyệt). ' + (c && c.hasKey ? 'Bật lại để nghe giọng AI.' : 'Muốn nghe giọng AI: dán key Google (miễn phí, dán là chạy).');
      banner.appendChild(h('div', { class: 'banner lv-banner acc', 'data-state': 'off', role: 'status' }, lcState('warn', head), h('span', { class: 'note', text: tail }), h('span', { class: 'sp' }),
        server ? h('button', { class: 'btn sm', type: 'button', id: 'lvKey', onclick: function () { go({ page: 'ai', focus: 'voice' }); } }, c && c.hasKey ? 'Bật ở Cài đặt AI › Giọng AI' : 'Dán key ở Cài đặt AI › Giọng AI') : null));
    }
    function paintTabs() {
      clear(tabsEl).appendChild(lcTabs([['roles', 'Bộ giọng vai', V.roleList().length], ['works', 'Giọng của dự án / tác phẩm', '']], st.tab, function (t) { st.tab = t; remember(); paintTabs(); paintTab(); }));
    }
    function paintTab() { gen++; A.hush(); clear(body); (st.tab === 'works' ? paintWorks : paintRoles)(body); }
    function usersOf(role) {   // nhân vật (trong dự án đang chọn) đang dùng vai này
      return GC.assets().filter(function (a) { return groupOf(a) !== 'frame' && (!st.proj || a.project === st.proj) && AiVoice.roleOf(a) === role; });
    }
    function projSelect(onPick) {
      var s = h('select', { 'aria-label': 'Dự án (để biết nhân vật nào dùng vai)', title: 'Dự án dùng để liệt kê nhân vật theo vai', onchange: function () { st.proj = s.value; onPick(); } });
      s.appendChild(h('option', { value: '', text: 'Mọi dự án' }));
      Projects.all().forEach(function (p) { s.appendChild(h('option', { value: p.id, text: Projects.name(p.id) })); });
      s.value = st.proj; return s;
    }
    // một dòng nhân vật trong danh sách "đang dùng vai này"
    function charItem(a, explicit) {
      return h('li', null, h('button', { type: 'button', 'data-char': a.key, title: 'Mở hồ sơ ' + a.name, onclick: function () { go({ page: 'lib-characters', key: a.key }); } },
        h('span', { class: 'dot', style: '--own:' + ownOf(a) }), h('span', { text: a.name }), h('span', { class: 'note mono', text: a.id }), h('span', { class: 'sp', style: 'flex:1' }),
        h('span', { class: explicit ? 'chip ok' : 'chip', title: explicit ? 'Đã chọn vai này trong hồ sơ nhân vật' : 'Chưa chọn vai — Studio đoán từ vai trò / tính cách / tên', text: explicit ? 'đã chọn' : 'đoán' })));
    }

    /* ---- tab Bộ giọng vai: 22 vai ---- */
    function paintRoles(box) {
      var tg = gen, pumpN = 0, ctls = {}, castEls = {}, rows = V.roleList().map(function (ro) {
        var R = V.ROLES[ro.id];
        return { id: ro.id, label: ro.label, age: ro.age, ageLabel: ro.ageLabel, gender: ro.gender, kind: ro.kind, kindLabel: ro.kindLabel, style: R.style, can: V.canDesign(ro.id), R: R };
      });
      function machine(x) { return A.voiceOf({ id: x.id, voice: { role: x.id } }, { lang: st.lang, accent: st.accent }); }
      function paramsOf(x, voice) { return { p: { text: lvLine(st.lang, x.id), voice: voice, role: x.id, lang: st.lang, accent: st.accent, state: 'normal', bubble: 'say' }, machine: function () { return machine(x); } }; }
      function ctlOf(x, full) {
        var k = (full ? 'i:' : '') + x.id;
        if (!ctls[k]) ctls[k] = lvAiCtl(function () { var c = LV.cv[ck(x.id)]; return c ? paramsOf(x, c.voice) : null; },
          { who: x.label, full: !!full, nopWhy: 'Đang chọn giọng AI cho vai này…', onSpend: function () { var m = ctls[x.id]; if (m) m.check(); AiVoice.load(true).then(function () { if (alive) paintBanner(); }); } });
        return ctls[k];
      }
      function speakMachine(x) { A.unlock(); A.say(lvLine(st.lang, x.id), machine(x)); }
      function fillCast(s, id) {
        clear(s);
        if (!lvReady()) { s.appendChild(h('span', { class: 'chip', title: lvOffWhy(), text: 'giọng máy' })); return; }
        var c = LV.cv[ck(id)];
        if (!c) { s.appendChild(h('span', { class: 'muted', text: '…' })); return; }
        var sc = SRC_CHIP[c.source] || ['', 'chip'];
        s.appendChild(h('span', { class: 'mono', title: c.label || '', text: c.voice })); if (sc[0]) s.appendChild(h('span', { class: sc[1], style: 'margin-left:6px', text: sc[0] }));
      }
      function designedAt(id) { var d = (AiVoice.cfg && AiVoice.cfg.designs) || {}; return d[id + '|' + st.lang + '|' + st.accent] || null; }
      var insp = h('aside', { class: 'lc-insp', 'aria-label': 'Chi tiết vai giọng' });
      var q = h('input', { type: 'search', id: 'lvQ', class: 'lc-q', placeholder: 'Tìm không dấu…  ( / )', title: 'Tìm không dấu theo vai, tuổi, văn / võ, phong cách, tên nhân vật. Phím / để nhảy vào đây, ↓ để xuống bảng.', 'aria-label': 'Tìm vai', value: st.q, oninput: function () { st.q = q.value.trim(); refresh(); },
        onkeydown: function (ev) { if (ev.key === 'Escape') { q.value = ''; st.q = ''; refresh(); grid.focus(); } else if (ev.key === 'ArrowDown') { ev.preventDefault(); grid.focus(); } } });
      var langSel = h('select', { 'aria-label': 'Ngôn ngữ', id: 'lvLang', onchange: function () { st.lang = langSel.value; st.accent = V.accent(st.lang, ''); VoicePref.set(st.lang, st.accent); fillAccent(); resetRows(); } });
      V.langList().forEach(function (l) { langSel.appendChild(h('option', { value: l.id, text: l.label })); });
      var accSel = h('select', { 'aria-label': 'Giọng vùng', id: 'lvAccent', onchange: function () { st.accent = accSel.value; VoicePref.set(st.lang, st.accent); resetRows(); } });
      function fillAccent() { clear(accSel); V.LANGS[st.lang].accents.forEach(function (a) { accSel.appendChild(h('option', { value: a[0], text: a[1] })); }); accSel.value = st.accent; }
      langSel.value = st.lang; fillAccent();
      var kindSel = h('select', { 'aria-label': 'Lọc theo kiểu vai (văn / võ …)', onchange: function () { st.kind = kindSel.value; refresh(); } });
      kindSel.appendChild(h('option', { value: '', text: 'Mọi kiểu (văn / võ…)' }));
      Object.keys(V.KINDS).forEach(function (k) { kindSel.appendChild(h('option', { value: k, text: V.KINDS[k] })); });
      kindSel.value = st.kind;
      var chips = h('div', { class: 'fxchips lc-cats', role: 'group', 'aria-label': 'Lọc theo nhóm tuổi' }), chipEls = {};
      [['', 'Tất cả']].concat(V.AGES).forEach(function (c) {
        var n = h('span', { class: 'n' }), b = h('button', { type: 'button', 'data-age': c[0], onclick: function () { st.age = st.age === c[0] ? '' : c[0]; refresh(); } }, c[1], n);
        chipEls[c[0]] = { b: b, n: n }; chips.appendChild(b);
      });
      var count = h('span', { class: 'note lc-count' });
      var grid = lcGrid({
        id: 'lv', label: 'Bộ giọng vai', empty: 'Không có vai nào khớp bộ lọc.',
        cols: [
          { t: 'Nghe', w: 120, frozen: true, cell: function (x) {
            var m = lcPlay('Nghe giọng máy — ' + x.label, function () { speakMachine(x); }); m.setAttribute('data-machine', x.id); m.title = 'Giọng máy (trình duyệt, miễn phí): ' + lvLine(st.lang, x.id);
            return h('span', { class: 'lv-pair' }, m, ctlOf(x).el);
          } },
          { t: 'ID vai', w: 124, frozen: true, cls: 'id', v: function (x) { return x.id; }, cell: function (x) { return x.id; } },
          { t: 'Vai', w: 148, v: function (x) { return x.label; }, cell: function (x) { return x.label; } },
          { t: 'Nhóm tuổi', w: 92, v: function (x) { return V.AGES.map(function (a) { return a[0]; }).indexOf(x.age); }, cell: function (x) { return x.ageLabel; } },
          { t: 'Giới', w: 54, v: function (x) { return x.gender; }, cell: function (x) { return x.gender === 'f' ? 'Nữ' : 'Nam'; } },
          { t: 'Văn / võ / …', w: 108, v: function (x) { return x.kindLabel; }, cell: function (x) { return x.kindLabel; } },
          { t: 'Thiết kế được?', w: 122, v: function (x) { return x.can ? 0 : 1; }, cell: function (x) {
            return x.can ? lcState('ok', 'Được', 'Có thể thiết kế giọng riêng cho vai này (tốn 1 lượt Google)') : lcState('bad', 'Google chặn', 'Google không cho thiết kế giọng trẻ em / vị thành niên (chính sách an toàn)');
          } },
          { t: 'Phong cách nói', w: 220, cls: 'mono mut', v: function (x) { return x.style; }, cell: function (x) { return x.style; }, tip: function (x) { return x.style; } },
          { t: 'Giọng AI (cast)', w: 180, cell: function (x) { var s = h('span'); castEls[x.id] = s; fillCast(s, x.id); return s; } },
          { t: 'Nhân vật dùng vai', w: 210, cls: 'mut', cell: function (x) { var u = usersOf(x.id).map(function (a) { return a.name; }); return u.length ? u.slice(0, 3).join(', ') + (u.length > 3 ? ' +' + (u.length - 3) : '') : '—'; },
            tip: function (x) { return usersOf(x.id).map(function (a) { return a.name; }).join(', '); } },
          { t: 'Câu mẫu', w: 340, cls: 'mut', cell: function (x) { return lvLine(st.lang, x.id); }, tip: function (x) { return lvLine(st.lang, x.id); } }
        ],
        group: function (x) { return x.ageLabel; },
        onSelect: function (x) { st.sel = x ? x.id : ''; remember(); inspect(x); if (x && lvReady()) ensureCast(x); },
        onAct: function (x) { speakMachine(x); },
        foot: function (v) {
          var d = 0, kids = 0; v.forEach(function (x) { if (x.can) d++; else kids++; });
          return [v.length + ' vai · ' + d + ' thiết kế được · ' + kids + ' bị Google chặn · ' + langInfo(), h('span', { class: 'sp' }), '↑↓ chọn · Space nghe giọng máy · / tìm'];
        }
      });
      box.appendChild(h('div', { class: 'stack', style: 'gap:8px' },
        h('div', { class: 'lc-bar' }, langSel, accSel, projSelect(function () { resetRows(); }), kindSel, q, h('span', { class: 'sp' }), count), chips,
        h('div', { class: 'lc-split' }, grid.el, insp)));
      function refresh() {
        var f = lcFold(st.q), base = rows.filter(function (x) {
          if (st.kind && x.kind !== st.kind) return false;
          if (!f) return true;
          return lcFold([x.id, x.label, x.ageLabel, x.kindLabel, x.gender === 'f' ? 'nu' : 'nam', x.style].concat(usersOf(x.id).map(function (a) { return a.name; })).join(' | ')).indexOf(f) >= 0;
        });
        var cnt = {}; base.forEach(function (x) { cnt[x.age] = (cnt[x.age] || 0) + 1; });
        Object.keys(chipEls).forEach(function (k) { chipEls[k].n.textContent = String(k ? cnt[k] || 0 : base.length); chipEls[k].b.setAttribute('aria-pressed', String(st.age === k)); });
        var shown = st.age ? base.filter(function (x) { return x.age === st.age; }) : base;
        count.textContent = shown.length + ' / ' + rows.length + ' vai';
        grid.set(shown, st.sel);
        pumpAi();
      }
      // đổi ngôn ngữ / giọng vùng / dự án: câu mẫu + cast + clip đều khác → dựng lại nút, hỏi lại cast
      function resetRows() { Object.keys(ctls).forEach(function (k) { ctls[k].stop(); }); ctls = {}; castEls = {}; refresh(); }
      function ensureCast(x) {
        if (LV.cv[ck(x.id)]) return;
        var key = ck(x.id);
        lvCast(x.id, st.lang, st.accent).then(function () { if (!alive || tg !== gen || key !== ck(x.id)) return; if (castEls[x.id]) fillCast(castEls[x.id], x.id); var c = ctls[x.id]; if (c) c.check(); if (st.sel === x.id) inspect(grid.cur()); }).catch(function () { /* hàng vẫn nghe được giọng máy */ });
      }
      // hỏi giọng AI + clip mẫu có sẵn của các hàng đang hiện (≤ 4 lời gọi cùng lúc; kết quả của lần vẽ cũ bị bỏ)
      function pumpAi() {
        if (!lvReady()) return;
        var g = ++pumpN, todo = grid.rows().filter(function (x) { return !ctls[x.id] || ctls[x.id].phase === 'idle'; }), busy = 0;   // chỉ hàng chưa kiểm clip (gõ tìm không hỏi lại)
        (function next() {
          while (busy < 4 && todo.length && g === pumpN && tg === gen && alive) {
            (function (x) {
              busy++;
              var key = ck(x.id);
              lvCast(x.id, st.lang, st.accent).then(function () {
                if (g !== pumpN || tg !== gen || !alive || key !== ck(x.id)) return;
                if (castEls[x.id]) fillCast(castEls[x.id], x.id);
                if (st.sel === x.id) inspect(grid.cur());
                return ctlOf(x).check();
              }).catch(function () { /* lỗi cast: để nguyên "…" */ }).then(function () { busy--; next(); });
            })(todo.shift());
          }
        })();
      }

      /* Inspector 400 px: mô tả vai · giọng AI sẽ dùng (cast) · giọng đã thiết kế · thiết kế · nhân vật dùng vai */
      function inspect(x) {
        clear(insp);
        if (!x) { insp.appendChild(h('div', { class: 'panel pad note', text: 'Chọn một vai trong bảng.' })); return; }
        var R = x.R, c = LV.cv[ck(x.id)], d = lvReady() ? designedAt(x.id) : null, ready = lvReady(), sample = lvLine(st.lang, x.id), mv = machine(x), ictl = ctlOf(x, true);
        var mBtn = h('button', { class: 'btn primary lc-ic', type: 'button', id: 'lvHear', 'aria-label': 'Nghe giọng máy — ' + x.label, onclick: function () { speakMachine(x); } }, lcIcon('play'), 'Nghe giọng máy');
        // giọng AI sẽ được chọn cho vai ở ngôn ngữ + vùng đang chọn
        var castEl = h('div', { 'data-cast': x.id });
        if (!ready) castEl.appendChild(h('p', { class: 'lc-hint', text: 'Chưa dùng giọng AI — phim đọc bằng giọng máy: ' + (mv.gender === 'f' ? 'nữ' : 'nam') + ' · cao độ ' + vn(mv.pitch) + ' · tốc độ ' + vn(mv.rate) + ' · ' + mv.lang + '.' }));
        else if (!c) castEl.appendChild(h('p', { class: 'lc-hint', text: 'Đang hỏi máy chủ chọn giọng…' }));
        else { var sc = SRC_CHIP[c.source] || ['', 'chip']; castEl.appendChild(h('div', { class: 'row' }, h('b', { class: 'mono', text: c.voice }), sc[0] ? h('span', { class: sc[1], text: sc[0] }) : null)); if (c.label && c.label !== c.voice) castEl.appendChild(h('p', { class: 'lc-hint', text: c.label })); }
        // giọng đã thiết kế riêng cho vai + ngôn ngữ + vùng này
        var desEl = h('div');
        if (!ready) desEl.appendChild(h('p', { class: 'lc-hint', text: 'Cần giọng AI sẵn sàng để xem giọng đã thiết kế.' }));
        else if (d) {
          desEl.appendChild(h('div', { class: 'row' }, h('b', { class: 'mono', text: d.voice }), lcState('ok', 'đã thiết kế'), d.at ? h('span', { class: 'note', text: fmtTime(d.at) }) : null,
            d.preview ? lcBtn('play', 'Nghe mẫu thiết kế', { label: 'Nghe mẫu thiết kế — ' + x.label, fn: function () { A.unlock(); AiVoice.download(d.preview).then(function (buf) { AiVoice.speak(sample, buf, mv); }).catch(function (e) { toast(e.message); }); } }) : null));
        } else desEl.appendChild(h('p', { class: 'lc-hint', text: 'Chưa thiết kế riêng cho ' + langInfo() + ' — đang dùng giọng thư viện / dựng sẵn ở trên.' }));
        // thiết kế giọng: tốn 1 lượt, ~25 s, chỉ chủ máy; vai trẻ em bị Google chặn
        var kid = !x.can, why = kid ? 'Google không cho thiết kế giọng trẻ em / vị thành niên (chính sách an toàn) — vai này dùng giọng trẻ trung có sẵn.' : !ready ? lvOffWhy() : '';
        var desLabel = d ? 'Thiết kế lại giọng cho vai này' : 'Thiết kế giọng cho vai này', desB = h('button', { class: 'btn lc-ic', type: 'button', id: 'lvDesign', disabled: why ? true : null, 'data-confirm': null,
          title: why || 'Thiết kế giọng riêng cho vai này trên project Google của chủ máy: ~25 giây, tốn 1 lượt (≈ $0,013 khi trả phí). Kết quả được nhớ — mọi phim dùng vai này đều dùng giọng đó.',
          onclick: function () { design(x, desB, desLabel, sample, mv); } }, desLabel);
        var chars = usersOf(x.id), pn = st.proj ? Projects.name(st.proj) : 'mọi dự án';
        var kv = h('dl', { class: 'lc-kv' },
          h('dt', { text: 'Vai' }), h('dd', { text: x.ageLabel + ' · ' + (x.gender === 'f' ? 'Nữ' : 'Nam') + ' · ' + x.kindLabel }),
          h('dt', { text: 'Phong cách nói' }), h('dd', { class: 'mono', text: R.style }),
          h('dt', { text: 'Chân dung' }), h('dd', { class: R.design ? 'mono' : null, style: R.design ? 'font-size:12px' : null, text: R.design || '— (vai trẻ em: không thiết kế được)' }),
          h('dt', { text: 'Tuổi hợp vai' }), h('dd', { text: R.ages ? R.ages[0] + '–' + R.ages[1] + ' tuổi · cao độ ưa ' + R.prefPitch : 'giọng trẻ trung có sẵn' }),
          h('dt', { text: 'Giọng dựng sẵn' }), h('dd', { class: 'mono', style: 'font-size:12px', text: R.ai.join(' · ') }));
        insp.appendChild(h('div', { class: 'panel' }, h('h3', null, h('span', { text: x.label }), h('span', { class: 'r mono', text: x.id })),
          h('div', { class: 'pad stack' },
            h('div', null, h('div', { class: 'lc-sec', text: 'Câu mẫu · ' + langInfo() }), h('p', { class: 'lv-line', lang: V.LANGS[st.lang].bcp, text: sample }), h('div', { class: 'row', style: 'margin-top:8px' }, mBtn, ictl.el), ictl.note),
            kv,
            h('div', null, h('div', { class: 'lc-sec', text: 'Giọng AI sẽ dùng cho vai này' }), castEl),
            h('div', null, h('div', { class: 'lc-sec', text: 'Giọng đã thiết kế' }), desEl),
            h('div', null, desB, why ? h('p', { class: 'lc-hint', 'data-why': 'design', style: 'margin-top:4px', text: why }) : h('p', { class: 'lc-hint', style: 'margin-top:4px', text: 'Tốn 1 lượt Google, ~25 giây, chỉ chủ máy (bấm 2 lần để xác nhận).' }), h('p', { class: 'lc-hint warn', id: 'lvDesignNote', hidden: true })),
            h('div', null, h('div', { class: 'lc-sec', text: 'Nhân vật đang dùng vai này · ' + pn + ' · ' + chars.length }),
              chars.length ? h('ul', { class: 'lv-chars' }, chars.map(function (a) { return charItem(a, !!(a.voice && a.voice.role)); })) : h('p', { class: 'lc-hint', text: 'Chưa có nhân vật nào trong ' + pn + ' dùng vai này.' })))));
        if (ictl.phase === 'idle' && ready && c) ictl.check();
      }
      function design(x, btn, label, sample, mv) {
        var note = $('lvDesignNote');
        function say(t) { if (note) { note.textContent = t || ''; note.hidden = !t; } }
        if (btn.getAttribute('data-confirm') !== '1') {
          btn.setAttribute('data-confirm', '1'); btn.textContent = 'Bấm lần nữa — tốn 1 lượt, ~25 giây'; say('');
          setTimeout(function () { if (btn.isConnected && btn.getAttribute('data-confirm') === '1') { btn.removeAttribute('data-confirm'); btn.textContent = label; } }, 6000);
          return;
        }
        btn.removeAttribute('data-confirm'); btn.disabled = true; btn.textContent = 'Đang thiết kế… ~25 s'; say('');
        var key = x.id + '|' + st.lang + '|' + st.accent;
        Store.api('POST', 'api/voice/design', { role: x.id, lang: st.lang, accent: st.accent }).then(function (res) {
          var cfg = AiVoice.cfg; if (cfg) { cfg.designs = cfg.designs || {}; cfg.designs[key] = { voice: res.voice, at: new Date().toISOString(), preview: res.preview || null }; }
          lvReset();   // phim dùng ngay giọng mới
          toast('Đã thiết kế giọng cho ' + x.label + (res.preview ? ' — đang nghe thử.' : '.'));
          if (alive) { resetRows(); }
          return res.preview ? AiVoice.download(res.preview).then(function (buf) { A.unlock(); AiVoice.speak(sample, buf, mv); }) : null;
        }).catch(function (e) {
          var t = lvErr(e); toast(t + '.');
          if (alive && btn.isConnected) { btn.disabled = false; btn.textContent = label; var n2 = $('lvDesignNote'); if (n2) { n2.textContent = t; n2.hidden = false; } }
        });
      }
      refresh();
    }

    /* ---- tab Giọng của tác phẩm: nhân vật → vai → giọng chốt (work.voices) ---- */
    function paintWorks(box) {
      var W = null, wl = [], ctls = {}, rows = [], L = { lang: st.lang, accent: st.accent }, tg = gen;
      var workSel = h('select', { id: 'lvWork', 'aria-label': 'Tác phẩm', onchange: function () { st.work = workSel.value; route.work = st.work || undefined; remember(); openWork(st.work); } });
      workSel.appendChild(h('option', { value: '', text: '— Theo dự án (không chọn tác phẩm) —' }));
      var insp = h('aside', { class: 'lc-insp', 'aria-label': 'Chi tiết nhân vật' }), langNote = h('span', { class: 'note' }), castB = h('button', { class: 'btn', type: 'button', id: 'lvCastAll', onclick: castAll, disabled: true,
        title: 'Server chọn giọng cho cả dàn của tác phẩm và CHỐT vào tác phẩm (miễn phí — không đọc câu nào)' }, 'Chốt giọng cả dàn (miễn phí)');
      var count = h('span', { class: 'note lc-count' }), projEl = projSelect(function () { if (!W) build(); });
      function sampleOf(x) { return lvLine(L.lang, x.role); }
      function machine(x) { return A.voiceOf(x.a, { lang: L.lang, accent: x.accent }); }
      function ctlOf(x, full) {
        var k = (full ? 'i:' : '') + x.id;
        if (!ctls[k]) ctls[k] = lvAiCtl(function () {
          return x.voice ? { p: { text: sampleOf(x), voice: x.voice, role: x.role, lang: L.lang, accent: x.accent, state: 'normal', bubble: 'say' }, machine: function () { return machine(x); } } : null;
        }, { who: x.a.name, full: !!full, nopWhy: 'Chưa chốt giọng AI cho nhân vật này — bấm “Chốt giọng cả dàn” hoặc Lồng tiếng ở Tạo tác.', onSpend: function () { var m = ctls[x.id]; if (m) m.check(); AiVoice.load(true).then(function () { if (alive) paintBanner(); }); } });
        return ctls[k];
      }
      function speakMachine(x) { A.unlock(); A.say(sampleOf(x), machine(x)); }
      function build() {
        Object.keys(ctls).forEach(function (k) { ctls[k].stop(); }); ctls = {};
        L = W ? workLang(W) : { lang: st.lang, accent: st.accent };
        var actors = W ? (GC.film && GC.film.actors ? AiVoice.actorsOf(W) : []) : GC.assets().filter(function (a) { return groupOf(a) !== 'frame' && (!st.proj || a.project === st.proj); });
        var chot = (W && W.voices && W.voices[L.lang + '|' + L.accent]) || {};
        rows = actors.map(function (a) {
          var own = a.voice && typeof a.voice.ai === 'string' ? a.voice.ai : '', ch = typeof chot[a.id] === 'string' ? chot[a.id] : '';
          return { id: a.id, a: a, role: AiVoice.roleOf(a), explicit: !!(a.voice && a.voice.role), accent: AiVoice.accentOf(a, L.lang, L.accent), chot: ch, own: own, voice: ch || own, src: ch ? 'chot' : own ? 'tay' : 'chua' };
        });
        langNote.textContent = (W ? 'Ngôn ngữ phim: ' : 'Ngôn ngữ đang chọn (đổi ở tab Bộ giọng vai): ') + V.LANGS[L.lang].label + ' · ' + accLabel(L.lang, L.accent);
        castB.disabled = !(W && server && rows.length); projEl.hidden = !!W;
        grid.set(rows, st.sel && rows.some(function (x) { return x.id === st.sel; }) ? st.sel : '');
        rows.forEach(function (x) { if (x.voice) ctlOf(x).check(); });
      }
      var SRC = { chot: ['Đã chốt', 'chip ok', 'Giọng đã CHỐT trong tác phẩm (work.voices) — Studio, MCP và phim xuất cùng một giọng'], tay: ['Chọn tay', 'chip warn', 'Giọng chọn tay trên hồ sơ nhân vật (chưa chốt vào tác phẩm)'], chua: ['Chưa chốt', 'chip', 'Chưa có giọng AI — Lồng tiếng ở Tạo tác hoặc “Chốt giọng cả dàn” sẽ chọn và chốt'] };
      var grid = lcGrid({
        id: 'lw', label: 'Giọng của tác phẩm', empty: W ? 'Tác phẩm này chưa có nhân vật nào trong các phân cảnh.' : 'Dự án này chưa có nhân vật.',
        cols: [
          { t: 'Nghe', w: 120, frozen: true, cell: function (x) {
            var m = lcPlay('Nghe giọng máy — ' + x.a.name, function () { speakMachine(x); }); m.setAttribute('data-machine', x.id);
            return h('span', { class: 'lv-pair' }, m, ctlOf(x).el);
          } },
          { t: 'ID nhân vật', w: 150, frozen: true, cls: 'id', v: function (x) { return x.id; }, cell: function (x) { return x.id; }, tip: function (x) { return x.id; } },
          { t: 'Nhân vật', w: 128, v: function (x) { return x.a.name; }, cell: function (x) { return h('span', { class: 'lv-who', style: '--own:' + ownOf(x.a) }, h('span', { class: 'dot' }), x.a.name); } },
          { t: 'Vai giọng', w: 156, v: function (x) { return V.ROLES[x.role].label; }, cell: function (x) { return [V.ROLES[x.role].label, x.explicit ? null : h('span', { class: 'chip', style: 'margin-left:6px', title: 'Chưa chọn vai trong hồ sơ nhân vật — Studio đoán từ vai trò / tính cách / tên', text: 'đoán' })]; } },
          { t: 'Giọng chốt', w: 118, cls: 'mono', v: function (x) { return x.voice; }, cell: function (x) { return x.voice || '—'; } },
          { t: 'Nguồn', w: 100, v: function (x) { return x.src; }, cell: function (x) { return h('span', { class: SRC[x.src][1], title: SRC[x.src][2], text: SRC[x.src][0] }); } },
          { t: 'Giọng vùng', w: 120, v: function (x) { return x.accent; }, cell: function (x) { return accLabel(L.lang, x.accent); } },
          { t: 'Câu mẫu', w: 340, cls: 'mut', cell: sampleOf, tip: sampleOf }
        ],
        onSelect: function (x) { st.sel = x ? x.id : st.sel; inspect(x); },
        onAct: function (x) { speakMachine(x); },
        foot: function (v) {
          var n = 0; v.forEach(function (x) { if (x.chot) n++; });
          return [v.length + ' nhân vật · ' + n + ' đã chốt giọng' + (W ? ' · ' + W.title : st.proj ? ' · dự án ' + Projects.name(st.proj) : ''), h('span', { class: 'sp' }), '↑↓ chọn · Space nghe giọng máy'];
        }
      });
      function inspect(x) {
        clear(insp);
        if (!x) { insp.appendChild(h('div', { class: 'panel pad note', text: W ? 'Tác phẩm chưa có nhân vật.' : 'Chọn một nhân vật trong bảng.' })); return; }
        var ictl = ctlOf(x, true), sample = sampleOf(x), R = V.ROLES[x.role];
        var mBtn = h('button', { class: 'btn primary lc-ic', type: 'button', 'aria-label': 'Nghe giọng máy — ' + x.a.name, onclick: function () { speakMachine(x); } }, lcIcon('play'), 'Nghe giọng máy');
        insp.appendChild(h('div', { class: 'panel' }, h('h3', null, h('span', { text: x.a.name }), h('span', { class: 'r mono', text: x.id })),
          h('div', { class: 'pad stack' },
            h('dl', { class: 'lc-kv' }, h('dt', { text: 'Vai giọng' }), h('dd', null, R.label, ' ', h('span', { class: x.explicit ? 'chip ok' : 'chip', text: x.explicit ? 'đã chọn' : 'đoán' })),
              h('dt', { text: 'Phong cách' }), h('dd', { class: 'mono', text: R.style }), h('dt', { text: 'Giọng vùng' }), h('dd', { text: accLabel(L.lang, x.accent) }),
              h('dt', { text: 'Giọng chốt' }), h('dd', null, x.voice ? h('b', { class: 'mono', text: x.voice }) : h('span', { class: 'muted', text: 'chưa chốt' }), ' ', h('span', { class: SRC[x.src][1], title: SRC[x.src][2], text: SRC[x.src][0] })),
              h('dt', { text: 'work.voices' }), h('dd', { class: 'note', text: W ? 'khoá ' + L.lang + '|' + L.accent + ' của “' + W.title + '”' : 'chưa chọn tác phẩm' })),
            h('div', null, h('div', { class: 'lc-sec', text: 'Câu mẫu · ' + V.LANGS[L.lang].label }), h('p', { class: 'lv-line', lang: V.LANGS[L.lang].bcp, text: sample }), h('div', { class: 'row', style: 'margin-top:8px' }, mBtn, ictl.el), ictl.note),
            h('div', { class: 'usebar' }, h('b', { text: 'Hồ sơ' }), h('span', { class: 'note', text: x.a.faction || x.a.role || '' }),
              h('button', { class: 'btn sm', type: 'button', onclick: function () { go({ page: 'lib-characters', key: x.a.key }); } }, 'Mở hồ sơ nhân vật ›')))));
      }
      function castAll() {
        if (!W) return;
        castB.disabled = true; castB.textContent = 'Đang chốt…';
        AiVoice.castOf(W, L.lang, L.accent).then(function (cast) { toast('Đã chốt giọng cho ' + Object.keys(cast || {}).length + ' nhân vật của “' + W.title + '”.'); return openWork(W.id); })
          .catch(function (e) { toast(lvErr(e) + '.'); }).then(function () { castB.textContent = 'Chốt giọng cả dàn (miễn phí)'; castB.disabled = !(W && server && rows.length); });
      }
      function openWork(id) {
        if (!id) { W = null; build(); return Promise.resolve(); }
        return Store.api('GET', 'api/works/' + id).then(function (w) { if (!alive || tg !== gen) return; W = w; build(); }).catch(function (e) { toast(e.message); });
      }
      box.appendChild(h('div', { class: 'stack', style: 'gap:8px' },
        h('div', { class: 'lc-bar' }, h('label', { class: 'note', for: 'lvWork', text: 'Tác phẩm' }), workSel, projEl, castB, h('span', { class: 'sp' }), count), h('div', { class: 'row' }, langNote),
        h('div', { class: 'lc-split' }, grid.el, insp)));
      build();
      if (server) {
        Store.api('GET', 'api/works').then(function (l) {
          if (!alive || tg !== gen) return;
          wl = Array.isArray(l) ? l : [];
          wl.forEach(function (w) { workSel.appendChild(h('option', { value: w.id, text: w.title + (w.project ? ' · ' + Projects.name(w.project) : '') })); });
          if (st.work && wl.some(function (w) { return w.id === st.work; })) { workSel.value = st.work; openWork(st.work); }
          else st.work = '';
        }).catch(function () { /* chưa có danh sách tác phẩm: vẫn xem theo dự án */ });
      }
    }

    function aiSig() { var c = AiVoice.cfg; return lvReady() + '|' + (c ? JSON.stringify(c.designs || {}) : ''); }
    (server && AiVoice.on() && !AiVoice.cfg ? AiVoice.load() : Promise.resolve()).then(function () {
      if (!alive) return;
      paintBanner(); paintTabs(); paintTab();
      var s0 = aiSig();
      if (server && AiVoice.on()) AiVoice.load(true).then(function () { if (!alive) return; paintBanner(); if (aiSig() !== s0) paintTab(); });   // key đổi ở nơi khác → vẽ lại bảng
    });
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
      Store.mode === 'server' ? samplesLeft().map(function (S) { return h('button', { class: 'btn', title: S.note, onclick: function () { importDemo(S); } }, S.short); }) : null,
      Store.mode === 'server' ? samplesStale().map(function (S) { return h('button', { class: 'btn', title: 'Bộ mẫu trên máy là bản cũ — ' + S.note, onclick: function () { updateDemo(S); } }, '⟳ Cập nhật ' + S.short.replace(/^\S+ /, '')); }) : null,
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
        Store.mode === 'server' ? h('div', { class: 'row' }, samplesLeft().map(function (S, i) { return h('button', { class: 'btn' + (i ? '' : ' primary'), onclick: function () { importDemo(S); } }, S.button); }), h('button', { class: 'btn', onclick: pickBundle }, 'Nhập gói…')) : null));
      var grid = h('div', { class: 'libgrid' });
      ps.forEach(function (p) {
        var c = counts(p.id), first = [].concat(inProject(GC.assets(), p.id), inProject(GC.items(), p.id), inProject(GC.scenes(), p.id))[0];
        grid.appendChild(h('button', anc({ class: 'libcard proj', 'aria-pressed': String(sel === p.id), title: p.id || '(chưa xếp)', onclick: function () { sel = p.id; paint(); } }, p.id ? 'project:' + p.id : null, p.name),
          h('div', { class: 'im' }, first ? h('img', { src: thumbOf(first), alt: '' }) : h('div', { class: 'note', style: 'padding:28px 0', text: 'trống' })),
          h('div', { class: 'lb' }, h('b', { text: p.name }), h('span', { class: 'note', text: c[0] + ' nhân vật · ' + c[1] + ' vật phẩm · ' + c[2] + ' bối cảnh' }),
            p.sample ? h('span', { class: 'chip', title: p.sample.license || '', text: 'Bộ mẫu ' + (p.sample.owner || 'Gen Labs') }) : null)));
      });
      if (ps.length) listBox.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Dự án', h('span', { class: 'r note', text: ps.length })), h('div', { class: 'pad' }, grid)));
      paintDetail();
    }
    function paintDetail() {
      clear(detail);
      if (sel == null) { dockObj('project', null); return; }
      var P = Projects.all().filter(function (p) { return p.id === sel; })[0] || { id: '', name: 'Chưa xếp dự án', description: '' };
      dockObj('project', sel || null, P.name);
      var parts = [['Nhân vật', inProject(GC.assets(), sel), 'lib-characters'], ['Vật phẩm', inProject(GC.items(), sel), 'lib-items'], ['Bối cảnh', inProject(GC.scenes(), sel), 'lib-scenes']];
      var body = h('div', { class: 'pad stack' }, P.description ? h('div', { class: 'note', text: P.description }) : null,
        P.sample ? h('div', { class: 'banner' }, h('span', { text: 'Bộ mẫu của ' + (P.sample.owner || 'Gen Labs') + ' — ' + (P.sample.license || 'chỉ để xem và làm phim thử') + '. Muốn bán: dựng bộ của bạn trong một dự án riêng rồi phát hành.' }),
          Store.mode === 'server' ? samplesStale().filter(function (S) { return S.id === P.id; }).map(function (S) { return h('button', { class: 'btn sm primary', onclick: function () { updateDemo(S); } }, '⟳ Có bản mới của bộ mẫu — cập nhật'); }) : null) : null);
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
        sel ? h('button', { class: 'btn sm', title: 'Sao lưu / chuyển máy: mọi asset (cả nháp) + tác phẩm — nhập lại được ở bản cài khác', onclick: function () { exportBundle(P); } }, 'Gói sao lưu (JSON)') : null,
        P.sample ? h('span', { class: 'chip', title: 'Bộ mẫu không xuất gói bán', text: 'Gói bán · bộ mẫu, không bán' }) :
        sel ? h('button', { class: 'btn sm', title: 'Gói để bán / chia sẻ: chỉ asset đã PHÁT HÀNH, không kèm tác phẩm', onclick: function () { exportBundle(P, true); } },
          'Gói bán · ' + [].concat(inProject(GC.assets(), sel), inProject(GC.items(), sel), inProject(GC.scenes(), sel)).filter(function (x) { return GC.statusOf(x.status) === 'published'; }).length + ' asset phát hành')
          : h('span', { class: 'note', text: 'Xếp asset vào một dự án (ở khung "Dùng" của từng asset) để tải gói.' })));
      detail.appendChild(h('div', { class: 'panel' }, h('h3', null, P.name, h('span', { class: 'r mono', text: P.id || '—' })), body));
    }
    paint();
  };
  // dự án mẫu đi kèm bản cài: nhập qua đúng cổng như mọi gói (studio/mau/<file>.json)
  var SAMPLES = [
    { id: 'mau-van-phong-vui', file: 'van-phong-vui', short: '✨ Văn phòng vui (mẫu)', button: '✨ Mở dự án mẫu "Văn phòng vui"', note: '3 nhân vật · 2 bối cảnh · phim 4 phân cảnh — xem trọn luồng trong 10 giây, sửa và xuất thử thoải mái.' },
    { id: 'mau-tam-quoc', file: 'tam-quoc', version: '2026.10.19-am', short: '🏯 Tam Quốc (bộ chủ đề)', button: '🏯 Mở bộ chủ đề mẫu "Tam Quốc"', note: '7 tướng · 13 trang bị · 8 bối cảnh · phim 6 phân cảnh (có màn đấu) · gói âm Tam Quốc (trống trận, tù và…) — một bộ thư viện trọn vẹn dựng từ khung, đã Phát hành: xem Gói bán trông thế nào.' }
  ];
  function samplesLeft() { return SAMPLES.filter(function (S) { return !Projects.all().some(function (p) { return p.id === S.id; }); }); }
  // bộ mẫu đã nhập từ bản cũ (thiếu phân cảnh / asset mới) — bản cài tự cập nhật mã nhưng không tự đụng dữ liệu của người dùng
  function samplesStale() { return SAMPLES.filter(function (S) { var p = Projects.all().filter(function (x) { return x.id === S.id; })[0]; return S.version && p && p.sample && p.sample.version !== S.version; }); }
  function updateDemo(S) {
    if (!window.confirm('Cập nhật "' + S.short.replace(/^\S+ /, '') + '" lên bản mới nhất?\n\nChỗ bạn đã sửa trên bộ mẫu thành phiên bản cũ (vẫn xem lại được trong lịch sử).')) return;
    toast('Đang cập nhật ' + S.short.replace(/^\S+ /, '') + '…');
    fetch('studio/mau/' + S.file + '.json').then(function (r) { if (!r.ok) throw new Error('Không tải được bộ mẫu'); return r.json(); }).then(function (b) { return importBundle(b, true); }).catch(function (e) { toast(e.message); });
  }
  function exportBundle(P, sale) {
    // bản cài: server dựng gói (đủ tác phẩm + cảnh báo); bản xem thử không server: dựng tại trình duyệt — cùng một luật gói bán
    var get = Store.mode === 'server' ? Store.api('GET', 'api/projects/export?id=' + encodeURIComponent(P.id) + (sale ? '&sale=1' : '')) : Promise.resolve(projectBundle(P, sale));
    get.then(function (b) {
      if (sale && !b.characters.length && !b.items.length && !b.scenes.length) { toast('Dự án chưa có asset nào PHÁT HÀNH — bấm "Phát hành" ở khung "Dùng" của từng asset trong Thư viện.'); return; }
      download((P.id || 'chua-xep') + (sale ? '-goi-ban.json' : '-sao-luu.json'), JSON.stringify(b, null, 2), 'application/json');
      if (b.warnings && b.warnings.length) window.alert('Gói bán có ' + b.warnings.length + ' cảnh báo:\n• ' + b.warnings.slice(0, 8).join('\n• '));
      toast('Đã xuất ' + (sale ? 'gói bán ' : 'gói sao lưu ') + P.name + ': ' + b.characters.length + ' nhân vật · ' + b.items.length + ' vật phẩm · ' + b.scenes.length + ' bối cảnh · ' + (b.works || []).length + ' tác phẩm');
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
        var msg = 'Đã nhập ' + c.characters + ' nhân vật · ' + c.items + ' vật phẩm · ' + c.scenes + ' bối cảnh' + (c.soundPacks ? ' · ' + c.soundPacks + ' gói âm' : '') + (c.motionPacks ? ' · ' + c.motionPacks + ' gói động tác' : '') + ' · ' + c.works + ' tác phẩm (' + c.shots + ' phân cảnh)';
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
  function importDemo(S) {
    S = S || SAMPLES[0];
    toast('Đang dựng ' + S.short.replace(/^\S+ /, '') + '…');
    fetch('studio/mau/' + S.file + '.json').then(function (r) { if (!r.ok) throw new Error('Không tải được dự án mẫu'); return r.json(); }).then(function (b) { return importBundle(b); }).catch(function (e) { toast(e.message); });
  }
  function projectBundle(P, sale) {
    var pick = function (list) { return inProject(list, P.id).filter(function (x) { return !sale || GC.statusOf(x.status) === 'published'; }); };
    var b = bundleOf(pick(GC.assets()), pick(GC.items()), pick(GC.scenes()));
    b.motionPacks = GC.choreo ? pick(GC.choreo.packs()).map(function (p) { var o = clone(p); ['pack', 'key', 'version', 'savedAt', 'note'].forEach(function (k) { delete o[k]; }); return o; }) : [];
    b.soundPacks = GC.sounds ? GC.sounds.packs().filter(function (p) { return !p.frame && p.project === P.id && (!sale || p.status === 'published'); }).map(function (p) { return GC.sounds.pack(p.id); }) : [];
    var warnings = sale ? b.items.filter(function (x) { return GC.statusOf(x.status) !== 'published'; }).map(function (x) { return 'vật phẩm ' + x.id + ' còn nháp nhưng asset phát hành cần nó — phát hành nó trước khi bán'; }) : [];
    return Object.assign({ format: 'gen-chibi.project/1', kind: sale ? 'sale' : 'backup', license: '© 2026 Gen Labs — engine; asset thuộc người tạo', project: { id: P.id, name: P.name, description: P.description || '' }, warnings: warnings },
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
    dockObj('project', u.project || null, u.project ? Projects.name(u.project) : '');
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
          if (!p || p.id === 'none' || (p.pack === 'gen.core' && p.khung)) return;   // thân trần của ma-nơ-canh không phải dấu nhận diện
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
          var tmp = GC.registerItem('draft.tmp', c.def).def, base = GC.ASSETS['gen.khung/ma-no-canh'], a = clone(base), rowE = h('div', { class: 'revgrid' });
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
          var m = GC.ASSETS['gen.khung/ma-no-canh'];
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
    var m = GC.ASSETS['gen.khung/ma-no-canh'] || GC.assets()[0];
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
    GC.items().filter(function (it) { return it.pack === 'gen.khung'; }).forEach(function (it) {
      var a = clone(m); a.key = 'khung/' + it.id; a.look.equip = {}; a.look.equip[it.equip.slot] = it.key;
      items.appendChild(h('div', { class: 'libcard' }, h('div', { class: 'im', style: 'display:flex;gap:4px;padding:4px' },
        h('img', { src: R.imageURL(a, 'normal', { director: { view: 'left45' } }), alt: it.name, style: 'width:60%' }),
        h('img', { src: svgURL(GC.itemSvg(it, { size: 80 })), alt: '', style: 'width:38%;align-self:center' })),
        h('div', { class: 'lb' }, h('b', { text: it.name }), h('span', { class: 'note', text: (GC.getPart(it.equip.slot, it.equip.part) || {}).label || '' }))));
    });
    var scenes = h('div', { class: 'stack' });
    GC.scenes().filter(function (sc) { return sc.pack === 'gen.khung'; }).forEach(function (sc) {
      scenes.appendChild(cellImg(svgURL(GC.sceneSvg(sc, { cast: S.spotOrder.map(function (sp) { return { asset: m, spot: sp }; }) })), 640, sc.name + ' — ma-nơ-canh ở đủ ' + S.spotOrder.length + ' chỗ đứng'));
    });
    var blocks = h('div', { class: 'row' });
    GC.scenery('deco').filter(function (p) { return p.pack === 'gen.khung'; }).forEach(function (p) {
      var sc = { key: 'khung/deco-' + p.id, id: 'q', layers: { sky: { part: 'gen.khung/khung-troi', dx: 0 }, ground: { part: 'gen.khung/khung-nen', dx: 0 } }, palette: (GC.getScene('gen.khung/san-khau-chuan') || {}).palette || {},
        deco: [{ part: 'gen.khung/' + p.id, x: 320, y: 320, scale: 1.4, flip: false, z: 'back' }], time: 'day', weather: 'clear', spots: S.spotOrder.slice() };
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
      h('div', anc({ class: 'panel' }, 'panel:khung-quy-cach', 'Quy cách khung'), h('h3', null, 'Quy cách'), spec),
      h('div', anc({ class: 'panel' }, 'asset:' + m.key, 'Khung nhân vật — ma-nơ-canh'), h('h3', null, 'Khung nhân vật — ma-nơ-canh', h('span', { class: 'r mono', text: m.key })), h('div', { class: 'pad stack' }, views, acts)),
      h('div', anc({ class: 'panel' }, 'panel:khung-vat-pham', 'Khung vật phẩm'), h('h3', null, 'Khung vật phẩm — khối theo dáng', h('span', { class: 'r note', text: 'mặc lên ma-nơ-canh (45°) + icon' })), h('div', { class: 'pad' }, items)),
      h('div', anc({ class: 'panel' }, 'panel:khung-boi-canh', 'Khung bối cảnh'), h('h3', null, 'Khung bối cảnh', h('span', { class: 'r note', text: 'nền có lưới tỉ lệ; vạch đứt = hàng sau / hàng trước' })), h('div', { class: 'pad stack' }, scenes, blocks))));
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
    dockObj('asset', base.key, base.name);
    $('view').appendChild(h('div', anc({ class: 'detail scenefab' }, 'scene:' + base.key, base.name), left, h('div', { class: 'sticky stack' }, right)));
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
      GC.scenery(slot).forEach(function (p) { var ref = p.pack + '/' + p.id; sel.appendChild(h('option', { value: ref, text: p.label + (p.pack !== 'gen.khung' ? ' · ' + p.pack : ''), selected: ref === cur })); });
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
      var addDeco = h('button', { class: 'btn sm', disabled: (w.deco || []).length >= S.budget.deco, onclick: function () { w.deco = w.deco || []; w.deco.push({ part: 'gen.khung/khoi-da', x: 320, y: 300, scale: 1, flip: false, z: 'back' }); paintAll(); } }, '+ Đạo cụ');
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

  /* ============================================================ trang: Cài đặt AI › Giọng AI (Google Gemini)
   * Dán key là chạy (server kiểm key miễn phí rồi tự bật); có sẵn key Gemini của AI đạo diễn thì dùng được ngay. Bảng "Bộ giọng vai" (Data Console, STD-07):
   * mỗi hàng một vai (ID vai · vai · giới · giọng đang dùng · nghe · thiết kế), chọn ngôn ngữ + giọng vùng ở đầu bảng. Mọi lời gọi qua AiVoice. */
  function voiceSettings() {
    var V = GC.voices, host = h('div', { class: 'stack', id: 'voice-panel' }), dead = false, gen = 0, msg = null;
    var chipHost = h('span', { class: 'r' }), body = h('div', { class: 'pad kv' });
    var tabHead = h('span', { class: 'r row' }), tabBody = h('div');
    host.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Giọng AI (Google Gemini)', chipHost), body));
    host.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Bộ giọng vai', tabHead), tabBody));
    var lp = VoicePref.get(), lang = lp.lang, accent = lp.accent, memo = {};   // memo: lang|accent|vai → { voice, source, label } từ api/voice/cast

    /* ---- panel 1: trạng thái + key ---- */
    function paintState() {
      var c = AiVoice.cfg;
      clear(body); clear(chipHost);
      if (!c) { body.appendChild(h('div', { class: 'note', style: 'grid-column:1/-1', text: 'Không đọc được trạng thái giọng AI từ máy chủ.' })); return; }
      var on = c.hasKey && !c.off;
      chipHost.appendChild(h('span', { class: on ? 'chip ok' : c.hasKey ? 'chip' : 'chip warn', text: !c.hasKey ? 'Chưa có key' : c.off ? 'Đã tắt' : 'Đã bật' }));
      // trần câu / ngày (Q13): "hôm nay N / trần câu"; chưa có trường (server cũ) thì chỉ đếm
      var cap = typeof c.dailyCap === 'number' ? c.dailyCap : null, today = c.today || 0;
      var todayTxt = cap === null ? 'hôm nay ' + today + ' câu' : cap > 0 ? 'hôm nay ' + today + ' / ' + cap + ' câu' + (today >= cap ? ' (đã chạm trần)' : '') : 'hôm nay ' + today + ' câu (không giới hạn)';
      var bits = [c.hasKey ? 'key: ' + (c.keySource === 'llm' ? 'dùng chung key AI đạo diễn' : 'riêng') : 'chưa có key', todayTxt, (c.cached || 0) + ' câu đã lưu'];
      (c.blocked || []).forEach(function (b) { bits.push(b.model + ' hết lượt tới ' + clockOf(b.until)); });
      var keyIn = h('input', { type: 'password', 'aria-label': 'API key Google AI Studio', placeholder: c.hasKey ? 'Đã có key — dán key mới nếu muốn đổi' : 'Dán API key Google AI Studio (AIza…)', style: 'flex:1;min-width:200px', autocomplete: 'off', onkeydown: function (ev) { if (ev.key === 'Enter') connect(); } });
      var conB = h('button', { class: 'btn primary', onclick: connect }, 'Kết nối');
      var msgEl = h('div', { class: 'note', role: 'status', 'aria-live': 'polite' });
      function say(ok, text) { msgEl.textContent = text; msgEl.className = 'note ' + (ok ? 'ok' : 'bad'); }
      if (msg) { say(msg.ok, msg.text); msg = null; }
      function connect() {
        var k = keyIn.value.trim();
        if (!k) { keyIn.focus(); say(false, 'Dán key vào ô trước.'); return; }
        conB.disabled = true; conB.textContent = 'Đang kiểm tra key…'; say(true, 'Đang kiểm tra key với Google (miễn phí, không tốn lượt)…');
        Store.api('PUT', 'api/voice', { apiKey: k }).then(function (r) {
          keyIn.value = ''; AiVoice.set(r); AiVoice.casts = {}; AiVoice.libs = {};
          msg = { ok: true, text: 'Đã kết nối — ' + ((r.models || []).length) + ' model đọc giọng. Giọng AI đã bật, dùng được ngay.' };
          if (!dead) { paintState(); paintTable(); }
        }).catch(function (e) { if (dead) return; conB.disabled = false; conB.textContent = 'Kết nối'; say(false, e.message); keyIn.focus(); });
      }
      var link = c.keyUrl && /^https:\/\//.test(c.keyUrl) ? h('a', { href: c.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Lấy key miễn phí ở Google AI Studio ›') : null;
      var tog = h('button', { class: 'btn', disabled: !c.hasKey, title: c.hasKey ? '' : 'Chưa có key', onclick: function () {
        tog.disabled = true;
        Store.api('PUT', 'api/voice', { enabled: !!c.off }).then(function (r) { AiVoice.set(r); if (!dead) { paintState(); paintTable(); } }).catch(function (e) { toast(e.message); tog.disabled = false; });
      } }, c.off ? 'Bật giọng AI' : 'Tắt giọng AI');
      var clr = c.keySource === 'voice' ? h('button', { class: 'btn danger', onclick: function () {
        if (clr.getAttribute('data-confirm') !== '1') { clr.setAttribute('data-confirm', '1'); clr.textContent = 'Bấm lần nữa để xoá key riêng'; return; }
        Store.api('PUT', 'api/voice', { clearKey: true }).then(function (r) { AiVoice.set(r); toast('Đã xoá key giọng riêng.'); if (!dead) { paintState(); paintTable(); } }).catch(function (e) { toast(e.message); });
      } }, 'Xoá key riêng') : null;
      body.appendChild(h('label', { text: 'Trạng thái' })); body.appendChild(h('div', { class: 'mono', style: 'font-size:12px', text: bits.join(' · ') }));
      // giọng bị đánh dấu hỏng (lỗi riêng giọng đó): tự gỡ sau 24 giờ; nút này gỡ ngay để thử lại
      var bad = (c.bad || []).filter(function (b) { return b && b.voice; });
      if (bad.length) {
        var badB = h('button', { class: 'btn sm', title: 'Gỡ dấu "hỏng" của mọi giọng để thử lại ngay (không tốn lượt)', onclick: function () {
          badB.disabled = true;
          Store.api('PUT', 'api/voice', { clearBad: true }).then(function (r) {
            AiVoice.set(r); AiVoice.casts = {}; AiVoice.libs = {}; memo = {};   // cast / thư viện tính lại với đủ giọng
            toast('Đã gỡ dấu giọng hỏng — thử lại ở lần đọc kế tiếp.');
            if (!dead) { paintState(); paintTable(); }
          }).catch(function (e) { toast(e.message); badB.disabled = false; });
        } }, 'Thử lại giọng hỏng');
        body.appendChild(h('label', { text: 'Giọng hỏng' }));
        body.appendChild(h('div', { class: 'row' }, h('span', { class: 'note warn', title: bad.map(function (b) { return b.voice + (b.until ? ' (tới ' + clockOf(b.until) + ')' : ''); }).join(', '), text: bad.length + ' giọng tạm hỏng (tự thử lại sau 24 h)' }),
          h('span', { class: 'note mono', text: bad.slice(0, 5).map(function (b) { return b.voice; }).join(', ') + (bad.length > 5 ? '…' : '') }), badB));
      }
      body.appendChild(h('label', { text: 'API key Google' }));
      body.appendChild(h('div', { class: 'stack', style: 'gap:6px' },
        c.keySource === 'llm' ? h('div', { class: 'banner acc' }, h('span', { text: 'Đã dùng được key Gemini của AI đạo diễn — không cần dán thêm. Chỉ dán ở đây nếu muốn dùng một key Google riêng cho giọng.' })) : null,
        h('div', { class: 'row', style: 'flex-wrap:nowrap' }, keyIn, conB), msgEl, link ? h('div', { class: 'note' }, link) : null));
      body.appendChild(h('span')); body.appendChild(h('div', { class: 'row' }, tog, clr));
      // trần câu / ngày: máy chủ chặn đọc MỚI khi đủ trần (Studio, agent MCP đều qua đây) — chặn tiền tiêu quá tay nếu project Google đã bật thanh toán
      if (cap !== null) {
        var capMsg = h('div', { class: 'note', role: 'status', 'aria-live': 'polite' });
        var capIn = h('input', { type: 'number', min: '0', max: '5000', step: '1', value: String(cap), 'aria-label': 'Trần câu / ngày', style: 'width:110px', onkeydown: function (ev) { if (ev.key === 'Enter') saveCap(); } });
        var capB = h('button', { class: 'btn', onclick: function () { saveCap(); } }, 'Lưu trần');
        var saveCap = function () {
          var raw = capIn.value.trim(), n = Number(raw);
          if (raw === '' || !isFinite(n) || n < 0 || n > 5000 || Math.floor(n) !== n) { capIn.focus(); capMsg.textContent = 'Nhập số nguyên từ 0 đến 5000 (0 = không giới hạn).'; capMsg.className = 'note bad'; return; }
          capB.disabled = true; capMsg.textContent = ''; capMsg.className = 'note';
          Store.api('PUT', 'api/voice', { dailyCap: n }).then(function (r) {
            AiVoice.set(r); toast(n > 0 ? 'Đã đặt trần ' + n + ' câu / ngày.' : 'Đã bỏ trần câu / ngày (không giới hạn).');
            if (!dead) { paintState(); paintTable(); }
          }).catch(function (e) { capB.disabled = false; capMsg.textContent = e.message; capMsg.className = 'note bad'; });
        };
        body.appendChild(h('label', { text: 'Trần câu / ngày' }));
        body.appendChild(h('div', { class: 'stack', style: 'gap:4px' }, h('div', { class: 'row' }, capIn, h('span', { class: 'note', text: 'câu mỗi ngày' }), capB),
          h('div', { class: 'note', text: 'Mặc định 200; 0 = không giới hạn. Đủ trần thì máy chủ chặn đọc mới tới 00:00 hôm sau (Studio và agent đều qua đây); câu đã đọc rồi vẫn phát lại miễn phí. Có ích nhất khi project Google của bạn đã bật thanh toán.' }), capMsg));
      }
      body.appendChild(h('span'));
      body.appendChild(h('div', { class: 'stack note', style: 'gap:4px' },
        h('div', { text: 'Gói miễn phí của Google rất ít lượt mỗi ngày (cỡ vài chục câu). Câu đã đọc được lưu đệm trên máy — đọc lại không tốn lượt, xuất phim cũng không tốn.' }),
        h('div', { text: 'Bật thanh toán ở Google AI Studio là quyết định của chủ máy; gen-chibi không tự bật. Hết lượt thì giọng tự rơi về giọng máy đọc của trình duyệt.' })));
    }

    /* ---- panel 2: bảng bộ giọng vai ---- */
    var langSel = h('select', { 'aria-label': 'Ngôn ngữ bộ giọng', onchange: function () { lang = langSel.value; accent = V.accent(lang, ''); VoicePref.set(lang, accent); fillAccent(); paintTable(); } });
    V.langList().forEach(function (l) { langSel.appendChild(h('option', { value: l.id, text: l.label })); });
    var accSel = h('select', { 'aria-label': 'Giọng vùng bộ giọng', onchange: function () { accent = accSel.value; VoicePref.set(lang, accent); paintTable(); } });
    function fillAccent() {
      clear(accSel);
      V.langList().filter(function (l) { return l.id === lang; })[0].accents.forEach(function (x) { accSel.appendChild(h('option', { value: x.id, text: x.label })); });
      accSel.value = accent;
    }
    langSel.value = lang; fillAccent();
    tabHead.appendChild(langSel); tabHead.appendChild(accSel);
    function mk(role) { return lang + '|' + accent + '|' + role; }
    function designed(roleId) { var c = AiVoice.cfg || {}, d = c.designs && c.designs[roleId + '|' + lang + '|' + accent], m = memo[mk(roleId)]; return !!d || !!(m && m.source === 'design'); }
    function castRole(roleId) {   // giọng đang dùng cho vai: hỏi api/voice/cast với MỘT diễn viên giả mang vai đó
      var R = V.ROLES[roleId], k = mk(roleId);
      return Store.api('POST', 'api/voice/cast', { lang: lang, accent: accent, actors: [{ id: roleId, role: roleId, gender: R.gender }] }).then(function (r) { var c = r && r.cast && r.cast[roleId]; if (c) memo[k] = c; return c || null; });
    }
    function paintTable() {
      var g = ++gen, ready = AiVoice.ready(), cells = {};
      clear(tabBody);
      var roles = V.roleList(), t = h('table', { class: 'grid roles' });
      var lt = h('tr', { class: 'letters' });
      'ABCDEF'.split('').forEach(function (x) { lt.appendChild(h('td', { text: x })); });
      t.appendChild(lt);
      var hd = h('tr');
      [['ID vai', ''], ['Vai', ''], ['Giới', ''], ['Giọng đang dùng', ''], ['Nghe · ▶ AI tốn 1 lượt', ''], ['Thiết kế · ~25 s · tốn 1 lượt', '']].forEach(function (cl) { hd.appendChild(h('th', { text: cl[0] })); });
      t.appendChild(hd);
      var nDesign = 0, lastAge = '';
      roles.forEach(function (r) {
        if (r.age !== lastAge) {
          lastAge = r.age;
          t.appendChild(h('tr', { class: 'grp' }, h('td', { colspan: '6', text: r.ageLabel + ' · ' + roles.filter(function (x) { return x.age === r.age; }).length + ' vai' })));
        }
        var useTd = h('td', { class: 'nw' }), sample = VOICE_SAMPLE[lang];
        var local = function () { return GC.audio.voiceOf({ id: r.id, voice: { role: r.id } }, { lang: lang, accent: accent }); };
        var hear = h('button', { class: 'btn sm', 'aria-label': 'Nghe giọng máy đọc — ' + r.label, title: 'Nghe bằng giọng máy đọc của trình duyệt (miễn phí, giọng dự phòng)', onclick: function () { GC.audio.unlock(); GC.audio.say(sample, local()); } }, '▶');
        var hearAi = h('button', { class: 'btn sm', 'aria-label': 'Nghe giọng AI — ' + r.label, disabled: !ready, title: ready ? 'Đọc một câu mẫu bằng giọng AI — tốn 1 lượt (câu đã đọc rồi thì không tốn lại)' : 'Cần key Google (dán ở trên)', onclick: function () {
          hearAi.disabled = true; hearAi.textContent = 'Đang đọc…';
          var have = memo[mk(r.id)], voiceP = have ? Promise.resolve(have.voice) : castRole(r.id).then(function (x) { if (!x) throw new Error('Server không chọn được giọng cho vai này'); return x.voice; });
          voiceP.then(function (voice) { return AiVoice.get({ text: sample, voice: voice, role: r.id, lang: lang, accent: accent, state: 'normal', bubble: 'say' }, false, true).then(function (x) { AiVoice.speak(sample, x.buf, local()); }); })
            .catch(function (e) { toast(e.status === 429 ? AiVoice.quotaText(e) + '.' : e.message); })
            .then(function () { if (dead) return; hearAi.disabled = !AiVoice.ready(); hearAi.textContent = '▶ AI'; });
        } }, '▶ AI');
        useTd.appendChild(hear); useTd.appendChild(document.createTextNode(' ')); useTd.appendChild(hearAi);
        var kid = !!CHILD_AGE[r.age], msgKid = 'Google không cho thiết kế giọng trẻ em — dùng giọng trẻ trung có sẵn';
        var des = h('button', { class: 'btn sm', 'aria-label': 'Thiết kế giọng — ' + r.label, disabled: kid || !ready, onclick: function () { design(r, des, voiceTd); } }, designed(r.id) ? 'Thiết kế lại' : 'Thiết kế giọng');
        var desTd = h('td', { class: 'nw' }, h('span', { title: kid ? msgKid : ready ? 'Thiết kế giọng riêng cho vai này trên project Google của bạn: ~25 giây, tốn 1 lượt (≈ $0,013 khi trả phí). Kết quả được nhớ — mọi phim dùng vai này đều dùng giọng đó.' : 'Cần key Google (dán ở trên)' }, des));
        if (designed(r.id)) nDesign++;
        var voiceTd = h('td', { class: 'nw' });
        cells[r.id] = voiceTd;
        paintVoice(voiceTd, r.id, ready);
        t.appendChild(h('tr', null, h('td', { class: 'id', text: r.id }), h('td', null, r.label, ' ', h('span', { class: 'tag', text: r.kindLabel })),
          h('td', null, h('span', { class: 'chip', text: r.gender === 'f' ? 'Nữ' : 'Nam' })), voiceTd, useTd, desTd));
      });
      tabBody.appendChild(h('div', { class: 'scroll', style: 'max-height:560px' }, t));
      tabBody.appendChild(h('div', { class: 'pad note', text: roles.length + ' vai · ' + nDesign + ' đã thiết kế riêng cho ' + V.LANGS[lang].label + ' · ' + V.accent(lang, accent) + '. ▶ = giọng máy đọc của trình duyệt (miễn phí). ▶ AI và Thiết kế giọng tốn lượt Google; giọng trẻ em (bé trai, bé gái, thiếu niên, thiếu nữ) Google không cho thiết kế — dùng giọng trẻ trung có sẵn.' + (LANG_HINT[lang] ? ' ' + LANG_HINT[lang] : '') }));
      // giọng vùng trung thực (Q14): chỉ vai đã Thiết kế giọng mới có giọng vùng thật
      tabBody.appendChild(h('div', { class: 'pad note', style: 'padding-top:0', text: 'Giọng vùng chỉ có hiệu lực ở vai đã Thiết kế giọng; chưa thiết kế = giọng chung của ngôn ngữ.' + (lang === 'en' ? ' (Anh Mỹ / Anh Anh có thư viện giọng Google riêng nên có sẵn.)' : '') }));
      // giọng đang dùng của từng vai: tải dần (≤ 4 yêu cầu cùng lúc), bỏ kết quả của lần vẽ cũ
      if (!ready) return;
      var q = roles.filter(function (r) { return !memo[mk(r.id)]; }), busy = 0;
      (function pump() {
        while (busy < 4 && q.length && g === gen && !dead) {
          (function (r) {
            busy++;
            castRole(r.id).catch(function () { return null; }).then(function () { busy--; if (g === gen && !dead) { paintVoice(cells[r.id], r.id, true); pump(); } });
          })(q.shift());
        }
      })();
    }
    // ô "Giọng đang dùng": tên giọng + nguồn (thiết kế / thư viện Google / có sẵn / đã chọn); chưa có key → giọng máy đọc
    function paintVoice(td, roleId, ready) {
      clear(td);
      if (!ready) { td.appendChild(h('span', { class: 'chip', text: 'giọng máy đọc', title: 'Chưa có key Google: phim dùng giọng máy đọc của trình duyệt' })); return; }
      var m = memo[mk(roleId)];
      if (!m) { td.appendChild(h('span', { class: 'muted', text: '…' })); return; }
      var sc = SRC_CHIP[m.source] || ['', 'chip'];
      td.appendChild(h('span', { class: 'v', title: m.label || '', text: m.voice }));
      if (sc[0]) td.appendChild(h('span', { class: sc[1], style: 'margin-left:6px', text: sc[0] }));
    }
    // thiết kế giọng cho vai: ~25 s, tốn 1 lượt; xong nghe thử ngay bằng clip xem trước
    function design(r, btn, td) {
      var was = btn.textContent;
      btn.disabled = true; btn.textContent = 'Đang thiết kế… ~25 s';
      Store.api('POST', 'api/voice/design', { role: r.id, lang: lang, accent: accent }).then(function (x) {
        var c = AiVoice.cfg; if (c) { c.designs = c.designs || {}; c.designs[r.id + '|' + lang + '|' + accent] = { voice: x.voice, at: new Date().toISOString() }; }
        delete memo[mk(r.id)]; AiVoice.casts = {}; AiVoice.libs = {};   // phim dùng ngay giọng mới
        toast('Đã thiết kế giọng cho ' + r.label + (x.preview ? ' — đang nghe thử.' : '.'));
        if (!dead) { btn.textContent = 'Thiết kế lại'; paintVoice(td, r.id, true); castRole(r.id).then(function () { if (!dead) paintVoice(td, r.id, true); }).catch(function () {}); }
        return x.preview ? AiVoice.download(x.preview).then(function (buf) { AiVoice.speak(VOICE_SAMPLE[lang], buf, GC.audio.voiceOf({ id: r.id, voice: { role: r.id } }, { lang: lang, accent: accent })); }) : null;
      }).catch(function (e) { toast(e.status === 429 ? AiVoice.quotaText(e) + '.' : e.message); if (!dead) btn.textContent = was; })
        .then(function () { if (!dead) btn.disabled = !AiVoice.ready(); });
    }

    function refresh() { return AiVoice.load(true).then(function () { if (dead) return; paintState(); paintTable(); }); }
    host.refresh = refresh;
    host.destroy = function () { dead = true; GC.audio.hush(); };
    if (AiVoice.cfg) { paintState(); paintTable(); } else body.appendChild(h('div', { class: 'note', style: 'grid-column:1/-1', text: 'Đang đọc trạng thái giọng AI…' }));
    refresh();
    return host;
  }

  /* ============================================================ trang: Cài đặt AI */
  PAGES.ai = function (r) {
    crumbs([{ t: 'Cài đặt AI' }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel empty', text: 'Cài đặt AI chỉ có ở bản cài trên máy: API key được mã hoá và giữ trên máy của bạn, không đi qua trình duyệt.' })); return; }
    var box = h('div', { class: 'stack' }), voiceHost = voiceSettings(), focusVoice = r && r.focus === 'voice';
    onLeave(function () { voiceHost.destroy(); });
    if (focusVoice) { delete r.focus; try { localStorage.setItem(routeKey(APP), JSON.stringify(r)); } catch (e) { /* bỏ qua */ } }   // vào từ nút "Dán key ở Cài đặt AI": cuộn tới panel giọng + trỏ vào ô key
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

      // giọng AI (Google Gemini): panel dùng chung một bản cho cả trang (không dựng lại mỗi lần lưu LLM); key Gemini của AI đạo diễn đổi thì trạng thái giọng đổi theo
      box.appendChild(voiceHost);
      voiceHost.refresh().then(function () {   // trỏ vào ô key SAU khi panel vẽ xong (vẽ lại sẽ làm mất con trỏ)
        if (!focusVoice) return;
        focusVoice = false;
        voiceHost.scrollIntoView({ block: 'start' }); var k = voiceHost.querySelector('input[type="password"]'); if (k) k.focus({ preventScroll: true });
      });

      var port = (Store.info && Store.info.port) || 7480;
      var link = Store.info && Store.info.mcp && Store.info.mcp.link;
      function copyBtn(label, t) { return h('button', { class: 'btn sm', text: label, onclick: function () { navigator.clipboard.writeText(t).then(function () { toast('Đã sao chép'); }, function () { toast('Không sao chép được — chọn và copy tay'); }); } }); }
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Nối agent qua MCP', h('span', { class: 'r note', text: 'agent tự viết công thức và kịch bản, không tốn LLM API lõi' })),
        h('div', { class: 'pad stack' },
          h('div', { class: 'note', text: 'Agent (Claude Code, Claude web/desktop, hoặc agent bất kỳ hỗ trợ MCP) gọi các tool của nhà xưởng (danh sách đầy đủ: lệnh genchibi agent tools): tra kho, kiểm, dựng SVG; tạo nhân vật / linh kiện / vật phẩm / bối cảnh; dự án chủ đề và gói dự án; tác phẩm (kịch bản, phân cảnh); kiểm và cập nhật phiên bản. Kết quả hiện ngay trong Studio.' }),
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
    if (window.GCDock) window.GCDock.attach(DOCK_BRIDGE);   // dock Trợ lý AI ở cột phải: trước lần go() đầu tiên
    $('brand').setAttribute('href', appURL(''));
    var r = { page: APP ? APP.home : 'home' };
    try {
      var saved = APP && JSON.parse(localStorage.getItem(routeKey(APP)) || 'null');
      var z0 = saved && zoneOf(saved.page);
      if (saved && PAGES[saved.page] && (z0 === APP.zone || z0 === 'sys') && (saved.page !== 'character' || GC.ASSETS[saved.key])) r = saved;
    } catch (e) { /* bỏ qua */ }
    var hv = APP && APP.id === 'tao-tac' ? parseWorkHash() : null;   // địa chỉ có id tác phẩm (deep link) thắng route đã lưu
    if (hv) r = hv;
    // Back / Forward giữa danh sách và phòng tác phẩm
    window.addEventListener('popstate', function () { if (APP && APP.id === 'tao-tac') go(parseWorkHash() || { page: 'works' }); });
    if (Store.mode === 'server') Store.api('GET', 'api/update').then(function (s) { updateBadge = s.available ? s.latest : false; go(r); }).catch(function () { go(r); });
    else go(r);
  });
})();
