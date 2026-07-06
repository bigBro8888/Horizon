# Install Python 3.12 on Windows Server (run as Administrator)
# .\deploy\install-python.ps1

$ErrorActionPreference = "Stop"

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    $ver = python -c "import sys; print('%s.%s' % (sys.version_info.major, sys.version_info.minor))"
    Write-Host ("Python already installed: " + $ver) -ForegroundColor Green
    exit 0
}

$version = "3.12.10"
$arch = "amd64"
$installerName = "python-" + $version + "-" + $arch + ".exe"
$downloadUrl = "https://www.python.org/ftp/python/" + $version + "/" + $installerName
$tempDir = $env:TEMP
$installerPath = Join-Path $tempDir $installerName

Write-Host ("Downloading Python " + $version + "...") -ForegroundColor Cyan
Write-Host $downloadUrl -ForegroundColor Gray

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing

Write-Host "Installing Python (silent, add to PATH)..." -ForegroundColor Cyan
$installArgs = @(
    "/quiet",
    "InstallAllUsers=1",
    "PrependPath=1",
    "Include_test=0",
    "Include_pip=1"
)
$proc = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru

if ($proc.ExitCode -ne 0) {
    Write-Host ("Installer exit code: " + $proc.ExitCode) -ForegroundColor Red
    exit 1
}

$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$newPath = $machinePath + ";" + $userPath
$env:Path = $newPath

Start-Sleep -Seconds 2

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $defaultPython = "C:\Program Files\Python312\python.exe"
    if (Test-Path $defaultPython) {
        $env:Path = "C:\Program Files\Python312;C:\Program Files\Python312\Scripts;" + $env:Path
    }
}

python --version
Write-Host "Python installed. Close and reopen PowerShell, then run:" -ForegroundColor Green
Write-Host "  cd `"C:\hot news`"" -ForegroundColor White
Write-Host "  .\deploy\install.ps1" -ForegroundColor White
