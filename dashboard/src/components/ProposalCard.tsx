"use client";

import Link from "next/link";
import { useState } from "react";
import {
  proposalStateLabel,
  proposalStateColor,
  formatTimestamp,
  formatAddress,
  explorerAddress,
  ensName,
  governorName,
} from "@/lib/contracts";
import type { Proposal } from "@/hooks/useProposals";

interface ProposalCardProps {
  proposal: Proposal;
}

const TALLY_DAO_SLUGS: Record<string, string> = {
  "Arbitrum Core": "arbitrum",
  "Arbitrum Treasury": "arbitrum",
  Arbitrum: "arbitrum",
  Optimism: "optimism",
  "Optimism Governor": "optimism",
  ZKsync: "zksync",
  "ZKsync Governors": "zksync",
  Uniswap: "uniswap",
  Compound: "compound",
  ENS: "ens",
  Aave: "aave",
  Lido: "lido",
  MakerDAO: "makerdao",
  Wormhole: "wormhole",
};

function parsePolymarketSource(desc: string): { name: string; slug: string } | null {
  const match = desc.match(/\[(.+?)\s*[—–-]\s*Prediction Market via Polymarket\]/);
  if (!match) return null;
  return { name: match[1], slug: match[1].toLowerCase().replace(/\s+/g, "-") };
}

function supportLabel(support: number): string {
  if (support === 1) return "FOR";
  if (support === 0) return "AGAINST";
  return "ABSTAIN";
}

function supportChipColor(support: number): string {
  if (support === 1) return "text-green-200 border-green-500/60 bg-green-500/15";
  if (support === 0) return "text-red-200 border-red-500/60 bg-red-500/15";
  return "text-yellow-200 border-yellow-500/60 bg-yellow-500/15";
}

function cleanDescription(input: string): string {
  let output = input || "(No description)";
  output = output.replace(/\[.+?[—–-]\s*Real Governance via Tally\]\s*/g, "");
  output = output.replace(/\[.+?[—–-]\s*Prediction Market via Polymarket\]\s*/g, "");
  output = output.replace(/^(Source|Market Data|Volume|Resolution):.*$/gm, "");
  output = output.replace(/^(\[.+?\]\s*)+/g, "");
  output = output.replace(/\[.+?Governance\]\s*/g, "");

  const sentences = output.split(/(?<=[.#])\s+/).filter((sentence) => sentence.trim().length > 10);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const sentence of sentences) {
    const key = sentence.trim().slice(0, 60).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(sentence.trim());
    }
  }

  return deduped.join(" ").trim();
}

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleVoters = proposal.voters.filter((voter) => !voter.childLabel.startsWith("judge-proof-"));

  const rawForVotes = Number(proposal.forVotes);
  const rawAgainstVotes = Number(proposal.againstVotes);
  const rawAbstainVotes = Number(proposal.abstainVotes);
  const rawTotal = rawForVotes + rawAgainstVotes + rawAbstainVotes;
  const derivedForVotes = visibleVoters.filter((voter) => voter.support === 1).length;
  const derivedAgainstVotes = visibleVoters.filter((voter) => voter.support === 0).length;
  const derivedAbstainVotes = visibleVoters.filter((voter) => voter.support !== 0 && voter.support !== 1).length;

  const effectiveForVotes = rawTotal > 0 ? rawForVotes : derivedForVotes;
  const effectiveAgainstVotes = rawTotal > 0 ? rawAgainstVotes : derivedAgainstVotes;
  const effectiveAbstainVotes = rawTotal > 0 ? rawAbstainVotes : derivedAbstainVotes;
  const total = effectiveForVotes + effectiveAgainstVotes + effectiveAbstainVotes;

  const forPct = total > 0 ? (effectiveForVotes / total) * 100 : 0;
  const againstPct = total > 0 ? (effectiveAgainstVotes / total) * 100 : 0;
  const abstainPct = total > 0 ? (effectiveAbstainVotes / total) * 100 : 0;

  const stateColorClass = proposalStateColor(proposal.state);
  const stateLabel = proposalStateLabel(proposal.state);
  const accentClasses =
    proposal.state === 1
      ? {
          rail: "bg-blue-400/90",
          glow: "shadow-[0_0_0_1px_rgba(96,165,250,0.14),0_18px_42px_rgba(4,9,15,0.55)]",
          top: "bg-gradient-to-r from-blue-400/45 via-cyan-300/25 to-transparent",
        }
      : proposal.state === 4
      ? {
          rail: "bg-[#00ff88]/90",
          glow: "shadow-[0_0_0_1px_rgba(0,255,136,0.12),0_18px_42px_rgba(3,13,7,0.45)]",
          top: "bg-gradient-to-r from-[#00ff88]/45 via-[#00ff88]/20 to-transparent",
        }
      : proposal.state === 3
      ? {
          rail: "bg-[#ff3b3b]/90",
          glow: "shadow-[0_0_0_1px_rgba(255,59,59,0.14),0_18px_42px_rgba(13,3,3,0.45)]",
          top: "bg-gradient-to-r from-[#ff3b3b]/45 via-[#ff3b3b]/20 to-transparent",
        }
      : {
          rail: "bg-[#f5a623]/90",
          glow: "shadow-[0_0_0_1px_rgba(245,166,35,0.14),0_18px_42px_rgba(12,8,0,0.45)]",
          top: "bg-gradient-to-r from-[#f5a623]/45 via-[#f5a623]/20 to-transparent",
        };
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isActive = proposal.state === 1;
  const timeRemaining = isActive && proposal.endTime > now ? Number(proposal.endTime - now) : null;

  const cleanedDescription = cleanDescription(proposal.description);
  const summaryDescription =
    cleanedDescription.length > 220 ? `${cleanedDescription.slice(0, 220).trimEnd()}…` : cleanedDescription;

  const difficulty = (() => {
    if (total === 0) return null;
    const majorityPct = Math.max(forPct, againstPct, abstainPct);
    const splitScore = Math.round((1 - (majorityPct - 50) / 50) * 100);
    const voterScore = Math.min(visibleVoters.length / 9, 1) * 100;
    const complexityScore = Math.min((proposal.description || "").length / 1500, 1) * 100;
    return Math.round(splitScore * 0.5 + voterScore * 0.25 + complexityScore * 0.25);
  })();

  const difficultyLabel =
    difficulty === null ? null : difficulty >= 75 ? "Hard" : difficulty >= 50 ? "Medium" : difficulty >= 25 ? "Easy" : "Trivial";
  const difficultyColor =
    difficulty === null
      ? ""
      : difficulty >= 75
      ? "text-red-400 border-red-400/30 bg-red-400/5"
      : difficulty >= 50
      ? "text-orange-400 border-orange-400/30 bg-orange-400/5"
      : difficulty >= 25
      ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/5"
      : "text-green-400 border-green-400/30 bg-green-400/5";

  const tallySlug = proposal.sourceDaoName ? TALLY_DAO_SLUGS[proposal.sourceDaoName] : null;
  const tallyUrl = tallySlug ? `https://www.tally.xyz/gov/${tallySlug}` : null;
  const polySource = parsePolymarketSource(proposal.description);
  const polySlugMatch = proposal.description.match(/polymarket\.com\/event\/([^\s\n]+)/);
  const polyUrl = polySlugMatch ? `https://polymarket.com/event/${polySlugMatch[1]}` : null;
  const simGovernor = governorName(proposal.governorAddress) ?? formatAddress(proposal.governorAddress);

  return (
    <article
      className={`relative overflow-hidden border border-white/[0.1] bg-[#0f1118] transition-colors hover:border-white/[0.16] ${accentClasses.glow}`}
    >
      <div className={`absolute inset-x-0 top-0 h-px ${accentClasses.top}`} />
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentClasses.rail}`} />

      <div className="px-5 py-4 border-b border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0))] flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-mono text-xs text-[#4a4f5e]">#{proposal.id.toString()}</span>

            {proposal.sourceDaoName && (
              <span className="text-xs border border-cyan-400/30 bg-cyan-400/5 text-cyan-300 px-1.5 py-0.5 font-mono uppercase">
                {tallyUrl ? (
                    <a href={tallyUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    SOURCE_DAO: {proposal.sourceDaoName} ↗
                    </a>
                  ) : (
                  `SOURCE_DAO: ${proposal.sourceDaoName}`
                  )}
              </span>
            )}

            {polySource && (
              <span className="text-xs border border-orange-400/30 bg-orange-400/5 text-orange-300 px-1.5 py-0.5 font-mono uppercase">
                {polyUrl ? (
                    <a href={polyUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    SOURCE_DAO: {polySource.name} ↗
                    </a>
                  ) : (
                  `SOURCE_DAO: ${polySource.name}`
                  )}
              </span>
            )}

            <span className={`text-xs border rounded px-1.5 py-0.5 font-mono uppercase ${proposal.daoColor ?? "text-gray-400"} ${proposal.daoBorderColor ?? "border-gray-700"}`}>
              SIM_GOV: {proposal.daoName || simGovernor}
            </span>

            {proposal.sourceType && (
              <span className="text-[10px] border border-white/[0.08] text-[#4a4f5e] px-1.5 py-0.5 font-mono uppercase">
                via {proposal.sourceType}
              </span>
            )}

            <span className={`text-xs border rounded px-1.5 py-0.5 font-mono uppercase ${stateColorClass}`}>
              {stateLabel}
            </span>

            {isActive && timeRemaining !== null && (
              <span className="text-xs text-blue-400 font-mono animate-pulse">
                {formatTimeRemaining(timeRemaining)} left
              </span>
            )}

            {difficulty !== null && difficultyLabel && (
              <span className={`text-[10px] border rounded px-1.5 py-0.5 font-mono uppercase ${difficultyColor}`}>
                {difficultyLabel} ({difficulty})
              </span>
            )}
          </div>

          <p className={`text-[15px] leading-7 text-[#f5f5f0] ${expanded ? "" : "summary-clamp-2"}`}>
            {expanded ? cleanedDescription : summaryDescription}
          </p>
        </div>

        <div className="w-full lg:w-[320px] flex-shrink-0">
          {total > 0 ? (
            <>
              <div className="flex h-2 overflow-hidden gap-px bg-white/[0.04]">
                {forPct > 0 && <div className="bg-green-500 transition-all" style={{ width: `${forPct}%` }} />}
                {againstPct > 0 && <div className="bg-red-500 transition-all" style={{ width: `${againstPct}%` }} />}
                {abstainPct > 0 && <div className="bg-yellow-500 transition-all" style={{ width: `${abstainPct}%` }} />}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                <span className="text-green-400">FOR: {effectiveForVotes}</span>
                <span className="text-red-400">AGAINST: {effectiveAgainstVotes}</span>
                <span className="text-yellow-400">ABSTAIN: {effectiveAbstainVotes}</span>
              </div>
            </>
          ) : (
            <>
              <div className="h-2 bg-white/[0.04]" />
              <div className="mt-2 font-mono text-[11px] text-[#4a4f5e] uppercase">NO VOTES YET</div>
            </>
          )}
        </div>
      </div>

      <div className="px-5 py-3 flex flex-col gap-3 border-b border-white/[0.08] bg-[#0b0d14] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-[#4a4f5e] uppercase">
          <span>START: {formatTimestamp(proposal.startTime)}</span>
          <span>END: {formatTimestamp(proposal.endTime)}</span>
          <span>VOTERS: {visibleVoters.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={explorerAddress(proposal.governorAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-[#4a4f5e] uppercase hover:text-[#f5f5f0] transition-colors"
          >
            GOVERNOR ↗
          </a>
          <button
            onClick={() => setExpanded((value) => !value)}
            className="font-mono text-[10px] text-[#00ff88] uppercase tracking-widest border border-[#00ff88]/20 bg-[#00ff88]/5 px-3 py-1 hover:bg-[#00ff88]/10 transition-colors"
          >
            {expanded ? "HIDE_DETAILS" : "VIEW_DETAILS"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-4 bg-[#0a0c12] grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="space-y-4">
            <div className="border border-white/[0.08] bg-[#0d1017] px-4 py-4">
              <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-2">
                PROPOSAL_BRIEF
              </div>
              <p className="text-sm leading-7 text-[#f5f5f0]/85">{cleanedDescription}</p>
            </div>

            {visibleVoters.length > 0 && (
              <div className="border border-white/[0.08] bg-[#0d1017] px-4 py-4">
                <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-2">
                  AGENT_VOTES
                </div>
                <div className="flex flex-wrap gap-2">
                  {visibleVoters.map((voter, index) =>
                    voter.childId ? (
                      <Link
                        key={`${voter.childAddr}-${index}`}
                        href={`/agent/${encodeURIComponent(voter.childId)}`}
                        className={`text-xs font-mono font-semibold border rounded px-1.5 py-0.5 whitespace-nowrap hover:border-blue-400/60 hover:text-blue-200 ${supportChipColor(voter.support)}`}
                        title={voter.childAddr}
                      >
                        {ensName(voter.childLabel) ?? formatAddress(voter.childAddr)}: {supportLabel(voter.support)}
                      </Link>
                    ) : (
                      <span
                        key={`${voter.childAddr}-${index}`}
                        className={`text-xs font-mono font-semibold border rounded px-1.5 py-0.5 whitespace-nowrap ${supportChipColor(voter.support)}`}
                        title={voter.childAddr}
                      >
                        {ensName(voter.childLabel) ?? formatAddress(voter.childAddr)}: {supportLabel(voter.support)}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border border-white/[0.08] bg-[#0d1017]">
            <div className="border-b border-white/[0.08] px-4 py-2.5 font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
              EVIDENCE_PANEL
            </div>
            <div className="px-4 py-4 space-y-3 text-sm">
              <div>
                <div className="font-mono text-[10px] text-[#4a4f5e] uppercase mb-1">SOURCE_REF</div>
                <div className="font-mono text-[#f5f5f0]/80">
                  {proposal.sourceDaoName || polySource?.name || "Unknown source"}
                  {proposal.sourceRef ? ` · ${proposal.sourceRef}` : ""}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-[#4a4f5e] uppercase mb-1">SIMULATION_GOVERNOR</div>
                <div className="font-mono text-[#f5f5f0]/80">{simGovernor}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-[#4a4f5e] uppercase mb-1">MIRRORED_AT</div>
                <div className="font-mono text-[#f5f5f0]/80">{proposal.mirroredAt ? new Date(proposal.mirroredAt).toLocaleString() : "—"}</div>
              </div>
              <div className="pt-2 border-t border-white/[0.08] flex flex-wrap gap-2">
                <a
                  href={explorerAddress(proposal.governorAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono uppercase border border-blue-400/20 bg-blue-400/5 text-blue-300 px-2 py-1"
                >
                  Governor ↗
                </a>
                {tallyUrl && (
                  <a
                    href={tallyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono uppercase border border-cyan-400/20 bg-cyan-400/5 text-cyan-300 px-2 py-1"
                  >
                    Tally ↗
                  </a>
                )}
                {polyUrl && (
                  <a
                    href={polyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono uppercase border border-orange-400/20 bg-orange-400/5 text-orange-300 px-2 py-1"
                  >
                    Polymarket ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
