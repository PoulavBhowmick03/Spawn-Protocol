"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useChainContext } from "@/context/ChainContext";
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
  const { client } = useChainContext();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache block timestamps across polls
  const blockTimestampCache = useRef<Map<bigint, bigint>>(new Map());

  const fetchData = useCallback(async () => {
    const contracts = CONTRACTS;
    try {
      const currentBlock = await client.getBlockNumber();
      const startBlock = currentBlock > BigInt(9999) ? currentBlock - BigInt(9999) : BigInt(0);

      // Fetch ALL logs in parallel — single batch of getLogs calls
      // Reuse ChildSpawned results for both event list AND child address extraction
      const [
        spawnedLogs,
        terminatedLogs,
        reallocatedLogs,
        valuesLogs,
        depositLogs,
      ] = await Promise.all([
        client.getLogs({
          address: contracts.SpawnFactory.address,
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
          fromBlock: startBlock,
          toBlock: "latest",
        }),
        client.getLogs({
          address: contracts.SpawnFactory.address,
          event: {
            type: "event",
            name: "ChildTerminated",
            inputs: [
              { name: "childId", type: "uint256", indexed: true },
              { name: "childAddr", type: "address", indexed: false },
              { name: "fundsReturned", type: "uint256", indexed: false },
            ],
          },
          fromBlock: startBlock,
          toBlock: "latest",
        }),
        client.getLogs({
          address: contracts.SpawnFactory.address,
          event: {
            type: "event",
            name: "FundsReallocated",
            inputs: [
              { name: "fromId", type: "uint256", indexed: true },
              { name: "toId", type: "uint256", indexed: true },
              { name: "amount", type: "uint256", indexed: false },
            ],
          },
          fromBlock: startBlock,
          toBlock: "latest",
        }),
        client.getLogs({
          address: contracts.ParentTreasury.address,
          event: {
            type: "event",
            name: "ValuesUpdated",
            inputs: [{ name: "values", type: "string", indexed: false }],
          },
          fromBlock: startBlock,
          toBlock: "latest",
        }),
        client.getLogs({
          address: contracts.ParentTreasury.address,
          event: {
            type: "event",
            name: "Deposited",
            inputs: [
              { name: "from", type: "address", indexed: true },
              { name: "amount", type: "uint256", indexed: false },
            ],
          },
          fromBlock: startBlock,
          toBlock: "latest",
        }),
      ]);

      // Extract child addresses from the spawned logs we already fetched (no duplicate RPC)
      const childAddresses = [
        ...new Set(
          spawnedLogs
            .map((l) => (l.args as any)?.childAddr)
            .filter(Boolean) as `0x${string}`[]
        ),
      ];

      // Fetch VoteCast + AlignmentUpdated from all children in parallel
      const childLogResults = await Promise.all(
        childAddresses.map(async (addr) => {
          try {
            const [votes, aligns] = await Promise.all([
              client.getLogs({
                address: addr,
                event: {
                  type: "event",
                  name: "VoteCast",
                  inputs: [
                    { name: "proposalId", type: "uint256", indexed: true },
                    { name: "support", type: "uint8", indexed: false },
                    { name: "encryptedRationale", type: "bytes", indexed: false },
                  ],
                },
                fromBlock: startBlock,
                toBlock: "latest",
              }),
              client.getLogs({
                address: addr,
                event: {
                  type: "event",
                  name: "AlignmentUpdated",
                  inputs: [{ name: "newScore", type: "uint256", indexed: false }],
                },
                fromBlock: startBlock,
                toBlock: "latest",
              }),
            ]);
            return { votes: votes as any[], aligns: aligns as any[] };
          } catch {
            return { votes: [], aligns: [] };
          }
        })
      );
      const voteCastLogs = childLogResults.flatMap((r) => r.votes);
      const alignmentLogs = childLogResults.flatMap((r) => r.aligns);

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
        ...voteCastLogs.map((log: any) => ({
          id: `vote-${log.transactionHash}-${log.logIndex}`,
          type: "VoteCast" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: {
            childAddr: log.address,
            proposalId: log.args?.proposalId?.toString(),
            support: Number(log.args?.support ?? 0),
          },
        })),
        ...alignmentLogs.map((log: any) => ({
          id: `alignment-${log.transactionHash}-${log.logIndex}`,
          type: "AlignmentUpdated" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: {
            childAddr: log.address,
            newScore: log.args?.newScore?.toString(),
          },
        })),
      ];

      // Fetch timestamps only for blocks we haven't cached yet
      const uniqueBlocks = [...new Set(allEvents.map((e) => e.blockNumber))];
      const uncachedBlocks = uniqueBlocks.filter((bn) => !blockTimestampCache.current.has(bn)).slice(0, 20);

      if (uncachedBlocks.length > 0) {
        await Promise.all(
          uncachedBlocks.map(async (bn) => {
            try {
              const block = await client.getBlock({ blockNumber: bn });
              blockTimestampCache.current.set(bn, block.timestamp);
            } catch {}
          })
        );
      }

      // Attach timestamps from cache
      for (const event of allEvents) {
        event.timestamp = blockTimestampCache.current.get(event.blockNumber);
      }

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
  }, [client]);

  useEffect(() => {
    setLoading(true);
    setEvents([]);
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { events, loading, error };
}

export function useTreasuryData() {
  const { client } = useChainContext();
  const [governanceValues, setGovernanceValues] = useState<string>("");
  const [parentAgent, setParentAgent] = useState<Address | null>(null);
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
