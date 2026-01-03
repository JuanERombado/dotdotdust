/**
 * Enhanced Asset ID Extraction for Hydration
 * Tries multiple methods to find DOT and USDC asset IDs
 *
 * Usage: npx ts-node extract-asset-ids.ts
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

interface AssetInfo {
  id: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  method: string;
}

async function main() {
  console.log('🔍 Extracting Asset IDs from Hydration...\n');
  console.log('Trying multiple methods for maximum reliability\n');

  const provider = new WsProvider('wss://rpc.hydradx.cloud');
  const api = await ApiPromise.create({ provider });

  console.log('✅ Connected to Hydration');
  console.log(`   Chain: ${api.runtimeChain.toString()}`);
  console.log(`   Runtime: ${api.runtimeVersion.specName.toString()} v${api.runtimeVersion.specVersion.toString()}\n`);

  const foundAssets: Map<string, AssetInfo> = new Map();
  const targetsSymbols = ['DOT', 'USDC', 'USDT', 'ASTR', 'HDX', 'GLMR', 'ACA', 'BNC', 'INTR'];

  // ========================================================================
  // METHOD 1: Query AssetRegistry.assets
  // ========================================================================
  console.log('📊 METHOD 1: Querying AssetRegistry.assets');
  console.log('='.repeat(70));

  try {
    const assets = await api.query.assetRegistry.assets.entries();
    console.log(`Found ${assets.length} registered assets\n`);

    for (const [key, value] of assets) {
      const assetId = key.args[0].toString();
      const assetData = value.toJSON() as any;

      if (assetData) {
        const symbol = assetData.symbol || assetData.name;
        const name = assetData.name;
        const decimals = assetData.decimals;

        if (symbol && targetsSymbols.includes(symbol)) {
          foundAssets.set(symbol, {
            id: assetId,
            symbol: symbol,
            name: name,
            decimals: decimals,
            method: 'AssetRegistry.assets'
          });
          console.log(`✅ ${symbol.padEnd(6)} -> ID: ${assetId.padStart(6)} (${decimals} decimals) via AssetRegistry`);
        }
      }
    }
  } catch (e) {
    console.log(`⚠️  AssetRegistry query failed: ${e}\n`);
  }

  // ========================================================================
  // METHOD 2: Query AssetRegistry.assetIds (reverse lookup)
  // ========================================================================
  console.log('\n📊 METHOD 2: Querying AssetRegistry.assetIds (reverse lookup)');
  console.log('='.repeat(70));

  try {
    for (const symbol of targetsSymbols) {
      if (foundAssets.has(symbol)) continue; // Skip if already found

      const assetId = await api.query.assetRegistry.assetIds(symbol);
      if (assetId && !assetId.isEmpty) {
        const id = assetId.toString();
        console.log(`✅ ${symbol.padEnd(6)} -> ID: ${id.padStart(6)} via reverse lookup`);

        // Get full metadata
        const metadata = await api.query.assetRegistry.assets(id);
        const metadataJson = metadata.toJSON() as any;

        foundAssets.set(symbol, {
          id: id,
          symbol: symbol,
          name: metadataJson?.name,
          decimals: metadataJson?.decimals,
          method: 'AssetRegistry.assetIds'
        });
      }
    }
  } catch (e) {
    console.log(`⚠️  Reverse lookup failed: ${e}\n`);
  }

  // ========================================================================
  // METHOD 3: Query specific well-known asset IDs
  // ========================================================================
  console.log('\n📊 METHOD 3: Checking well-known asset IDs');
  console.log('='.repeat(70));

  const wellKnownIds: Record<string, number[]> = {
    'HDX': [0],           // Hydration native token is typically 0
    'DOT': [5, 1001],     // Common DOT IDs on parachains
    'USDC': [10, 1337, 1984, 2], // Common USDC IDs
    'USDT': [11, 13],
    'ASTR': [9, 8],
  };

  for (const [symbol, candidateIds] of Object.entries(wellKnownIds)) {
    if (foundAssets.has(symbol)) continue;

    for (const candidateId of candidateIds) {
      try {
        const metadata = await api.query.assetRegistry.assets(candidateId);
        const metadataJson = metadata.toJSON() as any;

        if (metadataJson && (metadataJson.symbol === symbol || metadataJson.name === symbol)) {
          console.log(`✅ ${symbol.padEnd(6)} -> ID: ${candidateId.toString().padStart(6)} via well-known ID check`);
          foundAssets.set(symbol, {
            id: candidateId.toString(),
            symbol: symbol,
            name: metadataJson.name,
            decimals: metadataJson.decimals,
            method: 'Well-known IDs'
          });
          break;
        }
      } catch (e) {
        // Silent fail, try next ID
      }
    }
  }

  // ========================================================================
  // METHOD 4: Query Omnipool assets directly
  // ========================================================================
  console.log('\n📊 METHOD 4: Querying Omnipool.assets');
  console.log('='.repeat(70));

  try {
    const omnipoolAssets = await api.query.omnipool.assets.entries();
    console.log(`Found ${omnipoolAssets.length} assets in Omnipool\n`);

    for (const [key, value] of omnipoolAssets) {
      const assetId = key.args[0].toString();

      // Try to get asset metadata
      const metadata = await api.query.assetRegistry.assets(assetId);
      const metadataJson = metadata.toJSON() as any;

      if (metadataJson) {
        const symbol = metadataJson.symbol || metadataJson.name;

        if (symbol && targetsSymbols.includes(symbol) && !foundAssets.has(symbol)) {
          foundAssets.set(symbol, {
            id: assetId,
            symbol: symbol,
            name: metadataJson.name,
            decimals: metadataJson.decimals,
            method: 'Omnipool.assets'
          });
          console.log(`✅ ${symbol.padEnd(6)} -> ID: ${assetId.padStart(6)} (${metadataJson.decimals} decimals) via Omnipool`);
        }
      }
    }
  } catch (e) {
    console.log(`⚠️  Omnipool query failed: ${e}\n`);
  }

  // ========================================================================
  // RESULTS SUMMARY
  // ========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('📋 FINAL RESULTS');
  console.log('='.repeat(70) + '\n');

  if (foundAssets.size === 0) {
    console.log('❌ No assets found. This might indicate:');
    console.log('   1. Different asset registry structure on Hydration');
    console.log('   2. Assets use numeric IDs without text symbols');
    console.log('   3. Need to query chain state directly\n');
    console.log('💡 RECOMMENDATION: Use Polkadot.js Apps UI to manually verify:');
    console.log('   https://polkadot.js.org/apps/?rpc=wss://rpc.hydradx.cloud#/chainstate\n');
  } else {
    console.log('✅ FOUND ASSETS:\n');

    const table: Array<[string, string, string, string, string]> = [];

    for (const [symbol, info] of foundAssets.entries()) {
      table.push([
        symbol,
        info.id,
        info.decimals?.toString() || 'N/A',
        info.name || 'N/A',
        info.method
      ]);
    }

    // Sort by symbol
    table.sort((a, b) => a[0].localeCompare(b[0]));

    console.log('Symbol | Asset ID | Decimals | Name              | Method');
    console.log('-------|----------|----------|-------------------|-------------------------');
    for (const [symbol, id, decimals, name, method] of table) {
      console.log(
        `${symbol.padEnd(6)} | ${id.padStart(8)} | ${decimals.padStart(8)} | ${name.padEnd(17)} | ${method}`
      );
    }

    // ========================================================================
    // SOLIDITY CODE GENERATION
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('📝 SOLIDITY CODE UPDATES');
    console.log('='.repeat(70) + '\n');

    if (foundAssets.has('DOT')) {
      const dotInfo = foundAssets.get('DOT')!;
      console.log(`// Line 370: Update DOT asset ID`);
      console.log(`uint32 assetInId = ${dotInfo.id}; // DOT on Hydration (${dotInfo.decimals} decimals)\n`);
    } else {
      console.log(`⚠️  DOT asset ID not found - needs manual verification\n`);
    }

    if (foundAssets.has('USDC')) {
      const usdcInfo = foundAssets.get('USDC')!;
      console.log(`// Line 255 & 260: Update USDC asset ID`);
      console.log(`uint32 usdcId = ${usdcInfo.id}; // USDC on Hydration (${usdcInfo.decimals} decimals)\n`);
    } else {
      console.log(`⚠️  USDC asset ID not found - needs manual verification\n`);
    }

    // ========================================================================
    // NEXT STEPS
    // ========================================================================
    console.log('='.repeat(70));
    console.log('🎯 NEXT STEPS');
    console.log('='.repeat(70) + '\n');

    const missingCritical = [];
    if (!foundAssets.has('DOT')) missingCritical.push('DOT');
    if (!foundAssets.has('USDC')) missingCritical.push('USDC');

    if (missingCritical.length > 0) {
      console.log(`⚠️  CRITICAL: Missing ${missingCritical.join(', ')} asset IDs\n`);
      console.log('MANUAL VERIFICATION REQUIRED:');
      console.log('1. Go to: https://polkadot.js.org/apps/?rpc=wss://rpc.hydradx.cloud');
      console.log('2. Navigate to: Developer → Chain State');
      console.log('3. Query: assetRegistry → assets');
      console.log('4. Look for DOT and USDC entries');
      console.log('5. Note the asset IDs\n');
    } else {
      console.log('✅ All critical assets found!');
      console.log('✅ Ready to update Sweeper.sol\n');
      console.log('Update these lines:');
      console.log(`   - Line 370: assetInId = ${foundAssets.get('DOT')!.id}`);
      console.log(`   - Lines 255, 260: USDC ID = ${foundAssets.get('USDC')!.id}`);
    }
  }

  await api.disconnect();
  console.log('\n✅ Done!\n');
}

main().catch(console.error);
