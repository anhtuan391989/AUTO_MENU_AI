/**
 * Quản lý Plugin
 */
const PluginService = require('../services/PluginService');
const PluginListener = require('../listeners/PluginListener');

class PluginManager {
  constructor() {
    this._bindEvents();
  }

  _bindEvents() {
    PluginListener.on('plugin_loaded', (p) => {
      console.log(`🔌 Plugin nạp: ${p.name}`);
    });
    PluginListener.on('plugin_unloaded', (p) => {
      console.log(`🔌 Plugin gỡ: ${p.name}`);
    });
  }

  register(name, type, version = "") {
    return PluginService.register(name, type, version);
  }

  enable(name) {
    return PluginService.enable(name);
  }

  disable(name) {
    return PluginService.disable(name);
  }

  list() {
    return PluginService.list();
  }

  listByType(type) {
    return PluginService.listByType(type);
  }
}

module.exports = new PluginManager();