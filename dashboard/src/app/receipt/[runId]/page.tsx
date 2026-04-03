"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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

type JudgeExecutionLog = {
  timestamp: string;
  phase: string;
  action: string;
  details: string;
  txHash?: string;
  txHashes?: string[];
  status: string;
  proofStatus?: string;
};

type JudgeReceipt = {
  runId: string;
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
  validationTxHash?: string;
  validationResponseTxHash?: string;
  reputationTxHash?: string;
  alignmentTxHash?: string;
  terminationTxHash?: string;
  proposalTxHash?: string;
  respawnTxHash?: string;
  voteTxHash?: string;
  lineageSourceCid?: string;
  decision?: string;
  litEncrypted?: boolean;
  reasoningHash?: string;
  veniceTokensUsed?: number;
  veniceCallsUsed?: number;
  events: JudgeEvent[];
  executionLogs: JudgeExecutionLog[];
};

const EMPTY_RECEIPT: JudgeReceipt = {
  runId: "",
  status: "idle",
  governor: "uniswap",
  forcedScore: 15,
  events: [],
  executionLogs: [],
};

const STEP_ORDER = [
  { action: "judge_flow_started",                 label: "Run queued + started" },
  { action: "judge_child_spawned",                label: "Proof child spawned" },
  { action: "judge_proposal_seeded",              label: "Proposal seeded" },
  { action: "judge_vote_cast",                    label: "Private reasoning + vote cast" },
  { action: "judge_alignment_forced",             label: "Alignment forced low" },
  { action: "judge_termination_report_filecoin",  label: "Termination report on Filecoin" },
  { action: "judge_reputation_written",           label: "ERC-8004 reputation written" },
  { action: "judge_validation_written",           label: "ERC-8004 validation written" },
  { action: "judge_child_terminated",             label: "Proof child terminated" },
  { action: "judge_child_respawned",              label: "Replacement spawned" },
  { action: "judge_lineage_loaded",               label: "Lineage memory loaded" },
  { action: "judge_flow_completed",               label: "Run completed" },
] as const;

const STEP_BADGES: Record<string, Array<{ label: string; className: string }>> = {
  judge_flow_started:                [{ label: "Agent Only",       className: "border-amber-400/30 bg-amber-400/10 text-amber-300" }],
  judge_child_spawned:               [{ label: "ERC-8004 Identity",className: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" }, { label: "Agent Only", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" }],
  judge_proposal_seeded:             [{ label: "Governance",       className: "border-blue-400/30 bg-blue-400/10 text-blue-300" }, { label: "Crypto", className: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300" }],
  judge_vote_cast:                   [{ label: "AI + E2EE",        className: "border-violet-400/30 bg-violet-400/10 text-violet-300" }, { label: "Let Agents Cook", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" }],
  judge_alignment_forced:            [{ label: "AI Evaluation",    className: "border-violet-400/30 bg-violet-400/10 text-violet-300" }],
  judge_termination_report_filecoin: [{ label: "Filecoin Primary", className: "border-green-400/30 bg-green-400/10 text-green-300" }, { label: "Crypto", className: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300" }],
  judge_reputation_written:          [{ label: "ERC-8004 Receipt", className: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" }],
  judge_validation_written:          [{ label: "ERC-8004 Receipt", className: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" }],
  judge_child_terminated:            [{ label: "Lifecycle",        className: "border-red-400/30 bg-red-400/10 text-red-300" }, { label: "Agent Only", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" }],
  judge_child_respawned:             [{ label: "AI Lineage",       className: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" }, { label: "Agent Only", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" }],
  judge_lineage_loaded:              [{ label: "AI Lineage",       className: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" }, { label: "Filecoin", className: "border-green-400/30 bg-green-400/10 text-green-300" }],
  judge_flow_completed:              [{ label: "Canonical Proof",  className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" }],
};

function formatTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function shortHash(hash?: string) {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function StatusPill({ status }: { status: JudgeReceipt["status"] }) {
  const cls =
    status === "completed" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" :
    status === "failed"    ? "border-red-400/30 bg-red-400/10 text-red-300" :
    status === "running" || status === "queued" ? "border-amber-400/30 bg-amber-400/10 text-amber-300" :
    "border-gray-700 bg-gray-900 text-gray-500";
  return (
    <span className={`rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

export default function JudgeReceiptPage() {
  const params = useParams<{ runId: string }>();
  const runId = Array.isArray(params?.runId) ? params.runId[0] : params?.runId || "";
  const [receipt, setReceipt] = useState<JudgeReceipt>(EMPTY_RECEIPT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!runId) return;
        const res = await fetch(`/api/receipt/${encodeURIComponent(runId)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) { setReceipt(data); setError(null); }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load receipt");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [runId]);

  const steps = useMemo(
    () => STEP_ORDER.map((step) => ({
      ...step,
      event: receipt.events.find((e) => e.action === step.action),
    })),
    [receipt.events]
  );

  const previewCids = useMemo(() => {
    const seen = new Set<string>();
    return [
      receipt.filecoinCid ? { cid: receipt.filecoinCid, title: "Termination Report", subtitle: "Filecoin-backed termination memory generated during this run." } : null,
      receipt.lineageSourceCid && receipt.lineageSourceCid !== receipt.filecoinCid
        ? { cid: receipt.lineageSourceCid, title: "Lineage Memory", subtitle: "Memory loaded by the replacement child after respawn." }
        : null,
    ].filter((item): item is { cid: string; title: string; subtitle: string } => {
      if (!item || seen.has(item.cid)) return false;
      seen.add(item.cid);
      return true;
    });
  }, [receipt.filecoinCid, receipt.lineageSourceCid]);

  return (
    <div className="p-4 md:p-8">

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded border border-indigo-400/20 bg-indigo-400/5 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-indigo-300">
            ERC-8004 Proof Bundle
          </div>
          <h1 className="text-2xl font-mono font-bold text-indigo-300 tracking-tight">
            Canonical Receipt
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Full lifecycle proof — identity, vote, alignment, trust receipts, Filecoin memory, and lineage in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/receipt"
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-mono text-gray-300 transition hover:border-gray-500"
          >
            All Receipts
          </Link>
          <Link
            href="/judge-flow"
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-mono text-gray-300 transition hover:border-gray-500"
          >
            Judge Flow
          </Link>
          {runId && (
            <Link
              href={`/logs?search=${encodeURIComponent(runId)}`}
              className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-mono text-amber-300 transition hover:bg-amber-400/15"
            >
              Raw Logs
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-mono text-red-300">
          {error}
        </div>
      )}

      {/* Stat strip */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {[
          { label: "Status",   value: <StatusPill status={receipt.status} /> },
          { label: "Run ID",   value: <span className="font-mono text-sm text-gray-200 break-all">{receipt.runId || runId || "—"}</span> },
          { label: "Governor", value: <span className="font-mono text-sm text-gray-200">{receipt.governor || "—"}</span> },
          { label: "Duration", value: <span className="font-mono text-sm text-gray-200">{receipt.durationMs ? `${(receipt.durationMs / 1000).toFixed(1)}s` : "—"}</span> },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-gray-600">{item.label}</div>
            {item.value}
          </div>
        ))}
      </div>

      {/* Identity + Vote panels */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-600">Identity + Scope</div>
          <div className="space-y-2 text-sm">
            <div className="font-mono text-gray-300">Proof child: <span className="text-gray-100">{receipt.proofChildLabel || "—"}</span></div>
            <div className="font-mono text-gray-300">
              Proof ERC-8004:{" "}
              {receipt.proofChildAgentId ? (
                <Link href={`/agent/${receipt.proofChildAgentId}`} className="text-indigo-300 hover:underline">
                  #{receipt.proofChildAgentId}
                </Link>
              ) : "—"}
            </div>
            <div className="font-mono text-gray-300">Proposal ID: <span className="text-gray-100">{receipt.proposalId || "—"}</span></div>
            <div className="font-mono text-gray-300">Forced score: <span className="text-red-300">{receipt.forcedScore}/100</span></div>
            <div className="font-mono text-gray-300">Respawned child: <span className="text-gray-100">{receipt.respawnedChildLabel || "—"}</span></div>
            <div className="font-mono text-gray-300">
              Respawn ERC-8004:{" "}
              {receipt.respawnedChildAgentId ? (
                <Link href={`/agent/${receipt.respawnedChildAgentId}`} className="text-indigo-300 hover:underline">
                  #{receipt.respawnedChildAgentId}
                </Link>
              ) : "—"}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-600">Vote + Venice Reasoning</div>
          <div className="space-y-2 text-sm">
            <div className="font-mono text-gray-300">Decision: <span className={receipt.decision === "FOR" ? "text-green-300" : receipt.decision === "AGAINST" ? "text-red-300" : "text-yellow-300"}>{receipt.decision || "—"}</span></div>
            <div className="font-mono text-gray-300">Lit encrypted: <span className="text-gray-100">{receipt.litEncrypted === undefined ? "—" : receipt.litEncrypted ? "yes" : "no"}</span></div>
            <div className="font-mono text-gray-300">Venice calls: <span className="text-violet-300">{receipt.veniceCallsUsed ?? "—"}</span></div>
            <div className="font-mono text-gray-300">Venice tokens: <span className="text-violet-300">{receipt.veniceTokensUsed ?? "—"}</span></div>
            {receipt.reasoningHash && (
              <div className="font-mono text-gray-300 break-all">
                Reasoning hash: <span className="text-gray-400 text-xs">{receipt.reasoningHash}</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-600">Trust Receipts</div>
          <div className="space-y-2 text-sm">
            <div className="font-mono text-gray-300">Validation request: <span className="text-indigo-300">{receipt.validationRequestId ? `#${receipt.validationRequestId}` : "—"}</span></div>
            {[
              { label: "Reputation",          hash: receipt.reputationTxHash },
              { label: "Validation request",  hash: receipt.validationTxHash },
              { label: "Validation response", hash: receipt.validationResponseTxHash },
            ].map(({ label, hash }) => (
              <div key={label} className="font-mono text-gray-300 flex items-center gap-2">
                <span>{label}:</span>
                {hash ? (
                  <a href={explorerTx(hash)} target="_blank" rel="noopener noreferrer"
                    className="rounded border border-indigo-400/20 bg-indigo-400/5 px-2 py-0.5 text-[10px] text-indigo-300 hover:bg-indigo-400/10">
                    {shortHash(hash)} ↗
                  </a>
                ) : <span className="text-gray-600">—</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-600">Filecoin + Lineage</div>
          <div className="space-y-2 text-sm">
            {receipt.filecoinCid ? (
              <>
                <div className="font-mono text-gray-300 break-all text-xs">Termination CID: <span className="text-green-300">{receipt.filecoinCid}</span></div>
                <Link href={storageViewerPath(receipt.filecoinCid)}
                  className="inline-flex items-center gap-1 rounded border border-green-400/20 bg-green-400/5 px-2 py-1 text-xs font-mono text-green-300 hover:bg-green-400/10">
                  Open Storage Viewer ↗
                </Link>
              </>
            ) : (
              <div className="font-mono text-gray-600">No Filecoin CID yet</div>
            )}
            {receipt.lineageSourceCid && receipt.lineageSourceCid !== receipt.filecoinCid && (
              <div className="font-mono text-gray-300 break-all text-xs mt-2">Lineage CID: <span className="text-cyan-300">{receipt.lineageSourceCid}</span></div>
            )}
          </div>
        </div>
      </div>

      {/* All tx hashes */}
      <div className="mb-6 rounded-lg border border-gray-800 bg-[#0d0d14] p-4">
        <div className="mb-3 text-xs uppercase tracking-wider text-gray-600">Receipt Bundle</div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Proposal",             hash: receipt.proposalTxHash },
            { label: "Vote",                 hash: receipt.voteTxHash },
            { label: "Alignment",            hash: receipt.alignmentTxHash },
            { label: "Reputation",           hash: receipt.reputationTxHash },
            { label: "Validation Req",       hash: receipt.validationTxHash },
            { label: "Validation Resp",      hash: receipt.validationResponseTxHash },
            { label: "Terminate",            hash: receipt.terminationTxHash },
            { label: "Respawn",              hash: receipt.respawnTxHash },
          ]
            .filter((item): item is { label: string; hash: string } => Boolean(item.hash))
            .map((item) => (
              <a key={`${item.label}-${item.hash}`} href={explorerTx(item.hash)}
                target="_blank" rel="noopener noreferrer"
                className="rounded border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-[10px] font-mono text-blue-300 hover:bg-blue-400/10">
                {item.label}: {shortHash(item.hash)} ↗
              </a>
            ))}
          {receipt.filecoinCid && (
            <Link href={storageViewerPath(receipt.filecoinCid)}
              className="rounded border border-green-400/20 bg-green-400/5 px-2 py-1 text-[10px] font-mono text-green-300 hover:bg-green-400/10">
              Filecoin: {receipt.filecoinCid.slice(0, 16)}… ↗
            </Link>
          )}
        </div>
        {receipt.failureReason && (
          <div className="mt-4 rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm font-mono text-red-300">
            {receipt.failureReason}
          </div>
        )}
      </div>

      {/* Filecoin inline previews */}
      {previewCids.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {previewCids.map((preview) => (
            <StorageInlinePreview key={preview.cid} cid={preview.cid} title={preview.title} subtitle={preview.subtitle} />
          ))}
        </div>
      )}

      {/* Lifecycle timeline */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-[#0d0d14] p-4">
        <div className="mb-4 text-xs uppercase tracking-wider text-gray-600">Lifecycle Timeline</div>
        <div className="space-y-3">
          {steps.map((step) => {
            const ev = step.event;
            const stepStatus = ev?.status ?? "pending";
            return (
              <div key={step.action}
                className={`rounded-lg border p-3 ${
                  stepStatus === "success" ? "border-green-500/30 bg-green-500/5" :
                  stepStatus === "failed"  ? "border-red-500/30 bg-red-500/5" :
                  "border-gray-800 bg-[#101018]"
                }`}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-mono text-sm text-gray-100">{step.label}</div>
                    <div className="text-xs text-gray-500">{formatTime(ev?.at)}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(STEP_BADGES[step.action] ?? []).map((badge) => (
                        <span key={badge.label}
                          className={`rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${badge.className}`}>
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className={`rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${
                      stepStatus === "success" ? "border-green-400/30 bg-green-400/10 text-green-300" :
                      stepStatus === "failed"  ? "border-red-400/30 bg-red-400/10 text-red-300" :
                      "border-gray-700 bg-gray-900 text-gray-500"
                    }`}>
                      {stepStatus}
                    </span>
                    {ev?.txHash && (
                      <a href={explorerTx(ev.txHash)} target="_blank" rel="noopener noreferrer"
                        className="rounded border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-[10px] font-mono text-blue-300 hover:bg-blue-400/10">
                        {shortHash(ev.txHash)} ↗
                      </a>
                    )}
                    {ev?.txHashes?.slice(1).map((hash) => (
                      <a key={hash} href={explorerTx(hash)} target="_blank" rel="noopener noreferrer"
                        className="rounded border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-[10px] font-mono text-blue-300 hover:bg-blue-400/10">
                        {shortHash(hash)} ↗
                      </a>
                    ))}
                    {(ev?.filecoinCid || ev?.filecoinUrl) && (
                      <Link href={ev.filecoinCid ? storageViewerPath(ev.filecoinCid) : ev.filecoinUrl!}
                        className="rounded border border-green-400/20 bg-green-400/5 px-2 py-1 text-[10px] font-mono text-green-300 hover:bg-green-400/10">
                        FIL ↗
                      </Link>
                    )}
                  </div>
                </div>
                {ev?.details && <div className="mt-2 text-xs text-gray-500">{ev.details}</div>}
                {ev?.validationRequestId && (
                  <div className="mt-1 text-[10px] font-mono text-gray-600">request #{ev.validationRequestId}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!loading && receipt.startedAt && (
        <div className="text-xs font-mono text-gray-600">
          Started: {formatTime(receipt.startedAt)} · Completed: {formatTime(receipt.completedAt)}
        </div>
      )}
    </div>
  );
}
