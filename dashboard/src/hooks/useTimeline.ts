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


// Contracts deployed at block 39086990 on Base Sepolia (from broadcast/DeployMultiDAO.s.sol)
const DEPLOY_BLOCK = BigInt(39086990);
const CHUNK = BigInt(50000); // publicnode max

export function useTimeline() {
  const { client } = useChainContext();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Persist state across polls to avoid re-fetching history
  const blockTimestampCache = useRef<Map<bigint, bigint>>(new Map());
  const eventCache = useRef<Map<string, TimelineEvent>>(new Map());
  const lastFetchedBlock = useRef<bigint | null>(null);
  // Track all child addresses ever seen so polling can fetch their new events too
  const knownChildAddresses = useRef<Set<`0x${string}`>>(new Set());

  // Fetch logs for a block range, splitting into CHUNK-sized parallel requests
  const getLogsInRange = useCallback(async (
    params: Omit<Parameters<typeof client.getLogs>[0], "fromBlock" | "toBlock">,
    from: bigint,
    to: bigint,
  ): Promise<any[]> => {
    const chunks: Array<[bigint, bigint]> = [];
    let start = from;
    while (start <= to) {
      const end = start + CHUNK - BigInt(1) < to ? start + CHUNK - BigInt(1) : to;
      chunks.push([start, end]);
      start = end + BigInt(1);
    }
    const results = await Promise.all(
      chunks.map(([f, t]) => client.getLogs({ ...params, fromBlock: f, toBlock: t }))
    );
    return results.flat();
  }, [client]);

  const fetchData = useCallback(async () => {
    const contracts = CONTRACTS;
    try {
      const currentBlock = await client.getBlockNumber();
      const isInitial = lastFetchedBlock.current === null;
      const fromBlock = isInitial ? DEPLOY_BLOCK : lastFetchedBlock.current! + BigInt(1);

      // Nothing new to fetch on subsequent polls
      if (!isInitial && fromBlock > currentBlock) return;

      // Fetch factory + treasury events for the relevant range
      const [spawnedLogs, terminatedLogs, reallocatedLogs, valuesLogs, depositLogs] =
        await Promise.all([
          getLogsInRange({
            address: contracts.SpawnFactory.address,
            event: { type: "event", name: "ChildSpawned", inputs: [
              { name: "childId", type: "uint256", indexed: true },
              { name: "childAddr", type: "address", indexed: false },
              { name: "governance", type: "address", indexed: false },
              { name: "budget", type: "uint256", indexed: false },
            ]},
          }, fromBlock, currentBlock),
          getLogsInRange({
            address: contracts.SpawnFactory.address,
            event: { type: "event", name: "ChildTerminated", inputs: [
              { name: "childId", type: "uint256", indexed: true },
              { name: "childAddr", type: "address", indexed: false },
              { name: "fundsReturned", type: "uint256", indexed: false },
            ]},
          }, fromBlock, currentBlock),
          getLogsInRange({
            address: contracts.SpawnFactory.address,
            event: { type: "event", name: "FundsReallocated", inputs: [
              { name: "fromId", type: "uint256", indexed: true },
              { name: "toId", type: "uint256", indexed: true },
              { name: "amount", type: "uint256", indexed: false },
            ]},
          }, fromBlock, currentBlock),
          getLogsInRange({
            address: contracts.ParentTreasury.address,
            event: { type: "event", name: "ValuesUpdated", inputs: [
              { name: "values", type: "string", indexed: false },
            ]},
          }, fromBlock, currentBlock),
          getLogsInRange({
            address: contracts.ParentTreasury.address,
            event: { type: "event", name: "Deposited", inputs: [
              { name: "from", type: "address", indexed: true },
              { name: "amount", type: "uint256", indexed: false },
            ]},
          }, fromBlock, currentBlock),
        ]);

      // Register any newly discovered child addresses
      for (const log of spawnedLogs as any[]) {
        const addr = log.args?.childAddr as `0x${string}` | undefined;
        if (addr) knownChildAddresses.current.add(addr);
      }

      // For child events: no address filter (address arrays cause 413 on public RPC).
      // On initial load scan only the last 50k blocks (one chunk). On subsequent polls
      // scan only new blocks. Filter results to known child addresses in JS.
      const knownSet = new Set([...knownChildAddresses.current].map((a) => a.toLowerCase()));
      const childFrom = isInitial
        ? (currentBlock > CHUNK ? currentBlock - CHUNK + BigInt(1) : DEPLOY_BLOCK)
        : fromBlock;

      const [allVoteLogs, allAlignmentLogs] = await Promise.all([
        getLogsInRange({
          event: { type: "event", name: "VoteCast", inputs: [
            { name: "proposalId", type: "uint256", indexed: true },
            { name: "support", type: "uint8", indexed: false },
            { name: "encryptedRationale", type: "bytes", indexed: false },
          ]},
        }, childFrom, currentBlock).catch(() => [] as any[]),
        getLogsInRange({
          event: { type: "event", name: "AlignmentUpdated", inputs: [
            { name: "newScore", type: "uint256", indexed: false },
          ]},
        }, childFrom, currentBlock).catch(() => [] as any[]),
      ]);
      const voteCastLogs = (allVoteLogs as any[]).filter((log) => knownSet.has((log.address as string)?.toLowerCase()));
      const alignmentLogs = (allAlignmentLogs as any[]).filter((log) => knownSet.has((log.address as string)?.toLowerCase()));

      // Build new events and merge into cache (deduplicates by id)
      const newEvents: TimelineEvent[] = [
        ...spawnedLogs.map((log) => ({
          id: `spawned-${log.transactionHash}-${log.logIndex}`,
          type: "ChildSpawned" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: { childId: (log.args as any)?.childId?.toString(), childAddr: (log.args as any)?.childAddr, governance: (log.args as any)?.governance, budget: (log.args as any)?.budget?.toString() },
        })),
        ...terminatedLogs.map((log) => ({
          id: `terminated-${log.transactionHash}-${log.logIndex}`,
          type: "ChildTerminated" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: { childId: (log.args as any)?.childId?.toString(), childAddr: (log.args as any)?.childAddr, fundsReturned: (log.args as any)?.fundsReturned?.toString() },
        })),
        ...reallocatedLogs.map((log) => ({
          id: `reallocated-${log.transactionHash}-${log.logIndex}`,
          type: "FundsReallocated" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: { fromId: (log.args as any)?.fromId?.toString(), toId: (log.args as any)?.toId?.toString(), amount: (log.args as any)?.amount?.toString() },
        })),
        ...valuesLogs.map((log) => ({
          id: `values-${log.transactionHash}-${log.logIndex}`,
          type: "ValuesUpdated" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: { values: (log.args as any)?.values },
        })),
        ...depositLogs.map((log) => ({
          id: `deposit-${log.transactionHash}-${log.logIndex}`,
          type: "Deposited" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: { from: (log.args as any)?.from, amount: (log.args as any)?.amount?.toString() },
        })),
        ...voteCastLogs.map((log: any) => ({
          id: `vote-${log.transactionHash}-${log.logIndex}`,
          type: "VoteCast" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: { childAddr: log.address, proposalId: log.args?.proposalId?.toString(), support: Number(log.args?.support ?? 0) },
        })),
        ...alignmentLogs.map((log: any) => ({
          id: `alignment-${log.transactionHash}-${log.logIndex}`,
          type: "AlignmentUpdated" as EventType,
          blockNumber: log.blockNumber ?? BigInt(0),
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
          data: { childAddr: log.address, newScore: log.args?.newScore?.toString() },
        })),
      ];

      for (const e of newEvents) eventCache.current.set(e.id, e);
      lastFetchedBlock.current = currentBlock;

      // Fetch timestamps only for uncached blocks — prioritise the most recent (visible) ones
      const allCached = [...eventCache.current.values()];
      const sortedByBlock = [...allCached].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      const uncachedBlocks = [...new Set(sortedByBlock.map((e) => e.blockNumber))]
        .filter((bn) => !blockTimestampCache.current.has(bn))
        .slice(0, 20);

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

      for (const event of allCached) {
        event.timestamp = blockTimestampCache.current.get(event.blockNumber);
      }

      const sorted = [...allCached].sort((a, b) =>
        b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0
      );

      setEvents(sorted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timeline");
    } finally {
      setLoading(false);
    }
  }, [client, getLogsInRange]);

  useEffect(() => {
    setLoading(true);
    eventCache.current.clear();
    lastFetchedBlock.current = null;
    knownChildAddresses.current.clear();
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
