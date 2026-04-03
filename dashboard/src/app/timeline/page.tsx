"use client";

import { useState, useEffect } from "react";
import { useTimeline } from "@/hooks/useTimeline";
import { TimelineItem } from "@/components/TimelineItem";

const PAGE_SIZE = 20;

export default function TimelinePage() {
  const { events, loading, error } = useTimeline();
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));

  // Auto-advance to last page when new events push us over the limit
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const paginated = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-mono font-bold text-purple-400 tracking-tight">
              Timeline
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Recent chronological feed of swarm and onchain activity
            </p>
          </div>
          {!loading && events.length > 0 && (
            <div className="text-center">
              <div className="text-3xl font-mono font-bold text-purple-400">
                {events.length}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Recent Events</div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-x-4 gap-y-2 flex-wrap mb-6 text-xs font-mono">
        <span className="flex items-center gap-1.5 text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Spawned
        </span>
        <span className="flex items-center gap-1.5 text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          Terminated
        </span>
        <span className="flex items-center gap-1.5 text-blue-400">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          Vote
        </span>
        <span className="flex items-center gap-1.5 text-purple-400">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          Alignment
        </span>
        <span className="flex items-center gap-1.5 text-cyan-400">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          Revealed
        </span>
        <span className="flex items-center gap-1.5 text-yellow-400">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          Values
        </span>
        <span className="flex items-center gap-1.5 text-orange-400">
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          Reallocated
        </span>
      </div>

      {error && (
        <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm font-mono">Error: {error}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-800 flex-none" />
              <div className="flex-1 border border-gray-800 rounded-lg p-3 bg-[#0d0d14]">
                <div className="h-3 bg-gray-800 rounded w-1/4 mb-2" />
                <div className="h-4 bg-gray-800 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">≡</div>
          <h2 className="font-mono text-lg text-gray-400 mb-2">No events yet</h2>
          <p className="text-sm text-gray-600">
            Events will appear as the agent swarm operates.
          </p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <>
          <div className="space-y-3">
            {paginated.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2 font-mono text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:border-purple-500 hover:text-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                        ? "border-purple-500 bg-purple-500/10 text-purple-400"
                        : "border-gray-700 text-gray-500 hover:border-purple-500/50 hover:text-purple-400"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:border-purple-500 hover:text-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>

              <span className="ml-4 text-gray-600 text-xs">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, events.length)} of {events.length}
              </span>
            </div>
          )}
        </>
      )}

      <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#0d0d14] border border-gray-800 rounded-full px-3 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" style={{ animationDuration: "2s" }} />
        <span className="text-xs font-mono text-gray-500">Live — 30s</span>
      </div>
    </div>
  );
}
