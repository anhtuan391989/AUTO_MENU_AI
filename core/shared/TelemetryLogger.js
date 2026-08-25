const fs = require("fs");
const path = require("path");

/**
 * ==========================================================
 * Auto Menu AI
 * TelemetryLogger
 * ----------------------------------------------------------
 * Ghi các bản ghi telemetry (JSON Lines) do Key/BPM/Mod Engine hoặc
 * bất kỳ engine nào khác gửi lên qua IPC, vào thư mục `logs/` ở gốc
 * project. CHỈ ghi dữ liệu — không xử lý, không diễn giải, không
 * quyết định gì.
 *
 * Mỗi phiên (kể từ lần đầu write() được gọi) tạo 1 file mới, đặt tên
 * theo thời điểm tạo (vd 2026-07-18_20-31-08.jsonl). Nếu file vượt
 * 10MB, tự động bắt đầu file mới (rotation).
 * ==========================================================
 */

const LOGS_DIR = path.resolve(__dirname, "..", "..", "logs"); // core/shared/../../logs = <project root>/logs
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

class TelemetryLogger {

    constructor() {

        this.currentFilePath = null;

        this.currentFileBytes = 0;

    }

    _ensureLogsDir() {

        if (!fs.existsSync(LOGS_DIR)) {

            fs.mkdirSync(LOGS_DIR, { recursive: true });

        }

    }

    _timestampFileName() {

        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");

        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.jsonl`;

    }

    _startNewFile() {

        this._ensureLogsDir();

        let fileName = this._timestampFileName();
        let fullPath = path.join(LOGS_DIR, fileName);

        // Phòng trường hợp rotation xảy ra 2 lần trong cùng 1 giây (trùng tên) — thêm hậu tố.
        let suffix = 1;
        while (fs.existsSync(fullPath)) {

            fullPath = path.join(LOGS_DIR, fileName.replace(".jsonl", `_${suffix}.jsonl`));
            suffix++;

        }

        this.currentFilePath = fullPath;
        this.currentFileBytes = 0;

    }

    write(record) {

        if (!this.currentFilePath) {

            this._startNewFile();

        }

        const line = JSON.stringify(record) + "\n";
        const lineBytes = Buffer.byteLength(line, "utf-8");

        if (this.currentFileBytes + lineBytes > MAX_FILE_BYTES) {

            this._startNewFile(); // rotation — bắt đầu file mới

        }

        fs.appendFileSync(this.currentFilePath, line, "utf-8");
        this.currentFileBytes += lineBytes;

    }

    getCurrentFilePath() {

        return this.currentFilePath;

    }

}

module.exports = new TelemetryLogger();
