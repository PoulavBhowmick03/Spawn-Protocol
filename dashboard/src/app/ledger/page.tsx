"use client";

import { useState, useEffect, useMemo } from "react";
import { useTimeline } from "@/hooks/useTimeline";
import { explorerTx, formatAddress, ensName } from "@/lib/contracts";
import type { TimelineEvent } from "@/hooks/useTimeline";

const PAGE_SIZE = 50;

type FilterType = "ALL" | "SPAWN" | "VOTE" | "TERMINATE" | "ALIGNMENT" | "REVEALED" | "DEPOSIT";

const EVENT_TYPE_MAP: Record<string, FilterType> = {
  ChildSpawned:      "SPAWN",
  ChildTerminated:   "TERMINATE",
  VoteCast:          "VOTE",
  AlignmentUpdated:  "ALIGNMENT",
  RationaleRevealed: "REVEALED",
  FundsReallocated:  "DEPOSIT",
  ValuesUpdated:     "ALIGNMENT",
  Deposited:         "DEPOSIT",
};

const EVENT_STYLE: Record<string, {
  label: string;
  color: string;
  border: string;
  bg: string;
  leftBorder: string;
  dot: string;
}> = {
  ChildSpawned:      { label: "SPAWN",       color: "text-[#00ff88]",   border: "border-[#00ff88]/30",   bg: "bg-[#00ff88]/5",         leftBorder: "border-l-[#00ff88]/60",    dot: "bg-[#00ff88]" },
  ChildTerminated:   { label: "TERMINATE",   color: "text-[#ff3b3b]",   border: "border-[#ff3b3b]/30",   bg: "bg-[#ff3b3b]/5",         leftBorder: "border-l-[#ff3b3b]",       dot: "bg-[#ff3b3b]" },
  VoteCast:          { label: "VOTE",         color: "text-blue-400",    border: "border-blue-400/30",    bg: "bg-blue-400/5",          leftBorder: "border-l-blue-400/60",     dot: "bg-blue-400" },
  AlignmentUpdated:  { label: "ALIGNMENT",   color: "text-[#f5a623]",   border: "border-[#f5a623]/30",   bg: "bg-[#f5a623]/5",         leftBorder: "border-l-[#f5a623]/60",    dot: "bg-[#f5a623]" },
  RationaleRevealed: { label: "REVEALED",    color: "text-purple-400",  border: "border-purple-400/30",  bg: "bg-purple-400/5",        leftBorder: "border-l-purple-400/60",   dot: "bg-purple-400" },
  FundsReallocated:  { label: "REALLOCATED", color: "text-[#f5a623]",   border: "border-[#f5a623]/30",   bg: "bg-[#f5a623]/5",         leftBorder: "border-l-[#f5a623]/40",    dot: "bg-[#f5a623]" },
  ValuesUpdated:     { label: "VALUES",      color: "text-[#f5a623]",   border: "border-[#f5a623]/30",   bg: "bg-[#f5a623]/5",         leftBorder: "border-l-[#f5a623]/40",    dot: "bg-[#f5a623]" },
  Deposited:         { label: "DEPOSIT",     color: "text-[#00ff88]",   border: "border-[#00ff88]/30",   bg: "bg-[#00ff88]/5",         leftBorder: "border-l-[#00ff88]/40",    dot: "bg-[#00ff88]" },
};

const FILTER_DEFS: { label: string; value: FilterType; color: string }[] = [
  { label: "ALL",       value: "ALL",       color: "text-[#f5f5f0]" },
  { label: "VOTE",      value: "VOTE",      color: "text-blue-400" },
  { label: "SPAWN",     value: "SPAWN",     color: "text-[#00ff88]" },
  { label: "TERMINATE", value: "TERMINATE", color: "text-[#ff3b3b]" },
  { label: "ALIGNMENT", value: "ALIGNMENT", color: "text-[#f5a623]" },
  { label: "REVEALED",  value: "REVEALED",  color: "text-purple-400" },
];

// Rich event descriptions with fragments for inline coloring
function EventDescription({ event }: { event: TimelineEvent }) {
  const d = event.data;

  switch (event.type) {
    case "ChildSpawned": {
      const label = d.ensLabel ? (ensName(String(d.ensLabel)) ?? String(d.ensLabel)) : `child #${d.childId}`;
      const budget = d.budget ? (Number(d.budget) / 1e18).toFixed(4) : "?";
      return (
        <span>
          <span className="text-[#00ff88]">{label}</span>
          <span className="text-[#4a4f5e]"> spawned — </span>
          <span className="text-[#f5f5f0]/70">{budget} ETH</span>
          <span className="text-[#4a4f5e]"> budget</span>
        </span>
      );
    }
    case "ChildTerminated": {
      const label = d.ensLabel ? (ensName(String(d.ensLabel)) ?? String(d.ensLabel)) : `agent #${d.childId}`;
      return (
        <span>
          <span className="text-[#ff3b3b]">{label}</span>
          <span className="text-[#4a4f5e]"> terminated — </span>
          <span className="text-[#ff3b3b]/70">MISALIGNMENT</span>
        </span>
      );
    }
    case "VoteCast": {
      const supportLabels = ["AGAINST", "FOR", "ABSTAIN"] as const;
      const supportNum = Number(d.support);
      const voteLabel = supportLabels[supportNum] ?? "?";
      const voteColor = voteLabel === "FOR" ? "text-[#00ff88]" : voteLabel === "AGAINST" ? "text-[#ff3b3b]" : "text-[#f5a623]";
      const agentLabel = d.ensLabel
        ? (ensName(String(d.ensLabel)) ?? formatAddress(String(d.childAddr)))
        : formatAddress(String(d.childAddr));
      return (
        <span>
          <span className="text-blue-300">{agentLabel}</span>
          <span className="text-[#4a4f5e]"> voted </span>
          <span className={`font-bold ${voteColor}`}>{voteLabel}</span>
          <span className="text-[#4a4f5e]"> on proposal </span>
          <span className="text-[#f5f5f0]/60">#{String(d.proposalId).slice(-8)}</span>
        </span>
      );
    }
    case "AlignmentUpdated": {
      const score = Number(d.newScore);
      const scoreColor = score >= 70 ? "text-[#00ff88]" : score >= 40 ? "text-[#f5a623]" : "text-[#ff3b3b]";
      const agentLabel = d.ensLabel
        ? (ensName(String(d.ensLabel)) ?? formatAddress(String(d.childAddr)))
        : formatAddress(String(d.childAddr));
      const prevScore = Number(d.oldScore ?? 0);
      const delta = score - prevScore;
      return (
        <span>
          <span className="text-[#f5a623]/80">{agentLabel}</span>
          <span className="text-[#4a4f5e]"> alignment → </span>
          <span className={`font-bold ${scoreColor}`}>{score}</span>
          <span className="text-[#4a4f5e]">/100</span>
          {delta !== 0 && (
            <span className={`ml-1 text-[10px] ${delta > 0 ? "text-[#00ff88]/60" : "text-[#ff3b3b]/60"}`}>
              ({delta > 0 ? "+" : ""}{delta})
            </span>
          )}
        </span>
      );
    }
    case "RationaleRevealed":
      return (
        <span>
          <span className="text-[#4a4f5e]">rationale revealed — proposal </span>
          <span className="text-purple-300">#{String(d.proposalId).slice(-8)}</span>
        </span>
      );
    case "FundsReallocated": {
      const amt = d.amount ? (Number(d.amount) / 1e18).toFixed(4) : "?";
      return (
        <span>
          <span className="text-[#f5a623]">{amt} ETH</span>
          <span className="text-[#4a4f5e]"> reallocated from child </span>
          <span className="text-[#f5f5f0]/60">#{String(d.fromId)}</span>
          <span className="text-[#4a4f5e]"> → </span>
          <span className="text-[#f5f5f0]/60">#{String(d.toId)}</span>
        </span>
      );
    }
    case "ValuesUpdated": {
      const val = String(d.values ?? "").slice(0, 50);
      return (
        <span>
          <span className="text-[#4a4f5e]">governance values updated: </span>
          <span className="text-[#f5f5f0]/60">&ldquo;{val}{String(d.values ?? "").length > 50 ? "…" : ""}&rdquo;</span>
        </span>
      );
    }
    case "Deposited": {
      const amt = d.amount ? (Number(d.amount) / 1e18).toFixed(4) : "?";
      return (
        <span>
          <span className="text-[#00ff88]">{amt} ETH</span>
          <span className="text-[#4a4f5e]"> deposited from </span>
          <span className="text-[#f5f5f0]/50">{formatAddress(String(d.from))}</span>
        </span>
      );
    }
    default:
      return <span className="text-[#4a4f5e]">{event.type}</span>;
  }
}

function formatTime(timestamp: bigint | undefined): string {
  if (!timestamp || timestamp === BigInt(0)) return "";
  const d = new Date(Number(timestamp) * 1000);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDate(timestamp: bigint | undefined): string {
  if (!timestamp || timestamp === BigInt(0)) return "";
  return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    month: "short", day: "2-digit",
  }).toUpperCase();
}

// Auto-refreshing "last updated" display
function LiveBadge({ latestTimestamp }: { latestTimestamp: bigint | undefined }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [latestTimestamp]);
  useEffect(() => setElapsed(0), [latestTimestamp]);
  return (
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
      <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
        LIVE — {elapsed < 60 ? `${elapsed}S AGO` : "30S"}
      </span>
    </div>
  );
}

export default function TimelinePage() {
  const { events, loading, error } = useTimeline();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterType>("ALL");

  const counts = useMemo(() => {
    const c: Record<FilterType, number> = { ALL: 0, SPAWN: 0, VOTE: 0, TERMINATE: 0, ALIGNMENT: 0, REVEALED: 0, DEPOSIT: 0 };
    c.ALL = events.length;
    for (const e of events) {
      const f = EVENT_TYPE_MAP[e.type];
      if (f) c[f] = (c[f] ?? 0) + 1;
    }
    return c;
  }, [events]);

  const filtered = useMemo(
    () => filter === "ALL" ? events : events.filter((e) => EVENT_TYPE_MAP[e.type] === filter),
    [events, filter]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const latestTimestamp = events[0]?.timestamp;
  const latestBlock = events[0]?.blockNumber;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-mono text-sm font-bold text-[#f5f5f0] uppercase tracking-widest">
            THE_LEDGER
          </h1>
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            ONCHAIN_EVENT_STREAM — BASE_SEPOLIA
          </span>
        </div>
        <div className="flex items-center gap-4">
          {latestBlock && (
            <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
              BLOCK <span className="text-[#f5f5f0]/40">#{latestBlock.toString()}</span>
            </span>
          )}
          <LiveBadge latestTimestamp={latestTimestamp} />
        </div>
      </div>

      {/* Stat strip — event counts per type */}
      <div className="border-b border-white/[0.08] grid grid-cols-3 sm:grid-cols-6">
        {[
          { label: "VOTES",       count: counts.VOTE,      color: "text-blue-400" },
          { label: "SPAWNS",      count: counts.SPAWN,     color: "text-[#00ff88]" },
          { label: "TERMINATED",  count: counts.TERMINATE, color: "text-[#ff3b3b]" },
          { label: "ALIGNMENTS",  count: counts.ALIGNMENT, color: "text-[#f5a623]" },
          { label: "REVEALED",    count: counts.REVEALED,  color: "text-purple-400" },
          { label: "TOTAL",       count: counts.ALL,       color: "text-[#f5f5f0]" },
        ].map((s, i) => (
          <div key={s.label} className={`px-5 py-3 ${i < 5 ? "border-r border-white/[0.08]" : ""}`}>
            <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-0.5">
              {s.label}
            </div>
            <div className={`font-mono text-2xl font-bold leading-none ${s.color}`}>
              {loading ? "—" : s.count}
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="border-b border-white/[0.08] px-4 flex items-center gap-0 overflow-x-auto">
        {FILTER_DEFS.map((f) => {
          const isActive = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1); }}
              className={`flex items-center gap-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest border-b-2 transition-colors flex-shrink-0 ${
                isActive
                  ? `${f.color} border-current`
                  : "text-[#4a4f5e] border-transparent hover:text-[#f5f5f0]"
              }`}
            >
              {f.label}
              {counts[f.value] > 0 && (
                <span className={`text-[9px] tabular-nums ${isActive ? "opacity-60" : "opacity-40"}`}>
                  {counts[f.value]}
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto px-4 py-2.5 flex-shrink-0">
          <span className="font-mono text-[10px] text-[#4a4f5e]">
            {filtered.length} EVENTS
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 border border-[#ff3b3b]/30 bg-[#ff3b3b]/5 px-4 py-3">
          <p className="font-mono text-[11px] text-[#ff3b3b] uppercase">ERROR: {error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div>
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className={`border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-4 animate-pulse ${
                i % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]"
              }`}
            >
              <div className="w-14 h-2.5 bg-white/[0.06]" />
              <div className="w-20 h-5 bg-white/[0.06]" />
              <div className="flex-1 h-2.5 bg-white/[0.06]" />
              <div className="w-24 h-2.5 bg-white/[0.06]" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="m-4 border border-white/[0.08] p-12 text-center">
          <div className="mb-4 text-3xl text-[#4a4f5e]">≡</div>
          <h2 className="font-mono text-sm text-[#4a4f5e] uppercase tracking-widest">NO EVENTS</h2>
          <p className="mt-2 font-mono text-[11px] text-[#4a4f5e]/60 uppercase">
            {filter !== "ALL" ? `NO ${filter} EVENTS RECORDED` : "EVENTS WILL APPEAR AS THE SWARM OPERATES"}
          </p>
          {filter !== "ALL" && (
            <button
              onClick={() => setFilter("ALL")}
              className="mt-4 font-mono text-[10px] text-[#00ff88] uppercase border border-[#00ff88]/30 px-4 py-1.5 hover:bg-[#00ff88]/10 transition-colors"
            >
              SHOW_ALL →
            </button>
          )}
        </div>
      )}

      {/* Event rows */}
      {!loading && paginated.length > 0 && (
        <div>
          {/* Column labels */}
          <div className="border-b border-white/[0.08] bg-[#0a0a0f] px-4 py-1.5 grid grid-cols-[90px_90px_100px_1fr_110px] gap-x-4 items-center">
            {["TIME", "DATE", "EVENT", "DESCRIPTION", "TX"].map((h) => (
              <span key={h} className="font-mono text-[9px] text-[#4a4f5e] uppercase tracking-widest">
                {h}
              </span>
            ))}
          </div>

          {paginated.map((event, i) => {
            const style = EVENT_STYLE[event.type] ?? {
              label: event.type, color: "text-[#4a4f5e]",
              border: "border-white/[0.08]", bg: "bg-transparent",
              leftBorder: "border-l-[#4a4f5e]/20", dot: "bg-[#4a4f5e]",
            };
            const rowBg = i % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]";
            const timeStr = formatTime(event.timestamp);
            const dateStr = formatDate(event.timestamp);

            return (
              <div
                key={event.id}
                className={`border-b border-white/[0.05] border-l-2 ${style.leftBorder} ${rowBg} hover:brightness-110 transition-all`}
              >
                <div className="px-4 py-2.5 grid grid-cols-[90px_90px_100px_1fr_110px] gap-x-4 items-center">
                  {/* Time */}
                  <div>
                    {timeStr ? (
                      <span className="font-mono text-[10px] text-[#f5f5f0]/40 tabular-nums">{timeStr}</span>
                    ) : (
                      <span className="font-mono text-[10px] text-[#4a4f5e] tabular-nums">
                        #{event.blockNumber.toString().slice(-6)}
                      </span>
                    )}
                  </div>

                  {/* Date */}
                  <span className="font-mono text-[9px] text-[#4a4f5e]">{dateStr || "—"}</span>

                  {/* Event type chip */}
                  <span className={`font-mono text-[9px] uppercase border px-2 py-0.5 leading-none w-fit ${style.color} ${style.border} ${style.bg}`}>
                    {style.label}
                  </span>

                  {/* Description */}
                  <span className="font-mono text-[11px] truncate">
                    <EventDescription event={event} />
                  </span>

                  {/* TX hash */}
                  {event.transactionHash && event.transactionHash !== "0x" ? (
                    <a
                      href={explorerTx(event.transactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-[#4a4f5e] hover:text-[#f5f5f0] transition-colors truncate text-right"
                    >
                      {event.transactionHash.slice(0, 8)}…{event.transactionHash.slice(-4)} ↗
                    </a>
                  ) : (
                    <span />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="border-t border-white/[0.08] px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="font-mono text-[10px] text-[#4a4f5e] uppercase border border-white/[0.08] px-2 py-1.5 hover:text-[#f5f5f0] hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="font-mono text-[10px] text-[#4a4f5e] uppercase border border-white/[0.08] px-3 py-1.5 hover:text-[#f5f5f0] hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← PREV
          </button>
          <span className="font-mono text-[10px] text-[#4a4f5e] px-2">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="font-mono text-[10px] text-[#4a4f5e] uppercase border border-white/[0.08] px-3 py-1.5 hover:text-[#f5f5f0] hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            NEXT →
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="font-mono text-[10px] text-[#4a4f5e] uppercase border border-white/[0.08] px-2 py-1.5 hover:text-[#f5f5f0] hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            »
          </button>
          <span className="ml-auto font-mono text-[10px] text-[#4a4f5e]">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} OF {filtered.length}
          </span>
        </div>
      )}
    </div>
  );
}
