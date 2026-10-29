/**
 * Theo dõi trạng thái Hệ thống
 */
const EventEmitter = require('events');

class SystemListener extends EventEmitter {
  constructor() {
    super();
    this.status = 'idle';
  }

  setBusy() {
    this.status = 'busy';
    this.emit('status_change', 'busy');
  }

  setIdle() {
    this.status = 'idle';
    this.emit('status_change', 'idle');
  }

  reportError(error) {
    this.emit('error', { message: error.message, timestamp: Date.now() });
  }

  getStatus() {
    return this.status;
  }
}

module.exports = new SystemListener();