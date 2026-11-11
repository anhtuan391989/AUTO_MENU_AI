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

/* SETUP-LOCK-01 BEGIN — KHOÁ BẢO VỆ KHU VỰC CÀI ĐẶT.
   Setup luôn mở ra trong trạng thái KHOÁ: một lớp phủ kín che toàn bộ trang, phần phía sau bị "inert" (chuột + phím Tab đều không chạm được).
   Mật khẩu KHÔNG được so sánh ở đây — chỉ gửi cho main (electronAPI.setupLockVerify -> core/shared/SetupLock.js) và nhận đúng/sai.
   Không lưu trạng thái mở khoá ở đâu cả (không localStorage/file): đóng/ẩn Setup là main báo "setup-lock-engage" để khoá lại; mở lại phải nhập lại.
   Lỗi bất kỳ (không gọi được main...) => GIỮ NGUYÊN khoá, không bao giờ tự mở. Không đổi HTML: lớp phủ dựng bằng JS, CSS có tiền tố "sl01-". */
(function setupLockInit() {
    "use strict";
    if (typeof document === "undefined" || !document.body) return;

    var overlay = null;
    var retryTimer = null;

    function isEn() { return !!(window.I18N && window.I18N.lang === "en"); }
    function t(vi, en) { return isEn() ? en : vi; }

    function injectStyle() {
        if (document.getElementById("setupLockStyle")) return;
        var st = document.createElement("style");
        st.id = "setupLockStyle";
        st.textContent =
            ".sl01-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#020813;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',sans-serif;}" +
            ".sl01-box{width:340px;max-width:90vw;box-sizing:border-box;padding:26px 28px;border-radius:12px;background:#0b1a2b;border:1px solid #1c3b5a;color:#e6f4ff;box-shadow:0 12px 48px rgba(0,0,0,.6);}" +
            ".sl01-title{font-size:17px;font-weight:700;letter-spacing:.5px;text-align:center;margin-bottom:6px;color:#38bdf8;}" +
            ".sl01-sub{font-size:12px;text-align:center;opacity:.75;margin-bottom:16px;}" +
            ".sl01-input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #2a4a6b;background:#06111d;color:#fff;font-size:15px;}" +
            ".sl01-input:focus{outline:none;border-color:#38bdf8;}" +
            ".sl01-err{min-height:18px;margin:8px 0 2px;font-size:12px;color:#ff6b6b;text-align:center;}" +
            ".sl01-btn{width:100%;padding:10px;border:0;border-radius:8px;background:#00d2ff;color:#02202e;font-weight:700;font-size:14px;cursor:pointer;}" +
            ".sl01-btn:disabled{opacity:.5;cursor:default;}";
        (document.head || document.documentElement).appendChild(st);
    }

    function setInert(on) {
        Array.prototype.forEach.call(document.body.children, function (c) {
            if (c === overlay) return;
            if (c.tagName === "SCRIPT" || c.tagName === "STYLE") return;
            if (on) c.setAttribute("inert", ""); else c.removeAttribute("inert");
        });
    }

    function unlock() {
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        setInert(false);
    }

    function lock() {
        if (overlay) return; // đã khoá rồi
        injectStyle();

        overlay = document.createElement("div");
        overlay.className = "sl01-overlay";
        var box = document.createElement("div");
        box.className = "sl01-box";

        var title = document.createElement("div");
        title.className = "sl01-title";
        title.textContent = t("🔒 CÀI ĐẶT ĐÃ KHOÁ", "🔒 SETTINGS LOCKED");
        var sub = document.createElement("div");
        sub.className = "sl01-sub";
        sub.textContent = t("Nhập mật khẩu để mở Cài đặt", "Enter the password to open Settings");

        var input = document.createElement("input");
        input.type = "password";
        input.className = "sl01-input";
        input.autocomplete = "off";
        input.placeholder = "••••••••";

        var err = document.createElement("div");
        err.className = "sl01-err";

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sl01-btn";
        btn.textContent = t("MỞ KHOÁ", "UNLOCK");

        box.appendChild(title);
        box.appendChild(sub);
        box.appendChild(input);
        box.appendChild(err);
        box.appendChild(btn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        setInert(true);
        setTimeout(function () { try { input.focus(); } catch (e) { /* bỏ qua */ } }, 50);

        var busy = false;
        function setBusy(b) { busy = b; btn.disabled = b; input.disabled = b; }

        function attempt() {
            if (busy) return;
            var pw = input.value; // không bao giờ log biến này
            if (!pw) { err.textContent = t("Vui lòng nhập mật khẩu.", "Please enter the password."); return; }
            var api = window.electronAPI;
            if (!api || typeof api.setupLockVerify !== "function") {
                err.textContent = t("Không kiểm tra được mật khẩu (thiếu kênh kết nối).", "Cannot verify the password (missing channel).");
                return; // fail-closed: giữ khoá
            }
            err.textContent = "";
            setBusy(true);
            Promise.resolve(api.setupLockVerify(pw)).then(function (r) {
                if (r && r.ok === true) { unlock(); return; }
                input.value = "";
                if (r && r.reason === "locked") {
                    var sec = Math.max(1, Math.ceil((r.retryMs || 30000) / 1000));
                    err.textContent = t("Sai nhiều lần. Thử lại sau " + sec + " giây.", "Too many attempts. Try again in " + sec + " s.");
                    btn.disabled = true; input.disabled = true; // giữ khoá nút trong lúc chờ
                    retryTimer = setTimeout(function () { retryTimer = null; setBusy(false); err.textContent = ""; try { input.focus(); } catch (e) { /* bỏ qua */ } }, sec * 1000);
                    return;
                }
                err.textContent = t("Sai mật khẩu.", "Wrong password.");
                setBusy(false);
                try { input.focus(); } catch (e) { /* bỏ qua */ }
            }).catch(function () {
                err.textContent = t("Lỗi hệ thống, thử lại.", "System error, try again.");
                setBusy(false);
            });
        }

        btn.addEventListener("click", attempt);
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
    }

    // Khoá ngay khi trang Setup dựng xong (cửa sổ Setup tạo ẩn lúc khởi động, hiện ra thì đã khoá sẵn).
    lock();

    // Main báo Setup vừa bị ẩn/đóng => khoá lại cho lần mở sau.
    try {
        if (window.electronAPI && typeof window.electronAPI.onSetupLockEngage === "function") {
            window.electronAPI.onSetupLockEngage(function () { lock(); });
        }
    } catch (e) { console.error("SETUP-LOCK-01 đăng ký engage lỗi (bỏ qua):", e); }
})();
/* SETUP-LOCK-01 END */
