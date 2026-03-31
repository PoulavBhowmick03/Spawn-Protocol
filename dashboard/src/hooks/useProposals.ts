"use client";

import { useState, useEffect, useCallback } from "react";

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
  daoName: string;
  daoSlug: string;
  governorAddress: `0x${string}`;
  daoColor: string;
  daoBorderColor: string;
  sourceDaoName: string | null;
  tallySource: boolean;
  voters: ProposalVoter[];
  uid: string;
}

export function useProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/proposals");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Convert string bigints back to bigint
      const parsed: Proposal[] = data.map((p: any) => ({
        ...p,
        id: BigInt(p.id),
        startTime: BigInt(p.startTime),
        endTime: BigInt(p.endTime),
        forVotes: BigInt(p.forVotes),
        againstVotes: BigInt(p.againstVotes),
        abstainVotes: BigInt(p.abstainVotes),
      }));

      setProposals(parsed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch proposals");
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

  return { proposals, loading, error, refetch: fetchData };
}
