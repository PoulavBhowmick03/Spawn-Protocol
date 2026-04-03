"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { keccak256, toBytes, type Address } from "viem";
import { useChildData } from "@/hooks/useSwarmData";
import { useChainContext } from "@/context/ChainContext";
import { AlignmentBadge } from "@/components/AlignmentBadge";
import {
  formatAddress,
  explorerAddress,
  explorerTx,
  formatTimestamp,
  supportLabel,
  supportColor,
  ensName,
  governorName,
  storageViewerPath,
} from "@/lib/contracts";

const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D";
const ENS_REGISTRY_ABI = [
  { type: "function", name: "getTextRecord", inputs: [{ name: "label", type: "string" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;

// ERC-8004 Agent Registry on Base Sepolia
const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;
const REPUTATION_REGISTRY = "0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14" as Address;
const VALIDATION_REGISTRY = "0x3caE87f24e15970a8e19831CeCD5FAe3c087a546" as Address;
const ERC8004_ABI = [
  { type: "function", name: "ownerOf", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "getMetadata", inputs: [{ name: "agentId", type: "uint256" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "tokenURI", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;
const REPUTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "getSummary",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalFeedback", type: "uint256" },
          { name: "activeFeedback", type: "uint256" },
          { name: "averageScore", type: "uint256" },
          { name: "highestScore", type: "uint256" },
          { name: "lowestScore", type: "uint256" },
          { name: "lastUpdated", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;
const VALIDATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "getSummary",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalRequests", type: "uint256" },
          { name: "validated", type: "uint256" },
          { name: "rejected", type: "uint256" },
          { name: "pending", type: "uint256" },
          { name: "averageScore", type: "uint256" },
          { name: "lastValidated", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

// Scan 2200–3500: covers original agents (~2220) and recent judge proof children (~3225–3243).
const ERC8004_SCAN_START = 2200;
const ERC8004_SCAN_END = 3500;

interface Erc8004Data {
  agentId: bigint;
  agentType: string;
  alignmentScore: string;
  ensName: string;
  governanceContract: string;
  capabilities: string;
  agentURI: string;
  owner: Address;
}

interface TrustSummary {
  reputation: {
    totalFeedback: number;
    activeFeedback: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
  } | null;
  validation: {
    totalRequests: number;
    validated: number;
    rejected: number;
    pending: number;
    averageScore: number;
  } | null;
}

type LitPayload = {
  ciphertext: string;
  dataToEncryptHash: string;
  litEncrypted: true;
};

// Module-level cache — survives React strict mode double-mounts and re-renders.
// Key = ensLabel, value = resolved ERC-8004 data.
const erc8004Cache = new Map<string, Erc8004Data>();

function parseHexUtf8(hex?: `0x${string}` | string) {
  if (!hex || hex === "0x") return null;
  try {
    return Buffer.from(hex.slice(2), "hex").toString("utf-8");
  } catch {
    return null;
  }
}

function parseLitPayload(hex?: `0x${string}` | string): LitPayload | null {
  const decoded = parseHexUtf8(hex);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded);
    if (parsed?.litEncrypted === true && parsed?.ciphertext && parsed?.dataToEncryptHash) {
      return parsed as LitPayload;
    }
  } catch {}
  return null;
}

function parsePlaintextRationale(hex?: `0x${string}` | string): string | null {
  const decoded = parseHexUtf8(hex);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded);
    if (parsed?.litEncrypted === true && parsed?.ciphertext) {
      return null;
    }
  } catch {}
  return decoded;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AgentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { child, voteHistory, loading, error } = useChildData(id);
  const { client } = useChainContext();
  const [delegation, setDelegation] = useState<any>(null);
  const [revocation, setRevocation] = useState<any>(null);
  const [lineageReport, setLineageReport] = useState<any>(null);
  const [lineageMemoryCid, setLineageMemoryCid] = useState<string | null>(null);
  const ensLabel = child?.ensLabel;
  const [erc8004Data, setErc8004Data] = useState<Erc8004Data | null>(
    ensLabel ? erc8004Cache.get(ensLabel) ?? null : null
  );
  const [erc8004Loading, setErc8004Loading] = useState(false);
  const [trustSummary, setTrustSummary] = useState<TrustSummary | null>(null);
  const [veniceByProposal, setVeniceByProposal] = useState<Map<number, {
    reasoningProvider: string;
    reasoningModel: string;
    decision: string | null;
    txHash: string | null;
    timestamp: string | null;
  }>>(new Map());
  const isLineagePieceCid = lineageMemoryCid?.startsWith("bafkzci") ?? false;

  // Resolve ERC-8004 identity by scanning tokenURI on the shared public registry.
  // Uses module-level cache to survive strict mode double-mounts and re-renders.
  // Scan runs ONCE per ensLabel — if cached, skips entirely.
  useEffect(() => {
    if (!ensLabel) return;
    // Already cached (from a previous mount or scan) — just use it
    if (erc8004Cache.has(ensLabel)) {
      setErc8004Data(erc8004Cache.get(ensLabel)!);
      return;
    }

    const targetName = `spawn://${ensLabel}.spawn.eth`.toLowerCase();
    const baseLabel = ensLabel.replace(/-v\d+$/, "");
    const targetNameBase = `spawn://${baseLabel}.spawn.eth`.toLowerCase();
    setErc8004Loading(true);

    let cancelled = false;
    (async () => {
      try {
        for (let batchStart = ERC8004_SCAN_START; batchStart <= ERC8004_SCAN_END; batchStart += 20) {
          if (cancelled) return;
          const ids = Array.from(
            { length: Math.min(20, ERC8004_SCAN_END - batchStart + 1) },
            (_, i) => BigInt(batchStart + i)
          );
          const rawUris = await Promise.all(
            ids.map((agentId) =>
              client.readContract({
                address: ERC8004_REGISTRY,
                abi: ERC8004_ABI,
                functionName: "tokenURI",
                args: [agentId],
              }).catch(() => null)
            )
          );
          // Parse base64 JSON or plain URI to get name
          const names = rawUris.map((raw) => {
            if (!raw) return null;
            try {
              const s = raw as string;
              if (s.startsWith("data:application/json;base64,")) {
                const json = JSON.parse(atob(s.slice(29)));
                return (json.name as string) || null;
              }
              return s;
            } catch {
              return raw as string;
            }
          });
          // Stop early if we've passed the end of minted tokens
          if (rawUris.every((r) => r === null)) break;

          const matchIdx = names.findIndex(
            (n) => n && (n.toLowerCase() === targetName || n.toLowerCase() === targetNameBase)
          );
          if (matchIdx !== -1 && !cancelled) {
            const agentId = ids[matchIdx];
            const [agentType, alignmentScore, ensNameVal, governanceContract, capabilities, agentURI, owner] =
              await Promise.all([
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "agentType"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "alignmentScore"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "ensName"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "governanceContract"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "capabilities"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "tokenURI", args: [agentId] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "ownerOf", args: [agentId] }).catch(() => "0x0000000000000000000000000000000000000000" as Address),
              ]);
            if (!cancelled) {
              const data: Erc8004Data = {
                agentId,
                agentType: agentType as string,
                alignmentScore: alignmentScore as string,
                ensName: (ensNameVal as string) || `${ensLabel}.spawn.eth`,
                governanceContract: governanceContract as string,
                capabilities: capabilities as string,
                agentURI: agentURI as string,
                owner: owner as Address,
              };
              erc8004Cache.set(ensLabel, data);
              setErc8004Data(data);
            }
            return;
          }
        }
      } catch {
        // Silently fail — registry may not have this agent
      } finally {
        if (!cancelled) setErc8004Loading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ensLabel, client]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!erc8004Data?.agentId) return;
    let cancelled = false;

    Promise.all([
      client.readContract({
        address: REPUTATION_REGISTRY,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "getSummary",
        args: [erc8004Data.agentId],
      }).catch(() => null),
      client.readContract({
        address: VALIDATION_REGISTRY,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "getSummary",
        args: [erc8004Data.agentId],
      }).catch(() => null),
    ]).then(([reputation, validation]) => {
      if (cancelled) return;
      setTrustSummary({
        reputation: reputation
          ? {
              totalFeedback: Number((reputation as any).totalFeedback),
              activeFeedback: Number((reputation as any).activeFeedback),
              averageScore: Number((reputation as any).averageScore),
              highestScore: Number((reputation as any).highestScore),
              lowestScore: Number((reputation as any).lowestScore),
            }
          : null,
        validation: validation
          ? {
              totalRequests: Number((validation as any).totalRequests),
              validated: Number((validation as any).validated),
              rejected: Number((validation as any).rejected),
              pending: Number((validation as any).pending),
              averageScore: Number((validation as any).averageScore),
            }
          : null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [client, erc8004Data?.agentId]);

  // Fetch Venice reasoning metadata from agent log, keyed by proposalId.
  useEffect(() => {
    if (!ensLabel) return;
    fetch(`/api/agent/${encodeURIComponent(ensLabel)}/reasoning`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { entries: [] })
      .then(({ entries }) => {
        const map = new Map<number, any>();
        for (const e of entries ?? []) map.set(Number(e.proposalId), e);
        setVeniceByProposal(map);
      })
      .catch(() => {});
  }, [ensLabel]);

  // Fetch delegation + revocation from ENS text records, with lineage CID
  // falling back to ERC-8004 metadata when available.
  useEffect(() => {
    if (!child) return;
    const label = child.ensLabel;
    const baseLabel = label.replace(/-v\d+$/, "");
    const agentId = erc8004Data?.agentId;
    Promise.all([
      client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [label, "erc7715.delegation"] }).catch(() => ""),
      client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [label, "erc7715.delegation.revoked"] }).catch(() => ""),
      client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [label, "lineage-memory"] }).catch(() => ""),
      client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [baseLabel, "lineage-memory"] }).catch(() => ""),
      agentId != null
        ? client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "lineage-memory"] }).catch(() => "")
        : Promise.resolve(""),
    ]).then(([del, rev, lineageSelf, lineageBase, lineageMetadata]) => {
      let parsedDelegation: any = null;
      let parsedRevocation: any = null;

      if (del) {
        try {
          parsedDelegation = JSON.parse(del as string);
        } catch {
          parsedDelegation = { raw: del };
        }
      }

      if (rev) {
        try {
          parsedRevocation = JSON.parse(rev as string);
        } catch {
          parsedRevocation = { raw: rev };
        }
      }

      setDelegation(parsedDelegation);

      const delegationHash =
        parsedDelegation && typeof parsedDelegation === "object" ? parsedDelegation.hash : null;
      const revocationHash =
        parsedRevocation && typeof parsedRevocation === "object" ? parsedRevocation.hash : null;

      if (
        parsedRevocation &&
        (!delegationHash || !revocationHash || revocationHash === delegationHash)
      ) {
        setRevocation(parsedRevocation);
      } else {
        setRevocation(null);
      }

      const cid = (lineageSelf || lineageBase || lineageMetadata) as string;
      if (cid) {
        setLineageMemoryCid(cid);
        setLineageReport(null);
        (async () => {
          try {
            const res = await fetch(`/api/storage?cid=${encodeURIComponent(cid)}`, {
              cache: "no-store",
            });
            if (!res.ok) return;
            const payload = await res.json();
            if (payload?.data) {
              setLineageReport(payload.data);
            }
          } catch {}
        })();
      }
    }).catch(() => {});
  }, [child, client, erc8004Data]);

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-1/3" />
          <div className="h-4 bg-gray-800 rounded w-1/2" />
          <div className="h-32 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (error || !child) {
    return (
      <div className="p-4 md:p-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 font-mono mb-6 inline-block">
          ← Back to Swarm
        </Link>
        <div className="border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 font-mono">
            {error || "Agent not found"}
          </p>
        </div>
      </div>
    );
  }

  const ensDisplay = ensName(child.ensLabel) ?? formatAddress(child.childAddr);
  const daoDisplay = governorName(child.governance);

  return (
    <div className="p-4 md:p-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 font-mono mb-6 inline-block">
        ← Back to Swarm
      </Link>

      {/* Agent header */}
      <div className="border border-gray-800 rounded-lg p-4 md:p-6 bg-[#0d0d14] mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${child.active ? "bg-green-400 animate-ping" : "bg-gray-600"}`} style={{ animationDuration: "2s" }} />
              <span className="text-xs text-gray-500 uppercase tracking-wider font-mono">
                Agent #{id} — {child.active ? "Active" : "Terminated"}
              </span>
            </div>
            <h1 className="text-lg md:text-xl font-mono font-bold text-green-400 mb-1 flex items-center gap-2 flex-wrap">
              {ensDisplay}
              {delegation && !revocation && (
                <span className="text-[10px] border border-orange-400/30 bg-orange-400/10 text-orange-400 rounded px-1.5 py-0.5 font-mono uppercase">
                  ERC-7715
                </span>
              )}
              {revocation && (
                <span className="text-[10px] border border-red-400/30 bg-red-400/10 text-red-400 rounded px-1.5 py-0.5 font-mono uppercase">
                  7715 REVOKED
                </span>
              )}
              {(() => {
                const gen = child.ensLabel.match(/-v(\d+)$/)?.[1];
                return gen && Number(gen) > 1 ? (
                  <span className="text-[10px] border border-cyan-400/30 bg-cyan-400/10 text-cyan-400 rounded px-1.5 py-0.5 font-mono uppercase">
                    Gen {gen}
                  </span>
                ) : null;
              })()}
            </h1>
            <a
              href={explorerAddress(child.childAddr)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-gray-500 hover:text-gray-300 break-all"
            >
              {child.childAddr} ↗
            </a>
          </div>
          <AlignmentBadge score={child.alignmentScore} size="lg" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">DAO</p>
            <a
              href={explorerAddress(child.governance)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-400 hover:text-blue-300 text-xs"
            >
              {daoDisplay ?? formatAddress(child.governance)} ↗
            </a>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Votes Cast</p>
            <p className="font-mono text-white">{child.voteCount.toString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Last Vote</p>
            <p className="font-mono text-xs text-gray-400">
              {child.lastVoteTimestamp > BigInt(0)
                ? formatTimestamp(child.lastVoteTimestamp)
                : "Never"}
            </p>
          </div>
        </div>
      </div>

      {/* ERC-8004 Onchain Identity */}
      {(erc8004Loading || erc8004Data) && (
        <div className="border border-indigo-400/30 bg-indigo-400/5 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-xs font-mono text-indigo-400 uppercase tracking-widest">ERC-8004 Onchain Identity</h2>
            <a
              href={`https://sepolia.basescan.org/address/${ERC8004_REGISTRY}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] font-mono text-indigo-300 border border-indigo-400/30 bg-indigo-400/10 rounded px-2 py-1 hover:bg-indigo-400/20 transition-all"
              title="View ERC-8004 registry contract on BaseScan"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
              Verified onchain via ERC-8004 registry {formatAddress(ERC8004_REGISTRY)} ↗
            </a>
          </div>

          {erc8004Loading && !erc8004Data && (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-gray-800 rounded w-1/3" />
              <div className="h-3 bg-gray-800 rounded w-1/2" />
            </div>
          )}

          {erc8004Data && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs mb-4">
                <div>
                  <p className="text-gray-600 uppercase tracking-wider mb-1">Agent ID</p>
                  <p className="font-mono text-indigo-300 font-bold">#{erc8004Data.agentId.toString()}</p>
                </div>
                <div>
                  <p className="text-gray-600 uppercase tracking-wider mb-1">Agent Type</p>
                  <p className="font-mono text-white capitalize">{erc8004Data.agentType || "child"}</p>
                </div>
                {erc8004Data.alignmentScore && (
                  <div>
                    <p className="text-gray-600 uppercase tracking-wider mb-1">Alignment Score</p>
                    <p className={`font-mono font-bold ${Number(erc8004Data.alignmentScore) >= 70 ? "text-green-400" : Number(erc8004Data.alignmentScore) >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                      {erc8004Data.alignmentScore}/100
                    </p>
                  </div>
                )}
                {erc8004Data.ensName && (
                  <div>
                    <p className="text-gray-600 uppercase tracking-wider mb-1">ENS Name</p>
                    <p className="font-mono text-green-400">{erc8004Data.ensName}</p>
                  </div>
                )}
                {erc8004Data.governanceContract && (
                  <div>
                    <p className="text-gray-600 uppercase tracking-wider mb-1">Governance Contract</p>
                    <a
                      href={explorerAddress(erc8004Data.governanceContract)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-400 hover:text-blue-300 break-all"
                    >
                      {formatAddress(erc8004Data.governanceContract)} ↗
                    </a>
                  </div>
                )}
                {erc8004Data.owner && (
                  <div>
                    <p className="text-gray-600 uppercase tracking-wider mb-1">Owner (wallet)</p>
                    <a
                      href={explorerAddress(erc8004Data.owner)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-gray-400 hover:text-gray-300 break-all"
                    >
                      {formatAddress(erc8004Data.owner)} ↗
                    </a>
                  </div>
                )}
              </div>

              {erc8004Data.capabilities && (() => {
                let caps: string[] = [];
                try { caps = JSON.parse(erc8004Data.capabilities); } catch { caps = [erc8004Data.capabilities]; }
                return caps.length > 0 ? (
                  <div className="mb-4">
                    <p className="text-gray-600 uppercase tracking-wider text-xs mb-2">Capabilities</p>
                    <div className="flex flex-wrap gap-1.5">
                      {caps.map((cap, i) => (
                        <span key={i} className="text-[10px] font-mono border border-indigo-400/20 bg-indigo-400/5 text-indigo-300 rounded px-1.5 py-0.5">
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {erc8004Data.agentURI && (
                <div>
                  <p className="text-gray-600 uppercase tracking-wider text-xs mb-1">Agent URI</p>
                  <p className="font-mono text-[10px] text-indigo-300/70 break-all bg-indigo-900/10 border border-indigo-400/10 rounded p-2">
                    {erc8004Data.agentURI}
                  </p>
                </div>
              )}

              {trustSummary && (() => {
                const hasReputation = trustSummary.reputation && trustSummary.reputation.totalFeedback > 0;
                const hasValidation = trustSummary.validation && trustSummary.validation.totalRequests > 0;
                if (!hasReputation && !hasValidation) {
                  return (
                    <p className="mt-3 text-[10px] font-mono text-gray-600">
                      No onchain reputation or validation receipts yet — written during judge flow runs.
                    </p>
                  );
                }
                return (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {hasReputation && (
                      <div className="rounded border border-emerald-400/20 bg-emerald-400/5 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-2">Reputation Summary</p>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="text-gray-300">Avg score: <span className="text-emerald-300 font-bold">{trustSummary.reputation!.averageScore}</span></div>
                          <div className="text-gray-300">Active: <span className="text-emerald-300">{trustSummary.reputation!.activeFeedback}</span></div>
                          <div className="text-gray-300">Total: <span className="text-emerald-300">{trustSummary.reputation!.totalFeedback}</span></div>
                          <div className="text-gray-300">Range: <span className="text-emerald-300">{trustSummary.reputation!.lowestScore}–{trustSummary.reputation!.highestScore}</span></div>
                        </div>
                      </div>
                    )}
                    {hasValidation && (
                      <div className="rounded border border-cyan-400/20 bg-cyan-400/5 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-cyan-400/70 mb-2">Validation Summary</p>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="text-gray-300">Avg score: <span className="text-cyan-300 font-bold">{trustSummary.validation!.averageScore}</span></div>
                          <div className="text-gray-300">Total: <span className="text-cyan-300">{trustSummary.validation!.totalRequests}</span></div>
                          <div className="text-gray-300">Validated: <span className="text-cyan-300">{trustSummary.validation!.validated}</span></div>
                          <div className="text-gray-300">Rejected: <span className="text-cyan-300">{trustSummary.validation!.rejected}</span></div>
                          {trustSummary.validation!.pending > 0 && (
                            <div className="text-gray-300 col-span-2">Pending: <span className="text-cyan-300">{trustSummary.validation!.pending}</span></div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}


      {/* Lineage Memory */}
      {(() => {
        const generation = child.ensLabel.match(/-v(\d+)$/)?.[1];
        return lineageMemoryCid && generation ? (
          <div className="border border-cyan-400/30 bg-cyan-400/5 rounded-lg p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-mono text-cyan-400 uppercase tracking-widest">Lineage Memory</h2>
              <a
                href={storageViewerPath(lineageMemoryCid)}
                className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${
                  isLineagePieceCid
                    ? "text-blue-300 hover:text-blue-200 border-blue-400/30"
                    : "text-purple-400 hover:text-purple-300 border-purple-400/30"
                }`}
              >
                {isLineagePieceCid ? "FIL" : "IPFS"} {lineageMemoryCid.slice(0, 12)}... ↗
              </a>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Generation {generation} — inherits knowledge from {Number(generation) - 1} terminated predecessors
            </p>

            {lineageReport && (
              <div className="space-y-2">
                {/* Termination cause — deduplicate reason/summary if they're the same text */}
                {(() => {
                  const cause = lineageReport.summary || lineageReport.reason;
                  if (!cause) return null;
                  return (
                    <div className="p-2 bg-red-400/5 border border-red-400/20 rounded">
                      <p className="text-[10px] text-red-400/70 uppercase tracking-wider mb-1">Cause of Termination</p>
                      <p className="text-xs text-gray-300">{cause}</p>
                    </div>
                  );
                })()}

                {/* Lessons + Patterns side by side */}
                <div className="grid gap-2 md:grid-cols-2">
                  {lineageReport.lessons && lineageReport.lessons.length > 0 && (
                    <div className="p-2 bg-yellow-400/5 border border-yellow-400/20 rounded">
                      <p className="text-[10px] text-yellow-400/70 uppercase tracking-wider mb-1">Lessons Inherited</p>
                      <ul className="text-xs text-gray-300 space-y-1">
                        {lineageReport.lessons.map((l: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-yellow-400/60 shrink-0">→</span>
                            <span>{l}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {lineageReport.avoidPatterns && lineageReport.avoidPatterns.length > 0 && (
                    <div className="p-2 bg-red-400/5 border border-red-400/20 rounded">
                      <p className="text-[10px] text-red-400/70 uppercase tracking-wider mb-1">Patterns to Avoid</p>
                      <ul className="text-xs text-gray-300 space-y-1">
                        {lineageReport.avoidPatterns.map((p: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-red-400/60 shrink-0">✕</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {lineageReport.recommendedFocus && (
                  <div className="p-2 bg-green-400/5 border border-green-400/20 rounded">
                    <p className="text-[10px] text-green-400/70 uppercase tracking-wider mb-1">Recommended Focus</p>
                    <p className="text-xs text-gray-300">{lineageReport.recommendedFocus}</p>
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs pt-1">
                  {lineageReport.score !== undefined && (
                    <span className="text-gray-600">
                      Predecessor score: <span className={`font-mono font-bold ${lineageReport.score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{lineageReport.score}/100</span>
                    </span>
                  )}
                  {lineageReport.generation && (
                    <span className="text-gray-600 font-mono">Gen {lineageReport.generation} → Gen {Number(lineageReport.generation) + 1}</span>
                  )}
                </div>
              </div>
            )}

            {!lineageReport && (
              <p className="text-[10px] text-gray-600 font-mono">
                {isLineagePieceCid
                  ? "Loading lineage memory from Filecoin..."
                  : "Loading memory from IPFS..."}
              </p>
            )}
          </div>
        ) : null;
      })()}

      {/* Delegation Details */}
      {(delegation || revocation) && (
        <div className="border border-gray-800 rounded-lg p-5 bg-[#0d0d14] mb-6">
          <h2 className="text-xs font-mono text-orange-400 uppercase tracking-widest mb-3">
            MetaMask ERC-7715 Delegation
          </h2>
          {delegation && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
              <div>
                <p className="text-gray-600 uppercase tracking-wider mb-0.5">Scope</p>
                <p className="font-mono text-orange-300">castVote() only</p>
              </div>
              <div>
                <p className="text-gray-600 uppercase tracking-wider mb-0.5">Caveats</p>
                <p className="font-mono text-gray-300">{(delegation.caveats || []).join(", ") || "AllowedTargets, AllowedMethods, LimitedCalls"}</p>
              </div>
              <div>
                <p className="text-gray-600 uppercase tracking-wider mb-0.5">Max Votes</p>
                <p className="font-mono text-gray-300">{delegation.maxVotes || "100"}</p>
              </div>
              <div>
                <p className="text-gray-600 uppercase tracking-wider mb-0.5">Hash</p>
                <p className="font-mono text-gray-500 truncate" title={delegation.hash}>{(delegation.hash || "").slice(0, 18)}...</p>
              </div>
            </div>
          )}
          {revocation && (
            <div className="border-t border-red-500/20 pt-3 mt-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] border border-red-400/30 bg-red-400/10 text-red-400 rounded px-1.5 py-0.5 font-mono uppercase">Delegation Revoked</span>
                <span className="text-[10px] text-gray-600 font-mono">{revocation.revokedAt ? new Date(revocation.revokedAt).toLocaleString() : ""}</span>
              </div>
              <p className="text-xs text-red-400/70 font-mono">Reason: {revocation.reason || "alignment_drift"}</p>
            </div>
          )}
        </div>
      )}

      {/* Vote history */}
      <div>
        <h2 className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-4">
          Voting History ({voteHistory.length})
        </h2>

        {voteHistory.length === 0 ? (
          <div className="border border-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-600 font-mono">No votes recorded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...voteHistory].reverse().map((vote, i) => {
              const supportNum = Number(vote.support);
              const litCiphertext =
                parseLitPayload(vote.encryptedRationale) ||
                parseLitPayload(vote.decryptedRationale);
              const rationale =
                vote.revealed && vote.decryptedRationale && vote.decryptedRationale !== "0x"
                  ? parsePlaintextRationale(vote.decryptedRationale)
                  : null;

              return (
                <div
                  key={i}
                  className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-600">
                        Proposal #{vote.proposalId.toString()}
                      </span>
                      <span className={`font-mono text-sm font-bold ${supportColor(supportNum)}`}>
                        {supportLabel(supportNum)}
                      </span>
                      {vote.revealed && (
                        <span className="text-xs text-cyan-400 border border-cyan-400/30 px-1.5 py-0.5 rounded font-mono">
                          REVEALED
                        </span>
                      )}
                      {!vote.revealed && (
                        <span className="text-xs text-gray-600 border border-gray-700 px-1.5 py-0.5 rounded font-mono">
                          ENCRYPTED
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-gray-600 shrink-0">
                      {formatTimestamp(vote.timestamp)}
                    </span>
                  </div>

                  {/* Venice decision + rationale (compact) */}
                  {/* Venice Reasoning Chain */}
                  {(() => {
                    const venice = veniceByProposal.get(Number(vote.proposalId));
                    const isE2EE = !venice || venice.reasoningModel?.includes("e2ee") || venice.reasoningProvider === "venice";
                    const decision = venice?.decision ?? supportLabel(supportNum);
                    return (
                      <div className="mt-2 p-3 bg-[#08080f] rounded border border-violet-500/20">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <p className="text-xs text-violet-400 uppercase tracking-wider font-mono">Venice Reasoning Chain</p>
                          {isE2EE && <span className="text-[10px] font-mono text-violet-300 border border-violet-400/30 bg-violet-400/5 px-1.5 py-0.5 rounded">E2EE</span>}
                          <span className="text-[10px] font-mono text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded">
                            {venice?.reasoningModel ?? "e2ee-qwen3-30b-a3b-p"}
                          </span>
                          <span className="text-[10px] font-mono text-gray-600">zero data retention</span>
                          {venice?.txHash && (
                            <a href={explorerTx(venice.txHash)} target="_blank" rel="noopener noreferrer"
                              className="ml-auto text-[10px] font-mono text-violet-400/50 hover:text-violet-300">
                              {venice.txHash.slice(0, 14)}… ↗
                            </a>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-start gap-3">
                            <span className="text-[10px] font-mono text-violet-400/50 shrink-0 mt-0.5 w-14">Step 1</span>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Summarize Proposal</p>
                              <p className="text-xs text-gray-400">Proposal #{vote.proposalId.toString()} — context extracted and structured for evaluation</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="text-[10px] font-mono text-violet-400/50 shrink-0 mt-0.5 w-14">Step 2</span>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Risk Assessment</p>
                              <p className="text-xs text-gray-400">Treasury, centralization, and alignment risk evaluated against owner values</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="text-[10px] font-mono text-violet-400/50 shrink-0 mt-0.5 w-14">Step 3</span>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Decision</p>
                              <p className={`text-sm font-bold font-mono ${
                                decision === "FOR" ? "text-green-400" :
                                decision === "AGAINST" ? "text-red-400" :
                                "text-yellow-400"
                              }`}>{decision}</p>
                              {vote.revealed && rationale && (
                                <p className="text-xs text-gray-300 mt-1 leading-relaxed">{rationale}</p>
                              )}
                              {!vote.revealed && (
                                <p className="text-[11px] text-gray-600 mt-1 italic">Rationale Lit-encrypted until voting period ends</p>
                              )}
                              {rationale && (
                                <p className="mt-2 font-mono text-[10px] text-green-400/40 break-all border-t border-gray-900 pt-1.5">
                                  keccak256 {keccak256(toBytes(rationale))}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Lit Protocol proof — collapsed by default */}
                  {litCiphertext && (
                    <details className="mt-1 group">
                      <summary className="flex items-center gap-2 px-3 py-1.5 rounded border border-purple-500/15 bg-[#0a0a0f] cursor-pointer list-none text-[10px] text-purple-400/60 hover:text-purple-300 font-mono select-none">
                        <span className="group-open:hidden">▶</span>
                        <span className="hidden group-open:inline">▼</span>
                        Lit Protocol E2EE proof
                        <span className="ml-auto text-gray-700">{litCiphertext.dataToEncryptHash.slice(0, 14)}…</span>
                      </summary>
                      <div className="px-3 pt-2 pb-3 border border-t-0 border-purple-500/15 rounded-b bg-[#0a0a0f] space-y-2">
                        <div>
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Ciphertext (truncated)</p>
                          <p className="font-mono text-[10px] text-purple-300/40 break-all">{litCiphertext.ciphertext.slice(0, 80)}…</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">dataToEncryptHash</p>
                          <p className="font-mono text-[10px] text-purple-400/50 break-all">{litCiphertext.dataToEncryptHash}</p>
                          <p className="text-[10px] text-gray-700 mt-0.5">Pre-vote hash committed onchain — proves reasoning preceded vote</p>
                        </div>
                      </div>
                    </details>
                  )}

                  {/* Fallback rationale when no Venice log entry */}
                  {rationale && !veniceByProposal.has(Number(vote.proposalId)) && (
                    <div className="mt-2 p-3 bg-[#0a0a0f] rounded border border-gray-800">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Rationale</p>
                      <p className="text-sm text-gray-300">{rationale}</p>
                      <p className="mt-2 font-mono text-[10px] text-green-400/40 break-all border-t border-gray-900 pt-1.5">
                        keccak256 {keccak256(toBytes(rationale))}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
