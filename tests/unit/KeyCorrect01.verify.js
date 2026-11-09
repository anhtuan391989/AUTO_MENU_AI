// TASK KEY-CORRECT-01 / 02 — kiểm tra logic tự sửa Key AI (chạy: node tests/unit/KeyCorrect01.verify.js)
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../../ui/js/renderer.js"), "utf8");
const a = src.indexOf("const KEY_CORRECT_HOLD_MS"), b = src.indexOf("function resetAiDisplaysToListening");
if (a < 0 || b < 0) { console.log("FAIL: không tìm thấy khối KEY-CORRECT-01"); process.exit(1); }
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
function make() {
  const log = { applied: 0, mod: 0, refresh: 0 };
  const ctx = { Date: { now: () => ctx.__t }, __t: 0, keyEverDetected: true, activeName: "ai",
    keySource: { ai: { value: "A# Major" }, manual: { sending: false } },
    getActiveSourceName: () => ctx.activeName, refreshKeySourceDisplay: () => log.refresh++,
    applyActiveKeyToPlugin: () => log.applied++, startModulationWatcher: () => log.mod++, aiDiag: () => {}, log };
  vm.createContext(ctx);
  // keyEverDetected phải là biến truy cập được: dùng getter qua globalThis
  vm.runInContext(src.slice(a, b), ctx);
  return ctx;
}
let c = make(); const T = (ms) => { c.__t = ms; };
T(0); c.__keyCorrectionTick("D Major");
T(9000); c.__keyCorrectionTick("D Major");
ok(c.keySource.ai.value === "A# Major", "chưa đủ 10s -> chưa đổi");
T(10000); c.__keyCorrectionTick("D Major");
ok(c.keySource.ai.value === "D Major" && c.log.applied === 1 && c.log.mod === 1, "giữ >=10s -> đổi sang D Major và áp xuống Plugin");
c = make(); T(0); c.__keyCorrectionTick("D Major"); T(5000); c.__keyCorrectionTick("G Minor"); T(12000); c.__keyCorrectionTick("G Minor");
ok(c.keySource.ai.value === "A# Major", "Key dò nhảy qua lại -> đồng hồ đếm lại, không đổi");
c = make(); c.activeName = "manual"; T(0); c.__keyCorrectionTick("D Major"); T(20000); c.__keyCorrectionTick("D Major");
ok(c.keySource.ai.value === "A# Major", "nguồn Manual -> không đổi");
c = make(); c.activeName = "songDb"; T(0); c.__keyCorrectionTick("D Major"); T(20000); c.__keyCorrectionTick("D Major");
ok(c.keySource.ai.value === "A# Major", "nguồn Database -> không đổi");
c = make(); c.keyEverDetected = false; T(0); c.__keyCorrectionTick("D Major"); T(20000); c.__keyCorrectionTick("D Major");
ok(c.keySource.ai.value === "A# Major", "AI chưa từng chốt Key -> không đổi");
c = make(); T(0); c.__keyCorrectionTick("A# Major"); T(20000); c.__keyCorrectionTick("A# Major");
ok(c.log.applied === 0, "Key dò trùng Key đã chốt -> không làm gì");

// --- FIX KEY-CORRECT-02: không tự sửa theo cặp Key láng giềng cách 5 đúng (F <-> A#/Bb) ---
c = make(); T(0); c.__keyCorrectionTick("F Major"); T(30000); c.__keyCorrectionTick("F Major");
ok(c.keySource.ai.value === "A# Major" && c.log.applied === 0, "A# Major đã chốt, dò tạm F Major 30s -> GIỮ A# Major (không đổi sang F)");
c = make(); c.keySource.ai.value = "Bb Major"; T(0); c.__keyCorrectionTick("F Major"); T(30000); c.__keyCorrectionTick("F Major");
ok(c.keySource.ai.value === "Bb Major", "viết kiểu Bb Major cũng được giữ");
c = make(); c.keySource.ai.value = "F Major"; T(0); c.__keyCorrectionTick("A# Major"); T(30000); c.__keyCorrectionTick("A# Major");
ok(c.keySource.ai.value === "F Major", "chiều ngược lại (F chốt, dò tạm A#) cũng giữ");
c = make(); c.keySource.ai.value = "F Minor"; T(0); c.__keyCorrectionTick("A# Minor"); T(30000); c.__keyCorrectionTick("A# Minor");
ok(c.keySource.ai.value === "F Minor", "cặp láng giềng cách 5 chế độ thứ cũng giữ");
c = make(); T(0); c.__keyCorrectionTick("G Minor"); T(10000); c.__keyCorrectionTick("G Minor");
ok(c.keySource.ai.value === "G Minor", "Key thứ tương ứng (A# Major -> G Minor) vẫn được sửa như thường");
c = make(); c.keySource.ai.value = "C Major"; T(0); c.__keyCorrectionTick("F# Major"); T(10000); c.__keyCorrectionTick("F# Major");
ok(c.keySource.ai.value === "F# Major", "Key xa hẳn (C Major -> F# Major) vẫn được sửa như thường");
c = make(); c.keySource.ai.value = "A# Major"; T(0); c.__keyCorrectionTick("A# Minor"); T(10000); c.__keyCorrectionTick("A# Minor");
ok(c.keySource.ai.value === "A# Minor", "cùng chủ âm khác chế độ (Major -> Minor) vẫn được sửa như thường");
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
