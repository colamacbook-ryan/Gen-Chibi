// gen-chibi — kho bí mật cục bộ: API key lưu mã hoá AES-256-GCM, không bao giờ trả về trình duyệt.
// © 2026 Gen Labs — All rights reserved.
// Khoá chủ lấy từ GC_MASTER_KEY (install.sh sinh ngẫu nhiên vào .env). Thiếu thì tự sinh tệp
// data/.master-key (quyền 600) — chỉ dùng cho môi trường dev.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Secrets {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'secrets.enc.json');
    this.key = this.masterKey(dataDir);
  }
  masterKey(dataDir) {
    const env = process.env.GC_MASTER_KEY;
    if (env && env.length >= 32) return crypto.createHash('sha256').update(env).digest();
    const f = path.join(dataDir, '.master-key');
    if (!fs.existsSync(f)) { fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 }); }
    return crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').trim()).digest();
  }
  all() {
    try {
      const box = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const d = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(box.iv, 'base64'));
      d.setAuthTag(Buffer.from(box.tag, 'base64'));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8'));
    } catch { return {}; }
  }
  get(name) { return this.all()[name] || ''; }
  set(name, value) {
    const all = this.all();
    if (value) all[name] = value; else delete all[name];
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(JSON.stringify(all), 'utf8'), c.final()]);
    const box = { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(box), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  hint(name) { const v = this.get(name); return v ? v.slice(0, 4) + '…' + v.slice(-4) : ''; }
}

module.exports = { Secrets };
