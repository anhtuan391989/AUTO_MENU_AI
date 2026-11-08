/* A113 — Setup > AI > "AI Core": nối THẬT 7 núm: Auto Apply, Debug, Ngưỡng, Độ tin cậy, Chế độ thời gian thực, Dò tức thì, Tốc độ phản ứng (5 núm còn lại giữ khoá).
   Lưu vào appSettings.aiCore = { autoApply, debug } (getSetting/setSetting có sẵn). Menu đọc lại file mỗi ≤2 giây.
   Mặc định: autoApply = BẬT (giữ đúng hành vi cũ — AI tự gửi Key), debug = TẮT. Không đổi HTML: tìm ô theo chữ nhãn. */
(function () {
    "use strict";
    function field(labels, sel) { // nhãn có thể đã bị i18n dịch (Auto Apply <-> Tự áp dụng) nên nhận cả 2
        labels = [].concat(labels);
        var els = document.querySelectorAll(".placeholder-grid .ph-field");
        for (var i = 0; i < els.length; i++) {
            var first = els[i].firstChild;
            if (first && first.nodeType === 3 && labels.indexOf(first.nodeValue.trim()) >= 0) return els[i].querySelector(sel || "input[type=checkbox]");
        }
        return null;
    }
    function cfg() {
        var c = typeof getSetting === "function" ? getSetting("aiCore", null) : null;
        c = c && typeof c === "object" ? c : {};
        var n = function (x) { return typeof x === "number" && isFinite(x) ? Math.round(Math.min(100, Math.max(0, x))) : 50; };
        return { autoApply: c.autoApply !== false, debug: c.debug === true, threshold: n(c.threshold), confidence: n(c.confidence), realtime: c.realtime !== false, instant: c.instant !== false, speed: (c.speed === "fast" || c.speed === "slow") ? c.speed : "medium" };
    }
    function save(patch) {
        var cur = cfg(); var next = { autoApply: cur.autoApply, debug: cur.debug, threshold: cur.threshold, confidence: cur.confidence, realtime: cur.realtime, instant: cur.instant, speed: cur.speed };
        for (var k in patch) next[k] = patch[k];
        if (typeof setSetting === "function") setSetting("aiCore", next);
    }
    function init() {
        var aa = field(["Auto Apply", "Tự áp dụng"]), dbg = field(["Debug", "Gỡ lỗi"]);
        if (!aa || !dbg) return;
        var th = field(["Threshold", "Ngưỡng"], "input[type=range]"), cf = field(["Confidence", "Độ tin cậy"], "input[type=range]");
        var c = cfg();
        // A115 — hiện SỐ cạnh mỗi thanh: vị trí 0–100 và giá trị thật đang áp vào KeyEngine (cùng công thức với renderer.js).
        var toMin = function (v) { return v >= 50 ? 0.55 + (v - 50) / 50 * 0.15 : 0.55 - (50 - v) / 50 * 0.10; };
        var toLock = function (v) { return v >= 50 ? 0.80 + (v - 50) / 50 * 0.12 : 0.80 - (50 - v) / 50 * 0.10; };
        [[th, "threshold", toMin], [cf, "confidence", toLock]].forEach(function (p) {
            var el = p[0]; if (!el) return;
            el.disabled = false; el.value = c[p[1]];
            var old = el.parentNode.querySelector(".ai-core-readout"); if (old) old.parentNode.removeChild(old);
            var out = document.createElement("span"); out.className = "ai-core-readout"; out.style.cssText = "display:block;font-size:12px;opacity:.85;margin-top:2px;";
            el.parentNode.appendChild(out);
            var show = function () { var v = Math.round(Number(el.value)); out.textContent = v + " / 100  →  " + p[2](v).toFixed(2) + (v === 50 ? "  (mặc định)" : ""); };
            show();
            el.addEventListener("input", show);
            el.addEventListener("change", function () { show(); var patch = {}; patch[p[1]] = Math.round(Number(el.value)); save(patch); });
        });
        // A116 — 3 núm mới: Chế độ thời gian thực, Dò tức thì (ô tích; mặc định BẬT = như cũ) và Tốc độ phản ứng (chọn Nhanh/Trung bình/Chậm).
        [[field(["Realtime mode", "Chế độ thời gian thực"]), "realtime"], [field(["Instant Detect", "Dò tức thì"]), "instant"]].forEach(function (p) {
            var el = p[0]; if (!el) return;
            el.disabled = false; el.checked = c[p[1]];
            el.addEventListener("change", function () { var patch = {}; patch[p[1]] = el.checked; save(patch); });
        });
        var sp = field(["Reaction Speed", "Tốc độ phản ứng"], "select");
        if (sp) {
            sp.innerHTML = "";
            [["fast", "Nhanh"], ["medium", "Trung bình"], ["slow", "Chậm"]].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sp.appendChild(op); });
            sp.value = c.speed; sp.disabled = false;
            sp.addEventListener("change", function () { save({ speed: sp.value }); });
        }
        aa.disabled = false; aa.checked = c.autoApply;
        dbg.disabled = false; dbg.checked = c.debug;
        aa.addEventListener("change", function () { save({ autoApply: aa.checked }); });
        dbg.addEventListener("change", function () { save({ debug: dbg.checked }); });
        var t = null, titles = document.querySelectorAll(".panel-card-title");
        for (var i = 0; i < titles.length; i++) {
            if (/AI Core|Lõi AI/.test(titles[i].textContent)) { t = titles[i].querySelector(".badge"); if (t) break; }
        }
        if (t) { t.textContent = "7/12 đã nối — 5 núm còn lại (Dò khóa, Dự đoán, Học, Bộ nhớ, Hiệu chỉnh) chưa có tính năng"; t.className = "badge badge-soon"; }
    }
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
    if (typeof window !== "undefined") window.setupAiCore = { init: init };
    if (typeof module !== "undefined") module.exports = { init: init };
})();
