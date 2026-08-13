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

    // B1-B — tính riêng input.{detected,selected,connected} và output.{detected,selected,connected}.
    // "detected" = tên port có THẬT trong danh sách backend trả về (không đoán).
    // "selected" = có portName đã lưu trong settings (kể cả khi KHÔNG detected — đúng B1-C
    //              "Port đã lưu nhưng hiện không tồn tại" phải phân biệt được với "chưa chọn gì").
    // "connected" = xem ghi chú kiến trúc đầu file (input dựa main-only, output dựa cả 2 backend).
    function buildSide(kind, portName, rendererPorts, main) {
        const detected = !!portName && rendererPorts.includes(portName);
        const selected = !!portName;
        let connected;
        if (kind === "output") {
            connected = selected && detected && main.available && main.outputReady === true && main.configuredPortName === portName;
        } else {
            // input: chỉ main process có listener thật thường trực — xem ghi chú đầu file.
            connected = selected && main.available && main.inputOpen === true && main.configuredPortName === portName;
        }
        return { detected, selected, connected };
    }

    function deriveStatus(input, output, main, portName) {
        if (!portName) return MIDI_STATE.DISCOVERING;

        const outputError = main.available && !!main.lastOutputError && main.configuredPortName === portName;
        const inputError = main.available && !!main.lastInputError && main.configuredPortName === portName;
        if (outputError || inputError) {
            // Có bằng chứng lỗi THẬT (không chỉ "chưa kết nối") -> ERROR, không lùi về DISCONNECTED
            // để UI biết đây là port CÓ tồn tại nhưng mở thất bại, khác với "port biến mất".
            if (output.detected || input.detected) return MIDI_STATE.ERROR;
        }

        if (!output.detected) return MIDI_STATE.DISCONNECTED; // port đã lưu nhưng không có trong danh sách thật (B1-C)

        if (!output.connected) return MIDI_STATE.CONNECTING; // port tồn tại, chưa xác nhận mở xong cả 2 backend

        const hasMapping = main.available && (main.mappingCount || 0) > 0;
        return hasMapping ? MIDI_STATE.CONFIGURED : MIDI_STATE.CONNECTED;

        // VERIFIED: cố ý không có nhánh nào dẫn tới — cần cơ chế test thật (Mục 16), chưa có ở B1.
    }

    async function getMidiHealth() {
        const [rendererPorts, main] = await Promise.all([getRendererPortLists(), getMainMidiHealth()]);
        // Kiến trúc hiện tại dùng CHUNG 1 portName cho input/output (xem ghi chú đầu file).
        // TASK B2 Mục 4 — nếu user đã cấu hình midiInputPort riêng, dùng đúng nó cho phía INPUT;
        // OUTPUT vẫn luôn đọc midiOutputPort (không đổi ý nghĩa field cũ).
        const outputPortName = typeof getSetting === "function" ? getSetting("midiOutputPort") : "";
        const inputPortName = (typeof getSetting === "function" ? getSetting("midiInputPort") : "") || outputPortName;

        const output = buildSide("output", outputPortName, rendererPorts.outputs, main);
        const input = buildSide("input", inputPortName, rendererPorts.inputs, main);
        const status = deriveStatus(input, output, main, outputPortName);

        const error = main.available
            ? (main.lastOutputError || main.lastInputError || null)
            : (main.reason || rendererPorts.error || null);

        return {
            input,
            output,
            verified: false, // luôn false ở B1/B2 client-side — verification thật (loopback) chạy ở main process qua electronAPI.verifyMidiOutput(), không tự suy ở renderer
            status,
            error,
            // Chi tiết thô — KHÔNG thuộc shape bắt buộc của B1-B, giữ lại để UI/Setup hiển thị lý
            // do cụ thể (vd "cổng đã lưu không có trong danh sách renderer") mà không phải đoán.
            _detail: { portName: outputPortName || null, inputPortName: inputPortName || null, rendererSupported: rendererPorts.supported, main },
        };
    }

    // TASK B2 Mục 10 — nút "🔄 Auto Connect": gọi main process discover+ensure+connect, rồi
    // đọc lại getMidiHealth() để UI cập nhật NGAY (không cần chờ lần refresh định kỳ tiếp theo).
    async function autoConnect(opts) {
        if (!window.electronAPI?.autoConnectMidi) {
            return { ok: false, detail: "electronAPI.autoConnectMidi không tồn tại (không phải Electron renderer?)." };
        }
        const result = await window.electronAPI.autoConnectMidi(opts);
        return result;
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
