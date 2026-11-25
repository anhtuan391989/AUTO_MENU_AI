@echo off
title Lay ma bam SHA-256 (de kiem tra file tai ve)
echo ============================================================
echo  Cong cu nho: lay "ma bam SHA-256" cua 1 file bat ky.
echo  (Day la file co san trong Windows, khong cai them gi.)
echo ============================================================
echo.
echo Cach dung: KEO THA file can kiem tra vao cua so nay roi bam Enter.
echo (Hoac go/dan duong dan day du toi file, vi du: C:\Users\...\VST2Plugins.zip)
echo.
set /p "filepath=Keo tha file vao day: "
echo.
echo ---- KET QUA (dong "Hash cua") ----
certutil -hashfile "%filepath%" SHA256
echo -----------------------------------
echo.
echo Hay copy dong ma (day so+chu, khong co dau cach) o tren gui lai cho Claude.
pause
