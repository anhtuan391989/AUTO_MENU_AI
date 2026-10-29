/**
 * Quản lý kết nối DAW
 */
class DriverService {
  constructor() {
    this.drivers = new Map();
    this.activeDriver = null;
  }

  register(driver) {
    this.drivers.set(driver.name, driver);
  }

  connect(name) {
    const driver = this.drivers.get(name);
    if (!driver) return false;
    if (driver.connect()) {
      this.activeDriver = driver;
      return true;
    }
    return false;
  }

  disconnect() {
    if (this.activeDriver) {
      this.activeDriver.disconnect();
      this.activeDriver = null;
      return true;
    }
    return false;
  }

  getActiveDriver() {
    return this.activeDriver;
  }

  getAllDrivers() {
    return Array.from(this.drivers.values());
  }
}

module.exports = new DriverService();