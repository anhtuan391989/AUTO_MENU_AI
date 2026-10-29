/**
 * Dấu vân tay âm thanh
 */
class FingerprintManager {
  constructor() {
    this.fingerprints = new Map();
  }

  generate(songId, spectrum) {
    const hash = this._hashSpectrum(spectrum);
    this.fingerprints.set(songId, hash);
    return hash;
  }

  match(spectrum, threshold = 0.85) {
    const queryHash = this._hashSpectrum(spectrum);
    let best = { songId: null, similarity: 0 };
    
    for (const [songId, storedHash] of this.fingerprints) {
      const sim = this._similarity(queryHash, storedHash);
      if (sim > best.similarity) {
        best = { songId, similarity: sim };
      }
    }
    return best.similarity >= threshold ? best : null;
  }

  _hashSpectrum(spectrum) {
    return spectrum.map(v => v > 0.5 ? 1 : 0).join('');
  }

  _similarity(h1, h2) {
    let same = 0;
    const len = Math.min(h1.length, h2.length);
    for (let i = 0; i < len; i++) {
      if (h1[i] === h2[i]) same++;
    }
    return same / Math.max(h1.length, h2.length, 1);
  }
}

module.exports = new FingerprintManager();