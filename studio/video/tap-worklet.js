/* gen-chibi — "vòi" lấy tiếng của trang xuất video (AudioWorklet chạy trong OfflineAudioContext). © 2026 Gen Labs — All rights reserved.
 * Đứng cuối chuỗi trộn của engine/audio.js (thay ctx.destination): chép PCM stereo, gửi về luồng chính từng khối 4096 mẫu
 * (khối cuối khi đủ processorOptions.end mẫu) → AudioEncoder mã hoá dần trong lúc dựng hình → WebM ghi luồng có xen kẽ tiếng / hình (CNS-220).
 * Đầu ra của nút là im lặng (đích của OfflineAudioContext chỉ 1 kênh — không giữ bản PCM stereo thứ hai trong bộ nhớ). */
class GCTap extends AudioWorkletProcessor {
  constructor(o) {
    super();
    this.B = 4096; this.l = new Float32Array(this.B); this.r = new Float32Array(this.B); this.n = 0; this.total = 0;
    this.end = (o && o.processorOptions && o.processorOptions.end) || Infinity;
  }
  process(inputs) {
    const inp = inputs[0] || [], L = inp[0], R = inp[1] || inp[0];
    for (let k = 0; k < 128; k++) { this.l[this.n] = L ? L[k] : 0; this.r[this.n] = R ? R[k] : 0; this.n++; }
    this.total += 128;
    if (this.n >= this.B || this.total >= this.end) {
      const l = this.l.slice(0, this.n), r = this.r.slice(0, this.n);
      this.port.postMessage({ l, r }, [l.buffer, r.buffer]);
      this.n = 0;
    }
    return true;
  }
}
registerProcessor('gc-tap', GCTap);
