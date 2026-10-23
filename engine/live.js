/* gen-chibi engine — live 0.1: SÂN KHẤU SỐNG CỦA AGENT (Agent Live Stage, INT-21)
 * © 2026 Gen Labs — All rights reserved.
 *
 * Một nhân vật thực thể hoá mọi bước THẬT của một agent (hooks Claude Code / tool MCP live_event): nghĩ, đọc, tìm, sửa, chạy lệnh, test đỏ / xanh,
 * giao việc cho trợ lý, chờ người, lỗi, chạm giới hạn, phát hành. Lõi THUẦN DỮ LIỆU (không DOM) — chạy trong Node (server lọc sự kiện, test, ảnh
 * tĩnh) và trình duyệt (studio/live.js vẽ bằng DOM, chung hàm sample()).
 *   1. SỰ KIỆN   KINDS + cleanEvent(): kiểm dạng + LÀM SẠCH nhãn (redact) — không đường dẫn / lệnh / bí mật / email / chuỗi dài nào lọt qua
 *   2. ĐẠO DIỄN  director(): máy trạng thái + hàng đợi. Mỗi sự kiện → kế hoạch: đi tới khu → (lục túi lấy đạo cụ) → diễn → cảm xúc → (cất lại).
 *                TẤT ĐỊNH theo dãy (sự kiện, giờ đến): không Math.random, không đồng hồ thật — người gọi đưa giờ vào.
 *                Luật: không dịch chuyển tức thời (đổi kế hoạch giữa đường = đi tiếp từ CHỖ ĐANG ĐỨNG); gộp loạt (20 lần đọc / 2 s = một lần
 *                lục giá sách, càng lúc càng hài); thời gian đứng tối thiểu cho dễ đọc; chờ lâu leo thang (cà phê → đồng hồ → ngáp → ngủ gật);
 *                test đỏ liên tiếp leo thang (đổ mồ hôi → tóc dựng → vịt cao su → bình chữa cháy). Đạo cụ CHỈ ra từ túi đeo và về lại túi.
 *   3. VẼ        stage(asset): sample(t) → mô tả khung (tư thế đã trộn, đạo cụ, túi, màn hình các khu, trợ lý, bong bóng) · svg(t) chuỗi SVG.
 * Ngân sách (L-42): 1 diễn viên diễn đủ (khung xương, clip choreo dựng theo từng bước), ≤ 8 trợ lý ở tầng ảnh + thở (một transform / khung).
 */
(function (GC) {
  'use strict';
  function N_(id, vars) { return !vars ? id : id.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m; }); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ------------------------------------------------------------ 1. SỰ KIỆN + LÀM SẠCH */
  var KINDS = ['session_start', 'prompt', 'think', 'read', 'search', 'edit', 'write', 'run', 'test_run', 'test_pass', 'test_fail',
    'delegate_start', 'delegate_end', 'wait_user', 'error', 'limit', 'release', 'idle', 'stop'];
  var LABEL_MAX = 48;
  // câu tóm tắt mặc định theo loại (msgid — Studio dịch lúc hiển thị). Bậc leo thang: [bậc 0, bậc 1, bậc 2]
  var SUMMARY = {
    session_start: [N_('Sẵn sàng làm việc!')],
    prompt: [N_('Có tin nhắn mới!'), N_('Lại tin nữa…')],
    think: [N_('Để nghĩ đã…'), N_('Nghĩ sâu hơn…')],
    read: [N_('Đọc tài liệu'), N_('Thêm vài cuốn nữa…'), N_('Cả thư viện luôn!')],
    search: [N_('Đi tìm manh mối'), N_('Lục tung giá sách…'), N_('Nó ở đâu rồi?!')],
    edit: [N_('Sửa code'), N_('Gõ như bay…'), N_('Bàn phím bốc khói!')],
    write: [N_('Viết tệp mới'), N_('Viết tiếp…'), N_('Viết cả cuốn tiểu thuyết!')],
    run: [N_('Chạy lệnh'), N_('Chạy thêm lệnh…'), N_('Enter! Enter! Enter!')],
    test_run: [N_('Chạy test… hồi hộp quá'), N_('Lại chạy test…')],
    test_pass: [N_('Test xanh rồi!')],
    test_fail: [N_('Ối, test đỏ!'), N_('Lại đỏ nữa?!'), N_('Hỏi vịt cao su thôi…'), N_('CHÁY RỒI! Bình chữa cháy đâu!')],
    delegate_start: [N_('Gọi trợ lý tới giúp'), N_('Gọi thêm người!'), N_('Đội đủ người rồi!')],
    delegate_end: [N_('Trợ lý xong việc!')],
    wait_user: [N_('Chờ bạn trả lời'), N_('Vẫn đang chờ…'), N_('Buồn ngủ quá…'), N_('Khò khò…')],
    idle: [N_('Nghỉ một chút'), N_('Nghỉ thêm chút nữa…'), N_('Ngáp…'), N_('Khò khò…')],
    error: [N_('Ối! Có lỗi'), N_('Lại lỗi nữa…')],
    limit: [N_('Hết sức rồi… (chạm giới hạn)')],
    release: [N_('Phát hành! 3… 2… 1…')],
    stop: [N_('Xong phiên. Chào nhé!')]
  };
  // LUẬT LÀM SẠCH NHÃN (redact) — nhãn chỉ để tóm tắt việc đang làm, KHÔNG BAO GIỜ là nội dung tệp / lệnh / bí mật:
  //   R1 ký tự điều khiển, xuống dòng → khoảng trắng; NFC
  //   R2 cả nhãn TRÔNG NHƯ LỆNH (bắt đầu bằng tên chương trình dòng lệnh, hoặc có | && || ; $( ` > < $VAR) → bỏ cả nhãn (dùng câu mặc định)
  //   R3 từng từ: email → ẩn · URL → ẩn · đường dẫn (có / hoặc \, ~ , ./) → ẩn · tên tệp có đuôi (a.js) → ẩn · cờ dòng lệnh (-x / --y) → ẩn
  //   R4 từng từ trông như BÍ MẬT: tiền tố khoá (sk-, ghp_, gho_, github_pat_, xox?-, AKIA, AIza, eyJ, gcl_, Bearer), hex ≥ 16, chuỗi chữ+số ≥ 20,
  //      key=value / key:value với key là token / secret / password / passwd / pwd / apikey / api_key / auth → ẩn
  //   R5 chỉ giữ chữ (mọi ngôn ngữ), số, khoảng trắng và . , ! ? ' - : … ( ) — ký tự khác (dấu ngoặc nhọn, =, #, $, %, *…) bỏ
  //   R6 gộp khoảng trắng, cắt ≤ 48 ký tự (thêm …); rỗng / chỉ còn dấu ẩn → '' (người vẽ dùng câu mặc định theo loại)
  var CMD_RE = /^\s*(sudo|npm|npx|pnpm|yarn|node|deno|bun|git|gh|bash|sh|zsh|python3?|pip3?|uv|cargo|go|make|docker|kubectl|curl|wget|rm|mv|cp|cd|ls|cat|grep|rg|find|sed|awk|echo|export|chmod|chown|ssh|scp|tar|psql|mysql|ruby|java|mvn|gradle|dotnet|php|composer|terraform|aws|gcloud|az)\b/i;
  // tên chương trình KHÔNG lẫn với từ thường (không gồm go / make / find / cat…) theo sau là đối số, ở bất kỳ đâu trong nhãn → cũng là lệnh
  var CMD_ANY = /(^|[^\p{L}\p{N}_-])(sudo|npm|npx|pnpm|yarn|deno|bun|git|gh|bash|zsh|python3?|pip3?|cargo|docker|kubectl|curl|wget|rm|chmod|chown|ssh|scp|psql|mysql|mvn|gradle|dotnet|terraform|gcloud|pytest|jest|vitest)\s+\S/iu;
  var META_RE = /\||&&|;|\$\(|`|>|<|\$[A-Za-z_{]/;
  var SECRET_PREFIX = /^(sk-|sk_|pk_|rk_|ghp_|gho_|ghu_|ghs_|github_pat_|xox[abprs]-|AKIA|ASIA|AIza|eyJ|gcl_|glpat-|npm_|hf_)/;
  var SECRET_KV = /^(token|secret|password|passwd|pwd|apikey|api_key|api-key|auth|authorization|bearer|key|private_key|client_secret)[=:]/i;
  function redactWord(w) {
    if (!w) return w;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w)) return '';                                    // email
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(w) || /^www\./i.test(w)) return '';                   // URL
    if (/[\/\\]/.test(w) || /^~/.test(w) || /^\.\.?$/.test(w)) return '';                      // đường dẫn
    var bare = w.replace(/[.,!?:;…)'’]+$/, '').replace(/^[('‘]+/, '');
    if (/\w\.\w/.test(bare) && !/^v?\d+(\.\d+)+$/i.test(bare)) return '';                    // tên tệp / tên miền / thuộc tính (a.js, x.y.z) — giữ số phiên bản v1.2.3
    if (/^--?[A-Za-z]/.test(w)) return '';                                                     // cờ dòng lệnh
    if (SECRET_PREFIX.test(w) || /^bearer$/i.test(w) || SECRET_KV.test(w)) return '';           // bí mật
    var core = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (/^[0-9a-f]{16,}$/i.test(core)) return '';                                              // hex dài (băm, khoá)
    if (core.length >= 20 && /^[A-Za-z0-9_+=\/-]+$/.test(core) && /\d/.test(core) && /[A-Za-z]/.test(core)) return '';   // chuỗi ngẫu nhiên dài
    if (core.length >= 32) return '';                                                          // từ dài bất thường
    return w;
  }
  function cut(s, n) { var a = Array.from(s); return a.length > n ? a.slice(0, n - 1).join('').replace(/\s+$/, '') + '…' : s; }
  function redact(label) {
    if (typeof label !== 'string') return '';
    var s = label.slice(0, 2000).normalize ? label.slice(0, 2000).normalize('NFC') : label.slice(0, 2000);
    s = s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ');                           // R1
    if (CMD_RE.test(s) || CMD_ANY.test(s) || META_RE.test(s)) return '';                                          // R2
    var out = s.split(/\s+/).map(redactWord).filter(Boolean).join(' ');                        // R3 + R4
    out = out.replace(/[^\p{L}\p{M}\p{N} .,!?'’:…()-]/gu, '');                                 // R5
    out = out.replace(/\s+/g, ' ').replace(/^[\s.,:;-]+/, '').trim();
    if (!/[\p{L}\p{N}]/u.test(out)) return '';
    return cut(out, LABEL_MAX);                                                                // R6
  }
  function cleanTool(t) { return typeof t === 'string' ? t.replace(/[^A-Za-z0-9_.-]/g, '').replace(/^[^A-Za-z]+/, '').slice(0, 24) : ''; }
  // sự kiện từ ngoài (không tin) → { ev } hoặc { error }. Chỉ giữ khoá đã biết; giờ do SERVER đặt (ts), at của client chỉ giữ khi hợp lý
  function cleanEvent(raw, now) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: N_('sự kiện phải là object JSON') };
    if (typeof raw.kind !== 'string' || KINDS.indexOf(raw.kind) < 0) return { error: N_('kind không hợp lệ — một trong: {list}', { list: KINDS.join(', ') }) };
    if (raw.label !== undefined && typeof raw.label !== 'string') return { error: N_('label phải là chuỗi') };
    var ev = { kind: raw.kind, label: redact(raw.label || ''), tool: cleanTool(raw.tool), agent: redact(typeof raw.agent === 'string' ? raw.agent.slice(0, 40) : '').slice(0, 24) };
    if (typeof raw.at === 'number' && isFinite(raw.at) && now && Math.abs(raw.at - now) < 864e5) ev.at = Math.round(raw.at);
    return { ev: ev };
  }

  /* ------------------------------------------------------------ 2. SÂN KHẤU: KHU + ĐẠO CỤ */
  var W = 1280, H = 720, GROUND = 600, K = 1.15;                  // thế giới 1280×720 (16:9), chân diễn viên ở y = 600
  // x = chỗ đứng của diễn viên; dir = hướng mặt khi làm việc ở khu (−1 trái, 1 phải, 0 chính diện)
  var ZONES = {
    door: { x: 150, dir: -1, label: N_('Cửa') },
    shelf: { x: 330, dir: 0, label: N_('Giá sách') },
    desk: { x: 580, dir: -1, label: N_('Bàn làm việc') },
    lab: { x: 770, dir: 1, label: N_('Phòng test') },
    center: { x: 640, dir: 0, label: N_('Giữa sân khấu') },
    coffee: { x: 985, dir: 0, label: N_('Góc cà phê') },
    sofa: { x: 1085, dir: 0, label: N_('Sofa') },
    rocket: { x: 1160, dir: 1, label: N_('Bệ phóng') }
  };
  // đạo cụ: nguồn (túi đeo / giá sách) — mọi đạo cụ "bag" chỉ ra khỏi túi bằng bước takeOut và về túi bằng bước putBack
  var PROPS = {
    magnifier: { src: 'bag', label: N_('Kính lúp') },
    wrench: { src: 'bag', label: N_('Cờ lê') },
    mug: { src: 'bag', label: N_('Ly cà phê') },
    phone: { src: 'bag', label: N_('Điện thoại') },
    notebook: { src: 'bag', label: N_('Sổ tay') },
    hammer: { src: 'bag', label: N_('Búa') },
    extinguisher: { src: 'bag', label: N_('Bình chữa cháy') },
    duck: { src: 'bag', label: N_('Vịt cao su') },
    book: { src: 'shelf', label: N_('Sách (từ giá)') }
  };
  var BAG = Object.keys(PROPS).filter(function (k) { return PROPS[k].src === 'bag'; });
  var SPEED = { walk: 230, run: 430 };          // đơn vị thế giới / giây
  var MIN_DWELL = 1.2, MAX_DWELL = 5, HELPERS_MAX = 8;
  var PROP_AT = { lvRummage: 0.62, lvStow: 0.55, lvShelf: 0.5 };   // phần của bước lúc đạo cụ đổi tay (khớp clip trong kinds/character/gen.live.js)
  // lớp hành vi: cùng lớp = gộp vào việc đang làm (không làm lại từ đầu)
  var CLS = { read: 'shelf', search: 'shelf', edit: 'desk', write: 'desk', run: 'desk', test_run: 'lab', idle: 'rest', wait_user: 'rest' };
  var PRIO = { idle: 0, wait_user: 0, think: 1, read: 2, search: 2, edit: 2.5, write: 2.5, run: 2.5 };   // còn lại: 3 — sửa / chạy lệnh là việc chính của agent: không bị bỏ khi sân khấu chạy chậm hơn agent
  var MERGE = { shelf: 1, desk: 1, rest: 1, think: 1, prompt: 1 };   // lớp được gộp (test / giao việc / lỗi: mỗi lần một nhịp riêng — leo thang đếm từng lần)
  function prio(kind) { return own(PRIO, kind) ? PRIO[kind] : 3; }
  function clsOf(kind) { return own(CLS, kind) ? CLS[kind] : kind; }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }   // giả ngẫu nhiên tất định theo chỉ số

  /* ------------------------------------------------------------ 3. ĐẠO DIỄN */
  // d = director(); d.push(ev, at) · d.advance(t) · d.stepAt(t) · d.steps (lịch sử) · d.helpers · d.log (sự kiện → bước)
  function director(opts) {
    opts = opts || {};
    var D = { steps: [], helpers: [], log: [], queue: [], keep: opts.keep || 400 };
    var st = { x: opts.x0 != null ? opts.x0 : ZONES.center.x, dir: 1, prop: null, zone: 'center', failStreak: 0, testRuns: 0, idleSince: 0, nextHelper: 0 };
    var cur = null;          // bước đang chạy
    var act = null;          // hoạt động đang làm { kind, cls, count, level, intents: [], t0, evs, prio, performed }
    var seq = 0, evSeq = 0;
    D.state = st;

    function zoneAt(x) { var best = null, bd = 1e9; Object.keys(ZONES).forEach(function (z) { var d = Math.abs(ZONES[z].x - x); if (d < bd) { bd = d; best = z; } }); return bd < 24 ? best : null; }
    function bubbleOf(kind, level, label) {
      var L = SUMMARY[kind] || [''], id = L[Math.min(level, L.length - 1)];
      return { id: id, text: label && level === 0 ? label : '' };   // nhãn của agent (đã làm sạch) chỉ ở bậc đầu; leo thang = câu hài của sân khấu
    }
    function emit(s) {
      s.i = seq++;
      s.x0 = st.x; s.propIn = st.prop;
      if (s.type === 'walk') { s.dir = s.x1 > st.x ? 1 : -1; s.t1 = s.t0 + Math.abs(s.x1 - st.x) / SPEED[s.run ? 'run' : 'walk']; }
      else s.x1 = st.x;
      if (s.type === 'takeOut') { s.propOut = s.prop; } else if (s.type === 'putBack') { s.propOut = null; s.prop = st.prop; } else s.propOut = st.prop;
      if (s.dir == null) s.dir = st.dir;
      s.propSwitch = s.t0 + (s.t1 - s.t0) * (PROP_AT[s.clip] || 0.5);
      D.steps.push(s);
      if (D.steps.length > D.keep) D.steps.splice(0, D.steps.length - D.keep);
      cur = s;
      return s;
    }
    function finish(s, t) {     // bước kết thúc (bình thường hoặc bị cắt ở t) → cập nhật trạng thái
      if (t < s.t1) {
        if (s.type === 'walk') { s.x1 = s.x0 + (s.x1 - s.x0) * (t - s.t0) / Math.max(1e-6, s.t1 - s.t0); }
        s.t1 = t; s.cut = true;
        s.propSwitch = Math.min(s.propSwitch, t);
      }
      st.x = s.x1; st.dir = s.type === 'walk' ? s.dir : s.dir; st.prop = s.propOut; st.zone = zoneAt(st.x);
      cur = null;
    }
    // ---- hoạt động → ý định (intent). Ý định được mở thành bước LÚC bắt đầu (từ trạng thái lúc đó) → không bao giờ nhảy cóc
    function plan(kind, count, label, evs, t) {
      var I = [], lvl = 0, a = { kind: kind, cls: clsOf(kind), count: count, label: label, evs: evs, t0: t, prio: prio(kind), level: 0, intents: I };
      var need = null, zone = null, emo = 'work', clip = 'lvIdle', dwell = MIN_DWELL + 0.3, extra = {};
      switch (kind) {
        case 'session_start': zone = 'center'; clip = 'lvWave'; emo = 'proud'; dwell = 1.6; break;
        case 'prompt': need = 'phone'; clip = 'lvPhone'; emo = 'unsure'; dwell = 1.6; extra.after = 'putBack'; break;
        case 'think': clip = 'lvPonder'; emo = 'think'; dwell = 1.4; break;
        case 'read': zone = 'shelf'; need = 'book'; clip = 'lvRead'; emo = 'think'; break;
        case 'search': zone = 'shelf'; need = 'magnifier'; clip = 'lvMagnify'; emo = 'work'; break;
        case 'edit': zone = 'desk'; clip = 'lvType'; emo = 'work'; break;
        case 'write': zone = 'desk'; clip = 'lvType'; emo = 'vow'; extra.fast = true; break;
        case 'run': zone = 'desk'; clip = 'lvTypeEnter'; emo = 'vow'; dwell = 1.4; break;
        case 'test_run': zone = 'lab'; clip = 'lvLever'; emo = 'unsure'; dwell = 1.1; extra.then = { clip: 'lvWatch', emo: 'unsure', dwell: 1.2, dir: 0, noProp: true }; extra.world = 'running'; break;
        case 'test_pass': zone = 'lab'; clip = 'lvCheer'; emo = 'proud'; dwell = 1.6; extra.world = 'pass'; break;
        case 'test_fail':
          zone = 'lab'; lvl = Math.min(3, st.failStreak); extra.world = lvl >= 3 ? 'fire' : 'fail';
          if (lvl === 0) { clip = 'lvStartle'; emo = 'shock'; dwell = 0.9; extra.then = { clip: 'lvFacepalm', emo: 'cry', dwell: 1.2 }; }
          else if (lvl === 1) { clip = 'lvHeadGrab'; emo = 'panic'; dwell = 1.3; extra.then = { prop: 'hammer', clip: 'lvHammer', emo: 'rage', dwell: 1.3, dir: 1 }; }
          else if (lvl === 2) { clip = 'lvHeadGrab'; emo = 'panic'; dwell = 0.9; extra.then = { prop: 'duck', clip: 'lvDuck', emo: 'beg', dwell: 1.6 }; }
          else { clip = 'lvStartle'; emo = 'panic'; dwell = 0.8; extra.then = { prop: 'extinguisher', clip: 'lvSpray', emo: 'panic', dwell: 2.0, dir: 1, world: 'extinguish' }; }
          break;
        case 'delegate_start': zone = 'door'; need = 'phone'; clip = 'lvPhone'; emo = 'smug'; dwell = 1.3; extra.after = 'putBack'; extra.helper = 1; break;
        case 'delegate_end': clip = 'lvWave'; emo = 'proud'; dwell = 1.2; extra.helper = -1; break;
        case 'wait_user': case 'idle': zone = 'coffee'; need = 'mug'; clip = 'lvSip'; emo = kind === 'idle' ? 'normal' : 'lazy'; dwell = 2.4; extra.wait = true; break;
        case 'error': clip = 'lvStartle'; emo = 'shock'; dwell = 0.9; extra.then = { prop: 'wrench', clip: 'lvWrench', emo: 'vow', dwell: 1.4, dir: st.dir || 1 }; break;
        case 'limit': zone = 'sofa'; clip = 'lvDroop'; emo = 'exhausted'; dwell = 1.4; extra.then = { clip: 'lvSitDown', emo: 'exhausted', dwell: 0.7, dir: -1, noProp: true, seat: true }; extra.then2 = { clip: 'lvSlump', emo: 'exhausted', dwell: 2.2, dir: -1, seat: true }; break;
        case 'release': zone = 'rocket'; clip = 'lvPress'; emo = 'vow'; dwell = 1.0; extra.world = 'launch'; extra.then = { clip: 'lvCheer', emo: 'proud', dwell: 2.0, dir: 0 }; break;
        case 'stop': zone = 'center'; clip = 'lvBow'; emo = 'normal'; dwell = 1.6; extra.stowAll = true; break;
      }
      if (kind === 'read' || kind === 'search' || kind === 'edit' || kind === 'write' || kind === 'run') lvl = count >= 10 ? 2 : count >= 4 ? 1 : 0;
      if (kind === 'test_run') lvl = Math.min(1, st.testRuns);
      if (kind === 'delegate_start') lvl = D.helpers.filter(function (h) { return !h.tLeave; }).length >= HELPERS_MAX ? 2 : D.helpers.filter(function (h) { return !h.tLeave; }).length ? 1 : 0;
      a.level = lvl;
      // tay phải rảnh / đúng đồ trước khi đi
      I.push({ type: 'stow', keep: need });
      if (zone) I.push({ type: 'walk', zone: zone });
      if (need) I.push({ type: 'take', prop: need });
      a.mainI = { type: 'perform', clip: clip, emo: emo, dwell: Math.max(MIN_DWELL, dwell), fast: extra.fast, world: extra.world, main: true, dir: zone ? ZONES[zone].dir : null, need: need };
      I.push(Object.assign({ helper: extra.helper }, a.mainI));
      [extra.then, extra.then2].forEach(function (th) {
        if (!th) return;
        if (th.prop) { I.push({ type: 'stow', keep: th.prop }); I.push({ type: 'take', prop: th.prop }); }
        else if (th.noProp) I.push({ type: 'stow', keep: null });
        I.push({ type: 'perform', clip: th.clip, emo: th.emo, dwell: th.dwell, dir: th.dir, world: th.world, seat: th.seat });
        if (th.prop) I.push({ type: 'stow', keep: null });
      });
      if (extra.after === 'putBack' || extra.stowAll) I.push({ type: 'stow', keep: null });
      if (extra.wait) a.wait = true;
      if (kind === 'test_fail') st.failStreak++;
      if (kind === 'test_pass') st.failStreak = 0;
      if (kind === 'test_run') st.testRuns++;
      return a;
    }
    // ý định tiếp theo → bước (hoặc null nếu ý định không cần làm gì)
    function open(I, t) {
      if (I.type === 'noop') return null;
      var hurry = D.queue.length >= 2;   // việc dồn: lấy / cất đồ nhanh tay hơn, phản ứng ngắn lại (việc chính vẫn đủ thời gian đứng tối thiểu)
      if (I.type === 'stow') {
        if (!st.prop || st.prop === I.keep) return null;
        if (PROPS[st.prop].src === 'shelf') return emit({ type: 'putBack', t0: t, t1: t + (hurry ? 0.75 : 1.0), clip: 'lvShelf', back: true, dir: 0, emo: 'normal', act: act.kind });
        return emit({ type: 'putBack', t0: t, t1: t + (hurry ? 0.6 : 0.9), clip: 'lvStow', dir: 0, emo: 'normal', act: act.kind });
      }
      if (I.type === 'walk') {
        var x = ZONES[I.zone].x;
        if (Math.abs(x - st.x) < 2) return null;
        var hurry = D.queue.length >= 2 || Math.abs(x - st.x) > 700;
        return emit({ type: 'walk', t0: t, x1: x, run: hurry, clip: 'lvWalk', emo: act.prio >= 3 ? 'vow' : 'normal', act: act.kind, zone: I.zone });
      }
      if (I.type === 'take') {
        if (st.prop === I.prop) return null;
        if (PROPS[I.prop].src === 'shelf') return emit({ type: 'takeOut', t0: t, t1: t + (hurry ? 0.75 : 1.0), clip: 'lvShelf', prop: I.prop, dir: 0, emo: 'think', act: act.kind });
        return emit({ type: 'takeOut', t0: t, t1: t + (hurry ? 0.9 : 1.3), clip: 'lvRummage', prop: I.prop, dir: 0, emo: act.level >= 2 ? 'panic' : 'smug', act: act.kind, bagLevel: act.level });
      }
      // perform (việc chính của lớp gộp: bậc hài tính lại theo số sự kiện đã gộp tới lúc này)
      if (I.main && (act.cls === 'shelf' || act.cls === 'desk')) act.level = Math.max(act.level, act.count >= 10 ? 2 : act.count >= 4 ? 1 : 0);
      var dir = I.dir == null ? st.dir : I.dir;
      var s = emit({ type: 'perform', t0: t, t1: t + (I.main || !hurry ? I.dwell : Math.max(0.8, I.dwell * 0.7)), clip: I.clip, fast: I.fast || act.level >= 1, emo: I.emo, dir: dir, act: act.kind, level: act.level, main: !!I.main, seat: !!I.seat,
        bubble: I.main ? bubbleOf(act.kind, act.level, act.label) : act.level >= 1 || act.kind === 'test_fail' ? bubbleOf(act.kind, act.level, '') : null, world: I.world || null, count: act.count });
      if (I.main) act.performed = t;
      if (I.helper === 1) spawnHelper(t + 0.6, act.label);
      if (I.helper === -1) releaseHelper(t);
      return s;
    }
    function spawnHelper(t, label) {
      var live = D.helpers.filter(function (h) { return !h.tLeave; });
      if (live.length >= HELPERS_MAX) return;
      var used = live.map(function (h) { return h.slot; }), slot = 0; while (used.indexOf(slot) >= 0) slot++;
      var hx = HELPER_SPOTS[slot], d0 = ZONES.door.x;
      D.helpers.push({ id: st.nextHelper++, slot: slot, x0: d0, x1: hx, tIn: t, tArrive: t + Math.abs(hx - d0) / 180, tLeave: 0, tGone: 0, label: label || '', tint: slot });
    }
    function releaseHelper(t) {
      var live = D.helpers.filter(function (h) { return !h.tLeave; });
      if (!live.length) return;
      var h = live[0];
      h.tLeave = Math.max(t, h.tArrive); h.tGone = h.tLeave + Math.abs(h.x1 - ZONES.door.x) / 180;
    }
    D.helperAt = function (h, t) {
      if (t < h.tIn || (h.tGone && t >= h.tGone)) return null;
      var x, walking = false, dir = 1;
      if (t < h.tArrive) { x = h.x0 + (h.x1 - h.x0) * (t - h.tIn) / (h.tArrive - h.tIn); walking = true; dir = h.x1 > h.x0 ? 1 : -1; }
      else if (!h.tLeave || t < h.tLeave) x = h.x1;
      else { x = h.x1 + (ZONES.door.x - h.x1) * (t - h.tLeave) / (h.tGone - h.tLeave); walking = true; dir = ZONES.door.x > h.x1 ? 1 : -1; }
      return { id: h.id, x: x, walking: walking, dir: dir, slot: h.slot, tint: h.tint, arrived: !walking && t >= h.tArrive };
    };
    // ---- hàng đợi: gộp cùng lớp, trần 5 mục (bỏ mục ưu tiên thấp cũ nhất)
    D.push = function (ev, at) {
      var e = { id: ev.id != null ? ev.id : ++evSeq, kind: ev.kind, label: ev.label || '', at: at };
      D.log.push({ id: e.id, kind: e.kind, at: at, step: null, merged: false });
      if (D.log.length > D.keep * 2) D.log.splice(0, D.log.length - D.keep * 2);
      // đang làm đúng lớp này (và đã vào phần diễn chính) → gộp vào: thêm thời gian, tăng bậc hài
      if (act && !D.queue.length && act.cls === clsOf(e.kind) && MERGE[act.cls] && !act.done) {
        act.count++; act.evs.push(e.id); D.log[D.log.length - 1].merged = true;
        if (!act.wait) act.absorb = (act.absorb || 0) + 1;   // chờ thêm một lần "chờ" = vẫn đang chờ, không làm lại
        return;
      }
      var last = D.queue[D.queue.length - 1], c2 = clsOf(e.kind);
      if (last && last.cls === c2 && MERGE[c2] && (last.kind === e.kind || c2 === 'shelf' || c2 === 'desk' || c2 === 'rest')) {
        last.count++; last.evs.push(e.id); if (e.kind === 'run') last.kind = 'run'; D.log[D.log.length - 1].merged = true; return;
      }
      D.queue.push({ kind: e.kind, cls: clsOf(e.kind), count: 1, label: e.label, evs: [e.id], at: at, prio: prio(e.kind) });
      while (D.queue.length > 5) {
        var low = 0; D.queue.forEach(function (q, i) { if (q.prio < D.queue[low].prio) low = i; });   // bỏ việc ưu tiên thấp nhất (cũ nhất trong số đó)
        var gone = D.queue.splice(low, 1)[0], nxt = D.queue[Math.min(low, D.queue.length - 1)];
        if (nxt) nxt.evs = gone.evs.concat(nxt.evs);
      }
    };
    function startNext(t) {
      // việc ưu tiên thấp đã cũ (> 8 s) mà phía sau còn việc: bỏ qua cho sân khấu đuổi kịp agent (sự kiện vẫn ghi vào việc kế)
      while (D.queue.length > 1 && D.queue[0].prio < 2.5 && t - D.queue[0].at > 8) { var old = D.queue.shift(); D.queue[0].evs = old.evs.concat(D.queue[0].evs); }
      while (D.queue.length > 1 && D.queue[0].kind === 'think') { var th = D.queue.shift(); D.queue[0].evs = th.evs.concat(D.queue[0].evs); }   // nghĩ thoáng qua khi việc khác đã chờ
      var q = D.queue.shift();
      act = plan(q.kind, q.count, q.label, q.evs, t);
      st.idleSince = 0;
      q.evs.forEach(function (id) { var L = D.log.filter(function (x) { return x.id === id; })[0]; if (L && L.step == null) L.step = seq; });
    }
    // ---- tiếp diễn khi không có sự kiện: chờ / nghỉ leo thang theo thời gian; sau khi xong việc thì đứng thở
    function continuation(t) {
      var waitT = act && act.wait ? t - act.t0 : 0;
      if (act && act.wait) {
        var lv = waitT < 8 ? 0 : waitT < 16 ? 1 : waitT < 26 ? 2 : 3;
        act.level = lv;
        if (lv <= 2) {
          if (st.prop !== 'mug') { act.intents.push({ type: 'stow', keep: 'mug' }, { type: 'take', prop: 'mug' }); return null; }
          var C3 = ['lvSip', 'lvWatch', 'lvYawn'][lv];
          return emit({ type: 'perform', t0: t, t1: t + (lv === 2 ? 1.8 : 2.2), clip: C3, emo: ['lazy', 'unsure', 'lazy'][lv], dir: 0, act: act.kind, level: lv, bubble: bubbleOf(act.kind, lv, ''), wait: true });
        }
        // ngủ gật trên sofa: cất ly → đi tới sofa → ngồi → ngủ (lặp từng đoạn 4,4 s)
        if (st.prop) { act.intents.push({ type: 'stow', keep: null }); return null; }
        if (Math.abs(st.x - ZONES.sofa.x) > 2) { act.intents.push({ type: 'walk', zone: 'sofa' }); return null; }
        var prev = cur || D.steps[D.steps.length - 1];
        if (!prev || (prev.clip !== 'lvNap' && prev.clip !== 'lvSitDown')) return emit({ type: 'perform', t0: t, t1: t + 0.7, clip: 'lvSitDown', emo: 'sleep', dir: -1, act: act.kind, level: 3, seat: true, wait: true });
        return emit({ type: 'perform', t0: t, t1: t + 4.4, clip: 'lvNap', emo: 'sleep', dir: -1, act: act.kind, level: 3, bubble: bubbleOf(act.kind, 3, ''), seat: true, wait: true });
      }
      // không việc gì: đứng thở; quá 12 s → tự đi nghỉ (idle)
      if (!st.idleSince) st.idleSince = t;
      // phiên đã đóng (stop): đứng thở giữa sân khấu, không tự đi pha cà phê
      if (t - st.idleSince > 12 && !(act && act.kind === 'stop')) { D.queue.push({ kind: 'idle', cls: 'rest', count: 1, label: '', evs: [], at: t, prio: 0 }); return null; }
      var seat = !!(D.steps.length && D.steps[D.steps.length - 1].seat);
      return emit({ type: 'perform', t0: t, t1: t + 1.0, clip: seat ? 'lvSlump' : st.dir && !(act && act.kind === 'stop') ? 'lvIdleSide' : 'lvIdle', emo: act ? lastEmo() : 'normal', dir: st.dir, act: 'hold', seat: seat, hold: true });
    }
    function lastEmo() { for (var i = D.steps.length - 1; i >= 0; i--) if (D.steps[i].emo) return D.steps[i].emo === 'panic' ? 'dizzy' : D.steps[i].emo; return 'normal'; }
    // có việc mới đang chờ: bước hiện tại có được cắt không (và cắt ở đâu)?
    function cutAt(s, t) {
      var q = D.queue[0];
      if (!q) return null;
      var wake = s.clip === 'lvNap' || s.clip === 'lvSlump' || s.clip === 'lvSitDown';
      if (s.type === 'walk') return (act && act.prio < q.prio) || s.act === 'hold' ? t : null;   // đổi hướng giữa đường: đi tiếp từ chỗ đang đứng
      if (s.type !== 'perform') return null;                                                   // lấy / cất đồ: làm cho xong
      if (s.hold || s.wait || wake) return t;
      return Math.max(t, s.t0 + Math.min(s.t1 - s.t0, act && act.prio < q.prio ? 0.6 : MIN_DWELL));
    }
    // ---- chạy tới giờ t
    D.advance = function (t) {
      var guard = 0;
      while (guard++ < 5000) {
        if (cur) {
          // gộp: việc đang diễn được thêm sự kiện cùng lớp → kéo dài (trần MAX_DWELL), lên bậc thì cắt và diễn tiếp ở bậc mới
          if (act && act.absorb && cur.type === 'perform' && cur.main) {
            var lv = act.cls === 'shelf' || act.cls === 'desk' ? (act.count >= 10 ? 2 : act.count >= 4 ? 1 : 0) : act.level;
            var add = act.absorb * 0.5; act.absorb = 0;
            if (lv > act.level && cur.t1 > t) { act.level = lv; finish(cur, Math.max(t, cur.t0 + 0.4)); act.intents.unshift({ type: 'perform', clip: cur.clip, emo: lv >= 2 ? 'panic' : 'work', dwell: MIN_DWELL + 0.6, main: true, dir: cur.dir }); continue; }
            cur.t1 = Math.min(cur.t0 + MAX_DWELL, cur.t1 + add);
            if (cur.t1 < t) cur.t1 = t;
          }
          var c = cutAt(cur, t);
          if (c != null && c < cur.t1) {
            if (c > t) return;           // chưa tới lúc cắt
            if (cur.type === 'perform' && (cur.clip === 'lvNap' || cur.clip === 'lvSlump' || cur.clip === 'lvSitDown')) {
              finish(cur, t); act = act || { kind: 'hold', intents: [] };
              emit({ type: 'perform', t0: t, t1: t + 0.8, clip: 'lvWake', emo: 'shock', dir: -1, act: 'wake', bubble: { id: N_('Hả?! Có việc!'), text: '' } });
              act.intents = []; act.wait = false; continue;
            }
            finish(cur, c); if (act) { act.intents = []; act.wait = false; } continue;
          }
          if (cur.t1 > t) return;
          var tEnd = cur.t1; finish(cur, tEnd);
          continue;
        }
        var tn = D.steps.length ? Math.max(D.steps[D.steps.length - 1].t1, 0) : (opts.t0 || 0);
        if (tn > t) return;
        if (act && act.intents.length) { var nx = act.intents.shift(); open(nx, tn); continue; }
        // việc vừa xong mà trong lúc cất đồ / phản ứng lại có thêm sự kiện cùng lớp → diễn tiếp (đúng đồ, đúng chỗ), không đứng chơi
        if (act && act.absorb && act.mainI && !D.queue.length) { act.absorb = 0; act.intents.push({ type: 'stow', keep: act.mainI.need }, { type: act.mainI.need ? 'take' : 'noop', prop: act.mainI.need }, Object.assign({}, act.mainI, { world: null })); continue; }
        if (D.queue.length && D.queue[0].at <= t) { startNext(Math.max(tn, D.queue[0].at)); continue; }
        if (act && act.kind === 'stop' && !act.wait && st.prop == null) { /* phiên đã đóng: đứng thở */ }
        if (!continuation(tn)) { if (!cur && !D.queue.length && !(act && act.intents.length)) return; }
      }
    };
    D.stepAt = function (t) {
      for (var i = D.steps.length - 1; i >= 0; i--) if (D.steps[i].t0 <= t) return D.steps[i];
      return D.steps[0] || null;
    };
    D.prevOf = function (s) { var i = D.steps.indexOf(s); return i > 0 ? D.steps[i - 1] : null; };
    D.xAt = function (t) {
      var s = D.stepAt(t);
      if (!s) return st.x;
      if (s.type !== 'walk') return s.x0;
      var u = Math.max(0, Math.min(1, (t - s.t0) / Math.max(1e-6, s.t1 - s.t0)));
      return s.x0 + (s.x1 - s.x0) * u;
    };
    D.activity = function () { return act; };
    return D;
  }
  var HELPER_SPOTS = [700, 860, 420, 1010, 760, 470, 930, 240];

  /* ------------------------------------------------------------ 4. NHÂN VẬT AGENT + VẼ */
  // nhân vật đại diện agent: dựng từ ma-nơ-canh của bộ khung (mũ len xanh, áo hoodie cam) — không đăng ký vào thư viện
  function agentAsset(tint) {
    var base = GC.getAsset('gen.khung/ma-no-canh');
    if (!base) throw new Error('live: ' + N_('thiếu ma-nơ-canh của bộ khung'));
    var a = JSON.parse(JSON.stringify(base));
    a.id = tint == null ? 'live-agent' : 'live-helper-' + tint; a.key = 'gen.khung/' + a.id; a.name = tint == null ? 'Agent' : 'Helper';
    a.look.parts.outfit = 'gen.khung/khoi-ao'; a.look.parts.shoes = 'gen.khung/khoi-giay'; a.look.parts.hat = 'gen.khung/khoi-mu';
    var HUE = ['#4FB57A', '#8C86E0', '#2BB3A3', '#D9708F', '#B97BD0', '#E0A43A', '#5B9BD5', '#8DA65A'];
    a.look.palette = { skin: '#f6d6b8', skinShade: '#e3b896', robe: tint == null ? '#e8833a' : HUE[tint % HUE.length], inner: '#fff3e0', trim: tint == null ? '#9a4d17' : '#3b3b44',
      hat: tint == null ? '#3b6fb6' : '#f2f2f2', boots: '#3d3d48', pants: '#4a5a7a', hair: '#3a2a20', accent: '#ffd23f', iris: '#2a4a7a', blush: '#f3a7a0' };
    return a;
  }
  var INK = '#2b211d';
  var f1 = function (v) { return (Math.round(v * 10) / 10).toString(); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // đạo cụ trong tay phải: vẽ ở toạ độ khung, điểm nắm 128,193, dựng đứng (wR của tư thế giữ cho đứng thẳng)
  var Sw = function (w) { return ' stroke="' + INK + '" stroke-width="' + w + '" stroke-linejoin="round"'; }, S = Sw(2);
  var PROP_ART = {
    magnifier: '<rect x="125" y="176" width="6" height="26" rx="3" fill="#7a4b2a"' + S + '/><circle cx="128" cy="160" r="15" fill="#cfeaff" fill-opacity="0.75"' + Sw(3.2) + '/><path d="M120,154 Q124,149 130,149" stroke="#fff" stroke-width="2" fill="none"/>',
    wrench: '<rect x="125" y="160" width="6" height="42" rx="2" fill="#9aa3ad"' + S + '/><path d="M118,162 L118,146 L124,152 L132,152 L138,146 L138,162 L132,168 L124,168 Z" fill="#c3cad1"' + S + '/>',
    mug: '<path d="M117,180 L139,180 L137,204 L119,204 Z" fill="#f4f1ea"' + S + '/><path d="M139,185 Q148,186 146,194 Q144,200 138,199" fill="none"' + S + '/><rect x="118" y="186" width="20" height="5" fill="#e8833a"/><path d="M124,176 Q121,170 125,165 M132,176 Q129,169 133,163" stroke="#b9b2a8" stroke-width="1.6" fill="none" opacity="0.8"/>',
    phone: '<rect x="120" y="170" width="16" height="30" rx="3" fill="#2f3440"' + S + '/><rect x="122.5" y="174" width="11" height="20" rx="1" fill="#8fd3ff"/>',
    notebook: '<rect x="112" y="172" width="30" height="34" rx="2" fill="#3b6fb6"' + S + '/><rect x="116" y="176" width="22" height="26" fill="#fffbe8"/><path d="M119,182 L135,182 M119,187 L135,187 M119,192 L131,192" stroke="#9db0c8" stroke-width="1.2"/>',
    hammer: '<rect x="125" y="150" width="6" height="52" rx="2" fill="#a0683c"' + S + '/><rect x="112" y="138" width="32" height="15" rx="3" fill="#8e959c"' + S + '/>',
    extinguisher: '<rect x="114" y="150" width="28" height="56" rx="10" fill="#e23b2e"' + S + '/><rect x="122" y="140" width="12" height="12" fill="#3d3d48"' + S + '/><path d="M134,144 Q154,140 158,128" fill="none" stroke="' + INK + '" stroke-width="3.4"/><rect x="118" y="168" width="20" height="10" fill="#fff" opacity="0.85"/>',
    duck: '<ellipse cx="128" cy="186" rx="15" ry="11" fill="#ffd23f"' + S + '/><circle cx="121" cy="170" r="9" fill="#ffd23f"' + S + '/><path d="M112,170 L105,172 L112,175 Z" fill="#ff8a1f"' + Sw(1.4) + '/><circle cx="119" cy="168" r="1.6" fill="' + INK + '"/>',
    book: '<rect x="108" y="168" width="40" height="30" rx="2" fill="#c0392b"' + S + '/><rect x="111" y="171" width="34" height="24" fill="#fff7e6"/><path d="M128,171 L128,195" stroke="' + INK + '" stroke-width="1.4"/><path d="M114,177 L125,177 M114,182 L125,182 M131,177 L142,177 M131,182 L142,182" stroke="#b9a98f" stroke-width="1"/>'
  };
  // túi đeo chéo: dây qua thân (khớp body), túi ở hông phải; mở nắp khi lục / cất
  function satchelArt(view, open, lvl) {
    var side = /90$/.test(view), back = view === 'back';
    if (back) return '<path d="M84,156 L124,206" stroke="#7a4b2a" stroke-width="5" stroke-linecap="round"/>';
    var bx = side ? 100 : 112, strap = side ? '<path d="M110,152 L114,196" stroke="#7a4b2a" stroke-width="5" stroke-linecap="round"/>' : '<path d="M80,154 L126,198" stroke="#7a4b2a" stroke-width="5" stroke-linecap="round"/><path d="M80,154 L126,198" stroke="#a36a3c" stroke-width="2" stroke-linecap="round"/>';
    var bag = '<rect x="' + bx + '" y="194" width="30" height="24" rx="5" fill="#a36a3c"' + S + '/><rect x="' + (bx + 12) + '" y="206" width="6" height="5" rx="1" fill="#ffd23f" stroke="' + INK + '" stroke-width="1"/>';
    var flap = open ? '<path d="M' + bx + ',196 L' + (bx + 30) + ',196 L' + (bx + 36) + ',184 L' + (bx - 4) + ',184 Z" fill="#8a5530"' + S + '/>' +
      (lvl >= 2 ? '<g opacity="0.9"><path d="M' + (bx + 6) + ',186 l-8,-14" stroke="' + INK + '" stroke-width="1.6"/><circle cx="' + (bx - 3) + '" cy="170" r="3" fill="#ffd23f"/><path d="M' + (bx + 24) + ',186 l9,-16" stroke="' + INK + '" stroke-width="1.6"/></g>' : '')
      : '<path d="M' + bx + ',196 Q' + (bx + 15) + ',204 ' + (bx + 30) + ',196 L' + (bx + 30) + ',194 L' + bx + ',194 Z" fill="#8a5530"' + S + '/>';
    return strap + bag + flap;
  }

  // ---- phông sân khấu (tĩnh) + phần động của từng khu
  function bookColors(i) { return ['#c0392b', '#3b6fb6', '#4FB57A', '#E0A43A', '#8C86E0', '#2BB3A3', '#D9708F', '#7a4b2a'][i % 8]; }
  function backdropSVG() {
    var s = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#f3ead9"/>' +
      '<rect x="0" y="0" width="' + W + '" height="70" fill="#e9dcc4"/><path d="M0,70 L' + W + ',70" stroke="#d6c4a5" stroke-width="3"/>' +
      '<rect x="0" y="' + (GROUND - 6) + '" width="' + W + '" height="' + (H - GROUND + 6) + '" fill="#c99a6b"/>';
    for (var i = 0; i < 16; i++) s += '<path d="M' + (i * 84) + ',' + (GROUND - 6) + ' L' + (i * 84 - 60) + ',' + H + '" stroke="#b88a5c" stroke-width="2"/>';
    s += '<rect x="0" y="' + (GROUND - 10) + '" width="' + W + '" height="6" fill="#a87b50"/>';
    // cửa (trợ lý ra vào)
    s += '<rect x="40" y="300" width="96" height="' + (GROUND - 306) + '" fill="#6b4a33" stroke="' + INK + '" stroke-width="3"/>';
    // giá sách
    s += '<rect x="230" y="200" width="200" height="' + (GROUND - 206) + '" fill="#8a5a36" stroke="' + INK + '" stroke-width="3"/>';
    for (var r = 0; r < 4; r++) s += '<rect x="240" y="' + (212 + r * 96) + '" width="180" height="84" fill="#5e3d24"/>';
    // bàn + máy tính
    s += '<rect x="420" y="470" width="140" height="14" rx="3" fill="#7a4b2a" stroke="' + INK + '" stroke-width="3"/><rect x="430" y="484" width="12" height="110" fill="#6b4226"/><rect x="540" y="484" width="12" height="110" fill="#6b4226"/>' +
      '<rect x="452" y="452" width="56" height="10" rx="2" fill="#d9d9de" stroke="' + INK + '" stroke-width="2"/>' +
      '<rect x="470" y="436" width="14" height="22" fill="#444"/><rect x="430" y="360" width="96" height="78" rx="6" fill="#2f3440" stroke="' + INK + '" stroke-width="3"/>' +
      '<rect x="560" y="520" width="44" height="12" rx="4" fill="#3b3b44"/><rect x="578" y="532" width="8" height="40" fill="#3b3b44"/><rect x="566" y="572" width="32" height="8" rx="3" fill="#3b3b44"/>';
    // phòng test: bàn thí nghiệm + màn hình lớn + cần gạt
    s += '<rect x="820" y="250" width="200" height="130" rx="10" fill="#1f2430" stroke="' + INK + '" stroke-width="4"/><rect x="914" y="380" width="12" height="60" fill="#555b66"/>' +
      '<rect x="810" y="500" width="160" height="16" rx="3" fill="#9aa3ad" stroke="' + INK + '" stroke-width="3"/><rect x="822" y="516" width="12" height="80" fill="#7f8790"/><rect x="946" y="516" width="12" height="80" fill="#7f8790"/>' +
      '<path d="M845,500 L845,470 L875,470 L875,500" fill="#cfd6dd" stroke="' + INK + '" stroke-width="2"/><circle cx="900" cy="488" r="8" fill="#4FB57A" stroke="' + INK + '" stroke-width="2"/><circle cx="925" cy="488" r="8" fill="#e23b2e" stroke="' + INK + '" stroke-width="2"/>';
    // góc cà phê + sofa
    s += '<rect x="940" y="440" width="70" height="154" rx="6" fill="#5c6670" stroke="' + INK + '" stroke-width="3"/><rect x="952" y="452" width="46" height="34" rx="4" fill="#2f3440"/><rect x="963" y="520" width="24" height="26" fill="#1f2430"/>' +
      '<rect x="1030" y="500" width="150" height="56" rx="16" fill="#3b6fb6" stroke="' + INK + '" stroke-width="3"/><rect x="1024" y="470" width="162" height="40" rx="16" fill="#4a7fc8" stroke="' + INK + '" stroke-width="3"/><rect x="1020" y="512" width="22" height="70" rx="8" fill="#355f9e" stroke="' + INK + '" stroke-width="3"/><rect x="1168" y="512" width="22" height="70" rx="8" fill="#355f9e" stroke="' + INK + '" stroke-width="3"/>';
    // bệ phóng + nút đỏ
    s += '<rect x="1200" y="560" width="70" height="34" fill="#6b717a" stroke="' + INK + '" stroke-width="3"/><rect x="1186" y="500" width="10" height="80" fill="#3b3b44"/><circle cx="1191" cy="496" r="10" fill="#e23b2e" stroke="' + INK + '" stroke-width="3"/>';
    // biển tên khu (nhỏ, chữ do Studio đặt — ở đây chỉ vạch màu)
    return s;
  }
  // phần động (tuỳ thời gian): sách trên giá (khuyết khi đang cầm), màn hình máy tính, màn hình test, cửa mở, tên lửa, lửa / bọt
  function worldState(D, t) {
    var s = D.stepAt(t), ws = { desk: 'off', lab: 'idle', labT: 0, door: 0, rocket: 0, fire: 0, foam: 0, bookOut: false, books: 0 };
    if (!s) return ws;
    var held = propHeld(s, t);
    ws.bookOut = held === 'book';
    // màn hình máy tính: code khi gõ, terminal khi chạy lệnh
    for (var i = D.steps.length - 1; i >= 0 && i >= D.steps.length - 60; i--) {
      var q = D.steps[i]; if (q.t0 > t) continue;
      if (ws.desk === 'off' && (q.clip === 'lvType' || q.clip === 'lvTypeEnter')) ws.desk = q.t1 > t - 6 ? (q.clip === 'lvTypeEnter' ? 'term' : 'code') : 'off';
      if (ws.lab === 'idle' && q.world && /running|pass|fail|fire|extinguish/.test(q.world)) { ws.lab = q.world === 'extinguish' ? 'fail' : q.world; ws.labT = t - q.t0; if (q.world === 'fire' || (q.world === 'extinguish' && t < q.t1)) ws.fire = 1; if (q.world === 'extinguish') { ws.foam = t < q.t1 ? 1 : Math.max(0, 1 - (t - q.t1) / 1.5); ws.fire = t < q.t1 ? Math.max(0, 1 - (t - q.t0) / (q.t1 - q.t0)) : 0; } }
      if (!ws.rocket && q.world === 'launch') ws.rocket = Math.max(0.001, t - q.t0);
      if (q.act === 'shelf-burst') ws.books = 1;
    }
    if (ws.lab === 'fire' && ws.labT > 0) ws.fire = 1;
    // cửa mở khi có trợ lý đi qua
    D.helpers.forEach(function (h) { var a = D.helperAt(h, t); if (a && a.walking && Math.abs(a.x - ZONES.door.x) < 90) ws.door = Math.max(ws.door, 1 - Math.abs(a.x - ZONES.door.x) / 90); });
    return ws;
  }
  function propHeld(s, t) { if (!s) return null; if (s.type === 'takeOut') return t >= s.propSwitch ? s.propOut : s.propIn; if (s.type === 'putBack') return t >= s.propSwitch ? null : s.propIn; return s.propIn; }
  function dynamicSVG(ws, t) {
    var s = '';
    // sách: 4 tầng × 8 cuốn, cuốn số 10 vắng khi đang cầm
    for (var r = 0; r < 4; r++) for (var b = 0; b < 8; b++) {
      var n = r * 8 + b; if (ws.bookOut && n === 10) continue;
      var hgt = 58 + (n * 37 % 22), x = 246 + b * 21.5;
      s += '<rect x="' + f1(x) + '" y="' + (296 + r * 96 - hgt) + '" width="18" height="' + hgt + '" fill="' + bookColors(n) + '" stroke="' + INK + '" stroke-width="1.5"/>';
    }
    // màn hình máy tính
    if (ws.desk === 'code') { s += '<rect x="437" y="367" width="82" height="64" fill="#1b2b3a"/>'; for (var l = 0; l < 6; l++) { var w2 = 20 + ((l * 13 + Math.floor(t * 6)) % 7) * 7; s += '<rect x="' + (443 + (l % 3) * 6) + '" y="' + (373 + l * 9) + '" width="' + w2 + '" height="4" fill="' + ['#8fd3ff', '#ffd23f', '#4FB57A'][l % 3] + '"/>'; } }
    else if (ws.desk === 'term') { s += '<rect x="437" y="367" width="82" height="64" fill="#111"/>'; for (var l2 = 0; l2 < 5; l2++) s += '<rect x="443" y="' + (373 + l2 * 10) + '" width="' + (16 + ((l2 * 29) % 40)) + '" height="4" fill="#4FB57A"/>'; if (Math.floor(t * 2) % 2) s += '<rect x="443" y="423" width="7" height="5" fill="#4FB57A"/>'; }
    else s += '<rect x="437" y="367" width="82" height="64" fill="#3c4352"/>';
    // màn hình test lớn
    var L = ws.lab;
    if (L === 'running') { var p = Math.min(1, ws.labT / 2.4); s += '<rect x="836" y="300" width="168" height="26" rx="4" fill="#3c4352"/><rect x="836" y="300" width="' + f1(168 * p) + '" height="26" rx="4" fill="#ffd23f"/>' + spinner(920, 350, t); }
    else if (L === 'pass') s += '<rect x="828" y="258" width="184" height="114" rx="6" fill="#1f6b3a"/><path d="M880,315 L908,342 L962,285" fill="none" stroke="#c8ffd8" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (L === 'fail' || L === 'fire') s += '<rect x="828" y="258" width="184" height="114" rx="6" fill="' + (Math.floor(t * 4) % 2 ? '#7a1f1f' : '#a52a2a') + '"/><path d="M890,285 L950,345 M950,285 L890,345" stroke="#ffd0d0" stroke-width="12" stroke-linecap="round"/>';
    else s += '<rect x="828" y="258" width="184" height="114" rx="6" fill="#2a3040"/><circle cx="920" cy="315" r="16" fill="none" stroke="#4a5568" stroke-width="4"/>';
    if (ws.fire > 0.01) s += flames(920, 254, ws.fire, t);
    if (ws.foam > 0.01) s += foam(900, 320, ws.foam, t);
    // cửa mở (cánh cửa hẹp lại khi mở)
    var dw = 90 * (1 - 0.8 * ws.door);
    s += '<rect x="43" y="303" width="' + f1(dw) + '" height="' + (GROUND - 312) + '" fill="#a0683c" stroke="' + INK + '" stroke-width="2"/><circle cx="' + f1(43 + dw - 12) + '" cy="' + (GROUND - 150) + '" r="5" fill="#ffd23f" stroke="' + INK + '" stroke-width="1.5"/>';
    // tên lửa
    var rk = ws.rocket, ry = rk ? Math.max(-700, -(rk > 0.6 ? Math.pow(rk - 0.6, 2) * 260 : 0)) : 0, shake = rk && rk < 0.8 ? Math.sin(t * 80) * 2 : 0;
    s += '<g transform="translate(' + f1(1235 + shake) + ' ' + f1(560 + ry) + ')"><path d="M0,-120 Q22,-90 20,-10 L-20,-10 Q-22,-90 0,-120 Z" fill="#f2f2f2" stroke="' + INK + '" stroke-width="3"/><circle cx="0" cy="-70" r="9" fill="#8fd3ff" stroke="' + INK + '" stroke-width="2.5"/><path d="M-20,-30 L-34,0 L-18,-10 Z M20,-30 L34,0 L18,-10 Z" fill="#e23b2e" stroke="' + INK + '" stroke-width="2.5"/>' +
      (rk ? '<path d="M-12,-8 Q0,' + f1(40 + 20 * Math.sin(t * 30)) + ' 12,-8 Z" fill="#ffb020" stroke="#ff6a00" stroke-width="2"/>' : '') + '</g>';
    if (rk && rk < 3) for (var c = 0; c < 6; c++) s += '<circle cx="' + f1(1235 + (hash(c) - 0.5) * 80 * Math.min(1, rk)) + '" cy="' + f1(585 - rk * 12 * hash(c + 3)) + '" r="' + f1(10 + 20 * Math.min(1, rk) * hash(c + 7)) + '" fill="#e9e4dc" opacity="' + f1(Math.max(0, 0.9 - rk / 3)) + '"/>';
    return s;
  }
  function spinner(cx, cy, t) { var a = t * 360 % 360; return '<g transform="rotate(' + f1(a) + ' ' + cx + ' ' + cy + ')"><path d="M' + cx + ',' + (cy - 16) + ' A16,16 0 1,1 ' + (cx - 16) + ',' + cy + '" fill="none" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/></g>'; }
  function flames(cx, cy, k, t) {
    var s = '';
    for (var i = 0; i < 5; i++) { var x = cx - 70 + i * 35, hgt = (40 + 25 * Math.sin(t * 9 + i * 2)) * k; s += '<path d="M' + f1(x - 16) + ',' + cy + ' Q' + f1(x - 8) + ',' + f1(cy - hgt * 0.6) + ' ' + f1(x) + ',' + f1(cy - hgt) + ' Q' + f1(x + 8) + ',' + f1(cy - hgt * 0.6) + ' ' + f1(x + 16) + ',' + cy + ' Z" fill="#ff8a1f" stroke="#e23b2e" stroke-width="2" opacity="' + f1(0.9 * k) + '"/>'; }
    return s;
  }
  function foam(cx, cy, k, t) { var s = ''; for (var i = 0; i < 9; i++) s += '<circle cx="' + f1(cx + (hash(i) - 0.5) * 160 + Math.sin(t * 5 + i) * 6) + '" cy="' + f1(cy + (hash(i + 9) - 0.5) * 90) + '" r="' + f1(14 + 16 * hash(i + 4)) + '" fill="#ffffff" stroke="#cfe3f0" stroke-width="2" opacity="' + f1(0.9 * k) + '"/>'; return s; }

  // ---- diễn viên: mỗi bước một dòng thời gian choreo (tại chỗ), trộn 0,22 s đầu với tư thế cuối của bước trước → không "giật" tư thế
  var BLEND = 0.22;
  function stage(asset, D, o) {
    o = o || {};
    var C = GC.choreo, A = asset || agentAsset(), cache = {}, order = [], bl = o.blend != null ? o.blend : BLEND;
    function faceOf(emo) { var s = GC.LIB.states[emo] || GC.LIB.states.normal; return { eyes: s.eyes, brows: s.brows, mouth: s.mouth, fx: (s.fx || []).slice(0, 3) }; }
    function tlOf(s) {
      var key = s.i + ':' + (s.t1 - s.t0).toFixed(3);
      if (cache[key]) return cache[key];
      var dur = Math.max(0.3, Math.min(170, s.t1 - s.t0)), dir = s.dir === 0 ? 1 : s.dir || 1;
      var step = { clip: s.clip, dur: dur, fast: !!s.fast, run: !!s.run, back: !!s.back, dir: dir, face: faceOf(s.emo || 'normal') };
      var tl = C.build(A, { steps: [step], x0: 0, dir: dir, scale: K, ground: GROUND, world: W });
      cache[key] = tl; order.push(key);
      while (order.length > 24) delete cache[order.shift()];
      return tl;
    }
    function poseLerp(P, Q, w) {
      var o2 = {};
      for (var j in Q) { var p = P[j] || Q[j], q = Q[j]; o2[j] = { x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w, rot: p.rot + (q.rot - p.rot) * w, sx: p.sx + (q.sx - p.sx) * w, sy: p.sy + (q.sy - p.sy) * w }; }
      return o2;
    }
    function frameOf(s, t) {
      var tl = tlOf(s), u = Math.max(0, Math.min(tl.T, t - s.t0));
      return C.finalAt(tl, u, 0);
    }
    function sample(t) {
      var s = D.stepAt(t);
      if (!s) return null;
      var F = frameOf(s, t), pose = F.pose, layers = F.layers, view = F.view, sig = F.sig, prev = D.prevOf(s), du = t - s.t0;
      if (prev && bl > 0 && du < bl) {
        var Fp = frameOf(prev, prev.t1), w = du / bl, e = w * w * (3 - 2 * w);
        var mirror = function (f) { return f.pose.root.sx < 0; };
        if (mirror(Fp) === mirror(F)) pose = poseLerp(Fp.pose, F.pose, e);
        if (e < 0.5) { layers = Fp.layers; view = Fp.view; sig = Fp.sig; }
      }
      var x = D.xAt(t), seatLift = 0;
      var held = propHeld(s, t), bagOpen = (s.type === 'takeOut' && s.clip === 'lvRummage') || (s.type === 'putBack' && s.clip === 'lvStow');
      var bub = null;
      for (var i = D.steps.indexOf(s); i >= 0 && i > D.steps.indexOf(s) - 6; i--) { var q = D.steps[i]; if (q.bubble && t - q.t0 < 3.2) { bub = { id: q.bubble.id, text: q.bubble.text, t0: q.t0, kind: q.act, level: q.level || 0 }; break; } }
      var helpers = [];
      D.helpers.forEach(function (h) { var a = D.helperAt(h, t); if (a) helpers.push(a); });
      return { t: t, step: s, pose: pose, layers: layers, view: view, sig: sig, x: x, y: GROUND - seatLift, K: K, prop: held, bagOpen: bagOpen, bagLevel: s.bagLevel || 0, bubble: bub, helpers: helpers, world: worldState(D, t), emo: s.emo };
    }
    // diễn viên → chuỗi SVG (lớp vẽ của engine + túi đeo sau lớp thân + đạo cụ trước bàn tay phải)
    function actorSVG(F) {
      var chain = GC.chainTransforms(F.pose), out = '';
      GC.RIG.layers.forEach(function (l) {
        if (F.layers[l[0]]) out += '<g transform="' + chain[l[1]] + '">' + F.layers[l[0]] + '</g>';
        if (l[0] === 'body') out += '<g transform="' + chain.body + '">' + satchelArt(F.view, F.bagOpen, F.bagLevel) + '</g>';
        if (l[0] === 'heldR' && F.prop && PROP_ART[F.prop]) out += '<g transform="' + chain.handR + '">' + PROP_ART[F.prop] + '</g>';
      });
      return '<g transform="translate(' + f1(F.x - 100 * K) + ' ' + f1(F.y - 228 * K) + ') scale(' + K + ')">' + out + '</g>';
    }
    function helperSVG(h, t, imageOf) {
      var k = 0.62, bob = h.walking ? Math.abs(Math.sin(t * 9 + h.id)) * 5 : Math.sin(t * 2.2 + h.id) * 1.2, sy = h.walking ? 1 : 1 + Math.sin(t * 2.2 + h.id) * 0.012;
      var img = imageOf ? imageOf(h) : '';
      // ảnh SVG của nhân vật: hộp RIG.box (−24, −18, 248 × 258), chân ở (100, 228)
      return '<g transform="translate(' + f1(h.x) + ' ' + f1(GROUND - 34 - bob) + ') scale(' + (h.dir < 0 ? -k : k) + ' ' + f1(k * sy) + ')"><ellipse cx="0" cy="2" rx="40" ry="7" fill="rgba(20,24,22,.18)"/>' +
        (img ? '<image href="' + img + '" x="-124" y="-246" width="248" height="258"/>' : '<circle cx="0" cy="-130" r="60" fill="#ccc"/>') + '</g>';
    }
    function bubbleSVG(F, text) {
      if (!text) return '';
      var w = Math.min(420, 30 + Array.from(text).length * 11.5), bx = Math.max(10, Math.min(W - w - 10, F.x - w / 2)), by = F.y - 270 * K - 70;
      return '<g class="lv-bubble"><rect x="' + f1(bx) + '" y="' + f1(by) + '" width="' + f1(w) + '" height="46" rx="20" fill="#fff" stroke="' + INK + '" stroke-width="3"/>' +
        '<path d="M' + f1(F.x - 10) + ',' + f1(by + 44) + ' L' + f1(F.x) + ',' + f1(by + 62) + ' L' + f1(F.x + 10) + ',' + f1(by + 44) + ' Z" fill="#fff" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/><rect x="' + f1(F.x - 12) + '" y="' + f1(by + 40) + '" width="24" height="6" fill="#fff"/>' +
        '<text x="' + f1(bx + w / 2) + '" y="' + f1(by + 30) + '" text-anchor="middle" font-family="system-ui, sans-serif" font-size="23" font-weight="600" fill="' + INK + '">' + esc(text) + '</text></g>';
    }
    // khung SVG hoàn chỉnh (Node / ảnh tĩnh / test). tr(msgid) dịch bong bóng; imageOf(helper) → URL ảnh trợ lý (tuỳ chọn)
    function svg(t, opt) {
      opt = opt || {};
      var F = sample(t);
      if (!F) return '';
      var tx = F.bubble ? (F.bubble.text || (opt.tr ? opt.tr(F.bubble.id) : F.bubble.id)) : '';
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"' + (opt.size ? ' width="' + opt.size + '" height="' + Math.round(opt.size * H / W) + '"' : '') + '>' +
        backdropSVG() + dynamicSVG(F.world, t) + F.helpers.map(function (h) { return helperSVG(h, t, opt.imageOf); }).join('') +
        '<ellipse cx="' + f1(F.x) + '" cy="' + (GROUND + 2) + '" rx="' + f1(44 * K) + '" ry="' + f1(8 * K) + '" fill="rgba(20,24,22,.22)"/>' + actorSVG(F) + bubbleSVG(F, tx) + '</svg>';
    }
    return { sample: sample, svg: svg, actorSVG: actorSVG, helperSVG: helperSVG, bubbleSVG: bubbleSVG, asset: A, tlOf: tlOf };
  }

  // ---- dòng sự kiện ghi sẵn (JSONL: { kind, label?, tool?, dt } — dt = giây sau sự kiện trước) → [{ ev, at }]
  function parseJSONL(text) {
    var out = [], at = 0;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line || line[0] === '#') return;
      var j; try { j = JSON.parse(line); } catch (e) { return; }
      var c = cleanEvent(j); if (!c.ev) return;
      at += typeof j.dt === 'number' && j.dt >= 0 && j.dt < 600 ? j.dt : 0.5;
      out.push({ ev: c.ev, at: at });
    });
    return out;
  }

  GC.live = {
    KINDS: KINDS, SUMMARY: SUMMARY, ZONES: ZONES, PROPS: PROPS, BAG: BAG, SPEED: SPEED, MIN_DWELL: MIN_DWELL, MAX_DWELL: MAX_DWELL, HELPERS_MAX: HELPERS_MAX, W: W, H: H, GROUND: GROUND, K: K, LABEL_MAX: LABEL_MAX,
    redact: redact, cleanEvent: cleanEvent, director: director, stage: stage, agentAsset: agentAsset, parseJSONL: parseJSONL,
    backdropSVG: backdropSVG, dynamicSVG: dynamicSVG, worldState: worldState, propHeld: propHeld, PROP_ART: PROP_ART, satchelArt: satchelArt
  };
})(typeof window !== 'undefined' ? window.GenChibi : globalThis.GenChibi);
