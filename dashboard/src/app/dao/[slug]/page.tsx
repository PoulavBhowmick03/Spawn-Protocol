"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ProposalCard } from "@/components/ProposalCard";
import { useProposals } from "@/hooks/useProposals";

type RegisteredDAO = {
  id: string;
  slug: string;
  name: string;
  source: "tally" | "snapshot";
  sourceRef: string;
  philosophy: string;
  contact: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "pending";
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function DaoDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const normalizedSlug = slug.trim().toLowerCase();
  const { proposals, loading, error } = useProposals({ daoSlug: normalizedSlug });
  const [dao, setDao] = useState<RegisteredDAO | null>(null);
  const [daoError, setDaoError] = useState<string | null>(null);
  const [daoLoading, setDaoLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDaoLoading(true);
    setDaoError(null);

    (async () => {
      try {
        const res = await fetch("/api/daos", { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || `API ${res.status}`);
        const match = (payload.daos as RegisteredDAO[]).find((entry) => entry.slug === normalizedSlug);
        if (!match) {
          throw new Error(`DAO not found: ${normalizedSlug}`);
        }
        if (!cancelled) {
          setDao(match);
          setDaoError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDao(null);
          setDaoError(err instanceof Error ? err.message : "Failed to fetch DAO");
        }
      } finally {
        if (!cancelled) {
          setDaoLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [normalizedSlug]);

  const totalAgentVotes = proposals.reduce(
    (sum, proposal) =>
      sum + Number(proposal.forVotes) + Number(proposal.againstVotes) + Number(proposal.abstainVotes),
    0
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <Link href="/proposals" className="text-xs font-mono text-gray-500 hover:text-gray-300">
          ← Back to proposals
        </Link>

        {dao && (
          <>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-emerald-400/30 bg-emerald-400/5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                    Registered via Spawn Protocol
                  </span>
                  <span className="rounded border border-blue-400/30 bg-blue-400/5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-blue-300">
                    Advisory Mode
                  </span>
                </div>
                <h1 className="text-2xl font-mono font-bold tracking-tight text-cyan-300">
                  {dao.name}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  External DAO proposals mirrored into the shared Spawn simulation layer.
                </p>
              </div>

              <div className="flex gap-6 text-center">
                <div>
                  <div className="text-3xl font-mono font-bold text-cyan-300">
                    {loading ? "…" : proposals.length}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-gray-500">Proposals</div>
                </div>
                <div>
                  <div className="text-3xl font-mono font-bold text-green-400">
                    {loading ? "…" : totalAgentVotes}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-gray-500">Agent Votes</div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs font-mono text-gray-500">
              <span>Source: {dao.source === "tally" ? "Tally" : "Snapshot"}</span>
              <span>Ref: {dao.sourceRef}</span>
              <span>Registered: {new Date(dao.createdAt).toLocaleString()}</span>
              <span>Philosophy: {dao.philosophy || "neutral"}</span>
            </div>
          </>
        )}
      </div>

      {(daoError || error) && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-mono text-red-400">Error: {daoError || error}</p>
        </div>
      )}

      {(daoLoading || loading) && !daoError && (
        <div className="space-y-4">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4 animate-pulse">
              <div className="mb-3 h-4 w-1/3 rounded bg-gray-800" />
              <div className="mb-2 h-3 w-full rounded bg-gray-800" />
              <div className="h-2 w-full rounded bg-gray-800" />
            </div>
          ))}
        </div>
      )}

      {!daoLoading && !loading && dao && proposals.length === 0 && !error && (
        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] p-10 text-center">
          <h2 className="font-mono text-lg text-gray-300">No mirrored proposals yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Spawn will surface proposals for this DAO after the next discovery poll.
          </p>
        </div>
      )}

      {!daoLoading && !loading && proposals.length > 0 && (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.uid} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}
