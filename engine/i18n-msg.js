/* gen-chibi engine — i18n-msg 0.1: dịch CÂU GHÉP ĐỘNG bằng khớp ngược mẫu (ADR 0007)
 * © 2026 Gen Labs — All rights reserved.
 *
 * Câu lỗi / cảnh báo của engine và server vẫn SINH bằng tiếng Việt như cũ (msgid; chế độ vi không đổi một chữ). Câu ghép động
 * ('Không có tác phẩm ' + id) không tra thẳng được bảng — bảng giữ MẪU có placeholder ("Không có tác phẩm {id}": "Work {id} not found").
 * Ở RÌA (server trả Studio, MCP trả agent) msg(lang, câu) dịch theo thứ tự:
 *   1) khớp nguyên văn (I18N.has)
 *   2) khớp MẪU: msgid có {tên} → neo hai đầu, khớp TUYẾN TÍNH (không RegExp); nhiều mẫu cùng khớp thì lấy mẫu nhiều chữ cố định nhất.
 *      Giá trị bắt được GIỮ NGUYÊN (id, tên do người dùng đặt; số chỉ đổi kiểu khi viết lại y hệt: "007" vẫn là "007") — trừ placeholder tên là câu con
 *      ({msg} {error} {errors} {detail} {list} {what} {where} {label} {reason} {issue} {gate} {cause} {why}, có thể kèm số: {msg2}) → dịch đệ quy.
 *      Placeholder kiểu mã ({id} {key} {n} {slot} {pack} {code} {path}, có thể kèm số) chỉ khớp chuỗi KHÔNG khoảng trắng — mẫu ngắn "cảnh {id}"
 *      không nuốt nhầm cả một danh sách "cảnh a, cảnh b"
 *      Giá trị THÔ chứa "; " → bỏ mẫu (mẫu ngắn "chọn {ids}" không được nuốt cả danh sách lỗi phía sau)
 *   3) danh sách nối "; " → dịch từng câu (giữ "…" cuối)
 *   4) "đường.dẫn: câu" (đường dẫn máy đọc, không khoảng trắng) → giữ đường dẫn, dịch câu
 *   5) "nhãn (chi tiết)" / "nhãn: chi tiết" khi nhãn có bản dịch nguyên văn → dịch nhãn + dịch đệ quy chi tiết
 *   6) danh sách nối ", " → dịch từng mục (chỉ khi có mục dịch được; giữ "…" cuối)
 * Không dịch được thì trả nguyên câu (không bao giờ ném lỗi, không ghi "thiếu").
 *   add(lang, dict)   nạp mẫu (khoá có {…}) từ bảng locales/<lang>/*.json — gọi cùng lúc với I18N.add
 *   msg(lang, s)      câu theo ngôn ngữ
 *   templates(lang)   danh sách khoá mẫu đã nạp (test)
 * Ngân sách: chỉ chạy trên đường LỖI / cảnh báo (không mỗi khung hình); lọc nhanh mẫu bằng đoạn chữ cố định dài nhất trước khi khớp.
 *   Câu là dữ liệu NGƯỜI GỌI gửi (id 5 KB qua MCP): câu dài hơn MAX_LEN giữ nguyên; mỗi msg() có MAX_STEPS lần thử chung cho mọi mẫu + mọi tầng đệ quy,
 *   hết thì giữ nguyên phần còn lại — không bao giờ chặn event loop (review v0.20: regex lười nối nhau O(n⁴), 5 KB khoá server 15 s).
 * Thuần dữ liệu, không đụng DOM: chạy trong trình duyệt (GenChibi.i18nMsg, nạp SAU engine/i18n.js) và require() từ Node.
 */
(function (GC) {
  'use strict';
  var I18N = GC && GC.i18n ? GC.i18n : (typeof require === 'function' ? require('./i18n.js') : null);
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var PH = /\{([A-Za-z0-9_]+)\}/g;
  var SUB = /^(msg|error|errors|detail|details|list|what|where|label|reason|issue|gate|gates|cause|why)\d*$/;   // placeholder là câu con → dịch đệ quy
  var CODE = /^(id|key|n|slot|pack|code|path)\d*$/;                                                                // placeholder kiểu mã: không khoảng trắng
  var VI_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
  var MAX_LEN = 2000, MAX_DEPTH = 4, MAX_STEPS = 2000;
  var WS = /\s/g;
  var T = {};   // lang → [{ key, lits, names, code, score, probe }]

  function compile(key) {
    var names = [], lits = [], last = 0, m;
    PH.lastIndex = 0;
    while ((m = PH.exec(key))) { lits.push(key.slice(last, m.index)); names.push(m[1]); last = m.index + m[0].length; }
    lits.push(key.slice(last));
    if (!names.length) return null;
    // hai placeholder sát nhau (không chữ ở giữa) → không tách được → bỏ mẫu
    for (var i = 1; i < lits.length - 1; i++) if (!lits[i]) return null;
    var score = lits.join('').length, probe = lits.slice().sort(function (a, b) { return b.length - a.length; })[0];
    if (score < 4) return null;   // mẫu gần như toàn placeholder: quá chung, dễ khớp nhầm
    return { key: key, lits: lits, names: names, code: names.map(function (nm) { return CODE.test(nm); }), score: score, probe: probe };
  }
  // khớp mẫu như regex lười "^lit0(…?)lit1(…?)…litN$" — giá trị i lấy lần xuất hiện GẦN NHẤT của lit[i+1], chỉ lùi sang lần sau khi phần còn lại
  // không khớp; giá trị kiểu mã ≥ 1 ký tự, không khoảng trắng (đã chạm khoảng trắng thì dài hơn cũng vậy → thôi). Mỗi lần thử trừ b.n (chung cả câu).
  // Trả mảng giá trị hoặc null
  function match(t, s, b) {
    var lits = t.lits, n = t.names.length, head = lits[0], tail = lits[n], end = s.length - tail.length, cut = [];
    if (end < head.length || s.slice(0, head.length) !== head || s.slice(end) !== tail) return null;
    function wsFrom(pos) { WS.lastIndex = pos; var w = WS.exec(s); return w ? w.index : s.length; }
    function at(i, pos) {
      if (--b.n < 0) return false;
      var code = t.code[i], stop = code ? wsFrom(pos) : s.length;
      if (i === n - 1) {   // giá trị cuối: tới ngay trước chữ cố định cuối
        if (pos > end || (code && (pos === end || stop < end))) return false;
        cut[i] = [pos, end]; return true;
      }
      var lit = lits[i + 1];
      for (var k = s.indexOf(lit, code ? pos + 1 : pos); k >= 0 && k + lit.length <= end; k = s.indexOf(lit, k + 1)) {
        if (stop < k) return false;
        cut[i] = [pos, k];
        if (at(i + 1, k + lit.length)) return true;
        if (b.n < 0) return false;
      }
      return false;
    }
    return at(0, head.length) ? cut.map(function (c) { return s.slice(c[0], c[1]); }) : null;
  }
  function add(lang, dict) {
    var L = I18N.norm(lang);
    if (!L || L === I18N.SOURCE || !dict || typeof dict !== 'object') return 0;
    var list = T[L] || (T[L] = []), seen = {}, n = 0;
    list.forEach(function (t) { seen[t.key] = 1; });
    Object.keys(dict).forEach(function (k) {
      if (k.slice(0, 2) === '//' || seen[k] || k.indexOf('{') < 0) return;
      var c = compile(k);
      if (c) { list.push(c); seen[k] = 1; n++; }
    });
    list.sort(function (a, b) { return b.score - a.score; });
    return n;
  }
  function changed(a, b) { return a !== b; }
  function viaTemplate(L, s, depth, b) {
    var list = T[L];
    if (!list) return null;
    for (var i = 0; i < list.length && b.n >= 0; i++) {   // đã sắp theo score giảm dần → mẫu cụ thể nhất thắng
      var t = list[i];
      if (t.probe && s.indexOf(t.probe) < 0) continue;
      var m = match(t, s, b);
      if (!m) continue;
      // giá trị THÔ (không phải câu con) mà chứa "; " = mẫu ngắn đang nuốt cả danh sách lỗi nối "; " → bỏ mẫu này, để bước tách danh sách lo
      if (t.names.some(function (nm, j) { return !SUB.test(nm) && m[j].indexOf('; ') >= 0; })) continue;
      var vars = {};
      t.names.forEach(function (nm, j) {
        var v = m[j];
        if (SUB.test(nm)) v = msgAt(L, v, depth + 1, b);
        else if (/^-?\d+$/.test(v) && String(+v) === v) v = +v;   // số đếm cho số nhiều [một, nhiều]; "007", id 23 chữ số, "-0" giữ nguyên chữ
        vars[nm] = v;
      });
      return I18N.labelIn(L, t.key, vars);
    }
    return null;
  }
  function msgAt(L, s, depth, b) {
    if (typeof s !== 'string' || !s || L === I18N.SOURCE) return s;
    if (I18N.has(L, s)) return I18N.labelIn(L, s);
    if (depth > MAX_DEPTH || s.length > MAX_LEN || b.n < 0 || !VI_RE.test(s)) return s;   // quá dài / hết ngân sách / không còn chữ Việt (đường dẫn, mã, id) — giữ nguyên
    var r = viaTemplate(L, s, depth, b);
    if (r !== null) return r;
    // danh sách nối "; " tách TRƯỚC luật đường dẫn: "type: chọn a; rarity: chọn b" là hai lỗi, không phải một đường dẫn "type" + phần còn lại
    if (s.indexOf('; ') > 0) {
      var tail = /…$/.test(s) ? '…' : '', parts = (tail ? s.slice(0, -1) : s).split('; '), outs = parts.map(function (p) { return msgAt(L, p, depth + 1, b); });
      if (outs.some(function (o, i) { return changed(o, parts[i]); })) return outs.join('; ') + tail;
    }
    var m = /^([^\s:]{1,120}): ([\s\S]+)$/.exec(s);   // "steps[2].actor: câu" — đường dẫn máy đọc giữ nguyên
    if (m && !VI_RE.test(m[1])) { var rest = msgAt(L, m[2], depth + 1, b); if (changed(rest, m[2])) return m[1] + ': ' + rest; }
    var ip = s.indexOf(' (');   // "Nhãn cổng (chi tiết)": nhãn = phần trước " (" đầu tiên — tìm tuyến tính (regex lười cũ O(n²))
    if (ip > 0 && s.charAt(s.length - 1) === ')' && s.length >= ip + 3 && I18N.has(L, s.slice(0, ip))) return I18N.labelIn(L, s.slice(0, ip)) + ' (' + msgAt(L, s.slice(ip + 2, -1), depth + 1, b) + ')';
    var lc = /^([^:]{1,120}): ([\s\S]+)$/.exec(s);       // "Nhãn cổng: chi tiết"
    if (lc && I18N.has(L, lc[1])) return I18N.labelIn(L, lc[1]) + ': ' + msgAt(L, lc[2], depth + 1, b);
    if (s.indexOf(', ') > 0) {
      var t2 = /…$/.test(s) ? '…' : '', items = (t2 ? s.slice(0, -1) : s).split(', '), tr = items.map(function (p) { return msgAt(L, p, depth + 1, b); });
      if (tr.some(function (o, i) { return changed(o, items[i]); })) return tr.join(', ') + t2;
    }
    return s;
  }
  var M = {
    add: add,
    msg: function (lang, s) { var L = I18N.norm(lang) || I18N.lang(); return msgAt(L, s, 0, { n: MAX_STEPS }); },
    templates: function (lang) { return (T[I18N.norm(lang)] || []).map(function (t) { return t.key; }); },
    VI_RE: VI_RE, MAX_LEN: MAX_LEN, MAX_STEPS: MAX_STEPS
  };
  if (GC) GC.i18nMsg = M;
  if (typeof module === 'object' && module && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window.GenChibi : (typeof globalThis !== 'undefined' ? globalThis.GenChibi : undefined));
