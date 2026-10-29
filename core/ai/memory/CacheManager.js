/**
 * Quản lý Bộ đệm
 */
const CacheService = require('../services/CacheService');

class CacheManager {
  constructor() {
    setInterval(() => CacheService.cleanup(), 60000);
  }

  set(key, value, ttl) {
    CacheService.set(key, value, ttl);
  }

  get(key) {
    return CacheService.get(key);
  }

  has(key) {
    return CacheService.has(key);
  }

  delete(key) {
    return CacheService.delete(key);
  }

  clear() {
    CacheService.clear();
  }
}

module.exports = new CacheManager();