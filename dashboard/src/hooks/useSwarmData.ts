"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useChainContext } from "@/context/ChainContext";
import { CONTRACTS, CELO_CONTRACTS } from "@/lib/contracts";
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
}

export function useSwarmData() {
  const { client, chainId } = useChainContext();
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justVotedSet, setJustVotedSet] = useState<Set<string>>(new Set());
  const prevVoteCounts = useRef<Map<string, number>>(new Map());

  const fetchData = useCallback(async () => {
    const contracts = chainId === "celo" ? CELO_CONTRACTS : CONTRACTS;
    try {
      const rawChildren = await client.readContract({
        address: contracts.SpawnFactory.address,
        abi: contracts.SpawnFactory.abi,
        functionName: "getActiveChildren",
      });

      const enriched: ChildInfo[] = await Promise.all(
        rawChildren.map(async (child) => {
          let alignmentScore = BigInt(0);
          let voteCount = BigInt(0);
          let lastVoteTimestamp = BigInt(0);

          try {
            const [score, count, history] = await Promise.all([
              client.readContract({
                address: child.childAddr,
                abi: ChildGovernorABI,
                functionName: "alignmentScore",
              }),
              client.readContract({
                address: child.childAddr,
                abi: ChildGovernorABI,
                functionName: "getVoteCount",
              }),
              client.readContract({
                address: child.childAddr,
                abi: ChildGovernorABI,
                functionName: "getVotingHistory",
              }),
            ]);
            alignmentScore = score;
            voteCount = count;
            if (history.length > 0) {
              lastVoteTimestamp = history[history.length - 1].timestamp;
            }
          } catch {
            // child contract not accessible, use defaults
          }

          return {
            id: child.id,
            childAddr: child.childAddr,
            governance: child.governance,
            budget: child.budget,
            maxGasPerVote: child.maxGasPerVote,
            ensLabel: child.ensLabel,
            active: child.active,
            alignmentScore,
            voteCount,
            lastVoteTimestamp,
          };
        })
      );

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
  }, [client, chainId]);

  useEffect(() => {
    setLoading(true);
    setChildren([]);
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { children, loading, error, refetch: fetchData, justVotedSet };
}

export function useChildData(childId: string) {
  const { client, chainId } = useChainContext();
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
    const contracts = chainId === "celo" ? CELO_CONTRACTS : CONTRACTS;
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
      });
      setVoteHistory(history);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch child data");
    } finally {
      setLoading(false);
    }
  }, [childId, client, chainId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { child, voteHistory, loading, error };
}
