# Spike loopback — cách chạy (độc lập, không đụng AUTO_MENU_AI)
Trạng thái: **chưa chạy trên Windows** (`BLOCKED_RUNTIME_WINDOWS`); chỉ kiểm tra cú pháp (`node --check`).

Chạy (Windows, tại thư mục gốc repo, đã có `node_modules` với Electron 41.7.1):
```
npx electron tools/algbench/reports/SETUP-AUDIO-LOOPBACK-SPIKE-01/spike/main.js
```
- Dùng thư mục dữ liệu tạm riêng (`%TEMP%\auto-menu-ai-loopback-spike`) → không đổi `appSettings`, không đổi `selectedMicDeviceId`/`selectedSystemAudioDeviceId`.
- Không có stream nào tự bật; chỉ mở khi bấm nút. Không phát lại loopback ra loa (không nối `destination`).
- Làm theo `../WINDOWS-CHECKLIST.md`, bấm "Ghi mốc" sau mỗi kịch bản rồi "Xuất log JSON" và gửi lại ảnh/JSON.
