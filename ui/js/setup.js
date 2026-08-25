(function loadAppSettingsModule() {
    if (typeof loadSetup === "function") {
        return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("GET", "appSettings.js", false);
    xhr.send();

    if (xhr.status >= 200 && xhr.status < 300) {
        Function(xhr.responseText)();
    }
})();

loadSetup?.();

function saveSetting(key, value) {
    setSetting(key, value);
}

function loadSetting(key, fallback = "Chưa chọn") {
    return getSetting(key, fallback);
}

/* Gọi notifySetupChanged() một cách an toàn (electronAPI có thể chưa sẵn sàng) */
function notifySetupChanged() {
    if (window.electronAPI?.notifySetupChanged) {
        window.electronAPI.notifySetupChanged();
    } else {
        console.warn("electronAPI.notifySetupChanged không khả dụng");
    }
}

function initModal(openId, modalId, closeId) {
    const openBtn = document.getElementById(openId);
    const modal = document.getElementById(modalId);
    const closeBtn = closeId ? document.getElementById(closeId) : null;

    if (openBtn && modal) {
        openBtn.addEventListener("click", () => {
            modal.classList.add("show");
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener("click", () => {
            modal.classList.remove("show");
        });
    }
}

function restoreRadioSelection(radioName, storageKey) {
    const saved = getSetting(storageKey);
    if (!saved) {
        return;
    }

    const radio = document.querySelector(
        `input[name="${radioName}"][value="${saved}"]`
    );
    if (radio) {
        radio.checked = true;
    }
}

function setupRadioSetting({
    openBtnId,
    modalId,
    closeBtnId,
    saveBtnId,
    radioName,
    storageKey,
    displayId
}) {
    initModal(openBtnId, modalId, closeBtnId);
    const saveBtn = document.getElementById(saveBtnId);
    const display = document.getElementById(displayId);
    if (display) {
        display.textContent = loadSetting(storageKey);
    }
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            const selected = document.querySelector(
                `input[name="${radioName}"]:checked`
            );
            if (!selected) {
                return;
            }

            saveSetting(storageKey, selected.value);
            updateSetupStatus();
            updateSetupProgress();
            notifySetupChanged();

            if (display) {
                display.textContent = selected.value;
            }

            document.getElementById(modalId)?.classList.remove("show");
        });
    }
}

function initSetupPage() {

    restoreRadioSelection("daw", "selectedDAW");
    restoreRadioSelection("autokey", "selectedAutoKey");
    restoreRadioSelection("autotune", "selectedAutoTune");
    restoreRadioSelection("beMethod", "selectedBeMethod");
    restoreRadioSelection("fixMethod", "selectedFixMethod");

    setupRadioSetting({
        openBtnId: "selectDawBtn",
        modalId: "dawModal",
        closeBtnId: "closeDawBtn",
        saveBtnId: "saveDawBtn",
        radioName: "daw",
        storageKey: "selectedDAW",
        displayId: "currentDaw"
    });

    setupRadioSetting({
        openBtnId: "selectAutoKeyBtn",
        modalId: "autoKeyModal",
        closeBtnId: "closeAutoKeyBtn",
        saveBtnId: "saveAutoKeyBtn",
        radioName: "autokey",
        storageKey: "selectedAutoKey",
        displayId: "currentAutoKey"
    });

    setupRadioSetting({
        openBtnId: "selectAutoTuneBtn",
        modalId: "autoTuneModal",
        closeBtnId: "closeAutoTuneBtn",
        saveBtnId: "saveAutoTuneBtn",
        radioName: "autotune",
        storageKey: "selectedAutoTune",
        displayId: "currentAutoTune"
    });

    /* ================= BROWSER MODAL ================= */
    initModal("openBrowserModal", "browserModal", "closeBrowserBtn");

    const savedBrowser = getSetting("selectedBrowser");
    if (savedBrowser) {
        const radio = document.querySelector(
            `input[name="browser"][value="${savedBrowser}"]`
        );
        if (radio) {
            radio.checked = true;
        }
    }

    const savedYoutubeId = getSetting("youtubePwaId");
    if (savedYoutubeId) {
        const ytInput = document.getElementById("youtubeIdInput");
        if (ytInput) ytInput.value = savedYoutubeId;
    }

    const browserPathDisplay = document.getElementById("browserPathDisplay");
    if (browserPathDisplay) {
        const savedPath = getSetting("selectedBrowserPath");
        browserPathDisplay.textContent = savedPath || "❌ Chưa thiết lập";
    }

    // Tự động dò đường dẫn cài đặt ngay khi tích chọn 1 trình duyệt.
    // Không tìm thấy thì báo để bạn dùng nút "Chọn đường dẫn trình duyệt" bên dưới (thủ công).
    document.querySelectorAll('input[name="browser"]').forEach((radio) => {
        radio.addEventListener("change", async () => {
            if (!radio.checked) return;

            if (browserPathDisplay) {
                browserPathDisplay.textContent = "⏳ Đang dò đường dẫn...";
            }

            if (!window.electronAPI?.findBrowserPath) {
                if (browserPathDisplay) browserPathDisplay.textContent = "❌ Chưa thiết lập";
                return;
            }

            try {
                const found = await window.electronAPI.findBrowserPath(radio.value);

                if (found) {
                    saveSetting("selectedBrowserPath", found);
                    if (browserPathDisplay) browserPathDisplay.textContent = found;
                } else {
                    saveSetting("selectedBrowserPath", "");
                    if (browserPathDisplay) {
                        browserPathDisplay.textContent = '❌ Không tự tìm thấy — hãy bấm "Chọn đường dẫn trình duyệt" bên dưới';
                    }
                }
            } catch (err) {
                console.error("findBrowserPath lỗi:", err);
                if (browserPathDisplay) browserPathDisplay.textContent = "❌ Chưa thiết lập";
            }

            updateSetupStatus();
            updateSetupProgress();
        });
    });

    document.getElementById("btnSelectBrowserPath")?.addEventListener("click", async () => {
        if (!window.electronAPI?.selectFile) {
            console.warn("electronAPI.selectFile không khả dụng");
            alert("Chức năng chọn file chưa khả dụng");
            return;
        }

        try {
            const filePath = await window.electronAPI.selectFile({
                filters: [{ name: "Ứng dụng", extensions: ["exe"] }]
            });
            if (filePath) {
                saveSetting("selectedBrowserPath", filePath);
                if (browserPathDisplay) browserPathDisplay.textContent = filePath;
                updateSetupStatus();
                updateSetupProgress();
                notifySetupChanged();
            }
        } catch (err) {
            console.error("Chọn đường dẫn trình duyệt lỗi:", err);
        }
    });

    document.getElementById("saveBrowserBtn")?.addEventListener("click", () => {
        const browser = document.querySelector('input[name="browser"]:checked');
        if (!browser) {
            return;
        }

        saveSetting("selectedBrowser", browser.value);
        saveSetting(
            "youtubePwaId",
            document.getElementById("youtubeIdInput")?.value ?? ""
        );

        if (!getSetting("selectedBrowserPath")) {
            alert('Đã lưu trình duyệt, nhưng CHƯA có đường dẫn — Browser sẽ chưa tính là "xong" trong Trạng thái Setup cho tới khi có đường dẫn (tự dò hoặc chọn tay).');
        }

        // Đồng bộ với DAW/Auto-Key/Auto-Tune: cập nhật status, progress và báo cho renderer
        updateSetupStatus();
        updateSetupProgress();
        notifySetupChanged();

        document.getElementById("browserModal")?.classList.remove("show");
    });

    /* ================= CÁC MODAL KHÁC ================= */
    initModal("openShortcutsBtn", "shortcutsModal", "closeShortcuts");
    initShortcutsSection();
    initModal("openProjectModal", "projectModal", "btnClosePj");
    initProjectSection();
    initModal("openSoundcardModal", "soundcardModal", "closeSoundcardBtn");
    initSoundcardSection();
    initModal("openMidiModal", "midiModal", "closeMidiBtn");
    initMidiSection();
    initLinkProSection();
    initModal("openBeModal", "beModal", "closeBeBtn");
    initModal("openFixMeoModal", "fixMeoModal", "closeFixMeoBtn");

    document.getElementById("beModal")?.classList.remove("show");
    document.getElementById("fixMeoModal")?.classList.remove("show");

    document.getElementById("saveBeBtn")?.addEventListener("click", () => {
        const selected = document.querySelector('input[name="beMethod"]:checked');
        if (!selected) {
            return;
        }

        saveSetting("selectedBeMethod", selected.value);
        updateSetupStatus();
        updateSetupProgress();
        notifySetupChanged();

        document.getElementById("beModal")?.classList.remove("show");
    });

    document.getElementById("saveFixMeoBtn")?.addEventListener("click", () => {
        const selected = document.querySelector('input[name="fixMethod"]:checked');
        if (!selected) {
            return;
        }

        saveSetting("selectedFixMethod", selected.value);
        updateSetupStatus();
        updateSetupProgress();
        notifySetupChanged();

        document.getElementById("fixMeoModal")?.classList.remove("show");
    });

    /* ================= NÚT CÀI ĐẶT (tự tải + tự mở trình cài đặt) ================= */
    setupDownloadInstallButton(
        "btnAutoTune11",
        "https://mega.nz/file/e1ZE1B4D#HkxyQVYtfKQ3GQ3p01NnWS-qVwAJXGoCpS6VIGA5jBg",
        "AutoTune11Setup"
    );
    setupDownloadInstallButton(
        "btnJbridge",
        "https://mega.nz/file/f9p03RpY#5QSPbICOXBSkIzEv5s8BI_ZATbR97zxTeSL0vKR8X3g",
        "jBridgeSetup"
    );

    // VST2: tải file .zip (đã nén cả bộ plugin) từ Mega rồi giải nén vào C:\Program Files\VstPlugins
    const VST2_ZIP_URL = "https://mega.nz/file/6l432ZgJ#yYDrbnGwBnf_BHwfI_eQTOSW3QliMF7oRZS5GUf0_zg";
    document.getElementById("btnVst2")?.addEventListener("click", async () => {
        if (!VST2_ZIP_URL) {
            alert("Chưa có link file .zip VST2 — gửi link cho Claude để hoàn thiện nút này.");
            return;
        }

        if (!window.electronAPI?.downloadVst2) {
            alert("Chức năng tải VST2 chưa khả dụng");
            return;
        }

        if (!confirm("Tải và cài Plugins VST2 vào C:\\Program Files\\VstPlugins?\nSẽ có popup xin quyền Admin, bấm Yes để tiếp tục.")) {
            return;
        }

        const btn = document.getElementById("btnVst2");
        const originalText = btn.textContent;
        btn.textContent = "⏳ Đang tải VST2...";
        btn.disabled = true;

        try {
            const result = await window.electronAPI.downloadVst2(VST2_ZIP_URL);
            if (result.success) {
                alert("Đã cài xong VST2 vào:\n" + result.path);
            } else {
                alert("Lỗi: " + result.error);
            }
        } catch (err) {
            console.error("downloadVst2 lỗi:", err);
            alert("Có lỗi xảy ra khi tải/cài VST2");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById("btnInstallBrave")?.addEventListener("click", async () => {
        if (!window.electronAPI?.downloadBrave) {
            alert("Chức năng tải Brave chưa khả dụng");
            return;
        }

        if (!confirm("Tải và cài Brave (trình duyệt không quảng cáo)?")) {
            return;
        }

        const btn = document.getElementById("btnInstallBrave");
        const originalText = btn.textContent;
        btn.textContent = "⏳ Đang tải Brave...";
        btn.disabled = true;

        try {
            const result = await window.electronAPI.downloadBrave();
            if (result.success) {
                alert("Đã tải xong, trình cài đặt Brave đang mở — làm theo hướng dẫn trên màn hình.");
            } else {
                alert("Lỗi: " + result.error);
            }
        } catch (err) {
            console.error("downloadBrave lỗi:", err);
            alert("Có lỗi xảy ra khi tải Brave");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById("btnInstallLoopMidi")?.addEventListener("click", async () => {
        if (!window.electronAPI?.openExternalUrl) {
            alert("Chức năng mở trang tải chưa khả dụng");
            return;
        }

        if (!confirm('Mở trang tải loopMIDI (phần mềm tạo cổng MIDI ảo, miễn phí)?\nSau khi trang mở ra, bấm "Download" trên đó rồi tự cài như bình thường.')) {
            return;
        }

        await window.electronAPI.openExternalUrl("https://www.tobias-erichsen.de/software/loopmidi.html");
    });

    document.getElementById("btnContactKhoi")?.addEventListener("click", async () => {
        const phone = "034.9644.194";
        try {
            await navigator.clipboard.writeText(phone.replace(/\./g, ""));
            alert("Đã copy số điện thoại: " + phone);
        } catch (err) {
            console.warn("Không copy được vào clipboard:", err);
            alert("Số điện thoại: " + phone);
        }
    });

    /* ================= NÚT LẤY TỌA ĐỘ ================= */
    // Lưu ý: mỗi nút chỉ được gắn DUY NHẤT một handler qua setupCaptureButton
    // (bản cũ có thêm 1 handler thủ công riêng cho btnAutoKey1 gây gọi capture 2 lần — đã bỏ)
    setupCaptureButton("btnAutoKey1", "autokey1");
    setupCaptureButton("btnAutoKey2", "autokey2");
    setupCaptureButton("btnAutoTuneKey", "autotunekey");
    setupCaptureButton("btnChromatic", "chromatic");
    // Task B/B2 — DAW Action Mapping (Mục V/X): tái dùng ĐÚNG cơ chế setupCaptureButton +
    // coordinateProfiles[selectedDAW] đã có sẵn, chỉ thêm 3 key mới (daw_play/daw_stop/
    // daw_record), không đụng autokey1/autokey2/autotunekey/chromatic (Key/Tone Plugin).
    setupCaptureButton("btnCaptureDawPlay", "daw_play");
    setupCaptureButton("btnCaptureDawStop", "daw_stop");
    setupCaptureButton("btnCaptureDawRecord", "daw_record");
    initMouseControlToggle();
    initDawActionMappingStatus();
    initDawMidiOutputMappingSection();
    initAhkPathSection();

    updateSetupStatus();
    updateSetupProgress();

    /* ================= LAUNCH DAW CÙNG MENU ================= */
    const launchDawCheckbox = document.getElementById("launchDawOnStartup");
    if (launchDawCheckbox) {
        launchDawCheckbox.checked =
            getSetting("launchDAW", false) === true ||
            getSetting("launchDAW") === "true";

        launchDawCheckbox.addEventListener("change", () => {
            saveSetting("launchDAW", launchDawCheckbox.checked);
        });
    }

    /* ================= PRESET ================= */
    document.getElementById("savePresetBtn")?.addEventListener("click", savePreset);
    document.getElementById("loadPresetBtn")?.addEventListener("click", loadPreset);

    /* ================= ĐƯỜNG DẪN DAW ================= */
    // Sửa id cho khớp với setup.html: browseDawBtn / currentDawPath
    // (bản cũ trỏ tới btnSelectDawPath / displayDawPath — không tồn tại nên tính năng này chết hoàn toàn)
    const browseDawBtn = document.getElementById("browseDawBtn");
    const currentDawPath = document.getElementById("currentDawPath");

    if (browseDawBtn) {
        browseDawBtn.addEventListener("click", async () => {
            if (!window.electronAPI?.selectFile) {
                console.warn("electronAPI.selectFile không khả dụng");
                return;
            }

            try {
                const path = await window.electronAPI.selectFile();
                if (path) {
                    setSetting("selectedDAWPath", path);
                    if (currentDawPath) currentDawPath.textContent = path;
                }
            } catch (err) {
                console.error("Chọn đường dẫn DAW lỗi:", err);
            }
        });
    }

    if (currentDawPath) {
        currentDawPath.textContent = getSetting("selectedDAWPath", "❌ Chưa thiết lập");
    }
}

function addConfirmAction(btnId, message) {
    const btn = document.getElementById(btnId);
    if (!btn) {
        return;
    }

    btn.addEventListener("click", () => {
        if (confirm(message)) {
            alert("Đang thực hiện...");
        }
    });
}

// Nút "tự tải file từ Google Drive rồi tự mở trình cài đặt lên"
function setupDownloadInstallButton(btnId, driveUrl, label) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener("click", async () => {
        if (!window.electronAPI?.downloadAndInstall) {
            alert("Chức năng tải & cài đặt chưa khả dụng");
            return;
        }

        if (!confirm(`Tải và cài "${label}"?`)) {
            return;
        }

        const originalText = btn.textContent;
        btn.textContent = "⏳ Đang tải...";
        btn.disabled = true;

        try {
            const result = await window.electronAPI.downloadAndInstall(driveUrl, label);
            if (result.success) {
                alert("Đã tải xong, trình cài đặt đang mở — làm theo hướng dẫn trên màn hình.");
            } else {
                alert("Lỗi: " + result.error);
            }
        } catch (err) {
            console.error(`downloadAndInstall(${label}) lỗi:`, err);
            alert("Có lỗi xảy ra khi tải/cài đặt");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}

function setupCaptureButton(buttonId, captureName) {
    const btn = document.getElementById(buttonId);
    if (!btn) {
        return;
    }

    btn.addEventListener("click", async () => {
        if (!getSetting("selectedDAW")) {
            alert('Hãy chọn DAW ở mục "Thiết lập AutoMenu" trước — tọa độ được lưu riêng theo từng DAW.');
            return;
        }

        if (!window.electronAPI?.setupCapture) {
            console.warn("electronAPI.setupCapture không khả dụng");
            alert("Không lấy được tọa độ");
            return;
        }

        try {
            const result = await window.electronAPI.setupCapture({ name: captureName });
            setCoordinate(captureName, result);
            updateSetupStatus();
            updateSetupProgress();
            notifySetupChanged();
            alert(`Đã lưu tọa độ "${captureName}" cho ${getSetting("selectedDAW")}`);
        } catch (err) {
            console.error(err);
            alert("Không lấy được tọa độ");
        }
    });
}

/* ================= TASK B/B2 — MOUSE CONTROL ON/OFF + DAW ACTION MAPPING STATUS ================= */
// Mục VI (B2): Mouse Control ON/OFF. Đọc/ghi đúng key "mouseControlEnabled" đã thêm trong
// appSettings.js (mặc định true). CHỈ ảnh hưởng ActionRegistry.executeAction() (Task B) —
// không đụng gì tới clickAtPoint() gốc trong vocalCommandRouter.js (Key/Tone Plugin).
function initMouseControlToggle() {
    const btn = document.getElementById("btnMouseControlToggle");
    const badge = document.getElementById("mouseControlBadge");
    if (!btn || !badge) return;

    function render() {
        const enabled = getSetting("mouseControlEnabled");
        const isOn = enabled === undefined || enabled === null || enabled === "" ? true : !!enabled;
        badge.textContent = isOn ? "ON" : "OFF";
        badge.className = isOn ? "badge badge-live" : "badge badge-unwired";
        btn.textContent = isOn ? "Tắt Mouse Control" : "Bật Mouse Control";
    }

    btn.addEventListener("click", () => {
        const current = getSetting("mouseControlEnabled");
        const isOn = current === undefined || current === null || current === "" ? true : !!current;
        saveSetting("mouseControlEnabled", !isOn);
        render();
        notifySetupChanged();
    });

    render();
}

// Mục V/X (B2): hiển thị trạng thái THẬT (không đoán) của 3 action DAW_PLAY/STOP/RECORD cho
// DAW đang chọn — đọc trực tiếp coordinateProfiles + dawMidiOutMappings qua getSetting/
// getCoordinate đã có sẵn, không cần nạp actionRegistry.js vào cửa sổ Setup (tránh 2
// dispatcher MIDI song song — đúng cảnh báo Mục XI).
//
// S8/S9/S11 — MỞ RỘNG (không thay kiến trúc trên): thêm UI thật cho dawMidiOutMappings +
// bảng Mapping Overview đầy đủ 4 cột (MIDI Input / MIDI Output / Mouse Coordinate / Action
// Status). VẪN giữ quyết định KHÔNG load actionRegistry.js vào Setup — mọi logic Action
// Status ở đây được lặp lại NGUYÊN VĂN theo đúng thứ tự ưu tiên của getActionStatus() (MIDI
// output trước, rồi mouse coordinate, rồi NOT_CONFIGURED) và ĐÚNG 5 giá trị enum ACTION_STATUS
// (SUCCESS/NOT_CONFIGURED/NO_DEVICE/MOUSE_DISABLED/ERROR) — không tự bịa giá trị mới.

const DAW_MIDI_ACTIONS = [
    { action: "DAW_PLAY", label: "PLAY", coordKey: "daw_play", midiInputAction: "daw:play" },
    { action: "DAW_STOP", label: "STOP", coordKey: "daw_stop", midiInputAction: "daw:stop" },
    { action: "DAW_RECORD", label: "RECORD", coordKey: "daw_record", midiInputAction: "daw:record" },
    // MIDI-MASTER-01 / MENU-CONTROL-01 — mở rộng để nút Menu (renderer.js) có nơi thật để cấu
    // hình MIDI Output, TÁI SỬ DỤNG nguyên vẹn cơ chế setDawMidiOutMapping()/executeAction() đã
    // có, không tạo UI/schema thứ hai. Các action này chỉ dùng theo chiều OUTPUT (bấm nút Menu ->
    // gửi MIDI) — không có coordKey (chưa có cơ chế capture toạ độ chuột riêng cho nhóm này) và
    // không có midiInputAction (không phải nút nhận lệnh TỪ controller MIDI, đúng bản chất nút
    // Menu bấm tay) — cả 2 field để undefined, initDawMidiOutputMappingSection()/
    // renderMappingOverview() đã tự xử lý an toàn khi thiếu (đã kiểm tra: getCoordinate(undefined)
    // trả "" , .find(m => m.action === undefined) không khớp gì — không throw).
    { action: "PRESET_NORM", label: "PRESET NORM" },
    { action: "PRESET_LOFI", label: "PRESET LOFI" },
    { action: "PRESET_RAP", label: "PRESET RAP" },
    { action: "CLAP", label: "CLAP" },
    { action: "LAUGH", label: "LAUGH" },
    { action: "MONITOR_MIC1", label: "MONITOR MIC1" },
    { action: "MONITOR_MIC2", label: "MONITOR MIC2" },
    { action: "MONITOR_FX", label: "MONITOR FX" },
    // TASK B6 — Beat (input music level) và Master (final DAW output level) là 2 mapping
    // ĐỘC LẬP hoàn toàn — 2 dòng riêng, không gộp, đúng yêu cầu "phải có khả năng cấu hình
    // hai mapping độc lập". Không tự đặt CC — trống mặc định như mọi action khác ở đây.
    { action: "BEAT_INPUT_VOLUME", label: "BEAT INPUT VOLUME" },
    { action: "MASTER_OUTPUT_VOLUME", label: "MASTER OUTPUT VOLUME" },
    // TASK B12 — mở rộng thêm 3 action mới nối ở B12 (musicBtn + Retune×2), tái dùng nguyên
    // vẹn UI/schema đã có, không tạo cơ chế cấu hình thứ hai.
    { action: "MONITOR_BEAT_TOGGLE", label: "MONITOR BEAT" },
    { action: "RETUNE_SPEED_MIC1", label: "RETUNE SPEED MIC1" },
    { action: "RETUNE_SPEED_MIC2", label: "RETUNE SPEED MIC2" },
];

function isMouseControlEnabledLocal() {
    const v = getSetting("mouseControlEnabled");
    return v === undefined || v === null || v === "" ? true : !!v;
}

// Đúng schema actionRegistry.js: dawMidiOutMappings[daw][action] = {kind, channel, number, value|velocity, source}
function getDawMidiOutMapping(action) {
    const daw = getSetting("selectedDAW");
    if (!daw) return null;
    const all = getSetting("dawMidiOutMappings") || {};
    return (all[daw] && all[daw][action]) || null;
}
function setDawMidiOutMapping(action, mapping) {
    const daw = getSetting("selectedDAW");
    if (!daw) return false;
    const all = getSetting("dawMidiOutMappings") || {};
    if (!all[daw]) all[daw] = {};
    all[daw][action] = mapping ? { ...mapping, source: "USER_DEFINED" } : null;
    setSetting("dawMidiOutMappings", all);
    return true;
}

// S8 — 3 hàng PLAY/STOP/RECORD, mỗi hàng: Type (CC/Note) + Channel + Number + Value/Velocity + Lưu + Xoá.
function initDawMidiOutputMappingSection() {
    const container = document.getElementById("dawMidiOutRows");
    const dawBadge = document.getElementById("dawMidiOutDawBadge");
    if (!container) return;

    function render() {
        const daw = getSetting("selectedDAW");
        if (dawBadge) {
            dawBadge.textContent = daw ? `DAW: ${daw}` : "Chưa chọn DAW";
            dawBadge.className = daw ? "badge badge-live" : "badge badge-warn";
        }
        if (!daw) {
            container.innerHTML = '<p class="hint-text">Chưa chọn DAW ở tab "Chọn DAW" — chưa thể cấu hình MIDI Output.</p>';
            return;
        }

        container.innerHTML = "";
        DAW_MIDI_ACTIONS.forEach(({ action, label }) => {
            const existing = getDawMidiOutMapping(action);
            const row = document.createElement("div");
            row.className = "midiout-row";
            row.innerHTML = `
                <b>${label}</b>
                <select class="mo-kind">
                    <option value="cc" ${existing?.kind === "cc" ? "selected" : ""}>CC</option>
                    <option value="note" ${existing?.kind === "note" ? "selected" : ""}>Note</option>
                </select>
                <input class="mo-channel" type="number" min="1" max="16" placeholder="Ch" value="${existing?.channel ?? 1}">
                <input class="mo-number" type="number" min="0" max="127" placeholder="Số" value="${existing?.number ?? ""}">
                <input class="mo-value" type="number" min="0" max="127" placeholder="Value/Vel" value="${existing?.kind === "note" ? (existing?.velocity ?? "") : (existing?.value ?? "")}">
                <button class="setup-btn mo-save">💾 Lưu</button>
                <span class="badge ${existing ? "badge-live" : "badge-warn"} mo-status">${existing ? "Đã cấu hình" : "NOT_CONFIGURED"}</span>
            `;

            row.querySelector(".mo-save").addEventListener("click", () => {
                const kind = row.querySelector(".mo-kind").value;
                const channel = parseInt(row.querySelector(".mo-channel").value, 10) || 1;
                const number = parseInt(row.querySelector(".mo-number").value, 10);
                const val = parseInt(row.querySelector(".mo-value").value, 10);
                if (!Number.isFinite(number)) {
                    alert("Vui lòng nhập Số (CC number / Note number).");
                    return;
                }
                const mapping = { kind, channel, number };
                if (kind === "note") mapping.velocity = Number.isFinite(val) ? val : 100;
                else mapping.value = Number.isFinite(val) ? val : 127;

                setDawMidiOutMapping(action, mapping);
                notifySetupChanged();
                render();
                renderMappingOverview();
            });

            container.appendChild(row);
        });
    }

    render();
    document.getElementById("saveDawBtn")?.addEventListener("click", () => setTimeout(render, 300));
}

// S9/S11 — bảng Overview: PLAY/STOP/RECORD × {MIDI Input Mapping, MIDI Output Mapping,
// Mouse Coordinate, Action Status}. Action Status lặp lại ĐÚNG thứ tự ưu tiên của
// actionRegistry.js::getActionStatus() (không load file đó vào Setup — xem ghi chú đầu hàm).
function renderMappingOverview() {
    const el = document.getElementById("mappingOverviewTable");
    if (!el) return;

    const daw = getSetting("selectedDAW");
    if (!daw) {
        el.innerHTML = '<p class="hint-text">Chưa chọn DAW.</p>';
        return;
    }

    const midiInputMappings = getSetting("midiMappingsV1") || [];
    const mouseOn = isMouseControlEnabledLocal();

    const rows = DAW_MIDI_ACTIONS.map(({ action, label, coordKey, midiInputAction }) => {
        const inputMap = midiInputMappings.find((m) => m.action === midiInputAction);
        const inputText = inputMap ? `${inputMap.kind?.toUpperCase() ?? "?"} ${inputMap.number} ch${inputMap.channel}` : "— chưa Learn";

        const outputMap = getDawMidiOutMapping(action);
        const outputText = outputMap
            ? `${outputMap.kind === "note" ? "NOTE" : "CC"} ${outputMap.number} ch${outputMap.channel}`
            : "— chưa cấu hình";

        const coord = getCoordinate(coordKey);
        const coordText = coord || "— chưa capture";

        // Đúng thứ tự getActionStatus(): MIDI output trước, rồi mouse, rồi NOT_CONFIGURED.
        let status;
        if (outputMap) status = "SUCCESS (MIDI)";
        else if (coord) status = mouseOn ? "SUCCESS (Mouse)" : "MOUSE_DISABLED";
        else status = "NOT_CONFIGURED";

        return `<tr><td><b>${label}</b></td><td>${inputText}</td><td>${outputText}</td><td>${coordText}</td><td>${status}</td></tr>`;
    }).join("");

    el.innerHTML = `
        <table class="overview-table">
            <thead><tr><th>Action</th><th>MIDI Input</th><th>MIDI Output</th><th>Mouse Coordinate</th><th>Action Status</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function initDawActionMappingStatus() {
    const el = document.getElementById("dawActionMappingStatus");
    if (!el) return;

    function render() {
        const daw = getSetting("selectedDAW");
        if (!daw) {
            el.textContent = "Chưa chọn DAW ở mục \"Thiết lập AutoMenu\" — chưa thể capture toạ độ.";
            return;
        }
        const keys = [
            ["DAW_PLAY", "daw_play"],
            ["DAW_STOP", "daw_stop"],
            ["DAW_RECORD", "daw_record"]
        ];
        const parts = keys.map(([label, key]) => `${label}: ${getCoordinate(key) ? "✅ đã capture" : "— chưa capture"}`);
        el.textContent = `DAW "${daw}" — ${parts.join(" · ")}`;
        renderMappingOverview();
    }

    render();
    // Cập nhật lại mỗi khi bấm xong 1 capture (setupCaptureButton tự alert rồi mới xong async,
    // nên poll nhẹ khi panel này active là đủ, không cần event riêng)
    document.getElementById("btnCaptureDawPlay")?.addEventListener("click", () => setTimeout(render, 500));
    document.getElementById("btnCaptureDawStop")?.addEventListener("click", () => setTimeout(render, 500));
    document.getElementById("btnCaptureDawRecord")?.addEventListener("click", () => setTimeout(render, 500));
    document.getElementById("saveDawBtn")?.addEventListener("click", () => setTimeout(render, 300));
}

/* ================= PHÍM TẮT ================= */
const SHORTCUT_FIELDS = [
    { id: "shortcutNormal", key: "normal" },
    { id: "shortcutLofi", key: "lofi" },
    { id: "shortcutRemix", key: "remix" },
    { id: "shortcutRap", key: "rap" },
    { id: "shortcutKeyDetect", key: "doTone" }
];

function initShortcutsSection() {
    const saved = getSetting("shortcuts") || {};

    SHORTCUT_FIELDS.forEach(({ id, key }) => {
        const input = document.getElementById(id);
        if (!input) return;

        input.value = saved[key] || "";

        // Chỉ nhận phím tắt qua bàn phím, không cho gõ tay trực tiếp vào ô
        input.addEventListener("keydown", (e) => {
            e.preventDefault();

            if (e.key === "Escape" || e.key === "Backspace" || e.key === "Delete") {
                input.value = "";
                return;
            }

            // Chờ phím chính đi kèm, chưa gán nếu chỉ mới nhấn Ctrl/Alt/Shift
            if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
                return;
            }

            input.value = formatKeyCombo(e);
        });
    });

    document.getElementById("saveShortcuts")?.addEventListener("click", () => {
        const data = {};
        SHORTCUT_FIELDS.forEach(({ id, key }) => {
            data[key] = document.getElementById(id)?.value || "";
        });

        saveSetting("shortcuts", data);
        notifySetupChanged();
        alert("Đã lưu phím tắt");
    });

    document.getElementById("clearShortcuts")?.addEventListener("click", () => {
        SHORTCUT_FIELDS.forEach(({ id }) => {
            const input = document.getElementById(id);
            if (input) input.value = "";
        });

        saveSetting("shortcuts", {});
        notifySetupChanged();
    });
}

/* ================= PROJECT MODAL ================= */
function initProjectSection() {
    const pjPathDisplay = document.getElementById("pjPathDisplay");
    const checkOpenPj = document.getElementById("checkOpenPj");
    const checkCopyPj = document.getElementById("checkCopyPj");
    const checkOpenYt = document.getElementById("checkOpenYt");

    // Khôi phục trạng thái đã lưu
    if (pjPathDisplay) {
        pjPathDisplay.value = getSetting("projectPath", "Chưa chọn project");
    }
    if (checkOpenPj) {
        checkOpenPj.checked = getSetting("projectOpenEnabled") === true || getSetting("projectOpenEnabled") === "true";
    }
    if (checkCopyPj) {
        checkCopyPj.checked = getSetting("projectCopyEnabled") === true || getSetting("projectCopyEnabled") === "true";
    }
    if (checkOpenYt) {
        checkOpenYt.checked = getSetting("projectOpenYoutube") === true || getSetting("projectOpenYoutube") === "true";
    }

    checkOpenPj?.addEventListener("change", () => saveSetting("projectOpenEnabled", checkOpenPj.checked));
    checkCopyPj?.addEventListener("change", () => saveSetting("projectCopyEnabled", checkCopyPj.checked));
    checkOpenYt?.addEventListener("change", () => saveSetting("projectOpenYoutube", checkOpenYt.checked));

    document.getElementById("btnSelectPj")?.addEventListener("click", async () => {
        if (!window.electronAPI?.selectFile) {
            console.warn("electronAPI.selectFile không khả dụng");
            alert("Chức năng chọn file chưa khả dụng");
            return;
        }

        try {
            const path = await window.electronAPI.selectFile();
            if (path) {
                saveSetting("projectPath", path);
                if (pjPathDisplay) pjPathDisplay.value = path;
            }
        } catch (err) {
            console.error("Chọn project lỗi:", err);
        }
    });

    // Lưu ý: nút này chỉ lưu lại đường dẫn ĐANG HIỂN THỊ trong ô phía trên.
    // Vì Electron không có cách chuẩn để tự phát hiện project đang mở bên trong DAW,
    // nên đây thực chất là "xác nhận lưu" chứ chưa tự động đọc từ DAW.
    document.getElementById("btnSaveCurrentPj")?.addEventListener("click", () => {
        const current = pjPathDisplay?.value?.trim();

        if (!current || current === "Chưa chọn project") {
            alert('Chưa có project nào. Hãy dùng "Chọn PJ" trước.');
            return;
        }

        saveSetting("projectPath", current);
        alert("Đã lưu project hiện tại");
    });

    document.getElementById("btnOpenProjectBundle")?.addEventListener("click", async () => {
        const willOpenProject = checkOpenPj?.checked;
        const willOpenYoutube = checkOpenYt?.checked;

        if (!willOpenProject && !willOpenYoutube) {
            alert('Hãy tick "Mở Project" hoặc "Mở Youtube" trước.');
            return;
        }

        if (willOpenProject && (!pjPathDisplay?.value || pjPathDisplay.value === "Chưa chọn project")) {
            alert('Chưa chọn Project. Hãy dùng "Chọn PJ" trước.');
            return;
        }

        const result = await openProjectYoutubeBundle();

        if (result?.errors?.length) {
            alert("Có lỗi xảy ra:\n" + result.errors.join("\n"));
        } else if (!result?.skipped) {
            alert("Đã mở kèm Project/Youtube");
        }
    });
}

/* ================= SOUNDCARD (AUDIO INTERFACE) ================= */
async function populateSoundcardOptions(selectEl, selectedValue) {
    if (!navigator.mediaDevices?.enumerateDevices) {
        return { foundInRealList: false };
    }

    try {
        // Cần xin quyền mic trước thì enumerateDevices mới trả về label thật
        // (nếu người dùng từ chối, vẫn liệt kê được device nhưng label rỗng)
        try {
            const tmpStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            tmpStream.getTracks().forEach(track => track.stop());
        } catch (permErr) {
            console.warn("Không có quyền mic, danh sách soundcard có thể thiếu tên:", permErr);
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === "audioinput");

        selectEl.innerHTML = '<option value="">Chọn Soundcard...</option>';

        inputs.forEach((device, idx) => {
            const opt = document.createElement("option");
            opt.value = device.deviceId;
            opt.textContent = device.label || `Soundcard ${idx + 1}`;
            selectEl.appendChild(opt);
        });

        // S2 mục 9 — phải phân biệt được: selectedValue có thật sự nằm trong danh sách device
        // THẬT vừa liệt kê hay không (khác với việc UI có 1 <option> hiển thị cho nó hay không —
        // option fallback bên dưới KHÔNG tính là "tồn tại thật").
        const foundInRealList = !selectedValue ? false : inputs.some((d) => d.deviceId === selectedValue);

        if (selectedValue) {
            const match = [...selectEl.options].find(o => o.value === selectedValue);
            if (match) {
                selectEl.value = selectedValue;
            } else {
                // Thiết bị đã lưu không còn trong danh sách hiện tại (đổi máy/rút dây...):
                // vẫn giữ lại lựa chọn cũ để KHÔNG MẤT setting (mục 6: không tự xoá), thêm vào
                // cuối danh sách chỉ để UI có gì đó hiển thị — KHÔNG coi đây là "device khả dụng".
                const fallbackOpt = document.createElement("option");
                fallbackOpt.value = selectedValue;
                fallbackOpt.textContent = `(Đã lưu trước đó) ${selectedValue}`;
                selectEl.appendChild(fallbackOpt);
                selectEl.value = selectedValue;
            }
        }

        return { foundInRealList };
    } catch (err) {
        console.error("Không thể liệt kê thiết bị audio:", err);
        return { foundInRealList: false };
    }
}

function updateSoundcardDisplays(foundInRealList = false) {
    const saved = getSetting("selectedSoundcard");
    const savedId = getSetting("selectedSoundcardId");
    const modalDisplay = document.getElementById("statusSoundcardModal");
    if (modalDisplay) {
        modalDisplay.textContent = saved || "Chưa chọn soundcard nào";
    }

    // S2 mục 3/4 — 3 trạng thái RÕ RÀNG, dựa DUY NHẤT vào selectedSoundcardId (không đổi tên
    // field, không tạo field song song). KHÔNG dùng chữ "Connected" — S2 chưa test stream thật,
    // đó là việc của S3 (AUDIO SIGNAL: OK/NO AUDIO SIGNAL).
    const badge = document.getElementById("soundcardStatusBadge");
    if (!badge) return;

    if (!savedId) {
        // A. Chưa chọn
        badge.textContent = "⚠ Chưa chọn Audio Interface";
        badge.className = "badge badge-warn";
    } else if (foundInRealList) {
        // B. Đã chọn và device vẫn tồn tại trong enumerateDevices() hiện tại
        badge.textContent = "● Đã chọn Audio Interface";
        badge.className = "badge badge-live";
    } else {
        // C. Đã lưu ID nhưng device hiện KHÔNG còn trong danh sách thật -> không giả vờ connected,
        // không tự xoá setting (mục 6), không tự fallback sang device khác.
        badge.textContent = "⚠ Audio Interface không khả dụng";
        badge.className = "badge badge-warn";
    }
}

function initMidiSection() {
    const select = document.getElementById("midiPortSelect");
    const saveBtn = document.getElementById("saveMidiBtn");
    const dashPill = document.getElementById("dashMidiPill");
    if (!select) return;

    // --- Cập nhật Dashboard MIDI pill theo cấu hình đã lưu ---
    function updateDashboardMidiPill() {
        if (!dashPill) return;
        const portName = getSetting("midiOutputPort", "");
        if (portName) {
            dashPill.textContent = "Đã cấu hình";
            dashPill.className = "status-pill status-pill--ok";
            dashPill.title = "Cổng MIDI: " + portName;
        } else {
            dashPill.textContent = "Chưa cấu hình";
            dashPill.className = "status-pill status-pill--dim";
            dashPill.title = "";
        }
    }

    async function populatePorts() {
        const saved = getSetting("midiOutputPort");
        const ports = await listMidiOutputs();

        select.innerHTML = '<option value="">Chọn cổng MIDI...</option>';
        ports.forEach((port) => {
            const opt = document.createElement("option");
            opt.value = port.name;
            opt.textContent = port.name;
            select.appendChild(opt);
        });

        if (saved) {
            const match = [...select.options].find((o) => o.value === saved);
            if (match) {
                select.value = saved;
            } else {
                const fallbackOpt = document.createElement("option");
                fallbackOpt.value = saved;
                fallbackOpt.textContent = "(Đã lưu trước đó) " + saved;
                select.appendChild(fallbackOpt);
                select.value = saved;
            }
        }

        if (ports.length === 0) {
            console.warn("Không tìm thấy cổng MIDI nào — kiểm tra đã tạo cổng ảo (vd loopMIDI) chưa.");
        }

        updateDashboardMidiPill();
    }

    populatePorts();

    document.getElementById("btnRefreshMidiPorts")?.addEventListener("click", populatePorts);

    document.getElementById("saveMidiBtn")?.addEventListener("click", () => {
        if (!select.value) {
            alert("Vui lòng chọn 1 cổng MIDI trước.");
            return;
        }

        saveSetting("midiOutputPort", select.value);
        updateSetupStatus();
        updateSetupProgress();
        notifySetupChanged();
        updateDashboardMidiPill();

        // Phản hồi trực quan cho người dùng
        if (saveBtn) {
            const original = saveBtn.textContent;
            saveBtn.textContent = "✅ Đã lưu";
            saveBtn.disabled = true;
            setTimeout(() => {
                saveBtn.textContent = original;
                saveBtn.disabled = false;
            }, 1500);
        }

        // KHÔNG đóng modal nữa - Setup MIDI hiện tại là panel trực tiếp, không phải modal
        // document.getElementById("midiModal")?.classList.remove("show");
    });

    document.getElementById("btnTestMidiNote")?.addEventListener("click", async () => {
        if (!select.value) {
            alert("Chọn cổng MIDI trước khi test.");
            return;
        }
        saveSetting("midiOutputPort", select.value); // lưu tạm để hàm gửi MIDI dùng đúng cổng đang chọn lúc test

        const note = parseInt(document.getElementById("midiTestNote")?.value, 10) || 0;
        const ok = await sendMidiNotePulse(note, 100, 0, 150);
        // MIDI-MASTER-01 Phase 1 — log vào Monitor SAU khi biết kết quả thật (sửa "PASS giả", xem
        // ghi chú trong setupMidiMonitor.js). Lưu ý: ok=true chỉ có nghĩa là lệnh gửi qua Web MIDI
        // API không bị từ chối ở tầng trình duyệt — KHÔNG xác nhận phần cứng/DAW đã nhận được.
        window.MidiMonitor?.logTestResult("NOTE", note, ok, ok ? null : "kiểm tra lại cổng MIDI đã chọn");
        if (!ok) {
            alert("Không gửi được — kiểm tra lại cổng MIDI đã chọn.");
        }
    });

    document.getElementById("btnTestMidiCC")?.addEventListener("click", async () => {
        if (!select.value) {
            alert("Chọn cổng MIDI trước khi test.");
            return;
        }
        saveSetting("midiOutputPort", select.value);

        const cc = parseInt(document.getElementById("midiTestCC")?.value, 10) || 0;
        const value = parseInt(document.getElementById("midiTestCCValue")?.value, 10) || 0;
        const ok = await sendMidiCC(cc, value, 0);
        window.MidiMonitor?.logTestResult(`CC${cc}`, value, ok, ok ? null : "kiểm tra lại cổng MIDI đã chọn");
        if (!ok) {
            alert("Không gửi được — kiểm tra lại cổng MIDI đã chọn.");
        }
    });

    // --- Auto-refresh khi cắm/rút thiết bị MIDI (Web MIDI statechange) ---
    if (typeof getMidiAccess === "function") {
        getMidiAccess()
            .then((access) => {
                access.onstatechange = () => populatePorts();
            })
            .catch((err) => console.warn("Web MIDI statechange không khả dụng:", err));
    }
}

function initSoundcardSection() {
    const select = document.getElementById("soundcardSelect");
    if (!select) return;

    const savedId = getSetting("selectedSoundcardId");
    populateSoundcardOptions(select, savedId).then(({ foundInRealList }) => updateSoundcardDisplays(foundInRealList));

    // Làm mới danh sách mỗi lần mở modal (thiết bị có thể đã thay đổi)
    document.getElementById("openSoundcardModal")?.addEventListener("click", () => {
        populateSoundcardOptions(select, getSetting("selectedSoundcardId")).then(({ foundInRealList }) => updateSoundcardDisplays(foundInRealList));
    });

    document.getElementById("btnSelectSoundcard")?.addEventListener("click", () => {
        if (!select.value) {
            alert("Vui lòng chọn một soundcard trước.");
            return;
        }

        // Lưu TÊN để hiển thị (giống DAW/Auto-Tune), deviceId lưu riêng để dùng kỹ thuật sau này
        const label = select.selectedOptions[0]?.textContent || select.value;
        saveSetting("selectedSoundcard", label);
        saveSetting("selectedSoundcardId", select.value);

        // S2 mục 5 — chỉ cấu hình + lưu + refresh UI status, KHÔNG restart KeyEngine/BPM/MOD/VU,
        // KHÔNG tạo AudioContext/getUserMedia mới cho pipeline chính. Refresh lại đúng bằng cách
        // liệt kê danh sách thật lần nữa để biết chắc device vừa lưu có thật trong danh sách hay
        // không (an toàn hơn tự suy đoán từ select.value, tránh sai lệch nếu chọn nhầm option fallback).
        populateSoundcardOptions(select, select.value).then(({ foundInRealList }) => updateSoundcardDisplays(foundInRealList));
        updateSetupStatus();
        updateSetupProgress();
        notifySetupChanged();
        alert("Đã lưu soundcard");
    });

    document.getElementById("btnClearAlert")?.addEventListener("click", () => {
        const modalDisplay = document.getElementById("statusSoundcardModal");
        if (modalDisplay) modalDisplay.classList.remove("status-missing");
    });
}

/* ================= LINK PRO: BACKUP / RESTORE ================= */
function initLinkProSection() {
    const checkAutoRestore = document.getElementById("checkAutoRestore");
    if (checkAutoRestore) {
        checkAutoRestore.checked =
            getSetting("autoRestoreOnDawStart") === true ||
            getSetting("autoRestoreOnDawStart") === "true";

        checkAutoRestore.addEventListener("change", () => {
            saveSetting("autoRestoreOnDawStart", checkAutoRestore.checked);
        });
    }

    document.getElementById("btnBackupLink")?.addEventListener("click", async () => {
        if (!window.electronAPI?.exportBackup) {
            console.warn("electronAPI.exportBackup không khả dụng");
            alert("Chức năng Backup chưa khả dụng");
            return;
        }

        try {
            const path = await window.electronAPI.exportBackup(appSettings);
            if (path) alert("Đã backup vào:\n" + path);
        } catch (err) {
            console.error("Backup lỗi:", err);
            alert("Backup thất bại");
        }
    });

    document.getElementById("btnRestoreLink")?.addEventListener("click", async () => {
        if (!window.electronAPI?.importBackup) {
            console.warn("electronAPI.importBackup không khả dụng");
            alert("Chức năng Restore chưa khả dụng");
            return;
        }

        try {
            const data = await window.electronAPI.importBackup();
            if (!data) return;

            if (!confirm("Restore sẽ ghi đè toàn bộ cài đặt hiện tại. Tiếp tục?")) {
                return;
            }

            appSettings = { ...appSettings, ...data };
            saveSetup?.();
            notifySetupChanged();

            // Nạp lại trang để mọi ô hiển thị (radio, checkbox, input...) đồng bộ với dữ liệu vừa restore
            location.reload();
        } catch (err) {
            console.error("Restore lỗi:", err);
            alert("Restore thất bại");
        }
    });
}

function setStatus(id, ready, label) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }

    el.textContent = ready ? `🟢 ${label}` : `🔴 ${label}`;
    el.className = "status-item " + (ready ? "status-ready" : "status-missing");
}

function initAhkPathSection() {
    const display = document.getElementById("ahkPathDisplay");
    const downloadBtn = document.getElementById("btnDownloadAhk");

    async function refreshDisplay() {
        const saved = getSetting("ahkExePath");
        if (saved) {
            if (display) display.textContent = "✅ " + saved;
            if (downloadBtn) downloadBtn.style.display = "none";
            return;
        }

        if (display) display.textContent = "⏳ Đang dò AutoHotkey...";

        if (!window.electronAPI?.findAhkPath) {
            if (display) display.textContent = "❌ Chưa thiết lập";
            if (downloadBtn) downloadBtn.style.display = "";
            return;
        }

        try {
            const found = await window.electronAPI.findAhkPath();
            if (found) {
                saveSetting("ahkExePath", found);
                if (display) display.textContent = "✅ " + found;
                if (downloadBtn) downloadBtn.style.display = "none";
            } else {
                if (display) display.textContent = '❌ Chưa cài AutoHotkey — bấm "Tải & Cài AutoHotkey" bên dưới';
                if (downloadBtn) downloadBtn.style.display = "";
            }
        } catch (err) {
            console.error("findAhkPath lỗi:", err);
            if (display) display.textContent = "❌ Chưa thiết lập";
            if (downloadBtn) downloadBtn.style.display = "";
        }
    }

    refreshDisplay();

    downloadBtn?.addEventListener("click", async () => {
        if (!window.electronAPI?.downloadAhk) {
            alert("Chức năng tải AutoHotkey chưa khả dụng");
            return;
        }

        if (!confirm('Tải và cài AutoHotkey v2 (bắt buộc để dùng tính năng "Lấy tọa độ")?')) {
            return;
        }

        const originalText = downloadBtn.textContent;
        downloadBtn.textContent = "⏳ Đang tải...";
        downloadBtn.disabled = true;

        try {
            const result = await window.electronAPI.downloadAhk();
            if (result.success) {
                alert('Đã tải xong, trình cài đặt AutoHotkey đang mở — cài xong thì bấm lại nút này (hoặc mở lại Setup) để app tự nhận diện.');
                await refreshDisplay();
            } else {
                alert("Lỗi: " + result.error);
            }
        } catch (err) {
            console.error("downloadAhk lỗi:", err);
            alert("Có lỗi xảy ra khi tải AutoHotkey");
        } finally {
            downloadBtn.textContent = originalText;
            downloadBtn.disabled = false;
        }
    });

    document.getElementById("btnSelectAhkPath")?.addEventListener("click", async () => {
        if (!window.electronAPI?.selectFile) {
            alert("Chức năng chọn file chưa khả dụng");
            return;
        }

        try {
            const filePath = await window.electronAPI.selectFile({
                filters: [{ name: "Ứng dụng", extensions: ["exe"] }]
            });
            if (filePath) {
                saveSetting("ahkExePath", filePath);
                if (display) display.textContent = "✅ " + filePath;
                if (downloadBtn) downloadBtn.style.display = "none";
            }
        } catch (err) {
            console.error("Chọn đường dẫn AutoHotkey lỗi:", err);
        }
    });
}

function updateCoordDawLabel() {
    const label = document.getElementById("coordDawLabel");
    if (!label) return;

    const daw = getSetting("selectedDAW");
    if (!daw) {
        label.textContent = "⚠ Chưa chọn DAW — chọn DAW trước khi lấy tọa độ";
        label.style.color = "#ff5252";
    } else {
        label.textContent = `📍 Đang thiết lập tọa độ cho: ${daw}`;
        label.style.color = "";
    }
}

// Đã bỏ khối "TRẠNG THÁI SETUP" (checklist chấm xanh) vì dư thừa — Setup vẫn hoạt động
// bình thường, chỉ không hiển thị từng mục nữa. Giữ hàm rỗng thay vì xóa hết ~11 chỗ gọi
// updateSetupStatus() rải rác trong file, để không phải sửa từng nơi một cách rủi ro.
function updateSetupStatus() {
    // no-op — xem ghi chú phía trên
}

function updateSetupProgress() {
    const total = 9; // đã bỏ mục soundshifter (giờ dùng MIDI, không cần capture chuột)
    const ready = countSetupReady();

    const percent = Math.round((ready / total) * 100);
    const text = document.getElementById("setupProgressText");
    const fill = document.getElementById("setupProgressFill");
    if (text) {
        text.textContent = `${ready}/${total} (${percent}%)`;
    }
    if (fill) {
        fill.style.width = percent + "%";
    }

    updateCoordDawLabel();
}

function isSetupComplete() {
    return isSetupFullyComplete();
}

function savePreset() {
    if (typeof appSettings === "undefined") {
        console.warn("appSettings chưa sẵn sàng");
        return;
    }

    appSettings.autoMenuPreset = {
        selectedDAW: getSetting("selectedDAW"),
        selectedAutoKey: getSetting("selectedAutoKey"),
        selectedAutoTune: getSetting("selectedAutoTune"),
        selectedBrowser: getSetting("selectedBrowser"),
        selectedSoundcard: getSetting("selectedSoundcard"),
        autokey1: getSetting("autokey1"),
        autokey2: getSetting("autokey2"),
        autotunekey: getSetting("autotunekey"),
        chromatic: getSetting("chromatic"),
        launchDAW: getSetting("launchDAW")
    };

    saveSetup?.();
    alert("Đã lưu Preset");
}

function loadPreset() {
    if (typeof appSettings === "undefined") {
        console.warn("appSettings chưa sẵn sàng");
        return;
    }

    const preset = appSettings.autoMenuPreset;

    if (!preset) {
        alert("Chưa có Preset");
        return;
    }

    Object.keys(preset).forEach((key) => {
        if (preset[key]) {
            appSettings[key] = preset[key];
        }
    });

    saveSetup?.();
    updateSetupStatus();
    updateSetupProgress();
    alert("Đã tải Preset");
}

/* ==========================================================
   KHỞI TẠO KHI DOM SẴN SÀNG
   (thay vì chạy toàn bộ ở top-level, phụ thuộc vào vị trí <script>)
   ========================================================== */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSetupPage);
} else {
    initSetupPage();
}

/* ==========================================================
   BỔ SUNG TÍNH NĂNG MỚI — KHÔNG SỬA GÌ PHẦN TRÊN
   ==========================================================
   1. Hoàn thiện MIDI Output (đã có cơ sở, bổ sung thêm)
   2. Thêm Tự động khởi động: lưu đường dẫn loopMIDI + Studio One
   ========================================================== */

/* --- Bổ sung hàm trợ giúp nếu chưa có --- */
if (typeof getSetting === "function" && !window._setupMidiPatched) {

  /* --- Hoàn thiện/Mở rộng: initMidiSection --- */
  const originalInitMidiSection = window.initMidiSection;
  window.initMidiSection = function() {
    if (originalInitMidiSection) originalInitMidiSection.apply(this, arguments);

    const portSelect = document.getElementById("midiPortSelect");
    const saveBtn = document.getElementById("saveMidiBtn");
    const dashMidiPill = document.getElementById("dashMidiPill");

    // Cập nhật Dashboard MIDI pill khi lưu
    if (saveBtn && !saveBtn._hasMidiPillPatch) {
      saveBtn._hasMidiPillPatch = true;
      const originalOnClick = saveBtn.onclick;
      saveBtn.addEventListener("click", function() {
        setTimeout(() => {
          if (dashMidiPill) {
            const savedPort = getSetting("midiOutputPort", "");
            if (savedPort) {
              dashMidiPill.textContent = "Đã cấu hình";
              dashMidiPill.className = "status-pill status-pill--ok";
              dashMidiPill.title = "Cổng: " + savedPort;
            }
          }
        }, 50);
      });
    }
  };

  /* --- THÊM MỚI: initAutoLaunchSection --- */
  window.initAutoLaunchSection = function() {
    const selectLoopMidiBtn = document.getElementById("selectLoopMidiPath");
    const selectDawBtn = document.getElementById("selectDawPath");
    const loopMidiPathEl = document.getElementById("loopMidiPath");
    const dawPathEl = document.getElementById("dawExePath");
    const autoLaunchToggle = document.getElementById("autoLaunchToggle");
    const savePathsBtn = document.getElementById("saveAutoLaunchBtn");

    // Khôi phục giá trị đã lưu
    const savedLoopMidi = getSetting("loopMidiPath", "");
    const savedDawPath = getSetting("dawExePath", "");
    const autoLaunchEnabled = getSetting("autoLaunchEnabled", true);

    if (loopMidiPathEl) loopMidiPathEl.value = savedLoopMidi;
    if (dawPathEl) dawPathEl.value = savedDawPath;
    if (autoLaunchToggle) autoLaunchToggle.checked = autoLaunchEnabled;

    // Nút chọn loopMIDI
    if (selectLoopMidiBtn && window.electronAPI?.selectFilePath) {
      selectLoopMidiBtn.addEventListener("click", async () => {
        const path = await window.electronAPI.selectFilePath({
          title: "Chọn loopMIDI.exe",
          filters: [{ name: "Chương trình", extensions: ["exe"] }],
          defaultPath: "C:\\Program Files\\loopMIDI\\loopMIDI.exe"
        });
        if (path && loopMidiPathEl) loopMidiPathEl.value = path;
      });
    }

    // Nút chọn Studio One
    if (selectDawBtn && window.electronAPI?.selectFilePath) {
      selectDawBtn.addEventListener("click", async () => {
        const path = await window.electronAPI.selectFilePath({
          title: "Chọn Studio One.exe",
          filters: [{ name: "Chương trình", extensions: ["exe"] }],
          defaultPath: "C:\\Program Files\\PreSonus\\Studio One 6\\Studio One.exe"
        });
        if (path && dawPathEl) dawPathEl.value = path;
      });
    }

    // Nút Lưu đường dẫn
    if (savePathsBtn && !savePathsBtn._hasAutoLaunchSave) {
      savePathsBtn._hasAutoLaunchSave = true;
      savePathsBtn.addEventListener("click", () => {
        const loopPath = loopMidiPathEl ? loopMidiPathEl.value.trim() : "";
        const dawPath = dawPathEl ? dawPathEl.value.trim() : "";
        const autoLaunch = autoLaunchToggle ? autoLaunchToggle.checked : true;

        saveSetting("loopMidiPath", loopPath);
        saveSetting("dawExePath", dawPath);
        saveSetting("autoLaunchEnabled", autoLaunch);

        // Cập nhật tiến độ
        if (typeof updateSetupStatus === "function") updateSetupStatus();
        if (typeof updateSetupProgress === "function") updateSetupProgress();
        if (typeof notifySetupChanged === "function") notifySetupChanged();

        // Phản hồi trực quan
        const originalText = savePathsBtn.textContent;
        savePathsBtn.textContent = "✅ Đã lưu";
        savePathsBtn.disabled = true;
        setTimeout(() => {
          savePathsBtn.textContent = originalText;
          savePathsBtn.disabled = false;
        }, 1500);
      });
    }
  };

  /* --- Gọi tự động khi Setup tải xong --- */
  const originalInitSetupPage = window.initSetupPage;
  window.initSetupPage = function() {
    if (originalInitSetupPage) originalInitSetupPage.apply(this, arguments);
    setTimeout(() => {
      if (typeof window.initAutoLaunchSection === "function") {
        window.initAutoLaunchSection();
      }
    }, 150);
  };

  window._setupMidiPatched = true;
}