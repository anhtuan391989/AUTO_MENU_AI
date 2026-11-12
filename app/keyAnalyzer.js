// ==================================================
// AUTO_MENU_AI — KEY-ANALYZE-01
// Đường dẫn: app/keyAnalyzer.js
// Phân tích Key CẢ BÀI bằng core/key_detector.py (Chroma CQT + Krumhansl, Python/librosa) ở nền.
// Chạy ở main process. Không đụng keyEngine.js, không đụng giao diện.
// Nguyên tắc:
//  - Không bao giờ throw: luôn trả { ok, reason, ... }.
//  - Mỗi lần chỉ chạy 1 phân tích; bài đang chờ được gộp theo khoá (không chạy trùng).
//  - Có timeout; hết giờ thì giết tiến trình Python.
//  - Kết quả độ tin cậy thấp (is_reliable=false) vẫn trả về nhưng đánh dấu reliable=false để nơi gọi quyết định.
// ==================================================
"use strict";

const path = require("path");
const os = require("os");
const fs = require("fs");
const childProcess = require("child_process");

const NOTE_OK = { "C": 1, "C#": 1, "D": 1, "D#": 1, "E": 1, "F": 1, "F#": 1, "G": 1, "G#": 1, "A": 1, "A#": 1, "B": 1 };
const DEFAULT_TIMEOUT_MS = 180000;
// Thứ tự thử tìm Python trên Windows/Mac/Linux: [lệnh, tham số đứng trước]
const PYTHON_CANDIDATES = [["py", ["-3"]], ["python", []], ["python3", []]];

// "A" + "minor" -> "A Minor"; sai định dạng -> null
function toKeyLabel(root, scale) {
    if (typeof root !== "string" || !NOTE_OK[root]) return null;
    const s = String(scale || "").toLowerCase();
    if (s !== "major" && s !== "minor") return null;
    return root + " " + (s === "minor" ? "Minor" : "Major");
}

// Lấy JSON ra khỏi stdout (bỏ qua dòng cảnh báo librosa nếu có)
function parseResultJson(stdout) {
    const text = String(stdout || "");
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
}

function createKeyAnalyzer(deps) {
    const d = deps || {};
    const spawnFn = d.spawn || childProcess.spawn;
    const fsx = d.fs || fs;
    const log = d.logger || { log() {}, error() {} };
    const scriptPath = d.scriptPath || path.join(__dirname, "..", "core", "key_detector.py");
    const timeoutMs = Number.isFinite(d.timeoutMs) ? d.timeoutMs : DEFAULT_TIMEOUT_MS;
    const tmpDir = d.tmpDir || os.tmpdir();

    let pythonCmd = null;     // { cmd, pre } đã chạy được
    let queue = Promise.resolve();
    const pending = new Map(); // khoá -> Promise (gộp yêu cầu trùng)

    // Chạy 1 tiến trình, trả { code, stdout, stderr, timedOut, spawnError }
    function run(cmd, args) {
        return new Promise((resolve) => {
            let out = "", err = "", done = false, timedOut = false, timer = null, child;
            const finish = (r) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(Object.assign({ stdout: out, stderr: err, timedOut }, r)); };
            try { child = spawnFn(cmd, args, { windowsHide: true }); } catch (e) { return finish({ code: -1, spawnError: String((e && e.message) || e) }); }
            if (child.stdout) child.stdout.on("data", (b) => { out += b.toString("utf8"); });
            if (child.stderr) child.stderr.on("data", (b) => { err += b.toString("utf8"); });
            child.on("error", (e) => finish({ code: -1, spawnError: String((e && e.message) || e) }));
            child.on("close", (code) => finish({ code }));
            timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch (e) {} finish({ code: -1 }); }, timeoutMs);
        });
    }

    // Tìm lệnh Python chạy được (có import librosa). Nhớ kết quả thành công.
    async function findPython() {
        if (pythonCmd) return pythonCmd;
        for (const [cmd, pre] of PYTHON_CANDIDATES) {
            const r = await run(cmd, pre.concat(["--version"]));
            if (r.spawnError || r.code !== 0) continue;
            pythonCmd = { cmd, pre };
            return pythonCmd;
        }
        return null;
    }

    // Kiểm tra môi trường: Python + librosa. (ffmpeg chỉ cần cho mp3: báo riêng.)
    async function status() {
        const py = await findPython();
        if (!py) return { ok: false, reason: "no-python" };
        const r = await run(py.cmd, py.pre.concat(["-c", "import librosa, numpy, soundfile"]));
        if (r.code !== 0) return { ok: false, reason: "no-librosa", detail: String(r.stderr || "").slice(-300) };
        const f = await run("ffmpeg", ["-version"]);
        return { ok: true, python: py.cmd, ffmpeg: !f.spawnError && f.code === 0 };
    }

    async function analyzeNow(filePath) {
        const py = await findPython();
        if (!py) return { ok: false, reason: "no-python" };
        const r = await run(py.cmd, py.pre.concat([scriptPath, filePath, "--json"]));
        if (r.timedOut) return { ok: false, reason: "timeout" };
        if (r.spawnError) return { ok: false, reason: "spawn-error", detail: r.spawnError };
        if (r.code !== 0) {
            const missing = /No module named/i.test(r.stderr) ? "no-librosa" : "analyze-failed";
            return { ok: false, reason: missing, detail: String(r.stderr || "").slice(-300) };
        }
        const j = parseResultJson(r.stdout);
        if (!j) return { ok: false, reason: "bad-output" };
        const key = toKeyLabel(j.key, j.scale);
        if (!key) return { ok: false, reason: "bad-key" };
        const conf = Number(j.confidence);
        return { ok: true, key, confidence: Number.isFinite(conf) ? conf : 0, reliable: j.is_reliable === true, durationSec: Number(j.duration_sec) || null };
    }

    // Phân tích 1 file. Mọi lời gọi xếp hàng nối đuôi; cùng filePath đang chờ thì dùng chung kết quả.
    function analyzeFile(filePath) {
        try {
            if (typeof filePath !== "string" || !filePath.trim()) return Promise.resolve({ ok: false, reason: "no-file" });
            if (!fsx.existsSync(filePath)) return Promise.resolve({ ok: false, reason: "file-missing" });
            if (pending.has(filePath)) return pending.get(filePath);
            const p = queue.then(() => analyzeNow(filePath)).catch((e) => ({ ok: false, reason: "error", detail: String((e && e.message) || e) }));
            queue = p.then(() => {}, () => {});
            pending.set(filePath, p);
            p.then(() => pending.delete(filePath), () => pending.delete(filePath));
            return p;
        } catch (e) { return Promise.resolve({ ok: false, reason: "error" }); }
    }

    // Phân tích bản ghi âm (WAV 16-bit do renderer ghi từ SYSTEM_AUDIO): ghi file tạm -> phân tích -> xoá file tạm.
    async function analyzeRecording(buffer) {
        let tmp = null;
        try {
            const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
            if (buf.length < 44 + 44100 * 2 * 10) return { ok: false, reason: "too-short" }; // < ~10 giây mono 44.1k 16-bit
            tmp = path.join(tmpDir, "automenu-key-" + Date.now() + "-" + Math.floor(Math.random() * 1e6) + ".wav");
            fsx.writeFileSync(tmp, buf);
            return await analyzeFile(tmp);
        } catch (e) {
            return { ok: false, reason: "error", detail: String((e && e.message) || e) };
        } finally {
            try { if (tmp && fsx.existsSync(tmp)) fsx.unlinkSync(tmp); } catch (e) {}
        }
    }

    return { analyzeFile, analyzeRecording, status };
}

module.exports = { createKeyAnalyzer, toKeyLabel, parseResultJson };
