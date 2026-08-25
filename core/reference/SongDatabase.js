const fs = require("fs");
const path = require("path");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * SongDatabase
 * ----------------------------------------------------------
 * Đọc/ghi danh sách bài hát tham chiếu tại `data/songs.json`.
 * CHỈ lưu trữ (CRUD) — không so khớp (đó là việc của SongMatcher),
 * không so sánh Key (đó là việc của KeyVerifier).
 *
 * Không hardcode dữ liệu: file rỗng ([]) lúc khởi tạo, dữ liệu do
 * người dùng/ứng dụng tự thêm qua addSong().
 *
 * Mỗi bài hát lưu dạng:
 *   { title, artist, key, bpm, modulation, notes }
 * Trong đó `key` theo đúng định dạng KeyEngine đang dùng, ví dụ
 * "C Major" / "G# Minor" (xem ui/js/engines/keyEngine.js, NOTE_NAMES).
 * ==========================================================
 */

const DATA_FILE = path.resolve(__dirname, "..", "..", "data", "songs.json"); // core/reference/../../data/songs.json = <project root>/data/songs.json

class SongDatabase {

    constructor() {

        this.filePath = DATA_FILE;

    }

    // So khớp title/artist không phân biệt hoa/thường và khoảng trắng thừa —
    // dùng cho thao tác CHÍNH XÁC (update/remove/getSong theo khoá).
    // Việc so khớp "mờ" (bỏ dấu tiếng Việt, gần đúng) là việc của SongMatcher,
    // không đặt ở đây để giữ đúng Single Responsibility.
    _normalize(value) {

        return String(value || "").trim().toLowerCase();

    }

    _ensureDataFile() {

        const dir = path.dirname(this.filePath);

        if (!fs.existsSync(dir)) {

            fs.mkdirSync(dir, { recursive: true });

        }

        if (!fs.existsSync(this.filePath)) {

            fs.writeFileSync(this.filePath, "[]\n", "utf-8");

        }

    }

    // Đọc lại từ đĩa mỗi lần gọi (không giữ cache trong bộ nhớ) — dữ liệu bài
    // hát ít khi thay đổi trong lúc app đang chạy, ưu tiên luôn đúng dữ liệu
    // mới nhất trên đĩa hơn là tối ưu tốc độ đọc.
    load() {

        this._ensureDataFile();

        const raw = fs.readFileSync(this.filePath, "utf-8");

        let songs;

        try {

            songs = JSON.parse(raw);

        } catch (err) {

            throw new Error(`SongDatabase: songs.json không phải JSON hợp lệ (${err.message})`);

        }

        if (!Array.isArray(songs)) {

            throw new Error("SongDatabase: songs.json phải chứa 1 mảng (array)");

        }

        return songs;

    }

    save(songs) {

        if (!Array.isArray(songs)) {

            throw new Error("SongDatabase.save: dữ liệu truyền vào phải là 1 mảng (array)");

        }

        this._ensureDataFile();

        fs.writeFileSync(this.filePath, JSON.stringify(songs, null, 4) + "\n", "utf-8");

        return songs;

    }

    // Trả về đúng 1 bài hát khớp title (+ artist nếu có truyền vào), hoặc
    // null nếu không tìm thấy. Đây là tra cứu CHÍNH XÁC (đã chuẩn hoá hoa/
    // thường + khoảng trắng) — muốn tìm "gần đúng" thì dùng SongMatcher.
    getSong(title, artist) {

        if (!title) return null;

        const songs = this.load();
        const normTitle = this._normalize(title);
        const normArtist = artist !== undefined && artist !== null && artist !== "" ? this._normalize(artist) : null;

        const found = songs.find((s) => {

            if (this._normalize(s.title) !== normTitle) return false;
            if (normArtist !== null && this._normalize(s.artist) !== normArtist) return false;
            return true;

        });

        return found || null;

    }

    // Thêm bài hát mới. Không cho thêm trùng (title + artist) để tránh dữ
    // liệu tham chiếu mơ hồ (2 bản ghi cùng bài -> không biết dùng bản nào).
    addSong(song) {

        if (!song || !song.title) {

            throw new Error("SongDatabase.addSong: thiếu 'title'");

        }

        const songs = this.load();

        if (this.getSong(song.title, song.artist)) {

            throw new Error(`SongDatabase.addSong: bài hát đã tồn tại (title="${song.title}", artist="${song.artist || ""}")`);

        }

        const entry = {
            title: song.title,
            artist: song.artist || "",
            key: song.key || "",
            bpm: typeof song.bpm === "number" ? song.bpm : null,
            modulation: song.modulation || null,
            notes: song.notes || ""
        };

        songs.push(entry);
        this.save(songs);

        return entry;

    }

    // Cập nhật 1 phần thông tin bài hát đã có (tìm theo title/artist cũ).
    updateSong(title, artist, updates) {

        const songs = this.load();
        const normTitle = this._normalize(title);
        const normArtist = artist !== undefined && artist !== null && artist !== "" ? this._normalize(artist) : null;

        const idx = songs.findIndex((s) => {

            if (this._normalize(s.title) !== normTitle) return false;
            if (normArtist !== null && this._normalize(s.artist) !== normArtist) return false;
            return true;

        });

        if (idx === -1) {

            throw new Error(`SongDatabase.updateSong: không tìm thấy bài hát (title="${title}", artist="${artist || ""}")`);

        }

        songs[idx] = { ...songs[idx], ...updates };
        this.save(songs);

        return songs[idx];

    }

    removeSong(title, artist) {

        const songs = this.load();
        const normTitle = this._normalize(title);
        const normArtist = artist !== undefined && artist !== null && artist !== "" ? this._normalize(artist) : null;

        const before = songs.length;

        const remaining = songs.filter((s) => {

            const titleMatches = this._normalize(s.title) === normTitle;
            const artistMatches = normArtist === null ? true : this._normalize(s.artist) === normArtist;
            return !(titleMatches && artistMatches);

        });

        this.save(remaining);

        return before - remaining.length; // số bản ghi đã xoá (0 nếu không tìm thấy)

    }

}

module.exports = new SongDatabase();
