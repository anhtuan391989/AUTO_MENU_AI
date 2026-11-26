/* HIDE-DAW-01 / A105 — Setup > AI > thẻ Hidden DAW: ô tick "Enable Hidden DAW" (tick = ẨN DAW, bỏ tick = HIỆN DAW) + ô "Start Hidden" (A106: tự ẩn sau khi DAW mở xong VST + project; lưu hiddenDaw.startHidden).
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
        if (pathEl) pathEl.textContent = (st && st.configured ? "DAW: " + st.exePath : "❌ Chưa chọn file chạy của DAW (AI > Đường dẫn & khởi động)") + (st && st.build ? "  ·  bản " + st.build + "  ·  log: " + st.diagFile : "") + (st && st.startHidden && st.startHidden.phase && st.startHidden.phase !== "off" ? "  ·  Start Hidden: " + st.startHidden.detail : ""); // A101/A106: hiện bản + nơi ghi log
        if (badge) {
            if (st && st.state === "unknown") { badge.textContent = "CHƯA XÁC MINH"; badge.className = "badge badge-unwired"; } // A99: không đọc được tiến trình => KHÔNG báo "chưa chạy"
            else if (st && st.state === "path_mismatch") { badge.textContent = "SAI ĐƯỜNG DẪN DAW"; badge.className = "badge badge-unwired"; }
            else if (st && st.state === "not_running") { badge.textContent = "DAW CHƯA CHẠY"; badge.className = "badge badge-unwired"; } // A98: 3 trạng thái thật (đã dò tiến trình DAW)
            else if (st && st.hidden) { badge.textContent = "ĐANG ẨN"; badge.className = "badge badge-live"; }
            else { badge.textContent = "ĐANG HIỆN"; badge.className = "badge badge-soon"; }
        }
        // A106: 1 ô tick duy nhất thay 2 nút. Luôn phản ánh trạng thái THẬT (đang ẩn => tick). Chỉ khoá khi đang bận; KHÔNG khoá theo trạng thái dò (giữ đường khôi phục như A100).
        const en = $("hiddenDawEnable");
        if (en) { en.checked = !!(st && st.hidden); en.disabled = busy; }
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
        { const en0 = $("hiddenDawEnable"); if (en0) en0.disabled = true; } // A106: khoá ô tick trong lúc đang xử lý
        let timer;
        try {
            const timeout = new Promise((res) => { timer = setTimeout(() => res({ __timeout: true }), 30000); });
            const r = await Promise.race([fn.call(a), timeout]);
            if (r && r.__timeout) setMessage("Menu không trả lời sau 30 giây (kênh IPC treo hoặc đang chạy bản cũ). Xem daw-hide-diagnostic.log.", false);
            else setMessage((r && r.message) || (r && r.ok ? "Xong." : "Không thực hiện được."), !!(r && r.ok));
        } catch (e) { setMessage("Lỗi: " + (e && e.message || e), false); }
        if (timer) clearTimeout(timer);
        busy = false;
        { const en1 = $("hiddenDawEnable"); if (en1) en1.disabled = false; }
        refresh(true); // giữ nguyên thông báo kết quả vừa thao tác
    }
    // A106 — Start Hidden: lưu qua đúng cơ chế setSetting/getSetting của app (appSettings.js) => main đọc được ở app-settings.json (hiddenDaw.startHidden).
    function loadStartHidden() {
        const sh = $("hiddenDawStartHidden"); if (!sh) return;
        try { if (typeof refreshFromSharedFile === "function") refreshFromSharedFile(); } catch (e) { /* dùng bản đang có */ }
        try { const cur = typeof getSetting === "function" ? getSetting("hiddenDaw", {}) : {}; sh.checked = !!(cur && cur.startHidden === true); } catch (e) { sh.checked = false; }
    }
    function saveStartHidden() {
        const sh = $("hiddenDawStartHidden"); if (!sh) return;
        const want = !!sh.checked;
        try {
            if (typeof getSetting !== "function" || typeof setSetting !== "function") throw new Error("không có cơ chế lưu cấu hình (chỉ chạy trong app Menu)");
            const cur = getSetting("hiddenDaw", {});
            const ok = setSetting("hiddenDaw", { ...(cur && typeof cur === "object" ? cur : {}), startHidden: want });
            if (ok !== true) throw new Error("ghi cấu hình thất bại");
            setMessage(want ? "Đã lưu: Start Hidden BẬT — lần mở DAW tới, Menu sẽ tự ẩn DAW sau khi DAW nạp xong VST + project." : "Đã lưu: Start Hidden TẮT.", true);
        } catch (e) { sh.checked = !want; setMessage("Không lưu được Start Hidden: " + (e && e.message || e), false); }
    }
    document.addEventListener("DOMContentLoaded", () => {
        const en = $("hiddenDawEnable");
        en?.addEventListener("change", () => act(en.checked ? "hide" : "show"));
        loadStartHidden();
        $("hiddenDawStartHidden")?.addEventListener("change", saveStartHidden);
        $("sidebarNav")?.addEventListener("click", (e) => { const b = e.target.closest(".nav-item"); if (b && b.dataset.panel === "panel-ai") { loadStartHidden(); refresh(); } });
        refresh();
    });
})();

/* ASIO-LINK-01 — Setup > Audio > thẻ "ASIO Link Pro (khi chọn sai driver / mất tiếng)". Tạo bằng JS (KHÔNG sửa HTML).
   Chọn file .exe của ASIO Link Pro (lưu setting asioLinkPath) -> nút Mở / Khởi động lại (main process đóng đúng tiến trình đó rồi chạy lại) + hướng dẫn 3 bước. */
(function () {
    "use strict";
    function build() {
        const panel = document.getElementById("panel-audio");
        if (!panel || document.getElementById("asioLinkCard")) return;
        const card = document.createElement("div");
        card.className = "panel-card";
        card.id = "asioLinkCard";
        card.innerHTML =
            '<div class="panel-card-title">🔊 ASIO Link Pro (khi chọn sai driver / mất tiếng)</div>'
            + '<div id="asioLinkPath" class="status-text" style="margin-bottom:8px;word-break:break-all;">❌ Chưa chọn file ASIO Link Pro</div>'
            + '<div class="row-buttons">'
            + '<button id="asioLinkBrowse" class="setup-btn">📂 Chọn file ASIO Link Pro (.exe)</button>'
            + '<button id="asioLinkOpen" class="setup-btn">▶ Mở ASIO Link Pro</button>'
            + '<button id="asioLinkRestart" class="setup-btn">🔄 Khởi động lại ASIO Link Pro</button>'
            + '</div>'
            + '<div id="asioLinkMsg" class="status-text" style="margin-top:8px;"></div>'
            + '<div style="margin-top:10px;font-size:12px;line-height:1.6;opacity:.85;">'
            + '<b>Cách sửa khi mất tiếng / Studio One báo "Link Pro could not be initialized":</b><br>'
            + '1) Trong ASIO Link Pro bấm <b>Pick driver</b> → chọn <b>Focusrite USB ASIO</b> (không chọn ASIO4ALL) → OK; bật <b>Enable multi-clients</b>.<br>'
            + '2) Nếu vẫn lỗi: tắt phần mềm khác đang giữ Focusrite (ASIO4ALL, OBS...), rồi bấm <b>Khởi động lại ASIO Link Pro</b> ở đây.<br>'
            + '3) Quay lại Studio One bấm <b>Retry</b>.'
            + '</div>';
        panel.appendChild(card);
        const $ = (id) => document.getElementById(id);
        const msg = (t, ok) => { const el = $("asioLinkMsg"); if (el) { el.textContent = t || ""; el.style.color = ok === false ? "#ff6b6b" : ""; } };
        const paintPath = () => { let p = ""; try { p = getSetting("asioLinkPath", "") || ""; } catch (e) { /* bỏ qua */ } $("asioLinkPath").textContent = p ? p : "❌ Chưa chọn file ASIO Link Pro"; };
        paintPath();
        let busy = false;
        const run = async (fnName, label) => {
            const a = window.electronAPI;
            if (busy) { msg("Đang xử lý, đợi xong rồi bấm lại.", false); return; }
            if (!a || typeof a[fnName] !== "function") { msg("Chức năng này chỉ có khi mở Setup từ app Menu (Electron).", false); return; }
            busy = true; msg(label + "…");
            try { const r = await a[fnName](); msg((r && r.message) || (r && r.ok ? "Xong." : "Không thực hiện được."), !!(r && r.ok)); }
            catch (e) { msg("Lỗi: " + ((e && e.message) || e), false); }
            finally { busy = false; }
        };
        $("asioLinkBrowse").addEventListener("click", async () => {
            const a = window.electronAPI;
            if (!a || typeof a.selectFile !== "function") { msg("Chức năng này chỉ có khi mở Setup từ app Menu (Electron).", false); return; }
            try {
                const p = await a.selectFile({ filters: [{ name: "Chương trình (.exe)", extensions: ["exe"] }, { name: "All Files", extensions: ["*"] }] });
                if (p) { setSetting("asioLinkPath", p); paintPath(); msg("Đã lưu đường dẫn.", true); }
            } catch (e) { msg("Chọn file lỗi: " + ((e && e.message) || e), false); }
        });
        $("asioLinkOpen").addEventListener("click", () => run("asioLinkOpen", "Đang mở ASIO Link Pro"));
        $("asioLinkRestart").addEventListener("click", () => run("asioLinkRestart", "Đang khởi động lại ASIO Link Pro"));
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
