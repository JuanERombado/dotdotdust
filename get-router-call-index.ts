/**
 * Router Call Index Extraction
 * Extracts the specific call index for Router.sell() on Hydration
 *
 * Usage: npx ts-node get-router-call-index.ts
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

async function main() {
  console.log('🔍 Extracting Router Call Indices from Hydration...\n');

  const provider = new WsProvider('wss://rpc.hydradx.cloud');
  const api = await ApiPromise.create({ provider });

  console.log('✅ Connected to Hydration');
  console.log(`   Chain: ${api.runtimeChain.toString()}`);
  console.log(`   Runtime: ${api.runtimeVersion.specName.toString()} v${api.runtimeVersion.specVersion.toString()}\n`);

  // Get Router pallet metadata
  const metadata = api.runtimeMetadata;
  const pallets = metadata.asLatest.pallets;

  // Find Router pallet
  const routerPallet = pallets.find(p => p.name.toString().toLowerCase() === 'router');

  if (!routerPallet) {
    console.log('❌ Router pallet not found in metadata\n');
    console.log('Available pallets:');
    pallets.forEach(p => console.log(`   - ${p.name.toString()}`));
    await api.disconnect();
    return;
  }

  console.log('📊 Router Pallet Information');
  console.log('='.repeat(70));
  console.log(`Pallet Index: ${routerPallet.index.toNumber()}`);
  console.log(`Pallet Name: ${routerPallet.name.toString()}\n`);

  // Get calls
  if (!routerPallet.calls.isSome) {
    console.log('❌ Router pallet has no calls defined\n');
    await api.disconnect();
    return;
  }

  const callsType = routerPallet.calls.unwrap();
  const callsTypeId = callsType.type.toNumber();

  console.log('📋 Router Calls:');
  console.log('='.repeat(70));

  // Get the type registry
  const registry = api.registry;
  const callsTypeDef = registry.lookup.getTypeDef(callsTypeId);

  // Extract call variants
  if (callsTypeDef.type === 'Enum') {
    const variants = callsTypeDef.sub;

    if (Array.isArray(variants)) {
      // Sort by index
      const sortedVariants = [...variants].sort((a: any, b: any) => {
        return (a.index || 0) - (b.index || 0);
      });

      for (const variant of sortedVariants) {
        const callName = variant.name || 'Unknown';
        const callIndex = variant.index !== undefined ? variant.index : 'N/A';

        console.log(`${callIndex.toString().padStart(3)} | ${callName}`);

        // Highlight the sell call
        if (typeof callName === 'string' && callName.toLowerCase() === 'sell') {
          console.log(`    ⭐ FOUND: Router.sell at index ${callIndex}`);
        }
      }
    } else {
      console.log('⚠️  Calls are not in expected array format');
      console.log('Variants:', variants);
    }
  } else {
    console.log('⚠️  Calls type is not an Enum');
    console.log('Type:', callsTypeDef.type);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🎯 RESULT');
  console.log('='.repeat(70) + '\n');

  // Try to get the specific call index for 'sell'
  try {
    // Create a dummy sell call to inspect its encoding
    const sellCall = api.tx.router.sell(
      5,        // assetIn (DOT)
      22,       // assetOut (USDC)
      1000000,  // amountIn
      500000,   // minAmountOut
      []        // route
    );

    const callHex = sellCall.method.toHex();
    console.log('Sample Router.sell call encoding:');
    console.log(`Full hex: ${callHex}`);
    console.log(`First byte (call index): ${callHex.slice(2, 4)}\n`);

    console.log('='.repeat(70));
    console.log('💡 UPDATE SWEEPER.SOL');
    console.log('='.repeat(70) + '\n');
    console.log(`Line 329: Update Router call index from hex"00" to hex"${callHex.slice(2, 4)}"\n`);
    console.log('Before:');
    console.log('    hex"00",        // Router.sell call index (PLACEHOLDER)\n');
    console.log('After:');
    console.log(`    hex"${callHex.slice(2, 4)}",        // Router.sell call index (VERIFIED)\n`);

  } catch (e) {
    console.log('⚠️  Could not create sample sell call');
    console.log(`Error: ${e}\n`);
  }

  await api.disconnect();
  console.log('✅ Done!\n');
}

main().catch(console.error);
