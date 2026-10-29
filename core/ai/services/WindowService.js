/**
 * Theo dõi cửa sổ hệ thống
 */
class WindowService {
  constructor() {
    this.activeWindow = null;
    this.listeners = [];
    this.dawProcessNames = ["Studio One", "REAPER", "Cubase", "FL64", "Ableton Live"];
  }

  setActiveWindow(title, processName) {
    this.activeWindow = { title, processName, changedAt: Date.now() };
    this._notifyAll();
  }

  getActiveWindow() {
    return this.activeWindow;
  }

  isDAWActive() {
    if (!this.activeWindow) return false;
    return this.dawProcessNames.some(name =>
      this.activeWindow.processName.includes(name) ||
      this.activeWindow.title.includes(name)
    );
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  _notifyAll() {
    this.listeners.forEach(cb => cb(this.activeWindow));
  }
}

module.exports = new WindowService();