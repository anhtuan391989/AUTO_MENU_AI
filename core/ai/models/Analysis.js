/**
 * Kết quả phân tích
 */
class Analysis {
  constructor(songId) {
    this.songId = songId;
    this.keyCandidates = [];
    this.bpmEstimate = null;
    this.confidence = 0;
    this.method = "";
    this.timestamp = Date.now();
  }

  addKeyCandidate(key, mode, confidence) {
    this.keyCandidates.push({ key, mode, confidence });
    this.keyCandidates.sort((a, b) => b.confidence - a.confidence);
  }

  getBestKey() {
    return this.keyCandidates.length > 0 ? this.keyCandidates[0] : null;
  }

  setBpm(bpm, confidence = 0.8) {
    this.bpmEstimate = { value: bpm, confidence };
  }

  toJSON() {
    return {
      songId: this.songId,
      keyCandidates: this.keyCandidates,
      bpmEstimate: this.bpmEstimate,
      confidence: this.confidence,
      method: this.method,
      timestamp: this.timestamp
    };
  }
}

module.exports = Analysis;