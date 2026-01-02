# Pre-Launch Checklist for dotdotdust
## Target Launch: January 20, 2026

**Current Status:** ⚠️ **80% Production-Ready**

---

## 🔴 CRITICAL BLOCKERS (Must Fix Before Launch)

### 1. Verify Hydration Parameters ⏱️ 4-6 hours

**Issue:** `Sweeper.sol` has placeholder values that will cause silent failures

**Files Affected:**
- `contracts/contracts/Sweeper.sol` (lines 239, 242, 291, 292, 302, 356)

**Action:**
```bash
# Install dependencies
npm install

# Run parameter extraction script
npm run get-params
```

This will output the exact values you need to update in `Sweeper.sol`:
- ✅ DOT asset ID on Hydration
- ✅ USDC asset ID on Hydration
- ✅ Router pallet index
- ✅ Swap call index
- ⚠️ Weight limit (requires manual test)

**Manual Steps:**
1. Review output from `get-params` script
2. Update `Sweeper.sol` with correct values
3. Recompile: `cd contracts && npx hardhat compile`
4. Re-run tests: `npx hardhat test`

---

### 2. Fix Beneficiary Encoding ⏱️ 2-3 hours

**Issue:** Current implementation uses simple padding instead of proper AccountId32 derivation

**Current Code (INCORRECT):**
```solidity
// Line 356
bytes32 beneficiary = bytes32(uint256(uint160(msg.sender)));
```

**Required:**
- Implement proper EVM → Substrate address mapping for Revive
- Account for `0xEE` prefix in Revive address derivation
- Test round-trip: EVM → Substrate → Hydration → back

**Test Case:**
```typescript
// Add to contracts/test/Sweeper.test.ts
it("Should correctly encode beneficiary for XCM", async function () {
  const evmAddress = "0x1234567890123456789012345678901234567890";
  const encoded = await sweeper.encodeBeneficiary(evmAddress);
  // Verify it matches expected AccountId32 derivation
});
```

---

### 3. Implement Signature Verification ⏱️ 3-4 hours

**Issue:** `sweepAndRepay()` has TODO for signature verification - **SECURITY HOLE**

**Current Code:**
```solidity
// Line 154-157
function verifySignature(...) internal pure returns (bool) {
    // TODO: Implement EIP-191 signature verification
    return true; // TEMPORARY - always succeeds!
}
```

**Impact:** Anyone can submit sponsored sweeps without authorization

**Action:**
1. Implement EIP-191 message signing
2. Add nonce management to prevent replay attacks
3. Verify recovered signer matches user address
4. Add comprehensive tests

**Reference Implementation:**
```solidity
function verifySignature(
    address user,
    address[] memory assets,
    uint256[] memory amounts,
    uint256 nonce,
    bytes memory signature
) internal view returns (bool) {
    bytes32 messageHash = keccak256(abi.encodePacked(
        "\x19Ethereum Signed Message:\n32",
        keccak256(abi.encodePacked(user, assets, amounts, nonce))
    ));

    address signer = recoverSigner(messageHash, signature);
    return signer == user && !usedNonces[user][nonce];
}
```

---

### 4. Benchmark XCM Weight ⏱️ 4-6 hours

**Issue:** Weight limit is a guess - will cause `exhaustsResources` errors

**Current Code:**
```solidity
// Line 302
uint64(1000000000) // 1 billion weight (ADJUST based on testing!)
```

**Action:**
1. Fund test account on Hydration with DOT and USDC
2. Execute sample swap via Omnipool
3. Monitor `system.ExtrinsicSuccess` event for actual weight
4. Add 20-30% safety buffer
5. Update Sweeper.sol

**Script to Run:**
```typescript
// See get-hydration-params.ts section "WEIGHT BENCHMARKING"
// Requires funded testnet account
```

---

### 5. Deploy to Westend Testnet ⏱️ 2-3 hours

**Issue:** No testnet deployment yet to validate XCM integration

**Action:**
```bash
# Set environment variable
export PRIVATE_KEY="your_westend_private_key"

# Deploy to Westend Asset Hub
npm run deploy:westend

# Record contract address
```

**Verification:**
1. Verify XCM precompile works at `0x00000000000000000000000000000000000a0000`
2. Test `sweepBatch()` with mock assets
3. Monitor for XCM errors in block explorer
4. Test `sweepAndRepay()` with relayer

---

## 🟠 HIGH PRIORITY (Strongly Recommended)

### 6. Add Slippage Protection ⏱️ 2-3 hours

**Issue:** `min_amount_out = 0` means no MEV protection

```solidity
// Line 296
uint128(0)    // No slippage protection - users can be MEV'd!
```

**Action:**
- Calculate 1-5% slippage tolerance
- Show price impact in UI
- Warn user if impact > 5%

---

### 7. Extend Chopsticks Simulation ⏱️ 3-4 hours

**Issue:** Asset Hub (parachain 1000) missing from simulation

**Current Coverage:**
- ✅ Polkadot Relay
- ✅ Astar
- ✅ Hydration
- ❌ Asset Hub (needed for contract deployment testing)

**Action:**
1. Add Asset Hub config to `simulation/orchestra.ts`
2. Update `start-orchestra.js` to include Asset Hub on port 8003
3. Run integration test: `npm run integration-test`

---

### 8. Create Integration Test Suite ⏱️ 6-8 hours

**Issue:** Only unit tests exist - no end-to-end validation

**Action:**
- Complete `simulation/integration-test.ts`
- Test full flow: Astar → Asset Hub → Sweeper → Hydration
- Validate fee calculations with real oracle
- Test relayer sponsored transaction

---

## 🟡 NICE TO HAVE (Post-Launch Acceptable)

### 9. Implement Emergency Pause ⏱️ 1-2 hours

**Issue:** No circuit breaker for emergencies

**Action:**
- Add OpenZeppelin `Pausable` pattern
- Implement `emergencyPause()` function (currently just a comment)
- Add `whenNotPaused` modifier to sweep functions

---

### 10. Oracle Fallback Strategy ⏱️ 2-3 hours

**Issue:** Single point of failure if Hydration Omnipool fails

**Action:**
- Implement graceful degradation with hardcoded prices
- Add UI warning when using fallback
- Consider alternative oracles (SubQuery, etc.)

---

## 📊 Testing Timeline

| Task | Estimated Time | Can Do Now? | Blocks Launch? |
|------|----------------|-------------|----------------|
| Verify Hydration Parameters | 4-6 hours | ✅ YES | 🔴 YES |
| Fix Beneficiary Encoding | 2-3 hours | ✅ YES | 🔴 YES |
| Implement Signature Verification | 3-4 hours | ✅ YES | 🔴 YES |
| Benchmark XCM Weight | 4-6 hours | ⚠️ Needs testnet funds | 🔴 YES |
| Deploy to Westend | 2-3 hours | ✅ YES | 🔴 YES |
| Add Slippage Protection | 2-3 hours | ✅ YES | 🟠 RECOMMENDED |
| Extend Chopsticks | 3-4 hours | ✅ YES | 🟠 RECOMMENDED |
| Integration Tests | 6-8 hours | ✅ YES | 🟠 RECOMMENDED |

**Total Critical Path:** 15-22 hours
**Total Recommended:** 27-43 hours

---

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Run pre-launch verification
npm run verify

# Get Hydration parameters
npm run get-params

# Run contract unit tests
npm run test:contracts

# Deploy to Westend testnet
npm run deploy:westend

# Run integration tests (requires Chopsticks running)
npm run integration-test

# Start local simulation environment
npm run dev:simulation
```

---

## 📋 Pre-Launch Verification Script

I've created `pre-launch-verification.ts` which automatically checks:
- ✅ Hydration asset IDs (DOT, USDC, ASTR, HDX)
- ✅ Runtime metadata for pallet/call indices
- ✅ Westend Asset Hub RPC connectivity
- ✅ XCM precompile availability
- ⚠️ Weight benchmarking (requires manual test)
- ❌ Beneficiary encoding (flagged as incorrect)
- ❌ Signature verification (flagged as TODO)
- ❌ Slippage protection (flagged as missing)
- ❌ Emergency pause (flagged as not implemented)

**Run it now:**
```bash
npm run verify
```

---

## ✅ What You CAN Test Right Now (No Mainnet Needed)

1. **Westend Asset Hub Testnet** - Already configured in `hardhat.config.js`
2. **Hydration Mainnet** - Read-only queries for asset IDs and parameters
3. **All 7 Chain RPCs** - Public endpoints already working
4. **Chopsticks Simulation** - Local 3-chain fork for XCM testing
5. **Unit Tests** - 77 test cases ready to run
6. **Frontend** - Full UI can be tested with mock data
7. **Relayer** - Can test signature verification and rate limiting

---

## ❌ What You CANNOT Test Until Jan 20

1. **Mainnet Revive Deployment** - Asset Hub Revive launches Jan 20
2. **Production XCM Routing** - Real asset transfers require mainnet
3. **Real User Funds** - Obviously only testnet until launch
4. **Fee Collection** - Real DOT commission only on mainnet

---

## 🎯 Recommended Next Steps (This Week)

### Day 1-2: Critical Parameters
- [ ] Run `npm run get-params` and update `Sweeper.sol`
- [ ] Fix beneficiary encoding
- [ ] Implement signature verification
- [ ] Recompile and re-run all tests

### Day 3-4: Testnet Validation
- [ ] Deploy to Westend Asset Hub
- [ ] Execute test sweeps
- [ ] Benchmark XCM weight with real transactions
- [ ] Update weight limits in contract

### Day 5-6: Integration Testing
- [ ] Add Asset Hub to Chopsticks
- [ ] Complete integration test suite
- [ ] Test end-to-end flow in simulation
- [ ] Document any issues found

### Day 7: Final Review
- [ ] Run full test suite
- [ ] Review security checklist
- [ ] Prepare mainnet deployment script
- [ ] Document deployment process

---

## 🔒 Security Checklist

Before mainnet launch, ensure:
- [ ] All XCM parameters verified (not placeholders)
- [ ] Signature verification implemented and tested
- [ ] Slippage protection added
- [ ] Emergency pause mechanism working
- [ ] Access control tested (onlyOwner, onlyRelayer)
- [ ] Reentrancy guards on all withdrawal functions
- [ ] Input validation comprehensive
- [ ] Rate limiting on relayer active
- [ ] Gas tank funded with sufficient buffer
- [ ] Fee collector address configured correctly

---

## 📞 Need Help?

If you encounter issues:
1. Check `handoff_manifest.md` for known issues
2. Review `JOURNEY.md` for technical challenges encountered
3. Consult `XCM_TESTING_GUIDE.md` for testnet verification steps

---

**Remember:** You don't need to wait for Jan 20 to test most of this. The time to find bugs is NOW, not after mainnet launch! 🚀
