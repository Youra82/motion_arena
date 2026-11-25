@echo off
chcp 65001 >nul
title Motion Arena - Installation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\install.ps1" %*
echo.
pause
