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

interface RegisterDAOProps {
  onSuccess?: () => void;
}

const inputClass =
  "w-full border border-white/[0.08] bg-[#0a0a0f] px-3 py-2 text-[11px] font-mono text-[#f5f5f0] placeholder-[#4a4f5e] focus:border-[#00ff88]/40 focus:outline-none transition-colors";

const labelClass = "block font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1.5";

export function RegisterDAO({ onSuccess }: RegisterDAOProps) {
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
      onSuccess?.();
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-white/[0.08] bg-[#0d0d14]">
      {/* Toggle header */}
      <button
        onClick={() => { setOpen((v) => !v); setResult(null); setError(null); }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 bg-[#00ff88]" />
          <span className="font-mono text-[11px] font-bold text-[#00ff88] uppercase tracking-widest">
            CONNECT_DAO
          </span>
          <span className="font-mono text-[10px] text-[#4a4f5e]">
            MIRROR EXTERNAL PROPOSALS INTO SPAWN SIMULATION LAYER
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#4a4f5e]">{open ? "▲ COLLAPSE" : "▼ EXPAND"}</span>
      </button>

      {open && (
        <div className="border-t border-white/[0.08] px-4 pb-4 pt-4">
          {/* Success banner */}
          {result && (
            <div className="mb-4 border border-[#00ff88]/30 bg-[#00ff88]/5 px-4 py-3">
              <p className="font-mono text-[11px] text-[#00ff88] uppercase">
                {result.status === "existing" ? "ALREADY_REGISTERED:" : "REGISTERED:"}{" "}
                <span className="font-bold">{result.resolvedName}</span>
              </p>
              <Link
                href={result.dashboardUrl}
                className="mt-1 inline-block font-mono text-[10px] text-[#00ff88]/70 hover:text-[#00ff88] uppercase tracking-wider transition-colors"
              >
                VIEW_DAO_DASHBOARD →
              </Link>
            </div>
          )}

          {/* Error banner */}
          {error && !result && (
            <div className="mb-4 border border-[#ff3b3b]/30 bg-[#ff3b3b]/5 px-4 py-3">
              <p className="font-mono text-[11px] text-[#ff3b3b] uppercase">ERROR: {error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* DAO Name */}
              <div>
                <label className={labelClass}>DAO_NAME</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Uniswap"
                  className={inputClass}
                />
              </div>

              {/* Source toggle */}
              <div>
                <label className={labelClass}>SOURCE_TYPE</label>
                <div className="flex gap-0">
                  {(["snapshot", "tally"] as Source[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSource(s); setSourceRef(""); }}
                      className={`flex-1 border py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                        source === s
                          ? "border-[#00ff88]/50 bg-[#00ff88]/10 text-[#00ff88]"
                          : "border-white/[0.08] bg-[#0a0a0f] text-[#4a4f5e] hover:text-[#f5f5f0]"
                      } first:border-r-0`}
                    >
                      {s === "tally" ? "TALLY" : "SNAPSHOT"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Source ref */}
            <div>
              <label className={labelClass}>
                {source === "tally" ? "TALLY_URL_OR_SLUG" : "SNAPSHOT_SPACE"}
              </label>
              <input
                type="text"
                required
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder={placeholder}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Philosophy */}
              <div>
                <label className={labelClass}>PHILOSOPHY</label>
                <select
                  value={philosophy}
                  onChange={(e) => setPhilosophy(e.target.value as Philosophy)}
                  className={inputClass}
                >
                  <option value="neutral">NEUTRAL</option>
                  <option value="conservative">CONSERVATIVE</option>
                  <option value="progressive">PROGRESSIVE</option>
                </select>
              </div>

              {/* Display slug */}
              <div>
                <label className={labelClass}>DISPLAY_SLUG (OPTIONAL)</label>
                <input
                  type="text"
                  value={displaySlug}
                  onChange={(e) => setDisplaySlug(e.target.value)}
                  placeholder="auto-generated"
                  className={inputClass}
                />
              </div>

              {/* Contact */}
              <div>
                <label className={labelClass}>CONTACT (OPTIONAL)</label>
                <input
                  type="email"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="team@dao.xyz"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
              <p className="font-mono text-[10px] text-[#4a4f5e]">
                ADVISORY_MODE — SPAWN MIRRORS PROPOSALS AND AGENT VOTES; IT DOES NOT CONTROL YOUR DAO
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="border border-[#00ff88]/40 bg-[#00ff88]/10 px-6 py-2 font-mono text-[10px] text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88]/20 hover:border-[#00ff88]/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ml-4"
              >
                {submitting ? "REGISTERING…" : "REGISTER_DAO →"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
