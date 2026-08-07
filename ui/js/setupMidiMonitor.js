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

    // Chỉ log "đã gửi" khi thật sự có cổng MIDI được chọn — khớp đúng điều kiện guard
    // mà setup.js dùng trước khi gọi sendMidiNotePulse/sendMidiCC (tránh log sai khi chưa chọn cổng).
    function hasPortSelected() {
        return !!document.getElementById("midiPortSelect")?.value;
    }

    document.getElementById("btnTestMidiNote")?.addEventListener("click", () => {
        if (!hasPortSelected()) return; // setup.js đã tự alert, không log gì thêm
        const note = document.getElementById("midiTestNote")?.value ?? "?";
        pushLine(`NOTE ${note} → đã gửi`);
    });

    document.getElementById("btnTestMidiCC")?.addEventListener("click", () => {
        if (!hasPortSelected()) return;
        const cc = document.getElementById("midiTestCC")?.value ?? "?";
        const val = document.getElementById("midiTestCCValue")?.value ?? "?";
        pushLine(`CC${cc} → ${val}`);
    });

    // ---- Status thật cho MIDI Device (chỉ đọc trạng thái đã có, không thêm logic gửi/nhận mới) ----
    function refreshMidiStatus() {
        const status = document.getElementById("midiOutputStatus");
        const sel = document.getElementById("midiPortSelect");
        if (!status || !sel) return;
        if (!sel.options.length || (sel.options.length === 1 && !sel.options[0].value)) {
            status.textContent = "Status: chưa có cổng MIDI nào (bấm Refresh / Reconnect).";
        } else if (sel.value) {
            status.textContent = `Status: đã chọn "${sel.selectedOptions[0]?.textContent}".`;
        } else {
            status.textContent = "Status: có cổng khả dụng, chưa chọn.";
        }
    }
    document.getElementById("midiPortSelect")?.addEventListener("change", refreshMidiStatus);
    document.getElementById("btnRefreshMidiPorts")?.addEventListener("click", () => setTimeout(refreshMidiStatus, 400));
    window.addEventListener("load", () => setTimeout(refreshMidiStatus, 500));
})();
