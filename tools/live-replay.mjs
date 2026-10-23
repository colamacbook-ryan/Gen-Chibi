#!/usr/bin/env node
// gen-chibi — phát lại một dòng sự kiện ghi sẵn (JSONL) vào Sân khấu sống, ở tốc độ thật hoặc tua nhanh. Node thuần.
// © 2026 Gen Labs — All rights reserved.
// Dùng: node tools/live-replay.mjs [tệp.jsonl] [--speed 2] [--url http://127.0.0.1:7480] [--dry]
//   token: GC_LIVE_TOKEN (token live, như hooks) hoặc GC_API_TOKEN (token chủ). Mặc định tệp = kinds/live/demo-session.jsonl
//   --dry: không gửi, chỉ in lịch (giây · kind) — kiểm tệp
//   Mỗi dòng { kind, label?, tool?, dt } — dt giây sau dòng trước. Nhãn vẫn bị server làm sạch như mọi sự kiện.
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--dry')) || path.join(ROOT, 'kinds/live/demo-session.jsonl');
const speed = Math.max(0.1, Math.min(50, +(opt('--speed') || 1))), url = opt('--url') || process.env.GC_LIVE_URL || 'http://127.0.0.1:7480';
const token = process.env.GC_LIVE_TOKEN || process.env.GC_API_TOKEN || '';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && l[0] !== '#').map(l => JSON.parse(l));
if (args.includes('--dry')) { let t = 0; lines.forEach(e => { t += +e.dt || 0; console.log(t.toFixed(1).padStart(6) + ' s  ' + e.kind); }); process.exit(0); }
if (!token) { console.error('set GC_LIVE_TOKEN (Studio › System › Live) or GC_API_TOKEN'); process.exit(2); }
let sent = 0, bad = 0;
for (const e of lines) {
  await new Promise(r => setTimeout(r, Math.max(0, (+e.dt || 0) * 1000 / speed)));
  const body = { kind: e.kind }; if (e.label) body.label = e.label; if (e.tool) body.tool = e.tool;
  try {
    const r = await fetch(new URL('/api/live/event', url), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GC-Request': '1', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    if (r.status === 202) sent++; else { bad++; console.error(e.kind + ': HTTP ' + r.status); }
  } catch (x) { bad++; console.error(e.kind + ': ' + x.message); }
}
console.log('replayed ' + sent + '/' + lines.length + ' events at ×' + speed + (bad ? ' (' + bad + ' failed)' : ''));
process.exit(bad ? 1 : 0);
