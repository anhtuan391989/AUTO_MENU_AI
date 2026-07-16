/**
 * ==========================================================
 * Auto Menu AI
 * InferenceRules
 * ----------------------------------------------------------
 * CHỈ chứa các HÀM THUẦN (pure function) — nhận dữ liệu, trả về
 * kết quả phân loại, KHÔNG EventBus, KHÔNG side-effect, KHÔNG state
 * nội bộ (state tương quan do InferenceEngine giữ và truyền vào qua
 * tham số `memory`).
 *
 * QUAN TRỌNG — vì sao có hàm tính bán cung riêng ở đây thay vì dùng
 * lại KeyEngine.shortestSemitoneDelta():
 * ui/js/engines/keyEngine.js chạy trong RENDERER (trình duyệt, dùng
 * window/Web Audio API) — không thể require() được từ Core (Node.js/
 * main process). Đây là ranh giới tiến trình bắt buộc, không phải
 * viết trùng code tuỳ tiện. Input vào đây (từ AnalysisState) chỉ là
 * CHUỖI tên nốt (vd "D Minor"), không phải rootIndex số như bên
 * keyEngine.js, nên phép tính cũng khác input, chỉ giống ý tưởng.
 * ==========================================================
 */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const FLAT_TO_SHARP = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

// Các ngưỡng phân loại — có thể tinh chỉnh sau mà không đụng logic InferenceEngine.
const THRESHOLDS = {

    CONFIDENCE_NOISE: 0.5,               // dưới ngưỡng này -> luôn coi là NOISE, actionable=false

    KEY_LARGE_JUMP_SEMITONES: 5,          // lệch >= ngưỡng này -> ứng viên NEW_SONG/KEY_CHANGE, không còn là MODULATION

    NEW_SONG_CORRELATION_WINDOW_MS: 6000, // Key và BPM cùng đổi trong khoảng này -> coi là 1 sự kiện NEW_SONG

    BPM_LARGE_JUMP_PERCENT: 0.25,         // BPM lệch >= 25% so với giá trị trước -> đáng chú ý

    BPM_OCTAVE_RATIO_TOLERANCE: 0.05      // sát tỉ lệ x2 hoặc x0.5 -> nghi ngờ BPMEngine tự nhận nhầm quãng tám, không phải nhạc đổi nhịp thật

};

function noteNameToIndex(rawName) {
    if (!rawName) return -1;

    const match = String(rawName).match(/^([A-G](?:#|b)?)/);
    if (!match) return -1;

    const normalized = FLAT_TO_SHARP[match[1]] || match[1];
    return NOTE_NAMES.indexOf(normalized);
}

function shortestSemitoneDistance(fromIndex, toIndex) {
    if (fromIndex < 0 || toIndex < 0) return null;

    let delta = Math.abs(toIndex - fromIndex) % 12;
    if (delta > 6) delta = 12 - delta;

    return delta;
}

// Dùng chung cho cả Key ("C Major"/"D Minor") lẫn Mod (cùng định dạng tên) — trả về số bán
// cung lệch NGẮN NHẤT giữa 2 tên nốt, hoặc null nếu không đọc được tên nốt hợp lệ.
function keyNameMagnitude(fromName, toName) {
    return shortestSemitoneDistance(noteNameToIndex(fromName), noteNameToIndex(toName));
}

/**
 * Phân loại 1 sự kiện KEY_CHANGED.
 * @param {{from, to, confidence, time}} payload
 * @param {{lastKeyChangeAt, lastBpmChangeAt}} memory
 */
function classifyKeyChange(payload = {}, memory = {}) {
    const { from, to, confidence, time } = payload;

    if (typeof confidence === "number" && confidence < THRESHOLDS.CONFIDENCE_NOISE) {
        return { type: "NOISE", source: "KEY", magnitude: 0, actionable: false,
            reason: `Confidence ${confidence} dưới ngưỡng ${THRESHOLDS.CONFIDENCE_NOISE}` };
    }

    const magnitude = keyNameMagnitude(from, to);

    if (magnitude === null) {
        return { type: "NOISE", source: "KEY", magnitude: 0, actionable: false,
            reason: `Không đọc được tên nốt hợp lệ từ "${from}" -> "${to}"` };
    }

    const bpmChangedRecently = !!memory.lastBpmChangeAt &&
        (time - memory.lastBpmChangeAt) <= THRESHOLDS.NEW_SONG_CORRELATION_WINDOW_MS;

    if (magnitude >= THRESHOLDS.KEY_LARGE_JUMP_SEMITONES && bpmChangedRecently) {
        return { type: "NEW_SONG", source: "COMBINED", magnitude, actionable: true,
            reason: `Key lệch ${magnitude} bán cung, kèm BPM cũng vừa đổi trong ${THRESHOLDS.NEW_SONG_CORRELATION_WINDOW_MS}ms gần đây` };
    }

    if (magnitude >= THRESHOLDS.KEY_LARGE_JUMP_SEMITONES) {
        return { type: "KEY_CHANGE", source: "KEY", magnitude, actionable: true,
            reason: `Key lệch ${magnitude} bán cung, không có tín hiệu BPM đi kèm để khẳng định là đổi bài` };
    }

    return { type: "MODULATION", source: "KEY", magnitude, actionable: true,
        reason: `Key lệch nhẹ ${magnitude} bán cung, xem như modulation trong cùng bài hát` };
}

/**
 * Phân loại 1 sự kiện BPM_CHANGED.
 * @param {{from, to, confidence, time}} payload
 * @param {{lastKeyChangeAt, lastBpmChangeAt}} memory
 */
function classifyBpmChange(payload = {}, memory = {}) {
    const { from, to, confidence, time } = payload;

    if (typeof confidence === "number" && confidence < THRESHOLDS.CONFIDENCE_NOISE) {
        return { type: "NOISE", source: "BPM", magnitude: 0, actionable: false,
            reason: `Confidence ${confidence} dưới ngưỡng ${THRESHOLDS.CONFIDENCE_NOISE}` };
    }

    if (typeof from !== "number" || typeof to !== "number" || from <= 0) {
        return { type: "BPM_CHANGE", source: "BPM", magnitude: 0, actionable: true,
            reason: "Chưa có BPM trước đó để so sánh (lần đo đầu tiên trong phiên)" };
    }

    const ratio = to / from;
    const isOctaveRelated =
        Math.abs(ratio - 2) < THRESHOLDS.BPM_OCTAVE_RATIO_TOLERANCE ||
        Math.abs(ratio - 0.5) < THRESHOLDS.BPM_OCTAVE_RATIO_TOLERANCE;

    if (isOctaveRelated) {
        return { type: "NOISE", source: "BPM", magnitude: Math.abs(ratio - 1), actionable: false,
            reason: `Tỉ lệ ${ratio.toFixed(2)}x — sát x2/x0.5, nghi ngờ BPMEngine tự nhận nhầm quãng tám (xem báo cáo audit Signal Engine), không tính là BPM đổi thật` };
    }

    const percentChange = Math.abs(to - from) / from;

    const keyChangedRecently = !!memory.lastKeyChangeAt &&
        (time - memory.lastKeyChangeAt) <= THRESHOLDS.NEW_SONG_CORRELATION_WINDOW_MS;

    if (percentChange >= THRESHOLDS.BPM_LARGE_JUMP_PERCENT && keyChangedRecently) {
        return { type: "NEW_SONG", source: "COMBINED", magnitude: percentChange, actionable: true,
            reason: `BPM lệch ${(percentChange * 100).toFixed(0)}%, kèm Key cũng vừa đổi trong ${THRESHOLDS.NEW_SONG_CORRELATION_WINDOW_MS}ms gần đây` };
    }

    return { type: "BPM_CHANGE", source: "BPM", magnitude: percentChange, actionable: true,
        reason: `BPM đổi ${(percentChange * 100).toFixed(0)}% (${from} -> ${to})` };
}

/**
 * Phân loại 1 sự kiện MOD_CHANGED.
 * @param {{from, to, confidence, time}} payload
 * @param {{lastKeyChangeAt, lastBpmChangeAt}} memory
 */
function classifyModChange(payload = {}) {
    const { from, to, confidence } = payload;

    if (typeof confidence === "number" && confidence < THRESHOLDS.CONFIDENCE_NOISE) {
        return { type: "NOISE", source: "MOD", magnitude: 0, actionable: false,
            reason: `Confidence ${confidence} dưới ngưỡng ${THRESHOLDS.CONFIDENCE_NOISE}` };
    }

    const magnitude = keyNameMagnitude(from, to);

    if (magnitude === null) {
        return { type: "NOISE", source: "MOD", magnitude: 0, actionable: false,
            reason: `Không đọc được tên nốt hợp lệ từ "${from}" -> "${to}"` };
    }

    if (magnitude >= THRESHOLDS.KEY_LARGE_JUMP_SEMITONES) {
        return { type: "NEW_SONG", source: "MOD", magnitude, actionable: true,
            reason: `ModEngine báo lệch ${magnitude} bán cung — quá lớn để là modulation nhạc lý thật, nhiều khả năng ModEngine đang canh nhầm 1 bài hát khác (xem báo cáo audit Signal Engine, mục ModEngine)` };
    }

    return { type: "MODULATION", source: "MOD", magnitude, actionable: true,
        reason: `Modulation ${magnitude} bán cung theo dõi liên tục từ ModEngine` };
}

module.exports = {
    THRESHOLDS,
    noteNameToIndex,
    shortestSemitoneDistance,
    keyNameMagnitude,
    classifyKeyChange,
    classifyBpmChange,
    classifyModChange
};
