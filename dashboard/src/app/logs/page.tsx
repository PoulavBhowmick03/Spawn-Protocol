"use client";

import { useState, useEffect } from "react";
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
  spawn: "text-green-400 border-green-400/30 bg-green-400/5",
  governance: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  voting: "text-cyan-400 border-cyan-400/30 bg-cyan-400/5",
  alignment: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  termination: "text-red-400 border-red-400/30 bg-red-400/5",
  deployment: "text-orange-400 border-orange-400/30 bg-orange-400/5",
};

const PHASE_ICONS: Record<string, string> = {
  initialization: "◈",
  spawn: "⊕",
  governance: "◎",
  voting: "◉",
  alignment: "◐",
  termination: "⊗",
  deployment: "◆",
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleString();
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export default function LogsPage() {
  const [log, setLog] = useState<AgentLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch(
      "https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/main/agent_log.json"
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setLog(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const phases = log
    ? ["all", ...new Set(log.executionLogs.map((e) => e.phase))]
    : ["all"];

  const filtered =
    log?.executionLogs.filter(
      (e) => filter === "all" || e.phase === filter
    ) ?? [];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-mono font-bold text-purple-400 tracking-tight">
          Execution Log
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Autonomous execution evidence — Protocol Labs "Agents With Receipts" + "Let the Agent Cook"
        </p>
      </div>

      {/* Metrics */}
      {log && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Onchain Txs", value: log.metrics.totalOnchainTransactions, color: "text-green-400" },
            { label: "Agents Registered", value: log.metrics.agentsRegistered, color: "text-purple-400" },
            { label: "Votes Cast", value: log.metrics.votesCast, color: "text-cyan-400" },
            { label: "Venice Calls", value: log.metrics.reasoningCalls, color: "text-yellow-400" },
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
        <div className="grid grid-cols-5 gap-3 mb-8">
          {[
            { label: "Chains", value: log.metrics.chainsDeployed.join(", ") },
            { label: "Contracts", value: log.metrics.contractsDeployed },
            { label: "Proposals", value: log.metrics.proposalsCreated },
            { label: "Alignment Evals", value: log.metrics.alignmentEvaluations },
            { label: "Reasoning", value: `${log.metrics.reasoningProvider} / ${log.metrics.reasoningModel}` },
          ].map((m) => (
            <div key={m.label} className="border border-gray-800 rounded p-3 bg-[#0d0d14]">
              <div className="text-xs text-gray-400 font-mono">{String(m.value)}</div>
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Note */}
      {log?.note && (
        <div className="mb-6 border border-purple-500/20 bg-purple-500/5 rounded-lg px-4 py-3">
          <p className="text-xs text-purple-300 font-mono">{log.note}</p>
        </div>
      )}

      {/* Phase filter */}
      {!loading && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {phases.map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`text-xs font-mono border rounded px-3 py-1 transition-all ${
                filter === p
                  ? "border-gray-400 text-gray-200 bg-gray-800"
                  : "border-gray-700 text-gray-500 hover:border-gray-600"
              }`}
            >
              {p === "all" ? "All" : `${PHASE_ICONS[p] ?? "◦"} ${p}`}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm font-mono">Failed to fetch log: {error}</p>
          <p className="text-gray-500 text-xs mt-1">
            Raw file: <a href="https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/main/agent_log.json" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">agent_log.json on GitHub</a>
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
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((entry, i) => {
            const phaseClass =
              PHASE_COLORS[entry.phase] ?? "text-gray-400 border-gray-700 bg-gray-900";
            const icon = PHASE_ICONS[entry.phase] ?? "◦";
            const allHashes = [
              ...(entry.txHash ? [entry.txHash] : []),
              ...(entry.txHashes ?? []),
            ];

            return (
              <div
                key={i}
                className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14] hover:bg-[#12121c] transition-all"
              >
                <div className="flex items-start gap-3">
                  {/* Phase badge */}
                  <span
                    className={`text-xs border rounded px-1.5 py-0.5 font-mono shrink-0 mt-0.5 ${phaseClass}`}
                  >
                    {icon} {entry.phase}
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Action + status */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-gray-200 font-semibold">
                        {entry.action}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1 rounded ${
                          entry.status === "success"
                            ? "text-green-400 bg-green-400/10"
                            : "text-red-400 bg-red-400/10"
                        }`}
                      >
                        {entry.status}
                      </span>
                      {entry.chain && (
                        <span className="text-[10px] font-mono text-gray-600">
                          {entry.chain}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <p className="text-xs text-gray-400 leading-relaxed mb-2">
                      {entry.details}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2">
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
                        <span
                          className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${
                            entry.decision === "FOR"
                              ? "border-green-400/30 text-green-400 bg-green-400/5"
                              : entry.decision === "AGAINST"
                              ? "border-red-400/30 text-red-400 bg-red-400/5"
                              : "border-yellow-400/30 text-yellow-400 bg-yellow-400/5"
                          }`}
                        >
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
                          ENS: {entry.ensLabel}.spawn.eth
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
                            className="text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            tx: {shortHash(hash)} ↗
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Verify in */}
                    {entry.verifyIn && (
                      <p className="text-[10px] text-gray-600 font-mono mt-1">
                        Verify: {entry.verifyIn}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[10px] text-gray-600 font-mono shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">◈</div>
          <h2 className="font-mono text-lg text-gray-400">No log entries</h2>
        </div>
      )}
    </div>
  );
}
