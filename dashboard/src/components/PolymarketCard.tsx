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
    <div className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14] hover:bg-[#12121c] transition-all">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {market.image && (
          <img
            src={market.image}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-700"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs border border-orange-400/30 bg-orange-400/5 text-orange-400 rounded px-1.5 py-0.5 font-mono font-semibold">
              Polymarket
            </span>
            <span className="text-xs border border-blue-400 text-blue-400 rounded px-1.5 py-0.5 font-mono">
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
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">{desc}</p>
      )}

      {/* Outcome probabilities */}
      {hasOutcomes && (
        <div className="mb-3">
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
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 font-mono items-center">
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
    </div>
  );
}
