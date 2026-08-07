/* setupVuMeter.js — MỚI THÊM, KHÔNG đụng Engine/IPC.
   Đo mức tín hiệu mic đang chọn (getSetting("selectedSoundcardId")) bằng Web Audio API
   thuần trong renderer, chỉ để kiểm tra nhanh mic có bắt tiếng hay không. */
(function () {
    let audioCtx = null;
    let analyser = null;
    let source = null;
    let stream = null;
    let rafId = null;

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
    }

    async function startMeter() {
        const status = document.getElementById("vuMeterStatus");
        const fill = document.getElementById("vuMeterFill");
        try {
            const deviceId = typeof getSetting === "function" ? getSetting("selectedSoundcardId") : null;
            const constraints = deviceId
                ? { audio: { deviceId: { exact: deviceId } } }
                : { audio: true };

            if (status) status.textContent = "⏳ Đang xin quyền micro...";
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
                rafId = requestAnimationFrame(loop);
            }
            loop();
            if (status) status.textContent = "🎙 Đang đo mic đang chọn (VuMeter thật).";
        } catch (err) {
            console.error("VuMeter lỗi:", err);
            if (status) status.textContent = "❌ Không mở được mic — kiểm tra quyền micro / soundcard đã chọn.";
        }
    }

    document.getElementById("btnVuStart")?.addEventListener("click", startMeter);
    document.getElementById("btnVuStop")?.addEventListener("click", () => stopMeter("Đã dừng."));

    // Tự dừng khi rời khỏi trang Setup để không giữ mic mở ngầm.
    window.addEventListener("beforeunload", () => stopMeter());
})();
