/* A119 — Setup > Calibration: Chế độ Auto-Key (Plugin tự dò). Lưu appSettings.autoKeyMode = { enabled, waitSec }.
   Menu đọc lại file ≤2 giây/lần (renderer.js: __aiCoreCfg / runAutoKeyDetect). Mặc định TẮT = hành vi cũ. */
(function () {
    "use strict";
    function clampWait(v) { v = Math.round(Number(v)); return isFinite(v) ? Math.min(60, Math.max(1, v)) : 8; }
    function cfg() {
        var c = typeof getSetting === "function" ? getSetting("autoKeyMode", null) : null;
        c = c && typeof c === "object" ? c : {};
        return { enabled: c.enabled === true, waitSec: clampWait(c.waitSec === undefined ? 8 : c.waitSec) };
    }
    function init() {
        var en = document.getElementById("autoKeyModeEnable"), wt = document.getElementById("autoKeyWaitSec"), st = document.getElementById("autoKeyModeStatus");
        if (!en || !wt) return;
        var c = cfg(); en.checked = c.enabled; wt.value = c.waitSec;
        function show() { if (st) st.textContent = en.checked ? "Auto-Key: ĐANG BẬT — chờ " + clampWait(wt.value) + " giây giữa bước dò và Send." : ""; }
        function save() { var v = { enabled: en.checked, waitSec: clampWait(wt.value) }; wt.value = v.waitSec; if (typeof setSetting === "function") setSetting("autoKeyMode", v); show(); }
        en.addEventListener("change", save); wt.addEventListener("change", save); show();
    }
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
    if (typeof window !== "undefined") window.setupAutoKey = { init: init, clampWait: clampWait };
    if (typeof module !== "undefined") module.exports = { clampWait: clampWait };
})();
