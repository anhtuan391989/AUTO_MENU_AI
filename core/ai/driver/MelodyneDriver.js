/**
 * Driver Melodyne
 */
class MelodyneDriver {
  constructor() {
    this.name = "MelodyneDriver";
    this.connected = false;
  }

  connect() {
    this.connected = true;
    return true;
  }

  setScale(rootNote, mode) {
    if (!this.connected) return false;
    console.log(`🎶 Melodyne đặt âm giai: ${rootNote} ${mode}`);
    return true;
  }

  snapToScale() {
    if (!this.connected) return false;
    console.log("🎶 Căn chỉnh về âm giai");
    return true;
  }

  disconnect() {
    this.connected = false;
    return true;
  }
}

module.exports = new MelodyneDriver();