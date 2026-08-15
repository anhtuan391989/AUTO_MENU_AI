/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng Manual-Priority Guard (Task A7)
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/ManualPriorityGuard.verify.js
 *
 * Kiểm chứng đúng 9 Acceptance Case bắt buộc của Task A7 (mục 6), cộng thêm
 * vài case bổ sung để phủ đầy đủ mục 4 (UPDATE_BPM/LOAD_NEW_SONG) và mục 3
 * (timestamp không hợp lệ, đồng hồ lệch).
 *
 * Guard là hàm THUẦN (core/shared/ManualPriorityGuard.js) — test gọi trực
 * tiếp bằng require() thật (module CommonJS chạy trong main process, không
 * cần vm sandbox như các test cho code renderer/browser-only).
 * ==========================================================
 */

const path = require("path");
const Guard = require(path.join(__dirname, "..", "..", "core", "shared", "ManualPriorityGuard.js"));

let passCount = 0;
let failCount = 0;

function check(name, actualAllowed, expectedAllowed) {
    const pass = actualAllowed === expectedAllowed;
    if (pass) passCount++; else failCount++;
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}: allowed=${actualAllowed}, expect=${expectedAllowed}`);
}

const NOW = 1_700_000_000_000; // mốc thời gian giả định cố định cho toàn bộ test

console.log("=== 9 ACCEPTANCE CASE BẮT BUỘC (Task A7 mục 6) ===\n");

// Case 1: LEGACY_CONTROL + Manual inactive -> BLOCK
{
    const r = Guard.evaluate("LEGACY_CONTROL", { keyActive: false, modActive: false, timestamp: NOW }, "SET_KEY", NOW);
    check("Case 1: LEGACY_CONTROL + Manual inactive + SET_KEY -> BLOCK", r.allowed, false);
}

// Case 2: AI_CONTROL + Manual Key active + SET_KEY -> BLOCK
{
    const r = Guard.evaluate("AI_CONTROL", { keyActive: true, modActive: false, timestamp: NOW }, "SET_KEY", NOW);
    check("Case 2: AI_CONTROL + Key active + SET_KEY -> BLOCK", r.allowed, false);
}

// Case 3: AI_CONTROL + Manual Mod active + SHIFT_KEY -> BLOCK
{
    const r = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: true, timestamp: NOW }, "SHIFT_KEY", NOW);
    check("Case 3: AI_CONTROL + Mod active + SHIFT_KEY -> BLOCK", r.allowed, false);
}

// Case 4: AI_CONTROL + Manual inactive + SET_KEY -> ALLOW
{
    const r = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: NOW }, "SET_KEY", NOW);
    check("Case 4: AI_CONTROL + inactive + SET_KEY -> ALLOW", r.allowed, true);
}

// Case 5: AI_CONTROL + Manual inactive + SHIFT_KEY -> ALLOW
{
    const r = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: NOW }, "SHIFT_KEY", NOW);
    check("Case 5: AI_CONTROL + inactive + SHIFT_KEY -> ALLOW", r.allowed, true);
}

// Case 6: AI_CONTROL + stale ManualState -> BLOCK
{
    const staleTimestamp = NOW - (Guard.STALE_TIMEOUT_MS + 1000); // vượt quá ngưỡng stale
    const r = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: staleTimestamp }, "SET_KEY", NOW);
    check("Case 6: AI_CONTROL + stale ManualState -> BLOCK", r.allowed, false);
}

// Case 7: AI_CONTROL + missing ManualState -> BLOCK
{
    const r = Guard.evaluate("AI_CONTROL", null, "SET_KEY", NOW);
    check("Case 7: AI_CONTROL + missing ManualState -> BLOCK", r.allowed, false);
}

// Case 8: AI_CONTROL + Key active nhưng SHIFT_KEY -> không block (Key không liên quan Mod)
{
    const r = Guard.evaluate("AI_CONTROL", { keyActive: true, modActive: false, timestamp: NOW }, "SHIFT_KEY", NOW);
    check("Case 8: Key active nhưng SHIFT_KEY -> ALLOW (không liên quan)", r.allowed, true);
}

// Case 9: AI_CONTROL + Mod active nhưng SET_KEY -> không block (Mod không liên quan Key)
{
    const r = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: true, timestamp: NOW }, "SET_KEY", NOW);
    check("Case 9: Mod active nhưng SET_KEY -> ALLOW (không liên quan)", r.allowed, true);
}

console.log("\n=== CASE BỔ SUNG (mục 4/9 Task A7 — không nằm trong 9 case bắt buộc) ===\n");

// UPDATE_BPM luôn BLOCK bất kể Manual/ControlSource (mục 4 + mục 9)
{
    const r1 = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: NOW }, "UPDATE_BPM", NOW);
    check("Bonus: UPDATE_BPM luôn BLOCK dù Manual inactive", r1.allowed, false);
    const r2 = Guard.evaluate("LEGACY_CONTROL", null, "UPDATE_BPM", NOW);
    check("Bonus: UPDATE_BPM luôn BLOCK ở LEGACY_CONTROL", r2.allowed, false);
}

// LOAD_NEW_SONG dùng chung nhóm KEY_ACTIONS với SET_KEY (mục 4)
{
    const r1 = Guard.evaluate("AI_CONTROL", { keyActive: true, modActive: false, timestamp: NOW }, "LOAD_NEW_SONG", NOW);
    check("Bonus: LOAD_NEW_SONG + Key active -> BLOCK", r1.allowed, false);
    const r2 = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: NOW }, "LOAD_NEW_SONG", NOW);
    check("Bonus: LOAD_NEW_SONG + inactive -> ALLOW", r2.allowed, true);
}

// timestamp không hợp lệ -> BLOCK fail-safe (mục 3, "không được coi stale là inactive")
{
    const r1 = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: "invalid" }, "SET_KEY", NOW);
    check("Bonus: timestamp không hợp lệ (string) -> BLOCK fail-safe", r1.allowed, false);
    const r2 = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: NaN }, "SET_KEY", NOW);
    check("Bonus: timestamp NaN -> BLOCK fail-safe", r2.allowed, false);
}

// timestamp ở tương lai (đồng hồ lệch) -> BLOCK fail-safe, an toàn hơn ALLOW
{
    const r = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: NOW + 5000 }, "SET_KEY", NOW);
    check("Bonus: timestamp tương lai (đồng hồ lệch) -> BLOCK fail-safe", r.allowed, false);
}

// Ranh giới CHÍNH XÁC ngưỡng stale — vừa đúng ngưỡng vẫn ALLOW, vượt 1ms đã BLOCK
{
    const rAtLimit = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: NOW - Guard.STALE_TIMEOUT_MS }, "SET_KEY", NOW);
    check("Bonus: age đúng bằng STALE_TIMEOUT_MS -> vẫn ALLOW (biên)", rAtLimit.allowed, true);
    const rOverLimit = Guard.evaluate("AI_CONTROL", { keyActive: false, modActive: false, timestamp: NOW - Guard.STALE_TIMEOUT_MS - 1 }, "SET_KEY", NOW);
    check("Bonus: age vượt STALE_TIMEOUT_MS 1ms -> BLOCK (biên)", rOverLimit.allowed, false);
}

console.log(`\n=== KẾT QUẢ: ${passCount} PASS, ${failCount} FAIL / ${passCount + failCount} tổng ===`);
process.exit(failCount > 0 ? 1 : 0);
