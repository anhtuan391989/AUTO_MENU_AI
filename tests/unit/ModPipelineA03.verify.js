/**
 * AI-ALG-03 (D6) — phân biệt "đã gửi lệnh" với "đã xác nhận áp dụng" trong sendToneStep() (đường MOD -> MIDI/chuột).
 * Chạy: node tests/unit/ModPipelineA03.verify.js   (biến môi trường AUTOMENU_ROOT để chạy trên bản khác, ví dụ HEAD cũ)
 * Kiểm thử PHẦN MỀM với MIDI/chuột giả (stub) — KHÔNG phải kiểm thử phần cứng Windows.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
let fail = 0, known = 0;
function check(c, m) { if (c) console.log("  ✅ " + m); else { fail++; console.log("  ❌ " + m); } }
const SRC = fs.readFileSync(path.join(ROOT, "ui/js/vocalCommandRouter.js"), "utf8");

function load({ port = "loopMIDI", midiOk = () => true, point = null, mouseAllowed = true }) {
    const sent = [], clicks = [];
    const sb = { console: { log() {}, warn() {}, error() {} },
        setTimeout: (f) => { f(); return 0; }, Promise, Array, Math, Number, JSON, parseInt,
        getSetting: (k) => (k === "midiOutputPort" ? port : k === "mouseControlEnabled" ? mouseAllowed : undefined),
        getCoordinate: (k) => (k === "chromatic" ? point : ""),
        sendMidiCC: async (cc, v) => { const ok = midiOk(sent.length); if (ok) sent.push({ cc, v }); return ok; },
        sendMidiNotePulse: async () => true };
    sb.window = sb; sb.electronAPI = { clickAtPoint: async (p) => { clicks.push(p); return { ok: true }; } };
    vm.createContext(sb);
    vm.runInContext(SRC + "\nthis.sendToneStep = sendToneStep;", sb);
    return { sendToneStep: sb.sendToneStep, sent, clicks };
}

(async () => {
    console.log("P1: MIDI gửi OK (+3)");
    { const r = load({}); const res = await r.sendToneStep(3);
      check(res.ok === true && res.driverUsed === "midi" && r.sent.length === 3, "ok=true, driverUsed=midi, 3 CC đã gọi");
      check(res.confirmation === "MIDI_SENT_UNCONFIRMED", "confirmation=MIDI_SENT_UNCONFIRMED (đã GỬI, chưa xác nhận áp dụng)"); }

    console.log("P2: MIDI gửi lỗi, không có tọa độ chuột");
    { const r = load({ midiOk: () => false }); const res = await r.sendToneStep(2);
      check(res.ok === false && !res.confirmation, "ok=false, không có confirmation"); }

    console.log("P3: chưa cấu hình MIDI và tọa độ");
    { const r = load({ port: "" }); const res = await r.sendToneStep(2);
      check(res.ok === false && /Chưa cấu hình/.test(res.detail || ""), "ok=false + detail rõ ràng"); }

    console.log("P4: không có MIDI, fallback chuột");
    { const r = load({ port: "", point: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }); const res = await r.sendToneStep(-2);
      check(res.ok === true && res.driverUsed === "mouse" && r.clicks.length === 2, "ok=true, driverUsed=mouse, 2 click");
      check(res.confirmation === "CLICK_SENT_UNCONFIRMED", "confirmation=CLICK_SENT_UNCONFIRMED"); }

    console.log("P5: semitone=0 không gửi gì");
    { const r = load({}); const res = await r.sendToneStep(0); check(res.ok === true && res.driverUsed === "none" && r.sent.length === 0 && r.clicks.length === 0, "no-op"); }

    console.log("P6 [D9 — đã sửa ở AI-ALG-04, nay là kiểm chứng]: MIDI gửi được 1/3 rồi lỗi, có fallback chuột");
    { const r = load({ midiOk: (n) => n < 1, point: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }); const res = await r.sendToneStep(3);
      const total = r.sent.length + r.clicks.length;
      console.log(`  ℹ️ MIDI đã gửi ${r.sent.length} bước + chuột ${r.clicks.length} click = ${total} bước (yêu cầu 3) → ${total > 3 ? "DỊCH DƯ" : "đúng"}`);
      check(total === 3, "tổng bước = 3 (không dịch dư)"); if (total > 3) known++; }

    console.log(fail === 0 ? `\nPASS ModPipelineA03 (known defects reproduced: ${known})` : `\nFAIL ModPipelineA03 (${fail} lỗi)`);
    process.exit(fail === 0 ? 0 : 1);
})();
