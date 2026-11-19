/* audioCalibration.js — TASK A-AUDIO-01
   Hàm THUẦN (không đụng Web Audio/DOM) để đo độ trễ vòng (round-trip) bằng tương quan chéo với một tiếng "chirp" đã biết.
   Dùng được cả trong trình duyệt (window.AudioCalibration) lẫn Node (module.exports) để test không cần phần cứng. */
(function (root) {
    // Chirp quét 1 kHz -> 8 kHz, cửa sổ Hann: có đỉnh tương quan nhọn nên tìm vị trí chính xác tới ~1 mẫu, chịu được nhiễu.
    function makeChirp(sampleRate, ms, f0, f1) {
        const n = Math.max(16, Math.round(sampleRate * (ms || 40) / 1000));
        const a = f0 || 1000, b = f1 || 8000, T = n / sampleRate;
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const t = i / sampleRate;
            const phase = 2 * Math.PI * (a * t + (b - a) * t * t / (2 * T));
            out[i] = Math.sin(phase) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
        }
        return out;
    }

    // Tìm vị trí (mẫu) khớp nhất của `burst` trong `rec` trong khoảng [from, to). Trả null nếu không đủ tin cậy.
    // score = tương quan chuẩn hoá (0..1); minScore mặc định 0.35 để loại nhiễu thuần.
    function findBurst(rec, burst, from, to, minScore) {
        const M = burst.length;
        const start = Math.max(0, from | 0), end = Math.min(rec.length - M, to | 0);
        if (end <= start) return null;
        let eb = 0; for (let i = 0; i < M; i++) eb += burst[i] * burst[i];
        if (eb === 0) return null;
        let best = -1, bestPos = -1, winE = 0;
        for (let i = 0; i < M; i++) winE += rec[start + i] * rec[start + i];
        for (let p = start; p <= end; p++) {
            if (p > start) { const o = rec[p - 1], n = rec[p + M - 1]; winE += n * n - o * o; }
            let dot = 0; for (let i = 0; i < M; i++) dot += rec[p + i] * burst[i];
            const denom = Math.sqrt(Math.max(winE, 1e-20) * eb);
            const sc = dot / denom;
            if (sc > best) { best = sc; bestPos = p; }
        }
        if (best < (minScore == null ? 0.35 : minScore)) return { pos: null, score: best };
        return { pos: bestPos, score: best };
    }

    function median(a) { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; }

    // rec: mẫu thu được (mono); sampleRate; burst; scheduledSec: thời điểm (giây, tính từ mẫu 0 của rec) mỗi burst được PHÁT.
    // Trả { ok, latencyMs (median), perBurstMs[], found, total, scores[] }.
    function measureRoundTrip(rec, sampleRate, burst, scheduledSec, searchSec) {
        const win = searchSec || 0.6;
        const per = [], scores = [];
        for (const t of scheduledSec) {
            const r = findBurst(rec, burst, Math.floor((t - 0.02) * sampleRate), Math.floor((t + win) * sampleRate));
            if (r && r.pos != null) { per.push((r.pos / sampleRate - t) * 1000); scores.push(r.score); }
        }
        return { ok: per.length >= Math.ceil(scheduledSec.length / 2), latencyMs: median(per), perBurstMs: per, found: per.length, total: scheduledSec.length, scores };
    }

    // Độ trễ do hệ thống báo (không cần loopback): baseLatency + outputLatency (giây) -> ms.
    function reportedLatencyMs(ctx) {
        if (!ctx) return null;
        const b = Number(ctx.baseLatency) || 0, o = Number(ctx.outputLatency) || 0;
        return (b + o) > 0 ? (b + o) * 1000 : null;
    }

    const api = { makeChirp, findBurst, measureRoundTrip, reportedLatencyMs, median };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.AudioCalibration = api;
})(typeof window !== "undefined" ? window : globalThis);
