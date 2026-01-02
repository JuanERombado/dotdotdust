# sim-verify.ps1
# Checks if the Sweeper contract has received the forked assets on local Asset Hub.

param (
    [Parameter(Mandatory=$false)]
    [string]$TargetAddress = "0x6Ce61B60FF9c73e7D233221c2feFA501228c1dF2" # Sweeper.sol address
)

Write-Host "Verifying Asset arrival on Simulated Asset Hub (Port 8003)..." -ForegroundColor Cyan

# We use Substrate-style AccountId20 for the Ethereum-compatible address
# On Asset Hub, EVM addresses are represented this way in the assets pallet.

Write-Host "Querying ASTR (Asset 1999) balance for $TargetAddress..."
npx -y --package @acala-network/chopsticks@latest chopsticks dev get-balance -p 8003 $TargetAddress 1999

Write-Host "Querying DOT (Native) balance for $TargetAddress..."
npx -y --package @acala-network/chopsticks@latest chopsticks dev get-balance -p 8003 $TargetAddress

Write-Host "`nIf balances are > 0, the XCM Teleport was SUCCESSFUL!" -ForegroundColor Green
