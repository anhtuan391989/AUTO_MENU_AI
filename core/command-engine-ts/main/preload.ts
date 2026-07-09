// preload.ts
// Chạy trong context đặc biệt của Electron preload. Đây là "cửa" duy nhất
// menu UI được phép đi qua — KHÔNG bao giờ expose ipcRenderer trực tiếp
// (contextIsolation phải bật trong BrowserWindow để đảm bảo an toàn).

import { contextBridge, ipcRenderer } from 'electron';

const MODULE_IDS = ['status', 'key', 'bpm', 'mod', 'monitor', 'knob'] as const;
type ModuleId = (typeof MODULE_IDS)[number];

function buildModuleApi(id: ModuleId) {
  return {
    get: () => ipcRenderer.invoke(`${id}:get`),
    set: (value: unknown) => ipcRenderer.invoke(`${id}:set`, value),
    // Trả về hàm unsubscribe — menu PHẢI gọi khi component/màn hình bị đóng,
    // nếu không sẽ rò rỉ listener mỗi lần mở lại menu.
    onChange: (callback: (value: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(value);
      ipcRenderer.on(`${id}:changed`, listener);
      return () => ipcRenderer.removeListener(`${id}:changed`, listener);
    },
  };
}

const dawAPI = Object.fromEntries(
  MODULE_IDS.map((id) => [id, buildModuleApi(id)]),
) as Record<ModuleId, ReturnType<typeof buildModuleApi>>;

// Menu UI sẽ gọi: window.dawAPI.bpm.get() / .set(128) / .onChange(cb)
contextBridge.exposeInMainWorld('dawAPI', dawAPI);
