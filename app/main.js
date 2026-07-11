const { app, BrowserWindow, ipcMain, dialog, session, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const https = require("https");
const os = require("os");

let mainWin = null;
let setupWin = null;

// ================================
// LƯU TRỮ DÙNG CHUNG (thay cho localStorage vốn bị cô lập theo từng cửa sổ)
// ================================
const SETTINGS_FILE = path.join(app.getPath("userData"), "app-settings.json");

function readSettingsFile() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            return null;
        }
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return JSON.parse(raw);
    } catch (err) {
        console.error("readSettingsFile lỗi:", err);
        return null;
    }
}

function writeSettingsFile(data) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
        return true;
    } catch (err) {
        console.error("writeSettingsFile lỗi:", err);
        return false;
    }
}

function createMainWindow() {
    mainWin = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWin.loadFile(path.join(__dirname, "..", "ui", "index.html"));
}

function createSetupWindow() {

    if (setupWin && !setupWin.isDestroyed()) {
        return;
    }

    setupWin = new BrowserWindow({
        width: 900,
        height: 700,
        show: false,
        parent: mainWin,
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    setupWin.loadFile(path.join(__dirname, "..", "ui", "setup.html"));

    setupWin.on("closed", () => {
        setupWin = null;
    });
}

const AIBootstrap = require("../core/ai/AIBootstrap");

app.whenReady().then(async () => {
    // Mặc định Electron sẽ TỪ CHỐI các quyền nhạy cảm (media, mic, midi...) nếu không khai báo rõ.
    // App này cần quyền mic để liệt kê tên soundcard, và quyền midi để gửi MIDI sang DAW.
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === "media" || permission === "midi" || permission === "midiSysex") {
            callback(true);
            return;
        }
        callback(false);
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        return permission === "media" || permission === "midi" || permission === "midiSysex";
    });

    createMainWindow();
    createSetupWindow();
    await AIBootstrap.initialize();
});

ipcMain.on("open-setup", () => {

    if (!setupWin || setupWin.isDestroyed()) {
        createSetupWindow();
    }

    setupWin.show();
    setupWin.focus();

});

ipcMain.on("close-setup", () => {

    if (!setupWin || setupWin.isDestroyed()) {
        return;
    }

    setupWin.hide();

});

ipcMain.on("setup-changed", () => {
    mainWin?.webContents.send("setup-changed");
});

ipcMain.handle("ping", () => "pong");

// ================================
// LẤY TỌA ĐỘ: dùng AutoHotkey v2 (di chuột thật tới vị trí + nhấn F8)
// Không che màn hình, hoạt động đúng trên cả nhiều màn hình vì MouseGetPos
// của AHK tự tính theo toàn bộ desktop ảo (ghép tất cả các màn hình).
// ================================
const CAPTURE_POINT_COUNTS = {
    autokey1: 2,
    autokey2: 2,
    autotunekey: 1,
    chromatic: 2
};

const AHK_PATH_CANDIDATES = [
    "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe",
    "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey32.exe",
    "C:\\Program Files (x86)\\AutoHotkey\\v2\\AutoHotkey64.exe",
    "C:\\Program Files\\AutoHotkey\\AutoHotkey64.exe",
    "C:\\Program Files\\AutoHotkey\\AutoHotkey.exe",
    "C:\\Program Files\\AutoHotkeyU64\\AutoHotkeyU64.exe"
];

function findAhkExecutable() {
    for (const candidate of AHK_PATH_CANDIDATES) {
        try {
            if (candidate && fs.existsSync(candidate)) {
                return candidate;
            }
        } catch {
            // thử candidate tiếp theo
        }
    }
    return null;
}

ipcMain.handle("find-ahk-path", () => findAhkExecutable());

function runAhkCapture(totalPoints, ahkExePath) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, "..", "ahk", "AHK.ahk");
        const outputFile = path.join(getDownloadTempDir(), `capture_${Date.now()}.txt`);
        const cancelFile = outputFile + ".cancelled";

        try { fs.unlinkSync(outputFile); } catch {}
        try { fs.unlinkSync(cancelFile); } catch {}

        execFile(ahkExePath, [scriptPath, String(totalPoints), outputFile], (err) => {
            if (fs.existsSync(cancelFile)) {
                try { fs.unlinkSync(cancelFile); } catch {}
                reject(new Error("Bạn đã huỷ lấy tọa độ (nhấn ESC)."));
                return;
            }

            if (err) {
                reject(new Error("Không chạy được AutoHotkey: " + err.message));
                return;
            }

            if (!fs.existsSync(outputFile)) {
                reject(new Error("AutoHotkey không trả về tọa độ nào (script có thể đã bị đóng giữa chừng)."));
                return;
            }

            try {
                const raw = fs.readFileSync(outputFile, "utf-8").trim();
                const lines = raw.split(/\r?\n/).filter(Boolean);
                const points = lines.map((line) => {
                    const [x, y] = line.split(",").map(Number);
                    return { x, y };
                });

                try { fs.unlinkSync(outputFile); } catch {}

                if (points.length < totalPoints) {
                    reject(new Error("Số điểm nhận được không đủ (" + points.length + "/" + totalPoints + ")."));
                    return;
                }

                resolve(points);
            } catch (parseErr) {
                reject(new Error("Không đọc được kết quả tọa độ: " + parseErr.message));
            }
        });
    });
}

ipcMain.handle("setup-capture", async (event, { name, points }) => {
    const totalPoints = points || CAPTURE_POINT_COUNTS[name] || 1;

    const saved = readSettingsFile();
    let ahkExePath = saved?.ahkExePath;
    if (!ahkExePath || !fs.existsSync(ahkExePath)) {
        ahkExePath = findAhkExecutable();
    }

    if (!ahkExePath) {
        throw new Error('Không tìm thấy AutoHotkey v2 trên máy. Vào Setup > "Chọn đường dẫn AutoHotkey" để trỏ tay tới file AutoHotkey64.exe.');
    }

    const captured = await runAhkCapture(totalPoints, ahkExePath);
    return totalPoints === 1 ? captured[0] : captured;
});

// ================================
// CLICK THẬT LÚC RUNTIME (dùng tọa độ đã capture ở Setup)
// Tách riêng với runAhkCapture: cái đó chỉ dùng lúc THIẾT LẬP để LẤY tọa độ,
// còn hàm này dùng lúc VẬN HÀNH THẬT để CLICK vào tọa độ đã lưu, mỗi khi
// Command Router không tìm được đường MIDI cho hành động đó.
// ================================
function runAhkClick(x, y, ahkExePath) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, "..", "ahk", "click.ahk");
        execFile(ahkExePath, [scriptPath, String(x), String(y)], (err) => {
            if (err) {
                reject(new Error("Không click được qua AutoHotkey: " + err.message));
                return;
            }
            resolve();
        });
    });
}

ipcMain.handle("click-at-point", async (event, { x, y }) => {
    if (typeof x !== "number" || typeof y !== "number") {
        return { ok: false, detail: "Thiếu toạ độ x/y hợp lệ" };
    }

    const saved = readSettingsFile();
    let ahkExePath = saved?.ahkExePath;
    if (!ahkExePath || !fs.existsSync(ahkExePath)) {
        ahkExePath = findAhkExecutable();
    }

    if (!ahkExePath) {
        return { ok: false, detail: 'Không tìm thấy AutoHotkey v2. Vào Setup > "Chọn đường dẫn AutoHotkey".' };
    }

    try {
        await runAhkClick(x, y, ahkExePath);
        return { ok: true };
    } catch (err) {
        return { ok: false, detail: err.message };
    }
});

// ================================
// TẢI FILE TỪ GOOGLE DRIVE + TỰ MỞ TRÌNH CÀI ĐẶT
// ================================
function mergeCookies(oldCookies, setCookieHeaders) {
    if (!setCookieHeaders) return oldCookies;
    const newPairs = setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
    return oldCookies ? `${oldCookies}; ${newPairs}` : newPairs;
}

function extractDriveFileId(url) {
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
}

// Tải 1 file công khai từ Google Drive, tự xử lý trang "xác nhận virus scan" của file lớn.
function downloadFromUrl(url, destPath, cookies = "") {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: cookies ? { Cookie: cookies } : {} }, (res) => {
            // Chuyển hướng
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const newCookies = mergeCookies(cookies, res.headers["set-cookie"]);
                res.resume();
                downloadFromUrl(res.headers.location, destPath, newCookies).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error("Tải file thất bại, mã lỗi HTTP " + res.statusCode));
                return;
            }

            const contentType = res.headers["content-type"] || "";

            // Google Drive trả về trang HTML xác nhận thay vì file thật (thường với file lớn)
            if (contentType.includes("text/html")) {
                let html = "";
                res.on("data", (chunk) => (html += chunk));
                res.on("end", async () => {
                    const confirmMatch = html.match(/confirm=([0-9A-Za-z_]+)/);
                    const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/);

                    if (confirmMatch && idMatch) {
                        const confirmUrl = `https://drive.google.com/uc?export=download&confirm=${confirmMatch[1]}&id=${idMatch[1]}`;
                        try {
                            await downloadFromUrl(confirmUrl, destPath, mergeCookies(cookies, res.headers["set-cookie"]));
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    } else {
                        reject(new Error("Không lấy được file thật từ Google Drive (link sai, hết quyền truy cập công khai, hoặc Google đổi định dạng trang xác nhận)."));
                    }
                });
                return;
            }

            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);
            fileStream.on("finish", () => fileStream.close());
            fileStream.on("close", () => resolve());
            fileStream.on("error", reject);
        });

        req.on("error", reject);
    });
}

function getDownloadTempDir() {
    const dir = path.join(os.tmpdir(), "automenu-downloads");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sau khi tải xong, Windows Defender/Antivirus có thể khoá file vài giây để quét virus
// trước khi cho phép mở -> thử mở lại vài lần có độ trễ thay vì báo lỗi ngay lần đầu.
async function openPathWithRetry(filePath, retries = 4, delayMs = 1200) {
    let lastErr = "";
    for (let i = 0; i < retries; i++) {
        const err = await shell.openPath(filePath);
        if (!err) {
            return null; // mở thành công
        }
        lastErr = err;
        if (i < retries - 1) {
            await delay(delayMs);
        }
    }
    return lastErr;
}

// ================================
// HỖ TRỢ TẢI TỪ MEGA.NZ (file mã hoá phía client, cần thư viện megajs)
// ================================
function isMegaUrl(url) {
    return /mega\.nz\//i.test(url);
}

function isGoogleDriveUrl(url) {
    return /drive\.google\.com\//i.test(url);
}

function getMegaFileClass() {
    try {
        return require("megajs").File;
    } catch (err) {
        return null;
    }
}

function downloadFromMega(url, destPath) {
    return new Promise((resolve, reject) => {
        const File = getMegaFileClass();
        if (!File) {
            reject(new Error('Thiếu thư viện "megajs". Mở Terminal tại thư mục dự án, chạy: npm install megajs, rồi khởi động lại app.'));
            return;
        }

        try {
            const file = File.fromURL(url);
            file.loadAttributes((err) => {
                if (err) {
                    reject(new Error("Không tải được thông tin file từ Mega (link sai hoặc file đã bị xoá): " + err.message));
                    return;
                }

                const readStream = file.download();
                const writeStream = fs.createWriteStream(destPath);

                readStream.pipe(writeStream);
                writeStream.on("close", () => resolve());
                writeStream.on("error", reject);
                readStream.on("error", reject);
            });
        } catch (err) {
            reject(err);
        }
    });
}

// Tự nhận diện Mega / Google Drive / link tải trực tiếp thường, rồi tải bằng đúng cách tương ứng
async function downloadAnyUrl(url, destPath) {
    if (isMegaUrl(url)) {
        return downloadFromMega(url, destPath);
    }

    if (isGoogleDriveUrl(url)) {
        const fileId = extractDriveFileId(url);
        if (!fileId) {
            throw new Error("Không nhận diện được link Google Drive (cần là link file, không phải link folder).");
        }
        const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        return downloadFromUrl(driveUrl, destPath);
    }

    // Link tải trực tiếp thông thường (không phải Mega/Drive)
    return downloadFromUrl(url, destPath);
}

// Tải 1 file (Mega hoặc Google Drive) rồi tự mở file cài đặt lên
ipcMain.handle("download-and-install", async (event, { url, label }) => {
    try {
        const destPath = path.join(getDownloadTempDir(), `${label || "installer"}.exe`);

        await downloadAnyUrl(url, destPath);

        const openErr = await openPathWithRetry(destPath);
        if (openErr) {
            return { success: false, error: "Tải xong nhưng không mở được trình cài đặt (có thể do Antivirus đang khoá file): " + openErr, path: destPath };
        }

        return { success: true, path: destPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Tải trình cài đặt Brave chính chủ rồi tự mở lên
// Mở 1 URL bất kỳ bằng trình duyệt mặc định (dùng cho các trang tải không có link trực tiếp ổn định)
ipcMain.handle("open-external-url", async (event, url) => {
    try {
        await shell.openExternal(url);
        return true;
    } catch (err) {
        console.error("open-external-url lỗi:", err);
        return false;
    }
});

ipcMain.handle("download-brave", async () => {
    try {
        const destPath = path.join(getDownloadTempDir(), "BraveBrowserSetup.exe");

        // Link tải trực tiếp chính thức của Brave cho Windows
        await downloadFromUrl("https://referrals.brave.com/latest/BraveBrowserSetup.exe", destPath);

        const openErr = await openPathWithRetry(destPath);
        if (openErr) {
            return { success: false, error: "Tải xong nhưng không mở được trình cài đặt (có thể do Antivirus đang khoá file): " + openErr, path: destPath };
        }

        return { success: true, path: destPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Tải trình cài đặt AutoHotkey v2 chính chủ rồi tự mở lên (dùng cho tính năng Lấy tọa độ)
ipcMain.handle("download-ahk", async () => {
    try {
        const destPath = path.join(getDownloadTempDir(), "AutoHotkeyV2Setup.exe");

        // Link tải trực tiếp chính thức từ autohotkey.com (luôn là bản v2 mới nhất)
        await downloadFromUrl("https://www.autohotkey.com/download/ahk-v2.exe", destPath);

        const openErr = await openPathWithRetry(destPath);
        if (openErr) {
            return { success: false, error: "Tải xong nhưng không mở được trình cài đặt (có thể do Antivirus đang khoá file): " + openErr, path: destPath };
        }

        return { success: true, path: destPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ================================
// VST2: tải file .zip từ Google Drive rồi giải nén vào C:\Program Files\VstPlugins
// (thư mục hệ thống -> cần quyền Admin, tự bật UAC lúc giải nén)
// ================================
const VST2_TARGET_DIR = "C:\\Program Files\\VstPlugins";

function extractZipElevated(zipPath, destDir) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(getDownloadTempDir(), "extract-vst2.ps1");
        const scriptContent =
            `New-Item -ItemType Directory -Force -Path "${destDir}" | Out-Null\r\n` +
            `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`;

        fs.writeFileSync(scriptPath, scriptContent, "utf-8");

        const launcher =
            `Start-Process powershell -Verb RunAs -Wait -ArgumentList ` +
            `'-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"'`;

        execFile("powershell.exe", ["-NoProfile", "-Command", launcher], (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

ipcMain.handle("download-vst2", async (event, url) => {
    try {
        const zipPath = path.join(getDownloadTempDir(), "VST2Plugins.zip");

        await downloadAnyUrl(url, zipPath);

        try {
            await extractZipElevated(zipPath, VST2_TARGET_DIR);
        } catch (err) {
            return {
                success: false,
                error: "Giải nén vào " + VST2_TARGET_DIR + " thất bại (có thể bạn đã bấm Không ở popup xin quyền Admin, hoặc lỗi khác): " + err.message
            };
        }

        return { success: true, path: VST2_TARGET_DIR };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ================================
// TỰ ĐỘNG DÒ ĐƯỜNG DẪN TRÌNH DUYỆT (các vị trí cài đặt phổ biến trên Windows)
// ================================
const BROWSER_PATH_CANDIDATES = {
    "Chrome": [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
    ],
    "Brave": [
        "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe")
    ],
    "Cốc Cốc": [
        "C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe",
        "C:\\Program Files (x86)\\CocCoc\\Browser\\Application\\browser.exe",
        path.join(process.env.LOCALAPPDATA || "", "CocCoc\\Browser\\Application\\browser.exe")
    ]
};

ipcMain.handle("find-browser-path", (event, browserName) => {
    const candidates = BROWSER_PATH_CANDIDATES[browserName] || [];

    for (const candidate of candidates) {
        try {
            if (candidate && fs.existsSync(candidate)) {
                return candidate;
            }
        } catch {
            // bỏ qua, thử candidate tiếp theo
        }
    }

    return null;
});

// Kênh ĐỒNG BỘ (sendSync) để appSettings.js giữ nguyên API get/set đồng bộ như trước,
// chỉ đổi nơi lưu trữ thực sự từ localStorage (bị cô lập theo cửa sổ) sang 1 file dùng chung.
ipcMain.on("load-settings-sync", (event) => {
    event.returnValue = readSettingsFile();
});

ipcMain.on("save-settings-sync", (event, data) => {
    event.returnValue = writeSettingsFile(data);
});

ipcMain.handle("select-file", async (event, options = {}) => {
    const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: options.filters || [{ name: "All Files", extensions: ["*"] }]
    });

    if (result.canceled || !result.filePaths.length) {
        return null;
    }

    return result.filePaths[0];
});

ipcMain.handle("export-backup", async (event, data) => {
    const result = await dialog.showSaveDialog({
        defaultPath: "automenu-backup.json",
        filters: [{ name: "JSON", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePath) {
        return null;
    }

    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), "utf-8");
    return result.filePath;
});

ipcMain.handle("import-backup", async () => {
    const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePaths.length) {
        return null;
    }

    try {
        const raw = fs.readFileSync(result.filePaths[0], "utf-8");
        return JSON.parse(raw);
    } catch (err) {
        console.error("import-backup: không đọc/parse được file:", err);
        return null;
    }
});

// ================================
// MỞ KÈM PROJECT / YOUTUBE
// ================================
function buildCopyPath(originalPath) {
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return path.join(dir, `${base}_copy_${stamp}${ext}`);
}

ipcMain.handle("open-project-bundle", async (event, options = {}) => {
    const {
        launchDAW,
        dawPath,
        projectPath,
        openProject,
        makeCopy,
        openYoutube,
        browserPath,
        youtubeUrl
    } = options;

    const result = { openedProjectPath: null, errors: [] };

    // 1) Mở DAW (nếu bật "Mở DAW cùng Menu")
    if (launchDAW) {
        if (!dawPath || !fs.existsSync(dawPath)) {
            result.errors.push("Chưa thiết lập đường dẫn DAW hoặc file không còn tồn tại.");
        } else {
            try {
                const openErr = await shell.openPath(dawPath);
                if (openErr) {
                    result.errors.push("Không mở được DAW: " + openErr);
                }
            } catch (err) {
                result.errors.push("Không mở được DAW: " + err.message);
            }
        }
    }

    // 2) Mở Project (có thể tạo bản copy trước)
    if (openProject) {
        if (!projectPath || !fs.existsSync(projectPath)) {
            result.errors.push("Chưa chọn Project hoặc file không còn tồn tại.");
        } else {
            let pathToOpen = projectPath;

            if (makeCopy) {
                try {
                    const copyPath = buildCopyPath(projectPath);
                    fs.copyFileSync(projectPath, copyPath);
                    pathToOpen = copyPath;
                } catch (err) {
                    result.errors.push("Không tạo được bản copy: " + err.message);
                }
            }

            try {
                const openErr = await shell.openPath(pathToOpen);
                if (openErr) {
                    result.errors.push("Không mở được project: " + openErr);
                } else {
                    result.openedProjectPath = pathToOpen;
                }
            } catch (err) {
                result.errors.push("Không mở được project: " + err.message);
            }
        }
    }

    // 3) Mở Youtube — ưu tiên mở bằng ĐÚNG trình duyệt đã chọn ở Setup, nếu có đường dẫn hợp lệ
    if (openYoutube) {
        const url = youtubeUrl || "https://www.youtube.com";

        if (browserPath && fs.existsSync(browserPath)) {
            try {
                await new Promise((resolve, reject) => {
                    execFile(browserPath, [url], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            } catch (err) {
                result.errors.push("Không mở được trình duyệt đã chọn: " + err.message);
            }
        } else {
            // Chưa thiết lập đường dẫn trình duyệt cụ thể -> dùng trình duyệt mặc định của Windows
            try {
                await shell.openExternal(url);
            } catch (err) {
                result.errors.push("Không mở được Youtube: " + err.message);
            }
        }
    }

    return result;
});

app.on("window-all-closed", () => {

    if (process.platform !== "darwin") {
        app.quit();
    }

});

app.on("activate", () => {

    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        createSetupWindow();
    }

});
