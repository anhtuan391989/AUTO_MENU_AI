/**
 * AI-RUNTIME-VERIFY-02 — kiểm tra công cụ ghi kết quả + đọc lại bằng bộ chấm.
 * Dữ liệu MÔ PHỎNG trong thư mục tạm (KHÔNG phải kết quả nhạc thật, không đụng results.csv thật).
 * Chạy: node tests/unit/RuntimeVerifyRecorder.verify.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const RV = path.resolve(__dirname, "../calibration/runtime-verify");
const S = require(path.join(RV, "score_runtime_verify.js"));
const R = require(path.join(RV, "record_result.js"));
const cp = require("child_process");

let fail = 0;
function check(c, m) { try { assert.ok(c, m); console.log("  OK   " + m); } catch (e) { fail++; console.log("  FAIL " + m); } }
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rv2-"));
const truthFile = path.join(RV, "ground_truth.csv");
const ids = S.parseCsv(fs.readFileSync(truthFile, "utf-8")).map((r) => r.id);
const file = path.join(tmp, "results.csv");

console.log("== 1. Schema & 13 ID ==");
check(ids.length === 13 && ids[0] === "S01" && ids[12] === "S13", "ground_truth có đúng 13 ID S01–S13");
const real = fs.readFileSync(path.join(RV, "results.csv"), "utf-8");
const tpl = fs.readFileSync(path.join(RV, "results_template.csv"), "utf-8");
check(S.csvHeader(real).join() === S.RESULT_COLUMNS.join() && S.csvHeader(tpl).join() === S.RESULT_COLUMNS.join(), "results.csv và results_template.csv cùng schema với bộ chấm");
check(S.parseCsv(real).map((r) => r.id).join() === ids.join(), "results.csv chuẩn có đúng 13 ID đúng thứ tự");

console.log("== 2. Ghi / lưu / đọc lại ==");
R.setRow(file, ids, "S01", { key: "A major", bpm: "169", lock: "4.4", level: "yes", notes: "thử" }, false);
let rows = S.parseCsv(fs.readFileSync(file, "utf-8"));
check(rows.length === 13 && rows[0].shown_key === "A major" && rows[0].shown_bpm === "169" && rows[0].t_lock_s === "4.4", "file mới tự tạo đủ 13 hàng; S01 đọc lại đúng");

console.log("== 3. Bộ chấm đọc đúng dữ liệu đã lưu ==");
const truth = S.parseCsv(fs.readFileSync(truthFile, "utf-8"));
let sc = S.score(truth, rows, null);
check(sc[0].keyClass === "EXACT" && sc[0].bpmClass === "OK" && sc[0].tLock === 4.4, "S01 (A major/169/4.4s) chấm EXACT + OK + 4.4s");

console.log("== 4. Hàng trống = chưa kiểm thử ==");
check(sc.slice(1).every((x) => x.untested && x.cause === "CHUA_KIEM_THU"), "12 hàng trống => CHUA_KIEM_THU");
const sum = S.summarize(sc);
check(sum.tested === 1 && sum.untested === 12 && sum.keyTotal === 1 && sum.keyExact === 1, "chỉ tính 1 bài đã thử; 12 bài chưa thử không làm sai/đúng");
const allBlank = S.summarize(S.score(truth, S.parseCsv(real), null));
check(allBlank.tested === 0 && allBlank.keyTotal === 0 && allBlank.bpmTotal === 0, "results.csv thật hiện trống => 0 bài đã kiểm thử, không có tỉ lệ giả");

console.log("== 5. Dữ liệu sai / ký tự đặc biệt ==");
check(throws(() => R.setRow(file, ids, "S99", { key: "A major" }, false)), "ID ngoài bảng bị từ chối");
check(throws(() => R.setRow(file, ids, "S02", { key: "xyz" }, false)), "Key sai định dạng bị từ chối");
check(throws(() => R.setRow(file, ids, "S02", { bpm: "abc" }, false)) && throws(() => R.setRow(file, ids, "S02", { bpm: "5" }, false)), "BPM không phải số / ngoài 20–300 bị từ chối");
check(throws(() => R.setRow(file, ids, "S02", { lock: "-3" }, false)) && throws(() => R.setRow(file, ids, "S02", { level: "maybe" }, false)), "LOCK âm / level lạ bị từ chối");
check(throws(() => R.setRow(file, ids, "S02", {}, false)), "không có giá trị nào => từ chối");
const weird = 'Nhạc "live", có dấu phẩy\nxuống dòng; ✅';
R.setRow(file, ids, "S02", { key: "F# minor", bpm: "67.5", notes: weird }, false);
rows = S.parseCsv(fs.readFileSync(file, "utf-8"));
check(rows[1].notes === 'Nhạc "live", có dấu phẩy xuống dòng; ✅' && rows.length === 13 && rows[1].level_ok === "", "ghi chú có dấu phẩy, dấu \", xuống dòng, emoji lưu và đọc lại nguyên vẹn (xuống dòng -> dấu cách)");
check(R.csvEscape('a,b') === '"a,b"' && R.csvEscape('x"y') === '"x""y"', "csvEscape trích dẫn đúng");

console.log("== 6. Chạy lại không mất dữ liệu ==");
check(throws(() => R.setRow(file, ids, "S01", { key: "C major" }, false)), "ghi đè S01 không có --force bị chặn");
check(S.parseCsv(fs.readFileSync(file, "utf-8"))[0].shown_key === "A major", "S01 vẫn là A major sau khi bị chặn");
const r = R.setRow(file, ids, "S01", { key: "C major" }, true);
check(r.bak && fs.existsSync(r.bak) && S.parseCsv(fs.readFileSync(r.bak, "utf-8"))[0].shown_key === "A major", "--force: bản sao lưu giữ nguyên dữ liệu cũ (A major)");
check(S.parseCsv(fs.readFileSync(file, "utf-8"))[0].shown_key === "C major" && S.parseCsv(fs.readFileSync(file, "utf-8"))[1].shown_key === "F# minor", "S01 đã đổi, S02 không bị ảnh hưởng");
fs.writeFileSync(file, fs.readFileSync(file, "utf-8") + "X1,B major,,,,,hàng ngoài danh sách\n");
R.setRow(file, ids, "S03", { key: "C# minor" }, false);
check(S.parseCsv(fs.readFileSync(file, "utf-8")).some((x) => x.id === "X1"), "hàng lạ (ngoài S01–S13) được giữ lại, không bị xoá");
fs.writeFileSync(path.join(tmp, "bad.csv"), "Tên bài,Key phát hiện\nS01,C Major\n");
check(throws(() => R.load(path.join(tmp, "bad.csv"), ids)), "file sai cột bị từ chối, không bị ghi đè");

console.log("== 7. Chuyển file cũ (cột tiếng Việt) ==");
const legacy = path.join(RV, "../../../results.csv");
const legacyCopy = path.join(tmp, "legacy.csv");
fs.copyFileSync(legacy, legacyCopy);
const before = fs.readFileSync(legacyCopy, "utf-8");
const dst = path.join(tmp, "migrated.csv");
const imp = R.importLegacy(dst, legacyCopy, ids);
const mig = S.parseCsv(fs.readFileSync(dst, "utf-8"));
check(imp.done.length === 4 && mig.length === 13 && mig[0].shown_key === "C Major" && mig[0].shown_bpm === "120" && mig[0].t_lock_s === "3.2" && mig[0].level_ok === "yes", "import-legacy: S01 → key/bpm/lock/level đúng schema chuẩn");
check(mig[2].shown_key === "" && mig[2].level_ok === "no" && mig[2].notes.includes("[import-legacy]"), "S03 (không có tín hiệu) → level_ok=no, đánh dấu [import-legacy]");
check(fs.readFileSync(legacyCopy, "utf-8") === before, "file cũ không bị sửa");
const imp2 = R.importLegacy(dst, legacyCopy, ids);
check(imp2.done.length === 0, "import lần 2 không ghi đè hàng đã có");

console.log("== 8. CLI end-to-end + bộ chấm từ chối file sai schema ==");
const cli = (args) => cp.spawnSync(process.execPath, [path.join(RV, "record_result.js"), ...args, "--file", path.join(tmp, "cli.csv")], { encoding: "utf-8" });
let o = cli(["set", "S04", "--key", "C minor", "--bpm", "105", "--lock", "6"]);
check(o.status === 0, "CLI set S04 thành công");
o = cli(["set", "S04", "--key", "D minor"]);
check(o.status === 1 && /không ghi đè/.test(o.stderr), "CLI chặn ghi đè");
o = cli(["status"]);
check(/Tổng: 1\/13/.test(o.stdout), "CLI status: 1/13 bài có dữ liệu");
const sc2 = cp.spawnSync(process.execPath, [path.join(RV, "score_runtime_verify.js"), "--truth", truthFile, "--results", legacy], { encoding: "utf-8" });
check(sc2.status === 3 && /sai định dạng/.test(sc2.stderr), "bộ chấm báo lỗi rõ khi nhận file cũ sai cột (không im lặng)");
const sc3 = cp.spawnSync(process.execPath, [path.join(RV, "score_runtime_verify.js"), "--truth", truthFile, "--results", path.join(tmp, "cli.csv")], { encoding: "utf-8" });
check(sc3.status === 0 && /Đã kiểm thử: 1\/13/.test(sc3.stdout), "bộ chấm đọc file do CLI ghi: 1/13 đã kiểm thử");

console.log(`\n== KẾT QUẢ: ${fail === 0 ? "TẤT CẢ PASS" : fail + " FAIL"} ==`);
process.exit(fail === 0 ? 0 : 1);
