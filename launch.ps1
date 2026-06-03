# LSWOO Setup and Launch Script
# Automates the entire local stack setup and starts the server on http://localhost:8080.
# Requirements: Node.js (LTS) and Docker Desktop installed and running.

$ErrorActionPreference = "Stop"
$DOCKER_DB_URL = 'postgresql://lswoo:lswoo@localhost:5432/lswoo?schema=public'

# 1. Handle .env file creation
if (-not (Test-Path ".env")) {
    Write-Host "[Env] Creating .env from .env.local.example..." -ForegroundColor Yellow
    if (Test-Path ".env.local.example") {
        Copy-Item ".env.local.example" ".env"
        Write-Host "[Env] .env file created successfully." -ForegroundColor Green
    } else {
        Write-Host "[Env] Error: .env.local.example not found." -ForegroundColor Red
        Read-Host "Press Enter to exit..."
        Exit 1
    }
}

# 2. Force DATABASE_URL to point to the local Docker container (port 5432)
#    This ensures the script works even if the existing .env points to Cloud SQL.
Write-Host "[Env] Pinning DATABASE_URL to local Docker database..." -ForegroundColor Cyan
$envContent = Get-Content ".env" -Raw
if ($envContent -match 'DATABASE_URL=.*') {
    $envContent = $envContent -replace 'DATABASE_URL=.*', "DATABASE_URL=`"$DOCKER_DB_URL`""
} else {
    $envContent += "`nDATABASE_URL=`"$DOCKER_DB_URL`""
}
Set-Content ".env" $envContent -Encoding UTF8
Write-Host "[Env] DATABASE_URL updated." -ForegroundColor Green

# 3. Check if Docker is running
Write-Host "[Docker] Verifying Docker Desktop is running..." -ForegroundColor Cyan
& docker info >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[Docker] Error: Docker is not running. Please launch Docker Desktop and try again." -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    Exit 1
}

# 4. Spin up Docker Containers (Postgres + Redis)
Write-Host "[Docker] Starting database and cache services..." -ForegroundColor Cyan
docker compose -f docker-compose.dev.yml up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "[Docker] Error: Failed to start containers." -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    Exit 1
}

# Give Postgres a moment to finish initialising before connecting
Write-Host "[Docker] Waiting for database to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 4

# 5. Install Root dependencies if missing
if (-not (Test-Path "node_modules")) {
    Write-Host "[Dependencies] Installing root packages (this may take a minute)..." -ForegroundColor Cyan
    npm install
}

# 6. Push Prisma schema and generate client
Write-Host "[Database] Creating tables and generating Prisma client..." -ForegroundColor Cyan
npx prisma db push --accept-data-loss
if ($LASTEXITCODE -ne 0) {
    Write-Host "[Database] Error: Could not sync database schema. Is Docker running?" -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    Exit 1
}
npx prisma generate

# 7. Seed database (writes Lightspeed credentials)
Write-Host "[Database] Seeding Lightspeed credentials..." -ForegroundColor Cyan
npm run seed

# 8. Install Frontend packages if missing
if (-not (Test-Path "frontend/node_modules")) {
    Write-Host "[Frontend] Installing frontend packages..." -ForegroundColor Cyan
    Set-Location frontend
    npm install
    Set-Location ..
}

# 9. Build the frontend if not already built
if (-not (Test-Path "frontend/dist")) {
    Write-Host "[Frontend] Building frontend..." -ForegroundColor Cyan
    Set-Location frontend
    npm run build
    Set-Location ..
}

# 10. Launch the server
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  App running at: http://localhost:8080/admin" -ForegroundColor Green
Write-Host '  Password:       ShopaholicTT$ho3' -ForegroundColor Green
Write-Host "  First time?     Click [Link Lightspeed Token] on the dashboard." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""

# Open default browser to the admin dashboard
Start-Process "http://localhost:8080/admin"

npm run dev

