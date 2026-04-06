"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardHeader, DashboardPageFrame, DashboardPanel, DashboardStatStrip } from "@/components/DashboardChrome";
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

const STEP_BADGES: Record<(typeof STEP_ORDER)[number]["action"], Array<{ label: string; className: string }>> = {
  judge_flow_started: [{ label: "Agent Only", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" }],
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
  judge_alignment_forced: [{ label: "AI Evaluation", className: "border-violet-400/30 bg-violet-400/10 text-violet-300" }],
  judge_termination_report_filecoin: [
    { label: "Filecoin Primary", className: "border-green-400/30 bg-green-400/10 text-green-300" },
    { label: "Crypto", className: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300" },
  ],
  judge_reputation_written: [{ label: "ERC-8004 Receipt", className: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" }],
  judge_validation_written: [{ label: "ERC-8004 Receipt", className: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" }],
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
  judge_flow_completed: [{ label: "Canonical Proof", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" }],
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

function statusTone(status: JudgeFlowState["status"]) {
  if (status === "completed") return "green";
  if (status === "running" || status === "queued") return "blue";
  if (status === "failed") return "red";
  return "neutral";
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
        body: JSON.stringify({ governor: "uniswap", forcedScore: 15, fastMode: false }),
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

  const receiptHashes = [
    state.proposalTxHash,
    state.voteTxHash,
    state.alignmentTxHash,
    state.reputationTxHash,
    state.terminationTxHash,
    state.respawnTxHash,
  ].filter(Boolean) as string[];

  return (
    <DashboardPageFrame>
      <DashboardHeader
        title="JUDGE_FLOW"
        subtitle="CANONICAL PROOF RUN FOR AGENT ONLY, ERC-8004, FILECOIN, AND AI REASONING"
        right={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {budget && (
              <div
                className={`border px-3 py-1 text-[10px] font-mono uppercase ${
                  budget.policy === "paused"
                    ? "border-red-400/30 bg-red-400/10 text-red-300"
                    : budget.policy === "throttled"
                    ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
                    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                }`}
              >
                budget {budget.policy} · {budget.parentEthBalance} eth · venice {budget.veniceTokens}
              </div>
            )}
            <button
              onClick={startRun}
              disabled={starting || state.status === "queued" || state.status === "running"}
              className="border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-amber-300 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? "QUEUEING…" : "START_CANONICAL_RUN"}
            </button>
            {state.runId && (
              <Link
                href={`/logs?search=${encodeURIComponent(state.runId)}`}
                className="border border-white/[0.08] px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-[#4a4f5e] transition hover:text-[#f5f5f0] hover:border-white/[0.16]"
              >
                RAW_LOGS
              </Link>
            )}
            {state.runId && (
              <Link
                href={`/receipt/${encodeURIComponent(state.runId)}`}
                className="border border-indigo-400/30 bg-indigo-400/10 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-indigo-300 transition hover:bg-indigo-400/15"
              >
                OPEN_RECEIPT
              </Link>
            )}
          </div>
        }
      />

      <DashboardStatStrip
        stats={[
          { label: "STATUS", value: state.status.toUpperCase(), tone: statusTone(state.status) as any },
          { label: "RUN_ID", value: state.runId ? shortHash(state.runId) : "—", tone: "neutral" },
          { label: "GOVERNOR", value: (state.governor || "uniswap").toUpperCase(), tone: "blue" },
          { label: "DURATION", value: state.durationMs ? `${(state.durationMs / 1000).toFixed(1)}S` : "—", tone: "neutral" },
        ]}
      />

      <div className="p-4 space-y-4">
        {error && (
          <div className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <DashboardPanel title="RUN_ARTIFACTS" subtitle="Core proof child, respawn, proposal, and lineage identifiers.">
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
              {[
                { label: "PROOF_CHILD", value: state.proofChildLabel || "—" },
                { label: "PROOF_ERC8004", value: state.proofChildAgentId || "—" },
                { label: "PROPOSAL_ID", value: state.proposalId || "—" },
                { label: "RESPAWNED_CHILD", value: state.respawnedChildLabel || "—" },
                { label: "RESPAWN_ERC8004", value: state.respawnedChildAgentId || "—" },
                { label: "VALIDATION_REQ", value: state.validationRequestId || "—" },
                { label: "LINEAGE_CID", value: state.lineageSourceCid || state.filecoinCid || "—" },
                { label: "STARTED_AT", value: formatTime(state.startedAt) },
              ].map((item) => (
                <div key={item.label} className="border border-white/[0.08] bg-[#0a0a0f] px-3 py-3">
                  <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">{item.label}</div>
                  <div className="font-mono text-[11px] text-[#f5f5f0]/80 break-all">{item.value}</div>
                </div>
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="RECEIPTS"
            subtitle="Tx receipts, Filecoin artifacts, and failure context."
            right={
              loading ? (
                <span className="font-mono text-[10px] text-[#4a4f5e] uppercase animate-pulse">SYNCING</span>
              ) : null
            }
          >
            <div className="px-4 py-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {receiptHashes.map((hash) => (
                  <a
                    key={hash}
                    href={explorerTx(hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-[10px] font-mono uppercase text-blue-300"
                  >
                    {shortHash(hash)} ↗
                  </a>
                ))}
                {(state.filecoinUrl || state.filecoinCid) && (
                  <a
                    href={state.filecoinCid ? storageViewerPath(state.filecoinCid) : state.filecoinUrl || "#"}
                    className="border border-green-400/20 bg-green-400/5 px-2 py-1 text-[10px] font-mono uppercase text-green-300"
                  >
                    FIL {state.filecoinCid?.slice(0, 16)}… ↗
                  </a>
                )}
              </div>

              {state.failureReason && (
                <div className="border border-red-500/20 bg-red-500/5 px-3 py-3 text-sm text-red-300">
                  {state.failureReason}
                </div>
              )}

              <div className="grid gap-2 text-[11px] font-mono text-[#4a4f5e] uppercase">
                <div>FAST_POLLING: DISABLED_BY_DEFAULT</div>
                <div>FORCED_SCORE: {state.forcedScore}</div>
                <div>COMPLETED_AT: {formatTime(state.completedAt)}</div>
              </div>
            </div>
          </DashboardPanel>
        </div>

        {previewCids.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
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

        <DashboardPanel title="TIMELINE_RAIL" subtitle="Dense operational timeline for the canonical proof run.">
          <div className="divide-y divide-white/[0.08]">
            {steps.map((step) => {
              const status = step.event?.status || "pending";
              return (
                <div key={step.action} className="px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="font-mono text-[12px] text-[#f5f5f0] uppercase tracking-wider">
                          {step.label}
                        </div>
                        <span
                          className={`border px-2 py-1 text-[10px] font-mono uppercase tracking-widest ${
                            status === "success"
                              ? "border-green-400/30 bg-green-400/10 text-green-300"
                              : status === "failed"
                              ? "border-red-400/30 bg-red-400/10 text-red-300"
                              : "border-white/[0.08] bg-[#0a0a0f] text-[#4a4f5e]"
                          }`}
                        >
                          {status}
                        </span>
                        <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
                          {formatTime(step.event?.at)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {STEP_BADGES[step.action].map((badge) => (
                          <span
                            key={`${step.action}-${badge.label}`}
                            className={`border px-2 py-1 text-[10px] font-mono uppercase tracking-widest ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      {step.event?.details && (
                        <div className="mt-3 text-sm text-[#f5f5f0]/70 leading-6">{step.event.details}</div>
                      )}
                      {(step.event?.validationRequestId || (step.event?.txHashes && step.event.txHashes.length > 1)) && (
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase">
                          {step.event.validationRequestId && (
                            <span className="border border-white/[0.08] bg-[#0a0a0f] text-[#4a4f5e] px-2 py-1">
                              request #{step.event.validationRequestId}
                            </span>
                          )}
                          {step.event.txHashes?.slice(1).map((hash) => (
                            <a
                              key={hash}
                              href={explorerTx(hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-blue-300"
                            >
                              {shortHash(hash)} ↗
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {step.event?.txHash && (
                        <a
                          href={explorerTx(step.event.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-[10px] font-mono uppercase text-blue-300"
                        >
                          {shortHash(step.event.txHash)} ↗
                        </a>
                      )}
                      {(step.event?.filecoinCid || step.event?.filecoinUrl) && (
                        <a
                          href={step.event.filecoinCid ? storageViewerPath(step.event.filecoinCid) : step.event.filecoinUrl}
                          className="border border-green-400/20 bg-green-400/5 px-2 py-1 text-[10px] font-mono uppercase text-green-300"
                        >
                          FIL ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DashboardPanel>
      </div>
    </DashboardPageFrame>
  );
}
