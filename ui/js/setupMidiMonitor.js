/* setupMidiMonitor.js — MỚI THÊM, KHÔNG đụng Engine/IPC/setup.js.
   Chỉ lắng nghe THÊM (addEventListener song song, không thay thế) trên 2 nút Test MIDI đã có sẵn,
   rồi in ra đúng giá trị vừa gửi. Đây là echo thật của thao tác vừa làm — không phải MIDI Input thật
   (Driver chưa hỗ trợ nhận MIDI, xem ghi chú "MIDI Learn" trong panel MIDI). */
(function () {
    const MAX_LINES = 12;

    function pushLine(text) {
        const feed = document.getElementById("midiMonitorFeed");
        if (!feed) return;
        const empty = feed.querySelector(".midi-monitor-empty");
        if (empty) empty.remove();

        const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });
        const row = document.createElement("div");
        row.className = "midi-monitor-row";
        row.textContent = `[${time}] ${text}`;
        feed.prepend(row);

        while (feed.children.length > MAX_LINES) {
            feed.removeChild(feed.lastChild);
        }
    }

    // MIDI-MASTER-01 Phase 1 — SỬA lỗi audit A3 mục 3 ("Test Monitor báo PASS giả"):
    // TRƯỚC bản vá này, 2 listener bên dưới tự log "đã gửi" ngay khi click, KHÔNG chờ kết quả
    // thật từ sendMidiNotePulse()/sendMidiCC() (setup.js). Vì vậy Monitor có thể hiển thị
    // "đã gửi" ngay cả khi lệnh gửi thật thất bại (setup.js alert lỗi song song, dòng log vẫn
    // đứng yên nói đã gửi) — đúng kiểu "PASS giả" mà Mục 11 tài liệu MIDI SETUP + Mục 17 của
    // MIDI-MASTER-01 cấm.
    //
    // SỬA: bỏ 2 listener tự log ở đây. Thay vào đó expose pushLine() ra window.MidiMonitor để
    // setup.js (nơi DUY NHẤT biết kết quả `ok` thật sau khi await) gọi lại SAU khi biết kết quả —
    // đúng luồng SEND -> RESULT -> SUCCESS/FAILURE bắt buộc.
    window.MidiMonitor = {
        pushLine,
        logTestResult(kind, label, ok, detail) {
            pushLine(ok ? `${kind} ${label} → ✅ SUCCESS` : `${kind} ${label} → ❌ FAILURE${detail ? " (" + detail + ")" : ""}`);
        },
    };

    // MIDI-MASTER-01 Phase 1 — SỬA lỗi audit A3 mục 1 ("2 hệ thống MIDI output độc lập, không
    // có trạng thái tổng hợp"): TRƯỚC bản vá này, status chỉ đọc "dropdown có value hay không",
    // KHÔNG phản ánh việc port có thật sự mở được ở renderer (Web MIDI) lẫn main process
    // (easymidi/CommandRuntime) hay không. Giờ dùng window.MidiHealth.getMidiHealth() (mới thêm)
    // làm nguồn sự thật duy nhất — đúng Mục 5/20 của MIDI-MASTER-01.
    const STATE_LABEL = {
        NO_DEVICE: "⚠ Không phát hiện cổng MIDI nào (bấm Refresh / kiểm tra loopMIDI).",
        DEVICE_DETECTED: "● Có cổng khả dụng, chưa chọn.",
        PORT_SELECTED: "◐ Đã chọn cổng, đang xác nhận kết nối thật (renderer/main)...",
        CONNECTING: "◐ Đang kết nối...",
        CONNECTED: "● CONNECTED — cả renderer và main process đều mở được cổng.",
        CONFIGURED: "● CONFIGURED — đã kết nối và có mapping đã lưu.",
        VERIFYING: "◐ Đang xác minh...",
        VERIFIED: "● VERIFIED",
        READY: "● READY",
        ERROR: "❌ ERROR — xem chi tiết bên dưới.",
    };

    async function refreshMidiStatus() {
        const status = document.getElementById("midiOutputStatus");
        if (!status) return;
        if (!window.MidiHealth?.getMidiHealth) {
            status.textContent = "Status: MidiHealth chưa tải xong.";
            return;
        }
        status.textContent = "Status: đang kiểm tra...";
        try {
            const health = await window.MidiHealth.getMidiHealth();
            let text = `Status: ${STATE_LABEL[health.state] || health.state}`;
            if (health.state === "ERROR") {
                const reason = health.main?.lastOutputError || (health.renderer.selectedPortFound === false ? "Cổng đã lưu không có trong danh sách renderer thật." : "");
                if (reason) text += ` — ${reason}`;
            }
            if (!health.main?.available) {
                text += " [main-process health không khả dụng]";
            }
            status.textContent = text;
        } catch (err) {
            status.textContent = `Status: lỗi khi kiểm tra (${err.message}).`;
        }
    }
    document.getElementById("midiPortSelect")?.addEventListener("change", refreshMidiStatus);
    document.getElementById("btnRefreshMidiPorts")?.addEventListener("click", () => setTimeout(refreshMidiStatus, 400));
    window.addEventListener("load", () => setTimeout(refreshMidiStatus, 500));
})();
