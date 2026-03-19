"use client";

import { useTimeline } from "@/hooks/useTimeline";
import { TimelineItem } from "@/components/TimelineItem";

export default function TimelinePage() {
  const { events, loading, error } = useTimeline();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-mono font-bold text-purple-400 tracking-tight">
          Timeline
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Chronological feed of all onchain events
        </p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap mb-6 text-xs font-mono">
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
        <div className="space-y-3">
          {events.map((event) => (
            <TimelineItem key={event.id} event={event} />
          ))}
        </div>
      )}

      <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#0d0d14] border border-gray-800 rounded-full px-3 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" style={{ animationDuration: "2s" }} />
        <span className="text-xs font-mono text-gray-500">Live — 10s</span>
      </div>
    </div>
  );
}
