@echo off
REM Create desktop shortcut for Stock_Pro
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-shortcut.ps1"
pause