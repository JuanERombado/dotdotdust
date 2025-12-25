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
        // 1. Enable extensions
        const extensions = await web3Enable("dotdotdust");
        
        if (extensions.length === 0) {
          // MOCK FALLBACK FOR TESTING/DEV
          console.warn("No Polkadot extension found. Injecting mock account for demonstration.");
          const mockAccounts: Account[] = [
            { address: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", meta: { name: "ALICE (MOCK)", source: "mock" } }
          ];
          setAccounts(mockAccounts);
          setConnected(true);
          onConnect(mockAccounts);
          return;
        }

        // 2. Get accounts
        const allAccounts = await web3Accounts();
        setAccounts(allAccounts as Account[]);
        setConnected(true);
        onConnect(allAccounts as Account[]);
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
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg transition-all border-green-500/50">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-zinc-400 text-sm font-mono">
            {accounts.length} Accounts Connected
          </span>
        </div>
      )}
    </div>
  );
}
