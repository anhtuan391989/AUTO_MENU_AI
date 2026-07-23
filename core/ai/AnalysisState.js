const EventBus = require("../events/EventBus");
const Events = require("../events/Events");
const Logger = require("../shared/Logger");
const AIContext = require("./AIContext");

/**
 * ==========================================================
 * Auto Menu AI
 * AnalysisState  (= "Analysis Engine" của Core)
 * ----------------------------------------------------------
 * Nhiệm vụ DUY NHẤT:
 *   1. Theo dõi AIContext (đọc trực tiếp this.context.key/bpm/mod
 *      — KHÔNG có bản sao dữ liệu riêng, KHÔNG tin payload sự kiện).
 *   2. So sánh dữ liệu cũ (đã lưu ở đây) với dữ liệu mới (đọc từ AIContext).
 *   3. Phát hiện thay đổi thật sự, phát KEY_CHANGED/BPM_CHANGED/
 *      MOD_CHANGED/ANALYSIS_UPDATED qua EventBus.
 *
 * KHÔNG quyết định AutoTune, KHÔNG điều khiển Plugin, KHÔNG đổi UI —
 * chỉ theo dõi & báo tin. Việc quyết định làm gì với thay đổi đó
 * thuộc về DecisionEngine (core/ai/decision/), không phải ở đây.
 *
 * Khác với AIContext (chỉ lưu dữ liệu thô, không tự so sánh):
 * AnalysisState tự lắng nghe KEY_UPDATED/BPM_UPDATED/MOD_UPDATED
 * (đã được app/main.js phát sẵn qua IPC — file này KHÔNG đụng IPC)
 * làm TÍN HIỆU "có gì đó vừa đổi trong AIContext, đi đọc lại đi",
 * rồi mới thực sự đọc giá trị hiện tại từ chính AIContext.
 * ==========================================================
 */

class AnalysisState {

    constructor() {

        this.reset();

        this._registerListeners();

    }

    reset() {

        this.currentKey = null;

        this.previousKey = null;

        this.currentBpm = null;

        this.previousBpm = null;

        this.currentModulation = null;

        this.confidence = 0;

        this.lastUpdateTime = null;

    }

    _registerListeners() {

        EventBus.subscribe(Events.KEY_UPDATED, (payload) => this._onKeyUpdated(payload));

        EventBus.subscribe(Events.BPM_UPDATED, (payload) => this._onBpmUpdated(payload));

        EventBus.subscribe(Events.MOD_UPDATED, (payload) => this._onModUpdated(payload));

    }

    _touchUpdateTime(confidence) {

        this.lastUpdateTime = Date.now();

        if (typeof confidence === "number") {

            this.confidence = confidence;

        }

    }

    _onKeyUpdated() {

        this._touchUpdateTime(AIContext.key.confidence);

        const newKey = AIContext.key.current;

        if (!newKey || newKey === this.currentKey) {

            return;

        }

        this.previousKey = this.currentKey;

        this.currentKey = newKey;

        Logger.info("AnalysisState", `Key changed: ${this.previousKey} -> ${this.currentKey}`);

        EventBus.publish(Events.KEY_CHANGED, {

            from: this.previousKey,

            to: this.currentKey,

            confidence: this.confidence,

            time: this.lastUpdateTime

        });

        this._publishAnalysisUpdated();

    }

    _onBpmUpdated() {

        this._touchUpdateTime(AIContext.bpm.confidence);

        const newBpm = AIContext.bpm.current;

        if (typeof newBpm !== "number" || newBpm === this.currentBpm) {

            return;

        }

        this.previousBpm = this.currentBpm;

        this.currentBpm = newBpm;

        Logger.info("AnalysisState", `BPM changed: ${this.previousBpm} -> ${this.currentBpm}`);

        EventBus.publish(Events.BPM_CHANGED, {

            from: this.previousBpm,

            to: this.currentBpm,

            confidence: this.confidence,

            time: this.lastUpdateTime

        });

        this._publishAnalysisUpdated();

    }

    _onModUpdated() {

        this._touchUpdateTime(AIContext.mod.confidence);

        const label = AIContext.mod.to ?? null;

        if (!label || label === this.currentModulation) {

            return;

        }

        this.currentModulation = label;

        Logger.info("AnalysisState", `Modulation changed: ${AIContext.mod.from} -> ${label}`);

        EventBus.publish(Events.MOD_CHANGED, {

            from: AIContext.mod.from ?? null,

            to: label,

            time: this.lastUpdateTime

        });

        this._publishAnalysisUpdated();

    }

    _publishAnalysisUpdated() {

        EventBus.publish(Events.ANALYSIS_UPDATED, this.getSnapshot());

    }

    getSnapshot() {

        return {

            currentKey: this.currentKey,

            previousKey: this.previousKey,

            currentBpm: this.currentBpm,

            previousBpm: this.previousBpm,

            currentModulation: this.currentModulation,

            confidence: this.confidence,

            lastUpdateTime: this.lastUpdateTime

        };

    }

}

module.exports = new AnalysisState();
