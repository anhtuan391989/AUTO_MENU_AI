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

    // === Top1 Stability Timer (Phase 3.5) — CHỈ dữ liệu quan sát, không ảnh hưởng bất kỳ
    // quyết định nào. Theo dõi "Top1 hiện tại đã giữ nguyên liên tục bao lâu", reset ĐÚNG
    // khi Top1 (root-mode) đổi, KHÔNG reset khi confidence/margin/stability đổi.
    let lastTop1Key = null;
    let lastTop1Label = null;
    let lastTop1ChangedAt = null;
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
        lastTop1Key = null;
        lastTop1Label = null;
        lastTop1ChangedAt = null;

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
            // Tách riêng bassAgreement (tỉ lệ RAW, tự nhiên trong [0,1]) — bassBoost tính từ đó,
            // GIÁ TRỊ Y HỆT bản gốc, chỉ đặt tên lại để dùng cho Confidence V2 (Phase 3).
            const bassAgreement = bassRootVotes[root] / maxBassVotes;
            const bassBoost = bassAgreement * BASS_ROOT_BOOST_WEIGHT;

            const majorScore = pearsonCorrelation(chromaVector, rotateProfile(KS_MAJOR_PROFILE, root)) + bassBoost;
            const minorScore = pearsonCorrelation(chromaVector, rotateProfile(KS_MINOR_PROFILE, root)) + bassBoost;
            if (majorScore > best.score) best = { score: majorScore, root, mode: "Major" };
            if (minorScore > best.score) best = { score: minorScore, root, mode: "Minor" };

            allScores.push({ score: majorScore, root, mode: "Major", bassAgreement });
            allScores.push({ score: minorScore, root, mode: "Minor", bassAgreement });
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
            margin,
            bassAgreement: top1.bassAgreement
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

    function formatElapsedSeconds(ms) {
        return (ms / 1000).toFixed(1);
    }

    function formatCandidate(candidate) {
        if (!candidate) return "?";
        return `${NOTE_NAMES[candidate.root]} ${candidate.mode} (${candidate.score.toFixed(2)})`;
    }

    // Nhãn NGƯỜI ĐỌC được, KHÔNG kèm điểm số — dùng cho telemetry (Phase 4A), khác
    // formatCandidate() ở trên (dùng cho log console, có kèm điểm).
    function candidateLabel(candidate) {
        if (!candidate) return null;
        return `${NOTE_NAMES[candidate.root]} ${candidate.mode}`;
    }

    // === Telemetry (Phase 4A) — CHỈ gửi dữ liệu ĐÃ TÍNH XONG sang main process qua IPC
    // (nếu có window.electronAPI.sendTelemetry — an toàn no-op nếu không có, vd trong môi
    // trường sandbox/test). KHÔNG gửi FFT/chroma vector/spectrum/audio buffer thô. KHÔNG
    // ảnh hưởng bất kỳ quyết định nào — chỉ là quan sát thêm, giống các Phase log trước.
    function sendTelemetry(record) {
        if (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.sendTelemetry === "function") {
            window.electronAPI.sendTelemetry(record);
        }
    }

    // === Margin Logger (Phase 1.5) — CHỈ ghi nhận dữ liệu, KHÔNG quyết định gì. Dùng để thu
    // thập thực tế margin/confidence của nhạc thật, làm nền tảng chọn ngưỡng cho Adaptive Lock
    // (Phase 4) sau này thay vì đoán theo cảm tính. `locked` được TRUYỀN VÀO từ đúng biến
    // `willLock` mà runVoteLoop() dùng để quyết định thật — đảm bảo log không bao giờ lệch so
    // với những gì engine THỰC SỰ làm.
    function logMarginSnapshot(result, startedAt, bestCount, locked, stability, confidenceV2, top1StableMs, note) {
        const lines = [
            `[KeyEngine] Time: ${formatElapsedSeconds(Date.now() - startedAt)}s`,
            `  Top1: ${formatCandidate(result.top1)}`,
            `  Top2: ${formatCandidate(result.top2)}`,
            `  Margin: ${typeof result.margin === "number" ? result.margin.toFixed(2) : "?"}`,
            `  Stability: ${typeof stability === "number" ? stability.toFixed(2) : "?"}`,
            `  Top1 Stable: ${formatElapsedSeconds(top1StableMs)}s`,
            `  Confidence: ${result.confidence.toFixed(2)}`,
            `  DecisionScore: ${confidenceV2.combined.toFixed(2)}`, // alias hiển thị của confidenceV2.combined đã có sẵn — KHÔNG tính toán mới
            `  Key: ${result.key}`,
            `  Votes: ${bestCount}/${VOTE_MIN_AGREE}`,
            `  Locked: ${locked ? "Yes" : "No"}${note ? ` (${note})` : ""}`,
            `  ConfidenceV2: ${JSON.stringify(confidenceV2)}`
        ];
        console.log(lines.join("\n"));
    }

    // === Stability Tracker (Phase 2) — CHỈ đọc lại đúng bestCount/độ dài Vote Window đã có
    // sẵn (KHÔNG thêm cấu trúc dữ liệu song song, KHÔNG đụng cách Vote Window tự đếm phiếu/
    // quyết định). Công thức: bình phương tỉ lệ đồng thuận trong cửa sổ hiện tại — phạt mạnh
    // hơn khi kết quả dao động qua lại. Vd 5/5 đồng thuận -> 1.00; 3/5 -> (0.6)^2 = 0.36.
    function computeStability(bestCount, windowSize) {
        if (!windowSize) return 0;
        const agreement = bestCount / windowSize;
        return agreement * agreement;
    }

    // === Top1 Stability Timer (Phase 3.5) — không tạo timer/setInterval riêng, chỉ tính
    // `now - lastTop1ChangedAt` NGAY KHI được gọi (từ trong tick đã có sẵn của runVoteLoop).
    // Reset ĐÚNG khi Top1 (root-mode) đổi — KHÔNG reset khi confidence/margin/stability đổi,
    // vì các giá trị đó không được đọc/so sánh ở đây.
    function updateTop1StabilityTimer(top1) {
        const currentKey = `${top1.root}-${top1.mode}`;
        const currentLabel = candidateLabel(top1);
        const now = Date.now();

        let changed = false;
        let previousLabel = null;

        if (currentKey !== lastTop1Key) {
            previousLabel = lastTop1Label;
            changed = lastTop1Key !== null; // lần đầu tiên (chưa có gì để so sánh) không tính là "đổi"
            lastTop1Key = currentKey;
            lastTop1Label = currentLabel;
            lastTop1ChangedAt = now;
        }

        return { stableMs: now - lastTop1ChangedAt, changed, from: previousLabel, to: currentLabel };
    }

    function clamp01(x) {
        return Math.max(0, Math.min(1, x));
    }

    // === Confidence V2 (Phase 3) — CHỈ lắp ráp để LOG, KHÔNG gắn vào object trả về cho
    // onWinner/renderer.js, KHÔNG tham gia bất kỳ điều kiện khoá nào. `confidence` gốc
    // (top-level) giữ nguyên tuyệt đối để đảm bảo tương thích, đúng yêu cầu.
    //
    // PEARSON_NORM_MAX = 1.5 = điểm tối đa LÝ THUYẾT (Pearson tối đa 1.0 + BASS_ROOT_BOOST_WEIGHT
    // tối đa 0.5) — có căn cứ trực tiếp từ code, không phải số đoán.
    // MARGIN_NORM_RANGE = 0.5 — hằng số TẠM THỜI (chưa có dữ liệu thực tế để chọn chính xác),
    // sẽ điều chỉnh lại khi đã thu thập đủ log thật, đúng tinh thần giai đoạn thu thập dữ liệu.
    const PEARSON_NORM_MAX = 1 + BASS_ROOT_BOOST_WEIGHT;
    const MARGIN_NORM_RANGE = 0.5;

    function buildConfidenceV2(result, stability) {
        const pearson = result.confidence; // === confidence hiện tại, chỉ đọc lại, không đổi field gốc
        const pearsonNorm = clamp01(pearson / PEARSON_NORM_MAX);

        const margin = result.margin;
        const marginNorm = clamp01(margin / MARGIN_NORM_RANGE);

        const stabilityNorm = clamp01(stability); // đã tự nhiên trong [0,1] (bình phương tỉ lệ)

        const bassAgreement = result.bassAgreement;
        const bassNorm = clamp01(bassAgreement); // đã tự nhiên trong [0,1] (tỉ lệ so với max)

        // Trung bình cộng đơn giản, trọng số bằng nhau (0.25 mỗi thành phần) — CHƯA có dữ liệu
        // thực tế để chọn trọng số khác biệt, đây là điểm khởi đầu trung lập nhất có thể.
        const combined = (pearsonNorm + marginNorm + stabilityNorm + bassNorm) / 4;

        // Margin thấp = 2 ứng viên gần nhau = mập mờ cao.
        const ambiguity = 1 - marginNorm;

        return { pearson, pearsonNorm, margin, marginNorm, stability, stabilityNorm, bassAgreement, bassNorm, combined, ambiguity };
    }

    function runVoteLoop(onWinner) {
        const voteWindow = []; // các phần tử dạng {key: "rootIndex-mode", result}
        const startedAt = Date.now();

        const timer = setInterval(() => {
            const result = estimateKeyFromChroma();

            // Phase 3.5 — cập nhật/đọc thời gian ổn định của Top1 NGAY tại đây, không tạo
            // timer/setInterval riêng. Chạy cho MỌI lần đo (kể cả bị lọc dưới đây), vì "Top1"
            // là kết quả của estimateKeyFromChroma() ở MỌI lần đo, không riêng gì lần được vote.
            const top1Update = updateTop1StabilityTimer(result.top1);
            const top1StableMs = top1Update.stableMs;
            const elapsedSec = parseFloat(formatElapsedSeconds(Date.now() - startedAt));

            // Phase 4A — TOP1_CHANGED: chỉ ghi nhận, dùng đúng dữ liệu Phase 3.5 đã tính,
            // không thêm điều kiện/so sánh mới nào.
            if (top1Update.changed) {
                sendTelemetry({ event: "TOP1_CHANGED", from: top1Update.from, to: top1Update.to, time: elapsedSec });
            }

            if (result.confidence < MIN_CONFIDENCE) {
                // Margin Logger: vẫn ghi nhận lần đo bị loại (để biết thực tế bao lâu bị dưới
                // ngưỡng) — KHÔNG đổi hành vi return bên dưới, vẫn y hệt bản gốc.
                const cv2Rejected = buildConfidenceV2(result, 0);
                logMarginSnapshot(result, startedAt, 0, false, 0, cv2Rejected, top1StableMs, "dưới MIN_CONFIDENCE, bị loại khỏi vote window");
                sendTelemetry({
                    time: elapsedSec,
                    top1: candidateLabel(result.top1),
                    top2: candidateLabel(result.top2),
                    confidence: result.confidence,
                    margin: result.margin,
                    stability: 0,
                    top1Stable: top1StableMs / 1000,
                    decisionScore: cv2Rejected.combined,
                    votes: 0,
                    window: voteWindow.length,
                    locked: false
                });
                return; // không đủ tin cậy, bỏ qua lần đo này, không tính vào cửa sổ
            }

            voteWindow.push({ key: `${result.rootIndex}-${result.mode}`, result });
            if (voteWindow.length > VOTE_WINDOW) voteWindow.shift();

            const counts = {};
            let bestKey = null, bestCount = 0, bestResult = null;
            voteWindow.forEach((v) => {
                counts[v.key] = (counts[v.key] || 0) + 1;
                if (counts[v.key] > bestCount) { bestCount = counts[v.key]; bestKey = v.key; bestResult = v.result; }
            });

            const stability = computeStability(bestCount, voteWindow.length); // Phase 2 — chỉ đọc lại, không đổi gì ở trên

            const elapsed = Date.now() - startedAt;
            const willLock = bestCount >= VOTE_MIN_AGREE && elapsed >= MIN_ELAPSED_BEFORE_LOCK_MS;

            // Phase 3 — confidenceV2 CHỈ tồn tại cục bộ để log, KHÔNG gắn vào `result`/`bestResult`
            // -> onWinner() bên dưới vẫn nhận đúng object y hệt bản gốc, không có gì thay đổi.
            const confidenceV2 = buildConfidenceV2(result, stability);
            logMarginSnapshot(result, startedAt, bestCount, willLock, stability, confidenceV2, top1StableMs);

            sendTelemetry({
                time: elapsedSec,
                top1: candidateLabel(result.top1),
                top2: candidateLabel(result.top2),
                confidence: result.confidence,
                margin: result.margin,
                stability,
                top1Stable: top1StableMs / 1000,
                decisionScore: confidenceV2.combined,
                votes: bestCount,
                window: voteWindow.length,
                locked: willLock
            });

            if (willLock) {
                // Phase 4A — LOCK: bản ghi RIÊNG, đúng lúc onWinner() được gọi thật (dùng chung
                // biến willLock/confidenceV2/bestResult, không tính toán lại/không đoán).
                sendTelemetry({ event: "LOCK", time: elapsedSec, key: bestResult.key, decisionScore: confidenceV2.combined });
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
