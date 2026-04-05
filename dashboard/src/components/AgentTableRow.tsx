"use client";

import Link from "next/link";
import {
  formatAddress,
  explorerAddress,
  formatTimestamp,
  ensName,
  governorName,
  storageViewerPath,
} from "@/lib/contracts";
import type { ChildInfo } from "@/hooks/useSwarmData";

interface AgentTableRowProps {
  child: ChildInfo;
  index: number;
  justVoted?: boolean;
  delegationHash?: string;
  erc8004Id?: bigint | null;
  filecoinCid?: string | null;
}

export function AgentTableRow({
  child,
  index,
  justVoted = false,
  delegationHash,
  erc8004Id,
  filecoinCid,
}: AgentTableRowProps) {
  const score = Number(child.alignmentScore);
  const isActive = child.active;

  // Status config — drives the entire row's visual identity
  const status = justVoted
    ? "voting"
    : !isActive
    ? "terminated"
    : score >= 70
    ? "aligned"
    : score >= 40
    ? "drifting"
    : "misaligned";

  const statusConfig = {
    aligned: {
      dot: "bg-[#00ff88]",
      label: "ALIGNED",
      labelClass: "text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/30",
      borderLeft: "border-l-2 border-l-[#00ff88]",
      rowBg: index % 2 === 0 ? "bg-[#00ff88]/[0.025]" : "bg-[#00ff88]/[0.04]",
      nameColor: "text-[#00ff88]",
      scoreColor: "text-[#00ff88]",
      barColor: "bg-[#00ff88]",
      pulse: true,
    },
    drifting: {
      dot: "bg-[#f5a623]",
      label: "DRIFTING",
      labelClass: "text-[#f5a623] bg-[#f5a623]/10 border-[#f5a623]/30",
      borderLeft: "border-l-2 border-l-[#f5a623]",
      rowBg: index % 2 === 0 ? "bg-[#f5a623]/[0.025]" : "bg-[#f5a623]/[0.04]",
      nameColor: "text-[#f5a623]",
      scoreColor: "text-[#f5a623]",
      barColor: "bg-[#f5a623]",
      pulse: true,
    },
    misaligned: {
      dot: "bg-[#ff3b3b]",
      label: "MISALIGNED",
      labelClass: "text-[#ff3b3b] bg-[#ff3b3b]/10 border-[#ff3b3b]/30",
      borderLeft: "border-l-2 border-l-[#ff3b3b]",
      rowBg: index % 2 === 0 ? "bg-[#ff3b3b]/[0.03]" : "bg-[#ff3b3b]/[0.05]",
      nameColor: "text-[#ff3b3b]",
      scoreColor: "text-[#ff3b3b]",
      barColor: "bg-[#ff3b3b]",
      pulse: true,
    },
    voting: {
      dot: "bg-blue-400",
      label: "VOTING",
      labelClass: "text-blue-400 bg-blue-400/15 border-blue-400/40 animate-pulse",
      borderLeft: "border-l-2 border-l-blue-400",
      rowBg: "bg-blue-400/[0.07]",
      nameColor: "text-blue-300",
      scoreColor: score >= 70 ? "text-[#00ff88]" : score >= 40 ? "text-[#f5a623]" : "text-[#ff3b3b]",
      barColor: score >= 70 ? "bg-[#00ff88]" : score >= 40 ? "bg-[#f5a623]" : "bg-[#ff3b3b]",
      pulse: true,
    },
    terminated: {
      dot: "bg-[#4a4f5e]",
      label: "TERMINATED",
      labelClass: "text-[#4a4f5e] bg-transparent border-white/[0.08]",
      borderLeft: "border-l-2 border-l-transparent",
      rowBg: index % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]",
      nameColor: "text-[#4a4f5e]",
      scoreColor: "text-[#4a4f5e]",
      barColor: "bg-[#4a4f5e]",
      pulse: false,
    },
  }[status];

  const ensDisplay = ensName(child.ensLabel) ?? formatAddress(child.childAddr);
  const daoName = governorName(child.governance);

  return (
    <tr
      className={`${statusConfig.rowBg} ${statusConfig.borderLeft} hover:brightness-125 transition-all group ${!isActive ? "opacity-50" : ""}`}
    >
      {/* Status chip */}
      <td className="px-3 py-2.5 w-[110px]">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${statusConfig.dot} ${statusConfig.pulse ? "animate-pulse" : ""}`}
          />
          <span className={`text-[9px] font-mono uppercase tracking-wider border px-1.5 py-0.5 leading-none ${statusConfig.labelClass}`}>
            {statusConfig.label}
          </span>
        </div>
      </td>

      {/* Agent ID */}
      <td className="px-3 py-2.5 max-w-[160px]">
        <Link href={`/agent/${child.id.toString()}`} className="block">
          <div className={`font-mono text-[11px] font-semibold truncate hover:text-white transition-colors ${statusConfig.nameColor}`}>
            {ensDisplay}
          </div>
          <div className="font-mono text-[10px] text-[#4a4f5e] mt-0.5">
            {formatAddress(child.childAddr)}
          </div>
        </Link>
      </td>

      {/* DAO */}
      <td className="px-3 py-2.5">
        <span
          className="font-mono text-[11px] text-[#f5f5f0]/50 hover:text-[#f5f5f0] cursor-pointer transition-colors"
          onClick={() => window.open(explorerAddress(child.governance), "_blank")}
        >
          {daoName ?? formatAddress(child.governance)}
        </span>
      </td>

      {/* Alignment bar + score */}
      <td className="px-3 py-2.5 w-32">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-white/[0.08] flex-shrink-0">
            <div
              className={`h-full ${statusConfig.barColor} transition-all`}
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
          <span className={`font-mono text-[12px] font-bold tabular-nums ${statusConfig.scoreColor}`}>
            {score}
          </span>
        </div>
      </td>

      {/* Votes */}
      <td className="px-3 py-2.5 w-16 text-right">
        <span className="font-mono text-[11px] text-[#f5f5f0]/70 tabular-nums">
          {child.voteCount.toString()}
        </span>
      </td>

      {/* Last vote */}
      <td className="px-3 py-2.5 w-32">
        <span className="font-mono text-[10px] text-[#4a4f5e]">
          {child.lastVoteTimestamp > BigInt(0)
            ? formatTimestamp(child.lastVoteTimestamp)
            : "—"}
        </span>
      </td>

      {/* Delegation / metadata badges */}
      <td className="px-3 py-2.5 w-36">
        <div className="flex flex-wrap gap-1">
          {delegationHash && delegationHash !== "REVOKED" && (
            <span className="text-[9px] border border-[#f5a623]/40 bg-[#f5a623]/10 text-[#f5a623] px-1.5 py-0.5 font-mono uppercase">
              ERC-7715
            </span>
          )}
          {delegationHash === "REVOKED" && (
            <span className="text-[9px] border border-[#ff3b3b]/40 bg-[#ff3b3b]/10 text-[#ff3b3b] px-1.5 py-0.5 font-mono uppercase">
              REVOKED
            </span>
          )}
          {(() => {
            const generation = child.ensLabel.match(/-v(\d+)$/)?.[1];
            return generation && Number(generation) > 1 ? (
              <span className="text-[9px] border border-white/10 text-[#4a4f5e] px-1.5 py-0.5 font-mono uppercase">
                GEN{generation}
              </span>
            ) : null;
          })()}
          {erc8004Id != null && (
            <span
              className="text-[9px] border border-white/10 text-[#4a4f5e] px-1.5 py-0.5 font-mono uppercase"
              title={`ERC-8004 ID #${erc8004Id.toString()}`}
            >
              8004#{erc8004Id.toString()}
            </span>
          )}
          {filecoinCid && (
            <a
              href={storageViewerPath(filecoinCid)}
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] border border-white/10 text-[#4a4f5e] px-1.5 py-0.5 font-mono uppercase hover:text-[#f5f5f0] hover:border-white/30 transition-colors"
            >
              FIL
            </a>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5 w-16 text-right">
        <Link
          href={`/agent/${child.id.toString()}`}
          className={`text-[10px] font-mono uppercase tracking-wider transition-colors ${isActive ? "text-[#4a4f5e] hover:text-[#00ff88]" : "text-[#4a4f5e]/40"}`}
        >
          VIEW →
        </Link>
      </td>
    </tr>
  );
}
