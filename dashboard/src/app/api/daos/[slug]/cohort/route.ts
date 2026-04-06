import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import {
  getRegisteredDAOBySlug,
  normalizeDaoSlug,
  readCohortRecords,
} from "@/lib/dao-onboarding-server";
import { buildVoteSummaries, getBaseLabel, readAgentLogEntries } from "@/lib/agent-log-server";

export const dynamic = "force-dynamic";

const BUDGET_STATE_PATH = join(process.cwd(), "..", "runtime_budget_state.json");

function readBudgetState() {
  if (!existsSync(BUDGET_STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BUDGET_STATE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function getVoteStats(label: string, byChild: ReturnType<typeof buildVoteSummaries>["byChild"]) {
  const lower = label.toLowerCase();
  return byChild.get(lower) || byChild.get(getBaseLabel(lower)) || {
    voteCount: 0,
    forVotes: 0,
    againstVotes: 0,
    abstainVotes: 0,
    lastVoteTimestamp: null,
  };
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

    const [entries, records] = await Promise.all([
      readAgentLogEntries(),
      Promise.resolve(
        readCohortRecords()
          .filter((record) => record.daoSlug === normalizedSlug)
          .sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            return Date.parse(b.spawnedAt) - Date.parse(a.spawnedAt);
          })
      ),
    ]);
    const voteSummaries = buildVoteSummaries(entries);
    const activeRecords = records.filter((record) => record.active);
    const budget = readBudgetState();
    const spawnBlocked = activeRecords.length === 0 && dao.activeProposalCount > 0 && Boolean(budget?.pauseScaling);

    return NextResponse.json({
      slug: normalizedSlug,
      targetSize: 3,
      liveCount: activeRecords.length,
      spawnBlocked,
      blockReason: spawnBlocked ? "BUDGET_PAUSED" : null,
      children: records.map((record) => {
        const voteStats = getVoteStats(record.label, voteSummaries.byChild);
        return {
          label: record.label,
          active: record.active,
          perspective: record.perspective,
          governorName: record.governorName,
          spawnedAt: record.spawnedAt,
          spawnReason: record.spawnReason,
          triggeringProposalId: record.triggeringProposalId,
          voteCount: voteStats.voteCount,
          lastVoteAt: voteStats.lastVoteTimestamp,
          recalledAt: record.recalledAt,
          recallReason: record.recallReason,
        };
      }),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resolve DAO cohort" },
      { status: 500 }
    );
  }
}
