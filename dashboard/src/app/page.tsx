"use client";

import { type Address } from "viem";
import { useSwarmData, useSwarmMeta } from "@/hooks/useSwarmData";
import { AgentCard } from "@/components/AgentCard";
import { CONTRACTS, explorerAddress, formatAddress, storageViewerPath } from "@/lib/contracts";
import { useChainContext } from "@/context/ChainContext";

const ERC8004_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address;

export default function SwarmPage() {
  const { children, loading, error, justVotedSet } = useSwarmData({ includeMeta: false });
  const { meta } = useSwarmMeta();
  const { explorerBase } = useChainContext();
  const {
    budgetState,
    delegationHashes,
    revokedDelegations,
    filecoinIdentityCids,
    erc8004Ids,
    filecoinStateCid,
  } = meta;

  const activeChildren = children.filter((child) => child.active);
  const terminatedChildren = children.filter((child) => !child.active);
  const activeCount = activeChildren.length;
  const totalCount = children.length;
  const totalVotes = children.reduce((sum, child) => sum + Number(child.voteCount), 0);
  const avgAlignment =
    activeCount > 0
      ? Math.round(
          activeChildren.reduce((sum, child) => sum + Number(child.alignmentScore), 0) /
            activeCount
        )
      : 0;

  const activeLabels = new Set(activeChildren.map((child) => child.ensLabel));
  const activeDelegations = Array.from(delegationHashes.keys()).filter((label) =>
    activeLabels.has(label)
  ).length;
  const revokedDelegationCount = Array.from(revokedDelegations).filter((label) =>
    activeLabels.has(label)
  ).length;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-8">
        <div className="mb-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-mono font-bold tracking-tight text-green-400">
              Agent Swarm
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Autonomous DAO governance agents — Base Sepolia
            </p>
          </div>
          <div className="flex gap-4 text-center sm:gap-6">
            <div>
              <div className="text-2xl font-mono font-bold text-green-400 sm:text-3xl">
                {loading ? "…" : activeCount}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Active</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-blue-400 sm:text-3xl">
                {loading ? "…" : totalVotes}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Votes</div>
            </div>
            <div>
              <div
                className={`text-2xl font-mono font-bold sm:text-3xl ${
                  avgAlignment >= 70
                    ? "text-green-400"
                    : avgAlignment >= 40
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {loading ? "…" : `${avgAlignment}%`}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Alignment</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-gray-400 sm:text-3xl">
                {loading ? "…" : totalCount}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Total</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs font-mono text-gray-600">
          <span>
            SpawnFactory:{" "}
            <a
              href={`${explorerBase}/address/${CONTRACTS.SpawnFactory.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300"
            >
              {formatAddress(CONTRACTS.SpawnFactory.address)}
            </a>
          </span>
          <span>
            MockGovernor:{" "}
            <a
              href={explorerAddress(CONTRACTS.MockGovernor.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300"
            >
              {formatAddress(CONTRACTS.MockGovernor.address)}
            </a>
          </span>
          <span>
            ParentTreasury:{" "}
            <a
              href={`${explorerBase}/address/${CONTRACTS.ParentTreasury.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300"
            >
              {formatAddress(CONTRACTS.ParentTreasury.address)}
            </a>
          </span>
        </div>
      </div>

      {!loading && (
        <div className="mb-6 flex flex-wrap gap-3">
          {filecoinStateCid ? (
            <a
              href={storageViewerPath(filecoinStateCid)}
              className="flex items-center gap-2 rounded-lg border border-blue-400/40 bg-blue-400/8 px-4 py-2 transition-all hover:bg-blue-400/15"
              title="Swarm state snapshot stored on Filecoin Calibration Testnet via Synapse SDK"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              <span className="text-sm font-semibold text-blue-300">Filecoin</span>
              <span className="text-xs font-mono text-blue-200">State Snapshot Live</span>
              <span className="text-[10px] font-mono text-blue-400/70">
                {filecoinStateCid.slice(0, 14)}…
              </span>
              <span className="text-xs text-blue-400">↗</span>
            </a>
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/5 px-4 py-2"
              title="Filecoin Calibration storage activates when FILECOIN_PRIVATE_KEY is set"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400/40" />
              <span className="text-sm font-semibold text-blue-400/60">Filecoin</span>
              <span className="text-xs font-mono text-blue-300/50">Calibration Testnet</span>
              <span className="text-[10px] font-mono text-blue-400/30">chain 314159</span>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-400/5 px-4 py-2">
            <span className="text-sm text-orange-400">ERC-7715</span>
            <span className="text-xs font-mono text-orange-300">
              {activeDelegations > 0 ? `${activeDelegations} Active` : "Intent-Based Delegations"}
            </span>
            {revokedDelegationCount > 0 && (
              <span className="rounded border border-red-400/20 bg-red-400/5 px-1.5 py-0.5 text-[10px] font-mono text-red-400/80">
                {revokedDelegationCount} Revoked
              </span>
            )}
            <span className="text-[10px] font-mono text-orange-400/60">castVote() scoped</span>
          </div>

          <a
            href={`https://sepolia.basescan.org/address/${ERC8004_REGISTRY}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-400/5 px-4 py-2 transition-all hover:bg-indigo-400/10"
            title="ERC-8004 onchain agent identity registry on Base Sepolia"
          >
            <span className="text-sm text-indigo-400">ERC-8004</span>
            <span className="text-xs font-mono text-indigo-300">
              {erc8004Ids.size > 0
                ? `${erc8004Ids.size} agent${erc8004Ids.size !== 1 ? "s" : ""} registered`
                : "Onchain Identity"}
            </span>
            <span className="text-[10px] font-mono text-indigo-400/60">
              {ERC8004_REGISTRY.slice(0, 6)}…{ERC8004_REGISTRY.slice(-4)}
            </span>
            <span className="text-xs text-indigo-400">↗</span>
          </a>

          {budgetState && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${
                budgetState.context === "unavailable"
                  ? "border-gray-700 bg-gray-900/60"
                  : budgetState.policy === "paused"
                  ? "border-red-400/30 bg-red-400/5"
                  : budgetState.policy === "throttled"
                  ? "border-yellow-400/30 bg-yellow-400/5"
                  : "border-emerald-400/30 bg-emerald-400/5"
              }`}
              title="Runtime compute and execution budget policy tracked by the live swarm"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  budgetState.context === "unavailable"
                    ? "bg-gray-500"
                    : budgetState.policy === "paused"
                    ? "bg-red-400"
                    : budgetState.policy === "throttled"
                    ? "bg-yellow-400"
                    : "bg-emerald-400"
                }`}
              />
              <span
                className={`text-sm font-semibold ${
                  budgetState.context === "unavailable"
                    ? "text-gray-400"
                    : budgetState.policy === "paused"
                    ? "text-red-300"
                    : budgetState.policy === "throttled"
                    ? "text-yellow-300"
                    : "text-emerald-300"
                }`}
              >
                {budgetState.context === "unavailable" ? "Budget unavailable" : `Budget ${budgetState.policy}`}
              </span>
              {budgetState.context !== "unavailable" && (
                <>
                  <span className="text-xs font-mono text-gray-300">
                    {budgetState.parentEthBalance} ETH
                  </span>
                  <span className="text-[10px] font-mono text-gray-500">
                    Venice {budgetState.veniceTokens} tokens
                  </span>
                </>
              )}
              {budgetState.context === "unavailable" ? (
                <span className="text-[10px] font-mono text-gray-500">
                  waiting for live runtime budget
                </span>
              ) : budgetState.reasons.length > 0 && (
                <span className="text-[10px] font-mono text-gray-500">
                  {budgetState.reasons.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-mono text-red-400">Error: {error}</p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-800 bg-[#0d0d14] p-4 animate-pulse"
            >
              <div className="mb-3 h-4 w-2/3 rounded bg-gray-800" />
              <div className="mb-2 h-3 w-full rounded bg-gray-800" />
              <div className="mb-4 h-3 w-1/2 rounded bg-gray-800" />
              <div className="h-2 w-full rounded bg-gray-800" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && children.length === 0 && (
        <div className="rounded-lg border border-gray-800 p-12 text-center">
          <div className="mb-4 text-4xl">⬡</div>
          <h2 className="mb-2 font-mono text-lg text-gray-400">No agents spawned yet</h2>
          <p className="text-sm text-gray-600">
            The parent agent will spawn children when proposals are detected.
          </p>
          <p className="mt-4 text-xs font-mono text-gray-700">
            Polling SpawnFactory @ {formatAddress(CONTRACTS.SpawnFactory.address)}
          </p>
        </div>
      )}

      {!loading && children.length > 0 && (
        <>
          {activeChildren.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-xs font-mono uppercase tracking-widest text-gray-600">
                Active Agents ({activeChildren.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {activeChildren.map((child) => (
                  <AgentCard
                    key={child.childAddr}
                    child={child}
                    justVoted={justVotedSet.has(child.childAddr)}
                    delegationHash={
                      revokedDelegations.has(child.ensLabel)
                        ? "REVOKED"
                        : delegationHashes.get(child.ensLabel)
                    }
                    erc8004Id={erc8004Ids.get(child.childAddr.toLowerCase()) ?? null}
                    filecoinCid={filecoinIdentityCids.get(child.ensLabel) ?? null}
                  />
                ))}
              </div>
            </div>
          )}

          {terminatedChildren.length > 0 && (
            <div>
              <details className="group">
                <summary className="flex list-none items-center gap-3 mb-3 cursor-pointer">
                  <h2 className="text-xs font-mono uppercase tracking-widest text-red-500/70">
                    Terminated Agents ({terminatedChildren.length})
                  </h2>
                  <div className="h-px flex-1 bg-red-500/20" />
                  <span className="font-mono text-xs text-gray-600 group-open:hidden">Show</span>
                  <span className="hidden font-mono text-xs text-gray-600 group-open:inline">
                    Hide
                  </span>
                </summary>
                <div className="grid grid-cols-1 gap-3 opacity-40 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {terminatedChildren.slice(0, 12).map((child) => (
                    <AgentCard
                      key={child.childAddr}
                      child={child}
                      justVoted={false}
                      delegationHash={
                        revokedDelegations.has(child.ensLabel)
                          ? "REVOKED"
                          : delegationHashes.get(child.ensLabel)
                      }
                      erc8004Id={erc8004Ids.get(child.childAddr.toLowerCase()) ?? null}
                      filecoinCid={filecoinIdentityCids.get(child.ensLabel) ?? null}
                    />
                  ))}
                </div>
                {terminatedChildren.length > 12 && (
                  <p className="mt-2 text-center text-xs font-mono text-gray-700">
                    + {terminatedChildren.length - 12} more terminated agents
                  </p>
                )}
              </details>
            </div>
          )}
        </>
      )}

      <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full border border-gray-800 bg-[#0d0d14] px-3 py-1.5">
        <div
          className="h-1.5 w-1.5 animate-ping rounded-full bg-green-400"
          style={{ animationDuration: "2s" }}
        />
        <span className="text-xs font-mono text-gray-500">Live — 20s</span>
      </div>
    </div>
  );
}
