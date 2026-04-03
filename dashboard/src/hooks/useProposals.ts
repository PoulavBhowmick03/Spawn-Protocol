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

const CLIENT_CACHE_TTL = 20_000;
const POLL_INTERVAL_MS = 30_000;

let proposalsCache: { data: Proposal[]; fetchedAt: number } | null = null;
let proposalsRequest: Promise<Proposal[]> | null = null;

function normalizeProposals(data: any[]): Proposal[] {
  return data.map((p: any) => ({
    ...p,
    id: BigInt(p.id),
    startTime: BigInt(p.startTime),
    endTime: BigInt(p.endTime),
    forVotes: BigInt(p.forVotes),
    againstVotes: BigInt(p.againstVotes),
    abstainVotes: BigInt(p.abstainVotes),
  }));
}

async function fetchProposals(force = false): Promise<Proposal[]> {
  const now = Date.now();
  if (!force && proposalsCache && now - proposalsCache.fetchedAt < CLIENT_CACHE_TTL) {
    return proposalsCache.data;
  }

  if (proposalsRequest) return proposalsRequest;

  proposalsRequest = (async () => {
    const res = await fetch("/api/proposals", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API ${res.status}`);
    if (data.error) throw new Error(data.error);

    const normalized = normalizeProposals(data);
    proposalsCache = { data: normalized, fetchedAt: Date.now() };
    return normalized;
  })();

  try {
    return await proposalsRequest;
  } finally {
    proposalsRequest = null;
  }
}

export function useProposals() {
  const [proposals, setProposals] = useState<Proposal[]>(() => proposalsCache?.data ?? []);
  const [loading, setLoading] = useState(() => !proposalsCache);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (options?: { force?: boolean; background?: boolean }) => {
    try {
      if (!options?.background && !proposalsCache && proposals.length === 0) {
        setLoading(true);
      }
      const parsed = await fetchProposals(options?.force);
      setProposals(parsed);
      setError(null);
    } catch (err) {
      // Keep the existing proposal list visible during transient background refresh failures.
      // The page should only show an error when it has no data to render.
      if (!options?.background && proposals.length === 0 && !proposalsCache) {
        setError(err instanceof Error ? err.message : "Failed to fetch proposals");
      } else {
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [proposals.length]);

  useEffect(() => {
    fetchData({ background: !!proposalsCache });
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchData({ force: true, background: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { proposals, loading, error, refetch: fetchData };
}
