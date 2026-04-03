"use client";

import { useState, useEffect, useCallback } from "react";
import { useChainContext } from "@/context/ChainContext";
import { CONTRACTS } from "@/lib/contracts";

export type EventType =
  | "ChildSpawned"
  | "ChildTerminated"
  | "VoteCast"
  | "AlignmentUpdated"
  | "RationaleRevealed"
  | "FundsReallocated"
  | "ValuesUpdated"
  | "Deposited";

export interface TimelineEvent {
  id: string;
  type: EventType;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  timestamp?: bigint;
  data: Record<string, unknown>;
}

const CLIENT_CACHE_TTL = 20_000;
const POLL_INTERVAL_MS = 30_000;

let timelineCache: { data: TimelineEvent[]; fetchedAt: number } | null = null;
let timelineRequest: Promise<TimelineEvent[]> | null = null;

function normalizeTimeline(data: any[]): TimelineEvent[] {
  return data.map((e: any) => ({
    ...e,
    blockNumber: BigInt(e.blockNumber),
    timestamp: e.timestamp ? BigInt(e.timestamp) : undefined,
  }));
}

async function fetchTimeline(force = false): Promise<TimelineEvent[]> {
  const now = Date.now();
  if (!force && timelineCache && now - timelineCache.fetchedAt < CLIENT_CACHE_TTL) {
    return timelineCache.data;
  }

  if (timelineRequest) return timelineRequest;

  timelineRequest = (async () => {
    const res = await fetch("/api/timeline", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API ${res.status}`);
    if (data.error) throw new Error(data.error);

    const normalized = normalizeTimeline(data);
    timelineCache = { data: normalized, fetchedAt: Date.now() };
    return normalized;
  })();

  try {
    return await timelineRequest;
  } finally {
    timelineRequest = null;
  }
}

export function useTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>(() => timelineCache?.data ?? []);
  const [loading, setLoading] = useState(() => !timelineCache);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (options?: { force?: boolean; background?: boolean }) => {
    try {
      if (!options?.background && !timelineCache && events.length === 0) {
        setLoading(true);
      }
      const parsed = await fetchTimeline(options?.force);
      setEvents(parsed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData({ background: !!timelineCache });
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchData({ force: true, background: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { events, loading, error };
}

export function useTreasuryData() {
  const { client } = useChainContext();
  const [governanceValues, setGovernanceValues] = useState<string>("");
  const [parentAgent, setParentAgent] = useState<`0x${string}` | null>(null);
  const [maxChildren, setMaxChildren] = useState<bigint>(BigInt(0));
  const [maxBudgetPerChild, setMaxBudgetPerChild] = useState<bigint>(BigInt(0));
  const [emergencyPause, setEmergencyPause] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const contracts = CONTRACTS;
    try {
      const [values, agent, maxC, maxB, paused] = await Promise.all([
        client.readContract({
          address: contracts.ParentTreasury.address,
          abi: contracts.ParentTreasury.abi,
          functionName: "getGovernanceValues",
        }),
        client.readContract({
          address: contracts.ParentTreasury.address,
          abi: contracts.ParentTreasury.abi,
          functionName: "parentAgent",
        }),
        client.readContract({
          address: contracts.ParentTreasury.address,
          abi: contracts.ParentTreasury.abi,
          functionName: "maxChildren",
        }),
        client.readContract({
          address: contracts.ParentTreasury.address,
          abi: contracts.ParentTreasury.abi,
          functionName: "maxBudgetPerChild",
        }),
        client.readContract({
          address: contracts.ParentTreasury.address,
          abi: contracts.ParentTreasury.abi,
          functionName: "emergencyPause",
        }),
      ]);
      setGovernanceValues(values);
      setParentAgent(agent);
      setMaxChildren(maxC);
      setMaxBudgetPerChild(maxB);
      setEmergencyPause(paused);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch treasury data");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    governanceValues,
    parentAgent,
    maxChildren,
    maxBudgetPerChild,
    emergencyPause,
    loading,
    error,
    refetch: fetchData,
  };
}
