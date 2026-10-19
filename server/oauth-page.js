// gen-chibi — trang "Cấp phép kết nối agent" (v0.19). Tự chứa: một HTML, CSS + JS nhúng (nonce CSP), không tải tệp Studio nào —
// nên tunnel / proxy chỉ cần mở đúng /oauth/authorize + /api/oauth/approve. Mọi chữ do agent tự khai đặt bằng textContent (không innerHTML).
// © 2026 Gen Labs — All rights reserved.
'use strict';
const crypto = require('crypto');

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

function shell(title, bodyHtml, nonce, script) {
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">' +
    '<title>' + esc(title) + ' · gen-chibi</title><style nonce="' + nonce + '">' + CSS + '</style></head><body><main class="panel"><h1>' + esc(title) + '</h1>' + bodyHtml +
    '<div class="foot">gen-chibi · © 2026 Gen Labs — Chỉ chủ máy cấp phép được. Bạn có thể đóng trang này để từ chối.</div></main>' + (script || '') + '</body></html>';
}
const nonce = () => crypto.randomBytes(16).toString('base64');
const csp = n => "default-src 'none'; script-src 'nonce-" + n + "'; style-src 'nonce-" + n + "'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// lỗi trước khi tin được redirect_uri: hiện trang, KHÔNG chuyển hướng
function errorPage(message) {
  const n = nonce();
  return { html: shell('Không cấp phép được', '<div class="pad"><div class="alert bad" id="m"></div><div class="note">Không có gì được cấp. Quay lại agent và thử kết nối lại.</div></div>', n,
    '<script nonce="' + n + '">document.getElementById("m").textContent=' + safeJSON(String(message).slice(0, 400)) + ';</script>'), csp: csp(n) };
}

// view: kết quả OAuth.authorize().view; opts: { needToken, publicHost }
function consentPage(view, opts) {
  const n = nonce();
  const data = Object.assign({ needToken: !!opts.needToken, publicHost: opts.publicHost || '' }, view);
  const body = '<div class="pad">' +
    '<div>Một agent muốn kết nối vào <b>gen-chibi</b> của bạn (<span class="mono" id="ph"></span>) để đọc / tạo asset qua MCP. Chỉ bấm <b>Cấp phép</b> nếu chính bạn vừa thêm kết nối này.</div>' +
    '<div class="kv"><label>Tên agent</label><div><b id="cn"></b> <span class="note">(agent tự khai — không phải bằng chứng danh tính)</span></div>' +
    '<label>Quay về</label><div><span class="mono" id="cb"></span><span class="chip" id="cc"></span></div>' +
    '<label>Agent xin</label><div class="mono" id="rq"></div></div>' +
    '<div class="alert" id="warn" hidden></div>' +
    '<div><div class="lbl">Phạm vi cấp (đổi lại được ở Studio › Hệ thống › Kết nối agent)</div><div class="scopes" id="sc" role="radiogroup" aria-label="Phạm vi cấp"></div></div>' +
    '<div id="tk" hidden><label for="tki" class="note">Token chủ máy (GC_API_TOKEN) — để chứng minh bạn là chủ máy</label><input id="tki" type="password" autocomplete="current-password" placeholder="GC_API_TOKEN"></div>' +
    '<div class="alert bad" id="er" hidden></div>' +
    '<div class="row"><button class="btn" id="no" type="button">Từ chối</button><button class="btn primary" id="ok" type="button">Cấp phép</button></div></div>';
  const js = `(function(){
var D=JSON.parse(document.getElementById('gc-data').textContent),$=function(i){return document.getElementById(i)};
$('ph').textContent=D.publicHost;$('cn').textContent=D.client;$('cb').textContent=D.callback.host;
var cbOk=D.callback.known||D.callback.loopback||D.callback.added;
$('cc').textContent=D.callback.loopback?'máy của bạn (CLI)':D.callback.known?'tên miền quen':D.callback.added?'bạn đã thêm (GC_OAUTH_REDIRECTS)':'tên miền lạ';$('cc').className='chip '+(cbOk?'ok':'warn');
$('rq').textContent=D.requested.length?D.requested.join(' '):'(không nói rõ — bạn chọn bên dưới)';
if(!cbOk){$('warn').hidden=false;$('warn').textContent='Tên miền '+D.callback.host+' không phải của claude.ai. Chỉ cấp nếu bạn tự thêm agent này.';}
var sel=D.scope;
D.scopes.forEach(function(s){var l=document.createElement('label');l.className='scope';var r=document.createElement('input');r.type='radio';r.name='scope';r.value=s.id;r.checked=s.id===sel;r.addEventListener('change',function(){sel=s.id});
var b=document.createElement('b');b.textContent=s.label+' ('+s.id+')';var d=document.createElement('span');d.textContent=s.desc;l.appendChild(r);l.appendChild(b);l.appendChild(d);$('sc').appendChild(l);});
var token='';try{token=localStorage.getItem('gc-token')||''}catch(e){}
if(D.needToken&&!token)$('tk').hidden=false;
// chống bấm nhầm / clickjacking qua popup: nút Cấp phép chỉ bật sau 800 ms kể từ khi trang hiện hoặc nhận lại focus (hẹn giờ đặt lại mỗi lần)
var armT=0,busy=false;
function arm(){$('ok').disabled=true;clearTimeout(armT);armT=setTimeout(function(){if(!busy)$('ok').disabled=false;},800);}
arm();window.addEventListener('focus',arm);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')arm();});
function err(m){busy=false;$('er').hidden=false;$('er').textContent=m;$('no').disabled=false;arm();}
function go(decision){
  busy=true;$('er').hidden=true;$('ok').disabled=true;$('no').disabled=true;
  var t=$('tki').value.trim()||token,h={'Content-Type':'application/json','X-GC-Request':'1'};if(t)h.Authorization='Bearer '+t;
  fetch('/api/oauth/approve',{method:'POST',headers:h,body:JSON.stringify({request:D.request,decision:decision,scope:sel})}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{s:r.status,j:j}})}).then(function(x){
    if(x.s===401){$('tk').hidden=false;token='';return err('Cần token chủ máy (GC_API_TOKEN) đúng để cấp phép.')}
    if(x.s!==200||!x.j.redirect)return err(x.j.error||('Lỗi '+x.s));
    if(!/^(https:\\/\\/|http:\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])[:\\/])/.test(x.j.redirect))return err('Địa chỉ quay về không hợp lệ.');
    $('ok').textContent='Đang quay về agent…';location.assign(x.j.redirect);
  }).catch(function(e){err('Không gọi được máy chủ: '+e.message)});
}
$('ok').addEventListener('click',function(){if(!$('ok').disabled)go('approve')});$('no').addEventListener('click',function(){go('deny')});
})();`;
  return { html: shell('Cấp phép kết nối agent', body, n, '<script type="application/json" id="gc-data">' + safeJSON(data) + '</script><script nonce="' + n + '">' + js + '</script>'), csp: csp(n) };
}

module.exports = { consentPage, errorPage };
