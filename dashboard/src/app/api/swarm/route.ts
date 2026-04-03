import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { serverClient, getCached, setCache } from "@/lib/server-client";
import { CONTRACTS } from "@/lib/contracts";
import { ChildGovernorABI, SpawnFactoryABI } from "@/lib/abis";
import { fetchStorageObject } from "@/lib/storage-server";
import {
  buildAlignmentSummaries,
  buildVoteSummaries,
  getBaseLabel,
  isoToUnixSeconds,
  readAgentLogEntries,
} from "@/lib/agent-log-server";

const CACHE_TTL = 15_000;
const ERC8004_CACHE_TTL = 90_000;
const JUDGE_FLOW_PROXY_URL = process.env.JUDGE_FLOW_PROXY_URL?.replace(/\/$/, "");

const BUDGET_STATE_PATH = join(process.cwd(), "..", "runtime_budget_state.json");
const KNOWN_FILECOIN_STATE_CID =
  "bafkzcibewtrqqdvlybjzqok2q5dgbdiddltdhj5asyhfnavmvowvqpeuckuuraq4ce";

const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D" as const;
const ENS_REGISTRY_ABI = [
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
] as const;

const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
const ERC8004_DEPLOYER = "0x15896e731c51ecB7BdB1447600DF126ea1d6969A".toLowerCase();
const ERC8004_SCAN_START = 2200;
const ERC8004_SCAN_END = 3500;
const ERC8004_TOKEN_ABI = [
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

const EMPTY_BUDGET_STATE = {
  policy: "normal",
  reasons: [],
  context: "unavailable",
  parentEthBalanceWei: "0",
  parentEthBalance: "0.0000",
  warningEth: "0.0300",
  pauseEth: "0.0150",
  veniceCalls: 0,
  veniceTokens: 0,
  warningTokens: 0,
  pauseTokens: 0,
  activeChildren: 0,
  filecoinAvailable: false,
  pauseProposalCreation: false,
  pauseScaling: false,
  pauseJudgeFlow: false,
  lastUpdatedAt: null,
};

export const dynamic = "force-dynamic";

function normalizeBudgetState(raw: any, context: string) {
  return {
    ...EMPTY_BUDGET_STATE,
    ...raw,
    reasons: Array.isArray(raw?.reasons) ? raw.reasons : EMPTY_BUDGET_STATE.reasons,
    context,
  };
}

function budgetStateFromSnapshot(snapshot: any) {
  const runtimeBudget = snapshot?.runtimeBudget;
  if (!runtimeBudget || typeof runtimeBudget !== "object") return null;
  return normalizeBudgetState(runtimeBudget, "filecoin.state");
}

async function readEnsTextRecord(label: string, key: string): Promise<string> {
  try {
    const value = await serverClient.readContract({
      address: ENS_REGISTRY,
      abi: ENS_REGISTRY_ABI,
      functionName: "getTextRecord",
      args: [label, key],
    });
    return (value as string) || "";
  } catch {
    return "";
  }
}

async function resolveSwarmBudgetMeta() {
  let filecoinStateCid = await readEnsTextRecord("parent", "filecoin.state");
  if (!filecoinStateCid) {
    filecoinStateCid = KNOWN_FILECOIN_STATE_CID;
  }

  if (JUDGE_FLOW_PROXY_URL) {
    try {
      const res = await fetch(`${JUDGE_FLOW_PROXY_URL}/budget`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          filecoinStateCid: data?.filecoinStateCid || filecoinStateCid,
          budgetState: normalizeBudgetState(data, data?.context || "proxy_runtime"),
        };
      }
    } catch {}
  }

  if (existsSync(BUDGET_STATE_PATH)) {
    const raw = JSON.parse(readFileSync(BUDGET_STATE_PATH, "utf-8"));
    return {
      filecoinStateCid,
      budgetState: normalizeBudgetState(raw, raw?.context || "local_runtime"),
    };
  }

  try {
    const payload = await fetchStorageObject(filecoinStateCid);
    const budgetState = budgetStateFromSnapshot(payload.data);
    if (budgetState) {
      return { filecoinStateCid, budgetState };
    }
  } catch {}

  return {
    filecoinStateCid,
    budgetState: normalizeBudgetState(null, "unavailable"),
  };
}

async function resolveErc8004Ids(children: Array<{ ensLabel: string; childAddr: string }>) {
  const labelsKey = children
    .map((child) => `${child.ensLabel.toLowerCase()}@${child.childAddr.toLowerCase()}`)
    .sort()
    .join("|");
  const cacheKey = `swarm:erc8004:${labelsKey}`;
  const cached = getCached<Record<string, string>>(cacheKey);
  if (cached) return cached;

  const labelToAddr = new Map<string, string>();
  for (const child of children) {
    const label = child.ensLabel.toLowerCase();
    const base = label.replace(/-v\d+$/, "");
    const addr = child.childAddr.toLowerCase();
    labelToAddr.set(label, addr);
    labelToAddr.set(base, addr);
  }

  const result: Record<string, string> = {};
  for (let batchStart = ERC8004_SCAN_START; batchStart <= ERC8004_SCAN_END; batchStart += 20) {
    const batchEnd = Math.min(batchStart + 19, ERC8004_SCAN_END);
    const ids = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => BigInt(batchStart + i));
    const [owners, uris] = await Promise.all([
      Promise.all(
        ids.map((id) =>
          serverClient.readContract({
            address: ERC8004_REGISTRY,
            abi: ERC8004_TOKEN_ABI,
            functionName: "ownerOf",
            args: [id],
          }).catch(() => null)
        )
      ),
      Promise.all(
        ids.map((id) =>
          serverClient.readContract({
            address: ERC8004_REGISTRY,
            abi: ERC8004_TOKEN_ABI,
            functionName: "tokenURI",
            args: [id],
          }).catch(() => null)
        )
      ),
    ]);

    let allNull = true;
    owners.forEach((owner, idx) => {
      if (owner) allNull = false;
      if (!owner || (owner as string).toLowerCase() !== ERC8004_DEPLOYER) return;

      const rawUri = uris[idx] as string | null;
      if (!rawUri) return;

      let uri = rawUri;
      if (uri.startsWith("data:application/json;base64,")) {
        try {
          uri = JSON.parse(Buffer.from(uri.slice(29), "base64").toString("utf-8")).name || uri;
        } catch {}
      }

      const match = uri.match(/^spawn:\/\/([^.?]+)\.spawn\.eth/i);
      if (!match) return;

      const addr = labelToAddr.get(match[1].toLowerCase());
      if (addr) {
        result[addr] = ids[idx].toString();
      }
    });

    if (allNull || Object.keys(result).length >= children.length) break;
  }

  setCache(cacheKey, result, ERC8004_CACHE_TTL);
  return result;
}

function getVoteStatsForLabel(
  label: string,
  voteSummaries: ReturnType<typeof buildVoteSummaries>["byChild"]
) {
  const lower = label.toLowerCase();
  return (
    voteSummaries.get(lower) ||
    voteSummaries.get(getBaseLabel(lower)) || {
      voteCount: 0,
      forVotes: 0,
      againstVotes: 0,
      abstainVotes: 0,
      lastVoteTimestamp: null,
    }
  );
}

function getAlignmentForLabel(
  label: string,
  alignmentSummaries: ReturnType<typeof buildAlignmentSummaries>
) {
  const lower = label.toLowerCase();
  return alignmentSummaries.get(lower) || alignmentSummaries.get(getBaseLabel(lower)) || null;
}

function summarizeVotingHistory(history: Array<{ support: number; timestamp: bigint }>) {
  let forVotes = 0;
  let againstVotes = 0;
  let abstainVotes = 0;

  for (const vote of history) {
    const support = Number(vote.support);
    if (support === 1) forVotes += 1;
    else if (support === 0) againstVotes += 1;
    else abstainVotes += 1;
  }

  const lastVoteTimestamp =
    history.length > 0 ? history[history.length - 1].timestamp : BigInt(0);

  return {
    voteCount: history.length,
    forVotes,
    againstVotes,
    abstainVotes,
    lastVoteTimestamp,
  };
}

async function enrichActiveChild(
  child: any,
  voteSummaries: ReturnType<typeof buildVoteSummaries>["byChild"],
  alignmentSummaries: ReturnType<typeof buildAlignmentSummaries>
) {
  const voteStats = getVoteStatsForLabel(child.ensLabel, voteSummaries);
  const alignment = getAlignmentForLabel(child.ensLabel, alignmentSummaries);
  let alignmentScore = Number(alignment?.score ?? 0);
  let voteCount = voteStats.voteCount;
  let forVotes = voteStats.forVotes;
  let againstVotes = voteStats.againstVotes;
  let abstainVotes = voteStats.abstainVotes;
  let lastVoteTimestamp = BigInt(isoToUnixSeconds(voteStats.lastVoteTimestamp));

  try {
    const [onchainAlignment, onchainVoteCount, onchainHistory] = await Promise.all([
      serverClient.readContract({
        address: child.childAddr,
        abi: ChildGovernorABI,
        functionName: "alignmentScore",
      }),
      serverClient.readContract({
        address: child.childAddr,
        abi: ChildGovernorABI,
        functionName: "getVoteCount",
      }),
      serverClient.readContract({
        address: child.childAddr,
        abi: ChildGovernorABI,
        functionName: "getVotingHistory",
      }),
    ]);

    alignmentScore = Number(onchainAlignment);
    voteCount = Number(onchainVoteCount);

    if (Array.isArray(onchainHistory)) {
      const summarized = summarizeVotingHistory(
        onchainHistory.map((vote: any) => ({
          support: Number(vote.support),
          timestamp: BigInt(vote.timestamp),
        }))
      );
      voteCount = Number(onchainVoteCount ?? summarized.voteCount);
      forVotes = summarized.forVotes;
      againstVotes = summarized.againstVotes;
      abstainVotes = summarized.abstainVotes;
      lastVoteTimestamp = summarized.lastVoteTimestamp;
    }
  } catch {}

  return {
    id: child.id.toString(),
    childAddr: child.childAddr,
    governance: child.governance,
    budget: child.budget.toString(),
    maxGasPerVote: child.maxGasPerVote.toString(),
    ensLabel: child.ensLabel,
    active: true,
    alignmentScore: String(alignmentScore),
    voteCount: String(voteCount),
    lastVoteTimestamp: String(lastVoteTimestamp),
    forVotes,
    againstVotes,
    abstainVotes,
  };
}

function enrichTerminatedChild(
  child: any,
  voteSummaries: ReturnType<typeof buildVoteSummaries>["byChild"],
  alignmentSummaries: ReturnType<typeof buildAlignmentSummaries>
) {
  const voteStats = getVoteStatsForLabel(child.ensLabel, voteSummaries);
  const alignment = getAlignmentForLabel(child.ensLabel, alignmentSummaries);

  return {
    id: child.id.toString(),
    childAddr: child.childAddr,
    governance: child.governance,
    budget: child.budget.toString(),
    maxGasPerVote: child.maxGasPerVote.toString(),
    ensLabel: child.ensLabel,
    active: child.active,
    alignmentScore: String(alignment?.score ?? 0),
    voteCount: String(voteStats.voteCount),
    lastVoteTimestamp: isoToUnixSeconds(voteStats.lastVoteTimestamp),
    forVotes: voteStats.forVotes,
    againstVotes: voteStats.againstVotes,
    abstainVotes: voteStats.abstainVotes,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeMeta = url.searchParams.get("meta") !== "0";
    const cacheKey = includeMeta ? "swarm:v3:full" : "swarm:v3:lite";
    const cached = getCached<any>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const [activeRaw, logEntries] = await Promise.all([
      serverClient.readContract({
        address: CONTRACTS.SpawnFactory.address as `0x${string}`,
        abi: SpawnFactoryABI,
        functionName: "getActiveChildren",
      }) as Promise<any[]>,
      readAgentLogEntries().catch(() => []),
    ]);
    const voteSummaries = buildVoteSummaries(logEntries);
    const alignmentSummaries = buildAlignmentSummaries(logEntries);

    const activeEnriched = await Promise.all(
      activeRaw.map((child) => enrichActiveChild(child, voteSummaries.byChild, alignmentSummaries))
    );

    const totalCount = Number(
      await serverClient.readContract({
        address: CONTRACTS.SpawnFactory.address as `0x${string}`,
        abi: SpawnFactoryABI,
        functionName: "childCount",
      })
    );

    const activeIds = new Set(activeRaw.map((child: any) => Number(child.id)));
    const terminatedStart = Math.max(1, totalCount - 60);
    const terminatedIds: number[] = [];
    for (let id = terminatedStart; id <= totalCount; id++) {
      if (!activeIds.has(id)) terminatedIds.push(id);
    }

    const rawTerminated = await Promise.all(
      terminatedIds.map((id) =>
        serverClient.readContract({
          address: CONTRACTS.SpawnFactory.address as `0x${string}`,
          abi: SpawnFactoryABI,
          functionName: "getChild",
          args: [BigInt(id)],
        }).catch(() => null)
      )
    );

    const terminatedEnriched = await Promise.all(
      rawTerminated
        .filter((child): child is NonNullable<typeof child> => !!child && !activeIds.has(Number((child as any).id)))
        .map((child) => enrichTerminatedChild(child, voteSummaries.byChild, alignmentSummaries))
    );

    const children = [...activeEnriched, ...terminatedEnriched];

    let result: any = {
      children,
      meta: {
        filecoinStateCid: null,
        budgetState: null,
        delegationHashes: {},
        revokedDelegations: [],
        filecoinIdentityCids: {},
        erc8004Ids: {},
      },
    };

    if (includeMeta) {
      const [budgetMeta, erc8004Ids, metadataRows] = await Promise.all([
        resolveSwarmBudgetMeta(),
        resolveErc8004Ids(children),
        Promise.all(
          children.map(async (child) => {
            const [delegationHash, revokedDelegation, filecoinIdentityCid] = await Promise.all([
              readEnsTextRecord(child.ensLabel, "erc7715.delegation"),
              readEnsTextRecord(child.ensLabel, "erc7715.delegation.revoked"),
              readEnsTextRecord(child.ensLabel, "filecoin.identity"),
            ]);

            return {
              label: child.ensLabel,
              delegationHash,
              revokedDelegation,
              filecoinIdentityCid,
            };
          })
        ),
      ]);

      const delegationHashes: Record<string, string> = {};
      const revokedDelegations: string[] = [];
      const filecoinIdentityCids: Record<string, string> = {};

      for (const row of metadataRows) {
        if (row.delegationHash) delegationHashes[row.label] = row.delegationHash;
        // Only mark as revoked if the revoked hash matches the current delegation hash.
        // A stale revoked marker from a previous incarnation of the same label must not
        // shadow a fresh active delegation written by a respawned child.
        if (
          row.revokedDelegation &&
          (!row.delegationHash || row.revokedDelegation === row.delegationHash)
        ) {
          revokedDelegations.push(row.label);
        }
        if (row.filecoinIdentityCid) filecoinIdentityCids[row.label] = row.filecoinIdentityCid;
      }

      result = {
        children,
        meta: {
          filecoinStateCid: budgetMeta.filecoinStateCid,
          budgetState: budgetMeta.budgetState,
          delegationHashes,
          revokedDelegations,
          filecoinIdentityCids,
          erc8004Ids,
        },
      };
    }

    setCache(cacheKey, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch swarm" },
      { status: 500 }
    );
  }
}
