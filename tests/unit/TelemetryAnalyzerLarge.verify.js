/**
 * AI-RUNTIME-VERIFY-01 — hồi quy: scripts/analyzeTelemetry.js phải xử lý mảng rất lớn.
 * Trước bản sửa, distributionStats dùng Math.min(...arr) => RangeError với log ~150k dòng.
 * Chạy: node tests/unit/TelemetryAnalyzerLarge.verify.js
 * Không ghi file nào, không đọc logs/.
 */
const assert = require("assert");
const path = require("path");
const analyzer = require(path.resolve(__dirname, "../../scripts/analyzeTelemetry.js"));

let fail = 0;
function check(cond, msg) {
    try { assert.ok(cond, msg); console.log("  OK   " + msg); }
    catch (e) { fail++; console.log("  FAIL " + msg); }
}

const N = 500000;
const big = new Array(N);
for (let i = 0; i < N; i++) big[i] = (i % 1000) / 10 - 20; // min -20, max 79.9
let s = null, threw = null;
try { s = analyzer.distributionStats(big); } catch (e) { threw = e; }

check(!threw, "distributionStats(500000 phần tử) không ném lỗi" + (threw ? " — " + threw.message : ""));
check(s && s.count === N, "count = 500000");
check(s && s.min === -20, "min đúng (-20)");
check(s && Math.abs(s.max - 79.9) < 1e-9, "max đúng (79.9)");

const small = analyzer.distributionStats([3, "x", NaN, 1, 2]);
check(small && small.count === 3 && small.min === 1 && small.max === 3, "mảng nhỏ + giá trị rác: lọc đúng, min=1 max=3");
check(analyzer.distributionStats([]) === null, "mảng rỗng trả null");

console.log(`\n== KẾT QUẢ: ${fail === 0 ? "TẤT CẢ PASS" : fail + " FAIL"} ==`);
process.exit(fail === 0 ? 0 : 1);
