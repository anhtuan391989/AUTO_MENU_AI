@echo off
cd /d "G:\AUTO_MENU_AI"

git pull origin main
git add .
git commit -m "Auto-sync %date% %time%"

:: Đẩy lên tài khoản GitHub thứ nhất (origin)
git push -u origin main

:: Đẩy lên tài khoản GitHub thứ hai (origin2)
git push -u origin2 main

echo.
echo ====================================
echo   PUSH GITHUB 2 ACCOUNTS COMPLETED
echo ====================================
timeout /t 10