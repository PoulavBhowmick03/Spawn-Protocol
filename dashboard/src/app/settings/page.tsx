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
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-sm font-bold text-[#f5f5f0] uppercase tracking-widest">SYSTEM_OS</h1>
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            CONFIGURATION_LAYER_01 // READ_ONLY
          </span>
        </div>
        {emergencyPause && (
          <span className="font-mono text-[10px] text-[#ff3b3b] uppercase tracking-wider border border-[#ff3b3b]/30 px-2 py-1">
            ⚠ EMERGENCY_PAUSE_ACTIVE
          </span>
        )}
      </div>

      <div className="p-4 md:p-6">
        {error && (
          <div className="mb-4 border border-[#ff3b3b]/30 bg-[#ff3b3b]/5 px-4 py-3">
            <p className="text-[#ff3b3b] text-[11px] font-mono uppercase">ERROR: {error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Governance Values */}
          <div className="border border-white/[0.08] bg-[#0d0d14] p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-[#00ff88]" />
              <h2 className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                GOVERNANCE_VALUES
              </h2>
            </div>
            {loading ? (
              <div className="h-16 bg-white/[0.05] animate-pulse" />
            ) : governanceValues ? (
              <div className="bg-[#050508] border border-white/[0.08] p-4">
                <p className="text-[#f5f5f0]/80 text-[11px] leading-relaxed whitespace-pre-wrap font-mono">
                  {governanceValues}
                </p>
              </div>
            ) : (
              <p className="text-[#4a4f5e] font-mono text-[11px] uppercase">
                NO GOVERNANCE VALUES SET ON PARENT_TREASURY
              </p>
            )}
            <p className="font-mono text-[10px] text-[#4a4f5e] mt-3">
              STORED ONCHAIN — GUIDES ALL CHILD AGENT VOTING DECISIONS
            </p>
          </div>

          {/* Treasury Config */}
          <div className="border border-white/[0.08] bg-[#0d0d14] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-[#f5a623]" />
              <h2 className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                TREASURY_CONFIG
              </h2>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 bg-white/[0.05] animate-pulse" />
                ))}
              </div>
            ) : (
              <dl className="space-y-0">
                <div className="flex justify-between items-center py-2 border-b border-white/[0.08]">
                  <dt className="font-mono text-[10px] text-[#4a4f5e] uppercase">MAX_CHILDREN</dt>
                  <dd className="font-mono text-[11px] text-[#f5f5f0]">{maxChildren.toString()}</dd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/[0.08]">
                  <dt className="font-mono text-[10px] text-[#4a4f5e] uppercase">MAX_BUDGET_PER_CHILD</dt>
                  <dd className="font-mono text-[11px] text-[#f5f5f0]">
                    {(Number(maxBudgetPerChild) / 1e18).toFixed(4)} ETH
                  </dd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/[0.08]">
                  <dt className="font-mono text-[10px] text-[#4a4f5e] uppercase">EMERGENCY_PAUSE</dt>
                  <dd className={`font-mono text-[11px] font-bold ${emergencyPause ? "text-[#ff3b3b]" : "text-[#00ff88]"}`}>
                    {emergencyPause ? "PAUSED" : "OPERATIONAL"}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-2">
                  <dt className="font-mono text-[10px] text-[#4a4f5e] uppercase">PARENT_AGENT</dt>
                  <dd>
                    {parentAgent ? (
                      <a
                        href={explorerAddress(parentAgent)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11px] text-[#4a4f5e] hover:text-[#f5f5f0] transition-colors"
                      >
                        {formatAddress(parentAgent)} ↗
                      </a>
                    ) : (
                      <span className="font-mono text-[11px] text-[#4a4f5e]">NOT_SET</span>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {/* Contract Addresses */}
          <div className="border border-white/[0.08] bg-[#0d0d14] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-[#4a4f5e]" />
              <h2 className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                CONTRACT_ADDRESSES
              </h2>
            </div>
            <dl className="space-y-0">
              {Object.entries(CONTRACTS).map(([name, contract]) => (
                <div key={name} className="py-2 border-b border-white/[0.08] last:border-0">
                  <dt className="font-mono text-[10px] text-[#4a4f5e] uppercase mb-0.5">{name}</dt>
                  <dd>
                    <a
                      href={explorerAddress(contract.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-[#f5f5f0]/60 hover:text-[#f5f5f0] break-all transition-colors"
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
            <div className="border border-white/[0.08] bg-[#0d0d14] p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#4a4f5e]" />
                  <h2 className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                    ENS_REGISTRY — LIVE_SUBDOMAINS ({ensSubdomains.length})
                  </h2>
                </div>
                <a
                  href={`https://sepolia.basescan.org/address/${ENS_REGISTRY}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-[#4a4f5e] hover:text-[#f5f5f0] transition-colors"
                >
                  {ENS_REGISTRY.slice(0, 6)}…{ENS_REGISTRY.slice(-4)} ↗
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {ensSubdomains.map((sub) => (
                  <div key={sub.label} className="border border-white/[0.08] bg-[#0a0a0f] px-3 py-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-[#00ff88] truncate">{sub.label}.spawn.eth</span>
                      {sub.agentType && (
                        <span className="font-mono text-[9px] text-[#4a4f5e] border border-white/[0.08] px-1.5 py-0.5 shrink-0 uppercase">
                          {sub.agentType}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-[#4a4f5e] truncate">
                      <a
                        href={`https://sepolia.basescan.org/address/${sub.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[#f5f5f0] transition-colors"
                      >
                        {sub.address.slice(0, 6)}…{sub.address.slice(-4)} ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Write Actions */}
          <div className="border border-white/[0.08] bg-[#0d0d14] p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-[#f5a623]" />
              <h2 className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                WRITE_TRANSACTIONS
              </h2>
            </div>
            <p className="font-mono text-[11px] text-[#4a4f5e] mb-4">
              CONNECT WALLET AND INTERACT DIRECTLY WITH CONTRACTS ON BASE_SEPOLIA. DASHBOARD IS READ-ONLY.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`https://sepolia.basescan.org/address/${CONTRACTS.ParentTreasury.address}#writeContract`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 border border-[#f5a623]/30 text-[11px] font-mono text-[#f5a623] uppercase hover:bg-[#f5a623]/10 transition-colors"
              >
                SET_GOVERNANCE_VALUES ↗
              </a>
              <a
                href={`https://sepolia.basescan.org/address/${CONTRACTS.SpawnFactory.address}#writeContract`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 border border-[#00ff88]/30 text-[11px] font-mono text-[#00ff88] uppercase hover:bg-[#00ff88]/10 transition-colors"
              >
                SPAWN_CHILD ↗
            </a>
            <a
              href={`https://sepolia.basescan.org/address/${CONTRACTS.MockGovernor.address}#writeContract`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-white/[0.08] text-[11px] font-mono text-[#4a4f5e] uppercase hover:text-[#f5f5f0] hover:border-white/20 transition-colors"
            >
              CREATE_PROPOSAL ↗
            </a>
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 flex items-center gap-2 border border-white/[0.08] bg-[#0d0d14] px-3 py-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623] animate-pulse" />
        <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">LIVE — 15S</span>
      </div>
      </div>
    </div>
  );
}
