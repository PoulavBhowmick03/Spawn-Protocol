"use client";

import { useState, useEffect, useCallback } from "react";
import { publicClient } from "@/lib/client";
import { CONTRACTS } from "@/lib/contracts";
import type { Address } from "viem";

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
      const [
        spawnedLogs,
        terminatedLogs,
        reallocatedLogs,
        valuesLogs,
        depositLogs,
      ] = await Promise.all([
        publicClient.getLogs({
          address: CONTRACTS.SpawnFactory.address,
          event: {
            type: "event",
            name: "ChildSpawned",
            inputs: [
              { name: "childId", type: "uint256", indexed: true },
              { name: "childAddr", type: "address", indexed: false },
              { name: "governance", type: "address", indexed: false },
              { name: "budget", type: "uint256", indexed: false },
            ],
          },
          fromBlock: BigInt(0),
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: CONTRACTS.SpawnFactory.address,
          event: {
            type: "event",
            name: "ChildTerminated",
            inputs: [
              { name: "childId", type: "uint256", indexed: true },
              { name: "childAddr", type: "address", indexed: false },
              { name: "fundsReturned", type: "uint256", indexed: false },
            ],
          },
          fromBlock: BigInt(0),
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: CONTRACTS.SpawnFactory.address,
          event: {
            type: "event",
            name: "FundsReallocated",
            inputs: [
              { name: "fromId", type: "uint256", indexed: true },
              { name: "toId", type: "uint256", indexed: true },
              { name: "amount", type: "uint256", indexed: false },
            ],
          },
          fromBlock: BigInt(0),
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: CONTRACTS.ParentTreasury.address,
          event: {
            type: "event",
            name: "ValuesUpdated",
            inputs: [{ name: "values", type: "string", indexed: false }],
          },
          fromBlock: BigInt(0),
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: CONTRACTS.ParentTreasury.address,
          event: {
            type: "event",
            name: "Deposited",
            inputs: [
              { name: "from", type: "address", indexed: true },
              { name: "amount", type: "uint256", indexed: false },
            ],
          },
          fromBlock: BigInt(0),
          toBlock: "latest",
        }),
      ]);

      const allEvents: TimelineEvent[] = [
        ...spawnedLogs.map((log) => ({
          id: `spawned-${log.transactionHash}-${log.logIndex}`,
          type: "ChildSpawned" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: {
            childId: log.args?.childId?.toString(),
            childAddr: log.args?.childAddr,
            governance: log.args?.governance,
            budget: log.args?.budget?.toString(),
          },
        })),
        ...terminatedLogs.map((log) => ({
          id: `terminated-${log.transactionHash}-${log.logIndex}`,
          type: "ChildTerminated" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: {
            childId: log.args?.childId?.toString(),
            childAddr: log.args?.childAddr,
            fundsReturned: log.args?.fundsReturned?.toString(),
          },
        })),
        ...reallocatedLogs.map((log) => ({
          id: `reallocated-${log.transactionHash}-${log.logIndex}`,
          type: "FundsReallocated" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: {
            fromId: log.args?.fromId?.toString(),
            toId: log.args?.toId?.toString(),
            amount: log.args?.amount?.toString(),
          },
        })),
        ...valuesLogs.map((log) => ({
          id: `values-${log.transactionHash}-${log.logIndex}`,
          type: "ValuesUpdated" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: {
            values: log.args?.values,
          },
        })),
        ...depositLogs.map((log) => ({
          id: `deposit-${log.transactionHash}-${log.logIndex}`,
          type: "Deposited" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: {
            from: log.args?.from,
            amount: log.args?.amount?.toString(),
          },
        })),
      ];

      allEvents.sort((a, b) => {
        if (b.blockNumber > a.blockNumber) return 1;
        if (b.blockNumber < a.blockNumber) return -1;
        return 0;
      });

      setEvents(allEvents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { events, loading, error };
}

export function useTreasuryData() {
  const [governanceValues, setGovernanceValues] = useState<string>("");
  const [parentAgent, setParentAgent] = useState<Address | null>(null);
  const [maxChildren, setMaxChildren] = useState<bigint>(BigInt(0));
  const [maxBudgetPerChild, setMaxBudgetPerChild] = useState<bigint>(BigInt(0));
  const [emergencyPause, setEmergencyPause] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [values, agent, maxC, maxB, paused] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.ParentTreasury.address,
          abi: CONTRACTS.ParentTreasury.abi,
          functionName: "getGovernanceValues",
        }),
        publicClient.readContract({
          address: CONTRACTS.ParentTreasury.address,
          abi: CONTRACTS.ParentTreasury.abi,
          functionName: "parentAgent",
        }),
        publicClient.readContract({
          address: CONTRACTS.ParentTreasury.address,
          abi: CONTRACTS.ParentTreasury.abi,
          functionName: "maxChildren",
        }),
        publicClient.readContract({
          address: CONTRACTS.ParentTreasury.address,
          abi: CONTRACTS.ParentTreasury.abi,
          functionName: "maxBudgetPerChild",
        }),
        publicClient.readContract({
          address: CONTRACTS.ParentTreasury.address,
          abi: CONTRACTS.ParentTreasury.abi,
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
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
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
