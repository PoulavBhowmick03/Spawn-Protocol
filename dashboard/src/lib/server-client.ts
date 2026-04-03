import { createPublicClient, http, fallback } from "viem";
import { baseSepolia } from "viem/chains";

// Server-side viem client — shared across all API routes
export const serverClient = createPublicClient({
  chain: baseSepolia,
  transport: fallback([
    http("https://base-sepolia-rpc.publicnode.com"),
    http("https://sepolia.base.org"),
    http("https://base-sepolia.drpc.org"),
  ]),
  ccipRead: false,
  batch: { multicall: true },
});

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; expiresAt: number }>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: any, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
