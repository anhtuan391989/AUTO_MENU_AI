/**
 * Lắng nghe luồng âm thanh
 */
const EventEmitter = require('events');

class AudioListener extends EventEmitter {
  constructor() {
    super();
    this.isActive = false;
    this.bufferSize = 4096;
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    console.log("🎧 Đang lắng nghe âm thanh...");
  }

  stop() {
    this.isActive = false;
    console.log("⏹ Dừng lắng nghe âm thanh");
  }

  onData(callback) {
    this.on('audio_data', callback);
  }

  processBuffer(buffer) {
    if (!this.isActive) return;
    this.emit('audio_data', buffer);
  }
}

module.exports = new AudioListener();