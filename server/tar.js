// gen-chibi — giải nén .tar.gz tối giản (ustar + pax), không phụ thuộc thư viện ngoài.
// © 2026 Afi Labs — All rights reserved.
// Chỉ nhận file thường và thư mục; chặn đường dẫn tuyệt đối, "..", symlink, hardlink.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function cstr(buf, start, len) {
  const s = buf.subarray(start, start + len);
  const z = s.indexOf(0);
  return s.subarray(0, z < 0 ? s.length : z).toString('utf8');
}
function octal(buf, start, len) {
  const s = cstr(buf, start, len).trim();
  return s ? parseInt(s, 8) : 0;
}
function parsePax(data) {
  const out = {};
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    if (sp < 0) break;
    const len = parseInt(data.subarray(i, sp).toString('utf8'), 10);
    if (!len) break;
    const rec = data.subarray(sp + 1, i + len - 1).toString('utf8');
    const eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

// stripTop: bỏ thư mục gốc trong tarball (vd "gen-chibi-v0.1.0/")
function extractTarGz(file, dest, { stripTop = true } = {}) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  const root = path.resolve(dest);
  let off = 0, pax = null, files = 0;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every(b => b === 0)) break;
    let name = cstr(h, 0, 100);
    const size = octal(h, 124, 12);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = cstr(h, 345, 155);
    if (prefix) name = prefix + '/' + name;
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'g') continue;                       // pax toàn cục (git archive ghi commit id)
    if (type === 'x') { pax = parsePax(body); continue; }
    if (pax && pax.path) name = pax.path;
    pax = null;
    let rel = name.replace(/\\/g, '/');
    if (stripTop) rel = rel.split('/').slice(1).join('/');
    if (!rel) continue;
    if (rel.startsWith('/') || rel.split('/').includes('..')) throw new Error('đường dẫn không an toàn trong gói: ' + name);
    const target = path.resolve(root, rel);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('đường dẫn thoát khỏi thư mục đích: ' + name);
    if (type === '5') { fs.mkdirSync(target, { recursive: true }); continue; }
    if (type !== '0' && type !== '\0' && type !== '7') throw new Error('loại mục không hỗ trợ (' + type + '): ' + name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    const mode = octal(h, 100, 8);
    if (mode & 0o111) fs.chmodSync(target, 0o755);
    files++;
  }
  return files;
}

module.exports = { extractTarGz };
