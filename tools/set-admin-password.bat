@echo off
chcp 65001 >nul
title Dat mat khau Admin cho ban phat hanh
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js tren may nay nen khong chay duoc cong cu.
  pause
  exit /b 1
)
echo ============================================================
echo  DAT MAT KHAU ADMIN RIENG CHO BAN PHAT HANH (tab AI)
echo  - Mat khau it nhat 12 ky tu, co ca chu va so. Khong hien chu khi go.
echo  - Cong cu khong luu mat khau o dau ca: hay tu ghi nho.
echo ============================================================
echo.
node tools\set-admin-password.js
echo.
pause
