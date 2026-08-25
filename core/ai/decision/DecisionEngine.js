const EventBus = require("../../events/EventBus");
const Events = require("../../events/Events");
const Logger = require("../../shared/Logger");
const DecisionAction = require("./DecisionAction");
const DecisionRules = require("./DecisionRules");

/**
 * ==========================================================
 * Auto Menu AI
 * DecisionEngine (Phase 1)
 * ----------------------------------------------------------
 * Nằm ngay sau ResultQueue. Nhiệm vụ DUY NHẤT: ánh xạ (mapping)
 * từng AnalysisResult trong ANALYSIS_READY thành 1 DecisionAction,
 * rồi phát DECISION_READY. KHÔNG quyết định cooldown, KHÔNG queue,
 * KHÔNG retry — chỉ mapping thuần tuý.
 *
 * TUYỆT ĐỐI KHÔNG:
 *   - Gửi AutoTune / click chuột / MIDI
 *   - Đọc AIContext, đọc UI, require renderer
 * Việc thực thi hành động thật (gửi lệnh xuống Plugin) là việc của
 * Workflow Engine + Plugin Controller (chưa xây), không phải ở đây.
 * ==========================================================
 */

class DecisionEngine {

    constructor() {

        this._registerListeners();

    }

    _registerListeners() {

        EventBus.subscribe(Events.ANALYSIS_READY, (results) => this._onAnalysisReady(results));

    }

    _onAnalysisReady(results = []) {

        const actions = results
            .map((result) => DecisionRules.mapToAction(result))
            .filter(Boolean) // bỏ qua NOISE (mapToAction trả về null)
            .map((fields) => DecisionAction.create(fields));

        if (actions.length === 0) {

            return; // toàn NOISE hoặc mảng rỗng -> không có gì để phát

        }

        Logger.info("DecisionEngine", `DECISION_READY: [${actions.map((a) => `${a.action}=${a.value}`).join(", ")}]`);

        EventBus.publish(Events.DECISION_READY, actions.map((a) => a.toJSON()));

    }

}

module.exports = new DecisionEngine();
