/**
 * Cấu hình hệ thống
 */
class SettingService {
  constructor() {
    this._settings = {
      serverUrl: "https://menu-key-server.matuotluuly.workers.dev",
      autoSubmit: true,
      minConfidence: 0.6,
      requiredVotes: 3,
      bpmSensitivity: 1.0,
      detectKey: true,
      detectBPM: true
    };
    this._listeners = [];
  }

  get(key, defaultValue = null) {
    return this._settings[key] ?? defaultValue;
  }

  set(key, value) {
    this._settings[key] = value;
    this._notify(key, value);
  }

  getAll() {
    return { ...this._settings };
  }

  batchUpdate(obj) {
    for (const [k, v] of Object.entries(obj)) {
      this._settings[k] = v;
      this._notify(k, v);
    }
  }

  subscribe(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  _notify(key, value) {
    this._listeners.forEach(cb => cb(key, value));
  }

  reset() {
    this._settings = {
      serverUrl: "https://menu-key-server.matuotluuly.workers.dev",
      autoSubmit: true,
      minConfidence: 0.6,
      requiredVotes: 3,
      bpmSensitivity: 1.0,
      detectKey: true,
      detectBPM: true
    };
  }
}

module.exports = new SettingService();