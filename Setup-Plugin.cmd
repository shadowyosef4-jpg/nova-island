@echo off
title Nova Island Plugin & Feature Installer
echo ============================================================
echo   Nova Island Custom Plugin & WiFi/FTP Share Setup
echo ============================================================
echo.
echo Installing custom modules and patching project...
echo.

node install-plugin.js "%~dp0."

echo.
echo ============================================================
echo   Installation Finished!
echo ============================================================
pause

