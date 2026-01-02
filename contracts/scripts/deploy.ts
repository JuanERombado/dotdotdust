import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  console.log("🚀 Initializing Revive Deployment (Westend Asset Hub)...");

  // 1. Check Signers
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers found. Check your .env and hardhat.config.js");
  }
  const deployer = signers[0];
  console.log(`👤 Deploying with: ${deployer.address}`);

  // 2. Deploy Sweeper
  const Sweeper = await ethers.getContractFactory("Sweeper", deployer);
  const sweeper = await Sweeper.deploy();

  await sweeper.waitForDeployment();
  const address = await sweeper.getAddress();

  console.log(`✅ Sweeper deployed to: ${address}`);

  // 3. Initial Setup
  // Add a relayer (e.g. the deployer for testing)
  console.log(`👤 Relayer address: ${deployer.address}`);
  
  const tx = await sweeper.addRelayer(deployer.address);
  await tx.wait();
  console.log("✅ Relayer added.");

  // 3. Fund Gas Tank
  console.log("⛽ Funding Gas Tank...");
  const fundTx = await sweeper.depositGas({ value: ethers.parseEther("0.1") });
  await fundTx.wait();
  console.log("✅ Gas Tank Funded with 0.1 WND.");

  console.log("\n✨ Deployment Complete. Save this address for the frontend!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
