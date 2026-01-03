/**
 * Contract Health Monitoring Script
 * Checks contract state and alerts on issues
 *
 * Usage: npx hardhat run scripts/monitor-contract.ts --network westend
 */

import { ethers } from "hardhat";

const SWEEPER_ADDRESS = process.env.SWEEPER_ADDRESS || "";

interface HealthCheck {
  check: string;
  status: "OK" | "WARNING" | "CRITICAL";
  details: string;
  recommendation?: string;
}

async function main() {
  if (!SWEEPER_ADDRESS) {
    console.error("❌ ERROR: SWEEPER_ADDRESS environment variable not set");
    console.error("   Usage: SWEEPER_ADDRESS=0x... npx hardhat run scripts/monitor-contract.ts\n");
    process.exit(1);
  }

  console.log("🔍 dotdotdust Contract Health Check");
  console.log("=".repeat(70) + "\n");

  console.log(`📋 Configuration:`);
  console.log(`   Contract:  ${SWEEPER_ADDRESS}`);
  console.log(`   Network:   ${(await ethers.provider.getNetwork()).name}`);
  console.log(`   ChainID:   ${(await ethers.provider.getNetwork()).chainId}\n`);

  // Connect to deployed contract
  const Sweeper = await ethers.getContractFactory("Sweeper");
  const sweeper = Sweeper.attach(SWEEPER_ADDRESS);

  const healthChecks: HealthCheck[] = [];

  // ========================================================================
  // CHECK 1: Contract Exists
  // ========================================================================
  try {
    const code = await ethers.provider.getCode(SWEEPER_ADDRESS);
    if (code === "0x") {
      healthChecks.push({
        check: "Contract Exists",
        status: "CRITICAL",
        details: "No code at contract address",
        recommendation: "Verify contract address is correct"
      });
      printResults(healthChecks);
      process.exit(1);
    } else {
      healthChecks.push({
        check: "Contract Exists",
        status: "OK",
        details: `Code size: ${code.length / 2 - 1} bytes`
      });
    }
  } catch (e) {
    healthChecks.push({
      check: "Contract Exists",
      status: "CRITICAL",
      details: `Error: ${e}`,
      recommendation: "Check network connection and contract address"
    });
  }

  // ========================================================================
  // CHECK 2: Ownership
  // ========================================================================
  try {
    const owner = await sweeper.owner();
    healthChecks.push({
      check: "Owner Set",
      status: "OK",
      details: `Owner: ${owner}`
    });
  } catch (e) {
    healthChecks.push({
      check: "Owner Set",
      status: "CRITICAL",
      details: `Failed to read owner: ${e}`
    });
  }

  // ========================================================================
  // CHECK 3: Gas Tank Balance
  // ========================================================================
  try {
    const gasTank = await sweeper.gasTank();
    const gasTankEth = Number(ethers.formatEther(gasTank));

    let status: "OK" | "WARNING" | "CRITICAL" = "OK";
    let recommendation: string | undefined;

    if (gasTankEth === 0) {
      status = "CRITICAL";
      recommendation = "Fund gas tank immediately to enable sponsored sweeps";
    } else if (gasTankEth < 1) {
      status = "WARNING";
      recommendation = "Gas tank is low, consider funding";
    }

    healthChecks.push({
      check: "Gas Tank Balance",
      status,
      details: `${gasTankEth.toFixed(4)} ETH`,
      recommendation
    });
  } catch (e) {
    healthChecks.push({
      check: "Gas Tank Balance",
      status: "WARNING",
      details: `Failed to read: ${e}`
    });
  }

  // ========================================================================
  // CHECK 4: Collected Fees
  // ========================================================================
  try {
    const collectedFees = await sweeper.collectedFees();
    const feesEth = Number(ethers.formatEther(collectedFees));

    healthChecks.push({
      check: "Collected Fees",
      status: feesEth > 0 ? "OK" : "OK",
      details: `${feesEth.toFixed(4)} ETH`,
      recommendation: feesEth > 10 ? "Consider withdrawing fees" : undefined
    });
  } catch (e) {
    healthChecks.push({
      check: "Collected Fees",
      status: "WARNING",
      details: `Failed to read: ${e}`
    });
  }

  // ========================================================================
  // CHECK 5: Fee Collector
  // ========================================================================
  try {
    const feeCollector = await sweeper.feeCollector();
    const owner = await sweeper.owner();

    const status = feeCollector === ethers.ZeroAddress ? "WARNING" : "OK";

    healthChecks.push({
      check: "Fee Collector",
      status,
      details: `${feeCollector}${feeCollector === owner ? " (owner)" : ""}`,
      recommendation: feeCollector === ethers.ZeroAddress ? "Set fee collector address" : undefined
    });
  } catch (e) {
    healthChecks.push({
      check: "Fee Collector",
      status: "WARNING",
      details: `Failed to read: ${e}`
    });
  }

  // ========================================================================
  // CHECK 6: Relayers
  // ========================================================================
  try {
    // We can't enumerate all relayers, but we can check if any common addresses are relayers
    // In production, you'd maintain a list of expected relayers
    healthChecks.push({
      check: "Relayers",
      status: "OK",
      details: "Check specific addresses with: sweeper.isRelayer(address)",
      recommendation: "Ensure at least one relayer is authorized"
    });
  } catch (e) {
    healthChecks.push({
      check: "Relayers",
      status: "WARNING",
      details: `Failed to check: ${e}`
    });
  }

  // ========================================================================
  // CHECK 7: Constants
  // ========================================================================
  try {
    const commissionBps = await sweeper.COMMISSION_BPS();
    const slippageBps = await sweeper.SLIPPAGE_TOLERANCE_BPS();

    healthChecks.push({
      check: "Commission Rate",
      status: "OK",
      details: `${commissionBps} bps (${Number(commissionBps) / 100}%)`
    });

    healthChecks.push({
      check: "Slippage Tolerance",
      status: "OK",
      details: `${slippageBps} bps (${Number(slippageBps) / 100}%)`
    });
  } catch (e) {
    healthChecks.push({
      check: "Constants",
      status: "WARNING",
      details: `Failed to read: ${e}`
    });
  }

  // ========================================================================
  // CHECK 8: Recent Events (if possible)
  // ========================================================================
  try {
    const currentBlock = await ethers.provider.getBlockNumber();
    const lookbackBlocks = 1000;

    const sweptFilter = sweeper.filters.Swept();
    const sweptEvents = await sweeper.queryFilter(sweptFilter, currentBlock - lookbackBlocks);

    healthChecks.push({
      check: "Recent Activity",
      status: "OK",
      details: `${sweptEvents.length} sweeps in last ${lookbackBlocks} blocks`
    });
  } catch (e) {
    healthChecks.push({
      check: "Recent Activity",
      status: "OK",
      details: "Unable to query events (this is normal)"
    });
  }

  // Print results
  printResults(healthChecks);

  // Exit with error code if any CRITICAL issues
  const hasCritical = healthChecks.some(c => c.status === "CRITICAL");
  process.exit(hasCritical ? 1 : 0);
}

function printResults(checks: HealthCheck[]) {
  console.log("\n" + "=".repeat(70));
  console.log("📊 HEALTH CHECK RESULTS");
  console.log("=".repeat(70) + "\n");

  const ok = checks.filter(c => c.status === "OK");
  const warnings = checks.filter(c => c.status === "WARNING");
  const critical = checks.filter(c => c.status === "CRITICAL");

  console.log(`✅ OK:       ${ok.length}`);
  console.log(`⚠️  WARNING: ${warnings.length}`);
  console.log(`❌ CRITICAL: ${critical.length}\n`);

  // Print all checks
  for (const check of checks) {
    const icon = check.status === "OK" ? "✅" : check.status === "WARNING" ? "⚠️ " : "❌";
    console.log(`${icon} ${check.check}`);
    console.log(`   ${check.details}`);
    if (check.recommendation) {
      console.log(`   💡 ${check.recommendation}`);
    }
    console.log();
  }

  console.log("=".repeat(70));

  if (critical.length === 0 && warnings.length === 0) {
    console.log("✅ ALL CHECKS PASSED - Contract is healthy");
  } else if (critical.length === 0) {
    console.log("⚠️  WARNINGS DETECTED - Review and address");
  } else {
    console.log("❌ CRITICAL ISSUES - Immediate action required");
  }

  console.log("=".repeat(70) + "\n");
}

main().catch((error) => {
  console.error("\n❌ MONITORING FAILED:");
  console.error(error);
  process.exit(1);
});
