/* gen-chibi — dò codec cho xuất video, chạy trong Worker (v0.22). © 2026 Gen Labs — All rights reserved.
 * VideoEncoder.isConfigSupported (VP9 trên Chromium / Linux) chặn luồng gọi ~80–150 ms — gọi trên luồng chính của Studio là một long task vượt ngân sách
 * 100 ms (spec §3, CNS-221). Worker này làm đúng phần dò codec của GCVideo.probe (studio/video/client.js) rồi trả kết quả; thứ tự như cũ:
 * MP4 (avc1 + mp4a) trước, rồi WebM (vp09 + opus). Nhận { w, h, prefer } → trả { format } (null = không có codec nào).
 */
'use strict';
self.onmessage = async function (e) {
  var o = e.data || {}, w = o.w, h = o.h, hd = w * h > 1280 * 720;
  async function vOK(codec, avc) { try { var c = { codec: codec, width: w, height: h, bitrate: hd ? 8e6 : 5e6, framerate: 30 }; if (avc) c.avc = { format: 'avc' }; return (await VideoEncoder.isConfigSupported(c)).supported === true; } catch (x) { return false; } }
  async function aOK(codec) { try { return (await AudioEncoder.isConfigSupported({ codec: codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 })).supported === true; } catch (x) { return false; } }
  var out = { mp4: null, webm: null };
  if (typeof VideoEncoder === 'function' && typeof AudioEncoder === 'function') {
    var avcs = hd ? ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'] : ['avc1.64001f', 'avc1.4d001f', 'avc1.42e01f'];
    if (await aOK('mp4a.40.2')) for (var i = 0; i < avcs.length && !out.mp4; i++) if (await vOK(avcs[i], true)) out.mp4 = { container: 'mp4', video: { codec: avcs[i], bitrate: hd ? 8e6 : 5e6 }, audio: { codec: 'mp4a.40.2', bitrate: 160000 } };
    var vp9 = hd ? 'vp09.00.40.08' : 'vp09.00.31.08';
    if (await vOK(vp9) && await aOK('opus')) out.webm = { container: 'webm', video: { codec: vp9, bitrate: hd ? 8e6 : 5e6 }, audio: { codec: 'opus', bitrate: 160000 } };
  }
  self.postMessage(out);
};
