"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSwarmData } from "@/hooks/useSwarmData";
import { useChainContext } from "@/context/ChainContext";
import { formatAddress } from "@/lib/contracts";

export default function LeaderboardPage() {
  const { children, loading } = useSwarmData({ includeMeta: false });
  const { explorerBase } = useChainContext();

  const activeChildren = children.filter((c) => c.active);
  const terminatedChildren = children.filter((c) => !c.active);

  const { sorted, totalVotes, avgAlignment, totalFor, totalAgainst } = useMemo(() => {
    const leaderboard = activeChildren.map((child) => {
      const votes = Number(child.voteCount);
      const alignment = Number(child.alignmentScore);
      const diversityScore = votes > 0 ? Math.round(((child.againstVotes + child.abstainVotes) / votes) * 100) : 0;
      const perspective = child.ensLabel.split("-").pop() || "general";
      return { ...child, votes, alignment, diversityScore, perspective };
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
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <h1 className="font-mono text-sm font-bold text-[#f5f5f0] uppercase tracking-widest">LEADERBOARD</h1>
        <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">RANKED: ALIGNMENT × VOTES × DIVERSITY</span>
      </div>

      {/* Stat strip */}
      <div className="border-b border-white/[0.08] grid grid-cols-2 sm:grid-cols-5">
        {[
          { label: "ACTIVE_AGENTS", value: sorted.length, color: "text-[#00ff88]" },
          { label: "TOTAL_VOTES", value: totalVotes, color: "text-[#f5f5f0]" },
          { label: "AVG_ALIGNMENT", value: `${avgAlignment}/100`, color: avgAlignment >= 70 ? "text-[#00ff88]" : avgAlignment >= 40 ? "text-[#f5a623]" : "text-[#ff3b3b]" },
          { label: "FOR_VOTES", value: totalFor, color: "text-[#00ff88]" },
          { label: "AGAINST_VOTES", value: totalAgainst, color: "text-[#ff3b3b]" },
        ].map((stat, i) => (
          <div key={stat.label} className={`px-6 py-4 ${i < 4 ? "border-r border-white/[0.08]" : ""}`}>
            <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">{stat.label}</div>
            <div className={`font-mono text-2xl font-bold leading-none ${stat.color}`}>
              {loading ? "—" : stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="px-4 py-4 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-9 bg-white/[0.05] animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="border border-white/[0.08] m-4 p-12 text-center">
          <div className="mb-4 text-4xl text-[#4a4f5e]">▲</div>
          <h2 className="font-mono text-sm text-[#4a4f5e] uppercase tracking-widest">NO ACTIVE AGENTS</h2>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-mono min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.08]">
                {["RANK", "AGENT_ID", "PERSPECTIVE", "ALIGNMENT", "VOTES", "FOR", "AGAINST", "DIVERSITY", "COMPOSITE"].map((h, i) => (
                  <th key={h} className={`px-4 py-2 font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest ${i > 2 ? "text-center" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((agent, idx) => {
                const compositeScore = Math.round(
                  agent.alignment * 0.6 +
                  Math.min(agent.votes, 100) * 0.3 +
                  agent.diversityScore * 0.1
                );
                const alignColor = agent.alignment >= 70 ? "text-[#00ff88]" : agent.alignment >= 45 ? "text-[#f5a623]" : "text-[#ff3b3b]";
                const rankStyle = idx === 0
                  ? "border-l-2 border-[#00ff88] bg-[#00ff88]/[0.03]"
                  : idx === 1
                  ? "border-l-2 border-[#f5f5f0]/30"
                  : idx === 2
                  ? "border-l-2 border-[#f5a623]/30"
                  : "";

                return (
                  <tr
                    key={agent.childAddr}
                    className={`border-b border-white/[0.08] ${idx % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]"} ${rankStyle} hover:bg-white/[0.02] transition-colors`}
                  >
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-bold ${idx === 0 ? "text-[#00ff88]" : idx <= 2 ? "text-[#f5f5f0]/60" : "text-[#4a4f5e]"}`}>
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/agent/${agent.id}`} className="text-[11px] text-[#00ff88] hover:text-white transition-colors">
                        {agent.ensLabel}
                      </Link>
                      <div className="text-[10px] text-[#4a4f5e] mt-0.5">
                        <a href={`${explorerBase}/address/${agent.childAddr}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#f5f5f0] transition-colors">
                          {formatAddress(agent.childAddr)}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 text-[9px] border border-white/[0.08] text-[#4a4f5e] uppercase">
                        {agent.perspective}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[11px] font-bold ${alignColor}`}>{agent.alignment}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-[11px] text-[#f5f5f0]/70">{agent.votes}</td>
                    <td className="px-4 py-2.5 text-center text-[11px] text-[#00ff88]/80">{Number(agent.forVotes)}</td>
                    <td className="px-4 py-2.5 text-center text-[11px] text-[#ff3b3b]/80">{Number(agent.againstVotes)}</td>
                    <td className="px-4 py-2.5 text-center text-[11px] text-[#4a4f5e]">{agent.diversityScore}%</td>
                    <td className="px-4 py-2.5 text-center text-[11px] font-bold text-[#f5f5f0]">{compositeScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 font-mono text-[10px] text-[#4a4f5e] border-t border-white/[0.08]">
            COMPOSITE_SCORE = ALIGNMENT × 0.6 + VOTES × 0.3 + DIVERSITY × 0.1
          </p>
        </div>
      )}

      {/* Terminated Agents */}
      {terminatedChildren.length > 0 && (
        <div className="border-t border-white/[0.08] p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-[#ff3b3b]/60" />
            <span className="font-mono text-[10px] text-[#ff3b3b]/60 uppercase tracking-widest">
              TERMINATED_AGENTS ({terminatedChildren.length})
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {terminatedChildren.slice(0, 12).map((child) => (
              <div key={child.ensLabel} className="border border-white/[0.08] bg-[#0d0d14] px-3 py-2 opacity-50">
                <div className="font-mono text-[10px] text-[#4a4f5e] truncate">{child.ensLabel}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[10px] text-[#ff3b3b]">{Number(child.alignmentScore)}/100</span>
                  <span className="font-mono text-[10px] text-[#4a4f5e]">{Number(child.voteCount)}v</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
