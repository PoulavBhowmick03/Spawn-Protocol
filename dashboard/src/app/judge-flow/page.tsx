"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StorageInlinePreview } from "@/components/StorageInlinePreview";
import { explorerTx, storageViewerPath } from "@/lib/contracts";

type JudgeEvent = {
  action: string;
  at: string;
  status: "pending" | "success" | "failed";
  txHash?: string;
  txHashes?: string[];
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  respawnedChild?: string;
  lineageSourceCid?: string;
  details?: string;
};

type JudgeFlowState = {
  runId: string | null;
  status: "idle" | "queued" | "running" | "failed" | "completed";
  governor: string;
  proofChildLabel?: string;
  proofChildAgentId?: string;
  respawnedChildLabel?: string;
  respawnedChildAgentId?: string;
  proposalId?: string;
  forcedScore: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  failureReason?: string;
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  reputationTxHash?: string;
  alignmentTxHash?: string;
  terminationTxHash?: string;
  proposalTxHash?: string;
  respawnTxHash?: string;
  voteTxHash?: string;
  lineageSourceCid?: string;
  events: JudgeEvent[];
};

type BudgetState = {
  policy: "normal" | "throttled" | "paused";
  reasons: string[];
  parentEthBalance: string;
  veniceTokens: number;
  pauseTokens: number;
  filecoinAvailable: boolean;
};

const STEP_ORDER = [
  { action: "judge_flow_started", label: "Run queued + started" },
  { action: "judge_child_spawned", label: "Proof child spawned" },
  { action: "judge_proposal_seeded", label: "Proposal seeded" },
  { action: "judge_vote_cast", label: "Private reasoning + vote cast" },
  { action: "judge_alignment_forced", label: "Alignment forced low" },
  { action: "judge_termination_report_filecoin", label: "Termination report on Filecoin" },
  { action: "judge_reputation_written", label: "ERC-8004 reputation written" },
  { action: "judge_validation_written", label: "ERC-8004 validation written" },
  { action: "judge_child_terminated", label: "Proof child terminated" },
  { action: "judge_child_respawned", label: "Replacement spawned" },
  { action: "judge_lineage_loaded", label: "Lineage memory loaded" },
  { action: "judge_flow_completed", label: "Run completed" },
] as const;

const STEP_BADGES: Record<
  (typeof STEP_ORDER)[number]["action"],
  Array<{ label: string; className: string }>
> = {
  judge_flow_started: [
    { label: "Agent Only", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  ],
  judge_child_spawned: [
    { label: "ERC-8004 Identity", className: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" },
    { label: "Agent Only", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  ],
  judge_proposal_seeded: [
    { label: "Governance", className: "border-blue-400/30 bg-blue-400/10 text-blue-300" },
    { label: "Crypto", className: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300" },
  ],
  judge_vote_cast: [
    { label: "AI + E2EE", className: "border-violet-400/30 bg-violet-400/10 text-violet-300" },
    { label: "Let Agents Cook", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  ],
  judge_alignment_forced: [
    { label: "AI Evaluation", className: "border-violet-400/30 bg-violet-400/10 text-violet-300" },
  ],
  judge_termination_report_filecoin: [
    { label: "Filecoin Primary", className: "border-green-400/30 bg-green-400/10 text-green-300" },
    { label: "Crypto", className: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300" },
  ],
  judge_reputation_written: [
    { label: "ERC-8004 Receipt", className: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" },
  ],
  judge_validation_written: [
    { label: "ERC-8004 Receipt", className: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" },
  ],
  judge_child_terminated: [
    { label: "Lifecycle", className: "border-red-400/30 bg-red-400/10 text-red-300" },
    { label: "Agent Only", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  ],
  judge_child_respawned: [
    { label: "AI Lineage", className: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" },
    { label: "Agent Only", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  ],
  judge_lineage_loaded: [
    { label: "AI Lineage", className: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" },
    { label: "Filecoin", className: "border-green-400/30 bg-green-400/10 text-green-300" },
  ],
  judge_flow_completed: [
    { label: "Canonical Proof", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  ],
};

const EMPTY_STATE: JudgeFlowState = {
  runId: null,
  status: "idle",
  governor: "uniswap",
  forcedScore: 15,
  events: [],
};

function formatTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function shortHash(hash?: string) {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export default function JudgeFlowPage() {
  const [state, setState] = useState<JudgeFlowState>(EMPTY_STATE);
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchState() {
    try {
      const res = await fetch("/api/judge-flow", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setState({ ...EMPTY_STATE, ...data, events: data.events ?? [] });
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch judge flow state");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchBudget = async () => {
      try {
        const res = await fetch("/api/budget", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setBudget(data);
      } catch {}
    };
    fetchBudget();
    const interval = setInterval(fetchBudget, 15000);
    return () => clearInterval(interval);
  }, []);

  async function startRun() {
    setStarting(true);
    try {
      const res = await fetch("/api/judge-flow/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ governor: "uniswap", forcedScore: 15 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setState({ ...EMPTY_STATE, ...data, events: data.events ?? [] });
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to start judge flow");
    } finally {
      setStarting(false);
    }
  }

  const steps = useMemo(
    () =>
      STEP_ORDER.map((step) => ({
        ...step,
        event: state.events.find((event) => event.action === step.action),
      })),
    [state.events]
  );
  const previewCids = useMemo(() => {
    const seen = new Set<string>();
    return [
      state.filecoinCid
        ? {
            cid: state.filecoinCid,
            title: "Termination Report Preview",
            subtitle: "Termination memory written during the canonical proof run.",
          }
        : null,
      state.lineageSourceCid && state.lineageSourceCid !== state.filecoinCid
        ? {
            cid: state.lineageSourceCid,
            title: "Lineage Memory Preview",
            subtitle: "Lineage context loaded by the respawned child.",
          }
        : null,
    ].filter((item): item is { cid: string; title: string; subtitle: string } => {
      if (!item || seen.has(item.cid)) return false;
      seen.add(item.cid);
      return true;
    });
  }, [state.filecoinCid, state.lineageSourceCid]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-amber-300 tracking-tight">
            Judge Flow
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            One canonical proof run for Agent Only, ERC-8004, Filecoin, and AI &amp; Robotics. Live duration depends on Base Sepolia and Filecoin latency.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {budget && (
            <div
              className={`rounded-lg border px-4 py-2 text-xs font-mono ${
                budget.policy === "paused"
                  ? "border-red-400/30 bg-red-400/10 text-red-300"
                  : budget.policy === "throttled"
                  ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
                  : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              }`}
            >
              Budget {budget.policy} · {budget.parentEthBalance} ETH · Venice {budget.veniceTokens} tokens
            </div>
          )}
          <button
            onClick={startRun}
            disabled={starting || state.status === "queued" || state.status === "running"}
            className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-mono text-amber-300 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? "Queueing…" : "Start Canonical Run"}
          </button>
          {state.runId && (
            <Link
              href={`/logs?search=${encodeURIComponent(state.runId)}`}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-mono text-gray-300 transition hover:border-gray-500"
            >
              Open Raw Logs
            </Link>
          )}
          {state.runId && (
            <Link
              href={`/receipt/${encodeURIComponent(state.runId)}`}
              className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-4 py-2 text-sm font-mono text-indigo-300 transition hover:bg-indigo-400/15"
            >
              Open Receipt
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {[
          { label: "Status", value: state.status },
          { label: "Run ID", value: state.runId || "—" },
          { label: "Governor", value: state.governor || "uniswap" },
          {
            label: "Duration",
            value: state.durationMs ? `${(state.durationMs / 1000).toFixed(1)}s` : "—",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
            <div className="text-xs uppercase tracking-wider text-gray-600">{item.label}</div>
            <div className="mt-1 font-mono text-sm text-gray-200">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-600">Artifacts</div>
          <div className="space-y-2 text-sm">
            <div className="font-mono text-gray-300">Proof child: {state.proofChildLabel || "—"}</div>
            <div className="font-mono text-gray-300">Proof ERC-8004: {state.proofChildAgentId || "—"}</div>
            <div className="font-mono text-gray-300">Proposal ID: {state.proposalId || "—"}</div>
            <div className="font-mono text-gray-300">Respawned child: {state.respawnedChildLabel || "—"}</div>
            <div className="font-mono text-gray-300">Respawn ERC-8004: {state.respawnedChildAgentId || "—"}</div>
            <div className="font-mono text-gray-300">Lineage CID: {state.lineageSourceCid || state.filecoinCid || "—"}</div>
            <div className="font-mono text-gray-300">Validation Request: {state.validationRequestId || "—"}</div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-600">Receipts</div>
          <div className="flex flex-wrap gap-2">
            {[state.proposalTxHash, state.voteTxHash, state.alignmentTxHash, state.reputationTxHash, state.terminationTxHash, state.respawnTxHash]
              .filter(Boolean)
              .map((hash) => (
                <a
                  key={hash}
                  href={explorerTx(hash!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-xs font-mono text-blue-300"
                >
                  {shortHash(hash!)} ↗
                </a>
              ))}
            {(state.filecoinUrl || state.filecoinCid) && (
              <a
                href={state.filecoinCid ? storageViewerPath(state.filecoinCid) : state.filecoinUrl || "#"}
                className="rounded border border-green-400/20 bg-green-400/5 px-2 py-1 text-xs font-mono text-green-300"
              >
                FIL {state.filecoinCid?.slice(0, 16)}… ↗
              </a>
            )}
          </div>
          {state.failureReason && (
            <div className="mt-4 rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
              {state.failureReason}
            </div>
          )}
        </div>
      </div>

      {previewCids.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {previewCids.map((preview) => (
            <StorageInlinePreview
              key={preview.cid}
              cid={preview.cid}
              title={preview.title}
              subtitle={preview.subtitle}
            />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-[#0d0d14] p-4">
        <div className="mb-4 text-xs uppercase tracking-wider text-gray-600">Timeline</div>
        <div className="space-y-3">
          {steps.map((step) => {
            const status = step.event?.status || (state.status === "failed" ? "pending" : "pending");
            return (
              <div
                key={step.action}
                className={`rounded-lg border p-3 ${
                  step.event?.status === "success"
                    ? "border-green-500/30 bg-green-500/5"
                    : step.event?.status === "failed"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-gray-800 bg-[#101018]"
                }`}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-mono text-sm text-gray-100">{step.label}</div>
                    <div className="text-xs text-gray-500">{formatTime(step.event?.at)}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {STEP_BADGES[step.action].map((badge) => (
                        <span
                          key={`${step.action}-${badge.label}`}
                          className={`rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${
                        step.event?.status === "success"
                          ? "border-green-400/30 bg-green-400/10 text-green-300"
                          : step.event?.status === "failed"
                          ? "border-red-400/30 bg-red-400/10 text-red-300"
                          : "border-gray-700 bg-gray-900 text-gray-500"
                      }`}
                    >
                      {status}
                    </span>
                    {step.event?.txHash && (
                      <a
                        href={explorerTx(step.event.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-[10px] font-mono text-blue-300"
                      >
                        {shortHash(step.event.txHash)} ↗
                      </a>
                    )}
                    {(step.event?.filecoinCid || step.event?.filecoinUrl) && (
                      <a
                        href={
                          step.event.filecoinCid
                            ? storageViewerPath(step.event.filecoinCid)
                            : step.event.filecoinUrl
                        }
                        className="rounded border border-green-400/20 bg-green-400/5 px-2 py-1 text-[10px] font-mono text-green-300"
                      >
                        FIL ↗
                      </a>
                    )}
                  </div>
                </div>
                {step.event?.details && (
                  <div className="mt-2 text-xs text-gray-400">{step.event.details}</div>
                )}
                {(step.event?.validationRequestId || (step.event?.txHashes && step.event.txHashes.length > 1)) && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono text-gray-500">
                    {step.event.validationRequestId && (
                      <span>request #{step.event.validationRequestId}</span>
                    )}
                    {step.event.txHashes?.slice(1).map((hash) => (
                      <a
                        key={hash}
                        href={explorerTx(hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-[10px] font-mono text-blue-300"
                      >
                        {shortHash(hash)} ↗
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!loading && state.startedAt && (
        <div className="mt-4 text-xs font-mono text-gray-600">
          Started: {formatTime(state.startedAt)} · Completed: {formatTime(state.completedAt)}
        </div>
      )}
    </div>
  );
}
