/* APP-UPDATE-01 — Setup > System & Backup > Phiên bản / Cập nhật. Chỉ relay qua IPC (logic thật ở app/AppUpdater.js). */
(function () {
    function $(id) { return document.getElementById(id); }
    function api() { return window.electronAPI || {}; }
    function show(el, on) { if (el) el.style.display = on ? "" : "none"; }
    function msg(t) { const m = $("appUpdateMessage"); if (m) m.textContent = t || ""; }

    function loadVersion() {
        const el = $("appVersionText");
        if (!el) return;
        if (typeof api().getAppVersion !== "function") { el.textContent = "Phiên bản: không đọc được (thiếu IPC)"; return; }
        Promise.resolve(api().getAppVersion()).then((r) => {
            if (!r || !r.ok) { el.textContent = "Phiên bản: không đọc được"; return; }
            el.textContent = "Phiên bản: " + r.version + (r.commit ? " · bản dựng " + r.commit : "") + (r.isGit ? "" : " · (không phải git repo — không cập nhật được)");
        }).catch(() => { el.textContent = "Phiên bản: không đọc được"; });
    }

    function init() {
        const bCheck = $("btnCheckUpdate"), bApply = $("btnApplyUpdate"), bRelaunch = $("btnRelaunchApp");
        if (!bCheck) return;
        loadVersion();
        let busy = false;
        function lock(on) { busy = on; [bCheck, bApply, bRelaunch].forEach((b) => { if (b) b.disabled = on; }); }

        bCheck.addEventListener("click", () => {
            if (busy) return;
            if (typeof api().checkAppUpdate !== "function") { msg("❌ Thiếu kênh IPC cập nhật."); return; }
            lock(true); show(bApply, false); msg("⏳ Đang kiểm tra GitHub…");
            Promise.resolve(api().checkAppUpdate()).then((r) => {
                if (!r || !r.ok) { msg("❌ " + ((r && r.message) || "Không kiểm tra được.")); return; }
                if (!r.available) { msg("✅ Bạn đang dùng bản mới nhất" + (r.latest ? " (" + r.latest + ")" : "") + "."); return; }
                msg("🆕 Có bản mới: hơn bản hiện tại " + r.behind + " thay đổi" + (r.latest ? " (mới nhất " + r.latest + ")" : "") + "." +
                    (r.diverged ? " ⚠ Máy bạn có thay đổi chưa đẩy lên GitHub — nếu git từ chối, hãy chạy sync.bat trước." : ""));
                show(bApply, true);
            }).catch((e) => msg("❌ " + (e && e.message ? e.message : e))).finally(() => lock(false));
        });

        bApply.addEventListener("click", () => {
            if (busy) return;
            if (!window.confirm("Cập nhật app lên bản mới nhất từ GitHub?\nSau khi xong bạn cần khởi động lại app.")) return;
            lock(true); msg("⏳ Đang cập nhật…");
            Promise.resolve(api().applyAppUpdate()).then((r) => {
                if (!r || !r.ok) { msg("❌ " + ((r && r.message) || "Cập nhật thất bại.")); return; }
                show(bApply, false);
                if (!r.updated) { msg("✅ " + (r.message || "Đã là bản mới nhất.")); return; }
                if (r.needInstall) { msg("✅ Đã tải bản mới (" + (r.commit || "") + "), nhưng bản này đổi thư viện: hãy đóng app, chạy 'npm install' trong thư mục app rồi mở lại. (Không khởi động lại tự động.)"); return; }
                msg("✅ Đã cập nhật lên " + (r.commit || "bản mới") + ". Bấm nút bên dưới để khởi động lại.");
                show(bRelaunch, true); loadVersion();
            }).catch((e) => msg("❌ " + (e && e.message ? e.message : e))).finally(() => lock(false));
        });

        bRelaunch.addEventListener("click", () => {
            if (busy) return;
            Promise.resolve(api().relaunchApp()).catch(() => {});
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
