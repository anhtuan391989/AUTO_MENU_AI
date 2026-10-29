/**
 * Phân tích nhịp độ BPM
 */
const AudioService = require("../services/AudioService");
const SettingService = require("../services/SettingService");

class BPMEngine {
  constructor() {
    this.history = [];
  }

  async analyze(audioBuffer) {
    const rawBpm = this._detect(audioBuffer);
    const smoothed = this._smooth(rawBpm);
    
    this.history.push(smoothed);
    if (this.history.length > 10) this.history.shift();
    
    return {
      value: smoothed,
      confidence: this._calcConfidence(smoothed),
      unit: "BPM"
    };
  }

  _detect(buffer) {
    const data = buffer.getChannelData(0);
    const rate = buffer.sampleRate;
    const blockSize = Math.floor(rate * 0.05);
    const energies = [];
    
    for (let i = 0; i < data.length; i += blockSize) {
      let sum = 0;
      for (let j = 0; j < blockSize && i + j < data.length; j++) {
        sum += Math.abs(data[i + j]);
      }
      energies.push(sum / blockSize);
    }

    let maxCorr = 0, bestLag = 0;
    for (let lag = 8; lag < 60; lag++) {
      let corr = 0;
      for (let i = 0; i < energies.length - lag; i++) {
        corr += energies[i] * energies[i + lag];
      }
      if (corr > maxCorr) { maxCorr = corr; bestLag = lag; }
    }
    return 60 / (bestLag * 0.05);
  }

  _smooth(raw) {
    const sens = SettingService.get("bpmSensitivity");
    if (this.history.length === 0) return Math.round(raw);
    const prev = this.history[this.history.length - 1];
    const alpha = 0.3 * sens;
    return Math.round(prev * (1 - alpha) + raw * alpha);
  }

  _calcConfidence(bpm) {
    if (this.history.length < 3) return 0.5;
    const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    const variance = this.history.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / this.history.length;
    return Math.max(0.3, 1 - variance / 100);
  }
}

module.exports = new BPMEngine();