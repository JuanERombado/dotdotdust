const { ApiPromise, WsProvider } = require("@polkadot/api");
const { u8aToHex } = require("@polkadot/util");
const { decodeAddress } = require("@polkadot/util-crypto");

const USER_ADDRESS = "15mYuEYUYN2vMuuQndfxDvnKGVBhN57J3aLmQJTRdFEqxU9P";

async function main() {
    console.log(`🕵️ VERIFYING PURGE SUCCESS for ${USER_ADDRESS}...`);
    
    // 1. Check Astar (Source)
    const astarProvider = new WsProvider("ws://localhost:8001");
    const astarApi = await ApiPromise.create({ provider: astarProvider });
    await astarApi.isReady;
    const astarAccount = await astarApi.query.system.account(USER_ADDRESS);
    console.log(`\n📉 Astar Balance (Source): ${astarAccount.data.free.toHuman()} (Should be low)`);
    await astarApi.disconnect();

    // 2. Check Asset Hub (Destination)
    const assetHubProvider = new WsProvider("ws://localhost:8003");
    const assetHubApi = await ApiPromise.create({ provider: assetHubProvider });
    await assetHubApi.isReady;
    
    console.log("\n📈 Checking Asset Hub (Destination)...");
    
    // Check Native DOT Balance
    const ahAccount = await assetHubApi.query.system.account(USER_ADDRESS);
    console.log(`   DOT (Native): ${ahAccount.data.free.toHuman()}`);

    // Check Astar (Foreign Asset)
    // We need to know the Asset ID for Astar on Asset Hub.
    // Usually it's registered as a ForeignAsset. Ideally we query 'assets.account' or 'foreignAssets.account'.
    // In this simulation setup, Astar might not be fully registered as a foreign asset on AH yet?
    // But if XCM succeeded, it sits in "Holding" or fails if not registered?
    // BUT the user said "It went through".
    // If it's not registered, it might be trapped.
    // Let's check 'assets' pallet.
    
    // Assuming ASTR is NOT registered, checking System Account is the best proxy for DOT.
    // If we Teleported DOT, it would be here.
    // Wait, the User purged ASTR.
    // ASTR on AssetHub is a Foreign Asset.
    // If we only purged ASTR, checking DOT balance won't help unless we converted it?
    // But earlier I verified DOT -> AssetHub.
    
    // Let's list all assets for the account if possible.
    try {
        if (assetHubApi.query.assets) {
            const entries = await assetHubApi.query.assets.account.entries();
            // This dumps EVERYTHING. Too big.
            // Let's try to query specific likely IDs if we knew them.
        }
        
        if (assetHubApi.query.foreignAssets) {
             const entries = await assetHubApi.query.foreignAssets.account.entries();
             // entries is [ [StorageKey, Option<AccountData>] ]
             // Key args: [assetId, accountId]
             
             let found = false;
             for (const [key, value] of entries) {
                 const args = key.args;
                 const accountId = args[1]; // usually second arg
                 if (accountId.eq(USER_ADDRESS)) {
                     console.log(`   Foreign Asset ${args[0].toHuman()}: ${value.unwrap().balance.toHuman()}`);
                     found = true;
                 }
             }
             if (!found) console.log("   No Foreign Assets found for user.");
        }
    } catch (e) {
        console.log("   Could not query foreign assets:", e.message);
    }
    
    await assetHubApi.disconnect();
    process.exit(0);
}

main().catch(console.error);
