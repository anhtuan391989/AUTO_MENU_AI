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
            // MIDI-RECOVERY-01 — ghi rõ SENDER và tầng lỗi (từ getLastMidiSendResult()); SUCCESS chỉ nghĩa API gửi
            // không ném lỗi, KHÔNG xác nhận DAW/loopMIDI đã nhận.
            const r = typeof window.getLastMidiSendResult === "function" ? window.getLastMidiSendResult() : null;
            const sender = r?.sender ? ` [sender: ${r.sender}]` : "";
            if (ok) {
                pushLine(`${kind} ${label} → ✅ SUCCESS (API send OK, chưa xác nhận DAW nhận)${sender}${r?.port ? ` [port: ${r.port}]` : ""}`);
            } else {
                const why = r && r.reason ? ` ${r.reason}${r.detail ? ": " + r.detail : ""}` : (detail ? " " + detail : "");
                pushLine(`${kind} ${label} → ❌ FAILURE${sender}${why ? " —" + why : ""}`);
            }
        },
    };

    // TASK B1-A/B1-B — status label khớp đúng state machine mới (DISCONNECTED/DISCOVERING/
    // CONNECTING/CONNECTED/CONFIGURED/VERIFIED/ERROR) và shape mới của getMidiHealth()
    // ({input,output,verified,status,error}), thay cho shape cũ ({state,renderer,main}).
    const STATE_LABEL = {
        DISCOVERING: "● Có cổng khả dụng, chưa chọn (đang ở bước dò tìm).",
        DISCONNECTED: "⚠ Cổng đã lưu KHÔNG có trong danh sách thật (mất/đổi tên/rút dây).",
        CONNECTING: "◐ Cổng tồn tại, đang xác nhận kết nối thật (renderer/main)...",
        CONNECTED: "● CONNECTED — output đã xác nhận mở ở cả renderer và main process.",
        CONFIGURED: "● CONFIGURED — đã kết nối và có mapping đã lưu.",
        VERIFIED: "● VERIFIED",
        // MIDI-RECOVERY-01 — trạng thái MỘT PHÍA: nói rõ phía nào chạy, phía nào lỗi.
        OUTPUT_READY: "◐ OUTPUT_READY — Output đã mở (main process), Input CHƯA mở (xem lỗi Input bên dưới).",
        INPUT_READY: "◐ INPUT_READY — Input đã mở, Output CHƯA mở (xem lỗi Output bên dưới).",
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
            let text = `Status: ${STATE_LABEL[health.status] || health.status}`;
            // MIDI-RECOVERY-01 — lỗi TỪNG phía hiển thị riêng, message gốc nguyên văn (không gộp làm mất lỗi nào).
            const outErr = health.errors?.output;
            const inErr = health.errors?.input;
            if (outErr) text += ` — OUT lỗi: ${outErr}${health.output.errorDetail ? ` (bước: ${health.output.errorDetail.stage})` : ""}`;
            if (inErr) text += ` — IN lỗi: ${inErr}${health.input.errorDetail ? ` (bước: ${health.input.errorDetail.stage})` : ""}`;
            if (!outErr && !inErr && health.error) text += ` — ${health.error}`;
            const det = (side) => {
                const m = side.detectedByMain === null || side.detectedByMain === undefined ? "?" : (side.detectedByMain ? "✓" : "✕");
                const r = side.detectedByRenderer ? "✓" : "✕";
                return `det=${side.detected ? "✓" : "✕"}(main ${m}/web ${r}) conn=${side.connected ? "✓" : "✕"}`;
            };
            text += ` [IN: ${det(health.input)} · OUT: ${det(health.output)}]`;
            if (!health._detail?.main?.available) {
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

    // TASK B2 Mục 10 — nút "Auto Connect": discover + đảm bảo "AUTO MENU AI" (nếu platform hỗ
    // trợ) + connect. mode="auto" TƯỜNG MINH ở đây (chỉ khi user CHỦ ĐỘNG bấm nút này) — không
    // tự bật auto mode ngầm ở bất kỳ đường nào khác, đúng "không ghi đè lựa chọn người dùng".
    document.getElementById("btnAutoConnectMidi")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        if (!window.MidiHealth?.autoConnect) {
            alert("Auto Connect chưa khả dụng (không phải Electron renderer?).");
            return;
        }
        const original = btn.textContent;
        btn.textContent = "⏳ Đang dò tìm...";
        btn.disabled = true;
        try {
            const result = await window.MidiHealth.autoConnect({ mode: "auto" });
            // MIDI-RECOVERY-01 — KHÔNG dùng result.ok (chỉ nghĩa "đã phân giải được tên cổng") để báo thành công.
            // Báo theo kết quả MỞ THẬT của từng phía (result.output.ready / result.input.ready).
            const port = result.resolution?.portName;
            const sideTxt = (label, side) => side
                ? `${label} ${side.ready ? "✅ mở" : "❌ KHÔNG mở"}${side.error ? ` (${side.error}${side.detail?.stage ? ` · bước ${side.detail.stage}` : ""})` : ""}`
                : `${label} ?`;
            const detailTxt = `${sideTxt("OUT", result.output)} · ${sideTxt("IN", result.input)}`;
            const note = result.coalesced ? " [gộp: lần bấm dồn dập, không mở lại]" : "";
            if (result.status === "CONNECTED") {
                pushLine(`AUTO CONNECT → ✅ CONNECTED "${port}" (nguồn: ${result.resolution.source}) — ${detailTxt}${note}`);
            } else if (result.status === "OUTPUT_READY" || result.status === "INPUT_READY") {
                pushLine(`AUTO CONNECT → ⚠ ${result.status} (một phía) "${port || "?"}" — ${detailTxt}${note}`);
            } else if (result.status) {
                const vp = result.virtualPort;
                const why = !port ? (vp && !vp.ok ? ` — ${vp.detail}` : " — không tìm thấy port khả dụng.") : "";
                pushLine(`AUTO CONNECT → ❌ ${result.status} "${port || "-"}" — ${detailTxt}${why}${note}`);
            } else {
                // main cũ (không có result.status) — giữ nhánh cũ nhưng nói rõ chưa xác nhận mở cổng.
                pushLine(result.ok
                    ? `AUTO CONNECT → ⚠ đã phân giải tên "${port}" nhưng KHÔNG có xác nhận mở cổng (main cũ).`
                    : "AUTO CONNECT → ❌ KHÔNG kết nối được — không tìm thấy port khả dụng.");
            }
            await refreshMidiStatus();
        } catch (err) {
            pushLine(`AUTO CONNECT → ❌ lỗi: ${err.message}`);
        } finally {
            btn.textContent = original;
            btn.disabled = false;
        }
    });

    // TASK B2 Mục 6/9 — Verify thật (loopback), hiển thị đúng SUCCESS/FAILURE, không dùng
    // console.log làm bằng chứng, không tự nâng lên VERIFIED nếu không nhận lại được message.
    document.getElementById("btnVerifyMidiLoopback")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const verifyStatus = document.getElementById("midiVerifyStatus");
        if (!window.MidiHealth?.verify) {
            alert("Verify chưa khả dụng (không phải Electron renderer?).");
            return;
        }
        const original = btn.textContent;
        btn.textContent = "⏳ Đang gửi + chờ phản hồi...";
        btn.disabled = true;
        if (verifyStatus) verifyStatus.textContent = "Verification: đang chạy...";
        try {
            const result = await window.MidiHealth.verify();
            if (verifyStatus) {
                verifyStatus.textContent = result.verified
                    ? `Verification: ✅ VERIFIED — ${result.detail}`
                    : `Verification: ❌ NOT VERIFIED (${result.reason}) — ${result.detail}`;
            }
            pushLine(`VERIFY → ${result.verified ? "✅ VERIFIED" : `❌ NOT VERIFIED (${result.reason})`}`);
        } catch (err) {
            if (verifyStatus) verifyStatus.textContent = `Verification: lỗi (${err.message}).`;
        } finally {
            btn.textContent = original;
            btn.disabled = false;
        }
    });
})();
