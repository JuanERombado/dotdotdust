/**
 * Pre-Launch Verification Script
 * Run this BEFORE mainnet launch to validate all XCM parameters
 *
 * Usage: npx ts-node pre-launch-verification.ts
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { u8aToHex } from '@polkadot/util';

interface VerificationResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
  action?: string;
}

const results: VerificationResult[] = [];

async function verifyHydrationAssetIds() {
  console.log('\n🔍 Verifying Hydration Omnipool Asset IDs...\n');

  try {
    const provider = new WsProvider('wss://1rpc.io/hydra');
    const api = await ApiPromise.create({ provider });

    // Query Omnipool assets
    const assets = await api.query.omnipool.assets.entries();

    console.log('📊 Available Omnipool Assets:');
    const assetMap: Record<string, number> = {};

    for (const [key, value] of assets) {
      const assetId = key.args[0].toNumber();
      const assetData = value.toJSON() as any;

      // Try to get asset metadata
      const metadata = await api.query.assetRegistry?.assets(assetId);
      const metadataJson = metadata?.toJSON() as any;

      const symbol = metadataJson?.symbol || 'UNKNOWN';
      console.log(`  Asset ID ${assetId}: ${symbol}`);

      assetMap[symbol] = assetId;
    }

    // Check for critical assets
    const criticalAssets = ['DOT', 'USDC', 'ASTR', 'HDX'];
    let allFound = true;

    for (const symbol of criticalAssets) {
      if (assetMap[symbol]) {
        results.push({
          check: `Hydration ${symbol} Asset ID`,
          status: 'PASS',
          details: `Found ${symbol} = Asset ID ${assetMap[symbol]}`,
          action: `Update Sweeper.sol to use assetId ${assetMap[symbol]}`
        });
      } else {
        results.push({
          check: `Hydration ${symbol} Asset ID`,
          status: 'FAIL',
          details: `${symbol} not found in Omnipool`,
          action: 'Verify asset symbol or check if asset is supported'
        });
        allFound = false;
      }
    }

    await api.disconnect();
    return allFound;

  } catch (error) {
    results.push({
      check: 'Hydration Omnipool Connection',
      status: 'FAIL',
      details: `Failed to connect: ${error}`,
      action: 'Check RPC endpoint or network connectivity'
    });
    return false;
  }
}

async function verifyHydrationPalletIndices() {
  console.log('\n🔍 Verifying Hydration Runtime Metadata...\n');

  try {
    const provider = new WsProvider('wss://1rpc.io/hydra');
    const api = await ApiPromise.create({ provider });

    // Get runtime metadata
    const metadata = await api.rpc.state.getMetadata();
    const pallets = metadata.asLatest.pallets;

    // Find Router pallet
    let routerIndex = -1;
    let swapCallIndex = -1;

    for (const pallet of pallets) {
      const palletName = pallet.name.toString();

      if (palletName.toLowerCase().includes('router') ||
          palletName.toLowerCase().includes('omnipool')) {
        console.log(`\n📦 Found pallet: ${palletName} (index ${pallet.index.toNumber()})`);
        routerIndex = pallet.index.toNumber();

        // Find swap call
        if (pallet.calls.isSome) {
          const calls = pallet.calls.unwrap();
          for (let i = 0; i < calls.type.toNumber(); i++) {
            const call = metadata.asLatest.lookup.getTypeDef(calls.type.toNumber());
            console.log(`  Available calls in ${palletName}:`, call);
          }
        }
      }
    }

    if (routerIndex >= 0) {
      results.push({
        check: 'Hydration Router Pallet Index',
        status: 'PASS',
        details: `Found router at pallet index ${routerIndex}`,
        action: `Update Sweeper.sol line 291: hex"${routerIndex.toString(16).padStart(2, '0')}"`
      });
    } else {
      results.push({
        check: 'Hydration Router Pallet Index',
        status: 'WARN',
        details: 'Could not auto-detect router pallet',
        action: 'Manually inspect Hydration runtime metadata'
      });
    }

    await api.disconnect();
    return routerIndex >= 0;

  } catch (error) {
    results.push({
      check: 'Hydration Runtime Metadata',
      status: 'FAIL',
      details: `Failed to fetch: ${error}`,
      action: 'Check RPC endpoint or network connectivity'
    });
    return false;
  }
}

async function verifyXCMWeights() {
  console.log('\n🔍 Estimating XCM Weight Requirements...\n');

  // This would require actually executing a swap, which needs:
  // 1. Funded test account
  // 2. Test tokens
  // 3. Ability to submit extrinsic

  results.push({
    check: 'XCM Weight Benchmark',
    status: 'WARN',
    details: 'Cannot benchmark without test account and funds',
    action: 'Execute manual test swap on Hydration testnet and monitor weight consumption'
  });
}

async function verifyWestendDeployment() {
  console.log('\n🔍 Checking Westend Asset Hub Connection...\n');

  try {
    const response = await fetch('https://westend-asset-hub-eth-rpc.polkadot.io', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1
      })
    });

    const data = await response.json();
    const chainId = parseInt(data.result, 16);

    if (chainId === 420420421) {
      results.push({
        check: 'Westend Asset Hub RPC',
        status: 'PASS',
        details: `Connected successfully (chainId: ${chainId})`,
        action: 'Ready for testnet deployment'
      });

      // Check XCM precompile
      const precompileResponse = await fetch('https://westend-asset-hub-eth-rpc.polkadot.io', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getCode',
          params: ['0x00000000000000000000000000000000000a0000', 'latest'],
          id: 2
        })
      });

      const codeData = await precompileResponse.json();
      if (codeData.result && codeData.result !== '0x') {
        results.push({
          check: 'XCM Precompile Availability',
          status: 'PASS',
          details: 'XCM precompile exists at expected address',
        });
      } else {
        results.push({
          check: 'XCM Precompile Availability',
          status: 'WARN',
          details: 'No code at precompile address (might be normal for precompiles)',
          action: 'Test with actual XCM call to verify functionality'
        });
      }

    } else {
      results.push({
        check: 'Westend Asset Hub RPC',
        status: 'FAIL',
        details: `Unexpected chainId: ${chainId}`,
        action: 'Verify RPC endpoint URL'
      });
    }

  } catch (error) {
    results.push({
      check: 'Westend Asset Hub RPC',
      status: 'FAIL',
      details: `Connection failed: ${error}`,
      action: 'Check RPC endpoint availability'
    });
  }
}

async function verifyBeneficiaryEncoding() {
  console.log('\n🔍 Checking Beneficiary Encoding Logic...\n');

  // Test EVM address to AccountId32 conversion
  const testEvmAddress = '0x1234567890123456789012345678901234567890';
  const evmBytes = testEvmAddress.slice(2); // Remove 0x

  // Current implementation (INCORRECT):
  const incorrectBeneficiary = testEvmAddress.padEnd(66, '0'); // Just pads with zeros

  // Correct implementation should:
  // 1. Derive proper AccountId32 from EVM address
  // 2. Account for Revive's address mapping scheme

  results.push({
    check: 'Beneficiary Encoding',
    status: 'FAIL',
    details: 'Current implementation uses simple padding, not proper AccountId32 derivation',
    action: 'Implement proper EVM -> Substrate address mapping for Revive'
  });
}

async function checkContractSecurityIssues() {
  console.log('\n🔍 Checking Smart Contract Security...\n');

  const issues = [
    {
      check: 'Signature Verification',
      implemented: false,
      details: 'sweepAndRepay() has TODO comment for signature verification',
      action: 'Implement EIP-191 signature verification in Sweeper.sol line 157'
    },
    {
      check: 'Slippage Protection',
      implemented: false,
      details: 'min_amount_out = 0 in Hydration swap (no MEV protection)',
      action: 'Add 1-5% slippage tolerance calculation'
    },
    {
      check: 'Emergency Pause',
      implemented: false,
      details: 'emergencyPause() function mentioned but not implemented',
      action: 'Add Pausable pattern from OpenZeppelin'
    }
  ];

  for (const issue of issues) {
    results.push({
      check: issue.check,
      status: issue.implemented ? 'PASS' : 'FAIL',
      details: issue.details,
      action: issue.action
    });
  }
}

function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 PRE-LAUNCH VERIFICATION RESULTS');
  console.log('='.repeat(80) + '\n');

  const grouped = {
    PASS: results.filter(r => r.status === 'PASS'),
    WARN: results.filter(r => r.status === 'WARN'),
    FAIL: results.filter(r => r.status === 'FAIL')
  };

  console.log(`✅ PASS: ${grouped.PASS.length}`);
  console.log(`⚠️  WARN: ${grouped.WARN.length}`);
  console.log(`❌ FAIL: ${grouped.FAIL.length}\n`);

  if (grouped.FAIL.length > 0) {
    console.log('❌ CRITICAL FAILURES:\n');
    for (const result of grouped.FAIL) {
      console.log(`  • ${result.check}`);
      console.log(`    ${result.details}`);
      if (result.action) {
        console.log(`    ➜ ACTION: ${result.action}`);
      }
      console.log();
    }
  }

  if (grouped.WARN.length > 0) {
    console.log('⚠️  WARNINGS:\n');
    for (const result of grouped.WARN) {
      console.log(`  • ${result.check}`);
      console.log(`    ${result.details}`);
      if (result.action) {
        console.log(`    ➜ ACTION: ${result.action}`);
      }
      console.log();
    }
  }

  if (grouped.PASS.length > 0) {
    console.log('✅ PASSING CHECKS:\n');
    for (const result of grouped.PASS) {
      console.log(`  • ${result.check}: ${result.details}`);
    }
    console.log();
  }

  // Summary recommendation
  console.log('='.repeat(80));
  const isReady = grouped.FAIL.length === 0 && grouped.WARN.length <= 2;

  if (isReady) {
    console.log('✅ READY FOR MAINNET LAUNCH');
    console.log('   Minor warnings can be addressed post-launch');
  } else {
    console.log('❌ NOT READY FOR MAINNET LAUNCH');
    console.log(`   ${grouped.FAIL.length} critical issues must be resolved`);
    console.log(`   ${grouped.WARN.length} warnings should be investigated`);
  }
  console.log('='.repeat(80) + '\n');
}

async function main() {
  console.log('🚀 dotdotdust Pre-Launch Verification');
  console.log('=====================================\n');
  console.log('This script validates critical parameters before mainnet deployment.\n');

  // Run all verification steps
  await verifyHydrationAssetIds();
  await verifyHydrationPalletIndices();
  await verifyXCMWeights();
  await verifyWestendDeployment();
  verifyBeneficiaryEncoding();
  checkContractSecurityIssues();

  // Print summary
  printResults();

  process.exit(grouped.FAIL.length > 0 ? 1 : 0);
}

// Run verification
main().catch(console.error);
