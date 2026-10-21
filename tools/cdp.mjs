// Trình điều khiển Chrome tối thiểu qua Chrome DevTools Protocol — KHÔNG npm, không Playwright: Node 22 có sẵn WebSocket.
// Dùng cho job CI xuất video trên Chrome có sẵn của runner Windows / macOS (tools/video-ci.mjs) và test "tab ẩn" (Playwright luôn giữ trang ở trạng thái
// hiện — CDP thuần với --headless=new thì tab nền THẬT SỰ bị ẩn và bị bóp timer như Chrome của người dùng).
//   findChrome() → đường dẫn (GC_CHROME > Chrome của hệ điều hành > Chromium của Playwright ở /opt/pw-browsers)
//   const c = await launch({ chrome, args }) → { send(method, params, sessionId), on(event, fn), open(url) → page, close() }
//   page = { sessionId, targetId, eval(expr, { awaitPromise }) → giá trị, activate(), close() }
// © 2026 Gen Labs — All rights reserved.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export function findChrome() {
  const env = process.env.GC_CHROME;
  if (env) return env;
  const cand = process.platform === 'win32'
    ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean).map(d => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  for (const c of cand) if (fs.existsSync(c)) return c;
  try { for (const d of fs.readdirSync('/opt/pw-browsers').filter(x => /^chromium-\d+$/.test(x)).sort().reverse()) { const c = path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome'); if (fs.existsSync(c)) return c; } } catch (e) { /* không có */ }
  return null;
}

export async function launch(o = {}) {
  const chrome = o.chrome || findChrome();
  if (!chrome) throw new Error('không tìm thấy Chrome / Chromium (đặt GC_CHROME=<đường dẫn>)');
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-cdp-'));
  const args = ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + ud, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio']
    .concat(process.platform === 'linux' && process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []).concat(o.args || []).concat(['about:blank']);
  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let errText = ''; proc.stderr.on('data', d => { errText = (errText + d).slice(-4000); });
  let port = null;
  for (let i = 0; i < 150 && !port; i++) {
    try { port = fs.readFileSync(path.join(ud, 'DevToolsActivePort'), 'utf8').split('\n'); } catch { await new Promise(r => setTimeout(r, 100)); }
    if (proc.exitCode !== null) throw new Error('Chrome thoát ngay (mã ' + proc.exitCode + '): ' + errText);
  }
  if (!port) { proc.kill(); throw new Error('Chrome không mở cổng DevTools sau 15 s: ' + errText); }
  const ws = new WebSocket('ws://127.0.0.1:' + port[0] + port[1].trim());
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('không nối được DevTools')); });
  let id = 0; const pend = new Map(), subs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const [ok, no] = pend.get(m.id); pend.delete(m.id); if (m.error) no(new Error(m.error.message + ' ' + (m.error.data || ''))); else ok(m.result); }
    else if (m.method) subs.forEach(s => { if (s[0] === m.method) s[1](m.params, m.sessionId); });
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const i = ++id; pend.set(i, [ok, no]); ws.send(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params })); });
  const c = {
    version: await send('Browser.getVersion'), chrome, send, on: (ev, fn) => subs.push([ev, fn]),
    async open(url) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
      const page = {
        targetId, sessionId,
        // chạy biểu thức trong trang THỬ (Runtime.evaluate của CDP — trình duyệt riêng của test, không phải eval của Node)
        async eval(expr, opt = {}) {
          const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: opt.awaitPromise !== false, returnByValue: true, userGesture: true }, sessionId);
          if (r.exceptionDetails) throw new Error('lỗi trong trang: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
          return r.result.value;
        },
        async goto(u) {
          const loaded = new Promise(ok => subs.push(['Page.loadEventFired', (p, s) => { if (s === sessionId) ok(); }]));
          await send('Page.navigate', { url: u }, sessionId); await loaded;
        },
        activate: () => send('Target.activateTarget', { targetId }),
        close: () => send('Target.closeTarget', { targetId })
      };
      if (url) await page.goto(url);
      return page;
    },
    async close() { try { await send('Browser.close'); } catch (e) { /* đã đóng */ } ws.close(); await new Promise(r => { if (proc.exitCode !== null) r(); else { proc.once('exit', r); setTimeout(() => { try { proc.kill(); } catch (e) { /* đã tắt */ } r(); }, 3000); } });
      try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { /* Windows còn khoá tệp: để lại trong thư mục tạm */ } }
  };
  return c;
}
