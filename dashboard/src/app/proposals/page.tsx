"use client";

import { useProposals } from "@/hooks/useProposals";
import { ProposalCard } from "@/components/ProposalCard";

export default function ProposalsPage() {
  const { proposals, loading, error } = useProposals();

  const activeCount = proposals.filter((p) => p.state === 1).length;

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono font-bold text-blue-400 tracking-tight">
              Proposals
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Uniswap · Lido · ENS governance on Base Sepolia
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
                <div className="text-xs text-gray-500 uppercase tracking-wider">Total</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm font-mono">Error: {error}</p>
        </div>
      )}

      {loading && (
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

      {!loading && !error && proposals.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">◈</div>
          <h2 className="font-mono text-lg text-gray-400 mb-2">No proposals yet</h2>
          <p className="text-sm text-gray-600">
            Proposals will appear when the agent creates them on MockGovernor.
          </p>
        </div>
      )}

      {!loading && proposals.length > 0 && (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.uid} proposal={proposal} />
          ))}
        </div>
      )}

      <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#0d0d14] border border-gray-800 rounded-full px-3 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" style={{ animationDuration: "2s" }} />
        <span className="text-xs font-mono text-gray-500">Live — 10s</span>
      </div>
    </div>
  );
}
