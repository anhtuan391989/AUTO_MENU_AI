/**
 * ==========================================================
 * Auto Menu AI
 * DecisionRules
 * ----------------------------------------------------------
 * CHỈ chứa các HÀM THUẦN (pure function) — nhận 1 AnalysisResult,
 * trả về dữ liệu cho 1 DecisionAction (hoặc null nếu bỏ qua, vd
 * NOISE). KHÔNG EventBus, KHÔNG side-effect, KHÔNG cooldown/queue/
 * retry — CHỈ mapping đúng như yêu cầu.
 * ==========================================================
 */

// -- Bảng ánh xạ type -> action: TẬP TRUNG duy nhất ở đây --
const ACTION_MAP = {
    NEW_SONG: "LOAD_NEW_SONG",
    KEY_CHANGE: "SET_KEY",
    MODULATION: "SHIFT_KEY",
    BPM_CHANGE: "UPDATE_BPM"
    // NOISE: cố ý không có trong bảng -> mapToAction() trả về null, bị bỏ qua
};

// -- Priority riêng của tầng Decision (không import từ ResultQueue) — giữ 2 tầng độc lập
//    cấu hình, dù hiện tại cùng thang điểm để nhất quán cảm nhận độ quan trọng xuyên suốt
//    pipeline. Nếu sau này Decision cần đánh giá độ ưu tiên khác đi (vd theo ngữ cảnh
//    nghiệp vụ khác với độ hiếm của tín hiệu phân tích), chỉ sửa đúng bảng này. --
const ACTION_PRIORITY = {
    NEW_SONG: 100,
    KEY_CHANGE: 80,
    MODULATION: 60,
    BPM_CHANGE: 40
};

function resolveTarget(type) {
    switch (type) {
        case "NEW_SONG": return "song";
        case "KEY_CHANGE": return "key";
        case "MODULATION": return "key";
        case "BPM_CHANGE": return "bpm";
        default: return null;
    }
}

// AnalysisResult chỉ điền ĐÚNG 1 trong 3 field key/bpm/modulation tuỳ nguồn gây ra nó
// (xem InferenceEngine.js). NEW_SONG có thể tới từ cả 3 nguồn (KEY/BPM/MOD) nên cần dự
// phòng đọc lần lượt; các type còn lại chỉ có đúng 1 field khả dĩ nhưng vẫn dự phòng thêm
// để không vỡ nếu ResultQueue/InferenceEngine sau này đổi cách điền field.
function resolveValue(result) {
    switch (result.type) {
        case "NEW_SONG":
            return result.key?.to ?? result.modulation?.to ?? result.bpm?.to ?? null;
        case "KEY_CHANGE":
            return result.key?.to ?? null;
        case "MODULATION":
            return result.modulation?.to ?? result.key?.to ?? null;
        case "BPM_CHANGE":
            return result.bpm?.to ?? null;
        default:
            return null;
    }
}

/**
 * Chuyển đổi 1 AnalysisResult thành dữ liệu thô cho DecisionAction.
 * Trả về null nếu type không có trong ACTION_MAP (vd NOISE) -> DecisionEngine sẽ bỏ qua.
 * @param {object} result - 1 phần tử trong mảng ANALYSIS_READY
 */
function mapToAction(result = {}) {
    const action = ACTION_MAP[result.type];

    if (!action) {
        return null;
    }

    return {
        action,
        target: resolveTarget(result.type),
        value: resolveValue(result),
        confidence: typeof result.confidence === "number" ? result.confidence : 0,
        reason: result.reason || "",
        priority: ACTION_PRIORITY[result.type] ?? 0,
        timestamp: result.timestamp || Date.now()
    };
}

module.exports = {
    ACTION_MAP,
    ACTION_PRIORITY,
    resolveTarget,
    resolveValue,
    mapToAction
};
