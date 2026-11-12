"use strict";
/**
 * YT-BRIDGE-01 — nguồn Now Playing thứ 3 (tiện ích YouTube -> 127.0.0.1:8765).
 * Dùng máy chủ HTTP THẬT trên cổng ngẫu nhiên (port:0), gửi yêu cầu HTTP thật.
 */
const http = require("http");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const Session = require(path.join(root, "core/integration/YoutubeExtensionSession.js"));
const Arb = require(path.join(root, "core/integration/NowPlayingArbitrator.js"));
const Clock = require(path.join(root, "core/integration/NowPlayingClock.js"));
const KT = require(path.join(root, "core/integration/KeyTimeline.js"));

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log("  OK   " + m); } else { fail++; console.log("  FAIL " + m); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function post(port, body, headers, pathname, method) {
    return new Promise((resolve) => {
        const data = typeof body === "string" ? body : JSON.stringify(body);
        const req = http.request({ host: "127.0.0.1", port, path: pathname || "/youtube", method: method || "POST",
            headers: Object.assign({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, headers || {}) },
            (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
        req.on("error", () => resolve(0));
        req.end(data);
    });
}
const msg = (o) => Object.assign({ video_id: "dQw4w9WgXcQ", title: "Bai Test - Ca Si", is_playing: true, current_time: 43.2, duration: 305, is_ad: false }, o || {});

(async () => {
    // ===== 1. Máy chủ + bản tin hợp lệ =====
    const s = new Session({ port: 0, staleMs: 400 });
    const events = [];
    s.on("change", (x) => events.push(x));
    let readyPort = null;
    s.on("ready", (i) => { readyPort = i.port; });
    s.start();
    await sleep(150);
    ok(s.isListening() && readyPort > 0, "mở cổng localhost thành công");
    const port = readyPort;

    ok(await post(port, msg()) === 204, "POST /youtube hợp lệ => 204");
    await sleep(50);
    const snap = s.getLatestSnapshot();
    ok(snap && snap.videoId === "dQw4w9WgXcQ" && snap.title === "Bai Test - Ca Si" && snap.isPlaying === true && snap.positionMs === 43200 && snap.durationMs === 305000, "snapshot đúng: video/tiêu đề/đang phát/vị trí/thời lượng");
    ok(events.length === 1 && events[0].source === "youtube", "phát 'change' 1 lần khi có bài mới");
    await post(port, msg({ current_time: 44.2 })); await sleep(30);
    ok(events.length === 1 && s.getLatestSnapshot().positionMs === 44200, "vị trí đổi mỗi giây KHÔNG phát 'change' nhưng getLatestSnapshot cập nhật");
    await post(port, msg({ is_playing: false, current_time: 44.5 })); await sleep(30);
    ok(events.length === 2 && events[1].isPlaying === false, "phát -> tạm dừng phát 'change'");

    // ===== 2. Từ chối bản tin xấu =====
    ok(await post(port, msg({ video_id: "abc" })) === 204 && s.getLatestSnapshot().videoId === "dQw4w9WgXcQ", "video_id sai định dạng bị bỏ qua (không đổi trạng thái)");
    ok(await post(port, "{khong phai json") === 400, "JSON hỏng => 400");
    ok(await post(port, msg(), { Origin: "https://evil.example" }) === 403, "Origin là trang web thường => 403");
    ok(await post(port, msg(), { Host: "evil.example" }) === 403, "Host lạ (DNS rebinding) => 403");
    ok(await post(port, msg(), { Origin: "chrome-extension://abcdefghijklmnop" }) === 204, "Origin là chrome-extension:// => chấp nhận");
    await sleep(30);
    const before = events.length; // từ đây chỉ còn bản tin XẤU: không được tạo thêm 'change'
    ok(await post(port, msg(), {}, "/khac") === 404, "đường dẫn khác => 404");
    ok(await post(port, "", {}, "/youtube", "GET") === 405, "GET => 405");
    ok(await post(port, "", { Origin: "chrome-extension://abc" }, "/youtube", "OPTIONS") === 204, "OPTIONS (preflight) => 204");
    ok(await post(port, "x".repeat(40000)) !== 204, "thân quá 16KB bị từ chối");
    ok(events.length === before, "các bản tin xấu không tạo 'change' giả");

    // ===== 3. Nhiều tab / quảng cáo / bản cũ không có duration =====
    s.ingest(msg({ is_playing: true }));
    ok(s.ingest(msg({ video_id: "AAAAAAAAAAA", title: "Tab nen", is_playing: false })) === false, "tab khác chỉ báo tạm dừng khi tab chính đang phát => bỏ qua");
    ok(s.getLatestSnapshot().videoId === "dQw4w9WgXcQ", "vẫn giữ bài đang phát thật");
    s.ingest(msg({ is_ad: true, current_time: null, duration: null }));
    const ad = s.getLatestSnapshot();
    ok(ad.isAd === true && ad.positionMs === null && ad.durationMs === 305000 && ad.title === "Bai Test - Ca Si", "đang quảng cáo: giữ tên + thời lượng bài chính, vị trí = chưa biết");
    ok(s.ingest(msg({ video_id: "BBBBBBBBBBB", duration: undefined })) === false, "bản tin không có duration (tiện ích cũ) => bỏ qua, để SMTC làm việc");

    // ===== 4. Quá hạn => mất kết nối =====
    await sleep(1700);
    ok(s.getLatestSnapshot() === null && events[events.length - 1] === null, "không nhận gì quá hạn => snapshot null + 'change'(null)");
    s.stop();
    await sleep(50);
    ok(!s.isListening(), "stop() đóng cổng");

    // ===== 5. Cổng bận không làm sập =====
    const blocker = http.createServer(() => {});
    await new Promise((r) => blocker.listen(0, "127.0.0.1", r));
    const busy = new Session({ port: blocker.address().port, retryMs: 200 });
    let unavailable = null;
    busy.on("unavailable", (i) => { unavailable = i; });
    let threw = false;
    try { busy.start(); } catch { threw = true; }
    await sleep(150);
    ok(!threw && unavailable && unavailable.reason === "EADDRINUSE", "cổng bận => 'unavailable' EADDRINUSE, không throw");
    let readyAgain = false;
    busy.on("ready", () => { readyAgain = true; });
    await new Promise((r) => blocker.close(r));
    await sleep(700);
    ok(readyAgain && busy.isListening(), "cổng được giải phóng => tự nhận lại sau vài trăm ms");
    busy.stop();

    // ===== 6. Bộ chọn nguồn (tương thích ngược) =====
    const smtc = { title: "S" }, mpcPlay = { state: 2 }, mpcPause = { state: 1 };
    const ytPlay = { isPlaying: true, title: "Y" }, ytPause = { isPlaying: false, title: "Y" };
    ok(Arb.resolveActiveSource(smtc, null).source === "smtc" && Arb.resolveActiveSource(null, mpcPlay).source === "mpc-hc" && Arb.resolveActiveSource(null, null) === null, "gọi kiểu cũ (2 tham số) => y hệt trước");
    ok(Arb.resolveActiveSource(smtc, null, ytPlay).source === "youtube", "YouTube đang phát thắng SMTC");
    ok(Arb.resolveActiveSource(smtc, mpcPlay, ytPlay).source === "mpc-hc", "MPC-HC đang Playing vẫn thắng YouTube");
    ok(Arb.resolveActiveSource(smtc, null, ytPause).source === "smtc", "YouTube tạm dừng nhường SMTC");
    ok(Arb.resolveActiveSource(null, null, ytPause).source === "youtube", "chỉ có YouTube (tạm dừng) => vẫn dùng");
    ok(Arb.resolveActiveSource(null, mpcPause, ytPause).source === "mpc-hc", "MPC-HC tạm dừng xếp trước YouTube tạm dừng (giữ thứ tự cũ)");

    // ===== 7. Đồng hồ + mốc đổi Key =====
    const base = { isPlaying: true, positionMs: 43000, durationMs: 305000, timestamp: 1000 };
    const c = Clock.compute("youtube", base, 3000);
    ok(c && Math.abs(c.positionSec - 45) < 1e-6 && c.durationSec === 305 && c.playing === true, "đồng hồ YouTube: vị trí cộng phần thời gian đã trôi khi đang phát");
    ok(Clock.compute("youtube", Object.assign({}, base, { isPlaying: false }), 9000).positionSec === 43, "tạm dừng: đồng hồ đứng yên");
    ok(Clock.compute("youtube", Object.assign({}, base, { positionMs: null })) === null, "quảng cáo (không có vị trí) => không có đồng hồ, không bịa số");
    ok(Math.abs(KT.estimatePositionSec({ source: "youtube", youtubeSnapshot: base, songStartedAtMs: 0, now: 3000 }) - 45) < 1e-6, "mốc đổi Key lấy vị trí THẬT của YouTube");
    ok(KT.estimatePositionSec({ source: "youtube", youtubeSnapshot: Object.assign({}, base, { positionMs: null }), songStartedAtMs: 0, now: 3000 }) === null, "đang quảng cáo: không canh mốc đổi Key (không rơi về đồng hồ tính từ lúc thấy bài)");
    ok(KT.estimatePositionSec({ source: "smtc", smtcSnapshot: null, songStartedAtMs: 1000, now: 4000 }) === 3, "nguồn khác (SMTC không có vị trí) vẫn tính như cũ");

    console.log("\n" + pass + " PASS, " + fail + " FAIL");
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("LỖI TEST:", e); process.exit(2); });
