import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PolkaPurge - Dust Sweeper for Polkadot",
  description: "Consolidate dust balances from 7 parachains (Polkadot, Astar, Hydration, Moonbeam, Acala, Bifrost, Interlay) into DOT with one click. Powered by Revive smart contracts.",
  keywords: ["Polkadot", "Dust", "XCM", "DOT", "Astar", "Hydration", "Moonbeam", "Acala", "Bifrost", "Interlay", "Revive", "DeFi"],
  authors: [{ name: "PolkaPurge" }],
  openGraph: {
    title: "PolkaPurge - Dust Sweeper for Polkadot",
    description: "Consolidate dust balances from 7 parachains into DOT - stay in the Polkadot ecosystem",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
