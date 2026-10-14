/**
 * AI-ALG-04 (D8 + D10) — pipeline MOD đầu-cuối trong MÔ PHỎNG: ModEngine THẬT (KeyEngine stub) -> applyModEvent THẬT (trích từ renderer.js)
 * -> vocalCommandRouter THẬT (MIDI/chuột giả) -> MÔ HÌNH TONE có trạng thái. Kiểm TỔNG DỊCH THỰC TẾ của tone, không chỉ payload sự kiện.
 * Chạy: node tests/unit/ModPipelineA04.verify.js   (AUTOMENU_ROOT=<code cũ> để lấy số liệu "trước sửa")
 * PHẦN MỀM/MÔ PHỎNG — KHÔNG phải phần cứng Windows/Auto-Tune/nhạc thật.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { loadRouter, POINTS, ROOT } = require("../helpers/toneRig");
let fail = 0; const table = [];
function check(c, m) { if (c) console.log("  ✅ " + m); else { fail++; console.log("  ❌ " + m); } }
const MOD_SRC = fs.readFileSync(path.join(ROOT, "ui/js/engines/modEngine.js"), "utf8");
const REN = fs.readFileSync(path.join(ROOT, "ui/js/renderer.js"), "utf8");
const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const a = REN.indexOf("async function applyModEvent(data) {"); const b = REN.indexOf("\n}\n", a) + 3;
const APPLY_SRC = REN.slice(a, b);
if (a < 0) { console.log("❌ không trích được applyModEvent"); process.exit(1); }

// Mỗi "phiên" = 1 router + 1 ModEngine + applyModEvent thật dùng chung 1 sandbox (chung window.*, chung tone).
function session(o = {}) {
    const r = loadRouter(o); const sb = r.sb;
    let t = 0; const ints = []; const stages = [];
    sb.Date = { now: () => t };
    sb.setInterval = (f, m) => { ints.push({ f, m }); return ints.length; }; sb.clearInterval = () => { ints.length = 0; };
    sb.document = { getElementById: () => null };
    sb.electronAPI.reportAiResult = () => {};
    sb.originalKey = o.originalKey || "C Major"; sb.aiSemitoneOffset = 0;
    sb.transposeKey = (k, s) => k + "+" + s; sb.updateModInfo = () => {}; sb.setStatus = () => {};
    sb.isManualOverrideActive = () => false; sb.isAiControlActive = () => false;
    sb.recordModStage = (stage, info) => stages.push({ stage, ...(info || {}) });
    const feed = { root: 0, mode: "Major", conf: 0.9 };
    sb.KeyEngine = { MIN_CONFIDENCE: 0.35, NOTE_NAMES: NOTES,
        shortestSemitoneDelta: (x, y) => { let d = (y - x + 12) % 12; return d > 6 ? d - 12 : d; },
        estimateKeyFromChroma: () => ({ rootIndex: feed.root, mode: feed.mode, confidence: feed.conf }) };
    vm.createContext; // (sb đã là context)
    vm.runInContext(MOD_SRC + "\nthis.ModEngine = ModEngine;\n" + APPLY_SRC + "\nthis.applyModEvent = applyModEvent;", sb);
    const events = []; const pending = [];
    const startMod = (rootIdx, withMode) => sb.ModEngine.start(rootIdx === undefined ? 0 : rootIdx,
        (d) => { events.push(d); pending.push(sb.applyModEvent({ time: "00:00", semitone: d.semitone, kind: d.kind })); },
        () => false, undefined, withMode === false ? undefined : { originalMode: /minor/i.test(sb.originalKey) ? "Minor" : "Major" });
    const hold = async (root, mode, ticks = 10, conf) => { feed.root = root; feed.mode = mode; if (conf !== undefined) feed.conf = conf;
        for (let i = 0; i < ticks; i++) { t += 1000; ints.slice().forEach((x) => x.f()); }
        await Promise.all(pending.splice(0)); };
    return { r, sb, startMod, hold, events, stages, tone: r.tone, state: () => (r.getToneState ? r.getToneState() : null) };
}
const C = 0, D = 2, F = 5, G = 7, A = 9;
function report(name, s, expectOffset, extra) { table.push(`${name} | payload: [${s.events.map((e) => e.semitone).join(", ")}] | tone thật dịch ${s.tone.offset} (mong đợi ${expectOffset})${extra || ""}`); }

(async () => {
    console.log("D8-1: C → G → D");
    { const s = session(); s.startMod(); await s.hold(G, "Major"); await s.hold(D, "Major"); report("C→G→D", s, 2);
      check(s.tone.offset === 2, `tone thật = +2 (thực tế ${s.tone.offset})`); }
    console.log("D8-2/D10-1: C → G → C (quay về Key gốc)");
    { const s = session(); s.startMod(); await s.hold(G, "Major"); await s.hold(C, "Major"); report("C→G→C", s, 0);
      check(s.events.length === 2 && s.events[1].semitone === 0, "ModEngine PHÁT sự kiện thứ 2 (reset về gốc), không im lặng");
      check(s.events[1] && s.events[1].kind === "RETURN_TO_ORIGINAL" && s.events[1].resetOffset === true, "sự kiện mang kind=RETURN_TO_ORIGINAL, resetOffset=true (không phải 'no-op semitone:0')");
      check(s.tone.offset === 0, `tone thật về 0 (thực tế ${s.tone.offset})`); }
    console.log("D8-3: C → G → F");
    { const s = session(); s.startMod(); await s.hold(G, "Major"); await s.hold(F, "Major"); report("C→G→F", s, 5);
      check(s.tone.offset === 5, `tone thật = +5 (thực tế ${s.tone.offset})`); }
    console.log("D8-4: C → G → A minor (giọng tương đối CỦA KEY GỐC = vẫn ở Key gốc)");
    { const s = session(); s.startMod(); await s.hold(G, "Major"); await s.hold(A, "Minor"); report("C→G→Am", s, 0);
      check(s.tone.offset === 0, `tone thật = 0, không phải -3 (thực tế ${s.tone.offset})`); }
    console.log("D8-5: modulation lặp lại cùng một Key (G giữ lâu, rồi rời G và quay lại G)");
    { const s = session(); s.startMod(); await s.hold(G, "Major", 30); report("C→G(30s)", s, -5);
      check(s.events.length === 1 && s.tone.offset === -5, `1 sự kiện, tone -5 (thực tế ${s.events.length}/${s.tone.offset})`);
      await s.hold(D, "Major"); await s.hold(G, "Major"); report("…→D→G", s, -5);
      check(s.tone.offset === -5, `sau G→D→G tone vẫn đúng -5 (thực tế ${s.tone.offset})`); }
    console.log("D8-6: ngược chiều F (+5) → G (-5)");
    { const s = session(); s.startMod(); await s.hold(F, "Major"); await s.hold(G, "Major"); report("C→F→G", s, -5);
      check(s.tone.offset === -5, `tone thật = -5 (thực tế ${s.tone.offset})`); }
    console.log("D8-7: MIDI thất bại giữa chuỗi (modulation 2 mất MIDI, không fallback) rồi modulation 3 đồng bộ lại");
    { let failPhase = false; const s = session({ midiMode: () => (failPhase ? "fail" : "ok") }); s.startMod();
      await s.hold(G, "Major"); failPhase = true; await s.hold(D, "Major"); const mid = s.tone.offset; failPhase = false; await s.hold(F, "Major"); report("C→G→D(MIDI lỗi)→F", s, 5, ` | giữa chừng ${mid}`);
      check(mid === -5, `khi MIDI lỗi hoàn toàn: tone đứng yên ở -5 (thực tế ${mid})`);
      check(s.stages.some((x) => x.stage === "ACTION_FAILED"), "ghi ACTION_FAILED");
      check(s.tone.offset === 5, `modulation kế tiếp đồng bộ lại đúng: +5 (thực tế ${s.tone.offset})`); }
    console.log("D8-7b: MIDI đứt GIỮA 1 lệnh nhiều bước (G=-5 gửi được 2/5), không fallback, rồi modulation kế tiếp");
    { let n = 0; const s = session({ midiMode: () => (n++ < 2 ? "ok" : "fail") }); s.startMod();
      await s.hold(G, "Major"); const mid = s.tone.offset; report("C→G(đứt 2/5)", s, -5, ` | giữa chừng ${mid}`);
      check(mid === -2, `tone thật -2 (đã gửi 2/5) (thực tế ${mid})`);
      check(s.state() === null || s.state().applied === -2, "tracker ghi đúng -2 (đã gửi 2/5), không coi là -5");
      const f = s.stages.filter((x) => x.stage === "ACTION_FAILED")[0]; check(f && (f.stepsSent === undefined || f.stepsSent === 2), "log ghi stepsSent=2"); }
    console.log("D8-8: khởi động lại watcher khi đã có offset trước đó (Auto Detect / key AI nhận lại cùng Key gốc)");
    { const s = session(); s.startMod(); await s.hold(G, "Major"); const before = s.tone.offset;
      s.startMod(); await s.hold(G, "Major"); report("restart watcher", s, -5);
      check(before === -5 && s.tone.offset === -5, `sau restart tone vẫn -5, không thành -10 (thực tế ${s.tone.offset})`); }

    console.log("D10-2: C → G → C → F");
    { const s = session(); s.startMod(); await s.hold(G, "Major"); await s.hold(C, "Major"); await s.hold(F, "Major"); report("C→G→C→F", s, 5);
      check(s.tone.offset === 5, `tone thật = +5 (thực tế ${s.tone.offset})`); }
    console.log("D10-3: C → G → C khi MIDI lỗi ở lệnh quay về (không fallback)");
    { let failPhase = false; const s = session({ midiMode: () => (failPhase ? "fail" : "ok") }); s.startMod();
      await s.hold(G, "Major"); failPhase = true; await s.hold(C, "Major"); report("C→G→C(MIDI lỗi)", s, -5);
      check(s.tone.offset === -5 && s.stages.some((x) => x.stage === "ACTION_FAILED"), "tone giữ -5, ghi ACTION_FAILED (không tuyên bố đã về gốc)");
      failPhase = false; await s.hold(F, "Major"); check(s.tone.offset === 5, `lệnh kế tiếp (F) đồng bộ lại đúng +5 (thực tế ${s.tone.offset})`); }
    console.log("D10-4: C → G → C khi chỉ có chuột (không MIDI)");
    { const s = session({ port: "", point: POINTS }); s.startMod(); await s.hold(G, "Major"); await s.hold(C, "Major"); report("C→G→C (chuột)", s, 0);
      check(s.tone.offset === 0 && s.tone.midi === 0, `tone thật về 0 chỉ bằng chuột (thực tế ${s.tone.offset})`); }
    console.log("D10-5: C ổn định, không phát reset dư");
    { const s = session(); s.startMod(); await s.hold(C, "Major", 40); report("C ổn định", s, 0);
      check(s.events.length === 0 && s.tone.offset === 0 && s.tone.midiCalls === 0, "0 sự kiện, 0 lệnh gửi"); }
    console.log("D10-6: hai sự kiện reset liên tiếp (consumer nhận 2 lần semitone:0)");
    { const s = session(); s.startMod(); await s.hold(G, "Major"); const p1 = s.sb.applyModEvent({ time: "0", semitone: 0, kind: "RETURN_TO_ORIGINAL" }); const p2 = s.sb.applyModEvent({ time: "0", semitone: 0, kind: "RETURN_TO_ORIGINAL" }); await Promise.all([p1, p2]);
      report("reset ×2", s, 0); check(s.tone.offset === 0, `tone về 0 đúng 1 lần, không dịch ngoài ý muốn (thực tế ${s.tone.offset})`); }
    console.log("D10-7: Key gốc chưa xác nhận (rootIndex -1) hoặc confidence thấp lúc quay về");
    { const s = session(); s.startMod(-1); await s.hold(G, "Major", 20); check(s.events.length === 0 && s.tone.offset === 0, "gốc không hợp lệ → không phát sự kiện, không dịch");
      const s2 = session(); s2.startMod(); await s2.hold(G, "Major"); await s2.hold(C, "Major", 20, 0.2); check(s2.events.length === 1 && s2.tone.offset === -5, "về gốc nhưng confidence thấp → không reset"); }
    console.log("Legacy (không truyền originalMode): C → G → C vẫn phải reset được");
    { const s = session(); s.startMod(0, false); await s.hold(G, "Major"); await s.hold(C, "Major"); report("legacy C→G→C", s, 0);
      check(s.tone.offset === 0, `tone thật 0 (thực tế ${s.tone.offset})`); }

    console.log("\nBẢNG:"); table.forEach((x) => console.log("  " + x));
    console.log(fail === 0 ? "\nPASS ModPipelineA04" : `\nFAIL ModPipelineA04 (${fail} lỗi)`);
    process.exit(fail === 0 ? 0 : 1);
})();
