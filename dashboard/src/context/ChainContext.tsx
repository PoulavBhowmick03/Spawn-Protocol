"use client";
import { createContext, useContext, type ReactNode } from "react";
import { baseSepoliaClient } from "@/lib/client";
import type { PublicClient } from "viem";

interface ChainContextValue {
  client: PublicClient;
  explorerBase: string;
}

const ChainContext = createContext<ChainContextValue>({
  client: baseSepoliaClient as unknown as PublicClient,
  explorerBase: "https://sepolia.basescan.org",
});

export function ChainProvider({ children }: { children: ReactNode }) {
  return (
    <ChainContext.Provider value={{ client: baseSepoliaClient as unknown as PublicClient, explorerBase: "https://sepolia.basescan.org" }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChainContext() {
  return useContext(ChainContext);
}
