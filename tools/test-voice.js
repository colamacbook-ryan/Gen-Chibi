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
const okI = (data, mime) => ({ status: 200, json: { steps: [{ type: 'user_input' }, { type: 'model_output', content: [{ type: 'audio', mime_type: mime, data: data.toString('base64') }] }] } });
const okG = (data, mime) => ({ status: 200, json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: data.toString('base64') } }] } }] } });
const quota = s => ({ status: 429, json: { error: { code: 429, message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: s + 's' }] } } });
const designed = id => ({ status: 200, json: { id, type: 'prompted', model: 'models/gemini-3.8-flash-tts', sample_audio: { mime_type: 'audio/wav', data: V.wavOf(pcm(24000, 40), 24000).toString('base64') } } });
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
    post: async (u, b) => { calls.push({ u, b }); const p = plan.shift(); if (p) return p; return /\/voices$/.test(u) ? designed('voice_abc123xyz') : /\/interactions$/.test(u) ? okI(V.wavOf(pcm(24000), 24000), 'audio/wav') : okG(pcm(24000), 'audio/L16;codec=pcm;rate=24000'); }
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
  no(cn.roles.length !== 22 || cn.roles.find(r => r.id === 'be-trai').design || !cn.roles.find(r => r.id === 'ong-lao').design || cn.langs.length !== 3, 'publicConfig phải có 22 vai (vai trẻ em không thiết kế được) + 3 ngôn ngữ');
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
    post: async (u, b) => { c3.push({ u, b }); const p = p3.shift(); if (p) return p; return /\/voices$/.test(u) ? designed('voice_abc123xyz') : okI(V.wavOf(pcm(24000), 24000), 'audio/wav'); } };
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
  const rd = await w.line({ text: 'Con ơi, ông già rồi.', voice: 'voice_abc123xyz', role: 'ong-lao', state: 'cry', bubble: 'say' });
  no(rd.cached || c3[c3.length - 1].b.generation_config.speech_config[0].voice !== 'voice_abc123xyz' || c3[c3.length - 1].b.input[0].content[0].annotations[0].style !== 'slow, slightly raspy, wise, crying, sobbing', 'đọc bằng giọng thiết kế qua Interactions');
  p3 = [{ status: 400, json: { error: { code: 400, message: 'Voice prompt was blocked by safety policies.' } } }];
  e = await rejectAll(() => w.design({ role: 'phan-dien', lang: 'vi' }), 'safety'); no(e.code !== 400 || !/chính sách/.test(e.message), 'Google chặn mô tả → 400 nói rõ');
  p3 = [quota(120)];
  e = await rejectAll(() => w.design({ role: 'quan-su', lang: 'zh', accent: 'pt' }), 'design 429'); no(e.code !== 429 || !e.retryAt, 'hết lượt thiết kế → 429 + retryAt');
  p3 = [{ status: 400, json: { error: { code: 400, message: 'Unsupported language_code cmn-CN' } } }, designed('voice_zh0000001')];
  const dzh = await w.design({ role: 'quan-su', lang: 'zh', accent: 'pt' });
  no(dzh.voice !== 'voice_zh0000001' || c3[c3.length - 1].b.voice.language_code !== 'zh-CN' || !/Mandarin/.test(c3[c3.length - 1].b.voice.prompted.input), 'mã ngôn ngữ lạ → thử lại bằng mã BCP: ' + JSON.stringify(c3[c3.length - 1].b.voice));
  // chọn giọng cho một câu (MCP / API): nhân vật + vai + ngôn ngữ → giọng cast
  const pk1 = await w.pick({ asset: { id: 'tq-truong-phi', name: 'Trương Phi', role: 'Võ tướng' }, lang: 'vi', accent: 'bac' });
  no(pk1.role !== 'vo-tuong' || !/^vi-vn-/.test(pk1.voice), 'pick: võ tướng tiếng Việt → giọng thư viện: ' + JSON.stringify(pk1));
  const pk2 = await w.pick({ asset: { id: 'b', name: 'Bé Bin', role: 'em bé', voice: { role: 'ong-lao', ai: 'Kore' } } });
  no(pk2.role !== 'ong-lao' || pk2.voice !== 'Kore', 'pick: vai + giọng nhân vật đã chọn phải thắng đoán: ' + JSON.stringify(pk2));

  // giọng mặc định theo vai: ổn định, nữ cho vai nữ, trầm cho tướng / sếp
  const dv = a => v.defaultVoice(a), F = V.VOICES.filter(x => x.gender === 'nữ').map(x => x.name);
  no(dv({ id: 'a', name: 'Cô Lan' }) !== dv({ id: 'a', name: 'Cô Lan' }) || F.indexOf(dv({ id: 'x', name: 'Cô Lan', role: 'thư ký' })) < 0, 'vai nữ phải ra giọng nữ: ' + dv({ id: 'x', name: 'Cô Lan' }));
  no(['Charon', 'Algenib', 'Orus', 'Alnilam', 'Sadaltager'].indexOf(dv({ id: 'tq-truong-phi', name: 'Trương Phi', role: 'tướng' })) < 0, 'vai tướng phải ra giọng nam trầm');
  // nhân vật lưu được giọng / vai / giọng vùng (tên lạ thì bỏ, không chặn cả nhân vật); tác phẩm lưu được ngôn ngữ + giọng vùng hợp lệ
  { const { MCP } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js');
    const m = new MCP({ engine: loadEngine(ROOT), store: new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-vm-'))), version: 't', system: {} });
    const a1 = m.prepare({ id: 'ci-giong', name: 'Giọng', look: {}, voice: { pitch: 1.2, ai: 'Kore', role: 'ba-lao', accent: 'nam' } }), a2 = m.prepare({ id: 'ci-giong-2', name: 'Giọng 2', look: {}, voice: { ai: 'KhongCo', role: 'vai-la', accent: 'sao-hoa' } });
    no(!a1.voice || a1.voice.ai !== 'Kore' || a1.voice.pitch !== 1.2 || a1.voice.role !== 'ba-lao' || a1.voice.accent !== 'nam' || a2.voice, 'voice: giữ giọng / vai / giọng vùng hợp lệ, bỏ tên lạ: ' + JSON.stringify([a1.voice, a2.voice]));
    const wk = m.saveWorkChecked({ title: 'Phim tiếng Trung', lang: 'zh', accent: 'tw' });
    no(wk.lang !== 'zh' || wk.accent !== 'tw', 'tác phẩm phải lưu ngôn ngữ + giọng vùng');
    let we = null; try { m.saveWorkChecked({ id: wk.id, accent: 'bac' }); } catch (x) { we = x; }
    no(!we || we.code !== 422 || !/accent/.test(we.message), 'giọng vùng không thuộc ngôn ngữ phim phải 422');
    we = null; try { m.saveWorkChecked({ id: wk.id, lang: 'fr' }); } catch (x) { we = x; } no(!we || we.code !== 422, 'ngôn ngữ lạ phải 422'); }
  [dir, d3].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  console.log('   ✓ giọng AI (mạng giả, 0 lời gọi Google): dán key là chạy (kiểm miễn phí, sai → 400 giữ key cũ, không lộ key) · model 3.8 qua Interactions (chữ nguyên văn + style) · đời trước qua [thẻ] + giọng dựng sẵn · lưu đệm theo nội dung · hết hạn mức → khoá theo retryDelay, đổi model, nhớ qua khởi động · hết hẳn → 429 + giờ thử lại · dry chỉ lấy clip có sẵn · giọng THEO VAI: thư viện Google theo giới + tuổi + cao độ, giọng thiết kế thắng, vai bé giọng trẻ trung, mỗi người một giọng, tiếng Trung về giọng dựng sẵn · thiết kế giọng (vai trẻ em bị chặn, chính sách / hết lượt / mã ngôn ngữ lạ) · nhân vật lưu voice.role / accent / ai · tác phẩm lưu lang / accent');
})().catch(e => { console.log('   ✗', e.stack || e.message); process.exit(1); });
