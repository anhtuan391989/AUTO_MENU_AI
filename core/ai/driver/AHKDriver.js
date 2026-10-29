/**
 * Driver AutoHotkey
 */
const { exec } = require('child_process');

class AHKDriver {
  constructor() {
    this.name = "AHKDriver";
    this.connected = false;
  }

  connect() {
    this.connected = true;
    return true;
  }

  sendCommand(scriptPath) {
    if (!this.connected) return false;
    exec(`"${scriptPath}"`);
    return true;
  }

  pressKey(key) {
    if (!this.connected) return false;
    exec(`echo "${key}" | powershell -c "$ws = New-Object -ComObject WScript.Shell; $ws.SendKeys('${key}')"`);
    return true;
  }

  disconnect() {
    this.connected = false;
    return true;
  }
}

module.exports = new AHKDriver();