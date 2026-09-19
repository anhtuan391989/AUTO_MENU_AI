const BaseModel = require("../../shared/BaseModel");

/**
 * ==========================================================
 * Auto Menu AI
 * AnalysisResult
 * ----------------------------------------------------------
 * Cấu trúc dữ liệu CHUẨN cho kết quả đã được InferenceEngine phân
 * loại ý nghĩa. Đây là "ngôn ngữ chung" duy nhất giữa InferenceEngine
 * và DecisionEngine — DecisionEngine không cần biết gì về KEY_CHANGED/
 * BPM_CHANGED/MOD_CHANGED thô, chỉ cần đọc đúng 1 kiểu dữ liệu này.
 *
 * Kế thừa BaseModel (đã có sẵn id/createdAt/updatedAt/toJSON) —
 * không viết lại các cơ chế đó.
 * ==========================================================
 */

const VALID_TYPES = ["NEW_SONG", "KEY_CHANGE", "MODULATION", "BPM_CHANGE", "NOISE"];

const VALID_SOURCES = ["KEY", "BPM", "MOD", "COMBINED"];

// TASK A59.1 — bản sao GIỐNG HỆT helper trong core/ai/AIContext.js (xem comment ở đó). Không
// gộp thành module dùng chung cho 1 hàm thuần rất nhỏ, tránh thêm phụ thuộc mới ngoài scope.
function isValidConfidence(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

class AnalysisResult extends BaseModel {

    constructor(fields = {}) {

        super();

        this.type = VALID_TYPES.includes(fields.type) ? fields.type : "NOISE";

        this.source = VALID_SOURCES.includes(fields.source) ? fields.source : "KEY";

        this.confidence = isValidConfidence(fields.confidence) ? fields.confidence : 0;

        this.magnitude = typeof fields.magnitude === "number" ? fields.magnitude : 0;

        this.actionable = !!fields.actionable;

        this.reason = fields.reason || "";

        // TASK A59.3 — TIMESTAMP CONTRACT: trước bản vá, `fields.timestamp || Date.now()` chỉ
        // là falsy-check — chấp nhận bất kỳ giá trị truthy nào (kể cả string "invalid", object,
        // ...) làm timestamp mà không kiểm tra kiểu, trong khi confidence/magnitude ngay phía
        // trên ĐÃ dùng đúng pattern typeof-check. Sửa để nhất quán với chính 2 field anh em
        // trong cùng constructor này — KHÔNG thêm ordering/staleness-rejection nào (xem
        // A59-REPORT.md mục Timestamp: UNKNOWN/NEEDS SPEC, chưa đủ evidence để định nghĩa rule
        // đó, không tự nghĩ ra).
        this.timestamp = typeof fields.timestamp === "number" ? fields.timestamp : Date.now();

        this.key = fields.key || null;

        this.bpm = fields.bpm || null;

        this.modulation = fields.modulation || null;

    }

    static create(fields) {

        return new AnalysisResult(fields);

    }

}

module.exports = AnalysisResult;
