/* gen-chibi engine — core 0.2
 * © 2026 Afi Labs — All rights reserved.
 *
 * Lõi không phụ thuộc thư viện ngoài. Gồm:
 *   1. RIG     khung xương chung của loại asset "character" (khớp, điểm neo, thứ tự lớp vẽ)
 *   2. PACK    mọi linh kiện, biểu cảm, động tác, nhân vật đều thuộc một thư viện có chủ + license
 *   3. RESOLVE trạng thái cuối = kho → trait (theo bộ phận) → nhân vật → đạo diễn, có ghi nguồn
 *   4. COMPOSE công thức + trạng thái → SVG theo từng lớp; tham số linh kiện thành transform
 *   5. MOTION  động tác là dữ liệu keyframe trên khớp
 *   6. DIRECTOR schema tự sinh từ kho, validator
 *   7. GATES   cổng kiểm tự động
 * Tầng vẽ (ảnh cache / thở / diễn đủ, ngân sách hiệu năng) nằm ở engine/render.js.
 */
(function (G) {
  'use strict';

  var INK = '#2b211d';
  var VERSION = '0.2.0';

  /* ---------------------------------------------------------------- 1. RIG */
  var RIG = {
    box: [-24, -18, 248, 258],
    crop: [34, 20, 132, 132],
    joints: {
      root:  { parent: null,    pivot: [100, 228] },
      body:  { parent: 'root',  pivot: [100, 214] },
      head:  { parent: 'body',  pivot: [100, 150] },
      armL:  { parent: 'body',  pivot: [78, 160] },
      foreL: { parent: 'armL',  pivot: [74, 177] },
      handL: { parent: 'foreL', pivot: [72, 193] },
      armR:  { parent: 'body',  pivot: [122, 160] },
      foreR: { parent: 'armR',  pivot: [126, 177] },
      handR: { parent: 'foreR', pivot: [128, 193] }
    },
    anchors: {
      ground: [100, 228], waist: [100, 186], chest: [100, 168],
      face: [100, 100], crown: [100, 54], forehead: [100, 76],
      eyeL: [80, 108], eyeR: [120, 108], browL: [80, 90], browR: [120, 90],
      mouth: [100, 131], chin: [100, 146], cheekL: [69, 124], cheekR: [131, 124],
      elbowL: [74, 177], elbowR: [126, 177], gripL: [72, 193], gripR: [128, 193]
    },
    // [lớp, khớp]. Thứ tự vẽ tách khỏi cây khớp (như slot của Spine).
    layers: [
      ['fxBack', 'root'], ['hairBack', 'head'], ['backItem', 'body'], ['legs', 'root'],
      ['body', 'body'], ['ears', 'head'], ['head', 'head'], ['mask', 'head'], ['shade', 'head'],
      ['cheeks', 'head'], ['eyes', 'head'], ['brows', 'head'], ['beard', 'head'],
      ['mouth', 'head'], ['mustache', 'head'], ['hairFront', 'head'], ['hat', 'head'],
      ['fxHead', 'head'],
      ['armL', 'armL'], ['foreL', 'foreL'], ['heldL', 'handL'], ['handL', 'handL'],
      ['armR', 'armR'], ['foreR', 'foreR'], ['heldR', 'handR'], ['handR', 'handR'],
      ['fxFront', 'root']
    ]
  };
  var JOINT_IDS = Object.keys(RIG.joints);
  var LAYER_IDS = RIG.layers.map(function (l) { return l[0]; });
  var CHANNELS = ['x', 'y', 'rot', 'sx', 'sy'];

  /* --------------------------------------------------------------- 2. PACK */
  var PACKS = {};
  var LIB = {
    slots: {}, parts: {}, eyeStyles: {}, eyePoses: {}, browStyles: {}, browPoses: {},
    mouths: {}, fx: {}, motions: {}, states: {}, stateOrder: [], traits: [], defaults: {}, profiles: {}
  };
  var ASSETS = {};      // 'pack/id' → asset nhân vật
  var ASSET_ORDER = [];

  // Mỗi mục đăng ký mang theo `pack` để biết chủ, license, nhóm thư viện.
  function pack(meta, fill) {
    if (!meta || !/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(meta.id)) throw new Error('id thư viện phải dạng chu.ten: ' + (meta && meta.id));
    var P = PACKS[meta.id] = {
      id: meta.id, name: meta.name, owner: meta.owner, group: meta.group || 'community',
      visibility: meta.visibility || 'private', license: meta.license, version: meta.version || '0.0.1',
      description: meta.description || '', counts: {}
    };
    function tag(o, kind) { o.pack = P.id; P.counts[kind] = (P.counts[kind] || 0) + 1; return o; }
    var D = {
      slot: function (id, def) { LIB.slots[id] = tag(def, 'slot'); },
      part: function (def) {
        if (!LIB.slots[def.slot]) throw new Error('slot lạ: ' + def.slot);
        def.license = def.license || P.license;
        LIB.parts[P.id + '/' + def.slot + ':' + def.id] = tag(def, 'part');
      },
      eyeStyle: function (id, def) { LIB.eyeStyles[id] = tag(def, 'eyeStyle'); },
      eyePose: function (id, fn) { fn.pack = P.id; LIB.eyePoses[id] = fn; P.counts.eyePose = (P.counts.eyePose || 0) + 1; },
      browStyle: function (id, def) { LIB.browStyles[id] = tag(def, 'browStyle'); },
      browPose: function (id, def) { LIB.browPoses[id] = tag(def, 'browPose'); },
      mouth: function (id, fn) { fn.pack = P.id; LIB.mouths[id] = fn; P.counts.mouth = (P.counts.mouth || 0) + 1; },
      fx: function (id, def) { LIB.fx[id] = tag(typeof def === 'function' ? { draw: def } : def, 'fx'); },
      motion: function (id, def) { def.id = id; LIB.motions[id] = tag(def, 'motion'); },
      state: function (id, def) { def.id = id; LIB.states[id] = tag(def, 'state'); if (LIB.stateOrder.indexOf(id) < 0) LIB.stateOrder.push(id); },
      trait: function (def) { LIB.traits.push(tag(def, 'trait')); },
      profile: function (id, def) { def.id = id; LIB.profiles[id] = tag(def, 'profile'); },
      defaults: function (pal) { for (var k in pal) LIB.defaults[k] = pal[k]; },
      asset: function (def) { registerAsset(P.id, def); }
    };
    fill(D);
    return P;
  }

  function registerAsset(packId, def) {
    def = migrate(def);
    def.pack = packId;
    def.key = packId + '/' + def.id;
    if (!ASSETS[def.key]) ASSET_ORDER.push(def.key);
    ASSETS[def.key] = def;
    if (PACKS[packId]) PACKS[packId].counts.character = (PACKS[packId].counts.character || 0) + 1;
    return def;
  }

  // Công thức 0.1 (eyes/brows/parts/palette ở ngoài) → 0.2 (gom vào look)
  function migrate(a) {
    if (a.look) return a;
    a.look = { eyes: a.eyes, brows: a.brows, parts: a.parts || {}, params: {}, palette: a.palette || {} };
    delete a.eyes; delete a.brows; delete a.parts; delete a.palette;
    a.kind = 'character';
    a.version = a.version || 1;
    a.status = a.status || 'draft';
    a.expressions = a.expressions || {};
    a.lines = a.lines || {};
    return a;
  }

  // Tham chiếu linh kiện: "id" (tìm trong thư viện của asset rồi các thư viện khác) hoặc "pack/id"
  function getPart(slot, ref, preferPack) {
    if (!ref) return null;
    if (ref.indexOf('/') > 0) {
      var sp = ref.split('/');
      return LIB.parts[sp[0] + '/' + slot + ':' + sp[1]] || null;
    }
    if (preferPack && LIB.parts[preferPack + '/' + slot + ':' + ref]) return LIB.parts[preferPack + '/' + slot + ':' + ref];
    var keys = Object.keys(LIB.parts);
    for (var i = 0; i < keys.length; i++) {
      var p = LIB.parts[keys[i]];
      if (p.slot === slot && p.id === ref) return p;
    }
    return null;
  }
  function partsOfSlot(slot) {
    return Object.keys(LIB.parts).map(function (k) { return LIB.parts[k]; }).filter(function (p) { return p.slot === slot; });
  }
  function partRef(asset, slot) { return asset.look.parts[slot] || (LIB.slots[slot] || {}).fallback; }

  /* ------------------------------------------------------------ 3. RESOLVE */
  var SRC = { lib: 'Kho', asset: 'Nhân vật', director: 'Đạo diễn' };

  function traitsOf(asset) {
    return LIB.traits.filter(function (t) {
      return Object.keys(t.if).every(function (slot) {
        var v = slot === 'eyes' ? asset.look.eyes : partRef(asset, slot);
        return t.if[slot].indexOf(v) >= 0;
      });
    });
  }

  function resolveState(asset, stateId, director) {
    var base = LIB.states[stateId] || LIB.states.normal;
    var st = {
      id: base.id, eyes: base.eyes, brows: base.brows, mouth: base.mouth,
      fx: (base.fx || []).slice(), motion: base.motion, traits: [],
      src: { eyes: SRC.lib, brows: SRC.lib, mouth: SRC.lib, fx: SRC.lib, motion: SRC.lib }
    };
    traitsOf(asset).forEach(function (t) {
      var o = t.over[base.id];
      if (!o) return;
      st.traits.push(t.id);
      ['eyes', 'brows', 'mouth', 'motion'].forEach(function (k) { if (o[k]) { st[k] = o[k]; st.src[k] = 'Trait · ' + t.label; } });
      if (o.fxAdd) { st.fx = st.fx.concat(o.fxAdd); st.src.fx = 'Kho + trait'; }
    });
    var ov = (asset.expressions || {})[base.id];
    if (ov) {
      ['eyes', 'brows', 'mouth', 'motion'].forEach(function (k) { if (ov[k]) { st[k] = ov[k]; st.src[k] = SRC.asset; } });
      if (ov.fx) { st.fx = ov.fx.slice(); st.src.fx = SRC.asset; }
      if (ov.fxAdd) { st.fx = st.fx.concat(ov.fxAdd); st.src.fx = SRC.asset; }
      if (ov.fxRemove) { st.fx = st.fx.filter(function (f) { return ov.fxRemove.indexOf(f) < 0; }); st.src.fx = SRC.asset; }
    }
    if (director) {
      ['eyes', 'brows', 'mouth'].forEach(function (k) { if (director[k]) { st[k] = director[k]; st.src[k] = SRC.director; } });
      if (director.motion) { st.motion = director.motion; st.src.motion = SRC.director; }
      if (director.fx) { st.fx = st.fx.concat(director.fx); st.src.fx = SRC.director; }
    }
    st.fx = st.fx.filter(function (f, i) { return st.fx.indexOf(f) === i; });
    return st;
  }

  /* ------------------------------------------------------------ 4. COMPOSE */
  var HEX = /^#[0-9a-fA-F]{3,8}$/;
  function palette(asset) {
    var P = {}, k;
    for (k in LIB.defaults) P[k] = LIB.defaults[k];
    // chỉ nhận mã màu hex: công thức có thể do người hoặc AI viết, không cho chèn markup vào SVG
    var src = asset.look.palette || {};
    for (k in src) if (HEX.test(String(src[k]))) P[k] = src[k];
    return P;
  }

  function num(v, def, min, max) {
    var n = typeof v === 'number' && isFinite(v) ? v : def;
    return Math.max(min, Math.min(max, n));
  }
  // Giá trị tham số đã kẹp vào khoảng cho phép
  function paramValues(asset, slot, defs) {
    var raw = ((asset.look.params || {})[slot]) || {}, out = {};
    for (var k in defs) out[k] = num(raw[k], defs[k].def, defs[k].min, defs[k].max);
    return out;
  }
  // Tham số kiểu transform: scale / scaleX / scaleY quanh pivot, dx / dy
  function paramTransform(defs, vals) {
    var t = '';
    for (var k in defs) {
      var d = defs[k], v = vals[k];
      if (v === d.def || !d.type) continue;
      var p = d.pivot || [100, 100];
      if (d.type === 'dx') t += ' translate(' + v + ' 0)';
      else if (d.type === 'dy') t += ' translate(0 ' + v + ')';
      else {
        var sx = d.type === 'scaleY' ? 1 : v, sy = d.type === 'scaleX' ? 1 : v;
        t += ' translate(' + p[0] + ' ' + p[1] + ') scale(' + sx + ' ' + sy + ') translate(' + (-p[0]) + ' ' + (-p[1]) + ')';
      }
    }
    return t.trim();
  }

  function compose(asset, stateId, director) {
    var st = resolveState(asset, stateId, director);
    var P = palette(asset);
    var head = getPart('head', partRef(asset, 'head'), asset.pack) || getPart('head', 'round');
    var mask = getPart('mask', partRef(asset, 'mask'), asset.pack);
    P.eyeArea = (mask && mask.eyeArea) || P.skin;
    var C = { P: P, A: RIG.anchors, shape: head.shape, ink: INK, asset: asset };
    var out = {};
    LAYER_IDS.forEach(function (l) { out[l] = ''; });

    function put(res, wrap) {
      if (!res) return;
      for (var layer in res) {
        if (!(layer in out)) throw new Error('lớp lạ: ' + layer);
        out[layer] += wrap ? '<g transform="' + wrap + '">' + res[layer] + '</g>' : res[layer];
      }
    }

    Object.keys(LIB.slots).forEach(function (slot) {
      var ref = partRef(asset, slot);
      if (!ref) return;
      var p = getPart(slot, ref, asset.pack);
      if (!p) throw new Error('thiếu linh kiện ' + slot + ':' + ref);
      var vals = p.params ? paramValues(asset, slot, p.params) : {};
      put(p.draw(C, st, vals), p.params ? paramTransform(p.params, vals) : '');
    });

    // đồ cầm tay: động tác cần tay trống thì cất; đồ dài cất khi tay đưa vào giữa mặt
    var hide = (LIB.motions[st.motion] || {}).hide || [];
    st.upright = {};
    ['L', 'R'].forEach(function (s) {
      var ref = partRef(asset, 'held' + s);
      var p = ref && ref !== 'none' ? getPart('held' + s, ref, asset.pack) : null;
      st.upright[s] = !!p && p.upright !== false;
      if (hide.indexOf('held' + s) >= 0 || (p && p.tall && hide.indexOf('tall' + s) >= 0)) out['held' + s] = '';
    });
    out.handL += hand(C, 'L');
    out.handR += hand(C, 'R');

    // khuôn mặt = kiểu (theo công thức, có tham số) × dáng (theo trạng thái)
    var es = LIB.eyeStyles[asset.look.eyes] || LIB.eyeStyles.round;
    var ep = LIB.eyePoses[st.eyes];
    if (!ep) throw new Error('thiếu dáng mắt ' + st.eyes);
    var ev = paramValues(asset, 'eyes', EYE_PARAMS);
    [-1, 1].forEach(function (side) {
      var a = side < 0 ? C.A.eyeL : C.A.eyeR;
      var x = a[0] + side * ev.gap, y = a[1] + ev.y;
      out.eyes += '<g transform="translate(' + x + ' ' + y + ') scale(' + ev.size + ') translate(' + (-x) + ' ' + (-y) + ')">' + ep(es, side, x, y, C) + '</g>';
    });

    var bs = LIB.browStyles[asset.look.brows] || LIB.browStyles.normal;
    var bp = LIB.browPoses[st.brows];
    if (!bp) throw new Error('thiếu dáng mày ' + st.brows);
    var bv = paramValues(asset, 'brows', BROW_PARAMS);
    out.brows += brow(bs, bp, -1, C, bv) + brow(bs, bp, 1, C, bv);

    var m = LIB.mouths[st.mouth];
    if (!m) throw new Error('thiếu dáng miệng ' + st.mouth);
    var mv = paramValues(asset, 'mouth', MOUTH_PARAMS);
    out.mouth += '<g transform="translate(0 ' + mv.y + ') translate(100 131) scale(' + mv.size + ') translate(-100 -131)">' + m(C) + '</g>';

    st.fx.forEach(function (id) {
      var f = LIB.fx[id];
      if (!f) throw new Error('thiếu hiệu ứng ' + id);
      put(f.draw(C));
    });
    return { layers: out, state: st };
  }

  // Tham số khuôn mặt của engine (mọi kiểu mắt/mày/miệng đều hưởng)
  var EYE_PARAMS = {
    size: { label: 'Cỡ mắt', min: 0.7, max: 1.45, step: 0.05, def: 1 },
    gap: { label: 'Khoảng cách hai mắt', min: -5, max: 6, step: 0.5, def: 0 },
    y: { label: 'Độ cao mắt', min: -6, max: 6, step: 0.5, def: 0 }
  };
  var BROW_PARAMS = {
    y: { label: 'Độ cao mày', min: -6, max: 6, step: 0.5, def: 0 },
    weight: { label: 'Độ dày mày', min: 0.6, max: 1.8, step: 0.1, def: 1 }
  };
  var MOUTH_PARAMS = {
    size: { label: 'Cỡ miệng', min: 0.7, max: 1.4, step: 0.05, def: 1 },
    y: { label: 'Độ cao miệng', min: -4, max: 5, step: 0.5, def: 0 }
  };
  var HEAD_PARAMS = { size: { label: 'Cỡ đầu (tỉ lệ chibi)', min: 0.85, max: 1.2, step: 0.01, def: 1 } };
  var FACE_PARAMS = { eyes: EYE_PARAMS, brows: BROW_PARAMS, mouth: MOUTH_PARAMS, rig: HEAD_PARAMS };

  function hand(C, side) {
    var g = side === 'L' ? C.A.gripL : C.A.gripR;
    return '<circle cx="' + g[0] + '" cy="' + g[1] + '" r="7.5" fill="' + C.P.skin + '" stroke="' + INK + '" stroke-width="2.6"/>' +
      '<path d="M' + (g[0] - 4) + ',' + (g[1] + 2) + ' q4,3 8,0" fill="none" stroke="' + C.P.skinShade + '" stroke-width="1.6" stroke-linecap="round"/>';
  }

  function brow(S, pose, side, C, bv) {
    var c = side < 0 ? C.A.browL : C.A.browR;
    // rot > 0 = đầu trong cụp xuống (giận); mày phải lấy rotR/dyR nếu dáng lệch hai bên
    var rIn = side > 0 && pose.rotR !== undefined ? pose.rotR : (pose.rot || 0);
    var dy = side > 0 && pose.dyR !== undefined ? pose.dyR : (pose.dy || 0);
    var x = c[0], y = c[1] + dy + bv.y;
    var rot = side < 0 ? rIn : -rIn;
    var half = S.len / 2, arc = pose.arc === undefined ? 2 : pose.arc;
    var d = 'M' + (x - half) + ',' + y + ' Q' + x + ',' + (y - arc) + ' ' + (x + half) + ',' + y;
    return '<path d="' + d + '" fill="none" stroke="' + (C.P.brow || C.P.hair) + '" stroke-width="' + (S.w * bv.weight).toFixed(2) +
      '" stroke-linecap="round" transform="rotate(' + rot + ' ' + x + ' ' + y + ')"/>';
  }

  /* ------------------------------------------------------------- 5. MOTION */
  function neutralPose() {
    var p = {};
    JOINT_IDS.forEach(function (j) { p[j] = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }; });
    return p;
  }

  function sampleKeys(keys, u) {
    if (keys.length === 1 || u <= keys[0][0]) return keys[0][1];
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      if (u <= b[0]) {
        var s = (u - a[0]) / Math.max(1e-6, b[0] - a[0]);
        s = s * s * (3 - 2 * s);
        return a[1] + (b[1] - a[1]) * s;
      }
    }
    return keys[keys.length - 1][1];
  }

  // Tư thế đích tại thời điểm t (giây). still = khung đứng yên đại diện (dùng cho ảnh cache).
  function poseAt(asset, st, t, still) {
    var m = LIB.motions[st.motion] || LIB.motions.idle;
    var pose = neutralPose();
    var u = still ? (m.still || 0) : (m.loop === false ? Math.min(1, t / m.dur) : (t % m.dur) / m.dur);
    for (var j in m.tracks) for (var ch in m.tracks[j]) pose[j][ch] = sampleKeys(m.tracks[j][ch], u);
    if (m.breath !== false && !still) pose.body.sy *= 1 + Math.sin(t * 2.4) * 0.012;
    // "trọng lực" cho đồ cầm tay: nếu động tác không tự điều khiển bàn tay,
    // bàn tay xoay ngược tổng góc các khớp cha để binh khí luôn đứng thẳng
    ['L', 'R'].forEach(function (s) {
      if (!st.upright || !st.upright[s] || (m.tracks['hand' + s] && m.tracks['hand' + s].rot)) return;
      pose['hand' + s].rot = -(pose['arm' + s].rot + pose['fore' + s].rot + pose.body.rot + pose.root.rot);
    });
    var hs = paramValues(asset, 'rig', HEAD_PARAMS).size;
    pose.head.sx *= hs; pose.head.sy *= hs;
    return pose;
  }

  function jointLocal(j, p) {
    var pv = RIG.joints[j].pivot;
    return 'translate(' + (pv[0] + p.x).toFixed(2) + ' ' + (pv[1] + p.y).toFixed(2) + ') rotate(' +
      p.rot.toFixed(2) + ') scale(' + p.sx.toFixed(3) + ' ' + p.sy.toFixed(3) + ') translate(' + (-pv[0]) + ' ' + (-pv[1]) + ')';
  }
  function chainTransforms(pose) {
    var chain = {};
    JOINT_IDS.forEach(function (j) {
      var par = RIG.joints[j].parent;
      chain[j] = (par ? chain[par] + ' ' : '') + jointLocal(j, pose[j]);
    });
    return chain;
  }

  // SVG tĩnh hoàn chỉnh (dùng cho ảnh cache, xuất file, gate). Không cần DOM.
  function svgString(asset, stateId, opts) {
    opts = opts || {};
    var c = compose(asset, stateId, opts.director);
    var pose = poseAt(asset, c.state, 0, true);
    var chain = chainTransforms(pose);
    var vb = (opts.crop ? RIG.crop : RIG.box).join(' ');
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + (opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : '') + '>';
    if (!opts.noShadow && !opts.crop) s += '<ellipse cx="100" cy="229" rx="46" ry="7" fill="rgba(20,24,22,.16)"/>';
    RIG.layers.forEach(function (l) {
      if (c.layers[l[0]]) s += '<g transform="' + chain[l[1]] + '">' + c.layers[l[0]] + '</g>';
    });
    return s + '</svg>';
  }

  /* ----------------------------------------------------------- 6. DIRECTOR */
  function castIds(cast) { return cast.map(function (a) { return a.id; }); }
  function directorSchema(cast) {
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'gen-chibi event', type: 'object', required: ['title', 'steps'], additionalProperties: false,
      properties: {
        title: { type: 'string', maxLength: 60 },
        steps: {
          type: 'array', minItems: 1, maxItems: 12,
          items: {
            type: 'object', required: ['actor', 'state', 'say'], additionalProperties: false,
            properties: {
              actor: { enum: castIds(cast) },
              state: { enum: LIB.stateOrder.slice() },
              motion: { enum: Object.keys(LIB.motions) },
              fx: { type: 'array', maxItems: 3, items: { enum: Object.keys(LIB.fx) } },
              say: { type: 'string', maxLength: 120 },
              hold: { type: 'number', minimum: 0.8, maximum: 6 }
            }
          }
        }
      }
    };
  }
  function validateEvent(ev, cast) {
    var errs = [], S = directorSchema(cast).properties.steps.items.properties;
    if (!ev || typeof ev !== 'object') return ['Kịch bản phải là một object JSON.'];
    if (typeof ev.title !== 'string' || !ev.title) errs.push('Thiếu "title".');
    if (!Array.isArray(ev.steps) || !ev.steps.length) return errs.concat('Thiếu "steps" (mảng ít nhất 1 cảnh).');
    if (ev.steps.length > 12) errs.push('Tối đa 12 cảnh.');
    ev.steps.forEach(function (s, i) {
      var n = 'Cảnh ' + (i + 1) + ': ';
      if (!s || typeof s !== 'object') { errs.push(n + 'phải là object.'); return; }
      Object.keys(s).forEach(function (k) { if (!S[k]) errs.push(n + 'khoá lạ "' + k + '".'); });
      if (S.actor.enum.indexOf(s.actor) < 0) errs.push(n + 'diễn viên "' + s.actor + '" không có trong dàn diễn viên.');
      if (S.state.enum.indexOf(s.state) < 0) errs.push(n + 'trạng thái "' + s.state + '" không có trong kho.');
      if (s.motion !== undefined && S.motion.enum.indexOf(s.motion) < 0) errs.push(n + 'động tác "' + s.motion + '" không có trong kho.');
      if (s.fx !== undefined) {
        if (!Array.isArray(s.fx) || s.fx.length > 3) errs.push(n + 'fx phải là mảng tối đa 3 phần tử.');
        else s.fx.forEach(function (f) { if (S.fx.items.enum.indexOf(f) < 0) errs.push(n + 'hiệu ứng "' + f + '" không có trong kho.'); });
      }
      if (typeof s.say !== 'string') errs.push(n + 'thiếu "say".');
      else if (s.say.length > 120) errs.push(n + '"say" dài quá 120 ký tự.');
      if (s.hold !== undefined && !(typeof s.hold === 'number' && s.hold >= 0.8 && s.hold <= 6)) errs.push(n + '"hold" phải trong khoảng 0.8–6 giây.');
    });
    return errs;
  }
  function directorPrompt(cast) {
    var L = [];
    L.push('Bạn là đạo diễn hài cho dàn nhân vật chibi của gen-chibi.');
    L.push('Viết kịch bản ngắn (3–6 cảnh) cho sự kiện mô tả cuối cùng. Biểu cảm luôn khoa trương, hài, không bạo lực, không máu.');
    L.push('Chỉ trả về MỘT object JSON đúng schema, không giải thích, không markdown.');
    L.push('', 'Diễn viên:');
    cast.forEach(function (a) { L.push('- ' + a.id + ': ' + a.name + ' — ' + (a.persona || '')); });
    L.push('', 'Trạng thái (state):');
    LIB.stateOrder.forEach(function (id) { L.push('- ' + id + ': ' + LIB.states[id].label + ' — ' + LIB.states[id].hint); });
    L.push('', 'Schema:', JSON.stringify(directorSchema(cast), null, 2), '', 'Sự kiện: <mô tả sự kiện ở đây>');
    return L.join('\n');
  }

  /* -------------------------------------------------------------- 7. GATES */
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function gate(asset) {
    var res = [];
    function add(id, label, ok, detail) { res.push({ id: id, label: label, ok: ok, detail: detail || '' }); }
    var look = asset.look || {};

    var missing = [];
    Object.keys(look.parts || {}).forEach(function (slot) {
      if (!LIB.slots[slot]) missing.push('slot lạ ' + slot);
      else if (!getPart(slot, look.parts[slot], asset.pack)) missing.push(slot + ':' + look.parts[slot]);
    });
    if (!LIB.eyeStyles[look.eyes]) missing.push('eyes:' + look.eyes);
    if (!LIB.browStyles[look.brows]) missing.push('brows:' + look.brows);
    add('parts', 'Linh kiện có trong thư viện', !missing.length, missing.join(', '));

    var noLic = [], packs = {};
    Object.keys(look.parts || {}).forEach(function (slot) {
      var p = getPart(slot, look.parts[slot], asset.pack);
      if (!p) return;
      packs[p.pack] = 1;
      if (!p.license || !PACKS[p.pack]) noLic.push(slot + ':' + p.id);
    });
    add('license', 'License + thư viện nguồn rõ ràng', !noLic.length, noLic.length ? noLic.join(', ') : Object.keys(packs).join(', '));

    var bad = [];
    Object.keys(look.params || {}).forEach(function (slot) {
      var defs = FACE_PARAMS[slot] || ((getPart(slot, partRef(asset, slot), asset.pack) || {}).params);
      if (!defs) { bad.push(slot + ': không có tham số'); return; }
      Object.keys(look.params[slot]).forEach(function (k) {
        var d = defs[k], v = look.params[slot][k];
        if (!d) bad.push(slot + '.' + k + ' không tồn tại');
        else if (!finite(v) || v < d.min || v > d.max) bad.push(slot + '.' + k + '=' + v + ' ngoài [' + d.min + ', ' + d.max + ']');
      });
    });
    add('params', 'Tham số trong khoảng cho phép', !bad.length, bad.join('; '));

    var must = (asset.identity && asset.identity.must) || [];
    var lost = must.filter(function (m) {
      var sp = m.split(':');
      return sp[0] === 'eyes' ? look.eyes !== sp[1] : partRef(asset, sp[0]) !== sp[1];
    });
    add('identity', 'Dấu nhận diện bắt buộc (' + must.length + ')', must.length > 0 && !lost.length,
      must.length ? lost.join(', ') : 'chưa khai báo identity.must');

    var sbad = [];
    LIB.stateOrder.forEach(function (sid) {
      try {
        var c = compose(asset, sid), size = 0;
        for (var l in c.layers) size += c.layers[l].length;
        if (size > 60000) sbad.push(sid + ' quá nặng (' + size + ' ký tự)');
        var m = LIB.motions[c.state.motion];
        if (!m) sbad.push(sid + ': thiếu động tác ' + c.state.motion);
      } catch (e) { sbad.push(sid + ': ' + e.message); }
    });
    var ovs = Object.keys(asset.expressions || {}).filter(function (k) { return !LIB.states[k]; });
    if (ovs.length) sbad.push('ghi đè cho trạng thái lạ: ' + ovs.join(', '));
    add('states', 'Dựng đủ ' + LIB.stateOrder.length + ' trạng thái', !sbad.length, sbad.join('; '));

    var mbad = [];
    LIB.stateOrder.forEach(function (sid) {
      var st = resolveState(asset, sid);
      var m = LIB.motions[st.motion];
      if (!m) return;
      Object.keys(m.tracks).forEach(function (j) {
        if (!RIG.joints[j]) mbad.push(st.motion + ': khớp lạ ' + j);
        Object.keys(m.tracks[j]).forEach(function (ch) {
          var ks = m.tracks[j][ch];
          if (CHANNELS.indexOf(ch) < 0) mbad.push(st.motion + ': kênh lạ ' + ch);
          for (var i = 0; i < ks.length; i++) {
            if (!finite(ks[i][0]) || !finite(ks[i][1]) || ks[i][0] < 0 || ks[i][0] > 1 || (i && ks[i][0] < ks[i - 1][0])) {
              mbad.push(st.motion + '.' + j + '.' + ch + ' khoá sai'); break;
            }
          }
        });
      });
      for (var s = 0; s < 16; s++) {
        var p = poseAt(asset, st, s * 0.17, false);
        for (var jj in p) for (var ch in p[jj]) if (!finite(p[jj][ch])) { mbad.push(st.motion + ' ra NaN'); s = 99; break; }
      }
    });
    add('motion', 'Động tác hợp lệ trên khung xương', !mbad.length, mbad.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; '));
    return res;
  }

  G.GenChibi = {
    version: VERSION, INK: INK, RIG: RIG, LIB: LIB, PACKS: PACKS, ASSETS: ASSETS, ASSET_ORDER: ASSET_ORDER,
    FACE_PARAMS: FACE_PARAMS, SRC: SRC,
    pack: pack, registerAsset: registerAsset, migrate: migrate,
    getPart: getPart, partsOfSlot: partsOfSlot, partRef: partRef, traitsOf: traitsOf,
    resolveState: resolveState, palette: palette, paramValues: paramValues,
    compose: compose, poseAt: poseAt, chainTransforms: chainTransforms, neutralPose: neutralPose, svgString: svgString,
    assets: function () { return ASSET_ORDER.map(function (k) { return ASSETS[k]; }); },
    director: { schema: directorSchema, validate: validateEvent, prompt: directorPrompt },
    gate: gate,
    JOINT_IDS: JOINT_IDS, LAYER_IDS: LAYER_IDS, CHANNELS: CHANNELS
  };
})(window);
