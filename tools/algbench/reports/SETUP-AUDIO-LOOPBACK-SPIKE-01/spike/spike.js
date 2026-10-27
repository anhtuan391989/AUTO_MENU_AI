// SPIKE renderer — không đọc/ghi appSettings, không tự bật stream: mọi stream chỉ mở khi bấm nút.
const $ = (id) => document.getElementById(id);
const logEl = $("log");
const log = (m) => { logEl.textContent += `[${new Date().toLocaleTimeString()}] ${m}\n`; logEl.scrollTop = logEl.scrollHeight; };

const state = { loop: null, mic: null, ctx: null, snaps: [], levels: { loop: -120, mic: -120 } };
const getCtx = () => (state.ctx ||= new AudioContext());

function attachMeter(stream, key, fillId) {
    const ctx = getCtx();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 2048;
    src.connect(an); // KHÔNG nối vào ctx.destination => không phát lại (tránh feedback)
    const buf = new Float32Array(an.fftSize);
    const timer = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let s = 0; for (const v of buf) s += v * v;
        const db = 20 * Math.log10(Math.sqrt(s / buf.length) || 1e-6);
        state.levels[key] = db;
        $(fillId).style.width = Math.max(0, Math.min(100, ((db + 50) / 44) * 100)) + "%"; // −50…−6 dBFS như Menu
    }, 100);
    return { src, an, timer };
}
function release(slot) {
    const h = state[slot]; if (!h) return;
    clearInterval(h.meter.timer);
    try { h.meter.src.disconnect(); } catch (e) {}
    h.stream.getTracks().forEach((t) => t.stop());
    state[slot] = null;
}

$("btnLoop").onclick = async () => {
    if (state.loop) return log("loopback đã bật");
    try {
        await window.spike.setMode($("mode").value);
        // Chromium yêu cầu video; sẽ dừng ngay. restrictOwnAudio chỉ là yêu cầu "mềm" (experimental).
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true, suppressLocalAudioPlayback: true },
        });
        stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
        const at = stream.getAudioTracks();
        if (!at.length) { log("KHÔNG có audio track (BLOCKED: không phải Windows hoặc bị từ chối)"); return; }
        log("Audio track: " + JSON.stringify(at[0].getSettings()));
        log("Constraints hỗ trợ: restrictOwnAudio=" + !!navigator.mediaDevices.getSupportedConstraints().restrictOwnAudio +
            ", suppressLocalAudioPlayback=" + !!navigator.mediaDevices.getSupportedConstraints().suppressLocalAudioPlayback);
        at[0].onended = () => { log("loopback track ENDED"); release("loop"); };
        state.loop = { stream, meter: attachMeter(stream, "loop", "vuLoop") };
        log("Loopback BẬT, mode=" + $("mode").value);
    } catch (e) { log("Loopback LỖI: " + e.name + " — " + e.message); }
};
$("btnStopLoop").onclick = () => { release("loop"); $("vuLoop").style.width = "0"; log("Loopback TẮT (tracks.stop)"); };

async function fillMics() {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); } catch (e) {}
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    $("micSel").innerHTML = devs.map((d) => `<option value="${d.deviceId}">${d.label || d.deviceId}</option>`).join("");
}
$("btnMic").onclick = async () => {
    if (state.mic) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: $("micSel").value },
            echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        state.mic = { stream, meter: attachMeter(stream, "mic", "vuMic") };
        log("Mic BẬT: " + $("micSel").selectedOptions[0].text);
    } catch (e) { log("Mic LỖI: " + e.message); }
};
$("btnStopMic").onclick = () => { release("mic"); $("vuMic").style.width = "0"; log("Mic TẮT"); };

$("btnBeep").onclick = () => {
    const ctx = getCtx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    g.gain.value = 0.1; o.frequency.value = 440; o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 2); log("Đã phát bíp 440Hz 2s qua output mặc định (xem loopback có nhảy không)");
};
$("btnSnap").onclick = () => {
    const s = { label: $("label").value, t: new Date().toISOString(), loopDb: +state.levels.loop.toFixed(1), micDb: +state.levels.mic.toFixed(1) };
    state.snaps.push(s); log("MỐC " + JSON.stringify(s));
};
$("btnDump").onclick = () => log("JSON:\n" + JSON.stringify(state.snaps, null, 2));
window.spike.info().then((i) => { $("info").textContent = `Electron ${i.electron} · Chromium ${i.chrome} · ${i.platform}`; log("Khởi động: " + $("info").textContent + (i.platform !== "win32" ? "  (KHÔNG phải Windows — loopback sẽ bị từ chối)" : "")); });
fillMics();
