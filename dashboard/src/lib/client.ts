import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { defineChain } from "viem";

export const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://celo-sepolia.drpc.org"] } },
  blockExplorers: { default: { name: "Celo Explorer", url: "https://celo-sepolia.celoscan.io" } },
});

export const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://base-sepolia-rpc.publicnode.com"),
});

export const celoSepoliaClient = createPublicClient({
  chain: celoSepolia,
  transport: http("https://celo-sepolia.drpc.org"),
});

// Default export kept for backward compat — hooks override via context
export const publicClient = baseSepoliaClient;
