// TASK DB-COMPETE-01 — chạy: node tests/unit/DbCompete01.verify.js
// Bài lấy Key từ Database/Server: AI tự cạnh tranh (không cần bấm Auto Detect); AI chốt đáng tin hơn thì thay Database.
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../../ui/js/renderer.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
function cut(a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); return i < 0 || j < 0 ? "" : src.slice(i, j); }

const stateBlock = cut("const __dbBypass", "let lastPluginKey");                         // __dbBypass + __aiBeatsDatabase
const fifthBlock = cut("const __KC_PC", "function __keyCorrectionTick");                  // __keyIsFifthNeighbor
const resolverBlock = cut("function getActiveSourceName()", "// Alias tường minh");
const competeBlock = cut("// TASK DB-COMPETE-01 — bài lấy Key từ Database", "        if (typeof __aiMemoryRemember"); // đoạn mới trong callback detectOnce
ok(stateBlock && fifthBlock && resolverBlock && competeBlock, "tìm thấy các khối code thật trong renderer.js");

function run(songDb, manual, key, conf) {
    const ctx = { keySource: { manual, songDb, ai: { value: key } }, result: { key, confidence: conf }, logs: [], aiDiag: (n) => ctx.logs.push(n) };
    vm.createContext(ctx);
    vm.runInContext(fifthBlock + stateBlock + resolverBlock + competeBlock, ctx);
    return { src: vm.runInContext("getActiveSourceName()", ctx), active: vm.runInContext("__dbBypass.active", ctx), logs: ctx.logs };
}
const db = (v) => ({ active: true, value: v });
const noManual = { active: false, sending: false };

let r = run(db("G Major"), noManual, "A Major", 0.9);
ok(r.active && r.src === "ai", "Database G Major, AI chốt A Major (0.90) -> AI thay Database, KHÔNG cần bấm Auto Detect");
ok(r.logs.includes("DB_BYPASS_AUTO_ON"), "ghi log DB_BYPASS_AUTO_ON");
r = run(db("G Major"), noManual, "A Major", 0.8);
ok(!r.active && r.src === "songDb", "AI chốt nhưng tin cậy thấp (0.80 < 0.85) -> giữ Key Database");
r = run(db("G Major"), noManual, "G Major", 0.95);
ok(!r.active && r.src === "songDb", "AI trùng Key Database -> giữ Database (không đổi nguồn)");
r = run(db("G Major"), noManual, "C Major", 0.95);
ok(!r.active && r.src === "songDb", "AI ra Key láng giềng cách 5 (C vs G) -> giữ Database (luật KEY-CORRECT-02)");
r = run(db("G Major"), { active: true, sending: false }, "A Major", 0.95);
ok(!r.active && r.src === "manual", "Manual đang bật -> AI không chen vào, Manual vẫn cao nhất");
r = run(db("G Major"), { active: false, sending: true }, "A Major", 0.95);
ok(!r.active, "lệnh SEND Manual đang bay -> AI không chen vào");
r = run({ active: false, value: null }, noManual, "A Major", 0.95);
ok(!r.active && r.src === "ai", "bài mới không có trong Database -> đường AI bình thường, không đụng cờ bypass");

// Hiển thị: nguồn Database chưa có kết quả AI thật -> dòng AI Detect hiện LISTENING (không hiện Key hạt giống)
ok(/!keyEverDetected && !keySource\.ai\.provisional && getActiveSourceName\(\) !== "manual"\)/.test(src), "dòng AI Detect: nguồn Database cũng hiện LISTENING khi AI chưa dò được");
// Không ghi gì lên Server trong đoạn mới
ok(!/submitDetectedKey|correctServerKey/.test(competeBlock), "đoạn mới KHÔNG ghi lên Key Server");
// Không đụng KeyEngine / HTML
ok(!/KeyEngine\./.test(competeBlock), "đoạn mới KHÔNG gọi/sửa KeyEngine");

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
