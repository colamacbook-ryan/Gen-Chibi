/* gen-chibi — ĐỒNG HỒ ẢO cho trang xuất video (studio/video-export.html). © 2026 Gen Labs — All rights reserved.
 *
 * Nạp TRƯỚC engine. Thay setTimeout / setInterval / requestAnimationFrame / performance.now / Date.now của CHÍNH trang này bằng đồng hồ ảo do
 * GCVClock.advance(ms) điều khiển → bộ phát (engine/player.js) chạy theo từng khung hình, không theo thời gian thật; tab chậm / bị ẩn không làm rớt khung.
 * Tắt thứ không ghi được hoặc phụ thuộc vẽ thật: speechSynthesis (giọng máy đọc phát thẳng ra loa — Q39), IntersectionObserver / ResizeObserver
 * (báo theo khung vẽ thật), document.hidden (trang xuất luôn "đang hiện" — bộ phát không đổi nhịp khi tab bị ẩn).
 *
 * CHỈ cài khi trang có <meta name="gc-video-export"> (Studio / phim HTML không bao giờ có) — nạp nhầm ở nơi khác thì không làm gì (CNS-228).
 * Mã chạy cạnh đồng hồ ảo mà cần thời gian THẬT phải gọi tường minh GCVClock.real.* (setTimeout, now…) — không bao giờ dùng bản đã vá.
 *
 *   GCVClock.t                     thời điểm ảo hiện tại (ms, từ lúc cài)
 *   GCVClock.advance(to) → Promise  bắn mọi hẹn giờ tới hạn ≤ to theo thứ tự (thời điểm, rồi thứ tự đặt), sau mỗi lần bắn cho microtask + event loop
 *                                   thật chạy (MessageChannel — không bị bóp như timer ở tab ẩn), rồi chạy MỘT lượt requestAnimationFrame tại `to`
 *   GCVClock.beforeFire(at)        (tuỳ chọn, async) gọi trước mỗi lần bắn — trang xuất dùng để đưa OfflineAudioContext tới đúng `at` (tiếng khoá bước)
 *   GCVClock.track(promise)        việc async THẬT (giải mã clip, tải phông…) — đồng hồ ảo đứng chờ tới khi xong
 *   GCVClock.yieldReal() → Promise  nhả luồng chính một bước event loop thật (MessageChannel)
 *   GCVClock.syncAnimations()      CSS transition / animation: giữ đứng, đặt currentTime theo đồng hồ ảo; hết thời lượng → finish()
 *   GCVClock.real                  bản GỐC: setTimeout clearTimeout setInterval clearInterval raf caf now dateNow
 */
(function (W) {
  'use strict';
  var D = W.document;
  if (!D || !D.querySelector || !D.querySelector('meta[name="gc-video-export"]')) return;   // không phải trang xuất: không vá gì
  if (W.GCVClock) return;
  var perf = W.performance;
  var R = {
    setTimeout: W.setTimeout.bind(W), clearTimeout: W.clearTimeout.bind(W), setInterval: W.setInterval.bind(W), clearInterval: W.clearInterval.bind(W),
    raf: W.requestAnimationFrame.bind(W), caf: W.cancelAnimationFrame.bind(W), now: perf.now.bind(perf), dateNow: Date.now
  };
  var T0 = R.now(), D0 = R.dateNow();
  var VC = { t: 0, timers: [], rafs: [], seq: 1, pending: 0, fired: 0, real: R, beforeFire: null, installed: true };
  W.GCVClock = VC;

  perf.now = function () { return T0 + VC.t; };
  Date.now = function () { return D0 + Math.floor(VC.t); };
  function add(fn, ms, every, args) { var id = VC.seq++; VC.timers.push({ id: id, at: VC.t + ms, every: every, fn: fn, args: args }); return id; }
  W.setTimeout = function (fn, ms) { return add(fn, Math.max(0, +ms || 0), 0, Array.prototype.slice.call(arguments, 2)); };
  W.setInterval = function (fn, ms) { ms = Math.max(1, +ms || 0); return add(fn, ms, ms, Array.prototype.slice.call(arguments, 2)); };
  W.clearTimeout = W.clearInterval = function (id) { for (var i = 0; i < VC.timers.length; i++) if (VC.timers[i].id === id) { VC.timers.splice(i, 1); return; } };
  W.requestAnimationFrame = function (fn) { var id = VC.seq++; VC.rafs.push({ id: id, fn: fn }); return id; };
  W.cancelAnimationFrame = function (id) { VC.rafs = VC.rafs.filter(function (x) { return x.id !== id; }); };
  // giọng máy đọc không vào được tệp → tắt hẳn (engine/audio.js đọc lúc nạp): câu thiếu clip AI im lặng (Q39)
  ['speechSynthesis', 'SpeechSynthesisUtterance', 'IntersectionObserver', 'ResizeObserver', 'requestIdleCallback'].forEach(function (k) {
    try { Object.defineProperty(W, k, { value: undefined, configurable: true, writable: true }); } catch (e) { /* không vá được: engine tự kiểm typeof */ }
  });
  try {
    Object.defineProperty(D, 'hidden', { get: function () { return false; }, configurable: true });
    Object.defineProperty(D, 'visibilityState', { get: function () { return 'visible'; }, configurable: true });
  } catch (e) { /* trình duyệt không cho: bộ phát vẫn chạy, chỉ settle() có thể thôi chờ sớm */ }

  // một bước vĩ mô của event loop THẬT (MessageChannel: không bị kẹp 4 ms, không bị bóp ở tab ẩn như setTimeout — CNS-221)
  var mc = new MessageChannel(), q = [];
  mc.port1.onmessage = function () { var f = q.shift(); if (f) f(); };
  // Nhả HAI bước: hẹn giờ của Studio (cùng luồng) tới hạn TRONG lúc một tác vụ nặng đang chạy chỉ vào hàng sẵn sàng khi bộ lập lịch chọn tác vụ kế — lúc đó
  // tin MessageChannel đã đặt trong tác vụ nặng đứng trước nó. Một bước thì hẹn giờ phải chờ thêm cả tác vụ nặng kế tiếp (đo: nhịp tim 10 ms hở ≈ 2 × tác vụ);
  // bước đầu rỗng → hẹn giờ chạy ngay sau tác vụ nặng (hở ≈ 1 × tác vụ). Không dùng setTimeout (tab ẩn bị bóp ≥ 1 s — CNS-221).
  function hop() { return new Promise(function (ok) { q.push(ok); mc.port2.postMessage(0); }); }
  VC.yieldReal = function () { return hop().then(hop); };
  VC.track = function (p) { VC.pending++; var done = function () { VC.pending--; }; Promise.resolve(p).then(done, done); return p; };
  var OAC = W.OfflineAudioContext;
  if (OAC && OAC.prototype.decodeAudioData) {
    var dec = OAC.prototype.decodeAudioData;
    OAC.prototype.decodeAudioData = function () { return VC.track(dec.apply(this, arguments)); };
  }
  // chờ việc async thật; quá 15 s thật (giải mã treo) thì thôi chờ — hẹn giờ ảo của engine (vd. hạn chờ clip) sẽ lo phần còn lại
  async function settle() { var t0 = R.now(); while (VC.pending > 0 && R.now() - t0 < 15000) await VC.yieldReal(); }

  // CSS animation / transition: lần đầu thấy → dừng, nhớ thời điểm ảo sinh ra; mỗi lần đồng bộ đặt currentTime = t - lúc sinh; hết → finish()
  // (settle() của bộ phát chờ animation.finished). Gọi sau MỖI lần bắn hẹn giờ để "lúc sinh" đúng thời điểm ảo của thay đổi style.
  var born = new WeakMap();
  VC.syncAnimations = function () {
    var list = D.getAnimations ? D.getAnimations() : [], n = 0;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!born.has(a)) { born.set(a, VC.t); try { a.pause(); } catch (e) { continue; } }
      var t = VC.t - born.get(a), end = a.effect && a.effect.getComputedTiming().endTime;
      if (isFinite(end) && t >= end) { try { a.finish(); } catch (e) { /* đã huỷ */ } continue; }
      try { a.currentTime = t; n++; } catch (e) { /* đã huỷ */ }
    }
    return n;
  };
  function due(to) {
    var d = null;
    for (var i = 0; i < VC.timers.length; i++) { var x = VC.timers[i]; if (x.at <= to && (!d || x.at < d.at || (x.at === d.at && x.id < d.id))) d = x; }
    return d;
  }
  VC.advance = async function (to) {
    await settle();
    for (var d = due(to); d; d = due(to)) {
      if (VC.beforeFire) await VC.beforeFire(d.at);
      VC.t = Math.max(VC.t, d.at);
      if (d.every) d.at += d.every; else VC.timers.splice(VC.timers.indexOf(d), 1);
      VC.fired++;
      try { if (typeof d.fn === 'function') d.fn.apply(null, d.args); } catch (e) { console.error('[GCVClock] hẹn giờ lỗi:', e && e.stack || e); }
      await VC.yieldReal();
      await settle();
      VC.syncAnimations();
    }
    if (VC.beforeFire) await VC.beforeFire(to);
    VC.t = Math.max(VC.t, to);
    var list = VC.rafs, now = perf.now(); VC.rafs = [];
    for (var i = 0; i < list.length; i++) { try { list[i].fn(now); } catch (e) { console.error('[GCVClock] khung hình lỗi:', e && e.stack || e); } }
    await VC.yieldReal();
    await settle();
    VC.syncAnimations();
  };
})(typeof window !== 'undefined' ? window : this);
