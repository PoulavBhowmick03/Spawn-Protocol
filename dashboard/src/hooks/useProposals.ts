"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useChainContext } from "@/context/ChainContext";
import { CONTRACTS, GOVERNORS } from "@/lib/contracts";
import { SpawnFactoryABI, ChildGovernorABI } from "@/lib/abis";

export interface ProposalVoter {
  childLabel: string;
  childAddr: `0x${string}`;
  support: number; // 0=Against, 1=For, 2=Abstain
}

export interface Proposal {
  id: bigint;
  description: string;
  startTime: bigint;
  endTime: bigint;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  executed: boolean;
  state: number;
  // Multi-DAO fields
  daoName: string;
  daoSlug: string;
  governorAddress: `0x${string}`;
  daoColor: string;
  daoBorderColor: string;
  // Source DAO (parsed from description prefix like "[Arbitrum Core — Real Governance via Tally]")
  sourceDaoName: string | null;
  tallySource: boolean;
  // Which children voted on this proposal
  voters: ProposalVoter[];
  // Unique key across DAOs
  uid: string;
}

interface RawProposal {
  id: bigint;
  description: string;
  startTime: bigint;
  endTime: bigint;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  executed: boolean;
}

export function useProposals() {
  const { client } = useChainContext();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track last known proposal count per governor to only fetch new ones
  const prevCounts = useRef<Map<string, number>>(new Map());
  const cachedProposals = useRef<Proposal[]>([]);

  const fetchData = useCallback(async () => {
    const contracts = CONTRACTS;
    const governors = GOVERNORS;
    try {
      // Step 1: Get proposal counts from all governors (3 calls, multicall-batched)
      const counts = await Promise.all(
        governors.map(async (gov) => {
          try {
            const count = await client.readContract({
              address: gov.address,
              abi: gov.abi,
              functionName: "proposalCount",
            });
            return { gov, count: Number(count) };
          } catch {
            return { gov, count: 0 };
          }
        })
      );

      // Step 2: Only fetch proposals we haven't seen yet
      const newProposals: Proposal[] = [];
      const staleIds: { gov: typeof governors[number]; id: bigint }[] = [];

      await Promise.all(
        counts.map(async ({ gov, count }) => {
          if (count === 0) return;
          const prevCount = prevCounts.current.get(gov.address) ?? 0;

          // Fetch only new proposals (id > prevCount)
          const startId = prevCount + 1;
          if (startId > count) {
            // No new proposals — but refresh state of active ones (state can change)
            for (const p of cachedProposals.current) {
              if (p.governorAddress === gov.address && p.state === 1) {
                staleIds.push({ gov, id: p.id });
              }
            }
            return;
          }

          const ids = Array.from({ length: count - prevCount }, (_, i) => BigInt(startId + i));

          const results = await Promise.all(
            ids.map(async (id) => {
              const [rawProposal, state] = await Promise.all([
                client.readContract({
                  address: gov.address,
                  abi: gov.abi,
                  functionName: "getProposal",
                  args: [id],
                }) as Promise<RawProposal>,
                client.readContract({
                  address: gov.address,
                  abi: gov.abi,
                  functionName: "state",
                  args: [id],
                }),
              ]);

              const desc = rawProposal.description || "";
              const tallyMatch = desc.match(/\[(.+?)\s*[—–-]\s*Real Governance via Tally\]/);
              const sourceDaoName = tallyMatch ? tallyMatch[1] : null;

              return {
                id: rawProposal.id,
                description: desc,
                startTime: rawProposal.startTime,
                endTime: rawProposal.endTime,
                forVotes: rawProposal.forVotes,
                againstVotes: rawProposal.againstVotes,
                abstainVotes: rawProposal.abstainVotes,
                executed: rawProposal.executed,
                state: Number(state),
                daoName: gov.name,
                daoSlug: gov.slug,
                governorAddress: gov.address,
                daoColor: gov.color,
                daoBorderColor: gov.borderColor,
                sourceDaoName,
                tallySource: !!tallyMatch,
                voters: [],
                uid: `${gov.slug}-${rawProposal.id.toString()}`,
              } satisfies Proposal;
            })
          );

          newProposals.push(...results);
          prevCounts.current.set(gov.address, count);
        })
      );

      // Step 3: Refresh state of previously-active proposals (cheap — just state() calls)
      if (staleIds.length > 0) {
        const stateUpdates = await Promise.all(
          staleIds.map(async ({ gov, id }) => {
            try {
              const state = await client.readContract({
                address: gov.address,
                abi: gov.abi,
                functionName: "state",
                args: [id],
              });
              return { govAddr: gov.address, id, state: Number(state) };
            } catch {
              return null;
            }
          })
        );
        for (const update of stateUpdates) {
          if (!update) continue;
          const existing = cachedProposals.current.find(
            (p) => p.governorAddress === update.govAddr && p.id === update.id
          );
          if (existing) existing.state = update.state;
        }
      }

      // Step 4: Merge cached + new proposals
      const allProposals = [...cachedProposals.current, ...newProposals];

      // Step 5: Fetch child vote histories (only on first load or when new proposals exist)
      if (cachedProposals.current.length === 0 || newProposals.length > 0) {
        try {
          const rawChildren = await client.readContract({
            address: contracts.SpawnFactory.address,
            abi: SpawnFactoryABI,
            functionName: "getActiveChildren",
          });

          const proposalMap = new Map<string, Proposal>();
          for (const p of allProposals) {
            p.voters = []; // reset voters before re-aggregating
            proposalMap.set(`${p.governorAddress.toLowerCase()}-${p.id.toString()}`, p);
          }

          const childHistories = await Promise.all(
            rawChildren.map(async (child) => {
              try {
                const history = await client.readContract({
                  address: child.childAddr,
                  abi: ChildGovernorABI,
                  functionName: "getVotingHistory",
                });
                return { child, history };
              } catch {
                return { child, history: [] as any[] };
              }
            })
          );

          for (const { child, history } of childHistories) {
            const govAddr = child.governance.toLowerCase();
            for (const vote of history) {
              const matching = proposalMap.get(`${govAddr}-${vote.proposalId.toString()}`);
              if (matching) {
                if (vote.support === 1) matching.forVotes += BigInt(1);
                else if (vote.support === 0) matching.againstVotes += BigInt(1);
                else matching.abstainVotes += BigInt(1);
                matching.voters.push({
                  childLabel: child.ensLabel || "unknown",
                  childAddr: child.childAddr,
                  support: vote.support,
                });
              }
            }
          }
        } catch {}
      }

      // Sort: newest first by startTime
      allProposals.sort((a, b) => {
        if (b.startTime > a.startTime) return 1;
        if (b.startTime < a.startTime) return -1;
        return 0;
      });

      cachedProposals.current = allProposals;
      setProposals(allProposals);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch proposals");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    setLoading(true);
    setProposals([]);
    prevCounts.current.clear();
    cachedProposals.current = [];
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { proposals, loading, error, refetch: fetchData };
}
