/* gen-chibi — thư viện chính thức afi.tamquoc: linh kiện đặc trưng Tam Quốc + dàn tướng
 * © 2026 Afi Labs — All rights reserved.
 * Dựng trên afi.core. Nguồn nhận diện: Second-Brain/01-projects/gen-agents/research/2026-10-16-tam-quoc-nhan-dien.md
 */
(function (GC) {
  'use strict';
  var H = GC.helpers, INK = GC.INK;
  var mir = H.mir, both = H.both, stroke = H.stroke, shadow = H.shadow, line = H.line;

  GC.pack({
    id: 'afi.tamquoc', name: 'Tam Quốc chibi', owner: 'Afi Labs', group: 'official', visibility: 'public', version: '0.2.0',
    license: '© 2026 Afi Labs — All rights reserved',
    description: 'Mặt nạ kinh kịch, khăn cuốn, áo hạc sưởng, binh khí đặc trưng và dàn tướng Tam Quốc theo hồ sơ nhận diện.'
  }, function (D) {
    function part(slot, id, label, draw, extra) {
      var p = { slot: slot, id: id, label: label, draw: draw, source: 'gen-chibi/kinds/character/afi.tamquoc.js' };
      for (var x in (extra || {})) p[x] = extra[x];
      D.part(p);
    }

    /* ---------------- mặt nạ kinh kịch: khối màu mặt là dấu nhận diện số 1 ở 32 px ---------------- */
    part('mask', 'opera-black', 'Mặt đen kinh kịch', function (C) {
      var patch = '<path d="M60,104 C58,86 72,80 85,85 C96,89 97,100 95,111 C93,121 82,125 72,121 C64,118 61,112 60,104 Z" fill="#ffffff"/>';
      return { mask: '<path d="' + C.shape + '" fill="#3b3a47"' + stroke(3.2) + '/>' + both(patch) +
        '<path d="M91,68 Q100,58 109,68 Q100,80 91,68 Z" fill="#ffffff"/><path d="M100,112 l-4,8 h8 z" fill="#ffffff" opacity=".9"/>' };
    }, { eyeArea: '#ffffff' });
    part('mask', 'opera-red', 'Mặt đỏ kinh kịch', function (C) {
      return { mask: '<path d="' + C.shape + '" fill="#cf4a35"' + stroke(3.2) + '/>' +
        both('<path d="M58,118 C62,134 74,142 88,145" fill="none" stroke="#a63426" stroke-width="5" stroke-linecap="round" opacity=".55"/>') +
        '<circle cx="113" cy="118" r="1.6" fill="' + INK + '"/>' };
    }, { eyeArea: '#cf4a35' });
    part('mask', 'opera-white', 'Mặt trắng kinh kịch', function (C) {
      return { mask: '<path d="' + C.shape + '" fill="#f8f5ef"' + stroke(3.2) + '/>' +
        both('<path d="M67,102 L55,90" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/><path d="M88,121 q-4,6 0,12" fill="none" stroke="' + INK + '" stroke-width="1.6" stroke-linecap="round"/>') +
        '<path d="M96,76 L95,88 M104,76 L105,88" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/>' };
    }, { eyeArea: '#f8f5ef' });

    /* ---------------- khăn cuốn 綸巾 (chuẩn vàng Gia Cát Lượng) ---------------- */
    part('hat', 'lun-jin', 'Khăn cuốn (綸巾)', function (C) {
      var ribbon = '<path d="M74,70 C56,84 50,110 40,140 C44,141 47,141 50,139 C54,128 56,118 60,110 C58,122 56,132 55,142 L62,141 C64,118 70,94 82,78 Z" fill="' + C.P.hat + '"' + stroke(2.2) + '/>' +
        line('M70,84 C62,100 56,118 50,136', 1.2, '#fff', 0.2);
      return {
        hairBack: both(ribbon),
        hat: '<path d="M66,72 C63,50 74,30 100,27 C126,30 137,50 134,72 Z" fill="' + C.P.hat + '"' + stroke(2.8) + '/>' +
          shadow('M134,72 C137,52 128,36 112,30 C124,40 128,54 127,70 Z', 0.16) +
          line('M82,70 C80,54 86,40 100,32 M118,70 C120,54 114,40 100,32 M100,32 L100,68', 1.4, '#fff', 0.24) +
          line('M74,42 C82,34 92,31 100,30', 2.6, '#fff', 0.22) +
          '<path d="M59,65 C80,57 120,57 141,65 L141,78 C120,70 80,70 59,78 Z" fill="' + C.P.hat + '"' + stroke(2.6) + '/>' +
          line('M62,71 C82,64 118,64 138,71', 1.2, '#000', 0.3) +
          '<rect x="94" y="59" width="12" height="12" rx="3" fill="' + C.P.accent + '"' + stroke(1.8) + '/><circle cx="100" cy="65" r="2.4" fill="#7ad0a5"/>'
      };
    }, { params: { height: { label: 'Độ cao khăn', min: 0.85, max: 1.25, step: 0.01, def: 1, type: 'scaleY', pivot: [100, 74] } },
      views: { q45: function (C) {
        // 45°: các đường may hội tụ lệch trái, ngọc đính dịch theo mặt và hẹp lại, hai dải khăn cùng rủ phía gáy (phải)
        var ribbon = '<path d="M126,70 C144,84 150,110 160,140 C156,141 153,141 150,139 C146,128 144,118 140,110 C142,122 144,132 145,142 L138,141 C136,118 130,94 118,78 Z" fill="' + C.P.hat + '"' + stroke(2.2) + '/>' +
          line('M130,84 C138,100 144,118 150,136', 1.2, '#fff', 0.2);
        return {
          hairBack: ribbon + '<g transform="translate(-9 3)">' + ribbon + '</g>',
          hat: '<path d="M64,72 C61,50 72,30 96,27 C124,29 139,48 137,72 Z" fill="' + C.P.hat + '"' + stroke(2.8) + '/>' +
            shadow('M137,72 C139,52 130,36 112,29 C126,40 131,54 130,70 Z', 0.18) +
            line('M74,70 C72,54 78,40 92,31 M108,70 C112,54 108,40 94,30 M93,30 L88,68', 1.4, '#fff', 0.24) +
            line('M70,42 C78,34 86,30 94,29', 2.6, '#fff', 0.22) +
            '<path d="M57,64 C78,56 120,56 142,65 L142,78 C120,70 78,70 57,77 Z" fill="' + C.P.hat + '"' + stroke(2.6) + '/>' +
            line('M60,70 C80,63 118,63 139,71', 1.2, '#000', 0.3) +
            '<rect x="75" y="59" width="9" height="12" rx="2.5" fill="' + C.P.accent + '"' + stroke(1.8) + '/><ellipse cx="79.5" cy="65" rx="1.8" ry="2.4" fill="#7ad0a5"/>'
        };
      } } });
    part('hat', 'official-cap', 'Mũ quan (miện)', function (C) {
      return { hat: '<path d="M64,72 L68,33 L132,33 L136,72 C120,66 80,66 64,72 Z" fill="' + C.P.hat + '"' + stroke(2.8) + '/>' + shadow('M120,33 L132,33 L136,72 C130,70 126,69 122,69 Z', 0.18) +
        '<rect x="60" y="24" width="80" height="10" rx="2" fill="' + C.P.hat + '"' + stroke(2.6) + '/>' +
        '<path d="M42,52 L158,52" stroke="' + C.P.accent + '" stroke-width="3.4" stroke-linecap="round"/>' +
        '<path d="M100,40 L107,50 L100,60 L93,50 Z" fill="' + C.P.accent + '"' + stroke(2) + '/>' };
    }, { params: { height: { label: 'Độ cao mũ', min: 0.85, max: 1.25, step: 0.01, def: 1, type: 'scaleY', pivot: [100, 72] } } });

    /* ---------------- áo hạc sưởng 鶴氅: trắng viền đen, tay áo rộng ---------------- */
    part('outfit', 'crane-robe', 'Áo hạc sưởng', function (C) {
      var up = '<path d="M66,150 C56,158 54,170 55,183 L89,183 C89,171 89,161 86,152 Z" fill="' + C.P.robe + '"' + stroke(2.8) + '/>' +
        shadow('M55,168 C54,175 55,180 55,183 L64,183 C62,178 61,172 62,165 Z', 0.08);
      var low = '<circle cx="74" cy="178" r="15" fill="' + C.P.robe + '"/>' +
        '<path d="M55,176 C53,186 53,194 54,202 L90,202 C90,193 90,184 89,176 Z" fill="' + C.P.robe + '"' + stroke(2.8) + '/>' +
        line('M60,186 q6,-4 12,0 M70,192 q6,-4 12,0', 1.4, '#b9b5aa') +
        '<path d="M54,195 L90,195 L90,202 L54,202 Z" fill="' + C.P.trim + '"' + stroke(2) + '/>';
      return {
        body: '<path d="' + H.TORSO_UP + '" fill="' + C.P.robe + '"' + stroke(3) + '/>' + shadow(H.TORSO_UP_SH, 0.08) +
          '<path d="M90,146 L100,166 L110,146 Z" fill="' + C.P.inner + '"/>' +
          '<path d="M84,146 L100,176 L116,146 L109,146 L100,162 L91,146 Z" fill="' + C.P.trim + '"/>' +
          '<path d="M67.6,186 L132.4,186 L133.5,194 L66.5,194 Z" fill="' + C.P.trim + '"' + stroke(2) + '/>' + '<circle cx="100" cy="190" r="3.6" fill="' + C.P.accent + '"' + stroke(1.4) + '/>',
        hem: '<path d="' + H.HEM + '" fill="' + C.P.robe + '"' + stroke(3) + '/>' + shadow(H.HEM_SH, 0.08) +
          line('M100,194 L100,212', 1.4, '#000', 0.18) +
          '<path d="M64,207 C80,214 120,214 136,207 L136,212 C120,219 80,219 64,212 Z" fill="' + C.P.trim + '"/>' +
          line('M74,200 q4,-4 8,0 M84,203 q4,-4 8,0 M108,203 q4,-4 8,0 M118,200 q4,-4 8,0', 1.4, '#9d9a90'),
        armL: up, foreL: low, armR: mir(up), foreR: mir(low)
      };
    }, { params: { width: { label: 'Độ rộng thân', min: 0.88, max: 1.18, step: 0.01, def: 1, type: 'scaleX', pivot: [100, 180] } },
      views: { q45: function (C) {
        // 45°: vạt cổ chéo và đường giữa áo lệch trái theo hướng quay; phía gáy (phải) đổ bóng; tay áo dùng lại bản chính diện
        var fr = GC.getPart('outfit', 'afi.tamquoc/crane-robe').draw(C);   // tay áo: dùng lại bản chính diện
        return {
          body: '<path d="' + H.TORSO_UP + '" fill="' + C.P.robe + '"' + stroke(3) + '/>' + shadow('M108,146 L124,146 L132.7,194 L112,194 Z', 0.1) +
            '<path d="M80,146 L88,166 L96,146 Z" fill="' + C.P.inner + '"/>' +
            '<path d="M73,146 L88,176 L104,146 L97,146 L88,162 L80,146 Z" fill="' + C.P.trim + '"/>' +
            '<path d="M67.6,186 L132.4,186 L133.5,194 L66.5,194 Z" fill="' + C.P.trim + '"' + stroke(2) + '/>' + '<ellipse cx="88" cy="190" rx="3" ry="3.6" fill="' + C.P.accent + '"' + stroke(1.4) + '/>',
          hem: '<path d="' + H.HEM + '" fill="' + C.P.robe + '"' + stroke(3) + '/>' + shadow('M110,188 L131.6,188 L136,212 C130,215 124,216 116,217 Z', 0.1) +
            line('M88,194 L86,213', 1.4, '#000', 0.18) +
            '<path d="M64,207 C80,214 120,214 136,207 L136,212 C120,219 80,219 64,212 Z" fill="' + C.P.trim + '"/>' +
            line('M66,200 q4,-4 8,0 M76,203 q4,-4 8,0 M98,203 q4,-4 8,0 M110,200 q4,-4 8,0', 1.4, '#9d9a90'),
          armL: fr.armL, foreL: fr.foreL, armR: fr.armR, foreR: fr.foreR
        };
      } } });

    /* ---------------- đồ cầm tay ---------------- */
    part('heldL', 'wine-gourd', 'Bầu rượu', function (C) {
      return { heldL: '<path d="M72,184 C64,184 63,192 67,197 C58,201 58,215 72,217 C86,215 86,201 77,197 C81,192 80,184 72,184 Z" fill="#d9a441"' + stroke(2.2) + '/>' +
        shadow('M77,197 C86,201 86,215 72,217 C80,212 81,203 75,199 Z', 0.15) +
        '<rect x="69" y="179" width="6" height="6" rx="1.5" fill="' + C.P.wood + '"' + stroke(1.6) + '/><path d="M66,197 L78,197" stroke="' + C.P.tassel + '" stroke-width="2.4"/>' };
    });
    // quạt lông vũ 羽扇: từng chiếc lông, cán vàng, tua đỏ
    part('heldR', 'feather-fan', 'Quạt lông vũ (羽扇)', function (C) {
      var fs = '', angs = [-52, -34, -17, 0, 17, 34, 52];
      angs.forEach(function (a, i) {
        var len = 66 - Math.abs(a) * 0.35;
        fs += '<g transform="rotate(' + a + ' 130 164)"><path d="M130,164 C121,150 119,' + (164 - len * 0.6) + ' 130,' + (164 - len) + ' C141,' + (164 - len * 0.6) + ' 139,150 130,164 Z" fill="' + (i % 2 ? '#f4f2ea' : '#ffffff') + '"' + stroke(2) + '/>' +
          line('M130,162 L130,' + (166 - len), 1.2, '#b9b6ae') +
          '<path d="M130,' + (164 - len * 0.45) + ' C124,' + (164 - len * 0.6) + ' 123,' + (164 - len * 0.82) + ' 130,' + (164 - len) + ' C137,' + (164 - len * 0.82) + ' 136,' + (164 - len * 0.6) + ' 130,' + (164 - len * 0.45) + ' Z" fill="#e7e3d8" fill-opacity=".7"/></g>';
      });
      return {
        heldR: '<g transform="rotate(24 128 193)">' +
          '<path d="M126,186 L134,186 L132,212 Q130,216 128,212 Z" fill="' + C.P.tassel + '"' + stroke(1.6) + '/>' +
          '<rect x="126" y="160" width="8" height="30" rx="3" fill="' + C.P.accent + '"' + stroke(2) + '/>' + line('M127,170 L133,170 M127,178 L133,178', 1.2, '#7a5a12') +
          fs + '<ellipse cx="130" cy="163" rx="9" ry="5" fill="' + C.P.accent + '"' + stroke(2) + '/></g>'
      };
    }, { tall: true });
    part('heldR', 'serpent-spear', 'Xà mâu (丈八蛇矛)', function (C) {
      return { heldR: '<g transform="rotate(13 128 193)"><rect x="125.5" y="34" width="5" height="200" rx="2" fill="' + C.P.wood + '"' + stroke(2) + '/>' +
        '<path d="M124,38 C119,28 132,24 126,14 C121,6 127,0 130,-10 C137,1 132,8 134,16 C139,26 130,30 132,38 Z" fill="' + C.P.metal + '"' + stroke(2.2) + '/>' +
        line('M128,34 C124,26 131,20 128,12', 1.2, '#fff', 0.7) +
        '<path d="M121,40 L135,40 L139,57 L117,57 Z" fill="' + C.P.tassel + '"' + stroke(2) + '/></g>' };
    }, { tall: true });
    part('heldR', 'guandao', 'Thanh Long Yển Nguyệt Đao', function (C) {
      return { heldR: '<g transform="rotate(13 128 193)"><rect x="125.5" y="46" width="5" height="188" rx="2" fill="' + C.P.wood + '"' + stroke(2) + '/>' +
        '<path d="M130,48 C152,46 168,28 166,0 C158,16 146,26 130,26 Z" fill="' + C.P.metal + '"' + stroke(2.4) + '/>' + line('M134,42 C150,38 160,24 162,8', 1.4, '#fff', 0.7) +
        '<path d="M130,48 L130,26 C125,31 124,41 130,48 Z" fill="#2f7a4f"' + stroke(1.8) + '/>' +
        '<path d="M126,30 L117,21 L126,41 Z" fill="' + C.P.metal + '"' + stroke(1.8) + '/>' +
        '<path d="M121,50 L135,50 L139,66 L117,66 Z" fill="' + C.P.tassel + '"' + stroke(2) + '/></g>' };
    }, { tall: true });

    /* ---------------- trait đặc trưng gói ---------------- */
    D.trait({ id: 'feather-fan', label: 'Cầm quạt → phe phẩy, che miệng cười', if: { heldR: ['feather-fan'] }, over: { normal: { motion: 'fanWave' }, smug: { motion: 'fanSmirk' }, think: { motion: 'chinHandFan' } } });
    D.trait({ id: 'polearm', label: 'Binh khí dài → vung / giơ cao', if: { heldR: ['serpent-spear', 'guandao'] }, over: { rage: { motion: 'spearShake' }, vow: { motion: 'spearRaise' } } });

    /* ---------------- dàn tướng ---------------- */
    D.asset({
      id: 'gia-cat-luong', code: 'CH-0001', name: 'Gia Cát Lượng', han: '諸葛亮', faction: 'Thục', role: 'Mưu sĩ', version: 3, status: 'review',
      persona: 'quân sư bình thản bí hiểm, cười mỉm sau quạt, gặp nguy vẫn làm như không',
      look: {
        eyes: 'calm', brows: 'thin',
        parts: { head: 'oval', mask: 'none', hair: 'long-back', beard: 'goatee', hat: 'lun-jin', outfit: 'crane-robe', shoes: 'boots', heldR: 'feather-fan' },
        params: { eyes: { size: 1.05 }, beard: { length: 1.15 } },
        palette: { skin: '#f9dcc6', hair: '#2a2420', robe: '#f8f6f0', inner: '#d9dde6', trim: '#26262b', hat: '#3a4660', accent: '#d9b04c', iris: '#4a3226' }
      },
      expressions: {
        shock: { fxRemove: ['speed'] },
        rage: { mouth: 'bite', fxRemove: ['fire'] }
      },
      lines: { normal: ['Vạn sự đã nằm trong tính toán.'], smug: ['Ta đã tính trước cả rồi.'], shock: ['Cái gì?! Nhai Đình mất rồi ư?!'] },
      identity: { p1: 'Quạt lông vũ + khăn cuốn', must: ['heldR:feather-fan', 'hat:lun-jin', 'outfit:crane-robe'], source: 'TQDN-038, TQDN-093, TQDN-095', confusable: ['Chu Du (không cho Chu Du quạt)'] }
    });
    D.asset({
      id: 'quan-vu', code: 'CH-0002', name: 'Quan Vũ', han: '關羽', faction: 'Thục', role: 'Võ tướng', version: 2, status: 'draft',
      persona: 'kiêu hãnh, trọng nghĩa, hay vuốt râu tự đắc, bị chê râu là phồng mặt',
      look: {
        eyes: 'phoenix', brows: 'silkworm',
        parts: { head: 'square', mask: 'opera-red', hair: 'topknot', beard: 'long3', hat: 'soft-cap', outfit: 'armor', shoes: 'boots', heldR: 'guandao' },
        params: {},
        palette: { skin: '#f3cfb3', hair: '#1e1a19', robe: '#2f7a4f', armor: '#d4a73c', trim: '#1f4d33', hat: '#2f7a4f', accent: '#d4a73c', iris: '#3a2a20' }
      },
      expressions: { cry: { motion: 'strokeBeard' } },
      lines: { smug: ['Râu ta hôm nay mượt lắm.'] },
      identity: { p1: 'Mặt đỏ + râu dài', must: ['mask:opera-red', 'beard:long3', 'eyes:phoenix', 'heldR:guandao'], source: 'TQDN-001, TQDN-025, TQDN-083', confusable: ['Ngụy Diên (mặt đỏ, không râu dài)'] }
    });
    D.asset({
      id: 'truong-phi', code: 'CH-0003', name: 'Trương Phi', han: '張飛', faction: 'Thục', role: 'Võ tướng', version: 2, status: 'draft',
      persona: 'nóng nảy, hét to như sấm, mê rượu, thẳng như ruột ngựa',
      look: {
        eyes: 'bulge', brows: 'bushy',
        parts: { head: 'round', mask: 'opera-black', hair: 'spiky', beard: 'tiger', hat: 'warrior-band', outfit: 'armor', shoes: 'boots', heldR: 'serpent-spear', heldL: 'wine-gourd' },
        params: { mouth: { size: 1.1 } },
        palette: { skin: '#e9b996', hair: '#141217', robe: '#283550', armor: '#6d7b8c', trim: '#1a2238', hat: '#2a2a33', accent: '#c8372d' }
      },
      expressions: {}, lines: {},
      identity: { p1: 'Mặt đen + râu hổ', must: ['mask:opera-black', 'beard:tiger', 'eyes:bulge', 'heldR:serpent-spear'], source: 'TQDN-001, TQDN-042', confusable: ['Bàng Thống (da ngăm, mũ văn sinh)'] }
    });
    D.asset({
      id: 'tao-thao', code: 'CH-0004', name: 'Tào Tháo', han: '曹操', faction: 'Ngụy', role: 'Chủ công', version: 2, status: 'draft',
      persona: 'đa nghi, gian hùng, cười nham hiểm, ngủ cũng ôm kiếm',
      look: {
        eyes: 'narrow', brows: 'thin',
        parts: { head: 'oval', mask: 'opera-white', hair: 'topknot', beard: 'long-thin', hat: 'official-cap', outfit: 'robe', shoes: 'boots', heldR: 'sword' },
        params: {},
        palette: { skin: '#f4d2b8', hair: '#1b1919', robe: '#24242b', inner: '#8f2f2a', trim: '#c9a23f', hat: '#18181d', accent: '#d6ad45', iris: '#2a1f18' }
      },
      expressions: { sleep: { eyes: 'half', fxAdd: ['sweat'] } },
      lines: {},
      identity: { p1: 'Mặt trắng kịch + mắt nheo', must: ['mask:opera-white', 'eyes:narrow', 'beard:long-thin'], source: 'TQDN-001, TQDN-041', confusable: ['Tư Mã Ý, Đổng Trác (chỉ Tào Tháo mặt trắng kịch)'] }
    });
    D.asset({
      id: 'linh-que', code: 'CH-0005', name: 'Lính quèn', han: '小兵', faction: 'Vô danh', role: 'Lính', version: 1, status: 'draft',
      persona: 'nhát gan, tham ăn, luôn bị sai vặt, mơ được thưởng',
      look: {
        eyes: 'round', brows: 'normal',
        parts: { head: 'round', mask: 'none', hair: 'topknot', beard: 'none', hat: 'warrior-band', outfit: 'armor', shoes: 'boots', heldR: 'serpent-spear' },
        params: {},
        palette: { skin: '#f6d2b4', hair: '#3a2c22', robe: '#8a6a45', armor: '#a39478', trim: '#5a4630', hat: '#b33a2e', accent: '#e0b04a', tassel: '#b33a2e' }
      },
      expressions: {}, lines: {},
      identity: { p1: 'Khăn đỏ + giáp vải', must: ['hat:warrior-band', 'mask:none'], source: 'research §4.5 #32 (lính quèn)' },
      note: 'Ghép 100% từ linh kiện có sẵn: 0 linh kiện mới.'
    });
  });
})(window.GenChibi);
