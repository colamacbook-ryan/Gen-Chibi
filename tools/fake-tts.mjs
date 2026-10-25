// gen-chibi — máy TTS GIẢ kiểu OpenAI (Node thuần) cho test giọng đọc local (v0.25.1): không mạng ngoài, không model thật.
//   GET  /v1/voices         (kiểu VieNeu: { voices: [{ id, name, description }] }) — tắt được (mode.list = 'kokoro' → 404)
//   GET  /v1/audio/voices   (kiểu Kokoro: { voices: ["zf_xiaobei", …] })
//   POST /v1/audio/speech   { model, voice, input, response_format } → WAV PCM 16-bit (mono / stereo), hoặc rác / quá cỡ / treo theo mode.speech
// Dùng: import { startFakeTts } from './fake-tts.mjs' → { url, port, calls, mode, close() }. Chạy tay: node tools/fake-tts.mjs [cổng] (chỉ nghe 127.0.0.1).
// © 2026 Gen Labs — All rights reserved.
import http from 'http';

// WAV PCM 16-bit: 0,1 s lặng — sóng 330 Hz — 0,1 s lặng (đủ dài để qua bộ cắt lặng)
export function wav(rate = 24000, ch = 1, sec = 0.6, opts = {}) {
  const n = Math.round(rate * sec), data = Buffer.alloc(n * 2 * ch);
  for (let i = 0; i < n; i++) {
    const t = i / rate, v = t > 0.1 && t < sec - 0.1 ? Math.round(8000 * Math.sin(2 * Math.PI * 330 * t)) : 0;
    for (let c = 0; c < ch; c++) data.writeInt16LE(v, (i * ch + c) * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2 * ch, 28); h.writeUInt16LE(2 * ch, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(opts.streamed ? 0xffffffff : data.length, 40);   // streamed: cỡ "data" không biết trước (máy TTS ghi theo luồng)
  return Buffer.concat([h, data]);
}

const VIENEU = [
  { id: 'Binh', name: 'Bình', description: 'nam miền Bắc' }, { id: 'Tuyen', name: 'Tuyên', description: 'nam miền Bắc' },
  { id: 'Ngoc', name: 'Ngọc', description: 'nữ miền Bắc' }, { id: 'Vinh', name: 'Vĩnh', description: 'nam miền Nam' }
];
const KOKORO = ['zf_xiaobei', 'zf_xiaoni', 'af_heart', 'am_michael'];

// mode (đổi được giữa chừng): list = 'vieneu' | 'kokoro' | 'none' · speech = 'ok' | 'stereo' | 'streamed' | 'garbage' | 'float' | 'big' | 'hang' | 'error'
export function startFakeTts(mode0) {
  const mode = Object.assign({ list: 'vieneu', speech: 'ok' }, mode0 || {}), calls = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      let body = null; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null; } catch { body = null; }
      calls.push({ method: req.method, path: req.url, body });
      const json = (code, j) => { const b = Buffer.from(JSON.stringify(j)); res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': b.length }); res.end(b); };
      if (req.method === 'GET' && req.url === '/v1/voices') return mode.list === 'vieneu' ? json(200, { voices: VIENEU }) : json(404, { detail: 'Not Found' });
      if (req.method === 'GET' && req.url === '/v1/audio/voices') return mode.list === 'kokoro' ? json(200, { voices: KOKORO }) : json(404, { detail: 'Not Found' });
      if (req.method === 'POST' && req.url === '/v1/audio/speech') {
        const s = mode.speech;
        if (s === 'hang') return;   // không bao giờ trả lời
        if (s === 'error') return json(500, { error: 'boom' });
        if (!body || typeof body.input !== 'string' || body.response_format !== 'wav') return json(400, { error: 'bad request' });
        let buf;
        if (s === 'garbage') buf = Buffer.from('<html>not a wav, sorry</html>' + 'x'.repeat(200));
        else if (s === 'float') { buf = wav(24000, 1, 0.6); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(32, 34); }
        else if (s === 'big') buf = Buffer.alloc(21 * 1024 * 1024, 1);
        else buf = wav(s === 'stereo' ? 22050 : s === 'hd' ? 48000 : 24000, s === 'stereo' ? 2 : 1, 0.6, { streamed: s === 'streamed' });
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': buf.length });
        return res.end(buf);
      }
      json(404, { detail: 'Not Found' });
    });
  });
  return new Promise(resolve => srv.listen(mode0 && mode0.port || 0, '127.0.0.1', () => {
    const port = srv.address().port;
    resolve({ url: 'http://127.0.0.1:' + port, port, calls, mode, close: () => new Promise(r => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => r()); }) });
  }));
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const s = await startFakeTts({ port: +(process.argv[2] || 0) });
  console.log('fake TTS on ' + s.url + ' (Ctrl+C to stop)');
}
