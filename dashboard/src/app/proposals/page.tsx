"use client";

import { useEffect, useState } from "react";
import { DashboardHeader, DashboardPageFrame, DashboardPanel, DashboardStatStrip } from "@/components/DashboardChrome";
import { PolymarketCard } from "@/components/PolymarketCard";
import { ProposalCard } from "@/components/ProposalCard";
import { usePolymarket } from "@/hooks/usePolymarket";
import { useProposals } from "@/hooks/useProposals";

const PAGE_SIZE = 20;

type Tab = "governance" | "polymarket";

export default function ProposalsPage() {
  const { proposals, loading, error } = useProposals();
  const { markets, loading: polyLoading, error: polyError } = usePolymarket();
  const [tab, setTab] = useState<Tab>("governance");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const activeCount = proposals.filter((proposal) => proposal.state === 1).length;
  const currentItems = tab === "governance" ? proposals : markets;
  const totalPages = Math.max(1, Math.ceil(currentItems.length / PAGE_SIZE));
  const isLoading = tab === "governance" ? loading : polyLoading;
  const currentError = tab === "governance" ? error : polyError;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <DashboardPageFrame>
      <DashboardHeader
        title="GOVERNANCE"
        subtitle="SCAN PROPOSALS FAST, OPEN DETAILS ONLY WHEN YOU NEED EVIDENCE"
      />

      <DashboardStatStrip
        stats={[
          { label: "ACTIVE", value: loading ? "—" : activeCount, tone: "green" },
          { label: "TOTAL", value: loading ? "—" : proposals.length, tone: "neutral" },
          { label: "MARKETS", value: polyLoading ? "—" : markets.length, tone: "amber" },
          { label: "PAGE", value: `${page}/${totalPages}`, tone: "blue" },
        ]}
      />

      <div className="p-4 space-y-4">
        <DashboardPanel>
          <div className="border-b border-white/[0.08] px-4 flex gap-0">
            <button
              onClick={() => setTab("governance")}
              className={`px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider border-b-2 transition-colors ${
                tab === "governance"
                  ? "text-[#00ff88] border-[#00ff88]"
                  : "text-[#4a4f5e] border-transparent hover:text-[#f5f5f0]"
              }`}
            >
              GOVERNANCE ({proposals.length})
            </button>
            <button
              onClick={() => setTab("polymarket")}
              className={`px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider border-b-2 transition-colors ${
                tab === "polymarket"
                  ? "text-[#f5a623] border-[#f5a623]"
                  : "text-[#4a4f5e] border-transparent hover:text-[#f5f5f0]"
              }`}
            >
              POLYMARKET ({markets.length})
            </button>
          </div>

          {currentError && (
            <div className="mx-4 mt-4 border border-[#ff3b3b]/30 bg-[#ff3b3b]/5 px-4 py-3">
              <p className="text-[#ff3b3b] text-[11px] font-mono uppercase">ERROR: {currentError}</p>
            </div>
          )}

          {isLoading && (
            <div className="px-4 py-4 space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="border border-white/[0.08] bg-[#0a0a0f] h-36 animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && !currentError && currentItems.length === 0 && (
            <div className="px-4 py-12 text-center">
              <div className="mb-4 text-4xl text-[#4a4f5e]">{tab === "governance" ? "◈" : "◉"}</div>
              <h2 className="font-mono text-sm text-[#4a4f5e] uppercase tracking-widest mb-2">
                {tab === "governance" ? "NO PROPOSALS YET" : "NO ACTIVE MARKETS"}
              </h2>
              <p className="text-[11px] font-mono text-[#4a4f5e]/60">
                {tab === "governance"
                  ? "PROPOSALS WILL APPEAR WHEN THE SWARM MIRRORS OR SEEDS THEM."
                  : "ACTIVE POLYMARKET MARKETS WILL APPEAR HERE."}
              </p>
            </div>
          )}

          {!isLoading && currentItems.length > 0 && (
            <>
              <div className="p-4 space-y-4">
                {tab === "governance"
                  ? proposals
                      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                      .map((proposal) => <ProposalCard key={proposal.uid} proposal={proposal} />)
                  : markets
                      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                      .map((market) => <PolymarketCard key={market.uid} market={market} />)}
              </div>

              {totalPages > 1 && (
                <div className="border-t border-white/[0.08] px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="font-mono text-[10px] text-[#4a4f5e] uppercase">
                    SHOWING {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, currentItems.length)} OF {currentItems.length}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <button
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 border border-white/[0.08] text-[#4a4f5e] hover:text-[#f5f5f0] hover:border-white/[0.16] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ← PREV
                    </button>

                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => {
                      const isNearCurrent = Math.abs(pageNumber - page) <= 2 || pageNumber === 1 || pageNumber === totalPages;
                      const showEllipsisBefore = pageNumber === page - 3 && pageNumber > 2;
                      const showEllipsisAfter = pageNumber === page + 3 && pageNumber < totalPages - 1;

                      if (showEllipsisBefore || showEllipsisAfter) {
                        return (
                          <span key={pageNumber} className="text-[#4a4f5e] px-1">
                            …
                          </span>
                        );
                      }
                      if (!isNearCurrent) return null;

                      return (
                        <button
                          key={pageNumber}
                          onClick={() => setPage(pageNumber)}
                          className={`w-8 h-8 border transition-colors ${
                            pageNumber === page
                              ? "border-[#00ff88]/40 bg-[#00ff88]/10 text-[#00ff88]"
                              : "border-white/[0.08] text-[#4a4f5e] hover:border-white/[0.16] hover:text-[#f5f5f0]"
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 border border-white/[0.08] text-[#4a4f5e] hover:text-[#f5f5f0] hover:border-white/[0.16] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      NEXT →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </DashboardPanel>

        <div className="fixed bottom-6 right-6 flex items-center gap-2 border border-white/[0.08] bg-[#0d0d14] px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" style={{ animationDuration: "2s" }} />
          <span className="text-xs font-mono text-[#4a4f5e]">Live — 30s</span>
        </div>
      </div>
    </DashboardPageFrame>
  );
}
