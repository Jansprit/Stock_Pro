@echo off
REM ============================================
REM   Stock_Pro Quick Start (background mode)
REM   Double-click this file to start dev server.
REM ============================================

setlocal

REM change to script directory (works in cmd and from Explorer double-click)
pushd "%~dp0"

if not exist "logs" mkdir logs

REM kill any leftover server on port 3000
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000"') do (
    taskkill /F /PID %%P >nul 2>&1
)

echo Starting Stock_Pro dev server...
start /B "" cmd /c "npm run dev > logs\dev.log 2>&1"

REM poll for server ready (up to 90 seconds)
set "PORT="
for /L %%A in (1,1,90) do (
    for /L %%P in (3000,1,3010) do (
        netstat -ano | findstr "LISTENING" | findstr /R /C:":%%P " >nul 2>&1
        if not errorlevel 1 if not defined PORT set "PORT=%%P"
    )
    if defined PORT goto :ready
    ping -n 2 127.0.0.1 >nul 2>&1
)

echo.
echo [ERROR] Server failed to start within 90 seconds.
echo Check logs\dev.log for details.
goto :end

:ready
echo.
echo ============================================
echo  Stock_Pro is running
echo  Open browser: http://localhost:%PORT%/
echo ============================================
echo  Stop: double-click stop.bat
echo  Logs: logs\dev.log
echo.
start "" "http://localhost:%PORT%/"

:end
REM keep window open so user can see the message
ping -n 11 127.0.0.1 >nul 2>&1
popd
endlocal
