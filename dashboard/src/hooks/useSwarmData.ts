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

export interface BudgetState {
  policy: "normal" | "throttled" | "paused";
  reasons: string[];
  context?: string;
  parentEthBalanceWei?: string;
  parentEthBalance: string;
  warningEth: string;
  pauseEth: string;
  veniceCalls: number;
  veniceTokens: number;
  warningTokens: number;
  pauseTokens: number;
  activeChildren: number;
  filecoinAvailable: boolean;
  pauseProposalCreation: boolean;
  pauseScaling: boolean;
  pauseJudgeFlow: boolean;
  lastUpdatedAt?: string | null;
}

export interface SwarmMeta {
  filecoinStateCid: string | null;
  budgetState: BudgetState | null;
  delegationHashes: Map<string, string>;
  revokedDelegations: Set<string>;
  filecoinIdentityCids: Map<string, string>;
  erc8004Ids: Map<string, bigint>;
}

type RawSwarmResponse = {
  children?: any[];
  meta?: {
    filecoinStateCid?: string | null;
    budgetState?: BudgetState | null;
    delegationHashes?: Record<string, string>;
    revokedDelegations?: string[];
    filecoinIdentityCids?: Record<string, string>;
    erc8004Ids?: Record<string, string>;
  };
  error?: string;
};

type SwarmResponse = {
  children: ChildInfo[];
  meta: SwarmMeta;
};

const EMPTY_META: SwarmMeta = {
  filecoinStateCid: null,
  budgetState: null,
  delegationHashes: new Map(),
  revokedDelegations: new Set(),
  filecoinIdentityCids: new Map(),
  erc8004Ids: new Map(),
};

const CLIENT_CACHE_TTL = 12_000;
const POLL_INTERVAL_MS = 20_000;

const swarmCache = new Map<string, { data: SwarmResponse; fetchedAt: number }>();
const swarmRequests = new Map<string, Promise<SwarmResponse>>();

function normalizeChild(c: any): ChildInfo {
  return {
    ...c,
    id: BigInt(c.id),
    budget: BigInt(c.budget),
    maxGasPerVote: BigInt(c.maxGasPerVote),
    alignmentScore: BigInt(c.alignmentScore),
    voteCount: BigInt(c.voteCount),
    lastVoteTimestamp: BigInt(c.lastVoteTimestamp),
  };
}

function normalizeSwarmResponse(raw: RawSwarmResponse): SwarmResponse {
  return {
    children: Array.isArray(raw.children) ? raw.children.map(normalizeChild) : [],
    meta: {
      filecoinStateCid: raw.meta?.filecoinStateCid ?? null,
      budgetState: raw.meta?.budgetState ?? null,
      delegationHashes: new Map(Object.entries(raw.meta?.delegationHashes ?? {})),
      revokedDelegations: new Set(raw.meta?.revokedDelegations ?? []),
      filecoinIdentityCids: new Map(Object.entries(raw.meta?.filecoinIdentityCids ?? {})),
      erc8004Ids: new Map(
        Object.entries(raw.meta?.erc8004Ids ?? {}).map(([addr, id]) => [addr, BigInt(id)])
      ),
    },
  };
}

async function fetchSwarmPayload(force = false, includeMeta = true): Promise<SwarmResponse> {
  const cacheKey = includeMeta ? "full" : "lite";
  const now = Date.now();
  const cached = swarmCache.get(cacheKey);
  if (!force && cached && now - cached.fetchedAt < CLIENT_CACHE_TTL) {
    return cached.data;
  }

  const inflight = swarmRequests.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const res = await fetch(`/api/swarm?meta=${includeMeta ? "1" : "0"}`, { cache: "no-store" });
    const data: RawSwarmResponse = await res.json();
    if (!res.ok) throw new Error(data.error || `API ${res.status}`);
    if (data.error) throw new Error(data.error);

    const normalized = normalizeSwarmResponse(data);
    swarmCache.set(cacheKey, { data: normalized, fetchedAt: Date.now() });
    return normalized;
  })();
  swarmRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    swarmRequests.delete(cacheKey);
  }
}

export function useSwarmData(options?: { includeMeta?: boolean }) {
  const includeMeta = options?.includeMeta ?? true;
  const cacheKey = includeMeta ? "full" : "lite";
  const initial = swarmCache.get(cacheKey);
  const [children, setChildren] = useState<ChildInfo[]>(() => initial?.data.children ?? []);
  const [meta, setMeta] = useState<SwarmMeta>(() => initial?.data.meta ?? EMPTY_META);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);
  const [justVotedSet, setJustVotedSet] = useState<Set<string>>(new Set());
  const prevVoteCounts = useRef<Map<string, number>>(new Map());

  const fetchData = useCallback(async (options?: { force?: boolean; background?: boolean }) => {
    try {
      const shouldShowLoading =
        !options?.background &&
        !swarmCache.get(cacheKey) &&
        children.length === 0;
      if (shouldShowLoading) setLoading(true);

      const payload = await fetchSwarmPayload(options?.force, includeMeta);
      const enriched = payload.children;

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
      setMeta(payload.meta);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch swarm data");
    } finally {
      setLoading(false);
    }
  }, [cacheKey, children.length, includeMeta]);

  useEffect(() => {
    fetchData({ background: !!swarmCache.get(cacheKey) });
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchData({ force: true, background: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [cacheKey, fetchData]);

  return { children, meta, loading, error, refetch: fetchData, justVotedSet };
}

export function useSwarmMeta() {
  const cacheKey = "full";
  const initial = swarmCache.get(cacheKey);
  const [meta, setMeta] = useState<SwarmMeta>(() => initial?.data.meta ?? EMPTY_META);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);

  const fetchMeta = useCallback(async (options?: { force?: boolean; background?: boolean }) => {
    try {
      if (!options?.background && !swarmCache.get(cacheKey)) {
        setLoading(true);
      }
      const payload = await fetchSwarmPayload(options?.force, true);
      setMeta(payload.meta);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch swarm metadata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta({ background: !!swarmCache.get(cacheKey) });
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchMeta({ force: true, background: true });
    }, 45_000);
    return () => clearInterval(interval);
  }, [fetchMeta]);

  return { meta, loading, error, refetch: fetchMeta };
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
      } catch {}

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
