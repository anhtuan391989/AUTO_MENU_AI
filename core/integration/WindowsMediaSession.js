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
            "-ExecutionPolicy", "Bypass",
            "-File", this._scriptPath,
            "-PollIntervalMs", String(this._config.pollIntervalMs)
        ];

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

            this._logger.error("WindowsMediaSession", `Không nhận được "ready" sau ${this._config.readyTimeoutMs}ms — dừng tiến trình`);
            this._available = false;
            this.emit("unavailable", { reason: "ready_timeout" });
            this.stop();

        }, this._config.readyTimeoutMs);

        child.stdout.on("data", (chunk) => this._onStdoutData(chunk));

        child.stderr.on("data", (chunk) => {

            const text = chunk.toString("utf-8").trim();
            if (text) this._logger.warning("WindowsMediaSession", `[powershell stderr] ${text}`);

        });

        child.on("error", (err) => {

            // Lỗi spawn (vd không tìm thấy powershell.exe) hoặc lỗi runtime của
            // tiến trình con — không throw ra ngoài, chỉ log + đánh dấu unavailable.
            this._handleUnrecoverableSpawnFailure(err);

        });

        child.on("exit", (code, signal) => {

            this._onChildExit(code, signal);

        });

    }

    _handleUnrecoverableSpawnFailure(err) {

        this._logger.error("WindowsMediaSession", `Không spawn được powershell.exe: ${err.message}`);
        this._child = null;
        this._available = false;
        this.emit("unavailable", { reason: "spawn_failed", message: err.message });

    }

    _onChildExit(code, signal) {

        this._child = null;

        if (this._readyTimeoutHandle) { clearTimeout(this._readyTimeoutHandle); this._readyTimeoutHandle = null; }

        if (this._stopping) return; // dừng có chủ đích (gọi stop()) -> không restart

        this._logger.warning("WindowsMediaSession", `Tiến trình smtc-daemon.ps1 thoát bất ngờ (code=${code}, signal=${signal})`);

        if (this._restartAttempts >= this._config.restartMaxAttempts) {

            this._logger.error("WindowsMediaSession", `Đã thử khởi động lại ${this._restartAttempts} lần, dừng hẳn`);
            this._available = false;
            this.emit("unavailable", { reason: "max_restarts_exceeded" });
            return;

        }

        this._restartAttempts++;

        this._restartTimeoutHandle = setTimeout(() => {

            if (!this._stopping) this._spawnDaemon();

        }, this._config.restartBackoffMs);

    }

    _onStdoutData(chunk) {

        this._stdoutBuffer += chunk.toString("utf-8");

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

        this._logger.info("WindowsMediaSession", `smtc-daemon.ps1 sẵn sàng (startup: ${this._metrics.readyAt - this._metrics.spawnedAt}ms)`);
        this.emit("ready");

    }

    _handleSnapshot(data) {

        if (this._metrics.firstSnapshotAt === null) {

            this._metrics.firstSnapshotAt = Date.now();

        }

        const result = this._cache.update(data);

        if (!result.changed) return; // đúng yêu cầu: không log, không emit nếu không đổi

        if (result.reason === "application_changed") {

            this._logger.info("WindowsMediaSession", `Ứng dụng thay đổi -> ${result.snapshot ? result.snapshot.application : "(không có)"}`);

        } else if (result.reason === "became_empty" || result.reason === "became_available") {

            this._logger.info("WindowsMediaSession", result.snapshot
                ? `Session mới: "${result.snapshot.title}" - ${result.snapshot.artist || "?"} (${result.snapshot.application})`
                : "Không còn session nào đang phát");

        } else {

            this._logger.info("WindowsMediaSession", `Session thay đổi -> "${result.snapshot.title}" - ${result.snapshot.artist || "?"}`);

        }

        this.emit("change", result.snapshot);

    }

    _handleError(errorMessage) {

        // Chỉ log khi thông báo lỗi THỰC SỰ khác lần trước — tránh log lặp lại
        // liên tục nếu 1 session cụ thể lỗi ở mọi lần poll.
        if (errorMessage === this._lastErrorMessage) return;

        this._lastErrorMessage = errorMessage;
        this._logger.warning("WindowsMediaSession", `Không lấy được dữ liệu: ${errorMessage}`);
        this.emit("error", new Error(errorMessage));

    }

    _handleFatal(errorMessage) {

        this._logger.error("WindowsMediaSession", `Lỗi không thể phục hồi: ${errorMessage}`);
        this._available = false;
        this._stopping = true; // KHÔNG restart — lỗi fatal sẽ lặp lại y hệt
        this.stop();
        this.emit("unavailable", { reason: "fatal", message: errorMessage });

    }

}

module.exports = WindowsMediaSession;
