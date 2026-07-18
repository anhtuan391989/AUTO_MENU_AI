/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Top1 Stability Timer (Phase 3.5)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/Top1StabilityTimer.verify.js
 *
 * PHẦN A — Kiểm tra thuần logic reset/tăng liên tục (tức thời).
 * PHẦN B — Chạy THẬT keyEngine.js, phổ ỔN ĐỊNH suốt ~16s:
 *   Case 1 (Top1 không đổi -> Top1Stable tăng liên tục)
 *   Case 4 (vẫn khoá đúng 15s, Top1Stable không ảnh hưởng Lock)
 * PHẦN C — Chạy THẬT keyEngine.js, ĐỔI phổ giữa chừng (~20s):
 *   Case 2 (Top1 đổi -> Top1Stable reset về ~0)
 *   Case 3 (chỉ đổi phổ đúng 1 lần -> reset đúng 1 lần)
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
// PHẦN A — Kiểm tra thuần logic (tái hiện đúng thuật toán private để test độc lập)
// ================================
console.log("=== PHẦN A: Đúng logic reset/tăng liên tục ===");

function makeTracker() {
    let lastKey = null, lastChangedAt = null;
    return function updateTop1StabilityTimer(top1, now) {
        const currentKey = `${top1.root}-${top1.mode}`;
        if (currentKey !== lastKey) { lastKey = currentKey; lastChangedAt = now; }
        return now - lastChangedAt;
    };
}

{
    const tracker = makeTracker();
    const t0 = 1_000_000;
    const r1 = tracker({ root: 0, mode: "Major" }, t0);
    const r2 = tracker({ root: 0, mode: "Major" }, t0 + 1500);
    const r3 = tracker({ root: 0, mode: "Major" }, t0 + 3000);
    check(r1 === 0 && r2 === 1500 && r3 === 3000, `Case 1 (C,C,C): Top1Stable tăng liên tục đúng theo thời gian (${r1},${r2},${r3})`);
}
{
    const tracker = makeTracker();
    const t0 = 2_000_000;
    tracker({ root: 0, mode: "Major" }, t0);       // C
    const r2 = tracker({ root: 9, mode: "Minor" }, t0 + 1500); // Am -> đổi -> reset
    check(r2 === 0, `Case 2 (C,Am): Top1 đổi -> Top1Stable reset về 0 (thực tế: ${r2})`);
}
{
    const tracker = makeTracker();
    const t0 = 3_000_000;
    const results = [
        tracker({ root: 0, mode: "Major" }, t0),           // C        -> 0
        tracker({ root: 0, mode: "Major" }, t0 + 1500),     // C        -> 1500
        tracker({ root: 9, mode: "Minor" }, t0 + 3000),     // Am (đổi) -> 0 (reset lần 1)
        tracker({ root: 9, mode: "Minor" }, t0 + 4500)      // Am       -> 1500
    ];
    const resetCount = results.filter((v, i) => i > 0 && v < results[i - 1]).length;
    check(resetCount === 1, `Case 3 (C,C,Am,Am): reset đúng 1 lần (thực tế: ${resetCount} lần, dãy=${results.join(",")})`);
    check(results[3] === 1500, `Sau reset, Top1Stable tiếp tục tăng bình thường cho Am (thực tế: ${results[3]})`);
}

// ================================
// PHẦN B/C — Chạy THẬT keyEngine.js
// ================================
const keyEngineSource = fs.readFileSync(
    path.resolve(__dirname, "../../ui/js/engines/keyEngine.js"),
    "utf-8"
);

function spectrumFor(freqs) {
    const arr = new Float32Array(4096).fill(-100);
    const binHz = 48000 / 8192;
    for (const f of freqs) {
        const bin = Math.round(f / binHz);
        if (bin >= 0 && bin < arr.length) arr[bin] = -10;
    }
    return arr;
}

const C_MAJOR_SPECTRUM = spectrumFor([65.4, 130.8, 261.6, 329.6, 392.0, 523.3]);   // C-E-G, nhiều bát độ
const A_MINOR_SPECTRUM = spectrumFor([110.0, 130.8, 164.8, 220.0, 261.6, 329.6]);  // A-C-E, nhiều bát độ, bass mạnh ở A

function makeSwitchingAnalyser(getSpectrum) {
    return {
        fftSize: 8192, smoothingTimeConstant: 0, frequencyBinCount: 4096,
        getFloatFrequencyData(out) {
            const spectrum = getSpectrum();
            for (let i = 0; i < out.length; i++) out[i] = spectrum[i];
        }
    };
}

function parseSnapshots(logLines) {
    const snapshots = [];
    for (const block of logLines) {
        if (!block.startsWith("[KeyEngine]")) continue;
        const snap = {};
        for (const line of block.split("\n")) {
            const mTime = line.match(/Time:\s*([\d.]+)s/); if (mTime) snap.time = parseFloat(mTime[1]);
            const mStable = line.match(/Top1 Stable:\s*([\d.]+)s/); if (mStable) snap.top1Stable = parseFloat(mStable[1]);
            const mTop1 = line.match(/Top1:\s*([A-G#]+\s+\w+)/); if (mTop1) snap.top1 = mTop1[1];
            const mConf = line.match(/^\s*Confidence:\s*([\d.]+)/); if (mConf) snap.confidence = parseFloat(mConf[1]);
            const mVotes = line.match(/Votes:\s*(\d+)\/(\d+)/); if (mVotes) snap.votes = `${mVotes[1]}/${mVotes[2]}`;
            if (line.includes("Locked:")) snap.locked = line.includes("Locked: Yes") ? "Yes" : "No";
        }
        if (snap.time !== undefined) snapshots.push(snap);
    }
    return snapshots;
}

async function runPartB() {
    console.log("\n=== PHẦN B: Phổ ỔN ĐỊNH suốt ~16s (Case 1 + Case 4) ===");
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
    KeyEngine.init(
        { sampleRate: 48000, createAnalyser: () => makeSwitchingAnalyser(() => C_MAJOR_SPECTRUM) },
        { connect: () => {} }
    );

    let onWinnerResult = null, onWinnerElapsedMs = null;
    const startedAt = Date.now();
    await new Promise((resolve) => {
        KeyEngine.detectOnce((result) => { onWinnerResult = result; onWinnerElapsedMs = Date.now() - startedAt; resolve(); });
        setTimeout(resolve, 20000);
    });

    const snaps = parseSnapshots(logLines);
    console.log(`  (${snaps.length} snapshot, Top1Stable: [${snaps.map((s) => s.top1Stable).join(", ")}])`);

    // Case 1: với phổ không đổi, Top1Stable phải TĂNG LIÊN TỤC qua các lần đo (không giảm)
    let monotonic = true;
    for (let i = 1; i < snaps.length; i++) {
        if (snaps[i].top1Stable < snaps[i - 1].top1Stable) monotonic = false;
    }
    check(monotonic, "Case 1: Top1Stable tăng liên tục (không giảm) khi Top1 không đổi suốt phiên");
    check(snaps.length > 0 && snaps[snaps.length - 1].top1Stable >= 12.0, `Case 1: Top1Stable ở lần đo cuối gần bằng tổng thời gian phiên (thực tế: ${snaps[snaps.length - 1]?.top1Stable}s trong phiên ~15s)`);

    // Case 4: vẫn khoá đúng 15s, Top1Stable không ảnh hưởng Lock
    check(!!onWinnerResult, "Case 4: KeyEngine vẫn khoá được sau khi thêm Top1 Stability Timer");
    check(onWinnerElapsedMs >= 15000, `Case 4: vẫn khoá sau >= 15000ms (đúng MIN_ELAPSED_BEFORE_LOCK_MS gốc), thực tế: ${onWinnerElapsedMs}ms`);
    check(onWinnerResult && onWinnerResult.top1StableMs === undefined && onWinnerResult.top1Stable === undefined,
        "Object trả cho onWinner() KHÔNG chứa field Top1Stable nào — không rò rỉ vào luồng dữ liệu thật");
    const lockedSnap = snaps.find((s) => s.locked === "Yes");
    if (lockedSnap) {
        const [votesNum] = lockedSnap.votes.split("/").map(Number);
        check(votesNum >= 5, `Case 4: Votes lúc khoá vẫn >= 5 (Vote Window không đổi), thực tế: ${lockedSnap.votes}`);
        check(Math.abs(lockedSnap.confidence - onWinnerResult.confidence) < 0.01, "Case 4: Confidence trong log lúc khoá khớp confidence thật của onWinner (Confidence không đổi)");
    }
}

async function runPartC() {
    console.log("\n=== PHẦN C: Đổi phổ 1 lần giữa chừng, ~20s (Case 2 + Case 3) ===");
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
    const switchAt = Date.now() + 9000; // đổi phổ sau 9 giây
    KeyEngine.init(
        { sampleRate: 48000, createAnalyser: () => makeSwitchingAnalyser(() => (Date.now() < switchAt ? C_MAJOR_SPECTRUM : A_MINOR_SPECTRUM)) },
        { connect: () => {} }
    );
    KeyEngine.detectOnce(() => {}); // khởi động vòng lặp bỏ phiếu (nơi logMarginSnapshot chạy) — init() một mình không tự chạy vote loop

    // Không đợi khoá (đổi phổ giữa chừng có thể không đủ 5/8 phiếu để khoá — đúng và không sao,
    // Case 2/3 chỉ quan tâm nhãn Top1/Top1Stable trong log, không cần chờ onWinner).
    await new Promise((resolve) => setTimeout(resolve, 18000));
    KeyEngine.stop();

    const snaps = parseSnapshots(logLines);
    console.log(`  (${snaps.length} snapshot)`);
    for (const s of snaps) console.log(`   t=${s.time}s Top1=${s.top1} Top1Stable=${s.top1Stable}s`);

    const stableValues = snaps.map((s) => s.top1Stable);
    let resetCount = 0;
    for (let i = 1; i < stableValues.length; i++) {
        if (stableValues[i] < stableValues[i - 1]) resetCount++;
    }

    const top1Changed = snaps.some((s, i) => i > 0 && s.top1 !== snaps[i - 1].top1);
    check(top1Changed, "Case 2: Top1 thực sự đổi nhãn trong log khi phổ giả lập đổi giữa chừng");
    check(resetCount === 1, `Case 3: Top1Stable reset đúng 1 lần trong toàn phiên (đổi phổ đúng 1 lần), thực tế: ${resetCount} lần`);
}

async function main() {
    await runPartB();
    await runPartC();

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — Top1 Stability Timer đúng logic, không đổi Lock/Vote Window/Confidence.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);
}

main();
