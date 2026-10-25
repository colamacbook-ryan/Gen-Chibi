/* gen-chibi Studio — nguồn sự kiện Sân khấu Live DÙNG CHUNG: MỘT luồng SSE cho mỗi trình duyệt (v0.25, spec §8, CNS-307).
 * © 2026 Gen Labs — All rights reserved.
 *   - Tab "leader" được chọn bằng navigator.locks ('gc-live-leader'): chỉ leader mở GET api/live/stream; sự kiện phát lại cho các tab khác qua
 *     BroadcastChannel('gc-live'). Leader đóng tab → khoá nhả → tab kế nhận khoá, nối lại bằng ?since=<id cuối> (vòng đệm 300 của server).
 *   - Mỗi tab báo "muốn xem" (tab đang hiện VÀ có sân khấu mở: dock không thu gọn / trang Live) mỗi 2 s; không tab nào muốn → leader đóng SSE.
 *   - Trình duyệt thiếu locks / BroadcastChannel (http qua IP LAN không phải ngữ cảnh an toàn) → mỗi tab một SSE như trước (solo).
 *   - Một SSE / trình duyệt cũng giữ Studio dưới trần 6 kết nối HTTP/1.1 của mỗi máy chủ khi mở nhiều tab trên localhost.
 * Nạp TRƯỚC dock.js / live.js. Không đụng DOM. */
(function () {
  'use strict';
  var RING = 300, BEAT = 2000, STALE = 5000;
  var subs = [], statusSubs = [], wantFns = {}, ring = [], B = null, inited = false;
  var tab = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var bc = null; try { bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('gc-live') : null; } catch (e) { bc = null; }
  var locks = typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null;
  var shared = !!(bc && locks);
  var S = { role: shared ? 'follower' : 'solo', status: 'off', lastId: 0, connects: 0, open: false };
  var wants = {};   // (leader) tab → { want, at }
  var ctl = null, retry = 0, retryT = 0;

  function now() { return Date.now(); }
  function myWant() {
    if (typeof document !== 'undefined' && document.hidden) return false;
    for (var k in wantFns) { try { if (wantFns[k]()) return true; } catch (e) { /* bỏ */ } }
    return false;
  }
  function setStatus(st) { if (S.status === st) return; S.status = st; statusSubs.forEach(function (f) { try { f(st); } catch (e) { /* bỏ */ } }); if (S.role === 'leader' && bc) bc.postMessage({ t: 'status', st: st }); }
  function deliver(ev) {
    if (!ev || typeof ev.id !== 'number' || ev.id <= S.lastId) return;
    S.lastId = ev.id; ring.push(ev); if (ring.length > RING) ring.shift();
    subs.slice().forEach(function (f) { try { f(ev); } catch (e) { /* người nghe hỏng không làm hỏng luồng */ } });
  }
  // ---- leader / solo: luồng SSE (fetch để mang header đăng nhập bằng token)
  function connect() {
    if (ctl || !B || B.mode !== 'server' || typeof ReadableStream === 'undefined') return;
    clearTimeout(retryT);
    var my = ctl = new AbortController(); S.connects++; S.open = true;
    fetch('api/live/stream?since=' + S.lastId, { headers: B.headers(), signal: my.signal }).then(function (r) {
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
      setStatus('on'); retry = 0;
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
      return (function pump() {
        return rd.read().then(function (x) {
          if (x.done) throw new Error('end');
          buf += dec.decode(x.value, { stream: true });
          var i; while ((i = buf.indexOf('\n\n')) >= 0) {
            var fr = buf.slice(0, i); buf = buf.slice(i + 2);
            var data = fr.split('\n').filter(function (l) { return l.indexOf('data: ') === 0; }).map(function (l) { return l.slice(6); }).join('\n');
            if (!data) continue;
            var ev = null; try { ev = JSON.parse(data); } catch (e) { continue; }
            if (ev && ev.id > S.lastId) { deliver(ev); if (bc && S.role === 'leader') bc.postMessage({ t: 'ev', ev: ev }); }
          }
          return pump();
        });
      })();
    }).catch(function () {
      if (ctl !== my) return;   // đã đóng có chủ ý
      ctl = null; S.open = false; setStatus('retry');
      retryT = setTimeout(evaluate, Math.min(15000, 1000 * Math.pow(2, retry++)));
    });
  }
  function disconnect() { if (!ctl) return; var c = ctl; ctl = null; S.open = false; try { c.abort(); } catch (e) { /* bỏ */ } setStatus('paused'); }
  function evaluate() {
    if (S.role === 'follower') return;
    var t = now(), any = S.role === 'solo' ? myWant() : (wants[tab] = { want: myWant(), at: t }, Object.keys(wants).some(function (k) { var w = wants[k]; if (t - w.at > STALE) { delete wants[k]; return false; } return w.want; }));
    if (any) connect(); else disconnect();
  }
  function tick() {
    if (!inited) return;
    if (bc && S.role !== 'solo') bc.postMessage({ t: 'want', tab: tab, want: myWant() });
    evaluate();
  }
  function becomeLeader() {
    S.role = 'leader'; wants = {};
    if (bc) bc.postMessage({ t: 'leader', tab: tab });
    tick();
  }
  if (bc) bc.onmessage = function (m) {
    var d = m && m.data; if (!d || typeof d !== 'object') return;
    if (d.t === 'want' && S.role === 'leader' && typeof d.tab === 'string') { wants[d.tab] = { want: !!d.want, at: now() }; evaluate(); }
    else if (d.t === 'ev' && S.role === 'follower') deliver(d.ev);
    else if (d.t === 'status' && S.role === 'follower') setStatus(d.st);
    else if (d.t === 'leader' && S.role === 'follower') tick();   // leader mới: báo ngay mình có muốn xem không
    else if (d.t === 'hello' && S.role === 'leader') { ring.filter(function (e) { return e.id > (+d.since || 0); }).forEach(function (e) { bc.postMessage({ t: 'ev', ev: e }); }); bc.postMessage({ t: 'status', st: S.status }); }
  };

  var API = {
    // app.js (mỗi trang một lần): { mode, headers } — trước khi có người nghe
    init: function (bridge) {
      if (inited) return; inited = true; B = bridge;
      if (shared) {
        // giữ khoá tới khi đóng tab: tab đầu tiên là leader, các tab sau xếp hàng (failover tự động khi leader đóng)
        locks.request('gc-live-leader', function () { becomeLeader(); return new Promise(function () { /* giữ khoá suốt đời tab */ }); }).catch(function () { S.role = 'solo'; tick(); });
        bc.postMessage({ t: 'hello', since: 0 });
      }
      setInterval(tick, BEAT);
      document.addEventListener('visibilitychange', tick);
      tick();
    },
    // người xem: key + hàm "còn muốn xem không" (vd. dock mở + không thu gọn). Đổi trạng thái → gọi API.poke()
    want: function (key, fn) { wantFns[key] = fn; tick(); },
    unwant: function (key) { delete wantFns[key]; tick(); },
    poke: tick,
    // nhận sự kiện (đã làm sạch ở server). opts.replay: phát lại vòng đệm cục bộ trước (trang Live mới mở)
    subscribe: function (fn, opts) {
      subs.push(fn);
      if (opts && opts.replay) ring.slice().forEach(function (e) { try { fn(e); } catch (x) { /* bỏ */ } });
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },
    onStatus: function (fn) { statusSubs.push(fn); try { fn(S.status); } catch (e) { /* bỏ */ } return function () { statusSubs = statusSubs.filter(function (f) { return f !== fn; }); }; },
    state: function () { return { role: S.role, status: S.status, lastId: S.lastId, connects: S.connects, open: S.open, shared: shared, ring: ring.length }; }
  };
  window.GCLiveFeed = API;
})();
