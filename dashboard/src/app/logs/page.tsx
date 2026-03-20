"use client";

import { useState, useEffect, useMemo } from "react";
import { explorerTx } from "@/lib/contracts";

// Support both old format (agent_log.json) and new runtime format (logger.ts)
interface LogEntry {
  timestamp: string;
  // Old format fields
  phase?: string;
  action: string;
  details?: string;
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
  status?: string;
  verifyIn?: string;
  // New format fields (from logger.ts)
  agentId?: string;
  agentType?: "parent" | "child";
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  success?: boolean;
  error?: string;
}

interface AgentLog {
  // Old format
  agentName?: string;
  name?: string;
  version: string;
  note?: string;
  executionLogs?: LogEntry[];
  entries?: LogEntry[];
  startedAt?: string;
  metrics?: {
    totalOnchainTransactions: number;
    chainsDeployed: string[];
    contractsDeployed: number;
    agentsRegistered: number;
    proposalsCreated: number;
    votesCast: number;
    alignmentEvaluations: number;
    childrenSpawned: number;
    childrenTerminated: number;
    childrenRespawned?: number;
    reasoningCalls: number;
    reasoningProvider: string;
    reasoningModel: string;
    e2eeEnabled?: boolean;
    yieldWithdrawals?: number;
    ensSubdomainsRegistered?: number;
    contractsVerified?: number;
  };
}

// Map action names to phases for color coding
function actionToPhase(action: string): string {
  if (action.includes("deploy") || action.includes("register_parent")) return "initialization";
  if (action.includes("spawn") || action.includes("dynamic_spawn")) return "spawn";
  if (action.includes("proposal") || action.includes("create_proposal") || action.includes("mirror")) return "governance";
  if (action.includes("vote") || action.includes("cast_vote")) return "voting";
  if (action.includes("align") || action.includes("evaluate")) return "alignment";
  if (action.includes("terminat") || action.includes("recall") || action.includes("kill")) return "termination";
  if (action.includes("reveal")) return "voting";
  if (action.includes("respawn")) return "spawn";
  if (action.includes("ens") || action.includes("subdomain")) return "initialization";
  if (action.includes("yield") || action.includes("treasury")) return "deployment";
  if (action.includes("discovery") || action.includes("feed")) return "governance";
  return "governance";
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

const PAGE_SIZE = 25;
const REFRESH_INTERVAL = 15_000; // refresh every 15s

function formatTime(ts: string) {
  return new Date(ts).toLocaleString();
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

// Normalize entries from both old and new format into a consistent shape
function normalizeEntry(entry: LogEntry): LogEntry & { _phase: string; _details: string; _status: string } {
  const phase = entry.phase || actionToPhase(entry.action);

  // Build details string from either old `details` field or new `inputs`/`outputs`
  let details = entry.details || "";
  if (!details && entry.inputs) {
    const parts: string[] = [];
    if (entry.inputs.child) parts.push(`child: ${entry.inputs.child}`);
    if (entry.inputs.chain) parts.push(`chain: ${entry.inputs.chain}`);
    if (entry.inputs.dao) parts.push(`dao: ${entry.inputs.dao}`);
    if (entry.inputs.proposalId) parts.push(`proposal: ${entry.inputs.proposalId}`);
    if (entry.inputs.decision) parts.push(`decision: ${entry.inputs.decision}`);
    if (entry.inputs.reason) parts.push(`reason: ${entry.inputs.reason}`);
    if (entry.inputs.description) parts.push(entry.inputs.description.slice(0, 100));
    if (entry.inputs.newLabel) parts.push(`respawned as: ${entry.inputs.newLabel}`);
    if (entry.inputs.score !== undefined) parts.push(`score: ${entry.inputs.score}`);
    details = parts.join(" | ");
  }

  // Status
  const status = entry.status || (entry.success === false ? "failed" : entry.success === true ? "success" : "unknown");

  // Extract txHash from outputs if not in top-level
  const txHash = entry.txHash || entry.outputs?.txHash;

  return { ...entry, _phase: phase, _details: details, _status: status, txHash };
}

export default function LogsPage() {
  const [log, setLog] = useState<AgentLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const fetchLog = () => {
    fetch("https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/main/agent_log.json")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setLog(data); setError(null); setLastRefresh(Date.now()); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLog(); }, []);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchLog, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Merge old + new format entries, sort latest first
  const allEntries = useMemo(() => {
    if (!log) return [];
    const old = log.executionLogs || [];
    const newEntries = log.entries || [];
    const merged = [...old, ...newEntries].map(normalizeEntry);
    // Sort by timestamp, newest first
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return merged;
  }, [log]);

  const phases = useMemo(() => {
    const set = new Set(allEntries.map(e => e._phase));
    return ["all", ...Array.from(set).sort()];
  }, [allEntries]);

  const filtered = useMemo(() => {
    let entries = allEntries;
    if (phase !== "all") entries = entries.filter((e) => e._phase === phase);
    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          (e._details).toLowerCase().includes(q) ||
          (e.ensLabel ?? "").toLowerCase().includes(q) ||
          (e.agentId ?? "").toLowerCase().includes(q) ||
          (e.chain ?? "").toLowerCase().includes(q)
      );
    }
    return entries;
  }, [allEntries, phase, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 on filter/search change
  useEffect(() => { setPage(1); }, [phase, search]);

  // Compute live metrics from entries
  const liveMetrics = useMemo(() => {
    const votes = allEntries.filter(e => e.action.includes("vote") || e.action.includes("cast_vote")).length;
    const spawns = allEntries.filter(e => e.action.includes("spawn")).length;
    const terminations = allEntries.filter(e => e.action.includes("terminat") || e.action.includes("recall")).length;
    const alignEvals = allEntries.filter(e => e.action.includes("alignment") || e.action.includes("evaluate")).length;
    const reveals = allEntries.filter(e => e.action.includes("reveal")).length;
    const proposals = allEntries.filter(e => e.action.includes("proposal") || e.action.includes("mirror")).length;
    return { votes, spawns, terminations, alignEvals, reveals, proposals, total: allEntries.length };
  }, [allEntries]);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-mono font-bold text-orange-400 tracking-tight">
            Execution Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time autonomous execution evidence — every vote, spawn, kill, and reveal
          </p>
        </div>
        <div className="sm:text-right text-xs font-mono text-gray-600 shrink-0">
          <div className="text-gray-400">{log?.agentName || log?.name || "Spawn Protocol"} v{log?.version || "1.0"}</div>
          <div className="mt-0.5">{allEntries.length} total entries (latest first)</div>
          <div className="mt-0.5 text-gray-700">
            Refreshed {Math.round((Date.now() - lastRefresh) / 1000)}s ago
          </div>
        </div>
      </div>

      {/* Live metrics from entries */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Total Entries", value: liveMetrics.total, color: "text-orange-400" },
          { label: "Votes Cast",    value: liveMetrics.votes, color: "text-cyan-400" },
          { label: "Agents Spawned", value: liveMetrics.spawns, color: "text-green-400" },
          { label: "Terminations",  value: liveMetrics.terminations, color: "text-red-400" },
        ].map((m) => (
          <div key={m.label} className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14]">
            <div className={`text-3xl font-mono font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Align Evals", value: liveMetrics.alignEvals },
          { label: "Reveals",     value: liveMetrics.reveals },
          { label: "Proposals",   value: liveMetrics.proposals },
          { label: "Reasoning",   value: `${log?.metrics?.reasoningProvider || "venice"} / ${log?.metrics?.reasoningModel || "llama-3.3-70b"}` },
          { label: "E2EE",        value: log?.metrics?.e2eeEnabled ? "enabled" : "yes" },
          { label: "Chains",      value: log?.metrics?.chainsDeployed?.join(", ") || "base-sepolia" },
        ].map((m) => (
          <div key={m.label} className="border border-gray-800 rounded p-3 bg-[#0d0d14]">
            <div className="text-xs text-gray-300 font-mono truncate">{String(m.value)}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Note */}
      {log?.note && (
        <div className="mb-6 border border-orange-500/20 bg-orange-500/5 rounded-lg px-4 py-3">
          <p className="text-xs text-orange-300/70 font-mono">{log.note}</p>
        </div>
      )}

      {/* Filters + Search */}
      {!loading && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
                {p === "all"
                  ? `All (${allEntries.length})`
                  : `${PHASE_ICONS[p] ?? "◦"} ${p} (${allEntries.filter(e => e._phase === p).length})`}
              </button>
            ))}
          </div>

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
              >x</button>
            )}
          </div>
        </div>
      )}

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
              const phaseClass = PHASE_COLORS[entry._phase] ?? "text-gray-400 border-gray-700 bg-gray-900";
              const icon = PHASE_ICONS[entry._phase] ?? "◦";
              const isTermination = entry._phase === "termination";
              const allHashes = [
                ...(entry.txHash ? [entry.txHash] : []),
                ...(entry.txHashes ?? []),
              ];

              return (
                <div
                  key={`${entry.timestamp}-${i}`}
                  className={`border rounded-lg p-4 bg-[#0d0d14] hover:bg-[#12121c] transition-all ${
                    isTermination
                      ? "border-red-500/40 border-l-4 border-l-red-500"
                      : "border-gray-800"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-xs border rounded px-1.5 py-0.5 font-mono shrink-0 mt-0.5 ${phaseClass}`}>
                      {icon} {entry._phase}
                    </span>

                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`font-mono text-sm font-semibold ${isTermination ? "text-red-300" : "text-gray-200"}`}>
                          {entry.action}
                        </span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          entry._status === "success"
                            ? "text-green-400 bg-green-400/10 border border-green-400/20"
                            : entry._status === "failed"
                            ? "text-red-400 bg-red-400/10 border border-red-400/20"
                            : "text-gray-400 bg-gray-400/10 border border-gray-700"
                        }`}>
                          {entry._status}
                        </span>
                        {(entry.chain || entry.inputs?.chain) && (
                          <span className="text-[10px] font-mono text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">
                            {entry.chain || entry.inputs?.chain}
                          </span>
                        )}
                        {entry.agentId && (
                          <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${
                            entry.agentType === "child"
                              ? "border-cyan-400/30 text-cyan-400 bg-cyan-400/5"
                              : "border-purple-400/30 text-purple-400 bg-purple-400/5"
                          }`}>
                            {entry.agentId}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-400 leading-relaxed mb-2">
                        {entry._details}
                      </p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {(entry.reasoningProvider || entry.inputs?.litEncrypted !== undefined) && (
                          <span className="text-[10px] font-mono border border-yellow-400/30 text-yellow-400 bg-yellow-400/5 rounded px-1.5 py-0.5">
                            Venice {entry.reasoningModel || "E2EE"}
                          </span>
                        )}
                        {(entry.rationaleEncrypted || entry.inputs?.litEncrypted) && (
                          <span className="text-[10px] font-mono border border-cyan-400/30 text-cyan-400 bg-cyan-400/5 rounded px-1.5 py-0.5">
                            {entry.inputs?.litEncrypted ? "Lit encrypted" : "hex encoded"}
                          </span>
                        )}
                        {(entry.decision || entry.inputs?.decision) && (
                          <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${
                            (entry.decision || entry.inputs?.decision) === "FOR"
                              ? "border-green-400/30 text-green-400 bg-green-400/5"
                              : (entry.decision || entry.inputs?.decision) === "AGAINST"
                              ? "border-red-400/30 text-red-400 bg-red-400/5"
                              : "border-yellow-400/30 text-yellow-400 bg-yellow-400/5"
                          }`}>
                            {entry.decision || entry.inputs?.decision}
                          </span>
                        )}
                        {entry.erc8004AgentId !== undefined && (
                          <span className="text-[10px] font-mono border border-purple-400/30 text-purple-400 bg-purple-400/5 rounded px-1.5 py-0.5">
                            ERC-8004 #{entry.erc8004AgentId}
                          </span>
                        )}
                        {(entry.ensLabel || entry.inputs?.child) && (
                          <span className="text-[10px] font-mono border border-blue-400/30 text-blue-400 bg-blue-400/5 rounded px-1.5 py-0.5">
                            {(entry.ensLabel || entry.inputs?.child)}.spawn.eth
                          </span>
                        )}
                        {entry.outputs?.reasoningHash && (
                          <span className="text-[10px] font-mono border border-gray-700 text-gray-500 rounded px-1.5 py-0.5">
                            hash: {entry.outputs.reasoningHash}
                          </span>
                        )}
                        {entry.outputs?.score !== undefined && (
                          <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${
                            entry.outputs.score >= 70 ? "border-green-400/30 text-green-400 bg-green-400/5"
                            : entry.outputs.score >= 45 ? "border-yellow-400/30 text-yellow-400 bg-yellow-400/5"
                            : "border-red-400/30 text-red-400 bg-red-400/5"
                          }`}>
                            alignment: {entry.outputs.score}/100
                          </span>
                        )}
                      </div>

                      {/* Error message */}
                      {entry.error && (
                        <p className="text-[10px] text-red-400/70 font-mono mt-1">{entry.error}</p>
                      )}

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

                      <p className="sm:hidden text-[10px] text-gray-600 font-mono mt-1.5">
                        {formatTime(entry.timestamp)}
                      </p>
                    </div>

                    <span className="hidden sm:block text-[10px] text-gray-600 font-mono shrink-0 whitespace-nowrap">
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
                Prev
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
                Next
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
