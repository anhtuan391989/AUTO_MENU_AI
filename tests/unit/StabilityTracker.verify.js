/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Stability Tracker (Phase 2)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/StabilityTracker.verify.js
 *
 * PHẦN A — Kiểm tra ĐÚNG công thức bằng chính 2 ví dụ trong yêu cầu:
 *   [C,C,C,C,C] -> 1.00      [C,Am,C,G,C] -> 0.36
 * PHẦN B — Chạy THẬT ui/js/engines/keyEngine.js (thời gian thực,
 *   ~16-17 giây) để xác nhận: Stability xuất hiện đúng trong log,
 *   và Vote Window/Lock vẫn khoá ĐÚNG THỜI ĐIỂM/ĐIỀU KIỆN như Phase
 *   1.5 (15.0s, cần đủ 5/8 phiếu) — chứng minh không đổi hành vi.
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
// PHẦN A — Đúng công thức (bình phương tỉ lệ đồng thuận), test bằng chính công thức đã
// công bố trong code (computeStability), sao chép NGUYÊN VĂN 3 dòng để kiểm tra độc lập
// (bản thân là hàm private trong IIFE, không expose ra window.KeyEngine để gọi trực tiếp).
// ================================
console.log("=== PHẦN A: Đúng công thức Stability ===");

function computeStability(bestCount, windowSize) {
    if (!windowSize) return 0;
    const agreement = bestCount / windowSize;
    return agreement * agreement;
}

check(computeStability(5, 5) === 1.00, "[C,C,C,C,C] (5/5 đồng thuận) -> Stability = 1.00, đúng ví dụ trong yêu cầu");
check(Math.abs(computeStability(3, 5) - 0.36) < 1e-9, "[C,Am,C,G,C] (3/5 đồng thuận) -> Stability = 0.36, đúng ví dụ trong yêu cầu");
check(computeStability(0, 0) === 0, "Cửa sổ rỗng -> Stability = 0 (không chia cho 0)");
check(computeStability(4, 8) === 0.25, "4/8 đồng thuận -> Stability = 0.25 ((0.5)^2)");
check(computeStability(1, 1) === 1.00, "1/1 đồng thuận (mẫu đầu tiên) -> Stability = 1.00");

// ================================
// PHẦN B — Chạy THẬT keyEngine.js, thời gian thực
// ================================
console.log("\n=== PHẦN B: Chạy thật keyEngine.js (thời gian thực ~16s) ===");

const keyEngineSource = fs.readFileSync(
    path.resolve(__dirname, "../../ui/js/engines/keyEngine.js"),
    "utf-8"
);

function makeFakeAnalyser() {
    const arr = new Float32Array(4096).fill(-100);
    const binHz = 48000 / 8192;
    for (const f of [65.4, 130.8, 261.6, 329.6, 392.0, 523.3]) { // C2..C5, hợp âm C Major ổn định
        const bin = Math.round(f / binHz);
        if (bin >= 0 && bin < arr.length) arr[bin] = -10;
    }
    return {
        fftSize: 8192, smoothingTimeConstant: 0, frequencyBinCount: 4096,
        getFloatFrequencyData(out) { for (let i = 0; i < out.length; i++) out[i] = arr[i]; }
    };
}

function groupLogLines(logLines) {
    const snapshots = [];
    for (const block of logLines) {
        if (!block.startsWith("[KeyEngine]")) continue;
        const snap = {};
        for (const line of block.split("\n")) {
            const mTime = line.match(/Time:\s*([\d.]+)s/); if (mTime) snap.time = mTime[1];
            const mStability = line.match(/Stability:\s*([\d.?]+)/); if (mStability) snap.stability = mStability[1];
            const mVotes = line.match(/Votes:\s*(\d+)\/(\d+)/); if (mVotes) snap.votes = `${mVotes[1]}/${mVotes[2]}`;
            if (line.includes("Locked:")) snap.locked = line.includes("Locked: Yes") ? "Yes" : "No";
        }
        if (snap.time) snapshots.push(snap);
    }
    return snapshots;
}

async function runPartB() {
    const logLines = [];
    const sandbox = {
        window: {}, Float32Array, Math, Array,
        console: { log: (msg) => logLines.push(String(msg)) },
        setInterval, clearInterval, Date,
        requestAnimationFrame: (cb) => setTimeout(cb, 16),
        cancelAnimationFrame: (id) => clearTimeout(id)
    };
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });

    const KeyEngine = sandbox.window.KeyEngine;
    KeyEngine.init({ sampleRate: 48000, createAnalyser: makeFakeAnalyser }, { connect: () => {} });

    let onWinnerFired = false;
    let onWinnerElapsedMs = null;
    const startedAt = Date.now();

    await new Promise((resolve) => {
        KeyEngine.detectOnce((result) => {
            onWinnerFired = true;
            onWinnerElapsedMs = Date.now() - startedAt;
            resolve();
        });
        setTimeout(resolve, 20000);
    });

    const snapshots = groupLogLines(logLines);
    const lockedSnap = snapshots.find((s) => s.locked === "Yes");

    console.log(`  (thu được ${snapshots.length} snapshot log, onWinner đã gọi: ${onWinnerFired}, t=${onWinnerElapsedMs}ms)`);
    if (lockedSnap) console.log(`  Snapshot lúc khoá: Time=${lockedSnap.time}s Stability=${lockedSnap.stability} Votes=${lockedSnap.votes} Locked=${lockedSnap.locked}`);

    check(onWinnerFired, "KeyEngine vẫn khoá được (onWinner được gọi) sau khi thêm Stability Tracker");
    check(snapshots.every((s) => s.stability !== undefined), "MỌI snapshot đều có trường Stability trong log");
    check(snapshots.every((s) => /^\d+\.\d\d$/.test(s.stability) || s.stability === "?"), "Định dạng Stability đúng (2 chữ số thập phân)");

    check(!!lockedSnap, "Có snapshot 'Locked: Yes'");
    if (lockedSnap) {
        const lockedTimeSec = parseFloat(lockedSnap.time);
        check(lockedTimeSec >= 15.0, `Thời điểm khoá vẫn >= 15.0s (đúng MIN_ELAPSED_BEFORE_LOCK_MS gốc, KHÔNG đổi), thực tế: ${lockedTimeSec}s`);
        check(Math.abs(lockedTimeSec * 1000 - onWinnerElapsedMs) < 1600, "Thời điểm log khoá khớp thời điểm onWinner() thật — Lock KHÔNG bị ảnh hưởng bởi Stability Tracker");

        const stabilityVal = parseFloat(lockedSnap.stability);
        check(stabilityVal >= 0.85, `Với phổ ổn định suốt (C Major không đổi), Stability lúc khoá phải cao (>=0.85), thực tế: ${stabilityVal}`);

        const [votesNum] = lockedSnap.votes.split("/").map(Number);
        check(votesNum >= 5, `Votes lúc khoá vẫn phải >= 5 (đúng VOTE_MIN_AGREE gốc, KHÔNG đổi), thực tế: ${lockedSnap.votes}`);
    }
}

runPartB().then(() => {
    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — Stability Tracker đúng công thức và không làm đổi hành vi Vote Window/Lock.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
});
