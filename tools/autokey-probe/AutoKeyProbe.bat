@echo off
chcp 65001 >nul
echo === Do plugin Auto-Key (chi doc, khong bam gi) ===
echo Hay MO SAN Studio One va cua so plugin Auto-Key (nhin thay tren man hinh) truoc khi chay.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0AutoKeyProbe.ps1"
echo.
echo Xong. Gui file AutoKeyProbe-KETQUA.txt (cung thu muc) cho Claude.
pause
