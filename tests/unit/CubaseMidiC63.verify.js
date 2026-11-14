/**
 * C63 — MIDI cho CUBASE: Menu gửi đúng CC của file MIDI Remote THẬT (Ảnh/PDL TOOL AI S1/*.midiremote), kênh 1.
 * Kiểm bằng mô phỏng phần mềm (MIDI giả) + đối chiếu với file .midiremote, KHÔNG phải Cubase thật.
 * Chạy: node tests/unit/CubaseMidiC63.verify.js
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), zlib = require("zlib");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  OK   " + m); } else { fail++; console.log("  FAIL " + m); } };

// ---- 1. CC thật của Cubase: giải nén file .midiremote (zlib sau phần đầu "Steinberg Resource File") ----
function surfaceCcs() {
    const f = path.join(ROOT, "Ảnh", "PDL TOOL AI S1", "MIDI PV2 PDL STUDIO.midiremote");
    const buf = fs.readFileSync(f);
    let json = null;
    for (let off = 0; off < 64 && !json; off++) { try { json = JSON.parse(zlib.inflateSync(buf.subarray(off)).toString("utf8")); } catch (e) { /* thử offset kế */ } }
    if (!json) return null;
    const o = new Map(json.objects.internal.map((x) => [x.id, x]));
    const out = new Map(); // cc -> channel(1-based)
    for (const x of o.values()) if (x.type === "MidiBindingToControlChange") out.set(x.members.ControlChangeNumber, x.members.ChannelNumber + 1);
    return { ccs: out, port: [...o.values()].find((x) => x.type === "DetectionInputNameFilterEquals")?.members.FilterValue };
}
const SURF = surfaceCcs();

// ---- 2. ActionRegistry (Menu) ----
function makeAR(daw, saved) {
    const sent = [];
    const win = { appSettings: {}, getLastMidiSendResult: () => null };
    const sb = { window: win, console, setTimeout, clearTimeout, Promise,
        getSetting: (k) => (k === "selectedDAW" ? daw : k === "dawMidiOutMappings" ? (saved || {}) : undefined), saveSetting: () => {},
        sendMidiCC: async (n, v, ch) => { sent.push({ n, v, ch }); return true; } };
    vm.createContext(sb);
    vm.runInContext(rd("ui/js/actionRegistry.js"), sb, { filename: "actionRegistry.js" });
    makeAR.lastSent = sent;
    return win.ActionRegistry;
}

const EXPECT = { // action -> [CC, value]  (bảng C63)
    BEAT_INPUT_VOLUME: [4, 127], MIC1_VOLUME: [5, 127], FX_BUS_DELAY_VOLUME: [1, 127], FX_BUS_VERB_LONG_VOLUME: [2, 127], FX_BUS_VERB_SHORT_VOLUME: [3, 127],
    FX_BUS_COM_VERB_VOLUME: [11, 127], RETUNE_SPEED_MIC1: [17, 127], KEY_ROOT: [15, 0], KEY_SCALE_MAJOR: [16, 0], KEY_SCALE_MINOR: [16, 5],
    LOFI_STATE: [20, 127], REMIX_PLUGIN_1: [21, 0], BE_STATE: [14, 127], TUNE_BYPASS: [22, 127], MIC1_ON: [24, 0], MIC1_OFF: [24, 127],
};

(async () => {
    console.log("== A. File .midiremote thật làm chuẩn ==");
    ok(!!SURF && SURF.ccs.size === 19, "đọc được file .midiremote: 19 núm CC");
    ok(SURF && SURF.port === "loopMIDI Port", "Cubase chỉ nhận input tên đúng 'loopMIDI Port' (ghi nhận để hướng dẫn đặt tên cổng)");
    ok(SURF && [...SURF.ccs.values()].every((c) => c === 1), "mọi núm Cubase đều ở kênh 1");

    console.log("== B. Mỗi action Cubase của Menu trỏ vào một núm CÓ THẬT trong file ==");
    const AR = makeAR("Cubase 13", {});
    for (const [a, [cc, val]] of Object.entries(EXPECT)) {
        const m = AR.getMidiOutMapping(a);
        ok(!!m && m.kind === "cc" && m.channel === 1 && m.number === cc && m.value === val, `${a} -> kênh 1 CC${cc} (value ${val})`);
        ok(!!SURF && SURF.ccs.has(cc), `${a}: CC${cc} tồn tại trong file MIDI Remote`);
    }
    {
        const nums = {};
        for (const [a, [cc, val]] of Object.entries(EXPECT)) { const k = cc + "|" + (/^(MIC1_(ON|OFF)|KEY_SCALE_(MAJOR|MINOR))$/.test(a) ? val : "x"); (nums[k] = nums[k] || []).push(a); }
        ok(Object.values(nums).every((l) => l.length === 1), "không có 2 action Cubase nào trùng CC (trừ MIC1 ON/OFF = CC24 và Scale Major/Minor = CC16: cùng CC, khác giá trị)");
    }
    ok(AR.getMidiOutMapping("MASTER_OUTPUT_VOLUME") === null && AR.getMidiOutMapping("MIC2_VOLUME") === null, "Master / MIC 2 chưa có núm trong Cubase -> KHÔNG tự bịa CC (null)");

    console.log("== C. Mapping người dùng đã lưu luôn thắng; DAW khác không bị ảnh hưởng ==");
    {
        const saved = { "Cubase 13": { TUNE_BYPASS: { kind: "cc", channel: 5, number: 99, value: 127, source: "USER_DEFINED" } } };
        const m = makeAR("Cubase 13", saved).getMidiOutMapping("TUNE_BYPASS");
        ok(m.number === 99 && m.channel === 5, "mapping đã lưu thắng bảng mặc định Cubase");
        const s1 = makeAR("Studio One 7", {});
        ok(s1.getMidiOutMapping("TUNE_BYPASS").number === 113 && s1.getMidiOutMapping("TUNE_BYPASS").channel === 16, "Studio One: TUNE vẫn kênh 16 CC113 như cũ");
        ok(s1.getMidiOutMapping("KEY_SCALE_MINOR").number === 26 && s1.getMidiOutMapping("KEY_ROOT") === null, "Studio One: Scale CC26, Key gốc chưa có CC như cũ");
        ok(s1.getMidiOutMapping("BEAT_INPUT_VOLUME") === null && s1.getMidiOutMapping("MIC1_ON") === null, "Studio One: không bị bảng Cubase tràn sang");
    }

    console.log("== D. Gửi MIDI thật qua Menu (giả lập) ==");
    {
        const a = makeAR("Cubase 13", {}); const SENT = makeAR.lastSent;
        await a.setDawControlState("TUNE", true, {}); // giữ nguyên quy ước giá trị của Menu (values.on = 127), chỉ đổi số CC/kênh
        ok(JSON.stringify(SENT[0]) === JSON.stringify({ n: 22, v: 127, ch: 0 }), "setDawControlState(TUNE, true) -> CC22 = 127, kênh 1 (giá trị theo đúng quy ước Menu cũ, không đổi)");
        SENT.length = 0; await a.setDawControlState("TUNE", false, {});
        ok(JSON.stringify(SENT[0]) === JSON.stringify({ n: 22, v: 0, ch: 0 }), "setDawControlState(TUNE, false) -> CC22 = 0, kênh 1");
        SENT.length = 0; await a.setDawControlState("LOFI", true, {});
        ok(JSON.stringify(SENT[0]) === JSON.stringify({ n: 20, v: 0, ch: 0 }), "nút LOFI bật -> CC20 = 0, kênh 1");
        SENT.length = 0; await a.setDawControlState("BE", true, {});
        ok(JSON.stringify(SENT[0]) === JSON.stringify({ n: 14, v: 0, ch: 0 }), "nút BÈ bật -> CC14 = 0, kênh 1");
    }

    console.log("== E. setup.js cho cùng kết quả với actionRegistry.js (Setup hiển thị đúng thứ Menu gửi) ==");
    {
        const setup = rd("ui/js/setup.js");
        const b1 = setup.indexOf("function getDawMidiOutMapping"), b2 = setup.indexOf("// S8 — 3 hàng PLAY/STOP/RECORD");
        const sb = { getSetting: (k) => (k === "selectedDAW" ? "Cubase 13" : undefined) };
        vm.createContext(sb);
        vm.runInContext(setup.slice(b1, b2) + "\nthis.f = getDawMidiOutMapping;", sb);
        let same = true;
        for (const [a, [cc, val]] of Object.entries(EXPECT)) { const m = sb.f(a); if (!m || m.number !== cc || m.value !== val || m.channel !== 1) { same = false; console.log("   lệch:", a, JSON.stringify(m)); } }
        ok(same, "16 action: Setup (getDawMidiOutMapping) khớp Menu (getMidiOutMapping)");
    }

    console.log("== F. Hồ sơ điền nhanh Cubase: hợp lệ, không trùng, chỉ dùng CC có thật ==");
    {
        const setup = rd("ui/js/setup.js");
        const a1 = setup.indexOf("const DAW_QF_S1_LIVE"), a2 = setup.indexOf("// S8 — 3 hàng PLAY/STOP/RECORD");
        const sb = { getSetting: () => undefined };
        vm.createContext(sb);
        vm.runInContext(setup.slice(a1, a2) + "\nthis.P = DAW_MIDI_PROFILES; this.v = validateDawProfileBundle; this.all = dawProfileAllInOne;", sb);
        const prof = sb.P.cubase, all = sb.all(prof).bundles.all;
        ok(Object.keys(all.mappings).length === 16 && all.count === 16, "gộp tất cả: 16 mapping, khớp bảng C63");
        const errs = sb.v(all);
        ok(errs.length === 0, "validateDawProfileBundle(Cubase) không có lỗi (kể cả MIC1 ON/OFF dùng chung CC24 khác giá trị)", errs);
        let allMatch = true;
        for (const [a, [cc, val]] of Object.entries(EXPECT)) { const m = all.mappings[a]; if (!m || m.number !== cc || m.channel !== 1 || (a.startsWith("KEY_SCALE") || /^(MIC1_ON|MIC1_OFF|REMIX_PLUGIN_1|KEY_ROOT)$/.test(a) ? m.value !== val : false)) allMatch = false; }
        ok(allMatch, "bộ điền nhanh khớp bảng CC của Menu");
        ok(Object.values(all.mappings).every((m) => SURF && SURF.ccs.has(m.number)), "mọi CC trong bộ điền nhanh đều là núm có thật trong file MIDI Remote");
    }

    console.log("== G. SoundShifter (MOD) theo DAW ==");
    function mk(daw) {
        const sent = [];
        const sb = { console: { log() {}, warn() {}, error() {} }, Promise, Math, JSON, Number, Array, Error, Set, Date, setTimeout: (f) => { f(); return 0; }, clearTimeout() {},
            getSetting: (k) => (k === "midiOutputPort" ? "loopMIDI Port" : k === "selectedDAW" ? daw : undefined), getCoordinate: () => null,
            sendMidiCC: async (cc, v) => { sent.push([cc, v]); return true; }, sendMidiNotePulse: async () => true, window: {} };
        vm.createContext(sb);
        vm.runInContext(rd("ui/js/vocalCommandRouter.js") + "\nthis.R = { step: sendToneStepToSoundShifter, power: setSoundShifterPower, reset: resetSoundShifterToDefault };", sb);
        return { R: sb.R, sent };
    }
    {
        const s1 = mk("Studio One 7");
        await s1.R.power(true);
        ok(s1.sent[0][0] === 24 && s1.sent[0][1] === 0 && s1.sent[1][0] === 22 && s1.sent[1][1] === 64, "Studio One: MOD ON vẫn CC24 (bypass TẮT=0) rồi CC22 = 64 như cũ");
        const none = mk(undefined);
        await none.R.step(1);
        ok(none.sent.length === 1 && none.sent[0][0] === 22 && none.sent[0][1] === 69, "chưa chọn DAW: giữ hành vi cũ CC22 = 69 (+1 bán cung)");
        const cb = mk("Cubase 13");
        await cb.R.power(true);
        ok(cb.sent[0][0] === 25 && cb.sent[0][1] === 0, "Cubase: MOD ON -> Bypass SoundShifter TẮT = CC25 giá trị 0");
        ok(cb.sent[1][0] === 8 && cb.sent[1][1] === 64, "Cubase: MOD ON -> PitchShift về 0 = CC8 giá trị 64");
        cb.sent.length = 0; await cb.R.step(2);
        ok(cb.sent.length === 1 && cb.sent[0][0] === 8 && cb.sent[0][1] === 74, "Cubase: tone +2 -> CC8 = 74");
        cb.sent.length = 0; await cb.R.reset();
        ok(cb.sent.every(([cc]) => cc === 8 || cc === 25) && cb.sent[cb.sent.length - 1][0] === 25 && cb.sent[cb.sent.length - 1][1] === 127, "Cubase: MOD OFF -> về 0 rồi Bypass BẬT (CC25 = 127)");
        ok(!cb.sent.some(([cc]) => cc === 22 || cc === 24), "Cubase: MOD KHÔNG còn đụng CC22 (TẮT TUNE) và CC24 (TẮT MIC)");
        ok(SURF && SURF.ccs.has(8) && !SURF.ccs.has(25), "CC8 có thật trong MIDI Remote (PitchShift); CC25 CHƯA có -> cần thêm 1 núm CC25 cho Bypass SoundShifter");
    }

    console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
