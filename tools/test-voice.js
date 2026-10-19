// gen-chibi — test 2k: giọng AI (server/voice.js) với mạng GIẢ — không bao giờ gọi Google, không tốn hạn mức.
// Kiểm: thẻ cảm xúc, chặn chèn thẻ, cắt lặng + chuẩn hoá, lưu đệm theo nội dung, đổi model khi hết hạn mức (429 + retryDelay),
// hết hẳn → 429 có giờ thử lại, giọng lạ / tắt / thiếu key, PCM thô → WAV, giọng mặc định theo vai.
// © 2026 Gen Labs — All rights reserved.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const V = require(ROOT + '/server/voice.js');
const no = (c, msg) => { if (c) { console.log('   ✗', msg); process.exit(1); } };
const mem = () => { const m = {}; return { get: k => m[k] || '', set: (k, v) => { if (v) m[k] = v; else delete m[k]; } }; };
// PCM 16-bit: 0,2 s lặng — 0,5 s sóng 220 Hz biên độ 9000 (khuếch đại ≤ 4 lần — clip quá nhỏ không bị thổi ồn) — 0,3 s lặng
const pcm = rate => { const n = Math.round(rate * 1.0), b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) { const t = i / rate, v = t > 0.2 && t < 0.7 ? Math.round(9000 * Math.sin(2 * Math.PI * 220 * t)) : 0; b.writeInt16LE(v, i * 2); } return b; };
const MODELS = { status: 200, json: { models: [
  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-lite-tts', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-2.5-flash-native-audio-latest', supportedGenerationMethods: ['bidiGenerateContent'] }] } };
const ok = (data, mime) => ({ status: 200, json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: data.toString('base64') } }] } }] } });
const quota = s => ({ status: 429, json: { error: { code: 429, message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: s + 's' }] } } });

(async () => {
  // thẻ cảm xúc + chặn chèn thẻ
  no(V.tagsOf('rage', 'shout') !== 'angry, shouting' || V.tagsOf('normal', 'say') !== '', 'thẻ cảm xúc sai: ' + V.tagsOf('rage', 'shout'));
  no(/[[\]]/.test(V.cleanText('[whispering] xin [chào]')), 'chữ người dùng không được chèn thẻ [ ]');
  // cắt lặng + chuẩn hoá đỉnh
  const t = V.tidy(pcm(24000), 24000), n = t.length / 2; let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(t.readInt16LE(i * 2)));
  no(Math.abs(n / 24000 - 0.62) > 0.03, 'cắt lặng: còn ' + (n / 24000).toFixed(2) + ' s, phải ~0,62 s (0,5 s tiếng + 2 × 60 ms)');
  no(pk < 28500 || pk > 29300, 'chuẩn hoá đỉnh về -1 dBFS: ' + pk);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-voice-')), calls = [];
  let plan = [];   // hàng đợi phản hồi giả cho post
  const http = { get: async () => MODELS, post: async (u, b) => { calls.push({ u, b }); return plan.shift() || ok(V.wavOf(pcm(24000), 24000), 'audio/wav'); } };
  const sec = mem(), v = new V.Voice({ dataDir: dir, secrets: sec, http });
  const L = { text: 'Tử Long! Đấu với ta!', voice: 'Charon', state: 'rage', bubble: 'shout' };
  // thiếu key / đang tắt
  let e = null; try { await v.line(L); } catch (x) { e = x; } no(!e || e.code !== 409, 'giọng AI tắt phải 409');
  v.setConfig({ enabled: true });
  e = null; try { await v.line(L); } catch (x) { e = x; } no(!e || e.code !== 409 || !/key/i.test(e.message), 'thiếu key phải 409 nhắc key');
  sec.set('llm.gemini', 'k-test');   // dùng chung key Gemini của AI đạo diễn
  no(v.publicConfig().keySource !== 'llm' || JSON.stringify(v.publicConfig()).indexOf('k-test') >= 0, 'không được trả key ra ngoài; phải biết nguồn key');
  // model quét lúc chạy: chỉ *-tts có generateContent, mới nhất trước, lite sau, preview sau cùng
  const ms = await v.models();
  no(JSON.stringify(ms) !== JSON.stringify(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts']), 'thứ tự model đọc giọng sai: ' + ms.join(', '));
  // đọc lần đầu: gọi API với thẻ ở đầu câu + đúng giọng; lần hai: lấy từ lưu đệm, không gọi
  const r1 = await v.line(L);
  no(r1.cached || calls.length !== 1 || !/\[angry, shouting\] Tử Long!/.test(calls[0].b.contents[0].parts[0].text) || calls[0].b.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName !== 'Charon', 'lần đọc đầu phải gọi API đúng thẻ + giọng');
  no(!fs.existsSync(v.clipPath(r1.id)) || !V.wavInfo(fs.readFileSync(v.clipPath(r1.id))), 'clip phải lưu thành WAV');
  const r2 = await v.line(L); no(!r2.cached || calls.length !== 1 || r2.id !== r1.id, 'câu đã đọc phải lấy từ lưu đệm, không gọi lại API');
  // hết hạn mức model đầu → khoá theo retryDelay, chuyển model kế; PCM thô (audio/L16) được bọc thành WAV
  plan = [quota(3600), ok(pcm(24000), 'audio/L16;codec=pcm;rate=24000')];
  const r3 = await v.line(Object.assign({}, L, { text: 'Câu khác' }));
  no(r3.model !== 'gemini-3.8-flash-lite-tts' || !/gemini-3\.8-flash-tts:/.test(calls[1].u) || !/lite-tts:/.test(calls[2].u), 'hết hạn mức phải chuyển sang model kế: ' + r3.model);
  no(!V.wavInfo(fs.readFileSync(v.clipPath(r3.id))), 'PCM thô phải được bọc WAV');
  const bl = v.publicConfig().blocked; no(bl.length !== 1 || bl[0].model !== 'gemini-3.8-flash-tts' || Date.parse(bl[0].until) < Date.now() + 3500e3, 'model hết hạn mức phải bị khoá ~1 giờ: ' + JSON.stringify(bl));
  // mọi model hết hạn mức → 429 có giờ thử lại (Studio rơi về giọng trình duyệt)
  plan = [quota(7200), quota(60)];
  e = null; try { await v.line(Object.assign({}, L, { text: 'Câu thứ ba' })); } catch (x) { e = x; }
  no(!e || e.code !== 429 || !e.retryAt, 'hết mọi model phải 429 kèm retryAt: ' + (e && e.message));
  // khởi động lại (đọc trạng thái từ đĩa) vẫn nhớ model nào đang bị khoá — không đốt thêm lượt
  const v2 = new V.Voice({ dataDir: dir, secrets: sec, http }); const before = calls.length;
  e = null; try { await v2.line(Object.assign({}, L, { text: 'Câu thứ tư' })); } catch (x) { e = x; }
  no(!e || e.code !== 429 || calls.length !== before, 'model đang khoá không được gọi lại sau khởi động');
  // giọng lạ / câu quá dài / câu trống
  for (const [bad, re] of [[{ voice: 'KhongCo' }, /giọng/], [{ text: 'x'.repeat(300) }, /240/], [{ text: '  ' }, /trống/]]) {
    e = null; try { await v2.line(Object.assign({}, L, bad)); } catch (x) { e = x; } no(!e || e.code !== 400 || !re.test(e.message), 'phải chặn ' + JSON.stringify(bad).slice(0, 40));
  }
  // giọng mặc định theo vai: ổn định, nữ cho vai nữ, trầm cho tướng / sếp
  const dv = a => v.defaultVoice(a), F = V.VOICES.filter(x => x.gender === 'nữ').map(x => x.name);
  no(dv({ id: 'a', name: 'Cô Lan' }) !== dv({ id: 'a', name: 'Cô Lan' }) || F.indexOf(dv({ id: 'x', name: 'Cô Lan', role: 'thư ký' })) < 0, 'vai nữ phải ra giọng nữ: ' + dv({ id: 'x', name: 'Cô Lan' }));
  no(['Charon', 'Algenib', 'Orus', 'Alnilam', 'Sadaltager'].indexOf(dv({ id: 'tq-truong-phi', name: 'Trương Phi', role: 'tướng' })) < 0, 'vai tướng phải ra giọng nam trầm');
  // nhân vật lưu được giọng AI đã chọn (tên lạ thì bỏ, không chặn cả nhân vật)
  { const { MCP } = require(ROOT + '/server/mcp.js'), { Store } = require(ROOT + '/server/store.js'), { loadEngine } = require(ROOT + '/server/engine-node.js');
    const m = new MCP({ engine: loadEngine(ROOT), store: new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-vm-'))), version: 't', system: {} });
    const a1 = m.prepare({ id: 'ci-giong', name: 'Giọng', look: {}, voice: { pitch: 1.2, ai: 'Kore' } }), a2 = m.prepare({ id: 'ci-giong-2', name: 'Giọng 2', look: {}, voice: { ai: 'KhongCo' } });
    no(!a1.voice || a1.voice.ai !== 'Kore' || a1.voice.pitch !== 1.2 || (a2.voice && a2.voice.ai), 'voice.ai: giữ tên giọng hợp lệ, bỏ tên lạ: ' + JSON.stringify([a1.voice, a2.voice])); }
  console.log('   ✓ giọng AI (mạng giả, 0 lời gọi Google): thẻ cảm xúc · chặn chèn thẻ · cắt lặng + chuẩn hoá -1 dBFS · lưu đệm theo nội dung · model quét lúc chạy (chỉ *-tts) · hết hạn mức → khoá theo retryDelay, đổi model, nhớ qua khởi động · hết hẳn → 429 + giờ thử lại · PCM thô → WAV · chặn giọng lạ / câu dài · giọng mặc định theo vai · nhân vật lưu được voice.ai (tên lạ bị bỏ) · không lộ key');
})().catch(e => { console.log('   ✗', e.stack || e.message); process.exit(1); });
