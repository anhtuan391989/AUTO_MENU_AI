const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const Logger = require("../shared/Logger");
const SnapshotCache = require("./SnapshotCache");

/**
 * ==========================================================
 * Auto Menu AI — Windows Media Session Integration
 * WindowsMediaSession
 * ----------------------------------------------------------
 * Data Acquisition Layer cho Windows System Media Transport Controls
 * (SMTC). CHỈ có nhiệm vụ lấy dữ liệu "Now Playing" — KHÔNG quyết
 * định Key, KHÔNG quyết định BPM, KHÔNG quyết định Lock, KHÔNG tự
 * nối vào NowPlayingResolver/SongMatcher/SongDatabase/AutoSongCollector
 * (đúng yêu cầu: "Task này chỉ xây xong lớp Integration").
 *
 * KHÔNG spawn PowerShell liên tục — chỉ spawn ĐÚNG 1 TIẾN TRÌNH
 * `smtc-daemon.ps1` sống suốt vòng đời, tự poll bên trong PowerShell
 * theo `pollIntervalMs`, in JSON theo dòng ra stdout. Node chỉ đọc
 * dòng, không spawn lại mỗi lần cần dữ liệu (tránh chi phí khởi động
 * PowerShell lặp lại — đã nêu rủi ro này trong báo cáo nghiên cứu).
 *
 * Dùng EventEmitter CỦA NODE (module lõi `events`), KHÔNG PHẢI
 * EventBus của project — không đụng Event Flow hiện có.
 *
 * ⚠️ QUAN TRỌNG: module này chỉ hoạt động thật trên Windows 10 1809+/
 * Windows 11. Trên các HĐH khác, start() phát hiện ngay
 * (process.platform !== "win32") và KHÔNG spawn gì cả — trả về false,
 * phát event "unavailable", không throw, không crash app.
 * ==========================================================
 */

const DEFAULT_CONFIG = require("./config.default.json");
const DEFAULT_SCRIPT_PATH = path.resolve(__dirname, "smtc-daemon.ps1");

class WindowsMediaSession extends EventEmitter {

    /**
     * @param {object} [options]
     * @param {number} [options.pollIntervalMs] Ghi đè config.default.json
     * @param {number} [options.restartMaxAttempts]
     * @param {number} [options.restartBackoffMs]
     * @param {number} [options.readyTimeoutMs]
     * @param {number} [options.winRtCallTimeoutMs] Timeout cho mỗi lệnh gọi WinRT bên trong .ps1 (phòng deadlock)
     * @param {string} [options.scriptPath] Đường dẫn tới smtc-daemon.ps1 (mặc định: cùng thư mục)
     * @param {Function} [options.spawnFn] Cho phép tiêm hàm spawn khác (DÙNG CHO TEST — không dùng trong production)
     * @param {object} [options.logger] Cho phép tiêm logger khác (mặc định: core/shared/Logger)
     */
    constructor(options = {}) {

        super();

        this._config = { ...DEFAULT_CONFIG, ...options };
        this._scriptPath = options.scriptPath || DEFAULT_SCRIPT_PATH;
        this._spawnFn = options.spawnFn || spawn;
        this._logger = options.logger || Logger;

        this._cache = new SnapshotCache();
        this._child = null;
        this._generation = 0;
        this._stdoutBuffer = "";
        this._stopping = false;
        this._restartAttempts = 0;
        this._readyTimeoutHandle = null;
        this._restartTimeoutHandle = null;
        this._lastErrorMessage = null;
        this._available = null; // null = chưa biết, true/false = đã xác định

        this._metrics = {
            spawnedAt: null,
            readyAt: null,
            firstSnapshotAt: null
        };

    }

    // -------------------------------------------------------
    // API công khai
    // -------------------------------------------------------

    start() {

        if (this._child) return true; // đã chạy rồi -> không spawn thêm (chống spawn trùng)

        if (process.platform !== "win32") {

            this._logger.warning("WindowsMediaSession", "Bỏ qua: chỉ hỗ trợ Windows (process.platform !== 'win32')");
            this._available = false;
            this.emit("unavailable", { reason: "non_windows" });
            return false;

        }

        if (!fs.existsSync(this._scriptPath) && this._spawnFn === spawn) {

            // Chỉ kiểm tra tồn tại file khi dùng spawn thật (test có thể tiêm
            // spawnFn giả không cần file .ps1 thật tồn tại).
            this._logger.error("WindowsMediaSession", `Không tìm thấy script: ${this._scriptPath}`);
            this._available = false;
            this.emit("unavailable", { reason: "script_missing" });
            return false;

        }

        this._stopping = false;
        this._spawnDaemon();

        return true;

    }

    stop() {

        this._stopping = true;
        this._generation++; // vô hiệu hoá NGAY LẬP TỨC mọi listener của tiến trình con hiện tại

        if (this._readyTimeoutHandle) { clearTimeout(this._readyTimeoutHandle); this._readyTimeoutHandle = null; }
        if (this._restartTimeoutHandle) { clearTimeout(this._restartTimeoutHandle); this._restartTimeoutHandle = null; }

        if (this._child) {

            try { this._child.kill(); } catch {}
            this._child = null;

        }

        this._stdoutBuffer = "";

    }

    // Snapshot gần nhất theo đúng contract: object hoặc null. KHÔNG BAO GIỜ throw.
    getLastSnapshot() {

        try {

            return this._cache.get();

        } catch {

            return null;

        }

    }

    isAvailable() {

        return this._available === true;

    }

    getMetrics() {

        const m = this._metrics;

        return {
            spawnedAt: m.spawnedAt,
            readyAt: m.readyAt,
            firstSnapshotAt: m.firstSnapshotAt,
            startupMs: (m.spawnedAt && m.readyAt) ? (m.readyAt - m.spawnedAt) : null,
            timeToFirstSnapshotMs: (m.spawnedAt && m.firstSnapshotAt) ? (m.firstSnapshotAt - m.spawnedAt) : null
        };

    }

    // -------------------------------------------------------
    // Nội bộ
    // -------------------------------------------------------

    _spawnDaemon() {

        this._metrics.spawnedAt = Date.now();
        this._metrics.readyAt = null;
        this._metrics.firstSnapshotAt = null;

        const args = [
            "-NoProfile",
            "-NonInteractive",
            "-MTA", // Xem BƯỚC quan trọng trong báo cáo: powershell.exe mặc định STA,
                    // WinRT IAsyncOperation await qua Task.Wait() có rủi ro deadlock
                    // trong console app không có Windows message loop để pump khi ở
                    // STA (nguyên nhân khả dĩ nhất của "không bao giờ nhận được ready"
                    // — xem dẫn chứng trong báo cáo). MTA không cần message pump.
            "-ExecutionPolicy", "Bypass",
            "-File", this._scriptPath,
            "-PollIntervalMs", String(this._config.pollIntervalMs),
            "-WinRtCallTimeoutMs", String(this._config.winRtCallTimeoutMs)
        ];

        // "Thế hệ" của tiến trình con lần này — dùng để CHẶN dữ liệu đến trễ từ
        // 1 tiến trình con ĐÃ BỊ retire (do stop()/fatal/restart) nhưng vẫn còn
        // gửi thêm vài byte cuối trước khi thực sự thoát hẳn (race condition đã
        // rà soát lại theo đúng yêu cầu "kiểm tra lại toàn bộ logic restart").
        const generation = ++this._generation;

        let child;

        try {

            child = this._spawnFn("powershell.exe", args, { windowsHide: true });

        } catch (err) {

            this._handleUnrecoverableSpawnFailure(err);
            return;

        }

        this._child = child;

        // Nếu không nhận được "ready" trong readyTimeoutMs -> coi như treo/lỗi,
        // dừng lại, không đợi vô thời hạn.
        this._readyTimeoutHandle = setTimeout(() => {

            if (generation !== this._generation) return; // đã bị thay thế/stop, không còn liên quan

            this._logger.error("WindowsMediaSession", `[ERROR] Không nhận được "ready" sau ${this._config.readyTimeoutMs}ms — dừng tiến trình (nghi ngờ deadlock WinRT hoặc PowerShell không tương thích, xem báo cáo)`);
            this._available = false;
            this.emit("unavailable", { reason: "ready_timeout" });
            this.stop();

        }, this._config.readyTimeoutMs);

        child.stdout.setEncoding("utf8"); // QUAN TRỌNG: để Node tự xử lý đúng ký tự
        // UTF-8 đa-byte (dấu tiếng Việt) bị TCP/pipe cắt ngang giữa 2 lần 'data' —
        // nếu tự gọi Buffer.toString('utf-8') theo từng chunk riêng lẻ (cách cũ),
        // 1 byte dở dang ở cuối chunk sẽ bị decode sai thành ký tự lỗi (U+FFFD),
        // làm hỏng JSON. setEncoding('utf8') dùng StringDecoder nội bộ của Node,
        // tự giữ lại byte dở dang chờ chunk kế tiếp — đây là cách chính thức được
        // Node khuyến nghị cho đúng tình huống này.
        child.stdout.on("data", (chunk) => {

            if (generation !== this._generation) return; // dữ liệu trễ từ tiến trình con đã bị retire -> bỏ qua
            this._onStdoutData(chunk);

        });

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {

            if (generation !== this._generation) return;

            const text = chunk.trim();
            if (text) this._logger.warning("WindowsMediaSession", `[powershell stderr] ${text}`);

        });

        child.on("error", (err) => {

            if (generation !== this._generation) return;

            // Lỗi spawn (vd không tìm thấy powershell.exe) hoặc lỗi runtime của
            // tiến trình con — không throw ra ngoài, chỉ log + đánh dấu unavailable.
            this._handleUnrecoverableSpawnFailure(err);

        });

        child.on("exit", (code, signal) => {

            if (generation !== this._generation) return;

            this._onChildExit(code, signal);

        });

    }

    _handleUnrecoverableSpawnFailure(err) {

        this._logger.error("WindowsMediaSession", `[ERROR] Không spawn được powershell.exe: ${err.message}`);
        this._child = null;
        this._available = false;
        this.emit("unavailable", { reason: "spawn_failed", message: err.message });

    }

    _onChildExit(code, signal) {

        this._child = null;

        if (this._readyTimeoutHandle) { clearTimeout(this._readyTimeoutHandle); this._readyTimeoutHandle = null; }

        if (this._stopping) return; // dừng có chủ đích (gọi stop()) -> không restart

        this._logger.warning("WindowsMediaSession", `[EXIT] Tiến trình smtc-daemon.ps1 thoát bất ngờ (code=${code}, signal=${signal})`);

        if (this._restartAttempts >= this._config.restartMaxAttempts) {

            this._logger.error("WindowsMediaSession", `[ERROR] Đã thử khởi động lại ${this._restartAttempts} lần, dừng hẳn (restartMaxAttempts=${this._config.restartMaxAttempts})`);
            this._available = false;
            this.emit("unavailable", { reason: "max_restarts_exceeded" });
            return;

        }

        this._restartAttempts++;

        this._logger.info("WindowsMediaSession", `[RESTART] Thử khởi động lại lần ${this._restartAttempts}/${this._config.restartMaxAttempts} sau ${this._config.restartBackoffMs}ms`);
        this.emit("restart", { attempt: this._restartAttempts, maxAttempts: this._config.restartMaxAttempts, backoffMs: this._config.restartBackoffMs, code, signal });

        this._restartTimeoutHandle = setTimeout(() => {

            if (!this._stopping) this._spawnDaemon();

        }, this._config.restartBackoffMs);

    }

    _onStdoutData(chunk) {

        // chunk đã là string (không phải Buffer) vì đã setEncoding("utf8") ở
        // stream — Node tự đảm bảo không cắt ngang ký tự đa-byte giữa các lần gọi.
        this._stdoutBuffer += chunk;

        let newlineIndex;

        while ((newlineIndex = this._stdoutBuffer.indexOf("\n")) !== -1) {

            const line = this._stdoutBuffer.slice(0, newlineIndex).trim();
            this._stdoutBuffer = this._stdoutBuffer.slice(newlineIndex + 1);

            if (line) this._handleLine(line);

        }

    }

    _handleLine(line) {

        let message;

        try {

            message = JSON.parse(line);

        } catch {

            // Dòng không phải JSON hợp lệ (vd banner PowerShell in lạc vào) ->
            // bỏ qua, không throw, không crash.
            this._logger.warning("WindowsMediaSession", `Bỏ qua dòng không phải JSON hợp lệ: ${line.slice(0, 120)}`);
            return;

        }

        if (!message || typeof message !== "object" || !message.type) return;

        switch (message.type) {

            case "ready":
                this._handleReady();
                break;

            case "snapshot":
                this._handleSnapshot(message.data);
                break;

            case "error":
                this._handleError(message.message);
                break;

            case "fatal":
                this._handleFatal(message.message);
                break;

            default:
                this._logger.warning("WindowsMediaSession", `Loại message không rõ: ${message.type}`);

        }

    }

    _handleReady() {

        if (this._readyTimeoutHandle) { clearTimeout(this._readyTimeoutHandle); this._readyTimeoutHandle = null; }

        this._metrics.readyAt = Date.now();
        this._restartAttempts = 0; // khởi động thành công -> reset bộ đếm backoff
        this._available = true;

        this._logger.info("WindowsMediaSession", `[READY] smtc-daemon.ps1 sẵn sàng (startup: ${this._metrics.readyAt - this._metrics.spawnedAt}ms)`);
        this.emit("ready");

    }

    _handleSnapshot(data) {

        if (this._metrics.firstSnapshotAt === null) {

            this._metrics.firstSnapshotAt = Date.now();

        }

        const result = this._cache.update(data);

        if (!result.changed) return; // đúng yêu cầu: không log, không emit nếu không đổi

        if (result.reason === "application_changed") {

            this._logger.info("WindowsMediaSession", `[SESSION CHANGED] Ứng dụng thay đổi -> ${result.snapshot ? result.snapshot.application : "(không có)"}`);

        } else if (result.reason === "became_empty" || result.reason === "became_available") {

            this._logger.info("WindowsMediaSession", result.snapshot
                ? `[SESSION CHANGED] Session mới: "${result.snapshot.title}" - ${result.snapshot.artist || "?"} (${result.snapshot.application})`
                : "[SESSION CHANGED] Không còn session nào đang phát");

        } else {

            this._logger.info("WindowsMediaSession", `[SESSION CHANGED] Đổi bài -> "${result.snapshot.title}" - ${result.snapshot.artist || "?"}`);

        }

        this._logger.info("WindowsMediaSession", `[SNAPSHOT] ${result.snapshot ? JSON.stringify({ application: result.snapshot.application, title: result.snapshot.title, artist: result.snapshot.artist }) : "null"}`);

        this.emit("change", result.snapshot);

    }

    _handleError(errorMessage) {

        // Chỉ log khi thông báo lỗi THỰC SỰ khác lần trước — tránh log lặp lại
        // liên tục nếu 1 session cụ thể lỗi ở mọi lần poll.
        if (errorMessage === this._lastErrorMessage) return;

        this._lastErrorMessage = errorMessage;
        this._logger.warning("WindowsMediaSession", `[ERROR] Không lấy được dữ liệu: ${errorMessage}`);
        this.emit("error", new Error(errorMessage));

    }

    _handleFatal(errorMessage) {

        this._logger.error("WindowsMediaSession", `[ERROR] Lỗi không thể phục hồi (fatal): ${errorMessage}`);
        this._available = false;
        this._stopping = true; // KHÔNG restart — lỗi fatal sẽ lặp lại y hệt
        this.stop();
        this.emit("unavailable", { reason: "fatal", message: errorMessage });

    }

}

module.exports = WindowsMediaSession;
