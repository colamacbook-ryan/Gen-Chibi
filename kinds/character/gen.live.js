/* gen-chibi — gói động tác SÂN KHẤU SỐNG (Agent Live Stage, INT-21): đi bộ, lục túi, gõ phím, đọc sách, soi kính lúp, uống cà phê,
 * xem đồng hồ, ngáp, ngủ gật trên sofa, nghe điện thoại, đập búa, xịt bình chữa cháy, bấm nút phóng… Dữ liệu tư thế + clip theo đúng định dạng
 * của bộ khung (kinds/character/gen.choreo.js): mọi clip TẠI CHỖ (không travel — vị trí do đạo diễn live giữ: engine/live.js), dài theo st.dur.
 * © 2026 Gen Labs — All rights reserved.
 * Quy ước tư thế như engine/choreo.js: nghiêng viết theo bản QUAY TRÁI (phía trước −x, tay gần là R); chính diện: tay R ở bên PHẢI màn hình,
 * armR âm = giơ ra ngoài / lên, armL dương = giơ ra ngoài / lên. wR = góc đồ cầm tay phải trong thế giới (0 = dựng đứng) — đạo cụ luôn đứng thẳng.
 */
(function (GC) {
  'use strict';
  var C = GC.choreo, P = C.pose, S = C.swapLR, mix = C.mix;

  /* ---------------- nghiêng (q90) ---------------- */
  P('lvStand', { armR: { rot: 8 }, foreR: { rot: 18 }, wR: 0, armL: { rot: 6 }, foreL: { rot: 16 } });
  // bước đi: tiếp đất (chân trước duỗi, chân sau đẩy) — qua (chân co, người nhô lên)
  P('lvWalkA', { root: { rot: -3, sy: 0.98 }, body: { rot: -2 }, hem: { rot: -4 }, thighR: { rot: 30 }, shinR: { rot: -4 }, thighL: { rot: -26 }, shinL: { rot: -16 }, footL: { rot: -10 },
    armR: { rot: -26 }, foreR: { rot: 34 }, wR: 0, armL: { rot: 30 }, foreL: { rot: 30 } });
  P('lvWalkB', { root: { rot: -2, y: -5, sy: 1.02 }, body: { rot: -1 }, hem: { rot: 3 }, thighR: { rot: 2 }, shinR: { rot: -34 }, thighL: { rot: 8 }, shinL: { rot: -4 },
    armR: { rot: 2 }, foreR: { rot: 30 }, wR: 0, armL: { rot: 4 }, foreL: { rot: 30 } });
  // chạy vội (đạo diễn chọn khi hàng đợi dài): đổ người nhiều hơn, tay vung mạnh
  P('lvRunA', { root: { rot: -10, sy: 0.94, sx: 1.04 }, body: { rot: -5 }, head: { rot: 5 }, hem: { rot: -10 }, thighR: { rot: 48, sy: 1.3 }, shinR: { rot: -10 }, thighL: { rot: -44, sy: 1.3 }, shinL: { rot: -56 },
    armR: { rot: -50 }, foreR: { rot: 70 }, wR: 0, armL: { rot: 56 }, foreL: { rot: 60 } });
  P('lvRunB', { root: { rot: -12, y: -14, sy: 1.05, sx: 0.97 }, body: { rot: -6 }, head: { rot: 1 }, hem: { rot: 8 }, thighR: { rot: 6, sy: 1.25 }, shinR: { rot: -76 }, thighL: { rot: 26, sy: 1.25 }, shinL: { rot: -30 },
    armR: { rot: 30 }, foreR: { rot: 60 }, wR: 0, armL: { rot: -30 }, foreL: { rot: 60 } });
  // gõ phím: người đổ về bàn phím, hai tay đưa ra trước, ngón gõ xen kẽ
  P('lvTypeA', { root: { rot: -2 }, body: { rot: -7 }, head: { rot: -5, x: -1 }, thighR: { rot: 6 }, thighL: { rot: -4 }, armR: { rot: 64 }, foreR: { rot: 22 }, wR: 0, armL: { rot: 74 }, foreL: { rot: 8 } });
  P('lvTypeB', { $: 'lvTypeA', head: { rot: -4, x: -1 }, armR: { rot: 72 }, foreR: { rot: 8 }, armL: { rot: 64 }, foreL: { rot: 22 } });
  P('lvEnterUp', { $: 'lvTypeA', root: { rot: 3, y: -4 }, body: { rot: 4 }, head: { rot: 4 }, armR: { rot: 150 }, foreR: { rot: 20 } });
  P('lvEnterHit', { $: 'lvTypeA', root: { rot: -6, sy: 0.95 }, body: { rot: -12 }, head: { rot: -8 }, armR: { rot: 86 }, foreR: { rot: -6 } });
  // bấm nút / kéo cần (đứng nghiêng, tay vươn thẳng ra trước)
  P('lvReachFwd', { root: { rot: -6 }, body: { rot: -6 }, head: { rot: -4 }, thighR: { rot: 22 }, thighL: { rot: -16 }, armR: { rot: 92, sy: 1.25 }, foreR: { rot: -4, sy: 1.15 }, wR: 0, armL: { rot: 20 }, foreL: { rot: 30 } });
  P('lvPullBack', { root: { rot: 8, x: 4 }, body: { rot: 8 }, head: { rot: 6 }, thighR: { rot: 8 }, thighL: { rot: -22 }, armR: { rot: 60, sy: 1.1 }, foreR: { rot: 40 }, wR: 0, armL: { rot: -20 }, foreL: { rot: 40 } });
  P('lvHammerUp', { root: { rot: 6 }, body: { rot: 8 }, head: { rot: 2 }, thighR: { rot: 16 }, thighL: { rot: -14 }, armR: { rot: -160 }, foreR: { rot: -20 }, wR: -30, armL: { rot: 40 }, foreL: { rot: 40 } });
  P('lvHammerDown', { root: { rot: -8, sy: 0.95 }, body: { rot: -10 }, head: { rot: -6 }, thighR: { rot: 26 }, thighL: { rot: -20 }, armR: { rot: 100 }, foreR: { rot: -10 }, wR: -100, armL: { rot: 30 }, foreL: { rot: 50 } });
  P('lvWrenchA', { root: { rot: -4 }, body: { rot: -6 }, head: { rot: -6 }, armR: { rot: 80 }, foreR: { rot: 10 }, wR: -60, armL: { rot: 70 }, foreL: { rot: 20 } });
  P('lvWrenchB', { $: 'lvWrenchA', root: { rot: -2 }, armR: { rot: 70 }, foreR: { rot: 30 }, wR: 10 });
  // xịt bình chữa cháy: hai tay giữ bình trước ngực, người ngả ra sau vì sức giật
  P('lvSprayA', { root: { rot: 6, x: 3, sy: 0.96 }, body: { rot: 6 }, head: { rot: 2 }, thighR: { rot: 26 }, shinR: { rot: -10 }, thighL: { rot: -24 }, shinL: { rot: -10 }, armR: { rot: 70 }, foreR: { rot: 30 }, wR: 70, armL: { rot: 76 }, foreL: { rot: 24 } });
  P('lvSprayB', { $: 'lvSprayA', root: { rot: 9, x: 5, sy: 0.95 }, head: { rot: 4 }, armR: { rot: 66 }, foreR: { rot: 34 }, wR: 74 });
  // ngồi gục trên sofa (mông ở mặt đệm cao hơn sàn — root.y âm)
  P('lvSit', { root: { y: -14, sy: 0.96 }, thighR: { rot: 84 }, shinR: { rot: -76 }, thighL: { rot: 78 }, shinL: { rot: -72 }, body: { rot: 4 }, head: { rot: 4 },
    armR: { rot: 20 }, foreR: { rot: 40 }, wR: 0, armL: { rot: 14 }, foreL: { rot: 36 } });
  P('lvNapA', { $: 'lvSit', body: { rot: 12 }, head: { rot: 22, y: 3 }, armR: { rot: 6 }, foreR: { rot: 20 }, armL: { rot: 2 }, foreL: { rot: 20 } });
  P('lvNapB', { $: 'lvNapA', root: { y: -13, sy: 0.94 }, body: { rot: 14 }, head: { rot: 26, y: 4 } });
  P('lvSlump', { $: 'lvSit', root: { y: -10, sy: 0.9 }, body: { rot: 22 }, head: { rot: 30, y: 6 }, armR: { rot: -6 }, foreR: { rot: 6 }, armL: { rot: -8 }, foreL: { rot: 6 } });

  /* ---------------- chính diện ---------------- */
  P('lvF', { armR: { rot: -24 }, foreR: { rot: 6 }, wR: 0, armL: { rot: 10 }, foreL: { rot: 12 } });
  // thò tay vào túi đeo bên hông phải: vai hạ, nghiêng về phía túi, mắt nhìn xuống
  P('lvBagReach', { pelvis: { rot: 3 }, body: { rot: 7 }, head: { rot: 14, x: 2 }, armR: { rot: 6 }, foreR: { rot: -14 }, wR: 0, armL: { rot: 22 }, foreL: { rot: 18 } });
  P('lvBagDig', { $: 'lvBagReach', root: { y: 2, sy: 0.97 }, body: { rot: 10 }, head: { rot: 18, x: 3 }, armR: { rot: 2 }, foreR: { rot: -4 }, armL: { rot: 30 }, foreL: { rot: 30 } });
  P('lvBagDig2', { $: 'lvBagReach', body: { rot: 5 }, head: { rot: 12, x: 1 }, armR: { rot: 10 }, foreR: { rot: -22 } });
  // giơ đồ vừa lấy ra (ta-da!)
  P('lvShow', { root: { y: -4, sy: 1.03 }, body: { rot: -4 }, head: { rot: -8 }, armR: { rot: -138, sy: 1.15 }, foreR: { rot: -24 }, wR: 0, armL: { rot: 24 }, foreL: { rot: 20 } });
  // cầm đồ trước ngực
  P('lvHold', { armR: { rot: 36 }, foreR: { rot: 70 }, wR: 0, armL: { rot: 10 }, foreL: { rot: 12 } });
  // đọc sách: hai tay ôm sách trước ngực, cúi đầu
  P('lvReadA', { body: { rot: -1 }, head: { rot: 4, y: 3 }, armR: { rot: 40 }, foreR: { rot: 74 }, wR: 0, armL: { rot: -40 }, foreL: { rot: -74 } });
  P('lvReadB', { $: 'lvReadA', head: { rot: -4, y: 3 }, armL: { rot: -34 }, foreL: { rot: -90 } });
  // với lên giá sách (tay phải)
  P('lvShelfUp', { root: { y: -6, sy: 1.04 }, pelvis: { x: 2, rot: 4 }, body: { rot: -10 }, head: { rot: -12, x: -2 }, armR: { rot: -170, sy: 1.45 }, foreR: { rot: -8, sy: 1.2 }, wR: 0, armL: { rot: 20 }, foreL: { rot: 16 }, thighR: { rot: -4 } });
  // kính lúp trước mắt, soi trái — phải
  P('lvLensL', { pelvis: { rot: -3 }, body: { rot: 8 }, head: { rot: 10, x: -3 }, armR: { rot: -100 }, foreR: { rot: -60 }, wR: -10, armL: { rot: 40 }, foreL: { rot: 30 }, thighL: { rot: 6 } });
  P('lvLensR', { $: 'lvLensL', pelvis: { rot: 3 }, body: { rot: -6 }, head: { rot: -8, x: 3 }, armR: { rot: -150 }, foreR: { rot: -40 }, wR: 12 });
  P('lvLensDown', { $: 'lvLensL', root: { sy: 0.9, sx: 1.06 }, pelvis: { y: 2 }, body: { rot: 14 }, head: { rot: 18, y: 3 }, armR: { rot: -60 }, foreR: { rot: -40 }, wR: -20, thighR: { rot: 20 }, shinR: { rot: -24 }, thighL: { rot: -20 }, shinL: { rot: 24 } });
  // suy nghĩ: tay chống cằm, gõ chân
  P('lvPonder', { body: { rot: 3 }, head: { rot: -8, x: -1 }, armR: { rot: 30 }, foreR: { rot: 128 }, wR: 0, armL: { rot: -42 }, foreL: { rot: -64 } });
  P('lvPonder2', { $: 'lvPonder', head: { rot: 8, x: 1 }, body: { rot: -3 }, thighL: { rot: 10 }, shinL: { rot: -12 } });
  // uống cà phê (ly ở tay phải lên miệng)
  P('lvSipUp', { body: { rot: -3 }, head: { rot: -10 }, armR: { rot: 22, sy: 1.1 }, foreR: { rot: 132 }, wR: -30, armL: { rot: 10 }, foreL: { rot: 12 } });
  // xem đồng hồ ở cổ tay trái (ly vẫn ở tay phải)
  P('lvWatch', { $: 'lvHold', head: { rot: 12, x: 2, y: 2 }, body: { rot: 3 }, armL: { rot: -26 }, foreL: { rot: -108 } });
  P('lvWatchTap', { $: 'lvWatch', armL: { rot: -30 }, foreL: { rot: -100 }, thighR: { rot: -8 }, shinR: { rot: 10 } });
  // ngáp: vươn tay trái lên, ngả người
  P('lvYawn', { root: { sy: 1.04 }, body: { rot: 6 }, head: { rot: 10 }, armL: { rot: 160, sy: 1.3 }, foreL: { rot: 30 }, armR: { rot: 36 }, foreR: { rot: 70 }, wR: 0 });
  // điện thoại áp tai phải
  P('lvPhone', { head: { rot: 8, x: 1 }, body: { rot: -2 }, armR: { rot: -46 }, foreR: { rot: -150, sy: 1.1 }, wR: 0, armL: { rot: -30 }, foreL: { rot: -60 } });
  P('lvPhone2', { $: 'lvPhone', head: { rot: 2, y: 2 }, body: { rot: 2 }, thighL: { rot: 8 } });
  // vịt cao su (gỡ lỗi kiểu "nói với con vịt"): chìa vịt ra trước mặt
  P('lvDuck', { head: { rot: 6 }, body: { rot: -2 }, armR: { rot: -84 }, foreR: { rot: -70 }, wR: 0, armL: { rot: 60 }, foreL: { rot: 70 } });
  P('lvDuck2', { $: 'lvDuck', head: { rot: -6 }, armL: { rot: 100 }, foreL: { rot: 40 } });
  // ghi sổ (sổ ở tay phải trước ngực, tay trái viết)
  P('lvNote', { head: { rot: 6, y: 3 }, armR: { rot: 30 }, foreR: { rot: 80 }, wR: -10, armL: { rot: -30 }, foreL: { rot: -80 } });
  P('lvNote2', { $: 'lvNote', armL: { rot: -38 }, foreL: { rot: -70 } });
  // úp tay vào mặt (thất bại)
  P('lvFacepalm', { body: { rot: 4 }, head: { rot: 14, y: 3 }, armL: { rot: -30 }, foreL: { rot: -140 }, armR: { rot: -10 }, foreR: { rot: 10 }, wR: 0 });
  // tóc dựng / ôm đầu (thất bại lần hai)
  P('lvHeadGrab', { root: { sy: 0.96 }, head: { rot: -4 }, armL: { rot: 150 }, foreL: { rot: 70 }, armR: { rot: -150 }, foreR: { rot: -70 }, wR: 0 });
  P('lvHeadGrab2', { $: 'lvHeadGrab', root: { sy: 0.92, sx: 1.04 }, head: { rot: 6 } });
  // nhảy cẫng (pass)
  P('lvJump', { root: { y: -34, sy: 1.1, sx: 0.94 }, armL: { rot: 150, sy: 1.2 }, foreL: { rot: 20 }, armR: { rot: -150, sy: 1.2 }, foreR: { rot: -20 }, wR: 0, thighL: { rot: 26 }, shinL: { rot: -40 }, thighR: { rot: -26 }, shinR: { rot: 40 } });
  P('lvSquash', { root: { sy: 0.84, sx: 1.12 }, pelvis: { y: 2 }, armL: { rot: 50 }, foreL: { rot: 30 }, armR: { rot: -50 }, foreR: { rot: -30 }, wR: 0, thighL: { rot: 18 }, shinL: { rot: -22 }, thighR: { rot: -18 }, shinR: { rot: 22 } });
  // mệt lả (giới hạn): người rũ, tay buông
  P('lvDroop', { root: { sy: 0.94 }, body: { rot: 8, sy: 0.94 }, head: { rot: 16, y: 6 }, armR: { rot: 4 }, foreR: { rot: 0 }, wR: 0, armL: { rot: -4 }, foreL: { rot: 0 } });
  P('lvBow', { body: { sy: 0.9 }, head: { y: 10 }, root: { sy: 0.97 }, armR: { rot: 10 }, foreR: { rot: 40 }, armL: { rot: -10 }, foreL: { rot: -40 }, wR: 0 });

  /* ---------------- clip (tại chỗ, dài theo st.dur) ---------------- */
  var clip = C.clip;
  // lặp dãy tư thế theo nhịp `beat` cho đủ d giây; kết thúc về tư thế đầu (vòng lặp nối liền)
  function cyc(list, beat, d, ease) {
    var keys = [[0, list[0], 'io']], n = Math.max(1, Math.round(d / beat));
    for (var i = 1; i <= n; i++) keys.push([Math.min(d, i * d / n), list[i % list.length], ease || 'sine']);
    keys[keys.length - 1][1] = list[0];
    return keys;
  }
  function tickEvents(d, every, sfx, gain) { var ev = []; for (var t = every; t < d - 0.05; t += every) ev.push([t, { sfx: sfx, gain: gain }]); return ev; }
  function loop(id, label, view, list, beat, extra) {
    clip(id, { label: label, view: view, make: function (st) {
      var d = Math.max(0.3, st.dur || 1.2), b = beat * (st.fast ? 0.6 : 1);
      return Object.assign({ keys: cyc(list, b, d), dur: d }, extra ? extra(st, d) : {});
    } });
  }
  // đi bộ / chạy tại chỗ (vị trí do đạo diễn nội suy): chu kỳ A → B → A' → B', về dáng đứng ở cuối
  clip('lvWalk', { label: 'Đi bộ', view: 'q90', make: function (st) {
    var d = Math.max(0.3, st.dur || 1), run = !!st.run, half = run ? 0.18 : 0.27, n = Math.max(2, Math.round(d / half));
    var A = run ? 'lvRunA' : 'lvWalkA', B = run ? 'lvRunB' : 'lvWalkB', seq = [A, B, S(C.POSES[A]), S(C.POSES[B])], keys = [[0, 'lvStand', 'io']], ev = [];
    for (var i = 1; i < n; i++) { keys.push([i * d / n, seq[(i - 1) % 4], i % 2 ? 'out' : 'in']); if (i % 2) ev.push([i * d / n, { sfx: 'step', gain: run ? 0.3 : 0.18 }]); }
    keys.push([d, 'lvStand', 'io']);
    if (run) ev.unshift([0.05, { sfx: 'whoosh', gain: 0.35 }]);
    return { keys: keys, dur: d, events: ev };
  } });
  loop('lvIdle', 'Thở', 'front', ['lvF', mix(C.POSES.lvF, { root: { sy: 0.985 }, head: { rot: 2 } })], 0.9);
  loop('lvIdleSide', 'Thở (nghiêng)', 'q90', ['lvStand', mix(C.POSES.lvStand, { root: { sy: 0.985 }, head: { rot: -2 } })], 0.9);
  // lục túi: thò tay → đào bới (lắc) → rút ra giơ lên (đồ xuất hiện trong tay ở 62 % — engine/live.js PROP_AT) → cầm trước ngực
  clip('lvRummage', { label: 'Lục túi', view: 'front', make: function (st) {
    var d = st.dur || 1.3, k = d / 1.3;
    return { dur: d, keys: [[0, 'lvF'], [0.22 * k, 'lvBagReach', 'out'], [0.38 * k, 'lvBagDig', 'sine'], [0.52 * k, 'lvBagDig2', 'sine'], [0.66 * k, 'lvBagDig', 'sine'], [0.8 * k, 'lvBagReach', 'sine'],
      [1.0 * k, 'lvShow', 'back'], [1.3 * k, 'lvHold', 'io']],
      events: [[0.2 * k, { sfx: 'zip', gain: 0.35 }], [0.45 * k, { sfx: 'scramble', gain: 0.25 }], [0.82 * k, { sfx: 'pop', gain: 0.5 }]] };
  } });
  // cất đồ vào túi (đồ biến khỏi tay ở 55 %)
  clip('lvStow', { label: 'Cất vào túi', view: 'front', make: function (st) {
    var d = st.dur || 0.9, k = d / 0.9;
    return { dur: d, keys: [[0, 'lvHold'], [0.3 * k, 'lvBagReach', 'io'], [0.5 * k, 'lvBagDig', 'sine'], [0.65 * k, 'lvBagReach', 'sine'], [0.9 * k, 'lvF', 'io']],
      events: [[0.5 * k, { sfx: 'zip', gain: 0.3 }]] };
  } });
  // với lên giá lấy / trả sách (sách xuất hiện / biến mất ở 50 %)
  clip('lvShelf', { label: 'Với lên giá sách', view: 'front', make: function (st) {
    var d = st.dur || 1.0, k = d / 1.0;
    return { dur: d, keys: [[0, st.back ? 'lvReadA' : 'lvF'], [0.4 * k, 'lvShelfUp', 'out'], [0.58 * k, mix(C.POSES.lvShelfUp, { root: { y: -8 } }), 'sine'], [1.0 * k, st.back ? 'lvF' : 'lvReadA', 'io']],
      events: [[0.5 * k, { sfx: 'tick', gain: 0.4 }]] };
  } });
  loop('lvType', 'Gõ phím', 'q90', ['lvTypeA', 'lvTypeB'], 0.13, function (st, d) { return { events: tickEvents(d, st.fast ? 0.12 : 0.2, 'tick', 0.16) }; });
  clip('lvTypeEnter', { label: 'Gõ lệnh rồi đập Enter', view: 'q90', make: function (st) {
    var d = Math.max(1, st.dur || 1.4), typ = d - 0.7, keys = cyc(['lvTypeA', 'lvTypeB'], 0.11, typ);
    keys.push([typ + 0.3, 'lvEnterUp', 'out'], [typ + 0.42, 'lvEnterHit', 'snap'], [d, 'lvTypeA', 'io']);
    return { keys: keys, dur: d, events: tickEvents(typ, 0.16, 'tick', 0.16).concat([[typ + 0.42, { sfx: 'bonk', gain: 0.5 }]]) };
  } });
  loop('lvRead', 'Đọc sách', 'front', ['lvReadA', 'lvReadB'], 0.7, function (st, d) { return { events: tickEvents(d, 1.4, 'slide-up', 0.15) }; });
  loop('lvMagnify', 'Soi kính lúp', 'front', ['lvLensL', 'lvLensR', 'lvLensDown', 'lvLensR'], 0.42, function (st, d) { return { events: tickEvents(d, 0.84, 'hmm', 0.22) }; });
  loop('lvPonder', 'Chống cằm suy nghĩ', 'front', ['lvPonder', 'lvPonder2'], 0.6);
  loop('lvNote', 'Ghi sổ', 'front', ['lvNote', 'lvNote2'], 0.2);
  clip('lvSip', { label: 'Nhấp cà phê', view: 'front', make: function (st) {
    var d = Math.max(1.2, st.dur || 2), n = Math.max(1, Math.floor(d / 2)), keys = [[0, 'lvHold']], ev = [];
    for (var i = 0; i < n; i++) { var t0 = i * d / n; keys.push([t0 + 0.35, 'lvSipUp', 'io'], [t0 + 0.9, mix(C.POSES.lvSipUp, { head: { rot: -14 } }), 'sine'], [t0 + 1.3, 'lvHold', 'io']); ev.push([t0 + 0.6, { sfx: 'gulp', gain: 0.3 }]); }
    keys.push([d, 'lvHold', 'sine']);
    return { keys: keys, dur: d, events: ev };
  } });
  loop('lvWatch', 'Xem đồng hồ', 'front', ['lvWatch', 'lvWatchTap'], 0.45, function (st, d) { return { events: tickEvents(d, 0.9, 'tick', 0.25) }; });
  clip('lvYawn', { label: 'Ngáp', view: 'front', make: function (st) {
    var d = Math.max(1.2, st.dur || 1.8);
    return { dur: d, keys: [[0, 'lvHold'], [0.5, 'lvYawn', 'io'], [d - 0.5, mix(C.POSES.lvYawn, { head: { rot: 14 } }), 'sine'], [d, 'lvHold', 'io']], events: [[0.5, { sfx: 'slide-down', gain: 0.25 }]] };
  } });
  // ngồi xuống sofa / ngủ gật / bật dậy (view q90: sofa ở sau lưng, người ngồi nghiêng)
  clip('lvSitDown', { label: 'Ngồi phịch xuống sofa', view: 'q90', make: function (st) {
    var d = st.dur || 0.7; return { dur: d, keys: [[0, 'lvStand'], [d * 0.55, mix(C.POSES.lvSit, { root: { y: -20 } }), 'in'], [d, 'lvSit', 'back']], events: [[d * 0.6, { sfx: 'boing', gain: 0.3 }]] };
  } });
  loop('lvNap', 'Ngủ gật', 'q90', ['lvNapA', 'lvNapB'], 1.1, function (st, d) { return { events: tickEvents(d, 2.2, 'snore', 0.22) }; });
  loop('lvSlump', 'Gục trên sofa', 'q90', ['lvSlump', mix(C.POSES.lvSlump, { head: { rot: 34 } })], 1.4);
  clip('lvWake', { label: 'Giật mình tỉnh dậy', view: 'q90', make: function (st) {
    var d = st.dur || 0.8; return { dur: d, keys: [[0, 'lvNapA'], [0.12, mix(C.POSES.lvSit, { root: { y: -30 }, head: { rot: -10 } }), 'snap'], [0.45, mix(C.POSES.lvStand, { root: { y: -18 } }), 'out'], [d, 'lvStand', 'down']],
      events: [[0.1, { sfx: 'giat-minh', gain: 0.4 }]] };
  } });
  loop('lvPhone', 'Nghe điện thoại', 'front', ['lvPhone', 'lvPhone2'], 0.5, function (st, d) { return { events: [[0.05, { sfx: 'chime', gain: 0.3 }]] }; });
  loop('lvDuck', 'Giải thích cho vịt cao su', 'front', ['lvDuck', 'lvDuck2'], 0.35, function (st, d) { return { events: tickEvents(d, 0.7, 'squeak', 0.25) }; });
  clip('lvPress', { label: 'Bấm nút', view: 'q90', make: function (st) {
    var d = Math.max(0.8, st.dur || 1); return { dur: d, keys: [[0, 'lvStand'], [d * 0.3, 'lvPullBack', 'out'], [d * 0.5, 'lvReachFwd', 'snap'], [d, 'lvStand', 'io']], events: [[d * 0.5, { sfx: 'bonk', gain: 0.5 }]] };
  } });
  clip('lvLever', { label: 'Kéo cần chạy test', view: 'q90', make: function (st) {
    var d = Math.max(0.8, st.dur || 1.1); return { dur: d, keys: [[0, 'lvStand'], [d * 0.35, 'lvReachFwd', 'out'], [d * 0.65, 'lvPullBack', 'snap'], [d, 'lvStand', 'io']], events: [[d * 0.65, { sfx: 'cua-ket', gain: 0.4 }]] };
  } });
  loop('lvHammer', 'Đập búa', 'q90', ['lvHammerUp', 'lvHammerDown'], 0.32, function (st, d) { var ev = []; for (var t = 0.32; t < d; t += 0.64) ev.push([t, { sfx: 'bonk', gain: 0.4, shake: 2 }]); return { events: ev }; });
  loop('lvWrench', 'Vặn cờ lê', 'q90', ['lvWrenchA', 'lvWrenchB'], 0.3, function (st, d) { return { events: tickEvents(d, 0.6, 'squeak', 0.2) }; });
  loop('lvSpray', 'Xịt bình chữa cháy', 'q90', ['lvSprayA', 'lvSprayB'], 0.12, function (st, d) { return { events: [[0.05, { sfx: 'gio-giat', gain: 0.4 }]] }; });
  loop('lvFacepalm', 'Úp mặt', 'front', ['lvFacepalm', mix(C.POSES.lvFacepalm, { head: { rot: 18 } })], 0.6, function () { return { events: [[0.1, { sfx: 'sad', gain: 0.3 }]] }; });
  loop('lvHeadGrab', 'Ôm đầu tóc dựng', 'front', ['lvHeadGrab', 'lvHeadGrab2'], 0.18, function () { return { events: [[0.05, { sfx: 'sting', gain: 0.35 }]] }; });
  clip('lvCheer', { label: 'Nhảy cẫng', view: 'front', make: function (st) {
    var d = Math.max(0.9, st.dur || 1.4), n = Math.max(1, Math.round(d / 0.7)), keys = [[0, 'lvF']], ev = [];
    for (var i = 0; i < n; i++) { var t0 = i * d / n; keys.push([t0 + 0.12, 'lvSquash', 'out'], [t0 + 0.34, 'lvJump', 'up', { ez: { 'root.y': 'up' } }], [t0 + 0.56, 'lvSquash', 'down', { ez: { 'root.y': 'down' } }]); ev.push([t0 + 0.3, { sfx: i ? 'boing' : 'ta-da', gain: 0.4 }]); }
    keys.push([d, 'lvF', 'io']);
    return { keys: keys, dur: d, events: ev };
  } });
  loop('lvDroop', 'Mệt lả', 'front', ['lvDroop', mix(C.POSES.lvDroop, { head: { rot: 20 } })], 1.2, function () { return { events: [[0.1, { sfx: 'slide-down', gain: 0.3 }]] }; });
  clip('lvBow', { label: 'Cúi chào', view: 'front', make: function (st) {
    var d = Math.max(1, st.dur || 1.4); return { dur: d, keys: [[0, 'lvF'], [0.4, 'lvBow', 'io'], [d - 0.4, 'lvBow', 'sine'], [d, 'lvF', 'io']], events: [[0.4, { sfx: 'chime', gain: 0.3 }]] };
  } });
  clip('lvWave', { label: 'Vẫy tay', view: 'front', make: function (st) {
    var d = Math.max(0.8, st.dur || 1.4);
    return { dur: d, keys: cyc([mix(C.POSES.fWave, { wR: 0, armR: { rot: -24 }, foreR: { rot: 6 } }), mix(C.POSES.fWave2, { wR: 0, armR: { rot: -24 }, foreR: { rot: 6 } })], 0.22, d), events: [[0.1, { sfx: 'chime', gain: 0.3 }]] };
  } });
  // CÔNG TẮC VIỆC: giơ bảng clapper lên, đập "cạch" hai lần (chuyển cảnh = việc mới)
  clip('lvClap', { label: 'Đập bảng clapper', view: 'front', make: function (st) {
    var d = Math.max(1, st.dur || 1.4), up = mix(C.POSES.lvShow, { armR: { rot: -120 }, foreR: { rot: -40 } }), hit = mix(C.POSES.lvShow, { armR: { rot: -100 }, foreR: { rot: -10 }, head: { rot: 4 } });
    return { dur: d, keys: [[0, 'lvHold'], [0.3, up, 'back'], [0.45, hit, 'snap'], [0.62, up, 'out'], [0.77, hit, 'snap'], [d, 'lvHold', 'io']],
      events: [[0.45, { sfx: 'tick', gain: 0.6 }], [0.77, { sfx: 'tick', gain: 0.7 }], [0.8, { sfx: 'ta-da', gain: 0.3 }]] };
  } });
  clip('lvStartle', { label: 'Giật nảy mình', view: 'front', make: function (st) {
    var d = Math.max(0.7, st.dur || 0.9);
    return { dur: d, keys: [[0, 'lvF'], [0.1, 'lvSquash', 'out'], [0.26, mix(C.POSES.lvJump, { root: { y: -40 } }), 'up', { ez: { 'root.y': 'up' } }], [0.5, 'lvSquash', 'down', { ez: { 'root.y': 'down' } }], [d, 'lvF', 'io']],
      events: [[0.08, { sfx: 'sting', gain: 0.4 }], [0.5, { sfx: 'boing', gain: 0.3 }]] };
  } });
})(typeof window !== 'undefined' ? window.GenChibi : globalThis.GenChibi);
