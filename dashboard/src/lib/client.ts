import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { defineChain } from "viem";

export const celoSepolia = defineChain({
  id: 44787,
  name: "Celo Alfajores",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://alfajores-forno.celo-staging.org"] } },
  blockExplorers: { default: { name: "Celo Explorer", url: "https://celo-alfajores.blockscout.com" } },
});

export const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});

export const celoSepoliaClient = createPublicClient({
  chain: celoSepolia,
  transport: http("https://alfajores-forno.celo-staging.org"),
});

// Default export kept for backward compat — hooks override via context
export const publicClient = baseSepoliaClient;
