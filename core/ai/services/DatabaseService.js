/**
 * Kết nối Server Key — vừa tạo xong!
 */
const SERVER_URL = "https://menu-key-server.matuotluuly.workers.dev";

class DatabaseService {
  constructor() {
    this.serverUrl = SERVER_URL;
  }

  async healthCheck() {
    try {
      const res = await fetch(`${this.serverUrl}/health`);
      return await res.json();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async submitVote(songId, key, mode, weight = 1.0) {
    try {
      const res = await fetch(`${this.serverUrl}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, key, mode, weight })
      });
      return await res.json();
    } catch (err) {
      console.error("❌ Lỗi gửi phiếu:", err);
      return { error: err.message };
    }
  }

  async getSongKey(songId) {
    try {
      const res = await fetch(`${this.serverUrl}/key?id=${songId}`);
      return await res.json();
    } catch (err) {
      console.error("❌ Lỗi tra khóa:", err);
      return { found: false, error: err.message };
    }
  }
}

module.exports = new DatabaseService();