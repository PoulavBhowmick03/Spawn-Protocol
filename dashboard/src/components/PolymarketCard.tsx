"use client";

import type { PolymarketMarket } from "@/hooks/usePolymarket";

interface PolymarketCardProps {
  market: PolymarketMarket;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PolymarketCard({ market }: PolymarketCardProps) {
  const polyUrl = `https://polymarket.com/event/${market.slug}`;

  // Truncate description
  let desc = market.description;
  if (desc.length > 250) desc = desc.slice(0, 250) + "...";

  // Outcome bars
  const hasOutcomes = market.outcomes.length > 0 && market.outcomePrices.length > 0;

  return (
    <article className="relative overflow-hidden border border-white/[0.1] bg-[#0f1118] transition-colors hover:border-white/[0.16] shadow-[0_0_0_1px_rgba(245,166,35,0.08),0_18px_42px_rgba(12,8,0,0.38)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-orange-400/45 via-orange-300/20 to-transparent" />
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-orange-400/90" />

      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0))]">
        {market.image && (
          <img
            src={market.image}
            alt=""
            className="w-10 h-10 object-cover flex-shrink-0 border border-white/[0.08]"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs border border-orange-400/30 bg-orange-400/5 text-orange-400 px-1.5 py-0.5 font-mono font-semibold uppercase">
              Polymarket
            </span>
            <span className="text-xs border border-blue-400 text-blue-400 px-1.5 py-0.5 font-mono uppercase">
              Active
            </span>
            {market.volume24hr > 0 && (
              <span className="text-[10px] text-gray-500 font-mono">
                24h vol: {formatVolume(market.volume24hr)}
              </span>
            )}
          </div>
          <a
            href={polyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-200 leading-relaxed hover:text-orange-300 transition-colors"
          >
            {market.question}
          </a>
        </div>
      </div>

      {/* Description */}
      {desc && (
        <p className="px-5 py-3 text-xs text-gray-500 leading-relaxed border-b border-white/[0.08] bg-[#0b0d14]">{desc}</p>
      )}

      {/* Outcome probabilities */}
      {hasOutcomes && (
        <div className="px-5 py-3 border-b border-white/[0.08] bg-[#0a0c12]">
          <div className="flex h-2 rounded overflow-hidden gap-px">
            {market.outcomes.map((outcome, i) => {
              const pct = (market.outcomePrices[i] || 0) * 100;
              const color =
                outcome.toLowerCase() === "yes"
                  ? "bg-green-500"
                  : outcome.toLowerCase() === "no"
                  ? "bg-red-500"
                  : "bg-yellow-500";
              return pct > 0 ? (
                <div
                  key={i}
                  className={`${color} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              ) : null;
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs font-mono">
            {market.outcomes.map((outcome, i) => {
              const pct = (market.outcomePrices[i] || 0) * 100;
              const color =
                outcome.toLowerCase() === "yes"
                  ? "text-green-400"
                  : outcome.toLowerCase() === "no"
                  ? "text-red-400"
                  : "text-yellow-400";
              return (
                <span key={i} className={color}>
                  {outcome}: {pct.toFixed(1)}%
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 font-mono items-center bg-[#0b0d14]">
        <span>Vol: {formatVolume(market.volume)}</span>
        <span>Liq: {formatVolume(market.liquidity)}</span>
        <span>Ends: {formatDate(market.endDate)}</span>
        <span className="sm:ml-auto">
          <a
            href={polyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-orange-400 transition-colors"
          >
            View on Polymarket ↗
          </a>
        </span>
      </div>
    </article>
  );
}
