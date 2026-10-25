// Quét độ phủ bản dịch (ADR 0007). Dùng: node tools/i18n-scan.mjs [--strict] [--json] [--list]
//   (a) msgid dùng trong _t() / N_() / tr(lang, …) / data-i18n* mà bảng locales/en/*.json thiếu  → LỖI (thoát 1)
//   (b) khoá trong bảng không còn xuất hiện ở đâu trong mã                                         → cảnh báo
//   (c) chuỗi có dấu tiếng Việt trong mã GIAO DIỆN chưa bọc _t()                                   → báo; --strict thì LỖI
//       ngoại lệ (không tính, in tổng theo lý do): comment · regex (literal và new RegExp) · console.* · so sánh / khoá dữ liệu
//       (=== 'x', case 'x':, { 'x': … }, indexOf('x')…) · dòng có `i18n-ignore(<lý do>)` · khối `i18n-ignore-start(<lý do>)` … `i18n-ignore-end`
//       (dùng cho: regex phân tích chữ Việt, danh sách từ khoá đoán vai, nội dung bộ mẫu Tam Quốc, dữ liệu so khớp).
// © 2026 Gen Labs — All rights reserved.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const VI_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
// mã giao diện: chữ người dùng nhìn thấy phải đi qua _t()
const UI_FILES = ['studio/app.js', 'studio/dock.js', 'studio/live-feed.js', 'studio/live.js', 'engine/player.js', 'studio/video/client.js', 'studio/film-html.js'];
const UI_HTML = ['studio/index.html'];
// nơi tìm msgid đang dùng (a) và nơi một khoá còn "sống" (b)
const SRC_DIRS = ['studio', 'engine', 'kinds', 'server'];

/* ---------------------------------------------------------------- tokenizer JS (đủ cho mã ES5/ES2020 của repo) */
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const KW_BEFORE_RE = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
export function strValue(raw) {   // giá trị của literal chuỗi (đúng như JS hiểu)
  if (raw[0] === '`') return raw.slice(1, -1);
  return raw.slice(1, -1).replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (m, e) => {
    if (e[0] === 'u' && e[1] === '{') return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === 'u' || e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === '\n' || e === '\r\n' || e === '\r') return '';   // nối dòng
    return Object.prototype.hasOwnProperty.call(ESC, e) ? ESC[e] : e;
  });
}
export function tokenize(src) {
  const out = []; let i = 0, line = 1; const n = src.length;
  let prev = null;   // token có nghĩa gần nhất (bỏ khoảng trắng / comment)
  const push = (type, start, end, extra) => { const t = Object.assign({ type, start, end, line, value: src.slice(start, end) }, extra); out.push(t); if (type !== 'ws' && type !== 'comment') prev = t; line += (t.value.match(/\n/g) || []).length; return t; };
  const regexOK = () => !prev || (prev.type === 'punct' && ![')', ']', '}'].includes(prev.value)) || (prev.type === 'punct' && prev.value === '}') || (prev.type === 'ident' && KW_BEFORE_RE.has(prev.value));
  while (i < n) {
    const c = src[i], s = i;
    if (/\s/.test(c)) { while (i < n && /\s/.test(src[i])) i++; push('ws', s, i); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; push('comment', s, i); continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; push('comment', s, i); continue; }
    if (c === '\'' || c === '"') { i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; } i++; push('str', s, i); continue; }
    if (c === '`') {
      i++; let depth = 0;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (!depth && src[i] === '`') break;
        if (src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth && src[i] === '}') { depth--; i++; continue; }
        if (depth && (src[i] === '\'' || src[i] === '"')) { const q = src[i++]; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; continue; }
        i++;
      }
      i++; push('tpl', s, i); continue;
    }
    if (c === '/' && regexOK()) {
      i++; let cls = false;
      while (i < n && (cls || src[i] !== '/')) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '\n') break; i++; }
      i++; while (i < n && /[a-z]/i.test(src[i])) i++;
      push('regex', s, i); continue;
    }
    if (/[A-Za-z_$À-￿]/.test(c)) { while (i < n && /[\w$À-￿]/.test(src[i])) i++; push('ident', s, i); continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1]))) { while (i < n && /[\w.]/.test(src[i])) i++; push('num', s, i); continue; }
    const p = PUNCT.find(x => src.startsWith(x, i));
    i += p ? p.length : 1; push('punct', s, i);
  }
  return out;
}
// chỉ token có nghĩa, kèm chỉ số khớp ngoặc + tên hàm đang gọi bao quanh
export function analyze(src) {
  const all = tokenize(src), toks = all.filter(t => t.type !== 'ws' && t.type !== 'comment');
  const stack = [];
  toks.forEach((t, k) => {
    t.k = k; t.calls = stack.map(x => x.callee).filter(Boolean);
    if (t.type === 'punct' && (t.value === '(' || t.value === '[' || t.value === '{')) {
      let callee = null;
      if (t.value === '(' && k > 0 && toks[k - 1].type === 'ident') {   // f( · a.b.f( → "a.b.f"
        let j = k - 1, name = toks[j].value;
        while (j >= 2 && toks[j - 1].value === '.' && toks[j - 2].type === 'ident') { name = toks[j - 2].value + '.' + name; j -= 2; }
        callee = name;
      }
      stack.push({ k, callee, open: t.value });
    } else if (t.type === 'punct' && (t.value === ')' || t.value === ']' || t.value === '}')) { const o = stack.pop(); if (o) { t.match = o.k; toks[o.k].match = k; } }
  });
  return { all, toks };
}

/* ---------------------------------------------------------------- quy tắc */
const PT_FUNCS = new Set(['_pt', 'I18N.pt', 'GC.i18n.pt', 'i18n.pt']);   // _pt(ngữ cảnh, msgid) → khoá "[ngữ cảnh] msgid"
const T_FUNCS = new Set(['_pt', 'I18N.pt', 'GC.i18n.pt', 'i18n.pt', '_t', 'N_', '_l', 'I18N.t', 'I18N.N', 'I18N.label', 'GC.i18n.t', 'GC.i18n.label', 'i18n.t', 'i18n.label', 'GenChibi.i18n.t']);
const DATA_CALLS = /(^|\.)(indexOf|lastIndexOf|includes|startsWith|endsWith|split|test|match|matchAll|search|replace|replaceAll|getItem|setItem|removeItem|querySelector|querySelectorAll|closest|getElementById|hasOwnProperty|has|RegExp|norm|normalize)$/;
const CMP = new Set(['===', '!==', '==', '!=']);
function ignoreZones(src) {   // dòng / khối được miễn có lý do
  const lines = src.split('\n'), zone = new Map(); let open = null;
  lines.forEach((l, i) => {
    const st = l.match(/i18n-ignore-start\(([^)]*)\)/), en = /i18n-ignore-end/.test(l), one = l.match(/i18n-ignore\(([^)]*)\)/);
    if (st) open = st[1] || 'không ghi lý do';
    if (open) zone.set(i + 1, open);
    else if (one) { zone.set(i + 1, one[1] || 'không ghi lý do'); if (/^\s*\/\//.test(l)) zone.set(i + 2, one[1] || 'không ghi lý do'); }   // comment riêng một dòng: miễn dòng ngay sau
    if (en) open = null;
  });
  return zone;
}
// một literal chuỗi có dấu: vì sao được miễn (null = chưa bọc)
export function classify(toks, k, zones) {
  const t = toks[k], p = toks[k - 1] || {}, nx = toks[k + 1] || {};
  if (zones && zones.has(t.line)) return 'miễn: ' + zones.get(t.line);
  const calls = t.calls || [];
  if (calls.some(c => T_FUNCS.has(c))) return 'ok';
  // tr(lang, 'msgid') ở server
  if (calls.length && /(^|\.)tr$/.test(calls[calls.length - 1])) return 'ok';
  if (calls.some(c => /^console\./.test(c))) return 'console';
  if (calls.length && DATA_CALLS.test(calls[calls.length - 1])) return 'so khớp dữ liệu';
  if (CMP.has(p.value) || CMP.has(nx.value) || p.value === 'case') return 'so sánh dữ liệu';
  if (nx.value === ':' && (p.value === '{' || p.value === ',')) return 'khoá đối tượng';
  if (p.value === '[' && toks[k - 2] && (toks[k - 2].type === 'ident' || toks[k - 2].value === ']' || toks[k - 2].value === ')') && nx.value === ']') return 'khoá đối tượng';   // obj['khoá']
  return null;
}

function walk(dir, ext, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (!/^(node_modules|fonts|mau)$/.test(f.name)) walk(p, ext, out); }
    else if (ext.test(f.name)) out.push(p);
  }
  return out;
}
export function loadTables(root = ROOT) {
  const dir = path.join(root, 'locales/en'), files = {};
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) files[f] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return files;
}
const DATA_I18N = /data-i18n(?:-title|-aria-label)?="([^"]*)"/g;
function htmlUnescape(s) { return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, '\'').replace(/&amp;/g, '&'); }

export function scan(root = ROOT) {
  const tables = loadTables(root), en = {};
  Object.values(tables).forEach(d => Object.assign(en, d));
  const used = new Map();            // msgid → [vị trí]  (a)
  const literals = new Set();        // mọi giá trị literal chuỗi trong mã (b)
  const unwrapped = [];              // (c)
  const exempt = {};                 // lý do → số chuỗi
  const files = [].concat(...SRC_DIRS.map(d => walk(path.join(root, d), /\.(js|html)$/)));
  for (const f of files) {
    const rel = path.relative(root, f), src = fs.readFileSync(f, 'utf8');
    if (rel.endsWith('.html')) {
      let m; while ((m = DATA_I18N.exec(src))) { const id = htmlUnescape(m[1]); (used.get(id) || used.set(id, []).get(id)).push(rel); literals.add(id); }
      if (UI_HTML.includes(rel)) {
        // chữ / title / aria-label / placeholder có dấu phải có data-i18n* tương ứng
        const tags = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
        const re = /<([a-z][\w-]*)([^>]*)>([^<]*)/gi; let t;
        while ((t = re.exec(tags))) {
          const attrs = t[2], text = t[3].trim();
          ['title', 'aria-label', 'placeholder'].forEach(a => { const am = attrs.match(new RegExp('\\s' + a + '="([^"]*)"')); if (am && VI_RE.test(am[1]) && !attrs.includes('data-i18n-' + a + '="')) unwrapped.push({ file: rel, line: src.slice(0, src.indexOf(t[0])).split('\n').length, text: a + '="' + am[1] + '"' }); });
          if (text && VI_RE.test(text) && !/data-i18n="/.test(attrs) && !/\slang="vi"/.test(attrs)) unwrapped.push({ file: rel, line: src.slice(0, src.indexOf(t[0])).split('\n').length, text });
        }
      }
      continue;
    }
    const { toks } = analyze(src), zones = ignoreZones(src), isUI = UI_FILES.includes(rel), isServer = rel.startsWith('server/');
    toks.forEach((t, k) => {
      if (t.type !== 'str' && t.type !== 'tpl') return;
      let v; try { v = strValue(t.value); } catch (e) { return; }
      literals.add(v);
      const calls = t.calls || [], callee = calls[calls.length - 1] || '';
      const direct = toks[k - 1] && toks[k - 1].value === '(' && toks[k - 2] && toks[k - 2].type === 'ident';
      // msgid = đối số chuỗi ĐẦU TIÊN của _t / N_ (server: thứ hai của tr(lang, …))
      if (PT_FUNCS.has(callee) && direct) {   // đối số 1 = ngữ cảnh, 2 = msgid
        const m = toks[k + 1] && toks[k + 1].value === ',' && toks[k + 2] && (toks[k + 2].type === 'str' || toks[k + 2].type === 'tpl') ? toks[k + 2] : null;
        let id = null; try { id = m ? strValue(m.value) : null; } catch (e) { id = null; }
        if (id) { const key = '[' + v + '] ' + id; (used.get(key) || used.set(key, []).get(key)).push(rel + ':' + t.line); literals.add(key); }
        return;
      }
      if ((T_FUNCS.has(callee) && direct && !PT_FUNCS.has(callee) && !/label$|^_l$/.test(callee)) || (isServer && /(^|\.)tr$/.test(callee) && toks[k - 1].value === ',' && toks[k - 3] && toks[k - 3].value === '(')) {
        (used.get(v) || used.set(v, []).get(v)).push(rel + ':' + t.line);
      }
      if (!isUI || !VI_RE.test(v)) return;
      const why = classify(toks, k, zones);
      if (why === 'ok') return;
      if (why) { exempt[why] = (exempt[why] || 0) + 1; return; }
      unwrapped.push({ file: rel, line: t.line, text: v });
    });
  }
  const missing = [...used.keys()].filter(id => id && !Object.prototype.hasOwnProperty.call(en, id)).map(id => ({ msgid: id, at: used.get(id).slice(0, 3) }));
  const extra = [];
  Object.entries(tables).forEach(([f, d]) => Object.keys(d).forEach(k => { if (k.slice(0, 2) !== '//' && !literals.has(k) && !used.has(k)) extra.push({ file: f, msgid: k }); }));
  // cùng msgid, hai tệp dịch khác nhau → cảnh báo (bảng gộp: tệp sau đè tệp trước)
  const conflict = [], seen = {};
  Object.entries(tables).forEach(([f, d]) => Object.entries(d).forEach(([k, v]) => { if (k.slice(0, 2) === '//') return; if (seen[k] && JSON.stringify(seen[k][1]) !== JSON.stringify(v)) conflict.push({ msgid: k, files: [seen[k][0], f] }); else seen[k] = [f, v]; }));
  const counts = {}; Object.entries(tables).forEach(([f, d]) => { counts[f] = Object.keys(d).filter(k => k.slice(0, 2) !== '//').length; });
  return { used: used.size, missing, extra, conflict, unwrapped, exempt, counts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const strict = process.argv.includes('--strict'), list = process.argv.includes('--list');
  const r = scan();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  console.log('   bảng en: ' + Object.entries(r.counts).map(([f, n]) => f + ' ' + n).join(' · ') + ' · msgid đang dùng: ' + r.used);
  if (r.missing.length) { console.log('   ✗ (a) ' + r.missing.length + ' msgid dùng trong _t()/N_()/tr() mà bảng en thiếu:'); r.missing.slice(0, list ? 1e9 : 25).forEach(m => console.log('      ' + JSON.stringify(m.msgid) + '  ← ' + m.at.join(', '))); }
  else console.log('   ✓ (a) mọi msgid đang dùng đều có bản dịch en');
  if (r.extra.length) { console.log('   ! (b) ' + r.extra.length + ' khoá thừa (không còn trong mã):'); r.extra.slice(0, list ? 1e9 : 10).forEach(m => console.log('      ' + m.file + ': ' + JSON.stringify(m.msgid))); }
  else console.log('   ✓ (b) không có khoá thừa');
  if (r.conflict.length) { console.log('   ! ' + r.conflict.length + ' msgid dịch khác nhau giữa hai tệp:'); r.conflict.slice(0, 10).forEach(m => console.log('      ' + JSON.stringify(m.msgid) + ' — ' + m.files.join(' / '))); }
  const ex = Object.entries(r.exempt).map(([k, v]) => k + ' ' + v).join(' · ');
  if (r.unwrapped.length) { console.log('   ' + (strict ? '✗' : '!') + ' (c) ' + r.unwrapped.length + ' chuỗi có dấu trong mã giao diện chưa bọc _t():'); r.unwrapped.slice(0, list ? 1e9 : 25).forEach(u => console.log('      ' + u.file + ':' + u.line + '  ' + JSON.stringify(u.text).slice(0, 110))); }
  else console.log('   ✓ (c) không còn chuỗi có dấu chưa bọc trong mã giao diện');
  if (ex) console.log('     ngoại lệ (c): ' + ex);
  process.exit(r.missing.length || (strict && r.unwrapped.length) ? 1 : 0);
}
