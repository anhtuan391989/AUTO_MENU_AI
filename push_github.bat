@echo off
setlocal
cd /d "%~dp0"

set REPO_URL=https://github.com/kennguyen281191-source/AUTO_MENU_AI.git
set BRANCH=main

where git >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Git. Tai tai: https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo Thu muc nay chua phai repo Git, dang khoi tao...
  git init
  git branch -M %BRANCH%
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin %REPO_URL%
)

echo Repo dang dung:
git remote get-url origin
echo.

git checkout %BRANCH%
git pull origin %BRANCH% --rebase --autostash

git add -A
git diff --cached --quiet
if %errorlevel%==0 (
  echo Khong co thay doi nao de push.
  pause
  exit /b 0
)

for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\""') do set NOW=%%i
git commit -m "Auto update %NOW%"
if errorlevel 1 (
  echo [LOI] Commit that bai.
  pause
  exit /b 1
)

git push -u origin %BRANCH%
if errorlevel 1 (
  echo [LOI] Push that bai. Kiem tra dang nhap GitHub hoac quyen ghi vao repo.
  pause
  exit /b 1
)

echo.
echo XONG! Commit cuoi:
git log -1 --format=%%h
pause
endlocal
