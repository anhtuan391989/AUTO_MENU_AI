const SongDatabase = require("./SongDatabase");
const SongMatcher = require("./SongMatcher");
const KeyVerifier = require("./KeyVerifier");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * index.js
 * ----------------------------------------------------------
 * Điểm vào duy nhất của module Song Reference System. KHÔNG tự
 * động require() ở đâu khác trong project — module này CHƯA được
 * gắn vào Event Flow/IPC hiện có (đúng yêu cầu: chỉ bổ sung, không
 * đổi luồng đang chạy). Muốn dùng, nơi gọi (vd 1 file mới trong
 * app/ hoặc core/ai/) tự require("../reference") khi cần.
 * ==========================================================
 */

module.exports = {
    SongDatabase,
    SongMatcher,
    KeyVerifier
};
