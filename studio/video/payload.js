/* gen-chibi — dựng PAYLOAD phim: MỘT nguồn cho phim HTML, xuất video và job CI (CNS-219, CNS-246). © 2026 Gen Labs — All rights reserved.
 *
 * Thuần dữ liệu, không DOM — chạy trong Studio (window.GCVPayload, nạp trước studio/video/client.js + app.js) và trong Node (tools/video-ci.mjs require).
 * Studio (filmPayload của app.js) gom asset / gói từ trạng thái Studio rồi gọi build(); job CI gọi CÙNG build() với dữ liệu của gói mẫu — không còn bản
 * dựng tay thứ hai của payload (trước v0.23.2: video-ci.mjs chép lại phần chọn khoá → lệch khi Studio đổi, CNS-246).
 *
 *   GCVPayload.usedActions(W)               → { <id hành động>: 1 } mọi hành động (đòn) phân cảnh gọi tới
 *   GCVPayload.motionPacks(W, packs)        → gói động tác có hành động phim dùng tới, đã bỏ khoá kho (pack, key, version, savedAt, note)
 *   GCVPayload.build(o)                     → { srcs, data, film, ui, dict, have, total }
 *       o = { W (tác phẩm: title, logline, project, shots), data { parts, items, characters, scenes }, motionPacks, soundPacks,
 *             voiceOf (a) → giọng chốt sẵn | null (Studio: GC.audio.voiceOf theo ngôn ngữ phim; không có engine/audio.js → null, giữ giọng của nhân vật),
 *             lang { lang, accent }, vo { voices, have, total } (clip giọng AI theo GC.film.clipKey), dialog, srcs, ui, dict }
 */
(function (root) {
  'use strict';
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function usedActions(W) {
    var used = {};
    ((W && W.shots) || []).forEach(function (s) { ((s.event && s.event.steps) || []).forEach(function (st) { if (st.action) used[st.action] = 1; }); });
    return used;
  }
  function motionPacks(W, packs) {
    var used = usedActions(W);
    return (packs || []).filter(function (p) { return Object.keys(p.actions || {}).some(function (k) { return used[k]; }); })
      .map(function (p) { var o = clone(p); ['pack', 'key', 'version', 'savedAt', 'note'].forEach(function (k) { delete o[k]; }); return o; });
  }
  function build(o) {
    var W = o.W, data = o.data, L = o.lang || {}, vo = o.vo || { voices: {}, have: 0, total: 0 };
    // motionPacks phải giữ lại ở đây: dựng lại `data` mà bỏ nó thì bộ phát không nạp gói nào và phim mất các chương dùng đòn của gói
    var out = { parts: data.parts, motionPacks: o.motionPacks || [], soundPacks: o.soundPacks || [], project: W.project || '', characters: data.characters.map(function (a) {
        // giọng chốt sẵn lúc xuất (nhân vật chưa lưu giọng thì lấy giọng Studio đang dùng — không xuất persona; vai giọng luôn chốt, vì phim không có persona để đoán lại)
        var c = pick(a, ['id', 'pack', 'name', 'version', 'look', 'expressions', 'kind', 'voice', 'role']), vv = o.voiceOf ? o.voiceOf(a) : null;
        if (vv) { c.voice = Object.assign({}, c.voice || vv); if (!c.voice.role && vv.role) c.voice.role = vv.role; }
        return c;
      }),
      items: data.items.map(function (x) { return pick(x, ['id', 'name', 'type', 'rarity', 'equip']); }),
      scenes: data.scenes.map(function (x) { return pick(x, ['id', 'name', 'layers', 'deco', 'palette', 'time', 'weather', 'spots']); }),
      lang: L.lang, accent: L.accent, voices: vo.voices, voiceTotal: vo.total };   // ngôn ngữ phim + clip giọng AI theo khoá GC.film.clipKey + tổng số câu (nhãn "Giọng AI 19/31")
    var film = { title: W.title, logline: W.logline || '', dialog: o.dialog || 'auto', shots: W.shots.map(function (s) { return { id: s.id, title: s.title, description: s.description || '', scene: s.scene, cast: s.cast, event: s.event }; }) };
    // NGÔN NGỮ (ADR 0007): chữ của trình phát theo ngôn ngữ giao diện LÚC XUẤT (ui + dict nhúng kèm); lời thoại, tên phim = nội dung người dùng, giữ nguyên (CNS-224)
    return { srcs: o.srcs, data: out, film: film, ui: o.ui, dict: o.dict, have: vo.have, total: vo.total };
  }
  var API = { usedActions: usedActions, motionPacks: motionPacks, build: build };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.GCVPayload = API;
})(typeof window !== 'undefined' ? window : this);
