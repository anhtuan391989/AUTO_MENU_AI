@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
set "PORT=AUTO MENU AI"
echo ========================================
echo   AUTO MENU AI - Cai dat MIDI 1 lan
echo   loopMIDI + Surface Studio One + FFmpeg
echo ========================================
echo.

REM --- Buoc 1: tim loopMIDI ---
set "LM="
if exist "%ProgramFiles%\Tobias Erichsen\loopMIDI\loopMIDI.exe" set "LM=%ProgramFiles%\Tobias Erichsen\loopMIDI\loopMIDI.exe"
if exist "%ProgramFiles(x86)%\Tobias Erichsen\loopMIDI\loopMIDI.exe" set "LM=%ProgramFiles(x86)%\Tobias Erichsen\loopMIDI\loopMIDI.exe"
if exist "%LOCALAPPDATA%\Programs\Tobias Erichsen\loopMIDI\loopMIDI.exe" set "LM=%LOCALAPPDATA%\Programs\Tobias Erichsen\loopMIDI\loopMIDI.exe"
if "!LM!"=="" (
    echo [CHUA CAI] Chua co loopMIDI. Dang mo trang tai...
    start "" "https://www.tobias-erichsen.de/software/loopmidi.html"
    echo Cai loopMIDI xong, chay lai file nay.
    pause
    exit /b 1
)
echo [OK] loopMIDI: !LM!

REM --- Buoc 2: tao cong "AUTO MENU AI" ---
tasklist /FI "IMAGENAME eq loopMIDI.exe" 2>nul | find /I "loopMIDI.exe" >nul
if !errorlevel! neq 0 (
    start "" "!LM!"
    timeout /t 3 /nobreak >nul
)
reg query "HKCU\Software\Tobias Erichsen\loopMIDI\Ports" /v "%PORT%" >nul 2>&1
if !errorlevel! neq 0 (
    reg add "HKCU\Software\Tobias Erichsen\loopMIDI\Ports" /v "%PORT%" /t REG_SZ /d "%PORT%" /f >nul 2>&1
    if !errorlevel! equ 0 (
        taskkill /F /IM loopMIDI.exe >nul 2>&1
        timeout /t 2 /nobreak >nul
        start "" "!LM!"
        timeout /t 3 /nobreak >nul
        echo [OK] Da them cong "%PORT%"
    ) else (
        echo [CANH BAO] Khong tu tao duoc cong. Lam tay 1 lan:
        echo   1. Mo loopMIDI duoi khay he thong
        echo   2. Go  %PORT%  vao o "New port-name"
        echo   3. Bam nut "+"
        pause
    )
) else (
    echo [OK] Cong "%PORT%" da co
)

REM --- Buoc 3: loopMIDI tu chay cung Windows ---
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "loopMIDI" /t REG_SZ /d "\"!LM!\" /autostart" /f >nul 2>&1
echo [OK] loopMIDI tu chay khi mo Windows
echo.
REM --- Buoc 4: Surface cho Studio One ---
echo ----------------------------------------
echo  Buoc 4: Cai AutoMenuAI Surface cho Studio One
echo ----------------------------------------
set "SURFACE_DIR="
set "S1_VERSION="
if exist "%APPDATA%\PreSonus\Studio One 7" (
    set "SURFACE_DIR=%APPDATA%\PreSonus\Studio One 7\User Devices\AutoMenuAI"
    set "S1_VERSION=7"
)
if "!SURFACE_DIR!"=="" if exist "%APPDATA%\PreSonus\Studio One 6" (
    set "SURFACE_DIR=%APPDATA%\PreSonus\Studio One 6\User Devices\AutoMenuAI"
    set "S1_VERSION=6"
)
if "!SURFACE_DIR!"=="" if exist "%APPDATA%\PreSonus\Studio One 5" (
    set "SURFACE_DIR=%APPDATA%\PreSonus\Studio One 5\User Devices\AutoMenuAI"
    set "S1_VERSION=5"
)
if "!SURFACE_DIR!"=="" (
    echo [CANH BAO] Khong tim thay Studio One. Cai Studio One roi chay lai file nay.
    goto :skip_surface
)
echo [OK] Tim thay Studio One !S1_VERSION!
set "SRC_DIR=%~dp0studio_one"
if not exist "!SRC_DIR!\AutoMenuAI.surface.xml" (
    echo [ERROR] Khong tim thay file surface tai: !SRC_DIR!
    echo Hay de thu muc studio_one cung cho voi file .bat nay.
    goto :skip_surface
)
if not exist "!SURFACE_DIR!" mkdir "!SURFACE_DIR!"
copy /Y "!SRC_DIR!\AutoMenuAI.surface.xml" "!SURFACE_DIR!\" >nul
copy /Y "!SRC_DIR!\deviceinfo.xml" "!SURFACE_DIR!\" >nul
if exist "!SURFACE_DIR!\AutoMenuAI.surface.xml" (echo [OK] Da copy AutoMenuAI.surface.xml) else (echo [ERROR] Copy surface that bai)
echo [QUAN TRONG] KHOI DONG LAI Studio One de nhan AutoMenuAI Surface.
:skip_surface
echo.
REM ============================================
REM  BƯỚC 4: Cài đặt FFmpeg (cho YouTube)
REM ============================================
echo ----------------------------------------
echo  Buoc 5: Kiem tra FFmpeg
echo ----------------------------------------

REM Kiểm tra FFmpeg đã có chưa (cả PATH lẫn %LOCALAPPDATA%\FFmpeg)
where ffmpeg >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] FFmpeg da duoc cai dat ^(trong PATH^)
    goto :skip_ffmpeg
)

set "FFMPEG_DIR=%LOCALAPPDATA%\FFmpeg"
if exist "!FFMPEG_DIR!\ffmpeg.exe" (
    echo [OK] FFmpeg da co tai: !FFMPEG_DIR!
    goto :ffmpeg_ensure_path
)

echo [CHUA CAI] FFmpeg chua duoc cai dat.
echo FFmpeg can thiet de tai va phan tich audio tu YouTube.
echo.

set "FFMPEG_ZIP=%TEMP%\ffmpeg.zip"

REM URL 1: GitHub BtbN builds (stable)
set "FFMPEG_URL_1=https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
REM URL 2: gyan.dev essentials (fallback)
set "FFMPEG_URL_2=https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

set "DOWNLOAD_OK=0"

echo [INFO] Dang tai FFmpeg tu GitHub... (co the mat 1-2 phut)
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%FFMPEG_URL_1%' -OutFile '%FFMPEG_ZIP%' -UseBasicParsing -TimeoutSec 120; Write-Host 'OK' } catch { Write-Host 'FAIL' }" 2>nul | find "OK" >nul

if !errorlevel! equ 0 (
    set "DOWNLOAD_OK=1"
    echo [OK] Tai tu GitHub thanh cong
) else (
    echo [CANH BAO] Tai tu GitHub that bai. Thu link du phong...
    echo [INFO] Dang tai FFmpeg tu gyan.dev...
    powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%FFMPEG_URL_2%' -OutFile '%FFMPEG_ZIP%' -UseBasicParsing -TimeoutSec 120; Write-Host 'OK' } catch { Write-Host 'FAIL' }" 2>nul | find "OK" >nul
    
    if !errorlevel! equ 0 (
        set "DOWNLOAD_OK=1"
        echo [OK] Tai tu gyan.dev thanh cong
    )
)

if "!DOWNLOAD_OK!"=="0" (
    echo [ERROR] Khong the tai FFmpeg tu dong tu ca 2 nguon.
    echo.
    echo Ban co the tai thu cong bang cach:
    echo   1. Mo link: https://www.gyan.dev/ffmpeg/builds/
    echo   2. Tai "ffmpeg-release-essentials.zip"
    echo   3. Giai nen va copy ffmpeg.exe vao: %LOCALAPPDATA%\FFmpeg\
    echo.
    echo Nhan phim bat ky de tiep tuc...
    pause >nul
    goto :skip_ffmpeg
)

REM Giải nén
echo [INFO] Dang giai nen FFmpeg...
if not exist "!FFMPEG_DIR!" mkdir "!FFMPEG_DIR!"

powershell -Command "try { $ProgressPreference = 'SilentlyContinue'; Expand-Archive -Path '%FFMPEG_ZIP%' -DestinationPath '%TEMP%\ffmpeg_extract' -Force; $bin = Get-ChildItem -Path '%TEMP%\ffmpeg_extract' -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1; Copy-Item (Join-Path $bin.DirectoryName '*.exe') '%FFMPEG_DIR%\' -Force; Write-Host 'OK' } catch { Write-Host 'FAIL' }" 2>nul | find "OK" >nul

if !errorlevel! neq 0 (
    echo [ERROR] Giai nen FFmpeg that bai.
    echo Vui long tai va cai dat thu cong tai: https://www.gyan.dev/ffmpeg/builds/
    goto :skip_ffmpeg
)

echo [OK] Da giai nen FFmpeg vao: !FFMPEG_DIR!

REM Dọn file tạm
del "%FFMPEG_ZIP%" >nul 2>&1
rd /s /q "%TEMP%\ffmpeg_extract" >nul 2>&1

REM Kiểm tra FFmpeg hoạt động
"!FFMPEG_DIR!\ffmpeg.exe" -version >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] FFmpeg da giai nen nhung khong chay duoc.
    echo Vui long tai lai thu cong tai: https://www.gyan.dev/ffmpeg/builds/
    goto :skip_ffmpeg
)

echo [OK] FFmpeg hoat dong chinh thuong

:ffmpeg_ensure_path
REM Thêm vào PATH (cho user hiện tại) nếu chưa có
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "CURRENT_PATH=%%B"
echo !CURRENT_PATH! | find /I "FFmpeg" >nul
if !errorlevel! neq 0 (
    setx PATH "!CURRENT_PATH!;!FFMPEG_DIR!" >nul 2>&1
    set "PATH=!PATH!;!FFMPEG_DIR!"
    echo [OK] Da them FFmpeg vao PATH
) else (
    echo [OK] FFmpeg da co trong PATH
)

:skip_ffmpeg
echo.

echo.
echo ========================================
echo          CAI DAT HOAN TAT!
echo ========================================
echo.
echo  Buoc tiep theo trong Studio One:
echo  1. DONG va MO LAI Studio One
echo  2. Options ^> External Devices ^> Add
echo  3. Chon "AutoMenuAI" trong danh sach
echo  4. Receive From: "%PORT%" (loopMIDI)
echo  5. Dung Control Link de gan controls (CC da dat san trong surface)
echo  Trong Auto Menu AI: Setup ^> MIDI: chon cong "%PORT%"
echo.
pause
endlocal
