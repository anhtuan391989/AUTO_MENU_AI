/* ==========================================================
   KEY ENGINE — tự quản lý toàn bộ việc dò Key (chroma vector +
   Krumhansl-Schmuckler)
   -----------------------------------------------------------
   QUAN TRỌNG: đây là xử lý tín hiệu số (DSP) chạy ngay trong trình duyệt
   qua Web Audio API — KHÔNG phải gọi Claude/Anthropic API. aiLayer.js
   (nếu có, gọi Claude) chỉ dùng để hiểu LỆNH BẰNG CHỮ, không nhận audio
   thô để phân tích cao độ. Dò Key bắt buộc phải là DSP.

   Nguyên lý: với mỗi khung FFT, tính năng lượng âm thanh rơi vào 12 nốt
   nhạc (chroma vector), làm mượt theo thời gian, so khớp với 24 khuôn mẫu
   chuẩn (12 Trưởng + 12 Thứ, trọng số Krumhansl-Kessler 1990) để tìm khuôn
   khớp nhất.

   Độc lập hoàn toàn với BPMEngine/ModEngine: có analyser riêng, vòng lặp
   riêng. Chỉ chia sẻ chung AudioContext + source node do renderer.js tạo.
   ModEngine đọc kết quả qua estimateKeyFromChroma()/watchContinuous() —
   KeyEngine không biết gì về ModEngine (1 chiều).

   Cách dùng từ renderer.js:
     KeyEngine.init(audioContext, sourceNode);
     KeyEngine.detectOnce((result) => { ...chốt Key gốc... });          // 1 lần, tự dừng khi xong
     const stop = KeyEngine.watchContinuous((result) => { ... });        // chạy mãi, dùng cho ModEngine
   ========================================================== */
const KeyEngine = (() => {
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Trọng số chuẩn ngành (Krumhansl & Kessler, 1990) — số liệu thực nghiệm công khai
    // về cảm nhận độ "ổn định" của từng bậc trong 1 điệu, không tự bịa.
    const KS_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KS_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    const CHROMA_SMOOTHING = 0.96; // càng gần 1 càng mượt/chậm đổi, cần thiết vì tín hiệu qua loopback ảo khá nhiễu
    const MIN_CONFIDENCE = 0.35;   // dưới ngưỡng này coi là chưa đủ tin cậy
    const STABLE_CHECKS = 4;        // (giữ lại để tương thích, không còn dùng trực tiếp)
    const CHECK_INTERVAL_MS = 1500; // kiểm tra thường xuyên hơn (trước: 3000ms)
    const VOTE_WINDOW = 8;          // giữ 8 lần đo gần nhất (~12 giây ở 1.5s/lần)
    const VOTE_MIN_AGREE = 5;       // cần ít nhất 5/8 lần đo RA CÙNG 1 kết quả mới chốt — không
                                     // bắt buộc phải liên tiếp tuyệt đối, chịu được vài lần nhiễu/trật
    const BASS_MAX_HZ = 260;       // nốt gốc của hợp âm gần như luôn nằm ở bass
    const BASS_WEIGHT = 4;         // ưu tiên bass gấp 4 lần so với phần giữa/cao (giai điệu hát)

    let chromaAnalyser = null;
    let chromaDataArray = null;
    let audioCtxRef = null;
    let chromaVector = new Array(12).fill(0);

    // Theo dõi RIÊNG nốt bass hay "THẮNG" (mạnh nhất trong TỪNG khung) nhiều lần nhất — ĐẾM SỐ
    // LẦN THẮNG, không cộng dồn độ to. Lý do đổi cách này: cộng dồn biên độ thô rất dễ bị 1 hợp
    // âm ngân dài/to (vd hợp âm bậc 5) lấn át hoàn toàn, dù nốt chủ thực ra xuất hiện NHIỀU LẦN
    // hơn (chỉ là mỗi lần không ngân to bằng). Đếm số lần thắng coi mỗi khung là 1 phiếu ngang
    // nhau, không để 1-2 khung quá to quyết định hết.
    let bassRootVotes = new Array(12).fill(0);
    const BASS_VOTE_DECAY = 0.999; // "rò rỉ" phiếu cũ dần theo thời gian, ưu tiên xu hướng gần đây
                                    // hơn 1 chút so với đầu bài, nhưng vẫn giữ được suốt ~15-20s

    const BASS_ROOT_BOOST_WEIGHT = 0.5; // đủ mạnh để phá thế hoà I/V khi correlation gần bằng nhau

    let running = false;
    let rafId = null;

    const levelListeners = []; // callback(chromaVectorSnapshot) mỗi khung — dùng cho debug

    function init(audioContext, sourceNode) {
        audioCtxRef = audioContext;
        chromaAnalyser = audioContext.createAnalyser();
        chromaAnalyser.fftSize = 8192; // lớn -> phân giải tần số tốt hơn, đánh đổi độ trễ (chấp nhận được vì Key không cần phản ứng tức thời như beat)
        chromaAnalyser.smoothingTimeConstant = 0; // tự làm mượt bằng tay (CHROMA_SMOOTHING)
        sourceNode.connect(chromaAnalyser);
        chromaDataArray = new Float32Array(chromaAnalyser.frequencyBinCount);
        chromaVector = new Array(12).fill(0);
        bassRootVotes = new Array(12).fill(0);

        running = true;
        loop();
    }

    function frequencyToPitchClass(freq) {
        if (freq <= 0) return -1;
        const midi = 69 + 12 * Math.log2(freq / 440); // 440Hz = A4 = MIDI note 69
        return (((Math.round(midi) % 12) + 12) % 12);
    }

    function updateChromaVector() {
        if (!chromaAnalyser || !chromaDataArray) return;
        chromaAnalyser.getFloatFrequencyData(chromaDataArray); // đơn vị dB, thường âm

        const sampleRate = audioCtxRef?.sampleRate || 48000;
        const binHz = sampleRate / chromaAnalyser.fftSize;
        const frame = new Array(12).fill(0);
        const bassFrame = new Array(12).fill(0);

        // Dải ~65Hz (C2) tới ~2100Hz (khoảng C7) — bao trùm hầu hết nhạc cụ/giọng hát,
        // loại bớt nhiễu tần số quá thấp (rumble) hoặc quá cao (harmonics rối).
        const minBin = Math.max(1, Math.floor(65 / binHz));
        const maxBin = Math.min(chromaDataArray.length - 1, Math.ceil(2100 / binHz));

        for (let i = minBin; i <= maxBin; i++) {
            const db = chromaDataArray[i];
            if (db < -90) continue;
            const rawMagnitude = Math.pow(10, db / 20);
            // NÉN biên độ (căn bậc 2) — giảm bớt ảnh hưởng của các bin bị kịch trần/vỡ tiếng
            // (thường xuất hiện dạng vài đỉnh cực lớn bất thường) so với phần còn lại của phổ,
            // giúp hình dạng chroma phản ánh đúng tỉ lệ hài hoà thật hơn thay vì bị vài đỉnh vỡ
            // tiếng lấn át. Đây chỉ là giảm nhẹ tác động — gain vỡ tiếng ở nguồn vẫn cần hạ thật.
            const magnitude = Math.sqrt(rawMagnitude);
            const pc = frequencyToPitchClass(i * binHz);
            if (pc < 0) continue;
            const isBass = (i * binHz) <= BASS_MAX_HZ;
            const weight = isBass ? BASS_WEIGHT : 1;
            frame[pc] += magnitude * weight;
            if (isBass) bassFrame[pc] += magnitude;
        }

        for (let i = 0; i < 12; i++) {
            chromaVector[i] = chromaVector[i] * CHROMA_SMOOTHING + frame[i] * (1 - CHROMA_SMOOTHING);
        }

        // ĐẾM PHIẾU: tìm nốt bass mạnh nhất CHỈ TRONG KHUNG NÀY rồi cộng đúng 1 phiếu cho nó —
        // không quan tâm nó to hơn nốt nhì bao nhiêu, chỉ tính có thắng hay không.
        let winnerPc = -1, winnerVal = 0;
        for (let i = 0; i < 12; i++) {
            if (bassFrame[i] > winnerVal) { winnerVal = bassFrame[i]; winnerPc = i; }
        }
        for (let i = 0; i < 12; i++) bassRootVotes[i] *= BASS_VOTE_DECAY;
        if (winnerPc >= 0 && winnerVal > 0.01) bassRootVotes[winnerPc] += 1;

        levelListeners.forEach((cb) => cb(chromaVector));
    }

    function pearsonCorrelation(a, b) {
        const meanA = a.reduce((s, v) => s + v, 0) / a.length;
        const meanB = b.reduce((s, v) => s + v, 0) / b.length;
        let num = 0, denomA = 0, denomB = 0;
        for (let i = 0; i < a.length; i++) {
            const da = a[i] - meanA;
            const db = b[i] - meanB;
            num += da * db;
            denomA += da * da;
            denomB += db * db;
        }
        const denom = Math.sqrt(denomA * denomB);
        return denom === 0 ? 0 : num / denom;
    }

    // BUG ĐÃ SỬA: bản cũ dùng slice(steps).concat(slice(0,steps)) — đây là XOAY TRÁI, đặt nốt
    // chủ (tonic, giá trị lớn nhất của profile) vào SAI vị trí (root' = (12-steps)%12 thay vì
    // đúng "steps"). Hệ quả: suốt từ đầu, thuật toán so sánh chroma thật với khuôn mẫu của SAI
    // nốt gốc, gây chốt Key sai có hệ thống (không phải do nhiễu tín hiệu). Đã đổi sang XOAY PHẢI
    // — kiểm chứng bằng tay: với steps=4 (gốc E), tonic phải rơi đúng vào index 4 của mảng kết quả.
    function rotateProfile(profile, steps) {
        const s = ((steps % 12) + 12) % 12;
        return profile.slice(12 - s).concat(profile.slice(0, 12 - s));
    }

    /** @returns {{ key: string, rootIndex: number, mode: string, confidence: number }} */
    function estimateKeyFromChroma() {
        const maxBassVotes = Math.max(...bassRootVotes, 1e-9);

        let best = { score: -Infinity, root: 0, mode: "Major" };

        // === Margin Engine (Phase 1) — CHỈ thu thập song song để tính Top1/Top2/Margin,
        // KHÔNG đụng tới vòng lặp/điều kiện chọn `best` phía dưới (giữ nguyên y hệt bản gốc).
        // Chưa dùng để quyết định gì — chỉ phục vụ logging/giai đoạn sau (Decision Engine...).
        const allScores = [];

        for (let root = 0; root < 12; root++) {
            // Boost cho root trùng với nốt bass hay lặp lại nhất — phá thế hoà giữa các giọng
            // song song/họ hàng gần (vd E Major vs C# Minor) mà chỉ correlation không phân biệt nổi.
            const bassBoost = (bassRootVotes[root] / maxBassVotes) * BASS_ROOT_BOOST_WEIGHT;

            const majorScore = pearsonCorrelation(chromaVector, rotateProfile(KS_MAJOR_PROFILE, root)) + bassBoost;
            const minorScore = pearsonCorrelation(chromaVector, rotateProfile(KS_MINOR_PROFILE, root)) + bassBoost;
            if (majorScore > best.score) best = { score: majorScore, root, mode: "Major" };
            if (minorScore > best.score) best = { score: minorScore, root, mode: "Minor" };

            allScores.push({ score: majorScore, root, mode: "Major" });
            allScores.push({ score: minorScore, root, mode: "Minor" });
        }

        // Top1/Top2/Margin tính RIÊNG, SAU KHI vòng lặp gốc đã xong — không ảnh hưởng `best`.
        allScores.sort((a, b) => b.score - a.score);
        const top1 = allScores[0];
        const top2 = allScores[1];
        const margin = top1.score - top2.score;

        return {
            key: `${NOTE_NAMES[best.root]} ${best.mode}`,
            rootIndex: best.root,
            mode: best.mode,
            confidence: best.score,
            top1,
            top2,
            margin
        };
    }

    // Chênh lệch bán cung NGẮN NHẤT giữa 2 nốt (vd C->A# nên hiểu là -2, không phải +10).
    function shortestSemitoneDelta(fromIndex, toIndex) {
        let delta = (toIndex - fromIndex + 12) % 12;
        if (delta > 6) delta -= 12;
        return delta;
    }

    // Bỏ phiếu đa số trong cửa sổ trượt — gọi onWinner(result, count) mỗi khi 1 kết quả chiếm
    // đa số trong VOTE_WINDOW lần đo gần nhất. Dùng chung cho cả detectOnce lẫn watchContinuous.
    // Thời gian tối thiểu phải chờ trước khi CHO PHÉP chốt bất kỳ kết quả nào — bass root
    // histogram cần thời gian này để phân biệt được nhà (I) và bậc 5 (V), nếu chốt quá sớm
    // (trước khi histogram kịp lệch rõ) rất dễ vồ nhầm sang bậc 5.
    const MIN_ELAPSED_BEFORE_LOCK_MS = 15000;

    function runVoteLoop(onWinner) {
        const voteWindow = []; // các phần tử dạng {key: "rootIndex-mode", result}
        const startedAt = Date.now();

        const timer = setInterval(() => {
            const result = estimateKeyFromChroma();
            if (result.confidence < MIN_CONFIDENCE) return; // không đủ tin cậy, bỏ qua lần đo này, không tính vào cửa sổ

            voteWindow.push({ key: `${result.rootIndex}-${result.mode}`, result });
            if (voteWindow.length > VOTE_WINDOW) voteWindow.shift();

            const counts = {};
            let bestKey = null, bestCount = 0, bestResult = null;
            voteWindow.forEach((v) => {
                counts[v.key] = (counts[v.key] || 0) + 1;
                if (counts[v.key] > bestCount) { bestCount = counts[v.key]; bestKey = v.key; bestResult = v.result; }
            });

            const elapsed = Date.now() - startedAt;
            if (bestCount >= VOTE_MIN_AGREE && elapsed >= MIN_ELAPSED_BEFORE_LOCK_MS) {
                onWinner(bestResult, bestCount, () => clearInterval(timer));
            }
        }, CHECK_INTERVAL_MS);

        return () => clearInterval(timer);
    }

    /**
     * Dò 1 LẦN cho tới khi 1 kết quả chiếm đa số trong cửa sổ gần nhất rồi tự dừng.
     * Dùng khi cần chốt Key gốc lúc bắt đầu bài hát.
     * @returns {() => void} hàm huỷ, phòng khi cần dừng giữa chừng
     */
    function detectOnce(onStable) {
        return runVoteLoop((result, count, stop) => {
            stop();
            onStable(result);
        });
    }

    /**
     * Chạy MÃI, báo mỗi khi Key thắng phiếu bầu KHÁC với lần báo trước — dùng cho ModEngine
     * theo dõi suốt bài (không báo lặp lại liên tục khi vẫn đang giữ nguyên 1 Key).
     * @returns {() => void} hàm huỷ
     */
    function watchContinuous(onStableChange) {
        let lastReportedKey = null;
        return runVoteLoop((result) => {
            const key = `${result.rootIndex}-${result.mode}`;
            if (key === lastReportedKey) return;
            lastReportedKey = key;
            onStableChange(result);
        });
    }

    function loop() {
        if (!running) return;
        updateChromaVector();
        rafId = requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    function onLevel(cb) { levelListeners.push(cb); } // dùng cho debug log

    function getDebugSnapshot() {
        return { chromaVector: chromaVector.slice(), bassRootVotes: bassRootVotes.slice() };
    }

    return {
        init, stop, detectOnce, watchContinuous, estimateKeyFromChroma,
        shortestSemitoneDelta, onLevel, NOTE_NAMES, MIN_CONFIDENCE, getDebugSnapshot,
    };
})();

window.KeyEngine = KeyEngine;
