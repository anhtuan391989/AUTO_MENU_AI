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
// Helper: dựng body variables.html giống HỆT dữ liệu THẬT đã chụp màn hình
// (8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4, State=2/"Đang phát...", vv.)
// ================================
function buildRealSampleBody({ title = "8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4", filePath = "F:\\karaoke\\8 VẠN 6 NGÀN THƯƠNG - Ebm.mp4", state = 2, stateString = "Đang phát...", positionMs = 237895, durationMs = 276828 } = {}) {

    const fields = [
        title,
        "F:%5ckaraoke%5cencoded.mp4",
        filePath,
        "F:%5ckaraoke",
        "F:\\karaoke",
        String(state),
        stateString,
        String(positionMs),
        "00:03:58",
        String(durationMs),
        "00:04:37",
        "100",
        "0",
        "1.000000",
        "83,8 MB",
        "0",
        "2.7.1.0",
        "A: ISO Media file produced by Google Inc. (aac he-aac, 44100 Hz, stereo, 48 kb/s)"
    ];

    return fields.map((v) => `<p>${v}</p>`).join("\n");

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
        check(snapshot.positionMs === 237895, "snapshot.positionMs parse đúng số");
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

(async () => {

    await runPartA_PlatformGate();
    await runPartB_ValidResponseParsing();
    await runPartC_StateStoppedMeansNull();
    await runPartD_ConnectionRefused_NoCrash();
    await runPartE_MalformedResponse_NoCrash();
    await runPartF_PortResolution();
    await runPartG_DedupeOnUnchangedTrack();

    console.log("\n" + (failCount === 0 ? "✅ TẤT CẢ TEST PASS" : `❌ CÓ ${failCount} TEST FAIL`));
    process.exit(failCount === 0 ? 0 : 1);

})();
