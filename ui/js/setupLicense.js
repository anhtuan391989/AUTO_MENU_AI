/* LICENSE-01 — Setup > System & Backup > License / kích hoạt. Chỉ relay qua IPC (logic thật ở app/LicenseManager.js).
   Dòng "License / kích hoạt" có sẵn trong setup.html; các ô còn lại (mã máy, nhập key, nút) được dựng bằng JS, dùng lại class CSS sẵn có. */
(function () {
    function $(id) { return document.getElementById(id); }
    function api() { return window.electronAPI || {}; }

    function init() {
        const box = $("licenseBox"), sum = $("licenseSummary");
        if (!box || !sum) return;

        const codeRow = document.createElement("div");
        codeRow.className = "soon-row";
        const codeLabel = document.createElement("b"); codeLabel.textContent = "Mã máy";
        const codeVal = document.createElement("span");
        const code = document.createElement("code"); code.id = "licenseMachine"; code.textContent = "…";
        codeVal.appendChild(code);
        codeRow.appendChild(codeLabel); codeRow.appendChild(codeVal);

        const keyRow = document.createElement("div");
        keyRow.className = "row-buttons";
        const input = document.createElement("input");
        input.type = "text"; input.id = "licenseKeyInput"; input.placeholder = "MENU-XXXXX-XXXXX-XXXXX-XXXXX";
        input.maxLength = 40; input.spellcheck = false; input.autocomplete = "off"; input.style.cssText = "flex:1;min-width:230px;text-transform:uppercase;";
        const bAct = document.createElement("button"); bAct.id = "btnLicenseActivate"; bAct.className = "setup-btn"; bAct.textContent = "🔑 Kích hoạt / Gia hạn";
        const bCopy = document.createElement("button"); bCopy.id = "btnLicenseCopy"; bCopy.className = "setup-btn"; bCopy.textContent = "📋 Sao chép mã máy";
        const bRe = document.createElement("button"); bRe.id = "btnLicenseRecheck"; bRe.className = "setup-btn"; bRe.textContent = "🔄 Kiểm tra lại";
        [input, bAct, bCopy, bRe].forEach((el) => keyRow.appendChild(el));

        const msg = document.createElement("div");
        msg.className = "status-text"; msg.id = "licenseMessage"; msg.style.display = "none";

        box.appendChild(codeRow); box.appendChild(keyRow); box.appendChild(msg);

        function say(t) { msg.style.display = t ? "" : "none"; msg.textContent = t || ""; }
        function render(st) {
            st = st || {};
            sum.textContent = st.message || "Không đọc được trạng thái license.";
            code.textContent = st.machineCode || "không đọc được";
        }
        function load() {
            if (typeof api().licenseStatus !== "function") { sum.textContent = "Thiếu kênh IPC license."; return; }
            Promise.resolve(api().licenseStatus()).then(render).catch(() => { sum.textContent = "Không đọc được trạng thái license."; });
        }

        let busy = false;
        function lock(on) { busy = on; [input, bAct, bCopy, bRe].forEach((el) => { el.disabled = on; }); }

        function activate() {
            if (busy) return;
            const key = input.value.trim();
            if (!key) { say("Hãy nhập key."); return; }
            lock(true); say("⏳ Đang kích hoạt…");
            Promise.resolve(api().licenseActivate(key)).then((r) => {
                if (!r || !r.ok) { say("❌ " + ((r && r.message) || "Kích hoạt thất bại.")); return; }
                input.value = ""; say("✅ Kích hoạt thành công."); render(r.status);
            }).catch((e) => say("❌ " + (e && e.message ? e.message : e))).finally(() => lock(false));
        }
        bAct.addEventListener("click", activate);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });
        bCopy.addEventListener("click", () => {
            Promise.resolve(api().licenseCopyMachine()).then((r) => say(r && r.ok ? "Đã sao chép mã máy." : "Không sao chép được mã máy.")).catch(() => {});
        });
        bRe.addEventListener("click", () => {
            if (busy) return;
            lock(true); say("⏳ Đang kiểm tra với server…");
            Promise.resolve(api().licenseRefresh()).then((st) => { render(st); say(st && st.licensed ? "✅ License hợp lệ." : "❌ " + ((st && st.message) || "Chưa xác minh được license.")); })
                .catch((e) => say("❌ " + (e && e.message ? e.message : e))).finally(() => lock(false));
        });

        load();
        window.addEventListener("focus", load);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
