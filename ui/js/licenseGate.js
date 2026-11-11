/* LICENSE-01 — Màn hình "Cần kích hoạt". Chỉ relay qua IPC (logic thật ở app/LicenseManager.js; main.js tự mở lại app sau khi kích hoạt thành công). */
(function () {
    function $(id) { return document.getElementById(id); }
    function api() { return window.electronAPI || {}; }
    function result(text, cls) {
        const r = $("gateResult");
        if (!r) return;
        r.style.display = text ? "" : "none";
        r.textContent = text || "";
        r.className = "status-text" + (cls ? " " + cls : "");
    }

    function render(st) {
        st = st || {};
        $("gateMessage").textContent = st.message || "Chưa kích hoạt. Cần nhập key để sử dụng MENU.";
        $("gateMachine").textContent = st.machineCode || "không đọc được";
        $("btnGateRecheck").style.display = st.code === "NEED_ONLINE" ? "" : "none";
    }

    function load() {
        if (typeof api().licenseStatus !== "function") { render({ message: "Thiếu kênh IPC license." }); return Promise.resolve(); }
        return Promise.resolve(api().licenseStatus()).then(render).catch((e) => render({ message: "Không đọc được trạng thái license: " + (e && e.message ? e.message : e) }));
    }

    function init() {
        if (!$("gateKey")) return;
        let busy = false;
        const bAct = $("btnGateActivate"), bCopy = $("btnGateCopy"), bRe = $("btnGateRecheck"), input = $("gateKey");
        function lock(on) { busy = on; [bAct, bCopy, bRe, input].forEach((el) => { if (el) el.disabled = on; }); }

        function activate() {
            if (busy) return;
            const key = input.value.trim();
            if (!key) { result("Hãy nhập key.", "gate-bad"); return; }
            lock(true); result("⏳ Đang kích hoạt…");
            Promise.resolve(api().licenseActivate(key)).then((r) => {
                if (!r || !r.ok) { result("❌ " + ((r && r.message) || "Kích hoạt thất bại."), "gate-bad"); lock(false); return; }
                result("✅ Kích hoạt thành công. Đang mở MENU…", "gate-ok"); // main.js sẽ tự khởi động lại app; giữ nút khoá
            }).catch((e) => { result("❌ " + (e && e.message ? e.message : e), "gate-bad"); lock(false); });
        }

        bAct.addEventListener("click", activate);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });
        bCopy.addEventListener("click", () => {
            Promise.resolve(api().licenseCopyMachine()).then((r) => result(r && r.ok ? "Đã sao chép mã máy." : "Không sao chép được mã máy.", r && r.ok ? "gate-ok" : "gate-bad")).catch(() => {});
        });
        bRe.addEventListener("click", () => {
            if (busy) return;
            lock(true); result("⏳ Đang kiểm tra với server…");
            Promise.resolve(api().licenseRefresh()).then((st) => {
                render(st);
                if (st && st.licensed) { result("✅ License hợp lệ. Đang mở MENU…", "gate-ok"); return; }
                result("❌ " + ((st && st.message) || "Chưa xác minh được license."), "gate-bad"); lock(false);
            }).catch((e) => { result("❌ " + (e && e.message ? e.message : e), "gate-bad"); lock(false); });
        });
        load();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
