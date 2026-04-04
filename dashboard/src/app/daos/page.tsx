"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RegisterDAO } from "@/components/RegisterDAO";
import { CurlSnippet } from "@/components/CurlSnippet";

type RegisteredDAO = {
  id: string;
  slug: string;
  name: string;
  source: "tally" | "snapshot";
  sourceRef: string;
  philosophy: string;
  contact: string;
  createdAt: string;
  status: "active" | "pending";
};

export default function DAOsPage() {
  const [daos, setDaos] = useState<RegisteredDAO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono font-bold tracking-tight text-cyan-400">
              Connected DAOs
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              External DAOs mirrored into the Spawn simulation layer — agents vote in advisory mode
            </p>
          </div>
          <div className="text-2xl font-mono font-bold text-cyan-400">
            {loading ? "…" : daos.length}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <RegisterDAO />
      </div>

      <CurlSnippet />


      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-mono text-red-400">{error}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4 animate-pulse">
              <div className="mb-2 h-4 w-1/4 rounded bg-gray-800" />
              <div className="h-3 w-1/2 rounded bg-gray-800" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && daos.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] p-10 text-center">
          <div className="mb-3 text-3xl">◈</div>
          <h2 className="font-mono text-lg text-gray-400">No DAOs connected yet</h2>
          <p className="mt-2 text-sm text-gray-600">
            Use the form above to connect a Tally or Snapshot DAO.
            Spawn will mirror their proposals and vote in advisory mode.
          </p>
        </div>
      )}

      {!loading && daos.length > 0 && (
        <div className="space-y-3">
          {daos.map((dao) => (
            <Link
              key={dao.id}
              href={`/dao/${dao.slug}`}
              className="block rounded-lg border border-gray-800 bg-[#0d0d14] p-4 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-cyan-300">{dao.name}</span>
                    <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-gray-500">
                      {dao.source}
                    </span>
                    {dao.philosophy && dao.philosophy !== "neutral" && (
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
                          dao.philosophy === "conservative"
                            ? "border-amber-400/30 text-amber-400/80"
                            : "border-purple-400/30 text-purple-400/80"
                        }`}
                      >
                        {dao.philosophy}
                      </span>
                    )}
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
                        dao.status === "active"
                          ? "border-emerald-400/30 text-emerald-400/70"
                          : "border-gray-700 text-gray-600"
                      }`}
                    >
                      {dao.status}
                    </span>
                  </div>
                  <p className="truncate text-xs font-mono text-gray-500">
                    {dao.source === "tally" ? "Tally org " : "Snapshot space "}
                    <span className="text-gray-400">{dao.sourceRef}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-mono text-gray-600">
                    {new Date(dao.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-0.5 text-xs font-mono text-cyan-500">View →</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
