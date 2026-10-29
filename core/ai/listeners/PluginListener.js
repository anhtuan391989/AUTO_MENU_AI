/**
 * Theo dõi trạng thái Plugin
 */
const EventEmitter = require('events');

class PluginListener extends EventEmitter {
  constructor() {
    super();
    this.activePlugins = new Set();
  }

  detect(name, isLoaded) {
    const had = this.activePlugins.has(name);
    if (isLoaded && !had) {
      this.activePlugins.add(name);
      this.emit('plugin_loaded', { name });
    } else if (!isLoaded && had) {
      this.activePlugins.delete(name);
      this.emit('plugin_unloaded', { name });
    }
  }

  isActive(name) {
    return this.activePlugins.has(name);
  }
}

module.exports = new PluginListener();