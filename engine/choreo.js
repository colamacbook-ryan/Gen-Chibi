/* gen-chibi engine — choreo 0.1: BIÊN ĐẠO liên hoàn cho một nhân vật
 * © 2026 Gen Labs — All rights reserved.
 *
 * Động tác (motion) là một vòng k() lặp mãi — đủ cho "đứng nói chuyện", không đủ cho một chuỗi hành động.
 * Biên đạo là một DÒNG THỜI GIAN tư thế then chốt (pose-to-pose như hoạt hình 2D):
 *   tư thế then chốt + nhịp (ease) → nội suy → lò xo cho phần lắc theo (đầu, vạt áo, cẳng tay, binh khí: overlap / follow-through)
 *   + dịch chuyển gốc trong thế giới (đi, chạy, lướt, nhảy) + nét mặt / góc nhìn đổi theo nhịp
 *   + máy quay (zoom, bám, dẫn khung, nghiêng, rung, thị sai) + thời gian (slow-mo, tua nhanh, hit-stop)
 *   + hiệu ứng (vệt chém, va chạm, bụi, vòng sóng, bóng mờ, vạch tốc độ, chữ tượng thanh) + âm thanh theo nhịp.
 * Lõi (pose, clip, build, finalAt, frameSVG) thuần dữ liệu — chạy trong Node để test đo độ mượt; player() mới cần DOM.
 * Ngân sách (L-42): 1 diễn viên khung xương 60 fps + ≤ 24 hiệu ứng sống; tab ẩn thì requestAnimationFrame tự dừng.
 *
 * Quy ước tư thế (giá trị tuyệt đối trên tư thế trung tính, độ / đơn vị khung 200×240):
 *   góc nghiêng (q45 / q90 / q135): viết theo bản chuẩn QUAY MẶT SANG TRÁI màn hình — phía trước là −x, tay gần là R;
 *     quay phải = lật gương (engine tự đảo cả gốc). Chính diện: viết đúng như nhìn trên màn hình.
 *   wR / wL: góc binh khí trong THẾ GIỚI (0 = dựng đứng, + = theo chiều kim đồng hồ) — engine tự giải ra góc bàn tay.
 */
(function (GC) {
  'use strict';
  var J = GC.JOINT_IDS, CH = GC.CHANNELS, NJ = J.length, NC = CH.length, N = NJ * NC + 2;
  var IDX = {};
  J.forEach(function (j, a) { CH.forEach(function (c, b) { IDX[j + '.' + c] = a * NC + b; }); });
  IDX.wL = NJ * NC; IDX.wR = NJ * NC + 1;
  var HZ = 120, DT = 1 / HZ;
  var SW = 640, SH = 360;                   // khung hình (đơn vị cảnh)

  /* ------------------------------------------------------------ 1. NHỊP */
  var EASE = {
    lin: function (u) { return u; },
    io: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    sine: function (u) { return -(Math.cos(Math.PI * u) - 1) / 2; },
    out: function (u) { return 1 - Math.pow(1 - u, 3); },
    in: function (u) { return u * u * u; },
    snap: function (u) { return 1 - Math.pow(1 - u, 4); },                                  // ra đòn: rất nhanh rồi chậm lại
    back: function (u) { var c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },   // vượt quá rồi về
    up: function (u) { return 1 - (1 - u) * (1 - u); },                                     // bay lên (đạn đạo: chậm dần)
    down: function (u) { return u * u; },                                                   // rơi xuống (nhanh dần)
    hold: function (u) { return u < 1 ? 0 : 1; }
  };

  /* ---------------------------------------------- 2. TƯ THẾ + CLIP (thư viện) */
  var POSES = {}, CLIPS = {}, ORDER = [];
  function neutral() { var a = new Float64Array(N); for (var i = 0; i < NJ; i++) { a[i * NC + 3] = 1; a[i * NC + 4] = 1; } return a; }
  // spec: 'tên' | { $: 'tên tư thế nền', khớp: { kênh: số }, wR: số, wL: số }
  function resolve(spec, depth) {
    if ((depth || 0) > 8) throw new Error('choreo: tư thế kế thừa quá sâu');
    if (typeof spec === 'string') { if (!POSES[spec]) throw new Error('choreo: không có tư thế ' + spec); spec = { $: spec }; }
    var base = spec.$ ? resolve(POSES[spec.$] || (function () { throw new Error('choreo: không có tư thế ' + spec.$); })(), (depth || 0) + 1) : neutral();
    var a = new Float64Array(base);
    for (var k in spec) {
      if (k === '$') continue;
      if (k === 'wL' || k === 'wR') { a[IDX[k]] = +spec[k]; continue; }
      var chs = spec[k];
      if (!chs || typeof chs !== 'object') continue;
      for (var c in chs) if (IDX[k + '.' + c] !== undefined && isFinite(chs[c])) a[IDX[k + '.' + c]] = +chs[c];
    }
    return a;
  }
  // đổi chân / tay trái ↔ phải (chu kỳ bước ở góc nghiêng: hai chân cùng mặt phẳng nên chỉ đổi tên, không đảo dấu)
  function swapLR(spec) {
    var o = {};
    for (var k in spec) o[/L$/.test(k) && IDX[k + '.x'] !== undefined ? k.replace(/L$/, 'R') : /R$/.test(k) && IDX[k + '.x'] !== undefined ? k.replace(/R$/, 'L') : k] = spec[k];
    return o;
  }
  function pose(id, spec) { POSES[id] = spec; return spec; }
  function clip(id, def) { def.id = id; CLIPS[id] = def; if (ORDER.indexOf(id) < 0) ORDER.push(id); return def; }

  /* --------------------------------------------------------- 3. LÒ XO */
  // kênh lắc theo: [kênh, ω (rad/s), ζ] — ω nhỏ, ζ nhỏ = trễ nhiều, nảy nhiều (vạt áo); đầu / cẳng tay / binh khí trễ vừa
  var SPRINGS = [['head.rot', 19, 0.42], ['head.y', 24, 0.5], ['hem.rot', 12, 0.3], ['hem.sx', 14, 0.35], ['body.rot', 30, 0.65],
    ['foreL.rot', 24, 0.5], ['foreR.rot', 24, 0.5], ['wR', 30, 0.55], ['wL', 30, 0.55]];

  function seg(list, t) { var lo = 0, hi = list.length - 1, r = -1; while (lo <= hi) { var m = (lo + hi) >> 1; if (list[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
  function lerpKeys(list, t, field) {
    var i = seg(list, t);
    if (i < 0) return list.length ? list[0][field] : 0;
    if (i >= list.length - 1) return list[i][field];
    var A = list[i], B = list[i + 1], u = (t - A.t) / Math.max(1e-6, B.t - A.t);
    return A[field] + (B[field] - A[field]) * (EASE[B.ease] || EASE.io)(u);
  }
  function viewName(kind, dir) {
    if (kind === 'front' || kind === 'back') return kind;
    return (dir < 0 ? 'left' : 'right') + ({ q45: '45', q90: '90', q135: '135' }[kind] || '90');
  }

  /* --------------------------------------------------------- 4. DỰNG */
  // một diễn viên: { asset, steps: [{ clip, dir?, tempo?, face?, cam?, speed?, events? }], x0, dir, scale, ground, weapon, cams }
  // → then chốt, đường đi, nét mặt, đoạn hành vi + sự kiện / máy quay / tốc độ (dùng chung cả cảnh)
  function compileActor(a, ai, out) {
    var K = a.scale || 0.62, keys = [], trav = [{ t: 0, x: a.x0 == null ? 120 : a.x0, ease: 'lin' }], faces = [], segs = [];
    var t = 0, X = trav[0].x, dir = a.dir || 1;
    (a.steps || []).forEach(function (step, si) {
      var c = CLIPS[step.clip];
      if (!c) throw new Error('choreo: không có clip ' + step.clip);
      if (c.make) c = Object.assign({}, c, c.make(step));
      var d = step.dir || dir, sc = step.tempo || 1, t0 = t, view = step.view || c.view || 'q90';
      dir = d;
      var f0 = Object.assign({}, c.face || {}, step.face || {});
      if (Object.keys(f0).length) faces.push({ t: t0, f: f0 });
      (c.faces || []).forEach(function (f) { faces.push({ t: t0 + f[0] * sc, f: f[1] }); });
      c.keys.forEach(function (k) {
        var x = k[3] || {};
        keys.push({ t: t0 + k[0] * sc, p: resolve(k[1]), ease: k[2] || 'io', ez: x.ez, spin: !!x.spin, view: viewName(x.view || view, x.dir || d), hide: x.hide || step.hide || c.hide || [], clip: c.id, step: si });
        if (x.face) faces.push({ t: t0 + k[0] * sc, f: x.face });
      });
      var x0 = X, ts = a.travelScale || 1;
      (c.travel || []).forEach(function (q) { X = x0 + d * q[1] * ts; trav.push({ t: t0 + q[0] * sc, x: X, ease: q[2] || 'io' }); });
      (c.events || []).concat(step.events || []).forEach(function (e) {
        var ev = Object.assign({ t: t0 + e[0] * sc, dir: d, step: si, a: ai }, e[1]);
        // vai phụ (người bị đánh): không tự khựng hình / đổi nhạc / khung điện ảnh — nhịp cảnh do người ra đòn cầm
        if (a.quiet) ['hitstop', 'music', 'ambient', 'letterbox', 'title', 'grade'].forEach(function (k) { delete ev[k]; });
        out.evs.push(ev);
      });
      if (a.cams !== false) (step.cam || c.cam || []).forEach(function (q) { out.cams.push(Object.assign({ t: t0 + q[0] * sc, ease: q[2] || 'io' }, q[1])); });
      if (a.speeds !== false) (step.speed || c.speed || []).forEach(function (q) { out.spd.push({ t: t0 + q[0] * sc, r: q[1], ease: 'lin' }); });
      t = t0 + (c.dur != null ? c.dur : c.keys[c.keys.length - 1][0]) * sc;
      segs.push({ id: c.id, label: step.label || c.label || c.id, t0: t0, t1: t, view: view, dir: d });
    });
    if (!keys.length) throw new Error('choreo: diễn viên ' + ai + ' chưa có bước nào');
    keys.sort(function (p, q) { return p.t - q.t; });
    // góc quay nhiều vòng (binh khí, lộn người): mỗi then chốt lấy góc tương đương GẦN NHẤT với then chốt trước — viết góc tự nhiên,
    // engine tự đi đường ngắn; then chốt đánh dấu spin giữ nguyên số vòng tác giả viết (múa thương 2 vòng)
    ['wR', 'wL', 'root.rot'].forEach(function (ch) {
      var ix = IDX[ch], prevA = null, prevW = null;
      keys.forEach(function (k) {
        var v = k.p[ix];
        if (prevW !== null) v = k.spin ? prevW + (v - prevA) : v + 360 * Math.round((prevW - v) / 360);
        prevA = k.p[ix]; k.p[ix] = v; prevW = v;
      });
    });
    faces.sort(function (p, q) { return p.t - q.t; });
    var acc = { eyes: null, brows: null, mouth: null, fx: [] };
    faces.forEach(function (f) { acc = Object.assign({}, acc, f.f); f.full = acc; });
    return { asset: a.asset, K: K, G: a.ground || 330, weapon: a.weapon || weaponOf(a.asset), keys: keys, trav: trav, faces: faces, segments: segs, T: t, cache: {} };
  }
  // tư thế mỗi khung (120 Hz): nội suy then chốt → lò xo; vị trí trong thế giới
  function bake(A, nF) {
    var keys = A.keys, frames = new Float32Array(nF * N), tmp = new Float64Array(N), xs = new Float32Array(nF);
    var sp = SPRINGS.map(function (s) { return { ix: IDX[s[0]], w: s[1], z: s[2], x: null, v: 0 }; });
    function keyedAt(tt, out) {
      var i = seg(keys, tt);
      if (i < 0) { out.set(keys[0].p); return; }
      if (i >= keys.length - 1) { out.set(keys[keys.length - 1].p); return; }
      var P = keys[i], Q = keys[i + 1], u = (tt - P.t) / Math.max(1e-6, Q.t - P.t), eu = (EASE[Q.ease] || EASE.io)(u);
      for (var n = 0; n < N; n++) out[n] = P.p[n] + (Q.p[n] - P.p[n]) * eu;
      if (Q.ez) for (var ch in Q.ez) { var ix = IDX[ch]; if (ix !== undefined) out[ix] = P.p[ix] + (Q.p[ix] - P.p[ix]) * (EASE[Q.ez[ch]] || EASE.io)(u); }
    }
    for (var f = 0; f < nF; f++) {
      keyedAt(f * DT, tmp);
      sp.forEach(function (s) {
        var target = tmp[s.ix];
        if (s.x === null) s.x = target;
        s.v += (s.w * s.w * (target - s.x) - 2 * s.z * s.w * s.v) * DT;
        s.x += s.v * DT;
        tmp[s.ix] = s.x;
      });
      frames.set(tmp, f * N);
      xs[f] = lerpKeys(A.trav, f * DT, 'x');
    }
    A.frames = frames; A.xs = xs; A.nF = nF;
  }
  // script một diễn viên (màn mẫu): { scale, ground, world, x0, dir, scene, weapon, steps } — build(asset, script)
  // script nhiều diễn viên (đấu, phim): { world, scene, title, follow: [chỉ số diễn viên máy bám], actors: [{ asset, steps, x0, dir, scale, ground, weapon, cams, speeds }] } — build(script)
  function build(asset, script) {
    var S = script ? Object.assign({}, script, { actors: [{ asset: asset, steps: script.steps, x0: script.x0, dir: script.dir, scale: script.scale, ground: script.ground, weapon: script.weapon, travelScale: script.travelScale }] }) : asset;
    var W = S.world || 1280, out = { evs: [], cams: [], spd: [] };
    var actors = (S.actors || []).map(function (a, ai) { return compileActor(a, ai, out); });
    if (!actors.length) throw new Error('choreo: cảnh chưa có diễn viên');
    var T = Math.max.apply(null, actors.map(function (A) { return A.T; })), nF = Math.ceil(T * HZ) + 2;
    actors.forEach(function (A) { bake(A, nF); });
    var evs = out.evs.sort(function (p, q) { return p.t - q.t; }), cams = out.cams.sort(function (p, q) { return p.t - q.t; }), spd = out.spd;
    evs.forEach(function (e, i) { e.i = i; });
    // máy quay: bám (lò xo tới hạn) trung điểm các diễn viên được chọn, dẫn khung về hướng diễn viên đầu
    var A0 = actors[0], follow = (S.follow || [0]).filter(function (i) { return actors[i]; });
    var cx = new Float32Array(nF), cy = new Float32Array(nF), cz = new Float32Array(nF), cr = new Float32Array(nF);
    var CAMF = ['z', 'lead', 'fy', 'roll', 'fol', 'ax', 'lag'], cdef = { z: 1, lead: 0, fy: 0.5, roll: 0, fol: 1, ax: W / 2, lag: 6 };
    var camK = cams.length ? cams : [{ t: 0 }];
    camK.forEach(function (c, i) { CAMF.forEach(function (k) { if (c[k] === undefined) c[k] = i ? camK[i - 1][k] : cdef[k]; }); });
    var sx = null, sy = null, vx = 0, vy = 0, segT = A0.segments.map(function (s) { return { t: s.t0 }; });
    for (var f = 0; f < nF; f++) {
      var tt = f * DT, X0 = 0, lift = 0;
      follow.forEach(function (i) { X0 += actors[i].xs[f] / follow.length; lift += -actors[i].frames[f * N + IDX['root.y']] * actors[i].K / follow.length; });
      var z = lerpKeys(camK, tt, 'z'), fol = lerpKeys(camK, tt, 'fol'), lag = lerpKeys(camK, tt, 'lag');
      var dI = A0.segments[Math.max(0, seg(segT, tt))] || { dir: 1 };
      var tx = fol * (X0 + dI.dir * lerpKeys(camK, tt, 'lead')) + (1 - fol) * lerpKeys(camK, tt, 'ax');
      var ty = A0.G - lerpKeys(camK, tt, 'fy') * 150 * A0.K - lift * 0.6;
      if (sx === null) { sx = tx; sy = ty; }
      vx += (lag * lag * (tx - sx) - 2 * lag * vx) * DT; sx += vx * DT;
      vy += (lag * lag * (ty - sy) - 2 * lag * vy) * DT; sy += vy * DT;
      var roll = lerpKeys(camK, tt, 'roll'), zz = z * (1 + Math.abs(roll) / 40);   // nghiêng máy: phóng thêm để không lộ mép
      cz[f] = zz; cr[f] = roll;
      cx[f] = Math.max(SW / 2 / zz, Math.min(W - SW / 2 / zz, sx));
      cy[f] = Math.max(SH / 2 / zz, Math.min(SH - SH / 2 / zz, sy));
    }
    // thời gian: tốc độ (slow-mo / tua nhanh) + hit-stop → bảng đổi giờ truyện ↔ giờ thật — chung cả cảnh (hai bên cùng khựng)
    spd.sort(function (p, q) { return p.t - q.t; });
    var tl = { T: T, W: W, nF: nF, actors: actors, cam: { x: cx, y: cy, z: cz, roll: cr }, events: evs, speeds: spd, scene: S.scene || null, title: S.title || '' };
    // lối tắt diễn viên đầu (màn một người, đo, test)
    ['asset', 'K', 'G', 'keys', 'frames', 'xs', 'faces', 'segments', 'weapon', 'cache'].forEach(function (k) { tl[k] = A0[k]; });
    retime(tl);
    // hiệu ứng cần vị trí: mũi binh khí / chân / đầu / tay của diễn viên phát sự kiện; vệt chém = đường mũi binh khí quét qua
    evs.forEach(function (e) {
      if (e.at) { var p = pointAt(tl, e.t, e.at, e.a); e.x = p[0] + (e.dx || 0) * e.dir; e.y = p[1] + (e.dy || 0); }
      if (e.smear) {
        var a = e.t - e.smear, pts = [];
        for (var i = 0; i <= 12; i++) pts.push(pointAt(tl, a + (e.t - a) * i / 12, e.from || 'tip', e.a));
        e.pts = pts;
      }
    });
    return tl;
  }
  // hình học binh khí cầm tay (tay phải): góc nghiêng sẵn của bản vẽ + chiều dài tới mũi / tới chuôi, đọc thẳng từ lớp vẽ
  // (đa số đồ cầm tay vẽ dựng đứng từ điểm nắm 128,193; có thể bọc trong rotate(a 128 193))
  var WEAPON_CACHE = {};
  function weaponOf(asset) {
    var ref = asset && GC.partRef ? GC.partRef(asset, 'heldR') : null;
    if (!ref || ref === 'none') return {};
    if (WEAPON_CACHE[ref]) return WEAPON_CACHE[ref];
    var p = GC.getPart('heldR', ref, asset.pack), w = { angle: 0, tip: 24, butt: 0 };
    var L = p && (p.layers || (p.data && p.data.layers)), art = L && (L.heldR || '');   // linh kiện dữ liệu giữ bản gốc ở p.data
    if (typeof art === 'string' && art) {
      var m = /rotate\(\s*(-?[\d.]+)\s+128\s+193\s*\)/.exec(art), ys = [];
      art.replace(/\by="(-?[\d.]+)"[^>]*?height="([\d.]+)"/g, function (_, y, h) { ys.push(+y, +y + +h); return _; });
      art.replace(/\bd="([^"]+)"/g, function (_, d) { var nums = d.match(/-?[\d.]+/g) || []; for (var i = 1; i < nums.length; i += 2) ys.push(+nums[i]); return _; });
      if (ys.length) { w.tip = Math.max(20, 193 - Math.min.apply(null, ys)); w.butt = Math.max(0, Math.max.apply(null, ys) - 193); }
      if (m) w.angle = +m[1];
    } else if (p && p.tall) w.tip = 110;
    return (WEAPON_CACHE[ref] = w);
  }
  function mapTime(A, B, v) {
    var lo = 0, hi = A.length - 1;
    if (v <= A[0]) return B[0];
    if (v >= A[hi]) return B[hi];
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (A[m] <= v) lo = m; else hi = m; }
    var d = A[hi] - A[lo];
    return d < 1e-9 ? B[lo] : B[lo] + (B[hi] - B[lo]) * (v - A[lo]) / d;
  }
  function storyToReal(tl, s) { return mapTime(tl.mS, tl.mR, s); }
  function realToStory(tl, r) { return mapTime(tl.mR, tl.mS, r); }

  /* ------------------------------------------------- 4b. ĐẤU (hai diễn viên) */
  // spec: { a: { asset, x, y, k, face? }, b: { asset, x, y, k }, action, react, scene?, world? } — x, y: chân trong toạ độ cảnh, k: tỉ lệ
  // 1) dựng riêng người ra đòn, tìm điểm va chạm (sự kiện hitstop / hit) và mũi binh khí lúc đó
  // 2) thiếu / thừa tầm → chèn bước áp sát (lướt) hoặc lùi trước đòn, để mũi binh khí chạm đúng mặt trước thân đối thủ
  // 3) đối thủ thủ thế chờ rồi phản ứng ĐÚNG khung va chạm (trúng / đỡ / né / ngã) — hai bên chung một đồng hồ (cùng khựng, cùng slow-mo)
  function actorSpec(p, dir, steps, extra) {
    return Object.assign({ asset: p.asset, x0: p.x, dir: dir, scale: p.k || 0.8, ground: p.y || 330, travelScale: (p.k || 0.8) / 0.62, steps: steps }, extra || {});
  }
  function impacts(tl, ai) { return tl.events.filter(function (e) { return (e.a || 0) === (ai || 0) && (e.hitstop > 0 || e.hit); }); }
  function duel(spec) {
    var AC = GC.choreo.ACTIONS || {}, RE = GC.choreo.REACTS || {}, act = AC[spec.action], re = RE[spec.react || 'hit'];
    if (!act || !act.attack) throw new Error('choreo: "' + spec.action + '" không phải đòn đánh (' + Object.keys(AC).filter(function (k) { return AC[k].attack; }).join(', ') + ')');
    if (!re) throw new Error('choreo: phản ứng lạ "' + spec.react + '" (' + Object.keys(RE).join(', ') + ')');
    var A = spec.a, B = spec.b, dir = B.x >= A.x ? 1 : -1, kB = B.k || 0.8;
    var fierce = { eyes: 'fierce', brows: 'angry', mouth: 'flat' };
    var mk = function (pre) { return [{ clip: 'hold', dur: 0.28 + (pre || 0), pose: 'guard', face: Object.assign({}, fierce, A.face || {}) }].concat(act.clips.map(function (c) { return { clip: c }; })); };
    var solo1 = build({ actors: [actorSpec(A, dir, mk())], world: spec.world || SW });
    var hits = impacts(solo1, 0);
    if (!hits.length) throw new Error('choreo: đòn ' + spec.action + ' không có điểm va chạm');
    var h = hits[hits.length - 1], tip = pointAt(solo1, h.t, 'tip', 0), root = xAt(solo1.actors[0], h.t);
    var front = B.x - dir * 26 * kB, need = (front - A.x) * dir - (tip[0] - root) * dir, have = (root - A.x) * dir;
    var delta = Math.max(-420, Math.min(420, need - have)), steps = mk();
    // không áp sát quá một thân người (đòn hất lên cao có mũi binh khí gần thân → tính tầm theo mũi sẽ làm hai người chồng lên nhau)
    var minGap = 62 * Math.max(A.k || 0.8, kB), gap = (B.x - (A.x + dir * (have + delta))) * dir;
    if (gap < minGap) delta -= minGap - gap;
    if (Math.abs(delta) > 8) steps.splice(1, 0, { clip: 'stepIn', dist: delta / ((A.k || 0.8) / 0.62) });
    var lone = build({ actors: [actorSpec(A, dir, steps)], world: spec.world || SW }), hs = impacts(lone, 0), tImp = hs[hs.length - 1].t;
    var wait = tImp - re.contact;
    if (wait < 0.3) { steps[0].dur += 0.3 - wait; tImp += 0.3 - wait; wait = 0.3; }
    var bSteps = [{ clip: 'hold', dur: wait, pose: 'guard', face: { eyes: 'fierce', brows: 'determined', mouth: 'flat' } }].concat(re.clips.map(function (c) { return { clip: c }; }));
    steps.push({ clip: 'hold', dur: 0.35, pose: 'guard' });
    var specs = [actorSpec(A, dir, steps), actorSpec(B, -dir, bSteps, { quiet: true, cams: false, speeds: false })];
    var tl = build({ actors: specs, follow: [0, 1], world: spec.world || SW, scene: spec.scene || null });
    // bị đánh văng / lộn ra ngoài sân khấu → thu ngắn quãng trượt của phản ứng cho vừa (chừa nửa thân ở mép)
    var lo = 36, hi2 = (spec.world || SW) - 36, xsB = tl.actors[1].xs, far = 0;
    for (var q = 0; q < xsB.length; q++) far = Math.max(far, (xsB[q] - B.x) * dir);   // văng về phía sau lưng mình = hướng dir của người đánh
    var room = (dir > 0 ? hi2 - B.x : B.x - lo);
    if (far > room && far > 1) { specs[1].travelScale *= Math.max(0.15, room / far); tl = build({ actors: specs, follow: [0, 1], world: spec.world || SW, scene: spec.scene || null }); }
    if (re.miss) impacts(tl, 0).forEach(function (e) { delete e.hitstop; if (e.fx === 'impact') e.fx = 'spark'; if (e.sfx === 'hit' || (e.sfx && e.sfx.indexOf && e.sfx.indexOf('hit') >= 0)) e.sfx = 'swish'; e.miss = true; });
    // giờ thật đổi khi bỏ khựng hình (né) → dựng lại bảng giờ
    if (re.miss) retime(tl);
    var hitsF = impacts(tl, 0);
    tl.duel = { dir: dir, impact: hitsF.length ? hitsF[hitsF.length - 1].t : tImp, react: spec.react || 'hit', action: spec.action,
      end: tl.actors.map(function (X) { return X.xs[X.xs.length - 1]; }) };
    return tl;
  }
  // một người diễn một hành động (múa thương, nhảy mừng, thi lễ…) tại chỗ đứng hiện tại
  function solo(spec) {
    var act = (GC.choreo.ACTIONS || {})[spec.action];
    if (!act) throw new Error('choreo: không có hành động ' + spec.action);
    var A = spec.a, steps = act.clips.map(function (c) { return { clip: c }; }).concat([{ clip: 'hold', dur: 0.3, pose: act.attack ? 'guard' : 'ready' }]);
    var tl = build({ actors: [actorSpec(A, spec.dir || 1, steps)], world: spec.world || SW, scene: spec.scene || null });
    tl.duel = { dir: spec.dir || 1, action: spec.action, end: [tl.actors[0].xs[tl.actors[0].xs.length - 1]] };
    return tl;
  }
  // dựng lại bảng giờ truyện ↔ thật (sau khi sửa sự kiện khựng hình)
  function retime(tl) {
    var hs = tl.events.filter(function (e) { return e.hitstop > 0; }), spd = tl.speeds, T = tl.T;
    var rateAt = function (x) { return spd.length ? lerpKeys(spd, x, 'r') : 1; };
    var mS = [0], mR = [0], st = 0, rt = 0, hi = 0, stp = 1 / 480;
    while (st < T - 1e-9) {
      while (hi < hs.length && hs[hi].t <= st) { rt += Math.min(0.4, hs[hi].hitstop); mS.push(st); mR.push(rt); hi++; }
      var r = Math.max(0.05, rateAt(st + stp / 2)), d2 = Math.min(stp, T - st);
      st += d2; rt += d2 / r; mS.push(st); mR.push(rt);
    }
    tl.mS = mS; tl.mR = mR; tl.real = rt;
    tl.events.forEach(function (e) { e.rt = storyToReal(tl, e.t); });
  }

  /* ------------------------------------------------- 5. LẤY MẪU MỘT KHUNG */
  function actorOf(tl, ai) { return tl.actors ? tl.actors[ai || 0] : tl; }
  function flatAt(A, s) {
    var f = Math.max(0, Math.min(A.nF - 1.001, s * HZ)), i = Math.floor(f), u = f - i, out = new Float64Array(N), a = i * N, b = a + N;
    for (var n = 0; n < N; n++) out[n] = A.frames[a + n] + (A.frames[b + n] - A.frames[a + n]) * u;
    return out;
  }
  function arr(tl, name, s) { var f = Math.max(0, Math.min(tl.nF - 1.001, s * HZ)), i = Math.floor(f), u = f - i, A = name === 'xs' ? tl.xs : tl.cam[name]; return A[i] + (A[i + 1] - A[i]) * u; }
  function xAt(A, s) { var f = Math.max(0, Math.min(A.nF - 1.001, s * HZ)), i = Math.floor(f), u = f - i; return A.xs[i] + (A.xs[i + 1] - A.xs[i]) * u; }
  // góc nhìn / che binh khí: đổi ở giữa đoạn chuyển giữa hai then chốt (quay người nhanh = các then chốt sát nhau).
  // nghiêng ↔ chính diện (hoặc ↔ sau lưng) cùng hướng: chèn góc 45° (135°) ở 1/3 giữa → quay người ba nhịp, không "giật" góc
  var MIDVIEW = { 'left90|front': 'left45', 'right90|front': 'right45', 'left90|back': 'left135', 'right90|back': 'right135' };
  function viewAt(A, s) {
    var K = A.keys, i = seg(K, s);
    if (i < 0) return K[0];
    if (i >= K.length - 1) return K[i];
    var P = K[i], Q = K[i + 1], u = (s - P.t) / Math.max(1e-6, Q.t - P.t);
    var mid = MIDVIEW[P.view + '|' + Q.view] || MIDVIEW[Q.view + '|' + P.view];
    if (mid && u >= 0.3 && u < 0.7) return { view: mid, hide: (u < 0.5 ? P : Q).hide };
    return u >= 0.5 ? Q : P;
  }
  function faceAt(A, s) { var i = seg(A.faces, s); return i < 0 ? {} : A.faces[i].full; }
  // tư thế cuối (đã giải góc bàn tay, lật gương, cỡ đầu, xoay 3/4) + lớp vẽ của diễn viên ai ở giờ truyện s
  function finalAt(tl, s, ai) {
    var A = actorOf(tl, ai), flat = flatAt(A, s), k = viewAt(A, s), fc = faceAt(A, s), hide = k.hide || [];
    var dirn = { view: k.view, motion: 'rest', hide: hide };
    if (fc.eyes) dirn.eyes = fc.eyes; if (fc.brows) dirn.brows = fc.brows; if (fc.mouth) dirn.mouth = fc.mouth; if (fc.fx && fc.fx.length) dirn.fx = fc.fx;
    var sig = JSON.stringify(dirn), c = A.cache[sig];
    if (!c) { c = A.cache[sig] = GC.compose(A.asset, 'normal', dirn); c.sig = sig; }
    var st = c.state, pz = {};
    J.forEach(function (j, a) { pz[j] = { x: flat[a * NC], y: flat[a * NC + 1], rot: flat[a * NC + 2], sx: flat[a * NC + 3], sy: flat[a * NC + 4] }; });
    ['L', 'R'].forEach(function (sd) { pz['hand' + sd].rot = flat[IDX['w' + sd]] - (A.weapon[sd] ? A.weapon[sd].angle || 0 : 0) - (pz.root.rot + pz.pelvis.rot + pz.body.rot + pz['arm' + sd].rot + pz['fore' + sd].rot); });
    if (st.mirror) { pz.root.x = -pz.root.x; pz.root.rot = -pz.root.rot; }   // gốc nằm ngoài phép lật → đảo tay để lật gương chính xác
    GC.finishPose(A.asset, st, pz);
    return { pose: pz, st: st, layers: c.layers, sig: sig, x: xAt(A, s), face: fc, view: k.view, seg: segAt(A, s), K: A.K, G: A.G, ai: ai || 0 };
  }
  function segAt(A, s) { var S = A.segments; for (var i = S.length - 1; i >= 0; i--) if (S[i].t0 <= s) return S[i]; return S[0]; }
  // điểm khung (px, py) → thế giới
  function toWorld(F, p) { return [F.x + (p[0] - 100) * F.K, F.G + (p[1] - 228) * F.K]; }
  function pointAt(tl, s, what, ai) {
    var A = actorOf(tl, ai), F = finalAt(tl, s, ai), M = GC.jointMatrices(F.pose), at = function (j, px, py) { var m = M[j]; return toWorld(F, [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]]); };
    if (what === 'tip' || what === 'butt') {
      var w = A.weapon.R || { angle: 0, tip: 24, butt: 0 }, a = (w.angle || 0) * Math.PI / 180, L = what === 'tip' ? w.tip : -(w.butt || 0);
      return at('handR', 128 + L * Math.sin(a), 193 - L * Math.cos(a));
    }
    if (what === 'head') return at('head', 100, 96);
    if (what === 'chest') return at('body', 100, 170);
    if (what === 'hand') return at('handR', 128, 193);
    if (what === 'handL') return at('handL', 72, 193);
    return [F.x, F.G];   // feet
  }

  /* ------------------------------------------------------- 6. VẼ (chuỗi SVG) */
  var f1 = function (v) { return (Math.round(v * 10) / 10).toString(); };
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function camAt(tl, r) {
    var s = realToStory(tl, r), c = { s: s, x: arr(tl, 'x', s), y: arr(tl, 'y', s), z: arr(tl, 'z', s), roll: arr(tl, 'roll', s), sx: 0, sy: 0 };
    tl.events.forEach(function (e) {
      if (!e.shake || r < e.rt || r > e.rt + 0.6) return;
      var a = e.shake * Math.exp(-(r - e.rt) * 9);
      c.sx += a * Math.sin(r * 97 + e.i * 3.1); c.sy += a * Math.cos(r * 83 + e.i * 1.7);
    });
    return c;
  }
  function layerTf(c, p) {
    var z = 1 + (c.z - 1) * p, x = SW / 2 + (c.x - SW / 2) * p, y = SH / 2 + (c.y - SH / 2) * p;
    return 'translate(' + f1(SW / 2 + c.sx * p) + ' ' + f1(SH / 2 + c.sy * p) + ') rotate(' + c.roll.toFixed(2) + ') scale(' + z.toFixed(4) + ') translate(' + f1(-x) + ' ' + f1(-y) + ')';
  }
  var PARALLAX = { sky: 0.04, far: 0.35, mid: 0.7, ground: 1, front: 1.25 };
  function tile(art, W) { return '<g>' + art + '</g><g transform="translate(' + (2 * SW) + ' 0) scale(-1 1)">' + art + '</g>' + (W > 2 * SW ? '<g transform="translate(' + (2 * SW) + ' 0)">' + art + '</g>' : ''); }
  function sceneArt(tl) {
    if (tl._scene) return tl._scene;
    var sc = tl.scene && GC.getScene(tl.scene, 'local.my'), L = sc ? GC.sceneLayers(sc) : {};
    var out = {};
    ['sky', 'far', 'mid', 'ground', 'front'].forEach(function (k) {
      out[k] = L[k] ? (k === 'sky' ? '<g transform="translate(-160 -90) scale(1.5)">' + L[k] + '</g>' : tile(L[k], tl.W)) : '';
    });
    if (!L.ground) out.ground = '<rect x="0" y="' + tl.G + '" width="' + tl.W + '" height="' + (SH - tl.G + 40) + '" fill="#9cbf6e"/>';
    if (!L.sky) out.sky = '<rect x="-200" y="-200" width="1040" height="760" fill="#cfe6f2"/>';
    out.weather = L.weather || ''; out.tint = L.tint || '';
    return (tl._scene = out);
  }
  function actorSvg(tl, F, extra) {
    var chain = GC.chainTransforms(F.pose), s = '';
    GC.RIG.layers.forEach(function (l) { if (F.layers[l[0]]) s += '<g transform="' + chain[l[1]] + '">' + F.layers[l[0]] + '</g>'; });
    return '<g class="gc-full"' + (extra || '') + ' transform="translate(' + f1(F.x - 100 * F.K) + ' ' + f1(F.G - 228 * F.K) + ') scale(' + F.K + ')">' + s + '</g>';
  }
  function shadowSvg(tl, F) {
    var lift = Math.max(0, -F.pose.root.y), k = Math.max(0.3, 1 - lift / 110);
    return '<ellipse cx="' + f1(F.x) + '" cy="' + f1(F.G + 1) + '" rx="' + f1(44 * F.K * k) + '" ry="' + f1(7 * F.K * k) + '" fill="rgba(20,24,22,' + (0.2 * k).toFixed(3) + ')"/>';
  }
  // hiệu ứng trong thế giới (zoom theo máy quay) — mỗi loại có tuổi thọ riêng; tối đa 24 cái sống
  var LIFE = { impact: 0.32, spark: 0.28, dust: 0.7, ring: 0.5, smear: 0.2, text: 0.75, projectile: 0, glint: 0.4, debris: 0.7 };
  function fxSvg(tl, r, s) {
    var out = '', live = 0;
    tl.events.forEach(function (e) {
      if (live >= 24) return;
      var kind = e.fx, age = r - e.rt;
      if (kind === 'projectile') {
        var fl = e.flight || 0.35; age = r - (e.rt - fl);
        if (age < 0 || age > fl) return;
        var q = age / fl, x0 = e.x + e.dir * (e.from || 260), y0 = e.y - 40, x = x0 + (e.x - x0) * q, y = y0 + (e.y - y0) * q - Math.sin(q * Math.PI) * 30;
        live++; out += '<g transform="translate(' + f1(x) + ' ' + f1(y) + ') rotate(' + Math.round(q * 720) + ')"><path d="M-7,-5 L4,-8 L9,1 L3,8 L-8,5 Z" fill="#8a8178" stroke="#2b211d" stroke-width="1.6" stroke-linejoin="round"/></g>';
        return;
      }
      var life = LIFE[kind] || 0;
      if (!life || age < 0 || age > life) return;
      var q = age / life, o = (1 - q).toFixed(3), x = e.x, y = e.y, sz = e.size || 1;
      live++;
      if (kind === 'impact') {
        var R = (14 + 30 * Math.pow(q, 0.5)) * sz, pts = '';
        for (var i = 0; i < 16; i++) { var a = i / 16 * Math.PI * 2, rr = i % 2 ? R * 0.42 : R; pts += f1(x + Math.cos(a) * rr) + ',' + f1(y + Math.sin(a) * rr) + ' '; }
        out += '<polygon points="' + pts + '" fill="#fff6c4" stroke="#ff8a1f" stroke-width="' + f1(3 * (1 - q) + 0.5) + '" opacity="' + o + '"/><circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(R * 0.3) + '" fill="#fff" opacity="' + o + '"/>';
      } else if (kind === 'spark' || kind === 'glint') {
        for (var i2 = 0; i2 < (kind === 'glint' ? 1 : 7); i2++) {
          var a2 = kind === 'glint' ? 0 : rnd(e.i * 7 + i2) * Math.PI * 2, d = kind === 'glint' ? 0 : (10 + 34 * q) * sz;
          var gx = x + Math.cos(a2) * d, gy = y + Math.sin(a2) * d, gs = kind === 'glint' ? 9 * Math.sin(q * Math.PI) * sz : 3.5 * (1 - q) * sz;
          out += '<path d="M' + f1(gx) + ',' + f1(gy - gs * 2) + ' L' + f1(gx + gs * 0.5) + ',' + f1(gy) + ' L' + f1(gx) + ',' + f1(gy + gs * 2) + ' L' + f1(gx - gs * 0.5) + ',' + f1(gy) + ' Z M' + f1(gx - gs * 2) + ',' + f1(gy) + ' L' + f1(gx) + ',' + f1(gy - gs * 0.5) + ' L' + f1(gx + gs * 2) + ',' + f1(gy) + ' L' + f1(gx) + ',' + f1(gy + gs * 0.5) + ' Z" fill="#fffbe0" stroke="#f2b62c" stroke-width="0.8" opacity="' + (kind === 'glint' ? 1 : o) + '"/>';
        }
      } else if (kind === 'dust') {
        for (var i3 = 0; i3 < 6; i3++) {
          var side = i3 % 2 ? 1 : -1, dx = side * (8 + 30 * q * (0.6 + rnd(e.i + i3) * 0.8)) * sz + (e.push || 0) * e.dir * q * 20;
          out += '<circle cx="' + f1(x + dx) + '" cy="' + f1(y - 4 - 10 * q * rnd(i3 + e.i * 3)) + '" r="' + f1((4 + 9 * q) * sz * (0.7 + rnd(i3 * 5) * 0.5)) + '" fill="#e9dcc3" stroke="#b9a582" stroke-width="1" opacity="' + (0.85 * (1 - q)).toFixed(3) + '"/>';
        }
      } else if (kind === 'ring') {
        out += '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1((12 + 110 * q) * sz) + '" ry="' + f1((4 + 22 * q) * sz) + '" fill="none" stroke="#fffaf0" stroke-width="' + f1(6 * (1 - q) + 1) + '" opacity="' + o + '"/>';
      } else if (kind === 'debris') {
        for (var i4 = 0; i4 < 7; i4++) {
          var vx = (rnd(e.i * 11 + i4) - 0.5) * 120 * sz, vy = -(60 + rnd(i4 * 3 + e.i) * 90) * sz, tq = age;
          out += '<rect x="' + f1(x + vx * tq - 2.5) + '" y="' + f1(y + vy * tq + 260 * tq * tq - 2.5) + '" width="5" height="4" fill="#8f7a5c" stroke="#2b211d" stroke-width="0.8" transform="rotate(' + Math.round(tq * 600 + i4 * 40) + ' ' + f1(x + vx * tq) + ' ' + f1(y + vy * tq + 260 * tq * tq) + ')" opacity="' + o + '"/>';
        }
      } else if (kind === 'smear' && e.pts) {
        var p = e.pts, dd = 'M' + f1(p[0][0]) + ',' + f1(p[0][1]);
        for (var i5 = 1; i5 < p.length; i5++) dd += ' L' + f1(p[i5][0]) + ',' + f1(p[i5][1]);
        out += '<path d="' + dd + '" fill="none" stroke="#ffffff" stroke-width="' + f1(11 * (1 - q) * sz + 1) + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + (0.85 * (1 - q)).toFixed(3) + '"/>' +
          '<path d="' + dd + '" fill="none" stroke="#bfe3ff" stroke-width="' + f1(4 * (1 - q) * sz + 0.5) + '" stroke-linecap="round" opacity="' + o + '"/>';
      } else if (kind === 'text') {
        var pop = q < 0.15 ? 0.4 + q / 0.15 * 0.8 : q < 0.25 ? 1.2 - (q - 0.15) : 1.1, fs = 30 * sz * pop;
        out += '<text x="' + f1(x) + '" y="' + f1(y - 12 * q) + '" font-family="Impact, \'Arial Black\', sans-serif" font-weight="900" font-size="' + f1(fs) + '" text-anchor="middle" fill="' + (e.color || '#ffd23f') + '" stroke="#2b211d" stroke-width="' + f1(fs / 7) + '" paint-order="stroke" stroke-linejoin="round" transform="rotate(' + (e.rot || -8) + ' ' + f1(x) + ' ' + f1(y) + ')" opacity="' + (q > 0.8 ? (1 - q) / 0.2 : 1).toFixed(3) + '">' + esc(e.text || '') + '</text>';
      }
    });
    return out;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // lớp màn hình: màu (grade), vạch tốc độ, viền tối, khung điện ảnh, chớp trắng
  function stateAt(tl, r, kind) {   // sự kiện bật / tắt kiểu "từ giờ" (grade, letterbox): lấy cái gần nhất trước r
    var v = null; tl.events.forEach(function (e) { if (e[kind] !== undefined && e.rt <= r) v = { v: e[kind], rt: e.rt }; }); return v;
  }
  // opts.bare: lồng vào phim (không viền tối, không tiêu đề)
  function overlaySvg(tl, r, opts) {
    var s = '', bare = opts && opts.bare;
    var g = stateAt(tl, r, 'grade'), GR = { cool: ['#3a6db0', 0.22], warm: ['#ff9a3c', 0.16], dark: ['#10131c', 0.35], gold: ['#ffd66b', 0.18] };
    if (g && GR[g.v]) s += '<rect width="' + SW + '" height="' + SH + '" fill="' + GR[g.v][0] + '" opacity="' + (GR[g.v][1] * Math.min(1, (r - g.rt) / 0.25)).toFixed(3) + '" style="mix-blend-mode:multiply"/>';
    tl.events.forEach(function (e) {
      if (!e.lines || r < e.rt || r > e.rt + e.lines) return;
      var fr = Math.floor(r * 30), q = (r - e.rt) / e.lines, op = Math.min(1, q * 6, (1 - q) * 6);
      for (var i = 0; i < 26; i++) {
        var a = rnd(fr * 31 + i) * Math.PI * 2, r0 = 150 + rnd(fr + i * 7) * 60, r1 = 340, cx = SW / 2, cy = SH / 2;
        if (e.style === 'h') { var yy = rnd(fr * 13 + i) * SH, xx = rnd(fr * 7 + i) * SW; s += '<line x1="' + f1(xx) + '" y1="' + f1(yy) + '" x2="' + f1(xx + 120 + rnd(i) * 160) + '" y2="' + f1(yy) + '" stroke="#ffffff" stroke-width="' + f1(1 + rnd(i * 3) * 2.5) + '" opacity="' + (0.55 * op).toFixed(3) + '"/>'; continue; }
        s += '<line x1="' + f1(cx + Math.cos(a) * r0) + '" y1="' + f1(cy + Math.sin(a) * r0 * 0.6) + '" x2="' + f1(cx + Math.cos(a) * r1 * 1.4) + '" y2="' + f1(cy + Math.sin(a) * r1) + '" stroke="#ffffff" stroke-width="' + f1(1.2 + rnd(i * 5 + fr) * 2.6) + '" opacity="' + (0.6 * op).toFixed(3) + '"/>';
      }
    });
    if (!bare) s += '<rect width="' + SW + '" height="' + SH + '" fill="url(#gcc-vig)"/>';
    var lb = stateAt(tl, r, 'letterbox'), lbv = lb ? (lb.v ? Math.min(1, (r - lb.rt) / 0.4) : Math.max(0, 1 - (r - lb.rt) / 0.4)) : 0;
    if (lbv > 0) { var hb = (36 * lbv).toFixed(1); s += '<rect width="' + SW + '" height="' + hb + '" fill="#000"/><rect y="' + (SH - hb) + '" width="' + SW + '" height="' + hb + '" fill="#000"/>'; }
    tl.events.forEach(function (e) { if (e.flash && r >= e.rt && r < e.rt + 0.18) s += '<rect width="' + SW + '" height="' + SH + '" fill="' + (e.flashColor || '#fff') + '" opacity="' + (e.flash * (1 - (r - e.rt) / 0.18)).toFixed(3) + '"/>'; });
    var ttl = !bare && tl.events.filter(function (e) { return e.title && r >= e.rt && r < e.rt + (e.hold || 2.5); })[0];
    if (ttl) {
      var qa = Math.min(1, (r - ttl.rt) / 0.3);
      s += '<g opacity="' + qa.toFixed(3) + '"><rect x="0" y="' + (SH - 100) + '" width="' + SW + '" height="70" fill="url(#gcc-band)"/><text x="' + SW / 2 + '" y="' + (SH - 64) + '" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#fff8e6" stroke="#2b211d" stroke-width="5" paint-order="stroke">' + esc(ttl.title) + '</text>' +
        (ttl.sub ? '<text x="' + SW / 2 + '" y="' + (SH - 42) + '" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="#fff8e6" stroke="#2b211d" stroke-width="3" paint-order="stroke">' + esc(ttl.sub) + '</text>' : '') + '</g>';
    }
    return s;
  }
  var DEFS = '<defs><radialGradient id="gcc-vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.38"/></radialGradient>' +
    '<linearGradient id="gcc-band" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>';
  // bóng mờ (afterimage) khi lướt: vẽ lại diễn viên ở các thời điểm trước, mờ dần
  function ghostsSvg(tl, r, s, asSvg) {
    var out = '';
    tl.events.forEach(function (e) {
      if (!e.ghosts || r < e.rt || r > e.rt + e.ghosts) return;
      [0.05, 0.1, 0.15].forEach(function (d, i) { var F = finalAt(tl, Math.max(0, s - d), e.a); out += asSvg(F, ' opacity="' + (0.34 - i * 0.1).toFixed(2) + '"'); });
    });
    return out;
  }
  // mọi diễn viên ở giờ truyện s, xếp theo chiều sâu (hàng sau vẽ trước); cùng hàng: người đang ra đòn vẽ sau cùng
  function allAt(tl, s) {
    return (tl.actors || [tl]).map(function (A, i) { return finalAt(tl, s, i); }).sort(function (p, q) { return p.G - q.G || (q.ai === 0) - (p.ai === 0); });
  }
  // một khung hình hoàn chỉnh (Node / xuất ảnh / kiểm thử): r = giây thật
  function frameSVG(tl, r, opts) {
    opts = opts || {};
    var c = camAt(tl, r), s = c.s, Fs = allAt(tl, s), A = sceneArt(tl);
    var w = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SW + ' ' + SH + '"' + (opts.size ? ' width="' + opts.size + '" height="' + Math.round(opts.size * SH / SW) + '"' : '') + ' style="background:#000">' + DEFS;
    w += '<g transform="' + layerTf(c, PARALLAX.sky) + '">' + A.sky + '</g><g transform="' + layerTf(c, PARALLAX.far) + '">' + A.far + '</g><g transform="' + layerTf(c, PARALLAX.mid) + '">' + A.mid + '</g>';
    w += '<g transform="' + layerTf(c, 1) + '">' + A.ground + Fs.map(function (F) { return shadowSvg(tl, F); }).join('') + ghostsSvg(tl, r, s, function (G2, ex) { return actorSvg(tl, G2, ex); }) +
      Fs.map(function (F) { return actorSvg(tl, F); }).join('') + fxSvg(tl, r, s) + '</g>';
    w += '<g transform="' + layerTf(c, PARALLAX.front) + '">' + A.front + '</g>' + A.weather + A.tint + overlaySvg(tl, r);
    return w + '</svg>';
  }

  /* --------------------------------------------------------- 7. BỘ PHÁT (DOM) */
  function player(box, tl, opts) {
    opts = opts || {};
    var NS = 'http://www.w3.org/2000/svg', A = GC.audio, A0 = sceneArt(tl);
    if (GC.render && GC.render.injectCSS) GC.render.injectCSS();
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + SW + ' ' + SH); svg.setAttribute('class', 'gcc-stage'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', tl.title || 'Biên đạo');
    svg.innerHTML = DEFS + '<g data-p="sky">' + A0.sky + '</g><g data-p="far">' + A0.far + '</g><g data-p="mid">' + A0.mid + '</g>' +
      '<g data-p="ground">' + A0.ground + '<g class="gcc-shs"></g><g class="gcc-ghosts"></g><g class="gcc-actors"></g><g class="gcc-fx"></g></g>' +
      '<g data-p="front">' + A0.front + '</g>' + A0.weather + A0.tint + '<g class="gcc-ov"></g>';
    box.appendChild(svg);
    var P = {}; Array.prototype.forEach.call(svg.querySelectorAll('[data-p]'), function (g) { P[g.getAttribute('data-p')] = g; });
    var fxG = svg.querySelector('.gcc-fx'), ov = svg.querySelector('.gcc-ov'), gh = svg.querySelector('.gcc-ghosts');
    // mỗi diễn viên: một nhóm lớp vẽ (đổi nội dung khi nét mặt / góc nhìn đổi) + một bóng đổ
    var cast = (tl.actors || [tl]).map(function () {
      var g = document.createElementNS(NS, 'g'), sh = document.createElementNS(NS, 'ellipse'), groups = {};
      g.setAttribute('class', 'gc-full');
      GC.RIG.layers.forEach(function (l) { var q = document.createElementNS(NS, 'g'); g.appendChild(q); groups[l[0]] = q; });
      svg.querySelector('.gcc-actors').appendChild(g); svg.querySelector('.gcc-shs').appendChild(sh);
      return { g: g, sh: sh, groups: groups, sig: null };
    });
    var r = 0, playing = false, last = 0, raf = 0, fired = {}, hold = 0;
    function paint() {
      var c = camAt(tl, r), Fs = allAt(tl, c.s), F = Fs.filter(function (x) { return x.ai === 0; })[0];
      ['sky', 'far', 'mid', 'front'].forEach(function (k) { P[k].setAttribute('transform', layerTf(c, PARALLAX[k])); });
      P.ground.setAttribute('transform', layerTf(c, 1));
      Fs.forEach(function (G2, z) {
        var C2 = cast[G2.ai];
        if (C2.g.parentNode.childNodes[z] !== C2.g) C2.g.parentNode.insertBefore(C2.g, C2.g.parentNode.childNodes[z] || null);   // thứ tự vẽ theo chiều sâu
        if (G2.sig !== C2.sig) { C2.sig = G2.sig; GC.RIG.layers.forEach(function (l) { C2.groups[l[0]].innerHTML = G2.layers[l[0]] || ''; }); }
        var chain = GC.chainTransforms(G2.pose);
        GC.RIG.layers.forEach(function (l) { C2.groups[l[0]].setAttribute('transform', chain[l[1]]); });
        C2.g.setAttribute('transform', 'translate(' + f1(G2.x - 100 * G2.K) + ' ' + f1(G2.G - 228 * G2.K) + ') scale(' + G2.K + ')');
        var lift = Math.max(0, -G2.pose.root.y), k = Math.max(0.3, 1 - lift / 110);
        C2.sh.setAttribute('cx', f1(G2.x)); C2.sh.setAttribute('cy', f1(G2.G + 1)); C2.sh.setAttribute('rx', f1(44 * G2.K * k)); C2.sh.setAttribute('ry', f1(7 * G2.K * k)); C2.sh.setAttribute('fill', 'rgba(20,24,22,' + (0.2 * k).toFixed(3) + ')');
      });
      gh.innerHTML = ghostsSvg(tl, r, c.s, function (G2, ex) { return actorSvg(tl, G2, ex); });
      fxG.innerHTML = fxSvg(tl, r, c.s);
      ov.innerHTML = overlaySvg(tl, r);
      if (opts.onTick) opts.onTick(r, F.seg);
    }
    function sound(r0, r1) {
      if (!A || r1 < r0) return;
      tl.events.forEach(function (e) {
        if (fired[e.i] || e.rt < r0 || e.rt > r1) return;
        fired[e.i] = 1;
        var pan = Math.max(-0.8, Math.min(0.8, (e.x != null ? e.x : xAt(actorOf(tl, e.a), e.t)) / tl.W * 2 - 1));
        if (e.sfx) [].concat(e.sfx).forEach(function (n, i) { A.sfx(n, { gain: e.gain != null ? e.gain : 0.8, pan: pan }); });
        if (e.music !== undefined) A.music(e.music);
        if (e.ambient !== undefined) A.ambient(e.ambient);
      });
    }
    function loop(now) {
      if (!playing) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      if (hold > 0) { hold -= dt; if (hold <= 0) { r = 0; fired = {}; } }
      else {
        var r0 = r; r = Math.min(tl.real, r + dt);
        sound(r0, r);
        if (r >= tl.real) { if (opts.loop) hold = 1.6; else { playing = false; if (opts.onEnd) opts.onEnd(); } }
      }
      paint();
      raf = requestAnimationFrame(loop);
    }
    paint();
    return {
      el: svg, duration: tl.real,
      play: function () { if (playing) return; if (A && A.unlock) A.unlock(); if (r >= tl.real) { r = 0; fired = {}; } playing = true; last = 0; raf = requestAnimationFrame(loop); },
      pause: function () { playing = false; cancelAnimationFrame(raf); if (A) A.stopAll(); },
      seek: function (t) { r = Math.max(0, Math.min(tl.real, t)); fired = {}; tl.events.forEach(function (e) { if (e.rt < r) fired[e.i] = 1; }); paint(); },
      get time() { return r; }, get playing() { return playing; },
      destroy: function () { playing = false; cancelAnimationFrame(raf); if (A) A.stopAll(); svg.remove(); }
    };
  }

  /* ------------------------------------------------------ 8. ĐO (test / trang demo) */
  // độ mượt: mỗi khung thật (fps), điểm mốc cơ thể dịch bao nhiêu đơn vị thế giới. Khung đổi góc nhìn (bản vẽ đổi) đo riêng,
  // so khớp cả khi trái ↔ phải đổi nhãn do lật gương. Đa dạng: "dáng đỉnh" (xa tư thế đứng nhất) của mỗi hành vi so từng cặp.
  function measure(tl, fps) {
    fps = fps || 60;
    var sw = function (k) { return /L$/.test(k) ? k.replace(/L$/, 'R') : /R$/.test(k) ? k.replace(/R$/, 'L') : k; };
    var at = function (r) {
      var s = realToStory(tl, r), F = finalAt(tl, s), kp = GC.keyPoints(F.pose), o = {};
      for (var k in kp) o[k] = [F.x + (kp[k][0] - 100) * tl.K, tl.G + (kp[k][1] - 228) * tl.K];
      return { o: o, F: F };
    };
    var jump = function (a, b, swap) { var m = 0; for (var k in b.o) { var q = a.o[swap ? sw(k) : k]; m = Math.max(m, Math.hypot(b.o[k][0] - q[0], b.o[k][1] - q[1])); } return m; };
    var prev = at(0), moves = [], turns = [], maxAt = 0, maxMove = 0;
    for (var f = 1; f <= Math.ceil(tl.real * fps); f++) {
      var r = Math.min(tl.real, f / fps), cur = at(r);
      if (cur.F.view !== prev.F.view) turns.push(Math.min(jump(prev, cur, false), jump(prev, cur, true)));
      else { var m = jump(prev, cur, false); moves.push(m); if (m > maxMove) { maxMove = m; maxAt = r; } }
      prev = cur;
    }
    var sorted = moves.slice().sort(function (a, b) { return a - b; }), pct = function (q) { return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] || 0; };
    var standKP = GC.keyPoints(GC.neutralPose()), peaks = tl.segments.map(function (sg) {
      var best = null, bd = -1;
      tl.keys.forEach(function (k) { if (k.t <= sg.t0 || k.t > sg.t1) return; var P = finalAt(tl, k.t).pose, kp = GC.keyPoints(P), d = 0, n = 0; for (var q in kp) { d += Math.hypot(kp[q][0] - standKP[q][0], kp[q][1] - standKP[q][1]); n++; } d /= n; if (d > bd) { bd = d; best = P; } });
      return { id: sg.id, pose: best, d: bd };
    });
    var minPair = Infinity, pairAt = '', sum = 0, np = 0;
    for (var i = 0; i < peaks.length; i++) for (var j = i + 1; j < peaks.length; j++) {
      var d = GC.poseDistance(peaks[i].pose, peaks[j].pose); sum += d; np++;
      if (d < minPair) { minPair = d; pairAt = peaks[i].id + '↔' + peaks[j].id; }
    }
    var ids = tl.segments.map(function (s) { return s.id; });
    var slow = 0, fast = 0;
    for (var t = 0; t < tl.T; t += 0.05) { var rr = (storyToReal(tl, t + 0.05) - storyToReal(tl, t)) / 0.05; if (rr > 1.5) slow += 0.05; else if (rr < 0.8) fast += 0.05; }
    return {
      real: tl.real, story: tl.T, behaviors: ids.length, unique: ids.filter(function (x, i) { return ids.indexOf(x) === i; }).length,
      keys: tl.keys.length, frames: moves.length + turns.length, fps: fps,
      move: { p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: maxMove, maxAt: maxAt },
      turns: { n: turns.length, max: turns.length ? Math.max.apply(null, turns) : 0 },
      variety: { minPair: minPair, minPairAt: pairAt, meanPair: np ? sum / np : 0, minPeak: Math.min.apply(null, peaks.map(function (p) { return p.d; })) },
      time: { slowmo: +slow.toFixed(2), fast: +fast.toFixed(2), hitstops: tl.events.filter(function (e) { return e.hitstop; }).length },
      sfx: tl.events.filter(function (e) { return e.sfx; }).length, fx: tl.events.filter(function (e) { return e.fx || e.lines || e.ghosts; }).length,
      faces: tl.faces.length, views: tl.keys.map(function (k) { return k.view; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length
    };
  }

  GC.choreo = {
    HZ: HZ, EASE: EASE, POSES: POSES, CLIPS: CLIPS, ORDER: ORDER, SPRINGS: SPRINGS,
    pose: pose, clip: clip, resolve: resolve, swapLR: swapLR,
    build: build, duel: duel, solo: solo, impacts: impacts, finalAt: finalAt, allAt: allAt, pointAt: pointAt, weaponOf: weaponOf, fxSvg: fxSvg, overlaySvg: overlaySvg, storyToReal: storyToReal, realToStory: realToStory, camAt: camAt,
    frameSVG: frameSVG, player: player, measure: measure, demos: {}
  };
})(typeof window !== 'undefined' ? window.GenChibi : globalThis.GenChibi);
