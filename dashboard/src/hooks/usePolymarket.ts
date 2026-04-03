"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  description: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string;
  startDate: string;
  image: string;
  active: boolean;
  closed: boolean;
  // Mapped to Proposal-like fields for agent voting
  uid: string;
  source: "polymarket";
}

export function usePolymarket() {
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<PolymarketMarket[]>([]);

  const fetchMarkets = useCallback(async () => {
    try {
      // Use local API route to avoid CORS issues with Polymarket's Gamma API
      const res = await fetch("/api/polymarket");
      if (!res.ok) throw new Error(`Polymarket API ${res.status}`);
      const raw = await res.json();

      const parsed: PolymarketMarket[] = raw
        .filter((m: any) => m.question && m.active && !m.closed)
        .map((m: any) => {
          let outcomes: string[] = [];
          let outcomePrices: number[] = [];
          try {
            outcomes = JSON.parse(m.outcomes || "[]");
            outcomePrices = JSON.parse(m.outcomePrices || "[]").map(Number);
          } catch {}

          return {
            id: m.id,
            question: m.question,
            slug: m.slug,
            description: m.description || "",
            outcomes,
            outcomePrices,
            volume: m.volumeNum || Number(m.volume) || 0,
            volume24hr: m.volume24hr || 0,
            liquidity: m.liquidityNum || Number(m.liquidity) || 0,
            endDate: m.endDate || "",
            startDate: m.startDate || "",
            image: m.image || m.icon || "",
            active: m.active,
            closed: m.closed,
            uid: `polymarket-${m.id}`,
            source: "polymarket" as const,
          };
        });

      cache.current = parsed;
      setMarkets(parsed);
      setError(null);
    } catch (err) {
      // Preserve the last successful snapshot during background polling failures.
      if (cache.current.length === 0) {
        setError(err instanceof Error ? err.message : "Failed to fetch Polymarket data");
      } else {
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return { markets, loading, error, refetch: fetchMarkets };
}
