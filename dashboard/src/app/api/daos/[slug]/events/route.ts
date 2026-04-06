import { NextResponse } from "next/server";
import { normalizeDaoSlug } from "@/lib/dao-onboarding-server";
import { getChildLabelFromAgentId, readAgentLogEntries } from "@/lib/agent-log-server";

export const dynamic = "force-dynamic";

function isDaoScopedEntry(slug: string, entry: any) {
  const sourceDaoSlug = String(entry?.inputs?.sourceDaoSlug || "").trim().toLowerCase();
  if (sourceDaoSlug === slug) return true;
  const daoSlug = String(entry?.inputs?.daoSlug || entry?.inputs?.targetDaoSlug || "").trim().toLowerCase();
  if (daoSlug === slug) return true;
  const childLabel = getChildLabelFromAgentId(entry?.agentId);
  return !!childLabel && childLabel.toLowerCase().startsWith(`ext-${slug}-`);
}

function eventMessage(entry: any) {
  const childLabel = getChildLabelFromAgentId(entry?.agentId);
  switch (entry.action) {
    case "cast_vote":
    case "judge_vote_cast":
      return `${childLabel || "agent"} voted ${entry?.inputs?.decision || "UNKNOWN"} on proposal ${entry?.inputs?.proposalId ?? "?"}`;
    case "dynamic_spawn_registered_dao":
      return `Spawned ${entry?.inputs?.perspective || "dao"} cohort for ${entry?.inputs?.daoSlug || "registered dao"}`;
    case "dynamic_recall":
      return `Recalled ${entry?.inputs?.child || childLabel || "child"} (${entry?.inputs?.reason || "idle"})`;
    default:
      return entry?.action || "event";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const normalizedSlug = normalizeDaoSlug(slug);
    const entries = await readAgentLogEntries();
    const events = entries
      .filter((entry) => isDaoScopedEntry(normalizedSlug, entry))
      .sort((a, b) => Date.parse(b.timestamp || "0") - Date.parse(a.timestamp || "0"))
      .slice(0, 50)
      .map((entry) => ({
        timestamp: entry.timestamp || null,
        type: entry.action || "event",
        message: eventMessage(entry),
        txHash: entry.txHash || null,
        agentId: entry.agentId || null,
        sourceDaoSlug: entry?.inputs?.sourceDaoSlug || null,
      }));

    return NextResponse.json({ slug: normalizedSlug, events });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resolve DAO events" },
      { status: 500 }
    );
  }
}
