/* gen-chibi engine — audio 0.2: tầng tiếng động + giọng nói cho phim
 * © 2026 Gen Labs — All rights reserved.
 *
 * Không tệp âm thanh, không tài nguyên bên thứ ba, không mạng (trừ khi người gọi tự đưa URL clip giọng): MỌI thứ tổng hợp
 * bằng Web Audio API (hiệu ứng, tiếng nền, nhạc nền, giọng "blip") và speechSynthesis của trình duyệt (giọng đọc tiếng Việt).
 * Chạy trong Studio lẫn tệp phim HTML độc lập mở bằng file://. Thiếu AudioContext / speechSynthesis
 * thì mọi hàm thành no-op im lặng (say() vẫn trả Promise đúng nhịp phim). Cần engine/core.js nạp trước.
 *
 * Âm thanh v2 (0.2): mỗi hiệu ứng là 3 lớp — "tách" (transient) · thân (body) · đuôi (tail) — tổng hợp cộng + modal (chuông / chiêng
 * có hài không nguyên), méo mềm (WaveShaper) cho trọng lượng, mỗi lần phát lệch nhẹ cao độ ±3 % / bộ lọc ±10 % / độ to ±1 dB.
 * Chuỗi trộn: hiệu ứng → sfxBus → nén nhẹ → master; mỗi hiệu ứng gửi một phần vào phòng vang ngắn (ConvolverNode, đáp ứng xung sinh
 * bằng code lúc dựng bus — không có tệp mẫu); giọng / nền / nhạc → master → nén "keo", hiệu ứng đi riêng (không bị nén keo), rồi cùng
 * qua limiter → cắt mềm trần −0,3 dBFS → loa (nhiều âm chồng nhau không vỡ tiếng). Đo bằng tai máy: tools/audio-lab.mjs (WAV + chỉ số + giám khảo Gemini); kiểm thử: tools/test-audio.mjs.
 *
 * Ngân sách (L-42): không có vòng lặp mỗi khung hình. Hiệu ứng một-lần ≤ 12 cái sống cùng lúc (dư thì bỏ), mỗi cái ≤ ~40 node;
 * node nào xong là ngắt (onended → disconnect); ba bộ đệm nhiễu 2 s (trắng / hồng / nâu) + một đáp ứng xung 0,6 s dùng chung, dựng
 * một lần; nhạc nền lập lịch bằng setTimeout 100 ms + ctx.currentTime (lookahead 0.35 s); tiếng nền ≤ 8 nguồn thường trực;
 * giọng blip = 1 oscillator (PeriodicWave tam giác+vuông) mỗi âm tiết, phát đúng lúc qua một chuỗi setTimeout;
 * clip giọng = 1 BufferSource + 1 setInterval 30 ms (đường bao biên độ tính sẵn một lần, không AnalyserNode).
 *
 *   GC.audio.unlock()                  gọi TRONG thao tác của người dùng (click); tạo/đánh thức AudioContext; gọi lại không sao
 *   GC.audio.muted / setMuted(b) / setVolume(0..1)      âm lượng tổng (mặc định 0.8); tắt tiếng thì lời thoại vẫn đúng nhịp
 *   GC.audio.sfx(name, {gain, pan})    pop whoosh step sting hit boing sparkle rumble drip sad snore party hmm gong chime swish tick
 *   GC.audio.sfxNames / sfxInfo()      danh sách tên · { tên: { dur, level } } (cho công cụ kiểm thử; không đổi từ vựng)
 *   GC.audio.ambient({time, weather, indoor} | null)    tiếng nền cảnh, chéo mờ 0.8 s; cùng spec thì không làm lại
 *   GC.audio.music('calm'|'tense'|'epic'|'comic'|'sad' | null)   nhạc nền rất nhỏ; null tắt dần 1 s; tên lạ → bỏ qua
 *   GC.audio.voiceOf(asset, {lang, accent}) → { pitch, rate, blip, lang, gender, role }  theo vai giọng (engine/voices.js); pitch/rate của nhân vật thắng
 *   GC.audio.say(text, voice, {onMouth(level), onWord(i, total), clip, clipRate})  → Promise (xong khi nói xong, hoặc hết thời gian đọc ước tính)
 *       clip (tuỳ chọn) = giọng thu sẵn (vd. Gemini TTS): ArrayBuffer / TypedArray / Blob của WAV hoặc PCM thô · URL (chuỗi) · data: URI.
 *       Có clip → phát qua voiceBus (vẫn hạ nền + nhạc như cũ), bỏ khoảng lặng đầu / cuối; onMouth(level 0..1) theo ĐƯỜNG BAO BIÊN ĐỘ THẬT
 *       (RMS mỗi 30 ms, làm mượt); onWord(i, total) rải theo tỉ lệ độ dài chữ + dấu câu trên đoạn có tiếng; Promise xong khi clip hết
 *       (hush / say mới cắt ngay, có fade 10 ms). Clip hỏng / thiếu / giải mã quá 8 s → lặng lẽ rơi về TTS / blip như không có clip
 *       (lý do ở info().clipError). voiceMode 'off' hoặc tắt tiếng: không phát, vẫn chạy miệng + chữ theo độ dài thật của clip;
 *       voiceMode 'blip' ép giọng blip (bỏ qua clip). PCM thô không header coi là s16le mono, clipRate Hz (mặc định 24000 — Gemini TTS).
 *   GC.audio.decodeClip(src, {rate}) → Promise<AudioBuffer>   cùng đầu vào như clip; LRU 16 clip / 300 s (cùng nguồn → cùng AudioBuffer);
 *       dùng để nạp sẵn trước khi diễn. Không dùng bộ nhớ của ArrayBuffer đã đưa vào (không "detach" nó).
 *   GC.audio.setVoiceMode('auto'|'tts'|'blip'|'off') / voiceMode   auto = TTS nếu có giọng Việt, không thì blip
 *   GC.audio.voiceTier(giọng | tên) → 'good' | 'basic'   hạng giọng trình duyệt: basic = máy đọc kiểu cũ nhận ra được (espeak, speech-dispatcher, pico, festival,
 *       mbrola, "+Tên", Microsoft đời cũ không "Online", tên chỉ là tên ngôn ngữ); còn lại good (Natural / Online / Neural / Google, Apple "Linh", Android Google TTS…)
 *   voice.needGood (tuỳ chọn của say): true → chỉ dùng giọng trình duyệt nếu giọng tìm được thuộc hạng good, còn lại blip — phim có giọng AI thì phần thiếu clip
 *       không được rơi vào robot (espeak…) lẫn với giọng AI. Người gọi bật khi chế độ "tự động" + có clip AI; chọn hẳn "máy đọc" thì không bật.
 *   Giọng trình duyệt "kẹt" (không onstart sau 1,5 s mà synth.speaking vẫn false): cancel + nói lại 1 lần; vẫn kẹt → cả câu bằng blip (không bao giờ im lặng mà miệng nhép).
 *   GC.audio.hush() / stopAll() / info() → { ctx, tts, viVoice, viTier, mode, clipError }   ctx: đã có AudioContext · tts: có speechSynthesis
 */
(function (GC) {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;

  var MAX_FX = 12;                       // hiệu ứng một-lần sống cùng lúc tối đa
  var AHEAD = 0.35;                      // nhạc: lập lịch trước (giây)
  var REV_RETURN = 0.5;                  // độ to đường vang trả về master (chỉnh theo đo, xem tools/audio-lab.mjs)
  var TIMES = ['day', 'dawn', 'dusk', 'night'];
  var WEATHERS = ['clear', 'rain', 'snow', 'petals', 'leaves', 'mist', 'fireflies'];
  var MODES = ['auto', 'tts', 'blip', 'off'];

  var ctx = null, master = null, sfxMaster = null, sfxBus = null, voiceBus = null, ambBus = null, musBus = null, duckBus = null, revIn = null;
  var noiseBuf = null, pinkBuf = null, brownBuf = null, voiceWave = null;
  var volume = 0.8, muted = false, mode = 'auto', duckOn = false;
  var wantAmb = null, wantMus = null;    // yêu cầu đến trước unlock() → làm khi có ctx
  var bed = null, mus = null, job = null;
  var fxLive = [];
  var synth = W && W.speechSynthesis && typeof W.SpeechSynthesisUtterance === 'function' ? W.speechSynthesis : null;
  var viVoice = null, lastCancel = 0, clipError = null, stuckAt = -1e9;   // stuckAt: lần cuối giọng trình duyệt kẹt phải bỏ cuộc (đừng thử lại ngay)

  /* ------------------------------------------------------------ tiện ích */
  function clamp(v, lo, hi, dflt) { v = +v; if (v !== v) return dflt != null ? dflt : lo; return v < lo ? lo : v > hi ? hi : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hz(root, semi) { return root * Math.pow(2, semi / 12); }
  function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; }
  function ready() { return !!ctx && ctx.state === 'running'; }

  /* -------------------------------------------------- AudioContext + bus */
  function mkGain(v, dest) { var g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  /* đường cong WaveShaper: dựng một lần, dùng chung mọi AudioContext */
  var curves = {};
  function tanh(x) { if (x > 20) return 1; if (x < -20) return -1; var e = Math.exp(2 * x); return (e - 1) / (e + 1); }
  // méo mềm: k (≈ 1 nhẹ … 4 mạnh) · bias ≠ 0 thêm hài bậc chẵn (thân "dày" hơn, nghe được cả trên loa nhỏ); c(0) = 0, |c| ≤ 1
  function satCurve(k, bias) {
    var key = k + '/' + (bias || 0);
    if (curves[key]) return curves[key];
    var n = 513, c = new Float32Array(n), b = bias || 0, y0 = tanh(k * b), i, x;
    var m = Math.max(Math.abs(tanh(k * (1 + b)) - y0), Math.abs(tanh(k * (b - 1)) - y0));
    for (i = 0; i < n; i++) { x = i / (n - 1) * 2 - 1; c[i] = (tanh(k * (x + b)) - y0) / m; }
    return (curves[key] = c);
  }
  // trần cuối chuỗi: tuyến tính tới 0.75, rồi tiến êm tới 0.966 (−0.3 dBFS) tại ±1; WaveShaper kẹp mọi thứ ngoài ±1 vào đầu mút
  function ceilCurve() {
    if (curves.ceil) return curves.ceil;
    var n = 2049, c = new Float32Array(n), k0 = 0.75, top = 0.966, sh = 0.7, i, x, a;
    for (i = 0; i < n; i++) {
      x = i / (n - 1) * 2 - 1; a = Math.abs(x);
      c[i] = (a <= k0 ? a : k0 + (top - k0) * tanh((a - k0) / (1 - k0) * sh) / tanh(sh)) * (x < 0 ? -1 : 1);
    }
    return (curves.ceil = c);
  }
  // phòng vang ngắn nhân tạo: nhiễu tắt theo hàm mũ (−60 dB sau rt60), tối dần (lowpass một cực, hệ số tăng theo thời gian),
  // 5 phản xạ sớm, trễ đầu 6 ms, hai kênh không tương quan → có bề rộng. ~50 000 mẫu, dựng một lần mỗi AudioContext.
  function makeIR(rt60, sec) {
    var sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr), ch, i, d, lp, t, a, k;
    var taps = [[0.008, 0.013, 0.019, 0.028, 0.039], [0.010, 0.016, 0.023, 0.033, 0.046]];
    for (ch = 0; ch < 2; ch++) {
      d = b.getChannelData(ch); lp = 0;
      for (i = 0; i < n; i++) {
        t = i / sr;
        a = 0.35 + 0.55 * Math.min(1, t / rt60);                          // 0.35 → 0.9: về cuối càng tối
        lp = lp * a + (Math.random() * 2 - 1) * Math.exp(-6.908 * t / rt60) * (1 - a);
        d[i] = t < 0.006 ? 0 : t < 0.016 ? lp * (t - 0.006) / 0.01 : lp;
      }
      for (k = 0; k < taps[ch].length; k++) d[Math.floor(taps[ch][k] * sr)] += (Math.random() < 0.5 ? -1 : 1) * 0.55 * Math.pow(0.72, k);
    }
    return b;
  }
  function build() {
    master = mkGain(muted ? 0 : volume);         // âm lượng tổng cho đường giọng / nền / nhạc
    sfxMaster = mkGain(muted ? 0 : volume);      // …và cho đường hiệu ứng (đi riêng để tiếng "bốp" không bị nén "keo" làm xẹp, cũng không bóp lời thoại)
    // chuỗi ra: [master → nén "keo"] + [sfxMaster] → limiter → cắt mềm −0,3 dBFS → loa. Nhiều âm chồng nhau không vỡ tiếng.
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    var lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    var cap = ctx.createWaveShaper(); cap.curve = ceilCurve();
    master.connect(comp); comp.connect(lim); sfxMaster.connect(lim); lim.connect(cap); cap.connect(ctx.destination);
    duckBus = mkGain(duckOn ? 0.5 : 1, master);  // hạ nền + nhạc khi có người nói
    ambBus = mkGain(0.55, duckBus);
    musBus = mkGain(0.12, duckBus);              // nhạc ≈ 0.12 tổng để lời thoại luôn rõ
    // hiệu ứng: sfxBus → nén nhẹ (dính các lớp lại; attack chậm để "tách" lọt qua) → sfxMaster
    sfxBus = mkGain(1);
    var sc = ctx.createDynamicsCompressor();
    sc.threshold.value = -16; sc.knee.value = 12; sc.ratio.value = 2; sc.attack.value = 0.008; sc.release.value = 0.14;
    sfxBus.connect(sc); sc.connect(sfxMaster);
    voiceBus = mkGain(1, master);
    // đường vang chung: revIn → highpass (bớt ù) → lowpass (bớt chói) → phòng → master. Mỗi hiệu ứng / nhạc gửi một phần vào revIn.
    revIn = mkGain(1);
    var hp = ctx.createBiquadFilter(), lpf = ctx.createBiquadFilter(), cv = ctx.createConvolver();
    hp.type = 'highpass'; hp.frequency.value = 260; hp.Q.value = 0.6;
    lpf.type = 'lowpass'; lpf.frequency.value = 7500; lpf.Q.value = 0.6;
    cv.buffer = makeIR(0.45, 0.6);
    revIn.connect(hp); hp.connect(lpf); lpf.connect(cv); cv.connect(mkGain(REV_RETURN, sfxMaster));
    musBus.connect(mkGain(0.3, revIn));          // nhạc cũng có chút không gian (tách khỏi duckBus: vang không bị hạ theo lời thoại, vốn rất nhỏ)
    // nhiễu trắng 2 s dùng chung cho mọi tiếng gió/mưa/va chạm; hồng + nâu dựng từ cùng chuỗi (hơi tự nhiên hơn khi qua bộ lọc)
    var n = Math.floor(ctx.sampleRate * 2), d, dp, db, i, w, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); pinkBuf = ctx.createBuffer(1, n, ctx.sampleRate); brownBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    d = noiseBuf.getChannelData(0); dp = pinkBuf.getChannelData(0); db = brownBuf.getChannelData(0);
    for (i = 0; i < n; i++) {
      w = Math.random() * 2 - 1; d[i] = w;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      dp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      br = (br + 0.02 * w) / 1.02; db[i] = br * 3.5;
    }
    // hồng / nâu chuẩn hoá RMS ≈ 0.5 (gần nhiễu trắng 0.577) để cùng một biên độ → cùng độ to khi qua bộ lọc
    var ps = 0, bs = 0;
    for (i = 0; i < n; i++) { ps += dp[i] * dp[i]; bs += db[i] * db[i]; }
    ps = 0.5 / Math.sqrt(ps / n); bs = 0.5 / Math.sqrt(bs / n);
    for (i = 0; i < n; i++) { dp[i] *= ps; db[i] *= bs; }
    // sóng giọng blip: 70% tam giác + 30% vuông (chuỗi sin hài lẻ)
    if (ctx.createPeriodicWave) {
      var N = 24, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (var k = 1; k <= N; k += 2) {
        var sg = ((k - 1) / 2) % 2 ? -1 : 1;
        im[k] = 0.7 * sg * 8 / (Math.PI * Math.PI * k * k) + 0.3 * 4 / (Math.PI * k);
      }
      voiceWave = ctx.createPeriodicWave(re, im);
    }
  }
  // tạo AudioContext + bus (chưa đánh thức — tạo được cả khi chưa có thao tác người dùng; ctx sẽ ở trạng thái suspended)
  function ensureCtx() {
    if (ctx) return true;
    var C = W && (W.AudioContext || W.webkitAudioContext);
    if (!C) return false;
    try { ctx = new C(); } catch (e) { console.warn('[GC.audio] không tạo được AudioContext:', e); ctx = null; return false; }
    build();
    if (wantAmb) startBed(wantAmb);
    if (wantMus) startMus(wantMus);
    return true;
  }
  function unlock() {
    if (!ensureCtx()) return;
    if (ctx.state !== 'running' && ctx.resume) {
      var p = ctx.resume();
      // resume() bị từ chối khi chưa có thao tác người dùng — đó là tình huống bình thường, trạng thái đọc lại qua ctx.state/info()
      if (p && p.catch) p.catch(function () {});
    }
  }
  function applyMaster() {
    if (!ctx) return;
    var v = muted ? 0 : volume;
    master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); sfxMaster.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }
  function duck(on) {
    duckOn = on;
    if (ctx) duckBus.gain.setTargetAtTime(on ? 0.5 : 1, ctx.currentTime, on ? 0.06 : 0.25);
  }

  /* ----------------------------- một "hiệu ứng": nhóm node chung vòng đời */
  // dest: nơi nối vào · dur: thời lượng dự kiến (s) · capped: tính vào hạn mức MAX_FX · level/pan: tạo gain + panner riêng
  // send: mức gửi vào phòng vang (0..1) · dc / fc (cent) / av (hệ số): độ lệch ngẫu nhiên MỖI LẦN PHÁT (cao độ / bộ lọc / độ to) do sfx() đặt
  function mkFx(dest, dur, capped, level, pan, send) {
    var t = ctx.currentTime, i, k = 0;
    if (capped) {
      for (i = 0; i < fxLive.length; i++) if (fxLive[i].end + 1 > t) fxLive[k++] = fxLive[i];
      fxLive.length = k;                 // dọn cái quá hạn (ctx bị treo thì onended không bao giờ tới)
      if (k >= MAX_FX) return null;
    }
    var f = { n: 0, nodes: [], bus: dest, end: t + dur, capped: capped, dc: 0, fc: 0, av: 1 };
    if (level != null || pan != null || send) {
      var g = mkGain(level == null ? 1 : level), head = g;
      f.nodes.push(g);
      if (pan != null && ctx.createStereoPanner) {
        var p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1, 0);
        g.connect(p); f.nodes.push(p); head = p;
      }
      head.connect(dest);
      if (send && revIn) { var sg = mkGain(send); head.connect(sg); sg.connect(revIn); f.nodes.push(sg); }
      f.bus = g;
    }
    if (capped) fxLive.push(f);
    return f;
  }
  function free(f) {
    for (var i = 0; i < f.nodes.length; i++) f.nodes[i].disconnect();
    f.nodes.length = 0;
    if (f.capped) { var k = fxLive.indexOf(f); if (k >= 0) fxLive.splice(k, 1); }
  }
  // chạy một nguồn t0 → t1; nguồn cuối cùng kết thúc thì ngắt cả nhóm
  function go(f, src, t0, t1, off) {
    f.n++; f.nodes.push(src);
    src.onended = function () { if (--f.n <= 0) free(f); };
    if (off != null) src.start(t0, off); else src.start(t0);
    src.stop(t1);
  }
  function filt(f, type, freq, q) {
    var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; b.Q.value = q == null ? 0.7 : q;
    if (f.fc) b.detune.value = f.fc;
    f.nodes.push(b); return b;
  }
  // bao biên độ: lên tuyến tính trong a, (giữ hold), rồi tắt theo hàm mũ tới end (−80 dB)
  function env(f, t, a, peak, end, hold) {
    var g = ctx.createGain();
    peak *= f.av;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (hold) g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    f.nodes.push(g); return g;
  }
  // méo mềm chèn sau `head`; trả về node WaveShaper mới (đầu ra tiếp theo)
  function shape(f, head, k, bias) {
    var w = ctx.createWaveShaper(); w.curve = satCurve(k, bias);
    head.connect(w); f.nodes.push(w); return w;
  }
  // làn stereo chung cho nhiều nguồn: pan trượt p0 → p1 trong dur (p1 == null: đứng yên ở p0). Không có StereoPanner: trả về bus.
  function lane(f, p0, p1, t, dur) {
    if (!ctx.createStereoPanner) return f.bus;
    var p = ctx.createStereoPanner();
    p.pan.setValueAtTime(p0, t);
    if (p1 != null) p.pan.linearRampToValueAtTime(p1, t + dur);
    p.connect(f.bus); f.nodes.push(p); return p;
  }
  // đường gấp khúc [[dt, giá trị, 's'?]…] lên một AudioParam: mặc định mũ (tần số) hoặc tuyến tính (lin); 's' = nhảy tức thì
  function route(param, t, pts, lin, mul) {
    var i, p;
    param.setValueAtTime(pts[0][1] * mul, t + pts[0][0]);
    for (i = 1; i < pts.length; i++) {
      p = pts[i];
      if (p[2] === 's') param.setValueAtTime(p[1] * mul, t + p[0]);
      else if (lin) param.linearRampToValueAtTime(p[1] * mul, t + p[0]);
      else param.exponentialRampToValueAtTime(p[1] * mul, t + p[0]);
    }
  }
  // o: to (tần số cuối) · glide (tỉ lệ thời lượng trượt) · path [[dt, hz]…] · curve (Float32Array hz phủ cả dur) · a (attack) · hold
  //    lp (lowpass) · q · am (Hz, AM 100%) · sat (độ méo 1–4) · bias · cents (lệch cố định) · dest (nối vào chỗ khác f.bus)
  function tone(f, type, h0, t, dur, peak, o) {
    o = o || {};
    var s = ctx.createOscillator(), head;
    s.type = type;
    if (f.dc || o.cents) s.detune.value = f.dc + (o.cents || 0);
    if (o.curve) s.frequency.setValueCurveAtTime(o.curve, t, dur);
    else {
      s.frequency.setValueAtTime(h0, t);
      if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + dur * (o.glide || 1));
      if (o.path) for (var i = 0; i < o.path.length; i++) s.frequency.exponentialRampToValueAtTime(o.path[i][1], t + o.path[i][0]);
    }
    var g = env(f, t, Math.min(o.a || 0.006, dur * 0.5), peak, t + dur, o.hold);
    head = s;
    if (o.sat) head = shape(f, head, o.sat, o.bias);
    if (o.lp) { var lp = filt(f, 'lowpass', o.lp, o.q); head.connect(lp); head = lp; }
    if (o.am) {
      var am = mkGain(0.5); f.nodes.push(am);
      head.connect(am); head = am;
      lfo(f, o.am, 0.5, am.gain, t, dur);
    }
    head.connect(g); g.connect(o.dest || f.bus);
    go(f, s, t, t + dur + 0.03);
    return s;
  }
  function lfo(f, rate, depth, param, t, dur) {
    var l = ctx.createOscillator(), g = mkGain(depth);
    l.frequency.value = rate; l.connect(g); g.connect(param);
    f.nodes.push(g); go(f, l, t, t + dur + 0.03);
  }
  // o: type (bandpass) · f0 · f1 (đích sau "mid" giây) · f2 (đích cuối) · q · q1 (Q cuối) · a · hold · col ('white'|'pink'|'brown')
  //    sat (méo sau bộ lọc) · mv [p0, p1] (pan trượt riêng) · dest
  function noise(f, t, dur, peak, o) {
    o = o || {};
    var s = ctx.createBufferSource(), fl = filt(f, o.type || 'bandpass', o.f0 || 1000, o.q), head;
    s.buffer = o.col === 'pink' ? pinkBuf : o.col === 'brown' ? brownBuf : noiseBuf; s.loop = true;
    if (o.f1) {
      fl.frequency.setValueAtTime(o.f0, t);
      fl.frequency.exponentialRampToValueAtTime(o.f1, t + (o.mid || dur));
      if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    }
    if (o.q1) { fl.Q.setValueAtTime(fl.Q.value, t); fl.Q.linearRampToValueAtTime(o.q1, t + dur); }
    var g = env(f, t, Math.min(o.a || 0.005, dur * 0.5), peak, t + dur, o.hold);
    s.connect(fl); head = fl;
    if (o.sat) head = shape(f, head, o.sat);
    head.connect(g);
    if (o.mv && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.setValueAtTime(o.mv[0], t); p.pan.linearRampToValueAtTime(o.mv[1], t + dur);
      g.connect(p); p.connect(o.dest || f.bus); f.nodes.push(p);
    } else g.connect(o.dest || f.bus);
    go(f, s, t, t + dur + 0.03, Math.random() * Math.max(0, 1.95 - dur));   // không vượt cuối bộ đệm (nhiễu hồng/nâu sẽ "tách" ở chỗ nối vòng)
    return s;
  }
  // chuỗi xung nhiễu ngắn rải ngẫu nhiên (sỏi, kim tuyến): MỘT nguồn + MỘT bộ lọc + MỘT gain, tự động hoá n xung
  // o: n · span (s) · len (s mỗi xung) · type / f0 / q · peak · skew (>1: dồn về đầu) · dest
  function crackle(f, t, o) {
    var s = ctx.createBufferSource(), fl = filt(f, o.type || 'bandpass', o.f0, o.q), g = ctx.createGain(), ts = [], i, at, last = 0;
    s.buffer = noiseBuf; s.loop = true;
    for (i = 0; i < o.n; i++) ts.push(Math.pow(Math.random(), o.skew || 1) * o.span);
    ts.sort(function (a, b) { return a - b; });
    g.gain.setValueAtTime(0.0001, t);
    for (i = 0; i < o.n; i++) {
      at = Math.max(ts[i], i ? last + o.len * 1.2 : 0); last = at;          // xung sau không chồng xung trước
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.linearRampToValueAtTime(o.peak * rnd(0.35, 1) * f.av, t + at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + o.len);
    }
    s.connect(fl); fl.connect(g); g.connect(o.dest || f.bus); f.nodes.push(g);
    go(f, s, t, t + last + o.len + 0.03, Math.random() * 1.5);
  }
  // chuỗi hài (modal) của chuông / chiêng / thanh kim loại: mỗi phần [tỉ số, biên độ, thời tắt (s), attack (s)]. Vật thật có hài
  // KHÔNG nguyên, hài cao tắt nhanh hơn; chiêng còn "nở" chậm (attack dài dần). Hài > 12 kHz bỏ (tốn node, không nghe thấy gì thêm).
  function modes(f, t, base, list, peak, dest) {
    for (var i = 0; i < list.length; i++) {
      if (base * list[i][0] > 12000) continue;
      tone(f, 'sine', base * list[i][0], t, list[i][2], peak * list[i][1], { a: list[i][3] || 0.003, dest: dest });
    }
  }
  // "giọng" liên tục (kèn, ngâm nga): 1–2 sawtooth → méo mềm → lowpass cộng hưởng ("wah") → bao biên độ; mọi thông số là đường gấp khúc.
  // o: hz [[dt, hz, 's'?]…] (mũ) · cut [[dt, hz]…] (mũ) · amp [[dt, gain]…] (tuyến tính) · peak · q · det (cent giữa 2 osc) · sat
  //    vib [Hz, cent, từ giây, ramp giây] · type
  function voice(f, t, o) {
    var n = o.det ? 2 : 1, head = mkGain(1 / n), lp = filt(f, 'lowpass', o.cut[0][1], o.q), g = ctx.createGain(), end = o.amp[o.amp.length - 1][0] + t, i, s, oscs = [], vg = null;
    f.nodes.push(head, g);
    route(lp.frequency, t, o.cut, false, 1);
    route(g.gain, t, o.amp, true, o.peak * f.av);
    if (o.vib) {
      var vo = ctx.createOscillator(); vg = ctx.createGain();
      vo.frequency.value = o.vib[0];
      vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + o.vib[2]); vg.gain.linearRampToValueAtTime(o.vib[1], t + o.vib[2] + o.vib[3]);
      vo.connect(vg); f.nodes.push(vg); go(f, vo, t, end + 0.03);
    }
    for (i = 0; i < n; i++) {
      s = ctx.createOscillator(); s.type = o.type || 'sawtooth';
      s.detune.value = f.dc + (n === 2 ? (i ? o.det : -o.det) * 0.5 : 0);
      route(s.frequency, t, o.hz, false, 1);
      if (vg) vg.connect(s.detune);
      s.connect(head); oscs.push(s);
    }
    var h = o.sat ? shape(f, head, o.sat) : head;
    h.connect(lp); lp.connect(g); g.connect(f.bus);
    for (i = 0; i < n; i++) go(f, oscs[i], t, end + 0.03);
  }

  /* ------------------------------------------------------------ hiệu ứng */
  // level: chuẩn hoá độ to (đo bằng tools/audio-lab.mjs: RMS có cổng + LUFS xấp xỉ, mọi tiếng cách nhau ≤ ~7 dB) · dur: thời lượng dự kiến (s)
  // rev: mức gửi vào phòng vang (0..1) · vary: độ lệch cao độ ngẫu nhiên mỗi lần phát (mặc định ±3 %; tiếng có nốt nhạc nhỏ hơn)
  // Tên (khoá) là từ vựng công khai (gói động tác, kịch bản, đạo diễn) — không đổi, không xoá.
  var boingCurve = null;
  function boingHz() {                   // đường cao độ lò xo 180 → 620 → 150 Hz: vọt lên rồi tụt, rung chậm tắt dần (0.75 s) — dựng một lần
    if (boingCurve) return boingCurve;
    var n = 128, c = new Float32Array(n), i, u, base, depth;
    for (i = 0; i < n; i++) {
      u = i / (n - 1);
      base = u < 0.1 ? 180 * Math.pow(620 / 180, u / 0.1) : 150 + 470 * Math.exp(-(u - 0.1) * 3.6);
      depth = 0.27 * Math.exp(-u * 2.2) * Math.min(1, u * 10);
      c[i] = base * (1 + depth * Math.sin(2 * Math.PI * 14 * 0.75 * u));
    }
    return (boingCurve = c);
  }
  var SFX = {
    // bong bóng vỡ: một thân sin sạch trượt lên nhanh (cộng hưởng bong bóng) + "pụp" trầm ngắn + tách mềm — càng ít lớp càng tròn
    pop: { dur: 0.2, level: 1.25, rev: 0.05, play: function (f, t) {
      tone(f, 'sine', 380, t, 0.13, 1.2, { to: 900, glide: 0.35, a: 0.002 });
      tone(f, 'sine', 190, t, 0.06, 0.35, { to: 110, a: 0.002 });
      noise(f, t, 0.012, 0.45, { col: 'pink', type: 'lowpass', f0: 4000, a: 0.001 });
    } },
    // vút qua kiểu Doppler: dải nhiễu hồng quét lên rồi xuống, sáng nhất lúc đi ngang (pan qua giữa), thêm hơi cao + thân trầm "đẩy không khí"
    whoosh: { dur: 0.6, level: 0.85, rev: 0.22, play: function (f, t) {
      var L = lane(f, -0.75, 0.75, t, 0.5);
      noise(f, t, 0.55, 0.5, { col: 'pink', type: 'bandpass', f0: 300, f1: 2600, mid: 0.24, f2: 520, q: 0.9, q1: 1.6, a: 0.22, dest: L });
      noise(f, t + 0.03, 0.46, 0.12, { type: 'highpass', f0: 3000, f1: 5500, mid: 0.22, f2: 2600, q: 0.5, a: 0.2, dest: L });
      noise(f, t, 0.5, 0.1, { col: 'brown', type: 'lowpass', f0: 160, f1: 260, mid: 0.2, f2: 120, a: 0.2, sat: 1.5 });
    } },
    // bước chân mềm: gót (thịch trầm + bụi vải) rồi mũi (tạch nhẹ, cao hơn) ~60 ms sau; mỗi lần một dáng khác
    step: { dur: 0.2, level: 0.99, rev: 0.05, vary: 0.05, play: function (f, t) {
      var r = Math.random(), t2 = t + 0.055 + r * 0.015;
      tone(f, 'sine', 130 + r * 30, t, 0.07, 0.3, { to: 62, glide: 0.5, a: 0.002, sat: 1.4 });
      noise(f, t, 0.04, 0.9, { type: 'lowpass', f0: 650 + r * 350, q: 0.7, a: 0.002 });
      noise(f, t + 0.012, 0.025, 0.36, { type: 'bandpass', f0: 2200, q: 1, a: 0.002 });
      noise(f, t2, 0.03, 0.55, { type: 'bandpass', f0: 1500 + r * 400, q: 0.9, a: 0.002 });
      tone(f, 'sine', 160, t2, 0.03, 0.26, { to: 100, a: 0.002 });
    } },
    // "đùn-ĐÙNG!": hai cú dàn nhạc kiểu hài kịch — cú đầu ngắn, cú sau dày (trống bass + kèn tritone + chũm chọe)
    sting: { dur: 1.0, level: 0.21, rev: 0.35, play: function (f, t) {
      function stab(tt, pk, len, cymbal) {
        tone(f, 'sine', 120, tt, len * 0.8, 0.2 * pk, { path: [[0.05, 70], [len * 0.7, 44]], a: 0.003, sat: 1.8 });
        tone(f, 'sawtooth', 164.8, tt, len, 0.45 * pk, { a: 0.012, sat: 1.4, lp: 3200, q: 0.8 });
        tone(f, 'sawtooth', 233.1, tt, len, 0.4 * pk, { a: 0.012, sat: 1.4, lp: 3200, q: 0.8, cents: 6 });
        if (cymbal) noise(f, tt, 0.55, 0.3, { type: 'highpass', f0: 4200, a: 0.004 });
      }
      stab(t, 0.7, 0.14, false);
      stab(t + 0.19, 1, 0.6, true);
    } },
    // cú đấm hài (không máu me): thud hạ tần GIỮ ĐƯỢC SỨC (≈150 ms; thiếu thân thì chỉ còn một cái "tách" nhọn, nghe mỏng / kim loại) + thân "bốp"
    // có cao độ + "bạt" nhiễu hồng quét lowpass lấp khoảng giữa 300–1500 Hz + tách nhẹ; đuôi = phòng vang. Méo mềm có bias → hài chẵn nghe được trên loa nhỏ.
    hit: { dur: 0.4, level: 1.62, rev: 0.18, play: function (f, t) {
      tone(f, 'sine', 155, t, 0.24, 0.85, { path: [[0.035, 92], [0.2, 48]], a: 0.0015, sat: 2.1, bias: 0.12 });
      tone(f, 'triangle', 240, t, 0.13, 0.6, { to: 110, glide: 0.7, a: 0.0015, sat: 1.3 });
      noise(f, t, 0.12, 1, { col: 'pink', type: 'lowpass', f0: 2600, f1: 280, mid: 0.08, q: 0.7, a: 0.001 });
      noise(f, t, 0.06, 0.6, { col: 'pink', type: 'bandpass', f0: 750, q: 0.6, a: 0.001 });
      noise(f, t, 0.008, 0.2, { type: 'highpass', f0: 3500, a: 0.0006 });
    } },
    // lò xo "bòooing": cao độ vọt lên rồi tụt có rung chậm tắt dần (đường cong dựng sẵn); thân sin + tam giác thấp một quãng tám (đầy, "cao su")
    boing: { dur: 0.85, level: 0.32, rev: 0.06, play: function (f, t) {
      var c = boingHz();
      tone(f, 'sine', 0, t, 0.75, 0.8, { curve: c, a: 0.004, sat: 1.2 });
      tone(f, 'triangle', 0, t, 0.75, 0.7, { curve: c, a: 0.004, cents: -1200, lp: 1000 });
      noise(f, t, 0.015, 0.2, { col: 'pink', type: 'lowpass', f0: 3000, a: 0.001 });
    } },
    // lấp lánh phép thuật: 6 tiếng chuông nhỏ đi lên (pentatonic) trải ba vị trí stereo, hài không nguyên ở các nốt chẵn, màn nhiễu cao mờ
    sparkle: { dur: 0.95, level: 0.62, rev: 0.4, vary: 0.012, play: function (f, t) {
      var N = [1319, 1568, 1976, 2349, 2637, 3136], L = [lane(f, -0.55, null, t), lane(f, 0, null, t), lane(f, 0.55, null, t)], i, tt;
      for (i = 0; i < N.length; i++) {
        tt = t + i * 0.068 + rnd(0, 0.014);
        tone(f, 'sine', N[i], tt, 0.42, 0.24 - i * 0.012, { a: 0.002, dest: L[i % 3] });
        if (i % 2 === 0) tone(f, 'sine', N[i] * 2.76, tt, 0.14, 0.08, { a: 0.002, dest: L[(i + 1) % 3] });
      }
      noise(f, t, 0.8, 0.08, { type: 'highpass', f0: 6500, a: 0.3, dest: L[1] });
    } },
    // rung chuyển đất: nhiễu nâu qua lowpass có méo (hài lên được loa nhỏ) + hai saw trầm AM "nghiến" + sin sub + vài hòn sỏi rơi
    rumble: { dur: 0.9, level: 0.28, rev: 0.2, play: function (f, t) {
      noise(f, t, 0.85, 0.35, { col: 'brown', type: 'lowpass', f0: 150, f1: 260, mid: 0.35, f2: 160, a: 0.3, sat: 2.5, mv: [-0.2, 0.25] });
      noise(f, t, 0.85, 0.5, { col: 'pink', type: 'bandpass', f0: 250, f1: 480, mid: 0.4, f2: 300, q: 1, a: 0.3, sat: 2 });
      tone(f, 'sawtooth', 47, t, 0.85, 0.3, { to: 39, a: 0.3, lp: 240, q: 1, am: 21, sat: 1.6 });
      tone(f, 'sawtooth', 50.5, t, 0.85, 0.26, { to: 41, a: 0.3, lp: 240, q: 1, am: 29 });
      tone(f, 'sine', 36, t, 0.85, 0.2, { to: 31, a: 0.35, sat: 2 });
      crackle(f, t + 0.12, { n: 5, span: 0.55, len: 0.07, f0: 900, q: 0.7, peak: 0.5 });
    } },
    // giọt nước "tinh": hai giọt như bản cũ (700 → 1500 Hz, giọt sau 650 → 1050 Hz đến sau 0.14 s) nhưng ngân sạch hơn, thêm hài mỏng + tách mềm + vang nhẹ
    drip: { dur: 0.55, level: 0.62, rev: 0.12, play: function (f, t) {
      tone(f, 'sine', 700, t, 0.13, 0.9, { to: 1500, glide: 0.62, a: 0.003 });
      tone(f, 'sine', 1400, t, 0.05, 0.1, { to: 3000, glide: 0.62, a: 0.002 });
      noise(f, t, 0.006, 0.15, { col: 'pink', type: 'lowpass', f0: 3500, a: 0.0006 });
      tone(f, 'sine', 650, t + 0.14, 0.13, 0.4, { to: 1050, glide: 0.62, a: 0.003 });
      tone(f, 'sine', 1300, t + 0.14, 0.05, 0.05, { to: 2100, glide: 0.62, a: 0.002 });
    } },
    // kèn trombone buồn "wah-wah-wah-waaah": MỘT giọng liên tục (F4 E4 Eb4 D4, mỗi nốt tụt nửa cung), mỗi nốt một lượt mở / đóng bộ lọc, nốt cuối rung + tụt.
    // Hai lớp: tam giác (thân tròn, như bản cũ) + saw lọc "wah" nhẹ (độ "đồng thau")
    sad: { dur: 1.75, level: 0.18, rev: 0.2, vary: 0.01, play: function (f, t) {
      var N = [349.2, 329.6, 311.1, 293.7], on = [0, 0.36, 0.72, 1.08], len = [0.34, 0.34, 0.34, 0.62], hz = [], cut = [], amp = [], i, a, v;
      for (i = 0; i < 4; i++) {
        a = on[i]; v = 1 - i * 0.05;
        if (i) hz.push([a - 0.03, N[i - 1], 's']);
        hz.push([a, N[i]]);
        cut.push(i ? [a, 500, 's'] : [a, 500], [a + 0.1, 1600], [a + len[i], i === 3 ? 450 : 800]);
        amp.push([a, 0], [a + 0.035, v], [a + len[i] - 0.05, v * 0.85], [a + len[i], 0]);
      }
      hz.push([on[3] + 0.2, N[3]], [on[3] + 0.52, N[3] * 0.88]);
      var vib = [5.4, 22, on[3] + 0.18, 0.2];
      voice(f, t, { type: 'triangle', q: 0.8, peak: 0.7, hz: hz, cut: [[0, 1800], [1.6, 1800]], amp: amp, vib: vib });
      voice(f, t, { det: 4, q: 1.2, peak: 0.22, hz: hz, cut: cut, amp: amp, vib: vib });
    } },
    // ngáy hoạt hình: hít vào (hơi + rung vòm họng tăng dần) · nghỉ · thở ra (hơi tụt xuống + còi mũi nhỏ)
    snore: { dur: 1.5, level: 0.47, rev: 0.15, play: function (f, t) {
      noise(f, t, 0.62, 0.75, { col: 'pink', type: 'bandpass', f0: 300, f1: 800, mid: 0.55, q: 1.2, a: 0.5 });
      tone(f, 'sawtooth', 68, t + 0.08, 0.52, 0.25, { to: 92, a: 0.4, lp: 700, q: 2, am: 19, sat: 1.8 });
      noise(f, t + 0.75, 0.6, 0.7, { col: 'pink', type: 'bandpass', f0: 950, f1: 430, q: 1.1, a: 0.14 });
      tone(f, 'sawtooth', 80, t + 0.75, 0.4, 0.25, { to: 58, a: 0.1, lp: 600, q: 2, am: 15, sat: 1.5 });
      tone(f, 'sine', 560, t + 0.78, 0.5, 0.05, { to: 470, a: 0.12 });
    } },
    // pháo giấy: "bóc" (thump + tách) → kim tuyến rơi rải rác → arpeggio trưởng lấp lánh + còi "pwiu"
    party: { dur: 1.2, level: 0.74, rev: 0.3, play: function (f, t) {
      var n = [1047, 1319, 1568, 2093], i;
      tone(f, 'sine', 210, t, 0.14, 0.7, { to: 60, glide: 0.5, a: 0.002, sat: 1.8 });
      noise(f, t, 0.06, 0.55, { type: 'bandpass', f0: 2400, q: 0.7, a: 0.001, sat: 1.5 });
      noise(f, t, 0.012, 0.4, { type: 'highpass', f0: 5000, a: 0.0008 });
      crackle(f, t + 0.05, { n: 14, span: 0.7, len: 0.035, f0: 5200, q: 1.2, peak: 0.16, skew: 1.6 });
      for (i = 0; i < n.length; i++) tone(f, 'triangle', n[i], t + 0.1 + i * 0.07, 0.34, 0.2, { a: 0.003 });
      tone(f, 'sawtooth', 500, t + 0.03, 0.28, 0.07, { to: 1900, a: 0.02, lp: 3000 });
    } },
    // "mm-HM?": ngâm nga miệng ngậm — saw qua lowpass tối, nốt hai trượt lên như câu hỏi, rung nhẹ ở cuối
    hmm: { dur: 0.6, level: 0.24, rev: 0.12, vary: 0.02, play: function (f, t) {
      voice(f, t, { det: 6, sat: 1.3, q: 2.5, peak: 0.55,
        hz: [[0, 262], [0.15, 262, 's'], [0.2, 294], [0.52, 349]],
        cut: [[0, 520], [0.17, 520, 's'], [0.2, 650], [0.45, 1300], [0.55, 650]],
        amp: [[0, 0], [0.025, 1], [0.13, 0.9], [0.16, 0], [0.2, 0], [0.24, 1], [0.48, 0.9], [0.56, 0]],
        vib: [5.6, 16, 0.3, 0.1] });
    } },
    // chiêng lớn: 9 hài không nguyên (hài cao nở chậm sau cú đánh, tắt nhanh hơn) + hài lệch tạo phách + sub + "thịch" và "xoẹt" kim loại lúc đánh
    gong: { dur: 3.4, level: 0.19, rev: 0.4, vary: 0.012, play: function (f, t) {
      modes(f, t, 110, [[1, 0.45, 3.4, 0.01], [1.0075, 0.3, 3.3, 0.01], [2.02, 0.6, 3, 0.02], [2.76, 0.5, 2.6, 0.05], [3.52, 0.35, 2.1, 0.09],
        [4.31, 0.28, 1.7, 0.14], [5.46, 0.2, 1.3, 0.2], [6.71, 0.13, 1, 0.25], [8.2, 0.08, 0.8, 0.3]], 1);
      tone(f, 'sine', 55, t, 2.4, 0.08, { a: 0.02 });
      noise(f, t, 0.05, 0.6, { type: 'lowpass', f0: 900, a: 0.002 });
      noise(f, t, 0.35, 0.25, { type: 'bandpass', f0: 3200, q: 0.8, a: 0.03 });
    } },
    // chuông "ting-ting" như chuông cửa hàng: hai nhát E6 rồi A6 (đúng cao độ bản cũ); thân sin sạch, chỉ điểm thêm hài thanh kim loại 1 : 2.76 : 5.40
    // thật nhẹ để có "men" kim loại mà không thành chuông lớn; ngân dài hơn bản cũ một chút, vang nhẹ
    chime: { dur: 0.8, level: 0.47, rev: 0.1, vary: 0.012, play: function (f, t) {
      var BAR = [[1, 1, 0.75, 0.002], [2.756, 0.14, 0.3, 0.002], [5.404, 0.05, 0.14, 0.002]];
      modes(f, t, 1319, BAR, 0.3);
      modes(f, t + 0.11, 1760, BAR, 0.28);
      noise(f, t, 0.005, 0.12, { col: 'pink', type: 'lowpass', f0: 5000, a: 0.0004 });
      noise(f, t + 0.11, 0.005, 0.1, { col: 'pink', type: 'lowpass', f0: 5000, a: 0.0004 });
    } },
    // lưỡi kiếm vung nhanh: dải nhiễu hồng hẹp quét lên rồi xuống + hơi cao + tiếng rít mảnh, pan lướt qua trong 0.24 s
    swish: { dur: 0.3, level: 1.29, rev: 0.07, play: function (f, t) {
      var L = lane(f, -0.65, 0.65, t, 0.24);
      noise(f, t, 0.24, 0.5, { col: 'pink', type: 'bandpass', f0: 1500, f1: 5600, mid: 0.11, f2: 2800, q: 2, q1: 1.2, a: 0.08, dest: L });
      noise(f, t + 0.02, 0.2, 0.1, { type: 'highpass', f0: 5200, a: 0.07, dest: L });
      tone(f, 'sine', 2300, t + 0.01, 0.2, 0.05, { path: [[0.1, 5200], [0.2, 2900]], a: 0.07, dest: L });
    } },
    // tích tắc đồng hồ / mõ gỗ: hai mode gỗ ngân ngắn (sin, tỉ số không nguyên) + "cộp" nhiễu băng giữa + tách; mỗi lần cao độ hơi khác
    tick: { dur: 0.1, level: 1.83, rev: 0.05, vary: 0.04, play: function (f, t) {
      var r = Math.random();
      tone(f, 'sine', 1750 + r * 300, t, 0.05, 1, { to: 1500 + r * 250, a: 0.0006, sat: 1.3 });
      tone(f, 'sine', 3100 + r * 400, t, 0.025, 0.4, { a: 0.0006 });
      tone(f, 'sine', 640, t, 0.035, 0.45, { to: 520, a: 0.001 });
      noise(f, t, 0.014, 0.7, { type: 'bandpass', f0: 2800 + r * 500, q: 1.4, a: 0.0006 });
      noise(f, t, 0.005, 0.25, { type: 'highpass', f0: 5500, a: 0.0004 });
    } }
  };
  function sfx(name, opts) {
    if (!ready() || muted || typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SFX, name)) return;
    opts = opts || {};
    var d = SFX[name], v = d.vary == null ? 0.03 : d.vary;
    var f = mkFx(sfxBus, d.dur + 0.1, true, d.level * clamp(opts.gain, 0, 1, 1), opts.pan != null ? clamp(opts.pan, -1, 1, 0) : null, d.rev);
    if (!f) return;
    f.dc = 1200 * Math.log(1 + rnd(-v, v)) / Math.LN2;       // lệch nhẹ mỗi lần phát để lặp lại không "máy"
    f.fc = 1200 * Math.log(1 + rnd(-0.1, 0.1)) / Math.LN2;
    f.av = Math.pow(10, rnd(-1, 1) / 20);
    d.play(f, ctx.currentTime + 0.005);
  }
  function sfxInfo() {
    var o = {}, k;
    for (k in SFX) if (Object.prototype.hasOwnProperty.call(SFX, k)) o[k] = { dur: SFX[k].dur, level: SFX[k].level };
    return o;
  }

  /* ------------------------------------------------------------ tiếng nền */
  function later(b, key, ms, fn) {
    b.timers[key] = setTimeout(function () { if (!b.dead) fn(); }, ms);
  }
  function bedSrc(b, s) { s.start(); b.srcs.push(s); b.nodes.push(s); return s; }
  // nguồn nhiễu lặp → filter → gain → ngõ ra của nền; trả về {filter, gain} để gắn LFO
  function bedNoise(b, type, freq, q, level) {
    var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = mkGain(level, b.out);
    s.buffer = noiseBuf; s.loop = true;
    fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    s.connect(fl); fl.connect(g);
    s.start(0, Math.random() * 1.5); b.srcs.push(s); b.nodes.push(s, fl, g);
    return { filter: fl, gain: g };
  }
  function bedLfo(b, rate, depth, param) {
    var l = ctx.createOscillator(), g = mkGain(depth, param);
    l.frequency.value = rate; l.connect(g);
    bedSrc(b, l); b.nodes.push(g);
  }
  function air(b, level) { bedNoise(b, 'lowpass', 600, 0.5, level); }
  function room(b) { bedNoise(b, 'lowpass', 140, 0.5, 0.05); }
  function wind(b, strength, cutoff) {
    var n = bedNoise(b, 'lowpass', cutoff, 0.8, 0.1 * strength);
    bedLfo(b, 0.11, cutoff * 0.5, n.filter.frequency);
    bedLfo(b, 0.07, 0.06 * strength, n.gain.gain);
  }
  function rain(b, level, cutoff) {
    bedNoise(b, 'bandpass', 1900 * cutoff, 0.45, 0.2 * level);   // ~1–3 kHz
    bedNoise(b, 'lowpass', 400, 0.6, 0.04 * level);
    (function drop() {
      later(b, 'drop', rnd(120, 450), function () {
        if (!muted && ready()) {
          var t = ctx.currentTime + 0.01, f = mkFx(b.out, 0.1, false, rnd(0.3, 1) * level, rnd(-0.8, 0.8));
          tone(f, 'sine', rnd(1500, 3300), t, 0.04, 0.09, { to: 900, a: 0.002 });
        }
        drop();
      });
    })();
  }
  function bird(b) {
    if (muted || !ready()) return;
    var t = ctx.currentTime + 0.02, n = 1 + Math.floor(Math.random() * 4), f0 = rnd(2300, 3800), tt = t, fr = f0, i;
    var f = mkFx(b.out, n * 0.2 + 0.3, false, rnd(0.5, 1), rnd(-0.7, 0.7));
    var c = ctx.createOscillator(), g = ctx.createGain(), m = ctx.createOscillator(), mg = mkGain(rnd(80, 260));
    c.type = 'sine'; m.frequency.value = rnd(35, 75);
    g.gain.setValueAtTime(0.0001, t);
    for (i = 0; i < n; i++) {
      var d = rnd(0.06, 0.11), f1 = fr * (Math.random() < 0.7 ? rnd(1.15, 1.5) : rnd(0.65, 0.88));
      c.frequency.setValueAtTime(fr, tt);
      c.frequency.exponentialRampToValueAtTime(f1, tt + d);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.11, tt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      tt += d + rnd(0.03, 0.06);
      fr = clamp(f0 * rnd(0.85, 1.25), 1800, 5000);
    }
    m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(f.bus);
    f.nodes.push(g, mg);
    go(f, c, t, tt + 0.05); go(f, m, t, tt + 0.05);
  }
  function birds(b, rate) {
    later(b, 'bird', rnd(500, 2000) / rate, function () { bird(b); birdLoop(b, rate); });
  }
  function birdLoop(b, rate) {
    later(b, 'bird', rnd(1500, 4000) / rate, function () { bird(b); birdLoop(b, rate); });
  }
  // dế: sin cao có AM ~30 Hz, mỗi lượt 3 xung ngắt quãng, lặp mỗi 0.7–1.5 s
  function cricket(b, h0, level) {
    var o = ctx.createOscillator(), l = ctx.createOscillator(), am = mkGain(0.5), lg = mkGain(0.5, am.gain), burst = mkGain(0, b.out), key = 'c' + h0;
    o.type = 'sine'; o.frequency.value = h0; l.frequency.value = rnd(26, 34);
    l.connect(lg); o.connect(am); am.connect(burst);
    bedSrc(b, o); bedSrc(b, l); b.nodes.push(am, lg, burst);
    (function chirp() {
      later(b, key, rnd(700, 1500), function () {
        if (!muted && ready()) {
          var t = ctx.currentTime + 0.01, p = burst.gain;
          for (var i = 0; i < 3; i++) {
            var s = t + i * 0.11;
            p.setValueAtTime(0, s); p.linearRampToValueAtTime(level, s + 0.012);
            p.setValueAtTime(level, s + 0.06); p.linearRampToValueAtTime(0, s + 0.075);
          }
        }
        chirp();
      });
    })();
  }
  function crickets(b, level) { cricket(b, 4300, 0.05 * level); cricket(b, 4750, 0.04 * level); }

  function bedSpec(spec) {
    spec = spec || {};
    var s = {
      time: TIMES.indexOf(spec.time) >= 0 ? spec.time : 'day',
      weather: WEATHERS.indexOf(spec.weather) >= 0 ? spec.weather : 'clear',
      indoor: !!spec.indoor
    };
    s.key = s.time + '|' + s.weather + '|' + (s.indoor ? 'in' : 'out');
    return s;
  }
  function buildBed(b, s) {
    var w = s.weather, tm = s.time;
    if (s.indoor) {                       // trong nhà: chỉ tiếng phòng rất thấp; mưa nghe qua tường
      room(b);
      if (w === 'rain') rain(b, 0.5, 0.6);
      return;
    }
    if (w === 'rain') rain(b, 1, 1);
    else if (w === 'snow') wind(b, 1, 520);
    else if (w === 'mist') wind(b, 0.6, 420);
    else if (w === 'petals' || w === 'leaves') {
      wind(b, 0.5, w === 'leaves' ? 900 : 650);
      if (tm === 'night') crickets(b, 0.7); else birds(b, 1);
    } else if (w === 'fireflies') { air(b, 0.03); crickets(b, 1); }
    else {
      air(b, 0.03);
      if (tm === 'night') crickets(b, 1);
      else if (tm === 'dusk') { crickets(b, 0.6); birds(b, 0.3); }
      else birds(b, tm === 'dawn' ? 1.4 : 1);
    }
  }
  function fadeOut(g, t, sec) {
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + sec);
  }
  function stopBed(b, sec) {
    b.dead = true;
    for (var k in b.timers) clearTimeout(b.timers[k]);
    var t = ctx.currentTime;
    fadeOut(b.out.gain, t, sec);
    for (var i = 0; i < b.srcs.length; i++) b.srcs[i].stop(t + sec + 0.05);
    setTimeout(function () {
      for (var j = 0; j < b.nodes.length; j++) b.nodes[j].disconnect();
      b.out.disconnect();
    }, (sec + 0.2) * 1000);
  }
  function startBed(spec) {
    var s = bedSpec(spec);
    if (bed && bed.key === s.key && !bed.dead) return;
    var t = ctx.currentTime, old = bed;
    var b = { key: s.key, out: ctx.createGain(), srcs: [], nodes: [], timers: {}, dead: false };
    b.out.gain.setValueAtTime(0, t); b.out.gain.linearRampToValueAtTime(1, t + 0.8);
    b.out.connect(ambBus);
    buildBed(b, s);
    bed = b;
    if (old) stopBed(old, 0.8);
  }
  function ambient(spec) {
    wantAmb = spec || null;
    if (!ctx) return;
    if (!spec) { if (bed) { stopBed(bed, 0.8); bed = null; } return; }
    startBed(spec);
  }

  /* ------------------------------------------------------------- nhạc nền */
  var PENTA = [0, 2, 4, 7, 9], MINPENTA = [0, 3, 5, 7, 10];
  function walk(m, scale, lo, hi, span) {
    m.deg = clamp(m.deg + Math.round(rnd(-span, span)), lo, hi);
    var L = scale.length;
    return scale[((m.deg % L) + L) % L] + 12 * Math.floor(m.deg / L);
  }
  function note(m, type, h, t, dur, peak, o) {
    var f = mkFx(m.out, dur + 0.15, false);
    tone(f, type, h, t, dur, peak, o);
  }
  function pad(m, t, list, dur, peak, o) {
    var f = mkFx(m.out, dur + 0.15, false);
    for (var i = 0; i < list.length; i++) tone(f, o.type || 'sine', list[i], t, dur, peak, o);
  }
  function kick(m, t, peak) {
    var f = mkFx(m.out, 0.5, false);
    tone(f, 'sine', 110, t, 0.35, peak, { to: 42, glide: 0.5, a: 0.003 });
    noise(f, t, 0.05, peak * 0.3, { type: 'lowpass', f0: 900, a: 0.002 });
  }
  function tom(m, t, peak) {
    var f = mkFx(m.out, 0.4, false);
    tone(f, 'sine', 170, t, 0.25, peak, { to: 85, glide: 0.6, a: 0.003 });
  }
  var MOOD = {
    calm: { step: 0.5, play: function (m, t, n) {
      var r = [0, -3, -5, -7][Math.floor(n / 8) % 4];
      if (n % 8 === 0) pad(m, t, [hz(130.81, r), hz(130.81, r + 7), hz(130.81, r + 16)], 4.4, 0.16, { a: 1.3 });
      if (Math.random() < 0.6) note(m, 'triangle', hz(261.63, walk(m, PENTA, 0, 9, 2)), t, 1.3, 0.5, { a: 0.008, lp: 2200 });
    } },
    tense: { step: 0.25, play: function (m, t, n) {
      var low = hz(110, Math.floor(n / 16) % 2 ? 1 : 0), p = [1, 0, 0.55, 0, 0.9, 0, 0.5, 0.35][n % 8];
      if (p) note(m, 'sawtooth', low, t, 0.22, 0.5 * p, { a: 0.006, lp: 380 });
      if (n % 16 === 0) pad(m, t, [55, 77.8], 4.2, 0.12, { a: 1.2 });
      if (n % 4 === 0 && Math.random() < 0.1) note(m, 'triangle', hz(440, [0, 1, 3, 7][Math.floor(Math.random() * 4)]), t, 1.2, 0.25, { a: 0.01, lp: 3000 });
    } },
    epic: { step: 0.55, play: function (m, t, n) {
      var p = n % 8, r = [0, -4, -2, -5][Math.floor(n / 8) % 4];
      if (p === 0) kick(m, t, 1); else if (p === 4) kick(m, t, 0.8); else if (p === 2 || p === 6) tom(m, t, 0.5);
      if (p === 0) pad(m, t, [hz(73.42, r), hz(73.42, r + 7), hz(73.42, r + 12)], 4.6, 0.14, { a: 0.9, type: 'sawtooth', lp: 700 });
    } },
    comic: { step: 0.2, play: function (m, t, n) {
      var r = [0, 5, 7, 0][Math.floor(n / 16) % 4];
      if (n % 2 === 0) note(m, 'triangle', hz(65.41, r + (n % 4 === 2 ? 7 : 0)), t, 0.14, 0.6, { a: 0.004, lp: 700 });
      if (Math.random() < 0.65) note(m, 'square', hz(261.63, walk(m, PENTA, 0, 9, 2)), t, 0.09, 0.22, { a: 0.003, lp: 1800 });
    } },
    sad: { step: 0.9, play: function (m, t, n) {
      var r = [0, -2, -4, -5][Math.floor(n / 8) % 4];
      if (n % 8 === 0) pad(m, t, [hz(110, r), hz(110, r + 7), hz(110, r + 15)], 7.2, 0.15, { a: 2 });
      if (Math.random() < 0.38) note(m, 'sine', hz(220, walk(m, MINPENTA, 0, 7, 2)), t, 2.4, 0.5, { a: 0.02 });
    } }
  };
  function musTick(m) {
    if (m.dead) return;
    var t = ctx.currentTime;
    if (ready()) {
      if (m.next < t) m.next = t + 0.05;                 // sau khi ctx bị treo: bắt đầu lại, không dồn nốt
      while (m.next < t + AHEAD) {
        if (!muted) m.cfg.play(m, m.next, m.n);
        m.n++; m.next += m.cfg.step;
      }
    }
    m.timer = setTimeout(function () { musTick(m); }, 100);
  }
  function stopMus(m, sec) {
    m.dead = true; clearTimeout(m.timer);
    fadeOut(m.out.gain, ctx.currentTime, sec);
    setTimeout(function () { m.out.disconnect(); }, (sec + 0.1) * 1000);   // nốt đã lập lịch tự dừng + ngắt khi hết
  }
  function startMus(mood) {
    if (mus && mus.mood === mood && !mus.dead) return;
    var t = ctx.currentTime, old = mus;
    var m = { mood: mood, cfg: MOOD[mood], out: ctx.createGain(), dead: false, timer: 0, n: 0, deg: 3, next: t + 0.1 };
    m.out.gain.setValueAtTime(0, t); m.out.gain.linearRampToValueAtTime(1, t + 1);
    m.out.connect(musBus);
    mus = m;
    if (old) stopMus(old, 1);
    musTick(m);
  }
  function music(mood) {
    if (mood != null && !Object.prototype.hasOwnProperty.call(MOOD, mood)) return;   // tên lạ: giữ nguyên nhạc đang chạy
    wantMus = mood || null;
    if (!ctx) return;
    if (!mood) { if (mus) { stopMus(mus, 1); mus = null; } return; }
    startMus(mood);
  }

  /* ---------------------------------------------------------- giọng nhân vật */
  var LOW_KW = ['tướng', 'võ', 'sếp', 'trưởng', 'vua', 'chúa', 'lão', 'ông', 'cụ', 'sư phụ', 'thầy', 'giám đốc', 'đại ca', 'boss', 'chief', 'king', 'general', 'master'];
  var HIGH_KW = ['bé', 'nhỏ', 'lính', 'quèn', 'mới', 'trẻ', 'em', 'nhóc', 'cô', 'nàng', 'công chúa', 'tiên', 'học trò', 'đệ tử', 'thực tập', 'kid', 'intern'];
  function norm(s) {
    s = String(s == null ? '' : s).toLowerCase();
    if (s.normalize) s = s.normalize('NFC');
    return ' ' + s.replace(/[.,;:!?()\[\]\/\\|"'\-–—_]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  }
  function hasKw(text, list) {
    for (var i = 0; i < list.length; i++) if (text.indexOf(' ' + list[i] + ' ') >= 0) return true;
    return false;
  }
  function blipOf(pitch) { return Math.round(200 * Math.pow(2, (pitch - 1) * 1.3)); }   // 0.5→127 Hz · 1→200 · 2→492
  // giọng của một nhân vật cho trình duyệt: có engine/voices.js thì theo VAI (tuổi × giới × văn / võ) + ngôn ngữ của tác phẩm
  // (opts: { lang, accent }); cao độ / tốc độ nhân vật tự chỉnh luôn thắng. Không có voices.js (tệp phim cũ) thì đoán như trước.
  function voiceOf(asset, opts) {
    asset = asset || {};
    var v = asset.voice || {}, hp = typeof v.pitch === 'number' && v.pitch === v.pitch, hr = typeof v.rate === 'number' && v.rate === v.rate;
    var h = hash(String(asset.id || asset.key || asset.name || '')), pitch, rate, c = GC.voices ? GC.voices.cast(asset, opts) : null;
    if (c) {
      // cùng vai → lệch nhẹ theo id để hai nhân vật cùng vai không nói y hệt nhau trên giọng trình duyệt
      pitch = hp ? clamp(v.pitch, 0.5, 2) : clamp(c.pitch + ((h % 13) - 6) / 100, 0.5, 2);
      rate = hr ? clamp(v.rate, 0.6, 1.6) : clamp(c.rate + (((h >>> 8) % 9) - 4) / 100, 0.6, 1.6);
    } else {
      var text = norm([asset.role, asset.persona, asset.name].join(' ')), low = hasKw(text, LOW_KW), high = hasKw(text, HIGH_KW);
      if (hp) pitch = clamp(v.pitch, 0.5, 2);
      else pitch = clamp(1 + ((h % 21) - 10) / 50 + (low ? -0.3 : 0) + (high ? 0.3 : 0), 0.5, 2);
      if (hr) rate = clamp(v.rate, 0.6, 1.6);
      else rate = clamp(1 + (((h >>> 8) % 17) - 8) / 60 + (low ? -0.08 : 0) + (high ? 0.1 : 0), 0.6, 1.6);
    }
    var o = { pitch: Math.round(pitch * 100) / 100, rate: Math.round(rate * 100) / 100, blip: typeof v.blip === 'number' && v.blip > 0 ? v.blip : blipOf(pitch), lang: c ? c.bcp : 'vi-VN' };
    if (c) { o.gender = c.gender; o.role = c.role; }
    return o;
  }
  function normVoice(v) {
    v = v || {};
    var pitch = clamp(v.pitch, 0, 2, 1);
    return { pitch: pitch, rate: clamp(v.rate, 0.5, 1.8, 1), blip: v.blip > 0 ? +v.blip : blipOf(pitch),
      lang: typeof v.lang === 'string' && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(v.lang) ? v.lang : 'vi-VN', gender: v.gender === 'f' || v.gender === 'm' ? v.gender : '', needGood: v.needGood === true };
  }

  /* ---------------------------------------------------------- giọng đọc TTS */
  // nạp bất đồng bộ (Chrome trả [] lần đầu rồi bắn voiceschanged). Chỉ nhận giọng ĐÚNG ngôn ngữ (vi / en / zh…) — không bao giờ đọc
  // tiếng Việt bằng giọng Anh; ưu tiên giọng thần kinh (Edge "Online (Natural)", Google), rồi đúng giới của vai (theo tên giọng phổ biến).
  var F_NAMES = /HiuMaan|HiuGaai|Sin-?Ji|HoaiMy|\bLinh\b|Xiaoxiao|Xiaoyi|Xiaohan|Xiaomo|Xiaoxuan|Xiaochen|Huihui|Yaoyao|Tingting|Meijia|Sinji|HsiaoChen|HsiaoYu|Aria|Jenny|Michelle|Sonia|Libby|Zira|Samantha|Karen|Moira|Tessa|Victoria|Susan|Hazel|Emma|Ava|Female|女/i;
  var M_NAMES = /WanLung|NamMinh|\bAn\b|Yunxi|Yunjian|Yunyang|Yunze|Yunhao|Kangkang|YunJhe|\bGuy\b|Davis|Tony|\bRyan\b|Thomas|David|\bMark\b|\bAlex\b|Daniel|George|Andrew|Brian|Christopher|\bMale\b|男/i;
  var vcache = {}, YUE = /^(yue|zh-hk|zh-mo)/;
  function findVoice(lang, gender) {
    if (!synth) return null;
    lang = String(lang || 'vi-VN'); gender = gender || '';
    var pre = lang.slice(0, 2).toLowerCase(), key = lang + '|' + gender, wantYue = YUE.test(lang.toLowerCase());
    if (vcache[key] !== undefined) return vcache[key];
    var list = synth.getVoices ? synth.getVoices() : [], best = null, bs = -1e9;
    for (var i = 0; i < list.length; i++) {
      var v = list[i], vl = String(v.lang || '').toLowerCase().replace('_', '-');
      // Quảng Đông (zh-HK / yue) và phổ thông (zh-CN / zh-TW) là hai thứ tiếng: không bao giờ đọc chéo
      if (wantYue ? !YUE.test(vl) : (vl !== pre && vl.indexOf(pre + '-') !== 0) || YUE.test(vl)) continue;
      var s = 1, fem = F_NAMES.test(v.name), mal = M_NAMES.test(v.name);
      if (/google|microsoft/i.test(v.name)) s += 3;
      if (/\b(Linh|An|HoaiMy|NamMinh)\b/.test(v.name)) s += 2;
      if (/natural|online/i.test(v.name)) s += 2;                  // thắng điểm localService: Edge liệt kê giọng máy cũ (An) TRƯỚC NamMinh Online — hoà điểm thì giọng cũ thắng
      if (v.localService) s += 1;
      if (vl === lang.toLowerCase()) s += 1;                        // đúng vùng (zh-CN, en-US…)
      if (gender) s += (gender === 'f' ? fem && !mal : mal && !fem) ? 3 : (fem || mal) ? -3 : 0;
      if (s > bs) { bs = s; best = v; }
    }
    if (list.length) vcache[key] = best;                           // danh sách rỗng = chưa nạp xong → lần sau tìm lại
    if (pre === 'vi' && !gender) viVoice = best;
    return best;
  }
  // hạng giọng trình duyệt (cho voice.needGood): xem mô tả ở đầu tệp. basic = chỉ những loại NHẬN RA được là robot (espeak, speech-dispatcher, pico…, Microsoft SAPI đời cũ,
  // tên chỉ là tên ngôn ngữ = espeak của Chrome Linux); tên lạ còn lại là good — đánh nhầm giọng tốt thành basic (vd. Google TTS Android "vi-vn-x-gft-local") thì điện thoại mất giọng thật.
  // ^(Fred|Albert…): giọng đùa / MacinTalk / Eloquence của macOS — nghe máy móc như espeak
  var T_BASIC = /espeak|speech[-_ ]?dispatcher|\bpico|festival|mbrola|\+[A-Za-z]|^(Fred|Albert|Zarvox|Bad News|Good News|Whisper|Trinoids|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Jester|Organ|Pipe Organ|Superstar|Ralph|Kathy|Junior|Princess|Hysterical|Deranged|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i, T_GOOD = /natural|online|neural|google|premium|enhanced/i, T_LANG = /^(vietnam|english|chinese|mandarin|cantonese)/i;
  function voiceTier(v) {
    var n = String((v && typeof v === 'object' ? v.name : v) || '').trim();
    if (!n || T_BASIC.test(n)) return 'basic';
    if (T_GOOD.test(n)) return 'good';
    if (/^microsoft/i.test(n) || T_LANG.test(n)) return 'basic';      // Microsoft đời cũ (SAPI: An, David, Zira…) không có "Online"; "Vietnamese", "English (America)" = espeak của Chrome Linux
    return 'good';
  }
  if (synth) {
    findVoice();
    var onVoices = function () { vcache = {}; findVoice(); };
    if (synth.addEventListener) synth.addEventListener('voiceschanged', onVoices);
    else if ('onvoiceschanged' in synth) synth.onvoiceschanged = onVoices;
  }

  /* --------------------------------------------------------- lời thoại: say */
  var FLAP = [0.85, 0.1, 0.6, 0, 1, 0.25, 0.7, 0.05];   // miệng nhép giả (≈7 Hz) khi không có tín hiệu thật
  var VOWEL_SEMI = { a: 0, e: 2, i: 4, o: -2, u: -3, y: 3 };
  var VOWEL_MOUTH = { a: 1, o: 0.85, e: 0.7, u: 0.6, i: 0.45, y: 0.45 };
  var VOWEL_FORM = { a: 1000, e: 1700, i: 2400, o: 800, u: 700, y: 2200 };
  // dấu thanh → độ trượt cao độ [đầu, cuối] của âm tiết
  var TONE_GLIDE = { '̀': [1.04, 0.9], '́': [0.95, 1.1], '̉': [1, 0.93], '̃': [0.95, 1.08], '̣': [1, 0.88] };
  var HAS_SOUND = /[A-Za-z0-9À-ɏḀ-ỿ]/;

  function estimate(total, rate) { return Math.max(1.4, total * 0.28 / rate); }   // thời gian đọc ước tính (s)
  function words(text) { return text.split(/\s+/).filter(Boolean); }
  function hook(j, name, a, b) {
    var fn = j.hooks[name];
    if (typeof fn !== 'function') return;
    try { fn(a, b); } catch (e) { if (!j.warned) { j.warned = true; console.error('[GC.audio] hook ' + name + ' ném lỗi:', e); } }
  }
  function hookWord(j, i) { if (i !== j.wi) { j.wi = i; hook(j, 'onWord', i, j.total); } }
  function hookMouth(j, level) { hook(j, 'onMouth', level); }
  function clearTimers(j) {
    clearTimeout(j.tm); clearTimeout(j.mouthT); clearTimeout(j.safeT); clearTimeout(j.fbT); clearTimeout(j.endT); clearTimeout(j.cw); clearTimeout(j.stallT);
    clearInterval(j.iv); j.tm = j.mouthT = j.safeT = j.fbT = j.endT = j.cw = j.stallT = j.iv = null;
  }
  function cancelSynth() { if (synth) { synth.cancel(); lastCancel = now(); } }
  function finish(j) {
    if (j.done) return;
    j.done = true;
    clearTimers(j);
    if (j.u) {
      j.u.onstart = j.u.onboundary = j.u.onend = j.u.onerror = null;
      if (synth.speaking || synth.pending) cancelSynth();
    }
    if (j.src) stopClip(j);
    hookMouth(j, 0);
    hookWord(j, j.total);
    if (job === j) { job = null; duck(false); }
    j.resolve();
  }
  function hush() {
    var j = job;
    if (j) finish(j);
    else if (synth && (synth.speaking || synth.pending)) cancelSynth();
  }

  // chọn cách nói: 'tts' | 'blip' | 'silent'. allowTTS=false khi đang chuyển giữa chừng.
  function chooseEngine(allowTTS, j) {
    if (muted || mode === 'off') return 'silent';
    var blipOK = ready();
    if (mode === 'blip') return blipOK ? 'blip' : 'silent';
    if (allowTTS && synth && now() - stuckAt > STUCK_COOL) {
      var vc = findVoice(j ? j.v.lang : 'vi-VN', j ? j.v.gender : '');
      if (vc && !(j && j.v.needGood && voiceTier(vc) !== 'good')) return 'tts';   // không có giọng đúng ngôn ngữ → blip, không đọc sai tiếng · needGood mà giọng chỉ basic → blip (không để robot lẫn giọng AI)
    }
    return blipOK ? 'blip' : 'silent';
  }
  function start(j, from, allowTTS) {
    var e = chooseEngine(allowTTS, j);
    if (e === 'tts') startTTS(j);
    else if (e === 'blip') startBlip(j, from);
    else startFlap(j, from, estimate(j.total - from, j.v.rate), false);
  }

  /* nhép miệng giả theo đồng hồ: dùng khi im lặng (tắt tiếng/tắt giọng) và khi TTS không phát boundary */
  function startFlap(j, from, dur, untilEnd) {
    if (j.iv) return;
    var n = j.total - from, per = n > 0 ? dur / n : dur, tick = 0;
    j.t0 = now();
    function step() {
      if (j.done) return;
      var el = (now() - j.t0) / 1000;
      if (j.total > 0) hookWord(j, Math.min(j.total - 1, from + Math.floor(el / per)));
      hookMouth(j, FLAP[tick++ % FLAP.length]);
    }
    j.tm = setTimeout(function () { if (j.done || j.gotBoundary) return; step(); j.iv = setInterval(step, 140); }, 0);
    if (!untilEnd) j.endT = setTimeout(function () { finish(j); }, dur * 1000);
  }

  /* giọng blip kiểu Animal Crossing: mỗi từ một âm tiết ngắn, dấu câu là quãng nghỉ */
  function plan(j, from) {
    var ev = [], t = 0, r = j.v.rate, syl = 0.11 / r, gap = 0.05 / r;
    var excl = j.text.indexOf('!') >= 0;
    for (var i = from; i < j.total; i++) {
      var tok = j.words[i], last = tok.charAt(tok.length - 1);
      if (HAS_SOUND.test(tok)) {
        var nfd = tok.normalize ? tok.normalize('NFD') : tok, vowel = '', mark = '', letters = 0;
        for (var c = 0; c < nfd.length; c++) {
          var ch = nfd.charAt(c), lc = ch.toLowerCase();
          if (TONE_GLIDE[ch]) mark = ch;
          else if (HAS_SOUND.test(ch)) { letters++; if (!vowel && VOWEL_SEMI[lc] != null) vowel = lc; }
        }
        var count = letters >= 8 ? 2 : 1, gl = TONE_GLIDE[mark] || [1, 1];
        for (var s = 0; s < count; s++) {
          var rise = last === '?' && s === count - 1 ? 1.22 : 1;
          ev.push({
            t: t, word: s === 0 ? i : -1, mouth: clamp((VOWEL_MOUTH[vowel] || 0.5) + rnd(-0.1, 0.1), 0.25, 1),
            hz: j.v.blip * hz(1, VOWEL_SEMI[vowel] || 0) * (excl ? 1.08 : 1) * rnd(0.96, 1.04), g0: gl[0], g1: gl[1] * rise,
            dur: syl * (mark === '̣' ? 0.8 : 1), form: VOWEL_FORM[vowel] || 1200, amp: (excl ? 1.2 : 1) * (last === '!' ? 1.1 : 1)
          });
          ev.push({ t: t + syl, word: -1, mouth: 0 });
          t += syl + gap;
        }
      } else ev.push({ t: t, word: i, mouth: -1 });
      if (last === ',' || last === ';' || last === ':') t += 0.18 / r;
      else if (last === '.' || last === '!' || last === '?' || last === '…') t += 0.35 / r;
    }
    ev.push({ t: t, end: true });
    return ev;
  }
  function playBlip(e) {
    if (muted || !ready()) return;
    var t = ctx.currentTime + 0.002, f = mkFx(voiceBus, e.dur + 0.05, false);
    var o = ctx.createOscillator(), fm = ctx.createBiquadFilter(), g = ctx.createGain();
    if (voiceWave) o.setPeriodicWave(voiceWave); else o.type = 'triangle';
    o.frequency.setValueAtTime(e.hz * e.g0, t);
    o.frequency.exponentialRampToValueAtTime(e.hz * e.g1, t + e.dur);
    fm.type = 'peaking'; fm.frequency.value = e.form; fm.Q.value = 1.5; fm.gain.value = 9;   // formant gần đúng theo nguyên âm
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2 * e.amp, t + 0.012);
    g.gain.setValueAtTime(0.2 * e.amp, t + e.dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur);
    o.connect(fm); fm.connect(g); g.connect(f.bus);
    f.nodes.push(fm, g);
    go(f, o, t, t + e.dur + 0.03);
  }
  function startBlip(j, from) {
    j.ev = plan(j, from); j.k = 0; j.t0 = now();
    j.tm = setTimeout(function () { pump(j); }, 0);
  }
  function pump(j) {
    if (j.done) return;
    var el = now() - j.t0, ev = j.ev;
    while (j.k < ev.length && ev[j.k].t * 1000 <= el + 3) {
      var e = ev[j.k++];
      if (e.end) { finish(j); return; }
      if (e.word >= 0) hookWord(j, e.word);
      if (e.mouth >= 0) hookMouth(j, e.mouth);
      if (e.hz) playBlip(e);
      if (j.done) return;
    }
    j.tm = setTimeout(function () { pump(j); }, Math.max(0, ev[j.k].t * 1000 - el));
  }

  // câu đưa cho giọng trình duyệt: "…" và "—" / "–" hay bị đọc vấp (đọc tên ký hiệu) hoặc không nghỉ → đổi thành dấu phẩy (đầu chữ / cuối câu / trước dấu câu thì bỏ).
  // starts[i] = vị trí chữ thứ i CỦA CÂU GỐC trong chuỗi mới — onboundary.charIndex tính trên chuỗi mới nên chỉ số từ vẫn đúng; chữ hiện trên màn hình giữ nguyên.
  function ttsPrep(src) {
    var re = /\S+/g, m, toks = [], starts = [], out = '', i;
    while ((m = re.exec(src))) toks.push(m);
    if (!/[…—–]/.test(src)) return { text: src, starts: toks.map(function (t) { return t.index; }) };
    for (i = 0; i < toks.length; i++) {
      var t = toks[i][0], alone = /^[…—–]+$/.test(t), last = i === toks.length - 1, gap = out && !alone ? ' ' : '', w;
      if (alone) w = last || !out || /[,;:.!?]$/.test(out) ? '' : ',';        // " — " đứng riêng: dính vào chữ trước làm dấu phẩy
      else w = t.replace(/[…—–]+/g, function (x, at) {
        var nx = t.charAt(at + x.length);
        if (!at) return '';
        if (!nx) return last ? '' : ',';
        return /[,;:.!?]/.test(nx) ? '' : ', ';
      });
      starts.push(out.length + gap.length); out += gap + w;
    }
    return { text: out, starts: starts };
  }

  /* TTS: onboundary nhép miệng + chạy chữ; không có boundary trong 400 ms thì nhép theo đồng hồ.
   * Synth "kẹt" (Chrome hay nuốt speak() sau cancel(): không onstart, speaking=false): sau 1,5 s cancel + nói lại 1 lần; vẫn kẹt → cả câu bằng blip.
   * Giọng mạng đang nạp (speaking=true, Edge Online / Google trễ 0,3–2 s) thì chờ, tới 4 s mà vẫn chưa bắt đầu mới bỏ. Miệng chỉ nhép khi đã có dấu hiệu đang nói. */
  var STALL = 1500, STALL_HARD = 4000, RETRY_GAP = 200, STUCK_COOL = 30000;   // kiểm sau (ms) · hạn cứng khi synth báo bận · nghỉ trước khi nói lại · sau khi bỏ cuộc: chừng này ms đừng thử lại giọng máy
  function startTTS(j) {
    var vc = findVoice(j.v.lang, j.v.gender), prep = ttsPrep(j.text), starts = prep.starts, est = estimate(j.total, j.v.rate), tries = 0, started = false, spokeAt = 0, u;
    if (!prep.text) { start(j, 0, false); return; }             // câu chỉ toàn "…" / "—": không có gì để đọc
    j.gotBoundary = false; j.armed = false;
    function arm() {                     // 400 ms sau khi bắt đầu mà chưa có boundary → nhép giả
      if (j.armed || j.done) return;
      j.armed = true;
      j.fbT = setTimeout(function () { if (!j.done && !j.gotBoundary) startFlap(j, 0, est, true); }, 400);
    }
    // Chrome đôi khi không bao giờ bắn onend → tự giải phóng. Hạn tính từ lúc BẮT ĐẦU NÓI (giọng mạng Edge Online / Google trễ 0,3–2 s
    // trước onstart — tính từ speak() thì câu ngắn nhiều dấu câu bị cắt đuôi) + quãng nghỉ dấu câu mà estimate() không đếm
    var safe = (Math.max(est * 1.8, 2.5) + (j.text.match(/[.!?…]+/g) || []).length * 0.35 + (j.text.match(/[,;:—–]/g) || []).length * 0.2) * 1000;
    function guard() { clearTimeout(j.safeT); j.safeT = setTimeout(function () { if (!j.done) { cancelSynth(); finish(j); } }, safe); }
    function begin() { if (started || j.done) return; started = true; clearTimeout(j.stallT); guard(); hookWord(j, 0); arm(); }   // onstart hoặc boundary đầu tiên = chắc chắn đang nói
    function build() {                   // mỗi lần nói một utterance mới (utterance đã bị cancel không nói lại được); sự kiện của utterance cũ bị bỏ qua (j.u !== x)
      var x = new W.SpeechSynthesisUtterance(prep.text);
      x.voice = vc; x.lang = j.v.lang;
      x.pitch = clamp(j.v.pitch, 0, 2, 1); x.rate = clamp(j.v.rate, 0.5, 1.8, 1); x.volume = volume;
      x.onstart = function () { if (!j.done && j.u === x) begin(); };
      x.onboundary = function (e) {
        if (j.done || j.u !== x || (e.name && e.name !== 'word')) return;
        begin();
        j.gotBoundary = true;
        clearInterval(j.iv); j.iv = null;
        var wi = 0;
        for (var i = 0; i < starts.length && starts[i] <= e.charIndex; i++) wi = i;
        hookWord(j, wi);
        hookMouth(j, 0.55 + Math.random() * 0.45);
        clearTimeout(j.mouthT);
        j.mouthT = setTimeout(function () { if (!j.done) hookMouth(j, 0); }, 120);
      };
      x.onend = function () { if (j.u === x) finish(j); };
      x.onerror = function (e) {
        if (j.done || j.u !== x || e.error === 'canceled' || e.error === 'interrupted') return;
        // TTS hỏng (not-allowed, synthesis-failed…): nói lại cả câu bằng blip/im lặng để phim không mất nhịp
        console.warn('[GC.audio] speechSynthesis lỗi (' + e.error + ') — chuyển sang blip');
        clearTimers(j); j.u = null; j.wi = -1; j.gotBoundary = false;
        start(j, 0, false);
      };
      return x;
    }
    function stalled() {                 // quá hạn mà chưa có onstart / boundary nào
      if (j.done || started || j.u !== u) return;   // onerror đã chuyển câu sang blip (có thể bắn ngay trong speak()) → không nói lại
      var el = now() - spokeAt, busy = !!(synth.speaking || synth.pending);
      if (busy && el < STALL_HARD) { j.stallT = setTimeout(stalled, STALL_HARD - el + 5); return; }
      u.onstart = u.onboundary = u.onend = u.onerror = null; cancelSynth();
      if (!busy && tries < 2) { j.stallT = setTimeout(speak, RETRY_GAP); return; }   // kẹt lần đầu: dọn rồi nói lại đúng 1 lần
      stuckAt = now();                   // đã bỏ cuộc: các câu sau đi thẳng blip một lúc (STUCK_COOL), khỏi chờ lại từng câu
      console.warn('[GC.audio] speechSynthesis không bắt đầu nói' + (busy ? ' (quá ' + STALL_HARD / 1000 + ' s)' : ' (đã thử lại)') + ' — đọc bằng blip');
      clearTimers(j); j.wi = -1; j.gotBoundary = false;
      start(j, 0, false);
    }
    function speak() {
      if (j.done) return;
      if (tries++) u = j.u = build();
      if (synth.paused) synth.resume();
      spokeAt = now();
      synth.speak(u);
      if (j.u === u && !j.done) j.stallT = setTimeout(stalled, STALL);
    }
    u = j.u = build();
    var wait = Math.max(0, 70 - (now() - lastCancel));   // speak() ngay sau cancel() hay bị Chrome nuốt
    if (wait > 0) j.tm = setTimeout(speak, wait); else speak();
  }

  /* ---------------------------------------------------- clip giọng thu sẵn (v0.17) */
  // Giọng thật (vd. Gemini TTS) đưa vào say(…, { clip }). Giải mã một lần (LRU), tính đường bao biên độ + đoạn có tiếng một lần
  // (không AnalyserNode, không việc mỗi khung hình), phát 1 BufferSource qua voiceBus, một setInterval 30 ms chạy miệng + chữ.
  var CLIP_MAX = 16, CLIP_MAX_SEC = 300, CLIP_WAIT = 8000;       // số clip · tổng giây giữ · chờ giải mã tối đa (ms) trước khi rơi về TTS/blip
  var clipCache = new Map();                                    // khoá → { p: Promise<AudioBuffer>, sec }; Map giữ thứ tự chèn → LRU: chạm = xoá rồi đặt lại
  var planOf = typeof WeakMap === 'function' ? new WeakMap() : null;
  var RAW_RATE = 24000;                                         // PCM thô không header: s16le mono (Gemini TTS)
  function hash2(len, at) {                                     // hai băm 32-bit độc lập (djb2 + FNV-1a) → trùng khoá rất khó
    var a = 5381, b = 2166136261 >>> 0, c, i;
    for (i = 0; i < len; i++) { c = at(i); a = ((a << 5) + a + c) | 0; b = Math.imul(b ^ c, 16777619) >>> 0; }
    return (a >>> 0).toString(36) + '.' + b.toString(36);
  }
  function isBuf(x) { return Object.prototype.toString.call(x) === '[object ArrayBuffer]'; }
  function clipKey(src, rate) {                                 // đồng bộ cho chuỗi / nhị phân; Blob: null (tính sau khi đọc)
    if (typeof src === 'string') return 's' + src.length + ':' + hash2(src.length, function (i) { return src.charCodeAt(i); }) + '@' + rate;
    var u = isBuf(src) ? new Uint8Array(src) : ArrayBuffer.isView(src) ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength) : null;
    return u ? 'b' + u.length + ':' + hash2(u.length, function (i) { return u[i]; }) + '@' + rate : null;
  }
  function clipGet(key) {
    var e = clipCache.get(key);
    if (!e) return null;
    clipCache.delete(key); clipCache.set(key, e);
    return e.p;
  }
  function clipPut(key, p) {
    var e = { p: p, sec: 0 };
    clipCache.set(key, e);
    p.then(function (b) { e.sec = b.duration; clipTrim(); }, function () { if (clipCache.get(key) === e) clipCache.delete(key); });
  }
  function clipTrim() {
    var sec = 0, k;
    clipCache.forEach(function (e) { sec += e.sec; });
    while (clipCache.size > 1 && (clipCache.size > CLIP_MAX || sec > CLIP_MAX_SEC)) {
      k = clipCache.keys().next().value; sec -= clipCache.get(k).sec; clipCache.delete(k);
    }
  }
  function dataUri(s) {
    var i = s.indexOf(','), meta, body, b, k, n = 0, c;
    if (i < 0) throw new Error('data URI hỏng');
    meta = s.slice(5, i); body = s.slice(i + 1);
    if (/;base64/i.test(meta)) {
      var bin = atob(body.replace(/\s+/g, ''));
      b = new Uint8Array(bin.length);
      for (k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k);
      return b;
    }
    b = new Uint8Array(body.length);                            // percent-encoded: %XX = một byte
    for (k = 0; k < body.length; k++) {
      c = body.charCodeAt(k);
      if (c === 37 && k + 2 < body.length) { b[n++] = parseInt(body.substr(k + 1, 2), 16); k += 2; } else b[n++] = c & 255;
    }
    return b.subarray(0, n);
  }
  function clipBytes(src) {
    try {
      if (typeof src === 'string') {
        if (/^data:/i.test(src)) return Promise.resolve(dataUri(src));
        if (typeof fetch !== 'function') return Promise.reject(new Error('không có fetch'));
        return fetch(src).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        }).then(function (ab) { return new Uint8Array(ab); });
      }
      if (isBuf(src)) return Promise.resolve(new Uint8Array(src));
      if (ArrayBuffer.isView(src)) return Promise.resolve(new Uint8Array(src.buffer, src.byteOffset, src.byteLength));
      if (typeof Blob !== 'undefined' && src instanceof Blob) return src.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('clip phải là ArrayBuffer / TypedArray / Blob / URL / data URI'));
  }
  function tag4(u, o) { return String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]); }
  // WAV PCM 8/16/24/32-bit hoặc float 32/64 → { rate, ch: [Float32Array…] }; định dạng khác (ADPCM, µ-law…) → null (nhờ decodeAudioData)
  function parseWav(u) {
    if (u.length < 12 || tag4(u, 0) !== 'RIFF' || tag4(u, 8) !== 'WAVE') return null;
    var dv = new DataView(u.buffer, u.byteOffset, u.byteLength), p = 12, fmt = null, off = -1, len = 0, id, size, body;
    while (p + 8 <= u.length) {
      id = tag4(u, p); size = dv.getUint32(p + 4, true); body = p + 8;
      if (id === 'fmt ' && body + 16 <= u.length) {
        fmt = { tag: dv.getUint16(body, true), ch: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
        if (fmt.tag === 0xFFFE && size >= 26 && body + 26 <= u.length) fmt.tag = dv.getUint16(body + 24, true);
      } else if (id === 'data') {
        off = body; len = (size === 0 || size === 0xFFFFFFFF || body + size > u.length) ? u.length - body : size;   // header "đang phát luồng": lấy hết phần còn lại
        break;
      }
      p = body + size + (size & 1);
    }
    if (!fmt || off < 0 || (fmt.tag !== 1 && fmt.tag !== 3) || fmt.ch < 1 || fmt.ch > 8) return null;
    var bps = fmt.bits >> 3, frames = Math.floor(len / (bps * fmt.ch)), ch = [], c, i, o, v;
    if (!bps || bps > 8 || (fmt.tag === 3 && bps !== 4 && bps !== 8) || (fmt.tag === 1 && bps > 4)) return null;
    for (c = 0; c < fmt.ch; c++) {
      var a = new Float32Array(frames);
      for (i = 0; i < frames; i++) {
        o = off + (i * fmt.ch + c) * bps;
        if (fmt.tag === 3) v = bps === 4 ? dv.getFloat32(o, true) : dv.getFloat64(o, true);
        else if (bps === 1) v = (u[o] - 128) / 128;
        else if (bps === 2) v = dv.getInt16(o, true) / 32768;
        else if (bps === 3) v = (((u[o + 2] << 24) | (u[o + 1] << 16) | (u[o] << 8)) >> 8) / 8388608;
        else v = dv.getInt32(o, true) / 2147483648;
        a[i] = v;
      }
      ch.push(a);
    }
    return { rate: fmt.rate, ch: ch };
  }
  function toBuffer(w) {
    if (!w.ch.length || !w.ch[0].length) throw new Error('clip rỗng');
    var b = ctx.createBuffer(w.ch.length, w.ch[0].length, w.rate), c;
    for (c = 0; c < w.ch.length; c++) b.getChannelData(c).set(w.ch[c]);
    return b;
  }
  function compressed(u) {              // mp3 / ogg / flac / mp4 / webm / wav không-PCM: để decodeAudioData lo
    if (u.length < 12) return false;
    var t = tag4(u, 0);
    return t.slice(0, 3) === 'ID3' || t === 'OggS' || t === 'fLaC' || tag4(u, 4) === 'ftyp' || (u[0] === 0xFF && (u[1] & 0xE0) === 0xE0) || (u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3) || t === 'RIFF';
  }
  function clipBuffer(u, rate) {
    return new Promise(function (resolve, reject) {
      var w = parseWav(u), k, ab, r;
      if (w) { resolve(toBuffer(w)); return; }
      if (compressed(u)) {
        ab = u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);   // decodeAudioData "lấy mất" ArrayBuffer → đưa bản sao
        r = ctx.decodeAudioData(ab, resolve, reject);
        if (r && r.then) r.then(resolve, reject);
        return;
      }
      if (u.length < 2) throw new Error('clip quá ngắn');
      var n = u.length >> 1, a = new Float32Array(n), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);   // PCM thô s16le mono
      for (k = 0; k < n; k++) a[k] = dv.getInt16(k * 2, true) / 32768;
      resolve(toBuffer({ rate: rate, ch: [a] }));
    });
  }
  // GC.audio.decodeClip(src, {rate}) → Promise<AudioBuffer> (rate: chỉ cho PCM thô không header, mặc định 24000)
  function decodeClip(src, opts) {
    var rate = clamp(opts && opts.rate, 3000, 96000, RAW_RATE), key = src == null || src === '' ? null : clipKey(src, rate), hit = key && clipGet(key), p;
    if (hit) return hit;
    p = new Promise(function (resolve, reject) {
      if (src == null || src === '') { reject(new Error('clip trống')); return; }
      if (!ensureCtx()) { reject(new Error('không có AudioContext')); return; }
      clipBytes(src).then(function (u) { return clipBuffer(u, rate); }).then(resolve, reject);
    });
    if (key) clipPut(key, p);
    return p;
  }
  // kế hoạch phát của một clip (tính một lần, nhớ theo AudioBuffer): đoạn có tiếng, độ to chuẩn hoá, đường bao miệng mỗi 30 ms
  function clipPlan(buf) {
    var pl = planOf && planOf.get(buf);
    if (pl !== undefined && pl !== null) return pl;
    var sr = buf.sampleRate, n = buf.length, nc = buf.numberOfChannels, blk = Math.max(1, Math.round(sr * 0.03)), nb = Math.max(1, Math.ceil(n / blk));
    var chs = [], rms = new Float32Array(nb), peak = 0, mx = 0, c, k, i, x, a, acc, s0, s1;
    for (c = 0; c < nc; c++) chs.push(buf.getChannelData(c));
    for (k = 0; k < nb; k++) {
      s0 = k * blk; s1 = Math.min(n, s0 + blk); acc = 0;
      for (i = s0; i < s1; i++) {
        x = 0;
        for (c = 0; c < nc; c++) { a = chs[c][i]; x += a; if (a > peak) peak = a; else if (-a > peak) peak = -a; }
        x /= nc; acc += x * x;
      }
      rms[k] = Math.sqrt(acc / Math.max(1, s1 - s0));
      if (rms[k] > mx) mx = rms[k];
    }
    if (!(mx > 0.0008) || !(peak > 0)) { if (planOf) planOf.set(buf, null); return null; }   // clip im lặng / hỏng
    var thr = Math.max(0.0015, mx * 0.04), first = -1, last = -1, act = [];
    for (k = 0; k < nb; k++) if (rms[k] >= thr) { if (first < 0) first = k; last = k; }
    for (k = first; k <= last; k++) act.push(rms[k]);
    act.sort(function (p, q) { return p - q; });
    var ref = Math.max(act[Math.floor((act.length - 1) * 0.9)], thr * 2), mouth = new Float32Array(nb), m = 0;
    for (k = 0; k < nb; k++) {          // mượt: mở nhanh (0.75), khép chậm hơn (0.4) — miệng không giật ở 33 Hz
      x = Math.min(1, Math.pow(rms[k] / ref, 0.75));
      m += (x - m) * (x > m ? 0.75 : 0.4);
      mouth[k] = k < first || k > last || m < 0.04 ? 0 : m;
    }
    var start0 = Math.max(0, first * blk / sr - 0.04), end0 = Math.min(buf.duration, (last + 1) * blk / sr + 0.08);
    pl = { start: start0, end: end0, dur: end0 - start0, blk: blk / sr, mouth: mouth, gain: clamp(0.8 / peak, 0.5, 3) };
    if (planOf) planOf.set(buf, pl);
    return pl;
  }
  // thời điểm bắt đầu của từng chữ trên đoạn có tiếng: tỉ lệ theo số chữ cái (+ quãng nghỉ sau dấu phẩy / chấm; nghỉ ở chữ cuối bỏ đi)
  function wordStarts(ws, dur) {
    var wt = [], tot = 0, i, t, last, n, acc = 0, out = [];
    for (i = 0; i < ws.length; i++) {
      t = ws[i]; last = t.charAt(t.length - 1);
      n = (t.match(/[A-Za-z0-9À-ɏḀ-ỿ]/g) || []).length;
      wt.push(Math.max(1.5, n) + (i === ws.length - 1 ? 0 : last === ',' || last === ';' || last === ':' ? 1.5 : last === '.' || last === '!' || last === '?' || last === '…' ? 3 : 0));
      tot += wt[i];
    }
    for (i = 0; i < ws.length; i++) { out.push(acc / tot * dur); acc += wt[i]; }
    return out;
  }
  function stopClip(j) {
    var s = j.src, g = j.sg, t;
    j.src = j.sg = null;
    if (!s) return;
    s.onended = null;
    try {
      t = ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.01);
      s.stop(t + 0.015);
    } catch (e) { /* nguồn đã hết (stop() ném InvalidStateError) — bình thường */ }
    setTimeout(function () { s.disconnect(); g.disconnect(); }, 80);
  }
  function clipFail(j, why) {
    clipError = String(why && why.message ? why.message : why).slice(0, 160);
    if (j.done) return;
    clearTimeout(j.cw); j.cw = null;
    if (typeof console !== 'undefined' && console.debug) console.debug('[GC.audio] clip lỗi → rơi về TTS/blip: ' + clipError);
    duck(true);
    start(j, 0, true);
  }
  function runClip(j, buf, silent) {
    var pl = clipPlan(buf), starts, nw = 0, dur, src, g, at, fo;
    if (!pl) { clipFail(j, 'clip im lặng'); return; }
    clipError = null;
    dur = pl.dur; starts = wordStarts(j.words, dur);
    duck(true);
    if (silent) j.t0 = now();
    else {
      src = ctx.createBufferSource(); g = ctx.createGain();
      at = ctx.currentTime + 0.04; fo = at + Math.max(dur * 0.5, dur - 0.06);
      src.buffer = buf;
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(pl.gain, at + 0.012);
      g.gain.setValueAtTime(pl.gain, fo); g.gain.linearRampToValueAtTime(0, at + dur);   // fade-out 60 ms: không "tách" ở cuối
      src.connect(g); g.connect(voiceBus);
      src.onended = function () { finish(j); };
      try { src.start(at, pl.start, dur + 0.02); } catch (e) { src.disconnect(); g.disconnect(); clipFail(j, e); return; }
      j.src = src; j.sg = g; j.cT0 = at;
    }
    j.iv = setInterval(function () {
      if (j.done) return;
      var el = silent ? (now() - j.t0) / 1000 : ctx.currentTime - j.cT0, k;
      if (el < 0) return;                                              // chưa tới giờ phát (đệm 40 ms)
      while (nw < starts.length && el >= starts[nw]) hookWord(j, nw++);
      k = Math.min(pl.mouth.length - 1, Math.floor((el + pl.start) / pl.blk));
      hookMouth(j, pl.mouth[k]);
      if (silent && el >= dur) finish(j);
    }, 30);
    j.safeT = setTimeout(function () { finish(j); }, (dur + 1.2) * 1000);   // ctx treo / onended không tới → vẫn xong
  }
  function startClip(j) {
    j.cw = setTimeout(function () { j.cw = null; clipFail(j, 'giải mã clip quá ' + CLIP_WAIT / 1000 + ' s'); }, CLIP_WAIT);
    decodeClip(j.hooks.clip, { rate: j.hooks.clipRate }).then(function (buf) {
      if (j.done || !j.cw) return;                                     // đã hush, hoặc hết giờ chờ và đã rơi về
      clearTimeout(j.cw); j.cw = null;
      runClip(j, buf, muted || mode === 'off' || !ready());
    }, function (e) {
      if (j.done || !j.cw) return;
      clearTimeout(j.cw); j.cw = null;
      clipFail(j, e);
    });
  }

  function say(text, voice, hooks) {
    hush();
    return new Promise(function (resolve) {
      text = String(text == null ? '' : text);
      var w = words(text);
      var j = { text: text, words: w, total: w.length, v: normVoice(voice), hooks: hooks || {}, resolve: resolve, done: false, wi: -1,
        t0: 0, tm: null, iv: null, mouthT: null, safeT: null, fbT: null, endT: null, cw: null, stallT: null, src: null, sg: null, cT0: 0, ev: null, k: 0, u: null, warned: false };
      job = j;
      if (ctx && ctx.state !== 'running') unlock();          // thử đánh thức lại nếu bị treo
      // có clip thu sẵn (và người dùng không ép giọng blip) → phát clip; hỏng thì rơi về đường cũ. Hạ nền khi clip bắt đầu (runClip) / khi rơi về.
      if (j.hooks.clip != null && j.hooks.clip !== '' && mode !== 'blip') startClip(j);
      else { duck(true); start(j, 0, true); }
    });
  }

  /* ------------------------------------------------------------------ API */
  var API = {
    unlock: unlock,
    get muted() { return muted; },
    setMuted: function (b) {
      muted = !!b; applyMaster();
      // TTS không đi qua master gain → tắt tiếng giữa chừng thì chuyển phần còn lại sang nhép im lặng
      var j = job;
      if (muted && j && j.u) { var from = Math.max(0, j.wi); clearTimers(j); j.u.onstart = j.u.onboundary = j.u.onend = j.u.onerror = null; j.u = null; cancelSynth(); start(j, from, false); }
    },
    setVolume: function (v) { volume = clamp(v, 0, 1, volume); applyMaster(); },
    sfx: sfx,
    get sfxNames() { return Object.keys(SFX); },
    sfxInfo: sfxInfo,
    ambient: ambient,
    music: music,
    voiceOf: voiceOf,
    voiceTier: voiceTier,
    say: say,
    decodeClip: decodeClip,
    get voiceMode() { return mode; },
    setVoiceMode: function (m) { if (MODES.indexOf(m) >= 0) mode = m; },
    hush: hush,
    stopAll: function () { hush(); ambient(null); music(null); },
    info: function () { findVoice(); return { ctx: !!ctx, tts: !!synth, viVoice: viVoice ? viVoice.name : null, viTier: viVoice ? voiceTier(viVoice) : null, mode: mode, clipError: clipError }; }
  };
  GC.audio = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window.GenChibi : {});
