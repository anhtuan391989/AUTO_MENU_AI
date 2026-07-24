/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * TitleNormalizer
 * ----------------------------------------------------------
 * Hàm THUẦN (pure function) — chuẩn hoá 1 chuỗi text thô (tên file,
 * tiêu đề tab trình duyệt...) thành Title/Artist sạch để lưu vào
 * SongDatabase. Không đọc file, không gọi OS, không Internet.
 *
 * Khác với NOISE_PATTERNS trong SongMatcher.js: SongMatcher chuẩn
 * hoá để SO SÁNH (bỏ dấu, hạ chữ thường, kết quả không hiển thị cho
 * người dùng), còn TitleNormalizer chuẩn hoá để HIỂN THỊ/LƯU (giữ
 * nguyên dấu, giữ nguyên hoa/thường của tên bài thật) — 2 mục đích
 * khác nhau nên tách riêng, không phải trùng lặp code.
 * ==========================================================
 */

// Các cụm nhiễu thường gặp trong tên file/tiêu đề video nhạc — liệt kê
// đúng theo yêu cầu đề bài (Official MV, Karaoke, Beat, Lyrics, Audio,
// HD, 4K, Live, Cover) + vài biến thể hay gặp trong thực tế. Ưu tiên
// khớp cụm CÓ NGOẶC trước, cụm không ngoặc xử lý sau để giảm rủi ro
// xoá nhầm từ nằm trong tên bài thật.
const BRACKETED_NOISE_PATTERNS = [
    /\(\s*official\s*mv\s*\)/gi,
    /\[\s*official\s*mv\s*\]/gi,
    /\(\s*official\s*audio\s*\)/gi,
    /\[\s*official\s*audio\s*\]/gi,
    /\(\s*official\s*video\s*\)/gi,
    /\[\s*official\s*video\s*\]/gi,
    /\(\s*karaoke\s*(beat)?\s*\)/gi,
    /\[\s*karaoke\s*(beat)?\s*\]/gi,
    /\(\s*beat\s*\)/gi,
    /\[\s*beat\s*\]/gi,
    /\(\s*lyrics?\s*(video)?\s*\)/gi,
    /\[\s*lyrics?\s*(video)?\s*\]/gi,
    /\(\s*audio\s*\)/gi,
    /\[\s*audio\s*\]/gi,
    /\(\s*live\s*\)/gi,
    /\[\s*live\s*\]/gi,
    /\(\s*cover\s*\)/gi,
    /\[\s*cover\s*\]/gi,
    /\(\s*hd\s*\)/gi,
    /\[\s*hd\s*\]/gi,
    /\(\s*4k\s*\)/gi,
    /\[\s*4k\s*\]/gi
];

// Cụm nhiễu KHÔNG có ngoặc, thường nằm cuối chuỗi, ngăn cách bởi dấu
// "-"/"|". Chỉ khớp khi đứng riêng 1 từ (\b) để tránh xoá nhầm 1 phần
// của tên bài/tên ca sĩ thật.
const BARE_NOISE_PATTERNS = [
    /\bofficial\s+mv\b/gi,
    /\bofficial\s+audio\b/gi,
    /\bofficial\s+video\b/gi,
    /\bofficial\b/gi,
    /\bkaraoke\s+beat\b/gi,
    /\bkaraoke\b/gi,
    /\bbeat\b/gi,
    /\blyrics?\s+video\b/gi,
    /\blyrics?\b/gi,
    /\baudio\b/gi,
    /\bfull\s+hd\b/gi,
    /\bhd\b/gi,
    /\b4k\b/gi,
    /\b8k\b/gi,
    /\blive\b/gi,
    /\bcover\b/gi,
    /\bmv\b/gi
];

// Đuôi tên trình duyệt/YouTube hay xuất hiện trong tiêu đề cửa sổ (window
// title), vd "Song - Artist - YouTube - Google Chrome". Chỉ dùng khi xử
// lý input dạng windowTitle (SourceDetector đã xác định source trước).
const BROWSER_SUFFIX_PATTERN = /[-–—|]\s*(Google\s*Chrome|Mozilla\s*Firefox|Microsoft\s*Edge|Opera|Brave|Safari)\s*$/i;
const YOUTUBE_SUFFIX_PATTERN = /[-–—|]\s*YouTube(\s*Music)?\s*$/i;

// Dấu gạch nối dùng để tách "Tên bài - Ca sĩ" — chấp nhận cả 3 loại
// dash hay gặp khi copy từ nhiều nguồn khác nhau (-, –, —).
const SEPARATOR_PATTERN = /\s[-–—]\s/;

function collapseSpaces(text) {

    return String(text || "")
        .replace(/\s+/g, " ")
        .trim();

}

// Xoá ngoặc rỗng còn sót lại sau khi đã bỏ nhiễu bên trong, và dấu
// gạch/gạch đứng thừa ở đầu/cuối chuỗi.
function cleanupLeftovers(text) {

    let result = text
        .replace(/\(\s*\)/g, " ")
        .replace(/\[\s*\]/g, " ");

    result = result.replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, "");

    return collapseSpaces(result);

}

// Loại bỏ toàn bộ cụm nhiễu khỏi 1 chuỗi, KHÔNG tách Title/Artist.
function clean(text) {

    let result = String(text || "");

    for (const pattern of BRACKETED_NOISE_PATTERNS) {

        result = result.replace(pattern, " ");

    }

    for (const pattern of BARE_NOISE_PATTERNS) {

        result = result.replace(pattern, " ");

    }

    return cleanupLeftovers(result);

}

// Bỏ đuôi "- YouTube - Google Chrome" / "- YouTube" ở cuối tiêu đề cửa sổ
// trình duyệt. Chỉ nên gọi cho input đã được SourceDetector xác nhận là
// windowTitle nguồn YouTube.
function stripBrowserSuffix(rawWindowTitle) {

    let result = String(rawWindowTitle || "").trim();

    result = result.replace(BROWSER_SUFFIX_PATTERN, "").trim();
    result = result.replace(YOUTUBE_SUFFIX_PATTERN, "").trim();

    return collapseSpaces(result);

}

// Tách "Tên bài - Ca sĩ" -> { title, artist }. Theo ĐÚNG quy ước đề bài
// (title đứng TRƯỚC, artist đứng SAU dấu "-"). Chỉ tách ở lần gặp dấu "-"
// ĐẦU TIÊN — phần còn lại (nếu có thêm "-" khác) giữ nguyên trong artist,
// tốt hơn là đoán sai cấu trúc phức tạp hơn.
// Đây là 1 HEURISTIC (không phải sự thật tuyệt đối — nhiều kênh YouTube
// đặt tên theo chiều ngược lại "Ca sĩ - Tên bài"), vì vậy luôn đi kèm
// confidence thấp hơn ở NowPlayingResolver, không coi là chắc chắn đúng.
function splitTitleArtist(text) {

    const normalized = String(text || "").trim();

    if (!normalized) return { title: "", artist: null };

    const match = normalized.match(SEPARATOR_PATTERN);

    if (!match) {

        return { title: normalized, artist: null };

    }

    const splitIndex = match.index;
    const rawTitle = normalized.slice(0, splitIndex);
    const rawArtist = normalized.slice(splitIndex + match[0].length);

    const title = collapseSpaces(rawTitle);
    const artist = collapseSpaces(rawArtist);

    return { title, artist: artist || null };

}

// Tiện ích gộp: bỏ nhiễu rồi mới tách Title/Artist, sau đó bỏ nhiễu thêm 1
// lần nữa cho từng phần (phòng trường hợp cụm nhiễu nằm ngay trong phần
// artist, vd "Sơn Tùng M-TP (Cover)").
function cleanAndSplit(text) {

    const cleaned = clean(text);
    const { title, artist } = splitTitleArtist(cleaned);

    const finalTitle = clean(title);
    const finalArtist = artist ? clean(artist) : null;

    return {
        title: finalTitle || null,
        artist: finalArtist || null
    };

}

module.exports = {
    clean,
    stripBrowserSuffix,
    splitTitleArtist,
    cleanAndSplit
};
