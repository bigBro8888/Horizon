# Horizon 本地 Web 前台启动脚本
# 用法: .\start-web.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
chcp 65001 | Out-Null

Write-Host "正在启动 Horizon 本地前台..." -ForegroundColor Cyan
Write-Host "浏览器将自动打开 http://127.0.0.1:8765/" -ForegroundColor Green
Write-Host "按 Ctrl+C 可停止服务" -ForegroundColor Yellow

python -m uv run horizon-web --open
