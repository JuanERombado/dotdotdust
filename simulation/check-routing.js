const { ApiPromise, WsProvider } = require("@polkadot/api");

async function main() {
    console.log("🕵️ Checking Routing...");
    const provider = new WsProvider("ws://localhost:8000");
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    console.log("Connected to Relay.");

    const paraId = 1000;
    const key = api.query.paras.paraLifecycles.key(paraId);
    const lifecycle = await api.query.paras.paraLifecycles(paraId);
    console.log(`Para ${paraId} Lifecycle: ${lifecycle.toHuman()} (Raw: ${lifecycle.toHex()})`);

    // Override to Parachain
    // Parathread is likely 0 or 1. Parachain is likely 2.
    // Let's check api.createType('ParaLifecycle', 'Parachain').toHex()
    
    try {
        const parathreadHex = api.createType('ParaLifecycle', 'Parathread').toHex();
        const parachainHex = api.createType('ParaLifecycle', 'Parachain').toHex();
        
        console.log(`Parathread Hex: ${parathreadHex}`);
        console.log(`Parachain Hex: ${parachainHex}`);
        
        if (lifecycle.toHex() !== parachainHex) {
             console.log("⚠️ Forcing upgrade to Parachain...");
             await provider.send('dev_setStorage', [[
                 [key, parachainHex]
             ]]);
             
             // Verify
             const newLifecycle = await api.query.paras.paraLifecycles(paraId);
             console.log(`NEW Lifecycle: ${newLifecycle.toHuman()}`);
        } else {
            console.log("Already Parachain.");
        }

    } catch(e) { console.error(e); }

    const heads = await api.query.paras.heads(paraId);
    console.log(`Para ${paraId} Head: ${heads.isSome ? "Found" : "Missing"}`);
    
    try {
         const queue = await api.query.dmp.downwardMessageQueues(paraId);
         console.log(`DMP Queue Length: ${queue.length}`);
    } catch(e) { console.log("No DMP queue query"); }

    process.exit(0);
}

main().catch(console.error);
