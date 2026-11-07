/* HIDE-DAW-01 / A105 — Setup > AI > thẻ Hidden DAW > nút Ẩn DAW / Hiện DAW (đã gộp từ tab "Công cụ & Sửa lỗi" cũ; id phần tử giữ nguyên).
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
        if (pathEl) pathEl.textContent = (st && st.configured ? "DAW: " + st.exePath : "❌ Chưa chọn file chạy của DAW (AI > Đường dẫn & khởi động)") + (st && st.build ? "  ·  bản " + st.build + "  ·  log: " + st.diagFile : ""); // A101: hiện bản + nơi ghi log
        if (badge) {
            if (st && st.state === "unknown") { badge.textContent = "CHƯA XÁC MINH"; badge.className = "badge badge-unwired"; } // A99: không đọc được tiến trình => KHÔNG báo "chưa chạy"
            else if (st && st.state === "path_mismatch") { badge.textContent = "SAI ĐƯỜNG DẪN DAW"; badge.className = "badge badge-unwired"; }
            else if (st && st.state === "not_running") { badge.textContent = "DAW CHƯA CHẠY"; badge.className = "badge badge-unwired"; } // A98: 3 trạng thái thật (đã dò tiến trình DAW)
            else if (st && st.hidden) { badge.textContent = "ĐANG ẨN"; badge.className = "badge badge-live"; }
            else { badge.textContent = "ĐANG HIỆN"; badge.className = "badge badge-soon"; }
        }
        const hideBtn = $("btnToolsHideDaw"), showBtn = $("btnToolsShowDaw");
        // A101: nút Ẩn KHÔNG còn bị khoá theo trạng thái dò — nút xám bấm không phản hồi chính là "im lặng". Trạng thái không hợp lệ thì main trả lời bằng chữ rõ ràng.
        if (hideBtn) hideBtn.disabled = busy;
        // A100: nút Hiện chỉ bị khoá khi đang bận. KHÔNG khoá theo trạng thái dò (hidden/unknown/not_running...) — nếu trạng thái sai thì đây là đường khôi phục duy nhất; main tự tìm cửa sổ DAW đang ẩn.
        if (showBtn) showBtn.disabled = busy;
    }
    async function refresh(keepMessage) {
        const a = api();
        if (!a || typeof a.toolsDawStatus !== "function") { setMessage("Chức năng này chỉ có trong app Menu (Electron).", false); paint({ configured: false, hidden: false }); return; }
        try { const st = await a.toolsDawStatus(); paint(st); if (st && !st.build && !keepMessage) setMessage("⚠ Menu (main process) đang chạy bản CŨ — chưa có A101. Hãy THOÁT HẲN mọi cửa sổ/tiến trình AUTO MENU AI (kể cả dưới khay / Task Manager) rồi mở lại.", false); if (st && st.detail && (st.state === "unknown" || st.state === "path_mismatch") && !keepMessage) setMessage(st.detail, false); } catch (e) { setMessage("Không đọc được trạng thái: " + (e && e.message || e), false); const sb = $("btnToolsShowDaw"); if (sb) sb.disabled = busy; }
    }
    async function act(kind) {
        const verb = kind === "hide" ? "ẩn" : "hiện";
        setMessage("Đã nhận lệnh bấm " + (kind === "hide" ? "Ẩn" : "Hiện") + " DAW…"); // A101: phản hồi NGAY khi click, trước mọi kiểm tra — không còn đường im lặng
        const a = api();
        if (busy) { setMessage("Đang xử lý thao tác trước, đợi xong rồi bấm lại.", false); return; }
        if (!a) { setMessage("Không có kênh nối tới Menu (window.electronAPI trống) — hãy mở Setup từ app Menu.", false); return; }
        const fn = kind === "hide" ? a.toolsDawHide : a.toolsDawShow;
        if (typeof fn !== "function") { setMessage("Menu đang chạy là bản CŨ: thiếu kênh " + (kind === "hide" ? "toolsDawHide" : "toolsDawShow") + ". Thoát hẳn mọi tiến trình AUTO MENU AI rồi mở lại.", false); return; }
        busy = true; setMessage("Đang " + verb + " DAW…");
        let timer;
        try {
            const timeout = new Promise((res) => { timer = setTimeout(() => res({ __timeout: true }), 30000); });
            const r = await Promise.race([fn.call(a), timeout]);
            if (r && r.__timeout) setMessage("Menu không trả lời sau 30 giây (kênh IPC treo hoặc đang chạy bản cũ). Xem daw-hide-diagnostic.log.", false);
            else setMessage((r && r.message) || (r && r.ok ? "Xong." : "Không thực hiện được."), !!(r && r.ok));
        } catch (e) { setMessage("Lỗi: " + (e && e.message || e), false); }
        if (timer) clearTimeout(timer);
        busy = false;
        refresh(true); // giữ nguyên thông báo kết quả vừa thao tác
    }
    document.addEventListener("DOMContentLoaded", () => {
        $("btnToolsHideDaw")?.addEventListener("click", () => act("hide"));
        $("btnToolsShowDaw")?.addEventListener("click", () => act("show"));
        $("sidebarNav")?.addEventListener("click", (e) => { const b = e.target.closest(".nav-item"); if (b && b.dataset.panel === "panel-ai") refresh(); });
        refresh();
    });
})();
