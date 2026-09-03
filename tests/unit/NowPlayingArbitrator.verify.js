/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng NowPlayingArbitrator
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/NowPlayingArbitrator.verify.js
 *
 * Module test là PURE FUNCTION (không I/O) nên kiểm chứng được ĐẦY ĐỦ
 * mọi nhánh logic thật trên bất kỳ hệ điều hành nào — không có phần
 * nào cần đánh dấu "NODE TEST PASS" khác với thực tế Windows, vì bản
 * thân hàm này không phụ thuộc process.platform/HTTP/PowerShell.
 * ==========================================================
 */

const assert = require("assert");

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

const { resolveActiveSource } = require("../../core/integration/NowPlayingArbitrator");

function smtc(overrides = {}) {
    return { application: "brave.exe", title: "Bài SMTC", artist: "Ca sĩ SMTC", ...overrides };
}

function mpc(state, overrides = {}) {
    return { application: "mpc-hc", title: "Bài MPC-HC", artist: null, filePath: "F:\\karaoke\\x.mp4", state, ...overrides };
}

console.log("=== PHẦN A: Không nguồn nào có gì ===");
check(resolveActiveSource(null, null) === null, "Cả 2 null -> kết quả null");

console.log("=== PHẦN B: Chỉ 1 nguồn có dữ liệu ===");
{
    const r = resolveActiveSource(smtc(), null);
    check(r && r.source === "smtc" && r.snapshot.title === "Bài SMTC", "Chỉ SMTC có -> dùng SMTC");
}
{
    const r = resolveActiveSource(null, mpc(2));
    check(r && r.source === "mpc-hc", "Chỉ MPC-HC có (Playing) -> dùng MPC-HC");
}
{
    const r = resolveActiveSource(null, mpc(1));
    check(r && r.source === "mpc-hc", "Chỉ MPC-HC có (Paused, không Stopped) -> vẫn dùng tạm MPC-HC vì SMTC không có gì");
}

console.log("=== PHẦN C: Cả 2 nguồn cùng có dữ liệu — quy tắc ưu tiên ===");
{
    const r = resolveActiveSource(smtc(), mpc(2));
    check(r && r.source === "mpc-hc", "MPC-HC đang Playing (state=2) -> MPC-HC THẮNG dù SMTC cũng có snapshot");
}
{
    const r = resolveActiveSource(smtc(), mpc(1));
    check(r && r.source === "smtc", "MPC-HC chỉ Paused (state=1, không Playing) -> ưu tiên SMTC");
}
{
    const r = resolveActiveSource(smtc(), mpc(0));
    check(r && r.source === "smtc", "MPC-HC Stopped (state=0) -> ưu tiên SMTC");
}

console.log("=== PHẦN D: Deterministic — không phụ thuộc thứ tự gọi, không random ===");
{
    const smtcSnap = smtc();
    const mpcSnap = mpc(2);
    const a = resolveActiveSource(smtcSnap, mpcSnap);
    const b = resolveActiveSource(smtcSnap, mpcSnap);
    check(a.source === b.source && a.snapshot === b.snapshot, "Gọi nhiều lần cùng input -> luôn ra cùng 1 kết quả (không random)");
}

console.log("=== PHẦN E: state lạ/không hợp lệ trong snapshot MPC-HC (đề phòng dữ liệu hỏng lọt qua) ===");
{
    // Lưu ý: MpcHcSession.js đã lọc state lạ ở tầng thu thập (không tạo snapshot nếu
    // state không phải 0/1/2) — test này chỉ đảm bảo arbitrator KHÔNG crash và xử lý
    // an toàn (coi như "không Playing") nếu lỡ có state khác lọt tới, phòng thủ 2 lớp.
    const r = resolveActiveSource(smtc(), mpc(99));
    check(r && r.source === "smtc", "state lạ (không phải 0/1/2) -> KHÔNG coi là Playing, ưu tiên SMTC, không throw");
}

console.log("\n" + (failCount === 0 ? "✅ TẤT CẢ TEST PASS" : `❌ CÓ ${failCount} TEST FAIL`));
process.exit(failCount === 0 ? 0 : 1);
