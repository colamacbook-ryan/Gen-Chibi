// gen-chibi — xuất PHIM HTML độc lập + STORYBOARD của một tác phẩm: MỘT nguồn cho Studio (nút "Phim (HTML)" / "Storyboard", studio/app.js)
// và MCP (export_film_html / get_storyboard, server/mcp.js — CNS-047). Cùng tác phẩm + cùng ngôn ngữ giao diện + cùng giọng AI đã có → cùng tệp.
// DOM-free: trình duyệt (window.GCFilmHTML, nạp trước studio/app.js) và Node (require). Tệp này KHÔNG bao giờ nhúng vào phim (CNS-228: studio/*).
// Chữ người xem đọc (nút, nhãn, chú thích) đi qua hàm dịch `t(msgid, vars)` người gọi đưa vào (Studio: GC.i18n.t · server: I18N.tr(lang, …)) — msgid tiếng Việt.
// © 2026 Gen Labs — All rights reserved.
(function (root, factory) {
  var F = factory();
  if (typeof module === 'object' && module.exports) module.exports = F; else root.GCFilmHTML = F;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var MY_PACK = 'local.my';
  function N_(s) { return s; }   // đánh dấu msgid (tools/i18n-scan.mjs) — dịch lúc dùng bằng t()

  /* ---- tiện ích chữ (Studio dùng lại qua window.GCFilmHTML) ---- */
  // cắt theo code point (không chẻ đôi emoji → encodeURIComponent không ném lỗi); bỏ ký tự điều khiển (XML không cho phép)
  function cut(t, n) { var a = Array.from(String(t == null ? '' : t)); return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); }
  function xml(t) { return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function wrapText(t, n, max) {   // ngắt dòng theo số ký tự (đủ dùng cho tiếng Việt đơn giản), tối đa max dòng
    var out = [], line = '';
    String(t || '').replace(/\s+/g, ' ').trim().split(' ').forEach(function (w) {
      if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
    });
    if (line) out.push(line);
    if (out.length > max) { out = out.slice(0, max); out[max - 1] = cut(out[max - 1], Array.from(out[max - 1]).length - 1); }
    return out;
  }
  function jsonForScript(x) { return JSON.stringify(x).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  // ngôn ngữ lời thoại + giọng vùng của phim (engine/voices.js)
  function workLang(GC, W) { var l = GC.voices.lang(W && W.lang); return { lang: l, accent: GC.voices.accent(l, W && W.accent) }; }
  function htmlLang(L) { return L.lang === 'en' ? 'en' : L.lang === 'zh' ? (L.accent === 'tw' ? 'zh-TW' : 'zh-CN') : L.lang === 'yue' ? 'zh-HK' : 'vi'; }
  // kiểu lời thoại của sân khấu (engine/player.js: opts.dialog): msgid, dịch lúc vẽ
  var DIALOG_MODES = [['auto', N_('Lời thoại: tự động')], ['bubble', N_('Lời thoại: bong bóng')], ['caption', N_('Lời thoại: phụ đề')]];

  /* ---- gói phụ thuộc ---- */
  // Gói phụ thuộc của một nhóm asset "của tôi": nhân vật + trang bị nhân vật đang mặc + cảnh + linh kiện / phông tự vẽ đang dùng.
  // Dùng cho: tải gói dự án, xuất phim HTML độc lập (người xem không cần bản cài).
  function bundleOf(GC, chars, items, scenes) {
    var LIB = GC.LIB, ch = {}, it = {}, sc = {}, parts = {};
    function part(p) { if (p && p.pack === MY_PACK && p.data) parts[(p.kind === 'scenery' ? 'sc:' : '') + p.slot + ':' + p.id] = p.data; }
    function addItem(x) { if (!x || x.pack !== MY_PACK || it[x.key]) return; it[x.key] = x; part(GC.getPart(x.equip.slot, x.equip.part)); }
    (chars || []).forEach(function (a) {
      if (!a || (a.pack !== MY_PACK && !a.savedAt) || ch[a.key]) return;   // "của tôi" + bản đã chỉnh lưu trong kho (asset gốc đã nằm trong script)
      ch[a.key] = a;
      Object.keys(LIB.slots).forEach(function (sl) { var ref = GC.partRef(a, sl); part(ref && GC.getPart(sl, ref, a.pack)); });
      Object.keys((a.look && a.look.equip) || {}).forEach(function (sl) { addItem(GC.ITEMS[a.look.equip[sl]] || GC.getItem(a.look.equip[sl], MY_PACK)); });
    });
    (items || []).forEach(addItem);
    (scenes || []).forEach(function (x) {
      if (!x || x.pack !== MY_PACK || sc[x.key]) return;
      sc[x.key] = x;
      Object.keys(x.layers).map(function (k) { return x.layers[k].part; }).concat(x.deco.map(function (d) { return d.part; })).forEach(function (ref) {
        Object.keys(LIB.parts).forEach(function (k) { var q = LIB.parts[k]; if (q.kind === 'scenery' && q.pack + '/' + q.id === ref) part(q); });
      });
    });
    var vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
    return { characters: vals(ch), items: vals(it), scenes: vals(sc), parts: vals(parts) };
  }
  // gói âm (không phải khung) mà tác phẩm cần: thuộc dự án của tác phẩm, hoặc có âm được gọi tên trong lời thoại / gói động tác đi kèm — GC.sounds.bundleDeps, MỘT hàm
  // cho cả ba bộ đóng gói (phim xuất, sao lưu, gói bán — CNS-101)
  function soundPacks(GC, W, motionPacks) {
    var S = GC.sounds; if (!S) return [];
    var want = {}; S.bundleDeps({ shots: W.shots, motionPacks: motionPacks || [] }).packs.forEach(function (id) { want[id] = 1; });
    return S.packs().filter(function (p) { return !p.frame && (want[p.id] || (W.project && p.project === W.project)); }).map(function (p) { return S.pack(p.id); });
  }

  /* ---- dữ liệu phim (CNS-219: phim HTML + video cùng lấy ở đây) ---- */
  // o = { voices: { voices: { <GC.film.clipKey>: data:URI }, total }, dialog: auto | bubble | caption, voiceOf(asset, L) (mặc định GC.audio.voiceOf — Node đưa vào) }
  // → { data, film } — asset tác phẩm dùng, gói động tác / gói âm, giọng chốt, clip giọng AI đã có, ngôn ngữ phim
  function payload(GC, W, o) {
    o = o || {};
    var L = workLang(GC, W), chars = [], scenes = [], vo = o.voices || { voices: {}, total: 0 }, voiceOf = o.voiceOf || (GC.audio && GC.audio.voiceOf);
    W.shots.forEach(function (s) { chars = chars.concat(GC.film.actors(s)); var sc = GC.film.scene(s); if (sc) scenes.push(sc); });
    var data = bundleOf(GC, chars, [], scenes);
    // gói động tác có hành động phim dùng tới (đòn của bộ chủ đề) — đòn của khung đã nằm trong mã bộ phát
    var used = {}; W.shots.forEach(function (s) { ((s.event && s.event.steps) || []).forEach(function (st) { if (st.action) used[st.action] = 1; }); });
    var motionPacks = GC.choreo ? GC.choreo.packs().filter(function (p) { return Object.keys(p.actions).some(function (k) { return used[k]; }); })
      .map(function (p) { var x = JSON.parse(JSON.stringify(p)); ['pack', 'key', 'version', 'savedAt', 'note'].forEach(function (k) { delete x[k]; }); return x; }) : [];
    var pick = function (x, keys) { var r = {}; keys.forEach(function (k) { if (x[k] !== undefined) r[k] = x[k]; }); return r; };
    // motionPacks phải giữ lại ở đây: dựng lại `data` mà bỏ nó thì bộ phát không nạp gói nào và phim mất các chương dùng đòn của gói
    var out = { parts: data.parts, motionPacks: motionPacks, soundPacks: soundPacks(GC, W, motionPacks), project: W.project || '', characters: data.characters.map(function (a) {
        // giọng chốt sẵn lúc xuất (nhân vật chưa lưu giọng thì lấy giọng Studio đang dùng — không xuất persona; vai giọng luôn chốt, vì phim không có persona để đoán lại)
        var x = pick(a, ['id', 'pack', 'name', 'version', 'look', 'expressions', 'kind', 'voice', 'role']);
        if (voiceOf) { var vv = voiceOf(a, L); x.voice = Object.assign({}, x.voice || vv); if (!x.voice.role && vv.role) x.voice.role = vv.role; }
        return x;
      }),
      items: data.items.map(function (x) { return pick(x, ['id', 'name', 'type', 'rarity', 'equip']); }),
      scenes: data.scenes.map(function (x) { return pick(x, ['id', 'name', 'layers', 'deco', 'palette', 'time', 'weather', 'spots']); }),
      lang: L.lang, accent: L.accent, voices: vo.voices, voiceTotal: vo.total };   // ngôn ngữ phim + clip giọng AI theo khoá GC.film.clipKey + tổng số câu (nhãn "Giọng AI 19/31")
    var dialog = DIALOG_MODES.some(function (m) { return m[0] === o.dialog; }) ? o.dialog : 'auto';
    var film = { title: W.title, logline: W.logline || '', dialog: dialog, shots: W.shots.map(function (s) { return { id: s.id, title: s.title, description: s.description || '', scene: s.scene, cast: s.cast, event: s.event }; }) };
    return { data: out, film: film };
  }

  /* ---- trang phim ---- */
  var FILM_CSS = [
    '*{box-sizing:border-box}html,body{margin:0;background:#121214;color:#ece9e2;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.film{max-width:min(1200px,96vw);margin:0 auto;padding:24px 0 40px;display:grid;gap:14px}',
    'header{display:flex;align-items:flex-end;gap:16px}header h1{margin:0;font-size:26px;letter-spacing:-.01em}header p{margin:4px 0 0;color:#a8a49d}',
    '.badge{margin-left:auto;font-size:12px;color:#a8a49d;border:1px solid #34333a;border-radius:12px;padding:2px 10px;white-space:nowrap}',
    '.ainote{font-size:12px;color:#a8a49d;border:1px solid #34333a;border-radius:12px;padding:2px 10px;white-space:nowrap;cursor:help}',
    '.screen{position:relative;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgb(0 0 0/.45)}.screen .gcp{border-radius:0}',
    '.big{position:absolute;inset:0;margin:auto;width:84px;height:84px;border-radius:50%;border:0;background:rgb(255 255 255/.92);color:#121214;font-size:30px;cursor:pointer;z-index:9;box-shadow:0 8px 30px rgb(0 0 0/.35)}',
    '.big[hidden]{display:none}',
    '.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bar button{background:#232227;color:#ece9e2;border:1px solid #34333a;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}',
    '.bar button:hover{background:#2c2b31}#prog{margin-left:auto;color:#a8a49d;font-variant-numeric:tabular-nums}',
    '.bar select{background:#232227;color:#ece9e2;border:1px solid #34333a;border-radius:6px;padding:6px 8px;font:inherit}',
    '#chapters{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}',
    '#chapters button{width:100%;text-align:left;background:#1b1b1e;color:inherit;border:1px solid #2a2a2f;border-radius:8px;padding:8px 10px;font:inherit;cursor:pointer;display:grid;gap:2px}',
    '#chapters button:hover{border-color:#4a4950}#chapters b{font-size:13px}#chapters span{font-size:12px;color:#8a857e}',
    'footer{color:#6f6b64;font-size:12px;text-align:center;margin-top:8px}',
    ':fullscreen .screen,.screen:fullscreen{display:grid;place-items:center;background:#000}.screen:fullscreen #stage{width:min(100vw,177.78vh)}'
  ].join('\n');
  var FILM_BOOT = [
    '(function () {',
    '  var GC = window.GenChibi, $ = function (id) { return document.getElementById(id); };',
    '  GC.pack({ id: "local.my", name: "Của tôi", owner: "Người tạo", group: "mine", license: "Thuộc người tạo" }, function () {});',   // i18n-ignore(siêu dữ liệu gói trong phim, không hiện ra)
    '  DATA.parts.forEach(function (p) { GC.registerDataPart("local.my", p); });',
    '  DATA.items.forEach(function (x) { GC.registerItem("local.my", x); });',
    '  DATA.scenes.forEach(function (x) { GC.registerScene("local.my", x); });',
    '  DATA.characters.forEach(function (a) { GC.registerAsset(a.pack, a); });',
    '  (DATA.soundPacks || []).forEach(function (p) { if (GC.sounds) GC.sounds.registerPack(p); });',   // gói âm TRƯỚC gói động tác (sự kiện gọi tên âm)
    '  (DATA.motionPacks || []).forEach(function (m) { GC.choreo.registerPack("local.my", m); });',
    '  var rs = GC.film.readiness(FILM), ready = rs.filter(function (x) { return x.ok; }).map(function (x) { return x.shot; });',
    // giọng AI nhúng sẵn (DATA.voices: khoá câu → data: URI) chỉ dùng khi chọn "tự động"; chọn máy đọc / blip / tắt thì bỏ qua. Không gọi mạng.
    '  var VO = DATA.voices || {}, aiN = Object.keys(VO).length, aiT = DATA.voiceTotal || 0;',
    '  var F = GC.i18n ? GC.i18n.fmt : function (s) { return s; };',
    '  if (aiN) $("voice").options[0].text = TXT.aiAuto;',
    // chưa đủ clip: nhãn nhỏ cạnh ô Giọng nói rõ phần còn lại đọc bằng giọng máy / blip (chỉ khi đang ở "tự động" — chọn máy đọc / blip thì clip AI không dùng)
    '  function aiNote() { var n = $("ainote"), lack = aiT - aiN; n.hidden = !(aiN && lack > 0 && $("voice").value === "auto"); n.textContent = F(TXT.aiNote, { n: aiN, total: aiT }); n.title = F(TXT.aiLack, { n: lack }); }',
    '  var player = GC.film.player($("stage"), { onProgress: function (t) { $("prog").textContent = t; }, onEnd: function () { $("big").hidden = false; }, dialog: FILM.dialog || "auto", lang: DATA.lang, accent: DATA.accent,',
    '    voiceClip: function (line) { return $("voice").value === "auto" && aiN ? VO[GC.film.clipKey(line)] || null : null; },',
    // phim có giọng AI + đang ở "tự động": câu thiếu clip chỉ đọc bằng giọng máy hạng tốt, không thì blip (không để robot lẫn với giọng AI); chọn "máy đọc" thì đọc như cũ
    '    needGood: function () { return $("voice").value === "auto" && aiN > 0; } });',
    '  if (DATA.project) player.setProject(DATA.project);',   // dự án của tác phẩm → chọn gói âm (assets xuất ra không mang project)
    '  $("dialog").value = player.dialog(); $("dialog").onchange = function () { player.setDialog($("dialog").value); };',
    '  player.show(ready[0] || FILM.shots[0]);',
    '  function play(from) { $("big").hidden = true; player.play(ready.slice(from || 0), FILM.title); }',
    '  $("big").onclick = $("play").onclick = function () { play(0); };',
    '  $("stop").onclick = function () { player.stop(); $("big").hidden = false; };',
    '  var A = GC.audio; if (A) { $("mute").onclick = function () { A.setMuted(!A.muted); $("mute").textContent = A.muted ? "🔇" : "🔊"; }; $("voice").onchange = function () { A.setVoiceMode($("voice").value); aiNote(); }; aiNote(); } else { $("mute").hidden = $("voice").hidden = true; }',
    '  $("full").onclick = function () { var s = document.querySelector(".screen"); (s.requestFullscreen || s.webkitRequestFullscreen || function () {}).call(s); };',
    '  document.addEventListener("keydown", function (e) { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); if ($("big").hidden) $("stop").onclick(); else play(0); } });',
    '  ready.forEach(function (s, i) {',
    '    var li = document.createElement("li"), b = document.createElement("button"), t = document.createElement("b"), d = document.createElement("span");',
    '    t.textContent = (i + 1) + ". " + s.title; d.textContent = s.description || F(TXT.lines, { n: s.event.steps.length });',
    '    b.appendChild(t); b.appendChild(d); b.onclick = function () { play(i); window.scrollTo({ top: 0, behavior: "smooth" }); };',
    '    li.appendChild(b); $("chapters").appendChild(li);',
    '  });',
    '  if (!ready.length) $("prog").textContent = TXT.none;',
    '})();'
  ].join('\n');
  // một tệp .html: chú thích giấy phép + trang + mã engine (texts theo srcs, đúng thứ tự trang Studio) + bảng dịch trình phát + DATA / FILM + mã khởi động.
  // o = { W, data, film, ui, dict, srcs, texts, version, t }. NGÔN NGỮ (ADR 0007): chữ trang phim theo ngôn ngữ giao diện LÚC XUẤT (o.ui, o.t cùng ngôn ngữ);
  // lời thoại, tên phim = nội dung người dùng: giữ nguyên
  function html(o) {
    var _t = o.t, W = o.W, data = o.data, film = o.film, UI = o.ui, srcs = o.srcs, texts = o.texts;
    var safe = function (t) { return t.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'); };
    var vopt = [['auto', _t('Giọng: tự động')], ['tts', _t('Giọng: máy đọc')], ['blip', _t('Giọng: blip')], ['off', _t('Giọng: tắt')]];
    var TXT = { aiAuto: _t('Giọng: tự động (có giọng AI)'), aiNote: _t('Giọng AI {n}/{total}'), aiLack: _t('{n} câu chưa có giọng AI — phần còn lại đọc bằng giọng máy / blip.'),
      lines: _t('{n} lời thoại'), none: _t('Tác phẩm chưa có phân cảnh nào sẵn sàng.') };
    return '<!doctype html>\n<!--\n  ' + _t('Phim "{title}" — làm bằng gen-chibi.', { title: xml(W.title) }) + '\n  ' + _t('Bộ phát (engine/*, kinds/*) © 2026 Gen Labs — All rights reserved. Giấy phép: CHỈ ĐỂ XEM phim này.') + '\n  ' + _t('Không trích xuất, sao chép, sửa đổi hay tái sử dụng mã bộ phát cho mục đích khác.') + '\n  ' + _t('Riêng phông chữ lời thoại Be Vietnam Pro (engine/fonts.js) © 2021 The Be Vietnam Pro Project Authors — SIL Open Font License 1.1 (toàn văn nằm trong chính tệp này).') + '\n-->\n<html lang="' + htmlLang({ lang: data.lang, accent: data.accent }) + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + xml(W.title) + ' — gen-chibi</title>\n' +
      '<meta name="generator" content="gen-chibi ' + xml(String(o.version || '')) + ' · Gen Labs">\n<style>' + FILM_CSS + '</style>\n</head>\n<body>\n' +
      '<main class="film"><header><div><h1>' + xml(W.title) + '</h1><p>' + xml(W.logline || '') + '</p></div><span class="badge">' + xml(_t('{n} phân cảnh', { n: W.shots.length })) + '</span></header>\n' +
      '<div class="screen"><div id="stage"></div><button id="big" class="big" aria-label="' + xml(_t('Xem phim')) + '">▶</button></div>\n' +
      '<div class="bar"><button id="play">' + xml(_t('▶ Xem')) + '</button><button id="stop">' + xml(_t('■ Dừng')) + '</button><button id="full">' + xml(_t('⛶ Toàn màn hình')) + '</button><button id="mute" aria-label="' + xml(_t('Bật / tắt tiếng')) + '">🔊</button>' +
      '<select id="voice" aria-label="' + xml(_t('Giọng nhân vật')) + '">' + vopt.map(function (v) { return '<option value="' + v[0] + '">' + xml(v[1]) + '</option>'; }).join('') + '</select><span id="ainote" class="ainote" hidden></span>' +
      '<select id="dialog" aria-label="' + xml(_t('Kiểu lời thoại')) + '">' + DIALOG_MODES.map(function (m) { return '<option value="' + m[0] + '">' + xml(_t(m[1])) + '</option>'; }).join('') + '</select><span id="prog"></span></div>\n' +
      '<ol id="chapters"></ol>\n<footer>' + xml(_t('Làm bằng gen-chibi · Bộ phát © 2026 Gen Labs — chỉ để xem phim này')) + '</footer></main>\n' +
      texts.map(function (t, i) { return '<script>/* ' + srcs[i] + ' */\n' + safe(t) + '\n</script>'; }).join('\n') + '\n' +
      '<script>\n(function (I) { if (!I) return; I.add(' + jsonForScript(UI) + ', ' + jsonForScript(o.dict) + '); I.setLang(' + jsonForScript(UI) + '); })(window.GenChibi && window.GenChibi.i18n);\nvar TXT = ' + jsonForScript(TXT) + ';\n</script>\n' +
      '<script>\nvar DATA = ' + jsonForScript(data) + ';\nvar FILM = ' + jsonForScript(film) + ';\n' + FILM_BOOT + '\n</script>\n</body>\n</html>\n';
  }

  /* ---- storyboard ---- */
  // Storyboard: một SVG — đầu trang (tên, logline) + lưới 2 cột: ảnh phân cảnh, mô tả, lời thoại. _t = hàm dịch theo ngôn ngữ giao diện
  function storyboard(GC, W, _t) {
    var COLS = 2, CW = 560, IH = 315, TH = 150, GAP = 24, M = 32, HEAD = 96;
    var rows = Math.max(1, Math.ceil(W.shots.length / COLS)), Wd = M * 2 + COLS * CW + (COLS - 1) * GAP, Hd = HEAD + rows * (IH + TH + GAP) + M;
    var o = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + Wd + ' ' + Hd + '" font-family="Arial, Helvetica, sans-serif">' +
      '<rect width="100%" height="100%" fill="#f6f4ef"/>' +
      '<text x="' + M + '" y="52" font-size="28" font-weight="700" fill="#1c1b1e">' + xml(W.title) + '</text>' +
      '<text x="' + M + '" y="80" font-size="14" fill="#5e5a53">' + xml(cut(W.logline || '', 140)) + '</text>' +
      '<text x="' + (Wd - M) + '" y="52" font-size="12" fill="#8e897f" text-anchor="end">Storyboard · ' + xml(_t('{n} phân cảnh', { n: W.shots.length })) + ' · gen-chibi · © 2026 Gen Labs</text>';
    W.shots.forEach(function (s, i) {
      var x = M + (i % COLS) * (CW + GAP), y = HEAD + Math.floor(i / COLS) * (IH + TH + GAP), svg = GC.film.still(s);
      var names = {}; GC.film.actors(s).forEach(function (a) { names[a.id] = a.name; });
      o += '<rect x="' + x + '" y="' + y + '" width="' + CW + '" height="' + (IH + TH) + '" rx="10" fill="#fff" stroke="#e6e2d9"/>';
      o += svg ? '<image x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (CW - 2) + '" height="' + IH + '" preserveAspectRatio="xMidYMid slice" href="data:image/svg+xml;base64,' + b64(svg) + '"/>'
        : '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (CW - 2) + '" height="' + IH + '" fill="#efece5"/><text x="' + (x + CW / 2) + '" y="' + (y + IH / 2) + '" font-size="14" fill="#8e897f" text-anchor="middle">' + xml(_t('chưa có bối cảnh')) + '</text>';
      o += '<circle cx="' + (x + 22) + '" cy="' + (y + 22) + '" r="14" fill="#2e8b5e"/><text x="' + (x + 22) + '" y="' + (y + 27) + '" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">' + (i + 1) + '</text>';
      var ty = y + IH + 24;
      o += '<text x="' + (x + 14) + '" y="' + ty + '" font-size="16" font-weight="700" fill="#1c1b1e">' + xml(s.title) + '</text>';
      wrapText(s.description, 74, 2).forEach(function (l, k) { o += '<text x="' + (x + 14) + '" y="' + (ty + 20 + k * 17) + '" font-size="12.5" fill="#5e5a53">' + xml(l) + '</text>'; });
      var lines = (s.event ? s.event.steps : []).slice(0, 4).map(function (st) { return (names[st.actor] || st.actor) + ': ' + st.say; });
      if (s.event && s.event.steps.length > 4) lines[3] = lines[3] + '  (+' + (s.event.steps.length - 4) + ')';
      if (!lines.length) lines = [_t('(chưa có lời thoại)')];
      lines.forEach(function (l, k) { o += '<text x="' + (x + 14) + '" y="' + (ty + 62 + k * 17) + '" font-size="12" fill="#1c1b1e" font-style="italic">' + xml(cut(l, 80)) + '</text>'; });
    });
    return o + '</svg>';
  }

  return { MY_PACK: MY_PACK, DIALOG_MODES: DIALOG_MODES, cut: cut, xml: xml, wrapText: wrapText, jsonForScript: jsonForScript, workLang: workLang, htmlLang: htmlLang,
    bundleOf: bundleOf, soundPacks: soundPacks, payload: payload, html: html, storyboard: storyboard };
});
