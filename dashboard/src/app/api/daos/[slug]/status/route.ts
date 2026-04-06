import { NextResponse } from "next/server";
import {
  getRegisteredDAOBySlug,
  normalizeDaoSlug,
  readCohortRecords,
} from "@/lib/dao-onboarding-server";
import { getChildLabelFromAgentId, readAgentLogEntries } from "@/lib/agent-log-server";

export const dynamic = "force-dynamic";

function isDaoScopedEntry(slug: string, entry: any) {
  const sourceDaoSlug = String(entry?.inputs?.sourceDaoSlug || "").trim().toLowerCase();
  if (sourceDaoSlug === slug) return true;
  const childLabel = getChildLabelFromAgentId(entry?.agentId);
  return !!childLabel && childLabel.toLowerCase().startsWith(`ext-${slug}-`);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const normalizedSlug = normalizeDaoSlug(slug);
    const dao = getRegisteredDAOBySlug(normalizedSlug);
    if (!dao) {
      return NextResponse.json({ error: `DAO not found: ${normalizedSlug}` }, { status: 404 });
    }

    const [entries, cohortRecords] = await Promise.all([
      readAgentLogEntries(),
      Promise.resolve(readCohortRecords().filter((record) => record.daoSlug === normalizedSlug)),
    ]);
    const activeCohort = cohortRecords.filter((record) => record.active).map((record) => record.label);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const votesLast24h = entries.filter((entry) => {
      if (entry.action !== "cast_vote" && entry.action !== "judge_vote_cast") return false;
      const ts = entry.timestamp ? Date.parse(entry.timestamp) : 0;
      return ts >= cutoff && isDaoScopedEntry(normalizedSlug, entry);
    }).length;

    return NextResponse.json({
      ...dao,
      spawnedChildren: activeCohort.length > 0 ? activeCohort : dao.spawnedChildren,
      votesLast24h,
      liveCohortCount: activeCohort.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resolve DAO status" },
      { status: 500 }
    );
  }
}
