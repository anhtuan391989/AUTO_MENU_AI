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

        if (panelId === "panel-daw") {
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

    // DASH-STATUS-01 — Database: hỏi Key Server qua main process (IPC "database-status"). Chống gọi chồng; lỗi/hết giờ = OFFLINE (không throw).
    let dbPillBusy = false;
    function refreshDatabasePill(readyPill, dimPill) {
        const el = document.getElementById("dashDbPill");
        if (!el) return;
        if (!window.electronAPI || typeof window.electronAPI.getDatabaseStatus !== "function") { dimPill(el, "—"); return; }
        if (dbPillBusy) return;
        dbPillBusy = true;
        dimPill(el, "CHECKING…");
        Promise.resolve(window.electronAPI.getDatabaseStatus()).then((r) => {
            if (r && r.ok) { readyPill(el, "ONLINE"); el.title = "Key Server trả lời (HTTP " + r.status + ", " + r.ms + " ms)"; }
            else { el.textContent = "OFFLINE"; el.className = "status-pill status-pill--error"; el.title = "Key Server không trả lời: " + ((r && r.error) || "không rõ"); }
        }).catch(() => { el.textContent = "OFFLINE"; el.className = "status-pill status-pill--error"; })
          .finally(() => { dbPillBusy = false; });
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

            // DASH-STATUS-01 — AI: Key/BPM/Mod chạy từ System Audio, nên "sẵn sàng" = đã chọn thiết bị System Audio trong Setup > Audio.
            const hasSystemAudio = typeof getSetting === "function" && !!getSetting("selectedSystemAudioDeviceId", "");
            hasSystemAudio ? readyPill(document.getElementById("dashAiPill"), "READY")
                           : dimPill(document.getElementById("dashAiPill"), "NO SYSTEM AUDIO");
            refreshDatabasePill(readyPill, dimPill);

            const calib = calibrationState();
            if (calib === "calibrated") readyPill(document.getElementById("dashCalibPill"), "CALIBRATED");
            else if (calib === "partial") dimPill(document.getElementById("dashCalibPill"), "PARTIAL");
            else dimPill(document.getElementById("dashCalibPill"), "NOT CALIBRATED");
        } catch (e) {
            console.warn("refreshDashboard: bỏ qua lỗi không nghiêm trọng", e);
        }
    }

    // ================================
    // TASK A53 — AI TAB ADMIN LOCK.
    // Cờ phiên đăng nhập CHỈ tồn tại trong biến JS này (đóng cửa sổ Setup / tắt app /
    // reload trang là mất) — KHÔNG lưu localStorage/sessionStorage/file, nên không có
    // cách nào tạo persistent bypass qua các cơ chế lưu trữ đó (đúng yêu cầu A53 mục 10).
    // Xác thực THẬT nằm ở main process (core/shared/AdminAuth.js, qua
    // window.electronAPI.adminAuthVerify — xem ui/js/adminAuthUI.js của A52); file này
    // KHÔNG tự so sánh password, chỉ đọc kết quả callback onSuccess từ AdminAuthUI.
    // panel-ai giữ nguyên display:none (css/setup.css: ".setup-panel { display:none }",
    // chỉ ".setup-panel.active" mới hiện) cho tới khi activatePanel("panel-ai") được gọi
    // — tức là KHÔNG có cách nào (chuột, Tab, Enter, Space) chạm được nội dung panel-ai
    // trước khi authenticate thành công, vì nó chưa từng được activatePanel() render active.
    // ================================
    // 05/11/2026 — THEO YÊU CẦU CHỦ DỰ ÁN: ĐÃ BỎ KHOÁ MẬT KHẨU TAB AI.
    // Bấm vào tab AI là mở thẳng, không hỏi mật khẩu admin nữa.
    // (Code xác thực AdminAuth / AdminAuthUI vẫn còn nguyên, chỉ không còn được gọi từ đây —
    // muốn bật lại khoá thì khôi phục khối kiểm tra "panel-ai" từ lịch sử git của file này.)
    document.getElementById("sidebarNav")?.addEventListener("click", (e) => {
        const btn = e.target.closest(".nav-item");
        if (!btn) return;
        activatePanel(btn.dataset.panel);
    });

    // Chạy 1 lần khi trang load xong, sau khi setup.js đã initSetupPage().
    window.addEventListener("load", () => setTimeout(refreshDashboard, 300));
})();
