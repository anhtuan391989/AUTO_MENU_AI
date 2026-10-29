/**
 * Driver SoundShifter
 */
class SoundShifterDriver {
  constructor() {
    this.name = "SoundShifterDriver";
    this.connected = false;
  }

  connect() {
    this.connected = true;
    return true;
  }

  transpose(semitones) {
    if (!this.connected) return false;
    console.log(`🔄 Dịch cao/thấp: ${semitones} nửa cung`);
    return true;
  }

  reset() {
    if (!this.connected) return false;
    console.log("🔄 Đặt lại cao độ");
    return true;
  }

  disconnect() {
    this.connected = false;
    return true;
  }
}

module.exports = new SoundShifterDriver();