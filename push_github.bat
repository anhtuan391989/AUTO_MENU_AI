@echo off
setlocal
cd /d "%~dp0"

set REPO_URL=https://github.com/kennguyen281191-source/AUTO_MENU_AI.git
rem Dan link repo du phong vao dong duoi (de trong = bo qua)
set BACKUP_URL=
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

if not "%BACKUP_URL%"=="" (
  git remote get-url backup >nul 2>nul
  if errorlevel 1 (
    git remote add backup %BACKUP_URL%
  ) else (
    git remote set-url backup %BACKUP_URL%
  )
)

echo Repo chinh dang dung:
git remote get-url origin
echo.

git checkout %BRANCH%
git pull origin %BRANCH% --rebase --autostash

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

git push -u origin %BRANCH%
if errorlevel 1 (
  echo [LOI] Push len repo chinh that bai. Kiem tra dang nhap GitHub hoac quyen ghi.
) else (
  echo [OK] Da push repo chinh.
)

if not "%BACKUP_URL%"=="" (
  git push backup %BRANCH%
  if errorlevel 1 (
    echo [LOI] Push len repo du phong that bai.
  ) else (
    echo [OK] Da push repo du phong.
  )
)

echo.
echo Commit cuoi:
git log -1 --format=%%h
pause
endlocal
