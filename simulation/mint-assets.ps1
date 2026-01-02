# mint-assets.ps1
# Sets balances for a specific address on the local simulation forks.

param (
    [Parameter(Mandatory=$true)]
    [string]$Address
)

$env:NODE_PATH = ""
$env:npm_config_prefix = ""

Write-Host "Minting assets for $Address on local forks..." -ForegroundColor Cyan

# 1. Mint ASTR on Astar (Port 8001)
Write-Host "Minting 50 ASTR on Astar (Port 8001)..."
npx -y --package @acala-network/chopsticks@latest chopsticks dev set-balance -p 8001 $Address 50000000000000000000

# 2. Mint HDX on Hydration (Port 8002)
Write-Host "Minting 100 HDX on Hydration (Port 8002)..."
npx -y --package @acala-network/chopsticks@latest chopsticks dev set-balance -p 8002 $Address 100000000000

# 3. Mint DOT on Polkadot (Port 8000)
Write-Host "Minting 10 DOT on Polkadot (Port 8000)..."
npx -y --package @acala-network/chopsticks@latest chopsticks dev set-balance -p 8000 $Address 100000000000

Write-Host "`nAssets Minted! Now refresh the dashboard at http://localhost:3000" -ForegroundColor Green
Write-Host "Ensure SIM MODE is ACTIVE in the header." -ForegroundColor Yellow
