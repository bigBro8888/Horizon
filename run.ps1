# Horizon 启动脚本 (Windows)
# 用法: .\run.ps1
#       .\run.ps1 -Hours 48

param(
    [int]$Hours = 24
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Windows 终端默认 GBK 编码会导致 emoji 输出报错
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
chcp 65001 | Out-Null

if (-not (Test-Path "data\config.json")) {
    Write-Host "未找到 data\config.json，正在从示例配置创建..." -ForegroundColor Yellow
    Copy-Item "data\config.example.json" "data\config.json"
}

if (-not (Test-Path ".env")) {
    Write-Host "未找到 .env，正在从示例创建..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "请在 .env 中填入至少一个 AI API Key，然后重新运行。" -ForegroundColor Red
    exit 1
}

python -m uv run horizon --hours $Hours
