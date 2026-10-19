@echo off
setlocal
cd /d "%~dp0"

rem ===== 2 GITHUB: CU va MOI =====
set URL_CU=https://github.com/anhtuan391989/AUTO_MENU_AI.git
set URL_MOI=https://github.com/kennguyen281191-source/AUTO_MENU_AI.git
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

git remote get-url cu >nul 2>nul
if errorlevel 1 (git remote add cu %URL_CU%) else (git remote set-url cu %URL_CU%)

git remote get-url moi >nul 2>nul
if errorlevel 1 (git remote add moi %URL_MOI%) else (git remote set-url moi %URL_MOI%)

echo GitHub cu : %URL_CU%
echo GitHub moi: %URL_MOI%
echo.

git checkout %BRANCH%
git pull cu %BRANCH% --rebase --autostash

git add -A
git diff --cached --quiet
if %errorlevel%==0 (
  echo Khong co thay doi moi de commit.
) else (
  for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\""') do set NOW=%%i
  git commit -m "Auto update %NOW%"
  if errorlevel 1 (
    echo [LOI] Commit that bai.
    pause
    exit /b 1
  )
)

git push -u cu %BRANCH%
if errorlevel 1 (
  echo [LOI] Push len GitHub CU that bai. Kiem tra dang nhap hoac quyen ghi.
) else (
  echo [OK] Da push GitHub CU.
)

git push -u moi %BRANCH%
if errorlevel 1 (
  echo [LOI] Push len GitHub MOI that bai. Kiem tra repo da tao chua, dang nhap hoac quyen ghi.
) else (
  echo [OK] Da push GitHub MOI.
)

echo.
echo Commit cuoi:
git log -1 --format=%%h
pause
endlocal
