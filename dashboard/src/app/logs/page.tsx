"use client";

import { useState, useEffect, useMemo } from "react";
import { explorerTx, storageViewerPath } from "@/lib/contracts";

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
  judgeRunId?: string;
  judgeStep?: string;
  proofChild?: boolean;
  proofStatus?: string;
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  respawnedChild?: string;
  lineageSourceCid?: string;
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

const PHASE_CONFIG: Record<string, { color: string; border: string; bg: string }> = {
  initialization: { color: "text-blue-400",    border: "border-blue-400/30",    bg: "bg-blue-400/5" },
  spawn:          { color: "text-[#00ff88]",   border: "border-[#00ff88]/30",   bg: "bg-[#00ff88]/5" },
  governance:     { color: "text-[#f5f5f0]/70",border: "border-white/[0.15]",   bg: "bg-white/[0.03]" },
  voting:         { color: "text-[#00ff88]",   border: "border-[#00ff88]/25",   bg: "bg-[#00ff88]/[0.03]" },
  alignment:      { color: "text-[#f5a623]",   border: "border-[#f5a623]/30",   bg: "bg-[#f5a623]/5" },
  termination:    { color: "text-[#ff3b3b]",   border: "border-[#ff3b3b]/30",   bg: "bg-[#ff3b3b]/5" },
  deployment:     { color: "text-[#f5a623]",   border: "border-[#f5a623]/25",   bg: "bg-[#f5a623]/[0.03]" },
  judge:          { color: "text-blue-300",     border: "border-blue-300/30",    bg: "bg-blue-300/5" },
};

const PHASE_ICONS: Record<string, string> = {
  initialization: "◈", spawn: "⊕", governance: "◎", voting: "◉",
  alignment: "◐", termination: "⊗", deployment: "◆", judge: "◇",
};

const PAGE_SIZE = 30;

function formatTime(ts: string) {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function PhaseChip({ phase }: { phase: string }) {
  const cfg = PHASE_CONFIG[phase] ?? { color: "text-[#4a4f5e]", border: "border-white/[0.08]", bg: "bg-transparent" };
  const icon = PHASE_ICONS[phase] ?? "◦";
  return (
    <span className={`font-mono text-[9px] uppercase border px-1.5 py-0.5 leading-none flex-shrink-0 ${cfg.color} ${cfg.border} ${cfg.bg}`}>
      {icon} {phase}
    </span>
  );
}

export default function LogsPage() {
  const [log, setLog] = useState<AgentLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("search");
    if (query) setSearch(query);
  }, []);

  useEffect(() => {
    async function fetchLog() {
      try {
        const res = await fetch("/api/logs");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setLog(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchLog();
  }, []);

  const phases = log
    ? ["all", ...new Set(log.executionLogs.map((e) => e.phase))]
    : ["all"];

  const filtered = useMemo(() => {
    let entries = log?.executionLogs ?? [];
    entries = [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (phase !== "all") entries = entries.filter((e) => e.phase === phase);
    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.details.toLowerCase().includes(q) ||
          (e.ensLabel ?? "").toLowerCase().includes(q) ||
          (e.judgeRunId ?? "").toLowerCase().includes(q)
      );
    }
    return entries;
  }, [log, phase, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); setExpanded(null); }, [phase, search]);

  const ipfsCid = (log?.metrics as any)?.latestIPFSCid as string | undefined;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-mono text-sm font-bold text-[#f5f5f0] uppercase tracking-widest">
            EXEC_LOG
          </h1>
          {log && (
            <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
              {log.agentName} V{log.version} — {log.executionLogs.length} ENTRIES
            </span>
          )}
        </div>
        {ipfsCid && (
          <a
            href={`https://ipfs.filebase.io/ipfs/${ipfsCid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-[#4a4f5e]/40 px-3 py-1 hover:border-[#f5f5f0]/30 transition-colors"
          >
            <span className="w-1.5 h-1.5 bg-blue-400" />
            <span className="font-mono text-[10px] text-[#4a4f5e] uppercase hover:text-[#f5f5f0] transition-colors">
              IPFS: {ipfsCid.slice(0, 12)}… ↗
            </span>
          </a>
        )}
      </div>

      {/* Metric strip */}
      {log && (
        <div className="border-b border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          {[
            { label: "ONCHAIN_TXS",    value: log.metrics.totalOnchainTransactions, color: "text-[#00ff88]" },
            { label: "VOTES_CAST",     value: log.metrics.votesCast,                color: "text-[#00ff88]" },
            { label: "VENICE_CALLS",   value: log.metrics.reasoningCalls,           color: "text-[#f5a623]" },
            { label: "AGENTS_REG",     value: log.metrics.agentsRegistered,         color: "text-[#f5f5f0]" },
            { label: "SPAWNED",        value: log.metrics.childrenSpawned,          color: "text-[#f5f5f0]" },
            { label: "TERMINATED",     value: log.metrics.childrenTerminated,       color: "text-[#ff3b3b]" },
            { label: "ALIGN_EVALS",    value: log.metrics.alignmentEvaluations,     color: "text-[#f5a623]" },
            { label: "CONTRACTS",      value: log.metrics.contractsDeployed,        color: "text-[#4a4f5e]" },
          ].map((m, i) => (
            <div key={m.label} className={`px-4 py-3 ${i < 7 ? "border-r border-white/[0.08]" : ""}`}>
              <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-0.5">
                {m.label}
              </div>
              <div className={`font-mono text-xl font-bold leading-none ${m.color}`}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Note banner */}
      {log?.note && (
        <div className="border-b border-white/[0.08] px-4 py-2 bg-[#f5a623]/[0.03]">
          <p className="font-mono text-[10px] text-[#f5a623]/70">{log.note}</p>
        </div>
      )}

      {/* Filters + search */}
      {!loading && (
        <div className="border-b border-white/[0.08] px-4 py-2 flex flex-wrap items-center gap-3">
          <div className="flex gap-0 flex-wrap">
            {phases.map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`px-3 py-1 font-mono text-[10px] uppercase tracking-widest border-b-2 transition-colors ${
                  phase === p
                    ? "text-[#00ff88] border-[#00ff88]"
                    : "text-[#4a4f5e] border-transparent hover:text-[#f5f5f0]"
                }`}
              >
                {p === "all"
                  ? `ALL (${log?.executionLogs.length ?? 0})`
                  : `${PHASE_ICONS[p] ?? "◦"} ${p.toUpperCase()}`}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {(search || phase !== "all") && (
              <span className="font-mono text-[10px] text-[#4a4f5e]">
                {filtered.length} RESULTS
              </span>
            )}
            <div className="relative">
              <input
                type="text"
                placeholder="SEARCH…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 border border-white/[0.08] bg-[#0a0a0f] px-3 py-1.5 text-[10px] font-mono text-[#f5f5f0] placeholder-[#4a4f5e] focus:border-[#00ff88]/40 focus:outline-none uppercase"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[#4a4f5e] hover:text-[#f5f5f0]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="m-4 border border-[#ff3b3b]/30 bg-[#ff3b3b]/5 px-4 py-3">
          <p className="font-mono text-[11px] text-[#ff3b3b] uppercase">ERROR: {error}</p>
          <a
            href="https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/main/agent_log.json"
            className="font-mono text-[10px] text-[#4a4f5e] hover:text-[#f5f5f0] uppercase mt-1 block"
            target="_blank"
            rel="noopener noreferrer"
          >
            RAW: AGENT_LOG.JSON ON GITHUB ↗
          </a>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="p-4 space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-9 bg-white/[0.04] animate-pulse border border-white/[0.04]" />
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <div className="m-4 border border-white/[0.08] p-12 text-center">
          <div className="mb-3 text-3xl text-[#4a4f5e]">◉</div>
          <h2 className="font-mono text-sm text-[#4a4f5e] uppercase tracking-widest">NO MATCHING ENTRIES</h2>
          {(search || phase !== "all") && (
            <button
              onClick={() => { setSearch(""); setPhase("all"); }}
              className="mt-4 font-mono text-[10px] text-[#00ff88] uppercase border border-[#00ff88]/30 px-4 py-1.5 hover:bg-[#00ff88]/10 transition-colors"
            >
              CLEAR_FILTERS
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="border-b border-white/[0.08] bg-[#0a0a0f] grid grid-cols-[100px_80px_130px_1fr_80px_60px] gap-x-3 px-4 py-1.5">
            {["TIMESTAMP", "PHASE", "ACTION", "DETAILS", "STATUS", "TX"].map((h) => (
              <span key={h} className="font-mono text-[9px] text-[#4a4f5e] uppercase tracking-widest">
                {h}
              </span>
            ))}
          </div>

          <div>
            {paginated.map((entry, i) => {
              const isExpanded = expanded === i;
              const isTermination = entry.phase === "termination";
              const allHashes = [
                ...(entry.txHash ? [entry.txHash] : []),
                ...(entry.txHashes ?? []),
              ];
              const rowBg = i % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]";

              return (
                <div
                  key={i}
                  className={`border-b border-white/[0.05] ${rowBg} ${isTermination ? "border-l-2 border-l-[#ff3b3b]" : ""}`}
                >
                  {/* Main row */}
                  <div
                    className="grid grid-cols-[100px_80px_130px_1fr_80px_60px] gap-x-3 px-4 py-2 items-center hover:bg-white/[0.02] cursor-pointer transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : i)}
                  >
                    {/* Timestamp */}
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-[#f5f5f0]/50 tabular-nums">
                        {formatTime(entry.timestamp)}
                      </div>
                      <div className="font-mono text-[9px] text-[#4a4f5e]">
                        {formatDate(entry.timestamp)}
                      </div>
                    </div>

                    {/* Phase chip */}
                    <PhaseChip phase={entry.phase} />

                    {/* Action */}
                    <span className={`font-mono text-[10px] font-semibold truncate ${isTermination ? "text-[#ff3b3b]" : "text-[#f5f5f0]/80"}`}>
                      {entry.action}
                    </span>

                    {/* Details */}
                    <span className="font-mono text-[10px] text-[#4a4f5e] truncate">
                      {entry.details}
                    </span>

                    {/* Status */}
                    <span className={`font-mono text-[9px] uppercase border px-1.5 py-0.5 leading-none ${
                      entry.status === "success"
                        ? "text-[#00ff88] border-[#00ff88]/30"
                        : "text-[#ff3b3b] border-[#ff3b3b]/30"
                    }`}>
                      {entry.status}
                    </span>

                    {/* TX indicator */}
                    <span className="font-mono text-[9px] text-[#4a4f5e]">
                      {allHashes.length > 0 ? `${allHashes.length} TX` : "—"}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 border-t border-white/[0.05] bg-[#070710]">
                      <p className="font-mono text-[10px] text-[#f5f5f0]/60 mb-2 leading-relaxed">
                        {entry.details}
                      </p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {entry.decision && (
                          <span className={`font-mono text-[9px] uppercase border px-1.5 py-0.5 ${
                            entry.decision === "FOR"     ? "text-[#00ff88] border-[#00ff88]/30" :
                            entry.decision === "AGAINST" ? "text-[#ff3b3b] border-[#ff3b3b]/30" :
                                                           "text-[#f5a623] border-[#f5a623]/30"
                          }`}>
                            {entry.decision}
                          </span>
                        )}
                        {entry.ensLabel && (
                          <span className="font-mono text-[9px] border border-white/[0.08] text-[#4a4f5e] px-1.5 py-0.5">
                            {entry.ensLabel}.spawn.eth
                          </span>
                        )}
                        {entry.reasoningModel && (
                          <span className="font-mono text-[9px] border border-[#f5a623]/30 text-[#f5a623] px-1.5 py-0.5">
                            VENICE {entry.reasoningModel}
                          </span>
                        )}
                        {entry.rationaleEncrypted && (
                          <span className="font-mono text-[9px] border border-blue-400/30 text-blue-400 px-1.5 py-0.5">
                            LIT_ENCRYPTED
                          </span>
                        )}
                        {entry.erc8004AgentId !== undefined && (
                          <span className="font-mono text-[9px] border border-white/[0.08] text-[#4a4f5e] px-1.5 py-0.5">
                            ERC-8004 #{entry.erc8004AgentId}
                          </span>
                        )}
                        {entry.judgeRunId && (
                          <span className="font-mono text-[9px] border border-[#f5a623]/30 text-[#f5a623] px-1.5 py-0.5">
                            {entry.judgeRunId}
                          </span>
                        )}
                        {entry.chain && (
                          <span className="font-mono text-[9px] border border-white/[0.08] text-[#4a4f5e] px-1.5 py-0.5">
                            {entry.chain}
                          </span>
                        )}
                        {entry.validationRequestId && (
                          <span className="font-mono text-[9px] border border-white/[0.08] text-[#4a4f5e] px-1.5 py-0.5">
                            VALIDATION #{entry.validationRequestId}
                          </span>
                        )}
                        {entry.respawnedChild && (
                          <span className="font-mono text-[9px] border border-[#00ff88]/30 text-[#00ff88] px-1.5 py-0.5">
                            RESPAWN: {entry.respawnedChild}
                          </span>
                        )}
                      </div>

                      {/* TX hashes */}
                      {allHashes.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {allHashes.map((hash) => (
                            <a
                              key={hash}
                              href={explorerTx(hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[10px] text-[#4a4f5e] border border-white/[0.08] px-2 py-0.5 hover:text-[#f5f5f0] hover:border-white/20 transition-colors"
                            >
                              {shortHash(hash)} ↗
                            </a>
                          ))}
                        </div>
                      )}
                      {entry.filecoinCid && (
                        <a
                          href={storageViewerPath(entry.filecoinCid)}
                          className="mt-1 inline-block font-mono text-[10px] text-[#4a4f5e] border border-white/[0.08] px-2 py-0.5 hover:text-[#f5f5f0] hover:border-white/20 transition-colors"
                        >
                          FIL: {entry.filecoinCid.slice(0, 20)}… ↗
                        </a>
                      )}
                      {entry.verifyIn && (
                        <p className="font-mono text-[9px] text-[#4a4f5e] mt-1.5">
                          VERIFY: {entry.verifyIn}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-white/[0.08] px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="font-mono text-[10px] text-[#4a4f5e] uppercase border border-white/[0.08] px-3 py-1.5 hover:text-[#f5f5f0] hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← PREV
              </button>
              <span className="font-mono text-[10px] text-[#4a4f5e]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="font-mono text-[10px] text-[#4a4f5e] uppercase border border-white/[0.08] px-3 py-1.5 hover:text-[#f5f5f0] hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                NEXT →
              </button>
              <span className="ml-auto font-mono text-[10px] text-[#4a4f5e]">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} OF {filtered.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
