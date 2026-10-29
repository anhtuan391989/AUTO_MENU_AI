/**
 * Quản lý Cấu hình
 */
const SettingService = require('../services/SettingService');

class SettingManager {
  constructor() {
    this.subscribers = [];
  }

  get(key, defaultValue = null) {
    return SettingService.get(key, defaultValue);
  }

  set(key, value) {
    SettingService.set(key, value);
  }

  getAll() {
    return SettingService.getAll();
  }

  batchUpdate(obj) {
    SettingService.batchUpdate(obj);
  }

  reset() {
    SettingService.reset();
  }

  subscribe(callback) {
    return SettingService.subscribe(callback);
  }
}

module.exports = new SettingManager();