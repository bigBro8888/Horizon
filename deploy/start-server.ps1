# Start Horizon web server (foreground, public access)
# .\deploy\start-server.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
chcp 65001 | Out-Null

if (-not (Test-Path ".env")) {
    Write-Host "Missing .env - run .\deploy\install.ps1 first" -ForegroundColor Red
    exit 1
}

Write-Host "Starting Horizon on http://0.0.0.0:8765/" -ForegroundColor Green
python -m uv run horizon-web --host 0.0.0.0 --port 8765
