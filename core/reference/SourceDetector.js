const path = require("path");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * SourceDetector
 * ----------------------------------------------------------
 * Hàm THUẦN — nhận dữ liệu thô ĐÃ ĐƯỢC 1 tầng khác thu thập sẵn (vd
 * tiêu đề cửa sổ trình duyệt, hoặc đường dẫn file), rồi PHÂN LOẠI
 * xem đây là nguồn "youtube" hay "file" hay "unknown".
 *
 * QUAN TRỌNG: module này KHÔNG tự đi lấy tiêu đề cửa sổ đang active,
 * KHÔNG tự dò file nào đang phát — đó là việc của 1 tầng "thu thập
 * dữ liệu" (data acquisition) chưa tồn tại trong kiến trúc hiện tại
 * (xem phần "Giới hạn kỹ thuật" trong báo cáo). SourceDetector chỉ
 * PHÂN LOẠI dữ liệu đã có sẵn trong tay.
 * ==========================================================
 */

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".wma", ".aiff", ".opus"];

// Nhận diện tiêu đề tab/cửa sổ trình duyệt đang mở YouTube. Chrome/Firefox/
// Edge đều đặt đuôi "- YouTube" (có khi kèm thêm "- Google Chrome" v.v.)
// vào cuối tiêu đề cửa sổ khi tab đang active là youtube.com.
const YOUTUBE_WINDOW_TITLE_PATTERN = /[-–—|]\s*YouTube(\s*Music)?\s*([-–—|]\s*(Google\s*Chrome|Mozilla\s*Firefox|Microsoft\s*Edge|Opera|Brave|Safari))?\s*$/i;

function detectFromWindowTitle(rawTitle) {

    const text = String(rawTitle || "").trim();

    if (!text) return "unknown";

    if (YOUTUBE_WINDOW_TITLE_PATTERN.test(text)) return "youtube";

    return "unknown";

}

function detectFromFilePath(filePath) {

    const text = String(filePath || "").trim();

    if (!text) return "unknown";

    const ext = path.extname(text).toLowerCase();

    if (AUDIO_EXTENSIONS.includes(ext)) return "file";

    return "unknown";

}

module.exports = {
    AUDIO_EXTENSIONS,
    detectFromWindowTitle,
    detectFromFilePath
};
