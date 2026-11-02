@echo off
chcp 65001 >nul
echo ========================================================
echo   Al-Warda - Manual Qogita Sync & Upscayl Pipeline
echo ========================================================
cd /d "%~dp0\.."
python scripts\qogita_weekly_sync_upscayl.py --limit 30
echo.
echo Sync completed. Press any key to exit...
pause >nul
