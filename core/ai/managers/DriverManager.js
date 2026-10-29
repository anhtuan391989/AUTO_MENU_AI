/**
 * Quản lý kết nối các Driver DAW
 */
const DriverService = require('../services/DriverService');

class DriverManager {
  constructor() {
    this.activeDriverName = null;
  }

  async connectTo(driverName) {
    const ok = DriverService.connect(driverName);
    if (ok) {
      this.activeDriverName = driverName;
      console.log(`✅ Đã kết nối: ${driverName}`);
    }
    return ok;
  }

  async disconnect() {
    DriverService.disconnect();
    this.activeDriverName = null;
    console.log("⏹ Đã ngắt kết nối DAW");
  }

  getActive() {
    return DriverService.getActiveDriver();
  }

  listAvailable() {
    return DriverService.getAllDrivers().map(d => d.name);
  }
}

module.exports = new DriverManager();