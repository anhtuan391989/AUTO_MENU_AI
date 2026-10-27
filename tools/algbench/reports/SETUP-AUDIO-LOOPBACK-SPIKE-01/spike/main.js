// SETUP-AUDIO-LOOPBACK-SPIKE-01 — SPIKE ĐỘC LẬP (chưa chạy trên Windows).
// KHÔNG phải một phần của AUTO_MENU_AI: không import app/*, không đọc/ghi appSettings.
// userData tách riêng (thư mục tạm) => không đụng cấu hình người dùng.
const { app, BrowserWindow, session, ipcMain } = require("electron");
const path = require("path");
const os = require("os");

app.setPath("userData", path.join(os.tmpdir(), "auto-menu-ai-loopback-spike"));

// Chế độ loopback do người chạy chọn trong cửa sổ spike: "loopback" | "loopbackWithMute".
let loopbackMode = "loopback";
ipcMain.handle("spike:set-mode", (_e, mode) => {
    if (mode !== "loopback" && mode !== "loopbackWithMute") throw new Error("mode không hợp lệ");
    loopbackMode = mode;
    return loopbackMode;
});
ipcMain.handle("spike:info", () => ({
    electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform,
}));

app.whenReady().then(() => {
    // Handler chỉ cấp AUDIO loopback khi renderer spike gọi getDisplayMedia (cần user gesture).
    // Chromium bắt buộc có "video" khi gọi getDisplayMedia; renderer sẽ dừng/bỏ track video ngay.
    // Không có desktopCapturer => dùng frame spike làm video giữ chỗ (WebFrameMain), không chụp màn hình.
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        if (!request.audioRequested || process.platform !== "win32") {
            callback({}); // từ chối: không có audio hoặc không phải Windows
            return;
        }
        callback({ video: request.frame, audio: loopbackMode });
    });

    const win = new BrowserWindow({
        width: 760, height: 780,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true, nodeIntegration: false,
        },
    });
    win.loadFile(path.join(__dirname, "index.html"));
});
app.on("window-all-closed", () => app.quit());
