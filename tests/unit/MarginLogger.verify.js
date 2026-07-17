/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Margin Logger (Phase 1.5)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/MarginLogger.verify.js
 *
 * Chạy THẬT theo thời gian thực (~16-17 giây) vì cần đúng nhịp
 * CHECK_INTERVAL_MS (1.5s) và MIN_ELAPSED_BEFORE_LOCK_MS (15s) —
 * không giả lập timer, để chứng minh đúng hành vi thời gian thực.
 *
 * Mục tiêu chứng minh:
 *   1. Log xuất hiện đúng định dạng, đủ 7 dữ liệu yêu cầu.
 *   2. "Locked: Yes" trong log CHỈ xuất hiện đúng lúc engine THỰC SỰ
 *      khoá (onWinner được gọi) — không sớm hơn, không trễ hơn.
 *   3. Việc thêm log KHÔNG làm thay đổi thời điểm/kết quả khoá so với
 *      hành vi gốc (vẫn cần >=5/8 phiếu VÀ >=15 giây, y hệt trước).
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

function makeFakeAnalyser() {
    // Phổ ỔN ĐỊNH mô phỏng hợp âm C Major rõ ràng suốt — để chắc chắn engine khoá được
    // trong lúc test (không phụ thuộc âm thanh thật).
    const arr = new Float32Array(4096).fill(-100);
    const binHz = 48000 / 8192;
    for (const f of [65.4, 130.8, 261.6, 329.6, 392.0, 523.3]) {
        const bin = Math.round(f / binHz);
        if (bin >= 0 && bin < arr.length) arr[bin] = -10;
    }
    return {
        fftSize: 8192,
        smoothingTimeConstant: 0,
        frequencyBinCount: 4096,
        getFloatFrequencyData(out) {
            for (let i = 0; i < out.length; i++) out[i] = arr[i];
        }
    };
}

async function main() {
    const logLines = [];
    const sandbox = {
        window: {},
        Float32Array,
        Math,
        Array,
        console: { log: (msg) => logLines.push(String(msg)) }, // bắt lại toàn bộ console.log
        setInterval, clearInterval,
        Date,
        requestAnimationFrame: (cb) => setTimeout(cb, 16), // ~60fps thật, để chromaVector hội tụ tự nhiên
        cancelAnimationFrame: (id) => clearTimeout(id)
    };
    vm.createContext(sandbox);
    vm.runInContext(keyEngineSource, sandbox, { filename: "keyEngine.js" });

    const KeyEngine = sandbox.window.KeyEngine;
    const fakeAudioContext = { sampleRate: 48000, createAnalyser: makeFakeAnalyser };
    const fakeSourceNode = { connect: () => {} };

    KeyEngine.init(fakeAudioContext, fakeSourceNode);

    let onWinnerFired = false;
    let onWinnerElapsedMs = null;
    const startedAt = Date.now();

    await new Promise((resolve) => {
        KeyEngine.detectOnce((result) => {
            onWinnerFired = true;
            onWinnerElapsedMs = Date.now() - startedAt;
            resolve();
        });
        // an toàn: nếu quá 20s vẫn chưa khoá thì tự thoát để không treo test mãi
        setTimeout(resolve, 20000);
    });

    console.log(`\n--- Đã thu được ${logLines.length} dòng log, onWinner đã gọi: ${onWinnerFired} (t=${onWinnerElapsedMs}ms) ---\n`);
    console.log(logLines.slice(-9).join("\n")); // in 9 dòng cuối (~1 lần log đầy đủ) để xem thật

    // === Kiểm chứng ===
    check(onWinnerFired, "KeyEngine phải khoá được (onWinner được gọi) trong phiên test 20s");

    const fullSnapshots = groupLogLines(logLines);
    check(fullSnapshots.length > 0, `Có ít nhất 1 snapshot log đầy đủ được ghi nhận (thực tế: ${fullSnapshots.length})`);

    for (const snap of fullSnapshots) {
        check(/^\d+\.\d+s$/.test(snap.time), `Dòng Time đúng định dạng: "${snap.time}"`);
        check(snap.top1 !== undefined, "Có dòng Top1");
        check(snap.top2 !== undefined, "Có dòng Top2");
        check(snap.margin !== undefined, "Có dòng Margin");
        check(snap.confidence !== undefined, "Có dòng Confidence");
        check(snap.key !== undefined, "Có dòng Key");
        check(snap.votes !== undefined, "Có dòng Votes");
        check(snap.locked === "Yes" || snap.locked === "No", `Locked là Yes/No hợp lệ: "${snap.locked}"`);
    }

    const lockedYesSnaps = fullSnapshots.filter((s) => s.locked === "Yes");
    check(lockedYesSnaps.length === 1, `Đúng 1 snapshot "Locked: Yes" (không phải log lặp sau khi đã khoá, vì detectOnce() tự dừng), thực tế: ${lockedYesSnaps.length}`);

    if (lockedYesSnaps.length > 0) {
        const lockedTimeSec = parseFloat(lockedYesSnaps[0].time.replace("s", ""));
        check(lockedTimeSec >= 15.0, `Thời điểm "Locked: Yes" trong log phải >= 15.0s (đúng MIN_ELAPSED_BEFORE_LOCK_MS gốc), thực tế: ${lockedTimeSec}s`);
        check(Math.abs(lockedTimeSec * 1000 - onWinnerElapsedMs) < 1600, `Thời điểm log "Locked: Yes" (${lockedTimeSec}s) phải khớp thời điểm onWinner() thật (${onWinnerElapsedMs}ms), lệch trong 1 nhịp CHECK_INTERVAL_MS`);
    }

    const allNoLocked = fullSnapshots.filter((s) => s.locked === "No");
    check(allNoLocked.every((s) => parseFloat(s.votes.split("/")[0]) < 5 || parseFloat(s.time.replace("s", "")) < 15.0),
        "Mọi snapshot 'Locked: No' đều đúng lý do (chưa đủ phiếu HOẶC chưa đủ 15s) — khớp logic gốc");

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — Margin Logger không làm đổi quyết định khoá của engine.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}

// Gom các dòng console.log liên tiếp (1 lần gọi logMarginSnapshot = nhiều dòng nối bằng \n
// trong CÙNG 1 lệnh console.log) thành từng object snapshot dễ kiểm tra.
function groupLogLines(logLines) {
    const snapshots = [];
    for (const block of logLines) {
        if (!block.startsWith("[KeyEngine]")) continue;
        const lines = block.split("\n");
        const snap = {};
        for (const line of lines) {
            const m = line.match(/Time:\s*([\d.]+s)/); if (m) snap.time = `Time: ${m[1]}`.replace("Time: ", "");
            if (line.includes("Top1:")) snap.top1 = line.trim();
            if (line.includes("Top2:")) snap.top2 = line.trim();
            if (line.includes("Margin:")) snap.margin = line.trim();
            if (line.includes("Confidence:")) snap.confidence = line.trim();
            if (line.trim().startsWith("Key:")) snap.key = line.trim();
            if (line.includes("Votes:")) snap.votes = line.split("Votes:")[1].trim().split(" ")[0];
            if (line.includes("Locked:")) snap.locked = line.includes("Locked: Yes") ? "Yes" : "No";
        }
        if (snap.time) snapshots.push(snap);
    }
    return snapshots;
}

main();
