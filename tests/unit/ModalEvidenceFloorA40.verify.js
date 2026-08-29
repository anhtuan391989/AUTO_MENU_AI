/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng A40 (Modal Evidence Floor)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/ModalEvidenceFloorA40.verify.js
 *
 * SYNTHETIC TEST — sandbox Node (vm), giống hệt phương pháp KeyEngineAccuracyA35.verify.js.
 *
 * Bối cảnh: A38 chứng minh computeModalEvidence() (tại ui/js/engines/keyEngine.js) là công thức
 * TỶ LỆ không có sàn năng lượng tuyệt đối — rò rỉ harmonic cực nhỏ (~1.7e-4, nhỏ hơn root/fifth
 * ~2000-3000 lần) vẫn cho modalConfidence=1.0 (tối đa), khiến Fast Path khoá sai Major/Minor cho
 * power chord (root+fifth, không có quãng 3). A39 benchmark 300 mẫu (12 root) xác nhận khoảng
 * floor an toàn [0.02, 0.15]. A40 đưa MODAL_EVIDENCE_FLOOR=0.05 vào production.
 *
 * File này kiểm chứng TRỰC TIẾP hiệu quả của floor đó bằng cách chạy keyEngine.js THẬT (không
 * mock), đúng nguyên văn case Test B gốc (A37/A38) + case Major/Minor rõ (đảm bảo true-positive
 * không bị mất) + quét nhanh vài root khác (không chỉ A#, đúng tinh thần "không lấy A# làm đại
 * diện" của A39).
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
        (extraFreqs || []).forEach((f) => addTone(f, -6));
        return arr;
    };
}
function noteFreq(pc, octave) { return 16.35160 * Math.pow(2, octave + pc / 12); }
const PC = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };

console.log("=== TEST 1: Power chord A# (ĐÚNG NGUYÊN VĂN Test B/A37/A38) — KHÔNG được khoá qua bất kỳ đường nào trong 16s ===");
{
    const powerChord = chordSpectrum([116.5, 233.1, 349.2]); // A#2, A#3, F4 — root+octave+fifth, KHÔNG quãng 3
    const { KeyEngine, advance } = createSandboxEngine(powerChord);
    let locked = false, lockedKey = null, lockedAt = null;
    KeyEngine.detectOnce((result) => { locked = true; lockedKey = result.key; lockedAt = 0; });
    advance(16000);
    check(!locked, `Power chord A# (không quãng 3) KHÔNG bị khoá dù đã chờ 16s (thực tế: ${locked ? "đã khoá " + lockedKey : "chưa khoá — ĐÚNG"})`);
}

console.log("\n=== TEST 2: Major/Minor RÕ vẫn phải khoá đúng & nhanh (true-positive không bị mất bởi floor) — quét 3 root khác nhau ===");
{
    const roots = [
        { name: "C", pc: PC["C"] },
        { name: "F#", pc: PC["F#"] },
        { name: "A#", pc: PC["A#"] },
    ];
    roots.forEach(({ name, pc }) => {
        const rootHz = noteFreq(pc, 2);
        const fifthHz = rootHz * 3;
        const majThirdHz = noteFreq((pc + 4) % 12, 4);
        const minThirdHz = noteFreq((pc + 3) % 12, 4);

        const majorChord = chordSpectrum([rootHz, majThirdHz, fifthHz]);
        const { KeyEngine: KE1, advance: adv1 } = createSandboxEngine(majorChord);
        let majorLocked = null;
        KE1.detectOnce((r) => { majorLocked = r.key; });
        adv1(4000);
        check(majorLocked && majorLocked.includes("Major"), `${name} Major rõ khoá ĐÚNG "Major" trong <4s (thực tế: ${majorLocked || "chưa khoá"})`);

        const minorChord = chordSpectrum([rootHz, minThirdHz, fifthHz]);
        const { KeyEngine: KE2, advance: adv2 } = createSandboxEngine(minorChord);
        let minorLocked = null;
        KE2.detectOnce((r) => { minorLocked = r.key; });
        adv2(4000);
        check(minorLocked && minorLocked.includes("Minor"), `${name} Minor rõ khoá ĐÚNG "Minor" trong <4s (thực tế: ${minorLocked || "chưa khoá"})`);
    });
}

console.log("\n=== TEST 3: Power chord ở TOÀN BỘ 12 root cũng không được khoá sai (không chỉ A# mới an toàn) ===");
{
    const ALL_NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    ALL_NOTES.forEach((name, pc) => {
        const rootHz = noteFreq(pc, 2);
        const fifthHz = rootHz * 3;
        const powerChord = chordSpectrum([rootHz, fifthHz]);
        const { KeyEngine, advance } = createSandboxEngine(powerChord);
        let locked = false, lockedKey = null;
        KeyEngine.detectOnce((r) => { locked = true; lockedKey = r.key; });
        advance(16000);
        check(!locked, `Power chord root=${name} (không quãng 3) KHÔNG bị khoá trong 16s (thực tế: ${locked ? "đã khoá " + lockedKey : "chưa khoá — ĐÚNG"})`);
    });
}

console.log("\n=== TEST 4: Major/Minor RÕ ở TOÀN BỘ 12 root vẫn phải khoá đúng (true-positive đầy đủ, không chỉ mẫu) ===");
{
    const ALL_NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    ALL_NOTES.forEach((name, pc) => {
        const rootHz = noteFreq(pc, 2);
        const fifthHz = rootHz * 3;
        const majThirdHz = noteFreq((pc + 4) % 12, 4);
        const minThirdHz = noteFreq((pc + 3) % 12, 4);

        const majorChord = chordSpectrum([rootHz, majThirdHz, fifthHz]);
        const { KeyEngine: KEm, advance: advm } = createSandboxEngine(majorChord);
        let majLocked = null;
        KEm.detectOnce((r) => { majLocked = r.key; });
        advm(4000);
        check(majLocked && majLocked.includes("Major"), `${name} Major rõ khoá ĐÚNG (thực tế: ${majLocked || "chưa khoá"})`);

        const minorChord = chordSpectrum([rootHz, minThirdHz, fifthHz]);
        const { KeyEngine: KEn, advance: advn } = createSandboxEngine(minorChord);
        let minLocked = null;
        KEn.detectOnce((r) => { minLocked = r.key; });
        advn(4000);
        check(minLocked && minLocked.includes("Minor"), `${name} Minor rõ khoá ĐÚNG (thực tế: ${minLocked || "chưa khoá"})`);
    });
}

console.log("\n========== TỔNG KẾT ==========");
if (failCount === 0) {
    console.log("✅ TẤT CẢ kiểm chứng PASS — MODAL_EVIDENCE_FLOOR (A40) chặn đúng false-positive, giữ đúng true-positive.");
} else {
    console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    process.exitCode = 1;
}
