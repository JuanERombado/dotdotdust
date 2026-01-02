import { ApiPromise, WsProvider } from "@polkadot/api";
import { decodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { ethers } from "ethers";
// @polkadot/extension-dapp will be imported dynamically to prevent SSR errors

// Configuration for Simulation vs Real
// Managed internally by the service
let USE_SIMULATION = false;

export const SWEEPER_ADDRESS = "0x6Ce61B60FF9c73e7D233221c2feFA501228c1dF2";
const REVIVE_CHAIN_ID = 420420421; // Westend Asset Hub

const SWEEPER_ABI = [
    "function sweepBatch(address[] assets, uint256[] amounts) external payable",
    "event Swept(address indexed user, uint256 assetCount, string destination)"
];

const ENDPOINTS = {
    SIMULATION: {
        Polkadot: "ws://localhost:8000",
        Astar: "ws://localhost:8001",
        Hydration: "ws://localhost:8002",
        AssetHub: "ws://localhost:8003",
        // New chains - simulation endpoints (can use real endpoints for now)
        Moonbeam: "wss://wss.api.moonbeam.network",
        Acala: "wss://acala-rpc.dwellir.com",
        Bifrost: "wss://bifrost-polkadot.api.onfinality.io/public-ws",
        Interlay: "wss://api.interlay.io/parachain"
    },
    REAL: {
        Polkadot: "wss://rpc.polkadot.io",
        Astar: "wss://rpc.astar.network",
        Hydration: "wss://1rpc.io/hydra",
        Moonbeam: "wss://wss.api.moonbeam.network",
        Acala: "wss://acala-rpc.dwellir.com",
        Bifrost: "wss://bifrost-polkadot.api.onfinality.io/public-ws",
        Interlay: "wss://api.interlay.io/parachain",
        Revive: "https://westend-asset-hub-eth-rpc.polkadot.io"
    }
};

const ALICE_SUBSTRATE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

// Price cache interface
interface PriceCache {
    price: number;
    timestamp: number;
}

class ChainService {
    private apis: Record<string, ApiPromise> = {};
    private isConnecting = false;
    private simMode = false;
    private priceCache: Record<string, PriceCache> = {};
    private readonly PRICE_CACHE_TTL = 60000; // 60 seconds

    // Fallback prices if oracle fails (in DOT equivalent)
    private readonly FALLBACK_PRICES: Record<string, number> = {
        "DOT": 1.0,
        "ASTR": 0.05,   // ~$0.35 @ $7 DOT
        "HDX": 0.01,    // ~$0.07 @ $7 DOT
        "GLMR": 0.03,   // Moonbeam ~$0.20 @ $7 DOT
        "ACA": 0.007,   // Acala ~$0.05 @ $7 DOT
        "BNC": 0.04,    // Bifrost ~$0.30 @ $7 DOT
        "INTR": 0.0014  // Interlay ~$0.01 @ $7 DOT
    };

    toggleSimulation(enabled: boolean) {
        this.simMode = enabled;
        USE_SIMULATION = enabled;
        // Reset connections
        Object.values(this.apis).forEach(api => api.disconnect());
        this.apis = {};
        console.log(`🔄 Simulation Mode: ${enabled ? "ON" : "OFF"}`);
    }

    /**
     * Get asset price in DOT from Hydration Omnipool with caching
     * @param symbol Asset symbol (ASTR, HDX, etc.)
     * @returns Price in DOT (e.g., 1 ASTR = 0.05 DOT)
     */
    async getAssetPrice(symbol: string): Promise<number> {
        // DOT is always 1:1
        if (symbol === "DOT") return 1.0;

        // Check cache first
        const cached = this.priceCache[symbol];
        if (cached && (Date.now() - cached.timestamp) < this.PRICE_CACHE_TTL) {
            console.log(`[Oracle] Using cached price for ${symbol}: ${cached.price} DOT`);
            return cached.price;
        }

        try {
            // Query Hydration Omnipool for real price
            if (!this.apis["Hydration"]) {
                throw new Error("Hydration API not connected");
            }

            // Asset IDs in Hydration Omnipool
            // NOTE: These are EXAMPLES and must be verified on Hydration
            const assetIds: Record<string, number> = {
                "HDX": 0,    // HDX is asset 0 in Omnipool
                "ASTR": 9,   // Astar (verify actual ID)
                "GLMR": 16,  // Moonbeam (verify actual ID)
                "ACA": 2,    // Acala (verify actual ID)
                "BNC": 14,   // Bifrost (verify actual ID)
                "INTR": 15   // Interlay (verify actual ID)
            };

            const assetId = assetIds[symbol];
            if (assetId === undefined) {
                throw new Error(`Unknown asset: ${symbol}`);
            }

            const assetState: any = await this.apis["Hydration"].query.omnipool.assets(assetId);

            if (assetState.isNone) {
                throw new Error(`Asset ${symbol} not found in Omnipool`);
            }

            const { hubReserve, reserve, decimals } = assetState.unwrap();

            // Calculate spot price: hubReserve / reserve
            // Hub asset is DOT, so price is in DOT
            const hubReserveNum = Number(hubReserve) / 1e12; // DOT has 12 decimals in Omnipool
            const reserveNum = Number(reserve) / Math.pow(10, Number(decimals));
            const price = hubReserveNum / reserveNum;

            console.log(`[Oracle] ${symbol} price from Omnipool: ${price} DOT`);

            // Cache the price
            this.priceCache[symbol] = {
                price,
                timestamp: Date.now()
            };

            return price;

        } catch (error) {
            console.warn(`[Oracle] Failed to fetch ${symbol} price from Omnipool:`, error);
            console.log(`[Oracle] Using fallback price for ${symbol}`);

            // Return fallback price
            return this.FALLBACK_PRICES[symbol] || 0.01;
        }
    }

    async fetchChainAssets(address: string) {
        // In Sim Mode, scan the REAL address (User's Wallet) to see minted tokens
        const scanAddress = address;

        // Guard: EVM Address
        if (!this.simMode && scanAddress.startsWith("0x") && scanAddress.length === 42) {
            console.log("⚠️ EVM Address detected. Skipping Polkadot Relay Chain query (Mapping required).");
            return [];
        }

        // Enable multi-chain scanning in both sim and real mode
        // V1: 7 chains covering 75%+ of Polkadot ecosystem
        const targetChains = [
            "Polkadot",
            "Astar",
            "Hydration",
            "Moonbeam",  // EVM users
            "Acala",     // DeFi users
            "Bifrost",   // Liquid staking
            "Interlay"   // Bitcoin bridge
        ];
        
        for (const chain of targetChains) {
            if (!this.apis[chain]) {
                try {
                     const endpoints = this.simMode ? ENDPOINTS.SIMULATION : ENDPOINTS.REAL;
                     // @ts-ignore
                     const endpoint = endpoints[chain];
                     const provider = new WsProvider(endpoint);
                     const api = await ApiPromise.create({ provider, noInitWarn: true });
                     await api.isReady;
                     this.apis[chain] = api;
                } catch (e) {
                    console.log(`Could not lazy-connect to ${chain}, skipping.`);
                }
            }
        }
        
        const results: any[] = [];
        
        // 1. Polkadot (DOT)
        if (this.apis["Polkadot"]) {
            try {
                const account = await this.apis["Polkadot"].query.system.account(scanAddress) as any;
                const free = account?.data?.free?.toString() || "0";
                const balanceNum = Number(free) / 1e10; 

                const buffer = BigInt(5000000000); // 0.5 DOT
                const freeBig = BigInt(free);
                const available = freeBig > buffer ? freeBig - buffer : BigInt(0);
                
                if (available > BigInt(0)) {
                    results.push({
                        id: `dot-relay-${this.simMode ? 'sim' : 'real'}`,
                        chain: "Polkadot",
                        symbol: "DOT",
                        amount: available.toString(), // Send available, save rest for fees
                        estimatedValueDot: balanceNum,
                        sourceChainXcmFee: 0.02,
                        isSufficient: true,
                        decimals: 10
                    });
                }
            } catch (e) {
                console.error("Polkadot scan failed:", e);
            }
        }

        // 2. Astar (ASTR)
        if (this.apis["Astar"]) {
            try {
                const account = await this.apis["Astar"].query.system.account(scanAddress) as any;
                const free = account?.data?.free?.toString() || "0";
                const balanceNum = Number(free) / 1e18;
                
                const buffer = BigInt("1000000000000000000"); // 1 ASTR
                const freeBig = BigInt(free);
                const available = freeBig > buffer ? freeBig - buffer : BigInt(0);

                if (available > BigInt(0)) {
                    // Get real-time price from Hydration Omnipool
                    const astrPrice = await this.getAssetPrice("ASTR");
                    results.push({
                        id: `astar-native-${this.simMode ? 'sim' : 'real'}`,
                        chain: "Astar",
                        symbol: "ASTR",
                        amount: available.toString(),
                        estimatedValueDot: balanceNum * astrPrice,
                        sourceChainXcmFee: 0.04, // Corrected to DOT value (not ASTR units)
                        isSufficient: true,
                        decimals: 18
                    });
                }
            } catch (e) {
                console.error("Astar scan failed:", e);
            }
        }

        // 3. Hydration (HDX)
        if (this.apis["Hydration"]) {
            try {
                const account = await this.apis["Hydration"].query.system.account(scanAddress) as any;
                const free = account?.data?.free?.toString() || "0";
                const balanceNum = Number(free) / 1e12; 
                
                const buffer = BigInt("1000000000000"); // 1 HDX
                const freeBig = BigInt(free);
                const available = freeBig > buffer ? freeBig - buffer : BigInt(0);

                if (available > BigInt(0)) {
                    // Get real-time price from Hydration Omnipool
                    const hdxPrice = await this.getAssetPrice("HDX");
                    results.push({
                        id: `hydration-native-${this.simMode ? 'sim' : 'real'}`,
                        chain: "Hydration",
                        symbol: "HDX",
                        amount: available.toString(),
                        estimatedValueDot: balanceNum * hdxPrice,
                        sourceChainXcmFee: 0.1,
                        isSufficient: true,
                        decimals: 12
                    });
                }
            } catch (e) {
                console.error("Hydration scan failed:", e);
            }
        }

        // 4. Moonbeam (GLMR)
        if (this.apis["Moonbeam"]) {
            try {
                const account = await this.apis["Moonbeam"].query.system.account(scanAddress) as any;
                const free = account?.data?.free?.toString() || "0";
                const balanceNum = Number(free) / 1e18; // GLMR has 18 decimals

                const buffer = BigInt("1000000000000000000"); // 1 GLMR
                const freeBig = BigInt(free);
                const available = freeBig > buffer ? freeBig - buffer : BigInt(0);

                if (available > BigInt(0)) {
                    const glmrPrice = await this.getAssetPrice("GLMR");
                    results.push({
                        id: `moonbeam-native-${this.simMode ? 'sim' : 'real'}`,
                        chain: "Moonbeam",
                        symbol: "GLMR",
                        amount: available.toString(),
                        estimatedValueDot: balanceNum * glmrPrice,
                        sourceChainXcmFee: 0.04,
                        isSufficient: true,
                        decimals: 18
                    });
                }
            } catch (e) {
                console.error("Moonbeam scan failed:", e);
            }
        }

        // 5. Acala (ACA)
        if (this.apis["Acala"]) {
            try {
                const account = await this.apis["Acala"].query.system.account(scanAddress) as any;
                const free = account?.data?.free?.toString() || "0";
                const balanceNum = Number(free) / 1e12; // ACA has 12 decimals

                const buffer = BigInt("1000000000000"); // 1 ACA
                const freeBig = BigInt(free);
                const available = freeBig > buffer ? freeBig - buffer : BigInt(0);

                if (available > BigInt(0)) {
                    const acaPrice = await this.getAssetPrice("ACA");
                    results.push({
                        id: `acala-native-${this.simMode ? 'sim' : 'real'}`,
                        chain: "Acala",
                        symbol: "ACA",
                        amount: available.toString(),
                        estimatedValueDot: balanceNum * acaPrice,
                        sourceChainXcmFee: 0.03,
                        isSufficient: true,
                        decimals: 12
                    });
                }
            } catch (e) {
                console.error("Acala scan failed:", e);
            }
        }

        // 6. Bifrost (BNC)
        if (this.apis["Bifrost"]) {
            try {
                const account = await this.apis["Bifrost"].query.system.account(scanAddress) as any;
                const free = account?.data?.free?.toString() || "0";
                const balanceNum = Number(free) / 1e12; // BNC has 12 decimals

                const buffer = BigInt("1000000000000"); // 1 BNC
                const freeBig = BigInt(free);
                const available = freeBig > buffer ? freeBig - buffer : BigInt(0);

                if (available > BigInt(0)) {
                    const bncPrice = await this.getAssetPrice("BNC");
                    results.push({
                        id: `bifrost-native-${this.simMode ? 'sim' : 'real'}`,
                        chain: "Bifrost",
                        symbol: "BNC",
                        amount: available.toString(),
                        estimatedValueDot: balanceNum * bncPrice,
                        sourceChainXcmFee: 0.05,
                        isSufficient: true,
                        decimals: 12
                    });
                }
            } catch (e) {
                console.error("Bifrost scan failed:", e);
            }
        }

        // 7. Interlay (INTR)
        if (this.apis["Interlay"]) {
            try {
                const account = await this.apis["Interlay"].query.system.account(scanAddress) as any;
                const free = account?.data?.free?.toString() || "0";
                const balanceNum = Number(free) / 1e10; // INTR has 10 decimals

                const buffer = BigInt("10000000000"); // 1 INTR
                const freeBig = BigInt(free);
                const available = freeBig > buffer ? freeBig - buffer : BigInt(0);

                if (available > BigInt(0)) {
                    const intrPrice = await this.getAssetPrice("INTR");
                    results.push({
                        id: `interlay-native-${this.simMode ? 'sim' : 'real'}`,
                        chain: "Interlay",
                        symbol: "INTR",
                        amount: available.toString(),
                        estimatedValueDot: balanceNum * intrPrice,
                        sourceChainXcmFee: 0.03,
                        isSufficient: true,
                        decimals: 10
                    });
                }
            } catch (e) {
                console.error("Interlay scan failed:", e);
            }
        }

        return results;
    }

    async fetchBalances(address: string) {
        return this.fetchChainAssets(address);
    }

    private async ensureConnection(chain: string) {
        if (this.apis[chain]) return this.apis[chain];

        console.log(`🔌 Connecting to ${chain} on demand...`);
        const endpoints = this.simMode ? ENDPOINTS.SIMULATION : ENDPOINTS.REAL;
        // @ts-ignore - Index signature
        const url = endpoints[chain];
        
        if (!url) throw new Error(`No endpoint configured for ${chain}`);

        try {
            const provider = new WsProvider(url);
            const api = await ApiPromise.create({ provider, noInitWarn: true });
            await api.isReady;
            this.apis[chain] = api;
            return api;
        } catch (e) {
            console.error(`Failed to connect to ${chain}:`, e);
            throw new Error(`Connection to ${chain} failed`);
        }
    }

    /**
     * Phase 11: XCM Construction
     * Teleport/Transfer assets from Source Chain to Westend Asset Hub (Sweeper)
     */
    async teleportAsset(sourceChain: string, assetSymbol: string, amount: bigint, senderAddress: string) {
        console.log(`🌀 Initiating Teleport: ${assetSymbol} (${amount}) from ${sourceChain} -> Asset Hub`);
        
        let tx;
        
        // Ensure connection exists before proceeding
        const api = await this.ensureConnection(sourceChain);
        
        // 1. Define Destination: Westend Asset Hub (Para 1000)
        // If Source is Polkadot (Relay), Parents = 0. 
        // If Source is Parachain (Sibling), Parents = 1 (Up to Relay) -> X1 (Down to Sibling).
        const isRelay = sourceChain === "Polkadot";
        const dest = {
            V3: {
                parents: isRelay ? 0 : 1,
                interior: { X1: { Parachain: 1000 } }
            }
        };

        // 2. Define Beneficiary: Sweeper Contract (Mapped to Substrate AccountId32)
        // Relay Chains often reject AccountKey20 (EVM) locations in transferAssets.
        // Revive uses deterministic mapping: 20-byte EVM address + 12 bytes of 0xEE = 32-byte Substrate account
        // Sweeper: 0x6Ce61B60FF9c73e7D233221c2feFA501228c1dF2
        // Mapped:  0x6ce61b60ff9c73e7d233221c2fefa501228c1df2eeeeeeeeeeeeeeeeeeeeeeee
        const sweeperMappedAddress = SWEEPER_ADDRESS.toLowerCase().slice(2) + "eeeeeeeeeeeeeeeeeeeeeeee";

        const beneficiary = {
            V3: {
                parents: 0,
                interior: {
                    X1: {
                        AccountId32: {
                            network: null,
                            id: "0x" + sweeperMappedAddress
                        }
                    }
                }
            }
        };

        // 3. Define Asset
        // NOTE: This assumes Native Token (Here). For non-native, we need MultiLocation.
        const assets = {
            V3: [
                {
                    id: { Concrete: { parents: 0, interior: "Here" } },
                    fun: { Fungible: amount }
                }
            ]
        };

        // 4. Construct Extrinsic
        // Force Teleport logic (Relay -> AssetHub).
        // transferAssets often defaults to ReserveTransfer (invalid here).
        // Astar Fix: Use limitedReserveTransferAssets to avoid 'exhaustsResources'
        // Estimated Fee: ~50 ASTR
        if (sourceChain === "Astar") {
             console.log("🌟 Astar Detect: Using limitedReserveTransferAssets");
             const limit = { Limited: { refTime: BigInt(5000000000), proofSize: BigInt(100000) } };
             if (api.tx.polkadotXcm?.limitedReserveTransferAssets) {
                 tx = api.tx.polkadotXcm.limitedReserveTransferAssets(dest, beneficiary, assets, 0, limit);
             } else if (api.tx.xcmPallet?.limitedReserveTransferAssets) {
                 tx = api.tx.xcmPallet.limitedReserveTransferAssets(dest, beneficiary, assets, 0, limit);
             } else {
                 // Fallback to standard if method missing (unlikely)
                 tx = api.tx.polkadotXcm.limitedTeleportAssets(dest, beneficiary, assets, 0, { Unlimited: null });
             }
             return tx;
        }

        // Hydration Fix: Use Limited weight instead of Unlimited to avoid 'exhaustsResources'
        // This is required because Hydration runtime is stricter on Weight V3 compliance.
        if (sourceChain === "Hydration") {
             console.log("💧 Hydration Detect: Using limitedTeleportAssets with Limited Weight");
             const limit = { Limited: { refTime: BigInt(5000000000), proofSize: BigInt(100000) } };
             if (api.tx.xcmPallet?.limitedTeleportAssets) {
                 tx = api.tx.xcmPallet.limitedTeleportAssets(dest, beneficiary, assets, 0, limit);
             } else if (api.tx.polkadotXcm?.limitedTeleportAssets) {
                 tx = api.tx.polkadotXcm.limitedTeleportAssets(dest, beneficiary, assets, 0, limit);
             } else {
                 tx = api.tx.xcmPallet.transferAssets(dest, beneficiary, assets, 0, limit);
             }
             return tx;
        }


        if (api.tx.xcmPallet?.limitedTeleportAssets) {
             const limit = { Limited: { refTime: BigInt(6000000000), proofSize: BigInt(200000) } };
             tx = api.tx.xcmPallet.limitedTeleportAssets(dest, beneficiary, assets, 0, limit);
        } else if (api.tx.polkadotXcm?.limitedTeleportAssets) {
             const limit = { Limited: { refTime: BigInt(6000000000), proofSize: BigInt(200000) } };
             tx = api.tx.polkadotXcm.limitedTeleportAssets(dest, beneficiary, assets, 0, limit);
        } else if (api.tx.xcmPallet?.transferAssets) {
             // Fallback
             const limit = { Limited: { refTime: BigInt(6000000000), proofSize: BigInt(200000) } };
             tx = api.tx.xcmPallet.transferAssets(dest, beneficiary, assets, 0, limit);
        } else {
             throw new Error("No XCM method found (limitedTeleportAssets or transferAssets)");
        }

        return tx;
    }

    // Renamed from 'purge' to be specific
    async executeSweeperContract(assets: string[], amounts: bigint[]) {
        if (typeof window === "undefined" || !(window as any).ethereum) {
            throw new Error("No EVM wallet found. Please install MetaMask or similar.");
        }

        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        
        // Switch Chain
        const network = await provider.getNetwork();
        if (network.chainId !== BigInt(REVIVE_CHAIN_ID)) {
            try {
                await (window as any).ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x' + REVIVE_CHAIN_ID.toString(16) }],
                });
            } catch (switchError: any) {
                // This error code indicates that the chain has not been added to MetaMask.
                if (switchError.code === 4902) {
                     await (window as any).ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [
                            {
                                chainId: '0x' + REVIVE_CHAIN_ID.toString(16),
                                chainName: 'Westend Asset Hub',
                                rpcUrls: ['https://westend-asset-hub-eth-rpc.polkadot.io'],
                                nativeCurrency: {
                                    name: 'Westend',
                                    symbol: 'WND',
                                    decimals: 18
                                },
                                blockExplorerUrls: ['https://assethub-westend.subscan.io']
                            },
                        ],
                    });
                } else {
                    throw switchError;
                }
            }
        }

        const sweeper = new ethers.Contract(SWEEPER_ADDRESS, SWEEPER_ABI, signer);
        
        console.log("🧹 Intiating Purge via Sweeper...", { assets, amounts });
        
        // Send transaction with some gas for the XCM execution (if needed) or just tx gas
        // The contract requires msg.value > 0 for "User pays gas" logic if we enforce it, 
        // strictly speaking sweepBatch requires payable.
        const tx = await sweeper.sweepBatch(assets, amounts, { value: ethers.parseEther("0.01") });
        console.log("✅ Transaction sent:", tx.hash);
        
        return tx;
    }

    /**
     * Helper to sign and send a Substrate Extrinsic
     */
    async signAndSend(tx: any, account: any, sourceChain: string) {
        // Only use Dev Key if using the Mock Wallet
        if (this.simMode && account.meta?.source === 'mock') {
             console.log("🎭 Sim Mode: Signing with Dev Key (//Alice)...");
             const { Keyring } = await import("@polkadot/keyring");
             const keyring = new Keyring({ type: 'sr25519' });
             const alice = keyring.addFromUri('//Alice');
             
             return new Promise((resolve, reject) => {
                 tx.signAndSend(alice, ({ status, dispatchError }: any) => {
                     if (status.isInBlock) {
                         console.log(`✅ [Sim] In block: ${status.asInBlock}`);
                         if (dispatchError) {
                               if (dispatchError.isModule) {
                                   // Decode error for Sim Mode
                                   // @ts-ignore
                                   const decoded = this.apis[sourceChain]?.registry.findMetaError(dispatchError.asModule); 
                                   // NOTE: Hardcoded "Polkadot" because sim txs are always on relay for now? 
                                   // Actually, signAndSend is generic. But for purge, it starts on Polkadot. 
                                   // Let's use this.apis["Polkadot"] or try to guess. 
                                   // Actually, create a helper or just use Polkadot registry since it's Alice on Relay.
                                   const errorMsg = decoded ? `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}` : "Unknown Module Error";
                                   console.error(`❌ [Sim] Dispatch Error: ${errorMsg}`);
                                   reject(new Error(`Purge Failed: ${errorMsg}`));
                               } else {
                                   reject(new Error(dispatchError.toString()));
                               }
                         } else {
                             resolve(status.asInBlock.toString());
                         }
                     }
                 }).catch(reject);
             });
        }

        // Dynamic import to prevent "window is not defined" during SSR
        const { web3Enable, web3FromSource } = await import("@polkadot/extension-dapp");

        const { address, meta: { source } } = account;

        if (source === "metamask") {
            throw new Error("XCM Teleport requires a Substrate-compatible wallet (Talisman, SubWallet, etc.). MetaMask is not supported for Substrate transactions.");
        }
        
        // 1. Inject Signer
        await web3Enable("dotdotdust"); // Required to ensure injection
        const injector = await web3FromSource(source);
        
        // 2. Sign and Send
        return new Promise((resolve, reject) => {
            tx.signAndSend(address, { signer: injector.signer }, ({ status, events, dispatchError }: any) => {
                if (status.isInBlock) {
                    console.log(`✅ Transaction in block: ${status.asInBlock}`);
                    if (dispatchError) {
                         if (dispatchError.isModule) {
                            // Decode the error for humans
                            // @ts-ignore
                            const decoded = this.apis[sourceChain]?.registry.findMetaError(dispatchError.asModule);
                            const errorMsg = decoded ? `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}` : "Unknown Module Error";
                            console.error(`❌ Dispatch Error: ${errorMsg}`);
                            reject(new Error(`Purge Failed: ${errorMsg}`));
                        } else {
                            console.error(`❌ Dispatch Error: ${dispatchError.toString()}`);
                            reject(new Error(dispatchError.toString()));
                        }
                    } else {
                        resolve(status.asInBlock.toString());
                    }
                } else if (status.isFinalized) {
                    console.log(`🏆 Transaction finalized: ${status.asFinalized}`);
                }
            }).catch((error: any) => {
                console.error("Sign and Send Error:", error);
                reject(error);
            });
        });
    }
}

export const chainService = new ChainService();
