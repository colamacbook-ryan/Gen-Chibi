// gen-chibi — hướng dẫn cho agent: MỘT nguồn (agent/GUIDE.md + agent/workflows/*.md + agent/examples/*.json)
// → MCP (start_here, get_guide), HTTP (/api/agent/*), CLI (genchibi agent …) và lớp bọc riêng từng hãng (Claude skill,
// AGENTS.md, GEMINI.md, Cursor rule). Trung lập model (INT-05, Ryan 2026-10-18): văn bản thuần + ví dụ JSON CI chạy thật.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs'), path = require('path');

const SND = require('../engine/sounds.js');   // DOM-free: luật ghép S1–S7 / nhóm / công thức mẫu sinh từ ĐÚNG dữ liệu engine (một nguồn — markdown không chép tay)
const MSG = require('./i18n-msg');   // dữ liệu engine (tiếng Việt) → tiếng Anh cho hướng dẫn agent (bảng locales/en/engine-data.json — ADR 0007)
const DIR = path.join(__dirname, '..', 'agent');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const exists = f => { try { return fs.statSync(path.join(DIR, f)).isFile(); } catch { return false; } };

// chủ đề = tệp agent/workflows/<id>.md; tiêu đề = dòng "# Topic: <id> — <tiêu đề>"
function topics() {
  let files = [];
  try { files = fs.readdirSync(path.join(DIR, 'workflows')).filter(f => f.endsWith('.md')).sort(); } catch { return []; }
  return files.map(f => {
    const id = f.replace(/\.md$/, ''), first = read('workflows/' + f).split('\n')[0];
    const m = /^# Topic: [a-z-]+ — (.+)$/.exec(first);
    return { id, title: m ? m[1] : id };
  });
}
// <!-- generated: sound-rules | sound-cats | sound-recipes --> → văn bản sinh từ engine/sounds.js (luật S1–S7, nhóm âm, công thức ghép mẫu): đổi luật ở engine là hướng dẫn đổi theo
function generated(name) {
  switch (name) {
    case 'sound-rules': return SND.RULES.list.map(r => '- **' + r.code + '** (' + (r.level === 'error' ? 'ERROR — the save is rejected' : 'warning — returned with the result') + '): ' + MSG.en(r.rule)).join('\n');
    case 'sound-cats': return SND.CATS.map(c => '- `' + c[0] + '` — ' + MSG.en(c[1]) + (SND.ACCENT.indexOf(c[0]) >= 0 ? ' (ACCENT group: at most one per step)' : '')).join('\n');
    case 'sound-recipes': return SND.RECIPES.map(r => '- **' + MSG.en(r.label) + '** (`' + r.id + '`): ' + r.seq.map(x => x[0] + ' s `' + x[1] + '`').join(' → ') + ' — ' + MSG.en(r.note)).join('\n');
    default: return null;
  }
}
// thay mỗi <!-- example: x.json --> bằng khối ```json …``` của tệp đó (ví dụ là dữ liệu CI đã chạy qua cổng thật); <!-- generated: … --> bằng văn bản sinh từ engine
function embed(md) {
  return md.replace(/<!-- example: ([a-z0-9-]+\.json) -->/g, (m, f) => exists('examples/' + f)
    ? '`agent/examples/' + f + '`\n\n```json\n' + read('examples/' + f).trim() + '\n```' : m)
    .replace(/<!-- generated: ([a-z-]+) -->/g, (m, k) => { const g = generated(k); return g == null ? m : g; });
}
// topic: '' | 'guide' → hướng dẫn chung; id chủ đề → quy trình + ví dụ; 'all' → tất cả nối lại
function guide(topic) {
  const t = String(topic || 'guide');
  if (t === 'guide') return embed(read('GUIDE.md'));
  if (t === 'all') return [embed(read('GUIDE.md'))].concat(topics().map(x => embed(read('workflows/' + x.id + '.md')))).join('\n\n---\n\n');
  if (!topics().some(x => x.id === t)) return null;
  return embed(read('workflows/' + t + '.md'));
}
function examples() {
  let files = [];
  try { files = fs.readdirSync(path.join(DIR, 'examples')).filter(f => f.endsWith('.json')).sort(); } catch { return {}; }
  return files.reduce((o, f) => (o[f.replace(/\.json$/, '')] = JSON.parse(read('examples/' + f)), o), {});
}
// luật vàng: các mục đánh số của mục 3 trong GUIDE.md — MỘT nguồn luật cho mọi bề mặt (server/rules.js: MCP initialize, start_here, AI chatroom).
// Một luật = dòng đánh số + các dòng thụt lề nối tiếp (trước v0.23.2 chỉ lấy dòng đầu → luật bị cắt giữa câu)
function rules() {
  const s = read('GUIDE.md'), a = s.indexOf('## 3.'), b = s.indexOf('\n## ', a + 4), out = [];
  s.slice(a, b).split('\n').forEach(l => {
    if (/^\d+\. /.test(l)) out.push(l.replace(/^\d+\.\s*/, ''));
    else if (out.length && /^\s+\S/.test(l)) out[out.length - 1] += ' ' + l.trim();
  });
  return out.map(r => r.replace(/\*\*/g, ''));
}

// ---- xuất schema tool cho framework function-calling (agent không có MCP client)
// openai: [{ type: 'function', function: { name, description, parameters } }] · gemini: { functionDeclarations: [...] } (bỏ khoá
// JSON Schema Gemini không nhận) · mcp: nguyên dạng tools/list
// gem: Gemini không nhận type dạng mảng (["object", "null"]) → type đầu tiên khác null + nullable: true
function cleanSchema(s, drop, gem) {
  if (Array.isArray(s)) return s.map(x => cleanSchema(x, drop, gem));
  if (!s || typeof s !== 'object') return s;
  const o = {};
  Object.keys(s).forEach(k => { if (drop.indexOf(k) < 0) o[k] = k === 'type' ? s[k] : cleanSchema(s[k], drop, gem); });
  if (gem && Array.isArray(o.type)) { const t = o.type.filter(x => x !== 'null'); if (t.length < o.type.length) o.nullable = true; o.type = t[0] || 'string'; }
  if (o.type === 'object' && !o.properties) o.properties = {};
  return o;
}
function toolsExport(TOOLS, format) {
  const f = String(format || 'openai');
  if (f === 'mcp') return { tools: TOOLS };
  const desc = t => (t.title ? t.title + ' — ' : '') + t.description;
  if (f === 'openai') return TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: desc(t), parameters: cleanSchema(t.inputSchema, ['$schema']) } }));
  if (f === 'gemini') return { functionDeclarations: TOOLS.map(t => ({ name: t.name, description: desc(t), parameters: cleanSchema(t.inputSchema, ['$schema', 'additionalProperties'], true) })) };
  return null;
}

// ---- lớp bọc từng hãng: cùng nội dung, chỉ khác đầu tệp / vị trí — sinh ra, không viết tay
// từ khoá tiếng Việt ở cuối là CHỦ Ý: người dùng Việt gõ các từ này thì skill vẫn được kích hoạt
const SKILL_DESC = 'Operate gen-chibi, a factory of chibi assets made from code (characters, items, scenes, motion packs, sound packs, films) through its MCP server. Use whenever the user asks to create, edit, check, render, animate, film, add sound effects or export gen-chibi assets, or mentions gen-chibi, Studio, Xưởng, Thư viện, Tạo tác, gói động tác, âm thanh.';
function wrapper(vendor) {
  const all = guide('all'), head = '<!-- generated by `genchibi agent skill` from agent/ — edit agent/GUIDE.md, not this file -->\n';
  switch (String(vendor || '')) {
    case 'claude':   // Claude Code / Agent SDK skill: thư mục skills/gen-chibi/
      return [{ path: 'gen-chibi/SKILL.md', content: '---\nname: gen-chibi\ndescription: ' + SKILL_DESC + '\n---\n' + head + embed(read('GUIDE.md')) + '\n\nDetailed procedures: `references/<topic>.md` (or MCP `get_guide`).\n' }]
        .concat(topics().map(t => ({ path: 'gen-chibi/references/' + t.id + '.md', content: head + guide(t.id) })));
    case 'cursor':
      return [{ path: '.cursor/rules/gen-chibi.mdc', content: '---\ndescription: ' + SKILL_DESC + '\nalwaysApply: false\n---\n' + head + all }];
    case 'gemini':
      return [{ path: 'GEMINI.md', content: head + all }];
    case 'codex': case 'agents': case 'generic':
      return [{ path: 'AGENTS.md', content: head + '# Using gen-chibi (MCP)\n\n' + all }];
    default: return null;
  }
}
const VENDORS = ['claude', 'cursor', 'gemini', 'codex', 'generic'];

module.exports = { topics, guide, examples, rules, toolsExport, wrapper, VENDORS, DIR };
