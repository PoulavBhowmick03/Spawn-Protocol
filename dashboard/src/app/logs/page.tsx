"use client";

import { useState, useEffect, useMemo } from "react";
import { explorerTx } from "@/lib/contracts";

interface LogEntry {
  timestamp: string;
  phase: string;
  action: string;
  details: string;
  chain?: string;
  txHash?: string;
  txHashes?: string[];
  childId?: number;
  proposalId?: number;
  decision?: string;
  reasoningProvider?: string;
  reasoningModel?: string;
  rationaleEncrypted?: boolean;
  erc8004AgentId?: number;
  uri?: string;
  ensLabel?: string;
  status: string;
  verifyIn?: string;
}

interface AgentLog {
  agentName: string;
  version: string;
  note?: string;
  executionLogs: LogEntry[];
  metrics: {
    totalOnchainTransactions: number;
    chainsDeployed: string[];
    contractsDeployed: number;
    agentsRegistered: number;
    proposalsCreated: number;
    votesCast: number;
    alignmentEvaluations: number;
    childrenSpawned: number;
    childrenTerminated: number;
    reasoningCalls: number;
    reasoningProvider: string;
    reasoningModel: string;
  };
}

const PHASE_COLORS: Record<string, string> = {
  initialization: "text-purple-400 border-purple-400/30 bg-purple-400/5",
  spawn:          "text-green-400 border-green-400/30 bg-green-400/5",
  governance:     "text-blue-400 border-blue-400/30 bg-blue-400/5",
  voting:         "text-cyan-400 border-cyan-400/30 bg-cyan-400/5",
  alignment:      "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  termination:    "text-red-400 border-red-500/50 bg-red-400/5",
  deployment:     "text-orange-400 border-orange-400/30 bg-orange-400/5",
};

const PHASE_ICONS: Record<string, string> = {
  initialization: "◈",
  spawn:          "⊕",
  governance:     "◎",
  voting:         "◉",
  alignment:      "◐",
  termination:    "⊗",
  deployment:     "◆",
};

const PAGE_SIZE = 20;

function formatTime(ts: string) {
  return new Date(ts).toLocaleString();
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export default function LogsPage() {
  const [log, setLog] = useState<AgentLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/main/agent_log.json")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setLog(data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const phases = log
    ? ["all", ...new Set(log.executionLogs.map((e) => e.phase))]
    : ["all"];

  const filtered = useMemo(() => {
    let entries = log?.executionLogs ?? [];
    if (phase !== "all") entries = entries.filter((e) => e.phase === phase);
    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.details.toLowerCase().includes(q) ||
          (e.ensLabel ?? "").toLowerCase().includes(q) ||
          (e.chain ?? "").toLowerCase().includes(q)
      );
    }
    return entries;
  }, [log, phase, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 on filter/search change
  useEffect(() => { setPage(1); }, [phase, search]);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-orange-400 tracking-tight">
            Execution Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Autonomous execution evidence — Protocol Labs "Agents With Receipts" + "Let the Agent Cook"
          </p>
        </div>
        {log && (
          <div className="text-right text-xs font-mono text-gray-600">
            <div className="text-gray-400">{log.agentName} v{log.version}</div>
            <div className="mt-0.5">{log.executionLogs.length} total entries</div>
          </div>
        )}
      </div>

      {/* Primary metrics */}
      {log && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Onchain Txs",        value: log.metrics.totalOnchainTransactions, color: "text-green-400" },
            { label: "Votes Cast",          value: log.metrics.votesCast,                color: "text-cyan-400" },
            { label: "Venice Calls",        value: log.metrics.reasoningCalls,           color: "text-yellow-400" },
            { label: "Agents Registered",   value: log.metrics.agentsRegistered,         color: "text-purple-400" },
          ].map((m) => (
            <div key={m.label} className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14]">
              <div className={`text-3xl font-mono font-bold ${m.color}`}>{m.value}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Secondary metrics */}
      {log && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: "Chains",          value: log.metrics.chainsDeployed.join(", ") },
            { label: "Contracts",       value: log.metrics.contractsDeployed },
            { label: "Proposals",       value: log.metrics.proposalsCreated },
            { label: "Spawned",         value: log.metrics.childrenSpawned },
            { label: "Terminated",      value: log.metrics.childrenTerminated },
            { label: "Align Evals",     value: log.metrics.alignmentEvaluations },
            { label: "Reasoning",       value: `${log.metrics.reasoningProvider} / ${log.metrics.reasoningModel}` },
          ].map((m) => (
            <div key={m.label} className="border border-gray-800 rounded p-3 bg-[#0d0d14]">
              <div className="text-xs text-gray-300 font-mono truncate">{String(m.value)}</div>
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Note */}
      {log?.note && (
        <div className="mb-6 border border-orange-500/20 bg-orange-500/5 rounded-lg px-4 py-3">
          <p className="text-xs text-orange-300/70 font-mono">{log.note}</p>
        </div>
      )}

      {/* Filters + Search */}
      {!loading && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Phase tabs */}
          <div className="flex gap-2 flex-wrap">
            {phases.map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`text-xs font-mono border rounded px-3 py-1 transition-all ${
                  phase === p
                    ? "border-orange-400/60 text-orange-300 bg-orange-400/10"
                    : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400"
                }`}
              >
                {p === "all" ? `All (${log?.executionLogs.length ?? 0})` : `${PHASE_ICONS[p] ?? "◦"} ${p}`}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative sm:ml-auto">
            <input
              type="text"
              placeholder="Search entries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56 bg-[#0d0d14] border border-gray-700 rounded px-3 py-1 text-xs font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-orange-400/50"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 text-xs"
              >✕</button>
            )}
          </div>
        </div>
      )}

      {/* Result count */}
      {!loading && (search || phase !== "all") && (
        <div className="mb-3 text-xs font-mono text-gray-600">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          {phase !== "all" ? ` in phase "${phase}"` : ""}
          {search ? ` matching "${search}"` : ""}
        </div>
      )}

      {error && (
        <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm font-mono">Failed to fetch log: {error}</p>
          <p className="text-gray-500 text-xs mt-1">
            Raw:{" "}
            <a href="https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/main/agent_log.json"
              className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
              agent_log.json on GitHub
            </a>
          </p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14] animate-pulse">
              <div className="h-3 bg-gray-800 rounded mb-2 w-1/4" />
              <div className="h-4 bg-gray-800 rounded mb-2 w-3/4" />
              <div className="h-3 bg-gray-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Log entries */}
      {!loading && paginated.length > 0 && (
        <>
          <div className="space-y-2">
            {paginated.map((entry, i) => {
              const phaseClass = PHASE_COLORS[entry.phase] ?? "text-gray-400 border-gray-700 bg-gray-900";
              const icon = PHASE_ICONS[entry.phase] ?? "◦";
              const isTermination = entry.phase === "termination";
              const allHashes = [
                ...(entry.txHash ? [entry.txHash] : []),
                ...(entry.txHashes ?? []),
              ];

              return (
                <div
                  key={i}
                  className={`border rounded-lg p-4 bg-[#0d0d14] hover:bg-[#12121c] transition-all ${
                    isTermination
                      ? "border-red-500/40 border-l-4 border-l-red-500"
                      : "border-gray-800"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Phase badge */}
                    <span className={`text-xs border rounded px-1.5 py-0.5 font-mono shrink-0 mt-0.5 ${phaseClass}`}>
                      {icon} {entry.phase}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* Action + status + chain */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`font-mono text-sm font-semibold ${isTermination ? "text-red-300" : "text-gray-200"}`}>
                          {entry.action}
                        </span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          entry.status === "success"
                            ? "text-green-400 bg-green-400/10 border border-green-400/20"
                            : "text-red-400 bg-red-400/10 border border-red-400/20"
                        }`}>
                          {entry.status}
                        </span>
                        {entry.chain && (
                          <span className="text-[10px] font-mono text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">
                            {entry.chain}
                          </span>
                        )}
                      </div>

                      {/* Details */}
                      <p className="text-xs text-gray-400 leading-relaxed mb-2">
                        {entry.details}
                      </p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {entry.reasoningProvider && (
                          <span className="text-[10px] font-mono border border-yellow-400/30 text-yellow-400 bg-yellow-400/5 rounded px-1.5 py-0.5">
                            Venice {entry.reasoningModel}
                          </span>
                        )}
                        {entry.rationaleEncrypted && (
                          <span className="text-[10px] font-mono border border-cyan-400/30 text-cyan-400 bg-cyan-400/5 rounded px-1.5 py-0.5">
                            Lit encrypted
                          </span>
                        )}
                        {entry.decision && (
                          <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${
                            entry.decision === "FOR"
                              ? "border-green-400/30 text-green-400 bg-green-400/5"
                              : entry.decision === "AGAINST"
                              ? "border-red-400/30 text-red-400 bg-red-400/5"
                              : "border-yellow-400/30 text-yellow-400 bg-yellow-400/5"
                          }`}>
                            {entry.decision}
                          </span>
                        )}
                        {entry.erc8004AgentId !== undefined && (
                          <span className="text-[10px] font-mono border border-purple-400/30 text-purple-400 bg-purple-400/5 rounded px-1.5 py-0.5">
                            ERC-8004 #{entry.erc8004AgentId}
                          </span>
                        )}
                        {entry.ensLabel && (
                          <span className="text-[10px] font-mono border border-blue-400/30 text-blue-400 bg-blue-400/5 rounded px-1.5 py-0.5">
                            {entry.ensLabel}.spawn.eth
                          </span>
                        )}
                      </div>

                      {/* Tx hashes */}
                      {allHashes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {allHashes.map((hash) => (
                            <a
                              key={hash}
                              href={explorerTx(hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors bg-blue-400/5 border border-blue-400/20 rounded px-1.5 py-0.5"
                            >
                              {shortHash(hash)} ↗
                            </a>
                          ))}
                        </div>
                      )}

                      {entry.verifyIn && (
                        <p className="text-[10px] text-gray-600 font-mono mt-1.5">
                          Verify: {entry.verifyIn}
                        </p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] text-gray-600 font-mono shrink-0 whitespace-nowrap">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2 font-mono text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:border-orange-500 hover:text-orange-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const isNear = Math.abs(p - page) <= 2 || p === 1 || p === totalPages;
                const ellipsisBefore = p === page - 3 && p > 2;
                const ellipsisAfter  = p === page + 3 && p < totalPages - 1;
                if (ellipsisBefore || ellipsisAfter) return <span key={p} className="text-gray-600 px-1">…</span>;
                if (!isNear) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded border transition-colors ${
                      p === page
                        ? "border-orange-500 bg-orange-500/10 text-orange-400"
                        : "border-gray-700 text-gray-500 hover:border-orange-500/50 hover:text-orange-400"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:border-orange-500 hover:text-orange-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>

              <span className="ml-4 text-gray-600 text-xs">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
            </div>
          )}
        </>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">◉</div>
          <h2 className="font-mono text-lg text-gray-400">No matching entries</h2>
          {(search || phase !== "all") && (
            <button
              onClick={() => { setSearch(""); setPhase("all"); }}
              className="mt-4 text-xs font-mono text-orange-400 hover:text-orange-300 border border-orange-400/30 rounded px-3 py-1"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
