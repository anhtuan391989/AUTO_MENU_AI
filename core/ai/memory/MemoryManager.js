/**
 * Quản lý Bộ nhớ chung
 */
const CacheManager = require('./CacheManager');
const FingerprintManager = require('./FingerprintManager');
const HistoryManager = require('./HistoryManager');

class MemoryManager {
  constructor() {
    this.cache = CacheManager;
    this.fingerprint = FingerprintManager;
    this.history = HistoryManager;
  }

  cleanup() {
    this.cache.clear();
    console.log("🧹 Đã dọn dẹp bộ nhớ");
  }

  getStats() {
    return {
      historySize: this.history.records.length,
      fingerprintCount: this.fingerprint.fingerprints.size
    };
  }
}

module.exports = new MemoryManager();