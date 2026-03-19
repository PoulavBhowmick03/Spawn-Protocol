"use client";

import Link from "next/link";
import { formatAddress, explorerAddress, formatTimestamp } from "@/lib/contracts";
import { AlignmentBadge } from "./AlignmentBadge";
import type { ChildInfo } from "@/hooks/useSwarmData";

interface AgentCardProps {
  child: ChildInfo;
}

export function AgentCard({ child }: AgentCardProps) {
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

  const ensDisplay =
    child.ensLabel && child.ensLabel !== ""
      ? child.ensLabel
      : formatAddress(child.childAddr);

  return (
    <Link href={`/agent/${child.id.toString()}`}>
      <div
        className={`relative border rounded-lg p-4 bg-[#0d0d14] hover:bg-[#12121c] transition-all cursor-pointer ${borderColor} ${pulseClass}`}
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
          <p className="font-mono text-sm text-green-400 font-semibold truncate">
            {ensDisplay}
          </p>
          <a
            href={explorerAddress(child.childAddr)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-gray-500 hover:text-gray-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {formatAddress(child.childAddr)}
          </a>
        </div>

        {/* DAO */}
        <div className="mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            DAO
          </p>
          <a
            href={explorerAddress(child.governance)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {formatAddress(child.governance)}
          </a>
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

        {/* Budget */}
        <div className="mt-2 pt-2 border-t border-gray-800">
          <span className="text-xs text-gray-600">Budget: </span>
          <span className="font-mono text-xs text-gray-400">
            {(Number(child.budget) / 1e18).toFixed(4)} ETH
          </span>
        </div>
      </div>
    </Link>
  );
}
