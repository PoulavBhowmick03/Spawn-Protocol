"use client";

import { useState, useEffect } from "react";
import { type Address } from "viem";
import { useSwarmData } from "@/hooks/useSwarmData";
import { AgentCard } from "@/components/AgentCard";
import { CONTRACTS, explorerAddress, formatAddress } from "@/lib/contracts";
import { useChainContext } from "@/context/ChainContext";

// ENS Registry for reading IPFS CID, delegation hashes, subdomain count, and subdomain list
const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D";
const ENS_REGISTRY_ABI = [
  { type: "function", name: "getTextRecord", inputs: [{ name: "label", type: "string" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "subdomainCount", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getAllSubdomains", inputs: [], outputs: [{ name: "names", type: "string[]" }, { name: "addresses", type: "address[]" }], stateMutability: "view" },
] as const;

// ERC-8004 Agent Registry on Base Sepolia
// Our tokens start at ~2200 on the shared public registry (confirmed via register-all-agents.ts)
const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;
const ERC8004_DEPLOYER = "0x15896e731c51ecB7BdB1447600DF126ea1d6969A".toLowerCase();
const ERC8004_SCAN_START = 2200;
const ERC8004_SCAN_END = 2900; // covers 700 slots — well above current agent count
const ERC8004_TOKEN_ABI = [
  { type: "function", name: "ownerOf", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "tokenURI", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;

// Module-level cache for ERC-8004 scan results — survives strict mode double-mounts
let erc8004IdsCache = new Map<string, bigint>();

export default function SwarmPage() {
  const { children, loading, error, justVotedSet } = useSwarmData();
  const { client, explorerBase } = useChainContext();
  const [ipfsCid, setIpfsCid] = useState<string | null>(null);
  const [filecoinStateCid, setFilecoinStateCid] = useState<string | null>(null);
  const [filecoinAgentLogCid, setFilecoinAgentLogCid] = useState<string | null>(null);
  const [delegationHashes, setDelegationHashes] = useState<Map<string, string>>(new Map());
  const [ensSubdomainCount, setEnsSubdomainCount] = useState<number | null>(null);
  // Maps child contract address (lowercase) → ERC-8004 agentId
  // Module-level cache to survive strict mode double-mounts
  const [erc8004Ids, setErc8004Ids] = useState<Map<string, bigint>>(erc8004IdsCache);
  // Maps child ensLabel → filecoin.identity CID
  const [filecoinIdentityCids, setFilecoinIdentityCids] = useState<Map<string, string>>(new Map());

  // Fetch IPFS CID from ENS text record
  useEffect(() => {
    client.readContract({
      address: ENS_REGISTRY,
      abi: ENS_REGISTRY_ABI,
      functionName: "getTextRecord",
      args: ["parent", "ipfs.agent_log"],
    }).then((cid) => { if (cid) setIpfsCid(cid as string); }).catch(() => {});
  }, [client]);

  // Fetch Filecoin CIDs from ENS text records (state snapshot + agent log)
  useEffect(() => {
    const fetch = async () => {
      try {
        const [stateCid, logCid] = await Promise.all([
          client.readContract({
            address: ENS_REGISTRY,
            abi: ENS_REGISTRY_ABI,
            functionName: "getTextRecord",
            args: ["parent", "filecoin.state"],
          }),
          client.readContract({
            address: ENS_REGISTRY,
            abi: ENS_REGISTRY_ABI,
            functionName: "getTextRecord",
            args: ["parent", "filecoin.agent_log"],
          }),
        ]);
        if (stateCid) setFilecoinStateCid(stateCid as string);
        if (logCid) setFilecoinAgentLogCid(logCid as string);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 60_000);
    return () => clearInterval(interval);
  }, [client]);

  // Fetch delegation hashes + revocation status for all children (parallel)
  useEffect(() => {
    const fetchDelegations = async () => {
      const map = new Map<string, string>();
      await Promise.all(
        children.flatMap((child) => [
          client.readContract({
            address: ENS_REGISTRY,
            abi: ENS_REGISTRY_ABI,
            functionName: "getTextRecord",
            args: [child.ensLabel, "erc7715.delegation"],
          }).then((hash) => { if (hash) map.set(child.ensLabel, hash as string); }).catch(() => {}),
          client.readContract({
            address: ENS_REGISTRY,
            abi: ENS_REGISTRY_ABI,
            functionName: "getTextRecord",
            args: [child.ensLabel, "erc7715.delegation.revoked"],
          }).then((revoked) => { if (revoked) map.set(`${child.ensLabel}:revoked`, revoked as string); }).catch(() => {}),
        ])
      );
      if (map.size > 0) setDelegationHashes(map);
    };
    if (children.length > 0) fetchDelegations();
  }, [children, client]);

  // Fetch filecoin.identity CID per agent from ENS text records
  useEffect(() => {
    if (children.length === 0) return;
    const fetchFilecoinIdentities = async () => {
      const map = new Map<string, string>();
      await Promise.all(
        children.map((child) =>
          client.readContract({
            address: ENS_REGISTRY,
            abi: ENS_REGISTRY_ABI,
            functionName: "getTextRecord",
            args: [child.ensLabel, "filecoin.identity"],
          }).then((cid) => { if (cid) map.set(child.ensLabel, cid as string); }).catch(() => {})
        )
      );
      if (map.size > 0) setFilecoinIdentityCids(map);
    };
    fetchFilecoinIdentities();
  }, [children, client]);

  // Build childAddr → ERC-8004 agentId map by scanning the registry.
  // Our tokens live at IDs ~2200+ on the shared public registry.
  // Match by parsing the ENS label from tokenURI (base64 JSON name field)
  // and comparing against child.ensLabel. Filter to our deployer address only.
  // Scan runs ONCE per set of child labels — cached via ref to survive re-renders.
  const childLabelsKey = children.map((c) => c.ensLabel).sort().join(",");
  useEffect(() => {
    if (children.length === 0 || erc8004IdsCache.size > 0) return;
    const labelToAddr = new Map(children.flatMap((c) => {
      const label = c.ensLabel.toLowerCase();
      const base = label.replace(/-v\d+$/, "");
      const addr = c.childAddr.toLowerCase();
      return base !== label ? [[label, addr], [base, addr]] as [string, string][] : [[label, addr]] as [string, string][];
    }));
    let cancelled = false;
    (async () => {
      const map = new Map<string, bigint>();
      for (let batchStart = ERC8004_SCAN_START; batchStart <= ERC8004_SCAN_END; batchStart += 20) {
        if (cancelled) return;
        const batchEnd = Math.min(batchStart + 19, ERC8004_SCAN_END);
        const ids = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => BigInt(batchStart + i));
        const [owners, uris] = await Promise.all([
          Promise.all(ids.map((id) => client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_TOKEN_ABI, functionName: "ownerOf", args: [id] }).catch(() => null))),
          Promise.all(ids.map((id) => client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_TOKEN_ABI, functionName: "tokenURI", args: [id] }).catch(() => null))),
        ]);

        let allNull = true;
        owners.forEach((owner, idx) => {
          if (owner) allNull = false;
          if (!owner || (owner as string).toLowerCase() !== ERC8004_DEPLOYER) return;
          const rawUri = uris[idx] as string | null;
          if (!rawUri) return;
          // tokenURI may be base64-encoded JSON: data:application/json;base64,...
          let uri = rawUri;
          if (uri.startsWith("data:application/json;base64,")) {
            try { uri = JSON.parse(atob(uri.slice(29))).name || uri; } catch {}
          }
          const match = uri.match(/^spawn:\/\/([^.?]+)\.spawn\.eth/);
          if (!match) return;
          const label = match[1].toLowerCase();
          const addr = labelToAddr.get(label);
          if (addr) map.set(addr, ids[idx]);
        });

        // Stop early if we've passed the minted range or matched everyone
        if (allNull || map.size >= labelToAddr.size) break;
      }
      if (map.size > 0 && !cancelled) {
        erc8004IdsCache = map;
        setErc8004Ids(map);
      }
    })();
    return () => { cancelled = true; };
  }, [childLabelsKey, client]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch ENS subdomain count for the badge
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const count = await client.readContract({
          address: ENS_REGISTRY,
          abi: ENS_REGISTRY_ABI,
          functionName: "subdomainCount",
        });
        setEnsSubdomainCount(Number(count));
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [client]);

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
              Autonomous DAO governance agents — Base Sepolia
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
            <a href={`${explorerBase}/address/${CONTRACTS.SpawnFactory.address}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
              {formatAddress(CONTRACTS.SpawnFactory.address)}
            </a>
          </span>
          <span>
            MockGovernor:{" "}
            <a href={explorerAddress(CONTRACTS.MockGovernor.address)} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
              {formatAddress(CONTRACTS.MockGovernor.address)}
            </a>
          </span>
          <span>
            ParentTreasury:{" "}
            <a href={`${explorerBase}/address/${CONTRACTS.ParentTreasury.address}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
              {formatAddress(CONTRACTS.ParentTreasury.address)}
            </a>
          </span>
        </div>
      </div>

      {/* Filecoin + IPFS + Delegation + ENS Status Bar */}
      {!loading && (
        <>
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Filecoin Calibration — state snapshot badge */}
          {filecoinStateCid ? (
            <a
              href={`https://calibration.filfox.info/en/deal/${encodeURIComponent(filecoinStateCid)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-blue-400/40 bg-blue-400/8 rounded-lg px-4 py-2 hover:bg-blue-400/15 transition-all"
              title="Swarm state snapshot stored on Filecoin Calibration Testnet via Synapse SDK"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-300 text-sm font-semibold">Filecoin</span>
              <span className="text-xs font-mono text-blue-200">State Snapshot Live</span>
              <span className="text-[10px] font-mono text-blue-400/70">{filecoinStateCid.slice(0, 14)}…</span>
              <span className="text-blue-400 text-xs">↗</span>
            </a>
          ) : (
            <div
              className="flex items-center gap-2 border border-blue-400/20 bg-blue-400/5 rounded-lg px-4 py-2"
              title="Filecoin Calibration storage activates when FILECOIN_PRIVATE_KEY is set"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400/40" />
              <span className="text-blue-400/60 text-sm font-semibold">Filecoin</span>
              <span className="text-xs font-mono text-blue-300/50">Calibration Testnet</span>
              <span className="text-[10px] font-mono text-blue-400/30">chain 314159</span>
            </div>
          )}
          {/* Filecoin agent log badge */}
          {filecoinAgentLogCid && (
            <a
              href={`https://calibration.filfox.info/en/deal/${encodeURIComponent(filecoinAgentLogCid)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-cyan-400/30 bg-cyan-400/5 rounded-lg px-4 py-2 hover:bg-cyan-400/10 transition-all"
              title="Agent execution log stored on Filecoin via Synapse SDK"
            >
              <span className="text-cyan-400 text-sm">FIL Log</span>
              <span className="text-xs font-mono text-cyan-300">Agent Log on Filecoin</span>
              <span className="text-[10px] font-mono text-cyan-400/60">{filecoinAgentLogCid.slice(0, 12)}…</span>
              <span className="text-cyan-400 text-xs">↗</span>
            </a>
          )}
          {ipfsCid && (
            <a
              href={`https://ipfs.filebase.io/ipfs/${ipfsCid}`}
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
            const activeLabels = new Set(children.filter(c => c.active).map(c => c.ensLabel));
            const activeDels = Array.from(delegationHashes.keys()).filter(k => !k.includes(":revoked") && activeLabels.has(k)).length;
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

          {/* ERC-8004 registry badge */}
          <a
            href={`https://sepolia.basescan.org/address/${ERC8004_REGISTRY}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-indigo-400/30 bg-indigo-400/5 rounded-lg px-4 py-2 hover:bg-indigo-400/10 transition-all"
            title="ERC-8004 onchain agent identity registry on Base Sepolia"
          >
            <span className="text-indigo-400 text-sm">ERC-8004</span>
            <span className="text-xs font-mono text-indigo-300">
              {erc8004Ids.size > 0 ? `${erc8004Ids.size} agent${erc8004Ids.size !== 1 ? "s" : ""} registered` : "Onchain Identity"}
            </span>
            <span className="text-[10px] font-mono text-indigo-400/60">{ERC8004_REGISTRY.slice(0, 6)}…{ERC8004_REGISTRY.slice(-4)}</span>
            <span className="text-indigo-400 text-xs">↗</span>
          </a>

          {/* ENS Registry live badge */}
          <a
            href={`https://sepolia.basescan.org/address/${ENS_REGISTRY}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-teal-400/30 bg-teal-400/5 rounded-lg px-4 py-2 hover:bg-teal-400/10 transition-all"
          >
            <span className="text-teal-400 text-sm">ENS</span>
            <span className="text-xs font-mono text-teal-300">
              {`${activeCount} active agent subdomain${activeCount !== 1 ? "s" : ""} on spawn.eth`}
            </span>
            <span className="text-[10px] font-mono text-teal-400/60">SpawnENSRegistry {ENS_REGISTRY.slice(0, 6)}…{ENS_REGISTRY.slice(-4)}</span>
            <span className="text-teal-400 text-xs">↗</span>
          </a>
        </div>

        </>
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
          <p className="text-xs font-mono text-gray-700 mt-4">Polling SpawnFactory @ {formatAddress(CONTRACTS.SpawnFactory.address)}</p>
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
                  <AgentCard key={child.childAddr} child={child} justVoted={justVotedSet.has(child.childAddr)} delegationHash={delegationHashes.get(child.ensLabel)} erc8004Id={erc8004Ids.get(child.childAddr.toLowerCase()) ?? null} filecoinCid={filecoinIdentityCids.get(child.ensLabel) ?? null} />
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
                    <AgentCard key={child.childAddr} child={child} justVoted={false} delegationHash={delegationHashes.get(`${child.ensLabel}:revoked`) ? "REVOKED" : delegationHashes.get(child.ensLabel)} erc8004Id={erc8004Ids.get(child.childAddr.toLowerCase()) ?? null} filecoinCid={filecoinIdentityCids.get(child.ensLabel) ?? null} />
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
        <span className="text-xs font-mono text-gray-500">Live — 15s</span>
      </div>
    </div>
  );
}
