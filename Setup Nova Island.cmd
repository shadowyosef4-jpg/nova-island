@echo off
rem Double-click: creates the desktop icon + start-with-Windows entry and starts Nova Island.
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo electron.exe not found. Run "npm install" in this folder first.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "%~dp0." --setup
echo Nova Island is starting. The result is written to setup-log.txt
timeout /t 4 >nul
