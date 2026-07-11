const EventBus = require("../events/EventBus");
const Events = require("../events/Events");
const Logger = require("../shared/Logger");

/**
 * ==========================================================
 * Auto Menu AI
 * AnalysisState
 * ----------------------------------------------------------
 * Lưu trạng thái phân tích hiện tại (Key/BPM/Modulation/Confidence)
 * và CHỊU TRÁCH NHIỆM DUY NHẤT: phát hiện khi nào có THAY ĐỔI thật
 * sự (vd Key đổi từ C sang D), rồi phát sự kiện tương ứng qua
 * EventBus (KEY_CHANGED/BPM_CHANGED/MOD_CHANGED).
 *
 * KHÔNG quyết định AutoTune, KHÔNG điều khiển Plugin — chỉ theo
 * dõi & báo tin. Việc quyết định làm gì với thay đổi đó thuộc về
 * DecisionEngine (core/ai/decision/), không phải ở đây.
 *
 * Khác với AIContext (chỉ lưu dữ liệu thô, không tự so sánh):
 * AnalysisState tự lắng nghe KEY_UPDATED/BPM_UPDATED/MOD_UPDATED
 * (đã được app/main.js phát sẵn qua IPC) để tự phân tích, không
 * phụ thuộc và không đụng vào tầng IPC.
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

    _onKeyUpdated(payload = {}) {

        this._touchUpdateTime(payload.confidence);

        const newKey = payload.key;

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

    }

    _onBpmUpdated(payload = {}) {

        this._touchUpdateTime(payload.confidence);

        const newBpm = payload.bpm;

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

    }

    _onModUpdated(payload = {}) {

        this._touchUpdateTime(payload.confidence);

        const label = payload.to ?? null;

        if (!label || label === this.currentModulation) {

            return;

        }

        this.currentModulation = label;

        Logger.info("AnalysisState", `Modulation changed: ${JSON.stringify(payload)}`);

        EventBus.publish(Events.MOD_CHANGED, {

            from: payload.from ?? null,

            to: label,

            semitone: payload.semitone,

            time: this.lastUpdateTime

        });

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
