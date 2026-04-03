import { NextResponse } from "next/server";
import {
  decisionToSupport,
  getChildLabelFromAgentId,
  isoToUnixSeconds,
  readAgentLogEntries,
} from "@/lib/agent-log-server";
import { getCached, setCache } from "@/lib/server-client";

const CACHE_KEY = "timeline:v2";
const CACHE_TTL = 15_000;
const MAX_EVENTS = 200;

export const dynamic = "force-dynamic";

function eventId(type: string, entry: any, index: number) {
  return `${type}-${entry.txHash || entry.timestamp || "log"}-${index}`;
}

function toTimelineEvent(type: string, entry: any, index: number, data: Record<string, unknown>) {
  return {
    id: eventId(type, entry, index),
    type,
    blockNumber: "0",
    transactionHash: entry.txHash || entry.outputs?.txHash || "0x",
    timestamp: isoToUnixSeconds(entry.timestamp),
    data,
  };
}

function buildTimelineFromLogs(entries: any[]) {
  const timeline: any[] = [];

  entries.forEach((entry, index) => {
    switch (entry.action) {
      case "dynamic_spawn":
      case "spawn_child":
      case "respawn_child":
      case "judge_child_spawned":
        timeline.push(
          toTimelineEvent("ChildSpawned", entry, index, {
            childId: entry.inputs?.childId ?? entry.outputs?.childId ?? null,
            childAddr:
              entry.outputs?.childAddr ??
              entry.inputs?.childAddr ??
              entry.inputs?.newWallet ??
              null,
            governance: entry.inputs?.governance ?? entry.outputs?.governance ?? null,
            budget: entry.inputs?.budget ?? entry.outputs?.budget ?? null,
            ensLabel:
              entry.inputs?.newLabel ??
              entry.outputs?.label ??
              entry.inputs?.label ??
              getChildLabelFromAgentId(entry.agentId),
          })
        );
        break;

      case "terminate_child":
      case "dynamic_recall":
      case "judge_child_terminated":
        timeline.push(
          toTimelineEvent("ChildTerminated", entry, index, {
            childId: entry.inputs?.childId ?? entry.outputs?.childId ?? null,
            childAddr: entry.inputs?.childAddr ?? entry.outputs?.childAddr ?? null,
            ensLabel: entry.inputs?.child ?? entry.outputs?.child ?? null,
            fundsReturned: entry.outputs?.fundsReturned ?? null,
            finalScore: entry.outputs?.finalScore ?? null,
          })
        );
        break;

      case "cast_vote":
      case "judge_vote_cast":
        timeline.push(
          toTimelineEvent("VoteCast", entry, index, {
            ensLabel: getChildLabelFromAgentId(entry.agentId),
            childAddr: entry.inputs?.childAddr ?? entry.outputs?.childAddr ?? null,
            proposalId: entry.inputs?.proposalId?.toString?.() ?? String(entry.inputs?.proposalId ?? ""),
            support: decisionToSupport(entry.inputs?.decision ?? entry.inputs?.support),
          })
        );
        break;

      case "evaluate_alignment":
      case "judge_alignment_forced":
        timeline.push(
          toTimelineEvent("AlignmentUpdated", entry, index, {
            ensLabel: entry.inputs?.child ?? getChildLabelFromAgentId(entry.agentId),
            childAddr: entry.inputs?.childAddr ?? null,
            newScore:
              entry.outputs?.score ??
              entry.inputs?.score ??
              entry.outputs?.newScore ??
              entry.inputs?.newScore ??
              0,
          })
        );
        break;

      case "reveal_rationale":
        timeline.push(
          toTimelineEvent("RationaleRevealed", entry, index, {
            ensLabel: getChildLabelFromAgentId(entry.agentId),
            childAddr: entry.inputs?.childAddr ?? null,
            proposalId: entry.inputs?.proposalId?.toString?.() ?? String(entry.inputs?.proposalId ?? ""),
          })
        );
        break;

      default:
        break;
    }
  });

  timeline.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  return timeline.slice(0, MAX_EVENTS);
}

export async function GET() {
  try {
    const cached = getCached<any>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const entries = await readAgentLogEntries().catch(() => []);
    const timeline = buildTimelineFromLogs(entries);

    setCache(CACHE_KEY, timeline, CACHE_TTL);
    return NextResponse.json(timeline);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch timeline" },
      { status: 500 }
    );
  }
}
