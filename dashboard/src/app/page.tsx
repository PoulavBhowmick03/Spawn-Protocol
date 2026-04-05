"use client";

import { type Address } from "viem";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSwarmData, useSwarmMeta, type ChildInfo } from "@/hooks/useSwarmData";
import { useTimeline } from "@/hooks/useTimeline";
import {
  CONTRACTS,
  explorerAddress,
  formatAddress,
  storageViewerPath,
  governorName,
  ensName,
} from "@/lib/contracts";
import { useChainContext } from "@/context/ChainContext";

const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;

// Deterministic reasoning log lines per agent based on score + votes
function reasoningLines(child: ChildInfo): string[] {
  const score = Number(child.alignmentScore);
  const votes = Number(child.voteCount);
  const daoLabel = governorName(child.governance) ?? formatAddress(child.governance);

  const lines: string[] = [
    `> MONITORING_DAO: ${daoLabel}`,
    `> PROPOSALS_SCANNED: ${votes > 0 ? votes + 2 : 0}`,
  ];

  if (score >= 70) {
    lines.push("> GOVERNANCE_VALUES: FULLY_ALIGNED");
    lines.push("> VOTE_STRATEGY: CONSENSUS_REINFORCEMENT");
  } else if (score >= 40) {
    lines.push("> GOVERNANCE_VALUES: PARTIAL_MATCH (DRIFT_DETECTED)");
    lines.push("> VOTE_STRATEGY: RECALIBRATING_PRIORS");
  } else {
    lines.push("> GOVERNANCE_VALUES: CONFLICT_DETECTED");
    lines.push("> VOTE_STRATEGY: ADVERSARIAL_OVERRIDE_RISK");
  }

  if (votes > 0) {
    lines.push(`> VOTES_CAST: ${votes} / FOR:${child.forVotes} AGAINST:${child.againstVotes}`);
  } else {
    lines.push("> VOTES_CAST: 0 — AWAITING_PROPOSALS");
  }

  return lines;
}

function MissionCard({
  child,
  index,
  isVoting,
}: {
  child: ChildInfo;
  index: number;
  isVoting: boolean;
}) {
  const score = Number(child.alignmentScore);
  const status = isVoting
    ? "voting"
    : score >= 70
    ? "aligned"
    : score >= 40
    ? "drifting"
    : "misaligned";

  const cfg = {
    aligned: {
      border: "border-l-2 border-l-[#00ff88]",
      bg: "bg-[#00ff88]/[0.03]",
      glow: "status-glow-green",
      scoreColor: "text-[#00ff88]",
      barColor: "bg-[#00ff88]",
      badge: "text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/30",
      label: "ALIGNED",
      dot: "bg-[#00ff88]",
    },
    drifting: {
      border: "border-l-2 border-l-[#f5a623]",
      bg: "bg-[#f5a623]/[0.03]",
      glow: "status-glow-amber",
      scoreColor: "text-[#f5a623]",
      barColor: "bg-[#f5a623]",
      badge: "text-[#f5a623] bg-[#f5a623]/10 border-[#f5a623]/30",
      label: "DRIFTING",
      dot: "bg-[#f5a623]",
    },
    misaligned: {
      border: "border-l-2 border-l-[#ff3b3b]",
      bg: "bg-[#ff3b3b]/[0.03]",
      glow: "status-glow-red",
      scoreColor: "text-[#ff3b3b]",
      barColor: "bg-[#ff3b3b]",
      badge: "text-[#ff3b3b] bg-[#ff3b3b]/10 border-[#ff3b3b]/30",
      label: "MISALIGNED",
      dot: "bg-[#ff3b3b]",
    },
    voting: {
      border: "border-l-2 border-l-blue-400",
      bg: "bg-blue-400/[0.05]",
      glow: "status-glow-blue",
      scoreColor: score >= 70 ? "text-[#00ff88]" : score >= 40 ? "text-[#f5a623]" : "text-[#ff3b3b]",
      barColor: score >= 70 ? "bg-[#00ff88]" : score >= 40 ? "bg-[#f5a623]" : "bg-[#ff3b3b]",
      badge: "text-blue-400 bg-blue-400/15 border-blue-400/40 animate-pulse",
      label: "VOTING",
      dot: "bg-blue-400",
    },
  }[status];

  const agentDisplay = ensName(child.ensLabel) ?? formatAddress(child.childAddr);
  const daoName = governorName(child.governance) ?? formatAddress(child.governance);
  const lines = reasoningLines(child);

  return (
    <Link href={`/agent/${child.id.toString()}`} className="block">
      <div
        className={`border border-white/[0.08] ${cfg.bg} ${cfg.border} ${cfg.glow} hover:brightness-110 transition-all`}
      >
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ${status === "voting" || status === "aligned" || status === "drifting" ? "animate-pulse" : ""}`}
            />
            <span className="font-mono text-[11px] font-bold text-[#f5f5f0] tracking-wider">
              {agentDisplay}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-mono uppercase tracking-wider border px-2 py-0.5 ${cfg.badge}`}>
              {cfg.label}
            </span>
            <span className="font-mono text-[10px] text-[#4a4f5e]">
              #{child.id.toString().padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* DAO target */}
        <div className="px-4 pt-2.5 pb-1">
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
            TARGET_DAO:{" "}
          </span>
          <span className="font-mono text-[10px] text-[#f5f5f0]/60">{daoName}</span>
        </div>

        {/* Terminal reasoning log */}
        <div className="px-4 py-2 space-y-0.5">
          {lines.map((line, i) => (
            <div key={i} className="font-mono text-[10px] text-[#4a4f5e] leading-5">
              {line}
            </div>
          ))}
        </div>

        {/* Confidence bar + score */}
        <div className="px-4 pb-3 pt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[9px] text-[#4a4f5e] uppercase tracking-widest">
              CONFIDENCE
            </span>
            <span className={`font-mono text-[11px] font-bold tabular-nums ${cfg.scoreColor}`}>
              {score}%
            </span>
          </div>
          <div className="h-1 bg-white/[0.08] w-full">
            <div
              className={`h-full ${cfg.barColor} ${status === "voting" ? "shadow-[0_0_12px_rgba(96,165,250,0.3)]" : ""} transition-all duration-700`}
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

// Live clock for status bar
function useClock() {
  const [time, setTime] = useState(() => new Date().toUTCString().slice(17, 25));
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toUTCString().slice(17, 25)), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function SwarmPage() {
  const { children, loading, error, justVotedSet } = useSwarmData({ includeMeta: false });
  const { meta } = useSwarmMeta();
  const { events: timelineEvents, loading: timelineLoading } = useTimeline();
  const { explorerBase } = useChainContext();
  const time = useClock();

  const {
    budgetState,
    delegationHashes,
    revokedDelegations,
    filecoinIdentityCids,
    erc8004Ids,
    filecoinStateCid,
  } = meta;

  const activeChildren = children.filter((c) => c.active);
  const terminatedChildren = children.filter((c) => !c.active);
  const activeCount = activeChildren.length;
  const totalVotes = children.reduce((sum, c) => sum + Number(c.voteCount), 0);
  const avgAlignment =
    activeCount > 0
      ? Math.round(
          activeChildren.reduce((sum, c) => sum + Number(c.alignmentScore), 0) / activeCount
        )
      : 0;

  const activeDelegations = Array.from(delegationHashes.keys()).filter((label) =>
    new Set(activeChildren.map((c) => c.ensLabel)).has(label)
  ).length;
  const revokedDelegationCount = Array.from(revokedDelegations).filter((label) =>
    new Set(activeChildren.map((c) => c.ensLabel)).has(label)
  ).length;

  const avgAlignmentColor =
    avgAlignment >= 70 ? "text-[#00ff88]" : avgAlignment >= 40 ? "text-[#f5a623]" : "text-[#ff3b3b]";

  const sysHealth = avgAlignment >= 70 ? "OPTIMAL" : avgAlignment >= 40 ? "DEGRADED" : "CRITICAL";
  const sysHealthColor =
    avgAlignment >= 70 ? "text-[#00ff88]" : avgAlignment >= 40 ? "text-[#f5a623]" : "text-[#ff3b3b]";

  const budgetPolicyColor =
    !budgetState || budgetState.context === "unavailable"
      ? "bg-[#4a4f5e]"
      : budgetState.policy === "paused"
      ? "bg-[#ff3b3b]"
      : budgetState.policy === "throttled"
      ? "bg-[#f5a623]"
      : "bg-[#00ff88]";

  // Recent VoteCast events for live log
  const recentVotes = timelineEvents
    .filter((e) => e.type === "VoteCast")
    .slice(0, 20);

  const latestBlock = timelineEvents.length > 0
    ? timelineEvents[0].blockNumber.toString()
    : "—";

  return (
    <div className="min-h-screen flex flex-col pb-8">
      {/* Ticker strip */}
      <div className="border-b border-white/[0.08] px-4 py-1.5 flex items-center gap-6 overflow-x-auto bg-[#0a0a0f] flex-shrink-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            UNISWAP_CORE: <span className="text-[#00ff88]">SYNC_ACTIVE</span>
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            ENS_REGISTRY: <span className="text-[#f5f5f0]/60">STABLE</span>
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${budgetPolicyColor}`} />
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            BUDGET:{" "}
            <span
              className={
                budgetState?.policy === "normal"
                  ? "text-[#00ff88]"
                  : budgetState?.policy === "throttled"
                  ? "text-[#f5a623]"
                  : "text-[#ff3b3b]"
              }
            >
              {budgetState?.context === "unavailable"
                ? "UNAVAILABLE"
                : (budgetState?.policy?.toUpperCase() ?? "LOADING")}
            </span>
          </span>
        </div>
        {filecoinStateCid && (
          <a
            href={storageViewerPath(filecoinStateCid)}
            className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
              FILECOIN: <span className="text-blue-400">{filecoinStateCid.slice(0, 10)}… ↗</span>
            </span>
          </a>
        )}
        <div className="ml-auto flex-shrink-0">
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            SPAWNS: <span className="text-[#f5f5f0]/80">{children.length}</span>
          </span>
        </div>
      </div>

      {/* Stat strip */}
      <div className="border-b border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 flex-shrink-0">
        <div className="border-r border-white/[0.08] px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">
            ACTIVE_AGENTS
          </div>
          <div className="font-mono text-3xl font-bold text-[#00ff88] leading-none">
            {loading ? "—" : activeCount}
          </div>
        </div>
        <div className="border-r border-white/[0.08] px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">
            TOTAL_VOTES_CAST
          </div>
          <div className="font-mono text-3xl font-bold text-[#f5f5f0] leading-none">
            {loading ? "—" : totalVotes}
          </div>
        </div>
        <div className="border-r border-white/[0.08] px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">
            AVG_ALIGNMENT
          </div>
          <div className={`font-mono text-3xl font-bold leading-none ${avgAlignmentColor}`}>
            {loading ? "—" : `${avgAlignment}%`}
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">
            DELEGATIONS
          </div>
          <div className="font-mono text-3xl font-bold text-[#f5f5f0] leading-none">
            {loading ? "—" : activeDelegations}
            {revokedDelegationCount > 0 && (
              <span className="text-[#ff3b3b] text-lg ml-2 font-normal">
                -{revokedDelegationCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 border border-[#ff3b3b]/30 bg-[#ff3b3b]/5 px-4 py-3 flex-shrink-0">
          <p className="text-[11px] font-mono text-[#ff3b3b] uppercase">ERROR: {error}</p>
        </div>
      )}

      {/* Main two-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT: ACTIVE MISSIONS */}
        <div className="flex-1 min-w-0 border-r border-white/[0.08] overflow-y-auto">
          {/* Section header */}
          <div className="sticky top-0 z-10 border-b border-white/[0.08] px-4 py-2.5 bg-[#0a0a0f] flex items-center justify-between">
            <div>
              <span className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                ACTIVE_MISSIONS
              </span>
              <span className="font-mono text-[10px] text-[#4a4f5e]/50 ml-3">
                // CURRENTLY_REASONING_AGENTS // RECURSION_DEPTH:{" "}
                {String(activeCount).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {activeChildren.filter((c) => Number(c.alignmentScore) >= 70).length > 0 && (
                <span className="font-mono text-[10px] text-[#00ff88] uppercase">
                  ● {activeChildren.filter((c) => Number(c.alignmentScore) >= 70).length} ALIGNED
                </span>
              )}
              {activeChildren.filter(
                (c) => Number(c.alignmentScore) >= 40 && Number(c.alignmentScore) < 70
              ).length > 0 && (
                <span className="font-mono text-[10px] text-[#f5a623] uppercase">
                  ● {activeChildren.filter((c) => Number(c.alignmentScore) >= 40 && Number(c.alignmentScore) < 70).length}{" "}
                  DRIFTING
                </span>
              )}
              {activeChildren.filter((c) => Number(c.alignmentScore) < 40).length > 0 && (
                <span className="font-mono text-[10px] text-[#ff3b3b] uppercase">
                  ● {activeChildren.filter((c) => Number(c.alignmentScore) < 40).length} MISALIGNED
                </span>
              )}
              {justVotedSet.size > 0 && (
                <span className="font-mono text-[10px] text-blue-400 uppercase animate-pulse">
                  ⚡ {justVotedSet.size} VOTING
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-40 bg-white/[0.05] animate-pulse border border-white/[0.08]" />
              ))}
            </div>
          ) : activeChildren.length === 0 ? (
            <div className="m-4 border border-white/[0.08] p-12 text-center">
              <div className="mb-4 text-4xl text-[#4a4f5e]">⬡</div>
              <h2 className="mb-2 font-mono text-sm text-[#4a4f5e] uppercase tracking-widest">
                NO AGENTS SPAWNED
              </h2>
              <p className="text-[11px] font-mono text-[#4a4f5e]/60">
                PARENT AGENT WILL SPAWN CHILDREN WHEN PROPOSALS ARE DETECTED
              </p>
              <p className="mt-4 text-[10px] font-mono text-[#4a4f5e]/40 uppercase">
                POLLING SPAWN_FACTORY @ {formatAddress(CONTRACTS.SpawnFactory.address)}
              </p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeChildren.map((child, i) => (
                <MissionCard
                  key={child.childAddr}
                  child={child}
                  index={i}
                  isVoting={justVotedSet.has(child.childAddr)}
                />
              ))}

              {/* Terminated agents compact strip — full width, below the 2-col grid */}
              {terminatedChildren.length > 0 && (
                <details className="group mt-2 col-span-full">
                  <summary className="flex items-center gap-2 cursor-pointer py-2 px-1 hover:opacity-80 transition-opacity list-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4a4f5e]" />
                    <span className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                      TERMINATED_AGENTS ({terminatedChildren.length})
                    </span>
                    <span className="font-mono text-[10px] text-[#4a4f5e]/50 group-open:hidden">↓ SHOW</span>
                    <span className="hidden font-mono text-[10px] text-[#4a4f5e]/50 group-open:inline">↑ HIDE</span>
                  </summary>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {terminatedChildren.slice(0, 12).map((child) => (
                      <Link
                        key={child.childAddr}
                        href={`/agent/${child.id.toString()}`}
                        className="border border-white/[0.06] bg-[#0a0a0f] px-3 py-2 opacity-40 hover:opacity-70 transition-opacity"
                      >
                        <div className="font-mono text-[10px] text-[#4a4f5e] truncate">
                          {child.ensLabel}
                        </div>
                        <div className="font-mono text-[10px] text-[#4a4f5e]/60 mt-0.5">
                          ALIGN: {Number(child.alignmentScore)} | VOTES: {Number(child.voteCount)}
                        </div>
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: LIVE VOTE LOG */}
        <div className="w-[300px] xl:w-[340px] flex-shrink-0 flex flex-col overflow-hidden hidden lg:flex">
          {/* Panel header */}
          <div className="border-b border-white/[0.08] px-4 py-2.5 bg-[#0a0a0f] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
              <span className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                LIVE_VOTE_LOG
              </span>
            </div>
            <span className="font-mono text-[9px] text-[#4a4f5e]/50 uppercase">
              BLOCK #{latestBlock}
            </span>
          </div>

          {/* Column headers */}
          <div className="border-b border-white/[0.06] px-3 py-1.5 bg-[#0a0a0f] grid grid-cols-[1fr_auto_auto] gap-2 flex-shrink-0">
            <span className="font-mono text-[9px] text-[#4a4f5e]/60 uppercase">AGENT / PROPOSAL</span>
            <span className="font-mono text-[9px] text-[#4a4f5e]/60 uppercase">VOTE</span>
            <span className="font-mono text-[9px] text-[#4a4f5e]/60 uppercase">STATUS</span>
          </div>

          {/* Vote rows */}
          <div className="flex-1 overflow-y-auto">
            {timelineLoading ? (
              <div className="p-3 space-y-1.5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-8 bg-white/[0.05] animate-pulse" />
                ))}
              </div>
            ) : recentVotes.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="font-mono text-[10px] text-[#4a4f5e] uppercase">
                  NO VOTES RECORDED
                </div>
                <div className="font-mono text-[9px] text-[#4a4f5e]/40 mt-1">
                  AWAITING PROPOSALS
                </div>
              </div>
            ) : (
              recentVotes.map((event, i) => {
                const support = event.data.support as number | undefined;
                const proposalId = event.data.proposalId as string | bigint | undefined;
                const voter = event.data.voter as string | undefined;
                const shortId = proposalId
                  ? `#${proposalId.toString().slice(-6)}`
                  : `#${event.blockNumber.toString().slice(-6)}`;
                const voterLabel = voter
                  ? `${voter.slice(0, 6)}…${voter.slice(-4)}`
                  : `TX${event.transactionHash.slice(2, 6).toUpperCase()}`;

                const isFor = support === 1;
                const isAgainst = support === 0;

                const voteLabel = isFor ? "FOR" : isAgainst ? "AGAINST" : "ABSTAIN";
                const voteColor = isFor
                  ? "text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/20"
                  : isAgainst
                  ? "text-[#ff3b3b] bg-[#ff3b3b]/10 border-[#ff3b3b]/20"
                  : "text-[#4a4f5e] bg-white/[0.05] border-white/[0.08]";

                const rowBg = i % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]";

                return (
                  <a
                    key={event.id}
                    href={`${explorerBase}/tx/${event.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2 border-b border-white/[0.05] ${rowBg} hover:bg-white/[0.03] transition-colors`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-[#f5f5f0]/60 truncate">
                        {voterLabel}
                      </div>
                      <div className="font-mono text-[9px] text-[#4a4f5e] truncate">
                        {shortId}
                      </div>
                    </div>
                    <span
                      className={`text-[8px] font-mono uppercase border px-1.5 py-0.5 leading-none flex-shrink-0 ${voteColor}`}
                    >
                      {voteLabel}
                    </span>
                    <a
                      href={`${explorerBase}/tx/${event.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-[9px] text-[#4a4f5e] hover:text-[#f5f5f0] transition-colors flex-shrink-0"
                    >
                      ↗
                    </a>
                  </a>
                );
              })
            )}
          </div>

          {/* Footer: link to full timeline */}
          <div className="border-t border-white/[0.08] px-3 py-2 flex-shrink-0">
            <Link
              href="/timeline"
              className="font-mono text-[9px] text-[#4a4f5e] uppercase tracking-widest hover:text-[#f5f5f0] transition-colors"
            >
              VIEW_FULL_LEDGER →
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom fixed status bar */}
      <div className="fixed bottom-0 left-[200px] right-0 h-8 border-t border-white/[0.08] bg-[#0a0a0f] flex items-center px-4 gap-6 text-[10px] font-mono z-20">
        <span className="text-[#4a4f5e] uppercase">
          SYS_HEALTH:{" "}
          <span className={sysHealthColor}>{loading ? "LOADING" : sysHealth}</span>
        </span>
        <span className="text-white/[0.08]">|</span>
        <span className="text-[#4a4f5e] uppercase">
          LATENCY: <span className="text-[#f5f5f0]/50">20S</span>
        </span>
        <span className="text-white/[0.08]">|</span>
        <span className="text-[#4a4f5e] uppercase">
          BLOCK: <span className="text-[#f5f5f0]/50">{latestBlock}</span>
        </span>
        <span className="text-white/[0.08]">|</span>
        <span className="text-[#4a4f5e] uppercase">
          AGENTS: <span className="text-[#f5f5f0]/50">{activeCount}</span>
        </span>
        <span className="ml-auto text-[#4a4f5e] uppercase tabular-nums">
          TIME: <span className="text-[#f5f5f0]/50">{time} UTC</span>
        </span>
      </div>
    </div>
  );
}
