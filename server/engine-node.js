// gen-chibi — nạp engine + thư viện (viết cho trình duyệt) vào Node để server dùng chung
// schema, validator và prompt đạo diễn. Lõi không đụng DOM nên chạy được trong vm.
// © 2026 Afi Labs — All rights reserved.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngine(appDir) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  ['engine/core.js', 'kinds/character/afi.core.js', 'kinds/character/afi.tamquoc.js', 'kinds/item/afi.items.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(appDir, f), 'utf8'), ctx, { filename: f });
  });
  return ctx.window.GenChibi;
}

module.exports = { loadEngine };
