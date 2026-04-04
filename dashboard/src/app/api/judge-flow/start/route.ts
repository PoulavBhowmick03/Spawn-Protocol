import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";
const JUDGE_FLOW_PROXY_URL = process.env.JUDGE_FLOW_PROXY_URL?.replace(/\/$/, "");

const CONTROL_PATH =
  process.env.JUDGE_FLOW_CONTROL_PATH ||
  join(process.cwd(), "..", "judge_flow_state.json");
const BUDGET_STATE_PATH = join(process.cwd(), "..", "runtime_budget_state.json");
const JUDGE_FAST_CHILD_INTERVAL_MS = Number(process.env.JUDGE_FAST_CHILD_INTERVAL_MS || 1500);

const EMPTY_STATE = {
  runId: null,
  status: "idle",
  governor: "uniswap",
  forcedScore: 15,
  events: [],
};

function normalizeJudgeChildCycleInterval(body: Record<string, unknown>): number | undefined {
  const explicit = Number(body.childCycleIntervalMs);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  if (body.fastMode === true) return JUDGE_FAST_CHILD_INTERVAL_MS;
  return undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    if (JUDGE_FLOW_PROXY_URL) {
      const res = await fetch(`${JUDGE_FLOW_PROXY_URL}/judge-flow/start`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    const current = existsSync(CONTROL_PATH)
      ? { ...EMPTY_STATE, ...JSON.parse(readFileSync(CONTROL_PATH, "utf-8")) }
      : EMPTY_STATE;

    if (current.status === "queued" || current.status === "running") {
      return NextResponse.json(
        { error: `Judge flow already ${current.status}`, current },
        { status: 409 }
      );
    }

    if (existsSync(BUDGET_STATE_PATH)) {
      const budget = JSON.parse(readFileSync(BUDGET_STATE_PATH, "utf-8"));
      if (budget?.pauseJudgeFlow) {
        return NextResponse.json(
          {
            error: `Judge flow paused by runtime budget policy (${budget.policy || "paused"})`,
            budget,
          },
          { status: 409 }
        );
      }
    }

    const runId = body.runId || `judge-${Date.now()}`;
    const next = {
      runId,
      status: "queued",
      governor: body.governor || "uniswap",
      childCycleIntervalMs: normalizeJudgeChildCycleInterval(body),
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

    writeFileSync(CONTROL_PATH, JSON.stringify(next, null, 2));
    return NextResponse.json(next);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to queue judge flow" },
      { status: 500 }
    );
  }
}
