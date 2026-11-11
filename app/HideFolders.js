// HIDE-FOLDERS-01 — Ẩn thư mục dữ liệu (%APPDATA%\AutoMenuAI) và thư mục cài đặt của app khỏi
// File Explorer bằng thuộc tính Windows "Hidden" + "System" (lệnh attrib có sẵn trong Windows,
// không cần cài thêm gì). CHỈ chạy trên Windows (process.platform === "win32"), best-effort:
// mọi lỗi (quyền, ổ mạng, antivirus chặn...) đều bị nuốt, không bao giờ làm app dừng hay crash.
//
// GIỚI HẠN THẬT (phải biết trước khi dùng):
// - Thuộc tính Hidden/System chỉ ẩn khỏi File Explorer theo thiết lập mặc định. Bất kỳ ai bật
//   "Hiện tệp, thư mục và ổ đĩa đã ẩn" (Show hidden files) trong Windows đều thấy lại ngay — đây
//   KHÔNG phải khoá hay mã hoá, chỉ là ẩn hiển thị thông thường.
//   KHÔNG mã hoá nội dung file: ai mở được file (kể cả khi đã ẩn) vẫn đọc được nguyên văn.
// - Dòng lệnh Command Prompt/PowerShell với "dir /a" hoặc "Get-ChildItem -Force" vẫn thấy bình
//   thường dù đã ẩn.
'use strict';
const path = require('path');
const { execFile } = require('child_process');

function hideFolder(targetDir, log) {
    if (process.platform !== 'win32') return; // chỉ Windows mới có attrib kiểu này
    if (!targetDir || typeof targetDir !== 'string') return;
    try {
        // /S: áp dụng cho toàn bộ file trong thư mục con. /D: áp dụng luôn cho các thư mục con.
        // Ẩn cả bản thân targetDir lẫn mọi thứ bên trong.
        execFile('attrib', ['+h', '+s', targetDir], () => {
            execFile('attrib', ['+h', '+s', path.join(targetDir, '*.*'), '/S', '/D'], (err) => {
                if (err && typeof log === 'function') log('HIDE-FOLDERS-01: ẩn nội dung "' + targetDir + '" lỗi (bỏ qua): ' + err.message);
            });
        });
    } catch (err) {
        if (typeof log === 'function') log('HIDE-FOLDERS-01: ẩn "' + targetDir + '" lỗi (bỏ qua): ' + (err && err.message));
    }
}

// Gọi 1 lần lúc app khởi động xong, SAU khi mọi file cấu hình/license/log cần thiết đã được tạo
// (nếu ẩn thư mục trước khi app kịp tạo file bên trong, file mới tạo thêm sau đó sẽ KHÔNG tự ẩn
// theo — nên hàm này nên được gọi lại định kỳ hoặc sau mỗi lần có file mới quan trọng).
// userDataDir: app.getPath("userData") — chứa app-settings.json, license.json, các log/state.
// installDir: thư mục chứa app khi đã đóng gói .exe (vd app.getPath("exe") lấy dirname) — KHÔNG
// truyền khi đang chạy "electron ." từ mã nguồn (sẽ ẩn luôn thư mục code đang sửa, gây khó chịu
// khi làm việc bằng git/editor).
function hideAppFolders({ userDataDir, installDir, isPackaged, log } = {}) {
    if (userDataDir) hideFolder(userDataDir, log);
    if (isPackaged && installDir) hideFolder(installDir, log);
}

module.exports = { hideFolder, hideAppFolders };
