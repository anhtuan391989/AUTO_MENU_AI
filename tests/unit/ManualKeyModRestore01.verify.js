/**
 * MANUAL-KEY-MOD-RESTORE-01 — kiểm Manual Key + nâng/hạ Tone thủ công (MOD) trong MÔ PHỎNG PHẦN MỀM.
 * Mã renderer.js THẬT (trích hàm/handler) + vocalCommandRouter.js THẬT chạy trong 1 sandbox với DOM giả, MIDI giả (đếm CC/Note).
 * KHÔNG phải phần cứng Windows / Auto-Tune / SoundShifter thật.
 * Chạy: node tests/unit/ManualKeyModRestore01.verify.js
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
const REN = fs.readFileSync(path.join(ROOT, "ui/js/renderer.js"), "utf8");
const ROUTER = fs.readFileSync(path.join(ROOT, "ui/js/vocalCommandRouter.js"), "utf8");
let fail = 0, pass = 0;
function check(c, m) { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } }

// ---- trích mã từ renderer.js ----
function braceEnd(src, open) { let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (d === 0) return i + 1; } } throw new Error("unbalanced"); }
function fn(name) { let a = REN.indexOf("async function " + name + "("); if (a < 0) a = REN.indexOf("function " + name + "("); if (a < 0) throw new Error("no fn " + name); return REN.slice(a, braceEnd(REN, REN.indexOf("{", a))); }
function handler(prefix) { const a = REN.indexOf(prefix); if (a < 0) throw new Error("no handler " + prefix); const e = REN.indexOf("\n});", a); return REN.slice(a, e + 4); }
function between(from, to) { const a = REN.indexOf(from), b = REN.indexOf(to, a); if (a < 0 || b < 0) throw new Error("no block " + from); return REN.slice(a, b + to.length); }

const PIECES = [
    between("const notes = [", "};"), // notes + flatToSharp (flatToSharp kết thúc bằng "};")
    between("const MANUAL_TONE_VALUES", "let manualToneChain = Promise.resolve();"),
    between("const keySource = {", "};"),
    fn("transposeKey"), fn("normalizeKeyForSend"), fn("displayKeyText"), fn("renderManualToneDisplay"), fn("restoreSelectOptions"),
    handler('document.getElementById("applyToneBtn")?.addEventListener("click"'),
    fn("getActiveSourceName"), fn("getActiveKeyValue"), fn("applyActiveKeyToPlugin"), fn("cancelManualOverride"), fn("startManualOverrideCountdown"),
    fn("triggerAiKeyDetect"),
    handler('applyKeyBtn?.addEventListener("click"'), handler('keySelector?.addEventListener("change"'),
    fn("turnManualOverrideOff"), handler('modPowerBtn?.addEventListener("click"'),
    fn("isManualOverrideActive"), fn("applyModEvent"), fn("updateModInfo"), fn("resetAiDisplaysToListening"),
].join("\n");

function mkEl(id) {
    const el = { id, textContent: "", disabled: false, listeners: {}, options: [], _v: "", _cls: new Set() };
    el.classList = { add: (c) => el._cls.add(c), remove: (c) => el._cls.delete(c), contains: (c) => el._cls.has(c), toggle: (c) => { if (el._cls.has(c)) { el._cls.delete(c); return false; } el._cls.add(c); return true; } };
    el.add = (o) => el.options.push(o); el.remove = (i) => el.options.splice(i, 1);
    Object.defineProperty(el, "value", { get: () => el._v, set: (v) => { if (!el.options.length || el.options.some((o) => o.value === v)) el._v = v; } });
    el.addEventListener = (t, f) => { el.listeners[t] = f; };
    el.click = () => el.listeners.click && el.listeners.click();
    return el;
}
const tick = () => new Promise((r) => setImmediate(r));
async function flush() { for (let i = 0; i < 6; i++) await tick(); }

function session(o = {}) {
    const els = {}; const get = (id) => (els[id] = els[id] || mkEl(id));
    ["currentKey", "keyInfo", "keySelector", "applyKeyBtn", "modPowerBtn", "toneSelector", "applyToneBtn", "modTime", "modStatus", "modTimeline", "manualOverrideStatus"].forEach(get);
    els.keySelector.options = [{ value: "AI Key Detect" }, { value: "C Major" }, { value: "A Minor" }]; els.keySelector._v = "AI Key Detect";
    els.toneSelector.options = [{ value: "0" }, { value: "+1" }, { value: "-1" }]; els.toneSelector._v = "0"; els.toneSelector.disabled = true; els.applyToneBtn.disabled = true; // trạng thái khởi tạo do renderer.js đặt (MOD OFF)
    const log = { notes: [], cc: [], ccCount: {}, tone: 0, shifter: 0, now: 1000, intervals: [], timers: [], status: [], aiStarts: 0 };
    const sb = {
        console: { log() {}, warn() {}, error() {} }, Promise, Array, Math, Number, JSON, parseInt, Error, Set, Date: { now: () => log.now },
        setTimeout: (f, ms) => { if (ms >= 1000) { log.timers.push({ f, ms }); return log.timers.length; } f(); return 0; }, clearTimeout: () => {},
        setInterval: (f) => { log.intervals.push(f); return log.intervals.length; }, clearInterval: () => { log.intervals.length = 0; },
        getSetting: (k) => (k === "midiOutputPort" ? (o.port === undefined ? "loopMIDI" : o.port) : k === "mouseControlEnabled" ? true : undefined),
        getCoordinate: () => null,
        sendMidiCC: async (cc) => { log.cc.push(cc); log.ccCount[cc] = (log.ccCount[cc] || 0) + 1; if (cc === 20) log.tone++; if (cc === 21) log.tone--; if (cc === 22) log.shifter++; if (cc === 23) log.shifter--; return o.ccFail ? o.ccFail(cc) === false ? false : true : true; },
        sendMidiNotePulse: async (n) => { log.notes.push(n); return o.noteFail ? false : true; },
        document: { getElementById: (id) => get(id) },
        Option: function (t, v) { this.text = t; this.value = v; },
        setStatus: (id, s) => log.status.push([id, s]), formatCountdownMMSS: () => "04:00", logKeySource() {}, refreshKeySourceDisplay() {},
        reportManualStateSnapshot() {}, saveData() {}, recordModStage() {}, isAiControlActive: () => false,
        startAiRealtimeLoop: () => { log.aiStarts++; },
        songSeconds: 0, controlSource: "LEGACY_CONTROL",
    };
    sb.window = { electronAPI: { reportAiResult() {} }, __keyDetectStopWatcher: null, __keyWatcherMeta: null };
    sb.window.electronAPI.reportAiResult = () => {};
    sb.electronAPI = sb.window.electronAPI;
    vm.createContext(sb);
    const pre = `var __aiCycleGen = 1; var appState = { originalKey: "G# Minor" }; var originalKey = "G# Minor"; var keyEverDetected = false; var modAutoOffTimer = null; var aiSemitoneOffset = 0;
var lastPluginKey = "G# Minor"; var MANUAL_OVERRIDE_DURATION_MS = 240000;
var keySelector = document.getElementById("keySelector"), applyKeyBtn = document.getElementById("applyKeyBtn"), currentKeyEl = document.getElementById("currentKey"), keyInfoEl = document.getElementById("keyInfo");
var modPowerBtn = document.getElementById("modPowerBtn"), toneSelector = document.getElementById("toneSelector"), applyToneBtn = document.getElementById("applyToneBtn");
var aiKeyDetectLineEl = null; var __aiState = {}; function updateAiSourceStateLabel() {}`;
    const post = `
this.api = { get originalKey() { return originalKey; }, set originalKey(v) { originalKey = v; }, get keySource() { return keySource; }, get lastPluginKey() { return lastPluginKey; },
  set keyEverDetected(v) { keyEverDetected = v; }, get manualToneOffset() { return manualToneOffset; }, get manualToneSet() { return manualToneSet; }, get soundShifterApplied() { return soundShifterApplied; },
  applyActiveKeyToPlugin, transposeKey, normalizeKeyForSend, restoreSelectOptions, MANUAL_TONE_VALUES, MANUAL_KEY_VALUES, triggerAiKeyDetect, applyModEvent, resetAiDisplaysToListening, turnManualOverrideOff,
  set aiSemitoneOffset(v) { aiSemitoneOffset = v; }, get aiSemitoneOffset() { return aiSemitoneOffset; } };`;
    vm.runInContext(ROUTER + "\n" + pre + "\n" + PIECES + "\n" + post, sb);
    // chỉ router (const) KHÔNG lộ ra sandbox -> lộ riêng các hàm cần gọi trực tiếp
    vm.runInContext("this.sendToneTarget = sendToneTarget; this.sendKeyToAutotune = sendKeyToAutotune;", sb);
    const api = sb.api;
    return {
        sb, els, log, api,
        pickKey: (k) => { els.keySelector.value = k; els.keySelector.listeners.change(); },
        send: async () => { els.applyKeyBtn.click(); await flush(); },
        modOn: async () => { els.modPowerBtn.click(); await flush(); },
        modOff: async () => { els.modPowerBtn.click(); await flush(); },
        setTone: async (t) => { els.toneSelector.value = t; els.applyToneBtn.click(); await flush(); },
        aiKey: (k) => { api.keySource.ai.value = k; api.keyEverDetected = true; api.applyActiveKeyToPlugin("AI Detect"); },
        expireManual: () => { log.now += 241000; log.intervals.slice().forEach((f) => f()); },
    };
}
const sharpNote = { "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11 };

(async () => {
    console.log("== A. Danh sách lựa chọn Key/Tone được khôi phục (không sửa HTML) ==");
    {
        const s = session();
        s.api.restoreSelectOptions(s.els.keySelector, s.api.MANUAL_KEY_VALUES);
        check(s.els.keySelector.options.length === 25 && s.els.keySelector.options[0].value === "AI Key Detect", "A1. #keySelector có 25 mục (AI Key Detect + 24 Key), mục đầu = AI Key Detect");
        const vals = s.els.keySelector.options.map((o) => o.value);
        check(["C Major", "Db Major", "B Major", "C# Minor", "G# Minor", "B Minor"].every((v) => vals.includes(v)), "A2. có đủ Key đại diện (Db Major, B Major, C# Minor, G# Minor, B Minor...)");
        s.api.restoreSelectOptions(s.els.keySelector, s.api.MANUAL_KEY_VALUES);
        check(s.els.keySelector.options.length === 25, "A3. nạp lần 2 không nhân đôi (idempotent)");
        s.els.keySelector._v = "A Minor"; s.els.keySelector.options = [{ value: "AI Key Detect" }, { value: "C Major" }, { value: "A Minor" }];
        s.api.restoreSelectOptions(s.els.keySelector, s.api.MANUAL_KEY_VALUES);
        check(s.els.keySelector.value === "A Minor", "A4. giữ nguyên giá trị đang chọn khi nạp lại danh sách");
        const t = session();
        check(t.els.toneSelector.options.length === 21 && t.els.toneSelector.options[0].value === "+10" && t.els.toneSelector.options[20].value === "-10" && t.els.toneSelector.value === "0", "A5. #toneSelector có 21 mục +10…-10, mặc định 0");
    }

    console.log("== B. Manual Key: chọn Key bất kỳ, hiển thị đúng, AI không ghi đè ==");
    {
        const s = session();
        s.api.restoreSelectOptions(s.els.keySelector, s.api.MANUAL_KEY_VALUES);
        s.aiKey("F Major"); await flush();
        const aiNotes = s.log.notes.length;
        s.pickKey("Eb Minor");
        check(s.els.currentKey.textContent === "Eb Minor" && s.api.keySource.manual.selectedKey === "Eb Minor", "B1. chọn Key (preview) hiển thị đúng 'Eb Minor'");
        s.aiKey("A Major"); // AI có kết quả mới trong lúc người dùng mới chọn, CHƯA bấm SEND
        check(s.els.keySelector.value === "Eb Minor" && s.api.keySource.manual.selectedKey === "Eb Minor", "B2. AI có kết quả mới -> dropdown & lựa chọn Manual KHÔNG bị ghi đè (chưa SEND)");
        await s.send();
        check(s.api.keySource.manual.active && s.api.keySource.manual.committedKey === "Eb Minor" && s.els.currentKey.textContent === "Eb Minor", "B3. SEND thành công -> Manual active, hiển thị đúng 'Eb Minor'");
        check(s.log.notes[s.log.notes.length - 1] === sharpNote["D#"], "B4. Key giáng 'Eb Minor' được gửi đúng nốt D# (3), không phải E (4) như lỗi cũ");
        const before = s.log.notes.length;
        s.aiKey("B Major"); await flush();
        check(s.els.keySelector.value === "Eb Minor" && s.els.currentKey.textContent === "Eb Minor" && s.log.notes.length === before, "B5. Manual đang active: AI có Key mới -> dropdown, Key hiển thị và Plugin KHÔNG đổi");
        await (async () => { s.pickKey("Db Major"); await s.send(); })();
        check(s.log.notes[s.log.notes.length - 1] === sharpNote["C#"] && s.els.currentKey.textContent === "Db Major", "B6. 'Db Major' gửi nốt C# (1), hiển thị đúng nhãn 'Db Major'; lastPluginKey chuẩn hoá = " + s.api.lastPluginKey);
        // SEND không được huỷ watcher AI
        const s2 = session(); let cancelled = false; s2.sb.window.__keyDetectStopWatcher = () => { cancelled = true; };
        s2.pickKey("C Major"); s2.els.applyKeyBtn.click();
        check(s2.api.keySource.manual.sending === true, "B7. đang gửi: cờ sending=true (AI không được chen vào)");
        await flush();
        check(!cancelled && s2.sb.window.__keyDetectStopWatcher !== null && s2.api.keySource.manual.sending === false, "B8. SEND KHÔNG huỷ watcher AI (lỗi cũ: AI 'chết' sau Manual); sending về false sau khi gửi xong");
        // gửi thất bại
        const f = session({ noteFail: true, port: "loopMIDI" }); f.pickKey("D Major"); await f.send();
        check(!f.api.keySource.manual.active && f.api.keySource.manual.sending === false, "B9. SEND thất bại -> không commit Manual, sending được nhả");
    }

    console.log("== C. Chuyển Auto <-> Manual ổn định ==");
    {
        const s = session(); s.api.restoreSelectOptions(s.els.keySelector, s.api.MANUAL_KEY_VALUES);
        s.sb.window.__keyDetectStopWatcher = () => {}; s.sb.window.__keyWatcherMeta = { gen: 1, epoch: undefined, src: undefined };
        s.aiKey("F Major"); await flush();
        for (let round = 1; round <= 3; round++) {
            s.pickKey("G Major"); await s.send();
            const okM = s.api.getActive ? true : s.api.keySource.manual.active && s.els.currentKey.textContent === "G Major";
            s.pickKey("AI Key Detect"); await s.send();
            const okA = !s.api.keySource.manual.active && s.els.keySelector.value === "AI Key Detect" && s.els.currentKey.textContent === "F Major" && s.api.keySource.manual.selectedKey === null;
            check(okM && okA, `C${round}. vòng ${round}: Manual (G Major) -> Auto: Manual tắt, dropdown về AI Key Detect, hiển thị Key AI 'F Major'`);
        }
        s.pickKey("G Major"); await s.send(); s.expireManual(); await flush();
        check(!s.api.keySource.manual.active && s.els.keySelector.value === "AI Key Detect" && s.api.keySource.manual.selectedKey === null && s.els.currentKey.textContent === "F Major", "C4. hết 4 phút Manual: tự quay về AI, dropdown về 'AI Key Detect' (không kẹt Key cũ)");
        check(s.log.notes[s.log.notes.length - 1] === sharpNote["F"], "C5. hết hạn: Plugin nhận lại Key AI (F)");
    }

    console.log("== D. MOD: nâng/hạ Tone thủ công ==");
    {
        const s = session(); s.api.restoreSelectOptions(s.els.keySelector, s.api.MANUAL_KEY_VALUES);
        s.sb.window.__keyDetectStopWatcher = () => {}; s.sb.window.__keyWatcherMeta = { gen: 1 };
        s.pickKey("C Major"); await s.send();
        check(s.els.toneSelector.disabled === true && s.els.applyToneBtn.disabled === true, "D0. MOD OFF: dropdown Tone + SET bị khoá");
        await s.setTone("+1"); const noop = s.log.tone;
        check(noop === 0, "D0b. MOD OFF bấm SET: không gửi gì");
        await s.modOn();
        check(!s.els.toneSelector.disabled && !s.els.applyToneBtn.disabled && s.els.toneSelector.value === "0", "D1. MOD ON: dropdown/SET mở, Tone = 0");
        const steps = [];
        for (const t of [1, 2, 3, 4]) {
            const b = { tone: s.log.tone, sh: s.log.shifter };
            await s.setTone(t > 0 ? "+" + t : "0");
            steps.push({ t, dTone: s.log.tone - b.tone, dSh: s.log.shifter - b.sh });
        }
        check(steps.every((x) => x.dTone === 1 && x.dSh === 2), "D2. NÂNG liên tiếp +1→+4: mỗi lần SET Auto-Tune đúng +1 bán cung, SoundShifter +2 đơn vị (tỉ lệ 2) [" + JSON.stringify(steps) + "]");
        check(s.log.tone === 4 && s.log.shifter === 8 && s.api.manualToneOffset === 4, "D3. Tổng thực: Auto-Tune +4, SoundShifter +8, trạng thái nội bộ = +4");
        check(s.els.modTimeline.textContent === "+4 SEMITONES" && s.els.currentKey.textContent === "E Major" && s.els.modStatus.textContent === "E Major", "D4. MOD hiển thị đúng: '+4 SEMITONES', Key sau dịch 'E Major' (Key gốc C Major không đổi: " + s.api.keySource.manual.committedKey + ")");
        const dn = [];
        for (const t of ["+3", "+2", "+1", "0", "-1", "-2"]) { const b = { tone: s.log.tone, sh: s.log.shifter }; await s.setTone(t); dn.push({ t, dTone: s.log.tone - b.tone, dSh: s.log.shifter - b.sh }); }
        check(dn.every((x) => x.dTone === -1 && x.dSh === -2), "D5. HẠ liên tiếp +3→-2: mỗi lần SET đúng -1 bán cung (Auto-Tune), -2 đơn vị (SoundShifter) [" + dn.map((x) => x.t + ":" + x.dTone).join(",") + "]");
        check(s.log.tone === -2 && s.log.shifter === -4 && s.els.modTimeline.textContent === "-2 SEMITONES" && s.els.currentKey.textContent === "A# Major", "D6. Tổng thực -2, hiển thị '-2 SEMITONES', Key sau dịch 'A# Major'");
        const b = s.log.cc.length; await s.setTone("-2");
        check(s.log.cc.length === b, "D7. SET lại cùng giá trị: không gửi thêm lệnh nào (idempotent)");
        await s.setTone("+10"); check(s.log.tone === 10 && s.log.shifter === 20, "D8. nhảy +10: tổng đúng +10 (Auto-Tune) / +20 (SoundShifter), không dư không thiếu");
        await s.setTone("-10"); check(s.log.tone === -10 && s.log.shifter === -20, "D9. nhảy -10: tổng đúng -10 / -20");
    }

    console.log("== E. Biên B→C và C→B ==");
    {
        const s = session(); s.api.restoreSelectOptions(s.els.keySelector, s.api.MANUAL_KEY_VALUES);
        s.sb.window.__keyDetectStopWatcher = () => {}; s.sb.window.__keyWatcherMeta = { gen: 1 };
        s.pickKey("B Major"); await s.send(); await s.modOn();
        await s.setTone("+1");
        check(s.els.currentKey.textContent === "C Major" && s.els.modTimeline.textContent === "+1 SEMITONES", "E1. B Major +1 -> 'C Major' (vượt biên B→C)");
        await s.setTone("0"); check(s.els.currentKey.textContent === "B Major", "E2. về 0 -> 'B Major'");
        s.pickKey("C Major"); await s.send(); await s.setTone("-1");
        check(s.els.currentKey.textContent === "B Major" && s.els.modTimeline.textContent === "-1 SEMITONES", "E3. C Major -1 -> 'B Major' (vượt biên C→B)");
        const T = s.api.transposeKey;
        check(T("B Minor", 1) === "C Minor" && T("C Minor", -1) === "B Minor" && T("C Major", -13) === "B Major" && T("B Major", 25) === "C Major" && T("Db Major", 0) === "C# Major" && T("A# Major", -10) === "C Major", "E4. transposeKey đúng mọi biên, kể cả bước <-12 / >12 và Key giáng");
    }

    console.log("== F. AUTO DETECT / AI không xung đột với Tone thủ công; hiển thị MOD sau mỗi thao tác ==");
    {
        const s = session(); s.api.restoreSelectOptions(s.els.keySelector, s.api.MANUAL_KEY_VALUES);
        s.sb.window.__keyDetectStopWatcher = () => {}; s.sb.window.__keyWatcherMeta = { gen: 1 };
        s.aiKey("F Major"); await flush(); await s.modOn(); await s.setTone("+3");
        const shown = () => [s.els.currentKey.textContent, s.els.modStatus.textContent, s.els.modTimeline.textContent, s.els.modTime.textContent].join("|");
        check(shown() === "G# Major|G# Major|+3 SEMITONES|--:--", "F1. Nguồn AI (F Major) + Tone +3 -> hiển thị 'G# Major', '+3 SEMITONES' [" + shown() + "]");
        const toneBefore = s.log.tone, shBefore = s.log.shifter;
        await s.sb.api.applyModEvent({ time: "01:23", semitone: 5 }); await flush();
        check(shown() === "G# Major|G# Major|+3 SEMITONES|--:--" && s.log.tone === toneBefore && s.log.shifter === shBefore && s.api.aiSemitoneOffset === 5, "F2. AI báo modulation +5 khi MOD tay ON: màn hình MOD KHÔNG bị ghi đè, không gửi lệnh, AI vẫn ghi nhận offset=5 để trả quyền sau");
        s.api.resetAiDisplaysToListening();
        check(s.els.modTimeline.textContent === "+3 SEMITONES" && s.els.toneSelector.value === "+3" && s.api.manualToneOffset === 3, "F3. AUTO DETECT (reset hiển thị AI): Tone tay +3 giữ nguyên (selector, trạng thái, MOD hiển thị)");
        s.aiKey("D Major"); await flush();
        check(s.els.currentKey.textContent === "F Major" && s.els.toneSelector.value === "+3" && s.api.manualToneOffset === 3, "F4. AI dò ra Key mới 'D Major': Key hiển thị = D Major +3 = 'F Major', Tone tay vẫn +3");
        check(s.log.tone === 3, "F5. Tone thực trên Auto-Tune vẫn +3 (AI không chạm)");
        await s.modOff();
        check(s.els.toneSelector.value === "0" && s.els.toneSelector.disabled && s.api.manualToneOffset === 0 && s.api.manualToneSet === false, "F6. MOD OFF: dropdown về 0 + khoá, trạng thái tay xoá");
        check(s.log.shifter === 0 && s.log.cc[s.log.cc.length - 1] !== undefined, "F7. MOD OFF: SoundShifter được đưa về 0 trước khi tắt (tổng thực = " + s.log.shifter + "), Auto-Tune trả về offset AI (" + s.log.tone + " = aiSemitoneOffset " + s.api.aiSemitoneOffset + ")");
        check(s.log.tone === 5, "F8. Auto-Tune trả đúng offset AI đã hoãn (5), không ép về 0");
        s.log.cc.length = 0; await s.modOn(); await s.setTone("+1");
        check(s.log.ccCount[22] >= 2 && s.log.shifter === 2, "F9. MOD ON lại: bắt đầu từ 0 sạch; SET +1 -> SoundShifter đúng +2 (không mang tone cũ)");
    }

    console.log("== G. Không phá phần ngoài phạm vi ==");
    {
        check(!/modBtn\.classList\.add\("active"\)/.test(REN), "G1. loadData không còn khôi phục MOD 'ON' giả (không điều khiển được)");
        check(/data\.tone/.test(REN) && /toneSelector/.test(REN), "G2. loadData vẫn khôi phục Tone/Key/preset/knob như cũ (test MenuButtonReset giữ nguyên)");
    }

    console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("LỖI HARNESS:", e); process.exit(2); });
