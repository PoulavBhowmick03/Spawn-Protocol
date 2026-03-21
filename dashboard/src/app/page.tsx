"use client";

import { useState, useEffect } from "react";
import { useSwarmData } from "@/hooks/useSwarmData";
import { AgentCard } from "@/components/AgentCard";
import { CONTRACTS, CELO_CONTRACTS, explorerAddress, formatAddress } from "@/lib/contracts";
import { useChainContext } from "@/context/ChainContext";

// ENS Registry for reading IPFS CID and delegation hashes
const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D";
const ENS_REGISTRY_ABI = [
  { type: "function", name: "getTextRecord", inputs: [{ name: "label", type: "string" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;

export default function SwarmPage() {
  const { children, loading, error, justVotedSet } = useSwarmData();
  const { client, chainId, explorerBase } = useChainContext();
  const [ipfsCid, setIpfsCid] = useState<string | null>(null);
  const [delegationHashes, setDelegationHashes] = useState<Map<string, string>>(new Map());

  // Fetch IPFS CID from ENS text record
  useEffect(() => {
    if (chainId !== "base") return;
    client.readContract({
      address: ENS_REGISTRY,
      abi: ENS_REGISTRY_ABI,
      functionName: "getTextRecord",
      args: ["parent", "ipfs.agent_log"],
    }).then((cid) => { if (cid) setIpfsCid(cid as string); }).catch(() => {});
  }, [client, chainId]);

  // Fetch delegation hashes + revocation status for all children
  useEffect(() => {
    if (chainId !== "base") return;
    const fetchDelegations = async () => {
      const map = new Map<string, string>();
      for (const child of children) {
        try {
          // Check for active delegation
          const hash = await client.readContract({
            address: ENS_REGISTRY,
            abi: ENS_REGISTRY_ABI,
            functionName: "getTextRecord",
            args: [child.ensLabel, "erc7715.delegation"],
          });
          if (hash) map.set(child.ensLabel, hash as string);
        } catch {}
        try {
          // Check for revoked delegation
          const revoked = await client.readContract({
            address: ENS_REGISTRY,
            abi: ENS_REGISTRY_ABI,
            functionName: "getTextRecord",
            args: [child.ensLabel, "erc7715.delegation.revoked"],
          });
          if (revoked) map.set(`${child.ensLabel}:revoked`, revoked as string);
        } catch {}
      }
      if (map.size > 0) setDelegationHashes(map);
    };
    if (children.length > 0) fetchDelegations();
  }, [children, client, chainId]);
  const activeContracts = chainId === "celo" ? CELO_CONTRACTS : CONTRACTS;
  const chainLabel = chainId === "base" ? "Base Sepolia" : "Celo Sepolia";

  const activeCount = children.filter((c) => c.active).length;
  const totalCount = children.length;
  const totalVotes = children.reduce((sum, c) => sum + Number(c.voteCount), 0);
  const avgAlignment = activeCount > 0
    ? Math.round(children.filter((c) => c.active).reduce((sum, c) => sum + Number(c.alignmentScore), 0) / activeCount)
    : 0;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-4">
          <div>
            <h1 className="text-2xl font-mono font-bold text-green-400 tracking-tight">
              Agent Swarm
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Autonomous DAO governance agents — {chainLabel}
            </p>
          </div>
          <div className="flex gap-4 sm:gap-6 text-center">
            <div>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-green-400">
                {loading ? "…" : activeCount}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Active</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-blue-400">
                {loading ? "…" : totalVotes}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Votes</div>
            </div>
            <div>
              <div className={`text-2xl sm:text-3xl font-mono font-bold ${avgAlignment >= 70 ? "text-green-400" : avgAlignment >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                {loading ? "…" : `${avgAlignment}%`}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Alignment</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-gray-400">
                {loading ? "…" : totalCount}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Total</div>
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-xs font-mono text-gray-600 mt-4 flex-wrap">
          <span>
            SpawnFactory:{" "}
            <a href={`${explorerBase}/address/${activeContracts.SpawnFactory.address}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
              {formatAddress(activeContracts.SpawnFactory.address)}
            </a>
          </span>
          {chainId === "base" && (
            <span>
              MockGovernor:{" "}
              <a href={explorerAddress(CONTRACTS.MockGovernor.address)} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
                {formatAddress(CONTRACTS.MockGovernor.address)}
              </a>
            </span>
          )}
          <span>
            ParentTreasury:{" "}
            <a href={`${explorerBase}/address/${activeContracts.ParentTreasury.address}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
              {formatAddress(activeContracts.ParentTreasury.address)}
            </a>
          </span>
        </div>
      </div>

      {/* IPFS + Delegation Status Bar — always visible on Base */}
      {chainId === "base" && !loading && (
        <div className="flex flex-wrap gap-3 mb-6">
          {ipfsCid && (
            <a
              href={`https://gateway.pinata.cloud/ipfs/${ipfsCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-purple-400/30 bg-purple-400/5 rounded-lg px-4 py-2 hover:bg-purple-400/10 transition-all"
            >
              <span className="text-purple-400 text-sm">IPFS</span>
              <span className="text-xs font-mono text-purple-300">Agent Log Pinned</span>
              <span className="text-[10px] font-mono text-purple-400/60">{ipfsCid.slice(0, 12)}...</span>
              <span className="text-purple-400 text-xs">↗</span>
            </a>
          )}
          {(() => {
            const activeDels = Array.from(delegationHashes.keys()).filter(k => !k.includes(":revoked")).length;
            const revokedDels = Array.from(delegationHashes.keys()).filter(k => k.includes(":revoked")).length;
            return (
              <div className="flex items-center gap-2 border border-orange-400/30 bg-orange-400/5 rounded-lg px-4 py-2">
                <span className="text-orange-400 text-sm">ERC-7715</span>
                <span className="text-xs font-mono text-orange-300">
                  {activeDels > 0 ? `${activeDels} Active` : "Intent-Based Delegations"}
                </span>
                {revokedDels > 0 && (
                  <span className="text-[10px] font-mono text-red-400/80 border border-red-400/20 bg-red-400/5 px-1.5 py-0.5 rounded">{revokedDels} Revoked</span>
                )}
                <span className="text-[10px] font-mono text-orange-400/60">castVote() scoped</span>
              </div>
            );
          })()}
        </div>
      )}

      {error && (
        <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm font-mono">Error: {error}</p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border border-gray-800 rounded-lg p-4 bg-[#0d0d14] animate-pulse">
              <div className="h-4 bg-gray-800 rounded mb-3 w-2/3" />
              <div className="h-3 bg-gray-800 rounded mb-2 w-full" />
              <div className="h-3 bg-gray-800 rounded mb-4 w-1/2" />
              <div className="h-2 bg-gray-800 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && children.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">⬡</div>
          <h2 className="font-mono text-lg text-gray-400 mb-2">No agents spawned yet</h2>
          <p className="text-sm text-gray-600">The parent agent will spawn children when proposals are detected.</p>
          <p className="text-xs font-mono text-gray-700 mt-4">Polling SpawnFactory @ {formatAddress(activeContracts.SpawnFactory.address)}</p>
        </div>
      )}

      {!loading && children.length > 0 && (
        <>
          {children.filter((c) => c.active).length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-3">
                Active Agents ({children.filter((c) => c.active).length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {children.filter((c) => c.active).map((child) => (
                  <AgentCard key={child.childAddr} child={child} justVoted={justVotedSet.has(child.childAddr)} delegationHash={delegationHashes.get(child.ensLabel)} />
                ))}
              </div>
            </div>
          )}
          {children.filter((c) => !c.active).length > 0 && (
            <div>
              <details className="group">
                <summary className="flex items-center gap-3 mb-3 cursor-pointer list-none">
                  <h2 className="text-xs font-mono text-red-500/70 uppercase tracking-widest">
                    Terminated Agents ({children.filter((c) => !c.active).length})
                  </h2>
                  <div className="flex-1 h-px bg-red-500/20" />
                  <span className="text-xs text-gray-600 font-mono group-open:hidden">Show</span>
                  <span className="text-xs text-gray-600 font-mono hidden group-open:inline">Hide</span>
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 opacity-40">
                  {children.filter((c) => !c.active).slice(0, 12).map((child) => (
                    <AgentCard key={child.childAddr} child={child} justVoted={false} delegationHash={delegationHashes.get(`${child.ensLabel}:revoked`) ? "REVOKED" : delegationHashes.get(child.ensLabel)} />
                  ))}
                </div>
                {children.filter((c) => !c.active).length > 12 && (
                  <p className="text-xs text-gray-700 font-mono mt-2 text-center">
                    + {children.filter((c) => !c.active).length - 12} more terminated agents
                  </p>
                )}
              </details>
            </div>
          )}
        </>
      )}

      <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#0d0d14] border border-gray-800 rounded-full px-3 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" style={{ animationDuration: "2s" }} />
        <span className="text-xs font-mono text-gray-500">Live — 10s</span>
      </div>
    </div>
  );
}
