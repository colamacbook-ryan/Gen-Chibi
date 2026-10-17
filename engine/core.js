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
  var VERSION = '0.3.0';

  /* ---------------------------------------------------------------- 1. RIG */
  var RIG = {
    box: [-24, -18, 248, 258],
    crop: [34, 20, 132, 132],
    // stage: sân khấu đứng yên (đạo cụ: ghế, bàn, chiếu, nước). root: cả nhân vật. pelvis: hông.
    // hem: vạt áo dưới thắt lưng (co giãn khi ngồi, chạy). Chân: đùi → cẳng → bàn chân.
    joints: {
      stage: { parent: null,    pivot: [100, 228] },
      root:  { parent: null,    pivot: [100, 228] },
      pelvis: { parent: 'root', pivot: [100, 200] },
      body:  { parent: 'pelvis', pivot: [100, 214] },
      hem:   { parent: 'pelvis', pivot: [100, 192] },
      thighL: { parent: 'pelvis', pivot: [90, 203] },
      shinL: { parent: 'thighL', pivot: [89, 212] },
      footL: { parent: 'shinL', pivot: [87, 221] },
      thighR: { parent: 'pelvis', pivot: [110, 203] },
      shinR: { parent: 'thighR', pivot: [111, 212] },
      footR: { parent: 'shinR', pivot: [113, 221] },
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
      elbowL: [74, 177], elbowR: [126, 177], gripL: [72, 193], gripR: [128, 193],
      hipL: [90, 203], hipR: [110, 203], kneeL: [89, 212], kneeR: [111, 212], ankleL: [87, 221], ankleR: [113, 221]
    },
    // [lớp, khớp]. Thứ tự vẽ tách khỏi cây khớp (như slot của Spine).
    layers: [
      ['propBack', 'stage'], ['fxBack', 'root'], ['hairBack', 'head'], ['backItem', 'body'],
      // tay phía xa khi quay 3/4: engine chuyển nội dung tay sang các lớp này (sau thân)
      ['armLb', 'armL'], ['foreLb', 'foreL'], ['heldLb', 'handL'], ['handLb', 'handL'],
      ['armRb', 'armR'], ['foreRb', 'foreR'], ['heldRb', 'handR'], ['handRb', 'handR'],
      ['legs', 'root'],
      ['thighL', 'thighL'], ['shinL', 'shinL'], ['footL', 'footL'], ['thighR', 'thighR'], ['shinR', 'shinR'], ['footR', 'footR'],
      ['hem', 'hem'], ['body', 'body'], ['ears', 'head'], ['head', 'head'], ['mask', 'head'], ['shade', 'head'],
      ['cheeks', 'head'], ['eyes', 'head'], ['brows', 'head'], ['beard', 'head'],
      ['mouth', 'head'], ['mustache', 'head'], ['hairFront', 'head'], ['hat', 'head'],
      ['fxHead', 'head'],
      ['propMid', 'stage'],
      ['armL', 'armL'], ['foreL', 'foreL'], ['heldL', 'handL'], ['handL', 'handL'],
      ['armR', 'armR'], ['foreR', 'foreR'], ['heldR', 'handR'], ['handR', 'handR'],
      ['fxFront', 'root'], ['propFront', 'stage']
    ]
  };
  var JOINT_IDS = Object.keys(RIG.joints);
  var LAYER_IDS = RIG.layers.map(function (l) { return l[0]; });
  var CHANNELS = ['x', 'y', 'rot', 'sx', 'sy'];

  /* --------------------------------------------------------------- 2. PACK */
  var PACKS = {};
  var LIB = {
    slots: {}, parts: {}, eyeStyles: {}, eyePoses: {}, browStyles: {}, browPoses: {},
    mouths: {}, fx: {}, motions: {}, states: {}, stateOrder: [], traits: [], defaults: {}, profiles: {},
    postures: {}, moves: {}, props: {}, activities: {}, activityOrder: []
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
      posture: function (id, def) { def.id = id; LIB.postures[id] = tag(def, 'posture'); },
      move: function (id, def) { def.id = id; LIB.moves[id] = tag(def, 'move'); },
      prop: function (id, def) { def.id = id; LIB.props[id] = tag(def, 'prop'); },
      activity: function (id, def) { def.id = id; LIB.activities[id] = tag(def, 'activity'); if (LIB.activityOrder.indexOf(id) < 0) LIB.activityOrder.push(id); },
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
      posture: 'stand', move: null, facing: 'right', turn: 0, props: [], activity: null, explicitMotion: false,
      src: { eyes: SRC.lib, brows: SRC.lib, mouth: SRC.lib, fx: SRC.lib, motion: SRC.lib, posture: SRC.lib, move: SRC.lib }
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
    // hoạt động = tổ hợp đặt tên sẵn (tư thế + di chuyển + động tác + đạo cụ + nét mặt), đạo diễn vẫn ghi đè từng trục
    var act = director && director.activity && LIB.activities[director.activity];
    if (act) {
      st.activity = act.id;
      var A = 'Hoạt động · ' + act.label;
      if (act.posture) { st.posture = act.posture; st.src.posture = A; }
      if (act.move) { st.move = act.move; st.src.move = A; }
      if (act.action) { st.motion = act.action; st.src.motion = A; st.explicitMotion = true; }
      ['eyes', 'brows', 'mouth'].forEach(function (k) { if (act.face && act.face[k]) { st[k] = act.face[k]; st.src[k] = A; } });
      if (act.fx) st.fx = st.fx.concat(act.fx);
      if (act.props) st.props = st.props.concat(act.props);
    }
    if (director) {
      ['eyes', 'brows', 'mouth'].forEach(function (k) { if (director[k]) { st[k] = director[k]; st.src[k] = SRC.director; } });
      if (director.motion) { st.motion = director.motion; st.src.motion = SRC.director; st.explicitMotion = true; }
      if (director.posture && LIB.postures[director.posture]) { st.posture = director.posture; st.src.posture = SRC.director; }
      if (director.move !== undefined) { st.move = LIB.moves[director.move] ? director.move : null; st.src.move = SRC.director; }
      if (director.facing === 'left' || director.facing === 'right') st.facing = director.facing;
      // góc nhìn: front | left (3/4 quay sang trái màn hình) | right; hoặc turn số trong [-1, 1]
      if (director.view) st.turn = VIEWS[director.view] !== undefined ? VIEWS[director.view] : 0;
      if (typeof director.turn === 'number' && isFinite(director.turn)) st.turn = Math.max(-1, Math.min(1, director.turn));
      st.viewSet = !!director.view || typeof director.turn === 'number';
      if (director.view === 'left45' || director.view === 'right45') { st.kind = 'q45'; st.view = director.view; }
      if (director.fx) { st.fx = st.fx.concat(director.fx); st.src.fx = SRC.director; }
    }
    var pz = LIB.postures[st.posture] || {}, mv = st.move && LIB.moves[st.move];
    if (mv && mv.postures && mv.postures.indexOf(st.posture) < 0) st.posture = mv.postures[0];   // di chuyển kéo theo tư thế hợp lệ
    pz = LIB.postures[st.posture] || {};
    st.props = (pz.props || []).concat(st.props, (mv && mv.props) || [], ((LIB.motions[st.motion] || {}).props) || []);
    st.props = st.props.filter(function (x, i) { return st.props.indexOf(x) === i && LIB.props[x]; });
    if (mv && mv.fx) st.fx = st.fx.concat(mv.fx);
    // đang di chuyển mà chưa chọn góc: nghiêng 3/4 về hướng đi (đọc ra "đang đi tới" rõ hơn chính diện)
    if (mv && !st.viewSet && !mv.front) st.turn = st.facing === 'left' ? -1 : 1;
    // góc nhìn tính theo MÀN HÌNH; khi quay trái cả hình bị lật gương nên đổi dấu sang hệ toạ độ của nhân vật
    st.turnLocal = st.facing === 'left' ? -st.turn : st.turn;
    // lật gương: góc 45° do góc nhìn quyết định (bản chuẩn quay trái); các góc khác theo hướng di chuyển
    if (st.kind === 'q45') { st.mirror = st.view === 'right45'; st.turnLocal = -1; st.facing = st.mirror ? 'right' : 'left'; }
    else st.mirror = st.facing === 'left';
    st.fx = st.fx.filter(function (f, i) { return st.fx.indexOf(f) === i; });
    return st;
  }

  /* ----------------------------------------------------- 3b. GÓC NHÌN 3/4 */
  // Quay kiểu parallax (như Live2D/Spine cho chibi): đầu chibi gần như hình cầu nên viền đầu giữ nguyên,
  // các lớp trên mặt trượt theo độ sâu trên cầu: x = R·sin(θ − φ). θ là góc của chi tiết, φ là góc quay.
  // Mắt xa hẹp lại (cos giảm), mắt gần rộng ra; tóc sau, tai trượt ngược; thân quay ít hơn đầu; tay xa ra sau thân.
  var VIEWS = { front: 0, left: -1, right: 1, left45: -1, right45: 1 };
  var TURN = { phi: 22, R: 48, body: 0.55 };
  // Góc 45° VẼ THẬT ở mức linh kiện: part.views.q45(C, st, vals). Bản vẽ chuẩn quay mặt sang TRÁI màn hình
  // (tay phải màn hình ở phía gần); 45° phải = lật gương. Linh kiện chưa có bản vẽ 45° thì engine trượt parallax (phi 32°).
  // Vị trí mặt 45° (mắt gần/xa, mày, miệng) thuộc engine nên mọi kiểu mắt/mày/miệng đều hưởng.
  var Q45 = {
    phi: 32, body: 0.8,
    eye: { L: { x: 65, sx: 0.62 }, R: { x: 96, sx: 1 } },
    brow: { L: { x: 66, sx: 0.62 }, R: { x: 96, sx: 1 } },
    mouth: { dx: -19, sx: 0.85 }
  };
  function sphereShift(x0, turn, R) {
    var phi = TURN.phi * turn * Math.PI / 180, r = R || TURN.R;
    var th = Math.asin(Math.max(-0.99, Math.min(0.99, (x0 - 100) / r)));
    return { dx: r * Math.sin(th + phi) - (x0 - 100), sx: Math.cos(th + phi) / Math.cos(th) };
  }
  function turnWrap(content, dx, sx, cx) {
    if (!content || (Math.abs(dx) < 0.01 && Math.abs(sx - 1) < 0.001)) return content;
    return '<g transform="translate(' + (cx + dx).toFixed(2) + ' 0) scale(' + sx.toFixed(3) + ' 1) translate(' + (-cx) + ' 0)">' + content + '</g>';
  }
  // [lớp, x của chi tiết trên mặt cầu, bán kính hiệu dụng (vĩ độ cao → nhỏ), hệ số]
  var TURN_LAYERS = [
    ['mouth', 100, 40, 1], ['beard', 100, 40, 1], ['mustache', 100, 42, 1], ['cheeks', 100, 46, 0.9],
    ['hairFront', 100, 40, 0.75], ['hat', 100, 46, 0.45], ['fxHead', 100, 48, 0.5],
    ['ears', 100, 48, -0.25], ['hairBack', 100, 48, -0.45]
  ];
  // Hiệu ứng bám mặt (nước mắt, má hồng…) ở 45°: nửa trái ánh xạ theo mắt xa, nửa phải theo mắt gần — mọi hiệu ứng mặt tự đúng, không vẽ lại
  function faceRemap(c) {
    if (!c) return c;
    var L = Q45.eye.L, R = Q45.eye.R, d = '<defs><clipPath id="gcFaceL"><rect x="-60" y="-60" width="160" height="340"/></clipPath><clipPath id="gcFaceR"><rect x="100" y="-60" width="160" height="340"/></clipPath></defs>';
    return d + '<g clip-path="url(#gcFaceL)"><g transform="translate(' + L.x + ' 0) scale(' + L.sx + ' 1) translate(-80 0)">' + c + '</g></g>' +
      '<g clip-path="url(#gcFaceR)"><g transform="translate(' + R.x + ' 0) scale(' + R.sx + ' 1) translate(-120 0)">' + c + '</g></g>';
  }
  function layerShift(layer, turn, phi) {
    var save = TURN.phi; TURN.phi = phi;
    var r = null;
    TURN_LAYERS.forEach(function (t) {
      if (t[0] !== layer) return;
      var sh = sphereShift(t[1], turn, t[2]);
      r = { dx: sh.dx * t[3], sx: t[3] > 0 ? 1 - (1 - Math.abs(Math.cos(phi * turn * Math.PI / 180))) * 0.6 : 1, cx: t[1] };
    });
    if (!r && (layer === 'body' || layer === 'hem' || layer === 'backItem' || layer === 'head' || layer === 'shade' || layer === 'mask')) {
      var k = layer === 'body' ? 1 : layer === 'hem' ? 0.6 : layer === 'backItem' ? -0.5 : layer === 'shade' ? 0.3 : 0;
      var bs = sphereShift(100, turn * (phi === Q45.phi ? Q45.body : TURN.body), 36);
      r = { dx: bs.dx * k, sx: layer === 'body' || layer === 'hem' ? 0.95 : 1, cx: 100 };
    }
    TURN.phi = save;
    return r;
  }
  // phía sau đầu lộ ra khi quay là TÓC, không phải da: lưỡi liềm = hình đầu − chính nó dịch theo hướng quay, chỉ phần trên tai
  function crescentOf(C, turn, phi) {
    if (!C.shape) return '';
    var save = TURN.phi; TURN.phi = phi;
    var d = sphereShift(100, turn, 40).dx * 1.15;
    TURN.phi = save;
    var id = 'gcT' + String(C.asset.key || C.asset.id).replace(/[^a-zA-Z0-9]/g, '') + (turn < 0 ? 'l' : 'r') + phi;
    return '<defs><clipPath id="' + id + 'c"><path d="' + C.shape + '"/></clipPath>' +
      '<mask id="' + id + 'm" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><path d="M0,0 L200,0 L200,104 C176,104 160,112 150,128 L50,128 C40,112 24,104 0,104 Z" fill="#fff"/>' +
      '<path transform="translate(' + d.toFixed(2) + ' 0)" d="' + C.shape + '" fill="#000"/></mask></defs>' +
      '<g clip-path="url(#' + id + 'c)"><g mask="url(#' + id + 'm)"><rect x="0" y="0" width="200" height="200" fill="' + C.P.hair + '"/>' +
      '<path transform="translate(' + d.toFixed(2) + ' 0)" d="' + C.shape + '" fill="none" stroke="' + INK + '" stroke-width="5"/></g></g>';
  }
  // tay phía xa (phía đang quay về) ra sau thân — chỉ khi tay đó đang buông; tay giơ lên/vươn ra thì vẫn ở trước
  function farArmBack(out, st, C, far) {
    var still = poseAt(C.asset, st, 0, true);
    if (Math.abs(still['arm' + far].rot) >= 50) return;
    ['arm', 'fore', 'held', 'hand'].forEach(function (k) { out[k + far + 'b'] = out[k + far]; out[k + far] = ''; });
    st.farArm = far;
  }
  function applyTurn(out, turn, st, C) {
    if (!turn || st.kind === 'q45') return;
    // phía sau đầu lộ ra khi quay là TÓC, không phải da: lưỡi liềm = hình đầu − chính nó dịch theo hướng quay, chỉ phần trên tai
    var crescent = out.hairFront ? crescentOf(C, turn, TURN.phi) : '';
    TURN_LAYERS.forEach(function (t) {
      var sh = sphereShift(t[1], turn, t[2]);
      out[t[0]] = turnWrap(out[t[0]], sh.dx * t[3], t[3] > 0 ? 1 - (1 - Math.abs(Math.cos(TURN.phi * turn * Math.PI / 180))) * 0.6 : 1, t[1]);
    });
    if (crescent) out.hairFront = crescent + out.hairFront;   // sau bước trượt: dải tóc bám mép đầu, không trượt theo mái
    // thân quay ít hơn đầu: chi tiết giữa ngực (cổ áo, đai) trượt, thân hẹp lại một chút
    var bs = sphereShift(100, turn * TURN.body, 36);
    out.body = turnWrap(out.body, bs.dx, 0.95, 100);
    out.hem = turnWrap(out.hem, bs.dx * 0.6, 0.95, 100);
    out.backItem = turnWrap(out.backItem, -bs.dx * 0.5, 1, 100);
    farArmBack(out, st, C, turn < 0 ? 'L' : 'R');
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
    var Q = st.kind === 'q45';
    var C = { P: P, A: RIG.anchors, shape: Q && head.shape45 ? head.shape45 : head.shape, ink: INK, asset: asset, flip: !!st.mirror, st: st, view: Q ? 'q45' : 'front' };
    var out = {};
    LAYER_IDS.forEach(function (l) { out[l] = ''; });

    // fb: linh kiện chưa có bản vẽ 45° → trượt parallax theo lớp
    function put(res, wrap, fb) {
      if (!res) return;
      for (var layer in res) {
        if (!(layer in out)) throw new Error('lớp lạ: ' + layer);
        var c = wrap ? '<g transform="' + wrap + '">' + res[layer] + '</g>' : res[layer];
        if (fb && Q && c) { var sh = layerShift(layer, -1, Q45.phi); if (sh) c = turnWrap(c, sh.dx, sh.sx, sh.cx); }
        out[layer] += c;
      }
    }
    var fbSlots = [];

    Object.keys(LIB.slots).forEach(function (slot) {
      var ref = partRef(asset, slot);
      if (!ref) return;
      var p = getPart(slot, ref, asset.pack);
      if (!p) throw new Error('thiếu linh kiện ' + slot + ':' + ref);
      var vals = p.params ? paramValues(asset, slot, p.params) : {};
      var native = Q && p.views && p.views.q45;
      var res = (native ? p.views.q45 : p.draw)(C, st, vals);
      if (Q && !native && res && !/^held[LR]$/.test(slot)) fbSlots.push(slot + ':' + p.id);
      put(res, p.params ? paramTransform(p.params, vals) : '', Q && !native && !/^held[LR]$/.test(slot));
    });

    // đạo cụ của tư thế / di chuyển / động tác / hoạt động
    st.props.forEach(function (id) { put(LIB.props[id].draw(C, st)); });

    // đồ cầm tay: động tác cần tay trống thì cất; đồ dài cất khi tay đưa vào giữa mặt;
    // động tác cầm đạo cụ riêng (bát, sách, bút…) thì thay đồ của nhân vật
    var mo = LIB.motions[st.motion] || {};
    var hide = (mo.hide || []).slice();
    if (handsBusy(st)) hide.push('heldL', 'heldR');
    ['L', 'R'].forEach(function (s) {
      var pid = mo.hold && mo.hold[s];
      if (pid && LIB.props[pid] && !handsBusy(st)) { out['held' + s] = ''; put(LIB.props[pid].draw(C, st, s)); hide = hide.filter(function (x) { return x !== 'held' + s; }); hide.push('keep' + s); }
    });
    st.upright = {};
    ['L', 'R'].forEach(function (s) {
      var ref = partRef(asset, 'held' + s);
      var p = ref && ref !== 'none' ? getPart('held' + s, ref, asset.pack) : null;
      st.upright[s] = !!p && p.upright !== false;
      if (hide.indexOf('keep' + s) >= 0) { st.upright[s] = false; return; }
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
      var tw = Q ? { dx: Q45.eye[side < 0 ? 'L' : 'R'].x + side * ev.gap - x, sx: Q45.eye[side < 0 ? 'L' : 'R'].sx } : st.turnLocal ? sphereShift(x, st.turnLocal) : { dx: 0, sx: 1 };
      out.eyes += turnWrap('<g transform="translate(' + x + ' ' + y + ') scale(' + ev.size + ') translate(' + (-x) + ' ' + (-y) + ')">' + ep(es, side, x, y, C) + '</g>', tw.dx, tw.sx, x);
    });
    // Chớp mắt chạy trên nhóm con này. KHÔNG đặt animation CSS lên chính nhóm lớp (data-l):
    // thuộc tính CSS transform sẽ đè transform của khung xương và lớp đó đứng yên khi đầu chuyển động.
    out.eyes = '<g class="gc-eyes">' + out.eyes + '</g>';

    var bs = LIB.browStyles[asset.look.brows] || LIB.browStyles.normal;
    var bp = LIB.browPoses[st.brows];
    if (!bp) throw new Error('thiếu dáng mày ' + st.brows);
    var bv = paramValues(asset, 'brows', BROW_PARAMS);
    [-1, 1].forEach(function (side) {
      var bx = (side < 0 ? C.A.browL : C.A.browR)[0];
      var tw = Q ? { dx: Q45.brow[side < 0 ? 'L' : 'R'].x - bx, sx: Q45.brow[side < 0 ? 'L' : 'R'].sx } : st.turnLocal ? sphereShift(bx, st.turnLocal, 46) : { dx: 0, sx: 1 };
      out.brows += turnWrap(brow(bs, bp, side, C, bv), tw.dx, tw.sx, bx);
    });

    var m = LIB.mouths[st.mouth];
    if (!m) throw new Error('thiếu dáng miệng ' + st.mouth);
    var mv = paramValues(asset, 'mouth', MOUTH_PARAMS);
    var mouthG = '<g transform="translate(0 ' + mv.y + ') translate(100 131) scale(' + mv.size + ') translate(-100 -131)">' + m(C) + '</g>';
    out.mouth += Q ? turnWrap(mouthG, Q45.mouth.dx, Q45.mouth.sx, 100) : mouthG;

    st.fx.forEach(function (id) {
      var f = LIB.fx[id];
      if (!f) throw new Error('thiếu hiệu ứng ' + id);
      if (Q && f.face) { var r = f.draw(C); for (var l in r) out[l] += faceRemap(r[l]); }
      else put(f.draw(C), '', true);
    });
    applyTurn(out, st.turnLocal, st, C);
    if (Q) {
      // tóc chưa có bản vẽ 45°: thêm lưỡi liềm tóc phía sau đầu; tay xa ra sau thân; hiệu ứng nền (bụi, gió) đổi phía
      if (fbSlots.some(function (x) { return x.indexOf('hair:') === 0; })) out.hairFront = crescentOf(C, -1, Q45.phi) + out.hairFront;
      farArmBack(out, st, C, 'L');
      if (out.fxBack) out.fxBack = '<g transform="translate(200 0) scale(-1 1)">' + out.fxBack + '</g>';
      st.fallback45 = fbSlots;
    }
    // nằm: cả người xoay theo root; hiệu ứng ở fxFront/fxBack (chữ Zzz, !!, pháo giấy) xoay ngược quanh đầu để luôn đứng thẳng
    var rr = ((LIB.postures[st.posture] || {}).base || {}).root;
    if (rr && rr.rot) ['fxFront', 'fxBack'].forEach(function (l) {
      if (out[l]) out[l] = '<g transform="rotate(' + (-rr.rot) + ' 100 100)">' + out[l] + '</g>';
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

  function handsBusy(st) { var z = LIB.postures[st.posture] || {}; return !!(z.handsBusy || z.hideHeld); }
  function isArm(j) { return /^(arm|fore|hand)[LR]$/.test(j); }
  function phase(def, t, still) {
    if (still) return def.still || 0;
    return def.loop === false ? Math.min(1, t / def.dur) : (t % def.dur) / def.dur;
  }
  function addTracks(pose, tracks, u, skip) {
    for (var j in tracks) {
      if (!pose[j] || (skip && skip(j))) continue;
      for (var ch in tracks[j]) {
        var v = sampleKeys(tracks[j][ch], u);
        if (ch === 'sx' || ch === 'sy') pose[j][ch] *= v; else pose[j][ch] += v;
      }
    }
  }

  // Tư thế đích tại thời điểm t (giây). still = khung đứng yên đại diện (dùng cho ảnh cache).
  // Ghép 4 lớp như animation layer của game engine:
  //   tư thế nền (đặt giá trị) → di chuyển (cộng dồn) → động tác (tay: thay thế; thân, đầu: cộng dồn) → hướng nhìn.
  // Tay: động tác thay thế, trừ khi tư thế bận tay (bò, bơi) hoặc động tác chỉ là mặc định của biểu cảm mà di chuyển có vung tay.
  function poseAt(asset, st, t, still) {
    var m = LIB.motions[st.motion] || LIB.motions.idle;
    var pz = LIB.postures[st.posture] || LIB.postures.stand || {};
    var mv = st.move && LIB.moves[st.move];
    var pose = neutralPose();
    var base = pz.base || {};
    for (var bj in base) for (var bc in base[bj]) if (pose[bj]) pose[bj][bc] = base[bj][bc];
    var mvArms = false;
    if (mv) {
      addTracks(pose, mv.tracks, phase(mv, t, still));
      mvArms = Object.keys(mv.tracks).some(isArm);
    }
    var u = phase(m, t, still);
    // động tác mặc định của biểu cảm (không ai chọn rõ) nhường tay cho di chuyển; động tác được chọn rõ thì giữ tay
    var armsOff = pz.handsBusy || (mvArms && !st.explicitMotion);
    for (var j in m.tracks) {
      if (!pose[j]) continue;
      if (isArm(j)) {
        if (armsOff) continue;
        for (var ch in m.tracks[j]) {
          var v = sampleKeys(m.tracks[j][ch], u);
          pose[j][ch] = (ch === 'sx' || ch === 'sy') ? (base[j] && base[j][ch] !== undefined ? base[j][ch] : 1) * v : (base[j] && base[j][ch] || 0) + v;
        }
      } else addTrackJoint(pose, j, m.tracks[j], u);
    }
    if (m.breath !== false && !still && !pz.noBreath) pose.body.sy *= 1 + Math.sin(t * 2.4) * 0.012;
    if (st.kind === 'q45') {
      // bản chuẩn 45° quay trái: dữ liệu động tác viết cho hướng phải → đảo x/góc của thân để nghiêng, lắc về phía trước mặt
      ['root', 'pelvis', 'body', 'head', 'hem'].forEach(function (j) { pose[j].x = -pose[j].x; pose[j].rot = -pose[j].rot; });
    }
    // "trọng lực" cho đồ cầm tay: nếu động tác không tự điều khiển bàn tay,
    // bàn tay xoay ngược tổng góc các khớp cha để binh khí luôn đứng thẳng
    ['L', 'R'].forEach(function (s) {
      if (!st.upright || !st.upright[s] || (!armsOff && m.tracks['hand' + s] && m.tracks['hand' + s].rot)) return;
      pose['hand' + s].rot = -(pose['arm' + s].rot + pose['fore' + s].rot + pose.body.rot + pose.pelvis.rot + pose.root.rot);
    });
    var hs = paramValues(asset, 'rig', HEAD_PARAMS).size;
    pose.head.sx *= hs; pose.head.sy *= hs;
    if (st.turnLocal) {
      // thân quay ít hơn đầu: vai và hông trượt về phía quay, vai xa thu vào trong nhiều hơn
      var tb = st.turnLocal * (st.kind === 'q45' ? Q45.body : TURN.body), near = st.turnLocal < 0 ? 'R' : 'L', far = near === 'R' ? 'L' : 'R';
      var inward = function (s) { return s === 'L' ? 1 : -1; };
      pose['arm' + far].x += inward(far) * 9 * Math.abs(tb) + tb * -4;
      pose['arm' + near].x += inward(near) * 3 * Math.abs(tb) + tb * -4;
      pose['thigh' + far].x += inward(far) * 4 * Math.abs(tb);
      pose['thigh' + near].x += tb * -2;
      if (st.kind === 'q45') ['L', 'R'].forEach(function (sd) {
        var a = Math.abs(pose['arm' + sd].rot);
        if (a > 110) pose['arm' + sd].x += Q45.mouth.dx * Math.min(1, (a - 110) / 30);
      });
    }
    if (st.mirror) pose.root.sx *= -1;
    return pose;
  }
  function addTrackJoint(pose, j, chans, u) {
    for (var ch in chans) {
      var v = sampleKeys(chans[ch], u);
      if (ch === 'sx' || ch === 'sy') pose[j][ch] *= v; else pose[j][ch] += v;
    }
  }
  // Bóng đổ: co lại khi nhân vật rời mặt đất (nhảy, bay), giãn khi nằm
  function shadowOf(st, pose) {
    var sh = (LIB.postures[st.posture] || {}).shadow || {};
    var lift = Math.max(0, -pose.root.y - (sh.lift0 || 0));
    var k = Math.max(0.3, 1 - lift / 70);
    return { rx: 46 * (sh.sx || 1) * k, ry: 7 * k, op: (sh.op === undefined ? 1 : sh.op) * k, cx: 100 + (sh.dx || 0) * (st.mirror ? -1 : 1) };
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
    // opts.t: vẽ đúng khung hình tại giây thứ t (xuất sprite sheet, kiểm chuyển động); mặc định khung đứng yên đại diện
    var pose = poseAt(asset, c.state, opts.t || 0, typeof opts.t !== 'number');
    var chain = chainTransforms(pose);
    var vb = (opts.crop ? RIG.crop : RIG.box).join(' ');
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + (opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : '') + '>';
    if (!opts.noShadow && !opts.crop) {
      var sd = shadowOf(c.state, pose);
      s += '<ellipse cx="' + sd.cx.toFixed(1) + '" cy="229" rx="' + sd.rx.toFixed(1) + '" ry="' + sd.ry.toFixed(1) + '" fill="rgba(20,24,22,' + (0.16 * sd.op).toFixed(3) + ')"/>';
    }
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
              activity: { enum: LIB.activityOrder.slice() },
              posture: { enum: Object.keys(LIB.postures) },
              move: { enum: Object.keys(LIB.moves) },
              facing: { enum: ['left', 'right'] },
              view: { enum: ['front', 'left', 'right', 'left45', 'right45'] },
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
      ['activity', 'posture', 'move', 'facing', 'view'].forEach(function (k) {
        if (s[k] !== undefined && S[k].enum.indexOf(s[k]) < 0) errs.push(n + k + ' "' + s[k] + '" không có trong kho.');
      });
      var mvd = s.move && LIB.moves[s.move];
      if (mvd && mvd.postures && s.posture && mvd.postures.indexOf(s.posture) < 0) errs.push(n + 'di chuyển "' + s.move + '" không đi với tư thế "' + s.posture + '" (hợp: ' + mvd.postures.join(', ') + ').');
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
    L.push('', 'Hoạt động (activity, tuỳ chọn — đặt sẵn tư thế + di chuyển + động tác + đạo cụ; state vẫn quyết định nét mặt):');
    LIB.activityOrder.forEach(function (id) { var a = LIB.activities[id]; L.push('- ' + id + ': ' + a.label + (a.hint ? ' — ' + a.hint : '')); });
    L.push('', 'Muốn ghép tự do thì dùng posture (tư thế nền), move (di chuyển), motion (động tác tay), facing (left/right):');
    L.push('- posture: ' + Object.keys(LIB.postures).map(function (k) { return k + ' (' + LIB.postures[k].label + ')'; }).join(', '));
    L.push('- view: front (chính diện) | left / right (nghiêng nhẹ 3/4) | left45 / right45 (nghiêng 45° vẽ thật — hợp khi hai nhân vật nói chuyện với nhau)');
    L.push('- move: ' + Object.keys(LIB.moves).map(function (k) { var m = LIB.moves[k]; return k + ' (' + m.label + (m.postures ? '; tư thế: ' + m.postures.join('/') : '') + ')'; }).join(', '));
    L.push('', 'Schema:', JSON.stringify(directorSchema(cast), null, 2), '', 'Sự kiện: <mô tả sự kiện ở đây>');
    return L.join('\n');
  }

  /* -------------------------------------------------------------- 7. GATES */
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  // opts.poses: kiểm thêm việc dựng đủ mọi hoạt động (nặng hơn — dùng ở hồ sơ asset, khi lưu qua MCP, trong test; không dùng cho danh sách hàng trăm nhân vật)
  function gate(asset, opts) {
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
    // độ phủ 45°: linh kiện nào đã có bản vẽ nghiêng thật (thiếu thì engine trượt parallax) — thông tin, không chặn
    var cov = [], miss = [];
    Object.keys(LIB.slots).forEach(function (slot) {
      var ref = partRef(asset, slot), p = ref && getPart(slot, ref, asset.pack);
      if (!p || ref === 'none' || /^held[LR]$/.test(slot)) return;
      (p.views && p.views.q45 ? cov : miss).push(slot + ':' + p.id);
    });
    res.push({ id: 'view45', label: 'Bản vẽ nghiêng 45°: ' + cov.length + '/' + (cov.length + miss.length) + ' linh kiện', ok: true, info: true,
      detail: miss.length ? 'chưa có (dùng trượt): ' + miss.join(', ') : 'đủ — nghiêng 45° vẽ thật' });
    var pbad = [];
    if (opts && opts.poses) LIB.activityOrder.forEach(function (id) {
      var a = LIB.activities[id];
      try {
        var c = compose(asset, a.state || 'normal', { activity: id });
        [0, 0.37].forEach(function (t) {
          var p = poseAt(asset, c.state, t, t === 0);
          JOINT_IDS.forEach(function (j) { CHANNELS.forEach(function (ch) { if (!finite(p[j][ch])) pbad.push(id + ': ' + j + '.' + ch + ' không phải số'); }); });
        });
      } catch (e) { pbad.push(id + ': ' + e.message); }
    });
    if (opts && opts.poses) add('poses', 'Dựng đủ ' + LIB.activityOrder.length + ' hoạt động (tư thế × di chuyển × động tác)', !pbad.length, pbad.slice(0, 6).join('; '));
    return res;
  }

  G.GenChibi = {
    version: VERSION, INK: INK, RIG: RIG, LIB: LIB, PACKS: PACKS, ASSETS: ASSETS, ASSET_ORDER: ASSET_ORDER,
    FACE_PARAMS: FACE_PARAMS, SRC: SRC,
    pack: pack, registerAsset: registerAsset, migrate: migrate,
    getPart: getPart, partsOfSlot: partsOfSlot, partRef: partRef, traitsOf: traitsOf,
    resolveState: resolveState, palette: palette, paramValues: paramValues,
    compose: compose, poseAt: poseAt, chainTransforms: chainTransforms, neutralPose: neutralPose, svgString: svgString,
    shadowOf: shadowOf, handsBusy: handsBusy,
    assets: function () { return ASSET_ORDER.map(function (k) { return ASSETS[k]; }); },
    director: { schema: directorSchema, validate: validateEvent, prompt: directorPrompt },
    gate: gate,
    JOINT_IDS: JOINT_IDS, LAYER_IDS: LAYER_IDS, CHANNELS: CHANNELS
  };
})(window);
