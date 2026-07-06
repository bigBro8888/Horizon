@echo off
chcp 65001 >nul
cd /d "%~dp0\.."

echo === Horizon Install ===
python --version
if errorlevel 1 (
    echo Python not found. Run deploy\install-python.ps1 first.
    pause
    exit /b 1
)

echo Installing uv...
python -m pip install -U uv pip
if errorlevel 1 exit /b 1

echo Installing dependencies...
python -m uv sync
if errorlevel 1 exit /b 1

if not exist .env copy .env.example .env
if not exist data\config.json copy data\config.example.json data\config.json

echo.
echo === Install Done ===
echo Next: deploy\start-background.ps1
pause
