import pkg from "hardhat";
const { ethers } = pkg;
import "dotenv/config";

async function main() {
  const [deployer] = await ethers.getSigners();
  const sweeperAddress = "0x3b538f784E5913ac419743b28E62D2104bf2C13A";
  const Sweeper = await ethers.getContractAt("Sweeper", sweeperAddress, deployer);

  console.log("⛽ Funding Gas Tank...");
  const fundTx = await Sweeper.depositGas({ value: ethers.parseEther("0.1") });
  console.log("Tx Hash:", fundTx.hash);
  await fundTx.wait();
  console.log("✅ Gas Tank Funded with 0.1 WND.");
}

main().catch(console.error);
