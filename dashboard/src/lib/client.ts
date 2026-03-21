import { createPublicClient, http, fallback } from "viem";
import { baseSepolia } from "viem/chains";

export const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: fallback([
    http("https://base-sepolia-rpc.publicnode.com"),
    http("https://sepolia.base.org"),
    http("https://base-sepolia.drpc.org"),
  ]),
  ccipRead: false,
  batch: {
    multicall: true,
  },
});

export const publicClient = baseSepoliaClient;
