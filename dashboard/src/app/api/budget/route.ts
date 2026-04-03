import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { serverClient } from "@/lib/server-client";
import { fetchStorageObject } from "@/lib/storage-server";

export const dynamic = "force-dynamic";
const JUDGE_FLOW_PROXY_URL = process.env.JUDGE_FLOW_PROXY_URL?.replace(/\/$/, "");

const BUDGET_STATE_PATH = join(process.cwd(), "..", "runtime_budget_state.json");
const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D";
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

const EMPTY_STATE = {
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

function normalizeBudgetState(raw: any, context: string) {
  return {
    ...EMPTY_STATE,
    ...raw,
    reasons: Array.isArray(raw?.reasons) ? raw.reasons : EMPTY_STATE.reasons,
    context,
  };
}

function budgetStateFromSnapshot(snapshot: any) {
  const runtimeBudget = snapshot?.runtimeBudget;
  if (!runtimeBudget || typeof runtimeBudget !== "object") return null;
  return normalizeBudgetState(runtimeBudget, "filecoin.state");
}

export async function GET() {
  try {
    if (JUDGE_FLOW_PROXY_URL) {
      const res = await fetch(`${JUDGE_FLOW_PROXY_URL}/budget`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (!existsSync(BUDGET_STATE_PATH)) {
      try {
        const cid = await serverClient.readContract({
          address: ENS_REGISTRY as `0x${string}`,
          abi: ENS_REGISTRY_ABI,
          functionName: "getTextRecord",
          args: ["parent", "filecoin.state"],
        });

        if (cid) {
          const payload = await fetchStorageObject(cid as string);
          const budgetState = budgetStateFromSnapshot(payload.data);
          if (budgetState) {
            return NextResponse.json({
              ...budgetState,
              filecoinStateCid: payload.cid,
              filecoinStateStorage: payload.storage,
            });
          }
        }
      } catch {}

      return NextResponse.json(EMPTY_STATE);
    }
    const raw = JSON.parse(readFileSync(BUDGET_STATE_PATH, "utf-8"));
    return NextResponse.json(normalizeBudgetState(raw, raw?.context || "local_runtime"));
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to read budget state" },
      { status: 500 }
    );
  }
}
