const BaseModel = require("../../shared/BaseModel");

/**
 * ==========================================================
 * Auto Menu AI
 * DecisionAction
 * ----------------------------------------------------------
 * Cấu trúc dữ liệu CHUẨN cho 1 hành động đã được DecisionEngine
 * ánh xạ từ AnalysisResult. Đây là "ngôn ngữ chung" giữa
 * DecisionEngine và Workflow Engine (chưa xây) — Workflow không cần
 * biết gì về NEW_SONG/KEY_CHANGE/... thô, chỉ cần đọc đúng 1 kiểu
 * dữ liệu này.
 *
 * Kế thừa BaseModel (đã có sẵn id/createdAt/updatedAt/toJSON) —
 * không viết lại các cơ chế đó (giống cách AnalysisResult.js đã làm).
 * ==========================================================
 */

const VALID_ACTIONS = ["LOAD_NEW_SONG", "SET_KEY", "SHIFT_KEY", "UPDATE_BPM"];

class DecisionAction extends BaseModel {

    constructor(fields = {}) {

        super();

        this.action = VALID_ACTIONS.includes(fields.action) ? fields.action : null;

        this.target = fields.target || null;

        this.value = fields.value ?? null;

        this.confidence = typeof fields.confidence === "number" ? fields.confidence : 0;

        this.reason = fields.reason || "";

        this.priority = typeof fields.priority === "number" ? fields.priority : 0;

        this.timestamp = fields.timestamp || Date.now();

    }

    static create(fields) {

        return new DecisionAction(fields);

    }

}

module.exports = DecisionAction;
