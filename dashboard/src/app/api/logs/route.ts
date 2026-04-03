import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/server-client";
import { readAgentLogData } from "@/lib/agent-log-server";

const CACHE_KEY = "agent-logs";
const CACHE_TTL = 5_000;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cached = getCached<any>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);
    const data = await readAgentLogData();
    setCache(CACHE_KEY, data, CACHE_TTL);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch logs" }, { status: 500 });
  }
}
