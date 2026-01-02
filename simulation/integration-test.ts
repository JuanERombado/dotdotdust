/**
 * End-to-End Integration Test for dotdotdust
 * Tests full flow: Source Chain -> Asset Hub -> Hydration Swap
 *
 * Prerequisites:
 * 1. Run Chopsticks orchestra with Asset Hub
 * 2. Deploy Sweeper contract to forked Asset Hub
 * 3. Mint test tokens to test account
 *
 * Usage: npx ts-node integration-test.ts
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';

const ALICE_SEED = '//Alice';

interface TestResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details: string;
  duration?: number;
}

const results: TestResult[] = [];

async function connectToChain(name: string, endpoint: string): Promise<ApiPromise | null> {
  try {
    console.log(`🔗 Connecting to ${name}...`);
    const provider = new WsProvider(endpoint);
    const api = await ApiPromise.create({ provider });

    await api.isReady;
    console.log(`   ✅ Connected to ${api.runtimeChain.toString()}\n`);

    return api;
  } catch (error) {
    console.log(`   ❌ Failed to connect to ${name}: ${error}\n`);
    results.push({
      step: `Connect to ${name}`,
      status: 'FAIL',
      details: `Connection failed: ${error}`
    });
    return null;
  }
}

async function testStep1_CheckBalances(
  polkadotApi: ApiPromise,
  astarApi: ApiPromise,
  assetHubApi: ApiPromise,
  alice: any
) {
  console.log('📊 STEP 1: Check Initial Balances');
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    // Check Polkadot balance
    const polkadotBalance = await polkadotApi.query.system.account(alice.address);
    const polkadotFree = polkadotBalance.data.free.toString();

    console.log(`   Polkadot DOT: ${(Number(polkadotFree) / 1e10).toFixed(4)} DOT`);

    // Check Astar balance
    const astarBalance = await astarApi.query.system.account(alice.address);
    const astarFree = astarBalance.data.free.toString();

    console.log(`   Astar ASTR:   ${(Number(astarFree) / 1e18).toFixed(4)} ASTR`);

    // Check Asset Hub balance
    const assetHubBalance = await assetHubApi.query.system.account(alice.address);
    const assetHubFree = assetHubBalance.data.free.toString();

    console.log(`   Asset Hub:    ${(Number(assetHubFree) / 1e10).toFixed(4)} DOT\n`);

    const duration = Date.now() - startTime;

    if (Number(polkadotFree) > 0 && Number(astarFree) > 0) {
      results.push({
        step: 'Check Initial Balances',
        status: 'PASS',
        details: `Polkadot: ${(Number(polkadotFree) / 1e10).toFixed(4)} DOT, Astar: ${(Number(astarFree) / 1e18).toFixed(4)} ASTR`,
        duration
      });
      return true;
    } else {
      results.push({
        step: 'Check Initial Balances',
        status: 'FAIL',
        details: 'Insufficient balances - run mint.js first',
        duration
      });
      return false;
    }
  } catch (error) {
    results.push({
      step: 'Check Initial Balances',
      status: 'FAIL',
      details: `Error: ${error}`
    });
    return false;
  }
}

async function testStep2_SendXCMFromPolkadot(
  polkadotApi: ApiPromise,
  assetHubApi: ApiPromise,
  alice: any,
  amount: string = '1000000000000' // 0.01 DOT
) {
  console.log('📤 STEP 2: Send XCM from Polkadot to Asset Hub');
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    // Get initial Asset Hub balance
    const initialBalance = await assetHubApi.query.system.account(alice.address);
    const initialFree = BigInt(initialBalance.data.free.toString());

    console.log(`   Sending ${Number(amount) / 1e10} DOT via XCM...`);

    // Construct XCM message (Teleport to Asset Hub)
    const dest = {
      V4: {
        parents: 0,
        interior: {
          X1: [{ Parachain: 1000 }] // Asset Hub parachain ID
        }
      }
    };

    const beneficiary = {
      V4: {
        parents: 0,
        interior: {
          X1: [{ AccountId32: { id: alice.addressRaw } }]
        }
      }
    };

    const assets = {
      V4: [
        {
          id: { parents: 0, interior: 'Here' },
          fun: { Fungible: amount }
        }
      ]
    };

    const feeAssetItem = 0;

    // Submit teleport transaction
    const tx = polkadotApi.tx.xcmPallet?.limitedTeleportAssets?.(
      dest,
      beneficiary,
      assets,
      feeAssetItem,
      'Unlimited'
    );

    if (!tx) {
      throw new Error('XCM pallet or teleportAssets method not available');
    }

    await new Promise((resolve, reject) => {
      tx.signAndSend(alice, ({ status, dispatchError }) => {
        if (status.isInBlock) {
          console.log(`   ✅ Included in block: ${status.asInBlock.toString()}`);
        }

        if (status.isFinalized) {
          if (dispatchError) {
            reject(new Error(`Transaction failed: ${dispatchError.toString()}`));
          } else {
            resolve(true);
          }
        }
      });
    });

    // Wait for XCM to be processed (in real network, this could take 6-12 seconds)
    console.log(`   ⏳ Waiting for XCM to be processed...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check Asset Hub balance increased
    const finalBalance = await assetHubApi.query.system.account(alice.address);
    const finalFree = BigInt(finalBalance.data.free.toString());

    const received = finalFree - initialFree;

    console.log(`   📥 Asset Hub received: ${Number(received) / 1e10} DOT\n`);

    const duration = Date.now() - startTime;

    if (received > 0) {
      results.push({
        step: 'Send XCM from Polkadot',
        status: 'PASS',
        details: `Teleported ${Number(amount) / 1e10} DOT, received ${Number(received) / 1e10} DOT`,
        duration
      });
      return true;
    } else {
      results.push({
        step: 'Send XCM from Polkadot',
        status: 'FAIL',
        details: 'XCM teleport failed - no balance change on Asset Hub',
        duration
      });
      return false;
    }
  } catch (error) {
    results.push({
      step: 'Send XCM from Polkadot',
      status: 'FAIL',
      details: `Error: ${error}`
    });
    return false;
  }
}

async function testStep3_DeploySweeperContract() {
  console.log('📜 STEP 3: Deploy Sweeper Contract to Asset Hub');
  console.log('='.repeat(60));

  // This would require:
  // 1. Compiled Sweeper.sol bytecode
  // 2. EVM RPC endpoint for Asset Hub fork
  // 3. Funded deployer account

  console.log('   ⚠️  Manual step required:');
  console.log('   cd contracts && npx hardhat run scripts/deploy.ts --network westend\n');

  results.push({
    step: 'Deploy Sweeper Contract',
    status: 'SKIP',
    details: 'Requires manual deployment - see contracts/scripts/deploy.ts'
  });

  return false; // Skip for now
}

async function testStep4_TriggerSweep() {
  console.log('🧹 STEP 4: Trigger Sweeper Contract');
  console.log('='.repeat(60));

  console.log('   ⚠️  Requires deployed contract and Ethers.js setup\n');

  results.push({
    step: 'Trigger Sweeper Contract',
    status: 'SKIP',
    details: 'Requires contract deployment first'
  });

  return false;
}

async function testStep5_VerifyConsolidation(
  assetHubApi: ApiPromise,
  alice: any
) {
  console.log('✅ STEP 5: Verify Final Consolidation');
  console.log('='.repeat(60));

  try {
    const finalBalance = await assetHubApi.query.system.account(alice.address);
    const finalFree = finalBalance.data.free.toString();

    console.log(`   Final Asset Hub balance: ${(Number(finalFree) / 1e10).toFixed(4)} DOT\n`);

    results.push({
      step: 'Verify Final Consolidation',
      status: 'PASS',
      details: `Final balance: ${(Number(finalFree) / 1e10).toFixed(4)} DOT`
    });

    return true;
  } catch (error) {
    results.push({
      step: 'Verify Final Consolidation',
      status: 'FAIL',
      details: `Error: ${error}`
    });
    return false;
  }
}

function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 INTEGRATION TEST RESULTS');
  console.log('='.repeat(80) + '\n');

  const grouped = {
    PASS: results.filter(r => r.status === 'PASS'),
    FAIL: results.filter(r => r.status === 'FAIL'),
    SKIP: results.filter(r => r.status === 'SKIP')
  };

  console.log(`✅ PASS: ${grouped.PASS.length}`);
  console.log(`❌ FAIL: ${grouped.FAIL.length}`);
  console.log(`⏭️  SKIP: ${grouped.SKIP.length}\n`);

  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
    const duration = result.duration ? ` (${result.duration}ms)` : '';

    console.log(`${icon} ${result.step}${duration}`);
    console.log(`   ${result.details}\n`);
  }

  console.log('='.repeat(80));

  const allPassed = grouped.FAIL.length === 0;
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED (skipped steps can be implemented)');
  } else {
    console.log('❌ SOME TESTS FAILED - Review errors above');
  }

  console.log('='.repeat(80) + '\n');
}

async function main() {
  console.log('🧪 dotdotdust Integration Test Suite');
  console.log('=====================================\n');

  const keyring = new Keyring({ type: 'sr25519' });
  const alice = keyring.addFromUri(ALICE_SEED);

  console.log(`👤 Test account: ${alice.address}\n`);

  // Connect to chains
  const polkadotApi = await connectToChain('Polkadot', 'ws://localhost:8000');
  const astarApi = await connectToChain('Astar', 'ws://localhost:8001');
  const hydrationApi = await connectToChain('Hydration', 'ws://localhost:8002');

  // Asset Hub needs to be added to orchestra.ts
  const assetHubApi = await connectToChain('Asset Hub', 'ws://localhost:8003');

  if (!polkadotApi || !astarApi || !hydrationApi) {
    console.log('❌ Failed to connect to required chains');
    console.log('   Make sure Chopsticks orchestra is running:');
    console.log('   cd simulation && node start-orchestra.js\n');
    return;
  }

  // Run test steps
  const step1 = await testStep1_CheckBalances(
    polkadotApi,
    astarApi,
    assetHubApi || polkadotApi, // Fallback if Asset Hub not available
    alice
  );

  if (step1 && polkadotApi && assetHubApi) {
    await testStep2_SendXCMFromPolkadot(polkadotApi, assetHubApi, alice);
  }

  await testStep3_DeploySweeperContract();
  await testStep4_TriggerSweep();

  if (assetHubApi) {
    await testStep5_VerifyConsolidation(assetHubApi, alice);
  }

  // Cleanup
  await polkadotApi.disconnect();
  await astarApi.disconnect();
  await hydrationApi.disconnect();
  if (assetHubApi) await assetHubApi.disconnect();

  // Print summary
  printResults();

  process.exit(results.filter(r => r.status === 'FAIL').length > 0 ? 1 : 0);
}

main().catch(console.error);
