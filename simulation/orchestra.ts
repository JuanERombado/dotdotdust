import { setupWithServer } from "@acala-network/chopsticks";

async function main() {
  console.log("🎻 initializing ONE BLOCK Orchestra (Polkadot, Astar, Hydration)...");

  // 1. Polkadot Relay Chain (Port 8000)
  const dot = await setupWithServer({
    endpoint: "wss://rpc.polkadot.io",
    port: 8000,
    block: "latest"
  });
  console.log("✅ Polkadot Relay  -> ws://localhost:8000 (Block " + (await dot.chain.head.header).number + ")");

  // 2. Astar Network (Port 8001)
  const astar = await setupWithServer({
    endpoint: "wss://rpc.astar.network",
    port: 8001,
    block: "latest"
  });
  console.log("✅ Astar Network   -> ws://localhost:8001 (Block " + (await astar.chain.head.header).number + ")");

  // 3. Hydration (Port 8002)
  const hydra = await setupWithServer({
    endpoint: "wss://rpc.hydradx.cloud",
    port: 8002,
    block: "latest"
  });
  console.log("✅ Hydration       -> ws://localhost:8002 (Block " + (await hydra.chain.head.header).number + ")");

  console.log("\n🎻 Orchestra is conducting. Press Ctrl+C to stop.");
}

main().catch(console.error);
