"use client";

import { useState } from "react";
import Link from "next/link";

type Source = "tally" | "snapshot";
type Philosophy = "neutral" | "conservative" | "progressive";

interface RegistrationResult {
  slug: string;
  dashboardUrl: string;
  resolvedName: string;
  status: string;
}

export function RegisterDAO() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("snapshot");
  const [name, setName] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [displaySlug, setDisplaySlug] = useState("");
  const [philosophy, setPhilosophy] = useState<Philosophy>("neutral");
  const [contact, setContact] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeholder =
    source === "tally"
      ? "e.g. uniswap, or tally.xyz/gov/uniswap"
      : "e.g. aave.eth, or snapshot.org/#/aave.eth";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/daos/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, source, sourceRef, displaySlug, philosophy, contact }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.slug) {
          setError(`Already registered as "${data.slug}"`);
          setResult({ slug: data.slug, dashboardUrl: `/dao/${data.slug}`, resolvedName: name, status: "existing" });
        } else {
          setError(data.error || `Registration failed (${res.status})`);
        }
        return;
      }

      setResult({
        slug: data.slug,
        dashboardUrl: `/dao/${data.slug}`,
        resolvedName: data.resolvedName || name,
        status: data.status,
      });
      setName("");
      setSourceRef("");
      setDisplaySlug("");
      setPhilosophy("neutral");
      setContact("");
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5">
      <button
        onClick={() => { setOpen((v) => !v); setResult(null); setError(null); }}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-cyan-400">⊕</span>
          <span className="text-sm font-mono font-semibold text-cyan-300">Connect a DAO</span>
          <span className="text-xs font-mono text-gray-500">
            Mirror external proposals into the Spawn simulation layer
          </span>
        </div>
        <span className="font-mono text-xs text-gray-600">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-cyan-400/10 px-4 pb-4 pt-3">
          {result && (
            <div className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3">
              <p className="text-sm font-mono text-emerald-300">
                {result.status === "existing" ? "Already registered:" : "Registered:"}{" "}
                <span className="font-bold">{result.resolvedName}</span>
              </p>
              <Link
                href={result.dashboardUrl}
                className="mt-1 inline-block text-xs font-mono text-emerald-400 underline hover:text-emerald-300"
              >
                View DAO dashboard →
              </Link>
            </div>
          )}

          {error && !result && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm font-mono text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  DAO Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Uniswap"
                  className="w-full rounded border border-gray-700 bg-[#0d0d14] px-3 py-1.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Source
                </label>
                <div className="flex gap-2">
                  {(["snapshot", "tally"] as Source[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSource(s); setSourceRef(""); }}
                      className={`flex-1 rounded border px-3 py-1.5 text-xs font-mono transition-colors ${
                        source === s
                          ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300"
                          : "border-gray-700 bg-[#0d0d14] text-gray-500 hover:border-gray-600"
                      }`}
                    >
                      {s === "tally" ? "Tally" : "Snapshot"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                {source === "tally" ? "Tally URL or Slug" : "Snapshot Space"}
              </label>
              <input
                type="text"
                required
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded border border-gray-700 bg-[#0d0d14] px-3 py-1.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:border-cyan-400/50 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Philosophy
                </label>
                <select
                  value={philosophy}
                  onChange={(e) => setPhilosophy(e.target.value as Philosophy)}
                  className="w-full rounded border border-gray-700 bg-[#0d0d14] px-3 py-1.5 text-sm font-mono text-gray-200 focus:border-cyan-400/50 focus:outline-none"
                >
                  <option value="neutral">Neutral</option>
                  <option value="conservative">Conservative</option>
                  <option value="progressive">Progressive</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Display Slug (optional)
                </label>
                <input
                  type="text"
                  value={displaySlug}
                  onChange={(e) => setDisplaySlug(e.target.value)}
                  placeholder="auto-generated"
                  className="w-full rounded border border-gray-700 bg-[#0d0d14] px-3 py-1.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Contact (optional)
                </label>
                <input
                  type="email"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="team@dao.xyz"
                  className="w-full rounded border border-gray-700 bg-[#0d0d14] px-3 py-1.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] font-mono text-gray-600">
                Advisory mode only — Spawn mirrors proposals and agent votes; it does not control your DAO
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="rounded border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-sm font-mono text-cyan-300 transition-colors hover:bg-cyan-400/20 disabled:opacity-40"
              >
                {submitting ? "Registering…" : "Register"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
