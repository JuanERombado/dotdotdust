import "@nomicfoundation/hardhat-toolbox";

const config = {
  solidity: "0.8.24",
  networks: {
    revive: {
      url: "https://westend-asset-hub-rpc.polkadot.io", // Placeholder
      chainId: 420420,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
