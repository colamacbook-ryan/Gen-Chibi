/* gen-chibi Studio — trang "Live": Sân khấu sống của agent (INT-21). Nạp TRƯỚC app.js; app.js gọi GCLive.mount(khung, cầu nối) ở PAGES.live.
 * © 2026 Gen Labs — All rights reserved.
 *   - Sân khấu: engine/live.js (đạo diễn + sample) → DOM SVG giữ nguyên, mỗi khung chỉ đổi transform (như choreo.player); phần động của khu đổi ≤ 15 lần / giây.
 *   - Nguồn sự kiện: GET api/live/stream (SSE đọc bằng fetch để mang header đăng nhập) · "Phát lại phiên mẫu" chạy tại chỗ (kinds/live/demo-session.jsonl).
 *   - Bảng sự kiện Data Console (ID · giờ · loại · nhãn) · nút âm thanh (mặc định TẮT) · bảng "Kết nối Claude Code" (token live + đoạn settings.json).
 *   - Không innerHTML với dữ liệu người dùng / agent: nhãn đi vào textContent. innerHTML chỉ cho SVG do engine tự vẽ.
 */
(function () {
  'use strict';
  var GC = window.GenChibi, LV = GC.live, NS = 'http://www.w3.org/2000/svg';
  var _t = GC.i18n.t, N_ = GC.i18n.N;
  var KIND_LABEL = { session_start: N_('Bắt đầu phiên'), prompt: N_('Tin nhắn của bạn'), think: N_('Suy nghĩ'), read: N_('Đọc'), search: N_('Tìm kiếm'), edit: N_('Sửa'), write: N_('Viết tệp'),
    run: N_('Chạy lệnh'), test_run: N_('Chạy test'), test_pass: N_('Test xanh'), test_fail: N_('Test đỏ'), delegate_start: N_('Giao việc'), delegate_end: N_('Trợ lý xong'),
    wait_user: N_('Chờ bạn'), error: N_('Lỗi'), limit: N_('Giới hạn'), release: N_('Phát hành'), idle: N_('Nghỉ'), stop: N_('Kết thúc'), task: N_('Đổi việc') };
  var KIND_CHIP = { test_pass: 'ok', test_fail: 'bad', error: 'bad', limit: 'warn', wait_user: 'warn', release: 'ok', delegate_start: 'info', delegate_end: 'info', prompt: 'info', task: 'warn' };
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); return e; }
  function hhmmss(ms) { var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }

  // ảnh phông raster (L-42: máy quay di chuyển cả thế giới mỗi khung → vẽ một ảnh rẻ hơn hàng trăm nét vector) — mỗi tỉ lệ một lần cho cả trang
  var BG = {};
  function backdropHref(sc, cb) {
    var e = BG[sc];
    if (e) { if (e.href) cb(e.href); else e.wait.push(cb); return; }
    e = BG[sc] = { href: null, wait: [cb] };
    var done = function (href) { e.href = href; e.wait.forEach(function (f) { try { f(href); } catch (x) { /* bỏ */ } }); e.wait = []; };
    var im = new Image();
    im.onload = function () {
      try {
        var cv = document.createElement('canvas'); cv.width = LV.W * sc; cv.height = LV.H * sc;
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        if (cv.toBlob && window.URL && URL.createObjectURL) cv.toBlob(function (b) { if (b) done(URL.createObjectURL(b)); else delete BG[sc]; }, 'image/png');
        else done(cv.toDataURL('image/png'));
      } catch (x) { delete BG[sc]; /* trình duyệt chặn canvas: giữ phông vector */ }
    };
    im.onerror = function () { delete BG[sc]; };
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + LV.W + ' ' + LV.H + '" width="' + LV.W * sc + '" height="' + LV.H * sc + '">' + LV.backdropSVG() + '</svg>');
  }

  // ---- bộ vẽ DOM cho một đạo diễn (dùng chung sample() với bản SVG chuỗi của engine)
  function Player(box, D, opts) {
    opts = opts || {};
    var S = LV.stage(null, D), svg = el('svg', { viewBox: '0 0 ' + LV.W + ' ' + LV.H, class: 'lv-stage', id: opts.id || 'liveStage', role: 'img' });
    svg.setAttribute('aria-label', _t('Sân khấu sống'));
    var bg = el('g'), books = el('g'), booksSig = null, dyn = el('g', { class: 'lv-dyn' }), helpers = el('g', { class: 'lv-helpers' }), shadow = el('ellipse', { ry: f(8 * LV.K), rx: f(44 * LV.K), fill: 'rgba(20,24,22,.22)' }), actor = el('g', { class: 'lv-actor' }), bub = el('g', { class: 'lv-bubble' });
    bg.innerHTML = LV.backdropSVG();   // phông tĩnh do engine vẽ (không dữ liệu người dùng)
    // L-42: máy quay di chuyển cả thế giới mỗi khung → phông vector vẽ lại mỗi khung. Raster phông MỘT lần (2×) rồi dùng ảnh: vẽ một ảnh rẻ hơn hàng trăm nét
    // opts.raster: tỉ lệ ảnh phông (trang Live 2× · sân khấu dock 1× — dải hẹp). Dựng MỘT lần cho mỗi tỉ lệ (dùng lại giữa các lần mở trang / dock),
    // mã hoá PNG bằng toBlob (bất đồng bộ) → blob: URL (CSP img-src có blob:)
    backdropHref(opts.raster > 0 ? opts.raster : 2, function (href) {
      var pic = el('image', { x: 0, y: 0, width: LV.W, height: LV.H, preserveAspectRatio: 'none' }); pic.setAttribute('href', href);
      while (bg.firstChild) bg.removeChild(bg.firstChild); bg.appendChild(pic);
    });
    var cam = el('g', { class: 'lv-cam' });   // máy quay: một transform cho cả thế giới (engine/live.js camAt — tất định)
    svg.appendChild(el('rect', { width: LV.W, height: LV.H, fill: '#e9dcc4' })); svg.appendChild(cam);
    cam.appendChild(bg); cam.appendChild(books); cam.appendChild(dyn); cam.appendChild(helpers); cam.appendChild(shadow); cam.appendChild(actor); cam.appendChild(bub);
    var groups = {}, sat = el('g'), prop = el('g'), badge = el('g'), badgeSig = null;
    GC.RIG.layers.forEach(function (l) {
      var g = el('g'); actor.appendChild(g); groups[l[0]] = g;
      if (l[0] === 'body') actor.appendChild(sat);
      if (l[0] === 'heldR') actor.appendChild(prop);
      if (l[0] === 'hat') actor.appendChild(badge);
    });
    var bRect = el('rect', { rx: 20, height: 46, fill: '#fff', stroke: '#2b211d', 'stroke-width': 3 }), bTail = el('path', { fill: '#fff', stroke: '#2b211d', 'stroke-width': 3, 'stroke-linejoin': 'round' }), bText = el('text', { 'text-anchor': 'middle', 'font-size': 23, 'font-weight': 600, fill: '#2b211d', 'font-family': 'system-ui, sans-serif' });
    bub.appendChild(bRect); bub.appendChild(bTail); bub.appendChild(bText);
    box.appendChild(svg);
    var sig = null, satSig = null, propSig = null, dynSig = null, bubSig = null, hEls = {}, imgCache = {}, lastS = null, lastU = 0;
    function f(v) { return (Math.round(v * 10) / 10).toString(); }
    // trợ lý = hình VECTOR tĩnh (chuỗi SVG của engine, dựng sẵn lúc rảnh) — không ảnh <image> (rasterize ảnh SVG lần đầu = long task trên máy 2 CPU)
    // nhóm trợ lý dựng SẴN lúc rảnh (ẩn) — lúc trợ lý bước vào chỉ bỏ ẩn + đặt transform, không phân tích SVG giữa khung
    var pool = {};
    function makeHelper(tint) { var g = el('g', { visibility: 'hidden' }); g.tint = tint; g.appendChild(el('ellipse', { cx: 0, cy: 2, rx: 40, ry: 7, fill: 'rgba(20,24,22,.18)' })); var body = el('g', { transform: 'translate(-100 -228)' }); body.innerHTML = helperImg({ tint: tint }); g.appendChild(body); helpers.appendChild(g); return g; }   // hình do engine vẽ (không dữ liệu người dùng)
    function helperImg(h) {
      if (!imgCache[h.tint]) imgCache[h.tint] = GC.svgBody(LV.agentAsset(h.tint), 'work', { noShadow: true });
      return imgCache[h.tint];
    }
    // lite (tầng thở của sân khấu dock, ≤ 12 khung / giây): phần động của các khu đứng yên (không dựng lại mỗi khung) — chỉ diễn viên thở
    function paint(t, lite) {
      var F = S.sample(t);
      if (!F) return null;
      cam.setAttribute('transform', S.camTf(F.cam));
      if (F.sig !== sig) { sig = F.sig; GC.RIG.layers.forEach(function (l) { groups[l[0]].innerHTML = F.layers[l[0]] || ''; }); }
      var chain = GC.chainTransforms(F.pose);
      GC.RIG.layers.forEach(function (l) { groups[l[0]].setAttribute('transform', chain[l[1]]); });
      var ss = F.view + '|' + F.bagOpen + '|' + F.bagLevel;
      if (ss !== satSig) { satSig = ss; sat.innerHTML = LV.satchelArt(F.view, F.bagOpen, F.bagLevel); }
      sat.setAttribute('transform', chain.body);
      if (F.prop !== propSig) { propSig = F.prop; prop.innerHTML = F.prop ? LV.PROP_ART[F.prop] || '' : ''; }
      prop.setAttribute('transform', chain.handR);
      if (F.task !== badgeSig) { badgeSig = F.task; badge.innerHTML = F.task ? LV.badgeArt(F.task) : ''; }   // dấu việc: SVG do engine vẽ từ bảng cố định
      badge.setAttribute('transform', chain.head);
      if (opts.onTask) opts.onTask(F.task);
      actor.setAttribute('transform', 'translate(' + f(F.x - 100 * LV.K) + ' ' + f(F.y - 228 * LV.K) + ') scale(' + LV.K + ')');
      shadow.setAttribute('cx', f(F.x)); shadow.setAttribute('cy', LV.GROUND + 2);
      // phần động của các khu: đổi tối đa 15 lần / giây (màn hình, lửa, tên lửa…)
      var w = F.world, ds = w.desk + w.lab + w.door.toFixed(2) + w.rocket.toFixed(2) + w.fire.toFixed(2) + w.foam.toFixed(2) + (LV.animated(w) && !lite ? '|' + Math.floor(t * 15) : '');
      if (ds !== dynSig) { dynSig = ds; dyn.innerHTML = LV.dynamicSVG(w, t, true); }
      if (w.bookOut !== booksSig) { booksSig = w.bookOut; books.innerHTML = LV.booksSVG(w.bookOut); }
      // trợ lý: tầng ảnh (hình tĩnh dựng một lần) + tầng thở (một transform mỗi khung) — ≤ 8
      var seen = {};
      F.helpers.forEach(function (h) {
        seen[h.id] = 1;
        var g = hEls[h.id];
        if (!g) { g = hEls[h.id] = pool[h.tint] && !pool[h.tint].used ? pool[h.tint] : makeHelper(h.tint); g.used = true; g.setAttribute('data-helper', h.id); g.removeAttribute('visibility'); }
        g.setAttribute('transform', S.helperTf(h, t));
      });
      Object.keys(hEls).forEach(function (id) { if (!seen[id]) { var g0 = hEls[id]; g0.used = false; g0.setAttribute('visibility', 'hidden'); if (pool[g0.tint] !== g0) g0.remove(); delete hEls[id]; } });
      // bong bóng: câu tóm tắt (nhãn đã làm sạch của agent, hoặc câu mặc định theo loại — dịch theo ngôn ngữ giao diện)
      var txt = LV.bubbleText(F.bubble, _t);
      var bs = txt + '|' + Math.round(F.x);
      if (bs !== bubSig) {
        bubSig = bs;
        bub.setAttribute('visibility', txt ? 'visible' : 'hidden');
        if (txt) {
          bText.textContent = txt;
          var wd = Math.min(460, 30 + Array.from(txt).length * 11.5), bx = Math.max(10, Math.min(LV.W - wd - 10, F.x - wd / 2)), by = F.y - 270 * LV.K - 70;
          bRect.setAttribute('x', f(bx)); bRect.setAttribute('y', f(by)); bRect.setAttribute('width', f(wd));
          bTail.setAttribute('d', 'M' + f(F.x - 10) + ',' + f(by + 44) + ' L' + f(F.x) + ',' + f(by + 62) + ' L' + f(F.x + 10) + ',' + f(by + 44));
          bText.setAttribute('x', f(bx + wd / 2)); bText.setAttribute('y', f(by + 30));
        }
      }
      if (opts.sound && opts.sound()) sound(F.step, t);
      return F;
    }
    // âm thanh (tuỳ chọn, mặc định tắt): sự kiện sfx của clip đang diễn, mỗi sự kiện một lần
    function sound(s, t) {
      var A = GC.audio; if (!A || !A.sfx) return;
      var tl = S.tlOf(s), u = t - s.t0;
      if (lastS !== s) { lastS = s; lastU = 0; }
      tl.events.forEach(function (e) { if (e.sfx && e.t > lastU && e.t <= u) [].concat(e.sfx).forEach(function (n) { try { A.sfx(n, { gain: (e.gain != null ? e.gain : 0.6) * 0.7 }); } catch (x) { /* âm lạ: bỏ */ } }); });
      lastU = u;
    }
    // ảnh trợ lý dựng TRƯỚC lúc rảnh (requestIdleCallback, mỗi lần một màu, giải mã sẵn) — không dựng / giải mã giữa khung khi trợ lý bước vào (L-42)
    (function warmFaces(i) { var ric = window.requestIdleCallback || function (f) { return setTimeout(f, 50); }; ric(function () { if (svg.isConnected && S.warm(i)) warmFaces(i + 1); }); })(0);   // lớp vẽ 18 cảm xúc × 3 góc: dựng lúc rảnh
    (function warm(i) {
      if (i >= LV.HELPERS_MAX) return;
      var ric = window.requestIdleCallback || function (f) { return setTimeout(f, 200); };
      ric(function () { if (!svg.isConnected) return; if (!pool[i]) pool[i] = makeHelper(i); warm(i + 1); });
    })(0);
    return { svg: svg, paint: paint, stage: S };
  }

  function mount(view, B) {
    var h = B.h, clear = B.clear, toast = B.toast;
    var soundOn = false; try { soundOn = localStorage.getItem('gc-live-sound') === '1'; } catch (e) { /* bỏ qua */ }
    var t0 = performance.now() / 1000, now = function () { return performance.now() / 1000 - t0; };
    var D = LV.director({ x0: LV.ZONES.center.x });
    var wrap = h('div', { class: 'lv-wrap', id: 'liveWrap', style: 'display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:12px;align-items:start' });
    var left = h('div', { class: 'stack' }), right = h('div', { class: 'stack' });
    wrap.appendChild(left); wrap.appendChild(right); view.appendChild(wrap);
    var stageBox = h('div', { class: 'panel', id: 'liveStageBox', style: 'overflow:hidden;background:#f3ead9;aspect-ratio:16/9' });
    var status = h('span', { class: 'chip', id: 'liveConn', text: _t('Chưa nối') });
    var soundBtn = h('button', { class: 'btn sm', id: 'liveSound', type: 'button', 'aria-pressed': soundOn ? 'true' : 'false', onclick: function () {
      soundOn = !soundOn; soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); soundBtn.textContent = soundOn ? _t('Âm thanh: bật') : _t('Âm thanh: tắt');
      try { localStorage.setItem('gc-live-sound', soundOn ? '1' : '0'); } catch (e) { /* bỏ qua */ }
      if (soundOn && GC.audio && GC.audio.unlock) GC.audio.unlock();
    } }, soundOn ? _t('Âm thanh: bật') : _t('Âm thanh: tắt'));
    var speedSel = h('select', { id: 'liveSpeed', 'aria-label': _t('Tốc độ phát lại') }, [1, 2, 4].map(function (x) { return h('option', { value: String(x), selected: x === 2 ? true : null }, '×' + x); }));
    var replayBtn = h('button', { class: 'btn sm primary', id: 'liveReplay', type: 'button', onclick: replay }, _t('Phát lại phiên mẫu'));
    var nowLbl = h('span', { class: 'note', id: 'liveNow', style: 'margin-left:auto;white-space:nowrap' });
    var taskChip = h('span', { class: 'chip info', id: 'liveTask', hidden: true });   // "Đang làm: …" — theo dấu việc trên mũ (đổi ở nhịp clap)
    var shownTask = null, titles = {};   // tiêu đề việc (đã làm sạch ở server) — đổi tiêu đề cùng việc thì chip cập nhật, không nhịp mới
    function onTask(tk, force) { if (tk === shownTask && !force) return; shownTask = tk; taskChip.hidden = !tk; taskChip.textContent = tk ? _t('Đang làm: {task}', { task: _t(LV.TASK_LABEL[tk]) }) + (titles[tk] ? ' · ' + titles[tk] : '') : ''; }
    left.appendChild(h('div', { class: 'row' }, status, taskChip, replayBtn, speedSel, soundBtn, nowLbl));
    left.appendChild(stageBox);
    left.appendChild(h('div', { class: 'note', text: _t('Mỗi bước thật của agent (đọc, tìm, sửa, chạy test, giao việc, chờ bạn…) điều khiển nhân vật. Bong bóng chỉ tóm tắt việc đang làm — không bao giờ hiện nội dung tệp, lệnh hay bí mật.') }));
    var P = Player(stageBox, D, { sound: function () { return soundOn; }, onTask: onTask });

    // ---- bảng sự kiện (Data Console)
    var tbody = h('tbody', { id: 'liveRows' }), count = 0;
    right.appendChild(h('div', { class: 'panel', id: 'liveEvents' }, h('h3', null, _t('Sự kiện'), h('span', { class: 'r note', id: 'liveCount', text: '0' })),
      h('div', { style: 'max-height:360px;overflow:auto' }, h('table', { class: 'grid' }, h('thead', null, h('tr', null, h('th', null, 'ID'), h('th', null, _t('Giờ')), h('th', null, _t('Loại')), h('th', null, _t('Việc')), h('th', null, _t('Nhãn')))), tbody))));
    var tableTask = null;   // việc hiện hành theo dòng sự kiện: mỗi sự kiện sau một lần đổi việc được gắn việc đó
    function row(ev, local) {
      count++; document.getElementById('liveCount').textContent = String(count);
      if (ev.kind === 'task' && LV.TASK_LABEL[ev.task]) { tableTask = ev.task; titles[ev.task] = ev.title || ''; if (ev.task === shownTask) onTask(shownTask, true); }
      var tr = h('tr', { 'data-kind': ev.kind, 'data-id': String(ev.id), 'data-task': tableTask || '' },
        h('td', { class: 'id', text: (local ? 'D' : '') + ev.id }), h('td', { class: 'nw mono', text: hhmmss(ev.ts || Date.now()) }),
        h('td', { class: 'nw' }, h('span', { class: 'chip ' + (KIND_CHIP[ev.kind] || ''), text: _t(KIND_LABEL[ev.kind] || ev.kind) })),
        h('td', { class: 'nw', text: tableTask ? _t(LV.TASK_LABEL[tableTask]) : '' }),
        h('td', { text: ev.kind === 'task' ? ev.title || '' : ev.label || '' }));
      tbody.insertBefore(tr, tbody.firstChild);
      while (tbody.childNodes.length > 200) tbody.removeChild(tbody.lastChild);
    }
    // quiet: lượt AI trong Studio không phải lượt đang diễn (một lượt diễn tại một thời điểm — server/live.js) → chỉ vào bảng, không vào đạo diễn
    function feed(ev, local) { if (!ev.quiet) D.push({ id: (local ? 'D' : '') + ev.id, kind: ev.kind, label: ev.label, tool: ev.tool, sub: ev.sub, task: ev.task }, now()); row(ev, local); }

    // ---- kết nối Claude Code (token live + đoạn settings.json) — chỉ bản cài có server
    var conn = h('div', { class: 'panel', id: 'liveConnect' }, h('h3', null, _t('Kết nối Claude Code')));
    right.appendChild(conn);
    if (B.mode !== 'server') conn.appendChild(h('div', { class: 'pad note', text: _t('Kết nối agent chỉ có ở bản cài trên máy. Bản xem thử vẫn phát lại được phiên mẫu.') }));
    else B.api('GET', 'api/live/info').then(renderConn).catch(function (e) { conn.appendChild(h('div', { class: 'pad note', text: e.message })); });
    // CHỈ lệnh CLI (hằng của Studio, không lấy từ server): app / container không được soạn dòng lệnh sẽ chạy trên máy chủ (v0.23.1) — CLI dùng tệp hook đã kiểm
    var LIVE_CMD = 'genchibi live hook --install-into ~/.claude/settings.json';
    function renderConn(v) {
      while (conn.childNodes.length > 1) conn.removeChild(conn.lastChild);
      var shown = false, tok = h('code', { class: 'mono', id: 'liveToken', text: v.token.slice(0, 8) + '…' });
      conn.appendChild(h('div', { class: 'pad stack' },
        h('div', { class: 'note', text: _t('Trên máy chạy Claude Code, chạy lệnh dưới: genchibi chép tệp hook đã kiểm ra ngoài thư mục cài rồi ghép hooks vào cấu hình của Claude Code (có sao lưu). gen-chibi không tự sửa cấu hình nào khi bạn chưa chạy lệnh.') }),
        h('pre', { class: 'mono', id: 'liveCmd', style: 'font-size:12px;background:var(--sunken);padding:8px;border-radius:4px;white-space:pre-wrap', text: LIVE_CMD }),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', id: 'liveCopy', onclick: function () { (navigator.clipboard ? navigator.clipboard.writeText(LIVE_CMD) : Promise.reject(new Error('clipboard'))).then(function () { toast(_t('Đã chép')); }, function () { toast(_t('Không chép được — chọn chữ rồi chép tay.')); }); } }, _t('Chép lệnh'))),
        h('div', { class: 'note', text: _t('Chỉ in đoạn cấu hình để tự dán: genchibi live hook. Token live chỉ gửi được sự kiện Live — không đọc được gì; đổi token thì chạy lại lệnh.') }),
        h('div', { class: 'row' }, h('span', { class: 'note', text: _t('Token live') }), tok,
          h('button', { class: 'btn sm', type: 'button', onclick: function () { shown = !shown; tok.textContent = shown ? v.token : v.token.slice(0, 8) + '…'; } }, _t('Hiện / ẩn')),
          h('button', { class: 'btn sm', type: 'button', id: 'liveRotate', onclick: function () { B.api('POST', 'api/live/token', {}).then(function (r) { renderConn({ token: r.token }); toast(_t('Đã đổi token live — chạy lại lệnh genchibi live hook.')); }).catch(function (e) { toast(e.message); }); } }, _t('Đổi token'))),
        h('div', { class: 'note', text: _t('Agent khác (không phải Claude Code): gọi tool MCP live_event ở mỗi bước.') }),
        agentsBox));
      loadAgents();
    }
    // token riêng của từng agent (live_setup): tên · tạo lúc · sự kiện cuối · Thu hồi (token đã thu hồi không gửi được nữa)
    var agentsBox = h('div', { class: 'stack', id: 'liveAgents' });
    function loadAgents() {
      B.api('GET', 'api/live/agents').then(function (r) {
        clear(agentsBox);
        agentsBox.appendChild(h('div', { class: 'note', text: _t('Agent tự nối (live_setup — agent phải hỏi người dùng trước khi cài)') }));
        var list = (r.agents || []).filter(function (a) { return !a.revoked; });
        if (!list.length) { agentsBox.appendChild(h('div', { class: 'note', text: _t('Chưa có agent nào.') })); return; }
        var tb = h('tbody');
        list.forEach(function (a) {
          tb.appendChild(h('tr', { 'data-agent': a.id }, h('td', { text: a.name }), h('td', { class: 'nw mono', text: a.created ? a.created.slice(0, 16).replace('T', ' ') : '—' }), h('td', { class: 'nw mono', text: a.last ? a.last.slice(0, 16).replace('T', ' ') : '—' }),
            h('td', null, h('button', { class: 'btn sm danger', type: 'button', 'data-revoke': a.id, onclick: function () { B.api('POST', 'api/live/agents/' + a.id + '/revoke', {}).then(function () { toast(_t('Đã thu hồi token của agent')); loadAgents(); }).catch(function (e) { toast(e.message); }); } }, _t('Thu hồi')))));
        });
        agentsBox.appendChild(h('table', { class: 'grid' }, h('thead', null, h('tr', null, h('th', null, _t('Tên')), h('th', null, _t('Tạo lúc')), h('th', null, _t('Sự kiện cuối')), h('th', null, ''))), tb));
      }).catch(function () { /* bản xem thử: không có */ });
    }

    // ---- nguồn sự kiện: GCLiveFeed (studio/live-feed.js) — MỘT SSE cho cả trình duyệt (tab leader), dock và trang này dùng chung
    var alive = true, FD = window.GCLiveFeed, unsub = null, unstat = null;
    if (FD && B.mode === 'server') {
      unstat = FD.onStatus(function (st) {
        status.className = 'chip ' + (st === 'on' ? 'ok' : st === 'retry' ? 'warn' : '');
        status.textContent = st === 'on' ? _t('Đang nghe') : st === 'retry' ? _t('Mất kết nối — thử lại…') : _t('Chưa nối');
      });
      unsub = FD.subscribe(function (ev) { if (alive) feed(ev, false); }, { replay: true });
      FD.want('live-page', function () { return alive; });
    }

    // ---- phát lại phiên mẫu tại chỗ (không gửi lên server)
    var timers = [];
    function replay() {
      timers.forEach(clearTimeout); timers = [];
      var sp = +speedSel.value || 2;
      fetch('kinds/live/demo-session.jsonl').then(function (r) { return r.text(); }).then(function (txt) {
        var list = LV.parseJSONL(txt), n = 0;
        list.forEach(function (it) { timers.push(setTimeout(function () { feed(Object.assign({ id: ++n, ts: Date.now() }, it.ev), true); }, it.at * 1000 / sp)); });
        toast(_t('Phát lại {n} sự kiện mẫu', { n: list.length }));
      }).catch(function (e) { toast(e.message); });
    }

    // ---- vòng vẽ (rAF tự dừng khi tab ẩn) + số đo cho test (L-42)
    var raf = 0, stats = { frames: 0, worst: 0, zones: {}, clips: {}, slow: [] }, prevT = 0;
    function loop() {
      if (!alive) return;
      var t = now(), a = performance.now();
      D.advance(t);
      var F = P.paint(t);
      var cost = performance.now() - a;
      stats.frames++; if (cost > stats.worst) stats.worst = cost;
      if (cost > 16 && stats.slow.length < 20) stats.slow.push({ ms: Math.round(cost), at: +t.toFixed(2), clip: F && F.step.clip, frame: stats.frames });
      if (F) { var z = F.step.type === 'walk' ? null : nearest(F.x); if (z) stats.zones[z] = (stats.zones[z] || 0) + 1; stats.clips[F.step.clip] = 1; if (t - prevT > 0.25) { prevT = t; nowLbl.textContent = _t(KIND_LABEL[F.step.act] || 'Nghỉ'); } }
      raf = requestAnimationFrame(loop);
    }
    function nearest(x) { var b = null, d = 1e9; Object.keys(LV.ZONES).forEach(function (k) { var e = Math.abs(LV.ZONES[k].x - x); if (e < d) { d = e; b = k; } }); return d < 24 ? b : null; }
    raf = requestAnimationFrame(loop);
    window.__gcLive = { director: D, stats: stats, now: now, feed: feed };   // chỉ đọc cho test trình duyệt
    B.onLeave(function () { alive = false; cancelAnimationFrame(raf); timers.forEach(clearTimeout); if (unsub) unsub(); if (unstat) unstat(); if (FD) FD.unwant('live-page'); delete window.__gcLive; if (window.GCDock && window.GCDock.livePage) window.GCDock.livePage(false); });
    if (window.GCDock && window.GCDock.livePage) window.GCDock.livePage(true);   // trên trang Live, sân khấu dock tự thu về thanh 28 px (không hai Player cùng diễn — CNS-317)
  }

  window.GCLive = { mount: mount, Player: Player };
})();
