@echo off
chcp 65001 >nul
cd /d "%~dp0..\..\.."
echo === GHI KET QUA 1 BAI (sau khi Menu da hien Key) ===
set /p ID=Ma bai (vi du S01): 
set /p BPM=BPM Menu dang hien (so, vi du 169; de trong neu khong co): 
if "%BPM%"=="" (node tests\calibration\runtime-verify\record_result.js capture "%ID%") else (node tests\calibration\runtime-verify\record_result.js capture "%ID%" --bpm "%BPM%")
echo.
node tests\calibration\runtime-verify\record_result.js status
pause
