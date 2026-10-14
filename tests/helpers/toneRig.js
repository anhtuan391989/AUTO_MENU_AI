/**
 * AI-ALG-04 — giàn kiểm thử dùng chung: nạp vocalCommandRouter.js THẬT với MIDI/chuột GIẢ và một MÔ HÌNH TONE có trạng thái
 * (tone.offset = tổng số bước ▲/▼ thật sự được "gửi tới plugin giả"). Đây là mô phỏng PHẦN MỀM, KHÔNG phải phần cứng Windows/Auto-Tune.
 * Biến môi trường AUTOMENU_ROOT cho phép chạy cùng bài test trên bản code khác (vd HEAD cũ) để lấy số liệu "trước sửa".
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");

function loadRouter(o = {}) {
    const tone = { offset: 0, midi: 0, clicks: 0, midiCalls: 0 };
    const src = fs.readFileSync(path.join(ROOT, "ui/js/vocalCommandRouter.js"), "utf8");
    const sb = {
        console: { log() {}, warn() {}, error() {} }, Promise, Array, Math, Number, JSON, parseInt, Error,
        setTimeout: (f) => { f(); return 0; },
        getSetting: (k) => (k === "midiOutputPort" ? (o.port === undefined ? "loopMIDI" : o.port) : k === "mouseControlEnabled" ? (o.mouseAllowed === undefined ? true : o.mouseAllowed) : undefined),
        getCoordinate: (k) => (k === "chromatic" ? (o.point === undefined ? null : o.point) : ""),
        // midiMode(callIndex, cc) -> "ok" | "fail" (trả false, KHÔNG gửi) | "throw" (ném lỗi, không rõ đã gửi hay chưa) | "sent-then-throw" (ĐÃ gửi rồi mới ném)
        sendMidiCC: async (cc, v) => {
            const i = tone.midiCalls++; const mode = o.midiMode ? o.midiMode(i, cc) : "ok";
            if (mode === "fail") return false;
            if (mode === "throw") throw new Error("MIDI boom");
            tone.offset += cc === 20 ? 1 : -1; tone.midi++;
            if (mode === "sent-then-throw") throw new Error("MIDI response boom");
            return true;
        },
        sendMidiNotePulse: async () => true,
    };
    sb.window = sb;
    sb.electronAPI = o.noMouse ? undefined : {
        clickAtPoint: async (p) => {
            const j = tone.clicks; const mode = o.clickMode ? o.clickMode(j, p) : "ok";
            if (mode === "fail") return { ok: false, detail: "click fail" };
            if (mode === "throw") throw new Error("click boom");
            tone.clicks++; tone.offset += (p && p.__dir) || 0; return { ok: true };
        },
    };
    vm.createContext(sb);
    vm.runInContext(src + "\nthis.sendToneStep = sendToneStep; this.sendToneTarget = typeof sendToneTarget==='function'?sendToneTarget:undefined; this.getToneState = typeof getToneState==='function'?getToneState:undefined; this.resetToneState = typeof resetToneState==='function'?resetToneState:undefined;", sb);
    return { sb, tone, sendToneStep: sb.sendToneStep, sendToneTarget: sb.sendToneTarget, getToneState: sb.getToneState, resetToneState: sb.resetToneState };
}
// Toạ độ chuột giả: hàm parseCapturedPoint của router nhận mảng điểm; mỗi điểm mang __dir để mô hình tone biết ▲(+1)/▼(-1).
const POINTS = [{ x: 1, y: 1, __dir: 1 }, { x: 2, y: 2, __dir: -1 }];
module.exports = { loadRouter, POINTS, ROOT };
