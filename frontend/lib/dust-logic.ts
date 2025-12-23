import { BN } from "@polkadot/util";

// Constants
export const MIN_BATCH_VALUE_DOT = 0.05;
const DOT_DECIMALS = 10;
const COMMISSION_RATE = 0.05; // 5%

export interface AssetCandidate {
  chain: string; // e.g., "Astar"
  symbol: string;
  amount: bigint;
  decimals: number;
  usdPrice: number;
  isNative: boolean;
  isSufficient: boolean; // True if asset handles its own ED
  userNativeBalance: bigint; // User's balance of the chain's native token (for fees)
}

export interface PurgeDecision {
  status: "PURGE" | "BLOCKED" | "WARNING" | "BURN";
  reason: string;
  method?: string;
  netValue?: number;
}

/**
 * The "Net-Value Gatekeeper" & "Dust Trap" Detector
 */
export function analyzePurgeability(assets: AssetCandidate[]): PurgeDecision {
  if (assets.length === 0) {
    return { status: "BURN", reason: "No assets selected." };
  }

  let totalBatchValueDOT = 0;
  let hasDustTrap = false;

  for (const asset of assets) {
    // 1. Calculate Value in DOT (Simulated roughly)
    // Formula: (Amount / 10^Decimals) * PriceUSD / DOT_PriceUSD
    // For prototype, we assume usdPrice IS the value in nominal DOT (1 = 1 DOT)
    // REAL WORLD: Need real oracle or price feed.
    const nominalAmount = Number(asset.amount) / Math.pow(10, asset.decimals);
    const valueInDOT = nominalAmount * asset.usdPrice;
    
    totalBatchValueDOT += valueInDOT;

    // 2. Dust Trap Check (Non-Sufficient Asset + Zero Native Balance)
    // If you hold "JunkToken" on Astar, but 0 ASTR, you cannot pay the transfer fee.
    // XCM cannot "pull" without a fee paid on Source.
    if (!asset.isNative && !asset.isSufficient && asset.userNativeBalance === BigInt(0)) {
        hasDustTrap = true;
    }
  }

  // Gate 1: Dust Trap
  if (hasDustTrap) {
    return {
      status: "BLOCKED",
      reason: "Dust Trap Detected: You lack native tokens for gas on one or more chains."
    };
  }

  // Gate 2: The Batch-or-Burn Threshold
  if (totalBatchValueDOT < MIN_BATCH_VALUE_DOT) {
    return {
      status: "BURN",
      reason: `Batch value (${totalBatchValueDOT.toFixed(4)} DOT) is below the safety threshold (${MIN_BATCH_VALUE_DOT} DOT). Add more dust.`
    };
  }

  // Gate 3: Commission Awareness
  const estimatedFeeDOT = 0.015; // Conservative XCM fee estimate (HydraDX is cheap)
  const netValue = totalBatchValueDOT - estimatedFeeDOT;
  const commission = netValue * COMMISSION_RATE;
  
  if (netValue <= 0) {
     return { status: "BURN", reason: "Fees exceed value." };
  }

  return { 
      status: "PURGE", 
      reason: "Batch optimized for execution.",
      method: "Direct-to-Omnipool",
      netValue: netValue - commission
  };
}
