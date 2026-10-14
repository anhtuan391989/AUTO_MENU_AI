/**
 * AI-ALG-03 — ModEngine: D2 (đổi mode cùng tonic bị bỏ sót) + D3 (giọng tương đối thành -3 bán cung giả).
 * Chạy: node tests/unit/ModEngineA03.verify.js
 * KeyEngine được STUB (đầu vào xác định) để kiểm đúng LOGIC phân loại của ModEngine; khớp-với-KeyEngine-thật đã có ở ModEngineV2.verify.js.
 * Đây là kiểm thử PHẦN MỀM (mô phỏng), không phải kiểm thử phần cứng/nhạc thật.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
let fail = 0;
function check(c, m) { if (c) console.log("  ✅ " + m); else { fail++; console.log("  ❌ " + m); } }

const SRC = fs.readFileSync(path.resolve(__dirname, "../../ui/js/engines/modEngine.js"), "utf8");
const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

function rig(startArgs) {
    let t = 0; const ints = [];
    const sb = { console: { log() {}, warn() {}, error() {} }, Date: { now: () => t },
        setInterval: (f, m) => { ints.push({ f, m }); return ints.length; }, clearInterval: () => { ints.length = 0; } };
    sb.window = sb;
    const feed = { root: 0, mode: "Major", conf: 0.9 };
    sb.KeyEngine = { MIN_CONFIDENCE: 0.35, NOTE_NAMES: NOTES,
        shortestSemitoneDelta: (a, b) => { let d = (b - a + 12) % 12; return d > 6 ? d - 12 : d; },
        estimateKeyFromChroma: () => ({ rootIndex: feed.root, mode: feed.mode, confidence: feed.conf }) };
    vm.createContext(sb);
    vm.runInContext(SRC + "\nthis.ModEngine = ModEngine;", sb);
    const mods = [], states = [];
    const opts = startArgs && startArgs.legacy ? undefined : { originalMode: (startArgs && startArgs.mode) || "Major" };
    sb.ModEngine.start(0, (d) => mods.push(d), () => !!(startArgs && startArgs.manual), (s, p) => states.push({ s, p }), opts);
    const tick = (n) => { for (let i = 0; i < n; i++) { t += 1000; ints.forEach((x) => x.f()); } };
    const set = (root, mode, conf) => { feed.root = root; feed.mode = mode; if (conf !== undefined) feed.conf = conf; };
    const labelEvents = () => states.filter((x) => x.s === "KEY_LABEL_CHANGED").map((x) => x.p);
    return { set, tick, mods, states, labelEvents };
}

console.log("T1 D2: C Major -> C Minor (cùng tonic, đổi mode), 10 s");
{ const r = rig(); r.set(0, "Minor"); r.tick(10);
  check(r.mods.length === 0, "KHÔNG phát onModulation (không dịch pitch)");
  const ev = r.labelEvents(); check(ev.length === 1 && ev[0].kind === "MODE_CHANGE" && ev[0].from === "C Major" && ev[0].to === "C Minor" && ev[0].pitchShift === false, "phát đúng 1 sự kiện KEY_LABEL_CHANGED kind=MODE_CHANGE (không bị bỏ sót)"); }

console.log("T2 D3: C Major -> A Minor (giọng tương đối, cùng tập nốt), 10 s");
{ const r = rig(); r.set(9, "Minor"); r.tick(10);
  check(r.mods.length === 0, "KHÔNG phát onModulation -3 bán cung giả");
  const ev = r.labelEvents(); check(ev.length === 1 && ev[0].kind === "RELATIVE_KEY" && ev[0].pitchShift === false, "chỉ ghi nhận KEY_LABEL_CHANGED kind=RELATIVE_KEY"); }

console.log("T3: C Major -> G Major (đổi tonic thật), 10 s");
{ const r = rig(); r.set(7, "Major"); r.tick(10);
  check(r.mods.length === 1 && r.mods[0].semitone === -5, "phát đúng 1 modulation, semitone=-5 (hành vi cũ giữ nguyên: bán cung ngắn nhất theo root)");
  check(r.mods[0].kind === "MODULATION" && r.mods[0].targetKey === "G Major", "payload cộng thêm kind + targetKey, field cũ giữ nguyên");
  check(r.states.some((x) => x.s === "MODULATION_DETECTED"), "vẫn phát state MODULATION_DETECTED"); }

console.log("T4: Key ổn định (C Major) 30 s");
{ const r = rig(); r.tick(30); check(r.mods.length === 0 && r.labelEvents().length === 0, "0 sự kiện"); }

console.log("T5: confidence thấp (C Minor, conf 0.2) 15 s");
{ const r = rig(); r.set(0, "Minor", 0.2); r.tick(15); check(r.mods.length === 0 && r.labelEvents().length === 0, "không tính vào streak, 0 sự kiện"); }

console.log("T6: dao động ngắn G Major 2 tick rồi về C Major");
{ const r = rig(); r.set(7, "Major"); r.tick(2); r.set(0, "Major"); r.tick(10); check(r.mods.length === 0 && r.labelEvents().length === 0, "không báo (chưa đủ liên tiếp)"); }

console.log("T7: đổi tonic nhưng không đủ bằng chứng (2 tick)");
{ const r = rig(); r.set(2, "Major"); r.tick(2); check(r.mods.length === 0, "chưa báo modulation"); }

console.log("T8: Manual override đang bật");
{ const r = rig({ manual: true }); r.set(7, "Major"); r.tick(10); check(r.mods.length === 0 && r.labelEvents().length === 0, "không phát gì"); }

console.log("T9: tonic đổi nhưng mode xen kẽ (G Major/G Minor luân phiên) — không đủ streak theo NHÃN");
{ const r = rig(); for (let i = 0; i < 6; i++) { r.set(7, i % 2 ? "Minor" : "Major"); r.tick(1); } check(r.mods.length === 0, "không báo modulation từ nhãn dao động"); }

console.log("T10: modulation rồi về giọng tương đối của giọng MỚI (C Major -> G Major -> E Minor)");
{ const r = rig(); r.set(7, "Major"); r.tick(5); r.set(4, "Minor"); r.tick(10);
  check(r.mods.length === 1, "chỉ 1 modulation (G Major); E Minor là giọng tương đối của G Major => không dịch thêm");
  check(r.labelEvents().some((e) => e.kind === "RELATIVE_KEY" && e.to === "E Minor"), "E Minor ghi nhận RELATIVE_KEY so với baseline G Major"); }

console.log("T11: tương thích ngược — gọi start() KHÔNG truyền options (caller cũ)");
{ const r = rig({ legacy: true }); r.set(7, "Major"); r.tick(10);
  check(r.mods.length === 1 && r.mods[0].semitone === -5, "hành vi cũ giữ nguyên 100% (root-only)");
  check(r.labelEvents().length === 0, "không phát state mới khi không có originalMode"); }

console.log(fail === 0 ? "\nPASS ModEngineA03" : `\nFAIL ModEngineA03 (${fail} lỗi)`);
process.exit(fail === 0 ? 0 : 1);
