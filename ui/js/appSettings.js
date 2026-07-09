const APP_SETTINGS_STORAGE_KEY = "appSettings";

const DEFAULT_APP_SETTINGS = {
    selectedDAW: "",
    selectedAutoKey: "",
    selectedAutoTune: "",
    selectedSoundcard: "",
    selectedSoundcardId: "",
    selectedBrowser: "",
    selectedBrowserPath: "",
    ahkExePath: "",
    midiOutputPort: "",
    youtubePwaId: "",
    selectedBeMethod: "",
    selectedFixMethod: "",
    autokey1: "",
    autokey2: "",
    soundshifter: "",
    autotunekey: "",
    chromatic: "",
    coordinateProfiles: {},
    autoMenuPreset: null,
    autoMenuData: null,
    songDatabase: null,
    selectedDAWPath: "",
    launchDAW: false,
    shortcuts: {},
    projectPath: "",
    projectOpenEnabled: false,
    projectCopyEnabled: false,
    projectOpenYoutube: false,
    autoRestoreOnDawStart: false
};

const LEGACY_STORAGE_KEYS = [
    "selectedDAW",
    "selectedAutoKey",
    "selectedAutoTune",
    "selectedSoundcard",
    "selectedBrowser",
    "youtubePwaId",
    "selectedBeMethod",
    "selectedFixMethod",
    "autokey1",
    "autokey2",
    "soundshifter",
    "autotunekey",
    "chromatic",
    "autoMenuPreset",
    "autoMenuData",
    "songDatabase"
];

const LEGACY_JSON_KEYS = new Set([
    "autoMenuPreset",
    "autoMenuData",
    "songDatabase"
]);

let appSettings = { ...DEFAULT_APP_SETTINGS };

function parseLegacyValue(key, raw) {
    if (!LEGACY_JSON_KEYS.has(key)) {
        return raw;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function migrateLegacyStorage() {
    let migrated = false;

    LEGACY_STORAGE_KEYS.forEach((key) => {
        const raw = localStorage.getItem(key);
        if (raw === null) {
            return;
        }

        appSettings[key] = parseLegacyValue(key, raw);
        localStorage.removeItem(key);
        migrated = true;
    });

    if (migrated) {
        saveSetup();
    }
}

function loadSetup() {
    // 1) Ưu tiên đọc từ file dùng chung (qua main process) — chia sẻ được giữa
    //    main window và setup window, không bị cô lập như localStorage.
    try {
        const fromFile = window.electronAPI?.loadSettingsSync?.();
        if (fromFile) {
            appSettings = { ...DEFAULT_APP_SETTINGS, ...fromFile };
            return appSettings;
        }
    } catch (err) {
        console.error("loadSetup (file dùng chung) lỗi:", err);
    }

    // 2) Dự phòng: nếu electronAPI chưa sẵn sàng (vd mở file .html trực tiếp bằng
    //    trình duyệt để test nhanh, không qua Electron) thì tạm dùng localStorage.
    try {
        const raw = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
        appSettings = raw
            ? { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) }
            : { ...DEFAULT_APP_SETTINGS };
    } catch (err) {
        console.error("loadSetup (localStorage dự phòng) lỗi:", err);
        appSettings = { ...DEFAULT_APP_SETTINGS };
    }

    migrateLegacyStorage();
    return appSettings;
}

function saveSetup() {
    try {
        if (window.electronAPI?.saveSettingsSync) {
            window.electronAPI.saveSettingsSync(appSettings);
            return;
        }
    } catch (err) {
        console.error("saveSetup (file dùng chung) lỗi:", err);
    }

    // Dự phòng localStorage (chỉ dùng khi không chạy trong Electron)
    try {
        localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
    } catch (err) {
        console.error("saveSetup (localStorage dự phòng) lỗi:", err);
    }
}

function getSetting(key, fallback = "") {
    const value = appSettings[key];
    return value != null && value !== "" ? value : fallback;
}

function setSetting(key, value) {
    appSettings[key] = value;
    saveSetup();
}

/* ==========================================================
   MIDI (Web MIDI API — có sẵn trong Chromium/Electron, không cần cài thư viện Node nào).
   Dùng để gửi Key/lệnh sang DAW qua 1 cổng MIDI ảo (vd loopMIDI), thay cho click tọa độ
   ở những chỗ plugin/DAW hỗ trợ MIDI Learn — nhanh và chuẩn hơn hẳn khi hát live.
   ========================================================== */
let midiAccessPromise = null;

function getMidiAccess() {
    if (!navigator.requestMIDIAccess) {
        return Promise.reject(new Error("Trình duyệt/Electron này không hỗ trợ Web MIDI API."));
    }
    if (!midiAccessPromise) {
        midiAccessPromise = navigator.requestMIDIAccess({ sysex: false });
    }
    return midiAccessPromise;
}

// Liệt kê tất cả cổng MIDI output đang có trên máy (vd cổng ảo tạo bằng loopMIDI)
async function listMidiOutputs() {
    try {
        const access = await getMidiAccess();
        return [...access.outputs.values()].map((o) => ({ id: o.id, name: o.name }));
    } catch (err) {
        console.error("Không lấy được danh sách cổng MIDI:", err);
        return [];
    }
}

// Lấy đúng cổng MIDI đã lưu trong Setup (theo tên cổng)
async function getSelectedMidiOutput() {
    const portName = getSetting("midiOutputPort");
    if (!portName) return null;

    try {
        const access = await getMidiAccess();
        return [...access.outputs.values()].find((o) => o.name === portName) || null;
    } catch (err) {
        console.error("Không mở được cổng MIDI:", err);
        return null;
    }
}

async function sendMidiNoteOn(noteNumber, velocity = 100, channel = 0) {
    const output = await getSelectedMidiOutput();
    if (!output) return false;
    output.send([0x90 | (channel & 0x0f), noteNumber & 0x7f, velocity & 0x7f]);
    return true;
}

async function sendMidiNoteOff(noteNumber, channel = 0) {
    const output = await getSelectedMidiOutput();
    if (!output) return false;
    output.send([0x80 | (channel & 0x0f), noteNumber & 0x7f, 0]);
    return true;
}

// Gửi Note On rồi tự Note Off sau 1 khoảng ngắn — kiểu gửi phù hợp cho "MIDI Learn" theo nốt
async function sendMidiNotePulse(noteNumber, velocity = 100, channel = 0, durationMs = 120) {
    const sent = await sendMidiNoteOn(noteNumber, velocity, channel);
    if (!sent) return false;
    setTimeout(() => sendMidiNoteOff(noteNumber, channel), durationMs);
    return true;
}

async function sendMidiCC(ccNumber, value, channel = 0) {
    const output = await getSelectedMidiOutput();
    if (!output) return false;
    output.send([0xb0 | (channel & 0x0f), ccNumber & 0x7f, value & 0x7f]);
    return true;
}

/* ==========================================================
   HỒ SƠ TỌA ĐỘ RIÊNG THEO TỪNG DAW
   (Cubase/Studio One/... có layout giao diện khác nhau -> mỗi DAW cần 1 bộ tọa độ riêng,
   tự động chuyển đổi theo DAW đang chọn ở "selectedDAW", không cần thao tác thêm) 
   ========================================================== */
const COORDINATE_KEYS = ["autokey1", "autokey2", "autotunekey", "chromatic"];

function getCoordinateProfile(dawName) {
    const profiles = getSetting("coordinateProfiles") || {};
    return profiles[dawName] || {};
}

// Lấy 1 tọa độ đã lưu CHO DAW ĐANG CHỌN hiện tại (selectedDAW)
function getCoordinate(key) {
    const daw = getSetting("selectedDAW");
    if (!daw) return "";
    const profile = getCoordinateProfile(daw);
    return profile[key] || "";
}

// Lưu 1 tọa độ vào hồ sơ của DAW ĐANG CHỌN hiện tại. Trả về false nếu chưa chọn DAW nào.
function setCoordinate(key, value) {
    const daw = getSetting("selectedDAW");
    if (!daw) return false;

    const profiles = getSetting("coordinateProfiles") || {};
    if (!profiles[daw]) profiles[daw] = {};
    profiles[daw][key] = value;

    setSetting("coordinateProfiles", profiles);
    return true;
}

/* Danh sách 10 mục bắt buộc để coi Setup là "hoàn tất" — dùng chung cho setup.js và renderer.js.
   Riêng "Browser" phải có ĐỦ 2 thứ: đã chọn trình duyệt VÀ đã có đường dẫn (tự dò hoặc chọn tay),
   thiếu 1 trong 2 vẫn coi là chưa xong. Riêng 5 mục tọa độ được kiểm tra THEO HỒ SƠ CỦA DAW
   ĐANG CHỌN (getCoordinate), không phải giá trị chung chung nữa. */
function getSetupReadinessChecklist() {
    return [
        { key: "selectedDAW", ready: !!getSetting("selectedDAW") },
        { key: "selectedAutoKey", ready: !!getSetting("selectedAutoKey") },
        { key: "selectedAutoTune", ready: !!getSetting("selectedAutoTune") },
        { key: "selectedSoundcard", ready: !!getSetting("selectedSoundcard") },
        { key: "selectedBrowser", ready: !!getSetting("selectedBrowser") && !!getSetting("selectedBrowserPath") },
        { key: "autokey1", ready: !!getCoordinate("autokey1") },
        { key: "autokey2", ready: !!getCoordinate("autokey2") },
        { key: "autotunekey", ready: !!getCoordinate("autotunekey") },
        { key: "chromatic", ready: !!getCoordinate("chromatic") }
    ];
}

function countSetupReady() {
    return getSetupReadinessChecklist().filter(item => item.ready).length;
}

function isSetupFullyComplete() {
    return getSetupReadinessChecklist().every(item => item.ready);
}

/* Dùng cho nút "Mở kèm ngay" (thủ công) trong modal Project — chỉ mở Project/Youtube, không đụng tới DAW */
async function openProjectYoutubeBundle() {
    if (!window.electronAPI?.openProjectBundle) {
        return { errors: ["electronAPI.openProjectBundle không khả dụng"] };
    }

    const openProject = getSetting("projectOpenEnabled") === true || getSetting("projectOpenEnabled") === "true";
    const makeCopy = getSetting("projectCopyEnabled") === true || getSetting("projectCopyEnabled") === "true";
    const openYoutube = getSetting("projectOpenYoutube") === true || getSetting("projectOpenYoutube") === "true";

    if (!openProject && !openYoutube) {
        return { skipped: true };
    }

    return window.electronAPI.openProjectBundle({
        projectPath: getSetting("projectPath"),
        openProject,
        makeCopy,
        openYoutube,
        browserPath: getSetting("selectedBrowserPath"),
        youtubeUrl: "https://www.youtube.com"
    });
}

/* Dùng khi mở app (menu chính) — "Mở DAW cùng Menu" là công tắc chính:
   bật lên thì tự mở DAW + (Project nếu tick) + (Youtube bằng đúng trình duyệt đã chọn, nếu tick) */
async function runAutoStartupSequence() {
    if (!window.electronAPI?.openProjectBundle) {
        return { errors: ["electronAPI.openProjectBundle không khả dụng"] };
    }

    const launchDAW = getSetting("launchDAW") === true || getSetting("launchDAW") === "true";
    if (!launchDAW) {
        return { skipped: true };
    }

    const openProject = getSetting("projectOpenEnabled") === true || getSetting("projectOpenEnabled") === "true";
    const makeCopy = getSetting("projectCopyEnabled") === true || getSetting("projectCopyEnabled") === "true";
    const openYoutube = getSetting("projectOpenYoutube") === true || getSetting("projectOpenYoutube") === "true";

    return window.electronAPI.openProjectBundle({
        launchDAW: true,
        dawPath: getSetting("selectedDAWPath"),
        projectPath: getSetting("projectPath"),
        openProject,
        makeCopy,
        openYoutube,
        browserPath: getSetting("selectedBrowserPath"),
        youtubeUrl: "https://www.youtube.com"
    });
}

/* Dùng chung giữa setup.js (ghi lại tổ hợp phím) và renderer.js (so khớp khi nhấn phím) */
function formatKeyCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    const key = e.key;
    if (!["Control", "Alt", "Shift", "Meta"].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
    }

    return parts.join("+");
}
