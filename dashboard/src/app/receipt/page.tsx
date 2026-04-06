import Link from "next/link";
import { listJudgeReceipts } from "@/lib/judge-receipt";

export const dynamic = "force-dynamic";

function formatTime(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase()
    + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function shortId(id: string) {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function shortHash(hash?: string) {
  if (!hash) return null;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function StatusChip({ status }: { status: string }) {
  const cfg =
    status === "completed" ? "text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/5" :
    status === "failed"    ? "text-[#ff3b3b] border-[#ff3b3b]/30 bg-[#ff3b3b]/5" :
    status === "running"   ? "text-[#f5a623] border-[#f5a623]/30 bg-[#f5a623]/5 animate-pulse" :
    status === "queued"    ? "text-[#f5a623] border-[#f5a623]/30 bg-[#f5a623]/5" :
                             "text-[#4a4f5e] border-white/[0.08]";
  return (
    <span className={`font-mono text-[9px] uppercase border px-1.5 py-0.5 leading-none ${cfg}`}>
      {status}
    </span>
  );
}

function DecisionChip({ decision }: { decision?: string }) {
  if (!decision) return <span className="font-mono text-[10px] text-[#4a4f5e]">—</span>;
  const cfg =
    decision === "FOR"     ? "text-[#00ff88] border-[#00ff88]/30" :
    decision === "AGAINST" ? "text-[#ff3b3b] border-[#ff3b3b]/30" :
                             "text-[#f5a623] border-[#f5a623]/30";
  return (
    <span className={`font-mono text-[9px] uppercase border px-1.5 py-0.5 leading-none ${cfg}`}>
      {decision}
    </span>
  );
}

export default async function ReceiptIndexPage() {
  const receipts = await listJudgeReceipts(24);

  const completedCount = receipts.filter((r) => r.status === "completed").length;
  const failedCount    = receipts.filter((r) => r.status === "failed").length;
  const runningCount   = receipts.filter((r) => r.status === "running" || r.status === "queued").length;
  const filecoinCount  = receipts.filter((r) => r.filecoinCid).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-mono text-sm font-bold text-[#f5f5f0] uppercase tracking-widest">
            RECEIPTS
          </h1>
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            ERC-8004 PROOF BUNDLES — LIFECYCLE VERIFIABLE RECEIPTS
          </span>
        </div>
        <Link
          href="/judge-flow"
          className="font-mono text-[10px] text-[#f5a623] uppercase border border-[#f5a623]/30 px-3 py-1.5 hover:bg-[#f5a623]/10 transition-colors"
        >
          START_CANONICAL_RUN →
        </Link>
      </div>

      {/* Stat strip */}
      <div className="border-b border-white/[0.08] grid grid-cols-2 sm:grid-cols-4">
        <div className="border-r border-white/[0.08] px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">TOTAL_RUNS</div>
          <div className="font-mono text-3xl font-bold text-[#f5f5f0] leading-none">{receipts.length}</div>
        </div>
        <div className="border-r border-white/[0.08] px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">COMPLETED</div>
          <div className="font-mono text-3xl font-bold text-[#00ff88] leading-none">{completedCount}</div>
        </div>
        <div className="border-r border-white/[0.08] px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">FAILED</div>
          <div className="font-mono text-3xl font-bold text-[#ff3b3b] leading-none">{failedCount}</div>
        </div>
        <div className="px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">FILECOIN</div>
          <div className="font-mono text-3xl font-bold text-[#f5f5f0] leading-none">{filecoinCount}</div>
        </div>
      </div>

      {receipts.length === 0 ? (
        <div className="m-4 border border-white/[0.08] p-12 text-center">
          <div className="mb-4 text-4xl text-[#4a4f5e]">◇</div>
          <h2 className="font-mono text-sm text-[#4a4f5e] uppercase tracking-widest mb-2">
            NO RECEIPTS FOUND
          </h2>
          <p className="font-mono text-[11px] text-[#4a4f5e]/60 mb-4">
            RUN A CANONICAL FLOW TO GENERATE PROOF BUNDLES
          </p>
          <Link
            href="/judge-flow"
            className="font-mono text-[10px] text-[#f5a623] uppercase border border-[#f5a623]/30 px-4 py-2 hover:bg-[#f5a623]/10 transition-colors"
          >
            START_CANONICAL_RUN →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* Table header */}
          <div className="border-b border-white/[0.08] bg-[#0d0d14] grid grid-cols-[1fr_80px_120px_70px_70px_60px_80px_80px] gap-x-3 px-4 py-2 min-w-[900px]">
            {["RUN_ID", "STATUS", "GOVERNOR", "DECISION", "DURATION", "EVENTS", "STARTED", ""].map((h) => (
              <span key={h} className="font-mono text-[9px] text-[#4a4f5e] uppercase tracking-widest">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {receipts.map((receipt, i) => {
            const durationSec = receipt.durationMs
              ? `${(receipt.durationMs / 1000).toFixed(1)}S`
              : "—";

            const txCount = [
              receipt.proposalTxHash,
              receipt.voteTxHash,
              receipt.reputationTxHash,
              receipt.terminationTxHash,
              receipt.respawnTxHash,
            ].filter(Boolean).length;

            const rowBg = i % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]";
            const leftBorder =
              receipt.status === "failed"  ? "border-l-2 border-l-[#ff3b3b]" :
              receipt.status === "running" ? "border-l-2 border-l-[#f5a623]" :
              receipt.status === "completed" ? "border-l-2 border-l-[#00ff88]/40" :
              "";

            return (
              <Link
                key={receipt.runId}
                href={`/receipt/${encodeURIComponent(receipt.runId)}`}
                className={`grid grid-cols-[1fr_80px_120px_70px_70px_60px_80px_80px] gap-x-3 items-center px-4 py-2.5 border-b border-white/[0.05] min-w-[900px] hover:bg-white/[0.02] transition-colors group ${rowBg} ${leftBorder}`}
              >
                {/* Run ID */}
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-[#f5f5f0]/80 truncate group-hover:text-[#f5f5f0] transition-colors">
                    {shortId(receipt.runId)}
                  </div>
                  <div className="font-mono text-[9px] text-[#4a4f5e] mt-0.5 flex items-center gap-2">
                    {receipt.filecoinCid && (
                      <span className="text-[#4a4f5e] border border-white/[0.08] px-1 py-0.5 leading-none">FIL</span>
                    )}
                    {receipt.validationRequestId && (
                      <span className="text-[#4a4f5e] border border-white/[0.08] px-1 py-0.5 leading-none">
                        ERC-8004 #{receipt.validationRequestId}
                      </span>
                    )}
                    {txCount > 0 && (
                      <span className="text-[#4a4f5e]">{txCount} TX</span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <StatusChip status={receipt.status} />

                {/* Governor */}
                <span className="font-mono text-[10px] text-[#4a4f5e] truncate">
                  {receipt.governor ?? "—"}
                </span>

                {/* Decision */}
                <DecisionChip decision={receipt.decision} />

                {/* Duration */}
                <span className="font-mono text-[10px] text-[#f5f5f0]/50 tabular-nums">
                  {durationSec}
                </span>

                {/* Events */}
                <span className="font-mono text-[10px] text-[#f5f5f0]/50 tabular-nums">
                  {receipt.events.length}
                </span>

                {/* Started */}
                <span className="font-mono text-[9px] text-[#4a4f5e] tabular-nums">
                  {receipt.startedAt
                    ? new Date(receipt.startedAt).toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase()
                    : "—"}
                </span>

                {/* Open */}
                <span className="font-mono text-[10px] text-[#4a4f5e] group-hover:text-[#00ff88] transition-colors text-right">
                  OPEN →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
