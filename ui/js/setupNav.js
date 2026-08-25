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

        if (panelId === "panel-daw") {
            const nameEl = document.getElementById("dawStatusName");
            if (nameEl && typeof getSetting === "function") {
                nameEl.textContent = getSetting("selectedDAW") || "Chưa chọn";
            }
        }

        if (panelId === "panel-plugins") {
            const badge = document.getElementById("autoTuneStatusBadge");
            if (badge && typeof getSetting === "function") {
                const v = getSetting("selectedAutoTune");
                badge.textContent = v ? `Configured (${v})` : "Not selected";
                badge.className = v ? "badge badge-live" : "badge badge-soon";
            }
        }

        if (panelId === "panel-calibration") {
            const badge = document.getElementById("calibStatusBadge");
            if (badge) {
                const state = calibrationState();
                const map = {
                    calibrated: ["Calibrated", "badge badge-live"],
                    partial: ["Partial", "badge badge-soon"],
                    not_calibrated: ["Not calibrated", "badge badge-unwired"],
                    unknown: ["—", "badge badge-unwired"],
                };
                const [text, cls] = map[state] || map.unknown;
                badge.textContent = text;
                badge.className = cls;
            }
        }
    }

    // Đọc thật 4 key toạ độ đã lưu (autokey1/autokey2/autotunekey/chromatic — trùng đúng
    // COORDINATE_KEYS trong appSettings.js) để biết Calibration đã làm hay chưa — không đoán mò.
    function calibrationState() {
        if (typeof getSetting !== "function") return "unknown";
        const keys = ["autokey1", "autokey2", "autotunekey", "chromatic"];
        const done = keys.filter((k) => !!getSetting(k));
        if (done.length === 0) return "not_calibrated";
        if (done.length < keys.length) return "partial";
        return "calibrated";
    }

    function refreshDashboard() {
        try {
            const readyPill = (el, label) => {
                if (!el) return;
                el.textContent = label || "CONFIGURED";
                el.className = "status-pill status-pill--ready";
            };
            const dimPill = (el, label) => {
                if (!el) return;
                el.textContent = label || "—";
                el.className = "status-pill status-pill--dim";
            };

            const soundcardLabel = document.getElementById("statusSoundcardModal")?.textContent;
            const hasAudio = soundcardLabel && soundcardLabel !== "Chưa chọn soundcard nào";
            hasAudio ? readyPill(document.getElementById("dashAudioPill"), "MIC CONFIGURED")
                     : dimPill(document.getElementById("dashAudioPill"), "NOT CONFIGURED");

            const midiSel = document.getElementById("midiPortSelect");
            const hasMidi = !!midiSel?.value;
            hasMidi ? readyPill(document.getElementById("dashMidiPill"), "OUTPUT CONFIGURED")
                    : dimPill(document.getElementById("dashMidiPill"), "NOT CONFIGURED");

            const hasDaw = typeof getSetting === "function" && !!getSetting("selectedDAW");
            hasDaw ? readyPill(document.getElementById("dashDawPill"), "CONFIGURED")
                   : dimPill(document.getElementById("dashDawPill"), "NOT CONFIGURED");

            const hasPlugin = typeof getSetting === "function" && !!getSetting("selectedAutoTune");
            hasPlugin ? readyPill(document.getElementById("dashPluginPill"), "CONFIGURED")
                      : dimPill(document.getElementById("dashPluginPill"), "NOT SELECTED");

            const calib = calibrationState();
            if (calib === "calibrated") readyPill(document.getElementById("dashCalibPill"), "CALIBRATED");
            else if (calib === "partial") dimPill(document.getElementById("dashCalibPill"), "PARTIAL");
            else dimPill(document.getElementById("dashCalibPill"), "NOT CALIBRATED");
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
