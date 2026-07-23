@echo off
cd /d "G:\AUTO_MENU_AI"

:: 1. Lấy code mới nhất từ GitHub về để tránh lỗi "rejected"
git pull origin main

:: 2. Thêm và lưu thay đổi vào nhánh main
git add .
git commit -m "Auto-sync %date% %time%"

:: 3. Đẩy thẳng lên nhánh main trên GitHub
git push -u origin main

echo Da day du lieu len nhanh main thanh cong!
timeout /t 3