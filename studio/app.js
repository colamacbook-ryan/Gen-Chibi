/* gen-chibi Studio — giao diện quản lý (Data Console, desktop-first)
 * © 2026 Gen Labs — All rights reserved.
 * Hai chế độ lưu: "máy chủ" (bản cài, /api) hoặc "trình duyệt" (xem thử, localStorage).
 */
(function () {
  'use strict';
  var GC = window.GenChibi, LIB = GC.LIB, R = GC.render;
  // NGÔN NGỮ (ADR 0007, engine/i18n.js): msgid = chuỗi tiếng Việt hiện có. _t = câu giao diện · _l = nhãn DỮ LIỆU (engine / người dùng:
  // có bản dịch thì dịch, không thì giữ nguyên, không ghi "thiếu") · N_ = đánh dấu chuỗi ở bảng hằng cấp module — dịch lúc HIỂN THỊ bằng _t().
  var I18N = GC.i18n, _t = I18N.t, _pt = I18N.pt, _l = I18N.label, N_ = I18N.N;   // _pt(ngữ cảnh, msgid): một chữ Việt, hai nghĩa tiếng Anh
  // _lo(x, s): chữ của MỘT ĐỐI TƯỢNG dữ liệu (tên / nhãn / vai / mô tả của nhân vật, vật phẩm, bối cảnh, linh kiện, đòn, âm, dự án…) — CNS-158: chỉ dịch đồ của
  // Gen Labs (GC.isGenLabs: bộ khung, đòn khung, bộ âm chuẩn); nội dung người dùng (Của tôi, bộ mẫu đã nhập, gói nhập, dự án) giữ nguyên chữ, kể cả khi trùng
  // msgid — nhân vật "Nam" không hiện "Male", vật phẩm "Đạt" không hiện "Approved". _l chỉ còn cho nhãn từ vựng của engine (trạng thái, khe, giọng…)
  function _lo(x, s) { return GC.isGenLabs(x) ? _l(s) : s == null ? '' : String(s); }
  // mục cổng kiểm của engine: câu có số đếm trả kèm labelId / detailId (mẫu {n}) → dịch theo mẫu; câu tĩnh → nhãn dữ liệu (v0.20)
  function gL(g) { return g.labelId ? _l(g.labelId, g.labelVars) : _l(g.label); }
  function gD(g) { return g.detailId ? _l(g.detailId, g.detailVars) : _l(g.detail || ''); }
  N_('Cảnh đã đổi sau khi duyệt — cần xem lại.');   // msgid ghi chú hệ thống (server/mcp.js reviewTouched) — hiển thị bằng _l(n.text)
  // 8 hướng (2.5D): tên góc → nhãn. Thứ tự = GC.VIEW_ORDER. Sprite 8 hướng đi vòng theo chiều kim đồng hồ từ chính diện.
  var VIEW_LABEL = { front: N_('Chính diện'), left: N_('3/4 trái'), right: N_('3/4 phải'), left45: N_('45° trái'), right45: N_('45° phải'), left90: N_('90° trái'), right90: N_('90° phải'),
    left135: N_('135° trái'), right135: N_('135° phải'), back: N_('Sau lưng') };
  var VIEWS_ALL = GC.VIEW_ORDER.map(function (v) { return [v, VIEW_LABEL[v] || v]; });   // nhãn = msgid: hiển thị qua _t()
  function viewLabel(v) { return VIEW_LABEL[v] ? _t(VIEW_LABEL[v]) : v; }
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
  function dec(s) { s = String(s); return I18N.lang() === 'vi' ? s.replace('.', ',') : s; }   // dấu thập phân: vi 0,5 · en 0.5
  function fmtTime(s) { if (!s) return '—'; var d = new Date(s); return d.toLocaleString(I18N.locale(), { hour12: false }); }
  function stateLabel(id) { return _l((LIB.states[id] || {}).label || id); }
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800); }
  var OWN = ['#5B9BD5', '#4FB57A', '#8C86E0', '#E0A43A', '#C08463', '#2BB3A3', '#D9708F', '#B97BD0', '#8DA65A', '#E4785F'];
  function ownOf(a) { var i = GC.ASSET_ORDER.indexOf(a.key); return a.own || OWN[(i < 0 ? 0 : i) % OWN.length]; }

  /* ============================================================ ngôn ngữ giao diện (ADR 0007) */
  // Thứ tự chọn: ?lang= (chỉ lần mở này) → người dùng chọn (localStorage gc-lang, nhớ theo trình duyệt) → mặc định của máy chủ
  // (settings.uiLang — trình cài đặt khởi tạo từ GC_LANG) → en. Bảng locales/<lang>/*.json nạp MỘT lần, TRƯỚC lần vẽ đầu (trang ẩn tới lúc đó → không nháy chữ Việt).
  // Đổi ngôn ngữ: nạp bảng + vẽ lại khung, menu, dock và trang đang mở (bản nháp đang gõ trong bộ nhớ trang vẫn còn; dữ liệu đã lưu không đụng).
  var Lang = {
    // bảng nạp theo thứ tự (tệp sau đè tệp trước khi trùng khoá); OPTIONAL: tệp có thể chưa có trong bản cài (vd. engine-data.json của nhánh nhãn engine) — thiếu thì bỏ qua, không lỗi
    KEY: 'gc-lang', FILES: ['studio', 'engine', 'player', 'engine-data'], OPTIONAL: { 'engine-data': 1 }, loaded: {}, tables: {}, server: '',
    NAMES: { en: 'English', vi: 'Tiếng Việt' },   // i18n-ignore(tên tự gọi của ngôn ngữ, phần tử mang lang="vi")   // tên tự gọi (endonym) — không dịch; phần tử mang lang="…"
    query: function () { try { return I18N.norm(new URLSearchParams(location.search).get('lang')); } catch (e) { return ''; } },
    stored: function () { try { return I18N.norm(localStorage.getItem(this.KEY)); } catch (e) { return ''; } },
    pick: function () { return this.query() || this.stored() || I18N.norm(this.server) || I18N.DEFAULT; },
    load: function (l) {
      var self = this;
      if (l === I18N.SOURCE || this.loaded[l]) { I18N.setLang(l); return Promise.resolve(l); }
      return Promise.all(this.FILES.map(function (f) {
        return fetch('locales/' + l + '/' + f + '.json').then(function (r) { if (!r.ok) { if (self.OPTIONAL[f]) return {}; throw new Error(f + '.json: HTTP ' + r.status); } return r.json(); });
      }))
        .then(function (ds) { ds.forEach(function (d, i) { I18N.add(l, d); self.tables[l + '/' + self.FILES[i]] = d; }); self.loaded[l] = true; })
        .catch(function (e) { console.warn('[i18n] không nạp được bảng ' + l + ':', e && e.message); })   // mở bằng file:// / thiếu bảng: hiện msgid (tiếng Việt) thay vì trang trắng
        .then(function () { I18N.setLang(l); return l; });
    },
    // đầu trang: mặc định của máy (api/health công khai — màn đăng nhập cũng đúng ngôn ngữ) → nạp bảng → hiện trang
    boot: function () {
      var self = this;
      var srv = this.query() || this.stored() ? Promise.resolve() : fetch('api/health').then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) { self.server = (j && j.uiLang) || ''; }).catch(function () { /* bản xem thử: không có máy chủ */ });
      return srv.then(function () { return self.load(self.pick()); }).then(function (l) { document.documentElement.lang = l; paintStatic(); document.documentElement.classList.add('gc-ready'); return l; });
    },
    // bảng nhúng vào phim HTML xuất ra (trình phát dịch chữ engine/player.js lúc chạy): nhãn engine (engine + engine-data) + player; vi = msgid, không cần bảng
    playerDict: function (l) {
      var out = {}, self = this;
      ['engine', 'engine-data', 'player'].forEach(function (f) { var d = self.tables[l + '/' + f] || {}; Object.keys(d).forEach(function (k) { if (k.slice(0, 2) !== '//') out[k] = d[k]; }); });
      return out;
    },
    // người dùng chọn: nhớ theo trình duyệt rồi vẽ lại ngay
    set: function (l) {
      l = I18N.norm(l);
      if (!l) return Promise.resolve('');
      try { localStorage.setItem(this.KEY, l); } catch (e) { /* trình duyệt chặn lưu: vẫn đổi trong phiên */ }
      if (this.query()) { try { var u = new URL(location.href); u.searchParams.delete('lang'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* bỏ qua */ } }   // ?lang= không được thắng lựa chọn vừa bấm khi tải lại
      return this.load(l).then(function () { document.documentElement.lang = l; repaint(); return l; });
    }
  };
  // phần tĩnh của index.html: data-i18n (chữ) · data-i18n-title · data-i18n-aria-label mang msgid
  function paintStatic() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-aria-label]'), function (el) {
      if (el.hasAttribute('data-i18n')) el.textContent = _t(el.getAttribute('data-i18n'));
      if (el.hasAttribute('data-i18n-title')) el.title = _t(el.getAttribute('data-i18n-title'));
      if (el.hasAttribute('data-i18n-aria-label')) el.setAttribute('aria-label', _t(el.getAttribute('data-i18n-aria-label')));
    });
    paintLangSwitch($('langSwitch'), true);
  }
  // nút chuyển ngôn ngữ (chân thanh bên + Hệ thống › Ngôn ngữ): EN | VI, có hiệu lực ngay
  function paintLangSwitch(host, compact) {
    if (!host) return;
    clear(host);
    var seg = h('div', { class: 'seg langseg', role: 'group', 'aria-label': _t('Ngôn ngữ giao diện') + ' · Language' });
    I18N.LANGS.forEach(function (l) {
      seg.appendChild(h('button', { type: 'button', lang: l, 'data-lang': l, 'aria-pressed': String(I18N.lang() === l), title: Lang.NAMES[l],
        onclick: function () { if (I18N.lang() !== l) Lang.set(l); } }, compact ? l.toUpperCase() : Lang.NAMES[l]));
    });
    host.appendChild(seg);
  }

  /* ============================================================ lưu trữ */
  var MY_PACK = 'local.my';
  // nạp bản ghi đã lưu như sync() của server: bản ghi cũ nằm trong pack khung → bản sao "Của tôi", khung không bị đè
  function regStored(a) {
    var P = GC.PACKS[GC.canonPack(a.pack)];
    if (P && P.group === 'frame') { if (!GC.ASSETS[MY_PACK + '/' + a.id]) GC.registerAsset(MY_PACK, Object.assign({}, a, { pack: MY_PACK, status: 'draft' })); return; }   // bản sao từ khung luôn là nháp (như server)
    GC.registerAsset(a.pack, a);
  }
  GC.pack({ id: MY_PACK, name: N_('Của tôi'), owner: N_('Bạn'), group: 'mine', visibility: 'private', license: N_('Thuộc người tạo'), description: N_('Nhân vật bạn tạo hoặc chỉnh trên máy này.') }, function () {});

  /* ============================================================ đăng nhập chủ máy (v0.21 §3.3–§3.4; v0.23 §A.1 / §A.2) */
  // Ba màn trên cùng một lớp phủ #gcLogin: ĐĂNG NHẬP (tên đăng nhập + mật khẩu; lần đầu: admin / admin trong cửa sổ 30 phút do lệnh trên máy chủ mở —
  // không nhận thì server nói ĐÚNG lý do + cách vào), KHỞI TẠO tài khoản chủ (phiên admin hoặc token, bắt buộc trước mọi trang — §A.2) và TOKEN (máy kế
  // thừa / CLI — như v0.20). Server là nơi kiểm duy nhất; ở đây chỉ dẫn đường. Mã setup v0.21 đã bỏ.
  var Auth0 = { key: '' };
  // dải 3 bước của thiết lập lần đầu ở màn khởi tạo (CNS-272: owner thấy cả đường đi ngay ở bước bắt buộc đầu tiên) — cùng lớp .sustep với wizard
  function setupSteps(cur) {
    var cells = [[_t('Tài khoản chủ'), _t('Tên đăng nhập + mật khẩu của bạn')], [_t('Tên miền'), _t('Đưa lên mạng, hoặc chỉ dùng trên máy này')], [_t('Chẩn đoán MCP'), _t('Tự kiểm trên máy + nối agent đầu tiên')]];
    return h('div', { class: 'sustep', id: 'gcSteps' }, cells.map(function (c, i) {
      return h('div', { 'data-step': String(i + 1), 'data-state': i + 1 === cur ? 'cur' : 'todo', 'aria-current': i + 1 === cur ? 'step' : null },
        h('span', { class: 'n', text: _t('BƯỚC {n}', { n: i + 1 }) }), h('b', { text: c[0] }), h('span', { class: 'note', text: c[1] }));
    }));
  }
  // khoá một lần của link cửa sổ admin (CNS-268): http://localhost:<cổng>/login#k=<khoá> do lệnh trên máy chủ in / mở. Phần # không đi tới server trong URL;
  // đọc một lần, xoá khỏi thanh địa chỉ (không lưu lịch sử / không lộ khi chia sẻ màn hình), chỉ giữ trong sessionStorage của tab này — gửi kèm khi đăng nhập admin
  var ADMIN_KEY = 'gc-admin-key';
  (function () {
    var m = /^#k=([0-9a-f]{32})$/.exec(location.hash || '');
    if (!m) return;
    try { sessionStorage.setItem(ADMIN_KEY, m[1]); } catch (e) { /* trình duyệt chặn lưu: link vẫn dùng được trong lần tải này */ Auth0.key = m[1]; }
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* bỏ qua */ }
  })();
  var Auth = {
    st: null,
    adminKey: function () { var k = ''; try { k = sessionStorage.getItem(ADMIN_KEY) || ''; } catch (e) { k = Auth0.key || ''; } return /^[0-9a-f]{32}$/.test(k) ? k : ''; },
    // ?next=/đường/nội-bộ (trang Cấp phép gửi sang) — chỉ nhận đường cùng máy, không // (khác máy), không ký tự lạ
    next: function () { var n = ''; try { n = new URLSearchParams(location.search).get('next') || ''; } catch (e) { /* bỏ qua */ } return /^\/(?![\/\\])[A-Za-z0-9\/%._~!*'()?&=+,:;@-]*$/.test(n) ? n : '/'; },
    done: function () { if (/^\/(login|setup)$/.test(location.pathname)) location.replace(Auth.next()); else location.reload(); },
    post: function (url, body, token) {
      var hd = { 'Content-Type': 'application/json', 'X-GC-Request': '1', 'X-GC-Lang': I18N.lang() };
      if (token) { hd.Authorization = 'Bearer ' + token; hd['X-GC-Studio'] = '1'; }
      return fetch(url, { method: 'POST', headers: hd, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); });
    },
    // mode: '' (tự chọn theo trạng thái máy) | 'token' | 'token-wrong' | 'login' | 'init'
    show: function (mode) {
      if (document.getElementById('gcLogin')) return new Promise(function () {});
      fetch('api/auth/state', { headers: Store.headers() }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (st) {
        Auth.st = st;
        // phiên admin (A) / token khi chưa khởi tạo → màn khởi tạo; máy kế thừa chưa có mật khẩu → token như v0.20 (CNS-173); còn lại → đăng nhập
        var m = mode || (st.who === 'A' || (st.who === 'T' && /^(admin|must_init)$/.test(st.stage)) ? 'init' : !st.password && st.legacy ? 'token' : 'login');
        Auth.render(m === 'token-wrong' ? 'token' : m, m === 'token-wrong');
      });
      return new Promise(function () {});
    },
    render: function (mode, wrong) {
      var old = document.getElementById('gcLogin'); if (old) old.parentNode.removeChild(old);
      var st = Auth.st || {}, minLen = st.minLength || 12, tok = Store.token();
      var err = h('div', { role: 'alert', hidden: true, style: 'color:var(--danger);font-size:12px;white-space:pre-line' });
      var fail = function (msg) { err.hidden = false; err.textContent = '✗ ' + msg; busy(false); };
      var btn = h('button', { class: 'btn primary', type: 'submit' }), busy = function (on) { btn.disabled = on; };
      var link = function (text, to) { return h('a', { href: '#', class: 'note', onclick: function (ev) { ev.preventDefault(); Auth.render(to); } }, text); };
      var field = function (label, inp, note) { return h('label', { style: 'display:grid;gap:4px' }, h('span', { class: 'note', text: label }), inp, note ? h('span', { class: 'note', text: note }) : null); };
      var input = function (o) { return h('input', Object.assign({ style: 'width:100%', spellcheck: 'false' }, o)); };
      var title, body = [], submit;
      if (mode === 'init') {
        // KHỞI TẠO tài khoản chủ (§A.2): bắt buộc trước mọi trang. Phiên admin (30 phút) hoặc token của bản cài
        var u = input({ id: 'gcUser', name: 'username', autocomplete: 'username', maxlength: '32', placeholder: 'ryan' });
        var dn = input({ id: 'gcName', name: 'displayName', maxlength: '64', autocomplete: 'name' });
        var em = input({ id: 'gcEmail', name: 'email', type: 'email', maxlength: '254', autocomplete: 'email', placeholder: _t('tuỳ chọn') });
        var q1 = input({ id: 'gcPw', type: 'password', autocomplete: 'new-password', minlength: String(minLen) }), q2 = input({ id: 'gcPw2', type: 'password', autocomplete: 'new-password' });
        title = _t('Khởi tạo tài khoản chủ');
        body.push(setupSteps(1), h('div', { class: 'note', text: _t('Lần đầu: đặt tài khoản chủ của riêng bạn — admin / admin không dùng được nữa sau bước này. Sau đó Studio dẫn bạn qua tên miền và chẩn đoán MCP.') }),
          st.who === 'A' && st.expiresAt ? h('div', { class: 'chip warn', id: 'gcAdminLeft', style: 'justify-self:start', text: _t('Phiên admin hết hạn lúc {at}', { at: fmtClock(st.expiresAt) }) }) : null,
          field(_t('Tên đăng nhập (3–32 ký tự: a-z 0-9 . _ -, không phải admin)'), u),
          field(_t('Tên hiển thị'), dn),
          field(_t('Email (tuỳ chọn)'), em, _t('Chỉ dùng làm email liên hệ Let\'s Encrypt khi lên mạng bằng đường Caddy. Đổi được ở Tài khoản chủ.')),
          field(_t('Mật khẩu mới (ít nhất {n} ký tự — gợi ý: một cụm từ dễ nhớ)', { n: minLen }), q1), field(_t('Nhập lại mật khẩu'), q2));
        btn.textContent = _t('Khởi tạo');
        submit = function () {
          var login = u.value.trim().toLowerCase();
          if (!/^[a-z0-9._-]{3,32}$/.test(login) || login === 'admin') return fail(_t('Tên đăng nhập: 3–32 ký tự chữ thường, số, dấu chấm, gạch dưới, gạch ngang — không phải admin'));
          if (Array.from(q1.value).length < minLen) return fail(_t('Mật khẩu cần ít nhất {n} ký tự', { n: minLen }));
          if (q1.value !== q2.value) return fail(_t('Hai lần nhập mật khẩu không khớp'));
          Auth.post('api/auth/init', { username: login, displayName: dn.value.trim(), email: em.value.trim(), password: q1.value, password2: q2.value }, st.who === 'T' ? tok : '').then(function (x) {
            if (x.s !== 200) return fail(x.j.error || _t('Lỗi {status}', { status: x.s }));
            try { localStorage.removeItem('gc-token'); } catch (e) { /* bỏ qua */ }   // đã có phiên cookie của owner
            location.replace('/');
          }).catch(function (e) { fail(e.message); });
        };
        if (st.who === 'A') body.push(h('div', { class: 'row', style: 'justify-content:flex-end' }, h('a', { href: '#', class: 'note', id: 'gcAdminOut', onclick: function (ev) { ev.preventDefault(); Auth.post('api/auth/logout', {}).then(function () { location.href = '/login'; }); } }, _t('Đăng xuất admin'))));
      } else if (mode === 'login') {
        var un = input({ id: 'gcUser', name: 'username', autocomplete: 'username', maxlength: '32' });
        var pw = input({ id: 'gcPw', type: 'password', autocomplete: 'current-password' });
        title = _t('Đăng nhập gen-chibi');
        var akey = Auth.adminKey();
        if (st.stage === 'admin') body.push(akey
          ? h('div', { class: 'banner acc', id: 'gcFirstRun', 'data-key': 'yes', role: 'note' }, h('span', { text: _t('Lần đầu: đăng nhập bằng admin / admin (link từ máy chủ, 30 phút). Studio sẽ bắt bạn đặt tài khoản chủ của riêng mình.') }))
          : h('div', { class: 'banner warn', id: 'gcFirstRun', 'data-key': 'no', role: 'note' }, h('span', { text: _t('Lần đầu: admin / admin chỉ dùng được qua link do máy chủ in ra — mở link ở dòng cuối của trình cài, hoặc chạy genchibi open trên máy chủ (link mới, 30 phút). Hoặc đặt tài khoản chủ ngay trên máy chủ: genchibi password.') })));
        else if (!st.password) body.push(h('div', { class: 'banner warn', id: 'gcNoPw', role: 'note' }, h('span', { text: _t('Máy chưa có mật khẩu chủ: trên máy chủ chạy genchibi password (tên đăng nhập owner), hoặc dùng token của bản cài.') })));
        body.push(st.stage === 'admin' ? null : h('div', { class: 'note', id: 'gcRemember', text: _t('Trình duyệt này nhớ đăng nhập 30 ngày.') }), field(_t('Tên đăng nhập'), un), field(_t('Mật khẩu'), pw));   // phiên admin: 30 phút, không nhớ thiết bị (CNS-272)
        // trần theo tài khoản đang chặn người lạ (trình duyệt chưa từng đăng nhập): nói thẳng + lối token (token chủ không bị trần).
        // /api/auth/state công khai không còn báo locked (CNS-210) → dải hiện khi lần thử trả 429 locked (máy chủ xét trần trước khi kiểm mật khẩu)
        var lockBox = h('div', { id: 'gcLockedBox' });
        var lockShow = function (sec) { clear(lockBox); if (sec > 0) lockBox.appendChild(h('div', { class: 'banner warn', id: 'gcLocked', role: 'status' }, h('span', { text: _t('Đăng nhập đang bị chặn tạm vì nhiều lần sai — trên máy chủ chạy genchibi password (đặt lại mật khẩu), hoặc dùng token, hoặc chờ {n} phút.', { n: Math.ceil(sec / 60) }) }))); };
        lockShow(st.locked || 0);
        body.push(lockBox);
        btn.textContent = _t('Đăng nhập');
        submit = function () {
          var user = un.value.trim().toLowerCase();
          if (!user) return fail(_t('Cần tên đăng nhập'));
          Auth.post('api/auth/login', user === 'admin' ? { username: user, password: pw.value, key: Auth.adminKey() } : { username: user, password: pw.value }).then(function (x) {
            if (x.s === 429 && x.j && x.j.locked) lockShow(+x.j.retryAfter || 60);
            if (x.s !== 200) { pw.select(); err.setAttribute('data-reason', x.j.reason || ''); return fail(x.j.error || _t('Lỗi {status}', { status: x.s })); }   // 403 admin: lý do + cách vào (server)
            try { localStorage.removeItem('gc-token'); } catch (e) { /* bỏ qua */ }
            if (x.j.admin) { location.replace('/'); return; }   // phiên admin: Studio mở màn khởi tạo (cổng theo stage)
            Auth.done();
          }).catch(function (e) { fail(e.message); });
        };
        body.push(st.ownerDefault ? h('div', { class: 'note', id: 'gcOwnerDefault', text: _t('Nâng cấp từ v0.22 trở về trước: tên đăng nhập là owner.') }) : null,   // chỉ máy nâng cấp chưa đặt tên (CNS-272)
          h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap;gap:6px' }, h('span', { class: 'note', text: _t('Quên mật khẩu? Chạy genchibi password trên máy chủ.') }), link(_t('Dùng token'), 'token')));
      } else {
        var ti = input({ id: 'gcTok', type: 'password', placeholder: 'GC_API_TOKEN', autocomplete: 'current-password' });
        title = _t('Đăng nhập bằng token');
        body.push(h('div', { class: 'note', text: wrong ? _t('Token không đúng. Nhập lại token trong ~/gen-chibi/.env.') : _t('Bản cài này có khoá. Nhập GC_API_TOKEN trong ~/gen-chibi/.env.') }),
          h('div', { class: 'note', text: _t('Bản cài không có GC_API_TOKEN trong .env: token nằm ở data/owner-token trong thư mục cài.') }), ti);
        btn.textContent = _t('Đăng nhập');
        submit = function () {
          var t = ti.value.trim(); if (!t) return fail(_t('Cần token'));
          fetch('api/info', { headers: { Authorization: 'Bearer ' + t, 'X-GC-Lang': I18N.lang(), 'X-GC-Studio': '1' } }).then(function (r) {
            if (r.status === 401) return Auth.render('token', true);
            try { localStorage.setItem('gc-token', t); } catch (e) { /* bỏ qua */ }
            Auth.done();
          }).catch(function (e) { fail(e.message); });
        };
        body.push(h('div', { class: 'row' }, link(_t('Đăng nhập bằng tên + mật khẩu'), 'login')));
      }
      // đã ở trong Studio (mở từ Tài khoản chủ) thì có nút Huỷ; màn chặn do 401 / cổng khởi tạo thì không
      var cancel = Store.mode === 'server' && mode !== 'init' && Store.info ? h('button', { class: 'btn', type: 'button', onclick: function () { var o = document.getElementById('gcLogin'); if (o) o.parentNode.removeChild(o); } }, _t('Huỷ')) : null;
      var form = h('form', { class: 'panel', style: 'width:min(460px,calc(100vw - 32px))', 'data-auth': mode, novalidate: true, onsubmit: function (ev) { ev.preventDefault(); err.hidden = true; err.removeAttribute('data-reason'); busy(true); submit(); } },
        h('h3', null, title), h('div', { class: 'pad', style: 'display:grid;gap:10px' }, body, err, h('div', { class: 'row', style: 'justify-content:flex-end;gap:8px' }, cancel, btn)));
      document.body.appendChild(h('div', { id: 'gcLogin', style: 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:var(--bg);overflow:auto' }, form));
      var empty = Array.prototype.filter.call(form.querySelectorAll('input'), function (x) { return !x.value; })[0]; if (empty) empty.focus();
    },
    // chân thanh bên: trạng thái đăng nhập + dải "agent cũ cần nối lại" (CNS-197) + cảnh báo chặn tạm + Đăng xuất
    paint: function () {
      var box = $('authNote'); if (!box) return;
      clear(box);
      var a = Store.mode === 'server' && Store.info && Store.info.auth; if (!a) return;
      if (a.session) { try { localStorage.removeItem('gc-token'); } catch (e) { /* bỏ qua */ } }
      if (!a.password) box.appendChild(h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, h('span', { class: 'chip warn', id: 'authNoPw', title: _t('Trên máy chủ: genchibi password'), text: _t('Chưa có mật khẩu chủ') })));
      else if (a.user && a.user.login) box.appendChild(h('div', { class: 'note', id: 'authUser', text: _t('Đăng nhập: {name}', { name: a.user.displayName || a.user.login }) }));
      var seen = false; try { seen = localStorage.getItem('gc-agents-ok') === '1'; } catch (e) { /* bỏ qua */ }
      if (a.agentsReconnect && !seen) box.appendChild(h('div', { id: 'authAgents' }, _t('Agent cũ nối không token cần nối lại — chạy genchibi agent connect trên máy chủ.') + ' ',
        h('a', { href: '#', onclick: function (ev) { ev.preventDefault(); try { localStorage.setItem('gc-agents-ok', '1'); } catch (e) { /* bỏ qua */ } Auth.paint(); } }, _t('Đã hiểu'))));
      // báo chủ: đăng nhập từng bị chặn tạm (nhiều lần sai từ nhiều nơi) — hiện tới khi chủ bấm "Đã xem"
      var al = (a.alerts || [])[(a.alerts || []).length - 1];
      if (al) box.appendChild(h('div', { id: 'authAlert', class: 'chip warn', style: 'white-space:normal;display:block;border-radius:6px;padding:4px 8px' },
        _t('Cảnh báo: đăng nhập bị chặn tạm lúc {at} — {n} lần sai từ {k} địa chỉ.', { at: fmtTime(al.at), n: al.failures, k: al.ips }) + ' ',
        h('a', { href: '#', onclick: function (ev) { ev.preventDefault(); Store.api('POST', 'api/auth/alerts/ack', {}).then(function () { a.alerts = []; Auth.paint(); }).catch(function (e) { toast(e.message); }); } }, _t('Đã xem'))));
      if (a.session) box.appendChild(h('div', null, h('a', { href: '#', id: 'authLogout', onclick: function (ev) {
        ev.preventDefault(); Auth.post('api/auth/logout', {}).then(function () { location.href = '/login'; }).catch(function (e) { toast(e.message); });
      } }, _t('Đăng xuất'))));
    }
  };

  /* ============================================================ thiết lập lần đầu (v0.23 §A.0 / §A.3) */
  // Cổng Studio theo stage của máy (data/setup.json, server là nơi quyết định — /api/* của Studio cũng 403 gate y hệt): admin / must_init → chỉ màn khởi tạo
  // (Auth 'init'); domain / mcp → chỉ wizard + Lên mạng + Tài khoản chủ (wizard nhúng hai trang đó); done → Studio bình thường.
  var Setup = {
    locked: false, stage: '', pick: '',   // pick: lựa chọn ở bước 2 — sống qua repaint (đổi ngôn ngữ vẽ lại trang)
    OPEN: { setup: 1, online: 1, account: 1 },
    gate: function (kind, stage) {
      Setup.stage = stage || '';
      if (kind === 'init') return Auth.show('init');   // không bao giờ xong: lớp phủ chặn mọi trang tới khi khởi tạo
      Setup.locked = true;
      return Promise.resolve();
    },
    allowed: function (page) { return !Setup.locked || !!Setup.OPEN[page]; }
  };

  var Store = {
    mode: 'browser', info: null,
    // Token chủ (máy kế thừa / CLI, v0.20): giữ trong trình duyệt này, gửi Authorization. v0.21: cách chính là phiên cookie (HttpOnly, server đặt sau khi đăng nhập
    // bằng mật khẩu) — trình duyệt tự gửi, JS không đọc được. Có phiên cookie thì xoá gc-token (Auth.paint).
    token: function () { try { return localStorage.getItem('gc-token') || ''; } catch (e) { return ''; } },
    headers: function () {
      var hd = { 'Content-Type': 'application/json', 'X-GC-Request': '1', 'X-GC-Lang': I18N.lang() }, t = this.token();   // X-GC-Lang: server trả lỗi theo ngôn ngữ người dùng
      // X-GC-Studio: Studio đăng nhập bằng token vẫn đi qua CỔNG theo stage như phiên cookie (§A.0) — agent / CLI (không gắn) thì không bị chặn
      if (t) { hd.Authorization = 'Bearer ' + t; hd['X-GC-Studio'] = '1'; }
      return hd;
    },
    api: function (method, url, body) {
      var self = this;
      return fetch(url, { method: method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined })
        .then(function (r) {
          if (r.status === 401) { self.login(); throw new Error(_t('Cần đăng nhập')); }
          // lỗi cổng kiểm (422) mang theo danh sách lỗi chi tiết để trang hiện đủ, không chỉ câu tóm tắt; 409 mang theo conflicts[] (các chỗ còn phụ thuộc, vd. gỡ gói âm còn được gọi)
          return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw Object.assign(new Error(j.error || (_t('Lỗi {status}', { status: r.status }))), { status: r.status, errors: j.errors || null, conflicts: Array.isArray(j.conflicts) ? j.conflicts : null, retryAt: j.retryAt || null, cap: j.cap === true }); return j; });   // cap: 429 do chạm trần câu / ngày của máy (Cài đặt AI), khác hết lượt của Google
        });
    },
    // LƯỢT AI DÀI (CNS-175, v0.21): Cloudflare cắt request ~100 s không có byte → gửi { async: true }, server trả 202 + id lượt, Studio hỏi
    // GET api/ai/turns/<id> mỗi giây tới khi xong. Kết quả / lỗi y như Store.api (server cũ trả 200 thẳng thì dùng luôn). Mạng chập chờn khi hỏi: thử lại tới 30 lần
    turn: function (url, body) {
      var self = this;
      return this.api('POST', url, Object.assign({}, body, { async: true })).then(function (r) {
        if (!r || !r.turn || r.status !== 'running') return r;
        var miss = 0, wait = Math.max(500, Math.min(5000, +r.pollMs || 1000));
        return new Promise(function (resolve, reject) {
          (function poll() {
            setTimeout(function () {
              self.api('GET', 'api/ai/turns/' + encodeURIComponent(r.turn)).then(function (t) {
                miss = 0;
                if (t.status === 'running') return poll();
                if (t.status === 'done') return resolve(t.result);
                reject(Object.assign(new Error(t.error || _t('Lỗi {status}', { status: t.code })), { status: t.code }));
              }, function (e) { if (e && e.status && e.status !== 502 && e.status !== 503 && e.status !== 504 && e.status !== 524) return reject(e); if (++miss > 30) return reject(e); poll(); });
            }, wait);
          })();
        });
      });
    },
    login: function (wrong) { return Auth.show(wrong ? 'token-wrong' : ''); },   // 401 → màn đăng nhập (tên + mật khẩu / admin lần đầu / token) — xem Auth
    init: function () {
      var self = this;
      return fetch('api/info', { headers: this.headers() }).then(function (r) {
        if (r.status === 401) return self.login(!!self.token());
        // cổng theo stage (§A.0): phiên admin → màn khởi tạo; chưa xong thiết lập lần đầu → wizard (không nạp dữ liệu Studio — server cũng chặn)
        if (r.status === 403) return r.json().catch(function () { return {}; }).then(function (j) { if (!j.gate) throw 0; self.mode = 'server'; return Setup.gate(j.gate, j.stage); });
        if (!r.ok) throw 0;
        return r.json().then(function (info) {
          self.mode = 'server'; self.info = info;
          var stg = info.setup && info.setup.stage;
          if (stg && stg !== 'done') return Setup.gate(/^(admin|must_init)$/.test(stg) ? 'init' : 'wizard', stg);
          return self.loadData();
        });
      }).catch(function () {
          self.mode = 'browser';
          try { JSON.parse(localStorage.getItem('gc-assets') || '[]').forEach(regStored); } catch (e) { /* bỏ qua */ }
        });
    },
    // dữ liệu Studio của máy (linh kiện, item, cảnh, asset, gói âm, gói động tác) — chỉ khi thiết lập lần đầu đã xong
    loadData: function () {
      var self = this;
      return self.api('GET', 'api/parts').catch(function () { return []; })
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
            (snd || []).forEach(function (d) { var r4 = GC.sounds && GC.sounds.registerPack(d, { tolerant: true }); if (r4 && r4.errors.length) console.warn('bỏ gói âm', d.id, r4.errors); });
            return self.api('GET', 'api/motion-packs').catch(function () { return []; });
          })
          .then(function (packs) {
            // gói động tác (v0.16): sau nhân vật — màn diễn trong gói trỏ tới nhân vật của bộ
            (packs || []).forEach(function (d) { var r3 = GC.choreo && GC.choreo.registerPack(MY_PACK, d, { tolerant: true }); if (r3 && r3.errors.length) console.warn('bỏ gói động tác', d.id, r3.errors); });
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
    ['fab', N_('Xưởng'), N_('tạo asset từ khung'), [['create', N_('Tạo asset mới')], ['characters', N_('Bàn chỉnh nhân vật')], ['items', N_('Bàn chỉnh vật phẩm')], ['scenes', N_('Bàn chỉnh bối cảnh')]]],
    ['fab', N_('Khung chuẩn'), N_('quy cách · kiểm (Gen Labs giữ)'), [['khung', N_('Bộ khung chuẩn')], ['library', N_('Kho linh kiện & phông')], ['poses', N_('Khung tư thế & hoạt động')], ['states', N_('Khung biểu cảm & chuyển động')], ['gates', N_('Cổng kiểm & hiệu năng')]], 'khung'],
    ['lib', N_('Thư viện'), N_('theo dự án chủ đề · lấy về dùng'), [['projects', N_('Dự án chủ đề')], ['lib-characters', N_('Nhân vật')], ['lib-items', N_('Vật phẩm')], ['lib-scenes', N_('Bối cảnh')], ['lib-motions', N_('Động tác')], ['lib-sounds', N_('Âm thanh')], ['lib-voices', N_('Giọng')]]],
    ['make', N_('Tạo tác'), N_('làm phim / truyện với AI'), [['works', N_('Tác phẩm')]]],
    ['sys', N_('Hệ thống'), '', [['ai', N_('Cài đặt AI')], ['connect', N_('Kết nối agent')], ['online', N_('Lên mạng')], ['account', N_('Tài khoản chủ')], ['update', N_('Cập nhật')], ['lang', N_('Ngôn ngữ')]]]
  ];
  var PAGE_ALIAS = { character: 'characters', export: 'lib-characters', workshop: 'create' };   // workshop = trang chat cũ → nay là dock Trợ lý AI (mở dock rồi về trang chủ của khu)
  // BA ỨNG DỤNG ĐỘC LẬP (Ryan 2026-10-18): mỗi lớp một địa chỉ, một menu, một màu — không lẫn nhau.
  //   /xuong · /thu-vien · /tao-tac (bản xem thử không có server: ?app=…). "/" = màn chọn lớp.
  //   Trang Hệ thống (Cài đặt AI, Kết nối agent, Cập nhật) có ở cả ba. Bấm sang trang của lớp khác → mở ứng dụng của lớp đó.
  var PAGES = {};
  var APPS = [
    { id: 'xuong', zone: 'fab', name: N_('Xưởng'), desc: N_('Bộ khung chuẩn (không chủ đề) → tạo asset: chọn khung, thêm tham số, soát mọi góc, qua cổng kiểm, lưu vào dự án.'), home: 'create' },
    { id: 'thu-vien', zone: 'lib', name: N_('Thư viện'), desc: N_('Asset đã qua cổng kiểm, xếp theo dự án chủ đề — xem, tải ảnh / sprite, chép mã, tải gói dự án.'), home: 'projects' },
    { id: 'tao-tac', zone: 'make', name: N_('Tạo tác'), desc: N_('Làm phim / truyện: danh sách tác phẩm → phòng làm phim riêng của từng tác phẩm (kịch bản, phân cảnh, xem & duyệt, giọng & âm thanh, xuất bản); AI đạo diễn ở cột phải.'), home: 'works' }
  ];
  function appById(id) { return APPS.filter(function (a) { return a.id === id; })[0] || null; }
  function appOfZone(z) { return APPS.filter(function (a) { return a.zone === z; })[0] || null; }
  var APP = (function () {
    var q = null; try { q = new URLSearchParams(location.search).get('app'); } catch (e) { /* bỏ qua */ }
    return appById(q) || appById(location.pathname.split('/').filter(Boolean).pop() || '');
  })();
  function appURL(id) { return Store.mode === 'server' ? '/' + (id || '') : (id ? '?app=' + id : '?'); }
  function routeKey(app) { return 'gc-route-' + (app ? app.id : 'home'); }
  // Đang rời trang (tải lại / sang địa chỉ khác): trình duyệt huỷ mọi fetch còn dở SAU pagehide — catch của chúng (vd. loadWork: "lỗi → về danh sách")
  // không được go() nữa, vì go() ghi tuyến vào localStorage và đè tuyến trang kế tiếp sắp đọc (CI 2 vCPU: mở phòng tác phẩm lại ra danh sách).
  var leaving = false;
  window.addEventListener('pagehide', function () { leaving = true; });
  window.addEventListener('pageshow', function () { leaving = false; });   // quay lại từ bfcache: trang sống tiếp
  function zoneOf(page) {
    if (page === 'home') return 'home';
    if (page === 'setup') return 'sys';   // thiết lập lần đầu: trang hệ thống (không nằm trong menu)
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
    if (Setup.locked) {   // wizard lần đầu: chỉ ba trang mở (server cũng chặn phần còn lại)
      nav.appendChild(h('div', { class: 'nav-group zone-sys' }, h('b', { text: _t('Thiết lập lần đầu') }), h('span', { text: _t('xong thì mở cả Studio') })));
      [['setup', _t('Thiết lập lần đầu')], ['online', _t('Lên mạng')], ['account', _t('Tài khoản chủ')]].forEach(function (it) {
        nav.appendChild(h('button', { class: 'nav-item zone-sys', id: 'navSu-' + it[0], 'aria-current': route.page === it[0] ? 'page' : null, onclick: function () { go({ page: it[0] }); } }, it[1]));
      });
      return;
    }
    // số đếm Thư viện không tính đồ của khung (khung thuộc Xưởng)
    var lib = function (arr) { return arr.filter(function (x) { return groupOf(x) !== 'frame'; }).length; };
    var COUNT = { 'lib-characters': function () { return lib(GC.assets()); }, 'lib-items': function () { return lib(GC.items()); }, 'lib-scenes': function () { return lib(GC.scenes()); }, projects: function () { return Projects.all().length; },
      'lib-motions': function () { var C = GC.choreo; return C ? Object.keys(C.ACTIONS).filter(function (k) { return C.ACTIONS[k].pack !== C.FRAME_PACK; }).length : 0; },   // đòn của khung không tính (CNS-065)
      'lib-sounds': function () { return GC.sounds ? GC.sounds.names().length : 0; }, 'lib-voices': function () { return GC.voices ? GC.voices.roleList().length : 0; } };
    // chuyển ứng dụng: 3 lớp, lớp đang mở nổi bật; các lớp khác là liên kết sang ứng dụng riêng
    var sw = h('div', { class: 'appswitch' });
    APPS.forEach(function (a) {
      sw.appendChild(h('a', { class: 'zone-' + a.zone, href: appURL(a.id), 'aria-current': APP && APP.id === a.id ? 'page' : null, title: _t(a.desc) }, _t(a.name)));
    });
    nav.appendChild(sw);
    NAV.forEach(function (g) {
      if (!APP || (g[0] !== APP.zone && g[0] !== 'sys')) return;   // mỗi ứng dụng chỉ có menu của lớp mình (+ Hệ thống)
      nav.appendChild(h('div', { class: 'nav-group zone-' + g[0] }, h('b', { text: _t(g[1]) }), g[2] ? h('span', { text: _t(g[2]) }) : null));
      g[3].forEach(function (it) {
        var cur = route.page === it[0] || PAGE_ALIAS[route.page] === it[0];
        var b = h('button', { class: 'nav-item zone-' + g[0], 'aria-current': cur ? 'page' : null, onclick: function () { go({ page: it[0] }); } }, _t(it[1]));
        if (COUNT[it[0]]) b.appendChild(h('span', { class: 'n', text: String(COUNT[it[0]]()) }));
        if (it[0] === 'update' && updateBadge) b.appendChild(h('span', { class: 'dot', title: _t('Có bản mới') }));
        nav.appendChild(b);
      });
    });
  }
  // dải nhắc ở Trang chủ (v0.23 §A.3): lên mạng chưa xong ("Tạm dùng trên máy này") · chưa agent nào nối ("Tôi nối agent sau") · "Kiểm tra thiết lập" một lần (máy nâng cấp)
  function reminders() {
    var su = Store.mode === 'server' && Store.info && Store.info.setup; if (!su) return;
    var rm = su.reminders || {}, v = $('view');
    if (rm.online) v.appendChild(h('div', { class: 'banner warn', id: 'remOnline', style: 'margin-bottom:12px' }, h('span', { text: _t('Lên mạng chưa xong — Studio đang dùng trên máy này. Làm tiếp ở Hệ thống › Lên mạng khi tên miền sẵn sàng.') }),
      h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { go({ page: 'online' }); } }, _t('Mở Lên mạng ›'))));
    if (rm.agent) v.appendChild(h('div', { class: 'banner warn', id: 'remAgent', style: 'margin-bottom:12px' }, h('span', { text: _t('Chưa có agent nào nối MCP — làm theo thẻ hướng dẫn ở Hệ thống › Kết nối agent (dải này tự tắt khi agent đầu tiên gọi MCP).') }),
      h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { go({ page: 'connect' }); } }, _t('Mở Kết nối agent ›'))));
    if (su.review) v.appendChild(h('div', { class: 'banner acc', id: 'remReview', style: 'margin-bottom:12px' }, h('span', { text: _t('Bản mới có bước "Kiểm tra thiết lập": tự kiểm MCP trên máy + cách nối agent. Một lần, đóng được.') }),
      h('button', { class: 'btn sm primary', style: 'margin-left:auto', id: 'remReviewOpen', onclick: function () { go({ page: 'setup' }); } }, _t('Kiểm tra')),
      h('button', { class: 'btn sm', id: 'remReviewClose', onclick: function () { Store.api('POST', 'api/setup/review', {}).then(function () { su.review = false; go(route); }).catch(function (e) { toast(e.message); }); } }, _t('Đóng'))));
  }
  function go(r) {
    if (leaving) return;   // trang đang đóng: không vẽ, không ghi tuyến (xem leaving ở trên)
    if (!Setup.allowed(r.page)) r = { page: 'setup' };   // cổng theo stage (§A.0): chưa xong thiết lập lần đầu → chỉ wizard / Lên mạng / Tài khoản chủ
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
    if (r.page !== 'setup') { try { localStorage.setItem(routeKey(APP), JSON.stringify(r)); } catch (e) { /* bỏ qua */ } }
    renderNav();
    document.body.setAttribute('data-zone', APP ? APP.zone : 'home');
    clear($('actions'));
    clear($('view'));
    $('view').scrollTop = 0;
    if (updateBadge && r.page !== 'update') {
      $('view').appendChild(h('div', { class: 'banner acc', style: 'margin-bottom:12px' },
        h('span', { text: _t('Có bản mới {updateBadge}. Dữ liệu được sao lưu trước khi cập nhật; bản mới lỗi sẽ tự chạy lại bản cũ.', { updateBadge: updateBadge }) }),
        h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { go({ page: 'update' }); } }, _t('Xem và cập nhật'))));
    }
    if (!Setup.locked && (r.page === 'home' || (APP && r.page === APP.home))) reminders();
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
  var PAGE_EXTRA = { setup: N_('Thiết lập lần đầu') };   // trang ngoài menu (NAV) — dock không bao giờ hiện id thô (CNS-272, L-73)
  function pageLabel(page) {
    var p = PAGE_ALIAS[page] || page, L = page === 'home' ? _t('Chọn khu') : PAGE_EXTRA[p] ? _t(PAGE_EXTRA[p]) : '';
    NAV.forEach(function (g) { g[3].forEach(function (it) { if (it[0] === p) L = _t(it[1]); }); });
    return L || p;
  }
  // chỉ đọc, cho test trình duyệt (bộ quét i18n): mọi trang có nhãn người đọc, không trang nào rơi về id thô
  window.GCStudioPageLabels = function () { return Object.keys(PAGES).map(function (k) { return [k, pageLabel(k)]; }); };
  function dockRoute(r) { if (window.GCDock) window.GCDock.route({ zone: dockZone(r.page), page: r.page, pageLabel: pageLabel(r.page) }); }
  // trang báo đối tượng đang xem: kind asset | project | work; id thật (key asset, id dự án / tác phẩm)
  function dockObj(kind, id, label) { if (window.GCDock) window.GCDock.ctx({ object: id ? { kind: kind, id: id, label: label || id } : null }); }
  // thuộc tính data-anchor (địa chỉ theo ID thật, sống sót khi sắp xếp / lọc / cuộn) + nhãn người đọc — trộn vào attrs của h()
  function anc(attrs, anchor, label) { attrs = attrs || {}; attrs['data-anchor'] = anchor; if (label) attrs['data-anchor-label'] = String(label).slice(0, 80); return attrs; }
  // lời gợi ý nhanh theo khu (chip dưới khung chat của dock)
  function dockQuick(info, obj) {
    var z = info && info.zone;
    if (z === 'tao-tac') return obj && obj.kind === 'work' ? [[_t('Viết kịch bản'), _t('Từ ý tưởng trong kịch bản tổng, viết logline + kịch bản hoàn chỉnh rồi lưu (save_work).')],
      [_t('Chia phân cảnh'), _t('Chia kịch bản thành các phân cảnh (save_shot): mỗi cảnh một bối cảnh trong Thư viện + dàn diễn viên. Thiếu thì tạo ở Xưởng.')],
      [_t('Viết lời thoại'), _t('Viết lời thoại + diễn xuất cho mọi phân cảnh chưa có (save_shot với event).')],
      [_t('Sửa theo ghi chú duyệt'), _t('Đọc ghi chú duyệt (get_work › review) và sửa các cảnh đang "Cần sửa" theo đúng ghi chú; đề xuất bằng propose_edit.')],
      [_t('Kiểm thiếu'), _t('Kiểm tác phẩm còn thiếu gì (nhân vật, bối cảnh, lời thoại) và tự bổ sung.')]] : [[_t('Gợi ý tác phẩm mới'), _t('Gợi ý 3 ý tưởng phim ngắn dùng nhân vật và bối cảnh đang có trong Thư viện.')]];
    if (z === 'khung') return [[_t('Giải thích khung xương'), _t('Giải thích ngắn bộ khung nhân vật: khớp, 8 hướng, biểu cảm, hoạt động — dùng dữ liệu thật của khung.')], [_t('Tạo gói động tác'), _t('Giúp tôi tạo một gói động tác mới trên khung xương: hỏi tôi muốn đòn gì rồi dựng bằng get_motion_spec → validate → save_motion_pack.')]];
    if (z === 'thu-vien') return [[_t('Tìm asset'), _t('Liệt kê asset trong Thư viện hợp với yêu cầu của tôi (lọc theo dự án).')], [_t('Ghép trang bị'), _t('Gợi ý trang bị trong Thư viện hợp với nhân vật đang xem và mặc thử.')]];
    if (z === 'xuong') return [[_t('Tạo nhân vật từ khung'), _t('Tạo một nhân vật mới từ khung ma-nơ-canh: hỏi tôi tên, vai, màu rồi lưu vào dự án đang chọn.')], [_t('Soát nhân vật này'), _t('Soát nhân vật đang xem: cổng kiểm, nhận diện, còn thiếu gì.')]];
    return [];
  }
  // dữ liệu đổi sau lượt AI (asset / phân cảnh mới…): nạp lại kho + báo các trang đang mở vẽ lại phần của mình
  var dataSubs = [];
  function onData(fn) { dataSubs.push(fn); onLeave(function () { dataSubs = dataSubs.filter(function (f) { return f !== fn; }); }); }
  function reloadData() {
    var jobs = [['api/parts', function (d) { GC.registerDataPart(MY_PACK, d); }], ['api/items', function (d) { GC.registerItem(MY_PACK, d); }], ['api/scenes', function (d) { GC.registerScene(MY_PACK, d); }],
      ['api/assets', regStored], ['api/sound-packs', function (d) { if (GC.sounds) GC.sounds.registerPack(d, { tolerant: true }); }], ['api/motion-packs', function (d) { if (GC.choreo) GC.choreo.registerPack(MY_PACK, d, { tolerant: true }); }]];
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
  var ZONE_LABEL = { lib: N_('Thư viện'), make: N_('Tạo tác'), fab: N_('Xưởng'), sys: N_('Hệ thống'), home: 'gen-chibi' };
  // Màn chọn lớp ("/"): ba ứng dụng độc lập theo dòng chảy Xưởng → Thư viện → Tạo tác
  PAGES.home = function () {
    crumbs([{ t: _t('Chọn khu làm việc') }]);
    var lib = function (arr) { return arr.filter(function (x) { return groupOf(x) !== 'frame'; }).length; };
    var stat = {
      xuong: _t('{n} khung nhân vật · {n2} khối vật phẩm · {n3} sân khấu chuẩn', { n: GC.assets().filter(function (a) { return groupOf(a) === 'frame'; }).length, n2: GC.items().filter(function (a) { return groupOf(a) === 'frame'; }).length, n3: GC.scenes().filter(function (a) { return groupOf(a) === 'frame'; }).length }),
      'thu-vien': _t('{n} dự án · {lib} nhân vật · {lib2} vật phẩm · {lib3} bối cảnh', { n: Projects.all().length, lib: lib(GC.assets()), lib2: lib(GC.items()), lib3: lib(GC.scenes()) }),
      'tao-tac': _t('danh sách tác phẩm → phòng làm phim (5 tab) · AI đạo diễn ở cột phải')
    };
    var row = h('div', { class: 'apps' });
    APPS.forEach(function (a, i) {
      row.appendChild(h('a', { class: 'appcard zone-' + a.zone, href: appURL(a.id) },
        h('span', { class: 'step', text: String(i + 1) }), h('b', { text: _t(a.name) }), h('p', { text: _t(a.desc) }), h('span', { class: 'note', text: stat[a.id] }), h('span', { class: 'go', text: _t('Mở {name} ›', { name: _t(a.name) }) })));
    });
    // Bắt đầu nhanh: 3 bước theo đúng dòng chảy, tự đánh dấu bước đã xong và đưa nút cho bước kế tiếp
    var qs = h('div', { class: 'panel quick' });
    $('view').appendChild(h('div', { class: 'stack' }, qs, h('p', { class: 'note', text: _t('Ba khu là ba ứng dụng riêng, mỗi khu một việc. Dòng chảy: Xưởng tạo asset → Thư viện cất theo dự án → Tạo tác dùng để làm phim.') }), row));
    function paintQuick(works) {
      var mine = lib(GC.assets()) + lib(GC.items()) + lib(GC.scenes()), last = lastProject();
      var steps = [
        { t: _t('Tạo dự án chủ đề'), d: _t('Ví dụ "Văn phòng vui", "Cổ tích Việt" — mọi asset và tác phẩm xếp theo dự án.'), done: Projects.all().length > 0, go: { page: 'projects' }, app: _t('Thư viện') },
        { t: _t('Tạo nhân vật, vật phẩm, bối cảnh từ khung'), d: _t('Chọn khung → đổi tham số, màu → soát 8 hướng → lưu vào dự án.'), done: mine > 0, go: { page: 'create', project: last }, app: _t('Xưởng') },
        { t: _t('Làm phim với AI đạo diễn'), d: _t('Tạo tác phẩm, chat với AI: kịch bản → phân cảnh → lời thoại → diễn bản final.'), done: works > 0, go: { page: 'works', project: last }, app: _t('Tạo tác') }
      ];
      var next = steps.filter(function (s) { return !s.done; })[0];
      clear(qs);
      qs.appendChild(h('h3', null, _t('Bắt đầu nhanh'), h('span', { class: 'r note', text: _t('{n}/3 bước', { n: steps.filter(function (s) { return s.done; }).length }) })));
      var ol = h('ol', { class: 'qsteps' });
      steps.forEach(function (s, i) {
        ol.appendChild(h('li', { class: s.done ? 'done' : s === next ? 'next' : '' }, h('span', { class: 'n', text: s.done ? '✓' : String(i + 1) }),
          h('div', null, h('b', { text: s.t }), h('span', { class: 'note', text: s.d })),
          h('button', { class: 'btn sm' + (s === next ? ' primary' : ''), onclick: function () { go(s.go); } }, s.done ? _t('Mở {app} ›', { app: s.app }) : _t('Làm ngay ở {app} ›', { app: s.app }))));
      });
      var demos = Store.mode === 'server' ? samplesLeft() : [];
      qs.appendChild(h('div', { class: 'pad stack' }, ol, demos.map(function (S) {
        return h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { importDemo(S); } }, _t(S.button)), h('span', { class: 'note', text: _t(S.note) }));
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
    c.appendChild(h('span', { class: 'zone-tag', text: _t(ZONE_LABEL[zoneOf(route.page)]) }));
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
    crumbs([{ t: _t('Bàn chỉnh nhân vật') }]);
    actions(h('button', { class: 'btn', onclick: function () { go({ page: 'lib-characters' }); } }, _t('Xem trong Thư viện ›')), h('button', { class: 'btn primary', onclick: newCharacter }, _t('+ Nhân vật mới')));
    var q = '', sel = GC.assets()[0];
    var search = h('input', { type: 'search', placeholder: _t('Lọc: tên, phe, thư viện, trạng thái…'), style: 'width:320px', oninput: function () { q = search.value.trim().toLowerCase(); paint(); } });
    var table = h('table', { class: 'grid' });
    var insp = h('div', { class: 'stack' });
    $('view').appendChild(h('div', { class: 'split' },
      h('div', { class: 'stack' }, h('div', { class: 'row' }, search, h('span', { class: 'note', id: 'cnt' })), h('div', { class: 'panel scroll' }, table)),
      h('div', { class: 'sticky' }, insp)));
    var STATUS = { draft: [_t('Nháp'), 'chip'], published: [_t('Phát hành'), 'chip ok'] };   // GC.statusOf: approved → published, review → draft
    function paint() {
      clear(table);
      var cols = ['', '', _t('Tên'), _t('Hán'), _t('Phe'), _t('Vai'), _t('Thư viện'), _t('Trạng thái'), _t('Bản'), _t('Cổng kiểm')];
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
      $('cnt').textContent = _t('{n} / {n2} nhân vật', { n: list.length, n2: GC.assets().length });
      list.forEach(function (a) {
        var g = GC.gate(a), okN = g.filter(function (x) { return x.ok; }).length;
        var avCell = h('td', { style: 'width:44px' });
        var av = h('div', { class: 'av', style: '--own:' + ownOf(a) });
        avCell.appendChild(av);
        R.image(av, a, 'normal', { crop: true, noShadow: true });
        var st = STATUS[GC.statusOf(a.status)];
        var tr = h('tr', anc({ class: 'click', 'aria-selected': sel && sel.key === a.key ? 'true' : null,
          onclick: function () { sel = a; paint(); },
          ondblclick: function () { go({ page: 'character', key: a.key, tab: 'look' }); } }, 'asset:' + a.key, _lo(a, a.name)),
          h('td', { class: 'id', text: a.code || a.id }), avCell,
          h('td', null, h('b', { text: _lo(a, a.name) })), h('td', { class: 'k', text: a.han || '' }), h('td', { text: _lo(a, a.faction || '') }),
          h('td', { text: _lo(a, a.role || '') }), h('td', null, h('span', { class: 'tag', text: a.pack })),
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
      if (!sel) { dockObj('asset', null); insp.appendChild(h('div', { class: 'panel empty', text: _t('Chọn một nhân vật.') })); return; }
      dockObj('asset', sel.key, _lo(sel, sel.name));
      var stg = h('div', { class: 'stage preview' });
      var bar = h('div', { class: 'statebar' });
      var pnl = h('div', { class: 'panel' }, h('h3', null, _lo(sel, sel.name), h('span', { class: 'r mono', text: sel.key })), stg,
        h('div', { class: 'pad stack' }, bar,
          h('div', { class: 'note', text: (sel.identity && sel.identity.p1 ? _t('Nhận diện: {p1}. ', { p1: _lo(sel, sel.identity.p1) }) : '') + _lo(sel, sel.persona || '') }),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: function () { go({ page: 'character', key: sel.key, tab: 'look' }); } }, _t('Mở hồ sơ')),
            h('button', { class: 'btn', onclick: function () { duplicate(sel); } }, _t('Nhân bản sang "Của tôi"')))));
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
    c.id = uniqueId(a.id); c.code = nextCode(); c.name = _t('{name} (bản của tôi)', { name: a.name }); c.status = 'draft'; c.version = 0;
    delete c.key; delete c.savedAt;
    Store.save(c, _t('Nhân bản từ {key}', { key: a.key })).then(function (rec) { toast(_t('Đã nhân bản vào thư viện "Của tôi".')); go({ page: 'character', key: rec.key, tab: 'look' }); });
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
    crumbs([{ t: _t('Bàn chỉnh nhân vật'), go: { page: 'characters' } }, { t: _lo(orig, orig.name) }]);
    var saveBtn = h('button', { class: 'btn primary', disabled: true, onclick: save }, _t('Lưu phiên bản'));
    var undoBtn = h('button', { class: 'btn', disabled: true, onclick: function () { go(r); } }, _t('Huỷ thay đổi'));
    var official = orig.pack !== MY_PACK;
    actions(h('span', { class: 'tag', text: orig.pack + ' · v' + (orig.version || 1) }), undoBtn, saveBtn);

    var left = h('div', { class: 'stack' });
    var stg = h('div', { class: 'stage preview' });
    var bar = h('div', { class: 'statebar' });
    var sizes = h('div', { class: 'sizes' });
    var gateBox = h('div');
    dockObj('asset', orig.key, _lo(orig, orig.name));
    $('view').appendChild(h('div', anc({ class: 'detail' }, 'asset:' + orig.key, _lo(orig, orig.name)), left,
      h('div', { class: 'sticky stack' },
        h('div', { class: 'panel' }, h('h3', null, _t('Xem trước'), h('span', { class: 'r note', id: 'pvState' })), stg, h('div', { class: 'pad stack' }, bar, sizes)),
        h('div', { class: 'panel' }, h('h3', null, _t('Cổng kiểm')), gateBox))));

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
        t.appendChild(h('tr', null, h('td', { text: gL(g) }), h('td', { class: g.ok ? 'ok' : 'bad', style: 'font-weight:600', text: g.ok ? _pt('cổng kiểm', 'Đạt') : _t('Không đạt') })));
        if (!g.ok) t.appendChild(h('tr', null, h('td', { colspan: '2', class: 'note', text: gD(g) })));
      });
      gateBox.appendChild(t);
    }
    function save() {
      var bad = GC.gate(w).filter(function (g) { return !g.ok && g.id !== 'identity'; });
      if (bad.length) { toast(_t('Chưa lưu: không qua cổng "{label}".', { label: _l(bad[0].label) })); return; }
      var note = prompt ? null : null;
      var doc = clone(w); doc.version = orig.version || 0;
      var target = doc;
      if (official && Store.mode === 'browser') { /* bản xem thử: lưu đè trong trình duyệt */ }
      Store.save(target, _t('Chỉnh trong Studio')).then(function (rec) {
        R.invalidate(rec);
        toast(_t('Đã lưu {name} · v{version}{x}', { name: rec.name, version: rec.version, x: Store.mode === 'browser' ? _t(' (trong trình duyệt này)') : '' }));
        go({ page: 'character', key: rec.key, tab: r.tab });
      }).catch(function (e) { toast(_t('Không lưu được: {message}', { message: e.message })); });
    }
    onLeave(function () { if (dirty) R.invalidate(orig); });

    var TABS = [['look', _t('Ngoại hình')], ['expr', _t('Biểu cảm')], ['profile', _t('Hồ sơ nhận diện')], ['history', _t('Phiên bản')], ['json', 'JSON']];
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
    function rangeInput(def, val, on, owner) {   // owner: linh kiện mang tham số (nhãn của người dùng giữ nguyên); không có = tham số khung mặt của engine
      var out = h('span', { class: 'mono note', style: 'display:inline-block;min-width:38px;text-align:right', text: String(val) });
      var inp = h('input', { type: 'range', min: def.min, max: def.max, step: def.step, value: val, 'aria-label': owner ? _lo(owner, def.label) : _l(def.label), oninput: function () { out.textContent = inp.value; on(+inp.value); } });
      return h('span', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, h('span', { class: 'note', style: 'min-width:120px', text: owner ? _lo(owner, def.label) : _l(def.label) }), inp, out);
    }
    function setParam(slot, k, v) {
      w.look.params = w.look.params || {};
      w.look.params[slot] = w.look.params[slot] || {};
      w.look.params[slot][k] = v;
      changed(false);
    }
    function tabLook() {
      var t = h('table', { class: 'grid' });
      t.appendChild(h('tr', null, h('th', { text: '' }), h('th', { text: _t('Bộ phận') }), h('th', { text: _t('Linh kiện') }), h('th', { text: _t('Tham số') })));
      var n = 1;
      function row(label, control, params) {
        t.appendChild(h('tr', null, h('td', { class: 'id', text: 'SL-' + String(n++).padStart(2, '0') }), h('td', { class: 'k', text: label }), h('td', null, control), h('td', null, params || h('span', { class: 'muted', text: '—' }))));
      }
      function sel(options, value, on, label) {
        var s = h('select', { 'aria-label': label, onchange: function () { on(s.value); } });
        options.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === value) op.selected = true; s.appendChild(op); });
        return s;
      }
      function paramsOf(slot, defs, owner) {
        if (!defs) return null;
        var vals = GC.paramValues(w, slot, defs);
        return h('div', { class: 'stack', style: 'gap:4px' }, Object.keys(defs).map(function (k) { return rangeInput(defs[k], vals[k], function (v) { setParam(slot, k, v); }, owner); }));
      }
      row(_t('Kiểu mắt'), sel(Object.keys(LIB.eyeStyles).map(function (k) { return [k, _l(LIB.eyeStyles[k].label)]; }), w.look.eyes, function (v) { w.look.eyes = v; changed(false); }, _t('Kiểu mắt')), paramsOf('eyes', GC.FACE_PARAMS.eyes));
      row(_t('Kiểu mày'), sel(Object.keys(LIB.browStyles).map(function (k) { return [k, _l(LIB.browStyles[k].label)]; }), w.look.brows, function (v) { w.look.brows = v; changed(false); }, _t('Kiểu mày')), paramsOf('brows', GC.FACE_PARAMS.brows));
      row(_t('Miệng'), h('span', { class: 'note', text: _t('theo trạng thái') }), paramsOf('mouth', GC.FACE_PARAMS.mouth));
      row(_t('Tỉ lệ chibi'), h('span', { class: 'note', text: _t('khung xương') }), paramsOf('rig', GC.FACE_PARAMS.rig));
      Object.keys(LIB.slots).forEach(function (slot) {
        var cur = GC.partRef(w, slot);
        var p = GC.getPart(slot, cur, w.pack);
        var opts = GC.partsOfSlot(slot).map(function (x) { return [x.id, _lo(x, x.label) + (x.pack !== 'gen.core' ? ' · ' + x.pack : '')]; });
        row(_l(LIB.slots[slot].label), sel(opts, cur, function (v) { w.look.parts[slot] = v; changed(true); }, _l(LIB.slots[slot].label)), p && p.params ? paramsOf(slot, p.params, p) : null);
      });
      var pal = h('table', { class: 'grid' });
      pal.appendChild(h('tr', null, h('th', { text: _t('Màu') }), h('th', { text: '' }), h('th', { text: _t('Mã') }), h('th', { text: _t('Nguồn') })));
      [['skin', _t('Da')], ['skinShade', _t('Bóng da')], ['hair', _t('Tóc, râu, mày')], ['iris', _t('Mống mắt')], ['robe', _t('Áo')], ['inner', _t('Áo lót')], ['trim', _t('Viền áo')],
       ['armor', _t('Giáp')], ['hat', _t('Mũ / khăn')], ['accent', _t('Điểm nhấn')], ['metal', _t('Kim loại')], ['wood', _t('Gỗ')], ['tassel', _t('Tua')], ['boots', _t('Giày')], ['blush', _t('Má hồng')]].forEach(function (k) {
        var own = (w.look.palette || {})[k[0]];
        var cur = own || LIB.defaults[k[0]];
        var code = h('td', { class: 'v', text: cur });
        var src = h('td', { class: 'note', text: own ? _t('nhân vật') : _t('mặc định kho') });
        var inp = h('input', { type: 'color', value: cur, 'aria-label': k[1], oninput: function () {
          w.look.palette = w.look.palette || {}; w.look.palette[k[0]] = inp.value; code.textContent = inp.value; src.textContent = _t('nhân vật'); changed(false);
        } });
        pal.appendChild(h('tr', null, h('td', { class: 'k', text: k[1] }), h('td', null, inp), code, src));
      });
      body.appendChild(h('div', { class: 'stack' }, h('div', { class: 'panel scroll' }, h('h3', null, _t('Linh kiện & tham số')), t), h('div', { class: 'panel scroll' }, h('h3', null, _t('Bảng màu')), pal)));
    }

    /* ---- Biểu cảm: lưới 18 trạng thái + ghi đè có nguồn */
    function tabExpr() {
      var grid = h('div', { class: 'states' });
      var editor = h('div', { class: 'panel' });
      body.appendChild(h('div', { class: 'stack' },
        h('div', { class: 'note', text: _t('Mỗi biểu cảm lấy từ kho chung; trait theo bộ phận và ghi đè riêng của nhân vật này đè lên trên. Ô có nhãn "riêng" là đã ghi đè.') }),
        grid, editor));
      function paintGrid() {
        clear(grid);
        LIB.stateOrder.forEach(function (s) {
          var im = h('div', { class: 'im stage' });
          var cell = h('button', { class: 'state-cell', 'aria-pressed': String(s === pState), onclick: function () { setPState(s); paintGrid(); paintEditor(); } },
            im, h('div', { class: 'lb', text: stateLabel(s) }), (w.expressions || {})[s] ? h('span', { class: 'ov', text: _t('riêng') }) : null);
          grid.appendChild(cell);
          R.image(im, w, s, { noShadow: true });
        });
      }
      function paintEditor() {
        clear(editor);
        var st = GC.resolveState(w, pState);
        var ov = (w.expressions || {})[pState] || {};
        editor.appendChild(h('h3', null, _t('Biểu cảm: {stateLabel}', { stateLabel: stateLabel(pState) }), h('span', { class: 'r' },
          h('button', { class: 'btn sm', disabled: !Object.keys(ov).length, onclick: function () { delete w.expressions[pState]; changed(false); paintGrid(); paintEditor(); } }, _t('Bỏ ghi đè')))));
        var t = h('table', { class: 'grid' });
        t.appendChild(h('tr', null, h('th', { text: _t('Thành phần') }), h('th', { text: _t('Đang dùng') }), h('th', { text: _t('Nguồn') }), h('th', { text: _t('Ghi đè cho nhân vật này') })));
        function setOv(k, v) {
          w.expressions = w.expressions || {};
          var o = w.expressions[pState] = w.expressions[pState] || {};
          if (v) o[k] = v; else delete o[k];
          if (!Object.keys(o).length) delete w.expressions[pState];
          changed(false); paintGrid(); paintEditor();
        }
        [['eyes', _t('Dáng mắt'), Object.keys(LIB.eyePoses)], ['brows', _t('Dáng mày'), Object.keys(LIB.browPoses)], ['mouth', _t('Miệng'), Object.keys(LIB.mouths)],
         ['motion', _t('Chuyển động'), Object.keys(LIB.motions)]].forEach(function (c) {
          var s = h('select', { 'aria-label': c[1], onchange: function () { setOv(c[0], s.value); } });
          s.appendChild(h('option', { value: '', text: _t('— kế thừa —') }));
          c[2].forEach(function (id) {
            var lbl = c[0] === 'motion' ? _l(LIB.motions[id].label) + ' (' + id + ')' : c[0] === 'brows' ? (_l(LIB.browPoses[id].label) || id) : id;
            var op = h('option', { value: id, text: lbl }); if (ov[c[0]] === id) op.selected = true; s.appendChild(op);
          });
          var shown = c[0] === 'motion' ? _l((LIB.motions[st.motion] || {}).label) : st[c[0]];
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
          } }, _l(LIB.fx[id].label) || id));
        });
        t.appendChild(h('tr', null, h('td', { class: 'k', text: _t('Hiệu ứng') }), h('td', { colspan: '2' }, h('span', { class: 'tag' + (st.src.fx !== 'Kho' ? ' acc' : ''), text: st.src.fx })), h('td', null, chips)));
        t.appendChild(h('tr', null, h('td', { class: 'k', text: _t('Trait áp dụng') }), h('td', { colspan: '3', class: 'v', text: st.traits.join(', ') || '—' })));
        var lines = (w.lines || {})[pState] || [];
        var ta = h('textarea', { rows: '2', placeholder: _t('Mỗi dòng một câu cửa miệng cho trạng thái này (AI đạo diễn sẽ tham khảo)'), oninput: function () {
          w.lines = w.lines || {}; var v = ta.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          if (v.length) w.lines[pState] = v; else delete w.lines[pState];
          dirty = true; saveBtn.disabled = false; undoBtn.disabled = false;
        } });
        ta.value = lines.join('\n');
        t.appendChild(h('tr', null, h('td', { class: 'k', text: _t('Câu cửa miệng') }), h('td', { colspan: '3' }, ta)));
        editor.appendChild(h('div', { class: 'scroll' }, t));
      }
      paintGrid(); paintEditor();
    }

    /* ---- Hồ sơ nhận diện */
    function tabProfile() {
      function field(label, key, obj, attrs) {
        var inp = h(attrs && attrs.area ? 'textarea' : 'input', Object.assign({ type: 'text', 'aria-label': label, rows: '2', oninput: function () { (obj || w)[key] = inp.value; dirty = true; saveBtn.disabled = false; undoBtn.disabled = false; if (key === 'name') crumbs([{ t: _t('Bàn chỉnh nhân vật'), go: { page: 'characters' } }, { t: inp.value }]); } }));
        inp.value = (obj || w)[key] || '';
        return [h('label', { text: label }), inp];
      }
      w.identity = w.identity || { must: [] };
      var status = h('select', { onchange: function () { w.status = status.value; dirty = true; saveBtn.disabled = false; undoBtn.disabled = false; } });
      [['draft', _t('Nháp — dùng ngay trong dự án')], ['published', _t('Phát hành — vào gói bán')]].forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (GC.statusOf(w.status) === o[0]) op.selected = true; status.appendChild(op); });
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
        field(_t('Tên'), 'name'), field(_t('Tên Hán'), 'han'), field('Phe', 'faction'), field('Vai', 'role'), field(_t('Mã'), 'code'),
        h('label', { text: _t('Trạng thái duyệt') }), status,
        field(_t('Tính cách (cho AI)'), 'persona', null, { area: true }),
        field(_t('Nhận diện chính (32 px)'), 'p1', w.identity), h('label', { text: _t('Dấu nhận diện bắt buộc') }), h('div', null, must, h('div', { class: 'note', text: _t('Cổng kiểm sẽ chặn nếu công thức mất một trong các dấu này.') })),
        field(_t('Nguồn tư liệu'), 'source', w.identity))));
    }

    /* ---- Phiên bản */
    function tabHistory() {
      var box = h('div', { class: 'panel' }, h('h3', null, _t('Lịch sử phiên bản'), h('span', { class: 'r note', text: Store.mode === 'server' ? _t('lưu trên máy') : _t('lưu trong trình duyệt') })));
      body.appendChild(box);
      Store.versions(orig).then(function (vs) {
        if (!vs.length) { box.appendChild(h('div', { class: 'empty', text: _t('Chưa có bản lưu nào. Bản đang dùng là bản gốc của thư viện {pack}.', { pack: orig.pack }) })); return; }
        var t = h('table', { class: 'grid' });
        t.appendChild(h('tr', null, h('th', { text: _t('Bản') }), h('th', { text: _t('Lúc lưu') }), h('th', { text: _t('Ghi chú') }), h('th', { text: '' })));
        vs.forEach(function (v) {
          t.appendChild(h('tr', null, h('td', { class: 'v', text: 'v' + v.version }), h('td', { class: 'nw', text: fmtTime(v.savedAt) }), h('td', { text: v.note || '—' }),
            h('td', null, h('button', { class: 'btn sm', disabled: v.version === orig.version, onclick: function () {
              Store.version(orig, v.version).then(function (data) {
                if (!data) return;
                w = clone(data); w.pack = orig.pack; w.key = orig.key; delete w._note;
                changed(false); toast(_t('Đã nạp v{version} vào bản làm việc. Bấm "Lưu phiên bản" để khôi phục.', { version: v.version }));
              });
            } }, v.version === orig.version ? _t('Đang dùng') : _t('Nạp bản này')))));
        });
        box.appendChild(h('div', { class: 'scroll' }, t));
      });
    }

    /* ---- JSON */
    function tabJSON() {
      var ta = h('textarea', { class: 'code', rows: '28', spellcheck: 'false', 'aria-label': _t('JSON công thức') });
      ta.value = JSON.stringify(Object.assign({}, w, { key: undefined }), null, 2);
      var errs = h('ul', { class: 'errs' });
      body.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Công thức JSON'), h('span', { class: 'r' }, h('button', { class: 'btn sm', onclick: function () {
        clear(errs);
        var o; try { o = JSON.parse(ta.value); } catch (e) { errs.appendChild(h('li', { text: _t('JSON lỗi cú pháp: {message}', { message: e.message }) })); return; }
        if (!o.look) { errs.appendChild(h('li', { text: _t('Thiếu "look".') })); return; }
        o.id = w.id; o.pack = w.pack; o.key = w.key;
        var g = GC.gate(o).filter(function (x) { return !x.ok && (x.id === 'parts' || x.id === 'params' || x.id === 'states'); });
        if (g.length) { g.forEach(function (x) { errs.appendChild(h('li', { text: _l(x.label) + ': ' + _l(x.detail) })); }); return; }
        w = o; changed(false); toast(_t('Đã áp JSON vào bản làm việc.'));
      } }, _t('Áp JSON')))), h('div', { class: 'pad' }, ta, errs)));
    }

    setPState(pState);
    paintGates();
    paintTab();
  };

  /* ============================================================ trang: Thư viện linh kiện */
  PAGES.library = function () {
    crumbs([{ t: _t('Kho linh kiện & phông') }]);
    var packs = Object.keys(GC.PACKS).map(function (k) { return GC.PACKS[k]; });
    var pt = h('table', { class: 'grid' });
    pt.appendChild(h('tr', null, [_t('Thư viện'), _t('Mã'), _t('Nhóm'), _t('Chủ'), _t('Quyền xem'), _t('Phiên bản'), _t('Nội dung'), 'License'].map(function (c) { return h('th', { text: c }); })));
    var GROUP = { official: _t('Chính thức'), mine: _t('Của tôi'), team: _t('Nhóm'), community: _t('Cộng đồng') };
    var VIS = { public: _t('Công khai'), private: _t('Riêng'), team: _t('Nhóm') };
    packs.forEach(function (p) {
      var cnt = Object.keys(p.counts).map(function (k) { return p.counts[k] + ' ' + k; }).join(' · ');
      pt.appendChild(h('tr', null, h('td', null, h('b', { text: _l(p.name) })), h('td', { class: 'v', text: p.id }), h('td', { text: GROUP[p.group] || p.group }),
        h('td', { text: _l(p.owner) }), h('td', { text: VIS[p.visibility] || p.visibility }), h('td', { class: 'v', text: p.version }), h('td', { class: 'note', text: cnt || '—' }), h('td', { class: 'note', text: _l(p.license) })));
    });
    // Ma-nơ-canh chuẩn: mọi bộ phận mặc định của khung, không thuộc nhân vật nào — soát linh kiện trên nền trung tính
    function mannequin(slot, p) {
      var m = { id: 'mannequin', name: 'Ma-nơ-canh', pack: 'gen.core',   // i18n-ignore(asset nội bộ của bàn soát, không hiện tên)
        version: 1, kind: 'character',
        look: { eyes: 'round', brows: 'normal', parts: {}, params: {}, palette: {} }, expressions: {}, identity: { must: [] } };
      m.key = 'studio/mannequin-' + slot + '-' + p.pack + '-' + p.id;
      m.look.parts[slot] = p.pack + '/' + p.id;
      if (slot === 'hair') m.look.parts.hat = 'none';
      return m;
    }
    var bench = h('div', { class: 'stack' });
    var t = h('table', { class: 'grid' });
    var cols = ['', _t('Xem'), _t('Bộ phận'), _t('Mã'), _t('Tên'), _t('Thư viện'), _t('Tham số'), _t('Dùng bởi')];
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
        var users = GC.assets().filter(function (a) { var v = GC.partRef(a, slot); return v === p.id || v === p.pack + '/' + p.id; }).map(function (a) { return _lo(a, a.name); });
        t.appendChild(h('tr', { style: 'cursor:pointer', title: _t('Bấm để soát trên ma-nơ-canh'), onclick: (function (slot0, p0) { return function () { showBench(slot0, p0); }; })(slot, p) }, h('td', { class: 'id', text: 'PT-' + String(n).padStart(4, '0') }), h('td', null, th), h('td', { class: 'k', text: _l(LIB.slots[slot].label) }),
          h('td', { class: 'v', text: p.id }), h('td', { class: 'nw' }, _lo(p, p.label), p.views && p.views.q45 ? h('span', { class: 'tag', style: 'margin-left:6px', title: _t('Có bản vẽ nghiêng 45° thật'), text: '45°' }) : null), h('td', null, h('span', { class: 'tag', text: p.pack })),
          h('td', { class: 'note', text: p.params ? Object.keys(p.params).map(function (k) { return _lo(p, p.params[k].label); }).join(', ') : '—' }),
          h('td', { class: 'note', text: users.join(', ') || '—' })));
        R.image(th, r, 'normal', { crop: ['head', 'mask', 'hair', 'hat'].indexOf(slot) >= 0, noShadow: true });
      });
    });
    // Bàn soát (bước 4 của quy trình tạo lập — docs/QUY-TRINH-LINH-KIEN.md): linh kiện trên ma-nơ-canh × góc nhìn × tình huống
    var VIEWS = ['front', 'left45', 'left90', 'left135', 'back'].map(function (v) { return [v, viewLabel(v)]; });
    var CASES = [['normal', null, _t('Đứng')], ['shock', null, _t('Kinh ngạc')], ['vow', 'run', _t('Chạy')], ['normal', 'sit-floor', _t('Ngồi')]];
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
        [_t('Bản vẽ chính diện'), true, _t('toạ độ khung 200 × 240, lớp đúng bộ phận')],
        [_t('Bản vẽ 45°'), has45, has45 ? _t('views.q45 — vẽ thật') : _t('chưa có: engine đang trượt tạm (bắt buộc với thư viện chính thức)')],
        [_t('Tham số'), true, p.params ? Object.keys(p.params).map(function (k) { return _lo(p, p.params[k].label) + ' ' + p.params[k].min + '–' + p.params[k].max; }).join(', ') : _t('không có')],
        ['License', !!p.license, p.license || _t('thiếu')],
        [_t('Nguồn'), !!p.source, _lo(p, p.source) || _t('thiếu')]
      ];
      bench.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Bàn soát · {label}', { label: _lo(p, p.label) }), h('span', { class: 'r mono', text: slot + ':' + p.id })),
        h('div', { class: 'pad stack' }, g,
          h('table', { class: 'grid' }, checks.map(function (c) { return h('tr', null, h('td', { text: c[1] ? '✓' : '✗', style: 'color:' + (c[1] ? 'var(--ok, #2e8b57)' : 'var(--danger)') }), h('td', { text: c[0] }), h('td', { class: 'note', text: c[2] })); })),
          h('div', { class: 'note', text: _t('Quy trình: vẽ chính diện → vẽ 45° (face45 / body45 / vẽ tay) → soát ở đây → test → phát hành. Chi tiết: docs/QUY-TRINH-LINH-KIEN.md') }))));
    }
    // Phông cảnh: nguyên liệu của cảnh — soát trong cảnh trung tính kèm diễn viên, ngày và đêm
    var S = GC.SCENE, ft = h('table', { class: 'grid' }), nf = 0;
    ft.appendChild(h('tr', null, ['', 'Xem', _t('Lớp'), _t('Mã'), _t('Tên'), _t('Thư viện'), _t('Dùng trong cảnh')].map(function (c) { return h('th', { text: c }); })));
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
        var used = GC.scenes().filter(function (sc) { return Object.keys(sc.layers).some(function (k) { return sc.layers[k].part === ref; }) || sc.deco.some(function (x) { return x.part === ref; }); }).map(function (sc) { return _lo(sc, sc.name); });
        ft.appendChild(h('tr', { style: 'cursor:pointer', title: _t('Bấm để soát trong cảnh'), onclick: function () { showSceneryBench(slot, p, used); } },
          h('td', { class: 'id', text: 'SC-' + String(nf).padStart(4, '0') }), h('td', null, h('img', { src: svgURL(benchScene(slot, p, { size: 120 })), alt: _lo(p, p.label), style: 'width:96px;display:block;border-radius:3px' })),
          h('td', { class: 'k', text: _l(S.slots[slot].label) }), h('td', { class: 'v', text: p.id }), h('td', { text: _lo(p, p.label) }), h('td', null, h('span', { class: 'tag', text: p.pack })),
          h('td', { class: 'note', text: used.join(', ') || '—' })));
      });
    });
    function showSceneryBench(slot, p, used) {
      clear(bench);
      var demo = GC.getAsset('ma-no-canh'), cast = demo ? [{ asset: demo, spot: 'center' }] : [];
      var checks = [[_t('Khung'), true, slot === 'deco' ? _t('đạo cụ: gốc (0,0) ở chân vật') : _t('toàn khung 640 × 360')], ['License', !!p.license, p.license || _t('thiếu')], [_t('Nguồn'), !!p.source, _lo(p, p.source) || _t('thiếu')], [_t('Dùng trong'), used.length > 0, used.join(', ') || _t('chưa cảnh nào')]];
      bench.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Bàn soát phông · {label}', { label: _lo(p, p.label) }), h('span', { class: 'r mono', text: slot + ':' + p.id })),
        h('div', { class: 'pad stack' },
          h('img', { src: svgURL(benchScene(slot, p, { cast: cast })), alt: _t('ban ngày'), style: 'width:100%;border-radius:4px' }),
          h('img', { src: svgURL(benchScene(slot, p, { cast: cast, time: 'night' })), alt: _t('ban đêm'), style: 'width:100%;border-radius:4px' }),
          h('table', { class: 'grid' }, checks.map(function (c) { return h('tr', null, h('td', { text: c[1] ? '✓' : '✗' }), h('td', { text: c[0] }), h('td', { class: 'note', text: c[2] })); })),
          h('div', { class: 'note', text: _t('Phông chỉ dùng token màu cảnh ({sky}, {grass}…) nên đổi giờ không phải vẽ lại. Tạo phông mới: agent gọi get_part_spec slot={slot} → preview_part → save_part.', { slot: slot }) }))));
    }
    $('view').appendChild(h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('div', { class: 'panel scroll' }, h('h3', null, _t('Nhóm thư viện'), h('span', { class: 'r note', text: _t('Gen Labs lo khung chuẩn và thư viện chính thức; thứ người dùng tạo ra nằm trong thư viện của họ.') })), pt),
        h('div', { class: 'panel scroll' }, h('h3', null, _t('Linh kiện nhân vật'), h('span', { class: 'r note', text: _t('{n} linh kiện · {n2} bộ phận · bấm một dòng để soát', { n: n, n2: Object.keys(LIB.slots).length }) })), t),
        h('div', { class: 'panel scroll' }, h('h3', null, _t('Phông cảnh'), h('span', { class: 'r note', text: _t('{nf} phông · {n} lớp · bấm một dòng để soát', { nf: nf, n: Object.keys(S.slots).length }) })), ft)),
      h('div', { class: 'sticky' }, bench)));
    var first = GC.partsOfSlot('hat').filter(function (p) { return p.id !== 'none'; })[0];
    if (first) showBench('hat', first);
  };

  /* ============================================================ trang: Biểu cảm & chuyển động (LIB.motions — vòng lặp thân người; "Động tác" = đòn biên đạo ở Thư viện, CNS-065) */
  PAGES.states = function () {
    crumbs([{ t: _t('Khung biểu cảm & chuyển động') }]);
    var st = h('table', { class: 'grid' });
    st.appendChild(h('tr', null, [_t('Mã'), _t('Biểu cảm'), _t('Khi nào'), _t('Mắt'), _t('Mày'), _t('Miệng'), _t('Hiệu ứng'), _t('Chuyển động')].map(function (c) { return h('th', { text: c }); })));
    LIB.stateOrder.forEach(function (id) {
      var s = LIB.states[id];
      st.appendChild(h('tr', null, h('td', { class: 'v', text: id }), h('td', null, h('b', { text: _l(s.label) })), h('td', { class: 'note', text: _l(s.hint) }),
        h('td', { class: 'v', text: s.eyes }), h('td', { class: 'v', text: s.brows }), h('td', { class: 'v', text: s.mouth }), h('td', { class: 'v', text: s.fx.join(', ') || '—' }), h('td', { class: 'v', text: s.motion })));
    });
    var mt = h('table', { class: 'grid' });
    mt.appendChild(h('tr', null, [_t('Mã'), _t('Chuyển động'), _t('Chu kỳ'), _t('Khớp điều khiển'), _t('Cất đồ cầm'), _t('Dùng ở')].map(function (c) { return h('th', { text: c }); })));
    Object.keys(LIB.motions).forEach(function (id) {
      var m = LIB.motions[id];
      var used = LIB.stateOrder.filter(function (s) { return LIB.states[s].motion === id; }).map(stateLabel)
        .concat(LIB.traits.filter(function (t) { return Object.keys(t.over).some(function (k) { return t.over[k].motion === id; }); }).map(function (t) { return 'trait ' + t.id; }));
      mt.appendChild(h('tr', null, h('td', { class: 'v', text: id }), h('td', { text: _l(m.label) }), h('td', { class: 'v', text: m.dur + ' s' }),
        h('td', { class: 'v', text: Object.keys(m.tracks).join(', ') }), h('td', { class: 'v', text: (m.hide || []).join(', ') || '—' }), h('td', { class: 'note', text: used.join(', ') || '—' })));
    });
    var tr = h('table', { class: 'grid' });
    tr.appendChild(h('tr', null, ['Trait', _t('Thư viện'), _t('Khi mang'), _t('Đổi hành vi')].map(function (c) { return h('th', { text: c }); })));
    LIB.traits.forEach(function (t) {
      tr.appendChild(h('tr', null, h('td', { text: _l(t.label) }), h('td', null, h('span', { class: 'tag', text: t.pack })),
        h('td', { class: 'v', text: Object.keys(t.if).map(function (k) { return k + ' ∈ {' + t.if[k].join(', ') + '}'; }).join('; ') }),
        h('td', { class: 'v', text: Object.keys(t.over).map(function (s) { var o = t.over[s]; return stateLabel(s) + ' → ' + (o.motion || '') + (o.fxAdd ? ' +' + o.fxAdd.join(',') : ''); }).join('; ') })));
    });
    // ma trận mắt: kiểu × dáng
    var poses = Object.keys(LIB.eyePoses), styles = Object.keys(LIB.eyeStyles);
    var mx = h('table', { class: 'grid' });
    mx.appendChild(h('tr', null, h('th', { text: _t('Kiểu \\ dáng') }), poses.map(function (p) { return h('th', { text: p }); })));
    var P = Object.assign({}, LIB.defaults, { eyeArea: LIB.defaults.skin });
    styles.forEach(function (s) {
      var row = h('tr', null, h('th', { text: _l(LIB.eyeStyles[s].label) }));
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
      prof.appendChild(h('tr', null, h('th', { colspan: '2', text: _l(p.label) })));
      p.map.forEach(function (m) { prof.appendChild(h('tr', null, h('td', { text: _l(m[0]) }), h('td', { class: 'v', text: m[1] + ' · ' + stateLabel(m[1]) }))); });
    });
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'panel scroll' }, h('h3', null, _t('Biểu cảm'), h('span', { class: 'r note', text: _t('{n} biểu cảm = mắt + mày + miệng + hiệu ứng + động tác', { n: LIB.stateOrder.length }) })), st),
      h('div', { class: 'split' },
        h('div', { class: 'stack' }, h('div', { class: 'panel scroll' }, h('h3', null, _t('Động tác (dữ liệu keyframe trên khớp)')), mt), h('div', { class: 'panel scroll' }, h('h3', null, _t('Trait theo bộ phận')), tr)),
        h('div', { class: 'stack' }, h('div', { class: 'panel scroll' }, h('h3', null, _t('Hồ sơ ánh xạ cho ứng dụng')), prof))),
      h('div', { class: 'panel scroll' }, h('h3', null, _t('Ma trận mắt'), h('span', { class: 'r note', text: _t('{n} kiểu × {n2} dáng = {n3} cặp, không vẽ tay cặp nào', { n: styles.length, n2: poses.length, n3: styles.length * poses.length }) })), mx)));
  };



  /* ============================================================ trang: Trang bị (item — loại asset thứ hai) */
  // Item = phối: linh kiện có sẵn + bảng màu riêng + chỉ số + độ hiếm. Tự đứng được (icon, thẻ) và mặc được lên nhân vật.
  // Lưu qua cùng cổng ghi với MCP và AI (POST /api/items → mcp.saveItemChecked).
  PAGES.items = function (r) {
    crumbs([{ t: _t('Bàn chỉnh vật phẩm') }]);
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
          row.appendChild(h('button', anc({ class: 'state-cell', 'aria-pressed': String(it === sel), title: it.key, onclick: function () { sel = it; paintGrid(); paintInsp(); } }, 'item:' + it.key, _lo(it, it.name)),
            h('img', { src: u(GC.itemSvg(it, { size: 112 })), alt: _lo(it, it.name), style: 'width:100%;display:block' }),
            h('div', { class: 'lb' }, h('b', { text: _lo(it, it.name) }), h('div', { class: 'note', style: 'color:' + I.rarity[it.rarity].color, text: _l(I.rarity[it.rarity].label) + (it.pack === MY_PACK ? _t(' · của tôi') : '') }))));
        });
        grid.appendChild(h('div', { class: 'panel' }, h('h3', null, _l(I.types[t].label), h('span', { class: 'r note', text: _t('{n} item · mặc ở {slots}', { n: list.length, slots: I.types[t].slots.join('/') }) })), h('div', { class: 'pad' }, row)));
      });
    }
    function paintInsp() {
      clear(insp);
      dockObj('asset', sel && sel.key, sel && _lo(sel, sel.name));
      if (!sel) return;
      var it = sel, mine = it.pack === MY_PACK;
      var whoSel = h('select', { onchange: function () { who = whoSel.value; paintTry(); } });
      GC.assets().forEach(function (a) { whoSel.appendChild(h('option', { value: a.id, text: _lo(a, a.name), selected: a.id === who })); });
      var vs = h('div', { class: 'seg' });
      [['front', _t('Chính diện')], ['left45', '45°'], ['attack', _t('Tấn công')], ['run', _t('Chạy')]].forEach(function (v) {
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
      insp.appendChild(h('div', { class: 'panel' }, h('h3', null, _lo(it, it.name), h('span', { class: 'r mono', text: it.key })),
        h('div', { class: 'pad stack' },
          h('div', { class: 'row', style: 'align-items:flex-start;gap:12px' },
            h('img', { src: u(GC.itemSvg(it, { mode: 'card' })), alt: _t('thẻ {name}', { name: it.name }), style: 'width:180px' }),
            h('div', { class: 'stack', style: 'flex:1' }, h('label', { class: 'note', text: _t('Mặc thử lên') }), whoSel, vs, tryBox)),
          h('table', { class: 'grid' }, g.map(function (x) { return h('tr', null, h('td', { text: x.ok ? '✓' : '✗' }), h('td', { text: _l(x.label) }), h('td', { class: 'note', text: _l(x.detail) || '' })); })),
          h('div', { class: 'note', text: _t('Linh kiện: {slot} · {part}{x}{x2}', { slot: it.equip.slot, part: it.equip.part, x: Object.keys(it.equip.palette).length ? _t(' · màu riêng: {keys}', { keys: Object.keys(it.equip.palette).join(', ') }) : '', x2: it.lore ? ' — ' + it.lore : '' }) }),
          Store.mode === 'server' ? editor(it, mine) : h('div', { class: 'note', text: _t('Bản xem thử: tạo/sửa item cần bản cài trên máy (hoặc agent qua MCP: save_item).') }))));
      paintTry();
    }
    function editor(it, mine) {
      var d = JSON.parse(JSON.stringify({ id: mine ? it.id : it.id + '-cua-toi', name: mine ? it.name : _t('{name} (bản của tôi)', { name: it.name }), han: it.han, type: it.type, rarity: it.rarity, equip: it.equip, stats: it.stats, description: it.description, lore: it.lore, icon: it.icon }));
      var f = h('div', { class: 'kv' });
      var name = h('input', { type: 'text', value: d.name });
      var rar = h('select'); I.rarityOrder.forEach(function (k) { rar.appendChild(h('option', { value: k, text: _l(I.rarity[k].label), selected: k === d.rarity })); });
      var part = h('select'); GC.partsOfSlot(d.equip.slot).filter(function (p) { return p.id !== 'none'; }).forEach(function (p) { var ref = p.pack + '/' + p.id; part.appendChild(h('option', { value: ref, text: _lo(p, p.label) + ' · ' + p.pack, selected: ref === d.equip.part })); });
      var pal = h('div', { class: 'row' });
      ['metal', 'wood', 'tassel', 'accent', 'armor', 'robe', 'trim', 'hat', 'cape', 'boots'].forEach(function (k) {
        var c = h('input', { type: 'color', value: d.equip.palette[k] || LIB.defaults[k], title: k, oninput: function () { d.equip.palette[k] = c.value; } });
        pal.appendChild(h('label', { class: 'note', style: 'display:flex;gap:4px;align-items:center' }, c, k));
      });
      var st = h('div', { class: 'row' });
      Object.keys(I.stats).forEach(function (k) {
        var n = h('input', { type: 'number', min: 0, max: 999, value: d.stats[k] || '', style: 'width:64px', oninput: function () { if (n.value === '') delete d.stats[k]; else d.stats[k] = +n.value; } });
        st.appendChild(h('label', { class: 'note', style: 'display:flex;gap:4px;align-items:center' }, _l(I.stats[k]), n));
      });
      var desc = h('input', { type: 'text', value: d.description || '', maxlength: 200, style: 'width:100%' });
      f.appendChild(h('label', { text: _t('Tên') })); f.appendChild(name);
      f.appendChild(h('label', { text: _t('Độ hiếm') })); f.appendChild(rar);
      f.appendChild(h('label', { text: _t('Linh kiện') })); f.appendChild(part);
      f.appendChild(h('label', { text: _t('Bảng màu riêng') })); f.appendChild(pal);
      f.appendChild(h('label', { text: _t('Chỉ số') })); f.appendChild(st);
      f.appendChild(h('label', { text: _t('Mô tả') })); f.appendChild(desc);
      var save = h('button', { class: 'btn primary', onclick: function () {
        d.name = name.value; d.rarity = rar.value; d.equip = { slot: d.equip.slot, part: part.value, params: d.equip.params, palette: d.equip.palette }; d.description = desc.value;
        Store.api('POST', 'api/items', { item: d, note: _t('Sửa trong Studio') }).then(function (rec) {
          var r1 = GC.registerItem(MY_PACK, rec); sel = r1.def || sel; toast(_t('Đã lưu {name} (bản {version})', { name: rec.name, version: rec.version })); paintGrid(); paintInsp();
        }).catch(function (e) { toast(e.message); });
      } }, mine ? _t('Lưu') : _t('Lưu thành item của tôi'));
      return h('div', { class: 'stack' }, h('div', { class: 'note', text: mine ? _t('Sửa item của tôi') : _t('Item chính thức: sửa sẽ tạo bản riêng trong "Của tôi" (không đè bản chính thức).') }), f, h('div', { class: 'row' }, save));
    }
    paintGrid(); paintInsp();
  };

  /* ============================================================ trang: Tư thế & hoạt động */
  // Một khung hình = biểu cảm (mặt) × tư thế nền × di chuyển × động tác (tay) + đạo cụ + hướng.
  // Lưới dùng tầng ảnh (cache, 0 chi phí mỗi khung); chỉ sân khấu bên phải diễn đủ.
  PAGES.poses = function (r) {
    crumbs([{ t: _t('Khung tư thế & hoạt động') }]);
    var all = GC.assets();
    var cur = GC.ASSETS[r.key] || all[0];
    var sel = { activity: r.activity || 'walk', state: null, posture: '', move: '', motion: '', facing: 'right', view: '' };
    var selA = h('select', { 'aria-label': _pt('số ít', 'Nhân vật'), onchange: function () { cur = GC.ASSETS[selA.value]; paintGrid(); play(); } });
    all.forEach(function (a) { selA.appendChild(h('option', { value: a.key, text: _lo(a, a.name) + ' · ' + a.pack, selected: a === cur })); });
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
    var sState = opt('', LIB.stateOrder.map(function (id) { return [id, stateLabel(id)]; }), _t('Theo hoạt động'));
    var sPost = opt('', Object.keys(LIB.postures).map(function (id) { return [id, _l(LIB.postures[id].label)]; }), _t('Theo hoạt động'));
    var sMove = opt('', [['none', _t('Đứng yên')]].concat(Object.keys(LIB.moves).map(function (id) { return [id, _l(LIB.moves[id].label)]; })), _t('Theo hoạt động'));
    var sMot = opt('', Object.keys(LIB.motions).map(function (id) { return [id, _l(LIB.motions[id].label)]; }), _t('Theo hoạt động'));
    var face = h('div', { class: 'seg' });
    [['right', _t('Quay phải')], ['left', _t('Quay trái')]].forEach(function (f) {
      face.appendChild(h('button', { 'aria-pressed': String(sel.facing === f[0]), onclick: function () { sel.facing = f[0]; Array.prototype.forEach.call(face.children, function (b, i) { b.setAttribute('aria-pressed', String(i === (f[0] === 'right' ? 0 : 1))); }); play(); } }, f[1]));
    });
    var viewSeg = h('div', { class: 'seg' });
    [['', N_('Tự động')]].concat(VIEWS_ALL).forEach(function (v) {
      viewSeg.appendChild(h('button', { 'data-v': v[0], 'aria-pressed': String(sel.view === v[0]), onclick: function () {
        sel.view = v[0];
        Array.prototype.forEach.call(viewSeg.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === sel.view)); });
        play(); paintGrid();
      } }, _t(v[1])));
    });
    [[sState, 'state'], [sPost, 'posture'], [sMove, 'move'], [sMot, 'motion']].forEach(function (x) { x[0].onchange = function () { sel[x[1]] = x[0].value; play(); }; });
    var reset = h('button', { class: 'btn sm', onclick: function () { sel.state = null; sel.posture = sel.move = sel.motion = ''; sState.value = sPost.value = sMove.value = sMot.value = ''; play(); } }, _t('Bỏ ghép tay'));
    var dl = h('button', { class: 'btn sm', onclick: function () {
      var svg = GC.svgString(cur, stateOf(), { director: dirOf() });
      var a = h('a', { href: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), download: cur.id + '-' + (sel.activity || 'pose') + '.svg' });
      document.body.appendChild(a); a.click(); a.remove();
    } }, _t('Tải SVG khung này'));
    $('view').appendChild(h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('div', { class: 'row' }, selA, h('span', { class: 'note', text: _t('{n} hoạt động · {n2} tư thế × {n3} di chuyển × {n4} động tác × {n5} biểu cảm', { n: LIB.activityOrder.length, n2: Object.keys(LIB.postures).length, n3: Object.keys(LIB.moves).length, n4: Object.keys(LIB.motions).length, n5: LIB.stateOrder.length }) })),
        grid),
      h('div', { class: 'sticky stack' },
        h('div', { class: 'panel' }, h('h3', null, _t('Sân khấu'), h('span', { class: 'r note', id: 'psLabel' })), stg,
          h('div', { class: 'pad stack' }, info,
            h('div', { class: 'kv' },
              h('label', { text: _t('Biểu cảm (mặt)') }), sState,
              h('label', { text: _t('Tư thế nền') }), sPost,
              h('label', { text: _t('Di chuyển') }), sMove,
              h('label', { text: _t('Động tác (tay)') }), sMot,
              h('label', { text: _t('Hướng') }), face,
              h('label', { text: _t('Góc nhìn') }), viewSeg),
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
      $('psLabel').textContent = act ? _l(act.label) : '';
      info.textContent = _t('Đang diễn: {stateLabel} · {x} · tư thế {label} · {x2} · động tác {x3}{x4}', { stateLabel: stateLabel(stateOf()), x: st.kind ? (VIEW_LABEL[dirOf().view] ? viewLabel(dirOf().view) : st.kind) + (st.fallback45 && st.fallback45.length ? _t(' (linh kiện mượn góc gần nhất: {fallback45})', { fallback45: st.fallback45.join(', ') }) : _t(' (vẽ thật đủ bộ)')) : st.turn ? (st.turn < 0 ? _t('3/4 trái') : _t('3/4 phải')) : _t('chính diện'), label: _l((LIB.postures[st.posture] || {}).label), x2: st.move ? _t('di chuyển {label}', { label: _l(LIB.moves[st.move].label) }) : _t('đứng yên'), x3: _l((LIB.motions[st.motion] || {}).label || st.motion), x4: st.props.length ? _t(' · đạo cụ: {map}', { map: st.props.map(function (p) { return _l(LIB.props[p].label); }).join(', ') }) : '' });
      Array.prototype.forEach.call(grid.querySelectorAll('.state-cell'), function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-a') === sel.activity)); });
    }
    function paintGrid() {
      clear(grid);
      var groups = {};
      LIB.activityOrder.forEach(function (id) { var g = LIB.activities[id].group || _t('Khác'); (groups[g] = groups[g] || []).push(id); });
      Object.keys(groups).forEach(function (g) {
        var box = h('div', { class: 'states' });
        groups[g].forEach(function (id) {
          var a = LIB.activities[id];
          var im = h('div', { class: 'im' });
          var cell = h('button', { class: 'state-cell', 'data-a': id, title: _l(a.hint || ''), onclick: function () { sel.activity = id; play(); } }, im, h('div', { class: 'lb', text: _l(a.label) }));
          R.image(im, cur, a.state || 'normal', { director: sel.view ? { activity: id, view: sel.view } : { activity: id } });
          box.appendChild(cell);
        });
        grid.appendChild(h('div', { class: 'panel' }, h('h3', null, _l(g), h('span', { class: 'r note', text: _t('{n} hoạt động', { n: groups[g].length }) })), h('div', { class: 'pad' }, box)));
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
      '<text x="' + (Wd - M) + '" y="52" font-size="12" fill="#8e897f" text-anchor="end">Storyboard · ' + xml(_t('{n} phân cảnh', { n: W.shots.length })) + ' · gen-chibi · © 2026 Gen Labs</text>';
    W.shots.forEach(function (s, i) {
      var x = M + (i % COLS) * (CW + GAP), y = HEAD + Math.floor(i / COLS) * (IH + TH + GAP), svg = GC.film.still(s);
      var names = {}; GC.film.actors(s).forEach(function (a) { names[a.id] = a.name; });
      o += '<rect x="' + x + '" y="' + y + '" width="' + CW + '" height="' + (IH + TH) + '" rx="10" fill="#fff" stroke="#e6e2d9"/>';
      o += svg ? '<image x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (CW - 2) + '" height="' + IH + '" preserveAspectRatio="xMidYMid slice" href="data:image/svg+xml;base64,' + b64(svg) + '"/>'
        : '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (CW - 2) + '" height="' + IH + '" fill="#efece5"/><text x="' + (x + CW / 2) + '" y="' + (y + IH / 2) + '" font-size="14" fill="#8e897f" text-anchor="middle">' + xml(_t('chưa có bối cảnh')) + '</text>';
      o += '<circle cx="' + (x + 22) + '" cy="' + (y + 22) + '" r="14" fill="#2e8b5e"/><text x="' + (x + 22) + '" y="' + (y + 27) + '" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">' + (i + 1) + '</text>';
      var ty = y + IH + 24;
      o += '<text x="' + (x + 14) + '" y="' + ty + '" font-size="16" font-weight="700" fill="#1c1b1e">' + xml(s.title) + '</text>';
      wrapText(s.description, 74, 2).forEach(function (l, k) { o += '<text x="' + (x + 14) + '" y="' + (ty + 20 + k * 17) + '" font-size="12.5" fill="#5e5a53">' + xml(l) + '</text>'; });
      var lines = (s.event ? s.event.steps : []).slice(0, 4).map(function (st) { return (names[st.actor] || st.actor) + ': ' + st.say; });
      if (s.event && s.event.steps.length > 4) lines[3] = lines[3] + '  (+' + (s.event.steps.length - 4) + ')';
      if (!lines.length) lines = [_t('(chưa có lời thoại)')];
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
    var mute = h('button', { class: 'btn sm', title: _t('Bật / tắt tiếng phim (hiệu ứng, nền, nhạc, giọng)'), 'aria-label': _t('Bật / tắt tiếng'), onclick: function () { var m = !GC.audio.muted; AudioPref.set('muted', m); mute.textContent = m ? '🔇' : '🔊'; } }, p.muted ? '🔇' : '🔊');
    var vs = h('select', { 'aria-label': _t('Giọng nhân vật'), title: _t('Tự động: giọng AI đã lồng nếu có, không thì máy đọc (đúng ngôn ngữ + giới của vai) hoặc blip · AI Google: đọc bằng giọng AI ngay khi diễn (tốn lượt) · Máy đọc: giọng có sẵn của trình duyệt'), onchange: function () {
      AudioPref.set('voice', vs.value);
      if (vs.value === 'ai') AiVoice.load().then(function () { if (!AiVoice.ready()) toast(_t('Chưa có key giọng AI — dán key ở Cài đặt AI › Giọng AI. Tạm dùng giọng máy đọc.')); });
    } });
    VOICE_MODES.forEach(function (o) { var op = h('option', { value: o[0], text: _t(o[1]) }); if ((p.voice || 'auto') === o[0]) op.selected = true; vs.appendChild(op); });
    return [mute, vs];
  }
  // kiểu lời thoại của sân khấu, nhớ theo máy như âm thanh (engine/player.js: opts.dialog / setDialog):
  // tự động = bong bóng khi có chỗ sạch (không che đầu ai), không thì phụ đề dải dưới · bong bóng = luôn bong bóng · phụ đề = luôn phụ đề
  var DIALOG_MODES = [['auto', N_('Lời thoại: tự động')], ['bubble', N_('Lời thoại: bong bóng')], ['caption', N_('Lời thoại: phụ đề')]];
  var StagePref = {
    get: function () {
      var p; try { p = JSON.parse(localStorage.getItem('gc-stage') || '{}') || {}; } catch (e) { p = {}; }
      return { dialog: DIALOG_MODES.some(function (m) { return m[0] === p.dialog; }) ? p.dialog : 'auto' };
    },
    set: function (k, v) { var p = StagePref.get(); p[k] = v; try { localStorage.setItem('gc-stage', JSON.stringify(p)); } catch (e) { /* bỏ qua */ } }
  };
  function dialogControl(player) {
    var cur = StagePref.get().dialog;
    var sel = h('select', { 'aria-label': _t('Kiểu lời thoại'), title: _t('Tự động: bong bóng khi có chỗ không che mặt ai, không thì phụ đề dải dưới · Bong bóng: luôn bong bóng · Phụ đề: luôn phụ đề'),
      onchange: function () { StagePref.set('dialog', sel.value); player.setDialog(sel.value); } });
    DIALOG_MODES.forEach(function (o) { var op = h('option', { value: o[0], text: _t(o[1]) }); if (cur === o[0]) op.selected = true; sel.appendChild(op); });
    return sel;
  }
  /* ============================================================ Giọng AI (Google Gemini TTS) + giọng theo vai
   * Server (server/voice.js) giữ key; Studio chỉ hỏi qua Store.api. Kiểu giọng của sân khấu (AudioPref.voice):
   *   auto = dùng clip AI ĐÃ lồng nếu có (hỏi "dry" — không tốn lượt, không gọi Google), chưa có thì máy đọc / blip;
   *   ai   = đọc bằng giọng AI ngay khi diễn (tốn lượt; hết lượt / chưa có key → MỘT thông báo rồi rơi về máy đọc);
   *   tts · blip · off = như cũ, không đụng tới giọng AI.
   * GC.audio.setVoiceMode chỉ nhận auto | tts | blip | off → 'ai' ánh xạ thành 'auto' (AudioPref.apply). Ngân sách: mỗi câu hỏi server MỘT lần
   * (nhớ clip trong bộ nhớ, tối đa 160 clip), không việc gì mỗi khung hình. */
  var VOICE_MODES = [['auto', N_('Giọng: tự động')], ['ai', N_('Giọng: AI Google')], ['tts', N_('Giọng: máy đọc')], ['blip', N_('Giọng: blip kiểu game')], ['off', N_('Giọng: tắt')]];
  // ngôn ngữ + giọng vùng đang chọn ở các ô nghe thử (Hồ sơ nhân vật, Cài đặt AI) — nhớ theo máy
  var VoicePref = {
    get: function () {
      var p; try { p = JSON.parse(localStorage.getItem('gc-voice') || '{}') || {}; } catch (e) { p = {}; }
      var l = GC.voices.lang(p.lang || I18N.lang());   // chưa chọn → ngôn ngữ giao diện (CNS-151)
      return { lang: l, accent: GC.voices.accent(l, p.accent) };
    },
    set: function (lang, accent) { try { localStorage.setItem('gc-voice', JSON.stringify({ lang: lang, accent: accent })); } catch (e) { /* bỏ qua */ } }
  };
  var VOICE_SAMPLE = { vi: 'Xin chào, rất vui được gặp bạn.',   // i18n-ignore(câu đọc thử theo NGÔN NGỮ GIỌNG, không theo ngôn ngữ giao diện)
    en: 'Hello, it is nice to meet you.', zh: '你好，很高兴认识你。', yue: '你好，好高興認識你。' };
  function voiceSample(lang, name) {
    if (!name) return VOICE_SAMPLE[lang] || VOICE_SAMPLE.vi;
    return lang === 'en' ? 'Hello, I am ' + name + '!' : lang === 'zh' ? '你好，我是' + name + '！' : lang === 'yue' ? '你好，我係' + name + '！' : 'Xin chào, ta là ' + name + '!';   // i18n-ignore(câu đọc thử bằng giọng tiếng Việt)
  }
  // gợi ý khi chọn ngôn ngữ cần viết lời thoại đúng khẩu ngữ riêng (tiếng Quảng Đông khác văn phổ thông)
  var LANG_NOTE = N_('giọng máy đọc + giọng AI + lồng tiếng theo ngôn ngữ này');
  var LANG_HINT = { yue: N_('Lời thoại phải viết bằng tiếng Quảng Đông: chữ phồn thể + khẩu ngữ (喺 / 咩 / 我哋), không dùng văn phổ thông.') };
  function clockOf(iso) {   // "14:05" (hôm nay) hoặc "14:05 21/10"
    var d = new Date(iso), n = new Date();
    if (isNaN(d.getTime())) return '';
    var t = d.toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit', hour12: false });
    return d.toDateString() === n.toDateString() ? t : t + ' ' + d.toLocaleDateString(I18N.locale(), { day: '2-digit', month: '2-digit' });
  }
  // retryAt của server (ISO, hoặc ms epoch) → ms epoch; không hiểu thì 0 · "14:05:09" (giây — giới hạn mỗi phút tính theo giây)
  function atMs(v) { var n = typeof v === 'number' ? v : Date.parse(v); return n > 0 ? n : 0; }
  function clockSec(ms) { return new Date(ms).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  // WAV (ArrayBuffer) → data: URI nhúng vào phim xuất ra
  function bufDataURI(buf) {
    var u = new Uint8Array(buf), s = '', i;
    for (i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return 'data:audio/wav;base64,' + btoa(s);
  }
  // như bufDataURI nhưng mã hoá base64 ngoài luồng chính (FileReader) — gom hàng chục clip cho phim / video không thành một long task (spec v0.22 §3)
  function bufDataURIAsync(buf) {
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).replace(/^data:[^,]*;base64,/, 'data:audio/wav;base64,')); };
      r.onerror = function () { no(r.error); };
      r.readAsDataURL(new Blob([buf], { type: 'audio/wav' }));
    });
  }
  var SRC_CHIP = { design: [N_('thiết kế'), 'chip ok'], library: [N_('thư viện Google'), 'chip info'], prebuilt: [N_('có sẵn'), 'chip'], chosen: [N_('đã chọn'), 'chip warn'] };
  // nguồn của giọng một nhân vật trong tác phẩm: đã chốt vào work.voices · chọn tay ở hồ sơ nhân vật · chưa có (phòng tác phẩm › Giọng & âm thanh)
  var CHOT_SRC = { chot: [N_('Đã chốt'), 'chip ok', N_('Giọng đã CHỐT trong tác phẩm (work.voices) — Studio, MCP và phim xuất cùng một giọng')], tay: [N_('Chọn tay'), 'chip warn', N_('Giọng chọn tay trên hồ sơ nhân vật (chưa chốt vào tác phẩm)')], chua: [N_('Chưa chốt'), 'chip', N_('Chưa có giọng AI — Lồng tiếng AI hoặc “Chốt giọng cả dàn” sẽ chọn và chốt')] };
  var CAST_MAX = 48;   // server chỉ chọn giọng AI cho 48 diễn viên đầu của một tác phẩm (api/voice/cast → missing)
  var MINUTE_MS = 120000, MINUTE_WAITS = 10;   // CNS-098: 429 có giờ thử lại trong ≤ 2 phút = Google giới hạn MỖI PHÚT → chờ rồi lồng tiếp (tối đa 10 lần chờ mỗi lượt bấm)

  var AiVoice = {
    cfg: null, cfgP: null, clips: new Map(), casts: {}, libs: {}, flight: {}, blockedUntil: 0, blockedCap: false, told: {},
    roleCasts: {}, roleFlight: {},   // giọng AI server chọn cho MỘT vai: lang|giọng vùng|vai → { voice, source, label } + lời gọi đang bay (Thư viện › Giọng — nơi duy nhất xem bộ giọng vai)
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
    set: function (c) { this.cfg = c; this.cfgP = Promise.resolve(c); this.blockedUntil = 0; this.blockedCap = false; this.told = {}; this.resetCasts(); },   // sau khi dán key / bật / tắt / đổi trần ngày / gỡ giọng hỏng: giọng đã chọn tính lại
    // quên mọi giọng đã chọn (cast cả dàn, thư viện giọng, cast từng vai) — sau khi thiết kế giọng, đổi key, gỡ giọng hỏng: lần hỏi kế tiếp tính lại với đủ giọng
    resetCasts: function () { this.casts = {}; this.libs = {}; this.roleCasts = {}; this.roleFlight = {}; },
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
      if (e && e.cap) return _t('Đã chạm trần {x} hôm nay (Cài đặt AI){x2}', { x: c && c.dailyCap > 0 ? _t('{dailyCap} câu', { dailyCap: c.dailyCap }) : _t('số câu'), x2: at ? _t(' — đọc tiếp lúc {clockOf}', { clockOf: clockOf(at) }) : '' });
      if (this.isMinute(e)) return _t('Google giới hạn mỗi phút{x}', { x: at ? _t(' — thử lại lúc {clockSec}', { clockSec: clockSec(at) }) : '' });
      return at ? _t('Hết lượt hôm nay — thử lại lúc {clockOf}', { clockOf: clockOf(at) }) : _t('Hết lượt giọng AI');
    },
    explain: function (e) {
      if (e.status === 429) this.tell('quota', _t('{quotaText}. Các câu còn lại dùng giọng máy đọc hoặc blip.', { quotaText: this.quotaText(e) }));
      else if (e.status === 409) this.tell('off', _t('{message} — dùng giọng máy đọc.', { message: e.message }));
      else this.tell('err', _t('Giọng AI lỗi: {message} — dùng giọng máy đọc.', { message: e.message }));
    },
    block: function (e) { this.blockedUntil = atMs(e.retryAt) || Date.now() + 5 * 60000; this.blockedCap = !!e.cap; },
    workKey: function (W, L) { return [W.id, L.lang, L.accent].join('|'); },
    markHas: function (W, L) { if (W && L) this.has[this.workKey(W, L)] = true; },
    hasClips: function (W, L) { return !!(W && L && this.has[this.workKey(W, L)]); },
    // vai giọng của nhân vật (đã chọn, hoặc đoán từ vai trò / tính cách / tên) · giọng vùng riêng nếu hợp ngôn ngữ phim
    roleOf: function (a) { return GC.voices.roleOf(a); },   // một nguồn với server + phim xuất (engine/voices.js)
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
      if (!/^\/?api\/voice\/clip\/[A-Za-z0-9_-]+\.wav$/.test(String(url))) return Promise.reject(new Error(_t('Địa chỉ clip lạ — bỏ qua')));   // token chỉ gửi về chính server này
      return fetch(url, { headers: Store.headers() }).then(function (r) { if (!r.ok) throw new Error(_t('Không tải được clip ({status})', { status: r.status })); return r.arrayBuffer(); });
    },
    keep: function (key, buf) { this.clips.set(key, buf); while (this.clips.size > 160) this.clips.delete(this.clips.keys().next().value); },
    // lấy clip của một câu → { buf, cached, seconds }. dry = chỉ lấy clip ĐÃ đọc (không gọi Google, không tốn lượt; chưa có → lỗi 404).
    // Phát phim hết lượt thì thôi hỏi server tới giờ thử lại (blockedUntil); bấm nút (force) luôn hỏi — server mới là người quyết
    get: function (p, dry, force) {
      var self = this, key = this.keyOf(p), hit = this.clips.get(key);
      if (hit) { this.clips.delete(key); this.clips.set(key, hit); return Promise.resolve({ buf: hit, cached: true }); }
      if (!dry && !force && Date.now() < this.blockedUntil) return Promise.reject(Object.assign(new Error(_t('Hết lượt giọng AI')), { status: 429, retryAt: new Date(this.blockedUntil).toISOString(), cap: this.blockedCap }));
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
        if (!self.ready()) { if (spend) self.tell('nokey', _t('Giọng AI chưa sẵn sàng (chưa có key hoặc đang tắt) — dùng giọng máy đọc. Dán key ở Cài đặt AI › Giọng AI.')); return null; }
        return self.castOf(W, L.lang, L.accent).then(function (cast) {
          var p = self.paramsOf(L, a, line, cast);
          return p ? self.get(p, !spend).then(function (r) { self.markHas(W, L); return r.buf; }) : null;
        });
      }).catch(function (e) { if (spend) self.explain(e); return null; });
    },
    // giọng AI cho MỘT nhân vật (nghe thử ở Hồ sơ nhân vật): chọn tay thì dùng, không thì hỏi api/voice/cast với đúng một diễn viên
    castActor: function (a, role, lang, accent, chosen) {
      if (chosen) return Promise.resolve(chosen);
      return this.castOne({ id: a.id || 'x', role: role, gender: GC.voices.ROLES[role].gender }, lang, accent).then(function (c) { return c.voice; });
    },
    // MỘT hàm hỏi server chọn giọng AI cho đúng một diễn viên (không kèm `work` → không chốt vào tác phẩm nào; miễn phí) → { voice, source, label }.
    // Hồ sơ nhân vật (castActor) và Thư viện › Giọng (castRole) cùng gọi hàm này
    castOne: function (o, lang, accent) {
      return Store.api('POST', 'api/voice/cast', { lang: lang, accent: accent, actors: [o] }).then(function (r) {
        var c = r && r.cast && r.cast[o.id];
        if (!c || !c.voice) throw new Error(_t('Server không chọn được giọng cho vai này'));
        return c;
      });
    },
    // giọng AI server sẽ chọn cho một VAI (diễn viên giả mang id = vai), nhớ theo lang|giọng vùng|vai; lời gọi đang bay dùng chung — bộ giọng vai chỉ ở Thư viện › Giọng
    castRole: function (role, lang, accent) {
      var self = this, k = lang + '|' + accent + '|' + role;
      if (this.roleCasts[k]) return Promise.resolve(this.roleCasts[k]);
      if (this.roleFlight[k]) return this.roleFlight[k];
      var p = this.castOne({ id: role, role: role, gender: GC.voices.ROLES[role].gender }, lang, accent).then(function (c) { delete self.roleFlight[k]; self.roleCasts[k] = c; return c; }, function (e) { delete self.roleFlight[k]; throw e; });
      this.roleFlight[k] = p;
      return p;
    },
    // thiết kế giọng riêng cho một vai (~25 s, tốn 1 lượt, chủ máy): ghi vào cfg.designs, quên cast từng vai. Thư viện › Giọng (từng vai) và phòng tác phẩm (hàng loạt) cùng gọi hàm này
    designRole: function (role, lang, accent) {
      var self = this;
      return Store.api('POST', 'api/voice/design', { role: role, lang: lang, accent: accent }).then(function (x) {
        var c = self.cfg; if (c) { c.designs = c.designs || {}; c.designs[role + '|' + lang + '|' + accent] = { voice: x.voice, at: new Date().toISOString(), preview: x.preview || null }; }
        self.roleCasts = {}; self.roleFlight = {};
        return x;
      });
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
        GC.film.lines(W).forEach(function (x) {   // đúng các câu bộ phát sẽ đọc — cùng nguồn với xuất phim + server đếm "Giọng AI x/y" (CNS-146)
          var p = self.paramsOf(L, x.actor, x.line, cast), k = p && self.keyOf(p);
          if (!p || seen[k]) return;
          seen[k] = 1; jobs.push(p);
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
  // nhả luồng chính (MessageChannel: không bị bóp như setTimeout ở tab nền) — HAI bước: bước đầu rỗng để hẹn giờ / vẽ đã tới hạn trong tác vụ vừa xong được
  // chạy ngay, không phải chờ thêm tác vụ nặng kế tiếp (như GCVClock.yieldReal của trang xuất video)
  function hop() { return new Promise(function (ok) { var c = new MessageChannel(); c.port1.onmessage = function () { c.port1.close(); ok(); }; c.port2.postMessage(0); }); }
  function nextTask() { return hop().then(hop); }
  // = GC.film.lines(W) nhưng dựng từng phân cảnh ở một tác vụ riêng (đạo diễn tự động của phim 6 phân cảnh ~50–70 ms một mạch → long task, spec v0.22 §3).
  // Cùng kết quả: lines() bỏ phân cảnh chưa sẵn sàng và gộp câu trùng khoá theo thứ tự phân cảnh — gộp lại đúng như vậy ở đây.
  function filmLinesAsync(W) {
    var out = [], seen = {}, shots = (W && W.shots) || [], i = 0;
    return (function step() {
      if (i >= shots.length) return Promise.resolve(out);
      GC.film.lines({ shots: [shots[i++]], project: W.project || '' }).forEach(function (x) { if (!seen[x.key]) { seen[x.key] = 1; out.push(x); } });
      return nextTask().then(step);
    })();
  }
  function filmVoices(W, L) {
    var out = { voices: {}, have: 0, total: 0 };
    if (!AiVoice.on()) return Promise.resolve(out);
    return AiVoice.load().then(function (cfg) {
      if (!cfg || !(cfg.hasKey || cfg.cached)) return out;   // chưa từng có giọng AI: khỏi hỏi từng câu
      return Promise.all([AiVoice.castOf(W, L.lang, L.accent), filmLinesAsync(W)]).then(function (res) {
        var cast = res[0], jobs = [];
        res[1].forEach(function (x) {
          out.total++;
          var p = AiVoice.paramsOf(L, x.actor, x.line, cast);
          if (p) jobs.push({ k: x.key, p: p });
        });
        var i = 0;
        function worker() {   // 3 luồng song song
          if (i >= jobs.length) return Promise.resolve();
          var j = jobs[i++];
          return AiVoice.get(j.p, true).then(function (r) { return bufDataURIAsync(r.buf).then(function (u) { j.u = u; }); }).catch(function () { /* chưa đọc câu này: bỏ qua */ }).then(worker);
        }
        return Promise.all([worker(), worker(), worker()]).then(function () {
          jobs.forEach(function (j) { if (j.u) { out.voices[j.k] = j.u; out.have++; } });   // theo thứ tự câu (không theo thứ tự xong) — payload tất định
          if (out.have) AiVoice.markHas(W, L);
          return out;
        });
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
    var roleSel = h('select', { 'aria-label': _t('Vai giọng'), title: _t('Vai quyết định giọng: tuổi, giới, văn / võ, tính cách. Chưa chọn thì tự đoán từ vai trò, tính cách và tên'), onchange: function () { touched.role = true; syncDefaults(); } });
    roleSel.appendChild(h('option', { value: '', text: _t('Tự đoán: {label}', { label: _l(V.ROLES[guess].label) }) }));
    V.AGES.forEach(function (ag) {
      var g = h('optgroup', { label: _l(ag[1]) });
      V.roleList().filter(function (r) { return r.age === ag[0]; }).forEach(function (r) { g.appendChild(h('option', { value: r.id, text: _l(r.label) + ' · ' + (r.gender === 'f' ? _t('nữ') : _t('nam')) + ' · ' + _l(r.kindLabel) })); });
      roleSel.appendChild(g);
    });
    roleSel.value = saved.role && V.ROLES[saved.role] ? saved.role : '';
    var langSel = h('select', { 'aria-label': _t('Ngôn ngữ nghe thử'), title: _t('Ngôn ngữ để nghe thử (phim chọn ngôn ngữ riêng ở tab Giọng & âm thanh)'), onchange: function () { VoicePref.set(langSel.value, V.accent(langSel.value, '')); fillAccent(); fillAi(); } });
    V.langList().forEach(function (l) { langSel.appendChild(h('option', { value: l.id, text: _l(l.label) })); });
    langSel.value = lang0;
    var accSel = h('select', { 'aria-label': _t('Giọng vùng'), title: _t('Giọng vùng của riêng nhân vật. "Theo phim" = theo giọng vùng của tác phẩm'), onchange: function () { touched.accent = true; } });
    function fillAccent() {
      clear(accSel);
      accSel.appendChild(h('option', { value: '', text: _t('Theo phim') }));
      V.langList().filter(function (l) { return l.id === langSel.value; })[0].accents.forEach(function (x) { accSel.appendChild(h('option', { value: x.id, text: _l(x.label) })); });
      var keep = touched.accent ? '' : saved.accent;   // chưa đụng tới: hiện giọng vùng đã lưu nếu hợp ngôn ngữ đang xem
      accSel.value = keep && V.accent(langSel.value, keep) === keep ? keep : '';
    }
    fillAccent();
    var aiSel = h('select', { 'aria-label': _t('Giọng AI'), title: _t('Giọng AI Google của nhân vật. "Tự động theo vai" = server chọn giọng hợp vai, mỗi nhân vật một giọng khác nhau'), onchange: function () { touched.ai = true; } });
    var aiRow = [h('label', { text: _t('Giọng AI') }), aiSel];
    aiRow.forEach(function (e) { e.hidden = true; });
    function fillAi() {
      if (!AiVoice.on() || !AiVoice.ready()) { aiRow.forEach(function (e) { e.hidden = true; }); return; }
      var L = langSel.value, want = touched.ai ? aiSel.value : saved.ai || '';
      AiVoice.library(L).then(function (list) {
        if (L !== langSel.value) return;
        clear(aiSel);
        aiSel.appendChild(h('option', { value: '', text: _t('Tự động theo vai') }));
        var g = V.ROLES[roleSel.value || guess].gender;
        [['design', _t('Thiết kế của bạn')], ['library', _t('Thư viện Google')], ['prebuilt', _t('Có sẵn')]].forEach(function (src) {
          var vs = list.filter(function (v) { return v.source === src[0]; }).sort(function (x, y) { return (y.gender === g) - (x.gender === g); });
          if (!vs.length) return;
          var og = h('optgroup', { label: src[1] });
          vs.forEach(function (v) { og.appendChild(h('option', { value: v.id, text: [v.name || v.id, v.gender === 'f' ? _t('nữ') : _t('nam'), v.age ? _t('{age} tuổi', { age: v.age }) : '', v.description].filter(Boolean).join(' · ').slice(0, 80) })); });
          aiSel.appendChild(og);
        });
        if (want && !list.some(function (v) { return v.id === want; })) aiSel.appendChild(h('option', { value: want, text: _t('{want} (đã chọn)', { want: want }) }));
        aiSel.value = want;
        aiRow.forEach(function (e) { e.hidden = false; });
      }).catch(function () { aiRow.forEach(function (e) { e.hidden = true; }); });
    }
    AiVoice.load().then(fillAi);
    // cao độ / tốc độ: mặc định theo vai (+ lệch nhẹ theo id nhân vật, như bộ phát)
    function roleDefault() { return GC.audio.voiceOf({ id: a.id, key: a.key, name: a.name, voice: { role: roleSel.value || guess } }, { lang: langSel.value, accent: accSel.value || undefined }); }
    var d0 = saved.pitch !== undefined || saved.rate !== undefined ? GC.audio.voiceOf(a, { lang: lang0 }) : roleDefault();
    var pitch = h('input', { type: 'range', min: 0.5, max: 2, step: 0.05, value: d0.pitch, 'aria-label': _t('Cao độ giọng'), title: _t('Cao độ: trầm ← → cao'), oninput: function () { touched.pitch = true; clearPR = false; } });
    var rate = h('input', { type: 'range', min: 0.6, max: 1.6, step: 0.05, value: d0.rate, 'aria-label': _t('Tốc độ nói'), title: _t('Tốc độ: chậm ← → nhanh'), oninput: function () { touched.rate = true; clearPR = false; } });
    function syncDefaults() {   // đổi vai → thanh trượt nhảy về mặc định của vai, trừ khi người dùng đã chọn / kéo
      var d = roleDefault();
      if (!fixed.pitch && !touched.pitch) pitch.value = d.pitch;
      if (!fixed.rate && !touched.rate) rate.value = d.rate;
      if (AiVoice.ready()) fillAi();
    }
    var resetB = h('button', { class: 'btn sm', title: _t('Bỏ cao độ / tốc độ đã lưu, về mặc định của vai (bấm Lưu giọng để áp dụng)'), onclick: function () {
      fixed.pitch = fixed.rate = false; touched.pitch = touched.rate = false; clearPR = true;
      var d = roleDefault(); pitch.value = d.pitch; rate.value = d.rate;
    } }, '↺ theo vai');
    // giọng trình duyệt theo vai / ngôn ngữ đang chọn (không tốn gì)
    function localVoice() {
      var v = GC.audio.voiceOf({ id: a.id, key: a.key, name: a.name, voice: { role: roleSel.value || guess, accent: accSel.value || undefined, pitch: +pitch.value, rate: +rate.value } }, { lang: langSel.value, accent: accSel.value || V.accent(langSel.value, '') });
      return v;
    }
    var line = function () { return voiceSample(langSel.value, a.name); };
    var aiB = h('button', { class: 'btn sm', title: _t('Đọc một câu mẫu bằng giọng AI Google — tốn 1 lượt (câu đã đọc rồi thì không tốn lại)'), onclick: function () {
      var role = roleSel.value || guess, lang = langSel.value, accent = accSel.value || V.accent(lang, ''), text = line(), lv = localVoice();
      aiB.disabled = true; aiB.textContent = _t('Đang đọc…');
      AiVoice.castActor(a, role, lang, accent, aiSel.value).then(function (voice) {
        return AiVoice.get({ text: text, voice: voice, role: role, lang: lang, accent: accent, state: 'normal', bubble: 'say' }, false, true).then(function (r) { AiVoice.speak(text, r.buf, lv); });
      }).catch(function (e) { toast(e.status === 429 ? AiVoice.quotaText(e) + '.' : e.message); })
        .then(function () { aiB.disabled = false; aiB.textContent = _t('▶ Giọng AI'); });
    } }, _t('▶ Giọng AI'));
    aiB.hidden = true;
    AiVoice.load().then(function () { aiB.hidden = !AiVoice.ready(); });
    return h('div', { class: 'voicebox' }, h('b', { text: _t('Giọng') }),
      h('label', { text: _t('Vai giọng') }), roleSel,
      h('label', { text: _t('Ngôn ngữ') }), h('div', { class: 'pair' }, langSel, accSel),
      aiRow,
      h('label', { text: _t('Cao độ') }), h('div', { class: 'sl' }, h('span', { class: 'note', text: _t('trầm') }), pitch, h('span', { class: 'note', text: _t('cao') })),
      h('label', { text: _t('Tốc độ') }), h('div', { class: 'sl' }, h('span', { class: 'note', text: _t('chậm') }), rate, h('span', { class: 'note', text: _t('nhanh') }), resetB),
      h('div', { class: 'vb-acts' },
        h('button', { class: 'btn sm', onclick: function () { GC.audio.unlock(); GC.audio.say(line(), localVoice()); } }, _t('▶ Nghe thử')),
        aiB,
        mine ? h('button', { class: 'btn sm primary', title: _t('Lưu giọng vào công thức nhân vật (dùng trong mọi phim). Cao độ / tốc độ chỉ ghi khi bạn đã kéo'), onclick: function () {
          var d = clone(a), v = Object.assign({}, d.voice || {});
          if (touched.role) { if (roleSel.value) v.role = roleSel.value; else delete v.role; }
          if (touched.accent) { if (accSel.value) v.accent = accSel.value; else delete v.accent; }
          if (touched.ai) { if (aiSel.value) v.ai = aiSel.value; else delete v.ai; }
          if (clearPR) { delete v.pitch; delete v.rate; }
          if (touched.pitch) v.pitch = +pitch.value;
          if (touched.rate) v.rate = +rate.value;
          if (Object.keys(v).length) d.voice = v; else delete d.voice;
          resave(d, _t('Đổi giọng')).then(function () { saved2(GC.ASSETS[a.key]); toast(_t('Đã lưu giọng của {name}.', { name: a.name })); }).catch(function (e) { toast(e.message); });
        } }, _t('Lưu giọng')) : null));
  }
  // ngôn ngữ + giọng vùng của tác phẩm (lưu trong tác phẩm: lang vi | en | zh, accent theo ngôn ngữ; thiếu thì tiếng Việt, giọng đầu tiên)
  function workLang(W) { var l = GC.voices.lang(W && W.lang); return { lang: l, accent: GC.voices.accent(l, W && W.accent) }; }
  // thẻ <html lang> của phim xuất theo ngôn ngữ phim (trình đọc màn hình + phông chữ + gợi ý dịch của trình duyệt): vi · en · zh-CN (phổ thông) · zh-TW (Đài Loan) · zh-HK (Quảng Đông)
  function htmlLang(L) { return L.lang === 'en' ? 'en' : L.lang === 'zh' ? (L.accent === 'tw' ? 'zh-TW' : 'zh-CN') : L.lang === 'yue' ? 'zh-HK' : 'vi'; }
  // gói âm (không phải khung) mà tác phẩm cần: thuộc dự án của tác phẩm, hoặc có âm được gọi tên trong lời thoại / gói động tác đi kèm — GC.sounds.bundleDeps, MỘT hàm
  // cho cả ba bộ đóng gói (phim xuất, sao lưu, gói bán — CNS-101)
  function filmSoundPacks(W, motionPacks) {
    var S = GC.sounds; if (!S) return [];
    var want = {}; S.bundleDeps({ shots: W.shots, motionPacks: motionPacks || [] }).packs.forEach(function (id) { want[id] = 1; });
    return S.packs().filter(function (p) { return !p.frame && (want[p.id] || (W.project && p.project === W.project)); }).map(function (p) { return S.pack(p.id); });
  }
  // mã engine nhúng / nạp theo phim: mọi <script src="engine|kinds/…"> của trang Studio, đúng thứ tự (studio/* — kể cả studio/video/* — KHÔNG bao giờ vào phim, CNS-228)
  function filmSrcs() { return Array.prototype.map.call(document.scripts, function (x) { return x.getAttribute('src') || ''; }).filter(function (x) { return /^(engine|kinds)\//.test(x); }); }
  // MỘT nguồn dữ liệu phim (CNS-219): phim HTML (exportFilm) và video (studio/video/client.js → trang xuất video) cùng lấy ở đây — asset tác phẩm dùng,
  // gói động tác / gói âm, giọng chốt, clip giọng AI đã có, ngôn ngữ phim, chữ trình phát theo ngôn ngữ giao diện LÚC XUẤT (CNS-224), danh sách mã engine.
  // pre (tuỳ chọn) = kết quả filmVoices đã hỏi (hộp "thiếu giọng AI" ở Sân khấu final) — khỏi hỏi lại.
  // → Promise<{ srcs, data, film, ui, dict, have, total }>   (phần gom asset chạy NGAY lúc gọi, như trước; phần giọng AI chờ filmVoices)
  function filmPayload(W, pre) {
    var L = workLang(W), chars = [], scenes = [];
    W.shots.forEach(function (s) { chars = chars.concat(GC.film.actors(s)); var sc = GC.film.scene(s); if (sc) scenes.push(sc); });
    var data = bundleOf(chars, [], scenes);
    // gói động tác có hành động phim dùng tới (đòn của bộ chủ đề) — đòn của khung đã nằm trong mã bộ phát
    var used = {}; W.shots.forEach(function (s) { ((s.event && s.event.steps) || []).forEach(function (st) { if (st.action) used[st.action] = 1; }); });
    data.motionPacks = GC.choreo ? GC.choreo.packs().filter(function (p) { return Object.keys(p.actions).some(function (k) { return used[k]; }); })
      .map(function (p) { var o = clone(p); ['pack', 'key', 'version', 'savedAt', 'note'].forEach(function (k) { delete o[k]; }); return o; }) : [];
    // gói âm phim dùng (v0.18): gói của dự án tác phẩm + gói gọi tên trong step.sfx / sự kiện của gói động tác đi theo — mở file:// vẫn nghe đúng; bộ chuẩn gen.am nằm sẵn trong engine/sounds.js
    data.soundPacks = filmSoundPacks(W, data.motionPacks); data.project = W.project || '';
    var srcs = filmSrcs();
    if (srcs.indexOf('engine/player.js') < 0) return Promise.reject(new Error(_t('Thiếu engine/player.js')));
    // kèm các clip giọng AI ĐÃ có của từng câu (hỏi "dry": không đọc mới, không tốn lượt) — phim mở bằng file:// vẫn có giọng AI, không gọi mạng
    return (pre ? Promise.resolve(pre) : filmVoices(W, L)).then(function (vo) {
      var pick = function (o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; };
      // motionPacks phải giữ lại ở đây: dựng lại `data` mà bỏ nó thì bộ phát không nạp gói nào và phim mất các chương dùng đòn của gói
      var out = { parts: data.parts, motionPacks: data.motionPacks, soundPacks: data.soundPacks, project: data.project, characters: data.characters.map(function (a) {
          // giọng chốt sẵn lúc xuất (nhân vật chưa lưu giọng thì lấy giọng Studio đang dùng — không xuất persona; vai giọng luôn chốt, vì phim không có persona để đoán lại)
          var o = pick(a, ['id', 'pack', 'name', 'version', 'look', 'expressions', 'kind', 'voice', 'role']);
          if (GC.audio) { var vv = GC.audio.voiceOf(a, L); o.voice = Object.assign({}, o.voice || vv); if (!o.voice.role && vv.role) o.voice.role = vv.role; }
          return o;
        }),
        items: data.items.map(function (x) { return pick(x, ['id', 'name', 'type', 'rarity', 'equip']); }),
        scenes: data.scenes.map(function (x) { return pick(x, ['id', 'name', 'layers', 'deco', 'palette', 'time', 'weather', 'spots']); }),
        lang: L.lang, accent: L.accent, voices: vo.voices, voiceTotal: vo.total };   // ngôn ngữ phim + clip giọng AI theo khoá GC.film.clipKey + tổng số câu (nhãn "Giọng AI 19/31")
      var film = { title: W.title, logline: W.logline || '', dialog: StagePref.get().dialog, shots: W.shots.map(function (s) { return { id: s.id, title: s.title, description: s.description || '', scene: s.scene, cast: s.cast, event: s.event }; }) };
      // NGÔN NGỮ (ADR 0007): chữ của trình phát theo ngôn ngữ giao diện LÚC XUẤT — chữ engine/player.js dịch lúc chạy bằng engine/i18n.js + bảng player / engine
      // (dict) nhúng kèm. Lời thoại, tên phim = nội dung người dùng: giữ nguyên. Video dùng CÙNG luật (CNS-224).
      var UI = I18N.lang();
      return { srcs: srcs, data: out, film: film, ui: UI, dict: Lang.playerDict(UI), have: vo.have, total: vo.total };
    });
  }
  // pre (tuỳ chọn) = kết quả filmVoices đã hỏi (hộp "thiếu giọng AI" ở Sân khấu final) — khỏi hỏi lại
  function exportFilm(W, pre) {
    var srcs = filmSrcs();
    if (srcs.indexOf('engine/player.js') < 0) { toast(_t('Thiếu engine/player.js')); return; }
    toast(_t('Đang đóng gói phim…'));
    Promise.all([Promise.all(srcs.map(function (f) { return fetch(f).then(function (r) { if (!r.ok) throw new Error(_t('Không tải được {f}', { f: f })); return r.text(); }); })), filmPayload(W, pre)])
      .then(function (res) {
        var texts = res[0], P = res[1], data = P.data, film = P.film, UI = P.ui, vo = { have: P.have, total: P.total };
        var safe = function (t) { return t.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'); };
        // chữ của trang phim (nút, nhãn) dịch ngay ở đây theo cùng ngôn ngữ UI của payload
        var vopt = [['auto', _t('Giọng: tự động')], ['tts', _t('Giọng: máy đọc')], ['blip', _t('Giọng: blip')], ['off', _t('Giọng: tắt')]];
        var TXT = { aiAuto: _t('Giọng: tự động (có giọng AI)'), aiNote: _t('Giọng AI {n}/{total}'), aiLack: _t('{n} câu chưa có giọng AI — phần còn lại đọc bằng giọng máy / blip.'),
          lines: _t('{n} lời thoại'), none: _t('Tác phẩm chưa có phân cảnh nào sẵn sàng.') };
        var html = '<!doctype html>\n<!--\n  ' + _t('Phim "{title}" — làm bằng gen-chibi.', { title: xml(W.title) }) + '\n  ' + _t('Bộ phát (engine/*, kinds/*) © 2026 Gen Labs — All rights reserved. Giấy phép: CHỈ ĐỂ XEM phim này.') + '\n  ' + _t('Không trích xuất, sao chép, sửa đổi hay tái sử dụng mã bộ phát cho mục đích khác.') + '\n  ' + _t('Riêng phông chữ lời thoại Be Vietnam Pro (engine/fonts.js) © 2021 The Be Vietnam Pro Project Authors — SIL Open Font License 1.1 (toàn văn nằm trong chính tệp này).') + '\n-->\n<html lang="' + htmlLang({ lang: data.lang, accent: data.accent }) + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + xml(W.title) + ' — gen-chibi</title>\n' +
          '<meta name="generator" content="gen-chibi ' + xml(String((Store.info || {}).version || '')) + ' · Gen Labs">\n<style>' + FILM_CSS + '</style>\n</head>\n<body>\n' +
          '<main class="film"><header><div><h1>' + xml(W.title) + '</h1><p>' + xml(W.logline || '') + '</p></div><span class="badge">' + xml(_t('{n} phân cảnh', { n: W.shots.length })) + '</span></header>\n' +
          '<div class="screen"><div id="stage"></div><button id="big" class="big" aria-label="' + xml(_t('Xem phim')) + '">▶</button></div>\n' +
          '<div class="bar"><button id="play">' + xml(_t('▶ Xem')) + '</button><button id="stop">' + xml(_t('■ Dừng')) + '</button><button id="full">' + xml(_t('⛶ Toàn màn hình')) + '</button><button id="mute" aria-label="' + xml(_t('Bật / tắt tiếng')) + '">🔊</button>' +
          '<select id="voice" aria-label="' + xml(_t('Giọng nhân vật')) + '">' + vopt.map(function (o) { return '<option value="' + o[0] + '">' + xml(o[1]) + '</option>'; }).join('') + '</select><span id="ainote" class="ainote" hidden></span>' +
          '<select id="dialog" aria-label="' + xml(_t('Kiểu lời thoại')) + '">' + DIALOG_MODES.map(function (m) { return '<option value="' + m[0] + '">' + xml(_t(m[1])) + '</option>'; }).join('') + '</select><span id="prog"></span></div>\n' +
          '<ol id="chapters"></ol>\n<footer>' + xml(_t('Làm bằng gen-chibi · Bộ phát © 2026 Gen Labs — chỉ để xem phim này')) + '</footer></main>\n' +
          texts.map(function (t, i) { return '<script>/* ' + srcs[i] + ' */\n' + safe(t) + '\n</script>'; }).join('\n') + '\n' +
          '<script>\n(function (I) { if (!I) return; I.add(' + jsonForScript(UI) + ', ' + jsonForScript(P.dict) + '); I.setLang(' + jsonForScript(UI) + '); })(window.GenChibi && window.GenChibi.i18n);\nvar TXT = ' + jsonForScript(TXT) + ';\n</script>\n' +
          '<script>\nvar DATA = ' + jsonForScript(data) + ';\nvar FILM = ' + jsonForScript(film) + ';\n' + FILM_BOOT + '\n</script>\n</body>\n</html>\n';
        var bytes = new Blob([html]).size, sz = bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
        download(slugify(W.title) + '.html', html, 'text/html');
        toast(_t('Đã xuất phim "{title}" ({sz}) · {have}/{total} câu có giọng AI{x} — mở bằng trình duyệt bất kỳ để xem.', { title: W.title, sz: sz, have: vo.have, total: vo.total, x: vo.total && vo.have < vo.total ? _t(' (câu còn lại dùng giọng máy đọc hoặc blip — bấm Lồng tiếng AI trước khi xuất để có đủ)') : '' }));
      }).catch(function (e) { toast(e.message); });
  }
  // lối vào xuất video (studio/video/client.js, nạp trước app.js): cùng filmPayload với phim HTML (CNS-219) + cùng cách đặt tên tệp
  if (window.GCVideo) window.GCVideo.studio = { payload: filmPayload, slug: slugify, voices: function (W) { return filmVoices(W, workLang(W)); } };

  /* ---- XUẤT VIDEO (v0.22 P3) — phần cấp module: một lượt xuất một lúc cho cả Studio (iframe ẩn + bộ mã hoá nặng). Trạng thái nằm ở đây, không ở trang
   * tác phẩm: rời trang rồi quay lại vẫn thấy tiến độ; xong khi đang ở trang khác thì tệp vẫn được lưu + báo toast. Bảng chọn / tiến độ vẽ ở workRoom. */
  var Vid = {
    job: null,     // { wid, title, phase 'run'|'done'|'error', prog, marks, frames, files, dir, base, fh, hidden, t0, opts, url, coverUrl, err }
    paint: null,   // hàm vẽ lại của trang tác phẩm đang mở (null khi không mở)
    pref: function () {
      var o = {}; try { o = JSON.parse(localStorage.getItem('gc-video-opts') || '{}') || {}; } catch (e) { /* hỏng: dùng mặc định */ }
      return { aspect: o.aspect === '9:16' ? '9:16' : '16:9', quality: o.quality === '720p' ? '720p' : '1080p', container: o.container === 'mp4' || o.container === 'webm' ? o.container : '' };
    },
    savePref: function (o) { try { localStorage.setItem('gc-video-opts', JSON.stringify({ aspect: o.aspect, quality: o.quality, container: o.container || '' })); } catch (e) { /* bộ nhớ đầy: bỏ qua */ } },
    redraw: function () { if (Vid.paint) Vid.paint(); }
  };
  var VFMT = { mp4: 'MP4 (H.264 + AAC)', webm: 'WebM (VP9 + Opus)' };
  // bộ mẫu Gen Labs: dự án mang dấu `sample` (cổng nhập gói mẫu đặt) hoặc là một bộ mẫu đi kèm (SAMPLES) — không đoán theo tiền tố id
  function isSampleProject(id) { var p = id && Projects.all().filter(function (x) { return x.id === id; })[0]; return !!(p && (p.sample || SAMPLES.some(function (S) { return S.id === p.id; }))); }
  function vSecs(s) { s = Math.max(1, Math.round(s)); return s < 90 ? _t('{n} giây', { n: s }) : _t('{n} phút', { n: Math.round(s / 6) / 10 }); }
  function vBytes(b) { return b >= 1048576 ? (b / 1048576).toFixed(b >= 104857600 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  // độ dài phim ƯỚC (giây) cho bảng chọn, từ kế hoạch của đạo diễn tự động (mỗi phân cảnh một tác vụ — đạo diễn một màn đấu ~80 ms). Hệ số khớp lượt dò của
  // hai bộ mẫu ±10 % (Fun Office 4 phân cảnh 70 s, Tam Quốc 6 phân cảnh 159 s). Độ dài THẬT đo ở lượt dò — trần độ dài kiểm lại ở đó (lỗi too-long).
  function filmSecEstimate(W) {
    var ok = GC.film.readiness(W).filter(function (x) { return x.ok; }), n = ok.length, sec = 2.4, i = 0;   // 2,4 s: thẻ kết
    return (function step() {
      if (i >= ok.length) return Promise.resolve(n ? sec : 0);
      var plan = GC.film.direct(ok[i++].shot, { project: W.project || '' });
      sec += 2.6 + (n > 1 ? 2.2 : 0);   // vào sân + thẻ tiêu đề phân cảnh (phim nhiều phân cảnh)
      ((plan && plan.beats) || []).forEach(function (b) { if (b.type === 'line') sec += (b.estimate || 1.6) + (b.hold || 0) + 0.9; else if (b.type === 'act') sec += 2.1; });
      return nextTask().then(step);
    })();
  }
  // hệ số thời gian xuất / độ dài phim, đo trên máy test (CNS-238): 1080p Fun Office 2,0–2,3× (4 phân cảnh 2,3×) · Tam Quốc 3,2–3,4× → 2,8;
  // 720p Fun Office 1,8–1,9× · Tam Quốc 2,6–2,7× → 2,2. Cộng ~10 s nạp trang xuất + lượt dò.
  function vEstimate(sec, q, container) {
    var hd = q !== '720p', mbps = (hd ? 8 : 5) + 0.16;
    return { wall: sec * (hd ? 2.8 : 2.2) + 10, bytes: sec * mbps * 1e6 / 8, limit: window.GCVideo ? GCVideo.limits({ container: container }, q) : 0 };
  }
  // tên tệp chưa có trong thư mục (không ghi đè video cũ): tên, tên-2, tên-3… — xét cả 4 đuôi
  // KHÔNG BAO GIỜ trả tên đã có: hết 50 số thì thử tên có dấu thời gian; vẫn trùng → lỗi (không ghi đè, và Huỷ không thể xoá nhầm video cũ của người dùng)
  function vUniqueBase(dir, base, exts) {
    function taken(b) { return Promise.all(exts.map(function (x) { return dir.getFileHandle(b + '.' + x).then(function () { return true; }, function (e) { return !(e && e.name === 'NotFoundError'); }); })).then(function (r) { return r.some(Boolean); }); }
    var k = 1;
    return (function next() {
      var b = k === 1 ? base : k <= 50 ? base + '-' + k : base + '-' + Date.now().toString(36) + (k > 51 ? '-' + k : '');
      return taken(b).then(function (t) { if (!t) return b; if (k > 53) throw new Error(_t('Thư mục đã có quá nhiều tệp tên "{base}" — chọn thư mục khác.', { base: base })); k++; return next(); });
    })();
  }
  function vWrite(dir, name, blob) { return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }); }); }); }
  function vVis() { var j = Vid.job; if (j && j.phase === 'run' && document.visibilityState === 'hidden') { j.hidden = true; Vid.redraw(); } }
  document.addEventListener('visibilitychange', vVis);
  // bắt đầu một lượt: dir = thư mục đã chọn lúc bấm (CNS-226) hoặc null (tải về khi xong). o: { aspect, quality, container, vo, estSec }
  function vStart(W, o, dir) {
    var ext = o.container, base = slugify(W.title) || 'video';
    var job = Vid.job = { wid: W.id, title: W.title, phase: 'run', prog: { phase: 'prepare' }, marks: null, frames: 0, dir: dir, base: base, fh: null, hidden: document.visibilityState === 'hidden', t0: Date.now(), opts: o, files: null };
    Vid.redraw();
    (dir ? vUniqueBase(dir, base, [ext, 'srt', 'jpg', 'txt']).then(function (b) { job.base = b; return dir.getFileHandle(b + '.' + ext, { create: true }); }) : Promise.resolve(null)).then(function (fh) {
      job.fh = fh; job.created = !!fh;   // tệp video DO LƯỢT NÀY tạo (tên đã kiểm là chưa có) — chỉ tệp này được gỡ khi Huỷ / lỗi
      if (job.cancelled) throw Object.assign(new Error(_t('Đã huỷ xuất video.')), { code: 'cancelled' });
      job.p = GCVideo.exportWork(W, { quality: o.quality, aspect: o.aspect, container: o.container, voices: o.vo || undefined, handle: fh || undefined, name: job.base, missingVoice: 'silent' }, function (m) {
        if (m.phase === 'measured') { job.marks = m.marks; job.frames = m.frames; job.durationMs = m.durationMs; }
        else job.prog = m;
        Vid.redraw();
      });
      return job.p;
    }).then(function (r) {
      job.result = r;
      var vf = r.files.filter(function (f) { return f.kind === 'video'; })[0], rest = r.files.filter(function (f) { return f !== vf; });
      job.files = r.files.map(function (f) { return { kind: f.kind, name: f.name, bytes: f.kind === 'video' ? (vf.bytes || (vf.blob && vf.blob.size) || 0) : f.blob.size, blob: f.blob }; });
      var save = dir ? rest.reduce(function (p, f) { return p.then(function () { return vWrite(dir, f.name, f.blob); }); }, Promise.resolve())
        : Promise.resolve().then(function () { r.files.forEach(function (f) { downloadBlob(f.name, f.blob); }); });
      return save.then(function () { return fhBlob(job, vf); });
    }).then(function (blob) {
      job.phase = 'done'; job.url = URL.createObjectURL(blob);
      var cv = job.files.filter(function (f) { return f.kind === 'cover'; })[0]; if (cv) job.coverUrl = URL.createObjectURL(cv.blob);
      toast(dir ? _t('Đã xuất video "{title}" — {n} tệp trong thư mục "{dir}".', { title: job.title, n: job.files.length, dir: dir.name }) : _t('Đã xuất video "{title}" — {n} tệp đã tải về.', { title: job.title, n: job.files.length }));
      Vid.redraw();
    }).catch(function (e) {
      // huỷ / lỗi: không để lại tệp dở trong thư mục đã chọn (spec §3) — CHỈ tệp lượt này tạo; trình duyệt có thể chưa nhả tệp ngay (luồng ghi vừa huỷ)
      // → thử lại một lần sau ~200 ms; vẫn không gỡ được thì nói thật tên tệp còn lại
      var name = job.base + '.' + ext;
      var rmOnce = function () { return dir.removeEntry(name).then(function () { return true; }, function (x) { return x && x.name === 'NotFoundError'; }); };
      var rm = dir && job.created && !job.result ? rmOnce().then(function (ok) { return ok || new Promise(function (r) { setTimeout(r, 200); }).then(rmOnce); }) : Promise.resolve(true);
      return rm.then(function (gone) {
        if (Vid.job !== job) return;
        if (e && e.code === 'cancelled') { Vid.job = null; toast(gone ? _t('Đã huỷ xuất video — không để lại tệp nào.') : _t('Đã huỷ xuất video — không xoá được tệp dở "{name}" trong thư mục "{dir}", hãy xoá tay.', { name: name, dir: dir.name })); }
        else { job.phase = 'error'; job.err = (e && e.message) || String(e); }
        Vid.redraw();
      });
    });
    function fhBlob(j, vf) { return vf.blob ? Promise.resolve(vf.blob) : j.fh.getFile(); }
  }
  function vCancel() { var j = Vid.job; if (!j || j.phase !== 'run') return; j.cancelled = true; if (j.p) j.p.cancel(); Vid.redraw(); }
  function vClose() { var j = Vid.job; if (!j || j.phase === 'run') return; if (j.url) URL.revokeObjectURL(j.url); if (j.coverUrl) URL.revokeObjectURL(j.coverUrl); Vid.job = null; Vid.redraw(); }
  // ảnh bìa mới từ khung đang dừng của trình xem thử (Q43 "Chọn khung khác") → ghi đè tệp bìa (thư mục) hoặc tải về
  function vCoverFrom(video) {
    var j = Vid.job; if (!j || j.phase !== 'done') return Promise.resolve();
    var c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    return new Promise(function (ok, no) { c.toBlob(function (b) { if (b) ok(b); else no(new Error(_t('Không dựng được ảnh bìa.'))); }, 'image/jpeg', 0.9); }).then(function (blob) {
      var name = j.base + '.jpg', f = j.files.filter(function (x) { return x.kind === 'cover'; })[0];
      if (!f) { f = { kind: 'cover', name: name }; j.files.push(f); }
      f.blob = blob; f.bytes = blob.size; f.at = video.currentTime;
      return (j.dir ? vWrite(j.dir, name, blob) : Promise.resolve(downloadBlob(name, blob))).then(function () {
        if (j.coverUrl) URL.revokeObjectURL(j.coverUrl);
        j.coverUrl = URL.createObjectURL(blob);
        toast(_t('Đã thay ảnh bìa bằng khung ở {t} s.', { t: video.currentTime.toFixed(1) }));
        Vid.redraw();
      });
    });
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
    '  GC.pack({ id: "local.my", name: "Của tôi", owner: "Người tạo", group: "mine", license: "Thuộc người tạo" }, function () {});',   // i18n-ignore(siêu dữ liệu gói trong phim, không hiện ra)
    '  DATA.parts.forEach(function (p) { GC.registerDataPart("local.my", p); });',
    '  DATA.items.forEach(function (x) { GC.registerItem("local.my", x); });',
    '  DATA.scenes.forEach(function (x) { GC.registerScene("local.my", x); });',
    '  DATA.characters.forEach(function (a) { GC.registerAsset(a.pack, a); });',
    '  (DATA.soundPacks || []).forEach(function (p) { if (GC.sounds) GC.sounds.registerPack(p); });',   // gói âm TRƯỚC gói động tác (sự kiện gọi tên âm)
    '  (DATA.motionPacks || []).forEach(function (m) { GC.choreo.registerPack("local.my", m); });',
    '  var rs = GC.film.readiness(FILM), ready = rs.filter(function (x) { return x.ok; }).map(function (x) { return x.shot; });',
    // giọng AI nhúng sẵn (DATA.voices: khoá câu → data: URI) chỉ dùng khi chọn "tự động"; chọn máy đọc / blip / tắt thì bỏ qua. Không gọi mạng.
    '  var VO = DATA.voices || {}, aiN = Object.keys(VO).length, aiT = DATA.voiceTotal || 0;',
    '  var F = GC.i18n ? GC.i18n.fmt : function (s) { return s; };',
    '  if (aiN) $("voice").options[0].text = TXT.aiAuto;',
    // chưa đủ clip: nhãn nhỏ cạnh ô Giọng nói rõ phần còn lại đọc bằng giọng máy / blip (chỉ khi đang ở "tự động" — chọn máy đọc / blip thì clip AI không dùng)
    '  function aiNote() { var n = $("ainote"), lack = aiT - aiN; n.hidden = !(aiN && lack > 0 && $("voice").value === "auto"); n.textContent = F(TXT.aiNote, { n: aiN, total: aiT }); n.title = F(TXT.aiLack, { n: lack }); }',
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
    '    t.textContent = (i + 1) + ". " + s.title; d.textContent = s.description || F(TXT.lines, { n: s.event.steps.length });',
    '    b.appendChild(t); b.appendChild(d); b.onclick = function () { play(i); window.scrollTo({ top: 0, behavior: "smooth" }); };',
    '    li.appendChild(b); $("chapters").appendChild(li);',
    '  });',
    '  if (!ready.length) $("prog").textContent = TXT.none;',
    '})();'
  ].join('\n');

  /* ---- Bảng bước (v0.16, Q9 — ADR 0006): soạn kịch bản phân cảnh KHÔNG cần AI ----
   * Mỗi hàng là một bước event.steps[i]. Mọi ô chọn sinh từ lược đồ đạo diễn GC.director.schema(dàn diễn viên) — không chép tay danh sách;
   * ô Hành động chỉ có đòn diễn viên của hàng làm được (GC.choreo.actionsFor ∩ lược đồ). Kiểm sống bằng GC.director.validate (cùng bộ kiểm
   * server dùng khi lưu); lưu qua đúng đường lưu phân cảnh (POST api/works/<id>/shots) — không có lối tắt bỏ cổng. */
  var CAMERA_LABEL = { auto: N_('Tự động'), wide: N_('Toàn cảnh'), two: N_('Hai người'), close: N_('Cận người nói') };
  var BUBBLE_LABEL = { say: N_('Nói'), shout: N_('Hét'), think: N_('Nghĩ'), whisper: N_('Thì thầm') };
  var FACING_LABEL = { left: N_('Quay trái'), right: N_('Quay phải') };
  // nhãn tiếng Việt của một giá trị trong lược đồ (giá trị lấy từ lược đồ; thiếu nhãn thì hiện id)
  function enumLabel(k, v) {
    var L = { state: LIB.states, activity: LIB.activities, posture: LIB.postures, move: LIB.moves, motion: LIB.motions, fx: LIB.fx, spot: GC.SCENE.spots }[k];
    if (L && L[v] && _l(L[v].label)) return _l(L[v].label);
    var M = { view: VIEW_LABEL, camera: CAMERA_LABEL, bubble: BUBBLE_LABEL, facing: FACING_LABEL }[k];
    if (M && M[v]) return _t(M[v]);
    if (k === 'react' && GC.choreo && GC.choreo.REACTS[v]) return _l(GC.choreo.REACTS[v].label);
    if (k === 'sfx' && GC.sounds && GC.sounds.has(v)) return GC.sounds.get(v).label;   // âm thanh: nhãn của thư viện âm
    return v;
  }
  // huy hiệu của một đòn: đòn đánh / ném / cần binh khí / nhắm đầu (dùng ở bảng bước và Thư viện › Động tác)
  function actionBadges(A) {
    if (!A) return [];
    var out = [];
    if (A.attack) out.push([_t('đòn đánh'), 'atk']);
    if (A.ranged) out.push([_t('ném'), 'rng']);
    if (A.needs) out.push([_t('cần binh khí'), 'need']);
    if (A.aim === 'head') out.push([_t('nhắm đầu'), '']);
    return out;
  }
  function badgeEls(A) { return actionBadges(A).map(function (b) { return h('span', { class: 'tag badge ' + b[1], text: b[0] }); }); }
  // cfg: { base: { title, description, scene, cast }, event, chars (diễn viên chọn được, đã xếp), save(shot) → Promise, close() }
  function stepSheet(cfg) {
    var C = GC.choreo, base = cfg.base, cast = base.cast.slice(), dirty = false, alive = true, warnTimer = 0, serverErrs = [];
    // rev tăng mỗi lần sửa: lưu xong chỉ xoá "chưa lưu" khi trong lúc chờ không sửa thêm; saving khoá nút Lưu suốt lúc chờ (không gửi đôi)
    var rev = 0, saving = false, downOnBack = false, warnSig = null, warnPend = null;
    var evTitle = (cfg.event && cfg.event.title) || base.title || _pt('số ít', 'Phân cảnh');
    var rows = cfg.event && Array.isArray(cfg.event.steps) ? clone(cfg.event.steps) : [];
    var scene = base.scene ? GC.getScene(base.scene, MY_PACK) : null;
    var MAX = 12, MORE = ['camera', 'bubble', 'activity', 'view', 'facing', 'posture', 'move', 'motion'], MORE_ARR = ['fx', 'sfx'];
    var COLS = [['actor', _t('Diễn viên')], ['state', _t('Biểu cảm')], ['say', _t('Lời thoại')], ['to', _t('Nói với')], ['spot', _t('Chỗ đứng')],
      ['action', _t('Hành động')], ['target', _t('Đối thủ')], ['react', _t('Phản ứng')], ['hold', _t('Giữ (s)')], ['more', _t('Thêm…')]];
    var SPAN = COLS.length + 2, opened = {}, idCells = [], errRows = [];
    function castAssets() { return cast.map(function (k) { return GC.ASSETS[k] || GC.getAsset(k, MY_PACK); }).filter(Boolean); }
    function assetOf(id) { return castAssets().filter(function (a) { return a.id === id; })[0] || null; }
    var SCH = null;   // thuộc tính của một bước trong lược đồ — tính lại khi đổi dàn diễn viên
    function schema() { SCH = GC.director.schema(castAssets(), typeof cfg.project === 'string' ? { project: cfg.project } : undefined).properties.steps.items.properties; }   // âm mời theo dự án của TÁC PHẨM (cùng danh sách S6 — CNS-104)
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
      var cs = castAssets(), all = cs.length ? GC.director.validate(eventNow(), cs) : [_t('Chọn ít nhất một diễn viên cho phân cảnh.')];
      if (scene && cs.length > scene.spots.length) all.push(_t('Bối cảnh "{name}" chỉ mở {n} chỗ đứng — bớt diễn viên.', { name: scene.name, n: scene.spots.length }));
      var byRow = rows.map(function () { return []; }), glob = [];
      // bộ kiểm báo lỗi theo đường dẫn máy "steps[i].trường: …" (i từ 0): đặt lỗi cạnh đúng hàng, lỗi chung / không khớp thì để ở đầu bảng
      all.forEach(function (m) { var x = /^steps\[(\d+)\](?:\.[A-Za-z]+)?: (.*)$/.exec(m); if (x && byRow[+x[1]]) byRow[+x[1]].push(x[2]); else glob.push(m); });
      return { total: all.length, rows: byRow, global: glob };
    }
    // ---- khung
    var castBox = h('div', { class: 'fxchips' }), globBox = h('div'), warnBox = h('div', { class: 'stack', style: 'gap:4px' });
    var table = h('table', { class: 'grid stepgrid' }), foot = h('div', { class: 'row note' });
    var addB = h('button', { class: 'btn sm', onclick: function () { addRow(); } }, _t('+ Thêm bước'));
    var saveB = h('button', { class: 'btn sm primary', onclick: save }, _t('Lưu bước'));
    var el = h('div', { class: 'sheet-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': _t('Bảng bước · {title}', { title: base.title }), onmousedown: function (ev) { downOnBack = ev.target === el; },
      // chỉ đóng khi nhấn xuống VÀ nhả đều ở nền: kéo bôi chữ trong ô rồi nhả ra ngoài thì "click" rơi vào nền nhưng không được đóng
      onclick: function (ev) { var ok = downOnBack && ev.target === el; downOnBack = false; if (ok) close(); } },
      h('div', { class: 'panel sheet' },
        h('h3', null, _t('Bảng bước'), h('span', { class: 'note', style: 'text-transform:none;letter-spacing:0', text: base.title }),
          h('span', { class: 'r row', style: 'gap:6px' }, addB, saveB, h('button', { class: 'btn sm', onclick: function () { close(); } }, _t('Đóng')))),
        h('div', { class: 'pad stack', style: 'gap:10px' },
          h('div', { class: 'row', style: 'gap:6px' }, h('b', { class: 'note', text: _t('Dàn diễn viên') }), castBox,
            h('span', { class: 'note', style: 'margin-left:auto', text: scene ? _t('Bối cảnh: {name} · {n} chỗ đứng', { name: scene.name, n: scene.spots.length }) : _t('Chưa chọn bối cảnh — chọn ở phân cảnh để dùng "Chỗ đứng".') })),
          h('div', { class: 'note', text: _t('Soạn không cần AI: mỗi hàng một bước. Ô chọn lấy từ lược đồ đạo diễn; "Hành động" chỉ có đòn diễn viên của hàng làm được. Đòn đánh cần đối thủ; phản ứng là của đối thủ.') }),
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
      var s = h('select', { 'data-cell': i + ':' + k, 'aria-label': _t('{label} · bước {n}', { label: label, n: i + 1 }), disabled: off ? true : null, title: title || null, onchange: function () { onPick(s.value); } });
      var groups = {};
      opts.forEach(function (o) {
        var op = h('option', { value: o[0], text: o[1] });
        if (!o[2]) { s.appendChild(op); return; }
        if (!groups[o[2]]) { groups[o[2]] = h('optgroup', { label: o[2] }); s.appendChild(groups[o[2]]); }
        groups[o[2]].appendChild(op);
      });
      if (cur && !opts.some(function (o) { return o[0] === cur; })) s.appendChild(h('option', { value: cur, text: '⚠ ' + (bad ? bad(cur) : _t('{cur} (không hợp lệ)', { cur: cur })) }));
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
        return [k, _lo(X, X.label) + (X.ranged ? _t(' · ném') : '') + (X.needs ? _t(' · cần binh khí') : ''), X.attack ? _t('Đòn đánh') : _t('Động tác')];
      });
      var say = h('input', { type: 'text', 'data-cell': i + ':say', value: r.say || '', maxlength: 120, placeholder: A ? _t('(ra đòn không hô)') : _t('Lời thoại…'), 'aria-label': _t('Lời thoại · bước {n}', { n: i + 1 }),
        oninput: function () { r.say = say.value; touch(); check(); } });
      var hold = h('input', { type: 'number', 'data-cell': i + ':hold', min: 0.8, max: 6, step: 0.1, value: r.hold != null ? r.hold : '', placeholder: '—', title: _t('Giữ khung 0,8–6 giây; bỏ trống = tự động theo độ dài câu'), 'aria-label': _t('Giữ khung (giây) · bước {n}', { n: i + 1 }),
        oninput: function () { var v = parseFloat(hold.value); if (hold.value === '' || !isFinite(v)) delete r.hold; else r.hold = Math.round(v * 10) / 10; touch(); check(); } });
      var atk = !!(A && A.attack), spots = scene ? (SCH.spot.enum || []).filter(function (k) { return scene.spots.indexOf(k) >= 0; }) : [];
      var nMore = moreCount(r);
      return {
        actor: pick(i, 'actor', _t('Diễn viên'), (SCH.actor.enum || []).map(function (id) { return [id, nameOf(id)]; }), r.actor, function (v) { set(i, 'actor', v); }, false, null, function (v) { return _t('{v} (không có trong dàn)', { v: v }); }),
        state: pick(i, 'state', _t('Biểu cảm'), enumOpts('state'), r.state, function (v) { set(i, 'state', v); }),
        say: say,
        to: pick(i, 'to', _t('Nói với'), [['', _t('— tự động —')]].concat(others(r.actor).map(function (id) { return [id, nameOf(id)]; })), r.to || '', function (v) { set(i, 'to', v); }),
        spot: pick(i, 'spot', _t('Chỗ đứng'), [['', scene ? _t('— giữ chỗ —') : _t('— cần bối cảnh —')]].concat(enumOpts('spot', spots)), r.spot || '', function (v) { set(i, 'spot', v); }, !scene && !r.spot, scene ? null : _t('Chọn bối cảnh cho phân cảnh trước')),
        action: h('div', { class: 'actcell' },
          pick(i, 'action', _t('Hành động'), [['', _t('— không —')]].concat(acts), r.action || '', function (v) { set(i, 'action', v); }, false,
            who ? _t('{name} làm được {n} đòn{x}', { name: who.name, n: acts.length, x: C && !C.hasWeapon(who) ? _t(' (tay không — đòn binh khí bị ẩn)') : '' }) : null,
            function (v) { var X = C && C.ACTIONS[v]; return X ? _t('{label} — {x} không làm được', { label: _lo(X, X.label), x: who ? who.name : _t('người này') }) : _t('{v} — chưa có đòn này', { v: v }); }),
          A ? h('span', { class: 'badges' }, badgeEls(A)) : null),
        target: pick(i, 'target', _t('Đối thủ'), [['', atk ? _t('— chọn đối thủ —') : _t('— chỉ cho đòn đánh —')]].concat(atk ? others(r.actor).map(function (id) { return [id, nameOf(id)]; }) : []), r.target || '', function (v) { set(i, 'target', v); }, !atk && !r.target),
        react: pick(i, 'react', _t('Phản ứng'), [['', r.target ? _t('— mặc định: {enumLabel} —', { enumLabel: enumLabel('react', 'hit') }) : _t('— cần đối thủ —')]].concat(r.target ? enumOpts('react') : []), r.react || '', function (v) { set(i, 'react', v); }, !r.target && !r.react),
        hold: hold,
        more: h('button', { class: 'btn sm more' + (nMore ? ' on' : ''), 'data-cell': i + ':more', 'aria-expanded': String(!!opened[i]), title: moreTitle(r) || _t('Máy quay, bong bóng, hoạt động, góc nhìn, hiệu ứng, âm thanh…'), onclick: function () { opened[i] = !opened[i]; paint(); } }, nMore ? _t('thêm · {nMore}', { nMore: nMore }) : _t('thêm…'))
      };
    }
    // hàng "thêm…": các ô ít dùng — vẫn sinh từ lược đồ
    function moreRow(r, i) {
      var box = h('div', { class: 'moregrid' });
      MORE.forEach(function (k) {
        if (!SCH[k]) return;
        box.appendChild(h('label', { class: 'fld' }, h('span', { class: 'note', text: { camera: _t('Máy quay'), bubble: _t('Bong bóng'), activity: _t('Hoạt động'), view: _t('Góc nhìn'), facing: _t('Hướng'), posture: _t('Tư thế'), move: _t('Di chuyển'), motion: _t('Động tác tay') }[k] || k }),
          pick(i, k, k, [['', _t('— tự động —')]].concat(enumOpts(k)), r[k] || '', function (v) { set(i, k, v); })));
      });
      MORE_ARR.forEach(function (k) {
        if (!SCH[k]) return;
        var cur = (r[k] || []).slice(), chips = h('div', { class: 'fxchips' }), max = SCH[k].maxItems || 3;
        (SCH[k].items.enum || []).forEach(function (v) {
          chips.appendChild(h('button', { 'aria-pressed': String(cur.indexOf(v) >= 0), 'data-chip': i + ':' + k + ':' + v, onclick: function () {
            var j = cur.indexOf(v); if (j >= 0) cur.splice(j, 1); else if (cur.length < max) cur.push(v); else { toast(_t('Tối đa {max} mục.', { max: max })); return; }
            set(i, k, cur);
          } }, enumLabel(k, v)));
        });
        box.appendChild(h('div', { class: 'fld wide' }, h('span', { class: 'note', text: _t('{x} (tối đa {max})', { x: k === 'fx' ? _t('Hiệu ứng') : _t('Âm thanh'), max: max }) }), chips));
      });
      return h('tr', { class: 'morerow' }, h('td', { class: 'id' }), h('td', { colspan: SPAN - 1 }, box));
    }
    function paintCast() {
      clear(castBox);
      cfg.chars.forEach(function (a) {
        var on = cast.indexOf(a.key) >= 0;
        castBox.appendChild(h('button', { 'aria-pressed': String(on), title: a.key + (C && C.hasWeapon(a) ? _t(' · có binh khí') : ''), onclick: function () {
          var j = cast.indexOf(a.key);
          if (j >= 0) cast.splice(j, 1); else if (cast.length < 8) cast.push(a.key); else { toast(_t('Tối đa 8 diễn viên một cảnh.')); return; }
          touch(); schema(); paintCast(); paint();
        } }, _lo(a, a.name)));
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
      var hd = h('tr', null, h('th', { text: _t('Bước') }));
      COLS.forEach(function (c) { hd.appendChild(h('th', { class: 'c-' + c[0], text: c[1] })); });
      hd.appendChild(h('th', { text: '' }));
      table.appendChild(lt); table.appendChild(hd);
      rows.forEach(function (r, i) {
        var cells = cellsOf(r, i), idc = h('td', { class: 'id', text: 'B' + String(i + 1).padStart(2, '0') });
        var tr = h('tr', { 'data-step': String(i) }, idc);
        COLS.forEach(function (c) { tr.appendChild(h('td', { class: 'c-' + c[0] }, cells[c[0]])); });
        tr.appendChild(h('td', { class: 'ops' },
          h('button', { class: 'btn sm ic', 'data-op': 'up', disabled: i ? null : true, title: _t('Lên'), 'aria-label': _t('Đưa bước {n} lên', { n: i + 1 }), onclick: function () { move(i, -1); } }, '↑'),
          h('button', { class: 'btn sm ic', 'data-op': 'down', disabled: i < rows.length - 1 ? null : true, title: _t('Xuống'), 'aria-label': _t('Đưa bước {n} xuống', { n: i + 1 }), onclick: function () { move(i, 1); } }, '↓'),
          h('button', { class: 'btn sm ic danger', disabled: rows.length > 1 ? null : true, title: _t('Xoá bước'), 'aria-label': _t('Xoá bước {n}', { n: i + 1 }), onclick: function () { rows.splice(i, 1); opened = {}; touch(); paint(); focusRow(Math.min(i, rows.length - 1)); } }, '✕')));
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
        idc.title = list.length ? _t('{n} lỗi', { n: list.length }) : '';
        clear(er.lastChild);
        if (list.length) er.lastChild.appendChild(h('ul', { class: 'errs' }, list.map(function (m) { return h('li', { text: '✗ ' + m }); })));
        er.hidden = !list.length;
      });
      clear(globBox);
      var g = E.global.concat(serverErrs);
      if (g.length) globBox.appendChild(h('div', { class: 'banner bad' }, h('ul', { class: 'errs', style: 'margin:0' }, g.slice(0, 12).map(function (m) { return h('li', { text: '✗ ' + m }); }))));
      clear(foot);
      foot.appendChild(h('span', { class: 'mono', text: _t('{n} / {MAX} bước', { n: rows.length, MAX: MAX }) }));
      foot.appendChild(E.total ? h('span', { class: 'chip bad', text: _t('✗ {total} lỗi', { total: E.total }) }) : h('span', { class: 'chip ok', text: _t('✓ Hợp lệ theo lược đồ đạo diễn') }));
      foot.appendChild(h('span', { class: dirty ? 'chip warn' : 'chip', text: dirty ? _t('Chưa lưu') : _t('Đã lưu') }));
      saveB.disabled = !!E.total || saving;
      saveB.title = saving ? _t('Đang lưu…') : E.total ? _t('Sửa {total} lỗi trước khi lưu', { total: E.total }) : _t('Lưu phân cảnh (server kiểm lại bằng cùng cổng)');
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
      catch (e) { ws = [_t('dựng thử lỗi: {message}', { message: e.message })]; }
      clear(warnBox);
      ws.forEach(function (w) { warnBox.appendChild(h('div', { class: 'note warn', text: '⚠ ' + w })); });
    }
    function save() {
      if (saving || errorsNow().total) { check(); return; }
      var at = rev, n = rows.length;   // bản đang gửi = bản ở thời điểm bấm (cleanSteps chạy ngay bên dưới)
      saving = true; saveB.disabled = true; saveB.textContent = _t('Đang lưu…');
      cfg.save({ title: base.title, description: base.description, scene: base.scene, cast: cast.slice(), event: { title: evTitle, steps: cleanSteps() } })
        .then(function () {
          saving = false;
          if (!alive) return;
          if (rev === at) { dirty = false; serverErrs = []; toast(_t('Đã lưu {n} bước của "{title}".', { n: n, title: base.title })); }
          else toast(_t('Đã lưu bản lúc bấm — bạn vừa sửa thêm, phần mới vẫn chưa lưu.'));   // sửa trong lúc chờ: giữ "chưa lưu" (không mất chữ âm thầm)
        })
        .catch(function (e) { saving = false; if (!alive) return; serverErrs = (e && e.errors) || (e ? [e.message] : []); })
        .then(function () { if (!alive) return; saveB.textContent = _t('Lưu bước'); check(); });
    }
    function close() {
      if (!alive) return;
      if (dirty && !window.confirm(_t('Bảng bước còn thay đổi chưa lưu. Đóng và bỏ thay đổi?'))) return;
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
  var WORK_TABS = [['script', N_('Kịch bản')], ['shots', N_('Phân cảnh')], ['review', N_('Xem & duyệt')], ['voice', N_('Giọng & âm thanh')], ['publish', N_('Xuất bản')]];
  var REVIEW_ST = [['draft', N_('Nháp')], ['fix', N_('Cần sửa')], ['ok', N_('Đạt')]];
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
    if (!w.shots) return [_t('Trống'), 'chip', 'empty'];
    if (w.reviewFix) return [_t('Cần sửa'), 'chip warn', 'fix'];
    if (w.reviewOk === w.shots) return [_t('Đã duyệt'), 'chip ok', 'ok'];
    if (w.done < w.shots) return [_t('Đang soạn'), 'chip info', 'draft'];
    return [_t('Chờ duyệt'), 'chip', 'wait'];
  }
  var WORK_STATUS = [['*', N_('Mọi trạng thái')], ['empty', N_('Trống')], ['draft', N_('Đang soạn')], ['wait', N_('Chờ duyệt')], ['fix', N_('Cần sửa')], ['ok', N_('Đã duyệt')]];
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
    if (st.action) o.push(_t('đòn {x}{x2}', { x: (GC.choreo && GC.choreo.ACTIONS[st.action] && _lo(GC.choreo.ACTIONS[st.action], GC.choreo.ACTIONS[st.action].label)) || st.action, x2: st.target ? ' → ' + nameOf(st.target) : '' }));
    if (st.spot) o.push(_t('chỗ {spot}', { spot: st.spot }));
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
  function secLabel(t) { return t >= 60 ? _t('{floor} phút {n} s', { floor: Math.floor(t / 60), n: Math.round(t % 60) }) : '≈ ' + (t < 10 ? dec(t.toFixed(1)) : Math.round(t)) + ' s'; }

  /* ---- Danh sách tác phẩm ---- */
  function worksList(r) {
    crumbs([{ t: _t('Tác phẩm') }]);
    setHash('', !!location.hash);   // từ một phòng ra danh sách: thêm một mục lịch sử để Back quay lại đúng phòng
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: _t('Khu Tạo tác (tác phẩm, AI đạo diễn) chạy ở bản cài trên máy.') })); return; }
    dockObj('project', null);
    // r.project chỉ dùng một lần (vào từ một dự án) — không lưu vào route để lần mở sau không hỏi lại
    var entryProj = r.project; delete r.project; saveRoute();
    var q = '', fp = entryProj != null ? entryProj : '*', fst = '*', list = [], nProj = entryProj != null ? entryProj : lastProject(), alive = true;
    onLeave(function () { alive = false; });
    var search = h('input', { type: 'search', 'aria-label': _t('Tìm tác phẩm'), placeholder: _t('Tìm: tên, id, dự án…'), style: 'width:240px', oninput: function () { q = norm(search.value.trim()); paint(); } });
    var projF = h('select', { 'aria-label': _t('Lọc theo dự án'), onchange: function () { fp = projF.value; paint(); } });
    var stF = h('select', { 'aria-label': _t('Lọc theo trạng thái'), onchange: function () { fst = stF.value; paint(); } });
    WORK_STATUS.forEach(function (s) { stF.appendChild(h('option', { value: s[0], text: _t(s[1]) })); });
    var nTitle = h('input', { type: 'text', 'aria-label': _t('Tên tác phẩm mới'), placeholder: _t('Tên tác phẩm mới'), maxlength: 80, style: 'width:200px', onkeydown: function (ev) { if (ev.key === 'Enter') create(); } });
    function create() {
      if (!nTitle.value.trim()) { nTitle.focus(); return; }
      // lang: lời thoại của tác phẩm mới = ngôn ngữ giao diện đang dùng (CNS-151; đổi sau ở tab Giọng & âm thanh)
      Store.api('POST', 'api/works', { title: nTitle.value.trim(), project: nProj, lang: I18N.lang() }).then(function (w) { nTitle.value = ''; if (nProj) setLastProject(nProj); openWork(w.id, 'script'); }).catch(function (e) { toast(e.message); });
    }
    actions(h('button', { class: 'btn primary', onclick: function () { nTitle.focus(); } }, _t('+ Tác phẩm mới')));
    var table = h('table', { class: 'grid worklist' }), foot = h('div', { class: 'row note' }), box = h('div', { class: 'panel scroll' }, table);
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'row toolbar' }, search, projF, stF, h('span', { class: 'note', id: 'workCount' })),
      h('div', { class: 'row toolbar newwork' }, h('span', { class: 'note', text: _t('Tác phẩm mới:') }), nTitle, projectSelect(nProj, function (v) { nProj = v; }), h('button', { class: 'btn primary', onclick: create }, _t('Tạo tác phẩm'))), box, foot));
    function fillProj() {
      clear(projF);
      projF.appendChild(h('option', { value: '*', text: _t('Mọi dự án') }));
      var ids = {}; list.forEach(function (w) { ids[w.project || ''] = 1; });
      Projects.all().forEach(function (p) { projF.appendChild(h('option', { value: p.id, text: _lo(p, p.name) })); delete ids[p.id]; });
      Object.keys(ids).forEach(function (id) { projF.appendChild(h('option', { value: id, text: id ? Projects.name(id) : _t('Chưa xếp dự án') })); });
      projF.value = fp; if (projF.value !== fp) { fp = '*'; projF.value = '*'; }
    }
    function paint() {
      clear(table); clear(foot);
      var cols = ['ID', _t('Tên tác phẩm'), _t('Dự án'), _t('Cảnh'), _t('Đạt'), _t('Giọng AI'), _pt('cột', 'Cập nhật'), _t('Trạng thái')];
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
          h('td', { class: 'v num', text: w.shots + (w.shots && w.done < w.shots ? _t(' ({done} có lời)', { done: w.done }) : '') }),
          h('td', { class: 'v num' }, w.shots ? h('span', { class: 'chip ' + (w.reviewOk === w.shots ? 'ok' : ''), title: _t('Số cảnh đã duyệt "Đạt" / tổng số cảnh'), text: w.reviewOk + '/' + w.shots }) : h('span', { class: 'muted', text: '—' })),
          h('td', { class: 'v num', title: _t('Số câu thoại đã lồng tiếng AI / tổng số câu (lưu sẵn, đọc lại không tốn lượt)') }, w.voiceTotal ? h('span', { class: 'chip ' + (w.voiceDone === w.voiceTotal ? 'ok' : ''), text: w.voiceDone + '/' + w.voiceTotal }) : h('span', { class: 'muted', text: '—' })),
          h('td', { class: 'nw', text: clockOf(w.savedAt) }),
          h('td', null, h('span', { class: st[1], text: st[0] }), w.proposals ? h('span', { class: 'chip warn', style: 'margin-left:4px', title: _t('AI đã đề xuất sửa, chờ bạn duyệt'), text: _t('{proposals} đề xuất', { proposals: w.proposals }) }) : null));
        table.appendChild(tr);
      });
      if (!rows.length) table.appendChild(h('tr', null, h('td', { colspan: cols.length, class: 'empty', text: list.length ? _t('Không có tác phẩm nào khớp bộ lọc.') : _t('Chưa có tác phẩm nào. Đặt tên ở ô phía trên rồi bấm "+ Tác phẩm mới" — hoặc mở dự án mẫu ở Thư viện để thấy trọn một phim.') })));
      $('workCount').textContent = _t('{n} / {n2} tác phẩm', { n: rows.length, n2: list.length });
      foot.appendChild(h('span', { class: 'mono', text: _t('{n} tác phẩm · {sh} cảnh', { n: rows.length, sh: sh }) }));
      foot.appendChild(h('span', { class: 'mono', text: _t('Đạt {ok}/{sh}', { ok: ok, sh: sh }) }));
    }
    function load() {
      return Store.api('GET', 'api/works').then(function (l) {
        if (!alive) return;
        list = l; fillProj(); paint();
        var ofProj = entryProj ? l.filter(function (w) { return w.project === entryProj; })[0] : null;
        // vào từ một dự án chưa có tác phẩm: gợi ý đặt tên (dự án đã chọn sẵn); đã có đúng một thì mở luôn
        if (entryProj && !ofProj) { nTitle.focus(); toast(_t('Đặt tên tác phẩm mới cho dự án {name} rồi bấm "+ Tác phẩm mới".', { name: Projects.name(entryProj) })); }
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
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: _t('Khu Tạo tác (tác phẩm, AI đạo diễn) chạy ở bản cài trên máy.') })); crumbs([{ t: _t('Tác phẩm') }]); return; }
    var W = null, tab = WORK_TABS.some(function (t) { return t[0] === r.tab; }) ? r.tab : 'shots', curShot = r.shot || '', soundWarn = [], propErr = {}, noteDraft = {}, openSteps = {};
    var tabBtns = {}, panels = {};
    crumbs([{ t: _t('Tác phẩm'), go: { page: 'works' } }, { t: r.work }]);
    actions(h('button', { class: 'btn', onclick: function () { setHash('', true); go({ page: 'works' }); } }, _t('‹ Danh sách tác phẩm')));
    route.work = r.work; route.tab = tab;
    // bản nháp chưa lưu (kịch bản + từng phân cảnh): vẽ lại sau chat / lưu cảnh khác không được xoá chữ đang gõ dở
    var draftScript = null, drafts = {}, alive = true;
    var logline = h('input', { type: 'text', maxlength: 300, placeholder: _t('Logline — một câu tóm tắt'), style: 'width:100%', oninput: function () { draftScript = { logline: logline.value, script: script.value }; } });
    var script = h('textarea', { rows: 6, maxlength: 8000, placeholder: _t('Kịch bản tổng (văn xuôi). AI đạo diễn đọc mục này để chia phân cảnh.'), oninput: function () { draftScript = { logline: logline.value, script: script.value }; } });
    var shotsBox = h('div', { class: 'shotlist' }), evPanel = h('div');
    var prog = h('span', { class: 'note mono', text: _t('Chưa diễn') }), stage = h('div'), readyBox = h('div', { class: 'ready' });
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
    if (AiVoice.on()) AiVoice.load(true).then(function () { if (alive) { paintDub(); paintVoiceTable(); } });

    // NGÔN NGỮ PHIM (lưu trong tác phẩm: lang + accent) — giọng máy đọc, giọng AI và Lồng tiếng AI đọc theo ngôn ngữ này; lời thoại phải viết đúng ngôn ngữ đã chọn
    var langSel = h('select', { 'aria-label': _t('Ngôn ngữ phim'), title: _t('Ngôn ngữ + giọng vùng của phim: giọng máy đọc, giọng AI và Lồng tiếng AI đọc theo đây. Lời thoại phải viết đúng ngôn ngữ đã chọn.'), onchange: function () { saveLang(langSel.value); } });
    GC.voices.langList().forEach(function (l) { l.accents.forEach(function (ac) { langSel.appendChild(h('option', { value: l.id + '|' + ac.id, text: _t('Ngôn ngữ: {label} · {label2}', { label: _l(l.label), label2: _l(ac.label) }) })); }); });
    var langNote = h('span', { class: 'note', text: _t(LANG_NOTE) });
    // LỒNG TIẾNG AI: đọc lần lượt mọi câu bằng giọng AI Google và lưu lại (câu đã đọc thì nhanh, không tốn lại)
    var dubB = h('button', { class: 'btn sm primary', onclick: function () { if (dubbing) dubCancel = true; else startDub(); } }, _t('Lồng tiếng AI')), dubNote = h('span', { class: 'note' });
    var dubBox = h('div', { class: 'readybar dubbar', hidden: true }), dubbing = false, dubCancel = false, dubSt = null;
    var castNote = h('div', { class: 'note warn', role: 'status', hidden: true });   // "N diễn viên vượt 48 chưa có giọng AI"
    var exportBox = h('div', { class: 'stack', style: 'gap:6px', hidden: true }), exportBusy = false;   // hộp "còn N/M câu chưa có giọng AI" khi bấm Phim (HTML)
    // GIỌNG VÙNG THẬT (Q14): Google chỉ cho giọng Bắc / Trung / Nam, Đài Loan… đúng chất qua "Thiết kế giọng" từng vai — bấm tay, báo trước số lượt
    var regionNote = h('span', { class: 'note', role: 'status', title: _t('Google chỉ cho giọng vùng thật khi Thiết kế giọng từng vai (mỗi vai 1 lượt, ~25 giây). Giọng có sẵn / thư viện tiếng Việt đọc giọng chung — không phân Bắc / Trung / Nam. Anh Mỹ / Anh Anh có thư viện riêng.') });
    var regionB = h('button', { class: 'btn sm', onclick: function () { designAsk = true; paintRegion(); var go1 = regionBox.querySelector('button.primary'); if (go1) go1.focus(); } }, _t('Thiết kế giọng vùng cho các vai'));
    var regionBox = h('div', { class: 'stack', style: 'gap:6px', hidden: true }), designing = false, designCancel = false, designSt = null, designAsk = false;

    var langSel2 = h('select', { 'aria-label': _t('Ngôn ngữ lời thoại'), title: _t('Ngôn ngữ + giọng vùng của phim — lời thoại phải viết đúng ngôn ngữ đã chọn'), onchange: function () { saveLang(langSel2.value); } });
    GC.voices.langList().forEach(function (l) { l.accents.forEach(function (ac) { langSel2.appendChild(h('option', { value: l.id + '|' + ac.id, text: _l(l.label) + ' · ' + _l(ac.label) })); }); });
    var langNote2 = h('span', { class: 'note', text: _t(LANG_NOTE) });
    var castBox = h('div'), headBox = h('div', { class: 'roomhead' }), reviewList = h('div', { class: 'stack' }), voiceBox = h('div', { class: 'stack' }), soundBox = h('div', { class: 'stack' });
    var allNote = h('textarea', { rows: 2, maxlength: 600, 'aria-label': _t('Ghi chú chung khi duyệt phim'), placeholder: _t('Ghi chú chung cho cả phim (nhịp, giọng, âm thanh…) — AI đọc được qua get_work › review.note'), onblur: function () { if (W && allNote.value.trim() !== ((W.review && W.review.note) || '')) saveReviewNote(); } });
    var sumBadge = h('span', { class: 'chip', role: 'status' });
    function nameOfActor(id) { var a = (W && AiVoice.actorsOf(W).filter(function (x) { return x.id === id; })[0]) || null; return a ? a.name : id; }
    function dockWork() {
      if (!W) return;
      if (window.GCDock) { window.GCDock.workChanged(W); window.GCDock.ctx({ object: { kind: 'work', id: W.id, label: W.title }, tab: tab, tabLabel: _t(WORK_TABS.filter(function (t) { return t[0] === tab; })[0][1]), shot: curShot, shotLabel: shotLabelOf(curShot) }); }
    }
    function shotLabelOf(id) { var i = W ? W.shots.findIndex(function (s) { return s.id === id; }) : -1; return i >= 0 ? _t('Cảnh {n}', { n: i + 1 }) : ''; }
    function setShot(id) { if (curShot === id) return; curShot = id; route.shot = id; saveRoute(); dockWork(); Array.prototype.forEach.call(document.querySelectorAll('.shot.sel'), function (e) { e.classList.remove('sel'); }); var e = document.getElementById('shot-' + id); if (e) e.classList.add('sel'); }

    /* -- tab bar -- */
    var tabbar = h('div', { class: 'tabs roomtabs', role: 'tablist', 'aria-label': _t('Các phần của tác phẩm') });
    WORK_TABS.forEach(function (t, i) {
      var b = h('button', { role: 'tab', id: 'wtab-' + t[0], 'data-tab': t[0], 'aria-selected': 'false', 'aria-controls': 'wpanel-' + t[0], tabindex: '-1', onclick: function () { setTab(t[0]); },
        onkeydown: function (ev) {
          var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          ev.preventDefault(); var n = WORK_TABS[(i + d + WORK_TABS.length) % WORK_TABS.length][0]; setTab(n); tabBtns[n].focus();
        } }, _t(t[1]), h('span', { class: 'n' }));
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
      tabBtns.shots.lastChild.textContent = W.shots.length + (np ? _t(' · {np} đề xuất', { np: np }) : '');
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
      Store.api('POST', 'api/works', { id: W.id, review: { note: allNote.value.trim() } }).then(function (w) { W = w; dockWork(); toast(_t('Đã lưu ghi chú chung.')); }).catch(function (e) { toast(e.message); });
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
            h('span', { text: e.title || e.id }), h('span', { class: 'note', text: _t('{steps} bước · {x}', { steps: e.steps, x: e.author || '' }) }),
            h('button', { class: 'btn sm', onclick: function () {
              if (!W) { toast(_t('Mở hoặc tạo tác phẩm trước.')); return; }
              Store.api('GET', 'api/events/' + e.id).then(function (rec) {
                var ev = rec.event, ids = ev.steps.map(function (x) { return x.actor; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
                var cast = ids.map(function (id) { var a = GC.getAsset(id, MY_PACK); return a && a.key; }).filter(Boolean);
                return saveShot({ shot: { title: ev.title, description: _t('Từ kịch bản lẻ "{title}" ({x})', { title: ev.title, x: rec.author || 'agent' }), scene: ev.scene || (GC.scenes()[0] || {}).key || '', cast: cast, event: ev } });
              }).then(function () { toast(_t('Đã thêm "{x}" thành phân cảnh.', { x: e.title || e.id })); }).catch(function (x) { if (x) toast(x.message); });
            } }, _t('+ Thành phân cảnh'))));
        });
        evPanel.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Kịch bản lẻ'), h('span', { class: 'r note', text: _t('agent gửi qua MCP (save_event)') })), h('div', { class: 'pad' }, t)));
      }).catch(function () {});
    }
    loadEvents();

    function loadWork(id, quiet) {
      return Store.api('GET', 'api/works/' + id).then(function (w) {
        if (!alive) return;
        if (!W || W.id !== w.id) { drafts = {}; draftScript = null; closeExport(); }
        W = w; route.work = w.id; dockWork();
        crumbs([{ t: _t('Tác phẩm'), go: { page: 'works' } }, { t: w.title }]);
        paint();
      }).catch(function (e) { toast(e.message); if (!quiet) { setHash(''); go({ page: 'works' }); } });
    }
    function saveScript() {
      if (!W) return;
      Store.api('POST', 'api/works', { id: W.id, logline: logline.value, script: script.value }).then(function () { draftScript = null; toast(_t('Đã lưu kịch bản.')); loadWork(W.id); }).catch(function (e) { toast(e.message); });
    }
    function saveShot(body) {
      if (!W) { toast(_t('Tạo tác phẩm trước.')); return Promise.reject(); }
      return Store.api('POST', 'api/works/' + W.id + '/shots', body).then(function (w) { if (body.shot && body.shot.id) delete drafts[body.shot.id]; if (!alive) return w; W = w; soundWarn = w.warnings || []; dockWork(); paint(); return w; }).catch(function (e) { toast(e.message); throw e; });
    }

    // ---- ngôn ngữ phim + Lồng tiếng AI ----
    function syncLang() {
      var L = workLang(W);
      langSel.value = L.lang + '|' + L.accent;
      langNote.textContent = _t(LANG_HINT[L.lang] || LANG_NOTE); langNote.className = 'note' + (LANG_HINT[L.lang] ? ' warn' : '');
      langSel2.value = L.lang + '|' + L.accent; langNote2.textContent = langNote.textContent; langNote2.className = langNote.className;
      player.setLang(L.lang, L.accent);
      paintRegion();
      paintVoiceTable();   // giọng chốt đổi theo ngôn ngữ phim
    }
    function langName(l, a) { var x = GC.voices.langList().filter(function (y) { return y.id === l; })[0], ac = x && x.accents.filter(function (y) { return y.id === a; })[0]; return x ? _l(x.label) + (ac ? ' · ' + _l(ac.label) : '') : l; }
    function saveLang(v) {
      if (!W) { syncLang(); return; }
      var p = v.split('|'), w0 = W, prev = { lang: w0.lang, accent: w0.accent };
      w0.lang = p[0]; w0.accent = p[1]; designAsk = false; closeExport(); syncLang();
      if (!dubbing) { dubSt = null; paintDub(); }
      Store.api('POST', 'api/works', { id: w0.id, lang: p[0], accent: p[1] })
        .then(function () { if (alive) toast(_t('Phim đọc bằng {lang}.', { lang: langName(p[0], p[1]) })); })
        .catch(function (e) { w0.lang = prev.lang; w0.accent = prev.accent; if (alive && W === w0) { syncLang(); paintDub(); } toast(e.message); });
    }
    // đầu câu báo DỪNG vì 429: trần câu / ngày của máy · Google giới hạn mỗi phút (đã chờ đủ 10 lần) · hết lượt hôm nay
    function quotaHead(st) {
      if (st.cap) return _t('Dừng vì chạm trần câu / ngày (Cài đặt AI){x}', { x: st.retryAt ? _t(' — đọc tiếp lúc {clockOf}', { clockOf: clockOf(st.retryAt) }) : '' });
      return AiVoice.quotaText({ retryAt: st.retryAt, minute: !!st.minute }) + (st.minute && st.waits ? _t(' (đã chờ {waits} lần)', { waits: st.waits }) : '');
    }
    function dubSummary(st) {
      var mix = _t('{fresh} mới · {cached} có sẵn{x}', { fresh: st.fresh, cached: st.cached, x: st.failed ? _t(' · {failed} lỗi', { failed: st.failed }) : '' });
      if (!st.end) return (st.waitAt ? _t('Google giới hạn mỗi phút — tự lồng tiếp lúc {clockSec} · ', { clockSec: clockSec(st.waitAt) }) : '') + mix;
      if (st.end === 'quota') return _t('{quotaHead} · đã lồng {done}/{total} câu ({mix})', { quotaHead: quotaHead(st), done: st.done, total: st.total, mix: mix });
      if (st.end === 'nokey') return _t('Dừng: {error} · đã lồng {done}/{total} câu', { error: st.error, done: st.done, total: st.total });
      if (st.end === 'cancel') return _t('Đã dừng · đã lồng {done}/{total} câu ({mix})', { done: st.done, total: st.total, mix: mix });
      if (st.end === 'err') return _t('Lỗi: {error}', { error: st.error });
      return st.total ? _t('Xong {done}/{total} câu ({mix}){x}', { done: st.done, total: st.total, mix: mix, x: st.failed ? ' — ' + st.error : '' }) : _t('Chưa có câu thoại nào sẵn sàng để lồng tiếng.');
    }
    function paintDub() {
      var ready = AiVoice.ready();
      dubB.textContent = dubbing ? _t('Dừng lồng tiếng') : _t('Lồng tiếng AI');
      dubB.disabled = !dubbing && (!ready || !W || designing);
      dubB.title = ready ? _t('Đọc từng câu của phim bằng giọng AI Google rồi lưu lại. Câu đã đọc không tốn lại; gói miễn phí chỉ có vài chục lượt mỗi ngày — hết lượt thì dừng, lần sau bấm lại sẽ đọc tiếp.') : _t('Cần key Google ở Cài đặt AI › Giọng AI');
      clear(dubNote);
      if (!ready && !dubbing) {
        if (AiVoice.cfg) dubNote.appendChild(h('span', { text: (AiVoice.cfg.hasKey ? _t('Giọng AI đang tắt · ') : _t('Chưa có key Google · ')) }));
        dubNote.appendChild(h('button', { class: 'btn sm', onclick: function () { go({ page: 'ai', focus: 'voice' }); } }, _t('Dán key ở Cài đặt AI ›')));
      } else dubNote.appendChild(h('span', { text: _t('câu chưa đọc tốn lượt Google; câu đã đọc thì miễn phí') }));
      var miss = W ? AiVoice.missingFor(W, workLang(W)) : [];   // server chỉ chọn giọng cho 48 diễn viên đầu; người thừa đọc bằng giọng máy
      castNote.hidden = !miss.length; castNote.textContent = miss.length ? _t('{n} diễn viên vượt {CAST_MAX} chưa có giọng AI — câu của họ dùng giọng máy đọc.', { n: miss.length, CAST_MAX: CAST_MAX }) : '';
      clear(dubBox); dubBox.hidden = !dubSt;
      if (dubSt) {
        var st = dubSt, n = st.done + st.failed;
        dubBox.appendChild(h('span', { class: 'meter', role: 'progressbar', 'aria-label': _t('Tiến độ lồng tiếng AI'), 'aria-valuemin': '0', 'aria-valuemax': String(st.total), 'aria-valuenow': String(n) },
          h('i', { style: 'width:' + (st.total ? Math.round(n / st.total * 100) : 0) + '%' })));
        dubBox.appendChild(h('b', { text: _t('Lồng tiếng AI {n}/{total}', { n: n, total: st.total }) }));
        dubBox.appendChild(h('span', { class: 'note', 'aria-live': st.end || st.waitAt ? 'polite' : 'off', text: dubSummary(st) }));
      }
      paintRegion();
    }
    // ---- giọng vùng thật: đếm vai đã thiết kế + thiết kế hàng loạt (tuần tự, xác nhận trong trang, dừng ngay ở 429) ----
    function designSecs(n) { var s = n * 25; return s < 90 ? _t('~{s} giây', { s: s }) : _t('~{n} phút', { n: Math.round(s / 60) }); }
    function accentLabel(L) { var l = GC.voices.langList().filter(function (x) { return x.id === L.lang; })[0], a = l && l.accents.filter(function (x) { return x.id === L.accent; })[0]; return l ? _l(l.label) + ' · ' + (a ? _l(a.label) : L.accent) : L.lang; }
    function designSummary(st) {
      var left = _t(' · đã thiết kế {done}/{total} vai{x}', { done: st.done, total: st.total, x: st.failed ? _t(' · {failed} lỗi', { failed: st.failed }) : '' });
      if (!st.end) return _t('đang thiết kế {cur} (~25 s mỗi vai, tốn 1 lượt)…{x}', { cur: st.cur, x: st.failed ? _t(' · {failed} lỗi', { failed: st.failed }) : '' });
      if (st.end === 'quota') return quotaHead(st) + left;
      if (st.end === 'nokey') return _t('Dừng: {error}{left}', { error: st.error, left: left });
      if (st.end === 'cancel') return _t('Đã dừng{left}', { left: left });
      return _t('Xong{left}{x} · đã chọn lại giọng cả dàn', { left: left, x: st.failed ? ' — ' + st.error : '' });
    }
    function paintRegion() {
      var L = workLang(W), cfg = AiVoice.cfg, ready = AiVoice.ready(), jobs = W && cfg ? AiVoice.regionOf(W, L) : [], todo = jobs.filter(function (j) { return !j.done; });
      regionNote.textContent = !W ? '' : !cfg ? _t('đang đọc trạng thái giọng AI…')
        : !jobs.length ? _t('chưa có vai nào để thiết kế giọng vùng (tác phẩm chưa có diễn viên, hoặc chỉ có vai trẻ em — Google chặn thiết kế giọng trẻ em)')
        : _t('giọng vùng có ở {n}/{n2} vai (đã thiết kế) · vai chưa thiết kế đọc giọng chung của ngôn ngữ', { n: jobs.length - todo.length, n2: jobs.length });
      regionB.disabled = !W || designing || dubbing || !ready || !todo.length;
      regionB.title = !ready ? _t('Cần key Google ở Cài đặt AI › Giọng AI') : !jobs.length ? _t('Tác phẩm chưa có vai nào thiết kế được')
        : !todo.length ? _t('Mọi vai trong phim đã có giọng thiết kế cho {accentLabel}', { accentLabel: accentLabel(L) })
        : _t('Thiết kế giọng {accentLabel} cho {n} vai chưa có: tốn {n} lượt Google, ~25 giây mỗi vai. Bấm xong sẽ hỏi lại trước khi chạy.', { accentLabel: accentLabel(L), n: todo.length });
      clear(regionBox); regionBox.hidden = true;
      if (!W) return;
      if (designAsk && !designing && todo.length) {   // hộp xác nhận TRONG TRANG: nói rõ số lượt + thời gian trước khi tốn
        regionBox.hidden = false;
        var left = cfg && cfg.dailyCap > 0 ? cfg.dailyCap - (cfg.today || 0) : null;   // thiết kế cũng tính vào trần câu / ngày của máy chủ
        regionBox.appendChild(h('div', { class: 'banner warn', role: 'group', 'aria-label': _t('Xác nhận thiết kế giọng vùng'), style: 'flex-wrap:wrap' },
          h('span', { style: 'flex:1 1 320px', text: _t('Sẽ thiết kế giọng {accentLabel} cho {n} vai ({map}) — ≈ {n} lượt Google, ~25 s mỗi vai (cả loạt {designSecs}). Chạy lần lượt từng vai, dừng ngay khi hết lượt; xong thì chọn lại giọng cả dàn. Vai trẻ em không thiết kế được nên không tính.{x}', { accentLabel: accentLabel(L), n: todo.length, map: todo.map(function (j) { return _l(GC.voices.ROLES[j.role].label); }).join(', '), designSecs: designSecs(todo.length), x: left !== null && left < todo.length ? _t(' Trần câu / ngày còn {max} lượt (Cài đặt AI) — chạy tới đó sẽ dừng.', { max: Math.max(0, left) }) : '' }) }),
          h('button', { class: 'btn sm primary', onclick: startDesign }, _t('Bắt đầu thiết kế {n} vai', { n: todo.length })),
          h('button', { class: 'btn sm', onclick: function () { designAsk = false; paintRegion(); regionB.focus(); } }, _t('Huỷ'))));
      } else if (designSt && designSt.work === W.id && designSt.lang === L.lang + '|' + L.accent) {
        var st = designSt, n = st.done + st.failed;
        regionBox.hidden = false;
        regionBox.appendChild(h('div', { class: 'readybar dubbar' },
          h('span', { class: 'meter', role: 'progressbar', 'aria-label': _t('Tiến độ thiết kế giọng vùng'), 'aria-valuemin': '0', 'aria-valuemax': String(st.total), 'aria-valuenow': String(n) }, h('i', { style: 'width:' + (st.total ? Math.round(n / st.total * 100) : 0) + '%' })),
          h('b', { text: _t('Thiết kế giọng vùng {n}/{total}', { n: n, total: st.total }) }),
          designing ? h('button', { class: 'btn sm', disabled: designCancel, onclick: function () { designCancel = true; paintRegion(); } }, designCancel ? _t('Đang dừng…') : _t('Dừng thiết kế')) : null,
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
        designSt.cur = _l(GC.voices.ROLES[j.role].label); if (alive) paintRegion();
        return AiVoice.designRole(j.role, L.lang, j.accent).then(function () {
          designSt.done++;
        }, function (e) {
          if (e.status === 429 || e.status === 409) { designSt.stop = e.status; designSt.retryAt = e.retryAt || null; designSt.cap = !!e.cap; designSt.minute = AiVoice.isMinute(e); designSt.error = e.message; i = jobs.length; return; }
          designSt.failed++; designSt.error = e.message;   // lỗi một vai (vd. Google chặn): ghi lại, làm tiếp các vai sau
        }).then(function () { if (alive) paintRegion(); return next(); });
      })().then(function () {
        var st = designSt;
        st.end = st.stop === 429 ? 'quota' : st.stop === 409 ? 'nokey' : designCancel ? 'cancel' : 'done';
        AiVoice.resetCasts();   // phim dùng ngay giọng đã thiết kế
        if (alive) {
          if (st.end === 'quota') toast(_t('{quotaText}. Đã thiết kế {done}/{total} vai.', { quotaText: AiVoice.quotaText({ cap: st.cap, retryAt: st.retryAt, minute: st.minute }), done: st.done, total: st.total }));
          else if (st.end === 'nokey') toast(_t('{error} — mở Cài đặt AI › Giọng AI.', { error: st.error }));
          else if (st.end === 'done') toast(_t('Đã thiết kế giọng vùng cho {done}/{total} vai.{x}', { done: st.done, total: st.total, x: st.failed ? _t(' {failed} vai lỗi.', { failed: st.failed }) : '' }));
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
          if (st.end === 'nokey') { toast(_t('{error} — mở Cài đặt AI › Giọng AI.', { error: st.error })); go({ page: 'ai', focus: 'voice' }); }
          else if (st.end === 'quota') toast(_t('{quotaText}. Đã lồng {done}/{total} câu.', { quotaText: AiVoice.quotaText({ cap: st.cap, retryAt: st.retryAt, minute: st.minute }), done: st.done, total: st.total }));
          else if (st.end === 'done') toast(_t('Đã lồng tiếng AI {done}/{total} câu.', { done: st.done, total: st.total }));
          return st;
        })
        .catch(function (e) { dubSt = { total: 0, done: 0, fresh: 0, cached: 0, failed: 0, end: 'err', error: e.message }; if (alive) toast(e.message); return dubSt; })
        .then(function (st) {
          dubbing = false;
          if (alive) paintDub();
          if (alive && st && st.done) Store.api('GET', 'api/works/' + w0.id).then(function (w) { if (alive && W && W.id === w.id) { W.stats = w.stats; paintHead(); paintVoice(); } }, function () { /* giữ số cũ */ });
          return st;
        });
    }
    // ---- xuất phim / video: còn câu chưa có giọng AI (mà Giọng AI đã sẵn sàng) thì hỏi trước — lồng tiếng rồi xuất · xuất luôn · huỷ. Chưa sẵn sàng thì xuất như cũ.
    //      kind 'html' = phim HTML (tải về ngay) · 'video' = mở bảng Xuất video (CÙNG hộp hỏi — CNS-218; câu thiếu giọng trong video im lặng — Q39)
    function closeExport() { clear(exportBox); exportBox.hidden = true; }
    function exportGo(kind, w0, vo) { if (kind === 'video') openVideo(w0, vo); else exportFilm(w0, vo); }
    function exportClick(kind) {
      if (!W || exportBusy) return;
      var w0 = W, L = workLang(W);
      closeExport();
      if (kind === 'video' && Vid.job && Vid.job.phase === 'run') { toast(_t('Đang xuất video "{title}" — chờ xong hoặc bấm Huỷ trước.', { title: Vid.job.title })); return; }
      if (dubbing) { toast(_t('Đang lồng tiếng AI — chờ xong (hoặc bấm Dừng lồng tiếng) rồi xuất phim.')); return; }
      if (!AiVoice.on() || !AiVoice.ready()) { exportGo(kind, w0); return; }
      exportBusy = true;
      filmVoices(w0, L).then(function (vo) {   // hỏi "dry" các clip đã có (không tốn lượt) — chính kết quả này được dùng để xuất, khỏi hỏi lại
        exportBusy = false;
        if (!alive || !W || W.id !== w0.id) return;   // đã đổi tác phẩm trong lúc hỏi: bỏ, không hiện hộp của tác phẩm cũ
        if (!vo.total || vo.have >= vo.total) exportGo(kind, w0, vo); else askExport(w0, vo, kind);
      });
    }
    function askExport(w0, vo, kind) {
      exportBox.hidden = false;
      var video = kind === 'video';
      var go1 = h('button', { class: 'btn sm primary', title: video ? _t('Đọc các câu còn thiếu bằng giọng AI (tốn lượt Google; hết lượt thì dừng) rồi mở bảng xuất video') : _t('Đọc các câu còn thiếu bằng giọng AI (tốn lượt Google; hết lượt thì dừng) rồi tự xuất phim'), onclick: function () { dubThenExport(w0, kind); } }, _t('Lồng tiếng rồi xuất'));
      exportBox.appendChild(h('div', { class: 'banner warn', role: 'group', 'aria-label': _t('Xác nhận xuất phim thiếu giọng AI'), 'data-kind': kind || 'html', style: 'flex-wrap:wrap' },
        h('span', { style: 'flex:1 1 320px', text: video ? _t('Còn {n}/{total} câu chưa có giọng AI — trong video, câu thiếu sẽ im lặng (bong bóng / phụ đề vẫn hiện).', { n: vo.total - vo.have, total: vo.total })
          : _t('Còn {n}/{total} câu chưa có giọng AI — câu thiếu sẽ đọc bằng giọng máy / blip.', { n: vo.total - vo.have, total: vo.total }) }),
        go1,
        h('button', { class: 'btn sm', onclick: function () { closeExport(); if (W && W.id === w0.id) exportGo(kind, W); } }, _t('Xuất luôn')),   // tính lại lúc bấm (dry, không tốn lượt): hộp có thể đã mở lâu — vừa lồng thêm, đổi ngôn ngữ, sửa kịch bản
        h('button', { class: 'btn sm', onclick: function () { closeExport(); } }, _t('Huỷ'))));
      go1.focus();
    }
    // lồng tiếng như nút Lồng tiếng AI, xong (hoặc dừng vì hết lượt) thì tự xuất; bấm Dừng lồng tiếng = không xuất (người dùng đổi ý); thiếu key / lỗi thì không xuất
    function dubThenExport(w0, kind) {
      closeExport();
      if (!W || W.id !== w0.id) return;
      if (dubbing || designing) { toast(dubbing ? _t('Đang lồng tiếng AI — chờ xong rồi xuất phim.') : _t('Đang thiết kế giọng vùng — chờ xong rồi xuất phim.')); return; }
      startDub().then(function (st) {
        if (!st || !alive || !W || W.id !== w0.id) return;
        if (st.end === 'cancel') { toast(_t('Đã dừng lồng tiếng — chưa xuất phim.')); return; }
        if (st.end === 'nokey' || st.end === 'err') return;   // startDub đã báo lỗi / mở Cài đặt AI
        exportGo(kind, W);
      });
    }

    // ---- XUẤT VIDEO (v0.22): nút khoá theo phép dò năng lực THẬT, kèm đúng lý do (CNS-223) · bảng chọn khung hình / chất lượng / định dạng (dò thật),
    //      ước thời gian + dung lượng + trần độ dài · Bắt đầu: chọn thư mục NGAY lúc bấm (CNS-226) · tiến độ theo phân cảnh + Huỷ + "giữ tab ở phía trước"
    //      (CNS-221) · xong: tệp đã lưu, Xem thử, chọn khung khác làm bìa (Q43). Trạng thái lượt xuất ở Vid (cấp module).
    var videoB = h('button', { class: 'btn sm', id: 'videoExportB', disabled: true, title: _t('Tệp video (MP4 hoặc WebM) + phụ đề .srt + ảnh bìa .jpg + mô tả .txt — đăng lên YouTube / TikTok. Chạy ngay trong trình duyệt này; giữ tab ở phía trước trong lúc xuất.'), onclick: function () { exportClick('video'); } }, _t('Xuất video'));
    var videoWhy = h('span', { class: 'note', id: 'videoWhy', role: 'status' });
    var videoBox = h('div', { class: 'stack vidbox', hidden: true }), vcap = null, vs = null;
    function probeVideo() {
      if (!window.GCVideo || !GCVideo.probe) { vcap = { ok: false, reason: _t('Không mở được trang xuất video — cập nhật gen-chibi hoặc mở Studio đúng địa chỉ máy chủ.') }; paintVideoBtn(); return; }
      videoWhy.textContent = _t('Đang kiểm tra trình duyệt…');
      GCVideo.probe(Vid.pref()).then(function (r) { vcap = r; if (alive) paintVideoBtn(); }, function (e) { vcap = { ok: false, reason: e.message }; if (alive) paintVideoBtn(); });
    }
    function paintVideoBtn() {
      var ok = !!(vcap && vcap.ok);
      videoB.disabled = !ok || !W;
      videoB.setAttribute('aria-describedby', 'videoWhy');
      videoWhy.textContent = !vcap ? _t('Đang kiểm tra trình duyệt…') : ok ? _t('{fmt} · dò trên trình duyệt này', { fmt: VFMT[vcap.format.container] }) : vcap.reason;
      videoWhy.className = 'note' + (vcap && !ok ? ' warn' : '');
    }
    function openVideo(w0, vo) {
      var p = Vid.pref();
      vs = { wid: w0.id, vo: vo || null, aspect: p.aspect, quality: p.quality, container: p.container, probe: null, estSec: null, voReady: !!vo };
      if (!vo) filmVoices(w0, workLang(w0)).then(function (v) { if (vs && vs.wid === w0.id) { vs.vo = v; vs.voReady = true; paintVideo(); } });
      filmSecEstimate(w0).then(function (sec) { if (vs && vs.wid === w0.id) { vs.estSec = sec; paintVideo(); } });
      reprobe();
    }
    function reprobe() {
      var my = vs; if (!my) return;
      my.probe = null; paintVideo();
      GCVideo.probe({ quality: my.quality, aspect: my.aspect, container: my.container }).then(function (r) { if (vs === my) { my.probe = r; if (r.ok) my.container = r.format.container; paintVideo(); } });
    }
    function segOf(label, cur, opts, set) {
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': label });
      opts.forEach(function (o) { seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(cur === o[0]), 'data-v': o[0], disabled: o[2] || null, onclick: function () { if (cur !== o[0]) set(o[0]); } }, o[1])); });
      return seg;
    }
    function paintVideo() {
      if (!alive) return;
      clear(videoBox);
      var j = Vid.job && W && Vid.job.wid === W.id ? Vid.job : null;
      videoBox.hidden = !j && !(vs && W && vs.wid === W.id);
      if (videoBox.hidden) return;
      var panel = h('div', { class: 'panel vidpanel', role: 'region', 'aria-label': _t('Xuất video') }), body = h('div', { class: 'pad stack' });
      panel.appendChild(h('h3', null, _t('Xuất video'), h('span', { class: 'r note', text: _t('video · phụ đề .srt · ảnh bìa .jpg · mô tả .txt') })));
      panel.appendChild(body);
      if (j && j.phase === 'run') paintVideoRun(body, j);
      else if (j && j.phase === 'done') paintVideoDone(body, j);
      else if (j && j.phase === 'error') {
        body.appendChild(h('div', { class: 'banner bad', role: 'alert' }, h('span', { text: _t('Xuất video không xong: {error}', { error: j.err }) })));
        body.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: function () { vClose(); } }, _t('Đóng'))));
      } else paintVideoOpts(body);
      videoBox.appendChild(panel);
    }
    function paintVideoOpts(body) {
      var o = vs, pr = o.probe, kv = h('div', { class: 'kv vidkv' });
      kv.appendChild(h('label', { text: _t('Khung hình') }));
      kv.appendChild(h('div', { class: 'row' }, segOf(_t('Khung hình'), o.aspect, [['16:9', _t('Ngang 16:9')], ['9:16', _t('Dọc 9:16 — phim ngang đặt giữa')]], function (v) { o.aspect = v; Vid.savePref(o); reprobe(); }),
        h('span', { class: 'note', text: o.aspect === '9:16' ? _t('cho TikTok / Shorts: phim 16:9 đặt giữa khung dọc, tên phim ở trên — nhân vật nhỏ hơn bản ngang') : _t('YouTube, máy tính, TV') })));
      kv.appendChild(h('label', { text: _t('Chất lượng') }));
      kv.appendChild(h('div', { class: 'row' }, segOf(_t('Chất lượng'), o.quality, [['1080p', '1080p'], ['720p', '720p']], function (v) { o.quality = v; Vid.savePref(o); reprobe(); }),
        h('span', { class: 'mono note', text: (o.aspect === '9:16' ? (o.quality === '720p' ? '720×1280' : '1080×1920') : (o.quality === '720p' ? '1280×720' : '1920×1080')) + ' · 30 fps' })));
      kv.appendChild(h('label', { text: _t('Định dạng') }));
      if (!pr) kv.appendChild(h('span', { class: 'note', text: _t('Đang dò trình duyệt…') }));
      else if (!pr.ok) kv.appendChild(h('span', { class: 'note warn', text: pr.reason }));
      else {
        var fr = h('div', { class: 'row' });
        if (pr.formats.length > 1) fr.appendChild(segOf(_t('Định dạng'), pr.format.container, pr.formats.map(function (k) { return [k, VFMT[k]]; }), function (v) { o.container = v; Vid.savePref(o); reprobe(); }));
        else fr.appendChild(h('span', { class: 'chip info', 'data-fmt': pr.format.container, text: VFMT[pr.format.container] }));
        fr.appendChild(h('span', { class: 'note', text: pr.formats.length > 1 ? _t('dò thật trên trình duyệt này') : pr.format.container === 'webm' ? _t('trình duyệt này không mã hoá được MP4 — YouTube và TikTok vẫn nhận WebM') : _t('dò thật trên trình duyệt này') }));
        kv.appendChild(fr);
      }
      var est = o.estSec != null && pr && pr.ok ? vEstimate(o.estSec, o.quality, pr.format.container) : null, over = !!(est && o.estSec > est.limit);
      kv.appendChild(h('label', { text: _t('Độ dài') }));
      kv.appendChild(h('span', { 'data-v': 'len', text: o.estSec == null ? _t('đang ước…') : !o.estSec ? _t('chưa có phân cảnh nào sẵn sàng') : _t('~{len} (ước theo kịch bản; đo đúng lúc xuất)', { len: vSecs(o.estSec) }) }));
      kv.appendChild(h('label', { text: _t('Trần độ dài') }));
      kv.appendChild(h('span', { 'data-v': 'limit', text: !pr || !pr.ok ? '—' : pr.format.container === 'mp4' ? _t('{lim} cho MP4 {q} (MP4 giữ cả tệp trong bộ nhớ tới khi xong)', { lim: vSecs(est ? est.limit : GCVideo.limits(pr.format, o.quality)), q: o.quality })
        : _t('{lim} cho WebM (ghi dần ra tệp)', { lim: vSecs(GCVideo.limits(pr.format, o.quality)) }) }));
      kv.appendChild(h('label', { text: _t('Ước tính') }));
      kv.appendChild(h('span', { 'data-v': 'est', text: est && o.estSec ? _t('xuất mất ~{t} · tệp tối đa ~{size}', { t: vSecs(est.wall), size: vBytes(est.bytes) }) : '—' }));
      kv.appendChild(h('label', { text: _t('Lời thoại') }));
      var vo = o.vo, voTxt = !o.voReady ? _t('đang đếm câu có giọng AI…') : !AiVoice.on() || !AiVoice.ready() ? _t('Giọng AI chưa bật — mọi câu thoại im lặng trong video (bong bóng / phụ đề vẫn hiện; giọng máy đọc không ghi được vào video).')
        : !vo.total ? _t('phim chưa có câu thoại') : vo.have >= vo.total ? _t('{have}/{total} câu có giọng AI', { have: vo.have, total: vo.total }) : _t('{have}/{total} câu có giọng AI — câu còn lại im lặng, bong bóng / phụ đề vẫn hiện', { have: vo.have, total: vo.total });
      kv.appendChild(h('span', { 'data-v': 'voice', class: o.voReady && vo && vo.have < vo.total ? 'warn' : '', text: voTxt }));
      kv.appendChild(h('label', { text: _t('Lưu vào') }));
      kv.appendChild(h('span', { 'data-v': 'save', text: window.showDirectoryPicker ? _t('chọn thư mục khi bấm Bắt đầu — 4 tệp: video, .srt, .jpg, .txt') : _t('tải về từng tệp khi xong — 4 tệp: video, .srt, .jpg, .txt') }));
      body.appendChild(kv);
      if (over) {
        var alt = pr.format.container === 'mp4' && pr.formats.indexOf('webm') >= 0;
        body.appendChild(h('div', { class: 'banner bad', role: 'alert', 'data-v': 'over' }, h('span', { text: _t('Phim dài ~{len}, quá trần {lim} của {fmt} {q} — {hint}', { len: vSecs(o.estSec), lim: vSecs(est.limit), fmt: VFMT[pr.format.container], q: o.quality,
          hint: o.quality === '1080p' ? (alt ? _t('chọn 720p hoặc WebM.') : _t('chọn 720p.')) : alt ? _t('chọn WebM.') : _t('rút bớt phân cảnh rồi xuất lại.') }) })));
      }
      if (W && isSampleProject(W.project)) body.appendChild(h('div', { class: 'note', 'data-v': 'credit', text: _t('Tác phẩm dùng bộ mẫu Gen Labs: {SAMPLE_TERMS}. Dòng ghi công có sẵn trong mô tả (.txt).', { SAMPLE_TERMS: _t(SAMPLE_TERMS) }) }));
      body.appendChild(h('div', { class: 'note', text: _t('Giữ tab này ở phía trước trong lúc xuất — tab bị ẩn sẽ bị trình duyệt làm chậm. Xuất mất khoảng 2–3,5 lần độ dài phim.') }));
      var can = !!(pr && pr.ok && o.estSec && o.voReady && !over);
      var go = h('button', { class: 'btn sm primary', 'data-v': 'start', disabled: !can, onclick: function () { startClick(); } }, _t('Bắt đầu'));
      body.appendChild(h('div', { class: 'row' }, go, h('button', { class: 'btn sm', onclick: function () { vs = null; paintVideo(); } }, _t('Đóng'))));
    }
    // Bắt đầu: hộp chọn thư mục gọi NGAY trong cú bấm (cần thao tác người dùng — CNS-226); trình duyệt không có thì tải về khi xong
    function startClick() {
      var o = vs, w0 = W; if (!o || !w0 || !o.probe || !o.probe.ok) return;
      if (Vid.job && Vid.job.phase === 'run') { toast(_t('Đang xuất video "{title}" — chờ xong hoặc bấm Huỷ trước.', { title: Vid.job.title })); return; }
      var opt = { aspect: o.aspect, quality: o.quality, container: o.probe.format.container, vo: o.vo, estSec: o.estSec };
      var pick = window.showDirectoryPicker ? window.showDirectoryPicker({ id: 'gc-video', mode: 'readwrite', startIn: 'videos' }) : Promise.resolve(null);
      pick.then(function (dir) { vs = null; vStart(w0, opt, dir); }, function (e) {
        if (e && e.name === 'AbortError') { toast(_t('Chưa chọn thư mục — chưa xuất video.')); return; }
        toast(_t('Không mở được thư mục ({error}) — tệp sẽ tải về khi xong.', { error: e && e.message || e })); vs = null; vStart(w0, opt, null);
      });
    }
    function paintVideoRun(body, j) {
      var p = j.prog || {}, total = j.frames || p.frames || 0, cur = p.phase === 'render' ? p.frame || 0 : 0, pct = total ? Math.min(99, Math.floor(cur / total * 100)) : 0;
      var head = p.phase === 'render' ? _t('Đang dựng và mã hoá — khung {i}/{n}', { i: cur, n: total }) : _t('Đang chuẩn bị — đo độ dài phim (lượt chạy thử, chưa ghi)…');
      body.appendChild(h('div', { class: 'readybar vidbar' },
        h('span', { class: 'meter', role: 'progressbar', 'aria-label': _t('Tiến độ xuất video'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('i', { style: 'width:' + pct + '%' })),
        h('b', { 'data-v': 'pct', text: pct + '%' }), h('span', { class: 'note', 'aria-live': 'polite', text: head })));
      if (j.marks && j.marks.length) {
        var t = h('table', { class: 'grid vidshots' });
        t.appendChild(h('tr', null, h('th', { text: '#' }), h('th', { text: _t('Phân cảnh') }), h('th', { text: _t('Tiến độ') }), h('th', { text: '%' })));
        j.marks.forEach(function (m, k) {
          var a = m.frame, b = k + 1 < j.marks.length ? j.marks[k + 1].frame : total, sp = b > a ? Math.max(0, Math.min(100, Math.floor((cur - a) / (b - a) * 100))) : 0;
          if (p.phase !== 'render') sp = 0;
          t.appendChild(h('tr', { 'data-shot': String(k) }, h('td', { class: 'id', text: String(k + 1) }), h('td', { text: m.title || '—' }),
            h('td', { style: 'width:40%' }, h('span', { class: 'meter' }, h('i', { style: 'width:' + sp + '%' }))), h('td', { class: 'nw mono', text: sp + '%' })));
        });
        body.appendChild(t);
      }
      body.appendChild(h('div', { class: 'banner warn', role: 'note', 'data-v': 'front' }, h('span', { text: j.hidden ? _t('Tab này vừa bị ẩn — trình duyệt làm chậm việc xuất. Giữ tab này ở phía trước tới khi xong.') : _t('Giữ tab này ở phía trước tới khi xong — tab bị ẩn sẽ bị trình duyệt làm chậm.') })));
      body.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn sm', 'data-v': 'cancel', disabled: j.cancelled || null, onclick: function () { vCancel(); } }, j.cancelled ? _t('Đang huỷ…') : _t('Huỷ')),
        h('span', { class: 'note', text: j.dir ? _t('lưu vào thư mục "{dir}"', { dir: j.dir.name }) : _t('tải về khi xong') })));
    }
    function paintVideoDone(body, j) {
      var r = j.result || {}, f = r.format || {};
      body.appendChild(h('div', { class: 'banner ok', role: 'status', 'data-v': 'done' }, h('span', { text: j.dir ? _t('Xong — {n} tệp đã lưu vào thư mục "{dir}" · {fmt} {w}×{h} · {len}', { n: j.files.length, dir: j.dir.name, fmt: (f.container || '').toUpperCase(), w: f.width, h: f.height, len: vSecs((r.durationMs || 0) / 1000) })
        : _t('Xong — {n} tệp đã tải về · {fmt} {w}×{h} · {len}', { n: j.files.length, fmt: (f.container || '').toUpperCase(), w: f.width, h: f.height, len: vSecs((r.durationMs || 0) / 1000) }) })));
      var KIND = { video: _t('video'), srt: _t('phụ đề'), cover: _t('ảnh bìa'), txt: _t('tiêu đề + mô tả') };
      var t = h('table', { class: 'grid vidfiles' });
      t.appendChild(h('tr', null, h('th', { text: _t('Tệp') }), h('th', { text: _t('Loại') }), h('th', { text: _t('Cỡ') }), h('th', { text: '' })));
      j.files.forEach(function (x) {
        t.appendChild(h('tr', { 'data-file': x.kind }, h('td', { class: 'mono', text: x.name }), h('td', { text: KIND[x.kind] || x.kind }), h('td', { class: 'nw mono', text: vBytes(x.bytes || 0) }),
          h('td', { class: 'nw' }, j.dir ? null : h('button', { class: 'btn sm', onclick: function () { if (x.blob) downloadBlob(x.name, x.blob); else if (j.url) fetch(j.url).then(function (q) { return q.blob(); }).then(function (b) { downloadBlob(x.name, b); }); } }, _t('Tải lại')))));
      });
      var vid = h('video', { class: 'vidprev', controls: true, preload: 'auto', src: j.url, 'aria-label': _t('Xem thử video vừa xuất') });
      var cover = j.coverUrl ? h('img', { class: 'vidcover', src: j.coverUrl, alt: _t('Ảnh bìa') }) : h('span', { class: 'note', text: _t('chưa có ảnh bìa') });
      var pickRow = h('div', { class: 'stack', hidden: true, style: 'gap:6px' });
      var slider = h('input', { type: 'range', min: '0', max: String(Math.max(0.1, (r.durationMs || 0) / 1000 - 0.05)), step: String(1 / 30), value: '0', 'aria-label': _t('Chọn khung làm ảnh bìa'), oninput: function () { vid.pause(); vid.currentTime = +slider.value; } });
      pickRow.appendChild(h('div', { class: 'note', text: _t('Kéo thanh (hoặc dừng trình xem thử) ở khung muốn làm bìa, rồi bấm "Dùng khung này làm bìa".') }));
      pickRow.appendChild(slider);
      pickRow.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn sm primary', 'data-v': 'use-frame', onclick: function () { vCoverFrom(vid).catch(function (e) { toast(e.message); }); } }, _t('Dùng khung này làm bìa')),
        h('button', { class: 'btn sm', onclick: function () { pickRow.hidden = true; } }, _t('Thôi'))));
      body.appendChild(h('div', { class: 'vidrow' },
        h('div', { class: 'stack', style: 'gap:6px;min-width:0' }, h('b', { class: 'note', text: _t('Xem thử') }), vid),
        h('div', { class: 'stack', style: 'gap:6px;min-width:0' }, h('b', { class: 'note', text: _t('Ảnh bìa') }), cover,
          h('button', { class: 'btn sm', 'data-v': 'repick', onclick: function () { pickRow.hidden = false; slider.value = String(vid.currentTime || 0); } }, _t('Chọn khung khác')), pickRow)));
      body.appendChild(t);
      body.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: function () { var w0 = W; vClose(); if (w0) openVideo(w0); } }, _t('Xuất lại')), h('button', { class: 'btn sm', onclick: function () { vClose(); } }, _t('Đóng'))));
    }
    Vid.paint = paintVideo;
    probeVideo();
    onLeave(function () { if (Vid.paint === paintVideo) Vid.paint = null; });

    /* ---- dữ liệu dựng giao diện ---- */
    function paintHead() {
      clear(headBox);
      if (!W) return;
      var ok = W.shots.filter(function (s) { return rvOf(s.id).status === 'ok'; }).length, st = W.stats || {}, L = workLang(W);
      headBox.appendChild(h('h2', { class: 'rt', text: W.title }));
      headBox.appendChild(h('span', { class: 'mono note', text: W.id }));
      if (W.project) headBox.appendChild(h('button', { class: 'tag proj', title: _t('Mở dự án này ở Thư viện'), onclick: function () { go({ page: 'projects', project: W.project }); } }, Projects.name(W.project)));
      headBox.appendChild(h('span', { class: 'chip', title: _t('Ngôn ngữ phim'), text: accentLabel(L) }));
      headBox.appendChild(h('span', { class: 'sp' }));
      headBox.appendChild(h('span', { class: 'mono note', text: _t('{n} cảnh', { n: W.shots.length }) }));
      headBox.appendChild(h('span', { class: 'chip ' + (W.shots.length && ok === W.shots.length ? 'ok' : ''), title: _t('Số cảnh đã duyệt "Đạt" / tổng số cảnh'), text: _t('Đạt {ok}/{n}', { ok: ok, n: W.shots.length }) }));
      if (st.voiceTotal) headBox.appendChild(h('span', { class: 'chip ' + (st.voiceDone === st.voiceTotal ? 'ok' : ''), title: _t('Câu thoại đã lồng tiếng AI / tổng số câu'), text: _t('Giọng AI {voiceDone}/{voiceTotal}', { voiceDone: st.voiceDone, voiceTotal: st.voiceTotal }) }));
    }
    var stillCache = {};   // ảnh khung đầu dựng MỘT lần mỗi lần vẽ phòng (thẻ phân cảnh + hàng duyệt dùng chung) — L-42
    function stillOf(s) { var u = stillCache[s.id]; if (u === undefined) u = stillCache[s.id] = stillURL(s); return u ? h('img', { class: 'still', src: u, alt: _t('Khung đầu của {title}', { title: s.title }), loading: 'lazy' }) : h('div', { class: 'still none note', text: _t('chưa có bối cảnh') }); }
    function paintCast() {
      clear(castBox);
      var acts = AiVoice.actorsOf(W), chosen = (W.voices || {})[workLang(W).lang + '|' + workLang(W).accent] || {};
      if (!acts.length) { castBox.appendChild(h('div', { class: 'pad note', text: _t('Chưa có diễn viên — chọn diễn viên trong từng phân cảnh (tab Phân cảnh) hoặc nhờ AI đạo diễn.') })); return; }
      var t = h('table', { class: 'grid' }), hd = h('tr');
      [_pt('cột', 'Nhân vật'), _t('Vai giọng'), _t('Cảnh'), _t('Câu thoại'), _t('Giọng AI đã chốt')].forEach(function (c) { hd.appendChild(h('th', { text: c })); });
      t.appendChild(hd);
      acts.forEach(function (a) {
        var nShot = W.shots.filter(function (s) { return (s.cast || []).some(function (k) { return GC.canon(k) === a.key; }); }).length;
        var nLine = W.shots.reduce(function (n, s) { return n + ((s.event && s.event.steps) || []).filter(function (st) { return st.actor === a.id && String(st.say || '').trim(); }).length; }, 0);
        var av = h('div', { class: 'av', style: '--own:' + ownOf(a) });
        var tr = h('tr', anc({ class: 'click', onclick: function () { go({ page: 'lib-characters', key: a.key }); } }, 'asset:' + a.key, _lo(a, a.name)),
          h('td', null, h('div', { class: 'row', style: 'flex-wrap:nowrap' }, av, h('div', null, h('b', { text: _lo(a, a.name) }), h('div', { class: 'note mono', text: a.key })))),
          h('td', { text: _l(GC.voices.ROLES[AiVoice.roleOf(a)].label) }), h('td', { class: 'v num', text: String(nShot) }), h('td', { class: 'v num', text: String(nLine) }),
          h('td', { class: 'mono' }, chosen[a.id] ? chosen[a.id] : h('span', { class: 'muted', text: _t('chưa chốt') })));
        t.appendChild(tr);
        R.image(av, a, 'normal', { crop: true, noShadow: true });
      });
      castBox.appendChild(h('div', { class: 'scroll' }, t));
    }
    function proposalBox(p, s) {
      var steps = (s.event && s.event.steps) || [], box = h('div', { class: 'diff', role: 'group', 'aria-label': _t('Đề xuất sửa của AI cho {title}', { title: s.title }) }), body = h('div', { class: 'diffbody' });
      if (p.field === 'description') {
        var cur = s.description || '', nu = p.value || '', ops = seqDiff(words(cur), words(nu)), a = words(cur), b = words(nu);
        ops.forEach(function (o) { body.appendChild(h('span', { class: 'd-' + o[0], text: o[0] === 'ins' ? b[o[2]] : a[o[1]] })); });
        if (!cur && !nu) body.appendChild(h('span', { class: 'note', text: _t('(trống)') }));
      } else {
        var A = steps.map(function (st) { return stepLine(st, nameOfActor); }), Bn = (p.value || []).map(function (st) { return stepLine(st, nameOfActor); });
        seqDiff(A, Bn).forEach(function (o) { body.appendChild(h('div', { class: 'd-row d-' + o[0] }, h('span', { class: 'sg', 'aria-hidden': 'true', text: o[0] === 'ins' ? '+' : o[0] === 'del' ? '−' : ' ' }), h('span', { text: o[0] === 'ins' ? Bn[o[2]] : A[o[1]] }))); });
      }
      var nIns = 0, nDel = 0;
      if (p.field === 'steps') { var sd = seqDiff(steps.map(function (st) { return stepLine(st, nameOfActor); }), (p.value || []).map(function (st) { return stepLine(st, nameOfActor); })); sd.forEach(function (o) { if (o[0] === 'ins') nIns++; else if (o[0] === 'del') nDel++; }); }
      var apply = h('button', { class: 'btn sm primary', 'data-prop': p.id + ':apply', onclick: function () { resolve('apply'); } }, _t('Áp dụng')), drop = h('button', { class: 'btn sm', 'data-prop': p.id + ':dismiss', onclick: function () { resolve('dismiss'); } }, _t('Bỏ'));
      function resolve(action) {
        apply.disabled = drop.disabled = true;
        Store.api('POST', 'api/works/' + W.id + '/proposals', { id: p.id, action: action }).then(function (w) {
          delete propErr[p.id]; W = w; dockWork(); toast(action === 'apply' ? _t('Đã áp dụng đề xuất cho {title}.', { title: s.title }) : _t('Đã bỏ đề xuất.'));
          if (action === 'apply') delete drafts[s.id];
          paint();
        }).catch(function (e) { apply.disabled = drop.disabled = false; propErr[p.id] = e.message + (e.errors && e.errors.length ? ' — ' + e.errors.slice(0, 2).join('; ') : ''); paintShots(); });
      }
      box.appendChild(h('div', { class: 'diffhead' }, h('b', { text: _t('AI đề xuất sửa {x}', { x: p.field === 'description' ? _t('mô tả') : _t('danh sách bước') }) }), h('span', { class: 'note', text: p.field === 'steps' ? '+' + nIns + ' −' + nDel : '' }), h('span', { class: 'sp' }), apply, drop));
      if (p.note) box.appendChild(h('div', { class: 'note', text: _t('Lý do: {note}', { note: p.note }) }));
      box.appendChild(body);
      if (propErr[p.id]) box.appendChild(h('div', { class: 'note warn', role: 'alert', text: _t('✗ Chưa áp dụng được: {x}', { x: propErr[p.id] }) }));
      return box;
    }
    function shotCard(s, i, chars, scenes) {
      var dr = drafts[s.id] || (drafts[s.id] = null), keep = function () { drafts[s.id] = { title: t.value, description: d.value, scene: sc.value, cast: cast.slice() }; };
      var t = h('input', { type: 'text', 'aria-label': _t('Tên phân cảnh {n}', { n: i + 1 }), value: dr ? dr.title : s.title, maxlength: 80, oninput: function () { keep(); } }), d = h('textarea', { rows: 2, maxlength: 1000, 'aria-label': _t('Mô tả phân cảnh {n}', { n: i + 1 }), placeholder: _t('Mô tả phân cảnh'), oninput: function () { keep(); } }); d.value = dr ? dr.description : s.description || '';
      var sc = h('select', { 'aria-label': _pt('số ít', 'Bối cảnh') }); sc.appendChild(h('option', { value: '', text: _t('— bối cảnh —') }));
      scenes.forEach(function (x) { sc.appendChild(h('option', { value: x.key, text: _lo(x, x.name) + (x.project ? ' · ' + Projects.name(x.project) : '') })); });
      sc.value = GC.canon(dr ? dr.scene : s.scene || ''); sc.onchange = keep;   // phân cảnh cũ trỏ afi.* vẫn chọn đúng (không âm thầm thành "không bối cảnh")
      var cast = (dr ? dr.cast : s.cast || []).map(GC.canon), cb = h('div', { class: 'fxchips', role: 'group', 'aria-label': _t('Dàn diễn viên') });
      chars.forEach(function (a) {
        var b = h('button', { 'aria-pressed': String(cast.indexOf(a.key) >= 0), onclick: function () {
          var j = cast.indexOf(a.key); if (j >= 0) cast.splice(j, 1); else if (cast.length < 8) cast.push(a.key); else { toast(_t('Tối đa 8 diễn viên một cảnh.')); return; }
          b.setAttribute('aria-pressed', String(j < 0)); keep();
        } }, _lo(a, a.name));
        cb.appendChild(b);
      });
      var steps = (s.event && s.event.steps) || [], miss = GC.film.issues(s), sec = steps.length ? shotSeconds(s) : 0;
      var st = s.event ? h('span', { class: 'tag acc', text: _t('{n} bước thoại', { n: steps.length }) }) : h('span', { class: 'tag', text: _t('chưa có lời thoại') });
      var aiB = h('button', { class: 'btn sm', title: _t('AI viết lời thoại + diễn xuất theo mô tả, đúng dàn diễn viên và bối cảnh'), onclick: function () {
        if (!cast.length) { toast(_t('Chọn diễn viên trước.')); return; }
        aiB.disabled = true; aiB.textContent = _t('Đang viết…');
        var ids = cast.map(function (k) { return (GC.ASSETS[k] || {}).id; }).filter(Boolean);
        saveShot({ shot: { id: s.id, title: t.value, description: d.value, scene: sc.value, cast: cast } })
          .then(function () { return Store.turn('api/ai/director', { description: (t.value + '. ' + d.value + (sc.value ? _t(' Bối cảnh: {value} — dùng "scene": "{value}" và spot.', { value: sc.value }) : '')).slice(0, 2000), cast: ids, project: W.project || '' }); })
          .then(function (res) { return saveShot({ shot: { id: s.id, event: res.event } }); })
          .then(function () { toast(_t('Đã viết lời thoại cho {title}', { title: s.title })); })
          .catch(function (e) { if (e) toast(e.message); aiB.disabled = false; aiB.textContent = _t('AI viết lời thoại'); });
      } }, _t('AI viết lời thoại'));
      // soạn tay từng bước (không cần AI) — dùng bản nháp đang gõ dở của phân cảnh (tên, mô tả, bối cảnh, dàn diễn viên)
      var stepB = h('button', { class: 'btn sm', title: _t('Soạn từng bước bằng ô chọn: ai nói gì, biểu cảm, chỗ đứng, đòn đánh… — không cần AI'), onclick: function () {
        var base = { title: t.value, description: d.value, scene: sc.value, cast: cast.slice() };
        var sh = stepSheet({ base: base, event: s.event, chars: chars, project: W.project || '',
          save: function (shot) { return saveShot({ shot: Object.assign({ id: s.id }, shot) }); },
          close: function () {} });   // đã lưu thì saveShot vẽ lại trang; đóng không lưu = bỏ thay đổi
        $('view').appendChild(sh.el); onLeave(sh.destroy);
        var f = sh.el.querySelector('select, input'); if (f) f.focus();
      } }, _t('Bảng bước'));
      var prev = h('div', { class: 'stepprev', hidden: !openSteps[s.id] });
      steps.forEach(function (stp, n) {
        prev.appendChild(h('div', anc({ class: 'sp-row' }, 'step:' + W.id + '/' + s.id + '/' + (n + 1), _t('Bước {n} · {title}', { n: n + 1, title: s.title })), h('span', { class: 'id mono', text: 'B' + String(n + 1).padStart(2, '0') }), h('span', { class: 'tx', text: stepLine(stp, nameOfActor) })));
      });
      if (!steps.length) prev.appendChild(h('div', { class: 'note', text: _t('Chưa có bước nào — bấm "AI viết lời thoại" hoặc "Bảng bước".') }));
      var openB = h('button', { class: 'btn sm', 'aria-expanded': String(!!openSteps[s.id]), 'data-steps': s.id, onclick: function () { openSteps[s.id] = !openSteps[s.id]; prev.hidden = !openSteps[s.id]; openB.setAttribute('aria-expanded', String(!!openSteps[s.id])); openB.textContent = openSteps[s.id] ? _t('Ẩn bước') : _t('Xem bước'); } }, openSteps[s.id] ? _t('Ẩn bước') : _t('Xem bước'));
      var pic = h('button', { class: 'shotpic', title: s.event ? _t('Bấm để diễn thử cảnh này') : _t('Chưa có lời thoại'), 'aria-label': _t('Diễn thử {title}', { title: s.title }), onclick: function () { if (!miss.length) { setTab('review'); player.play([s], s.title); } else toast(_t('Chưa diễn được: thiếu {miss}.', { miss: miss.join(', ') })); } }, stillOf(s));
      var card = h('div', anc({ class: 'shot' + (curShot === s.id ? ' sel' : ''), id: 'shot-' + s.id, onfocusin: function () { setShot(s.id); }, onclick: function () { setShot(s.id); } }, 'shot:' + W.id + '/' + s.id, _t('Cảnh {n} · {title}', { n: i + 1, title: s.title })),
        h('div', { class: 'shotleft' }, pic,
          h('div', { class: 'shotmeta' }, h('span', { class: 'tag', text: _t('{n} bước', { n: steps.length }) }), h('span', { class: 'tag', title: _t('Thời lượng ước tính theo kế hoạch dàn dựng'), text: steps.length ? secLabel(sec) : '—' }),
            miss.length ? h('span', { class: 'tag bad', title: _t('Thiếu: {miss}', { miss: miss.join(', ') }), text: _t('thiếu {n}', { n: miss.length }) }) : h('span', { class: 'tag ok', text: _t('sẵn sàng') }))),
        h('div', { class: 'shotbody' },
          h('div', { class: 'shot-head' }, h('b', { class: 'stepn', text: String(i + 1) }), t, st,
            h('button', { class: 'btn sm ic', disabled: i ? null : '', title: _t('Lên'), 'aria-label': _t('Đưa phân cảnh lên'), onclick: function () { saveShot({ shot: { id: s.id }, position: i - 1 }); } }, '↑'),
            h('button', { class: 'btn sm ic', disabled: i < W.shots.length - 1 ? null : '', title: _t('Xuống'), 'aria-label': _t('Đưa phân cảnh xuống'), onclick: function () { saveShot({ shot: { id: s.id }, position: i + 1 }); } }, '↓'),
            h('button', { class: 'btn sm ic danger', title: _t('Bỏ phân cảnh (bản cũ của tác phẩm vẫn được giữ)'), 'aria-label': _t('Bỏ phân cảnh'), onclick: function () { if (window.confirm(_t('Bỏ phân cảnh "{title}"?', { title: s.title }))) saveShot({ shot: { id: s.id }, remove: true }); } }, '✕')),
          d, h('div', { class: 'row' }, sc), cb,
          h('div', { class: 'shot-acts' },
            h('button', { class: 'btn sm primary', onclick: function () { saveShot({ shot: { id: s.id, title: t.value, description: d.value, scene: sc.value, cast: cast } }).then(function () { toast(_t('Đã lưu {value}', { value: t.value })); }); } }, _t('Lưu')),
            stepB, aiB, openB,
            h('button', { class: 'btn sm', disabled: miss.length ? '' : null, title: miss.length ? _t('Thiếu: {miss}', { miss: miss.join(', ') }) : _t('Diễn thử cảnh này ở tab Xem & duyệt'), onclick: function () { setTab('review'); player.play([s], s.title); } }, _t('Diễn thử')),
            h('button', { class: 'btn sm', title: _t('Ghim cảnh này vào Trợ lý AI rồi nhờ sửa'), onclick: function () { if (window.GCDock) { window.GCDock.pin('shot:' + W.id + '/' + s.id, _t('Cảnh {n} · {title}', { n: i + 1, title: s.title })); window.GCDock.open(); } } }, _t('Hỏi AI')),
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
        h('span', { text: _t('Thư viện chưa có nhân vật nào — tạm diễn bằng ma-nơ-canh, hoặc tạo nhân vật ở Xưởng (hoặc nhờ AI đạo diễn tự tạo).') }),
        h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { go({ page: 'create', project: W.project || '' }); } }, _t('Tạo ở Xưởng ›'))));
      W.shots.forEach(function (s, i) { shotsBox.appendChild(shotCard(s, i, chars, scenes)); });
      if (!W.shots.length) shotsBox.appendChild(h('div', { class: 'note', text: _t('Chưa có phân cảnh. Bấm "+ Phân cảnh" hoặc nhờ AI đạo diễn ở cột bên phải: "Chia phân cảnh".') }));
    }
    function paintReview() {
      clear(reviewList);
      var ok = W.shots.filter(function (s) { return rvOf(s.id).status === 'ok'; }).length;
      sumBadge.textContent = _t('Đạt {ok}/{n}', { ok: ok, n: W.shots.length }); sumBadge.className = 'chip ' + (W.shots.length && ok === W.shots.length ? 'ok' : '');
      if (document.activeElement !== allNote) allNote.value = (W.review && W.review.note) || '';
      if (!W.shots.length) { reviewList.appendChild(h('div', { class: 'note', text: _t('Chưa có phân cảnh để duyệt.') })); return; }
      W.shots.forEach(function (s, i) {
        var rv = rvOf(s.id), steps = (s.event && s.event.steps) || [], miss = GC.film.issues(s), nd = noteDraft[s.id] || (noteDraft[s.id] = { text: '', step: '' });
        var seg = h('div', { class: 'seg', role: 'group', 'aria-label': _t('Trạng thái duyệt của {title}', { title: s.title }) });
        REVIEW_ST.forEach(function (x) {
          seg.appendChild(h('button', { 'aria-pressed': String(rv.status === x[0]), 'data-review': s.id + ':' + x[0], onclick: function () { if (rv.status !== x[0]) saveReviewShot(s.id, { status: x[0] }); } }, _t(x[1])));
        });
        var notes = h('div', { class: 'notes' });
        (rv.notes || []).forEach(function (n) {
          notes.appendChild(h('div', { class: 'note-row' }, n.step ? h('button', { class: 'tag', title: _t('Ghim bước {step} vào Trợ lý AI', { step: n.step }), onclick: function () { if (window.GCDock) window.GCDock.pin('step:' + W.id + '/' + s.id + '/' + n.step, _t('Bước {step} · {title}', { step: n.step, title: s.title })); } }, 'B' + String(n.step).padStart(2, '0')) : h('span', { class: 'tag', text: _t('cảnh') }),
            h('span', { class: 'tx', text: n.by === 'system' ? _l(n.text) : n.text }),   // ghi chú do hệ thống tự thêm (cảnh đổi sau khi duyệt) dịch theo giao diện; ghi chú người viết giữ nguyên
            h('button', { class: 'btn sm ic', 'aria-label': _t('Xoá ghi chú: {slice}', { slice: n.text.slice(0, 40) }), title: _t('Xoá ghi chú'), onclick: function () { saveReviewShot(s.id, { notes: cleanNotes((rv.notes || []).filter(function (x) { return x.id !== n.id; })) }); } }, '✕')));
        });
        var nIn = h('input', { type: 'text', maxlength: 400, 'aria-label': _t('Ghi chú duyệt cho {title}', { title: s.title }), placeholder: _t('Ghi chú: sửa gì ở cảnh này…'), value: nd.text, oninput: function () { nd.text = nIn.value; }, onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); addNote(); } } });
        var nStep = h('select', { 'aria-label': _t('Gắn ghi chú vào bước'), onchange: function () { nd.step = nStep.value; } });
        nStep.appendChild(h('option', { value: '', text: _t('cả cảnh') }));
        steps.forEach(function (_, n) { nStep.appendChild(h('option', { value: String(n + 1), text: _t('bước {n}', { n: n + 1 }) })); });
        nStep.value = nd.step;
        function addNote() {
          var tx = nIn.value.trim();
          if (!tx) { nIn.focus(); return; }
          var n = { text: tx }; if (nStep.value) n.step = +nStep.value;
          nd.text = ''; nd.step = '';
          saveReviewShot(s.id, { notes: cleanNotes(rv.notes || []).concat(n) }).then(function () { var f = document.querySelector('[aria-label="Ghi chú duyệt cho ' + s.title.replace(/"/g, '\\"') + '"]'); if (f) f.focus(); }, function () { nd.text = tx; });
        }
        var fix = (rv.notes || []).length || rv.status === 'fix';
        reviewList.appendChild(h('div', anc({ class: 'rvrow st-' + rv.status }, 'shot:' + W.id + '/' + s.id, _t('Cảnh {n} · {title}', { n: i + 1, title: s.title })),
          h('div', { class: 'rvpic' }, stillOf(s)),
          h('div', { class: 'rvbody' },
            h('div', { class: 'rvhead' }, h('b', { class: 'stepn', text: String(i + 1) }), h('b', { class: 'rt', text: s.title }), h('span', { class: 'mono note', text: s.id }), steps.length ? h('span', { class: 'note', text: secLabel(shotSeconds(s)) }) : null, h('span', { class: 'sp' }),
              h('button', { class: 'btn sm', 'data-play': s.id, disabled: miss.length ? '' : null, title: miss.length ? _t('Chưa diễn được: thiếu {miss}', { miss: miss.join(', ') }) : _t('Diễn cảnh này'), onclick: function () { player.play([s], s.title); stageBox.scrollIntoView({ block: 'nearest' }); } }, _t('▶ Cảnh'))),
            h('div', { class: 'rvbar' }, seg, h('span', { class: 'sp' }),
              h('button', { class: 'btn sm', disabled: fix ? null : '', title: _t('Ghim cảnh + ghi chú vào Trợ lý AI rồi nhờ sửa theo đó (AI đề xuất, bạn duyệt)'), 'data-askai': s.id, onclick: function () { askAi(s, i, rv); } }, _t('Gửi AI sửa theo ghi chú'))),
            notes,
            h('div', { class: 'rvadd' }, nIn, nStep, h('button', { class: 'btn sm', onclick: addNote }, _t('+ Ghi chú'))))));
      });
    }
    // ghim cảnh (+ các bước được ghi chú) vào dock, soạn sẵn câu nhờ sửa — chủ bấm Gửi
    function askAi(s, i, rv) {
      if (!window.GCDock) return;
      var G = window.GCDock, lines = (rv.notes || []).map(function (n) { return '- ' + (n.step ? _t('bước {step}: ', { step: n.step }) : '') + n.text; });
      G.pin('shot:' + W.id + '/' + s.id, _t('Cảnh {n} · {title}', { n: i + 1, title: s.title }));
      var seen = {}; (rv.notes || []).forEach(function (n) { if (n.step && !seen[n.step] && Object.keys(seen).length < 3) { seen[n.step] = 1; G.pin('step:' + W.id + '/' + s.id + '/' + n.step, _t('Bước {step} · {title}', { step: n.step, title: s.title })); } });
      G.compose(_t('Sửa phân cảnh "{title}" theo ghi chú duyệt của tôi{x}\nĐề xuất bằng propose_edit để tôi xem diff rồi duyệt.', { title: s.title, x: lines.length ? ':\n' + lines.join('\n') : _t(' (đang đặt là Cần sửa)') }));
    }
    function paintVoice() {
      clear(soundBox);
      var S = GC.sounds, st = W.stats || {}, L = workLang(W);
      voiceStat.textContent = st.voiceTotal ? _t('Giọng AI đã lồng {voiceDone}/{voiceTotal} câu{x}', { voiceDone: st.voiceDone, voiceTotal: st.voiceTotal, x: st.voiceDone === st.voiceTotal ? _t(' — đủ') : '' }) : _t('Chưa có câu thoại để lồng tiếng');
      // âm thanh: luật ghép S1–S7 (engine/sounds.js) chấm cả tác phẩm — cùng bộ luật save_shot / save_work chạy ở server
      if (!S || !S.lintSoundTrack) { soundBox.appendChild(h('div', { class: 'note', text: _t('Bản này chưa nạp thư viện âm (engine/sounds.js).') })); return; }
      var issues = [];
      try { issues = S.lintSoundTrack({ shots: W.shots }, { project: W.project || '', mood: GC.film && GC.film.moodOf }); } catch (e) { issues = []; }
      var nErr = issues.filter(function (x) { return x.level === 'error'; }).length;
      soundBox.appendChild(h('div', { class: 'row' }, h('span', { class: 'chip ' + (nErr ? 'bad' : issues.length ? 'warn' : 'ok'), role: 'status', text: nErr ? _t('{nErr} lỗi', { nErr: nErr }) : issues.length ? _t('{n} cảnh báo', { n: issues.length }) : _t('✓ Đạt luật ghép S1–S7') }),
        h('span', { class: 'note', text: _t('Gói âm theo dự án: {x}', { x: W.project ? Projects.name(W.project) : _t('chưa xếp dự án') }) })));
      issues.slice(0, 30).forEach(function (x) {
        var m = /^shots\[(\d+)\]/.exec(x.path || ''), s = m ? W.shots[+m[1]] : null;
        soundBox.appendChild(h('div', { class: 'sndrow' }, h('span', { class: 'chip ' + (x.level === 'error' ? 'bad' : 'warn'), text: x.code }), h('span', { class: 'tx', text: String(x.msg).replace(/^S\d: /, '') }),
          s ? h('button', { class: 'tag', title: _t('Tới phân cảnh này'), onclick: function () { goShot(s.id); } }, _t('Cảnh {n}{x}', { n: +m[1] + 1, x: x.step >= 0 ? ' · B' + String(x.step + 1).padStart(2, '0') : '' })) : null));
      });
      if (soundWarn.length) soundBox.appendChild(h('div', { class: 'note', text: _t('Lần lưu gần nhất báo thêm: {slice}', { slice: soundWarn.slice(0, 3).join(' · ') }) }));
    }
    function goShot(id) { curShot = id; route.shot = id; saveRoute(); setTab('shots'); var e = document.getElementById('shot-' + id); if (e) { e.scrollIntoView({ block: 'center', behavior: 'smooth' }); e.classList.add('flash'); setTimeout(function () { e.classList.remove('flash'); }, 1200); } }

    /* -- GIỌNG CHỐT theo nhân vật: MỘT bảng duy nhất cho giọng của tác phẩm (CNS-106): nhân vật → vai → giọng chốt (work.voices) · nguồn · ▶ máy / ▶ AI · "Chốt giọng cả dàn (miễn phí)".
       Bộ giọng vai (22 vai: xem, nghe, thiết kế giọng) chỉ ở Thư viện › Giọng; ở đây chỉ chốt giọng cho nhân vật của tác phẩm này, theo ngôn ngữ phim của ô phía trên. -- */
    var vcCtls = {}, vcRows = [], vcL = { lang: 'vi', accent: 'bac' }, vcSel = '', vcSig = '';
    var vcInsp = h('aside', { class: 'lc-insp', 'aria-label': _t('Chi tiết nhân vật') }), vcLangNote = h('span', { class: 'note', id: 'wvLangNote' });
    var vcCastB = h('button', { class: 'btn sm', type: 'button', id: 'wvCastAll', onclick: function () { vcCastAll(); }, disabled: true,
      title: _t('Server chọn giọng cho cả dàn của tác phẩm và CHỐT vào tác phẩm (miễn phí — không đọc câu nào)') }, _t('Chốt giọng cả dàn (miễn phí)'));
    var vcEmpty = h('div', { class: 'pad note', id: 'wvEmpty', hidden: true, text: _t('Chưa có diễn viên nào trong phân cảnh — chọn diễn viên ở tab Phân cảnh hoặc nhờ AI đạo diễn.') });
    function vcAcc(lang, a) { return _l((GC.voices.LANGS[lang].accents.filter(function (x) { return x[0] === a; })[0] || [a, a])[1]); }
    function vcSample(x) { return lvLine(vcL.lang, x.role); }
    function vcMachine(x) { return GC.audio.voiceOf(x.a, { lang: vcL.lang, accent: x.accent }); }
    function vcSpeak(x) { GC.audio.unlock(); GC.audio.say(vcSample(x), vcMachine(x)); }
    function vcCtl(x, full) {   // nút ▶ AI của một nhân vật: dùng ĐÚNG giọng đã chốt; chưa chốt thì mờ
      var k = (full ? 'i:' : '') + x.id;
      if (!vcCtls[k]) vcCtls[k] = lvAiCtl(function () {
        return x.voice ? { p: { text: vcSample(x), voice: x.voice, role: x.role, lang: vcL.lang, accent: x.accent, state: 'normal', bubble: 'say' }, machine: function () { return vcMachine(x); } } : null;
      }, { who: x.a.name, full: !!full, nopWhy: _t('Chưa chốt giọng AI cho nhân vật này — bấm “Chốt giọng cả dàn (miễn phí)” hoặc Lồng tiếng AI.'), onSpend: function () { var m = vcCtls[x.id]; if (m) m.check(); AiVoice.load(true).then(function () { if (alive) paintDub(); }); } });
      return vcCtls[k];
    }
    var vcGrid = lcGrid({
      id: 'wv', label: _t('Giọng chốt theo nhân vật'), empty: _t('Chưa có diễn viên nào trong phân cảnh.'),
      cols: [
        { t: _t('Nghe'), w: 120, frozen: true, cell: function (x) {
          var m = lcPlay(_t('Nghe giọng máy — {name}', { name: x.a.name }), function () { vcSpeak(x); }); m.setAttribute('data-machine', x.id);
          return h('span', { class: 'lv-pair' }, m, vcCtl(x).el);
        } },
        { t: _t('ID nhân vật'), w: 136, frozen: true, cls: 'id', v: function (x) { return x.id; }, cell: function (x) { return x.id; }, tip: function (x) { return x.id; } },
        { t: _pt('cột', 'Nhân vật'), w: 112, v: function (x) { return x.a.name; }, cell: function (x) { return h('span', { class: 'lv-who', style: '--own:' + ownOf(x.a) }, h('span', { class: 'dot' }), x.a.name); } },
        { t: _t('Vai giọng'), w: 150, v: function (x) { return _l(GC.voices.ROLES[x.role].label); }, cell: function (x) { return [_l(GC.voices.ROLES[x.role].label), x.explicit ? null : h('span', { class: 'chip', style: 'margin-left:6px', title: _t('Chưa chọn vai trong hồ sơ nhân vật — Studio đoán từ vai trò / tính cách / tên'), text: _t('đoán') })]; } },
        { t: _t('Giọng chốt'), w: 108, cls: 'mono', v: function (x) { return x.voice; }, cell: function (x) { return x.voice || '—'; } },
        { t: _t('Nguồn'), w: 108, v: function (x) { return x.src; }, cell: function (x) { return h('span', { class: CHOT_SRC[x.src][1], title: _t(CHOT_SRC[x.src][2]), text: _t(CHOT_SRC[x.src][0]) }); } },
        { t: _t('Câu thoại'), w: 80, cls: 'num', v: function (x) { return x.nLine; }, cell: function (x) { return String(x.nLine); } },
        { t: _t('Giọng vùng'), w: 112, v: function (x) { return x.accent; }, cell: function (x) { return vcAcc(vcL.lang, x.accent); } },
        { t: _t('Câu mẫu'), w: 340, cls: 'mut', cell: function (x) { return h('span', { lang: bcpOf(vcL.lang), title: vcSample(x), text: vcSample(x) }); } }
      ],
      anchor: function (x) { return ['asset:' + x.a.key, x.a.name]; },
      onSelect: function (x) { if (x) vcSel = x.id; vcInspect(x); },
      onAct: function (x) { vcSpeak(x); },
      foot: function (v) {
        var n = 0; v.forEach(function (x) { if (x.chot) n++; });
        return [_t('{n} nhân vật · {n2} đã chốt giọng{x}', { n: v.length, n2: n, x: W ? ' · ' + W.title : '' }), h('span', { class: 'sp' }), _t('↑↓ chọn · Space nghe giọng máy')];
      }
    });
    var vcWrap = h('div', { class: 'lc' }, h('div', { class: 'lc-split slim' }, vcGrid.el, vcInsp));
    function vcInspect(x) {
      clear(vcInsp);
      if (!x) { vcInsp.appendChild(h('div', { class: 'panel pad note', text: _t('Chọn một nhân vật trong bảng.') })); return; }
      var ictl = vcCtl(x, true), sample = vcSample(x), R = GC.voices.ROLES[x.role];
      var mBtn = h('button', { class: 'btn primary lc-ic', type: 'button', 'aria-label': _t('Nghe giọng máy — {name}', { name: x.a.name }), onclick: function () { vcSpeak(x); } }, lcIcon('play'), _t('Nghe giọng máy'));
      vcInsp.appendChild(h('div', { class: 'panel' }, h('h3', null, h('span', { text: _lo(x.a, x.a.name) }), h('span', { class: 'r mono', text: x.id })),
        h('div', { class: 'pad stack' },
          h('dl', { class: 'lc-kv' }, h('dt', { text: _t('Vai giọng') }), h('dd', null, _l(R.label), ' ', h('span', { class: x.explicit ? 'chip ok' : 'chip', text: x.explicit ? _t('đã chọn') : _t('đoán') })),
            h('dt', { text: _t('Phong cách') }), h('dd', { class: 'mono', text: R.style }), h('dt', { text: _t('Giọng vùng') }), h('dd', { text: vcAcc(vcL.lang, x.accent) }),
            h('dt', { text: _t('Giọng chốt') }), h('dd', null, x.voice ? h('b', { class: 'mono', text: x.voice }) : h('span', { class: 'muted', text: _t('chưa chốt') }), ' ', h('span', { class: CHOT_SRC[x.src][1], title: _t(CHOT_SRC[x.src][2]), text: _t(CHOT_SRC[x.src][0]) })),
            h('dt', { text: 'work.voices' }), h('dd', { class: 'note', text: _t('khoá {lang}|{accent} của “{x}”', { lang: vcL.lang, accent: vcL.accent, x: W ? W.title : '' }) })),
          h('div', null, h('div', { class: 'lc-sec', text: _t('Câu mẫu · {label}', { label: _l(GC.voices.LANGS[vcL.lang].label) }) }), h('p', { class: 'lv-line', lang: GC.voices.LANGS[vcL.lang].bcp, text: sample }), h('div', { class: 'row', style: 'margin-top:8px' }, mBtn, ictl.el), ictl.note),
          h('div', { class: 'usebar' }, h('b', { text: _t('Hồ sơ') }), h('span', { class: 'note', text: _lo(x.a, x.a.faction || x.a.role || '') }),
            h('button', { class: 'btn sm', type: 'button', onclick: function () { go({ page: 'lib-characters', key: x.a.key }); } }, _t('Mở hồ sơ nhân vật ›'))))));
      if (ictl.phase === 'idle') ictl.check();
    }
    // vẽ lại bảng khi đổi tác phẩm / ngôn ngữ phim / giọng đã chốt / trạng thái giọng AI — giữ nguyên nếu không có gì đổi (không hỏi lại clip mẫu mỗi lần vẽ phòng)
    function paintVoiceTable() {
      if (!W) return;
      var L = workLang(W), chot = (W.voices || {})[L.lang + '|' + L.accent] || {};
      var rows = AiVoice.actorsOf(W).map(function (a) {
        var own = a.voice && typeof a.voice.ai === 'string' ? a.voice.ai : '', ch = typeof chot[a.id] === 'string' ? chot[a.id] : '';
        var nLine = W.shots.reduce(function (n, s) { return n + ((s.event && s.event.steps) || []).filter(function (st) { return st.actor === a.id && String(st.say || '').trim(); }).length; }, 0);
        return { id: a.id, a: a, role: AiVoice.roleOf(a), explicit: !!(a.voice && a.voice.role), accent: AiVoice.accentOf(a, L.lang, L.accent), chot: ch, own: own, voice: ch || own, src: ch ? 'chot' : own ? 'tay' : 'chua', nLine: nLine };
      });
      vcCastB.disabled = !rows.length;
      vcWrap.hidden = !rows.length; vcEmpty.hidden = !!rows.length;
      vcLangNote.textContent = _t('Ngôn ngữ phim: {label} · {vcAcc} (đổi ở ô Ngôn ngữ phía trên).', { label: _l(GC.voices.LANGS[L.lang].label), vcAcc: vcAcc(L.lang, L.accent) });
      var sig = [W.id, L.lang, L.accent, lvReady() ? 1 : 0].concat(rows.map(function (x) { return [x.id, x.role, x.accent, x.voice, x.src, x.nLine, x.a.name].join(':'); })).join('|');
      if (sig === vcSig) return;
      vcSig = sig;
      Object.keys(vcCtls).forEach(function (k) { vcCtls[k].stop(); }); vcCtls = {};
      vcL = L; vcRows = rows;
      vcGrid.set(rows, vcSel && rows.some(function (x) { return x.id === vcSel; }) ? vcSel : '');
      rows.forEach(function (x) { if (x.voice) vcCtl(x).check(); });
    }
    function vcCastAll() {
      if (!W || !vcRows.length) return;
      var w0 = W, L = workLang(w0);
      vcCastB.disabled = true; vcCastB.textContent = _t('Đang chốt…');
      AiVoice.castOf(w0, L.lang, L.accent).then(function (cast) {
        toast(_t('Đã chốt giọng cho {n} nhân vật của “{title}”.', { n: Object.keys(cast || {}).length, title: w0.title }));
        return Store.api('GET', 'api/works/' + w0.id).then(function (w) { if (alive && W && W.id === w.id) { W.voices = w.voices; paintVoiceTable(); } });   // đọc lại work.voices server vừa chốt
      }).catch(function (e) { toast(lvErr(e) + '.'); })
        .then(function () { vcCastB.textContent = _t('Chốt giọng cả dàn (miễn phí)'); vcCastB.disabled = !vcRows.length; });
    }
    voiceBox.appendChild(vcWrap); voiceBox.appendChild(vcEmpty);
    onLeave(function () { Object.keys(vcCtls).forEach(function (k) { vcCtls[k].stop(); }); });

    /* -- bố cục các tab -- */
    var stageBox = h('div', { class: 'revstage' }, stage);
    var voiceStat = h('span', { class: 'note' });
    var saveScriptB = h('button', { class: 'btn sm primary', onclick: saveScript }, _t('Lưu'));
    panels.script = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, _t('Kịch bản'), h('span', { class: 'r' }, saveScriptB)), h('div', { class: 'pad stack' }, logline, script)),
      h('div', { class: 'panel' }, h('h3', null, _t('Dàn nhân vật'), h('span', { class: 'r note', text: _t('diễn viên của mọi phân cảnh') })), castBox),
      h('div', { class: 'panel' }, h('h3', null, _t('Ngôn ngữ phim'), h('span', { class: 'r note', text: _t('giọng máy đọc · giọng AI · lồng tiếng theo ngôn ngữ này') })), h('div', { class: 'pad row' }, langSel2, langNote2)));
    panels.shots = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, _t('Phân cảnh'), h('span', { class: 'r row' }, h('span', { class: 'note', text: _t('AI đạo diễn viết ra gì thì hiện ở đây — đề xuất sửa chờ bạn duyệt') }), h('button', { class: 'btn sm', onclick: function () { saveShot({ shot: { title: _t('Phân cảnh mới'), scene: (GC.scenes()[0] || {}).key || '' } }); } }, _t('+ Phân cảnh')))),
        h('div', { class: 'pad stack' }, readyBox, shotsBox)),
      evPanel);
    panels.review = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, _t('Xem thử'), h('span', { class: 'r' }, prog)),
        h('div', { class: 'pad revtop' }, stageBox,
          h('div', { class: 'revside stack' },
            h('div', { class: 'row' }, h('button', { class: 'btn primary', 'data-playall': '1', onclick: function () { if (W) player.play(W.shots, W.title); } }, _t('▶ Cả phim')), h('button', { class: 'btn', onclick: function () { player.stop(); } }, _t('Dừng')), sumBadge),
            h('div', { class: 'usebar' }, h('b', { text: _pt('hộp', 'Âm thanh') }), audioControls(), dialogControl(player)),
            h('div', { class: 'note', text: _t('Bấm "▶ Cảnh" ở từng hàng để xem lại một cảnh; đặt trạng thái Nháp / Cần sửa / Đạt và ghi chú (gắn cảnh hoặc một bước). "Gửi AI sửa theo ghi chú" ghim cảnh vào Trợ lý AI ở cột phải.')})))),
      h('div', { class: 'panel' }, h('h3', null, _t('Duyệt từng cảnh'), h('span', { class: 'r note', text: _t('ghi chú lưu trong tác phẩm — AI đọc được qua get_work › review') })), h('div', { class: 'pad stack' }, allNote, reviewList)));
    panels.voice = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, _t('Ngôn ngữ & giọng vùng')), h('div', { class: 'pad stack' },
        h('div', { class: 'stack', style: 'gap:6px' }, h('div', { class: 'usebar' }, h('b', { text: _t('Ngôn ngữ') }), langSel, langNote), h('div', { class: 'usebar' }, h('b', { text: _t('Giọng vùng') }), regionNote, regionB), regionBox))),
      h('div', { class: 'panel' }, h('h3', null, _t('Lồng tiếng AI'), h('span', { class: 'r' }, voiceStat)), h('div', { class: 'pad stack' },
        h('div', { class: 'usebar' }, h('b', { text: _t('Lồng tiếng') }), dubB, dubNote), dubBox, castNote)),
      h('div', { class: 'panel' }, h('h3', null, _t('Giọng chốt theo nhân vật'), h('span', { class: 'r row' }, vcCastB, h('button', { class: 'btn sm', type: 'button', id: 'wvToLib', title: _t('Xem, nghe và thiết kế giọng cho 22 vai ở Thư viện › Giọng'), onclick: function () { go({ page: 'lib-voices', project: (W && W.project) || undefined }); } }, _t('Bộ giọng vai ›')))),
        h('div', { class: 'pad stack' }, h('div', { class: 'row' }, vcLangNote, h('span', { class: 'note', style: 'margin-left:12px', text: _t('Mỗi nhân vật một giọng, chốt theo tác phẩm — Studio, MCP và phim xuất cùng một giọng.') })), voiceBox)),
      h('div', { class: 'panel' }, h('h3', null, _pt('hộp', 'Âm thanh'), h('span', { class: 'r note', text: _t('luật ghép S1–S7 của cả tác phẩm') })), h('div', { class: 'pad stack' }, soundBox)));
    panels.publish = h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', null, _t('Xuất bản'), h('span', { class: 'r note', text: _t('phim · storyboard · dữ liệu · gói dự án') })), h('div', { class: 'pad stack' },
        h('div', { class: 'usebar' }, h('b', { text: _t('Phim') }),
          h('button', { class: 'btn sm primary', title: _t('Một tệp .html chạy được ở mọi trình duyệt, không cần cài gì — gửi cho người xem. Còn câu chưa có giọng AI thì hỏi trước: lồng tiếng rồi xuất / xuất luôn'), onclick: function () { exportClick('html'); } }, _t('Phim (HTML)')),
          videoB, videoWhy),
        exportBox, videoBox,
        h('div', { class: 'usebar' }, h('b', { text: 'Storyboard' }),
          h('button', { class: 'btn sm', title: _t('Bảng phân cảnh: ảnh từng cảnh + mô tả + lời thoại'), onclick: function () { if (W) download(W.id + '-storyboard.svg', storyboard(W), 'image/svg+xml'); } }, 'Storyboard SVG'),
          h('button', { class: 'btn sm', onclick: function () {
            if (!W) return;
            try { var sv = storyboard(W), m = sv.match(/viewBox="0 0 (\d+) (\d+)"/); savePng(W.id + '-storyboard.png', svgURL(sv), +m[1], +m[2]); }
            catch (e) { toast(_t('Không dựng được storyboard PNG: {message} — thử bản SVG.', { message: e.message })); }
          } }, 'Storyboard PNG')),
        h('div', { class: 'usebar' }, h('b', { text: _t('Dữ liệu') }),
          h('button', { class: 'btn sm', title: _t('Kịch bản + phân cảnh + lời thoại + ghi chú duyệt dạng JSON'), onclick: function () { if (W) download(W.id + '.json', JSON.stringify(Object.assign({}, W, { chat: undefined, stats: undefined, proposals: undefined }), null, 2), 'application/json'); } }, 'JSON'),
          h('button', { class: 'btn sm', title: _t('Gói sao lưu của cả dự án chủ đề (asset + tác phẩm + gói động tác + gói âm) — nhập lại ở máy khác'), onclick: function () { if (W && W.project) exportBundle({ id: W.project, name: Projects.name(W.project) }, false); else toast(_t('Tác phẩm chưa xếp dự án — chọn dự án ở Thư viện › Dự án chủ đề.')); } }, _t('Gói dự án (.json)'))))));
    var body = h('div', { class: 'room' }, headBox, tabbar);
    WORK_TABS.forEach(function (t) { panels[t[0]].id = 'wpanel-' + t[0]; panels[t[0]].setAttribute('role', 'tabpanel'); panels[t[0]].setAttribute('aria-labelledby', 'wtab-' + t[0]); panels[t[0]].hidden = t[0] !== tab; body.appendChild(panels[t[0]]); });
    $('view').appendChild(h('div', anc({ class: 'works room-wrap' }, 'work:' + r.work, r.work), body));
    function paint() {
      stillCache = {};
      syncLang(); paintDub(); paintHead(); paintTabs(); paintVideoBtn(); paintVideo();
      logline.value = draftScript ? draftScript.logline : W.logline || ''; script.value = draftScript ? draftScript.script : W.script || '';
      langSel2.value = langSel.value; langNote2.textContent = langNote.textContent; langNote2.className = langNote.className;
      paintCast(); paintShots(); paintReview(); paintVoice();
      var firstReady = W.shots.filter(function (s) { return s.scene; })[0];
      player.show(firstReady || null);
      paintReady();
    }
    // phân cảnh nào diễn được, còn thiếu gì — bấm để tới đúng phân cảnh (không cần AI)
    function paintReady() {
      clear(readyBox);
      var rs = GC.film.readiness(W), ok = rs.filter(function (x) { return x.ok; }).length;
      if (!rs.length) return;
      var bar = h('div', { class: 'readybar' }, h('span', { class: 'meter' }, h('i', { style: 'width:' + Math.round(ok / rs.length * 100) + '%' })),
        h('b', { text: ok === rs.length ? _t('Sẵn sàng diễn cả {n} phân cảnh', { n: rs.length }) : _t('Sẵn sàng {ok}/{n} phân cảnh', { ok: ok, n: rs.length }) }));
      readyBox.appendChild(bar);
      rs.filter(function (x) { return !x.ok; }).forEach(function (x) {
        readyBox.appendChild(h('button', { class: 'readyrow', onclick: function () { var e = document.getElementById('shot-' + x.shot.id); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); e.classList.add('flash'); setTimeout(function () { e.classList.remove('flash'); }, 1200); } } },
          h('span', { class: 'stepn', text: String(x.index + 1) }), h('span', { text: x.shot.title }), h('span', { class: 'note', text: _t('thiếu: {missing}', { missing: x.missing.join(', ') }) }), h('span', { class: 'go', text: _t('Sửa ›') })));
        // thiếu diễn viên / bối cảnh mà Thư viện chưa có cái hợp → tạo ngay ở Xưởng, đúng dự án của tác phẩm
        var nd = x.needs || [], need = nd.indexOf('cast') >= 0 ? 'character' : nd.indexOf('scene') >= 0 ? 'scene' : null;
        if (need) readyBox.lastChild.appendChild(h('span', { class: 'go', title: _t('Mở Xưởng › Tạo asset mới (dự án {name})', { name: Projects.name(W.project || '') }), onclick: function (ev) { ev.stopPropagation(); go({ page: 'create', kind: need, project: W.project || '' }); } }, need === 'character' ? _t('+ Nhân vật ở Xưởng') : _t('+ Bối cảnh ở Xưởng')));
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
  function savePng(name, url, w, hgt) { rasterize(url, w, hgt).then(function (b) { downloadBlob(name, b); }).catch(function () { toast(_t('Không dựng được PNG.')); }); }
  function copyText(text, what) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(_t('Đã chép {what}.', { what: what })); } catch (e) { toast(_t('Trình duyệt chặn chép — bôi đen trong ô mã rồi chép tay.')); }
      ta.remove();
    }
    try { navigator.clipboard.writeText(text).then(function () { toast(_t('Đã chép {what}.', { what: what })); }, fallback); } catch (e) { fallback(); }
  }
  // Ô mã nhiều thẻ: [nhãn, () => chuỗi]. Luôn hiện đúng thứ sẽ được chép.
  function codeBox(tabs) {
    var cur = 0, seg = h('div', { class: 'seg' }), ta = h('textarea', { class: 'code', rows: '9', readonly: true, spellcheck: 'false', 'aria-label': _t('Mã') });
    function show() { ta.value = tabs[cur][1](); Array.prototype.forEach.call(seg.children, function (b, i) { b.setAttribute('aria-pressed', String(i === cur)); }); }
    tabs.forEach(function (t, i) { seg.appendChild(h('button', { onclick: function () { cur = i; show(); } }, _l(t[0]))); });   // nhãn: msgid (N_) hoặc đã dịch
    var box = h('div', { class: 'stack', style: 'gap:6px' }, h('div', { class: 'row' }, seg, h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { copyText(ta.value, _l(tabs[cur][0]).toLowerCase()); } }, _t('Chép'))), ta);
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
  function mcpCall(tool, args) { return '// ' + _t('Agent (MCP) hoặc Trợ lý AI trong Studio gọi:') + '\n' + tool + ' ' + JSON.stringify(args, null, 2); }

  /* ============================================================ THƯ VIỆN: thành phẩm theo nhóm, lấy về dùng */
  function groupOf(x) { return (GC.PACKS[x.pack] || {}).group || 'community'; }
  // mục của Thư viện: chính thức → từng dự án chủ đề → chưa xếp dự án → nhóm → cộng đồng
  function secOf(x) { var g = groupOf(x); return g === 'mine' ? 'p:' + (x.project || '') : g; }
  function sections(all) {
    var out = [['official', _t('Chính thức')]];
    Projects.all().forEach(function (p) { out.push(['p:' + p.id, _t('Dự án · {name}', { name: p.name })]); });
    out.push(['p:', _t('Chưa xếp dự án')], ['team', _t('Nhóm')], ['community', _t('Cộng đồng')]);
    return out.filter(function (s) { return all.some(function (x) { return secOf(x) === s[0]; }); });
  }
  // cfg: { title, fab (trang Tạo tác tương ứng), list(), find(key), sub(x) → nhãn nhóm con, thumb(x) → url, wide?, inspect(x, box) }
  function libPage(cfg, r) {
    crumbs([{ t: cfg.title }]);
    actions(h('span', { class: 'note', text: _t('Thành phẩm đã qua cổng kiểm — chọn, xem, tải ảnh hoặc chép mã.') }),
      h('button', { class: 'btn', onclick: function () { go({ page: 'create' }); } }, _t('Tạo asset mới ở Xưởng ›')));
    var list0 = function () { return cfg.list().filter(function (x) { return groupOf(x) !== 'frame'; }); };   // khung thuộc Xưởng, không bày ở Thư viện
    var q = '', grp = r.project != null ? 'p:' + r.project : 'all', sub = 'all', sel = cfg.find(r.key) || list0()[0];
    if (sel && groupOf(sel) === 'frame') sel = list0()[0];
    var search = h('input', { type: 'search', placeholder: _t('Tìm: tên, mã, thư viện…'), style: 'width:260px', oninput: function () { q = search.value.trim().toLowerCase(); paint(); } });
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
      clear(gseg); chip(gseg, grp, 'all', _t('Tất cả'), function (v) { grp = v; });
      var SECS = sections(all);
      SECS.forEach(function (g) { chip(gseg, grp, g[0], g[1], function (v) { grp = v; }); });
      clear(subs); chip(subs, sub, 'all', _t('Mọi nhóm'), function (v) { sub = v; });
      all.map(cfg.sub).filter(function (x, i, a) { return a.indexOf(x) === i; }).forEach(function (sv) { chip(subs, sub, sv, sv, function (v) { sub = v; }); });
      clear(body);
      SECS.forEach(function (g) {
        if (grp !== 'all' && grp !== g[0]) return;
        var part = list.filter(function (x) { return secOf(x) === g[0] && (sub === 'all' || cfg.sub(x) === sub); });
        if (!part.length) return;
        var row = h('div', { class: 'libgrid' });
        part.forEach(function (x) {
          row.appendChild(h('button', anc({ class: 'libcard', 'aria-pressed': String(sel && x.key === sel.key), title: x.key, onclick: function () { sel = x; paint(); paintInsp(); } }, cfg.anchor ? cfg.anchor + ':' + x.key : null, _lo(x, x.name)),
            h('div', { class: 'im' }, h('img', { src: cfg.thumb(x), alt: _lo(x, x.name), loading: 'lazy' })),
            h('div', { class: 'lb' }, h('b', { text: _lo(x, x.name) }), h('span', { class: 'note', text: cfg.sub(x) }))));
        });
        body.appendChild(h('div', { class: 'panel' }, h('h3', null, g[1], h('span', { class: 'r note', text: part.length + ' / ' + all.filter(function (x) { return secOf(x) === g[0]; }).length })), h('div', { class: 'pad' }, row)));
      });
      if (!body.children.length) body.appendChild(h('div', { class: 'panel pad note lib-empty', text: all.length ? _t('Không có gì khớp bộ lọc.') : _t('Thư viện chưa có {toLowerCase} nào. Asset được tạo từ bộ khung chuẩn (Xưởng) rồi mới lưu vào đây theo dự án chủ đề.', { toLowerCase: cfg.title.toLowerCase() }) }));
    }
    function paintInsp() { clear(insp); dockObj('asset', sel && sel.key, sel && _lo(sel, sel.name)); if (sel) cfg.inspect(sel, insp); }
    onData(function () { paint(); paintInsp(); });   // AI vừa tạo / sửa asset: danh sách vẽ lại
    paint(); paintInsp();
  }
  function useHead(x, box, extra) {
    // asset của tôi: đổi dự án chủ đề ngay tại Thư viện (lưu lại qua đúng cổng ghi của loại đó)
    var pub = GC.statusOf(x.status) === 'published', smp = (Projects.all().filter(function (p) { return p.id === x.project; })[0] || {}).sample;
    var stay = Object.assign({}, route, { key: x.key });   // lưu xong vẫn đứng ở asset này, không nhảy về đầu danh sách
    var pj = x.pack === MY_PACK ? h('div', { class: 'row' }, h('span', { class: 'note', text: _t('Dự án chủ đề') }), projectSelect(x.project || '', function (v) {
      var d = clone(x); d.project = v;
      resave(d, _t('Chuyển sang dự án {name}', { name: Projects.name(v) })).then(function () { toast(_t('Đã chuyển {name} sang {name2}', { name: x.name, name2: Projects.name(v) })); go(stay); }).catch(function (e) { toast(e.message); });
    }), smp ? h('span', { class: 'chip', title: smp.license || '', text: _t('Bộ mẫu {x}', { x: smp.owner || 'Gen Labs' }) }) : h('span', { class: pub ? 'chip ok' : 'chip', text: pub ? _t('Phát hành') : _t('Nháp') }),
      // Nháp = dùng ngay trong dự án; Phát hành = vào gói bán (nhân vật cần dấu nhận diện — cổng kiểm sẽ báo nếu thiếu)
      smp ? null : h('button', { class: 'btn sm', title: pub ? _t('Đưa về nháp: không còn trong gói bán') : _t('Phát hành: đưa vào gói bán của dự án'), onclick: function () {
        var d = clone(x); d.status = pub ? 'draft' : 'published';
        resave(d, pub ? _t('Về nháp') : _t('Phát hành')).then(function () { toast(pub ? _t('Đã đưa {name} về nháp.', { name: x.name }) : _t('Đã phát hành {name} — có trong gói bán của dự án.', { name: x.name })); go(stay); }).catch(function (e) { toast(e.message); });
      } }, pub ? _t('Về nháp') : _t('Phát hành'))) : null;
    box.appendChild(h('div', { class: 'panel' }, h('h3', null, _lo(x, x.name) + (x.han ? ' · ' + x.han : ''), h('span', { class: 'r mono', text: x.key })),
      h('div', { class: 'pad stack' }, pj, extra)));
  }

  // ---- Thư viện › Nhân vật
  var charThumb = new Map();
  PAGES['lib-characters'] = function (r) {
    libPage({
      title: _t('Nhân vật'), anchor: 'asset', fab: 'characters', list: function () { return GC.assets(); }, find: function (k) { return GC.ASSETS[k]; },
      sub: function (a) { return a.faction ? _lo(a, a.faction) : _t('Khác'); },
      thumb: function (a) { return R.imageURL(a, 'normal', {}); },
      inspect: function (a, box) {
        var u = { state: 'normal', activity: '', view: 'front' };
        var stg = h('div', { class: 'stage', style: 'height:300px;border-radius:6px;overflow:hidden' });
        var selS = h('select', { onchange: function () { u.state = selS.value; paintU(); } });
        LIB.stateOrder.forEach(function (s0) { selS.appendChild(h('option', { value: s0, text: stateLabel(s0) })); });
        var selA = h('select', { onchange: function () { u.activity = selA.value; if (u.activity && LIB.activities[u.activity].state) { u.state = LIB.activities[u.activity].state; selS.value = u.state; } paintU(); } });
        selA.appendChild(h('option', { value: '', text: _t('— hoạt động —') }));
        LIB.activityOrder.forEach(function (k) { selA.appendChild(h('option', { value: k, text: _l(LIB.activities[k].label) })); });
        var vseg = h('div', { class: 'seg' });
        var vsel = h('select', { 'aria-label': _t('Góc nhìn'), onchange: function () { u.view = vsel.value; paintU(); } });
        VIEWS_ALL.forEach(function (v) { vsel.appendChild(h('option', { value: v[0], text: _t(v[1]) })); });
        vsel.value = u.view;
        function dir() { var d = {}; if (u.activity) d.activity = u.activity; if (u.view !== 'front') d.view = u.view; return Object.keys(d).length ? d : undefined; }
        function name() { return a.id + '-' + u.state + (u.activity ? '-' + u.activity : '') + (u.view !== 'front' ? '-' + u.view : ''); }
        var code;
        function paintU() { clear(stg); R.image(stg, a, u.state, { director: dir() }); if (code) code.refresh(); }
        var mine = a.pack === MY_PACK;
        code = codeBox([
          [N_('Mã tham chiếu'), function () { return a.key + '\n\n// ' + _t('trong kịch bản:') + ' { "actor": "' + a.id + '", "state": "' + u.state + '"' + (u.activity ? ', "activity": "' + u.activity + '"' : '') + (u.view !== 'front' ? ', "view": "' + u.view + '"' : '') + ', "say": "…" }\n// ' + _t('trong cảnh:') + '   cast: [{ "character": "' + a.key + '", "spot": "center" }]'; }],
          [N_('Gọi qua MCP'), function () { var x = { key: a.key, state: u.state }; if (u.activity) x.activity = u.activity; if (u.view !== 'front') x.view = u.view; return mcpCall('render_character', x); }],
          [N_('Nhúng web'), function () {
            var d = dir();
            return '<!-- gen-chibi · © 2026 Gen Labs. ' + _t('Chép thư mục engine/ và kinds/ từ bản cài vào cạnh trang này.') + ' -->\n<div id="chibi" style="width:248px;height:258px"></div>\n' + engineScripts(true) + '\n<script>\n  var GC = GenChibi; GC.render.injectCSS();\n' +
              (mine ? '  GC.registerAsset("' + MY_PACK + '", ' + jsonForScript(a) + ');\n' : '') +
              '  var chibi = GC.render.full(document.getElementById("chibi"), GC.ASSETS[' + jsonForScript(a.key) + '], "normal");\n  chibi.setState(' + jsonForScript(u.state) + (d ? ', ' + jsonForScript(d) : '') + ');   // ' + _t('đổi biểu cảm / hoạt động khi cần') + '\n</script>';
          }],
          ['SVG', function () { return GC.svgString(a, u.state, { director: dir() }); }],
          [_t('JSON công thức'), function () { return JSON.stringify(a, null, 2); }]
        ]);
        useHead(a, box, [
          stg, h('div', { class: 'row' }, selS, selA, vsel),
          h('div', { class: 'note', text: (a.identity && a.identity.p1 ? _t('Nhận diện: {p1}. ', { p1: a.identity.p1 }) : '') + (a.persona || '') }),
          voiceRow(a, mine),
          h('div', { class: 'usebar' }, h('b', { text: _t('Tải ảnh') }),
            h('button', { class: 'btn sm', onclick: function () { download(name() + '.svg', GC.svgString(a, u.state, { director: dir() }), 'image/svg+xml'); } }, 'SVG'),
            h('button', { class: 'btn sm', onclick: function () { savePng(name() + '-512.png', R.imageURL(a, u.state, { director: dir() }), 512, Math.round(512 * 258 / 248)); } }, 'PNG 512'),
            h('button', { class: 'btn sm', onclick: function () { savePng(a.id + '-avatar-256.png', R.imageURL(a, u.state, { crop: true, noShadow: true, director: dir() }), 256, 256); } }, 'Avatar 256'),
            h('button', { class: 'btn sm', onclick: function () { spriteSheet(a); } }, _t('Sprite {n} biểu cảm', { n: LIB.stateOrder.length })),
            h('button', { class: 'btn sm', title: _t('Một hàng 8 hướng (vòng theo chiều kim đồng hồ từ chính diện), theo biểu cảm + hoạt động đang chọn'), onclick: function () { sprite8(a, u.state, u.activity); } }, _t('Sprite 8 hướng'))),
          h('div', { class: 'usebar' }, h('b', { text: _t('Tải mã') }),
            h('button', { class: 'btn sm', onclick: function () { download(a.id + '.json', JSON.stringify(a, null, 2), 'application/json'); } }, _t('JSON công thức'))),
          code,
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'character', key: a.key, tab: 'look' }); } }, mine ? _t('Sửa ở bàn chỉnh (Xưởng) ›') : _t('Phối bản của tôi ở Xưởng ›')))
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
        if (++done === DIR8.length) c.toBlob(function (b) { downloadBlob(a.id + '-8dir-' + (activity || state) + '.png', b); toast(_t('Thứ tự ô: {DIR8}', { DIR8: DIR8.join(', ') })); }, 'image/png');
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
        if (++done === LIB.stateOrder.length) c.toBlob(function (b) { downloadBlob(a.id + '-sprites-' + cols + 'x' + rows + '.png', b); toast(_t('Thứ tự ô: {stateOrder}', { stateOrder: LIB.stateOrder.join(', ') })); }, 'image/png');
      };
      img.src = R.imageURL(a, s0, {});
    });
  }

  // ---- Thư viện › Trang bị
  PAGES['lib-items'] = function (r) {
    var I = GC.ITEM;
    libPage({
      title: _t('Vật phẩm'), anchor: 'item', fab: 'items', list: function () { return GC.items(); }, find: function (k) { return k ? GC.getItem(k) : null; },
      sub: function (it) { return _l((I.types[it.type] || {}).label || it.type); },
      thumb: function (it) { return svgURL(GC.itemSvg(it, { size: 128 })); },
      inspect: function (it, box) {
        var who = 'ma-no-canh', tryBox = h('div', { class: 'stage', style: 'height:200px;border-radius:6px;overflow:hidden;flex:1' });
        var whoSel = h('select', { onchange: function () { who = whoSel.value; paintTry(); } });
        GC.assets().forEach(function (a) { whoSel.appendChild(h('option', { value: a.id, text: _lo(a, a.name), selected: a.id === who })); });
        function paintTry() {
          clear(tryBox);
          var base = GC.assets().filter(function (a) { return a.id === who; })[0] || GC.assets()[0];
          var a = clone(base); a.key = 'try/' + base.id + '-' + it.key.replace(/[^a-z0-9]/gi, ''); a.look.equip = Object.assign({}, a.look.equip); a.look.equip[it.equip.slot] = it.key;
          R.image(tryBox, a, 'normal', { director: { view: 'left45' } });
        }
        var R0 = I.rarity[it.rarity] || I.rarity.common;
        useHead(it, box, [
          h('div', { class: 'row', style: 'align-items:flex-start;gap:12px' },
            h('img', { src: svgURL(GC.itemSvg(it, { mode: 'card' })), alt: _t('thẻ {name}', { name: it.name }), style: 'width:160px' }),
            h('div', { class: 'stack', style: 'flex:1;gap:6px' }, h('span', { class: 'note', style: 'color:' + R0.color, text: _l(R0.label) + ' · ' + (_l((I.types[it.type] || {}).label || it.type)) }),
              h('label', { class: 'note', text: _t('Mặc thử lên') }), whoSel, tryBox)),
          h('div', { class: 'usebar' }, h('b', { text: _t('Tải ảnh') }),
            h('button', { class: 'btn sm', onclick: function () { download(it.id + '-icon.svg', GC.itemSvg(it, { size: 256 }), 'image/svg+xml'); } }, 'Icon SVG'),
            h('button', { class: 'btn sm', onclick: function () { savePng(it.id + '-icon-256.png', svgURL(GC.itemSvg(it, { size: 256 })), 256, 256); } }, 'Icon PNG 256'),
            h('button', { class: 'btn sm', onclick: function () { download(it.id + '-the.svg', GC.itemSvg(it, { mode: 'card' }), 'image/svg+xml'); } }, _t('Thẻ SVG')),
            h('button', { class: 'btn sm', onclick: function () { savePng(it.id + '-the-480.png', svgURL(GC.itemSvg(it, { mode: 'card' })), 480, 660); } }, _t('Thẻ PNG'))),
          h('div', { class: 'usebar' }, h('b', { text: _t('Tải mã') }),
            h('button', { class: 'btn sm', onclick: function () { download(it.id + '.json', JSON.stringify(it, null, 2), 'application/json'); } }, 'JSON item')),
          codeBox([
            [N_('Mã tham chiếu'), function () { return it.key + '\n\n// ' + _t('nhân vật mặc item: trong công thức nhân vật') + '\n"look": { "equip": { "' + it.equip.slot + '": "' + it.key + '" } }'; }],
            [_t('Gọi qua MCP'), function () { return mcpCall('render_item', { key: it.key, mode: 'card' }) + '\n\n' + mcpCall('render_item', { key: it.key, mode: 'equipped', character: who, view: 'left45' }); }],
            ['SVG icon', function () { return GC.itemSvg(it, { size: 256 }); }],
            ['JSON item', function () { return JSON.stringify(it, null, 2); }]
          ]),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'items', key: it.key }); } }, it.pack === MY_PACK ? _t('Sửa ở bàn chỉnh (Xưởng) ›') : _t('Phối bản của tôi ở Xưởng ›')))
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
      var sel = h('select', { 'aria-label': _t('Diễn viên ở {label}', { label: _l(GC.SCENE.spots[c.spot].label) }), onchange: function () { c.id = sel.value; onChange(); } });
      sel.appendChild(h('option', { value: '', text: _t('— trống —') }));
      GC.assets().forEach(function (a) { sel.appendChild(h('option', { value: a.id, text: _lo(a, a.name), selected: a.id === c.id })); });
      row.appendChild(h('label', { class: 'note', style: 'display:flex;gap:6px;align-items:center' }, _l(GC.SCENE.spots[c.spot].label), sel));
    });
    row.cast = function () { return cast.filter(function (c) { return c.id; }).map(function (c) { return { character: GC.getAsset(c.id, MY_PACK) ? GC.getAsset(c.id, MY_PACK).key : c.id, spot: c.spot }; }); };
    return row;
  }
  PAGES['lib-scenes'] = function (r) {
    var S = GC.SCENE;
    libPage({
      title: _t('Bối cảnh'), anchor: 'scene', fab: 'scenes', wide: true, list: function () { return GC.scenes(); }, find: function (k) { return k ? GC.getScene(k) : null; },
      sub: function (sc) { var p = sc.layers.sky && GC.getPart('sky', sc.layers.sky.part); return p && p.outdoor === false ? _t('Trong nhà') : _t('Ngoài trời'); },
      thumb: function (sc) { return sceneURL(sc, { size: 320 }); },
      inspect: function (sc, box) {
        var u = { time: sc.time, weather: sc.weather };
        var img = h('img', { alt: _lo(sc, sc.name), style: 'width:100%;display:block;border-radius:6px' });
        var tseg = h('div', { class: 'seg' });
        S.timeOrder.forEach(function (t) { tseg.appendChild(h('button', { 'aria-pressed': String(u.time === t), onclick: function () { u.time = t; Array.prototype.forEach.call(tseg.children, function (b, i) { b.setAttribute('aria-pressed', String(S.timeOrder[i] === t)); }); paintU(); } }, _l(S.times[t].label))); });
        var wsel = h('select', { 'aria-label': _t('Thời tiết'), onchange: function () { u.weather = wsel.value; paintU(); } });
        S.weatherOrder.forEach(function (w) { wsel.appendChild(h('option', { value: w, text: _l(S.weathers[w].label), selected: w === u.weather })); });
        var picker = castPicker(function () { paintU(); });
        function opts(extra) { var o = { cast: picker.cast() }; if (u.time !== sc.time) o.time = u.time; if (u.weather !== sc.weather) o.weather = u.weather; return Object.assign(o, extra || {}); }
        function svg(extra) { return GC.sceneSvg(sc, opts(extra)); }
        function name() { return sc.id + (u.time !== sc.time ? '-' + u.time : '') + (u.weather !== sc.weather ? '-' + u.weather : '') + (picker.cast().length ? '-dien-vien' : ''); }
        var code;
        function paintU() { img.src = svgURL(svg()); if (code) code.refresh(); }
        code = codeBox([
          [N_('Mã tham chiếu'), function () { return sc.key + '\n\n// ' + _t('kịch bản đặt vào cảnh này:') + '\n{ "title": "…", "scene": "' + sc.key + '", "steps": [{ "actor": "ma-no-canh", "spot": "midLeft", "state": "normal", "say": "…" }] }'; }],
          [N_('Gọi qua MCP'), function () { var x = { key: sc.key, cast: picker.cast() }; if (u.time !== sc.time) x.time = u.time; if (u.weather !== sc.weather) x.weather = u.weather; return mcpCall('render_scene', x); }],
          [N_('Nhúng web'), function () {
            return '<!-- gen-chibi · © 2026 Gen Labs. ' + _t('Chép thư mục engine/ và kinds/ từ bản cài vào cạnh trang này.') + ' -->\n<div id="canh" style="width:640px"></div>\n' + engineScripts(false) + '\n<script>\n  var GC = GenChibi;\n' +
              (sc.pack === MY_PACK ? '  GC.pack({ id: "' + MY_PACK + '", name: "Của tôi", owner: "Bạn", license: "Thuộc người tạo" }, function (D) { D.scene(' + jsonForScript(sc) + '); });\n' : '') +   // i18n-ignore(mã nhúng: siêu dữ liệu gói, khớp engine)
              '  document.getElementById("canh").innerHTML = GC.sceneSvg(GC.SCENES[' + jsonForScript(sc.key) + '], ' + jsonForScript(opts()) + ');\n</script>';
          }],
          ['SVG', function () { return svg(); }],
          [_t('JSON cảnh'), function () { return JSON.stringify(sc, null, 2); }]
        ]);
        useHead(sc, box, [
          img, h('div', { class: 'row' }, tseg, wsel), picker,
          h('div', { class: 'note', text: _lo(sc, sc.description) || '' }),
          h('div', { class: 'usebar' }, h('b', { text: _t('Tải ảnh') }),
            h('button', { class: 'btn sm', onclick: function () { download(name() + '.svg', svg(), 'image/svg+xml'); } }, 'SVG'),
            h('button', { class: 'btn sm', onclick: function () { savePng(name() + '-1280.png', svgURL(svg()), 1280, 720); } }, 'PNG 1280×720'),
            h('button', { class: 'btn sm', onclick: function () { savePng(name() + '-1920.png', svgURL(svg()), 1920, 1080); } }, 'PNG 1920×1080'),
            h('button', { class: 'btn sm', onclick: function () { savePng(sc.id + '-nen-1920.png', svgURL(GC.sceneSvg(sc, opts({ cast: [] }))), 1920, 1080); } }, _t('Nền trống 1920'))),
          h('div', { class: 'usebar' }, h('b', { text: _t('Tải mã') }),
            h('button', { class: 'btn sm', onclick: function () { download(sc.id + '.json', JSON.stringify(sc, null, 2), 'application/json'); } }, _t('JSON cảnh'))),
          code,
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { go({ page: 'scenes', key: sc.key }); } }, sc.pack === MY_PACK ? _t('Sửa ở bàn chỉnh (Xưởng) ›') : _t('Phối bản của tôi ở Xưởng ›')))
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
  // MỘT câu điều khoản bộ mẫu Gen Labs (Q47, CNS-240) — cùng câu ở studio/mau/*.json, ASSET_MANIFEST.md, server/mcp.js, tài liệu
  var SAMPLE_TERMS = N_('xem, thử, làm phim; được đăng phim / video làm từ bộ mẫu kèm dòng ghi công "Made with gen-chibi · Gen Labs"; không bán lại, không phân phối lại tệp hay asset của bộ mẫu');
  // smp (tuỳ chọn): dấu bộ mẫu của dự án chứa gói → bản tải về ghi rõ sample { owner, license }
  function motionPackOut(P, smp) {
    var o = clone(P); ['pack', 'key', 'version', 'savedAt', 'note'].forEach(function (k) { delete o[k]; });
    if (smp) o.sample = { owner: smp.owner || 'Gen Labs', license: _t('Bộ mẫu — {SAMPLE_TERMS}', { SAMPLE_TERMS: _t(SAMPLE_TERMS) }) };
    return o;
  }
  PAGES['lib-motions'] = function (r) {
    crumbs([{ t: _t('Động tác') }]);
    var C = GC.choreo;
    if (!C) { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: _t('Bản này chưa nạp bộ biên đạo (engine/choreo.js).') })); return; }
    var server = Store.mode === 'server';
    // gói nhập về thuộc một dự án (mọi asset đều thuộc một dự án): mặc định dự án vừa dùng — trừ dự án MẪU (gói tự làm rơi vào bộ mẫu
    // sẽ mang dấu mẫu, không bán được); để trống thì giữ dự án ghi trong tệp (nếu có)
    var impProj = (function (v) { var P = Projects.list.filter(function (x) { return x.id === v; })[0]; return P && P.sample ? '' : v; })(lastProject());
    actions(h('span', { class: 'note', text: _t('Đòn của bộ khung + gói động tác theo chủ đề — xem trước, tải hoạt ảnh.') }),
      server ? h('span', { class: 'note', text: _t('Nhập vào dự án') }) : null,
      server ? projectSelect(impProj, function (v) { impProj = v; }) : null,
      server ? h('button', { class: 'btn', title: _t('Tệp gói động tác (.json, {format}) — đi qua cổng kiểm như mọi asset. Gói thuộc dự án đang chọn ở ô bên cạnh', { format: C.MOTION.format }), onclick: pickPack }, _t('Nhập gói động tác (.json)')) : null);
    var ids = Object.keys(C.ACTIONS);
    var u = { action: r.action && C.ACTIONS[r.action] ? (C.actionId ? C.actionId(r.action) : r.action) : ids[0], who: GC.ASSETS[r.who] ? r.who : MANNEQUIN, partner: MANNEQUIN, react: 'hit', fps: 12, cell: 256 };
    if (!GC.ASSETS[u.partner]) u.partner = (GC.assets()[0] || {}).key;
    if (!GC.ASSETS[u.who]) u.who = u.partner;
    var q = '', errBox = h('div'), body = h('div', { class: 'stack' }), insp = h('div', { class: 'stack' });
    var search = h('input', { type: 'search', placeholder: _t('Tìm: tên đòn, id, gói…'), style: 'width:260px', oninput: function () { q = search.value.trim().toLowerCase(); paintList(); } });
    $('view').appendChild(h('div', { class: 'split lib wide motions' },
      h('div', { class: 'stack' }, errBox, h('div', { class: 'row' }, search, h('span', { class: 'note', text: _t('{n} đòn · {n2} gói động tác', { n: ids.length, n2: C.packs().length }) })), body),
      h('div', { class: 'sticky' }, insp)));

    // ---- danh sách: Bộ khung trước, rồi từng gói động tác
    function groups() {
      var out = [{ key: C.FRAME_PACK, name: _t('Bộ khung'), P: null }];
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
        var shown = list.filter(function (k) { var A = C.ACTIONS[k]; return !q || [k, _lo(A, A.label), A.hint, _lo(A, A.hint || ''), g.name, g.key].join(' ').toLowerCase().indexOf(q) >= 0; });
        if (!shown.length && (q || !g.P)) return;
        var grid = h('div', { class: 'libgrid acts' });
        shown.forEach(function (k) {
          var A = C.ACTIONS[k];
          grid.appendChild(h('button', { class: 'libcard act', 'aria-pressed': String(u.action === k), title: k, 'data-action': k, 'data-anchor': 'action:' + k, 'data-anchor-label': _lo(A, A.label), onclick: function () { u.action = k; route.action = k; remember(); paintList(); paintInsp(); } },
            h('div', { class: 'lb' }, h('b', { text: _lo(A, A.label) }), h('span', { class: 'mono note', text: k }),
              h('span', { class: 'badges' }, badgeEls(A).length ? badgeEls(A) : h('span', { class: 'tag badge', text: _t('diễn') })),
              A.hint ? h('span', { class: 'note hint', text: _lo(A, A.hint) }) : null)));
        });
        var P = g.P, smp = sampleOf(P), pub = P && P.status === 'published';
        var head = h('h3', null, g.name, h('span', { class: 'r note mono', text: _t('{n} / {n2} đòn', { n: shown.length, n2: list.length }) }));
        var meta = h('div', { class: 'packmeta row' },
          P ? h('span', { class: 'note', text: P.project ? _t('Dự án · {name}', { name: Projects.name(P.project) }) : _t('Chưa xếp dự án') }) : h('span', { class: 'note', text: _t('Đòn trung lập của bộ khung — có sẵn trong mọi bản cài và mọi phim xuất ra.') }),
          h('span', { class: 'tag', text: g.key }),
          P ? (smp ? h('span', { class: 'chip', title: smp.license || '', text: _t('Bộ mẫu {x}', { x: smp.owner || 'Gen Labs' }) }) : h('span', { class: pub ? 'chip ok' : 'chip', text: pub ? _t('Phát hành') : _t('Nháp') })) : null,
          P && P.description ? h('span', { class: 'note', style: 'flex-basis:100%', text: _lo(P, P.description) }) : null,
          P ? h('button', { class: 'btn sm', style: 'margin-left:auto', title: smp ? _t('Bản sao lưu của gói bộ mẫu — {SAMPLE_TERMS}', { SAMPLE_TERMS: _t(SAMPLE_TERMS) }) : _t('Tải gói động tác (.json) — nhập lại được ở bản cài khác'), onclick: function () { download(P.id + '.json', JSON.stringify(motionPackOut(P, smp), null, 2), 'application/json'); } }, _t('Tải gói (.json)')) : null);
        body.appendChild(h('div', { class: 'panel', 'data-pack': g.key }, head, meta, h('div', { class: 'pad' }, shown.length ? grid : h('div', { class: 'note', text: _t('Gói chưa có đòn nào (chỉ có tư thế / màn diễn).') }))));
      });
      if (!body.children.length) body.appendChild(h('div', { class: 'panel pad note lib-empty', text: _t('Không có đòn nào khớp "{q}".', { q: q }) }));
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
        var g = groupOf(a) === 'frame' ? _t('Bộ khung') : a.pack === MY_PACK ? _t('Dự án · {name}', { name: Projects.name(a.project || '') }) : ((GC.PACKS[a.pack] || {}).name || a.pack);
        if (!groupsOf[g]) { groupsOf[g] = h('optgroup', { label: g }); s.appendChild(groupsOf[g]); }
        var no = need && !C.canDo(a, need);
        groupsOf[g].appendChild(h('option', { value: a.key, disabled: no ? true : null, title: no ? _t('{name} không làm được: đòn này cần {x}', { name: a.name, x: C.MOTION.needs[need.needs] || need.needs }) : null,
          text: _lo(a, a.name) + (no ? _t(' — cần {x}', { x: need.needs === 'weapon' ? _t('binh khí') : C.MOTION.needs[need.needs] || need.needs }) : C.hasWeapon(a) ? _t(' · có binh khí') : '') }));
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
        return new Promise(function (res, rej) { var img = new Image(); img.onload = function () { res(img); }; img.onerror = function () { rej(new Error(_t('không dựng được khung hình'))); }; img.src = svgURL(sized(f.svg, L.cw, L.ch)); });
      }));
    }
    function busy(btn, p) { var t = btn.textContent; btn.disabled = true; btn.textContent = _t('Đang dựng…'); return p.catch(function (e) { toast(_t('Không xuất được: {message}', { message: e.message })); }).then(function () { btn.disabled = false; btn.textContent = t; }); }
    // làm fn(i) lần lượt cho n khung, nhả luồng một nhịp sau mỗi khung (setTimeout 0) + báo tiến độ lên nút — khung 512 px không làm đơ trang
    function eachFrame(n, fn, btn) {
      return new Promise(function (res, rej) {
        var i = 0;
        (function step() {
          try { if (i >= n) { res(); return; } fn(i++); btn.textContent = _t('Đang dựng… {n}%', { n: Math.round(100 * i / n) }); setTimeout(step, 0); } catch (e) { rej(e); }
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
      }).then(function (b) { downloadBlob(name + '.png', b); toast(_t('Sprite sheet {cols}×{rows} ô {cw}×{ch} px · {n} khung — toạ độ từng khung trong tệp JSON.', { cols: L.cols, rows: L.rows, cw: L.cw, ch: L.ch, n: n })); }));
    }
    function saveGIF(btn) {
      if (!anim) return;
      if (!window.GenGif) { toast(_t('Thiếu bộ mã hoá GIF (studio/gif.js).')); return; }
      var L = layout(), name = baseName(), fps = anim.fps;   // fps thật của khung (có thể đã tự hạ) — nhịp GIF theo đúng nó
      busy(btn, rasterFrames(L).then(function (imgs) {
        var c = document.createElement('canvas'); c.width = L.cw; c.height = L.ch;
        var ctx = c.getContext('2d', { willReadFrequently: true }), frames = [];
        return eachFrame(imgs.length, function (i) { ctx.clearRect(0, 0, L.cw, L.ch); ctx.drawImage(imgs[i], 0, 0, L.cw, L.ch); frames.push(ctx.getImageData(0, 0, L.cw, L.ch).data); }, btn)
          .then(function () { btn.textContent = _t('Đang mã hoá…'); return window.GenGif.encodeAsync({ width: L.cw, height: L.ch, frames: frames, fps: fps, loop: 0 }, function (i, tot) { btn.textContent = _t('Đang mã hoá… {n}%', { n: Math.round(100 * i / tot) }); }); })
          .then(function (bytes) {
            downloadBlob(name + '.gif', new Blob([bytes], { type: 'image/gif' }));
            toast(_t('GIF {cw}×{ch} px · {n} khung · {fps} fps · lặp vô hạn, nền trong suốt ({n2} KB).', { cw: L.cw, ch: L.ch, n: frames.length, fps: fps, n2: Math.round(bytes.length / 1024) }));
          });
      }));
    }
    function saveSheetSVG() { if (!anim) return; var L = layout(); download(baseName() + '.svg', C.sheetSVG(anim, { cols: L.cols, cell: L.cw }).svg, 'image/svg+xml'); }
    // giấy phép ghi trong JSON: nhân vật / gói thuộc bộ mẫu Gen Labs thì không "thuộc người tạo" — điều khoản bộ mẫu (SAMPLE_TERMS)
    function sampleNow() {
      var A = C.ACTIONS[u.action], who = GC.ASSETS[u.who], pa = A && A.attack ? GC.ASSETS[u.partner] : null;
      return sampleOf(A ? C.PACKS[A.pack] : null) || sampleOfProject(who && who.pack === MY_PACK ? who.project : '') || sampleOfProject(pa && pa.pack === MY_PACK ? pa.project : '');
    }
    function licenseText(smp) { return '© 2026 Gen Labs — engine; ' + (smp ? _t('Bộ mẫu {x} — {SAMPLE_TERMS}', { x: smp.owner || 'Gen Labs', SAMPLE_TERMS: _t(SAMPLE_TERMS) }) : _t('nhân vật thuộc người tạo')); }
    function timeline() {
      var L = layout(), name = baseName(), A = C.ACTIONS[u.action], smp = sampleNow();
      return Object.assign({}, anim.meta, smp ? { sample: { owner: smp.owner || 'Gen Labs', license: _t('Bộ mẫu — {SAMPLE_TERMS}', { SAMPLE_TERMS: _t(SAMPLE_TERMS) }) } } : {}, {
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
      if (!A) { insp.appendChild(h('div', { class: 'panel pad note', text: _t('Chọn một đòn.') })); return; }
      var who = GC.ASSETS[u.who], partner = GC.ASSETS[u.partner], P = C.PACKS[A.pack] || null;
      img = h('img', { alt: _t('Xem trước {label}', { label: _lo(A, A.label) }), draggable: 'false' });
      stg = h('div', { class: 'mstage' }, img);
      clock = h('span', { class: 'note mono' });
      playB = h('button', { class: 'btn sm', 'aria-label': _t('Phát / dừng'), onclick: function () { playing = !playing; playB.textContent = playing ? _t('❚❚ Dừng') : _t('▶ Phát'); play(); } }, playing ? _t('❚❚ Dừng') : _t('▶ Phát'));
      var ctl = h('div', { class: 'row' },
        h('label', { class: 'fld' }, h('span', { class: 'note', text: A.attack ? _t('Người ra đòn') : _pt('số ít', 'Nhân vật') }), charSelect(u.who, _pt('số ít', 'Nhân vật'), function (v) { u.who = v; route.who = v; remember(); paintInsp(); }, A.needs ? A : null)),
        A.attack ? h('label', { class: 'fld' }, h('span', { class: 'note', text: _t('Đối thủ') }), charSelect(u.partner, _t('Đối thủ'), function (v) { u.partner = v; paintInsp(); })) : null,
        A.attack ? h('label', { class: 'fld' }, h('span', { class: 'note', text: _t('Phản ứng của đối thủ') }), (function () {
          var s = h('select', { 'aria-label': _t('Phản ứng'), onchange: function () { u.react = s.value; paintInsp(); } });
          Object.keys(C.REACTS).forEach(function (k) { s.appendChild(h('option', { value: k, text: _l(C.REACTS[k].label) })); });
          s.value = u.react; return s;
        })()) : null);
      var fseg = h('div', { class: 'seg', role: 'group', 'aria-label': _t('Số khung / giây') });
      [8, 12, 24].forEach(function (f) { fseg.appendChild(h('button', { 'aria-pressed': String(u.fps === f), onclick: function () { u.fps = f; paintInsp(); } }, f + ' fps')); });
      var csel = h('select', { 'aria-label': _t('Cỡ khung'), title: _t('Cạnh dài mỗi khung (px) của PNG / GIF / SVG sheet'), onchange: function () { u.cell = +csel.value; if (code) code.refresh(); } });
      [160, 256, 384, 512].forEach(function (n) { csel.appendChild(h('option', { value: n, text: n + ' px' })); });
      csel.value = String(u.cell);
      var info = h('div', { class: 'note mono' }), bar = null, can = !!(who && C.canDo(who, A)), err = '';
      if (!who) err = _t('Không có nhân vật này trong Thư viện.');
      else if (!can) err = _t('{name} không làm được "{label}": đòn này cần {x}. Chọn nhân vật có binh khí (nhãn "có binh khí"), hoặc trang bị vũ khí cho {name} ở Xưởng.', { name: who.name, label: _lo(A, A.label), x: C.MOTION.needs[A.needs] || A.needs });
      else {
        try { anim = C.animate(C.actionTimeline({ asset: who, action: u.action, partner: A.attack ? partner : undefined, react: A.attack ? u.react : undefined }), { fps: u.fps }); }
        catch (e) { err = _t('Không dựng được đòn: {message}', { message: e.message }); anim = null; }
      }
      var fpsBox = h('div', { class: 'stack', style: 'gap:6px' });
      if (anim) {
        info.textContent = (_t('{n} khung · {fps} fps · {n2} s{x} · khung ôm {w}×{h}', { n: anim.frames.length, fps: anim.fps, n2: anim.duration.toFixed(2), x: anim.meta.impactFrame != null ? _t(' · va chạm ở khung {n}', { n: anim.meta.impactFrame + 1 }) : '', w: anim.box.w, h: anim.box.h })).replace(/(\d)\.(\d)/g, '$1,$2');
        // đòn dài hơn số khung cho phép: engine tự hạ fps cho đủ cả đòn (anim.fps < fps đã chọn) — nói rõ để người dùng không tưởng nhầm
        var asked = anim.meta.requestedFps || u.fps, lastT = anim.frames[anim.frames.length - 1].t;
        if (anim.fps < asked) fpsBox.appendChild(h('div', { class: 'note', 'data-note': 'fps', text: _t('Đòn dài {replace} s nên tự hạ còn {fps} fps (bạn chọn {asked}) để đủ cả đòn.', { replace: dec(anim.duration.toFixed(2)), fps: anim.fps, asked: asked }) }));
        // ngay cả ở fps thấp nhất vẫn không đủ khung: hoạt ảnh bị cắt cụt — báo, không để xuất ra một đòn thiếu đuôi mà không hay
        if (anim.meta.truncated || lastT < anim.duration - 0.0005) fpsBox.appendChild(h('div', { class: 'banner warn', role: 'alert', 'data-note': 'truncated' },
          h('span', { text: _t('Đòn dài {replace} s, quá giới hạn khung ngay cả ở {fps} fps — hoạt ảnh chỉ tới giây {replace2}, phần cuối bị cắt. Rút ngắn đòn (clip / nhịp) trong gói động tác.', { replace: dec(anim.duration.toFixed(2)), fps: anim.fps, replace2: dec(lastT.toFixed(2)) }) })));
      }
      var dl = function (label, title, fn) { var b = h('button', { class: 'btn sm', title: title, disabled: anim ? null : true, onclick: function () { fn(b); } }, label); return b; };
      code = codeBox([
        [_t('Mã tham chiếu'), function () {
          var st = { actor: (who || {}).id || 'ma-no-canh', state: A.attack ? 'rage' : 'normal', action: u.action };
          if (A.attack) { st.target = (partner || {}).id || 'ma-no-canh'; st.react = u.react; }
          st.say = '…';
          return '// ' + _t('một bước trong kịch bản (Bảng bước / AI đạo diễn):') + '\n' + JSON.stringify(st) + '\n\n// ' + _t('đòn thuộc:') + ' ' + (P ? P.key + ' ' + _t('(gói "{name}")', { name: P.name }) : C.FRAME_PACK + ' ' + _t('(bộ khung)')) + '\n// ' + _t('nhân vật:') + ' ' + u.who + (A.attack ? '\n// ' + _t('đối thủ:') + '  ' + u.partner : '');
        }],
        ['JSON timeline', function () { return anim ? JSON.stringify(Object.assign({}, timeline(), { frames: _t('({n} khung — xem tệp JSON)', { n: anim.frames.length }) }), null, 2) : '// ' + _t('chưa dựng được hoạt ảnh'); }]
      ]);
      bar = h('div', { class: 'usebar' }, h('b', { text: _t('Tải hoạt ảnh') }),
        dl('PNG sprite sheet', _t('Mọi khung xếp lưới, nền trong suốt'), savePNG),
        dl('GIF', _t('GIF89a lặp vô hạn, nền trong suốt, nhịp theo fps'), saveGIF),
        dl('SVG sheet', _t('Sprite sheet vectơ (một tệp SVG)'), saveSheetSVG),
        dl('JSON', _t('Metadata timeline (gen-chibi.anim/1) + toạ độ từng khung trong sprite sheet'), saveJSON));
      var packBar = h('div', { class: 'usebar' }, h('b', { text: _t('Gói') }),
        P ? h('span', { class: 'note', text: P.name + ' · ' + (P.project ? Projects.name(P.project) : _t('chưa xếp dự án')) }) : h('span', { class: 'note', text: _t('Đòn của bộ khung — có sẵn trong mọi bản cài và mọi phim xuất ra.') }),
        P ? h('button', { class: 'btn sm', onclick: function () { download(P.id + '.json', JSON.stringify(motionPackOut(P, sampleOf(P)), null, 2), 'application/json'); } }, _t('Tải gói (.json)')) : null);
      insp.appendChild(h('div', { class: 'panel' }, h('h3', null, _lo(A, A.label), h('span', { class: 'r mono', text: u.action })),
        h('div', { class: 'pad stack' },
          h('div', { class: 'row' }, badgeEls(A), A.hint ? h('span', { class: 'note', text: _lo(A, A.hint) }) : null),
          ctl, err ? h('div', { class: 'banner bad', role: 'alert' }, h('span', { text: err })) : stg,
          anim ? h('div', { class: 'row' }, playB, clock, h('span', { class: 'sp', style: 'flex:1' }), fseg) : h('div', { class: 'row' }, fseg),
          info, fpsBox, h('div', { class: 'row' }, h('span', { class: 'note', text: _t('Cỡ khung khi tải') }), csel), bar, packBar, code)));
      if (anim) { urls = anim.frames.map(function (f) { return URL.createObjectURL(new Blob([f.svg], { type: 'image/svg+xml' })); }); frame(0); play(); }
    }
    // ---- nhập gói động tác: server kiểm (cùng cổng với MCP / AI), 422 thì hiện đủ danh sách lỗi
    function showErr(msg, list) {
      clear(errBox);
      if (!msg) return;
      errBox.appendChild(h('div', { class: 'banner bad', role: 'alert', style: 'display:grid;gap:6px' },
        h('div', { class: 'row' }, h('b', { text: msg }), h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: function () { showErr(''); } }, _t('Đóng'))),
        list && list.length ? h('ul', { class: 'errs', style: 'margin:0' }, list.slice(0, 30).map(function (m) { return h('li', { text: '✗ ' + m }); })) : null));
    }
    function pickPack() {
      var inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: function () {
        var f = inp.files && inp.files[0]; inp.remove();
        if (!f) return;
        if (f.size > 400 * 1024) { showErr(_t('Tệp quá lớn (gói động tác tối đa 300 KB).')); return; }
        f.text().then(function (t) { var d; try { d = JSON.parse(t); } catch (e) { showErr(_t('Tệp không phải JSON.')); return; } importPack(d); });
      } });
      document.body.appendChild(inp); inp.click();
    }
    function importPack(def) {
      if (!def || typeof def !== 'object' || Array.isArray(def)) { showErr(_t('Gói động tác phải là một object JSON ({format}).', { format: C.MOTION.format })); return; }
      // dự án chọn ở ô "Nhập vào dự án" thắng; để trống thì giữ dự án ghi trong tệp (không có thì gói chưa xếp dự án = gói chung)
      var body = impProj ? Object.assign({}, def, { project: impProj }) : def;
      Store.api('POST', 'api/motion-packs', { pack: body, note: _t('Nhập trong Studio') }).then(function (rec) {
        var r0 = C.registerPack(MY_PACK, rec);
        if (r0.errors.length) throw Object.assign(new Error(_t('Server đã lưu nhưng Studio không nạp được gói')), { errors: r0.errors });
        var first = Object.keys(r0.def.actions)[0];
        toast(_t('Đã nhập gói "{name}" vào {x}: {n} đòn · {n2} clip.', { name: r0.def.name, x: r0.def.project ? _t('dự án {name}', { name: Projects.name(r0.def.project) }) : _t('mục chưa xếp dự án (dùng chung)'), n: Object.keys(r0.def.actions).length, n2: Object.keys(r0.def.clips).length }));
        go(Object.assign({}, route, first ? { action: first } : {}));
      }).catch(function (e) { showErr(e.status === 422 ? _t('Gói động tác chưa qua cổng kiểm') : e.message, e.errors || (e.status === 422 ? [e.message] : null)); });
    }
    paintList(); paintInsp();
  };

  /* ============================================================ THƯ VIỆN › ÂM THANH + GIỌNG (v0.18)
   * Hai trang Data Console (STD-07) đặt cạnh Thư viện › Động tác: bảng kiểu Excel (ID hàng, chữ cột, sắp xếp, ô tìm không dấu, footer) + Inspector 400 px.
   *   Âm thanh: tab Âm (62 âm khung + gói, nghe ngay trên hàng) · Luật ghép (S1–S7 từ GC.sounds.RULES, công thức RECIPES, kiểm thử chuỗi bước) · Gói âm (tải / nhập).
   *   Giọng:    Bộ giọng vai (22 vai × 4 ngôn ngữ, giọng máy + giọng AI, thiết kế giọng) — nơi DUY NHẤT; giọng chốt theo tác phẩm (work.voices) ở phòng làm phim (Tạo tác › tab Giọng & âm thanh).
   * Một khối liền mạch: mọi thứ dùng chung nằm ngay đây (tiền tố lc = dùng chung, ls = âm, lv = giọng). CSS ở studio/lib-audio.css.
   * Không innerHTML với dữ liệu: mọi chữ qua h() / textContent. Dán key + trần câu / ngày ở Cài đặt AI (voiceSettings). */
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
    var b = h('button', { class: 'btn sm lc-ic ' + (o.cls || ''), type: 'button', title: o.title || null, 'aria-label': _l(o.label) || null, disabled: o.disabled ? true : null, onclick: function (ev) { if (o.fn) o.fn(b, ev); } });
    if (icon) b.appendChild(lcIcon(icon));
    if (text) b.appendChild(document.createTextNode(text));
    return b;
  }
  function lcPlay(label, fn) { var b = h('button', { class: 'btn lc-play lc-ic', type: 'button', title: label, 'aria-label': label, onclick: function (ev) { fn(b, ev); } }); b.appendChild(lcIcon('play')); return b; }
  function vn(n, d) { return dec(Number(n).toFixed(d == null ? 2 : d)); }
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
  //      onSelect(row | null), onAct(row) (Space / Enter), foot(view) → [Node | chữ], anchor(row) → [data-anchor, nhãn] | null }. Bàn phím: ↑ ↓ (hoặc J K) · Home · End · Space · Enter khi bảng đang focus.
  function lcGrid(o) {
    var rows = [], view = [], selId = '', sk = -1, sd = 1, left = 0, total = 0, trs = {};
    var table = h('table', { class: 'lc-t', role: 'grid', 'aria-label': _l(o.label), tabindex: '0' }), colg = h('colgroup'), lt = h('tr', { class: 'letters', 'aria-hidden': 'true' }), hd = h('tr'), tb = h('tbody');
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
        var ta = { id: o.id + '-' + i, role: 'row', 'aria-selected': String(row.id === selId), 'data-id': row.id, onclick: function (ev) {
          pick(row.id, false);
          if (!ev.target.closest || !ev.target.closest('button, a, input, select')) table.focus({ preventScroll: true });
        } };
        if (o.anchor) { var an = o.anchor(row); if (an) anc(ta, an[0], an[1]); }   // data-anchor: Trợ lý AI ghim được hàng này
        var tr = h('tr', ta);
        o.cols.forEach(function (c) {
          var td = h('td', { role: 'gridcell', class: [c.cls, c.frozen ? 'fz' : ''].join(' ').trim() || null, style: c.frozen ? 'left:' + c.left + 'px' : null, title: c.tip ? c.tip(row) : null });
          add(td, c.cell(row));
          tr.appendChild(td);
        });
        trs[row.id] = tr; tb.appendChild(tr);
      });
      if (!view.length) tb.appendChild(h('tr', null, h('td', { colspan: String(o.cols.length), class: 'lc-empty', text: o.empty || _t('Không có hàng nào khớp bộ lọc.') })));
      clear(foot); add(foot, o.foot ? o.foot(view) : _t('{n} hàng', { n: view.length }));
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
  function lsSec(t) { return dec(Math.round(t * 100) / 100) + ' s'; }

  PAGES['lib-sounds'] = function (r) {
    crumbs([{ t: _t('Âm thanh') }]);
    var S = GC.sounds, A = GC.audio;
    if (!S || !A) { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: _t('Bản này chưa nạp thư viện âm (engine/sounds.js).') })); return; }
    actions(h('span', { class: 'note', text: _t('Hiệu ứng âm thanh dạng dữ liệu ({FORMAT}) — nghe, lọc, chép vào kịch bản.', { FORMAT: S.FORMAT }) }));
    var TABS = ['sounds', 'rules', 'packs'], canWav = typeof A.renderWav === 'function';
    var st = { tab: TABS.indexOf(r.tab) >= 0 ? r.tab : 'sounds', q: '', cat: '', tag: '', pack: S.packs().some(function (p) { return p.id === r.pack; }) ? r.pack : '', proj: '', sel: S.has(r.sound) ? r.sound : '' };
    var net = { server: false, stored: {} }, alive = true, packNote = null, host = h('div', { class: 'lc' }), tabsEl = h('div'), body = h('div', { class: 'lc-body' });
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
      clear(tabsEl).appendChild(lcTabs([['sounds', _t('Âm'), S.names().length], ['rules', _t('Luật ghép'), S.RULES.list.length], ['packs', _t('Gói âm'), S.packs().length]], st.tab, function (t) { st.tab = t; remember(); paintTabs(); paintTab(); }));
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
      A.renderWav(what).then(function (buf) { downloadBlob(name + '.wav', new Blob([buf], { type: 'audio/wav' })); toast(_t('Đã dựng {name}.wav · {n} KB.', { name: name, n: Math.round(buf.byteLength / 1024) })); })
        .catch(function (e) { toast(_t('Không dựng được WAV: {message}', { message: e.message })); }).then(function () { btn.disabled = false; });
    }
    function packName(p) { return p.frame ? 'Khung' : p.name; }
    function openSound(name) { st.tab = 'sounds'; st.cat = ''; st.tag = ''; st.q = ''; st.pack = ''; st.proj = ''; st.sel = name; remember(); paintTabs(); paintTab(); }

    /* ---- tab Âm ---- */
    function paintSounds(box) {
      var allTags = {};
      S.list().forEach(function (x) { x.tags.forEach(function (t) { allTags[t] = (allTags[t] || 0) + 1; }); });
      var q = h('input', { type: 'search', class: 'lc-q', id: 'lsQ', placeholder: _t('Tìm không dấu…  ( / )'), title: _t('Tìm không dấu theo tên, nhãn, thẻ, câu “dùng khi”. Phím / để nhảy vào đây, ↓ để xuống bảng.'), 'aria-label': _t('Tìm âm'), value: st.q, oninput: function () { st.q = q.value.trim(); refresh(); },
        onkeydown: function (ev) { if (ev.key === 'Escape') { q.value = ''; st.q = ''; refresh(); grid.focus(); } else if (ev.key === 'ArrowDown') { ev.preventDefault(); grid.focus(); } } });
      var dl = h('datalist', { id: 'lsTags' });
      Object.keys(allTags).sort(function (a, b) { return a.localeCompare(b, 'vi'); }).forEach(function (t) { dl.appendChild(h('option', { value: t, label: _t('{x} âm', { x: allTags[t] }) })); });
      function setTag(v) {
        var f = lcFold(v).trim(), hit = '';
        Object.keys(allTags).forEach(function (t) { if (!hit && lcFold(t) === f) hit = t; });
        if (v && !hit) toast(_t('Không có thẻ “{v}” trong thư viện.', { v: v }));
        st.tag = hit; tagIn.value = hit; refresh();
      }
      var tagIn = h('input', { type: 'text', list: 'lsTags', placeholder: _t('Thẻ…'), 'aria-label': _t('Lọc theo thẻ'), style: 'width:132px', value: st.tag, onchange: function () { setTag(tagIn.value); }, onkeydown: function (ev) { if (ev.key === 'Enter') setTag(tagIn.value); } });
      var packSel = h('select', { 'aria-label': _t('Lọc theo gói'), onchange: function () { st.pack = packSel.value; refresh(); } });
      packSel.appendChild(h('option', { value: '', text: _t('Mọi gói') }));
      S.packs().forEach(function (p) { packSel.appendChild(h('option', { value: p.id, text: packName(p) + ' · ' + p.count })); });
      packSel.value = st.pack;
      var projSel = h('select', { 'aria-label': _t('Lọc theo dự án'), title: _t('Chỉ hiện âm mà dự án này dùng được (khung + gói dùng chung + gói của dự án) — luật S6'), onchange: function () { st.proj = projSel.value; refresh(); } });
      projSel.appendChild(h('option', { value: '', text: _t('Mọi dự án') })); projSel.appendChild(h('option', { value: '-', text: _t('Không dự án (khung + gói chung)') }));
      var pids = [];
      S.packs().forEach(function (p) { if (p.project && pids.indexOf(p.project) < 0) pids.push(p.project); });
      Projects.all().forEach(function (p) { if (pids.indexOf(p.id) < 0) pids.push(p.id); });
      pids.forEach(function (id) { projSel.appendChild(h('option', { value: id, text: Projects.name(id) })); });
      projSel.value = st.proj;
      var count = h('span', { class: 'note lc-count' }), clearB = h('span', { class: 'lc-chipx', hidden: true });
      var chips = h('div', { class: 'fxchips lc-cats', role: 'group', 'aria-label': _t('Lọc theo nhóm âm') }), chipEls = {};
      [['', _t('Tất cả')]].concat(S.CATS).forEach(function (c) {
        var n = h('span', { class: 'n' }), b = h('button', { type: 'button', 'data-cat': c[0], onclick: function () { st.cat = st.cat === c[0] ? '' : c[0]; refresh(); } }, _l(c[1]), n);
        chipEls[c[0]] = { b: b, n: n }; chips.appendChild(b);
      });
      var insp = h('aside', { class: 'lc-insp', 'aria-label': _t('Chi tiết âm') });
      var grid = lcGrid({
        id: 'ls', label: _t('Thư viện âm thanh'), empty: _t('Không có âm nào khớp bộ lọc.'),
        cols: [
          { t: _t('Nghe'), w: 56, frozen: true, cell: function (x) { var b = lcPlay(_t('Nghe {name}', { name: x.name }), function (btn) { play(x.name, btn); }); b.setAttribute('data-play', x.name); return b; } },
          { t: _t('ID âm'), w: 132, frozen: true, cls: 'id', v: function (x) { return x.name; }, cell: function (x) { return x.name; }, tip: function (x) { return x.name; } },
          { t: _t('Nhãn'), w: 196, v: function (x) { return _lo(x, x.label); }, cell: function (x) { return _lo(x, x.label); }, tip: function (x) { return _lo(x, x.label); } },
          { t: _t('Nhóm'), w: 132, v: function (x) { return _l(x.catLabel); }, cell: function (x) { return [_l(x.catLabel), x.accent ? h('span', { class: 'tag acc', title: _t('Âm NHẤN: mỗi bước tối đa 1 (S1)'), text: _t('nhấn') }) : null]; } },
          { t: _t('Giây'), w: 56, cls: 'num', v: function (x) { return x.dur; }, cell: function (x) { return vn(x.dur); } },
          { t: _t('Dùng khi'), w: 300, cls: 'mut', v: function (x) { return _lo(x, x.use); }, cell: function (x) { return _lo(x, x.use); }, tip: function (x) { return _lo(x, x.use); } },
          { t: _t('Thẻ'), w: 190, cell: function (x) { return x.tags.map(function (t) { return h('span', { class: 'tag', text: _l(t) }); }); }, tip: function (x) { return x.tags.map(function (t) { return _l(t); }).join(', '); } },
          { t: _t('Gói'), w: 124, v: function (x) { return x.pack; }, cell: function (x) { var p = S.packs().filter(function (k) { return k.id === x.pack; })[0]; return p ? packName(p) : x.pack; } },
          { t: _t('Dự án'), w: 124, v: function (x) { return x.project; }, cell: function (x) { return x.project ? Projects.name(x.project) : '—'; } },
          { t: _t('Cảnh tự gán (cue)'), w: 230, cls: 'mono mut', v: function (x) { return lsCueText(x.cue); }, cell: function (x) { return lsCueText(x.cue) || '—'; }, tip: function (x) { return lsCueText(x.cue); } }
        ],
        group: function (x) { return _l(x.catLabel) + (x.accent ? _t(' · âm nhấn') : ''); },
        onSelect: function (x) { st.sel = x ? x.name : ''; remember(); inspect(x); },
        onAct: function (x) { play(x.name, grid.el.querySelector('[data-play="' + x.name + '"]')); },
        foot: function (v) {
          var sum = 0, cs = {}; v.forEach(function (x) { sum += x.dur; cs[x.cat] = 1; });
          return [_t('{n} âm · {n2} nhóm · Σ {vn} s', { n: v.length, n2: Object.keys(cs).length, vn: vn(sum, 1) }), h('span', { class: 'sp' }), _t('↑↓ chọn · Space nghe · / tìm')];
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
        count.textContent = _t('{n} / {n2} âm', { n: rows.length, n2: S.names().length });
        clear(clearB);
        var act = [st.tag ? _t('thẻ: {tag}', { tag: st.tag }) : '', st.pack ? _t('gói: {pack}', { pack: st.pack }) : ''].filter(Boolean);
        clearB.hidden = !act.length;
        if (act.length) { clearB.appendChild(document.createTextNode(act.join(' · '))); clearB.appendChild(h('button', { type: 'button', 'aria-label': _t('Bỏ lọc thẻ / gói'), title: _t('Bỏ lọc thẻ / gói'), onclick: function () { st.tag = ''; st.pack = ''; tagIn.value = ''; packSel.value = ''; refresh(); } }, '×')); }
        grid.set(rows, st.sel);
      }

      /* Inspector 400 px: nhãn · nghe / tải WAV / chép · cue · JSON một bước + gọi MCP */
      function inspect(row) {
        clear(insp);
        var x = row && S.info(row.name);
        if (!x) { insp.appendChild(h('div', { class: 'panel pad note', text: _t('Chọn một âm trong bảng để xem chi tiết.') })); return; }
        var P = S.packs().filter(function (p) { return p.id === x.pack; })[0] || {}, step = lsStep(x);
        var hear = h('button', { class: 'btn primary lc-ic', type: 'button', id: 'lsHear', 'aria-label': _t('Nghe {name}', { name: x.name }), onclick: function () { play(x.name, hear); } }, lcIcon('play'), _t('Nghe'));
        var acts = h('div', { class: 'row' }, hear,
          canWav ? lcBtn('down', _t('Tải WAV'), { title: _t('Dựng offline 44,1 kHz stereo rồi tải {name}.wav', { name: x.name }), label: _t('Tải WAV {name}', { name: x.name }), fn: function (b) { wav(x.name, x.name, b); } }) : null,
          lcBtn('copy', _t('Chép tên'), { title: _t('Chép tên âm để đặt vào step.sfx'), label: _t('Chép tên {name}', { name: x.name }), fn: function () { copyText(x.name, _t('tên âm “{name}”', { name: x.name })); } }));
        var tags = h('div', { class: 'row', style: 'gap:2px' }, x.tags.map(function (t) {
          return h('button', { type: 'button', class: 'tag', title: _t('Lọc theo thẻ “{t}”', { t: _l(t) }), onclick: function () { st.tag = t; tagIn.value = t; refresh(); } }, _l(t));
        }));
        var cueEls = [];
        ['state', 'fx', 'activity', 'event'].forEach(function (k) {
          if (x.cue && x.cue[k] && x.cue[k].length) cueEls.push(h('div', { class: 'lc-cue' }, h('span', { class: 'k', text: k }), x.cue[k].map(function (v) { return h('span', { class: 'tag', text: v }); })));
        });
        var kv = h('dl', { class: 'lc-kv' },
          h('dt', { text: _t('Nhóm') }), h('dd', null, _l(x.catLabel), ' ', x.accent ? h('span', { class: 'tag acc', text: _t('âm nhấn') }) : null),
          h('dt', { text: _t('Thời lượng') }), h('dd', { text: _t('{vn} s · độ to {vn2} · {nodes} node', { vn: vn(x.dur), vn2: vn(x.level), nodes: x.nodes }) }),
          h('dt', { text: _t('Gói') }), h('dd', null, packName(P), ' ', h('span', { class: 'tag', text: x.pack }), P.version ? h('span', { class: 'note mono', text: ' v' + P.version }) : null),
          h('dt', { text: _t('Dự án') }), h('dd', { text: x.project ? Projects.name(x.project) : _t('Dùng chung mọi dự án') }));
        var code = codeBox([
          [_t('Bước kịch bản (JSON)'), function () { return JSON.stringify(step, null, 2); }],
          [N_('Gọi MCP'), function () { return mcpCall('lint_sound_track', { project: x.project || '', steps: [step] }) + '\n\n// ' + _t('Tra cứu / lấy công thức:') + '\nlist_sounds ' + JSON.stringify({ q: x.name }) + '\nget_sound_pack ' + JSON.stringify({ id: x.pack, names: [x.name] }); }]
        ]);
        var notes = [];
        if (x.accent) notes.push(_t('Âm NHẤN: mỗi bước tối đa 1 âm nhấn, để ở bước không có lời hoặc trước câu thoại (S1, S3).'));
        if (x.hitAt != null) notes.push(_t('Điểm va ở {lsSec} sau khi bắt đầu — đặt ở bước TRƯỚC khung trúng đòn.', { lsSec: lsSec(x.hitAt) }));
        if (x.dur > S.RULES.long.dur) notes.push(_t('Âm dài ({vn} s) chỉ ở bước đầu / cuối cảnh (S7).', { vn: vn(x.dur) }));
        insp.appendChild(h('div', { class: 'panel' }, h('h3', null, h('span', { text: _lo(x, x.label) }), h('span', { class: 'r mono', text: _lo(x, x.name) })),
          h('div', { class: 'pad stack' }, acts, kv,
            h('div', null, h('div', { class: 'lc-sec', text: _t('Dùng khi') }), h('p', { class: 'lc-use', text: _lo(x, x.use) })),
            h('div', null, h('div', { class: 'lc-sec', text: _t('Thẻ') }), tags),
            h('div', null, h('div', { class: 'lc-sec', text: _t('Cảnh tự gán (cue)') }),
              cueEls.length ? h('div', { class: 'stack', style: 'gap:4px' }, cueEls, x.cue && x.cue.mood ? h('p', { class: 'lc-hint', text: _t('Chỉ khi không khí cảnh là: {mood}', { mood: x.cue.mood.join(' · ') }) }) : null)
                : h('p', { class: 'lc-hint', text: _t('Không tự gán — chỉ phát khi đặt tay vào step.sfx.') })),
            h('div', null, h('div', { class: 'lc-sec', text: _t('Dùng trong kịch bản') }), code),
            notes.length ? h('div', { class: 'stack', style: 'gap:4px' }, notes.map(function (n) { return h('p', { class: 'lc-hint warn', text: n }); })) : null,
            P.frame || !P.id ? null : h('div', { class: 'usebar' }, h('b', { text: _t('Gói') }), h('span', { class: 'note', text: _t('{packName} · {count} âm', { packName: packName(P), count: P.count }) }),
              lcBtn('down', _t('Tải gói (.json)'), { label: _t('Tải gói {id}', { id: P.id }), fn: function () { download(P.id + '.json', JSON.stringify(S.pack(P.id), null, 2), 'application/json'); } })))));
      }
      refresh();
      if (!st.sel) grid.focus();
    }

    /* ---- tab Luật ghép: S1–S7 + quy trình + công thức mẫu + kiểm thử (mọi chữ lấy từ GC.sounds — một nguồn với agent) ---- */
    function paintRules(box) {
      var R = S.RULES, steps = lsGuideSteps(S.guide());
      var lim = [
        _t('≤ {maxPerStep} âm mỗi bước', { maxPerStep: R.maxPerStep }), _t('≤ {maxAccent} âm nhấn mỗi bước', { maxAccent: R.maxAccent }), _t('≤ {max} âm / {window} s', { max: R.density.max, window: R.density.window }), _t('cùng âm ≤ {max} bước liền', { max: R.repeat.max }),
        _t('âm dài > {dur} s chỉ ở đầu / cuối cảnh', { dur: R.long.dur }), _t('tự gán ≤ {autoMax} âm mỗi bước', { autoMax: R.autoMax })];
      var flow = h('div', { class: 'panel' }, h('h3', null, _t('Quy trình ghép'), h('span', { class: 'r note', text: _t('cùng văn bản agent đọc (get_sound_spec / guide)') })),
        h('div', { class: 'pad stack' }, h('ol', { class: 'lc-steps' }, steps.map(function (s) { return h('li', null, lcMd(s)); })),
          h('div', { class: 'row', style: 'gap:4px' }, h('span', { class: 'note', text: _t('Ngưỡng:') }), lim.map(function (t) { return h('span', { class: 'tag', text: t }); }))));
      var rules = h('div', { class: 'panel' }, h('h3', null, _t('{n} luật {code}–{code2}', { n: R.list.length, code: R.list[0].code, code2: R.list[R.list.length - 1].code }), h('span', { class: 'r note mono', text: _t('GC.sounds.RULES · lintSoundTrack · save_shot / save_work chạy cùng bộ luật') })),
        h('table', { class: 'lc-rules', 'aria-label': _t('Các luật ghép âm') }, h('thead', null, h('tr', null, h('th', { text: _t('Mã') }), h('th', { text: _t('Mức') }), h('th', { text: _t('Luật') }))),
          h('tbody', null, R.list.map(function (x) {
            return h('tr', { 'data-rule': x.code }, h('td', { class: 'code', text: x.code }), h('td', { class: 'lv' }, x.level === 'error' ? lcState('bad', _t('Lỗi — chặn lưu')) : lcState('warn', _t('Cảnh báo'))), h('td', { text: x.rule }));
          }))));
      var recs = h('div', { class: 'panel' }, h('h3', null, _t('Công thức ghép mẫu'), h('span', { class: 'r note', text: _t('{n} công thức · đà → va → hậu quả', { n: S.RECIPES.length }) })),
        h('div', { class: 'lc-recipes' }, S.RECIPES.map(function (rc) {
          var seq = h('div', { class: 'seq' });
          rc.seq.forEach(function (x, i) {
            if (i) seq.appendChild(h('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }));
            seq.appendChild(h('span', { class: 't', text: lsSec(x[0]) }));
            seq.appendChild(h('button', { type: 'button', class: 'tag', title: _t('Mở “{x}” trong bảng Âm', { x: x[1] }), onclick: function () { openSound(x[1]); } }, x[1]));
          });
          var hearB = h('button', { class: 'btn sm primary lc-ic', type: 'button', 'data-recipe': rc.id, 'aria-label': _t('Nghe chuỗi {id}', { id: rc.id }), onclick: function () {
            A.unlock(); rc.seq.forEach(function (x) { A.sfx(x[1], { delay: x[0] }); });
            var end = rc.seq[rc.seq.length - 1][0] + ((S.info(rc.seq[rc.seq.length - 1][1]) || {}).dur || 0.5);
            hearB.setAttribute('data-playing', 'true'); setTimeout(function () { hearB.removeAttribute('data-playing'); }, end * 1000 + 200);
          } }, lcIcon('play'), _t('Nghe chuỗi'));
          return h('div', { class: 'lc-recipe', 'data-id': rc.id }, h('div', null, h('b', { text: _l(rc.label) }), h('p', { class: 'lc-hint', text: rc.note })), seq,
            h('div', { class: 'acts' }, hearB,
              canWav ? lcBtn('down', _t('Tải WAV'), { label: _t('Tải WAV chuỗi {id}', { id: rc.id }), fn: function (b) { wav(rc.seq.map(function (x) { return [x[0], x[1]]; }), rc.id, b); } }) : null,
              lcBtn('copy', _t('Chép các bước'), { title: _t('Chép mảng bước kịch bản (mỗi âm một bước)'), label: _t('Chép các bước {id}', { id: rc.id }), fn: function () { copyText(JSON.stringify(lsRecipeSteps(rc, lsActor('')), null, 2), _t('các bước của “{id}”', { id: rc.id })); } })));
        })));
      // kiểm thử chuỗi bước bằng đúng bộ luật của server
      var ta = h('textarea', { class: 'code', id: 'lsLintIn', rows: '9', spellcheck: 'false', 'aria-label': _t('Các bước kịch bản (JSON) để kiểm luật ghép') });
      ta.value = JSON.stringify(lsRecipeSteps(S.RECIPES[0], lsActor('')), null, 2);
      var lp = h('select', { 'aria-label': _t('Dự án để tra gói âm') }), out = h('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
      lp.appendChild(h('option', { value: '', text: _t('Không dự án (khung + gói chung)') }));
      var pj = []; S.packs().forEach(function (p) { if (p.project && pj.indexOf(p.project) < 0) pj.push(p.project); });
      Projects.all().forEach(function (p) { if (pj.indexOf(p.id) < 0) pj.push(p.id); });
      pj.forEach(function (id) { lp.appendChild(h('option', { value: id, text: Projects.name(id) })); });
      function lint() {
        clear(out);
        var steps2;
        try { steps2 = JSON.parse(ta.value); } catch (e) { out.appendChild(h('p', { class: 'lc-msg bad', role: 'alert', text: _t('Không phải JSON: {message}', { message: e.message }) })); return; }
        if (!Array.isArray(steps2)) steps2 = steps2 && Array.isArray(steps2.steps) ? steps2.steps : [steps2];
        var iss = S.lintSoundTrack(steps2, { project: lp.value }), er = iss.filter(function (i) { return i.level === 'error'; }).length, wn = iss.length - er;
        out.appendChild(h('p', { class: 'lc-msg ' + (er ? 'bad' : wn ? 'warn' : 'ok'), 'data-lint': er + '/' + wn, text: _t('{er} lỗi · {wn} cảnh báo{x}', { er: er, wn: wn, x: iss.length ? '' : _t(' — chuỗi này qua cả bảy luật.') }) }));
        if (iss.length) out.appendChild(h('ul', { class: 'lc-issues' }, iss.map(function (i) {
          return h('li', null, h('span', { class: 'code', text: i.code }), i.level === 'error' ? lcState('bad', _t('Lỗi')) : lcState('warn', _t('Cảnh báo')), h('span', null, h('span', { class: 'p', text: (i.path || '') + (i.path ? ' ' : '') }), i.msg));
        })));
      }
      var lintP = h('div', { class: 'panel lc-lint' }, h('h3', null, _t('Thử kiểm luật'), h('span', { class: 'r note', text: _t('dán các bước (steps) — kết quả như lint_sound_track') })),
        h('div', { class: 'pad stack' }, ta, h('div', { class: 'row' }, lp, h('button', { class: 'btn primary', type: 'button', id: 'lsLintGo', onclick: lint }, _t('Kiểm S1–S7')),
          h('span', { class: 'note', text: _t('Lỗi ({error}) chặn lưu phân cảnh; cảnh báo ({warn}) chỉ nhắc.', { error: R.levels.error, warn: R.levels.warn }) })), out));
      box.appendChild(h('div', { class: 'stack' }, flow, rules, recs, lintP));
    }

    /* ---- tab Gói âm: danh sách · tải JSON · nhập (kiểm cổng, lỗi kèm path) ---- */
    function paintPacks(box) {
      var impProj = (function (v) { var P = Projects.list.filter(function (x) { return x.id === v; })[0]; return P && P.sample ? '' : v; })(lastProject());
      var sampleOf = function (pid) { var pj = pid ? Projects.all().filter(function (x) { return x.id === pid; })[0] : null; return pj && pj.sample ? pj.sample : null; };
      var delBox = h('div', { class: 'stack lc-delbox', style: 'gap:6px', id: 'lsDelBox' });   // kết quả gỡ gói: lỗi / danh sách phụ thuộc + "Vẫn gỡ" / cảnh báo
      var tbl = h('table', { class: 'grid', 'aria-label': _t('Gói âm') }), th = h('tr');
      [_t('ID gói'), _t('Tên'), _t('Dự án'), _t('Phiên bản'), _t('Số âm'), _t('Trạng thái'), _t('Nguồn'), ''].forEach(function (t) { th.appendChild(h('th', { text: t })); });
      tbl.appendChild(h('thead', null, th));
      var tb = h('tbody'); tbl.appendChild(tb);
      S.packs().forEach(function (p) {
        var smp = p.status === 'published' ? sampleOf(p.project) : null, act = h('span', { class: 'acts' },   // dấu "bộ mẫu" chỉ cho gói phát hành của dự án mẫu (gói người dùng nhập vào đó vẫn là nháp của họ)

          lcBtn(null, _t('Xem âm'), { label: _t('Xem âm của gói {id}', { id: p.id }), fn: function () { st.tab = 'sounds'; st.pack = p.id; st.cat = ''; remember(); paintTabs(); paintTab(); } }),
          p.frame ? null : lcBtn('down', _t('Tải JSON'), { label: _t('Tải gói {id}', { id: p.id }), fn: function () { download(p.id + '.json', JSON.stringify(S.pack(p.id), null, 2), 'application/json'); } }),
          // Gỡ gói: chỉ gói của người dùng đã lưu trên máy (không phải gói khung / bộ mẫu); bấm 2 lần mới gỡ
          Store.mode === 'server' && !p.frame && !smp && net.stored[p.id] ? lcBtn(null, _t('Gỡ gói'), { cls: 'danger', label: _t('Gỡ gói {id}', { id: p.id }), title: _t('Gỡ gói này khỏi thư viện — bấm 2 lần để xác nhận'), fn: function (b) { askRemove(p, b); } }) : null);
        tb.appendChild(h('tr', { 'data-pack': p.id, class: 'lc-pack-row' }, h('td', { class: 'id', text: p.id }), h('td', null, p.frame ? _t('Bộ âm chuẩn (khung)') : p.name),
          h('td', { text: p.project ? Projects.name(p.project) : p.frame ? _t('mọi dự án') : _t('dùng chung') }), h('td', { class: 'v', text: 'v' + p.version }), h('td', { class: 'v', text: String(p.count) }),
          h('td', null, smp ? h('span', { class: 'chip', title: smp.license || '', text: _t('Bộ mẫu {x}', { x: smp.owner || 'Gen Labs' }) }) : p.frame ? h('span', { class: 'chip', text: 'Khung' }) : p.status === 'published' ? h('span', { class: 'chip ok', text: _t('Phát hành') }) : h('span', { class: 'chip', text: _t('Nháp') })),
          h('td', { class: 'note', text: p.frame ? 'trong engine' : net.stored[p.id] ? _t('đã lưu trên máy') : _t('nạp trong phiên') }), h('td', { class: 'nw' }, act)));
      });
      // gỡ gói: DELETE api/sound-packs/<id>. 409 = còn chỗ gọi âm của gói (conflicts[]) → hiện danh sách + "Vẫn gỡ" (gửi ?force=1); 404 / 405 = máy chủ chưa có đường này
      function delMsg(kind, head, list, extra) {
        clear(delBox);
        delBox.appendChild(h('p', { class: 'lc-msg ' + kind, role: kind === 'bad' ? 'alert' : 'status', text: head }));
        if (list && list.length) delBox.appendChild(h('ul', { class: 'errs', style: 'margin:0 0 0 16px' }, list.map(function (m) { return h('li', { text: '✗ ' + m }); })));
        if (extra) delBox.appendChild(extra);
      }
      if (packNote) { delMsg(packNote.kind, packNote.head, packNote.list); packNote = null; }   // lời nhắn sau khi gỡ (vẽ lại tab xong mới hiện)
      function removePack(p, force, btn) {
        Store.api('DELETE', 'api/sound-packs/' + encodeURIComponent(p.id) + (force ? '?force=1' : '')).then(function (r) {
          S.unregisterPack(p.id); delete net.stored[p.id]; if (st.pack === p.id) st.pack = '';
          var warns = r && Array.isArray(r.warnings) ? r.warnings : [];
          toast(_t('Đã gỡ gói “{name}” ({count} âm).', { name: p.name, count: p.count }));
          if (!alive) return;
          if (warns.length) packNote = { kind: 'warn', head: _t('Đã gỡ gói “{name}”, nhưng:', { name: p.name }), list: warns.slice(0, 30) };
          renderNav(); paintTabs(); paintTab();
        }).catch(function (e) {
          if (!alive) return;
          if (btn) { btn.disabled = false; btn.lastChild.textContent = _t('Gỡ gói'); }
          if (e.status === 409) {
            var list = e.conflicts || e.errors || [], more = list.length > 30 ? list.length - 30 : 0;
            delMsg('bad', _t('Gói “{name}” còn được gọi ở {n} chỗ — gỡ sẽ làm hỏng:', { name: p.name, n: list.length }), more ? list.slice(0, 30).concat([_t('… và {more} chỗ khác', { more: more })]) : list,
              h('div', { class: 'row' }, h('button', { class: 'btn danger', type: 'button', id: 'lsDelForce', onclick: function () { clear(delBox); if (btn) btn.disabled = true; removePack(p, true, btn); } }, _t('Vẫn gỡ')),
                h('button', { class: 'btn', type: 'button', onclick: function () { clear(delBox); } }, _t('Giữ gói')), h('span', { class: 'note', text: _t('Các chỗ đó sẽ báo lỗi S6 / bị bỏ âm lúc nạp.') })));
          } else if (e.status === 404 || e.status === 405) delMsg('warn', _t('Máy chủ chưa hỗ trợ gỡ gói (DELETE api/sound-packs/{id}) — cập nhật gen-chibi rồi thử lại.', { id: p.id }));
          else delMsg('bad', _t('Không gỡ được gói “{name}”: {message}', { name: p.name, message: e.message }));
        });
      }
      function askRemove(p, b) {
        if (b.getAttribute('data-confirm') !== '1') {   // bấm 2 lần: lần đầu chỉ báo trước (tự huỷ sau 5 giây)
          clear(delBox); b.setAttribute('data-confirm', '1'); b.lastChild.textContent = _t('Bấm lần nữa để gỡ');
          setTimeout(function () { if (b.isConnected && b.getAttribute('data-confirm') === '1') { b.removeAttribute('data-confirm'); b.lastChild.textContent = _t('Gỡ gói'); } }, 5000);
          return;
        }
        b.disabled = true; b.removeAttribute('data-confirm'); b.lastChild.textContent = _t('Đang gỡ…'); removePack(p, false, b);
      }
      // nhập gói
      var ta = h('textarea', { class: 'code', id: 'lsImport', rows: '7', spellcheck: 'false', 'aria-label': _t('JSON của gói âm'), placeholder: '{ "format": "' + S.FORMAT + '", "id": "ten-goi", "name": "…", "sounds": { … } }' });
      var res = h('div', { class: 'stack', style: 'gap:6px' });
      function say(kind, head, list) {
        clear(res);
        res.appendChild(h('p', { class: 'lc-msg ' + kind, role: kind === 'bad' ? 'alert' : 'status', text: head }));
        if (list && list.length) res.appendChild(h('ul', { class: 'errs', style: 'margin:0' }, list.slice(0, 30).map(function (m) { return h('li', { text: '✗ ' + m }); })));
      }
      function parse() {
        var d;
        try { d = JSON.parse(ta.value); } catch (e) { say('bad', _t('Không phải JSON: {message}', { message: e.message })); return null; }
        if (!d || typeof d !== 'object' || Array.isArray(d)) { say('bad', _t('Gói âm phải là một object JSON ({FORMAT}).', { FORMAT: S.FORMAT })); return null; }
        return d;
      }
      // cổng kiểm + tên âm không trùng gói khác (tên âm là chung toàn thư viện) — cùng luật server chạy
      function check(d) {
        var c = S.validateSoundPack(d), errs = c.errors.slice();
        if (!errs.length) Object.keys(c.def.sounds).forEach(function (nm) { var o = S.get(nm); if (o && o.pack !== c.def.id) errs.push(_t('sounds.{nm}: trùng tên âm của gói "{pack}" — tên âm là chung toàn thư viện, đổi tên', { nm: nm, pack: o.pack })); });
        return { errors: errs, def: errs.length ? null : c.def };
      }
      function onlyCheck() {
        var d = parse(); if (!d) return;
        var c = check(d);
        if (c.errors.length) { say('bad', _t('Gói chưa qua cổng kiểm — {n} lỗi', { n: c.errors.length }), c.errors); return; }
        var names = Object.keys(c.def.sounds);
        say('ok', _t('Gói hợp lệ: “{name}” — {n} âm ({slice}{x}). Chưa lưu gì.', { name: c.def.name, n: names.length, slice: names.slice(0, 6).join(', '), x: names.length > 6 ? '…' : '' }));
      }
      var impB = h('button', { class: 'btn primary', type: 'button', id: 'lsImportGo', disabled: net.server ? null : true, title: net.server ? _t('Kiểm rồi lưu vào thư viện (có phiên bản)') : _t('Cần bản cài có máy chủ hỗ trợ gói âm (api/sound-packs)'), onclick: function () {
        var d = parse(); if (!d) return;
        var c = check(d);
        if (c.errors.length) { say('bad', _t('Gói chưa qua cổng kiểm — {n} lỗi', { n: c.errors.length }), c.errors); return; }
        var body2 = impProj ? Object.assign({}, d, { project: impProj }) : d;
        impB.disabled = true;
        Store.api('POST', 'api/sound-packs', { pack: body2, note: _t('Nhập trong Studio') }).then(function (rec) {
          var warns = Array.isArray(rec.warnings) ? rec.warnings : []; rec = clone(rec); delete rec.warnings;   // warnings không phải khoá của gói
          var r1 = S.registerPack(rec);
          if (r1.errors.length) throw Object.assign(new Error(_t('Server đã lưu nhưng Studio không nạp được gói')), { errors: r1.errors });
          net.stored[r1.def.id] = true;
          toast(_t('Đã nhập gói “{name}” ({n} âm).', { name: r1.def.name, n: Object.keys(r1.def.sounds).length }));
          paintTabs(); paintTab();
          if (warns.length) say('warn', _t('Đã lưu, nhưng có cảnh báo:'), warns);
        }).catch(function (e) { say('bad', e.status === 422 ? _t('Gói chưa qua cổng kiểm của máy chủ') : e.status === 404 ? _t('Máy chủ này chưa hỗ trợ gói âm (api/sound-packs)') : e.message, e.errors || (e.status === 422 ? [e.message] : null)); impB.disabled = !net.server; });
      } }, _t('Nhập vào thư viện'));
      function pickFile() {
        var inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: function () {
          var f = inp.files && inp.files[0]; inp.remove();
          if (!f) return;
          if (f.size > S.BUDGET.bytes * 2) { say('bad', _t('Tệp quá lớn (gói âm tối đa {n} KB).', { n: Math.round(S.BUDGET.bytes / 1000) })); return; }
          f.text().then(function (t) { ta.value = t; onlyCheck(); });
        } });
        document.body.appendChild(inp); inp.click();
      }
      var note = net.server ? null : h('p', { class: 'lc-msg', text: Store.mode === 'server' ? _t('Máy chủ này chưa có api/sound-packs — chỉ xem được gói có sẵn trong engine; vẫn kiểm gói được nhưng chưa lưu được.') : _t('Bản xem thử không có máy chủ: kiểm được gói nhưng không lưu được. Cài bản máy chủ để nhập gói.') });
      box.appendChild(h('div', { class: 'stack' },
        h('div', { class: 'panel' }, h('h3', null, _t('Gói âm'), h('span', { class: 'r note', text: _t('{n} gói · tên âm là chung toàn thư viện', { n: S.packs().length }) })), h('div', { class: 'scroll' }, tbl), delBox),
        h('div', { class: 'panel lc-import' }, h('h3', null, _t('Nhập gói âm'), h('span', { class: 'r note', text: _t('qua cổng kiểm như MCP / AI — gói không chứa mã') })),
          h('div', { class: 'pad stack' }, note,
            h('div', { class: 'row' }, lcBtn('up', _t('Chọn tệp .json'), { label: _t('Chọn tệp gói âm'), fn: pickFile }), h('span', { class: 'note', text: _t('hoặc dán JSON vào ô dưới') }), h('span', { class: 'sp', style: 'flex:1' }),
              net.server ? h('span', { class: 'note', text: _t('Nhập vào dự án') }) : null, net.server ? projectSelect(impProj, function (v) { impProj = v; }) : null),
            ta, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', id: 'lsCheck', onclick: onlyCheck }, _t('Kiểm gói (không lưu)')), impB), res))));
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
    vi: {   // i18n-ignore-start(câu đọc thử bằng giọng tiếng Việt — nội dung theo ngôn ngữ giọng, không phải giao diện)
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
    },   // i18n-ignore-end
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
  function bcpOf(lang) { return lang === 'yue' ? 'zh-HK' : lang || 'vi'; }   // thuộc tính lang của câu đọc thử (nội dung theo ngôn ngữ giọng)
  function lvLine(lang, role) { var L = VOICE_LINES[lang] || {}; return L[role] || VOICE_SAMPLE[lang] || VOICE_SAMPLE.vi; }

  function lvErr(e) { return e && e.status === 429 ? AiVoice.quotaText(e) : (e && e.message) || _t('Lỗi giọng AI'); }
  function lvOffWhy() {
    if (Store.mode !== 'server') return _t('Bản xem thử không có máy chủ — chỉ nghe được giọng máy.');
    var c = AiVoice.cfg;
    return !c ? _t('Không đọc được trạng thái giọng AI.') : !c.hasKey ? _t('Chưa có key Google — dán ở Cài đặt AI › Giọng AI.') : _t('Giọng AI đang tắt — bật ở Cài đặt AI › Giọng AI.');
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
        b = h('button', { class: 'btn lv-ai lc-ic', type: 'button', disabled: true, 'data-ai': ph, 'aria-label': _t('Nghe giọng AI{who}', { who: who() }), title: ph === 'off' ? lvOffWhy() : (o.nopWhy || _t('Chưa có giọng AI cho dòng này')) }, lcIcon('play'), o.full ? _t('Nghe giọng AI') : 'AI');
      } else if (ph === 'none' || ph === 'busy') {
        var armed = c.arm === 1 && ph === 'none';
        b = h('button', { class: 'btn lv-ai cost lc-ic', type: 'button', 'data-ai': 'read', 'data-confirm': armed ? '1' : null, disabled: ph === 'busy' ? true : null, onclick: c.click,
          'aria-label': _t('Đọc mẫu bằng AI (1 lượt){who}', { who: who() }), title: armed ? _t('Bấm lần nữa để đọc — tốn 1 lượt Google') : _t('Chưa có clip mẫu. Đọc mới tốn 1 lượt Google (câu đã đọc rồi thì không tốn lại).') },
          ph === 'busy' ? _t('Đang đọc…') : armed ? (o.full ? _t('Bấm lần nữa — tốn 1 lượt') : _t('Chắc chắn?')) : o.full ? _t('Đọc mẫu bằng AI (1 lượt)') : _t('AI · 1 lượt'));
      } else {
        b = h('button', { class: 'btn lv-ai lc-ic', type: 'button', 'data-ai': ph === 'have' ? 'play' : 'check', disabled: ph === 'wait' ? true : null, onclick: c.click, 'aria-label': _t('Nghe giọng AI{who}', { who: who() }),
          title: ph === 'have' ? _t('Clip mẫu đã có — nghe miễn phí') : _t('Nghe clip mẫu giọng AI nếu đã có (miễn phí)') }, lcIcon('play'), o.full ? _t('Nghe giọng AI') : 'AI');
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
        if (c.arm !== 1) { c.arm = 1; clearTimeout(armT); armT = setTimeout(function () { c.arm = 0; c.paint(); say(''); }, 5000); c.paint(); say(_t('Đọc mới tốn 1 lượt Google. Bấm lần nữa để đọc — hoặc đợi 5 giây để huỷ.')); return; }
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
    // tuyến lưu từ bản trước (tab "Giọng của dự án / tác phẩm"): việc đó nay ở phòng tác phẩm (Tạo tác › tab Giọng & âm thanh) — quên tab, mở đúng phòng
    if (r.tab || r.work) { var w0 = r.work; delete r.tab; delete r.work; saveRoute(); if (w0) { go({ page: 'works', work: w0, tab: 'voice' }); return; } }
    crumbs([{ t: _t('Giọng') }]);
    var V = GC.voices, A = GC.audio, server = Store.mode === 'server';
    if (!V || !A) { $('view').appendChild(h('div', { class: 'panel pad note lib-empty', text: _t('Bản này chưa nạp bộ giọng (engine/voices.js).') })); return; }
    // đi sang phòng làm phim để chốt giọng cho một tác phẩm: dự án đang lọc có đúng một tác phẩm thì mở thẳng tab Giọng & âm thanh, không thì tới danh sách tác phẩm của dự án
    function openRoom() {
      Store.api('GET', 'api/works').then(function (l) {
        var ws = (Array.isArray(l) ? l : []).filter(function (w) { return !st.proj || w.project === st.proj; });
        if (ws.length === 1) go({ page: 'works', work: ws[0].id, tab: 'voice' }); else go({ page: 'works', project: st.proj || undefined });
      }).catch(function (e) { toast(e.message); });
    }
    actions(h('span', { class: 'note', text: _t('{n} vai × {n2} ngôn ngữ — xem · nghe · thiết kế', { n: V.roleList().length, n2: V.langList().length }) }),
      server ? h('button', { class: 'btn', type: 'button', id: 'lvRoom', title: _t('Giọng chốt cho từng nhân vật của MỘT tác phẩm nằm ở phòng làm phim: Tạo tác › tác phẩm › tab Giọng & âm thanh'), onclick: openRoom }, _t('Chốt giọng cho tác phẩm › phòng làm phim')) : null,
      server ? h('button', { class: 'btn', type: 'button', onclick: function () { go({ page: 'ai', focus: 'voice' }); } }, _t('Cài đặt AI › Giọng AI ›')) : null);
    var pf = VoicePref.get(), alive = true, gen = 0;
    var st = { lang: pf.lang, accent: pf.accent, proj: r.project != null ? String(r.project) : lastProject(), q: '', age: '', kind: '', sel: V.ROLES[r.role] ? r.role : '' };
    if (st.proj && !Projects.all().some(function (p) { return p.id === st.proj; })) st.proj = '';
    var host = h('div', { class: 'lc' }), banner = h('div'), body = h('div', { class: 'lc-body' });
    host.appendChild(banner); host.appendChild(body); $('view').appendChild(host);
    function onSlash(ev) {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((ev.target || {}).tagName || '')) return;
      var q = $('lvQ'); if (q) { ev.preventDefault(); q.focus(); q.select(); }
    }
    document.addEventListener('keydown', onSlash);
    onLeave(function () { alive = false; gen++; A.hush(); document.removeEventListener('keydown', onSlash); });
    function remember() { route.role = st.sel || undefined; saveRoute(); }
    function ck(role) { return st.lang + '|' + st.accent + '|' + role; }
    function cast(role) { return AiVoice.roleCasts[ck(role)]; }   // giọng AI đã biết cho vai (ở ngôn ngữ + giọng vùng đang chọn)
    function accLabel(l, a) { return _l((V.LANGS[l].accents.filter(function (x) { return x[0] === a; })[0] || [a, a])[1]); }
    function langInfo() { return _l(V.LANGS[st.lang].label) + ' · ' + accLabel(st.lang, st.accent); }

    // lời nhắc trạng thái giọng AI — chưa có key thì vẫn xem / nghe giọng máy
    function paintBanner() {
      clear(banner);
      var c = AiVoice.cfg;
      if (lvReady()) {
        var cap = typeof c.dailyCap === 'number' && c.dailyCap > 0 ? ' / ' + c.dailyCap : '';
        banner.appendChild(h('div', { class: 'banner lv-banner ok', 'data-state': 'ready' }, lcState('ok', _t('Giọng AI sẵn sàng')), h('span', { class: 'note mono', text: _t('hôm nay {x}{cap} câu · {x2} câu đã lưu', { x: c.today || 0, cap: cap, x2: c.cached || 0 }) }),
          h('span', { class: 'sp' }), h('span', { class: 'note', text: _t('Clip mẫu đã có thì nghe miễn phí; đọc mới và thiết kế giọng tốn lượt Google (báo trước, bấm 2 lần).') })));
        return;
      }
      var head = !server ? _t('Bản xem thử') : !c ? _t('Chưa đọc được trạng thái giọng AI') : !c.hasKey ? _t('Chưa có key Google') : _t('Giọng AI đang tắt');
      var tail = !server ? _t('không có máy chủ — vẫn xem và nghe được giọng máy (miễn phí, giọng dự phòng của trình duyệt). Giọng AI cần bản cài.')
        : _t('vẫn xem và nghe được giọng máy (miễn phí, giọng dự phòng của trình duyệt). {x}', { x: c && c.hasKey ? _t('Bật lại để nghe giọng AI.') : _t('Muốn nghe giọng AI: dán key Google (miễn phí, dán là chạy).') });
      banner.appendChild(h('div', { class: 'banner lv-banner acc', 'data-state': 'off', role: 'status' }, lcState('warn', head), h('span', { class: 'note', text: tail }), h('span', { class: 'sp' }),
        server ? h('button', { class: 'btn sm', type: 'button', id: 'lvKey', onclick: function () { go({ page: 'ai', focus: 'voice' }); } }, c && c.hasKey ? _t('Bật ở Cài đặt AI › Giọng AI') : _t('Dán key ở Cài đặt AI › Giọng AI')) : null));
    }
    function paintTab() { gen++; A.hush(); clear(body); paintRoles(body); }
    function usersOf(role) {   // nhân vật (trong dự án đang chọn) đang dùng vai này
      return GC.assets().filter(function (a) { return groupOf(a) !== 'frame' && (!st.proj || a.project === st.proj) && AiVoice.roleOf(a) === role; });
    }
    function projSelect(onPick) {
      var s = h('select', { 'aria-label': _t('Dự án (để biết nhân vật nào dùng vai)'), title: _t('Dự án dùng để liệt kê nhân vật theo vai'), onchange: function () { st.proj = s.value; onPick(); } });
      s.appendChild(h('option', { value: '', text: _t('Mọi dự án') }));
      Projects.all().forEach(function (p) { s.appendChild(h('option', { value: p.id, text: Projects.name(p.id) })); });
      s.value = st.proj; return s;
    }
    // một dòng nhân vật trong danh sách "đang dùng vai này"
    function charItem(a, explicit) {
      return h('li', null, h('button', { type: 'button', 'data-char': a.key, title: _t('Mở hồ sơ {name}', { name: a.name }), onclick: function () { go({ page: 'lib-characters', key: a.key }); } },
        h('span', { class: 'dot', style: '--own:' + ownOf(a) }), h('span', { text: _lo(a, a.name) }), h('span', { class: 'note mono', text: a.id }), h('span', { class: 'sp', style: 'flex:1' }),
        h('span', { class: explicit ? 'chip ok' : 'chip', title: explicit ? _t('Đã chọn vai này trong hồ sơ nhân vật') : _t('Chưa chọn vai — Studio đoán từ vai trò / tính cách / tên'), text: explicit ? _t('đã chọn') : _t('đoán') })));
    }

    /* ---- Bộ giọng vai: 22 vai × ngôn ngữ / giọng vùng — MỘT nơi duy nhất (Cài đặt AI chỉ còn key + trần câu; giọng chốt theo tác phẩm ở phòng làm phim) ---- */
    function paintRoles(box) {
      var tg = gen, pumpN = 0, ctls = {}, castEls = {}, rows = V.roleList().map(function (ro) {
        var R = V.ROLES[ro.id];
        return { id: ro.id, label: _l(ro.label), age: ro.age, ageLabel: _l(ro.ageLabel), gender: ro.gender, kind: ro.kind, kindLabel: _l(ro.kindLabel), style: R.style, can: V.canDesign(ro.id), R: R };
      });
      function machine(x) { return A.voiceOf({ id: x.id, voice: { role: x.id } }, { lang: st.lang, accent: st.accent }); }
      function paramsOf(x, voice) { return { p: { text: lvLine(st.lang, x.id), voice: voice, role: x.id, lang: st.lang, accent: st.accent, state: 'normal', bubble: 'say' }, machine: function () { return machine(x); } }; }
      function ctlOf(x, full) {
        var k = (full ? 'i:' : '') + x.id;
        if (!ctls[k]) ctls[k] = lvAiCtl(function () { var c = cast(x.id); return c ? paramsOf(x, c.voice) : null; },
          { who: _l(x.label), full: !!full, nopWhy: _t('Đang chọn giọng AI cho vai này…'), onSpend: function () { var m = ctls[x.id]; if (m) m.check(); AiVoice.load(true).then(function () { if (alive) paintBanner(); }); } });
        return ctls[k];
      }
      function speakMachine(x) { A.unlock(); A.say(lvLine(st.lang, x.id), machine(x)); }
      function fillCast(s, id) {
        clear(s);
        if (!lvReady()) { s.appendChild(h('span', { class: 'chip', title: lvOffWhy(), text: _t('giọng máy') })); return; }
        var c = cast(id);
        if (!c) { s.appendChild(h('span', { class: 'muted', text: '…' })); return; }
        var sc = SRC_CHIP[c.source] || ['', 'chip'];
        s.appendChild(h('span', { class: 'mono', title: _l(c.label) || '', text: c.voice })); if (sc[0]) s.appendChild(h('span', { class: sc[1], style: 'margin-left:6px', text: sc[0] }));
      }
      function designedAt(id) { var d = (AiVoice.cfg && AiVoice.cfg.designs) || {}; return d[id + '|' + st.lang + '|' + st.accent] || null; }
      var insp = h('aside', { class: 'lc-insp', 'aria-label': _t('Chi tiết vai giọng') });
      var q = h('input', { type: 'search', id: 'lvQ', class: 'lc-q', placeholder: _t('Tìm không dấu…  ( / )'), title: _t('Tìm không dấu theo vai, tuổi, văn / võ, phong cách, tên nhân vật. Phím / để nhảy vào đây, ↓ để xuống bảng.'), 'aria-label': _t('Tìm vai'), value: st.q, oninput: function () { st.q = q.value.trim(); refresh(); },
        onkeydown: function (ev) { if (ev.key === 'Escape') { q.value = ''; st.q = ''; refresh(); grid.focus(); } else if (ev.key === 'ArrowDown') { ev.preventDefault(); grid.focus(); } } });
      var langSel = h('select', { 'aria-label': _t('Ngôn ngữ'), id: 'lvLang', onchange: function () { st.lang = langSel.value; st.accent = V.accent(st.lang, ''); VoicePref.set(st.lang, st.accent); fillAccent(); resetRows(); } });
      V.langList().forEach(function (l) { langSel.appendChild(h('option', { value: l.id, text: _l(l.label) })); });
      var accSel = h('select', { 'aria-label': _t('Giọng vùng'), id: 'lvAccent', onchange: function () { st.accent = accSel.value; VoicePref.set(st.lang, st.accent); resetRows(); } });
      function fillAccent() { clear(accSel); V.LANGS[st.lang].accents.forEach(function (a) { accSel.appendChild(h('option', { value: a[0], text: _l(a[1]) })); }); accSel.value = st.accent; }
      langSel.value = st.lang; fillAccent();
      var kindSel = h('select', { 'aria-label': _t('Lọc theo kiểu vai (văn / võ …)'), onchange: function () { st.kind = kindSel.value; refresh(); } });
      kindSel.appendChild(h('option', { value: '', text: _t('Mọi kiểu (văn / võ…)') }));
      Object.keys(V.KINDS).forEach(function (k) { kindSel.appendChild(h('option', { value: k, text: _l(V.KINDS[k]) })); });
      kindSel.value = st.kind;
      var chips = h('div', { class: 'fxchips lc-cats', role: 'group', 'aria-label': _t('Lọc theo nhóm tuổi') }), chipEls = {};
      [['', _t('Tất cả')]].concat(V.AGES).forEach(function (c) {
        var n = h('span', { class: 'n' }), b = h('button', { type: 'button', 'data-age': c[0], onclick: function () { st.age = st.age === c[0] ? '' : c[0]; refresh(); } }, _l(c[1]), n);
        chipEls[c[0]] = { b: b, n: n }; chips.appendChild(b);
      });
      var count = h('span', { class: 'note lc-count' });
      var grid = lcGrid({
        id: 'lv', label: _t('Bộ giọng vai'), empty: _t('Không có vai nào khớp bộ lọc.'),
        cols: [
          { t: _t('Nghe'), w: 120, frozen: true, cell: function (x) {
            var m = lcPlay(_t('Nghe giọng máy — {label}', { label: _l(x.label) }), function () { speakMachine(x); }); m.setAttribute('data-machine', x.id); m.title = _t('Giọng máy (trình duyệt, miễn phí)');   // câu đọc thử (theo ngôn ngữ giọng) hiện ở cột Câu mẫu
            return h('span', { class: 'lv-pair' }, m, ctlOf(x).el);
          } },
          { t: _t('ID vai'), w: 124, frozen: true, cls: 'id', v: function (x) { return x.id; }, cell: function (x) { return x.id; } },
          { t: 'Vai', w: 148, v: function (x) { return _l(x.label); }, cell: function (x) { return _l(x.label); } },
          { t: _t('Nhóm tuổi'), w: 92, v: function (x) { return V.AGES.map(function (a) { return a[0]; }).indexOf(x.age); }, cell: function (x) { return _l(x.ageLabel); } },
          { t: _t('Giới'), w: 54, v: function (x) { return x.gender; }, cell: function (x) { return x.gender === 'f' ? _t('Nữ') : _t('Nam'); } },
          { t: _t('Văn / võ / …'), w: 108, v: function (x) { return _l(x.kindLabel); }, cell: function (x) { return _l(x.kindLabel); } },
          { t: _t('Thiết kế được?'), w: 122, v: function (x) { return x.can ? 0 : 1; }, cell: function (x) {
            return x.can ? lcState('ok', _t('Được'), _t('Có thể thiết kế giọng riêng cho vai này (tốn 1 lượt Google)')) : lcState('bad', _t('Google chặn'), _t('Google không cho thiết kế giọng trẻ em / vị thành niên (chính sách an toàn)'));
          } },
          { t: _t('Phong cách nói'), w: 220, cls: 'mono mut', v: function (x) { return x.style; }, cell: function (x) { return x.style; }, tip: function (x) { return x.style; } },
          { t: _t('Giọng AI (cast)'), w: 180, cell: function (x) { var s = h('span'); castEls[x.id] = s; fillCast(s, x.id); return s; } },
          { t: _t('Nhân vật dùng vai'), w: 210, cls: 'mut', cell: function (x) { var u = usersOf(x.id).map(function (a) { return a.name; }); return u.length ? u.slice(0, 3).join(', ') + (u.length > 3 ? ' +' + (u.length - 3) : '') : '—'; },
            tip: function (x) { return usersOf(x.id).map(function (a) { return a.name; }).join(', '); } },
          { t: _t('Câu mẫu'), w: 340, cls: 'mut', cell: function (x) { return h('span', { lang: bcpOf(st.lang), title: lvLine(st.lang, x.id), text: lvLine(st.lang, x.id) }); } }
        ],
        group: function (x) { return _l(x.ageLabel); },
        onSelect: function (x) { st.sel = x ? x.id : ''; remember(); inspect(x); if (x && lvReady()) ensureCast(x); },
        onAct: function (x) { speakMachine(x); },
        foot: function (v) {
          var d = 0, kids = 0; v.forEach(function (x) { if (x.can) d++; else kids++; });
          return [_t('{n} vai · {d} thiết kế được · {kids} bị Google chặn · {langInfo}', { n: v.length, d: d, kids: kids, langInfo: langInfo() }), h('span', { class: 'sp' }), _t('↑↓ chọn · Space nghe giọng máy · / tìm')];
        }
      });
      // giọng vùng trung thực (Q14): chỉ vai đã Thiết kế giọng mới có giọng vùng thật
      var regionNote = h('span', { class: 'note', id: 'lvRegionNote' });
      function paintRegionNote() { regionNote.textContent = _t('Giọng vùng chỉ có hiệu lực ở vai đã Thiết kế giọng; chưa thiết kế = giọng chung của ngôn ngữ.{x}{x2}', { x: st.lang === 'en' ? _t(' (Anh Mỹ / Anh Anh có thư viện giọng Google riêng nên có sẵn.)') : '', x2: LANG_HINT[st.lang] ? ' ' + LANG_HINT[st.lang] : '' }); }
      paintRegionNote();
      box.appendChild(h('div', { class: 'stack', style: 'gap:8px' },
        h('div', { class: 'lc-bar' }, langSel, accSel, projSelect(function () { resetRows(); }), kindSel, q, h('span', { class: 'sp' }), count), h('div', { class: 'lc-bar', style: 'min-height:0' }, chips, h('span', { class: 'sp' }), regionNote),
        h('div', { class: 'lc-split' }, grid.el, insp)));
      function refresh() {
        var f = lcFold(st.q), base = rows.filter(function (x) {
          if (st.kind && x.kind !== st.kind) return false;
          if (!f) return true;
          return lcFold([x.id, _l(x.label), _l(x.ageLabel), _l(x.kindLabel), x.gender === 'f' ? 'nu' : 'nam', x.style].concat(usersOf(x.id).map(function (a) { return a.name; })).join(' | ')).indexOf(f) >= 0;
        });
        var cnt = {}; base.forEach(function (x) { cnt[x.age] = (cnt[x.age] || 0) + 1; });
        Object.keys(chipEls).forEach(function (k) { chipEls[k].n.textContent = String(k ? cnt[k] || 0 : base.length); chipEls[k].b.setAttribute('aria-pressed', String(st.age === k)); });
        var shown = st.age ? base.filter(function (x) { return x.age === st.age; }) : base;
        count.textContent = shown.length + ' / ' + rows.length + ' vai';
        grid.set(shown, st.sel);
        pumpAi();
      }
      // đổi ngôn ngữ / giọng vùng / dự án: câu mẫu + cast + clip đều khác → dựng lại nút, hỏi lại cast
      function resetRows() { Object.keys(ctls).forEach(function (k) { ctls[k].stop(); }); ctls = {}; castEls = {}; paintRegionNote(); refresh(); }
      function ensureCast(x) {
        if (cast(x.id)) return;
        var key = ck(x.id);
        AiVoice.castRole(x.id, st.lang, st.accent).then(function () { if (!alive || tg !== gen || key !== ck(x.id)) return; if (castEls[x.id]) fillCast(castEls[x.id], x.id); var c = ctls[x.id]; if (c) c.check(); if (st.sel === x.id) inspect(grid.cur()); }).catch(function () { /* hàng vẫn nghe được giọng máy */ });
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
              AiVoice.castRole(x.id, st.lang, st.accent).then(function () {
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
        if (!x) { insp.appendChild(h('div', { class: 'panel pad note', text: _t('Chọn một vai trong bảng.') })); return; }
        var R = x.R, c = cast(x.id), d = lvReady() ? designedAt(x.id) : null, ready = lvReady(), sample = lvLine(st.lang, x.id), mv = machine(x), ictl = ctlOf(x, true);
        var mBtn = h('button', { class: 'btn primary lc-ic', type: 'button', id: 'lvHear', 'aria-label': _t('Nghe giọng máy — {label}', { label: _l(x.label) }), onclick: function () { speakMachine(x); } }, lcIcon('play'), _t('Nghe giọng máy'));
        // giọng AI sẽ được chọn cho vai ở ngôn ngữ + vùng đang chọn
        var castEl = h('div', { 'data-cast': x.id });
        if (!ready) castEl.appendChild(h('p', { class: 'lc-hint', text: _t('Chưa dùng giọng AI — phim đọc bằng giọng máy: {x} · cao độ {vn} · tốc độ {vn2} · {lang}.', { x: mv.gender === 'f' ? _t('nữ') : _t('nam'), vn: vn(mv.pitch), vn2: vn(mv.rate), lang: mv.lang }) }));
        else if (!c) castEl.appendChild(h('p', { class: 'lc-hint', text: _t('Đang hỏi máy chủ chọn giọng…') }));
        else { var sc = SRC_CHIP[c.source] || ['', 'chip']; castEl.appendChild(h('div', { class: 'row' }, h('b', { class: 'mono', text: c.voice }), sc[0] ? h('span', { class: sc[1], text: _t(sc[0]) }) : null)); if (_l(c.label) && c.label !== c.voice) castEl.appendChild(h('p', { class: 'lc-hint', text: _l(c.label) })); }
        // giọng đã thiết kế riêng cho vai + ngôn ngữ + vùng này
        var desEl = h('div');
        if (!ready) desEl.appendChild(h('p', { class: 'lc-hint', text: _t('Cần giọng AI sẵn sàng để xem giọng đã thiết kế.') }));
        else if (d) {
          desEl.appendChild(h('div', { class: 'row' }, h('b', { class: 'mono', text: d.voice }), lcState('ok', _t('đã thiết kế')), d.at ? h('span', { class: 'note', text: fmtTime(d.at) }) : null,
            d.preview ? lcBtn('play', _t('Nghe mẫu thiết kế'), { label: _t('Nghe mẫu thiết kế — {label}', { label: _l(x.label) }), fn: function () { A.unlock(); AiVoice.download(d.preview).then(function (buf) { AiVoice.speak(sample, buf, mv); }).catch(function (e) { toast(e.message); }); } }) : null));
        } else desEl.appendChild(h('p', { class: 'lc-hint', text: _t('Chưa thiết kế riêng cho {langInfo} — đang dùng giọng thư viện / dựng sẵn ở trên.', { langInfo: langInfo() }) }));
        // thiết kế giọng: tốn 1 lượt, ~25 s, chỉ chủ máy; vai trẻ em bị Google chặn
        var kid = !x.can, why = kid ? _t('Google không cho thiết kế giọng trẻ em / vị thành niên (chính sách an toàn) — vai này dùng giọng trẻ trung có sẵn.') : !ready ? lvOffWhy() : '';
        var desLabel = d ? _t('Thiết kế lại giọng cho vai này') : _t('Thiết kế giọng cho vai này'), desB = h('button', { class: 'btn lc-ic', type: 'button', id: 'lvDesign', disabled: why ? true : null, 'data-confirm': null,
          title: why || _t('Thiết kế giọng riêng cho vai này trên project Google của chủ máy: ~25 giây, tốn 1 lượt (≈ $0,013 khi trả phí). Kết quả được nhớ — mọi phim dùng vai này đều dùng giọng đó.'),
          onclick: function () { design(x, desB, desLabel, sample, mv); } }, desLabel);
        var chars = usersOf(x.id), pn = st.proj ? Projects.name(st.proj) : _t('mọi dự án');
        var kv = h('dl', { class: 'lc-kv' },
          h('dt', { text: 'Vai' }), h('dd', { text: _l(x.ageLabel) + ' · ' + (x.gender === 'f' ? _t('Nữ') : 'Nam') + ' · ' + _l(x.kindLabel) }),
          h('dt', { text: _t('Phong cách nói') }), h('dd', { class: 'mono', text: R.style }),
          h('dt', { text: _t('Chân dung') }), h('dd', { class: R.design ? 'mono' : null, style: R.design ? 'font-size:12px' : null, text: R.design || _t('— (vai trẻ em: không thiết kế được)') }),
          h('dt', { text: _t('Tuổi hợp vai') }), h('dd', { text: R.ages ? _t('{x}–{x2} tuổi · cao độ ưa {prefPitch}', { x: R.ages[0], x2: R.ages[1], prefPitch: R.prefPitch }) : _t('giọng trẻ trung có sẵn') }),
          h('dt', { text: _t('Giọng dựng sẵn') }), h('dd', { class: 'mono', style: 'font-size:12px', text: R.ai.join(' · ') }));
        insp.appendChild(h('div', { class: 'panel' }, h('h3', null, h('span', { text: _l(x.label) }), h('span', { class: 'r mono', text: x.id })),
          h('div', { class: 'pad stack' },
            h('div', null, h('div', { class: 'lc-sec', text: _t('Câu mẫu · {langInfo}', { langInfo: langInfo() }) }), h('p', { class: 'lv-line', lang: V.LANGS[st.lang].bcp, text: sample }), h('div', { class: 'row', style: 'margin-top:8px' }, mBtn, ictl.el), ictl.note),
            kv,
            h('div', null, h('div', { class: 'lc-sec', text: _t('Giọng AI sẽ dùng cho vai này') }), castEl),
            h('div', null, h('div', { class: 'lc-sec', text: _t('Giọng đã thiết kế') }), desEl),
            h('div', null, desB, why ? h('p', { class: 'lc-hint', 'data-why': 'design', style: 'margin-top:4px', text: why }) : h('p', { class: 'lc-hint', style: 'margin-top:4px', text: _t('Tốn 1 lượt Google, ~25 giây, chỉ chủ máy (bấm 2 lần để xác nhận).') }), h('p', { class: 'lc-hint warn', id: 'lvDesignNote', hidden: true })),
            h('div', null, h('div', { class: 'lc-sec', text: _t('Nhân vật đang dùng vai này · {pn} · {n}', { pn: pn, n: chars.length }) }),
              chars.length ? h('ul', { class: 'lv-chars' }, chars.map(function (a) { return charItem(a, !!(a.voice && a.voice.role)); })) : h('p', { class: 'lc-hint', text: _t('Chưa có nhân vật nào trong {pn} dùng vai này.', { pn: pn }) }),
              h('p', { class: 'lc-hint', style: 'margin-top:6px', text: _t('Giọng chốt cho từng nhân vật của một tác phẩm nằm ở phòng làm phim: Tạo tác › tác phẩm › tab Giọng & âm thanh.') })))));
        if (ictl.phase === 'idle' && ready && c) ictl.check();
      }
      function design(x, btn, label, sample, mv) {
        var note = $('lvDesignNote');
        function say(t) { if (note) { note.textContent = t || ''; note.hidden = !t; } }
        if (btn.getAttribute('data-confirm') !== '1') {
          btn.setAttribute('data-confirm', '1'); btn.textContent = _t('Bấm lần nữa — tốn 1 lượt, ~25 giây'); say('');
          setTimeout(function () { if (btn.isConnected && btn.getAttribute('data-confirm') === '1') { btn.removeAttribute('data-confirm'); btn.textContent = label; } }, 6000);
          return;
        }
        btn.removeAttribute('data-confirm'); btn.disabled = true; btn.textContent = _t('Đang thiết kế… ~25 s'); say('');
        AiVoice.designRole(x.id, st.lang, st.accent).then(function (res) {
          AiVoice.resetCasts();   // phim dùng ngay giọng mới
          toast(_t('Đã thiết kế giọng cho {label}{x}', { label: _l(x.label), x: res.preview ? _t(' — đang nghe thử.') : '.' }));
          if (alive) { resetRows(); }
          return res.preview ? AiVoice.download(res.preview).then(function (buf) { A.unlock(); AiVoice.speak(sample, buf, mv); }) : null;
        }).catch(function (e) {
          var t = lvErr(e); toast(t + '.');
          if (alive && btn.isConnected) { btn.disabled = false; btn.textContent = label; var n2 = $('lvDesignNote'); if (n2) { n2.textContent = t; n2.hidden = false; } }
        });
      }
      refresh();
    }

    function aiSig() { var c = AiVoice.cfg; return lvReady() + '|' + (c ? JSON.stringify(c.designs || {}) : ''); }
    (server && AiVoice.on() && !AiVoice.cfg ? AiVoice.load() : Promise.resolve()).then(function () {
      if (!alive) return;
      paintBanner(); paintTab();
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
      if (!GC.projectId(p.id) || !String(p.name || '').trim()) return Promise.reject(new Error(_t('Dự án cần tên và id hợp lệ')));
      var rec = { id: p.id, name: String(p.name).trim().slice(0, 40), description: String(p.description || '').slice(0, 300) };
      self.list = self.list.filter(function (x) { return x.id !== p.id; }).concat(rec);
      try { localStorage.setItem('gc-projects', JSON.stringify(self.list)); } catch (e) { /* bỏ qua */ }
      return Promise.resolve(rec);
    },
    name: function (id) { var p = this.list.filter(function (x) { return x.id === id; })[0]; return id ? (p ? p.name : id) : _t('Chưa xếp dự án'); },
    // asset của tôi theo dự án (cả dự án chưa đăng ký mà asset đang trỏ tới)
    all: function () {
      var ids = this.list.map(function (p) { return p.id; }), out = this.list.slice();
      mineAll().forEach(function (x) { if (x.project && ids.indexOf(x.project) < 0) { ids.push(x.project); out.push({ id: x.project, name: x.project, description: '' }); } });
      return out;
    }
  };
  function mineAll() { return [].concat(GC.assets(), GC.items(), GC.scenes()).filter(function (x) { return x.pack === MY_PACK; }); }
  function inProject(arr, pid) { return arr.filter(function (x) { return x.pack === MY_PACK && (x.project || '') === pid; }); }
  // tên tệp an toàn: bỏ dấu, a-z0-9-, ≤ 40 ký tự; tên thiết bị dành riêng của Windows (con, prn, aux, nul, com1–9, lpt1–9) thêm hậu tố — Windows không tạo được tệp "con.webm"
  function slugify(s) {
    var x = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(x) ? x + '-gc' : x;
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
    var s = h('select', { 'aria-label': _t('Dự án chủ đề'), onchange: function () {
      if (s.value !== '__new') { onChange(s.value); return; }
      var name = window.prompt(_t('Tên dự án chủ đề mới (ví dụ: Tam Quốc, Cổ tích Việt, Văn phòng):'));
      if (!name || !slugify(name)) { s.value = cur || ''; return; }
      Projects.save({ id: slugify(name), name: name }).then(function (rec) { fill(rec.id); onChange(rec.id); toast(_t('Đã tạo dự án {name}', { name: rec.name })); })
        .catch(function (e) { toast(e.message); s.value = cur || ''; });
    } });
    function fill(v) {
      clear(s);
      s.appendChild(h('option', { value: '', text: _t('— Chưa xếp dự án —') }));
      Projects.all().forEach(function (p) { s.appendChild(h('option', { value: p.id, text: _lo(p, p.name) })); });
      s.appendChild(h('option', { value: '__new', text: _t('+ Dự án mới…') }));
      s.value = v || ''; cur = v;
    }
    fill(cur);
    return s;
  }

  // ---- Thư viện › Dự án chủ đề
  PAGES.projects = function (r) {
    crumbs([{ t: _t('Dự án chủ đề') }]);
    var sel = r.project != null ? r.project : null;
    actions(h('span', { class: 'note', text: _t('Asset tạo từ bộ khung chuẩn được xếp theo dự án chủ đề.') }),
      Store.mode === 'server' ? h('button', { class: 'btn', title: _t('Nhập tệp gói dự án (.json) — mọi thứ đi qua cổng kiểm'), onclick: pickBundle }, _t('Nhập gói…')) : null,
      Store.mode === 'server' ? samplesLeft(true).map(function (S) { return h('button', { class: 'btn', title: _t(S.note), onclick: function () { importDemo(S); } }, _t(S.short)); }) : null,
      Store.mode === 'server' ? samplesStale().map(function (S) { return h('button', { class: 'btn', title: _t('Bộ mẫu trên máy là bản cũ — {note}', { note: _t(S.note) }), onclick: function () { updateDemo(S); } }, _t('⟳ Cập nhật {replace}', { replace: _t(S.short).replace(/^\S+ /, '') })); }) : null,
      h('button', { class: 'btn primary', onclick: function () { go({ page: 'create', project: sel || '' }); } }, _t('+ Tạo asset mới ›')));
    var listBox = h('div', { class: 'stack' }), detail = h('div', { class: 'stack' });
    var nName = h('input', { type: 'text', placeholder: _t('Tên dự án (vd: Tam Quốc)'), maxlength: 40, style: 'width:100%' });
    var nDesc = h('input', { type: 'text', placeholder: _t('Mô tả ngắn (tuỳ chọn)'), maxlength: 300, style: 'width:100%' });
    var form = h('form', { class: 'panel pad stack', onsubmit: function (ev) {
      ev.preventDefault();
      var id = slugify(nName.value);
      if (!id) { toast(_t('Nhập tên dự án.')); return; }
      Projects.save({ id: id, name: nName.value, description: nDesc.value }).then(function (rec) { sel = rec.id; nName.value = nDesc.value = ''; paint(); toast(_t('Đã tạo dự án {name}', { name: rec.name })); }).catch(function (e) { toast(e.message); });
    } }, h('b', { text: _t('Dự án mới') }), nName, nDesc, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, _t('Tạo dự án'))));
    $('view').appendChild(h('div', { class: 'split lib' }, h('div', { class: 'stack' }, listBox, form), h('div', { class: 'sticky' }, detail)));
    function counts(pid) { return [inProject(GC.assets(), pid).length, inProject(GC.items(), pid).length, inProject(GC.scenes(), pid).length]; }
    function paint() {
      clear(listBox);
      var ps = Projects.all();
      if (mineAll().some(function (x) { return !x.project; })) ps = ps.concat({ id: '', name: _t('Chưa xếp dự án'), description: _t('Asset của tôi chưa gắn dự án nào.') });
      if (sel == null && ps.length) sel = ps[0].id;
      if (!ps.length) listBox.appendChild(h('div', { class: 'panel pad stack lib-empty' }, h('span', { class: 'note', text: _t('Chưa có dự án chủ đề nào. Tạo một dự án (ví dụ "Tam Quốc") rồi vào Xưởng › Tạo asset mới để dựng nhân vật, trang bị, cảnh từ bộ khung chuẩn — hoặc mở dự án mẫu để xem trọn luồng ngay.') }),
        Store.mode === 'server' ? h('div', { class: 'row' }, samplesLeft().map(function (S, i) { return h('button', { class: 'btn' + (i ? '' : ' primary'), onclick: function () { importDemo(S); } }, _t(S.button)); }), h('button', { class: 'btn', onclick: pickBundle }, _t('Nhập gói…'))) : null));
      var grid = h('div', { class: 'libgrid' });
      ps.forEach(function (p) {
        var c = counts(p.id), first = [].concat(inProject(GC.assets(), p.id), inProject(GC.items(), p.id), inProject(GC.scenes(), p.id))[0];
        grid.appendChild(h('button', anc({ class: 'libcard proj', 'aria-pressed': String(sel === p.id), title: p.id || _t('(chưa xếp)'), onclick: function () { sel = p.id; paint(); } }, p.id ? 'project:' + p.id : null, _lo(p, p.name)),
          h('div', { class: 'im' }, first ? h('img', { src: thumbOf(first), alt: '' }) : h('div', { class: 'note', style: 'padding:28px 0', text: _t('trống') })),
          h('div', { class: 'lb' }, h('b', { text: _lo(p, p.name) }), h('span', { class: 'note', text: _t('{x} nhân vật · {x2} vật phẩm · {x3} bối cảnh', { x: c[0], x2: c[1], x3: c[2] }) }),
            p.sample ? h('span', { class: 'chip', title: p.sample.license || '', text: _t('Bộ mẫu {x}', { x: p.sample.owner || 'Gen Labs' }) }) : null)));
      });
      if (ps.length) listBox.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Dự án'), h('span', { class: 'r note', text: ps.length })), h('div', { class: 'pad' }, grid)));
      paintDetail();
    }
    function paintDetail() {
      clear(detail);
      if (sel == null) { dockObj('project', null); return; }
      var P = Projects.all().filter(function (p) { return p.id === sel; })[0] || { id: '', name: _t('Chưa xếp dự án'), description: '' };
      dockObj('project', sel || null, P.name);
      var parts = [[_t('Nhân vật'), inProject(GC.assets(), sel), 'lib-characters'], [_t('Vật phẩm'), inProject(GC.items(), sel), 'lib-items'], [_t('Bối cảnh'), inProject(GC.scenes(), sel), 'lib-scenes']];
      var body = h('div', { class: 'pad stack' }, P.description ? h('div', { class: 'note', text: _lo(P, P.description) }) : null,
        P.sample ? h('div', { class: 'banner' }, h('span', { text: _t('Bộ mẫu của {x} — {x2}. Muốn bán: dựng bộ của bạn trong một dự án riêng rồi phát hành.', { x: P.sample.owner || 'Gen Labs', x2: _t(SAMPLE_TERMS) }) }),   // câu điều khoản HIỆN HÀNH (không lấy chữ đã lưu lúc cài — bản cài cũ mang câu cũ; đổi câu không bắt cập nhật bộ mẫu)
          Store.mode === 'server' ? samplesStale().filter(function (S) { return S.id === P.id; }).map(function (S) { return h('button', { class: 'btn sm primary', onclick: function () { updateDemo(S); } }, _t('⟳ Có bản mới của bộ mẫu — cập nhật')); }) : null) : null);
      parts.forEach(function (g) {
        if (!g[1].length) return;
        var row = h('div', { class: 'libgrid sm' });
        g[1].forEach(function (x) {
          row.appendChild(h('button', { class: 'libcard', title: x.key, onclick: function () { go({ page: g[2], key: x.key }); } },
            h('div', { class: 'im' }, h('img', { src: thumbOf(x), alt: _lo(x, x.name), loading: 'lazy' })), h('div', { class: 'lb' }, h('b', { text: _lo(x, x.name) }))));
        });
        body.appendChild(h('div', { class: 'stack' }, h('b', { text: g[0] + ' (' + g[1].length + ')' }), row));
      });
      if (!parts.some(function (g) { return g[1].length; })) body.appendChild(h('div', { class: 'note', text: _t('Dự án chưa có asset. Bấm "Tạo asset mới" để dựng từ bộ khung chuẩn.') }));
      body.appendChild(h('div', { class: 'usebar' }, h('b', { text: _t('Dùng') }),
        h('button', { class: 'btn sm primary', onclick: function () { go({ page: 'create', project: sel }); } }, _t('+ Tạo asset trong dự án')),
        h('button', { class: 'btn sm', onclick: function () { setLastProject(sel); go({ page: 'works', project: sel }); } }, _t('Làm phim với dự án này ›')),
        sel ? h('button', { class: 'btn sm', title: _t('Sao lưu / chuyển máy: mọi asset (cả nháp) + tác phẩm — nhập lại được ở bản cài khác'), onclick: function () { exportBundle(P); } }, _t('Gói sao lưu (JSON)')) : null,
        P.sample ? h('span', { class: 'chip', title: _t('Bộ mẫu không xuất gói bán'), text: _t('Gói bán · bộ mẫu, không bán') }) :
        sel ? h('button', { class: 'btn sm', title: _t('Gói để bán / chia sẻ: chỉ asset đã PHÁT HÀNH, không kèm tác phẩm'), onclick: function () { exportBundle(P, true); } },
          _t('Gói bán · {n} asset phát hành', { n: [].concat(inProject(GC.assets(), sel), inProject(GC.items(), sel), inProject(GC.scenes(), sel)).filter(function (x) { return GC.statusOf(x.status) === 'published'; }).length }))
          : h('span', { class: 'note', text: _t('Xếp asset vào một dự án (ở khung "Dùng" của từng asset) để tải gói.') })));
      detail.appendChild(h('div', { class: 'panel' }, h('h3', null, _lo(P, P.name), h('span', { class: 'r mono', text: P.id || '—' })), body));
    }
    paint();
  };
  // dự án mẫu đi kèm bản cài: nhập qua đúng cổng như mọi gói (studio/mau/<file>.json)
  // Văn phòng vui có hai bản cùng câu chuyện (lang = ngôn ngữ lời thoại): bản đúng ngôn ngữ giao diện đứng đầu và là bản duy nhất mời ở
  // Bắt đầu nhanh / thư viện trống; bản kia vẫn mở được ở thanh Dự án chủ đề (samplesLeft(true)). Tam Quốc chỉ có tiếng Việt (ADR 0007), mời ở cả hai
  var SAMPLES = [
    { id: 'mau-fun-office', file: 'fun-office', lang: 'en', short: N_('✨ Fun Office (mẫu tiếng Anh)'), button: N_('✨ Mở dự án mẫu tiếng Anh "Fun Office"'), note: N_('Bản tiếng Anh của "Văn phòng vui": 3 nhân vật · 2 bối cảnh · phim 4 phân cảnh lời thoại tiếng Anh — xem trọn luồng trong 10 giây, sửa và xuất thử thoải mái.') },
    { id: 'mau-van-phong-vui', file: 'van-phong-vui', lang: 'vi', short: N_('✨ Văn phòng vui (mẫu)'), button: N_('✨ Mở dự án mẫu "Văn phòng vui"'), note: N_('3 nhân vật · 2 bối cảnh · phim 4 phân cảnh — xem trọn luồng trong 10 giây, sửa và xuất thử thoải mái.') },
    { id: 'mau-tam-quoc', file: 'tam-quoc', version: '2026.10.19-am2', short: N_('🏯 Tam Quốc (bộ chủ đề)'), button: N_('🏯 Mở bộ chủ đề mẫu "Tam Quốc"'), note: N_('7 tướng · 13 trang bị · 8 bối cảnh · phim 6 phân cảnh (có màn đấu) · gói âm Tam Quốc (trống trận, tù và…) — một bộ thư viện trọn vẹn dựng từ khung, đã Phát hành: xem Gói bán trông thế nào.') }
  ];
  // bộ mẫu chưa cài, theo thứ tự mời: bản đúng ngôn ngữ giao diện → bộ không chia ngôn ngữ → bản ngôn ngữ khác (all = có cả bản khác)
  function samplesLeft(all) {
    var L = I18N.lang(), pref = SAMPLES.some(function (S) { return S.lang === L; }) ? L : 'en';   // giao diện không có bản riêng → bản tiếng Anh
    var rank = function (S) { return !S.lang ? 1 : S.lang === pref ? 0 : 2; };
    return SAMPLES.filter(function (S) { return !Projects.all().some(function (p) { return p.id === S.id; }) && (all || rank(S) < 2); })
      .sort(function (a, b) { return rank(a) - rank(b); });
  }
  // bộ mẫu đã nhập từ bản cũ (thiếu phân cảnh / asset mới) — bản cài tự cập nhật mã nhưng không tự đụng dữ liệu của người dùng
  function samplesStale() { return SAMPLES.filter(function (S) { var p = Projects.all().filter(function (x) { return x.id === S.id; })[0]; return S.version && p && p.sample && p.sample.version !== S.version; }); }
  function updateDemo(S) {
    if (!window.confirm(_t('Cập nhật "{replace}" lên bản mới nhất?\n\nChỗ bạn đã sửa trên bộ mẫu thành phiên bản cũ (vẫn xem lại được trong lịch sử).', { replace: _t(S.short).replace(/^\S+ /, '') }))) return;
    toast(_t('Đang cập nhật {replace}…', { replace: _t(S.short).replace(/^\S+ /, '') }));
    fetch('studio/mau/' + S.file + '.json').then(function (r) { if (!r.ok) throw new Error(_t('Không tải được bộ mẫu')); return r.json(); }).then(function (b) { return importBundle(b, true); }).catch(function (e) { toast(e.message); });
  }
  function exportBundle(P, sale) {
    // bản cài: server dựng gói (đủ tác phẩm + cảnh báo); bản xem thử không server: dựng tại trình duyệt — cùng một luật gói bán
    var get = Store.mode === 'server' ? Store.api('GET', 'api/projects/export?id=' + encodeURIComponent(P.id) + (sale ? '&sale=1' : '')) : Promise.resolve(projectBundle(P, sale));
    get.then(function (b) {
      if (sale && !b.characters.length && !b.items.length && !b.scenes.length) { toast(_t('Dự án chưa có asset nào PHÁT HÀNH — bấm "Phát hành" ở khung "Dùng" của từng asset trong Thư viện.')); return; }
      download((P.id || 'chua-xep') + (sale ? '-goi-ban.json' : '-sao-luu.json'), JSON.stringify(b, null, 2), 'application/json');
      if (b.warnings && b.warnings.length) window.alert(_t('Gói bán có {n} cảnh báo:\n• {slice}', { n: b.warnings.length, slice: b.warnings.slice(0, 8).join('\n• ') }));
      toast(_t('Đã xuất {x}{name}: {n} nhân vật · {n2} vật phẩm · {n3} bối cảnh · {n4} tác phẩm', { x: sale ? _t('gói bán ') : _t('gói sao lưu '), name: P.name, n: b.characters.length, n2: b.items.length, n3: b.scenes.length, n4: (b.works || []).length }));
    }).catch(function (e) { toast(e.message); });
  }
  // nhập gói: trùng id thì hỏi lưu đè (thành phiên bản mới — bản cũ vẫn trong lịch sử); xong thì nạp lại và mở dự án ở Thư viện
  function importBundle(bundle, overwrite) {
    return fetch('api/projects/import', { method: 'POST', headers: Store.headers(), body: JSON.stringify({ bundle: bundle, overwrite: !!overwrite }) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (x) {
        if (x.status === 409 && !overwrite) {
          if (window.confirm(_t('{error}\n\nLưu đè các mục trùng thành phiên bản mới?', { error: x.j.error }))) return importBundle(bundle, true);
          return null;
        }
        if (x.status >= 400) throw new Error(x.j.error || (_t('Lỗi {status}', { status: x.status })));
        var r = x.j, c = r.counts;
        var msg = _t('Đã nhập {characters} nhân vật · {items} vật phẩm · {scenes} bối cảnh{x}{x2} · {works} tác phẩm ({shots} phân cảnh)', { characters: c.characters, items: c.items, scenes: c.scenes, x: c.soundPacks ? _t(' · {soundPacks} gói âm', { soundPacks: c.soundPacks }) : '', x2: c.motionPacks ? _t(' · {motionPacks} gói động tác', { motionPacks: c.motionPacks }) : '', works: c.works, shots: c.shots });
        if (r.errors.length) window.alert(_t('{msg}\n\n{n} mục không qua cổng kiểm:\n{map}', { msg: msg, n: r.errors.length, map: r.errors.slice(0, 10).map(function (e) { return '• ' + e.kind + ' ' + e.id + ': ' + e.error; }).join('\n') }));
        try { localStorage.setItem('gc-route-thu-vien', JSON.stringify({ page: 'projects', project: r.project })); localStorage.setItem('gc-last-project', r.project); localStorage.setItem('gc-toast', msg); } catch (e) { /* bỏ qua */ }
        if (APP && APP.id === 'thu-vien') location.reload(); else location.href = appURL('thu-vien');
        return r;
      }).catch(function (e) { toast(e.message); });
  }
  function pickBundle() {
    var inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: function () {
      var f = inp.files && inp.files[0]; inp.remove();
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast(_t('Tệp quá lớn (tối đa 8 MB).')); return; }
      f.text().then(function (t) { var b; try { b = JSON.parse(t); } catch (e) { toast(_t('Tệp không phải JSON.')); return; } importBundle(b); });
    } });
    document.body.appendChild(inp); inp.click();
  }
  function importDemo(S) {
    S = S || samplesLeft()[0] || SAMPLES[0];
    toast(_t('Đang dựng {replace}…', { replace: _t(S.short).replace(/^\S+ /, '') }));
    fetch('studio/mau/' + S.file + '.json').then(function (r) { if (!r.ok) throw new Error(_t('Không tải được dự án mẫu')); return r.json(); }).then(function (b) { return importBundle(b); }).catch(function (e) { toast(e.message); });
  }
  function projectBundle(P, sale) {
    var pick = function (list) { return inProject(list, P.id).filter(function (x) { return !sale || GC.statusOf(x.status) === 'published'; }); };
    var b = bundleOf(pick(GC.assets()), pick(GC.items()), pick(GC.scenes()));
    b.motionPacks = GC.choreo ? pick(GC.choreo.packs()).map(function (p) { var o = clone(p); ['pack', 'key', 'version', 'savedAt', 'note'].forEach(function (k) { delete o[k]; }); return o; }) : [];
    b.soundPacks = GC.sounds ? GC.sounds.packs().filter(function (p) { return !p.frame && p.project === P.id && (!sale || p.status === 'published'); }).map(function (p) { return GC.sounds.pack(p.id); }) : [];
    var warnings = sale ? b.items.filter(function (x) { return GC.statusOf(x.status) !== 'published'; }).map(function (x) { return _t('vật phẩm {id} còn nháp nhưng asset phát hành cần nó — phát hành nó trước khi bán', { id: x.id }); }) : [];
    // gói âm mà gói động tác trong gói gọi tên (events[].sfx) đi theo — cùng GC.sounds.bundleDeps với máy chủ; gói bán báo nếu gói âm đó còn nháp (CNS-101)
    if (GC.sounds) {
      var have = {}; b.soundPacks.forEach(function (x) { have[x.id] = 1; });
      GC.sounds.bundleDeps({ motionPacks: b.motionPacks }).packs.forEach(function (id) {
        var x = have[id] ? null : GC.sounds.pack(id); if (!x) return;
        b.soundPacks.push(x);
        if (sale && x.status !== 'published') warnings.push(_t('gói âm {id} còn nháp nhưng gói động tác phát hành cần nó — phát hành nó trước khi bán', { id: id }));
      });
    }
    return Object.assign({ format: 'gen-chibi.project/1', kind: sale ? 'sale' : 'backup', license: _t('© 2026 Gen Labs — engine; asset thuộc người tạo'), project: { id: P.id, name: P.name, description: P.description || '' }, warnings: warnings },
      b, { exportedAt: new Date().toISOString() });
  }
  function LIB_SLOTS() { return Object.keys(LIB.slots); }

  /* ============================================================ XƯỞNG › Tạo asset mới (chọn khung → tham số → soát → cổng & lưu) */
  // Quy trình đúng docs/QUY-CACH-KHUNG.md mục 5. Khung không bị sửa: bản nháp là một bản sao của khung + tham số của người tạo.
  var NEW_PAL_CHAR = [['skin', N_('Da')], ['robe', N_('Áo')], ['trim', N_('Viền')], ['hat', N_('Mũ')], ['accent', N_('Điểm nhấn')], ['metal', N_('Kim loại')], ['wood', N_('Gỗ')], ['cape', N_('Áo choàng')], ['boots', N_('Giày')], ['pants', N_('Quần')], ['hair', N_('Tóc / mày')], ['iris', N_('Mắt')]];
  var REVIEW_ACTS = [['normal', '', N_('Đứng')], ['vow', 'run', N_('Chạy')], ['angry', 'attack', N_('Tấn công')], ['normal', 'sit-floor', N_('Ngồi')]];
  PAGES.create = function (r) {
    crumbs([{ t: _t('Tạo asset mới') }]);
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
    // id mặc định sinh từ TÊN ĐÃ DỊCH (CNS-155): en new-character · new-item · new-scene · new-asset; vi giữ nhan-vat-moi · vu-khi-dai-moi · canh-moi · asset-moi
    function uniq(base, map) { var b = base || slugify(_t('Asset mới')) || 'asset', id = b, n = 2; while (map[MY_PACK + '/' + id]) id = b + '-' + n++; return id; }
    function start(kind, fr) {
      u.kind = kind; u.frame = fr; u.saved = null;
      var d = clone(fr);
      delete d.key; delete d.savedAt; delete d.note;
      d.pack = MY_PACK; d.status = 'draft'; d.version = 0; d.project = u.project;
      // chữ HỆ THỐNG điền sẵn vào ô nhập (tên, mô tả chép từ khung) phải theo ngôn ngữ giao diện — điền rồi là nội dung người dùng, không dịch được nữa (INT-18c)
      if (typeof d.description === 'string') d.description = _l(d.description);
      if (kind === 'character') {
        d.name = _t('Nhân vật mới'); d.id = uniq(slugify(d.name), GC.ASSETS); d.code = nextCode(); d.faction = ''; d.role = ''; d.han = ''; d.persona = '';
        d.expressions = {}; d.lines = {}; d.identity = { p1: '', must: [], source: '' }; d.look.palette = clone(d.look.palette || {});
      } else if (kind === 'item') {
        // tiếng Việt: "<tên khung bỏ chữ Khung> mới" như trước; tên khung không có bản dịch đứng riêng (và bản dịch phải giữ đủ {replace}) → ngôn ngữ khác dùng câu chung
        d.name = I18N.lang() === I18N.SOURCE ? _t('{replace} mới', { replace: fr.name.replace(/^Khung /, '') }) : _t('Vật phẩm mới');
        d.id = uniq(slugify(d.name), GC.ITEMS); d.equip.palette = d.equip.palette || {}; d.equip.params = d.equip.params || {}; d.stats = d.stats || {};
      } else {
        d.name = _t('Cảnh mới'); d.id = uniq(slugify(d.name), GC.SCENES); d.palette = d.palette || {};
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
      [[_t('Chọn khung'), !!u.d], [_t('Tham số & chi tiết'), !!u.d], [_t('Soát mọi góc'), !!u.d], [_t('Cổng kiểm & lưu'), !!u.saved]].forEach(function (s, i) {
        steps.appendChild(h('li', { class: s[1] ? 'done' : '' }, h('b', { text: String(i + 1) }), s[0]));
      });
    }
    function paint() {
      paintSteps(); clear(left); clear(right);
      // ① chọn khung
      var kseg = h('div', { class: 'seg' });
      [['character', _pt('số ít', 'Nhân vật')], ['item', _pt('số ít', 'Vật phẩm')], ['scene', _pt('số ít', 'Bối cảnh')]].forEach(function (k) {
        kseg.appendChild(h('button', { 'aria-pressed': String(u.kind === k[0]), onclick: function () { u.kind = k[0]; u.d = null; u.frame = null; paint(); } }, k[1]));
      });
      var fgrid = h('div', { class: 'libgrid sm' });
      frames(u.kind).forEach(function (fr) {
        fgrid.appendChild(h('button', { class: 'libcard', 'aria-pressed': String(!!u.frame && u.frame.key === fr.key), title: fr.key, onclick: function () { start(u.kind, fr); } },
          h('div', { class: 'im' }, h('img', { src: thumbOf(fr), alt: _l(fr.name), loading: 'lazy' })), h('div', { class: 'lb' }, h('b', { text: _l(fr.name) }))));
      });
      left.appendChild(h('div', { class: 'panel' }, stepHead('1', _t('Chọn khung'), _t('khung do Gen Labs giữ — bản của bạn là bản sao')),
        h('div', { class: 'pad stack' }, h('div', { class: 'row' }, kseg, field(_t('Lưu vào dự án'), projectSelect(u.project, function (v) { u.project = v; if (u.d) u.d.project = v; }))), fgrid)));
      if (!u.d) { right.appendChild(h('div', { class: 'panel pad note', text: _t('Chọn một khung bên trái để bắt đầu. Nhân vật dựng từ ma-nơ-canh; vật phẩm từ khối đại diện theo dáng; bối cảnh từ sân khấu chuẩn.') })); return; }
      // ② tham số & chi tiết
      var d = u.d, f = h('div', { class: 'pad stack' });
      var nm = h('input', { type: 'text', value: d.name, maxlength: 40, oninput: function () { d.name = nm.value; if (!u.idTouched) { var map = u.kind === 'character' ? GC.ASSETS : u.kind === 'item' ? GC.ITEMS : GC.SCENES; d.id = uniq(slugify(nm.value), map); idI.value = d.id; } changed(); } });
      var idI = h('input', { type: 'text', value: d.id, maxlength: 64, class: 'mono', oninput: function () { u.idTouched = true; d.id = idI.value.trim(); changed(); } });
      f.appendChild(h('div', { class: 'row' }, field(_t('Tên'), nm), field(_t('Mã (id)'), idI)));
      if (u.kind === 'character') charParams(d, f); else if (u.kind === 'item') itemParams(d, f); else sceneParams(d, f);
      left.appendChild(h('div', { class: 'panel' }, stepHead('2', _t('Tham số & chi tiết')), f));
      review();
    }
    function colors(list, cur, defs, set) {
      var g = h('div', { class: 'palgrid' });
      list.forEach(function (k) {
        var c = h('input', { type: 'color', value: cur[k[0]] || defs[k[0]], 'aria-label': _t(k[1]), oninput: function () { set(k[0], c.value); changed(); } });
        g.appendChild(h('label', { class: 'pal' }, c, h('span', { text: _t(k[1]) })));
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
      Object.keys(LIB.eyeStyles).forEach(function (k) { es.appendChild(h('option', { value: k, text: _l(LIB.eyeStyles[k].label) || k })); });
      Object.keys(LIB.browStyles).forEach(function (k) { bs.appendChild(h('option', { value: k, text: _l(LIB.browStyles[k].label) || k })); });
      es.value = d.look.eyes; bs.value = d.look.brows;
      f.appendChild(h('div', { class: 'row' }, field(_t('Mắt'), es), field(_t('Mày'), bs)));
      var t = h('div', { class: 'slotgrid' }), prm = h('div', { class: 'stack' });
      d.look.params = d.look.params || {};
      function paintParams() {
        clear(prm);
        LIB_SLOTS().forEach(function (slot) {
          var p = GC.getPart(slot, GC.partRef(d, slot), d.pack);
          if (!p || !p.params) return;
          Object.keys(p.params).forEach(function (k) {
            var cur = ((d.look.params[slot] || {})[k]);
            prm.appendChild(slider({ label: _l(LIB.slots[slot].label) + ' · ' + _lo(p, p.params[k].label), min: p.params[k].min, max: p.params[k].max, step: p.params[k].step }, cur == null ? p.params[k].def : cur,
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
          } }, _l(LIB.slots[slot].label) + ': ' + _lo(p, p.label)));
        });
        if (!idBox.children.length) idBox.appendChild(h('span', { class: 'note', text: _t('Chọn linh kiện riêng (không phải khung trần) để đánh dấu nhận diện.') }));
      }
      LIB_SLOTS().forEach(function (slot) {
        var s = h('select', { onchange: function () { d.look.parts[slot] = s.value; paintParams(); paintId(); changed(); } });
        GC.partsOfSlot(slot).forEach(function (p) { s.appendChild(h('option', { value: p.pack + '/' + p.id, text: _lo(p, p.label) + (p.pack === MY_PACK ? _t(' · của tôi') : '') })); });
        var cur = GC.getPart(slot, GC.partRef(d, slot), d.pack);
        if (cur) s.value = cur.pack + '/' + cur.id;
        t.appendChild(field(_l(LIB.slots[slot].label), s));
      });
      paintParams(); paintId();
      f.appendChild(h('b', { text: _t('Linh kiện (khối khung hoặc linh kiện tự vẽ)') })); f.appendChild(t); f.appendChild(prm);
      f.appendChild(h('b', { text: _t('Dấu nhận diện (bấm để chọn)') })); f.appendChild(idBox);
      f.appendChild(h('b', { text: _t('Bảng màu') }));
      f.appendChild(colors(NEW_PAL_CHAR, d.look.palette, LIB.defaults, function (k, v) { d.look.palette[k] = v; }));
      var per = h('textarea', { rows: 2, maxlength: 300, placeholder: _t('Tính cách / vai (AI đạo diễn đọc mục này)'), oninput: function () { d.persona = per.value; } });
      per.value = d.persona || '';
      f.appendChild(field(_t('Tính cách'), per));
    }
    function itemParams(d, f) {
      var p = GC.getPart(d.equip.slot, d.equip.part);
      var ty = h('select', { onchange: function () { d.type = ty.value; changed(); } }), ra = h('select', { onchange: function () { d.rarity = ra.value; changed(); } });
      Object.keys(I.types).filter(function (k) { return I.types[k].slots.indexOf(d.equip.slot) >= 0; }).forEach(function (k) { ty.appendChild(h('option', { value: k, text: _l(I.types[k].label) })); });
      I.rarityOrder.forEach(function (k) { ra.appendChild(h('option', { value: k, text: _l(I.rarity[k].label) })); });
      ty.value = d.type; ra.value = d.rarity;
      f.appendChild(h('div', { class: 'row' }, field(_t('Loại'), ty), field(_t('Độ hiếm'), ra)));
      if (p && p.params) Object.keys(p.params).forEach(function (k) {
        f.appendChild(slider(Object.assign({}, p.params[k], { label: _lo(p, p.params[k].label) }), d.equip.params[k] == null ? p.params[k].def : d.equip.params[k], function (v) { d.equip.params[k] = v; }));
      });
      f.appendChild(h('b', { text: _t('Màu') }));
      f.appendChild(colors([['metal', _t('Kim loại')], ['wood', _t('Gỗ')], ['accent', _t('Điểm nhấn')], ['hat', _t('Mũ')], ['robe', _t('Áo')], ['trim', _t('Viền')], ['cape', _t('Choàng')], ['boots', _t('Giày')]], d.equip.palette, LIB.defaults, function (k, v) { d.equip.palette[k] = v; }));
      var st = h('div', { class: 'row' });
      Object.keys(I.stats).forEach(function (k) {
        var n = h('input', { type: 'number', min: 0, max: 999, value: d.stats[k] || '', style: 'width:64px', oninput: function () { if (n.value === '') delete d.stats[k]; else d.stats[k] = Math.max(0, Math.min(999, Math.round(+n.value))); changed(); } });
        st.appendChild(field(_l(I.stats[k]), n));
      });
      f.appendChild(h('b', { text: _t('Chỉ số') })); f.appendChild(st);
      var ds = h('input', { type: 'text', maxlength: 200, value: d.description || '', style: 'width:100%', oninput: function () { d.description = ds.value; changed(); } });
      f.appendChild(field(_t('Mô tả'), ds));
    }
    function sceneParams(d, f) {
      var t = h('div', { class: 'slotgrid' });
      S.layerOrder.forEach(function (slot) {
        var s = h('select', { onchange: function () { if (s.value) d.layers[slot] = { part: s.value }; else delete d.layers[slot]; changed(); } });
        if (!S.slots[slot].required) s.appendChild(h('option', { value: '', text: _t('— không —') }));
        GC.scenery(slot).forEach(function (p) { s.appendChild(h('option', { value: p.pack + '/' + p.id, text: _lo(p, p.label) + (p.pack === MY_PACK ? _t(' · của tôi') : '') })); });
        s.value = d.layers[slot] ? d.layers[slot].part : '';
        t.appendChild(field(_l(S.slots[slot].label), s));
      });
      f.appendChild(h('b', { text: _t('Lớp phông') })); f.appendChild(t);
      var tm = h('select', { onchange: function () { d.time = tm.value; changed(); } }), we = h('select', { onchange: function () { d.weather = we.value; changed(); } });
      S.timeOrder.forEach(function (k) { tm.appendChild(h('option', { value: k, text: _l(S.times[k].label) })); });
      S.weatherOrder.forEach(function (k) { we.appendChild(h('option', { value: k, text: _l(S.weathers[k].label) })); });
      tm.value = d.time; we.value = d.weather;
      f.appendChild(h('div', { class: 'row' }, field(_t('Giờ'), tm), field(_t('Thời tiết'), we)));
      f.appendChild(h('b', { text: _t('Bảng màu cảnh') }));
      f.appendChild(colors(Object.keys(S.defaults).map(function (k) { return [k, k]; }), d.palette, S.defaults, function (k, v) { d.palette[k] = v; }));
      var ds = h('input', { type: 'text', maxlength: 300, value: d.description || '', style: 'width:100%', oninput: function () { d.description = ds.value; } });
      f.appendChild(field(_t('Mô tả'), ds));
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
        DIR8.forEach(function (v) { row8.appendChild(h('figure', null, h('img', { src: R.imageURL(preview, 'normal', { director: { view: v } }), alt: viewLabel(v) }), h('figcaption', { class: 'note', text: viewLabel(v) }))); });
        var rowA = h('div', { class: 'revgrid' });
        REVIEW_ACTS.forEach(function (a) { var dd = { view: 'left45' }; if (a[1]) dd.activity = a[1]; rowA.appendChild(h('figure', null, h('img', { src: R.imageURL(preview, a[0], { director: dd }), alt: _t(a[2]) }), h('figcaption', { class: 'note', text: _t(a[2]) }))); });
        box.appendChild(h('b', { text: _t('8 hướng') })); box.appendChild(row8); box.appendChild(h('b', { text: _t('Hoạt động (45°)') })); box.appendChild(rowA);
      } else if (u.kind === 'item') {
        var c = GC.checkItem(d); errs = c.errors;
        if (!errs.length) {
          var it = Object.assign({ key: 'draft/' + c.def.id, pack: 'draft' }, c.def);
          gates = GC.itemGate(it);
          var tmp = GC.registerItem('draft.tmp', c.def).def, base = GC.ASSETS['gen.khung/ma-no-canh'], a = clone(base), rowE = h('div', { class: 'revgrid' });
          a.key = 'draft/eq-' + JSON.stringify(c.def).length + '-' + c.def.id; a.look.equip = {}; a.look.equip[c.def.equip.slot] = tmp.key;
          ['front', 'left45', 'left90', 'back'].forEach(function (v) { rowE.appendChild(h('figure', null, h('img', { src: svgURL(GC.svgString(a, 'normal', { director: { view: v } })), alt: viewLabel(v) }), h('figcaption', { class: 'note', text: viewLabel(v) }))); });
          delete GC.ITEMS[tmp.key]; GC.ITEM_ORDER.splice(GC.ITEM_ORDER.indexOf(tmp.key), 1);
          box.appendChild(h('div', { class: 'row', style: 'align-items:flex-start' }, h('img', { src: svgURL(GC.itemSvg(it, { size: 120 })), alt: 'icon', style: 'width:110px' }), h('img', { src: svgURL(GC.itemSvg(it, { mode: 'card' })), alt: _t('thẻ'), style: 'width:130px' })));
          box.appendChild(h('b', { text: _t('Mặc lên ma-nơ-canh') })); box.appendChild(rowE);
        }
      } else {
        var cs = GC.checkScene(d); errs = cs.errors;
        if (!errs.length) {
          var sc = Object.assign({ key: 'draft/' + cs.def.id }, cs.def);
          gates = GC.sceneGate(sc);
          var m = GC.ASSETS['gen.khung/ma-no-canh'];
          [['', _t('Như đã chọn'), []], ['night', _t('Đêm'), []], ['', _t('Có diễn viên'), [{ character: m.key, spot: 'left' }, { character: m.key, spot: 'right' }]]].forEach(function (x) {
            var o = { cast: x[2] }; if (x[0]) o.time = x[0];
            box.appendChild(h('figure', { style: 'margin:0' }, h('img', { src: svgURL(GC.sceneSvg(sc, o)), alt: x[1], style: 'width:100%;display:block;border-radius:4px' }), h('figcaption', { class: 'note', text: x[1] })));
          });
        }
      }
      right.appendChild(h('div', { class: 'panel' }, stepHead('3', _t('Soát mọi góc')), errs.length ? h('div', { class: 'pad note', text: _t('Sửa lỗi dữ liệu ở bước 4 để xem.') }) : box));
      // ④
      var blocking = errs.length ? errs.map(function (e) { return { label: e }; }) : (u.kind === 'character' ? GC.blockingGates(gates, 'draft') : gates.filter(function (g) { return !g.ok && !g.info; }));
      if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(d.id)) blocking = blocking.concat({ label: _t('Mã (id): chữ thường, số, gạch nối') });
      var gl = h('ul', { class: 'gates' });
      (errs.length ? errs.map(function (e) { return { ok: false, label: e }; }) : gates).forEach(function (g) {
        var soft = !g.ok && blocking.indexOf(g) < 0 && !errs.length;   // không chặn bản nháp (vd. dấu nhận diện) — cần khi chuyển duyệt
        gl.appendChild(h('li', { class: g.ok ? (g.info ? 'info' : 'ok') : soft ? 'warn' : 'bad' }, h('b', { text: g.ok ? (g.info ? 'ℹ' : '✓') : soft ? '⚠' : '✗' }), ' ' + gL(g),
          g.detail ? h('span', { class: 'note', text: ' — ' + gD(g) }) : null, soft ? h('span', { class: 'note', text: _t(' (cần khi chuyển duyệt, nháp vẫn lưu được)') }) : null));
      });
      var saveB = h('button', { class: 'btn primary', disabled: blocking.length ? '' : null, onclick: function () { save(saveB); } }, _t('Lưu vào Thư viện · {name}', { name: Projects.name(u.project) }));
      var after = h('div', { class: 'row' });
      if (u.saved) {
        var sv = u.saved, page = u.kind === 'character' ? 'lib-characters' : u.kind === 'item' ? 'lib-items' : 'lib-scenes', fab = u.kind === 'character' ? 'character' : u.kind === 'item' ? 'items' : 'scenes';
        after.appendChild(h('span', { class: 'note', text: _t('Đã lưu {key} (bản {version}). Tiếp theo:', { key: sv.key, version: sv.version }) }));
        after.appendChild(h('button', { class: 'btn sm primary', title: _t('Tạo asset mới từ cùng khung, cùng dự án'), onclick: function () { start(u.kind, u.frame); } }, _t('+ Tạo tiếp')));
        after.appendChild(h('button', { class: 'btn sm', onclick: function () { go({ page: page, key: sv.key }); } }, _t('Xem trong Thư viện ›')));
        after.appendChild(h('button', { class: 'btn sm', onclick: function () { go({ page: 'works', project: u.project }); } }, _t('Làm phim với dự án này ›')));
        after.appendChild(h('button', { class: 'btn sm', onclick: function () { go(fab === 'character' ? { page: 'character', key: sv.key, tab: 'look' } : { page: fab, key: sv.key }); } }, _t('Chỉnh sâu ở bàn chỉnh ›')));
      }
      right.appendChild(h('div', { class: 'panel' }, stepHead('4', _t('Cổng kiểm & lưu'), blocking.length ? _t('{n} mục chặn', { n: blocking.length }) : _t('đạt')), h('div', { class: 'pad stack' }, gl, h('div', { class: 'row' }, saveB), after)));
    }
    function save(btn) {
      var d = clone(u.d), note = _t('Tạo từ khung {key}', { key: u.frame.key });
      d.project = u.project; btn.disabled = true;
      var p;
      if (u.kind === 'character') p = Store.save(d, note);
      else if (Store.mode !== 'server') p = Promise.reject(new Error(_t('Lưu vật phẩm / bối cảnh cần chạy bản cài (server).')));
      else if (u.kind === 'item') p = Store.api('POST', 'api/items', { item: d, note: note }).then(function (rec) { return GC.registerItem(MY_PACK, rec).def; });
      else p = Store.api('POST', 'api/scenes', { scene: d, note: note }).then(function (rec) { return GC.registerScene(MY_PACK, rec).def; });
      p.then(function (rec) { u.saved = rec; u.d.version = rec.version; setLastProject(u.project); toast(_t('Đã lưu {name} vào dự án {name2}', { name: rec.name, name2: Projects.name(u.project) })); renderNav(); paintSteps(); review(); })
        .catch(function (e) { toast(e.message); btn.disabled = false; });
    }
    // vào thẳng một khung (từ trang Bộ khung chuẩn: ?kind=…&frame=…)
    var fr0 = r.frame && frames(u.kind).filter(function (x) { return x.key === r.frame; })[0];
    if (fr0) start(u.kind, fr0); else paint();
  };

  /* ============================================================ XƯỞNG › Bộ khung chuẩn (quy cách vẽ thành hình) */
  // Không chủ đề: ma-nơ-canh đầu trọc, khối vật phẩm, khối bối cảnh. Mọi asset tạo ra phải khớp quy cách này (docs/QUY-CACH-KHUNG.md).
  PAGES.khung = function () {
    crumbs([{ t: _t('Bộ khung chuẩn') }]);
    actions(h('span', { class: 'note', text: _t('Khung do Gen Labs giữ. Asset mới = bản sao của khung + tham số của bạn.') }), h('button', { class: 'btn primary', onclick: function () { go({ page: 'create' }); } }, _t('+ Tạo asset mới từ khung ›')));
    var m = GC.ASSETS['gen.khung/ma-no-canh'] || GC.assets()[0];
    var S = GC.SCENE;
    function cellImg(url, w, label) { return h('figure', { style: 'margin:0;display:grid;justify-items:center;gap:2px;width:' + w + 'px' }, h('img', { src: url, alt: label, style: 'width:100%;display:block' }), h('figcaption', { class: 'note', style: 'text-align:center', text: label })); }
    var views = h('div', { class: 'row', style: 'align-items:flex-end' });
    VIEWS_ALL.forEach(function (v) {
      views.appendChild(cellImg(R.imageURL(m, 'normal', { director: { view: v[0] } }), 96, _t(v[1])));
    });
    var acts = h('div', { class: 'row', style: 'align-items:flex-end' });
    LIB.activityOrder.forEach(function (a) {
      var A = LIB.activities[a];
      acts.appendChild(cellImg(R.imageURL(m, A.state || 'normal', { director: { activity: a, view: 'left45' } }), 84, _l(A.label)));
    });
    var items = h('div', { class: 'libgrid' });
    GC.items().filter(function (it) { return it.pack === 'gen.khung'; }).forEach(function (it) {
      var a = clone(m); a.key = 'khung/' + it.id; a.look.equip = {}; a.look.equip[it.equip.slot] = it.key;
      items.appendChild(h('div', { class: 'libcard' }, h('div', { class: 'im', style: 'display:flex;gap:4px;padding:4px' },
        h('img', { src: R.imageURL(a, 'normal', { director: { view: 'left45' } }), alt: _l(it.name), style: 'width:60%' }),
        h('img', { src: svgURL(GC.itemSvg(it, { size: 80 })), alt: '', style: 'width:38%;align-self:center' })),
        h('div', { class: 'lb' }, h('b', { text: _l(it.name) }), h('span', { class: 'note', text: _l((GC.getPart(it.equip.slot, it.equip.part) || {}).label || '') }))));
    });
    var scenes = h('div', { class: 'stack' });
    GC.scenes().filter(function (sc) { return sc.pack === 'gen.khung'; }).forEach(function (sc) {
      scenes.appendChild(cellImg(svgURL(GC.sceneSvg(sc, { cast: S.spotOrder.map(function (sp) { return { asset: m, spot: sp }; }) })), 640, _t('{name} — ma-nơ-canh ở đủ {n} chỗ đứng', { name: _l(sc.name), n: S.spotOrder.length })));
    });
    var blocks = h('div', { class: 'row' });
    GC.scenery('deco').filter(function (p) { return p.pack === 'gen.khung'; }).forEach(function (p) {
      var sc = { key: 'khung/deco-' + p.id, id: 'q', layers: { sky: { part: 'gen.khung/khung-troi', dx: 0 }, ground: { part: 'gen.khung/khung-nen', dx: 0 } }, palette: (GC.getScene('gen.khung/san-khau-chuan') || {}).palette || {},
        deco: [{ part: 'gen.khung/' + p.id, x: 320, y: 320, scale: 1.4, flip: false, z: 'back' }], time: 'day', weather: 'clear', spots: S.spotOrder.slice() };
      blocks.appendChild(cellImg(svgURL(GC.sceneSvg(sc, { size: 200 })), 150, _l(p.label)));
    });
    var spec = h('table', { class: 'grid' });
    [[_t('Khung nhân vật'), _t('200 × 240; chân chạm đất (100, 228); 18 khớp; 11 bộ phận; 8 hướng nhìn (2.5D); {n} biểu cảm; {n2} hoạt động', { n: LIB.stateOrder.length, n2: LIB.activityOrder.length })],
     [_t('Điểm gắn tay'), _t('lòng bàn tay phải (128, 193) · trái (72, 193)')],
     [_t('Khung vật phẩm'), _t('10 khối theo dáng — mỗi khối là gốc cho một họ vật phẩm, có tham số (độ dài, cỡ, độ cao, độ rộng)')],
     [_t('Khung bối cảnh'), _t('{W} × {H}; 6 lớp; chân trời y ≈ 230–260; nền từ y 258; hàng trước y 330 (cỡ 0.8) · hàng sau y 280 (cỡ 0.62)', { W: S.W, H: S.H })],
     [_t('Giờ · thời tiết'), _t('{n} giờ · {n2} thời tiết — chỉ đổi token màu, không vẽ lại', { n: S.timeOrder.length, n2: S.weatherOrder.length })],
     [_t('Ngân sách'), _t('diễn viên ≤ {cast} · đạo cụ ≤ {deco} · hạt thời tiết ≤ {particles}', { cast: S.budget.cast, deco: S.budget.deco, particles: S.budget.particles })],
     [_t('Màu'), _t('chỉ dùng token; khung dùng bảng màu xám trung tính — asset chủ đề đổi token để "thay áo"')],
     [_t('Quy trình tạo asset'), _t('chọn khung → thêm tham số / chi tiết → soát → qua cổng kiểm → lưu Thư viện theo dự án chủ đề')]].forEach(function (r) {
      spec.appendChild(h('tr', null, h('td', { class: 'k nw', text: r[0] }), h('td', { text: r[1] })));
    });
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'banner' }, h('span', { text: _t('Khung chuẩn không có chủ đề. Mọi asset (của Gen Labs, người dùng hay AI) tạo ra từ khung này và phải khớp quy cách. Chi tiết: docs/QUY-CACH-KHUNG.md') })),
      h('div', anc({ class: 'panel' }, 'panel:khung-quy-cach', _t('Quy cách khung')), h('h3', null, _t('Quy cách')), spec),
      h('div', anc({ class: 'panel' }, 'asset:' + m.key, _t('Khung nhân vật — ma-nơ-canh')), h('h3', null, _t('Khung nhân vật — ma-nơ-canh'), h('span', { class: 'r mono', text: m.key })), h('div', { class: 'pad stack' }, views, acts)),
      h('div', anc({ class: 'panel' }, 'panel:khung-vat-pham', _t('Khung vật phẩm')), h('h3', null, _t('Khung vật phẩm — khối theo dáng'), h('span', { class: 'r note', text: _t('mặc lên ma-nơ-canh (45°) + icon') })), h('div', { class: 'pad' }, items)),
      h('div', anc({ class: 'panel' }, 'panel:khung-boi-canh', _t('Khung bối cảnh')), h('h3', null, _t('Khung bối cảnh'), h('span', { class: 'r note', text: _t('nền có lưới tỉ lệ; vạch đứt = hàng sau / hàng trước') })), h('div', { class: 'pad stack' }, scenes, blocks))));
  };

  /* ============================================================ XƯỞNG › Bàn phối cảnh (loại asset thứ ba) */
  // Cảnh = phối phông có sẵn theo lớp + đạo cụ + bảng màu + giờ + thời tiết. Lưu qua cùng cổng ghi với MCP (POST /api/scenes → saveSceneChecked).
  PAGES.scenes = function (r) {
    var S = GC.SCENE;
    crumbs([{ t: _t('Bàn chỉnh bối cảnh') }]);
    var base = GC.getScene(r.key) || GC.scenes()[0];
    var w, mine;
    function load(sc) {
      mine = sc.pack === MY_PACK;
      w = clone({ id: mine ? sc.id : uniqueScene(sc.id + '-cua-toi'), name: mine ? sc.name : _t('{name} (bản của tôi)', { name: sc.name }), han: sc.han, description: sc.description,
        layers: sc.layers, deco: sc.deco, palette: sc.palette, time: sc.time, weather: sc.weather, spots: sc.spots });
    }
    function uniqueScene(id) { var x = id, n = 2; while (GC.SCENES[MY_PACK + '/' + x]) x = id + '-' + n++; return x; }
    load(base);
    var saveBtn = h('button', { class: 'btn primary', onclick: save }, _t('Lưu cảnh'));
    actions(h('button', { class: 'btn', onclick: function () { go({ page: 'lib-scenes', key: base.key }); } }, _t('Xem trong Thư viện ›')),
      h('button', { class: 'btn', onclick: function () { go({ page: 'create', kind: 'scene' }); } }, _t('+ Bối cảnh mới')),
      saveBtn);
    var left = h('div', { class: 'stack' }), right = h('div', { class: 'stack' });
    dockObj('asset', base.key, _lo(base, base.name));
    $('view').appendChild(h('div', anc({ class: 'detail scenefab' }, 'scene:' + base.key, _lo(base, base.name)), left, h('div', { class: 'sticky stack' }, right)));
    var img = h('img', { alt: _t('xem trước cảnh'), style: 'width:100%;display:block;border-radius:6px' });
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
        gateBox.appendChild(h('table', { class: 'grid' }, GC.sceneGate(d).map(function (g) { return h('tr', null, h('td', { text: g.ok ? (g.info ? 'ℹ' : '✓') : '✗' }), h('td', { text: gL(g) }), h('td', { class: 'note', text: gD(g) })); })));
      }, 60);
    }
    function sceneryOpts(slot, cur, optional) {
      var sel = h('select', { 'aria-label': _l(S.slots[slot].label) });
      if (optional) sel.appendChild(h('option', { value: '', text: _t('— không —') }));
      GC.scenery(slot).forEach(function (p) { var ref = p.pack + '/' + p.id; sel.appendChild(h('option', { value: ref, text: _lo(p, p.label) + (p.pack !== 'gen.khung' ? ' · ' + p.pack : ''), selected: ref === cur })); });
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
      lt.appendChild(h('tr', null, [_t('Lớp'), _t('Phông'), _t('Dịch ngang'), _t('Lật')].map(function (c) { return h('th', { text: c }); })));
      S.layerOrder.forEach(function (slot) {
        var L = w.layers[slot] || null;
        var sel = sceneryOpts(slot, L && L.part, !S.slots[slot].required);
        sel.onchange = function () { if (!sel.value) delete w.layers[slot]; else w.layers[slot] = Object.assign({ dx: 0, flip: false }, w.layers[slot], { part: sel.value }); paintAll(); };
        var flip = h('input', { type: 'checkbox', checked: !!(L && L.flip), disabled: !L, onchange: function () { w.layers[slot].flip = flip.checked; preview(); } });
        lt.appendChild(h('tr', null, h('td', { class: 'k', text: _l(S.slots[slot].label) + (S.slots[slot].required ? ' *' : '') }), h('td', null, sel),
          h('td', null, L ? num(_t('dịch ngang'), L.dx || 0, -320, 320, 10, function (v) { w.layers[slot].dx = v; }) : null), h('td', null, flip)));
      });
      // --- đạo cụ
      var dt = h('table', { class: 'grid' });
      dt.appendChild(h('tr', null, [_t('Đạo cụ'), 'x', 'y', _t('Cỡ'), _t('Lật'), _t('Lớp sâu'), ''].map(function (c) { return h('th', { text: c }); })));
      (w.deco || []).forEach(function (x, i) {
        var sel = sceneryOpts('deco', x.part); sel.onchange = function () { x.part = sel.value; preview(); };
        var z = h('select', { onchange: function () { x.z = z.value; preview(); } });
        [['back', _t('sau diễn viên')], ['mid', _t('giữa hai hàng')], ['front', _t('trước diễn viên')]].forEach(function (o) { z.appendChild(h('option', { value: o[0], text: o[1], selected: (x.z || 'back') === o[0] })); });
        var flip = h('input', { type: 'checkbox', checked: !!x.flip, onchange: function () { x.flip = flip.checked; preview(); } });
        dt.appendChild(h('tr', null, h('td', null, sel), h('td', null, num('x', x.x, 0, 640, 10, function (v) { x.x = v; })), h('td', null, num('y', x.y || 300, 150, 360, 5, function (v) { x.y = v; })),
          h('td', null, num(_t('cỡ'), x.scale || 1, 0.3, 2.5, 0.1, function (v) { x.scale = v; })), h('td', null, flip), h('td', null, z),
          h('td', null, h('button', { class: 'btn sm', onclick: function () { w.deco.splice(i, 1); paintAll(); } }, _pt('xoá', 'Bỏ')))));
      });
      var addDeco = h('button', { class: 'btn sm', disabled: (w.deco || []).length >= S.budget.deco, onclick: function () { w.deco = w.deco || []; w.deco.push({ part: 'gen.khung/khoi-da', x: 320, y: 300, scale: 1, flip: false, z: 'back' }); paintAll(); } }, _t('+ Đạo cụ'));
      // --- màu, giờ, thời tiết, chỗ đứng
      var pal = h('div', { class: 'row' });
      Object.keys(S.defaults).forEach(function (k) {
        var c = h('input', { type: 'color', value: (w.palette || {})[k] || S.defaults[k], title: k, oninput: function () { w.palette = w.palette || {}; w.palette[k] = c.value; preview(); } });
        pal.appendChild(h('label', { class: 'note', style: 'display:flex;gap:4px;align-items:center' }, c, k));
      });
      var tsel = h('select', { onchange: function () { w.time = tsel.value; preview(); } });
      S.timeOrder.forEach(function (t) { tsel.appendChild(h('option', { value: t, text: _l(S.times[t].label), selected: t === w.time })); });
      var wsel = h('select', { onchange: function () { w.weather = wsel.value; preview(); } });
      S.weatherOrder.forEach(function (x) { wsel.appendChild(h('option', { value: x, text: _l(S.weathers[x].label), selected: x === w.weather })); });
      var spots = h('div', { class: 'fxchips' });
      S.spotOrder.forEach(function (k) {
        var b = h('button', { 'aria-pressed': String((w.spots || S.spotOrder).indexOf(k) >= 0), onclick: function () {
          var cur = (w.spots || S.spotOrder).slice(), i = cur.indexOf(k);
          if (i >= 0) { if (cur.length > 1) cur.splice(i, 1); } else cur.push(k);
          w.spots = cur; b.setAttribute('aria-pressed', String(cur.indexOf(k) >= 0)); preview();
        } }, _l(S.spots[k].label));
        spots.appendChild(b);
      });
      var nameI = h('input', { type: 'text', value: w.name, maxlength: 40, oninput: function () { w.name = nameI.value; } });
      var idI = h('input', { type: 'text', value: w.id, maxlength: 64, class: 'mono', oninput: function () { w.id = idI.value.trim(); preview(); } });
      var hanI = h('input', { type: 'text', value: w.han || '', maxlength: 12, oninput: function () { w.han = hanI.value; } });
      var descI = h('input', { type: 'text', value: w.description || '', maxlength: 300, style: 'width:100%', oninput: function () { w.description = descI.value; } });
      var kv = h('div', { class: 'kv' });
      [[_t('Tên'), nameI], [_t('Mã (id)'), idI], [_t('Hán tự'), hanI], [_t('Mô tả'), descI], [_t('Giờ'), tsel], [_t('Thời tiết'), wsel], [_t('Chỗ đứng dùng được'), spots]].forEach(function (x) { kv.appendChild(h('label', { text: x[0] })); kv.appendChild(x[1]); });
      left.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Thông tin'), h('span', { class: 'r note', text: mine ? _t('cảnh của tôi') : _t('từ cảnh chính thức — lưu sẽ thành bản riêng trong "Của tôi"') })), h('div', { class: 'pad' }, kv)));
      left.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Lớp phông'), h('span', { class: 'r note', text: _t('trời → cảnh xa → công trình → mặt đất → (diễn viên) → tiền cảnh') })), lt));
      left.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Đạo cụ cảnh'), h('span', { class: 'r' }, h('span', { class: 'note', text: _t('{n}/{deco} (ngân sách) ', { n: (w.deco || []).length, deco: S.budget.deco }) }), addDeco)), dt));
      left.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Bảng màu cảnh'), h('span', { class: 'r note', text: _t('token dùng chung mọi phông · giờ đêm/hoàng hôn tự phủ thêm') })), h('div', { class: 'pad' }, pal)));
      // --- bên phải: xem trước + dàn diễn viên thử + cổng kiểm
      var castT = h('table', { class: 'grid' });
      castT.appendChild(h('tr', null, [_t('Diễn viên thử'), _t('Chỗ đứng'), _t('Hoạt động')].map(function (c) { return h('th', { text: c }); })));
      castRows.forEach(function (x) {
        var a = h('select', { onchange: function () { x.id = a.value; preview(); } });
        a.appendChild(h('option', { value: '', text: _t('— trống —') }));
        GC.assets().forEach(function (as) { a.appendChild(h('option', { value: as.id, text: _lo(as, as.name), selected: as.id === x.id })); });
        var sp = h('select', { onchange: function () { x.spot = sp.value; preview(); } });
        S.spotOrder.forEach(function (k) { sp.appendChild(h('option', { value: k, text: _l(S.spots[k].label), selected: k === x.spot })); });
        var ac = h('select', { onchange: function () { x.activity = ac.value; preview(); } });
        ac.appendChild(h('option', { value: '', text: _t('— đứng —') }));
        LIB.activityOrder.forEach(function (k) { ac.appendChild(h('option', { value: k, text: _l(LIB.activities[k].label), selected: k === x.activity })); });
        castT.appendChild(h('tr', null, h('td', null, a), h('td', null, sp), h('td', null, ac)));
      });
      right.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Xem trước'), h('span', { class: 'r mono', text: MY_PACK + '/' + w.id })), h('div', { class: 'pad stack' }, img, errBox, castT,
        h('div', { class: 'note', text: _t('Diễn viên thử chỉ để soát — không lưu vào cảnh. Từ hai diễn viên, ai chưa chọn góc sẽ tự quay 45° về giữa.') }))));
      right.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Cổng kiểm cảnh')), gateBox));
      var pick = h('div', { class: 'libgrid sm' });
      GC.scenes().forEach(function (sc) {
        pick.appendChild(h('button', { class: 'libcard', title: sc.key, onclick: function () { base = sc; load(sc); paintAll(); } },
          h('div', { class: 'im' }, h('img', { src: sceneURL(sc, { size: 200 }), alt: _lo(sc, sc.name), loading: 'lazy' })), h('div', { class: 'lb' }, h('b', { text: _lo(sc, sc.name) }))));
      });
      right.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Mở cảnh để phối'), h('span', { class: 'r note', text: _t('{n} cảnh', { n: GC.scenes().length }) })), h('div', { class: 'pad' }, pick)));
      saveBtn.disabled = Store.mode !== 'server';
      saveBtn.title = Store.mode === 'server' ? '' : _t('Bản xem thử: lưu cảnh cần bản cài trên máy (hoặc agent qua MCP: save_scene).');
      preview();
    }
    function save() {
      var c = draft();
      if (c.errors.length) { toast(c.errors[0]); return; }
      Store.api('POST', 'api/scenes', { scene: w, note: _t('Phối trong Studio') }).then(function (rec) {
        var r1 = GC.registerScene(MY_PACK, rec); base = r1.def || base; load(base); toast(_t('Đã lưu {name} (bản {version})', { name: rec.name, version: rec.version })); paintAll(); renderNav();
      }).catch(function (e) { toast(e.message); });
    }
    paintAll();
  };

  /* ============================================================ trang: Cài đặt AI › Giọng AI (Google Gemini)
   * Dán key là chạy (server kiểm key miễn phí rồi tự bật); có sẵn key Gemini của AI đạo diễn thì dùng được ngay. Trang này CHỈ giữ phần cài đặt: key · bật / tắt · trần câu / ngày ·
   * giọng tạm hỏng · số câu đã dùng hôm nay. Xem / nghe / thiết kế bộ giọng vai (22 vai) nằm ở MỘT nơi: Thư viện › Giọng (CNS-106). Mọi lời gọi qua AiVoice. */
  function voiceSettings() {
    var host = h('div', { class: 'stack', id: 'voice-panel' }), dead = false, msg = null;
    var chipHost = h('span', { class: 'r' }), body = h('div', { class: 'pad kv' });
    host.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Giọng AI (Google Gemini)'), chipHost), body));

    /* ---- panel 1: trạng thái + key ---- */
    function paintState() {
      var c = AiVoice.cfg;
      clear(body); clear(chipHost);
      if (!c) { body.appendChild(h('div', { class: 'note', style: 'grid-column:1/-1', text: _t('Không đọc được trạng thái giọng AI từ máy chủ.') })); return; }
      var on = c.hasKey && !c.off;
      chipHost.appendChild(h('span', { class: on ? 'chip ok' : c.hasKey ? 'chip' : 'chip warn', text: !c.hasKey ? _t('Chưa có key') : c.off ? _t('Đã tắt') : _t('Đã bật') }));
      // trần câu / ngày (Q13): "hôm nay N / trần câu"; chưa có trường (server cũ) thì chỉ đếm
      var cap = typeof c.dailyCap === 'number' ? c.dailyCap : null, today = c.today || 0;
      var todayTxt = cap === null ? _t('hôm nay {today} câu', { today: today }) : cap > 0 ? _t('hôm nay {today} / {cap} câu{x}', { today: today, cap: cap, x: today >= cap ? _t(' (đã chạm trần)') : '' }) : _t('hôm nay {today} câu (không giới hạn)', { today: today });
      var bits = [c.hasKey ? 'key: ' + (c.keySource === 'llm' ? _t('dùng chung key AI đạo diễn') : _t('riêng')) : _t('chưa có key'), todayTxt, _t('{x} câu đã lưu', { x: c.cached || 0 })];
      (c.blocked || []).forEach(function (b) { bits.push(_t('{model} hết lượt tới {clockOf}', { model: b.model, clockOf: clockOf(b.until) })); });
      var keyIn = h('input', { type: 'password', 'aria-label': 'API key Google AI Studio', placeholder: c.hasKey ? _t('Đã có key — dán key mới nếu muốn đổi') : _t('Dán API key Google AI Studio (AIza…)'), style: 'flex:1;min-width:200px', autocomplete: 'off', onkeydown: function (ev) { if (ev.key === 'Enter') connect(); } });
      var conB = h('button', { class: 'btn primary', onclick: connect }, _t('Kết nối'));
      var msgEl = h('div', { class: 'note', role: 'status', 'aria-live': 'polite' });
      function say(ok, text) { msgEl.textContent = text; msgEl.className = 'note ' + (ok ? 'ok' : 'bad'); }
      if (msg) { say(msg.ok, msg.text); msg = null; }
      function connect() {
        var k = keyIn.value.trim();
        if (!k) { keyIn.focus(); say(false, _t('Dán key vào ô trước.')); return; }
        conB.disabled = true; conB.textContent = _t('Đang kiểm tra key…'); say(true, _t('Đang kiểm tra key với Google (miễn phí, không tốn lượt)…'));
        Store.api('PUT', 'api/voice', { apiKey: k }).then(function (r) {
          keyIn.value = ''; AiVoice.set(r);
          msg = { ok: true, text: _t('Đã kết nối — {n} model đọc giọng. Giọng AI đã bật, dùng được ngay.', { n: (r.models || []).length }) };
          if (!dead) paintState();
        }).catch(function (e) { if (dead) return; conB.disabled = false; conB.textContent = _t('Kết nối'); say(false, e.message); keyIn.focus(); });
      }
      var link = c.keyUrl && /^https:\/\//.test(c.keyUrl) ? h('a', { href: c.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, _t('Lấy key miễn phí ở Google AI Studio ›')) : null;
      var tog = h('button', { class: 'btn', disabled: !c.hasKey, title: c.hasKey ? '' : _t('Chưa có key'), onclick: function () {
        tog.disabled = true;
        Store.api('PUT', 'api/voice', { enabled: !!c.off }).then(function (r) { AiVoice.set(r); if (!dead) paintState(); }).catch(function (e) { toast(e.message); tog.disabled = false; });
      } }, c.off ? _t('Bật giọng AI') : _t('Tắt giọng AI'));
      var clr = c.keySource === 'voice' ? h('button', { class: 'btn danger', onclick: function () {
        if (clr.getAttribute('data-confirm') !== '1') { clr.setAttribute('data-confirm', '1'); clr.textContent = _t('Bấm lần nữa để xoá key riêng'); return; }
        Store.api('PUT', 'api/voice', { clearKey: true }).then(function (r) { AiVoice.set(r); toast(_t('Đã xoá key giọng riêng.')); if (!dead) paintState(); }).catch(function (e) { toast(e.message); });
      } }, _t('Xoá key riêng')) : null;
      body.appendChild(h('label', { text: _t('Trạng thái') })); body.appendChild(h('div', { class: 'mono', style: 'font-size:12px', text: bits.join(' · ') }));
      // giọng bị đánh dấu hỏng (lỗi riêng giọng đó): tự gỡ sau 24 giờ; nút này gỡ ngay để thử lại
      var bad = (c.bad || []).filter(function (b) { return b && b.voice; });
      if (bad.length) {
        var badB = h('button', { class: 'btn sm', title: _t('Gỡ dấu "hỏng" của mọi giọng để thử lại ngay (không tốn lượt)'), onclick: function () {
          badB.disabled = true;
          Store.api('PUT', 'api/voice', { clearBad: true }).then(function (r) {
            AiVoice.set(r);   // set() quên mọi giọng đã chọn: Thư viện › Giọng tính lại với đủ giọng
            toast(_t('Đã gỡ dấu giọng hỏng — thử lại ở lần đọc kế tiếp.'));
            if (!dead) paintState();
          }).catch(function (e) { toast(e.message); badB.disabled = false; });
        } }, _t('Thử lại giọng hỏng'));
        body.appendChild(h('label', { text: _t('Giọng hỏng') }));
        body.appendChild(h('div', { class: 'row' }, h('span', { class: 'note warn', title: bad.map(function (b) { return b.voice + (b.until ? _t(' (tới {clockOf})', { clockOf: clockOf(b.until) }) : ''); }).join(', '), text: _t('{n} giọng tạm hỏng (tự thử lại sau 24 h)', { n: bad.length }) }),
          h('span', { class: 'note mono', text: bad.slice(0, 5).map(function (b) { return b.voice; }).join(', ') + (bad.length > 5 ? '…' : '') }), badB));
      }
      body.appendChild(h('label', { text: 'API key Google' }));
      body.appendChild(h('div', { class: 'stack', style: 'gap:6px' },
        c.keySource === 'llm' ? h('div', { class: 'banner acc' }, h('span', { text: _t('Đã dùng được key Gemini của AI đạo diễn — không cần dán thêm. Chỉ dán ở đây nếu muốn dùng một key Google riêng cho giọng.') })) : null,
        h('div', { class: 'row', style: 'flex-wrap:nowrap' }, keyIn, conB), msgEl, link ? h('div', { class: 'note' }, link) : null));
      body.appendChild(h('span')); body.appendChild(h('div', { class: 'row' }, tog, clr));
      // trần câu / ngày: máy chủ chặn đọc MỚI khi đủ trần (Studio, agent MCP đều qua đây) — chặn tiền tiêu quá tay nếu project Google đã bật thanh toán
      if (cap !== null) {
        var capMsg = h('div', { class: 'note', role: 'status', 'aria-live': 'polite' });
        var capIn = h('input', { type: 'number', min: '0', max: '5000', step: '1', value: String(cap), 'aria-label': _t('Trần câu / ngày'), style: 'width:110px', onkeydown: function (ev) { if (ev.key === 'Enter') saveCap(); } });
        var capB = h('button', { class: 'btn', onclick: function () { saveCap(); } }, _t('Lưu trần'));
        var saveCap = function () {
          var raw = capIn.value.trim(), n = Number(raw);
          if (raw === '' || !isFinite(n) || n < 0 || n > 5000 || Math.floor(n) !== n) { capIn.focus(); capMsg.textContent = _t('Nhập số nguyên từ 0 đến 5000 (0 = không giới hạn).'); capMsg.className = 'note bad'; return; }
          capB.disabled = true; capMsg.textContent = ''; capMsg.className = 'note';
          Store.api('PUT', 'api/voice', { dailyCap: n }).then(function (r) {
            AiVoice.set(r); toast(n > 0 ? _t('Đã đặt trần {n} câu / ngày.', { n: n }) : _t('Đã bỏ trần câu / ngày (không giới hạn).'));
            if (!dead) paintState();
          }).catch(function (e) { capB.disabled = false; capMsg.textContent = e.message; capMsg.className = 'note bad'; });
        };
        body.appendChild(h('label', { text: _t('Trần câu / ngày') }));
        body.appendChild(h('div', { class: 'stack', style: 'gap:4px' }, h('div', { class: 'row' }, capIn, h('span', { class: 'note', text: _t('câu mỗi ngày') }), capB),
          h('div', { class: 'note', text: _t('Mặc định 200; 0 = không giới hạn. Đủ trần thì máy chủ chặn đọc mới tới 00:00 hôm sau (Studio và agent đều qua đây); câu đã đọc rồi vẫn phát lại miễn phí. Có ích nhất khi project Google của bạn đã bật thanh toán.') }), capMsg));
      }
      body.appendChild(h('span'));
      body.appendChild(h('div', { class: 'stack note', style: 'gap:4px' },
        h('div', { text: _t('Gói miễn phí của Google rất ít lượt mỗi ngày (cỡ vài chục câu). Câu đã đọc được lưu đệm trên máy — đọc lại không tốn lượt, xuất phim cũng không tốn.') }),
        h('div', { text: _t('Bật thanh toán ở Google AI Studio là quyết định của chủ máy; gen-chibi không tự bật. Hết lượt thì giọng tự rơi về giọng máy đọc của trình duyệt.') })));
      // bộ giọng vai (22 vai × ngôn ngữ / vùng: nghe, thiết kế) chỉ ở Thư viện › Giọng — ở đây chỉ chỉ đường
      body.appendChild(h('label', { text: _t('Bộ giọng vai') }));
      body.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', id: 'voiceToLib', title: _t('Xem, nghe giọng máy / giọng AI và thiết kế giọng cho 22 vai: Thư viện › Giọng'), onclick: function () { go({ page: 'lib-voices' }); } }, _t('Xem bộ giọng vai → Thư viện › Giọng')),
        h('span', { class: 'note', text: _t('nghe và thiết kế giọng theo vai ở đó; trang này chỉ giữ key, bật / tắt, trần câu / ngày') })));
    }

    function refresh() { return AiVoice.load(true).then(function () { if (dead) return; paintState(); }); }
    host.refresh = refresh;
    host.destroy = function () { dead = true; GC.audio.hush(); };
    if (AiVoice.cfg) paintState(); else body.appendChild(h('div', { class: 'note', style: 'grid-column:1/-1', text: _t('Đang đọc trạng thái giọng AI…') }));
    refresh();
    return host;
  }

  /* ============================================================ trang: Cài đặt AI */
  PAGES.ai = function (r) {
    crumbs([{ t: _t('Cài đặt AI') }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel empty', text: _t('Cài đặt AI chỉ có ở bản cài trên máy: API key được mã hoá và giữ trên máy của bạn, không đi qua trình duyệt.') })); return; }
    var box = h('div', { class: 'stack' }), voiceHost = voiceSettings(), focusVoice = r && r.focus === 'voice';
    onLeave(function () { voiceHost.destroy(); });
    if (focusVoice) { delete r.focus; try { localStorage.setItem(routeKey(APP), JSON.stringify(r)); } catch (e) { /* bỏ qua */ } }   // vào từ nút "Dán key ở Cài đặt AI": cuộn tới panel giọng + trỏ vào ô key
    $('view').appendChild(box);
    Store.api('GET', 'api/ai').then(render).catch(function (e) { box.appendChild(h('div', { class: 'panel empty', text: e.message })); });
    function render(cfg) {
      clear(box);
      var P = cfg.providers;
      var prov = h('select', { onchange: function () { base.value = P[prov.value].baseUrl; keyLink(); } });
      Object.keys(P).forEach(function (k) { var o = h('option', { value: k, text: _l(P[k].label) }); if (k === cfg.provider) o.selected = true; prov.appendChild(o); });
      var base = h('input', { type: 'text', value: cfg.baseUrl, style: 'width:100%' });
      var key = h('input', { type: 'password', placeholder: cfg.hasKey ? _t('Đã lưu {keyHint} — để trống nếu không đổi', { keyHint: cfg.keyHint }) : _t('Dán API key'), style: 'width:100%', autocomplete: 'off' });
      var link = h('span', { class: 'note' });
      function keyLink() { clear(link); var u = P[prov.value].keyUrl; if (u) link.appendChild(h('span', null, _t('Lấy key tại '), h('span', { class: 'mono', text: u }))); }
      keyLink();
      var model = h('input', { type: 'text', value: cfg.model, placeholder: _t('vd. deepseek-chat · tên model của nhà cung cấp'), style: 'width:100%' });
      var temp = h('input', { type: 'number', min: '0', max: '1.5', step: '0.1', value: String(cfg.temperature), style: 'width:80px' });
      var saveB = h('button', { class: 'btn primary', onclick: function () {
        Store.api('PUT', 'api/ai', { provider: prov.value, baseUrl: base.value.trim(), apiKey: key.value, model: model.value.trim(), temperature: +temp.value })
          .then(function (c) { toast(_t('Đã lưu cài đặt AI.')); render(c); }).catch(function (e) { toast(e.message); });
      } }, _t('Lưu'));
      var clearB = h('button', { class: 'btn danger', disabled: !cfg.hasKey, onclick: function () {
        if (clearB.getAttribute('data-confirm') !== '1') { clearB.setAttribute('data-confirm', '1'); clearB.textContent = _t('Bấm lần nữa để xoá key'); return; }
        Store.api('PUT', 'api/ai', { provider: prov.value, clearKey: true }).then(function (c) { toast(_t('Đã xoá API key.')); render(c); });
      } }, _t('Xoá key'));
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Nhà cung cấp LLM'), h('span', { class: 'r note', text: _t('API chuẩn OpenAI · key mã hoá trên máy') })),
        h('div', { class: 'pad kv' }, h('label', { text: _t('Nhà cung cấp') }), prov, h('label', { text: _t('Địa chỉ API') }), base,
          h('label', { text: 'API key' }), h('div', { class: 'stack', style: 'gap:4px' }, key, link), h('label', { text: 'Model' }), model,
          h('label', { text: _t('Độ sáng tạo') }), h('div', { class: 'row' }, temp, h('span', { class: 'note', text: _t('0 = chắc chắn, 1 = sáng tạo') })),
          h('span'), h('div', { class: 'row' }, saveB, clearB))));

      // danh sách model + lọc "dùng được"
      var mt = h('div');
      var onlyStruct = h('input', { type: 'checkbox', checked: true, id: 'onlyStruct' });
      var q = h('input', { type: 'search', placeholder: _t('Lọc model…'), style: 'width:220px' });
      var loadB = h('button', { class: 'btn', disabled: !cfg.hasKey, onclick: loadModels }, _t('Lấy danh sách model'));
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Chọn model'), h('span', { class: 'r row' }, q, h('label', { class: 'note' }, onlyStruct, _t(' chỉ model hỗ trợ JSON có cấu trúc')), loadB)), mt));
      var models = [];
      function loadModels() {
        loadB.disabled = true; loadB.textContent = _t('Đang lấy…');
        Store.api('GET', 'api/ai/models').then(function (list) { models = list; paintModels(); })
          .catch(function (e) { clear(mt); mt.appendChild(h('div', { class: 'pad note', text: e.message + (prov.value === 'minimax' ? _t(' — MiniMax không có danh sách model qua API, hãy gõ tên model.') : '') })); })
          .then(function () { loadB.disabled = false; loadB.textContent = _t('Lấy danh sách model'); });
      }
      q.oninput = paintModels; onlyStruct.onchange = paintModels;
      function paintModels() {
        clear(mt);
        var list = models.filter(function (m) { return (!onlyStruct.checked || m.structured !== false) && (!q.value || (m.id + ' ' + m.name).toLowerCase().indexOf(q.value.toLowerCase()) >= 0); });
        var t = h('table', { class: 'grid' });
        t.appendChild(h('tr', null, ['Model', _t('Ngữ cảnh'), _t('JSON có cấu trúc'), _t('Giá vào / ra (USD / 1M token)'), ''].map(function (c) { return h('th', { text: c }); })));
        list.slice(0, 300).forEach(function (m) {
          t.appendChild(h('tr', null, h('td', null, h('div', { class: 'v', text: m.id }), m.name !== m.id ? h('div', { class: 'note', text: _l(m.name) }) : null),
            h('td', { class: 'v', text: m.context ? Math.round(m.context / 1000) + 'K' : '—' }),
            h('td', null, m.structured === null ? h('span', { class: 'chip', text: _t('không rõ') }) : h('span', { class: 'chip ' + (m.structured ? 'ok' : 'bad'), text: m.structured ? _t('có') : _t('không') })),
            h('td', { class: 'v', text: m.priceIn !== null ? m.priceIn.toFixed(2) + ' / ' + m.priceOut.toFixed(2) : '—' }),
            h('td', { class: 'nw' }, h('button', { class: 'btn sm', onclick: function () { model.value = m.id; toast(_t('Đã chọn {id}. Bấm Lưu để dùng.', { id: m.id })); } }, _t('Chọn')), ' ',
              h('button', { class: 'btn sm', onclick: function () { runTest(m.id); } }, _t('Kiểm tra')))));
        });
        mt.appendChild(h('div', { class: 'scroll', style: 'max-height:420px' }, t));
        mt.appendChild(h('div', { class: 'pad note', text: _t('{n} model. "Không rõ" = nhà cung cấp không công bố; bấm Kiểm tra để đo thật.', { n: list.length }) }));
      }

      // bảng đo model
      var bt = h('div');
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Kiểm tra model'), h('span', { class: 'r row' }, h('span', { class: 'note', text: _t('Chạy một kịch bản thử 3 diễn viên, chấm JSON đúng chuẩn, số lần sửa, độ trễ, token.') }),
        h('button', { class: 'btn primary', disabled: !cfg.hasKey || !cfg.model, onclick: function () { runTest(''); } }, _t('Kiểm tra model đang chọn')))), bt));
      function runTest(m) {
        toast(_t('Đang kiểm tra {x}…', { x: m || cfg.model }));
        Store.api('POST', 'api/ai/test', { model: m }).then(function (row) { toast((row.ok ? '✓ ' : '✗ ') + row.model + ': ' + row.verdict); paintBench(); }).catch(function (e) { toast(e.message); });
      }
      function paintBench() {
        Store.api('GET', 'api/ai/bench').then(function (rows) {
          clear(bt);
          if (!rows.length) { bt.appendChild(h('div', { class: 'pad note', text: _t('Chưa kiểm tra model nào.') })); return; }
          var t = h('table', { class: 'grid' });
          t.appendChild(h('tr', null, [_t('Lúc'), 'Model', _t('Kết luận'), _t('Lần sửa'), _t('Độ trễ'), _t('Token vào / ra'), _t('Ghi chú')].map(function (c) { return h('th', { text: c }); })));
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

      // nối agent qua MCP: CÙNG component với Hệ thống › Kết nối agent và wizard lần đầu (CNS-134 — không còn bản chép riêng ở đây)
      box.appendChild(h('div', { class: 'note', style: 'margin-top:4px', text: _t('Agent (Claude Code, claude.ai, hoặc agent bất kỳ hỗ trợ MCP) gọi các tool của nhà xưởng (danh sách đầy đủ: lệnh genchibi agent tools): tra kho, kiểm, dựng SVG; tạo nhân vật / linh kiện / vật phẩm / bối cảnh; dự án chủ đề và gói dự án; tác phẩm (kịch bản, phân cảnh); kiểm và cập nhật phiên bản. Kết quả hiện ngay trong Studio.') }));
      box.appendChild(agentCards({ mcpUrl: (Store.info && Store.info.mcp && Store.info.mcp.oauth) || '', id: 'aiCards' }));
    }
  };

  /* ============================================================ trang: Cổng kiểm & hiệu năng */
  PAGES.gates = function () {
    crumbs([{ t: _t('Cổng kiểm & hiệu năng') }]);
    var t = h('table', { class: 'grid' });
    var all = GC.assets();
    var head = GC.gate(all[0], { poses: true }).map(function (g) { return gL(g); });
    t.appendChild(h('tr', null, h('th', { text: _pt('cột', 'Nhân vật') }), head.map(function (x) { return h('th', { text: x }); }), h('th', { text: _t('Xuất') })));
    all.forEach(function (a) {
      var gs = GC.gate(a, { poses: true }), ok = gs.every(function (g) { return g.ok; });
      t.appendChild(h('tr', null, h('td', null, h('span', { class: 'mono note', text: (a.code || '') + ' ' }), _lo(a, a.name)),
        gs.map(function (g) { return h('td', { class: g.ok ? 'ok' : 'bad', title: gD(g), style: 'font-weight:600', text: g.ok ? _pt('cổng kiểm', 'Đạt') : _t('Không đạt') }); }),
        h('td', { class: ok ? 'ok' : 'bad', style: 'font-weight:600', text: ok ? _t('Được xuất') : _t('Chặn') })));
    });
    var res = h('div', { class: 'note' });
    var host = h('div', { class: 'stage', style: 'display:grid;grid-template-columns:repeat(auto-fill,40px);gap:2px;max-height:300px;overflow:hidden;padding:4px' });
    function bench(n, tier) {
      clear(host); res.textContent = _t('Đang đo {n} nhân vật ở tầng {tier}…', { n: n, tier: tier });
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
        res.textContent = _t('{n} nhân vật · tầng {tier} · {fps} fps (p95 {n2} ms/khung) · {x}', { n: n, tier: tier, fps: fps, n2: Math.round(frames[Math.floor(frames.length * 0.95)]), x: fps >= 55 ? _t('ĐẠT') : _t('CHẬM') });
        res.className = fps >= 55 ? 'ok' : 'bad';
        insts.forEach(function (x) { x.destroy(); });
      })(start);
    }
    $('view').appendChild(h('div', { class: 'stack' },
      h('div', { class: 'panel scroll' }, h('h3', null, _t('Cổng kiểm tự động'), h('span', { class: 'r note', text: _t('không đạt thì không được xuất') })), t),
      h('div', { class: 'panel' }, h('h3', null, _t('Hiệu năng (ngân sách vẽ)')), h('div', { class: 'pad stack' },
        h('div', { class: 'note', text: _t('Tầng ảnh dùng cho danh sách (hàng trăm nhân vật), tầng thở cho avatar đang hiện, tầng diễn đủ tối đa {budget} nhân vật cùng lúc.', { budget: R.budget }) }),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: function () { bench(300, 'image'); } }, _t('300 · tầng ảnh')),
          h('button', { class: 'btn', onclick: function () { bench(60, 'idle'); } }, _t('60 · tầng thở')),
          h('button', { class: 'btn', onclick: function () { bench(8, 'full'); } }, _t('8 · diễn đủ'))),
        res, host))));
  };

  /* ============================================================ trang: Thiết lập lần đầu (wizard — v0.23 §A.3, Data Console STD-07) */
  // 1 ✓ Tài khoản chủ · 2 Tên miền ("Đưa lên mạng" = Go online nhúng · "Chỉ dùng trên máy này") · 3 Chẩn đoán MCP (tự kiểm cục bộ BẮT BUỘC đạt · kiểm từ Internet
  // chỉ báo · thẻ nối agent dùng chung · kiểm thật: chờ lời gọi MCP đầu tiên). Không khoá owner (CNS-254): bước Internet lỗi / chờ lâu → "Tạm dùng trên máy
  // này"; phần tự kiểm hỏng vì lỗi của chính nó → genchibi setup skip trên máy chủ. Mở lại khi chưa xong → đúng bước đang dở (server giữ stage).
  // stage done + review (máy v0.21 / v0.22 đã có mật khẩu): cùng trang ở chế độ "Kiểm tra thiết lập" một lần, đóng được.
  var SU_CHECK = { http: N_('/mcp trên máy này (initialize + tools/list)'), token: N_('Token chủ (env hoặc data/owner-token)'), stdio: N_('genchibi mcp (stdio)') };
  var SU_CHANNEL = { stdio: N_('genchibi mcp (stdio)'), http: N_('HTTP + token chủ'), oauth: N_('OAuth'), link: N_('link có khoá') };
  PAGES.setup = function () {
    crumbs([{ t: _t('Thiết lập lần đầu') }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel empty', text: _t('Thiết lập lần đầu chỉ có ở bản cài trên máy.') })); return; }
    var box = h('div', { class: 'stack', id: 'suBox' }), S = { v: null, pick: Setup.pick || '', timer: null, left: false, inet: null, testing: false, inetBusy: false, olHost: null, olFail: false, auto: false, el: {} };
    $('view').appendChild(box);
    onLeave(function () { S.left = true; clearTimeout(S.timer); });
    function fail(e) { if (S.left) return; clear(box); box.appendChild(h('div', { class: 'banner bad', role: 'alert' }, h('span', { text: e.message }), h('button', { class: 'btn sm', onclick: load }, _t('Thử lại')))); }
    function load() { clearTimeout(S.timer); return Store.api('GET', 'api/setup').then(function (v) { if (!S.left) render(v); }).catch(fail); }
    function post(path, body) { return Store.api('POST', 'api/setup/' + path, body || {}); }
    function done() { location.replace('/'); }   // tải lại: Studio đầy đủ (cổng mở)
    // bước 3 hỏi lại mỗi 2 giây: agent đầu tiên gọi MCP (lastClient) — chỉ vẽ lại phần "kiểm thật" + nút, không đụng chữ đang chọn / đang chép
    function poll() {
      clearTimeout(S.timer);
      if (S.left || !S.v || S.v.stage !== 'mcp') return;
      S.timer = setTimeout(function () {
        Store.api('GET', 'api/setup').then(function (v) { if (S.left) return; if (v.stage !== S.v.stage) return render(v); S.v = v; paintLive(); poll(); }).catch(function () { poll(); });
      }, 2000);
    }
    function render(v) {
      var prev = S.v; S.v = v;
      if (v.stage === 'done' && (!v.review || (prev && prev.stage !== 'done'))) return done();
      clear(box);
      box.appendChild(stepper(v));
      if (v.stage === 'domain') box.appendChild(stepDomain(v));
      else box.appendChild(stepMcp(v));
      box.appendChild(h('div', { class: 'note', id: 'suStuck', text: _t('Kẹt ở một bước vì chính phần kiểm bị lỗi? Trên máy chủ chạy genchibi setup skip (có ghi log). Làm lại từ đầu: genchibi setup reset.') }));
      poll();
      if (v.stage === 'mcp' && !v.mcp.selfTest && !S.auto) { S.auto = true; selfTest(); }   // vào bước 3 lần đầu: tự chạy tự kiểm
    }
    function stepper(v) {
      var cur = v.stage === 'domain' ? 2 : 3, mm = v.mcp || {}, user = (Store.info && Store.info.auth && Store.info.auth.user) || {};
      var cell = function (n, title, sub, state) {
        return h('div', { 'data-step': String(n), 'data-state': state, 'aria-current': n === cur ? 'step' : null },
          h('span', { class: 'n', text: _t('BƯỚC {n}', { n: n }) }), h('b', { text: (state === 'ok' ? '✓ ' : '') + title }), h('span', { class: 'note', text: sub }));
      };
      return h('div', { class: 'panel', id: 'suSteps' }, h('h3', null, v.review ? _t('Kiểm tra thiết lập') : _t('Thiết lập lần đầu'), h('span', { class: 'r note', text: v.review ? _t('một lần sau khi nâng cấp — đóng được') : _t('3 bước · đăng nhập lại thì về đúng bước đang dở') })),
        h('div', { class: 'pad' }, h('div', { class: 'sustep' },
          cell(1, _t('Tài khoản chủ'), user.login ? _t('Tên đăng nhập: {login}', { login: user.login }) : _t('Đã khởi tạo'), 'ok'),
          cell(2, _t('Tên miền'), cur > 2 ? (v.choice === 'online' || (v.online && v.online.publicUrl) ? (v.online.publicUrl || _t('Đã lên mạng')) : v.choice === 'local-pending' ? _t('Tạm dùng trên máy này — lên mạng chưa xong') : _t('Chỉ dùng trên máy này')) : _t('Đưa lên mạng, hoặc chỉ dùng trên máy này'), cur > 2 ? 'ok' : 'cur'),
          cell(3, _t('Chẩn đoán MCP'), mm.lastClient ? _t('Agent {name} đã nối', { name: mm.lastClient.name }) : _t('Tự kiểm trên máy + nối agent đầu tiên'), v.stage === 'done' ? 'ok' : cur === 3 ? 'cur' : 'todo'))));
    }
    // ---- bước 2: hai lựa chọn ngang hàng
    function stepDomain(v) {
      if (!S.pick && v.online && (v.online.busy || v.online.mode !== 'off' || v.online.pending)) S.pick = 'online';   // tải lại giữa luồng Go online → vẫn ở nhánh đang chạy
      var grid = h('div', { class: 'olpaths', role: 'radiogroup', 'aria-label': _t('Tên miền') });
      [['online', _t('Đưa lên mạng'), _t('Studio + MCP có HTTPS ở tên miền của bạn — claude.ai trên web nối được (Cấp phép bằng OAuth)')],
        ['local', _t('Chỉ dùng trên máy này'), _t('Không mở gì ra Internet — Claude Code trên máy này nối bằng genchibi mcp')]].forEach(function (o) {
        grid.appendChild(h('button', { type: 'button', class: 'olpath', role: 'radio', id: 'suPick-' + o[0], 'data-choice': o[0], 'aria-checked': S.pick === o[0] ? 'true' : 'false',
          onclick: function () { S.pick = Setup.pick = o[0]; render(S.v); } }, h('b', { text: o[1] }), h('span', { class: 'note', text: o[2] })));
      });
      var body = h('div', { class: 'pad stack' }, grid);
      if (S.pick === 'local') {
        body.appendChild(h('div', { class: 'stack olform', id: 'suLocalBox' },
          h('ul', { class: 'note', style: 'margin:0;padding-left:18px;display:grid;gap:2px' },
            h('li', { text: _t('claude.ai trên web không nối được (cần địa chỉ công khai có HTTPS).') }),
            h('li', { text: _t('Claude Code / agent trên máy này nối bằng genchibi mcp — bước sau kiểm thật.') }),
            h('li', { text: _t('Đổi được bất cứ lúc nào: Hệ thống › Lên mạng.') })),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', id: 'suLocal', onclick: function () { this.disabled = true; post('choice', { choice: 'local' }).then(render).catch(function (e) { toast(e.message); load(); }); } }, _t('Tiếp tục — chỉ dùng trên máy này')))));
      } else if (S.pick === 'online') {
        if (!S.olHost) { S.olHost = h('div', { id: 'suOnline' }); onlineView(S.olHost, { embed: true, onRender: onOnline }); }
        body.appendChild(S.olHost);
        // KHÔNG KHOÁ owner (CNS-254): luôn có lối "tạm dùng trên máy này" — đỏ khi một bậc Internet đang lỗi
        S.el.later = h('div', { class: 'banner ' + (S.olFail ? 'bad' : 'warn'), id: 'suLaterBar', role: 'status' },
          h('span', { text: S.olFail ? _t('Bước Internet đang lỗi — sửa theo hàng ✗ ở trên rồi Kiểm lại, hoặc dùng Studio trên máy này trước và lên mạng sau.') : _t('Bước Internet chờ lâu (DNS, chứng chỉ, Cloudflare beta, quyền WAF)? Bạn không bị khoá: dùng Studio trên máy này trước, lên mạng sau.') }),
          h('button', { class: 'btn sm', id: 'suLocalPending', onclick: function () { this.disabled = true; post('choice', { choice: 'local-pending' }).then(render).catch(function (e) { toast(e.message); load(); }); } }, _t('Tạm dùng trên máy này')));
        body.appendChild(S.el.later);
      }
      return h('div', { class: 'panel', id: 'suDomain' }, h('h3', null, _t('Bước 2 · Tên miền'), h('span', { class: 'r note', text: _t('đổi được sau ở Hệ thống › Lên mạng') })), body);
    }
    // Go online (nhúng) vừa vẽ: luồng xong → server đã sang bước 3 → tải lại wizard; một bậc ✗ → dải "Tạm dùng trên máy này" chuyển đỏ
    function onOnline(ov) {
      var f = ov && ov.flow, bad = !!(f && !f.done && f.steps && f.steps.some(function (x) { return x.state === 'fail'; }));
      if (f && f.done && f.mode !== 'off' && ov.mode !== 'off' && !ov.busy) { setTimeout(load, 300); return; }
      if (bad !== S.olFail) { S.olFail = bad; if (S.v && S.v.stage === 'domain' && !S.left) render(S.v); }
    }
    // ---- bước 3
    function selfTest() {
      if (S.testing) return; S.testing = true; if (S.el.selfBtn) { S.el.selfBtn.disabled = true; S.el.selfBtn.textContent = _t('Đang tự kiểm…'); }
      post('selftest', {}).then(function (v) { S.testing = false; if (!S.left) render(v); }).catch(function (e) { S.testing = false; toast(e.message); load(); });
    }
    function inetCheck() {
      S.inetBusy = true; if (S.el.inetBtn) { S.el.inetBtn.disabled = true; S.el.inetBtn.textContent = _t('Đang kiểm từ Internet…'); }
      post('internet', {}).then(function (r) { S.inetBusy = false; S.inet = r; if (!S.left) render(S.v); }).catch(function (e) { S.inetBusy = false; S.inet = { state: 'fail', detail: e.message }; if (!S.left) render(S.v); });
    }
    function stepMcp(v) {
      var mm = v.mcp || {}, st = mm.selfTest, ok = !!(st && st.ok), wrap = h('div', { class: 'stack', id: 'suMcp' });
      // 3a — tự kiểm trên máy này (bắt buộc đạt)
      var tbl = h('table', { class: 'grid', id: 'suSelfGrid' }), cols = [_t('Kiểm'), _t('Trạng thái'), _t('Chi tiết')];
      tbl.appendChild(h('tr', { class: 'letters' }, h('td'), cols.map(function (c, i) { return h('td', { text: String.fromCharCode(65 + i) }); })));
      tbl.appendChild(h('tr', null, h('th', { text: 'ID' }), cols.map(function (c) { return h('th', { text: c }); })));
      ((st && st.checks) || []).forEach(function (c, i) {
        tbl.appendChild(h('tr', { 'data-check': c.id, 'data-state': c.ok ? 'ok' : 'fail' }, h('td', { class: 'id', text: 'MCP-' + String(i + 1).padStart(2, '0') }), h('td', { class: 'nw' }, h('b', { text: _t(SU_CHECK[c.id] || c.id) })),
          h('td', { class: 'nw' }, h('span', { class: 'chip ' + (c.ok ? 'ok' : 'bad'), text: c.ok ? '✓ ' + _t('Đạt') : '✗ ' + _t('Lỗi') })), h('td', { class: 'wrap', text: c.detail || '' })));
      });
      S.el.selfBtn = h('button', { class: 'btn' + (ok ? '' : ' primary'), id: 'suSelfRun', disabled: S.testing, onclick: selfTest }, S.testing ? _t('Đang tự kiểm…') : st ? _t('Kiểm lại') : _t('Chạy tự kiểm'));
      wrap.appendChild(h('div', { class: 'panel', id: 'suSelf' }, h('h3', null, _t('Bước 3 · Tự kiểm trên máy này'), h('span', { class: 'r note', text: _t('bắt buộc đạt') })),
        st ? h('div', { class: 'scroll' }, tbl) : h('div', { class: 'pad note', text: S.testing ? _t('Đang tự kiểm…') : _t('Chưa chạy.') }),
        h('div', { class: 'pad row' }, S.el.selfBtn, st ? h('span', { class: 'chip ' + (ok ? 'ok' : 'bad'), id: 'suSelfState', text: ok ? '✓ ' + _t('Tự kiểm đạt lúc {at}', { at: fmtClock(st.at) }) : '✗ ' + _t('Tự kiểm chưa đạt — sửa theo chi tiết rồi Kiểm lại') }) : null)));
      // 3b — kiểm từ Internet (đã lên mạng): chỉ báo, không khoá
      if (v.online && v.online.publicUrl) {
        var r = S.inet;
        S.el.inetBtn = h('button', { class: 'btn', id: 'suInetRun', disabled: S.inetBusy, onclick: inetCheck }, S.inetBusy ? _t('Đang kiểm từ Internet…') : r ? _t('Kiểm lại') : _t('Kiểm từ Internet'));
        wrap.appendChild(h('div', { class: 'panel', id: 'suInet' }, h('h3', null, _t('Kiểm từ Internet'), h('span', { class: 'r note', text: _t('chỉ báo, không khoá — {url}', { url: v.online.publicUrl }) })),
          h('div', { class: 'pad stack' },
            r ? h('div', { class: 'row', id: 'suInetResult', 'data-state': r.state }, h('span', { class: 'chip ' + (r.state === 'ok' ? 'ok' : r.state === 'skip' ? '' : 'bad'), text: r.state === 'ok' ? '✓ ' + _t('Đạt') : r.state === 'skip' ? _t('Bỏ qua') : '✗ ' + _t('Lỗi') }), h('span', { class: 'wrap', text: r.detail || '' })) : h('div', { class: 'note', text: _t('Kiểm /mcp từ ngoài vào: 401 kèm metadata OAuth, đường của agent không bị luật chặn bot / WAF.') }),
            r && r.fix ? h('div', { class: 'note', id: 'suInetFix' }, h('span', { text: '→ ' + r.fix }), fixCopies(r.fix)) : null,
            h('div', { class: 'row' }, S.el.inetBtn))));
      }
      // 3c — thẻ nối agent (một component với Kết nối agent)
      wrap.appendChild(agentCards({ mcpUrl: v.mcpUrl || '', id: 'suCards' }));
      // 3d — kiểm thật: lời gọi MCP đầu tiên của agent
      S.el.live = h('div', { class: 'sulive', id: 'suLive' });
      S.el.finish = h('button', { class: 'btn primary', id: 'suFinish', onclick: function () { this.disabled = true; post('finish', {}).then(done).catch(function (e) { toast(e.message); load(); }); } }, _t('Xong'));
      S.el.laterBtn = h('button', { class: 'btn', id: 'suLater', onclick: function () { this.disabled = true; post('finish', { later: true }).then(done).catch(function (e) { toast(e.message); load(); }); } }, _t('Tôi nối agent sau'));
      var acts = v.review ? h('div', { class: 'row' }, h('button', { class: 'btn primary', id: 'suReviewDone', onclick: function () { post('review', {}).then(done).catch(function (e) { toast(e.message); }); } }, _t('Đã kiểm xong')))
        : h('div', { class: 'row' }, S.el.finish, S.el.laterBtn, h('span', { class: 'note', id: 'suLaterNote', text: _t('"Tôi nối agent sau" bấm được khi tự kiểm đã đạt — Trang chủ giữ dải nhắc tới khi có agent nối.') }));
      wrap.appendChild(h('div', { class: 'panel', id: 'suAgent' }, h('h3', null, _t('Kiểm thật: agent đầu tiên'), h('span', { class: 'r note', text: _t('chờ lời gọi MCP đầu tiên — tự cập nhật') })), h('div', { class: 'pad stack' }, S.el.live, acts)));
      paintLive();
      return wrap;
    }
    function paintLive() {
      var v = S.v || {}, mm = v.mcp || {}, c = mm.lastClient, ok = !!(mm.selfTest && mm.selfTest.ok);
      if (S.el.live) {
        clear(S.el.live);
        S.el.live.appendChild(c ? h('span', { class: 'chip ok', id: 'suLiveOk', 'data-client': c.name, text: '✓ ' + _t('Agent {name} đã nối lúc {at} ({channel})', { name: c.name, at: fmtClock(c.at), channel: _t(SU_CHANNEL[c.channel] || c.channel) }) })
          : h('span', { class: 'chip warn', id: 'suLiveWait', text: '… ' + _t('Đang chờ agent gọi MCP lần đầu — làm theo một thẻ ở trên') }));
      }
      if (S.el.finish) S.el.finish.disabled = !(ok && c);
      if (S.el.laterBtn) S.el.laterBtn.disabled = !ok;
    }
    load();
  };

  /* ============================================================ thẻ "Nối agent" (v0.23 — MỘT nguồn, CNS-134 / CNS-261) */
  // Hướng dẫn nối agent CHỈ có ở đây; dùng chung bởi Hệ thống › Kết nối agent, Cài đặt AI và wizard lần đầu bước 3. Đường dẫn UI của claude.ai chép tay đúng
  // một chỗ (CNS-137). o.mcpUrl: địa chỉ MCP công khai (OAuth) — rỗng = máy chưa lên mạng (claude.ai trên web không nối được; Claude Code dùng genchibi mcp)
  function agentCards(o) {
    o = o || {};
    var url = o.mcpUrl || '';
    var row = function (id, label, text) {
      return h('div', { class: 'stack', style: 'gap:4px' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'note', text: label }),
        h('button', { class: 'btn sm', type: 'button', id: id + 'Copy', onclick: function () { copyText(text, label); } }, _t('Chép'))), h('pre', { class: 'code', id: id, text: text }));
    };
    var card = function (id, title, kids) { return h('div', { class: 'agcard', id: id }, h('b', { text: title }), kids); };
    var json = JSON.stringify({ mcpServers: { 'gen-chibi': url ? { url: url } : { command: 'genchibi', args: ['mcp'] } } }, null, 2);
    var cards = h('div', { class: 'agcards' },
      card('agCc', 'Claude Code', [row('agCcLocal', _t('Trên máy này (stdio)'), 'claude mcp add -s user gen-chibi -- genchibi mcp'),
        url ? row('agCcNet', _t('Qua Internet (OAuth)'), 'claude mcp add -s user --transport http gen-chibi ' + url) : null,
        h('span', { class: 'note', text: _t('Mở phiên Claude Code mới rồi dặn: "gọi start_here trước".') })]),
      card('agAi', 'claude.ai', url ? [row('agAiUrl', _t('Địa chỉ MCP'), url), h('ol', { class: 'note', style: 'margin:0;padding-left:18px;display:grid;gap:2px' },
          h('li', { text: _t('Mở claude.ai › Customize › Connectors › Add custom connector, dán địa chỉ trên (để trống Client ID / Secret).') }),
          h('li', { text: _t('Bấm Connect — trang "Cấp phép kết nối agent" của máy này hiện ra; chọn mức quyền, bấm Cấp phép. Đăng nhập Studio ở địa chỉ khác? Bấm Cấp phép ngay ở Hệ thống › Kết nối agent.') }),
          h('li', { text: _t('Mở phiên chat mới: agent thấy các tool của gen-chibi. Thu hồi bất cứ lúc nào ở Hệ thống › Kết nối agent.') }))]
        : [h('span', { class: 'note', id: 'agAiOff', text: _t('claude.ai trên web chỉ nối được khi máy đã lên mạng (Hệ thống › Lên mạng). Trên máy này: dùng Claude Code với genchibi mcp.') })]),
      card('agJson', _t('Agent khác (JSON)'), [row('agJsonCfg', _t('Cấu hình MCP'), json),
        h('span', { class: 'note', text: _t('Cursor, Gemini CLI, Codex…: dán vào tệp cấu hình MCP của client. Lệnh in đủ mọi client: genchibi agent connect.') })]));
    return h('div', { class: 'panel', id: o.id || 'agCards' }, h('h3', null, _t('Nối agent'), h('span', { class: 'r note', text: _t('MCP 2025-06-18 · agent gọi start_here trước') })), h('div', { class: 'pad' }, cards));
  }

  /* ============================================================ trang: Kết nối agent (OAuth, v0.19) */
  // Agent (claude.ai, Claude Code…) tự kết nối vào <GC_PUBLIC_URL>/mcp; chủ chỉ bấm "Cấp phép" ở trang của app. Ở đây: URL để dán, công tắc tự đăng ký, bảng client, đổi phạm vi / thu hồi.
  // KHÔNG bao giờ hiện token: server không trả token / băm / secret (GET api/oauth). Mọi chữ do agent tự khai (tên) đặt qua h() → textContent.
  PAGES.connect = function () {
    crumbs([{ t: _t('Kết nối agent') }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel empty', text: _t('Kết nối agent chỉ có ở bản cài trên máy (cần máy chủ để cấp và giữ token).') })); return; }
    var box = h('div', { class: 'stack', id: 'connectBox' });
    $('view').appendChild(box);
    function load() { Store.api('GET', 'api/oauth').then(render).catch(function (e) { clear(box); box.appendChild(h('div', { class: 'panel empty', text: e.message })); }); }
    var STATUS = { active: ['ok', _t('Đang kết nối')], pending: ['warn', _t('Chờ cấp phép (trên trang Cấp phép)')], expired: ['', _t('Hết hạn')], revoked: ['bad', _t('Đã thu hồi')] };
    var RANK = { active: 0, expired: 1, revoked: 2, pending: 3 };
    function scopeLabel(v, id) { var m = v.scopes.filter(function (x) { return x.id === id; })[0]; return m ? _l(m.label) + ' (' + id + ')' : id; }
    // CNS-128: yêu cầu cấp phép đang chờ → nút Cấp phép ngay trong Studio (trang Cấp phép mở ở địa chỉ khác Studio thì không phải dán GC_API_TOKEN):
    // duyệt qua cùng API của trang Cấp phép, rồi mở địa chỉ quay về của agent (callback đã đăng ký) ở thẻ mới để agent nhận mã
    function approveBtn(c, q, sel) {
      var b = h('button', { class: 'btn sm primary', type: 'button', 'data-request': q.id, text: _t('Cấp phép'), onclick: function () {
        b.disabled = true;
        Store.api('POST', 'api/oauth/approve', { request: q.id, decision: 'approve', scope: sel.value || q.requested || 'mcp:write' }).then(function (r) {
          toast(_t('Đã cấp phép "{name}" — mở trang quay về của agent để hoàn tất.', { name: c.name }));
          if (r && r.redirect) window.open(r.redirect, '_blank', 'noopener');
          load();
        }).catch(function (e) { b.disabled = false; toast(e.message); });
      } });
      return b;
    }
    function render(v) {
      clear(box);
      var link = Store.info && Store.info.mcp && Store.info.mcp.link;
      // ---- 1) địa chỉ để dán
      var head = h('div', { class: 'panel' }, h('h3', null, _t('Kết nối OAuth'), h('span', { class: 'r note', text: _t('không phải chép khoá — agent tự khám phá, bạn bấm Cấp phép') })));
      if (!v.enabled) {
        head.appendChild(h('div', { class: 'pad stack' },
          h('div', { class: 'row' }, h('span', { class: 'chip warn', text: _t('Chưa bật') }), h('button', { class: 'btn sm primary', id: 'connectGoOnline', onclick: function () { go({ page: 'online' }); } }, _t('Đưa máy lên mạng ở Hệ thống › Lên mạng ›'))),
          h('div', { text: v.configured ? _t('GC_PUBLIC_URL không hợp lệ: phải là gốc của địa chỉ công khai, vd. https://chibi.example.com (không có đường dẫn).') : _t('Cần địa chỉ công khai của máy này để bật: Hệ thống › Lên mạng (hoặc genchibi online) đặt tên miền + HTTPS và mở các đường OAuth. Đã có proxy riêng (như Caddy): genchibi online proxy <tên-miền>, rồi cho proxy của bạn chuyển /mcp, /.well-known/oauth-*, /oauth/* về app (xem docs/HUONG-DAN.md).') }),
          h('div', { class: 'note', text: _t('Khi chưa bật, /mcp vẫn dùng như cũ: token chủ máy hoặc link có khoá (mục dưới).') })));
      } else {
        var url = v.mcpUrl;
        head.appendChild(h('div', { class: 'pad stack' },
          h('div', { class: 'row' }, h('span', { class: 'chip ok', text: _t('Đã bật') }), h('span', { class: 'mono', id: 'connectUrl', text: url }), h('button', { class: 'btn sm', id: 'connectCopy', type: 'button', onclick: function () { copyText(url, _t('địa chỉ MCP')); } }, _t('Sao chép địa chỉ'))),
          h('div', { class: 'kv' },
            h('label', { text: _t('Tự đăng ký') }), h('label', { class: 'row' },
              h('input', { type: 'checkbox', id: 'connectReg', checked: v.register, onchange: function (ev) {
                var on = ev.target.checked;
                Store.api('PUT', 'api/settings', { oauthRegister: on }).then(function () { toast(on ? _t('Agent được phép tự đăng ký.') : _t('Đã tắt: agent mới không tự đăng ký được (client đã có vẫn dùng).')); load(); }).catch(function (e) { toast(e.message); load(); });
              } }), h('span', { class: 'note', text: _t('Cho phép agent tự đăng ký (DCR). Tắt khi bạn không đang thêm kết nối mới. Chỉ nhận callback: {map}.', { map: v.redirects.map(function (u) { return u.replace(/^https?:\/\//, ''); }).join(' · ') }) })),
            h('label', { text: _t('Thêm callback') }), h('span', { class: 'note', text: _t('Agent khác (không phải claude.ai / claude.com / máy bạn): thêm GC_OAUTH_REDIRECTS=<url>,<url> trong .env rồi khởi động lại.') }))));
      }
      box.appendChild(head);
      // ---- cách nối từng agent: MỘT component dùng chung với wizard lần đầu bước 3 và Cài đặt AI (CNS-134 / CNS-261)
      box.appendChild(agentCards({ mcpUrl: v.enabled ? v.mcpUrl : '', id: 'connectCards' }));
      // ---- 2) bảng client
      var tbl = h('table', { class: 'grid', id: 'connectTable' });
      tbl.appendChild(h('tr', null, ['Agent', _t('Quay về'), _t('Phạm vi'), _t('Cấp lúc'), _t('Dùng lần cuối'), _t('Trạng thái'), ''].map(function (c) { return h('th', { text: c }); })));
      var rows = v.clients.slice().sort(function (a, b) { return RANK[a.status] - RANK[b.status] || String(b.createdAt).localeCompare(String(a.createdAt)); });
      rows.forEach(function (c) {
        var st = STATUS[c.status] || ['', c.status], sel = h('select', { 'aria-label': _t('Phạm vi của {name}', { name: c.name }), disabled: c.status === 'pending' });
        v.scopes.forEach(function (sc) { var o = h('option', { value: sc.id, text: _l(sc.label) + ' (' + sc.id + ')' }); if (sc.id === c.scope) o.selected = true; sel.appendChild(o); });
        var chg = h('button', { class: 'btn sm', type: 'button', disabled: true, text: _t('Đổi phạm vi'), onclick: function () {
          chg.disabled = true;
          Store.api('PUT', 'api/oauth/clients/' + c.id, { scope: sel.value }).then(function (nv) { toast(_t('Đã đổi phạm vi: {scopeLabel} — có hiệu lực ngay.', { scopeLabel: scopeLabel(v, sel.value) })); render(nv); }).catch(function (e) { toast(e.message); load(); });
        } });
        sel.addEventListener('change', function () { chg.disabled = sel.value === c.scope; });
        var rev = h('button', { class: 'btn sm danger', type: 'button', disabled: c.status === 'revoked', text: _t('Thu hồi'), onclick: function () {
          if (!window.confirm(_t('Thu hồi "{name}"?\n\nMọi token của agent này (truy cập + làm mới) bị huỷ ngay; muốn nối lại phải cấp phép lại.', { name: c.name }))) return;
          Store.api('POST', 'api/oauth/clients/' + c.id + '/revoke').then(function (nv) { toast(_t('Đã thu hồi "{name}".', { name: c.name })); render(nv); }).catch(function (e) { toast(e.message); load(); });
        } });
        tbl.appendChild(h('tr', { 'data-client': c.id, 'data-status': c.status },
          h('td', null, h('b', { text: _l(c.name) })),
          h('td', null, c.hosts.map(function (x) { return h('div', { class: 'mono nw' }, x.host, x.known || x.loopback ? null : h('span', { class: 'chip warn', style: 'margin-left:6px', text: _t('lạ') })); })),
          h('td', null, h('div', { class: 'row' }, sel, chg)),
          h('td', { class: 'nw note', text: fmtTime(c.approvedAt) }),
          h('td', { class: 'nw note', text: fmtTime(c.lastUsedAt) }),
          h('td', { class: 'nw' }, h('span', { class: 'chip ' + st[0], text: st[1] }), c.status === 'pending' && c.expiresAt ? h('div', { class: 'note', text: _t('tự xoá {fmtTime}', { fmtTime: fmtTime(c.expiresAt) }) }) : null),
          h('td', { class: 'nw' }, (c.requests || []).map(function (q) { return approveBtn(c, q, sel); }), rev)));
      });
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Agent đã kết nối'), h('span', { class: 'r note', text: _t('{n} / 50 client · token không bao giờ hiện ở đây', { n: rows.length }) })),
        rows.length ? tbl : h('div', { class: 'pad note', text: _t('Chưa có agent nào. Dán địa chỉ MCP ở trên vào claude.ai (hoặc chạy lệnh Claude Code) là agent xuất hiện ở đây.') })));
      // ---- 3) mức quyền
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Ba mức quyền')), h('div', { class: 'pad kv' }, v.scopes.map(function (sc) { return [h('label', { text: _l(sc.label) }), h('div', null, h('span', { class: 'mono', text: sc.id }), h('div', { class: 'note', text: _l(sc.desc) }))]; }))));
      // ---- 4) link có khoá (cũ)
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Link có khoá (cách cũ, vẫn dùng được)'), h('span', { class: 'r note', text: _t('không qua OAuth') })),
        h('div', { class: 'pad stack' },
          link ? h('div', { class: 'stack' }, h('pre', { class: 'code', text: link }), h('div', null, h('button', { class: 'btn sm', type: 'button', onclick: function () { copyText(link, 'link MCP'); } }, _t('Sao chép link'))))
            : h('div', { class: 'note', text: _t('Chưa có. Ra Internet: Hệ thống › Lên mạng (hoặc genchibi online).') }),
          h('div', { class: 'note', text: _t('Ai có link là dùng được MCP: tạo / sửa như mức "Tạo và sửa", và còn cập nhật được app (không mở Studio). Lộ link: đổi GC_MCP_KEY trong .env rồi chạy genchibi restart. Link không đổi gì khi bạn dùng OAuth.') }))));
    }
    load();
  };

  /* ============================================================ trang: Lên mạng (Go online — v0.21, spec v021 §2) */
  // Cùng API với `genchibi online`: GET api/online (view) · POST api/online/{caddy|cloudflare|cloudflare/confirm|proxy|quick|recheck|off|migrate} (202 + view;
  // 409 needs legacy / urlChange kèm revokes; 429). Mỗi bậc một hàng lưới Data Console: ID · Bậc · Trạng thái · Chi tiết · Cách sửa · Lúc — chi tiết / cách sửa
  // server dịch sẵn theo X-GC-Lang. Đang chạy (busy) → hỏi lại mỗi giây. API token Cloudflare CHỈ nằm trong ô password: đọc lúc gửi rồi xoá ô ngay, không giữ
  // trong biến nào của trang, không vào DOM khác / log.
  var OL_PATHS = [
    { id: 'caddy', beta: true, name: N_('Máy chủ có IP công khai'), how: N_('Caddy lấy chứng chỉ HTTPS ngay trên máy'),
      need: [N_('Máy có IP công khai (VPS, máy chủ thuê)'), N_('Cổng 80 + 443 mở ở tường lửa nhà cung cấp và ufw'), N_('Không dịch vụ nào khác giữ cổng 80 / 443'), N_('Chỉ bản cài Docker')], you: N_('Bạn làm một việc: trỏ bản ghi A của tên miền về IP của máy') },
    { id: 'cloudflare', beta: true, name: N_('Máy ở nhà / sau router'), how: N_('Cloudflare Tunnel — không cần mở cổng nào'),
      need: [N_('Tên miền đã ở Cloudflare (nameserver Cloudflare, trạng thái active)'), N_('Tài khoản Cloudflare dùng được Tunnel (có thể phải bật Zero Trust gói Free)')], you: N_('Bạn làm một việc: tạo một API token Cloudflare rồi dán vào đây') },
    { id: 'proxy', name: N_('Tôi đã có reverse proxy'), how: N_('Giữ proxy của bạn — app in đoạn cấu hình rồi kiểm từ ngoài vào'),
      need: [N_('Proxy của bạn (Caddy, nginx…) đã có HTTPS cho tên miền'), N_('Tên miền trỏ về IP công khai của máy')], you: N_('Bạn làm một việc: dán đoạn cấu hình mẫu vào proxy') },
    { id: 'quick', name: N_('Link tạm'), how: N_('Địa chỉ *.trycloudflare.com — để thử, không cần tên miền'),
      need: [N_('Link đổi mỗi lần máy khởi động lại'), N_('Không dùng cho kết nối OAuth lâu dài')], you: N_('Bạn không phải làm gì') }
  ];
  var OL_STEP = { domain: N_('Tên miền → IP'), edge: N_('Edge Caddy (cổng 80 / 443)'), port: N_('Cổng 80 tới được'), cert: N_('Chứng chỉ HTTPS'), public: N_('Địa chỉ công khai'), mcp: N_('MCP từ Internet'),
    password: N_('Mật khẩu chủ'), owner: N_('Quyền chủ máy'), token: N_('API token Cloudflare'), zone: N_('Tên miền + tên con'), tunnel: N_('Tunnel + CNAME'), waf: N_('Luật WAF cho agent'),
    config: N_('Cấu hình proxy'), local: N_('Dọn trên máy'), remote: N_('Dọn ở Cloudflare') };
  // nhãn bậc theo đường: link tạm cũng có bậc `tunnel` nhưng không có CNAME nào (CNS-208c)
  var OL_STEP_BY = { quick: { tunnel: N_('Tunnel tạm (*.trycloudflare.com)') } };
  function olStep(mode, id) { return (OL_STEP_BY[mode] || {})[id] || OL_STEP[id] || id; }
  var OL_MODE = { off: N_('Ngoại tuyến'), caddy: N_('Caddy (IP công khai)'), cloudflare: N_('Cloudflare Tunnel'), proxy: N_('Proxy riêng'), quick: N_('Link tạm') };
  var OL_STATE = { ok: ['ok', '✓', N_('Đã qua')], fail: ['bad', '✗', N_('Chưa qua')], running: ['warn', '…', N_('Đang chạy')], pending: ['', '○', N_('Chờ')] };
  // mã lỗi ổn định của launcher (run/edge-status.json, launcher.js) → câu người đọc được; luôn kèm mã gốc
  var EDGE_ERR = { 'token-missing': N_('Thiếu tunnel token trên máy (run/tunnel.token) — chạy lại đường Cloudflare'),
    'token-perms': N_('Tệp tunnel token sai quyền hoặc hỏng (phải là tệp thường, chỉ chủ đọc được — chmod 600)'),
    'unsupported-platform': N_('Chưa có bản cloudflared cho hệ điều hành / kiến trúc của máy này'),
    'download-failed': N_('Không tải được cloudflared — kiểm kết nối Internet / proxy của máy'),
    'sha-mismatch': N_('Bản cloudflared tải về không khớp SHA-256 đã ghim — không chạy (an toàn)'),
    exited: N_('cloudflared dừng bất thường — xem logs/tunnel.log'),
    'ingress-unverified': N_('Cổng nghe riêng của tunnel chưa chứng minh được là gen-chibi này (app đang khởi động, hoặc tiến trình khác giữ cổng)') };
  function edgeErr(code) { return EDGE_ERR[code] ? _t(EDGE_ERR[code]) + ' (' + code + ')' : String(code || ''); }
  function fmtShort(s) { if (!s) return '—'; var d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString(I18N.locale(), { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }   // lưới hẹp: ngày/tháng giờ:phút
  function fmtClock(s) { if (!s) return '—'; var d = new Date(s); return isNaN(d) ? '—' : d.toLocaleTimeString(I18N.locale(), { hour12: false }); }
  // POST giữ nguyên thân lỗi (409 needs / revokes, 429) — Store.api chỉ giữ câu lỗi
  function rawPost(url, body) {
    return fetch(url, { method: 'POST', headers: Store.headers(), body: JSON.stringify(body || {}) }).then(function (r) {
      if (r.status === 401) { Store.login(); throw new Error(_t('Cần đăng nhập')); }
      return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; });
    });
  }
  // lệnh / biểu thức trong câu "Cách sửa" → nút chép (lệnh host, docker logs, biểu thức luật WAF)
  function fixCopies(fix) {
    var out = [], m;
    if ((m = /\b(genchibi [a-z]+(?: --?[a-z][a-z-]*)*|docker logs [a-z0-9-]+)/.exec(fix))) out.push(h('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, h('code', { class: 'mono olcmd', text: m[1] }), h('button', { class: 'btn sm', type: 'button', onclick: function () { copyText(m[1], _t('lệnh')); } }, _t('Chép lệnh'))));
    var e = /\(http\.host eq [^]*?\}\)\)/.exec(fix);
    if (e) out.push(h('pre', { class: 'code olexpr', 'data-user-content': '', text: e[0] }), h('div', { class: 'row', style: 'margin-top:4px' }, h('button', { class: 'btn sm', type: 'button', onclick: function () { copyText(e[0], _t('biểu thức')); } }, _t('Chép biểu thức'))));
    return out;
  }
  PAGES.online = function () { crumbs([{ t: _t('Lên mạng') }]); onlineView($('view'), {}); };
  // Go online ở HAI nơi, MỘT bộ mã (CNS-261 — không có bản chép thứ hai): trang Hệ thống › Lên mạng và wizard lần đầu bước 2 (v0.23 §A.3).
  // opts.embed: vẽ trong khung của wizard — không đụng thanh tiêu đề / nút của trang; opts.onRender(v): báo wizard sau mỗi lần vẽ (luồng xong → wizard đi tiếp)
  function onlineView(host, opts) {
    opts = opts || {};
    if (Store.mode !== 'server') { host.appendChild(h('div', { class: 'panel empty', text: _t('Lên mạng chỉ có ở bản cài trên máy.') })); return; }
    var box = h('div', { class: 'stack', id: 'olBox' });
    host.appendChild(box);
    var S = { v: null, pick: null, ask: null, off: false, err: '', timer: null, left: false };
    onLeave(function () { S.left = true; clearTimeout(S.timer); });
    // ô nhập dùng lại qua mỗi lần vẽ (hỏi lại mỗi giây không làm mất chữ đang gõ)
    var inp = function (o) { return h('input', Object.assign({ type: 'text', spellcheck: 'false', autocomplete: 'off', style: 'width:100%' }, o)); };
    var IN = {
      domCaddy: inp({ id: 'olDomCaddy', placeholder: 'chibi.example.com', 'aria-label': _t('Tên miền') }),
      domProxy: inp({ id: 'olDomProxy', placeholder: 'chibi.example.com', 'aria-label': _t('Tên miền') }),
      token: inp({ id: 'olToken', type: 'password', autocomplete: 'new-password', placeholder: _t('Dán API token Cloudflare'), 'aria-label': _t('API token Cloudflare') }),
      zone: inp({ id: 'olZone', placeholder: _t('example.com (để trống: app tự tìm)'), 'aria-label': _t('Tên miền ở Cloudflare') }),
      zoneSel: h('select', { id: 'olZoneSel', 'aria-label': _t('Tên miền ở Cloudflare') }),
      sub: inp({ id: 'olSub', value: 'chibi', 'aria-label': _t('Tên con') }),
      keep: h('input', { type: 'checkbox', id: 'olKeep' }),
      offTok: inp({ id: 'olOffToken', type: 'password', autocomplete: 'new-password', placeholder: _t('API token Cloudflare (tuỳ chọn)'), 'aria-label': _t('API token Cloudflare để dọn') })
    };
    function load() {
      clearTimeout(S.timer);
      return Store.api('GET', 'api/online').then(function (v) { if (!S.left) render(v); })
        .catch(function (e) { if (S.left) return; S.err = e.message; if (S.v) render(S.v); else { clear(box); box.appendChild(h('div', { class: 'banner bad', role: 'alert' }, h('span', { text: e.message }), h('button', { class: 'btn sm', onclick: load }, _t('Thử lại')))); } });
    }
    function after(x, okCodes) {
      if (x.s === 202 || x.s === 200) { S.err = ''; S.ask = null; render(x.j); return true; }
      if (x.s === 409 && x.j.needs === 'urlChange') { S.err = ''; return false; }
      S.err = x.j.error || _t('Lỗi {status}', { status: x.s });
      if (x.s === 409 && x.j.needs === 'legacy') { load(); return true; }
      render(S.v); return true;
    }
    function post(path, body) { return rawPost('api/online/' + path, body).catch(function (e) { S.err = e.message; render(S.v); return null; }); }
    // bắt đầu một đường: thân gửi đi dựng từ ô nhập; token đọc rồi XOÁ ô ngay (server giữ trong bộ nhớ ≤ 30 phút — xác nhận đổi địa chỉ gửi lại không cần token)
    function start(id, confirmed) {
      var v = S.v || {}, b;
      if (confirmed) b = confirmed;
      else if (id === 'caddy' || id === 'proxy') {
        var dom = (id === 'caddy' ? IN.domCaddy : IN.domProxy).value.trim().toLowerCase();
        if (!dom) { S.err = _t('Cần tên miền (vd chibi.example.com)'); return render(v); }
        b = { domain: dom };
      } else if (id === 'cloudflare') {
        var zone = (v.flow && v.flow.choices && v.flow.choices.length ? IN.zoneSel.value : IN.zone.value).trim().toLowerCase();
        b = { sub: IN.sub.value.trim().toLowerCase() || 'chibi', keepToken: IN.keep.checked };
        if (zone) b.zone = zone;
        var tok = IN.token.value.trim(); IN.token.value = '';
        if (tok) b.token = tok; else if (!(v.cloudflare && v.cloudflare.tokenInMemory)) { S.err = _t('Cần API token Cloudflare'); return render(v); }
        tok = '';
        return post('cloudflare', b).then(function (x) { delete b.token; if (x && !after(x)) { S.ask = { id: id, body: Object.assign(b, { confirmUrlChange: true }), from: x.j.from, to: x.j.to, revokes: +x.j.revokes || 0 }; render(S.v); } });
      } else b = {};
      return post(id, b).then(function (x) { if (x && !after(x)) { S.ask = { id: id, body: Object.assign({}, b, { confirmUrlChange: true }), from: x.j.from, to: x.j.to, revokes: +x.j.revokes || 0 }; render(S.v); } });
    }
    function render(v) {
      S.v = v; clearTimeout(S.timer);
      if (v.busy && !S.left) S.timer = setTimeout(load, 1000);
      var f = v.flow, lg = v.legacy || {}, locked = !!lg.active || v.busy;
      if (!S.pick && f && f.mode !== 'off' && !f.done) S.pick = f.mode;
      // ô nhập trống → điền từ luồng đang có (mở lại trang / đổi ngôn ngữ giữa chừng không mất tên miền); token thì KHÔNG bao giờ điền lại
      if (f && f.domain && f.mode === 'caddy' && !IN.domCaddy.value) IN.domCaddy.value = f.domain;
      if (f && f.domain && f.mode === 'proxy' && !IN.domProxy.value) IN.domProxy.value = f.domain;
      if (f && f.mode === 'cloudflare' && f.cloudflare) { if (f.cloudflare.zone && !IN.zone.value) IN.zone.value = f.cloudflare.zone; if (f.cloudflare.sub && IN.sub.value === 'chibi') IN.sub.value = f.cloudflare.sub; }
      clear(box); if (!opts.embed) clear($('actions'));
      var reB = h('button', { class: 'btn', id: 'olRecheck', disabled: v.busy || !f || f.mode === 'off', onclick: function () { post('recheck', {}).then(function (x) { if (x) after(x); }); } }, _t('Kiểm lại'));
      var offB = h('button', { class: 'btn danger', id: 'olOffBtn', disabled: v.busy && !S.off, onclick: function () { S.off = true; render(S.v); var o = $('olOffPanel'); if (o) o.scrollIntoView({ block: 'nearest' }); } }, _t('Ngắt mạng (Go offline)'));
      // Go offline chỉ khi có gì đang ra ngoài để gỡ (CNS-211): đang online · publicUrl bật tạm · tunnel bật · luồng Cloudflare đã tạo tunnel (dọn ở Cloudflare)
      var tunOk = f && f.mode === 'cloudflare' && f.steps.some(function (s) { return s.id === 'tunnel' && s.state === 'ok'; });
      var anyOn = v.mode !== 'off' || !!v.publicUrlPending || ((v.edge || {}).intent && v.edge.intent !== 'off') || tunOk;
      if (opts.embed) { if ((f && f.mode !== 'off') || anyOn) box.appendChild(h('div', { class: 'row', style: 'justify-content:flex-end;gap:8px' }, f && f.mode !== 'off' ? reB : null, anyOn ? offB : null)); }
      else actions(f && f.mode !== 'off' ? reB : null, anyOn ? offB : null);
      if (S.err) box.appendChild(h('div', { class: 'banner bad', role: 'alert', id: 'olErr' }, h('span', { text: '✗ ' + S.err }), h('button', { class: 'btn sm', onclick: function () { S.err = ''; render(S.v); } }, _t('Đóng'))));
      // ---- trạng thái hiện tại
      var es = (v.edge || {}).status, edgeTxt;
      if ((v.edge || {}).intent === 'off' && (!es || !es.running)) edgeTxt = h('span', { class: 'row' }, h('span', { class: 'chip', text: _t('Tunnel tắt') }));
      else if (!es) edgeTxt = h('span', { class: 'row' }, h('span', { class: 'chip warn', text: '… ' + _t('Chờ launcher báo trạng thái tunnel') }));
      else if (es.error) edgeTxt = h('span', { class: 'row' }, h('span', { class: 'chip bad', text: '✗ ' + _t('Tunnel lỗi') }), h('span', { class: 'note', id: 'olEdgeErr', text: edgeErr(es.error) }));
      else if (es.ready) edgeTxt = h('span', { class: 'row' }, h('span', { class: 'chip ok', text: '✓ ' + _t('Tunnel sẵn sàng') }), es.since ? h('span', { class: 'note', text: _t('từ {at}', { at: fmtTime(es.since) }) }) : null);
      else edgeTxt = h('span', { class: 'row' }, h('span', { class: 'chip warn', text: '… ' + (es.running ? _t('Tunnel đang kết nối') : _t('Tunnel đang khởi động')) }));
      box.appendChild(h('div', { class: 'panel', id: 'olStatus' }, h('h3', null, _t('Trạng thái'), v.busy ? h('span', { class: 'r chip warn', id: 'olBusy', text: '… ' + _t('đang chạy — tự cập nhật mỗi giây') }) : null),
        h('div', { class: 'pad kv' },
          h('label', { text: _t('Chế độ') }), h('div', { class: 'row' }, h('span', { class: 'chip ' + (v.mode === 'off' ? '' : 'ok'), id: 'olMode', 'data-mode': v.mode, text: _t(OL_MODE[v.mode] || v.mode) }), (v.mode === 'caddy' || v.mode === 'cloudflare') ? h('span', { class: 'tag badge', text: 'beta' }) : null),
          h('label', { text: _t('Địa chỉ công khai') }), h('div', { class: 'row' }, h('span', { class: 'mono', id: 'olPub', text: v.publicUrl || '—' }), v.publicUrlPending ? h('span', { class: 'chip warn', text: _t('đang bật tạm: {url}', { url: v.publicUrlPending }) }) : null),
          h('label', { text: _t('Tunnel cloudflared') }), edgeTxt,
          h('label', { text: _t('Bản cài') }), h('span', { class: 'note', text: (v.edge || {}).docker ? _t('Docker · edge Caddy {state}', { state: (v.edge || {}).caddyEnabled ? _t('đã bật') : _t('chưa bật') }) : _t('Native (không Docker) — đường Caddy cần bản Docker') }))));
      // ---- máy kế thừa: .env chỉ đọc + Migrate
      if (lg.active) box.appendChild(h('div', { class: 'banner warn', id: 'olLegacy' },
        h('span', null, h('b', { text: _t('Máy đang cấu hình ra ngoài bằng .env (chỉ đọc).') }), ' ', _t('GC_PUBLIC_URL = {url} · GC_ALLOWED_HOSTS = {hosts}. Di chuyển sang Go online để quản lý ở đây — .env không bị sửa, địa chỉ công khai và kết nối agent giữ nguyên.', { url: lg.publicUrl || '—', hosts: lg.allowedHosts || '—' })),
        h('button', { class: 'btn primary sm', id: 'olMigrate', disabled: v.busy, onclick: function () { post('migrate', {}).then(function (x) { if (x) { if (x.s === 200) toast(_t('Đã di chuyển cấu hình .env vào Go online.')); after(x); } }); } }, _t('Di chuyển (Migrate)'))));
      // ---- hỏi trước khi đổi địa chỉ công khai (OAuth thu hồi kết nối của địa chỉ cũ)
      if (S.ask) box.appendChild(h('div', { class: 'banner warn', id: 'olAsk', role: 'alertdialog' },
        h('span', { text: S.ask.from ? _t('Đổi địa chỉ công khai từ {from} sang {to}: {n} kết nối agent (OAuth) sẽ bị gỡ và phải nối lại.', { from: S.ask.from, to: S.ask.to || _t('địa chỉ mới'), n: S.ask.revokes }) : _t('Bật địa chỉ công khai mới {to}: {n} kết nối agent (OAuth) cũ sẽ bị gỡ và phải nối lại.', { to: S.ask.to || _t('địa chỉ mới'), n: S.ask.revokes }) }),
        h('button', { class: 'btn primary sm', id: 'olAskYes', onclick: function () { var a = S.ask; S.ask = null; start(a.id, a.body); } }, _t('Đổi và tiếp tục')),
        h('button', { class: 'btn sm', onclick: function () { S.ask = null; render(S.v); } }, _t('Huỷ'))));
      // ---- mọi bậc ✓ nhưng chính thức hoá địa chỉ mới sẽ gỡ kết nối agent cũ (link tạm / Cloudflare không ghi tên miền — luồng không biết địa chỉ lúc bắt đầu): hỏi
      if (f && f.needs === 'urlChange' && !f.done) box.appendChild(h('div', { class: 'banner warn', id: 'olAskFinish', role: 'alertdialog' },
        h('span', { text: _t('Bật địa chỉ công khai mới {to}: {n} kết nối agent (OAuth) cũ sẽ bị gỡ và phải nối lại.', { to: f.url || _t('địa chỉ mới'), n: f.revokes || 0 }) }),
        h('button', { class: 'btn primary sm', id: 'olAskFinishYes', disabled: v.busy, onclick: function () { post('recheck', { confirmUrlChange: true }).then(function (x) { if (x) after(x); }); } }, _t('Đổi và tiếp tục'))));
      // ---- máy v0.21 / v0.22 nâng cấp lúc "online tạm, chờ mật khẩu": chỉ còn thiếu tài khoản chủ — đặt (genchibi password) là app tự hoàn tất
      if (f && f.waitingOwner) box.appendChild(h('div', { class: 'banner warn', id: 'olWaitOwner', role: 'status' },
        h('span', { text: _t('Sắp xong: {url} đang bật tạm, chờ tài khoản chủ — trên máy chủ chạy genchibi password; xong là app tự hoàn tất lên mạng.', { url: v.publicUrlPending || f.url || '—' }) })));
      // ---- Go offline: hỏi trước, liệt kê hệ quả; đường Cloudflare xin token để dọn tunnel + CNAME
      if (S.off) {
        var cfNeed = (v.mode === 'cloudflare' || (f && f.mode === 'cloudflare')) && !(v.cloudflare || {}).tokenKept && !(v.cloudflare || {}).tokenInMemory;
        box.appendChild(h('div', { class: 'panel', id: 'olOffPanel' }, h('h3', null, _t('Ngắt mạng (Go offline)?')),
          h('div', { class: 'pad stack' },
            h('ul', { style: 'margin:0;padding-left:18px' },
              h('li', { text: _t('Bỏ địa chỉ công khai {url}: Studio và MCP chỉ còn ở máy này.', { url: v.publicUrl || v.publicUrlPending || '—' }) }),
              h('li', { text: _t('Dừng tunnel cloudflared và bỏ site của edge Caddy (nếu có).') }),
              h('li', { text: _t('Agent nối qua Internet (claude.ai…) mất kết nối tới khi bật lại.') })),
            cfNeed ? h('div', { class: 'stack', style: 'gap:6px' }, h('label', { class: 'note', for: 'olOffToken', text: _t('Dán API token Cloudflare để app xoá tunnel + CNAME đã tạo. Để trống: app chỉ tắt trên máy, bạn xoá tay ở dash.cloudflare.com sau.') }), IN.offTok) : null,
            h('div', { class: 'row' },
              h('button', { class: 'btn danger', id: 'olOffYes', onclick: function () {
                var b = {}, t = IN.offTok.value.trim(); IN.offTok.value = ''; if (t) b.token = t; t = '';
                S.off = false; post('off', b).then(function (x) { delete b.token; if (x) after(x); });
              } }, _t('Ngắt mạng')),
              h('button', { class: 'btn', onclick: function () { S.off = false; IN.offTok.value = ''; render(S.v); } }, _t('Huỷ'))))));
      }
      // ---- trang Xong
      if (f && f.done && f.mode !== 'off' && f.mode === v.mode && v.publicUrl) box.appendChild(donePanel(v, f));
      // ---- xác nhận đè bản ghi DNS (đường B)
      if (f && f.needs === 'confirm' && f.conflicts) box.appendChild(h('div', { class: 'banner warn', id: 'olConfirm', role: 'alertdialog' },
        h('span', null, h('b', { text: _t('{host} đã có bản ghi DNS khác:', { host: f.domain }) }), ' ', f.conflicts.map(function (c) { return c.type + ' ' + c.content; }).join(', '), ' — ', _t('app không tự đè. Thay bằng CNAME tới tunnel, hay chọn tên con khác?')),
        h('button', { class: 'btn primary sm', id: 'olOverwrite', disabled: v.busy, onclick: function () { post('cloudflare/confirm', { overwriteCname: true }).then(function (x) { if (x) after(x); }); } }, _t('Thay bằng CNAME')),
        h('button', { class: 'btn sm', id: 'olOtherSub', disabled: v.busy, onclick: function () { post('cloudflare/confirm', { overwriteCname: false }).then(function (x) { if (x) { S.pick = 'cloudflare'; after(x); IN.sub.select(); } }); } }, _t('Chọn tên con khác'))));
      // ---- chọn đường + form
      box.appendChild(pathsPanel(v, locked));
      if (v.snippets) box.appendChild(snippetPanel(v.snippets));
      // ---- lưới bậc
      if (f) box.appendChild(stepsPanel(v, f));
      if (opts.onRender) opts.onRender(v);
    }
    function pathsPanel(v, locked) {
      var f = v.flow, grid = h('div', { class: 'olpaths', role: 'radiogroup', 'aria-label': _t('Chọn đường lên mạng') });
      OL_PATHS.forEach(function (p) {
        var off = locked || (p.id === 'caddy' && !(v.edge || {}).docker);
        grid.appendChild(h('button', { type: 'button', class: 'olpath', role: 'radio', 'data-path': p.id, 'aria-checked': S.pick === p.id ? 'true' : 'false', disabled: off,
          onclick: function () { S.pick = p.id; S.err = ''; render(S.v); var x = p.id === 'caddy' ? IN.domCaddy : p.id === 'proxy' ? IN.domProxy : p.id === 'cloudflare' ? IN.token : null; if (x) x.focus(); } },
          h('span', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: _t(p.name) }), p.beta ? h('span', { class: 'tag badge', title: _t('Chưa nghiệm thu trên máy thật — báo lỗi giúp nếu gặp'), text: 'beta' }) : null),
          h('span', { class: 'note', text: _t(p.how) }),
          h('ul', null, p.need.map(function (n) { return h('li', { text: _t(n) }); })),
          h('span', { class: 'olyou', text: _t(p.you) })));
      });
      var panel = h('div', { class: 'panel', id: 'olPaths' }, h('h3', null, f && f.done && f.mode !== 'off' ? _t('Đổi đường lên mạng') : _t('Chọn cách đưa máy lên mạng'), h('span', { class: 'r note', text: _t('một lần thiết lập · Studio + MCP có HTTPS') })), h('div', { class: 'pad stack' }, grid));
      if (S.pick && !locked) panel.lastChild.appendChild(formOf(S.pick, v));
      return panel;
    }
    function field(label, el, note) { return h('label', { style: 'display:grid;gap:4px' }, h('span', { class: 'note', text: label }), el, note ? h('span', { class: 'note', text: note }) : null); }
    function goBtn(id, text) { return h('button', { class: 'btn primary', type: 'submit', id: 'olGo' }, text); }
    function formOf(id, v) {
      var cf = v.cloudflare || {}, f = v.flow, body = [];
      if (id === 'caddy') body.push(field(_t('Tên miền'), IN.domCaddy, _t('Trước khi bấm: tạo bản ghi A của tên miền trỏ về IP công khai của máy (tắt proxy cam nếu tên miền ở Cloudflare). Edge Caddy chưa bật thì app báo đúng một lệnh chạy trên máy chủ.')), h('div', { class: 'row' }, goBtn(id, _t('Bắt đầu với Caddy'))));
      else if (id === 'proxy') {
        // CNS-128: Studio đang mở qua tên miền (proxy riêng của chủ đã chạy) → một nút điền đúng tên đó
        var here = location.protocol === 'https:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && location.hostname !== String(IN.domProxy.value || '') ? location.hostname : '';
        body.push(field(_t('Tên miền'), IN.domProxy, _t('Tên miền mà proxy của bạn đang phục vụ (HTTPS). App in đoạn cấu hình mẫu rồi kiểm từ ngoài vào.')),
          here ? h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', id: 'olUseHere', onclick: function () { IN.domProxy.value = here; render(S.v); } }, _t('Dùng địa chỉ đang mở ({host})', { host: here }))) : null,
          h('div', { class: 'row' }, goBtn(id, _t('Kiểm proxy của tôi'))));
      }
      else if (id === 'quick') body.push(h('div', { class: 'note', text: _t('Mở một link *.trycloudflare.com ngay — tiện để thử; link đổi mỗi lần khởi động lại, agent nối bằng OAuth sẽ phải nối lại. Dùng lâu dài: đường Cloudflare hoặc Caddy.') }), h('div', { class: 'row' }, goBtn(id, _t('Mở link tạm'))));
      else {
        var choices = f && f.mode === 'cloudflare' && f.choices && f.choices.length ? f.choices : null;
        if (choices) { var cur = IN.zoneSel.value; clear(IN.zoneSel); choices.forEach(function (z) { IN.zoneSel.appendChild(h('option', { value: z, selected: z === cur ? '' : null }, z)); }); }
        body.push(
          h('ol', { class: 'note', style: 'margin:0;padding-left:18px;display:grid;gap:2px', id: 'olHowto' },
            h('li', null, _t('Bấm "Mở trang tạo token" — quyền đã điền sẵn: Account › Cloudflare Tunnel › Edit · Zone › Zone › Read · Zone › DNS › Edit · Zone › WAF › Edit (tuỳ chọn — để app tự mở đường cho claude.ai).')),
            h('li', null, _t('Zone Resources: chọn tên miền của bạn (hoặc All zones).')),
            h('li', null, _t('TTL: đặt hạn ngắn (vd 1 ngày) — app chỉ dùng token lúc thiết lập rồi xoá khỏi máy.')),
            h('li', null, _t('Create Token → chép token → dán vào ô dưới.'))),
          h('div', { class: 'row' }, h('a', { class: 'btn', id: 'olTokenLink', href: cf.tokenLink || 'https://dash.cloudflare.com/profile/api-tokens', target: '_blank', rel: 'noopener noreferrer' }, _t('Mở trang tạo token ↗'))),
          field(_t('API token Cloudflare'), IN.token, cf.tokenInMemory ? _t('App đang giữ token vừa dán trong bộ nhớ (tối đa 30 phút) — để trống để dùng tiếp.') : _t('Chỉ nằm trong ô này tới khi gửi; app giữ trong bộ nhớ lúc thiết lập rồi bỏ.')),
          h('div', { class: 'olcf2' }, field(_t('Tên miền ở Cloudflare'), choices ? IN.zoneSel : IN.zone, choices ? _t('Token thấy nhiều tên miền — chọn một.') : null), field(_t('Tên con'), IN.sub, _t('Địa chỉ sẽ là <tên con>.<tên miền>, mặc định chibi.'))),
          h('label', { class: 'row' }, IN.keep, h('span', { class: 'note', text: _t('Giữ token (mã hoá trên máy) để Go offline tự dọn Cloudflare — không chọn thì app bỏ token khi xong.') })),
          h('div', { class: 'row' }, goBtn(id, _t('Bắt đầu với Cloudflare'))));
      }
      return h('form', { class: 'stack olform', id: 'olForm', 'data-path': id, novalidate: true, onsubmit: function (ev) { ev.preventDefault(); start(id); } }, body);
    }
    function snippetPanel(sn) {
      var one = function (label, text, id) { return h('div', { class: 'stack', style: 'gap:6px' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: label }), h('button', { class: 'btn sm', type: 'button', id: id, onclick: function () { copyText(text, label); } }, _t('Chép'))), h('pre', { class: 'code', 'data-user-content': '', text: text })); };
      return h('div', { class: 'panel', id: 'olSnippets' }, h('h3', null, _t('Đoạn cấu hình mẫu cho proxy của bạn'), h('span', { class: 'r note', text: _t('đường máy (MCP, OAuth) đi thẳng · đường người qua đăng nhập') })),
        h('div', { class: 'pad olsnip' }, one('Caddy', sn.caddy, 'olCopyCaddy'), one('nginx', sn.nginx, 'olCopyNginx')));
    }
    function stepsPanel(v, f) {
      var hasAct = f.steps.some(function (s) { return s.manual && s.id === 'waf' && s.state === 'fail'; });   // cột thao tác chỉ khi có bậc cần chủ bấm
      var tbl = h('table', { class: 'grid olsteps', id: 'olSteps' }), cols = [_t('Bậc'), _t('Trạng thái'), _t('Chi tiết'), _t('Cách sửa'), _t('Lúc')].concat(hasAct ? [_t('Thao tác')] : []);   // cột nào cũng có tiêu đề + chữ cột (STD-07, CNS-208a)
      tbl.appendChild(h('tr', { class: 'letters' }, h('td'), cols.map(function (c, i) { return h('td', { text: c ? String.fromCharCode(65 + i) : '' }); })));
      tbl.appendChild(h('tr', null, h('th', { text: 'ID' }), cols.map(function (c) { return h('th', { text: c }); })));
      var n = { ok: 0, fail: 0 };
      f.steps.forEach(function (s, i) {
        var st = OL_STATE[s.state] || OL_STATE.pending; if (n[s.state] !== undefined) n[s.state]++;
        var act = s.manual && s.id === 'waf' && s.state === 'fail' ? h('button', { class: 'btn sm primary', id: 'olWafDone', disabled: v.busy, onclick: function () { post('recheck', { confirmManual: 'waf' }).then(function (x) { if (x) after(x); }); } }, _t('Tôi đã làm')) : null;
        tbl.appendChild(h('tr', { 'data-step': s.id, 'data-state': s.state },
          h('td', { class: 'id', text: 'GO-' + String(i + 1).padStart(2, '0') }),
          h('td', { class: 'olstep' }, h('b', { text: _t(olStep(f.mode, s.id)) })),   // tên bậc xuống dòng được: phông rộng (DejaVu) không đẩy cột cuối ra khỏi lưới
          h('td', { class: 'nw' }, h('span', { class: 'chip ' + st[0], text: st[1] + ' ' + _t(st[2]) })),
          h('td', { class: 'wrap', text: s.detail || '' }, s.expires ? h('div', { class: 'note', text: _t('hết hạn {at}', { at: fmtTime(s.expires) }) }) : null),
          // biểu thức luật WAF dài: chữ trong câu rút thành "(…)", bản đầy đủ ở ô mã cuộn được + nút chép (fixCopies)
          h('td', { class: 'wrap' }, s.fix ? h('span', { text: s.fix.replace(/\(http\.host eq [^]*?\}\)\)/, '(…)') }) : h('span', { class: 'note', text: '—' }), s.fix ? fixCopies(s.fix) : null),
          h('td', { class: 'nw note mono', text: fmtClock(s.at) }),
          hasAct ? h('td', { class: 'nw' }, act) : null));
      });
      var title = f.mode === 'off' ? _t('Ngắt mạng') : _t(OL_MODE[f.mode] || f.mode);
      return h('div', { class: 'panel', id: 'olStepsPanel' }, h('h3', null, _t('Các bậc · {mode}', { mode: title }), f.domain ? h('span', { class: 'r mono note', text: f.mode === 'quick' && f.url ? f.url : f.domain }) : null),
        h('div', { class: 'scroll' }, tbl),
        h('div', { class: 'olfoot note', id: 'olFoot' }, h('span', { text: _t('{n} bậc · {ok} đạt · {bad} lỗi', { n: f.steps.length, ok: n.ok, bad: n.fail }) }), h('span', { text: v.busy ? _t('đang chạy…') : f.done ? _t('xong lúc {at}', { at: fmtClock(f.doneAt) }) : f.waitingOwner ? _t('chờ tài khoản chủ — genchibi password trên máy chủ') : f.needs === 'urlChange' ? _t('chờ bạn xác nhận đổi địa chỉ') : _t('dừng ở bậc lỗi — sửa rồi bấm Kiểm lại') }), h('span', { class: 'mono', text: _t('cập nhật {at}', { at: fmtClock(new Date().toISOString()) }) })));
    }
    function donePanel(v, f) {
      var url = v.publicUrl, mcpUrl = url + '/mcp', cert = f.steps.filter(function (s) { return s.id === 'cert' && s.expires; })[0], es = (v.edge || {}).status;
      var copyRow = function (id, text, what) { return h('div', { class: 'row' }, h('a', { class: 'mono', id: id, href: text, target: '_blank', rel: 'noopener noreferrer', text: text }), h('button', { class: 'btn sm', type: 'button', id: id + 'Copy', onclick: function () { copyText(text, what); } }, _t('Chép'))); };
      return h('div', { class: 'panel', id: 'olDone' }, h('h3', null, '✓ ' + _t('Xong — máy đã lên mạng'), h('span', { class: 'r note', text: _t('xong lúc {at}', { at: fmtTime(f.doneAt) }) })),
        h('div', { class: 'pad kv' },
          h('label', { text: 'Studio' }), copyRow('olDoneStudio', url, 'Studio'),
          h('label', { text: 'MCP' }), copyRow('olDoneMcp', mcpUrl, _t('địa chỉ MCP')),
          opts.embed ? null : h('label', { text: _t('Bước tiếp') }), opts.embed ? null : h('div', { class: 'row' }, h('span', { text: _t('Nối claude.ai / agent: làm theo các bước ở Hệ thống › Kết nối agent.') }), h('button', { class: 'btn primary sm', id: 'olToConnect', onclick: function () { go({ page: 'connect' }); } }, _t('Mở Kết nối agent ›'))),
          h('label', { text: _t('Trạng thái sống') }), h('div', { class: 'row' },
            f.mode === 'cloudflare' || f.mode === 'quick' ? (es && es.ready ? h('span', { class: 'chip ok', text: '✓ ' + _t('Tunnel sẵn sàng') }) : es && es.error ? h('span', { class: 'chip bad', text: '✗ ' + edgeErr(es.error) }) : h('span', { class: 'chip warn', text: '… ' + _t('Tunnel đang kết nối') })) : null,
            cert ? h('span', { class: 'chip ok', text: _t('Chứng chỉ hết hạn {at}', { at: fmtTime(cert.expires) }) }) : null,
            h('button', { class: 'btn sm', onclick: function () { post('recheck', {}).then(function (x) { if (x) after(x); }); }, disabled: v.busy }, _t('Kiểm lại'))),
          f.mode === 'quick' ? h('label', { text: _t('Lưu ý') }) : null, f.mode === 'quick' ? h('span', { class: 'note', text: _t('Link tạm đổi mỗi lần máy khởi động lại — đừng dùng cho kết nối OAuth lâu dài.') }) : null,
          h('label'), h('div', { class: 'row' }, h('button', { class: 'btn danger sm', id: 'olDoneOff', onclick: function () { S.off = true; render(S.v); } }, _t('Ngắt mạng (Go offline)')))));
    }
    load();
  }

  /* ============================================================ trang: Tài khoản chủ (v0.21, spec v021 §3.3 / §3.7, CNS-183) */
  // Đổi mật khẩu (phiên S phải nhập mật khẩu hiện tại; đổi = thu hồi MỌI phiên + thiết bị khác, trình duyệt này nhận phiên mới) · lưới phiên + thiết bị (thu hồi
  // từng cái) · cảnh báo đăng nhập bị chặn tạm (Đã xem) · token chủ: chỉ nói cách xem bằng lệnh, KHÔNG hiện token.
  function uaShort(ua) {
    ua = String(ua || ''); if (!ua) return '—';
    var b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici/i.test(ua) ? 'CLI' : '';
    var o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return b || o ? [b, o].filter(Boolean).join(' · ') : ua.slice(0, 40);
  }
  PAGES.account = function () {
    crumbs([{ t: _t('Tài khoản chủ') }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel empty', text: _t('Tài khoản chủ chỉ có ở bản cài trên máy.') })); return; }
    var box = h('div', { class: 'stack', id: 'acBox' }), left = false;
    $('view').appendChild(box);
    onLeave(function () { left = true; });
    function load() {
      return Promise.all([Store.api('GET', 'api/auth/sessions'), Store.api('GET', 'api/info')]).then(function (r) { if (left) return; Store.info = r[1]; Auth.paint(); render(r[0], r[1].auth || {}); })
        .catch(function (e) { if (left) return; clear(box); box.appendChild(h('div', { class: 'banner bad', role: 'alert' }, h('span', { text: e.message }), h('button', { class: 'btn sm', onclick: load }, _t('Thử lại')))); });
    }
    function revoke(kind, id, text) {
      if (!window.confirm(text)) return;
      Store.api('POST', 'api/auth/' + kind + '/' + encodeURIComponent(id) + '/revoke', {}).then(function () { toast(_t('Đã thu hồi.')); load(); }).catch(function (e) { toast(e.message); load(); });
    }
    function grid(id, cols, rows, empty) {
      var t = h('table', { class: 'grid', id: id });
      t.appendChild(h('tr', { class: 'letters' }, h('td'), cols.map(function (c, i) { return h('td', { text: c ? String.fromCharCode(65 + i) : '' }); })));
      t.appendChild(h('tr', null, h('th', { text: 'ID' }), cols.map(function (c) { return h('th', { text: c }); })));
      rows.forEach(function (r) { t.appendChild(r); });
      return rows.length ? h('div', { class: 'scroll' }, t) : h('div', { class: 'pad note', text: empty });
    }
    function render(ss, a) {
      clear(box);
      // ---- mật khẩu
      var pwBox = h('div', { class: 'pad stack' });
      // chưa có mật khẩu: vào bằng token (máy kế thừa) → đặt ngay ở đây; không thì trên máy chủ
      if (!a.password && a.owner !== 'T') pwBox.appendChild(h('div', { class: 'row' }, h('span', { class: 'chip warn', text: _t('Chưa có mật khẩu chủ') }), h('span', { class: 'note', text: _t('Trên máy chủ chạy genchibi password (tên đăng nhập owner — đổi được ở đây sau đó).') })));
      else {
        var minLen = a.minLength || 12, useS = a.owner === 'S';
        var cur = h('input', { type: 'password', id: 'acCur', autocomplete: 'current-password', style: 'width:100%' }), p1 = h('input', { type: 'password', id: 'acPw', autocomplete: 'new-password', style: 'width:100%' }), p2 = h('input', { type: 'password', id: 'acPw2', autocomplete: 'new-password', style: 'width:100%' });
        var err = h('div', { role: 'alert', id: 'acErr', hidden: true, style: 'color:var(--danger);font-size:12px' }), btn = h('button', { class: 'btn primary', type: 'submit', id: 'acSave' }, _t('Đổi mật khẩu'));
        var bad = function (m) { err.hidden = false; err.textContent = '✗ ' + m; btn.disabled = false; };
        var fl = function (label, el) { return h('label', { style: 'display:grid;gap:4px' }, h('span', { class: 'note', text: label }), el); };
        pwBox.appendChild(h('form', { class: 'stack accpw', novalidate: true, onsubmit: function (ev) {
          ev.preventDefault(); err.hidden = true; btn.disabled = true;
          if (Array.from(p1.value).length < minLen) return bad(_t('Mật khẩu cần ít nhất {n} ký tự', { n: minLen }));
          if (p1.value !== p2.value) return bad(_t('Hai lần nhập mật khẩu không khớp'));
          Auth.post('api/auth/password', useS ? { current: cur.value, password: p1.value } : { password: p1.value }, useS ? '' : Store.token()).then(function (x) {
            if (x.s !== 200) return bad(x.j.error || _t('Lỗi {status}', { status: x.s }));
            cur.value = ''; p1.value = ''; p2.value = '';
            toast(_t('Đã đổi mật khẩu — đã thu hồi {n} phiên; trình duyệt này vẫn đăng nhập.', { n: x.j.revoked || 0 }));
            load();
          }).catch(function (e) { bad(e.message); });
        } },
          useS ? fl(_t('Mật khẩu hiện tại'), cur) : h('div', { class: 'note', text: _t('Bạn đang vào bằng token của bản cài — đổi mật khẩu không cần mật khẩu hiện tại.') }),
          h('div', { class: 'accpw2' }, fl(_t('Mật khẩu mới (ít nhất {n} ký tự — gợi ý: một cụm từ dễ nhớ)', { n: minLen }), p1), fl(_t('Nhập lại mật khẩu'), p2)),
          err, h('div', { class: 'row' }, btn, h('span', { class: 'note', text: _t('Đổi mật khẩu thu hồi mọi phiên và thiết bị khác (cả kẻ lạ nếu mật khẩu cũ đã lộ); trình duyệt này đăng nhập lại ngay.') }))));
      }
      // ---- hồ sơ chủ (v0.23 §A.2, CNS-260 / CNS-267): tên đăng nhập (chỉ là nhãn — id nội bộ luôn "owner", OAuth / MCP không đổi) · tên hiển thị · email Let's Encrypt
      if (a.password) {
        var uu = a.user || {}, inp2 = function (o) { return h('input', Object.assign({ style: 'width:100%', spellcheck: 'false' }, o)); };
        var pl = inp2({ id: 'acLogin', value: uu.login || '', maxlength: '32', autocomplete: 'username' }), pn = inp2({ id: 'acName', value: uu.displayName || '', maxlength: '64' }), pe = inp2({ id: 'acEmail', type: 'email', value: uu.email || '', maxlength: '254', placeholder: _t('tuỳ chọn') });
        var perr = h('div', { role: 'alert', id: 'acProfileErr', hidden: true, style: 'color:var(--danger);font-size:12px' }), pbtn = h('button', { class: 'btn primary', type: 'submit', id: 'acProfileSave' }, _t('Lưu hồ sơ'));
        var fl2 = function (label, el, note) { return h('label', { style: 'display:grid;gap:4px' }, h('span', { class: 'note', text: label }), el, note ? h('span', { class: 'note', text: note }) : null); };
        box.appendChild(h('div', { class: 'panel', id: 'acProfile' }, h('h3', null, _t('Hồ sơ chủ'), h('span', { class: 'r note', text: _t('đổi tên đăng nhập không đăng xuất ai') })),
          h('form', { class: 'pad stack', novalidate: true, onsubmit: function (ev) {
            ev.preventDefault(); perr.hidden = true; pbtn.disabled = true;
            Store.api('PUT', 'api/auth/profile', { login: pl.value.trim().toLowerCase(), displayName: pn.value.trim(), email: pe.value.trim() }).then(function () { toast(_t('Đã lưu hồ sơ chủ.')); load(); })
              .catch(function (e) { perr.hidden = false; perr.textContent = '✗ ' + e.message; pbtn.disabled = false; });
          } }, h('div', { class: 'accpw2' }, fl2(_t('Tên đăng nhập'), pl), fl2(_t('Tên hiển thị'), pn)),
            fl2(_t('Email (tuỳ chọn)'), pe, _t('Chỉ dùng làm email liên hệ Let\'s Encrypt khi lên mạng bằng đường Caddy (áp ở lần Go online / Kiểm lại tới).')),
            perr, h('div', { class: 'row' }, pbtn))));
      }
      box.appendChild(h('div', { class: 'panel', id: 'acPassword' }, h('h3', null, _t('Mật khẩu chủ'), h('span', { class: 'r note', text: _t('Quên mật khẩu: chạy genchibi password trên máy chủ') })), pwBox));
      // ---- phiên đang mở
      var sess = (ss.sessions || []).slice().sort(function (x, y) { return (y.current ? 1 : 0) - (x.current ? 1 : 0) || String(y.seenAt).localeCompare(String(x.seenAt)); });
      var sRows = sess.map(function (s) {
        return h('tr', { 'data-session': s.id, 'data-current': s.current ? '1' : null },
          h('td', { class: 'id', text: s.id }), h('td', { class: 'acua', title: s.ua || null, text: uaShort(s.ua) }), h('td', { class: 'v', text: String(s.device || '').slice(0, 8) || '—' }),
          h('td', { class: 'nw note', text: fmtShort(s.createdAt) }), h('td', { class: 'nw note', text: fmtShort(s.seenAt) }), h('td', { class: 'nw note', text: fmtShort(s.expiresAt) }),
          // phiên của chính trình duyệt này: không thu hồi ở đây (dùng Đăng xuất) — ô hiện nhãn thay cho nút
          h('td', { class: 'nw' }, s.current ? h('span', { class: 'chip ok', title: _t('Phiên của trình duyệt này — dùng Đăng xuất'), text: _t('Phiên này') })
            : h('button', { class: 'btn sm danger', onclick: function () { revoke('sessions', s.id, _t('Thu hồi phiên {id} ({ua})?\n\nTrình duyệt đó phải đăng nhập lại.', { id: s.id, ua: uaShort(s.ua) })); } }, _t('Thu hồi'))));
      });
      box.appendChild(h('div', { class: 'panel', id: 'acSessions' }, h('h3', null, _t('Phiên đang mở'), h('span', { class: 'r note', text: _t('{n} phiên · mỗi phiên 30 ngày', { n: sess.length }) })),
        grid('acSessGrid', [_t('Trình duyệt'), _t('Thiết bị'), _t('Đăng nhập lúc'), _t('Dùng lần cuối'), _t('Hết hạn lúc'), _t('Thu hồi')], sRows, a.owner === 'T' ? _t('Chưa có phiên nào (bạn đang vào bằng token).') : _t('Chưa có phiên nào.'))));
      // ---- thiết bị đã nhớ (cookie thiết bị — miễn trần sai chung với kẻ lạ)
      var devs = (ss.devices || []).slice().sort(function (x, y) { return (y.current ? 1 : 0) - (x.current ? 1 : 0) || String(y.seenAt).localeCompare(String(x.seenAt)); });
      var dRows = devs.map(function (d) {
        return h('tr', { 'data-device': d.id, 'data-current': d.current ? '1' : null },
          h('td', { class: 'id', text: d.id.slice(0, 8) }), h('td', { class: 'nw', title: d.ua || null, text: uaShort(d.ua) }),
          h('td', { class: 'nw note', text: fmtShort(d.createdAt) }), h('td', { class: 'nw note', text: fmtShort(d.seenAt) }),
          h('td', { class: 'nw' }, d.current ? h('span', { class: 'chip ok', text: _t('Thiết bị này') }) : h('span', { class: 'chip', text: _t('Đã nhớ') })),
          h('td', { class: 'nw' }, h('button', { class: 'btn sm danger', onclick: function () { revoke('devices', d.id, d.current ? _t('Thu hồi thiết bị NÀY?\n\nMọi phiên của trình duyệt này bị huỷ — bạn sẽ phải đăng nhập lại ngay.') : _t('Thu hồi thiết bị {id} ({ua})?\n\nMọi phiên của thiết bị đó bị huỷ; lần sau nó phải đăng nhập lại.', { id: d.id.slice(0, 8), ua: uaShort(d.ua) })); } }, _t('Thu hồi'))));
      });
      box.appendChild(h('div', { class: 'panel', id: 'acDevices' }, h('h3', null, _t('Thiết bị đã nhớ'), h('span', { class: 'r note', text: _t('{n} thiết bị · trình duyệt từng đăng nhập đúng không bị khoá chung với kẻ lạ', { n: devs.length }) })),
        grid('acDevGrid', [_t('Trình duyệt'), _t('Lần đầu'), _t('Lần cuối'), _t('Trạng thái'), _t('Thu hồi')], dRows, _t('Chưa có thiết bị nào.'))));
      // ---- cảnh báo đăng nhập sai
      var al = a.alerts || [];
      var aRows = al.slice().reverse().map(function (e) {
        return h('tr', { 'data-alert': e.id },
          h('td', { class: 'id', text: e.id }), h('td', { class: 'nw note', text: fmtShort(e.at) }), h('td', { class: 'nw', text: e.kind === 'setup' ? _t('Mã setup') : _t('Đăng nhập') }),
          h('td', { class: 'v', text: String(e.failures) }), h('td', { class: 'v', text: String(e.ips) }), h('td', { class: 'mono note', text: (e.sample || []).join(', ') || '—' }), h('td', { class: 'nw note', text: fmtShort(e.until) }));
      });
      box.appendChild(h('div', { class: 'panel', id: 'acAlerts' }, h('h3', null, _t('Cảnh báo đăng nhập sai'), h('span', { class: 'r' }, al.length ? h('button', { class: 'btn sm', id: 'acAck', onclick: function () {
          Store.api('POST', 'api/auth/alerts/ack', {}).then(function () { toast(_t('Đã đánh dấu đã xem.')); load(); }).catch(function (e) { toast(e.message); });
        } }, _t('Đã xem')) : null)),
        grid('acAlertGrid', [_t('Lúc'), _t('Loại'), _t('Số lần sai'), _t('Số địa chỉ'), _t('Địa chỉ gần nhất'), _t('Chặn tới')], aRows, _t('Không có cảnh báo mới. Khi nhiều lần sai từ nơi lạ làm đăng nhập bị chặn tạm, cảnh báo hiện ở đây tới khi bạn bấm Đã xem.'))));
      // ---- token chủ: không hiện
      box.appendChild(h('div', { class: 'panel', id: 'acToken' }, h('h3', null, _t('Token chủ')), h('div', { class: 'pad stack' },
        // CNS-200: KHÔNG có lệnh in token chủ (`genchibi token` là token GitHub) — chỉ đúng chỗ đọc trên máy chủ + lệnh in sẵn cấu hình nối agent
        h('div', null, _t('Token chủ dùng cho CLI / agent nằm trên máy chủ:'), ' ', h('code', { class: 'mono', text: 'GC_API_TOKEN' }), ' ', _t('trong .env của thư mục cài, hoặc'), ' ', h('code', { class: 'mono', text: 'data/owner-token' }), ' ', _t('(khi .env không đặt) — CLI tự đọc. Cấu hình nối agent in sẵn:'), ' ', h('code', { class: 'mono', text: 'genchibi agent connect' }), '.'),
        h('div', { class: 'note', text: a.tokenSource === 'env' ? _t('Nguồn: GC_API_TOKEN trong .env. Token không bao giờ hiện trong Studio.') : _t('Nguồn: data/owner-token (server tự sinh). Token không bao giờ hiện trong Studio.') }))));
    }
    load();
  };

  /* ============================================================ trang: Ngôn ngữ (ADR 0007) */
  // Hai tầng: lựa chọn của NGƯỜI DÙNG (trình duyệt này, gc-lang) và mặc định của MÁY (settings.uiLang — người mới mở Studio, câu trả lời API khi không có lựa chọn).
  PAGES.lang = function () {
    crumbs([{ t: _t('Ngôn ngữ') }]);
    var mine = h('div', { class: 'pad stack' }), box = h('div', { class: 'stack' },
      h('div', { class: 'panel', 'data-anchor': 'panel:lang-mine' }, h('h3', null, _t('Ngôn ngữ của bạn')), mine));
    paintLangSwitch(mine, false);
    mine.appendChild(h('p', { class: 'note', text: _t('Có hiệu lực ngay và nhớ trên trình duyệt này. Nút EN | VI ở chân thanh bên đổi nhanh ở mọi trang.') }));
    mine.appendChild(h('p', { class: 'note', text: _t('Nội dung bạn tạo (tên nhân vật, kịch bản, lời thoại) không bị dịch.') }));
    if (Store.mode === 'server') {
      var cur = I18N.norm(((Store.info || {}).settings || {}).uiLang) || (Store.info || {}).uiLang || I18N.DEFAULT;
      var sel = h('select', { id: 'uiLangDefault', 'aria-label': _t('Ngôn ngữ mặc định của máy'), onchange: function () {
        Store.api('PUT', 'api/settings', { uiLang: sel.value }).then(function (s) {
          if (Store.info) { Store.info.settings = s; Store.info.uiLang = s.uiLang; }
          toast(_t('Đã đặt ngôn ngữ mặc định của máy: {lang}.', { lang: Lang.NAMES[s.uiLang] || s.uiLang }));
        }).catch(function (e) { toast(e.message); sel.value = cur; });
      } });
      I18N.LANGS.forEach(function (l) { sel.appendChild(h('option', { value: l, lang: l, selected: l === cur ? '' : null }, Lang.NAMES[l])); });
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Mặc định của máy')), h('div', { class: 'pad stack' },
        h('div', { class: 'row' }, sel),
        h('p', { class: 'note', text: _t('Dùng cho người chưa chọn ngôn ngữ và cho câu trả lời của API. Trình cài đặt đặt sẵn bằng --lang hoặc GC_LANG.') }))));
    }
    $('view').appendChild(box);
  };

  /* ============================================================ trang: Cập nhật */
  PAGES.update = function () {
    crumbs([{ t: _t('Cập nhật') }]);
    if (Store.mode !== 'server') { $('view').appendChild(h('div', { class: 'panel empty', text: _t('Bản xem thử không tự cập nhật. Cài bản chạy trên máy bằng một lệnh trong README để có cập nhật tự động.') })); return; }
    var box = h('div', { class: 'stack' });
    $('view').appendChild(box);
    function load() { Store.api('GET', 'api/update').then(render).catch(function (e) { clear(box); box.appendChild(h('div', { class: 'panel empty', text: e.message })); }); }
    function render(s) {
      clear(box);
      updateBadge = s.available ? s.latest : false; renderNav();
      var auto = h('input', { type: 'checkbox', checked: !!(s.settings && s.settings.autoUpdate), onchange: function () {
        Store.api('PUT', 'api/settings', { autoUpdate: auto.checked }).then(function () { toast(auto.checked ? _t('Đã bật tự cập nhật.') : _t('Đã tắt tự cập nhật: chỉ báo khi có bản mới.')); });
      } });
      var checkB = h('button', { class: 'btn', onclick: function () {
        checkB.disabled = true; checkB.textContent = _t('Đang kiểm tra…');
        Store.api('POST', 'api/update/check').then(render).catch(function (e) { toast(e.message); checkB.disabled = false; checkB.textContent = _t('Kiểm tra phiên bản'); });
      } }, _t('Kiểm tra phiên bản'));
      var applyB = h('button', { class: 'btn primary', disabled: !s.available && !s.newer, onclick: function () {
        applyB.disabled = true; applyB.textContent = _t('Đang tải bản mới…');
        Store.api('POST', 'api/update/apply', { force: !s.available && !!s.newer }).then(function (r) { toast(r.message); if (r.restart) waitRestart(s.latest); else load(); })
          .catch(function (e) { toast(e.message); load(); });
      } }, s.available ? _t('Cập nhật ngay lên {latest}', { latest: s.latest }) : (s.newer ? _t('Thử lại {latest}', { latest: s.latest }) : _t('Cập nhật ngay')));
      var cur = 'v' + String(s.current).replace(/^v/, '');
      var status = s.available ? h('span', { class: 'chip warn', text: _t('Có bản mới {latest}', { latest: s.latest }) })
        : s.skipped ? h('span', { class: 'chip bad', text: _t('{latest} đã bị bỏ qua vì lần trước chạy lỗi', { latest: s.latest }) })
          : s.latest ? h('span', { class: 'chip ok', text: _t('Đang dùng bản mới nhất') }) : h('span', { class: 'chip', text: _t('Chưa kiểm tra') });
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Phiên bản')), h('div', { class: 'pad kv' },
        h('label', { text: _t('Đang chạy') }), h('b', { class: 'mono', text: cur }),
        h('label', { text: _t('Mới nhất') }), h('div', { class: 'row' }, h('span', { class: 'mono', text: s.latest || '—' }), status),
        h('label', { text: _t('Kiểm tra lần cuối') }), h('span', { class: 'note', text: fmtTime(s.lastCheck) + (s.error ? _t(' · lỗi: {error}', { error: s.error }) : '') }),
        h('label', { text: _t('Tự cập nhật') }), h('label', { class: 'row' }, auto, h('span', { class: 'note', text: _t('kiểm tra mỗi {x} giờ; luôn backup dữ liệu trước khi cập nhật; tự chạy lại bản cũ nếu bản mới lỗi', { x: (s.settings || {}).checkHours || 6 }) })),
        h('span'), h('div', { class: 'row' }, checkB, applyB))));
      if (s.notes) box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Thay đổi trong {latest}', { latest: s.latest })), h('div', { class: 'pad' }, h('pre', { class: 'code', style: 'white-space:pre-wrap', text: s.notes }))));
      var hist = h('table', { class: 'grid' });
      hist.appendChild(h('tr', null, [_t('Lúc'), _t('Loại'), _t('Từ'), _t('Sang'), _t('Kết quả'), 'Backup'].map(function (c) { return h('th', { text: c }); })));
      (s.history || []).forEach(function (e) {
        hist.appendChild(h('tr', null, h('td', { class: 'nw note', text: fmtTime(e.at) }), h('td', { text: e.kind === 'rollback' ? _t('Chạy lại bản cũ') : _pt('lịch sử', 'Cập nhật') }),
          h('td', { class: 'v', text: e.from || '—' }), h('td', { class: 'v', text: e.to || '—' }),
          h('td', null, h('span', { class: 'chip ' + (e.ok ? 'ok' : 'bad'), text: e.ok ? _t('Thành công') : (e.rolledBack ? _t('Lỗi · đã tự chạy lại bản cũ') : _t('Lỗi')) }), e.error ? h('div', { class: 'note', text: e.error }) : null),
          h('td', { class: 'note mono', text: e.backup || '—' })));
      });
      var rb = h('button', { class: 'btn danger', disabled: !s.canRollback, onclick: function () {
        if (rb.getAttribute('data-confirm') !== '1') { rb.setAttribute('data-confirm', '1'); rb.textContent = _t('Xác nhận chạy lại {previous} (bấm lần nữa)', { previous: s.previous }); return; }
        Store.api('POST', 'api/update/rollback', { confirm: 'ROLLBACK' }).then(function (r) { toast(r.message); waitRestart(s.previous); }).catch(function (e) { toast(e.message); });
      } }, s.canRollback ? _t('Chạy lại bản cũ {previous}', { previous: s.previous }) : _t('Chưa có bản cũ'));
      box.appendChild(h('div', { class: 'panel' }, h('h3', null, _t('Lịch sử cập nhật'), h('span', { class: 'r' }, rb)),
        (s.history || []).length ? h('div', { class: 'scroll' }, hist) : h('div', { class: 'pad note', text: _t('Chưa có lần cập nhật nào.') }),
        h('div', { class: 'pad note', text: _t('Phiên bản đã cài trên máy: {x}', { x: (s.installed || []).join(', ') }) })));
    }
    function waitRestart(target) {
      clear(box); box.appendChild(h('div', { class: 'panel empty', text: _t('Đang khởi động lại để chạy {x}… trang sẽ tự tải lại.', { x: target || _t('bản mới') }) }));
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
  // khung trang (thanh bên, tiêu đề): vẽ lúc khởi động và mỗi lần đổi ngôn ngữ
  function paintChrome() {
    paintStatic();
    $('verChip').textContent = Store.mode === 'server' ? 'v' + String(Store.info.version).replace(/^v/, '') : _t('xem thử');
    $('modeNote').textContent = Store.mode === 'server' ? _t('Đang chạy trên máy · dữ liệu lưu cục bộ') : _t('Bản xem thử · lưu trong trình duyệt');
    Auth.paint();
    document.title = 'gen-chibi · ' + (APP ? _t(APP.name) : 'Studio');
    $('appName').textContent = APP ? _t(APP.name) : 'Studio';
  }
  // đổi ngôn ngữ: vẽ lại mọi thứ đang hiện — khung, menu, dock, trang (go() dọn trang cũ như khi chuyển trang)
  function repaint() {
    paintChrome();
    if (window.GCDock && window.GCDock.relang) window.GCDock.relang();
    go(route);
  }
  Lang.boot().then(function () { return Store.init(); }).then(function () { return Setup.locked ? null : Projects.load(); }).then(function () {
    if (Store.mode === 'server' && /^\/(login|setup)$/.test(location.pathname)) return location.replace(Auth.next());   // đã đăng nhập (phiên / token) mà mở trang đăng nhập → về trang đích
    paintChrome();
    try { var tmsg = localStorage.getItem('gc-toast'); if (tmsg) { localStorage.removeItem('gc-toast'); setTimeout(function () { toast(tmsg); }, 300); } } catch (e) { /* bỏ qua */ }
    if (window.GCDock && !Setup.locked) window.GCDock.attach(DOCK_BRIDGE);   // dock Trợ lý AI ở cột phải: trước lần go() đầu tiên (wizard lần đầu: không có dock)
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
    if (Setup.locked) go({ page: 'setup' });
    else if (Store.mode === 'server') Store.api('GET', 'api/update').then(function (s) { updateBadge = s.available ? s.latest : false; go(r); }).catch(function () { go(r); });
    else go(r);
  });
})();
