/**
 * AI-RUNTIME-VERIFY-01 — kiểm tra bộ chấm điểm bằng dữ liệu MÔ PHỎNG có đáp số biết trước.
 * (Đây là test của công cụ chấm, KHÔNG phải kết quả runtime của engine.)
 * Chạy: node tests/unit/RuntimeVerifyScorer.verify.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const S = require(path.resolve(__dirname, "../calibration/runtime-verify/score_runtime_verify.js"));

let fail = 0;
function check(c, m) { try { assert.ok(c, m); console.log("  OK   " + m); } catch (e) { fail++; console.log("  FAIL " + m); } }

console.log("== normKey ==");
const k = S.normKey;
check(k("F# minor").pc === 6 && k("F♯ Minor").pc === 6 && k("Gb minor").pc === 6, "F#/F♯/Gb cùng pitch class 6");
check(k("Am").mode === "minor" && k("A").mode === "major", "Am=minor, A=major");
check(k("Ab major").pc === 8 && k("G# Major").pc === 8, "Ab = G# (pc 8)");
check(k("xyz") === null && k("") === null, "chuỗi lạ/rỗng => null");

console.log("== classifyKey ==");
check(S.classifyKey("A minor", "A minor", []) === "EXACT", "đúng tuyệt đối");
check(S.classifyKey("C major", "A minor", []) === "RELATIVE", "tương đối thứ->trưởng");
check(S.classifyKey("A minor", "C major", []) === "RELATIVE", "tương đối trưởng->thứ");
check(S.classifyKey("C major", "D minor", ["C major"]) === "ALT_ACCEPTED", "thang âm tương đương (Dorian) chấp nhận");
check(S.classifyKey("E minor", "A minor", []) === "FIFTH", "lệch quãng 5");
check(S.classifyKey("A major", "A minor", []) === "PARALLEL", "cùng chủ âm khác mode");
check(S.classifyKey("C# major", "A minor", []) === "WRONG", "sai hẳn");
check(S.classifyKey("", "A minor", []) === "NO_RESULT", "không có kết quả");

console.log("== classifyBpm ==");
check(S.classifyBpm("118", "117", "") === "OK" && S.classifyBpm("115", "117", "") === "OK", "trong ±2");
check(S.classifyBpm("85", "169", "") === "HALF", "nửa nhịp");
check(S.classifyBpm("134", "67.5", "") === "DOUBLE", "gấp đôi nhịp");
check(S.classifyBpm("63", "190", "63") === "OK", "BPM thay thế (bpm_alt) được chấp nhận");
check(S.classifyBpm("100", "117", "") === "WRONG", "sai khác");
check(S.classifyBpm("", "117", "") === "NO_RESULT", "không có kết quả");

console.log("== chấm cả bảng + log mô phỏng ==");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rv-"));
// log mô phỏng: phiên 1 khoá C Major @4.5s rồi A Minor @9s; phiên 2 toàn conf=0 không LOCK; phiên 3 khoá F Minor @7s
const rec = (time, conf) => JSON.stringify({ time, top1: "C Major", confidence: conf, votes: 0, locked: false });
const lines = [
    rec(1.5, 0.9), rec(3, 0.9), JSON.stringify({ event: "LOCK", time: 4.5, key: "C Major" }), JSON.stringify({ event: "LOCK", time: 9, key: "A Minor" }),
    rec(1.5, 0), rec(3, 0), rec(4.5, 0), rec(6, 0),
    rec(1.5, 0.8), JSON.stringify({ event: "LOCK", time: 7, key: "F Minor" })
];
const logFile = path.join(tmp, "sim.jsonl"); fs.writeFileSync(logFile, lines.join("\n"));
const sess = S.sessionsFromLog(logFile);
check(sess.length === 3, "tách đúng 3 phiên từ log mô phỏng (thực tế: " + sess.length + ")");
check(sess[0].firstLockTime === 4.5 && sess[0].finalLockKey === "A Minor" && sess[0].lockCount === 2, "phiên 1: LOCK đầu 4.5s, LOCK cuối A Minor");
check(sess[1].lockCount === 0 && sess[1].zeroConfRatio === 1, "phiên 2: không LOCK, 100% conf=0");

const truth = S.parseCsv("id,title,artist,key,key_alt,bpm,bpm_alt\nT1,a,x,A minor,,120,\nT2,b,x,D minor,C major,100,\nT3,c,x,F minor,,160,\nT4,d,x,G major,,90,\nT5,e,x,E minor,,80,");
const res = S.parseCsv("id,shown_key,shown_bpm,session,t_lock_s,level_ok\nT1,,121,1,,\nT2,C major,50,,6,\nT3,,,2,,\nT4,,,,,no\nT5,,,,,");
const rows = S.score(truth, res, sess);
const by = Object.fromEntries(rows.map((r) => [r.t.id, r]));
check(by.T1.keyClass === "EXACT" && by.T1.keySrc.startsWith("log") && by.T1.tLock === 4.5 && by.T1.bpmClass === "OK", "T1: Key lấy từ log (LOCK cuối), tLock từ log, BPM OK");
check(by.T2.keyClass === "ALT_ACCEPTED" && by.T2.bpmClass === "HALF" && by.T2.tLock === 6 && by.T2.cause === "BPM_HALF", "T2: ALT + nửa nhịp + tLock nhập tay");
check(by.T3.keyClass === "NO_RESULT" && by.T3.cause.startsWith("NGUON_AM_QUA_NHO"), "T3: phiên toàn conf=0 không LOCK => NGUON_AM_QUA_NHO");
check(by.T4.cause.startsWith("NGUON_AM_QUA_NHO"), "T4: level_ok=no => NGUON_AM_QUA_NHO");
check(by.T5.cause.startsWith("KHONG_DU_DU_LIEU"), "T5: trống => KHONG_DU_DU_LIEU (tách riêng khỏi nguồn nhỏ)");

const sum = S.summarize(rows);
check(sum.keyTotal === 5 && sum.keyExact === 1 && sum.keyExactAlt === 2, "tổng hợp Key: 1 exact, 2 exact+ALT / 5");
check(sum.bpmTotal === 5 && sum.bpmOk === 1 && sum.bpmHalf === 1, "tổng hợp BPM: 1 OK, 1 nửa nhịp");
check(sum.lockMedian === 5.25 && sum.lockCount === 2, "trung vị LOCK = median(4.5, 6) = 5.25");
check(sum.quiet === 2 && sum.insufficient === 1, "đếm: 2 nguồn nhỏ, 1 thiếu dữ liệu");
check(S.report(rows, sum).includes("Tổng hợp"), "report() sinh Markdown");

console.log("== bảng đáp án thật ==");
const gt = S.parseCsv(fs.readFileSync(path.resolve(__dirname, "../calibration/runtime-verify/ground_truth.csv"), "utf-8"));
check(gt.length >= 10, "ground_truth.csv có >= 10 bài (thực tế: " + gt.length + ")");
check(gt.every((r) => r.key ? S.normKey(r.key) : true), "mọi Key trong bảng đều parse được");
check(gt.filter((r) => r.key && r.bpm).length >= 7, ">= 7 bài có đủ cả Key và BPM");

console.log(`\n== KẾT QUẢ: ${fail === 0 ? "TẤT CẢ PASS" : fail + " FAIL"} ==`);
process.exit(fail === 0 ? 0 : 1);
