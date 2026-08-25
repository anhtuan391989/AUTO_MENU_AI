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
    const listeners = [];      // callback(bpm) khi có kết quả mới đủ tin cậy
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
                        for (let cand = v - 1; cand <= v + 1; cand++) {
                            counts[cand] = (counts[cand] || 0) + 1;
                            if (counts[cand] > bestCount) { bestCount = counts[cand]; bestBpm = cand; }
                        }
                    });

                    if (bestCount >= BPM_VOTE_MIN_AGREE) {
                        lastConfirmedBpm = bestBpm;
                        listeners.forEach((cb) => cb(bestBpm));
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
    }

    function onUpdate(cb) { listeners.push(cb); }
    function onLevel(cb) { levelListeners.push(cb); } // dùng cho debug log / VU meter
    function getCurrentBpm() { return lastConfirmedBpm; }

    return { init, stop, onUpdate, onLevel, getCurrentBpm };
})();

window.BPMEngine = BPMEngine;
