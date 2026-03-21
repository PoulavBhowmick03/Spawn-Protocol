"use client";

import { useMemo } from "react";
import { useSwarmData } from "@/hooks/useSwarmData";
import { useChainContext } from "@/context/ChainContext";
import { formatAddress } from "@/lib/contracts";

type SortKey = "score" | "votes" | "efficiency" | "streak";

export default function LeaderboardPage() {
  const { children, loading } = useSwarmData();
  const { explorerBase } = useChainContext();

  // Build leaderboard data from active children (vote breakdown already in ChildInfo)
  const activeChildren = children.filter((c) => c.active);
  const terminatedChildren = children.filter((c) => !c.active);

  const { sorted, totalVotes, avgAlignment, totalFor, totalAgainst } = useMemo(() => {
    const leaderboard = activeChildren.map((child) => {
      const votes = Number(child.voteCount);
      const alignment = Number(child.alignmentScore);
      const diversityScore = votes > 0 ? Math.round(((child.againstVotes + child.abstainVotes) / votes) * 100) : 0;
      const efficiency = votes > 0 ? Math.round((alignment / 100) * votes) : 0;
      const perspective = child.ensLabel.split("-").pop() || "general";

      return {
        ...child,
        votes,
        alignment,
        diversityScore,
        efficiency,
        perspective,
      };
    });

    const sorted = [...leaderboard].sort((a, b) => {
      if (b.alignment !== a.alignment) return b.alignment - a.alignment;
      return b.votes - a.votes;
    });

    return {
      sorted,
      totalVotes: sorted.reduce((sum, c) => sum + c.votes, 0),
      avgAlignment: sorted.length > 0
        ? Math.round(sorted.reduce((sum, c) => sum + c.alignment, 0) / sorted.length)
        : 0,
      totalFor: sorted.reduce((sum, c) => sum + c.forVotes, 0),
      totalAgainst: sorted.reduce((sum, c) => sum + c.againstVotes, 0),
    };
  }, [activeChildren]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-mono font-bold text-green-400 tracking-tight">
          Agent Leaderboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Performance ranking across all active governance agents
        </p>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Active Agents" value={sorted.length} color="green" />
        <StatCard label="Total Votes" value={totalVotes} color="blue" />
        <StatCard label="Avg Alignment" value={`${avgAlignment}/100`} color="yellow" />
        <StatCard label="FOR Votes" value={totalFor} color="green" />
        <StatCard label="AGAINST Votes" value={totalAgainst} color="red" />
      </div>

      {/* Leaderboard Table */}
      {loading ? (
        <div className="text-gray-500 font-mono text-sm animate-pulse">Loading agents...</div>
      ) : (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Rank</th>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">Perspective</th>
                <th className="px-4 py-3 text-center">Alignment</th>
                <th className="px-4 py-3 text-center">Votes</th>
                <th className="px-4 py-3 text-center">FOR</th>
                <th className="px-4 py-3 text-center">AGAINST</th>
                <th className="px-4 py-3 text-center">Diversity</th>
                <th className="px-4 py-3 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((agent, idx) => {
                // Composite score: 60% alignment + 30% votes + 10% diversity
                const compositeScore = Math.round(
                  agent.alignment * 0.6 +
                  Math.min(agent.votes, 100) * 0.3 +
                  agent.diversityScore * 0.1
                );

                return (
                  <tr
                    key={agent.ensLabel}
                    className={`border-t border-gray-800/60 transition-colors ${
                      idx === 0
                        ? "bg-yellow-400/5"
                        : idx === 1
                        ? "bg-gray-400/5"
                        : idx === 2
                        ? "bg-orange-400/5"
                        : "hover:bg-gray-900/50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className={`text-lg ${
                        idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-300" : idx === 2 ? "text-orange-400" : "text-gray-600"
                      }`}>
                        {idx === 0 ? "1st" : idx === 1 ? "2nd" : idx === 2 ? "3rd" : `${idx + 1}th`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/agent/${agent.id}`}
                        className="text-green-400 hover:text-green-300 hover:underline"
                      >
                        {agent.ensLabel}
                      </a>
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        <a
                          href={`${explorerBase}/address/${agent.childAddr}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-gray-400"
                        >
                          {formatAddress(agent.childAddr)}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        agent.perspective === "defi"
                          ? "bg-blue-400/10 text-blue-400 border border-blue-400/20"
                          : agent.perspective === "publicgoods"
                          ? "bg-purple-400/10 text-purple-400 border border-purple-400/20"
                          : agent.perspective === "conservative"
                          ? "bg-orange-400/10 text-orange-400 border border-orange-400/20"
                          : "bg-gray-400/10 text-gray-400 border border-gray-400/20"
                      }`}>
                        {agent.perspective}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${
                        agent.alignment >= 70 ? "text-green-400" : agent.alignment >= 45 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {agent.alignment}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">{agent.votes}</td>
                    <td className="px-4 py-3 text-center text-green-400">{Number(agent.forVotes)}</td>
                    <td className="px-4 py-3 text-center text-red-400">{Number(agent.againstVotes)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`${agent.diversityScore > 20 ? "text-purple-400" : "text-gray-500"}`}>
                        {agent.diversityScore}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-white font-bold">{compositeScore}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Terminated Agents Summary */}
      {terminatedChildren.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-mono text-red-400 mb-3">
            Terminated Agents ({terminatedChildren.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {terminatedChildren.slice(0, 12).map((child) => (
              <div
                key={child.ensLabel}
                className="border border-red-900/30 rounded-lg p-3 bg-red-400/5"
              >
                <div className="text-xs text-gray-500 font-mono truncate">{child.ensLabel}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-red-400 text-xs font-bold">
                    {Number(child.alignmentScore)}/100
                  </span>
                  <span className="text-gray-600 text-xs">
                    {Number(child.voteCount)} votes
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    green: "text-green-400",
    blue: "text-blue-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    purple: "text-purple-400",
  };
  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-gray-900/30">
      <div className={`text-2xl font-mono font-bold ${colorMap[color] || "text-white"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
