/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Telemetry Analyzer (Phase 5)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/TelemetryAnalyzer.verify.js
 *
 * Tạo dữ liệu logs/*.jsonl GIẢ LẬP CÓ KIỂM SOÁT (biết trước đáp số),
 * chạy scripts/analyzeTelemetry.js, so khớp kết quả tính được với
 * tính tay. Tự dọn sạch file test (logs/ + reports/) sau khi xong.
 * ==========================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

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
const REPORTS_DIR = path.resolve(__dirname, "../../reports");
const REPORT_FILE = path.join(REPORTS_DIR, "telemetry_report.md");
const ANALYZER_PATH = path.resolve(__dirname, "../../scripts/analyzeTelemetry.js");

function writeTestLogFile(name, records) {
    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
    const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    const fullPath = path.join(LOGS_DIR, name);
    fs.writeFileSync(fullPath, content, "utf-8");
    return fullPath;
}

function normalRecord(time, overrides = {}) {
    return {
        time, top1: "C Major", top2: "A Minor",
        confidence: 0.9, margin: 0.2, stability: 0.8, top1Stable: time,
        decisionScore: 0.75, votes: 4, window: 6, locked: false,
        ...overrides
    };
}

// ================================
// Dựng dữ liệu giả lập CÓ KIỂM SOÁT — biết trước đáp số để so khớp
// ================================
const logsBefore = fs.existsSync(LOGS_DIR) ? fs.readdirSync(LOGS_DIR) : [];
const reportsExistedBefore = fs.existsSync(REPORTS_DIR);

// -- File test 1: session bình thường, khoá lành mạnh, có 1 lần đổi Top1 trước khi khoá --
const session1 = [
    normalRecord(1.5, { margin: 0.3, stability: 0.5, decisionScore: 0.6 }),
    normalRecord(3.0, { margin: 0.25, stability: 0.6, decisionScore: 0.65 }),
    { event: "TOP1_CHANGED", from: "C Major", to: "D Major", time: 4.0 },
    normalRecord(4.5, { top1: "D Major", margin: 0.35, stability: 0.7, decisionScore: 0.8 }),
    normalRecord(15.0, { top1: "D Major", margin: 0.4, stability: 0.9, decisionScore: 0.85, votes: 5, locked: true }),
    { event: "LOCK", time: 15.0, key: "D Major", decisionScore: 0.85 }
];

// -- File test 2: session BẤT THƯỜNG (khoá nhưng decisionScore/margin/stability đều thấp) --
const session2 = [
    normalRecord(1.5, { margin: 0.05, stability: 0.4, decisionScore: 0.3 }),
    normalRecord(15.5, { top1: "G Minor", margin: 0.02, stability: 0.39, decisionScore: 0.3, votes: 5, locked: true })
];
const lockRecord2 = { event: "LOCK", time: 15.5, key: "G Minor", decisionScore: 0.3 };

// -- File test 3: session KHÔNG khoá (không có LOCK) --
const session3 = [
    normalRecord(1.5, { top1: "E Minor" }),
    normalRecord(3.0, { top1: "E Minor" })
];

const file1 = writeTestLogFile("9999-01-01_00-00-01_TEST.jsonl", [...session1]);
const file2 = writeTestLogFile("9999-01-01_00-00-02_TEST.jsonl", [...session2, lockRecord2]);
const file3 = writeTestLogFile("9999-01-01_00-00-03_TEST.jsonl", [...session3]);
// Thêm 1 dòng JSON hỏng THẬT SỰ (ghi thẳng, không qua JSON.stringify — nếu không nó sẽ tự
// động được escape thành 1 chuỗi JSON hợp lệ, không còn là dòng hỏng nữa).
fs.appendFileSync(file3, "{ dòng JSON hỏng khong co dấu đóng\n", "utf-8");

console.log("=== Chạy analyzeTelemetry.js với dữ liệu giả lập ===");
const analyzer = require(ANALYZER_PATH);

// Chạy toàn bộ (đọc + tính + ghi report) — dùng đúng hàm run() thật, không mô phỏng riêng
analyzer.run();

// ================================
// Kiểm chứng
// ================================
console.log("\n=== Kiểm chứng kết quả ===");

check(fs.existsSync(REPORT_FILE), "reports/telemetry_report.md được tạo thành công");

const reportContent = fs.existsSync(REPORT_FILE) ? fs.readFileSync(REPORT_FILE, "utf-8") : "";

check(reportContent.includes("# Telemetry Report"), "Báo cáo có tiêu đề đúng");
check(reportContent.includes("Số file log đã đọc"), "Báo cáo có mục Tổng quan");
check(reportContent.includes("dòng không hợp lệ"), "Báo cáo có báo cáo số dòng lỗi (từ dòng JSON hỏng cố ý thêm)");

// Đọc lại bằng chính hàm readAllRecords để so khớp con số
const { records, fileCount, invalidLineCount } = analyzer.readAllRecords();
check(fileCount >= 3, `Đọc được ít nhất 3 file test (thực tế: ${fileCount})`);
check(invalidLineCount >= 1, `Phát hiện đúng dòng JSON hỏng đã cố ý thêm (thực tế: ${invalidLineCount} dòng lỗi)`);

const sessions = analyzer.groupIntoSessions(records.filter((r) => r.__file && r.__file.includes("TEST")));
check(sessions.length === 3, `Gom đúng 3 phiên từ 3 file test (thực tế: ${sessions.length})`);

const analyses = sessions.map((s) => analyzer.analyzeSession(s));
const lockedAnalyses = analyses.filter((a) => a.lock);
check(lockedAnalyses.length === 2, `Đúng 2/3 phiên khoá được (thực tế: ${lockedAnalyses.length})`);

const session1Analysis = analyses.find((a) => a.lock && a.lock.key === "D Major");
check(!!session1Analysis, "Tìm thấy phiên 1 (khoá D Major)");
if (session1Analysis) {
    check(session1Analysis.top1ChangesBeforeLock === 1, `Phiên 1: đúng 1 lần đổi Top1 trước khi khoá (thực tế: ${session1Analysis.top1ChangesBeforeLock})`);
    check(session1Analysis.snapshotAtLock && session1Analysis.snapshotAtLock.margin === 0.4, `Phiên 1: margin lúc khoá lấy đúng từ record thường cùng thời điểm (thực tế: ${session1Analysis.snapshotAtLock?.margin})`);
}

const session2Analysis = analyses.find((a) => a.lock && a.lock.key === "G Minor");
check(!!session2Analysis, "Tìm thấy phiên 2 (khoá G Minor, bất thường)");

const session3Analysis = analyses.find((a) => !a.lock);
check(!!session3Analysis, "Tìm thấy phiên 3 (không khoá)");
if (session3Analysis) {
    check(session3Analysis.normal.length === 2, `Phiên 3: đúng 2 record thường, không có LOCK (thực tế: ${session3Analysis.normal.length})`);
}

// Kiểm tra phát hiện bất thường — session 2 phải bị gắn CẢ 3 loại bất thường
const anomalies = analyzer.detectAnomalies(analyses);
const anomaliesForSession2 = anomalies.filter((a) => a.key === "G Minor");
check(anomaliesForSession2.some((a) => a.type.includes("DecisionScore")), "Phát hiện đúng: DecisionScore thấp nhưng vẫn khoá (phiên 2)");
check(anomaliesForSession2.some((a) => a.type.includes("Margin")), "Phát hiện đúng: Margin rất nhỏ lúc khoá (phiên 2)");
check(anomaliesForSession2.some((a) => a.type.includes("Stability")), "Phát hiện đúng: Stability thấp lúc khoá (phiên 2)");

const anomaliesForSession1 = anomalies.filter((a) => a.key === "D Major");
check(anomaliesForSession1.length === 0, `Phiên 1 (lành mạnh) không bị gắn bất thường nào (thực tế: ${anomaliesForSession1.length})`);

// Kiểm tra thống kê toán học cơ bản bằng ví dụ tay
check(analyzer.median([1, 2, 3, 4]) === 2.5, "median([1,2,3,4]) = 2.5, đúng");
check(analyzer.median([1, 2, 3]) === 2, "median([1,2,3]) = 2, đúng");
check(analyzer.mean([2, 4, 6]) === 4, "mean([2,4,6]) = 4, đúng");
check(analyzer.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95) === 10, "percentile 95 của [1..10] = 10, đúng (P95 thiên về giá trị lớn với mẫu nhỏ)");

const lockTimeHist = analyzer.buildLockTimeHistogram([15.2, 15.8, 16.1]);
check(lockTimeHist.length === 2, `Histogram gom đúng 2 khoảng (15-16s có 2, 16-17s có 1), thực tế: ${lockTimeHist.length} khoảng`);

// ================================
// Dọn dẹp — không làm bẩn logs/ và reports/ thật
// ================================
console.log("\n=== Dọn dẹp file test ===");
for (const f of [file1, file2, file3]) {
    try { fs.unlinkSync(f); } catch {}
}
const logsAfter = fs.readdirSync(LOGS_DIR);
const leftoverTestFiles = logsAfter.filter((f) => f.includes("TEST"));
check(leftoverTestFiles.length === 0, "Đã xoá sạch file log test khỏi logs/");

// Xoá report test-generated nếu nó chỉ chứa dữ liệu test (không có report thật từ trước)
// -- an toàn: chỉ xoá nếu KHÔNG có report nào tồn tại trước khi test này chạy.
if (!reportsExistedBefore) {
    try {
        fs.unlinkSync(REPORT_FILE);
        fs.rmdirSync(REPORTS_DIR);
        console.log("  (đã xoá reports/telemetry_report.md do test tự sinh — reports/ chưa tồn tại trước khi test chạy)");
    } catch {}
} else {
    console.log("  (reports/ đã tồn tại từ trước — GIỮ NGUYÊN, không xoá để tránh mất báo cáo thật của bạn)");
}

console.log("\n========== TỔNG KẾT ==========");
if (failCount === 0) {
    console.log("✅ TẤT CẢ kiểm chứng PASS — Telemetry Analyzer tính đúng, không đụng Key Engine/Core AI.");
} else {
    console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
}
process.exit(failCount > 0 ? 1 : 0);
