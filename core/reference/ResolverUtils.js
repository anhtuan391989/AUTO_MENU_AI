const fs = require("fs");

/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * ResolverUtils
 * ----------------------------------------------------------
 * 2 nhóm tiện ích cho NowPlayingResolver:
 *   1. CONFIDENCE — thang điểm tin cậy theo TỪNG nguồn dữ liệu.
 *   2. readId3Tags() — đọc thật tag ID3v2 (Title/Artist) từ file MP3
 *      bằng cách tự phân tích byte theo đúng đặc tả ID3v2 công khai
 *      (id3.org), KHÔNG dùng package ngoài (đúng yêu cầu "không thêm
 *      package mới nếu không thật sự cần" — fs là module lõi Node).
 *
 * GIỚI HẠN THẬT (không giấu): chỉ hỗ trợ ID3v2.2/2.3/2.4 (chuẩn phổ
 * biến nhất cho MP3). KHÔNG hỗ trợ ID3v1-only, KHÔNG hỗ trợ Vorbis
 * Comment (FLAC/OGG) hay atom MP4 (M4A/AAC) — với các định dạng đó,
 * hàm trả về null và NowPlayingResolver sẽ tự fallback lấy tên file
 * (đúng yêu cầu đề bài: "Nếu không có metadata thì lấy tên file").
 * Không bao giờ throw ra ngoài — lỗi/định dạng lạ đều trả về null.
 * ==========================================================
 */

// Thang điểm tin cậy [0,1] theo từng tình huống thực tế mà NowPlayingResolver
// gặp phải. Giá trị mang tính CHỦ QUAN có căn cứ (metadata thật > tên file
// có cấu trúc rõ > tên file không cấu trúc > đoán từ tiêu đề trình duyệt) —
// không phải đo lường thống kê, cần Khói xem lại nếu muốn thang điểm khác.
const CONFIDENCE = {
    FILE_METADATA_FULL: 0.95,       // Đọc được cả Title + Artist thật từ tag ID3v2
    FILE_METADATA_TITLE_ONLY: 0.80, // Tag ID3v2 chỉ có Title, không có Artist
    FILE_NAME_WITH_ARTIST: 0.60,    // Không có tag -> tên file có dạng "Title - Artist"
    FILE_NAME_TITLE_ONLY: 0.40,     // Không có tag -> tên file không tách được Artist
    YOUTUBE_TITLE_WITH_ARTIST: 0.55,// Tiêu đề tab YouTube tách được "Title - Artist"
    YOUTUBE_TITLE_ONLY: 0.35,       // Tiêu đề tab YouTube không tách được Artist
    UNKNOWN: 0
};

// Đọc 7-bit "sync-safe integer" (ID3v2 dùng để tránh trùng byte đồng bộ MP3) —
// mỗi byte chỉ dùng 7 bit thấp, bit cao luôn = 0.
function readSyncSafeInt(buffer, offset) {

    return (
        ((buffer[offset] & 0x7f) << 21) |
        ((buffer[offset + 1] & 0x7f) << 14) |
        ((buffer[offset + 2] & 0x7f) << 7) |
        (buffer[offset + 3] & 0x7f)
    );

}

function readRegularInt(buffer, offset, length) {

    let value = 0;
    for (let i = 0; i < length; i++) value = (value << 8) | buffer[offset + i];
    return value;

}

// Giải mã nội dung 1 frame text theo byte encoding đầu tiên (chuẩn ID3v2):
// 0=Latin1(ISO-8859-1), 1=UTF-16 kèm BOM, 2=UTF-16BE không BOM (chỉ v2.4),
// 3=UTF-8 (chỉ v2.4). Luôn cắt bỏ null-terminator/padding còn sót.
function decodeTextFrame(frameBody) {

    if (!frameBody || frameBody.length < 2) return null;

    const encodingByte = frameBody[0];
    const content = frameBody.slice(1);

    let text;

    try {

        if (encodingByte === 0) {

            text = content.toString("latin1");

        } else if (encodingByte === 1) {

            // UTF-16 kèm BOM (LE hoặc BE) — Node chỉ decode utf16le trực tiếp
            // được; nếu BOM là BE (0xFE 0xFF) thì đảo cặp byte trước khi decode.
            if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) {

                const swapped = Buffer.alloc(content.length);
                for (let i = 0; i + 1 < content.length; i += 2) {

                    swapped[i] = content[i + 1];
                    swapped[i + 1] = content[i];

                }
                text = swapped.toString("utf16le");

            } else {

                text = content.toString("utf16le");

            }

        } else if (encodingByte === 2) {

            // UTF-16BE không BOM (ID3v2.4) — đảo cặp byte rồi decode utf16le.
            const swapped = Buffer.alloc(content.length);
            for (let i = 0; i + 1 < content.length; i += 2) {

                swapped[i] = content[i + 1];
                swapped[i + 1] = content[i];

            }
            text = swapped.toString("utf16le");

        } else if (encodingByte === 3) {

            text = content.toString("utf8");

        } else {

            // Byte encoding lạ/không hợp lệ -> không đoán, coi như không đọc được.
            return null;

        }

    } catch {

        return null;

    }

    // Cắt bỏ null-terminator (\u0000) và khoảng trắng thừa còn sót lại.
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u0000+$/g, "").trim() || null;

}

// Đọc tag ID3v2 (Title/Artist) từ 1 file MP3 trên đĩa.
// Trả về { title, artist } (artist có thể null) hoặc null nếu không đọc được.
function readId3Tags(filePath) {

    let fd;

    try {

        if (!filePath || !fs.existsSync(filePath)) return null;

        fd = fs.openSync(filePath, "r");

        const header = Buffer.alloc(10);
        const headerBytesRead = fs.readSync(fd, header, 0, 10, 0);

        if (headerBytesRead < 10) return null;
        if (header.toString("latin1", 0, 3) !== "ID3") return null;

        const majorVersion = header[3]; // 2, 3, hoặc 4
        const flags = header[5];
        const tagSize = readSyncSafeInt(header, 6);

        if (tagSize <= 0 || tagSize > 20 * 1024 * 1024) return null; // chặn tag dị dạng/quá lớn bất thường

        const tagBuffer = Buffer.alloc(tagSize);
        fs.readSync(fd, tagBuffer, 0, tagSize, 10);

        let cursor = 0;

        // Bỏ qua Extended Header nếu có (bit 6 của flags) — chỉ cần biết kích
        // thước để nhảy qua, không cần đọc nội dung.
        const hasExtendedHeader = (flags & 0x40) !== 0;

        if (hasExtendedHeader && majorVersion >= 3) {

            const extSize = majorVersion === 4
                ? readSyncSafeInt(tagBuffer, 0)
                : readRegularInt(tagBuffer, 0, 4);

            cursor += (majorVersion === 4 ? extSize : extSize + 4);

        }

        const idLength = majorVersion === 2 ? 3 : 4;
        const sizeLength = majorVersion === 2 ? 3 : 4;
        const frameHeaderLength = idLength + sizeLength + (majorVersion === 2 ? 0 : 2);

        const titleFrameId = majorVersion === 2 ? "TT2" : "TIT2";
        const artistFrameId = majorVersion === 2 ? "TP1" : "TPE1";

        let title = null;
        let artist = null;

        while (cursor + frameHeaderLength < tagBuffer.length && (!title || !artist)) {

            const frameId = tagBuffer.toString("latin1", cursor, cursor + idLength);

            // Gặp byte 0x00 (padding) -> hết frame thật, dừng lại.
            if (!frameId || frameId.charCodeAt(0) === 0) break;

            const sizeOffset = cursor + idLength;
            const frameSize = majorVersion === 4
                ? readSyncSafeInt(tagBuffer, sizeOffset)
                : readRegularInt(tagBuffer, sizeOffset, sizeLength);

            const bodyOffset = cursor + frameHeaderLength;

            if (frameSize <= 0 || bodyOffset + frameSize > tagBuffer.length) break; // dữ liệu hỏng -> dừng, không đoán bừa

            if (frameId === titleFrameId) {

                title = decodeTextFrame(tagBuffer.slice(bodyOffset, bodyOffset + frameSize));

            } else if (frameId === artistFrameId) {

                artist = decodeTextFrame(tagBuffer.slice(bodyOffset, bodyOffset + frameSize));

            }

            cursor = bodyOffset + frameSize;

        }

        if (!title) return null; // không có Title thì coi như "không có metadata" (đúng yêu cầu fallback tên file)

        return { title, artist: artist || null };

    } catch {

        return null; // bất kỳ lỗi nào (file hỏng, quyền truy cập...) -> không đoán, trả null

    } finally {

        if (fd !== undefined) {

            try { fs.closeSync(fd); } catch {}

        }

    }

}

module.exports = {
    CONFIDENCE,
    readId3Tags
};
