// TASK VI-LABELS-01 + AUDIO-CHILL-FIX-01 — chạy: node tests/unit/ViLabels01.verify.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const R = (p) => fs.readFileSync(path.join(__dirname, "../../", p), "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
const ctx = { console, globalThis: null }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(R("ui/js/i18n.js"), ctx);
const I = ctx.I18N || vm.runInContext("typeof I18N!=='undefined'?I18N:null", ctx);
ok(!!I && typeof I.translate === "function" && typeof I.setLang === "function", "nạp được I18N");
I.setLang("vi");
ok(I.translate("TUNE OFF") === "TẮT TUNE", "[vi] TUNE OFF -> TẮT TUNE");
ok(I.translate("TUNE ON") === "BẬT TUNE", "[vi] TUNE ON -> BẬT TUNE");
ok(I.translate("EFFECT") === "HIỆU ỨNG", "[vi] EFFECT -> HIỆU ỨNG");
ok(I.translate("ON") === "BẬT" && I.translate("OFF") === "TẮT", "[vi] ON -> BẬT, OFF -> TẮT");
ok(["NORM", "LOFI", "RAP", "REMIX"].every((n) => I.translate(n) === null), "[vi] NORM/LOFI/RAP/REMIX vẫn không bị dịch");
I.setLang("en");
ok(I.translate("TẮT TUNE") === "TUNE OFF" && I.translate("BẬT TUNE") === "TUNE ON", "[en] TẮT TUNE/BẬT TUNE -> TUNE OFF/TUNE ON");
ok(I.translate("EFFECT") === null && I.translate("ON") === null && I.translate("OFF") === "OFF" || I.translate("OFF") === null, "[en] EFFECT/ON/OFF giữ nguyên tiếng Anh");
const rd = R("ui/js/renderer.js");
ok(/\["TUNE OFF", "TẮT TUNE", "TUNE ON", "BẬT TUNE"\]\.includes\(b\.textContent\.trim\(\)\)/.test(rd), "renderer nhận nút TUNE theo mọi biến thể chữ (data-tune-btn), không phụ thuộc bản dịch");
ok(/btn\.textContent = tuneOn \? "TUNE ON" : "TUNE OFF"/.test(rd), "logic TUNE giữ nguyên (chữ gốc, i18n dịch lúc hiển thị)");
// Audio Chill kiểu bypass (như LOFI)
const ar = R("ui/js/actionRegistry.js");
ok(/AUDIO_CHILL: Object\.freeze\(\{[^}]*values: Object\.freeze\(\{ on: 0, off: 127 \}\)/.test(ar), "AUDIO CHILL: nút SÁNG (bật) gửi 0, TẮT gửi 127 (cùng kiểu LOFI)");
ok(/LOFI: Object\.freeze\(\{[^}]*values: Object\.freeze\(\{ on: 0, off: 127 \}\)/.test(ar), "LOFI không đổi (on 0 / off 127)");
ok(/TUNE: Object\.freeze\(\{[^}]*values: Object\.freeze\(\{ on: 127, off: 0 \}\)/.test(ar), "TUNE không đổi");
const html = R("ui/index.html");
ok(/<button class="preset-btn">TUNE OFF<\/button>/.test(html) && />EFFECT<\/span>/.test(html), "index.html KHÔNG đổi (nút vẫn khai báo TUNE OFF / EFFECT)");
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
