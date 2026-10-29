/**
 * Bộ nhớ đệm
 */
class CacheService {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000;
  }

  set(key, value, ttl = this.ttl) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    for (const [key, entry] of this.cache.entries()) {
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

module.exports = new CacheService();