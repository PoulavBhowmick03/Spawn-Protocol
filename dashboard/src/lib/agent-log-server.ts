import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { serverClient, getCached, setCache } from "@/lib/server-client";
import { fetchStorageObject } from "@/lib/storage-server";

const DATA_CACHE_KEY = "agent-log-data:v2";
const DATA_CACHE_TTL = 10_000;
const GITHUB_DATA_CACHE_KEY = "agent-log-data:github:v1";
const GITHUB_DATA_CACHE_TTL = 300_000;

const GITHUB_LOG_BRANCH = process.env.GITHUB_LOG_BRANCH || "pl_genesis";
const GITHUB_URLS = [
  `https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/${GITHUB_LOG_BRANCH}/agent_log.json`,
  `https://cdn.jsdelivr.net/gh/PoulavBhowmick03/Spawn-Protocol@${GITHUB_LOG_BRANCH}/agent_log.json`,
];
const KNOWN_CID = "QmRKSPkg7MQuChCXkgRPqmsAhLG4Y7xf7nUo6N3AXr9wFx";
const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D";
const LOCAL_LOG_PATH = join(process.cwd(), "..", "agent_log.json");
const PREFER_PUBLISHED_LOGS = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

export interface AgentLogEntry {
  action?: string;
  timestamp?: string;
  agentId?: string;
  txHash?: string | null;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  [key: string]: any;
}

export interface VoteStats {
  voteCount: number;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  lastVoteTimestamp: string | null;
}

export interface AlignmentStats {
  score: number;
  timestamp: string;
  txHash: string | null;
}

export interface ProposalVoterSummary {
  childLabel: string;
  support: number;
  txHash: string | null;
  timestamp: string | null;
}

function readLocalAgentLogData() {
  if (!existsSync(LOCAL_LOG_PATH)) return null;

  try {
    return JSON.parse(readFileSync(LOCAL_LOG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

async function tryStorageCid(cid: string): Promise<any | null> {
  try {
    const payload = await fetchStorageObject(cid);
    return payload?.data ?? null;
  } catch {
    return null;
  }
}

async function readEnsAgentLogCid(): Promise<string> {
  try {
    const value = await serverClient.readContract({
      address: ENS_REGISTRY as `0x${string}`,
      abi: [
        {
          type: "function",
          name: "getTextRecord",
          inputs: [
            { name: "label", type: "string" },
            { name: "key", type: "string" },
          ],
          outputs: [{ name: "", type: "string" }],
          stateMutability: "view",
        },
      ] as const,
      functionName: "getTextRecord",
      args: ["parent", "ipfs.agent_log"],
    });

    return (value as string) || "";
  } catch {
    return "";
  }
}

export async function readGitHubAgentLogData(): Promise<any | null> {
  const cached = getCached<any>(GITHUB_DATA_CACHE_KEY);
  if (cached) return cached;

  for (const url of GITHUB_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      setCache(GITHUB_DATA_CACHE_KEY, data, GITHUB_DATA_CACHE_TTL);
      return data;
    } catch {}
  }

  return null;
}

export async function readAgentLogData(): Promise<any> {
  const cached = getCached<any>(DATA_CACHE_KEY);
  if (cached) return cached;

  const localData = readLocalAgentLogData();
  if (localData && !PREFER_PUBLISHED_LOGS) {
    setCache(DATA_CACHE_KEY, localData, DATA_CACHE_TTL);
    return localData;
  }

  const cid = await readEnsAgentLogCid();
  if (cid) {
    const data = await tryStorageCid(cid);
    if (data) {
      setCache(DATA_CACHE_KEY, data, DATA_CACHE_TTL);
      return data;
    }
  }

  const knownCidData = await tryStorageCid(KNOWN_CID);
  if (knownCidData) {
    setCache(DATA_CACHE_KEY, knownCidData, DATA_CACHE_TTL);
    return knownCidData;
  }

  if (localData) {
    setCache(DATA_CACHE_KEY, localData, DATA_CACHE_TTL);
    return localData;
  }

  const data = await readGitHubAgentLogData();
  if (!data) {
    throw new Error("Failed to read agent logs from published sources");
  }
  setCache(DATA_CACHE_KEY, data, DATA_CACHE_TTL);
  return data;
}

export async function readAgentLogEntries(): Promise<AgentLogEntry[]> {
  const data = await readAgentLogData();
  return Array.isArray(data?.entries) ? data.entries : [];
}

export function getChildLabelFromAgentId(agentId: string | undefined | null): string | null {
  if (!agentId) return null;
  if (agentId.startsWith("child:")) return agentId.slice(6);
  return null;
}

export function getBaseLabel(label: string) {
  return label.replace(/-v\d+$/, "");
}

export function getDaoSlugFromChildLabel(label: string): string | null {
  const normalized = getBaseLabel(label).toLowerCase();
  if (normalized.startsWith("judge-proof-")) return null;
  if (normalized.startsWith("polymarket-")) return "polymarket";

  const parts = normalized.split("-");
  if (parts.length >= 2 && parts[1] === "dao") {
    return `${parts[0]}-${parts[1]}`;
  }

  return parts[0] || null;
}

export function decisionToSupport(decision: unknown): number {
  if (typeof decision === "number") return decision;
  const normalized = String(decision || "").toUpperCase();
  if (normalized === "FOR") return 1;
  if (normalized === "ABSTAIN") return 2;
  return 0;
}

export function isoToUnixSeconds(iso: string | null | undefined): string {
  if (!iso) return "0";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? String(Math.floor(ms / 1000)) : "0";
}

export function buildVoteSummaries(entries: AgentLogEntry[]) {
  const byChild = new Map<string, VoteStats>();
  const byProposal = new Map<string, Map<string, ProposalVoterSummary>>();

  for (const entry of entries) {
    if (entry.action !== "cast_vote" && entry.action !== "judge_vote_cast") continue;

    const label = getChildLabelFromAgentId(entry.agentId);
    if (!label || label.startsWith("judge-proof-")) continue;

    const lowerLabel = label.toLowerCase();
    const childStats = byChild.get(lowerLabel) || {
      voteCount: 0,
      forVotes: 0,
      againstVotes: 0,
      abstainVotes: 0,
      lastVoteTimestamp: null,
    };

    const support = decisionToSupport(entry.inputs?.decision ?? entry.inputs?.support);
    childStats.voteCount += 1;
    if (support === 1) childStats.forVotes += 1;
    else if (support === 0) childStats.againstVotes += 1;
    else childStats.abstainVotes += 1;
    childStats.lastVoteTimestamp = entry.timestamp || childStats.lastVoteTimestamp;
    byChild.set(lowerLabel, childStats);

    const proposalId = entry.inputs?.proposalId;
    const daoSlug = getDaoSlugFromChildLabel(label);
    if (!daoSlug || proposalId === undefined || proposalId === null) continue;

    const proposalKey = `${daoSlug}-${String(proposalId)}`;
    const voters = byProposal.get(proposalKey) || new Map<string, ProposalVoterSummary>();
    voters.set(lowerLabel, {
      childLabel: label,
      support,
      txHash: entry.txHash || entry.outputs?.txHash || null,
      timestamp: entry.timestamp || null,
    });
    byProposal.set(proposalKey, voters);
  }

  return {
    byChild,
    byProposal: new Map(
      Array.from(byProposal.entries()).map(([key, value]) => [key, Array.from(value.values())])
    ),
  };
}

export function buildAlignmentSummaries(entries: AgentLogEntry[]) {
  const byChild = new Map<string, AlignmentStats>();

  for (const entry of entries) {
    if (entry.action !== "evaluate_alignment") continue;

    const child = String(entry.inputs?.child || "").toLowerCase();
    if (!child) continue;

    const score = Number(entry.outputs?.score ?? entry.inputs?.score ?? entry.outputs?.newScore ?? 0);
    byChild.set(child, {
      score: Number.isFinite(score) ? score : 0,
      timestamp: entry.timestamp || new Date(0).toISOString(),
      txHash: entry.txHash || entry.outputs?.txHash || null,
    });
  }

  return byChild;
}
