"use client";

import Link from "next/link";
import { use, useEffect, useState, type ReactNode } from "react";
import { isFilecoinPieceCid } from "@/lib/contracts";

type StoragePayload = {
  cid: string;
  storage: "filecoin" | "ipfs";
  data: any;
};

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-gray-800 bg-[#0b0b12] p-4 text-xs text-gray-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({
  title,
  children,
  tone = "gray",
}: {
  title: string;
  children: ReactNode;
  tone?: "gray" | "red" | "yellow" | "cyan" | "green" | "purple";
}) {
  const tones = {
    gray: "border-gray-800 bg-[#101018]",
    red: "border-red-400/20 bg-red-400/5",
    yellow: "border-yellow-400/20 bg-yellow-400/5",
    cyan: "border-cyan-400/20 bg-cyan-400/5",
    green: "border-green-400/20 bg-green-400/5",
    purple: "border-purple-400/20 bg-purple-400/5",
  } as const;

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-gray-500">{title}</div>
      {children}
    </div>
  );
}

function renderTerminationMemory(data: any) {
  return (
    <div className="space-y-4">
      <Section title="Summary" tone="cyan">
        <p className="text-sm text-gray-300">
          Generation {data.generation ?? "—"} memory for <span className="font-mono text-cyan-300">{data.childLabel ?? "unknown-child"}</span>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono">
          {typeof data.score === "number" && (
            <span className="rounded border border-red-400/30 bg-red-400/10 px-2 py-1 text-red-300">
              Predecessor score: {data.score}/100
            </span>
          )}
          {data.lineageKey && (
            <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-cyan-300">
              {data.lineageKey}
            </span>
          )}
        </div>
      </Section>

      {data.reason && (
        <Section title="Predecessor Terminated" tone="red">
          <p className="text-sm text-gray-300">{data.reason}</p>
        </Section>
      )}

      {data.summary && (
        <Section title="Cause Of Death" tone="red">
          <p className="text-sm text-gray-300">{data.summary}</p>
        </Section>
      )}

      {Array.isArray(data.lessons) && data.lessons.length > 0 && (
        <Section title="Lessons Inherited" tone="yellow">
          <div className="space-y-2 text-sm text-gray-300">
            {data.lessons.map((lesson: string, index: number) => (
              <div key={`${lesson}-${index}`} className="flex items-start gap-2">
                <span className="shrink-0 text-yellow-300">→</span>
                <span>{lesson}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {Array.isArray(data.avoidPatterns) && data.avoidPatterns.length > 0 && (
        <Section title="Patterns To Avoid" tone="red">
          <div className="space-y-2 text-sm text-gray-300">
            {data.avoidPatterns.map((pattern: string, index: number) => (
              <div key={`${pattern}-${index}`} className="flex items-start gap-2">
                <span className="shrink-0 text-red-300">✕</span>
                <span>{pattern}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.recommendedFocus && (
        <Section title="Recommended Focus" tone="green">
          <p className="text-sm text-gray-300">{data.recommendedFocus}</p>
        </Section>
      )}
    </div>
  );
}

function renderSwarmSnapshot(data: any) {
  const activeAgents = Array.isArray(data.activeAgents) ? data.activeAgents : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Cycle", value: data.cycleNumber ?? "—" },
          { label: "Active Agents", value: activeAgents.length },
          { label: "Total Votes", value: data.totalVotes ?? "—" },
          { label: "ETH Balance", value: data.ethBalance ?? "—" },
        ].map((item) => (
          <Section key={item.label} title={item.label}>
            <div className="font-mono text-sm text-gray-200">{String(item.value)}</div>
          </Section>
        ))}
      </div>

      <Section title="Active Agents" tone="cyan">
        <div className="space-y-2 text-sm text-gray-300">
          {activeAgents.length === 0 ? (
            <p className="text-gray-500">No active agents in this snapshot.</p>
          ) : (
            activeAgents.map((agent: any) => (
              <div
                key={`${agent.label}-${agent.address}`}
                className="rounded border border-cyan-400/10 bg-cyan-400/5 px-3 py-2"
              >
                <div className="font-mono text-cyan-300">{agent.label}</div>
                <div className="mt-1 text-xs text-gray-400">
                  alignment {agent.alignmentScore} · votes {agent.voteCount} · generation {agent.generation}
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      {(data.spawnedThisCycle?.length > 0 || data.terminatedThisCycle?.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Spawned This Cycle" tone="green">
            <div className="space-y-1 text-sm text-gray-300">
              {(data.spawnedThisCycle ?? []).length === 0 ? (
                <p className="text-gray-500">None</p>
              ) : (
                (data.spawnedThisCycle ?? []).map((label: string) => (
                  <div key={label} className="font-mono text-green-300">
                    {label}
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Terminated This Cycle" tone="red">
            <div className="space-y-1 text-sm text-gray-300">
              {(data.terminatedThisCycle ?? []).length === 0 ? (
                <p className="text-gray-500">None</p>
              ) : (
                (data.terminatedThisCycle ?? []).map((label: string) => (
                  <div key={label} className="font-mono text-red-300">
                    {label}
                  </div>
                ))
              )}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function renderAgentIdentity(data: any) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        ["Agent", data.ensLabel ?? "—"],
        ["Address", data.address ?? "—"],
        ["Parent", data.parentAddress ?? "—"],
        ["Governor", data.governanceName ?? data.governanceContract ?? "—"],
        ["Generation", data.generation ?? "—"],
        ["ERC-8004", data.erc8004Id ?? "—"],
      ].map(([label, value]) => (
        <Section key={label} title={label} tone="purple">
          <div className="break-all font-mono text-sm text-gray-200">{String(value)}</div>
        </Section>
      ))}
    </div>
  );
}

function renderVoteRationale(data: any) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ["Agent", data.childLabel ?? "—"],
          ["Proposal", data.proposalId ?? "—"],
          ["Support", data.support ?? "—"],
          ["Governor", data.governanceContract ?? "—"],
        ].map(([label, value]) => (
          <Section key={label} title={label} tone="purple">
            <div className="break-all font-mono text-sm text-gray-200">{String(value)}</div>
          </Section>
        ))}
      </div>

      <Section title="Revealed Rationale" tone="purple">
        <p className="whitespace-pre-wrap text-sm text-gray-300">{data.rationale ?? "No rationale found."}</p>
      </Section>
    </div>
  );
}

function renderAgentLog(data: any) {
  const executionLogs = Array.isArray(data.executionLogs) ? data.executionLogs : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Agent", data.agentName ?? "—"],
          ["Version", data.version ?? "—"],
          ["Entries", executionLogs.length],
          ["Votes", data.metrics?.votesCast ?? "—"],
        ].map(([label, value]) => (
          <Section key={label} title={label} tone="green">
            <div className="font-mono text-sm text-gray-200">{String(value)}</div>
          </Section>
        ))}
      </div>

      <Section title="Recent Execution Logs" tone="green">
        <div className="space-y-2">
          {executionLogs.slice(-10).reverse().map((entry: any, index: number) => (
            <div key={`${entry.timestamp ?? "entry"}-${index}`} className="rounded border border-green-400/10 bg-green-400/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">
                {entry.phase ?? "phase"} · {entry.action ?? "action"}
              </div>
              <div className="mt-1 text-sm text-gray-300">{entry.details ?? "No details"}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function renderTypedContent(payload: StoragePayload) {
  const type = payload.data?.type;

  if (type === "termination_memory") return renderTerminationMemory(payload.data);
  if (type === "swarm_state_snapshot") return renderSwarmSnapshot(payload.data);
  if (type === "agent_identity") return renderAgentIdentity(payload.data);
  if (type === "vote_rationale") return renderVoteRationale(payload.data);
  if (Array.isArray(payload.data?.executionLogs)) return renderAgentLog(payload.data);

  return <JsonBlock value={payload.data} />;
}

export default function StorageViewerPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { cid } = use(params);
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
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
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

  const apiHref = `/api/storage?cid=${encodeURIComponent(cid)}`;
  const isPieceCid = isFilecoinPieceCid(cid);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-600">Storage Viewer</div>
          <h1 className="mt-1 break-all font-mono text-xl font-bold text-gray-100">{cid}</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">
            This page resolves Spawn Protocol storage objects directly through the dashboard. Filecoin warm-storage piece CIDs are fetched with Synapse instead of relying on an external explorer page.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={apiHref}
            target="_blank"
            className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-sm font-mono text-cyan-300"
          >
            Open API JSON
          </Link>
          {!isPieceCid && (
            <a
              href={`https://ipfs.filebase.io/ipfs/${encodeURIComponent(cid)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-purple-400/20 bg-purple-400/5 px-4 py-2 text-sm font-mono text-purple-300"
            >
              Open IPFS Gateway
            </a>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-xs font-mono">
        <span
          className={`rounded border px-2 py-1 ${
            isPieceCid
              ? "border-blue-400/30 bg-blue-400/10 text-blue-300"
              : "border-purple-400/30 bg-purple-400/10 text-purple-300"
          }`}
        >
          {isPieceCid ? "Filecoin Piece CID" : "IPFS CID"}
        </span>
        {payload?.data?.type && (
          <span className="rounded border border-green-400/30 bg-green-400/10 px-2 py-1 text-green-300">
            {payload.data.type}
          </span>
        )}
        {payload?.data?.project && (
          <span className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-300">
            {payload.data.project}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!payload && !error && (
        <div className="rounded-lg border border-gray-800 bg-[#0d0d14] px-4 py-3 text-sm text-gray-400">
          Loading storage object…
        </div>
      )}

      {payload && (
        <div className="space-y-6">
          {renderTypedContent(payload)}
          <Section title="Raw JSON" tone="gray">
            <JsonBlock value={payload.data} />
          </Section>
        </div>
      )}
    </div>
  );
}
