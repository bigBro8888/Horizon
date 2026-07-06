@echo off
chcp 65001 >nul
cd /d "%~dp0\.."

set "PYCMD=python"
if exist "C:\Program Files\Python312\python.exe" set "PYCMD=C:\Program Files\Python312\python.exe"
if exist ".venv\Scripts\horizon-web.exe" goto :start

echo ERROR: Run deploy\install.cmd first
pause
exit /b 1

:start
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

if not exist logs mkdir logs

echo Stopping old process on port 8765...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8765 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo Starting Horizon...
start "" /B ".venv\Scripts\horizon-web.exe" --host 0.0.0.0 --port 8765 > logs\horizon-web.log 2>&1

timeout /t 3 /nobreak >nul

echo.
echo Visit: http://122.51.11.27:8765/
echo Log: %CD%\logs\horizon-web.log
echo.
pause
