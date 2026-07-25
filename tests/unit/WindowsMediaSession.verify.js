/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng WindowsMediaSession + SnapshotCache
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/WindowsMediaSession.verify.js
 *
 * ⚠️ QUAN TRỌNG — ĐỌC KỸ TRƯỚC KHI TIN VÀO KẾT QUẢ "PASS":
 * Bộ test này chạy trên Linux sandbox, KHÔNG có PowerShell/WinRT thật.
 * Vì vậy nó KHÔNG kiểm chứng được `smtc-daemon.ps1` có thực sự đọc
 * đúng dữ liệu từ Windows SMTC hay không — phần đó CHƯA có bằng chứng
 * thực tế (xem báo cáo).
 *
 * Bộ test này CHỈ kiểm chứng phần có thể kiểm chứng được: toàn bộ
 * logic phía Node (`WindowsMediaSession.js`, `SnapshotCache.js`) —
 * quản lý tiến trình con, parse giao thức JSON theo dòng, cơ chế
 * cache/chống log-trùng, cơ chế restart khi tiến trình chết, xử lý
 * lỗi an toàn (không throw, không crash). Để làm được điều này mà
 * không cần Windows thật, các test tiêm (inject) 1 "tiến trình con
 * giả" (fake child process) qua `spawnFn` — giả lập ĐÚNG giao thức mà
 * `smtc-daemon.ps1` sẽ tạo ra, dựa theo đặc tả giao thức đã viết
 * trong chính file .ps1 đó.
 * ==========================================================
 */

const assert = require("assert");
const { EventEmitter } = require("events");

let failCount = 0;
function check(condition, message) {
    try {
        assert.ok(condition, message);
        console.log(`  ✅ ${message}`);
    } catch (err) {
        failCount++;
        console.log(`  ❌ ${message} -- ${err.message}`);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SnapshotCache = require("../../core/integration/SnapshotCache");
const WindowsMediaSession = require("../../core/integration/WindowsMediaSession");

// ================================
// Helper: tiến trình con GIẢ, mô phỏng đúng giao diện child_process.ChildProcess
// (stdout/stderr là EventEmitter phát 'data', bản thân child phát 'exit'/'error',
// có hàm kill()) — đủ để WindowsMediaSession.js hoạt động y hệt như với tiến
// trình PowerShell thật, chỉ khác nguồn dữ liệu là giả lập tay.
// ================================
function createFakeChild() {

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;

    child.kill = function () {

        if (child.killed) return;
        child.killed = true;
        setImmediate(() => child.emit("exit", null, "SIGTERM"));

    };

    return child;

}

function sendLine(child, obj) {

    child.stdout.emit("data", Buffer.from(JSON.stringify(obj) + "\n", "utf-8"));

}

// Logger giả để đếm số lần log (kiểm tra "không log liên tục nếu dữ liệu không đổi")
function createFakeLogger() {

    const calls = { info: [], warning: [], error: [], success: [] };

    return {
        calls,
        info: (mod, msg) => calls.info.push({ mod, msg }),
        warning: (mod, msg) => calls.warning.push({ mod, msg }),
        error: (mod, msg) => calls.error.push({ mod, msg }),
        success: (mod, msg) => calls.success.push({ mod, msg })
    };

}

function withPlatform(platform, fn) {

    const original = process.platform;
    Object.defineProperty(process, "platform", { value: platform, configurable: true });

    try {

        return fn();

    } finally {

        Object.defineProperty(process, "platform", { value: original, configurable: true });

    }

}

// ================================
// PHẦN A — SnapshotCache (pure, đồng bộ)
// ================================
function runPartA_SnapshotCache() {
    console.log("=== PHẦN A: SnapshotCache ===");

    const cache = new SnapshotCache();

    check(cache.get() === null, "Ban đầu chưa có snapshot nào -> null");

    const r1 = cache.update({ application: "Chrome", title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", album: null, thumbnail: null, timestamp: 1000 });
    check(r1.changed === true && r1.reason === "became_available", "Có snapshot đầu tiên -> changed=true, reason=became_available");

    const r2 = cache.update({ application: "Chrome", title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", album: null, thumbnail: null, timestamp: 2000 });
    check(r2.changed === false && r2.reason === "no_change", "Title/Artist/Application giống hệt, chỉ timestamp đổi -> KHÔNG coi là đổi bài");

    const r3 = cache.update({ application: "Chrome", title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", album: "Album Mới", thumbnail: "abc", timestamp: 3000 });
    check(r3.changed === false, "Chỉ Album/Thumbnail đổi (Title/Artist/App giữ nguyên) -> KHÔNG coi là đổi bài");

    const r4 = cache.update({ application: "Chrome", title: "Chạy Ngay Đi", artist: "Sơn Tùng M-TP", album: null, thumbnail: null, timestamp: 4000 });
    check(r4.changed === true && r4.reason === "title_changed", "Title đổi -> changed=true, reason=title_changed");

    const r5 = cache.update({ application: "Chrome", title: "Chạy Ngay Đi", artist: "Ca Sĩ Khác", album: null, thumbnail: null, timestamp: 5000 });
    check(r5.changed === true && r5.reason === "artist_changed", "Artist đổi -> reason=artist_changed");

    const r6 = cache.update({ application: "Spotify", title: "Chạy Ngay Đi", artist: "Ca Sĩ Khác", album: null, thumbnail: null, timestamp: 6000 });
    check(r6.changed === true && r6.reason === "application_changed", "Application đổi -> reason=application_changed");

    const r7 = cache.update(null);
    check(r7.changed === true && r7.reason === "became_empty", "Không còn gì đang phát -> reason=became_empty");

    const r8 = cache.update(null);
    check(r8.changed === false, "Vẫn null như trước -> không coi là 'đổi' thêm lần nữa");

    cache.clear();
    check(cache.get() === null, "clear() reset về null");
}

// ================================
// PHẦN B — Phát hiện nền tảng không phải Windows
// ================================
async function runPartB_NonWindowsPlatform() {
    console.log("\n=== PHẦN B: Nền tảng không phải Windows -> không spawn gì cả ===");

    let spawnCalled = false;
    const session = new WindowsMediaSession({
        spawnFn: () => { spawnCalled = true; return createFakeChild(); },
        logger: createFakeLogger()
    });

    let unavailableReason = null;
    session.on("unavailable", (info) => { unavailableReason = info.reason; });

    const result = withPlatform("linux", () => session.start());

    check(result === false, "start() trả về false trên nền tảng không phải Windows");
    check(spawnCalled === false, "KHÔNG gọi spawnFn (không cố spawn PowerShell trên máy không phải Windows)");
    check(unavailableReason === "non_windows", "Phát event 'unavailable' với reason='non_windows'");
    check(session.getLastSnapshot() === null, "getLastSnapshot() trả về null, không throw");
}

// ================================
// PHẦN C — Happy path: spawn giả trên "Windows" giả lập, nhận ready + snapshot
// ================================
async function runPartC_HappyPath() {
    console.log("\n=== PHẦN C: Luồng bình thường (ready -> snapshot -> change event) ===");

    let fakeChild;
    let spawnArgs = null;

    const logger = createFakeLogger();
    const session = new WindowsMediaSession({
        pollIntervalMs: 1234,
        readyTimeoutMs: 2000,
        spawnFn: (cmd, args) => { spawnArgs = { cmd, args }; fakeChild = createFakeChild(); return fakeChild; },
        logger
    });

    const changeEvents = [];
    session.on("change", (snapshot) => changeEvents.push(snapshot));

    withPlatform("win32", () => session.start());

    check(spawnArgs.cmd === "powershell.exe", "Spawn đúng 'powershell.exe'");
    check(spawnArgs.args.includes("-PollIntervalMs") && spawnArgs.args.includes("1234"), "Truyền đúng pollIntervalMs từ config vào tham số dòng lệnh (không hardcode)");
    check(spawnArgs.args.includes(session._scriptPath), "Truyền đúng đường dẫn script smtc-daemon.ps1");

    let readyEventFired = false;
    session.on("ready", () => { readyEventFired = true; });

    sendLine(fakeChild, { type: "ready", pid: 12345 });
    await sleep(20);

    check(readyEventFired === true, "Nhận 'ready' -> phát event 'ready'");
    check(session.isAvailable() === true, "isAvailable() = true sau khi ready");
    check(session.getMetrics().startupMs !== null && session.getMetrics().startupMs >= 0, "getMetrics().startupMs được tính (>= 0ms)");

    sendLine(fakeChild, {
        type: "snapshot",
        data: { application: "Chrome", title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", album: null, thumbnail: null, timestamp: Date.now() }
    });
    await sleep(20);

    check(changeEvents.length === 1, "Snapshot đầu tiên -> phát đúng 1 event 'change'");
    check(session.getLastSnapshot().title === "Nơi Này Có Anh", "getLastSnapshot() trả đúng dữ liệu mới nhất");
    check(session.getMetrics().timeToFirstSnapshotMs !== null, "getMetrics().timeToFirstSnapshotMs được ghi nhận");

    // Gửi lại y hệt (chỉ khác timestamp) -> KHÔNG được emit thêm 'change', KHÔNG log thêm
    const infoLogCountBefore = logger.calls.info.length;

    sendLine(fakeChild, {
        type: "snapshot",
        data: { application: "Chrome", title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", album: "Album khác", thumbnail: "xyz", timestamp: Date.now() + 999 }
    });
    await sleep(20);

    check(changeEvents.length === 1, "Snapshot KHÔNG đổi Title/Artist/App -> KHÔNG phát thêm event 'change'");
    check(logger.calls.info.length === infoLogCountBefore, "Snapshot KHÔNG đổi -> KHÔNG log thêm (đúng yêu cầu chống log liên tục)");

    session.stop();
    await sleep(20);
}

// ================================
// PHẦN D — Đổi bài / đổi ứng dụng -> đúng event + đúng log
// ================================
async function runPartD_TrackAndAppChange() {
    console.log("\n=== PHẦN D: Đổi bài hát / đổi ứng dụng ===");

    const fakeChild = createFakeChild();
    const logger = createFakeLogger();
    const session = new WindowsMediaSession({ spawnFn: () => fakeChild, logger });

    const changeEvents = [];
    session.on("change", (s) => changeEvents.push(s));

    withPlatform("win32", () => session.start());
    sendLine(fakeChild, { type: "ready" });
    await sleep(10);

    sendLine(fakeChild, { type: "snapshot", data: { application: "Chrome", title: "Bài A", artist: "Ca sĩ A", album: null, thumbnail: null, timestamp: 1 } });
    await sleep(10);

    sendLine(fakeChild, { type: "snapshot", data: { application: "Chrome", title: "Bài B", artist: "Ca sĩ B", album: null, thumbnail: null, timestamp: 2 } });
    await sleep(10);

    sendLine(fakeChild, { type: "snapshot", data: { application: "Spotify", title: "Bài B", artist: "Ca sĩ B", album: null, thumbnail: null, timestamp: 3 } });
    await sleep(10);

    check(changeEvents.length === 3, `Đổi bài 2 lần + đổi app 1 lần -> đúng 3 event 'change' (thực tế: ${changeEvents.length})`);
    check(changeEvents[2].application === "Spotify", "Event cuối phản ánh đúng ứng dụng mới");

    const relevantLogs = logger.calls.info.filter((c) => c.mod === "WindowsMediaSession");
    check(relevantLogs.length >= 3, "Có log cho mỗi lần thay đổi thật sự (session/ứng dụng đổi)");

    session.stop();
    await sleep(10);
}

// ================================
// PHẦN E — Lỗi tạm thời ("error") — chống log/emit trùng lặp lỗi giống nhau
// ================================
async function runPartE_ErrorHandling() {
    console.log("\n=== PHẦN E: Lỗi tạm thời (type=error) ===");

    const fakeChild = createFakeChild();
    const logger = createFakeLogger();
    const session = new WindowsMediaSession({ spawnFn: () => fakeChild, logger });

    const errorEvents = [];
    session.on("error", (err) => errorEvents.push(err));

    withPlatform("win32", () => session.start());
    sendLine(fakeChild, { type: "ready" });
    await sleep(10);

    sendLine(fakeChild, { type: "error", message: "TryGetMediaPropertiesAsync that bai" });
    await sleep(10);
    sendLine(fakeChild, { type: "error", message: "TryGetMediaPropertiesAsync that bai" }); // lặp lại y hệt
    await sleep(10);
    sendLine(fakeChild, { type: "error", message: "Loi khac" });
    await sleep(10);

    check(errorEvents.length === 2, `Lỗi lặp lại y hệt không phát event lần 2, lỗi khác thì có -> đúng 2 event (thực tế: ${errorEvents.length})`);
    check(session.getLastSnapshot() === null, "Có lỗi tạm thời -> getLastSnapshot() vẫn trả null (đúng contract, không bịa dữ liệu)");

    session.stop();
    await sleep(10);
}

// ================================
// PHẦN F — Lỗi fatal -> dừng hẳn, KHÔNG tự restart
// ================================
async function runPartF_FatalError() {
    console.log("\n=== PHẦN F: Lỗi fatal (máy không hỗ trợ SMTC) ===");

    let spawnCount = 0;
    const session = new WindowsMediaSession({
        restartBackoffMs: 20,
        spawnFn: () => { spawnCount++; return createFakeChild(); },
        logger: createFakeLogger()
    });

    let unavailableInfo = null;
    session.on("unavailable", (info) => { unavailableInfo = info; });

    withPlatform("win32", () => session.start());
    check(spawnCount === 1, "Spawn lần đầu");

    sendLine(session._child, { type: "fatal", message: "May khong ho tro WinRT" });
    await sleep(100); // chờ đủ lâu hơn restartBackoffMs để chắc chắn KHÔNG có restart nào xảy ra

    check(unavailableInfo && unavailableInfo.reason === "fatal", "Phát 'unavailable' với reason='fatal'");
    check(spawnCount === 1, "KHÔNG tự restart sau lỗi fatal (spawn vẫn chỉ 1 lần)");
    check(session.isAvailable() === false, "isAvailable() = false sau fatal");
}

// ================================
// PHẦN G — Tiến trình chết bất ngờ -> tự khởi động lại (có giới hạn số lần)
// ================================
async function runPartG_UnexpectedExitRestart() {
    console.log("\n=== PHẦN G: Tiến trình chết bất ngờ -> tự restart có giới hạn ===");

    let spawnCount = 0;
    const children = [];

    const session = new WindowsMediaSession({
        restartMaxAttempts: 2,
        restartBackoffMs: 15,
        spawnFn: () => { spawnCount++; const c = createFakeChild(); children.push(c); return c; },
        logger: createFakeLogger()
    });

    let unavailableInfo = null;
    session.on("unavailable", (info) => { unavailableInfo = info; });

    withPlatform("win32", () => session.start());
    check(spawnCount === 1, "Spawn lần đầu (lần 1)");

    // Giả lập tiến trình chết bất ngờ (KHÔNG phải do gọi stop())
    children[0].emit("exit", 1, null);
    await sleep(50);
    check(spawnCount === 2, "Chết bất ngờ lần 1 -> tự restart (lần 2)");

    children[1].emit("exit", 1, null);
    await sleep(50);
    check(spawnCount === 3, "Chết bất ngờ lần 2 -> tự restart (lần 3, đạt restartMaxAttempts=2)");

    children[2].emit("exit", 1, null);
    await sleep(50);
    check(spawnCount === 3, "Chết bất ngờ lần 3 (vượt quá restartMaxAttempts) -> KHÔNG restart thêm nữa");
    check(unavailableInfo && unavailableInfo.reason === "max_restarts_exceeded", "Phát 'unavailable' reason='max_restarts_exceeded'");
}

// ================================
// PHẦN H — stop() dừng hẳn, không restart, dọn timer sạch sẽ
// ================================
async function runPartH_StopIsClean() {
    console.log("\n=== PHẦN H: stop() dừng hẳn, không restart, không rò rỉ timer ===");

    let spawnCount = 0;
    const session = new WindowsMediaSession({
        restartBackoffMs: 15,
        spawnFn: () => { spawnCount++; return createFakeChild(); },
        logger: createFakeLogger()
    });

    withPlatform("win32", () => session.start());
    check(spawnCount === 1, "Spawn lần đầu");

    session.stop();
    await sleep(60); // đợi lâu hơn restartBackoffMs

    check(spawnCount === 1, "Sau stop(), dù tiến trình 'chết' (do chính kill() gây ra) -> KHÔNG tự restart");
    check(session._readyTimeoutHandle === null, "stop() dọn sạch readyTimeoutHandle (không rò rỉ timer)");
    check(session._restartTimeoutHandle === null, "stop() dọn sạch restartTimeoutHandle (không rò rỉ timer)");
    check(session._child === null, "stop() giải phóng tham chiếu tiến trình con");
}

// ================================
// PHẦN I — Dữ liệu hỏng / chia nhỏ (an toàn tuyệt đối, không crash)
// ================================
async function runPartI_MalformedAndChunkedData() {
    console.log("\n=== PHẦN I: Dòng JSON hỏng + dữ liệu bị chia nhỏ qua nhiều 'data' event ===");

    const fakeChild = createFakeChild();
    const logger = createFakeLogger();
    const session = new WindowsMediaSession({ spawnFn: () => fakeChild, logger });

    const changeEvents = [];
    session.on("change", (s) => changeEvents.push(s));

    let threw = false;
    process.on("uncaughtException", () => { threw = true; }); // lưới an toàn cuối cùng cho test này

    withPlatform("win32", () => session.start());

    // Dòng JSON hỏng
    fakeChild.stdout.emit("data", Buffer.from("day khong phai JSON hop le\n", "utf-8"));
    await sleep(10);
    check(threw === false, "Dòng không phải JSON -> không crash (không uncaughtException)");

    // 1 message JSON hợp lệ nhưng bị CHIA LÀM 2 CHUNK (mô phỏng TCP/pipe cắt giữa dòng)
    const fullLine = JSON.stringify({ type: "snapshot", data: { application: "VLC", title: "Bài Chia Đôi", artist: "X", album: null, thumbnail: null, timestamp: 1 } }) + "\n";
    const splitPoint = Math.floor(fullLine.length / 2);

    fakeChild.stdout.emit("data", Buffer.from(fullLine.slice(0, splitPoint), "utf-8"));
    await sleep(5);
    check(changeEvents.length === 0, "Chunk đầu (chưa đủ 1 dòng hoàn chỉnh) -> CHƯA parse, chưa emit gì");

    fakeChild.stdout.emit("data", Buffer.from(fullLine.slice(splitPoint), "utf-8"));
    await sleep(10);
    check(changeEvents.length === 1 && changeEvents[0].title === "Bài Chia Đôi", "Ghép đủ 2 chunk thành 1 dòng -> parse đúng, emit đúng");

    session.stop();

}

// ================================
// PHẦN J — start() gọi 2 lần liên tiếp -> không spawn trùng
// ================================
async function runPartJ_NoDoubleSpawn() {
    console.log("\n=== PHẦN J: Gọi start() nhiều lần -> không spawn trùng (chống duplicate listener/process) ===");

    let spawnCount = 0;
    const session = new WindowsMediaSession({
        spawnFn: () => { spawnCount++; return createFakeChild(); },
        logger: createFakeLogger()
    });

    withPlatform("win32", () => {
        session.start();
        session.start();
        session.start();
    });

    check(spawnCount === 1, `Gọi start() 3 lần liên tiếp -> chỉ spawn ĐÚNG 1 lần (thực tế: ${spawnCount})`);

    session.stop();
}

async function main() {

    runPartA_SnapshotCache();
    await runPartB_NonWindowsPlatform();
    await runPartC_HappyPath();
    await runPartD_TrackAndAppChange();
    await runPartE_ErrorHandling();
    await runPartF_FatalError();
    await runPartG_UnexpectedExitRestart();
    await runPartH_StopIsClean();
    await runPartI_MalformedAndChunkedData();
    await runPartJ_NoDoubleSpawn();

    console.log("\n========== TỔNG KẾT ==========");
    if (failCount === 0) {
        console.log("✅ TẤT CẢ kiểm chứng PASS — logic phía Node hoạt động đúng.");
        console.log("⚠️ NHẮC LẠI: chưa kiểm chứng được smtc-daemon.ps1 trên Windows thật.");
    } else {
        console.log(`❌ CÓ ${failCount} kiểm chứng FAIL.`);
    }
    process.exit(failCount > 0 ? 1 : 0);

}

main();
