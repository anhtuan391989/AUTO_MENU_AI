/* HIDE-DAW-01 — Setup > Công cụ & Sửa lỗi > Ẩn DAW xuống khay thông báo.
   Chỉ gọi 3 kênh IPC của main process (toolsDawStatus / toolsDawHide / toolsDawShow); không tự ẩn/hiện gì ở đây. Mọi lỗi hiện thành chữ, không throw. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const api = () => window.electronAPI || null;
    let busy = false;

    function setMessage(text, ok) {
        const el = $("toolsDawMessage");
        if (!el) return;
        el.textContent = text || "";
        el.style.color = ok === false ? "#ff6b6b" : "";
    }
    function paint(st) {
        const badge = $("toolsDawBadge"), pathEl = $("toolsDawPath");
        if (pathEl) pathEl.textContent = st && st.configured ? "DAW: " + st.exePath : "❌ Chưa chọn file chạy của DAW (AI > Đường dẫn & khởi động)";
        if (badge) {
            if (st && st.state === "unknown") { badge.textContent = "CHƯA XÁC MINH"; badge.className = "badge badge-unwired"; } // A99: không đọc được tiến trình => KHÔNG báo "chưa chạy"
            else if (st && st.state === "path_mismatch") { badge.textContent = "SAI ĐƯỜNG DẪN DAW"; badge.className = "badge badge-unwired"; }
            else if (st && st.state === "not_running") { badge.textContent = "DAW CHƯA CHẠY"; badge.className = "badge badge-unwired"; } // A98: 3 trạng thái thật (đã dò tiến trình DAW)
            else if (st && st.hidden) { badge.textContent = "ĐANG ẨN"; badge.className = "badge badge-live"; }
            else { badge.textContent = "ĐANG HIỆN"; badge.className = "badge badge-soon"; }
        }
        const hideBtn = $("btnToolsHideDaw"), showBtn = $("btnToolsShowDaw");
        if (hideBtn) hideBtn.disabled = busy || !(st && st.configured) || !!(st && st.hidden) || !!(st && (st.state === "not_running" || st.state === "path_mismatch"));
        if (showBtn) showBtn.disabled = busy || !(st && st.hidden);
    }
    async function refresh(keepMessage) {
        const a = api();
        if (!a || typeof a.toolsDawStatus !== "function") { setMessage("Chức năng này chỉ có trong app Menu (Electron).", false); paint({ configured: false, hidden: false }); return; }
        try { const st = await a.toolsDawStatus(); paint(st); if (st && st.detail && (st.state === "unknown" || st.state === "path_mismatch") && !keepMessage) setMessage(st.detail, false); } catch (e) { setMessage("Không đọc được trạng thái: " + (e && e.message || e), false); }
    }
    async function act(kind) {
        const a = api();
        if (busy || !a) return;
        const fn = kind === "hide" ? a.toolsDawHide : a.toolsDawShow;
        if (typeof fn !== "function") { setMessage("Chức năng này chỉ có trong app Menu (Electron).", false); return; }
        busy = true; setMessage(kind === "hide" ? "Đang ẩn DAW…" : "Đang hiện DAW…");
        try {
            const r = await fn.call(a);
            setMessage((r && r.message) || (r && r.ok ? "Xong." : "Không thực hiện được."), !!(r && r.ok));
        } catch (e) { setMessage("Lỗi: " + (e && e.message || e), false); }
        busy = false;
        refresh(true); // giữ nguyên thông báo kết quả vừa thao tác
    }
    document.addEventListener("DOMContentLoaded", () => {
        $("btnToolsHideDaw")?.addEventListener("click", () => act("hide"));
        $("btnToolsShowDaw")?.addEventListener("click", () => act("show"));
        $("sidebarNav")?.addEventListener("click", (e) => { const b = e.target.closest(".nav-item"); if (b && b.dataset.panel === "panel-tools") refresh(); });
        refresh();
    });
})();
