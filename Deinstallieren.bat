@echo off
chcp 65001 >nul
title Motion Arena - Deinstallation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\uninstall.ps1" %*
echo.
pause
