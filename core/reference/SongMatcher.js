const SongDatabase = require("./SongDatabase");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * SongMatcher
 * ----------------------------------------------------------
 * Nhận Title/Artist (thường lấy từ tên file đang phát hoặc người dùng
 * gõ tay), tìm bài hát tham chiếu tương ứng trong SongDatabase.
 *
 * Khác với SongDatabase.getSong() (so khớp CHÍNH XÁC, dùng cho
 * update/remove theo khoá), SongMatcher so khớp "mờ" hơn: bỏ dấu
 * tiếng Việt, bỏ ký tự phụ thường gặp trong tên file nhạc (vd
 * "(Karaoke)", "[Beat]", "- Official MV"), rồi mới so sánh. Mục
 * đích: tăng khả năng khớp đúng khi Title đến từ tên file thực tế
 * thay vì dữ liệu nhập tay sạch sẽ.
 *
 * Không tìm thấy -> trả về null (không throw), vì "không có tham
 * chiếu" là kết quả hợp lệ, không phải lỗi.
 * ==========================================================
 */

// Các cụm hay gặp trong tên file nhạc Việt Nam, không phải 1 phần tên bài
// hát thật -> loại bỏ trước khi so khớp để tăng tỉ lệ khớp đúng.
const NOISE_PATTERNS = [
    /\(karaoke\)/gi,
    /\(beat\)/gi,
    /\[beat\]/gi,
    /\(mv\)/gi,
    /- official( mv| audio| lyrics)?/gi,
    /official( mv| audio| lyrics)?/gi,
    /lyrics? video/gi
];

function stripDiacritics(value) {

    // NFD tách chữ cái khỏi dấu, sau đó loại bỏ dấu (Unicode combining marks)
    // -> "Đêm Trắng" và "dem trang" so khớp được với nhau.
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, (m) => (m === "đ" ? "d" : "D"));

}

function normalizeForMatch(value) {

    let result = String(value || "");

    for (const pattern of NOISE_PATTERNS) {

        result = result.replace(pattern, " ");

    }

    result = stripDiacritics(result);
    result = result.toLowerCase().replace(/\s+/g, " ").trim();

    return result;

}

class SongMatcher {

    // Trả về Song Reference (object) nếu tìm thấy, ngược lại trả về null.
    findReference(title, artist) {

        if (!title || !String(title).trim()) return null;

        // Bước 1: thử so khớp chính xác trước (nhanh, đúng ngay nếu dữ liệu sạch).
        const exact = SongDatabase.getSong(title, artist);
        if (exact) return exact;

        // Bước 2: so khớp mờ trên toàn bộ danh sách.
        const songs = SongDatabase.load();
        const normTitle = normalizeForMatch(title);
        const normArtist = artist ? normalizeForMatch(artist) : null;

        if (!normTitle) return null;

        const found = songs.find((s) => {

            if (normalizeForMatch(s.title) !== normTitle) return false;
            if (normArtist && normalizeForMatch(s.artist) !== normArtist) return false;
            return true;

        });

        return found || null;

    }

}

module.exports = new SongMatcher();
