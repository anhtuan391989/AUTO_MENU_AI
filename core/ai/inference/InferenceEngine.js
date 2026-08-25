const EventBus = require("../../events/EventBus");
const Events = require("../../events/Events");
const Logger = require("../../shared/Logger");
const AnalysisResult = require("./AnalysisResult");
const InferenceRules = require("./InferenceRules");

/**
 * ==========================================================
 * Auto Menu AI
 * InferenceEngine
 * ----------------------------------------------------------
 * Nằm giữa AnalysisState và DecisionEngine. Nhiệm vụ DUY NHẤT:
 * Biến dữ liệu (KEY_CHANGED/BPM_CHANGED/MOD_CHANGED/ANALYSIS_UPDATED)
 * → Ý nghĩa (AnalysisResult: NEW_SONG/KEY_CHANGE/MODULATION/
 * BPM_CHANGE/NOISE), rồi phát ANALYSIS_RESULT qua EventBus.
 *
 * TUYỆT ĐỐI KHÔNG:
 *   - Gửi AutoTune / MIDI / click chuột
 *   - Ghi Setting
 *   - Đổi AIContext hay AnalysisState (chỉ ĐỌC payload sự kiện)
 *   - Đọc UI / renderer / gọi IPC
 * Việc phân loại thật sự nằm ở InferenceRules.js (hàm thuần) — file
 * này chỉ điều phối: lắng nghe -> gọi Rules -> đóng gói AnalysisResult
 * -> phát event. Quyết định LÀM GÌ với AnalysisResult là việc của
 * DecisionEngine (core/ai/decision/), không phải ở đây.
 * ==========================================================
 */

class InferenceEngine {

    constructor() {

        // "Trí nhớ ngắn hạn" duy nhất giữ ở đây: mốc thời gian lần cuối Key/BPM đổi —
        // dùng để tương quan 2 tín hiệu (Key + BPM cùng đổi gần nhau -> khả năng NEW_SONG).
        // Đây KHÔNG phải bản sao của AIContext/AnalysisState, chỉ là bộ nhớ cục bộ tối
        // thiểu phục vụ đúng việc phân loại, không lưu lại toàn bộ dữ liệu phân tích.
        this.memory = { lastKeyChangeAt: null, lastBpmChangeAt: null };

        this._registerListeners();

    }

    _registerListeners() {

        EventBus.subscribe(Events.KEY_CHANGED, (payload) => this._onKeyChanged(payload));

        EventBus.subscribe(Events.BPM_CHANGED, (payload) => this._onBpmChanged(payload));

        EventBus.subscribe(Events.MOD_CHANGED, (payload) => this._onModChanged(payload));

        EventBus.subscribe(Events.ANALYSIS_UPDATED, (snapshot) => this._onAnalysisUpdated(snapshot));

    }

    _onKeyChanged(payload = {}) {

        const classification = InferenceRules.classifyKeyChange(payload, this.memory);

        this.memory.lastKeyChangeAt = payload.time || Date.now();

        this._emitResult(classification, payload, {
            key: { from: payload.from ?? null, to: payload.to ?? null },
            bpm: null,
            modulation: null
        });

    }

    _onBpmChanged(payload = {}) {

        const classification = InferenceRules.classifyBpmChange(payload, this.memory);

        this.memory.lastBpmChangeAt = payload.time || Date.now();

        this._emitResult(classification, payload, {
            key: null,
            bpm: { from: payload.from ?? null, to: payload.to ?? null },
            modulation: null
        });

    }

    _onModChanged(payload = {}) {

        const classification = InferenceRules.classifyModChange(payload, this.memory);

        this._emitResult(classification, payload, {
            key: null,
            bpm: null,
            modulation: { from: payload.from ?? null, to: payload.to ?? null }
        });

    }

    _onAnalysisUpdated(snapshot = {}) {

        // CHỈ ghi log tham khảo — KHÔNG phát AnalysisResult ở đây. Theo đúng thiết kế của
        // AnalysisState.js, ANALYSIS_UPDATED luôn được phát NGAY SAU 1 trong 3 sự kiện
        // *_CHANGED ở trên trong cùng 1 lần thay đổi thật -> nếu xử lý cả ở đây sẽ tạo ra
        // 2 AnalysisResult cho đúng 1 sự kiện thực tế (trùng lặp).
        Logger.info("InferenceEngine", `Snapshot: Key=${snapshot.currentKey} BPM=${snapshot.currentBpm} Mod=${snapshot.currentModulation}`);

    }

    _emitResult(classification, payload, dataFields) {

        const result = AnalysisResult.create({
            ...classification,
            ...dataFields,
            confidence: typeof payload.confidence === "number" ? payload.confidence : 0,
            timestamp: payload.time || Date.now()
        });

        Logger.info("InferenceEngine", `${result.type} (${result.source}, conf=${result.confidence.toFixed(2)}, mag=${result.magnitude}) — ${result.reason}`);

        EventBus.publish(Events.ANALYSIS_RESULT, result.toJSON());

    }

}

module.exports = new InferenceEngine();
