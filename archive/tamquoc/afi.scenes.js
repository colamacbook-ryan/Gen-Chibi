/* gen-chibi — thư viện cảnh chính thức afi.scenes (loại asset: cảnh)
 * © 2026 Afi Labs — All rights reserved.
 * Phông vẽ bằng code, chỉ dùng token màu cảnh (P.sky, P.grass…) → đổi giờ / bảng màu không phải vẽ lại.
 * Cảnh = phối phông: 27 phông → 8 cảnh; mỗi phông dùng lại ở nhiều cảnh.
 * Khung toạ độ: phông toàn khung 640×360 (đường chân trời ~ y 230–260, mặt đất từ y ~258);
 * đạo cụ cảnh (deco) vẽ quanh gốc (0,0) = chân vật, cao lên phía y âm.
 */
(function (GC) {
  'use strict';
  var SRC = 'afi.scenes · vẽ bằng code';
  function n(v) { return Math.round(v * 10) / 10; }
  function cloud(P, x, y, s) {
    return '<g fill="' + P.cloud + '" opacity="0.92"><ellipse cx="' + x + '" cy="' + y + '" rx="' + n(48 * s) + '" ry="' + n(13 * s) + '"/>' +
      '<circle cx="' + n(x - 18 * s) + '" cy="' + n(y - 7 * s) + '" r="' + n(15 * s) + '"/><circle cx="' + n(x + 9 * s) + '" cy="' + n(y - 12 * s) + '" r="' + n(20 * s) + '"/>' +
      '<circle cx="' + n(x + 30 * s) + '" cy="' + n(y - 4 * s) + '" r="' + n(12 * s) + '"/></g>';
  }
  function blades(P, x, y, s, fill) {
    return '<path d="M' + n(x - 8 * s) + ',' + y + ' Q' + n(x - 7 * s) + ',' + n(y - 14 * s) + ' ' + n(x - 12 * s) + ',' + n(y - 24 * s) +
      ' Q' + n(x - 2 * s) + ',' + n(y - 14 * s) + ' ' + x + ',' + n(y - 30 * s) + ' Q' + n(x + 3 * s) + ',' + n(y - 14 * s) + ' ' + n(x + 13 * s) + ',' + n(y - 22 * s) +
      ' Q' + n(x + 7 * s) + ',' + n(y - 12 * s) + ' ' + n(x + 8 * s) + ',' + y + ' Z" fill="' + (fill || P.leaf) + '"/>';
  }
  function stalk(P, x, y0, y1, w, lean) {
    var s = '<path d="M' + x + ',' + y0 + ' L' + n(x + lean) + ',' + y1 + '" stroke="' + P.bamboo + '" stroke-width="' + w + '" stroke-linecap="round"/>';
    for (var y = y0 - 34; y > y1 + 10; y -= 34) {
      var xx = n(x + lean * (y0 - y) / (y0 - y1));
      s += '<path d="M' + n(xx - w / 2 - 1) + ',' + y + ' h' + (w + 2) + '" stroke="' + P.leaf + '" stroke-width="2" opacity="0.7"/>';
    }
    return s;
  }
  function leafSpray(P, x, y, s, dir) {
    var d = dir || 1, o = '';
    for (var i = 0; i < 4; i++) {
      var a = (-20 + i * 22) * d, rad = a * Math.PI / 180, lx = n(x + Math.cos(rad) * 20 * s * d), ly = n(y + Math.sin(rad) * 12 * s);
      o += '<ellipse cx="' + lx + '" cy="' + ly + '" rx="' + n(15 * s) + '" ry="' + n(3.6 * s) + '" fill="' + P.leaf + '" transform="rotate(' + Math.round(a) + ' ' + lx + ' ' + ly + ')"/>';
    }
    return o;
  }

  GC.pack({
    id: 'afi.scenes', name: 'Cảnh Tam Quốc', owner: 'Afi Labs', group: 'official', visibility: 'public', version: '0.1.0',
    license: '© 2026 Afi Labs — All rights reserved', description: 'Phông cảnh (trời, cảnh xa, công trình, mặt đất, đạo cụ, tiền cảnh) và các cảnh phối sẵn.'
  }, function (D) {
    function S(slot, id, label, draw, extra) { var o = { slot: slot, id: id, label: label, draw: draw, source: SRC }; for (var k in extra || {}) o[k] = extra[k]; D.scenery(o); }

    /* ---------- trời / tường */
    S('sky', 'open', 'Trời quang', function (C) {
      var P = C.P, night = C.time === 'night';
      return '<defs><linearGradient id="gsSkyOpen' + C.time + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.sky + '"/><stop offset="1" stop-color="' + P.skyLow + '"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="640" height="360" fill="url(#gsSkyOpen' + C.time + ')"/>' +
        '<circle cx="512" cy="74" r="46" fill="' + P.sun + '" opacity="0.28"/><circle cx="512" cy="74" r="27" fill="' + P.sun + '"/>' +
        (night ? '<circle cx="527" cy="63" r="22" fill="' + P.sky + '"/>' : '') +
        cloud(P, 112, 74, 1) + cloud(P, 318, 46, 0.78) + cloud(P, 612, 132, 0.66);
    }, { outdoor: true });
    S('sky', 'plain', 'Trời trơn', function (C) {
      var P = C.P;
      return '<defs><linearGradient id="gsSkyPlain' + C.time + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.sky + '"/><stop offset="1" stop-color="' + P.skyLow + '"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="640" height="360" fill="url(#gsSkyPlain' + C.time + ')"/>';
    }, { outdoor: true });
    S('sky', 'indoor-wall', 'Tường gỗ trong nhà', function (C) {
      var P = C.P, s = '<rect x="0" y="0" width="640" height="360" fill="' + P.wall + '"/>';
      for (var x = 0; x < 640; x += 80) s += '<rect x="' + x + '" y="0" width="80" height="360" fill="' + P.wood + '" opacity="' + (x % 160 ? 0.05 : 0.09) + '"/>';
      s += '<rect x="0" y="34" width="640" height="12" fill="' + P.woodDark + '"/><rect x="0" y="196" width="640" height="8" fill="' + P.woodDark + '" opacity="0.8"/>';
      s += '<rect x="34" y="0" width="18" height="360" fill="' + P.wood + '"/><rect x="588" y="0" width="18" height="360" fill="' + P.wood + '"/>';
      // cửa sổ tròn song gỗ — thấy trời theo giờ
      s += '<circle cx="456" cy="118" r="52" fill="' + P.woodDark + '"/><circle cx="456" cy="118" r="45" fill="' + P.sky + '"/>' +
        '<circle cx="470" cy="104" r="11" fill="' + P.sun + '" opacity="0.9"/>' +
        '<g stroke="' + P.woodDark + '" stroke-width="3"><path d="M411,118 H501 M456,73 V163 M424,86 L488,150 M488,86 L424,150"/></g>';
      // tranh cuộn
      s += '<rect x="150" y="58" width="74" height="122" fill="#f7f1e2" stroke="' + P.woodDark + '" stroke-width="2"/><rect x="144" y="54" width="86" height="7" rx="3" fill="' + P.woodDark + '"/>' +
        '<rect x="144" y="178" width="86" height="7" rx="3" fill="' + P.woodDark + '"/>' +
        '<path d="M162,150 Q178,110 196,128 T214,96" stroke="' + P.leaf + '" stroke-width="3" fill="none" opacity="0.7"/><circle cx="200" cy="82" r="9" fill="' + P.cloth + '" opacity="0.8"/>';
      return s;
    }, { outdoor: false });

    /* ---------- cảnh xa */
    S('far', 'mountains', 'Núi xa', function (C) {
      var P = C.P;
      return '<path d="M0,214 Q34,186 62,170 Q84,160 104,184 Q140,132 176,118 Q206,140 238,178 Q270,150 300,146 Q338,170 372,196 Q414,138 456,124 Q492,150 530,186 Q566,160 598,156 Q622,166 640,176 L640,280 L0,280 Z" fill="' + P.hillFar + '"/>' +
        '<path d="M150,140 Q176,118 200,138 Q186,134 176,146 Q166,136 150,140 Z M430,146 Q456,124 480,144 Q466,140 456,152 Q446,142 430,146 Z" fill="#ffffff" opacity="0.45"/>' +
        '<path d="M0,248 Q70,206 148,232 Q214,250 276,226 Q350,198 430,230 Q500,254 560,226 Q606,210 640,224 L640,290 L0,290 Z" fill="' + P.hill + '"/>' +
        '<path d="M0,264 Q90,244 190,258 Q300,272 410,252 Q520,236 640,256 L640,290 L0,290 Z" fill="' + P.grass + '" opacity="0.55"/>';
    });
    S('far', 'city-wall', 'Tường thành', function (C) {
      var P = C.P, s = '<path d="M0,214 Q120,186 240,204 Q380,180 520,200 Q590,192 640,204 L640,262 L0,262 Z" fill="' + P.hillFar + '"/>';
      s += '<rect x="0" y="190" width="640" height="78" fill="' + P.stone + '"/>';
      for (var x = 0; x < 640; x += 30) s += '<rect x="' + x + '" y="178" width="18" height="14" fill="' + P.stone + '"/>';
      s += '<g stroke="' + P.woodDark + '" stroke-width="1.2" opacity="0.22">';
      for (var y = 206; y < 268; y += 16) s += '<path d="M0,' + y + ' H640"/>';
      s += '</g>';
      // cổng thành + lầu
      s += '<rect x="250" y="150" width="140" height="118" fill="' + P.stone + '"/><rect x="250" y="150" width="140" height="118" fill="#000000" opacity="0.06"/>' +
        '<path d="M296,268 V232 Q320,206 344,232 V268 Z" fill="' + P.woodDark + '"/>' +
        '<rect x="270" y="116" width="100" height="36" fill="' + P.wall + '"/>' +
        '<g fill="' + P.cloth + '"><rect x="276" y="116" width="7" height="36"/><rect x="316" y="116" width="7" height="36"/><rect x="357" y="116" width="7" height="36"/></g>' +
        '<path d="M232,120 Q262,114 286,96 L354,96 Q378,114 408,120 Q404,126 396,124 L244,124 Q236,126 232,120 Z" fill="#4f5d6b"/>' +
        '<path d="M262,98 Q290,92 304,78 L336,78 Q350,92 378,98 Z" fill="#4f5d6b"/>';
      return s;
    });
    S('far', 'river', 'Sông rộng', function (C) {
      var P = C.P;
      return '<path d="M0,214 Q60,196 130,206 Q220,186 300,204 Q400,190 480,202 Q560,192 640,206 L640,232 L0,232 Z" fill="' + P.hillFar + '"/>' +
        '<rect x="0" y="226" width="640" height="64" fill="' + P.water + '"/>' +
        '<g stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.5"><path d="M40,244 h46 M150,258 h70 M300,240 h38 M390,266 h84 M520,248 h60 M90,278 h40"/></g>' +
        '<path d="M470,226 l18,-8 l26,0 l12,8 Z" fill="' + P.woodDark + '" opacity="0.7"/><path d="M494,218 V196 L512,214 Z" fill="' + P.wall + '" opacity="0.8"/>';
    });
    S('far', 'bamboo-far', 'Rừng trúc xa', function (C) {
      var P = C.P, s = '<rect x="0" y="0" width="640" height="290" fill="' + P.bamboo + '" opacity="0.12"/>';
      for (var i = 0; i < 24; i++) {
        var x = 12 + i * 27 + (i * 37 % 11), w = 6 + (i * 13 % 4);
        s += '<g opacity="' + (0.45 + (i % 3) * 0.14).toFixed(2) + '">' + stalk(P, x, 292, -10, w, (i % 2 ? 6 : -5)) + '</g>';
        if (i % 3 === 0) s += '<g opacity="0.5">' + leafSpray(P, x + 4, 60 + (i * 29 % 120), 1, i % 2 ? 1 : -1) + '</g>';
      }
      return s;
    });

    /* ---------- công trình */
    S('mid', 'thatched-hut', 'Nhà tranh (thảo lư)', function (C) {
      var P = C.P;
      return '<ellipse cx="486" cy="296" rx="104" ry="9" fill="#000000" opacity="0.08"/>' +
        '<rect x="412" y="210" width="148" height="84" fill="' + P.wall + '"/>' +
        '<rect x="410" y="210" width="8" height="84" fill="' + P.wood + '"/><rect x="554" y="210" width="8" height="84" fill="' + P.wood + '"/>' +
        '<rect x="470" y="236" width="34" height="58" fill="' + P.woodDark + '"/><circle cx="497" cy="266" r="2" fill="' + P.light + '"/>' +
        '<rect x="520" y="228" width="26" height="22" fill="' + P.woodDark + '" opacity="0.85"/><path d="M533,228 V250 M520,239 H546" stroke="' + P.wall + '" stroke-width="2"/>' +
        '<path d="M382,222 L436,160 Q486,136 536,160 L590,222 Q486,206 382,222 Z" fill="' + P.roof + '"/>' +
        '<g stroke="' + P.woodDark + '" stroke-width="1.6" opacity="0.28" fill="none"><path d="M410,212 L446,166 M440,210 L466,156 M470,208 L486,150 M502,208 L506,150 M532,210 L528,156 M562,212 L548,168"/></g>' +
        '<path d="M382,222 Q486,206 590,222" stroke="' + P.woodDark + '" stroke-width="2.4" fill="none" opacity="0.5"/>' +
        '<g fill="' + P.stone + '"><ellipse cx="430" cy="296" rx="12" ry="4"/><ellipse cx="487" cy="298" rx="22" ry="5"/><ellipse cx="545" cy="296" rx="12" ry="4"/></g>';
    });
    S('mid', 'army-tent', 'Lều quân', function (C) {
      var P = C.P;
      return '<ellipse cx="470" cy="294" rx="102" ry="9" fill="#000000" opacity="0.1"/>' +
        '<path d="M376,292 L470,176 L564,292 Z" fill="' + P.cloth + '"/>' +
        '<path d="M470,176 L564,292 L516,292 Z" fill="#000000" opacity="0.12"/>' +
        '<g stroke="' + P.wall + '" stroke-width="5" opacity="0.6"><path d="M470,176 L420,292 M470,176 L520,292"/></g>' +
        '<path d="M450,292 L470,232 L490,292 Z" fill="' + P.woodDark + '"/>' +
        '<path d="M470,176 V146" stroke="' + P.woodDark + '" stroke-width="4"/><path d="M472,146 L500,152 L472,160 Z" fill="' + P.light + '"/>' +
        '<path d="M376,292 L350,300 M564,292 L590,300" stroke="' + P.woodDark + '" stroke-width="2"/>' +
        '<path d="M570,292 L612,240 L654,292 Z" fill="' + P.cloth + '" opacity="0.85"/><path d="M600,292 L612,262 L624,292 Z" fill="' + P.woodDark + '" opacity="0.85"/>';
    });
    S('mid', 'pavilion', 'Đình', function (C) {
      var P = C.P, s = '<ellipse cx="480" cy="300" rx="116" ry="8" fill="#000000" opacity="0.08"/>' +
        '<rect x="380" y="280" width="200" height="16" fill="' + P.stone + '"/><rect x="380" y="280" width="200" height="4" fill="#ffffff" opacity="0.3"/>';
      [398, 446, 514, 562].forEach(function (x) { s += '<rect x="' + (x - 5) + '" y="196" width="10" height="86" fill="' + P.cloth + '"/>'; });
      s += '<rect x="386" y="192" width="188" height="10" fill="' + P.woodDark + '"/>' +
        '<g stroke="' + P.woodDark + '" stroke-width="2" opacity="0.6"><path d="M398,248 H446 M514,248 H562 M398,262 H446 M514,262 H562"/></g>' +
        '<path d="M352,196 Q372,190 390,170 L570,170 Q588,190 608,196 Q612,204 600,200 L360,200 Q348,204 352,196 Z" fill="#4f5d6b"/>' +
        '<path d="M392,172 Q420,166 438,148 L522,148 Q540,166 568,172 Z" fill="#4f5d6b"/>' +
        '<path d="M440,148 L480,132 L520,148 Z" fill="#3e4a57"/><circle cx="480" cy="130" r="4" fill="' + P.light + '"/>';
      return s;
    });

    /* ---------- mặt đất */
    S('ground', 'grass', 'Bãi cỏ', function (C) {
      var P = C.P, s = '<path d="M0,262 Q160,252 320,258 Q480,264 640,254 L640,360 L0,360 Z" fill="' + P.grass + '"/>' +
        '<path d="M0,300 Q200,288 400,298 Q540,304 640,294 L640,360 L0,360 Z" fill="#000000" opacity="0.05"/>';
      [[40, 290], [130, 340], [250, 300], [380, 352], [470, 296], [590, 330], [300, 274], [560, 276]].forEach(function (t, i) {
        s += '<g opacity="0.55">' + blades(P, t[0], t[1], 0.5 + (i % 3) * 0.12) + '</g>';
      });
      return s;
    });
    S('ground', 'dirt-road', 'Đường đất', function (C) {
      var P = C.P;
      return '<path d="M0,262 Q160,252 320,258 Q480,264 640,254 L640,360 L0,360 Z" fill="' + P.grass + '"/>' +
        '<path d="M258,258 Q320,254 384,258 L600,360 L40,360 Z" fill="' + P.path + '"/>' +
        '<g fill="' + P.woodDark + '" opacity="0.18"><ellipse cx="300" cy="300" rx="16" ry="3"/><ellipse cx="380" cy="330" rx="22" ry="4"/><ellipse cx="230" cy="342" rx="14" ry="3"/></g>' +
        '<g opacity="0.5">' + blades(P, 60, 300, 0.6) + blades(P, 590, 318, 0.7) + blades(P, 150, 350, 0.5) + '</g>';
    });
    S('ground', 'dirt', 'Sân đất nện', function (C) {
      var P = C.P;
      return '<path d="M0,260 Q320,250 640,260 L640,360 L0,360 Z" fill="' + P.ground + '"/>' +
        '<path d="M0,306 Q320,292 640,306 L640,360 L0,360 Z" fill="#000000" opacity="0.06"/>' +
        '<g fill="' + P.stone + '" opacity="0.6"><ellipse cx="80" cy="290" rx="7" ry="3"/><ellipse cx="420" cy="276" rx="5" ry="2"/><ellipse cx="560" cy="340" rx="9" ry="3"/><ellipse cx="250" cy="348" rx="6" ry="2"/></g>';
    });
    S('ground', 'wood-floor', 'Sàn gỗ', function (C) {
      var P = C.P, s = '<rect x="0" y="246" width="640" height="114" fill="' + P.wood + '"/><rect x="0" y="242" width="640" height="8" fill="' + P.woodDark + '"/>';
      s += '<g stroke="' + P.woodDark + '" stroke-width="1.6" opacity="0.35">';
      [268, 292, 320, 352].forEach(function (y, i) {
        s += '<path d="M0,' + y + ' H640"/>';
        for (var x = (i % 2) * 70 + 40; x < 640; x += 140) s += '<path d="M' + x + ',' + (y - [22, 24, 28, 32][i]) + ' V' + y + '"/>';
      });
      return s + '</g><rect x="0" y="250" width="640" height="20" fill="#000000" opacity="0.08"/>';
    });

    /* ---------- tiền cảnh */
    S('front', 'grass-tufts', 'Khóm cỏ tiền cảnh', function (C) {
      var P = C.P, s = '';
      [[10, 1.4], [46, 1.1], [600, 1.5], [632, 1.1], [574, 0.9]].forEach(function (t) { s += blades(P, t[0], 362, t[1]); });
      return s;
    });
    S('front', 'bamboo-edge', 'Trúc hai bên', function (C) {
      var P = C.P;
      return stalk(P, 14, 370, -10, 12, 4) + stalk(P, 44, 370, -10, 9, -3) + stalk(P, 626, 370, -10, 12, -4) + stalk(P, 598, 370, -10, 9, 3) +
        leafSpray(P, 40, 70, 1.3, 1) + leafSpray(P, 20, 180, 1.1, 1) + leafSpray(P, 600, 90, 1.3, -1) + leafSpray(P, 620, 210, 1.1, -1);
    });
    S('front', 'curtain', 'Rèm vải', function (C) {
      var P = C.P;
      return '<path d="M0,0 L132,0 Q92,80 70,150 Q58,190 36,206 Q20,214 0,214 Z" fill="' + P.cloth + '"/>' +
        '<path d="M640,0 L508,0 Q548,80 570,150 Q582,190 604,206 Q620,214 640,214 Z" fill="' + P.cloth + '"/>' +
        '<path d="M20,0 Q30,100 22,200 M48,0 Q62,90 52,190 M620,0 Q610,100 618,200 M592,0 Q578,90 588,190" stroke="#000000" stroke-width="3" opacity="0.12" fill="none"/>' +
        '<rect x="0" y="0" width="640" height="18" fill="' + P.cloth + '"/><rect x="0" y="18" width="640" height="5" fill="' + P.light + '" opacity="0.8"/>' +
        '<rect x="34" y="150" width="34" height="8" rx="4" fill="' + P.light + '" transform="rotate(-24 51 154)"/><rect x="572" y="150" width="34" height="8" rx="4" fill="' + P.light + '" transform="rotate(24 589 154)"/>';
    });

    /* ---------- đạo cụ cảnh (gốc = chân vật) */
    S('deco', 'pine', 'Cây tùng', function (C) {
      var P = C.P;
      return '<ellipse cx="0" cy="0" rx="40" ry="6" fill="#000000" opacity="0.1"/><rect x="-7" y="-46" width="14" height="46" fill="' + P.woodDark + '"/>' +
        '<path d="M-54,-40 L0,-100 L54,-40 Z" fill="' + P.leaf + '"/><path d="M-44,-80 L0,-136 L44,-80 Z" fill="' + P.leaf + '"/><path d="M-32,-116 L0,-166 L32,-116 Z" fill="' + P.leaf + '"/>' +
        '<path d="M0,-100 L54,-40 L20,-40 Z M0,-136 L44,-80 L16,-80 Z M0,-166 L32,-116 L12,-116 Z" fill="#000000" opacity="0.12"/>';
    });
    S('deco', 'bamboo', 'Khóm trúc', function (C) {
      var P = C.P;
      return '<ellipse cx="0" cy="0" rx="34" ry="5" fill="#000000" opacity="0.1"/>' + stalk(P, -14, 0, -180, 8, -6) + stalk(P, 4, 0, -200, 9, 4) + stalk(P, 18, 0, -150, 7, 10) +
        leafSpray(P, -18, -150, 0.9, -1) + leafSpray(P, 8, -176, 1, 1) + leafSpray(P, 26, -120, 0.8, 1) + leafSpray(P, -12, -96, 0.7, -1);
    });
    S('deco', 'rock', 'Tảng đá', function (C) {
      var P = C.P;
      return '<ellipse cx="0" cy="0" rx="48" ry="6" fill="#000000" opacity="0.1"/>' +
        '<path d="M-42,0 Q-46,-26 -20,-36 Q2,-48 26,-32 Q46,-20 40,0 Z" fill="' + P.stone + '"/>' +
        '<path d="M-24,-30 Q-4,-42 16,-32 Q0,-34 -14,-24 Z" fill="#ffffff" opacity="0.35"/>' +
        '<path d="M34,0 Q36,-14 50,-16 Q64,-14 64,0 Z" fill="' + P.stone + '"/><path d="M34,0 Q36,-14 50,-16 Q64,-14 64,0 Z" fill="#000000" opacity="0.1"/>';
    });
    S('deco', 'banner', 'Cờ trận', function (C) {
      var P = C.P;
      return '<ellipse cx="0" cy="0" rx="18" ry="4" fill="#000000" opacity="0.12"/><rect x="-3" y="-176" width="6" height="176" fill="' + P.woodDark + '"/>' +
        '<path d="M3,-170 L76,-164 Q66,-144 76,-124 Q66,-104 76,-86 L3,-92 Z" fill="' + P.cloth + '"/>' +
        '<path d="M3,-170 L76,-164 L76,-158 L3,-162 Z" fill="' + P.light + '"/>' +
        '<circle cx="38" cy="-127" r="15" fill="' + P.light + '"/><path d="M30,-134 H46 M38,-140 V-114 M30,-122 H46" stroke="' + P.cloth + '" stroke-width="3"/>' +
        '<circle cx="0" cy="-178" r="5" fill="' + P.light + '"/>';
    });
    S('deco', 'tea-table', 'Bàn trà', function (C) {
      var P = C.P;
      return '<ellipse cx="0" cy="0" rx="70" ry="7" fill="#000000" opacity="0.12"/>' +
        '<rect x="-54" y="-30" width="8" height="30" fill="' + P.woodDark + '"/><rect x="46" y="-30" width="8" height="30" fill="' + P.woodDark + '"/>' +
        '<rect x="-64" y="-38" width="128" height="10" rx="3" fill="' + P.wood + '"/><rect x="-64" y="-30" width="128" height="3" fill="#000000" opacity="0.15"/>' +
        '<path d="M-18,-38 Q-20,-58 0,-60 Q20,-58 18,-38 Z" fill="#e8e2d2"/><path d="M18,-50 Q30,-52 30,-60" stroke="#e8e2d2" stroke-width="4" fill="none"/>' +
        '<rect x="-4" y="-66" width="8" height="7" rx="2" fill="' + P.woodDark + '"/>' +
        '<path d="M-48,-38 h14 l-2,-9 h-10 Z M34,-38 h14 l-2,-9 h-10 Z" fill="#e8e2d2"/>';
    });
    S('deco', 'lantern', 'Đèn lồng', function (C) {
      var P = C.P;
      return '<ellipse cx="0" cy="0" rx="14" ry="3" fill="#000000" opacity="0.12"/><rect x="-3" y="-120" width="6" height="120" fill="' + P.woodDark + '"/>' +
        '<path d="M0,-118 H22 V-110" stroke="' + P.woodDark + '" stroke-width="3" fill="none"/>' +
        '<circle cx="22" cy="-90" r="28" fill="' + P.light + '" opacity="0.3"/>' +
        '<ellipse cx="22" cy="-90" rx="13" ry="16" fill="' + P.cloth + '"/><ellipse cx="22" cy="-90" rx="6" ry="13" fill="' + P.light + '" opacity="0.55"/>' +
        '<rect x="15" y="-108" width="14" height="4" fill="' + P.woodDark + '"/><rect x="15" y="-76" width="14" height="4" fill="' + P.woodDark + '"/>' +
        '<path d="M22,-72 V-62" stroke="' + P.light + '" stroke-width="2"/>';
    });
    S('deco', 'fence', 'Hàng rào', function (C) {
      var P = C.P, s = '<ellipse cx="0" cy="0" rx="74" ry="4" fill="#000000" opacity="0.08"/>';
      [-62, -21, 21, 62].forEach(function (x) { s += '<path d="M' + (x - 4) + ',0 V-44 L' + x + ',-50 L' + (x + 4) + ',-44 V0 Z" fill="' + P.wood + '"/>'; });
      return s + '<rect x="-70" y="-38" width="140" height="6" fill="' + P.woodDark + '"/><rect x="-70" y="-18" width="140" height="6" fill="' + P.woodDark + '"/>';
    });
    S('deco', 'weapon-rack', 'Giá binh khí', function (C) {
      var P = C.P, s = '<ellipse cx="0" cy="0" rx="52" ry="5" fill="#000000" opacity="0.1"/>';
      [-24, 0, 24].forEach(function (x, i) {
        s += '<path d="M' + x + ',-4 V-140" stroke="' + P.woodDark + '" stroke-width="4"/>' +
          '<path d="M' + (x - 6) + ',-140 L' + x + ',-162 L' + (x + 6) + ',-140 Z" fill="' + P.stone + '"/>' +
          '<path d="M' + (x - 4) + ',-138 q4,10 8,0" fill="' + P.cloth + '"/>';
        if (i === 1) s += '<path d="M' + (x + 6) + ',-150 q14,6 8,22" stroke="' + P.stone + '" stroke-width="5" fill="none"/>';
      });
      return s + '<rect x="-44" y="-62" width="88" height="7" fill="' + P.wood + '"/><rect x="-44" y="-12" width="88" height="7" fill="' + P.wood + '"/>' +
        '<rect x="-46" y="-70" width="7" height="70" fill="' + P.wood + '"/><rect x="39" y="-70" width="7" height="70" fill="' + P.wood + '"/>';
    });
    S('deco', 'campfire', 'Đống lửa', function (C) {
      var P = C.P;
      return '<ellipse cx="0" cy="-4" rx="62" ry="14" fill="' + P.light + '" opacity="0.28"/>' +
        '<g fill="' + P.stone + '"><ellipse cx="-26" cy="-2" rx="9" ry="5"/><ellipse cx="26" cy="-2" rx="9" ry="5"/><ellipse cx="0" cy="2" rx="10" ry="5"/></g>' +
        '<rect x="-28" y="-12" width="56" height="8" rx="4" fill="' + P.woodDark + '" transform="rotate(16 0 -8)"/><rect x="-28" y="-12" width="56" height="8" rx="4" fill="' + P.wood + '" transform="rotate(-16 0 -8)"/>' +
        '<path d="M-16,-12 Q-22,-34 -6,-48 Q-8,-34 2,-30 Q0,-52 12,-62 Q10,-40 20,-30 Q24,-18 16,-12 Z" fill="' + P.cloth + '"/>' +
        '<path d="M-8,-12 Q-10,-28 0,-36 Q2,-26 8,-24 Q12,-16 8,-12 Z" fill="' + P.light + '"/>';
    });
    S('deco', 'bush', 'Bụi cây', function (C) {
      var P = C.P;
      return '<ellipse cx="0" cy="0" rx="46" ry="5" fill="#000000" opacity="0.1"/>' +
        '<g fill="' + P.leaf + '"><circle cx="-22" cy="-18" r="20"/><circle cx="4" cy="-28" r="25"/><circle cx="28" cy="-16" r="18"/><rect x="-40" y="-18" width="84" height="18" rx="9"/></g>' +
        '<g fill="#ffffff" opacity="0.22"><circle cx="-4" cy="-40" r="8"/><circle cx="-28" cy="-26" r="6"/></g>' +
        '<g fill="' + P.flower + '"><circle cx="-10" cy="-24" r="3"/><circle cx="18" cy="-30" r="3"/><circle cx="30" cy="-12" r="3"/></g>';
    });

    /* ---------- cảnh phối sẵn: CHỈ là công thức (phông + vị trí + màu + giờ + thời tiết) */
    D.scene({ id: 'thao-lu', name: 'Thảo lư Long Trung', han: '隆中草廬', status: 'approved', time: 'day', weather: 'petals',
      description: 'Nhà tranh ẩn cư giữa núi và trúc — nơi Lưu Bị ba lần tìm Khổng Minh.',
      layers: { sky: 'open', far: 'mountains', mid: { part: 'thatched-hut', dx: 30 }, ground: 'grass', front: 'grass-tufts' },
      deco: [{ part: 'bamboo', x: 64, y: 286 }, { part: 'bamboo', x: 118, y: 276, scale: 0.8, flip: true }, { part: 'fence', x: 372, y: 290, scale: 0.8 }, { part: 'rock', x: 600, y: 316, z: 'mid', scale: 0.8 }] });
    D.scene({ id: 'doanh-trai', name: 'Doanh trại lúc chiều', han: '軍營', status: 'approved', time: 'dusk', weather: 'clear',
      description: 'Trại quân dưới núi, cờ bay, lửa trại — họp bàn quân sự, luyện binh.',
      layers: { sky: 'open', far: 'mountains', mid: { part: 'army-tent', dx: 20 }, ground: 'dirt' },
      deco: [{ part: 'banner', x: 70, y: 290 }, { part: 'banner', x: 380, y: 282, scale: 0.8 }, { part: 'weapon-rack', x: 200, y: 280, scale: 0.85 }, { part: 'campfire', x: 600, y: 330, z: 'mid', scale: 0.9 }] });
    D.scene({ id: 'duoi-thanh', name: 'Dưới chân thành', han: '城下', status: 'approved', time: 'day', weather: 'clear',
      description: 'Cổng thành lớn, đường đất dẫn vào — gọi hàng, đấu tướng, vào thành.',
      layers: { sky: 'open', far: 'city-wall', ground: 'dirt-road' },
      deco: [{ part: 'banner', x: 60, y: 300 }, { part: 'banner', x: 590, y: 300, flip: true }, { part: 'rock', x: 160, y: 296, scale: 0.6 }] });
    D.scene({ id: 'xich-bich', name: 'Bờ sông Xích Bích', han: '赤壁', status: 'approved', time: 'dawn', weather: 'mist',
      description: 'Sông rộng mờ sương sớm, thuyền xa — mượn tên, chờ gió Đông.',
      layers: { sky: 'open', far: 'river', ground: 'grass' },
      deco: [{ part: 'pine', x: 70, y: 292 }, { part: 'rock', x: 586, y: 300, scale: 1.1 }, { part: 'bush', x: 520, y: 290, scale: 0.7 }] });
    D.scene({ id: 'thu-phong', name: 'Thư phòng', han: '書房', status: 'approved', time: 'dusk', weather: 'clear',
      description: 'Phòng đọc sách lúc lên đèn — bàn mưu, đọc binh thư, uống trà.',
      layers: { sky: 'indoor-wall', ground: 'wood-floor', front: 'curtain' },
      deco: [{ part: 'tea-table', x: 320, y: 284, scale: 0.9 }, { part: 'lantern', x: 92, y: 290 }, { part: 'lantern', x: 548, y: 290, flip: true }] });
    D.scene({ id: 'rung-truc-dem', name: 'Rừng trúc đêm', han: '竹林夜', status: 'approved', time: 'night', weather: 'fireflies',
      description: 'Rừng trúc dưới trăng, đom đóm bay — gặp gỡ bí mật, kết nghĩa, mai phục.',
      layers: { sky: 'open', far: 'bamboo-far', ground: 'grass', front: 'bamboo-edge' },
      deco: [{ part: 'bamboo', x: 150, y: 280, scale: 0.9 }, { part: 'bamboo', x: 500, y: 278, flip: true }, { part: 'rock', x: 420, y: 296, scale: 0.6 }] });
    D.scene({ id: 'vuon-dao', name: 'Vườn đào', han: '桃園', status: 'approved', time: 'day', weather: 'petals',
      description: 'Đình nhỏ giữa vườn đào nở rộ — kết nghĩa, thề ước, yến tiệc.',
      layers: { sky: 'open', far: 'mountains', mid: { part: 'pavilion', dx: -20 }, ground: 'grass', front: 'grass-tufts' },
      palette: { leaf: '#6f9e5c', flower: '#f39ab3' },
      deco: [{ part: 'bush', x: 70, y: 292, scale: 1.2 }, { part: 'bush', x: 600, y: 300, scale: 1.1, flip: true }, { part: 'tea-table', x: 460, y: 286, scale: 0.7 }] });
    D.scene({ id: 'tuyet-son', name: 'Núi tuyết', han: '雪山', status: 'approved', time: 'day', weather: 'snow',
      description: 'Núi phủ tuyết, tùng xanh — hành quân mùa đông, tìm hiền giữa tuyết.',
      layers: { sky: 'plain', far: 'mountains', ground: 'grass', front: 'grass-tufts' },
      palette: { sky: '#d5e2ec', skyLow: '#f2f5f8', grass: '#eef2f6', hill: '#dce6ee', hillFar: '#c6d4e0', leaf: '#4f7f61' },
      deco: [{ part: 'pine', x: 90, y: 288 }, { part: 'pine', x: 150, y: 270, scale: 0.7 }, { part: 'pine', x: 570, y: 294, scale: 1.1, flip: true }] });
  });
})(window.GenChibi);
