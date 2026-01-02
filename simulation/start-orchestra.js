const { setupWithServer } = require("@acala-network/chopsticks");
const { connectParachains, connectVertical } = require("@acala-network/chopsticks-core");
const fs = require("fs");
const path = require("path");
const { ApiPromise, WsProvider } = require("@polkadot/api");

async function main() {
    process.env.DISABLE_PLUGINS = 'true';
    
    console.log("🎻 Launching The Connected Orchestra...");
    
    // 1. Initialise Relaychain (DOT)
    console.log("   - Initializing Polkadot (Relay) on port 8000...");
    const dotConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "dot.json"), 'utf8'));
    const { chain: relaychain } = await setupWithServer(dotConfig);

    // 2. Initialise Parachains
    const paraConfigs = [
        { file: "astar.json", name: "Astar" },
        { file: "hydra.json", name: "Hydra" },
        { file: "assethub.json", name: "AssetHub" }
    ];

    const parachains = [];
    for (const p of paraConfigs) {
        console.log(`   - Initializing ${p.name} on port ${p.name === 'Astar' ? 8001 : p.name === 'Hydra' ? 8002 : 8003}...`);
        const config = JSON.parse(fs.readFileSync(path.join(__dirname, p.file), 'utf8'));
        const { chain } = await setupWithServer(config);
        parachains.push(chain);
    }

    console.log("🔗 Linking Parachains (Horizontal HRMP)...");
    await connectParachains(parachains, false);

    console.log("垂直 Linking to Relaychain (Vertical UMP/DMP)...");
    for (const parachain of parachains) {
        await connectVertical(relaychain, parachain);
    }

    // PATCH: Force Asset Hub (1000) to be a Parachain in Relay State
    // Using external connection to ensure we have full access to the running node.
    console.log("🛠 Connecting to Relay for Patching...");
    const provider = new WsProvider("ws://localhost:8000");
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    const paraId = 1000;
    const key = api.query.paras.paraLifecycles.key(paraId);
    const parachainHex = api.createType('ParaLifecycle', 'Parachain').toHex();
    const currentLifecycle = await api.query.paras.paraLifecycles(paraId);
    
    if (currentLifecycle.toHex() !== parachainHex) {
        console.log("🛠 PATCHING: Upgrading Para 1000 from Parathread to Parachain...");
        await provider.send('dev_setStorage', [[
            [key, parachainHex]
        ]]);
        console.log("✅ PATCH APPLIED: Para 1000 is now a Parachain.");
    } else {
        console.log("✅ Para 1000 is already a Parachain.");
    }
    
    await api.disconnect();

    console.log("✅ All chains linked and live!");
    
    process.on('SIGINT', async () => {
        console.log('\nShutting down orchestra...');
        await relaychain.close();
        for (const chain of parachains) await chain.close();
        process.exit(0);
    });
}

main().catch(e => {
    console.error("❌ Orchestra Crash:");
    console.error(e);
    process.exit(1);
});
