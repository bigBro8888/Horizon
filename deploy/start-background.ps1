# Start Horizon in background
# .\deploy\start-background.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$logDir = Join-Path (Get-Location) "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "horizon-web.log"

$connections = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($conn in $connections) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

$horizonWeb = Join-Path (Get-Location) ".venv\Scripts\horizon-web.exe"
if (-not (Test-Path $horizonWeb)) {
    Write-Host "horizon-web not found. Run .\deploy\install.ps1 first." -ForegroundColor Red
    exit 1
}

Start-Process -FilePath $horizonWeb `
    -ArgumentList @("--host", "0.0.0.0", "--port", "8765") `
    -WorkingDirectory (Get-Location) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $logFile

Start-Sleep -Seconds 3

try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8765/" -UseBasicParsing -TimeoutSec 5
    if ($resp.StatusCode -eq 200) {
        Write-Host "Horizon started in background." -ForegroundColor Green
        Write-Host ("Log: " + $logFile) -ForegroundColor Gray
        Write-Host "Visit: http://122.51.11.27:8765/" -ForegroundColor Cyan
    }
} catch {
    Write-Host ("Start failed. Check log: " + $logFile) -ForegroundColor Red
}
