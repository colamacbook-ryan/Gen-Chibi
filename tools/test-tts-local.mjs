// gen-chibi — test 2k2: giọng đọc TTS LOCAL miễn phí (v0.25.1, INT-23) với máy TTS GIẢ kiểu OpenAI (tools/fake-tts.mjs, chỉ 127.0.0.1) —
// không mạng ngoài, không gọi Google (Gemini giả đếm lời gọi). Kiểm:
//   đường local thành công (VieNeu /v1/voices + Kokoro /v1/audio/voices, quét lúc chạy) · WAV stereo / luồng chuẩn hoá được · lưu đệm (không gọi lại) ·
//   bản đồ vai → giọng (giọng vùng × giới, giọng không có → mặc định + cảnh báo, không lỗi) · máy TTS chết → Gemini (chủ máy) / lỗi (kênh khác, 0 lời gọi Google) ·
//   WAV rác / float / quá 20 MB / treo → từ chối · base_url ngoài máy / mạng riêng → từ chối (cả DNS trỏ ra ngoài lúc nối) · agent gửi base_url → FORBIDDEN ·
//   trần ngày toàn máy + theo kênh · dock (khu Tạo tác) dùng local, khu khác không · clip local nhúng được vào phim (clipFile có lang).
// © 2026 Gen Labs — All rights reserved.
import fs from 'fs';
import os from 'os';
import path from 'path';
import dns from 'dns';
import { createRequire } from 'module';
import { startFakeTts, wav } from './fake-tts.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const V = require(ROOT + '/server/voice.js'), TL = require(ROOT + '/server/tts-local.js');
const { MCP } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js');
let fails = 0;
const ok = (c, msg, detail) => { if (c) console.log('   ✓ ' + msg); else { fails++; console.log('   ✗ ' + msg + (detail ? ' — ' + String(detail).slice(0, 400) : '')); } };
const tmp = [], mk = p => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); tmp.push(d); return d; };
const mem = () => { const m = {}; return { get: k => m[k] || '', set: (k, v) => { if (v) m[k] = v; else delete m[k]; } }; };
const err = async fn => { try { await fn(); return null; } catch (e) { return e; } };
const pcm = n => { const b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(9000 * Math.sin(i / 10)), i * 2); return b; };

// Gemini GIẢ: đếm mọi lời gọi (kênh không chi tiêu phải giữ con số này = 0)
const gem = { calls: 0 };
const gemHttp = {
  get: async () => { gem.calls++; return { status: 200, json: { models: [{ name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] }], voices: [] } }; },
  post: async () => { gem.calls++; return { status: 200, json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm(24000).toString('base64') } }] } }] } }; }
};
const S = await startFakeTts({ list: 'vieneu', speech: 'ok' }), K = await startFakeTts({ list: 'kokoro', speech: 'ok' });
const sec = mem(), dir = mk('gc-ttsl-'), v = new V.Voice({ dataDir: dir, secrets: sec, http: gemHttp, inDocker: false });
const speech = s => s.calls.filter(c => c.method === 'POST');
const L1 = { text: 'Tử Long! Đấu với ta!', voice: 'Charon', role: 'vo-tuong', state: 'rage', bubble: 'shout', lang: 'vi', accent: 'bac' };

try {
  /* ---------------------------------------------------------------- 1. base_url an toàn (chống SSRF) */
  const good = ['http://127.0.0.1:8000', 'http://localhost:8000/', 'http://host.docker.internal:8880', 'http://10.1.2.3:8000', 'http://172.20.0.5:8000', 'http://192.168.1.9:8000/tts',
    'http://[::1]:8000', 'http://[fd00::5]:8000', 'http://vieneu-tts:8000', 'https://kokoro:8880'];
  const bad = ['http://8.8.8.8:8000', 'http://169.254.169.254/latest', 'http://example.com:8000', 'http://localhost.evil.com', 'ftp://127.0.0.1', 'http://u:p@127.0.0.1:8000',
    'http://172.32.0.1', 'http://100.64.0.1', 'http://0.0.0.0:8000', 'http://127.0.0.1:8000/?x=1', 'http://127.0.0.1:8000/a b', 'file:///etc/passwd', 'http://[2001:db8::1]', 'javascript:alert(1)'];
  const gBad = good.filter(u => { try { TL.safeBase(u); return false; } catch { return true; } }), bOk = bad.filter(u => { try { TL.safeBase(u); return true; } catch { return false; } });
  ok(!gBad.length && !bOk.length, 'base_url: chỉ nhận loopback / host.docker.internal / IP riêng / tên container (' + good.length + ' nhận, ' + bad.length + ' từ chối)', JSON.stringify({ gBad, bOk }));
  const c0 = JSON.stringify(v.config().local);
  const e1 = await err(() => v.setConfig({ local: { lang: 'vi', base_url: 'http://8.8.8.8:8000' } }));
  ok(e1 && e1.code === 400 && JSON.stringify(v.config().local) === c0, 'base_url ngoài máy / mạng riêng → 400, không ghi gì', e1 && e1.message);
  // tên miền phân giải ra IP công khai (hay đổi DNS sau khi chủ máy đặt) → chặn lúc NỐI (lookup có rào)
  const realLookup = dns.lookup;
  dns.lookup = (h, o, cb) => { if (typeof o === 'function') cb = o; if (h === 'tts-box') return o && o.all ? cb(null, [{ address: '93.184.216.34', family: 4 }]) : cb(null, '93.184.216.34', 4); return realLookup(h, o, cb); };
  const e2 = await err(() => TL.request('GET', 'http://tts-box:' + S.port + '/v1/voices', null, { timeout: 2000 }));
  dns.lookup = realLookup;
  ok(e2 && e2.code === 400 && /mạng riêng/.test(e2.message) && !S.calls.length, 'tên container phân giải ra IP công khai → chặn lúc nối (không gửi gì)', e2 && (e2.code + ' ' + e2.message));

  /* ---------------------------------------------------------------- 2. đường local thành công + bản đồ vai → giọng */
  v.setConfig({ local: { lang: 'vi', enabled: true, base_url: S.url, model: 'vieneu', voice: '' } });
  v.setConfig({ local: { lang: 'zh', enabled: true, base_url: K.url, model: 'kokoro', voice: 'zf_xiaobei' } });
  v.setConfig({ local: { lang: 'en', enabled: false } });
  const r1 = await v.line(Object.assign({}, L1, { chan: 'link' })), sp1 = speech(S);
  const f1 = v.clipPath(r1.id), w1 = f1 && fs.existsSync(f1) ? V.wavInfo(fs.readFileSync(f1)) : null;
  ok(r1.provider === 'local' && !r1.cached && sp1.length === 1 && sp1[0].body.model === 'vieneu' && sp1[0].body.response_format === 'wav' && sp1[0].body.input === 'Tử Long! Đấu với ta!' && w1 && w1.ch === 1 && w1.bits === 16 && gem.calls === 0,
    'đường local: POST /v1/audio/speech (model, voice, input, wav) → clip WAV mono 16-bit, 0 lời gọi Google', JSON.stringify({ r1, body: sp1[0] && sp1[0].body, gem: gem.calls }));
  ok(sp1[0].body.voice === 'Binh' || sp1[0].body.voice === 'Tuyen', 'bản đồ vai: võ tướng giọng Bắc → giọng nam miền Bắc có thật trên máy TTS (quét /v1/voices)', sp1[0].body.voice);
  const r1b = await v.line(Object.assign({}, L1, { chan: 'link' }));
  ok(r1b.cached && r1b.id === r1.id && speech(S).length === 1, 'câu đã đọc local → lưu đệm, không gọi lại máy TTS');
  ok(v.clipFile(L1) === f1 && v.has(L1) && !v.clipFile(Object.assign({}, L1, { lang: undefined })), 'clipFile / has (xuất phim, đếm "giọng AI x/y") tìm được clip local theo lang (không gọi mạng)');
  await v.line({ text: 'Chị ơi', voice: 'Kore', role: 'nu-tre', lang: 'vi', accent: 'nam', chan: 'owner' });
  ok(speech(S).slice(-1)[0].body.voice === 'Ngoc', 'chưa có giọng nữ miền Nam → giọng nữ cùng giới của vùng khác (Ngọc), không lấy giọng nam', speech(S).slice(-1)[0].body.voice);
  // Kokoro: /v1/voices 404 → /v1/audio/voices; vai nam không có giọng zm_* trên máy → giọng mặc định của ngôn ngữ + cảnh báo, KHÔNG lỗi
  const r2 = await v.line({ text: '你好，将军', voice: 'Charon', role: 'vo-tuong', lang: 'zh', accent: 'pt', chan: 'oauth' }), kb = speech(K).slice(-1)[0];
  ok(r2.provider === 'local' && kb && kb.body.voice === 'zf_xiaobei' && /mặc định/.test(r2.warning || '') && K.calls.some(c => c.path === '/v1/audio/voices') && kb.body.model === 'kokoro',
    'giọng không có trên máy TTS → giọng mặc định (zf_xiaobei) + cảnh báo, không lỗi; Kokoro quét /v1/audio/voices', JSON.stringify({ r2, body: kb && kb.body }));
  const r3 = await v.line({ text: '小姐好', voice: 'Kore', role: 'tieu-thu', lang: 'zh', accent: 'pt', chan: 'oauth' });
  ok(['zf_xiaobei', 'zf_xiaoni'].indexOf(speech(K).slice(-1)[0].body.voice) >= 0 && !r3.warning, 'vai nữ tiếng Trung → giọng zf_* có thật, không cảnh báo', speech(K).slice(-1)[0].body.voice);
  // WAV stereo + WAV ghi theo luồng (cỡ data 0xFFFFFFFF) → trộn mono / đọc tới hết tệp, cùng đường chuẩn hoá
  S.mode.speech = 'stereo'; const r4 = await v.line({ text: 'Stereo', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'owner' });
  S.mode.speech = 'hd'; const r6 = await v.line({ text: 'VieNeu 48 kHz', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'owner' }), w6 = V.wavInfo(fs.readFileSync(v.clipPath(r6.id)));
  ok(w6.rate === 48000 && w6.ch === 1 && w6.bits === 16 && r6.seconds > 0.3, 'WAV 48 kHz (VieNeu) đi qua đường chuẩn hoá hiện có (cắt lặng + đỉnh), giữ 48 kHz', JSON.stringify([w6.rate, r6.seconds]));
  S.mode.speech = 'streamed'; const r5 = await v.line({ text: 'Theo luồng', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'owner' });
  const w4 = V.wavInfo(fs.readFileSync(v.clipPath(r4.id))), w5 = V.wavInfo(fs.readFileSync(v.clipPath(r5.id)));
  ok(w4.ch === 1 && w4.rate === 22050 && w5.ch === 1 && r5.seconds > 0.3, 'WAV stereo → mono (giữ tần số mẫu), WAV theo luồng đọc được', JSON.stringify({ w4: [w4.ch, w4.rate], s5: r5.seconds }));

  /* ---------------------------------------------------------------- 3. WAV rác / dạng lạ / quá cỡ / treo → từ chối */
  for (const [mode, re] of [['garbage', /RIFF/], ['float', /PCM 16-bit/], ['error', /500/]]) {
    S.mode.speech = mode; const g0 = gem.calls;
    const e = await err(() => v.line({ text: 'Rác ' + mode, voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'link' }));
    const files = fs.readdirSync(v.dir).filter(f => f.endsWith('.tmp'));
    ok(e && e.local && re.test(e.message) && gem.calls === g0 && !files.length && !v.clipFile({ text: 'Rác ' + mode, voice: 'Charon', role: 'nam-tre', lang: 'vi' }), 'WAV ' + mode + ' → từ chối (không lưu clip, kênh link không sang Google)', e && e.message);
  }
  const big = await err(() => TL.request('POST', S.url + '/v1/audio/speech', { input: 'x', response_format: 'wav' }, { max: TL.MAX_BYTES, timeout: 20000 }));
  S.mode.speech = 'big';
  const big2 = await err(() => TL.request('POST', S.url + '/v1/audio/speech', { input: 'x', response_format: 'wav' }, { max: TL.MAX_BYTES, timeout: 20000 }));
  S.mode.speech = 'hang';
  const t0 = Date.now(), hang = await err(() => TL.request('POST', S.url + '/v1/audio/speech', { input: 'x', response_format: 'wav' }, { timeout: 400 }));
  ok(!big && big2 && /20 MB/.test(big2.message) && hang && hang.code === 504 && Date.now() - t0 < 3000, 'phản hồi > 20 MB → bỏ; máy TTS treo → hết giờ (504)', JSON.stringify([big && big.message, big2 && big2.message, hang && hang.message]));
  S.mode.speech = 'ok';

  /* ---------------------------------------------------------------- 4. máy TTS chết → fallback */
  const D = await startFakeTts({}); const deadUrl = D.url; await D.close();
  v.setConfig({ local: { lang: 'vi', base_url: deadUrl } });
  const g1 = gem.calls, eL = await err(() => v.line({ text: 'Máy chết qua link', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'link' }));
  ok(eL && eL.local && eL.code === 503 && gem.calls === g1, 'máy TTS chết + kênh link → lỗi local (503), 0 lời gọi Google', eL && eL.message);
  sec.set('llm.gemini', 'k-test');
  const rG = await v.line({ text: 'Máy chết, chủ máy', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'owner' });
  ok(rG.provider === 'gemini' && gem.calls > g1 && v.publicConfig().local.langs.find(x => x.lang === 'vi').alive === false, 'máy TTS chết + chủ máy có key → rơi về Gemini; Cài đặt AI thấy "không phản hồi"', JSON.stringify(rG));
  sec.set('llm.gemini', '');
  const eN = await err(() => v.line({ text: 'Máy chết, không key', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'owner' }));
  ok(eN && eN.code === 409 && /TTS local/.test(eN.message), 'máy TTS chết + không key → 409 kèm lý do local (Studio rơi về giọng trình duyệt)', eN && eN.message);
  v.setConfig({ local: { lang: 'vi', base_url: S.url } });

  /* ---------------------------------------------------------------- 5. trần ngày: toàn máy + theo kênh */
  const day = new Date().toISOString().slice(0, 10), setUse = u => { const c = v.config(); c.localUsage = { [day]: u }; v.write(c); };
  setUse({ all: 10, link: 100 });
  const eC = await err(() => v.line({ text: 'Link quá trần', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'link' }));
  const rO = await v.line({ text: 'Chủ máy vẫn đọc', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'owner' });
  ok(eC && eC.code === 429 && eC.cap && eC.local && eC.retryAt && rO.provider === 'local' && v.localDay().owner === 1 && v.localDay().all === 11, 'trần theo kênh: link đủ 100 câu → 429 (retryAt), chủ máy vẫn đọc; đếm theo kênh', JSON.stringify([eC && eC.message, v.localDay()]));
  v.setConfig({ localCap: 12 }); setUse({ all: 12 });
  const eA = await err(() => v.line({ text: 'Máy quá trần', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'ui' }));
  ok(eA && eA.code === 429 && eA.cap && /trần/.test(eA.message), 'trần toàn máy (chủ máy đặt 12) → 429 cho mọi kênh', eA && eA.message);
  v.setConfig({ localCap: 500 }); setUse({});

  /* ---------------------------------------------------------------- 6. MCP: mọi kênh ghi dùng local, agent không đặt được base_url, dock ở khu Tạo tác */
  const st = new Store(mk('gc-ttsl-st-')), m = new MCP({ engine: loadEngine(ROOT), store: st, version: 't', system: {}, voice: v });
  const cfgBefore = JSON.stringify(v.config().local);
  const sneak = [];
  for (const k of ['base_url', 'baseUrl', 'provider', 'model', 'url']) {
    const r = await m.callTool('render_voice', { text: 'Xin chào', role: 'nam-tre', lang: 'vi', [k]: 'http://8.8.8.8:8000' }, {});
    if (!(r.isError && /FORBIDDEN/.test(r.content[0].text))) sneak.push(k);
  }
  const schemaLeak = m.toolsFor('mcp').filter(t => /base_?url|endpoint/i.test(JSON.stringify(t.inputSchema)));
  ok(!sneak.length && !schemaLeak.length && JSON.stringify(v.config().local) === cfgBefore && !S.calls.some(c => /8\.8\.8\.8/.test(JSON.stringify(c))), 'agent gửi base_url / provider / model → FORBIDDEN (kể cả token chủ máy), không tool nào có ô địa chỉ, cấu hình không đổi', JSON.stringify({ sneak, schemaLeak: schemaLeak.map(t => t.name) }));
  const g2 = gem.calls, chans = [['link', { viaLink: true }], ['oauth', { viaLink: true, viaOAuth: true, oauthScope: 'mcp:write' }], ['ui', { channel: 'ui', zone: 'tao-tac' }], ['owner', {}]];
  const res = [];
  for (const [n, ctx] of chans) { const r = await m.callTool('render_voice', { text: 'Kênh ' + n, role: 'nam-tre', lang: 'vi', include_audio: true }, ctx); res.push([n, r]); }
  const bad6 = res.filter(([, r]) => r.isError || r.structuredContent.provider !== 'local' || r.content[1].type !== 'audio');
  ok(!bad6.length && gem.calls === g2 && v.localDay().link === 1 && v.localDay().oauth === 1 && v.localDay().ui === 1, 'render_voice qua link / OAuth mcp:write / dock Tạo tác / chủ máy → TTS local (provider local, có WAV), 0 lời gọi Google', JSON.stringify(bad6.map(([n, r]) => n + ': ' + r.content[0].text)));
  const rx = await m.callTool('render_voice', { text: 'Ở Xưởng', role: 'nam-tre', lang: 'vi' }, { channel: 'ui', zone: 'xuong' });
  v.setConfig({ local: { lang: 'en', enabled: false } });
  const ry = await m.callTool('render_voice', { text: 'No local english', role: 'nam-tre', lang: 'en' }, { channel: 'ui', zone: 'tao-tac' });
  ok(rx.isError && /FORBIDDEN/.test(rx.content[0].text) && ry.isError && /FORBIDDEN/.test(ry.content[0].text) && gem.calls === g2 && m.toolsFor('ui', 'tao-tac').some(t => t.name === 'render_voice') && !m.toolsFor('ui', 'xuong').some(t => t.name === 'render_voice'),
    'dock: render_voice chỉ ở khu Tạo tác; ngôn ngữ chưa có TTS local → FORBIDDEN, không sang Google', rx.content[0].text + ' | ' + ry.content[0].text);
  const sh = await m.callTool('start_here', {}, {}), sj = JSON.parse(sh.content[0].text);
  ok(sj.voices && sj.voices.local.vi === 'up' && sj.voices.local.en === 'off' && /local TTS/.test(sj.voices.note) && sj.rules.some(r => /free local TTS/.test(r)), 'start_here: voices.local theo ngôn ngữ + luật vàng nhắc TTS local', JSON.stringify(sj.voices));
  const pc = v.publicConfig().local, pvi = pc.langs.find(x => x.lang === 'vi');
  ok(pvi.alive === true && pvi.voices === 4 && pc.today.all >= 4 && pc.cap === 500 && pc.chanCaps.link === 100 && pc.langs.find(x => x.lang === 'yue').provider === 'gemini', 'Cài đặt AI: mỗi ngôn ngữ provider / sống / số giọng / đã dùng hôm nay / trần', JSON.stringify(pc).slice(0, 300));
  // giá trị khởi tạo: Docker → host.docker.internal, cài thẳng → 127.0.0.1; yue giữ Gemini
  const vd = new V.Voice({ dataDir: mk('gc-ttsl-d-'), secrets: mem(), http: gemHttp, inDocker: true }).localLangs(), vn = new V.Voice({ dataDir: mk('gc-ttsl-n-'), secrets: mem(), http: gemHttp, inDocker: false }).localLangs();
  ok(vd.vi.base_url === 'http://vieneu-tts-api-cpu:8000' && vd.en.base_url === 'http://vieneu-tts-api-cpu:8000' && vd.zh.base_url === 'http://kokoro:8880' && vd.zh.voice === 'zf_xiaobei' && vn.en.base_url === 'http://127.0.0.1:8001' && vn.vi.model === 'vieneu' && !vd.yue.enabled
    && !/host\.docker\.internal/.test(JSON.stringify(vd)) && !/extra_hosts/.test(fs.readFileSync(ROOT + '/docker-compose.yml', 'utf8')),
    'giá trị khởi tạo: Docker → tên container trong gen-chibi_default (vieneu-tts-api-cpu:8000, kokoro:8880 zf_xiaobei), cài thẳng → 127.0.0.1; yue → Gemini; compose không thêm extra_hosts', JSON.stringify({ vd, vn }).slice(0, 300));
  // tên container không phân giải (mạng Docker tạo lại) → lỗi kèm lệnh sửa; hạn giờ theo độ dài câu (≥ 120 s), hàng đợi có trần
  v.setConfig({ local: { lang: 'vi', base_url: 'http://tts-mat-mang:8000' } });
  const eH = await err(() => v.line({ text: 'Mất mạng Docker', voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'link' })), ph = v.publicConfig().local.langs.find(x => x.lang === 'vi');
  ok(eH && /docker network connect gen-chibi_default tts-mat-mang/.test(eH.message) && ph.hint === 'docker network connect gen-chibi_default tts-mat-mang', 'tên container không tới được → "không tới được server giọng" + lệnh docker network connect (lỗi + Cài đặt AI)', eH && eH.message);
  v.setConfig({ local: { lang: 'vi', base_url: S.url } });
  const seen = []; const slow = new V.Voice({ dataDir: mk('gc-ttsl-q-'), secrets: mem(), http: gemHttp, inDocker: false,
    localHttp: (m, u, b, o) => { if (m === 'GET') return TL.request(m, u, b, o); seen.push(o.timeout); return new Promise(() => {}); } });
  slow.setConfig({ local: { lang: 'vi', base_url: S.url } });
  const pend = []; for (let i = 0; i < 6; i++) pend.push(slow.line({ text: 'Câu ' + i + ' ' + 'x'.repeat(i * 40), voice: 'Charon', role: 'nam-tre', lang: 'vi', chan: 'link' }).catch(e => e));
  await new Promise(r => setTimeout(r, 200));
  const busy = await Promise.race([Promise.all(pend.slice(4)), new Promise(r => setTimeout(() => r(null), 3000))]);
  ok(seen.length === 1 && seen[0] >= 120000 && busy && busy.every(e => e && e.busy && e.code === 503), 'máy TTS chậm: một câu một lúc (hàng đợi), hạn giờ ≥ 120 s theo độ dài câu, hàng đợi đầy → 503 bận ngay (không treo)', JSON.stringify({ seen, busy: busy && busy.map(e => e && e.message) }));
} catch (e) { fails++; console.log('   ✗ test-tts-local ném lỗi: ' + (e && e.stack)); }
finally {
  await S.close(); await K.close();
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
}
console.log(fails ? '   ✗ TTS local: ' + fails + ' lỗi' : '   ✓ TTS local (v0.25.1): mọi ca đạt');
process.exit(fails ? 1 : 0);
