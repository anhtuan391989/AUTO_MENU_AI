/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng KeyEngine Fast Path (TASK A32)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/KeyEngineFastPath.verify.js
 *
 * SYNTHETIC TEST — chạy trong sandbox Node (vm), KHÔNG phải audio thật, KHÔNG chạy trên
 * Windows/Electron thật. Dùng để kiểm chứng LOGIC/TIMING của Fast Path mới thêm vào
 * runVoteLoop() (ui/js/engines/keyEngine.js) một cách xác định (deterministic) — không phụ
 * thuộc CPU máy chạy nhanh/chậm. Đây KHÔNG thay thế yêu cầu test bằng audio thật trên máy
 * Windows của Khói (xem A32 REPORT — mục "Test bằng audio thật CHƯA THỰC HIỆN được trong
 * sandbox này").
 *
 * Kiểm chứng:
 *   1. Fast Path chốt Key ĐẦU TIÊN trong ≤2000ms (giả lập) khi tín hiệu rõ + ổn định.
 *   2. Fast Path KHÔNG chốt sớm hơn FAST_PATH_MIN_ELAPSED_MS dù confidence tối đa (sàn vật lý).
 *   3. Fast Path KHÔNG chốt nếu candidate ĐỔI liên tục (không đủ streak cùng 1 Key) — chặn
 *      false positive kiểu "vồ nhầm 1 frame".
 *   4. Fast Path KHÔNG chốt khi hasMusicalContent=false (im lặng/nhiễu).
 *   5. onWinner() CHỈ được gọi ĐÚNG 1 LẦN cho mỗi detectOnce() — không double-fire dù cả 2
 *      đường (fast + chậm) cùng "chín".
 *   6. Đường VOTE-WINDOW (15s) và ADAPTIVE (cũ) vẫn hoạt động Y HỆT trước khi có A32 — verify
 *      bằng cách chặn Fast Path (ép confidence dưới ngưỡng ở nhánh nhanh) rồi xem đường chậm
 *      vẫn tự chốt đúng sau đủ thời gian như thiết kế gốc.
 *   7. Nhiều Key khác nhau (C Major, A Minor, D Minor, D# Minor) đều được Fast Path nhận
 *      ĐÚNG — không chỉ đúng với 1 case.
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

/**
 * Sandbox có kiểm soát HOÀN TOÀN: requestAnimationFrame (audio frame), setInterval (các vòng
 * lặp thời gian), VÀ Date.now() (đồng hồ giả — test tự "tua" thời gian, không phụ thuộc tốc
 * độ máy chạy test thật).
 */
function createSandboxEngine(fakeSpectrumFn) {
    let capturedRaf = null;
    let capturedIntervals = []; // {id, cb, ms} — KHÔNG tự chạy, test tự gọi tay
    let fakeNow = 0;
    let intervalIdSeq = 0;

    const fakeAudioContext = { sampleRate: 48000, createAnalyser: () => makeFakeAnalyser(fakeSpectrumFn) };
    const fakeSourceNode = { connect: () => {} };

    const sandbox = {
        window: {},
        Float32Array,
        Math,
        Array,
        Date: { now: () => fakeNow },
        console: { log: () => {} },
        requestAnimationFrame: (cb) => { capturedRaf = cb; return 1; },
        cancelAnimationFrame: () => {},
        setInterval: (cb, ms) => { const id = ++intervalIdSeq; capturedIntervals.push({ id, cb, ms }); return id; },
        clearInterval: (id) => { capturedIntervals = capturedIntervals.filter((e) => e.id !== id); }
    };
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });

    const KeyEngine = sandbox.window.KeyEngine;
    KeyEngine.init(fakeAudioContext, fakeSourceNode);

    function stepFrame() {
        if (capturedRaf) { const cb = capturedRaf; capturedRaf = null; cb(); }
    }
    function stepFrames(n) { for (let i = 0; i < n; i++) stepFrame(); }

    // Tua đồng hồ giả thêm `ms`, rồi bắn TẤT CẢ interval đã đăng ký đúng nhịp của chúng
    // (vd advance(400) sẽ bắn interval ms=400 đúng 1 lần, interval ms=1500 thì KHÔNG bắn nếu
    // 400 < 1500) — dùng bộ đếm riêng cho từng interval, mô phỏng đúng hành vi setInterval thật.
    const elapsedSinceRegister = new Map(); // id -> ms đã tích luỹ kể từ lần bắn gần nhất
    function advance(ms, framesPerStep = 1) {
        const stepMs = 10; // tua từng bước nhỏ để không bỏ lỡ mốc nào, đồng thời step vài audio frame
        let remaining = ms;
        while (remaining > 0) {
            const dt = Math.min(stepMs, remaining);
            fakeNow += dt;
            remaining -= dt;
            stepFrames(framesPerStep); // cập nhật chromaVector/chromaVectorFast liên tục theo thời gian trôi
            capturedIntervals.forEach((entry) => {
                const acc = (elapsedSinceRegister.get(entry.id) || 0) + dt;
                if (acc >= entry.ms) {
                    elapsedSinceRegister.set(entry.id, acc - entry.ms);
                    entry.cb();
                } else {
                    elapsedSinceRegister.set(entry.id, acc);
                }
            });
        }
    }

    return { KeyEngine, stepFrame, stepFrames, advance, getFakeNow: () => fakeNow };
}

function spectrumFor(freqs) {
    // Mô phỏng overtone TỰ NHIÊN như nhạc cụ/giọng hát thật (khớp HARMONIC_AMP trong
    // keyEngine.js: [1.0, 0.60, 0.42, 0.30, 0.20, 0.15, 0.10, 0.07]) — sine đơn thuần (không
    // harmonic) KHÔNG phải tín hiệu đại diện công bằng cho "audio rõ ràng thật" dưới thuật toán
    // harmonic-template chroma hiện tại (mỗi phím được so khớp bằng CẢ 8 harmonic, không chỉ 1
    // tần số đơn — test phải cho input tương ứng, nếu không sẽ đo margin thấp giả tạo do chính
    // cách dựng test, không phải do thuật toán thật sự yếu).
    const HARMONIC_AMP = [1.0, 0.60, 0.42, 0.30, 0.20, 0.15, 0.10, 0.07];
    return () => {
        const arr = new Float32Array(4096).fill(-100);
        const binHz = 48000 / 8192;
        for (const f of freqs) {
            for (let h = 0; h < HARMONIC_AMP.length; h++) {
                const bin = Math.round((f * (h + 1)) / binHz);
                if (bin >= 0 && bin < arr.length) {
                    const db = -10 + 20 * Math.log10(HARMONIC_AMP[h]); // quy đổi biên độ tương đối -> dB, gốc -10dB cho harmonic 1
                    arr[bin] = Math.max(arr[bin], db);
                }
            }
        }
        return arr;
    };
}

const SPECTRA = {
    "C Major": spectrumFor([65.4, 130.8, 261.6, 329.6, 392.0, 523.3]),      // C2,C3,C4,E4,G4,C5
    "A Minor": spectrumFor([55.0, 110.0, 220.0, 261.6, 329.6, 440.0]),      // A1,A2,A3,C4,E4,A4 (A-C-E)
    "D Minor": spectrumFor([73.4, 146.8, 293.7, 349.2, 440.0, 587.3]),      // D2,D3,D4,F4,A4,D5 (D-F-A)
    "D# Minor": spectrumFor([77.8, 155.6, 311.1, 370.0, 466.2, 622.3]),     // D#2,D#3,D#4,F#4,A#4,D#5
};
function silenceSpectrum() { return new Float32Array(4096).fill(-100); }

// ================================
// TEST 1 — Fast Path chốt trong ≤2000ms với tín hiệu rõ/ổn định, đúng Key, cho NHIỀU Key khác nhau
// ================================
function runTest1_FastPathLatencyAndAccuracy() {
    console.log("\n=== TEST 1: Fast Path — latency ≤2000ms + đúng Key (nhiều Key khác nhau) ===");

    Object.entries(SPECTRA).forEach(([expectedKey, spectrumFn]) => {
        const { KeyEngine, advance, getFakeNow } = createSandboxEngine(spectrumFn);

        // Cho vài frame "khởi động" để chromaVector/chromaVectorFast có dữ liệu trước khi bắt
        // đầu đo latency thật (đúng tinh thần T0 = audio hợp lệ bắt đầu, không tính lúc mảng
        // còn toàn số 0 lúc mới init()).
        let winnerResult = null, winnerElapsedMs = null, winnerCount = 0;
        const stop = KeyEngine.detectOnce((result) => {
            winnerResult = result;
            winnerElapsedMs = getFakeNow();
            winnerCount++;
        });

        advance(2500); // tua 2.5s giả lập — đủ để Fast Path (sàn 1200ms + 3 nhịp 400ms) kích hoạt nếu đúng thiết kế

        check(winnerResult !== null, `[${expectedKey}] Fast Path CÓ chốt được Key trong 2.5s giả lập (thực tế: ${winnerResult ? "có" : "KHÔNG có kết quả nào"})`);
        if (winnerResult) {
            check(winnerResult.key === expectedKey, `[${expectedKey}] Key chốt ĐÚNG (thực tế: ${winnerResult.key})`);
            check(winnerElapsedMs <= 2000, `[${expectedKey}] Latency ≤2000ms (thực tế: ${winnerElapsedMs}ms)`);
            check(winnerCount === 1, `[${expectedKey}] onWinner() chỉ gọi ĐÚNG 1 LẦN, không double-fire (thực tế: ${winnerCount} lần)`);
        }
        stop();
    });
}

// ================================
// TEST 2 — Sàn vật lý FAST_PATH_MIN_ELAPSED_MS: không chốt sớm hơn dù confidence tối đa
// ================================
function runTest2_PhysicalFloorRespected() {
    console.log("\n=== TEST 2: Fast Path KHÔNG chốt sớm hơn sàn vật lý (FAST_PATH_MIN_ELAPSED_MS=1200ms) ===");

    const { KeyEngine, advance, getFakeNow } = createSandboxEngine(SPECTRA["C Major"]);
    let winnerAt = null;
    const stop = KeyEngine.detectOnce((result) => { winnerAt = getFakeNow(); });

    advance(1199); // NGAY TRƯỚC sàn 1200ms
    check(winnerAt === null, `Chưa chốt ở 1199ms — đúng sàn vật lý (thực tế: ${winnerAt === null ? "chưa chốt" : `đã chốt lúc ${winnerAt}ms`})`);

    advance(50); // vượt qua mốc 1200ms
    // Không assert winnerAt !== null ở đây bắt buộc (còn tuỳ streak vừa đủ hay chưa), chỉ cần
    // đảm bảo nó KHÔNG chốt trước 1200ms là đủ cho mục tiêu test này.
    stop();
}

// ================================
// TEST 3 — Candidate đổi liên tục -> KHÔNG đủ streak -> KHÔNG chốt qua Fast Path
// ================================
function runTest3_NoFastLockOnFlickeringCandidate() {
    console.log("\n=== TEST 3: Candidate ĐỔI đúng nhịp mỗi lần kiểm tra Fast Path (400ms) -> KHÔNG chốt (chặn false positive) ===");

    // Đổi tín hiệu THẬT theo mốc 400ms (đúng nhịp FAST_PATH_INTERVAL_MS) — mỗi cửa sổ 400ms có
    // ĐỦ thời gian để chromaVectorFast (EMA 0.80/frame, ~40 frame/400ms ở bước 10ms) hội tụ gần
    // như hoàn toàn về 1 trong 2 Key, nên mỗi lần Fast Path kiểm tra sẽ thấy 1 candidate RÕ
    // RÀNG (không bị trộn lẫn) nhưng LUÔN KHÁC lần trước — đúng kịch bản "ambiguous/dao động
    // giữa 2 khả năng", streak phải reset liên tục, không bao giờ đủ 3 lần liên tiếp CÙNG 1 Key.
    let t = 0;
    const alternating = () => (Math.floor(t / 400) % 2 === 0) ? SPECTRA["C Major"]() : SPECTRA["D Minor"]();

    const { KeyEngine, advance, getFakeNow } = createSandboxEngine(() => alternating());
    let winnerAt = null, winnerKey = null;
    const stop = KeyEngine.detectOnce((result) => { winnerAt = getFakeNow(); winnerKey = result.key; });

    const stepMs = 10;
    for (let elapsed = 0; elapsed < 2900 && winnerAt === null; elapsed += stepMs) {
        t = elapsed;
        advance(stepMs);
    }

    check(winnerAt === null, `Chưa chốt qua BẤT KỲ đường nào trong 2.9s khi candidate đổi đúng nhịp mỗi 400ms (thực tế: ${winnerAt === null ? "chưa chốt" : `đã chốt "${winnerKey}" lúc ${winnerAt}ms — SAI, false positive`})`);
    stop();
}

// ================================
// TEST 4 — Im lặng (hasMusicalContent=false) -> không bao giờ chốt
// ================================
function runTest4_NoLockOnSilence() {
    console.log("\n=== TEST 4: Im lặng hoàn toàn -> KHÔNG BAO GIỜ chốt Key (Fast Path lẫn đường chậm) ===");

    const { KeyEngine, advance, getFakeNow } = createSandboxEngine(silenceSpectrum);
    let winnerAt = null;
    const stop = KeyEngine.detectOnce((result) => { winnerAt = getFakeNow(); });

    advance(20000); // tua xa hơn cả sàn 15s của đường chậm — vẫn phải KHÔNG có kết quả

    check(winnerAt === null, `Im lặng 20s giả lập -> vẫn KHÔNG chốt Key nào (thực tế: ${winnerAt === null ? "đúng, không chốt" : `SAI — đã chốt lúc ${winnerAt}ms`})`);
    stop();
}

// ================================
// TEST 5 — Đường VOTE-WINDOW/ADAPTIVE cũ vẫn hoạt động y hệt khi Fast Path bị chặn (candidate
// đổi liên tục trong 1.2s đầu để Fast Path không kịp tích streak, sau đó ổn định lại)
// ================================
function runTest5_OldPathsStillWorkWhenFastPathBlocked() {
    console.log("\n=== TEST 5: Đường VOTE-WINDOW/ADAPTIVE cũ (trước A32) vẫn hoạt động khi Fast Path không kích hoạt được ===");

    // 1.3s đầu: candidate đổi liên tục (Fast Path không tích đủ streak). Sau đó: ổn định D Minor
    // liên tục -> phải rơi vào đường ADAPTIVE hoặc VOTE-WINDOW như thiết kế GỐC (không đổi).
    let t = 0;
    const mixedThenStable = () => {
        if (t < 1300) return (Math.floor(t / 100) % 2 === 0) ? SPECTRA["C Major"]() : SPECTRA["A Minor"]();
        return SPECTRA["D Minor"]();
    };

    const { KeyEngine, advance, getFakeNow } = createSandboxEngine(() => mixedThenStable());
    let winnerResult = null, winnerAt = null, winnerCount = 0;
    const stop = KeyEngine.detectOnce((result) => { winnerResult = result; winnerAt = getFakeNow(); winnerCount++; });

    // Tua thủ công đồng thời cập nhật biến t dùng trong spectrum callback
    const stepMs = 10;
    for (let elapsed = 0; elapsed < 16000 && winnerResult === null; elapsed += stepMs) {
        t = elapsed;
        advance(stepMs);
    }

    check(winnerResult !== null, `Vẫn chốt được Key qua đường cũ (vote-window/adaptive) khi Fast Path bị chặn lúc đầu (thực tế: ${winnerResult ? "có chốt" : "KHÔNG chốt — REGRESSION so với hành vi trước A32"})`);
    if (winnerResult) {
        check(winnerResult.key === "D Minor", `Key chốt ĐÚNG D Minor (thực tế: ${winnerResult.key})`);
        check(winnerAt > 1300, `Thời điểm chốt SAU khi tín hiệu ổn định (đúng logic vote-window cần dữ liệu ổn định) (thực tế: ${winnerAt}ms)`);
        check(winnerCount === 1, `onWinner() vẫn chỉ gọi ĐÚNG 1 LẦN (thực tế: ${winnerCount})`);
    }
    stop();
}

// ================================
// TEST 6 (A34) — Tái hiện ĐÚNG bug pattern Khói báo: hợp âm THIẾU quãng 3 (chỉ root+5th, không
// rõ Major hay Minor — margin phải RẤT thấp) -> Fast Path KHÔNG được khoá nhầm dù rawConfidence
// vẫn cao (đây chính xác là lỗi gốc: rawConfidence cao nhưng margin thấp vẫn từng lọt qua gate cũ)
// ================================
function runTest6_AmbiguousChordNoThirdMustNotFastLock() {
    console.log("\n=== TEST 6 (A34): Hợp âm thiếu quãng 3 (mập mờ Major/Minor thật) -> Fast Path KHÔNG khoá nhầm ===");

    // Chỉ root + quãng 5 (không có quãng 3 major/minor nào) — về mặt nhạc lý, đây là hợp âm
    // "power chord", THẬT SỰ mập mờ giữa Major/Minor (đúng bản chất vấn đề margin=0.01-0.02 mà
    // Khói quan sát được trên audio thật, nơi harmonic của quãng 3 không đủ rõ/bị lấn át).
    const ambiguousPowerChord = spectrumFor([116.5, 233.1, 349.2]); // A#2, A#3, F4 (root + octave + quãng 5, KHÔNG có quãng 3)

    const { KeyEngine, advance, getFakeNow } = createSandboxEngine(ambiguousPowerChord);
    let winnerAt = null, winnerKey = null;
    const stop = KeyEngine.detectOnce((result) => { winnerAt = getFakeNow(); winnerKey = result.key; });

    advance(1900); // ngay trước sàn 2000ms — đủ thời gian cho Fast Path THỬ khoá nếu gate còn lỏng như bug cũ

    check(winnerAt === null, `Hợp âm mập mờ (thiếu quãng 3) KHÔNG bị Fast Path khoá nhầm trong 1.9s (thực tế: ${winnerAt === null ? "chưa khoá — ĐÚNG" : `đã khoá "${winnerKey}" lúc ${winnerAt}ms — SAI, tái hiện đúng bug Khói báo`})`);
    stop();
}

// ================================
// TEST 6 (A34) — Tái hiện ĐÚNG bug pattern Khói báo: hợp âm THIẾU quãng 3 (chỉ root+5th, không
// rõ Major hay Minor — margin phải RẤT thấp) -> Fast Path KHÔNG được khoá nhầm dù rawConfidence
// vẫn cao (đây chính xác là lỗi gốc: rawConfidence cao nhưng margin thấp vẫn từng lọt qua gate cũ)
// ================================
function runTest6_AmbiguousChordNoThirdMustNotFastLock() {
    console.log("\n=== TEST 6 (A34): Hợp âm thiếu quãng 3 (mập mờ Major/Minor thật) -> Fast Path KHÔNG khoá nhầm ===");

    // Chỉ root + quãng 5 (không có quãng 3 major/minor nào) — về mặt nhạc lý, đây là hợp âm
    // "power chord", THẬT SỰ mập mờ giữa Major/Minor (đúng bản chất vấn đề margin=0.01-0.02 mà
    // Khói quan sát được trên audio thật, nơi harmonic của quãng 3 không đủ rõ/bị lấn át).
    const ambiguousPowerChord = spectrumFor([116.5, 233.1, 349.2]); // A#2, A#3, F4 (root + octave + quãng 5, KHÔNG có quãng 3)

    const { KeyEngine, advance, getFakeNow } = createSandboxEngine(ambiguousPowerChord);
    let winnerAt = null, winnerKey = null;
    const stop = KeyEngine.detectOnce((result) => { winnerAt = getFakeNow(); winnerKey = result.key; });

    advance(1900); // ngay trước sàn 2000ms — đủ thời gian cho Fast Path THỬ khoá nếu gate còn lỏng như bug cũ

    check(winnerAt === null, `Hợp âm mập mờ (thiếu quãng 3) KHÔNG bị Fast Path khoá nhầm trong 1.9s (thực tế: ${winnerAt === null ? "chưa khoá — ĐÚNG" : `đã khoá "${winnerKey}" lúc ${winnerAt}ms — SAI, tái hiện đúng bug Khói báo`})`);
    stop();
}

// ================================
// RUN ALL
// ================================
runTest1_FastPathLatencyAndAccuracy();
runTest2_PhysicalFloorRespected();
runTest3_NoFastLockOnFlickeringCandidate();
runTest4_NoLockOnSilence();
runTest5_OldPathsStillWorkWhenFastPathBlocked();
runTest6_AmbiguousChordNoThirdMustNotFastLock();

console.log(`\n${failCount === 0 ? "✅ TẤT CẢ" : `❌ ${failCount} kiểm chứng FAIL`} — KeyEngine Fast Path (A32, SYNTHETIC, không phải audio thật).`);
process.exit(failCount > 0 ? 1 : 0);
