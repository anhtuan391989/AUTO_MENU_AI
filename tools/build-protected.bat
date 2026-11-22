@echo off
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Hay cai Node.js truoc.
  pause
  exit /b 1
)
if not exist "node_modules\javascript-obfuscator" (
  echo Dang cai thu vien lam roi code ^(chi lan dau^)...
  call npm install --no-save javascript-obfuscator@4.1.1
)
if not exist "node_modules\javascript-obfuscator" (
  echo KHONG cai duoc thu vien lam roi code. Kiem tra mang roi chay lai.
  pause
  exit /b 1
)
node tools\build-protected.js %*
echo.
pause
