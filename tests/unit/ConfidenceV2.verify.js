/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Confidence V2 (Phase 3)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/ConfidenceV2.verify.js
 *
 * PHẦN A — Đúng công thức, dùng CHÍNH ví dụ số liệu trong yêu cầu:
 *   pearson=1.25, margin=0.06, stability=1.00, bassAgreement=0.81
 *   -> pearsonNorm=0.83, marginNorm=0.12, stabilityNorm=1.00,
 *      bassNorm=0.81, combined=0.69, ambiguity=0.88
 * PHẦN B — Chạy THẬT keyEngine.js (thời gian thực ~16s):
 *   - `confidence` gốc (top-level) không đổi giá trị.
 *   - object trả về cho onWinner() KHÔNG chứa confidenceV2 (chứng
 *     minh confidenceV2 chỉ tồn tại để log, không rò rỉ vào luồng
 *     dữ liệu thật).
 *   - Lock vẫn khoá đúng thời điểm/điều kiện như Phase 1.5/2.
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

// ================================
// PHẦN A — Đúng công thức, dùng lại chính công thức đã công bố trong code (buildConfidenceV2
// là hàm private trong IIFE, không expose ra ngoài -> tái hiện NGUYÊN VĂN công thức để kiểm
// tra độc lập bằng đúng số liệu ví dụ trong yêu cầu).
// ================================
console.log("=== PHẦN A: Đúng công thức (dùng đúng số liệu ví dụ trong yêu cầu) ===");

const BASS_ROOT_BOOST_WEIGHT = 0.5;
const PEARSON_NORM_MAX = 1 + BASS_ROOT_BOOST_WEIGHT;
const MARGIN_NORM_RANGE = 0.5;
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function buildConfidenceV2(pearson, margin, stability, bassAgreement) {
    const pearsonNorm = clamp01(pearson / PEARSON_NORM_MAX);
    const marginNorm = clamp01(margin / MARGIN_NORM_RANGE);
    const stabilityNorm = clamp01(stability);
    const bassNorm = clamp01(bassAgreement);
    const combined = (pearsonNorm + marginNorm + stabilityNorm + bassNorm) / 4;
    const ambiguity = 1 - marginNorm;
    return { pearson, pearsonNorm, margin, marginNorm, stability, stabilityNorm, bassAgreement, bassNorm, combined, ambiguity };
}

const example = buildConfidenceV2(1.25, 0.06, 1.00, 0.81);
console.log("  Kết quả:", JSON.stringify(example));

check(Math.abs(example.pearsonNorm - 0.83) < 0.005, `pearsonNorm ≈ 0.83 (thực tế: ${example.pearsonNorm.toFixed(4)})`);
check(Math.abs(example.marginNorm - 0.12) < 0.005, `marginNorm ≈ 0.12 (thực tế: ${example.marginNorm.toFixed(4)})`);
check(example.stabilityNorm === 1.00, `stabilityNorm = 1.00 (thực tế: ${example.stabilityNorm})`);
check(example.bassNorm === 0.81, `bassNorm = 0.81 (thực tế: ${example.bassNorm})`);
check(Math.abs(example.combined - 0.69) < 0.005, `combined ≈ 0.69 (thực tế: ${example.combined.toFixed(4)})`);
check(Math.abs(example.ambiguity - 0.88) < 0.005, `ambiguity ≈ 0.88 (thực tế: ${example.ambiguity.toFixed(4)})`);

// ================================
// PHẦN B — Chạy THẬT keyEngine.js
// ================================
console.log("\n=== PHẦN B: Chạy thật keyEngine.js (thời gian thực ~16s) ===");

const keyEngineSource = fs.readFileSync(
    path.resolve(__dirname, "../../ui/js/engines/keyEngine.js"),
    "utf-8"
);

function makeFakeAnalyser() {
    const arr = new Float32Array(4096).fill(-100);
    const binHz = 48000 / 8192;
    for (const f of [65.4, 130.8, 261.6, 329.6, 392.0, 523.3]) {
        const bin = Math.round(f / binHz);
        if (bin >= 0 && bin < arr.length) arr[bin] = -10;
    }
    return {
        fftSize: 8192, smoothingTimeConstant: 0, frequencyBinCount: 4096,
        getFloatFrequencyData(out) { for (let i = 0; i < out.length; i++) out[i] = arr[i]; }
    };
}

function parseConfidenceV2FromLog(block) {
    const m = block.match(/ConfidenceV2:\s*(\{.*\})/);
    return m ? JSON.parse(m[1]) : null;
}

async function runPartB() {
    const logLines = [];
    const sandbox = {
        window: {}, Float32Array, Math, Array, JSON,
        console: { log: (msg) => logLines.push(String(msg)) },
        setInterval, clearInterval, Date,
        requestAnimationFrame: (cb) => setTimeout(cb, 16),
        cancelAnimationFrame: (id) => clearTimeout(id)
    };
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });

    const KeyEngine = sandbox.window.KeyEngine;
    KeyEngine.init({ sampleRate: 48000, createAnalyser: makeFakeAnalyser }, { connect: () => {} });

    let onWinnerResult = null;
    let onWinnerElapsedMs = null;
    const startedAt = Date.now();

    await new Promise((resolve) => {
        KeyEngine.detectOnce((result) => {
            onWinnerResult = result;
            onWinnerElapsedMs = Date.now() - startedAt;
            resolve();
        });
        setTimeout(resolve, 20000);
    });

    check(!!onWinnerResult, "KeyEngine vẫn khoá được (onWinner được gọi) sau khi thêm Confidence V2");

    if (onWinnerResult) {
        check(typeof onWinnerResult.confidence === "number", "Object trả cho onWinner() vẫn có field `confidence` gốc, đúng kiểu số");
        check(onWinnerResult.confidenceV2 === undefined, "Object trả cho onWinner() KHÔNG chứa confidenceV2 — chứng minh không rò rỉ vào luồng dữ liệu thật, đúng yêu cầu 'chỉ dùng để log'");
        check(onWinnerElapsedMs >= 15000, `Vẫn khoá sau >= 15000ms (đúng MIN_ELAPSED_BEFORE_LOCK_MS gốc, KHÔNG đổi), thực tế: ${onWinnerElapsedMs}ms`);
    }

    const confidenceV2Blocks = logLines
        .filter((b) => b.startsWith("[KeyEngine]") && b.includes("ConfidenceV2:"))
        .map(parseConfidenceV2FromLog)
        .filter(Boolean);

    check(confidenceV2Blocks.length > 0, `Có ít nhất 1 dòng log chứa ConfidenceV2 hợp lệ (JSON parse được), thực tế: ${confidenceV2Blocks.length}`);

    const requiredFields = ["pearson", "pearsonNorm", "margin", "marginNorm", "stability", "stabilityNorm", "bassAgreement", "bassNorm", "combined", "ambiguity"];
    const lastBlock = confidenceV2Blocks[confidenceV2Blocks.length - 1];
    if (lastBlock) {
        console.log("  ConfidenceV2 (lúc khoá):", JSON.stringify(lastBlock));
        for (const field of requiredFields) {
            check(field in lastBlock, `ConfidenceV2 có đủ field "${field}"`);
        }
        check(lastBlock.pearsonNorm >= 0 && lastBlock.pearsonNorm <= 1, "pearsonNorm nằm trong [0,1]");
        check(lastBlock.marginNorm >= 0 && lastBlock.marginNorm <= 1, "marginNorm nằm trong [0,1]");
        check(lastBlock.combined >= 0 && lastBlock.combined <= 1, "combined nằm trong [0,1]");
        check(Math.abs(lastBlock.combined - (lastBlock.pearsonNorm + lastBlock.marginNorm + lastBlock.stabilityNorm + lastBlock.bassNorm) / 4) < 1e-9,
            "combined = trung bình cộng đúng 4 thành phần đã chuẩn hoá (khớp dữ liệu thật, không chỉ khớp ví dụ)");
    }
}

runPartB().then(() => {
    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — Confidence V2 đúng công thức, chỉ dùng để log, không đổi hành vi Key Engine.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
});
