# Bowen Navigator - Full Setup Script
# Run from project root:  powershell -ExecutionPolicy Bypass -File .\setup.ps1

param()
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=== Bowen Navigator Setup ===" -ForegroundColor Cyan

# 1. Start PostGIS
Write-Host ""
Write-Host "[1/5] Starting PostGIS + pgAdmin via Docker Compose..." -ForegroundColor Yellow
docker compose -f "$ProjectRoot\docker-compose.yml" up -d db pgadmin
Write-Host "Waiting 10 s for Postgres to be ready..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# 2. Python dependencies
Write-Host ""
Write-Host "[2/5] Installing Python dependencies..." -ForegroundColor Yellow
$pip    = "$ProjectRoot\backend\.venv\Scripts\pip.exe"
$python = "$ProjectRoot\backend\.venv\Scripts\python.exe"
$venvOk = Test-Path $pip
if (-not $venvOk) {
    Write-Host "No .venv found - creating one..." -ForegroundColor Gray
    python -m venv "$ProjectRoot\backend\.venv"
}
& $pip install -r "$ProjectRoot\backend\requirements.txt"

# 3. Django migrations
Write-Host ""
Write-Host "[3/5] Running Django migrations..." -ForegroundColor Yellow
& $python "$ProjectRoot\backend\manage.py" migrate

# 4. Seed campus data
Write-Host ""
Write-Host "[4/5] Seeding campus data..." -ForegroundColor Yellow
& $python "$ProjectRoot\backend\manage.py" seed_campus

# 5. npm install
Write-Host ""
Write-Host "[5/5] Installing mobile (npm) dependencies..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\mobile"
npm install
Pop-Location

Write-Host ""
Write-Host "Done! Start the servers in two separate terminals:" -ForegroundColor Green
Write-Host "  Backend : cd backend  ; .venv\Scripts\python manage.py runserver 0.0.0.0:8000" -ForegroundColor White
Write-Host "  Mobile  : cd mobile   ; npx expo start" -ForegroundColor White
Write-Host ""
Write-Host "Default student login - matric: BU22CSC1136" -ForegroundColor Gray
Write-Host "Default admin   login - matric: ADMIN001" -ForegroundColor Gray
Write-Host ""
