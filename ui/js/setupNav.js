/* setupNav.js — MỚI THÊM, KHÔNG đụng tới setup.js/appSettings.js.
   Chỉ lo việc chuyển đổi hiển thị giữa các nhóm sidebar (Dashboard/AI/Audio/MIDI/...).
   Không popup, không modal — mọi panel đều là nội dung tĩnh trong trang. */
(function () {
    function activatePanel(panelId) {
        document.querySelectorAll(".setup-panel").forEach((el) => {
            el.classList.toggle("active", el.id === panelId);
        });
        document.querySelectorAll(".nav-item").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.panel === panelId);
        });

        // Giữ hành vi cũ: danh sách soundcard tự làm mới mỗi khi vào lại nhóm Audio
        // (bản cũ làm việc này mỗi lần MỞ MODAL Soundcard — nay panel luôn hiện sẵn,
        // mô phỏng lại bằng cách bấm hộ nút ẩn #openSoundcardModal, không viết lại logic).
        if (panelId === "panel-audio") {
            document.getElementById("openSoundcardModal")?.click();
        }

        // Cập nhật nhanh các thẻ trạng thái ở Dashboard mỗi khi quay lại đó,
        // dựa trên chính các hàm/biến đọc-settings đã có sẵn trong appSettings.js (chỉ đọc, không ghi).
        if (panelId === "panel-dashboard") {
            refreshDashboard();
        }
    }

    function refreshDashboard() {
        try {
            const readyPill = (el) => {
                if (!el) return;
                el.textContent = "READY";
                el.className = "status-pill status-pill--ready";
            };
            const dimPill = (el) => {
                if (!el) return;
                el.textContent = "—";
                el.className = "status-pill status-pill--dim";
            };

            const soundcardLabel = document.getElementById("statusSoundcardModal")?.textContent;
            const hasAudio = soundcardLabel && soundcardLabel !== "Chưa chọn soundcard nào";
            hasAudio ? readyPill(document.getElementById("dashAudioPill")) : dimPill(document.getElementById("dashAudioPill"));

            const midiSel = document.getElementById("midiPortSelect");
            const hasMidi = !!midiSel?.value;
            hasMidi ? readyPill(document.getElementById("dashMidiPill")) : dimPill(document.getElementById("dashMidiPill"));

            const hasDaw = typeof getSetting === "function" && !!getSetting("selectedDAW");
            hasDaw ? readyPill(document.getElementById("dashDawPill")) : dimPill(document.getElementById("dashDawPill"));

            const hasPlugin = typeof getSetting === "function" && !!getSetting("selectedAutoTune");
            hasPlugin ? readyPill(document.getElementById("dashPluginPill")) : dimPill(document.getElementById("dashPluginPill"));

            const ahkPath = document.getElementById("ahkPathDisplay")?.textContent || "";
            const hasCalib = ahkPath && !ahkPath.includes("Đang dò") && !ahkPath.includes("❌");
            hasCalib ? readyPill(document.getElementById("dashCalibPill")) : dimPill(document.getElementById("dashCalibPill"));
        } catch (e) {
            console.warn("refreshDashboard: bỏ qua lỗi không nghiêm trọng", e);
        }
    }

    document.getElementById("sidebarNav")?.addEventListener("click", (e) => {
        const btn = e.target.closest(".nav-item");
        if (!btn) return;
        activatePanel(btn.dataset.panel);
    });

    // Chạy 1 lần khi trang load xong, sau khi setup.js đã initSetupPage().
    window.addEventListener("load", () => setTimeout(refreshDashboard, 300));
})();
