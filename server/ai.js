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
          return reject(Object.assign(new Error('Nhà cung cấp trả lỗi ' + res.statusCode + (msg ? ': ' + msg : '')), { status: res.statusCode }));
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

// anchor (không lặp) của mọi tool đã chạy ok trong một lượt — dock hiện thành chip dưới tin trả lời
function anchorsOfLog(log) {
  const seen = new Set(), out = [];
  log.forEach(l => (l.anchors || []).forEach(a => { if (!seen.has(a.anchor)) { seen.add(a.anchor); out.push(a); } }));
  return out.slice(0, 12);
}

class AI {
  constructor({ dataDir, secrets, engine }) {
    this.file = path.join(dataDir, 'ai.json');
    this.benchFile = path.join(dataDir, 'ai-bench.json');
    this.secrets = secrets;
    this.GC = engine;
  }
  read(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
  write(f, v) { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); }
  config() { return Object.assign({ provider: 'openrouter', baseUrl: PROVIDERS.openrouter.baseUrl, model: '', temperature: 0.8 }, this.read(this.file, {})); }
  publicConfig() {
    const c = this.config();
    return Object.assign({}, c, { hasKey: !!this.secrets.get('llm.' + c.provider), keyHint: this.secrets.hint('llm.' + c.provider), providers: PROVIDERS });
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
    this.write(this.file, c);
    return this.publicConfig();
  }
  headers(c) {
    const key = this.secrets.get('llm.' + c.provider);
    const bound = this.secrets.get('llm.' + c.provider + '.origin');
    if (key && bound && bound !== new URL(c.baseUrl).origin) throw Object.assign(new Error('API key được nhập cho địa chỉ khác; hãy nhập lại key cho địa chỉ hiện tại'), { code: 400 });
    if (!key) throw Object.assign(new Error('Chưa nhập API key cho ' + (PROVIDERS[c.provider] || {}).label), { code: 400 });
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
  async agent({ messages, model, zone, system, context }, mcp) {
    const c = this.config();
    if (model) c.model = model;
    if (!c.model) throw Object.assign(new Error('Chưa chọn model'), { code: 400 });
    const tools = mcp.toolsFor('ui', zone);
    const allowed = new Set(tools.map(t => t.name));
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
        if (!allowed.has(name)) text = 'Tool "' + name + '" không có trong nhà xưởng.';
        else if (!args) text = 'arguments không phải JSON hợp lệ.';
        else {
          let res;
          try { res = await mcp.callTool(name, args, { channel: 'ui', zone }); }   // zone: khu Thư viện không tạo asset mới (mcp.libraryGuard)
          catch (e) { res = { isError: true, content: [{ type: 'text', text: 'Tool lỗi: ' + String(e.message).slice(0, 300) }] }; }
          ok = !!res && !res.isError;
          if (ok) { try { anchors = mcp.anchorsOf(name, args, res.structuredContent); } catch (e) { anchors = []; } }   // thứ vừa tạo / sửa → chip Soi trong dock
          const parts = (res && res.content) || [];
          text = parts.map(p => {
            if (p.type === 'text') return p.text;
            if (p.type === 'resource' && p.resource && /svg/.test(p.resource.mimeType)) {
              if (renders.length < 6) renders.push({ tool: name, svg: p.resource.text });
              return '[Ảnh SVG ' + p.resource.text.length + ' ký tự — đã hiển thị cho người dùng]';
            }
            return '';
          }).join('\n') || (ok ? 'ok' : 'lỗi');
        }
        log.push({ tool: name, ok, summary: String(text).replace(/\s+/g, ' ').slice(0, 160), anchors });
        msgs.push({ role: 'tool', tool_call_id: call.id, content: String(text).slice(0, 12000) });
      }
    }
    return { reply: 'Dừng sau 10 lượt gọi tool — hãy chia nhỏ yêu cầu.', log, renders, rounds: 10, usage, sent, model: c.model, anchors: anchorsOfLog(log) };
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
    const system = this.GC.director.prompt(cast, typeof project === 'string' ? { project } : undefined).replace('Sự kiện: <mô tả sự kiện ở đây>', 'Trả lời bằng json.');
    const messages = [{ role: 'system', content: system }, { role: 'user', content: 'Sự kiện: ' + description }];
    const t0 = Date.now();
    const usage = { prompt: 0, completion: 0 };
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await this.chat(c, messages, true);
      if (r && r.usage) { usage.prompt += r.usage.prompt_tokens || 0; usage.completion += r.usage.completion_tokens || 0; }
      const text = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
      let ev = null, errs;
      try { ev = extractJSON(text); errs = this.GC.director.validate(ev, cast); } catch (e) { errs = [e.message]; }
      if (!errs.length) return { event: ev, attempts: attempt, ms: Date.now() - t0, usage, model: c.model };
      lastErr = errs;
      messages.push({ role: 'assistant', content: String(text || '').slice(0, 6000) });
      messages.push({ role: 'user', content: 'JSON chưa đúng schema. Sửa các lỗi sau rồi trả lại MỘT object json hoàn chỉnh:\n- ' + errs.slice(0, 12).join('\n- ') });
    }
    throw Object.assign(new Error('Model không viết được kịch bản đúng chuẩn sau 3 lần: ' + lastErr.slice(0, 4).join('; ')), { code: 422 });
  }

  // Đo một model: có dùng được cho hệ thống này không (JSON hợp lệ, đúng schema, số lần thử, độ trễ, token)
  async test(model) {
    const c = this.config();
    const m = model || c.model;
    const row = { model: m, provider: c.provider, at: new Date().toISOString() };
    try {
      const r = await this.director({ description: 'Ma-nơ-canh được thưởng nóng vì hoàn thành việc sớm, nhưng lỡ tay làm đổ trà lên bản kế hoạch.', cast: ['ma-no-canh'], model: m });
      Object.assign(row, { ok: true, attempts: r.attempts, ms: r.ms, tokensIn: r.usage.prompt, tokensOut: r.usage.completion, steps: r.event.steps.length, verdict: r.attempts === 1 ? 'Dùng tốt' : 'Dùng được (cần sửa ' + (r.attempts - 1) + ' lần)' });
    } catch (e) {
      Object.assign(row, { ok: false, error: e.message.slice(0, 300), verdict: 'Không dùng được' });
    }
    const bench = this.read(this.benchFile, []);
    bench.unshift(row);
    this.write(this.benchFile, bench.slice(0, 100));
    return row;
  }
  bench() { return this.read(this.benchFile, []); }
}

module.exports = { AI, PROVIDERS, extractJSON };
