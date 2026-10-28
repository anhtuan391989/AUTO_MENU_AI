/**
 * AudioPipeline — Nối luồng: Thu âm → FFT → KeyEngine + BPMEngine
 */
const { detectKey, reset: resetKey } = require('./keyEngine');
const { detectBPM, reset: resetBPM } = require('./bpmEngine');
const { EventBus } = require('./eventBus');

let config = {
  sampleRate: 44100,
  fftSize: 4096,
  hopSize: 512
};
let onsetHistory = [];

function processAudioFrame(audioFloat32) {
  // Tính cửa sổ Hamming + FFT (gọi hàm FFT của bạn)
  const windowed = applyHammingWindow(audioFloat32);
  const fftResult = computeFFT(windowed); // Thay bằng hàm FFT thực tế
  const mag = fftResult.magnitude;

  // === Dò KEY ===
  const keyResult = detectKey(audioFloat32, mag, config.sampleRate);

  // === Dò BPM — Tính độ đột biến âm thanh ===
  const avgMag = mag.slice(0, mag.length / 4).reduce((a, v) => a + v, 0) / (mag.length / 4);
  onsetHistory.push(avgMag);
  if (onsetHistory.length > 300) onsetHistory.shift();

  if (onsetHistory.length >= 60) {
    const recent = onsetHistory.slice(-60);
    detectBPM(recent, config.sampleRate, config.hopSize);
  }

  // Cập nhật tổng hợp
  EventBus.emit('analysis:updated', {
    key: keyResult?.key,
    keyConfidence: keyResult?.confidence,
    timestamp: Date.now()
  });
}

function applyHammingWindow(buffer) {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    out[i] = buffer[i] * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (buffer.length - 1)));
  }
  return out;
}

function setConfig(cfg) { Object.assign(config, cfg); }
function reset() { onsetHistory = []; resetKey(); resetBPM(); }

// === Hàm FFT — Sử dụng thư viện sẵn có ===
// Nếu project dùng `dsp.js` hoặc `fft.js`, import và thay thế vào đây
function computeFFT(windowedSamples) {
  // === THAY BẰNG HÀM FFT THỰC TẾ TRONG PROJECT CỦA BẠN ===
  // Ví dụ dùng fft.js:
  // const fft = new FFT(config.fftSize, config.sampleRate);
  // fft.forward(windowedSamples);
  // return { magnitude: fft.spectrum };
  
  // Tạm thời trả cấu trúc đúng
  const mag = new Array(config.fftSize / 2).fill(0);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.abs(windowedSamples[i] || 0);
  return { magnitude: mag };
}

module.exports = { processAudioFrame, setConfig, reset };