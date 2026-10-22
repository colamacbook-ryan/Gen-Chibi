// gen-chibi — lưu trữ cục bộ dùng chung cho API HTTP và MCP: asset có phiên bản, kịch bản sự kiện.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const { tr } = require('./i18n');   // tr('vi', mẫu, biến): điền biến vào msgid — câu vẫn tiếng Việt như cũ, dịch ở rìa (ADR 0007)
const fs = require('fs');
const path = require('path');

const KEY = /^[a-z0-9]+(\.[a-z0-9-]+)+\/[a-z0-9-]{1,64}$/;
const EVENT_ID = /^[a-z0-9-]{1,80}$/;
const CHAT_KINDS = ['work', 'asset', 'project', 'khu'];   // luồng chat của trợ lý AI theo đối tượng
const CHAT_ID = /^[a-z0-9][a-z0-9._~-]{0,80}$/;
const CHAT_MAX = 60, CHAT_MSG_MAX = 6000, CHAT_BYTES = 200 * 1024;   // trần: số tin · ký tự một tin · kích thước tệp

function readJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }
function writeJSON(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); }
function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'kich-ban';
}

class Store {
  constructor(dataDir) {
    this.assetDir = path.join(dataDir, 'assets');
    this.verDir = path.join(dataDir, 'versions');
    this.trashDir = path.join(dataDir, 'trash');
    this.eventDir = path.join(dataDir, 'events');
    this.workMigrate = null;   // setWorkMigration
    this.partDir = path.join(dataDir, 'parts');
    this.itemDir = path.join(dataDir, 'items');
    this.sceneDir = path.join(dataDir, 'scenes');
    this.motionDir = path.join(dataDir, 'motionpacks');
    this.soundDir = path.join(dataDir, 'soundpacks');
    this.projectFile = path.join(dataDir, 'projects.json');
    this.provFile = path.join(dataDir, 'provenance.json');
    this.workDir = path.join(dataDir, 'works');
    this.chatDir = path.join(dataDir, 'chats');
    fs.mkdirSync(this.workDir, { recursive: true });
    [this.assetDir, this.verDir, this.trashDir, this.eventDir, this.partDir, this.itemDir, this.sceneDir, this.motionDir, this.soundDir, this.chatDir].forEach(d => fs.mkdirSync(d, { recursive: true }));
  }
  fileOf(key) { return key.replace('/', '~'); }
  listAssets() {
    return fs.readdirSync(this.assetDir).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(this.assetDir, f), null)).filter(Boolean);
  }
  getAsset(key) { return readJSON(path.join(this.assetDir, this.fileOf(key) + '.json'), null); }
  saveAsset(key, a, note) {
    if (!KEY.test(key)) throw Object.assign(new Error('khoá asset không hợp lệ (dạng thu-vien.ten/ma-nhan-vat)'), { code: 400 });
    if (!a || typeof a !== 'object' || !a.look || typeof a.look !== 'object') throw Object.assign(new Error('asset phải có "look"'), { code: 400 });
    const vdir = path.join(this.verDir, this.fileOf(key));
    fs.mkdirSync(vdir, { recursive: true });
    const n = fs.readdirSync(vdir).filter(f => /^\d+\.json$/.test(f)).map(f => +f.slice(0, -5)).reduce((m, x) => Math.max(m, x), 0) + 1;
    const [pack, id] = key.split('/');
    const rec = Object.assign({}, a, { pack, id, key, version: n, savedAt: new Date().toISOString() });
    delete rec._note;
    writeJSON(path.join(vdir, n + '.json'), Object.assign({ _note: String(note || '').slice(0, 200) }, rec));
    writeJSON(path.join(this.assetDir, this.fileOf(key) + '.json'), rec);
    return rec;
  }
  versionsOf(key) {
    const vdir = path.join(this.verDir, this.fileOf(key));
    if (!fs.existsSync(vdir)) return [];
    return fs.readdirSync(vdir).filter(f => /^\d+\.json$/.test(f)).map(f => {
      const v = readJSON(path.join(vdir, f), {});
      return { version: v.version, savedAt: v.savedAt, note: v._note || '', status: v.status || '' };
    }).sort((x, y) => y.version - x.version);
  }
  version(key, n) { return readJSON(path.join(this.verDir, this.fileOf(key), n + '.json'), null); }
  trashAsset(key) {
    const file = path.join(this.assetDir, this.fileOf(key) + '.json');
    if (!fs.existsSync(file)) return false;
    fs.renameSync(file, path.join(this.trashDir, this.fileOf(key) + '-' + Date.now() + '.json'));
    return true;
  }
  // linh kiện dữ liệu (đã qua engine.checkDataPart): <slot>~<id>.json, giữ các bản cũ trong versions/parts
  listParts() {
    return fs.readdirSync(this.partDir).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(this.partDir, f), null)).filter(Boolean);
  }
  savePart(def, note) {
    if (!/^[a-zA-Z]{1,12}$/.test(def.slot) || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(def.id)) throw Object.assign(new Error('slot/id không hợp lệ'), { code: 400 });
    const name = def.slot + '~' + def.id, file = path.join(this.partDir, name + '.json');
    const old = readJSON(file, null);
    const rec = Object.assign({}, def, { version: old ? (old.version || 1) + 1 : 1, savedAt: new Date().toISOString(), note: String(note || '').slice(0, 200) });
    if (old) writeJSON(path.join(this.verDir, 'parts~' + name, old.version + '.json'), old);
    writeJSON(file, rec);
    return rec;
  }
  // asset dạng dữ liệu theo loại (item, cảnh — đã qua engine.check…): <id>.json, giữ bản cũ trong versions/<loại>~<id>
  listKind(dir) {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(dir, f), null)).filter(Boolean);
  }
  saveKind(dir, kind, def, note) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(def.id)) throw Object.assign(new Error(tr('vi', 'id {kind} không hợp lệ', { kind })), { code: 400 });   // msgid tiếng Việt, dịch ở rìa (ADR 0007)
    const file = path.join(dir, def.id + '.json'), old = readJSON(file, null);
    const rec = Object.assign({}, def, { version: old ? (old.version || 1) + 1 : 1, savedAt: new Date().toISOString(), note: String(note || '').slice(0, 200) });
    if (old) writeJSON(path.join(this.verDir, kind + '~' + def.id, old.version + '.json'), old);
    writeJSON(file, rec);
    return rec;
  }
  listItems() { return this.listKind(this.itemDir); }
  saveItem(def, note) { return this.saveKind(this.itemDir, 'items', def, note); }
  listScenes() { return this.listKind(this.sceneDir); }
  saveScene(def, note) { return this.saveKind(this.sceneDir, 'scenes', def, note); }
  // gói động tác (v0.16): tư thế + clip + hành động + màn diễn dạng dữ liệu, đã qua cổng choreo.checkPack
  listMotionPacks() { return this.listKind(this.motionDir); }
  saveMotionPack(def, note) { return this.saveKind(this.motionDir, 'motionpacks', def, note); }
  // gói âm (v0.18, gen-chibi.sound/1): công thức tổng hợp + siêu dữ liệu, đã qua cổng GC.sounds.validateSoundPack; có phiên bản như gói động tác
  listSoundPacks() { return this.listKind(this.soundDir); }
  saveSoundPack(def, note) { return this.saveKind(this.soundDir, 'soundpacks', def, note); }
  // gỡ gói âm: tệp sang thùng rác (không xoá hẳn), lịch sử phiên bản (versions/soundpacks~<id>) giữ nguyên
  trashSoundPack(id) {
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(String(id))) throw Object.assign(new Error('id gói âm không hợp lệ'), { code: 400 });
    const file = path.join(this.soundDir, id + '.json');
    if (!fs.existsSync(file)) return false;
    fs.renameSync(file, path.join(this.trashDir, 'soundpack-' + id + '-' + Date.now() + '.json'));
    return true;
  }
  // dự án chủ đề: một tệp projects.json (ít, đọc cả cụm) — asset trỏ tới bằng trường project
  listProjects() { return readJSON(this.projectFile, []); }
  // opts.sample: { owner, license } — chỉ cổng nhập gói mẫu đặt; sửa tên / mô tả về sau giữ nguyên dấu "bộ mẫu" (không gỡ được qua save_project)
  saveProject(p, opts) {
    if (!p || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(p.id || ''))) throw Object.assign(new Error('id dự án: chữ thường, số, gạch nối, ≤ 40 ký tự'), { code: 400 });
    const name = String(p.name || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40);
    if (!name) throw Object.assign(new Error('dự án cần tên'), { code: 400 });
    const list = this.listProjects(), old = list.find(x => x.id === p.id);
    const rec = { id: p.id, name, description: String(p.description || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 300), createdAt: old ? old.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString() };
    const clean = (t, n) => String(t || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, n);
    const sm = opts && opts.sample ? Object.assign({ owner: clean(opts.sample.owner, 40) || 'Gen Labs', license: clean(opts.sample.license, 200) }, opts.sample.version ? { version: clean(opts.sample.version, 40) } : {}) : old && old.sample;
    if (sm) rec.sample = sm;
    if (!old && list.length >= 200) throw Object.assign(new Error('tối đa 200 dự án'), { code: 400 });
    writeJSON(this.projectFile, old ? list.map(x => x.id === p.id ? rec : x) : list.concat(rec));
    return rec;
  }
  // dấu nguồn gốc BỘ MẪU theo từng mục — "part:<slot>:<id>" | "item:<id>" | "scene:<id>" | "char:<id>" → { owner, license }.
  // Chỉ cổng nhập gói ghi (gói mẫu, hoặc gói sao lưu mang dấu); không có API gỡ: sửa / lưu bản mới vẫn giữ dấu (CNS-022).
  provenance() { return readJSON(this.provFile, {}); }
  markProvenance(keys, mark) {
    const clean = (t, n) => String(t || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, n);
    const m = { owner: clean(mark && mark.owner, 40) || 'Gen Labs', license: clean(mark && mark.license, 200) }, cur = this.provenance();
    let n = 0;
    keys.forEach(k => { if (typeof k === 'string' && k.length <= 160 && /^(part:[a-zA-Z]+|item|scene|char|motion|sound):[a-z0-9-]+$/.test(k) && !cur[k]) { cur[k] = m; n++; } });
    if (n) writeJSON(this.provFile, cur);
    return n;
  }
  // tác phẩm (giai đoạn ③): kịch bản + phân cảnh + chat với AI đạo diễn. works/<id>.json, bản cũ ở versions/works~<id>
  listWorks() {
    return fs.readdirSync(this.workDir).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(this.workDir, f), null)).filter(Boolean)
      .map(w => ({ id: w.id, title: w.title, project: w.project || '', shots: (w.shots || []).length, done: (w.shots || []).filter(s => s.event).length, version: w.version, savedAt: w.savedAt }))
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }
  // chuyển dữ liệu tác phẩm cũ lúc đọc / ghi (MCP đặt theo engine — CNS-065: id đòn khung cũ → id mới). Đọc: chỉ đổi bản trả về, tệp đổi ở lần ghi sau.
  setWorkMigration(fn) { this.workMigrate = typeof fn === 'function' ? fn : null; }
  getWork(id) {
    const w = /^[a-z0-9][a-z0-9-]{0,63}$/.test(String(id)) ? readJSON(path.join(this.workDir, id + '.json'), null) : null;
    if (w && this.workMigrate) this.workMigrate(w);
    return w;
  }
  saveWork(w) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(w.id || ''))) throw Object.assign(new Error('id tác phẩm không hợp lệ'), { code: 400 });
    if (this.workMigrate) this.workMigrate(w);
    const file = path.join(this.workDir, w.id + '.json'), old = readJSON(file, null);
    const rec = Object.assign({}, w, { version: old ? (old.version || 1) + 1 : 1, savedAt: new Date().toISOString() });
    if (old) writeJSON(path.join(this.verDir, 'works~' + w.id, old.version + '.json'), old);
    writeJSON(file, rec);
    return rec;
  }
  // luồng hội thoại của trợ lý AI (dock cột phải) theo ĐỐI TƯỢNG: tác phẩm / asset / dự án / khu — data/chats/<loại>-<id>.json.
  // Có trần số tin + kích thước: luồng dài mãi không phình đĩa và không phình lời gọi LLM. id asset "pack/id" đổi "/" thành "~" (như tên tệp asset).
  chatFile(kind, id) {
    if (CHAT_KINDS.indexOf(kind) < 0 || !CHAT_ID.test(String(id))) return null;
    return path.join(this.chatDir, kind + '-' + id + '.json');
  }
  getChat(kind, id) {
    const f = this.chatFile(kind, id);
    if (!f) return null;
    const c = readJSON(f, null);
    return c && Array.isArray(c.messages) ? c : { kind, id, messages: [], updatedAt: null };
  }
  saveChat(kind, id, messages) {
    const f = this.chatFile(kind, id);
    if (!f) throw Object.assign(new Error('đối tượng hội thoại không hợp lệ'), { code: 400 });
    const clean = m => {
      const o = { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content == null ? '' : m.content).slice(0, CHAT_MSG_MAX), at: typeof m.at === 'string' ? m.at.slice(0, 40) : new Date().toISOString() };
      if (Array.isArray(m.log)) o.log = m.log.slice(0, 30).map(l => ({ tool: String(l.tool || '').slice(0, 60), ok: !!l.ok, summary: String(l.summary || '').slice(0, 200), anchors: Array.isArray(l.anchors) ? l.anchors.slice(0, 6).map(a => ({ anchor: String(a.anchor).slice(0, 200), label: String(a.label || '').slice(0, 80) })) : undefined }));
      if (Array.isArray(m.anchors)) o.anchors = m.anchors.slice(0, 8).map(a => ({ anchor: String(a.anchor).slice(0, 200), label: String(a.label || '').slice(0, 80) }));
      if (Array.isArray(m.pins)) o.pins = m.pins.slice(0, 8).map(a => ({ anchor: String(a.anchor).slice(0, 200), label: String(a.label || '').slice(0, 80) }));
      // token thật của lượt (cộng mọi vòng gọi LLM) gắn vào tin trả lời — nền cho "chi phí theo tin" (CNS-127)
      if (m.usage && typeof m.usage === 'object') { const n = x => (Number.isFinite(x) && x >= 0 ? Math.round(x) : 0); o.usage = { prompt: n(m.usage.prompt), completion: n(m.usage.completion) }; }
      return o;
    };
    let list = (Array.isArray(messages) ? messages : []).filter(m => m && typeof m === 'object').map(clean).slice(-CHAT_MAX);
    const bytes = l => Buffer.byteLength(JSON.stringify({ kind, id, messages: l, updatedAt: '2000-01-01T00:00:00.000Z' }, null, 2));   // kích thước TỆP (có thụt lề như writeJSON) — trần 200 KB là của tệp
    while (list.length > 2 && bytes(list) > CHAT_BYTES) list = list.slice(1);   // quá lớn: bỏ tin cũ nhất trước
    const rec = { kind, id, messages: list, updatedAt: new Date().toISOString() };
    writeJSON(f, rec);
    return rec;
  }
  clearChat(kind, id) {
    const f = this.chatFile(kind, id);
    if (!f || !fs.existsSync(f)) return false;
    fs.unlinkSync(f);
    return true;
  }
  listEvents() {
    return fs.readdirSync(this.eventDir).filter(f => f.endsWith('.json')).map(f => {
      const e = readJSON(path.join(this.eventDir, f), null);
      return e && { id: e.id, title: e.event && e.event.title, steps: e.event && e.event.steps ? e.event.steps.length : 0, author: e.author || '', savedAt: e.savedAt };
    }).filter(Boolean).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }
  getEvent(id) {
    const e = EVENT_ID.test(id) ? readJSON(path.join(this.eventDir, id + '.json'), null) : null;
    if (e && this.workMigrate) this.workMigrate(e);   // { event: { steps } } — cùng luật chuyển với tác phẩm
    return e;
  }
  saveEvent(event, author) {
    const id = slug(event.title) + '-' + Date.now().toString(36);
    const rec = { id, event, author: String(author || '').slice(0, 80), savedAt: new Date().toISOString() };
    if (this.workMigrate) this.workMigrate(rec);
    writeJSON(path.join(this.eventDir, id + '.json'), rec);
    return rec;
  }
}

module.exports = { Store, KEY, EVENT_ID, CHAT_KINDS, CHAT_ID, readJSON, writeJSON };
