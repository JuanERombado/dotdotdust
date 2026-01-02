"use client";

import { useState, useEffect } from "react";
import WalletConnect from "@/components/WalletConnect";
import { analyzePurgeability, AssetCandidate, PurgeDecision } from "@/lib/dust-logic";
import { ArrowRight, Flame, Trash2, AlertTriangle, ShieldAlert, Sparkles, BoxSelect, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { chainService } from "@/lib/chain-service"; // Phase 9: Plumbing
import { PurgeParticles } from "@/components/PurgeParticles";

// MOCK DATA GENERATOR (Kept Intact for Verification)
const generateMockDust = (walletDefined: boolean): AssetCandidate[] => {
  if (!walletDefined) return [];
  return [
    { chain: "Polkadot", symbol: "DOT", amount: BigInt(800000000), decimals: 10, isNative: true, isSufficient: true, estimatedValueDot: 0.80, nativeBalance: BigInt(1000000000), sourceChainXcmFee: 0.001 }, 
    { chain: "Astar", symbol: "ASTR", amount: BigInt(9500000000000000000n), decimals: 18, isNative: true, isSufficient: true, estimatedValueDot: 0.57, nativeBalance: BigInt(100), sourceChainXcmFee: 0.01 }, 
    { chain: "Moonbeam", symbol: "GLMR", amount: BigInt(5200000000000000000n), decimals: 18, isNative: true, isSufficient: true, estimatedValueDot: 0.48, nativeBalance: BigInt(15000000000000000), sourceChainXcmFee: 0.02 }, 
    { chain: "Hydration", symbol: "HDX", amount: BigInt(500000000000), decimals: 12, isNative: true, isSufficient: true, estimatedValueDot: 0.08, nativeBalance: BigInt(10000000000000), sourceChainXcmFee: 0.001 }, 
    { chain: "Interlay", symbol: "iBTC", amount: BigInt(300), decimals: 8, isNative: false, isSufficient: false, estimatedValueDot: 0.04, nativeBalance: BigInt(0), sourceChainXcmFee: 0.02 },
  ];
};

export default function Home() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [dustAssets, setDustAssets] = useState<AssetCandidate[]>([]);
  const [batch, setBatch] = useState<AssetCandidate[]>([]);
  const [decision, setDecision] = useState<PurgeDecision>({ status: "BURN", reason: "Reactor Empty" });
  const [isReacting, setIsReacting] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [simMode, setSimMode] = useState(false);

  useEffect(() => {
    const activeAccount = accounts[0];
    if (activeAccount) {
      if (activeAccount.meta?.source === "mock") {
        setTimeout(() => setDustAssets(generateMockDust(true)), 800);
      } else {
        // PHASE 9: REAL SCANNER
        setIsReacting(true);
        chainService.fetchChainAssets(activeAccount.address)
          .then(assets => {
            if (assets.length === 0) {
              console.log("No real dust found. Reverting to Demo Artifacts for testing.");
              setDustAssets(generateMockDust(true));
            } else {
              setDustAssets(assets);
            }
            setIsReacting(false);
          })
          .catch(err => {
            setDustAssets(generateMockDust(true)); // Fallback on error
            setIsReacting(false);
          });
      }
    }
  }, [accounts[0]?.address]); // Only run when the address actually changes

  useEffect(() => {
    setDecision(analyzePurgeability(batch));
  }, [batch]);

  const addToBatch = (asset: AssetCandidate) => {
    setBatch([...batch, asset]);
    setDustAssets(dustAssets.filter((a) => a.symbol !== asset.symbol));
    
    // Trigger Reactor Pulse
    setIsReacting(true);
    setTimeout(() => setIsReacting(false), 400);
  };

  const removeFromBatch = (asset: AssetCandidate) => {
    setDustAssets([...dustAssets, asset]);
    setBatch(batch.filter((a) => a.symbol !== asset.symbol));
  };

  const handlePurge = async () => {
    setIsReacting(true);

    try {
        console.log("🔥 INITIATING PURGE SEQUENCE...");
        
        // 1. Teleport Assets Loop
        for (const asset of batch) {
             setDecision({ status: "PURGE", reason: `Teleporting ${asset.symbol} via XCM...` });
             
             // Check if supported chain
             if (!["Polkadot", "Astar", "Hydration"].includes(asset.chain)) {
                 console.warn(`Skipping ${asset.symbol} (Chain ${asset.chain} XCM not yet supported)`);
                 continue;
             }

             // Find a Substrate account for this XCM transaction
             // In Sim Mode, we allow the 'mock' account to trigger the purge (using dev keys)
             const substrateAccount = accounts.find(acc => 
                (acc.meta.source !== "metamask" && acc.meta.source !== "mock") || 
                (simMode && acc.meta.source === "mock")
             );
             console.log("🛠️ Purge Account Selection:", { accounts, selected: substrateAccount, simMode });
             
             if (!substrateAccount) {
                 throw new Error("XCM Teleport requires a Substrate wallet (Talisman, SubWallet, or Polkadot-js). Please connect a Substrate extension to proceed.");
             }

             // Construct XCM Call
             const tx = await chainService.teleportAsset(
                asset.chain, 
                asset.symbol, 
                BigInt(asset.amount), 
                substrateAccount.address
             );
             
             // Sign and Send (Substrate)
             await chainService.signAndSend(tx, substrateAccount, asset.chain);
        }

        // 2. Success State
        setDecision({ status: "PURGE", reason: "ASSETS IN FLIGHT", method: "XCM Teleport" });
        setIsReacting(false);
        setShowParticles(true);
        setTimeout(() => setShowParticles(false), 5000); 
        alert("Purge Initiated! Assets are teleporting to Westend Asset Hub.");

    } catch (e: any) {
        console.error("Purge Failed", e);
        setIsReacting(false);
        setDecision({ status: "BLOCKED", reason: `Transaction Failed: ${e.message || "Unknown error"}` });
        alert("Purge Failed. See console.");
    }
  };


  return (
    <main className="min-h-screen relative text-zinc-100 overflow-hidden">
        {/* Global Noise Overlay */}
        <div className="bg-noise" />
        <PurgeParticles active={showParticles} />

        {/* --- HEADER: SOVEREIGNTY --- */}
        <nav className="fixed top-0 w-full z-50 p-6 flex justify-between items-center backdrop-blur-md border-b border-white/5">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white text-black flex items-center justify-center rounded-sm font-black text-xl tracking-tighter shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                    D.
                </div>
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold tracking-[0.2em] uppercase leading-none">DOTDOTDUST</h1>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest pl-[1px]">PURGE THE PAST. FUND THE FUTURE.</span>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => {
                        const newState = !simMode;
                        setSimMode(newState);
                        chainService.toggleSimulation(newState);
                        // Trigger re-scan
                         if (accounts.length > 0) {
                             setIsReacting(true);
                             chainService.fetchChainAssets(accounts[0].address)
                                .then(assets => { setDustAssets(assets); setIsReacting(false); })
                                .catch(() => setIsReacting(false));
                         }
                    }}
                    className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-mono border transition-all uppercase tracking-wider flex items-center gap-2",
                        simMode 
                            ? "bg-purple-500/10 border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]" 
                            : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    )}
                >
                    <div className={cn("w-1.5 h-1.5 rounded-full", simMode ? "bg-purple-500 animate-pulse" : "bg-zinc-600")} />
                    {simMode ? "Sim Mode Active" : "Sim Inactive"}
                </button>
                <WalletConnect onConnect={setAccounts} />
            </div>
        </nav>

        {/* --- MAIN GRID --- */}
        <div className="max-w-7xl mx-auto pt-32 px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 h-[calc(100vh-100px)]">
            
            {/* LEFT: THE JUNKYARD (ARTIFACT DISCOVERY) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <h2 className="text-sm font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <BoxSelect size={14} className="text-zinc-600" />
                        Discovered Artifacts
                    </h2>
                    <span className="text-xs font-mono text-zinc-600">
                        {dustAssets.length} Unclaimed Signal(s)
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto pr-2 pb-20 custom-scrollbar">
                    <AnimatePresence mode="popLayout">
                        {dustAssets.map((asset) => (
                            <motion.div
                                key={asset.symbol}
                                layoutId={asset.symbol}
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.5, filter: "blur(10px)" }}
                                whileHover={{ scale: 1.02, borderColor: "rgba(255,255,255,0.3)" }}
                                onClick={() => addToBatch(asset)}
                                className="glass-panel p-5 rounded-lg cursor-pointer group relative overflow-hidden transition-colors hover:bg-white/5"
                            >
                                <div className="flex justify-between items-start z-10 relative">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-bold font-mono">
                                            {asset.symbol.substring(0, 2)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-lg leading-tight">{asset.symbol}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-zinc-500">{asset.chain}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-mono text-zinc-400 text-sm">
                                            {(Number(asset.amount) / Math.pow(10, asset.decimals)).toFixed(4)}
                                        </div>
                                        <div className="text-[10px] text-zinc-600">~${(asset.estimatedValueDot * 10).toFixed(2)}</div>
                                    </div>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    
                    {dustAssets.length === 0 && accounts.length === 0 && (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-700 border border-dashed border-white/5 rounded-lg">
                            <RefreshCcw className="mb-4 opacity-50 animate-spin-slow" />
                            <p className="font-mono text-sm">Awaiting Neural Link...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: THE CRUCIBLE (REACTOR CORE) */}
            <div className="lg:col-span-5 relative">
                <div className="sticky top-32">
                    <motion.div 
                        layout 
                        className={cn(
                            "relative overflow-hidden rounded-2xl border transition-all duration-300 backdrop-blur-3xl min-h-[500px] flex flex-col justify-between",
                            isReacting ? "shadow-[0_0_80px_rgba(255,255,255,0.2)] border-white bg-white/10 scale-[1.02]" : "",
                            !isReacting && decision.status === "PURGE" ? "border-green-500/50 bg-green-950/20 shadow-[0_0_100px_-20px_rgba(34,197,94,0.3)]" :
                            !isReacting && decision.status === "BLOCKED" ? "border-red-500/50 bg-red-950/20 shadow-[0_0_100px_-20px_rgba(239,68,68,0.3)]" :
                            !isReacting && "border-white/10 bg-zinc-950/80"
                        )}
                    >
                        {/* REACTOR HEADER */}
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                            <div className="flex items-center gap-3">
                                <div className={cn("w-2 h-2 rounded-full shadow-[0_0_10px_currentColor]", 
                                    decision.status === "PURGE" ? "bg-green-500 text-green-500" : 
                                    decision.status === "BLOCKED" ? "bg-red-500 text-red-500" : "bg-zinc-500 text-zinc-500"
                                )} />
                                <span className="font-mono text-xs tracking-[0.2em] uppercase text-zinc-400">Rate Limiter: {decision.status}</span>
                            </div>
                        </div>

                        {/* REACTOR CHAMBER (Assets Drop Here) */}
                        <div className="flex-1 p-6 space-y-2 overflow-y-auto max-h-[400px]">
                            <AnimatePresence mode="popLayout">
                                {batch.length === 0 ? (
                                    <motion.div 
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                                        className="h-full flex items-center justify-center flex-col text-zinc-700 gap-4 opacity-50"
                                    >
                                        <div className="w-16 h-16 rounded-full border border-dashed border-zinc-700 flex items-center justify-center">
                                            <Flame size={20} />
                                        </div>
                                        <span className="font-mono text-xs">REACTOR CORE IDLE</span>
                                    </motion.div>
                                ) : (
                                    batch.map((asset) => (
                                        <motion.div
                                            layoutId={asset.symbol}
                                            key={`batch-${asset.symbol}`}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.5, x: 50 }}
                                            className="flex items-center justify-between p-3 rounded bg-white/5 border border-white/5 hover:border-red-500/30 group cursor-pointer transition-colors"
                                            onClick={() => removeFromBatch(asset)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-zinc-500 text-[10px] font-mono w-16 text-right">{asset.chain}</span>
                                                <span className="font-bold text-sm tracking-wide">{asset.symbol}</span>
                                            </div>
                                            <div className="flex items-center gap-2 group-hover:text-red-400 text-zinc-400 font-mono text-xs transition-colors">
                                                <span>{(Number(asset.amount) / Math.pow(10, asset.decimals)).toFixed(4)}</span>
                                                <Trash2 size={12} className="opacity-0 group-hover:opacity-100" />
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </AnimatePresence>
                        </div>

                        {/* REACTOR CONTROLS */}
                        <div className="p-6 bg-black/40 border-t border-white/10 space-y-4">
                            {/* Warnings/Metrics */}
                            <div className="min-h-[24px]">
                                {decision.status === "PURGE" && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center text-green-400 font-mono text-xs">
                                        <span className="flex items-center gap-2"><Sparkles size={12} /> CRITICAL MASS ACHIEVED</span>
                                        <span>Est. ~{(decision.netValue || 0).toFixed(4)} DOT</span>
                                    </motion.div>
                                )}
                                {(decision.status === "BURN" || decision.status === "WARNING") && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-orange-400 font-mono text-xs">
                                        <AlertTriangle size={12} />
                                        <span>
                                           {/* PREDICTIVE DEFICIT LOGIC */}
                                           {decision.netValue && decision.netValue > 0 && decision.netValue < 0.05
                                                ? `INSUFFICIENT MASS: Add ${(0.05 - decision.netValue).toFixed(3)} DOT more value to purge.`
                                                : decision.reason
                                           }
                                        </span>
                                    </motion.div>
                                )}
                                {decision.status === "BLOCKED" && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-red-500 font-mono text-xs font-bold">
                                        <ShieldAlert size={12} />
                                        <span>{decision.reason}</span>
                                    </motion.div>
                                )}
                            </div>

                            {/* BIG RED BUTTON */}
                            <button
                                onClick={handlePurge}
                                disabled={decision.status !== "PURGE"}
                                className={cn(
                                    "w-full h-16 rounded-lg font-black tracking-[0.2em] text-sm uppercase transition-all flex items-center justify-center gap-3 relative overflow-hidden group",
                                    decision.status === "PURGE" 
                                    ? "bg-white text-black hover:bg-zinc-200" 
                                    : "bg-zinc-900 text-zinc-600 cursor-not-allowed border border-white/5"
                                )}
                            >
                                {decision.status === "PURGE" && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shine duration-1000" />
                                )}
                                <span>{decision.status === "BLOCKED" ? "GATE LOCKED" : "INITIATE PURGE"}</span>
                                {decision.status === "PURGE" && <ArrowRight className="animate-pulse" size={16} />}
                            </button>
                        </div>
                    </motion.div>

                    {/* DECORATIVE ELEMENTS */}
                    <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-b from-indigo-500/10 to-purple-500/10 blur-[100px] opacity-20 pointer-events-none" />
                </div>
            </div>

        </div>
    </main>
  );
}
