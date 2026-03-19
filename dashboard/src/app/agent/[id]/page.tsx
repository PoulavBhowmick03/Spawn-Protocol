"use client";

import { use } from "react";
import Link from "next/link";
import { useChildData } from "@/hooks/useSwarmData";
import { AlignmentBadge } from "@/components/AlignmentBadge";
import {
  formatAddress,
  explorerAddress,
  explorerTx,
  formatTimestamp,
  supportLabel,
  supportColor,
} from "@/lib/contracts";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AgentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { child, voteHistory, loading, error } = useChildData(id);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-1/3" />
          <div className="h-4 bg-gray-800 rounded w-1/2" />
          <div className="h-32 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (error || !child) {
    return (
      <div className="p-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 font-mono mb-6 inline-block">
          ← Back to Swarm
        </Link>
        <div className="border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 font-mono">
            {error || "Agent not found"}
          </p>
        </div>
      </div>
    );
  }

  const ensDisplay = child.ensLabel && child.ensLabel !== "" ? child.ensLabel : formatAddress(child.childAddr);

  return (
    <div className="p-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 font-mono mb-6 inline-block">
        ← Back to Swarm
      </Link>

      {/* Agent header */}
      <div className="border border-gray-800 rounded-lg p-6 bg-[#0d0d14] mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${child.active ? "bg-green-400 animate-ping" : "bg-gray-600"}`} style={{ animationDuration: "2s" }} />
              <span className="text-xs text-gray-500 uppercase tracking-wider font-mono">
                Agent #{id} — {child.active ? "Active" : "Terminated"}
              </span>
            </div>
            <h1 className="text-xl font-mono font-bold text-green-400 mb-1">
              {ensDisplay}
            </h1>
            <a
              href={explorerAddress(child.childAddr)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-gray-500 hover:text-gray-300"
            >
              {child.childAddr} ↗
            </a>
          </div>
          <AlignmentBadge score={child.alignmentScore} size="lg" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">DAO</p>
            <a
              href={explorerAddress(child.governance)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-400 hover:text-blue-300 text-xs"
            >
              {formatAddress(child.governance)} ↗
            </a>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Budget</p>
            <p className="font-mono text-white">
              {(Number(child.budget) / 1e18).toFixed(4)} ETH
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Votes Cast</p>
            <p className="font-mono text-white">{child.voteCount.toString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Last Vote</p>
            <p className="font-mono text-xs text-gray-400">
              {child.lastVoteTimestamp > BigInt(0)
                ? formatTimestamp(child.lastVoteTimestamp)
                : "Never"}
            </p>
          </div>
        </div>
      </div>

      {/* Vote history */}
      <div>
        <h2 className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-4">
          Voting History ({voteHistory.length})
        </h2>

        {voteHistory.length === 0 ? (
          <div className="border border-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-600 font-mono">No votes recorded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...voteHistory].reverse().map((vote, i) => {
              const supportNum = Number(vote.support);
              let rationale: string | null = null;
              if (vote.revealed && vote.decryptedRationale && vote.decryptedRationale !== "0x") {
                try {
                  rationale = new TextDecoder().decode(
                    Buffer.from(vote.decryptedRationale.slice(2), "hex")
                  );
                } catch {
                  rationale = vote.decryptedRationale;
                }
              }

              return (
                <div
                  key={i}
                  className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-gray-600">
                        Proposal #{vote.proposalId.toString()}
                      </span>
                      <span className={`font-mono text-sm font-bold ${supportColor(supportNum)}`}>
                        {supportLabel(supportNum)}
                      </span>
                      {vote.revealed && (
                        <span className="text-xs text-cyan-400 border border-cyan-400/30 px-1.5 py-0.5 rounded font-mono">
                          REVEALED
                        </span>
                      )}
                      {!vote.revealed && (
                        <span className="text-xs text-gray-600 border border-gray-700 px-1.5 py-0.5 rounded font-mono">
                          ENCRYPTED
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-gray-600">
                      {formatTimestamp(vote.timestamp)}
                    </span>
                  </div>

                  {rationale && (
                    <div className="mt-2 p-3 bg-[#0a0a0f] rounded border border-gray-800">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Rationale</p>
                      <p className="text-sm text-gray-300">{rationale}</p>
                    </div>
                  )}

                  {!vote.revealed && vote.encryptedRationale && vote.encryptedRationale !== "0x" && (
                    <div className="mt-2 p-3 bg-[#0a0a0f] rounded border border-gray-800">
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Encrypted Rationale (Lit Protocol)</p>
                      <p className="font-mono text-xs text-gray-700 break-all">
                        {vote.encryptedRationale.slice(0, 64)}…
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
