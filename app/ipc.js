/**
 * IPC — Giao tiếp giữa các tiến trình
 */
class IPC {
  constructor() {
    this.handlers = new Map();
  }

  on(channel, handler) {
    this.handlers.set(channel, handler);
  }

  send(channel, data = {}) {
    const handler = this.handlers.get(channel);
    if (handler) return handler(data);
    return null;
  }
}

module.exports = new IPC();