"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useChainContext } from "@/context/ChainContext";
import { CONTRACTS } from "@/lib/contracts";
import { ChildGovernorABI } from "@/lib/abis";
import type { Address } from "viem";

export interface ChildInfo {
  id: bigint;
  childAddr: Address;
  governance: Address;
  budget: bigint;
  maxGasPerVote: bigint;
  ensLabel: string;
  active: boolean;
  alignmentScore: bigint;
  voteCount: bigint;
  lastVoteTimestamp: bigint;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
}

export function useSwarmData() {
  const { client } = useChainContext();
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justVotedSet, setJustVotedSet] = useState<Set<string>>(new Set());
  const prevVoteCounts = useRef<Map<string, number>>(new Map());

  const fetchData = useCallback(async () => {
    const contracts = CONTRACTS;
    try {
      // Step 1: Get active children via getActiveChildren() — single RPC call
      const activeRaw = (await client.readContract({
        address: contracts.SpawnFactory.address,
        abi: contracts.SpawnFactory.abi,
        functionName: "getActiveChildren",
      })) as any[];

      // Step 2: Enrich ONLY active children with alignment/vote data (9 agents × 3 calls = 27 calls)
      const activeEnriched: ChildInfo[] = await Promise.all(
        activeRaw.map(async (child) => {
          let alignmentScore = BigInt(0);
          let voteCount = BigInt(0);
          let lastVoteTimestamp = BigInt(0);
          let forVotes = 0, againstVotes = 0, abstainVotes = 0;
          try {
            const [score, cnt, history] = await Promise.all([
              client.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "alignmentScore" }),
              client.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "getVoteCount" }),
              client.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "getVotingHistory" }),
            ]);
            alignmentScore = score;
            voteCount = cnt;
            if (history.length > 0) lastVoteTimestamp = history[history.length - 1].timestamp;
            for (const v of history) {
              if (v.support === 1) forVotes++;
              else if (v.support === 0) againstVotes++;
              else abstainVotes++;
            }
          } catch {}
          return { id: child.id, childAddr: child.childAddr, governance: child.governance, budget: child.budget, maxGasPerVote: child.maxGasPerVote, ensLabel: child.ensLabel, active: true, alignmentScore, voteCount, lastVoteTimestamp, forVotes, againstVotes, abstainVotes };
        })
      );

      // Step 3: Fetch recent terminated children (last 40 by ID, lightweight — no enrichment needed for most)
      const totalCount = Number(await client.readContract({
        address: contracts.SpawnFactory.address,
        abi: contracts.SpawnFactory.abi,
        functionName: "childCount",
      }));

      const activeIds = new Set(activeRaw.map((c: any) => Number(c.id)));
      const terminatedStart = Math.max(1, totalCount - 60); // only check last 60
      const terminatedBatch: ChildInfo[] = [];

      // Fetch all terminated children in parallel (single batch)
      const allTerminatedIds: number[] = [];
      for (let i = terminatedStart; i <= totalCount; i++) {
        if (!activeIds.has(i)) allTerminatedIds.push(i);
      }

      const rawTerminated = await Promise.all(
        allTerminatedIds.map((childId) =>
          client.readContract({
            address: contracts.SpawnFactory.address,
            abi: contracts.SpawnFactory.abi,
            functionName: "getChild",
            args: [BigInt(childId)],
          }).catch(() => null)
        )
      );

      // Enrich all terminated children in parallel
      const enrichedTerminated = await Promise.all(
        rawTerminated.filter((child): child is NonNullable<typeof child> => !!child && !activeIds.has(Number(child.id))).map(async (child) => {
          let alignmentScore = BigInt(0);
          let voteCount = BigInt(0);
          try {
            const [score, cnt] = await Promise.all([
              client.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "alignmentScore" }),
              client.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "getVoteCount" }),
            ]);
            alignmentScore = score;
            voteCount = cnt;
          } catch {}
          return { id: child.id, childAddr: child.childAddr, governance: child.governance, budget: child.budget, maxGasPerVote: child.maxGasPerVote, ensLabel: child.ensLabel, active: child.active, alignmentScore, voteCount, lastVoteTimestamp: BigInt(0), forVotes: 0, againstVotes: 0, abstainVotes: 0 } as ChildInfo;
        })
      );
      terminatedBatch.push(...enrichedTerminated);

      const enriched = [...activeEnriched, ...terminatedBatch];

      // Detect which children just had their vote count increase
      const newlyVoted = new Set<string>();
      for (const child of enriched) {
        const addr = child.childAddr as string;
        const prev = prevVoteCounts.current.get(addr);
        const curr = Number(child.voteCount);
        if (prev !== undefined && curr > prev) {
          newlyVoted.add(addr);
        }
        prevVoteCounts.current.set(addr, curr);
      }

      if (newlyVoted.size > 0) {
        setJustVotedSet(newlyVoted);
        setTimeout(() => {
          setJustVotedSet((prev) => {
            const next = new Set(prev);
            for (const addr of newlyVoted) next.delete(addr);
            return next;
          });
        }, 3000);
      }

      setChildren(enriched);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch swarm data");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    setLoading(true);
    setChildren([]);
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { children, loading, error, refetch: fetchData, justVotedSet };
}

export function useChildData(childId: string) {
  const { client } = useChainContext();
  const [child, setChild] = useState<ChildInfo | null>(null);
  const [voteHistory, setVoteHistory] = useState<Array<{
    proposalId: bigint;
    support: number;
    encryptedRationale: `0x${string}`;
    decryptedRationale: `0x${string}`;
    timestamp: bigint;
    revealed: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const contracts = CONTRACTS;
    try {
      const rawChild = await client.readContract({
        address: contracts.SpawnFactory.address,
        abi: contracts.SpawnFactory.abi,
        functionName: "getChild",
        args: [BigInt(childId)],
      });

      let alignmentScore = BigInt(0);
      let voteCount = BigInt(0);
      let history: typeof voteHistory = [];

      try {
        const [score, count, raw] = await Promise.all([
          client.readContract({
            address: rawChild.childAddr,
            abi: ChildGovernorABI,
            functionName: "alignmentScore",
          }),
          client.readContract({
            address: rawChild.childAddr,
            abi: ChildGovernorABI,
            functionName: "getVoteCount",
          }),
          client.readContract({
            address: rawChild.childAddr,
            abi: ChildGovernorABI,
            functionName: "getVotingHistory",
          }),
        ]);
        alignmentScore = score;
        voteCount = count;
        history = raw.map((v) => ({
          proposalId: v.proposalId,
          support: v.support,
          encryptedRationale: v.encryptedRationale,
          decryptedRationale: v.decryptedRationale,
          timestamp: v.timestamp,
          revealed: v.revealed,
        }));
      } catch {
        // ignore
      }

      const lastVoteTimestamp =
        history.length > 0 ? history[history.length - 1].timestamp : BigInt(0);

      let forVotes = 0, againstVotes = 0, abstainVotes = 0;
      for (const v of history) {
        if (v.support === 1) forVotes++;
        else if (v.support === 0) againstVotes++;
        else abstainVotes++;
      }

      setChild({
        id: rawChild.id,
        childAddr: rawChild.childAddr,
        governance: rawChild.governance,
        budget: rawChild.budget,
        maxGasPerVote: rawChild.maxGasPerVote,
        ensLabel: rawChild.ensLabel,
        active: rawChild.active,
        alignmentScore,
        voteCount,
        lastVoteTimestamp,
        forVotes,
        againstVotes,
        abstainVotes,
      });
      setVoteHistory(history);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch child data");
    } finally {
      setLoading(false);
    }
  }, [childId, client]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { child, voteHistory, loading, error };
}
