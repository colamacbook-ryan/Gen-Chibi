/* gen-chibi — thư viện item chính thức afi.items (loại asset: item trang bị)
 * © 2026 Afi Labs — All rights reserved.
 * Item = phối: trỏ tới linh kiện có sẵn + bảng màu riêng + chỉ số + độ hiếm. Không vẽ thêm.
 * Cùng một linh kiện cho nhiều phẩm cấp (đao sắt thường ↔ Thanh Long đao huyền thoại).
 */
(function (GC) {
  'use strict';
  GC.pack({
    id: 'afi.items', name: 'Trang bị Tam Quốc', owner: 'Afi Labs', group: 'official', visibility: 'public', version: '0.1.0',
    license: '© 2026 Afi Labs — All rights reserved', description: 'Item trang bị phối từ linh kiện chính thức: vũ khí, pháp khí, mũ, giáp, áo choàng, giày.'
  }, function (D) {
    var I = function (def) { D.item(def); };
    // vũ khí — một linh kiện, nhiều phẩm cấp
    I({ id: 'dao-sat', name: 'Đao sắt', type: 'weapon', rarity: 'common', equip: { part: 'afi.tamquoc/guandao', palette: { metal: '#a7adb3', wood: '#6b4a2e', tassel: '#77706a' } },
      stats: { atk: 32, spd: 18 }, description: 'Đao rèn thô của lính trơn.' });
    I({ id: 'thanh-long-dao', name: 'Thanh Long Yển Nguyệt Đao', han: '青龍偃月刀', type: 'weapon', rarity: 'legendary',
      equip: { part: 'afi.tamquoc/guandao', palette: { metal: '#e6eef3', wood: '#24573c', tassel: '#c8372d' } },
      stats: { atk: 98, def: 20, spd: 35, luk: 40 }, description: 'Đao tám mươi hai cân của Quan Vũ.', lore: 'Theo Tam Quốc diễn nghĩa: đao nặng tám mươi hai cân, theo Quan Vũ từ Đào Viên tới Mạch Thành.' });
    I({ id: 'xa-mau', name: 'Trượng Bát Xà Mâu', han: '丈八蛇矛', type: 'weapon', rarity: 'epic', equip: { part: 'afi.tamquoc/serpent-spear', palette: { metal: '#dfe6ea', wood: '#3b2a20', tassel: '#2b2b2b' } },
      stats: { atk: 90, spd: 45, hp: 30 }, description: 'Mâu dài trượng tám, lưỡi uốn như rắn.' });
    I({ id: 'thuong-go', name: 'Thương gỗ luyện tập', type: 'weapon', rarity: 'common', equip: { part: 'afi.tamquoc/serpent-spear', palette: { metal: '#c9b48a', wood: '#a07a4a', tassel: '#d8cfc0' } },
      stats: { atk: 12, spd: 30 }, description: 'Mũi bọc gỗ, dùng cho tân binh.' });
    I({ id: 'kiem-sat', name: 'Kiếm sắt', type: 'weapon', rarity: 'uncommon', equip: { part: 'afi.core/sword' }, stats: { atk: 40, spd: 40 }, description: 'Kiếm thẳng hai lưỡi.' });
    I({ id: 'quat-long-vu', name: 'Quạt lông vũ', han: '羽扇', type: 'talisman', rarity: 'legendary', equip: { slot: 'heldR', part: 'afi.tamquoc/feather-fan' },
      stats: { int: 99, spd: 20, luk: 60 }, description: 'Phe phẩy là tính xong cục diện.' });
    I({ id: 'bau-ruou', name: 'Bầu rượu', type: 'offhand', rarity: 'uncommon', equip: { part: 'afi.tamquoc/wine-gourd' }, stats: { hp: 25, luk: 15 }, description: 'Uống một ngụm, gan to bằng trời.' });
    // mũ, giáp, áo choàng, giày
    I({ id: 'khan-cuon', name: 'Khăn cuốn', han: '綸巾', type: 'helmet', rarity: 'rare', equip: { part: 'afi.tamquoc/lun-jin' }, stats: { int: 30, def: 5 }, description: 'Khăn của bậc mưu sĩ.' });
    I({ id: 'khan-chien', name: 'Khăn chiến đỏ', type: 'helmet', rarity: 'common', equip: { part: 'afi.core/warrior-band', palette: { hat: '#b8322a', accent: '#e0b44c' } }, stats: { atk: 5, def: 6 }, description: 'Buộc trán trước trận.' });
    I({ id: 'giap-dong', name: 'Giáp đồng', type: 'armor', rarity: 'rare', equip: { part: 'afi.core/armor', palette: { armor: '#c98b3c', robe: '#5a4636', trim: '#3a2c22', metal: '#e8d7a8' } }, stats: { def: 60, hp: 40, spd: 5 }, description: 'Vảy đồng đan dày.' });
    I({ id: 'giap-bac', name: 'Giáp bạc Thường Sơn', type: 'armor', rarity: 'epic', equip: { part: 'afi.core/armor', palette: { armor: '#d9e2e8', robe: '#f4f4f0', trim: '#7d8b96', metal: '#ffffff', accent: '#5a8fc8' } }, stats: { def: 80, hp: 50, spd: 20 }, description: 'Bạch bào ngân giáp, sáng loá trận tiền.' });
    I({ id: 'ao-choang-do', name: 'Áo choàng đỏ', type: 'cloak', rarity: 'uncommon', equip: { part: 'afi.core/cape', palette: { cape: '#a8322b' } }, stats: { def: 12, luk: 10 }, description: 'Phần phật sau lưng khi xông trận.' });
    I({ id: 'ung-da', name: 'Ủng da', type: 'boots', rarity: 'common', equip: { part: 'afi.core/boots', palette: { boots: '#5a3d2a' } }, stats: { spd: 15 }, description: 'Đi đường xa không mỏi.' });
  });
})(window.GenChibi);
