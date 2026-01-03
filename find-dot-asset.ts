/**
 * Aggressive DOT Asset ID Search
 * Brute-force checks asset IDs 0-100 to find DOT
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

async function main() {
  console.log('🔍 Aggressively searching for DOT asset ID...\n');

  const provider = new WsProvider('wss://rpc.hydradx.cloud');
  const api = await ApiPromise.create({ provider });

  console.log('✅ Connected to Hydration\n');

  const dotCandidates: Array<{id: number, symbol?: string, name?: string, decimals?: number}> = [];

  // Brute force check IDs 0-100
  console.log('📊 Checking asset IDs 0-100...\n');

  for (let id = 0; id <= 100; id++) {
    try {
      const metadata = await api.query.assetRegistry.assets(id);
      const metadataJson = metadata.toJSON() as any;

      if (metadataJson) {
        const symbol = metadataJson.symbol;
        const name = metadataJson.name;
        const decimals = metadataJson.decimals;

        // Check if this could be DOT
        const symbolStr = symbol?.toString() || '';
        const nameStr = name?.toString() || '';

        // Look for DOT, aDOT, wDOT, vDOT, etc.
        if (
          symbolStr.toUpperCase().includes('DOT') ||
          nameStr.toUpperCase().includes('DOT') ||
          symbolStr === 'DOT' ||
          nameStr === 'DOT' ||
          decimals === 10  // DOT typically has 10 decimals
        ) {
          console.log(`✅ Candidate ID ${id}: ${symbol} (${name}) - ${decimals} decimals`);
          dotCandidates.push({ id, symbol, name, decimals });
        }

        // Also show HDX for reference (should be ID 0)
        if (id === 0) {
          console.log(`   ID ${id}: ${symbol} (${name}) - ${decimals} decimals (Hydration native)`);
        }
      }
    } catch (e) {
      // Skip empty slots
    }

    // Progress indicator every 10 IDs
    if ((id + 1) % 10 === 0) {
      process.stdout.write(`   Checked ${id + 1}/100...\r`);
    }
  }

  console.log('\n');

  // Check Omnipool for any DOT-like assets
  console.log('📊 Checking Omnipool assets...\n');

  try {
    const omnipoolAssets = await api.query.omnipool.assets.entries();

    for (const [key, value] of omnipoolAssets) {
      const assetId = Number(key.args[0].toString());
      const metadata = await api.query.assetRegistry.assets(assetId);
      const metadataJson = metadata.toJSON() as any;

      if (metadataJson) {
        const symbol = metadataJson.symbol;
        const name = metadataJson.name;
        const decimals = metadataJson.decimals;

        const symbolStr = symbol?.toString() || '';
        const nameStr = name?.toString() || '';

        if (
          symbolStr.toUpperCase().includes('DOT') ||
          nameStr.toUpperCase().includes('DOT')
        ) {
          const exists = dotCandidates.some(c => c.id === assetId);
          if (!exists) {
            console.log(`✅ Omnipool candidate ID ${assetId}: ${symbol} (${name}) - ${decimals} decimals`);
            dotCandidates.push({ id: assetId, symbol, name, decimals });
          }
        }
      }
    }
  } catch (e) {
    console.log(`⚠️  Omnipool check failed: ${e}`);
  }

  // Results
  console.log('\n' + '='.repeat(70));
  console.log('📋 DOT CANDIDATES FOUND');
  console.log('='.repeat(70) + '\n');

  if (dotCandidates.length === 0) {
    console.log('❌ No DOT candidates found in asset IDs 0-100\n');
    console.log('💡 DOT might be represented differently on Hydration:');
    console.log('   - Could use a different name (e.g., "Polkadot", "wDOT", "aDOT")');
    console.log('   - Could be at a higher asset ID (>100)');
    console.log('   - Could require manual verification\n');
    console.log('🔗 MANUAL VERIFICATION:');
    console.log('   https://polkadot.js.org/apps/?rpc=wss://rpc.hydradx.cloud#/chainstate');
    console.log('   Query: assetRegistry → assets');
    console.log('   Look for: Any asset with symbol/name containing "DOT"\n');
  } else {
    console.log('Found candidates:\n');

    dotCandidates.sort((a, b) => a.id - b.id);

    for (const candidate of dotCandidates) {
      console.log(`ID: ${candidate.id.toString().padStart(3)}`);
      console.log(`   Symbol:   ${candidate.symbol || 'N/A'}`);
      console.log(`   Name:     ${candidate.name || 'N/A'}`);
      console.log(`   Decimals: ${candidate.decimals || 'N/A'}`);
      console.log();
    }

    console.log('='.repeat(70));
    console.log('💡 RECOMMENDATION');
    console.log('='.repeat(70) + '\n');

    // Find the most likely DOT candidate
    const exactMatch = dotCandidates.find(c =>
      c.symbol?.toString() === 'DOT' || c.name?.toString() === 'DOT'
    );

    const tenDecimalMatch = dotCandidates.find(c => c.decimals === 10);

    if (exactMatch) {
      console.log(`✅ Most likely DOT: Asset ID ${exactMatch.id}`);
      console.log(`   Symbol: ${exactMatch.symbol}, Decimals: ${exactMatch.decimals}\n`);
      console.log(`Update Sweeper.sol line 370:`);
      console.log(`   uint32 assetInId = ${exactMatch.id}; // DOT on Hydration\n`);
    } else if (tenDecimalMatch) {
      console.log(`⚠️  Possible DOT (10 decimals): Asset ID ${tenDecimalMatch.id}`);
      console.log(`   Symbol: ${tenDecimalMatch.symbol}, Name: ${tenDecimalMatch.name}\n`);
      console.log(`⚠️  Verify this is actually DOT before using!\n`);
    } else if (dotCandidates.length > 0) {
      console.log(`⚠️  Found ${dotCandidates.length} candidates but none are exact matches`);
      console.log(`   Manual verification required\n`);
    }
  }

  await api.disconnect();
  console.log('✅ Done!\n');
}

main().catch(console.error);
