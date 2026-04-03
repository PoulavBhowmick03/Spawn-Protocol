"use client";

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
  "Arbitrum": "arbitrum",
  "Optimism": "optimism",
  "Optimism Governor": "optimism",
  "ZKsync": "zksync",
  "ZKsync Governors": "zksync",
  "Uniswap": "uniswap",
  "Compound": "compound",
  "ENS": "ens",
  "Aave": "aave",
  "Lido": "lido",
  "MakerDAO": "makerdao",
  "Wormhole": "wormhole",
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

function supportColor(support: number): string {
  if (support === 1) return "text-green-400";
  if (support === 0) return "text-red-400";
  return "text-yellow-400";
}

function supportChipColor(support: number): string {
  if (support === 1) return "text-green-200 border-green-500/60 bg-green-500/15";
  if (support === 0) return "text-red-200 border-red-500/60 bg-red-500/15";
  return "text-yellow-200 border-yellow-500/60 bg-yellow-500/15";
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const visibleVoters = proposal.voters.filter((v) => !v.childLabel.startsWith("judge-proof-"));
  const rawForVotes = Number(proposal.forVotes);
  const rawAgainstVotes = Number(proposal.againstVotes);
  const rawAbstainVotes = Number(proposal.abstainVotes);
  const rawTotal = rawForVotes + rawAgainstVotes + rawAbstainVotes;
  const derivedForVotes = visibleVoters.filter((v) => v.support === 1).length;
  const derivedAgainstVotes = visibleVoters.filter((v) => v.support === 0).length;
  const derivedAbstainVotes = visibleVoters.filter((v) => v.support !== 0 && v.support !== 1).length;
  const effectiveForVotes = rawTotal > 0 ? rawForVotes : derivedForVotes;
  const effectiveAgainstVotes = rawTotal > 0 ? rawAgainstVotes : derivedAgainstVotes;
  const effectiveAbstainVotes = rawTotal > 0 ? rawAbstainVotes : derivedAbstainVotes;
  const total = effectiveForVotes + effectiveAgainstVotes + effectiveAbstainVotes;

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

  // Clean description
  let displayDesc = proposal.description || "(No description)";
  // Remove all [Source — Real Governance via Tally] and [Source — Prediction Market via Polymarket] tags
  displayDesc = displayDesc.replace(/\[.+?[—–-]\s*Real Governance via Tally\]\s*/g, "");
  displayDesc = displayDesc.replace(/\[.+?[—–-]\s*Prediction Market via Polymarket\]\s*/g, "");
  // Remove Polymarket metadata lines (Source:, Market Data:, Volume:, Resolution:)
  displayDesc = displayDesc.replace(/^(Source|Market Data|Volume|Resolution):.*$/gm, "");
  // Remove leading bracketed tags like [Constitutional], [Uniswap Governance], etc.
  displayDesc = displayDesc.replace(/^(\[.+?\]\s*)+/g, "");
  // Remove any remaining internal bracketed tags
  displayDesc = displayDesc.replace(/\[.+?Governance\]\s*/g, "");
  // Remove duplicate sentences: split by "# " or ". " and deduplicate
  const sentences = displayDesc.split(/(?<=[.#])\s+/).filter((s) => s.trim().length > 10);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const s of sentences) {
    const key = s.trim().slice(0, 60).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(s);
    }
  }
  displayDesc = deduped.join(" ").trim();
  // Truncate
  if (displayDesc.length > 300) {
    displayDesc = displayDesc.slice(0, 300) + "...";
  }

  // Proposal difficulty scoring (0-100)
  // Based on: vote split closeness, voter count, description complexity
  const difficulty = (() => {
    if (total === 0) return null;
    // Vote split: 50/50 = max difficulty (100), unanimous = min (0)
    const majorityPct = Math.max(forPct, againstPct, abstainPct);
    const splitScore = Math.round((1 - (majorityPct - 50) / 50) * 100);
    // Voter engagement: more voters = harder (capped at 9)
    const voterScore = Math.min(visibleVoters.length / 9, 1) * 100;
    // Description length proxy for complexity
    const descLen = (proposal.description || "").length;
    const complexityScore = Math.min(descLen / 1500, 1) * 100;
    // Weighted: 50% split + 25% voters + 25% complexity
    return Math.round(splitScore * 0.5 + voterScore * 0.25 + complexityScore * 0.25);
  })();

  const difficultyLabel = difficulty === null ? null
    : difficulty >= 75 ? "Hard"
    : difficulty >= 50 ? "Medium"
    : difficulty >= 25 ? "Easy"
    : "Trivial";

  const difficultyColor = difficulty === null ? ""
    : difficulty >= 75 ? "text-red-400 border-red-400/30 bg-red-400/5"
    : difficulty >= 50 ? "text-orange-400 border-orange-400/30 bg-orange-400/5"
    : difficulty >= 25 ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/5"
    : "text-green-400 border-green-400/30 bg-green-400/5";

  // Tally link for source DAO
  const tallySlug = proposal.sourceDaoName ? TALLY_DAO_SLUGS[proposal.sourceDaoName] : null;
  const tallyUrl = tallySlug ? `https://www.tally.xyz/gov/${tallySlug}` : null;

  // Polymarket source
  const polySource = parsePolymarketSource(proposal.description);
  const isPolymarket = !!polySource;
  // Extract polymarket event slug from description for link
  const polySlugMatch = proposal.description.match(/polymarket\.com\/event\/([^\s\n]+)/);
  const polyUrl = polySlugMatch ? `https://polymarket.com/event/${polySlugMatch[1]}` : null;

  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14] hover:bg-[#12121c] transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-gray-600">
              #{proposal.id.toString()}
            </span>
            {/* Our MockGovernor DAO */}
            {proposal.daoName && (
              <span className={`text-xs border rounded px-1.5 py-0.5 font-mono font-semibold ${proposal.daoColor ?? "text-gray-400"} ${proposal.daoBorderColor ?? "border-gray-700"}`}>
                {proposal.daoName}
              </span>
            )}
            {/* Source DAO from Tally */}
            {proposal.sourceDaoName && (
              <span className="text-xs border border-cyan-400/30 bg-cyan-400/5 text-cyan-400 rounded px-1.5 py-0.5 font-mono flex items-center gap-1">
                {tallyUrl ? (
                  <a href={tallyUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {proposal.sourceDaoName} ↗
                  </a>
                ) : (
                  proposal.sourceDaoName
                )}
              </span>
            )}
            {proposal.tallySource && (
              <span className="text-[10px] border border-gray-700 text-gray-500 rounded px-1 py-0.5 font-mono uppercase">
                via Tally
              </span>
            )}
            {isPolymarket && (
              <>
                <span className="text-xs border border-orange-400/30 bg-orange-400/5 text-orange-400 rounded px-1.5 py-0.5 font-mono flex items-center gap-1">
                  {polyUrl ? (
                    <a href={polyUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {polySource.name} ↗
                    </a>
                  ) : (
                    polySource.name
                  )}
                </span>
                <span className="text-[10px] border border-gray-700 text-gray-500 rounded px-1 py-0.5 font-mono uppercase">
                  via Polymarket
                </span>
              </>
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
            {difficulty !== null && difficultyLabel && (
              <span className={`text-[10px] border rounded px-1.5 py-0.5 font-mono ${difficultyColor}`}>
                {difficultyLabel} ({difficulty})
              </span>
            )}
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">
            {displayDesc}
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs font-mono">
            <span className="text-green-400">
              FOR: {effectiveForVotes} ({forPct.toFixed(0)}%)
            </span>
            <span className="text-red-400">
              AGAINST: {effectiveAgainstVotes} ({againstPct.toFixed(0)}%)
            </span>
            {effectiveAbstainVotes > 0 && (
              <span className="text-yellow-400">
                ABSTAIN: {effectiveAbstainVotes} ({abstainPct.toFixed(0)}%)
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <div className="h-2 rounded bg-gray-800" />
          <p className="text-xs text-gray-600 mt-1">No votes yet</p>
        </div>
      )}

      {/* Voter breakdown */}
      {visibleVoters.length > 0 && (
        <div className="mb-3 border-t border-gray-800 pt-2">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Agent Votes</p>
          <div className="flex flex-wrap gap-2">
            {visibleVoters.map((v, i) => (
              <span
                key={i}
                className={`text-xs font-mono font-semibold border rounded px-1.5 py-0.5 whitespace-nowrap ${supportChipColor(v.support)}`}
                title={`${v.childAddr}`}
              >
                {ensName(v.childLabel) ?? formatAddress(v.childAddr)}: {supportLabel(v.support)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timestamps + Governor link */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 font-mono items-center">
        <span>Start: {formatTimestamp(proposal.startTime)}</span>
        <span>End: {formatTimestamp(proposal.endTime)}</span>
        <span className="sm:ml-auto">
          <a
            href={explorerAddress(proposal.governorAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-gray-400 transition-colors"
          >
            Governor: {governorName(proposal.governorAddress) ?? formatAddress(proposal.governorAddress)} ↗
          </a>
        </span>
      </div>
    </div>
  );
}
