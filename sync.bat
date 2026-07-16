@echo off
cd /d "G:\AUTO_MENU_AI"

:: 1. Lấy code mới nhất về
git pull origin develop

:: 2. Lưu thay đổi của bạn vào nhánh develop
git add .
git commit -m "Auto-sync %date% %time%"
git push origin develop

:: 3. Tự động merge develop vào main tại máy tính
git checkout main
git pull origin main
git merge develop -m "Auto-merge develop to main"

:: 4. Đẩy kết quả sau khi đã gộp lên GitHub
git push origin main

:: 5. Quay lại nhánh develop để tiếp tục làm việc
git checkout develop

echo Da dong bo tu dong len Main!
timeout /t 5