# Horizon install - use install.cmd if this fails
# Run: cmd /c deploy\install.cmd

$ErrorActionPreference = "SilentlyContinue"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "=== Horizon Install ===" -ForegroundColor Cyan
Write-Host ("Project dir: " + (Get-Location)) -ForegroundColor Gray

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "Python not found. Run install-python.ps1 first." -ForegroundColor Red
    exit 1
}

python --version

Write-Host "Running install.cmd..." -ForegroundColor Cyan
cmd /c "deploy\install.cmd"
exit $LASTEXITCODE
