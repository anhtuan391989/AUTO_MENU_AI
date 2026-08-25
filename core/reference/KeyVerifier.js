/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * KeyVerifier
 * ----------------------------------------------------------
 * So sánh 1 Key do AI phát hiện (Detected Key) với Key tham chiếu
 * (Reference Key, lấy từ SongDatabase qua SongMatcher), trả về mức
 * chênh lệch tính bằng bán cung + gợi ý điều chỉnh confidence.
 *
 * ĐÂY LÀ MODULE THUẦN (pure function) — chỉ tính toán, KHÔNG tự động
 * áp dụng confidenceAdjustment vào ConfidenceEngine/DecisionEngine.
 * Việc có dùng kết quả này để điều chỉnh quyết định Lock hay không là
 * quyết định của tầng gọi module này ở bước sau (ngoài phạm vi task
 * này) — giữ đúng yêu cầu "không đụng AI Core đang hoạt động".
 *
 * Cách tách nốt/octave từ tên Key ("C Major" -> root "C", mode
 * "Major") dùng lại ĐÚNG quy ước đang có trong
 * ui/js/engines/keyEngine.js (mảng NOTE_NAMES) và
 * ui/js/renderer.js (bridgeSemitoneDelta: regex ^([A-G](?:#|b)?),
 * bảng flatToSharp, chênh lệch chuẩn hoá về khoảng (-6, 6] bán cung).
 * Không thể require() thẳng 2 file đó (chạy ở renderer/browser, còn
 * KeyVerifier chạy ở Core/main) nên khai báo lại đúng 2 hằng số này —
 * không phải logic mới, chỉ là cùng 1 bảng tra cứu ở ngữ cảnh khác.
 * ==========================================================
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const FLAT_TO_SHARP = {
    "Db": "C#",
    "Eb": "D#",
    "Gb": "F#",
    "Ab": "G#",
    "Bb": "A#"
};

// Các hằng số điều chỉnh confidence — CHỈ LÀ GIÁ TRỊ GỢI Ý trả ra trong kết
// quả, không tự áp dụng vào đâu cả. Chọn giá trị nhỏ (tối đa 0.15) vì đây là
// tín hiệu PHỤ (tham chiếu ngoài), không nên lấn át confidence thật từ
// ConfidenceEngine (Phase 3, confidenceV2.combined).
const CONFIDENCE_BONUS_MATCH = 0.10;     // Key khớp hoàn toàn với tham chiếu -> cộng điểm tin cậy
const MODE_MISMATCH_PENALTY = 0.05;      // Cùng root nhưng khác Major/Minor (relative key) -> lỗi AI hay gặp, phạt nhẹ
const SEMITONE_STEP_PENALTY = 0.03;      // Mỗi bán cung lệch (khác root) -> phạt thêm
const MAX_PENALTY = 0.15;                // Chặn trên, tránh 1 bài lệch xa kéo confidence âm quá sâu

function parseKeyName(keyName) {

    const match = String(keyName || "").trim().match(/^([A-G](?:#|b)?)\s*(Major|Minor)?$/i);

    if (!match) return null;

    const rawRoot = match[1];
    const rawMode = match[2] || "";

    const normalizedRoot = FLAT_TO_SHARP[rawRoot] || (rawRoot.length === 1 ? rawRoot.toUpperCase() : rawRoot[0].toUpperCase() + rawRoot[1]);
    const rootIndex = NOTE_NAMES.indexOf(normalizedRoot);

    if (rootIndex === -1) return null;

    // Chuẩn hoá "major"/"minor"/"" (không rõ mode) về đúng chữ hoa đầu.
    const mode = rawMode ? rawMode[0].toUpperCase() + rawMode.slice(1).toLowerCase() : "";

    return { root: normalizedRoot, rootIndex, mode };

}

// Chênh lệch bán cung detected - reference, chuẩn hoá về khoảng (-6, 6] —
// đúng quy ước bridgeSemitoneDelta() trong renderer.js.
function semitoneDifference(detectedIndex, referenceIndex) {

    let delta = (detectedIndex - referenceIndex + 12) % 12;
    if (delta > 6) delta -= 12;
    return delta;

}

class KeyVerifier {

    /**
     * @param {string} detectedKey  Key do AI phát hiện, vd "G# Major"
     * @param {string} referenceKey Key tham chiếu từ SongDatabase, vd "G Major"
     * @returns {{match: boolean, difference: number|null, confidenceAdjustment: number, reason: string}}
     */
    verify(detectedKey, referenceKey) {

        const detected = parseKeyName(detectedKey);
        const reference = parseKeyName(referenceKey);

        if (!detected || !reference) {

            return {
                match: false,
                difference: null,
                confidenceAdjustment: 0,
                reason: "invalid_key_format"
            };

        }

        const difference = semitoneDifference(detected.rootIndex, reference.rootIndex);
        const modeMatch = !detected.mode || !reference.mode || detected.mode === reference.mode; // thiếu mode ở 1 bên -> không tính là mismatch

        const match = difference === 0 && modeMatch;

        let confidenceAdjustment;
        let reason;

        if (match) {

            confidenceAdjustment = CONFIDENCE_BONUS_MATCH;
            reason = "exact_match";

        } else if (difference === 0 && !modeMatch) {

            // Cùng root, khác Major/Minor -> thường là nhầm quan hệ song song
            // (relative key), lỗi phổ biến của thuật toán Pearson correlation.
            confidenceAdjustment = -MODE_MISMATCH_PENALTY;
            reason = "mode_mismatch";

        } else {

            const penalty = Math.min(MAX_PENALTY, Math.abs(difference) * SEMITONE_STEP_PENALTY);
            confidenceAdjustment = -penalty;
            reason = "semitone_mismatch";

        }

        return { match, difference, confidenceAdjustment, reason };

    }

}

module.exports = new KeyVerifier();
