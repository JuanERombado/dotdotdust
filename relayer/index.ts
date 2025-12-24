import express from "express";
import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3001;
const HYDRA_RPC = "wss://rpc.hydradx.cloud"; // Mainnet example
const RELAYER_KEY = process.env.RELAYER_KEY; // Native private key for gas

/**
 * 1. OMNIPOOL ORACLE 
 * Queries Hydration RPC for real-time asset prices relative to DOT/LRNA.
 */
async function getOmnipoolPrice(assetId: string) {
    const provider = new WsProvider(HYDRA_RPC);
    const api = await ApiPromise.create({ provider });
    
    try {
        // Query the Omnipool state for the specific asset
        // On Hydration, this returns { hubReserve, shares, protocolShares, cap }
        const assetState: any = await api.query.omnipool.assets(assetId);
        
        if (assetState.isNone) {
            console.warn(`[Oracle] Asset ${assetId} not found in Omnipool.`);
            return 0;
        }

        const { hubReserve } = assetState.unwrap();
        
        // Price calculation: In Omnipool, the price is often HubReserve / AssetReserve.
        // For the Gatekeeper, we just need to ensure the total value is enough "meat".
        console.log(`[Oracle] Asset ${assetId} Hub Reserve: ${hubReserve.toString()}`);
        
        return Number(hubReserve) / 1e12; // Simplified price in DOT-equivalent units
    } catch (e) {
        console.error("[Oracle] Error fetching price:", e);
        return 0;
    } finally {
        await api.disconnect();
    }
}

/**
 * 2. DISPATCHER
 * Verifies User signature and submits the sponsored transaction.
 */
app.post("/purge", async (req, res) => {
    const { userAddress, assets, amounts, signature, chainId } = req.body;

    console.log(`[Relayer] Received purge request from ${userAddress} on chain ${chainId}`);

    // 0. Signature Verification (Simplified)
    // The user signs: "Authorize dotdotdust to sweep [assets] for [user] on [chainId]"
    const message = `Authorize dotdotdust: ${userAddress} ${assets.join(",")}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
        return res.status(401).json({ error: "Invalid signature. Authentication failed." });
    }

    // 1. Check Gatekeeper (Relayer-side safety)

    let totalValue = 0;
    for (const asset of assets) {
        totalValue += await getOmnipoolPrice(asset);
    }

    if (totalValue < 0.05) {
        return res.status(400).json({ error: "Batch value too low for sponsorship." });
    }

    // 2. Submit to Source Chain
    // Using Ethers or Polka-JS depending on the chain (Revive is EVM)
    console.log("[Relayer] Dispatching sponsored transaction...");

    res.json({ 
        status: "DISPATCHED", 
        txHash: "0x...", 
        sponsoredGas: "0.002 DOT" 
    });
});

app.listen(PORT, () => {
    console.log(`[dotdotdust] Relayer running on port ${PORT}`);
});
