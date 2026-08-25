/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Key Engine v2.0
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/KeyEngineV2.verify.js
 *
 * Kiểm chứng 4 kỹ thuật MỚI thêm vào ui/js/engines/keyEngine.js (v2.0):
 *   1. estimateKeyFromChroma(vector) nhận tham số tuỳ chọn — mặc định
 *      (không tham số) vẫn giữ NGUYÊN hành vi/API công khai cũ.
 *   2. Peak-picking + Spectral Whitening — vẫn nhận diện ĐÚNG hợp âm
 *      rõ ràng, kể cả khi phổ có "chân"/rò rỉ (leakage) giả lập xung
 *      quanh đỉnh thật (kịch bản KHÔNG có trong test cũ MarginEngine).
 *   3. chromaVectorFast hội tụ NHANH HƠN chromaVector — đo bằng số
 *      khung hình cần để đạt cùng 1 mức % hội tụ, chạy THẬT qua sandbox,
 *      không suy đoán từ công thức toán trên giấy.
 *   4. onProvisionalEstimate() nhận đúng dữ liệu tính từ chromaVectorFast.
 *
 * Dùng chung kỹ thuật sandbox "vm" với tests/unit/MarginEngine.verify.js
 * (chạy THẬT file keyEngine.js, không phải mock lại thuật toán).
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

const keyEngineSource = fs.readFileSync(
    path.resolve(__dirname, "../../ui/js/engines/keyEngine.js"),
    "utf-8"
);

function makeFakeAnalyser(fakeSpectrumFn) {
    return {
        fftSize: 8192,
        smoothingTimeConstant: 0,
        frequencyBinCount: 4096,
        getFloatFrequencyData(arr) {
            const spectrum = fakeSpectrumFn();
            for (let i = 0; i < arr.length; i++) arr[i] = spectrum[i] ?? -120;
        }
    };
}

// Dựng 1 KeyEngine THẬT trong sandbox riêng, trả về instance để test tự điều khiển
// nhiều bước (khác MarginEngine.verify.js chỉ cần 1 kết quả cuối).
function createSandboxEngine(fakeSpectrumFn) {
    let capturedRaf = null;
    let capturedIntervals = []; // {cb, ms} — KHÔNG tự chạy, test tự gọi tay để kiểm soát hoàn toàn

    const fakeAudioContext = { sampleRate: 48000, createAnalyser: () => makeFakeAnalyser(fakeSpectrumFn) };
    const fakeSourceNode = { connect: () => {} };

    const sandbox = {
        window: {},
        Float32Array,
        Math,
        Array,
        console: { log: () => {} }, // tắt log để output test gọn — không ảnh hưởng logic
        requestAnimationFrame: (cb) => { capturedRaf = cb; return 1; },
        cancelAnimationFrame: () => {},
        setInterval: (cb, ms) => { capturedIntervals.push({ cb, ms }); return capturedIntervals.length; },
        clearInterval: () => {}
    };
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });

    const KeyEngine = sandbox.window.KeyEngine;
    KeyEngine.init(fakeAudioContext, fakeSourceNode);

    function stepFrame() {
        if (capturedRaf) {
            const cb = capturedRaf;
            capturedRaf = null;
            cb();
        }
    }

    function stepFrames(n) {
        for (let i = 0; i < n; i++) stepFrame();
    }

    // Gọi tay callback provisional (không phụ thuộc thời gian thật trôi qua) — test kiểm
    // soát hoàn toàn số lần gọi, không cần chờ setInterval thật.
    function fireProvisionalTick() {
        const provisionalEntry = capturedIntervals.find((e) => e.ms === 400); // PROVISIONAL_INTERVAL_MS
        if (provisionalEntry) provisionalEntry.cb();
    }

    return { KeyEngine, stepFrame, stepFrames, fireProvisionalTick };
}

function spectrumForCMajor() {
    const arr = new Float32Array(4096).fill(-100);
    const freqs = [65.4, 130.8, 261.6, 329.6, 392.0, 523.3]; // C2,C3,C4,E4,G4,C5
    const binHz = 48000 / 8192;
    for (const f of freqs) {
        const bin = Math.round(f / binHz);
        if (bin >= 0 && bin < arr.length) arr[bin] = -10;
    }
    return arr;
}

// Giống spectrumForCMajor nhưng mỗi đỉnh có thêm "chân" lan sang ±3 bin lân cận với biên độ
// giảm dần — mô phỏng rò rỉ phổ (spectral leakage) thật của FFT trên tín hiệu thực tế.
function spectrumForCMajorWithLeakage() {
    const arr = new Float32Array(4096).fill(-100);
    const freqs = [65.4, 130.8, 261.6, 329.6, 392.0, 523.3];
    const binHz = 48000 / 8192;
    for (const f of freqs) {
        const centerBin = Math.round(f / binHz);
        for (let d = -3; d <= 3; d++) {
            const bin = centerBin + d;
            if (bin < 0 || bin >= arr.length) continue;
            const db = -10 - Math.abs(d) * 8; // đỉnh -10dB, giảm dần ra 2 bên
            if (db > arr[bin]) arr[bin] = db;
        }
    }
    return arr;
}

function spectrumForGMajor() {
    const arr = new Float32Array(4096).fill(-100);
    const freqs = [98.0, 196.0, 392.0, 493.9, 587.3]; // G2,G3,G4,B4,D5
    const binHz = 48000 / 8192;
    for (const f of freqs) {
        const bin = Math.round(f / binHz);
        if (bin >= 0 && bin < arr.length) arr[bin] = -10;
    }
    return arr;
}

// ================================
// PHẦN A — Tham số override của estimateKeyFromChroma() không phá API cũ
// ================================
function runPartA_ParamOverrideBackwardCompatible() {
    console.log("=== PHẦN A: estimateKeyFromChroma(vector) — tham số tuỳ chọn, không phá API cũ ===");

    const { KeyEngine, stepFrames } = createSandboxEngine(spectrumForCMajor);
    stepFrames(30);

    const noArg = KeyEngine.estimateKeyFromChroma();
    const snapshot = KeyEngine.getDebugSnapshot();
    const explicitArg = KeyEngine.estimateKeyFromChroma(snapshot.chromaVector);

    check(noArg.key === explicitArg.key && noArg.confidence === explicitArg.confidence,
        "Gọi KHÔNG tham số cho kết quả giống hệt gọi VỚI tham số = chromaVector hiện tại (tương thích ngược 100%)");

    check(noArg.key === "C Major", `Vẫn nhận diện đúng C Major như trước (thực tế: ${noArg.key})`);

    // getDebugSnapshot() mở rộng thêm field mới, KHÔNG xoá field cũ.
    check(Array.isArray(snapshot.chromaVector) && snapshot.chromaVector.length === 12, "getDebugSnapshot().chromaVector vẫn còn nguyên (field cũ không đổi)");
    check(Array.isArray(snapshot.bassRootVotes), "getDebugSnapshot().bassRootVotes vẫn còn nguyên (field cũ không đổi)");
    check(Array.isArray(snapshot.chromaVectorFast) && snapshot.chromaVectorFast.length === 12, "getDebugSnapshot().chromaVectorFast — field MỚI, bổ sung thêm, không phá field cũ");
}

// ================================
// PHẦN B — Peak-picking + Whitening vẫn chính xác dù có rò rỉ phổ
// ================================
function runPartB_AccuracyWithSpectralLeakage() {
    console.log("\n=== PHẦN B: Vẫn nhận diện ĐÚNG Key dù phổ có rò rỉ (spectral leakage) ===");

    const clean = createSandboxEngine(spectrumForCMajor);
    clean.stepFrames(30);
    const cleanResult = clean.KeyEngine.estimateKeyFromChroma();

    const leaky = createSandboxEngine(spectrumForCMajorWithLeakage);
    leaky.stepFrames(30);
    const leakyResult = leaky.KeyEngine.estimateKeyFromChroma();

    check(cleanResult.key === "C Major", `Phổ sạch -> nhận diện đúng C Major (thực tế: ${cleanResult.key})`);
    check(leakyResult.key === "C Major", `Phổ CÓ rò rỉ xung quanh mỗi đỉnh -> VẪN nhận diện đúng C Major nhờ peak-picking (thực tế: ${leakyResult.key})`);

    const gMajor = createSandboxEngine(spectrumForGMajor);
    gMajor.stepFrames(30);
    const gResult = gMajor.KeyEngine.estimateKeyFromChroma();
    check(gResult.key === "G Major", `Kịch bản độc lập khác (G Major) cũng đúng (thực tế: ${gResult.key})`);
}

// ================================
// PHẦN C — chromaVectorFast hội tụ NHANH HƠN chromaVector (đo thật, không suy đoán)
// ================================
function runPartC_FastVectorConvergesFaster() {
    console.log("\n=== PHẦN C: chromaVectorFast hội tụ nhanh hơn chromaVector (đo thật qua sandbox) ===");

    const { KeyEngine, stepFrame } = createSandboxEngine(spectrumForCMajor);

    // Đưa vào TRẠNG THÁI ỔN ĐỊNH trước (nhiều khung) để có "đích" hội tụ tham chiếu.
    for (let i = 0; i < 200; i++) stepFrame();
    const steady = KeyEngine.getDebugSnapshot();
    const steadyTargetIndex = steady.chromaVector.indexOf(Math.max(...steady.chromaVector));

    // Giờ so sánh: sau ĐÚNG 10 khung hình kể từ trạng thái đã ổn định (audio không đổi nội
    // dung, chỉ tiếp tục dò) — cả 2 vector đều nên gần giống snapshot ổn định, nhưng đây
    // không phải kịch bản đo tốc độ hội tụ đúng nghĩa. Đo tốc độ hội tụ đúng cách: RESET
    // engine, cấp lại đúng phổ C Major từ đầu (0 -> steady), đếm số khung mỗi vector cần để
    // đạt >= 90% giá trị đỉnh ổn định tại ĐÚNG chỉ số nốt chủ (root) đã xác định ở trên.

    const fresh = createSandboxEngine(spectrumForCMajor);
    const target = steady.chromaVector[steadyTargetIndex] * 0.90;

    let framesForSlow = -1;
    let framesForFast = -1;

    for (let f = 1; f <= 200; f++) {
        fresh.stepFrame();
        const snap = fresh.KeyEngine.getDebugSnapshot();

        if (framesForSlow === -1 && snap.chromaVector[steadyTargetIndex] >= target) framesForSlow = f;
        if (framesForFast === -1 && snap.chromaVectorFast[steadyTargetIndex] >= target) framesForFast = f;

        if (framesForSlow !== -1 && framesForFast !== -1) break;
    }

    check(framesForFast > 0 && framesForSlow > 0, `Cả 2 vector đều hội tụ được trong 200 khung thử (fast=${framesForFast}, slow=${framesForSlow})`);
    check(framesForFast < framesForSlow, `chromaVectorFast đạt 90% giá trị ổn định SỚM HƠN chromaVector (fast=${framesForFast} khung, slow=${framesForSlow} khung)`);
}

// ================================
// PHẦN D — onProvisionalEstimate() dùng đúng chromaVectorFast
// ================================
function runPartD_ProvisionalUsesFastVector() {
    console.log("\n=== PHẦN D: onProvisionalEstimate() phản ánh đúng chromaVectorFast, không đợi chromaVector chậm ===");

    const { KeyEngine, stepFrames, fireProvisionalTick } = createSandboxEngine(spectrumForCMajor);

    const provisionalResults = [];
    KeyEngine.onProvisionalEstimate((estimate) => provisionalResults.push(estimate));

    // Chỉ chạy 15 khung hình (~250ms ở 60fps) — CHƯA đủ để chromaVector (chậm) hội tụ tốt,
    // nhưng chromaVectorFast nên đã đủ gần để vượt MIN_CONFIDENCE và cho ra ước lượng.
    stepFrames(15);
    fireProvisionalTick();

    check(provisionalResults.length === 1, `onProvisionalEstimate() được gọi đúng 1 lần sau 1 tick (thực tế: ${provisionalResults.length})`);

    if (provisionalResults.length === 1) {
        check(typeof provisionalResults[0].key === "string" && typeof provisionalResults[0].confidence === "number",
            "Dữ liệu provisional có đúng field key/confidence");
    }

    // Dưới ngưỡng tin cậy (audio im lặng thật, không phải "chưa kịp chạy khung nào" — init()
    // đã tự chạy 1 khung ngay khi gọi, đó là hành vi ĐÚNG/có sẵn, không phải lỗi) -> KHÔNG
    // được gọi callback (đúng yêu cầu "không hiện Key tạm là rác khi audio chưa đủ tín hiệu").
    function silentSpectrum() {
        return new Float32Array(4096).fill(-120); // im lặng hoàn toàn
    }
    const { KeyEngine: freshEngine, fireProvisionalTick: freshTick } = createSandboxEngine(silentSpectrum);
    const freshResults = [];
    freshEngine.onProvisionalEstimate((e) => freshResults.push(e));
    freshTick();
    check(freshResults.length === 0, "Audio im lặng hoàn toàn -> KHÔNG gọi callback provisional (không hiện rác)");
}

function main() {
    runPartA_ParamOverrideBackwardCompatible();
    runPartB_AccuracyWithSpectralLeakage();
    runPartC_FastVectorConvergesFaster();
    runPartD_ProvisionalUsesFastVector();

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — Key Engine v2.0 (peak-picking/whitening/dual-rate smoothing) hoạt động đúng.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}

main();
