#!/usr/bin/env node
/**
 * ==========================================================
 * Auto Menu AI — Telemetry Analyzer (Phase 5)
 * ----------------------------------------------------------
 * Chạy bằng: node scripts/analyzeTelemetry.js
 *
 * Đọc TOÀN BỘ logs/*.jsonl (do TelemetryLogger ghi ra ở Phase 4A),
 * tính thống kê, phát hiện bản ghi bất thường, sinh báo cáo Markdown
 * tại reports/telemetry_report.md.
 *
 * KHÔNG đụng tới bất kỳ file nào của Key Engine/Core AI — script
 * này CHỈ ĐỌC dữ liệu đã ghi sẵn, hoàn toàn offline, độc lập với
 * Electron/renderer/main process.
 * ==========================================================
 */

const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.resolve(__dirname, "..", "logs");
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const REPORT_FILE = path.join(REPORTS_DIR, "telemetry_report.md");

// -- Ngưỡng phát hiện bất thường — TẠM THỜI, nên điều chỉnh lại khi có đủ dữ liệu thật
// (đúng tinh thần "thu thập dữ liệu trước, quyết định ngưỡng sau" của cả dự án). --
const ANOMALY_THRESHOLDS = {
    LOW_DECISION_SCORE: 0.5,
    LOW_MARGIN: 0.05,
    LOW_STABILITY: 0.5
};

// ================================
// 1. ĐỌC TOÀN BỘ logs/*.jsonl
// ================================
function readAllRecords() {
    if (!fs.existsSync(LOGS_DIR)) {
        return { records: [], fileCount: 0, invalidLineCount: 0 };
    }

    const files = fs.readdirSync(LOGS_DIR)
        .filter((f) => f.endsWith(".jsonl"))
        .sort(); // tên file là timestamp -> sort theo tên = sort theo thời gian tạo

    const records = [];
    let invalidLineCount = 0;

    for (const file of files) {
        const fullPath = path.join(LOGS_DIR, file);
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n").filter((l) => l.trim().length > 0);

        for (const line of lines) {
            try {
                const record = JSON.parse(line);
                record.__file = file;
                records.push(record);
            } catch (err) {
                invalidLineCount++;
            }
        }
    }

    return { records, fileCount: files.length, invalidLineCount };
}

// ================================
// 2. GOM THÀNH TỪNG "PHIÊN" (session) — mỗi lần detectOnce()/watchContinuous() khởi động lại
// sẽ có `time` bắt đầu lại gần 0. Phát hiện session mới khi `time` GIẢM so với record trước.
// Đây là ranh giới suy ra từ dữ liệu, KHÔNG có session_id tường minh trong log.
// ================================
function groupIntoSessions(records) {
    const sessions = [];
    let current = null;
    let lastTime = -Infinity;

    for (const record of records) {
        if (typeof record.time !== "number") continue; // bỏ qua record không có time (không nên xảy ra)

        if (current === null || record.time < lastTime - 0.01) { // trừ hao sai số float nhỏ
            current = { records: [] };
            sessions.push(current);
        }

        current.records.push(record);
        lastTime = record.time;
    }

    return sessions;
}

// ================================
// 3. THỐNG KÊ TOÁN HỌC CƠ BẢN
// ================================
function mean(arr) {
    if (arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(arr, p) {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function distributionStats(arr) {
    const clean = arr.filter((v) => typeof v === "number" && !Number.isNaN(v));
    if (clean.length === 0) return null;
    return {
        count: clean.length,
        min: Math.min(...clean),
        max: Math.max(...clean),
        avg: mean(clean),
        median: median(clean),
        p95: percentile(clean, 95)
    };
}

function fmt(n, digits = 2) {
    return typeof n === "number" ? n.toFixed(digits) : "N/A";
}

// ================================
// 4. PHÂN TÍCH TỪNG PHIÊN
// ================================
function analyzeSession(session) {
    const normal = session.records.filter((r) => !r.event);
    const lockRecords = session.records.filter((r) => r.event === "LOCK");
    const top1Changes = session.records.filter((r) => r.event === "TOP1_CHANGED");

    const lock = lockRecords[0] || null; // 1 phiên chỉ nên có tối đa 1 LOCK (detectOnce tự dừng)

    // Tìm record thường CÙNG thời điểm với lúc khoá, để lấy margin/stability/top1Stable
    // (bản thân record LOCK không mang các field này).
    let snapshotAtLock = null;
    if (lock) {
        snapshotAtLock = normal.find((r) => Math.abs(r.time - lock.time) < 0.01) || null;
    }

    const top1ChangesBeforeLock = lock
        ? top1Changes.filter((c) => c.time <= lock.time).length
        : top1Changes.length;

    return { normal, lockRecords, top1Changes, lock, snapshotAtLock, top1ChangesBeforeLock, file: session.records[0]?.__file };
}

// ================================
// 5. PHÁT HIỆN BẤT THƯỜNG
// ================================
function detectAnomalies(sessionAnalyses) {
    const anomalies = [];

    for (const sa of sessionAnalyses) {
        if (!sa.lock) continue;

        const decisionScore = sa.lock.decisionScore;
        const margin = sa.snapshotAtLock?.margin;
        const stability = sa.snapshotAtLock?.stability;

        if (typeof decisionScore === "number" && decisionScore < ANOMALY_THRESHOLDS.LOW_DECISION_SCORE) {
            anomalies.push({ type: "DecisionScore thấp nhưng vẫn khoá", file: sa.file, time: sa.lock.time, key: sa.lock.key, value: decisionScore });
        }
        if (typeof margin === "number" && margin < ANOMALY_THRESHOLDS.LOW_MARGIN) {
            anomalies.push({ type: "Margin rất nhỏ lúc khoá", file: sa.file, time: sa.lock.time, key: sa.lock.key, value: margin });
        }
        if (typeof stability === "number" && stability < ANOMALY_THRESHOLDS.LOW_STABILITY) {
            anomalies.push({ type: "Stability thấp lúc khoá", file: sa.file, time: sa.lock.time, key: sa.lock.key, value: stability });
        }
    }

    return anomalies;
}

// ================================
// 6. HISTOGRAM THỜI GIAN LOCK (bucket 1 giây)
// ================================
function buildLockTimeHistogram(lockTimes) {
    if (lockTimes.length === 0) return [];
    const buckets = {};
    for (const t of lockTimes) {
        const bucket = Math.floor(t); // vd 15.4s -> bucket "15"
        buckets[bucket] = (buckets[bucket] || 0) + 1;
    }
    return Object.keys(buckets)
        .map(Number)
        .sort((a, b) => a - b)
        .map((b) => ({ range: `${b}-${b + 1}s`, count: buckets[b] }));
}

// ================================
// 7. SINH BÁO CÁO MARKDOWN
// ================================
function renderDistributionTable(name, stats) {
    if (!stats) return `**${name}**: không có dữ liệu\n`;
    return [
        `**${name}** (n=${stats.count})`,
        "",
        "| Min | Avg | Median | P95 | Max |",
        "|---|---|---|---|---|",
        `| ${fmt(stats.min)} | ${fmt(stats.avg)} | ${fmt(stats.median)} | ${fmt(stats.p95)} | ${fmt(stats.max)} |`,
        ""
    ].join("\n");
}

function generateReport(data) {
    const {
        fileCount, invalidLineCount, sessionAnalyses,
        lockedCount, totalSessions,
        lockTimeStats, marginStatsAll, stabilityStatsAll, decisionScoreStatsAll, top1StableStatsAll,
        marginStatsAtLock, stabilityStatsAtLock, decisionScoreStatsAtLock,
        top1ChangesBeforeLockStats, lockHistogram, anomalies
    } = data;

    const lines = [];

    lines.push("# Telemetry Report — AUTO_MENU_AI Key Engine");
    lines.push("");
    lines.push(`*Sinh tự động bởi \`scripts/analyzeTelemetry.js\` lúc ${new Date().toISOString()}*`);
    lines.push("");
    lines.push("## 1. Tổng quan");
    lines.push("");
    lines.push(`- Số file log đã đọc: **${fileCount}**`);
    lines.push(`- Số dòng không hợp lệ (bỏ qua): **${invalidLineCount}**`);
    lines.push(`- Số phiên phân tích (session — suy ra từ mốc \`time\` reset về 0, KHÔNG hẳn là "1 bài hát" theo nghĩa đen nếu có phiên dò nền của Manual Key Mode): **${totalSessions}**`);
    lines.push(`- Số phiên khoá được (LOCK): **${lockedCount}** (${totalSessions > 0 ? ((lockedCount / totalSessions) * 100).toFixed(1) : "0"}%)`);
    lines.push("");

    lines.push("## 2. Thời gian khoá (Lock Time)");
    lines.push("");
    lines.push(renderDistributionTable("Lock Time (giây)", lockTimeStats));

    lines.push("## 3. Histogram thời gian khoá");
    lines.push("");
    if (lockHistogram.length > 0) {
        lines.push("| Khoảng | Số lần |");
        lines.push("|---|---|");
        for (const h of lockHistogram) lines.push(`| ${h.range} | ${h.count} |`);
    } else {
        lines.push("*Không có dữ liệu khoá.*");
    }
    lines.push("");

    lines.push("## 4. Phân bố các chỉ số — TOÀN BỘ lần đo (mọi tick, không chỉ lúc khoá)");
    lines.push("");
    lines.push(renderDistributionTable("Margin", marginStatsAll));
    lines.push(renderDistributionTable("Stability", stabilityStatsAll));
    lines.push(renderDistributionTable("DecisionScore", decisionScoreStatsAll));
    lines.push(renderDistributionTable("Top1 Stable (giây)", top1StableStatsAll));

    lines.push("## 5. Phân bố các chỉ số — TẠI THỜI ĐIỂM KHOÁ (chỉ phiên đã khoá)");
    lines.push("");
    lines.push(renderDistributionTable("Margin lúc khoá", marginStatsAtLock));
    lines.push(renderDistributionTable("Stability lúc khoá", stabilityStatsAtLock));
    lines.push(renderDistributionTable("DecisionScore lúc khoá", decisionScoreStatsAtLock));

    lines.push("## 6. Số lần Top1 đổi trước khi khoá");
    lines.push("");
    lines.push(renderDistributionTable("Số lần Top1 đổi / phiên (đã khoá)", top1ChangesBeforeLockStats));

    lines.push("## 7. Bản ghi bất thường");
    lines.push("");
    lines.push(`*Ngưỡng hiện dùng (TẠM THỜI, nên điều chỉnh khi có nhiều dữ liệu hơn): DecisionScore < ${ANOMALY_THRESHOLDS.LOW_DECISION_SCORE}, Margin < ${ANOMALY_THRESHOLDS.LOW_MARGIN}, Stability < ${ANOMALY_THRESHOLDS.LOW_STABILITY}*`);
    lines.push("");
    if (anomalies.length > 0) {
        lines.push("| Loại | File | Time (s) | Key | Giá trị |");
        lines.push("|---|---|---|---|---|");
        for (const a of anomalies) {
            lines.push(`| ${a.type} | ${a.file} | ${fmt(a.time, 1)} | ${a.key} | ${fmt(a.value)} |`);
        }
    } else {
        lines.push("*Không phát hiện bản ghi bất thường nào.*");
    }
    lines.push("");

    lines.push("## 8. Ghi chú");
    lines.push("");
    lines.push("- Báo cáo này CHỈ tổng hợp dữ liệu đã ghi — không thay đổi bất kỳ thuật toán hoặc hành vi nào của hệ thống.");
    lines.push("- Dùng kết quả này làm cơ sở chọn ngưỡng cho Adaptive Lock (Phase tiếp theo), thay vì đoán theo cảm tính.");
    lines.push("");

    return lines.join("\n");
}

// ================================
// MAIN
// ================================
function run() {
    const { records, fileCount, invalidLineCount } = readAllRecords();

    if (fileCount === 0) {
        console.log(`Không tìm thấy file log nào trong ${LOGS_DIR}. Chưa có dữ liệu để phân tích.`);
    }

    const sessions = groupIntoSessions(records);
    const sessionAnalyses = sessions.map(analyzeSession);

    const lockedSessions = sessionAnalyses.filter((sa) => sa.lock);
    const lockTimes = lockedSessions.map((sa) => sa.lock.time);

    const allNormal = sessionAnalyses.flatMap((sa) => sa.normal);
    const marginStatsAll = distributionStats(allNormal.map((r) => r.margin));
    const stabilityStatsAll = distributionStats(allNormal.map((r) => r.stability));
    const decisionScoreStatsAll = distributionStats(allNormal.map((r) => r.decisionScore));
    const top1StableStatsAll = distributionStats(allNormal.map((r) => r.top1Stable));

    const atLockSnapshots = lockedSessions.map((sa) => sa.snapshotAtLock).filter(Boolean);
    const marginStatsAtLock = distributionStats(atLockSnapshots.map((r) => r.margin));
    const stabilityStatsAtLock = distributionStats(atLockSnapshots.map((r) => r.stability));
    const decisionScoreStatsAtLock = distributionStats(lockedSessions.map((sa) => sa.lock.decisionScore));

    const top1ChangesBeforeLockStats = distributionStats(lockedSessions.map((sa) => sa.top1ChangesBeforeLock));

    const lockHistogram = buildLockTimeHistogram(lockTimes);
    const anomalies = detectAnomalies(sessionAnalyses);

    const report = generateReport({
        fileCount, invalidLineCount, sessionAnalyses,
        lockedCount: lockedSessions.length, totalSessions: sessions.length,
        lockTimeStats: distributionStats(lockTimes),
        marginStatsAll, stabilityStatsAll, decisionScoreStatsAll, top1StableStatsAll,
        marginStatsAtLock, stabilityStatsAtLock, decisionScoreStatsAtLock,
        top1ChangesBeforeLockStats, lockHistogram, anomalies
    });

    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
    fs.writeFileSync(REPORT_FILE, report, "utf-8");

    console.log(`Đã đọc ${fileCount} file log (${records.length} dòng, ${invalidLineCount} dòng lỗi bỏ qua).`);
    console.log(`Đã phân tích ${sessions.length} phiên (${lockedSessions.length} phiên khoá được).`);
    console.log(`Phát hiện ${anomalies.length} bản ghi bất thường.`);
    console.log(`Báo cáo đã ghi tại: ${REPORT_FILE}`);
}

module.exports = {
    readAllRecords, groupIntoSessions, analyzeSession, detectAnomalies,
    buildLockTimeHistogram, distributionStats, mean, median, percentile,
    generateReport, run
};

if (require.main === module) {
    run();
}
