/* ==========================================================
   BPM ENGINE — tự quản lý toàn bộ việc dò nhịp (BPM)
   -----------------------------------------------------------
   Độc lập hoàn toàn với KeyEngine/ModEngine: có analyser riêng, vòng lặp
   riêng (requestAnimationFrame riêng), state riêng. Chỉ chia sẻ chung
   AudioContext + source node do renderer.js tạo ra 1 lần (tránh mở 2 lần
   getUserMedia cho cùng 1 thiết bị), còn lại tự lo hết phần của mình.

   Cách dùng từ renderer.js:
     BPMEngine.init(audioContext, sourceNode);
     BPMEngine.onUpdate((bpm) => { ...cập nhật Dashboard... });
     BPMEngine.stop();
   ========================================================== */
const BPMEngine = (() => {
    let analyser = null;
    let dataArray = null;
    let timeDataArray = null; // VU METER V2 — buffer RIÊNG cho time-domain data (RMS), KHÔNG dùng chung
                               // với dataArray (frequency-domain, dùng cho flux/beat) — cùng 1 AnalyserNode
                               // vẫn phục vụ được cả 2 loại getter (getByteFrequencyData/getByteTimeDomainData),
                               // KHÔNG cần tạo AnalyserNode/stream/AudioContext thứ hai.
    let running = false;
    let rafId = null;

    let beatTimes = [];
    let lastEnergy = 0;
    let lastBeatTime = 0;
    let prevSpectrum = null; // khung phổ TRƯỚC đó, dùng để tính spectral flux

    // Ngưỡng THÍCH ỨNG thay vì số cứng — mỗi thiết bị/mỗi bài có mức tín hiệu khác nhau.
    let bassEnergyHistory = [];
    const BASS_HISTORY_SIZE = 43; // ~0.7s ở 60fps
    const BASS_NOISE_FLOOR = 2;

    // Số bin phổ dùng để tính flux — bao trùm rộng hơn hẳn 5 bin bass cũ (khoảng 0-2.6kHz
    // với fftSize=2048 ở 48kHz), để bắt được tiếng trống/hi-hat/snare chứ không chỉ bass.
    const FLUX_BIN_COUNT = 220;

    // Bỏ phiếu để không nhảy số theo 1 lần đo lẻ bị nhiễu.
    let bpmVoteHistory = [];
    const BPM_VOTE_WINDOW = 15;
    const BPM_VOTE_MIN_AGREE = 5;

    let lastConfirmedBpm = null;
    let lastCandidateBpm = null; // TASK A73-03 — BPM ứng viên gần nhất (có thể CHƯA đủ tin cậy)
    let lastConfidence = null;   // TASK A73-03 — {bpm, voteCount, intervalCV, confidence, stable, sampleCount}
    const listeners = [];      // callback(bpm) khi có kết quả mới đủ tin cậy
    const confidenceListeners = []; // TASK A73-03 — callback(lastConfidence) MỖI lần có ứng viên mới, kể cả chưa "stable"
    const levelListeners = []; // callback({bassEnergy, localAvg, maxByte, vuPercent, rms, dbfs}) mỗi khung

    // === VU METER V2 (Section 6/7/11/12) — metric HOÀN TOÀN TÁCH BIỆT với bassEnergy/flux ở trên.
    // BPM metric (flux) đo "độ đột biến phổ" — dùng cho beat detection, KHÔNG ĐỔI GÌ, vẫn nguyên
    // xi từ dòng này trở lên. VU metric (RMS/dBFS) đo "mức năng lượng tín hiệu thật" trên miền
    // thời gian (time-domain) — đúng bản chất 1 VU/level meter cần có, khác hẳn spectral flux.
    // Đọc từ CHÍNH analyser đã có (analyser.getByteTimeDomainData) — không tạo analyser/stream mới.
    const VU_DB_FLOOR = -50;  // dBFS coi như "im lặng" -> 0% (ngưỡng khởi điểm, tinh chỉnh khi có log thật)
    const VU_DB_CEILING = -6; // dBFS gần full-scale nhưng chừa headroom -> 100%
    let vuSmoothedPercent = 0; // state RIÊNG cho VU display, KHÔNG ảnh hưởng bassEnergyHistory/flux
    const VU_ATTACK = 0.5;  // lên nhanh (đúng ballistics VU thật: bắt kịp transient tức thời)
    const VU_RELEASE = 0.85; // xuống chậm hơn (không giật/nhấp nháy liên tục)

    function computeRmsDbfsPercent(timeData) {
        let sumSquares = 0;
        let peak = 0; // VU METER V2.1 — biên độ TUYỆT ĐỐI lớn nhất trong khung (time-domain, cùng đơn vị
                       // với rms/dbfs — KHÁC maxByte ở trên vốn là frequency-domain của flux). Tính trong
                       // CÙNG 1 vòng lặp đã có sẵn (không thêm vòng lặp/allocate mới).
        for (let i = 0; i < timeData.length; i++) {
            const sample = (timeData[i] - 128) / 128; // Uint8 time-domain, 128 = 0 (trung tâm)
            sumSquares += sample * sample;
            const abs = Math.abs(sample);
            if (abs > peak) peak = abs;
        }
        const rms = Math.sqrt(sumSquares / timeData.length); // 0..1
        const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        const clampedDb = Math.max(VU_DB_FLOOR, Math.min(VU_DB_CEILING, dbfs === -Infinity ? VU_DB_FLOOR : dbfs));
        const percent = ((clampedDb - VU_DB_FLOOR) / (VU_DB_CEILING - VU_DB_FLOOR)) * 100;
        return { rms, dbfs, peak, percent: Math.max(0, Math.min(100, percent)) };
    }

    function init(audioContext, sourceNode) {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // nhỏ, cập nhật nhanh -> phù hợp dò BEAT (cần độ trễ thấp)
        sourceNode.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        timeDataArray = new Uint8Array(analyser.fftSize); // VU METER V2 — buffer time-domain, cấp phát 1 LẦN

        beatTimes = [];
        bassEnergyHistory = [];
        bpmVoteHistory = [];
        lastEnergy = 0;
        lastBeatTime = 0;
        lastConfirmedBpm = null;
        lastCandidateBpm = null; // TASK A73-03 — reset khi đổi nguồn, không giữ confidence của nguồn cũ
        lastConfidence = null;
        prevSpectrum = null;
        vuSmoothedPercent = 0; // VU METER V2 — reset riêng, không đụng biến BPM nào ở trên

        running = true;
        loop();
    }

    function loop() {
        if (!running || !analyser || !dataArray) return;
        analyser.getByteFrequencyData(dataArray);

        // SPECTRAL FLUX: tổng phần TĂNG (so với khung trước) trên nhiều bin tần số —
        // đúng nguyên lý "onset detection" chuẩn ngành, nhạy với TIẾNG ĐÁNH (trống, snare,
        // hi-hat, pluck) chứ không chỉ mức bass tuyệt đối. Khác với đo bass thô: 1 tiếng
        // bass GIỮ ĐỀU liên tục (không tăng thêm) sẽ KHÔNG tính là beat — chỉ tính khi có
        // thay đổi đột ngột, đúng bản chất của 1 nhịp trống thật.
        const binCount = Math.min(FLUX_BIN_COUNT, dataArray.length);
        if (!prevSpectrum || prevSpectrum.length !== binCount) {
            prevSpectrum = new Float32Array(binCount);
        }

        let flux = 0;
        for (let i = 0; i < binCount; i++) {
            const diff = dataArray[i] - prevSpectrum[i];
            if (diff > 0) flux += diff; // chỉ cộng phần TĂNG, phần giảm bỏ qua (chuẩn spectral flux)
            prevSpectrum[i] = dataArray[i];
        }
        flux /= binCount; // chuẩn hoá theo số bin

        const bassEnergy = flux; // giữ tên biến để phần debug/ngưỡng bên dưới không phải đổi

        // So với trung bình các khung TRƯỚC đó (chưa gồm khung hiện tại) — nếu tính cả khung
        // hiện tại vào trước khi so sánh, chính cú đánh trống sẽ tự kéo luôn trung bình lên theo.
        const localAvg = bassEnergyHistory.length > 0
            ? bassEnergyHistory.reduce((a, b) => a + b, 0) / bassEnergyHistory.length
            : bassEnergy;

        bassEnergyHistory.push(bassEnergy);
        if (bassEnergyHistory.length > BASS_HISTORY_SIZE) bassEnergyHistory.shift();

        let maxByte = 0;
        for (let i = 0; i < dataArray.length; i++) if (dataArray[i] > maxByte) maxByte = dataArray[i];

        // === VU METER V2 — đọc time-domain data TỪ CHÍNH analyser này (không phải dataArray ở
        // trên, vốn là frequency-domain của flux). 2 lần gọi getter khác nhau trên CÙNG 1
        // AnalyserNode, không cần AnalyserNode/stream thứ hai. Hoàn toàn KHÔNG dùng bassEnergy/flux.
        analyser.getByteTimeDomainData(timeDataArray);
        const { rms, dbfs, peak, percent: rawVuPercent } = computeRmsDbfsPercent(timeDataArray);

        // Smoothing RIÊNG cho VU display (ballistics attack/release) — biến `vuSmoothedPercent`
        // không được đọc/ghi bởi bất kỳ logic BPM/beat nào ở trên hay dưới.
        const vuAlpha = rawVuPercent > vuSmoothedPercent ? VU_ATTACK : VU_RELEASE;
        vuSmoothedPercent = vuSmoothedPercent * vuAlpha + rawVuPercent * (1 - vuAlpha);

        levelListeners.forEach((cb) => cb({ bassEnergy, localAvg, maxByte, rms, dbfs, peak, vuPercent: vuSmoothedPercent }));

        const isBeat =
            bassEnergy > BASS_NOISE_FLOOR &&
            bassEnergy > localAvg * 1.5 &&
            bassEnergy > lastEnergy;

        if (isBeat) {
            const now = Date.now();
            const interval = now - lastBeatTime;

            if (interval > 300) {
                lastBeatTime = now;
                beatTimes.push(interval);
                if (beatTimes.length > 10) beatTimes.shift();

                const avgInterval = beatTimes.reduce((a, b) => a + b) / beatTimes.length;
                let bpm = 60000 / avgInterval;

                // Chuẩn hoá quãng tám: ép về dải phổ biến nhất (90-179 BPM), tránh báo
                // nửa/gấp đôi nhịp thật.
                while (bpm < 90 && bpm > 0) bpm *= 2;
                while (bpm > 179) bpm /= 2;
                bpm = Math.round(bpm);

                if (bpm >= 60 && bpm <= 200) {
                    bpmVoteHistory.push(bpm);
                    if (bpmVoteHistory.length > BPM_VOTE_WINDOW) bpmVoteHistory.shift();

                    const counts = {};
                    let bestBpm = bpm, bestCount = 0;
                    bpmVoteHistory.forEach((v) => {
                        for (const cand of [v, v - 1, v + 1]) {
                            // TASK A72-04 — thứ tự duyệt ứng viên đổi từ (v-1, v, v+1) sang (v, v-1, v+1):
                            // với toán tử `>` nghiêm ngặt, ứng viên duyệt TRƯỚC thắng khi hoà số phiếu. Bản cũ
                            // duyệt v-1 trước nên tín hiệu sạch 120 BPM luôn ra 119 (thiên lệch -1 BPM hệ
                            // thống, đo được ở 100/120/128/140 — xem A72-REPORT.md mục BPM, số đo TRƯỚC sửa).
                            // Nay giá trị phiếu THẬT thắng khi hoà. Dung sai ±1 gom phiếu KHÔNG đổi.
                            counts[cand] = (counts[cand] || 0) + 1;
                            if (counts[cand] > bestCount) { bestCount = counts[cand]; bestBpm = cand; }
                        }
                    });

                    if (bestCount >= BPM_VOTE_MIN_AGREE) {
                        // TASK A73-03 — BPM CONFIDENCE CONTRACT (đề xuất, chưa phải tiêu chuẩn chính
                        // thức của dự án — xem A73-REPORT.md mục BPM confidence để Khói duyệt ngưỡng).
                        //
                        // Vấn đề từ A72: nhịp beat khoảng cách NGẪU NHIÊN (0.3-1.3s) vẫn có lúc đạt đủ
                        // bestCount>=5/15 phiếu ±1 nhờ trùng hợp thống kê, và bị "confirmed" (151 BPM)
                        // dù không hề có tempo ổn định thật. bestCount đo ĐỘ NHẤT QUÁN GIỮA CÁC ỨNG
                        // VIÊN nhưng KHÔNG đo được ĐỘ ỔN ĐỊNH THỜI GIAN giữa các beat — 2 đặc trưng khác
                        // nhau, cần CẢ HAI mới đủ. Bổ sung: hệ số biến thiên (coefficient of variation)
                        // của beatTimes — đo trực tiếp "khoảng cách giữa các beat lệch nhau bao nhiêu %".
                        // Nhịp thật ổn định: CV thấp (<10-15%). Nhịp ngẫu nhiên: CV cao (thường >25%).
                        const n = beatTimes.length;
                        const mean = avgInterval;
                        const variance = beatTimes.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
                        const stddev = Math.sqrt(variance);
                        const intervalCV = mean > 0 ? stddev / mean : 1;

                        // Ngưỡng TẠM THỜI (đề xuất, KHÔNG PHẢI tiêu chuẩn chính thức — cần Khói duyệt
                        // bằng log tín hiệu nhạc thật trước khi coi là chốt). Căn cứ: CV của nhịp đều
                        // đặn (jitter máy đo ±1 khung ở 60fps trên khoảng beat ~500ms) rơi vào ~2-5%;
                        // CV của test "nhịp ngẫu nhiên 0.3-1.3s" (A72AiLifecycle.verify.js) đo được
                        // thường >25%. Chọn 15% làm mốc giữa, thiên về AN TOÀN (thà báo "chưa ổn định"
                        // oan còn hơn khoá nhầm 1 con số sai).
                        const BPM_CV_CONFIRM_THRESHOLD_TENTATIVE = 0.15;
                        const stable = intervalCV <= BPM_CV_CONFIRM_THRESHOLD_TENTATIVE;
                        const confidence = Math.max(0, Math.min(1, 1 - intervalCV / BPM_CV_CONFIRM_THRESHOLD_TENTATIVE * 0.5));

                        lastCandidateBpm = bestBpm;
                        lastConfidence = { bpm: bestBpm, voteCount: bestCount, intervalCV, confidence, stable, sampleCount: n };
                        confidenceListeners.forEach((cb) => cb(lastConfidence));

                        // CHỈ "confirmed" (bắn onUpdate cũ, ảnh hưởng UI/IPC) khi CẢ vote LẪN CV đạt —
                        // đúng yêu cầu A73-03 "không công bố BPM ổn định khi tín hiệu chưa đáp ứng tiêu
                        // chí confidence". Không đổi ý nghĩa/chữ ký onUpdate(bpm) — vẫn 1 số, để không
                        // phá vỡ nơi gọi hiện có (renderer.js) — muốn cả object thì dùng onConfidence().
                        if (stable) {
                            lastConfirmedBpm = bestBpm;
                            listeners.forEach((cb) => cb(bestBpm));
                        }
                    }
                }
            }
        }

        lastEnergy = bassEnergy;
        rafId = requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        // TASK A73-03 — vô hiệu hoá NGAY kết quả cũ khi dừng (không đợi init() lần sau mới xoá) —
        // đúng yêu cầu "mất tín hiệu -> reset/vô hiệu hoá BPM theo hợp đồng". getCurrentBpm()/
        // getConfidence() gọi giữa lúc stop() và lần init() kế tiếp sẽ trả về null, không phải
        // giá trị của nguồn đã chết.
        lastConfirmedBpm = null;
        lastCandidateBpm = null;
        lastConfidence = null;
    }

    function onConfidence(cb) { confidenceListeners.push(cb); } // TASK A73-03
    function getConfidence() { return lastConfidence; }         // TASK A73-03
    function getCandidateBpm() { return lastCandidateBpm; }     // TASK A73-03 — BPM tạm thời, CHƯA chắc đáng tin

    function onUpdate(cb) { listeners.push(cb); }
    function onLevel(cb) { levelListeners.push(cb); } // dùng cho debug log / VU meter
    function getCurrentBpm() { return lastConfirmedBpm; }

    return { init, stop, onUpdate, onLevel, getCurrentBpm, onConfidence, getConfidence, getCandidateBpm };
})();

window.BPMEngine = BPMEngine;
