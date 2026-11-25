@echo off
REM RA-SOAT-BAO-MAT: chay 1 LAN DUY NHAT sau khi da copy file .gitignore moi vao G:\AUTO_MENU_AI.
REM Viec nay CHI bo thu muc logs\ ra khoi su theo doi cua Git (de tu nay khong con tu dong
REM dong bo len GitHub nua) - KHONG xoa bat ky file log that nao tren may.
cd /d "%~dp0\.."
echo Dang ngung theo doi thu muc logs\ (giu nguyen file that tren may)...
git rm -r --cached logs >nul 2>&1
echo Xong. Lan dong bo (auto-sync) tiep theo se khong con cuon logs\ theo nua.
pause
