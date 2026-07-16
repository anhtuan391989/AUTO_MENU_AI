@echo off
cd /d "G:\AUTO_MENU_AI"

:: Lấy code mới nhất về từ nhánh develop trên GitHub
git pull origin develop

:: Đẩy code từ máy lên nhánh develop
git add .
git commit -m "Auto-sync %date% %time%"
git push -u origin develop

echo Da day du lieu len nhanh develop!
timeout /t 5