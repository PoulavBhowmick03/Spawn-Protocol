"use client";

import Link from "next/link";
import { formatAddress, explorerAddress, formatTimestamp, ensName, governorName } from "@/lib/contracts";
import { AlignmentBadge } from "./AlignmentBadge";
import type { ChildInfo } from "@/hooks/useSwarmData";

interface AgentCardProps {
  child: ChildInfo;
  justVoted?: boolean;
  delegationHash?: string;
}

export function AgentCard({ child, justVoted = false, delegationHash }: AgentCardProps) {
  const score = Number(child.alignmentScore);
  const isActive = child.active;

  const pulseClass = isActive
    ? score >= 70
      ? "animate-pulse-green"
      : score >= 40
      ? "animate-pulse-yellow"
      : "animate-pulse-red"
    : "";

  const borderColor = isActive
    ? score >= 70
      ? "border-green-500/40"
      : score >= 40
      ? "border-yellow-500/40"
      : "border-red-500/40"
    : "border-gray-700/40";

  const statusDotColor = isActive
    ? score >= 70
      ? "bg-green-400"
      : score >= 40
      ? "bg-yellow-400"
      : "bg-red-400"
    : "bg-gray-500";

  const ensDisplay = ensName(child.ensLabel) ?? formatAddress(child.childAddr);
  const daoName = governorName(child.governance);

  return (
    <Link href={`/agent/${child.id.toString()}`}>
      <div
        className={`relative border rounded-lg p-4 bg-[#0d0d14] hover:bg-[#12121c] transition-all cursor-pointer ${justVoted ? "border-blue-400/60" : borderColor} ${pulseClass}`}
      >
        {/* Status indicator */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${statusDotColor} ${isActive ? "animate-ping" : ""}`}
              style={isActive ? { animationDuration: "2s" } : {}}
            />
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              {isActive ? "Active" : "Terminated"}
            </span>
          </div>
          <AlignmentBadge score={child.alignmentScore} size="sm" />
        </div>

        {/* ENS / Address */}
        <div className="mb-2">
          <div className="flex items-center gap-1.5">
            <p className="font-mono text-sm text-green-400 font-semibold truncate">
              {ensDisplay}
            </p>
            {ensName(child.ensLabel) && (
              <span className="text-[9px] border border-green-500/30 bg-green-500/10 text-green-400 rounded px-1 py-0.5 font-mono uppercase whitespace-nowrap">
                ENS
              </span>
            )}
            {delegationHash && delegationHash !== "REVOKED" && (
              <span className="text-[9px] border border-orange-400/30 bg-orange-400/10 text-orange-400 rounded px-1 py-0.5 font-mono uppercase whitespace-nowrap" title={delegationHash}>
                7715
              </span>
            )}
            {delegationHash === "REVOKED" && (
              <span className="text-[9px] border border-red-400/30 bg-red-400/10 text-red-400 rounded px-1 py-0.5 font-mono uppercase whitespace-nowrap">
                REVOKED
              </span>
            )}
            {(() => {
              const generation = child.ensLabel.match(/-v(\d+)$/)?.[1];
              return generation && Number(generation) > 1 ? (
                <span className="text-[9px] border border-cyan-400/30 bg-cyan-400/10 text-cyan-400 rounded px-1 py-0.5 font-mono uppercase whitespace-nowrap">
                  Gen {generation}
                </span>
              ) : null;
            })()}
          </div>
          <span
            className="font-mono text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(explorerAddress(child.childAddr), "_blank"); }}
          >
            {formatAddress(child.childAddr)}
          </span>
        </div>

        {/* DAO */}
        <div className="mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            DAO
          </p>
          <span
            className="font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(explorerAddress(child.governance), "_blank"); }}
          >
            {daoName ?? formatAddress(child.governance)}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 text-xs text-gray-400">
          <div>
            <span className="text-gray-600">Votes: </span>
            <span className="font-mono text-white">
              {child.voteCount.toString()}
            </span>
          </div>
          <div className="flex-1 text-right">
            {child.lastVoteTimestamp > BigInt(0) ? (
              <span className="text-gray-500">
                {formatTimestamp(child.lastVoteTimestamp)}
              </span>
            ) : (
              <span className="text-gray-600 italic">No votes yet</span>
            )}
          </div>
        </div>

        {justVoted && (
          <>
            <div className="absolute inset-0 rounded-lg bg-blue-400/10 animate-pulse pointer-events-none" />
            <div className="absolute top-2 right-2 text-[10px] font-mono text-blue-400 bg-blue-400/20 border border-blue-400/40 rounded px-1.5 py-0.5 animate-pulse">
              ⚡ VOTING
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
