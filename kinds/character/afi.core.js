/* gen-chibi — thư viện chính thức afi.core (loại asset: character)
 * © 2026 Afi Labs — All rights reserved. Mọi hình vẽ bằng code, không asset ngoài.
 * Quy ước: toạ độ theo tư thế nghỉ của RIG (khung 200 × 240); neo đọc từ C.A.
 * Nét: viền ngoài 2.6–3.2, chi tiết trong 1.4–2. Đổ bóng: đen 8–14 % (hợp mọi màu nền).
 */
(function (GC) {
  'use strict';
  var INK = GC.INK;

  function mir(s) { return '<g transform="translate(200 0) scale(-1 1)">' + s + '</g>'; }
  function both(s) { return s + mir(s); }
  function f(n) { return Math.round(n * 100) / 100; }
  function stroke(w) { return ' stroke="' + INK + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function shadow(d, o) { return '<path d="' + d + '" fill="#000" fill-opacity="' + (o || 0.1) + '"/>'; }
  function line(d, w, col, op) { return '<path d="' + d + '" fill="none" stroke="' + (col || INK) + '" stroke-width="' + (w || 1.6) + '"' + (op ? ' stroke-opacity="' + op + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>'; }
  function k() { var a = []; for (var i = 0; i < arguments.length; i += 2) a.push([arguments[i], arguments[i + 1]]); return a; }

  GC.helpers = { mir: mir, both: both, f: f, stroke: stroke, shadow: shadow, line: line, k: k };

  GC.pack({
    id: 'afi.core', name: 'Afi Core', owner: 'Afi Labs', group: 'official', visibility: 'public', version: '0.2.0',
    license: '© 2026 Afi Labs — All rights reserved', description: 'Khung chuẩn và linh kiện chung: dáng đầu, tóc, râu, trang phục, khuôn mặt, 18 biểu cảm, động tác, hiệu ứng.'
  }, function (D) {

    D.defaults({
      skin: '#f8d7bd', skinShade: '#e3b08e', hair: '#2a2320', iris: '#4a2f22', robe: '#e6e1d6', inner: '#f3efe6',
      trim: '#2b2b2b', accent: '#d4a63c', hat: '#2f3a52', armor: '#9aa5ae', metal: '#d5dbe0', boots: '#2b211d',
      blush: '#f39aa0', wood: '#7a5532', tassel: '#c8372d', cape: '#7c2d2a'
    });

    /* ---------------- SLOT ---------------- */
    [['head', 'Dáng đầu', 'round'], ['mask', 'Mặt nạ / màu mặt', 'none'], ['hair', 'Tóc', 'neat'],
     ['beard', 'Râu', 'none'], ['hat', 'Mũ / khăn', 'none'], ['outfit', 'Trang phục', 'robe'],
     ['back', 'Sau lưng', 'none'], ['shoes', 'Giày', 'boots'], ['heldL', 'Tay trái cầm', 'none'],
     ['heldR', 'Tay phải cầm', 'none']].forEach(function (s) { D.slot(s[0], { label: s[1], fallback: s[2] }); });

    function part(slot, id, label, draw, extra) {
      var p = { slot: slot, id: id, label: label, draw: draw, source: 'gen-chibi/kinds/character/afi.core.js' };
      for (var x in (extra || {})) p[x] = extra[x];
      D.part(p);
    }

    /* ---------------- ĐẦU (có bóng má phải + má hồng nhẹ) ---------------- */
    var HEADS = {
      round: { label: 'Tròn', ex: 50, d: 'M50,100 C50,68 72,54 100,54 C128,54 150,68 150,100 C150,130 128,147 100,147 C72,147 50,130 50,100 Z',
        sh: 'M150,100 C150,130 128,147 100,147 C122,140 141,124 144,100 Z' },
      square: { label: 'Hàm vuông', ex: 50, d: 'M50,96 C50,66 72,54 100,54 C128,54 150,66 150,96 L150,118 C150,138 130,149 100,149 C70,149 50,138 50,118 Z',
        sh: 'M150,100 L150,118 C150,138 130,149 100,149 C124,142 144,130 144,110 Z' },
      oval: { label: 'Trái xoan', ex: 54, d: 'M54,98 C54,68 74,54 100,54 C126,54 146,68 146,98 C146,124 128,145 100,149 C72,145 54,124 54,98 Z',
        sh: 'M146,98 C146,124 128,145 100,149 C120,138 138,122 140,98 Z' }
    };
    Object.keys(HEADS).forEach(function (id) {
      var h = HEADS[id];
      part('head', id, h.label, function (C) {
        var ear = '<ellipse cx="' + h.ex + '" cy="110" rx="8" ry="10" fill="' + C.P.skin + '"' + stroke(3) + '/>' +
          line('M' + (h.ex - 2) + ',105 q-3,5 1,10', 2, C.P.skinShade);
        return {
          ears: both(ear),
          head: '<path d="' + h.d + '" fill="' + C.P.skin + '"' + stroke(3.2) + '/>' +
            both('<ellipse cx="69" cy="126" rx="8" ry="4.5" fill="' + C.P.blush + '" fill-opacity=".28"/>'),
          shade: shadow(h.sh, 0.09) + line('M98,120 q2,2 4,0', 2.2, C.P.skinShade)
        };
      }, { shape: h.d });
    });

    part('mask', 'none', 'Không', function () { return null; });

    /* ---------------- TÓC ---------------- */
    var BANGS = 'M52,102 C50,70 70,55 100,55 C130,55 150,70 148,102 C142,90 134,82 124,80 C116,86 106,84 100,80 C94,84 84,86 76,80 C66,82 58,90 52,102 Z';
    var LOCK = 'M51,96 C46,114 48,128 55,138 C57,124 57,112 59,100 Z';
    function bangs(C) {
      return '<path d="' + BANGS + '" fill="' + C.P.hair + '"' + stroke(2.8) + '/>' +
        line('M66,70 C76,62 90,60 100,60', 3, '#fff', 0.22) + line('M86,72 q2,6 0,10 M114,72 q-2,6 0,10', 1.4, '#000', 0.25) +
        both('<path d="' + LOCK + '" fill="' + C.P.hair + '"' + stroke(2.4) + '/>');
    }
    var HAIR_P = { volume: { label: 'Độ phồng tóc', min: 0.9, max: 1.15, step: 0.01, def: 1, type: 'scale', pivot: [100, 104] } };
    part('hair', 'neat', 'Mái gọn', function (C) { return { hairFront: bangs(C) }; }, { params: HAIR_P });
    part('hair', 'long-back', 'Tóc dài sau lưng', function (C) {
      return {
        hairBack: '<path d="M50,94 C38,140 42,190 58,214 L142,214 C158,190 162,140 150,94 Z" fill="' + C.P.hair + '"' + stroke(2.8) + '/>' +
          line('M60,140 C58,170 62,196 68,210 M140,140 C142,170 138,196 132,210', 1.6, '#fff', 0.14),
        hairFront: bangs(C)
      };
    }, { params: { length: { label: 'Độ dài tóc', min: 0.75, max: 1.1, step: 0.01, def: 1, type: 'scaleY', pivot: [100, 94] } } });
    part('hair', 'topknot', 'Búi tó', function (C) {
      return {
        hairFront: '<circle cx="100" cy="44" r="12" fill="' + C.P.hair + '"' + stroke(2.8) + '/>' + line('M93,38 q7,-5 14,0', 2, '#fff', 0.22) + bangs(C) +
          '<rect x="90" y="50" width="20" height="6" rx="2" fill="' + C.P.accent + '"' + stroke(2) + '/>'
      };
    }, { params: HAIR_P });
    part('hair', 'spiky', 'Tóc dựng xù', function (C) {
      var d = 'M48,104 L38,78 L55,80 L50,56 L69,66 L72,38 L88,56 L100,30 L112,56 L128,38 L131,66 L150,56 L145,80 L162,78 L152,104 ' +
        'L141,86 L128,80 L118,88 L108,80 L100,88 L92,80 L82,88 L72,80 L59,86 Z';
      return { hairFront: '<path d="' + d + '" fill="' + C.P.hair + '"' + stroke(2.8) + '/>' + line('M72,50 L80,62 M100,40 L100,56 M128,50 L120,62', 2, '#fff', 0.18) };
    }, { params: { spike: { label: 'Độ dựng', min: 0.85, max: 1.25, step: 0.01, def: 1, type: 'scaleY', pivot: [100, 104] } } });

    /* ---------------- RÂU ---------------- */
    part('beard', 'none', 'Không', function () { return null; });
    part('beard', 'goatee', 'Râu dê nhỏ', function (C) {
      return {
        beard: '<path d="M95,141 C94,153 98,163 100,169 C102,163 106,153 105,141 Z" fill="' + C.P.hair + '"' + stroke(1.6) + '/>',
        mustache: line('M84,127 C89,122 95,122 100,125.5 C105,122 111,122 116,127', 2.4, C.P.hair) +
          line('M84,127 q-3,1 -4,4 M116,127 q3,1 4,4', 1.8, C.P.hair)
      };
    }, { params: { length: { label: 'Độ dài chòm', min: 0.7, max: 1.5, step: 0.05, def: 1, type: 'scaleY', pivot: [100, 141] } } });
    part('beard', 'long3', 'Râu dài ba chòm', function (C) {
      var side = '<path d="M70,120 C63,140 65,162 74,180 C77,162 79,140 79,124 Z" fill="' + C.P.hair + '"' + stroke(2.2) + '/>';
      return {
        beard: both(side) +
          '<path d="M76,128 C74,152 82,188 100,214 C118,188 126,152 124,128 C114,142 86,142 76,128 Z" fill="' + C.P.hair + '"' + stroke(2.6) + '/>' +
          line('M91,152 C93,172 96,192 100,207 M109,152 C107,172 104,192 100,207 M100,146 L100,200', 2, '#fff', 0.16),
        mustache: '<path d="M80,129 C87,119 96,120 100,125 C104,120 113,119 120,129 C112,127 106,128 100,130 C94,128 88,127 80,129 Z" fill="' + C.P.hair + '"' + stroke(2) + '/>'
      };
    }, { params: { length: { label: 'Độ dài râu', min: 0.7, max: 1.12, step: 0.01, def: 1, type: 'scaleY', pivot: [100, 128] } } });
    part('beard', 'tiger', 'Râu hổ dựng', function (C) {
      var d = 'M54,110 L45,122 L58,126 L49,140 L64,140 L59,155 L76,148 L75,165 L90,154 L96,171 L104,154 L110,171 L117,154 ' +
        'L125,165 L124,148 L141,155 L136,140 L151,140 L142,126 L155,122 L146,110 C140,130 124,143 100,143 C76,143 60,130 54,110 Z';
      return {
        beard: '<path d="' + d + '" fill="' + C.P.hair + '"' + stroke(2.4) + '/>' + line('M70,140 L66,150 M100,150 L100,162 M130,140 L134,150', 1.6, '#fff', 0.16),
        mustache: '<path d="M79,127 L85,117 L90,124 L95,116 L100,123 L105,116 L110,124 L115,117 L121,127 C112,124 88,124 79,127 Z" fill="' + C.P.hair + '"' + stroke(2) + '/>'
      };
    }, { params: { bristle: { label: 'Độ xù', min: 0.85, max: 1.25, step: 0.01, def: 1, type: 'scale', pivot: [100, 120] } } });
    part('beard', 'long-thin', 'Râu dài mảnh', function (C) {
      return {
        beard: '<path d="M94,141 C92,160 96,180 100,193 C104,180 108,160 106,141 Z" fill="' + C.P.hair + '"' + stroke(1.8) + '/>',
        mustache: both(line('M100,126 C94,121 86,123 79,137', 2.4, C.P.hair))
      };
    }, { params: { length: { label: 'Độ dài râu', min: 0.7, max: 1.4, step: 0.05, def: 1, type: 'scaleY', pivot: [100, 141] } } });

    /* ---------------- MŨ / KHĂN chung ---------------- */
    var HAT_P = { height: { label: 'Độ cao mũ', min: 0.8, max: 1.3, step: 0.01, def: 1, type: 'scaleY', pivot: [100, 80] } };
    part('hat', 'none', 'Không', function () { return null; });
    part('hat', 'warrior-band', 'Khăn buộc trán có nơ', function (C) {
      return {
        hat: '<path d="M49,82 C70,72 130,72 151,82 L151,93 C130,83 70,83 49,93 Z" fill="' + C.P.hat + '"' + stroke(2.6) + '/>' +
          line('M52,88 C72,79 128,79 148,88', 1.4, '#fff', 0.22) +
          '<path d="M152,86 C166,78 176,70 186,58 L180,82 C172,88 164,92 153,92 Z" fill="' + C.P.hat + '"' + stroke(2.4) + '/>' +
          '<path d="M152,90 C164,96 176,98 190,96 L178,108 C168,106 160,102 151,96 Z" fill="' + C.P.hat + '"' + stroke(2.4) + '/>' +
          '<circle cx="152" cy="88" r="6" fill="' + C.P.accent + '"' + stroke(2.2) + '/>'
      };
    });
    part('hat', 'soft-cap', 'Mũ vải mềm', function (C) {
      return {
        hat: '<path d="M57,79 C55,50 76,35 100,35 C124,35 145,50 143,79 C120,70 80,70 57,79 Z" fill="' + C.P.hat + '"' + stroke(2.8) + '/>' +
          shadow('M143,79 C145,56 128,40 112,37 C128,46 136,60 136,76 Z', 0.12) + line('M74,46 C84,40 96,38 104,38', 2.4, '#fff', 0.2) +
          '<path d="M57,79 C80,70 120,70 143,79 L143,86 C120,78 80,78 57,86 Z" fill="' + C.P.accent + '"' + stroke(2.4) + '/>' +
          '<circle cx="100" cy="35" r="7" fill="' + C.P.accent + '"' + stroke(2.4) + '/>'
      };
    }, { params: HAT_P });

    /* ---------------- TRANG PHỤC: thân + tay trên (armL) + tay dưới (foreL) ---------------- */
    var TORSO = 'M76,146 L124,146 L136,212 C120,219 80,219 64,212 Z';
    var TORSO_SH = 'M112,146 L124,146 L136,212 C130,215 124,216 118,217 Z';
    var UP = 'M69,151 C62,158 61,168 62,181 L86,181 C87,170 87,161 85,153 Z';
    var LOW = 'M62,174 C61,182 60,189 60,196 L86,198 C87,190 87,182 86,174 Z';
    var CUFF = 'M60,191 L86,193 L86,199 L60,197 Z';
    function sleeves(C, fill, cuff, padUp) {
      var up = '<path d="' + UP + '" fill="' + fill + '"' + stroke(2.8) + '/>' + shadow('M62,166 C61,172 62,178 62,181 L70,181 C68,176 67,170 68,164 Z', 0.1) + (padUp || '');
      var low = '<circle cx="74" cy="177" r="11.5" fill="' + fill + '"/>' + '<path d="' + LOW + '" fill="' + fill + '"' + stroke(2.8) + '/>' +
        line('M68,184 q4,3 10,2', 1.4, '#000', 0.22) + '<path d="' + CUFF + '" fill="' + cuff + '"' + stroke(2.2) + '/>';
      return { armL: up, foreL: low, armR: mir(up), foreR: mir(low) };
    }
    function res(a, b) { for (var x in b) a[x] = b[x]; return a; }
    GC.helpers.sleeves = sleeves; GC.helpers.TORSO = TORSO; GC.helpers.TORSO_SH = TORSO_SH; GC.helpers.res = res;
    var BODY_P = { width: { label: 'Độ rộng thân', min: 0.88, max: 1.18, step: 0.01, def: 1, type: 'scaleX', pivot: [100, 180] } };

    part('outfit', 'robe', 'Áo bào', function (C) {
      return res({
        body: '<path d="' + TORSO + '" fill="' + C.P.robe + '"' + stroke(3) + '/>' + shadow(TORSO_SH, 0.1) +
          '<path d="M86,146 L100,170 L114,146 Z" fill="' + C.P.inner + '"/>' +
          '<path d="M86,146 L100,170 L114,146" fill="none" stroke="' + C.P.trim + '" stroke-width="5" stroke-linejoin="round"/>' +
          line('M84,196 C86,204 85,210 82,214 M112,196 C114,204 116,210 118,214', 1.4, '#000', 0.22) +
          '<path d="M68,184 L132,184 L133,194 L67,194 Z" fill="' + C.P.trim + '"' + stroke(2.4) + '/>' +
          '<rect x="95" y="183" width="10" height="12" rx="2" fill="' + C.P.accent + '"' + stroke(1.8) + '/>' +
          '<path d="M65,206 C80,213 120,213 135,206 L136,212 C120,219 80,219 64,212 Z" fill="' + C.P.trim + '"/>'
      }, sleeves(C, C.P.robe, C.P.trim));
    }, { params: BODY_P });
    part('outfit', 'armor', 'Giáp trận', function (C) {
      var pad = '<path d="M61,154 C63,143 80,140 90,150 L86,166 C77,161 68,161 61,164 Z" fill="' + C.P.armor + '"' + stroke(2.4) + '/>' +
        line('M65,156 q8,-5 17,0 M64,161 q8,-5 17,0', 1.5, '#000', 0.24) + line('M66,150 q6,-4 12,-3', 2, '#fff', 0.3);
      var sc = '';
      for (var r = 0; r < 4; r++) for (var c = 0; c < 5; c++) {
        var x = 80 + c * 9 + (r % 2 ? 4.5 : 0), y = 156 + r * 7;
        if (x < 120) sc += 'M' + (x - 4) + ',' + y + ' q4,5 8,0 ';
      }
      return res({
        body: '<path d="' + TORSO + '" fill="' + C.P.robe + '"' + stroke(3) + '/>' + shadow(TORSO_SH, 0.1) +
          '<path d="M77,150 L123,150 L127,185 L73,185 Z" fill="' + C.P.armor + '"' + stroke(2.6) + '/>' +
          '<path d="' + sc + '" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.5"/>' +
          shadow('M110,150 L123,150 L127,185 L114,185 Z', 0.12) +
          '<circle cx="100" cy="165" r="7.5" fill="' + C.P.metal + '"' + stroke(2.2) + '/>' + '<circle cx="98" cy="163" r="2.2" fill="#fff" fill-opacity=".7"/>' +
          '<path d="M68,185 L132,185 L133,195 L67,195 Z" fill="' + C.P.trim + '"' + stroke(2.4) + '/>' +
          '<circle cx="100" cy="190" r="6" fill="' + C.P.accent + '"' + stroke(2) + '/>' +
          '<path d="M70,196 L98,196 L96,211 L66,209 Z M102,196 L130,196 L134,209 L104,211 Z" fill="' + C.P.armor + '"' + stroke(2.2) + '/>' +
          line('M70,203 L97,204 M103,204 L132,203', 1.4, '#000', 0.24)
      }, sleeves(C, C.P.robe, C.P.trim, pad));
    }, { params: BODY_P });

    part('back', 'none', 'Không', function () { return null; });
    part('back', 'cape', 'Áo choàng', function (C) {
      return { backItem: '<path d="M74,150 C58,170 52,200 50,222 L150,222 C148,200 142,170 126,150 Z" fill="' + C.P.cape + '"' + stroke(2.6) + '/>' + shadow('M126,150 C142,170 148,200 150,222 L134,222 C134,196 130,170 120,152 Z', 0.15) };
    });
    part('shoes', 'boots', 'Ủng', function (C) {
      return { legs: both('<ellipse cx="87" cy="221" rx="11" ry="6.5" fill="' + C.P.boots + '"' + stroke(2.4) + '/>' + '<path d="M80,218 q5,-3 10,-1" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.6" stroke-linecap="round"/>') };
    });

    part('heldL', 'none', 'Không', function () { return null; });
    part('heldR', 'none', 'Không', function () { return null; });
    part('heldR', 'sword', 'Kiếm', function (C) {
      return {
        heldR: '<g transform="rotate(24 128 193)">' +
          '<path d="M125,172 L131,172 L130,110 L128,101 L126,110 Z" fill="' + C.P.metal + '"' + stroke(2) + '/>' + line('M128,168 L128,112', 1.2, '#fff', 0.6) +
          '<rect x="119" y="171" width="18" height="5" rx="2" fill="' + C.P.accent + '"' + stroke(1.8) + '/>' +
          '<rect x="126" y="176" width="4" height="22" rx="1.5" fill="' + C.P.wood + '"' + stroke(1.6) + '/></g>'
      };
    }, { tall: true });

    /* ---------------- MẮT: KIỂU × DÁNG ---------------- */
    D.eyeStyle('round', { label: 'Tròn to', w: 9, h: 11 });
    D.eyeStyle('calm', { label: 'Hiền, khép hờ', w: 9, h: 9, lid: 0.32 });
    D.eyeStyle('bulge', { label: 'Mắt ốc', w: 11.5, h: 11.5, small: true });
    D.eyeStyle('phoenix', { label: 'Mắt phượng', w: 12, h: 6.5, slant: 14 });
    D.eyeStyle('narrow', { label: 'Mắt nheo xếch', w: 11, h: 5, slant: 16 });

    function rotS(S, side, x, y) { var a = (S.slant || 0) * (side < 0 ? 1 : -1); return a ? ' transform="rotate(' + a + ' ' + x + ' ' + y + ')"' : ''; }
    function lid(x, y, w, h, frac, C) {
      var ly = f(y - h + 2 * h * frac);
      return '<path d="M' + f(x - w - 2) + ',' + f(y - h - 3) + ' L' + f(x + w + 2) + ',' + f(y - h - 3) + ' L' + f(x + w + 2) + ',' + ly +
        ' L' + f(x - w - 2) + ',' + ly + ' Z" fill="' + C.P.eyeArea + '"/>' +
        '<path d="M' + f(x - w - 0.5) + ',' + ly + ' Q' + x + ',' + f(ly - 1.5) + ' ' + f(x + w + 0.5) + ',' + ly + '" fill="none"' + stroke(3.2) + '/>';
    }
    function openEye(S, side, x, y, C, o) {
      o = o || {};
      var w = S.w, h = S.h, rI = Math.min(w, h) * (o.irisK || 0.8);
      var cx = f(x + (o.dx || 0) * w), cy = f(y + h * 0.15 + (o.dy || 0) * h);
      var s = '<g' + rotS(S, side, x, y) + '><ellipse cx="' + x + '" cy="' + y + '" rx="' + w + '" ry="' + h + '" fill="#fff"' + stroke(2.4) + '/>';
      if (S.small || o.dot) {
        s += '<circle cx="' + cx + '" cy="' + f(cy - 1) + '" r="' + (o.dot ? 2 : 3.6) + '" fill="' + INK + '"/>' + (o.dot ? '' : '<circle cx="' + f(cx - 1.4) + '" cy="' + f(cy - 2.2) + '" r="1.2" fill="#fff"/>');
      } else {
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rI) + '" fill="' + C.P.iris + '"/>' +
          '<path d="M' + f(cx - rI) + ',' + cy + ' A' + f(rI) + ',' + f(rI) + ' 0 0 1 ' + f(cx + rI) + ',' + cy + ' Z" fill="#000" fill-opacity=".28"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rI * 0.5) + '" fill="#120d0b"/>' +
          '<circle cx="' + f(cx - rI * 0.35) + '" cy="' + f(cy - rI * 0.3) + '" r="' + f(rI * 0.34) + '" fill="#fff"/>' +
          '<circle cx="' + f(cx + rI * 0.35) + '" cy="' + f(cy + rI * 0.4) + '" r="' + f(rI * 0.14) + '" fill="#fff" fill-opacity=".85"/>';
      }
      var lf = o.lid !== undefined ? o.lid : S.lid;
      if (lf) s += lid(x, y, w, h, lf, C);
      else s += '<path d="M' + f(x - w - 0.8) + ',' + f(y - h * 0.15) + ' Q' + x + ',' + f(y - h - 2.6) + ' ' + f(x + w + 0.8) + ',' + f(y - h * 0.15) + '" fill="none"' + stroke(3.2) + '/>';
      return s + '</g>';
    }
    function big(S, kk) { return { w: Math.max(S.w, 9) * kk, h: Math.max(S.h, 9) * kk }; }
    GC.helpers.openEye = openEye;

    D.eyePose('normal', function (S, side, x, y, C) { return openEye(S, side, x, y, C); });
    D.eyePose('happy', function (S, side, x, y) {
      var w = Math.max(S.w, 8), h = Math.max(S.h, 7);
      return line('M' + f(x - w) + ',' + f(y + 3) + ' Q' + x + ',' + f(y - h * 1.5) + ' ' + f(x + w) + ',' + f(y + 3), 3.4);
    });
    D.eyePose('closed', function (S, side, x, y) { var w = Math.max(S.w, 8); return line('M' + f(x - w) + ',' + (y - 1) + ' Q' + x + ',' + f(y + 7) + ' ' + f(x + w) + ',' + (y - 1), 3.2); });
    D.eyePose('shut', function (S, side, x, y) {
      var w = Math.max(S.w, 9) * 0.75, h = Math.max(S.h, 9) * 0.65, s = side < 0 ? 1 : -1;
      return line('M' + f(x - s * w) + ',' + f(y - h) + ' L' + f(x + s * w) + ',' + y + ' L' + f(x - s * w) + ',' + f(y + h), 3.8);
    });
    D.eyePose('wide', function (S, side, x, y) {
      var b = big(S, 1.35);
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h * 1.08) + '" fill="#fff"' + stroke(3) + '/><circle cx="' + x + '" cy="' + y + '" r="2.6" fill="' + INK + '"/>';
    });
    D.eyePose('empty', function (S, side, x, y) {
      var b = big(S, 1.1);
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h) + '" fill="#fff"' + stroke(2.6) + '/>' +
        '<circle cx="' + f(x + side * 2) + '" cy="' + f(y + 2) + '" r="1.4" fill="' + INK + '"/>' + line('M' + f(x - b.w) + ',' + f(y - b.h * 0.2) + ' L' + f(x + b.w) + ',' + f(y - b.h * 0.2), 2.4);
    });
    D.eyePose('teary', function (S, side, x, y, C) {
      var b = big(S, 1.18), r = Math.min(b.w, b.h) * 0.86;
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h * 1.1) + '" fill="#fff"' + stroke(2.8) + '/>' +
        '<circle cx="' + x + '" cy="' + f(y + 1.5) + '" r="' + f(r) + '" fill="' + C.P.iris + '"/>' +
        '<circle cx="' + x + '" cy="' + f(y + 1.5) + '" r="' + f(r * 0.45) + '" fill="#120d0b"/>' +
        '<circle cx="' + f(x - r * 0.38) + '" cy="' + f(y - r * 0.35) + '" r="' + f(r * 0.4) + '" fill="#fff"/>' +
        '<circle cx="' + f(x + r * 0.38) + '" cy="' + f(y + r * 0.42) + '" r="' + f(r * 0.18) + '" fill="#fff"/>' +
        '<path class="chb-quiver" d="M' + f(x - b.w * 0.9) + ',' + f(y + b.h * 0.55) + ' q' + f(b.w * 0.45) + ',-3 ' + f(b.w * 0.9) + ',0 q' + f(b.w * 0.45) + ',3 ' + f(b.w * 0.9) + ',0" fill="none" stroke="#7cc4f2" stroke-width="2.4" stroke-linecap="round"/>';
    });
    D.eyePose('money', function (S, side, x, y) {
      var b = big(S, 1.15);
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h * 1.08) + '" fill="#fff"' + stroke(2.8) + '/>' +
        '<text class="chb-pulse" x="' + x + '" y="' + f(y + b.h * 0.62) + '" text-anchor="middle" font-size="' + f(b.h * 1.9) +
        '" font-weight="900" font-family="Arial Black, Arial, Helvetica, sans-serif" fill="#1f9a52" stroke="' + INK + '" stroke-width=".8">$</text>';
    });
    D.eyePose('angry', function (S, side, x, y, C) {
      var w = S.w, h = Math.max(S.h, 6), inner = side < 0;
      var hiIn = f(y - h * 0.05), hiOut = f(y - h * 0.8), top = f(y - h - 4);
      var lp = inner
        ? 'M' + f(x - w - 3) + ',' + top + ' L' + f(x + w + 3) + ',' + top + ' L' + f(x + w + 3) + ',' + hiIn + ' L' + f(x - w - 3) + ',' + hiOut + ' Z'
        : 'M' + f(x - w - 3) + ',' + top + ' L' + f(x + w + 3) + ',' + top + ' L' + f(x + w + 3) + ',' + hiOut + ' L' + f(x - w - 3) + ',' + hiIn + ' Z';
      var ln = inner ? 'M' + f(x - w - 1) + ',' + hiOut + ' L' + f(x + w + 1) + ',' + hiIn : 'M' + f(x - w - 1) + ',' + hiIn + ' L' + f(x + w + 1) + ',' + hiOut;
      return openEye(S, side, x, y, C, { irisK: 0.6, lid: 0 }) + '<path d="' + lp + '" fill="' + C.P.eyeArea + '"/>' + line(ln, 3.6);
    });
    D.eyePose('smug', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { lid: 0.52, dx: 0.35, dy: 0.1 }); });
    D.eyePose('half', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { lid: 0.6, dy: 0.15 }); });
    D.eyePose('focus', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { lid: 0.36, dy: 0.3, irisK: 0.7 }); });
    D.eyePose('lookSide', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { dx: -0.42, lid: 0.18 }); });
    D.eyePose('lookUp', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { dy: -0.5, dx: 0.25, lid: 0 }); });
    D.eyePose('fierce', function (S, side, x, y, C) {
      return GC.LIB.eyePoses.angry(S, side, x, y, C) +
        '<path class="chb-twinkle" d="M' + f(x + 4) + ',' + f(y - 6) + ' l1.6,3 3,1.6 -3,1.6 -1.6,3 -1.6,-3 -3,-1.6 3,-1.6 z" fill="#fff6c9" stroke="#c99a1a" stroke-width=".8"/>';
    });
    D.eyePose('spiral', function (S, side, x, y) {
      var b = big(S, 1);
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h) + '" fill="#fff"' + stroke(2.6) + '/>' +
        '<path d="M' + x + ',' + y + ' m-1,0 a1,1 0 1,1 2,0 a3,3 0 1,1 -6,0 a5,5 0 1,1 10,0 a7,7 0 1,1 -14,0" fill="none" stroke="' + INK + '" stroke-width="1.8"/>';
    });
    D.eyePose('star', function (S, side, x, y) {
      var R = Math.max(S.w, 9) * 1.2, r = R * 0.45, pts = [];
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; pts.push(f(x + Math.cos(a) * rr) + ',' + f(y + Math.sin(a) * rr)); }
      return '<polygon class="chb-pulse" points="' + pts.join(' ') + '" fill="#ffd23a"' + stroke(2.2) + '/>';
    });

    /* ---------------- LÔNG MÀY ---------------- */
    D.browStyle('thin', { label: 'Mảnh', w: 2.6, len: 13 });
    D.browStyle('normal', { label: 'Vừa', w: 3.8, len: 14 });
    D.browStyle('bushy', { label: 'Rậm', w: 6.5, len: 17 });
    D.browStyle('silkworm', { label: 'Mày tằm', w: 7.5, len: 18 });
    D.browPose('neutral', { label: 'Bình thường', rot: 0, dy: 0, arc: 2 });
    D.browPose('angry', { label: 'Giận', rot: 24, dy: 4, arc: -1 });
    D.browPose('sad', { label: 'Buồn', rot: -20, dy: -3, arc: 2 });
    D.browPose('raised', { label: 'Nhướng cao', rot: -4, dy: -11, arc: 4 });
    D.browPose('smug', { label: 'Đắc ý (lệch)', rot: -10, dy: -7, rotR: 10, dyR: 2 });
    D.browPose('determined', { label: 'Quyết tâm', rot: 15, dy: 2, arc: 0 });
    D.browPose('think', { label: 'Nhíu một bên', rot: -12, dy: -8, rotR: 8, dyR: 1 });
    D.browPose('worried', { label: 'Lo lắng', rot: -14, dy: -5, rotR: -4, dyR: -1 });

    /* ---------------- MIỆNG ---------------- */
    var DARK = '#6b1f2a', TONGUE = '#e8707a';
    function mp(d, fill, w) { return '<path d="' + d + '" fill="' + (fill || 'none') + '"' + stroke(w || 2.8) + '/>'; }
    D.mouth('smile', function () { return mp('M90,128 Q100,138 110,128'); });
    D.mouth('flat', function () { return mp('M92,132 L108,131'); });
    D.mouth('cat', function () { return mp('M89,128 q5.5,6 11,0 q5.5,6 11,0'); });
    D.mouth('oSmall', function () { return '<ellipse cx="101" cy="133" rx="4" ry="5" fill="' + DARK + '"' + stroke(2.4) + '/>'; });
    D.mouth('oBig', function () { return '<ellipse cx="100" cy="135" rx="9.5" ry="13" fill="' + DARK + '"' + stroke(2.8) + '/><path d="M93,143 Q100,137 107,143 Q104,148 100,148 Q96,148 93,143 Z" fill="' + TONGUE + '"/>'; });
    D.mouth('grin', function () {
      return mp('M83,125 Q100,128 117,121 Q113,141 98,141 Q85,139 83,125 Z', DARK) + '<path d="M85,126 Q100,129 116,122 L115,129 Q100,133 86,131 Z" fill="#fff"/>' +
        '<path d="M86,126 L87,131 M93,127 L93,132 M100,127 L100,132 M107,126 L107,131 M113,124 L113,129" stroke="' + INK + '" stroke-width="1"/>';
    });
    D.mouth('laugh', function () {
      return mp('M83,124 L117,124 Q117,147 100,147 Q83,147 83,124 Z', DARK) + '<path d="M89,140 Q100,131 111,140 Q105,147 100,147 Q95,147 89,140 Z" fill="' + TONGUE + '"/>' +
        '<path d="M85,125 L115,125 L114,130 L86,130 Z" fill="#fff"/>';
    });
    D.mouth('shout', function () {
      return mp('M81,121 L119,121 L113,151 Q100,158 87,151 Z', DARK) + '<path d="M89,146 Q100,138 111,146 Q106,154 100,154 Q94,154 89,146 Z" fill="' + TONGUE + '"/>' +
        '<path d="M83,122 L117,122 L116,127 L112,124 L108,128 L104,124 L100,128 L96,124 L92,128 L88,124 L84,127 Z" fill="#fff"/>';
    });
    D.mouth('wail', function () {
      return '<g class="chb-quiver">' + mp('M79,124 Q90,117 100,123 Q110,117 121,124 L114,152 Q100,160 86,152 Z', DARK) +
        '<path d="M90,148 Q100,140 110,148 Q105,156 100,156 Q95,156 90,148 Z" fill="' + TONGUE + '"/>' +
        '<path d="M82,124 Q90,119 100,124.5 Q110,119 118,124 L117,129 Q100,127 83,129 Z" fill="#fff"/><path d="M100,129 q-2,6 0,8 q2,-2 0,-8" fill="' + TONGUE + '"/></g>';
    });
    D.mouth('wavy', function () { return mp('M85,132 q3.75,-4.5 7.5,0 q3.75,4.5 7.5,0 q3.75,-4.5 7.5,0 q3.75,4.5 7.5,0'); });
    D.mouth('drool', function () {
      return mp('M85,125 Q100,127 115,125 Q113,143 100,143 Q87,143 85,125 Z', DARK) + '<path d="M90,137 Q100,131 110,137 Q105,143 100,143 Q95,143 90,137 Z" fill="' + TONGUE + '"/>' +
        '<path class="chb-drip" d="M112,135 C110,142 110,150 114,153 C118,150 117,142 114,135 Z" fill="#c4e8ff" stroke="#5aa9d6" stroke-width="1.6"/>';
    });
    D.mouth('bite', function () {
      return '<rect x="84" y="122" width="32" height="17" rx="6" fill="#fff"' + stroke(2.8) + '/><path d="M84,130.5 L116,130.5 M92,122 L92,139 M100,122 L100,139 M108,122 L108,139" stroke="' + INK + '" stroke-width="1.4"/>';
    });
    D.mouth('tongueOut', function () {
      return mp('M90,130 Q99,135 109,129') + '<path d="M104,132 C104,139 110,141 112,136 C113,133 110,131 108,131 Z" fill="' + TONGUE + '"' + stroke(2) + '/>';
    });

    /* ---------------- HIỆU ỨNG ---------------- */
    function fx(id, label, layer, draw) { D.fx(id, { label: label, layer: layer, draw: draw }); }
    fx('tears', 'Thác nước mắt', 'fxHead', function () {
      var s = '<path d="M71,118 C67,141 61,167 56,194 L71,194 C74,167 80,141 86,118 Z" fill="#8fd2ff" fill-opacity=".92" stroke="#3a8fc8" stroke-width="2"/>' +
        '<path class="chb-flow" d="M78,124 C75,146 70,168 64,190" fill="none" stroke="#fff" stroke-width="2.4" stroke-dasharray="6 6" stroke-linecap="round"/>' +
        '<g class="chb-bob"><circle cx="54" cy="200" r="3.4" fill="#8fd2ff" stroke="#3a8fc8" stroke-width="1.4"/><circle cx="72" cy="203" r="2.6" fill="#8fd2ff" stroke="#3a8fc8" stroke-width="1.4"/></g>';
      return { fxHead: both(s) };
    });
    function drop(x, y, s, cls, dl) {
      return '<g class="' + cls + '" style="animation-delay:' + (dl || 0) + 's"><path d="M' + x + ',' + y + ' C' + (x - 7 * s) + ',' + (y + 11 * s) + ' ' + (x - 8 * s) + ',' + (y + 18 * s) + ' ' + x + ',' + (y + 20 * s) +
        ' C' + (x + 8 * s) + ',' + (y + 18 * s) + ' ' + (x + 7 * s) + ',' + (y + 11 * s) + ' ' + x + ',' + y + ' Z" fill="#c9ecff" stroke="#3f97cc" stroke-width="2"/><circle cx="' + (x - 2 * s) + '" cy="' + (y + 14 * s) + '" r="' + (1.6 * s) + '" fill="#fff"/></g>';
    }
    fx('sweat', 'Giọt mồ hôi', 'fxHead', function () { return { fxHead: drop(150, 70, 1, 'chb-sweat') }; });
    fx('sweatMany', 'Mồ hôi tung toé', 'fxHead', function () { return { fxHead: drop(150, 66, 1, 'chb-sweat') + drop(46, 70, 0.8, 'chb-sweat', -0.5) + drop(160, 92, 0.7, 'chb-sweat', -0.9) + drop(38, 94, 0.6, 'chb-sweat', -1.2) }; });
    fx('vein', 'Gân giận', 'fxHead', function () {
      return { fxHead: '<g class="chb-pulse"><path d="M127,58 q8,4 7,11 M145,58 q-8,4 -7,11 M127,79 q8,-4 7,-11 M145,79 q-8,-4 -7,-11" fill="none" stroke="#e23a3a" stroke-width="3.6" stroke-linecap="round"/></g>' };
    });
    fx('blush', 'Đỏ mặt', 'cheeks', function (C) {
      return { cheeks: both('<ellipse cx="69" cy="124" rx="9" ry="5" fill="' + C.P.blush + '" fill-opacity=".75"/><path d="M64,121 l-3,6 M69,121 l-3,6 M74,121 l-3,6" stroke="#d65a6d" stroke-width="1.4" stroke-linecap="round"/>') };
    });
    fx('gloomLines', 'Mặt tái', 'fxHead', function () {
      var d = '';
      for (var x = 66; x <= 134; x += 8) d += 'M' + x + ',' + (60 + Math.abs(100 - x) * 0.2) + ' L' + x + ',92 ';
      return { fxHead: '<path d="' + d + '" stroke="#5a6fbf" stroke-opacity=".6" stroke-width="2.2" stroke-linecap="round"/>' };
    });
    fx('gloom', 'Mây đen mưa', 'fxFront', function () {
      return {
        fxFront: '<g class="chb-bob"><path d="M64,0 C60,-12 74,-18 82,-12 C86,-22 106,-24 112,-14 C120,-20 138,-14 136,-2 C144,0 144,10 134,12 L70,12 C58,12 56,2 64,0 Z" fill="#59606e"' + stroke(2.4) + '/></g>' +
          '<g class="chb-rain"><path d="M76,18 l-3,8 M92,20 l-3,8 M108,18 l-3,8 M124,20 l-3,8" stroke="#6fa8dc" stroke-width="2.4" stroke-linecap="round"/></g>'
      };
    });
    fx('coins', 'Tiền xu bay', 'fxFront', function () {
      var s = '';
      [[34, 118, 0], [166, 106, -0.3], [26, 168, -0.6], [174, 160, -0.15], [52, 66, -0.45], [150, 54, -0.75]].forEach(function (c) {
        s += '<g class="chb-coin" style="animation-delay:' + c[2] + 's"><circle cx="' + c[0] + '" cy="' + c[1] + '" r="8.5" fill="#ffd34d" stroke="#9a6a12" stroke-width="2.2"/>' +
          '<rect x="' + (c[0] - 2.7) + '" y="' + (c[1] - 2.7) + '" width="5.4" height="5.4" fill="#9a6a12"/></g>';
      });
      return { fxFront: s };
    });
    function spark(x, y, s, dl) {
      return '<path class="chb-twinkle" style="animation-delay:' + dl + 's" d="M' + x + ',' + (y - s) + ' Q' + f(x + s * 0.18) + ',' + f(y - s * 0.18) + ' ' + (x + s) + ',' + y +
        ' Q' + f(x + s * 0.18) + ',' + f(y + s * 0.18) + ' ' + x + ',' + (y + s) + ' Q' + f(x - s * 0.18) + ',' + f(y + s * 0.18) + ' ' + (x - s) + ',' + y +
        ' Q' + f(x - s * 0.18) + ',' + f(y - s * 0.18) + ' ' + x + ',' + (y - s) + ' Z" fill="#ffe27a" stroke="#c99a1a" stroke-width="1.2"/>';
    }
    fx('sparkles', 'Lấp lánh', 'fxFront', function () { return { fxFront: spark(40, 70, 9, 0) + spark(164, 84, 7, -0.4) + spark(32, 140, 6, -0.7) + spark(170, 30, 8, -0.2) }; });
    var FIRE = 'M40,226 C30,190 40,160 30,130 C48,146 50,120 46,96 C62,112 64,84 70,64 C78,86 84,70 92,48 C98,70 108,54 112,40 C118,64 126,58 134,48 C138,72 150,74 156,64 C156,92 164,104 172,100 C166,128 176,150 170,170 C178,190 172,210 162,226 Z';
    fx('fire', 'Lửa giận', 'fxBack', function () {
      return { fxBack: '<g class="chb-flicker"><path d="' + FIRE + '" fill="#ff6a2b" fill-opacity=".85"/><path d="' + FIRE + '" fill="#ffc23a" transform="translate(100 226) scale(.78 .8) translate(-100 -226)"/></g>' };
    });
    fx('aura', 'Hào quang', 'fxBack', function () {
      return { fxBack: '<g class="chb-flicker"><ellipse cx="100" cy="130" rx="86" ry="104" fill="#ffd96b" fill-opacity=".38"/><ellipse cx="100" cy="134" rx="66" ry="86" fill="#fff1b8" fill-opacity=".45"/></g>' };
    });
    fx('speed', 'Tia sốc', 'fxBack', function () {
      var d = '';
      for (var a = 0; a < 360; a += 20) { var r = a * Math.PI / 180; d += 'M' + f(100 + Math.cos(r) * 92) + ',' + f(124 + Math.sin(r) * 104) + ' L' + f(100 + Math.cos(r) * 116) + ',' + f(124 + Math.sin(r) * 128) + ' '; }
      return { fxBack: '<path class="chb-flash" d="' + d + '" stroke="' + INK + '" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round"/>' };
    });
    fx('steam', 'Bốc khói', 'fxHead', function () {
      var p = function (x, y, dl) { return '<g class="chb-puff" style="animation-delay:' + dl + 's"><circle cx="' + x + '" cy="' + y + '" r="7" fill="#f4f4f2"' + stroke(2) + '/></g>'; };
      return { fxHead: p(42, 84, 0) + p(36, 72, -0.45) + p(158, 84, -0.2) + p(164, 72, -0.65) };
    });
    function txt(cls, x, y, size, fill, t, dl) {
      return '<text class="' + cls + '"' + (dl ? ' style="animation-delay:' + dl + 's"' : '') + ' x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="900" font-family="Arial Black, Arial, Helvetica, sans-serif" fill="' + fill + '" stroke="' + INK + '" stroke-width="1.4">' + t + '</text>';
    }
    fx('zzz', 'Zzz', 'fxFront', function () { return { fxFront: txt('chb-zzz', 146, 44, 14, '#6f8fc9', 'z', 0) + txt('chb-zzz', 158, 28, 18, '#6f8fc9', 'z', -0.8) + txt('chb-zzz', 172, 10, 22, '#6f8fc9', 'z', -1.6) }; });
    fx('snot', 'Bong bóng mũi', 'fxHead', function () { return { fxHead: '<circle class="chb-bubble" cx="108" cy="121" r="7" fill="#d4f0ff" fill-opacity=".85" stroke="#5aa9d6" stroke-width="1.8"/>' }; });
    fx('gum', 'Thổi kẹo cao su', 'fxHead', function () { return { fxHead: '<circle class="chb-bubble" cx="112" cy="133" r="9" fill="#ff9ec7" fill-opacity=".9" stroke="#d14d8a" stroke-width="1.8"/><circle cx="109" cy="130" r="2" fill="#fff" fill-opacity=".8"/>' }; });
    fx('dots', 'Bong bóng suy nghĩ', 'fxFront', function () {
      return {
        fxFront: '<circle cx="142" cy="52" r="3" fill="#fff"' + stroke(1.8) + '/><circle cx="153" cy="40" r="5" fill="#fff"' + stroke(1.8) + '/>' +
          '<g class="chb-bob"><ellipse cx="175" cy="18" rx="22" ry="15" fill="#fff"' + stroke(2.2) + '/>' +
          '<circle cx="166" cy="18" r="2.4" fill="' + INK + '"/><circle cx="175" cy="18" r="2.4" fill="' + INK + '"/><circle cx="184" cy="18" r="2.4" fill="' + INK + '"/></g>'
      };
    });
    fx('exclaim', 'Chấm than', 'fxFront', function () { return { fxFront: txt('chb-pop', 164, 46, 34, '#e5604d', '!!') }; });
    fx('question', 'Dấu hỏi', 'fxFront', function () { return { fxFront: txt('chb-pop', 160, 46, 34, '#6fa8dc', '?') + txt('chb-pop', 34, 40, 22, '#6fa8dc', '?', -0.3) }; });
    fx('stars', 'Sao quay quanh đầu', 'fxHead', function () {
      return { fxHead: '<g class="chb-orbit">' + spark(60, 52, 7, 0) + spark(140, 52, 7, 0) + spark(100, 34, 6, 0) + '</g>' };
    });
    fx('bandage', 'Băng đầu + băng dán', 'fxHead', function () {
      return {
        fxHead: '<path d="M52,78 C72,66 128,66 148,78 L148,90 C128,78 72,78 52,90 Z" fill="#fbfbf7"' + stroke(2.2) + '/>' + line('M70,74 L72,84 M90,70 L91,80 M110,70 L109,80 M130,74 L128,84', 1.2, '#c9c4b8') +
          '<g transform="rotate(-20 130 124)"><rect x="120" y="119" width="20" height="9" rx="3" fill="#f2d4a6"' + stroke(1.6) + '/></g>' +
          '<g transform="rotate(25 130 124)"><rect x="120" y="119" width="20" height="9" rx="3" fill="#f2d4a6"' + stroke(1.6) + '/></g>'
      };
    });
    fx('crown', 'Vương miện #1', 'fxFront', function () {
      return { fxFront: '<g class="chb-bob"><path d="M76,22 L82,2 L92,14 L100,-4 L108,14 L118,2 L124,22 Z" fill="#ffd23a"' + stroke(2.4) + '/><circle cx="100" cy="10" r="3" fill="#e5604d"/>' + txt('', 92, 38, 16, '#ffd23a', '#1') + '</g>' };
    });
    fx('confetti', 'Pháo giấy', 'fxFront', function () {
      var s = '', cols = ['#e5604d', '#ffd23a', '#4cb782', '#6fa8dc', '#b97bd0'];
      for (var i = 0; i < 12; i++) {
        var x = 20 + (i * 37) % 170, y = 10 + (i * 23) % 70;
        s += '<rect class="chb-fall" style="animation-delay:' + (-i * 0.13).toFixed(2) + 's" x="' + x + '" y="' + y + '" width="6" height="10" rx="1" fill="' + cols[i % 5] + '"/>';
      }
      return { fxFront: s };
    });
    fx('soul', 'Hồn lìa khỏi xác', 'fxFront', function () {
      return { fxFront: '<g class="chb-rise"><path d="M100,128 C88,126 84,112 90,100 C94,90 108,88 112,98 C118,110 112,122 104,124 C110,128 106,136 100,128 Z" fill="#ffffff" fill-opacity=".9" stroke="#9fb6d9" stroke-width="2"/><circle cx="96" cy="104" r="1.6" fill="#5a6fbf"/><circle cx="104" cy="104" r="1.6" fill="#5a6fbf"/></g>' };
    });

    /* ---------------- ĐỘNG TÁC (keyframe trên khớp; có khuỷu tay) ---------------- */
    var BOB = { y: k(0, 0, 0.5, -1.2, 1, 0) };
    function M(id, label, dur, still, tracks, extra) {
      var d = { label: label, dur: dur, still: still, tracks: tracks };
      for (var x in (extra || {})) d[x] = extra[x];
      D.motion(id, d);
    }
    M('idle', 'Đứng thở', 2.8, 0.25, { body: BOB, head: { rot: k(0, 0, 0.25, -2.5, 0.75, 2.5, 1, 0) },
      armL: { rot: k(0, 3, 0.5, 7, 1, 3) }, foreL: { rot: k(0, -4, 0.5, -8, 1, -4) }, armR: { rot: k(0, -3, 0.5, -7, 1, -3) }, foreR: { rot: k(0, 4, 0.5, 8, 1, 4) } });
    M('fanWave', 'Phe phẩy quạt', 1.4, 0.25, { body: BOB, head: { rot: k(0, -2, 0.5, 2, 1, -2) },
      armL: { rot: k(0, 4, 1, 4) }, armR: { rot: k(0, -6, 0.5, 8, 1, -6) }, foreR: { rot: k(0, -10, 0.5, -20, 1, -10) }, handR: { rot: k(0, -8, 0.5, 30, 1, -8) } });
    M('strokeBeard', 'Vuốt râu', 1.8, 0.5, { body: BOB, head: { rot: k(0, 3, 0.5, 6, 1, 3) },
      armL: { rot: k(0, -152, 0.5, -124, 1, -152) }, armR: { rot: k(0, -4, 1, -4) } }, { hide: ['heldL'] });
    M('snicker', 'Che miệng cười khúc khích', 0.5, 0.25, { body: { y: k(0, 0, 0.5, -2.5, 1, 0), rot: k(0, -2, 0.5, 2, 1, -2) }, head: { rot: k(0, -4, 0.5, 4, 1, -4) },
      armL: { rot: k(0, -150, 0.5, -144, 1, -150) }, armR: { rot: k(0, 16, 0.5, 20, 1, 16) }, foreR: { rot: k(0, 50, 0.5, 58, 1, 50) } }, { hide: ['heldL', 'tallR'] });
    M('fanSmirk', 'Che miệng cười, tay kia phẩy quạt', 0.5, 0.25, { body: { y: k(0, 0, 0.5, -2.5, 1, 0), rot: k(0, -2, 0.5, 2, 1, -2) }, head: { rot: k(0, -4, 0.5, 4, 1, -4) },
      armL: { rot: k(0, -150, 0.5, -144, 1, -150) }, armR: { rot: k(0, -10, 0.5, 4, 1, -10) }, handR: { rot: k(0, -12, 0.5, 18, 1, -12) } }, { hide: ['heldL'] });
    M('sob', 'Gào khóc vung tay', 0.6, 0.5, { body: { y: k(0, 0, 0.5, 3, 1, 0), sy: k(0, 1, 0.5, 0.95, 1, 1) },
      head: { y: k(0, 2, 1, 2), rot: k(0, -4, 0.25, 4, 0.5, -4, 0.75, 4, 1, -4) },
      armL: { rot: k(0, 128, 0.5, 150, 1, 128) }, foreL: { rot: k(0, 20, 0.5, 40, 1, 20) }, armR: { rot: k(0, -128, 0.5, -150, 1, -128) }, foreR: { rot: k(0, -20, 0.5, -40, 1, -20) } });
    var STOMP = { rot: k(0, -3, 0.5, 3, 1, -3), y: k(0, 0, 0.25, -6, 0.5, 0, 0.75, -6, 1, 0) };
    M('stomp', 'Giậm chân vung nắm đấm', 0.42, 0.25, { root: { sx: k(0, 1.04, 1, 1.04), sy: k(0, 1.04, 1, 1.04) }, body: STOMP, head: { rot: k(0, 4, 0.5, -4, 1, 4) },
      armL: { rot: k(0, 120, 0.5, 140, 1, 120) }, foreL: { rot: k(0, 30, 0.5, 10, 1, 30) }, armR: { rot: k(0, -120, 0.5, -140, 1, -120) }, foreR: { rot: k(0, -30, 0.5, -10, 1, -30) } });
    M('spearShake', 'Vung binh khí', 0.42, 0.25, { root: { sx: k(0, 1.04, 1, 1.04), sy: k(0, 1.04, 1, 1.04) }, body: STOMP, head: { rot: k(0, 4, 0.5, -4, 1, 4) },
      armL: { rot: k(0, 120, 0.5, 140, 1, 120) }, foreL: { rot: k(0, 30, 0.5, 10, 1, 30) }, armR: { rot: k(0, -70, 0.5, -92, 1, -70) }, handR: { rot: k(0, 40, 0.5, 62, 1, 40) } });
    M('spearRaise', 'Giơ cao binh khí', 0.7, 0.25, { body: { y: k(0, 0, 0.5, -6, 1, 0) }, head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, -30, 1, -30) }, foreL: { rot: k(0, -60, 1, -60) }, armR: { rot: k(0, -150, 0.5, -165, 1, -150) }, handR: { rot: k(0, 140, 0.5, 155, 1, 140) } });
    M('jolt', 'Giật nảy người', 0.3, 0, { root: { y: k(0, -12, 0.5, -9, 1, -12) }, body: { sx: k(0, 0.94, 0.5, 0.97, 1, 0.94), sy: k(0, 1.07, 0.5, 1.04, 1, 1.07) },
      head: { y: k(0, -3, 1, -3), rot: k(0, -1.5, 0.5, 1.5, 1, -1.5) },
      armL: { rot: k(0, 110, 0.5, 118, 1, 110) }, foreL: { rot: k(0, 30, 1, 30) }, armR: { rot: k(0, -110, 0.5, -118, 1, -110) }, foreR: { rot: k(0, -30, 1, -30) } });
    M('rubHands', 'Xoa tay hám lợi', 0.38, 0.25, { body: { y: k(0, 0, 0.5, -3, 1, 0) }, head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, -22, 0.5, -30, 1, -22) }, foreL: { rot: k(0, -40, 0.5, -52, 1, -40) }, armR: { rot: k(0, 30, 0.5, 22, 1, 30) }, foreR: { rot: k(0, 52, 0.5, 40, 1, 52) } }, { hide: ['heldL', 'heldR'] });
    M('kowtow', 'Chắp tay vái lia lịa', 0.75, 0.5, { body: { y: k(0, 0, 0.5, 7, 1, 0), sy: k(0, 1, 0.5, 0.93, 1, 1) }, head: { y: k(0, 0, 0.5, 5, 1, 0), rot: k(0, -7, 0.5, -2, 1, -7) },
      armL: { rot: k(0, -60, 0.5, -70, 1, -60) }, foreL: { rot: k(0, -70, 0.5, -80, 1, -70) }, armR: { rot: k(0, 60, 0.5, 70, 1, 60) }, foreR: { rot: k(0, 70, 0.5, 80, 1, 70) } }, { hide: ['heldL', 'heldR'] });
    M('fistPump', 'Đấm tay lên trời', 0.65, 0.5, { body: { y: k(0, 0, 0.5, -6, 1, 0) }, head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, -30, 1, -30) }, foreL: { rot: k(0, -70, 1, -70) }, armR: { rot: k(0, -100, 0.5, -150, 1, -100) }, foreR: { rot: k(0, -60, 0.5, -20, 1, -60) } });
    M('chinHand', 'Chống cằm suy tư', 3.2, 0.25, { body: { rot: k(0, 1, 0.5, -1, 1, 1) }, head: { rot: k(0, 6, 0.5, 9, 1, 6) },
      armL: { rot: k(0, -150, 0.5, -146, 1, -150) }, armR: { rot: k(0, 20, 1, 20) }, foreR: { rot: k(0, 60, 1, 60) } }, { hide: ['heldL', 'tallR'] });
    M('chinHandFan', 'Chống cằm, quạt hờ', 3.2, 0.25, { body: { rot: k(0, 1, 0.5, -1, 1, 1) }, head: { rot: k(0, 6, 0.5, 9, 1, 6) },
      armL: { rot: k(0, -150, 0.5, -146, 1, -150) }, armR: { rot: k(0, -6, 0.5, 2, 1, -6) }, handR: { rot: k(0, -8, 0.5, 8, 1, -8) } }, { hide: ['heldL'] });
    M('doze', 'Gà gật', 3.6, 0.6, { body: { sy: k(0, 1, 0.5, 1.02, 1, 1) }, head: { rot: k(0, 0, 0.6, 13, 0.66, -2, 1, 0), y: k(0, 0, 0.6, 5, 0.66, 0, 1, 0) },
      armL: { rot: k(0, 9, 1, 9) }, armR: { rot: k(0, -9, 1, -9) } });
    M('shrug', 'Nhún vai', 1.2, 0.5, { body: { y: k(0, 0, 0.5, -3, 1, 0) }, head: { rot: k(0, -6, 0.5, 6, 1, -6) },
      armL: { rot: k(0, 34, 0.5, 44, 1, 34) }, foreL: { rot: k(0, 64, 0.5, 80, 1, 64) }, armR: { rot: k(0, -34, 0.5, -44, 1, -34) }, foreR: { rot: k(0, -64, 0.5, -80, 1, -64) } }, { hide: ['tallR'] });
    M('typing', 'Gõ phím lia lịa', 0.24, 0.5, { body: { y: k(0, 0, 0.5, -1, 1, 0) }, head: { rot: k(0, 3, 1, 3), y: k(0, 3, 1, 3) },
      armL: { rot: k(0, -14, 0.5, -20, 1, -14) }, foreL: { rot: k(0, -58, 0.5, -74, 1, -58) }, armR: { rot: k(0, 20, 0.5, 14, 1, 20) }, foreR: { rot: k(0, 74, 0.5, 58, 1, 74) } }, { hide: ['heldL', 'heldR'] });
    M('slouch', 'Nằm ườn tay gối đầu', 3, 0.25, { body: { rot: k(0, -5, 0.5, -6, 1, -5) }, head: { rot: k(0, -8, 0.5, -11, 1, -8) },
      armL: { rot: k(0, -20, 1, -20) }, foreL: { rot: k(0, -40, 1, -40) }, armR: { rot: k(0, -160, 1, -160) }, foreR: { rot: k(0, -60, 0.5, -70, 1, -60) } }, { hide: ['heldR'] });
    M('wobble', 'Loạng choạng', 1.4, 0.25, { body: { rot: k(0, -6, 0.5, 6, 1, -6) }, head: { rot: k(0, 8, 0.5, -8, 1, 8) },
      armL: { rot: k(0, 20, 0.5, -10, 1, 20) }, armR: { rot: k(0, 10, 0.5, -20, 1, 10) } });
    M('panicRun', 'Hoảng loạn chạy quanh', 0.36, 0.25, { root: { x: k(0, -8, 0.5, 8, 1, -8), y: k(0, 0, 0.25, -6, 0.5, 0, 0.75, -6, 1, 0) }, body: { rot: k(0, -5, 0.5, 5, 1, -5) },
      head: { rot: k(0, 6, 0.5, -6, 1, 6) },
      armL: { rot: k(0, 130, 0.5, 170, 1, 130) }, foreL: { rot: k(0, 40, 0.5, 0, 1, 40) }, armR: { rot: k(0, -170, 0.5, -130, 1, -170) }, foreR: { rot: k(0, 0, 0.5, -40, 1, 0) } });
    M('limp', 'Rã rời vì thương', 2.4, 0.4, { body: { sy: k(0, 0.95, 0.5, 0.93, 1, 0.95), rot: k(0, 3, 1, 3) }, head: { rot: k(0, 8, 0.5, 11, 1, 8), y: k(0, 4, 1, 4) },
      armL: { rot: k(0, -24, 1, -24) }, foreL: { rot: k(0, -64, 1, -64) }, armR: { rot: k(0, -4, 1, -4) } });
    M('victory', 'Giơ hai tay chiến thắng', 0.6, 0.5, { root: { y: k(0, 0, 0.5, -8, 1, 0) }, body: { sy: k(0, 0.97, 0.5, 1.04, 1, 0.97) }, head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, 150, 0.5, 162, 1, 150) }, foreL: { rot: k(0, 10, 1, 10) }, armR: { rot: k(0, -150, 0.5, -162, 1, -150) }, foreR: { rot: k(0, -10, 1, -10) } });
    M('deflate', 'Xẹp lép kiệt sức', 3, 0.5, { body: { sy: k(0, 0.9, 0.5, 0.88, 1, 0.9), sx: k(0, 1.04, 1, 1.04) }, head: { y: k(0, 7, 0.5, 8, 1, 7), rot: k(0, -4, 0.5, -6, 1, -4) },
      armL: { rot: k(0, 6, 1, 6) }, armR: { rot: k(0, -6, 1, -6) } });

    /* ---------------- 18 TRẠNG THÁI = mắt + mày + miệng + hiệu ứng + động tác ---------------- */
    function S(id, label, hint, eyes, brows, mouth, fxs, motion) { D.state(id, { label: label, hint: hint, eyes: eyes, brows: brows, mouth: mouth, fx: fxs, motion: motion }); }
    S('normal', 'Bình thường', 'rảnh hoặc làm việc êm', 'normal', 'neutral', 'smile', [], 'idle');
    S('work', 'Đang làm', 'đang tập trung làm việc', 'focus', 'determined', 'tongueOut', ['sweat'], 'typing');
    S('think', 'Suy tư ông cụ non', 'đang nghĩ, phân vân', 'lookUp', 'think', 'flat', ['dots'], 'chinHand');
    S('unsure', 'Nói không chắc', 'trả lời mà không chắc chắn', 'lookSide', 'worried', 'wavy', ['sweat', 'question'], 'shrug');
    S('smug', 'Cười đê tiện', 'thắng kèo, mưu vừa thành, khoái chí', 'smug', 'smug', 'grin', ['blush', 'sparkles'], 'snicker');
    S('greedy', 'Tham tiền', 'nhận thưởng, thấy tiền', 'money', 'raised', 'drool', ['coins', 'blush'], 'rubHands');
    S('proud', 'Lên #1', 'đứng đầu bảng, chiến thắng', 'happy', 'raised', 'laugh', ['crown', 'confetti'], 'victory');
    S('vow', 'Hứa quyết tâm', 'nhận việc lớn, thề chạy deadline', 'fierce', 'determined', 'shout', ['aura', 'sparkles'], 'fistPump');
    S('beg', 'Van xin năn nỉ', 'chờ duyệt, xin thêm quota, xin tha', 'teary', 'sad', 'wavy', ['sweat', 'sparkles'], 'kowtow');
    S('shock', 'Kinh ngạc', 'tin sét đánh, kết quả bất ngờ', 'wide', 'raised', 'oBig', ['speed', 'sweat', 'gloomLines', 'exclaim'], 'jolt');
    S('panic', 'Hoảng loạn', 'sự cố, đổi công cụ gấp', 'wide', 'raised', 'shout', ['sweatMany', 'speed', 'exclaim'], 'panicRun');
    S('rage', 'Nổi trận lôi đình', 'bị chơi xấu, bị cướp công', 'angry', 'angry', 'shout', ['vein', 'fire', 'steam'], 'stomp');
    S('dizzy', 'Choáng váng (lỗi)', 'gặp lỗi, đầu óc quay cuồng', 'spiral', 'sad', 'wavy', ['stars', 'sweat'], 'wobble');
    S('cry', 'Khóc thê thảm', 'bị phạt, thua lỗ, mất đồ', 'shut', 'sad', 'wail', ['tears', 'gloom'], 'sob');
    S('injured', 'Nghỉ dưỡng thương', 'kiệt quỹ, đang hồi phục', 'half', 'sad', 'wavy', ['bandage', 'gloomLines'], 'limp');
    S('exhausted', 'Hết quota', 'cạn sức, hồn lìa khỏi xác', 'empty', 'sad', 'oSmall', ['soul', 'gloomLines'], 'deflate');
    S('lazy', 'Rảnh rỗi lười', 'không có việc, nằm ườn', 'half', 'neutral', 'cat', ['gum'], 'slouch');
    S('sleep', 'Ngủ say', 'ngoài giờ, không có việc', 'closed', 'neutral', 'oSmall', ['zzz', 'snot'], 'doze');

    /* ---------------- TRAIT: hành vi đi theo BỘ PHẬN ---------------- */
    D.trait({ id: 'beard-long', label: 'Râu dài → vuốt râu', if: { beard: ['long3', 'long-thin'] }, over: { normal: { motion: 'strokeBeard' }, think: { motion: 'strokeBeard' } } });
    D.trait({ id: 'bulge-eyes', label: 'Mắt ốc → hét to hơn', if: { eyes: ['bulge'] }, over: { rage: { fxAdd: ['exclaim'] }, vow: { fxAdd: ['exclaim'] } } });

    /* ---------------- HỒ SƠ ÁNH XẠ cho ứng dụng dùng asset ---------------- */
    D.profile('gen-agents', {
      label: 'Gen-Agents (16 trạng thái Role)',
      map: [
        ['Lỗi', 'dizzy'], ['Đổi CLI', 'panic'], ['Bị phạt', 'cry'], ['Hết quota', 'exhausted'], ['Nghỉ dưỡng thương', 'injured'],
        ['Chờ duyệt', 'beg'], ['Kinh ngạc', 'shock'], ['Lên #1', 'proud'], ['Nhận thưởng', 'greedy'], ['Hứa quyết tâm', 'vow'],
        ['Nói không chắc', 'unsure'], ['Suy tư', 'think'], ['Đang làm', 'work'], ['Rảnh', 'lazy'], ['Ngủ', 'sleep'], ['Bình thường', 'normal']
      ]
    });
  });
})(window.GenChibi);
