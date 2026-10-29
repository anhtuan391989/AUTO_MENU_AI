/**
 * Lịch sử phân tích
 */
class HistoryManager {
  constructor() {
    this.records = [];
    this.maxSize = 100;
  }

  add(record) {
    this.records.unshift({
      ...record,
      timestamp: Date.now()
    });
    if (this.records.length > this.maxSize) {
      this.records = this.records.slice(0, this.maxSize);
    }
  }

  getBySongId(songId) {
    return this.records.filter(r => r.songId === songId);
  }

  getRecent(limit = 10) {
    return this.records.slice(0, limit);
  }

  clear() {
    this.records = [];
  }
}

module.exports = new HistoryManager();