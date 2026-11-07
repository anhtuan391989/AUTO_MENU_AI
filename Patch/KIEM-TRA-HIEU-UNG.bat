@echo off
cd /d "%~dp0"
echo ===== Kiem tra cac file Bang Hieu Ung =====
call :chk app\preload.js effectsLibraryOp
call :chk app\main.js effects-lib-op
call :chk app\EffectsWindow.js "HEIGHT = 560"
call :chk ui\js\renderer.js loadLibrary
call :chk ui\effects.html playLibEffect
call :chk ui\setup.html panel-effects
call :chk ui\js\setupEffects.js effectsLibraryOp
if exist ui\assets\effects\EffectsData.json (echo OK    ui\assets\effects\EffectsData.json) else (echo THIEU ui\assets\effects\EffectsData.json)
echo.
echo OK = file da la ban moi. THIEU = file chua duoc ghi de.
pause
exit /b
:chk
findstr /c:%2 %1 >nul 2>&1 && (echo OK    %1) || (echo THIEU %1)
exit /b
