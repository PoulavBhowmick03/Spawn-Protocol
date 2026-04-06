"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RegisterDAO } from "@/components/RegisterDAO";
import { CurlSnippet } from "@/components/CurlSnippet";
import { ProductIdeasPanel } from "@/components/ProductIdeasPanel";

type RegisteredDAO = {
  id: string;
  slug: string;
  name: string;
  source: "tally" | "snapshot";
  sourceRef: string;
  philosophy: string;
  contact: string;
  createdAt: string;
  status:
    | "registered"
    | "validated"
    | "discovering"
    | "mirrored"
    | "cohort_spawned"
    | "voting"
    | "idle"
    | "error";
  enabled: boolean;
  mirroredProposalCount: number;
  activeProposalCount: number;
  spawnedChildren: string[];
};

const PHILOSOPHY_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  conservative: { label: "CONSERVATIVE", color: "text-[#f5a623]", border: "border-[#f5a623]/30" },
  progressive:  { label: "PROGRESSIVE",  color: "text-blue-400",  border: "border-blue-400/30" },
  neutral:      { label: "NEUTRAL",       color: "text-[#4a4f5e]", border: "border-white/[0.08]" },
};

export default function DAOsPage() {
  const [daos, setDaos] = useState<RegisteredDAO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCurl, setShowCurl] = useState(false);

  async function load() {
    try {
      setError(null);
      const res = await fetch("/api/daos", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setDaos(Array.isArray(data.daos) ? data.daos : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load DAOs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const mirroredCount = daos.filter((d) => d.mirroredProposalCount > 0).length;
  const cohortCount = daos.filter((d) => d.spawnedChildren.length > 0).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-mono text-sm font-bold text-[#f5f5f0] uppercase tracking-widest">
            CONNECTED_DAOS
          </h1>
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            ADVISORY_MODE — SPAWN MIRRORS PROPOSALS, DOES NOT CONTROL GOVERNANCE
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">LIVE</span>
        </div>
      </div>

      {/* Stat strip */}
      <div className="border-b border-white/[0.08] grid grid-cols-3">
        <div className="border-r border-white/[0.08] px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">
            TOTAL_DAOS
          </div>
          <div className="font-mono text-3xl font-bold text-[#f5f5f0] leading-none">
            {loading ? "—" : daos.length}
          </div>
        </div>
        <div className="border-r border-white/[0.08] px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">
            MIRRORED
          </div>
          <div className="font-mono text-3xl font-bold text-[#00ff88] leading-none">
            {loading ? "—" : mirroredCount}
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">
            LIVE_COHORTS
          </div>
          <div className="font-mono text-3xl font-bold text-[#f5a623] leading-none">
            {loading ? "—" : cohortCount}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Register form */}
        <RegisterDAO onSuccess={load} />

        {/* API curl snippet — collapsible */}
        <div className="border border-white/[0.08] bg-[#0d0d14]">
          <button
            onClick={() => setShowCurl((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 bg-[#4a4f5e]" />
              <span className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                API_INTEGRATION — CURL_EXAMPLES
              </span>
            </div>
            <span className="font-mono text-[10px] text-[#4a4f5e]">
              {showCurl ? "▲ HIDE" : "▼ SHOW"}
            </span>
          </button>
          {showCurl && (
            <div className="border-t border-white/[0.08]">
              <CurlSnippet />
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="border border-[#ff3b3b]/30 bg-[#ff3b3b]/5 px-4 py-3">
            <p className="text-[11px] font-mono text-[#ff3b3b] uppercase">ERROR: {error}</p>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-white/[0.08] bg-[#0d0d14] h-16 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && daos.length === 0 && (
          <div className="border border-white/[0.08] bg-[#0d0d14] p-12 text-center">
            <div className="mb-4 text-4xl text-[#4a4f5e]">◈</div>
            <h2 className="font-mono text-sm text-[#4a4f5e] uppercase tracking-widest mb-2">
              NO DAOS CONNECTED
            </h2>
            <p className="text-[11px] font-mono text-[#4a4f5e]/60">
              USE THE FORM ABOVE TO CONNECT A TALLY OR SNAPSHOT DAO
            </p>
          </div>
        )}

        {/* DAO table */}
        {!loading && daos.length > 0 && (
          <div className="border border-white/[0.08]">
            {/* Table header */}
            <div className="border-b border-white/[0.08] bg-[#0d0d14] grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-4 py-2">
              {["DAO_NAME", "SOURCE", "PHILOSOPHY", "STATUS", "ACTIVITY", ""].map((h) => (
                <span key={h} className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                  {h}
                </span>
              ))}
            </div>

            {/* DAO rows */}
            {daos.map((dao, i) => {
              const phil = PHILOSOPHY_CONFIG[dao.philosophy] ?? PHILOSOPHY_CONFIG.neutral;
              const statusTone =
                dao.status === "voting"
                  ? "text-blue-300 border-blue-400/30 bg-blue-400/5"
                  : dao.status === "cohort_spawned"
                    ? "text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/5"
                    : dao.status === "mirrored"
                      ? "text-cyan-300 border-cyan-400/30 bg-cyan-400/5"
                      : dao.status === "discovering" || dao.status === "validated" || dao.status === "registered"
                        ? "text-[#f5a623] border-[#f5a623]/30 bg-[#f5a623]/5"
                        : dao.status === "error"
                          ? "text-[#ff3b3b] border-[#ff3b3b]/30 bg-[#ff3b3b]/5"
                          : "text-[#4a4f5e] border-white/[0.08] bg-transparent";

              return (
                <Link
                  key={dao.id}
                  href={`/dao/${dao.slug}`}
                  className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 items-center px-4 py-3 border-b border-white/[0.06] last:border-0 transition-colors hover:bg-white/[0.02] group ${
                    i % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]"
                  }`}
                >
                  {/* Name + ref */}
                  <div className="min-w-0">
                    <div className="font-mono text-[12px] font-semibold text-[#f5f5f0] group-hover:text-[#00ff88] transition-colors truncate">
                      {dao.name}
                    </div>
                    <div className="font-mono text-[10px] text-[#4a4f5e] truncate mt-0.5">
                      {dao.sourceRef}
                    </div>
                  </div>

                  {/* Source */}
                  <span className="font-mono text-[10px] uppercase border border-white/[0.08] text-[#4a4f5e] px-2 py-0.5 flex-shrink-0">
                    {dao.source.toUpperCase()}
                  </span>

                  {/* Philosophy */}
                  <span className={`font-mono text-[10px] uppercase border px-2 py-0.5 flex-shrink-0 ${phil.color} ${phil.border}`}>
                    {phil.label}
                  </span>

                  {/* Status */}
                  <span
                    className={`font-mono text-[10px] uppercase border px-2 py-0.5 flex-shrink-0 ${statusTone}`}
                  >
                    {dao.status.replace(/_/g, " ")}
                  </span>

                  {/* Activity */}
                  <span className="font-mono text-[10px] text-[#4a4f5e] flex-shrink-0 tabular-nums uppercase">
                    {dao.activeProposalCount} active · {dao.spawnedChildren.length} live
                  </span>

                  {/* Arrow */}
                  <span className="font-mono text-[10px] text-[#4a4f5e] group-hover:text-[#00ff88] transition-colors flex-shrink-0">
                    VIEW →
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        <ProductIdeasPanel />
      </div>
    </div>
  );
}
