import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { serverClient } from "@/lib/server-client";
import { fetchStorageObject } from "@/lib/storage-server";

export const dynamic = "force-dynamic";
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

const EMPTY_STATE = {
  runId: null,
  status: "idle",
  governor: "uniswap",
  forcedScore: 15,
  events: [],
};

export async function GET() {
  try {
    // 1. Local file (swarm co-located with dashboard)
    if (existsSync(CONTROL_PATH)) {
      const raw = JSON.parse(readFileSync(CONTROL_PATH, "utf-8"));
      return NextResponse.json({ ...EMPTY_STATE, ...raw, events: raw.events ?? [] });
    }

    // 2. Proxy URL — only use if it returns a non-idle completed/running state
    if (JUDGE_FLOW_PROXY_URL) {
      try {
        const res = await fetch(`${JUDGE_FLOW_PROXY_URL}/judge-flow`, {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === "object" && data.runId) {
            return NextResponse.json(data);
          }
        }
      } catch {}
    }

    // 3. Filecoin via ENS text record "judge-flow.latest" (production fallback)
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
          return NextResponse.json({ ...EMPTY_STATE, ...payload.data as object,
                                     filecoinCid: cid, filecoinStorage: "filecoin" });
        }
      }
    } catch {}

    return NextResponse.json(EMPTY_STATE);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to read judge flow state" },
      { status: 500 }
    );
  }
}
