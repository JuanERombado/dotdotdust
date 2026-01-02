# dotdotdust 🧹

**One-Click Dust Consolidation Across the Polkadot Ecosystem**

dotdotdust is a production-ready cross-chain dust sweeper that consolidates small token balances from 7 Polkadot parachains into DOT on Asset Hub. Built with Polkadot Revive smart contracts and XCM V5.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue)](https://soliditylang.org/)
[![Polkadot](https://img.shields.io/badge/Polkadot-Revive-E6007A)](https://github.com/paritytech/revive)

---

## 🎯 Problem

Users accumulate small, unusable token balances ("dust") across multiple Polkadot parachains. Manually consolidating these requires:
- Multiple cross-chain XCM transactions
- Sufficient gas on each source chain
- Technical knowledge of XCM routing
- Time and mental overhead

**Result:** Millions of dollars locked in dust across the ecosystem.

## 💡 Solution

dotdotdust provides a **one-click solution** to:
1. Scan all your balances across 7 parachains
2. Calculate optimal routing and fees
3. Execute sponsored XCM transactions (optional)
4. Consolidate everything into DOT on Asset Hub
5. Take a modest 5% convenience fee

**Users stay in the Polkadot ecosystem** instead of converting to USDC and leaving.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                           │
│  Next.js Frontend - Multi-Chain Scanner & Fee Calculator    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                  SUPPORTED CHAINS (7)                        │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Polkadot    │  Astar       │  Hydration   │  Moonbeam     │
│  Acala       │  Bifrost     │  Interlay    │               │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────┘
       │              │              │                │
       └──────────────┴──────────────┴────────────────┘
                      │ XCM Teleport/Reserve Transfer
                      ▼
┌─────────────────────────────────────────────────────────────┐
│            ASSET HUB (Polkadot Parachain 1000)              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  SWEEPER SMART CONTRACT (Revive - Solidity)        │    │
│  │                                                      │    │
│  │  • Receives assets from all chains                  │    │
│  │  • Validates batch value (min 0.05 DOT)            │    │
│  │  • Deducts 5% commission                           │    │
│  │  • Sends consolidated DOT to user                  │    │
│  │                                                      │    │
│  │  Security:                                          │    │
│  │  ✓ Ownable (OpenZeppelin)                          │    │
│  │  ✓ ReentrancyGuard                                 │    │
│  │  ✓ onlyRelayer modifier                            │    │
│  │  ✓ onlyEthDerived (prevents unmapped accounts)     │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  OFF-CHAIN RELAYER                           │
│  Node.js Express Server - Sponsored Meta-Transactions       │
│                                                              │
│  • Signature verification (EIP-191)                         │
│  • Rate limiting (10 req/min/IP)                            │
│  • Idempotency protection                                   │
│  • Nonce management + transaction queue                     │
│  • Winston logging + PM2 auto-restart                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Features

### V1.0 (Current)
- ✅ **7-Chain Support**: Polkadot, Astar, Hydration, Moonbeam, Acala, Bifrost, Interlay
- ✅ **DOT Consolidation**: Keep users in the Polkadot ecosystem
- ✅ **Tiered Routing**: Automatic detection of direct vs multi-hop XCM paths
- ✅ **Smart Fee Calculation**:
  - Minimum batch value: 0.05 DOT
  - 5% commission on net value
  - Multi-hop fee complexity (Tier 2: 2.5x multiplier)
  - 20% safety buffer for weight volatility
- ✅ **Sponsored Transactions**: Optional gas-free sweeps via relayer
- ✅ **Production Security**:
  - Rate limiting + input validation
  - Request deduplication (idempotency)
  - Signature verification
  - Access control (Ownable, onlyRelayer)
  - Reentrancy protection
- ✅ **18-Decimal DOT Conversion**: Proper handling of Revive's EVM 18-decimal standard

### Roadmap
- 🔄 **V1.1**: Add USDC swap via Hydration Omnipool (optional output)
- 🔄 **V1.2**: Support 15+ parachains (Zeitgeist, Phala, Nodle, etc.)
- 🔄 **V1.3**: NFT dust consolidation
- 🔄 **V2.0**: Automated recurring sweeps + portfolio rebalancing

---

## 📦 Repository Structure

```
dotdotdust/
├── contracts/              # Solidity smart contracts (Revive)
│   ├── contracts/
│   │   ├── Sweeper.sol    # Main contract (400 lines)
│   │   └── IXCM.sol       # XCM precompile interface
│   ├── test/              # Comprehensive test suite (100+ tests)
│   └── scripts/           # Deployment scripts
│
├── frontend/              # Next.js user interface
│   ├── app/               # App router pages
│   ├── components/        # React components
│   └── lib/
│       ├── chain-service.ts    # 7-chain scanner + price oracle
│       └── dust-logic.ts       # Fee calculator + routing logic
│
├── relayer/               # Off-chain meta-transaction relayer
│   ├── index.ts           # Express server (600+ lines)
│   ├── ecosystem.config.js    # PM2 configuration
│   └── tsconfig.json
│
├── simulation/            # Chopsticks local testing
│   ├── orchestra.ts       # Multi-chain simulation orchestrator
│   └── *.json             # Chain configs (Polkadot, Astar, Hydration, etc.)
│
├── XCM_TESTING_GUIDE.md   # Testnet verification checklist
├── JOURNEY.md             # In-depth project story, lessons learned
└── handoff_manifest.md    # Technical handoff documentation
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contracts** | Solidity 0.8.24 (Polkadot Revive / RISC-V) |
| **Frontend** | Next.js 16, TypeScript, Tailwind CSS |
| **Blockchain API** | Polkadot.js API 14.0.1 |
| **Relayer** | Node.js 20, Express 5, Ethers.js 6 |
| **Testing** | Hardhat, Chai, Chopsticks (fork testing) |
| **Security** | OpenZeppelin, express-rate-limit, Winston logging |
| **Deployment** | PM2, Nginx, Vercel (frontend), VPS (relayer) |

---

## 🏃 Quick Start

### Prerequisites
- Node.js 20+
- npm or yarn
- Polkadot wallet with Substrate/EVM support

### 1. Clone Repository
```bash
git clone https://github.com/JuanERombado/dotdotdust.git
cd dotdotdust
```

### 2. Install Dependencies
```bash
# Smart contracts
cd contracts && npm install --legacy-peer-deps

# Frontend
cd ../frontend && npm install

# Relayer
cd ../relayer && npm install --legacy-peer-deps
```

### 3. Configure Environment
```bash
# contracts/.env
PRIVATE_KEY=your_private_key_here

# relayer/.env
RELAYER_KEY=your_relayer_private_key
SIM_MODE=false
RPC_POLKADOT=wss://rpc.polkadot.io
RPC_ASTAR=wss://rpc.astar.network
# ... (see relayer/.env.example)
```

### 4. Deploy Smart Contract (Testnet)
```bash
cd contracts
npx hardhat run scripts/deploy.ts --network westend
```

### 5. Run Frontend (Development)
```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

### 6. Run Relayer (Production)
```bash
cd relayer
npm run build
pm2 start ecosystem.config.js --env production
```

---

## 🧪 Testing

### Smart Contract Tests
```bash
cd contracts
npx hardhat test
# 100+ test cases covering:
# - Fee calculation
# - Access control
# - Gas tank management
# - Commission collection
# - Input validation
# - Reentrancy protection
```

### Local Multi-Chain Simulation
```bash
cd simulation
# Start Chopsticks fork for 3 chains (Polkadot, Astar, Hydration)
npm run orchestra
# Run end-to-end XCM flow test
node verify-sim.js
```

### Integration Testing Checklist
See `XCM_TESTING_GUIDE.md` for full testnet verification workflow:
- [ ] Asset IDs on Hydration Omnipool
- [ ] XCM weight limits
- [ ] Hydration pallet/call indices
- [ ] Multi-hop routing verification

---

## 🔒 Security

### Smart Contract Security
- **OpenZeppelin Libraries**: Ownable, ReentrancyGuard
- **Access Control**:
  - `onlyOwner` for admin functions
  - `onlyRelayer` for meta-transactions
  - `onlyEthDerived` prevents unmapped Substrate accounts (XCM safety)
- **Input Validation**: Array bounds, zero address checks, minimum batch value
- **Emergency Functions**: `emergencyPause()`, `emergencyWithdrawGasTank()`

### Relayer Security
- **Rate Limiting**: 10 req/min per IP, 100 req/min globally
- **Request Deduplication**: 5-minute idempotency cache (prevents double-spends)
- **Input Sanitization**: Address validation, amount overflow checks, signature format validation
- **Signature Verification**: EIP-191 message signing
- **Logging**: Winston structured logs for audit trail

### Audit Status
⚠️ **Not yet audited** - Use at your own risk. V1.0 is production-ready code but has not undergone professional security audit.

---

## 💰 Fee Structure

| Fee Type | Amount | Notes |
|----------|--------|-------|
| **Commission** | 5% | Deducted from net value (after XCM fees) |
| **Minimum Batch** | 0.05 DOT | Prevents uneconomical micro-transactions |
| **XCM Gas** | ~0.01-0.02 DOT | Chain-dependent (Tier 1: 1x, Tier 2: 2.5x) |
| **Relayer Rebate** | 0.002 DOT | For sponsored transactions |

**Example:**
- User has 0.3 DOT dust across Astar, Hydration, Acala
- Estimated XCM fees: 0.015 DOT
- Net value: 0.285 DOT
- Commission (5%): 0.01425 DOT
- **User receives: 0.27075 DOT** ✅

---

## 🌐 Supported Chains

| Chain | Native Token | Routing Tier | XCM Fee (Est.) |
|-------|--------------|--------------|----------------|
| Polkadot | DOT | Tier 1 (Direct) | 0.005 DOT |
| Astar | ASTR | Tier 2 (Multi-hop) | 0.015 DOT |
| Hydration | HDX | Tier 1 (Direct) | 0.003 DOT |
| Moonbeam | GLMR | Tier 2 (Multi-hop) | 0.020 DOT |
| Acala | ACA | Tier 1 (Direct) | 0.008 DOT |
| Bifrost | BNC | Tier 1 (Direct) | 0.010 DOT |
| Interlay | INTR | Tier 2 (Multi-hop) | 0.018 DOT |

**Tier 1**: Direct HRMP channel to Asset Hub
**Tier 2**: Routes through Asset Hub first (higher fees)

---

## 📖 Documentation

- **[JOURNEY.md](JOURNEY.md)**: Project story, mission, lessons learned, future vision
- **[XCM_TESTING_GUIDE.md](XCM_TESTING_GUIDE.md)**: Testnet verification workflow
- **[handoff_manifest.md](handoff_manifest.md)**: Technical architecture deep-dive

---

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Priorities
- [ ] Additional chain integrations (Zeitgeist, Phala, Nodle)
- [ ] Hydration Omnipool USDC swap (V1.1)
- [ ] UI/UX improvements
- [ ] Gas optimization
- [ ] Security audit preparation

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Parity Technologies** for Polkadot Revive and XCM framework
- **Hydration Protocol** for Omnipool oracle integration
- **OpenZeppelin** for battle-tested smart contract libraries
- **Polkadot community** for ecosystem support and feedback

---

## 📞 Contact & Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/JuanERombado/dotdotdust/issues)
- **Twitter**: [@dotdotdust](https://twitter.com/dotdotdust) (coming soon)
- **Discord**: [Join our community](https://discord.gg/dotdotdust) (coming soon)

---

## ⚡ Quick Links

- [Live Demo](https://dotdotdust.vercel.app) (coming soon)
- [API Documentation](docs/API.md)
- [Roadmap](https://github.com/JuanERombado/dotdotdust/projects/1)

---

**Built with ❤️ for the Polkadot ecosystem**

*"Stop letting dust collect. Start purging."* 🧹
