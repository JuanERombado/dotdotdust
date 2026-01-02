# orchestra.ps1
# Runs 4 parallel Chopsticks instances to simulate the full dotdotdust ecosystem.

Write-Host "The One Block Orchestra is starting..." -ForegroundColor Cyan

$Chains = @(
    @{ Name="Polkadot";   Port=8000; Config="dot.json" },
    @{ Name="Astar";      Port=8001; Config="astar.json" },
    @{ Name="Hydration";  Port=8002; Config="hydra.json" },
    @{ Name="AssetHub";   Port=8003; Config="assethub.json" }
)
$SimDir = $PSScriptRoot

$ChopsticksEntry = Join-Path $SimDir "node_modules/@acala-network/chopsticks/dist/cjs/cli.js"

# Launch the unified linked cluster
$Launcher = Join-Path $SimDir "start-orchestra.js"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node --no-warnings '$Launcher'"

Write-Host "The Connected Orchestra is tuning up. Check the new window for XCM logs." -ForegroundColor Yellow
Write-Host "Ports: 8000 (DOT), 8001 (ASTAR), 8002 (HDX), 8003 (AH)" -ForegroundColor Gray
