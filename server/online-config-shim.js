// gen-chibi — SHIM TẠM của online-config (v0.21 P3). © 2026 Gen Labs — All rights reserved.
// P1 viết bản thật ở server/online-config.js (nguồn duy nhất data/online.json, OAuth đọc publicUrl lúc chạy, Host được phép, máy kế thừa).
// Khi gộp: main.js đổi require('./online-config-shim') → bản của P1 rồi xoá tệp này. online.js chỉ cần đúng các hàm dưới đây:
//   get()            → { mode, domain, publicUrl, clientIpHeader, flow, … } (publicUrl = giá trị ĐANG DÙNG: tạm nếu có, không thì chính thức)
//   set(patch)       ghi nông các khoá (mode, domain, clientIpHeader, flow) — nguyên tử
//   setPending(url)  bật publicUrl TẠM (giữ giá trị chính thức để trả về); '' = tắt tạm
//   commit()         tạm → chính thức
//   revert()         bỏ tạm, về giá trị chính thức cũ
'use strict';
const fs = require('fs');
const path = require('path');

function createOnlineConfig({ dataDir }) {
  const file = path.join(dataDir, 'online.json');
  const read = () => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } };
  const write = v => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(v, null, 2), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); };
  function get() {
    const j = read();
    return Object.assign({ mode: 'off', domain: '', publicUrl: '', clientIpHeader: '', flow: null }, j, { publicUrl: j.pendingUrl !== undefined ? j.pendingUrl : (j.publicUrl || '') });
  }
  function set(patch) { write(Object.assign(read(), patch)); }
  function setPending(url) { const j = read(); j.pendingUrl = String(url || ''); write(j); }
  function commit() { const j = read(); if (j.pendingUrl !== undefined) { j.publicUrl = j.pendingUrl; delete j.pendingUrl; } write(j); }
  function revert() { const j = read(); delete j.pendingUrl; write(j); }
  return { file, get, set, setPending, commit, revert };
}

module.exports = { createOnlineConfig };
