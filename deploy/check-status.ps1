# Check if Horizon is running
# .\deploy\check-status.ps1

Write-Host "=== Horizon Status ===" -ForegroundColor Cyan

$conn = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "Port 8765: LISTENING" -ForegroundColor Green
    foreach ($c in $conn) {
        $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        Write-Host ("  PID " + $c.OwningProcess + " -> " + $proc.ProcessName) -ForegroundColor Gray
    }
} else {
    Write-Host "Port 8765: NOT listening (service not started)" -ForegroundColor Red
}

try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8765/" -UseBasicParsing -TimeoutSec 5
    Write-Host ("HTTP local test: OK (" + $r.StatusCode + ")") -ForegroundColor Green
} catch {
    Write-Host ("HTTP local test: FAILED - " + $_.Exception.Message) -ForegroundColor Red
}

$logFile = Join-Path (Join-Path $PSScriptRoot "..") "logs\horizon-web.log"
if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "Last 10 lines of log:" -ForegroundColor Cyan
    Get-Content $logFile -Tail 10
}
