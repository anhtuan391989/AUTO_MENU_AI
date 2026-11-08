// TASK AUTO-RELISTEN-01 — chạy: node tests/unit/AutoRelisten01.verify.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../../ui/js/renderer.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

// --- phần 1: chạy THẬT 3 khối code (trạng thái + 2 hàm resolver) trong sandbox ---
function cut(startMarker, endMarker) { const a = src.indexOf(startMarker), b = src.indexOf(endMarker, a); return a < 0 || b < 0 ? "" : src.slice(a, b); }
const stateBlock = cut("const __dbBypass", "let lastPluginKey");
const resolverBlock = cut("function getActiveSourceName()", "// Alias tường minh");
ok(stateBlock.length > 0 && resolverBlock.length > 0, "tìm thấy khối trạng thái + resolver trong renderer.js");
const ctx = { keySource: { manual: { active: false, committedKey: "X" }, songDb: { active: true, value: "C Major" }, ai: { value: "F Major" } } };
vm.createContext(ctx); vm.runInContext(stateBlock + resolverBlock, ctx);
const src_ = () => vm.runInContext("getActiveSourceName()", ctx), key_ = () => vm.runInContext("getActiveKeyValue()", ctx);
ok(src_() === "songDb" && key_() === "C Major", "mặc định: bài có trong Database -> dùng Key Database");
vm.runInContext("__dbBypass.pending = true", ctx);
ok(src_() === "songDb" && key_() === "C Major", "đã bấm nhưng AI chưa chốt -> vẫn Key Database (Auto-Tune không bị lệch)");
vm.runInContext("__dbBypass.pending = false; __dbBypass.active = true", ctx);
ok(src_() === "ai" && key_() === "F Major", "AI chốt xong -> dùng Key AI cho bài này");
ctx.keySource.manual.active = true;
ok(src_() === "manual", "Manual vẫn ưu tiên cao nhất");
ctx.keySource.manual.active = false;
vm.runInContext("__dbBypassClear()", ctx);
ok(src_() === "songDb" && key_() === "C Major", "đổi bài (xoá cờ) -> Database có hiệu lực lại");

// --- phần 2: kiểm tra các điểm nối trong code (không chạy được cả renderer ngoài trình duyệt) ---
ok(/if \(!__autoDetectInternal\) \{ __dbBypass\.active = false; __dbBypass\.pending = !!keySource\.songDb\.active; \}/.test(src), "nút Auto Detect: người dùng bấm -> đánh dấu chờ AI chốt");
ok(/__autoDetectInternal = true;[\s\S]{0,200}autoDetectBtn"\)\?\.click\(\)[\s\S]{0,60}__autoDetectInternal = false/.test(src), "đổi bài tự gọi nút Auto Detect -> KHÔNG bỏ qua Database");
ok(/keySource\.ai\.value = result\.key;\s*\n\s*if \(__dbBypass\.pending\)/.test(src), "AI chốt Key -> bật thay Database");
ok((src.match(/__dbBypassClear\(\)/g) || []).length >= 4, "xoá cờ khi đổi bài / Database miss / khởi động lại AI");
ok(/if \(keySource\.songDb && !keySource\.songDb\.active\) \{\s*\n\s*window\.electronAPI\?\.submitDetectedKey/.test(src), "không gửi Key AI lên Server khi Database đang có bài (Server không bị ghi đè)");
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
