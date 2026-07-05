@echo off
REM ============================================
REM   Stock_Pro Stop dev server
REM   Double-click to kill all next dev processes
REM ============================================

setlocal

echo.
echo Stopping Stock_Pro dev server...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$procs = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*next*dev*' -or $_.CommandLine -like '*stock-pro*' }; if ($procs) { foreach ($p in $procs) { Write-Host ('  Stop PID ' + $p.ProcessId) -ForegroundColor Yellow; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } } else { Write-Host '  (no next dev process found)' -ForegroundColor Gray }"

echo.
echo Done. You can close this window.
timeout /t 3 /nobreak >nul
endlocal