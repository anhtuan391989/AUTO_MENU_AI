@echo off
cd /d "G:\AUTO_MENU_AI"

:: 1. Cập nhật dữ liệu từ GitHub về trước khi làm gì khác
git pull origin main

:: 2. Thực hiện đẩy dữ liệu
git add .
git commit -m "Auto-sync %date% %time%"
git push -u origin main

echo Da xong!
timeout /t 5