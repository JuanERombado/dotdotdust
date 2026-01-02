<#
    .SYNOPSIS
    Unifies the dotdotdust Simulation Startup (Orchestra -> Mint -> Frontend).

    .DESCRIPTION
    1. Kills any zombie node processes on ports 8000-8003 & 3000.
    2. Starts the Simulation Orchestra in a new window.
    3. Waits for the Orchestra to be ready (Port 8000 listening).
    4. Mints 1000 DOT/ASTR/HDX to the user's wallet.
    5. Starts the Frontend in the current window.
#>

$ErrorActionPreference = "Stop"
$UserAddress = "15mYuEYUYN2vMuuQndfxDvnKGVBhN57J3aLmQJTRdFEqxU9P"

Write-Host "🧹 CLEANUP: Terminating Zombie Processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match "Orchestra" } | Stop-Process -Force
# Kill port 3000 holder if exists
$Port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($Port3000) { Stop-Process -Id $Port3000.OwningProcess -Force }
Start-Sleep -Seconds 2

Write-Host "🎻 STARTING: One Block Orchestra..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot/simulation"
# Launch Orchestra in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node --no-warnings start-orchestra.js"

Write-Host "⏳ WAITING: Connectivity Check (Port 8000)..." -ForegroundColor Magenta
$Retries = 0
while ($Retries -lt 30) {
    $conn = Test-NetConnection -ComputerName localhost -Port 8000 -WarningAction SilentlyContinue
    if ($conn.TcpTestSucceeded) {
        Write-Host "✅ ORCHESTRA ONLINE!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $Retries++
    Write-Host -NoNewline "."
}

if (-not $conn.TcpTestSucceeded) {
    Write-Error "❌ Orchestra failed to start on Port 8000."
    exit 1
}

Write-Host "`n🪙 MINTING: Loading Wallet with Tokens..." -ForegroundColor Cyan
node mint.js $UserAddress

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ WALLET FUNDED!" -ForegroundColor Green
} else {
    Write-Warning "⚠️ Minting failed. Detailed logs in Orchestra window."
}

Write-Host "🚀 LAUNCHING: Frontend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot/frontend"
npm run dev
