/**
 * Phân tích hòa âm
 */
class HarmonyEngine {
  constructor() {
    this.chordTemplates = {
      major: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
      minor: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]
    };
    this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  }

  detectChords(spectrum) {
    const chords = [];
    for (let root = 0; root < 12; root++) {
      let majorScore = 0, minorScore = 0;
      for (let i = 0; i < 12; i++) {
        const idx = (root + i) % 12;
        majorScore += spectrum[idx] * this.chordTemplates.major[i];
        minorScore += spectrum[idx] * this.chordTemplates.minor[i];
      }
      if (majorScore > 0.5) chords.push({ root: this.noteNames[root], type: 'major', score: majorScore });
      if (minorScore > 0.5) chords.push({ root: this.noteNames[root], type: 'minor', score: minorScore });
    }
    return chords.sort((a, b) => b.score - a.score);
  }

  getProgression(chords) {
    if (chords.length === 0) return [];
    return chords.slice(0, 4).map(c => `${c.root}${c.type === 'minor' ? 'm' : ''}`);
  }
}

module.exports = new HarmonyEngine();