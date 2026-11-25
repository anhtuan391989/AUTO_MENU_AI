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
 *
 * RA-SOAT-BAO-MAT (theo yêu cầu của Khói): mỗi khi bắt đầu file mới, tự xoá bớt
 * các file .jsonl CŨ NHẤT nếu tổng dung lượng thư mục logs/ vượt quá
 * LOGS_TOTAL_CAP_BYTES — để thư mục logs/ (và repo GitHub đi kèm, vì logs/ vẫn
 * được đồng bộ như cũ) không phình to vô hạn, nhưng vẫn luôn giữ lại dữ liệu
 * MỚI NHẤT để xem/theo dõi khi cần.
 * ==========================================================
 */

const LOGS_DIR = require("./RuntimePaths").writableDir("logs"); // chạy từ mã nguồn: <project root>/logs (như cũ); bản cài .exe: %APPDATA%\automenu-ai\logs
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const LOGS_TOTAL_CAP_BYTES = 20 * 1024 * 1024; // 20MB — tổng dung lượng logs/ tối đa muốn giữ lại

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

        this._pruneOldestIfOverCap();

    }

    // RA-SOAT-BAO-MAT: xoá bớt file .jsonl CŨ NHẤT (theo thời gian sửa đổi) cho tới khi tổng dung
    // lượng thư mục logs/ không vượt quá LOGS_TOTAL_CAP_BYTES. Không bao giờ đụng tới file đang ghi
    // dở (currentFilePath) vì nó luôn là file mới nhất, không bao giờ bị coi là "cũ nhất".
    _pruneOldestIfOverCap() {

        try {

            const files = fs.readdirSync(LOGS_DIR)
                .filter((f) => f.endsWith(".jsonl"))
                .map((f) => {
                    const full = path.join(LOGS_DIR, f);
                    const st = fs.statSync(full);
                    return { full, size: st.size, mtimeMs: st.mtimeMs };
                })
                .sort((a, b) => a.mtimeMs - b.mtimeMs); // cũ nhất trước

            let total = files.reduce((sum, f) => sum + f.size, 0);

            for (const f of files) {

                if (total <= LOGS_TOTAL_CAP_BYTES) break;
                if (f.full === this.currentFilePath) continue; // không xoá file đang ghi dở

                fs.unlinkSync(f.full);
                total -= f.size;

            }

        } catch (e) {
            // Dọn dẹp thất bại không được làm gián đoạn việc ghi log — bỏ qua.
        }

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
