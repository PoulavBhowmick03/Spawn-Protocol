import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";
const JUDGE_FLOW_PROXY_URL = process.env.JUDGE_FLOW_PROXY_URL?.replace(/\/$/, "");

const CONTROL_PATH =
  process.env.JUDGE_FLOW_CONTROL_PATH ||
  join(process.cwd(), "..", "judge_flow_state.json");

const EMPTY_STATE = {
  runId: null,
  status: "idle",
  governor: "uniswap",
  forcedScore: 15,
  events: [],
};

export async function GET() {
  try {
    if (JUDGE_FLOW_PROXY_URL) {
      const res = await fetch(`${JUDGE_FLOW_PROXY_URL}/judge-flow`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (!existsSync(CONTROL_PATH)) {
      return NextResponse.json(EMPTY_STATE);
    }
    const raw = JSON.parse(readFileSync(CONTROL_PATH, "utf-8"));
    return NextResponse.json({ ...EMPTY_STATE, ...raw, events: raw.events ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to read judge flow state" },
      { status: 500 }
    );
  }
}
