"use client";

import { useState, useEffect, useCallback } from "react";
import { useChainContext } from "@/context/ChainContext";
import { CONTRACTS, CELO_CONTRACTS, GOVERNORS, CELO_GOVERNORS } from "@/lib/contracts";
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
  const { client, chainId } = useChainContext();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const contracts = chainId === "celo" ? CELO_CONTRACTS : CONTRACTS;
    const governors = chainId === "celo" ? CELO_GOVERNORS : GOVERNORS;
    try {
      const allProposals: Proposal[] = [];

      await Promise.all(
        governors.map(async (gov) => {
          try {
            const count = await client.readContract({
              address: gov.address,
              abi: gov.abi,
              functionName: "proposalCount",
            });

            const total = Number(count);
            if (total === 0) return;

            const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));

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

                // Parse source DAO from description — tag like "[Arbitrum Core — Real Governance via Tally]"
                // can appear anywhere in the text
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

            allProposals.push(...results);
          } catch {
            // If a governor is not deployed / unreachable, skip it gracefully
          }
        })
      );

      // Aggregate votes from ChildGovernor contracts (since children
      // record votes locally, not on MockGovernor)
      try {
        const rawChildren = await client.readContract({
          address: contracts.SpawnFactory.address,
          abi: SpawnFactoryABI,
          functionName: "getActiveChildren",
        });

        for (const child of rawChildren) {
          try {
            const history = await client.readContract({
              address: child.childAddr,
              abi: ChildGovernorABI,
              functionName: "getVotingHistory",
            });

            for (const vote of history) {
              // Find matching proposal across all governors
              const govAddr = child.governance.toLowerCase();
              const matching = allProposals.find(
                (p) =>
                  p.governorAddress.toLowerCase() === govAddr &&
                  p.id === vote.proposalId
              );
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
          } catch {}
        }
      } catch {}

      // Sort: newest first by startTime
      allProposals.sort((a, b) => {
        if (b.startTime > a.startTime) return 1;
        if (b.startTime < a.startTime) return -1;
        return 0;
      });

      setProposals(allProposals);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch proposals");
    } finally {
      setLoading(false);
    }
  }, [client, chainId]);

  useEffect(() => {
    setLoading(true);
    setProposals([]);
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { proposals, loading, error, refetch: fetchData };
}
