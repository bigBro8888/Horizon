@echo off
chcp 65001 >nul

echo === Install Python 3.12 ===
echo.

where python >nul 2>&1
if not errorlevel 1 (
    python --version
    echo Python already installed.
    goto :end
)

if exist "C:\Program Files\Python312\python.exe" (
    "C:\Program Files\Python312\python.exe" --version
    echo Python already installed at C:\Program Files\Python312\
    goto :end
)

set "VER=3.12.10"
set "URL=https://www.python.org/ftp/python/%VER%/python-%VER%-amd64.exe"
set "OUT=%TEMP%\python-%VER%-amd64.exe"

echo Downloading Python %VER%...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%URL%' -OutFile '%OUT%'"

if not exist "%OUT%" (
    echo ERROR: Download failed
    goto :end
)

echo Installing Python (add to PATH)...
"%OUT%" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_pip=1

echo.
echo Install finished. IMPORTANT:
echo   1. CLOSE all cmd/PowerShell windows
echo   2. Open a NEW cmd window
echo   3. Run: cd /d "C:\hot news" ^&^& deploy\install.cmd
echo.

:end
echo Press any key to close...
pause >nul
