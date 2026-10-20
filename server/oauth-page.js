// gen-chibi — trang "Cấp phép kết nối agent" (v0.19). Tự chứa: một HTML, CSS + JS nhúng (nonce CSP), không tải tệp Studio nào —
// nên tunnel / proxy chỉ cần mở đúng /oauth/authorize + /api/oauth/approve. Mọi chữ do agent tự khai đặt bằng textContent (không innerHTML).
// NGÔN NGỮ (ADR 0007): theo trình duyệt của người xem (Accept-Language) → mặc định của máy → en. lang truyền vào (opts.lang / tham số) thắng;
// không truyền thì lấy ngôn ngữ của yêu cầu đang chạy (MSG.reqLang). Chữ của JS trong trang dịch sẵn ở server, nhúng qua JSON (CSP không đổi).
// © 2026 Gen Labs — All rights reserved.
'use strict';
const crypto = require('crypto');
const MSG = require('./i18n-msg');
const { scopeInfo } = require('./oauth');

// nhúng JSON vào <script type="application/json">: thoát < > & và U+2028/9 để chữ của agent không thoát ra khỏi thẻ
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029), BS = String.fromCharCode(92);
const safeJSON = v => JSON.stringify(v).replace(new RegExp('[<>&' + LS + PS + ']', 'g'), c => BS + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
:root{--bg:#F6F4EF;--surface:#fff;--raised:#FBFAF7;--line:#E6E2D9;--line-strong:#D3CEC2;--fg:#1C1B1E;--fg2:#5E5A53;--muted:#8E897F;--accent:#B9741A;--accent-soft:#B9741A14;--on-accent:#fff;--ok:#2E8B5E;--danger:#C2412F;--warn:#9A7A12;--mono:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#111012;--surface:#18171A;--raised:#201F23;--line:#26252A;--line-strong:#34333A;--fg:#ECEAE6;--fg2:#A8A49D;--muted:#8A857E;--accent:#E8A33D;--accent-soft:#E8A33D1A;--on-accent:#1C1B1E;--ok:#4CB782;--danger:#E5604D;--warn:#E8C547;color-scheme:dark}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--fg);font:13px/1.5 'IBM Plex Sans','Segoe UI',system-ui,sans-serif;display:grid;place-items:center;padding:24px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:8px;width:min(560px,100%);box-shadow:0 1px 2px rgb(0 0 0/.04)}
.panel>h1{margin:0;padding:12px 16px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--fg2);border-bottom:1px solid var(--line)}
.pad{padding:14px 16px;display:grid;gap:12px}
.kv{display:grid;grid-template-columns:130px minmax(0,1fr);gap:6px 12px;align-items:baseline}.kv>label{color:var(--fg2)}
.mono{font-family:var(--mono)}.note{color:var(--fg2);font-size:12px}
.chip{display:inline-flex;font-size:12px;padding:1px 8px;border-radius:10px;border:1px solid var(--line-strong);color:var(--fg2);margin-left:6px}
.chip.ok{color:var(--ok)}.chip.warn{color:var(--warn)}
.alert{border:1px solid color-mix(in srgb,var(--warn) 50%,var(--line));background:var(--accent-soft);border-radius:6px;padding:8px 10px;font-size:12.5px}
.alert.bad{border-color:color-mix(in srgb,var(--danger) 50%,var(--line));color:var(--danger)}
.lbl{margin-bottom:6px;color:var(--fg2)}.scopes{display:grid;gap:6px}
.scope{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--raised);cursor:pointer}
.scope:has(input:checked){border-color:var(--accent);background:var(--accent-soft)}
.scope input{grid-row:span 2;margin-top:3px;accent-color:var(--accent)}.scope b{font-weight:600}.scope span{color:var(--fg2);font-size:12px}
input[type=password]{width:100%;padding:6px 8px;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:inherit;font:inherit}
input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;align-items:center}
.btn{border:1px solid var(--line-strong);background:var(--surface);color:inherit;padding:6px 16px;border-radius:6px;font:inherit;cursor:pointer}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:500}.btn:disabled{opacity:.5;cursor:default}
.foot{padding:8px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:11.5px}
`;

function shell(L, title, bodyHtml, nonce, script) {
  const _t = s => MSG._t(s, null, L);
  return '<!doctype html><html lang="' + L + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">' +
    '<title>' + esc(title) + ' · gen-chibi</title><style nonce="' + nonce + '">' + CSS + '</style></head><body><main class="panel"><h1>' + esc(title) + '</h1>' + bodyHtml +
    '<div class="foot">gen-chibi · © 2026 Gen Labs — ' + esc(_t('Chỉ chủ máy cấp phép được. Bạn có thể đóng trang này để từ chối.')) + '</div></main>' + (script || '') + '</body></html>';
}
const nonce = () => crypto.randomBytes(16).toString('base64');
const csp = n => "default-src 'none'; script-src 'nonce-" + n + "'; style-src 'nonce-" + n + "'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// lỗi trước khi tin được redirect_uri: hiện trang, KHÔNG chuyển hướng. message = msgid tiếng Việt từ OAuth.authorize() → dịch theo người xem
function errorPage(message, lang) {
  const n = nonce(), L = MSG.reqLang(lang), _t = s => MSG._t(s, null, L);
  return { html: shell(L, _t('Không cấp phép được'), '<div class="pad"><div class="alert bad" id="m"></div><div class="note">' + esc(_t('Không có gì được cấp. Quay lại agent và thử kết nối lại.')) + '</div></div>', n,
    '<script nonce="' + n + '">document.getElementById("m").textContent=' + safeJSON(MSG.label(L, String(message)).slice(0, 400)) + ';</script>'), csp: csp(n) };
}

// view: kết quả OAuth.authorize().view; opts: { needToken (chưa có S / T), loginUrl ('' = máy chưa có mật khẩu), publicHost, lang? }
function consentPage(view, opts) {
  const n = nonce(), L = MSG.reqLang(opts.lang), _t = s => MSG._t(s, null, L);
  // chữ JS trong trang (dịch sẵn) — đi cùng dữ liệu, không ghép vào mã
  const tx = { loopback: _t('máy của bạn (CLI)'), known: _t('tên miền quen'), added: _t('bạn đã thêm (GC_OAUTH_REDIRECTS)'), unknown: _t('tên miền lạ'), unasked: _t('(không nói rõ — bạn chọn bên dưới)'),
    foreign: _t('Tên miền {host} không phải của claude.ai. Chỉ cấp nếu bạn tự thêm agent này.'), needToken: _t('Cần token chủ máy (GC_API_TOKEN) đúng để cấp phép.'), err: _t('Lỗi {code}'),
    badRedirect: _t('Địa chỉ quay về không hợp lệ.'), going: _t('Đang quay về agent…'), noServer: _t('Không gọi được máy chủ: {error}') };
  const v = Object.assign({}, view, { client: view.client === 'Agent không tên' ? _t('Agent không tên') : view.client,   // tên agent tự khai: dữ liệu, không khớp mẫu — chỉ dịch tên mặc định
    scopes: (view.scopes || []).map(s => Object.assign({}, s, scopeInfo(s.id, L) || {})) });
  const loginUrl = /^\/login\?next=[A-Za-z0-9%._~!*'()-]*$/.test(opts.loginUrl || '') ? opts.loginUrl : '';   // chỉ đường nội bộ do main.js dựng
  const data = Object.assign({ needToken: !!opts.needToken, loginUrl, publicHost: opts.publicHost || '', tx }, v);
  const body = '<div class="pad">' +
    '<div>' + _t('Một agent muốn kết nối vào <b>gen-chibi</b> của bạn ({host}) để đọc / tạo asset qua MCP. Chỉ bấm <b>Cấp phép</b> nếu chính bạn vừa thêm kết nối này.').replace('{host}', '<span class="mono" id="ph"></span>') + '</div>' +
    '<div class="kv"><label>' + esc(_t('Tên agent')) + '</label><div><b id="cn"></b> <span class="note">' + esc(_t('(agent tự khai — không phải bằng chứng danh tính)')) + '</span></div>' +
    '<label>' + esc(_t('Quay về')) + '</label><div><span class="mono" id="cb"></span><span class="chip" id="cc"></span></div>' +
    '<label>' + esc(_t('Agent xin')) + '</label><div class="mono" id="rq"></div></div>' +
    '<div class="alert" id="warn" hidden></div>' +
    '<div><div class="lbl">' + esc(_t('Phạm vi cấp (đổi lại được ở Studio › Hệ thống › Kết nối agent)')) + '</div><div class="scopes" id="sc" role="radiogroup" aria-label="' + esc(_t('Phạm vi cấp')) + '"></div></div>' +
    '<div id="tk" hidden><div class="note" id="lg" hidden><a id="lga" href="#">' + esc(_t('Đăng nhập bằng mật khẩu chủ')) + '</a> ' + esc(_t('— hoặc dán token chủ máy bên dưới.')) + '</div>' +
    '<label for="tki" class="note">' + esc(_t('Token chủ máy (GC_API_TOKEN) — để chứng minh bạn là chủ máy')) + '</label><input id="tki" type="password" autocomplete="current-password" placeholder="GC_API_TOKEN"></div>' +
    '<div class="alert bad" id="er" hidden></div>' +
    '<div class="row"><button class="btn" id="no" type="button">' + esc(_t('Từ chối')) + '</button><button class="btn primary" id="ok" type="button">' + esc(_t('Cấp phép')) + '</button></div></div>';
  const js = `(function(){
var D=JSON.parse(document.getElementById('gc-data').textContent),X=D.tx,$=function(i){return document.getElementById(i)};
$('ph').textContent=D.publicHost;$('cn').textContent=D.client;$('cb').textContent=D.callback.host;
var cbOk=D.callback.known||D.callback.loopback||D.callback.added;
$('cc').textContent=D.callback.loopback?X.loopback:D.callback.known?X.known:D.callback.added?X.added:X.unknown;$('cc').className='chip '+(cbOk?'ok':'warn');
$('rq').textContent=D.requested.length?D.requested.join(' '):X.unasked;
if(!cbOk){$('warn').hidden=false;$('warn').textContent=X.foreign.replace('{host}',function(){return D.callback.host});}
var sel=D.scope;
D.scopes.forEach(function(s){var l=document.createElement('label');l.className='scope';var r=document.createElement('input');r.type='radio';r.name='scope';r.value=s.id;r.checked=s.id===sel;r.addEventListener('change',function(){sel=s.id});
var b=document.createElement('b');b.textContent=s.label+' ('+s.id+')';var d=document.createElement('span');d.textContent=s.desc;l.appendChild(r);l.appendChild(b);l.appendChild(d);$('sc').appendChild(l);});
var token='';try{token=localStorage.getItem('gc-token')||''}catch(e){}
if(D.needToken&&!token)$('tk').hidden=false;
if(D.loginUrl){$('lg').hidden=false;$('lga').setAttribute('href',D.loginUrl);}
// anti misclick / popup clickjacking: the Authorize button only enables 800 ms after the page shows or regains focus (timer resets each time)
var armT=0,busy=false;
function arm(){$('ok').disabled=true;clearTimeout(armT);armT=setTimeout(function(){if(!busy)$('ok').disabled=false;},800);}
arm();window.addEventListener('focus',arm);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')arm();});
function err(m){busy=false;$('er').hidden=false;$('er').textContent=m;$('no').disabled=false;arm();}
function go(decision){
  busy=true;$('er').hidden=true;$('ok').disabled=true;$('no').disabled=true;
  var t=$('tki').value.trim()||token,h={'Content-Type':'application/json','X-GC-Request':'1'};if(t)h.Authorization='Bearer '+t;
  fetch('/api/oauth/approve',{method:'POST',headers:h,body:JSON.stringify({request:D.request,decision:decision,scope:sel})}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{s:r.status,j:j}})}).then(function(x){
    if(x.s===401){$('tk').hidden=false;token='';return err(X.needToken)}
    if(x.s!==200||!x.j.redirect)return err(x.j.error||X.err.replace('{code}',x.s));
    if(!/^(https:\\/\\/|http:\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])[:\\/])/.test(x.j.redirect))return err(X.badRedirect);
    $('ok').textContent=X.going;location.assign(x.j.redirect);
  }).catch(function(e){err(X.noServer.replace('{error}',e.message))});
}
$('ok').addEventListener('click',function(){if(!$('ok').disabled)go('approve')});$('no').addEventListener('click',function(){go('deny')});
})();`;
  return { html: shell(L, _t('Cấp phép kết nối agent'), body, n, '<script type="application/json" id="gc-data">' + safeJSON(data) + '</script><script nonce="' + n + '">' + js + '</script>'), csp: csp(n) };
}

module.exports = { consentPage, errorPage };
