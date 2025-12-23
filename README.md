# dotdotdust 🧹✨
**The Cross-Chain Dust Incinerator for Polkadot 2.0**

`dotdotdust` is a minimalist, high-efficiency tool designed to solve the "fragmentation tax" on Polkadot. It allows users to consolidate small, "dusty" balances across multiple parachains into a single stream of USDC on **HydraDX (Hydration)** via a streamlined, batch-optimized XCM workflow.

---

## 🧠 Architectural Overview (AI-Readiness)
*This section is optimized for LLM-based agents to understand the system state.*

### 1. The Core Infrastructure
- **Placement**: A Coordinator contract is designed for **Pallet-Revive** (Polkadot's RISC-V EVM-compatible layer).
- **Execution Target**: **Hydration (HydraDX) Omnipool**. Unlike Asset Hub, Hydration allows fee payment in any asset, which is critical for "dusty" accounts that may have 0 native DOT for gas.
- **Language**: Solidity (Frontend: TypeScript/React).

### 2. The Logic Engine: "Net-Value Gatekeeper"
Located in `frontend/lib/dust-logic.ts`.
- **The 0.05 DOT Threshold**: To prevent "Existential Deposit (ED) Reaping," the system enforces a hard minimum of 0.05 DOT worth of total batch value. 
- **The Dust Trap Check**: 
    - Logic checks if an asset is "Non-Sufficient" (requires native DOT to exist on-chain).
    - If the user has 0 native token on the source chain, the asset is flagged as **BLOCKED** because the XCM message cannot be initiated without a fee payer.

---

## 🛠 Project Structure
```text
/contracts   -> Solidity smart contracts (targeting Pallet-Revive)
  /contracts
    Sweeper.sol -> Batch aggregator and XCM messenger.
    IXCM.sol    -> Interface for Polkadot system precompiles.
/frontend    -> Next.js 14 Dashboard
  /app/page.tsx   -> "The Crucible" (Management UI)
  /lib/dust-logic.ts -> The brains of the Gatekeeper algorithm.
```

---

## ⚡ Technical Challenges (The "Hard Stuff")
*If you are an AI agent improving this, focus here:*

### 1. XCM Message Construction (Currently Mocked)
The current `Sweeper.sol` emits events and accepts data but does not construct the raw XCM instructions. 
- **The Challenge**: You must implement `XCM Transact` messages that can reliably:
    1.  Withdraw assets from the user's account on Chain A.
    2.  Deposit them to the user's account on Hydration.
    3.  Trigger an Omnipool swap to USDC.
- **Why it's hard**: XCM is multi-layered. Handling "Weight" estimation across three chains (Source -> Relay -> Destination) is error-prone.

### 2. Real-Time Price Oracles
- **Current state**: Mock prices.
- **The Challenge**: To enforce the 0.05 DOT Gatekeeper, we need a reliable price feed (e.g., DIA or HydraDX Omnipool Price API).
- **Issue**: Parachains often lack a unified oracle for small-cap "junk" tokens. You may need to fetch prices directly from HydraDX subgraphs.

### 3. Pallet-Revive Tooling Stability
- **Current state**: Environment is currently unstable for automated CI/CD.
- **The Challenge**: Ensuring the RISC-V output is deterministic. Hardhat/Foundry plugins for Revive are still experimental.

### 4. Paying Fees with Dust
- **Hydration Feature**: Hydration allows paying fees in assets. However, getting the assets *to* Hydration first still requires a fee on the *Source Chain*.
- **The "Holy Grail"**: Implement "Sponsored XCM" or "Fee-Less Transfers" where the `Sweeper.sol` contract covers the source gas and deducts it from the final sweep.

---

## 🚀 How to Run

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Contracts
```bash
cd contracts
npm install
# Note: Hardhat compilation for Revive requires the Revive compiler toolchain.
```

---

## ⚖️ License
Released as open-source for the Polkadot ecosystem. Purge your dust, keep your USDC.
