/* setupVuMeter.js — MỚI THÊM, KHÔNG đụng Engine/IPC.
   Đo mức tín hiệu mic đang chọn (getSetting("selectedSoundcardId")) bằng Web Audio API
   thuần trong renderer, chỉ để kiểm tra nhanh mic có bắt tiếng hay không.

   S3 — AUDIO SIGNAL TEST: bổ sung phát hiện tín hiệu NHỊ PHÂN (có/không), dùng LẠI đúng
   RMS đã tính sẵn ở vòng loop() bên dưới — không thêm AudioContext/analyser thứ hai, không
   thêm dBFS/gain/compressor/auto-gain nào. Mục tiêu CHỈ là "có tín hiệu đi vào từ device đã
   chọn hay không" — KHÔNG được gọi là "System Audio OK"/"Loopback OK". */
(function () {
    let audioCtx = null;
    let analyser = null;
    let source = null;
    let stream = null;
    let rafId = null;

    // S3 — ngưỡng RMS coi là "có tín hiệu" (giá trị khởi điểm hợp lý, không phải số đo thật —
    // đây chỉ là binary signal verification, không phải calibration chuẩn xác như Main VU).
    const SIGNAL_RMS_THRESHOLD = 0.02;
    // Thời gian chờ trước khi kết luận "NO AUDIO SIGNAL" nếu chưa thấy tín hiệu nào — tránh
    // báo sai ngay tức thời trong lúc source vừa mở/chưa kịp phát nhạc.
    const NO_SIGNAL_GRACE_MS = 1500;

    let testStartedAt = 0;
    let signalSeen = false;

    function setSignalStatus(text, ok) {
        const el = document.getElementById("audioSignalStatus");
        if (!el) return;
        el.textContent = text;
        el.className = "badge " + (ok ? "badge-live" : "badge-warn");
    }

    function stopMeter(statusMsg) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
        }
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
        }
        const fill = document.getElementById("vuMeterFill");
        if (fill) fill.style.width = "0%";
        const status = document.getElementById("vuMeterStatus");
        if (status) status.textContent = statusMsg || "Đã dừng.";
        // S3 — về lại trạng thái "Chưa kiểm tra" mỗi khi dừng đo, không giữ lại kết quả cũ
        // (kết quả OK/NO_SIGNAL chỉ có nghĩa cho LẦN test đang chạy).
        setSignalStatus("Chưa kiểm tra tín hiệu", false);
        signalSeen = false;
    }

    async function startMeter() {
        // S3 acceptance test #5 — "test nhiều lần → không tạo stream bị treo": PHẢI dừng hẳn
        // phiên đo trước đó (nếu có) trước khi mở stream mới, nếu không AudioContext/stream/
        // requestAnimationFrame loop cũ sẽ mồ côi và chạy ngầm mãi (bug thật, đã sửa ở đây).
        stopMeter();

        const status = document.getElementById("vuMeterStatus");
        const fill = document.getElementById("vuMeterFill");
        try {
            const deviceId = typeof getSetting === "function" ? getSetting("selectedSoundcardId") : null;
            const constraints = deviceId
                ? { audio: { deviceId: { exact: deviceId } } }
                : { audio: true };

            if (status) status.textContent = "⏳ Đang xin quyền micro...";
            setSignalStatus("⏳ Đang kiểm tra tín hiệu...", false);
            testStartedAt = Date.now();
            signalSeen = false;

            stream = await navigator.mediaDevices.getUserMedia(constraints);

            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            source = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);

            const data = new Uint8Array(analyser.frequencyBinCount);

            function loop() {
                analyser.getByteTimeDomainData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = (data[i] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / data.length);
                const percent = Math.min(100, Math.round(rms * 220));
                if (fill) fill.style.width = percent + "%";

                // S3 — phát hiện nhị phân, dùng LẠI đúng `rms` vừa tính ở trên (không tính thêm gì mới).
                if (rms >= SIGNAL_RMS_THRESHOLD) {
                    if (!signalSeen) {
                        signalSeen = true;
                        // Chỉ khẳng định CÓ tín hiệu từ device đã chọn — không suy diễn đó là
                        // System Audio/Loopback (không thể biết được điều đó chỉ từ RMS).
                        setSignalStatus("✅ AUDIO SIGNAL: OK", true);
                    }
                } else if (!signalSeen && Date.now() - testStartedAt >= NO_SIGNAL_GRACE_MS) {
                    setSignalStatus("⚠ NO AUDIO SIGNAL", false);
                }

                rafId = requestAnimationFrame(loop);
            }
            loop();
            if (status) status.textContent = "🎙 Đang đo mic đang chọn (VuMeter thật).";
        } catch (err) {
            console.error("VuMeter lỗi:", err);
            if (status) status.textContent = "❌ Không mở được mic — kiểm tra quyền micro / soundcard đã chọn.";
            // S3 acceptance test #3 — "rút Audio Interface → Setup không crash": getUserMedia lỗi
            // (device không còn) đã được bắt ở đây từ trước, chỉ thêm cập nhật trạng thái tín hiệu
            // cho rõ ràng, không throw tiếp, không crash trang Setup.
            setSignalStatus("⚠ NO AUDIO SIGNAL (không mở được thiết bị)", false);
        }
    }

    document.getElementById("btnVuStart")?.addEventListener("click", startMeter);
    document.getElementById("btnVuStop")?.addEventListener("click", () => stopMeter("Đã dừng."));

    // Tự dừng khi rời khỏi trang Setup để không giữ mic mở ngầm.
    window.addEventListener("beforeunload", () => stopMeter());
})();
