import { BN } from "@polkadot/util";

// =========================================================================
// CRITICAL: Decimal Conversion for Revive
// =========================================================================
// Substrate (Polkadot/AssetHub): DOT has 10 decimals (1 DOT = 10^10 plancks)
// Revive (EVM on Asset Hub): DOT has 18 decimals (1 DOT = 10^18 wei-like units)
//
// When passing DOT amounts to Revive smart contracts, must convert:
// reviveDOT = substrateDOT * 10^8
// =========================================================================

/**
 * Convert Substrate DOT amount (10 decimals) to Revive DOT amount (18 decimals)
 * @param substrateAmount Amount in Substrate plancks (10 decimals)
 * @returns Amount in Revive wei-like units (18 decimals)
 */
export function toReviveDecimals(substrateAmount: bigint): bigint {
    // Multiply by 10^8 to convert from 10 decimals to 18 decimals
    return substrateAmount * BigInt(10 ** 8);
}

/**
 * Convert Revive DOT amount (18 decimals) to Substrate DOT amount (10 decimals)
 * @param reviveAmount Amount in Revive wei-like units (18 decimals)
 * @returns Amount in Substrate plancks (10 decimals)
 */
export function fromReviveDecimals(reviveAmount: bigint): bigint {
    // Divide by 10^8 to convert from 18 decimals to 10 decimals
    return reviveAmount / BigInt(10 ** 8);
}

/**
 * Convert human-readable DOT to Revive decimals
 * @param dotAmount Human-readable DOT (e.g., 1.5 DOT)
 * @returns Amount in Revive wei-like units (18 decimals)
 */
export function dotToRevive(dotAmount: number): bigint {
    // 1 DOT = 10^18 in Revive
    return BigInt(Math.floor(dotAmount * 10 ** 18));
}

// Constants
export const MIN_BATCH_VALUE_DOT = 0.05;
const DOT_DECIMALS_SUBSTRATE = 10;  // Substrate (Polkadot, Asset Hub)
const DOT_DECIMALS_REVIVE = 18;     // Revive (EVM on Asset Hub)
const COMMISSION_RATE = 0.05; // 5%

export interface AssetCandidate {
  chain: string; // e.g., "Astar"
  symbol: string;
  amount: bigint;
  estimatedValueDot: number;
  isSufficient: boolean;
  nativeBalance: bigint; 
  sourceChainXcmFee: number;
  isNative: boolean;
  decimals: number;
}

export type RoutingTier = "TIER_1_DIRECT" | "TIER_2_MULTI_HOP";

export const ROUTING_TABLE: Record<string, RoutingTier> = {
  "Polkadot": "TIER_1_DIRECT",
  "Astar": "TIER_2_MULTI_HOP", // Assume multi-hop via AssetHub for Astar long-tail
  "Moonbeam": "TIER_2_MULTI_HOP",
  "AssetHub": "TIER_1_DIRECT",
  "Hydration": "TIER_1_DIRECT"
};

const TIER_MULTIPLIERS = {
  "TIER_1_DIRECT": 1.0,
  "TIER_2_MULTI_HOP": 2.5 // Multi-hop: Source -> AssetHub -> Hydration
};

const GAS_SAFETY_BUFFER = 1.2; // 20% overhead for weight estimation volatility

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
    // const nominalAmount = Number(asset.amount) / Math.pow(10, asset.decimals); // This is now replaced by estimatedValueDot
    const valueInDOT = asset.estimatedValueDot; // Use the pre-calculated estimatedValueDot
    
    totalBatchValueDOT += valueInDOT;

    // 2. Dust Trap Check (Non-Sufficient Asset + Zero Native Balance)
    // If you hold "JunkToken" on Astar, but 0 ASTR, you cannot pay the transfer fee.
    // XCM cannot "pull" without a fee paid on Source.
    if (!asset.isNative && !asset.isSufficient && asset.nativeBalance === BigInt(0)) {
        hasDustTrap = true;
    }

    // 3. Fee Stack Calculation (v1.3: Routing Aware)
    // The cost to move a token includes:
    // (Source XCM Fee * Complexity Multiplier * Safety Buffer) + Destination Xcm Fee + Relayer Rebate + Commission
    const tier = ROUTING_TABLE[asset.chain] || "TIER_2_MULTI_HOP"; // Default to safe multi-hop
    const complexityMultiplier = TIER_MULTIPLIERS[tier];
    
    const adjustedSourceFee = asset.sourceChainXcmFee * complexityMultiplier * GAS_SAFETY_BUFFER;
    
    const DEST_XCM_FEE_DOT = 0.005; // ~0.005 DOT
    const RELAYER_REBATE_DOT = 0.002; // Small gas rebate for relayer
    const totalFees = adjustedSourceFee + DEST_XCM_FEE_DOT + RELAYER_REBATE_DOT;
    const valueAfterFees = asset.estimatedValueDot - totalFees;

    if (valueAfterFees <= 0) {
        return {
            status: "BURN",
            reason: `Fees (${totalFees.toFixed(3)} DOT) exceed asset value due to ${tier.replace('_', ' ')} complexity.`,
            netValue: valueAfterFees
        };
    }
    
    // 4. The 0.05 DOT Net-Gatekeeper
    // We only purge if the final value is significant enough
    if (valueAfterFees < 0.05) {
        return {
            status: "BURN",
            reason: `Net value (${valueAfterFees.toFixed(3)} DOT) is below the 0.05 threshold after complexity adjustments.`,
            netValue: valueAfterFees
        };
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
