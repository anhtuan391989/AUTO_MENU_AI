/**
 * KEY-TIMELINE-MOD-01 — bài có 2 đoạn Key trên server: hiện "phút - tone", tới phút thì tự gửi sang Key (-> Auto-Tune);
 * SoundShifter chỉ chạy khi bấm SET, MOD OFF đưa SoundShifter về mặc định (Semitones 0 + Bypass).
 * Kiểm bằng mô phỏng phần mềm (đồng hồ giả, MIDI giả, mạng giả) — KHÔNG phải Windows/Studio One/SoundShifter thật.
 * Chạy: node tests/unit/KeyTimelineMod01.verify.js
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const KT = require(path.join(ROOT, "core/integration/KeyTimeline.js"));
const { KeyServerSync } = require(path.join(ROOT, "core/integration/KeyServerSync.js"));
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log("  OK   " + m); } else { fail++; console.log("  FAIL " + m + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); } };

// lấy nguyên thân hàm theo đếm ngoặc (không dùng regex lười)
function extractFn(src, name) {
    const i = src.indexOf("function " + name + "(");
    if (i < 0) return "";
    let j = src.indexOf("{", i), depth = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === "{") depth++;
        else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(i, k + 1); }
    }
    return "";
}

(async () => {
    console.log("== A. Kế hoạch từ đoạn của server ==");
    {
        const p = KT.buildPlan([{ startSec: 0, key: "Eb", mode: "major" }, { startSec: 143, key: "E", mode: "major" }]);
        ok(p && p.changes.length === 1 && p.changes[0].label === "02:23 - Eb -> E", "A1. 02:23 - Eb -> E", p && p.changes);
        ok(p.changes[0].semitone === 1 && p.changes[0].time === "02:23", "A2. +1 bán cung, thời gian 02:23");
        const pm = KT.buildPlan([{ startSec: 0, key: "C", mode: "minor" }, { startSec: 200, key: "C#", mode: "minor" }]);
        ok(pm.changes[0].from === "Cm" && pm.changes[0].to === "C#m", "A3. giọng thứ hiện Cm -> C#m");
        ok(KT.buildPlan([{ startSec: 0, key: "C", mode: "major" }]) === null, "A4. chỉ 1 đoạn -> không có kế hoạch");
        ok(KT.buildPlan([{ startSec: 0, key: "C", mode: "major" }, { startSec: 90, key: "C", mode: "major" }]) === null, "A5. 2 đoạn cùng Key -> không có đổi tone");
        const pu = KT.buildPlan([{ startSec: 300, key: "F", mode: "major" }, { startSec: 0, key: "D", mode: "major" }, { startSec: 100, key: "?", mode: "major" }, { startSec: -5, key: "G" }]);
        ok(pu && pu.changes.length === 1 && pu.changes[0].from === "D" && pu.changes[0].to === "F" && pu.changes[0].semitone === 3, "A6. tự sắp xếp theo thời gian, bỏ đoạn hỏng (Key lạ/thời gian âm)", pu && pu.changes);
        ok(KT.tonicShift(0, "major", 7, "major") === -5 && KT.tonicShift(7, "major", 0, "major") === 5, "A7. đi đường ngắn nhất (C->G = -5, G->C = +5)");
        ok(KT.tonicShift(9, "minor", 0, "major") === 0, "A8. Am -> C (giọng tương đối) = 0 bán cung");
        const pk = KT.buildPlan([{ startSec: 0, khoa: "G", mode: "major" }, { startSec: 61, khoa: "A", mode: "major" }]);
        ok(pk && pk.changes[0].label === "01:01 - G -> A", "A9. nhận cả tên trường khoa của /song-full");
    }

    console.log("== B. Đoạn đang phát tại giây X ==");
    {
        const p = KT.buildPlan([{ startSec: 0, key: "C", mode: "major" }, { startSec: 100, key: "D", mode: "major" }, { startSec: 200, key: "E", mode: "major" }]);
        ok(KT.segmentIndexAt(p, 0) === 0 && KT.segmentIndexAt(p, 99.9) === 0 && KT.segmentIndexAt(p, 100) === 1 && KT.segmentIndexAt(p, 250) === 2, "B1. 0->0, 99.9->0, 100->1, 250->2");
    }

    console.log("== C. Phút hiện tại của bài ==");
    {
        const mpc = { positionMs: 60000, durationMs: 240000, state: 2, timestamp: 1000 };
        ok(KT.estimatePositionSec({ source: "mpc-hc", mpcSnapshot: mpc, songStartedAtMs: 0, now: 3000 }) === 62, "C1. MPC-HC đang phát: vị trí thật + thời gian trôi qua (60s + 2s)");
        ok(KT.estimatePositionSec({ source: "mpc-hc", mpcSnapshot: { ...mpc, state: 1 }, songStartedAtMs: 0, now: 9000 }) === 60, "C2. MPC-HC đang dừng: không cộng thời gian trôi");
        ok(KT.estimatePositionSec({ source: "smtc", mpcSnapshot: mpc, songStartedAtMs: 10000, now: 15000 }) === 5, "C3. trình duyệt (SMTC): tính từ lúc thấy bài bắt đầu (5s)");
        ok(KT.estimatePositionSec({ source: null, mpcSnapshot: null, songStartedAtMs: undefined, now: 1 }) === null, "C4. không có gì -> null (không bịa)");
    }

    console.log("== D. Bộ canh giờ (đồng hồ giả) ==");
    {
        const plan = KT.buildPlan([{ startSec: 0, key: "Eb", mode: "major" }, { startSec: 143, key: "E", mode: "major" }]);
        let pos = 0, timers = 0, cleared = 0, tickFn = null; const fired = [];
        const mk = (getPos) => new KT.KeyTimelineRunner({
            getPositionSec: getPos || (() => pos), onFire: (e) => fired.push(e),
            setIntervalFn: (f) => { timers++; tickFn = f; return { id: timers }; }, clearIntervalFn: () => { cleared++; tickFn = null; },
        });
        const r = mk();
        r.arm(plan);
        ok(r.isArmed() && timers === 1 && fired.length === 0, "D1. bắt đầu bài: không gửi gì (đang ở Key gốc)");
        pos = 142.9; tickFn();
        ok(fired.length === 0, "D2. 02:22.9 chưa tới -> chưa gửi");
        pos = 143; tickFn();
        ok(fired.length === 1 && fired[0].time === "02:23" && fired[0].fromName === "Eb" && fired[0].toName === "E" && fired[0].toKeyName === "E Major", "D3. đúng 02:23 -> gửi 1 lần Eb -> E (E Major)", fired);
        pos = 150; tickFn(); pos = 200; tickFn();
        ok(fired.length === 1, "D4. qua đoạn rồi không gửi lặp");
        pos = 10; tickFn();
        ok(fired.length === 2 && fired[1].toName === "Eb" && fired[1].toKeyName === "Eb Major", "D5. tua lùi về đầu bài -> trả Key gốc đúng 1 lần", fired[1]);
        r.disarm();
        ok(!r.isArmed() && cleared >= 1, "D6. disarm dừng timer");
        pos = 500; if (tickFn) tickFn();
        ok(fired.length === 2, "D7. sau disarm không gửi nữa");

        const f2 = []; const late = new KT.KeyTimelineRunner({ getPositionSec: () => 300, onFire: (e) => f2.push(e), setIntervalFn: () => 1, clearIntervalFn() {} });
        late.arm(plan);
        ok(f2.length === 1 && f2[0].toName === "E", "D8. mở Menu giữa bài (đã qua 02:23) -> áp ngay Key đúng của đoạn hiện tại");

        let pn = null; const f3 = []; const noPos = new KT.KeyTimelineRunner({ getPositionSec: () => pn, onFire: (e) => f3.push(e), setIntervalFn: () => 1, clearIntervalFn() {} });
        noPos.arm(plan); noPos.tick();
        const thr = new KT.KeyTimelineRunner({ getPositionSec: () => { throw new Error("x"); }, onFire: () => {}, setIntervalFn: () => 1, clearIntervalFn() {} });
        let threw = false; try { thr.arm(plan); thr.tick(); } catch (e) { threw = true; }
        ok(f3.length === 0 && !threw, "D9. chưa biết vị trí / lỗi đọc vị trí -> không gửi, không crash");

        const f4 = []; let pos4 = 0;
        const planSame = KT.buildPlan([{ startSec: 0, key: "C", mode: "major" }, { startSec: 50, key: "C", mode: "major" }, { startSec: 100, key: "D", mode: "major" }]);
        const r4 = new KT.KeyTimelineRunner({ getPositionSec: () => pos4, onFire: (e) => f4.push(e), setIntervalFn: () => 1, clearIntervalFn() {} });
        r4.arm(planSame); pos4 = 60; r4.tick(); pos4 = 100; r4.tick();
        ok(f4.length === 1 && f4[0].toName === "D", "D10. đoạn cùng Key (C -> C) không gửi; chỉ gửi khi Key thật sự đổi");
    }

    console.log("== E. Lấy đoạn từ server (route /song-full có sẵn, không cần sửa server) ==");
    {
        const calls = [];
        const mkSync = (res) => new KeyServerSync({ serverUrl: "https://x.test", logger: { log() {} }, fetchFn: async (url) => { calls.push(url); return res; } });
        const good = mkSync({ ok: true, status: 200, json: async () => ({ doans: [{ startSec: 0, khoa: "Eb", mode: "major" }, { startSec: 143, khoa: "E", mode: "major" }] }) });
        const r = await good.fetchSegments("song_1");
        ok(r.ok && r.segments.length === 2 && r.segments[1].key === "E" && r.segments[1].startSec === 143, "E1. đọc đoạn từ /song-full", r);
        ok(calls[0] === "https://x.test/song-full?id=song_1", "E2. gọi đúng route /song-full?id=...", calls);
        const bad = await mkSync({ ok: false, status: 500, json: async () => null }).fetchSegments("s");
        ok(bad.ok === false, "E3. server lỗi -> ok=false, không throw");
        const none = await mkSync({ ok: true, status: 200, json: async () => ({ x: 1 }) }).fetchSegments("s");
        ok(none.ok === false, "E4. trả lời không có doans -> ok=false");
        ok((await good.fetchSegments("")).ok === false, "E5. không có songId -> ok=false, không gọi mạng");
        const off = new KeyServerSync({ isEnabled: () => false, fetchFn: async () => { throw new Error("không được gọi"); } });
        ok((await off.fetchSegments("s")).error === "disabled", "E6. người dùng tắt đồng bộ -> không gọi server");
    }

    console.log("== F. Renderer: tới phút -> Key gửi Auto-Tune, KHÔNG chạm SoundShifter ==");
    {
        const R = read("ui/js/renderer.js");
        const fire = extractFn(R, "applyServerTimelineFire");
        ok(fire.length > 100, "F0. có hàm applyServerTimelineFire");
        ok(/applyActiveKeyToPlugin\(/.test(fire) && !/SoundShifter|sendToneStep|sendToneTarget/.test(fire), "F1. đường tự động đi qua khối Key (applyActiveKeyToPlugin), không gọi SoundShifter/tone-step");
        ok(/ModEngine\.start\(originalRootIndex, \(data\) => \{\s*\/\/[^\n]*\n\s*if \(__serverTimelinePlan\)/.test(R), "F2. bài đã có kế hoạch từ server -> ModEngine (dò audio) không gửi thêm lệnh chồng");
        ok(/resetSoundShifterToDefault\(\)/.test(extractFn(R, "turnManualOverrideOff")), "F3. MOD OFF gọi resetSoundShifterToDefault()");
        ok(/applyPendingServerTimeline\(\)/.test(extractFn(R, "turnManualOverrideOff")), "F4. tắt MOD tay -> áp đoạn Key đang giữ");
        ok(/onKeyTimelinePlan/.test(R) && /onKeyTimelineFire/.test(R), "F5. renderer nhận key-timeline-plan và key-timeline-fire");
        ok(/function startModulationWatcher[\s\S]*?renderServerTimelineDisplay\(\)/.test(R) && /function resetAiDisplaysToListening[\s\S]*?renderServerTimelineDisplay\(\)/.test(R), "F6. chữ LISTENING không đè mất dòng 'phút - tone'");

        // chạy thật 3 hàm trong sandbox với mock
        const sent = []; const reports = []; const stages = []; const infoCalls = [];
        const sb = {
            console: { log() {}, warn() {}, error() {} }, Math, Array,
            keySource: { manual: { active: false, sending: false }, songDb: { active: true, value: "Eb Major" } },
            _manualOverride: false,
            isManualOverrideActive: () => sb._manualOverride,
            manualToneSet: false,
            applyActiveKeyToPlugin: (label) => sent.push({ label, value: sb.keySource.songDb.value }),
            recordModStage: (s, i) => stages.push({ s, i }),
            updateModInfo: (...a) => infoCalls.push(a),
            window: { electronAPI: { reportAiResult: (k, d) => reports.push({ k, d }) } },
        };
        vm.createContext(sb);
        vm.runInContext("let __serverTimelinePlan = null, __serverTimelineNextIdx = 0, __serverTimelinePending = null;\n"
            + extractFn(R, "renderServerTimelineDisplay") + "\n" + fire + "\n" + extractFn(R, "applyPendingServerTimeline")
            + "\nthis.api = { setPlan(p){ __serverTimelinePlan = p; __serverTimelineNextIdx = 0; }, fire: applyServerTimelineFire, pending: applyPendingServerTimeline, getPending(){ return __serverTimelinePending; }, next(){ return __serverTimelineNextIdx; }, render: renderServerTimelineDisplay };", sb);
        const plan = { changes: [{ index: 1, time: "02:23", from: "Eb", to: "E", semitone: 1 }] };
        const evt = { index: 1, time: "02:23", fromName: "Eb", toName: "E", toKeyName: "E Major" };

        sb.api.setPlan(plan); sb.api.render();
        ok(infoCalls.length === 1 && infoCalls[0][0] === "02:23" && infoCalls[0][1] === "Eb" && infoCalls[0][2] === "E" && infoCalls[0][3] === 1, "F7. khung MOD hiện: 02:23 | Eb → E | +1", infoCalls);

        ok(sb.api.fire(evt) === true && sent.length === 1 && sent[0].value === "E Major" && /02:23/.test(sent[0].label), "F8. tới phút: Key đổi sang E Major và gửi xuống Auto-Tune qua khối Key", sent);
        ok(reports.length === 1 && reports[0].k === "mod" && reports[0].d.semitone === 1 && reports[0].d.time === "02:23", "F9. báo kết quả MOD cho Core (+1 lúc 02:23)", reports);

        sent.length = 0; sb.keySource.songDb.value = "Eb Major"; sb.keySource.manual.active = true;
        ok(sb.api.fire(evt) === false && sent.length === 0, "F10. Key đang chọn TAY -> không tự đổi");
        sb.keySource.manual.active = false; sb.keySource.songDb.active = false;
        ok(sb.api.fire(evt) === false && sent.length === 0, "F11. Song Database không còn hiệu lực -> không tự đổi");
        sb.keySource.songDb.active = true; sb._manualOverride = true;
        ok(sb.api.fire(evt) === false && sent.length === 0 && sb.api.getPending() === evt, "F12. MOD tay đang bật -> giữ lại, không đánh nhau với lệnh tay");
        sb._manualOverride = false; sb.api.pending();
        ok(sent.length === 1 && sent[0].value === "E Major" && sb.api.getPending() === null, "F13. tắt MOD tay -> áp đúng Key đang giữ, 1 lần");
        sb.api.setPlan(null); sent.length = 0;
        ok(sb.api.fire(evt) === false && sent.length === 0, "F14. bài không có kế hoạch -> sự kiện lạ bị bỏ");
    }

    console.log("== G. MOD OFF: SoundShifter về mặc định như ảnh (Semitones 0, Bypass BẬT) ==");
    {
        const ROUTER = read("ui/js/vocalCommandRouter.js");
        const mk = (port = "loopMIDI", fail = false) => {
            const sent = [];
            const sb = { console: { log() {}, warn() {}, error() {} }, Promise, Math, JSON, Number, Array, Error, Set, Date,
                setTimeout: (f) => { f(); return 0; }, clearTimeout() {}, getSetting: (k) => (k === "midiOutputPort" ? port : undefined), getCoordinate: () => null,
                sendMidiCC: async (cc, v) => { sent.push([cc, v]); return !fail; }, sendMidiNotePulse: async () => true, window: {} };
            vm.createContext(sb);
            vm.runInContext(ROUTER + "\nthis.R = { reset: resetSoundShifterToDefault, step: sendToneStepToSoundShifter, power: setSoundShifterPower, st: soundShifterState };", sb);
            return { R: sb.R, sent };
        };
        {
            const { R, sent } = mk();
            await R.power(true); await R.step(5); sent.length = 0;
            const r = await R.reset();
            ok(r.ok && sent.length === 2 && sent[0][0] === 22 && sent[0][1] === 64 && sent[1][0] === 24 && sent[1][1] === 127, "G1. đang +5 -> MOD OFF gửi CC22=64 (Semitones 0) rồi CC24=127 (Bypass BẬT)", sent);
            ok(R.st.semitones === 0, "G2. trạng thái nội bộ về 0");
        }
        {
            // SET bị lỗi giữa chừng: Menu "tưởng" đã dịch 0 nhưng plugin kẹt mức lạ -> reset vẫn gửi 0 tuyệt đối
            const { R, sent } = mk(); R.st.semitones = 0; sent.length = 0;
            await R.reset();
            ok(sent[0][0] === 22 && sent[0][1] === 64, "G3. luôn gửi 0 TUYỆT ĐỐI, không phụ thuộc Menu nhớ đã dịch bao nhiêu");
        }
        {
            const none = mk(""); const r = await none.R.reset();
            ok(r.ok === false && none.sent.length === 0, "G4. chưa cấu hình cổng MIDI -> báo lỗi, không gửi");
            const bad = mk("loopMIDI", true); const r2 = await bad.R.reset();
            ok(r2.ok === false && bad.sent.length === 2, "G5. gửi lỗi -> ok=false (hiện đỏ), vẫn thử bật Bypass", bad.sent);
        }
        {
            // đường tự động không bao giờ gọi vào SoundShifter: Key timeline chỉ tồn tại ở renderer.applyActiveKeyToPlugin
            const { R, sent } = mk(); sent.length = 0;
            ok(sent.length === 0, "G6. (đối chứng) chưa SET thì không có lệnh SoundShifter nào");
        }
    }

    console.log("== H. Nối dây main/preload ==");
    {
        const M = read("app/main.js"), P = read("app/preload.js");
        ok(/require\("\.\.\/core\/integration\/KeyTimeline"\)/.test(M) && /key-timeline-plan/.test(M) && /key-timeline-fire/.test(M), "H1. main.js nạp KeyTimeline và dùng 2 kênh plan/fire");
        ok(/onKeyTimelinePlan[\s\S]*key-timeline-plan/.test(P) && /onKeyTimelineFire[\s\S]*key-timeline-fire/.test(P), "H2. preload.js mở đúng 2 kênh cho renderer");
        ok(/fetchSegments\(/.test(M) && /resetKeyTimeline\(/.test(M), "H3. main.js lấy đoạn từ server và reset khi đổi bài/mất bài");
        const { execFileSync } = require("child_process");
        let ch = ""; try { ch = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString(); } catch (e) {}
        ok(!ch.split("\n").some((l) => /\.(html|css)$/i.test(l.trim())), "H4. không sửa file .html/.css nào");
    }

    console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
