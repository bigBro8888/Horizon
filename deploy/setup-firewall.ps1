# Open Windows Firewall port 8765 (run as Administrator)
# .\deploy\setup-firewall.ps1

$ErrorActionPreference = "Stop"
$Port = 8765

$existing = Get-NetFirewallRule -DisplayName "Horizon Web" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Firewall rule already exists." -ForegroundColor Yellow
} else {
    New-NetFirewallRule -DisplayName "Horizon Web" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $Port `
        -Action Allow `
        -Profile Any | Out-Null
    Write-Host ("Opened Windows Firewall TCP port " + $Port) -ForegroundColor Green
}

Write-Host ""
Write-Host "Also open TCP 8765 in Tencent Cloud console -> Firewall" -ForegroundColor Cyan
