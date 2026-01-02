/**
 * Get Router pallet call indices from Hydration
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

async function main() {
  console.log('🔍 Fetching Router pallet calls...\n');

  const provider = new WsProvider('wss://rpc.hydradx.cloud');
  const api = await ApiPromise.create({ provider });

  console.log('✅ Connected to Hydration\n');

  // Get metadata
  const metadata = await api.rpc.state.getMetadata();
  const pallets = metadata.asLatest.pallets;

  // Find Router pallet (index 67 / 0x43)
  const routerPallet = pallets.find((p: any) => p.name.toString() === 'Router');

  if (routerPallet && routerPallet.calls.isSome) {
    console.log('📦 ROUTER PALLET CALLS:\n');
    console.log('============================================================');

    const calls = routerPallet.calls.unwrap();
    const callsType = metadata.registry.lookup.getTypeDef(calls.type.toNumber());

    if (callsType.type === 'Enum' && callsType.sub && Array.isArray(callsType.sub)) {
      callsType.sub.forEach((call: any, idx: number) => {
        const callName = call.name || `call_${idx}`;
        const hexCallIndex = '0x' + idx.toString(16).padStart(2, '0');

        // Highlight swap-related calls
        if (callName.toLowerCase().includes('sell') ||
            callName.toLowerCase().includes('buy') ||
            callName.toLowerCase().includes('swap')) {
          console.log(`⭐ ${callName.padEnd(40)} -> Index: ${idx.toString().padStart(2)} (${hexCallIndex})`);

          // Show call parameters if available
          if (call.type) {
            const callType = metadata.registry.lookup.getTypeDef(call.type);
            if (callType && callType.sub && Array.isArray(callType.sub)) {
              console.log(`   Parameters:`);
              callType.sub.forEach((param: any) => {
                console.log(`     - ${param.name}: ${param.type}`);
              });
            }
          }
          console.log();
        } else {
          console.log(`   ${callName.padEnd(40)} -> Index: ${idx.toString().padStart(2)} (${hexCallIndex})`);
        }
      });
    }

    console.log('\n============================================================');
    console.log('💡 RECOMMENDATION:');
    console.log('============================================================');
    console.log('Look for "sell" call - this is typically used for:');
    console.log('  sell(asset_in, asset_out, amount_in, min_amount_out, route)');
    console.log('\nUpdate Sweeper.sol line 322 with the call index shown above.');
  } else {
    console.log('❌ Router pallet or calls not found');
  }

  await api.disconnect();
  console.log('\n✅ Done!\n');
}

main().catch(console.error);
