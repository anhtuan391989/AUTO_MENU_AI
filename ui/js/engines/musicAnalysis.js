/* ==========================================================
   musicAnalysis.js — TASK AI-ALG-01 (Giai đoạn B)
   Module phân tích nhạc ĐỘC LẬP (Key/Scale + BPM/Beat + RMS), chạy được cả trong Node
   (test offline) lẫn trình duyệt (window.MusicAnalysis). KHÔNG phụ thuộc DOM/AudioContext,
   KHÔNG mở thiết bị, KHÔNG đụng KeyEngine/BPMEngine/ModEngine hiện có.

   NGUỒN THUẬT TOÁN: viết theo tài liệu công khai — KHÔNG sao chép mã từ app_youtube.pyd
   (xem AI-ALG-01-REVERSE-REPORT.md: binary chỉ được kiểm metadata, không dịch ngược).
     - Hồ sơ Krumhansl–Kessler (1982) và Temperley (1999/2005) — giá trị công bố trong tài liệu.
     - Chroma: gộp đỉnh phổ (nội suy parabol) theo pitch-class, có ước lượng tuning.
     - Chấm điểm 24 ứng viên bằng tương quan Pearson, trung bình 2 bộ hồ sơ.
     - BPM: spectral-flux onset envelope -> autocorrelation -> comb -> kiểm chứng octave bằng
       độ mạnh lưới beat.

   HIỆU CHUẨN: confidence ở đây = hàm của margin + độ ổn định qua cửa sổ con. Đã đo độ chính xác
   theo từng mức confidence trên bộ test tổng hợp (tests/unit/MusicAnalysis.verify.js) nhưng CHƯA
   hiệu chuẩn trên nhạc thật — xem cờ `calibrated:false` trong kết quả.
   ========================================================== */
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.MusicAnalysis = factory();
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Hồ sơ công bố trong tài liệu (độ cao 12 nốt, index 0 = tonic).
    const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const TEMPERLEY_MAJ = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
    const TEMPERLEY_MIN = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

    const DEFAULTS = Object.freeze({
        keyFftSize: 4096,
        keyHop: 2048,
        silenceRms: 0.003,          // TẠM THỜI — dưới mức này coi là khoảng lặng
        minVoicedSeconds: 6,        // TẠM THỜI — ít hơn thì INSUFFICIENT
        maxEntropyNorm: 0.985,      // chroma gần phẳng => không có tính điệu (nhiễu)
        bassBonus: 0.0,             // quyết định theo dữ liệu đo (xem test) — mặc định 0
        minMarginOk: 0.05,          // TẠM THỜI — margin dưới mức này => AMBIGUOUS
        bpmMin: 55,
        bpmMax: 210,
        bpmFftSize: 1024,
        minBpmSeconds: 8,
        octaveSupportMin: 0.2,      // TẠM THỜI — ứng viên octave phải có tương quan >= 20% đỉnh (chọn theo đo trên bộ tổng hợp)
        tempoPrior: 120,            // TẠM THỜI — vùng tempo ưu tiên khi không phân biệt được octave
    });

    /* ---------------- FFT ---------------- */
    function fft(re, im) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len, wlr = Math.cos(ang), wli = Math.sin(ang), half = len >> 1;
            for (let i = 0; i < n; i += len) {
                let wr = 1, wi = 0;
                for (let k = 0; k < half; k++) {
                    const a = i + k, b = a + half;
                    const vr = re[b] * wr - im[b] * wi, vi = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - vr; im[b] = im[a] - vi;
                    re[a] += vr; im[a] += vi;
                    const nwr = wr * wlr - wi * wli; wi = wr * wli + wi * wlr; wr = nwr;
                }
            }
        }
    }

    const hannCache = {};
    function hann(n) {
        if (!hannCache[n]) {
            const w = new Float64Array(n);
            for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
            hannCache[n] = w;
        }
        return hannCache[n];
    }

    function rms(x, start, len) {
        let s = 0;
        for (let i = start; i < start + len; i++) s += x[i] * x[i];
        return Math.sqrt(s / len);
    }

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    function pearson(a, b) {
        let ma = 0, mb = 0;
        for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
        ma /= a.length; mb /= b.length;
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < a.length; i++) {
            const x = a[i] - ma, y = b[i] - mb;
            num += x * y; da += x * x; db += y * y;
        }
        const den = Math.sqrt(da * db);
        return den > 0 ? num / den : 0;
    }

    /* ---------------- CHROMA ---------------- */
    // Trả về danh sách đỉnh phổ [{f, m}] của 1 khung (đã nội suy parabol).
    function spectralPeaks(mags, sr, N, fMin, fMax) {
        const peaks = [];
        const kMin = Math.max(2, Math.floor((fMin * N) / sr)), kMax = Math.min(mags.length - 2, Math.ceil((fMax * N) / sr));
        let frameMax = 0;
        for (let k = kMin; k <= kMax; k++) if (mags[k] > frameMax) frameMax = mags[k];
        if (frameMax <= 0) return peaks;
        const thr = frameMax * 0.02;
        for (let k = kMin; k <= kMax; k++) {
            const b = mags[k];
            if (b > thr && b > mags[k - 1] && b >= mags[k + 1]) {
                const la = Math.log(mags[k - 1] + 1e-12), lb = Math.log(b + 1e-12), lc = Math.log(mags[k + 1] + 1e-12);
                const den = la - 2 * lb + lc;
                const delta = den !== 0 ? (0.5 * (la - lc)) / den : 0;
                peaks.push({ f: ((k + Math.max(-0.5, Math.min(0.5, delta))) * sr) / N, m: b });
            }
        }
        return peaks;
    }

    // Phân tích chroma cho PCM (Float32/Float64, mono). Trả {chroma, bass, voicedSeconds, totalSeconds,
    // frameChromas (mỗi khung đã chuẩn hoá), frameTimes, tuning (semitone), rmsMean}.
    function analyzeChroma(x, sr, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const N = o.keyFftSize, hop = o.keyHop, w = hann(N);
        const re = new Float64Array(N), im = new Float64Array(N);
        const frames = [];
        for (let s = 0; s + N <= x.length; s += hop) {
            const r = rms(x, s, N);
            const t = s / sr;
            if (r < o.silenceRms) { frames.push({ t, voiced: false, rms: r }); continue; }
            for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
            fft(re, im);
            const mags = new Float64Array(N / 2);
            for (let k = 0; k < N / 2; k++) mags[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
            frames.push({ t, voiced: true, rms: r, peaks: spectralPeaks(mags, sr, N, 50, 4000) });
        }

        // Tuning: trung bình vòng của độ lệch (semitone) so với lưới 440 Hz, có trọng số biên độ.
        let cs = 0, sn = 0;
        for (const fr of frames) if (fr.voiced) for (const p of fr.peaks) {
            const dev = 12 * Math.log2(p.f / 440) - Math.round(12 * Math.log2(p.f / 440));
            const wgt = Math.sqrt(p.m);
            cs += wgt * Math.cos(2 * Math.PI * dev); sn += wgt * Math.sin(2 * Math.PI * dev);
        }
        const tuning = Math.atan2(sn, cs) / (2 * Math.PI); // [-0.5, 0.5)

        const chroma = new Float64Array(12), bass = new Float64Array(12);
        const frameChromas = [], frameTimes = [], frameBass = [];
        let voiced = 0, rmsSum = 0;
        for (const fr of frames) {
            if (!fr.voiced) continue;
            voiced++; rmsSum += fr.rms;
            const c = new Float64Array(12), b = new Float64Array(12);
            for (const p of fr.peaks) {
                const midi = 69 + 12 * Math.log2(p.f / 440) - tuning;
                const pc = ((Math.round(midi) % 12) + 12) % 12;
                const wgt = Math.sqrt(p.m);
                c[pc] += wgt;
                if (p.f <= 260) b[pc] += wgt;
            }
            let sc = 0, sb = 0;
            for (let i = 0; i < 12; i++) { sc += c[i]; sb += b[i]; }
            if (sc <= 0) continue;
            for (let i = 0; i < 12; i++) { c[i] /= sc; chroma[i] += c[i]; if (sb > 0) { b[i] /= sb; bass[i] += b[i]; } }
            frameChromas.push(c); frameBass.push(b); frameTimes.push(fr.t);
        }
        return {
            chroma: Array.from(chroma), bass: Array.from(bass), tuning,
            voicedSeconds: (voiced * hop) / sr, totalSeconds: x.length / sr,
            rmsMean: voiced ? rmsSum / voiced : 0,
            frameChromas, frameBass, frameTimes,
        };
    }

    function entropyNorm(v) {
        let s = 0; for (const a of v) s += a;
        if (s <= 0) return 1;
        let h = 0;
        for (const a of v) { const p = a / s; if (p > 0) h -= p * Math.log(p); }
        return h / Math.log(v.length);
    }

    /* ---------------- KEY ---------------- */
    // Chấm 24 ứng viên cho 1 vector chroma (+ bass tuỳ chọn). Trả mảng đã sắp giảm dần.
    function scoreKeys(chroma, bass, bassBonus) {
        const out = [];
        let bassMax = 0;
        if (bass) for (const a of bass) if (a > bassMax) bassMax = a;
        for (let r = 0; r < 12; r++) {
            for (const mode of ["major", "minor"]) {
                const kk = mode === "major" ? KK_MAJOR : KK_MINOR;
                const tp = mode === "major" ? TEMPERLEY_MAJ : TEMPERLEY_MIN;
                const pk = new Array(12), pt = new Array(12);
                for (let i = 0; i < 12; i++) { pk[i] = kk[(i - r + 12) % 12]; pt[i] = tp[(i - r + 12) % 12]; }
                let score = 0.5 * (pearson(chroma, pk) + pearson(chroma, pt));
                if (bassBonus && bassMax > 0) score += bassBonus * (bass[r] / bassMax);
                out.push({ root: r, mode, name: `${NOTE_NAMES[r]} ${mode === "major" ? "Major" : "Minor"}`, score });
            }
        }
        out.sort((a, b) => b.score - a.score);
        return out;
    }

    function relativeOf(c) {
        return c.mode === "major" ? { root: (c.root + 9) % 12, mode: "minor" } : { root: (c.root + 3) % 12, mode: "major" };
    }

    // Phát hiện Key cho PCM. status: OK | AMBIGUOUS | INSUFFICIENT
    function detectKey(x, sr, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const ch = analyzeChroma(x, sr, o);
        const base = { calibrated: false, voicedSeconds: ch.voicedSeconds, totalSeconds: ch.totalSeconds, rmsMean: ch.rmsMean, tuning: ch.tuning };
        if (ch.voicedSeconds < o.minVoicedSeconds) {
            return Object.assign({ status: "INSUFFICIENT", reason: "VOICED_TOO_SHORT", key: null, mode: null, confidence: 0, candidates: [] }, base);
        }
        const ent = entropyNorm(ch.chroma);
        if (ent > o.maxEntropyNorm) {
            return Object.assign({ status: "INSUFFICIENT", reason: "NOT_TONAL", key: null, mode: null, confidence: 0, entropy: ent, candidates: [] }, base);
        }
        const ranked = scoreKeys(ch.chroma, ch.bass, o.bassBonus);
        const top = ranked[0], second = ranked[1];
        const margin = top.score - second.score;

        // Độ ổn định: chia thành 4 cửa sổ con, đếm số cửa sổ cho cùng đáp án với toàn bài.
        const nW = 4, per = Math.floor(ch.frameChromas.length / nW);
        let agree = 0, counted = 0;
        if (per >= 4) {
            for (let k = 0; k < nW; k++) {
                const c = new Array(12).fill(0), b = new Array(12).fill(0);
                for (let f = k * per; f < (k + 1) * per; f++) for (let i = 0; i < 12; i++) { c[i] += ch.frameChromas[f][i]; b[i] += ch.frameBass[f][i]; }
                const t = scoreKeys(c, b, o.bassBonus)[0];
                counted++;
                if (t.root === top.root && t.mode === top.mode) agree++;
            }
        }
        const stability = counted ? agree / counted : 0;
        const confidence = clamp01(0.6 * clamp01(margin / 0.15) + 0.4 * stability);

        const rel = relativeOf(top);
        const relScore = (ranked.find((c) => c.root === rel.root && c.mode === rel.mode) || {}).score;
        const secondIsRelative = second.root === rel.root && second.mode === rel.mode;
        const candidates = ranked.slice(0, 3).map((c) => ({ name: c.name, root: c.root, mode: c.mode, score: c.score }));

        let status = "OK";
        let reason = null;
        if (margin < o.minMarginOk) { status = "AMBIGUOUS"; reason = secondIsRelative ? "RELATIVE_KEY_CLOSE" : "SCORES_CLOSE"; }
        return Object.assign({
            status, reason,
            key: NOTE_NAMES[top.root], root: top.root, mode: top.mode, name: top.name,
            confidence, margin, stability, relative: { name: `${NOTE_NAMES[rel.root]} ${rel.mode === "major" ? "Major" : "Minor"}`, score: relScore },
            entropy: ent, candidates,
        }, base);
    }

    /* ---------------- BPM / BEAT ---------------- */
    function onsetEnvelope(x, sr, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const N = o.bpmFftSize, hop = Math.max(1, Math.round(sr / 100)), w = hann(N);
        const re = new Float64Array(N), im = new Float64Array(N);
        const kMax = Math.min(N / 2, Math.floor((8000 * N) / sr));
        let prev = new Float64Array(kMax), cur = new Float64Array(kMax);
        const flux = [];
        let first = true;
        for (let s = 0; s + N <= x.length; s += hop) {
            for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
            fft(re, im);
            let f = 0;
            for (let k = 1; k < kMax; k++) {
                cur[k] = Math.log1p(100 * Math.sqrt(re[k] * re[k] + im[k] * im[k]) * (2 / N));
                const d = cur[k] - prev[k];
                if (d > 0) f += d;
            }
            flux.push(first ? 0 : f / kMax);
            first = false;
            const t = prev; prev = cur; cur = t;
        }
        // Bỏ trung bình cục bộ (~1 s) rồi cắt nửa sóng.
        const fps = sr / hop, win = Math.max(3, Math.round(fps));
        const env = new Float64Array(flux.length);
        let acc = 0;
        for (let i = 0; i < flux.length; i++) {
            acc += flux[i];
            if (i >= win) acc -= flux[i - win];
            const mean = acc / Math.min(i + 1, win);
            env[i] = Math.max(0, flux[i] - mean);
        }
        return { env, fps };
    }

    function acfOf(env, maxLag) {
        const n = env.length, a = new Float64Array(maxLag + 1);
        let m = 0; for (let i = 0; i < n; i++) m += env[i]; m /= n;
        for (let lag = 0; lag <= maxLag; lag++) {
            let s = 0;
            for (let i = 0; i + lag < n; i++) s += (env[i] - m) * (env[i + lag] - m);
            a[lag] = s / (n - lag);
        }
        const a0 = a[0] || 1;
        for (let i = 0; i <= maxLag; i++) a[i] /= a0;
        return a;
    }

    function interp(a, x) {
        if (x < 0 || x >= a.length - 1) return 0;
        const i = Math.floor(x), f = x - i;
        return a[i] * (1 - f) + a[i + 1] * f;
    }

    // Độ mạnh lưới beat cho tempo b: trung bình env tại điểm lưới (pha tốt nhất) / trung bình env toàn bộ.
    function gridStrength(env, fps, bpm) {
        const P = (60 * fps) / bpm;
        let best = -1, bestPhase = 0, mean = 0;
        for (let i = 0; i < env.length; i++) mean += env[i];
        mean /= env.length || 1;
        const steps = Math.max(8, Math.round(P));
        for (let ph = 0; ph < steps; ph++) {
            const phase = (ph / steps) * P;
            let s = 0, c = 0;
            for (let t = phase; t < env.length - 1; t += P) {
                const i = Math.round(t);
                s += Math.max(env[i], env[Math.min(env.length - 1, i + 1)], env[Math.max(0, i - 1)]); c++; // dung sai ±1 khung
            }
            const v = c ? s / c : 0;
            if (v > best) { best = v; bestPhase = phase; }
        }
        return { strength: mean > 0 ? best / mean : 0, phaseFrames: bestPhase };
    }

    function detectBpm(x, sr, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const seconds = x.length / sr;
        const base = { calibrated: false, totalSeconds: seconds };
        if (seconds < o.minBpmSeconds) return Object.assign({ status: "INSUFFICIENT", reason: "TOO_SHORT", bpm: null, confidence: 0, beats: [] }, base);
        const level = rms(x, 0, x.length);
        if (level < o.silenceRms) return Object.assign({ status: "INSUFFICIENT", reason: "SILENT", bpm: null, confidence: 0, beats: [], rms: level }, base);

        const { env, fps } = onsetEnvelope(x, sr, o);
        const maxLag = Math.ceil((60 * fps) / (o.bpmMin * 0.5)) + 2; // đủ để xét 2L của tempo thấp nhất
        const acf = acfOf(env, Math.min(maxLag * 2, env.length - 2));

        const scores = [];
        let best = { bpm: 0, score: -Infinity };
        for (let b = o.bpmMin; b <= o.bpmMax; b += 0.25) {
            const L = (60 * fps) / b;
            const s = interp(acf, L) + 0.5 * interp(acf, 2 * L) + 0.25 * interp(acf, 3 * L);
            const prior = Math.exp(-0.5 * Math.pow(Math.log2(b / 120) / 1.5, 2)); // ưu tiên rất nhẹ quanh 120
            const sc = s * (0.7 + 0.3 * prior);
            scores.push([b, sc]);
            if (sc > best.score) best = { bpm: b, score: sc };
        }
        // Làm mịn: lấy trọng tâm trong ±1.5 BPM quanh đỉnh.
        let num = 0, den = 0;
        for (const [b, sc] of scores) if (Math.abs(b - best.bpm) <= 1.5 && sc > 0) { num += b * sc; den += sc; }
        let bpm = den > 0 ? num / den : best.bpm;

        // Octave (gấp đôi/một nửa): đo bằng dữ liệu cho thấy cấu trúc onset KHÔNG đủ để phân biệt
        // T với 2T (tỉ lệ năng lượng onset bắt được trên lưới giống nhau ở mọi octave — xem test
        // "octave" trong MusicAnalysis.verify.js). Vì vậy: (1) chỉ xét ứng viên có tương quan thật
        // (support >= octaveSupportMin so với đỉnh), (2) chọn ứng viên gần vùng nhạc thường gặp
        // (~120 BPM, độ rộng 0.7 octave), (3) LUÔN báo các ứng viên còn lại + cờ octaveAmbiguous.
        const lagSupport = (b2) => interp(acf, (60 * fps) / b2);
        const peakSupport = Math.max(lagSupport(bpm), 1e-9);
        const cand = [{ bpm, support: 1 }];
        for (const m of [2, 0.5]) {
            const c = bpm * m;
            if (c < o.bpmMin || c > o.bpmMax) continue;
            cand.push({ bpm: c, support: lagSupport(c) / peakSupport });
        }
        const usable = cand.filter((c) => c.support >= o.octaveSupportMin);
        let chosen = usable[0] || cand[0], octaveNote = null;
        const prior = (b2) => Math.exp(-0.5 * Math.pow(Math.log2(b2 / o.tempoPrior) / 0.7, 2));
        for (const c of usable) if (prior(c.bpm) * (0.8 + 0.2 * Math.min(1, c.support)) > prior(chosen.bpm) * (0.8 + 0.2 * Math.min(1, chosen.support))) chosen = c;
        if (chosen.bpm !== bpm) octaveNote = chosen.bpm > bpm ? "DOUBLED" : "HALVED";
        const octaveAmbiguous = usable.length > 1;
        const grid = gridStrength(env, fps, chosen.bpm);
        bpm = chosen.bpm;

        // Độ ổn định: tempo nửa đầu vs nửa sau của bài.
        let stab = 0;
        if (env.length > fps * 2 * o.minBpmSeconds / 2) {
            const half = Math.floor(env.length / 2);
            const t1 = tempoOfEnv(env.subarray(0, half), fps, o), t2 = tempoOfEnv(env.subarray(half), fps, o);
            const r = t1 / t2;
            const same = Math.abs(r - 1) < 0.03 || Math.abs(r - 2) < 0.06 || Math.abs(r - 0.5) < 0.03;
            stab = same ? 1 : 0;
        }
        let med = 0; { const arr = scores.map((s) => s[1]).sort((a, b) => a - b); med = arr[Math.floor(arr.length / 2)]; }
        const prominence = best.score > 0 ? clamp01((best.score - med) / (best.score + 1e-9)) : 0;
        const confidence = clamp01(0.5 * prominence + 0.5 * stab);

        // Beat times
        const P = (60 * fps) / bpm, beats = [];
        const lead = o.bpmFftSize / 2 / sr; // khung FFT bắt đầu sớm hơn onset ~ nửa cửa sổ
        for (let t = grid.phaseFrames; t < env.length; t += P) beats.push(t / fps + lead);

        const status = confidence < 0.35 ? "AMBIGUOUS" : "OK";
        return Object.assign({
            status, reason: status === "AMBIGUOUS" ? "LOW_CONFIDENCE" : null,
            bpm, bpmRaw: cand[0].bpm, confidence, prominence, stability: stab,
            gridStrength: grid.strength, octave: octaveNote, octaveAmbiguous,
            octaveCandidates: cand.map((c) => ({ bpm: c.bpm, support: c.support })),
            beats,
        }, base);
    }

    function tempoOfEnv(env, fps, o) {
        const acf = acfOf(env, Math.min(Math.ceil((60 * fps) / (o.bpmMin * 0.5)) * 2 + 4, env.length - 2));
        let best = 0, bb = 0;
        for (let b = o.bpmMin; b <= o.bpmMax; b += 0.5) {
            const L = (60 * fps) / b;
            const s = interp(acf, L) + 0.5 * interp(acf, 2 * L) + 0.25 * interp(acf, 3 * L);
            if (s > best) { best = s; bb = b; }
        }
        return bb || 1;
    }

    /* ---------------- PHÂN TÍCH LUỒNG (cho tích hợp) ---------------- */
    // Bộ đệm vòng giữ tối đa `maxSeconds` PCM; analyze() chạy trên phần đang có.
    function createStreamingAnalyzer(sampleRate, options) {
        const o = Object.assign({ maxSeconds: 45 }, options || {});
        const cap = Math.floor(sampleRate * o.maxSeconds);
        const buf = new Float32Array(cap);
        let len = 0;
        return {
            push(samples) {
                const n = samples.length;
                if (n >= cap) { buf.set(samples.subarray(n - cap)); len = cap; return; }
                if (len + n > cap) { buf.copyWithin(0, len + n - cap, len); len = cap - n; }
                buf.set(samples, len); len += n;
            },
            reset() { len = 0; },
            seconds() { return len / sampleRate; },
            analyze() {
                const x = buf.subarray(0, len);
                return { seconds: len / sampleRate, key: detectKey(x, sampleRate, o), bpm: detectBpm(x, sampleRate, o) };
            },
        };
    }

    // Phân tích tiến triển: kết quả theo từng mốc thời gian + thời gian hội tụ.
    function analyzeProgressive(x, sr, opts) {
        const o = Object.assign({ stepSeconds: 4, startSeconds: 8 }, opts || {});
        const series = [];
        for (let t = o.startSeconds; t <= x.length / sr + 1e-9; t += o.stepSeconds) {
            const seg = x.subarray(0, Math.floor(t * sr));
            const k = detectKey(seg, sr, o), b = detectBpm(seg, sr, o);
            series.push({ t, key: k.status === "OK" ? k.name : null, keyStatus: k.status, bpm: b.bpm, bpmStatus: b.status });
        }
        const last = series[series.length - 1] || {};
        let keyConv = null, bpmConv = null;
        for (let i = series.length - 1; i >= 0; i--) { if (series[i].key === last.key && last.key) keyConv = series[i].t; else break; }
        for (let i = series.length - 1; i >= 0; i--) { if (series[i].bpm && last.bpm && Math.abs(series[i].bpm - last.bpm) / last.bpm < 0.02) bpmConv = series[i].t; else break; }
        return { series, keyConvergedAtSeconds: keyConv, bpmConvergedAtSeconds: bpmConv };
    }

    return {
        NOTE_NAMES, DEFAULTS, KK_MAJOR, KK_MINOR, TEMPERLEY_MAJ, TEMPERLEY_MIN,
        fft, analyzeChroma, scoreKeys, detectKey, onsetEnvelope, detectBpm,
        createStreamingAnalyzer, analyzeProgressive, relativeOf,
    };
});
