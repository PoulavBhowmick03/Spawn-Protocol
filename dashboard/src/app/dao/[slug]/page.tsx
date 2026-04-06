"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ProposalCard } from "@/components/ProposalCard";
import {
  DashboardHeader,
  DashboardPageFrame,
  DashboardPanel,
  DashboardStatStrip,
} from "@/components/DashboardChrome";
import { useProposals } from "@/hooks/useProposals";

type DaoStatus = {
  id: string;
  slug: string;
  name: string;
  source: "tally" | "snapshot";
  sourceRef: string;
  philosophy: string;
  contact: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  status:
    | "registered"
    | "validated"
    | "discovering"
    | "mirrored"
    | "cohort_spawned"
    | "voting"
    | "idle"
    | "error";
  lastActionAt: string | null;
  lastError: string | null;
  mirroredProposalCount: number;
  activeProposalCount: number;
  spawnedChildren: string[];
  lastVoteAt: string | null;
  timeToFirstMirrorMs: number | null;
  timeToFirstSpawnMs: number | null;
  timeToFirstVoteMs: number | null;
  votesLast24h: number;
  liveCohortCount: number;
};

type DaoEvent = {
  timestamp: string | null;
  type: string;
  message: string;
  txHash: string | null;
  agentId: string | null;
};

type CohortChild = {
  label: string;
  active: boolean;
  perspective: string;
  governorName: string;
  spawnedAt: string;
  spawnReason: string;
  triggeringProposalId: string | null;
  voteCount: number;
  lastVoteAt: string | null;
  recalledAt: string | null;
  recallReason: string | null;
};

type CohortResponse = {
  slug: string;
  targetSize: number;
  liveCount: number;
  spawnBlocked: boolean;
  blockReason: string | null;
  children: CohortChild[];
};

type BudgetState = {
  pauseScaling?: boolean;
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatDuration(ms: number | null) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function deriveDiagnostic(
  dao: DaoStatus | null,
  cohort: CohortResponse | null,
  budget: BudgetState | null,
  totalAgentVotes: number
) {
  if (!dao) return { code: "LOADING", detail: "Resolving DAO state" };
  if (dao.status === "error") {
    return {
      code: "VOTE_ERRORS",
      detail: dao.lastError || "The autonomous loop hit an error during registration or voting",
    };
  }
  if (dao.status === "registered" || dao.status === "validated" || dao.status === "discovering") {
    return {
      code: "DISCOVERY_IN_FLIGHT",
      detail: "Registration completed. The swarm is discovering and mirroring upstream proposals.",
    };
  }
  if (dao.activeProposalCount === 0) {
    return {
      code: "NO_ACTIVE_UPSTREAM_PROPOSALS",
      detail: "No active mirrored proposals currently exist for this DAO.",
    };
  }
  if (budget?.pauseScaling && (!cohort || cohort.liveCount === 0)) {
    return {
      code: "BUDGET_PAUSED",
      detail: "Global runtime budget policy is pausing new cohort spawns.",
    };
  }
  if (cohort?.spawnBlocked) {
    return {
      code: "COHORT_SPAWN_BLOCKED",
      detail: cohort.blockReason || "The DAO has active proposals but the cohort could not be spawned.",
    };
  }
  if ((cohort?.liveCount || 0) > 0 && totalAgentVotes === 0) {
    return {
      code: "CHILDREN_SPAWNED_NOT_VOTED_YET",
      detail: "Dedicated children are live and waiting for their first successful vote.",
    };
  }
  return {
    code: "AUTONOMOUS_LOOP_HEALTHY",
    detail: "Discovery, cohort spawn, and voting are progressing normally.",
  };
}

export default function DaoDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const normalizedSlug = slug.trim().toLowerCase();
  const { proposals, loading: proposalsLoading, error: proposalsError } = useProposals({ daoSlug: normalizedSlug });
  const [dao, setDao] = useState<DaoStatus | null>(null);
  const [cohort, setCohort] = useState<CohortResponse | null>(null);
  const [events, setEvents] = useState<DaoEvent[]>([]);
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta(background = false) {
      if (!background) setMetaLoading(true);
      try {
        const [statusRes, cohortRes, eventsRes, budgetRes] = await Promise.all([
          fetch(`/api/daos/${encodeURIComponent(normalizedSlug)}/status`, { cache: "no-store" }),
          fetch(`/api/daos/${encodeURIComponent(normalizedSlug)}/cohort`, { cache: "no-store" }),
          fetch(`/api/daos/${encodeURIComponent(normalizedSlug)}/events`, { cache: "no-store" }),
          fetch("/api/budget", { cache: "no-store" }),
        ]);
        const [statusData, cohortData, eventsData, budgetData] = await Promise.all([
          statusRes.json(),
          cohortRes.json(),
          eventsRes.json(),
          budgetRes.json(),
        ]);

        if (!statusRes.ok) throw new Error(statusData.error || `Status API ${statusRes.status}`);
        if (!cohortRes.ok) throw new Error(cohortData.error || `Cohort API ${cohortRes.status}`);
        if (!eventsRes.ok) throw new Error(eventsData.error || `Events API ${eventsRes.status}`);
        if (!cancelled) {
          setDao(statusData);
          setCohort(cohortData);
          setEvents(Array.isArray(eventsData.events) ? eventsData.events : []);
          setBudget(budgetRes.ok ? budgetData : null);
          setMetaError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setMetaError(err instanceof Error ? err.message : "Failed to load DAO status");
        }
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    }

    loadMeta();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadMeta(true);
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [normalizedSlug]);

  const totalAgentVotes = proposals.reduce(
    (sum, proposal) =>
      sum + Number(proposal.forVotes) + Number(proposal.againstVotes) + Number(proposal.abstainVotes),
    0
  );

  const diagnostic = useMemo(
    () => deriveDiagnostic(dao, cohort, budget, totalAgentVotes),
    [dao, cohort, budget, totalAgentVotes]
  );

  const combinedError = metaError || proposalsError;

  return (
    <DashboardPageFrame>
      <DashboardHeader
        title={`DAO_${normalizedSlug.toUpperCase()}`}
        subtitle="REGISTER → MIRROR → SPAWN → VOTE → PROVE"
        right={
          <Link href="/daos" className="font-mono text-[10px] text-[#4a4f5e] uppercase hover:text-[#f5f5f0]">
            ← BACK_TO_DAOS
          </Link>
        }
      />

      <DashboardStatStrip
        stats={[
          { label: "STATUS", value: dao?.status?.replace(/_/g, " ") || "—", tone: dao?.status === "error" ? "red" : dao?.status === "voting" ? "blue" : dao?.status === "cohort_spawned" ? "green" : dao?.activeProposalCount ? "amber" : "neutral" },
          { label: "ACTIVE_PROPOSALS", value: metaLoading ? "—" : dao?.activeProposalCount ?? 0, tone: "amber" },
          { label: "LIVE_CHILDREN", value: metaLoading ? "—" : cohort?.liveCount ?? dao?.liveCohortCount ?? 0, tone: "green", helper: `target ${(cohort?.targetSize ?? 3).toString()}` },
          { label: "VOTES_LAST_24H", value: metaLoading ? "—" : dao?.votesLast24h ?? 0, tone: "blue" },
        ]}
      />

      <div className="p-4 space-y-4">
        {combinedError ? (
          <div className="border border-[#ff3b3b]/30 bg-[#ff3b3b]/5 px-4 py-3">
            <p className="font-mono text-[11px] text-[#ff3b3b] uppercase">ERROR: {combinedError}</p>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.85fr]">
          <DashboardPanel
            title="AUTONOMOUS_PROOF"
            subtitle={dao ? `${dao.name} mirrored into the shared Spawn simulation layer` : "Loading DAO proof"}
          >
            <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
              {[
                ["REGISTERED_AT", formatTimestamp(dao?.createdAt)],
                ["FIRST_MIRROR", formatDuration(dao?.timeToFirstMirrorMs ?? null)],
                ["FIRST_COHORT_SPAWN", formatDuration(dao?.timeToFirstSpawnMs ?? null)],
                ["FIRST_VOTE", formatDuration(dao?.timeToFirstVoteMs ?? null)],
                ["LAST_VOTE_AT", formatTimestamp(dao?.lastVoteAt)],
                ["MIRRORED_TOTAL", String(dao?.mirroredProposalCount ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#0d0d14] px-4 py-3">
                  <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">{label}</div>
                  <div className="mt-1 font-mono text-[13px] text-[#f5f5f0]">{value}</div>
                </div>
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="DIAGNOSTICS"
            subtitle="Why the autonomous loop is or is not progressing"
          >
            <div className="border-b border-white/[0.08] px-4 py-3">
              <div className="font-mono text-[11px] text-[#f5a623] uppercase tracking-widest">
                {diagnostic.code}
              </div>
              <p className="mt-2 text-[12px] text-[#8b92a8] leading-relaxed">{diagnostic.detail}</p>
            </div>
            <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
              {[
                ["SOURCE", dao ? dao.source.toUpperCase() : "—"],
                ["SOURCE_REF", dao?.sourceRef || "—"],
                ["PHILOSOPHY", dao?.philosophy?.toUpperCase() || "—"],
                ["LAST_ACTION", formatTimestamp(dao?.lastActionAt)],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#0d0d14] px-4 py-3">
                  <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">{label}</div>
                  <div className="mt-1 font-mono text-[12px] text-[#f5f5f0] break-all">{value}</div>
                </div>
              ))}
            </div>
          </DashboardPanel>
        </div>

        <DashboardPanel
          title="ACTIVE_COHORT"
          subtitle="Dedicated ext-* children assigned to this registered DAO"
        >
          {metaLoading ? (
            <div className="px-4 py-6 font-mono text-[11px] text-[#4a4f5e] uppercase">LOADING_COHORT…</div>
          ) : cohort && cohort.children.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#0a0a0f]">
                    {["LABEL", "PERSPECTIVE", "STATUS", "SPAWN_REASON", "SPAWNED_AT", "VOTES"].map((header) => (
                      <th key={header} className="px-4 py-2 text-left font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohort.children.map((child) => (
                    <tr key={child.label} className="border-b border-white/[0.06] bg-[#0d0d14]">
                      <td className="px-4 py-3 font-mono text-[11px] text-[#f5f5f0]">{child.label}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-cyan-300 uppercase">{child.perspective}</td>
                      <td className="px-4 py-3">
                        <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${child.active ? "border-[#00ff88]/30 bg-[#00ff88]/5 text-[#00ff88]" : "border-white/[0.08] text-[#4a4f5e]"}`}>
                          {child.active ? "ACTIVE" : "RECALLED"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#8b92a8] uppercase">{child.spawnReason}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#8b92a8]">{formatTimestamp(child.spawnedAt)}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#f5f5f0]">{child.voteCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-6">
              <p className="font-mono text-[11px] text-[#4a4f5e] uppercase">NO_ACTIVE_COHORT</p>
              <p className="mt-2 text-[12px] text-[#8b92a8]">
                No dedicated <code className="font-mono text-[11px] text-cyan-300">ext-{normalizedSlug}-*</code> children are currently live for this DAO.
              </p>
            </div>
          )}
        </DashboardPanel>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <DashboardPanel
            title="MIRRORED_PROPOSALS"
            subtitle="Source DAO proposals currently attached to this onboarding record"
          >
            {(metaLoading || proposalsLoading) && !combinedError ? (
              <div className="space-y-3 p-4">
                {[...Array(2)].map((_, index) => (
                  <div key={index} className="h-24 animate-pulse border border-white/[0.08] bg-[#0a0a0f]" />
                ))}
              </div>
            ) : proposals.length > 0 ? (
              <div className="space-y-4 p-4">
                {proposals.map((proposal) => (
                  <ProposalCard key={proposal.uid} proposal={proposal} />
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="font-mono text-[11px] text-[#4a4f5e] uppercase">NO_MIRRORED_PROPOSALS_YET</p>
                <p className="mt-2 text-[12px] text-[#8b92a8]">
                  The swarm has not surfaced an active mirrored proposal for this DAO yet.
                </p>
              </div>
            )}
          </DashboardPanel>

          <DashboardPanel
            title="RECENT_EVENTS"
            subtitle="Most recent lifecycle actions affecting this DAO"
          >
            {events.length > 0 ? (
              <div className="divide-y divide-white/[0.06]">
                {events.slice(0, 10).map((event, index) => (
                  <div key={`${event.timestamp || "event"}-${index}`} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                        {event.type}
                      </span>
                      <span className="font-mono text-[10px] text-[#4a4f5e]">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] text-[#8b92a8]">{event.message}</p>
                    {event.txHash ? (
                      <p className="mt-2 font-mono text-[10px] text-[#4a4f5e] break-all">
                        TX: {event.txHash}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6">
                <p className="font-mono text-[11px] text-[#4a4f5e] uppercase">NO_EVENTS_YET</p>
              </div>
            )}
          </DashboardPanel>
        </div>
      </div>
    </DashboardPageFrame>
  );
}
