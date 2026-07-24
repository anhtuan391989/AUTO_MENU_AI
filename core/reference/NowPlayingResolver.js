const fs = require("fs");
const path = require("path");
const SourceDetector = require("./SourceDetector");
const TitleNormalizer = require("./TitleNormalizer");
const { CONFIDENCE, readId3Tags } = require("./ResolverUtils");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * NowPlayingResolver
 * ----------------------------------------------------------
 * Module quan trọng nhất của Song Reference System: nhận dữ liệu THÔ
 * đã được thu thập sẵn (tên file, hoặc tiêu đề cửa sổ trình duyệt),
 * trả về đúng cấu trúc:
 *   { title, artist, source, confidence }
 *
 * ĐỌC KỸ — GIỚI HẠN QUAN TRỌNG NHẤT (xem đầy đủ trong báo cáo):
 * Module này KHÔNG tự biết "tab YouTube nào đang mở" hay "file nào
 * đang phát". Kiến trúc AUTO_MENU_AI hiện tại bắt âm thanh qua
 * soundcard/loopback (xem ui/js/renderer.js, dòng ~754: "dò Key/BPM
 * từ NHẠC NỀN qua soundcard/loopback"), KHÔNG nhúng trình duyệt
 * (không BrowserView/webview nào load youtube.com trong app/main.js),
 * nên KHÔNG có quyền truy cập DOM/tiêu đề tab của trình duyệt ngoài,
 * và KHÔNG tự biết file nhạc nào app phát ngoài đang mở.
 *
 * -> NowPlayingResolver chỉ làm nhiệm vụ RESOLVE (phân loại + chuẩn
 * hoá) dữ liệu thô đã có sẵn. Việc THU THẬP dữ liệu thô đó (đọc tiêu
 * đề cửa sổ đang active của hệ điều hành) là 1 tầng riêng, CHƯA tồn
 * tại trong project — xem đề xuất trong báo cáo, KHÔNG viết trong
 * task này vì không thể kiểm thử trên môi trường Linux hiện tại và
 * cần Khói xác nhận trước khi thêm 1 lớp tích hợp OS mới.
 *
 * Input hỗ trợ:
 *   { source: "file", filePath: string }
 *     -> đọc tag ID3v2 thật nếu là MP3 có tag; nếu không có/không đọc
 *        được thì lấy tên file (đúng yêu cầu đề bài).
 *   { source: "windowTitle", raw: string }
 *     -> raw là tiêu đề cửa sổ/tab ĐÃ ĐƯỢC lấy sẵn bởi 1 tầng khác
 *        (chưa tồn tại trong project). Chỉ nhận diện được YouTube khi
 *        raw có đuôi "- YouTube" mà trình duyệt tự thêm vào tiêu đề.
 *
 * Không nhận diện được / thiếu input -> trả về source "unknown",
 * confidence 0, title/artist null. KHÔNG đoán bừa, KHÔNG bịa dữ liệu.
 * ==========================================================
 */

function unknownResult() {

    return { title: null, artist: null, source: "unknown", confidence: CONFIDENCE.UNKNOWN };

}

class NowPlayingResolver {

    resolve(input) {

        if (!input || typeof input !== "object") return unknownResult();

        if (input.source === "file" && input.filePath) {

            return this._resolveFile(input.filePath);

        }

        if (input.source === "windowTitle" && input.raw) {

            return this._resolveWindowTitle(input.raw);

        }

        return unknownResult();

    }

    _resolveFile(filePath) {

        const detectedSource = SourceDetector.detectFromFilePath(filePath);

        // Không nhận ra đây là file nhạc (đuôi lạ) -> không đoán, coi là unknown.
        if (detectedSource !== "file") return unknownResult();

        // File không tồn tại trên đĩa -> không có gì thật để phân giải, tránh
        // suy đoán Title/Artist từ 1 đường dẫn không có thật.
        if (!fs.existsSync(filePath)) return unknownResult();

        const tags = readId3Tags(filePath); // không bao giờ throw, có thể trả null

        if (tags && tags.title) {

            const cleanTitle = TitleNormalizer.clean(tags.title);
            const cleanArtist = tags.artist ? TitleNormalizer.clean(tags.artist) : null;

            return {
                title: cleanTitle || null,
                artist: cleanArtist || null,
                source: "file",
                confidence: cleanArtist ? CONFIDENCE.FILE_METADATA_FULL : CONFIDENCE.FILE_METADATA_TITLE_ONLY
            };

        }

        // Không có metadata (đúng yêu cầu đề bài) -> lấy tên file.
        const baseName = path.basename(filePath, path.extname(filePath));
        const { title, artist } = TitleNormalizer.cleanAndSplit(baseName);

        if (!title) return unknownResult();

        return {
            title,
            artist,
            source: "file",
            confidence: artist ? CONFIDENCE.FILE_NAME_WITH_ARTIST : CONFIDENCE.FILE_NAME_TITLE_ONLY
        };

    }

    _resolveWindowTitle(rawTitle) {

        const detectedSource = SourceDetector.detectFromWindowTitle(rawTitle);

        // Đề bài chỉ yêu cầu hỗ trợ nhận diện YouTube qua đường này — các
        // tiêu đề cửa sổ khác (Spotify, Zalo, v.v.) chưa có quy tắc nhận
        // diện đáng tin -> trung thực trả về unknown thay vì đoán bừa.
        if (detectedSource !== "youtube") return unknownResult();

        const stripped = TitleNormalizer.stripBrowserSuffix(rawTitle);
        const { title, artist } = TitleNormalizer.cleanAndSplit(stripped);

        if (!title) return unknownResult();

        return {
            title,
            artist,
            source: "youtube",
            confidence: artist ? CONFIDENCE.YOUTUBE_TITLE_WITH_ARTIST : CONFIDENCE.YOUTUBE_TITLE_ONLY
        };

    }

}

module.exports = new NowPlayingResolver();
