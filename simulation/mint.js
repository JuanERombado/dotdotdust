const { ApiPromise, WsProvider } = require("@polkadot/api");

const { decodeAddress } = require("@polkadot/util-crypto");
const { u8aToHex } = require("@polkadot/util");

async function mint(port, address, amount, name) {
    const provider = new WsProvider(`ws://localhost:${port}`);
    try {
        console.log(`🪙  Minting to ${name} (Port ${port})...`);
        
        // Robust Connection Logic (Wait for Orchestra)
        const MAX_RETRIES = 10;
        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                await new Promise((resolve, reject) => {
                    if (provider.isConnected) return resolve();
                    provider.on('connected', resolve);
                    provider.on('error', (e) => reject(e));
                    // 3s timeout per attempt
                    setTimeout(() => reject(new Error("Timeout")), 3000);
                });
                break; // Connected!
            } catch (err) {
                if (i === MAX_RETRIES - 1) throw err;
                console.log(`   ⏳ Waiting for ${name} (Attempt ${i+1}/${MAX_RETRIES})...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Convert SS58 to Hex
        const publicKey = u8aToHex(decodeAddress(address));

        // Use dev_setStorage with Hex Key and FULL AccountInfo
        // We set providers: 1 to ensure the account is considered "alive" and can pay fees
        await provider.send('dev_setStorage', [{
            System: {
                Account: [[[publicKey], { 
                    nonce: 0, 
                    consumers: 1, 
                    providers: 1, 
                    sufficients: 0, 
                    data: { free: amount } 
                }]]
            }
        }]);

        console.log(`✅ ${name} balance set for ${address}`);
    } catch (e) {
        console.error(`❌ Failed to mint on ${name}:`, e.message);
    } finally {
        await provider.disconnect();
    }
}

async function main() {
    const targetAddress = process.argv[2] || "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
    console.log(`🚀 Target Address: ${targetAddress}`);

    // DOT (10 decimals) - Giving 100 DOT to be safe
    await mint(8000, targetAddress, "1000000000000", "Polkadot");
    // ASTR (18 decimals) - 1000 ASTR
    await mint(8001, targetAddress, "1000000000000000000000", "Astar");
    // HDX (12 decimals) - 1000 HDX
    await mint(8002, targetAddress, "1000000000000000", "Hydration");
}

main();
