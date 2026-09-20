/* ==========================================================
   audioSource.js — TASK B58 (Claude B — Audio Source + 4 VU)
   -----------------------------------------------------------
   File MỚI. KHÔNG đụng keyEngine.js/bpmEngine.js/modEngine.js (thuật toán AI vẫn
   nguyên vẹn, thuộc Claude A). Trách nhiệm DUY NHẤT của file này: tách 3 loại
   nguồn audio (MIC / SYSTEM_AUDIO / DAW_MASTER) thành 3 abstraction riêng, mỗi
   cái có state machine + AudioLevel/AudioFrame contract riêng — đúng yêu cầu B58:
   "Không dùng một biến device duy nhất để mang nhiều semantic khác nhau."

   MIC        -> chỉ nuôi Mic VU. KHÔNG BAO GIỜ có onFrame consumer nối vào AI.
   SYSTEM_AUDIO -> nguồn DUY NHẤT được phép nuôi Key/BPM/Mod (qua renderer.js,
                   không đổi ở đây) + Music VU.
   DAW_MASTER -> CHƯA có native capture trong B58 (xem B58-REPORT.md mục 6/9).
                 Đây CHỈ là architecture boundary — state cố định NO_DEVICE,
                 không giả lập bằng SYSTEM_AUDIO.
   ========================================================== */
(function (global) {
    "use strict";

    const AudioSourceType = Object.freeze({
        MIC: "MIC",
        SYSTEM_AUDIO: "SYSTEM_AUDIO",
        DAW_MASTER: "DAW_MASTER",
    });

    const AudioSourceState = Object.freeze({
        NO_DEVICE: "NO_DEVICE",
        STARTING: "STARTING",
        RUNNING: "RUNNING",
        STOPPING: "STOPPING",
        ERROR: "ERROR",
    });

    // ---------------------------------------------------------
    // MIGRATION (Mục 6 đề bài B58): "selectedSoundcardId" (setting cũ, vẫn do
    // Setup/appSettings.js — phạm vi Claude C — sở hữu việc lưu/đọc gốc) đang
    // mang nghĩa SYSTEM_AUDIO. B58 KHÔNG đổi tên key cũ trong appSettings.js/
    // setup.js (tránh mở rộng scope vào Setup persistence của Claude C) — chỉ
    // thêm 1 lớp đọc tương thích ở đây: ưu tiên key mới "systemAudioDeviceId"
    // (nếu tương lai Setup lưu theo tên mới), fallback về key cũ nếu chưa có.
    // ---------------------------------------------------------
    function getSystemAudioDeviceId() {
        if (typeof getSetting !== "function") return "";
        const next = getSetting("systemAudioDeviceId", "");
        if (next) return next;
        return getSetting("selectedSoundcardId", ""); // MIGRATION FALLBACK
    }

    // Mic device: KHÔNG có setting riêng trong repo hiện tại (chưa có UI chọn mic
    // cho mục đích Mic VU — đó là UI/Setup work ngoài scope B58, xem B58-REPORT.md
    // mục "Known limitations"). MIC source dùng thiết bị mic mặc định của hệ điều
    // hành/trình duyệt một cách TƯỜNG MINH (không phải fallback ngầm của SYSTEM_AUDIO
    // — đây là hành vi ĐÚNG cho chính MIC source, không phải fallback lỗi).
    function getMicDeviceId() {
        if (typeof getSetting !== "function") return "";
        return getSetting("selectedMicDeviceId", ""); // "" => dùng mic mặc định hệ thống
    }

    function nowSeconds(audioContext) {
        // Timestamp THẬT lấy từ AudioContext.currentTime khi có; fallback duy nhất
        // là performance.now() (không phải hard-code số 0/giá trị giả).
        if (audioContext && typeof audioContext.currentTime === "number") {
            return audioContext.currentTime;
        }
        return performance.now() / 1000;
    }

    function computeRmsDbfsPeak(timeData) {
        // timeData: Uint8Array từ analyser.getByteTimeDomainData() (0..255, 128 = im lặng).
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] - 128) / 128;
            const av = Math.abs(v);
            if (av > peak) peak = av;
            sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        return { rms, dbfs, peak };
    }

    function dbfsToPercent(dbfs, floor, ceiling) {
        if (dbfs === -Infinity) return 0;
        const pct = ((dbfs - floor) / (ceiling - floor)) * 100;
        return Math.max(0, Math.min(100, pct));
    }

    const VU_DB_FLOOR = -50;
    const VU_DB_CEILING = -6;

    /* ---------------------------------------------------------
       createMediaDeviceSource — cơ chế CHUNG cho MIC và SYSTEM_AUDIO (cả 2 đều
       là getUserMedia + AnalyserNode). Khác nhau ở: deviceId đến từ đâu, và
       MIC hoàn toàn KHÔNG có onFrame consumer nào được nối tới AI ở renderer.js.
       DAW_MASTER KHÔNG dùng factory này (xem createDawMasterSource riêng, không
       có capture thật trong B58).
       --------------------------------------------------------- */
    function createMediaDeviceSource(sourceType, resolveDeviceId, options = {}) {
        let state = AudioSourceState.NO_DEVICE;
        let stream = null;
        let audioContext = null;
        let analyser = null;
        let mediaSourceNode = null; // MediaStreamAudioSourceNode thật — chỉ dùng để adapter cho AI (xem getRawSourceNode)
        let rafId = null;
        let timeData = null;
        let freqData = null;

        // TASK C62 — auto-reconnect (chỉ hoạt động khi options.autoReconnect === true, hiện tại
        // CHỈ bật cho SYSTEM_AUDIO — xem createSystemAudioSource()). Mục tiêu: khi mất thiết bị
        // giữa chừng, tự thử lại theo backoff tăng dần thay vì chờ user reload cả app (bug C61
        // đã ghi nhận: startAudioMonitor() ở renderer.js chỉ được gọi 1 lần qua listener
        // {once:true}, không có đường nào tự gọi lại).
        let retryTimerId = null;
        let retryDelayMs = 0;
        const RETRY_BASE_MS = 2000;
        const RETRY_MAX_MS = 15000;

        const levelListeners = [];
        const frameListeners = [];
        const deviceLostListeners = [];
        const stateChangeListeners = []; // TASK C62 — renderer.js dùng để biết CHÍNH XÁC lúc nào

        // cần (re)bind Key/BPM vào audioContext/source MỚI — dùng chung 1 sự kiện cho cả lần
        // start() đầu tiên lẫn mọi lần tự reconnect sau này (1 code path, không rẽ nhánh riêng).

        function clearRetryTimer() {
            if (retryTimerId) { clearTimeout(retryTimerId); retryTimerId = null; }
        }

        function scheduleRetry() {
            if (!options.autoReconnect) return;
            if (retryTimerId) return; // đã có 1 lịch retry đang chờ — KHÔNG tạo thêm (chống duplicate retry loop, mục 7/10 đề bài C62)
            retryDelayMs = retryDelayMs ? Math.min(retryDelayMs * 2, RETRY_MAX_MS) : RETRY_BASE_MS;
            console.log(`[AudioSource:${sourceType}] Sẽ tự thử kết nối lại sau ${retryDelayMs}ms...`);
            retryTimerId = setTimeout(() => {
                retryTimerId = null;
                if (state === AudioSourceState.STOPPING || state === AudioSourceState.RUNNING) return; // đã stop() hoặc đã có nguồn khác start() lại trong lúc chờ
                start();
            }, retryDelayMs);
        }

        function setState(next) {
            state = next;
            emitStateChange(next);
        }

        function emitLevel(level) {
            for (const cb of levelListeners) {
                try { cb(level); } catch (e) { console.error(`[AudioSource:${sourceType}] onLevel listener lỗi:`, e); }
            }
        }
        function emitFrame(frame) {
            for (const cb of frameListeners) {
                try { cb(frame); } catch (e) { console.error(`[AudioSource:${sourceType}] onFrame listener lỗi:`, e); }
            }
        }
        function emitDeviceLost(reason) {
            for (const cb of deviceLostListeners) {
                try { cb(reason); } catch (e) { console.error(`[AudioSource:${sourceType}] onDeviceLost listener lỗi:`, e); }
            }
        }
        function emitStateChange(next) {
            for (const cb of stateChangeListeners) {
                try { cb(next); } catch (e) { console.error(`[AudioSource:${sourceType}] onStateChange listener lỗi:`, e); }
            }
        }

        function teardown() {
            // Mục 14 đề bài: không được để requestAnimationFrame/AudioContext/MediaStream/
            // AnalyserNode tiếp tục chạy vô hạn sau khi source đã chết.
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
                stream = null;
            }
            if (audioContext) {
                audioContext.close().catch(() => {});
                audioContext = null;
            }
            analyser = null;
        }

        async function start() {
            if (state === AudioSourceState.RUNNING || state === AudioSourceState.STARTING) return;
            const deviceId = resolveDeviceId();
            if (!deviceId && options.requireExplicitDevice) {
                // SYSTEM_AUDIO bắt buộc user tự chọn ở Setup — không rơi về mic mặc định
                // (đúng nguyên tắc B56/B57 đã audit, giữ nguyên hành vi cũ, không đổi).
                setState(AudioSourceState.NO_DEVICE);
                return;
            }

            setState(AudioSourceState.STARTING);
            try {
                const constraints = deviceId
                    ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                    : { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
                stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });

                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (audioContext.state !== "running") await audioContext.resume();

                mediaSourceNode = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = options.fftSize || 2048;
                mediaSourceNode.connect(analyser);

                timeData = new Uint8Array(analyser.fftSize);
                freqData = new Uint8Array(analyser.frequencyBinCount);

                // Phát hiện device bị rút giữa chừng (track kết thúc ngoài ý muốn).
                const track = stream.getAudioTracks()[0];
                if (track) {
                    track.addEventListener("ended", () => {
                        if (state !== AudioSourceState.STOPPING) {
                            setState(AudioSourceState.ERROR);
                            teardown();
                            emitDeviceLost("TRACK_ENDED");
                            scheduleRetry(); // TASK C62 — thiết bị rút giữa chừng: tự thử lại thay vì treo vĩnh viễn
                        }
                    });
                }

                // TASK C62 — start() thành công (kể cả sau khi retry) -> reset backoff về 0 và
                // huỷ mọi lịch retry còn sót (không nên còn, nhưng phòng hờ tránh 2 nguồn cùng gọi start()).
                retryDelayMs = 0;
                clearRetryTimer();
                setState(AudioSourceState.RUNNING);

                function loop() {
                    if (state !== AudioSourceState.RUNNING) return;
                    analyser.getByteTimeDomainData(timeData);
                    analyser.getByteFrequencyData(freqData);

                    const { rms, dbfs, peak } = computeRmsDbfsPeak(timeData);
                    const vuPercent = dbfsToPercent(dbfs, VU_DB_FLOOR, VU_DB_CEILING);

                    emitLevel({ sourceType, rms, dbfs, peak, vuPercent, timestamp: nowSeconds(audioContext) });

                    if (frameListeners.length > 0) {
                        emitFrame({
                            sourceType,
                            sampleRate: audioContext.sampleRate, // THẬT, đọc trực tiếp — không hard-code
                            channelCount: track?.getSettings?.().channelCount ?? null, // null nếu trình duyệt không báo (NOT DEFINED)
                            frequencyData: freqData,
                            timeDomainData: timeData,
                            timestamp: nowSeconds(audioContext),
                        });
                    }
                    rafId = requestAnimationFrame(loop);
                }
                loop();
            } catch (err) {
                console.error(`[AudioSource:${sourceType}] start() lỗi:`, err);
                setState(deviceId ? AudioSourceState.ERROR : AudioSourceState.NO_DEVICE);
                teardown();
                emitDeviceLost(err && err.name ? err.name : "UNKNOWN_ERROR");
                // TASK C62 — chỉ retry khi ĐÃ có deviceId cấu hình nhưng lỗi (thiết bị mất/không mở
                // được) — KHÔNG retry khi state là NO_DEVICE do requireExplicitDevice chưa cấu hình
                // (đó không phải "mất thiết bị", là "chưa chọn" — không có gì để thử lại).
                if (deviceId) scheduleRetry();
            }
        }

        function stop() {
            clearRetryTimer(); // TASK C62 mục 10 — 0 retry timer còn sống sau khi stop()
            retryDelayMs = 0;
            if (state === AudioSourceState.NO_DEVICE) return;
            setState(AudioSourceState.STOPPING);
            teardown();
            setState(AudioSourceState.NO_DEVICE);
        }

        const api = {
            type: sourceType,
            getState: () => state,
            start,
            stop,
            onLevel: (cb) => levelListeners.push(cb),
            onFrame: (cb) => frameListeners.push(cb),
            onDeviceLost: (cb) => deviceLostListeners.push(cb),
            onStateChange: (cb) => stateChangeListeners.push(cb), // TASK C62
        };

        // TASK B58 Mục 7/16 — adapter boundary CHO PHÉP DUY NHẤT với SYSTEM_AUDIO:
        // renderer.js cần audioContext + raw MediaStreamAudioSourceNode để gọi
        // BPMEngine.init()/KeyEngine.init() Y NGUYÊN như trước (không đổi 1 dòng
        // thuật toán AI của Claude A). MIC KHÔNG được cấp getter này — về mặt kiến
        // trúc không có đường nào để MIC lọt vào AI qua file này.
        if (options.exposeRawNodeForAdapter) {
            api.getAudioContextForAdapter = () => audioContext;
            api.getRawSourceNodeForAdapter = () => mediaSourceNode;
        }

        return api;
    }

    /* ---------------------------------------------------------
       createDawMasterSource — TASK B58 Mục 9: architecture boundary ONLY.
       KHÔNG có native capture trong B58 (không có WASAPI addon, không mượn
       SYSTEM_AUDIO để giả lập). State CỐ ĐỊNH NO_DEVICE — start() là no-op
       an toàn, không throw, không crash, chỉ log rõ NOT_IMPLEMENTED.
       --------------------------------------------------------- */
    function createDawMasterSource() {
        const levelListeners = [];
        const deviceLostListeners = [];
        let warned = false;

        function start() {
            if (!warned) {
                console.warn("[AudioSource:DAW_MASTER] NOT_IMPLEMENTED trong B58 — chưa có native capture. " +
                    "Master VU sẽ giữ NO_DEVICE. Xem B58-REPORT.md mục DAW_MASTER status.");
                warned = true;
            }
            // Phát 1 level rỗng đúng contract (rms=0, timestamp thật) để UI có thể vẽ
            // trạng thái "NO_DEVICE" nhất quán, KHÔNG lấy số liệu từ SYSTEM_AUDIO.
            for (const cb of levelListeners) {
                try { cb({ sourceType: AudioSourceType.DAW_MASTER, rms: 0, dbfs: -Infinity, peak: 0, vuPercent: 0, timestamp: performance.now() / 1000, noDevice: true }); } catch (e) { console.error(e); }
            }
        }
        function stop() {}

        return {
            type: AudioSourceType.DAW_MASTER,
            getState: () => AudioSourceState.NO_DEVICE,
            start,
            stop,
            onLevel: (cb) => levelListeners.push(cb),
            onFrame: () => {}, // KHÔNG BAO GIỜ có frame — không tồn tại capture
            onDeviceLost: (cb) => deviceLostListeners.push(cb),
        };
    }

    function createMicSource() {
        // requireExplicitDevice = false: MIC dùng mic mặc định hệ thống nếu user chưa
        // chọn mic cụ thể — đây là hành vi ĐÚNG cho MIC (khác với SYSTEM_AUDIO, nơi
        // "không tự chọn mặc định" là bắt buộc để tránh lẫn với mic).
        return createMediaDeviceSource(AudioSourceType.MIC, getMicDeviceId, { fftSize: 1024, requireExplicitDevice: false });
    }

    function createSystemAudioSource() {
        return createMediaDeviceSource(AudioSourceType.SYSTEM_AUDIO, getSystemAudioDeviceId, {
            fftSize: 2048,
            requireExplicitDevice: true,
            exposeRawNodeForAdapter: true, // DUY NHẤT SYSTEM_AUDIO được phép — xem ghi chú ở trên
            autoReconnect: true, // TASK C62 — CHỈ SYSTEM_AUDIO tự reconnect (đúng phạm vi bug đã audit
                                  // ở C61: Key/BPM/Mod không được treo vĩnh viễn sau khi mất thiết bị).
                                  // MIC/DAW_MASTER KHÔNG bật cờ này — ngoài phạm vi C62, không đổi hành vi cũ.
        });
    }

    global.AudioSourceType = AudioSourceType;
    global.AudioSourceState = AudioSourceState;
    global.AudioSource = {
        createMicSource,
        createSystemAudioSource,
        createDawMasterSource,
        getSystemAudioDeviceId, // export để renderer.js dùng lại đúng 1 nguồn sự thật
    };
})(window);
