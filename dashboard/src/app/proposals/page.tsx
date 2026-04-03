"use client";

import { useState, useEffect } from "react";
import { useProposals } from "@/hooks/useProposals";
import { usePolymarket } from "@/hooks/usePolymarket";
import { ProposalCard } from "@/components/ProposalCard";
import { PolymarketCard } from "@/components/PolymarketCard";

const PAGE_SIZE = 20;

type Tab = "governance" | "polymarket";

export default function ProposalsPage() {
  const { proposals, loading, error } = useProposals();
  const { markets, loading: polyLoading, error: polyError } = usePolymarket();
  const [tab, setTab] = useState<Tab>("governance");
  const [page, setPage] = useState(1);

  // Reset page on tab change
  useEffect(() => {
    setPage(1);
  }, [tab]);

  const activeCount = proposals.filter((p) => p.state === 1).length;

  const currentItems = tab === "governance" ? proposals : markets;
  const totalPages = Math.max(1, Math.ceil(currentItems.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const isLoading = tab === "governance" ? loading : polyLoading;
  const currentError = tab === "governance" ? error : polyError;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-mono font-bold text-blue-400 tracking-tight">
              Proposals
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Recent Uniswap · Lido · ENS · Polymarket activity on Base Sepolia
            </p>
          </div>
          {!loading && (
            <div className="flex gap-6 text-center">
              <div>
                <div className="text-3xl font-mono font-bold text-blue-400">
                  {activeCount}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Active</div>
              </div>
              <div>
                <div className="text-3xl font-mono font-bold text-gray-400">
                  {proposals.length}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Recent</div>
              </div>
              <div>
                <div className="text-3xl font-mono font-bold text-orange-400">
                  {markets.length}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Markets</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border border-gray-800 rounded-lg p-1 w-fit bg-[#0a0a12]">
        <button
          onClick={() => setTab("governance")}
          className={`px-4 py-2 rounded-md text-sm font-mono transition-colors ${
            tab === "governance"
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
              : "text-gray-500 hover:text-gray-300 border border-transparent"
          }`}
        >
          Governance ({proposals.length})
        </button>
        <button
          onClick={() => setTab("polymarket")}
          className={`px-4 py-2 rounded-md text-sm font-mono transition-colors ${
            tab === "polymarket"
              ? "bg-orange-500/10 text-orange-400 border border-orange-500/30"
              : "text-gray-500 hover:text-gray-300 border border-transparent"
          }`}
        >
          Polymarket ({markets.length})
        </button>
      </div>

      {currentError && (
        <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm font-mono">Error: {currentError}</p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14] animate-pulse">
              <div className="h-4 bg-gray-800 rounded mb-3 w-1/3" />
              <div className="h-3 bg-gray-800 rounded mb-2 w-full" />
              <div className="h-2 bg-gray-800 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !currentError && currentItems.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">{tab === "governance" ? "◈" : "◉"}</div>
          <h2 className="font-mono text-lg text-gray-400 mb-2">
            {tab === "governance" ? "No proposals yet" : "No active markets"}
          </h2>
          <p className="text-sm text-gray-600">
            {tab === "governance"
              ? "Proposals will appear when the agent creates them on MockGovernor."
              : "Active Polymarket prediction markets will appear here."}
          </p>
        </div>
      )}

      {!isLoading && currentItems.length > 0 && (
        <>
          <div className="space-y-4">
            {tab === "governance"
              ? proposals
                  .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                  .map((proposal) => (
                    <ProposalCard key={proposal.uid} proposal={proposal} />
                  ))
              : markets
                  .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                  .map((market) => (
                    <PolymarketCard key={market.uid} market={market} />
                  ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2 font-mono text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:border-blue-500 hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const isNearCurrent = Math.abs(p - page) <= 2 || p === 1 || p === totalPages;
                const showEllipsisBefore = p === page - 3 && p > 2;
                const showEllipsisAfter = p === page + 3 && p < totalPages - 1;

                if (showEllipsisBefore || showEllipsisAfter) {
                  return (
                    <span key={p} className="text-gray-600 px-1">…</span>
                  );
                }
                if (!isNearCurrent) return null;

                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded border transition-colors ${
                      p === page
                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                        : "border-gray-700 text-gray-500 hover:border-blue-500/50 hover:text-blue-400"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:border-blue-500 hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>

              <span className="ml-4 text-gray-600 text-xs">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, currentItems.length)} of {currentItems.length}
              </span>
            </div>
          )}
        </>
      )}

      <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#0d0d14] border border-gray-800 rounded-full px-3 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" style={{ animationDuration: "2s" }} />
        <span className="text-xs font-mono text-gray-500">
          Live — 30s
        </span>
      </div>
    </div>
  );
}
