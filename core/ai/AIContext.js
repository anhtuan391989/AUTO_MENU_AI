// TASK A49 — BPM contract hardening cần Logger để báo lỗi rõ ràng thay vì silent-fail
const Logger = require("../shared/Logger");

// TASK A59 — Confidence/BPM validation helpers dùng chung cho updateKey/updateBpm bên dưới,
// và cho AnalysisResult.js/DecisionAction.js (2 bản sao GIỐNG HỆT ở đó — nếu sửa ngưỡng ở đây
// phải sửa đồng bộ cả 2 nơi kia; không gộp thành module dùng chung để tránh thêm phụ thuộc mới
// cho 1 hàm thuần rất nhỏ, đúng tinh thần "không refactor lớn" của A59).
// confidence ∈ [0,1], phải là số hữu hạn (chặn NaN/Infinity/-Infinity/ngoài khoảng).
function isValidConfidence(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
// bpm > 0, phải là số hữu hạn (chặn NaN/Infinity/0/âm — KHÔNG áp đặt khoảng nhạc lý 60-200,
// đó là quyết định của bpmEngine.js, ngoài thẩm quyền AIContext).
function isValidBpm(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

class AIContext {

    constructor() {

        this.reset();

    }

    reset() {

        this.app = {
            version: "2.0.0",
            status: "BOOT",
            startTime: Date.now()
        };

        this.system = {
            cpu: 0,
            ram: 0,
            os: null
        };

        this.audio = {
            active: false,
            device: null,
            level: 0,
            sampleRate: 0,
            channels: 2
        };

        this.song = {
            id: null,
            hash: null,
            title: null,
            duration: 0,
            position: 0
        };

        this.analysis = {
            analyzing: false,
            progress: 0,
            lastUpdate: 0
        };

        this.key = {
            current: null,
            previous: null,
            confidence: 0,
            stable: false
        };

        this.bpm = {
            current: 0,
            confidence: 0,
            stable: false
        };

        this.mod = {
            detected: false,
            from: null,
            to: null,
            time: null,
            confidence: 0
        };

        this.plugin = {
            studioOne: false,
            autoTune: false,
            autoKey: false,
            soundShifter: false
        };

        this.workflow = {
            state: "BOOT",
            busy: false,
            currentTask: null,
            currentSong: null,
            lastAnalysis: 0,
            queue: []

        };

        this.cache = {
            hit: false,
            loaded: false,
            saving: false
        };

        this.decision = {
            needAnalyze: false,
            needKey: false,
            needBPM: false,
            needMOD: false,
            needAutomation: false
        };

        this.brain = {

            initialized: false,

            running: false,

            version: "2.0.0"

        };

    }

    // ==========================================================
    // Cập nhật dữ liệu Key/BPM/MOD nhận được từ ui/js/engines/*
    // qua IPC (xem app/main.js: ipcMain.on("ai-result")).
    // Không đổi cấu trúc reset() phía trên, chỉ ghi đè giá trị.
    // ==========================================================

    updateKey({ key, confidence } = {}) {

        this.key.previous = this.key.current;

        this.key.current = key ?? this.key.current;

        // TASK A59.1 — CONFIDENCE CONTRACT: confidence phải là số hữu hạn trong [0,1] (định
        // nghĩa chính thức, xem A59-REPORT.md). Trước bản vá, guard chỉ kiểm tra
        // typeof === "number" — NaN/Infinity/-1/2 đều có typeof "number" nên lọt qua ÂM THẦM
        // (đã xác nhận bằng test ở A58). Khi invalid: GIỮ NGUYÊN giá trị cũ (nhất quán với hành
        // vi đã có sẵn cho trường hợp sai kiểu, ví dụ string) — không tự clamp vì chưa có bằng
        // chứng đó là semantics mong muốn — nhưng giờ LUÔN log rõ để không còn trôi qua âm thầm
        // (chỉ log khi field THỰC SỰ được cung cấp — field vắng mặt là bình thường, không log để
        // tránh spam).
        if (confidence !== undefined && confidence !== null) {
            if (isValidConfidence(confidence)) {
                this.key.confidence = confidence;
            } else {
                Logger.error(
                    "AIContext",
                    `updateKey() nhận confidence không hợp lệ (${String(confidence)}) — phải là số hữu hạn trong [0,1]. Giữ nguyên confidence cũ (${this.key.confidence}).`
                );
            }
        }

        this.key.stable = true;

    }

    updateBpm(payload) {

        // TASK A49 — BPM CONTRACT HARDENING: AIContext.updateBpm() LUÔN kỳ vọng object
        // { bpm, confidence } (giống hệt updateKey/updateMod). Trước bản vá này, nếu ai đó lỡ
        // gọi updateBpm(128) (số thô — đúng hình dạng BPMEngine.onUpdate() thật sự phát ra,
        // xem ui/js/engines/bpmEngine.js) thay vì updateBpm({ bpm: 128 }), việc destructure
        // { bpm, confidence } từ 1 số nguyên KHÔNG throw — chỉ âm thầm cho ra bpm=undefined,
        // rồi bị "??"/typeof-guard bên dưới lặng lẽ bỏ qua — BPM sẽ đứng yên vĩnh viễn, không
        // có bất kỳ dấu hiệu nào để phát hiện (đã xác nhận là silent-fail thật ở A48). Thêm
        // guard rõ ràng ở đây để lỗi loại này LUÔN LỘ RA NGAY (qua Logger.error), không còn
        // trôi qua âm thầm — không đổi contract công khai của BPMEngine (vẫn phát số thô cho
        // UI như cũ, đúng yêu cầu A49 "không tự ý đổi public contract của BPMEngine").
        if (typeof payload === "number") {

            Logger.error(
                "AIContext",
                `updateBpm() nhận SỐ THUẦN (${payload}) thay vì object { bpm, confidence } — ` +
                "payload bị BỎ QUA để tránh silent-fail. Nơi gọi phải tự bọc lại thành " +
                `{ bpm: ${payload} } trước khi gọi updateBpm() (xem báo cáo A48/A49).`
            );

            return;

        }

        const { bpm, confidence } = payload || {};

        // TASK A59.2 — BPM CONTRACT: bpm phải là số hữu hạn > 0 (0/âm không có ý nghĩa vật lý).
        // Trước bản vá, NaN/Infinity/-5 đều có typeof "number" nên lọt qua âm thầm (đã xác nhận
        // bằng test A58). Khi invalid: giữ nguyên bpm.current cũ + log rõ ràng, không tự clamp.
        if (bpm !== undefined && bpm !== null) {
            if (isValidBpm(bpm)) {
                this.bpm.current = bpm;
            } else {
                Logger.error(
                    "AIContext",
                    `updateBpm() nhận bpm không hợp lệ (${String(bpm)}) — phải là số hữu hạn > 0. Giữ nguyên bpm.current cũ (${this.bpm.current}).`
                );
            }
        }

        // TASK A59.1 — cùng contract confidence [0,1] áp dụng nhất quán cho BPM.
        if (confidence !== undefined && confidence !== null) {
            if (isValidConfidence(confidence)) {
                this.bpm.confidence = confidence;
            } else {
                Logger.error(
                    "AIContext",
                    `updateBpm() nhận confidence không hợp lệ (${String(confidence)}) — phải là số hữu hạn trong [0,1]. Giữ nguyên confidence cũ (${this.bpm.confidence}).`
                );
            }
        }

        this.bpm.stable = true;

    }

    updateMod({ from, to, semitone, time } = {}) {

        this.mod.detected = true;

        this.mod.from = from ?? this.mod.from;

        this.mod.to = to ?? this.mod.to;

        this.mod.time = time ?? this.mod.time;

        this.mod.confidence = 1;

    }

}

module.exports = new AIContext();
