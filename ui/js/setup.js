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
        return;
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

        if (selectedValue) {
            const match = [...selectEl.options].find(o => o.value === selectedValue);
            if (match) {
                selectEl.value = selectedValue;
            } else {
                // Thiết bị đã lưu không còn trong danh sách hiện tại (đổi máy/rút dây...):
                // vẫn giữ lại lựa chọn cũ để không mất dữ liệu, thêm vào cuối danh sách.
                const fallbackOpt = document.createElement("option");
                fallbackOpt.value = selectedValue;
                fallbackOpt.textContent = `(Đã lưu trước đó) ${selectedValue}`;
                selectEl.appendChild(fallbackOpt);
                selectEl.value = selectedValue;
            }
        }
    } catch (err) {
        console.error("Không thể liệt kê thiết bị audio:", err);
    }
}

function updateSoundcardDisplays() {
    const saved = getSetting("selectedSoundcard");
    const modalDisplay = document.getElementById("statusSoundcardModal");
    if (modalDisplay) {
        modalDisplay.textContent = saved || "Chưa chọn soundcard nào";
    }
}

function initMidiSection() {
    const select = document.getElementById("midiPortSelect");
    if (!select) return;

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
                fallbackOpt.textContent = `(Đã lưu trước đó) ${saved}`;
                select.appendChild(fallbackOpt);
                select.value = saved;
            }
        }

        if (ports.length === 0) {
            console.warn("Không tìm thấy cổng MIDI nào — kiểm tra đã tạo cổng ảo (vd loopMIDI) chưa.");
        }
    }

    populatePorts();

    document.getElementById("btnRefreshMidiPorts")?.addEventListener("click", populatePorts);

    document.getElementById("saveMidiBtn")?.addEventListener("click", () => {
        if (!select.value) {
            alert("Vui lòng chọn 1 cổng MIDI trước.");
            return;
        }

        saveSetting("midiOutputPort", select.value);
        alert("Đã lưu cổng MIDI: " + select.value);
        document.getElementById("midiModal")?.classList.remove("show");
    });

    document.getElementById("btnTestMidiNote")?.addEventListener("click", async () => {
        if (!select.value) {
            alert("Chọn cổng MIDI trước khi test.");
            return;
        }
        saveSetting("midiOutputPort", select.value); // lưu tạm để hàm gửi MIDI dùng đúng cổng đang chọn lúc test

        const note = parseInt(document.getElementById("midiTestNote")?.value, 10) || 0;
        const ok = await sendMidiNotePulse(note, 100, 0, 150);
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
        if (!ok) {
            alert("Không gửi được — kiểm tra lại cổng MIDI đã chọn.");
        }
    });
}

function initSoundcardSection() {
    const select = document.getElementById("soundcardSelect");
    if (!select) return;

    const savedId = getSetting("selectedSoundcardId");
    populateSoundcardOptions(select, savedId).then(updateSoundcardDisplays);

    // Làm mới danh sách mỗi lần mở modal (thiết bị có thể đã thay đổi)
    document.getElementById("openSoundcardModal")?.addEventListener("click", () => {
        populateSoundcardOptions(select, getSetting("selectedSoundcardId")).then(updateSoundcardDisplays);
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

        updateSoundcardDisplays();
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
