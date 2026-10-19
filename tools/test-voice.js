// gen-chibi — test 2k: giọng AI (server/voice.js) với mạng GIẢ — không bao giờ gọi Google, không tốn hạn mức.
// Kiểm: thẻ cảm xúc, chặn chèn thẻ, cắt lặng + chuẩn hoá, dán key là chạy, lưu đệm theo nội dung, model 3.8 đọc qua Interactions API
// (chữ nguyên văn + speech_metadata.style), model đời trước qua generateContent + [thẻ], đổi model khi hết hạn mức (429 + retryDelay),
// hết hẳn → 429 có giờ thử lại, giọng theo VAI (thư viện Google theo giới + tuổi + cao độ, giọng thiết kế, giọng dựng sẵn), thiết kế giọng
// (vai trẻ em bị chặn), dry chỉ lấy clip có sẵn, ngôn ngữ / giọng vùng của tác phẩm.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const V = require(ROOT + '/server/voice.js');
const no = (c, msg) => { if (c) { console.log('   ✗', msg); process.exit(1); } };
const mem = () => { const m = {}; return { get: k => m[k] || '', set: (k, v) => { if (v) m[k] = v; else delete m[k]; } }; };
// PCM 16-bit: 0,2 s lặng — sóng 220 Hz biên độ 9000 (khuếch đại ≤ 4 lần — clip quá nhỏ không bị thổi ồn) — 0,3 s lặng
const pcm = (rate, sec) => { const n = Math.round(rate * (sec || 1)), b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) { const t = i / rate, v = t > 0.2 && t < (sec || 1) - 0.3 ? Math.round(9000 * Math.sin(2 * Math.PI * 220 * t)) : 0; b.writeInt16LE(v, i * 2); } return b; };
const MODELS = { status: 200, json: { models: [
  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-lite-tts', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-2.5-flash-native-audio-latest', supportedGenerationMethods: ['bidiGenerateContent'] }] } };
// thư viện giọng giả (dạng trả về thật của GET /v1beta/voices, 2026-10-19): tuổi nằm trong mô tả
const lv = (id, g, pitch, age) => ({ id, type: 'prebuilt', display_name: id, language_code: 'vi-VN', gender: g, pitch, description: age + '-year-old Teacher from Vietnam. Speaks Vietnamese.' });
const LIB = { status: 200, json: { voices: [
  lv('vi-vn-tutor-2', 'male', 'low', 62), lv('vi-vn-tutor-7', 'male', 'low', 55), lv('vi-vn-training-6', 'male', 'low', 49), lv('vi-vn-assistant-5', 'male', 'low', 40),
  lv('vi-vn-concierge-1', 'male', 'low', 22), lv('vi-vn-training-4', 'female', 'medium', 55), lv('vi-vn-tutor-8', 'female', 'high', 22), lv('vi-vn-csagent-2', 'female', 'low', 53),
  { id: 'kore', type: 'prebuilt', display_name: 'Kore', language_code: 'vi-VN', gender: 'female', pitch: 'medium', description: 'Firm voice' },
  { id: 'evil; drop', type: 'prebuilt', gender: 'male', description: '99-year-old' }] } };
const okI = data => withWav(FX('interactions-ok'), data);   // dạng thật của Interactions API (steps[].model_output.content[].audio)
const okG = (data, mime) => ({ status: 200, json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: data.toString('base64') } }] } }] } });
const quota = s => ({ status: 429, json: { error: { code: 429, message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: s + 's' }] } } });
const designed = id => { const f = withWav(FX('design-ok'), V.wavOf(pcm(24000, 40), 24000)); f.json.id = id; return f; };   // dạng thật của POST /v1beta/voices
// phản hồi THẬT của Google đã đo (tools/fixtures/voice, 2026-10-19) — mock dựng từ đây, không tự bịa định dạng (CNS-084, L-54)
const FX = n => { const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/voice', n + '.json'), 'utf8')); delete f._meta; return f; };
const withWav = (f, wav) => JSON.parse(JSON.stringify(f).split('"<WAV>"').join(JSON.stringify(wav.toString('base64'))));
const rejectAll = (fn, msg) => fn().then(() => no(true, msg + ': phải lỗi'), e => e);

(async () => {
  // thẻ cảm xúc + chặn chèn thẻ
  no(V.tagsOf('rage', 'shout') !== 'angry, shouting' || V.tagsOf('normal', 'say') !== '', 'thẻ cảm xúc sai: ' + V.tagsOf('rage', 'shout'));
  no(/[[\]]/.test(V.cleanText('[whispering] xin [chào]')), 'chữ người dùng không được chèn thẻ [ ]');
  no(!V.interactive('gemini-3.8-flash-tts') || !V.interactive('gemini-4.0-flash-tts') || V.interactive('gemini-2.5-flash-preview-tts') || V.interactive('gemini-3.1-flash-tts-preview'), 'model 3.8+ mới đi Interactions API');
  // cắt lặng + chuẩn hoá đỉnh
  const t = V.tidy(pcm(24000), 24000), n = t.length / 2; let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(t.readInt16LE(i * 2)));
  no(Math.abs(n / 24000 - 0.62) > 0.03, 'cắt lặng: còn ' + (n / 24000).toFixed(2) + ' s, phải ~0,62 s (0,5 s tiếng + 2 × 60 ms)');
  no(pk < 28500 || pk > 29300, 'chuẩn hoá đỉnh về -1 dBFS: ' + pk);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-voice-')), calls = [], gets = [];
  let plan = [], models = MODELS;   // hàng đợi phản hồi giả cho post · phản hồi giả cho lệnh liệt kê model
  const http = {
    get: async u => { gets.push(u); return /\/voices\?/.test(u) ? LIB : models; },
    post: async (u, b) => { calls.push({ u, b }); const p = plan.shift(); if (p) return p; return /\/voices$/.test(u) ? designed('voice_abc123xyz') : /\/interactions$/.test(u) ? okI(V.wavOf(pcm(24000), 24000)) : okG(pcm(24000), 'audio/L16;codec=pcm;rate=24000'); }
  };
  const sec = mem(), v = new V.Voice({ dataDir: dir, secrets: sec, http });
  const L = { text: 'Tử Long! Đấu với ta!', voice: 'Charon', role: 'vo-tuong', state: 'rage', bubble: 'shout' };
  // chưa có key → 409 nhắc key; có key là TỰ BẬT (dán key là chạy); chủ máy tắt hẳn → 409
  let e = await rejectAll(() => v.line(L), 'chưa có key'); no(e.code !== 409 || !/key/i.test(e.message), 'chưa có key phải 409 nhắc key');
  sec.set('llm.gemini', 'k-test');   // dùng chung key Gemini của AI đạo diễn
  no(v.publicConfig().keySource !== 'llm' || JSON.stringify(v.publicConfig()).indexOf('k-test') >= 0, 'không được trả key ra ngoài; phải biết nguồn key');
  no(!v.publicConfig().enabled, 'có key là tự bật, không cần cấu hình thêm');
  v.setConfig({ enabled: false });
  e = await rejectAll(() => v.line(L), 'đang tắt'); no(e.code !== 409 || !/tắt/.test(e.message) || v.publicConfig().enabled, 'chủ máy tắt hẳn phải 409');
  v.setConfig({ enabled: true });
  // dán key: kiểm ngay bằng lệnh liệt kê model (miễn phí) — key dạng lạ / Google từ chối → 400, giữ nguyên key cũ; key tốt → lưu + bật
  e = await rejectAll(() => v.connect('ngan'), 'key ngắn'); no(e.code !== 400, 'key dạng lạ phải 400');
  models = { status: 403, json: { error: { code: 403, message: 'API key not valid' } } };
  e = await rejectAll(() => v.connect('fake-bad-key-0000000000000000000'), 'key bị từ chối');
  no(e.code !== 400 || !/từ chối/.test(e.message) || sec.get('voice.gemini') !== '' || v.keySource() !== 'llm', 'Google từ chối key → 400, không lưu key hỏng: ' + e.message);
  models = MODELS;
  const cn = await v.connect('fake-good-key-11111111111111111111');
  no(!cn.enabled || cn.keySource !== 'voice' || cn.models.length !== 3 || JSON.stringify(cn).indexOf('fake-good') >= 0, 'key tốt phải lưu + bật + báo số model, không trả key ra');
  no(cn.roles.length !== 22 || cn.roles.find(r => r.id === 'be-trai').design || !cn.roles.find(r => r.id === 'ong-lao').design || cn.langs.map(l => l.id).join() !== 'vi,en,zh,yue', 'publicConfig phải có 22 vai (vai trẻ em không thiết kế được) + 4 ngôn ngữ (vi, en, zh, yue)');
  // model quét lúc chạy: chỉ *-tts có generateContent, mới nhất trước, lite sau, preview sau cùng
  const ms = await v.models();
  no(JSON.stringify(ms) !== JSON.stringify(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts']), 'thứ tự model đọc giọng sai: ' + ms.join(', '));

  // model 3.8: Interactions API — chữ NGUYÊN VĂN (không thẻ), cách nói của vai + cảm xúc ở speech_metadata.style, giọng ở speech_config
  const r1 = await v.line(L), b1 = calls[0].b;
  no(r1.cached || calls.length !== 1 || !/\/interactions$/.test(calls[0].u) || b1.model !== 'gemini-3.8-flash-tts', 'model 3.8 phải gọi Interactions API: ' + calls[0].u);
  no(b1.input[0].content[0].text !== 'Tử Long! Đấu với ta!' || b1.input[0].content[0].annotations[0].style !== 'booming, commanding, powerful, angry, shouting' || b1.generation_config.speech_config[0].voice !== 'Charon',
    'chữ nguyên văn + style (cách nói vai + cảm xúc) + giọng: ' + JSON.stringify(b1).slice(0, 300));
  no(!fs.existsSync(v.clipPath(r1.id)) || !V.wavInfo(fs.readFileSync(v.clipPath(r1.id))), 'clip phải lưu thành WAV');
  const r2 = await v.line(L); no(!r2.cached || calls.length !== 1 || r2.id !== r1.id, 'câu đã đọc phải lấy từ lưu đệm, không gọi lại API');
  no((await v.line(Object.assign({}, L, { role: 'ong-lao' }))).id === r1.id, 'đổi vai (cách nói khác) phải ra clip khác');
  // giọng thư viện / giọng thiết kế chỉ là id hợp lệ — chữ tự do làm giọng bị chặn
  for (const bad of ['KhongCo', 'vi vn tutor', 'voice_', '../x', 'Charon]']) { e = await rejectAll(() => v.line(Object.assign({}, L, { voice: bad })), bad); no(e.code !== 400 || !/giọng/.test(e.message), 'phải chặn giọng ' + bad); }
  // hết hạn mức model đầu → khoá theo retryDelay, chuyển model kế (cũng Interactions)
  plan = [quota(3600)];
  const r3 = await v.line(Object.assign({}, L, { text: 'Câu khác' }));
  no(r3.model !== 'gemini-3.8-flash-lite-tts' || !/\/interactions$/.test(calls[calls.length - 1].u) || calls[calls.length - 1].b.model !== 'gemini-3.8-flash-lite-tts', 'hết hạn mức phải chuyển sang model kế: ' + r3.model);
  const bl = v.publicConfig().blocked; no(bl.length !== 1 || bl[0].model !== 'gemini-3.8-flash-tts' || Date.parse(bl[0].until) < Date.now() + 3500e3, 'model hết hạn mức phải bị khoá ~1 giờ: ' + JSON.stringify(bl));
  // model đời trước (generateContent): chỉ giọng dựng sẵn, cách nói đặt trong [ ] đầu câu; PCM thô (audio/L16) bọc thành WAV
  plan = [quota(7200)];
  const r4 = await v.line(Object.assign({}, L, { text: 'Câu thứ ba' })), b4 = calls[calls.length - 1];
  no(r4.model !== 'gemini-2.5-flash-preview-tts' || !/gemini-2\.5-flash-preview-tts:generateContent$/.test(b4.u) || !/^\[booming, commanding, powerful, angry, shouting\] Câu thứ ba$/.test(b4.b.contents[0].parts[0].text) ||
    b4.b.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName !== 'Charon', 'model đời trước: [thẻ] đầu câu + giọng dựng sẵn: ' + JSON.stringify(b4.b).slice(0, 200));
  no(!V.wavInfo(fs.readFileSync(v.clipPath(r4.id))), 'PCM thô phải được bọc WAV');
  // giọng thư viện không đi model đời trước: hai model 3.8 đang khoá → 429 kèm giờ thử lại, KHÔNG gọi model 2.5
  let before = calls.length;
  e = await rejectAll(() => v.line(Object.assign({}, L, { voice: 'vi-vn-tutor-2', text: 'Câu thư viện' })), 'thư viện khi 3.8 khoá');
  no(e.code !== 429 || !e.retryAt || calls.length !== before, 'giọng thư viện khi model 3.8 hết lượt phải 429 + retryAt, không gọi model đời trước');
  // mọi model hết hạn mức → 429 có giờ thử lại (Studio rơi về giọng trình duyệt)
  plan = [quota(60)];
  e = await rejectAll(() => v.line(Object.assign({}, L, { text: 'Câu thứ tư' })), 'hết hẳn');
  no(e.code !== 429 || !e.retryAt, 'hết mọi model phải 429 kèm retryAt: ' + e.message);
  // khởi động lại (đọc trạng thái từ đĩa) vẫn nhớ model nào đang bị khoá — không đốt thêm lượt
  const v2 = new V.Voice({ dataDir: dir, secrets: sec, http }); before = calls.length;
  e = await rejectAll(() => v2.line(Object.assign({}, L, { text: 'Câu thứ năm' })), 'khởi động lại');
  no(e.code !== 429 || calls.length !== before, 'model đang khoá không được gọi lại sau khởi động');
  // xuất phim chỉ lấy clip đã đọc: dry → 404, không gọi Google
  e = await rejectAll(() => v2.line(Object.assign({}, L, { text: 'Câu chưa đọc', dry: true })), 'dry'); no(e.code !== 404 || calls.length !== before, 'dry phải 404 và không gọi API');
  // câu quá dài / câu trống
  for (const [bad, re] of [[{ text: 'x'.repeat(300) }, /240/], [{ text: '  ' }, /trống/]]) { e = await rejectAll(() => v2.line(Object.assign({}, L, bad)), 'câu xấu'); no(e.code !== 400 || !re.test(e.message), 'phải chặn ' + JSON.stringify(bad).slice(0, 40)); }

  // ---- GIỌNG THEO VAI: cast cả tác phẩm (không tốn lượt — chỉ lệnh liệt kê giọng, lưu 24 giờ) ----
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-voice-')), c3 = [], g3 = [];
  let p3 = [];
  const h3 = { get: async u => { g3.push(u); return /\/voices\?/.test(u) ? LIB : MODELS; },
    post: async (u, b) => { c3.push({ u, b }); const p = p3.shift(); if (p) return p; return /\/voices$/.test(u) ? designed('voice_abc123xyz') : okI(V.wavOf(pcm(24000), 24000)); } };
  const s3 = mem(); s3.set('voice.gemini', 'k3'); const w = new V.Voice({ dataDir: d3, secrets: s3, http: h3 });
  const cs = await w.cast({ lang: 'vi', accent: 'bac', actors: [{ id: 'ong-tu', role: 'ong-lao' }, { id: 'quan-vu', role: 'vo-tuong' }, { id: 'truong-phi', role: 'vo-tuong' }, { id: 'ba-nam', role: 'ba-lao' },
    { id: 'be-bin', role: 'be-trai' }, { id: 'na', role: 'nu-tre', voice: 'Kore' }, { id: 'x', role: 'vai-la' }] });
  const C = cs.cast;
  no(C['ong-tu'].voice !== 'vi-vn-tutor-2' || C['ong-tu'].source !== 'library', 'ông lão phải lấy giọng nam thư viện già nhất (62 tuổi): ' + JSON.stringify(C['ong-tu']));
  no(C['quan-vu'].source !== 'library' || C['truong-phi'].source !== 'library' || C['quan-vu'].voice === C['truong-phi'].voice, 'hai võ tướng: giọng thư viện, khác nhau: ' + JSON.stringify([C['quan-vu'], C['truong-phi']]));
  no(['vi-vn-training-4', 'vi-vn-csagent-2'].indexOf(C['ba-nam'].voice) < 0, 'bà lão phải lấy giọng nữ thư viện lớn tuổi: ' + JSON.stringify(C['ba-nam']));
  no(C['be-bin'].source !== 'prebuilt' || ['Leda', 'Laomedeia', 'Zephyr'].indexOf(C['be-bin'].voice) < 0, 'vai bé: giọng trẻ trung dựng sẵn (thư viện không có trẻ em): ' + JSON.stringify(C['be-bin']));
  no(C.na.voice !== 'Kore' || C.na.source !== 'chosen', 'giọng người dùng chọn phải thắng');
  no(!C.x || C.x.source === 'design', 'vai lạ phải về vai mặc định, không lỗi');
  no(Object.values(C).some(c => c.voice === 'evil; drop'), 'id giọng lạ từ thư viện phải bị lọc');
  no(new Set(Object.values(C).map(c => c.voice)).size !== Object.keys(C).length, 'mỗi diễn viên một giọng: ' + JSON.stringify(C));
  const ng = g3.filter(u => /\/voices\?/.test(u)).length; await w.cast({ lang: 'vi', accent: 'nam', actors: [{ id: 'a', role: 'ong-lao' }] });
  no(g3.filter(u => /\/voices\?/.test(u)).length !== ng || !/language_code=vi-VN/.test(g3.find(u => /\/voices\?/.test(u))), 'thư viện giọng phải lưu đệm (24 giờ) + lọc đúng mã ngôn ngữ');
  const zh = await w.cast({ lang: 'zh', accent: 'pt', actors: [{ id: 'gc', role: 'quan-su' }] });
  no(zh.lang !== 'zh' || zh.cast.gc.source !== 'prebuilt' || !/language_code=cmn-CN/.test(g3[g3.length - 1]), 'tiếng Trung (thư viện chưa có): giọng dựng sẵn hợp vai: ' + JSON.stringify(zh));
  const yu = await w.cast({ lang: 'yue', accent: 'hk', actors: [{ id: 'zf', role: 'vo-tuong' }] });
  no(yu.lang !== 'yue' || yu.accent !== 'hk' || yu.cast.zf.source !== 'prebuilt' || !/language_code=yue-HK/.test(g3[g3.length - 1]), 'tiếng Quảng Đông: thư viện yue-HK (chưa có giọng) → giọng dựng sẵn hợp vai: ' + JSON.stringify(yu));
  no(c3.length !== 0, 'cast không được tốn lượt đọc nào');

  // ---- THIẾT KẾ giọng vai: vai trẻ em bị chặn (không gọi); vai người lớn → POST /voices đúng mô tả; lưu → cast dùng ngay ----
  e = await rejectAll(() => w.design({ role: 'be-gai', lang: 'vi', accent: 'bac' }), 'thiết kế vai bé'); no(e.code !== 400 || !/trẻ em/.test(e.message) || c3.length !== 0, 'vai trẻ em: 400, không gọi Google');
  e = await rejectAll(() => w.design({ role: 'khong-co' }), 'vai lạ'); no(e.code !== 400, 'vai lạ phải 400');
  const dz = await w.design({ role: 'ong-lao', lang: 'vi', accent: 'nam' }), db = c3[0].b;
  no(!/\/voices$/.test(c3[0].u) || db.store !== true || db.voice.type !== 'prompted' || db.voice.gender !== 'male' || db.voice.language_code !== 'vi-VN' || db.voice.model ||
    !/late 70s/.test(db.voice.prompted.input) || !/Southern \(Saigon\) accent/.test(db.voice.prompted.input), 'thân lệnh thiết kế: ' + JSON.stringify(db));
  no(dz.voice !== 'voice_abc123xyz' || !dz.preview || w.publicConfig().designs['ong-lao|vi|nam'].voice !== 'voice_abc123xyz', 'giọng thiết kế phải lưu theo vai|ngôn ngữ|giọng vùng: ' + JSON.stringify(dz));
  const pv = V.wavInfo(fs.readFileSync(w.clipPath(dz.preview.replace(/^api\/voice\/clip\/|\.wav$/g, ''))));
  no(!pv || pv.data.length / (pv.rate * 2) > 20.01, 'clip nghe thử giọng thiết kế: WAV ≤ 20 giây');
  const cd = await w.cast({ lang: 'vi', accent: 'nam', actors: [{ id: 'ong-tu', role: 'ong-lao' }, { id: 'ong-sau', role: 'ong-lao' }] });
  no(cd.cast['ong-tu'].voice !== 'voice_abc123xyz' || cd.cast['ong-tu'].source !== 'design' || cd.cast['ong-sau'].voice === 'voice_abc123xyz', 'cast phải dùng giọng thiết kế cho vai đó (người thứ hai cùng vai lấy giọng khác): ' + JSON.stringify(cd));
  no((await w.cast({ lang: 'vi', accent: 'bac', actors: [{ id: 'ong-tu', role: 'ong-lao' }] })).cast['ong-tu'].source === 'design', 'giọng thiết kế giọng Nam không được dùng cho phim giọng Bắc');
  no((await w.cast({ lang: 'vi', accent: 'bac', actors: [{ id: 'ong-tu', role: 'ong-lao', accent: 'nam' }] })).cast['ong-tu'].source !== 'design', 'nhân vật có giọng vùng riêng (Nam) trong phim giọng Bắc → giọng thiết kế giọng Nam');
  no((await w.cast({ lang: 'vi', accent: 'bac', actors: [{ id: 'ong-tu', role: 'ong-lao', accent: 'hk' }] })).cast['ong-tu'].source === 'design', 'giọng vùng không thuộc ngôn ngữ phim phải bị bỏ');
  const rd = await w.line({ text: 'Con ơi, ông già rồi.', voice: 'voice_abc123xyz', role: 'ong-lao', state: 'cry', bubble: 'say' });
  no(rd.cached || c3[c3.length - 1].b.generation_config.speech_config[0].voice !== 'voice_abc123xyz' || c3[c3.length - 1].b.input[0].content[0].annotations[0].style !== 'slow, slightly raspy, wise, crying, sobbing', 'đọc bằng giọng thiết kế qua Interactions');
  p3 = [FX('design-safety-400')];   // thân lỗi thật khi mô tả giọng trẻ em
  e = await rejectAll(() => w.design({ role: 'phan-dien', lang: 'vi' }), 'safety'); no(e.code !== 400 || !/chính sách/.test(e.message), 'Google chặn mô tả → 400 nói rõ');
  p3 = [quota(120)];
  e = await rejectAll(() => w.design({ role: 'quan-su', lang: 'zh', accent: 'pt' }), 'design 429'); no(e.code !== 429 || !e.retryAt, 'hết lượt thiết kế → 429 + retryAt');
  p3 = [{ status: 400, json: { error: { code: 400, message: 'Unsupported language_code cmn-CN' } } }, designed('voice_zh0000001')];
  const dzh = await w.design({ role: 'quan-su', lang: 'zh', accent: 'pt' });
  no(dzh.voice !== 'voice_zh0000001' || c3[c3.length - 1].b.voice.language_code !== 'zh-CN' || !/Mandarin/.test(c3[c3.length - 1].b.voice.prompted.input), 'mã ngôn ngữ lạ → thử lại bằng mã BCP: ' + JSON.stringify(c3[c3.length - 1].b.voice));
  const dyu = await w.design({ role: 'vo-tuong', lang: 'yue', accent: 'hk' }), byu = c3[c3.length - 1].b.voice;
  no(byu.language_code !== 'yue-HK' || !/Cantonese with a natural Hong Kong accent/.test(byu.prompted.input) || w.publicConfig().designs['vo-tuong|yue|hk'].voice !== dyu.voice, 'thiết kế giọng Quảng Đông: mã yue-HK + mô tả giọng Hồng Kông: ' + JSON.stringify(byu));
  // chọn giọng cho một câu (MCP / API): nhân vật + vai + ngôn ngữ → giọng cast
  const pk1 = await w.pick({ asset: { id: 'tq-truong-phi', name: 'Trương Phi', role: 'Võ tướng' }, lang: 'vi', accent: 'bac' });
  no(pk1.role !== 'vo-tuong' || !/^vi-vn-/.test(pk1.voice), 'pick: võ tướng tiếng Việt → giọng thư viện: ' + JSON.stringify(pk1));
  const pk2 = await w.pick({ asset: { id: 'b', name: 'Bé Bin', role: 'em bé', voice: { role: 'ong-lao', ai: 'Kore' } } });
  no(pk2.role !== 'ong-lao' || pk2.voice !== 'Kore', 'pick: vai + giọng nhân vật đã chọn phải thắng đoán: ' + JSON.stringify(pk2));

  // vai đoán theo vai trò / tên: nữ cho vai nữ, võ tướng cho tướng (giọng cụ thể do cast chọn)
  no(V.GV.cast({ id: 'x', name: 'Cô Lan', role: 'thư ký' }).gender !== 'f' || V.GV.cast({ id: 'tq-truong-phi', name: 'Trương Phi', role: 'tướng' }).role !== 'vo-tuong', 'đoán vai: nữ / võ tướng');
  // nhân vật lưu được giọng / vai / giọng vùng (tên lạ thì bỏ, không chặn cả nhân vật); tác phẩm lưu được ngôn ngữ + giọng vùng hợp lệ
  { const { MCP } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js');
    const m = new MCP({ engine: loadEngine(ROOT), store: new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-vm-'))), version: 't', system: {} });
    no(m.prepare({ id: 'ci-g3', name: 'G3', look: {}, voice: { ai: 'vi-vn-tutor-2' } }).voice.ai !== 'vi-vn-tutor-2' || m.prepare({ id: 'ci-g4', name: 'G4', look: {}, voice: { ai: 'voice_abc123xyz' } }).voice.ai !== 'voice_abc123xyz' ||
      m.prepare({ id: 'ci-g5', name: 'G5', look: {}, voice: { ai: 'vi vn <x>' } }).voice, 'nhân vật lưu được giọng thư viện / giọng thiết kế (id đúng dạng), bỏ chữ tự do');
    const a1 = m.prepare({ id: 'ci-giong', name: 'Giọng', look: {}, voice: { pitch: 1.2, ai: 'Kore', role: 'ba-lao', accent: 'nam' } }), a2 = m.prepare({ id: 'ci-giong-2', name: 'Giọng 2', look: {}, voice: { ai: 'KhongCo', role: 'vai-la', accent: 'sao-hoa' } });
    no(!a1.voice || a1.voice.ai !== 'Kore' || a1.voice.pitch !== 1.2 || a1.voice.role !== 'ba-lao' || a1.voice.accent !== 'nam' || a2.voice, 'voice: giữ giọng / vai / giọng vùng hợp lệ, bỏ tên lạ: ' + JSON.stringify([a1.voice, a2.voice]));
    const wk = m.saveWorkChecked({ title: 'Phim tiếng Trung', lang: 'zh', accent: 'tw' });
    no(wk.lang !== 'zh' || wk.accent !== 'tw', 'tác phẩm phải lưu ngôn ngữ + giọng vùng');
    let we = null; try { m.saveWorkChecked({ id: wk.id, accent: 'bac' }); } catch (x) { we = x; }
    no(!we || we.code !== 422 || !/accent/.test(we.message), 'giọng vùng không thuộc ngôn ngữ phim phải 422');
    we = null; try { m.saveWorkChecked({ id: wk.id, lang: 'fr' }); } catch (x) { we = x; } no(!we || we.code !== 422, 'ngôn ngữ lạ phải 422');
    // bộ mẫu: nhân vật mang vai giọng chọn sẵn (máy đoán "Lính quèn" thành võ tướng, "Bé Na" thành nam) — cài qua cổng vẫn giữ
    for (const id of ['mau-tam-quoc', 'mau-van-phong-vui']) { const r = await m.callTool('install_sample', { id }, {}); no(r.isError, 'cài bộ mẫu ' + id); }
    for (const [k, role] of [['tq-linh-que', 'hai-huoc'], ['tq-trieu-van', 'hiep-khach'], ['tq-tao-thao', 'phan-dien'], ['mau-be-na', 'nu-tre']]) {
      const a = m.findAsset(k); no(!a || !a.voice || a.voice.role !== role, 'bộ mẫu: ' + k + ' phải có vai giọng ' + role + ': ' + JSON.stringify(a && a.voice)); } }

  // ---- cổng cortex v0.17 (CNS-082…094): lỗi thật, trần ngày, giọng hỏng có hạn, giọng chốt theo tác phẩm, kênh chi tiêu ----
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-voice-')), c4 = [];
  let p4 = [], lib4 = withWav(FX('voices-vi-VN'), Buffer.alloc(0));
  const h4 = { get: async u => /\/voices\?/.test(u) ? lib4 : MODELS, post: async (u, b) => { c4.push({ u, b }); const p = p4.shift(); if (p) return p; return /\/voices$/.test(u) ? designed('voice_abc123xyz') : /\/interactions$/.test(u) ? okI(V.wavOf(pcm(24000), 24000)) : okG(pcm(24000), 'audio/L16;codec=pcm;rate=24000'); } };
  const s4 = mem(); s4.set('voice.gemini', 'k4'); const x = new V.Voice({ dataDir: d4, secrets: s4, http: h4 });
  // CNS-084: 429 THẬT của Interactions (không RetryInfo, "Please retry in 18h57m29s") → khoá ~18h57m, báo đúng giờ (trước đây: 1 phút)
  p4 = [FX('interactions-429'), FX('interactions-429')];
  e = await rejectAll(() => x.line({ text: 'Câu hết lượt', voice: 'vi-vn-tutor-7', role: 'vo-tuong' }), '429 thật');   // giọng thư viện: chỉ model 3.8 đọc được
  const wait = Date.parse(e.retryAt) - Date.now(), bl4 = x.publicConfig().blocked;
  no(e.code !== 429 || wait < 18.9 * 3600e3 || wait > 19 * 3600e3 || bl4.length !== 2 || bl4.some(b => Date.parse(b.until) - Date.now() < 18.9 * 3600e3), '429 thật: giờ thử lại phải ~18h57m (đọc từ message): ' + e.retryAt + ' ' + JSON.stringify(bl4));
  x.setConfig({}); { const cc = x.config(); cc.blocked = {}; x.write(cc); }
  // CNS-087: lỗi lược đồ chung có chữ "voice" KHÔNG đánh dấu giọng; 404 "voice not found" của giọng thư viện → tạm bỏ 24 giờ; giọng dựng sẵn không bao giờ bị đánh dấu
  p4 = [{ status: 400, json: { error: { code: 400, message: 'Invalid JSON payload received. Unknown name "voice" at \'generation_config.speech_config[0]\': Cannot find field.' } } }, { status: 400, json: { error: { code: 400, message: 'Invalid JSON payload received. Unknown name "voice"' } } }];
  await x.line({ text: 'Câu lược đồ', voice: 'Charon', role: 'vo-tuong' }).catch(() => null);   // hai model 3.8 lỗi lược đồ → model đời trước đọc được
  no(x.publicConfig().bad.length !== 0 || x.publicConfig().voices.length !== 30, 'lỗi lược đồ phía Google không được đánh dấu giọng hỏng');
  p4 = [{ status: 404, json: { error: { code: 404, message: 'Voice vi-vn-tutor-2 not found.' } } }];
  e = await rejectAll(() => x.line({ text: 'Câu giọng mất', voice: 'vi-vn-tutor-2', role: 'ong-lao' }), 'giọng mất');
  const bd = x.publicConfig().bad; no(e.code !== 400 || bd.length !== 1 || bd[0].voice !== 'vi-vn-tutor-2' || Math.abs(Date.parse(bd[0].until) - Date.now() - 24 * 3600e3) > 60e3, 'giọng thư viện Google báo không còn → tạm bỏ 24 giờ: ' + JSON.stringify(bd));
  no((await x.cast({ lang: 'vi', accent: 'bac', actors: [{ id: 'o', role: 'ong-lao' }] })).cast.o.voice === 'vi-vn-tutor-2', 'cast không được chọn giọng đang tạm hỏng');
  x.setConfig({ clearBad: true }); no(x.publicConfig().bad.length !== 0, 'clearBad phải gỡ dấu');
  { const cc = x.config(); cc.bad = { 'vi-vn-tutor-7': Date.now() - 1 }; x.write(cc); } no(x.publicConfig().bad.length !== 0 || !x.validVoice('vi-vn-tutor-7', x.config()), 'dấu giọng hỏng hết hạn phải tự gỡ');
  // CNS-090 / Q13: trần câu / ngày (mặc định 200; chủ máy đổi) — chạm trần → 429 cap kèm giờ đặt lại, không gọi Google
  no(x.publicConfig().dailyCap !== 200, 'trần mặc định 200 câu / ngày');
  x.setConfig({ dailyCap: (x.publicConfig().today || 0) + 1 }); const nc = c4.length;
  await x.line({ text: 'Câu trong trần', voice: 'Charon', role: 'vo-tuong' });
  e = await rejectAll(() => x.line({ text: 'Câu vượt trần', voice: 'Charon', role: 'vo-tuong' }), 'vượt trần');
  no(e.code !== 429 || e.cap !== true || !e.retryAt || c4.length !== nc + 1, 'chạm trần ngày → 429 cap, không gọi Google');
  e = await rejectAll(() => x.design({ role: 'ong-lao', lang: 'vi', accent: 'bac' }), 'thiết kế vượt trần'); no(e.code !== 429 || e.cap !== true, 'thiết kế giọng cũng tính trần');
  no((await x.line({ text: 'Câu trong trần', voice: 'Charon', role: 'vo-tuong' })).cached !== true, 'câu đã đọc vẫn nghe được khi chạm trần (lưu đệm)');
  x.setConfig({ dailyCap: 0 });
  // CNS-085: cast có keep — thêm diễn viên (đứng TRƯỚC) / thư viện thêm giọng không đổi giọng người cũ; người mới tránh giọng đã chốt
  const k1 = await x.cast({ lang: 'vi', accent: 'bac', actors: [{ id: 'quan-vu', role: 'vo-tuong' }, { id: 'truong-phi', role: 'vo-tuong' }] });
  const keep = { 'quan-vu': k1.cast['quan-vu'].voice, 'truong-phi': k1.cast['truong-phi'].voice };
  lib4 = JSON.parse(JSON.stringify(lib4)); lib4.json.voices.unshift({ id: 'vi-vn-advisor-99', type: 'prebuilt', display_name: 'Mới', language_code: 'vi-VN', gender: 'male', pitch: 'low', description: '45-year-old General from Vietnam. Sounds confident and resonant.' });
  { const all = x.readLib(); delete all['vi-VN']; fs.writeFileSync(x.libFile, JSON.stringify(all)); }
  const k2 = await x.cast({ lang: 'vi', accent: 'bac', keep, actors: [{ id: 'trieu-van', role: 'vo-tuong' }, { id: 'quan-vu', role: 'vo-tuong' }, { id: 'truong-phi', role: 'vo-tuong' }] });
  no(k2.cast['quan-vu'].voice !== keep['quan-vu'] || k2.cast['truong-phi'].voice !== keep['truong-phi'] || [keep['quan-vu'], keep['truong-phi']].indexOf(k2.cast['trieu-van'].voice) >= 0,
    'giọng đã chốt phải giữ nguyên khi thêm người đứng trước + thư viện thêm giọng: ' + JSON.stringify([keep, k2.cast]));
  const many = await x.cast({ lang: 'vi', accent: 'bac', actors: Array.from({ length: 50 }, (_, i) => ({ id: 'a' + i, role: 'nam-tre' })) });
  no(Object.keys(many.cast).length !== 48 || !many.missing || many.missing.length !== 2, 'dàn > 48 người: báo missing, không cắt im lặng');
  for (const evil of ['constructor', '__proto__', 'toString']) { const r = await x.cast({ lang: 'vi', actors: [{ id: 'e', role: evil }] }); no(!r.cast.e, 'role "' + evil + '" không được làm sập cast'); e = await rejectAll(() => x.design({ role: evil }), evil); no(e.code !== 400 || /trẻ em/.test(e.message), 'role "' + evil + '" phải 400 "không có vai"'); }
  no(V.tagsOf('constructor', 'toString') !== '', 'cảm xúc lạ (khoá prototype) không được chèn chữ vào style');
  // giọng vùng: giọng trình duyệt theo mã vùng (Anh Anh → en-GB, Đài Loan → zh-TW, Quảng Đông → zh-HK); thiết kế Đài Loan thử lại bằng zh-TW
  no(V.GV.cast({ id: 'a' }, { lang: 'en', accent: 'uk' }).bcp !== 'en-GB' || V.GV.cast({ id: 'a' }, { lang: 'zh', accent: 'tw' }).bcp !== 'zh-TW' || V.GV.cast({ id: 'a' }, { lang: 'yue' }).bcp !== 'zh-HK', 'mã BCP theo giọng vùng');
  p4 = [{ status: 400, json: { error: { code: 400, message: 'Unsupported language_code cmn-TW' } } }, designed('voice_tw00000001')];
  await x.design({ role: 'quan-su', lang: 'zh', accent: 'tw' });
  no(c4[c4.length - 1].b.voice.language_code !== 'zh-TW', 'thiết kế Đài Loan: mã lạ → thử lại zh-TW');

  // ---- MCP: kênh chi tiêu (CNS-082), giọng chốt theo tác phẩm (CNS-085), gói dự án giữ ngôn ngữ (CNS-083), luật ngôn ngữ (CNS-086) ----
  { const { MCP, INSTRUCTIONS, workInstructions } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js');
    const st = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-vm-'))), m = new MCP({ engine: loadEngine(ROOT), store: st, version: 't', system: {}, voice: x });
    no(m.toolsFor('ui').some(t => /^(render_voice|design_voice)$/.test(t.name)) || !m.toolsFor('mcp').some(t => t.name === 'design_voice'), 'AI chatroom không có tool giọng tốn lượt; MCP chủ máy có');
    const before4 = c4.length, des0 = JSON.stringify(x.publicConfig().designs);
    let r = await m.callTool('design_voice', { role: 'ong-lao', lang: 'vi', accent: 'nam' }, { viaLink: true });
    no(!r.isError || !/FORBIDDEN/.test(r.content[0].text) || JSON.stringify(x.publicConfig().designs) !== des0, 'qua link: design_voice FORBIDDEN, không đổi giọng vai của chủ máy');
    r = await m.callTool('design_voice', { role: 'ong-lao' }, { channel: 'ui' }); no(!r.isError, 'AI chatroom: design_voice bị từ chối');
    r = await m.callTool('render_voice', { text: 'Câu chưa lồng qua link', voice: 'Charon', role: 'vo-tuong' }, { viaLink: true });
    no(!r.isError || !/FORBIDDEN/.test(r.content[0].text) || c4.length !== before4, 'qua link: câu chưa lồng → FORBIDDEN, 0 lời gọi Google');
    r = await m.callTool('render_voice', { text: 'Câu trong trần', voice: 'Charon', role: 'vo-tuong' }, { viaLink: true });
    no(r.isError || !JSON.parse(r.content[0].text).cached || c4.length !== before4 || r.content.length !== 1, 'qua link: câu đã lồng thì lấy được (không audio nếu không xin)');
    r = await m.callTool('render_voice', { text: 'Câu trong trần', voice: 'Charon', role: 'vo-tuong', include_audio: true }, {});
    no(r.content.length !== 2 || r.content[1].type !== 'audio', 'include_audio: true thì kèm WAV');
    { const cc = x.config(); cc.blocked = { 'gemini-3.8-flash-tts': Date.now() + 3600e3, 'gemini-3.8-flash-lite-tts': Date.now() + 3600e3, 'gemini-2.5-flash-preview-tts': Date.now() + 3600e3 }; x.write(cc); }
    r = await m.callTool('render_voice', { text: 'Câu khi hết lượt', voice: 'Charon', role: 'vo-tuong' }, {});
    no(!r.isError || !(r.structuredContent && r.structuredContent.error && r.structuredContent.error.retryAt), 'MCP: hết lượt phải trả retryAt máy đọc được (CNS-089): ' + JSON.stringify(r.structuredContent));
    { const cc = x.config(); cc.blocked = {}; x.write(cc); }
    // giọng chốt theo tác phẩm: cast 2 lần cùng kết quả; thêm phân cảnh có người mới không đổi người cũ; render_voice {work} = giọng chốt
    for (const id of ['mau-tam-quoc']) { const ri = await m.callTool('install_sample', { id }, {}); no(ri.isError, 'cài bộ mẫu'); }
    const W = 'tq-vuon-dao-xich-bich', ca = await m.castWork(W, {}), cb = await m.castWork(W, {});
    const vOf = r => JSON.stringify(Object.keys(r.cast).map(k => k + '=' + r.cast[k].voice));
    no(vOf(ca) !== vOf(cb) || !st.getWork(W).voices || !st.getWork(W).voices['vi|bac'], 'cast tác phẩm phải ổn định và chốt vào work.voices');
    const pinned = st.getWork(W).voices['vi|bac'], ids = Object.keys(pinned);
    no(new Set(ids.map(i => pinned[i])).size !== ids.length, 'dàn tác phẩm: mỗi người một giọng');
    const ver = st.getWork(W).version; await m.castWork(W, {}); no(st.getWork(W).version !== ver, 'cast lại không đổi gì thì không tạo phiên bản mới');
    const cc2 = await m.castWork(W, { actors: [{ id: 'nguoi-moi', role: 'vo-tuong' }].concat(ids.map(i => ({ id: i, role: (m.findAsset(i).voice || {}).role }))) });
    no(ids.some(i => cc2.cast[i].voice !== pinned[i]) || ids.some(i => pinned[i] === cc2.cast['nguoi-moi'].voice), 'thêm người mới (đứng đầu) không đổi giọng người cũ');
    r = await m.callTool('render_voice', { text: 'Tử Long!', character: 'tq-truong-phi', work: W }, {});
    no(r.isError || JSON.parse(r.content[0].text).voice !== pinned['tq-truong-phi'], 'render_voice {work} phải dùng đúng giọng đã chốt của tác phẩm: ' + r.content[0].text);
    // gói dự án mang ngôn ngữ + giọng vùng + giọng đã chốt (L-61): xuất → nhập vào máy sạch → giống hệt
    m.saveWorkChecked({ id: W, lang: 'yue', accent: 'hk' }); await m.castWork(W, {});
    const bundle = m.exportProject('mau-tam-quoc'), st2 = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-vm-'))), m2 = new MCP({ engine: loadEngine(ROOT), store: st2, version: 't', system: {} });
    const bw = (bundle.works || []).find(w => w.id === W);
    no(!bw || bw.lang !== 'yue' || bw.accent !== 'hk' || !bw.voices || !bw.voices['yue|hk'], 'gói xuất phải mang lang / accent / voices: ' + JSON.stringify(bw && { lang: bw.lang, accent: bw.accent }));
    try { m2.importProject(JSON.parse(JSON.stringify(bundle)), {}); } catch (x2) { no(true, 'nhập gói: ' + x2.message); }
    const w2 = st2.getWork(W); no(!w2 || w2.lang !== 'yue' || w2.accent !== 'hk' || JSON.stringify(w2.voices) !== JSON.stringify(st.getWork(W).voices), 'nhập gói phải giữ lang / accent / voices (CNS-083): ' + JSON.stringify(w2 && { lang: w2.lang, accent: w2.accent, voices: w2.voices }));
    // luật ngôn ngữ: chỉ dẫn agent không còn ép lời thoại tiếng Việt; AI đạo diễn biết ngôn ngữ phim
    no(/Viewer-facing text is Vietnamese/.test(INSTRUCTIONS) || !/work's language/.test(INSTRUCTIONS), 'INSTRUCTIONS: lời thoại theo ngôn ngữ của tác phẩm');
    const wi = workInstructions(Object.assign({}, st.getWork(W)));
    no(!/NGÔN NGỮ LỜI THOẠI của phim: Tiếng Quảng Đông \(yue \/ hk\)/.test(wi) || !/phồn thể/.test(wi), 'AI đạo diễn phải biết ngôn ngữ phim');
    no(!/NGÔN NGỮ LỜI THOẠI của phim: Tiếng Việt/.test(workInstructions({ id: 'x', shots: [] })), 'tác phẩm chưa chọn ngôn ngữ → tiếng Việt');
    no(m.prepare({ id: 'ci-v', name: 'V', look: {}, voice: { pitch: 9, rate: 0.1 } }).voice.pitch !== V.GV.CLAMP.pitch[1], 'kẹp cao độ một nguồn (voices.js CLAMP)'); }
  // ---- giọng trình duyệt dự phòng (CNS-091): đúng ngôn ngữ + giọng vùng + giới, không đọc chéo Quảng Đông / phổ thông ----
  { const vm = require('vm'), spoken = [];
    const voices = [['Microsoft Xiaoxiao Online (Natural)', 'zh-CN'], ['Microsoft Yunxi Online (Natural)', 'zh-CN'], ['Microsoft HsiaoChen Online (Natural)', 'zh-TW'], ['Microsoft YunJhe Online (Natural)', 'zh-TW'],
      ['Microsoft HiuMaan Online (Natural)', 'zh-HK'], ['Microsoft WanLung Online (Natural)', 'zh-HK'], ['Microsoft HoaiMy Online (Natural)', 'vi-VN'], ['Microsoft NamMinh Online (Natural)', 'vi-VN'],
      ['Microsoft Sonia Online (Natural)', 'en-GB'], ['Microsoft Ryan Online (Natural)', 'en-GB'], ['Microsoft Aria Online (Natural)', 'en-US'], ['Microsoft Guy Online (Natural)', 'en-US']].map(v => ({ name: v[0], lang: v[1] }));
    const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Math, Date, JSON, Float32Array, Int16Array, Uint8Array, ArrayBuffer, DataView,
      window: { GenChibi: {}, speechSynthesis: { getVoices: () => voices, addEventListener() {}, speak(u) { spoken.push(u); setTimeout(() => u.onend && u.onend(), 2); }, cancel() {}, speaking: false, pending: false }, SpeechSynthesisUtterance: function (t) { this.text = t; } } };
    vm.createContext(ctx);
    ['engine/voices.js', 'engine/audio.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
    const A = ctx.window.GenChibi.audio; A.setVoiceMode('tts');
    const said = async (asset, o) => { await Promise.race([A.say('一 二 ba', A.voiceOf(asset, o)), new Promise(r => setTimeout(r, 200))]); const u = spoken[spoken.length - 1]; return u && u.voice ? u.voice.name.split(' ')[1] + '/' + u.lang : 'none'; };
    const want = [[{ id: 'a', voice: { role: 'vo-tuong' } }, { lang: 'yue' }, 'WanLung/zh-HK'], [{ id: 'b', voice: { role: 'ba-lao' } }, { lang: 'yue' }, 'HiuMaan/zh-HK'],
      [{ id: 'c', voice: { role: 'quan-su' } }, { lang: 'zh', accent: 'tw' }, 'YunJhe/zh-TW'], [{ id: 'd', voice: { role: 'be-gai' } }, { lang: 'zh' }, 'Xiaoxiao/zh-CN'],
      [{ id: 'e', voice: { role: 'nu-tre' } }, { lang: 'en', accent: 'uk' }, 'Sonia/en-GB'], [{ id: 'f', voice: { role: 'vua-chua' } }, { lang: 'vi', accent: 'nam' }, 'NamMinh/vi-VN']];
    for (const [a, o, w] of want) { const got = await said(a, o); no(got !== w, 'giọng trình duyệt ' + JSON.stringify(o) + ' ' + a.voice.role + ': ' + got + ' (phải ' + w + ')'); } }
  [dir, d3, d4].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  console.log('   ✓ giọng AI (mạng giả, 0 lời gọi Google): dán key là chạy (kiểm miễn phí, sai → 400 giữ key cũ, không lộ key) · model 3.8 qua Interactions (chữ nguyên văn + style) · đời trước qua [thẻ] + giọng dựng sẵn · lưu đệm theo nội dung · hết hạn mức → khoá theo retryDelay, đổi model, nhớ qua khởi động · hết hẳn → 429 + giờ thử lại · dry chỉ lấy clip có sẵn · giọng THEO VAI: thư viện Google theo giới + tuổi + cao độ, giọng thiết kế thắng, vai bé giọng trẻ trung, mỗi người một giọng, tiếng Trung về giọng dựng sẵn · thiết kế giọng (vai trẻ em bị chặn, chính sách / hết lượt / mã ngôn ngữ lạ) · nhân vật lưu voice.role / accent / ai · tác phẩm lưu lang / accent · tiếng Quảng Đông (yue-HK) cast + thiết kế · bộ mẫu mang vai giọng · cổng cortex v0.17: 429 thật (fixture) → giờ thử lại đúng · giọng hỏng có hạn 24 h, lỗi lược đồ không đánh dấu · trần câu / ngày · giọng chốt theo tác phẩm (thêm người không đổi người cũ, MCP {work} = Studio) · dàn > 48 báo missing · khoá prototype · link / chatroom không chi tiêu · gói dự án giữ lang / accent / voices · luật ngôn ngữ lời thoại · giọng trình duyệt đúng vùng + giới');
})().catch(e => { console.log('   ✗', e.stack || e.message); process.exit(1); });
