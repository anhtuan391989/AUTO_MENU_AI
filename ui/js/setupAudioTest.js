/* setupAudioTest.js — TASK A-AUDIO-01
   Nối khu "Sample Rate / Buffer Size / Latency / Audio Test / Calibration" trong Setup:
   - Sample Rate / Buffer size: lưu vào appSettings (audioSampleRate, audioBufferSize), dùng cho AudioContext của phép đo trong Setup.
     Buffer size -> latencyHint = size / sampleRate (giây). Trình duyệt chỉ coi đây là GỢI Ý, không bảo đảm đúng từng mẫu.
   - Latency: độ trễ do HỆ THỐNG báo (baseLatency + outputLatency) sau mỗi lần Test; sau Calibration hiện thêm độ trễ vòng đo thật.
   - Test: phát tiếng bíp 440 Hz qua Audio Output đã chọn (selectedAudioOutputDeviceId).
   - Calibration: phát 3 chirp, thu lại bằng MIC Input (selectedMicDeviceId, hoặc mic mặc định), tương quan chéo -> độ trễ vòng (median).
   KHÔNG đụng audioSource.js/renderer.js/Engine của Menu. Chưa kiểm chứng trên phần cứng thật (xem báo cáo). */
(function () {
    const $ = (id) => document.getElementById(id);
    const AC = () => window.AudioCalibration;
    const get = (k, d) => { try { const v = typeof getSetting === "function" ? getSetting(k) : undefined; return v === undefined || v === null || v === "" ? d : v; } catch (_) { return d; } };
    const put = (k, v) => { try { if (typeof setSetting === "function") setSetting(k, v); } catch (_) {} };
    let busy = false;

    function cfg() {
        const sr = Number($("audioSampleRateSelect").value) || 48000;
        const buf = Number($("audioBufferSelect").value) || 256;
        return { sr, buf, hint: buf / sr };
    }
    function setLatency(text, bad) { const el = $("audioLatencyText"); if (el) { el.textContent = text; el.style.color = bad ? "#ff8080" : ""; } }

    async function makeCtx() {
        const { sr, hint } = cfg();
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) throw new Error("Trình duyệt không có Web Audio API");
        let ctx;
        try { ctx = new Ctor({ sampleRate: sr, latencyHint: hint }); } catch (_) { ctx = new Ctor({ latencyHint: hint }); } // thiết bị không nhận sampleRate này -> dùng mặc định, rồi báo giá trị thật
        const outId = get("selectedAudioOutputDeviceId", "");
        if (outId && typeof ctx.setSinkId === "function") { try { await ctx.setSinkId(outId); } catch (e) { console.warn("[AudioTest] setSinkId lỗi:", e); } }
        if (ctx.state === "suspended") await ctx.resume();
        return ctx;
    }

    function describe(ctx) {
        const rep = AC().reportedLatencyMs(ctx);
        return (rep == null ? "hệ thống không báo độ trễ" : "hệ thống báo ≈ " + rep.toFixed(1) + " ms") + " · " + ctx.sampleRate + " Hz";
    }

    async function runTest() {
        if (busy) return; busy = true;
        const btn = $("btnAudioTest"); btn.disabled = true;
        let ctx;
        try {
            ctx = await makeCtx();
            const osc = ctx.createOscillator(), g = ctx.createGain();
            osc.frequency.value = 440; osc.connect(g); g.connect(ctx.destination);
            const t = ctx.currentTime + 0.05;
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.03); g.gain.setValueAtTime(0.2, t + 0.35); g.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t); osc.stop(t + 0.42);
            setLatency("Đang phát bíp… " + describe(ctx));
            await new Promise((r) => setTimeout(r, 600));
            setLatency("Đã phát bíp: " + describe(ctx) + (get("selectedAudioOutputDeviceId", "") ? "" : " (output mặc định)"));
        } catch (e) {
            setLatency("Test lỗi: " + (e && e.message || e), true);
        } finally {
            try { ctx && await ctx.close(); } catch (_) {}
            btn.disabled = false; busy = false;
        }
    }

    async function runCalibration() {
        if (busy) return; busy = true;
        const btn = $("btnAudioCalibrate"); btn.disabled = true;
        let ctx, stream, proc, src;
        try {
            setLatency("Đang đo… giữ yên lặng, đừng chạm mic.");
            ctx = await makeCtx();
            const micId = get("selectedMicDeviceId", "");
            stream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }, micId ? { deviceId: { exact: micId } } : {}) });
            const sr = ctx.sampleRate;
            const chunks = [];
            src = ctx.createMediaStreamSource(stream);
            proc = ctx.createScriptProcessor(256, 1, 1);
            const mute = ctx.createGain(); mute.gain.value = 0;
            let t0 = null;
            proc.onaudioprocess = (e) => { if (t0 === null) t0 = ctx.currentTime; chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
            src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
            await new Promise((r) => setTimeout(r, 200)); // cho luồng thu ổn định
            const burst = AC().makeChirp(sr, 40, 1000, 8000);
            const buf = ctx.createBuffer(1, burst.length, sr); buf.copyToChannel(burst, 0);
            const startCtx = ctx.currentTime + 0.3;
            const sched = [0, 0.8, 1.6].map((d) => startCtx + d);
            sched.forEach((t) => { const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.5; s.connect(g); g.connect(ctx.destination); s.start(t); });
            await new Promise((r) => setTimeout(r, 2700));
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const rec = new Float32Array(total); let o = 0; chunks.forEach((c) => { rec.set(c, o); o += c.length; });
            // Mẫu 0 của rec ≈ t0 trên đồng hồ ctx (sai số tối đa ~ 1 buffer = 256 mẫu).
            const res = AC().measureRoundTrip(rec, sr, burst, sched.map((t) => t - t0), 0.6);
            const bufMs = (256 / sr) * 1000;
            if (!res.ok) {
                setLatency("Calibration KHÔNG nghe thấy tiếng chirp (" + res.found + "/" + res.total + "). Tăng âm lượng loa/đưa mic gần loa, hoặc dùng cáp loopback.", true);
            } else {
                put("audioRoundTripMs", Math.round(res.latencyMs * 10) / 10);
                setLatency("Độ trễ vòng ≈ " + res.latencyMs.toFixed(1) + " ms (±" + bufMs.toFixed(1) + " ms, " + res.found + "/" + res.total + " lần nghe thấy) · " + describe(ctx));
            }
        } catch (e) {
            setLatency("Calibration lỗi: " + (e && e.message || e), true);
        } finally {
            try { proc && (proc.onaudioprocess = null); proc && proc.disconnect(); src && src.disconnect(); } catch (_) {}
            try { stream && stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
            try { ctx && await ctx.close(); } catch (_) {}
            btn.disabled = false; busy = false;
        }
    }

    function init() {
        if (!$("audioEngineCard") || !window.AudioCalibration) return;
        $("audioSampleRateSelect").value = String(get("audioSampleRate", 48000));
        $("audioBufferSelect").value = String(get("audioBufferSize", 256));
        $("audioSampleRateSelect").addEventListener("change", () => put("audioSampleRate", cfg().sr));
        $("audioBufferSelect").addEventListener("change", () => put("audioBufferSize", cfg().buf));
        $("btnAudioTest").addEventListener("click", runTest);
        $("btnAudioCalibrate").addEventListener("click", runCalibration);
        const rt = get("audioRoundTripMs", null);
        if (rt !== null) setLatency("Lần đo trước: độ trễ vòng ≈ " + rt + " ms");
    }
    window.addEventListener("load", () => setTimeout(init, 450));
})();
