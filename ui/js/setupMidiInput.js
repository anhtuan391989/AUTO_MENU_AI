/* setupMidiInput.js — MỚI THÊM. KHÔNG đụng appSettings.js/setup.js/Driver/IPC.
   Dùng navigator.requestMIDIAccess() (qua getMidiAccess() đã có sẵn trong appSettings.js) để:
   1) liệt kê INPUT thật + trạng thái Connected/Disconnected thật (input.state)
   2) MIDI Learn thật: lắng nghe input.onmidimessage, đọc đúng Note/CC/Channel/Value vừa nhận
   3) Lưu Mapping cục bộ (trigger -> tên action) qua setSetting/getSetting đã có sẵn — CHỈ LƯU,
      KHÔNG THỰC THI. Thực thi (bấm nút Menu / gửi lệnh DAW / Plugin thật) cần CommandEngine nối
      vào main.js (xem core/command-engine-js/ — phát hiện tồn tại nhưng chưa được require ở đâu
      trong app đang chạy) — nằm ngoài phạm vi sửa Setup UI, không tự ý làm ở đây. */
(function () {
    const MAPPING_KEY = "midiMappingsV1"; // lưu trong appSettings, không đụng key cũ nào
    let learnActive = false;
    let learnHandler = null;

    function els() {
        return {
            inputSelect: document.getElementById("midiInputSelect"),
            inputStatus: document.getElementById("midiInputStatus"),
            learnBtn: document.getElementById("btnMidiLearn"),
            cancelBtn: document.getElementById("btnMidiLearnCancel"),
            clearBtn: document.getElementById("btnMidiLearnClear"),
            learnResult: document.getElementById("midiLearnResult"),
            actionSelect: document.getElementById("midiLearnAction"),
            saveBtn: document.getElementById("btnMidiLearnSave"),
            mappingList: document.getElementById("midiMappingList"),
        };
    }

    function getMappings() {
        try {
            const raw = typeof getSetting === "function" ? getSetting(MAPPING_KEY) : null;
            return Array.isArray(raw) ? raw : [];
        } catch { return []; }
    }
    function saveMappings(list) {
        if (typeof setSetting === "function") setSetting(MAPPING_KEY, list);
    }

    async function refreshInputs() {
        const { inputSelect, inputStatus } = els();
        if (!inputSelect) return;
        if (typeof getMidiAccess !== "function") {
            if (inputStatus) inputStatus.textContent = "❌ Không tìm thấy getMidiAccess() (appSettings.js chưa tải xong).";
            return;
        }
        try {
            const access = await getMidiAccess();
            const inputs = [...access.inputs.values()];
            const prevValue = inputSelect.value;
            inputSelect.innerHTML = '<option value="">Chọn cổng MIDI Input...</option>';
            inputs.forEach((inp) => {
                const opt = document.createElement("option");
                opt.value = inp.id;
                opt.textContent = `${inp.name} (${inp.state})`;
                inputSelect.appendChild(opt);
            });
            if (prevValue) inputSelect.value = prevValue;

            if (inputs.length === 0) {
                if (inputStatus) inputStatus.textContent = "Không phát hiện MIDI Input nào đang cắm.";
            } else {
                const connected = inputs.filter((i) => i.state === "connected").length;
                if (inputStatus) inputStatus.textContent = `Phát hiện ${inputs.length} input, ${connected} đang Connected.`;
            }

            // Reconnect/Device change thật — Web MIDI tự bắn statechange khi cắm/rút thiết bị.
            access.onstatechange = () => refreshInputs();
        } catch (err) {
            console.error("Không lấy được MIDI Input:", err);
            if (inputStatus) inputStatus.textContent = "❌ Lỗi truy cập MIDI Input (có thể do trình duyệt chặn quyền).";
        }
    }

    function midiBytesToText(data) {
        const status = data[0];
        const type = status & 0xf0;
        const channel = (status & 0x0f) + 1;
        if (type === 0x90 && data[2] > 0) return { text: `NOTE ON ${data[1]} vel ${data[2]} ch${channel}`, kind: "note", number: data[1], value: data[2], channel };
        if (type === 0x80 || (type === 0x90 && data[2] === 0)) return { text: `NOTE OFF ${data[1]} ch${channel}`, kind: "noteoff", number: data[1], value: 0, channel };
        if (type === 0xb0) return { text: `CC${data[1]} = ${data[2]} ch${channel}`, kind: "cc", number: data[1], value: data[2], channel };
        if (type === 0xe0) return { text: `Pitch Bend ch${channel}`, kind: "pitchbend", number: 0, value: data[2], channel };
        if (type === 0xc0) return { text: `Program Change ${data[1]} ch${channel}`, kind: "pc", number: data[1], value: 0, channel };
        return { text: `MIDI [${[...data].join(",")}]`, kind: "raw", number: data[1] ?? 0, value: data[2] ?? 0, channel };
    }

    async function startLearn() {
        const { inputSelect, learnResult, learnBtn } = els();
        if (!inputSelect?.value) {
            if (learnResult) learnResult.textContent = "⚠ Chọn cổng MIDI Input trước khi Learn.";
            return;
        }
        try {
            const access = await getMidiAccess();
            const input = access.inputs.get(inputSelect.value);
            if (!input) {
                if (learnResult) learnResult.textContent = "❌ Không mở được cổng Input đã chọn.";
                return;
            }
            learnActive = true;
            if (learnBtn) learnBtn.textContent = "🎯 Đang chờ tín hiệu... (xoay/bấm controller)";
            if (learnResult) learnResult.textContent = "Đang lắng nghe MIDI Input thật...";

            learnHandler = (event) => {
                if (!learnActive) return;
                const parsed = midiBytesToText(event.data);
                if (parsed.kind === "noteoff") return; // bỏ qua note-off khi Learn, chỉ bắt note-on/cc/...
                learnActive = false;
                if (learnBtn) learnBtn.textContent = "🎯 Learn";
                if (learnResult) {
                    learnResult.textContent = `✅ Đã nhận: ${parsed.text}`;
                    learnResult.dataset.kind = parsed.kind;
                    learnResult.dataset.number = parsed.number;
                    learnResult.dataset.value = parsed.value;
                    learnResult.dataset.channel = parsed.channel;
                }
                input.onmidimessage = null;
            };
            input.onmidimessage = learnHandler;
        } catch (err) {
            console.error("Learn lỗi:", err);
            if (learnResult) learnResult.textContent = "❌ Không bắt đầu Learn được.";
        }
    }

    async function cancelLearn() {
        learnActive = false;
        const { inputSelect, learnBtn, learnResult } = els();
        if (learnBtn) learnBtn.textContent = "🎯 Learn";
        if (learnResult) learnResult.textContent = "Đã huỷ Learn.";
        try {
            const access = await getMidiAccess();
            const input = inputSelect?.value ? access.inputs.get(inputSelect.value) : null;
            if (input) input.onmidimessage = null;
        } catch { /* bỏ qua */ }
    }

    function clearLearnResult() {
        const { learnResult } = els();
        if (!learnResult) return;
        learnResult.textContent = "Chưa Learn.";
        delete learnResult.dataset.kind;
        delete learnResult.dataset.number;
        delete learnResult.dataset.value;
        delete learnResult.dataset.channel;
    }

    const DISPATCHABLE_ACTIONS = new Set(["daw:play", "daw:stop", "daw:record"]);

    function renderMappingList() {
        const { mappingList } = els();
        if (!mappingList) return;
        const list = getMappings();
        if (list.length === 0) {
            mappingList.innerHTML = '<div class="midi-monitor-empty">Chưa có Mapping nào được lưu.</div>';
            return;
        }
        mappingList.innerHTML = "";
        list.forEach((m, idx) => {
            const row = document.createElement("div");
            row.className = "mapping-saved-row";
            const live = DISPATCHABLE_ACTIONS.has(m.action);
            const statusBadge = live
                ? '<span class="badge badge-live">Đã nối Command Engine (Studio One Transport)</span>'
                : '<span class="badge badge-soon">Đã lưu — chưa nối capability nào</span>';
            row.innerHTML = `<span>${m.trigger}</span><span>→ ${m.action}</span>
                ${statusBadge}
                <button class="setup-btn mapping-del-btn" data-idx="${idx}">🗑</button>`;
            mappingList.appendChild(row);
        });
        mappingList.querySelectorAll(".mapping-del-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const list2 = getMappings();
                list2.splice(Number(btn.dataset.idx), 1);
                saveMappings(list2);
                renderMappingList();
                window.electronAPI?.notifySetupChanged?.();
            });
        });
    }

    // MIDI-MASTER-01 Mục 13 — DUPLICATE / CONFLICT PROTECTION. TRƯỚC bản vá này, saveLearnedMapping()
    // push() thẳng vào mảng, không kiểm tra xem {type,channel,number} vừa Learn đã được map cho
    // Function/action KHÁC hay chưa. Vì buildMappingIndex() (core/command-engine-js/runtime.js) xây
    // Map theo đúng key này, 2 entry trùng key sẽ bị ghi đè ÂM THẦM lúc dispatch — chỉ entry cuối
    // mảng còn hiệu lực — dù renderMappingList() vẫn hiển thị CẢ HAI như đang hoạt động (đã ghi
    // trong báo cáo audit A3 mục 2). Không có "explicit shared binding policy" nào được định nghĩa
    // trong task -> mặc định CHẶN, không tự cho phép dùng chung.
    function findConflict(list, kind, type, channel, number, action) {
        return list.find((m) => m.type === type && m.channel === channel && m.number === number && m.action !== action);
    }

    function saveLearnedMapping() {
        const { learnResult, actionSelect, saveBtn } = els();
        if (!learnResult?.dataset.kind) {
            alert("Chưa Learn tín hiệu MIDI nào.");
            return;
        }
        if (!actionSelect?.value) {
            alert("Chọn Action muốn gán trước khi Lưu.");
            return;
        }
        const trigger = learnResult.textContent.replace("✅ Đã nhận: ", "");
        const list = getMappings();
        const kind = learnResult.dataset.kind;
        const type = kind === "note" ? "note" : (kind === "cc" ? "cc" : kind);
        const channel = Number(learnResult.dataset.channel);
        const number = Number(learnResult.dataset.number);
        const action = actionSelect.value;

        const conflict = findConflict(list, kind, type, channel, number, action);
        if (conflict) {
            const confirmed = confirm(
                `⚠ Tín hiệu MIDI này (${trigger}) đã được gán cho "${conflict.action}".\n` +
                `Nếu tiếp tục, mapping cũ sẽ bị XOÁ để tránh 2 Function cùng khớp 1 tín hiệu ` +
                `(1 trong 2 sẽ bị ghi đè âm thầm lúc thực thi nếu để cả hai).\n\n` +
                `Xoá mapping cũ và gán cho "${action}" thay vào đó?`
            );
            if (!confirmed) {
                if (learnResult) learnResult.textContent = `⚠ Đã huỷ lưu — trùng tín hiệu với "${conflict.action}".`;
                return;
            }
            const idx = list.indexOf(conflict);
            if (idx !== -1) list.splice(idx, 1);
        }

        // Nếu action NÀY đã có 1 mapping khác từ trước (re-learn cho cùng 1 Function), thay thế
        // luôn thay vì cộng dồn — tránh registry phình ra nhiều dòng chết cho cùng 1 action.
        const sameActionIdx = list.findIndex((m) => m.action === action);
        if (sameActionIdx !== -1) list.splice(sameActionIdx, 1);

        // Lưu CẤU TRÚC thật (type/channel/number), không chỉ chuỗi hiển thị — đây là field
        // mà core/command-engine-js/runtime.js dùng để tra O(1) lúc dispatch thật. Thiếu field
        // này thì mapping chỉ để XEM, không bao giờ được Command Engine khớp/thực thi.
        list.push({
            trigger,
            kind,
            type,
            channel,
            number,
            action,
            savedAt: new Date().toISOString(),
        });
        saveMappings(list);
        renderMappingList();
        clearLearnResult();
        window.electronAPI?.notifySetupChanged?.(); // báo main.js nạp lại mapping/Input thật ngay, không cần khởi động lại app
        if (saveBtn) saveBtn.textContent = "💾 Đã lưu";
        setTimeout(() => { if (saveBtn) saveBtn.textContent = "💾 Lưu Mapping"; }, 1200);
    }

    const { learnBtn, cancelBtn, clearBtn, saveBtn, inputSelect } = els();
    learnBtn?.addEventListener("click", startLearn);
    cancelBtn?.addEventListener("click", cancelLearn);
    clearBtn?.addEventListener("click", clearLearnResult);
    saveBtn?.addEventListener("click", saveLearnedMapping);
    inputSelect?.addEventListener("change", cancelLearn);

    window.addEventListener("load", () => {
        setTimeout(() => {
            refreshInputs();
            renderMappingList();
        }, 400);
    });
})();
