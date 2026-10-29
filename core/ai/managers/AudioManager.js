/**
 * Quản lý toàn bộ luồng âm thanh
 */
const AudioListener = require('../listeners/AudioListener');
const KeyEngine = require('../engines/KeyEngine');
const BPMEngine = require('../engines/BPMEngine');

class AudioManager {
  constructor() {
    this.analyzers = [];
    this._bindEvents();
  }

  _bindEvents() {
    AudioListener.onData(async (buffer) => {
      for (const analyzer of this.analyzers) {
        await analyzer.process(buffer);
      }
    });
  }

  registerAnalyzer(analyzer) {
    this.analyzers.push(analyzer);
  }

  startCapture() {
    AudioListener.start();
  }

  stopCapture() {
    AudioListener.stop();
  }
}

module.exports = new AudioManager();