/**
 * MOD-TONE-ABS-01 — SoundShifter là NÚM TUYỆT ĐỐI (CC22: 0..127 = -12..+12), không phải nút ▲▼.
 * Kiểm bằng mô phỏng phần mềm (MIDI giả), KHÔNG phải Studio One / SoundShifter thật.
 * Chạy: node tests/unit/ModToneAbs01.verify.js
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
const ROUTER = fs.readFileSync(path.join(ROOT, "ui/js/vocalCommandRouter.js"), "utf8");
const REN = fs.readFileSync(path.join(ROOT, "ui/js/renderer.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  OK   " + m); } else { fail++; console.log("  FAIL " + m); } };

function mk(src, port = "loopMIDI") {
    const sent = [];
    const sb = { console: { log() {}, warn() {}, error() {} }, Promise, Math, JSON, Number, Array, Error, Set, Date,
        setTimeout: (f) => { f(); return 0; }, clearTimeout() {},
        getSetting: (k) => (k === "midiOutputPort" ? port : undefined), getCoordinate: () => null,
        sendMidiCC: async (cc, v) => { sent.push([cc, v]); return true; }, sendMidiNotePulse: async () => true, window: {} };
    vm.createContext(sb);
    vm.runInContext(src + "\nthis.R = { toCC: soundShifterSemitoneToCC, step: sendToneStepToSoundShifter, power: setSoundShifterPower, st: soundShifterState };", sb);
    return { R: sb.R, sent };
}
(async () => {
    console.log("== A. Núm tuyệt đối: giá trị CC đúng, không bao giờ nhảy 12 ==");
    {
        const { R } = mk(ROUTER);
        let roundTrip = true;
        for (let s = -12; s <= 12; s++) { const n = Math.round((R.toCC(s) / 127) * 24) - 12; if (n !== s) roundTrip = false; }
        ok(roundTrip, "A1. CC -> semitone khớp đúng cho mọi mức -12..+12 (Studio One làm tròn 0..127 thành 25 nấc)");
        ok(R.toCC(0) === 64 && R.toCC(1) === 69 && R.toCC(-1) === 58 && R.toCC(12) === 127 && R.toCC(-12) === 0, "A2. 0->64, +1->69, -1->58, +12->127, -12->0");
        ok(R.toCC(99) === 127 && R.toCC(-99) === 0, "A3. giá trị vượt biên bị chặn trong -12..+12");
    }
    console.log("== B. Đúng 2 lỗi người dùng báo ==");
    {
        const { R, sent } = mk(ROUTER);
        await R.step(1);
        ok(sent.length === 1 && sent[0][0] === 22 && sent[0][1] === 69, "B1. chọn +1 -> gửi ĐÚNG MỘT lệnh CC22 = 69 (+1 semitone), không phải 127 (=+12)");
        ok(!sent.some((x) => x[1] === 127) && R.st.semitones === 1, "B2. không có lệnh 127 nào; trạng thái nội bộ = +1");
        sent.length = 0; await R.step(-1);
        ok(sent.length === 1 && sent[0][1] === 64 && R.st.semitones === 0, "B3. chọn lại 0 (delta -1) -> CC22 = 64 (về 0), plugin KHÔNG kẹt ở 12");
        sent.length = 0; await R.step(0);
        ok(sent.length === 0, "B4. delta 0 không gửi gì");
    }
    console.log("== C. Bypass + đồng bộ núm khi bật/tắt MOD ==");
    {
        const { R, sent } = mk(ROUTER);
        await R.step(5); sent.length = 0;
        await R.power(true);
        ok(sent[0][0] === 24 && sent[0][1] === 0, "C1. MOD ON -> Bypass TẮT (CC24 = 0)");
        ok(sent[1] && sent[1][0] === 22 && sent[1][1] === 64 && R.st.semitones === 0, "C2. MOD ON -> núm Semitones về 0 (CC22 = 64), dù plugin đang kẹt mức cũ");
        sent.length = 0; await R.step(2); await R.step(-2); sent.length = 0;
        await R.power(false);
        ok(sent.length === 1 && sent[0][0] === 24 && sent[0][1] === 127, "C3. MOD OFF -> Bypass BẬT (CC24 = 127), không gửi thêm núm");
        const none = mk(ROUTER, ""); const r = await none.R.step(1);
        ok(r.ok === false && none.sent.length === 0, "C4. chưa cấu hình cổng MIDI -> báo lỗi, không gửi");
    }
    console.log("== D. Nguồn code (renderer): Auto-Tune nhận Key đã dịch, không dùng ▲▼ ==");
    {
        const setH = REN.slice(REN.indexOf('document.getElementById("applyToneBtn")?.addEventListener("click"'));
        const h = setH.slice(0, setH.indexOf("\n});") + 4);
        ok(/sendManualToneToAutotune\(toneVal\)/.test(h) && !/sendToneTarget\(toneVal\)/.test(h), "D1. SET gửi Key đã dịch xuống Auto-Tune (không gọi bước ▲▼ sendToneTarget)");
        ok(/sendToneStepToSoundShifter\(toneVal - soundShifterApplied\)/.test(h), "D2. SET vẫn chỉ áp dụng SoundShifter sau khi bấm SET");
        ok(/Chưa có Key gốc/.test(REN), "D3. chưa có Key gốc -> báo lỗi rõ ràng thay vì gửi bừa");
        ok(/if \(toneShiftActive\) \{ if \(sendValue === lastPluginKey\) return; \} else if \(value === lastPluginKey\) return;/.test(REN), "D4. đang lệch tone: Key mới của AI vẫn được dịch + so sánh trùng lặp theo Key đã dịch");
    }
    console.log("== E. Mutation: test phải bắt được lỗi cũ ==");
    {
        const m1 = ROUTER.replace("Math.round(((s + SOUNDSHIFTER_RANGE) / (2 * SOUNDSHIFTER_RANGE)) * 127)", "127");
        const a = mk(m1); await a.R.step(1);
        ok(a.sent[0][1] === 127, "E1. (mutation) nếu CC luôn 127 thì lỗi 'nhảy 12' tái hiện -> B1 sẽ FAIL");
        const m2 = ROUTER.replace("if (isOn) {\n        const zero", "if (false) {\n        const zero");
        const b = mk(m2); await b.R.step(5); b.sent.length = 0; await b.R.power(true);
        ok(b.sent.length === 1, "E2. (mutation) bỏ đồng bộ về 0 khi MOD ON thì không còn CC22 -> C2 sẽ FAIL");
    }
    console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("LỖI HARNESS", e); process.exit(2); });
