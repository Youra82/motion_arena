@echo off
chcp 65001 >nul
title Motion Arena - Start
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\start.ps1" %*
echo.
pause
