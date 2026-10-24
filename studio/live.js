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
    wait_user: N_('Chờ bạn'), error: N_('Lỗi'), limit: N_('Giới hạn'), release: N_('Phát hành'), idle: N_('Nghỉ'), stop: N_('Kết thúc') };
  var KIND_CHIP = { test_pass: 'ok', test_fail: 'bad', error: 'bad', limit: 'warn', wait_user: 'warn', release: 'ok', delegate_start: 'info', delegate_end: 'info', prompt: 'info' };
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); return e; }
  function hhmmss(ms) { var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }

  // ---- bộ vẽ DOM cho một đạo diễn (dùng chung sample() với bản SVG chuỗi của engine)
  function Player(box, D, opts) {
    opts = opts || {};
    var S = LV.stage(null, D), svg = el('svg', { viewBox: '0 0 ' + LV.W + ' ' + LV.H, class: 'lv-stage', id: 'liveStage', role: 'img' });
    svg.setAttribute('aria-label', _t('Sân khấu sống'));
    var bg = el('g'), dyn = el('g', { class: 'lv-dyn' }), helpers = el('g', { class: 'lv-helpers' }), shadow = el('ellipse', { ry: f(8 * LV.K), rx: f(44 * LV.K), fill: 'rgba(20,24,22,.22)' }), actor = el('g', { class: 'lv-actor' }), bub = el('g', { class: 'lv-bubble' });
    bg.innerHTML = LV.backdropSVG();   // phông tĩnh do engine vẽ (không dữ liệu người dùng)
    var cam = el('g', { class: 'lv-cam' });   // máy quay: một transform cho cả thế giới (engine/live.js camAt — tất định)
    svg.appendChild(el('rect', { width: LV.W, height: LV.H, fill: '#e9dcc4' })); svg.appendChild(cam);
    cam.appendChild(bg); cam.appendChild(dyn); cam.appendChild(helpers); cam.appendChild(shadow); cam.appendChild(actor); cam.appendChild(bub);
    var groups = {}, sat = el('g'), prop = el('g');
    GC.RIG.layers.forEach(function (l) {
      var g = el('g'); actor.appendChild(g); groups[l[0]] = g;
      if (l[0] === 'body') actor.appendChild(sat);
      if (l[0] === 'heldR') actor.appendChild(prop);
    });
    var bRect = el('rect', { rx: 20, height: 46, fill: '#fff', stroke: '#2b211d', 'stroke-width': 3 }), bTail = el('path', { fill: '#fff', stroke: '#2b211d', 'stroke-width': 3, 'stroke-linejoin': 'round' }), bText = el('text', { 'text-anchor': 'middle', 'font-size': 23, 'font-weight': 600, fill: '#2b211d', 'font-family': 'system-ui, sans-serif' });
    bub.appendChild(bRect); bub.appendChild(bTail); bub.appendChild(bText);
    box.appendChild(svg);
    var sig = null, satSig = null, propSig = null, dynSig = null, bubSig = null, hEls = {}, imgCache = {}, lastS = null, lastU = 0;
    function f(v) { return (Math.round(v * 10) / 10).toString(); }
    function helperImg(h) {
      if (!imgCache[h.tint]) imgCache[h.tint] = GC.render ? GC.render.imageURL(LV.agentAsset(h.tint), 'work', { noShadow: true }) : '';
      return imgCache[h.tint];
    }
    function paint(t) {
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
      actor.setAttribute('transform', 'translate(' + f(F.x - 100 * LV.K) + ' ' + f(F.y - 228 * LV.K) + ') scale(' + LV.K + ')');
      shadow.setAttribute('cx', f(F.x)); shadow.setAttribute('cy', LV.GROUND + 2);
      // phần động của các khu: đổi tối đa 15 lần / giây (màn hình, lửa, tên lửa…)
      var w = F.world, ds = JSON.stringify(w) + '|' + Math.floor(t * 15);
      if (ds !== dynSig) { dynSig = ds; dyn.innerHTML = LV.dynamicSVG(w, t); }
      // trợ lý: tầng ảnh (một <image> dựng sẵn) + tầng thở (một transform mỗi khung) — ≤ 8
      var seen = {};
      F.helpers.forEach(function (h) {
        seen[h.id] = 1;
        var g = hEls[h.id];
        if (!g) { g = hEls[h.id] = el('g', { 'data-helper': h.id }); var im = el('image', { x: -124, y: -246, width: 248, height: 258 }); im.setAttribute('href', helperImg(h)); g.appendChild(el('ellipse', { cx: 0, cy: 2, rx: 40, ry: 7, fill: 'rgba(20,24,22,.18)' })); g.appendChild(im); helpers.appendChild(g); }
        g.setAttribute('transform', S.helperTf(h, t));
      });
      Object.keys(hEls).forEach(function (id) { if (!seen[id]) { hEls[id].remove(); delete hEls[id]; } });
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
    left.appendChild(h('div', { class: 'row' }, status, replayBtn, speedSel, soundBtn, nowLbl));
    left.appendChild(stageBox);
    left.appendChild(h('div', { class: 'note', text: _t('Mỗi bước thật của agent (đọc, tìm, sửa, chạy test, giao việc, chờ bạn…) điều khiển nhân vật. Bong bóng chỉ tóm tắt việc đang làm — không bao giờ hiện nội dung tệp, lệnh hay bí mật.') }));
    var P = Player(stageBox, D, { sound: function () { return soundOn; } });

    // ---- bảng sự kiện (Data Console)
    var tbody = h('tbody', { id: 'liveRows' }), count = 0;
    right.appendChild(h('div', { class: 'panel', id: 'liveEvents' }, h('h3', null, _t('Sự kiện'), h('span', { class: 'r note', id: 'liveCount', text: '0' })),
      h('div', { style: 'max-height:360px;overflow:auto' }, h('table', { class: 'grid' }, h('thead', null, h('tr', null, h('th', null, 'ID'), h('th', null, _t('Giờ')), h('th', null, _t('Loại')), h('th', null, _t('Nhãn')))), tbody))));
    function row(ev, local) {
      count++; document.getElementById('liveCount').textContent = String(count);
      var tr = h('tr', { 'data-kind': ev.kind, 'data-id': String(ev.id) },
        h('td', { class: 'id', text: (local ? 'D' : '') + ev.id }), h('td', { class: 'nw mono', text: hhmmss(ev.ts || Date.now()) }),
        h('td', { class: 'nw' }, h('span', { class: 'chip ' + (KIND_CHIP[ev.kind] || ''), text: _t(KIND_LABEL[ev.kind] || ev.kind) })),
        h('td', { text: ev.label || '' }));
      tbody.insertBefore(tr, tbody.firstChild);
      while (tbody.childNodes.length > 200) tbody.removeChild(tbody.lastChild);
    }
    function feed(ev, local) { D.push({ id: (local ? 'D' : '') + ev.id, kind: ev.kind, label: ev.label, tool: ev.tool, sub: ev.sub }, now()); row(ev, local); }

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
        h('div', { class: 'note', text: _t('Agent khác (không phải Claude Code): gọi tool MCP live_event ở mỗi bước.') })));
    }

    // ---- nguồn sự kiện: SSE đọc bằng fetch (mang được header đăng nhập bằng token)
    var alive = true, ctl = null, lastId = 0, retry = 0;
    function connect() {
      if (!alive || B.mode !== 'server' || !window.ReadableStream) return;
      ctl = new AbortController();
      fetch('api/live/stream?since=' + lastId, { headers: B.headers(), signal: ctl.signal }).then(function (r) {
        if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
        status.className = 'chip ok'; status.textContent = _t('Đang nghe'); retry = 0;
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
        return (function pump() {
          return rd.read().then(function (x) {
            if (x.done) throw new Error('end');
            buf += dec.decode(x.value, { stream: true });
            var i; while ((i = buf.indexOf('\n\n')) >= 0) {
              var fr = buf.slice(0, i); buf = buf.slice(i + 2);
              var data = fr.split('\n').filter(function (l) { return l.indexOf('data: ') === 0; }).map(function (l) { return l.slice(6); }).join('\n');
              if (!data) continue;
              try { var ev = JSON.parse(data); if (ev.id > lastId) { lastId = ev.id; feed(ev, false); } } catch (e) { /* khung hỏng: bỏ */ }
            }
            return pump();
          });
        })();
      }).catch(function () {
        if (!alive) return;
        status.className = 'chip warn'; status.textContent = _t('Mất kết nối — thử lại…');
        setTimeout(connect, Math.min(15000, 1000 * Math.pow(2, retry++)));
      });
    }
    connect();

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
    B.onLeave(function () { alive = false; cancelAnimationFrame(raf); timers.forEach(clearTimeout); if (ctl) ctl.abort(); delete window.__gcLive; });
  }

  window.GCLive = { mount: mount, Player: Player };
})();
