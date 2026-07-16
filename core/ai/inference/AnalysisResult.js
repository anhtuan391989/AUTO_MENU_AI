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

class AnalysisResult extends BaseModel {

    constructor(fields = {}) {

        super();

        this.type = VALID_TYPES.includes(fields.type) ? fields.type : "NOISE";

        this.source = VALID_SOURCES.includes(fields.source) ? fields.source : "KEY";

        this.confidence = typeof fields.confidence === "number" ? fields.confidence : 0;

        this.magnitude = typeof fields.magnitude === "number" ? fields.magnitude : 0;

        this.actionable = !!fields.actionable;

        this.reason = fields.reason || "";

        this.timestamp = fields.timestamp || Date.now();

        this.key = fields.key || null;

        this.bpm = fields.bpm || null;

        this.modulation = fields.modulation || null;

    }

    static create(fields) {

        return new AnalysisResult(fields);

    }

}

module.exports = AnalysisResult;
