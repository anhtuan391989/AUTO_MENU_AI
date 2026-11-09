// TASK AUTO-DETECT-TRUST-01 — chạy: node tests/unit/AutoDetectTrust01.verify.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../../ui/js/renderer.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
function cut(a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); return i < 0 || j < 0 ? "" : src.slice(i, j); }
const gate = cut("const AUTO_DETECT_DB_OVERRIDE_MIN_CONF", "let lastPluginKey");
const kc = cut("const __KC_PC", "function __keyCorrectionTick");
ok(gate.length > 0 && kc.length > 0, "tìm thấy khối gate + luật láng giềng cách 5");
const ctx = {}; vm.createContext(ctx); vm.runInContext(kc + gate, ctx);
const v = (k, c, d) => vm.runInContext(`__aiBeatsDatabase(${JSON.stringify(k)}, ${c}, ${JSON.stringify(d)})`, ctx);
ok(v("E Major", 0.90, "C Major").ok === true, "AI khác DB + tin cậy 0.90 -> AI thay Database");
ok(v("E Major", 0.85, "C Major").ok === true, "đúng ngưỡng 0.85 -> AI thay Database");
ok(v("E Major", 0.84, "C Major").why === "low-confidence", "0.84 < ngưỡng -> giữ Database");
ok(v("C Major", 0.99, "C Major").why === "same-as-db", "AI trùng DB -> giữ Database (không đổi gì)");
ok(v("F Major", 0.95, "A# Major").why === "fifth-neighbor", "F vs A# (cách 5) -> giữ Database");
ok(v("E Major", NaN, "C Major").ok === false && v("E Major", undefined, "C Major").ok === false, "confidence NaN/undefined -> giữ Database");
ok(v("E Major", 0.95, null).ok === false, "không có Key Database -> không áp dụng");
ok(/if \(__dbBypass\.pending\) \{[\s\S]{0,200}__dbBypass\.pending = false;[\s\S]{0,200}__aiBeatsDatabase\(result\.key, result\.confidence, keySource\.songDb\.value\)/.test(src), "điểm chốt Key AI gọi gate trước khi bật bypass");
ok(/DB_BYPASS_REJECTED/.test(src), "có log DB_BYPASS_REJECTED khi giữ Database");
ok(/source === "songDb" && __dbBypass\.pending\) \? "LISTENING"/.test(src), "bài Database + đang dò lại -> ô Key hiện LISTENING");
ok(/getActiveSourceName\(\) === "songDb" && keySource\.songDb\.value\) \? " - " \+ keySource\.songDb\.value/.test(src), "ACTIVE: DATABASE - <Key> luôn hiện khi nguồn là Database");
ok(/DB_BYPASS_REJECTED[\s\S]{0,300}applyActiveKeyToPlugin\("Song Database"\)/.test(src), "AI không đủ tin cậy -> ô Key trả về Key Database");
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
