/**
 * Thông tin Plugin
 */
class Plugin {
  constructor(name, type, version = "") {
    this.name = name;
    this.type = type;
    this.version = version;
    this.loaded = false;
    this.enabled = true;
    this.settings = {};
  }

  load() {
    this.loaded = true;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  setSetting(key, value) {
    this.settings[key] = value;
  }

  getSetting(key, defaultValue = null) {
    return this.settings[key] ?? defaultValue;
  }
}

module.exports = Plugin;