/* ==========================================================
   AUTOKEY LIVE ENGINE — chế độ "Auto Key tạm thời" (task AUTOKEY-TEMP-01)
   ----------------------------------------------------------
   BÊ NGUYÊN thuật toán dò Key của phần mềm "AutoKey Live Studio" (Python/NumPy) sang JavaScript.
   Mọi hằng số và công thức dưới đây lấy trực tiếp từ mã gốc, KHÔNG chỉnh:
     - Cắt âm thanh thành đoạn 1.5 giây (đọc từng khối 50 ms; khối có RMS < 0.001 bị BỎ QUA, không xoá bộ đệm).
     - Mỗi đoạn: nếu RMS < 0.001 thì bỏ. Ngược lại FFT 8192 điểm, bước 2048, cửa sổ Hanning (np.hanning), dải 32–2000 Hz,
       gom NĂNG LƯỢNG (|X|^2) vào 12 nốt (round(69 + 12·log2(f/440)) mod 12); riêng dải <= 135 Hz gom thêm vào "bass".
     - CỘNG DỒN các đoạn (không bao giờ quên, chỉ reset khi đổi bài / bind lại nguồn).
     - Chấm điểm: chuẩn hoá theo max, bỏ nốt < 0.15, luỹ thừa 1.35, chuẩn hoá lại; hồ sơ = 0.65·full + 0.35·bass;
       Pearson với 24 mẫu (12 Trưởng + 12 Thứ) + thưởng triad bass: 0.08·bass[i] + 0.04·bass[i+5] + 0.04·bass[i+7].
     - Tin cậy = clip(0.52 + 0.36·điểm_tốt_nhất + 0.85·(điểm_tốt_nhất − điểm_hạng_2), 0.50, 0.99).
     - Chốt: đoạn hợp lệ đầu tiên chốt NGAY ("BẮT NHANH LIVE"); các đoạn sau CHỈ cập nhật khi tin cậy CAO HƠN mức đã chốt
       và Key khác Key đã gửi; tin cậy >= 0.85 => "DÒ XONG".
   Engine này ĐỘC LẬP với KeyEngine (thuật toán AI cũ của Menu giữ nguyên 100%). Chỉ được dùng khi người dùng chọn
   "Auto Key tạm thời" trong thẻ chuột phải nút AUTO DETECT. Giao diện trả kết quả CÙNG HÌNH DẠNG KeyEngine.detectOnce
   ({ key: "G# Minor", rootIndex, mode, confidence, margin, top2 }) nên phần còn lại của Menu dùng y như Key AI.
   Không sửa HTML: file này được renderer.js nạp bằng script động.
   ========================================================== */
(function (root) {
    "use strict";

    // ---------- Hằng số bê nguyên từ AutoKey Live Studio ----------
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const MAJOR_TEMPLATE = [6.5, 2.0, 3.5, 2.1, 4.6, 4.0, 2.4, 5.3, 2.3, 3.7, 2.2, 3.3];
    const MINOR_TEMPLATE = [6.5, 2.6, 3.5, 5.4, 2.5, 3.6, 2.4, 5.2, 4.0, 2.7, 4.1, 3.2];
    const CHUNK_SECONDS = 1.5;        // FAST_CHUNK_SECONDS
    const BLOCK_SECONDS = 0.05;       // chunk_frames = int(sr * 0.05)
    const SILENCE_THRESHOLD = 0.001;  // RMS tối thiểu
    const N_FFT = 8192;
    const HOP = 2048;
    const FREQ_MIN = 32.0;
    const FREQ_MAX = 2000.0;
    const BASS_MAX = 135.0;
    const DONE_CONFIDENCE = 0.85;     // >= 0.85 => "DÒ XONG"
    const ENGINE_TAG = "autokey-live";

    // ---------- FFT radix-2 (thuận, e^{-i}) ----------
    const fftTable = (function () {
        const n = N_FFT, levels = Math.round(Math.log2(n));
        const rev = new Uint32Array(n);
        for (let i = 0; i < n; i++) rev[i] = (rev[i >> 1] >> 1) | ((i & 1) << (levels - 1));
        const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
        for (let i = 0; i < n / 2; i++) { const a = 2 * Math.PI * i / n; cos[i] = Math.cos(a); sin[i] = Math.sin(a); }
        return { n, rev, cos, sin };
    })();
    function fftInPlace(re, im) {
        const { n, rev, cos, sin } = fftTable;
        for (let i = 0; i < n; i++) {
            const j = rev[i];
            if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (let size = 2; size <= n; size <<= 1) {
            const half = size >> 1, step = n / size;
            for (let i = 0; i < n; i += size) {
                let k = 0;
                for (let j = i; j < i + half; j++) {
                    const l = j + half;
                    const tr = re[l] * cos[k] + im[l] * sin[k];
                    const ti = im[l] * cos[k] - re[l] * sin[k];
                    re[l] = re[j] - tr; im[l] = im[j] - ti;
                    re[j] += tr; im[j] += ti;
                    k += step;
                }
            }
        }
    }
    // np.hanning(N) (đối xứng: mẫu số N-1)
    const HANN = (function () { const w = new Float64Array(N_FFT); for (let i = 0; i < N_FFT; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N_FFT - 1)); return w; })();

    function roundHalfEven(x) { // np.round
        const f = Math.floor(x), d = x - f;
        if (d < 0.5) return f;
        if (d > 0.5) return f + 1;
        return (f % 2 === 0) ? f : f + 1;
    }
    const binTableCache = {};
    // Bảng bin hợp lệ (32–2000 Hz) -> nốt 0..11 và cờ bass, theo tần số lấy mẫu (như np.fft.rfftfreq(n, d=1.0/sr))
    function getBinTable(sr) {
        if (binTableCache[sr]) return binTableCache[sr];
        const idx = [], note = [], bass = [];
        const d = 1.0 / sr;
        for (let k = 0; k <= N_FFT / 2; k++) {
            const f = k / (N_FFT * d);
            if (f >= FREQ_MIN && f <= FREQ_MAX) {
                const midi = 69.0 + 12.0 * Math.log2(f / 440.0);
                const n = ((roundHalfEven(midi) % 12) + 12) % 12;
                idx.push(k); note.push(n); bass.push(f <= BASS_MAX ? 1 : 0);
            }
        }
        const t = { idx: Int32Array.from(idx), note: Int32Array.from(note), bass: Uint8Array.from(bass) };
        binTableCache[sr] = t;
        return t;
    }

    // extract_chunk_features: trả { full: Float64Array(12), bass: Float64Array(12) } hoặc null (im lặng / không có năng lượng)
    function extractChunkFeatures(audio, sr) {
        const len0 = audio.length;
        let sum = 0;
        for (let i = 0; i < len0; i++) sum += audio[i] * audio[i];
        const rms = Math.sqrt(sum / (len0 || 1));
        if (!(rms >= SILENCE_THRESHOLD)) return null;
        let a = audio;
        if (len0 < N_FFT) { a = new Float32Array(N_FFT); a.set(audio); } // np.pad về đủ 8192
        const tab = getBinTable(sr);
        const full = new Float64Array(12), bass = new Float64Array(12);
        const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);
        const last = a.length - N_FFT + 1;
        for (let start = 0; start < last; start += HOP) {
            for (let i = 0; i < N_FFT; i++) { re[i] = a[start + i] * HANN[i]; im[i] = 0; }
            fftInPlace(re, im);
            for (let q = 0; q < tab.idx.length; q++) {
                const k = tab.idx[q];
                const p = re[k] * re[k] + im[k] * im[k];
                const n = tab.note[q];
                full[n] += p;
                if (tab.bass[q]) bass[n] += p;
            }
        }
        let mx = 0;
        for (let i = 0; i < 12; i++) if (full[i] > mx) mx = full[i];
        if (mx === 0) return null;
        return { full, bass };
    }

    function pearsonCorr(x, y) {
        let mx = 0, my = 0;
        for (let i = 0; i < 12; i++) { mx += x[i]; my += y[i]; }
        mx /= 12; my /= 12;
        let sxx = 0, syy = 0, sxy = 0;
        for (let i = 0; i < 12; i++) { const a = x[i] - mx, b = y[i] - my; sxx += a * a; syy += b * b; sxy += a * b; }
        const denom = Math.sqrt(sxx * syy);
        return denom === 0 ? 0.0 : sxy / denom;
    }

    // evaluate_cumulative_key: trả null (chưa có dữ liệu) hoặc { rootIndex, mode, confidence, score, margin, top2 }
    function evaluateCumulativeKey(totalFull, totalBass) {
        let fmax = 0, bmax = 0;
        for (let i = 0; i < 12; i++) { if (totalFull[i] > fmax) fmax = totalFull[i]; if (totalBass[i] > bmax) bmax = totalBass[i]; }
        if (fmax === 0) return null;
        const nf = new Float64Array(12), nb = new Float64Array(12);
        for (let i = 0; i < 12; i++) { nf[i] = totalFull[i] / fmax; nb[i] = bmax > 0 ? totalBass[i] / bmax : 0; }
        for (let i = 0; i < 12; i++) {
            if (nf[i] < 0.15) nf[i] = 0.0;
            if (nb[i] < 0.15) nb[i] = 0.0;
            nf[i] = Math.pow(nf[i], 1.35);
            nb[i] = Math.pow(nb[i], 1.35);
        }
        let m1 = 0, m2 = 0;
        for (let i = 0; i < 12; i++) { if (nf[i] > m1) m1 = nf[i]; if (nb[i] > m2) m2 = nb[i]; }
        if (m1 > 0) for (let i = 0; i < 12; i++) nf[i] /= m1;
        if (m2 > 0) for (let i = 0; i < 12; i++) nb[i] /= m2;
        const combined = new Float64Array(12);
        for (let i = 0; i < 12; i++) combined[i] = 0.65 * nf[i] + 0.35 * nb[i];
        const scores = [];
        const maj = new Float64Array(12), min = new Float64Array(12);
        for (let i = 0; i < 12; i++) {
            for (let j = 0; j < 12; j++) { maj[(j + i) % 12] = MAJOR_TEMPLATE[j]; min[(j + i) % 12] = MINOR_TEMPLATE[j]; } // np.roll(template, i)
            const triad = 0.08 * nb[i] + 0.04 * nb[(i + 5) % 12] + 0.04 * nb[(i + 7) % 12];
            scores.push({ score: pearsonCorr(combined, maj) + triad, root: i, mode: "Major" });
            scores.push({ score: pearsonCorr(combined, min) + triad, root: i, mode: "Minor" });
        }
        scores.sort((a, b) => b.score - a.score); // sắp giảm dần (ổn định, như sorted(..., reverse=True))
        const best = scores[0], second = scores[1];
        const margin = Math.max(0.0, best.score - second.score);
        const conf = Math.min(0.99, Math.max(0.5, 0.52 + best.score * 0.36 + margin * 0.85));
        return { rootIndex: best.root, mode: best.mode, confidence: conf, score: best.score, margin, top2: { root: second.root, mode: second.mode } };
    }

    // Cắt luồng PCM (mono) thành đoạn 1.5 s: đọc từng khối 50 ms, khối im lặng (RMS < 0.001) bị bỏ qua (KHÔNG xoá bộ đệm).
    function createChunker(sampleRate, onChunk) {
        const blockLen = Math.floor(sampleRate * BLOCK_SECONDS);
        const chunkLen = Math.floor(sampleRate * CHUNK_SECONDS);
        const block = new Float32Array(blockLen);
        let blockFill = 0;
        const buf = new Float32Array(chunkLen + blockLen);
        let fill = 0;
        function processBlock() {
            let s = 0;
            for (let i = 0; i < blockLen; i++) s += block[i] * block[i];
            const rms = Math.sqrt(s / blockLen);
            if (rms < SILENCE_THRESHOLD) return; // bỏ qua khối im lặng
            buf.set(block, fill); fill += blockLen;
            if (fill >= chunkLen) {
                const chunk = buf.slice(0, chunkLen);
                buf.copyWithin(0, chunkLen, fill); fill -= chunkLen;
                onChunk(chunk);
            }
        }
        return {
            push(samples) {
                for (let i = 0; i < samples.length; i++) {
                    block[blockFill++] = samples[i];
                    if (blockFill === blockLen) { blockFill = 0; processBlock(); }
                }
            },
            reset() { blockFill = 0; fill = 0; },
            get blockLen() { return blockLen; },
            get chunkLen() { return chunkLen; }
        };
    }

    // Phiên dò của MỘT bài: giữ tổng cộng dồn + trạng thái chốt. pushChunk(chunk) trả về sự kiện cần báo hoặc null.
    function createSession(sampleRate) {
        const st = { cumFull: new Float64Array(12), cumBass: new Float64Array(12), chunks: 0, firstLocked: false, bestConf: 0.0,
            lastRoot: -1, lastMode: null, status: "", statusKind: "idle", last: null };
        function toResult(ev, why) {
            return { key: NOTE_NAMES[ev.rootIndex] + " " + ev.mode, rootIndex: ev.rootIndex, mode: ev.mode, confidence: ev.confidence,
                margin: ev.margin, top2: ev.top2, bassAgreement: null, engine: ENGINE_TAG, reason: why };
        }
        return {
            state: st,
            pushChunk(chunk) {
                const f = extractChunkFeatures(chunk, sampleRate);
                if (!f) return null;
                for (let i = 0; i < 12; i++) { st.cumFull[i] += f.full[i]; st.cumBass[i] += f.bass[i]; }
                const ev = evaluateCumulativeKey(st.cumFull, st.cumBass);
                if (!ev) return null;
                st.chunks++;
                const pct = Math.round(ev.confidence * 100);
                if (!st.firstLocked) { // BẮT NHANH LIVE: đoạn hợp lệ đầu tiên chốt ngay
                    st.firstLocked = true; st.bestConf = ev.confidence; st.lastRoot = ev.rootIndex; st.lastMode = ev.mode;
                    st.status = "BẮT NHANH LIVE (" + pct + "%)"; st.statusKind = "quick";
                    st.last = toResult(ev, "first-chunk");
                    return st.last;
                }
                if (ev.confidence > st.bestConf) { // chỉ nâng khi tin cậy CAO HƠN
                    st.bestConf = ev.confidence;
                    let out = null;
                    if (ev.rootIndex !== st.lastRoot || ev.mode !== st.lastMode) { // chỉ báo lại khi Key đổi
                        st.lastRoot = ev.rootIndex; st.lastMode = ev.mode; out = toResult(ev, "confidence-up");
                        st.last = out;
                    }
                    if (ev.confidence >= DONE_CONFIDENCE) { st.status = "DÒ XONG (" + pct + "%)"; st.statusKind = "done"; }
                    return out;
                }
                return null;
            }
        };
    }

    // ---------- Engine chạy thật trên SYSTEM_AUDIO (cùng audioContext + source như KeyEngine.init) ----------
    let audioCtx = null, sourceNode = null, processor = null, muteGain = null, chunker = null, session = null;
    let enabled = false, listener = null, pending = null;

    function teardownCapture() {
        try { if (processor) { processor.onaudioprocess = null; processor.disconnect(); } } catch (e) { /* bỏ qua */ }
        try { if (muteGain) muteGain.disconnect(); } catch (e) { /* bỏ qua */ }
        try { if (sourceNode && processor) sourceNode.disconnect(processor); } catch (e) { /* bỏ qua */ }
        processor = null; muteGain = null; chunker = null;
    }
    function deliver(result) {
        if (!listener) { pending = result; return; } // chưa có người nghe: giữ kết quả mới nhất, giao ở lần detectOnce kế tiếp
        const cb = listener; listener = null;
        try { cb(result); } catch (e) { console.error("[AutoKeyLive] callback lỗi:", e); }
    }
    function onChunk(chunk) {
        if (!session) return;
        const r = session.pushChunk(chunk);
        if (r) deliver(r);
    }
    function startCapture() {
        if (processor || !enabled || !audioCtx || !sourceNode) return false;
        try {
            session = session || createSession(audioCtx.sampleRate);
            chunker = createChunker(audioCtx.sampleRate, onChunk);
            processor = audioCtx.createScriptProcessor(4096, 1, 1); // 1 kênh vào: tự trộn mono = trung bình các kênh (như np.mean)
            muteGain = audioCtx.createGain(); muteGain.gain.value = 0; // không phát tiếng ra loa
            processor.onaudioprocess = (e) => { if (chunker) chunker.push(e.inputBuffer.getChannelData(0)); };
            sourceNode.connect(processor); processor.connect(muteGain); muteGain.connect(audioCtx.destination);
            return true;
        } catch (e) { console.error("[AutoKeyLive] không bắt được âm thanh:", e); teardownCapture(); return false; }
    }

    const AutoKeyLive = {
        ENGINE_TAG, NOTE_NAMES,
        // Bật/tắt chế độ. Tắt => dừng hẳn việc bắt âm thanh (không tốn CPU).
        setEnabled(on) { enabled = !!on; if (!enabled) { teardownCapture(); listener = null; pending = null; } },
        isEnabled() { return enabled; },
        // Bắt đầu chu trình MỚI (đổi bài / bind lại nguồn / AUTO DETECT): xoá toàn bộ dữ liệu cộng dồn.
        init(audioContext, source) {
            teardownCapture();
            audioCtx = audioContext || null; sourceNode = source || null;
            session = audioCtx ? createSession(audioCtx.sampleRate) : null;
            pending = null; listener = null;
            if (enabled) startCapture();
        },
        // Đăng ký nhận kết quả (giống KeyEngine.detectOnce: 1 lần rồi tự gỡ; renderer gọi lại sau mỗi kết quả). Trả hàm huỷ.
        detectOnce(cb) {
            listener = cb;
            startCapture();
            if (pending) { const r = pending; pending = null; setTimeout(() => { if (listener === cb) deliver(r); else pending = r; }, 0); }
            return function stopWatcher() { if (listener === cb) listener = null; };
        },
        stop() { teardownCapture(); listener = null; },
        isReady() { return enabled && !!audioCtx && !!sourceNode; },
        getState() { const s = session ? session.state : null; return { enabled, capturing: !!processor, chunks: s ? s.chunks : 0, bestConfidence: s ? s.bestConf : 0, status: s ? s.status : "", statusKind: s ? s.statusKind : "idle", last: s ? s.last : null }; },
        // Phần thuần (không cần trình duyệt) — dùng cho kiểm thử
        _core: { extractChunkFeatures, evaluateCumulativeKey, pearsonCorr, createChunker, createSession, getBinTable, constants: { NOTE_NAMES, MAJOR_TEMPLATE, MINOR_TEMPLATE, CHUNK_SECONDS, BLOCK_SECONDS, SILENCE_THRESHOLD, N_FFT, HOP, FREQ_MIN, FREQ_MAX, BASS_MAX, DONE_CONFIDENCE } }
    };

    root.AutoKeyLive = AutoKeyLive;
    if (typeof module !== "undefined" && module.exports) module.exports = AutoKeyLive;
})(typeof window !== "undefined" ? window : globalThis);
