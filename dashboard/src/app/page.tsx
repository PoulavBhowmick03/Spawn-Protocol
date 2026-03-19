"use client";

import { useSwarmData } from "@/hooks/useSwarmData";
import { AgentCard } from "@/components/AgentCard";
import { CONTRACTS, CELO_CONTRACTS, explorerAddress, formatAddress } from "@/lib/contracts";
import { useChainContext } from "@/context/ChainContext";

export default function SwarmPage() {
  const { children, loading, error, justVotedSet } = useSwarmData();
  const { chainId, explorerBase } = useChainContext();
  const activeContracts = chainId === "celo" ? CELO_CONTRACTS : CONTRACTS;
  const chainLabel = chainId === "base" ? "Base Sepolia" : "Celo Alfajores";

  const activeCount = children.filter((c) => c.active).length;
  const totalCount = children.length;
  const totalVotes = children.reduce((sum, c) => sum + Number(c.voteCount), 0);
  const avgAlignment = activeCount > 0
    ? Math.round(children.filter((c) => c.active).reduce((sum, c) => sum + Number(c.alignmentScore), 0) / activeCount)
    : 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-mono font-bold text-green-400 tracking-tight">
              Agent Swarm
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Autonomous DAO governance agents — {chainLabel}
            </p>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <div className="text-3xl font-mono font-bold text-green-400">
                {loading ? "…" : activeCount}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Active</div>
            </div>
            <div>
              <div className="text-3xl font-mono font-bold text-blue-400">
                {loading ? "…" : totalVotes}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Votes</div>
            </div>
            <div>
              <div className={`text-3xl font-mono font-bold ${avgAlignment >= 70 ? "text-green-400" : avgAlignment >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                {loading ? "…" : `${avgAlignment}%`}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Alignment</div>
            </div>
            <div>
              <div className="text-3xl font-mono font-bold text-gray-400">
                {loading ? "…" : totalCount}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Total</div>
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-xs font-mono text-gray-600 mt-4 flex-wrap">
          <span>
            SpawnFactory:{" "}
            <a href={`${explorerBase}/address/${activeContracts.SpawnFactory.address}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
              {formatAddress(activeContracts.SpawnFactory.address)}
            </a>
          </span>
          {chainId === "base" && (
            <span>
              MockGovernor:{" "}
              <a href={explorerAddress(CONTRACTS.MockGovernor.address)} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
                {formatAddress(CONTRACTS.MockGovernor.address)}
              </a>
            </span>
          )}
          <span>
            ParentTreasury:{" "}
            <a href={`${explorerBase}/address/${activeContracts.ParentTreasury.address}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
              {formatAddress(activeContracts.ParentTreasury.address)}
            </a>
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm font-mono">Error: {error}</p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14] animate-pulse">
              <div className="h-4 bg-gray-800 rounded mb-3 w-2/3" />
              <div className="h-3 bg-gray-800 rounded mb-2 w-full" />
              <div className="h-3 bg-gray-800 rounded mb-4 w-1/2" />
              <div className="h-2 bg-gray-800 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && children.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">⬡</div>
          <h2 className="font-mono text-lg text-gray-400 mb-2">No agents spawned yet</h2>
          <p className="text-sm text-gray-600">The parent agent will spawn children when proposals are detected.</p>
          <p className="text-xs font-mono text-gray-700 mt-4">Polling SpawnFactory @ {formatAddress(activeContracts.SpawnFactory.address)}</p>
        </div>
      )}

      {!loading && children.length > 0 && (
        <>
          {children.filter((c) => c.active).length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">
                Active Agents ({children.filter((c) => c.active).length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {children.filter((c) => c.active).map((child) => (
                  <AgentCard key={child.childAddr} child={child} justVoted={justVotedSet.has(child.childAddr)} />
                ))}
              </div>
            </div>
          )}
          {children.filter((c) => !c.active).length > 0 && (
            <div>
              <h2 className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">
                Terminated Agents ({children.filter((c) => !c.active).length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-60">
                {children.filter((c) => !c.active).map((child) => (
                  <AgentCard key={child.childAddr} child={child} justVoted={justVotedSet.has(child.childAddr)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#0d0d14] border border-gray-800 rounded-full px-3 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" style={{ animationDuration: "2s" }} />
        <span className="text-xs font-mono text-gray-500">Live — 10s</span>
      </div>
    </div>
  );
}
