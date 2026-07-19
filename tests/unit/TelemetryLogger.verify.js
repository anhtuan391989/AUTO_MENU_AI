/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Telemetry Logger (Phase 4A)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/TelemetryLogger.verify.js
 *
 * PHẦN A — TelemetryLogger.js thuần (tạo file/thư mục, JSONL hợp
 *   lệ, không ghi trùng, rotation ở 10MB). Tự dọn file test tạo ra
 *   sau khi xong, không làm bẩn thư mục logs/ thật.
 * PHẦN B — Chạy THẬT keyEngine.js (~16s), giả lập
 *   window.electronAPI.sendTelemetry để bắt trực tiếp record gửi
 *   ra: LOCK đúng 1 lần, TOP1_CHANGED đúng số lần, không đổi thời
 *   điểm khoá (Lock/Vote Window/thời gian chạy không đổi).
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

const LOGS_DIR = path.resolve(__dirname, "../../logs");
const TELEMETRY_LOGGER_PATH = path.resolve(__dirname, "../../core/shared/TelemetryLogger.js");

function freshTelemetryLogger() {
    delete require.cache[TELEMETRY_LOGGER_PATH];
    return require(TELEMETRY_LOGGER_PATH);
}

function filesBefore() {
    if (!fs.existsSync(LOGS_DIR)) return [];
    return fs.readdirSync(LOGS_DIR);
}

// ================================
// PHẦN A — TelemetryLogger.js thuần
// ================================
async function runPartA() {
    console.log("=== PHẦN A: TelemetryLogger.js (tạo file, JSONL hợp lệ, rotation) ===");

    const before = filesBefore();
    const dirExistedBefore = fs.existsSync(LOGS_DIR);

    const TelemetryLogger = freshTelemetryLogger();

    // --- Ghi vài record bình thường ---
    const records = [
        { time: 1.5, top1: "C Major", top2: "A Minor", confidence: 0.8, margin: 0.1, stability: 0.5, top1Stable: 1.5, decisionScore: 0.6, votes: 2, window: 3, locked: false },
        { time: 3.0, top1: "C Major", top2: "A Minor", confidence: 0.9, margin: 0.2, stability: 0.7, top1Stable: 3.0, decisionScore: 0.7, votes: 4, window: 5, locked: false },
        { event: "LOCK", time: 9.0, key: "D Minor", decisionScore: 0.91 },
        { event: "TOP1_CHANGED", from: "C Major", to: "A Minor", time: 10.5 }
    ];
    for (const r of records) TelemetryLogger.write(r);

    const filePath = TelemetryLogger.getCurrentFilePath();
    check(!!filePath && fs.existsSync(filePath), "File log được tạo thành công");
    check(fs.existsSync(LOGS_DIR), "Thư mục logs/ tồn tại (tự tạo nếu chưa có)");
    check(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_\d+)?\.jsonl$/.test(path.basename(filePath)), `Tên file đúng định dạng timestamp .jsonl (thực tế: ${path.basename(filePath)})`);

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    check(lines.length === records.length, `Số dòng ghi khớp số record đã gửi (${lines.length}/${records.length})`);

    let allValidJson = true;
    const parsed = [];
    for (const line of lines) {
        try { parsed.push(JSON.parse(line)); } catch { allValidJson = false; }
    }
    check(allValidJson, "MỌI dòng đều là JSON hợp lệ (JSON Lines)");

    check(parsed.some((r) => r.event === "LOCK"), "Có record LOCK");
    check(parsed.filter((r) => r.event === "LOCK").length === 1, "LOCK xuất hiện đúng 1 lần trong số record đã ghi");
    check(parsed.some((r) => r.event === "TOP1_CHANGED"), "Có record TOP1_CHANGED");

    // --- Không ghi trùng: ghi 2 record giống hệt nhau -> vẫn ra 2 dòng riêng biệt (không tự dedup ẩn) và không dòng nào bị nhân đôi ngoài ý muốn ---
    const dupRecord = { time: 20.0, top1: "G Major", top2: "D Major", confidence: 0.77, margin: 0.15, stability: 0.6, top1Stable: 2.0, decisionScore: 0.65, votes: 3, window: 4, locked: false };
    TelemetryLogger.write(dupRecord);
    TelemetryLogger.write(dupRecord);
    const contentAfterDup = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    const dupCount = contentAfterDup.filter((l) => l === JSON.stringify(dupRecord)).length;
    check(dupCount === 2, `Ghi 2 record giống hệt -> đúng 2 dòng trong file (không mất, không tự nhân thêm), thực tế: ${dupCount}`);

    // --- Rotation ở 10MB: ghi các record LỚN cho tới khi vượt ngưỡng, xác nhận có file mới xuất hiện ---
    console.log("  (đang test rotation 10MB — có thể mất vài giây)");
    const bigPadding = "x".repeat(900 * 1024); // ~900KB mỗi record
    const filesSeenDuringRotation = new Set([TelemetryLogger.getCurrentFilePath()]);
    for (let i = 0; i < 13; i++) { // 13 * ~900KB ≈ 11.7MB > 10MB
        TelemetryLogger.write({ time: i, pad: bigPadding });
        filesSeenDuringRotation.add(TelemetryLogger.getCurrentFilePath());
    }
    check(filesSeenDuringRotation.size >= 2, `Rotation: có ít nhất 2 file khác nhau sau khi vượt 10MB, thực tế: ${filesSeenDuringRotation.size} file`);

    // --- Dọn dẹp: xoá toàn bộ file test vừa tạo, không làm bẩn logs/ thật ---
    const after = filesBefore();
    const newFiles = after.filter((f) => !before.includes(f));
    for (const f of newFiles) {
        try { fs.unlinkSync(path.join(LOGS_DIR, f)); } catch {}
    }
    if (!dirExistedBefore && fs.readdirSync(LOGS_DIR).length === 0) {
        try { fs.rmdirSync(LOGS_DIR); } catch {}
    }
    console.log(`  (đã dọn ${newFiles.length} file test khỏi logs/)`);
}

// ================================
// PHẦN B — Chạy THẬT keyEngine.js, bắt trực tiếp sendTelemetry()
// ================================
async function runPartB() {
    console.log("\n=== PHẦN B: Chạy thật keyEngine.js (~16s), bắt trực tiếp telemetry ===");

    const keyEngineSource = fs.readFileSync(
        path.resolve(__dirname, "../../ui/js/engines/keyEngine.js"),
        "utf-8"
    );

    const telemetryRecords = [];
    const logLines = [];

    const sandbox = {
        window: {
            electronAPI: {
                sendTelemetry: (record) => telemetryRecords.push(record)
            }
        },
        Float32Array, Math, Array, JSON,
        console: { log: (msg) => logLines.push(String(msg)) },
        setInterval, clearInterval, Date,
        requestAnimationFrame: (cb) => setTimeout(cb, 16),
        cancelAnimationFrame: (id) => clearTimeout(id)
    };
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });

    const KeyEngine = sandbox.window.KeyEngine;

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

    KeyEngine.init({ sampleRate: 48000, createAnalyser: makeFakeAnalyser }, { connect: () => {} });

    let onWinnerResult = null, onWinnerElapsedMs = null;
    const startedAt = Date.now();
    await new Promise((resolve) => {
        KeyEngine.detectOnce((result) => { onWinnerResult = result; onWinnerElapsedMs = Date.now() - startedAt; resolve(); });
        setTimeout(resolve, 20000);
    });

    console.log(`  (thu được ${telemetryRecords.length} telemetry record)`);

    const normalRecords = telemetryRecords.filter((r) => !r.event);
    const lockRecords = telemetryRecords.filter((r) => r.event === "LOCK");
    const top1ChangedRecords = telemetryRecords.filter((r) => r.event === "TOP1_CHANGED");

    check(normalRecords.length > 0, "Có record thường (không event) được gửi mỗi tick");
    check(normalRecords.every((r) => "time" in r && "top1" in r && "confidence" in r && "margin" in r && "stability" in r && "top1Stable" in r && "decisionScore" in r && "votes" in r && "window" in r && "locked" in r),
        "Record thường có đủ field theo đúng cấu trúc yêu cầu");
    check(normalRecords.every((r) => !("fft" in r) && !("chroma" in r) && !("spectrum" in r) && !("buffer" in r)),
        "Record thường KHÔNG chứa FFT/chroma/spectrum/audio buffer thô");

    check(lockRecords.length === 1, `LOCK xuất hiện đúng 1 lần (thực tế: ${lockRecords.length})`);
    console.log(`  TOP1_CHANGED: ${top1ChangedRecords.length} lần (với phổ ổn định suốt phiên, kỳ vọng 0)`);
    check(top1ChangedRecords.length === 0, `Case phổ ổn định: TOP1_CHANGED = 0 lần đúng như kỳ vọng (thực tế: ${top1ChangedRecords.length})`);

    // Không ghi trùng: không có 2 record thường JSON.stringify giống hệt nhau liên tiếp
    let consecutiveDupes = 0;
    for (let i = 1; i < normalRecords.length; i++) {
        if (JSON.stringify(normalRecords[i]) === JSON.stringify(normalRecords[i - 1])) consecutiveDupes++;
    }
    check(consecutiveDupes === 0, `Không có record thường trùng lặp liên tiếp (thực tế: ${consecutiveDupes} cặp trùng)`);

    // Không đổi Lock / thời gian chạy
    check(!!onWinnerResult, "KeyEngine vẫn khoá được sau khi thêm Telemetry");
    check(onWinnerElapsedMs >= 15000 && onWinnerElapsedMs < 16600, `Vẫn khoá trong khoảng [15000, 16600)ms như các Phase trước (KHÔNG đổi thời gian chạy), thực tế: ${onWinnerElapsedMs}ms`);

    if (lockRecords.length > 0) {
        check(lockRecords[0].key === onWinnerResult.key, "Key trong record LOCK khớp đúng key thật của onWinner()");
        check(Math.abs(lockRecords[0].time * 1000 - onWinnerElapsedMs) < 1600, "Thời điểm record LOCK khớp thời điểm onWinner() thật (Lock không đổi)");
    }
}

async function main() {
    await runPartA();
    await runPartB();

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — Telemetry Logger chỉ ghi dữ liệu, không đổi hành vi Key Engine.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}

main();
