// gen-chibi — TỰ KIỂM HỘP CÁT của cầu nối CLI (v0.26, spec §4.4). © 2026 Gen Labs — All rights reserved.
// Chạy TRONG hộp cát với CÙNG tham số bwrap như lượt thật (ai-bridge.mjs dựng), sau shim (proxy 127.0.0.1:18080). Không dùng model.
// Đối số: một JSON { realHome, uid, lan: [ip…], env: [tên biến được phép] }. In MỘT dòng JSON { ok, checks: [{ id, ok, detail }] } rồi thoát 0.
// Mỗi kiểm tra là bằng chứng hệ thống (direct): đọc / ghi / kết nối thật, không suy luận.
import fs from 'fs';
import net from 'net';
import http from 'http';

const A = JSON.parse(process.argv[2] || '{}');
const checks = [];
const put = (id, ok, detail) => checks.push({ id, ok: !!ok, detail: String(detail || '').slice(0, 200) });
const cannot = (fn) => { try { fn(); return false; } catch (e) { return e.code || 'error'; } };

// 1) --clearenv: môi trường chỉ có biến trong danh sách cho phép
{
  const allow = new Set(A.env || []), extra = Object.keys(process.env).filter(k => !allow.has(k) && !(k === 'PWD' && process.env.PWD === '/work'));   // PWD: bwrap --chdir tự đặt
  put('clearenv', !extra.length, extra.length ? 'unexpected env: ' + extra.slice(0, 8).join(',') : 'env = allowlist');
}
// 2) không thấy HOME thật, bus D-Bus của phiên, /etc/shadow
{
  // HOME thật: chỉ "khung" (thư mục cha của HOME riêng / binary mà cầu nối bind) được hiện; các mục cấp 1 khác của HOME thật (probe) phải vô hình
  let seen = []; try { seen = fs.readdirSync(A.realHome || '/nonexistent'); } catch (e) { seen = []; }
  const odd = seen.filter(n => !(A.skeleton || []).includes(n)), vis = (A.probe || []).filter(n => !cannot(() => fs.lstatSync(A.realHome + '/' + n)));
  put('no-real-home', !odd.length && !vis.length, odd.length || vis.length ? 'real HOME entries visible: ' + odd.concat(vis).slice(0, 6).join(',') : 'only the bridge skeleton of ' + A.realHome);
  const b = cannot(() => fs.statSync('/run/user/' + (A.uid | 0) + '/bus'));
  put('no-dbus', b, b ? 'no session bus' : 'session bus visible');
  const s = cannot(() => fs.readFileSync('/etc/shadow'));
  put('no-shadow', s, s ? '/etc/shadow: ' + s : '/etc/shadow readable');
}
// 3) /home là tmpfs RIÊNG của hộp (không phải /home thật)
{
  let mi = ''; try { mi = fs.readFileSync('/proc/self/mountinfo', 'utf8'); } catch (e) { /* bỏ */ }
  const home = mi.split('\n').map(l => l.split(' - ')).filter(p => p.length === 2 && p[0].split(' ')[4] === '/home');
  const tmp = home.length && home[home.length - 1][1].split(' ')[0] === 'tmpfs';
  put('home-tmpfs', tmp, tmp ? '/home = tmpfs' : '/home is not a private tmpfs');
}
// 4) không ghi được ra ngoài /work + bridge-home: /usr, /etc chỉ đọc
{
  const u = cannot(() => fs.writeFileSync('/usr/.gc-selftest', 'x')), e = cannot(() => fs.writeFileSync('/etc/.gc-selftest', 'x'));
  put('ro-usr', u, u ? '/usr: ' + u : '/usr writable');
  put('ro-etc', e, e ? '/etc: ' + e : '/etc writable');
  const w = !cannot(() => { fs.writeFileSync('/work/.gc-selftest', 'x'); fs.unlinkSync('/work/.gc-selftest'); });
  put('work-rw', w, w ? '/work writable' : '/work not writable');
}
// 5) không đặc quyền
{
  let cap = ''; try { cap = (/^CapEff:\s*([0-9a-f]+)/m.exec(fs.readFileSync('/proc/self/status', 'utf8')) || [])[1] || ''; } catch (e) { /* bỏ */ }
  put('cap-drop', /^0+$/.test(cap), 'CapEff ' + (cap || '?'));
}
// 6) netns riêng: chỉ có lo
{
  let ifs = []; try { ifs = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).map(l => l.split(':')[0].trim()).filter(Boolean); } catch (e) { /* bỏ */ }
  put('netns-lo-only', ifs.length === 1 && ifs[0] === 'lo', 'interfaces: ' + ifs.join(','));
  let ns = ''; try { ns = fs.readlinkSync('/proc/self/ns/net'); } catch (e) { /* bỏ */ }
  put('netns-private', !!ns && !!A.netns && ns !== A.netns, 'net namespace ' + ns + (A.netns ? ' vs bridge ' + A.netns : ''));
}
const tcp = (host, port) => new Promise(r => {
  const s = net.connect({ host, port, timeout: 1500 });
  const end = ok => { s.destroy(); r(ok); };
  s.on('connect', () => end(true)); s.on('timeout', () => end(false)); s.on('error', () => end(false));
});
const viaProxy = (opts, body) => new Promise(r => {
  const q = http.request(Object.assign({ host: '127.0.0.1', port: 18080, timeout: 4000 }, opts), res => {
    let b = ''; res.on('data', d => { b += d; }); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
  });
  q.on('connect', res => { r({ status: res.statusCode }); q.destroy(); });
  q.on('timeout', () => { q.destroy(); r({ status: 0 }); }); q.on('error', e => r({ status: 0, error: e.code }));
  q.end(body);
});
// 7) không kết nối thẳng ra ngoài / LAN
put('no-direct-net', !(await tcp('1.1.1.1', 443)), '1.1.1.1:443');
for (const ip of (A.lan || []).slice(0, 4)) put('no-lan', !(await tcp(ip, 80)), ip + ':80');
// 8) proxy: ngoài allowlist → 403; genchibi.bridge/mcp → initialize OK
{
  const c = await viaProxy({ method: 'CONNECT', path: 'example.com:443' });
  put('proxy-deny', c.status === 403, 'CONNECT example.com:443 → ' + c.status);
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gc-selftest', version: '1' } } });
  const m = await viaProxy({ method: 'POST', path: 'http://genchibi.bridge/mcp', headers: { Host: 'genchibi.bridge', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' } }, body);
  let ok = false; try { ok = m.status === 200 && !!JSON.parse(m.body).result; } catch (e) { /* bỏ */ }
  put('proxy-mcp', ok, 'POST genchibi.bridge/mcp initialize → ' + m.status);
}
process.stdout.write(JSON.stringify({ ok: checks.every(c => c.ok), checks }) + '\n');
process.exit(0);
