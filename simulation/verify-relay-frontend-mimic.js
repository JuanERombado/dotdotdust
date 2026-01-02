const { ApiPromise, WsProvider } = require("@polkadot/api");
const { Keyring } = require("@polkadot/keyring");
const { u8aToHex } = require("@polkadot/util");
const { decodeAddress } = require("@polkadot/util-crypto");

async function main() {
    console.log("🕵️ DEEP DIVE RELAY CHAIN...");
    
    const provider = new WsProvider("ws://localhost:8000");
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    const keyring = new Keyring({ type: 'sr25519' });
    const alice = keyring.addFromUri('//Alice');
    const alicePubKey = u8aToHex(decodeAddress(alice.address));

    // Common Params
    const dest = { V3: { parents: 0, interior: { X1: { Parachain: 1000 } } } };
    const ben = { V3: { parents: 0, interior: { X1: { AccountId32: { network: null, id: alicePubKey } } } } };
    const assets = { V3: [{ id: { Concrete: { parents: 0, interior: "Here" } }, fun: { Fungible: BigInt(10000000000) } }] };

    // 1. Test limitedTeleportAssets with { Unlimited: null } (Current Frontend)
    console.log("\n🧪 Test 1: limitedTeleportAssets ({ Unlimited: null })");
    try {
        const tx = api.tx.xcmPallet.limitedTeleportAssets(dest, ben, assets, 0, { Unlimited: null });
        await submit(api, tx, alice, "Test 1");
    } catch (e) {
        console.error("Test 1 Failed Construction:", e.message);
    }

    // 2. Test limitedTeleportAssets with "Unlimited" (Old Frontend)
    console.log("\n🧪 Test 2: limitedTeleportAssets ('Unlimited')");
    try {
        const tx = api.tx.xcmPallet.limitedTeleportAssets(dest, ben, assets, 0, "Unlimited");
        await submit(api, tx, alice, "Test 2");
    } catch (e) {
        console.error("Test 2 Failed Construction:", e.message);
    }

    // 3. Test transferAssets (Alternative)
    console.log("\n🧪 Test 3: transferAssets ({ Unlimited: null })");
    try {
        if (api.tx.xcmPallet.transferAssets) {
            const tx = api.tx.xcmPallet.transferAssets(dest, ben, assets, 0, { Unlimited: null });
            await submit(api, tx, alice, "Test 3");
        } else {
            console.log("Skipping Test 3: transferAssets not found");
        }
    } catch (e) {
        console.error("Test 3 Failed Construction:", e.message);
    }

    process.exit(0);
}

async function submit(api, tx, signer, label) {
    try {
        await new Promise((resolve) => {
            tx.signAndSend(signer, ({ status, dispatchError }) => {
                if (status.isInBlock) {
                    if (dispatchError) {
                         console.error(`❌ ${label} Failed:`);
                         if (dispatchError.isModule) {
                             const decoded = api.registry.findMetaError(dispatchError.asModule);
                             console.error(`   ${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`);
                             if (decoded.name === 'LocalExecutionIncompleteWithError') {
                                 // How to get inner error? It's in the event?
                                 console.error("   (Check logs for inner error code)");
                             }
                         } else {
                             console.error(`   ${dispatchError.toString()}`);
                         }
                    } else {
                        console.log(`✅ ${label} Succeeded!`);
                    }
                    resolve();
                }
            });
        });
    } catch (e) {
        console.error(`❌ ${label} Exception:`, e.message);
    }
}

main().catch(console.error);
