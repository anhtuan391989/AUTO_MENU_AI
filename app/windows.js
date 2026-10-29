/**
 * Quản lý cửa sổ
 */
class WindowManager {
  constructor() {
    this.windows = new Map();
    this.activeId = null;
  }

  register(id, window) {
    this.windows.set(id, window);
    if (!this.activeId) this.activeId = id;
  }

  getActive() {
    return this.windows.get(this.activeId);
  }

  focus(id) {
    if (this.windows.has(id)) {
      this.activeId = id;
      return true;
    }
    return false;
  }

  getAll() {
    return Array.from(this.windows.values());
  }
}

module.exports = new WindowManager();