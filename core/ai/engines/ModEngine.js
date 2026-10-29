/**
 * Phân tích chế độ âm giai (Major/Minor)
 */
class ModeEngine {
  constructor() {
    this.profiles = {
      major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 4.21],
      minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.35, 2.53, 4.84, 4.09, 2.71, 2.88, 3.70]
    };
  }

  classify(spectrum) {
    let majorSum = 0, minorSum = 0;
    for (let i = 0; i < 12; i++) {
      majorSum += spectrum[i] * this.profiles.major[i];
      minorSum += spectrum[i] * this.profiles.minor[i];
    }
    const total = majorSum + minorSum;
    return {
      mode: majorSum >= minorSum ? 'major' : 'minor',
      confidence: total > 0 ? Math.max(majorSum, minorSum) / total : 0.5
    };
  }
}

module.exports = new ModeEngine();