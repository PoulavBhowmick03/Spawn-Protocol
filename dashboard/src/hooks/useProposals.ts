"use client";

import { useState, useEffect, useCallback } from "react";

export interface ProposalVoter {
  childLabel: string;
  childId: string | null;
  childAddr: `0x${string}`;
  support: number; // 0=Against, 1=For, 2=Abstain
  txHash?: string | null;
  timestamp?: string | null;
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
  sourceDaoId: string | null;
  sourceDaoSlug: string | null;
  sourceDaoName: string | null;
  sourceType: "tally" | "snapshot" | "boardroom" | "polymarket" | null;
  sourceRef: string | null;
  mirroredAt: string | null;
  tallySource: boolean;
  voters: ProposalVoter[];
  uid: string;
}

const CLIENT_CACHE_TTL = 20_000;
const POLL_INTERVAL_MS = 30_000;

const proposalsCache = new Map<string, { data: Proposal[]; fetchedAt: number }>();
const proposalsRequests = new Map<string, Promise<Proposal[]>>();

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

async function fetchProposals(force = false, daoSlug?: string): Promise<Proposal[]> {
  const normalizedDaoSlug = daoSlug?.trim().toLowerCase() || "";
  const cacheKey = normalizedDaoSlug || "all";
  const now = Date.now();
  const cached = proposalsCache.get(cacheKey);
  if (!force && cached && now - cached.fetchedAt < CLIENT_CACHE_TTL) {
    return cached.data;
  }

  const inflight = proposalsRequests.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const qs = normalizedDaoSlug
      ? `?daoSlug=${encodeURIComponent(normalizedDaoSlug)}`
      : "";
    const res = await fetch(`/api/proposals${qs}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API ${res.status}`);
    if (data.error) throw new Error(data.error);

    const normalized = normalizeProposals(data);
    proposalsCache.set(cacheKey, { data: normalized, fetchedAt: Date.now() });
    return normalized;
  })();
  proposalsRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    proposalsRequests.delete(cacheKey);
  }
}

export function useProposals(options?: { daoSlug?: string }) {
  const normalizedDaoSlug = options?.daoSlug?.trim().toLowerCase() || "";
  const cacheKey = normalizedDaoSlug || "all";
  const [proposals, setProposals] = useState<Proposal[]>(
    () => proposalsCache.get(cacheKey)?.data ?? []
  );
  const [loading, setLoading] = useState(() => !proposalsCache.get(cacheKey));
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (options?: { force?: boolean; background?: boolean }) => {
    try {
      if (!options?.background && !proposalsCache.get(cacheKey) && proposals.length === 0) {
        setLoading(true);
      }
      const parsed = await fetchProposals(options?.force, normalizedDaoSlug);
      setProposals(parsed);
      setError(null);
    } catch (err) {
      // Keep the existing proposal list visible during transient background refresh failures.
      // The page should only show an error when it has no data to render.
      if (!options?.background && proposals.length === 0 && !proposalsCache.get(cacheKey)) {
        setError(err instanceof Error ? err.message : "Failed to fetch proposals");
      } else {
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKey, normalizedDaoSlug, proposals.length]);

  useEffect(() => {
    fetchData({ background: !!proposalsCache.get(cacheKey) });
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchData({ force: true, background: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [cacheKey, fetchData]);

  return { proposals, loading, error, refetch: fetchData };
}
