"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { baseSepoliaClient, celoSepoliaClient } from "@/lib/client";
import type { PublicClient } from "viem";

export type ChainId = "base" | "celo";

interface ChainContextValue {
  chainId: ChainId;
  setChainId: (id: ChainId) => void;
  client: PublicClient;
  explorerBase: string;
}

const ChainContext = createContext<ChainContextValue>({
  chainId: "base",
  setChainId: () => {},
  client: baseSepoliaClient as unknown as PublicClient,
  explorerBase: "https://sepolia.basescan.org",
});

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainId] = useState<ChainId>("base");

  const client = chainId === "base" ? baseSepoliaClient : celoSepoliaClient;
  const explorerBase = chainId === "base"
    ? "https://sepolia.basescan.org"
    : "https://celo-alfajores.blockscout.com";

  return (
    <ChainContext.Provider value={{ chainId, setChainId, client: client as unknown as PublicClient, explorerBase }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChainContext() {
  return useContext(ChainContext);
}
