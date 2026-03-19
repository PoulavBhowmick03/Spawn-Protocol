"use client";

import { useTreasuryData } from "@/hooks/useTimeline";
import { CONTRACTS, explorerAddress, formatAddress } from "@/lib/contracts";

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

  return (
    <div className="p-8">
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
        <span className="text-xs font-mono text-gray-500">Live — 10s</span>
      </div>
    </div>
  );
}
