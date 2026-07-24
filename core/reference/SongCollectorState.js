const { buildCacheKey } = require("./SongCollectorUtils");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * SongCollectorState
 * ----------------------------------------------------------
 * Cache TRONG BỘ NHỚ (không ghi đĩa) nhớ bài hát vừa xử lý gần nhất
 * trong phiên làm việc hiện tại, để AutoSongCollector không phải
 * đọc/ghi songs.json ở MỌI lần gọi collect() — Key/BPM Engine có thể
 * bắn kết quả liên tục (mỗi vài trăm ms) ngay cả khi bài hát đã ổn
 * định và đã lưu xong từ trước.
 *
 * Đây CHỈ là tối ưu hiệu năng (giảm I/O đĩa). SongDatabase vẫn là
 * nguồn sự thật cuối cùng và tự nó đã chống ghi trùng — dù State bị
 * reset (vd restart app) thì dữ liệu vẫn không thể trùng lặp.
 *
 * Chống Memory Leak: Map không có key nào bị thêm vô hạn — mỗi bài
 * hát (title+artist) chỉ chiếm đúng 1 entry, ghi đè entry cũ khi có
 * kết quả mới (không phải mảng lịch sử phình to dần). Không dùng
 * setInterval/setTimeout/listener nào cả — không có gì để "leak".
 * ==========================================================
 */

class SongCollectorState {

    constructor() {

        this._cache = new Map();

    }

    get(title, artist) {

        return this._cache.get(buildCacheKey(title, artist)) || null;

    }

    set(title, artist, data) {

        this._cache.set(buildCacheKey(title, artist), {
            key: data.key,
            bpm: data.bpm,
            lastProcessedAt: Date.now()
        });

    }

    has(title, artist) {

        return this._cache.has(buildCacheKey(title, artist));

    }

    // Dùng cho test / cho phép reset thủ công khi cần (vd người dùng đổi bài
    // hát thủ công và muốn buộc kiểm tra lại DB ngay, thay vì chờ cache).
    clear() {

        this._cache.clear();

    }

    get size() {

        return this._cache.size;

    }

}

module.exports = new SongCollectorState();
