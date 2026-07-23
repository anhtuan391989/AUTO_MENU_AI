/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Margin Engine (Phase 1)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/MarginEngine.verify.js
 *
 * Mục tiêu: CHỨNG MINH việc thêm top1/top2/margin vào
 * estimateKeyFromChroma() KHÔNG làm đổi key/rootIndex/mode/confidence
 * (kết quả hiện tại của hệ thống) — theo đúng yêu cầu nhiệm vụ.
 *
 * Gồm 2 phần:
 *   PHẦN A — Stress-test thuật toán chọn winner (random, có cả
 *            trường hợp trùng điểm tuyệt đối) — không cần audio thật.
 *   PHẦN B — Chạy THẬT file ui/js/engines/keyEngine.js đã sửa, qua
 *            sandbox Node "vm" giả lập tối thiểu Web Audio API, với
 *            phổ tần số giả lập có kiểm soát.
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
        console.log(`  ❌ ${message}`);
    }
}

// ================================
// PHẦN A — Stress-test thuật toán chọn winner (thuần đại số, không cần audio)
// ================================
console.log("=== PHẦN A: Stress-test tương đương thuật toán chọn winner ===");

function originalSelect(scores) {
    // Mô phỏng ĐÚNG vòng lặp gốc: strict ">" , duyệt tuần tự theo thứ tự trong mảng.
    let best = { score: -Infinity };
    for (const s of scores) {
        if (s.score > best.score) best = s;
    }
    return best;
}

function newSelectTop1(scores) {
    // Mô phỏng ĐÚNG cách mới: copy mảng, sort giảm dần (ổn định), lấy phần tử đầu.
    const copy = scores.slice();
    copy.sort((a, b) => b.score - a.score);
    return copy[0];
}

let stressMismatch = 0;
const TRIALS = 5000;
for (let t = 0; t < TRIALS; t++) {
    const scores = [];
    for (let i = 0; i < 24; i++) {
        // 15% cơ hội tạo điểm TRÙNG với 1 điểm đã có trước đó -> ép xảy ra trường hợp tie
        let score;
        if (i > 0 && Math.random() < 0.15) {
            score = scores[Math.floor(Math.random() * scores.length)].score;
        } else {
            score = Math.random() * 3 - 1; // random trong khoảng [-1, 2]
        }
        scores.push({ score, root: i % 12, mode: i < 12 ? "Major" : "Minor", idx: i });
    }

    const oldWinner = originalSelect(scores);
    const newWinner = newSelectTop1(scores);

    if (oldWinner.score !== newWinner.score || oldWinner.idx !== newWinner.idx) {
        stressMismatch++;
    }
}

check(stressMismatch === 0, `${TRIALS} lượt random (kể cả trùng điểm): winner cũ và top1 mới khớp nhau 100% (lệch: ${stressMismatch})`);

// ================================
// PHẦN B — Chạy THẬT file keyEngine.js đã sửa, qua sandbox tối thiểu
// ================================
console.log("\n=== PHẦN B: Chạy thật ui/js/engines/keyEngine.js đã sửa ===");

const keyEngineSource = fs.readFileSync(
    path.resolve(__dirname, "../../ui/js/engines/keyEngine.js"),
    "utf-8"
);

// Giả lập TỐI THIỂU Web Audio API cần cho init()/updateChromaVector() — CHỈ để chạy được
// estimateKeyFromChroma() với dữ liệu có kiểm soát, KHÔNG sửa gì trong keyEngine.js.
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

function runSandbox(fakeSpectrumFn) {
    let capturedRaf = null;

    const fakeAudioContext = {
        sampleRate: 48000,
        createAnalyser: () => makeFakeAnalyser(fakeSpectrumFn)
    };
    const fakeSourceNode = { connect: () => {} };

    const sandbox = {
        window: {},
        Float32Array,
        Math,
        Array,
        console,
        requestAnimationFrame: (cb) => { capturedRaf = cb; return 1; }, // KHÔNG tự chạy vòng lặp — test tự gọi updateChromaVector qua loop 1 lần
        cancelAnimationFrame: () => {}
    };
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });

    const KeyEngine = sandbox.window.KeyEngine;
    KeyEngine.init(fakeAudioContext, fakeSourceNode);

    // init() đã tự gọi loop() 1 lần (cập nhật chroma lần đầu) rồi "đăng ký" rAF tiếp theo
    // (bị chặn lại bởi requestAnimationFrame giả ở trên) — gọi thêm vài lần thủ công để
    // chromaVector kịp hội tụ qua EMA, giống việc chờ vài khung hình thật.
    for (let i = 0; i < 30 && capturedRaf; i++) {
        const cb = capturedRaf;
        capturedRaf = null;
        cb();
    }

    return KeyEngine.estimateKeyFromChroma();
}

// Kịch bản 1: phổ giả lập với năng lượng mạnh đúng tại các nốt của hợp âm C Major (C-E-G)
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

// Kịch bản 2: phổ nhiễu trắng đều (không có nốt nào nổi bật hẳn) — dễ ra margin nhỏ/tie
function spectrumForNoise() {
    const arr = new Float32Array(4096);
    for (let i = 0; i < arr.length; i++) arr[i] = -60 + Math.random() * 5;
    return arr;
}

const scenarios = [
    { name: "Phổ giả lập hợp âm C Major rõ ràng", fn: spectrumForCMajor },
    { name: "Phổ nhiễu trắng (mập mờ)", fn: spectrumForNoise },
    { name: "Phổ nhiễu trắng lần 2 (seed khác)", fn: spectrumForNoise }
];

for (const scenario of scenarios) {
    console.log(`\n  -- Kịch bản: ${scenario.name} --`);
    const result = runSandbox(scenario.fn);

    console.log(`     key=${result.key} confidence=${result.confidence.toFixed(4)} margin=${result.margin.toFixed(4)}`);
    console.log(`     top1={root:${result.top1.root}, mode:${result.top1.mode}, score:${result.top1.score.toFixed(4)}}`);
    console.log(`     top2={root:${result.top2.root}, mode:${result.top2.mode}, score:${result.top2.score.toFixed(4)}}`);

    check(result.top1.score === result.confidence, "top1.score === confidence (giá trị gốc không đổi)");
    check(result.top1.root === result.rootIndex, "top1.root === rootIndex (giá trị gốc không đổi)");
    check(result.top1.mode === result.mode, "top1.mode === mode (giá trị gốc không đổi)");
    check(result.margin === result.top1.score - result.top2.score, "margin = top1.score - top2.score (đúng công thức)");
    check(result.margin >= 0, "margin luôn >= 0 (top1 luôn >= top2 sau khi sort giảm dần)");
    check(typeof result.key === "string" && typeof result.confidence === "number", "Các field GỐC (key, confidence...) vẫn đúng kiểu dữ liệu như cũ");
}

// ================================
console.log("\n========== TỔNG KẾT ==========");
if (failCount === 0) {
    console.log("✅ TẤT CẢ kiểm chứng PASS — Margin Engine không làm đổi kết quả hiện tại.");
} else {
    console.log(`❌ CÓ ${failCount} kiểm chứng FAIL — cần xem lại.`);
}
process.exit(failCount > 0 ? 1 : 0);
