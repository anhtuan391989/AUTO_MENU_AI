/**
 * C64 — LƯU DAW => MIDI TỰ THEO DAW. Bấm "Lưu DAW" thì Menu tự áp bộ MIDI chuẩn của DAW đó (Cubase / Studio One...).
 * Kiểm bằng mô phỏng phần mềm (setting giả, MIDI giả), KHÔNG phải DAW thật.
 * Chạy: node tests/unit/AutoDawMidiC64.verify.js
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
const setup = fs.readFileSync(path.join(ROOT, "ui/js/setup.js"), "utf8");
const AR_SRC = fs.readFileSync(path.join(ROOT, "ui/js/actionRegistry.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  OK   " + m); } else { fail++; console.log("  FAIL " + m, x === undefined ? "" : JSON.stringify(x)); } };

const a1 = setup.indexOf("const DAW_MIDI_ACTIONS = ["), a2 = setup.indexOf("function isMouseControlEnabledLocal");
const b1 = setup.indexOf("function getDawMidiOutMapping"), b2 = setup.indexOf("// S8 — 3 hàng PLAY/STOP/RECORD");
const c1 = setup.indexOf("function setupRadioSetting"), c2 = setup.indexOf("function initSetupPage");
if (a1 < 0 || a2 < 0 || b1 < 0 || b2 < 0 || c1 < 0 || c2 < 0) { console.log("FAIL: không tìm thấy các đoạn code cần kiểm"); process.exit(1); }
const CODE = setup.slice(a1, a2) + "\n" + setup.slice(b1, b2) + "\n" + setup.slice(c1, c2) +
    "\nthis.X = { DAW_MIDI_PROFILES, resolveDawProfile, dawProfileAllInOne, DAW_QF_ALL, DAW_MIDI_ACTIONS, autoApplyDawMidi, planAutoDawMidi, getDawMidiOutMapping, setupRadioSetting };";

function env(initial) {
    const st = Object.assign({ selectedDAW: "", dawMidiOutMappings: {} }, initial || {});
    const log = { notify: 0, midi: 0, confirms: [] };
    const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Number, Object, Array, Set, Map, String, RegExp, Error, Promise,
        getSetting: (k, d) => (st[k] === undefined ? d : st[k]),
        setSetting: (k, v) => { st[k] = v; }, saveSetting: (k, v) => { st[k] = v; },
        notifySetupChanged: () => { log.notify++; },
        sendMidiCC: () => { log.midi++; return true; }, sendMidiNotePulse: () => { log.midi++; return true; },
        confirm: () => true, window: {}, setTimeout, clearTimeout };
    vm.createContext(sb);
    vm.runInContext(CODE, sb, { filename: "setup.js" });
    return { st, log, X: sb.X, sb };
}
const apply = (e, daw, over) => e.X.autoApplyDawMidi(daw, Object.assign({ notify: () => { e.log.notify++; }, status: () => {}, confirmFn: (m) => { e.log.confirms.push(m); return true; } }, over || {}));
const CUBASE = { BEAT_INPUT_VOLUME: [4, 127], MIC1_VOLUME: [5, 127], FX_BUS_DELAY_VOLUME: [1, 127], FX_BUS_VERB_LONG_VOLUME: [2, 127], FX_BUS_VERB_SHORT_VOLUME: [3, 127],
    FX_BUS_COM_VERB_VOLUME: [11, 127], RETUNE_SPEED_MIC1: [17, 127], KEY_ROOT: [15, 0], KEY_SCALE_MAJOR: [16, 0], KEY_SCALE_MINOR: [16, 5],
    LOFI_STATE: [20, 127], REMIX_PLUGIN_1: [21, 0], BE_STATE: [14, 127], TUNE_BYPASS: [22, 127], MIC1_ON: [24, 0], MIC1_OFF: [24, 127] };

console.log("== A. Lưu Cubase => MIDI tự điền đúng bảng Cubase ==");
{
    const e = env({ selectedDAW: "Cubase 13" });
    const r = apply(e, "Cubase 13");
    const m = e.st.dawMidiOutMappings["Cubase 13"] || {};
    ok(r.status === "APPLIED" && r.written === 16 && Object.keys(m).length === 16, "Cubase 13: 16 mapping được ghi vào đúng khoá DAW", r);
    ok(Object.entries(CUBASE).every(([a, [cc, v]]) => m[a] && m[a].kind === "cc" && m[a].channel === 1 && m[a].number === cc && m[a].value === v), "mọi action Cubase = đúng CC/giá trị kênh 1 trong bảng C63");
    ok(Object.values(m).every((x) => x.source === "USER_DEFINED"), "mapping lưu có source USER_DEFINED (giống nút điền tay)");
    ok(e.log.midi === 0, "KHÔNG gửi MIDI nào tới DAW khi lưu");
    ok(e.log.confirms.length === 0, "lần đầu (chưa chỉnh tay gì) KHÔNG hỏi xác nhận, tự áp luôn");
    ok(e.log.notify === 1, "báo Menu cập nhật cấu hình đúng 1 lần");
    ok(/Cubase 13/.test(r.message) && /Chưa gửi gì/.test(r.message), "thông báo cho người dùng nói rõ chỉ lưu mapping, chưa gửi gì", r.message);
}

console.log("== B. Đổi DAW qua lại: mỗi DAW giữ bộ MIDI riêng, không ghi chéo ==");
{
    const e = env({ selectedDAW: "Cubase 13" });
    apply(e, "Cubase 13");
    e.st.selectedDAW = "Studio One 7";
    const r2 = apply(e, "Studio One 7");
    const s1 = e.st.dawMidiOutMappings["Studio One 7"] || {};
    const expectN = e.X.dawProfileAllInOne(e.X.DAW_MIDI_PROFILES["studio-one"]).bundles[e.X.DAW_QF_ALL].count;
    ok(r2.status === "APPLIED" && Object.keys(s1).length === expectN && expectN > 16, `Studio One 7: ${expectN} mapping của bộ Studio One`, r2);
    ok(Object.values(s1).every((x) => x.channel === 15 || x.channel === 16), "Studio One dùng kênh 15/16 như cũ, không dính kênh 1 của Cubase");
    ok(Object.keys(e.st.dawMidiOutMappings["Cubase 13"]).length === 16 && e.st.dawMidiOutMappings["Cubase 13"].BEAT_INPUT_VOLUME.number === 4, "Cubase 13 vẫn nguyên sau khi lưu Studio One");
    e.st.selectedDAW = "Cubase 12";
    apply(e, "Cubase 12");
    ok(e.st.dawMidiOutMappings["Cubase 12"].BEAT_INPUT_VOLUME.number === 4 && Object.keys(e.st.dawMidiOutMappings).length === 3, "mọi phiên bản Cubase (10-15) đều nhận bộ Cubase; 3 DAW = 3 khoá riêng");
}

console.log("== C. Mapping người dùng đã chỉnh tay không bị ghi đè âm thầm ==");
{
    const mk = () => env({ selectedDAW: "Cubase 13", dawMidiOutMappings: { "Cubase 13": { TUNE_BYPASS: { kind: "cc", channel: 5, number: 99, value: 127, source: "USER_DEFINED" } } } });
    const e1 = mk();
    const r1 = apply(e1, "Cubase 13", { confirmFn: (m) => { e1.log.confirms.push(m); return false; } });
    ok(e1.log.confirms.length === 1 && /TUNE_BYPASS/.test(e1.log.confirms[0]), "có mapping chỉnh tay khác chuẩn -> hỏi đúng 1 lần, nêu tên action");
    ok(e1.st.dawMidiOutMappings["Cubase 13"].TUNE_BYPASS.number === 99 && e1.st.dawMidiOutMappings["Cubase 13"].TUNE_BYPASS.channel === 5, "chọn Hủy -> giữ nguyên mapping tay của người dùng");
    ok(r1.keptManual === 1 && r1.written === 15 && e1.st.dawMidiOutMappings["Cubase 13"].BEAT_INPUT_VOLUME.number === 4, "Hủy -> vẫn điền 15 mapping còn lại", r1);
    const e2 = mk();
    const r2 = apply(e2, "Cubase 13", { confirmFn: () => true });
    ok(e2.st.dawMidiOutMappings["Cubase 13"].TUNE_BYPASS.number === 22 && e2.st.dawMidiOutMappings["Cubase 13"].TUNE_BYPASS.channel === 1 && r2.written === 16, "chọn OK -> ghi đè bằng bộ chuẩn (CC22 kênh 1)", r2);
    const e3 = env({ selectedDAW: "Cubase 13" });
    apply(e3, "Cubase 13"); const before = JSON.stringify(e3.st.dawMidiOutMappings);
    const r3 = apply(e3, "Cubase 13");
    ok(e3.log.confirms.length === 0 && JSON.stringify(e3.st.dawMidiOutMappings) === before && r3.written === 16, "bấm Lưu DAW lần 2 (đã đúng chuẩn) -> không hỏi, không đổi gì (idempotent)");
}

console.log("== D. Trùng CC với action khác: bỏ qua đúng action trùng, không ghi nửa vời ==");
{
    const e = env({ selectedDAW: "Cubase 13", dawMidiOutMappings: { "Cubase 13": { MONITOR_FX: { kind: "cc", channel: 1, number: 4, value: 127, source: "USER_DEFINED" } } } });
    const r = apply(e, "Cubase 13");
    const m = e.st.dawMidiOutMappings["Cubase 13"];
    ok(r.skippedConflicts.length === 1 && r.skippedConflicts[0] === "BEAT_INPUT_VOLUME" && r.written === 15 && !m.BEAT_INPUT_VOLUME, "BEAT_INPUT_VOLUME (CC4) trùng MONITOR_FX -> bỏ qua đúng 1 action, ghi 15 action còn lại", r);
    ok(m.MONITOR_FX && m.MONITOR_FX.number === 4, "mapping MONITOR_FX của người dùng nguyên vẹn");
    ok(/trùng CC/.test(r.message), "thông báo nói rõ có mapping bị bỏ qua vì trùng", r.message);
}

console.log("== E. DAW không có bộ MIDI / rỗng: không làm gì, không ghi ==");
{
    const e = env({ selectedDAW: "Reaper" });
    const r = apply(e, "Reaper");
    ok(r.status === "NO_PROFILE" && r.written === 0 && Object.keys(e.st.dawMidiOutMappings).length === 0 && e.log.notify === 0, "DAW chưa có bộ gợi ý -> NO_PROFILE, không ghi, không báo đổi cấu hình", r);
    ok(/Chưa có bộ MIDI/.test(r.message), "có thông điệp hướng dẫn cấu hình thủ công");
    const r0 = apply(env({}), "");
    ok(r0.status === "SKIPPED", "nhãn DAW rỗng -> bỏ qua");
}

console.log("== F. Nối dây: bấm Lưu DAW gọi callback SAU khi đã lưu DAW ==");
{
    const calls = []; const st = { };
    const radio = { value: "Cubase 14" }; const display = { textContent: "" }; let clickFn = null;
    const doc = { getElementById: (id) => (id === "saveDawBtn" ? { addEventListener: (_, f) => { clickFn = f; } } : id === "currentDaw" ? display : null),
        querySelector: () => radio };
    const sb = { console: { log() {}, warn() {}, error() {} }, document: doc, initModal() {}, loadSetting: () => "x",
        saveSetting: (k, v) => { st[k] = v; calls.push("save:" + v); }, updateSetupStatus() {}, updateSetupProgress() {}, notifySetupChanged() { calls.push("notify"); } };
    vm.createContext(sb);
    vm.runInContext(setup.slice(c1, c2) + "\nthis.f = setupRadioSetting;", sb);
    sb.f({ openBtnId: "a", modalId: "b", closeBtnId: "c", saveBtnId: "saveDawBtn", radioName: "daw", storageKey: "selectedDAW", displayId: "currentDaw", onSaved: (v) => calls.push("onSaved:" + v) });
    clickFn();
    ok(calls.join(",") === "save:Cubase 14,notify,onSaved:Cubase 14" && st.selectedDAW === "Cubase 14", "thứ tự: lưu DAW -> báo Menu -> callback MIDI (đúng DAW vừa chọn)", calls);
    ok(display.textContent === "Cubase 14", "ô hiển thị 'DAW đang dùng' vẫn cập nhật");
    calls.length = 0; display.textContent = "";
    sb.f({ openBtnId: "a", modalId: "b", closeBtnId: "c", saveBtnId: "saveDawBtn", radioName: "daw", storageKey: "selectedDAW", displayId: "currentDaw", onSaved: () => { throw new Error("boom"); } });
    clickFn();
    ok(st.selectedDAW === "Cubase 14" && display.textContent === "Cubase 14", "callback lỗi KHÔNG làm hỏng việc lưu DAW / cập nhật hiển thị");
    calls.length = 0; display.textContent = "";
    sb.f({ openBtnId: "a", modalId: "b", closeBtnId: "c", saveBtnId: "saveDawBtn", radioName: "autokey", storageKey: "selectedAutoKey", displayId: "currentDaw" });
    clickFn();
    ok(calls.join(",") === "save:Cubase 14,notify", "các mục Setup khác (không có onSaved) hoạt động y như cũ");
}
{
    const wired = setup.match(/storageKey: "selectedDAW",[\s\S]{0,140}?onSaved: \(daw\) => autoApplyDawMidi\(daw\)/);
    ok(!!wired && (setup.match(/onSaved: \(/g) || []).length === 1, "chỉ mục chọn DAW được nối callback autoApplyDawMidi (các mục khác không đổi)");
}

ok((setup.match(/autoApplyDawMidi\(/g) || []).length === 2, "autoApplyDawMidi chỉ có 1 định nghĩa + 1 chỗ gọi (callback Lưu DAW) — không tự chạy lúc mở app/mở trang Setup");

console.log("== G. Menu (ActionRegistry) gửi đúng số sau khi tự áp ==");
{
    const e = env({ selectedDAW: "Cubase 13" });
    apply(e, "Cubase 13");
    const sent = [];
    const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === "selectedDAW" ? "Cubase 13" : k === "dawMidiOutMappings" ? e.st.dawMidiOutMappings : undefined), saveSetting() {},
        sendMidiCC: async (n, v, ch) => { sent.push({ n, v, ch }); return true; } };
    vm.createContext(sb); vm.runInContext(AR_SRC, sb, { filename: "actionRegistry.js" });
    const AR = win.ActionRegistry;
    ok(Object.entries(CUBASE).every(([a, [cc, v]]) => { const m = AR.getMidiOutMapping(a); return m && m.number === cc && m.value === v && m.channel === 1; }), "Menu đọc mapping đã tự lưu và trả đúng CC Cubase cho cả 16 action");
}

console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
