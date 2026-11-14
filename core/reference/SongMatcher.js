const SongDatabase = require("./SongDatabase");
const RecordingDuration = require("./RecordingDuration");

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

    // Chuẩn hoá để SO SÁNH TRÙNG (bỏ dấu, hạ chữ thường, gộp khoảng trắng) —
    // KHÔNG bỏ cụm nhiễu như "(Karaoke)", để 2 bản ghi khác bản không bị coi là một.
    fold(value) {

        return stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();

    }

    // Trả về Song Reference (object) nếu tìm thấy, ngược lại trả về null.
    // Cùng tên nhưng khác ca sĩ mà không đủ căn cứ chọn bài nào -> null (KHÔNG đoán bừa:
    // Key sai tệ hơn là để AI tự dò). Xem resolve() để biết lý do null.
    findReference(title, artist) {

        return this.resolve(title, artist).song;

    }

    // Như findReference nhưng nói rõ lý do khi không có kết quả:
    //   { song, ambiguous } — ambiguous=true nghĩa là CÓ nhiều bản ghi cùng tên, khác Key, không phân biệt được.
    resolve(title, artist) {

        if (!title || !String(title).trim()) return { song: null, ambiguous: false };

        const songs = SongDatabase.load();
        const normTitle = normalizeForMatch(title);
        const normArtist = artist ? normalizeForMatch(artist) : null;

        // Khớp CHÍNH XÁC (chỉ hoa/thường + khoảng trắng, giống SongDatabase.getSong) — ưu tiên số 1.
        const exactTitle = SongDatabase._normalize(title);
        const exactArtist = artist !== undefined && artist !== null && artist !== "" ? SongDatabase._normalize(artist) : null;
        const exact = songs.filter((s) => {

            if (SongDatabase._normalize(s.title) !== exactTitle) return false;
            if (exactArtist !== null && SongDatabase._normalize(s.artist) !== exactArtist) return false;
            return true;

        });

        // Khớp "mờ": bỏ dấu + bỏ cụm nhiễu.
        const fuzzy = normTitle ? songs.filter((s) => {

            if (normalizeForMatch(s.title) !== normTitle) return false;
            if (normArtist && s.artist && normalizeForMatch(s.artist) !== normArtist) return false; // bản ghi kéo từ server chưa có ca sĩ (artist rỗng) vẫn khớp theo tên
            return true;

        }) : [];

        const pool = exact.length ? exact : fuzzy;

        if (pool.length === 0) return { song: null, ambiguous: false };
        if (pool.length === 1) return { song: pool[0], ambiguous: false };

        // Nhiều bản ghi cùng tên. Biết ca sĩ -> ưu tiên bản ghi CÓ ca sĩ khớp (bản ghi artist rỗng yếu hơn).
        let narrowed = pool;

        if (normArtist) {

            const withArtist = pool.filter((s) => s.artist && normalizeForMatch(s.artist) === normArtist);
            if (withArtist.length) narrowed = withArtist;

        }

        if (narrowed.length === 1) return { song: narrowed[0], ambiguous: false };

        // Vẫn còn nhiều bản ghi: nếu tất cả cùng Key thì chọn bản đầu cũng không sai Key.
        const keyOf = (s) => String((s && s.key) || "").trim().toLowerCase();
        const firstKey = keyOf(narrowed[0]);

        if (narrowed.every((s) => keyOf(s) === firstKey)) return { song: narrowed[0], ambiguous: false };

        console.log(`[SongMatcher] Bài trùng tên, khác Key, thiếu ca sĩ để phân biệt -> không chọn (title="${title}", ${narrowed.length} bản ghi)`);

        return { song: null, ambiguous: true };

    }

    // DB-MATCH-ID-02: bản ghi Database có đúng là BẢN THU đang phát không? Cùng tên nhưng khác độ dài (MV/Karaoke/Live) -> false.
    // Thiếu độ dài ở bản ghi (chưa đồng bộ) hoặc ở bài đang phát -> true (không đủ căn cứ để bác, giữ cách khớp theo tên như cũ).
    sameRecording(song, playingDurationSec) {

        return !RecordingDuration.durationMismatch(song && song.durationSec, playingDurationSec);

    }

}

module.exports = new SongMatcher();
