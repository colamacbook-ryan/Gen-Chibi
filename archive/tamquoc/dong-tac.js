// gen-chibi — GÓI ĐỘNG TÁC của bộ mẫu Tam Quốc: đòn thương / kiếm kiểu Tử Long + màn diễn "Tử Long 30 giây"
// (Q10, ADR 0006: đòn riêng chủ đề ra khỏi khung, thành asset dữ liệu của bộ chủ đề). Công cụ dev — port.js gọi để sinh JSON vào gói
// studio/mau/tam-quoc.json; gói đi qua đúng cổng nhập (checkPack / registerPack) như gói của bất kỳ ai.
// Viết bằng JS cho gọn (mix / about tính sẵn), XUẤT RA dữ liệu thuần — không có hàm nào lọt vào gói.
// © 2026 Gen Labs — All rights reserved.
'use strict';
module.exports = function tamQuocMotion(GC) {
  const C = GC.choreo, mix = C.mix, about = C.about, S = C.swapLR;   // eslint-disable-line no-unused-vars
  const LP = {}, clips = {};
  const P = (id, spec) => { LP[id] = spec; return spec; };
  const clip = (id, def) => { clips[id] = def; return def; };
    P('fTwirl', { body: { rot: -2 }, head: { rot: -6 }, armR: { rot: -166 }, foreR: { rot: -6 }, wR: 0, armL: { rot: 30 }, foreL: { rot: 40 }, thighR: { rot: -6 }, thighL: { rot: 6 } });
    P('plunge', { root: { rot: -10, sy: 0.82, sx: 1.12 }, pelvis: { y: 2 }, thighR: { rot: 64 }, shinR: { rot: -84 }, thighL: { rot: -30 }, shinL: { rot: -50 }, body: { rot: -16 }, head: { rot: -10 },
      armR: { rot: 120 }, foreR: { rot: -20 }, wR: 172, armL: { rot: 110 }, foreL: { rot: -10 } });
    clip('twirl', { label: 'Múa thương', view: 'front', face: { eyes: 'smug', brows: 'smug', mouth: 'grin' },
      keys: [[0.2, mix(LP.fTwirl, { wR: -40 }), 'back'], [0.55, mix(LP.fTwirl, { wR: 320, body: { rot: 3 } }), 'in', { spin: 1 }], [0.9, mix(LP.fTwirl, { wR: 700, body: { rot: -3 }, root: { y: -4 } }), 'lin', { spin: 1 }], [1.15, mix(LP.fTwirl, { wR: 860, armR: { rot: -120 } }), 'out', { spin: 1 }], [1.4, mix(C.POSES.fFlourish, { wR: 1000 }), 'out', { spin: 1 }]],
      events: [[0.4, { sfx: 'swish', gain: 0.6 }], [0.62, { sfx: 'swish', gain: 0.7 }], [0.82, { sfx: 'swish', gain: 0.8 }], [1.02, { sfx: 'swish', gain: 0.8 }]],
      cam: [[0.1, { z: 1.6, fy: 0.85, lead: 0 }], [1.4, { z: 1.85, fy: 0.62, lead: 50 }, 'io']] });
    // xoay một vòng: các góc nhìn nối nhau 0,09 s (đọc ra "xoay người"), thương giữ ngang ra ngoài
    var spinK = [], views = ['q90', 'front', 'q90', 'back', 'q90', 'front', 'q90', 'back', 'q90'], dirs = [1, 1, -1, 1, 1, 1, -1, 1, 1];
    views.forEach(function (v, i) {
      var p = v === 'front' ? mix(C.POSES.fStand, { armR: { rot: -86 }, foreR: { rot: -4 }, wR: 92, armL: { rot: 60 }, root: { y: -6 } })
        : v === 'back' ? mix(C.POSES.fStand, { armL: { rot: 86 }, foreL: { rot: 4 }, armR: { rot: 10 }, wR: -92, root: { y: -6 } })
        : mix(C.POSES.guard, { armR: { rot: 92 }, foreR: { rot: 0 }, wR: -92, root: { y: -4 } });
      spinK.push([0.1 + i * 0.085, p, 'lin', { view: v, dir: dirs[i], hide: v === 'q90' ? [] : ['heldR'] }]);
    });
    spinK.push([0.1 + 9 * 0.085 + 0.14, 'guard', 'out', { view: 'q90', dir: 1 }]);
    clip('spin', { label: 'Xoay người chém vòng', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'shout', fx: ['wind'] }, keys: spinK,
      travel: [[0, 0], [0.9, 30, 'io']],
      events: [[0.12, { sfx: 'swish' }], [0.45, { sfx: 'swish' }], [0.5, { at: 'chest', fx: 'ring', size: 0.9 }], [0.8, { at: 'chest', fx: 'ring', size: 1.1 }], [0.8, { at: 'tip', fx: 'spark', size: 1, hit: true, sfx: 'hit', gain: 0.7 }]],
      cam: [[0.1, { z: 1.7, lead: 30, fy: 0.55, roll: 0 }], [0.9, { z: 1.55, roll: 3 }]] });
    clip('leap', { label: 'Tung người lên cao', view: 'q90', face: { eyes: 'fierce', brows: 'determined', mouth: 'flat', fx: [] },
      keys: [[0.2, 'crouch', 'out'], [0.34, mix(C.POSES.crouch, { root: { y: -30, sy: 1.18, sx: 0.88 }, thighR: { rot: 10 }, shinR: { rot: -6 }, thighL: { rot: -6 }, shinL: { rot: -4 }, armR: { rot: 150 }, wR: 120 }), 'snap'],
        [0.75, 'airTuck', 'up', { ez: { 'root.y': 'up' } }], [1.05, mix(C.POSES.airTuck, { root: { y: -100 }, wR: -178 }), 'sine']],
      travel: [[0, 0], [0.34, 10, 'in'], [1.05, 90, 'out']],
      speed: [[0, 1], [0.55, 1], [0.66, 0.3], [1.05, 0.3]],
      events: [[0.32, { sfx: 'whoosh' }], [0.34, { at: 'feet', fx: 'dust', size: 1 }], [0.36, { lines: 0.5 }], [0.62, { grade: 'cool' }]],
      cam: [[0.2, { z: 1.5, lead: 40, fy: 0.5, roll: 0, lag: 5 }], [0.9, { z: 1.6, fy: 1.05, roll: 6, lag: 6 }, 'io']] });
    clip('plunge', { label: 'Bổ thương xuống đất', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'shout' },
      keys: [[0.12, mix(C.POSES.airTuck, { root: { y: -84, rot: -10 }, wR: 168, thighR: { rot: 30 }, shinR: { rot: -40 } }), 'in'], [0.26, 'plunge', 'down', { ez: { 'root.y': 'down' } }], [0.6, mix(LP.plunge, { root: { sy: 0.86 } }), 'out']],
      travel: [[0, 0], [0.26, 50, 'in']],
      speed: [[0, 0.3], [0.08, 1.4], [0.3, 1]],
      events: [[0.05, { grade: 'none', sfx: 'whoosh' }], [0.26, { at: 'tip', fx: 'impact', size: 1.6, hitstop: 0.13, shake: 13, flash: 0.75, sfx: ['rumble', 'hit'] }],
        [0.26, { at: 'tip', fx: 'ring', size: 1.4 }], [0.26, { at: 'tip', fx: 'debris', size: 1.2 }], [0.27, { at: 'feet', fx: 'dust', size: 1.5 }], [0.28, { at: 'tip', fx: 'text', text: 'RẦM!', dy: -70, size: 1.5, color: '#ff7a1f' }]],
      cam: [[0.08, { z: 1.5, fy: 0.7, roll: 0, lag: 9 }, 'snap'], [0.26, { z: 1.75, fy: 0.45, roll: -4, lag: 12 }, 'snap'], [0.6, { z: 1.55, roll: 0 }]] });
    clip('counter', { label: 'Phản đòn liên hoàn', view: 'q90', face: { eyes: 'fierce', brows: 'angry', mouth: 'shout' },
      keys: [[0.1, mix(C.POSES.coil, { wR: -84 }), 'out'], [0.16, mix(C.POSES.jab, { wR: -92 }), 'snap'], [0.26, mix(C.POSES.coil, { wR: -86 }), 'out'], [0.32, mix(C.POSES.jab, { wR: -90, root: { x: -12 } }), 'snap'],
        [0.44, mix(C.POSES.crouch, { wR: -130, armR: { rot: 80 } }), 'out'], [0.56, mix(C.POSES.upper, { wR: 48 }), 'snap', { ez: { 'root.y': 'up' } }], [0.9, mix(C.POSES.ready, { wR: -42 }), 'down', { ez: { 'root.y': 'down' } }]],
      travel: [[0, 0], [0.16, 16, 'snap'], [0.32, 34, 'snap'], [0.56, 48, 'snap']],
      events: [[0.12, { sfx: 'swish', gain: 0.7 }], [0.16, { at: 'tip', fx: 'spark', size: 0.8, sfx: 'hit', gain: 0.6, hit: true }], [0.28, { sfx: 'swish', gain: 0.7 }], [0.32, { at: 'tip', fx: 'spark', size: 0.9, sfx: 'hit', gain: 0.7, hit: true }],
        [0.5, { sfx: 'swish', gain: 1 }], [0.56, { fx: 'smear', smear: 0.12 }], [0.56, { at: 'tip', fx: 'impact', size: 1.2, hitstop: 0.09, shake: 7, sfx: 'hit' }], [0.58, { at: 'tip', fx: 'text', text: 'XOẸT!', dy: -20, size: 1.1, rot: -14 }]],
      cam: [[0.1, { z: 2.0, lead: 90, fy: 0.55, roll: -2, lag: 7 }], [0.56, { z: 2.25, fy: 0.75, roll: 4 }, 'snap'], [0.9, { z: 1.7, roll: 0 }]] });
    clip('finale', { label: 'Tạo dáng kết', view: 'front', face: { eyes: 'smug', brows: 'smug', mouth: 'smile', fx: ['sparkles'] },
      keys: [[0.14, mix(C.POSES.fSquash, { wR: 10 }), 'out'], [0.34, mix(C.POSES.fFinal, { wR: 40 }), 'back'], [0.72, mix(C.POSES.fFinal, { wR: 40, head: { rot: -9 } }), 'sine']],
      speed: [[0.34, 1], [0.44, 0.16], [0.72, 0.16]],
      events: [[0.3, { sfx: 'swish' }], [0.34, { flash: 0.5, sfx: 'gong', gain: 0.8, grade: 'gold', letterbox: 1 }], [0.36, { at: 'tip', fx: 'glint', size: 1.8 }],
        [0.4, { title: 'Thường Sơn Triệu Tử Long', sub: 'gen-chibi · biên đạo liên hoàn 30 giây', hold: 4 }], [0.72, { music: null }]],
      cam: [[0.1, { z: 1.9, fy: 0.75, lead: 0, roll: 0, lag: 6 }], [0.34, { z: 1.55, fy: 0.62, roll: -5, lag: 8 }, 'snap']] });

  // nhịp riêng từng hành vi trong màn mẫu (< 1 = nhanh hơn bản gốc của clip) — tổng đúng 30 giây thật
  const TEMPO = { sneakIn: 0.8, peek: 0.85, stretch: 0.8, twirl: 0.85, heroPose: 0.85, rage: 0.85, victory: 0.85, dance: 0.8, salute: 0.8, wave: 0.85 };
  const json = o => JSON.parse(JSON.stringify(o));   // dữ liệu thuần (bỏ undefined, chép sâu)
  return json({
    id: 'tq-dong-tac', name: 'Đòn thương Tử Long', project: 'mau-tam-quoc', status: 'published',
    description: 'Gói động tác của bộ mẫu Tam Quốc: liên hoàn ba đòn, xoay người chém vòng, tung người bổ thương xuống đất, múa thương — kèm màn diễn "Tử Long 30 giây" (29 hành vi không lặp).',
    poses: LP, clips,
    actions: {
      combo: { label: 'Liên hoàn ba đòn', clips: ['counter'], attack: true, needs: 'weapon' },
      spin: { label: 'Xoay người chém vòng', clips: ['spin'], attack: true, needs: 'weapon' },
      leap: { label: 'Tung người bổ xuống', clips: ['leap', 'plunge'], attack: true, needs: 'weapon', shock: 70, hint: 'bổ xuống đất trước mặt đối thủ — trúng bằng chấn động' },
      twirl: { label: 'Múa thương', clips: ['twirl'], needs: 'weapon' }
    },
    shows: {
      'tuLong30s': {
        title: 'Tử Long 30 giây', character: 'local.my/tq-trieu-van', scene: 'local.my/tq-vuon-dao', scale: 0.62, ground: 330, world: 1280, x0: -40, dir: 1,
        weapon: { R: { angle: 13, tip: 201, butt: 41 } },
        steps: ['sneakIn', 'peek', 'scratch', 'startle', 'run', 'skid', 'stretch', 'twirl', 'guard', 'thrust', 'sweep', 'spin', 'leap', 'plunge', 'heroPose',
          'hitReact', 'tumble', 'dizzy', 'kipUp', 'rage', 'dash', 'backflip', 'block', 'counter', 'victory', 'dance', 'salute', 'wave', 'finale'].map(id => ({ clip: id, tempo: TEMPO[id] }))
      }
    }
  });
};
