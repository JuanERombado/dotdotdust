/**
 * Enhanced Deployment Script for Sweeper Contract
 * Includes verification, configuration, and setup automation
 *
 * Usage:
 *   npx hardhat run scripts/deploy-enhanced.ts --network westend
 *   npx hardhat run scripts/deploy-enhanced.ts --network mainnet
 */

import { ethers } from "hardhat";

async function main() {
  console.log("🚀 dotdotdust Sweeper Contract Deployment");
  console.log("=".repeat(70) + "\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("📋 Deployment Configuration:");
  console.log(`   Network:  ${(await ethers.provider.getNetwork()).name}`);
  console.log(`   ChainID:  ${(await ethers.provider.getNetwork()).chainId}`);
  console.log(`   Deployer: ${deployerAddress}`);
  console.log(`   Balance:  ${ethers.formatEther(balance)} ETH\n`);

  // Check minimum balance
  const minBalance = ethers.parseEther("0.1");
  if (balance < minBalance) {
    console.error("❌ ERROR: Insufficient balance for deployment");
    console.error(`   Required: At least 0.1 ETH`);
    console.error(`   Current:  ${ethers.formatEther(balance)} ETH\n`);
    process.exit(1);
  }

  // Deploy Sweeper contract
  console.log("📦 Deploying Sweeper Contract...\n");

  const SweeperFactory = await ethers.getContractFactory("Sweeper");
  const sweeper = await SweeperFactory.deploy();

  console.log("   ⏳ Waiting for deployment transaction...");
  await sweeper.waitForDeployment();

  const sweeperAddress = await sweeper.getAddress();

  console.log(`   ✅ Sweeper deployed to: ${sweeperAddress}\n`);

  // Verify initial state
  console.log("🔍 Verifying Initial State:");
  console.log("=".repeat(70) + "\n");

  const owner = await sweeper.owner();
  const feeCollector = await sweeper.feeCollector();
  const gasTank = await sweeper.gasTank();
  const collectedFees = await sweeper.collectedFees();
  const commissionBps = await sweeper.COMMISSION_BPS();
  const slippageBps = await sweeper.SLIPPAGE_TOLERANCE_BPS();

  console.log(`   Owner:               ${owner}`);
  console.log(`   Fee Collector:       ${feeCollector}`);
  console.log(`   Gas Tank:            ${ethers.formatEther(gasTank)} ETH`);
  console.log(`   Collected Fees:      ${ethers.formatEther(collectedFees)} ETH`);
  console.log(`   Commission:          ${commissionBps} bps (${Number(commissionBps) / 100}%)`);
  console.log(`   Slippage Tolerance:  ${slippageBps} bps (${Number(slippageBps) / 100}%)\n`);

  // Deployment summary
  console.log("=".repeat(70));
  console.log("✅ DEPLOYMENT SUCCESSFUL");
  console.log("=".repeat(70) + "\n");

  console.log("📝 Contract Information:");
  console.log(`   Address:     ${sweeperAddress}`);
  console.log(`   Owner:       ${owner}`);
  console.log(`   Network:     ${(await ethers.provider.getNetwork()).name}`);
  console.log(`   ChainID:     ${(await ethers.provider.getNetwork()).chainId}\n`);

  console.log("🎯 Next Steps:\n");
  console.log("1. Fund Gas Tank:");
  console.log(`   await sweeper.depositGas({ value: ethers.parseEther("10") })\n`);

  console.log("2. Add Relayer:");
  console.log(`   await sweeper.addRelayer("0xYourRelayerAddress")\n`);

  console.log("3. (Optional) Set Fee Collector:");
  console.log(`   await sweeper.setFeeCollector("0xYourFeeCollectorAddress")\n`);

  console.log("4. Verify Contract (if on testnet/mainnet):");
  console.log(`   npx hardhat verify --network ${(await ethers.provider.getNetwork()).name} ${sweeperAddress}\n`);

  // Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    contractAddress: sweeperAddress,
    deployer: deployerAddress,
    owner: owner,
    feeCollector: feeCollector,
    commissionBps: Number(commissionBps),
    slippageBps: Number(slippageBps),
    deployedAt: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber()
  };

  console.log("💾 Deployment Info (save this):");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log();

  return { sweeper, sweeperAddress, deploymentInfo };
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  });
