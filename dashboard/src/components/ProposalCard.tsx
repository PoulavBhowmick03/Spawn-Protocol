"use client";

import {
  proposalStateLabel,
  proposalStateColor,
  formatTimestamp,
} from "@/lib/contracts";
import type { Proposal } from "@/hooks/useProposals";

interface ProposalCardProps {
  proposal: Proposal;
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const total =
    Number(proposal.forVotes) +
    Number(proposal.againstVotes) +
    Number(proposal.abstainVotes);

  const forPct = total > 0 ? (Number(proposal.forVotes) / total) * 100 : 0;
  const againstPct =
    total > 0 ? (Number(proposal.againstVotes) / total) * 100 : 0;
  const abstainPct =
    total > 0 ? (Number(proposal.abstainVotes) / total) * 100 : 0;

  const stateColorClass = proposalStateColor(proposal.state);
  const stateLabel = proposalStateLabel(proposal.state);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isActive = proposal.state === 1;
  const timeRemaining =
    isActive && proposal.endTime > now
      ? Number(proposal.endTime - now)
      : null;

  function formatTimeRemaining(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14] hover:bg-[#12121c] transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-gray-600">
              #{proposal.id.toString()}
            </span>
            {proposal.daoName && (
              <span className={`text-xs border rounded px-1.5 py-0.5 font-mono font-semibold ${proposal.daoColor ?? "text-gray-400"} ${proposal.daoBorderColor ?? "border-gray-700"}`}>
                {proposal.daoName}
              </span>
            )}
            <span
              className={`text-xs border rounded px-1.5 py-0.5 font-mono ${stateColorClass}`}
            >
              {stateLabel}
            </span>
            {isActive && timeRemaining !== null && (
              <span className="text-xs text-blue-400 font-mono animate-pulse">
                {formatTimeRemaining(timeRemaining)} left
              </span>
            )}
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">
            {proposal.description || "(No description)"}
          </p>
        </div>
      </div>

      {/* Vote bar */}
      {total > 0 ? (
        <div className="mb-3">
          <div className="flex h-2 rounded overflow-hidden gap-px">
            {forPct > 0 && (
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${forPct}%` }}
              />
            )}
            {againstPct > 0 && (
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${againstPct}%` }}
              />
            )}
            {abstainPct > 0 && (
              <div
                className="bg-yellow-500 transition-all"
                style={{ width: `${abstainPct}%` }}
              />
            )}
          </div>
          <div className="flex gap-4 mt-1.5 text-xs font-mono">
            <span className="text-green-400">
              FOR: {proposal.forVotes.toString()} ({forPct.toFixed(1)}%)
            </span>
            <span className="text-red-400">
              AGAINST: {proposal.againstVotes.toString()} ({againstPct.toFixed(1)}%)
            </span>
            <span className="text-yellow-400">
              ABSTAIN: {proposal.abstainVotes.toString()} ({abstainPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <div className="h-2 rounded bg-gray-800" />
          <p className="text-xs text-gray-600 mt-1">No votes yet</p>
        </div>
      )}

      {/* Timestamps */}
      <div className="flex gap-4 text-xs text-gray-600 font-mono">
        <span>Start: {formatTimestamp(proposal.startTime)}</span>
        <span>End: {formatTimestamp(proposal.endTime)}</span>
      </div>
    </div>
  );
}
