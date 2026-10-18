// gen-chibi — lưu trữ cục bộ dùng chung cho API HTTP và MCP: asset có phiên bản, kịch bản sự kiện.
// © 2026 Afi Labs — All rights reserved.
'use strict';
const fs = require('fs');
const path = require('path');

const KEY = /^[a-z0-9]+(\.[a-z0-9-]+)+\/[a-z0-9-]{1,64}$/;
const EVENT_ID = /^[a-z0-9-]{1,80}$/;

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
    this.partDir = path.join(dataDir, 'parts');
    this.itemDir = path.join(dataDir, 'items');
    this.sceneDir = path.join(dataDir, 'scenes');
    this.projectFile = path.join(dataDir, 'projects.json');
    [this.assetDir, this.verDir, this.trashDir, this.eventDir, this.partDir, this.itemDir, this.sceneDir].forEach(d => fs.mkdirSync(d, { recursive: true }));
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
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(def.id)) throw Object.assign(new Error('id ' + kind + ' không hợp lệ'), { code: 400 });
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
  // dự án chủ đề: một tệp projects.json (ít, đọc cả cụm) — asset trỏ tới bằng trường project
  listProjects() { return readJSON(this.projectFile, []); }
  saveProject(p) {
    if (!p || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(p.id || ''))) throw Object.assign(new Error('id dự án: chữ thường, số, gạch nối, ≤ 40 ký tự'), { code: 400 });
    const name = String(p.name || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40);
    if (!name) throw Object.assign(new Error('dự án cần tên'), { code: 400 });
    const list = this.listProjects(), old = list.find(x => x.id === p.id);
    const rec = { id: p.id, name, description: String(p.description || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 300), createdAt: old ? old.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (!old && list.length >= 200) throw Object.assign(new Error('tối đa 200 dự án'), { code: 400 });
    writeJSON(this.projectFile, old ? list.map(x => x.id === p.id ? rec : x) : list.concat(rec));
    return rec;
  }
  listEvents() {
    return fs.readdirSync(this.eventDir).filter(f => f.endsWith('.json')).map(f => {
      const e = readJSON(path.join(this.eventDir, f), null);
      return e && { id: e.id, title: e.event && e.event.title, steps: e.event && e.event.steps ? e.event.steps.length : 0, author: e.author || '', savedAt: e.savedAt };
    }).filter(Boolean).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }
  getEvent(id) { return EVENT_ID.test(id) ? readJSON(path.join(this.eventDir, id + '.json'), null) : null; }
  saveEvent(event, author) {
    const id = slug(event.title) + '-' + Date.now().toString(36);
    const rec = { id, event, author: String(author || '').slice(0, 80), savedAt: new Date().toISOString() };
    writeJSON(path.join(this.eventDir, id + '.json'), rec);
    return rec;
  }
}

module.exports = { Store, KEY, EVENT_ID, readJSON, writeJSON };
