@echo off
cd /d "G:\AUTO_MENU_AI"

git pull origin main
git add .
git commit -m "Auto-sync %date% %time%"
git push -u origin main

echo.
echo ==============================
echo   PUSH GITHUB MAIN COMPLETED
echo ==============================
timeout /t 10