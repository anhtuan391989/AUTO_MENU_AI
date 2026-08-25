/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng A35 (Key Accuracy / Harmonic Decision)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/KeyEngineAccuracyA35.verify.js
 *
 * SYNTHETIC TEST — sandbox Node (vm), KHÔNG phải audio thật. A35 tự quy định "chưa được coi
 * hoàn thành chỉ vì synthetic PASS, phải có audio thật của Khói" — file này CHỈ chứng minh
 * LOGIC của 2 fix (BASS_VOTE_DECAY, vote-window sanity floor) đúng theo thiết kế, KHÔNG thay
 * thế yêu cầu test audio thật.
 *
 *   TEST A — Stable single-key audio: không đổi Key liên tục khi tín hiệu ổn định thật.
 *   TEST B — Major/Minor ambiguity: hợp âm thiếu quãng 3 không bị khoá (tái dùng nguyên lý
 *            TEST 6 của A34, mở rộng sang cả đường vote-window/adaptive, không chỉ Fast Path).
 *   TEST C — Bass-heavy beat: bass mạnh (808 giả lập) rồi TẮT, chord thật ở root khác — sau khi
 *            bass tắt đủ lâu, root cuối cùng phải phản ánh đúng chord, KHÔNG bị bass cũ kéo lệch
 *            (verify trực tiếp fix BASS_VOTE_DECAY).
 *   TEST E — End-section modulation vs false candidate: đổi Key THẬT (sustained, đủ margin) so
 *            với đổi Key THOÁNG QUA (1-2 frame rồi quay lại) — chỉ trường hợp đầu được coi là
 *            đổi Key thật.
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

const HARMONIC_AMP = [1.0, 0.60, 0.42, 0.30, 0.20, 0.15, 0.10, 0.07];

function makeFakeAnalyser(fakeSpectrumFn) {
    return {
        fftSize: 8192, smoothingTimeConstant: 0, frequencyBinCount: 4096,
        getFloatFrequencyData(arr) {
            const spectrum = fakeSpectrumFn();
            for (let i = 0; i < arr.length; i++) arr[i] = spectrum[i] ?? -120;
        }
    };
}

function createSandboxEngine(fakeSpectrumFn) {
    let capturedRaf = null, capturedIntervals = [], fakeNow = 0, intervalIdSeq = 0;
    const fakeAudioContext = { sampleRate: 48000, createAnalyser: () => makeFakeAnalyser(fakeSpectrumFn) };
    const fakeSourceNode = { connect: () => {} };
    const sandbox = {
        window: {}, Float32Array, Math, Array, Date: { now: () => fakeNow }, console: { log: () => {} },
        requestAnimationFrame: (cb) => { capturedRaf = cb; return 1; }, cancelAnimationFrame: () => {},
        setInterval: (cb, ms) => { const id = ++intervalIdSeq; capturedIntervals.push({ id, cb, ms }); return id; },
        clearInterval: (id) => { capturedIntervals = capturedIntervals.filter((e) => e.id !== id); }
    };
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });
    const KeyEngine = sandbox.window.KeyEngine;
    KeyEngine.init(fakeAudioContext, fakeSourceNode);
    function stepFrame() { if (capturedRaf) { const cb = capturedRaf; capturedRaf = null; cb(); } }
    const elapsedSinceRegister = new Map();
    function advance(ms) {
        let remaining = ms;
        while (remaining > 0) {
            const dt = Math.min(10, remaining);
            fakeNow += dt; remaining -= dt; stepFrame();
            capturedIntervals.forEach((entry) => {
                const acc = (elapsedSinceRegister.get(entry.id) || 0) + dt;
                if (acc >= entry.ms) { elapsedSinceRegister.set(entry.id, acc - entry.ms); entry.cb(); }
                else elapsedSinceRegister.set(entry.id, acc);
            });
        }
    }
    return { KeyEngine, stepFrame, advance, getFakeNow: () => fakeNow };
}

// Hợp âm ĐẦY ĐỦ (root+3rd+5th), có harmonic tự nhiên — đại diện tín hiệu nhạc cụ/giọng hát thật rõ ràng.
function chordSpectrum(freqs, extraFreqs) {
    return () => {
        const arr = new Float32Array(4096).fill(-100);
        const binHz = 48000 / 8192;
        const addTone = (f, baseDb) => {
            for (let h = 0; h < HARMONIC_AMP.length; h++) {
                const bin = Math.round((f * (h + 1)) / binHz);
                if (bin >= 0 && bin < arr.length) {
                    const db = baseDb + 20 * Math.log10(HARMONIC_AMP[h]);
                    arr[bin] = Math.max(arr[bin], db);
                }
            }
        };
        freqs.forEach((f) => addTone(f, -10));
        (extraFreqs || []).forEach((f) => addTone(f, -6)); // bass louder hơn chord chính, giống 808 thật
        return arr;
    };
}

const CHORDS = {
    // Voicing THỰC TẾ: root 1 quãng 8 THẤP (bass, <260Hz — vai trò bass guitar/kick), 3rd+5th ở
    // tầm trung/cao (>260Hz — vai trò guitar/piano/pad) — giống cách phối khí nhạc thật, tránh
    // toàn bộ hợp âm dồn vào dải bass (dễ làm bass-vote cạnh tranh lẫn nhau giữa root/3rd/5th,
    // không phản ánh đúng tình huống thật mà TEST C/E cần kiểm tra).
    "D Minor": [73.4, 146.8, 349.2, 440.0, 587.3],       // D2(bass) + D3,F4,A4,D5 (hoà âm trên)
    "D# Minor": [77.8, 155.6, 370.0, 466.2, 622.3],      // D#2(bass) + D#3,F#4,A#4,D#5
    "A Minor": [55.0, 110.0, 261.6, 329.6, 440.0],       // A1(bass) + A2,C4,E4,A4
};

// ================================
// TEST A — Stable single-key audio: KHÔNG đổi Key liên tục
// ================================
function runTestA() {
    console.log("\n=== TEST A: Tín hiệu ổn định (D Minor suốt phiên) -> không đổi Key liên tục ===");
    const { KeyEngine, advance } = createSandboxEngine(chordSpectrum(CHORDS["D Minor"]));
    const seen = [];
    KeyEngine.watchContinuous((result) => { seen.push(result.key); });
    advance(20000);
    const uniqueKeys = [...new Set(seen)];
    check(uniqueKeys.length <= 1, `Chỉ báo TỐI ĐA 1 Key duy nhất trong suốt 20s tín hiệu ổn định (thực tế: ${JSON.stringify(uniqueKeys)})`);
    if (uniqueKeys.length === 1) {
        check(uniqueKeys[0] === "D Minor", `Key đúng D Minor (thực tế: ${uniqueKeys[0]})`);
    }
}

// ================================
// TEST B — Major/Minor ambiguity: hợp âm thiếu quãng 3 KHÔNG được khoá qua bất kỳ đường nào
// (mở rộng TEST 6 của A34 — kiểm tra CẢ vote-window/adaptive, không chỉ Fast Path)
// ================================
function runTestB() {
    console.log("\n=== TEST B: Hợp âm thiếu quãng 3 (mập mờ Major/Minor thật) -> KHÔNG khoá qua BẤT KỲ đường nào trong 16s ===");
    const powerChord = chordSpectrum([116.5, 233.1, 349.2]); // A#2,A#3,F4 — root+octave+5th, KHÔNG có quãng 3
    const { KeyEngine, advance, getFakeNow } = createSandboxEngine(powerChord);
    let winnerAt = null, winnerKey = null;
    const stop = KeyEngine.detectOnce((result) => { winnerAt = getFakeNow(); winnerKey = result.key; });
    advance(16000); // vượt cả sàn 15s của vote-window — case khó nhất
    check(winnerAt === null, `Hợp âm mập mờ KHÔNG bị khoá dù đã chờ đủ 16s (vượt cả sàn vote-window) (thực tế: ${winnerAt === null ? "chưa khoá — ĐÚNG" : `đã khoá "${winnerKey}" lúc ${winnerAt}ms — SAI`})`);
    stop();
}

// ================================
// TEST C — Bass-heavy beat: bass mạnh (808 giả lập) rồi TẮT, chord thật ở root KHÁC bass — sau
// khi bass tắt đủ lâu (vượt half-life mới ~0.4s nhiều lần), root cuối phải phản ánh đúng chord.
// ================================
function runTestC() {
    console.log("\n=== TEST C: Bass 808 mạnh (root G) rồi tắt, chord thật là D Minor -> root cuối phải là D, KHÔNG bị bass cũ kéo lệch ===");

    let bassOn = true;
    const spec = () => chordSpectrum(CHORDS["D Minor"], bassOn ? [49.0] : [])(); // G1 = 49Hz, bass RẤT mạnh (-6dB) khi bassOn

    const { KeyEngine, advance, getFakeNow } = createSandboxEngine(spec);
    let winnerResult = null, winnerAt = null;

    const stop = KeyEngine.detectOnce((result) => { winnerResult = result; winnerAt = getFakeNow(); });

    advance(2000); // 2s đầu: bass G rất mạnh cùng lúc với chord D Minor thật
    bassOn = false; // bass TẮT (giống 1 nhịp 808 kết thúc)
    advance(3000);  // 3s sau đó KHÔNG còn bass — đủ xa so với half-life mới (~0.4s) để bass-vote cũ tan biến gần hết

    check(winnerResult !== null, `Đã chốt được Key trong 5s (thực tế: ${winnerResult ? "có chốt" : "KHÔNG chốt"})`);
    if (winnerResult) {
        check(winnerResult.key === "D Minor", `Root cuối phản ánh ĐÚNG chord thật (D Minor), KHÔNG bị kéo về G do bass cũ (thực tế: ${winnerResult.key})`);
    }
    stop();
}

// ================================
// TEST E — Đổi Key THẬT (sustained, đủ margin, đủ lâu) so với đổi Key THOÁNG QUA (1-2 frame rồi
// quay lại ngay) — chỉ case đầu được coi là đổi Key thật, case sau KHÔNG được báo đổi.
// ================================
function runTestE_RealModulation() {
    console.log("\n=== TEST E (phần 1 — modulation THẬT): D Minor suốt đầu bài, sau đó ĐỔI THẬT sang D# Minor và GIỮ NGUYÊN ===");
    let t = 0;
    const spec = () => (t < 8000 ? chordSpectrum(CHORDS["D Minor"])() : chordSpectrum(CHORDS["D# Minor"])());
    const { KeyEngine, advance } = createSandboxEngine(() => spec());
    const seen = [];
    KeyEngine.watchContinuous((result) => { seen.push({ t, key: result.key }); });

    const stepMs = 10;
    for (let elapsed = 0; elapsed < 20000; elapsed += stepMs) { t = elapsed; advance(stepMs); }

    check(seen.length === 2, `Đúng 2 lần báo đổi Key trong cả phiên: 1 lần lúc bắt đầu (D Minor), 1 lần khi đổi thật (D# Minor) — watchContinuous có dedup, không lặp lại (thực tế: ${seen.length} lần, ${JSON.stringify(seen)})`);
    if (seen.length >= 2) {
        const last = seen[seen.length - 1];
        check(last.key === "D# Minor", `Lần báo CUỐI CÙNG đúng Key mới D# Minor (thực tế: ${last.key})`);
        check(last.t >= 8000 && last.t <= 12000, `Thời điểm báo đổi hợp lý, gần mốc đổi thật (8000ms) + đủ thời gian xác nhận, không quá trễ (thực tế: ${last.t}ms)`);
    }
}

function runTestE_TransientFlickerNotModulation() {
    console.log("\n=== TEST E (phần 2 — flicker THOÁNG QUA, không phải modulation): D Minor suốt, xen 1 khoảng ngắn ~300ms giống D# Minor rồi QUAY LẠI ngay ===");
    let t = 0;
    const spec = () => (t >= 8000 && t < 8300 ? chordSpectrum(CHORDS["D# Minor"])() : chordSpectrum(CHORDS["D Minor"])());
    const { KeyEngine, advance } = createSandboxEngine(() => spec());
    const seen = [];
    KeyEngine.watchContinuous((result) => { seen.push({ t, key: result.key }); });

    const stepMs = 10;
    for (let elapsed = 0; elapsed < 20000; elapsed += stepMs) { t = elapsed; advance(stepMs); }

    const reportedKeys = seen.map((s) => s.key);
    const everReportedFlickerKey = reportedKeys.includes("D# Minor");
    const finalKey = seen.length > 0 ? seen[seen.length - 1].key : null;

    check(!everReportedFlickerKey, `Flicker THOÁNG QUA (~300ms) KHÔNG đủ bằng chứng để bị báo là đổi Key thật (thực tế: ${everReportedFlickerKey ? "CÓ báo D# Minor — có thể là false positive" : "không báo — ĐÚNG"}, toàn bộ lần báo: ${JSON.stringify(reportedKeys)})`);
    check(finalKey === "D Minor", `Trạng thái CUỐI CÙNG vẫn đúng D Minor, không kẹt ở Key sai (thực tế: ${finalKey})`);
}

// ================================
// RUN ALL
// ================================
runTestA();
runTestB();
runTestC();
runTestE_RealModulation();
runTestE_TransientFlickerNotModulation();

console.log(`\n${failCount === 0 ? "✅ TẤT CẢ" : `❌ ${failCount} kiểm chứng FAIL`} — A35 Key Accuracy (SYNTHETIC — CHƯA thay thế yêu cầu audio thật).`);
console.log("⚠️  TEST D (real audio của Khói) KHÔNG chạy được trong file này — cần audio thật hoặc log đầy đủ hơn.");
process.exit(failCount > 0 ? 1 : 0);
