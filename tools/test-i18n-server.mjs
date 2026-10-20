// Kiểm i18n phía SERVER + MCP + nhãn engine (ADR 0007, v0.20):
//  (a) msgid server / engine đang dùng (tr(VI, …) · _t · N_) đều có bản en; mọi MẪU {…} của bảng en khớp ngược đúng
//      (câu tiếng Việt đã điền biến → MSG.en → đúng bản en của chính mẫu đó: không mẫu ngắn nào nuốt nhầm câu của mẫu khác)
//  (b) HTTP theo người gọi: không header → en · X-GC-Lang: vi → vi · Accept-Language: vi-VN → vi — 404 tác phẩm · 422 cổng kiểm ·
//      401 thiếu token · Origin lạ · OAuth (JSON cho máy luôn tiếng Anh) · nhãn phạm vi OAuth · nhãn khu của dock
//  (c) MCP cho agent = tiếng Anh (CNS-067): tool (title / description / tham số), INSTRUCTIONS, chỉ dẫn dock mọi khu + tác phẩm, lời văn
//      get_guide không còn chữ có dấu; lỗi MCP trả agent là tiếng Anh kể cả khi header nói vi
//  (d) trang Cấp phép (lỗi + đồng ý): en mặc định, vi theo Accept-Language; <html lang> đúng
//  (e) mọi nhãn engine Studio hiện (nhóm / âm / luật / công thức âm, vai / tuổi / kiểu giọng, ngôn ngữ + giọng vùng, biểu cảm, hoạt động, tư thế,
//      di chuyển, bộ phận, linh kiện khung, item / cảnh, cổng kiểm của asset / item / cảnh khung) có bản en — liệt kê TỪ DỮ LIỆU engine
//  (f) context.lang của dock: cleanContext giữ 'en' | 'vi' (bỏ giá trị lạ) → chỉ dẫn dặn AI trả lời đúng ngôn ngữ giao diện
//  (g) rào ngược: chính các phép kiểm ở trên ĐỎ khi bỏ một bản dịch / chèn chữ Việt vào mô tả tool / đổi mặc định máy sang vi
//  (h) review bảo mật v0.20: dịch câu không chặn event loop (payload ReDoS < 50 ms, MCP id 5 KB) · id giữ nguyên chữ · đường của máy luôn en · error_description ASCII
// Hook main.js (H0 MSG.run quanh route + H1 MSG.localizeBody trong localize): khi main.js CHƯA có hook, các kiểm phụ thuộc hook in "… chờ hook main.js" thay vì đỏ;
// main.js có hook thì mọi kiểm đều nghiêm (Gen bỏ nhánh chờ này khi gộp xong).
// Dùng: node tools/test-i18n-server.mjs   (cổng 7631 + 7632)
// © 2026 Gen Labs — All rights reserved.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import { scan } from './i18n-scan.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MSG = require(ROOT + '/server/i18n-msg.js'), L10N = require(ROOT + '/server/i18n.js');
const { MCP, TOOLS, INSTRUCTIONS, ZONES, cleanContext, workInstructions } = require(ROOT + '/server/mcp.js');
const { SCOPES, SCOPE_INFO } = require(ROOT + '/server/oauth.js'), { PROVIDERS } = require(ROOT + '/server/ai.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js'), Agent = require(ROOT + '/server/agent.js');
const VI_RE = MSG.M.VI_RE;
const MAIN = readFileSync(ROOT + '/server/main.js', 'utf8');
const HOOKED = /MSG\.run\(/.test(MAIN) && /MSG\.localizeBody\(/.test(MAIN);
let fail = 0, pass = 0, pend = 0;
const ok = (c, m) => { if (c) { pass++; console.log('   ✓', m); } else { fail = 1; console.log('   ✗', m); } };
const okH = ok;   // v0.20: hook main.js đã gộp (MSG.run + MSG.localizeBody) — mọi ca kiểm nghiêm, không còn "chờ hook"
ok(HOOKED, 'main.js có hook i18n: mỗi yêu cầu chạy trong MSG.run(langOf(req)) + localize qua MSG.localizeBody');
const cut = (s, n) => JSON.stringify(String(s)).slice(0, n || 160);

/* ---------------------------------------------------------------- các hàm kiểm (dùng lại ở rào ngược (g)) */
const tables = {};
readdirSync(ROOT + '/locales/en').filter(f => f.endsWith('.json')).forEach(f => { tables[f] = JSON.parse(readFileSync(path.join(ROOT, 'locales/en', f), 'utf8')); });
const MINE = ['server-msg.json', 'server-main.json', 'engine-data.json'];
// biến mẫu cho một khoá: số cho {n}/{total}…, mã không khoảng trắng cho {id}/{key}…, chữ thường cho phần còn lại
const CODE = /^(id|key|n|slot|pack|code|path)\d*$/, NUM = /^(n\d*|total|max|cast|deco|decoMax|fx|fxMax|count|sec)$/;
function sample(k) { const v = {}; let i = 0; k.replace(/\{([A-Za-z0-9_]+)\}/g, (m, nm) => { v[nm] = NUM.test(nm) ? 3 + i++ : CODE.test(nm) ? 'x-' + i++ : 'zz' + i++; }); return v; }
// chỉ các bảng của server / engine (mẫu cần khớp ngược); bộ khớp vẫn nạp MỌI bảng nên mẫu của bảng khác nuốt nhầm cũng lộ ra ở đây
function roundTrip() {
  const bad = []; let n = 0;
  MINE.forEach(f => Object.keys(tables[f] || {}).forEach(k => {
    if (k.slice(0, 2) === '//' || k.indexOf('{') < 0) return;
    const v = sample(k), vi = L10N.tr('vi', k, v);
    if (!VI_RE.test(vi)) return;
    n++;
    const got = MSG.en(vi), want = L10N.tr('en', k, v);
    if (got !== want || VI_RE.test(got)) bad.push(f + ': ' + k + ' → ' + got);
  }));
  return { n, bad };
}
// nhãn engine Studio hiện — liệt kê từ dữ liệu engine (thêm nhãn mới vào engine mà quên bảng = đỏ)
function engineLabels(GC) {
  const out = new Map(), add = (where, s) => { if (typeof s === 'string' && VI_RE.test(s) && !out.has(s)) out.set(s, where); };
  const L = GC.LIB, frame = p => GC.PACKS[p] && GC.PACKS[p].group === 'frame';
  ['slots', 'states', 'postures', 'moves', 'activities', 'eyeStyles', 'browStyles', 'mouths', 'fx', 'motions', 'profiles', 'props', 'eyePoses', 'browPoses'].forEach(k => {
    const t = L[k] || {}; Object.keys(t).forEach(id => { const o = t[id]; if (o && typeof o === 'object') ['label', 'hint', 'group'].forEach(f => add('LIB.' + k + '.' + id + '.' + f, o[f])); });
  });
  (L.traits || []).forEach(t => add('LIB.traits.' + t.id, t.label));
  Object.keys(L.parts).forEach(slot => Object.keys(L.parts[slot]).forEach(id => { const p = L.parts[slot][id]; if (frame(p.pack)) add('linh kiện ' + p.pack + '/' + slot + ':' + id, p.label); }));
  ['types', 'rarity', 'stats', 'frames'].forEach(k => { const t = GC.ITEM[k] || {}; Object.keys(t).forEach(id => { const o = t[id]; add('ITEM.' + k + '.' + id, typeof o === 'string' ? o : o && o.label); }); });
  ['times', 'weathers', 'spots', 'slots'].forEach(k => { const t = GC.SCENE[k] || {}; Object.keys(t).forEach(id => { const o = t[id]; add('SCENE.' + k + '.' + id, typeof o === 'string' ? o : o && o.label); }); });
  ['cameras', 'bubbles', 'sfx'].forEach(k => { const t = GC.FILM[k] || {}; Object.keys(t).forEach(id => { const o = t[id]; add('FILM.' + k + '.' + id, typeof o === 'string' ? o : o && o.label); }); });
  const V = GC.voices;
  Object.values(V.ROLES).forEach(r => add('vai giọng ' + r.id, r.label));
  Object.keys(V.LANGS).forEach(l => { add('ngôn ngữ ' + l, V.LANGS[l].label); (V.LANGS[l].accents || []).forEach(a => add('giọng vùng ' + l + '.' + a[0], a[1])); });
  V.AGES.forEach(a => add('tuổi ' + a[0], a[1]));
  Object.keys(V.KINDS).forEach(k => add('kiểu ' + k, V.KINDS[k]));
  const S = GC.sounds;
  S.CATS.forEach(c => add('nhóm âm ' + c[0], c[1]));
  S.list().forEach(x => { if (/^gen\./.test(x.pack || '')) { add('âm ' + x.name + '.label', x.label); add('âm ' + x.name + '.use', x.use); } });
  S.RECIPES.forEach(r => { add('công thức ' + r.id + '.label', r.label); add('công thức ' + r.id + '.note', r.note); });
  S.RULES.list.forEach(r => { add('luật ' + r.code + '.short', r.short); add('luật ' + r.code + '.rule', r.rule); });
  GC.assets().filter(a => frame(a.pack)).forEach(a => GC.gate(a).forEach(g => { add('cổng ' + a.id + '.' + g.id, g.label); add('cổng ' + a.id + '.' + g.id + ' (chi tiết)', g.detail); }));
  GC.scenes().forEach(sc => GC.sceneGate(sc).forEach(g => { add('cổng cảnh ' + sc.id + '.' + g.id, g.label); add('cổng cảnh ' + sc.id + '.' + g.id + ' (chi tiết)', g.detail); }));
  GC.items().forEach(it => GC.itemGate(it).forEach(g => { add('cổng item ' + it.id + '.' + g.id, g.label); add('cổng item ' + it.id + '.' + g.id + ' (chi tiết)', g.detail); }));
  return out;
}
const untranslated = labels => [...labels].filter(([s]) => MSG.en(s) === s);
// mọi chuỗi trong một đối tượng (mô tả tool, schema tham số…) có chữ có dấu
function viStrings(x, p, out) {
  out = out || [];
  if (typeof x === 'string') { if (VI_RE.test(x)) out.push(p + ': ' + x.slice(0, 80)); }
  else if (Array.isArray(x)) x.forEach((y, i) => viStrings(y, p + '[' + i + ']', out));
  else if (x && typeof x === 'object') Object.keys(x).forEach(k => viStrings(x[k], p + '.' + k, out));
  return out;
}
const viInTools = tools => [].concat(...tools.map(t => viStrings({ title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations }, t.name)));
// lời văn hướng dẫn agent (bỏ khối mã / ví dụ JSON, bảng thuật ngữ có cột tiếng Việt, nhãn giao diện tiếng Việt trong ngoặc / ngoặc kép, tên riêng của bộ mẫu)
const proseVI = md => { let code = false; return md.split('\n').filter(l => { if (/^\s*```/.test(l)) { code = !code; return false; } return !code && !/^\s*\|/.test(l) && VI_RE.test(l.replace(/\([^()]*\)|"[^"]*"|Vietnamese UI:[^;)]*|Tam Quốc/g, '')); }); };

const fresh = () => { const store = new Store(mkdtempSync(path.join(tmpdir(), 'gc-i18nsrv-'))); return new MCP({ engine: loadEngine(ROOT), store, version: 't', system: {} }); };
const M0 = fresh(), GC = M0.GC;

/* ---------------------------------------------------------------- (a) */
console.log('(a) msgid server / engine có bản en · mẫu khớp ngược đúng');
{
  const sc = scan(ROOT), miss = sc.missing.filter(x => x.at.some(a => /^(server|engine|kinds)\//.test(a)));
  ok(!miss.length, 'mọi msgid dùng trong server/ engine/ kinds/ (tr(VI, …) · _t · N_) có bản en (' + sc.used + ' msgid đang dùng)' + (miss.length ? ' — thiếu: ' + miss.slice(0, 6).map(x => cut(x.msgid, 80) + ' ← ' + x.at[0]).join(' · ') : ''));
  const compiled = new Set(MSG.M.templates('en'));
  const lost = [].concat(...MINE.map(f => Object.keys(tables[f] || {}).filter(k => k.slice(0, 2) !== '//' && /\{[A-Za-z0-9_]+\}/.test(k) && !compiled.has(k))));
  ok(MINE.every(f => tables[f]) && !lost.length, 'mọi khoá MẪU của ' + MINE.join(' / ') + ' biên dịch được thành mẫu khớp ngược (≥ 4 chữ cố định, không hai placeholder sát nhau)' + (lost.length ? ': ' + lost.slice(0, 5).map(k => cut(k, 80)).join(' · ') : ''));
  const rt = roundTrip();
  ok(rt.n > 300 && !rt.bad.length, 'khớp ngược: ' + rt.n + ' mẫu có chữ Việt — điền biến rồi dịch ngược ra ĐÚNG bản en của chính mẫu đó' + (rt.bad.length ? ' — sai ' + rt.bad.length + ': ' + rt.bad.slice(0, 4).join(' | ') : ''));
  // cổng kiểm: Studio dịch bằng t(labelId, labelVars), server / MCP dịch câu đã ghép bằng khớp ngược — hai đường phải ra cùng một câu
  const rows = [].concat(...GC.assets().map(a => GC.gate(a)), ...GC.scenes().map(sc => GC.sceneGate(sc)), ...GC.items().map(it => GC.itemGate(it))).filter(g => g.labelId || g.detailId);
  const diff = rows.filter(g => (g.labelId && L10N.tr('en', g.labelId, g.labelVars) !== MSG.en(g.label)) || (g.detailId && L10N.tr('en', g.detailId, g.detailVars) !== MSG.en(g.detail)));
  ok(rows.length >= 3 && !diff.length, 'cổng kiểm (' + rows.length + ' dòng có labelId / detailId): t(msgid, vars) = dịch ngược câu đã ghép' + (diff.length ? ' — lệch: ' + diff.slice(0, 3).map(g => g.id + ' ' + cut(g.label, 60)).join(' · ') : ''));
  // mẫu khớp ngược chỉ lấy từ bảng server*/engine* — mẫu ngắn của giao diện ("{replace} mới"…) không được nuốt câu server (lỗi thật khi gộp với rel-v020)
  const foreign = [...compiled].filter(k => !Object.entries(tables).some(([f, d]) => /^(server|engine)[\w-]*\.json$/.test(f) && Object.prototype.hasOwnProperty.call(d, k)));
  const note = 'review.shots.c1.notes[0]: ghi chú n1 đã có — kênh ai không được sửa, chỉ thêm ghi chú mới';
  ok(!foreign.length && MSG.en(note) === 'review.shots.c1.notes[0]: ' + L10N.tr('en', 'ghi chú {id} đã có — kênh {by} không được sửa, chỉ thêm ghi chú mới', { id: 'n1', by: 'ai' }), 'mẫu khớp ngược chỉ từ bảng server / engine (' + compiled.size + ' mẫu); "path: câu" không bị mẫu ngắn của giao diện nuốt' + (foreign.length ? ' — mẫu lạ: ' + foreign.slice(0, 3).join(' · ') : ''));
  const lists = ['Item chưa đạt: type: chọn weapon | offhand; rarity: chọn common | rare; equip.part "undefined" không có trong bộ phận ufo (xem get_catalog › slots)'];
  ok(lists.every(s => !VI_RE.test(MSG.en(s))), 'danh sách lỗi nối "; " (path: câu; path: câu mẫu) dịch đủ từng mục: ' + cut(MSG.en(lists[0]), 200));
}

/* ---------------------------------------------------------------- (c) */
console.log('(c) MCP cho agent = tiếng Anh (CNS-067)');
{
  const vt = viInTools(TOOLS);
  ok(TOOLS.length >= 50 && !vt.length, TOOLS.length + ' tool: title / description / tham số / annotations không còn chữ có dấu' + (vt.length ? ' — ' + vt.slice(0, 4).join(' · ') : ''));
  ok(typeof INSTRUCTIONS === 'string' && INSTRUCTIONS.length > 200 && !VI_RE.test(INSTRUCTIONS), 'INSTRUCTIONS (initialize) tiếng Anh');
  ok(/language of the user \/ project/.test(INSTRUCTIONS) && /full diacritics/.test(INSTRUCTIONS), 'INSTRUCTIONS: tên / nhãn theo ngôn ngữ người dùng / dự án, tiếng Việt luôn đủ dấu');
  const sys = [];
  Object.keys(ZONES).forEach(z => ['en', 'vi', ''].forEach(lang => { const s = M0.uiSystem(cleanContext({ zone: z, lang })); if (VI_RE.test(s)) sys.push(z + '/' + (lang || '-')); }));
  ok(!sys.length, 'chỉ dẫn dock (' + Object.keys(ZONES).length + ' khu × en / vi / không lang) tiếng Anh' + (sys.length ? ' — có chữ Việt: ' + sys.join(', ') : ''));
  const wi = ['vi', 'en', 'yue'].map(lang => workInstructions({ id: 'phim-x', project: 'du-an-x', lang }));
  ok(wi.every(s => !VI_RE.test(s)) && /DIALOGUE LANGUAGE of the film: Vietnamese/.test(wi[0]) && /write EVERY "say" in this language/.test(wi[0]), 'chỉ dẫn tác phẩm tiếng Anh; ngôn ngữ LỜI THOẠI vẫn theo work.lang');
  const topics = Agent.topics().map(t => t.id), bad = [];
  topics.forEach(id => { const g = Agent.guide(id); if (g) proseVI(g).forEach(l => bad.push(id + ': ' + l.slice(0, 70))); });
  ok(topics.length >= 8 && !bad.length, 'get_guide (' + topics.length + ' chủ đề): lời văn tiếng Anh (ví dụ JSON / bảng thuật ngữ có cột tiếng Việt được phép)' + (bad.length ? ' — ' + bad.slice(0, 4).join(' · ') : ''));
  const r = await M0.callTool('get_work', { id: 'khong-co-that' });
  ok(r.isError && /^\[NOT_FOUND\]/.test(r.content[0].text) && !VI_RE.test(r.content[0].text), 'lỗi MCP gửi agent: mã giữ nguyên + câu tiếng Anh: ' + cut(r.content[0].text, 120));
  const r2 = await MSG.run('vi', () => M0.callTool('save_item', { item: { id: 'x-1', name: 'X', equip: { slot: 'ufo' } } }));
  ok(r2.isError && /^\[VALIDATION_FAILED\]/.test(r2.content[0].text) && !VI_RE.test(r2.content[0].text.split('\n')[0]) && (r2.structuredContent.error.details || []).every(d => !VI_RE.test(d.message)), 'lỗi MCP vẫn tiếng Anh khi yêu cầu nói vi (agent đọc tiếng Anh; path / mã giữ nguyên): ' + cut(r2.content[0].text.split('\n')[0], 160));
}

/* ---------------------------------------------------------------- (e) */
console.log('(e) nhãn engine Studio hiện đều có bản en (liệt kê từ dữ liệu engine)');
{
  const labels = engineLabels(GC), miss = untranslated(labels);
  ok(labels.size > 400 && !miss.length, labels.size + ' nhãn có chữ Việt (âm / nhóm / luật / công thức · vai / tuổi / kiểu / ngôn ngữ / giọng vùng · biểu cảm / hoạt động / tư thế / di chuyển / bộ phận / linh kiện khung · item / cảnh · cổng kiểm) đều có bản en' + (miss.length ? ' — thiếu ' + miss.length + ': ' + miss.slice(0, 6).map(([s, w]) => w + ' ' + cut(s, 50)).join(' · ') : ''));
  // nhãn phía server Studio hiện (dock lấy khu từ GET /api/ai, Kết nối agent lấy phạm vi từ GET /api/oauth): khai báo là dữ liệu, không qua _t → kiểm ở đây
  const srv = [];
  Object.entries(M0.zoneInfo('en')).forEach(([k, z]) => ['label', 'short', 'intro', 'ask'].forEach(f => { if (VI_RE.test(z[f])) srv.push('khu ' + k + '.' + f); }));
  Object.entries(PROVIDERS).forEach(([k, p]) => { if (VI_RE.test(MSG._t(p.label, null, 'en'))) srv.push('nhà cung cấp ' + k); });
  SCOPES.forEach(id => ['label', 'desc'].forEach(f => { if (VI_RE.test(MSG._t(SCOPE_INFO[id][f], null, 'en'))) srv.push('phạm vi ' + id + '.' + f); }));
  ok(!srv.length, 'nhãn server Studio hiện (' + Object.keys(ZONES).length + ' khu dock × nhãn / vai / lời giới thiệu / gợi ý, ' + Object.keys(PROVIDERS).length + ' nhà cung cấp AI, ' + SCOPES.length + ' phạm vi OAuth) có bản en' + (srv.length ? ' — thiếu: ' + srv.join(', ') : ''));
  const ed = tables['engine-data.json'] || {};
  ok(Object.keys(ed).filter(k => k.slice(0, 2) !== '//').length > 900, 'bảng locales/en/engine-data.json có mặt (' + Object.keys(ed).length + ' khoá) — Studio nạp shard "engine-data"');
  // Studio (lsGuideSteps) tìm mục theo tiêu đề "## Quy trình ghép" rồi bóc "n. " — phần chữ còn lại phải dịch được (khớp nguyên văn / khớp ngược mẫu)
  const steps = []; let on = false;
  GC.sounds.guide().split('\n').forEach(l => { if (/^## /.test(l)) on = /^## Quy trình ghép/.test(l); else if (on && /^\d+\.\s/.test(l)) steps.push(l.replace(/^\d+\.\s*/, '')); });
  const smiss = steps.filter(x => VI_RE.test(MSG.en(x)));
  ok(steps.length === 5 && !smiss.length, 'GC.sounds.guide(): mục "## Quy trình ghép" (tiêu đề giữ nguyên chữ cho Studio) có ' + steps.length + ' bước, số thứ tự nằm NGOÀI msgid — phần chữ dịch được' + (smiss.length ? ' — thiếu: ' + smiss.slice(0, 2).map(x => cut(x, 70)).join(' · ') : ''));
}

/* ---------------------------------------------------------------- (f) */
console.log('(f) context.lang của dock → AI trả lời đúng ngôn ngữ giao diện');
{
  ok(cleanContext({ zone: 'xuong', lang: 'vi' }).lang === 'vi' && cleanContext({ lang: 'en' }).lang === 'en' && cleanContext({ lang: 'fr' }).lang === '' && cleanContext({ lang: 'vi"><script>' }).lang === '' && cleanContext({}).lang === '', 'cleanContext giữ lang khi là "en" | "vi", giá trị lạ → rỗng');
  const sv = M0.uiSystem(cleanContext({ zone: 'xuong', lang: 'vi' })), se = M0.uiSystem(cleanContext({ zone: 'xuong', lang: 'en' })), s0 = M0.uiSystem(cleanContext({ zone: 'xuong' }));
  ok(/REPLY LANGUAGE: the user's interface is in Vietnamese/.test(sv) && /full diacritics/.test(sv) && /interface is in English/.test(se) && /interface is in English/.test(s0), 'uiSystem: lang vi → dặn trả lời tiếng Việt (đủ dấu); en / không có → tiếng Anh (mặc định ADR 0007)');
  const sh = await MSG.run('vi', () => M0.uiSystem(cleanContext({ zone: 'tao-tac' })));
  ok(/interface is in Vietnamese/.test(sh), 'không có context.lang → theo ngôn ngữ của yêu cầu (X-GC-Lang / Accept-Language qua MSG.run)');
  ok(Object.keys(ZONES).every(z => M0.uiSystem({ zone: z, lang: 'vi' }).length - M0.uiSystem({ zone: z, lang: 'en' }).length < 80), 'dòng dặn ngôn ngữ ngắn (chỉ dẫn hai ngôn ngữ chênh < 80 ký tự)');
}

/* ---------------------------------------------------------------- server thật: (b) + (d) */
const OWNER = 'owner-' + crypto.randomBytes(8).toString('hex'), PUB = 'https://chibi.example.test', CB = 'https://claude.ai/api/mcp/auth_callback';
const kids = [];
process.on('exit', () => kids.forEach(c => { try { c.kill(); } catch (e) { /* đã tắt */ } }));
async function boot(port, env) {
  const home = mkdtempSync(path.join(tmpdir(), 'gc-i18nsrv-'));
  const c = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: { ...process.env, GC_HOME: home, GC_PORT: String(port), GC_NO_AUTOCHECK: '1', GC_LANG: '', ...env }, stdio: 'ignore' });
  kids.push(c);
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/health')).ok) return base; } catch (e) { /* chưa lên */ } await new Promise(r => setTimeout(r, 200)); }
  throw new Error('server không lên ở cổng ' + port);
}
const VARIANTS = [['không header', {}, 'en'], ['X-GC-Lang: vi', { 'X-GC-Lang': 'vi' }, 'vi'], ['Accept-Language: vi-VN', { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.5' }, 'vi']];
const isLang = (s, L) => typeof s === 'string' && s.length > 0 && (L === 'vi' ? VI_RE.test(s) : !VI_RE.test(s));
// lỗi điển hình theo người gọi — trả { tên: [đạt?, chi tiết, cần hook?] } (dùng lại ở rào ngược với máy mặc định vi)
async function typical(base, hd, L) {
  const own = { Authorization: 'Bearer ' + OWNER, 'X-GC-Request': '1', 'Content-Type': 'application/json', ...hd }, j = r => r.json(), out = {};
  let r = await fetch(base + '/api/works/khong-co-that', { headers: own }), b = await j(r);
  out['404 tác phẩm'] = [r.status === 404 && b.error === L10N.tr(L, 'không có tác phẩm này'), b.error, false];
  r = await fetch(base + '/api/items', { method: 'POST', headers: own, body: JSON.stringify({ item: { id: 'x-1', name: 'X', equip: { slot: 'ufo' } } }) }); b = await j(r);
  out['422 cổng kiểm item'] = [r.status === 422 && isLang(b.error, L) && Array.isArray(b.errors) && b.errors.length >= 2 && b.errors.every(e => isLang(e, L)), b.error, true];
  r = await fetch(base + '/api/works', { headers: { 'X-GC-Request': '1', ...hd } }); b = await j(r);
  out['401 thiếu token'] = [r.status === 401 && b.error === L10N.tr(L, 'cần token của bản cài'), b.error, false];
  r = await fetch(base + '/api/works', { method: 'POST', headers: { ...own, Origin: 'http://evil.example' }, body: '{}' }); b = await j(r);
  out['403 Origin lạ'] = [r.status === 403 && (L === 'vi' ? /^yêu cầu từ nguồn lạ bị chặn/ : /^request from an unknown origin blocked/).test(b.error || ''), b.error, true];
  r = await fetch(base + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...hd }, body: 'grant_type=authorization_code&code=x&client_id=khong-co' }); b = await j(r);
  out['OAuth JSON (máy) luôn tiếng Anh'] = [r.status >= 400 && /^[a-z_]+$/.test(b.error) && isLang(b.error_description, 'en'), b.error_description, false];
  r = await fetch(base + '/api/oauth', { headers: own }); b = await j(r);
  const want = SCOPES.map(id => L10N.tr(L, SCOPE_INFO[id].label));
  out['nhãn phạm vi OAuth (Studio)'] = [Array.isArray(b.scopes) && JSON.stringify(b.scopes.map(s => s.label)) === JSON.stringify(want), JSON.stringify(b.scopes && b.scopes.map(s => s.label)), true];
  r = await fetch(base + '/api/ai', { headers: own }); b = await j(r);
  out['nhãn khu dock (GET /api/ai)'] = [b.zones && b.zones.khung.label === L10N.tr(L, 'Bộ khung') && isLang(b.zones['thu-vien'].intro, L), b.zones && b.zones.khung.label, true];
  r = await fetch(base + '/oauth/authorize?client_id=khong-co&response_type=code', { headers: hd }); const t = await r.text();
  out['trang lỗi Cấp phép'] = [r.status === 400 && t.includes('<html lang="' + L + '"') && t.includes(L10N.tr(L, 'Không cấp phép được')), (/<h1[^>]*>([^<]*)/.exec(t) || [])[1], L === 'vi'];
  return out;
}

console.log('(b) HTTP theo người gọi: không header → en · X-GC-Lang / Accept-Language vi → vi');
const base = await boot(7631, { GC_API_TOKEN: OWNER, GC_PUBLIC_URL: PUB, GC_ALLOWED_HOSTS: 'chibi.example.test' });
for (const [name, hd, L] of VARIANTS) {
  const res = await typical(base, hd, L);
  Object.entries(res).forEach(([k, [c, detail, hook]]) => (hook ? okH : ok)(c, name + ' → ' + L + ': ' + k + ' — ' + cut(detail, 140)));
}
{
  // MCP qua HTTP: agent luôn đọc tiếng Anh, kể cả khi header nói vi (tool, lỗi)
  const rpc = (method, params, hd) => fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + OWNER, ...hd }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(r => r.json());
  const vi = { 'Accept-Language': 'vi-VN', 'X-GC-Lang': 'vi' };
  const tl = await rpc('tools/list', {}, vi), ce = await rpc('tools/call', { name: 'get_work', arguments: { id: 'khong-co-that' } }, vi), init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } }, vi);
  ok(tl.result && tl.result.tools.length >= 50 && !viInTools(tl.result.tools).length, 'MCP HTTP tools/list với header vi: mô tả tool vẫn tiếng Anh');
  ok(ce.result && ce.result.isError && /^\[NOT_FOUND\]/.test(ce.result.content[0].text) && !VI_RE.test(ce.result.content[0].text), 'MCP HTTP lỗi tool với header vi: tiếng Anh + mã giữ nguyên: ' + cut(ce.result && ce.result.content[0].text, 100));
  ok(init.result && !VI_RE.test(init.result.instructions || '') && !VI_RE.test(JSON.stringify(init.result.serverInfo || {})), 'MCP initialize: instructions + serverInfo tiếng Anh');
}

console.log('(d) trang Cấp phép: en mặc định, vi theo Accept-Language');
{
  const reg = await fetch(base + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CB] }) }).then(r => r.json());
  const q = () => new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: CB, code_challenge: crypto.randomBytes(32).toString('base64url'), code_challenge_method: 'S256', state: 'st', resource: PUB + '/mcp' });
  for (const [name, hd, L] of [['không header', {}, 'en'], ['Accept-Language: vi-VN', { 'Accept-Language': 'vi-VN,vi;q=0.9' }, 'vi'], ['Accept-Language: en-US', { 'Accept-Language': 'en-US,en;q=0.9' }, 'en']]) {
    const r = await fetch(base + '/oauth/authorize?' + q(), { headers: hd }), t = await r.text();
    const data = (/<script type="application\/json" id="gc-data">([\s\S]*?)<\/script>/.exec(t) || [])[1] || '';
    const c = r.status === 200 && t.includes('<html lang="' + L + '"') && t.includes(L10N.tr(L, 'Cấp phép kết nối agent')) && data.includes(JSON.stringify(L10N.tr(L, SCOPE_INFO['mcp:read'].label)).slice(1, -1));
    (L === 'vi' ? okH : ok)(c, name + ' → trang đồng ý ' + L + ' (tiêu đề, <html lang>, nhãn phạm vi): ' + cut((/<h1[^>]*>([^<]*)/.exec(t) || [])[1], 60));
  }
}

/* ---------------------------------------------------------------- (g) rào ngược */
let viBase;   // máy mặc định vi — dựng ở (g), dùng lại ở (h)
console.log('(g) rào ngược: phép kiểm đỏ khi bỏ bản dịch / chèn chữ Việt / đổi mặc định');
{
  // 1) bỏ một bản dịch nhãn engine (bản dịch rỗng = coi như thiếu) → (e) phải bắt được, rồi trả lại
  // (I18N.add bỏ qua bản dịch rỗng → "bỏ" = đặt bản en trùng msgid tiếng Việt: người dùng thấy y như thiếu bản dịch)
  const key = GC.sounds.CATS[0][1], keep = tables['engine-data.json'][key];
  L10N.I18N.add('en', { [key]: key });
  const missAfter = untranslated(engineLabels(GC)).map(([s]) => s);
  L10N.I18N.add('en', { [key]: keep });
  ok(missAfter.length === 1 && missAfter[0] === key && !untranslated(engineLabels(GC)).length, 'bỏ bản dịch "' + key + '" → kiểm (e) đỏ đúng nhãn đó; trả lại → xanh');
  // 2) bỏ bản dịch một MẪU → khớp ngược (a) phải đỏ
  const tk = 'gói động tác {id} là gói dùng chung — qua link MCP / AI chatroom không được ghi đè gói dùng chung', tkeep = tables['server-msg.json'][tk];
  L10N.I18N.add('en', { [tk]: tk });
  const rtBad = roundTrip().bad;
  L10N.I18N.add('en', { [tk]: tkeep });
  ok(tkeep && rtBad.length === 1 && rtBad[0].indexOf(tk) >= 0 && !roundTrip().bad.length, 'bỏ bản dịch của một mẫu → kiểm khớp ngược (a) đỏ đúng mẫu đó; trả lại → xanh');
  // 3) chèn chữ Việt vào mô tả một tool → (c) phải bắt được
  const evil = TOOLS.map(t => t.name === 'get_work' ? Object.assign({}, t, { description: t.description + ' Trả về tác phẩm.' }) : t);
  const evil2 = TOOLS.map(t => t.name === 'save_shot' ? Object.assign({}, t, { inputSchema: { type: 'object', properties: { work: { type: 'string', description: 'mã tác phẩm' } } } }) : t);
  ok(viInTools(evil).length === 1 && viInTools(evil2).length === 1 && !viInTools(TOOLS).length, 'chèn chữ Việt vào description / mô tả tham số của một tool → kiểm (c) đỏ');
  // 4) đổi mặc định của máy sang vi (GC_LANG=vi) → lời đáp "không header" thành tiếng Việt → các kiểm "không header → en" phải đỏ
  viBase = await boot(7632, { GC_API_TOKEN: OWNER, GC_PUBLIC_URL: PUB, GC_ALLOWED_HOSTS: 'chibi.example.test', GC_LANG: 'vi' });
  const res = await typical(viBase, {}, 'en'), red = Object.entries(res).filter(([k, [c, , hook]]) => !c && (!hook || HOOKED)).map(([k]) => k);
  ok(red.includes('404 tác phẩm') && red.includes('401 thiếu token') && !red.includes('OAuth JSON (máy) luôn tiếng Anh'), 'máy đặt mặc định vi → kiểm "không header → en" đỏ (' + red.join(', ') + '); OAuth JSON cho máy vẫn tiếng Anh');
  const back = await typical(viBase, { 'X-GC-Lang': 'en' }, 'en');
  ok(back['404 tác phẩm'][0] && back['401 thiếu token'][0], 'máy mặc định vi + X-GC-Lang: en → vẫn tiếng Anh (lựa chọn của người dùng thắng mặc định máy)');
}

/* ---------------------------------------------------------------- (h) review bảo mật v0.20 */
console.log('(h) dịch câu không bao giờ chặn event loop · id giữ nguyên chữ · đường của máy luôn tiếng Anh · error_description ASCII');
{
  // 1) payload của review (regex lười nối nhau O(n⁴) + "nhãn (chi tiết)" O(n²)): trước khi sửa 2,2 KB = 0,3 s · 4,4 KB = 4,3 s · 200 KB = 7,8 s
  const ms = s => { const t = process.hrtime.bigint(); MSG.en(s); return Number(process.hrtime.bigint() - t) / 1e6; };
  const P = { 'mẫu rỗng đầu 2,2 KB': ' hạt · diễn viên ≤ ' + '/ đạo cụ · '.repeat(200), 'mẫu rỗng đầu 4,4 KB': ' hạt · diễn viên ≤ ' + '/ đạo cụ · '.repeat(400),
    'mẫu sát trần 1,9 KB': ' hạt · diễn viên ≤ ' + '/ đạo cụ · '.repeat(170), '"nhãn (chi tiết)" 1,9 KB': 'ạ (x, y; z) '.repeat(160),
    '"nhãn (chi tiết)" 200 KB': 'ạ (x, y; z) '.repeat(16000), 'danh sách "; " 1,9 KB': 'Không có tác phẩm a; '.repeat(90) };
  const slow = Object.entries(P).map(([k, v]) => [k, Math.max(ms(v), ms(v))]).filter(([, t]) => t > 50);
  ok(!slow.length, 'payload ReDoS của review đều < 50 ms mỗi câu' + (slow.length ? ': ' + JSON.stringify(slow) : ''));
  // mọi mẫu, giá trị dựng từ chính chữ cố định của mẫu lặp lại (kiểu đầu vào khiến khớp phải lùi nhiều nhất), sát trần độ dài
  let worst = 0, wk = '';
  MSG.M.templates('en').forEach(k => {
    const lits = k.split(/\{[A-Za-z0-9_]+\}/), f = lits.filter(Boolean).join('ạ ').repeat(1 + Math.floor(1900 / Math.max(1, lits.join('').length))).slice(0, 1990);
    [f, lits[0] + f, f + lits[lits.length - 1], lits[0] + f + 'x'].forEach(v => { const t = ms(v); if (t > worst) { worst = t; wk = k; } });
  });
  ok(worst < 50, 'mọi mẫu × 4 đầu vào bất lợi sát trần: chậm nhất ' + worst.toFixed(1) + ' ms (< 50) — ' + cut(wk, 60));
  // 2) giá trị id giữ nguyên chữ (trước: "007" → 7, id 23 chữ số → 1.23e+22, "-0" → 0)
  const k1 = Object.keys(tables['server-msg.json']).find(k => /\{id\}/.test(k) && (k.match(/\{/g) || []).length === 1 && VI_RE.test(k));
  const keepId = ['007', '12345678901234567890123', '-0'].every(id => { const out = MSG.en(L10N.tr('vi', k1, { id })); return out === L10N.tr('en', k1, { id }) && out.includes(id); });
  ok(k1 && keepId, 'id "007" / 23 chữ số / "-0" trong câu lỗi giữ nguyên chữ — mẫu ' + cut(k1, 60));
  // 3) việc nền tạo trong request (timer tự kiểm phiên bản) không kế thừa ngôn ngữ của request
  ok(MSG.run('en', () => MSG.exit(() => MSG.srcLang())) === 'vi' && MSG.run('en', () => MSG.srcLang()) === 'en', 'MSG.exit: timer tạo trong request không giữ ngôn ngữ của request');
  // 4) máy mặc định vi (viBase, GC_LANG=vi), agent không gửi header ngôn ngữ
  const j = r => r.json().catch(() => ({}));
  let r = await fetch(viBase + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), b = await j(r);
  ok(r.status === 401 && isLang(b.error, 'en'), 'máy mặc định vi: POST /mcp thiếu token → 401 tiếng Anh (hợp đồng agent, CNS-067): ' + cut(b.error, 80));
  r = await fetch(viBase + '/mcp/khoa-sai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); b = await j(r);
  ok(r.status === 404 && isLang(b.error, 'en') && b.error !== 'none', 'link MCP sai khoá → 404 như đường không tồn tại, tiếng Anh: ' + cut(b.error, 60));
  r = await fetch(viBase + '/.well-known/oauth-authorization-server', { method: 'POST' }); b = await j(r);
  ok(r.status === 405 && isLang(b.error, 'en'), 'máy mặc định vi: metadata OAuth sai phương thức → 405 tiếng Anh: ' + cut(b.error, 60));
  r = await fetch(viBase + '/api/works/khong-co-that', { headers: { Authorization: 'Bearer ' + OWNER, 'X-GC-Request': '1' } }); b = await j(r);
  ok(r.status === 404 && isLang(b.error, 'vi'), 'máy mặc định vi: Studio / API người dùng vẫn theo máy (tiếng Việt): ' + cut(b.error, 60));
  const ASCII = /^[\x20-\x21\x23-\x5B\x5D-\x7E]*$/;   // RFC 6749 §5.2: error_description không có " và \ và chữ ngoài ASCII
  const descs = [];
  for (const [ct, body] of [['application/json', '{'], ['application/json', '[1]'], ['application/x-www-form-urlencoded', 'grant_type=authorization_code&code=x&client_id=khong-co']]) {
    r = await fetch(viBase + '/oauth/token', { method: 'POST', headers: { 'Content-Type': ct }, body }); b = await j(r); descs.push(b.error_description);
  }
  r = await fetch(viBase + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [CB], response_types: ['token'] }) }); b = await j(r); descs.push(b.error_description);
  ok(descs.every(d => typeof d === 'string' && d && ASCII.test(d)), 'error_description OAuth chỉ ASCII in được, không " (JSON hỏng · thân không phải object · code sai · response_types): ' + cut(descs.join(' | '), 140));
  // 5) MCP đọc với id 5 KB (đường tấn công của review: 15 s chặn cả server) — trả lời nhanh, /api/health song song không phải chờ
  const big = ' hạt · diễn viên ≤ ' + '/ đạo cụ · '.repeat(450), t0 = Date.now();
  const call = fetch(viBase + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + OWNER },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_work', arguments: { id: 'Không có tác phẩm ' + big } } }) }).then(x => x.json()).then(x => Date.now() - t0);
  const health = fetch(viBase + '/api/health').then(() => Date.now() - t0);
  const [tCall, tHealth] = await Promise.all([call, health]);
  ok(tCall < 2000 && tHealth < 2000, 'MCP get_work với id 5 KB: trả lời sau ' + tCall + ' ms, /api/health song song ' + tHealth + ' ms (trước khi sửa: 15 s)');
}

console.log('   (' + pass + ' kiểm tra đạt' + (pend ? ' · ' + pend + ' chờ hook main.js — Gen gộp hook rồi chạy lại để kiểm nghiêm' : '') + ')');
if (fail) { console.log('   ✗ có kiểm tra đỏ'); process.exit(1); }
process.exit(0);
