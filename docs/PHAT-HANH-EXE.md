# Đóng gói .exe và phát hành bản cập nhật (PACKAGE-01 / APP-UPDATE-02)

Làm trên máy Windows có thư mục `G:\AUTO_MENU_AI`. Máy build cần Node.js (đã có vì đang chạy `npm start`).

## A. Tạo bộ cài lần đầu (để cài sang máy khác)

1. Mở CMD trong `G:\AUTO_MENU_AI`, chạy: `npm install` (chỉ cần lần đầu, hoặc khi có thư viện mới).
2. Chạy: `npm run dist`
3. Lấy file `dist\AutoMenuAI Setup <version>.exe` (khoảng 145 MB) gửi cho máy khác, bấm đúp để cài.
   - Windows có thể hiện cảnh báo SmartScreen (vì chưa ký số): bấm **Thông tin thêm → Vẫn chạy**.
   - Máy mới vẫn cần: loopMIDI, DAW, và AutoHotkey v2 nếu dùng tính năng Lấy tọa độ.
   - Máy mới phải kích hoạt License như bình thường (1 key = 1 mã máy).

## B. Phát hành bản mới (để các máy khác bấm "Cập nhật" là xong)

1. Sửa số `"version"` trong `package.json` (ví dụ `1.0.1` → `1.0.2`). **Bắt buộc tăng**, nếu không máy khác không thấy bản mới.
2. Chạy `npm run dist` để tạo bộ cài mới trong `dist\`.
3. Vào https://github.com/anhtuan391989/AUTO_MENU_AI/releases → **Draft a new release**:
   - Tag: `v1.0.2` (đúng bằng số version, có chữ `v`).
   - Kéo thả 3 file trong `dist\` vào: `AutoMenuAI Setup 1.0.2.exe`, `AutoMenuAI Setup 1.0.2.exe.blockmap`, `latest.yml`.
   - Bấm **Publish release** (không chọn Draft, không chọn Pre-release).
4. Trên máy khác: Setup → System & Backup → **Kiểm tra cập nhật** → **Cập nhật** → **Khởi động lại**.

Cách tự động (thay cho bước 3): đặt biến `GH_TOKEN` (Personal Access Token GitHub, quyền `repo`) rồi chạy `npm run release` — lệnh này tự đóng gói và đăng Release.

## Ghi chú kỹ thuật

- Bản cài chạy bằng `app.isPackaged`; cập nhật qua `electron-updater` + GitHub Releases (`app/InstalledUpdater.js`). Máy dev chạy `npm start` vẫn cập nhật bằng `git pull` như cũ.
- Bản cài lưu dữ liệu ghi được (`logs`, `data/songs.json`) ở `%APPDATA%\automenu-ai\` nên cài đè bản mới không mất dữ liệu. Lần chạy đầu `songs.json` được lấy từ bản mẫu đi kèm.
- `asar` tắt vì AutoHotkey/PowerShell cần đọc file script thật (`ahk\*.ahk`, `core\integration\smtc-daemon.ps1`).
- Thư viện MIDI (`easymidi`) dùng bản N-API dựng sẵn cho Windows x64 nên không cần Visual Studio/Python để build.
- Thư mục `dist/` đã nằm trong `.gitignore` để `sync.bat` (`git add .`) không đẩy file cài lên GitHub.
