import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

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
