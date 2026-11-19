/* setupMidiMacro.js — TASK A-MACRO-01
   Giao diện Setup cho MIDI Macro: 1 MIDI trigger -> chuỗi tối đa 5 action. Lưu vào appSettings key "midiMacrosV1"
   (cùng hệ thống lưu của midiMappingsV1). Bộ chạy thật nằm ở main process: core/command-engine-js/runtime.js (D1-gated). */
(function () {
    const KEY = "midiMacrosV1";
    const MAPPING_KEY = "midiMappingsV1";
    const MAX_STEPS = 5;
    // Khớp CAPABILITY_BACKEND_TARGET (core/command-engine-js/d1Loader.js).
    const STEP_OPTIONS = [["daw:play", "Play"], ["daw:stop", "Stop"], ["daw:record", "Record"], ["daw:undo", "Undo"], ["daw:redo", "Redo"], ["daw:loop", "Loop"], ["daw:metronome", "Metronome"]];
    const $ = (id) => document.getElementById(id);
    const get = (k) => { try { const v = typeof getSetting === "function" ? getSetting(k) : null; return Array.isArray(v) ? v : []; } catch (_) { return []; } };

    function buildStepSelects() {
        const box = $("macroSteps");
        if (!box || box.children.length) return;
        for (let i = 1; i <= MAX_STEPS; i++) {
            const sel = document.createElement("select");
            sel.className = "ph-select"; sel.id = "macroStep" + i;
            sel.innerHTML = '<option value="">' + (i === 1 ? "Bước 1 (bắt buộc)…" : "Bước " + i + " (tuỳ chọn)") + "</option>" +
                STEP_OPTIONS.map(([v, t]) => '<option value="' + v + '">' + t + "</option>").join("");
            box.appendChild(sel);
        }
    }

    function render() {
        const list = $("macroList"); if (!list) return;
        const macros = get(KEY);
        if (!macros.length) { list.innerHTML = '<div class="midi-monitor-empty">Chưa có Macro nào.</div>'; return; }
        list.innerHTML = "";
        macros.forEach((m, idx) => {
            const row = document.createElement("div");
            row.className = "mapping-saved-row";
            const names = m.steps.map((s) => (STEP_OPTIONS.find((o) => o[0] === s) || [s, s])[1]).join(" → ");
            row.innerHTML = "<span>" + String(m.type).toUpperCase() + " " + m.number + " ch" + m.channel + "</span><span>→ " + names + "</span>" +
                '<span class="badge badge-live">trễ ' + (m.delayMs ?? 150) + " ms</span>" +
                '<button class="setup-btn macro-del-btn" data-idx="' + idx + '">🗑</button>';
            list.appendChild(row);
        });
        list.querySelectorAll(".macro-del-btn").forEach((b) => b.addEventListener("click", () => {
            const cur = get(KEY); cur.splice(Number(b.dataset.idx), 1); persist(cur); render();
        }));
    }

    function persist(list) {
        if (typeof setSetting === "function") setSetting(KEY, list);
        try { window.electronAPI && window.electronAPI.notifySetupChanged && window.electronAPI.notifySetupChanged(); } catch (_) {}
    }

    function say(msg, ok) { const el = $("macroStatus"); if (el) { el.textContent = msg; el.style.color = ok ? "" : "#ff8080"; } }

    function save() {
        const type = $("macroType").value;
        const channel = Number($("macroChannel").value), number = Number($("macroNumber").value), delayMs = Number($("macroDelay").value);
        if (!Number.isInteger(channel) || channel < 1 || channel > 16) return say("Channel phải từ 1 đến 16.", false);
        if (!Number.isInteger(number) || number < 0 || number > 127) return say("Number phải từ 0 đến 127.", false);
        const steps = [];
        for (let i = 1; i <= MAX_STEPS; i++) { const v = $("macroStep" + i).value; if (v) steps.push(v); }
        if (!steps.length) return say("Chọn ít nhất 1 bước.", false);
        const dup = get(MAPPING_KEY).find((m) => m.type === type && Number(m.channel) === channel && Number(m.number) === number);
        if (dup) return say("Trùng Mapping đơn đã lưu (" + dup.action + ") — chọn số khác.", false);
        const cur = get(KEY);
        if (cur.some((m) => m.type === type && Number(m.channel) === channel && Number(m.number) === number)) return say("Đã có Macro dùng đúng số MIDI này.", false);
        cur.push({ id: "macro-" + Date.now(), type, channel, number, steps, delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? Math.min(delayMs, 2000) : 150 });
        persist(cur); render();
        say("Đã lưu Macro (" + steps.length + " bước).", true);
    }

    window.addEventListener("load", () => setTimeout(() => { buildStepSelects(); render(); $("macroSaveBtn")?.addEventListener("click", save); }, 450));
})();
