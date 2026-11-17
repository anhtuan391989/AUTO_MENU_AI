// TASK AUTO-DETECT-COMPLETE-01 — chạy: node tests/unit/AutoDetectComplete01.verify.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../../ui/js/renderer.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
function cut(a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); return i < 0 || j < 0 ? "" : src.slice(i, j); }
const blk = cut("const __dbBypass = {", "// TASK AUTO-DETECT-TRUST-01");
ok(blk.includes("__dbPendingTimerStart"), "tìm thấy khối pending + timer");

// Chạy thật khối timer với đồng hồ giả
let timers = [], now = 0, nextId = 1;
const log = [], calls = { refresh: 0, plugin: [] };
const ctx = {
  __aiCycleGen: 1, keySource: { songDb: { value: "G Major", active: true } },
  aiDiag: (n, d) => log.push([n, d]), refreshKeySourceDisplay: () => calls.refresh++,
  getActiveSourceName: () => "songDb", applyActiveKeyToPlugin: (r) => calls.plugin.push(r),
  setTimeout: (fn, ms) => { const id = nextId++; timers.push({ id, fn, at: now + ms }); return id; },
  clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
};
vm.createContext(ctx); vm.runInContext(blk, ctx);
const run = (c) => vm.runInContext(c, ctx);
const advance = (ms) => { now += ms; timers.filter((t) => t.at <= now).forEach((t) => { timers = timers.filter((x) => x.id !== t.id); t.fn(); }); };

run("__dbBypass.pending = true; __dbPendingTimerStart();");
advance(29000); ok(run("__dbBypass.pending") === true, "29s: vẫn chờ AI");
advance(2000);
ok(run("__dbBypass.pending") === false, "30s: AI không chốt -> thôi chờ, ô Key hết kẹt LISTENING");
ok(log.some((l) => l[0] === "DB_BYPASS_TIMEOUT"), "có log DB_BYPASS_TIMEOUT");
ok(calls.refresh === 1 && calls.plugin[0] === "Song Database", "trả ô Key về Key Database");
ok(run("__dbBypass.active") === false, "không bật bypass (giữ Database)");

// AI chốt kịp -> timer bị huỷ, không chạy
log.length = 0; calls.refresh = 0;
run("__dbBypass.pending = true; __dbPendingTimerStart();"); advance(5000);
run("__dbBypass.pending = false; __dbPendingTimerStop();"); advance(60000);
ok(!log.some((l) => l[0] === "DB_BYPASS_TIMEOUT") && calls.refresh === 0, "AI chốt trước hạn -> timer huỷ, không làm gì thêm");

// Đổi bài giữa chừng -> __dbBypassClear huỷ timer
run("__dbBypass.pending = true; __dbPendingTimerStart();"); run("__dbBypassClear();"); advance(60000);
ok(!log.some((l) => l[0] === "DB_BYPASS_TIMEOUT"), "đổi bài/clear -> timer huỷ");

// Bấm lại Auto Detect -> chỉ 1 timer
timers = []; run("__dbBypass.pending = true; __dbPendingTimerStart(); __dbPendingTimerStart();");
ok(timers.length === 1, "bấm nhiều lần -> chỉ 1 timer chạy");

// Cycle gen đổi (bài mới) -> timer cũ bỏ qua
log.length = 0; run("__dbBypass.pending = true; __dbPendingTimerStart();"); ctx.__aiCycleGen = 2; advance(60000);
ok(!log.some((l) => l[0] === "DB_BYPASS_TIMEOUT"), "sang chu trình mới -> timer cũ không đụng trạng thái bài mới");

// Nối dây trong renderer
ok(/__dbBypass\.pending = !!keySource\.songDb\.active; if \(__dbBypass\.pending\) __dbPendingTimerStart\(\)/.test(src), "nút Auto Detect bật timer khi bài Database");
ok(/__dbBypass\.pending = false; __dbPendingTimerStop\(\);\s*const __v = __aiBeatsDatabase/.test(src), "điểm AI chốt Key huỷ timer");
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
