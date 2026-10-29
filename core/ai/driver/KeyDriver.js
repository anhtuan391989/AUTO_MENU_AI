/**
 * Driver điều khiển phím tắt
 */
class KeyDriver {
  constructor() {
    this.name = "KeyDriver";
    this.connected = false;
    this.mapping = {};
  }

  connect() {
    this.connected = true;
    return true;
  }

  registerAction(action, key) {
    this.mapping[action] = key;
  }

  trigger(action) {
    if (!this.connected) return false;
    const key = this.mapping[action];
    if (!key) return false;
    console.log(`⌨️ Nhấn: ${key} (${action})`);
    return true;
  }

  disconnect() {
    this.connected = false;
    return true;
  }
}

module.exports = new KeyDriver();