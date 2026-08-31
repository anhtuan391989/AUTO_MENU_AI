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
    autoRestoreOnDawStart: false,

    // ===== TASK B / B2 — Control/MIDI/DAW Mapping =====
    // Mục VI (B2): Mouse Control ON/OFF toàn cục — CHỈ áp dụng cho DAW Mouse Mapping mới
    // (actionRegistry.js), TUYỆT ĐỐI không đụng tới clickAtPoint() sẵn có trong
    // vocalCommandRouter.js (Key/Tone Plugin fallback) — xem actionRegistry.js.
    // Mặc định true (Mục VI B2: "Default: ON") để không đổi hành vi hiện tại.
    mouseControlEnabled: true,
    // Mục V/X (B2) — mapping MIDI OUTPUT cho Logical Action, LƯU RIÊNG THEO TỪNG DAW
    // (Mục X: "Không dùng một mapping chung cho tất cả DAW"). CHƯA có giá trị mặc định nào
    // (không tự bịa CC/note — Mục III/V). Cấu trúc:
    // { [dawName]: { DAW_PLAY: {kind:"cc"|"note", number, channel} | null, ... } }
    dawMidiOutMappings: {}
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

// TASK B6 (Beat/Master) — accessor SEMANTIC riêng cho từng control, KHÔNG dùng tên chung
// "volume" cho cả hai. Đọc đúng appSettings.autoMenuData.knobs (KHÔNG tạo storage mới, giữ
// nguyên 100% format cũ `{id, value}` — backward-compatible) nhưng lộ ra tên hàm RÕ NGHĨA để
// có thể chứng minh khi audit: Beat state và Master state là 2 đường đọc TÁCH BIỆT, không có
// hàm chung nào gộp cả hai. Đúng định nghĩa bắt buộc: Beat = INPUT MUSIC LEVEL (musicKnob),
// Master = FINAL DAW OUTPUT LEVEL (masterKnob) — 2 khái niệm khác nhau, không phải cùng 1
// "volume". Chỉ đọc (getter) — việc GHI vẫn qua đúng 1 đường saveData() sẵn có (renderer.js),
// tránh tạo 2 cơ chế ghi cạnh tranh cho cùng 1 dữ liệu.
function getBeatInputVolume() {
    const knob = appSettings.autoMenuData?.knobs?.find((k) => k.id === "musicKnob");
    return knob ? knob.value : null;
}

function getMasterOutputVolume() {
    const knob = appSettings.autoMenuData?.knobs?.find((k) => k.id === "masterKnob");
    return knob ? knob.value : null;
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

// TASK B26.2 — trước đây getSetupReadinessChecklist() chỉ kiểm tra CÓ TÊN soundcard đã lưu hay
// không, KHÔNG biết thiết bị đó còn tồn tại thật trên máy hay không (đã "rút dây"/đổi driver).
// Kết quả: progress bar/READY có thể báo "đã xong" dù badge Soundcard đang cảnh báo "không khả
// dụng" — đúng kiểu "cấu hình cũ nhưng device không còn tồn tại" mà B26.2 yêu cầu rà soát.
//
// Fix TỐI THIỂU, KHÔNG đổi kiến trúc: chỉ 1 biến hint trong module này, do setup.js cập nhật MỖI
// khi nó thực sự enumerate lại thiết bị (populateSoundcardOptions() -> foundInRealList — dữ liệu
// đã có sẵn, không tự thêm getUserMedia/enumerateDevices() nào mới ở đây). Mặc định là null
// ("chưa biết gì") để giữ NGUYÊN hành vi cũ (trust tên đã lưu) cho tới khi thực sự đã enumerate —
// không đổi behavior của bất kỳ nơi nào khác đang gọi các hàm này trước khi Setup mở lần đầu.
let __soundcardAvailabilityHint = null; // null = chưa biết | true/false = đã enumerate xong

function setSoundcardAvailabilityHint(isAvailable) {
    __soundcardAvailabilityHint = isAvailable === true || isAvailable === false ? isAvailable : null;
}

// TASK B30.2 — CÙNG BẢN CHẤT với __soundcardAvailabilityHint ở trên nhưng cho đường dẫn trình
// duyệt (selectedBrowserPath): trước đây checklist chỉ kiểm tra 2 chuỗi khác rỗng, không biết file
// .exe đã lưu có còn tồn tại trên đĩa hay không (đã bị xoá/di chuyển sau khi lưu). setup.js chịu
// trách nhiệm gọi setBrowserPathAvailabilityHint() SAU khi thực sự kiểm tra bằng
// window.electronAPI.checkPathExists() (IPC filesystem có sẵn, xem app/main.js) — module này không
// tự gọi filesystem gì cả. Mặc định null giữ nguyên hành vi cũ.
let __browserPathAvailabilityHint = null; // null = chưa biết | true/false = đã kiểm tra xong

function setBrowserPathAvailabilityHint(isAvailable) {
    __browserPathAvailabilityHint = isAvailable === true || isAvailable === false ? isAvailable : null;
}

// TASK B30.1 — MIDI dashboard pill (2 vị trí trong setup.js) trước đây chỉ kiểm tra
// midiOutputPort có khác rỗng hay không, không biết cổng đã lưu có còn trong danh sách MIDI thật
// (`ports` từ listMidiOutputs()) hay không — B29 phát hiện đây cũng là 1 dạng READY giả.
// setup.js gọi setMidiPortAvailabilityHint() ngay sau khi so khớp `saved` với `ports` thật (dữ
// liệu đã có sẵn từ populatePorts(), KHÔNG thêm probing/I/O MIDI mới). getMidiDashboardPillState()
// là NGUỒN DUY NHẤT tính ra trạng thái pill — cả 2 vị trí trong setup.js đều gọi hàm này, tránh 2
// nguồn sự thật khác nhau như yêu cầu B30.1.
let __midiPortAvailabilityHint = null; // null = chưa biết | true/false = đã so khớp xong

function setMidiPortAvailabilityHint(isAvailable) {
    __midiPortAvailabilityHint = isAvailable === true || isAvailable === false ? isAvailable : null;
}

function getMidiDashboardPillState() {
    const portName = getSetting("midiOutputPort", "");
    if (!portName) {
        return { text: "Chưa cấu hình", className: "status-pill status-pill--dim", title: "" };
    }
    if (__midiPortAvailabilityHint === false) {
        return {
            text: "⚠ Cổng MIDI không khả dụng",
            className: "status-pill status-pill--error", // class đã có sẵn trong ui/css/setup.css, không thêm CSS mới
            title: "Cổng đã lưu (" + portName + ") hiện không có trong danh sách MIDI thật — vào Setup > MIDI để chọn lại."
        };
    }
    return { text: "Đã cấu hình", className: "status-pill status-pill--ok", title: "Cổng MIDI: " + portName };
}

/* Danh sách 10 mục bắt buộc để coi Setup là "hoàn tất" — dùng chung cho setup.js và renderer.js.
   Riêng "Browser" phải có ĐỦ 2 thứ: đã chọn trình duyệt VÀ đã có đường dẫn (tự dò hoặc chọn tay),
   thiếu 1 trong 2 vẫn coi là chưa xong. Riêng 5 mục tọa độ được kiểm tra THEO HỒ SƠ CỦA DAW
   ĐANG CHỌN (getCoordinate), không phải giá trị chung chung nữa. Riêng "Soundcard" (B26.2) và
   "Browser" (B30.2): nếu đã biết chắc thiết bị/file đã lưu KHÔNG còn tồn tại thật thì KHÔNG coi là
   ready, dù vẫn còn tên/đường dẫn được lưu — tránh báo READY giả. */
function getSetupReadinessChecklist() {
    const soundcardConfigured = !!getSetting("selectedSoundcard");
    const soundcardReady = soundcardConfigured && __soundcardAvailabilityHint !== false;
    const browserConfigured = !!getSetting("selectedBrowser") && !!getSetting("selectedBrowserPath");
    const browserReady = browserConfigured && __browserPathAvailabilityHint !== false;
    return [
        { key: "selectedDAW", ready: !!getSetting("selectedDAW") },
        { key: "selectedAutoKey", ready: !!getSetting("selectedAutoKey") },
        { key: "selectedAutoTune", ready: !!getSetting("selectedAutoTune") },
        { key: "selectedSoundcard", ready: soundcardReady },
        { key: "selectedBrowser", ready: browserReady },
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
