/**
 * Quản lý Plugin
 */
const Plugin = require("../models/Plugin");

class PluginService {
  constructor() {
    this.plugins = new Map();
  }

  register(name, type, version = "") {
    const plugin = new Plugin(name, type, version);
    this.plugins.set(name, plugin);
    return plugin;
  }

  get(name) {
    return this.plugins.get(name);
  }

  list() {
    return Array.from(this.plugins.values());
  }

  listByType(type) {
    return this.list().filter(p => p.type === type);
  }

  enable(name) {
    const p = this.get(name);
    if (p) { p.enable(); return true; }
    return false;
  }

  disable(name) {
    const p = this.get(name);
    if (p) { p.disable(); return true; }
    return false;
  }
}

module.exports = new PluginService();