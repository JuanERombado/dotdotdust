"use client";

import { useState, useEffect } from "react";
import { web3Accounts, web3Enable } from "@polkadot/extension-dapp";
import { Button } from "./ui/button"; // Placeholder for UI component
import { Wallet } from "lucide-react";

interface Account {
  address: string;
  meta: {
    name?: string;
    source: string;
  };
}

export default function WalletConnect({ onConnect }: { onConnect: (accounts: Account[]) => void }) {
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const connectWallet = async () => {
    if (typeof window === "undefined") return;

    // 1. Enable extensions
    const extensions = await web3Enable("dotdotdust");
    if (extensions.length === 0) {
      alert("No Polkadot extension found! Install Talisman or Polkadot Vault.");
      return;
    }

    // 2. Get accounts
    const allAccounts = await web3Accounts();
    setAccounts(allAccounts as Account[]);
    setConnected(true);
    onConnect(allAccounts as Account[]);
  };

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
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-zinc-400 text-sm font-mono">
            {accounts.length} Accounts Connected
          </span>
        </div>
      )}
    </div>
  );
}
