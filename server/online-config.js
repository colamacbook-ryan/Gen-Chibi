// gen-chibi — cấu hình online lúc chạy (v0.21, spec v021 §3.2): data/online.json là NGUỒN DUY NHẤT của mode / domain / publicUrl / clientIpHeader.
// © 2026 Gen Labs — All rights reserved.
//
// .env (GC_PUBLIC_URL, GC_ALLOWED_HOSTS, GC_TUNNEL — chỉ còn để migrate() biết mode cũ, genchibi expose bỏ ở v0.23 —, GC_CLIENT_IP_HEADER) là cấu hình KẾ THỪA: khi .env có GC_PUBLIC_URL hoặc GC_ALLOWED_HOSTS và
// online.json chưa được app nhận quyền (adopted) → dùng nguyên .env, chỉ đọc (wizard hiện "đang cấu hình bằng .env" + nút di chuyển = migrate()).
// Không trộn từng khoá giữa hai nguồn (CNS-177). Đọc lúc chạy (OAuth, Host được phép, header IP) — đổi không cần khởi động lại.
// publicUrl hai bậc: setPending(url) bật TẠM (OAuth phục vụ metadata theo url mới để wizard kiểm từ ngoài vào) → commit() chính thức | revert() về giá trị cũ.
// Đổi sang audience khác khi đang có kết nối OAuth = thu hồi kết nối cũ (oauth.js) → setPending trả needConfirm, gọi lại với { force: true } sau khi chủ đồng ý.
// Thuần Node (không DOM, không HTTP). main.js tạo một thể hiện; server/online.js (/api/online/*) gọi get / preview / setPending / commit / revert / set / setMode / migrate.
// online.json còn giữ flow (trạng thái wizard) + cfResources (tunnel / CNAME app đã tạo, để Go offline dọn được) — set({ flow }) / set({ cfResources }).
'use strict';
const fs = require('fs');
const path = require('path');

const MODES = ['off', 'caddy', 'tunnel', 'proxy', 'quick'];   // off · đường A (Caddy) · đường B (Cloudflare tunnel) · proxy riêng · link tạm *.trycloudflare.com
const IP_HEADERS = ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip'];
const LOOP = new Set(['localhost', '127.0.0.1', '[::1]']);
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;   // tên miền (không IP, không gạch dưới) — không ghép chuỗi tự do vào cấu hình edge
const WILD_RE = /^\*\.[a-z0-9.-]+\.[a-z]+$/;

// URL công khai: https + gốc (không đường dẫn / query / fragment / user:pass); http chỉ cho loopback (thử cục bộ). Trả { url, host } | { why }
function normUrl(u) {
  if (typeof u !== 'string' || !u.trim() || u.length > 300) return { why: 'cần địa chỉ công khai dạng https://<tên-miền>' };
  let x; try { x = new URL(u.trim()); } catch (e) { return { why: 'địa chỉ công khai không phải URL hợp lệ' }; }
  const host = x.hostname.toLowerCase();
  if (x.protocol !== 'https:' && !(x.protocol === 'http:' && LOOP.has(host))) return { why: 'địa chỉ công khai phải là https (http chỉ cho loopback như http://localhost:7480)' };
  if (!((x.pathname === '/' || x.pathname === '') && !x.search && !x.hash && !x.username && !x.password)) return { why: 'địa chỉ công khai phải là gốc, vd https://chibi.example.com (không đường dẫn, query, user:pass)' };
  if (!LOOP.has(host) && !HOST_RE.test(host)) return { why: 'tên miền không hợp lệ' };
  return { url: x.origin, host };
}
const plainObj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
const splitHosts = s => String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

class OnlineConfig {
  // opts: { dir, env: { publicUrl, allowedHosts, tunnel, clientIpHeader }, log?, impact?: url => số kết nối OAuth sẽ bị thu hồi, onCommit?: (now, before) => void }
  constructor(opts) {
    this.file = path.join(opts.dir, 'online.json');
    const e = opts.env || {};
    this.env = { publicUrl: String(e.publicUrl || '').trim().replace(/\/+$/, ''), allowedHosts: splitHosts(e.allowedHosts), tunnel: String(e.tunnel || '').trim(), clientIpHeader: String(e.clientIpHeader || '').trim().toLowerCase() };
    this.log = opts.log || (() => {});
    this.impact = opts.impact || (() => 0);
    this.onCommit = opts.onCommit || (() => {});
    this.memo = null;
  }
  /* ------------------------------------------------------------ đọc (nhớ theo mtime + cỡ: hostAllowed gọi mỗi request — L-42) */
  raw() {
    let st = null; try { st = fs.statSync(this.file); } catch (e) { /* chưa có tệp */ }
    const key = st ? st.mtimeMs + ':' + st.size : '-';
    if (this.memo && this.memo.key === key) return this.memo;
    let d = {}; if (st) { try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (!d || typeof d !== 'object' || Array.isArray(d)) d = {}; } catch (e) { d = {}; this.log('[online] online.json is not valid JSON - ignoring it (fix or delete the file)'); } }
    const f = {
      adopted: d.adopted === true, mode: MODES.indexOf(d.mode) >= 0 ? d.mode : 'off', domain: typeof d.domain === 'string' && HOST_RE.test(d.domain) ? d.domain : '',
      publicUrl: normUrl(d.publicUrl).url || '', publicUrlPending: normUrl(d.publicUrlPending).url || '',
      clientIpHeader: IP_HEADERS.indexOf(d.clientIpHeader) >= 0 ? d.clientIpHeader : '', hosts: Array.isArray(d.hosts) ? d.hosts.map(h => String(h).toLowerCase()).filter(h => HOST_RE.test(h) || WILD_RE.test(h)) : [],
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null,
      flow: plainObj(d.flow), cfResources: plainObj(d.cfResources)   // trạng thái wizard Go online + tài nguyên Cloudflare app đã tạo (server/online.js) — dữ liệu trung lập, không bí mật
    };
    const envOn = !!(this.env.publicUrl || this.env.allowedHosts.length);
    const source = !f.adopted && envOn ? 'env' : 'app';
    const pub = source === 'env' ? this.env.publicUrl : (f.publicUrlPending || f.publicUrl);
    const exact = new Set(), wild = [];
    const addHost = h => { if (WILD_RE.test(h)) wild.push(h.slice(1)); else if (h) exact.add(h); };
    if (source === 'env') this.env.allowedHosts.forEach(addHost);
    else { f.hosts.forEach(addHost); if (f.domain) addHost(f.domain); if (f.mode === 'quick') addHost('*.trycloudflare.com'); }
    (source === 'env' ? [this.env.publicUrl] : [f.publicUrl, f.publicUrlPending]).forEach(u => { const n = normUrl(u); if (n.host && !LOOP.has(n.host)) addHost(n.host); });
    this.memo = { key, f, source, pub, exact, wild };
    return this.memo;
  }
  // toàn bộ trạng thái (wizard / CLI / P3). readOnly = đang chạy bằng .env kế thừa
  get() {
    const r = this.raw(), f = r.f;
    const base = r.source === 'env'
      ? { mode: this.env.tunnel === 'quick' ? 'quick' : this.env.tunnel === 'named' ? 'tunnel' : this.env.publicUrl ? 'proxy' : 'off', domain: normUrl(this.env.publicUrl).host || '', publicUrl: this.env.publicUrl, publicUrlPending: '', clientIpHeader: this.env.clientIpHeader }
      : { mode: f.mode, domain: f.domain, publicUrl: f.publicUrl, publicUrlPending: f.publicUrlPending, clientIpHeader: f.clientIpHeader };
    return Object.assign(base, { source: r.source, readOnly: r.source === 'env', hosts: [...r.exact].concat(r.wild.map(w => '*' + w)), env: { publicUrl: this.env.publicUrl, allowedHosts: this.env.allowedHosts.slice(), tunnel: this.env.tunnel }, updatedAt: f.updatedAt,
      flow: r.source === 'app' ? clone(f.flow) : null, cfResources: r.source === 'app' ? clone(f.cfResources) : null });
  }
  // publicUrl ĐANG HIỆU LỰC (OAuth đọc mỗi lần): .env kế thừa → GC_PUBLIC_URL; app → bản tạm nếu đang bật tạm, không thì bản chính thức
  publicUrl() { return this.raw().pub || ''; }
  pending() { return this.raw().source === 'app' && !!this.raw().f.publicUrlPending; }
  // Host được phép ngoài loopback (chống DNS rebinding): .env kế thừa → GC_ALLOWED_HOSTS + host của GC_PUBLIC_URL; app → domain + host của publicUrl (+ bản tạm) + hosts đã di chuyển + *.trycloudflare.com khi mode=quick
  hostAllowed(h) { const r = this.raw(); return r.exact.has(h) || r.wild.some(suf => h.endsWith(suf) && h.length > suf.length); }
  // header IP khách của lớp P (proxy riêng): online.json (gắn với mode) → GC_CLIENT_IP_HEADER (kế thừa) → '' (mặc định: mục cuối x-forwarded-for)
  ipHeader() { const r = this.raw(); return (r.source === 'app' && r.f.clientIpHeader) || this.env.clientIpHeader || ''; }

  /* ------------------------------------------------------------ ghi (chỉ nguồn app) */
  write(f) {
    const out = { v: 1, adopted: true, mode: f.mode, domain: f.domain, publicUrl: f.publicUrl, publicUrlPending: f.publicUrlPending, clientIpHeader: f.clientIpHeader, hosts: f.hosts, updatedAt: new Date().toISOString(),
      flow: f.flow || null, cfResources: f.cfResources || null };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(out, null, 1) + '\n'); fs.renameSync(this.file + '.tmp', this.file);
    this.memo = null;
    return this.get();
  }
  cur() { const f = this.raw().f; return Object.assign({}, f, { hosts: f.hosts.slice(), flow: clone(f.flow), cfResources: clone(f.cfResources) }); }
  guardEnv() { return this.raw().source === 'env' ? { ok: false, readOnly: true, error: 'đang cấu hình ra ngoài bằng .env (GC_PUBLIC_URL / GC_ALLOWED_HOSTS) — chỉ đọc; di chuyển sang app trước' } : null; }
  // xem trước: url hợp lệ? đổi sang url này thu hồi bao nhiêu kết nối OAuth? (không đổi gì)
  preview(url) {
    const n = normUrl(url); if (n.why) return { ok: false, error: n.why };
    const revokes = n.url === this.stableUrl() ? 0 : Math.max(0, +this.impact(n.url) || 0);
    return { ok: true, publicUrl: n.url, domain: n.host, revokes, audienceChange: revokes > 0 };
  }
  stableUrl() { const r = this.raw(); return r.source === 'env' ? this.env.publicUrl : r.f.publicUrl; }
  // bật TẠM (bậc 5 của wizard). Có kết nối OAuth sẽ mất mà chưa force → không đổi, trả needConfirm để UI hỏi chủ trước
  setPending(url, o) {
    const g = this.guardEnv(); if (g) return g;
    const pv = this.preview(url); if (!pv.ok) return pv;
    if (pv.revokes && !(o && o.force)) return Object.assign({ needConfirm: true }, pv, { ok: false, error: 'đổi địa chỉ công khai sẽ thu hồi các kết nối agent hiện có (OAuth) — hỏi chủ trước, rồi gọi lại với force' });
    const f = this.cur(), previous = f.publicUrl;
    f.publicUrlPending = pv.publicUrl;
    this.write(f);
    this.log('[online] public URL enabled temporarily: ' + pv.publicUrl);
    return { ok: true, publicUrl: pv.publicUrl, previous, revokes: pv.revokes, audienceChange: pv.audienceChange };
  }
  // chính thức hoá bản tạm (bậc cuối). Trả { ok, publicUrl, previous }; báo onCommit để OAuth gỡ token của audience cũ
  commit() {
    const g = this.guardEnv(); if (g) return g;
    const f = this.cur(); if (!f.publicUrlPending) return { ok: false, error: 'không có địa chỉ công khai tạm nào để chính thức hoá' };
    const previous = f.publicUrl;
    f.publicUrl = f.publicUrlPending; f.publicUrlPending = ''; f.domain = normUrl(f.publicUrl).host || f.domain;
    this.write(f);
    this.log('[online] public URL committed: ' + f.publicUrl);
    try { this.onCommit(f.publicUrl, previous); } catch (e) { this.log('[online] after-commit hook failed: ' + e.message); }
    return { ok: true, publicUrl: f.publicUrl, previous };
  }
  // lỗi giữa chừng → về giá trị cũ (bỏ bản tạm)
  revert() {
    const g = this.guardEnv(); if (g) return g;
    const f = this.cur(), dropped = f.publicUrlPending;
    if (dropped) { f.publicUrlPending = ''; this.write(f); this.log('[online] temporary public URL dropped, back to ' + (f.publicUrl || '(none)')); }
    return { ok: true, publicUrl: f.publicUrl, dropped };
  }
  // đổi mode (đường A / B / proxy / quick / off). clientIpHeader gắn với mode: đổi mode thì xoá trừ khi truyền mới; domain theo tên miền hợp lệ
  setMode(mode, o) {
    const g = this.guardEnv(); if (g) return g;
    if (MODES.indexOf(mode) < 0) return { ok: false, error: 'mode phải là off | caddy | tunnel | proxy | quick' };
    o = o || {};
    const f = this.cur();
    if (o.clientIpHeader !== undefined && o.clientIpHeader !== '' && IP_HEADERS.indexOf(o.clientIpHeader) < 0) return { ok: false, error: 'clientIpHeader phải là x-forwarded-for | cf-connecting-ip | x-real-ip' };
    if (o.domain !== undefined && o.domain !== '' && !HOST_RE.test(String(o.domain).toLowerCase())) return { ok: false, error: 'tên miền không hợp lệ' };
    if (mode !== f.mode) f.clientIpHeader = '';
    if (o.clientIpHeader !== undefined) f.clientIpHeader = o.clientIpHeader;
    if (o.domain !== undefined) f.domain = String(o.domain).toLowerCase();
    f.mode = mode;
    if (mode === 'off') { f.publicUrlPending = ''; }
    return Object.assign({ ok: true }, this.write(f));
  }
  // ghi nông nhiều khoá một lần (nguyên tử) — cho máy trạng thái Go online (server/online.js). Khoá nhận: mode, domain, clientIpHeader (cùng luật setMode,
  // nhưng KHÔNG tự xoá clientIpHeader — người gọi truyền đủ), flow, cfResources (đối tượng thuần | null, ≤ 64 KiB JSON), publicUrl CHỈ nhận '' (Go offline:
  // bỏ cả bản chính thức lẫn bản tạm; đặt địa chỉ mới phải qua setPending → commit để OAuth hỏi chủ trước). Khoá khác → lỗi, không ghi gì
  set(patch) {
    const g = this.guardEnv(); if (g) return g;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: 'patch phải là đối tượng' };
    const f = this.cur();
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (k === 'mode') { if (MODES.indexOf(v) < 0) return { ok: false, error: 'mode phải là off | caddy | tunnel | proxy | quick' }; f.mode = v; if (v === 'off') f.publicUrlPending = ''; }
      else if (k === 'domain') { const x = String(v == null ? '' : v).toLowerCase(); if (x && !HOST_RE.test(x)) return { ok: false, error: 'tên miền không hợp lệ' }; f.domain = x; }
      else if (k === 'clientIpHeader') { const x = String(v == null ? '' : v); if (x && IP_HEADERS.indexOf(x) < 0) return { ok: false, error: 'clientIpHeader phải là x-forwarded-for | cf-connecting-ip | x-real-ip' }; f.clientIpHeader = x; }
      else if (k === 'flow' || k === 'cfResources') {
        if (v !== null && plainObj(v) === null) return { ok: false, error: k + ' phải là đối tượng hoặc null' };
        if (v !== null && JSON.stringify(v).length > 65536) return { ok: false, error: k + ' quá lớn' };
        f[k] = v === null ? null : clone(v);
      } else if (k === 'publicUrl') { if (v !== '') return { ok: false, error: 'đặt địa chỉ công khai qua setPending rồi commit' }; f.publicUrl = ''; f.publicUrlPending = ''; }
      else return { ok: false, error: 'khoá không được ghi: ' + k };
    }
    return Object.assign({ ok: true }, this.write(f));
  }
  // nút "di chuyển": chép cấu hình .env kế thừa vào online.json rồi app nhận quyền (từ đây online.json thắng; .env còn biến cũ cũng không đọc nữa)
  migrate() {
    const r = this.raw(); if (r.source !== 'env') return { ok: false, error: 'không có cấu hình .env kế thừa để di chuyển' };
    const n = normUrl(this.env.publicUrl);
    const f = { adopted: true, mode: this.env.tunnel === 'quick' ? 'quick' : this.env.tunnel === 'named' ? 'tunnel' : n.url ? 'proxy' : 'off', domain: n.host && !LOOP.has(n.host) ? n.host : '',
      publicUrl: n.url || '', publicUrlPending: '', clientIpHeader: this.env.clientIpHeader, hosts: this.env.allowedHosts.filter(h => HOST_RE.test(h) || WILD_RE.test(h)) };
    this.log('[online] .env online settings moved into data/online.json');
    return Object.assign({ ok: true }, this.write(f));
  }
}

module.exports = { OnlineConfig, normUrl, MODES, IP_HEADERS };
