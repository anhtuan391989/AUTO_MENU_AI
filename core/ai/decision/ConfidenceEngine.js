/**
 * Đánh giá độ tin cậy kết quả
 */
class ConfidenceEngine {
  constructor() {
    this.weights = {
      consistency: 0.4,
      history: 0.3,
      energy: 0.3
    };
  }

  calculate(analysisHistory, currentValue, energyLevel) {
    const consistency = this._calcConsistency(analysisHistory, currentValue);
    const historyScore = Math.min(1, analysisHistory.length / 5);
    const energyScore = Math.min(1, energyLevel * 2);

    return (
      consistency * this.weights.consistency +
      historyScore * this.weights.history +
      energyScore * this.weights.energy
    );
  }

  _calcConsistency(history, current) {
    if (history.length === 0) return 0.5;
    const matches = history.filter(v => v === current).length;
    return matches / history.length;
  }

  shouldTrust(confidence, threshold = 0.6) {
    return confidence >= threshold;
  }
}

module.exports = new ConfidenceEngine();