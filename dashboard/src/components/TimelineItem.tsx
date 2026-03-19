"use client";

import { explorerTx, formatAddress } from "@/lib/contracts";
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
    bg: "bg-red-400/10 border-red-400/30",
    label: "TERMINATED",
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

function formatEventData(event: TimelineEvent): string {
  const d = event.data;
  switch (event.type) {
    case "ChildSpawned":
      return `Child #${d.childId} spawned at ${formatAddress(String(d.childAddr))} — budget: ${d.budget ? (Number(d.budget) / 1e18).toFixed(4) : "?"} ETH`;
    case "ChildTerminated":
      return `Child #${d.childId} terminated — ${d.fundsReturned ? (Number(d.fundsReturned) / 1e18).toFixed(4) : "?"} ETH returned`;
    case "FundsReallocated":
      return `Reallocated ${d.amount ? (Number(d.amount) / 1e18).toFixed(4) : "?"} ETH from child #${d.fromId} to #${d.toId}`;
    case "ValuesUpdated":
      return `Governance values updated: "${String(d.values ?? "").slice(0, 80)}${String(d.values ?? "").length > 80 ? "…" : ""}"`;
    case "Deposited":
      return `Deposit of ${d.amount ? (Number(d.amount) / 1e18).toFixed(4) : "?"} ETH from ${formatAddress(String(d.from))}`;
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

  return (
    <div className="flex gap-3 items-start">
      {/* Icon column */}
      <div className={`flex-none w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold ${style.bg} ${style.color}`}>
        {style.icon}
      </div>

      {/* Content */}
      <div className={`flex-1 border rounded-lg px-3 py-2 ${style.bg}`}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`text-xs font-mono font-bold tracking-wider ${style.color}`}>
            {style.label}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-600">
              block #{event.blockNumber.toString()}
            </span>
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
        <p className="text-sm text-gray-300">{formatEventData(event)}</p>
      </div>
    </div>
  );
}
