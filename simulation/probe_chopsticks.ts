import { setupWithServer } from "@acala-network/chopsticks";

async function probe() {
  console.log("Probing...");
  const ret = await setupWithServer({
    endpoint: "wss://rpc.polkadot.io",
    port: 8005,
    block: "latest"
  });
  console.log("Return keys:", Object.keys(ret));
  // @ts-ignore
  if (ret.chain) console.log("Has chain");
  process.exit(0);
}

probe().catch(console.error);
