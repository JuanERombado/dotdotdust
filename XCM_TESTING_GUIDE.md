# XCM USDC Swap Testing Guide

## Overview
Phase 4 has implemented the XCM V5 framework for USDC swaps via Hydration Omnipool. However, several values are **PLACEHOLDERS** that must be determined through testing before mainnet deployment.

---

## ⚠️ CRITICAL: Values That MUST Be Verified Before Launch

### 1. Asset IDs on Hydration

**File:** `contracts/Sweeper.sol` lines 239, 242, 359

**Current Placeholders:**
```solidity
uint32 assetInId = 0;      // DOT on Hydration (VERIFY!)
uint32 usdcId = 10;        // USDC on Hydration (VERIFY!)
```

**How to Find:**
1. Connect to Hydration testnet:
   ```bash
   wscat -c wss://rpc.hydradx.cloud
   ```

2. Query Omnipool assets:
   ```javascript
   api.query.omnipool.assets.entries()
   ```

3. Look for:
   - DOT asset ID
   - USDC asset ID
   - ASTR asset ID
   - HDX asset ID

**Expected Format:**
Asset IDs are usually integers (e.g., 0 for HDX, 5 for DOT, 10 for USDC, etc.)

---

### 2. Hydration Router Pallet Index

**File:** `contracts/Sweeper.sol` line 291

**Current Placeholder:**
```solidity
hex"46"  // Pallet index (EXAMPLE - verify!)
```

**How to Find:**
1. Get Hydration runtime metadata:
   ```javascript
   const metadata = await api.rpc.state.getMetadata();
   ```

2. Search for the Router or Omnipool pallet
3. Note the pallet index (hex value)

**Common pallet names:**
- `router`
- `omnipool`
- `xyk`

---

### 3. Swap Call Index

**File:** `contracts/Sweeper.sol` line 292

**Current Placeholder:**
```solidity
hex"00"  // Call index for swap (EXAMPLE - verify!)
```

**How to Find:**
1. In the pallet metadata, find the `swap` call
2. Note its index within the pallet
3. Convert to hex (e.g., call 0 = 0x00, call 1 = 0x01, etc.)

**Common swap call signatures:**
- `swap(asset_in, asset_out, amount_in, min_amount_out)`
- `sell(asset_in, asset_out, amount_in, min_bought)`
- `buy(asset_in, asset_out, amount_out, max_sold)`

---

### 4. XCM Weight Limits

**File:** `contracts/Sweeper.sol` line 302

**Current Placeholder:**
```solidity
uint64(1000000000)  // 1 billion weight (ADJUST based on testing!)
```

**How to Find:**
1. Execute test swap on Hydration testnet
2. Monitor actual weight consumed
3. Add 20% safety buffer
4. Update this value

**Testing command:**
```javascript
const result = await api.tx.router.swap(assetIn, assetOut, amount, minOut)
  .paymentInfo(sender);
console.log('Weight:', result.weight.toString());
```

---

### 5. Parachain ID for Hydration

**File:** `contracts/Sweeper.sol` line 195

**Current Value:**
```solidity
hex"FA070000"  // 2034 in compact encoding
```

**Verification:**
- Polkadot mainnet: Hydration is para **2034** ✓
- Westend testnet: May be different - verify!

**To check:**
```javascript
// Get all parachains
const parachains = await api.query.paras.parachains();
console.log(parachains.toHuman());
```

---

## 🧪 Testing Workflow

### Step 1: Test on Hydration Testnet

1. **Setup:**
   ```bash
   cd contracts
   npx hardhat node --fork https://hydration-testnet-rpc-url
   ```

2. **Deploy Sweeper:**
   ```bash
   npx hardhat run scripts/deploy.ts --network hydrationTestnet
   ```

3. **Test swap directly on Hydration:**
   ```javascript
   // Call Omnipool swap directly to understand parameters
   const tx = await api.tx.omnipool.sell(
     assetIn,   // e.g., 5 (DOT)
     assetOut,  // e.g., 10 (USDC)
     amount,    // e.g., 1000000000000 (1 DOT with 12 decimals)
     minBought  // e.g., 0 (no slippage protection for testing)
   );

   const result = await tx.signAndSend(alice);
   console.log('Swap successful:', result.toHuman());
   ```

### Step 2: Test XCM Message

1. **Build XCM message manually:**
   ```javascript
   const xcm = {
     V5: [
       { WithdrawAsset: [[{ id: { Concrete: { parents: 0, interior: { X1: { GeneralIndex: assetIn }}}}, fun: { Fungible: amount }}]] },
       { BuyExecution: { fees: { id: {...}, fun: { Fungible: feeAmount }}, weightLimit: 'Unlimited' }},
       { Transact: { originKind: 'Native', requireWeightAtMost: { refTime: 1000000000, proofSize: 0 }, call: encodedSwapCall }},
       { RefundSurplus: null },
       { DepositAsset: { assets: { Wild: 'All' }, beneficiary: { parents: 0, interior: { X1: { AccountId32: { network: null, id: beneficiary }}}}}}
     ]
   };
   ```

2. **Send via XCM pallet:**
   ```javascript
   const dest = { V5: { parents: 0, interior: { X1: { Parachain: 2034 }}}};
   await api.tx.polkadotXcm.send(dest, xcm).signAndSend(alice);
   ```

### Step 3: Test from Sweeper Contract

1. **Call sweepBatch:**
   ```javascript
   const sweeper = new ethers.Contract(SWEEPER_ADDRESS, SWEEPER_ABI, signer);
   const tx = await sweeper.sweepBatch(
     [assetAddress],  // Asset addresses
     [amount],        // Amounts
     { value: ethers.parseEther("0.1") } // Gas for XCM
   );
   await tx.wait();
   ```

2. **Monitor XCM:**
   - Check if XCM message arrives on Hydration
   - Verify swap executes
   - Confirm USDC is deposited to user

---

## 📝 Values to Record During Testing

Create a table like this:

| Parameter | Testnet Value | Mainnet Value | Verified? |
|-----------|---------------|---------------|-----------|
| DOT Asset ID | | | ❌ |
| USDC Asset ID | | | ❌ |
| ASTR Asset ID | | | ❌ |
| HDX Asset ID | | | ❌ |
| Router Pallet Index | | | ❌ |
| Swap Call Index | | | ❌ |
| XCM Weight Limit | | | ❌ |
| Hydration Para ID | 2034 | 2034 | ✓ |

---

## 🔧 Tools Needed

1. **Polkadot.js Apps**
   - URL: https://polkadot.js.org/apps/
   - Connect to Hydration
   - Browse storage/metadata

2. **Chopsticks** (for local testing)
   ```bash
   npx @acala-network/chopsticks@latest \
     --endpoint wss://rpc.hydradx.cloud \
     --port 8000
   ```

3. **XCM Simulator**
   - Test XCM messages locally before live testing

---

## ⚠️ Known Issues to Test

1. **XCM Encoding:**
   - Current encoding is simplified
   - Real XCM V5 uses SCALE codec (compact encoding)
   - May need proper SCALE encoder library

2. **Multi-Location Format:**
   - Beneficiary encoding (line 356) is simplified
   - Should use proper AccountId32 encoding

3. **Slippage Protection:**
   - Currently `min_amount_out = 0` (no protection)
   - Add reasonable slippage tolerance (e.g., 1-5%)

4. **Multi-Hop Routing:**
   - Current implementation assumes direct path
   - Tier 2 assets (ASTR) may need routing through Asset Hub first

---

## 🎯 Success Criteria

Before deploying to mainnet, verify:

- [ ] XCM message successfully sent from Sweeper contract
- [ ] Message arrives on Hydration parachain
- [ ] Swap executes correctly on Omnipool
- [ ] USDC is deposited to correct beneficiary
- [ ] 5% commission is correctly deducted
- [ ] Gas costs are reasonable (< 0.01 DOT)
- [ ] No errors in XCM execution
- [ ] Works for all supported assets (DOT, ASTR, HDX)

---

## 📚 Resources

- **XCM Format**: https://github.com/paritytech/xcm-format
- **Hydration Docs**: https://docs.hydration.net
- **Polkadot.js API**: https://polkadot.js.org/docs/
- **SCALE Codec**: https://docs.substrate.io/reference/scale-codec/

---

## 🚨 Emergency Fallback

If XCM swap integration proves too complex before Jan 20th:

**Option 1:** Deploy with DOT output (skip USDC swap)
- Remove Hydration swap logic
- Assets consolidate to DOT on Asset Hub
- Add USDC swap in v1.1 post-launch

**Option 2:** Off-chain swap
- Contract sends DOT to relayer
- Relayer swaps to USDC off-chain
- Sends USDC to user
- Less trustless but faster to implement
