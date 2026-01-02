import { ethers } from "ethers";

function generate() {
    const wallet = ethers.Wallet.createRandom();
    console.log("--------------------------------------------------");
    console.log("🗝️ NEW DEPLOYMENT WALLET GENERATED");
    console.log("--------------------------------------------------");
    console.log(`Address: ${wallet.address}`);
    console.log(`Private Key: ${wallet.privateKey}`);
    console.log(`Mnemonic: ${wallet.mnemonic?.phrase}`);
    console.log("--------------------------------------------------");
    console.log("⚠️ CAUTION: Save these details. Do not share the private key.");
}

generate();
