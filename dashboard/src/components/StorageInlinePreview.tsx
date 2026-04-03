"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isFilecoinPieceCid, storageViewerPath } from "@/lib/contracts";

type StoragePayload = {
  cid: string;
  storage: "filecoin" | "ipfs";
  data: any;
};

type StorageSummary = {
  tone: string;
  badge: string;
  headline: string;
  detail: string;
  meta: string[];
};

function clamp(text: string | undefined | null, limit = 180) {
  const value = (text || "").replace(/\s+/g, " ").trim();
  if (!value) return "No content available.";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function summarize(payload: StoragePayload): StorageSummary {
  const data = payload.data ?? {};
  const type = data.type || (Array.isArray(data.executionLogs) ? "agent_log" : "json");

  if (type === "termination_memory") {
    return {
      tone: "border-red-400/20 bg-red-400/5",
      badge: "termination_memory",
      headline: `${data.childLabel || "unknown-agent"} · generation ${data.generation ?? "—"}`,
      detail: clamp(data.summary || data.reason, 220),
      meta: [
        typeof data.score === "number" ? `score ${data.score}/100` : null,
        Array.isArray(data.lessons) ? `${data.lessons.length} lesson${data.lessons.length === 1 ? "" : "s"}` : null,
      ].filter(Boolean) as string[],
    };
  }

  if (type === "swarm_state_snapshot") {
    const activeAgents = Array.isArray(data.activeAgents) ? data.activeAgents : [];
    return {
      tone: "border-blue-400/20 bg-blue-400/5",
      badge: "swarm_state_snapshot",
      headline: `Cycle ${data.cycleNumber ?? "—"} · ${activeAgents.length} active agent${activeAgents.length === 1 ? "" : "s"}`,
      detail: `Votes ${data.totalVotes ?? "—"} · ETH ${data.ethBalance ?? "—"} · Spawned ${(data.spawnedThisCycle ?? []).length} · Terminated ${(data.terminatedThisCycle ?? []).length}`,
      meta: activeAgents.slice(0, 2).map((agent: any) => `${agent.label} (${agent.alignmentScore ?? "—"})`),
    };
  }

  if (type === "agent_identity") {
    return {
      tone: "border-purple-400/20 bg-purple-400/5",
      badge: "agent_identity",
      headline: data.ensLabel || data.address || "Agent identity",
      detail: `Generation ${data.generation ?? "—"} · ERC-8004 ${data.erc8004Id ?? "—"} · ${data.governanceName || data.governanceContract || "unknown governor"}`,
      meta: [data.address, data.parentAddress].filter(Boolean),
    };
  }

  if (type === "vote_rationale") {
    return {
      tone: "border-purple-400/20 bg-purple-400/5",
      badge: "vote_rationale",
      headline: `${data.childLabel || "agent"} · ${data.support || "VOTE"}`,
      detail: clamp(data.rationale, 220),
      meta: [data.proposalId ? `proposal ${data.proposalId}` : null, data.governanceContract].filter(Boolean) as string[],
    };
  }

  if (Array.isArray(data.executionLogs)) {
    const latest = [...data.executionLogs].reverse().find((entry) => entry?.details || entry?.action);
    return {
      tone: "border-green-400/20 bg-green-400/5",
      badge: "agent_log",
      headline: `${data.agentName || "agent_log"} · ${data.executionLogs.length} entr${data.executionLogs.length === 1 ? "y" : "ies"}`,
      detail: latest
        ? clamp(`${latest.phase || "phase"} · ${latest.action || "action"} · ${latest.details || ""}`, 220)
        : "No recent execution log entries.",
      meta: [
        data.metrics?.votesCast !== undefined ? `votes ${data.metrics.votesCast}` : null,
        data.metrics?.childrenTerminated !== undefined ? `terminated ${data.metrics.childrenTerminated}` : null,
      ].filter(Boolean) as string[],
    };
  }

  return {
    tone: "border-gray-800 bg-[#101018]",
    badge: type,
    headline: payload.storage === "filecoin" ? "Filecoin object" : "IPFS object",
    detail: clamp(JSON.stringify(data), 220),
    meta: [],
  };
}

export function StorageInlinePreview({
  cid,
  title,
  subtitle,
}: {
  cid: string;
  title: string;
  subtitle?: string;
}) {
  const [payload, setPayload] = useState<StoragePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/storage?cid=${encodeURIComponent(cid)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load storage object");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [cid]);

  const summary = payload ? summarize(payload) : null;

  return (
    <div className={`rounded-xl border p-4 ${summary?.tone || "border-gray-800 bg-[#0d0d14]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500">{title}</div>
          {subtitle && <div className="mt-1 text-xs text-gray-500">{subtitle}</div>}
        </div>
        <Link
          href={storageViewerPath(cid)}
          className="rounded border border-gray-700 bg-[#0b0b12] px-2 py-1 text-[10px] font-mono text-gray-300"
        >
          {isFilecoinPieceCid(cid) ? "FIL" : "IPFS"} ↗
        </Link>
      </div>

      <div className="mt-3 break-all font-mono text-xs text-gray-500">{cid}</div>

      {error ? (
        <div className="mt-3 rounded border border-red-400/20 bg-red-400/5 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : !summary ? (
        <div className="mt-3 text-sm text-gray-500">Loading storage preview…</div>
      ) : (
        <>
          <div className="mt-3 inline-flex rounded border border-gray-700 bg-[#0b0b12] px-2 py-1 text-[10px] font-mono text-gray-300">
            {summary.badge}
          </div>
          <div className="mt-3 text-sm font-medium text-gray-100">{summary.headline}</div>
          <div className="mt-2 text-sm text-gray-300">{summary.detail}</div>
          {summary.meta.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.meta.map((item) => (
                <span
                  key={item}
                  className="rounded border border-gray-700 bg-[#0b0b12] px-2 py-1 text-[10px] font-mono text-gray-400"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
