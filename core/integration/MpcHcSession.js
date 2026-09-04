const http = require("http");
const { EventEmitter } = require("events");
const Logger = require("../shared/Logger");
const SnapshotCache = require("./SnapshotCache");

/**
 * ==========================================================
 * Auto Menu AI — MPC-HC Web Interface Integration
 * MpcHcSession
 * ----------------------------------------------------------
 * Data Acquisition Layer cho MPC-HC (Media Player Classic - Home
 * Cinema), đối xứng với WindowsMediaSession.js (SMTC) trong cùng
 * thư mục — CHỈ có nhiệm vụ lấy dữ liệu "đang phát", KHÔNG quyết
 * định Key/BPM/Lock, KHÔNG tự nối vào NowPlayingResolver/SongMatcher
 * (việc đó do app/main.js làm, giống hệt cách WindowsMediaSession
 * được dùng).
 *
 * NGUỒN DỮ LIỆU: MPC-HC Web Interface (tính năng có sẵn của MPC-HC,
 * bật tại Options > Player > Web Interface > "Listen on port"), một
 * server HTTP cục bộ (mặc định cổng 13579) trả về trang
 * `variables.html` — 1 file HTML đầy đủ, trong đó mỗi giá trị nằm
 * trong 1 thẻ `<p id="...">giá trị</p>` CÓ thuộc tính id. ĐÃ XÁC MINH
 * THẬT 2 lần độc lập trên máy Windows của người dùng (lấy bằng
 * `Invoke-WebRequest` — không phải suy đoán từ ảnh chụp trình duyệt đã
 * qua render như bản đầu tiên, bản đó từng đoán SAI là `<p>` trơn
 * không có id và gây lỗi thật khi chạy — đã sửa):
 *
 *   <p id="file">...</p>          Tên file hiển thị (có phần mở rộng)
 *   <p id="filepatharg">...</p>   FilePath đã encode URL
 *   <p id="filepath">...</p>      FilePath thật (đường dẫn tuyệt đối) — dùng để gọi
 *                                 NowPlayingResolver.resolve({source:"file", filePath}) ở
 *                                 app/main.js, TÁI SỬ DỤNG logic đọc ID3 tag/tách tên file có sẵn.
 *   <p id="filedirarg">...</p> / <p id="filedir">...</p>
 *   <p id="state">...</p>         Số. state=2 ĐÃ XÁC NHẬN THẬT (2 lần) tương ứng "Đang phát...".
 *                                 state=1 quan sát thật 1 lần tương ứng statestring="Đã dừng"
 *                                 (KHÁC quy ước "Paused" hay được nhắc trong tài liệu công khai
 *                                 MPC-HC — vì vậy KHÔNG suy diễn ý nghĩa 0/1 từ tài liệu, chỉ dựa
 *                                 duy nhất vào bằng chứng thật: 2 = đang phát, còn lại = không
 *                                 chắc chắn đang phát).
 *   <p id="statestring">...</p>   PHỤ THUỘC NGÔN NGỮ HỆ THỐNG — CHỈ dùng để log/hiển thị,
 *                                 KHÔNG BAO GIỜ dùng để quyết định logic play/pause/stop.
 *   <p id="position">...</p> / <p id="positionstring">...</p>
 *   <p id="duration">...</p> / <p id="durationstring">...</p>
 *   (volumelevel, muted, playbackrate, size, reloadtime, version, audiotrack,
 *   subtitletrack — không cần cho Task C, bỏ qua).
 *
 * Đọc theo ID (không đọc theo vị trí/thứ tự) — bền hơn nếu MPC-HC đổi
 * thứ tự field ở phiên bản khác, và tự bỏ qua field lạ không cần.
 *
 * KHÔNG polling dồn dập: đợi phản hồi (hoặc timeout) của lần poll
 * trước xong mới hẹn lần poll kế tiếp (giống nguyên lý chống spawn
 * chồng của WindowsMediaSession, áp dụng cho HTTP thay vì process).
 *
 * KHÔNG BAO GIỜ throw ra ngoài: mất kết nối (MPC-HC chưa mở/chưa bật
 * Web Interface), timeout, hay response sai định dạng đều được coi là
 * "không có dữ liệu lần poll này" — log (có chống log lặp) rồi tự thử
 * lại ở lần poll kế tiếp, không crash app.
 *
 * Cấu hình cổng: ưu tiên `options.port` (dùng cho test); nếu không có,
 * đọc từ cơ chế settings CÓ SẴN của project (tham số `readSettingsFile`
 * — cùng hàm mà app/main.js đã truyền cho CommandRuntime.start(), đọc
 * file JSON tại `app.getPath("userData")/app-settings.json`), field
 * `mpcHcPort`; nếu vẫn không có, dùng cổng mặc định trong
 * mpchc.config.default.json (13579). KHÔNG tự tạo cơ chế settings mới.
 * ==========================================================
 */

const DEFAULT_CONFIG = require("./mpchc.config.default.json");
const VARIABLE_ROW_RE = /<p id="([a-zA-Z0-9_]+)">([\s\S]*?)<\/p>/g;

// Các key bắt buộc phải đọc được (theo đúng id thật trong variables.html) mới coi là hợp lệ.
const REQUIRED_KEYS = ["file", "filepath", "state", "position", "duration"];

const STATE_STOPPED = 0;
const STATE_PAUSED = 1;
const STATE_PLAYING = 2;

function defaultHttpGet(url, { timeoutMs }, callback) {

    let settled = false;

    const finish = (err, body) => {
        if (settled) return; // phòng trường hợp cả 'error' lẫn 'timeout' cùng bắn (đã thấy trong Node có thể xảy ra)
        settled = true;
        callback(err, body);
    };

    let req;

    try {

        req = http.get(url, { timeout: timeoutMs }, (res) => {

            if (res.statusCode !== 200) {
                res.resume(); // xả bỏ response để giải phóng socket, không cần đọc nội dung
                finish(new Error(`HTTP status ${res.statusCode}`));
                return;
            }

            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => finish(null, data));
            res.on("error", (err) => finish(err));

        });

    } catch (err) {

        finish(err);
        return;

    }

    req.on("timeout", () => { req.destroy(new Error("request timeout")); });
    req.on("error", (err) => finish(err));

}

class MpcHcSession extends EventEmitter {

    /**
     * @param {object} [options]
     * @param {number} [options.port] Ghi đè cổng trực tiếp (DÙNG CHO TEST — bỏ qua settings file)
     * @param {Function} [options.readSettingsFile] Hàm đọc settings hiện có của project (trả về object|null),
     *        dùng để lấy field `mpcHcPort` nếu người dùng đã cấu hình. Cùng convention DI mà
     *        CommandRuntime.start({ readSettingsFile }) đang dùng trong app/main.js.
     * @param {number} [options.pollIntervalMs]
     * @param {number} [options.requestTimeoutMs]
     * @param {Function} [options.httpGetFn] Cho phép tiêm HTTP client giả (DÙNG CHO TEST)
     * @param {object} [options.logger]
     */
    constructor(options = {}) {

        super();

        this._config = { ...DEFAULT_CONFIG, ...options };
        this._readSettingsFile = typeof options.readSettingsFile === "function" ? options.readSettingsFile : null;
        this._httpGetFn = options.httpGetFn || defaultHttpGet;
        this._logger = options.logger || Logger;

        this._explicitPort = typeof options.port === "number" ? options.port : null;
        this._port = this._resolvePort();

        this._cache = new SnapshotCache();
        this._timer = null;
        this._polling = false;
        this._stopping = false;
        this._available = null; // null = chưa biết, true/false = đã xác định
        this._lastErrorMessage = null;

    }

    // -------------------------------------------------------
    // API công khai — cùng hình dạng với WindowsMediaSession.js
    // -------------------------------------------------------

    start() {

        if (this._polling) return true; // đã chạy rồi -> không poll chồng (idempotent, giống start() của SMTC)

        if (process.platform !== "win32") {

            this._logger.warning("MpcHcSession", "Bỏ qua: chỉ hỗ trợ Windows (process.platform !== 'win32')");
            this._available = false;
            this.emit("unavailable", { reason: "non_windows" });
            return false;

        }

        this._stopping = false;
        this._polling = true;
        this._available = true; // cơ chế polling đã sẵn sàng chạy — KHÁC với "MPC-HC hiện có đang phát hay không"
                                 // (điều đó thể hiện qua snapshot null/không-null, không phải qua isAvailable()).

        this._logger.info("MpcHcSession", `[START] Bắt đầu poll MPC-HC Web Interface tại http://127.0.0.1:${this._port}/variables.html mỗi ${this._config.pollIntervalMs}ms`);
        this.emit("ready");

        this._pollOnce();

        return true;

    }

    stop() {

        this._stopping = true;
        this._polling = false;

        if (this._timer) { clearTimeout(this._timer); this._timer = null; }

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

    getPort() {

        return this._port;

    }

    // -------------------------------------------------------
    // Nội bộ
    // -------------------------------------------------------

    _resolvePort() {

        if (this._explicitPort !== null) return this._explicitPort;

        if (this._readSettingsFile) {

            try {

                const settings = this._readSettingsFile();

                if (settings && typeof settings.mpcHcPort === "number" && settings.mpcHcPort > 0) {
                    return settings.mpcHcPort;
                }

            } catch (err) {

                this._logger.warning("MpcHcSession", `Đọc settings để lấy mpcHcPort lỗi, dùng cổng mặc định: ${err.message}`);

            }

        }

        return this._config.defaultPort;

    }

    _pollOnce() {

        if (this._stopping) return;

        const url = `http://127.0.0.1:${this._port}/variables.html`;

        this._httpGetFn(url, { timeoutMs: this._config.requestTimeoutMs }, (err, body) => {

            if (this._stopping) return; // đã stop() giữa lúc đang chờ HTTP -> bỏ qua kết quả đến trễ

            if (err) {
                this._handleFetchError(err);
            } else {
                this._handleResponseBody(body);
            }

            this._scheduleNextPoll();

        });

    }

    _scheduleNextPoll() {

        if (this._stopping) return;

        this._timer = setTimeout(() => this._pollOnce(), this._config.pollIntervalMs);

    }

    _handleFetchError(err) {

        // Các lý do thường gặp: ECONNREFUSED (MPC-HC chưa mở hoặc chưa bật Web Interface),
        // timeout, hoặc HTTP status khác 200. Đều là tình huống HỢP LỆ (không phải lỗi
        // chương trình) -> không throw, chỉ log (chống lặp) và coi như không có dữ liệu.
        const message = err && err.message ? err.message : String(err);

        this._logErrorOnce(`Không lấy được dữ liệu từ MPC-HC Web Interface: ${message}`);
        this._applySnapshot(null);

    }

    _handleResponseBody(body) {

        const fields = this._parseVariablesHtml(body);

        if (!fields) {

            this._logErrorOnce("Response từ MPC-HC Web Interface không đúng định dạng mong đợi (thiếu field) — bỏ qua nguồn này lần poll này");
            this._applySnapshot(null);
            return;

        }

        const stateRaw = Number(fields.state);

        if (![STATE_STOPPED, STATE_PAUSED, STATE_PLAYING].includes(stateRaw)) {

            this._logErrorOnce(`MPC-HC trả về mã State không nhận diện được: "${fields.state}" — bỏ qua nguồn này lần poll này`);
            this._applySnapshot(null);
            return;

        }

        this._lastErrorMessage = null; // lần poll này hợp lệ -> reset chống-lặp-log cho lỗi kế tiếp (nếu có)

        if (stateRaw === STATE_STOPPED) {

            // Không có file nào đang tải trong MPC-HC -> không có gì để báo.
            this._applySnapshot(null);
            return;

        }

        const title = (fields.file || "").trim();

        if (!title) {

            this._applySnapshot(null);
            return;

        }

        const snapshot = {
            application: "mpc-hc",
            title,
            artist: null, // MPC-HC Web Interface không cung cấp Artist tách riêng — việc tách
                           // Title/Artist từ tên file do NowPlayingResolver({source:"file"}) đảm nhiệm ở main.js.
            filePath: (fields.filepath || "").trim() || null,
            state: stateRaw,
            stateString: fields.statestring || null,
            positionMs: Number(fields.position) || 0,
            durationMs: Number(fields.duration) || 0,
            timestamp: Date.now()
        };

        this._applySnapshot(snapshot);

    }

    _parseVariablesHtml(body) {

        if (typeof body !== "string" || !body) return null;

        const fields = {};
        let m;

        VARIABLE_ROW_RE.lastIndex = 0; // regex có cờ "g" -> phải reset lastIndex trước mỗi lần dùng lại

        while ((m = VARIABLE_ROW_RE.exec(body)) !== null) {
            fields[m[1]] = m[2];
        }

        const hasAllRequired = REQUIRED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(fields, key));

        if (!hasAllRequired) return null;

        return fields;

    }

    _applySnapshot(nextSnapshot) {

        const result = this._cache.update(nextSnapshot);

        if (!result.changed) return; // đúng nguyên lý SnapshotCache: không log/emit nếu Application+Title+Artist không đổi

        if (result.reason === "became_empty" || result.reason === "became_available") {

            this._logger.info("MpcHcSession", result.snapshot
                ? `[SESSION CHANGED] MPC-HC đang phát: "${result.snapshot.title}"`
                : "[SESSION CHANGED] MPC-HC không còn phát gì (Stopped/không kết nối được)");

        } else {

            this._logger.info("MpcHcSession", `[SESSION CHANGED] MPC-HC đổi bài -> "${result.snapshot.title}"`);

        }

        this.emit("change", result.snapshot);

    }

    _logErrorOnce(message) {

        if (message === this._lastErrorMessage) return; // chống log lặp liên tục mỗi 2s khi lỗi không đổi

        this._lastErrorMessage = message;
        this._logger.warning("MpcHcSession", message);

    }

}

module.exports = MpcHcSession;
