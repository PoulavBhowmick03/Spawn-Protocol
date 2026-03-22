"use client";

import { useState, useEffect } from "react";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { useTreasuryData } from "@/hooks/useTimeline";
import { CONTRACTS, explorerAddress, formatAddress } from "@/lib/contracts";

const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D" as const;
const ENS_REGISTRY_ABI = [
  { type: "function", name: "subdomainCount", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getAllSubdomains", inputs: [], outputs: [{ name: "names", type: "string[]" }, { name: "addresses", type: "address[]" }], stateMutability: "view" },
  { type: "function", name: "getTextRecord", inputs: [{ name: "label", type: "string" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;

const client = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });

export default function SettingsPage() {
  const {
    governanceValues,
    parentAgent,
    maxChildren,
    maxBudgetPerChild,
    emergencyPause,
    loading,
    error,
  } = useTreasuryData();

  const [ensSubdomains, setEnsSubdomains] = useState<Array<{ label: string; address: string; agentType: string }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const [, [names, addresses]] = await Promise.all([
          client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "subdomainCount" }),
          client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getAllSubdomains" }),
        ]);
        const data = await Promise.all(
          (names as string[]).map(async (label, i) => {
            const agentType = await client.readContract({ address: ENS_REGISTRY, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [label, "agentType"] }).catch(() => "");
            return { label, address: (addresses as string[])[i], agentType: agentType as string };
          })
        );
        setEnsSubdomains(data);
      } catch {}
    })();
  }, []);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-mono font-bold text-yellow-400 tracking-tight">
          Owner Panel
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          ParentTreasury configuration and governance values
        </p>
      </div>

      {error && (
        <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm font-mono">Error: {error}</p>
        </div>
      )}

      {emergencyPause && (
        <div className="mb-6 border border-red-500/60 bg-red-500/20 rounded-lg px-4 py-3">
          <p className="text-red-300 font-mono font-bold">EMERGENCY PAUSE ACTIVE — all agent operations suspended</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Governance Values */}
        <div className="border border-gray-800 rounded-lg p-6 bg-[#0d0d14] lg:col-span-2">
          <h2 className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-4">
            Governance Values
          </h2>
          {loading ? (
            <div className="h-20 bg-gray-800 rounded animate-pulse" />
          ) : governanceValues ? (
            <div className="bg-[#0a0a0f] border border-yellow-400/20 rounded-lg p-4">
              <p className="text-yellow-100 text-sm leading-relaxed whitespace-pre-wrap font-mono">
                {governanceValues}
              </p>
            </div>
          ) : (
            <p className="text-gray-600 italic font-mono text-sm">
              No governance values set on ParentTreasury
            </p>
          )}
          <p className="text-xs text-gray-700 mt-3">
            These values are stored onchain and guide all child agent voting decisions.
            The parent agent reads this and uses Venice AI to evaluate child alignment.
          </p>
        </div>

        {/* Treasury Config */}
        <div className="border border-gray-800 rounded-lg p-6 bg-[#0d0d14]">
          <h2 className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-4">
            Treasury Configuration
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <dl className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-800">
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Max Children</dt>
                <dd className="font-mono text-white">{maxChildren.toString()}</dd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-800">
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Max Budget / Child</dt>
                <dd className="font-mono text-white">
                  {(Number(maxBudgetPerChild) / 1e18).toFixed(4)} ETH
                </dd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-800">
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Emergency Pause</dt>
                <dd className={`font-mono font-bold ${emergencyPause ? "text-red-400" : "text-green-400"}`}>
                  {emergencyPause ? "PAUSED" : "Operational"}
                </dd>
              </div>
              <div className="flex justify-between items-center py-2">
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Parent Agent</dt>
                <dd>
                  {parentAgent ? (
                    <a
                      href={explorerAddress(parentAgent)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-400 hover:text-blue-300"
                    >
                      {formatAddress(parentAgent)} ↗
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-gray-600">Not set</span>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Contract Addresses */}
        <div className="border border-gray-800 rounded-lg p-6 bg-[#0d0d14]">
          <h2 className="text-xs font-mono text-gray-600 uppercase tracking-widest mb-4">
            Deployed Contracts
          </h2>
          <dl className="space-y-3">
            {Object.entries(CONTRACTS).map(([name, contract]) => (
              <div key={name} className="py-2 border-b border-gray-800 last:border-0">
                <dt className="text-xs text-gray-500 uppercase tracking-wider mb-1">{name}</dt>
                <dd>
                  <a
                    href={explorerAddress(contract.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-blue-400 hover:text-blue-300 break-all"
                  >
                    {contract.address} ↗
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ENS Registry — Live Subdomains */}
        {ensSubdomains.length > 0 && (
          <div className="border border-teal-400/20 rounded-lg p-6 bg-teal-400/5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-mono text-teal-400 uppercase tracking-widest">
                ENS Registry — Live Subdomains ({ensSubdomains.length})
              </h2>
              <a
                href={`https://sepolia.basescan.org/address/${ENS_REGISTRY}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono text-teal-400/60 hover:text-teal-400 transition-colors"
              >
                SpawnENSRegistry {ENS_REGISTRY.slice(0, 6)}…{ENS_REGISTRY.slice(-4)} ↗
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ensSubdomains.map((sub) => (
                <div key={sub.label} className="border border-teal-400/10 bg-[#0d0d14] rounded-md px-3 py-2 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-teal-300 truncate">{sub.label}.spawn.eth</span>
                    {sub.agentType && (
                      <span className="text-[10px] font-mono text-teal-400/60 border border-teal-400/20 rounded px-1.5 py-0.5 shrink-0">
                        {sub.agentType}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-gray-600 truncate">
                    addr:{" "}
                    <a
                      href={`https://sepolia.basescan.org/address/${sub.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300"
                    >
                      {sub.address.slice(0, 6)}…{sub.address.slice(-4)}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Write Actions Notice */}
        <div className="border border-yellow-400/20 rounded-lg p-6 bg-yellow-400/5 lg:col-span-2">
          <h2 className="text-xs font-mono text-yellow-400 uppercase tracking-widest mb-3">
            Write Transactions
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            To update governance values or spawn new children, connect a wallet and interact
            directly with the contracts on Base Sepolia. The dashboard is read-only.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`https://sepolia.basescan.org/address/${CONTRACTS.ParentTreasury.address}#writeContract`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-yellow-400/30 rounded-lg text-sm font-mono text-yellow-400 hover:bg-yellow-400/10 transition-colors"
            >
              Set Governance Values ↗
            </a>
            <a
              href={`https://sepolia.basescan.org/address/${CONTRACTS.SpawnFactory.address}#writeContract`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-green-400/30 rounded-lg text-sm font-mono text-green-400 hover:bg-green-400/10 transition-colors"
            >
              Spawn Child ↗
            </a>
            <a
              href={`https://sepolia.basescan.org/address/${CONTRACTS.MockGovernor.address}#writeContract`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-blue-400/30 rounded-lg text-sm font-mono text-blue-400 hover:bg-blue-400/10 transition-colors"
            >
              Create Proposal ↗
            </a>
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#0d0d14] border border-gray-800 rounded-full px-3 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" style={{ animationDuration: "2s" }} />
        <span className="text-xs font-mono text-gray-500">Live — 15s</span>
      </div>
    </div>
  );
}
