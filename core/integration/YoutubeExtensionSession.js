/**
 * ==========================================================
 * Auto Menu AI — YouTube Extension Session (nguồn Now Playing thứ 3)
 * core/integration/YoutubeExtensionSession.js
 * ----------------------------------------------------------
 * Nhận dữ liệu từ tiện ích trình duyệt "KHOI" (extensions/KHOI_YTB_Extension, nguồn gốc: "HT DAW - YouTube Tone Detection"):
 * mỗi ~1 giây tiện ích POST JSON tới http://127.0.0.1:8765/youtube gồm video_id, title, is_playing,
 * current_time (giây), duration (giây), is_ad. Nhờ vậy Menu biết CHÍNH XÁC bài YouTube đang phát,
 * đang chạy hay tạm dừng, vị trí thật (tua là thấy ngay) và biết khi nào là quảng cáo.
 *
 * Cùng "hợp đồng" với MpcHcSession / WindowsMediaSession: EventEmitter, KHÔNG BAO GIỜ throw ra ngoài.
 *   events : "ready" ({port}) | "change" (snapshot|null) | "unavailable" ({reason}) | "error" (Error)
 *   methods: start() | stop() | getLatestSnapshot() | getPort() | isListening()
 *
 * "change" chỉ phát khi đổi video / đổi tiêu đề / đổi đang-phát<->tạm-dừng / mất kết nối (null).
 * Vị trí thay đổi mỗi giây KHÔNG phát "change" — dùng getLatestSnapshot() (giống MPC-HC).
 *
 * AN TOÀN (cổng localhost là cửa vào từ trình duyệt, nên kiểm tra chặt):
 *   - Chỉ lắng nghe 127.0.0.1 (không ra mạng LAN).
 *   - Chỉ nhận POST/OPTIONS tại đúng đường dẫn /youtube.
 *   - Header Host phải là 127.0.0.1/localhost (chống DNS rebinding).
 *   - Header Origin (nếu có) phải là chrome-extension:// hoặc moz-extension:// — một trang web thường gọi vào sẽ bị 403.
 *   - Thân yêu cầu tối đa 16KB; mọi trường được ép kiểu + giới hạn độ dài; video_id đúng 11 ký tự [A-Za-z0-9_-].
 *   - Cổng bận (vd HT DAW đang chạy cùng lúc) -> báo "unavailable", tự thử lại sau 15s, KHÔNG làm sập app.
 *
 * Tiện ích BẢN CŨ không gửi "duration" -> bỏ qua dữ liệu đó (ghi log 1 lần) để SMTC tiếp tục làm việc như trước,
 * tránh mất đồng hồ bài. Cập nhật tiện ích (extensions/KHOI_YTB_Extension) là có đủ duration.
 * ==========================================================
 */
"use strict";

const EventEmitter = require("events");
const http = require("http");

const DEFAULT_PORT = 8765;
const DEFAULT_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 16 * 1024;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOST_RE = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;
const EXT_ORIGIN_RE = /^(chrome|moz)-extension:\/\//i;
const MAX_TITLE_LEN = 300;
const MAX_DURATION_SEC = 24 * 60 * 60;
const OTHER_TAB_GUARD_MS = 3000;

function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n);
}

class YoutubeExtensionSession extends EventEmitter {

    /**
     * @param {object} [opts]
     * @param {number} [opts.port=8765]   0 = cổng ngẫu nhiên (dùng khi test)
     * @param {string} [opts.host="127.0.0.1"]
     * @param {number} [opts.staleMs=6000]  quá lâu không nhận được gì => coi như tab đã đóng / ngừng phát
     * @param {number} [opts.retryMs=15000] cổng bận => thử lại sau chừng này
     * @param {function} [opts.now]         Date.now (tiêm khi test)
     */
    constructor(opts) {
        super();
        const o = opts || {};
        this._port = isFiniteNumber(o.port) ? o.port : DEFAULT_PORT;
        this._host = o.host || DEFAULT_HOST;
        this._staleMs = isFiniteNumber(o.staleMs) ? o.staleMs : 6000;
        this._retryMs = isFiniteNumber(o.retryMs) ? o.retryMs : 15000;
        this._now = typeof o.now === "function" ? o.now : () => Date.now();
        this._server = null;
        this._listening = false;
        this._stopped = true;
        this._retryTimer = null;
        this._staleTimer = null;
        this._snapshot = null;
        this._lastSeenAt = 0;
        this._lastEmittedKey = null;
        this._warnedNoDuration = false;
    }

    getLatestSnapshot() { return this._snapshot ? { ...this._snapshot } : null; }
    getPort() {
        try { return this._server && this._server.address() ? this._server.address().port : this._port; } catch { return this._port; }
    }
    isListening() { return this._listening === true; }

    start() {
        try {
            this._stopped = false;
            this._listen();
            if (!this._staleTimer) {
                this._staleTimer = setInterval(() => this._checkStale(), 1000);
                if (typeof this._staleTimer.unref === "function") this._staleTimer.unref();
            }
        } catch (err) {
            this._safeEmitError(err);
        }
    }

    stop() {
        this._stopped = true;
        try { if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; } } catch { /* bỏ qua */ }
        try { if (this._staleTimer) { clearInterval(this._staleTimer); this._staleTimer = null; } } catch { /* bỏ qua */ }
        try { if (this._server) { this._server.close(); } } catch { /* bỏ qua */ }
        this._server = null;
        this._listening = false;
        this._snapshot = null;
        this._lastEmittedKey = null;
    }

    _listen() {
        if (this._server) return;
        const server = http.createServer((req, res) => this._onRequest(req, res));
        this._server = server;
        server.on("error", (err) => {
            this._listening = false;
            try { server.close(); } catch { /* bỏ qua */ }
            if (this._server === server) this._server = null;
            const reason = err && err.code ? err.code : (err && err.message) || "unknown";
            try { this.emit("unavailable", { reason }); } catch { /* listener lỗi không được lan ra */ }
            if (!this._stopped && !this._retryTimer) {
                this._retryTimer = setTimeout(() => { this._retryTimer = null; if (!this._stopped) this._listen(); }, this._retryMs);
                if (typeof this._retryTimer.unref === "function") this._retryTimer.unref();
            }
        });
        server.listen(this._port, this._host, () => {
            this._listening = true;
            try { this.emit("ready", { port: this.getPort() }); } catch { /* bỏ qua */ }
        });
    }

    _safeEmitError(err) {
        try { if (this.listenerCount("error") > 0) this.emit("error", err); } catch { /* bỏ qua */ }
    }

    _onRequest(req, res) {
        const finish = (code, headers) => { try { res.writeHead(code, headers || {}); res.end(); } catch { /* bỏ qua */ } };
        try {
            const host = req.headers.host || "";
            if (!HOST_RE.test(host)) return finish(403);

            const origin = req.headers.origin;
            const originOk = !origin || EXT_ORIGIN_RE.test(origin);
            if (!originOk) return finish(403);

            const cors = origin ? {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Private-Network": "true",
                "Vary": "Origin"
            } : {};

            const pathOnly = String(req.url || "").split("?")[0];
            if (pathOnly !== "/youtube") return finish(404, cors);
            if (req.method === "OPTIONS") return finish(204, cors);
            if (req.method !== "POST") return finish(405, cors);

            let size = 0;
            const chunks = [];
            let aborted = false;
            req.on("data", (c) => {
                if (aborted) return;
                size += c.length;
                if (size > MAX_BODY_BYTES) { aborted = true; finish(413, { ...cors, "Connection": "close" }); try { req.destroy(); } catch { /* bỏ qua */ } return; }
                chunks.push(c);
            });
            req.on("end", () => {
                if (aborted) return;
                let info = null;
                try { info = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return finish(400, cors); }
                try { this.ingest(info); } catch (err) { this._safeEmitError(err); }
                finish(204, cors);
            });
            req.on("error", () => { /* kết nối đứt giữa chừng: bỏ qua */ });
        } catch (err) {
            this._safeEmitError(err);
            finish(500);
        }
    }

    /**
     * Nhận 1 bản tin từ tiện ích. Công khai để test; KHÔNG throw.
     * @returns {boolean} true nếu bản tin được chấp nhận làm trạng thái hiện tại
     */
    ingest(info) {
        try {
            if (!info || typeof info !== "object") return false;
            const id = typeof info.video_id === "string" ? info.video_id : "";
            if (!VIDEO_ID_RE.test(id)) return false;

            const now = this._now();
            const isAd = info.is_ad === true;
            const isPlaying = info.is_playing === true;
            let title = typeof info.title === "string" ? info.title.trim().slice(0, MAX_TITLE_LEN) : "";
            const positionSec = !isAd && isFiniteNumber(info.current_time) && info.current_time >= 0 ? info.current_time : null;
            let durationSec = !isAd && isFiniteNumber(info.duration) && info.duration > 0 && info.duration <= MAX_DURATION_SEC ? info.duration : null;

            const prev = this._snapshot;
            const prevFresh = !!prev && (now - this._lastSeenAt) <= OTHER_TAB_GUARD_MS;

            // Nhiều tab YouTube cùng gửi: tab đang phát là "thật". Tab khác chỉ báo tạm dừng thì bỏ qua, để khỏi làm nhấp nháy.
            if (prev && prevFresh && prev.isPlaying && !isPlaying && prev.videoId !== id) return false;

            // Đang chiếu quảng cáo: giữ tên bài + thời lượng của bài chính (nếu cùng video), vị trí = chưa biết.
            if (isAd && prev && prev.videoId === id) {
                if (!title) title = prev.title;
                if (durationSec === null) durationSec = prev.durationMs > 0 ? prev.durationMs / 1000 : null;
            }

            if (!title) return false;
            if (durationSec === null) {
                // Tiện ích bản cũ (không gửi duration): không dùng, để SMTC làm việc như trước (không mất đồng hồ bài).
                // Chỉ cảnh báo khi bản tin KHÔNG có hẳn trường "duration" (bản cũ). Tiện ích mới luôn gửi trường này (null khi video chưa nạp xong) nên im lặng.
                if (!isAd && !this._warnedNoDuration && !Object.prototype.hasOwnProperty.call(info, "duration")) {
                    this._warnedNoDuration = true;
                    console.log("[YoutubeExtension] Bản tin không có duration (tiện ích bản cũ?) — tạm bỏ qua, dùng nguồn khác. Hãy nạp lại tiện ích trong extensions/KHOI_YTB_Extension.");
                }
                return false;
            }

            const snapshot = {
                source: "youtube",
                videoId: id,
                url: "https://www.youtube.com/watch?v=" + id,
                title,
                artist: null,
                isPlaying,
                isAd,
                positionMs: positionSec === null ? null : Math.round(positionSec * 1000),
                durationMs: Math.round(durationSec * 1000),
                timestamp: now
            };

            this._snapshot = snapshot;
            this._lastSeenAt = now;

            const key = id + "|" + title + "|" + (isPlaying ? 1 : 0);
            if (key !== this._lastEmittedKey) {
                this._lastEmittedKey = key;
                try { this.emit("change", { ...snapshot }); } catch { /* listener lỗi không được lan ra */ }
            }
            return true;
        } catch (err) {
            this._safeEmitError(err);
            return false;
        }
    }

    _checkStale() {
        try {
            if (!this._snapshot) return;
            if (this._now() - this._lastSeenAt <= this._staleMs) return;
            this._snapshot = null;
            this._lastEmittedKey = null;
            this.emit("change", null);
        } catch (err) {
            this._safeEmitError(err);
        }
    }
}

module.exports = YoutubeExtensionSession;
module.exports.YoutubeExtensionSession = YoutubeExtensionSession;
module.exports.DEFAULT_PORT = DEFAULT_PORT;
