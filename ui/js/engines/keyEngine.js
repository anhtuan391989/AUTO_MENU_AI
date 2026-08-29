/* ==========================================================
   KEY ENGINE — tự quản lý toàn bộ việc dò Key (NNLS-style harmonic-template
   chroma + Bayesian-flavored cosine scoring, baseline V6_TOAN_PRO)
   -----------------------------------------------------------
   TASK A25 — thay THUẬT TOÁN trích/chấm điểm chroma (đã CHỨNG MINH BẰNG SỐ
   là nguyên nhân trực tiếp khiến Key=null/Mod=null: cách cũ "peak-picking +
   spectral whitening" + Musical Content Gate chặn đứng cả hợp âm sạch).
   TASK A34 — MARGIN_NORM_RANGE=0.10, Fast Path dùng confidenceV2.combined
   TASK A35 — Bass có điều kiện, Modal Evidence, Stability Lock, Modulation Detector
   ========================================================== */
const KeyEngine = (() => {
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    const KS_MAJOR_PROFILE = [1.000, 0.065, 0.630, 0.088, 0.710, 0.568, 0.095, 0.851, 0.075, 0.688, 0.098, 0.425];
    const KS_MINOR_PROFILE = [1.000, 0.072, 0.573, 0.782, 0.082, 0.571, 0.082, 0.851, 0.608, 0.082, 0.629, 0.082];

    const A4_HZ = 440.0;
    const HARMONIC_AMP = [1.0, 0.60, 0.42, 0.30, 0.20, 0.15, 0.10, 0.07];

    const CHROMA_SMOOTHING = 0.96;
    const CHROMA_SMOOTHING_FAST = 0.80;

    const MIN_CONFIDENCE = 0.35;
    const STABLE_CHECKS = 4;
    const CHECK_INTERVAL_MS = 1500;
    const VOTE_WINDOW = 8;
    const VOTE_MIN_AGREE = 5;
    const BASS_MAX_HZ = 260;
    const BASS_WEIGHT = 4;

    // === TASK A35 — Bass Boost có điều kiện: chỉ cộng khi chroma hỗ trợ tối thiểu ===
    const MIN_CHROMA_EVIDENCE = 0.05; // chroma[root] phải đạt mức này mới được cộng bassBoost

    const MUSICAL_CONTENT_MIN_ENERGY = 0.08;
    let hasMusicalContent = false;

    let frameCounter = 0;
    let firstEvidenceAt = null;
    let firstEvidenceFrame = null;
    let firstProvisionalAt = null;
    let firstProvisionalFrame = null;

    let chromaAnalyser = null;
    let chromaDataArray = null;
    let audioCtxRef = null;
    let chromaVector = new Array(12).fill(0);
    let chromaVectorFast = new Array(12).fill(0);
    let contentEnergyEMA = 0;

    let bassRootVotes = new Array(12).fill(0);

    let lastTop1Key = null;
    let lastTop1Label = null;
    let lastTop1ChangedAt = null;
    let lastLockedKey = null; // A35 — theo dõi Key đã khóa cuối cùng
    let candidateHistory = {}; // A35 — lưu lịch sử candidate để kiểm tra ổn định

    const BASS_VOTE_DECAY = 0.999;
    const BASS_ROOT_BOOST_WEIGHT = 0.5;

    // === TASK A35 — Stability Lock & Modulation Detector ===
    const STABILITY_REQUIRED_TICKS = 2; // candidate mới phải ổn định bao nhiêu tick trước khi đổi Key
    const MODULATION_MARGIN_GAIN = 1.0; // TASK A40 — hạ từ 1.5 xuống 1.0 (đã đo bằng trace thật: yêu
    // cầu margin mới PHẢI CAO HƠN margin cũ 50% là quá khắt khe cho 1 modulation thật giữa 2 hợp âm
    // rõ ràng như nhau — D#m thật có margin=0.143 so với baseline D Minor cũ ~0.12 (chỉ cao hơn ~19%,
    // không tới 50%) vẫn bị từ chối vĩnh viễn nếu giữ 1.5. Hạ xuống 1.0 nghĩa là chỉ còn yêu cầu margin
    // mới KHÔNG YẾU HƠN baseline cũ (không còn đòi hỏi phải "vượt trội"), vẫn là 1 sàn thật (không phải
    // bỏ hẳn kiểm tra). Bảo vệ chống flicker/dao động thoáng qua (Test E phần 2) vốn đã do CÁC CƠ CHẾ
    // KHÁC đảm nhiệm độc lập (vote count/elapsed/stability streak — flicker quá ngắn không đủ tích luỹ
    // đủ vote/streak để tới được bước kiểm tra này), không phụ thuộc chính vào hệ số 1.5 này.

    // === TASK A40 — Modal Evidence Floor (hiệu chỉnh bằng dữ liệu thật ở A39, ĐÃ SỬA LẠI cho đúng
    // đơn vị) ===
    // A38 chứng minh computeModalEvidence() là công thức TỶ LỆ không sàn tuyệt đối — rò rỉ harmonic
    // cực nhỏ vẫn cho ra modalConfidence=1.0 (tối đa), y hệt khi có quãng 3 THẬT.
    // QUAN TRỌNG: A39 hiệu chỉnh floor ban đầu (0.05) dựa trên chromaVector THÔ (trước
    // powerLawNormalize) — nhưng computeModalEvidence() thực ra nhận `chromaNorm` (đã qua
    // powerLawNormalize, luỹ thừa 0.67) làm tham số, KHÔNG PHẢI vector thô. Luỹ thừa 0.67 khuếch đại
    // bất cân xứng các giá trị nhỏ (vd 0.0058³·⁶⁷≈0.057 → sau normalize còn lớn hơn nhiều so với tỷ lệ
    // gốc) — nên floor 0.05 đo sai đơn vị, KHÔNG đủ cao cho 1 số root (đo thực tế thấy root F vẫn lọt
    // qua với modalConfidence=0.52 dù chưa hề có quãng 3 thật). Đã đo lại ĐÚNG đơn vị (chromaNorm,
    // đủ 12 root, cả 2 chroma vector Fast/Slow): No-Third tối đa = 0.0655 (root C); Major/Minor rõ tối
    // thiểu = 0.4929 (root G#) — khoảng cách ~7.5 lần, vẫn rõ ràng dù hẹp hơn số liệu sai đơn vị trước
    // đó. Chọn 0.18 — nằm giữa, cách đều cả 2 phía theo tỷ lệ (~2.75× so với No-Third max, ~2.74× dưới
    // Major/Minor min).
    const MODAL_EVIDENCE_FLOOR = 0.18;

    let running = false;
    let rafId = null;

    const levelListeners = [];
    const PROVISIONAL_INTERVAL_MS = 400;
    const provisionalListeners = [];
    let provisionalTimerId = null;

    function init(audioContext, sourceNode) {
        audioCtxRef = audioContext;
        chromaAnalyser = audioContext.createAnalyser();
        chromaAnalyser.fftSize = 8192;
        chromaAnalyser.smoothingTimeConstant = 0;
        sourceNode.connect(chromaAnalyser);
        chromaDataArray = new Float32Array(chromaAnalyser.frequencyBinCount);
        chromaVector = new Array(12).fill(0);
        chromaVectorFast = new Array(12).fill(0);
        contentEnergyEMA = 0;
        hasMusicalContent = false;
        bassRootVotes = new Array(12).fill(0);
        lastTop1Key = null;
        lastTop1Label = null;
        lastTop1ChangedAt = null;
        lastLockedKey = null;
        candidateHistory = {};

        frameCounter = 0;
        firstEvidenceAt = null;
        firstEvidenceFrame = null;
        firstProvisionalAt = null;
        firstProvisionalFrame = null;

        running = true;
        loop();
        startProvisionalTicker();
    }

    function frequencyToPitchClass(freq) {
        if (freq <= 0) return -1;
        const midi = 69 + 12 * Math.log2(freq / 440);
        return (((Math.round(midi) % 12) + 12) % 12);
    }

    function updateChromaVector() {
        if (!chromaAnalyser || !chromaDataArray) return;
        chromaAnalyser.getFloatFrequencyData(chromaDataArray);

        const sampleRate = audioCtxRef?.sampleRate || 48000;
        const binHz = sampleRate / chromaAnalyser.fftSize;
        const binCount = chromaDataArray.length;
        const frame = new Array(12).fill(0);
        const bassFrame = new Array(12).fill(0);

        for (let midi = 21; midi <= 108; midi++) {
            const pc = ((midi % 12) + 12) % 12;
            const fFun = A4_HZ * Math.pow(2, (midi - 69) / 12);
            if (fFun < 27 || fFun > 6000) continue;
            let energy = 0;
            for (let h = 0; h < HARMONIC_AMP.length; h++) {
                const fH = fFun * (h + 1);
                if (fH > sampleRate / 2) break;
                const bin = fH / binHz;
                const b0 = Math.floor(bin);
                const b1 = b0 + 1;
                if (b1 >= binCount) break;
                const frac = bin - b0;
                const db0 = chromaDataArray[b0];
                const db1 = chromaDataArray[b1];
                if (db0 <= -100 && db1 <= -100) continue;
                const amp0 = Math.pow(10, Math.max(-100, db0) / 20);
                const amp1 = Math.pow(10, Math.max(-100, db1) / 20);
                const amp = amp0 * (1 - frac) + amp1 * frac;
                energy += amp * HARMONIC_AMP[h];
            }
            frame[pc] += energy * energy;
            if (fFun <= BASS_MAX_HZ) bassFrame[pc] += energy;
        }

        const BIN_LO = Math.max(1, Math.ceil(50 / binHz));
        const BIN_HI = Math.min(binCount - 1, Math.floor(6000 / binHz));
        let contentRms = 0;
        const contentCount = BIN_HI - BIN_LO + 1;
        for (let b = BIN_LO; b <= BIN_HI; b++) {
            const amp = Math.pow(10, chromaDataArray[b] / 20);
            contentRms += amp * amp;
        }
        const frameHasContent = contentCount > 0 && Math.sqrt(contentRms / contentCount) > 0.0005;

        contentEnergyEMA = contentEnergyEMA * 0.9 + (frameHasContent ? 1 : 0) * 0.1;
        hasMusicalContent = contentEnergyEMA >= 0.5;
        frameCounter++;

        if (hasMusicalContent && firstEvidenceAt === null) {
            firstEvidenceAt = Date.now();
            firstEvidenceFrame = frameCounter;
            sendTelemetry({ event: "FIRST_EVIDENCE", frame: firstEvidenceFrame });
        }

        if (hasMusicalContent) {
            for (let i = 0; i < 12; i++) {
                chromaVector[i] = chromaVector[i] * CHROMA_SMOOTHING + frame[i] * (1 - CHROMA_SMOOTHING);
                chromaVectorFast[i] = chromaVectorFast[i] * CHROMA_SMOOTHING_FAST + frame[i] * (1 - CHROMA_SMOOTHING_FAST);
            }
        }

        let winnerPc = -1, winnerVal = 0;
        for (let i = 0; i < 12; i++) {
            if (bassFrame[i] > winnerVal) { winnerVal = bassFrame[i]; winnerPc = i; }
        }
        for (let i = 0; i < 12; i++) bassRootVotes[i] *= BASS_VOTE_DECAY;
        if (hasMusicalContent && winnerPc >= 0 && winnerVal > 0.01) bassRootVotes[winnerPc] += 1;

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

    function powerLawNormalize(vector) {
        const out = new Array(12).fill(0);
        let norm = 0;
        for (let i = 0; i < 12; i++) out[i] = Math.pow(Math.max(0, vector[i]), 0.67);
        for (let i = 0; i < 12; i++) norm += out[i] * out[i];
        norm = Math.sqrt(norm);
        if (norm > 0) for (let i = 0; i < 12; i++) out[i] /= norm;
        return out;
    }

    function cosineSimilarity12(a, b) {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < 12; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        return (na > 0 && nb > 0) ? dot / Math.sqrt(na * nb) : 0;
    }

    function rotateProfile(profile, steps) {
        const s = ((steps % 12) + 12) % 12;
        return profile.slice(12 - s).concat(profile.slice(0, 12 - s));
    }

    // === TASK A35 — Modal Evidence: đo khoảng cách 3rd để phân biệt Major/Minor ===
    function computeModalEvidence(chromaNorm, rootIndex) {
        // 3rd Minor = +3 bán âm từ Root; 3rd Major = +4 bán âm
        const min3rdIdx = (rootIndex + 3) % 12;
        const maj3rdIdx = (rootIndex + 4) % 12;
        const minorStrength = chromaNorm[min3rdIdx];
        const majorStrength = chromaNorm[maj3rdIdx];
        const total = minorStrength + majorStrength;
        // TASK A40 — sàn năng lượng tuyệt đối (A39 calibration). Trước bản vá này, "total" chỉ được
        // kiểm tra === 0 tuyệt đối (gần như không bao giờ đúng trong thực tế vì rò rỉ harmonic luôn
        // để lại 1 lượng cực nhỏ) — nên nhánh phòng thủ 0.5/0.5 gần như không bao giờ kích hoạt. Mở
        // rộng điều kiện sang "total < MODAL_EVIDENCE_FLOOR" để nhánh phòng thủ này hoạt động đúng ý
        // định ban đầu: khi KHÔNG đủ bằng chứng (total quá nhỏ), coi Major/Minor ngang nhau
        // (modalConfidence=0) thay vì để tỷ lệ khuếch đại nhiễu thành "tự tin tuyệt đối".
        if (total === 0 || total < MODAL_EVIDENCE_FLOOR) return { minorStrength: 0.5, majorStrength: 0.5, modalConfidence: 0 };
        return {
            minorStrength: minorStrength / total,
            majorStrength: majorStrength / total,
            modalConfidence: Math.abs(majorStrength - minorStrength) / total
        };
    }

    // === TASK A35 — Stability Check: candidate đã xuất hiện đủ số tick liên tiếp chưa? ===
    function updateCandidateHistory(candidateKey) {
        if (!candidateHistory[candidateKey]) {
            candidateHistory = {};
            candidateHistory[candidateKey] = 1;
        } else {
            candidateHistory[candidateKey]++;
        }
        // Xóa các candidate khác không còn xuất hiện
        for (const key in candidateHistory) {
            if (key !== candidateKey) candidateHistory[key] = Math.max(0, candidateHistory[key] - 1);
        }
        return candidateHistory[candidateKey] >= STABILITY_REQUIRED_TICKS;
    }

    // === TASK A35 — Modulation Check: có phải thay đổi thật hay chỉ dao động? ===
    function isTrueModulation(oldKey, newKey, newMargin, avgMarginHistory) {
        if (!oldKey || oldKey === newKey) return true;
        // Margin mới phải rõ ràng hơn trung bình cũ
        return newMargin > avgMarginHistory * MODULATION_MARGIN_GAIN;
    }

    function estimateKeyFromChroma(sourceVector) {
        const vector = sourceVector || chromaVector;
        const maxBassVotes = Math.max(...bassRootVotes, 1e-9);
        const chromaNorm = powerLawNormalize(vector);

        let best = { score: -Infinity, root: 0, mode: "Major", modalEvidence: null };
        const allScores = [];

        for (let root = 0; root < 12; root++) {
            const bassAgreement = bassRootVotes[root] / maxBassVotes;
            // === TASK A35 — Bass Boost có điều kiện ===
            const bassSupport = chromaNorm[root];
            const bassBoost = bassSupport >= MIN_CHROMA_EVIDENCE
                ? bassAgreement * BASS_ROOT_BOOST_WEIGHT
                : 0; // Không hỗ trợ chroma → không được cộng điểm bass

            // === TASK A35 — Modal Evidence tính và điều chỉnh điểm ===
            const modalEv = computeModalEvidence(chromaNorm, root);

            let majorScore = (cosineSimilarity12(chromaNorm, rotateProfile(KS_MAJOR_PROFILE, root)) + 1) / 2 + bassBoost;
            let minorScore = (cosineSimilarity12(chromaNorm, rotateProfile(KS_MINOR_PROFILE, root)) + 1) / 2 + bassBoost;

            // === TASK A35 — Tăng điểm theo bằng chứng 3rd phù hợp ===
            const MODAL_BOOST = 0.08; // đủ để phân biệt, không lấn áp correlation
            majorScore += modalEv.majorStrength * MODAL_BOOST;
            minorScore += modalEv.minorStrength * MODAL_BOOST;

            if (majorScore > best.score) best = { score: majorScore, root, mode: "Major", modalEvidence: modalEv };
            if (minorScore > best.score) best = { score: minorScore, root, mode: "Minor", modalEvidence: modalEv };

            allScores.push({ score: majorScore, root, mode: "Major", bassAgreement });
            allScores.push({ score: minorScore, root, mode: "Minor", bassAgreement });
        }

        allScores.sort((a, b) => b.score - a.score);
        const top1 = allScores[0];
        const top2 = allScores[1];
        const margin = top1.score - top2.score;

        const gatedConfidence = hasMusicalContent ? best.score : 0;

        return {
            key: `${NOTE_NAMES[best.root]} ${best.mode}`,
            rootIndex: best.root,
            mode: best.mode,
            confidence: gatedConfidence,
            confidencePercent: Math.round(Math.max(0, Math.min(1, gatedConfidence)) * 100),
            hasMusicalContent,
            top1,
            top2,
            margin,
            bassAgreement: top1.bassAgreement,
            modalEvidence: best.modalEvidence // Thêm bằng chứng modal vào kết quả
        };
    }

    function shortestSemitoneDelta(fromIndex, toIndex) {
        let delta = (toIndex - fromIndex + 12) % 12;
        if (delta > 6) delta -= 12;
        return delta;
    }

    const MIN_ELAPSED_BEFORE_LOCK_MS = 15000;
    const FAST_LOCK_MIN_ELAPSED_MS = 3000;
    const ADAPTIVE_LOCK_CONFIDENCE = 0.80;
    const ADAPTIVE_LOCK_STREAK_REQUIRED = 3;

    const FAST_PATH_INTERVAL_MS = PROVISIONAL_INTERVAL_MS;
    const FAST_PATH_MIN_ELAPSED_MS = 1200;
    const FAST_PATH_STREAK_REQUIRED = 3;
    const FAST_PATH_MIN_CONFIDENCE = ADAPTIVE_LOCK_CONFIDENCE;

    function formatElapsedSeconds(ms) {
        return (ms / 1000).toFixed(1);
    }

    function formatCandidate(candidate) {
        if (!candidate) return "?";
        return `${NOTE_NAMES[candidate.root]} ${candidate.mode} (${candidate.score.toFixed(2)})`;
    }

    function candidateLabel(candidate) {
        if (!candidate) return null;
        return `${NOTE_NAMES[candidate.root]} ${candidate.mode}`;
    }

    function sendTelemetry(record) {
        if (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.sendTelemetry === "function") {
            window.electronAPI.sendTelemetry(record);
        }
    }

    function logMarginSnapshot(result, startedAt, bestCount, locked, stability, confidenceV2, top1StableMs, note) {
        const lines = [
            `[KeyEngine] Time: ${formatElapsedSeconds(Date.now() - startedAt)}s`,
            `  Top1: ${formatCandidate(result.top1)}`,
            `  Top2: ${formatCandidate(result.top2)}`,
            `  Margin: ${typeof result.margin === "number" ? result.margin.toFixed(2) : "?"}`,
            `  Stability: ${typeof stability === "number" ? stability.toFixed(2) : "?"}`,
            `  Top1 Stable: ${formatElapsedSeconds(top1StableMs)}s`,
            `  Confidence: ${result.confidence.toFixed(2)}`,
            `  DecisionScore: ${confidenceV2.combined.toFixed(2)}`,
            `  Key: ${result.key}`,
            `  Votes: ${bestCount}/${VOTE_MIN_AGREE}`,
            `  Locked: ${locked ? "Yes" : "No"}${note ? ` (${note})` : ""}`,
            `  ConfidenceV2: ${JSON.stringify(confidenceV2)}`
        ];
        console.log(lines.join("\n"));
    }

    function computeStability(bestCount, windowSize) {
        if (!windowSize) return 0;
        const agreement = bestCount / windowSize;
        return agreement * agreement;
    }

    function updateTop1StabilityTimer(top1) {
        const currentKey = `${top1.root}-${top1.mode}`;
        const currentLabel = candidateLabel(top1);
        const now = Date.now();

        let changed = false;
        let previousLabel = null;

        if (currentKey !== lastTop1Key) {
            previousLabel = lastTop1Label;
            changed = lastTop1Key !== null;
            lastTop1Key = currentKey;
            lastTop1Label = currentLabel;
            lastTop1ChangedAt = now;
        }

        return { stableMs: now - lastTop1ChangedAt, changed, from: previousLabel, to: currentLabel };
    }

    function clamp01(x) {
        return Math.max(0, Math.min(1, x));
    }

    const PEARSON_NORM_MAX = 1 + BASS_ROOT_BOOST_WEIGHT;
    const MARGIN_NORM_RANGE = 0.10; // A34 — đã hiệu chỉnh bằng dữ liệu thật

    function buildConfidenceV2(result, stability) {
        const pearson = result.confidence;
        const pearsonNorm = clamp01(pearson / PEARSON_NORM_MAX);

        const margin = result.margin;
        const marginNorm = clamp01(margin / MARGIN_NORM_RANGE);

        const stabilityNorm = clamp01(stability);

        const bassAgreement = result.bassAgreement;
        const bassNorm = clamp01(bassAgreement);

        // === A35 — Thêm bằng chứng Modal vào confidenceV2 ===
        const modalStrength = result.modalEvidence ? result.modalEvidence.modalConfidence : 0;
        const modalNorm = clamp01(modalStrength);

        // 5 thành phần: pearson, margin, stability, bass, modal — trọng số bằng nhau
        const combined = (pearsonNorm + marginNorm + stabilityNorm + bassNorm + modalNorm) / 5;

        const ambiguity = 1 - marginNorm;

        return { pearson, pearsonNorm, margin, marginNorm, stability, stabilityNorm, bassAgreement, bassNorm, modalNorm, combined, ambiguity };
    }

    function runVoteLoop(onWinner) {
        const voteWindow = [];
        const startedAt = Date.now();
        let highConfidenceStreak = 0;
        let marginHistory = []; // A35 — theo dõi margin trung bình để phát hiện modulation thật

        let fastPathStreak = 0;
        let fastPathStreakKey = null;
        let fastPathLastFiredKey = null;

        function stopBoth() {
            clearInterval(timer);
            clearInterval(fastTimer);
        }

        const fastTimer = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            if (elapsed < FAST_PATH_MIN_ELAPSED_MS) return;

            const result = estimateKeyFromChroma(chromaVectorFast);

            if (!hasMusicalContent || result.confidence < MIN_CONFIDENCE) {
                fastPathStreak = 0;
                fastPathStreakKey = null;
                fastPathLastFiredKey = null;
                return;
            }

            const candidateKey = `${result.rootIndex}-${result.mode}`;

            // === A35 — Stability Check: candidate phải ổn định đủ tick ===
            const candidateStable = updateCandidateHistory(candidateKey);

            if (candidateKey === fastPathStreakKey) {
                fastPathStreak++;
            } else {
                fastPathStreakKey = candidateKey;
                fastPathStreak = 1;
            }

            if (fastPathStreak < FAST_PATH_STREAK_REQUIRED) return;

            const fastStability = computeStability(Math.min(fastPathStreak, FAST_PATH_STREAK_REQUIRED), FAST_PATH_STREAK_REQUIRED);
            const fastConfidenceV2 = buildConfidenceV2(result, fastStability);

            // === A35 + A34: confidenceV2.combined làm gate thật ===
            if (fastConfidenceV2.combined < FAST_PATH_MIN_CONFIDENCE) {
                return;
            }

            // === A35: Modulation Check trước khi khóa Key mới ===
            const avgMargin = marginHistory.length > 0 ? marginHistory.reduce((a, b) => a + b, 0) / marginHistory.length : 0.05;
            const currentFullKey = `${result.rootIndex}-${result.mode}`;
            const isNewKey = lastLockedKey !== currentFullKey;
            const modulationOk = !isNewKey || (candidateStable && isTrueModulation(lastLockedKey, currentFullKey, result.margin, avgMargin));

            if (!modulationOk) {
                return; // Coi là dao động, không đổi Key
            }

            if (candidateKey === fastPathLastFiredKey) return;
            fastPathLastFiredKey = candidateKey;
            lastLockedKey = currentFullKey; // Cập nhật Key đã khóa

            logMarginSnapshot(result, startedAt, fastPathStreak, true, fastStability, fastConfidenceV2, fastPathStreak * FAST_PATH_INTERVAL_MS, "khoá qua đường: fast-path (A35+modal+stability)");

            sendTelemetry({
                event: "LOCK", time: parseFloat(formatElapsedSeconds(elapsed)), key: result.key,
                decisionScore: fastConfidenceV2.combined, reason: "fast-path-A35",
                frame: frameCounter, framesToStable: frameCounter,
                firstEvidenceAt, firstEvidenceFrame, firstProvisionalAt, firstProvisionalFrame
            });
            onWinner(result, fastPathStreak, stopBoth);
        }, FAST_PATH_INTERVAL_MS);

        const timer = setInterval(() => {
            const result = estimateKeyFromChroma();

            const top1Update = updateTop1StabilityTimer(result.top1);
            const top1StableMs = top1Update.stableMs;
            const elapsedSec = parseFloat(formatElapsedSeconds(Date.now() - startedAt));

            if (top1Update.changed) {
                sendTelemetry({ event: "TOP1_CHANGED", from: top1Update.from, to: top1Update.to, time: elapsedSec });
            }

            if (result.confidence < MIN_CONFIDENCE) {
                const cv2Rejected = buildConfidenceV2(result, 0);
                logMarginSnapshot(result, startedAt, 0, false, 0, cv2Rejected, top1StableMs, "dưới MIN_CONFIDENCE");
                sendTelemetry({
                    time: elapsedSec, top1: candidateLabel(result.top1), top2: candidateLabel(result.top2),
                    confidence: result.confidence, margin: result.margin, stability: 0,
                    top1Stable: top1StableMs / 1000, decisionScore: cv2Rejected.combined,
                    votes: 0, window: voteWindow.length, locked: false
                });
                highConfidenceStreak = 0;
                return;
            }

            // TASK A40 — sửa lỗi tự-bão-hoà của A37: trước bản vá này, marginHistory nhận margin của
            // MỌI tick vô điều kiện, kể cả các tick đã thuộc về candidate MỚI (đang chờ xác nhận
            // modulation). Một khi modulation thật xảy ra và margin mới ổn định đủ lâu, avgMarginHistory
            // hội tụ về CHÍNH margin mới đó, khiến `newMargin > avgMarginHistory × GAIN` KHÔNG BAO GIỜ
            // đúng nữa (đã chứng minh bằng đại số ở A37) — modulation thật SAU KHI đã có 1 lần khoá
            // trước đó sẽ không bao giờ được xác nhận. Sửa: chỉ tích luỹ marginHistory khi tick НÀY
            // còn khớp với Key ĐANG khoá (`lastLockedKey`) — tức đây vẫn là baseline của Key CŨ, chưa
            // bị "ô nhiễm" bởi margin của candidate mới. Ngay khi 1 tick cho ra candidate KHÁC
            // lastLockedKey (bắt đầu nghi ngờ có modulation), việc tích luỹ TẠM DỪNG — giữ nguyên
            // baseline cũ để so sánh công bằng — cho tới khi modulation được XÁC NHẬN THẬT (lastLockedKey
            // cập nhật), lúc đó vòng tích luỹ mới bắt đầu lại cho Key mới.
            const tickFullKey = `${result.rootIndex}-${result.mode}`;
            if (lastLockedKey === null || tickFullKey === lastLockedKey) {
                marginHistory.push(result.margin);
                if (marginHistory.length > 10) marginHistory.shift();
            }

            voteWindow.push({ key: `${result.rootIndex}-${result.mode}`, result });
            if (voteWindow.length > VOTE_WINDOW) voteWindow.shift();

            const counts = {};
            let bestKey = null, bestCount = 0, bestResult = null;
            voteWindow.forEach((v) => {
                counts[v.key] = (counts[v.key] || 0) + 1;
                if (counts[v.key] > bestCount) { bestCount = counts[v.key]; bestKey = v.key; bestResult = v.result; }
            });

            const stability = computeStability(bestCount, voteWindow.length);
            const elapsed = Date.now() - startedAt;
            const confidenceV2 = buildConfidenceV2(result, stability);

            // === TASK A40 — sàn marginNorm cho vote-window ===
            // A37 từng chứng minh: gắn thẳng ngưỡng marginNorm (ý tưởng gốc từ patch A35 bị reject,
            // keyEngine.js.rej) vào đây KHÔNG đủ, vì lúc đó marginNorm bị THỔI PHỒNG giả bởi chính lỗi
            // computeModalEvidence() (A38) — power chord A# đo được marginNorm=0.741, vượt xa 0.30.
            // Sau khi MODAL_EVIDENCE_FLOOR (phía trên) sửa gốc rễ, đã ĐO LẠI THẬT trên ĐỦ 12 root
            // (không chỉ A#, đúng tinh thần A39): margin dư của power chord (root+fifth, không quãng 3,
            // modal evidence đã trung hoà) dao động 0.0020–0.0568 tuỳ root (root D/F cao nhất ~0.057) —
            // 0.30 KHÔNG đủ cao để chặn các root này (C đo được marginNorm=0.32, D/F ~0.57, vẫn vượt
            // 0.30 và khoá sai). Trong khi đó margin của Major/Minor THẬT (đủ 12 root) không bao giờ
            // thấp hơn 0.1654 (marginNorm=1.0, bị clamp). Ngưỡng 0.90 (marginNorm, tương đương margin
            // thô ~0.09) nằm giữa 2 vùng này: cách trần power-chord cao nhất (~0.057) ~1.6 lần, cách sàn
            // Major/Minor thật thấp nhất (~0.165) ~1.8 lần — biên độ an toàn cân bằng ở cả 2 phía, dựa
            // trên dữ liệu đo thật trên toàn bộ 12 root, không phải suy đoán từ 1 root duy nhất.
            const VOTE_WINDOW_MIN_MARGIN_NORM = 0.90;
            const willLockByVote = bestCount >= VOTE_MIN_AGREE && elapsed >= MIN_ELAPSED_BEFORE_LOCK_MS && confidenceV2.marginNorm >= VOTE_WINDOW_MIN_MARGIN_NORM;

            if (bestCount >= VOTE_MIN_AGREE && confidenceV2.combined >= ADAPTIVE_LOCK_CONFIDENCE) {
                highConfidenceStreak++;
            } else {
                highConfidenceStreak = 0;
            }
            const willLockByAdaptive = elapsed >= FAST_LOCK_MIN_ELAPSED_MS && highConfidenceStreak >= ADAPTIVE_LOCK_STREAK_REQUIRED;

            // === A35 — Modulation Check cho đường chậm ===
            const avgMargin = marginHistory.reduce((a, b) => a + b, 0) / marginHistory.length;
            const isNewKey = lastLockedKey !== bestKey;
            const modulationOk = !isNewKey || isTrueModulation(lastLockedKey, bestKey, result.margin, avgMargin);

            const willLock = (willLockByVote || willLockByAdaptive) && modulationOk;
            const lockReason = !modulationOk ? "delay-stability" : willLockByAdaptive && !willLockByVote ? "adaptive" : "vote-window";

            if (willLock && modulationOk) {
                lastLockedKey = bestKey;
            }

            logMarginSnapshot(result, startedAt, bestCount, willLock, stability, confidenceV2, top1StableMs, willLock ? `khoá qua đường: ${lockReason}` : undefined);

            sendTelemetry({
                time: elapsedSec, top1: candidateLabel(result.top1), top2: candidateLabel(result.top2),
                confidence: result.confidence, margin: result.margin, stability,
                top1Stable: top1StableMs / 1000, decisionScore: confidenceV2.combined,
                votes: bestCount, window: voteWindow.length, locked: willLock, highConfidenceStreak
            });

            if (willLock) {
                sendTelemetry({
                    event: "LOCK", time: elapsedSec, key: bestResult.key, decisionScore: confidenceV2.combined, reason: lockReason,
                    frame: frameCounter, framesToStable: frameCounter,
                    firstEvidenceAt, firstEvidenceFrame, firstProvisionalAt, firstProvisionalFrame
                });
                onWinner(bestResult, bestCount, stopBoth);
            }
        }, CHECK_INTERVAL_MS);

        return stopBoth;
    }

    function detectOnce(onStable) {
        return runVoteLoop((result, count, stop) => {
            stop();
            onStable(result);
        });
    }

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

    function startProvisionalTicker() {
        stopProvisionalTicker();
        provisionalTimerId = setInterval(() => {
            const result = estimateKeyFromChroma(chromaVectorFast);
            if (result.confidence < MIN_CONFIDENCE) return;
            if (firstProvisionalAt === null) {
                firstProvisionalAt = Date.now();
                firstProvisionalFrame = frameCounter;
                sendTelemetry({ event: "FIRST_PROVISIONAL", frame: firstProvisionalFrame, key: result.key, confidence: result.confidence });
            }
            provisionalListeners.forEach((cb) => cb({ key: result.key, confidence: result.confidence }));
        }, PROVISIONAL_INTERVAL_MS);
    }

    function stopProvisionalTicker() {
        if (provisionalTimerId) {
            clearInterval(provisionalTimerId);
            provisionalTimerId = null;
        }
    }

    function onProvisionalEstimate(cb) { provisionalListeners.push(cb); }

    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        stopProvisionalTicker();
    }

    function onLevel(cb) { levelListeners.push(cb); }

    function getDebugSnapshot() {
        return {
            chromaVector: chromaVector.slice(), chromaVectorFast: chromaVectorFast.slice(), bassRootVotes: bassRootVotes.slice(),
            frameCounter, hasMusicalContent, contentEnergyEMA,
            firstEvidenceAt, firstEvidenceFrame, firstProvisionalAt, firstProvisionalFrame
        };
    }

    return {
        init, stop, detectOnce, watchContinuous, estimateKeyFromChroma,
        shortestSemitoneDelta, onLevel, onProvisionalEstimate, NOTE_NAMES, MIN_CONFIDENCE, getDebugSnapshot,
    };
})();

window.KeyEngine = KeyEngine;