@echo off
chcp 65001 >nul
title AUTO_MENU_AI — Tự động đẩy lên GitHub
color 0B

:: ============================================================
:: AUTO SYNC GITHUB — Từ G:\AUTO_MENU_AI_NANG_CAO lên GitHub
:: Repo: https://github.com/kennguyen281191-source/AUTO_MENU_AI
:: ============================================================

echo.
echo ════════════════════════════════════════════════════════════
echo     🚀 AUTO_MENU_AI — TỰ ĐỘNG ĐỒNG BỘ LÊN GITHUB
echo     Thư mục: G:\AUTO_MENU_AI_NANG_CAO
echo     Repo: kennguyen281191-source/AUTO_MENU_AI
echo ════════════════════════════════════════════════════════════
echo.

:: === Kiểm tra Git đã cài chưa ===
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Chưa cài Git!
    echo Tải về: https://git-scm.com/download/win
    echo Cài đặt rồi chạy lại file này
    echo.
    pause
    exit /b 1
)
echo ✅ Đã phát hiện Git
echo.

:: === Đi vào thư mục gốc ===
cd /d "G:\AUTO_MENU_AI_NANG_CAO"
if %errorlevel% neq 0 (
    echo ❌ Không tìm thấy thư mục G:\AUTO_MENU_AI_NANG_CAO
    pause
    exit /b 1
)

:: === Bước 1: Sao chép từ thư mục nguon ===
if exist "nguon\" (
    echo 🔄 Đang sao chép từ [nguon]...
    xcopy "nguon\*" ".\" /E /Y /I /R >nul 2>&1
    echo ✅ Đã cập nhật file từ thư mục nguon
) else (
    echo ⚠️ Chưa có thư mục [nguon] — bỏ qua bước sao chép
)
echo.

:: === Bước 2: Kiểm tra đã kết nối GitHub chưa ===
if not exist ".git\" (
    echo 🔄 Lần đầu kết nối — khởi tạo repo...
    git init
    git remote add origin https://github.com/kennguyen281191-source/AUTO_MENU_AI.git
    echo ✅ Đã liên kết với GitHub
    echo.
)

:: === Bước 3: Tạo .gitignore tự động nếu chưa có ===
if not exist ".gitignore" (
    echo Thư mục ẩn...
    echo dich/ > .gitignore
    echo *.bat >> .gitignore
    echo ✅ Đã tạo .gitignore
    echo.
)

:: === Bước 4: Thêm tất cả thay đổi ===
echo 📤 Đang chuẩn bị đẩy lên GitHub...
git add . >nul 2>&1

:: === Bước 5: Kiểm tra có thay đổi gì không ===
git diff --cached --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️ Không có thay đổi mới để đẩy lên GitHub
    echo.
    pause
    exit /b 0
)

:: === Bước 6: Tạo thông điệp cam kết ===
set "NGAY=%date:~10,4%-%date:~4,2%-%date:~7,2% %time:~0,5%"
git commit -m "Cập nhật: %NGAY%" >nul 2>&1

:: === Bước 7: Đẩy lên GitHub ===
git push -u origin main >nul 2>&1
if %errorlevel% neq 0 (
    git push -u origin master >nul 2>&1
)

if %errorlevel% equ 0 (
    echo.
    echo ✅═══════════════════════════════════════════════════════════✅
    echo     🎉 THÀNH CÔNG! Đã đẩy lên GitHub
    echo     🔗 https://github.com/kennguyen281191-source/AUTO_MENU_AI
    echo ✅═══════════════════════════════════════════════════════════✅
) else (
    echo ❌ Lỗi khi đẩy lên GitHub
    echo Kiểm tra:
    echo   - Đã đăng nhập GitHub chưa?
    echo   - Có quyền viết vào repo không?
    echo   - Tên nhánh chính là main hay master?
)

echo.
pause
exit /b