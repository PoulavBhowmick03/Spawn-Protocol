import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const LOCAL_LOG_PATH = join(process.cwd(), "..", "agent_log.json");

export const dynamic = "force-dynamic";

export interface VeniceEntry {
  proposalId: number;
  reasoningProvider: string;
  reasoningModel: string;
  decision: string | null;
  txHash: string | null;
  timestamp: string | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ label: string }> }
) {
  const { label: rawLabel } = await params;
  const label = decodeURIComponent(rawLabel);

  if (!existsSync(LOCAL_LOG_PATH)) {
    return NextResponse.json({ entries: [] });
  }

  try {
    const data = JSON.parse(readFileSync(LOCAL_LOG_PATH, "utf-8"));
    const logs: any[] = data.executionLogs ?? [];

    // Match cast_vote entries whose details mention this agent label.
    // Details format: "Child child:uniswap-dao-conservative-v7 — cast_vote — (proposalId=728, ...)"
    const lowerLabel = label.toLowerCase();
    const voteEntries = logs.filter((entry: any) => {
      if (entry.action !== "cast_vote") return false;
      return (entry.details ?? "").toLowerCase().includes(lowerLabel);
    });

    // Deduplicate by proposalId — keep first match per proposal.
    const byProposal = new Map<number, VeniceEntry>();
    for (const entry of voteEntries) {
      const pid = entry.proposalId != null ? Number(entry.proposalId) : null;
      if (pid == null || byProposal.has(pid)) continue;

      const decisionMatch = (entry.details ?? "").match(/decision=(\w+)/i);
      byProposal.set(pid, {
        proposalId: pid,
        reasoningProvider: entry.reasoningProvider ?? "venice",
        reasoningModel: entry.reasoningModel ?? "e2ee-qwen3-30b-a3b-p",
        decision: decisionMatch?.[1]?.toUpperCase() ?? null,
        txHash: entry.txHash ?? null,
        timestamp: entry.timestamp ?? null,
      });
    }

    return NextResponse.json({ entries: Array.from(byProposal.values()) });
  } catch (err: any) {
    return NextResponse.json(
      { entries: [], error: err?.message },
      { status: 500 }
    );
  }
}
