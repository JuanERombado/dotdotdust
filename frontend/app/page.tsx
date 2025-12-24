"use client";

import { useState, useEffect } from "react";
import WalletConnect from "@/components/WalletConnect";
import { analyzePurgeability, AssetCandidate, PurgeDecision } from "@/lib/dust-logic";
import { ArrowRight, Flame, Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button"; // Assuming this import is needed for the new Button component

// MOCK DATA GENERATOR
const generateMockDust = (walletDefined: boolean): AssetCandidate[] => {
  if (!walletDefined) return [];
  return [
    { chain: "Astar", symbol: "ASTR", amount: BigInt(4500000000000000000), decimals: 18, isNative: true, isSufficient: true, estimatedValueDot: 0.27, nativeBalance: BigInt(100), sourceChainXcmFee: 0.001 },
    { chain: "Moonbeam", symbol: "GLMR", amount: BigInt(1200000000000000000), decimals: 18, isNative: true, isSufficient: true, estimatedValueDot: 0.12, nativeBalance: BigInt(15000000000000000), sourceChainXcmFee: 0.01 },
    { chain: "Phala", symbol: "PHA", amount: BigInt(500000000000), decimals: 12, isNative: true, isSufficient: true, estimatedValueDot: 0.08, nativeBalance: BigInt(10000000000000), sourceChainXcmFee: 0.005 },
    { chain: "Polkadot", symbol: "DOT", amount: BigInt(200000000), decimals: 10, isNative: true, isSufficient: true, estimatedValueDot: 0.10, nativeBalance: BigInt(1000000000), sourceChainXcmFee: 0.001 },
    // The TRAP
    { chain: "Interlay", symbol: "iBTC", amount: BigInt(300), decimals: 8, isNative: false, isSufficient: false, estimatedValueDot: 0.04, nativeBalance: BigInt(0), sourceChainXcmFee: 0.02 },
  ];
};

export default function Home() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [xcmTxHash, setXcmTxHash] = useState<string | null>(null);
  const [relayerStatus, setRelayerStatus] = useState<string | null>(null);

  // Constants
  const MIN_DOT_THRESHOLD = 0.05;
  const [dustAssets, setDustAssets] = useState<AssetCandidate[]>([]);
  const [batch, setBatch] = useState<AssetCandidate[]>([]);
  const [decision, setDecision] = useState<PurgeDecision>({ status: "BURN", reason: "Batch empty" });

  useEffect(() => {
    if (accounts.length > 0) {
      // Simulate fetching
      setTimeout(() => {
        setDustAssets(generateMockDust(true));
      }, 1000);
    }
  }, [accounts]);

  useEffect(() => {
    setDecision(analyzePurgeability(batch));
  }, [batch]);

  const addToBatch = (asset: AssetCandidate) => {
    setBatch([...batch, asset]);
    setDustAssets(dustAssets.filter((a) => a.symbol !== asset.symbol));
  };

  const removeFromBatch = (asset: AssetCandidate) => {
    setDustAssets([...dustAssets, asset]);
    setBatch(batch.filter((a) => a.symbol !== asset.symbol));
  };

  return (
    <main className="min-h-screen bg-black text-zinc-200 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <nav className="border-b border-zinc-900 p-6 flex justify-between items-center bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Flame className="text-white fill-white" size={24} />
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-white">DOTDOT<span className="text-zinc-600">DUST</span></h1>
        </div>
        <WalletConnect onConnect={setAccounts} />
      </nav>

      {/* Hero / State */}
      <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-12 mt-10">
        
        {/* LEFT COLUMN: The Junkyard */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-zinc-400 mb-2">The Junkyard</h2>
            <p className="text-zinc-600 text-sm">Scattered assets found across the ecosystem.</p>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {dustAssets.map((asset) => (
                <motion.div
                  key={asset.symbol}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition flex justify-between items-center group cursor-pointer"
                  onClick={() => addToBatch(asset)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-500">
                      {asset.symbol[0]}
                    </div>
                    <div>
                      <div className="font-bold text-white">{asset.symbol}</div>
                      <div className="text-xs text-zinc-500">{asset.chain}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-zinc-300">
                         {/* Hacky mock display */}
                         {(Number(asset.amount) / Math.pow(10, asset.decimals)).toFixed(4)}
                    </div>
                    {/* Tiny "Add" hints */}
                    <div className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition">
                      Add to Batch →
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {dustAssets.length === 0 && accounts.length > 0 && (
              <div className="p-8 text-center text-zinc-700 border border-dashed border-zinc-800 rounded-xl">
                Asset list empty (or all added).
              </div>
            )}
             {dustAssets.length === 0 && accounts.length === 0 && (
              <div className="p-8 text-center text-zinc-700 border border-dashed border-zinc-800 rounded-xl">
                Connect wallet to scan for dust.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: The Crucible */}
        <div className="relative">
          <div className={`sticky top-32 p-8 rounded-3xl border transition-all duration-500 ${
              decision.status === "PURGE" ? "bg-zinc-900 border-green-500/50 shadow-[0_0_50px_rgba(34,197,94,0.1)]" : 
              decision.status === "BLOCKED" ? "bg-red-950/10 border-red-900/50" :
              "bg-zinc-900 border-zinc-800"
          }`}>
            
            <div className="flex justify-between items-start mb-8">
              <h2 className="text-2xl font-black text-white">The Crucible</h2>
              <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                   decision.status === "PURGE" ? "bg-green-500/20 text-green-400" :
                   decision.status === "BLOCKED" ? "bg-red-500/20 text-red-400" :
                   "bg-zinc-800 text-zinc-500"
              }`}>
                {decision.status} MODE
              </div>
            </div>

            {/* BATCH ITEMS */}
            <div className="space-y-2 mb-8 min-h-[150px]">
              {batch.length === 0 ? (
                 <div className="text-zinc-600 italic text-center py-10">
                    Drag dust here to incinerate.
                 </div>
              ) : (
                batch.map((asset) => (
                    <div key={asset.symbol} className="flex justify-between text-sm py-2 border-b border-zinc-800/50 last:border-0">
                        <span className="text-zinc-300">{asset.chain} <span className="text-zinc-500">/</span> {asset.symbol}</span>
                        <button onClick={() => removeFromBatch(asset)} className="text-zinc-500 hover:text-white hover:line-through transition">
                             {(Number(asset.amount) / Math.pow(10, asset.decimals)).toFixed(4)}
                        </button>
                    </div>
                ))
              )}
            </div>

            {/* STATUS / GATEKEEPER MESSAGES */}
            <div className="bg-black/50 rounded-xl p-4 mb-6">
                {(decision.status === "BURN" || decision.status === "WARNING") && (
                    <div className="flex gap-3 text-orange-400">
                        <AlertTriangle size={20} />
                        <span className="text-sm font-medium">{decision.reason}</span>
                    </div>
                )}
                {decision.status === "BLOCKED" && (
                    <div className="flex gap-3 text-red-500">
                        <ShieldAlert size={20} />
                         <span className="text-sm font-bold">{decision.reason}</span>
                    </div>
                )}
                 {decision.status === "PURGE" && (
                    <div className="flex gap-3 text-green-400">
                        <Flame size={20} />
                         <div className="flex flex-col">
                            <span className="text-sm font-bold">BATCH READY FOR INCINERATION</span>
                            <span className="text-xs text-green-500/70">Est. Return: ~{(decision.netValue || 0).toFixed(4)} DOT (after 5% cut)</span>
                         </div>
                    </div>
                )}
            </div>

            {/* ACTION BUTTON */}
            <button 
                disabled={decision.status !== "PURGE"}
                className={`w-full py-4 rounded-xl font-black tracking-widest text-lg transition-all flex items-center justify-center gap-3 ${
                    decision.status === "PURGE" 
                    ? "bg-white text-black hover:scale-[1.02] shadow-[0_0_30px_rgba(255,255,255,0.3)]" 
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                }`}
            >
                {decision.status === "BLOCKED" ? "GATEKEEPER LOCK" : "PURGE BATCH"}
                {decision.status === "PURGE" && <ArrowRight size={20} />}
            </button>

          </div>
        </div>
      </div>
    </main>
  );
}
