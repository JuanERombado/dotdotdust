import { ethers } from "ethers";

async function checkBalance() {
    const provider = new ethers.JsonRpcProvider("https://westend-asset-hub-eth-rpc.polkadot.io");
    const address = "0xaEf21e359f7174eE0f09c96d3D75FeF19949CC57";
    
    try {
        const balance = await provider.getBalance(address);
        console.log(`Address: ${address}`);
        console.log(`Balance: ${ethers.formatEther(balance)} WND`);
        
        if (balance > 0n) {
            console.log("✅ Ready for deployment!");
        } else {
            console.log("❌ Balance is still 0. Waiting for faucet...");
        }
    } catch (error) {
        console.error("Error checking balance:", error);
    }
}

checkBalance();
