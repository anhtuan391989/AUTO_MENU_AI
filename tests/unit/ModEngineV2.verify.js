/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Mod Engine V2 (Sustained Transition)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/ModEngineV2.verify.js
 *
 * Nạp CẢ keyEngine.js LẪN modEngine.js vào CÙNG 1 sandbox thật (giống
 * cách modEngine.js dùng KeyEngine thật trong trình duyệt — không mock
 * lại logic modulation), kiểm chứng:
 *   1. 1 lần đo lẻ đổi root -> KHÔNG báo modulation ngay.
 *   2. Đổi root NHƯNG dao động qua lại (không liên tục) -> KHÔNG báo.
 *   3. Đổi root LIÊN TỤC đủ SUSTAIN_REQUIRED lần -> báo ĐÚNG 1 lần,
 *      đúng số bán cung.
 *   4. Đang bị Manual Override -> không báo dù root có đổi thật.
 *   5. Confidence thấp -> không tính vào streak.
 * ==========================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failCount = 0;
function check(condition, message) {
    try {
        assert.ok(condition, message);
        console.log(`  ✅ ${message}`);
    } catch (err) {
        failCount++;
        console.log(`  ❌ ${message} -- ${err.message}`);
    }
}

const keyEngineSource = fs.readFileSync(path.resolve(__dirname, "../../ui/js/engines/keyEngine.js"), "utf-8");
const modEngineSource = fs.readFileSync(path.resolve(__dirname, "../../ui/js/engines/modEngine.js"), "utf-8");

function makeFakeAnalyser(getSpectrum) {
    return {
        fftSize: 8192,
        smoothingTimeConstant: 0,
        frequencyBinCount: 4096,
        getFloatFrequencyData(arr) {
            const spectrum = getSpectrum();
            for (let i = 0; i < arr.length; i++) arr[i] = spectrum[i] ?? -120;
        }
    };
}

function chordSpectrum(freqs) {
    const arr = new Float32Array(4096).fill(-100);
    const binHz = 48000 / 8192;
    for (const f of freqs) {
        const bin = Math.round(f / binHz);
        if (bin >= 0 && bin < arr.length) arr[bin] = -10;
    }
    return arr;
}

const G_MINOR = () => chordSpectrum([98.0, 196.0, 233.1, 293.7, 392.0]); // G2,G3,A#3(D#),D4,G4 (xấp xỉ hợp âm G Minor: G-A#-D)
const A_MINOR = () => chordSpectrum([110.0, 220.0, 261.6, 329.6, 440.0]); // A2,A3,C4,E4,A4 (hợp âm A Minor: A-C-E)

function createSandbox() {
    let capturedRaf = null;
    const capturedIntervals = []; // {cb, ms}
    let currentSpectrumFn = G_MINOR;

    const fakeAudioContext = { sampleRate: 48000, createAnalyser: () => makeFakeAnalyser(() => currentSpectrumFn()) };
    const fakeSourceNode = { connect: () => {} };

    const sandbox = {
        window: {},
        Float32Array, Math, Array,
        console: { log: () => {} },
        requestAnimationFrame: (cb) => { capturedRaf = cb; return 1; },
        cancelAnimationFrame: () => {},
        setInterval: (cb, ms) => { capturedIntervals.push({ cb, ms }); return capturedIntervals.length; },
        clearInterval: (id) => {
            // mô phỏng đúng ngữ nghĩa: modEngine.stop()/keyEngine gọi clearInterval theo id trả về
            // từ setInterval — ở đây ta không cần dọn mảng thật, chỉ cần các test sau tự tạo sandbox
            // MỚI thay vì tái sử dụng, nên không có rủi ro nhầm lẫn giữa các phiên.
        }
    };

    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });
    vm.runInContext(modEngineSource, sandbox, { filename: "modEngine.js" });

    const KeyEngine = sandbox.window.KeyEngine;
    const ModEngine = sandbox.window.ModEngine;
    KeyEngine.init(fakeAudioContext, fakeSourceNode);

    function stepFrames(n) {
        for (let i = 0; i < n; i++) {
            if (capturedRaf) { const cb = capturedRaf; capturedRaf = null; cb(); }
        }
    }

    function setSpectrum(fn) { currentSpectrumFn = fn; }

    // Cho chromaVector (chậm, 0.96) hội tụ THẬT SỰ về gần đúng phổ hiện tại trước khi coi là
    // "đã ổn định" ở mức đó — dùng đủ nhiều khung để không phụ thuộc vào ước lượng lý thuyết.
    function settleChroma(frames = 150) { stepFrames(frames); }

    function fireModPollTick() {
        const entry = capturedIntervals.find((e) => e.ms === 1000); // POLL_INTERVAL_MS của ModEngine V2
        if (entry) entry.cb();
    }

    return { KeyEngine, ModEngine, stepFrames, setSpectrum, settleChroma, fireModPollTick };
}

function runPartA_SingleFrameDoesNotTriggerMod() {
    console.log("=== PHẦN A: 1 lần đo lẻ đổi root -> KHÔNG báo modulation ngay ===");

    const { KeyEngine, ModEngine, setSpectrum, settleChroma, fireModPollTick } = createSandbox();

    settleChroma(); // ổn định ở G Minor trước
    const gResult = KeyEngine.estimateKeyFromChroma();
    check(gResult.key === "G Minor", `Chroma đã ổn định đúng G Minor trước khi bắt đầu test (thực tế: ${gResult.key})`);

    const modEvents = [];
    ModEngine.start(gResult.rootIndex, (data) => modEvents.push(data), () => false);

    setSpectrum(A_MINOR);
    settleChroma(); // đổi hẳn sang A Minor, chroma đã phản ánh đúng

    fireModPollTick(); // CHỈ 1 lần đo — chưa đủ SUSTAIN_REQUIRED (3)

    check(modEvents.length === 0, `1 lần đo lẻ (dù root đã thực sự đổi) -> CHƯA báo modulation (thực tế: ${modEvents.length} event)`);

    ModEngine.stop();
}

function runPartB_OscillationDoesNotTriggerMod() {
    console.log("\n=== PHẦN B: Dao động qua lại (không liên tục) -> KHÔNG báo modulation ===");

    const { KeyEngine, ModEngine, setSpectrum, settleChroma, fireModPollTick } = createSandbox();

    settleChroma();
    const gResult = KeyEngine.estimateKeyFromChroma();

    const modEvents = [];
    ModEngine.start(gResult.rootIndex, (data) => modEvents.push(data), () => false);

    // A Minor, rồi quay lại G Minor, rồi A Minor lần nữa -> streak liên tục KHÔNG BAO GIỜ đạt 3
    setSpectrum(A_MINOR); settleChroma(); fireModPollTick();
    setSpectrum(G_MINOR); settleChroma(); fireModPollTick();
    setSpectrum(A_MINOR); settleChroma(); fireModPollTick();

    check(modEvents.length === 0, `Dao động G<->A không liên tục -> KHÔNG báo modulation (thực tế: ${modEvents.length} event)`);

    ModEngine.stop();
}

function runPartC_SustainedTransitionTriggersMod() {
    console.log("\n=== PHẦN C: Đổi root LIÊN TỤC đủ 3 lần -> báo ĐÚNG 1 lần, đúng số bán cung ===");

    const { KeyEngine, ModEngine, setSpectrum, settleChroma, fireModPollTick } = createSandbox();

    settleChroma();
    const gResult = KeyEngine.estimateKeyFromChroma();
    check(gResult.rootIndex === 7, `G = rootIndex 7 theo NOTE_NAMES (thực tế: ${gResult.rootIndex})`); // C=0..G=7

    const modEvents = [];
    ModEngine.start(gResult.rootIndex, (data) => modEvents.push(data), () => false);

    setSpectrum(A_MINOR);
    settleChroma();

    // Đúng ví dụ trong đề bài: G Minor, G Minor, G Minor (đã ở baseline, không tính) rồi
    // A Minor, A Minor, A Minor (3 lần liên tục) -> Mod.
    fireModPollTick(); // A Minor lần 1 (streak=1)
    check(modEvents.length === 0, "Sau lần đo A Minor thứ 1 -> CHƯA báo (streak=1 < 3)");

    fireModPollTick(); // lần 2 (streak=2)
    check(modEvents.length === 0, "Sau lần đo A Minor thứ 2 -> CHƯA báo (streak=2 < 3)");

    fireModPollTick(); // lần 3 (streak=3) -> ĐỦ, báo modulation
    check(modEvents.length === 1, `Sau lần đo A Minor thứ 3 LIÊN TỤC -> báo ĐÚNG 1 lần (thực tế: ${modEvents.length})`);

    if (modEvents.length === 1) {
        // G(7) -> A(9): +2 bán cung
        check(modEvents[0].semitone === 2, `Số bán cung đúng: G -> A = +2 (thực tế: ${modEvents[0].semitone})`);
    }

    fireModPollTick(); // vẫn A Minor, ĐÃ báo rồi -> không báo lại lần nữa
    check(modEvents.length === 1, "Tiếp tục ở A Minor sau khi đã báo -> KHÔNG báo lặp lại (chỉ 1 event)");

    ModEngine.stop();
}

function runPartD_ManualOverrideBlocksMod() {
    console.log("\n=== PHẦN D: Đang Manual Override -> không báo modulation dù root đổi thật ===");

    const { KeyEngine, ModEngine, setSpectrum, settleChroma, fireModPollTick } = createSandbox();

    settleChroma();
    const gResult = KeyEngine.estimateKeyFromChroma();

    const modEvents = [];
    ModEngine.start(gResult.rootIndex, (data) => modEvents.push(data), () => true); // LUÔN báo đang Manual Override

    setSpectrum(A_MINOR);
    settleChroma();
    fireModPollTick(); fireModPollTick(); fireModPollTick(); fireModPollTick(); fireModPollTick();

    check(modEvents.length === 0, "isManualOverrideActiveFn() luôn true -> KHÔNG bao giờ báo modulation, dù đổi root thật nhiều lần");

    ModEngine.stop();
}

function runPartE_LowConfidenceNotCountedInStreak() {
    console.log("\n=== PHẦN E: Confidence thấp (audio im lặng) -> không tính vào streak ===");

    const { KeyEngine, ModEngine, setSpectrum, settleChroma, fireModPollTick } = createSandbox();

    settleChroma();
    const gResult = KeyEngine.estimateKeyFromChroma();

    const modEvents = [];
    ModEngine.start(gResult.rootIndex, (data) => modEvents.push(data), () => false);

    // LƯU Ý QUAN TRỌNG (phát hiện khi viết test): Pearson correlation BẤT BIẾN theo tỉ lệ biên
    // độ — 1 chroma vector "im lặng" (cùng hình dạng cũ, chỉ nhỏ dần đều do EMA phân rã) vẫn giữ
    // NGUYÊN confidence cao vì HÌNH DẠNG tương đối giữa 12 nốt không đổi. Đây là đặc tính CÓ SẴN
    // của thuật toán (không phải lỗi do task này gây ra) — ĐÃ GHI NHẬN vào báo cáo (mục Known
    // Issues). Để test đúng ý nghĩa "confidence thấp", phải dùng phổ THỰC SỰ MƠ HỒ (năng lượng
    // trải đều nhiều pitch-class, giống nhiễu trắng) — không tương quan rõ với bất kỳ profile nào.
    function ambiguousNoiseSpectrum() {
        const arr = new Float32Array(4096).fill(-100);
        const binHz = 48000 / 8192;
        // Rải năng lượng gần bằng nhau lên TẤT CẢ 12 nốt (thay vì chỉ 3 nốt của 1 hợp âm) ->
        // không có hình dạng ưu tiên rõ ràng cho bất kỳ Major/Minor profile nào.
        for (let pc = 0; pc < 12; pc++) {
            const f = 110 * Math.pow(2, pc / 12); // A2 * 2^(pc/12) — trải đều 12 nốt quãng 8 A2-A3
            const bin = Math.round(f / binHz);
            if (bin >= 0 && bin < arr.length) arr[bin] = -20;
        }
        return arr;
    }

    setSpectrum(A_MINOR); settleChroma(); fireModPollTick(); // streak=1
    setSpectrum(ambiguousNoiseSpectrum); settleChroma(); fireModPollTick(); // mơ hồ -> reset streak về 0
    setSpectrum(A_MINOR); settleChroma();
    fireModPollTick(); // streak=1 (lại từ đầu)
    fireModPollTick(); // streak=2

    check(modEvents.length === 0, "Xen giữa 1 lần đo confidence thấp (phổ mơ hồ) -> streak bị reset, chưa đủ 3 lần liên tục để báo");

    ModEngine.stop();
}

function main() {
    runPartA_SingleFrameDoesNotTriggerMod();
    runPartB_OscillationDoesNotTriggerMod();
    runPartC_SustainedTransitionTriggersMod();
    runPartD_ManualOverrideBlocksMod();
    runPartE_LowConfidenceNotCountedInStreak();

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — Mod Engine V2 (Sustained Transition) hoạt động đúng.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}

main();
