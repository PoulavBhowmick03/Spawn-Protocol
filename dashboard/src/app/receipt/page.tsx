import Link from "next/link";
import { listJudgeReceipts } from "@/lib/judge-receipt";
import { storageViewerPath } from "@/lib/contracts";

export const dynamic = "force-dynamic";

function formatTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function StatusPill({ status }: { status: string }) {
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

function shortHash(hash?: string) {
  if (!hash) return null;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

export default async function ReceiptIndexPage() {
  const receipts = await listJudgeReceipts(24);

  return (
    <div className="p-4 md:p-8">

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded border border-indigo-400/20 bg-indigo-400/5 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-indigo-300">
            ERC-8004 Proof Bundles
          </div>
          <h1 className="text-2xl font-mono font-bold text-indigo-300 tracking-tight">
            Receipts
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Verifiable lifecycle proofs for canonical judge runs — identity, vote, trust receipts, Filecoin memory, and lineage.
          </p>
        </div>
        <Link
          href="/judge-flow"
          className="w-fit rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-mono text-amber-300 transition hover:bg-amber-400/15"
        >
          Start Canonical Run
        </Link>
      </div>

      {receipts.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-[#0d0d14] p-8 text-center">
          <div className="mb-2 text-2xl">◇</div>
          <div className="font-mono text-sm text-gray-400">No judge receipts found yet.</div>
          <div className="mt-1 text-xs text-gray-600">
            Run a canonical flow from{" "}
            <Link href="/judge-flow" className="text-amber-400 hover:underline">/judge-flow</Link>.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {receipts.map((receipt) => (
            <Link
              key={receipt.runId}
              href={`/receipt/${encodeURIComponent(receipt.runId)}`}
              className="block rounded-xl border border-gray-800 bg-[#0d0d14] p-4 transition hover:border-gray-600 hover:bg-[#101018]"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">

                  {/* Run ID + status badges */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-gray-100 truncate max-w-xs">{receipt.runId}</span>
                    <StatusPill status={receipt.status} />
                    <span className="rounded border border-blue-400/20 bg-blue-400/5 px-2 py-1 text-[10px] font-mono text-blue-300">
                      {receipt.governor}
                    </span>
                    {receipt.filecoinCid && (
                      <span className="rounded border border-green-400/30 bg-green-400/10 px-2 py-1 text-[10px] font-mono text-green-300">
                        Filecoin
                      </span>
                    )}
                    {receipt.validationRequestId && (
                      <span className="rounded border border-indigo-400/20 bg-indigo-400/5 px-2 py-1 text-[10px] font-mono text-indigo-300">
                        ERC-8004 #{receipt.validationRequestId}
                      </span>
                    )}
                    {receipt.decision && (
                      <span className={`rounded border px-2 py-1 text-[10px] font-mono ${
                        receipt.decision === "FOR"     ? "border-green-400/20 bg-green-400/5 text-green-300" :
                        receipt.decision === "AGAINST" ? "border-red-400/20 bg-red-400/5 text-red-300" :
                        "border-yellow-400/20 bg-yellow-400/5 text-yellow-300"
                      }`}>
                        {receipt.decision}
                      </span>
                    )}
                  </div>

                  {/* Key fields grid */}
                  <div className="grid gap-x-6 gap-y-1 text-xs font-mono text-gray-500 md:grid-cols-2 xl:grid-cols-4">
                    <div>Proposal: <span className="text-gray-300">{receipt.proposalId || "—"}</span></div>
                    <div>Proof ERC-8004: <span className="text-indigo-300">{receipt.proofChildAgentId ? `#${receipt.proofChildAgentId}` : "—"}</span></div>
                    <div>Respawn ERC-8004: <span className="text-indigo-300">{receipt.respawnedChildAgentId ? `#${receipt.respawnedChildAgentId}` : "—"}</span></div>
                    <div>Duration: <span className="text-gray-300">{receipt.durationMs ? `${(receipt.durationMs / 1000).toFixed(1)}s` : "—"}</span></div>
                    <div>Started: <span className="text-gray-300">{formatTime(receipt.startedAt)}</span></div>
                    <div>Completed: <span className="text-gray-300">{formatTime(receipt.completedAt)}</span></div>
                    <div>Events: <span className="text-gray-300">{receipt.events.length}</span></div>
                    <div>Venice calls: <span className="text-violet-300">{receipt.veniceCallsUsed ?? "—"}</span></div>
                  </div>

                  {/* Tx hash strip */}
                  {[receipt.proposalTxHash, receipt.voteTxHash, receipt.reputationTxHash, receipt.terminationTxHash, receipt.respawnTxHash]
                    .filter(Boolean).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {[
                        { label: "Proposal",    hash: receipt.proposalTxHash },
                        { label: "Vote",        hash: receipt.voteTxHash },
                        { label: "Reputation",  hash: receipt.reputationTxHash },
                        { label: "Terminate",   hash: receipt.terminationTxHash },
                        { label: "Respawn",     hash: receipt.respawnTxHash },
                      ]
                        .filter((item): item is { label: string; hash: string } => Boolean(item.hash))
                        .map((item) => (
                          <span key={`${item.label}-${item.hash}`}
                            className="rounded border border-blue-400/20 bg-blue-400/5 px-2 py-0.5 text-[10px] font-mono text-blue-300">
                            {item.label}: {shortHash(item.hash)}
                          </span>
                        ))}
                    </div>
                  )}

                  {receipt.failureReason && (
                    <div className="mt-3 rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-mono text-red-300">
                      {receipt.failureReason}
                    </div>
                  )}
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="rounded border border-indigo-400/20 bg-indigo-400/5 px-3 py-1.5 text-xs font-mono text-indigo-300">
                    Open Receipt ↗
                  </span>
                  {receipt.filecoinCid && (
                    <span className="text-[10px] font-mono text-green-400/60 max-w-[140px] truncate">
                      {receipt.filecoinCid.slice(0, 20)}…
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
