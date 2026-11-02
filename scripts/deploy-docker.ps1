# ============================================================
# DSE-ME Simulator — Docker Deployment & Test Script (PowerShell)
# ============================================================

param (
    [switch]$Standalone,
    [switch]$BuildOnly,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"

if ($Stop) {
    Write-Host "Stopping DSE-ME Simulator containers..." -ForegroundColor Yellow
    if (Test-Path "docker-compose.standalone.yml") {
        docker compose -f docker-compose.standalone.yml down
    }
    docker compose down
    Write-Host "Containers stopped successfully." -ForegroundColor Green
    exit 0
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  DSE-ME Simulator — Docker Deployment & Launch" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Ensure .env exists
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
}

# Determine compose file
$composeFile = "docker-compose.yml"
if ($Standalone) {
    $composeFile = "docker-compose.standalone.yml"
    Write-Host "Operating in Standalone Mode (No external MySQL requirement)" -ForegroundColor Yellow
} else {
    Write-Host "Operating in Full Mode (App + MySQL)" -ForegroundColor Yellow
}

Write-Host "`n1. Building Docker container image..." -ForegroundColor Green
docker compose -f $composeFile build

if ($BuildOnly) {
    Write-Host "Build complete. (BuildOnly specified)" -ForegroundColor Green
    exit 0
}

Write-Host "`n2. Starting containers..." -ForegroundColor Green
docker compose -f $composeFile up -d

Write-Host "`n3. Waiting for simulator health check..." -ForegroundColor Green
Start-Sleep -Seconds 3

Write-Host "`nContainer Status:" -ForegroundColor Cyan
docker compose -f $composeFile ps

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  DSE-ME Simulator is RUNNING!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  • FIX TCP Port       : 9876 (Exposed to OMS clients)" -ForegroundColor White
Write-Host "  • Web Dashboard & UI : http://localhost:3000 (or http://localhost:3001)" -ForegroundColor White
Write-Host "  • Health Endpoint    : http://localhost:3000/health" -ForegroundColor White
Write-Host "  • FIX Session CompIDs: Sender: DSESIM | Target: OMSFIRM" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
Write-Host "`nTo test FIX communication immediately, run:" -ForegroundColor Yellow
Write-Host "  node scripts/test-fix-client.js`n" -ForegroundColor White
Write-Host "To view real-time logs:" -ForegroundColor Yellow
Write-Host "  docker compose -f $composeFile logs -f app`n" -ForegroundColor White

