import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { JUDGE_FLOW_CONTROL_PATH } from "./judge-flow.js";
import {
  appendRegisteredDAO,
  createRegisteredDAO,
  extractSnapshotSpace,
  extractTallyOrganizationInput,
  getAllRegisteredDAOs,
  getRegisteredDAOBySlug,
  getRegisteredDAOBySource,
  normalizeSlug,
  type RegisteredDAO,
} from "./dao-registry.js";

const BUDGET_STATE_PATH = join(process.cwd(), "..", "runtime_budget_state.json");
const LOG_PATH = join(process.cwd(), "..", "agent_log.json");
const DASHBOARD_BASE_URL = (process.env.DASHBOARD_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TALLY_ENDPOINT = "https://api.tally.xyz/query";
const SNAPSHOT_ENDPOINT = "https://hub.snapshot.org/graphql";

type JudgeEvent = {
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

type JudgeExecutionLog = {
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

type JudgeReceipt = {
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

const EMPTY_STATE = {
  runId: null,
  status: "idle",
  governor: "uniswap",
  forcedScore: 15,
  events: [],
};

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
  warningTokens: 200000,
  pauseTokens: 350000,
  activeChildren: 0,
  filecoinAvailable: false,
  pauseProposalCreation: false,
  pauseScaling: false,
  pauseJudgeFlow: false,
  lastUpdatedAt: null,
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function buildDashboardUrl(slug: string) {
  return `${DASHBOARD_BASE_URL}/dao/${encodeURIComponent(slug)}`;
}

function safeReadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function verifyTallyOrg(rawInput: string): Promise<{ id: string; slug: string; name: string } | null> {
  const apiKey = process.env.TALLY_API_KEY;
  if (!apiKey) {
    throw new Error("TALLY_API_KEY is not configured");
  }

  const parsed = extractTallyOrganizationInput(rawInput);
  if (!parsed.id && !parsed.slug) return null;

  const variables = parsed.id
    ? { input: { id: Number(parsed.id) } }
    : { input: { slug: parsed.slug } };

  const response = await fetch(TALLY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
    },
    body: JSON.stringify({
      query: `query Organization($input: OrganizationInput!) {
        organization(input: $input) {
          id
          slug
          name
        }
      }`,
      variables,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Tally verification failed (${response.status})`);
  }

  const json = (await response.json()) as {
    data?: { organization?: { id: number | string; slug: string; name: string } | null };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    return null;
  }

  const organization = json.data?.organization;
  if (!organization?.id || !organization.slug || !organization.name) return null;

  return {
    id: String(organization.id),
    slug: organization.slug,
    name: organization.name,
  };
}

async function verifySnapshotSpace(rawInput: string): Promise<{ id: string; name: string } | null> {
  const spaceId = extractSnapshotSpace(rawInput);
  if (!spaceId) return null;

  const response = await fetch(SNAPSHOT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query Space($id: String!) {
        space(id: $id) {
          id
          name
        }
      }`,
      variables: { id: spaceId },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Snapshot verification failed (${response.status})`);
  }

  const json = (await response.json()) as {
    data?: { space?: { id: string; name: string } | null };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    return null;
  }

  const space = json.data?.space;
  if (!space?.id || !space.name) return null;

  return {
    id: space.id,
    name: space.name,
  };
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

function getJudgeReceipt(runId: string): JudgeReceipt | null {
  const rawLog = safeReadJson<{ executionLogs?: JudgeExecutionLog[] }>(LOG_PATH);
  const executionLogs = (rawLog?.executionLogs ?? [])
    .filter((entry) => entry.judgeRunId === runId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const state = safeReadJson<JudgeFlowState>(JUDGE_FLOW_CONTROL_PATH);
  const currentState = state?.runId === runId ? state : null;

  if (!currentState && executionLogs.length === 0) return null;

  const eventByAction = new Map(executionLogs.map((entry) => [entry.action, entry]));
  const voteLog = eventByAction.get("judge_vote_cast");
  const alignmentLog = eventByAction.get("judge_alignment_forced");
  const filecoinLog = eventByAction.get("judge_termination_report_filecoin");
  const validationLog = eventByAction.get("judge_validation_written");
  const respawnLog = eventByAction.get("judge_child_respawned");
  const startedAt = currentState?.startedAt ?? executionLogs[0]?.timestamp;
  const completedAt = currentState?.completedAt ?? executionLogs[executionLogs.length - 1]?.timestamp;
  const durationMs =
    currentState?.durationMs ??
    (startedAt && completedAt
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : undefined);

  return {
    runId,
    status:
      currentState?.status ??
      (executionLogs.some((entry) => entry.status === "failed")
        ? "failed"
        : executionLogs.some((entry) => entry.action === "judge_flow_completed")
        ? "completed"
        : "running"),
    governor:
      currentState?.governor ??
      extractDetailValue(eventByAction.get("judge_child_spawned")?.details, "governor") ??
      "uniswap",
    proofChildLabel:
      currentState?.proofChildLabel ??
      eventByAction.get("judge_child_spawned")?.ensLabel ??
      extractDetailValue(eventByAction.get("judge_child_spawned")?.details, "ensLabel"),
    proofChildAgentId:
      currentState?.proofChildAgentId ??
      extractDetailValue(alignmentLog?.details, "erc8004AgentId"),
    respawnedChildLabel:
      currentState?.respawnedChildLabel ??
      respawnLog?.respawnedChild ??
      extractDetailValue(respawnLog?.details, "respawnedChild"),
    respawnedChildAgentId: currentState?.respawnedChildAgentId,
    proposalId:
      currentState?.proposalId ??
      extractDetailValue(voteLog?.details, "proposalId"),
    forcedScore:
      currentState?.forcedScore ??
      toNumber(extractDetailValue(alignmentLog?.details, "forcedScore")) ??
      15,
    startedAt,
    completedAt,
    durationMs,
    failureReason: currentState?.failureReason,
    filecoinCid: currentState?.filecoinCid ?? filecoinLog?.filecoinCid,
    filecoinUrl: currentState?.filecoinUrl ?? filecoinLog?.filecoinUrl,
    validationRequestId:
      currentState?.validationRequestId ?? validationLog?.validationRequestId,
    validationTxHash: currentState?.validationTxHash ?? validationLog?.txHashes?.[0],
    validationResponseTxHash:
      currentState?.validationResponseTxHash ?? validationLog?.txHash ?? validationLog?.txHashes?.[1],
    reputationTxHash:
      currentState?.reputationTxHash ?? eventByAction.get("judge_reputation_written")?.txHash,
    alignmentTxHash:
      currentState?.alignmentTxHash ?? alignmentLog?.txHash,
    terminationTxHash:
      currentState?.terminationTxHash ?? eventByAction.get("judge_child_terminated")?.txHash,
    proposalTxHash:
      currentState?.proposalTxHash ?? eventByAction.get("judge_proposal_seeded")?.txHash,
    respawnTxHash:
      currentState?.respawnTxHash ?? respawnLog?.txHash,
    voteTxHash: currentState?.voteTxHash ?? voteLog?.txHash,
    lineageSourceCid:
      currentState?.lineageSourceCid ?? respawnLog?.lineageSourceCid ?? filecoinLog?.lineageSourceCid,
    decision: extractDetailValue(voteLog?.details, "decision"),
    litEncrypted: toBoolean(extractDetailValue(voteLog?.details, "litEncrypted")),
    reasoningHash: extractDetailValue(voteLog?.details, "reasoningHash"),
    veniceTokensUsed: toNumber(extractDetailValue(voteLog?.details, "veniceTokensUsed")),
    veniceCallsUsed: toNumber(extractDetailValue(voteLog?.details, "veniceCallsUsed")),
    events: dedupeEvents(currentState?.events, executionLogs),
    executionLogs,
  };
}

export function startControlServer() {
  if (process.env.JUDGE_FLOW_HTTP_ENABLED === "false") return;

  const port = Number(process.env.PORT || process.env.JUDGE_FLOW_CONTROL_PORT || 8787);
  const host = "0.0.0.0";

  const server = createServer(async (req, res) => {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, service: "spawn-swarm-control" });
    }

    if (method === "GET" && url.pathname === "/judge-flow") {
      const current = safeReadJson<JudgeFlowState>(JUDGE_FLOW_CONTROL_PATH);
      return json(res, 200, current ? { ...EMPTY_STATE, ...current, events: current.events ?? [] } : EMPTY_STATE);
    }

    if (method === "GET" && url.pathname === "/budget") {
      const current = safeReadJson<any>(BUDGET_STATE_PATH);
      return json(
        res,
        200,
        current ? { ...EMPTY_BUDGET_STATE, ...current, context: current.context || "agent_runtime" } : EMPTY_BUDGET_STATE
      );
    }

    if (method === "GET" && url.pathname === "/daos") {
      return json(res, 200, { daos: getAllRegisteredDAOs() });
    }

    if (method === "GET" && url.pathname.startsWith("/daos/")) {
      const slug = normalizeSlug(decodeURIComponent(url.pathname.slice("/daos/".length)));
      const dao = getRegisteredDAOBySlug(slug);
      if (!dao) {
        return json(res, 404, { error: `DAO not found: ${slug}` });
      }
      return json(res, 200, dao);
    }

    if (method === "POST" && url.pathname === "/dao/register") {
      const body = await readBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const source = body.source === "tally" || body.source === "snapshot" ? body.source : null;
      const rawSourceRef = typeof body.sourceRef === "string" ? body.sourceRef.trim() : "";
      const displaySlug = typeof body.displaySlug === "string" ? body.displaySlug.trim() : "";
      const philosophy = typeof body.philosophy === "string" ? body.philosophy.trim() : "";
      const contact = typeof body.contact === "string" ? body.contact.trim() : "";

      if (!name) {
        return json(res, 422, { error: "name is required" });
      }
      if (!source) {
        return json(res, 422, { error: "source must be 'tally' or 'snapshot'" });
      }
      if (!rawSourceRef) {
        return json(res, 422, { error: "sourceRef is required" });
      }

      try {
        let verified: { id: string; slug?: string; name: string } | null = null;
        let normalizedSourceRef = rawSourceRef;

        if (source === "tally") {
          verified = await verifyTallyOrg(rawSourceRef);
          if (!verified) {
            return json(res, 422, { error: `Tally organization not found: ${rawSourceRef}` });
          }
          normalizedSourceRef = verified.id;
        } else {
          verified = await verifySnapshotSpace(rawSourceRef);
          if (!verified) {
            return json(res, 422, { error: `Snapshot space not found: ${rawSourceRef}` });
          }
          normalizedSourceRef = verified.id;
        }

        const existingBySource = getRegisteredDAOBySource(source, normalizedSourceRef);
        if (existingBySource) {
          return json(res, 409, {
            error: `${name} is already registered`,
            daoId: existingBySource.id,
            slug: existingBySource.slug,
            dashboardUrl: buildDashboardUrl(existingBySource.slug),
          });
        }

        const desiredSlug = normalizeSlug(displaySlug || name);
        const existingBySlug = getRegisteredDAOBySlug(desiredSlug);
        if (existingBySlug) {
          return json(res, 409, { error: `DAO slug already registered: ${desiredSlug}` });
        }

        const dao = createRegisteredDAO({
          name,
          slug: desiredSlug,
          source,
          sourceRef: normalizedSourceRef,
          philosophy,
          contact,
        });

        let created: RegisteredDAO;
        try {
          created = appendRegisteredDAO(dao);
        } catch (err: any) {
          return json(res, 409, { error: err?.message || "DAO registration conflict" });
        }

        return json(res, 201, {
          daoId: created.id,
          slug: created.slug,
          status: created.status,
          dashboardUrl: buildDashboardUrl(created.slug),
          source: created.source,
          sourceRef: created.sourceRef,
          resolvedName: verified.name,
          resolvedSlug: verified.slug ?? null,
        });
      } catch (err: any) {
        return json(res, 500, { error: err?.message || "Failed to register DAO" });
      }
    }

    if (method === "POST" && url.pathname === "/judge-flow/start") {
      const body = await readBody(req);
      const current = existsSync(JUDGE_FLOW_CONTROL_PATH)
        ? { ...EMPTY_STATE, ...(safeReadJson<JudgeFlowState>(JUDGE_FLOW_CONTROL_PATH) ?? {}) }
        : EMPTY_STATE;

      if (current.status === "queued" || current.status === "running") {
        return json(res, 409, { error: `Judge flow already ${current.status}`, current });
      }

      if (existsSync(BUDGET_STATE_PATH)) {
        const budget = safeReadJson<any>(BUDGET_STATE_PATH);
        if (budget?.pauseJudgeFlow) {
          return json(res, 409, {
            error: `Judge flow paused by runtime budget policy (${budget.policy || "paused"})`,
            budget,
          });
        }
      }

      const runId = body.runId || `judge-${Date.now()}`;
      const next = {
        runId,
        status: "queued",
        governor: body.governor || "uniswap",
        forcedScore: Number(body.forcedScore || 15),
        requestedAt: new Date().toISOString(),
        startedAt: undefined,
        completedAt: undefined,
        durationMs: undefined,
        failureReason: undefined,
        proofChildLabel: undefined,
        proofChildAgentId: undefined,
        respawnedChildLabel: undefined,
        respawnedChildAgentId: undefined,
        proposalId: undefined,
        proposalDescription: undefined,
        filecoinCid: undefined,
        filecoinUrl: undefined,
        validationRequestId: undefined,
        validationTxHash: undefined,
        validationResponseTxHash: undefined,
        reputationTxHash: undefined,
        alignmentTxHash: undefined,
        terminationTxHash: undefined,
        proposalTxHash: undefined,
        respawnTxHash: undefined,
        voteTxHash: undefined,
        lineageSourceCid: undefined,
        events: [],
      };

      writeFileSync(JUDGE_FLOW_CONTROL_PATH, JSON.stringify(next, null, 2));
      return json(res, 200, next);
    }

    if (method === "GET" && url.pathname.startsWith("/receipt/")) {
      const runId = decodeURIComponent(url.pathname.slice("/receipt/".length));
      const receipt = getJudgeReceipt(runId);
      if (!receipt) {
        return json(res, 404, { error: `No judge receipt found for ${runId}` });
      }
      return json(res, 200, receipt);
    }

    return json(res, 404, { error: "Not found" });
  });

  server.listen(port, host, () => {
    console.log(`[Control] Judge flow control API listening on http://${host}:${port}`);
  });
}
