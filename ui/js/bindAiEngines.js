/**
 * bindAiEngines.js — Kết nối engine → luồng âm thanh → UI
 * Đảm bảo: tự động khởi động ngay khi có tín hiệu
 */
const { keyEngine } = require('./engines/keyEngine');
const { bpmEngine } = require('./engines/bpmEngine');
const { audioSource } = require('./audioSource');

let loopRunning = false;
let loopId = null;

function bindAiEnginesToSystemAudio() {
    // Dừng vòng lặp cũ nếu có
    if (loopId) {
        cancelAnimationFrame(loopId);
        loopId = null;
    }

    const analyser = audioSource.getAnalyser();
    if (!analyser) {
        console.warn("[BindAI] Chưa có analyser, chờ rồi thử lại");
        return false;
    }

    // Đảm bảo AudioContext đang chạy
    const ctx = audioSource.getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(e => console.warn("[BindAI] resume lỗi:", e));
    }

    // Reset trạng thái
    keyEngine.reset();
    bpmEngine.reset();
    loopRunning = true;

    console.log("[BindAI] Đã kết nối → bắt đầu dò KEY+BPM");

    // Vòng lặp chính — 60 lần/giây
    function tick() {
        if (!loopRunning) return;

        // === Dò KEY ===
        const keyResult = keyEngine.processFrame(analyser);
        if (keyResult && keyResult.key && keyResult.confidence >= 0.28) {
            // Gửi ra UI qua EventBus / callback
            if (typeof onKeyDetected === 'function') {
                onKeyDetected(keyResult);
            }
        }

        // === Dò BPM ===
        const bpmResult = bpmEngine.processFrame(analyser);
        if (bpmResult && bpmResult.bpm && bpmResult.confidence >= 60) {
            if (typeof onBpmDetected === 'function') {
                onBpmDetected(bpmResult);
            }
        }

        // === Debug ra console mỗi 2 giây ===
        if (Math.random() < 0.02) {
            const snap = keyEngine.getDebugSnapshot();
            console.log(`[AI-STATUS] Key=${snap.lastKey||'...'} | ${snap.longSeconds}s | frames=${snap.framesWithContent}`);
        }

        loopId = requestAnimationFrame(tick);
    }

    tick();
    return true;
}

function stopAiEngines() {
    loopRunning = false;
    if (loopId) cancelAnimationFrame(loopId);
    loopId = null;
    console.log("[BindAI] Đã dừng");
}

module.exports = {
    bindAiEnginesToSystemAudio,
    stopAiEngines
};