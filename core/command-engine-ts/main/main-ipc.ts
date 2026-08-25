// main-ipc.ts
// Chạy ở MAIN PROCESS, gọi 1 lần khi app khởi động (xem main.ts).
// Sinh tự động 3 kênh IPC cho MỖI module — không phải viết tay từng cái,
// nên thêm module mới (ví dụ "pan" sau này) không cần sửa file này.

import { ipcMain, BrowserWindow } from 'electron';
import { modules } from './registry';

export function registerIpcBridges(): void {
  Object.entries(modules).forEach(([id, module]) => {
    // Menu gọi window.dawAPI.<id>.get() khi vừa mở, để hiển thị giá trị hiện tại.
    ipcMain.handle(`${id}:get`, () => module.getValue());

    // Menu gọi window.dawAPI.<id>.set(value) khi user kéo knob / bấm nút / gõ số.
    ipcMain.handle(`${id}:set`, (_event, value) => {
      module.setValue(value);
    });

    // Khi module tự đổi giá trị (do AI gọi, do tap-tempo, do module khác kích hoạt...)
    // -> broadcast xuống MỌI cửa sổ đang mở để menu tự cập nhật lại UI.
    module.onChange((value) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(`${id}:changed`, value);
      });
    });
  });
}
