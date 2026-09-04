/**
 * ==========================================================
 * Auto Menu AI — Kiểm chứng MpcHcSession
 * ----------------------------------------------------------
 * Chạy bằng: node tests/unit/MpcHcSession.verify.js
 *
 * ⚠️ QUAN TRỌNG — ĐỌC KỸ TRƯỚC KHI TIN VÀO KẾT QUẢ "PASS":
 * Bộ test này chạy trên Linux sandbox, KHÔNG có MPC-HC thật, KHÔNG mở
 * cổng HTTP thật. Test tiêm (inject) `httpGetFn` giả để mô phỏng ĐÚNG
 * các tình huống: response hợp lệ (dựng từ DỮ LIỆU THẬT đã chụp màn
 * hình lúc kiểm thử thủ công trên Windows — xem báo cáo), connection
 * refused, timeout, response sai định dạng.
 *
 * Bộ test này CHỈ kiểm chứng phần có thể kiểm chứng được: toàn bộ
 * logic phía Node (parse variables.html, chống log/emit lặp qua
 * SnapshotCache, resolve cổng từ settings, không throw khi lỗi). Việc
 * MPC-HC Web Interface thật trên Windows có tiếp tục trả đúng định
 * dạng này hay không đã được xác nhận qua 1 lần chụp màn hình thật
 * (không phải qua bộ test này) — xem WINDOWS REAL-HOST VALIDATION
 * trong báo cáo.
 * ==========================================================
 */

const assert = require("assert");

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

const MpcHcSession = require("../../core/integration/MpcHcSession");

// ================================
// Helper: dựng body variables.html giống HỆT dữ liệu THẬT lấy bằng
// Invoke-WebRequest trên máy Windows thật (2 lần độc lập — xem báo
// cáo). Bản đầu tiên của test này từng dùng nhầm <p>...</p> KHÔNG có
// id, gây fail thật khi chạy trên Windows vì MPC-HC luôn trả về
// <p id="...">...</p> CÓ id — đã sửa cả parser lẫn fixture này.
// ================================
function buildRealSampleBody({ title = "8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4", filePath = "F:\\karaoke\\8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4", state = 2, stateString = "Đang phát...", positionMs = 6382, durationMs = 276828 } = {}) {

    return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>MPC-HC WebServer - Variables</title>
        <link rel="stylesheet" href="default.css">
        <link rel="icon" href="favicon.ico">
    </head>
    <body class="page-variables">
        <p id="file">${title}</p>
        <p id="filepatharg">F:%5ckaraoke%5cencoded.mp4</p>
        <p id="filepath">${filePath}</p>
        <p id="filedirarg">F:%5ckaraoke</p>
        <p id="filedir">F:\\karaoke</p>
        <p id="state">${state}</p>
        <p id="statestring">${stateString}</p>
        <p id="position">${positionMs}</p>
        <p id="positionstring">00:00:06</p>
        <p id="duration">${durationMs}</p>
        <p id="durationstring">00:04:37</p>
        <p id="volumelevel">100</p>
        <p id="muted">0</p>
        <p id="playbackrate">1.000000</p>
        <p id="size">83,8 MB</p>
        <p id="reloadtime">0</p>
        <p id="version">2.7.1.0</p>
        <p id="audiotrack">A: ISO Media file produced by Google Inc. (aac he-aac, 44100 Hz, stereo, 48 kb/s)</p>
        <p id="subtitletrack"></p>
    </body>
</html>`;

}

// Logger giả để đếm số lần log (kiểm tra "không log liên tục nếu lỗi không đổi")
function createFakeLogger() {

    const calls = { info: [], warning: [], error: [] };

    return {
        calls,
        info: (mod, msg) => calls.info.push({ mod, msg }),
        warning: (mod, msg) => calls.warning.push({ mod, msg }),
        error: (mod, msg) => calls.error.push({ mod, msg }),
        success: () => {}
    };

}

// httpGetFn giả — trả về theo kịch bản đã cấu hình sẵn (hàng đợi), KHÔNG mở socket thật.
function createScriptedHttpGet(responses) {

    let i = 0;
    const calledUrls = [];

    const fn = (url, opts, callback) => {

        calledUrls.push(url);
        const next = responses[Math.min(i, responses.length - 1)];
        i++;

        setImmediate(() => {

            if (next.error) callback(next.error);
            else callback(null, next.body);

        });

    };

    fn.calledUrls = calledUrls;
    return fn;

}

function withPlatform(platform, fn) {

    const original = process.platform;
    Object.defineProperty(process, "platform", { value: platform, configurable: true });

    return Promise.resolve().then(fn).finally(() => {
        Object.defineProperty(process, "platform", { value: original, configurable: true });
    });

}

async function runPartA_PlatformGate() {

    console.log("=== PHẦN A: Platform gate (giống WindowsMediaSession — chỉ chạy trên win32) ===");

    await withPlatform("linux", async () => {

        const logger = createFakeLogger();
        const session = new MpcHcSession({ logger, httpGetFn: createScriptedHttpGet([{ body: buildRealSampleBody() }]) });

        let unavailableInfo = null;
        session.on("unavailable", (info) => { unavailableInfo = info; });

        const started = session.start();

        check(started === false, "start() trả về false trên non-Windows");
        check(unavailableInfo && unavailableInfo.reason === "non_windows", "Emit 'unavailable' reason=non_windows trên non-Windows");
        check(session.isAvailable() === false, "isAvailable() = false trên non-Windows");

    });

}

async function runPartB_ValidResponseParsing() {

    console.log("=== PHẦN B: Parse response hợp lệ (dựng từ dữ liệu THẬT đã chụp) ===");

    await withPlatform("win32", async () => {

        const logger = createFakeLogger();
        const httpGetFn = createScriptedHttpGet([{ body: buildRealSampleBody() }]);
        const session = new MpcHcSession({ logger, httpGetFn, pollIntervalMs: 100000 }); // interval dài để test không tự poll lần 2 giữa chừng

        let snapshot = null;
        session.on("change", (s) => { snapshot = s; });

        const started = session.start();
        check(started === true, "start() trả về true trên win32");
        check(session.isAvailable() === true, "isAvailable() = true ngay sau start() trên win32 (cơ chế polling đã chạy)");

        await sleep(20); // đợi setImmediate trong httpGetFn giả chạy xong

        check(snapshot !== null, "Emit 'change' với snapshot khác null khi response hợp lệ");
        check(snapshot.application === "mpc-hc", "snapshot.application = 'mpc-hc'");
        check(snapshot.title === "8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4", "snapshot.title đúng byte tiếng Việt thật (không bị lỗi encoding)");
        check(snapshot.filePath === "F:\\karaoke\\8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4", "snapshot.filePath đúng đường dẫn thật trên đĩa");
        check(snapshot.state === 2, "snapshot.state = 2 (số), đúng field [5]");
        check(snapshot.stateString === "Đang phát...", "snapshot.stateString đúng, nhưng CHỈ để hiển thị (logic dùng field số)");
        check(snapshot.positionMs === 6382, "snapshot.positionMs parse đúng số");
        check(snapshot.durationMs === 276828, "snapshot.durationMs parse đúng số");
        check(session.getLastSnapshot() === snapshot, "getLastSnapshot() trả đúng snapshot gần nhất");

        session.stop();

    });

}

async function runPartC_StateStoppedMeansNull() {

    console.log("=== PHẦN C: State=0 (Stopped) -> coi như không có gì đang phát ===");

    await withPlatform("win32", async () => {

        const logger = createFakeLogger();
        const httpGetFn = createScriptedHttpGet([{ body: buildRealSampleBody({ state: 0, stateString: "Đã dừng" }) }]);
        const session = new MpcHcSession({ logger, httpGetFn, pollIntervalMs: 100000 });

        let changeCount = 0;
        let lastSnapshot = "not_called";
        session.on("change", (s) => { changeCount++; lastSnapshot = s; });

        session.start();
        await sleep(20);

        // Cache khởi đầu là null -> null vẫn coi "no_change" (SnapshotCache: isEmpty(a)&&isEmpty(b) -> true)
        // nên KHÔNG emit change ở đây — đúng hành vi mong muốn (không log rác khi vốn dĩ chưa có gì).
        check(changeCount === 0, "State=0 ngay từ đầu (vốn đã null->null) -> không emit 'change' thừa");
        check(session.getLastSnapshot() === null, "getLastSnapshot() = null khi Stopped");

        session.stop();

    });

}

async function runPartD_ConnectionRefused_NoCrash() {

    console.log("=== PHẦN D: Connection refused (MPC-HC chưa mở/chưa bật Web Interface) -> KHÔNG crash ===");

    await withPlatform("win32", async () => {

        const logger = createFakeLogger();
        const err = new Error("connect ECONNREFUSED 127.0.0.1:13579");
        err.code = "ECONNREFUSED";
        const httpGetFn = createScriptedHttpGet([{ error: err }]);
        const session = new MpcHcSession({ logger, httpGetFn, pollIntervalMs: 100000 });

        let threw = false;
        let unavailableEmitted = false;
        session.on("unavailable", () => { unavailableEmitted = true; });

        try {

            session.start();
            await sleep(20);

        } catch (e) {

            threw = true;

        }

        check(threw === false, "Không throw ra ngoài khi ECONNREFUSED");
        check(unavailableEmitted === false, "KHÔNG emit 'unavailable' (mechanism-level) chỉ vì MPC-HC chưa mở — đây là tình huống tạm thời, không phải lỗi cơ chế");
        check(logger.calls.warning.length === 1, "Log warning ĐÚNG 1 LẦN (chống lặp log mỗi 2s)");
        check(session.getLastSnapshot() === null, "getLastSnapshot() = null khi không kết nối được");

        session.stop();

    });

}

async function runPartE_MalformedResponse_NoCrash() {

    console.log("=== PHẦN E: Response sai định dạng (thiếu field / không phải variables.html thật) -> KHÔNG crash ===");

    await withPlatform("win32", async () => {

        const logger = createFakeLogger();
        const httpGetFn = createScriptedHttpGet([{ body: "<html><body>Not Found</body></html>" }]);
        const session = new MpcHcSession({ logger, httpGetFn, pollIntervalMs: 100000 });

        let threw = false;

        try {

            session.start();
            await sleep(20);

        } catch (e) {

            threw = true;

        }

        check(threw === false, "Không throw khi response không phải variables.html hợp lệ");
        check(logger.calls.warning.length === 1, "Log warning đúng 1 lần khi malformed");
        check(session.getLastSnapshot() === null, "getLastSnapshot() = null khi malformed");

        session.stop();

    });

}

async function runPartF_PortResolution() {

    console.log("=== PHẦN F: Xác định cổng (port) — ưu tiên explicit > settings > mặc định ===");

    await withPlatform("win32", async () => {

        // F1: không truyền gì -> dùng mặc định 13579
        {
            const session = new MpcHcSession({ logger: createFakeLogger() });
            check(session.getPort() === 13579, "Không có options.port/readSettingsFile -> dùng cổng mặc định 13579");
        }

        // F2: có readSettingsFile trả về mpcHcPort tuỳ chỉnh -> dùng giá trị đó
        {
            const session = new MpcHcSession({
                logger: createFakeLogger(),
                readSettingsFile: () => ({ mpcHcPort: 25000 })
            });
            check(session.getPort() === 25000, "readSettingsFile trả mpcHcPort=25000 -> dùng 25000");
        }

        // F3: options.port truyền trực tiếp -> THẮNG, bỏ qua readSettingsFile
        {
            const session = new MpcHcSession({
                logger: createFakeLogger(),
                port: 9999,
                readSettingsFile: () => ({ mpcHcPort: 25000 })
            });
            check(session.getPort() === 9999, "options.port=9999 ghi đè readSettingsFile -> dùng 9999");
        }

        // F4: readSettingsFile throw lỗi -> không crash, rơi về mặc định
        {
            const logger = createFakeLogger();
            const session = new MpcHcSession({
                logger,
                readSettingsFile: () => { throw new Error("file hỏng"); }
            });
            check(session.getPort() === 13579, "readSettingsFile throw lỗi -> không crash, rơi về cổng mặc định");
            check(logger.calls.warning.length === 1, "Log warning khi readSettingsFile lỗi");
        }

        // F5: readSettingsFile trả null (chưa có file settings) -> mặc định
        {
            const session = new MpcHcSession({ logger: createFakeLogger(), readSettingsFile: () => null });
            check(session.getPort() === 13579, "readSettingsFile trả null -> dùng cổng mặc định");
        }

    });

}

async function runPartG_DedupeOnUnchangedTrack() {

    console.log("=== PHẦN G: Không emit 'change' lặp lại nếu vẫn cùng 1 bài (đúng nguyên lý SnapshotCache) ===");

    await withPlatform("win32", async () => {

        const logger = createFakeLogger();
        // 2 response liên tiếp CÙNG title/application, chỉ khác positionMs (giống bài
        // đang phát tiếp tục, timestamp/position đổi liên tục) -> KHÔNG được coi là đổi bài.
        const httpGetFn = createScriptedHttpGet([
            { body: buildRealSampleBody({ positionMs: 1000 }) },
            { body: buildRealSampleBody({ positionMs: 3000 }) }
        ]);
        const session = new MpcHcSession({ logger, httpGetFn, pollIntervalMs: 10 });

        let changeCount = 0;
        session.on("change", () => { changeCount++; });

        session.start();
        await sleep(60); // đủ thời gian cho ít nhất 2 lần poll (interval 10ms)

        check(changeCount === 1, `Chỉ emit 'change' 1 LẦN dù poll nhiều lần với cùng 1 bài (thực tế: ${changeCount} lần)`);

        session.stop();

    });

}

async function runPartH_RealCapturedResponses_Regression() {

    console.log("=== PHẦN H: Hồi quy — dùng NGUYÊN VĂN 2 response THẬT lấy bằng Invoke-WebRequest trên Windows (khoá lại bug đã sửa: <p id=\"...\"> có id, không phải <p> trơn) ===");

    // Response thật #1: MPC-HC vừa mở, phát hết bài (position == duration), state=1/"Đã dừng".
    const REAL_CAPTURE_1 = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>MPC-HC WebServer - Variables</title>
        <link rel="stylesheet" href="default.css">
        <link rel="icon" href="favicon.ico">
    </head>
    <body class="page-variables">
        <p id="file">8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4</p>
        <p id="filepatharg">F:%5ckaraoke%5c8%20V%e1%ba%a0N%206%20NG%c3%80N%20TH%c6%af%c6%a0NG%20-%20Ebm.mp4</p>
        <p id="filepath">F:\\karaoke\\8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4</p>
        <p id="filedirarg">F:%5ckaraoke</p>
        <p id="filedir">F:\\karaoke</p>
        <p id="state">1</p>
        <p id="statestring">Đã dừng</p>
        <p id="position">276828</p>
        <p id="positionstring">00:04:37</p>
        <p id="duration">276828</p>
        <p id="durationstring">00:04:37</p>
        <p id="volumelevel">100</p>
        <p id="muted">0</p>
        <p id="playbackrate">1.000000</p>
        <p id="size">83,8 MB</p>
        <p id="reloadtime">0</p>
        <p id="version">2.7.1.0</p>
                <p id="audiotrack">A: ISO Media file produced by Google Inc. (aac he-aac, 44100 Hz, stereo, 48 kb/s)</p>
        <p id="subtitletrack"></p>
    </body>
</html>`;

    // Response thật #2: user tua lại bài, state=2/"Đang phát...".
    const REAL_CAPTURE_2 = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>MPC-HC WebServer - Variables</title>
        <link rel="stylesheet" href="default.css">
        <link rel="icon" href="favicon.ico">
    </head>
    <body class="page-variables">
        <p id="file">8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4</p>
        <p id="filepatharg">F:%5ckaraoke%5c8%20V%e1%ba%a0N%206%20NG%c3%80N%20TH%c6%af%c6%a0NG%20-%20Ebm.mp4</p>
        <p id="filepath">F:\\karaoke\\8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4</p>
        <p id="filedirarg">F:%5ckaraoke</p>
        <p id="filedir">F:\\karaoke</p>
        <p id="state">2</p>
        <p id="statestring">Đang phát...</p>
        <p id="position">6382</p>
        <p id="positionstring">00:00:06</p>
        <p id="duration">276828</p>
        <p id="durationstring">00:04:37</p>
        <p id="volumelevel">100</p>
        <p id="muted">0</p>
        <p id="playbackrate">1.000000</p>
        <p id="size">83,8 MB</p>
        <p id="reloadtime">0</p>
        <p id="version">2.7.1.0</p>
                <p id="audiotrack">A: ISO Media file produced by Google Inc. (aac he-aac, 44100 Hz, stereo, 48 kb/s)</p>
        <p id="subtitletrack"></p>
    </body>
</html>`;

    await withPlatform("win32", async () => {

        // Capture 1: state=1 ("Đã dừng") -> KHÔNG coi là Playing, nhưng VẪN parse ra snapshot hợp lệ
        // (không phải state=0, nên KHÔNG bị coi là "không có gì" — vẫn có file đang mở trong MPC-HC).
        {
            const logger = createFakeLogger();
            const httpGetFn = createScriptedHttpGet([{ body: REAL_CAPTURE_1 }]);
            const session = new MpcHcSession({ logger, httpGetFn, pollIntervalMs: 100000 });

            let snapshot = null;
            session.on("change", (s) => { snapshot = s; });
            session.start();
            await sleep(20);

            check(logger.calls.warning.length === 0, "Capture #1 (response THẬT) -> KHÔNG log warning nào (parse đúng ngay, không còn bị coi là sai định dạng)");
            check(snapshot !== null, "Capture #1 -> vẫn tạo được snapshot (state=1, không phải 0)");
            check(snapshot && snapshot.title === "8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4", "Capture #1 -> title đọc đúng tiếng Việt có dấu");
            check(snapshot && snapshot.state === 1, "Capture #1 -> state = 1 (số), đúng dữ liệu thật");
            check(snapshot && snapshot.filePath === "F:\\karaoke\\8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4", "Capture #1 -> filePath đọc đúng");

            session.stop();
        }

        // Capture 2: state=2 ("Đang phát...") -> ĐÂY LÀ nguồn cần MPC_HC thắng SMTC theo NowPlayingArbitrator.
        {
            const logger = createFakeLogger();
            const httpGetFn = createScriptedHttpGet([{ body: REAL_CAPTURE_2 }]);
            const session = new MpcHcSession({ logger, httpGetFn, pollIntervalMs: 100000 });

            let snapshot = null;
            session.on("change", (s) => { snapshot = s; });
            session.start();
            await sleep(20);

            check(logger.calls.warning.length === 0, "Capture #2 (response THẬT) -> KHÔNG log warning nào");
            check(snapshot !== null && snapshot.state === 2, "Capture #2 -> state = 2, đúng dữ liệu thật (Playing)");
            check(snapshot && snapshot.positionMs === 6382, "Capture #2 -> positionMs đọc đúng (6382ms, khác Capture #1)");

            session.stop();
        }

    });

}

(async () => {

    await runPartA_PlatformGate();
    await runPartB_ValidResponseParsing();
    await runPartC_StateStoppedMeansNull();
    await runPartD_ConnectionRefused_NoCrash();
    await runPartE_MalformedResponse_NoCrash();
    await runPartF_PortResolution();
    await runPartG_DedupeOnUnchangedTrack();
    await runPartH_RealCapturedResponses_Regression();

    console.log("\n" + (failCount === 0 ? "✅ TẤT CẢ TEST PASS" : `❌ CÓ ${failCount} TEST FAIL`));
    process.exit(failCount === 0 ? 0 : 1);

})();
