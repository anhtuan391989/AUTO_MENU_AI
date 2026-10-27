const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("spike", {
    setMode: (m) => ipcRenderer.invoke("spike:set-mode", m),
    info: () => ipcRenderer.invoke("spike:info"),
});
