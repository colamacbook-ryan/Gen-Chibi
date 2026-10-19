// gen-chibi — nạp engine + thư viện (viết cho trình duyệt) vào Node để server dùng chung
// schema, validator và prompt đạo diễn. Lõi không đụng DOM nên chạy được trong vm.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngine(appDir) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  ['engine/core.js', 'engine/voices.js', 'engine/choreo.js', 'kinds/character/gen.core.js', 'kinds/khung/gen.khung.js', 'kinds/character/gen.choreo.js', 'engine/player.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(appDir, f), 'utf8'), ctx, { filename: f });
  });
  return ctx.window.GenChibi;
}

module.exports = { loadEngine };
