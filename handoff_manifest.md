# dotdotdust Handoff Manifest (Internal Sync)

## 🎯 Project Vision
dotdotdust is a "Dust Sweeper" for the Polkadot ecosystem. It allows users to batch-teleport small, unusable balances (Dust) from various Parachains (Astar, Hydration, Moonbeam) to **Westend Asset Hub**, where a **Revive (Solidity/RISC-V)** smart contract swaps them into DOT via an Omnipool-Relayer mechanism.

---

## 🏗️ Technical Architecture

### 1. The Frontend (`/frontend`)
- **Stack**: Next.js (App Router), Framer Motion (Visuals), Polkadot.js API.
- **Identity**: Supports Dual-Mode (Sim vs Real). 
    - **Sim Mode**: Overrides signing with `//Alice` dev key for local XCM testing but uses the **User's Extension Address** for balance scanning.
- **XCM Logic**: Implemented in `chain-service.ts`. 
    - **CRITICAL**: Modern runtimes (Astar/Hydra) reject `Unlimited` weight. We use explicit `Limited` weight (`refTime: 5Bn`, `proofSize: 200k`).

### 2. The Simulation Cluster (`/simulation`)
- **Stack**: Chopsticks (Forked Runtimes).
- **isolated Env**: Simulation has its own `package.json` and `node_modules` to prevent `@polkadot/api` version clashing with the frontend.
- **Orchestration**: `start-orchestra.js` links Polkadot Relay, Asset Hub, Astar, and Hydration into a single cross-chain fabric.

### 3. The Relayer (`/relayer`)
- **Role**: Watches the Westend Asset Hub (Revive) contract.
- **Flow**: User Teleports -> Relayer detects Inbound -> Relayer triggers `Sweeper.sol` on contract chain.

---

## ⚡ The "One-Click" Stability Package
To prevent "retracing steps," always start the project using:
`c:\Users\jromb\VibeCoded Projects\dotdotdust\dotdotdust_start.ps1`

### Script Contents (Reference):
```powershell
# Unifies Startup: Cleanup -> Orchestra -> Mint -> Frontend
Write-Host "🧹 CLEANUP: Terminating Zombie Nodes..."
# [Force-kills node processes on ports 8000-8003 & 3000]
Write-Host "🎻 STARTING: One Block Orchestra..."
Start-Process node "start-orchestra.js"
Write-Host "🪙 MINTING: Loading 1000 DOT/ASTR to User..."
node mint.js <USER_ADDR>
Write-Host "🚀 LAUNCHING: Frontend..."
npm run dev
```

---

## ✅ Current Status: "Simulation Ready"
- **Astar Path**: 100% Verified. XCM constructed, signed by wallet extension, and assets drained from Astar local fork.
- **Hydration Path**: 100% Logic implemented. `exhaustsResources` error fixed via `Limited` weight strategy.
- **Relay (DOT) Path**: Logic implemented. Verified in script, requires final UI click validation.
- **Launch Readiness**: See `launch_readiness.md` for the 20-day sprint plan leading to the Jan 20th Revive launch.

---

## ⚠️ Known Issues / Troubleshooting
1. **"Gate Locked"**: Usually a `dust-logic.ts` fee miscalculation (Astar fees are in ASTR, but logic often compares against DOT). Fix: Passed `0.04` fee override.
2. **"Exhausts Resources"**: XCM Weight limit is too low. Always check `chain-service.ts` for `Limited` weight flags.
3. **Ghost Balances**: If tokens don't appear, run `node mint.js` in the simulation folder.

---

## 🚀 Handoff Instructions for New Agent
1. **Startup**: Run `dotdotdust_start.ps1`.
2. **Identity**: Do not force "Alice" in the frontend logic; the current code respects the user's connected wallet while using sim-signing.
3. **Next Task**: Focus on "Phase 8: UX Redesign" (Frosted Glass / Software for Sovereignty aesthetics) until the Jan 20th smart contract live-date.
