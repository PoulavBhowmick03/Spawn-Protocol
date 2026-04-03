import "server-only";

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { readAgentLogData, readGitHubAgentLogData } from "@/lib/agent-log-server";
import { serverClient } from "@/lib/server-client";
import { fetchStorageObject } from "@/lib/storage-server";

export type JudgeEvent = {
  action: string;
  at: string;
  status: "pending" | "success" | "failed";
  txHash?: string;
  txHashes?: string[];
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  respawnedChild?: string;
  lineageSourceCid?: string;
  details?: string;
};

type JudgeFlowState = {
  runId: string | null;
  status: "idle" | "queued" | "running" | "failed" | "completed";
  governor: string;
  proofChildLabel?: string;
  proofChildAgentId?: string;
  respawnedChildLabel?: string;
  respawnedChildAgentId?: string;
  proposalId?: string;
  forcedScore: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  failureReason?: string;
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  validationTxHash?: string;
  validationResponseTxHash?: string;
  reputationTxHash?: string;
  alignmentTxHash?: string;
  terminationTxHash?: string;
  proposalTxHash?: string;
  respawnTxHash?: string;
  voteTxHash?: string;
  lineageSourceCid?: string;
  events: JudgeEvent[];
};

export type JudgeExecutionLog = {
  timestamp: string;
  phase: string;
  action: string;
  details: string;
  chain?: string;
  txHash?: string;
  txHashes?: string[];
  ensLabel?: string;
  status: string;
  judgeRunId?: string;
  judgeStep?: string;
  proofChild?: boolean;
  proofStatus?: string;
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  respawnedChild?: string;
  lineageSourceCid?: string;
};

export type JudgeReceipt = {
  runId: string;
  status: JudgeFlowState["status"];
  governor: string;
  proofChildLabel?: string;
  proofChildAgentId?: string;
  respawnedChildLabel?: string;
  respawnedChildAgentId?: string;
  proposalId?: string;
  forcedScore: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  failureReason?: string;
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  validationTxHash?: string;
  validationResponseTxHash?: string;
  reputationTxHash?: string;
  alignmentTxHash?: string;
  terminationTxHash?: string;
  proposalTxHash?: string;
  respawnTxHash?: string;
  voteTxHash?: string;
  lineageSourceCid?: string;
  decision?: string;
  litEncrypted?: boolean;
  reasoningHash?: string;
  veniceTokensUsed?: number;
  veniceCallsUsed?: number;
  events: JudgeEvent[];
  executionLogs: JudgeExecutionLog[];
};

const JUDGE_FLOW_PROXY_URL = process.env.JUDGE_FLOW_PROXY_URL?.replace(/\/$/, "");
const CONTROL_PATH =
  process.env.JUDGE_FLOW_CONTROL_PATH ||
  join(process.cwd(), "..", "judge_flow_state.json");
const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D";
const ENS_REGISTRY_ABI = [
  {
    type: "function",
    name: "getTextRecord",
    stateMutability: "view",
    inputs: [
      { name: "label", type: "string" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

function safeReadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function readJudgeExecutionLogs(): Promise<JudgeExecutionLog[]> {
  const rawLog = await readAgentLogData();
  const primaryLogs = Array.isArray(rawLog?.executionLogs) ? rawLog.executionLogs : [];
  const githubLog = await readGitHubAgentLogData();
  const githubLogs = Array.isArray(githubLog?.executionLogs) ? githubLog.executionLogs : [];
  return chooseMoreCompleteJudgeLogs(primaryLogs, githubLogs);
}

async function readJudgeFlowState(): Promise<JudgeFlowState | null> {
  // 1. Local file (swarm running on the same machine as the dashboard)
  if (existsSync(CONTROL_PATH)) {
    return safeReadJson<JudgeFlowState>(CONTROL_PATH);
  }

  // 2. Proxy URL (swarm running on Railway/VPS, set JUDGE_FLOW_PROXY_URL)
  if (JUDGE_FLOW_PROXY_URL) {
    try {
      const res = await fetch(`${JUDGE_FLOW_PROXY_URL}/judge-flow`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object" && data.runId) return data as JudgeFlowState;
      }
    } catch {}
  }

  // 3. Filecoin via ENS text record "judge-flow.latest" (fully decentralised fallback)
  try {
    const cid = await serverClient.readContract({
      address: ENS_REGISTRY as `0x${string}`,
      abi: ENS_REGISTRY_ABI,
      functionName: "getTextRecord",
      args: ["parent", "judge-flow.latest"],
    });
    if (cid && typeof cid === "string" && cid.length > 0) {
      const payload = await fetchStorageObject(cid);
      if (payload?.data && typeof payload.data === "object") {
        return payload.data as JudgeFlowState;
      }
    }
  } catch {}

  return null;
}

async function fetchProxyJudgeReceipt(runId: string): Promise<JudgeReceipt | null> {
  if (!JUDGE_FLOW_PROXY_URL) return null;

  try {
    const res = await fetch(`${JUDGE_FLOW_PROXY_URL}/receipt/${encodeURIComponent(runId)}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === "object" ? (data as JudgeReceipt) : null;
  } catch {
    return null;
  }
}

function extractDetailValue(details: string | undefined, key: string): string | undefined {
  if (!details) return undefined;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = details.match(new RegExp(`${escapedKey}=([^,)]+)`));
  return match?.[1];
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toBoolean(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function countJudgeRunIds(logs: JudgeExecutionLog[]): number {
  return new Set(
    logs
      .map((entry) => entry.judgeRunId)
      .filter((runId): runId is string => Boolean(runId))
  ).size;
}

function chooseMoreCompleteJudgeLogs(
  primaryLogs: JudgeExecutionLog[],
  githubLogs: JudgeExecutionLog[]
): JudgeExecutionLog[] {
  const primaryRunCount = countJudgeRunIds(primaryLogs);
  const githubRunCount = countJudgeRunIds(githubLogs);

  if (githubRunCount !== primaryRunCount) {
    return githubRunCount > primaryRunCount ? githubLogs : primaryLogs;
  }

  return githubLogs.length > primaryLogs.length ? githubLogs : primaryLogs;
}

function normalizeEvent(log: JudgeExecutionLog): JudgeEvent {
  return {
    action: log.action,
    at: log.timestamp,
    status: (log.status === "failed" ? "failed" : "success") as JudgeEvent["status"],
    txHash: log.txHash,
    txHashes: log.txHashes,
    filecoinCid: log.filecoinCid,
    filecoinUrl: log.filecoinUrl,
    validationRequestId: log.validationRequestId,
    respawnedChild: log.respawnedChild,
    lineageSourceCid: log.lineageSourceCid,
    details: log.details,
  };
}

function dedupeEvents(
  stateEvents: JudgeEvent[] | undefined,
  executionLogs: JudgeExecutionLog[]
): JudgeEvent[] {
  const byAction = new Map<string, JudgeEvent>();
  for (const event of stateEvents ?? []) byAction.set(event.action, event);
  for (const log of executionLogs) {
    const current = byAction.get(log.action);
    byAction.set(log.action, {
      ...current,
      ...normalizeEvent(log),
      action: log.action,
      at: current?.at ?? log.timestamp,
    });
  }
  return [...byAction.values()].sort((a, b) => a.at.localeCompare(b.at));
}

function buildJudgeReceipt(
  runId: string,
  executionLogs: JudgeExecutionLog[],
  currentState: JudgeFlowState | null
): JudgeReceipt | null {
  const runLogs = executionLogs
    .filter((entry) => entry.judgeRunId === runId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const stateForRun = currentState?.runId === runId ? currentState : null;

  if (!stateForRun && runLogs.length === 0) return null;

  const eventByAction = new Map(runLogs.map((entry) => [entry.action, entry]));
  const voteLog = eventByAction.get("judge_vote_cast");
  const alignmentLog = eventByAction.get("judge_alignment_forced");
  const filecoinLog = eventByAction.get("judge_termination_report_filecoin");
  const validationLog = eventByAction.get("judge_validation_written");
  const respawnLog = eventByAction.get("judge_child_respawned");

  const startedAt = stateForRun?.startedAt ?? runLogs[0]?.timestamp;
  const completedAt =
    stateForRun?.completedAt ??
    runLogs[runLogs.length - 1]?.timestamp;
  const durationMs =
    stateForRun?.durationMs ??
    (startedAt && completedAt
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : undefined);

  return {
    runId,
    status:
      stateForRun?.status ??
      (runLogs.some((entry) => entry.status === "failed")
        ? "failed"
        : runLogs.some((entry) => entry.action === "judge_flow_completed")
        ? "completed"
        : "running"),
    governor:
      stateForRun?.governor ??
      extractDetailValue(eventByAction.get("judge_child_spawned")?.details, "governor") ??
      "uniswap",
    proofChildLabel:
      stateForRun?.proofChildLabel ??
      eventByAction.get("judge_child_spawned")?.ensLabel ??
      extractDetailValue(eventByAction.get("judge_child_spawned")?.details, "ensLabel"),
    proofChildAgentId:
      stateForRun?.proofChildAgentId ??
      extractDetailValue(alignmentLog?.details, "erc8004AgentId"),
    respawnedChildLabel:
      stateForRun?.respawnedChildLabel ??
      respawnLog?.respawnedChild ??
      extractDetailValue(respawnLog?.details, "respawnedChild"),
    respawnedChildAgentId: stateForRun?.respawnedChildAgentId,
    proposalId:
      stateForRun?.proposalId ??
      extractDetailValue(voteLog?.details, "proposalId"),
    forcedScore:
      stateForRun?.forcedScore ??
      toNumber(extractDetailValue(alignmentLog?.details, "forcedScore")) ??
      15,
    startedAt,
    completedAt,
    durationMs,
    failureReason:
      stateForRun?.failureReason ??
      (runLogs.find((entry) => entry.status === "failed")?.details || undefined),
    filecoinCid: stateForRun?.filecoinCid ?? filecoinLog?.filecoinCid,
    filecoinUrl: stateForRun?.filecoinUrl ?? filecoinLog?.filecoinUrl,
    validationRequestId:
      stateForRun?.validationRequestId ?? validationLog?.validationRequestId,
    validationTxHash:
      stateForRun?.validationTxHash ?? validationLog?.txHashes?.[0],
    validationResponseTxHash:
      stateForRun?.validationResponseTxHash ??
      validationLog?.txHash ??
      validationLog?.txHashes?.[1],
    reputationTxHash:
      stateForRun?.reputationTxHash ??
      eventByAction.get("judge_reputation_written")?.txHash,
    alignmentTxHash:
      stateForRun?.alignmentTxHash ?? alignmentLog?.txHash,
    terminationTxHash:
      stateForRun?.terminationTxHash ??
      eventByAction.get("judge_child_terminated")?.txHash,
    proposalTxHash:
      stateForRun?.proposalTxHash ??
      eventByAction.get("judge_proposal_seeded")?.txHash,
    respawnTxHash:
      stateForRun?.respawnTxHash ?? respawnLog?.txHash,
    voteTxHash:
      stateForRun?.voteTxHash ?? voteLog?.txHash,
    lineageSourceCid:
      stateForRun?.lineageSourceCid ??
      respawnLog?.lineageSourceCid ??
      filecoinLog?.lineageSourceCid,
    decision: extractDetailValue(voteLog?.details, "decision"),
    litEncrypted: toBoolean(extractDetailValue(voteLog?.details, "litEncrypted")),
    reasoningHash: extractDetailValue(voteLog?.details, "reasoningHash"),
    veniceTokensUsed: toNumber(extractDetailValue(voteLog?.details, "veniceTokensUsed")),
    veniceCallsUsed: toNumber(extractDetailValue(voteLog?.details, "veniceCallsUsed")),
    events: dedupeEvents(stateForRun?.events, runLogs),
    executionLogs: runLogs,
  };
}

export async function getJudgeReceipt(
  runId: string,
  options?: { preferProxy?: boolean }
): Promise<JudgeReceipt | null> {
  const preferProxy = options?.preferProxy ?? true;
  if (preferProxy) {
    const proxyReceipt = await fetchProxyJudgeReceipt(runId);
    if (proxyReceipt) return proxyReceipt;
  }

  const [executionLogs, currentState] = await Promise.all([
    readJudgeExecutionLogs(),
    readJudgeFlowState(),
  ]);
  return buildJudgeReceipt(runId, executionLogs, currentState);
}

export async function listJudgeReceiptRunIds(limit = 20): Promise<string[]> {
  const [executionLogs, state] = await Promise.all([
    readJudgeExecutionLogs(),
    readJudgeFlowState(),
  ]);

  const ordered = [...executionLogs]
    .filter((entry) => entry.judgeRunId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const seen = new Set<string>();
  const runIds: string[] = [];

  for (const entry of ordered) {
    const runId = entry.judgeRunId;
    if (!runId || seen.has(runId)) continue;
    seen.add(runId);
    runIds.push(runId);
    if (runIds.length >= limit) break;
  }

  if (state?.runId && !seen.has(state.runId) && runIds.length < limit) {
    runIds.unshift(state.runId);
  }

  return runIds;
}

export async function listJudgeReceipts(limit = 20): Promise<JudgeReceipt[]> {
  const [executionLogs, state, runIds] = await Promise.all([
    readJudgeExecutionLogs(),
    readJudgeFlowState(),
    listJudgeReceiptRunIds(limit),
  ]);

  return runIds
    .map((runId) => buildJudgeReceipt(runId, executionLogs, state))
    .filter((receipt): receipt is JudgeReceipt => Boolean(receipt))
    .sort((a, b) => {
      const aTime = a.startedAt ?? a.completedAt ?? "";
      const bTime = b.startedAt ?? b.completedAt ?? "";
      return bTime.localeCompare(aTime);
    });
}
