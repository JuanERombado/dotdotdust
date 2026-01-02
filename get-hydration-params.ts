/**
 * Hydration Parameter Extractor
 * Gets exact asset IDs and pallet indices needed for Sweeper.sol
 *
 * Usage: npx ts-node get-hydration-params.ts
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

async function main() {
  console.log('🔍 Connecting to Hydration...\n');

  // Try alternative RPC endpoint (1rpc.io was having connectivity issues)
  const provider = new WsProvider('wss://rpc.hydradx.cloud');
  const api = await ApiPromise.create({ provider });

  console.log('✅ Connected to Hydration');
  console.log(`   Chain: ${api.runtimeChain.toString()}`);
  console.log(`   Runtime: ${api.runtimeVersion.specName.toString()} v${api.runtimeVersion.specVersion.toString()}\n`);

  // 1. Get Asset IDs
  console.log('📊 ASSET IDs (for Sweeper.sol lines 239, 242, 359)');
  console.log('='.repeat(60));

  const assetsToFind = ['DOT', 'USDC', 'USDT', 'ASTR', 'HDX', 'GLMR', 'ACA', 'BNC', 'INTR'];
  const assetMap: Record<string, any> = {};

  // Query all assets in the registry
  const assetEntries = await api.query.assetRegistry.assets.entries();

  for (const [key, value] of assetEntries) {
    const assetId = key.args[0].toString();
    const assetData = value.toJSON() as any;

    if (assetData && assetData.symbol) {
      const symbol = assetData.symbol;
      assetMap[symbol] = {
        id: assetId,
        name: assetData.name || symbol,
        decimals: assetData.decimals
      };
    }
  }

  for (const symbol of assetsToFind) {
    if (assetMap[symbol]) {
      console.log(`${symbol.padEnd(6)} -> Asset ID: ${assetMap[symbol].id.padEnd(4)} (${assetMap[symbol].decimals} decimals)`);
    } else {
      console.log(`${symbol.padEnd(6)} -> ❌ NOT FOUND`);
    }
  }

  // 2. Get Pallet Indices
  console.log('\n📦 PALLET INDICES (for Sweeper.sol line 291)');
  console.log('='.repeat(60));

  const metadata = await api.rpc.state.getMetadata();
  const pallets = metadata.asLatest.pallets;

  const relevantPallets = ['Router', 'Omnipool', 'XCM', 'PolkadotXcm'];

  for (const pallet of pallets) {
    const palletName = pallet.name.toString();

    for (const target of relevantPallets) {
      if (palletName.toLowerCase().includes(target.toLowerCase())) {
        const index = pallet.index.toNumber();
        const hexIndex = '0x' + index.toString(16).padStart(2, '0');

        console.log(`${palletName.padEnd(20)} -> Index: ${index.toString().padStart(3)} (${hexIndex})`);

        // Get call indices
        if (pallet.calls.isSome) {
          const calls = pallet.calls.unwrap();
          const callsType = metadata.registry.lookup.getTypeDef(calls.type.toNumber());

          if (callsType.type === 'Enum' && callsType.sub && Array.isArray(callsType.sub)) {
            console.log(`  Available calls:`);
            callsType.sub.forEach((call: any, idx: number) => {
              const callName = call.name || `call_${idx}`;
              const hexCallIndex = '0x' + idx.toString(16).padStart(2, '0');
              if (callName.toLowerCase().includes('swap')) {
                console.log(`    ⭐ ${callName.padEnd(30)} -> Call Index: ${idx.toString().padStart(2)} (${hexCallIndex})`);
              } else {
                console.log(`       ${callName.padEnd(30)} -> Call Index: ${idx.toString().padStart(2)} (${hexCallIndex})`);
              }
            });
          }
        }
        console.log();
      }
    }
  }

  // 3. Generate Solidity Code Updates
  console.log('\n📝 SOLIDITY CODE UPDATES FOR SWEEPER.SOL');
  console.log('='.repeat(60));

  if (assetMap['DOT']) {
    console.log(`// Line 239: Update DOT asset ID`);
    console.log(`uint32 assetInId = ${assetMap['DOT'].id}; // DOT on Hydration\n`);
  }

  if (assetMap['USDC']) {
    console.log(`// Line 242: Update USDC asset ID`);
    console.log(`uint32 usdcId = ${assetMap['USDC'].id}; // USDC on Hydration\n`);
  }

  const routerPallet = pallets.find((p: any) =>
    p.name.toString().toLowerCase().includes('router')
  );

  if (routerPallet) {
    const routerIndex = routerPallet.index.toNumber();
    const hexRouterIndex = routerIndex.toString(16).padStart(2, '0');

    console.log(`// Line 291: Update pallet index`);
    console.log(`hex"${hexRouterIndex}" // Router pallet index (${routerIndex})\n`);

    // Try to find swap call
    if (routerPallet.calls.isSome) {
      console.log(`// Line 292: Update call index (find 'swap' or 'sell' call above)`);
      console.log(`// Common patterns: sell, buy, swap_exact_tokens_for_tokens`);
    }
  }

  // 4. Omnipool State Check
  console.log('\n💧 OMNIPOOL STATE CHECK');
  console.log('='.repeat(60));

  try {
    const omnipoolAssets = await api.query.omnipool.assets.entries();
    console.log(`Active Omnipool assets: ${omnipoolAssets.length}`);

    for (const [key, value] of omnipoolAssets.slice(0, 10)) {
      const assetId = key.args[0].toString();
      const state = value.toJSON() as any;

      const symbol = assetMap[Object.keys(assetMap).find(k => assetMap[k].id === assetId) || '']?.name || assetId;

      console.log(`  ${symbol.padEnd(10)} (ID: ${assetId.padStart(4)}) -> Tradable: ${state?.tradable?.bits !== 0 ? '✅' : '❌'}`);
    }
  } catch (e) {
    console.log('  ⚠️  Could not query Omnipool state');
  }

  // 5. Test Swap Encoding
  console.log('\n🧪 SAMPLE SWAP CALL ENCODING');
  console.log('='.repeat(60));

  if (assetMap['DOT'] && assetMap['USDC']) {
    try {
      // Try to encode a sample swap
      const swapCall = api.tx.router?.sell?.(
        assetMap['DOT'].id,
        assetMap['USDC'].id,
        '1000000000000', // 0.0001 DOT (10 decimals)
        0, // min amount out
        []
      );

      if (swapCall) {
        console.log('✅ Successfully encoded swap call:');
        console.log(`   Method: ${swapCall.method.section}.${swapCall.method.method}`);
        console.log(`   Encoded: ${swapCall.toHex()}`);
        console.log(`\n   This confirms the pallet and call indices are correct!`);
      }
    } catch (e) {
      console.log('⚠️  Could not encode sample swap (method might not exist)');
      console.log(`   Error: ${e}`);
    }
  }

  // 6. Weight Benchmarking Info
  console.log('\n⚖️  WEIGHT BENCHMARKING');
  console.log('='.repeat(60));
  console.log('To get accurate weight limits, you need to:');
  console.log('1. Fund a test account on Hydration');
  console.log('2. Execute a real swap transaction');
  console.log('3. Monitor the event: system.ExtrinsicSuccess');
  console.log('4. Extract the "actual_weight" field');
  console.log('5. Add 20-30% buffer for XCM overhead');
  console.log('\nExample code:');
  console.log(`
const tx = api.tx.router.sell(
  ${assetMap['DOT']?.id || 0},
  ${assetMap['USDC']?.id || 10},
  '100000000000', // 0.001 DOT
  0,
  []
);

const result = await tx.signAndSend(signer, ({ status, events }) => {
  if (status.isInBlock) {
    events.forEach(({ event }) => {
      if (event.method === 'ExtrinsicSuccess') {
        const weight = event.data[0].weight.toJSON();
        console.log('Actual weight:', weight);
      }
    });
  }
});
`);

  await api.disconnect();
  console.log('\n✅ Done!\n');
}

main().catch(console.error);
