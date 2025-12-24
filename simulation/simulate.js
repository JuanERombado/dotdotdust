import { setupContext } from "@acala-network/chopsticks";
import { ApiPromise, WsProvider } from "@polkadot/api";

const ASTAR_ENDPOINT = "wss://rpc.astar.network";
const HYDRA_ENDPOINT = "wss://rpc.hydradx.cloud";

async function runSimulation() {
    console.log("🚀 Initializing Chopsticks Simulation (Forked State)...");

    try {
        // 1. Setup Astar Fork (Source)
        const astarContext = await setupContext({
            endpoint: ASTAR_ENDPOINT,
            blockNumber: "latest",
        });
        const astarApi = astarContext.api;
        await astarApi.isReady;
        console.log("✅ Astar Forked at block:", (await astarApi.rpc.chain.getHeader()).number.toString());

        // 2. Setup Hydration Fork (Destination/Vault)
        const hydraContext = await setupContext({
            endpoint: HYDRA_ENDPOINT,
            blockNumber: "latest",
        });
        const hydraApi = hydraContext.api;
        await hydraApi.isReady;
        console.log("✅ Hydration Forked at block:", (await hydraApi.rpc.chain.getHeader()).number.toString());

        console.log("🛠 Simulation Environment Ready.");
        
        // Cleanup
        await astarContext.close();
        await hydraContext.close();
        
    } catch (err) {
        console.error("❌ Simulation Failed:", err);
    }

    process.exit(0);
}

runSimulation();
