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
} from "@/lib/contracts";

const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D";
const ENS_REGISTRY_ABI = [
  { type: "function", name: "getTextRecord", inputs: [{ name: "label", type: "string" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;

// ERC-8004 Agent Registry on Base Sepolia
const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;
const ERC8004_ABI = [
  { type: "function", name: "ownerOf", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "getMetadata", inputs: [{ name: "agentId", type: "uint256" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "agentURI", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;

// Maximum number of agent IDs to scan when resolving owner → agentId
const ERC8004_SCAN_LIMIT = 30;

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
  const [erc8004Data, setErc8004Data] = useState<Erc8004Data | null>(null);
  const [erc8004Loading, setErc8004Loading] = useState(false);

  // Resolve ERC-8004 identity by scanning agentIds until ownerOf matches child address
  useEffect(() => {
    if (!child) return;
    const childAddr = child.childAddr.toLowerCase();
    setErc8004Loading(true);

    (async () => {
      try {
        // Scan IDs 1..ERC8004_SCAN_LIMIT in parallel batches of 10
        for (let batchStart = 1; batchStart <= ERC8004_SCAN_LIMIT; batchStart += 10) {
          const ids = Array.from(
            { length: Math.min(10, ERC8004_SCAN_LIMIT - batchStart + 1) },
            (_, i) => BigInt(batchStart + i)
          );
          const owners = await Promise.all(
            ids.map((agentId) =>
              client.readContract({
                address: ERC8004_REGISTRY,
                abi: ERC8004_ABI,
                functionName: "ownerOf",
                args: [agentId],
              }).catch(() => null)
            )
          );
          const matchIdx = owners.findIndex(
            (o) => o && (o as string).toLowerCase() === childAddr
          );
          if (matchIdx !== -1) {
            const agentId = ids[matchIdx];
            // Fetch all metadata fields in parallel
            const [agentType, alignmentScore, ensNameVal, governanceContract, capabilities, agentURI, owner] =
              await Promise.all([
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "agentType"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "alignmentScore"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "ensName"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "governanceContract"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getMetadata", args: [agentId, "capabilities"] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "agentURI", args: [agentId] }).catch(() => ""),
                client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "ownerOf", args: [agentId] }).catch(() => child.childAddr as Address),
              ]);
            setErc8004Data({
              agentId,
              agentType: agentType as string,
              alignmentScore: alignmentScore as string,
              ensName: ensNameVal as string,
              governanceContract: governanceContract as string,
              capabilities: capabilities as string,
              agentURI: agentURI as string,
              owner: owner as Address,
            });
            return;
          }
        }
      } catch {
        // Silently fail — registry may not have this agent
      } finally {
        setErc8004Loading(false);
      }
    })();
  }, [child, client]);

  // Fetch delegation + revocation from ENS text records
  useEffect(() => {
    if (!child) return;
    const label = child.ensLabel;
    // Fetch delegation, revocation, and lineage memory all in parallel
    const baseLabel = label.replace(/-v\d+$/, "");
    Promise.all([
      client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [label, "erc7715.delegation"] }).catch(() => ""),
      client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [label, "erc7715.delegation.revoked"] }).catch(() => ""),
      client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [label, "lineage-memory"] }).catch(() => ""),
      client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [baseLabel, "lineage-memory"] }).catch(() => ""),
    ]).then(([del, rev, lineageSelf, lineageBase]) => {
      if (del) try { setDelegation(JSON.parse(del as string)); } catch { setDelegation({ raw: del }); }
      if (rev) try { setRevocation(JSON.parse(rev as string)); } catch { setRevocation({ raw: rev }); }
      const cid = (lineageSelf || lineageBase) as string;
      if (cid) {
        setLineageMemoryCid(cid);
        // Try multiple IPFS gateways
        const gateways = [
          `https://ipfs.filebase.io/ipfs/${cid}`,
          `https://ipfs.io/ipfs/${cid}`,
          `https://cloudflare-ipfs.com/ipfs/${cid}`,
          `https://dweb.link/ipfs/${cid}`,
        ];
        (async () => {
          for (const url of gateways) {
            try {
              const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
              if (res.ok) {
                const data = await res.json();
                if (data) { setLineageReport(data); return; }
              }
            } catch {}
          }
        })();
      }
    }).catch(() => {});
  }, [child, client]);

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
              {ensName(child.ensLabel) && (
                <span className="text-[10px] border border-green-500/30 bg-green-500/10 text-green-400 rounded px-1.5 py-0.5 font-mono uppercase">
                  ENS
                </span>
              )}
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
            </>
          )}
        </div>
      )}

      {/* ERC-8004 not found notice — only show after loading completes and child is active */}
      {!erc8004Loading && !erc8004Data && child.active && (
        <div className="border border-gray-800 rounded-lg p-4 mb-6 flex items-center gap-3">
          <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">ERC-8004</span>
          <span className="text-xs text-gray-600 font-mono">Identity not yet registered in registry {formatAddress(ERC8004_REGISTRY)}</span>
        </div>
      )}

      {/* Lineage Memory */}
      {(() => {
        const generation = child.ensLabel.match(/-v(\d+)$/)?.[1];
        return lineageMemoryCid && generation ? (
          <div className="border border-cyan-400/30 bg-cyan-400/5 rounded-lg p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-mono text-cyan-400 uppercase tracking-widest">Lineage Memory</h2>
              <a href={`https://ipfs.filebase.io/ipfs/${lineageMemoryCid}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-purple-400 hover:text-purple-300 border border-purple-400/30 rounded px-1.5 py-0.5">
                IPFS {lineageMemoryCid.slice(0, 12)}... ↗
              </a>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Generation {generation} — inherits knowledge from {Number(generation) - 1} terminated predecessors
            </p>

            {lineageReport && (
              <div className="space-y-2">
                {/* Termination reason */}
                {lineageReport.reason && (
                  <div className="p-2 bg-red-400/5 border border-red-400/20 rounded">
                    <p className="text-[10px] text-red-400/70 uppercase tracking-wider mb-1">Predecessor Terminated</p>
                    <p className="text-xs text-gray-300">{lineageReport.reason}</p>
                  </div>
                )}
                {lineageReport.summary && (
                  <div className="p-2 bg-red-400/5 border border-red-400/20 rounded">
                    <p className="text-[10px] text-red-400/70 uppercase tracking-wider mb-1">Cause of Death</p>
                    <p className="text-xs text-gray-300">{lineageReport.summary}</p>
                  </div>
                )}
                {/* Lessons */}
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
                {/* Avoid Patterns */}
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
                {/* Recommended Focus */}
                {lineageReport.recommendedFocus && (
                  <div className="p-2 bg-green-400/5 border border-green-400/20 rounded">
                    <p className="text-[10px] text-green-400/70 uppercase tracking-wider mb-1">Recommended Focus for This Generation</p>
                    <p className="text-xs text-gray-300">{lineageReport.recommendedFocus}</p>
                  </div>
                )}
                {/* Score + Owner Values */}
                <div className="flex items-center gap-4 text-xs">
                  {lineageReport.score !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-600">Predecessor score:</span>
                      <span className={`font-mono font-bold ${lineageReport.score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{lineageReport.score}/100</span>
                    </div>
                  )}
                  {lineageReport.generation && (
                    <span className="text-gray-600">Gen {lineageReport.generation} → Gen {Number(lineageReport.generation) + 1}</span>
                  )}
                </div>
              </div>
            )}

            {!lineageReport && (
              <p className="text-[10px] text-gray-600 font-mono">Loading memory from IPFS...</p>
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
              let rationale: string | null = null;
              let litCiphertext: { ciphertext: string; dataToEncryptHash: string } | null = null;
              if (vote.revealed && vote.decryptedRationale && vote.decryptedRationale !== "0x") {
                try {
                  const decoded = new TextDecoder().decode(
                    Buffer.from(vote.decryptedRationale.slice(2), "hex")
                  );
                  // Check if the revealed bytes are actually a Lit ciphertext JSON
                  // (happens when Lit decryption at reveal time fails — ciphertext stored as-is)
                  const parsed = JSON.parse(decoded);
                  if (parsed?.litEncrypted === true && parsed?.ciphertext) {
                    litCiphertext = { ciphertext: parsed.ciphertext, dataToEncryptHash: parsed.dataToEncryptHash };
                  } else {
                    rationale = decoded;
                  }
                } catch {
                  rationale = vote.decryptedRationale;
                }
              }

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

                  {rationale && (
                    <div className="mt-2 p-3 bg-[#0a0a0f] rounded border border-gray-800">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Rationale</p>
                      <p className="text-sm text-gray-300">{rationale}</p>
                      <div className="mt-2 pt-2 border-t border-gray-800">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Reasoning Verification (keccak256)</p>
                        <p className="font-mono text-[10px] text-green-400/60 break-all">
                          {keccak256(toBytes(rationale))}
                        </p>
                        <p className="text-[10px] text-gray-700 mt-0.5">
                          Compare with reasoning hash committed before vote to verify E2EE integrity
                        </p>
                      </div>
                    </div>
                  )}

                  {litCiphertext && (
                    <div className="mt-2 p-3 bg-[#0a0a0f] rounded border border-purple-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs text-purple-400 uppercase tracking-wider">Lit Protocol — Time-locked Rationale</p>
                        <span className="text-[10px] font-mono text-purple-400/60 border border-purple-400/20 px-1.5 py-0.5 rounded">E2EE</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mb-2">
                        Reasoning was encrypted before the vote using Lit Protocol with a TimeLock access condition.
                        The ciphertext is stored onchain — decryptable via Lit SDK once the voting period ends.
                      </p>
                      <div className="font-mono text-[10px] text-purple-300/50 break-all bg-purple-900/10 p-2 rounded border border-purple-500/10">
                        {litCiphertext.ciphertext.slice(0, 80)}…
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-800">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Ciphertext Hash (dataToEncryptHash)</p>
                        <p className="font-mono text-[10px] text-purple-400/60 break-all">
                          {litCiphertext.dataToEncryptHash}
                        </p>
                        <p className="text-[10px] text-gray-700 mt-1">
                          Pre-vote reasoning hash committed onchain — proves private reasoning before public vote
                        </p>
                      </div>
                    </div>
                  )}

                  {!vote.revealed && vote.encryptedRationale && vote.encryptedRationale !== "0x" && (
                    <div className="mt-2 p-3 bg-[#0a0a0f] rounded border border-gray-800">
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Encrypted Rationale (Lit Protocol)</p>
                      <p className="font-mono text-xs text-gray-700 break-all">
                        {vote.encryptedRationale.slice(0, 64)}…
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
