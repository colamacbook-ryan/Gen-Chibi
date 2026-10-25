// gen-chibi — core AI: gọi LLM qua API chuẩn OpenAI (OpenRouter, DeepSeek, MiniMax, Google Gemini, hoặc tuỳ chỉnh).
// © 2026 Gen Labs — All rights reserved.
// Nguyên tắc: LLM chỉ VIẾT JSON trong vocabulary đóng của kho; server kiểm bằng validator của engine,
// sai thì gửi lại danh sách lỗi cho model sửa (tối đa 2 lần). Model nào dùng được thì đo bằng "Kiểm tra model".
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { agentFor } = require('./net');
const { FALLBACK: BRIDGE_FALLBACK, bridgeError } = require('./bridge');
// NGÔN NGỮ (ADR 0007): chữ gửi LLM (chỉ dẫn, kết quả tool, câu yêu cầu sửa) viết tiếng Anh; câu cho người dùng (lỗi, nhãn nhà cung cấp, kết luận đo model)
// giữ msgid tiếng Việt — dịch theo ngôn ngữ của yêu cầu (MSG.reqLang) hoặc ở rìa (main.js)
const MSG = require('./i18n-msg'), { VI, tr } = MSG;

const PROVIDERS = {
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: true, keyUrl: 'https://openrouter.ai/keys' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: true, keyUrl: 'https://platform.deepseek.com/api_keys' },
  minimax: { label: 'MiniMax (quốc tế)', baseUrl: 'https://api.minimax.io/v1', models: false, keyUrl: 'https://platform.minimax.io' },
  // Google AI Studio qua cổng chuẩn OpenAI của Gemini; cùng key dùng được cho giọng AI (server/voice.js). Gemini 3 trả thought_signature
  // trong tool_calls[].extra_content — vòng tool gửi trả nguyên tool_calls nên giữ được chữ ký
  gemini: { label: 'Google AI Studio (Gemini)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: true, keyUrl: 'https://aistudio.google.com/apikey' },
  custom: { label: 'Tuỳ chỉnh (chuẩn OpenAI)', baseUrl: '', models: true, keyUrl: '' }
};

function request(method, url, { headers = {}, body, timeout = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = mod.request(u, { method, timeout, agent: agentFor(url), headers: Object.assign({ 'User-Agent': 'gen-chibi', Accept: 'application/json' }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}, headers) }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ }
        if (res.statusCode >= 400) {
          // chỉ lấy dòng thông báo lỗi chuẩn, không chép nguyên phản hồi của nhà cung cấp
          const msg = json && json.error && typeof json.error.message === 'string' ? json.error.message.slice(0, 200) : '';
          return reject(Object.assign(new Error(msg ? tr(VI, 'Nhà cung cấp trả lỗi {code}: {reason}', { code: res.statusCode, reason: msg }) : tr(VI, 'Nhà cung cấp trả lỗi {code}', { code: res.statusCode })), { status: res.statusCode }));
        }
        resolve(json);
      });
    });
    req.on('timeout', () => req.destroy(new Error('hết thời gian chờ nhà cung cấp')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Bóc JSON từ câu trả lời (model hay bọc ```json ... ``` hoặc kèm lời dẫn)
function extractJSON(text) {
  if (!text) throw new Error('model trả về rỗng');
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* thử tìm object đầu tiên */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('câu trả lời không chứa JSON');
}

// kết quả MỘT lời gọi tool → { ok, text (cho model), entry (dòng log ✓/✗ của dock + chip Soi) }; SVG đưa vào renders (≤ 6). Dùng chung cho vòng tool của API key
// và cho lời gọi MCP của cầu nối CLI (main.js ghi vào log của token lượt) — dock thấy CÙNG log / chip / SVG ở hai đường (spec §10.3)
function toolOutcome(mcp, name, args, res, renders) {
  const ok = !!res && !res.isError;
  let anchors = [];
  if (ok) { try { anchors = mcp.anchorsOf(name, args, res.structuredContent); } catch (e) { anchors = []; } }   // thứ vừa tạo / sửa → chip Soi trong dock
  const parts = (res && res.content) || [];
  const text = parts.map(p => {
    if (p.type === 'text') return p.text;
    if (p.type === 'resource' && p.resource && /svg/.test(p.resource.mimeType)) {
      if (renders.length < 6) renders.push({ tool: name, svg: p.resource.text });
      return '[SVG image, ' + p.resource.text.length + ' characters — already shown to the user]';
    }
    return '';
  }).join('\n') || (ok ? 'ok' : 'error');
  return { ok, text, entry: { tool: name, ok, summary: String(text).replace(/\s+/g, ' ').slice(0, 160), anchors } };
}

// anchor (không lặp) của mọi tool đã chạy ok trong một lượt — dock hiện thành chip dưới tin trả lời
function anchorsOfLog(log) {
  const seen = new Set(), out = [];
  log.forEach(l => (l.anchors || []).forEach(a => { if (!seen.has(a.anchor)) { seen.add(a.anchor); out.push(a); } }));
  return out.slice(0, 12);
}

// ai.json v2 (v0.26, spec §5): trường API giữ nguyên chỗ cũ (provider / baseUrl / model / temperature = "khe API key") + primary 'api' | 'cli', cli { name, model },
// fallback (dự phòng bằng chính khe API key khi CLI lỗi trước khi ghi — D11), readOnly ("AI chỉ đọc"), caps { turnSec, perHour } (Studio CHỈ HẠ được dưới trần máy chủ).
// Dạng spec { primary: {provider, model}, fallback: {provider, model} | null } trả ra ở publicConfig (primaryView / fallbackView). Tệp v1 (chỉ khe API) tự chuyển: primary 'api'
const CLI_NAMES = ['agy', 'claude'];
class AI {
  constructor({ dataDir, secrets, engine, bridge }) {
    this.file = path.join(dataDir, 'ai.json');
    this.benchFile = path.join(dataDir, 'ai-bench.json');
    this.secrets = secrets;
    this.GC = engine;
    this.bridge = bridge || null;   // server/bridge.js — null: không có cầu nối (test cũ)
    this.cliStarts = [];            // trần lượt / giờ do Studio HẠ (máy chủ còn trần cứng của nó)
  }
  read(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
  write(f, v) { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); }
  config() {
    const c = Object.assign({ provider: 'openrouter', baseUrl: PROVIDERS.openrouter.baseUrl, model: '', temperature: 0.8 }, this.read(this.file, {}));
    if (c.v !== 2) Object.assign(c, { v: 2, primary: 'api', cli: { name: '', model: '' }, fallback: false, readOnly: false, caps: {} });   // v1 → v2 (khe API giữ nguyên)
    if (c.primary !== 'cli') c.primary = 'api';
    c.cli = { name: c.cli && CLI_NAMES.includes(c.cli.name) ? c.cli.name : '', model: c.cli && typeof c.cli.model === 'string' ? c.cli.model.slice(0, 80) : '' };
    c.fallback = c.fallback === true; c.readOnly = c.readOnly === true;
    c.caps = c.caps && typeof c.caps === 'object' ? c.caps : {};
    return c;
  }
  // trần Studio hiệu lực = min(trần Studio, trần máy chủ) — container chỉ HẠ được (CNS-322)
  capsOf(c) {
    const host = this.bridge ? this.bridge.status().caps : { turnSec: 900, perHour: 100 }, out = {};
    ['turnSec', 'perHour'].forEach(k => { const v = +c.caps[k]; out[k] = Number.isFinite(v) && v > 0 ? Math.min(v, host[k]) : host[k]; });
    return out;
  }
  hasApi(c) { return !!(c.model && this.secrets.get('llm.' + c.provider)); }
  publicConfig() {
    const c = this.config();
    // nhãn nhà cung cấp theo ngôn ngữ của yêu cầu (Studio gửi X-GC-Lang)
    const providers = {}; Object.keys(PROVIDERS).forEach(k => { providers[k] = Object.assign({}, PROVIDERS[k], { label: MSG._t(PROVIDERS[k].label) }); });
    const b = this.bridge ? this.bridge.status() : null, cliReady = !!(b && c.cli.name && this.bridge.ready(c.cli.name));
    return Object.assign({}, c, { hasKey: !!this.secrets.get('llm.' + c.provider), keyHint: this.secrets.hint('llm.' + c.provider), providers, cliReady, capsEff: this.capsOf(c),
      primaryView: c.primary === 'cli' ? { provider: 'cli', cli: c.cli.name, model: c.cli.model } : { provider: c.provider, model: c.model },
      fallbackView: c.primary === 'cli' && c.fallback ? { provider: c.provider, model: c.model } : null, bridge: b });
  }
  setConfig(b) {
    const c = this.config();
    if (b.provider && PROVIDERS[b.provider]) c.provider = b.provider;
    // nhà cung cấp có tên: địa chỉ cố định; chỉ "custom" được tự đặt địa chỉ
    if (c.provider !== 'custom') c.baseUrl = PROVIDERS[c.provider].baseUrl;
    else if (typeof b.baseUrl === 'string' && b.baseUrl) {
      let u;
      try { u = new URL(b.baseUrl); } catch { throw Object.assign(new Error('địa chỉ API không hợp lệ'), { code: 400 }); }
      if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) throw Object.assign(new Error('địa chỉ API phải dùng https (trừ localhost)'), { code: 400 });
      const next = b.baseUrl.replace(/\/+$/, '');
      // key gắn với đúng địa chỉ lúc nhập: đổi sang nơi khác thì key cũ bị xoá, phải nhập lại
      if (next !== c.baseUrl && !(typeof b.apiKey === 'string' && b.apiKey.trim())) this.secrets.set('llm.custom', '');
      c.baseUrl = next;
    }
    if (typeof b.model === 'string') c.model = b.model.trim().slice(0, 200);
    if (Number.isFinite(b.temperature) && b.temperature >= 0 && b.temperature <= 1.5) c.temperature = b.temperature;
    if (typeof b.apiKey === 'string' && b.apiKey.trim()) { this.secrets.set('llm.' + c.provider, b.apiKey.trim()); this.secrets.set('llm.' + c.provider + '.origin', new URL(c.baseUrl).origin); }
    if (b.clearKey === true) this.secrets.set('llm.' + c.provider, '');
    // v2: đường chạy AI. CLI chỉ chọn trong danh sách đã bật trên máy chủ (D5) — chưa bật vẫn lưu được (Studio báo rõ), nhưng lượt bị từ chối
    if (b.primary === 'cli' || b.primary === 'api') c.primary = b.primary;
    if (typeof b.cli === 'string') { if (b.cli && !CLI_NAMES.includes(b.cli)) throw Object.assign(new Error('CLI không hợp lệ'), { code: 400 }); c.cli.name = b.cli; }
    if (typeof b.cliModel === 'string') {
      const m = b.cliModel.trim().slice(0, 80), st = this.bridge && this.bridge.status(), list = st && st.clis[c.cli.name] ? st.clis[c.cli.name].models : [];
      if (m && list.indexOf(m) < 0) throw Object.assign(new Error('model không có trong danh sách cầu nối đã quét'), { code: 400 });
      c.cli.model = m;
    }
    if (typeof b.fallback === 'boolean') c.fallback = b.fallback;
    if (typeof b.readOnly === 'boolean') c.readOnly = b.readOnly;
    if (b.caps && typeof b.caps === 'object') {
      const host = this.bridge ? this.bridge.status().caps : { turnSec: 900, perHour: 100 }, nc = {};
      ['turnSec', 'perHour'].forEach(k => { const v = +b.caps[k]; if (Number.isFinite(v) && v > 0) nc[k] = Math.max(k === 'turnSec' ? 30 : 1, Math.min(Math.round(v), host[k])); });   // chỉ HẠ: trên trần máy chủ → kẹp về trần
      c.caps = nc;
    }
    this.write(this.file, c);
    return this.publicConfig();
  }
  headers(c) {
    const key = this.secrets.get('llm.' + c.provider);
    const bound = this.secrets.get('llm.' + c.provider + '.origin');
    if (key && bound && bound !== new URL(c.baseUrl).origin) throw Object.assign(new Error('API key được nhập cho địa chỉ khác; hãy nhập lại key cho địa chỉ hiện tại'), { code: 400 });
    if (!key) throw Object.assign(new Error(tr(VI, 'Chưa nhập API key cho {provider}', { provider: (PROVIDERS[c.provider] || {}).label })), { code: 400 });
    const h = { Authorization: 'Bearer ' + key };
    if (c.provider === 'openrouter') { h['HTTP-Referer'] = 'https://github.com/colamacbook-ryan/Gen-Chibi'; h['X-Title'] = 'gen-chibi'; }
    return h;
  }

  // Danh sách model kèm khả năng (OpenRouter trả supported_parameters + giá; nơi khác chỉ có id)
  async models() {
    const c = this.config();
    const r = await request('GET', c.baseUrl + '/models', { headers: this.headers(c), timeout: 30000 });
    const list = (r && (r.data || r.models)) || [];
    return list.map(m => {
      const sp = m.supported_parameters || null;
      return {
        id: m.id, name: m.name || m.id, context: m.context_length || null,
        structured: sp ? (sp.indexOf('response_format') >= 0 || sp.indexOf('structured_outputs') >= 0) : null,
        tools: sp ? sp.indexOf('tools') >= 0 : null,
        priceIn: m.pricing ? +m.pricing.prompt * 1e6 : null, priceOut: m.pricing ? +m.pricing.completion * 1e6 : null
      };
    });
  }

  async chat(c, messages, json) {
    const body = { model: c.model, messages, temperature: c.temperature, max_tokens: 2500 };
    if (json) body.response_format = { type: 'json_object' };
    try {
      return await request('POST', c.baseUrl + '/chat/completions', { headers: this.headers(c), body });
    } catch (e) {
      // một số model không nhận response_format → thử lại không có nó
      if (json && e.status === 400 && /response_format|json/i.test(e.message)) { delete body.response_format; return request('POST', c.baseUrl + '/chat/completions', { headers: this.headers(c), body }); }
      throw e;
    }
  }

  async chatTools(c, messages, tools) {
    const body = { model: c.model, messages, tools, tool_choice: 'auto', temperature: Math.min(c.temperature, 0.7), max_tokens: 3000 };
    return request('POST', c.baseUrl + '/chat/completions', { headers: this.headers(c), body, timeout: 120000 });
  }

  // AI trong dock cột phải: vòng lặp function-calling trên bộ tool MCP THEO KHU (mcp.toolsFor('ui', zone)) và chỉ dẫn do mcp.uiSystem dựng (một nguồn).
  // Model không bao giờ ghi thẳng vào kho: mọi tạo/sửa đi qua tool → cổng kiểm của engine → lưu. Tool lỗi → model đọc lỗi và sửa.
  // system: chỉ dẫn TĨNH đã dựng (mcp.uiSystem); không truyền thì dùng vai của khu.
  // context: tin `user` DỮ LIỆU GIAO DIỆN (mcp.uiContext: ngữ cảnh + hiện trạng tác phẩm + ghi chú duyệt + ghim, bọc JSON) — chen ngay trước tin cuối của người dùng, không lưu vào luồng.
  // Ngân sách (CNS-119): system + context + lịch sử ≤ mcp.limits().llm ký tự mỗi vòng — lịch sử bị xén từ tin cũ nhất (luôn giữ tin cuối); trả về `sent` (ký tự đã gửi) + `usage` thật
  // lang (tuỳ chọn): ngôn ngữ giao diện của người dùng — cho câu server tự viết vào lời trả lời (dừng sau 10 vòng); bỏ trống = ngôn ngữ của yêu cầu
  async agent(o, mcp, hooks) {
    const c = this.config();
    if (c.primary === 'cli' && this.bridge && !o.forceApi) return this.cliAgent(o, mcp, hooks || {});
    return this.apiAgent(o, mcp);
  }
  // AI trong dock qua CẦU NỐI CLI (spec §5): một job `agent` (system + dữ liệu giao diện + lịch sử) → cầu nối chạy CLI trên máy chủ, tool đi qua /mcp bằng token lượt
  // (log ✓/✗, chip Soi, SVG ghi ở main.js → tok.log / tok.renders). Dự phòng API key (D11): chỉ với lỗi thuộc FALLBACK và khi token CHƯA có lần gọi tool ghi nào (CNS-312)
  async cliAgent({ messages, zone, system, systemFor, context, lang, liveChan }, mcp, hooks) {
    const c = this.config(), caps = this.capsOf(c);
    const hist = (Array.isArray(messages) ? messages : []).slice(-20).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
    while (hist.length > 1 && hist[0].role !== 'user') hist.shift();
    if (!hist.length || hist[hist.length - 1].role !== 'user') throw Object.assign(new Error('cần tin nhắn của người dùng'), { code: 400 });
    const sys = (typeof systemFor === 'function' ? systemFor('bridge') : system) || mcp.uiSystem({ zone: zone || 'xuong' }, 'bridge'), ctx = typeof context === 'string' ? context : '';
    const sent = { system: sys.length, context: ctx.length, history: hist.reduce((n, m) => n + m.content.length, 0) };
    let run = null;
    try {
      const t = Date.now(); this.cliStarts = this.cliStarts.filter(x => t - x < 3600e3);
      if (this.cliStarts.length >= caps.perHour) throw bridgeError('RATE_CAP');
      run = this.bridge.createJob({ kind: 'agent', cli: c.cli.name, model: c.cli.model, system: sys, context: ctx, messages: hist, zone: zone || 'xuong', readOnly: c.readOnly }, { caps: { turnSec: caps.turnSec }, liveChan });
      this.cliStarts.push(t);
      if (hooks.onJob) hooks.onJob(run);
      const r = await run.promise;
      return { reply: r.text, log: run.tok.log, renders: run.tok.renders, rounds: 1, usage: { prompt: 0, completion: 0 }, sent, model: 'cli:' + c.cli.name + (c.cli.model ? '/' + c.cli.model : ''), anchors: anchorsOfLog(run.tok.log), via: 'cli' };
    } catch (e) {
      const wrote = run ? run.tok.writes : 0;
      if (c.fallback && e.bridgeCode && BRIDGE_FALLBACK.has(e.bridgeCode) && wrote === 0 && this.hasApi(c)) {
        const r = await this.apiAgent({ messages, zone, system: typeof systemFor === 'function' ? systemFor('chat') : undefined, context, lang, liveChan }, mcp);
        return Object.assign(r, { via: 'api-fallback', fallbackFrom: e.bridgeCode, log: (run ? run.tok.log : []).concat(r.log) });
      }
      throw e;
    }
  }
  async apiAgent({ messages, model, zone, system, context, lang, liveChan }, mcp) {
    const c = this.config();
    if (model) c.model = model;
    if (!c.model) throw Object.assign(new Error('Chưa chọn model'), { code: 400 });
    const tools = mcp.toolsFor('ui', zone).filter(t => !c.readOnly || (t.annotations && t.annotations.readOnlyHint === true));   // danh sách cho model; CỔNG KHU thật ở mcp.callTool (ctx.channel 'ui' — CNS-302), không ở đây
    const fns = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    const hist = (Array.isArray(messages) ? messages : []).slice(-20)
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!hist.length || hist[hist.length - 1].role !== 'user') throw Object.assign(new Error('cần tin nhắn của người dùng'), { code: 400 });
    const sys = system || mcp.uiSystem({ zone: zone || 'xuong' }), ctxMsg = typeof context === 'string' && context ? [{ role: 'user', content: context }] : [], LIM = mcp.limits();
    const room = Math.max(LIM.histMin, LIM.llm - sys.length - ctxMsg.reduce((n, m) => n + m.content.length, 0)), keep = [hist[hist.length - 1]];
    let used = keep[0].content.length;
    for (let i = hist.length - 2; i >= 0 && used + hist[i].content.length <= room; i--) { used += hist[i].content.length; keep.unshift(hist[i]); }
    while (keep.length > 1 && keep[0].role !== 'user') keep.shift();   // lịch sử không mở đầu bằng lời của trợ lý
    const msgs = [{ role: 'system', content: sys }].concat(keep.slice(0, -1), ctxMsg, keep.slice(-1));
    const sent = { system: sys.length, context: ctxMsg.length ? ctxMsg[0].content.length : 0, history: keep.reduce((n, m) => n + m.content.length, 0) };
    const log = [], renders = [], usage = { prompt: 0, completion: 0 };
    for (let round = 1; round <= 10; round++) {
      const r = await this.chatTools(c, msgs, fns);
      if (r && r.usage) { usage.prompt += r.usage.prompt_tokens || 0; usage.completion += r.usage.completion_tokens || 0; }
      const msg = r && r.choices && r.choices[0] && r.choices[0].message;
      if (!msg) throw Object.assign(new Error('model không trả lời'), { code: 502 });
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls.slice(0, 6) : [];
      msgs.push({ role: 'assistant', content: msg.content || '', tool_calls: calls.length ? calls : undefined });
      if (!calls.length) return { reply: msg.content || '', log, renders, rounds: round, usage, sent, model: c.model, anchors: anchorsOfLog(log) };
      for (const call of calls) {
        const name = call.function && call.function.name;
        let args = {}, text, ok = false, anchors = [];
        try { args = JSON.parse((call.function && call.function.arguments) || '{}'); } catch (e) { args = null; }
        if (!args) text = 'arguments is not valid JSON.';
        else {
          let res;
          try { res = await mcp.callTool(name, args, { channel: 'ui', zone, liveChan, readOnly: c.readOnly }); }   // zone: cổng khu + khu Thư viện không tạo asset mới (mcp.libraryGuard) · liveChan: sự kiện Live của lượt (spec §8)
          catch (e) { res = { isError: true, content: [{ type: 'text', text: 'Tool failed: ' + MSG.en(String(e.message).slice(0, 300)).slice(0, 300) }] }; }
          const out = toolOutcome(mcp, name, args, res, renders);
          ok = out.ok; anchors = out.entry.anchors; text = out.text;
        }
        log.push({ tool: name, ok, summary: String(text).replace(/\s+/g, ' ').slice(0, 160), anchors });
        msgs.push({ role: 'tool', tool_call_id: call.id, content: String(text).slice(0, 12000) });
      }
    }
    return { reply: MSG._t('Dừng sau 10 lượt gọi tool — hãy chia nhỏ yêu cầu.', null, lang), log, renders, rounds: 10, usage, sent, model: c.model, anchors: anchorsOfLog(log) };
  }

  castFrom(ids, extraAssets) {
    const all = this.GC.assets().concat(extraAssets || []);
    const byId = {};
    all.forEach(a => { byId[a.id] = a; });
    const cast = (ids && ids.length ? ids : Object.keys(byId)).map(id => byId[id]).filter(Boolean);
    if (!cast.length) throw Object.assign(new Error('chưa có diễn viên'), { code: 400 });
    return cast;
  }

  // Viết kịch bản sự kiện: sinh → kiểm → gửi lỗi cho model sửa (≤ 2 lần)
  async director({ description, cast: ids, model, project }, extraAssets) {
    const c = this.config();
    if (model) c.model = model;
    if (!c.model) throw Object.assign(new Error('Chưa chọn model'), { code: 400 });
    if (!description || String(description).length > 2000) throw Object.assign(new Error('mô tả sự kiện cần 1–2000 ký tự'), { code: 400 });
    const cast = this.castFrom(ids, extraAssets);
    // chỉ dẫn tiếng Anh (engine directorPrompt); lời thoại viết bằng ngôn ngữ của MÔ TẢ sự kiện (người dùng viết tiếng Việt → thoại tiếng Việt như trước)
    const system = this.GC.director.prompt(cast, typeof project === 'string' ? { project } : undefined).replace('Event: <event description here>', 'Write every "say" in the language of the event description. Answer in json.');
    const messages = [{ role: 'system', content: system }, { role: 'user', content: 'Event: ' + description }];
    const t0 = Date.now();
    const usage = { prompt: 0, completion: 0 };
    let lastErr = null;
    const viaCli = c.primary === 'cli' && this.bridge;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = viaCli ? await this.cliComplete(c, messages) : await this.chat(c, messages, true);
      if (r && r.usage) { usage.prompt += r.usage.prompt_tokens || 0; usage.completion += r.usage.completion_tokens || 0; }
      const text = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
      let ev = null, errs;
      try { ev = extractJSON(text); errs = this.GC.director.validate(ev, cast); } catch (e) { errs = [e.message]; }
      if (!errs.length) return { event: ev, attempts: attempt, ms: Date.now() - t0, usage, model: viaCli ? 'cli:' + c.cli.name + (c.cli.model ? '/' + c.cli.model : '') : c.model };
      lastErr = errs;
      messages.push({ role: 'assistant', content: String(text || '').slice(0, 6000) });
      messages.push({ role: 'user', content: 'The JSON does not match the schema. Fix these errors and return ONE complete json object:\n- ' + errs.slice(0, 12).map(MSG.en).join('\n- ') });
    }
    throw Object.assign(new Error(tr(VI, 'Model không viết được kịch bản đúng chuẩn sau 3 lần: {list}', { list: lastErr.slice(0, 4).join('; ') })), { code: 422 });
  }

  // AI đạo diễn qua cầu nối CLI: job `complete` (KHÔNG gắn MCP) — app vẫn extractJSON + validate + sửa tối đa 2 lần như đường API (spec §5)
  async cliComplete(c, messages) {
    const sys = messages[0] && messages[0].role === 'system' ? messages[0].content : '', rest = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: String(m.content).slice(0, 7900) }));
    const run = this.bridge.createJob({ kind: 'complete', cli: c.cli.name, model: c.cli.model, system: sys, context: '', messages: rest, zone: '', readOnly: true }, { caps: { turnSec: this.capsOf(c).turnSec } });
    const r = await run.promise;
    return { choices: [{ message: { content: r.text } }] };
  }
  // Đo một model: có dùng được cho hệ thống này không (JSON hợp lệ, đúng schema, số lần thử, độ trễ, token)
  async test(model) {
    const c = this.config();
    const viaCli = c.primary === 'cli' && this.bridge;
    const m = viaCli ? c.cli.model || '(default)' : model || c.model;
    const row = { model: m, provider: viaCli ? 'cli:' + c.cli.name : c.provider, at: new Date().toISOString() };   // INT-04: bài đo director cho cả CLI (CNS-316)
    try {
      const r = await this.director({ description: 'The mannequin gets a surprise bonus for finishing early, but accidentally spills tea on the plan.', cast: ['ma-no-canh'], model: viaCli ? '' : m });
      Object.assign(row, { ok: true, attempts: r.attempts, ms: r.ms, tokensIn: r.usage.prompt, tokensOut: r.usage.completion, steps: r.event.steps.length, verdict: r.attempts === 1 ? 'Dùng tốt' : tr(VI, 'Dùng được (cần sửa {n} lần)', { n: r.attempts - 1 }) });
    } catch (e) {
      Object.assign(row, { ok: false, error: e.message.slice(0, 300), verdict: 'Không dùng được' });
    }
    const bench = this.read(this.benchFile, []);
    bench.unshift(row);
    this.write(this.benchFile, bench.slice(0, 100));
    return this.benchView(row);
  }
  // sổ đo lưu msgid tiếng Việt (kết luận + lỗi); trả ra theo ngôn ngữ của yêu cầu
  benchView(row) { return Object.assign({}, row, { verdict: MSG.label('', row.verdict), error: row.error ? MSG.label('', row.error) : row.error }); }
  bench() { return this.read(this.benchFile, []).map(r => this.benchView(r)); }
}

module.exports = { AI, PROVIDERS, extractJSON, toolOutcome, anchorsOfLog };
