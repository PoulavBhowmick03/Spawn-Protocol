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

export function useTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/timeline");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const parsed: TimelineEvent[] = data.map((e: any) => ({
        ...e,
        blockNumber: BigInt(e.blockNumber),
        timestamp: e.timestamp ? BigInt(e.timestamp) : undefined,
      }));

      setEvents(parsed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 15000);
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
