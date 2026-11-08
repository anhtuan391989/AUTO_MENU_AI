/* A112 — Setup > AI > thẻ "Cấu hình AI / Mức sẵn sàng": 6 ô trạng thái THẬT (chỉ hiển thị, KHÔNG điều khiển gì, KHÔNG đổi cấu hình AI).
   Nguồn dữ liệu:
   - Cấu hình (nguồn âm thanh): selectedSystemAudioDeviceId + gợi ý "thiết bị còn tồn tại" (appSettings.js, cùng cửa sổ Setup).
   - Trạng thái chạy thật: đọc CHỈ-ĐỌC từ cửa sổ Menu chính qua IPC aiReadinessSnapshot (nhãn #aiSourceState, #currentKey, #currentBpm, #modStatus).
   Hàm computeAiReadiness thuần (test được ngoài Electron). */
(function (root) {
    "use strict";
    var LOOPBACK_ID = "loopback:system"; // khớp LOOPBACK_DEVICE_ID ở audioSource.js
    var K = { ok: "status-pill status-pill--ready", soon: "status-pill status-pill--soon", dim: "status-pill status-pill--dim", err: "status-pill status-pill--error" };
    var BAD_STATE = { "NO SOURCE": ["Chưa có nguồn âm thanh", "soon"], "STARTING": ["Đang khởi động nguồn âm thanh", "soon"], "ERROR": ["Lỗi nguồn âm thanh", "err"], "STOPPED": ["Nguồn âm thanh đã dừng", "dim"], "NO SIGNAL": ["Không có tín hiệu âm thanh", "soon"] };
    var item = function (text, k, title) { return { text: text, cls: K[k], title: title || "" }; };
    var isWaiting = function (v) { return !v || /^listening$/i.test(String(v).trim()); };

    // input: { deviceId: string, availabilityHint: true|false|undefined, snap: {available, src, key, bpm, mod} | null }
    function computeAiReadiness(input) {
        var deviceId = String((input && input.deviceId) || "");
        var hint = input ? input.availabilityHint : undefined;
        var snap = input && input.snap && input.snap.available ? input.snap : null;
        var out = {};
        // --- cấu hình ---
        var srcOk = false;
        if (!deviceId) out.source = item("Chưa cấu hình", "dim", "Chọn nguồn ở Setup > Âm thanh (System Audio).");
        else if (hint === false) out.source = item("⚠ Thiết bị đã lưu không còn", "err", "Thiết bị: " + deviceId);
        else { srcOk = true; out.source = item("Đã cấu hình", "ok", deviceId === LOOPBACK_ID ? "Loopback hệ thống" : "Thiết bị: " + deviceId); }
        if (!deviceId) out.wasapi = item("Chưa chọn nguồn", "dim");
        else if (deviceId === LOOPBACK_ID) out.wasapi = item("Đang dùng loopback hệ thống", "ok");
        else out.wasapi = item("Không dùng loopback (đang dùng thiết bị khác)", "dim", "Thiết bị: " + deviceId);
        // --- chạy thật (đọc từ Menu chính) ---
        var src = snap ? String(snap.src || "").trim().toUpperCase() : "";
        var blocked = snap && BAD_STATE[src] ? BAD_STATE[src] : null;
        function det(label, value, fmt) {
            if (!snap) return item("Chưa đọc được Menu chính", "dim", "Cửa sổ Menu chính chưa sẵn sàng.");
            if (blocked) return item(blocked[0], blocked[1]);
            if (isWaiting(value)) return item(src === "ANALYZING" ? "Đang phân tích…" : "Đang nghe, chưa có kết quả", "soon");
            return item(fmt(String(value)), "ok");
        }
        out.key = det("Key", snap && snap.key, function (v) { return "Đã dò: " + v; });
        out.bpm = det("BPM", snap && snap.bpm, function (v) { return "Đã dò: " + v; });
        out.mod = det("Mod", snap && snap.mod, function (v) { return "Đang áp: " + v; });
        // --- tổng ---
        var keyOk = out.key.cls === K.ok, bpmOk = out.bpm.cls === K.ok;
        if (!srcOk) out.overall = item("Thiếu nguồn âm thanh", deviceId ? "err" : "dim");
        else if (!snap) out.overall = item("Chưa đọc được Menu chính", "dim");
        else if (blocked) out.overall = item(blocked[0], blocked[1]);
        else if (keyOk || bpmOk) out.overall = item("Sẵn sàng — AI đã dò được", "ok");
        else out.overall = item("Đang chờ AI dò", "soon");
        out.badge = { text: out.overall.text, cls: "badge " + (out.overall.cls === K.ok ? "badge-live" : out.overall.cls === K.err ? "badge-unwired" : "badge-soon") };
        return out;
    }

    function readConfig() {
        var id = "", hint;
        try { id = typeof getSetting === "function" ? String(getSetting("selectedSystemAudioDeviceId", "") || "") : ""; } catch (e) { id = ""; }
        try { hint = typeof __systemAudioAvailabilityHint !== "undefined" ? __systemAudioAvailabilityHint : undefined; } catch (e) { hint = undefined; }
        return { deviceId: id, availabilityHint: hint };
    }
    function paintItem(id, it) { var el = document.getElementById(id); if (!el) return; el.textContent = it.text; el.className = it.cls; el.title = it.title || ""; }
    var timer = null;
    async function refresh() {
        var snap = null;
        try { if (root.electronAPI && typeof root.electronAPI.aiReadinessSnapshot === "function") snap = await root.electronAPI.aiReadinessSnapshot(); } catch (e) { snap = null; }
        var cfg = readConfig();
        var r = computeAiReadiness({ deviceId: cfg.deviceId, availabilityHint: cfg.availabilityHint, snap: snap });
        paintItem("aiReadyKeyPill", r.key); paintItem("aiReadyBpmPill", r.bpm); paintItem("aiReadyModPill", r.mod);
        paintItem("aiReadyAudioSourcePill", r.source); paintItem("aiReadyWasapiPill", r.wasapi); paintItem("aiReadyOverallPill", r.overall);
        var b = document.getElementById("aiReadyStatusBadge"); if (b) { b.textContent = r.badge.text; b.className = r.badge.cls; }
    }
    function start() { stop(); refresh(); timer = setInterval(refresh, 3000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    if (typeof document !== "undefined" && document.addEventListener) {
        document.addEventListener("DOMContentLoaded", function () {
            var nav = document.getElementById("sidebarNav") || document;
            nav.addEventListener("click", function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest("[data-panel]") : null;
                if (b && b.dataset.panel === "panel-ai") start(); else if (b) stop();
            });
            var panel = document.getElementById("panel-ai");
            if (panel && panel.classList.contains("active")) start();
        });
    }
    if (typeof module !== "undefined" && module.exports) module.exports = { computeAiReadiness: computeAiReadiness };
    else root.computeAiReadiness = computeAiReadiness;
})(typeof window !== "undefined" ? window : globalThis);
