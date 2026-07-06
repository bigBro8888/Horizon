@echo off
chcp 65001 >nul
cd /d "%~dp0\.."

echo === Horizon Install ===
echo Project dir: %CD%
echo.

set "PYCMD="
where python >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=python"
    goto :found
)

if exist "C:\Program Files\Python312\python.exe" (
    set "PYCMD=C:\Program Files\Python312\python.exe"
    goto :found
)
if exist "C:\Program Files\Python311\python.exe" (
    set "PYCMD=C:\Program Files\Python311\python.exe"
    goto :found
)

py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=py -3.12"
    goto :found
)

py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=py -3.11"
    goto :found
)

echo ERROR: Python not found in PATH.
echo.
echo Please do ONE of the following:
echo   1. Double-click deploy\install-python.cmd
echo   2. Or install Python 3.12 from python.org and check "Add to PATH"
echo   3. Then CLOSE this window, open a NEW cmd, and run again
echo.
goto :end

:found
echo Using: %PYCMD%
%PYCMD% --version
if errorlevel 1 (
    echo ERROR: Python check failed
    goto :end
)

echo.
echo [1/2] Installing uv...
%PYCMD% -m pip install -U uv pip
if errorlevel 1 (
    echo ERROR: pip install failed
    goto :end
)

echo.
echo [2/2] Installing dependencies (wait 2-5 min)...
%PYCMD% -m uv sync
if errorlevel 1 (
    echo ERROR: uv sync failed
    goto :end
)

if not exist .env copy .env.example .env
if not exist data\config.json copy data\config.example.json data\config.json

echo.
echo === Install Done ===
echo Next:
echo   1. Edit .env - set DASHSCOPE_API_KEY
echo   2. Run deploy\setup-firewall.cmd as Admin
echo   3. Run deploy\start.cmd
echo.

:end
echo.
echo Press any key to close...
pause >nul
