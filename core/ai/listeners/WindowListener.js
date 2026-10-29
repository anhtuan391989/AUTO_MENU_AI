/**
 * Theo dõi thay đổi Cửa sổ
 */
const EventEmitter = require('events');
const WindowService = require('../services/WindowService');

class WindowListener extends EventEmitter {
  constructor() {
    super();
    this.lastTitle = '';
  }

  update(title, processName) {
    if (title !== this.lastTitle) {
      this.lastTitle = title;
      WindowService.setActiveWindow(title, processName);
      this.emit('window_changed', { title, processName });
      
      if (WindowService.isDAWActive()) {
        this.emit('daw_focused', { title });
      }
    }
  }
}

module.exports = new WindowListener();