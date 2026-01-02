const { ApiPromise, WsProvider } = require("@polkadot/api");
const { Keyring } = require("@polkadot/keyring");
const { u8aToHex } = require("@polkadot/util");
const { decodeAddress } = require("@polkadot/util-crypto");

async function main() {
    console.log("🕵️ DIAGNOSING SIMULATION STATE...");
    
    // 1. Check Relay Chain State for Para 1000
    const provider = new WsProvider("ws://localhost:8000");
    const api = await ApiPromise.create({ provider });
    await api.isReady;
    
    const paraId = 1000;
    const lifecycle = await api.query.paras.paraLifecycles(paraId);
    console.log(`\n📋 Para 1000 Lifecycle: ${lifecycle.toHuman()} (Raw: ${lifecycle.toHex()})`);
    
    if (lifecycle.toHex() !== '0x02') { // 0x02 is Parachain usually
         console.error("❌ CRITICAL: Asset Hub is NOT a Parachain! Cycle patch failed.");
    } else {
         console.log("✅ Asset Hub is a Parachain.");
    }

    // 2. Try to Teleport (Manual Test)
    console.log("\n🧪 Attempting Manual XCM Teleport...");
    const keyring = new Keyring({ type: 'sr25519' });
    const alice = keyring.addFromUri('//Alice');
    const alicePubKey = u8aToHex(decodeAddress(alice.address));
    const amount = BigInt(10000000000); // 1 DOT

    // Construct XCM
    let palletName;
    if (api.tx.xcmPallet) palletName = 'xcmPallet';
    else if (api.tx.polkadotXcm) palletName = 'polkadotXcm';

    const dest = { V3: { parents: 0, interior: { X1: { Parachain: 1000 } } } };
    const ben = { V3: { parents: 0, interior: { X1: { AccountId32: { network: null, id: alicePubKey } } } } };
    const xcmTeleport = {
        V3: [
            {
                WithdrawAsset: [
                    {
                        id: { Concrete: { parents: 0, interior: "Here" } },
                        fun: { Fungible: amount }
                    }
                ]
            },
            {
                InitiateTeleport: {
                    assets: { Wild: "All" },
                    dest: dest,
                    xcm: [
                        {
                            DepositAsset: {
                                assets: { Wild: "All" },
                                beneficiary: ben
                            }
                        }
                    ]
                }
            }
        ]
    };

    try {
        const tx = api.tx[palletName].execute(xcmTeleport, { refTime: BigInt(6000000000), proofSize: BigInt(200000) });
        await new Promise(resolve => {
            tx.signAndSend(alice, ({ status, events, dispatchError }) => {
                if (status.isInBlock || status.isFinalized) {
                    if (dispatchError) {
                        console.error("❌ Manual XCM FAILED:", dispatchError.toHuman());
                        if (dispatchError.isModule) {
                            const decoded = api.registry.findMetaError(dispatchError.asModule);
                            console.error(`   ${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`);
                        }
                    } else {
                        console.log("✅ Manual XCM SUCCESS! The chain is working.");
                    }
                    resolve();
                }
            });
        });
    } catch (e) {
        console.error("❌ Failed to construct/send XCM:", e.message);
    }

    process.exit(0);
}

main().catch(console.error);
