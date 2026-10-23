/* ==========================================================
   midiHealth.js — TASK B1-A / B1-B: MIDI CONNECTION STATE + getMidiHealth()
   -----------------------------------------------------------
   File MỚI (đã có từ MIDI-MASTER-01 Phase 1, VIẾT LẠI ở đây theo đúng shape B1-B yêu cầu:
   { input:{detected,selected,connected}, output:{detected,selected,connected}, verified,
   status, error }). KHÔNG đụng appSettings.js/setup.js/actionRegistry.js/vocalCommandRouter.js.

   ===== GIỚI HẠN KIẾN TRÚC THẬT — PHẢI ĐỌC TRƯỚC KHI SỬA (không suy đoán, đây là sự thật đã
   xác nhận bằng cách đọc lại core/command-engine-js/runtime.js + ui/js/appSettings.js) =====
   1) Codebase hiện tại CHỈ có 1 setting persisted: `midiOutputPort`. KHÔNG có `midiInputPort`
      riêng. Kiến trúc hiện tại giả định 1 cổng MIDI ảo (vd loopMIDI) dùng chung cho cả
      Input lẫn Output — main process (`runtime.js`) mở CẢ HAI theo CÙNG portName này.
      => Vì vậy `input.selected` và `output.selected` bên dưới cùng đọc từ `midiOutputPort`.
      Đây KHÔNG phải lỗi tôi tự bịa — là hiện trạng thật, tôi CHỈ phản ánh đúng, không tự tạo
      `midiInputPort` mới (sẽ là thay đổi kiến trúc lớn, ngoài phạm vi B1 — ghi vào Remaining
      Risks trong báo cáo).
   2) "Input CONNECTED" theo nghĩa thật (có 1 listener đang lắng nghe liên tục) CHỈ tồn tại ở
      MAIN PROCESS (`easymidi.Input`, dùng cho dispatch daw:play/stop/record thật). Renderer
      (Web MIDI) KHÔNG duy trì input listener thường trực — `ui/js/setupMidiInput.js` chỉ mở
      1 `MIDIInput` TẠM THỜI trong lúc bấm Learn rồi thôi. Vì vậy `input.connected` bên dưới
      phản ánh state MAIN PROCESS, không phải renderer — ghi rõ trong `_detail` để không đánh
      lừa UI rằng renderer cũng "connected" input trong khi thực ra không có gì đang chạy ở đó.
   ========================================================== */
(function () {
    // B1-A — state machine tối thiểu theo đúng danh sách bắt buộc của task.
    const MIDI_STATE = Object.freeze({
        DISCONNECTED: "DISCONNECTED", // có portName đã lưu nhưng KHÔNG tìm thấy trong danh sách port thật (mất/đổi tên) — hoặc có lỗi mở port rõ ràng
        DISCOVERING: "DISCOVERING",   // chưa có portName nào được chọn/lưu — đang ở bước liệt kê thiết bị
        CONNECTING: "CONNECTING",     // có portName + port thật tồn tại, nhưng CHƯA xác nhận cả 2 backend đều mở xong (trạng thái transient — hiếm khi bắt được vì getMidiHealth() là 1 lần đọc tức thời, không phải stream sự kiện)
        CONNECTED: "CONNECTED",       // output CONNECTED thật (renderer + main đều xác nhận) — theo đúng Mục 7, không tuyên bố CONNECTED nếu chỉ 1 phía OK
        CONFIGURED: "CONFIGURED",     // CONNECTED + đã có mapping đã lưu (mappingCount > 0)
        VERIFIED: "VERIFIED",         // CHƯA có nhánh nào dẫn tới state này — cần Phase Verification thật (Mục 16), chưa làm ở B1 này
        ERROR: "ERROR",               // có lỗi thật từ 1 trong 2 backend khi mở port đã chọn
        // MIDI-RECOVERY-01 — trạng thái MỘT PHÍA (partial). Không phá hợp đồng cũ: các giá trị ở trên giữ nguyên.
        OUTPUT_READY: "OUTPUT_READY", // Output mở thật ở main process; Input lỗi/chưa mở (partial)
        INPUT_READY: "INPUT_READY",   // Input mở thật; Output lỗi/chưa mở (partial)
    });

    async function getRendererPortLists() {
        if (typeof getMidiAccess !== "function") {
            return { supported: false, inputs: [], outputs: [], error: "getMidiAccess() không tồn tại (appSettings.js chưa tải)." };
        }
        try {
            const access = await getMidiAccess();
            return {
                supported: true,
                inputs: [...access.inputs.values()].map((p) => p.name),
                outputs: [...access.outputs.values()].map((p) => p.name),
                error: null,
            };
        } catch (err) {
            return { supported: false, inputs: [], outputs: [], error: err.message };
        }
    }

    async function getMainMidiHealth() {
        if (!window.electronAPI?.getMainMidiHealth) {
            return { available: false, reason: "electronAPI.getMainMidiHealth không tồn tại (không phải Electron renderer?)." };
        }
        try {
            const health = await window.electronAPI.getMainMidiHealth();
            return { available: true, ...health };
        } catch (err) {
            return { available: false, reason: err.message };
        }
    }

    // MIDI-RECOVERY-01 — danh sách cổng của BACKEND thật (easymidi, main process). Trước đây "detected" chỉ dựa vào
    // Web MIDI (Chromium) => Output "AUTO MENU AI" bị báo det=✕ dù backend gửi mở được.
    async function getMainPortLists() {
        if (!window.electronAPI?.listMidiPorts) return { available: false, inputs: [], outputs: [], error: null };
        try {
            const r = await window.electronAPI.listMidiPorts();
            if (r && r.ok) return { available: true, inputs: r.inputs || [], outputs: r.outputs || [], error: null };
            return { available: false, inputs: [], outputs: [], error: (r && r.error) || "listMidiPorts lỗi" };
        } catch (err) {
            return { available: false, inputs: [], outputs: [], error: err.message };
        }
    }

    // B1-B — tính riêng input.{detected,selected,connected} và output.{detected,selected,connected}.
    // "detected" = tên port có THẬT trong danh sách backend trả về (không đoán).
    // "selected" = có portName đã lưu trong settings (kể cả khi KHÔNG detected — đúng B1-C
    //              "Port đã lưu nhưng hiện không tồn tại" phải phân biệt được với "chưa chọn gì").
    // "connected" = xem ghi chú kiến trúc đầu file (input dựa main-only, output dựa cả 2 backend).
    // MIDI-RECOVERY-01 — mỗi phía mang theo bằng chứng RIÊNG của nó:
    //   detectedByMain (easymidi) / detectedByRenderer (Web MIDI) / detected (ưu tiên main nếu có) / connected (main mở thật,
    //   đúng tên cổng CỦA PHÍA ĐÓ — Input so với configuredInputPortName, không còn so với tên Output) / error (message gốc).
    function buildSide(kind, portName, rendererPorts, mainPorts, main) {
        const selected = !!portName;
        const detectedByRenderer = selected && rendererPorts.includes(portName);
        const mainList = kind === "output" ? mainPorts.outputs : mainPorts.inputs;
        const detectedByMain = mainPorts.available ? (selected && mainList.includes(portName)) : null;
        const detected = detectedByMain !== null ? detectedByMain : detectedByRenderer;
        let configured;
        let open;
        let error;
        let errorDetail;
        if (kind === "output") {
            configured = main.configuredPortName;
            open = main.outputReady === true;
            error = main.available ? (main.lastOutputError || null) : null;
            errorDetail = main.available ? (main.lastOutputErrorDetail || null) : null;
        } else {
            // Input: dùng configuredInputPortName; main cũ chưa có field này -> rơi về configuredPortName.
            configured = main.configuredInputPortName !== undefined ? main.configuredInputPortName : main.configuredPortName;
            open = main.inputOpen === true;
            error = main.available ? (main.lastInputError || null) : null;
            errorDetail = main.available ? (main.lastInputErrorDetail || null) : null;
        }
        const connected = selected && main.available === true && open && configured === portName;
        return { detected, selected, connected, detectedByMain, detectedByRenderer, error, errorDetail, configuredByMain: configured || null };
    }

    // Trạng thái tổng hợp TỪ HAI PHÍA. "Tìm thấy tên cổng" (detected) không bao giờ đủ để CONNECTED.
    function deriveStatus(input, output, main) {
        if (!input.selected && !output.selected) return MIDI_STATE.DISCOVERING;

        const o = output.connected;
        const i = input.connected;
        if (o && i) {
            const hasMapping = main.available && (main.mappingCount || 0) > 0;
            return hasMapping ? MIDI_STATE.CONFIGURED : MIDI_STATE.CONNECTED;
        }
        if (o) return MIDI_STATE.OUTPUT_READY;
        if (i) return MIDI_STATE.INPUT_READY;

        const anyDetected = output.detected || input.detected;
        if ((output.error || input.error) && anyDetected) return MIDI_STATE.ERROR;
        if (!anyDetected) return MIDI_STATE.DISCONNECTED; // port đã lưu nhưng không có trong danh sách thật (B1-C)
        return MIDI_STATE.CONNECTING; // port tồn tại, chưa có phía nào mở (và chưa có lỗi cụ thể)

        // VERIFIED: cố ý không có nhánh nào dẫn tới — cần cơ chế test thật (Mục 16), chưa có ở B1.
    }

    async function getMidiHealth() {
        const [rendererPorts, main, mainPorts] = await Promise.all([getRendererPortLists(), getMainMidiHealth(), getMainPortLists()]);
        // Kiến trúc hiện tại dùng CHUNG 1 portName cho input/output (xem ghi chú đầu file).
        // TASK B2 Mục 4 — nếu user đã cấu hình midiInputPort riêng, dùng đúng nó cho phía INPUT;
        // OUTPUT vẫn luôn đọc midiOutputPort (không đổi ý nghĩa field cũ).
        const outputPortName = typeof getSetting === "function" ? getSetting("midiOutputPort") : "";
        const inputPortName = (typeof getSetting === "function" ? getSetting("midiInputPort") : "") || outputPortName;

        const output = buildSide("output", outputPortName, rendererPorts.outputs, mainPorts, main);
        const input = buildSide("input", inputPortName, rendererPorts.inputs, mainPorts, main);
        const status = deriveStatus(input, output, main);

        // `error` (chuỗi, giữ tương thích): 1 phía lỗi -> message GỐC nguyên văn; cả 2 phía lỗi -> có nhãn OUT/IN để
        // KHÔNG che lỗi nào. Lỗi từng phía luôn có riêng ở `errors` / output.error / input.error.
        let error;
        if (main.available) {
            if (main.lastOutputError && main.lastInputError) error = `OUT: ${main.lastOutputError} | IN: ${main.lastInputError}`;
            else error = main.lastOutputError || main.lastInputError || null;
        } else {
            error = main.reason || rendererPorts.error || null;
        }

        return {
            input,
            output,
            verified: false, // luôn false ở B1/B2 client-side — verification thật (loopback) chạy ở main process qua electronAPI.verifyMidiOutput(), không tự suy ở renderer
            status,
            partial: status === MIDI_STATE.OUTPUT_READY || status === MIDI_STATE.INPUT_READY,
            error,
            errors: { output: output.error, input: input.error },
            // Chi tiết thô — KHÔNG thuộc shape bắt buộc của B1-B, giữ lại để UI/Setup hiển thị lý
            // do cụ thể (vd "cổng đã lưu không có trong danh sách renderer") mà không phải đoán.
            _detail: { portName: outputPortName || null, inputPortName: inputPortName || null, rendererSupported: rendererPorts.supported, rendererPorts: { inputs: rendererPorts.inputs, outputs: rendererPorts.outputs }, mainPorts, main },
        };
    }

    // TASK B2 Mục 10 — nút "🔄 Auto Connect": gọi main process discover+ensure+connect, rồi
    // đọc lại getMidiHealth() để UI cập nhật NGAY (không cần chờ lần refresh định kỳ tiếp theo).
    // MIDI-RECOVERY-01 — SINGLE-FLIGHT: đang có 1 lần Auto Connect chạy thì các lần bấm thêm DÙNG CHUNG kết quả của
    // lần đó (không phát thêm IPC/thao tác mở cổng). Hết lần chạy mới cho phép lần mới.
    let autoConnectInFlight = null;
    async function autoConnect(opts) {
        if (!window.electronAPI?.autoConnectMidi) {
            return { ok: false, resolved: false, status: "DISCONNECTED", connected: false, partial: false, detail: "electronAPI.autoConnectMidi không tồn tại (không phải Electron renderer?)." };
        }
        if (autoConnectInFlight) return autoConnectInFlight;
        autoConnectInFlight = (async () => {
            try { return await window.electronAPI.autoConnectMidi(opts); }
            finally { autoConnectInFlight = null; }
        })();
        return autoConnectInFlight;
    }

    // TASK B2 Mục 6/9 — verification thật (loopback), KHÔNG suy đoán ở renderer.
    async function verify() {
        if (!window.electronAPI?.verifyMidiOutput) {
            return { verified: false, reason: "NOT_ELECTRON", detail: "electronAPI.verifyMidiOutput không tồn tại." };
        }
        return window.electronAPI.verifyMidiOutput();
    }

    window.MidiHealth = { MIDI_STATE, getMidiHealth, autoConnect, verify };
})();
