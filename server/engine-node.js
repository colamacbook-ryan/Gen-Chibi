// gen-chibi — nạp engine + thư viện (viết cho trình duyệt) vào Node để server dùng chung
// schema, validator và prompt đạo diễn. Lõi không đụng DOM nên chạy được trong vm.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { readLocales } = require('./i18n');

function loadEngine(appDir) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  ['engine/core.js', 'engine/i18n.js', 'engine/voices.js', 'engine/sounds.js', 'engine/choreo.js', 'kinds/character/gen.core.js', 'kinds/khung/gen.khung.js', 'kinds/character/gen.choreo.js', 'engine/player.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(appDir, f), 'utf8'), ctx, { filename: f });
  });
  const GC = ctx.window.GenChibi;
  // i18n trong vm (ADR 0007): nạp đủ bảng; ngôn ngữ chung của vm giữ 'vi' (= msgid) để câu engine trả cho server không đổi so với trước —
  // server dịch theo NGƯỜI GỌI ở rìa (server/i18n.js: langOf + tr), hoặc đặt GC.i18n.setLang(lang) quanh một lời gọi đồng bộ.
  const all = readLocales(appDir);
  Object.keys(all).forEach(l => GC.i18n.add(l, all[l]));
  GC.i18n.setLang('vi');
  return GC;
}

module.exports = { loadEngine };
