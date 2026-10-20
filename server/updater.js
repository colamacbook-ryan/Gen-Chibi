// gen-chibi — bộ cập nhật: kiểm GitHub Releases, tải, kiểm SHA-256, giải nén, backup, chuyển phiên bản.
// © 2026 Gen Labs — All rights reserved.
// Không cầm docker.sock: app chỉ đổi con trỏ `current` rồi thoát mã 75; launcher khởi động lại,
// tự kiểm sức khoẻ và rollback nếu bản mới hỏng (STD-06: auto-update + rollback).
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { extractTarGz } = require('./tar');
const { agentFor } = require('./net');
// câu cho người dùng: msgid tiếng Việt, câu ghép = mẫu tr(VI, …) — dịch ở rìa (Studio theo người gọi, MCP sang tiếng Anh) (ADR 0007)
const { VI, tr } = require('./i18n-msg');

const RESTART_CODE = 75;

// edge (v0.21, CNS-170) — cùng hợp đồng với launcher.js ở thư mục cài:
//   bản "có edge" = launcher.js đi kèm bản đó có hằng LAUNCHER_ABI ≥ 2 (đọc bằng regex, không require);
//   máy "đang online" = run/edge-intent.json (app ghi) có tunnel token|quick hoặc online: true.
const EDGE_ABI = 2;
function releaseHasEdge(home, tag) {
  try { const m = /^const LAUNCHER_ABI = (\d+);/m.exec(fs.readFileSync(path.join(home, 'releases', tag, 'launcher.js'), 'utf8')); return !!m && +m[1] >= EDGE_ABI; } catch { return false; }
}
function edgeOnline(home) {
  try { const j = JSON.parse(fs.readFileSync(path.join(home, 'run', 'edge-intent.json'), 'utf8')); return j.tunnel === 'token' || j.tunnel === 'quick' || j.online === true; } catch { return false; }
}

function semver(v) {
  const m = String(v || '').replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  return m ? [+m[1], +m[2], +m[3], m[4] || ''] : null;
}
function newer(a, b) { // a > b ?
  const x = semver(a), y = semver(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  if (x[3] === y[3]) return false;
  if (!x[3]) return true;   // bản chính thức > bản thử cùng số
  if (!y[3]) return false;
  return x[3] > y[3];
}

// token (repo private): chỉ gửi tới đúng host của URL đầu tiên — GitHub chuyển hướng file sang host lưu trữ có chữ ký,
// mang token theo sang đó vừa lộ token vừa bị từ chối. accept: 'json' | 'octet' (tải asset qua API) | mặc định.
function get(url, { json = false, maxBytes = 200 * 1024 * 1024, redirects = 5, token = '', octet = false } = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const headers = { 'User-Agent': 'gen-chibi-updater', Accept: json ? 'application/vnd.github+json' : octet ? 'application/octet-stream' : '*/*' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = mod.get(url, { agent: agentFor(url), headers, timeout: 30000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url);
        const sameHost = next.host === new URL(url).host;
        return resolve(get(next.toString(), { json, maxBytes, redirects: redirects - 1, token: sameHost ? token : '', octet: sameHost && octet }));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(tr(VI, 'HTTP {code} khi tải {url}', { code: res.statusCode, url }))); }
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n > maxBytes) { req.destroy(); reject(new Error('tệp quá lớn')); } else chunks.push(c); });
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (!json) return resolve(buf);
        try { resolve(JSON.parse(buf.toString('utf8'))); } catch (e) { reject(new Error('phản hồi không phải JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('hết thời gian chờ mạng')));
    req.on('error', reject);
  });
}

function latestTagByRedirect(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: agentFor(url), headers: { 'User-Agent': 'gen-chibi-updater' }, timeout: 30000 }, res => {
      res.resume();
      const m = /\/releases\/tag\/(v[^/?#]+)/.exec(res.headers.location || '');
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && m) resolve(decodeURIComponent(m[1]));
      else reject(new Error(tr(VI, 'không đọc được bản mới nhất (HTTP {code})', { code: res.statusCode })));
    });
    req.on('timeout', () => req.destroy(new Error('hết thời gian chờ mạng')));
    req.on('error', reject);
  });
}

class Updater {
  // token: GC_GITHUB_TOKEN (fine-grained, chỉ quyền đọc Contents của repo) — cần khi repo phát hành là private
  constructor({ home, version, repo, feedUrl, log, token }) {
    this.home = home;
    this.version = version;
    this.repo = repo;
    this.token = token || '';
    this.apiFeed = !feedUrl;
    this.feedUrl = feedUrl || `https://api.github.com/repos/${repo}/releases/latest`;
    this.log = log || console.log;
    this.dataDir = path.join(home, 'data');
    this.stateFile = path.join(this.dataDir, 'update-state.json');
    this.historyFile = path.join(this.dataDir, 'update-history.json');
    this.busy = false;
    this.skipFile = path.join(this.dataDir, 'update-skip.json');
    this.state = this.read(this.stateFile, {});
    this.state.current = version;
    // trạng thái đọc lại sau khi khởi động: tính lại "có bản mới" theo phiên bản đang chạy
    this.state.available = !!this.state.latest && newer(this.state.latest, version) && !this.skipped(this.state.latest);
  }
  skipped(tag) { return this.read(this.skipFile, []).indexOf(tag) >= 0; }
  read(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }
  write(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); }
  history() { return this.read(this.historyFile, []); }
  addHistory(e) { const h = this.history(); h.unshift(Object.assign({ at: new Date().toISOString() }, e)); this.write(this.historyFile, h.slice(0, 50)); }

  status() {
    const releases = this.listReleases();
    const prev = this.target('previous');
    return Object.assign({}, this.state, {
      current: this.version, busy: this.busy, history: this.history(),
      canRollback: !!prev, previous: prev, installed: releases,
      // rollback tay vẫn được, nhưng bản cũ không có edge → máy đang online sẽ offline: Studio cảnh báo TRƯỚC khi bấm
      rollbackOffline: !!prev && edgeOnline(this.home) && !releaseHasEdge(this.home, prev)
    });
  }
  target(link) {
    try { return path.basename(fs.readlinkSync(path.join(this.home, link))); } catch { return null; }
  }
  listReleases() {
    try { return fs.readdirSync(path.join(this.home, 'releases')).filter(d => /^v\d/.test(d)).sort(); } catch { return []; }
  }

  // API GitHub giới hạn 60 lượt/giờ cho mỗi IP (mạng dùng chung IP hay hết lượt): khi bị từ chối thì đọc tag
  // mới nhất từ chuyển hướng của trang /releases/latest và dựng link tải theo quy ước tên gói. Checksum vẫn kiểm như cũ.
  async feed() {
    try { return await get(this.feedUrl, { json: true, maxBytes: 2 * 1024 * 1024, token: this.token }); }
    catch (e) {
      if (!this.apiFeed) throw e;
      // repo private: trang công khai cũng 404 — báo rõ thay vì đoán
      if (this.token || /HTTP 404/.test(e.message)) throw new Error(this.token ? tr(VI, 'GitHub từ chối token ({error}) — kiểm GC_GITHUB_TOKEN còn hạn và có quyền đọc repo {repo}', { error: e.message, repo: this.repo }) : tr(VI, 'Không thấy bản phát hành ({error}). Repo private: thêm GC_GITHUB_TOKEN vào .env.', { error: e.message }));
      const tag = await latestTagByRedirect('https://github.com/' + this.repo + '/releases/latest');
      const base = 'https://github.com/' + this.repo + '/releases/download/' + tag + '/';
      return { tag_name: tag, body: 'Release notes: https://github.com/' + this.repo + '/releases/tag/' + tag, published_at: null,
        assets: [{ name: 'gen-chibi-' + tag + '.tar.gz', browser_download_url: base + 'gen-chibi-' + tag + '.tar.gz' }, { name: 'SHA256SUMS', browser_download_url: base + 'SHA256SUMS' }] };
    }
  }

  async check() {
    const r = await this.feed();
    const tag = r.tag_name;
    if (!semver(tag)) throw new Error('bản phát hành không có số hiệu hợp lệ');
    const tar = (r.assets || []).find(a => /\.tar\.gz$/.test(a.name));
    const sums = (r.assets || []).find(a => a.name === 'SHA256SUMS');
    this.state = Object.assign(this.state, {
      latest: tag, notes: String(r.body || '').slice(0, 20000), publishedAt: r.published_at || null,
      lastCheck: new Date().toISOString(), skipped: this.skipped(tag),
      available: newer(tag, this.version) && !!tar && !!sums && !this.skipped(tag),
      newer: newer(tag, this.version) && !!tar && !!sums,
      // có token: tải qua URL API của asset (repo private không mở browser_download_url cho người lạ)
      tarUrl: tar && (this.token && tar.url ? tar.url : tar.browser_download_url), tarName: tar && tar.name,
      sumsUrl: sums && (this.token && sums.url ? sums.url : sums.browser_download_url), viaApi: !!(this.token && tar && tar.url), error: null
    });
    this.write(this.stateFile, this.state);
    return this.status();
  }

  // Tải + kiểm + giải nén + backup + đổi con trỏ. Trả về true nếu cần khởi động lại.
  // force: áp cả bản từng bị bỏ qua (do lần trước tự rollback); chỉ dùng khi owner bấm tay
  async apply({ force = false } = {}) {
    if (this.busy) throw new Error('đang cập nhật');
    await this.check();
    const ok = this.state.available || (force && this.state.newer);
    if (!ok) return { restart: false, message: this.state.skipped ? tr(VI, 'Bản {tag} đã bị bỏ qua vì lần trước chạy lỗi.', { tag: this.state.latest }) : 'Đang dùng bản mới nhất.' };
    this.busy = true;
    const tag = this.state.latest;
    const relDir = path.join(this.home, 'releases', tag);
    try {
      const auth = this.state.viaApi ? { token: this.token, octet: true } : {};
      const [tarBuf, sumsBuf] = await Promise.all([get(this.state.tarUrl, auth), get(this.state.sumsUrl, Object.assign({ maxBytes: 1024 * 1024 }, auth))]);
      const want = sumsBuf.toString('utf8').split('\n').map(l => l.trim().split(/\s+/)).find(p => p[1] && p[1].replace(/^\*/, '') === this.state.tarName);
      if (!want) throw new Error(tr(VI, 'SHA256SUMS không có dòng cho {name}', { name: this.state.tarName }));
      const got = crypto.createHash('sha256').update(tarBuf).digest('hex');
      if (got !== want[0].toLowerCase()) throw new Error('sai checksum: gói tải về không khớp SHA256SUMS');
      const tmpTar = path.join(this.home, 'releases', '.' + tag + '.tar.gz');
      const tmpDir = path.join(this.home, 'releases', '.' + tag + '.tmp');
      fs.mkdirSync(path.dirname(tmpTar), { recursive: true });
      fs.writeFileSync(tmpTar, tarBuf);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      extractTarGz(tmpTar, tmpDir);
      fs.rmSync(tmpTar, { force: true });
      const ver = fs.readFileSync(path.join(tmpDir, 'VERSION'), 'utf8').trim();
      if ('v' + ver.replace(/^v/, '') !== tag) throw new Error(tr(VI, 'VERSION trong gói ({ver}) khác tag {tag}', { ver, tag }));
      if (!fs.existsSync(path.join(tmpDir, 'server', 'main.js'))) throw new Error('gói thiếu server/main.js');
      fs.rmSync(relDir, { recursive: true, force: true });
      fs.renameSync(tmpDir, relDir);
      const backup = this.backup('before-' + tag);
      const previousBefore = this.target('previous');
      this.switchTo(tag);
      // edge: ảnh chụp tunnel lúc bắt đầu (launcher ghi run/edge-status.json) — đang sẵn sàng thì launcher đòi bản mới giữ được nó (CNS-170)
      this.write(path.join(this.dataDir, 'update-pending.json'), { kind: 'update', from: 'v' + this.version.replace(/^v/, ''), to: tag, previousBefore, backup, edge: this.edgeSnapshot(), at: new Date().toISOString() });
      this.log('[updater] switched to ' + tag + ', restarting to run the new version');
      return { restart: true, message: tr(VI, 'Đã tải {tag}. Đang khởi động lại…', { tag }) };
    } catch (e) {
      this.state.error = e.message;
      this.write(this.stateFile, this.state);
      this.addHistory({ kind: 'update', from: this.version, to: tag, ok: false, error: e.message });
      throw e;
    } finally {
      this.busy = false;
    }
  }

  rollback() {
    const prev = this.target('previous');
    if (!prev) throw new Error('không có bản cũ để chạy lại');
    const cur = this.target('current');
    this.backup('before-rollback-' + prev);
    this.link('current', prev);
    if (cur) this.link('previous', cur);
    this.write(path.join(this.dataDir, 'update-pending.json'), { kind: 'rollback', from: cur, to: prev, at: new Date().toISOString() });
    // bản cũ không có edge mà máy đang online: vẫn làm theo yêu cầu của chủ, nhưng nói rõ hậu quả (launcher tự rollback thì KHÔNG làm)
    if (edgeOnline(this.home) && !releaseHasEdge(this.home, prev)) return { restart: true, offline: true, message: tr(VI, 'Đang chạy lại {tag}… Cảnh báo: {tag} không có edge — máy sẽ offline (mất tên miền / tunnel) cho tới khi cập nhật lại.', { tag: prev }) };
    return { restart: true, message: tr(VI, 'Đang chạy lại {tag}…', { tag: prev }) };
  }
  edgeSnapshot() {
    const s = this.read(path.join(this.home, 'run', 'edge-status.json'), null);
    return s && (s.tunnel === 'token' || s.tunnel === 'quick') ? { tunnel: s.tunnel, ready: s.ready === true } : null;
  }

  switchTo(tag) {
    const cur = this.target('current');
    if (cur && cur !== tag) this.link('previous', cur);
    this.link('current', tag);
    // launcher mới (nếu có) được launcher hiện tại tự thay ở lần khởi động con kế tiếp
  }
  link(name, tag) {
    const p = path.join(this.home, name), tmp = p + '.tmp';
    fs.rmSync(tmp, { force: true });
    fs.symlinkSync(path.join('releases', tag), tmp);
    fs.renameSync(tmp, p);
  }
  backup(label) {
    const dir = path.join(this.home, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + label);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(this.dataDir)) fs.cpSync(this.dataDir, path.join(dir, 'data'), { recursive: true });
    // giữ 10 bản backup gần nhất
    const all = fs.readdirSync(path.join(this.home, 'backups')).sort();
    all.slice(0, Math.max(0, all.length - 10)).forEach(d => fs.rmSync(path.join(this.home, 'backups', d), { recursive: true, force: true }));
    return path.basename(dir);
  }
}

module.exports = { Updater, newer, semver, RESTART_CODE };
