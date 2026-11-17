// TASK AUTO-KEY-MIDI-02 — chạy: node tests/unit/AutoKeyMidiManualExit02.verify.js (MÔ PHỎNG, không gửi MIDI/click thật)
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "../.."); const rd = (f) => fs.readFileSync(path.join(root, f), "utf8");
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x)); } };
const src = rd("ui/js/renderer.js");
const dm = /const __AI_CORE_DEFAULT[\s\S]*?try \{ setInterval/.exec(src), am = /const __autoKeyRun[\s\S]*?\nfunction restartAiForNewSong/.exec(src);
ok(!!dm && !!am, "tìm thấy cấu hình + runAutoKeyDetect");
function make(o) {
  const clicks = [], midi = []; const ctx = { t: 100000, console: { log() {} }, Date: (function(){ const F = function () { return new Date(); }; F.now = () => ctx.t; return F; })(),
    window: { electronAPI: { loadSettingsSync: () => (o.st || {}), clickAtPointSilent: async (q) => { clicks.push(q); return { ok: true }; } },
      ActionRegistry: o.noAR ? undefined : { executeAction: async (a) => { midi.push(a); return o.midiFail ? { ok: false, status: "NO_DEVICE" } : { ok: true, status: "SUCCESS" }; } } },
    getSetting: (k, d) => (o.st && k in o.st ? o.st[k] : d), getCoordinate: (k) => (o.coords || {})[k] || "", getActiveSourceName: () => o.src || "ai",
    KeyEngine: { setTuning() { return {}; } }, setTimeout: (fn) => setTimeout(fn, 0) };
  ctx.appSettings = o.st || {}; vm.createContext(ctx);
  vm.runInContext(dm[0].replace(/try \{ setInterval$/, "") + "\n" + am[0].replace(/\nfunction restartAiForNewSong$/, "") + ";this.run=runAutoKeyDetect;this.cfg=__aiCoreCfg;this.st=__autoKeyRun;", ctx);
  return { ctx, clicks, midi };
}
const P = { autokey1: [{ x: 1, y: 2 }], autokey2: [{ x: 3, y: 4 }] };
const on = (via) => ({ autoKeyMode: { enabled: true, waitSec: 1, via } });
(async () => {
  let m = make({ st: on("midi"), coords: P }); ok(m.ctx.cfg().autoKeyVia === "midi", "cfg đọc via=midi");
  m = make({ st: on(undefined), coords: P }); ok(m.ctx.cfg().autoKeyVia === "midi", "không đặt via -> mặc định MIDI (Dò tay = MIDI)");
  m = make({ st: on("rác"), coords: P }); ok(m.ctx.cfg().autoKeyVia === "midi", "via lạ -> MIDI");
  m = make({ st: on("click"), coords: P }); ok(m.ctx.cfg().autoKeyVia === "click", "via=click vẫn đọc được (đường cũ)");
  m = make({ st: on("midi"), coords: {} }); let r = await m.ctx.run("t");
  ok(r.ran && r.sent && JSON.stringify(m.midi) === '["AUTOKEY_DETECT","AUTOKEY_SEND"]' && m.clicks.length === 0, "MIDI: gửi AUTOKEY_DETECT rồi AUTOKEY_SEND, không cần toạ độ, không bấm chuột", [r, m.midi]);
  ok(/MIDI/.test(m.ctx.st.status), "trạng thái ghi rõ MIDI", m.ctx.st.status);
  m = make({ st: on("click"), coords: P }); r = await m.ctx.run("t");
  ok(r.sent && m.midi.length === 0 && m.clicks.length === 2, "click: vẫn bấm ngầm 2 toạ độ, không gửi MIDI");
  m = make({ st: on("click"), coords: {} }); r = await m.ctx.run("t"); ok(r.why === "no-coords", "click thiếu toạ độ -> dừng như cũ");
  m = make({ st: on("midi"), coords: {}, midiFail: true }); r = await m.ctx.run("t");
  ok(r.why === "click-fail" && m.midi.length === 1 && /MIDI/.test(m.ctx.st.status) && /NO_DEVICE/.test(m.ctx.st.status), "MIDI lỗi (NO_DEVICE) -> không Send, báo rõ", [r, m.ctx.st.status]);
  m = make({ st: on("midi"), coords: {}, noAR: true }); r = await m.ctx.run("t"); ok(r.why === "no-midi" && m.midi.length === 0, "chưa nạp ActionRegistry -> báo, không gửi");
  m = make({ st: on("midi"), coords: {}, src: "manual" }); r = await m.ctx.run("t"); ok(r.why === "manual" && m.midi.length === 0, "đang Key tay -> Auto-Key không chạy (MIDI cũng vậy)");
  m = make({ st: on("midi"), coords: {}, src: "songDb" }); r = await m.ctx.run("t"); ok(r.why === "song-db" && m.midi.length === 0, "bài có Database -> không chạy");

  // Mapping MIDI mặc định đã nối sẵn
  const ar = rd("ui/js/actionRegistry.js"), su = rd("ui/js/setup.js");
  ok(/AUTOKEY_DETECT" \? 102 : 103/.test(ar) && /channel: 15/.test(ar), "ActionRegistry: mặc định kênh 15, CC 102 (dò) / 103 (Send)");
  ok(/AUTOKEY_DETECT" \? 102 : 103/.test(su), "Setup preset khớp ActionRegistry");

  // Bấm Tự dò khi giữ Key tay: KHÔNG đổi (KEY-MANUAL-HOLD-01 giữ nguyên)
  ok(/if \(!__autoDetectInternal && isManualKeyHeld\(\)\) return; \/\/ KEY-MANUAL-HOLD-01/.test(src), "bấm AUTO DETECT khi giữ Key tay -> vẫn bỏ qua như cũ");
  ok(/if \(!__autoDetectInternal && isManualKeyHeld\(\)\) \{ __holdManualKey\("AUTO DETECT"\); return; \}/.test(src), "nhánh giữ Key tay thứ hai không đổi");
  ok(!/__userExitManualKey/.test(src), "không còn đường thoát Key tay bằng Auto Detect");

  // Chế độ chọn ở chuột phải: Dò tay -> MIDI, Dò AI -> AI dò lại
  ok(!/autoKeyVia/.test(rd("ui/js/setupAutoKey.js")) && !/autoKeyVia/.test(rd("ui/setup.html")), "không thêm ô chọn mới ở Setup/HTML");
  ok(/<span>Tự dò bằng tay<\/span>/.test(src) && /<span>Dò bằng AI<\/span>/.test(src), "chuột phải nút Tự dò vẫn 2 chế độ");
  m = make({ st: { autoKeyMode: { enabled: false } }, coords: {} }); r = await m.ctx.run("t");
  ok(r.why === "mode-off" && m.midi.length === 0 && m.clicks.length === 0, "chế độ Dò bằng AI -> không gửi MIDI/Auto-Key (AI tự dò lại)");
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})();
