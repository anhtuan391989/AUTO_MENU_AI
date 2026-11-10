// TASK MASTER-VU-01 — chạy: node tests/unit/MasterVu01.verify.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const R = (p) => fs.readFileSync(path.join(__dirname, "../../", p), "utf8");
const as = R("ui/js/audioSource.js"), rd = R("ui/js/renderer.js"), st = R("ui/js/setup.js"), ap = R("ui/js/appSettings.js"), html = R("ui/index.html");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

function load(settings, gum) {
  const win = {}; const calls = [];
  const ctx = { window: win, console: { log() {}, warn() {}, error() {} }, performance: { now: () => 1 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    getSetting: (k, d) => (k in settings ? settings[k] : d), setSetting: () => true,
    navigator: { mediaDevices: { getUserMedia: async (c) => { calls.push(c); if (gum) return gum(c); throw Object.assign(new Error("x"), { name: "NotFoundError" }); } } },
    setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(ctx); vm.runInContext(as, ctx);
  return { AS: ctx.window.AudioSource, calls };
}

// 1. Chưa chọn -> NO_DEVICE + level rỗng, không gọi getUserMedia
{ const { AS, calls } = load({}); const m = AS.createDawMasterSource(); const lv = []; m.onLevel((l) => lv.push(l)); m.start();
  ok(m.getState() === "NO_DEVICE" && lv.length === 1 && lv[0].noDevice === true && lv[0].vuPercent === 0 && calls.length === 0, "chưa chọn MASTER Input -> NO_DEVICE, level rỗng, không mở thiết bị"); }
// 2. Đã chọn -> getUserMedia ĐÚNG deviceId master (không phải mic/system)
{ const { AS, calls } = load({ selectedMasterDeviceId: "out12", selectedMicDeviceId: "mic1", selectedSystemAudioDeviceId: "sys1" }); const m = AS.createDawMasterSource(); m.start().then(() => {
    const s = JSON.stringify(calls[0] || {});
    ok(calls.length === 1 && s.includes("out12") && !s.includes("mic1") && !s.includes("sys1"), "đã chọn -> mở ĐÚNG deviceId master, không lẫn MIC/SYSTEM_AUDIO");
    ok(m.getState() === "ERROR" || m.getState() === "NO_DEVICE", "mở thất bại -> ERROR/NO_DEVICE thật, không giả RUNNING"); m.stop(); done(); }); }
// 3. Không rò frame cho AI
{ const { AS } = load({ selectedMasterDeviceId: "out12" }); const m = AS.createDawMasterSource(); let n = 0; m.onFrame(() => n++);
  ok(n === 0 && typeof m.getRawSourceNodeForAdapter === "undefined" && typeof m.getAudioContextForAdapter === "undefined", "MASTER không cấp frame/raw node cho AI (BPM/Key/Mod không bao giờ nghe MASTER)"); }
// 4. Key riêng, mặc định rỗng
ok(/selectedMasterDeviceId:\s*""/.test(ap), "appSettings có key riêng selectedMasterDeviceId mặc định rỗng");
ok(/getMasterDeviceId/.test(as) && /"selectedMasterDeviceId"/.test(as), "audioSource đọc key riêng, không fallback selectedSoundcardId/Mic/System");
const sec = (as.match(/function createDawMasterSource\(\)[\s\S]*?\n    }\n\n    function createMicSource/) || [""])[0];
ok(sec && !/getMicDeviceId|getSystemAudioDeviceId|selectedSoundcardId/.test(sec), "createDawMasterSource không đọc key MIC/SYSTEM/Soundcard");
// 5. Renderer: số thật, nodata khi không có tín hiệu, tự mở lại khi Setup đổi
ok(/masterMeter\.style\.width = Math\.max\(0, Math\.min\(100, vuPercent\)\) \+ "%"/.test(rd), "renderer: Master VU lấy vuPercent thật từ nguồn MASTER");
ok(/masterMeter\.style\.width = "0%"[\s\S]{0,80}vu-bar--nodata/.test(rd), "renderer: NO_DEVICE/mất thiết bị -> 0% + nodata");
ok(/AudioSource\.getMasterDeviceId\(\)[\s\S]{0,400}__dawMasterSource\.stop\(\)[\s\S]{0,80}__dawMasterSource\.start\(\)/.test(rd), "renderer: đổi MASTER Input ở Setup -> stop() rồi start() lại");
const mb = (rd.match(/__dawMasterSource = AudioSource\.createDawMasterSource\(\);[\s\S]*?__dawMasterSource\.start\(\);/) || [""])[0];
ok(mb && !/vu-music-fill|vu-mic-fill/.test(mb), "khối Master VU không mượn dữ liệu MUSIC/MIC");
// 6. Setup: card dựng bằng JS, ghi đúng 1 key
ok(/function initMasterInputSection/.test(st) && /initMasterInputSection\(\);/.test(st), "Setup có card MASTER Input (dựng bằng JS) và được gọi lúc khởi tạo");
ok(/saveSetting\("selectedMasterDeviceId"/.test(st) && !/initMasterInputSection[\s\S]{0,2500}saveSetting\("(selectedMicDeviceId|selectedSystemAudioDeviceId|selectedSoundcardId)"/.test(st), "Setup MASTER chỉ ghi selectedMasterDeviceId");
ok(/"selectedMasterDeviceId"/.test(st.match(/PRESET_FIELDS = \[[\s\S]*?\];/)[0]), "preset lưu/nạp cả selectedMasterDeviceId");
// 7. HTML Menu không đổi
ok(html.includes('id="vu-master-fill"'), "index.html vẫn còn vu-master-fill (không đổi HTML Menu)");
function done() { console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0); }
setTimeout(() => { if (!process.exitCode && pass + fail < 14) done(); }, 500);
