/* gen-chibi engine — render 0.3: tầng vẽ có ngân sách hiệu năng
 * © 2026 Gen Labs — All rights reserved.
 *
 * Ba tầng (bài học L-42: 300 nhân vật diễn đủ cùng lúc = 1 fps):
 *   image  vẽ một lần ra ảnh SVG, cache theo (asset, phiên bản, trạng thái, khung). 0 chi phí mỗi khung hình.
 *   idle   hai ảnh chồng nhau (mắt mở / mắt nhắm) + CSS thở và chớp mắt. Không chạy JS.
 *   full   khung xương chạy JS 60 fps. Tối đa `budget` cái cùng lúc; ra khỏi màn hình thì dừng.
 */
(function (GC) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------- cache ảnh */
  var cache = new Map();
  var CACHE_MAX = 3000;
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function assetSig(a) { return a.key + '@' + a.version + ':' + hash(JSON.stringify(a.look) + JSON.stringify(a.expressions || {})); }

  function imageURL(asset, state, opts) {
    opts = opts || {};
    var key = assetSig(asset) + '|' + state + '|' + (opts.crop ? 'c' : 'f') + (opts.noShadow ? 'n' : '') + (opts.director ? JSON.stringify(opts.director) : '');
    var hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    var svg = GC.svgString(asset, state, opts);
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    cache.set(key, url);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return url;
  }
  function invalidate(asset) {
    var pre = asset.key + '@';
    Array.from(cache.keys()).forEach(function (k) { if (k.indexOf(pre) === 0) cache.delete(k); });
  }

  /* -------------------------------------------------------- tầng image */
  function image(el, asset, state, opts) {
    opts = opts || {};
    var img = document.createElement('img');
    img.className = 'gc-img';
    img.alt = (asset.name || asset.id) + ' · ' + ((GC.LIB.states[state] || {}).label || state);
    img.decoding = 'async';
    img.draggable = false;
    img.src = imageURL(asset, state, opts);
    el.appendChild(img);
    return {
      tier: 'image', el: img, asset: asset, state: state,
      setState: function (s) { this.state = s; img.src = imageURL(this.asset, s, opts); img.alt = (asset.name || asset.id) + ' · ' + ((GC.LIB.states[s] || {}).label || s); },
      setAsset: function (a) { this.asset = a; img.src = imageURL(a, this.state, opts); },
      destroy: function () { img.remove(); }
    };
  }

  /* --------------------------------------------------------- tầng idle */
  function idle(el, asset, state, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'gc-idle';
    var inner = document.createElement('div');
    inner.className = 'gc-breathe';
    inner.style.animationDelay = (-Math.random() * 2.8).toFixed(2) + 's';
    var a = document.createElement('img'), b = document.createElement('img');
    a.alt = asset.name || asset.id; b.alt = ''; b.className = 'gc-blink';
    b.style.animationDelay = (-Math.random() * 4.2).toFixed(2) + 's';
    a.draggable = b.draggable = false;
    inner.appendChild(a); inner.appendChild(b); wrap.appendChild(inner); el.appendChild(wrap);
    function paint(ast, s) {
      a.src = imageURL(ast, s, opts);
      var eyes = GC.resolveState(ast, s).eyes;
      // chỉ chớp khi mắt đang mở
      var canBlink = ['normal', 'teary', 'wide', 'smug', 'lookUp', 'angry', 'fierce', 'lookSide', 'focus', 'half'].indexOf(eyes) >= 0;
      b.hidden = !canBlink;
      if (canBlink) b.src = imageURL(ast, s, Object.assign({}, opts, { director: { eyes: 'closed' } }));
    }
    paint(asset, state);
    return {
      tier: 'idle', el: wrap, asset: asset, state: state,
      setState: function (s) { this.state = s; paint(this.asset, s); },
      setAsset: function (ast) { this.asset = ast; paint(ast, this.state); },
      destroy: function () { wrap.remove(); }
    };
  }

  /* --------------------------------------------------------- tầng full */
  var fulls = [];
  var reserved = new Set();   // suất diễn đủ do nơi khác giữ (sân khấu Live ở dock — v0.25): chung ngân sách ≤ 8
  var running = false, last = 0, hidden = false;
  var io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { var i = e.target.__gc; if (i) i.visible = e.isIntersecting; });
  }) : null;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () { hidden = document.hidden; if (!hidden) kick(); });
  }

  function full(el, asset, state, opts) {
    opts = opts || {};
    if (fulls.length + reserved.size >= API.budget && !opts.force) {
      var d = idle(el, asset, state, opts);
      d.degraded = true;
      return d;
    }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', (opts.crop ? GC.RIG.crop : GC.RIG.box).join(' '));
    svg.setAttribute('class', 'gc-full');
    svg.setAttribute('role', 'img');
    if (!opts.noShadow && !opts.crop) {
      var sh = document.createElementNS(NS, 'ellipse');
      sh.setAttribute('cx', 100); sh.setAttribute('cy', 229); sh.setAttribute('rx', 46); sh.setAttribute('ry', 7);
      sh.setAttribute('class', 'gc-shadow');
      svg.appendChild(sh);
    }
    var groups = {};
    GC.RIG.layers.forEach(function (l) {
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('data-l', l[0]);
      svg.appendChild(g);
      groups[l[0]] = g;
    });
    el.appendChild(svg);
    var inst = {
      tier: 'full', el: svg, asset: asset, state: null, resolved: null, groups: groups, shadow: svg.querySelector('.gc-shadow'),
      cur: GC.neutralPose(), t0: performance.now(), popAt: 0, visible: true,
      still: !!opts.still || reduce,
      setState: function (s, director) {
        var c = GC.compose(this.asset, s, director);
        for (var l in this.groups) this.groups[l].innerHTML = c.layers[l] || '';
        this.resolvedLayers = c.layers;
        if (this.state !== null && (this.state !== s || director)) { this.t0 = performance.now(); this.popAt = this.t0; }
        this.state = s; this.resolved = c.state; this.director = director;
        var _l = GC.i18n ? GC.i18n.label : function (x) { return x; };   // nhãn theo ngôn ngữ giao diện (ADR 0007); tên do người dùng đặt giữ nguyên
        var nm = this.asset.name || this.asset.id;   // chỉ dịch tên của đồ Gen Labs (ma-nơ-canh) — "Nam" của người dùng không thành "Male" (CNS-158)
        svg.setAttribute('aria-label', (GC.isGenLabs && !GC.isGenLabs(this.asset) ? nm : _l(nm)) + ' · ' + _l((GC.LIB.states[s] || {}).label || s));
        this.settled = false;
        return c.state;
      },
      setAsset: function (a) { this.asset = a; this.setState(this.state || 'normal', this.director); },
      // điều khiển trực tiếp (biên đạo, v0.15): fn(now) → { pose, layers, sig, blend } mỗi khung; fn trả null = tạm theo trạng thái thường.
      // drive(null) → về trạng thái đang có (tư thế hoà dần từ dáng cuối của biên đạo)
      drive: function (fn) {
        this.driver = fn || null; this.settled = false;
        if (!fn) {
          this.dsig = null; this.setState(this.state || 'normal', this.director);
          // biên đạo để góc quay nhiều vòng (lộn 360°, múa thương 956°) → đưa về góc tương đương gần đích nhất, không xoay ngược cả vòng
          var tg = GC.poseAt(this.asset, this.resolved, 0, this.still), cur = this.cur;
          GC.JOINT_IDS.forEach(function (j) { var d = cur[j].rot - tg[j].rot; cur[j].rot = tg[j].rot + (d - 360 * Math.round(d / 360)); });
        }
        kick();
      },
      destroy: function () {
        var i = fulls.indexOf(this);
        if (i >= 0) fulls.splice(i, 1);
        if (io) io.unobserve(svg);
        svg.remove();
      }
    };
    svg.__gc = inst;
    inst.setState(state || 'normal');
    apply(inst, performance.now(), 1);
    fulls.push(inst);
    if (io) io.observe(svg);
    kick();
    return inst;
  }

  function apply(inst, now, k) {
    var D = inst.driver && inst.driver(now);
    if (D) {
      if (D.sig !== inst.dsig) { inst.dsig = D.sig; for (var gl in inst.groups) inst.groups[gl].innerHTML = D.layers[gl] || ''; }
      var kb = D.blend == null ? 1 : D.blend;   // < 1: hoà dần từ dáng đang có (lúc vừa vào biên đạo)
      GC.JOINT_IDS.forEach(function (j) { GC.CHANNELS.forEach(function (ch) { inst.cur[j][ch] += (D.pose[j][ch] - inst.cur[j][ch]) * kb; }); });
      var ch2 = GC.chainTransforms(inst.cur);
      GC.RIG.layers.forEach(function (l) { inst.groups[l[0]].setAttribute('transform', ch2[l[1]]); });
      if (inst.shadow) {
        var kk = Math.max(0.3, 1 - Math.max(0, -inst.cur.root.y) / 110);
        inst.shadow.setAttribute('cx', '100'); inst.shadow.setAttribute('rx', (46 * kk).toFixed(1)); inst.shadow.setAttribute('ry', (7 * kk).toFixed(1)); inst.shadow.style.opacity = kk.toFixed(2);
      }
      return;
    }
    if (inst.dsig) { inst.dsig = null; for (var l0 in inst.groups) inst.groups[l0].innerHTML = (inst.resolvedLayers || {})[l0] || ''; }   // vừa thôi điều khiển: trả lớp vẽ của trạng thái
    var t = (now - inst.t0) / 1000;
    var target = GC.poseAt(inst.asset, inst.resolved, t, inst.still);
    // lấy đà + nảy khi đổi trạng thái (squash & stretch)
    var pt = (now - inst.popAt) / 1000;
    if (inst.popAt && pt < 0.36 && !inst.still) {
      var q = pt / 0.36;
      var amp = Math.sin(q * Math.PI * 2) * (1 - q) * 0.12;
      target.root.sy *= 1 - amp; target.root.sx *= 1 + amp * 0.6;
    }
    var moved = 0;
    GC.JOINT_IDS.forEach(function (j) {
      GC.CHANNELS.forEach(function (ch) {
        var d = target[j][ch] - inst.cur[j][ch];
        moved += Math.abs(d);
        inst.cur[j][ch] += d * k;
      });
    });
    var chain = GC.chainTransforms(inst.cur);
    GC.RIG.layers.forEach(function (l) { inst.groups[l[0]].setAttribute('transform', chain[l[1]]); });
    if (inst.shadow) {
      var sd = GC.shadowOf(inst.resolved, inst.cur);
      inst.shadow.setAttribute('cx', sd.cx.toFixed(1)); inst.shadow.setAttribute('rx', sd.rx.toFixed(1)); inst.shadow.setAttribute('ry', sd.ry.toFixed(1));
      inst.shadow.style.opacity = sd.op.toFixed(2);
    }
    if (inst.still && moved < 0.01) inst.settled = true;
  }

  function kick() { if (!running && !hidden) { running = true; last = 0; requestAnimationFrame(loop); } }
  function loop(now) {
    if (hidden) { running = false; return; }
    var dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    var k = 1 - Math.exp(-dt * 16);   // nội suy mũ: cùng tốc độ trên màn 60 Hz và 120 Hz
    var active = 0;
    for (var i = 0; i < fulls.length; i++) {
      var inst = fulls[i];
      if (!inst.el.isConnected || (!inst.visible && !inst.driver) || inst.settled) continue;
      apply(inst, now, k);
      active++;
    }
    if (!fulls.length) { running = false; return; }
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------- CSS */
  var CSS = [
    '.gc-img{display:block;width:100%;height:100%;object-fit:contain}',
    '.gc-idle{position:relative;width:100%;height:100%}',
    '.gc-breathe{position:absolute;inset:0;transform-origin:50% 100%;animation:gc-breathe 2.8s ease-in-out infinite}',
    '.gc-breathe img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}',
    '@keyframes gc-breathe{50%{transform:scale(1.012,.988) translateY(.6%)}}',
    '.gc-blink{opacity:0;animation:gc-blink 4.2s steps(1) infinite}',
    '@keyframes gc-blink{0%{opacity:0}94%{opacity:1}97%{opacity:0}}',
    '.gc-full{overflow:visible;display:block;width:100%;height:100%}',
    '.gc-shadow{fill:rgba(20,24,22,.16)}',
    '.gc-full .gc-eyes{transform-box:fill-box;transform-origin:50% 50%;animation:chb-blink 4.2s infinite}',
    '@keyframes chb-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.12)}}',
    '.chb-flow{animation:chb-flow .5s linear infinite}@keyframes chb-flow{to{stroke-dashoffset:-24}}',
    '.chb-drip{transform-box:fill-box;transform-origin:50% 0;animation:chb-drip 1.4s ease-in infinite}@keyframes chb-drip{0%{transform:scaleY(.4)}70%{transform:scaleY(1.15)}100%{transform:scaleY(.4)}}',
    '.chb-sweat{animation:chb-sweat 1.6s ease-in infinite}@keyframes chb-sweat{0%{transform:translateY(-3px);opacity:0}20%{opacity:1}100%{transform:translateY(9px);opacity:0}}',
    '.chb-pulse{transform-box:fill-box;transform-origin:50% 50%;animation:chb-pulse .5s ease-in-out infinite}@keyframes chb-pulse{50%{transform:scale(1.25)}}',
    '.chb-bob{animation:chb-bob 1.2s ease-in-out infinite}@keyframes chb-bob{50%{transform:translateY(-5px)}}',
    '.chb-rain{animation:chb-rain .45s linear infinite}@keyframes chb-rain{0%{transform:translateY(-6px);opacity:0}30%{opacity:1}100%{transform:translateY(10px);opacity:0}}',
    '.chb-coin{transform-box:fill-box;transform-origin:50% 50%;animation:chb-coin 1.1s ease-in-out infinite}@keyframes chb-coin{0%,100%{transform:translateY(0) scaleX(1)}25%{transform:translateY(-4px) scaleX(.25)}50%{transform:translateY(-7px) scaleX(1)}75%{transform:translateY(-4px) scaleX(.25)}}',
    '.chb-twinkle{transform-box:fill-box;transform-origin:50% 50%;animation:chb-twinkle 1s ease-in-out infinite}@keyframes chb-twinkle{0%,100%{transform:scale(.4) rotate(0);opacity:.3}50%{transform:scale(1.1) rotate(45deg);opacity:1}}',
    '.chb-flicker{transform-box:fill-box;transform-origin:50% 100%;animation:chb-flicker .28s ease-in-out infinite alternate}@keyframes chb-flicker{from{transform:scale(1,1)}to{transform:scale(1.06,1.14)}}',
    '.chb-flash{animation:chb-flash .35s steps(2) infinite}@keyframes chb-flash{50%{opacity:.35}}',
    '.chb-puff{transform-box:fill-box;transform-origin:50% 100%;animation:chb-puff .9s ease-out infinite}@keyframes chb-puff{0%{transform:translateY(4px) scale(.4);opacity:0}30%{opacity:1}100%{transform:translateY(-12px) scale(1.2);opacity:0}}',
    '.chb-zzz{animation:chb-zzz 2.4s ease-in-out infinite}@keyframes chb-zzz{0%{transform:translate(0,6px);opacity:0}30%{opacity:1}100%{transform:translate(8px,-10px);opacity:0}}',
    '.chb-pop{transform-box:fill-box;transform-origin:50% 100%;animation:chb-pop .6s cubic-bezier(.3,1.8,.5,1) infinite alternate}@keyframes chb-pop{from{transform:scale(.85)}to{transform:scale(1.12)}}',
    '.chb-bubble{transform-box:fill-box;transform-origin:0 50%;animation:chb-bubble 2.4s ease-in-out infinite}@keyframes chb-bubble{0%,100%{transform:scale(.3)}60%{transform:scale(1.15)}}',
    '.chb-quiver{transform-box:fill-box;transform-origin:50% 50%;animation:chb-quiver .16s linear infinite alternate}@keyframes chb-quiver{to{transform:scale(1.04,.94)}}',
    '.chb-orbit{transform-box:view-box;transform-origin:100px 62px;animation:chb-orbit 1.6s linear infinite}@keyframes chb-orbit{to{transform:rotate(360deg)}}',
    '.chb-rise{animation:chb-rise 2.2s ease-in-out infinite}@keyframes chb-rise{0%{transform:translateY(6px);opacity:0}25%{opacity:.95}100%{transform:translateY(-26px);opacity:0}}',
    '.chb-wave{animation:chb-wave 1.6s ease-in-out infinite alternate}@keyframes chb-wave{to{transform:translateX(-24px)}}',
    '.chb-fall{animation:chb-fall 1.6s linear infinite}@keyframes chb-fall{0%{transform:translateY(-14px) rotate(0);opacity:0}15%{opacity:1}100%{transform:translateY(40px) rotate(220deg);opacity:0}}',
    '@media (prefers-reduced-motion: reduce){.gc-full *,.gc-breathe,.gc-blink{animation:none!important}}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('gc-css')) return;
    var s = document.createElement('style');
    s.id = 'gc-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var API = {
    budget: 8,
    // giữ / trả một suất diễn đủ cho bộ vẽ ngoài render.js (sân khấu Live ở dock): reserve(id) → false khi đã hết suất
    reserve: function (id) { if (reserved.has(id)) return true; if (fulls.length + reserved.size >= API.budget) return false; reserved.add(id); return true; },
    release: function (id) { reserved.delete(id); },
    image: image, idle: idle, full: full, imageURL: imageURL, invalidate: invalidate, injectCSS: injectCSS,
    mount: function (el, asset, state, opts) {
      opts = opts || {};
      var tier = opts.tier || 'image';
      return tier === 'full' ? full(el, asset, state, opts) : tier === 'idle' ? idle(el, asset, state, opts) : image(el, asset, state, opts);
    },
    stats: function () {
      return { full: fulls.length, fullActive: fulls.filter(function (i) { return i.visible && !i.settled && i.el.isConnected; }).length, reserved: reserved.size, cache: cache.size, budget: API.budget };
    },
    get reducedMotion() { return reduce; }
  };
  GC.render = API;
})(window.GenChibi);
