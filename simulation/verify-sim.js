import { ApiPromise, WsProvider } from '@polkadot/api';

/**
 * verify-sim.js
 * Standalone script to verify if assets landed on the local Asset Hub fork.
 */

async function verify() {
    const AH_PORT = 8003;
    const SWEEPER = "0x6Ce61B60FF9c73e7D233221c2feFA501228c1dF2";
    
    console.log(`\n🔍 Connecting to Simulated Asset Hub on port ${AH_PORT}...`);
    
    try {
        const provider = new WsProvider(`ws://localhost:${AH_PORT}`);
        const api = await ApiPromise.create({ provider });

        console.log(`Connected to chain: ${await api.rpc.system.chain()}`);

        // 1. Check ASTR (Asset ID 1999 on our simulated AH)
        // Note: The Asset ID might differ depending on how the fork was state-initialized
        // But 1999 is our standard mapping for Astar-on-AH.
        const astrBalance: any = await api.query.assets.account(1999, SWEEPER);
        
        console.log("\n--- ASSET REPORT ---");
        if (astrBalance.isSome) {
            const amount = astrBalance.unwrap().balance;
            console.log(`✅ ASTR (Asset 1999) detected!`);
            console.log(`   Balance: ${amount.toString()} units`);
        } else {
            console.log(`❌ ASTR (Asset 1999) NOT found at ${SWEEPER}.`);
        }

        // 2. Check Native DOT (System Account)
        const dotAccount: any = await api.query.system.account(SWEEPER);
        console.log(`✅ Native DOT Balance: ${dotAccount.data.free.toString()} units`);

        console.log("\n--------------------");
        console.log("If balances > 0, your XCM Teleport was a success!");

        await api.disconnect();
    } catch (e: any) {
        console.error("\n❌ Verification Failed:", e.message);
        console.log("Ensure the 'AssetHub' window is open and showing logs.");
    }
}

verify();
