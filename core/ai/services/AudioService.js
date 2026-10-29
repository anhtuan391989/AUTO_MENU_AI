/**
 * Phân tích âm thanh
 */
class AudioService {
  constructor() {
    this.sampleRate = 44100;
    this.fftSize = 2048;
    this.isAnalyzing = false;
  }

  async analyzeBuffer(audioBuffer) {
    this.isAnalyzing = true;
    try {
      const channelData = audioBuffer.getChannelData(0);
      const bpm = this.detectBPM(channelData, audioBuffer.sampleRate);
      const keyResult = this.detectKey(channelData, audioBuffer.sampleRate);
      
      return {
        bpm,
        key: keyResult.key,
        mode: keyResult.mode,
        confidence: keyResult.confidence
      };
    } finally {
      this.isAnalyzing = false;
    }
  }

  detectBPM(samples, sampleRate) {
    let energy = [];
    const blockSize = Math.floor(sampleRate * 0.05);
    for (let i = 0; i < samples.length; i += blockSize) {
      let sum = 0;
      for (let j = 0; j < blockSize && i + j < samples.length; j++) {
        sum += Math.abs(samples[i + j]);
      }
      energy.push(sum / blockSize);
    }
    let maxCorr = 0, lag = 0;
    for (let t = 10; t < 100; t++) {
      let corr = 0;
      for (let i = 0; i < energy.length - t; i++) {
        corr += energy[i] * energy[i + t];
      }
      if (corr > maxCorr) { maxCorr = corr; lag = t; }
    }
    return Math.round(60 / (lag * 0.05));
  }

  detectKey(samples, sampleRate) {
    const keyProfiles = {
      major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 4.21],
      minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.35, 2.53, 4.84, 4.09, 2.71, 2.88, 3.70]
    };
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    const spectrum = new Array(12).fill(0);
    for (let i = 0; i < samples.length; i += 512) {
      const magnitude = Math.abs(samples[i]);
      const note = Math.round(12 * Math.log2((i / samples.length) * 440 + 1)) % 12;
      spectrum[note] += magnitude;
    }

    let best = { key: 'C', mode: 'major', score: -Infinity };
    for (let offset = 0; offset < 12; offset++) {
      let majorScore = 0, minorScore = 0;
      for (let i = 0; i < 12; i++) {
        const idx = (i + offset) % 12;
        majorScore += spectrum[idx] * keyProfiles.major[i];
        minorScore += spectrum[idx] * keyProfiles.minor[i];
      }
      if (majorScore > best.score) {
        best = { key: noteNames[offset], mode: 'major', score: majorScore };
      }
      if (minorScore > best.score) {
        best = { key: noteNames[offset], mode: 'minor', score: minorScore };
      }
    }
    return { key: best.key, mode: best.mode, confidence: Math.min(1, best.score / 1000) };
  }
}

module.exports = new AudioService();