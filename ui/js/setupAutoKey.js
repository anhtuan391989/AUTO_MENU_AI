/* A119 — Setup > Calibration: Chế độ Auto-Key (Plugin tự dò). Lưu appSettings.autoKeyMode = { enabled, waitSec }.
   Menu đọc lại file ≤2 giây/lần (renderer.js: __aiCoreCfg / runAutoKeyDetect). Mặc định TẮT = hành vi cũ. */
(function () {
    "use strict";
    function clampWait(v) { v = Math.round(Number(v)); return isFinite(v) ? Math.min(60, Math.max(1, v)) : 8; }
    // Đọc cấu hình MỚI NHẤT từ file dùng chung (Menu có thể đã đổi qua thẻ chuột phải nút TỰ DÒ); lỗi -> dùng bản trong bộ nhớ.
    function raw() {
        var c = null;
        try { var st = typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.loadSettingsSync === "function" ? window.electronAPI.loadSettingsSync() : null; if (st && typeof st === "object") c = st.autoKeyMode; } catch (e) { c = null; }
        if (!(c && typeof c === "object")) c = typeof getSetting === "function" ? getSetting("autoKeyMode", null) : null;
        return c && typeof c === "object" ? c : {};
    }
    function cfg() {
        var c = raw();
        return { enabled: c.enabled === true, waitSec: clampWait(c.waitSec === undefined ? 8 : c.waitSec) };
    }
    function init() {
        var en = document.getElementById("autoKeyModeEnable"), wt = document.getElementById("autoKeyWaitSec"), st = document.getElementById("autoKeyModeStatus");
        if (!en || !wt) return;
        // AUTOKEY-REMOVE-01: chế độ Auto-Key (Plugin tự dò) đã bị loại bỏ -> ẩn khối cài đặt này (không sửa HTML) và đảm bảo cờ lưu = tắt.
        try {
            ["autoKeyModeBlock", "autoKeyModeHint", "autoKeyModeStatus"].forEach(function (id) { var el = document.getElementById(id); if (el && el.style) el.style.display = "none"; });
            var cur = typeof getSetting === "function" ? getSetting("autoKeyMode", null) : null;
            if (cur && typeof cur === "object" && cur.enabled === true && typeof setSetting === "function") setSetting("autoKeyMode", Object.assign({}, cur, { enabled: false }));
            en.checked = false;
        } catch (e) { /* bỏ qua */ }
        return;
        var c = cfg(); en.checked = c.enabled; wt.value = c.waitSec;
        function show() { if (st) st.textContent = en.checked ? "Auto-Key: ĐANG BẬT — chờ " + clampWait(wt.value) + " giây giữa bước dò và Send." : ""; }
        // AUTOKEY-SYNC-01: giữ các trường khác (via...) khi lưu, để Setup không xoá chọn lựa đã lưu.
        function save() { var v = {}; var p = raw(); for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) v[k] = p[k]; v.enabled = en.checked; v.waitSec = clampWait(wt.value); wt.value = v.waitSec; if (typeof setSetting === "function") setSetting("autoKeyMode", v); show(); }
        // AUTOKEY-SYNC-01: thẻ "Tự dò bằng tay / Dò bằng AI" ở Menu đổi chế độ -> ô Bật ở đây tự cập nhật (không cần mở lại Setup).
        function sync() { try { var n = cfg(); if (document.activeElement !== wt) wt.value = n.waitSec; if (en.checked !== n.enabled) { en.checked = n.enabled; } show(); } catch (e) { /* bỏ qua */ } }
        en.addEventListener("change", save); wt.addEventListener("change", save); show();
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("focus", sync);
        if (typeof setInterval === "function") setInterval(sync, 2000);
    }
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
    if (typeof window !== "undefined") window.setupAutoKey = { init: init, clampWait: clampWait };
    if (typeof module !== "undefined") module.exports = { clampWait: clampWait };
})();
