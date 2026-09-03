// TASK A49 — BPM contract hardening cần Logger để báo lỗi rõ ràng thay vì silent-fail
const Logger = require("../shared/Logger");

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

        this.key.confidence = typeof confidence === "number" ? confidence : this.key.confidence;

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

        this.bpm.current = typeof bpm === "number" ? bpm : this.bpm.current;

        this.bpm.confidence = typeof confidence === "number" ? confidence : this.bpm.confidence;

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
