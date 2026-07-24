# Bowen Navigator - Full Setup Script
# Run from project root:  powershell -ExecutionPolicy Bypass -File .\setup.ps1

param()
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=== Bowen Navigator Setup ===" -ForegroundColor Cyan

# 1. Start Docker Compose
Write-Host ""
Write-Host "[1/3] Starting PostGIS, pgAdmin, and Django Backend via Docker Compose..." -ForegroundColor Yellow
docker compose -f "$ProjectRoot\docker-compose.yml" up --build -d
Write-Host "Waiting 20 seconds for the database and backend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 20

# 2. Seed campus data
Write-Host ""
Write-Host "[2/3] Seeding campus data..." -ForegroundColor Yellow
docker compose -f "$ProjectRoot\docker-compose.yml" exec backend python manage.py seed_campus

# 3. npm install
Write-Host ""
Write-Host "[3/3] Installing mobile (npm) dependencies..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\mobile"
npm install
Pop-Location

Write-Host ""
Write-Host "Done! The backend is already running on port 8000 via Docker." -ForegroundColor Green
Write-Host "To start the mobile app, run in a terminal:" -ForegroundColor White
Write-Host "  cd mobile" -ForegroundColor White
Write-Host "  npx expo start" -ForegroundColor White
Write-Host ""
Write-Host "Default student login - matric: BU22CSC1136" -ForegroundColor Gray
Write-Host "Default admin   login - matric: ADMIN001" -ForegroundColor Gray
Write-Host ""
