/* gen-chibi engine — audio 0.1: tầng tiếng động + giọng nói cho phim
 * © 2026 Gen Labs — All rights reserved.
 *
 * Không tệp âm thanh, không tài nguyên bên thứ ba, không mạng: MỌI thứ tổng hợp bằng Web Audio API
 * (hiệu ứng, tiếng nền, nhạc nền, giọng "blip") và speechSynthesis của trình duyệt (giọng đọc tiếng Việt).
 * Chạy trong Studio lẫn tệp phim HTML độc lập mở bằng file://. Thiếu AudioContext / speechSynthesis
 * thì mọi hàm thành no-op im lặng (say() vẫn trả Promise đúng nhịp phim). Cần engine/core.js nạp trước.
 *
 * Ngân sách (L-42): không có vòng lặp mỗi khung hình. Hiệu ứng một-lần ≤ 12 cái sống cùng lúc (dư thì bỏ);
 * node nào xong là ngắt (onended → disconnect); một bộ đệm nhiễu 2 s dùng chung; nhạc nền lập lịch
 * bằng setTimeout 100 ms + ctx.currentTime (lookahead 0.35 s); tiếng nền ≤ 8 nguồn thường trực;
 * giọng blip = 1 oscillator (PeriodicWave tam giác+vuông) mỗi âm tiết, phát đúng lúc qua một chuỗi setTimeout.
 *
 *   GC.audio.unlock()                  gọi TRONG thao tác của người dùng (click); tạo/đánh thức AudioContext; gọi lại không sao
 *   GC.audio.muted / setMuted(b) / setVolume(0..1)      âm lượng tổng (mặc định 0.8); tắt tiếng thì lời thoại vẫn đúng nhịp
 *   GC.audio.sfx(name, {gain, pan})    pop whoosh step sting hit boing sparkle rumble drip sad snore party hmm gong chime swish tick
 *   GC.audio.ambient({time, weather, indoor} | null)    tiếng nền cảnh, chéo mờ 0.8 s; cùng spec thì không làm lại
 *   GC.audio.music('calm'|'tense'|'epic'|'comic'|'sad' | null)   nhạc nền rất nhỏ; null tắt dần 1 s; tên lạ → bỏ qua
 *   GC.audio.voiceOf(asset)            → { pitch, rate, blip }  asset.voice nếu có, không thì suy ra ổn định từ id + role/persona
 *   GC.audio.say(text, voice, {onMouth(level), onWord(i, total)})  → Promise (xong khi nói xong, hoặc hết thời gian đọc ước tính)
 *   GC.audio.setVoiceMode('auto'|'tts'|'blip'|'off') / voiceMode   auto = TTS nếu có giọng Việt, không thì blip
 *   GC.audio.hush() / stopAll() / info() → { ctx, tts, viVoice, mode }   ctx: đã có AudioContext · tts: có speechSynthesis
 */
(function (GC) {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;

  var MAX_FX = 12;                       // hiệu ứng một-lần sống cùng lúc tối đa
  var AHEAD = 0.35;                      // nhạc: lập lịch trước (giây)
  var TIMES = ['day', 'dawn', 'dusk', 'night'];
  var WEATHERS = ['clear', 'rain', 'snow', 'petals', 'leaves', 'mist', 'fireflies'];
  var MODES = ['auto', 'tts', 'blip', 'off'];

  var ctx = null, master = null, sfxBus = null, voiceBus = null, ambBus = null, musBus = null, duckBus = null;
  var noiseBuf = null, voiceWave = null;
  var volume = 0.8, muted = false, mode = 'auto', duckOn = false;
  var wantAmb = null, wantMus = null;    // yêu cầu đến trước unlock() → làm khi có ctx
  var bed = null, mus = null, job = null;
  var fxLive = [];
  var synth = W && W.speechSynthesis && typeof W.SpeechSynthesisUtterance === 'function' ? W.speechSynthesis : null;
  var viVoice = null, lastCancel = 0;

  /* ------------------------------------------------------------ tiện ích */
  function clamp(v, lo, hi, dflt) { v = +v; if (v !== v) return dflt != null ? dflt : lo; return v < lo ? lo : v > hi ? hi : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hz(root, semi) { return root * Math.pow(2, semi / 12); }
  function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; }
  function ready() { return !!ctx && ctx.state === 'running'; }

  /* -------------------------------------------------- AudioContext + bus */
  function mkGain(v, dest) { var g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function build() {
    master = mkGain(muted ? 0 : volume);
    // bộ nén chặn vỡ tiếng khi nhiều âm chồng nhau
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    duckBus = mkGain(duckOn ? 0.5 : 1, master);  // hạ nền + nhạc khi có người nói
    ambBus = mkGain(0.55, duckBus);
    musBus = mkGain(0.12, duckBus);              // nhạc ≈ 0.12 tổng để lời thoại luôn rõ
    sfxBus = mkGain(1, master);
    voiceBus = mkGain(1, master);
    // một bộ đệm nhiễu trắng 2 s dùng chung cho mọi tiếng gió/mưa/va chạm
    var n = Math.floor(ctx.sampleRate * 2), d;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
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
  function unlock() {
    if (!ctx) {
      var C = W && (W.AudioContext || W.webkitAudioContext);
      if (!C) return;
      try { ctx = new C(); } catch (e) { console.warn('[GC.audio] không tạo được AudioContext:', e); ctx = null; return; }
      build();
      if (wantAmb) startBed(wantAmb);
      if (wantMus) startMus(wantMus);
    }
    if (ctx.state !== 'running' && ctx.resume) {
      var p = ctx.resume();
      // resume() bị từ chối khi chưa có thao tác người dùng — đó là tình huống bình thường, trạng thái đọc lại qua ctx.state/info()
      if (p && p.catch) p.catch(function () {});
    }
  }
  function applyMaster() { if (ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02); }
  function duck(on) {
    duckOn = on;
    if (ctx) duckBus.gain.setTargetAtTime(on ? 0.5 : 1, ctx.currentTime, on ? 0.06 : 0.25);
  }

  /* ----------------------------- một "hiệu ứng": nhóm node chung vòng đời */
  // dest: nơi nối vào · dur: thời lượng dự kiến (s) · capped: tính vào hạn mức MAX_FX · level/pan: tạo gain + panner riêng
  function mkFx(dest, dur, capped, level, pan) {
    var t = ctx.currentTime, i, k = 0;
    if (capped) {
      for (i = 0; i < fxLive.length; i++) if (fxLive[i].end + 1 > t) fxLive[k++] = fxLive[i];
      fxLive.length = k;                 // dọn cái quá hạn (ctx bị treo thì onended không bao giờ tới)
      if (k >= MAX_FX) return null;
    }
    var f = { n: 0, nodes: [], bus: dest, end: t + dur, capped: capped };
    if (level != null || pan != null) {
      var g = mkGain(level == null ? 1 : level);
      f.nodes.push(g);
      if (pan != null && ctx.createStereoPanner) {
        var p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1, 0);
        g.connect(p); p.connect(dest); f.nodes.push(p);
      } else g.connect(dest);
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
    f.nodes.push(b); return b;
  }
  function env(f, t, a, peak, end) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    f.nodes.push(g); return g;
  }
  // o: to (tần số cuối) · glide (tỉ lệ thời lượng trượt) · path [[dt, hz]…] · a (attack) · lp (lowpass) · q · am (Hz, AM 100%)
  function tone(f, type, h0, t, dur, peak, o) {
    o = o || {};
    var s = ctx.createOscillator(), head;
    s.type = type;
    s.frequency.setValueAtTime(h0, t);
    if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + dur * (o.glide || 1));
    if (o.path) for (var i = 0; i < o.path.length; i++) s.frequency.exponentialRampToValueAtTime(o.path[i][1], t + o.path[i][0]);
    var g = env(f, t, Math.min(o.a || 0.006, dur * 0.5), peak, t + dur);
    head = s;
    if (o.lp) { var lp = filt(f, 'lowpass', o.lp, o.q); head.connect(lp); head = lp; }
    if (o.am) {
      var am = mkGain(0.5); f.nodes.push(am);
      head.connect(am); head = am;
      lfo(f, o.am, 0.5, am.gain, t, dur);
    }
    head.connect(g); g.connect(f.bus);
    go(f, s, t, t + dur + 0.03);
    return s;
  }
  function lfo(f, rate, depth, param, t, dur) {
    var l = ctx.createOscillator(), g = mkGain(depth);
    l.frequency.value = rate; l.connect(g); g.connect(param);
    f.nodes.push(g); go(f, l, t, t + dur + 0.03);
  }
  // o: type (bandpass) · f0 · f1 (đích sau "mid" giây) · f2 (đích cuối) · q · a
  function noise(f, t, dur, peak, o) {
    o = o || {};
    var s = ctx.createBufferSource(), fl = filt(f, o.type || 'bandpass', o.f0 || 1000, o.q);
    s.buffer = noiseBuf; s.loop = true;
    if (o.f1) {
      fl.frequency.setValueAtTime(o.f0, t);
      fl.frequency.exponentialRampToValueAtTime(o.f1, t + (o.mid || dur));
      if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    }
    var g = env(f, t, Math.min(o.a || 0.005, dur * 0.5), peak, t + dur);
    s.connect(fl); fl.connect(g); g.connect(f.bus);
    go(f, s, t, t + dur + 0.03, Math.random() * 1.5);
    return s;
  }

  /* ------------------------------------------------------------ hiệu ứng */
  // level: chuẩn hoá độ to (đo bằng RMS thật, xem tools kiểm thử) · dur: thời lượng dự kiến
  var SFX = {
    pop: { dur: 0.16, level: 0.6, play: function (f, t) {
      tone(f, 'sine', 400, t, 0.12, 0.55, { to: 840, glide: 0.45, a: 0.004 });
    } },
    whoosh: { dur: 0.55, level: 0.9, play: function (f, t) {
      noise(f, t, 0.5, 0.55, { type: 'bandpass', f0: 350, f1: 2400, mid: 0.2, f2: 600, q: 1.1, a: 0.2 });
    } },
    step: { dur: 0.12, level: 0.6, play: function (f, t) {
      var r = Math.random();
      noise(f, t, 0.07, 0.5, { type: 'lowpass', f0: 500 + r * 500, a: 0.003 });
      tone(f, 'sine', 95 + r * 30, t, 0.07, 0.4, { to: 55, a: 0.003 });
    } },
    sting: { dur: 0.7, level: 0.5, play: function (f, t) {
      noise(f, t, 0.22, 0.5, { type: 'lowpass', f0: 3000, f1: 400, a: 0.003 });
      tone(f, 'sine', 120, t, 0.3, 0.6, { to: 45, glide: 0.8, a: 0.004 });
      tone(f, 'sawtooth', 392, t + 0.05, 0.45, 0.2, { to: 1318, glide: 0.9, a: 0.03, lp: 3200 });
      tone(f, 'sawtooth', 404, t + 0.05, 0.45, 0.2, { to: 1360, glide: 0.9, a: 0.03, lp: 3200 });
    } },
    hit: { dur: 0.35, level: 0.5, play: function (f, t) {
      tone(f, 'sine', 160, t, 0.25, 0.9, { to: 42, glide: 0.6, a: 0.002 });
      noise(f, t, 0.1, 0.5, { type: 'lowpass', f0: 1800, f1: 300, a: 0.002 });
    } },
    boing: { dur: 0.6, level: 0.5, play: function (f, t) {
      var s = tone(f, 'sine', 180, t, 0.55, 0.55, { path: [[0.09, 620], [0.55, 160]], a: 0.005 });
      lfo(f, 20, 35, s.frequency, t, 0.55);
    } },
    sparkle: { dur: 0.9, level: 0.7, play: function (f, t) {
      var n = [1047, 1319, 1568, 2093, 2637];
      for (var i = 0; i < n.length; i++) tone(f, 'sine', n[i], t + i * 0.065, 0.4, 0.28 - i * 0.02, { a: 0.004 });
    } },
    rumble: { dur: 0.75, level: 0.8, play: function (f, t) {
      noise(f, t, 0.7, 0.5, { type: 'lowpass', f0: 260, f1: 180, a: 0.28 });
      tone(f, 'sawtooth', 58, t, 0.7, 0.35, { to: 46, a: 0.25, lp: 260, q: 1, am: 24 });
      tone(f, 'sawtooth', 61.5, t, 0.7, 0.3, { to: 48, a: 0.25, lp: 260, q: 1, am: 31 });
    } },
    drip: { dur: 0.4, level: 0.7, play: function (f, t) {
      tone(f, 'sine', 700, t, 0.1, 0.45, { to: 1500, glide: 0.7, a: 0.003 });
      tone(f, 'sine', 650, t + 0.14, 0.1, 0.2, { to: 1050, glide: 0.7, a: 0.003 });
    } },
    sad: { dur: 1.5, level: 0.6, play: function (f, t) {
      tone(f, 'triangle', 392, t, 0.55, 0.4, { a: 0.02, lp: 1400 });
      tone(f, 'triangle', 370, t + 0.3, 0.55, 0.38, { a: 0.02, lp: 1400 });
      tone(f, 'triangle', 330, t + 0.6, 0.8, 0.36, { to: 300, a: 0.02, lp: 1200 });
    } },
    snore: { dur: 1.4, level: 1.0, play: function (f, t) {
      noise(f, t, 0.55, 0.3, { type: 'lowpass', f0: 450, a: 0.4 });
      noise(f, t + 0.5, 0.8, 0.25, { type: 'lowpass', f0: 380, a: 0.2 });
      tone(f, 'sawtooth', 70, t + 0.5, 0.8, 0.28, { to: 55, a: 0.15, lp: 320, am: 26 });
    } },
    party: { dur: 1.0, level: 0.6, play: function (f, t) {
      noise(f, t, 0.14, 0.45, { type: 'highpass', f0: 3500, a: 0.002 });
      tone(f, 'sine', 220, t, 0.12, 0.5, { to: 70, glide: 0.6, a: 0.002 });
      var n = [1047, 1568, 2093, 2637, 3136];
      for (var i = 0; i < n.length; i++) tone(f, 'triangle', n[i], t + 0.06 + i * 0.05, 0.3, 0.22, { a: 0.004 });
    } },
    hmm: { dur: 0.5, level: 0.8, play: function (f, t) {
      tone(f, 'triangle', 587, t, 0.14, 0.32, { a: 0.01, lp: 2400 });
      tone(f, 'triangle', 784, t + 0.16, 0.26, 0.32, { a: 0.01, lp: 2400 });
    } },
    gong: { dur: 2.7, level: 0.35, play: function (f, t) {
      // các hài không nguyên + một hài lệch nhẹ tạo "nhịp phách" ấm; đuôi ~2 s
      var P = [[1, 0.5, 2.5], [2.01, 0.28, 1.9], [2.76, 0.16, 1.4], [4.07, 0.1, 0.9], [5.4, 0.05, 0.6], [1.006, 0.25, 2.3]];
      for (var i = 0; i < P.length; i++) tone(f, 'sine', 110 * P[i][0], t, P[i][2], P[i][1], { a: 0.012 });
      noise(f, t, 0.12, 0.18, { type: 'lowpass', f0: 1500, a: 0.004 });
    } },
    chime: { dur: 0.8, level: 0.6, play: function (f, t) {
      tone(f, 'sine', 1319, t, 0.5, 0.3, { a: 0.006 });
      tone(f, 'sine', 1760, t + 0.11, 0.6, 0.28, { a: 0.006 });
    } },
    swish: { dur: 0.3, level: 1.3, play: function (f, t) {
      noise(f, t, 0.2, 0.4, { type: 'bandpass', f0: 1400, f1: 5200, mid: 0.11, f2: 3000, q: 2.2, a: 0.07 });
    } },
    tick: { dur: 0.06, level: 0.5, play: function (f, t) {
      tone(f, 'triangle', 1700, t, 0.025, 0.45, { to: 1200, a: 0.001 });
    } }
  };
  function sfx(name, opts) {
    if (!ready() || muted || typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SFX, name)) return;
    opts = opts || {};
    var d = SFX[name];
    var f = mkFx(sfxBus, d.dur + 0.1, true, d.level * clamp(opts.gain, 0, 1, 1), opts.pan != null ? clamp(opts.pan, -1, 1, 0) : null);
    if (f) d.play(f, ctx.currentTime + 0.005);
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
  function voiceOf(asset) {
    asset = asset || {};
    var v = asset.voice || {}, hp = typeof v.pitch === 'number' && v.pitch === v.pitch, hr = typeof v.rate === 'number' && v.rate === v.rate;
    var h = hash(String(asset.id || asset.key || asset.name || '')), text = norm([asset.role, asset.persona, asset.name].join(' '));
    var low = hasKw(text, LOW_KW), high = hasKw(text, HIGH_KW);
    var pitch, rate;
    if (hp) pitch = clamp(v.pitch, 0.5, 2);
    else pitch = clamp(1 + ((h % 21) - 10) / 50 + (low ? -0.3 : 0) + (high ? 0.3 : 0), 0.5, 2);
    if (hr) rate = clamp(v.rate, 0.6, 1.6);
    else rate = clamp(1 + (((h >>> 8) % 17) - 8) / 60 + (low ? -0.08 : 0) + (high ? 0.1 : 0), 0.6, 1.6);
    return { pitch: Math.round(pitch * 100) / 100, rate: Math.round(rate * 100) / 100, blip: typeof v.blip === 'number' && v.blip > 0 ? v.blip : blipOf(pitch) };
  }
  function normVoice(v) {
    v = v || {};
    var pitch = clamp(v.pitch, 0, 2, 1);
    return { pitch: pitch, rate: clamp(v.rate, 0.5, 1.8, 1), blip: v.blip > 0 ? +v.blip : blipOf(pitch) };
  }

  /* ---------------------------------------------------------- giọng đọc TTS */
  // nạp bất đồng bộ (Chrome trả [] lần đầu rồi bắn voiceschanged); chỉ nhận giọng có lang 'vi*'
  function findVoice() {
    if (!synth) return null;
    var list = synth.getVoices ? synth.getVoices() : [], best = null, bs = -1;
    for (var i = 0; i < list.length; i++) {
      var v = list[i], lang = String(v.lang || '').toLowerCase().replace('_', '-');
      if (lang !== 'vi' && lang.indexOf('vi-') !== 0) continue;
      var s = 1;
      if (/google|microsoft/i.test(v.name)) s += 3;
      if (/\b(Linh|An|HoaiMy|NamMinh)\b/.test(v.name)) s += 2;
      if (/natural|online/i.test(v.name)) s += 1;
      if (v.localService) s += 1;
      if (s > bs) { bs = s; best = v; }
    }
    viVoice = best;
    return best;
  }
  if (synth) {
    findVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', findVoice);
    else if ('onvoiceschanged' in synth) synth.onvoiceschanged = findVoice;
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
    clearTimeout(j.tm); clearTimeout(j.mouthT); clearTimeout(j.safeT); clearTimeout(j.fbT); clearTimeout(j.endT);
    clearInterval(j.iv); j.tm = j.mouthT = j.safeT = j.fbT = j.endT = j.iv = null;
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
  function chooseEngine(allowTTS) {
    if (muted || mode === 'off') return 'silent';
    var blipOK = ready();
    if (mode === 'blip') return blipOK ? 'blip' : 'silent';
    if (allowTTS && synth && (viVoice || findVoice())) return 'tts';   // không bao giờ đọc tiếng Việt bằng giọng không phải 'vi'
    return blipOK ? 'blip' : 'silent';
  }
  function start(j, from, allowTTS) {
    var e = chooseEngine(allowTTS);
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

  /* TTS: onboundary nhép miệng + chạy chữ; không có boundary trong 400 ms thì nhép theo đồng hồ */
  function startTTS(j) {
    var vc = viVoice || findVoice(), u = new W.SpeechSynthesisUtterance(j.text), starts = [], m, re = /\S+/g, est = estimate(j.total, j.v.rate);
    while ((m = re.exec(j.text))) starts.push(m.index);
    u.voice = vc; u.lang = 'vi-VN';
    u.pitch = clamp(j.v.pitch, 0, 2, 1); u.rate = clamp(j.v.rate, 0.5, 1.8, 1); u.volume = volume;
    j.u = u; j.gotBoundary = false; j.armed = false;
    function arm() {                     // 400 ms sau khi bắt đầu mà chưa có boundary → nhép giả
      if (j.armed || j.done) return;
      j.armed = true;
      j.fbT = setTimeout(function () { if (!j.done && !j.gotBoundary) startFlap(j, 0, est, true); }, 400);
    }
    u.onstart = function () { if (!j.done) { hookWord(j, 0); arm(); } };
    u.onboundary = function (e) {
      if (j.done || (e.name && e.name !== 'word')) return;
      j.gotBoundary = true;
      clearInterval(j.iv); j.iv = null;
      var wi = 0;
      for (var i = 0; i < starts.length && starts[i] <= e.charIndex; i++) wi = i;
      hookWord(j, wi);
      hookMouth(j, 0.55 + Math.random() * 0.45);
      clearTimeout(j.mouthT);
      j.mouthT = setTimeout(function () { if (!j.done) hookMouth(j, 0); }, 120);
    };
    u.onend = function () { finish(j); };
    u.onerror = function (e) {
      if (j.done || e.error === 'canceled' || e.error === 'interrupted') return;
      // TTS hỏng (not-allowed, synthesis-failed…): nói lại cả câu bằng blip/im lặng để phim không mất nhịp
      console.warn('[GC.audio] speechSynthesis lỗi (' + e.error + ') — chuyển sang blip');
      clearTimers(j); j.u = null; j.wi = -1; j.gotBoundary = false;
      start(j, 0, false);
    };
    // Chrome đôi khi không bao giờ bắn onend → tự giải phóng
    j.safeT = setTimeout(function () { if (!j.done) { cancelSynth(); finish(j); } }, Math.max(est * 1.8, 2.5) * 1000);
    var wait = Math.max(0, 70 - (now() - lastCancel));   // speak() ngay sau cancel() hay bị Chrome nuốt
    function speak() {
      if (j.done) return;
      if (synth.paused) synth.resume();
      synth.speak(u);
      j.fbT = setTimeout(arm, 700);      // nếu onstart không tới
    }
    if (wait > 0) j.tm = setTimeout(speak, wait); else speak();
  }

  function say(text, voice, hooks) {
    hush();
    return new Promise(function (resolve) {
      text = String(text == null ? '' : text);
      var w = words(text);
      var j = { text: text, words: w, total: w.length, v: normVoice(voice), hooks: hooks || {}, resolve: resolve, done: false, wi: -1,
        t0: 0, tm: null, iv: null, mouthT: null, safeT: null, fbT: null, endT: null, ev: null, k: 0, u: null, warned: false };
      job = j;
      duck(true);
      if (ctx && ctx.state !== 'running') unlock();          // thử đánh thức lại nếu bị treo
      start(j, 0, true);
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
    ambient: ambient,
    music: music,
    voiceOf: voiceOf,
    say: say,
    get voiceMode() { return mode; },
    setVoiceMode: function (m) { if (MODES.indexOf(m) >= 0) mode = m; },
    hush: hush,
    stopAll: function () { hush(); ambient(null); music(null); },
    info: function () { findVoice(); return { ctx: !!ctx, tts: !!synth, viVoice: viVoice ? viVoice.name : null, mode: mode }; }
  };
  GC.audio = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window.GenChibi : {});
