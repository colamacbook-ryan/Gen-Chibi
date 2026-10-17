// gen-chibi — MCP server (Model Context Protocol), không phụ thuộc SDK.
// © 2026 Afi Labs — All rights reserved.
// Agent tự làm phần sáng tạo (viết công thức nhân vật, viết kịch bản); hệ thống cung cấp từ vựng,
// kiểm theo cổng, dựng SVG và lưu. Không cần LLM API lõi.
// Vận chuyển: HTTP (POST /mcp, JSON) và stdio (server/mcp-stdio.js chuyển tiếp vào /mcp).
'use strict';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'gen-chibi', title: 'gen-chibi — nhà máy nhân vật chibi bằng code' };
const MY_PACK = 'local.my';

const INSTRUCTIONS = [
  'gen-chibi dựng nhân vật chibi bằng code từ công thức JSON. Bạn (agent) viết công thức và kịch bản; hệ thống kiểm và dựng.',
  'Quy trình tạo nhân vật: get_catalog → (tuỳ chọn) get_character một nhân vật mẫu → viết asset mới → validate_character → sửa đến khi đạt → save_character → render_character để xem.',
  'Quy trình kịch bản: list_characters → get_director_schema → viết event JSON → validate_event → save_event. Owner mở Studio › Đạo diễn AI để diễn.',
  'Phiên bản: get_app_version xem bản đang chạy và bản mới trên GitHub; update_app cập nhật ngay (tự rollback nếu bản mới lỗi); rollback_app quay về bản trước.',
  'Luật: chỉ dùng id có trong catalog; màu là mã hex; tham số nằm trong khoảng min–max; nhân vật mới lưu vào thư viện "local.my"; luôn khai báo identity.must (dấu nhận diện bắt buộc). Biểu cảm luôn khoa trương, hài, không máu.'
].join('\n');

function obj(props, required) { return { type: 'object', properties: props, required: required || [], additionalProperties: false }; }
const TOOLS = [
  { name: 'get_catalog', title: 'Kho từ vựng', description: 'Toàn bộ từ vựng được phép dùng: thư viện, bộ phận (slot) và linh kiện kèm tham số, kiểu mắt/mày, 18 biểu cảm, động tác, hiệu ứng, khoá màu, hồ sơ ánh xạ. Gọi trước khi viết công thức.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'list_characters', title: 'Danh sách nhân vật', description: 'Các nhân vật hiện có (chính thức + của người dùng): id, key, tên, thư viện, trạng thái duyệt, phiên bản, tính cách.', inputSchema: obj({}), annotations: { readOnlyHint: true } },
  { name: 'get_character', title: 'Xem công thức nhân vật', description: 'Công thức JSON đầy đủ của một nhân vật (dùng làm mẫu để tạo nhân vật mới).', inputSchema: obj({ key: { type: 'string', description: 'key đầy đủ (vd. afi.tamquoc/quan-vu) hoặc id ngắn (quan-vu)' } }, ['key']), annotations: { readOnlyHint: true } },
  { name: 'validate_character', title: 'Kiểm công thức', description: 'Chạy cổng kiểm (linh kiện, license, tham số, nhận diện, 18 biểu cảm, động tác) trên một công thức chưa lưu.', inputSchema: obj({ asset: { type: 'object', description: 'công thức nhân vật: { id, name, look: { eyes, brows, parts, params, palette }, expressions?, identity, persona? }' } }, ['asset']), annotations: { readOnlyHint: true } },
  { name: 'save_character', title: 'Lưu nhân vật', description: 'Kiểm rồi lưu nhân vật (có phiên bản). Mặc định vào thư viện local.my; nếu key trùng nhân vật đã có thì lưu thành phiên bản mới.', inputSchema: obj({ asset: { type: 'object' }, note: { type: 'string', description: 'ghi chú phiên bản' } }, ['asset']) },
  { name: 'render_character', title: 'Dựng hình', description: 'Dựng SVG của một nhân vật ở một biểu cảm. Dùng key của nhân vật đã có, hoặc truyền asset chưa lưu để xem thử.', inputSchema: obj({ key: { type: 'string' }, asset: { type: 'object' }, state: { type: 'string', description: 'id biểu cảm, mặc định normal' }, crop: { type: 'boolean', description: 'true = khung avatar (đầu và vai)' } }) , annotations: { readOnlyHint: true } },
  { name: 'get_director_schema', title: 'Schema kịch bản', description: 'JSON Schema + hướng dẫn viết kịch bản sự kiện cho các diễn viên đã chọn.', inputSchema: obj({ cast: { type: 'array', items: { type: 'string' }, description: 'id diễn viên; bỏ trống = tất cả' } }), annotations: { readOnlyHint: true } },
  { name: 'validate_event', title: 'Kiểm kịch bản', description: 'Kiểm một kịch bản sự kiện theo schema (diễn viên, biểu cảm, động tác, hiệu ứng có trong kho).', inputSchema: obj({ event: { type: 'object' }, cast: { type: 'array', items: { type: 'string' } } }, ['event']), annotations: { readOnlyHint: true } },
  { name: 'save_event', title: 'Lưu kịch bản', description: 'Kiểm rồi lưu kịch bản để owner mở và diễn trong Studio.', inputSchema: obj({ event: { type: 'object' }, author: { type: 'string', description: 'tên agent viết kịch bản' } }, ['event']) },
  { name: 'get_app_version', title: 'Phiên bản ứng dụng', description: 'Phiên bản đang chạy, bản mới nhất trên GitHub Releases, ghi chú phát hành, bản có thể quay về và lịch sử cập nhật. check=false để không hỏi GitHub.', inputSchema: obj({ check: { type: 'boolean', description: 'hỏi GitHub bản mới nhất (mặc định true)' } }), annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'update_app', title: 'Cập nhật ứng dụng', description: 'Tải bản mới nhất từ GitHub Releases (kiểm SHA-256, sao lưu dữ liệu) rồi khởi động lại. Bản mới lỗi thì launcher tự quay về bản cũ. Kết nối ngắt vài giây; gọi get_app_version sau ~15 giây để xác nhận. force=true áp cả bản từng bị bỏ qua vì lần trước chạy lỗi.', inputSchema: obj({ force: { type: 'boolean' } }), annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true } },
  { name: 'rollback_app', title: 'Quay về bản trước', description: 'Chạy lại bản cài trước đó (sao lưu dữ liệu trước khi đổi). Cần confirm = "ROLLBACK".', inputSchema: obj({ confirm: { type: 'string', enum: ['ROLLBACK'] } }, ['confirm']), annotations: { destructiveHint: true } }
];

function text(t, extra) { return Object.assign({ content: [{ type: 'text', text: t }] }, extra || {}); }
function json(v) { return { content: [{ type: 'text', text: JSON.stringify(v, null, 2) }], structuredContent: Array.isArray(v) ? { items: v } : v }; }
function toolError(msg) { return { content: [{ type: 'text', text: msg }], isError: true }; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

class MCP {
  // system (tuỳ chọn): { updater, restartSoon } — để agent tự kiểm và cập nhật phiên bản
  constructor({ engine, store, version, system }) {
    this.GC = engine;
    this.store = store;
    this.version = version;
    this.system = system || null;
    this.restarting = false;
    if (!this.GC.PACKS[MY_PACK]) this.GC.pack({ id: MY_PACK, name: 'Của tôi', owner: 'Bạn', group: 'mine', visibility: 'private', license: 'Thuộc người tạo' }, () => {});
  }
  sync() { this.store.listAssets().forEach(a => this.GC.registerAsset(a.pack, clone(a))); }

  catalog() {
    const GC = this.GC, L = GC.LIB;
    const slots = {};
    Object.keys(L.slots).forEach(s => {
      slots[s] = { label: L.slots[s].label, default: L.slots[s].fallback, parts: GC.partsOfSlot(s).map(p => {
        const o = { id: p.id, label: p.label, pack: p.pack };
        if (p.params) o.params = Object.keys(p.params).reduce((m, k) => { const d = p.params[k]; m[k] = { label: d.label, min: d.min, max: d.max, default: d.def }; return m; }, {});
        return o;
      }) };
    });
    const face = {};
    Object.keys(GC.FACE_PARAMS).forEach(g => { face[g] = Object.keys(GC.FACE_PARAMS[g]).reduce((m, k) => { const d = GC.FACE_PARAMS[g][k]; m[k] = { label: d.label, min: d.min, max: d.max, default: d.def }; return m; }, {}); });
    return {
      engine: GC.version, app: this.version,
      packs: Object.keys(GC.PACKS).map(k => { const p = GC.PACKS[k]; return { id: p.id, name: p.name, group: p.group, owner: p.owner }; }),
      slots, eyeStyles: Object.keys(L.eyeStyles).map(k => ({ id: k, label: L.eyeStyles[k].label })),
      browStyles: Object.keys(L.browStyles).map(k => ({ id: k, label: L.browStyles[k].label })),
      faceParams: face,
      paletteKeys: Object.keys(L.defaults), paletteDefaults: L.defaults,
      states: L.stateOrder.map(id => ({ id, label: L.states[id].label, hint: L.states[id].hint })),
      expressionOverrides: { eyes: Object.keys(L.eyePoses), brows: Object.keys(L.browPoses), mouth: Object.keys(L.mouths), motion: Object.keys(L.motions), fx: Object.keys(L.fx) },
      motions: Object.keys(L.motions).map(id => ({ id, label: L.motions[id].label })),
      fx: Object.keys(L.fx).map(id => ({ id, label: L.fx[id].label })),
      traits: L.traits.map(t => ({ id: t.id, label: t.label })),
      profiles: Object.keys(L.profiles).map(id => ({ id, label: L.profiles[id].label, map: L.profiles[id].map })),
      assetShape: {
        id: 'chữ thường-gạch-ngang', name: 'Tên hiển thị', han: 'tuỳ chọn', faction: '', role: '', persona: 'tính cách cho AI đạo diễn',
        look: { eyes: 'id kiểu mắt', brows: 'id kiểu mày', parts: { slot: 'id linh kiện' }, params: { 'slot|eyes|brows|mouth|rig': { tham_so: 'số' } }, palette: { khoa_mau: '#hex' } },
        expressions: { 'id biểu cảm': { eyes: '', brows: '', mouth: '', motion: '', fx: ['…'], fxAdd: ['…'], fxRemove: ['…'] } },
        lines: { 'id biểu cảm': ['câu cửa miệng'] },
        identity: { p1: 'dấu nhận diện chính ở 32 px', must: ['slot:id linh kiện'], source: 'nguồn tư liệu' }
      }
    };
  }

  prepare(a) {
    if (!a || typeof a !== 'object') throw new Error('asset phải là object');
    const x = clone(a);
    x.id = String(x.id || '').toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(x.id)) throw new Error('id phải gồm chữ thường, số, gạch ngang (1–64 ký tự)');
    x.pack = x.pack && this.GC.PACKS[x.pack] ? x.pack : MY_PACK;
    x.key = x.pack + '/' + x.id;
    x.look = x.look || {};
    x.look.parts = x.look.parts || {};
    x.version = x.version || 0;
    x.status = ['draft', 'review', 'approved'].indexOf(x.status) >= 0 ? x.status : 'draft';
    return this.GC.migrate(x);
  }
  // nhận key đầy đủ (pack/id) hoặc id ngắn (ưu tiên bản trong "Của tôi")
  findAsset(key) {
    this.sync();
    if (this.GC.ASSETS[key]) return this.GC.ASSETS[key];
    const hits = this.GC.assets().filter(a => a.id === key);
    return hits.filter(a => a.pack === MY_PACK)[0] || hits[0] || null;
  }

  async callTool(name, args, ctx) {
    const GC = this.GC;
    args = args || {};
    switch (name) {
      case 'get_catalog': return json(this.catalog());
      case 'list_characters': {
        this.sync();
        return json(GC.assets().map(a => ({ id: a.id, key: a.key, name: a.name, pack: a.pack, status: a.status, version: a.version, role: a.role, persona: a.persona })));
      }
      case 'get_character': {
        const a = this.findAsset(String(args.key || ''));
        return a ? json(a) : toolError('Không có nhân vật ' + args.key + '. Gọi list_characters để xem khoá.');
      }
      case 'validate_character': {
        let a; try { a = this.prepare(args.asset); } catch (e) { return toolError(e.message); }
        const g = GC.gate(a);
        return json({ ok: g.every(x => x.ok), gates: g });
      }
      case 'save_character': {
        let a; try { a = this.prepare(args.asset); } catch (e) { return toolError(e.message); }
        const g = GC.gate(a);
        const blocking = g.filter(x => !x.ok);
        if (blocking.length) return Object.assign(json({ saved: false, gates: g }), { isError: true });
        const rec = this.store.saveAsset(a.key, a, args.note || 'Lưu qua MCP');
        GC.registerAsset(rec.pack, clone(rec));
        return json({ saved: true, key: rec.key, version: rec.version, studio: 'Mở Studio › Nhân vật › ' + rec.name });
      }
      case 'render_character': {
        let a;
        if (args.asset) { try { a = this.prepare(args.asset); } catch (e) { return toolError(e.message); } }
        else a = this.findAsset(String(args.key || ''));
        if (!a) return toolError('Cần key của nhân vật đã có hoặc asset để dựng thử.');
        const state = GC.LIB.states[args.state] ? args.state : 'normal';
        let svg;
        try { svg = GC.svgString(a, state, { crop: !!args.crop, noShadow: !!args.crop }); } catch (e) { return toolError('Không dựng được: ' + e.message); }
        return {
          content: [
            { type: 'text', text: 'SVG của ' + (a.name || a.id) + ' · ' + GC.LIB.states[state].label + ' (' + svg.length + ' ký tự). Mở được trực tiếp trong trình duyệt.' },
            { type: 'resource', resource: { uri: 'genchibi://render/' + a.key + '/' + state + (args.crop ? '-avatar' : '') + '.svg', mimeType: 'image/svg+xml', text: svg } }
          ]
        };
      }
      case 'get_director_schema': {
        this.sync();
        const cast = this.castOf(args.cast);
        return json({ schema: GC.director.schema(cast), guide: GC.director.prompt(cast).split('\nSchema:')[0] });
      }
      case 'validate_event': {
        this.sync();
        const errs = GC.director.validate(args.event, this.castOf(args.cast));
        return json({ ok: !errs.length, errors: errs });
      }
      case 'save_event': {
        this.sync();
        const errs = GC.director.validate(args.event, GC.assets());
        if (errs.length) return Object.assign(json({ saved: false, errors: errs }), { isError: true });
        const rec = this.store.saveEvent(args.event, args.author || 'agent qua MCP');
        return json({ saved: true, id: rec.id, studio: 'Mở Studio › Đạo diễn AI › Kịch bản đã lưu › ' + args.event.title });
      }
      case 'get_app_version': case 'update_app': case 'rollback_app': return this.appTool(name, args, ctx || {});
      default: return null;
    }
  }
  async appTool(name, args, ctx) {
    const sys = this.system;
    if (!sys || !sys.updater) return toolError('Bản chạy này không tự cập nhật được (đang chạy từ mã nguồn, không qua bản cài).');
    const up = sys.updater;
    // Link có khoá chỉ được kiểm và cập nhật lên bản mới bình thường. Rollback và force (ép chạy bản từng hỏng)
    // cần token chủ máy hoặc stdio: lặp rollback qua link sẽ đẩy hết backup cũ ra khỏi vòng giữ 10 bản.
    if (ctx.viaLink && (name === 'rollback_app' || (name === 'update_app' && args.force === true)))
      return toolError('Qua link MCP chỉ được kiểm và cập nhật bình thường. Rollback/force: dùng Studio, genchibi, hoặc MCP có token chủ máy.');
    if (name !== 'get_app_version' && this.restarting) return toolError('Đang khởi động lại để đổi phiên bản — gọi get_app_version sau ~15 giây.');
    const view = (st) => ({
      current: 'v' + String(st.current).replace(/^v/, ''), latest: st.latest || null, available: !!st.available, skipped: !!st.skipped,
      publishedAt: st.publishedAt || null, notes: st.notes ? String(st.notes).slice(0, 4000) : null, lastCheck: st.lastCheck || null, error: st.error || null,
      previous: st.previous, canRollback: !!st.canRollback, busy: !!st.busy, history: (st.history || []).slice(0, 5)
    });
    if (name === 'get_app_version') {
      if (args.check === false) return json(view(up.status()));
      try { return json(view(await up.check())); }
      catch (e) { return json(Object.assign(view(up.status()), { error: 'Không hỏi được GitHub: ' + e.message })); }
    }
    if (name === 'update_app') {
      let r;
      try { r = await up.apply({ force: args.force === true }); }
      catch (e) { return toolError('Cập nhật thất bại, vẫn chạy bản hiện tại: ' + e.message); }
      if (r.restart) { this.restarting = true; sys.restartSoon(); }
      return json(Object.assign({}, r, { next: r.restart ? 'Đợi ~15 giây rồi gọi get_app_version để xác nhận bản mới đang chạy.' : null }));
    }
    if (args.confirm !== 'ROLLBACK') return toolError('Cần confirm = "ROLLBACK".');
    if (up.busy) return toolError('Đang cập nhật, thử lại sau.');
    try { const r = up.rollback(); this.restarting = true; sys.restartSoon(); return json(r); }
    catch (e) { return toolError(e.message); }
  }
  castOf(ids) {
    const all = this.GC.assets();
    if (!Array.isArray(ids) || !ids.length) return all;
    return all.filter(a => ids.indexOf(a.id) >= 0);
  }

  // Xử lý một thông điệp JSON-RPC. Trả về phản hồi, hoặc null với notification.
  // ctx.viaLink: gọi qua link có khoá (/mcp/<key>) — quyền hẹp hơn token chủ máy
  async handle(msg, ctx) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return { jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'Invalid Request' } };
    }
    const isNote = msg.id === undefined || msg.id === null;
    const ok = result => (isNote ? null : { jsonrpc: '2.0', id: msg.id, result });
    const err = (code, message) => (isNote ? null : { jsonrpc: '2.0', id: msg.id, error: { code, message } });
    try {
      switch (msg.method) {
        case 'initialize': {
          const want = msg.params && msg.params.protocolVersion;
          return ok({
            protocolVersion: PROTOCOLS.indexOf(want) >= 0 ? want : PROTOCOLS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: Object.assign({ version: this.version }, SERVER_INFO),
            instructions: INSTRUCTIONS
          });
        }
        case 'notifications/initialized': case 'notifications/cancelled': return null;
        case 'ping': return ok({});
        case 'tools/list': return ok({ tools: TOOLS });
        case 'tools/call': {
          const p = msg.params || {};
          const r = await this.callTool(p.name, p.arguments, ctx || {});
          if (!r) return err(-32602, 'Không có tool: ' + p.name);
          return ok(r);
        }
        default: return err(-32601, 'Không hỗ trợ: ' + msg.method);
      }
    } catch (e) {
      return err(-32603, e.message);
    }
  }
}

module.exports = { MCP, TOOLS };
