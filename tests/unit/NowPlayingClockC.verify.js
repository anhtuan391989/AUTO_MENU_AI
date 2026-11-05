/**
 * NOW-PLAYING-CLOCK-C — thời lượng bài đang phát: hiện "01:23 / 04:05" cạnh NOW PLAYING + đồng hồ MOD theo vị trí thật.
 * Kiểm bằng mô phỏng phần mềm (đồng hồ giả, snapshot giả) — KHÔNG phải Windows/MPC-HC/trình duyệt thật.
 * Chạy: node tests/unit/NowPlayingClockC.verify.js
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.env.AUTOMENU_ROOT || path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const Clock = require(path.join(ROOT, "core/integration/NowPlayingClock.js"));
const KT = require(path.join(ROOT, "core/integration/KeyTimeline.js"));
const Arbitrator = require(path.join(ROOT, "core/integration/NowPlayingArbitrator.js"));
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
// lấy nguyên 1 khối "(function name() { ... })();" theo đếm ngoặc
function extractIife(src, name) {
    const marker = "(function " + name + "() {";
    const i = src.indexOf(marker);
    if (i < 0) return "";
    let depth = 0;
    for (let k = i + marker.length - 1; k < src.length; k++) {
        if (src[k] === "{") depth++;
        else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(i, src.indexOf("();", k) + 3); }
    }
    return "";
}

// ---------- A. NowPlayingClock.compute ----------
console.log("== A. Tính vị trí/thời lượng thật ==");
{
    const mpc = { state: 2, positionMs: 60000, durationMs: 240000, timestamp: 1000 };
    let c = Clock.compute("mpc-hc", mpc, 3000);
    ok(c && c.positionSec === 62 && c.durationSec === 240 && c.playing === true, "A1. MPC-HC đang phát: 60s + 2s trôi = 62s / 240s", c);
    c = Clock.compute("mpc-hc", { ...mpc, state: 1 }, 99000);
    ok(c && c.positionSec === 60 && c.playing === false, "A2. MPC-HC không phát: đứng yên ở 60s", c);
    ok(Clock.compute("mpc-hc", { ...mpc, durationMs: 0 }, 3000) === null, "A3. MPC-HC chưa có thời lượng (0) -> null, không bịa");
    c = Clock.compute("mpc-hc", mpc, 1000 + 9999999);
    ok(c && c.positionSec === 240, "A4. không bao giờ vượt quá thời lượng (kẹp ở 240s)", c);

    const smtc = { positionMs: 30000, durationMs: 200000, timelineUpdatedMs: 5000, playing: true, playbackRate: 1, timestamp: 5500 };
    c = Clock.compute("smtc", smtc, 8000);
    ok(c && c.positionSec === 33 && c.durationSec === 200 && c.playing === true, "A5. Trình duyệt đang phát: 30s + 3s trôi (từ lúc ghi vị trí) = 33s", c);
    c = Clock.compute("smtc", { ...smtc, playing: false }, 99999);
    ok(c && c.positionSec === 30 && c.playing === false, "A6. Trình duyệt tạm dừng: đứng yên ở 30s", c);
    c = Clock.compute("smtc", { ...smtc, playbackRate: 2 }, 8000);
    ok(c && c.positionSec === 36, "A7. Tốc độ phát 2x: 30s + 3s*2 = 36s", c);
    c = Clock.compute("smtc", { ...smtc, timelineUpdatedMs: null }, 8000);
    ok(c && c.positionSec === 32.5, "A8. Không biết lúc ghi vị trí: dùng giờ lần poll (timestamp) làm mốc -> 30s + 2.5s", c);
    ok(Clock.compute("smtc", { application: "brave", title: "x", positionMs: null, durationMs: null }, 1) === null, "A9. Trang web không báo thời lượng (null) -> null");
    ok(Clock.compute("smtc", { ...smtc, durationMs: 0 }, 1) === null, "A10. Thời lượng 0 -> null");
    ok(Clock.compute(null, smtc, 1) === null && Clock.compute("smtc", null, 1) === null && Clock.compute("khac", smtc, 1) === null, "A11. Không có nguồn/snapshot/nguồn lạ -> null");
    // tua: snapshot mới của lần poll sau có vị trí khác -> kết quả đi theo ngay
    const afterSeek = { ...smtc, positionMs: 150000, timelineUpdatedMs: 9000, timestamp: 9100 };
    c = Clock.compute("smtc", afterSeek, 9000);
    ok(c && c.positionSec === 150, "A12. Tua tới 02:30: lần đọc kế tiếp cho 150s", c);

    ok(Clock.formatClock(125) === "02:05" && Clock.formatClock(0) === "00:00" && Clock.formatClock(59.9) === "00:59", "A13. formatClock mm:ss");
    ok(Clock.formatClock(3725) === "1:02:05", "A14. formatClock từ 1 giờ: h:mm:ss");
    ok(Clock.formatClock(null) === "--:--" && Clock.formatClock(-1) === "--:--" && Clock.formatClock(NaN) === "--:--", "A15. giá trị không hợp lệ -> --:--");
}

// ---------- B. KeyTimeline.estimatePositionSec ----------
console.log("== B. MOD lấy vị trí thật của trình duyệt ==");
{
    const smtc = { positionMs: 143000, durationMs: 250000, timelineUpdatedMs: 1000, playing: true, playbackRate: 1, timestamp: 1100 };
    ok(KT.estimatePositionSec({ source: "smtc", mpcSnapshot: null, smtcSnapshot: smtc, songStartedAtMs: 0, now: 3000 }) === 145, "B1. trình duyệt có vị trí thật: 143s + 2s = 145s (không dùng đồng hồ tính từ lúc bắt đầu)");
    ok(KT.estimatePositionSec({ source: "smtc", mpcSnapshot: null, smtcSnapshot: { application: "brave", positionMs: null, durationMs: null }, songStartedAtMs: 10000, now: 15000 }) === 5, "B2. trình duyệt KHÔNG báo vị trí: quay về cách cũ (tính từ lúc bắt đầu bài = 5s)");
    ok(KT.estimatePositionSec({ source: "smtc", mpcSnapshot: null, songStartedAtMs: 10000, now: 15000 }) === 5, "B3. không truyền smtcSnapshot (code cũ gọi y như trước): giữ nguyên 5s");
    const mpc = { state: 2, positionMs: 60000, durationMs: 240000, timestamp: 1000 };
    ok(KT.estimatePositionSec({ source: "mpc-hc", mpcSnapshot: mpc, smtcSnapshot: smtc, songStartedAtMs: 0, now: 3000 }) === 62, "B4. MPC-HC vẫn dùng vị trí MPC-HC (không bị smtcSnapshot lấn)");
    ok(KT.estimatePositionSec({ source: null, mpcSnapshot: null, songStartedAtMs: undefined, now: 1 }) === null, "B5. không có gì -> null");
}

// ---------- C. MOD đi theo khi tua bài ----------
console.log("== C. Tua tới đoạn lên tone -> MOD bắn đúng đoạn, đúng 1 lần ==");
{
    const plan = KT.buildPlan([{ startSec: 0, key: "Eb", mode: "major" }, { startSec: 143, key: "E", mode: "major" }]); // 02:23 Eb -> E
    ok(!!plan && plan.changes[0].time === "02:23", "C0. kế hoạch có đổi tone ở 02:23");

    let now = 1000;
    let smtc = { positionMs: 10000, durationMs: 250000, timelineUpdatedMs: 1000, playing: true, playbackRate: 1, timestamp: 1000 };
    const fired = [];
    let tickFn = null;
    const runner = new KT.KeyTimelineRunner({
        getPositionSec: () => KT.estimatePositionSec({ source: "smtc", mpcSnapshot: null, smtcSnapshot: smtc, songStartedAtMs: 0, now }),
        onFire: (e) => fired.push(e),
        setIntervalFn: (fn) => { tickFn = fn; return 1; },
        clearIntervalFn: () => { tickFn = null; }
    });
    runner.arm(plan);
    ok(fired.length === 0, "C1. đầu bài (10s): chưa bắn");
    now = 31000; tickFn();
    ok(fired.length === 0, "C2. nghe tới 40s: vẫn chưa bắn");
    // người nghe tua trên web tới 02:30 -> lần đọc kế tiếp của SMTC có vị trí mới
    smtc = { ...smtc, positionMs: 150000, timelineUpdatedMs: 31500, timestamp: 31600 }; now = 32000; tickFn();
    ok(fired.length === 1 && fired[0].toName === "E" && fired[0].time === "02:23", "C3. tua tới 02:30 -> MOD bắn đúng 1 lần: Eb -> E", fired);
    now = 34000; tickFn(); now = 36000; tickFn();
    ok(fired.length === 1, "C4. tiếp tục nghe: không bắn lặp");
    // tua ngược về đầu -> trở lại Key gốc (quyết định theo trạng thái)
    smtc = { ...smtc, positionMs: 5000, timelineUpdatedMs: 36500, timestamp: 36600 }; now = 37000; tickFn();
    ok(fired.length === 2 && fired[1].toName === "Eb", "C5. tua lùi về đầu bài -> trả về Key gốc Eb", fired.map((f) => f.toName));
    runner.disarm();
}

// ---------- D. Bộ phát đồng hồ trong main.js (chạy thật hàm tickNowPlayingClock) ----------
console.log("== D. main.js: bộ phát 'now-playing-position' ==");
{
    const M = read("app/main.js");
    const fnSrc = extractFn(M, "tickNowPlayingClock");
    ok(!!fnSrc, "D0. tìm thấy tickNowPlayingClock trong main.js");

    let nowMs = 100000;
    const sent = [];
    const logs = [];
    const ctx = vm.createContext({
        NowPlayingArbitrator: Arbitrator,
        // Module thật, nhưng tiêm đồng hồ giả (module tự gọi Date.now() THẬT của máy nếu không được truyền `now`).
        NowPlayingClock: { compute: (source, snap) => Clock.compute(source, snap, nowMs) },
        windowsMediaSession: { getLastSnapshot: () => ctx.__smtcLive },
        mpcHcSession: { getLatestSnapshot: () => ctx.__mpcLive },
        sendToRenderer: (ch, p) => sent.push({ ch, p }),
        Date: { now: () => nowMs }, Math, console: { log: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push("ERR " + a.join(" ")) }
    });
    vm.runInContext(`
        var latestSmtcSnapshot = null, latestMpcHcSnapshot = null, currentNowPlayingForSync = null;
        var lastClockSentKey = null, lastClockSentAt = 0, lastClockTimelineLog = null;
        var NOW_PLAYING_CLOCK_RESEND_MS = 3000;
        ${fnSrc}
    `, ctx);
    const tick = () => vm.runInContext("tickNowPlayingClock()", ctx);

    // không có bài
    tick();
    ok(sent.length === 1 && sent[0].ch === "now-playing-position" && sent[0].p === null, "D1. không có bài -> gửi null (renderer ẩn đồng hồ)", sent);
    tick(); ok(sent.length === 1, "D2. vẫn không có bài, <3s: không gửi lặp");

    // trình duyệt có thời lượng
    ctx.latestSmtcSnapshot = { application: "brave", title: "A", artist: "B" };
    ctx.currentNowPlayingForSync = { title: "A", artist: "B" };
    ctx.__smtcLive = { application: "brave", title: "A", artist: "B", positionMs: 83000, durationMs: 245000, timelineUpdatedMs: nowMs, playing: true, playbackRate: 1, timestamp: nowMs };
    tick();
    let last = sent[sent.length - 1].p;
    ok(last && last.hasTimeline === true && last.positionSec === 83 && last.durationSec === 245 && last.playing === true && last.source === "smtc", "D3. trình duyệt có thời lượng -> gửi 83s / 245s", last);
    const n3 = sent.length;
    nowMs += 300; tick();
    ok(sent.length === n3, "D4. cùng giây hiển thị (+0.3s): không gửi thừa");
    nowMs += 800; tick();
    last = sent[sent.length - 1].p;
    ok(sent.length === n3 + 1 && last.positionSec > 84 && last.positionSec < 85, "D5. sang giây mới: gửi 84.x giây", last);
    // tua: lần poll sau có vị trí khác
    ctx.__smtcLive = { ...ctx.__smtcLive, positionMs: 150000, timelineUpdatedMs: nowMs, timestamp: nowMs };
    tick();
    last = sent[sent.length - 1].p;
    ok(last.positionSec === 150, "D6. tua tới 02:30 -> đồng hồ gửi 150s ngay lần đọc kế tiếp", last);
    // tạm dừng
    const nPause = sent.length;
    ctx.__smtcLive = { ...ctx.__smtcLive, playing: false };
    tick();
    ok(sent.length === nPause + 1 && sent[sent.length - 1].p.playing === false, "D7. tạm dừng -> gửi playing:false");
    const nFrozen = sent.length;
    nowMs += 1500; tick();
    ok(sent.length === nFrozen, "D8. đang dừng: đồng hồ đứng yên, không gửi thừa");
    nowMs += 3000; tick();
    ok(sent.length === nFrozen + 1, "D9. quá 3s không đổi: nhắc lại 1 lần (phòng renderer vừa nạp lại)");

    // trình duyệt KHÔNG báo thời lượng
    ctx.__smtcLive = { application: "brave", title: "A", artist: "B", positionMs: null, durationMs: null, timelineUpdatedMs: null, playing: null, playbackRate: null, timestamp: nowMs };
    tick();
    last = sent[sent.length - 1].p;
    ok(last && last.hasTimeline === false && last.source === "smtc", "D10. trình duyệt không báo thời lượng -> hasTimeline:false (không bịa số)", last);
    ok(logs.some((l) => /\[NowPlayingClock\] source=smtc timeline=KHÔNG/.test(l)), "D11. có log chẩn đoán 'timeline=KHÔNG' để người dùng biết vì sao");

    // MPC-HC đang phát thắng trình duyệt
    ctx.latestMpcHcSnapshot = { state: 2, title: "song.mp3" };
    ctx.currentNowPlayingForSync = { title: "song", artist: "" };
    ctx.__mpcLive = { state: 2, positionMs: 20000, durationMs: 180000, timestamp: nowMs };
    tick();
    last = sent[sent.length - 1].p;
    ok(last && last.source === "mpc-hc" && last.hasTimeline === true && last.positionSec === 20 && last.durationSec === 180, "D12. MPC-HC đang phát -> lấy đồng hồ MPC-HC 20s / 180s", last);

    // lỗi bất ngờ không văng ra ngoài
    ctx.__mpcLive = { get positionMs() { throw new Error("boom"); }, state: 2, durationMs: 1 };
    let threw = false; try { tick(); } catch (e) { threw = true; }
    ok(!threw, "D13. lỗi bất ngờ khi tính đồng hồ bị nuốt, không làm hỏng Now Playing/Key/MOD");

    // nối dây
    ok(/require\("\.\.\/core\/integration\/NowPlayingClock"\)/.test(M), "D14. main.js nạp NowPlayingClock");
    ok(/smtcSnapshot:\s*windowsMediaSession\.getLastSnapshot\(\)/.test(M), "D15. MOD nhận snapshot SMTC mới nhất (có vị trí tươi)");
    ok(/clearInterval\(nowPlayingClockTimer\)/.test(M), "D16. tắt timer đồng hồ khi thoát app");
    ok(/sendToRenderer\("now-playing-position"/.test(M) && /now-playing-change/.test(M), "D17. kênh mới được thêm, kênh now-playing-change cũ vẫn còn");
}

// ---------- E. Renderer: hiển thị + đồng bộ đồng hồ MOD ----------
console.log("== E. renderer.js: hiển thị đồng hồ + kéo songSeconds ==");
{
    const R = read("ui/js/renderer.js");
    const iife = extractIife(R, "setupNowPlayingClock");
    ok(!!iife, "E0. tìm thấy khối setupNowPlayingClock");

    const appended = [];
    let handler = null;
    const host = { appendChild: (el) => appended.push(el) };
    let nowMs = 50000;
    const ctx = vm.createContext({
        document: {
            querySelector: (sel) => (sel === ".now-playing" ? host : null),
            createElement: () => ({ style: {}, textContent: "", title: "" })
        },
        window: { electronAPI: { onNowPlayingPosition: (cb) => { handler = cb; } } },
        Date: { now: () => nowMs }, Math, Number, String
    });
    vm.runInContext(`var songSeconds = 0; var __songClockSyncedAt = 0; ${iife}`, ctx);
    const el = appended[0];
    ok(appended.length === 1 && el && el.id === "nowPlayingClock", "E1. tạo đúng 1 phần tử đồng hồ gắn vào hàng .now-playing");
    ok(el.style.display === "none", "E2. lúc đầu (chưa có bài) đồng hồ ẩn");
    ok(typeof handler === "function", "E3. đã đăng ký nhận kênh onNowPlayingPosition");

    handler({ hasTimeline: true, positionSec: 83.4, durationSec: 245, playing: true, source: "mpc-hc" });
    ok(el.style.display === "" && el.textContent === "01:23 / 04:05", "E4. hiển thị 01:23 / 04:05", el.textContent);
    ok(vm.runInContext("songSeconds", ctx) === 83, "E5. đồng hồ MOD (songSeconds) được kéo về 83s");
    ok(el.style.opacity === "1", "E6. đang phát: rõ nét");
    handler({ hasTimeline: true, positionSec: 150, durationSec: 245, playing: false, source: "smtc" });
    ok(el.textContent === "02:30 / 04:05" && el.style.opacity === "0.6", "E7. tua tới 02:30 + tạm dừng: 02:30 / 04:05, mờ nhẹ", el.textContent);
    ok(vm.runInContext("songSeconds", ctx) === 150, "E8. songSeconds theo tới 150s (MOD đúng đoạn)");
    handler({ hasTimeline: true, positionSec: 3725, durationSec: 7300, playing: true, source: "mpc-hc" });
    ok(el.textContent === "1:02:05 / 2:01:40", "E9. bài dài trên 1 giờ: 1:02:05 / 2:01:40", el.textContent);
    handler({ hasTimeline: false, source: "smtc" });
    ok(el.style.display === "" && el.textContent === "--:-- / --:--" && el.style.opacity === "0.4", "E10. nguồn không báo thời lượng: --:-- / --:-- (mờ), không bịa số", el.textContent);
    const keep = vm.runInContext("songSeconds", ctx);
    ok(keep === 3725, "E11. không có thời lượng thật: songSeconds không bị ghi đè (giữ cách đếm cũ)");
    handler(null);
    ok(el.style.display === "none" && el.textContent === "", "E12. không còn bài: ẩn đồng hồ");

    // updateSongPosition: đang đồng bộ thì không tự cộng thêm; hết đồng bộ thì đếm tự do như cũ
    const posEl = { textContent: "" };
    const ctx2 = vm.createContext({ document: { getElementById: (id) => (id === "songPosition" ? posEl : null) }, Date: { now: () => nowMs }, String, Math });
    vm.runInContext(`var songSeconds = 100; var __songClockSyncedAt = 0; ${extractFn(R, "updateSongPosition")}`, ctx2);
    vm.runInContext("__songClockSyncedAt = " + (nowMs - 1000), ctx2);
    vm.runInContext("updateSongPosition()", ctx2);
    ok(vm.runInContext("songSeconds", ctx2) === 100, "E13. vừa đồng bộ (<3s): không tự cộng thêm (khỏi lệch)");
    vm.runInContext("__songClockSyncedAt = " + (nowMs - 5000), ctx2);
    vm.runInContext("updateSongPosition()", ctx2);
    ok(vm.runInContext("songSeconds", ctx2) === 101, "E14. quá 3s không có vị trí thật: đếm tự do như cũ (+1/giây)");
    ok(posEl.textContent === "01:40", "E15. phần tử ẩn #songPosition vẫn cập nhật như cũ", posEl.textContent);

    ok(/onNowPlayingPosition:\s*\(callback\)\s*=>\s*ipcRenderer\.on\("now-playing-position"/.test(read("app/preload.js")), "E16. preload.js mở kênh now-playing-position cho renderer");
    ok(/onNowPlayingChange/.test(read("app/preload.js")) && /onNowPlayingUnavailable/.test(read("app/preload.js")), "E17. 2 kênh Now Playing cũ trong preload vẫn còn");
}

// ---------- F. smtc-daemon.ps1 (kiểm cấu trúc — không chạy được PowerShell/WinRT ở đây) ----------
console.log("== F. smtc-daemon.ps1 (kiểm cấu trúc, KHÔNG phải chạy thật) ==");
{
    const P = read("core/integration/smtc-daemon.ps1");
    ok(/GetTimelineProperties\(\)/.test(P), "F1. gọi GetTimelineProperties()");
    const fn = P.slice(P.indexOf("function Get-TimelineInfo"), P.indexOf("# BƯỚC 3"));
    ok(/try\s*\{[\s\S]*GetTimelineProperties[\s\S]*\}\s*catch\s*\{[\s\S]*return \$empty/.test(fn), "F2. đọc timeline nằm trong try/catch, lỗi -> trả toàn null, không throw");
    ok(/\$durMs -le 0\) \{ return \$empty \}/.test(fn), "F3. thời lượng <= 0 -> coi như không có (không bịa)");
    ok(/positionMs\s*=\s*\$timeline\.positionMs/.test(P) && /durationMs\s*=\s*\$timeline\.durationMs/.test(P) && /timelineUpdatedMs\s*=\s*\$timeline\.timelineUpdatedMs/.test(P) && /playing\s*=\s*\$timeline\.playing/.test(P) && /playbackRate\s*=\s*\$timeline\.playbackRate/.test(P), "F4. snapshot có đủ 5 field mới");
    ok(/application\s*=\s*\$best\.SourceAppUserModelId/.test(P) && /title\s*=\s*\$props\.Title/.test(P) && /artist\s*=\s*\$props\.Artist/.test(P) && /album\s*=\s*\$props\.AlbumTitle/.test(P) && /thumbnail\s*=\s*\$null/.test(P) && /timestamp\s*=\s*Get-UnixTimeMs/.test(P), "F5. 6 field cũ của snapshot giữ nguyên");
    const open = (P.match(/\{/g) || []).length, close = (P.match(/\}/g) || []).length;
    ok(open === close, `F6. ngoặc nhọn {} cân bằng (${open}/${close})`);
    ok(P.indexOf("function Get-TimelineInfo") < P.indexOf("Write-JsonLine @{ type = \"ready\""), "F7. hàm mới được định nghĩa trước vòng lặp chính");
}

// ---------- G. Phạm vi ----------
console.log("== G. Phạm vi thay đổi ==");
{
    const { execFileSync } = require("child_process");
    let ch = ""; try { ch = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString(); } catch (e) {}
    const lines = ch.split("\n").map((l) => l.trim()).filter(Boolean);
    ok(!lines.some((l) => /\.(html|css)$/i.test(l)), "G1. không sửa file .html/.css nào");
    const R = read("ui/js/renderer.js");
    ok(/id="songPosition"/.test(read("ui/index.html")), "G2. index.html còn nguyên thẻ #songPosition cũ");
    ok(!/nowPlayingClock/.test(read("ui/index.html")), "G3. không thêm gì vào index.html (phần tử tạo bằng JS)");
    void R;
}

console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
console.log("⚠️ NHẮC LẠI: smtc-daemon.ps1 + trình duyệt/MPC-HC thật CHƯA được kiểm trên Windows — chỉ kiểm bằng mô phỏng.");
process.exit(fail ? 1 : 0);
