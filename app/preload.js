const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    // ---- Setup window ----
    openSetup: () => ipcRenderer.send("open-setup"),
    closeSetup: () => ipcRenderer.send("close-setup"),
    notifySetupChanged: () => ipcRenderer.send("setup-changed"),
    onSetupChanged: (callback) => ipcRenderer.on("setup-changed", () => callback()),

    // ---- Kiểm tra kết nối main process ----
    ping: () => ipcRenderer.invoke("ping"),

    // ---- AutoHotkey / lấy toạ độ ----
    findAhkPath: () => ipcRenderer.invoke("find-ahk-path"),
    setupCapture: (payload) => ipcRenderer.invoke("setup-capture", payload),
    downloadAhk: () => ipcRenderer.invoke("download-ahk"),
    clickAtPoint: (point) => ipcRenderer.invoke("click-at-point", point),

    // ---- Tải & cài phần mềm ----
    downloadAndInstall: (url, label) => ipcRenderer.invoke("download-and-install", { url, label }),
    downloadBrave: () => ipcRenderer.invoke("download-brave"),
    downloadVst2: (url) => ipcRenderer.invoke("download-vst2", url),
    openExternalUrl: (url) => ipcRenderer.invoke("open-external-url", url),

    // ---- Trình duyệt ----
    findBrowserPath: (browserName) => ipcRenderer.invoke("find-browser-path", browserName),

    // ---- Cài đặt lưu trên file (thay localStorage) ----
    loadSettingsSync: () => ipcRenderer.sendSync("load-settings-sync"),
    saveSettingsSync: (data) => ipcRenderer.sendSync("save-settings-sync", data),

    // ---- File / backup ----
    selectFile: (options) => ipcRenderer.invoke("select-file", options),
    exportBackup: (data) => ipcRenderer.invoke("export-backup", data),
    importBackup: () => ipcRenderer.invoke("import-backup"),

    // ---- Mở DAW / project / youtube cùng lúc ----
    openProjectBundle: (options) => ipcRenderer.invoke("open-project-bundle", options),

    // ---- Tính năng AI (mới thêm) ----
    // Lưu ý: main.js hiện CHƯA có ipcMain.handle("ai-command", ...).
    // Cần nối phần AI layer + Command Engine vào main.js thì hàm này mới chạy được.
    sendCommand: (text) => ipcRenderer.invoke("ai-command", text),
});
