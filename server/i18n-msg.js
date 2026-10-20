// gen-chibi — câu trả lời của server theo ngôn ngữ (ADR 0007), phần dùng chung cho mcp / voice / oauth / ai / updater…
// © 2026 Gen Labs — All rights reserved.
//
// Quy ước (gettext, msgid = tiếng Việt):
//   - Câu cho NGƯỜI DÙNG (Studio, trình duyệt) vẫn sinh bằng tiếng Việt như trước. Câu ghép động viết thành MẪU: tr(VI, 'Không có tác phẩm {id}', { id })
//     — tr(VI, …) chỉ điền biến (ra đúng câu cũ) và cho công cụ quét thấy msgid; bảng locales/en/server-msg.json giữ bản dịch của mẫu.
//   - Dịch ở RÌA: label(lang, câu) = khớp nguyên văn → khớp ngược MẪU (engine/i18n-msg.js) → giữ nguyên.
//     main.js dịch { error, errors[] } khi trả JSON; MCP dịch câu lỗi sang tiếng Anh cho agent (en(câu)).
//   - Câu CHỈ agent đọc (mô tả tool MCP, gợi ý, kết quả tool) viết thẳng tiếng Anh trong mã (CNS-067) — không qua bảng.
// Ngôn ngữ của yêu cầu đang chạy (nhãn khu của dock, nhãn nhà cung cấp, nhãn giọng, tên phân cảnh mặc định… tự đúng ngôn ngữ mà không truyền tham số qua mọi tầng):
//   run(lang, fn)   chạy fn trong ngữ cảnh ngôn ngữ (AsyncLocalStorage của Node — theo được qua await); main.js bọc route() một lần (hook H0, tuỳ chọn)
//   exit(fn)        chạy fn NGOÀI ngữ cảnh (tạo timer nền trong request)
//   reqLang(lang)   lang hợp lệ → ngôn ngữ của yêu cầu đang chạy → 'en' (mặc định ADR 0007) — cho thứ PHẢI chọn một ngôn ngữ: trang Cấp phép, dòng dặn AI
//   srcLang(lang)   lang hợp lệ → ngôn ngữ của yêu cầu đang chạy → 'vi' (msgid nguồn) — cho DỮ LIỆU trả Studio qua main.js: không có ngữ cảnh thì giữ
//                   tiếng Việt để main.js dịch ở rìa (localize / aiView theo langOf(req)) — không bao giờ ra tiếng Anh cố định cho người dùng chế độ vi
'use strict';
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const L10N = require('./i18n');
const M = require('../engine/i18n-msg.js');

const APP = path.resolve(__dirname, '..');
const VI = L10N.I18N.SOURCE;   // 'vi' — tr(VI, mẫu, biến): điền biến, KHÔNG dịch
// nạp bảng NGAY khi module được require (mô tả tool MCP dựng lúc nạp mcp.js — trước dòng L10N.load của main.js); load() chỉ chạy một lần
L10N.load(APP);
// MẪU khớp ngược chỉ lấy từ bảng của server / engine (server*.json, engine*.json): mẫu ngắn của giao diện ("{replace} mới", "{n} lỗi"…)
// dành cho t(msgid, vars) trong Studio — đem khớp ngược câu server thì nuốt nhầm cả câu. Bảng nào cũng vẫn dùng cho khớp NGUYÊN VĂN (L10N.load)
const MSG_TABLES = /^(server|engine)[\w-]*\.json$/;
(function () {
  const root = path.join(APP, 'locales');
  Object.keys(L10N.readLocales(APP)).forEach(l => fs.readdirSync(path.join(root, l)).filter(f => MSG_TABLES.test(f)).sort()
    .forEach(f => M.add(l, JSON.parse(fs.readFileSync(path.join(root, l, f), 'utf8')))));
})();

const store = new AsyncLocalStorage();
function run(lang, fn) { return store.run({ lang: L10N.norm(lang) || L10N.I18N.DEFAULT }, fn); }
function exit(fn) { return store.exit(fn); }   // việc NỀN tạo trong một request (timer): không kế thừa ngôn ngữ của request đó
function ctxLang(lang, fallback) {
  const l = L10N.norm(lang);
  if (l) return l;
  const s = store.getStore();
  return (s && s.lang) || fallback;
}
const reqLang = lang => ctxLang(lang, L10N.I18N.DEFAULT);
const srcLang = lang => ctxLang(lang, VI);
// câu theo ngôn ngữ (msgid nguyên văn hoặc câu ghép từ mẫu); lang bỏ trống = ngôn ngữ của yêu cầu, ngoài yêu cầu = giữ msgid (srcLang)
function label(lang, s) { return typeof s === 'string' ? M.msg(srcLang(lang), s) : s; }
const en = s => label('en', s);
// _t(msgid, vars, lang): câu theo ngôn ngữ (nhãn tĩnh, câu có placeholder) — lang bỏ trống như label(). Trang Cấp phép truyền reqLang() tường minh.
// Tên _t để tools/i18n-scan.mjs nhận msgid như ở Studio
function _t(msgid, vars, lang) { return L10N.tr(srcLang(lang), msgid, vars); }

// thân JSON trả Studio / trình duyệt: dịch các trường CÂU do server sinh — error, message, errors[] (chuỗi hoặc { error }), warnings[], conflicts[] —
// không đụng trường dữ liệu khác (tên, kịch bản… của người dùng). main.js gọi một lần trong send() (thay localize cũ chỉ khớp nguyên văn)
const BODY_LISTS = ['errors', 'warnings', 'conflicts'];
function localizeBody(lang, body) {
  const L = reqLang(lang);
  if (L === VI || !body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) return body;
  if (typeof body.error !== 'string' && typeof body.message !== 'string' && !BODY_LISTS.some(k => Array.isArray(body[k]))) return body;
  const out = Object.assign({}, body), one = s => M.msg(L, s);
  if (typeof out.error === 'string') out.error = one(out.error);
  if (typeof out.message === 'string') out.message = one(out.message);
  BODY_LISTS.forEach(k => {
    if (Array.isArray(out[k])) out[k] = out[k].map(x => typeof x === 'string' ? one(x) : x && typeof x === 'object' && !Array.isArray(x) && typeof x.error === 'string' ? Object.assign({}, x, { error: one(x.error) }) : x);
  });
  return out;
}

module.exports = { VI, tr: L10N.tr, _t, label, en, run, exit, reqLang, srcLang, localizeBody, norm: L10N.norm, M };
