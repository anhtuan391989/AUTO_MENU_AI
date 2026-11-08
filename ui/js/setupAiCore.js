/* A113 — Setup > AI > "AI Core": nối THẬT 2 núm "Auto Apply" và "Debug" (10 núm còn lại giữ khoá).
   Lưu vào appSettings.aiCore = { autoApply, debug } (getSetting/setSetting có sẵn). Menu đọc lại file mỗi ≤2 giây.
   Mặc định: autoApply = BẬT (giữ đúng hành vi cũ — AI tự gửi Key), debug = TẮT. Không đổi HTML: tìm ô theo chữ nhãn. */
(function () {
    "use strict";
    function field(labels) { // nhãn có thể đã bị i18n dịch (Auto Apply <-> Tự áp dụng) nên nhận cả 2
        labels = [].concat(labels);
        var els = document.querySelectorAll(".placeholder-grid .ph-field");
        for (var i = 0; i < els.length; i++) {
            var first = els[i].firstChild;
            if (first && first.nodeType === 3 && labels.indexOf(first.nodeValue.trim()) >= 0) return els[i].querySelector("input[type=checkbox]");
        }
        return null;
    }
    function cfg() {
        var c = typeof getSetting === "function" ? getSetting("aiCore", null) : null;
        c = c && typeof c === "object" ? c : {};
        return { autoApply: c.autoApply !== false, debug: c.debug === true };
    }
    function save(patch) {
        var cur = cfg(); var next = { autoApply: cur.autoApply, debug: cur.debug };
        for (var k in patch) next[k] = patch[k];
        if (typeof setSetting === "function") setSetting("aiCore", next);
    }
    function init() {
        var aa = field(["Auto Apply", "Tự áp dụng"]), dbg = field(["Debug", "Gỡ lỗi"]);
        if (!aa || !dbg) return;
        var c = cfg();
        aa.disabled = false; aa.checked = c.autoApply;
        dbg.disabled = false; dbg.checked = c.debug;
        aa.addEventListener("change", function () { save({ autoApply: aa.checked }); });
        dbg.addEventListener("change", function () { save({ debug: dbg.checked }); });
        var t = null, titles = document.querySelectorAll(".panel-card-title");
        for (var i = 0; i < titles.length; i++) {
            if (/AI Core|Lõi AI/.test(titles[i].textContent)) { t = titles[i].querySelector(".badge"); if (t) break; }
        }
        if (t) { t.textContent = "2/12 đã nối: Auto Apply, Debug — 10 núm còn lại chưa nối"; t.className = "badge badge-soon"; }
    }
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
    if (typeof window !== "undefined") window.setupAiCore = { init: init };
    if (typeof module !== "undefined") module.exports = { init: init };
})();
