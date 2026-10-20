// gen-chibi — ngôn ngữ phía server (ADR 0007): chọn ngôn ngữ theo yêu cầu + dịch câu trả lời.
// Dùng chung module engine/i18n.js (DOM-free) và bảng locales/<lang>/*.json với Studio.
//   langOf(req, def)       → 'en' | 'vi': header X-GC-Lang (Studio luôn gửi) → Accept-Language → def (mặc định của máy, settings.uiLang) → 'en'
//   tr(lang, msgid, vars)  → câu theo ngôn ngữ (msgid = chuỗi tiếng Việt hiện có; thiếu bản dịch thì trả msgid)
//   label(lang, s)         → như tr nhưng không ghi "thiếu" (câu động / dữ liệu): dùng cho lớp dịch tự động ở send()
//   readLocales(appDir)    → { en: { msgid: bản dịch } } gộp mọi tệp của từng ngôn ngữ (server nạp vào vm của engine nữa)
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs');
const path = require('path');
const I18N = require('../engine/i18n.js');

function readLocales(appDir) {
  const out = {}, root = path.join(appDir, 'locales');
  let langs = [];
  try { langs = fs.readdirSync(root).filter(l => I18N.norm(l) === l && l !== I18N.SOURCE); } catch (e) { return out; }   // bản cài cũ không có locales/: chạy tiếng Việt như trước
  for (const l of langs) {
    const d = out[l] = {};
    for (const f of fs.readdirSync(path.join(root, l)).filter(x => x.endsWith('.json')).sort()) {
      let j;
      try { j = JSON.parse(fs.readFileSync(path.join(root, l, f), 'utf8')); }
      catch (e) { throw new Error('locales/' + l + '/' + f + ': JSON hỏng — ' + e.message); }   // bảng hỏng là lỗi phát hành: dừng sớm, không chạy nửa vời
      Object.assign(d, j);
    }
  }
  return out;
}

let loaded = false;
function load(appDir) {
  if (loaded) return;
  const all = readLocales(appDir);
  Object.keys(all).forEach(l => I18N.add(l, all[l]));
  loaded = true;
}

// Accept-Language: "vi-VN,vi;q=0.9,en;q=0.8" → ngôn ngữ hỗ trợ có q cao nhất (bằng q thì theo thứ tự xuất hiện)
function fromAccept(h) {
  let best = '', bq = 0;
  String(h || '').split(',').forEach(part => {
    const [tag, ...params] = part.trim().split(';');
    const l = I18N.norm(tag);
    if (!l) return;
    const qp = params.map(x => x.trim()).find(x => x.startsWith('q='));
    const q = qp ? parseFloat(qp.slice(2)) : 1;
    if (Number.isFinite(q) && q > bq) { best = l; bq = q; }
  });
  return best;
}
function langOf(req, def) {
  const hd = (req && req.headers) || {};
  return I18N.norm(hd['x-gc-lang']) || fromAccept(hd['accept-language']) || I18N.norm(def) || I18N.DEFAULT;
}
function tr(lang, msgid, vars) { return I18N.tr(lang, msgid, vars); }
function label(lang, s, vars) { return I18N.labelIn(lang, s, vars); }

module.exports = { langOf, tr, label, load, readLocales, fromAccept, norm: I18N.norm, I18N };
