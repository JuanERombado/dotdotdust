import { setupContext } from "@acala-network/chopsticks/context";
import { ChopsticksProvider } from "@acala-network/chopsticks-core";
import { ApiPromise } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";

const HYDRA_ENDPOINT = "wss://rpc.hydradx.cloud";
const DOT_ASSET_ID = 5;
const target_ASSET_ID = 0; // LRNA (Always in Omnipool)

async function runSimulation() {
    console.log("🚀 Initializing Hydration Swap Simulation...");

    try {
        const { chain } = await setupContext({
            endpoint: HYDRA_ENDPOINT,
        });

        // Use ChopsticksProvider directly
        const provider = new ChopsticksProvider(chain);
        const api = await ApiPromise.create({
            provider,
        });

        const keyring = new Keyring({ type: 'sr25519' });
        const ALICE = keyring.addFromUri('//Alice');

        console.log("✅ Hydration Forked.");

        // 0. List Omnipool Assets
        const assets = await api.query.omnipool.assets.entries();
        console.log("📊 Omnipool Assets:", assets.map(([key, _]) => key.args[0].toString()));
        console.log("🛠 Injecting 100 DOT into Alice's account (Tokens + System)...");
        await api.rpc('dev_setStorage', {
            Tokens: {
                Accounts: [
                    [[ALICE.address, { Token: DOT_ASSET_ID }], { free: 100 * 10**10 }]
                ]
            },
            System: {
                Account: [
                    [[ALICE.address], { nonce: 0, consumers: 0, providers: 1, sufficients: 0, data: { free: 100 * 10**10, reserved: 0, frozen: 0 } }]
                ]
            }
        });

        const initialTokens = await api.query.tokens.accounts(ALICE.address, { Token: DOT_ASSET_ID });
        const initialSystem = await api.query.system.account(ALICE.address);
        console.log(`💰 Alice's Tokens(DOT): ${initialTokens.free.toString()}`);
        console.log(`💰 Alice's System(DOT): ${initialSystem.data.free.toString()}`);
        console.log(`💰 Alice's System(Nonce): ${initialSystem.nonce.toString()}`);

        // 2. Simulate Omnipool Swap (Sell 10 DOT for target)
        console.log("🔄 Executing Omnipool Sell (10 DOT -> LRNA)...");
        const tx = api.tx.omnipool.sell(
            DOT_ASSET_ID,
            target_ASSET_ID,
            10 * 10**10,
            0
        );
        await tx.signAsync(ALICE);

        // Dry run using the chain instance (confirmed to have this method)
        console.log("🧪 Performing Dry Run...");
        const result = await chain.dryRunExtrinsic(tx.toHex());
        
        console.log("✅ Swap Dry Run Result Data Available.");
        const outcome = result.outcome.toHuman();
        console.log("📊 Outcome Status:", JSON.stringify(outcome, null, 2));

        if (result.outcome.isOk && result.outcome.asOk.isErr) {
            const dispatchError = result.outcome.asOk.asErr;
            if (dispatchError.isModule) {
                const decoded = api.registry.findMetaError(dispatchError.asModule);
                const { docs, name, section } = decoded;
                console.log(`❌ Pallet Error: ${section}.${name}: ${docs.join(' ')}`);
            } else {
                console.log(`❌ Dispatch Error: ${dispatchError.toString()}`);
            }
        }
        
        // We can also check the storage diff to see the USDC balance increase
        // result.storageDiff is a list of [key, value] pairs

        await chain.close();
        console.log("✨ Simulation Finished.");
        
    } catch (err) {
        console.error("❌ Simulation Error:", err);
    }
    process.exit(0);
}

runSimulation();
