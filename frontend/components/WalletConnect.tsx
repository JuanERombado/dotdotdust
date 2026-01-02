"use client";

import { useState, useEffect } from "react";
import { web3Accounts, web3Enable } from "@polkadot/extension-dapp";
import { Wallet } from "lucide-react";

interface Account {
  address: string;
  meta: {
    name?: string;
    source: string;
  };
}

export default function WalletConnect({ onConnect }: { onConnect: (accounts: Account[]) => void }) {
  const [mounted, setMounted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const connectWallet = async () => {
    if (typeof window === "undefined") return;

    try {
        const combinedAccounts: Account[] = [];

        // 1. Try Polkadot Extensions (Prioritize for XCM)
        try {
            const extensions = await web3Enable("dotdotdust");
            if (extensions.length > 0) {
                const polkadotAccounts = await web3Accounts();
                polkadotAccounts.forEach((acc) => {
                    combinedAccounts.push({
                        address: acc.address,
                        meta: { name: acc.meta.name || "Polkadot", source: acc.meta.source }
                    });
                });
            }
        } catch (pdErr) {
            console.warn("Polkadot extension connection skipped/failed", pdErr);
        }

        // 2. Try MetaMask (EVM)
        if ((window as any).ethereum) {
            try {
                let provider = (window as any).ethereum;
                if ((window as any).ethereum.providers) {
                    provider = (window as any).ethereum.providers.find((p: any) => p.isMetaMask) || (window as any).ethereum;
                }

                console.log("🦊 Requesting MetaMask accounts...");
                const ethAccounts = await provider.request({ method: 'eth_requestAccounts' });
                
                if (ethAccounts && ethAccounts.length > 0) {
                    ethAccounts.forEach((addr: string) => {
                        combinedAccounts.push({
                            address: addr,
                            meta: { name: "MetaMask", source: "metamask" }
                        });
                    });
                }
            } catch (ethErr) {
                console.warn("MetaMask connection skipped/failed", ethErr);
            }
        }

        if (combinedAccounts.length > 0) {
            setAccounts(combinedAccounts);
            setConnected(true);
            onConnect(combinedAccounts);
            return;
        }

        // 3. MOCK FALLBACK (Only if no real wallets found)
        console.warn("No real wallets found. Injecting mock account.");
        const mockAccounts: Account[] = [
          { address: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", meta: { name: "ALICE (MOCK)", source: "mock" } }
        ];
        setAccounts(mockAccounts);
        setConnected(true);
        onConnect(mockAccounts);
    } catch (e) {
        console.error("Wallet connection failed", e);
    }
  };

  if (!mounted) return <div className="h-10 w-32 bg-zinc-900 rounded-lg animate-pulse" />;

  return (
    <div className="flex items-center gap-4">
      {!connected ? (
        <button
            onClick={connectWallet}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(79,70,229,0.5)]"
        >
          <Wallet size={18} />
          Connect Wallet
        </button>
      ) : (
        <div className="flex flex-col items-end bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg transition-all border-green-500/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-zinc-400 text-sm font-mono">
              {accounts[0]?.address.slice(0, 6)}...
            </span>
          </div>
          <div className="flex gap-1 mt-1">
            {Array.from(new Set(accounts.map(a => a.meta.source))).map(source => (
               <span key={source} className="text-[9px] uppercase tracking-tighter text-zinc-600 border border-zinc-800 px-1 rounded">
                 {source}
               </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
