@echo off
REM ============================================
REM   Stock_Pro Quick Start (background mode)
REM   Double-click this file to start dev server.
REM   It will open browser automatically.
REM ============================================

setlocal
cd /d "%~dp0"

REM --- Ensure .env.local exists ---
if not exist ".env.local" (
    if exist ".env.local.example" (
        copy /Y ".env.local.example" ".env.local" >nul
        echo [INFO] Created .env.local from template.
        echo        Please edit .env.local to fill your API keys.
        echo.
    )
)

REM --- Create logs directory ---
if not exist "logs" mkdir logs

REM --- Start npm run dev in background ---
echo Starting Stock_Pro dev server (background mode)...
start /B "" cmd /c "npm run dev > logs\dev.log 2>&1"

REM --- Wait for Next.js to boot ---
timeout /t 3 /nobreak >nul

REM --- Detect actual bound port (3000~3010) ---
set "PORT="
for /L %%P in (3000,1,3010) do (
    netstat -ano | findstr /C:":%%P " | findstr /C:"LISTENING" >nul 2>&1
    if not errorlevel 1 if not defined PORT set "PORT=%%P"
)

if defined PORT (
    echo.
    echo ============================================
    echo   Stock_Pro is running in background
    echo   Browser: http://localhost:%PORT%/
    echo.
    echo   Stop: double-click stop.bat
    echo   Logs: logs\dev.log
    echo ============================================
    echo.
    start "" "http://localhost:%PORT%/"
) else (
    echo.
    echo   [WARN] dev server not detected yet.
    echo   Wait 10 seconds, then open http://localhost:3000/
    echo   If still failing, check logs\dev.log
    echo.
)

timeout /t 5 /nobreak >nul
endlocal