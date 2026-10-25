// Kiểm `genchibi ai bridge …` (v0.26, spec v025-cli-bridge §6, §9.10): CLI thật trên bản cài native giả, HOME riêng, server thật để ghép, systemctl giả.
// © 2026 Gen Labs — All rights reserved.
//  · từ chối root (khác live hook — CNS-315) · install: chép 3 tệp bằng trusted_copy (từ chối symlink / sai nội dung / ngoài gói đã kiểm), chốt địa chỉ app,
//    ghép (token + bí mật HMAC 0600, KHÔNG qua argv / không in ra), unit user (node tuyệt đối, NoNewPrivileges, UMask) + systemctl --user enable --now
//  · uninstall: gỡ unit + token + mã; HOME riêng của CLI giữ khi không hỏi được · update / trust_sync làm mới tệp cầu nối (kiểm tĩnh)
// Máy test chạy bằng root → phần cài chạy bằng `nobody` (setpriv), cây tạm chown sang nobody. Không ghi vào HOME thật. Dùng: node tools/test-bridge-cli.mjs (cổng 7797)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync, execFileSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let bad = 0;
const ok = (c, m, extra) => { if (c) console.log('   ✓ ' + m); else { bad = 1; console.log('   ✗ ' + m + (extra ? ' — ' + String(extra).slice(0, 700) : '')); } };
const kids = [], tmp = [];
process.on('exit', () => { kids.forEach(k => { try { k.kill(); } catch (e) { /* đã tắt */ } }); tmp.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* bỏ */ } }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isRoot = process.getuid() === 0;
const setpriv = isRoot ? (spawnSync('sh', ['-c', 'command -v setpriv'], { encoding: 'utf8' }).stdout || '').trim() : '';
let UID = process.getuid(), GID = process.getgid();
if (isRoot) { UID = +execFileSync('id', ['-u', 'nobody'], { encoding: 'utf8' }).trim(); GID = +execFileSync('id', ['-g', 'nobody'], { encoding: 'utf8' }).trim(); }

const B = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-brcli-')); tmp.push(B); fs.chmodSync(B, 0o755);
const CH = path.join(B, 'install'), UH = path.join(B, 'home'), REL = path.join(B, 'rel'), FBIN = path.join(B, 'fbin'), TD = path.join(UH, '.local/lib/gen-chibi');
fs.mkdirSync(path.join(CH, 'data'), { recursive: true }); fs.mkdirSync(TD, { recursive: true, mode: 0o700 }); fs.mkdirSync(path.join(REL, 'bridge'), { recursive: true }); fs.mkdirSync(FBIN);
fs.writeFileSync(path.join(TD, 'installs'), 'native ' + path.join(fs.realpathSync(B), 'install') + '\n', { mode: 0o600 });
const PORT = 7797, OWN = 'ownerSECRETtoken' + 'b'.repeat(30);
fs.writeFileSync(path.join(CH, '.env'), 'GC_MODE=native\nGC_PORT=' + PORT + '\nGC_API_TOKEN=' + OWN + '\n');
fs.writeFileSync(path.join(CH, 'data/owner-token'), OWN + '\n');
fs.writeFileSync(path.join(REL, 'VERSION'), '0.26.0\n');
for (const f of ['ai-bridge.mjs', 'shim.mjs', 'selftest.mjs']) fs.copyFileSync(path.join(ROOT, 'bridge', f), path.join(REL, 'bridge', f));
fs.symlinkSync(REL, path.join(CH, 'current'));
// systemctl giả: ghi lại lệnh (một dòng mỗi lần gọi), show-environment = có phiên user
fs.writeFileSync(path.join(FBIN, 'systemctl'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "' + path.join(B, 'systemctl.log') + '"\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(path.join(B, 'systemctl.log'), '');
if (isRoot) execFileSync('chown', ['-R', UID + ':' + GID, B]);
const PATHV = FBIN + ':' + path.dirname(process.execPath) + ':/usr/local/bin:/usr/bin:/bin';
const cli = (args, opt) => {
  const env = { PATH: PATHV, GC_HOME: CH, GC_CLI_INNER: '1', HOME: UH, LANG: 'C.UTF-8', XDG_CONFIG_HOME: path.join(UH, '.config') };
  const asRoot = opt && opt.asRoot, argv = ['bash', path.join(ROOT, 'cli/genchibi')].concat(args);
  const cmd = isRoot && !asRoot ? [setpriv, '--reuid=' + UID, '--regid=' + GID, '--clear-groups', '--'].concat(argv) : argv;
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: UH, encoding: 'utf8', env, timeout: 60000, input: '' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
if (isRoot && !setpriv) { console.log('   ⚠ BỎ QUA test-bridge-cli: máy test chạy bằng root mà không có setpriv để hạ quyền'); process.exit(0); }

// 1) root bị từ chối: bản cài của user khác (rào có sẵn) và bản cài của CHÍNH root (rào br_root của cầu nối — CNS-315)
const asR = cli(['ai', 'bridge', 'install'], { asRoot: true });
let own = { code: 2, out: 'refusing to run the CLI bridge as root' };
if (isRoot) {
  const R2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-brcli-root-')); tmp.push(R2);
  const C2 = path.join(R2, 'install'), H2 = path.join(R2, 'home'), T2 = path.join(H2, '.local/lib/gen-chibi');
  fs.mkdirSync(path.join(C2, 'data'), { recursive: true }); fs.mkdirSync(T2, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(T2, 'installs'), 'native ' + path.join(fs.realpathSync(R2), 'install') + '\n', { mode: 0o600 });
  fs.writeFileSync(path.join(C2, '.env'), 'GC_MODE=native\nGC_PORT=' + PORT + '\n'); fs.symlinkSync(REL, path.join(C2, 'current'));
  const r = spawnSync('bash', [path.join(ROOT, 'cli/genchibi'), 'ai', 'bridge', 'install'], { cwd: H2, encoding: 'utf8', env: { PATH: PATHV, GC_HOME: C2, GC_CLI_INNER: '1', HOME: H2, LANG: 'C.UTF-8' }, timeout: 30000 });
  own = { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  own.made = fs.existsSync(path.join(T2, 'ai-bridge')) || fs.existsSync(path.join(H2, '.local/lib/gen-chibi/bridge'));
}
ok(!isRoot || (asR.code !== 0 && own.code === 2 && /refusing to run the CLI bridge as root/i.test(own.out) && !own.made),
  'genchibi ai bridge từ chối root (bản cài của chính root → thoát 2, không chép / ghép gì; bản cài của user khác → rào có sẵn)' + (isRoot ? '' : ' (máy test không phải root — hàm refuseRoot kiểm ở test-bridge)'), asR.code + ' ' + own.code + ' ' + own.out.slice(0, 200));
const usage = cli(['ai', 'nope']);
ok(usage.code === 2 && /genchibi ai bridge install/.test(usage.out), 'genchibi ai <lạ> → cách dùng, thoát 2');

// 2) server thật để ghép
const srv = spawn(process.execPath, [path.join(ROOT, 'server/main.js')], { env: Object.assign({}, process.env, { GC_HOME: CH, GC_PORT: String(PORT), GC_NO_AUTOCHECK: '1', GC_API_TOKEN: OWN, HOME: CH }), stdio: ['ignore', 'pipe', 'pipe'] });
kids.push(srv); let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch('http://127.0.0.1:' + PORT + '/api/health')).ok) break; } catch (e) { /* chưa lên */ } await sleep(100); }

// 3) trusted_copy từ chối: symlink, sai nội dung
const shim = path.join(REL, 'bridge/shim.mjs');
fs.renameSync(shim, shim + '.real'); fs.symlinkSync(shim + '.real', shim);
const symR = cli(['ai', 'bridge', 'install']);
fs.unlinkSync(shim); fs.writeFileSync(shim, '// not the bridge shim\nconsole.log(1)\n'); if (isRoot) fs.chownSync(shim, UID, GID);
const wrongR = cli(['ai', 'bridge', 'install']);
fs.unlinkSync(shim); fs.renameSync(shim + '.real', shim);
ok(symR.code !== 0 && /Refused to copy current\/bridge\/shim\.mjs/.test(symR.out) && wrongR.code !== 0 && /Refused to copy/.test(wrongR.out) && !fs.existsSync(path.join(UH, '.local/lib/gen-chibi/bridge/token')),
  'trusted_copy (CNS-320): nguồn là symlink → từ chối · nội dung không mang dấu của tệp cầu nối → từ chối · chưa ghép gì', symR.out.slice(0, 200) + ' | ' + wrongR.out.slice(0, 200));

// 4) install
const ins = cli(['ai', 'bridge', 'install']);
const lib = path.join(UH, '.local/lib/gen-chibi/bridge'), code = path.join(TD, 'ai-bridge'), unit = path.join(UH, '.config/systemd/user/gen-chibi-ai-bridge.service');
const mode = f => { try { return (fs.statSync(f).mode & 0o777).toString(8); } catch (e) { return 'none'; } };
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(lib, 'config.json'), 'utf8')); } catch (e) { return {}; } })();
const tok = (() => { try { return fs.readFileSync(path.join(lib, 'token'), 'utf8').trim(); } catch (e) { return ''; } })(), hm = (() => { try { return fs.readFileSync(path.join(lib, 'hmac'), 'utf8').trim(); } catch (e) { return ''; } })();
const unitTxt = fs.existsSync(unit) ? fs.readFileSync(unit, 'utf8') : '', sysLog = fs.readFileSync(path.join(B, 'systemctl.log'), 'utf8');
ok(ins.code === 0 && ['ai-bridge.mjs', 'shim.mjs', 'selftest.mjs'].every(f => mode(path.join(code, f)) === '600' && fs.readFileSync(path.join(code, f), 'utf8') === fs.readFileSync(path.join(ROOT, 'bridge', f), 'utf8'))
  && /^gcb_/.test(tok) && /^[0-9a-f]{64}$/.test(hm) && mode(path.join(lib, 'token')) === '600' && mode(path.join(lib, 'hmac')) === '600' && cfg.app === 'http://127.0.0.1:' + PORT && cfg.version === '0.26.0',
  'install: 3 tệp cầu nối chép bằng trusted_copy (0600, đúng nội dung gói) · token gcb_ + bí mật HMAC 0600 · địa chỉ app chốt http://127.0.0.1:' + PORT, ins.out.slice(0, 500));
const nodeAbs = fs.realpathSync(process.execPath);
ok(new RegExp('^ExecStart=' + nodeAbs.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ' ' + code.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '/ai-bridge\\.mjs run$', 'm').test(unitTxt) && /^NoNewPrivileges=yes$/m.test(unitTxt) && /^UMask=0077$/m.test(unitTxt) && /^Restart=on-failure$/m.test(unitTxt)
  && /--user daemon-reload/.test(sysLog) && /--user enable --now gen-chibi-ai-bridge\.service/.test(sysLog),
  'unit user gen-chibi-ai-bridge.service: ExecStart = node tuyệt đối + bản chép đã kiểm, Restart=on-failure, NoNewPrivileges=yes, UMask=0077 · systemctl --user enable --now', unitTxt + ' | ' + sysLog);
ok(![tok, hm, OWN].some(x => x && (ins.out.includes(x) || sysLog.includes(x) || unitTxt.includes(x) || slog.includes(x))),
  'token cầu nối / bí mật HMAC / token chủ không in ra, không trong lệnh systemctl / unit / log server (ghép qua stdin)');
const st = await fetch('http://127.0.0.1:' + PORT + '/api/ai/cli', { headers: { Authorization: 'Bearer ' + OWN } }).then(r => r.json());
ok(st.paired === true && st.online === false, 'app thấy đã ghép (chưa online cho tới khi cầu nối poll)', JSON.stringify(st).slice(0, 200));

// 5) lệnh chuyển cho cầu nối (node, không root)
const sts = cli(['ai', 'bridge', 'status']), conf = cli(['ai', 'bridge', 'config', '--turn-sec', '600', '--per-hour', '20']), confBad = cli(['ai', 'bridge', 'config', '--turn-sec', '99999']);
const caps = (() => { try { return JSON.parse(fs.readFileSync(path.join(lib, 'caps.json'), 'utf8')); } catch (e) { return {}; } })();
ok(sts.code === 0 && /app: http:\/\/127\.0\.0\.1:7797/.test(sts.out) && conf.code === 0 && caps.turnSec === 600 && caps.perHour === 20 && confBad.code === 2 && mode(path.join(lib, 'caps.json')) === '600',
  'status / config: trần máy chủ đặt ở đây (600 s, 20 lượt / giờ), ngoài khoảng cho phép → từ chối', sts.out.slice(0, 200) + ' | ' + confBad.out.slice(0, 200));

// 6) uninstall: không terminal → giữ HOME riêng của CLI, gỡ phần còn lại
fs.mkdirSync(path.join(UH, '.local/share/gen-chibi/bridge/agy-home'), { recursive: true }); fs.writeFileSync(path.join(UH, '.local/share/gen-chibi/bridge/agy-home/cred'), 'x');
if (isRoot) execFileSync('chown', ['-R', UID + ':' + GID, path.join(UH, '.local/share')]);
const un = cli(['ai', 'bridge', 'uninstall']), sysLog2 = fs.readFileSync(path.join(B, 'systemctl.log'), 'utf8');
ok(un.code === 0 && !fs.existsSync(unit) && !fs.existsSync(path.join(lib, 'token')) && !fs.existsSync(path.join(lib, 'hmac')) && !fs.existsSync(path.join(lib, 'config.json')) && !fs.existsSync(path.join(code, 'ai-bridge.mjs'))
  && /--user disable --now gen-chibi-ai-bridge\.service/.test(sysLog2) && fs.existsSync(path.join(UH, '.local/share/gen-chibi/bridge/agy-home/cred')) && /Kept the bridge's own CLI logins/.test(un.out),
  'uninstall: tắt + gỡ unit, xoá mã + token + bí mật HMAC + cấu hình · đăng nhập CLI riêng chỉ xoá SAU KHI HỎI (không terminal → giữ, in đường)', un.out.slice(0, 300));

// 7) kiểm tĩnh: Docker (TRUST) chỉ chép từ gói đã kiểm; update / trust_sync làm mới; genchibi uninstall gỡ cầu nối; gói phát hành mang bridge/
const CLI = fs.readFileSync(path.join(ROOT, 'cli/genchibi'), 'utf8'), PKG = fs.readFileSync(path.join(ROOT, 'tools/package.sh'), 'utf8');
ok(/case "\$src" in "\$TD"\/rel\/v\*\/\*\) ;; \*\) return 1 ;; esac/.test(CLI) && /cp "\$w\/x\/bridge\/ai-bridge\.mjs" "\$w\/x\/bridge\/shim\.mjs" "\$w\/x\/bridge\/selftest\.mjs" "\$w\/rel\/bridge\/"/.test(CLI)
  && /trust_install_cli "\$t" \|\| true\n  br_refresh/.test(CLI) && /\[ -n "\$\{TRUST:-\}" \] \|\| br_refresh/.test(CLI) && /br_uninstall --keep-home/.test(CLI) && /trusted_copy "\$\{src:-current\/tools\/live-hook\.mjs\}"/.test(CLI) && / cli agent bridge; do/.test(PKG),
  'Docker: trusted_copy chỉ nhận nguồn trong $TD/rel/v<bản>/ · trust_fetch giữ bridge/*.mjs của gói đã kiểm · trust_sync + update làm mới cầu nối · genchibi uninstall gỡ cầu nối · live hook dùng chung trusted_copy · gói phát hành mang bridge/');
srv.kill(); await new Promise(r => srv.once('exit', r));
console.log(bad ? '   ✗ test-bridge-cli: có lỗi' : '   ✓ test-bridge-cli: đạt');
process.exit(bad);
