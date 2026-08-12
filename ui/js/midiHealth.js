/* ==========================================================
   midiHealth.js — MIDI-MASTER-01 Phase 1: MIDI HEALTH + STATE MACHINE
   -----------------------------------------------------------
   File MỚI. KHÔNG đụng appSettings.js/setup.js/actionRegistry.js/vocalCommandRouter.js.
   Chỉ ĐỌC state đã có sẵn (Web MIDI qua getMidiAccess()/listMidiOutputs() trong
   appSettings.js, + main-process qua window.electronAPI.getMainMidiHealth() mới thêm ở
   preload.js) rồi hợp nhất thành 1 nguồn sự thật duy nhất: getMidiHealth().

   QUAN TRỌNG (Mục 4/19 của MIDI-MASTER-01):
   - CONNECTED != VERIFIED != READY. Ở Phase 1 này, module CHƯA có cơ chế Verification
     (Phase 9) hay Function Mapping/Preset đầy đủ (Phase 4-6) — nên state tối đa có thể
     đạt được ở đây là CONFIGURED. VERIFYING/VERIFIED/READY luôn trả về false/not-reached,
     KHÔNG suy đoán, KHÔNG tự bật READY giả chỉ vì port đã mở được.
   - Không hợp nhất 2 backend (Web MIDI renderer + easymidi main) thành 1 object phẳng —
     giữ nguyên `renderer` và `main` tách riêng trong health, chỉ suy ra 1 trường `state`
     tổng hợp ở tầng trên (đúng Mục 22/23: "chỉ hợp nhất abstraction/state ở tầng trên").
   ========================================================== */
(function () {
    const MIDI_STATE = Object.freeze({
        NO_DEVICE: "NO_DEVICE",
        DEVICE_DETECTED: "DEVICE_DETECTED",
        PORT_SELECTED: "PORT_SELECTED",
        CONNECTING: "CONNECTING", // hiện chưa có bước async "đang kết nối" thật nào tách biệt
                                    // khỏi CONNECTED trong kiến trúc Phase 1 — giữ tên trong enum
                                    // cho Phase 2/3 (Auto Connect) dùng, KHÔNG trả về state này ở đây.
        CONNECTED: "CONNECTED",
        CONFIGURED: "CONFIGURED",
        VERIFYING: "VERIFYING",   // chưa dùng tới ở Phase 1 — xem ghi chú đầu file
        VERIFIED: "VERIFIED",     // chưa dùng tới ở Phase 1 — xem ghi chú đầu file
        READY: "READY",           // chưa dùng tới ở Phase 1 — xem ghi chú đầu file
        ERROR: "ERROR",
    });

    async function getRendererMidiHealth() {
        const portName = typeof getSetting === "function" ? getSetting("midiOutputPort") : "";
        if (typeof getMidiAccess !== "function") {
            return { supported: false, portsFound: 0, selectedPortFound: false, error: "getMidiAccess() không tồn tại (appSettings.js chưa tải)." };
        }
        try {
            const access = await getMidiAccess();
            const outputs = [...access.outputs.values()];
            const selectedPortFound = !!portName && outputs.some((o) => o.name === portName);
            return {
                supported: true,
                portsFound: outputs.length,
                selectedPortName: portName || null,
                selectedPortFound,
                error: null,
            };
        } catch (err) {
            return { supported: false, portsFound: 0, selectedPortFound: false, error: err.message };
        }
    }

    async function getMainMidiHealth() {
        if (!window.electronAPI?.getMainMidiHealth) {
            // Không phải môi trường Electron (vd mở thẳng file HTML để dev UI) — không phải lỗi thật,
            // chỉ là main-process health không khả dụng trong bối cảnh này.
            return { available: false, reason: "electronAPI.getMainMidiHealth không tồn tại (không phải Electron renderer?)." };
        }
        try {
            const health = await window.electronAPI.getMainMidiHealth();
            return { available: true, ...health };
        } catch (err) {
            return { available: false, reason: err.message };
        }
    }

    // Mục 19 — suy state tổng hợp CHỈ từ dữ liệu THẬT vừa đọc được, không đoán thêm.
    // Cố ý bảo thủ: nếu thiếu bằng chứng cho 1 tầng thì dừng lại ở tầng trước đó.
    function deriveState(renderer, main) {
        const portName = renderer.selectedPortName;

        if (!portName) {
            return renderer.portsFound > 0 ? MIDI_STATE.DEVICE_DETECTED : MIDI_STATE.NO_DEVICE;
        }

        // Có chọn port nhưng chưa xác nhận mở được ở CẢ HAI phía -> chỉ dừng ở PORT_SELECTED,
        // trừ khi có lỗi rõ ràng ở 1 trong 2 phía -> ERROR (đúng Mục 8: fail rõ, không giả vờ).
        const rendererOk = renderer.supported && renderer.selectedPortFound;
        const mainOk = main.available && main.outputReady === true && main.configuredPortName === portName;
        const rendererError = renderer.supported && portName && !renderer.selectedPortFound;
        const mainError = main.available && !!main.lastOutputError && main.configuredPortName === portName;

        if (rendererError || mainError) return MIDI_STATE.ERROR;
        if (!rendererOk || !mainOk) return MIDI_STATE.PORT_SELECTED;

        // Cả 2 backend đều xác nhận mở port thành công -> CONNECTED thật (Mục 5/22/23).
        const hasMapping = main.available && (main.mappingCount || 0) > 0;
        return hasMapping ? MIDI_STATE.CONFIGURED : MIDI_STATE.CONNECTED;

        // VERIFYING/VERIFIED/READY: cố ý KHÔNG có nhánh nào dẫn tới các state này ở Phase 1 —
        // sẽ bổ sung ở Phase 9 (Verification) và Phase 10 (READY), khi có cơ chế test thật.
    }

    async function getMidiHealth() {
        const [renderer, main] = await Promise.all([getRendererMidiHealth(), getMainMidiHealth()]);
        const state = deriveState(renderer, main);
        return { state, renderer, main };
    }

    window.MidiHealth = { MIDI_STATE, getMidiHealth };
})();
