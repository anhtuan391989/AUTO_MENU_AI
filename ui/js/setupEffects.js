/* setupEffects.js — MỚI. Mục "Hiệu Ứng" trong Cài đặt: quản lý danh sách nút của Bảng Hiệu Ứng.
   Chỉ nói chuyện với main qua electronAPI.effectsLibraryOp / getEffectsLibrary (xem app/EffectsLibrary.js).
   Không đụng setup.js / appSettings.js / setupNav.js. Tên hiệu ứng luôn đưa vào DOM bằng textContent. */
(function () {
    const api = window.electronAPI;
    const root = document.getElementById("fxLibRoot");
    const statusEl = document.getElementById("fxLibStatus");
    if (!api || !root) return;

    const GROUP_LABEL = { HIEUUNG: "HIỆU ỨNG", NHAC: "NHẠC" };
    let items = [];

    function say(msg) { statusEl.textContent = msg || ""; }

    async function run(op) {
        say("");
        try {
            const r = await api.effectsLibraryOp(op);
            if (r && r.ok === false) say(r.error || "Không thực hiện được.");
            return r;
        } catch (err) {
            say("Không thực hiện được: " + String((err && err.message) || err));
            return null;
        }
    }

    function el(tag, props, text) {
        const e = document.createElement(tag);
        if (props) Object.assign(e, props);
        if (text != null) e.textContent = text;
        return e;
    }

    function row(it) {
        const r = el("div");
        r.style.cssText = "display:flex;gap:6px;align-items:center;margin:4px 0;flex-wrap:wrap";

        const name = el("input", { type: "text", value: it.name, maxLength: 40 });
        name.style.cssText = "flex:1;min-width:140px";
        const saveName = () => {
            const v = name.value.trim();
            if (v && v !== it.name) run({ type: "rename", id: it.id, name: v });
            else name.value = it.name;
        };
        name.addEventListener("blur", saveName);
        name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); });

        const sel = el("select");
        Object.keys(GROUP_LABEL).forEach((g) => sel.appendChild(el("option", { value: g, selected: g === it.group }, GROUP_LABEL[g])));
        sel.addEventListener("change", () => run({ type: "move", id: it.id, group: sel.value }));

        const replace = el("button", { className: "setup-btn", title: "Chọn file âm thanh khác cho nút này" }, "Đổi file");
        replace.addEventListener("click", () => run({ type: "replace", id: it.id }));

        const del = el("button", { className: "setup-btn", title: "Xoá nút này" }, "Xóa");
        del.addEventListener("click", () => { if (confirm("Xoá nút \"" + it.name + "\"?")) run({ type: "remove", id: it.id }); });

        r.append(name, sel, replace, del);
        if (!it.exists) r.appendChild(el("span", { className: "hint-text" }, "⚠ thiếu file"));
        return r;
    }

    function render() {
        root.textContent = "";
        Object.keys(GROUP_LABEL).forEach((g) => {
            const list = items.filter((it) => it.group === g);
            const h = el("div", { className: "panel-card-title" }, GROUP_LABEL[g] + " (" + list.length + ")");
            h.style.marginTop = "14px";
            root.appendChild(h);
            if (list.length === 0) root.appendChild(el("p", { className: "hint-text" }, "Chưa có nút nào."));
            list.forEach((it) => root.appendChild(row(it)));
        });
    }

    function setItems(list) { items = Array.isArray(list) ? list : []; render(); }

    document.getElementById("fxAddHieuUng")?.addEventListener("click", () => run({ type: "add", group: "HIEUUNG" }));
    document.getElementById("fxAddNhac")?.addEventListener("click", () => run({ type: "add", group: "NHAC" }));
    document.getElementById("fxResetLib")?.addEventListener("click", () => {
        if (confirm("Khôi phục toàn bộ danh sách hiệu ứng về mặc định? Các nút bạn đã thêm/đổi sẽ mất.")) run({ type: "reset" });
    });

    api.getEffectsLibrary?.().then((r) => setItems(r && r.ok ? r.items : [])).catch(() => setItems([]));
    api.onEffectsLibChanged?.((list) => setItems(list));

    // Nút EDIT ở Bảng Hiệu Ứng -> nhảy thẳng tới mục này (bấm hộ nút sidebar để dùng đúng bộ chuyển panel có sẵn).
    api.onSetupGotoPanel?.((panelId) => {
        document.querySelector('.nav-item[data-panel="' + panelId + '"]')?.click();
    });
})();
