"use client";

import { useState, useEffect, useCallback } from "react";
import { publicClient } from "@/lib/client";
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
}

export function useSwarmData() {
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const rawChildren = await publicClient.readContract({
        address: CONTRACTS.SpawnFactory.address,
        abi: CONTRACTS.SpawnFactory.abi,
        functionName: "getActiveChildren",
      });

      const enriched: ChildInfo[] = await Promise.all(
        rawChildren.map(async (child) => {
          let alignmentScore = BigInt(0);
          let voteCount = BigInt(0);
          let lastVoteTimestamp = BigInt(0);

          try {
            const [score, count, history] = await Promise.all([
              publicClient.readContract({
                address: child.childAddr,
                abi: ChildGovernorABI,
                functionName: "alignmentScore",
              }),
              publicClient.readContract({
                address: child.childAddr,
                abi: ChildGovernorABI,
                functionName: "getVoteCount",
              }),
              publicClient.readContract({
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

      setChildren(enriched);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch swarm data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { children, loading, error, refetch: fetchData };
}

export function useChildData(childId: string) {
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
    try {
      const rawChild = await publicClient.readContract({
        address: CONTRACTS.SpawnFactory.address,
        abi: CONTRACTS.SpawnFactory.abi,
        functionName: "getChild",
        args: [BigInt(childId)],
      });

      let alignmentScore = BigInt(0);
      let voteCount = BigInt(0);
      let history: typeof voteHistory = [];

      try {
        const [score, count, raw] = await Promise.all([
          publicClient.readContract({
            address: rawChild.childAddr,
            abi: ChildGovernorABI,
            functionName: "alignmentScore",
          }),
          publicClient.readContract({
            address: rawChild.childAddr,
            abi: ChildGovernorABI,
            functionName: "getVoteCount",
          }),
          publicClient.readContract({
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
  }, [childId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { child, voteHistory, loading, error };
}
