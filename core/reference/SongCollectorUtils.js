/**
 * ==========================================================
 * Auto Menu AI — Song Reference System
 * SongCollectorUtils
 * ----------------------------------------------------------
 * Các hàm THUẦN (pure function) dùng riêng cho AutoSongCollector.
 * Không require bất kỳ module nào khác trong project (kể cả
 * SongDatabase) — tách biệt hoàn toàn để dễ test độc lập và tái sử
 * dụng nếu sau này có collector khác (vd 1 phiên bản theo dõi BPM
 * riêng).
 * ==========================================================
 */

// Sai số cho phép khi so BPM (do đo đạc audio luôn có rung nhẹ, vd
// 119.6 và 120.1 vẫn là "chưa đổi nhịp" chứ không phải bài hát đổi BPM).
// Giá trị tạm thời (provisional) — sẽ tinh chỉnh lại khi có đủ dữ liệu
// thật từ 500 bài hát (Pop/EDM/Rock/Ballad/Live) theo lộ trình Phase 4.
const BPM_TOLERANCE = 1.0;

// Ngưỡng confidence tối thiểu để coi Key là "đã ổn định, đáng tin để lưu".
// Confidence ở đây kỳ vọng là giá trị đã chuẩn hoá [0, 1] (vd
// confidenceV2.combined của Phase 3) — KHÔNG phải giá trị pearson thô.
// Giá trị tạm thời (provisional), giống các hằng số PEARSON_NORM_MAX /
// MARGIN_NORM_RANGE khác trong project — chờ dữ liệu thật để tinh chỉnh.
const MIN_KEY_CONFIDENCE_TO_SAVE = 0.75;

function normalizeText(value) {

    return String(value || "").trim();

}

// Chuẩn hoá cặp title/artist thành 1 khoá so sánh duy nhất, dùng cho
// SongCollectorState (cache trong bộ nhớ). KHÔNG dùng lại private method
// của SongDatabase (SongDatabase._normalize) vì đó là chi tiết nội bộ của
// tầng lưu trữ — State chỉ cần 1 khoá đủ ổn định cho mục đích cache, tách
// biệt tầng lưu trữ khỏi tầng cache để không phụ thuộc chéo.
function buildCacheKey(title, artist) {

    return `${normalizeText(title).toLowerCase()}|${normalizeText(artist).toLowerCase()}`;

}

function isValidKeyName(keyName) {

    return /^[A-G](#|b)?\s+(Major|Minor)$/i.test(normalizeText(keyName));

}

function isValidBpm(bpm) {

    return typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0;

}

function keyChanged(oldKey, newKey) {

    return normalizeText(oldKey).toLowerCase() !== normalizeText(newKey).toLowerCase();

}

function bpmChanged(oldBpm, newBpm, tolerance = BPM_TOLERANCE) {

    if (!isValidBpm(oldBpm) || !isValidBpm(newBpm)) return oldBpm !== newBpm;

    return Math.abs(oldBpm - newBpm) > tolerance;

}

// Gộp toàn bộ điều kiện "dữ liệu đã ổn định, đáng tin để ghi vào DB" vào 1
// chỗ duy nhất — AutoSongCollector chỉ gọi hàm này, không tự rải điều kiện
// if/else rải rác (dễ quên 1 điều kiện khi sửa sau này).
function isSnapshotStable(snapshot) {

    const reasons = [];

    if (!snapshot || typeof snapshot !== "object") {

        return { stable: false, reasons: ["missing_snapshot"] };

    }

    if (snapshot.keyLocked !== true) reasons.push("key_not_locked");

    if (typeof snapshot.keyConfidence !== "number" || snapshot.keyConfidence < MIN_KEY_CONFIDENCE_TO_SAVE) {

        reasons.push("key_confidence_too_low");

    }

    if (snapshot.bpmStable !== true) reasons.push("bpm_not_stable");

    if (!snapshot.title || !normalizeText(snapshot.title)) reasons.push("missing_title");

    if (!isValidKeyName(snapshot.key)) reasons.push("invalid_key_format");

    if (!isValidBpm(snapshot.bpm)) reasons.push("invalid_bpm");

    return { stable: reasons.length === 0, reasons };

}

module.exports = {
    BPM_TOLERANCE,
    MIN_KEY_CONFIDENCE_TO_SAVE,
    buildCacheKey,
    isValidKeyName,
    isValidBpm,
    keyChanged,
    bpmChanged,
    isSnapshotStable
};
