"use client";

import { explorerTx, formatAddress, ensName } from "@/lib/contracts";
import type { TimelineEvent } from "@/hooks/useTimeline";

const EVENT_STYLES: Record<
  string,
  { color: string; bg: string; label: string; icon: string }
> = {
  ChildSpawned: {
    color: "text-green-400",
    bg: "bg-green-400/10 border-green-400/30",
    label: "SPAWNED",
    icon: "✦",
  },
  ChildTerminated: {
    color: "text-red-400",
    bg: "bg-red-500/15 border-red-500/50",
    label: "⚠ TERMINATED",
    icon: "✕",
  },
  VoteCast: {
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/30",
    label: "VOTE CAST",
    icon: "◆",
  },
  AlignmentUpdated: {
    color: "text-purple-400",
    bg: "bg-purple-400/10 border-purple-400/30",
    label: "ALIGNMENT",
    icon: "◉",
  },
  RationaleRevealed: {
    color: "text-cyan-400",
    bg: "bg-cyan-400/10 border-cyan-400/30",
    label: "REVEALED",
    icon: "◈",
  },
  FundsReallocated: {
    color: "text-orange-400",
    bg: "bg-orange-400/10 border-orange-400/30",
    label: "REALLOCATED",
    icon: "⇄",
  },
  ValuesUpdated: {
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/30",
    label: "VALUES",
    icon: "✎",
  },
  Deposited: {
    color: "text-green-300",
    bg: "bg-green-300/10 border-green-300/30",
    label: "DEPOSIT",
    icon: "↓",
  },
};

function childDisplay(d: Record<string, unknown>): string {
  const label = d.ensLabel as string | undefined;
  if (label) return ensName(label) ?? formatAddress(String(d.childAddr));
  return formatAddress(String(d.childAddr));
}

function formatEventData(event: TimelineEvent): string {
  const d = event.data;
  switch (event.type) {
    case "ChildSpawned":
      return `${d.ensLabel ? `${ensName(String(d.ensLabel)) ?? String(d.ensLabel)} spawned` : `Child #${d.childId} spawned`} — budget: ${d.budget ? (Number(d.budget) / 1e18).toFixed(4) : "?"} ETH`;
    case "ChildTerminated":
      return `${d.ensLabel ? `${ensName(String(d.ensLabel)) ?? String(d.ensLabel)} killed for misalignment` : `Agent #${d.childId} killed for misalignment`} — ${d.childAddr ? formatAddress(String(d.childAddr)) : "wallet pending"} — ${d.fundsReturned && Number(d.fundsReturned) > 0 ? `${(Number(d.fundsReturned) / 1e18).toFixed(4)} ETH returned` : "funds returned"}`;
    case "FundsReallocated":
      return `Reallocated ${d.amount ? (Number(d.amount) / 1e18).toFixed(4) : "?"} ETH from child #${d.fromId} to #${d.toId}`;
    case "ValuesUpdated":
      return `Governance values updated: "${String(d.values ?? "").slice(0, 80)}${String(d.values ?? "").length > 80 ? "…" : ""}"`;
    case "Deposited":
      return `Deposit of ${d.amount ? (Number(d.amount) / 1e18).toFixed(4) : "?"} ETH from ${formatAddress(String(d.from))}`;
    case "VoteCast": {
      const supportLabels = ["AGAINST", "FOR", "ABSTAIN"];
      return `${childDisplay(d)} voted ${supportLabels[Number(d.support)] ?? "?"} on proposal #${d.proposalId}`;
    }
    case "AlignmentUpdated":
      return `${childDisplay(d)} alignment → ${d.newScore}/100`;
    case "RationaleRevealed":
      return `Rationale revealed for proposal #${d.proposalId}`;
    default:
      return JSON.stringify(d);
  }
}

interface TimelineItemProps {
  event: TimelineEvent;
}

export function TimelineItem({ event }: TimelineItemProps) {
  const style = EVENT_STYLES[event.type] ?? {
    color: "text-gray-400",
    bg: "bg-gray-400/10 border-gray-400/30",
    label: event.type,
    icon: "·",
  };

  const isTermination = event.type === "ChildTerminated";

  return (
    <div className={`flex gap-3 items-start ${isTermination ? "my-1" : ""}`}>
      {/* Icon column */}
      <div
        className={`flex-none rounded-full border flex items-center justify-center font-bold ${style.bg} ${style.color} ${
          isTermination ? "w-10 h-10 text-base" : "w-8 h-8 text-sm"
        }`}
      >
        {style.icon}
      </div>

      {/* Content */}
      <div
        className={`flex-1 border rounded-lg px-3 ${style.bg} ${
          isTermination
            ? "py-3 border-l-4 border-l-red-500"
            : "py-2"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1">
          <span className={`font-mono font-bold tracking-wider ${style.color} ${isTermination ? "text-sm" : "text-xs"}`}>
            {style.label}
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {event.timestamp ? (
              <span className="font-mono text-xs text-gray-500">
                {new Date(Number(event.timestamp) * 1000).toLocaleString()}
              </span>
            ) : (
              <span className="font-mono text-xs text-gray-600">
                block #{event.blockNumber.toString()}
              </span>
            )}
            {event.transactionHash && event.transactionHash !== "0x" && (
              <a
                href={explorerTx(event.transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {formatAddress(event.transactionHash)}↗
              </a>
            )}
          </div>
        </div>
        <p className={`text-gray-300 ${isTermination ? "text-sm font-medium" : "text-sm"}`}>
          {formatEventData(event)}
        </p>
      </div>
    </div>
  );
}
